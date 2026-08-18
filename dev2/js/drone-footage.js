// ---------------------------------------------------------------------------
// Drone Footage -- Nathan: "we also use a drone to record a lot of our
// practice plays. Under practices - there should be an option for the coach
// to click on an Drone Upload button and have the ability to upload all the
// video segments. They should appear with an editable title - run time and
// the ability to reorder them or write in comments. These videos should be
// visible to players and coaches when they click on the practice from the
// list. It can appear as the Drone footage section at the bottom of an
// accordion of all the videos to click and view. Give slow 1/2 speed
// playback option on it. ability to leave a comment with your username and
// time stamped." Clips are iPhone-shot, ~4-6MB/10-20sec each, uploaded
// straight from the app, multiple at once.
//
// Firebase Storage would've been the natural fit for real video files, but
// Nathan declined the Blaze (pay-as-you-go) plan upgrade Storage now
// requires -- so this uses the same "downscale/encode client-side, embed as
// base64 in Realtime Database JSON" trick every other upload in this app
// already uses (player photos, opponent logos, field photos), just at
// video scale instead of tiny-image scale, on the existing free Spark plan.
//
// IMPORTANT tradeoffs, on purpose, given that choice:
//   - No real video streaming/seeking -- the whole clip has to download
//     before <video> can play or scrub, unlike a real CDN-backed host.
//   - Spark's free tier caps at 1GB stored / 10GB downloaded per month.
//     A clip only costs its ~4-8MB (base64 inflates ~33% over the raw
//     file) once in storage, but EVERY time someone opens/plays it, that's
//     another ~4-8MB against the monthly download allowance -- a
//     well-watched clip could add up faster than you'd expect.
//   - To keep this from being worse than it has to be, video bytes are
//     NOT embedded in the practice record itself (practices.json is a
//     whole-array PUT on every single save -- see practices.js -- so
//     embedding video there would mean every unrelated edit, even to a
//     different practice entirely, re-sends every clip's video data).
//     Instead each clip's video lives at its own dedicated RTDB path,
//     droneVideos/{clipId}, written/read/deleted with a PUT/GET/DELETE
//     scoped to just that one leaf -- practices.json only ever holds
//     small text metadata (title, duration, order, uploadedBy, comments),
//     regardless of how many clips exist. Video data is also only fetched
//     lazily, the first time a clip's accordion item is opened (cached in
//     memory after that), not for every clip up front.
//
// ONE-TIME SETUP THIS STILL NEEDS in the Firebase Console (Realtime
// Database > Rules) that this file can't do for you: your existing rules
// almost certainly allowlist specific top-level paths (schedule,
// practices, roster, etc.) rather than a catch-all, so this brand-new
// droneVideos path needs its own entry added, matching whatever rule
// already covers "practices" -- something like:
//   "droneVideos": { ".read": "auth != null", ".write": "auth != null" }
// If you're not sure what your current rules look like, open the Rules
// tab and paste them into chat -- I'll tell you exactly what to add.
//
// Video metadata (title, duration, order, uploadedBy/At, comments) lives
// on the practice record itself (practice.droneClips, see practices.js),
// saved through window.saveDroneClips(), a narrow write path practices.js
// exposes so a player leaving a comment doesn't need the full coach-only
// edit form (same pattern as roster.js's updateRosterPlayerNum for parent
// jersey-# edits).
// ---------------------------------------------------------------------------
(function () {
  const DRONE_VIDEOS_URL = `${FIREBASE_DB_URL}/droneVideos`;

  // Nathan: "only one video should be expanded at a time." Single id, not
  // a set -- opening one always closes whatever else was open, matching
  // how the Play Calls accordion (the shared .accordion-item CSS this
  // reuses) already behaves.
  let openClipId = null;
  const loadedVideos = new Map();  // clipId -> base64 data URL, fetched lazily and cached for this session
  const loadingClipIds = new Set(); // clipId currently mid-fetch, so re-renders don't double-request

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  function genClipId() {
    return 'dc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function currentUserName() {
    const session = window.PlayerIdentity && window.PlayerIdentity.getSession ? window.PlayerIdentity.getSession() : null;
    return (session && session.name) || 'Someone';
  }
  function fmtDuration(sec) {
    if (sec === null || sec === undefined || sec === '' || isNaN(sec)) return '';
    const s = Math.round(sec);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, '0')}`;
  }
  // Accepts "M:SS", "MM:SS", or a bare number of seconds -- whatever a
  // coach types to correct an auto-detected run time.
  function parseDuration(str) {
    const s = (str || '').trim();
    if (!s) return null;
    const m = s.match(/^(\d+):(\d{1,2})$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    const n = Number(s);
    return isNaN(n) ? null : n;
  }
  function fmtWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' at ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  // ---- Video blob storage: dedicated RTDB path, one PUT/GET/DELETE per
  // clip (never bundled into practices.json's whole-array PUT -- see
  // header comment) ----
  function fileToVideoDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  function saveVideoBlob(clipId, dataUrl, onOk, onFail) {
    window.firebaseAuthed(`${DRONE_VIDEOS_URL}/${clipId}.json`).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataUrl),
    })).then(r => { if (r.ok) onOk(); else onFail(`HTTP ${r.status}`); })
      .catch(err => onFail(err.message || String(err)));
  }
  function loadVideoBlob(clipId, onOk, onFail) {
    window.firebaseAuthed(`${DRONE_VIDEOS_URL}/${clipId}.json`).then(url => fetch(url))
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(dataUrl => { if (dataUrl) onOk(dataUrl); else onFail('Video not found -- it may not have finished uploading.'); })
      .catch(err => onFail(err.message || String(err)));
  }
  function deleteVideoBlob(clipId) {
    window.firebaseAuthed(`${DRONE_VIDEOS_URL}/${clipId}.json`).then(url => fetch(url, { method: 'DELETE' }))
      .catch(err => console.error('Drone clip video delete failed:', err));
  }
  // Browsers can read a video's duration straight out of the container
  // header without a real upload/transcode -- used to auto-fill "run time"
  // (still editable afterward in case a clip's metadata is unusual).
  function readDuration(file) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      const objUrl = URL.createObjectURL(file);
      v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(objUrl); resolve(isFinite(d) ? d : null); };
      v.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null); };
      v.src = objUrl;
    });
  }

  function sortedClips(practice) {
    return (Array.isArray(practice.droneClips) ? practice.droneClips.slice() : []).sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function saveClips(practice, clips, afterOk, afterFail) {
    practice.droneClips = clips;
    if (window.saveDroneClips) window.saveDroneClips(practice.id, clips, afterOk, afterFail);
  }

  // ---- Upload (coach only) ----
  function uploadBatch(practice, files, statusEl) {
    const total = files.length;
    const next = (i) => {
      if (i >= files.length) {
        statusEl.textContent = `Uploaded ${total} clip${total !== 1 ? 's' : ''}.`;
        return;
      }
      statusEl.textContent = `Uploading ${i + 1} of ${total}…`;
      const file = files[i];
      readDuration(file).then(durationSec => {
        const clipId = genClipId();
        fileToVideoDataUrl(file).then(dataUrl => {
          saveVideoBlob(clipId, dataUrl, () => {
            const clips = sortedClips(practice);
            const maxOrder = clips.reduce((m, c) => Math.max(m, c.order || 0), -1);
            clips.push({
              id: clipId,
              title: (file.name || 'Drone Clip').replace(/\.[^.]+$/, '') || 'Drone Clip',
              durationSec,
              order: maxOrder + 1,
              uploadedBy: currentUserName(),
              uploadedAt: new Date().toISOString(),
              comments: [],
            });
            saveClips(practice, clips, () => {
              renderDroneFootageSection(practice);
              next(i + 1);
            }, msg => { statusEl.textContent = `Clip ${i + 1} save failed: ${msg}`; next(i + 1); });
          }, msg => { statusEl.textContent = `Clip ${i + 1} upload failed: ${msg}`; next(i + 1); });
        }).catch(() => { statusEl.textContent = `Clip ${i + 1}: could not read that file.`; next(i + 1); });
      });
    };
    next(0);
  }

  // Kicks off (or reuses an in-flight/cached) fetch of one clip's video
  // data, re-rendering once it lands. Called when a clip's accordion item
  // is opened -- not up front for every clip on the practice.
  function ensureVideoLoaded(practice, clipId) {
    if (loadedVideos.has(clipId) || loadingClipIds.has(clipId)) return;
    loadingClipIds.add(clipId);
    loadVideoBlob(clipId, dataUrl => {
      loadingClipIds.delete(clipId);
      loadedVideos.set(clipId, dataUrl);
      renderDroneFootageSection(practice);
    }, msg => {
      loadingClipIds.delete(clipId);
      loadedVideos.set(clipId, null); // remember the failure so it doesn't retry-loop on every render
      console.error('Drone clip video load failed:', msg);
      renderDroneFootageSection(practice);
    });
  }

  // ---- Clip actions (event-delegated from the list container) ----
  function wireActions(practice, listEl) {
    listEl.addEventListener('click', (e) => {
      const header = e.target.closest('.accordion-header');
      if (header) {
        const item = header.closest('.accordion-item');
        const id = item && item.dataset.clipId;
        if (id) {
          if (openClipId === id) { openClipId = null; renderDroneFootageSection(practice); }
          else { openClipId = id; renderDroneFootageSection(practice); ensureVideoLoaded(practice, id); }
        }
        return;
      }
      const speedBtn = e.target.closest('.droneSpeedBtn');
      if (speedBtn) {
        const body = speedBtn.closest('.accordion-body');
        const video = body && body.querySelector('video');
        if (video) video.playbackRate = Number(speedBtn.dataset.speed);
        body.querySelectorAll('.droneSpeedBtn').forEach(b => b.classList.toggle('active', b === speedBtn));
        return;
      }
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      const clipId = actionBtn.dataset.clipId;
      const action = actionBtn.dataset.action;
      const clips = sortedClips(practice);
      const idx = clips.findIndex(c => c.id === clipId);
      if (idx === -1 && action !== 'post-comment') return;

      if (action === 'save-title') {
        const body = actionBtn.closest('.accordion-body');
        const titleInput = body.querySelector('.droneTitleInput');
        const durInput = body.querySelector('.droneDurationInput');
        clips[idx].title = titleInput.value.trim() || 'Drone Clip';
        const parsed = parseDuration(durInput.value);
        if (parsed !== null) clips[idx].durationSec = parsed;
        saveClips(practice, clips, () => renderDroneFootageSection(practice));
      } else if (action === 'move-up' || action === 'move-down') {
        const swapWith = action === 'move-up' ? idx - 1 : idx + 1;
        if (swapWith < 0 || swapWith >= clips.length) return;
        const a = clips[idx].order || 0, b = clips[swapWith].order || 0;
        clips[idx].order = b; clips[swapWith].order = a;
        saveClips(practice, clips, () => renderDroneFootageSection(practice));
      } else if (action === 'delete-clip') {
        if (!confirm(`Delete "${clips[idx].title || 'this clip'}"? This can't be undone.`)) return;
        deleteVideoBlob(clips[idx].id);
        clips.splice(idx, 1);
        if (openClipId === clipId) openClipId = null;
        loadedVideos.delete(clipId);
        saveClips(practice, clips, () => renderDroneFootageSection(practice));
      } else if (action === 'post-comment') {
        const body = actionBtn.closest('.accordion-body');
        const input = body.querySelector('.droneCommentInput');
        const text = input.value.trim();
        if (!text) return;
        const target = clips.find(c => c.id === clipId);
        if (!target) return;
        if (!Array.isArray(target.comments)) target.comments = [];
        target.comments.push({ id: genClipId(), author: currentUserName(), text, at: new Date().toISOString() });
        input.value = '';
        saveClips(practice, clips, () => renderDroneFootageSection(practice));
      }
    });
  }

  function clipHtml(clip, approved) {
    const open = openClipId === clip.id;
    const comments = Array.isArray(clip.comments) ? clip.comments : [];
    const commentsHtml = comments.length
      ? comments.map(c => `
          <div style="padding:6px 0;border-top:1px solid rgba(128,128,128,.25);">
            <span style="font-weight:700;">${escapeHtml(c.author || 'Someone')}</span>
            <span class="lbSub" style="margin-left:6px;">${escapeHtml(fmtWhen(c.at))}</span>
            <div style="margin-top:2px;">${escapeHtml(c.text)}</div>
          </div>`).join('')
      : '<div class="lbSub" style="padding:4px 0;">No comments yet.</div>';

    // Video area: only actually fetched (and rendered as a real <video>)
    // once this item has been opened -- see ensureVideoLoaded. Before
    // that (or while mid-fetch) it's just a lightweight placeholder so
    // opening a practice with several clips doesn't pull every video's
    // multi-MB payload at once.
    let videoHtml;
    if (loadedVideos.has(clip.id)) {
      const dataUrl = loadedVideos.get(clip.id);
      videoHtml = dataUrl
        ? `<video src="${dataUrl}" controls playsinline style="width:100%;border-radius:8px;background:#000;display:block;"></video>`
        : `<div class="lbEmpty">Couldn't load this clip's video.</div>`;
    } else if (open) {
      videoHtml = `<div class="lbEmpty">Loading video…</div>`;
    } else {
      videoHtml = `<div class="lbEmpty">Tap to load video.</div>`;
    }

    // Nathan: "video tabs need to be smaller." Inline overrides only --
    // deliberately not touching the shared .accordion-header/.accordion-body
    // CSS classes, since Play Calls uses those same classes and shouldn't
    // shrink along with these.
    return `
      <div class="accordion-item${open ? ' open' : ''}" data-clip-id="${clip.id}">
        <button type="button" class="accordion-header" style="padding:9px 12px;font-size:13px;font-style:normal;font-weight:700;">
          <span>🎥 ${escapeHtml(clip.title || 'Drone Clip')}${clip.durationSec ? ` <span class="lbSub" style="font-weight:400;">(${fmtDuration(clip.durationSec)})</span>` : ''}</span>
          <span class="accordion-chevron">▾</span>
        </button>
        <div class="accordion-body" style="padding:8px;">
          ${approved ? `
            <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
              <input type="text" class="droneTitleInput" placeholder="Title" value="${escapeHtml(clip.title || '')}" style="flex:2 1 140px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
              <input type="text" class="droneDurationInput" placeholder="M:SS" value="${clip.durationSec ? fmtDuration(clip.durationSec) : ''}" style="flex:1 1 70px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
              <button type="button" class="navBtn" data-action="save-title" data-clip-id="${clip.id}" style="padding:8px 12px;flex:0 0 auto;">Save</button>
            </div>
            <div style="display:flex;gap:6px;margin-bottom:10px;justify-content:center;flex-wrap:wrap;">
              <button type="button" class="lbLinkBtn" data-action="move-up" data-clip-id="${clip.id}">⬆ Move Up</button>
              <button type="button" class="lbLinkBtn" data-action="move-down" data-clip-id="${clip.id}">⬇ Move Down</button>
              <button type="button" class="lbLinkBtn" data-action="delete-clip" data-clip-id="${clip.id}">🗑 Delete</button>
            </div>` : ''}
          ${videoHtml}
          <div class="speed-toggle" style="margin:8px auto;">
            <button type="button" class="droneSpeedBtn active" data-speed="1">1x</button>
            <button type="button" class="droneSpeedBtn" data-speed="0.5">½x</button>
          </div>
          <div class="lbSub" style="text-align:center;margin-bottom:8px;font-size:11px;">${clip.uploadedBy ? `Uploaded by ${escapeHtml(clip.uploadedBy)}` : ''}${clip.uploadedAt ? ` · ${escapeHtml(fmtWhen(clip.uploadedAt))}` : ''}</div>
          <div class="lbSectionHeader" style="font-size:12px;margin-top:4px;">💬 Comments</div>
          <div class="droneComments" style="font-size:13px;">${commentsHtml}</div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <input type="text" class="droneCommentInput" placeholder="Add a comment…" style="flex:1;padding:7px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;">
            <button type="button" class="navBtn" data-action="post-comment" data-clip-id="${clip.id}" style="padding:7px 12px;flex:0 0 auto;font-size:13px;">Post</button>
          </div>
        </div>
      </div>`;
  }

  // Nathan: "give me a toggle on the admin 5 click coaching gate to have a
  // toggle to show or hide drone footage from parents and players
  // accounts." A team-wide setting, not per-device -- lives in RTDB like
  // everything else, read here and written from the admin panel (see
  // window.setDroneFootageVisibility below, wired in study-quiz.js's
  // openAdminStats()). Missing/never-set defaults to visible (true) so
  // existing behavior doesn't change until a coach actually flips it off.
  let droneVisibleSetting = true;
  let droneVisibilityLoadPromise = null;
  function loadDroneVisibilitySetting() {
    if (droneVisibilityLoadPromise) return droneVisibilityLoadPromise;
    droneVisibilityLoadPromise = window.firebaseAuthed(`${FIREBASE_DB_URL}/settings/droneFootageVisible.json`)
      .then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(val => { droneVisibleSetting = val !== false; return droneVisibleSetting; })
      .catch(() => { droneVisibleSetting = true; return true; });
    return droneVisibilityLoadPromise;
  }
  loadDroneVisibilitySetting(); // kick off immediately at load so the first practice render doesn't have to wait on it from a cold cache

  // Coaches (approved) always get the write UI regardless of this toggle
  // -- it only hides the section from everyone else, so a coach can still
  // manage clips while the team-facing view is temporarily off (e.g.
  // mid-upload, or footage that's still being reviewed).
  window.setDroneFootageVisibility = function (visible, afterOk, afterFail) {
    window.firebaseAuthed(`${FIREBASE_DB_URL}/settings/droneFootageVisible.json`).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(!!visible),
    })).then(r => {
      if (r.ok) {
        droneVisibleSetting = !!visible;
        droneVisibilityLoadPromise = Promise.resolve(droneVisibleSetting);
        if (afterOk) afterOk();
      } else if (afterFail) afterFail(`HTTP ${r.status}`);
    }).catch(err => { if (afterFail) afterFail(err.message || String(err)); });
  };
  // For the admin panel to show the current state without a redundant
  // fetch -- resolves once loadDroneVisibilitySetting's initial call
  // (kicked off above) has landed.
  window.getDroneFootageVisibility = function () {
    return loadDroneVisibilitySetting();
  };

  // Entry point -- practices.js calls this at the end of renderDetail(),
  // both the read-only and coach-edit branches, passing the whole practice
  // record (current). #practiceDroneFootageWrap lives outside
  // #practicesDetailBody in index.html specifically so practices.js
  // rebuilding that innerHTML on every render doesn't wipe this out too.
  function renderDroneFootageSection(practice) {
    const wrap = document.getElementById('practiceDroneFootageWrap');
    if (!wrap) return;
    if (!practice || !practice.id) { wrap.innerHTML = ''; return; }
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    loadDroneVisibilitySetting().then(visible => renderDroneFootageSectionNow(practice, approved, visible));
  }

  function renderDroneFootageSectionNow(practice, approved, visible) {
    const wrap = document.getElementById('practiceDroneFootageWrap');
    if (!wrap) return;
    if (!approved && !visible) { wrap.innerHTML = ''; return; }
    const clips = sortedClips(practice);

    wrap.innerHTML = `
      <div class="lbSectionHeader" style="margin-top:20px;">🚁 Drone Footage</div>
      ${approved ? `
        <div style="text-align:center;margin:6px 0 10px;">
          <label class="lbLinkBtn" style="cursor:pointer;">🚁 Drone Upload<input type="file" id="droneUploadInput" accept="video/*" multiple style="display:none;"></label>
          <div id="droneUploadStatus" class="lbSub" style="margin-top:4px;"></div>
        </div>` : ''}
      <div class="play-grid" id="droneClipList">${clips.map(c => clipHtml(c, approved)).join('')}</div>
      ${!clips.length ? '<div class="lbEmpty">No drone footage uploaded yet.</div>' : ''}`;

    const listEl = document.getElementById('droneClipList');
    if (listEl) wireActions(practice, listEl);

    const uploadInput = document.getElementById('droneUploadInput');
    if (uploadInput) {
      uploadInput.addEventListener('change', () => {
        const files = Array.from(uploadInput.files || []);
        uploadInput.value = '';
        if (!files.length) return;
        uploadBatch(practice, files, document.getElementById('droneUploadStatus'));
      });
    }
  }

  window.renderDroneFootageSection = renderDroneFootageSection;

  // Nathan: "same thing for push notification in the app when drone
  // footage has been uploaded with a link to the practice." Same
  // open-app-fires-a-real-notification pattern as js/whats-new.js's new
  // play alerts (reuses its window.showLocalNotification and the same
  // Notification-permission opt-in -- no separate toggle needed), just
  // sourced from every practice's droneClips instead of whatsNew.json.
  const DRONE_LAST_NOTIFIED_KEY = 'aslBengalsDroneLastNotified';
  function getDroneLastNotified() {
    try { return localStorage.getItem(DRONE_LAST_NOTIFIED_KEY) || ''; } catch (e) { return ''; }
  }
  function setDroneLastNotified(iso) {
    try { localStorage.setItem(DRONE_LAST_NOTIFIED_KEY, iso); } catch (e) { /* harmless -- may re-notify next open */ }
  }
  // Called by the opt-in button (js/whats-new.js) so turning notifications
  // on doesn't immediately blast every clip already uploaded before today.
  window.resetDroneNotifyBaseline = function () {
    setDroneLastNotified(new Date().toISOString());
  };

  // Called once a name/session is known (player-identity.js's gate(),
  // same hook point as whats-new.js's refreshWhatsNewBadge). Loads every
  // practice (not just the one currently open, if any -- a coach could
  // upload footage to a practice nobody's viewing) and checks all their
  // droneClips at once.
  window.maybeNotifyNewDroneClips = function () {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!window.ensurePracticesLoaded) return;
    window.ensurePracticesLoaded().then(practices => {
      const since = getDroneLastNotified();
      const fresh = [];
      (practices || []).forEach(p => {
        (Array.isArray(p.droneClips) ? p.droneClips : []).forEach(c => {
          if (c.uploadedAt && (!since || c.uploadedAt > since)) fresh.push(Object.assign({ practiceId: p.id, practiceDate: p.date }, c));
        });
      });
      if (!fresh.length) {
        // Nothing to notify about, but still needs a baseline the first
        // time this ever runs (device that opted in before any drone
        // footage existed) so it doesn't fire for the team's whole
        // history the first time a clip finally does get uploaded.
        if (!since) setDroneLastNotified(new Date().toISOString());
        return;
      }
      fresh.sort((a, b) => (a.uploadedAt || '').localeCompare(b.uploadedAt || ''));
      const title = fresh.length === 1 ? '🚁 New Drone Footage' : `🚁 ${fresh.length} New Drone Clips`;
      const body = fresh.length === 1
        ? (fresh[0].title || 'A new clip') + (fresh[0].uploadedBy ? ` — added by ${fresh[0].uploadedBy}` : '')
        : fresh.slice(0, 3).map(c => c.title || 'clip').join(', ') + (fresh.length > 3 ? ', and more' : '');
      // Links to whichever practice the newest clip belongs to -- if
      // several practices got footage at once, that's still the most
      // useful single destination to land on.
      const newest = fresh[fresh.length - 1];
      window.showLocalNotification(title, body, { tag: 'aslBengalsDroneFootage', practiceId: newest.practiceId });
      setDroneLastNotified(newest.uploadedAt);
    }).catch(err => console.error('Drone footage notification check failed:', err));
  };
})();

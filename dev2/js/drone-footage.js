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
// time stamped." Confirmed: real Firebase Storage (clips are iPhone-shot,
// ~4-6MB/10-20sec each), uploaded straight from the app, multiple at once.
//
// Every other "upload" in this app (player photos, opponent logos, field
// photos) downscales to a tiny base64 string and embeds it directly in
// Firebase Realtime Database JSON -- fine at photo scale, catastrophic at
// video scale (RTDB has no true blob storage; every save re-sends the whole
// node). This is the first feature to use Firebase STORAGE instead, via its
// plain JSON REST API (no SDK), same "stay consistent with this no-build
// static site" approach cloud-auth.js already takes for Auth/RTDB, reusing
// its window.getFirebaseIdToken() for the Storage Authorization header.
//
// IMPORTANT one-time setup this feature needs and this file can't do for
// you: Firebase Storage has to be enabled for this project in the Firebase
// Console (Build > Storage > Get Started), and STORAGE_BUCKET below has to
// match the bucket name shown at the top of that page (this is a
// best-guess default, not confirmed). Suggested Storage security rules,
// mirroring how RTDB trusts any signed-in gate session rather than
// enforcing per-role checks server-side (see cloud-auth.js's header
// comment) --
//   rules_version = '2';
//   service firebase.storage {
//     match /b/{bucket}/o {
//       match /droneFootage/{practiceId}/{fileName} {
//         allow read: if true;              // <video> tags can't send an
//                                            // Authorization header, so
//                                            // playback needs an
//                                            // unauthenticated GET; actual
//                                            // discovery still requires
//                                            // being signed into the app
//                                            // to read practices.json in
//                                            // the first place.
//         allow write: if request.auth != null;
//       }
//     }
//   }
//
// Video metadata (title, duration, storage path, download URL, display
// order, who/when uploaded, comments) is NOT stored in Storage -- it lives
// on the practice record itself (practice.droneClips, see practices.js),
// saved through window.saveDroneClips(), a narrow write path practices.js
// exposes so a player leaving a comment doesn't need the full coach-only
// edit form (same pattern as roster.js's updateRosterPlayerNum for parent
// jersey-# edits).
// ---------------------------------------------------------------------------
(function () {
  const STORAGE_BUCKET = 'aslbengals.appspot.com'; // confirm against Firebase Console > Storage
  const STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o`;

  const openClipIds = new Set(); // accordion items currently expanded (by clip id)
  let lastPractice = null;       // the practice object last rendered, so button handlers below can find it

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

  // ---- Firebase Storage REST helpers (plain fetch, no SDK -- see header) ----
  function storageUpload(path, file, onOk, onFail) {
    window.getFirebaseIdToken().then(token => {
      const url = `${STORAGE_BASE}?uploadType=media&name=${encodeURIComponent(path)}`;
      return fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type || 'video/mp4' },
        body: file,
      });
    }).then(r => r.ok ? r.json() : r.json().catch(() => ({})).then(e => Promise.reject(new Error((e.error && e.error.message) || `HTTP ${r.status}`))))
      .then(data => {
        // Firebase Storage auto-assigns a firebaseStorageDownloadTokens
        // value on upload -- a URL carrying it works for playback
        // regardless of the read rule, same mechanism getDownloadURL()
        // uses in the full SDK.
        const token = (data.downloadTokens || '').split(',')[0];
        const dlUrl = `${STORAGE_BASE}/${encodeURIComponent(path)}?alt=media${token ? `&token=${token}` : ''}`;
        onOk(dlUrl);
      })
      .catch(err => onFail(err.message || String(err)));
  }
  function storageDelete(path) {
    window.getFirebaseIdToken().then(token =>
      fetch(`${STORAGE_BASE}/${encodeURIComponent(path)}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
    ).catch(err => console.error('Drone clip file delete failed:', err));
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
        const safeName = (file.name || 'clip.mp4').replace(/[^a-zA-Z0-9_.-]/g, '_');
        const path = `droneFootage/${practice.id}/${clipId}-${safeName}`;
        storageUpload(path, file, (url) => {
          const clips = sortedClips(practice);
          const maxOrder = clips.reduce((m, c) => Math.max(m, c.order || 0), -1);
          clips.push({
            id: clipId,
            title: (file.name || 'Drone Clip').replace(/\.[^.]+$/, '') || 'Drone Clip',
            storagePath: path,
            url,
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
      });
    };
    next(0);
  }

  // ---- Clip actions (event-delegated from the list container) ----
  function wireActions(practice, listEl) {
    listEl.addEventListener('click', (e) => {
      const header = e.target.closest('.accordion-header');
      if (header) {
        const item = header.closest('.accordion-item');
        const id = item && item.dataset.clipId;
        if (id) {
          if (openClipIds.has(id)) openClipIds.delete(id); else openClipIds.add(id);
          renderDroneFootageSection(practice);
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
        storageDelete(clips[idx].storagePath);
        clips.splice(idx, 1);
        openClipIds.delete(clipId);
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
    const open = openClipIds.has(clip.id);
    const comments = Array.isArray(clip.comments) ? clip.comments : [];
    const commentsHtml = comments.length
      ? comments.map(c => `
          <div style="padding:6px 0;border-top:1px solid rgba(128,128,128,.25);">
            <span style="font-weight:700;">${escapeHtml(c.author || 'Someone')}</span>
            <span class="lbSub" style="margin-left:6px;">${escapeHtml(fmtWhen(c.at))}</span>
            <div style="margin-top:2px;">${escapeHtml(c.text)}</div>
          </div>`).join('')
      : '<div class="lbSub" style="padding:4px 0;">No comments yet.</div>';

    return `
      <div class="accordion-item${open ? ' open' : ''}" data-clip-id="${clip.id}">
        <button type="button" class="accordion-header">
          <span>🎥 ${escapeHtml(clip.title || 'Drone Clip')}${clip.durationSec ? ` <span class="lbSub" style="font-weight:400;">(${fmtDuration(clip.durationSec)})</span>` : ''}</span>
          <span class="accordion-chevron">▾</span>
        </button>
        <div class="accordion-body">
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
          <video src="${clip.url}" controls preload="metadata" playsinline style="width:100%;border-radius:8px;background:#000;display:block;"></video>
          <div class="speed-toggle" style="margin:8px auto;">
            <button type="button" class="droneSpeedBtn active" data-speed="1">1x</button>
            <button type="button" class="droneSpeedBtn" data-speed="0.5">½x</button>
          </div>
          <div class="lbSub" style="text-align:center;margin-bottom:8px;">${clip.uploadedBy ? `Uploaded by ${escapeHtml(clip.uploadedBy)}` : ''}${clip.uploadedAt ? ` · ${escapeHtml(fmtWhen(clip.uploadedAt))}` : ''}</div>
          <div class="lbSectionHeader" style="font-size:13px;margin-top:4px;">💬 Comments</div>
          <div class="droneComments">${commentsHtml}</div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <input type="text" class="droneCommentInput" placeholder="Add a comment…" style="flex:1;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;">
            <button type="button" class="navBtn" data-action="post-comment" data-clip-id="${clip.id}" style="padding:8px 12px;flex:0 0 auto;">Post</button>
          </div>
        </div>
      </div>`;
  }

  // Entry point -- practices.js calls this at the end of renderDetail(),
  // both the read-only and coach-edit branches, passing the whole practice
  // record (current). #practiceDroneFootageWrap lives outside
  // #practicesDetailBody in index.html specifically so practices.js
  // rebuilding that innerHTML on every render doesn't wipe this out too.
  function renderDroneFootageSection(practice) {
    const wrap = document.getElementById('practiceDroneFootageWrap');
    if (!wrap) return;
    if (!practice || !practice.id) { wrap.innerHTML = ''; return; }
    lastPractice = practice;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
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
})();

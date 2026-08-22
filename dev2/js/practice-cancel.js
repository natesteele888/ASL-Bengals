// ---------------------------------------------------------------------------
// Practice Cancellation notice -- Nathan: "due to weather we may need to
// cancel practice. Have a practice canceled due to lightning popup that we
// can enable in the coach tools with a custom message we can write. Have a
// full screen panel that pops up to say its canceled and they have to
// confirm before they move on. after the canceled event end time the
// notice goes away."
//
// A single team-wide setting (like drone-footage.js's visibility toggle),
// lives at settings/practiceCancellation in the RTDB:
//   { active, message, practiceId, practiceLabel, endsAt, updatedAt }
// -- active is the coach's on/off switch, endsAt is a real timestamp so the
// full-screen block disappears on its own once that time passes even if
// nobody remembers to turn it back off.
//
// Coach Tools > Settings (js/coachtools-settings.js calls
// window.initPracticeCancelSettings on that tab's init) is where a coach
// writes the message and either picks an upcoming practice -- reusing its
// real end time from js/practices.js's own data instead of making the
// coach retype a duration -- or, if this isn't tied to one specific
// practice on the calendar, sets an end time by hand.
//
// window.maybeShowCancellationPanel() is called from player-identity.js's
// gate() once a session is known, same hook point as the What's New badge
// and drone-footage notification checks. It also starts a light 60s poll
// (plus a recheck on tab refocus) so an already-open app picks up a
// freshly-activated notice, or auto-clears one that just expired, without
// needing a reload -- this is meant to be read the moment it matters.
//
// Nathan (5th pass): "coaches should have an option of going into the
// schedule, clicking on the practice and a cancel due to weather button,
// that you confirm and it creates the active push notice... Coaches should
// see how many have confirmed." Two additions on top of everything above:
//
// 1. window.activatePracticeCancellation(practiceId, message, afterOk,
//    afterFail) / window.deactivatePracticeCancellation(afterOk, afterFail)
//    -- the same activate/deactivate logic the Coach Tools > Settings form
//    already used (see wireCancelSettingsForm below), pulled out so
//    js/practices.js's practice-detail view can trigger it too, from a
//    "Cancel Due to Weather" button right on the practice itself (see
//    window.renderPracticeCancelSection near the bottom).
//
// 2. Confirmation tracking. Each notice now gets its own short `noticeId`
//    (a practice can be canceled more than once across a season, and a
//    coach editing/re-activating the SAME notice's message shouldn't reset
//    who's already confirmed -- but a genuinely NEW cancellation should
//    start a fresh count). Every confirm tap PUTs a small record to
//    settings/practiceCancellationConfirmations/<noticeId>/<playerId> --
//    same "small, narrow write path, keyed by whoever's signed in" idea as
//    js/drone-footage.js's comment saves. This is best-effort (a failed
//    write here should never block someone dismissing the panel) and only
//    fires when a real player session exists, which player-identity.js's
//    gate() guarantees by the time this panel can even be showing.
// ---------------------------------------------------------------------------
(function () {

  const CANCEL_URL = `${FIREBASE_DB_URL}/settings/practiceCancellation.json`;
  const SEEN_KEY = 'aslBengalsCancelSeenAt';
  function genNoticeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function confirmationsUrl(noticeId, playerId) {
    return `${FIREBASE_DB_URL}/settings/practiceCancellationConfirmations/${noticeId}${playerId ? '/' + playerId : ''}.json`;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ---- Small local date/time helpers -- same shapes practices.js keeps
  // to itself (p.date is 'YYYY-MM-DD', p.time/p.endTime are native
  // <input type="time"> 'HH:MM' strings), duplicated here rather than
  // reaching into that module's private scope. ----
  function fmtDateLocal(dateStr) {
    if (!dateStr) return 'Date TBD';
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function to12h(str) {
    if (!str) return '';
    const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return str;
    let h = Number(m[1]);
    const min = m[2];
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${min} ${ap}`;
  }
  function fmtEndsAt(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return iso; }
  }
  // A practice with no endTime saved yet still needs a real cutoff --
  // same 105-minute default calendar-export.js already falls back to for
  // a start-only practice (minutesBetween(...) || 105).
  function computeEndsAt(practice) {
    if (!practice || !practice.date) return null;
    const dparts = practice.date.split('-').map(Number);
    if (dparts.length !== 3 || dparts.some(isNaN)) return null;
    const [y, mo, d] = dparts;
    let eh, em;
    if (practice.endTime) {
      const t = practice.endTime.split(':').map(Number);
      eh = t[0]; em = t[1];
    } else if (practice.time) {
      const t = practice.time.split(':').map(Number);
      const totalMin = t[0] * 60 + t[1] + 105;
      eh = Math.floor(totalMin / 60) % 24; em = totalMin % 60;
    } else {
      eh = 23; em = 59; // no time at all on file -- default to end of that day
    }
    if ([eh, em].some(isNaN)) return null;
    return new Date(y, mo - 1, d, eh, em, 0, 0);
  }
  function fmtPracticeMeta(practice) {
    const dateLabel = fmtDateLocal(practice.date);
    const timeLabel = practice.time ? (practice.endTime ? `${to12h(practice.time)} – ${to12h(practice.endTime)}` : to12h(practice.time)) : '';
    return timeLabel ? `${dateLabel} • ${timeLabel}` : dateLabel;
  }

  // ---- Cloud read/write ----
  function loadCancelSetting() {
    return window.firebaseAuthed(CANCEL_URL).then(url => fetch(url))
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
  }
  function saveCancelSetting(setting, afterOk, afterFail) {
    window.firebaseAuthed(CANCEL_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setting),
    })).then(r => {
      if (r.ok) { if (afterOk) afterOk(); }
      else if (afterFail) afterFail(`HTTP ${r.status}`);
    }).catch(err => { if (afterFail) afterFail(err.message || String(err)); });
  }

  function isActiveNow(setting) {
    if (!setting || !setting.active || !setting.endsAt) return false;
    const t = new Date(setting.endsAt).getTime();
    return !isNaN(t) && t > Date.now();
  }

  // Shared by both places a notice gets activated -- the Coach Tools >
  // Settings form (wireCancelSettingsForm below) and the practice-detail
  // "Cancel Due to Weather" button (window.activatePracticeCancellation) --
  // so neither can forget the noticeId confirmation-tracking needs.
  function buildCancelSetting(message, practiceId, practiceLabel, endsAtDate) {
    return {
      active: true,
      message,
      practiceId: practiceId || null,
      practiceLabel: practiceLabel || null,
      endsAt: endsAtDate.toISOString(),
      updatedAt: new Date().toISOString(),
      noticeId: genNoticeId(),
    };
  }

  // ---- Confirmation tracking (who tapped Confirm on THIS notice) ----
  function recordConfirmation(noticeId) {
    if (!noticeId) return; // an older notice saved before this feature existed -- nothing to key it to
    const session = window.PlayerIdentity && window.PlayerIdentity.getSession && window.PlayerIdentity.getSession();
    if (!session || !session.playerId) return; // shouldn't happen -- gate() guarantees a session by now
    window.firebaseAuthed(confirmationsUrl(noticeId, session.playerId)).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: session.name || 'Unknown', confirmedAt: new Date().toISOString() }),
    })).catch(() => { /* best-effort -- never block dismissing the panel over this */ });
  }
  function loadConfirmations(noticeId) {
    if (!noticeId) return Promise.resolve(null);
    return window.firebaseAuthed(confirmationsUrl(noticeId)).then(url => fetch(url))
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
  }

  // ---- Lightning bolts + thunder audio -- ported from the LYBS Cards app
  // (natesteele888/lybs-cards, its fireCardAmbientBolt()/startAmbientAudio()
  // pair) per Nathan: "Let's now reference the LYBS cards app. This has a
  // better understanding of lightning I want, also added a sound file with
  // a thunderstorm going." Same randomized-jagged-3-layer-SVG-polyline bolt
  // as that app, and the same "AMBIENT_FLASH_TIMES scheduled against the
  // real audio's playback position" sync idea -- but reading a plain
  // <audio> element's .currentTime instead of LYBS's Web Audio
  // AudioBufferSourceNode/AudioContext.currentTime, since this feature
  // doesn't need sample-accurate sync (a few hundred ms of drift against a
  // rolling thunder rumble isn't perceptible) and a plain element is far
  // less code to unlock/manage than decoding into an AudioContext buffer.
  //
  // AMBIENT_FLASH_TIMES below are NOT copied from LYBS -- they're specific
  // to assets/audio/thunder-loop.mp3 (Nathan's uploaded thunderstorm file),
  // found by running a short RMS-energy peak-detection pass over that exact
  // file so each flash lands ~0.4s ahead of one of ITS real thunder hits.
  const AMBIENT_FLASH_TIMES = [0, 5.72, 10.57, 16.34, 18.14, 25.61, 34.48, 36.53, 41.43, 42.88, 48.83, 53.68, 59.45];
  const LOOP_DURATION = 60.024;

  function prefersReducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }

  function fireLightningBolt() {
    const host = document.getElementById('cancelBoltHost');
    const flash = document.getElementById('cancelFlash');
    if (!host) return;
    const W = host.clientWidth || window.innerWidth || 400;
    const H = host.clientHeight || window.innerHeight || 800;
    // Dim bluish palette -- an ambient background bolt, not a screen-filling
    // pack-break flash (LYBS's own "card bolts are subtle" comment).
    const colors = [[60, 120, 220], [80, 100, 200], [100, 140, 255]];
    const [r, g, b] = colors[Math.floor(Math.random() * colors.length)];
    const boltColor = `rgba(${r + 100},${g + 100},${b + 100},0.95)`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;opacity:0;transition:opacity 0.04s';
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);

    // Randomized jagged path, starting from a random top edge point (or
    // occasionally a side edge lower down) and drifting toward the bottom.
    const sx = Math.random() * W;
    const fromTop = Math.random() > 0.4;
    const sx2 = fromTop ? sx : (Math.random() > 0.5 ? 0 : W);
    const sy2 = fromTop ? 0 : Math.random() * H * 0.4;
    const pts = [[sx2, sy2]];
    let cx = sx2, cy = sy2;
    const steps = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < steps; i++) {
      cx += (Math.random() - 0.4) * 90;
      cy += (H / steps) * (0.7 + Math.random() * 0.5);
      pts.push([cx, cy]);
    }
    const pstr = pts.map(([x, y]) => `${x},${y}`).join(' ');

    // Three stacked layers -- blurred outer glow, mid glow, white-hot core.
    const gl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    gl.setAttribute('points', pstr); gl.setAttribute('fill', 'none');
    gl.setAttribute('stroke', `rgba(${r},${g},${b},0.55)`);
    gl.setAttribute('stroke-width', '12'); gl.setAttribute('stroke-linecap', 'round');
    gl.style.filter = 'blur(7px)';
    svg.appendChild(gl);

    const md = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    md.setAttribute('points', pstr); md.setAttribute('fill', 'none');
    md.setAttribute('stroke', boltColor); md.setAttribute('stroke-width', '3');
    md.setAttribute('stroke-linecap', 'round');
    md.style.filter = 'blur(1.5px)';
    svg.appendChild(md);

    const cr = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    cr.setAttribute('points', pstr); cr.setAttribute('fill', 'none');
    cr.setAttribute('stroke', 'rgba(255,255,255,.92)'); cr.setAttribute('stroke-width', '1.2');
    cr.setAttribute('stroke-linecap', 'round');
    svg.appendChild(cr);

    host.appendChild(svg);

    requestAnimationFrame(() => {
      svg.style.opacity = '1';
      if (flash) {
        flash.style.transition = 'none';
        flash.style.opacity = '0.6';
        void flash.offsetWidth; // force reflow so the fade-out below actually animates
        flash.style.transition = 'opacity .5s ease-out';
        flash.style.opacity = '0';
      }
      setTimeout(() => {
        svg.style.transition = 'opacity 0.12s';
        svg.style.opacity = '0';
        setTimeout(() => svg.remove(), 200);
      }, 90 + Math.random() * 110);
    });
  }

  let _boltRaf = null;
  let _boltFallbackTimer = null;
  let _boltNextFlashIdx = 0;
  let _boltLastElapsed = 0;

  function stopBolts() {
    if (_boltRaf) { cancelAnimationFrame(_boltRaf); _boltRaf = null; }
    if (_boltFallbackTimer) { clearTimeout(_boltFallbackTimer); _boltFallbackTimer = null; }
    const host = document.getElementById('cancelBoltHost');
    if (host) host.innerHTML = '';
    const flash = document.getElementById('cancelFlash');
    if (flash) { flash.style.transition = 'none'; flash.style.opacity = '0'; }
  }

  // Bolts fire in sync with the real thunder hits in thunder-loop.mp3,
  // reading the playing <audio> element's own currentTime each frame --
  // same idea as LYBS's _scheduleAmbientFlashCheck, just against
  // HTMLMediaElement.currentTime instead of an AudioContext clock.
  function startSyncedBolts(audioEl) {
    _boltNextFlashIdx = 0;
    _boltLastElapsed = 0;
    function tick() {
      if (!audioEl || audioEl.paused || audioEl.ended) { _boltRaf = null; return; }
      const elapsed = audioEl.currentTime % LOOP_DURATION;
      if (elapsed < _boltLastElapsed) _boltNextFlashIdx = 0; // loop wrapped
      _boltLastElapsed = elapsed;
      while (_boltNextFlashIdx < AMBIENT_FLASH_TIMES.length && elapsed >= AMBIENT_FLASH_TIMES[_boltNextFlashIdx]) {
        fireLightningBolt();
        _boltNextFlashIdx++;
      }
      _boltRaf = requestAnimationFrame(tick);
    }
    _boltRaf = requestAnimationFrame(tick);
  }

  // If the browser's autoplay policy blocks the thunder audio (e.g. the
  // panel appears on first load before any tap has happened), the storm
  // still needs to feel alive -- fall back to random 2-6s bolts, same as
  // LYBS's own startCardLightning() fallback rhythm.
  function startFallbackBolts() {
    function scheduleNext() {
      const delay = 2000 + Math.random() * 4000;
      _boltFallbackTimer = setTimeout(() => {
        const overlay = document.getElementById('cancelNoticeOverlay');
        if (!overlay || !overlay.classList.contains('show')) { _boltFallbackTimer = null; return; }
        fireLightningBolt();
        if (Math.random() > 0.65) setTimeout(fireLightningBolt, 120 + Math.random() * 180);
        scheduleNext();
      }, delay);
    }
    scheduleNext();
  }

  // Primes the <audio> element's playback rights inside a real user
  // gesture's call stack (tap/click anywhere in the app) -- mirrors LYBS's
  // own _unlockAudioOnce, which found that without *something* actually
  // playing synchronously during a gesture, iOS Safari can silently refuse
  // to play audio started later/async even though nothing looks blocked.
  let _audioUnlocked = false;
  // Tracks the pending "un-prime" pause below so a real playThunder() call
  // landing inside that same short window can cancel it -- otherwise the
  // delayed pause() can fire just after real playback starts and silently
  // kill it, since both target the same <audio> element.
  let _primeTimer = null;
  function unlockAudioOnce() {
    if (_audioUnlocked) return;
    _audioUnlocked = true;
    const audioEl = document.getElementById('cancelThunderAudio');
    if (!audioEl) return;
    const wasMuted = audioEl.muted;
    audioEl.muted = true;
    const p = audioEl.play();
    if (p && p.catch) p.catch(() => { /* fine -- playThunder() will retry properly later */ });
    _primeTimer = setTimeout(() => {
      _primeTimer = null;
      audioEl.pause();
      audioEl.muted = wasMuted;
    }, 30);
  }
  window.addEventListener('touchstart', unlockAudioOnce, { once: true, capture: true });
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true, capture: true });
  window.addEventListener('click', unlockAudioOnce, { once: true, capture: true });

  // A show->hide->show cycle faster than the fade duration (the settings
  // panel poll can retrigger this, and so can a coach flipping the notice
  // on/off quickly while testing it) used to leave an OLD fade's delayed
  // audioEl.pause() landing after a NEWER playThunder() had already started
  // real playback, silently killing the audio. _audioOpToken makes every
  // playThunder()/stopThunder() call supersede whatever came before it, so a
  // stale fade notices it's been superseded and bails out instead of
  // finishing (and, for stopThunder's fade specifically, instead of pausing
  // audio that a later playThunder() legitimately started).
  let _audioOpToken = 0;
  function fadeAudioTo(audioEl, target, durationMs, onDone, token) {
    const start = audioEl.volume;
    const startTime = Date.now();
    const dur = durationMs || 500;
    (function step() {
      if (token !== _audioOpToken) return; // superseded by a newer play/stop
      const t = Math.min(1, (Date.now() - startTime) / dur);
      audioEl.volume = start + (target - start) * t;
      if (t < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    })();
  }

  function playThunder() {
    if (prefersReducedMotion()) return; // skip bolts + audio entirely
    const audioEl = document.getElementById('cancelThunderAudio');
    if (!audioEl) { startFallbackBolts(); return; }
    const myToken = ++_audioOpToken;
    // A priming pause() from unlockAudioOnce() could still be queued -- cancel
    // it so it can't land right after this real play() and pause it back out.
    if (_primeTimer) { clearTimeout(_primeTimer); _primeTimer = null; }
    audioEl.muted = false;
    audioEl.volume = 0;
    try { audioEl.currentTime = 0; } catch (e) { /* not ready yet -- fine */ }
    const p = audioEl.play();
    const onOk = () => {
      if (myToken !== _audioOpToken) return; // hidden again before playback actually started
      fadeAudioTo(audioEl, 0.55, 800, null, myToken);
      startSyncedBolts(audioEl);
    };
    const onBlocked = () => { if (myToken === _audioOpToken) startFallbackBolts(); }; // autoplay refused -- still storm, just unsynced
    if (p && p.then) p.then(onOk).catch(onBlocked);
    else onOk();
  }

  function stopThunder() {
    stopBolts();
    const audioEl = document.getElementById('cancelThunderAudio');
    if (!audioEl || audioEl.paused) return;
    const myToken = ++_audioOpToken;
    fadeAudioTo(audioEl, 0, 400, () => {
      audioEl.pause();
      try { audioEl.currentTime = 0; } catch (e) { /* ignore */ }
    }, myToken);
  }

  // ---- Full-screen blocking panel ----
  let shownUpdatedAt = null;
  let shownNoticeId = null;
  function getSeen() { try { return localStorage.getItem(SEEN_KEY); } catch (e) { return null; } }
  function setSeen(v) { try { localStorage.setItem(SEEN_KEY, v); } catch (e) { /* ignore */ } }

  function showPanel(setting) {
    const overlay = document.getElementById('cancelNoticeOverlay');
    if (!overlay) return;
    const msgEl = document.getElementById('cancelNoticeMessageText');
    const metaEl = document.getElementById('cancelNoticeMetaText');
    if (msgEl) msgEl.textContent = setting.message || 'Practice has been canceled.';
    if (metaEl) metaEl.textContent = setting.practiceLabel ? setting.practiceLabel : `Notice ends ${fmtEndsAt(setting.endsAt)}`;
    shownUpdatedAt = setting.updatedAt;
    shownNoticeId = setting.noticeId || null;
    if (!overlay.classList.contains('show')) {
      overlay.classList.add('show');
      playThunder();
    }
  }
  function hidePanel() {
    const overlay = document.getElementById('cancelNoticeOverlay');
    if (overlay && overlay.classList.contains('show')) {
      overlay.classList.remove('show');
      stopThunder();
    }
  }

  function checkAndMaybeShow() {
    loadCancelSetting().then(setting => {
      if (isActiveNow(setting)) {
        // Already tapped "I Understand" for this exact notice (same
        // updatedAt) -- don't nag again on every 60s poll/tab refocus.
        // A coach editing the message or setting up a new notice bumps
        // updatedAt, which un-suppresses it again on purpose.
        if (getSeen() !== setting.updatedAt) showPanel(setting);
      } else {
        // Covers both "turned off" and "end time passed" -- either way
        // the notice should disappear on its own, confirmed or not.
        hidePanel();
      }
    }).catch(() => {});
  }

  let pollingStarted = false;
  window.maybeShowCancellationPanel = function () {
    checkAndMaybeShow();
    if (pollingStarted) return;
    pollingStarted = true;
    setInterval(checkAndMaybeShow, 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkAndMaybeShow();
    });
  };

  function onConfirmTap() {
    if (shownUpdatedAt) setSeen(shownUpdatedAt);
    recordConfirmation(shownNoticeId);
    hidePanel();
  }
  document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('cancelNoticeConfirmBtn');
    if (confirmBtn) confirmBtn.addEventListener('click', onConfirmTap);
  });
  // index.html's bootstrap loads this script well after DOMContentLoaded
  // has already fired (it's behind an auth gate + await chain), so also
  // wire up immediately in case the event above already passed.
  if (document.readyState !== 'loading') {
    const confirmBtn = document.getElementById('cancelNoticeConfirmBtn');
    if (confirmBtn && !confirmBtn.dataset.wired) {
      confirmBtn.dataset.wired = '1';
      confirmBtn.addEventListener('click', onConfirmTap);
    }
  }

  // ---- Coach Tools > Settings wiring ----
  function refreshCancelSettingsUI() {
    const statusEl = document.getElementById('cancelNoticeStatus');
    const formWrap = document.getElementById('cancelNoticeForm');
    const deactivateBtn = document.getElementById('cancelDeactivateBtn');
    if (!statusEl) return;
    statusEl.textContent = 'Loading…';
    loadCancelSetting().then(setting => {
      if (isActiveNow(setting)) {
        statusEl.innerHTML = `<b style="color:#c62828;">🚨 Notice is active</b><br>"${escapeHtml(setting.message)}"<br>` +
          `Ends ${escapeHtml(fmtEndsAt(setting.endsAt))}${setting.practiceLabel ? ' · ' + escapeHtml(setting.practiceLabel) : ''}`;
        if (formWrap) formWrap.style.display = 'none';
        if (deactivateBtn) deactivateBtn.style.display = 'block';
      } else {
        statusEl.textContent = 'No active cancellation notice.';
        if (formWrap) formWrap.style.display = '';
        if (deactivateBtn) deactivateBtn.style.display = 'none';
      }
    });
  }

  function populatePracticeSelect() {
    const select = document.getElementById('cancelPracticeSelect');
    if (!select || !window.ensurePracticesLoaded) return;
    window.ensurePracticesLoaded().then(items => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const upcoming = (items || [])
        .filter(p => p.type === 'practice' && p.date >= todayStr)
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
      while (select.options.length > 1) select.remove(1);
      upcoming.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = fmtPracticeMeta(p);
        select.appendChild(opt);
      });
    });
  }

  function wireCancelSettingsForm() {
    const select = document.getElementById('cancelPracticeSelect');
    const manualInput = document.getElementById('cancelManualEndInput');
    const messageInput = document.getElementById('cancelMessageInput');
    const activateBtn = document.getElementById('cancelActivateBtn');
    const deactivateBtn = document.getElementById('cancelDeactivateBtn');
    const errEl = document.getElementById('cancelNoticeError');

    if (select && manualInput && !select.dataset.wired) {
      select.dataset.wired = '1';
      select.addEventListener('change', () => {
        manualInput.style.display = select.value ? 'none' : '';
      });
    }

    if (activateBtn && !activateBtn.dataset.wired) {
      activateBtn.dataset.wired = '1';
      activateBtn.addEventListener('click', () => {
        if (errEl) errEl.textContent = '';
        const practiceId = select ? select.value : '';
        const message = (messageInput && messageInput.value.trim()) ||
          'Practice is canceled due to lightning in the area. Stay safe -- see you next time!';

        let endsAtDate = null, practiceLabel = null;
        if (practiceId) {
          const items = window.getPracticesCached ? window.getPracticesCached() : [];
          const practice = items.find(p => p.id === practiceId);
          if (practice) {
            endsAtDate = computeEndsAt(practice);
            practiceLabel = fmtPracticeMeta(practice);
          }
        } else if (manualInput && manualInput.value) {
          const parsed = new Date(manualInput.value);
          if (!isNaN(parsed.getTime())) endsAtDate = parsed;
        }

        if (!endsAtDate || isNaN(endsAtDate.getTime())) {
          if (errEl) errEl.textContent = 'Pick a practice, or set an end time by hand, first.';
          return;
        }
        if (endsAtDate.getTime() <= Date.now()) {
          if (errEl) errEl.textContent = 'That end time has already passed -- pick a later one.';
          return;
        }

        activateBtn.disabled = true;
        activateBtn.textContent = 'Activating…';
        const setting = buildCancelSetting(message, practiceId, practiceLabel, endsAtDate);
        saveCancelSetting(setting, () => {
          activateBtn.disabled = false;
          activateBtn.textContent = '🚨 Activate Cancellation Notice';
          if (messageInput) messageInput.value = '';
          refreshCancelSettingsUI();
        }, msg => {
          activateBtn.disabled = false;
          activateBtn.textContent = '🚨 Activate Cancellation Notice';
          if (errEl) errEl.textContent = `Save failed: ${msg}`;
        });
      });
    }

    if (deactivateBtn && !deactivateBtn.dataset.wired) {
      deactivateBtn.dataset.wired = '1';
      deactivateBtn.addEventListener('click', () => {
        deactivateBtn.disabled = true;
        deactivateBtn.textContent = 'Ending…';
        deactivateCancelSetting(() => {
          deactivateBtn.disabled = false;
          deactivateBtn.textContent = '✅ End Notice Now';
          refreshCancelSettingsUI();
        }, msg => {
          deactivateBtn.disabled = false;
          deactivateBtn.textContent = '✅ End Notice Now';
          if (errEl) errEl.textContent = `Save failed: ${msg}`;
        });
      });
    }
  }

  // Shared by the Settings-form Deactivate button above and
  // window.deactivatePracticeCancellation below (the practice-detail "End
  // Notice Now" link).
  function deactivateCancelSetting(afterOk, afterFail) {
    loadCancelSetting().then(setting => {
      if (!setting) { if (afterOk) afterOk(); return; }
      const updated = Object.assign({}, setting, { active: false, updatedAt: new Date().toISOString() });
      saveCancelSetting(updated, afterOk, afterFail);
    });
  }

  window.initPracticeCancelSettings = function () {
    wireCancelSettingsForm();
    populatePracticeSelect();
    refreshCancelSettingsUI();
  };

  // ---- Practice-detail "Cancel Due to Weather" (js/practices.js) ----
  // Nathan: "coaches should have an option of going into the schedule,
  // clicking on the practice and a cancel due to weather button, that you
  // confirm and it creates the active push notice until the end of the
  // event time for that day." Same underlying settings/practiceCancellation
  // node the Settings-panel form writes to (there's still only ever ONE
  // active notice team-wide) -- this is just a second, faster on-ramp to
  // it that's pre-scoped to whichever practice the coach already has open,
  // reusing that practice's own real end time exactly like the Settings
  // form's practice picker does.
  window.activatePracticeCancellation = function (practiceId, message, afterOk, afterFail) {
    const items = window.getPracticesCached ? window.getPracticesCached() : [];
    const practice = items.find(p => p.id === practiceId);
    if (!practice) { if (afterFail) afterFail('Practice not found.'); return; }
    const endsAtDate = computeEndsAt(practice);
    if (!endsAtDate || isNaN(endsAtDate.getTime()) || endsAtDate.getTime() <= Date.now()) {
      if (afterFail) afterFail('This practice has already ended.');
      return;
    }
    const finalMessage = (message && message.trim()) ||
      'Practice is canceled due to lightning in the area. Stay safe -- see you next time!';
    const setting = buildCancelSetting(finalMessage, practiceId, fmtPracticeMeta(practice), endsAtDate);
    saveCancelSetting(setting, afterOk, afterFail);
  };
  window.deactivatePracticeCancellation = deactivateCancelSetting;

  // Nathan: "Coaches should see if in the canceled practice how many have
  // confirmed in the app during the cancellation period." Renders into a
  // <div id="practiceCancelSection"> that js/practices.js's practice-detail
  // view provides (same "owns its own section, called from practices.js's
  // renderDetail()" pattern as js/drone-footage.js's
  // window.renderDroneFootageSection). Three states: no notice tied to
  // this practice yet (show the Cancel button, coaches only), a notice tied
  // to THIS practice that's still active (red status + live confirm count
  // + End Notice Now), or one that already ended (same confirm count, kept
  // around as a record instead of just vanishing the moment it expires).
  function renderPracticeCancelSection(practice) {
    const wrap = document.getElementById('practiceCancelSection');
    if (!wrap || !practice || !practice.id) return;
    const savedItems = window.getPracticesCached ? window.getPracticesCached() : [];
    if (!savedItems.some(p => p.id === practice.id)) { wrap.innerHTML = ''; return; } // not saved yet -- nothing to cancel
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;

    loadCancelSetting().then(setting => {
      if (document.getElementById('practiceCancelSection') !== wrap) return; // coach navigated on while this was loading
      const tiedToThisPractice = setting && setting.practiceId === practice.id;
      if (tiedToThisPractice) {
        renderCancelStatusBlock(wrap, practice, setting, approved, isActiveNow(setting));
      } else if (approved) {
        renderCancelButton(wrap, practice);
      } else {
        wrap.innerHTML = '';
      }
    });
  }

  function renderCancelButton(wrap, practice) {
    const endsAtDate = computeEndsAt(practice);
    if (!endsAtDate || isNaN(endsAtDate.getTime()) || endsAtDate.getTime() <= Date.now()) {
      wrap.innerHTML = ''; // already over -- nothing left to cancel
      return;
    }
    wrap.innerHTML = `<div style="margin:12px 0;">
      <button type="button" class="navBtn danger" id="practiceCancelWeatherBtn" style="display:block;width:100%;text-align:center;box-sizing:border-box;">⛈️ Cancel Due to Weather</button>
    </div>`;
    const btn = document.getElementById('practiceCancelWeatherBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!confirm('Cancel this practice due to weather?\n\nEveryone will get a full-screen notice until it ends. This replaces any other active cancellation notice.')) return;
      btn.disabled = true;
      btn.textContent = 'Canceling…';
      window.activatePracticeCancellation(practice.id, null, () => {
        renderPracticeCancelSection(practice);
      }, msg => {
        btn.disabled = false;
        btn.textContent = '⛈️ Cancel Due to Weather';
        alert(`Could not cancel: ${msg}`);
      });
    });
  }

  function renderCancelStatusBlock(wrap, practice, setting, approved, active) {
    const header = active
      ? `<div class="lbSectionHeader" style="text-align:center;color:#c62828;">🚨 Canceled Due to Weather</div>
         <div class="lbSub" style="text-align:center;margin:2px 0 8px;">"${escapeHtml(setting.message)}"<br>Notice ends ${escapeHtml(fmtEndsAt(setting.endsAt))}</div>`
      : `<div class="lbSub" style="text-align:center;margin:10px 0 4px;">⛈️ This practice was canceled due to weather.</div>`;
    // Confirmation names are coach-only -- everyone else already got the
    // popup itself; who-tapped-what isn't really their business to browse.
    const countLine = approved ? `<div class="lbSub" style="text-align:center;margin-bottom:8px;" id="practiceCancelConfirmCount">Loading confirmations…</div>` : '';
    const endBtn = active && approved ? `<div style="text-align:center;"><button type="button" class="lbLinkBtn" id="practiceCancelEndBtn">End Notice Now</button></div>` : '';
    wrap.innerHTML = header + countLine + endBtn;

    if (approved) {
      loadConfirmations(setting.noticeId).then(confirmations => {
        const el = document.getElementById('practiceCancelConfirmCount');
        if (!el) return;
        const names = confirmations ? Object.values(confirmations).map(c => c && c.name).filter(Boolean).sort() : [];
        el.textContent = names.length
          ? `✅ ${names.length} confirmed${active ? '' : ' while it was active'}: ${names.join(', ')}`
          : (setting.noticeId ? 'No one has confirmed yet.' : 'Confirmations weren’t tracked for this older notice.');
      });
    }
    const endBtnEl = document.getElementById('practiceCancelEndBtn');
    if (endBtnEl) {
      endBtnEl.addEventListener('click', () => {
        if (!confirm('End this cancellation notice now?')) return;
        endBtnEl.disabled = true;
        window.deactivatePracticeCancellation(() => renderPracticeCancelSection(practice), msg => {
          alert(`Could not end notice: ${msg}`);
          endBtnEl.disabled = false;
        });
      });
    }
  }

  window.renderPracticeCancelSection = renderPracticeCancelSection;
})();

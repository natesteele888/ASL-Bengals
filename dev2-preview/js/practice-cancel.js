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
//   { active, message, eventId, eventLabel, eventType, endsAt, updatedAt, noticeId }
// -- active is the coach's on/off switch, endsAt is a real timestamp so the
// full-screen block disappears on its own once that time passes even if
// nobody remembers to turn it back off. eventType is 'practice' or 'game'
// (see the 6th-pass note below) and picks which real photo/copy the
// full-screen panel shows.
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
//
// Nathan (6th pass): "I also don't want it to be in the Coach Tools
// section. It should be available to coaches when they click into a
// scheduled game or practice... the pop up is activated and won't come
// down until 30 minutes after the scheduled event's end time." Three
// changes:
//
// 1. The Coach Tools > Settings manual form (wireCancelSettingsForm /
//    populatePracticeSelect / refreshCancelSettingsUI /
//    window.initPracticeCancelSettings, plus its index.html markup) is
//    gone -- clicking into the specific game/practice on the schedule is
//    now the ONLY way to activate or end a notice.
//
// 2. Generalized from practice-only to also cover games. The setting
//    object now carries `eventId`/`eventLabel`/`eventType` ('practice' or
//    'game') instead of practice-only field names -- window.getGamesCached
//    (js/schedule.js) is read the same way window.getPracticesCached
//    (js/practices.js) already was. window.activatePracticeCancellation
//    keeps its name (still the one function js/practices.js calls) but
//    now takes an optional trailing eventType, defaulting to 'practice' so
//    that existing call site didn't need to change; js/schedule.js's new
//    "Cancel Due to Weather" button passes 'game'.
//    window.renderPracticeCancelSection / window.renderGameCancelSection
//    are now thin wrappers around one shared renderEventCancelSection.
//
// 3. computeEndsAt() now adds a 30-minute grace period on top of whatever
//    end time it lands on (explicit endTime, or the default-duration
//    fallback below) -- "If practice is from 530 to 730, then it would
//    turn off at 800." Games don't carry their own endTime field (just
//    arrive/warm-up/gameTime), so they get the same 120-minute default
//    duration js/calendar-export.js already assumes for a game with no
//    other info, the same way a practice with no endTime falls back to
//    105 minutes.
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
  // How long the full-screen notice stays up after the coach hits Cancel --
  // whatever real end time the event has (or a sane default duration when
  // it doesn't), PLUS a fixed grace window. Nathan: "If practice is from
  // 530 to 730, then it would turn off at 800" -- 30 minutes past the
  // scheduled end, every time, regardless of event type.
  const END_GRACE_MIN = 30;
  // A practice with no endTime saved yet still needs a real cutoff -- same
  // 105-minute default calendar-export.js already falls back to for a
  // start-only practice (minutesBetween(...) || 105). Games don't have an
  // endTime field at all (just arrive/warm-up/gameTime), so they use
  // calendar-export.js's own 120-minute game default instead.
  const DEFAULT_DURATION_MIN = { practice: 105, game: 120 };
  function computeEndsAt(event, eventType) {
    if (!event || !event.date) return null;
    const dparts = event.date.split('-').map(Number);
    if (dparts.length !== 3 || dparts.some(isNaN)) return null;
    const [y, mo, d] = dparts;
    const startTimeStr = eventType === 'game' ? (event.gameTime || event.time) : event.time;
    let totalMin;
    if (event.endTime) {
      const t = event.endTime.split(':').map(Number);
      totalMin = t[0] * 60 + t[1];
    } else if (startTimeStr) {
      const t = startTimeStr.split(':').map(Number);
      totalMin = t[0] * 60 + t[1] + (DEFAULT_DURATION_MIN[eventType] || 105);
    } else {
      totalMin = 23 * 60 + 59; // no time at all on file -- default to end of that day
    }
    totalMin += END_GRACE_MIN;
    const eh = Math.floor(totalMin / 60) % 24;
    const em = totalMin % 60;
    // Carry the date forward a day for every 24h the grace period pushed
    // past midnight (only realistically matters for the end-of-day
    // fallback above landing right at the grace window).
    const dayOverflow = Math.floor(totalMin / (24 * 60));
    if ([eh, em].some(isNaN)) return null;
    return new Date(y, mo - 1, d + dayOverflow, eh, em, 0, 0);
  }
  function fmtEventMeta(event, eventType) {
    const dateLabel = fmtDateLocal(event.date);
    let timeLabel = '';
    if (eventType === 'game') {
      const t = event.gameTime || event.time;
      timeLabel = t ? `Kickoff ${to12h(t)}` : '';
    } else {
      timeLabel = event.time ? (event.endTime ? `${to12h(event.time)} – ${to12h(event.endTime)}` : to12h(event.time)) : '';
    }
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

  // Shared by every place a notice gets activated (window.
  // activatePracticeCancellation, called from both js/practices.js's and
  // js/schedule.js's "Cancel Due to Weather" buttons) so none of them can
  // forget the noticeId confirmation-tracking needs.
  function buildCancelSetting(message, eventId, eventLabel, endsAtDate, eventType) {
    return {
      active: true,
      message,
      eventId: eventId || null,
      eventLabel: eventLabel || null,
      eventType: eventType || 'practice',
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

  // ---- Lightning flash + rain + thunder audio -- ported from the LYBS
  // Cards app (natesteele888/lybs-cards, its fireCardAmbientBolt()/
  // startAmbientAudio()/spawnRain() functions) per Nathan: "Let's now
  // reference the LYBS cards app. This has a better understanding of
  // lightning I want, also added a sound file with a thunderstorm going."
  // The same "AMBIENT_FLASH_TIMES scheduled against the real audio's
  // playback position" sync idea as that app -- but reading a plain
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

  // Nathan (7th pass): "instead of the lightning bolts and the lines on
  // the screen... just have the lightning in the background photo get
  // super bright and dim with the lightning." Replaces the old drawn-SVG-
  // bolt-plus-white-screen-flash pair with a single filter:brightness()
  // pulse directly on .cancelSky -- the photo's own real lightning bolt is
  // what visibly flashes, same randomized peak/decay feel as a real strike
  // instead of a fixed value.
  function flashSkyPhoto() {
    const sky = document.querySelector('#cancelNoticeOverlay .cancelSky');
    if (!sky) return;
    const peak = 1.9 + Math.random() * 0.9;
    sky.style.transition = 'none';
    sky.style.filter = `brightness(${peak})`;
    void sky.offsetWidth; // force reflow so the fade-out below actually animates
    const fadeMs = 300 + Math.random() * 250;
    sky.style.transition = `filter ${fadeMs}ms ease-out`;
    sky.style.filter = 'brightness(1)';
  }

  let _flashRaf = null;
  let _flashFallbackTimer = null;
  let _flashNextIdx = 0;
  let _flashLastElapsed = 0;

  function stopFlash() {
    if (_flashRaf) { cancelAnimationFrame(_flashRaf); _flashRaf = null; }
    if (_flashFallbackTimer) { clearTimeout(_flashFallbackTimer); _flashFallbackTimer = null; }
    const sky = document.querySelector('#cancelNoticeOverlay .cancelSky');
    if (sky) { sky.style.transition = 'none'; sky.style.filter = 'brightness(1)'; }
  }

  // Flashes fire in sync with the real thunder hits in thunder-loop.mp3,
  // reading the playing <audio> element's own currentTime each frame --
  // same idea as LYBS's _scheduleAmbientFlashCheck, just against
  // HTMLMediaElement.currentTime instead of an AudioContext clock.
  function startSyncedFlashes(audioEl) {
    _flashNextIdx = 0;
    _flashLastElapsed = 0;
    function tick() {
      if (!audioEl || audioEl.paused || audioEl.ended) { _flashRaf = null; return; }
      const elapsed = audioEl.currentTime % LOOP_DURATION;
      if (elapsed < _flashLastElapsed) _flashNextIdx = 0; // loop wrapped
      _flashLastElapsed = elapsed;
      while (_flashNextIdx < AMBIENT_FLASH_TIMES.length && elapsed >= AMBIENT_FLASH_TIMES[_flashNextIdx]) {
        flashSkyPhoto();
        _flashNextIdx++;
      }
      _flashRaf = requestAnimationFrame(tick);
    }
    _flashRaf = requestAnimationFrame(tick);
  }

  // If the browser's autoplay policy blocks the thunder audio (e.g. the
  // panel appears on first load before any tap has happened), the storm
  // still needs to feel alive -- fall back to random 2-6s flashes, same as
  // LYBS's own startCardLightning() fallback rhythm.
  function startFallbackFlashes() {
    function scheduleNext() {
      const delay = 2000 + Math.random() * 4000;
      _flashFallbackTimer = setTimeout(() => {
        const overlay = document.getElementById('cancelNoticeOverlay');
        if (!overlay || !overlay.classList.contains('show')) { _flashFallbackTimer = null; return; }
        flashSkyPhoto();
        if (Math.random() > 0.65) setTimeout(flashSkyPhoto, 120 + Math.random() * 180);
        scheduleNext();
      }, delay);
    }
    scheduleNext();
  }

  // Nathan (7th pass): "use the rain drops from the LYBS card app" -- a
  // straight port of that app's spawnRain()/.raindrop technique
  // (individually randomized falling streaks) in place of the single
  // scrolling repeating-gradient rain texture the 4th pass had been using.
  // Spawned once each time the panel opens and cleared when it closes
  // (see showPanel/hidePanel below), same lifecycle as the thunder audio.
  const RAIN_DROP_COUNT = 120;
  function spawnCancelRain() {
    const host = document.getElementById('cancelRainHost');
    if (!host || host.childElementCount) return; // already spawned for this show
    for (let i = 0; i < RAIN_DROP_COUNT; i++) {
      const drop = document.createElement('div');
      drop.className = 'cancelRaindrop';
      const left = Math.random() * 102;       // % across screen
      const len = 12 + Math.random() * 28;    // streak length px
      const dur = 0.5 + Math.random() * 0.8;  // fall speed
      const delay = -(Math.random() * dur * 4); // stagger start
      const opacity = 0.15 + Math.random() * 0.3;
      const angle = -5 + Math.random() * 10;  // slight diagonal
      drop.style.cssText = `left:${left}%;top:-5%;height:${len}px;opacity:${opacity};` +
        `transform:rotate(${angle}deg);animation-duration:${dur}s;animation-delay:${delay}s`;
      host.appendChild(drop);
    }
  }
  function clearCancelRain() {
    const host = document.getElementById('cancelRainHost');
    if (host) host.innerHTML = '';
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
    if (prefersReducedMotion()) return; // skip flashes + audio entirely
    const audioEl = document.getElementById('cancelThunderAudio');
    if (!audioEl) { startFallbackFlashes(); return; }
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
      startSyncedFlashes(audioEl);
    };
    const onBlocked = () => { if (myToken === _audioOpToken) startFallbackFlashes(); }; // autoplay refused -- still storm, just unsynced
    if (p && p.then) p.then(onOk).catch(onBlocked);
    else onOk();
  }

  function stopThunder() {
    stopFlash();
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
    const isGame = setting.eventType === 'game';
    const headerEl = document.getElementById('cancelNoticeHeaderText');
    const msgEl = document.getElementById('cancelNoticeMessageText');
    const metaEl = document.getElementById('cancelNoticeMetaText');
    if (headerEl) headerEl.textContent = isGame ? 'Game Canceled' : 'Practice Canceled';
    if (msgEl) msgEl.textContent = setting.message || (isGame ? 'This game has been canceled.' : 'Practice has been canceled.');
    if (metaEl) metaEl.textContent = setting.eventLabel ? setting.eventLabel : `Notice ends ${fmtEndsAt(setting.endsAt)}`;
    // Games use Nathan's separate game-day storm photo (assets/images/
    // cancel-storm-game.jpg) -- see the .cancelSky.game rule in
    // css/styles.css -- practices keep the original field photo.
    overlay.classList.toggle('game', isGame);
    shownUpdatedAt = setting.updatedAt;
    shownNoticeId = setting.noticeId || null;
    if (!overlay.classList.contains('show')) {
      overlay.classList.add('show');
      if (!prefersReducedMotion()) spawnCancelRain();
      playThunder();
    }
  }
  function hidePanel() {
    const overlay = document.getElementById('cancelNoticeOverlay');
    if (overlay && overlay.classList.contains('show')) {
      overlay.classList.remove('show');
      clearCancelRain();
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

  // Shared by window.deactivatePracticeCancellation below (the game/
  // practice-detail "End Notice Now" link -- the only way to end a notice
  // now that the Coach Tools > Settings form is gone).
  function deactivateCancelSetting(afterOk, afterFail) {
    loadCancelSetting().then(setting => {
      if (!setting) { if (afterOk) afterOk(); return; }
      const updated = Object.assign({}, setting, { active: false, updatedAt: new Date().toISOString() });
      saveCancelSetting(updated, afterOk, afterFail);
    });
  }

  // ---- Game/practice-detail "Cancel Due to Weather" (js/schedule.js,
  // js/practices.js) ----
  // Nathan: "coaches should have an option of going into the schedule,
  // clicking on the practice and a cancel due to weather button, that you
  // confirm and it creates the active push notice until the end of the
  // event time for that day" -- and later, "It should be available to
  // coaches when they click into a scheduled game or practice" (not Coach
  // Tools). There's still only ever ONE active notice team-wide.
  //
  // eventType defaults to 'practice' so js/practices.js's existing 4-arg
  // call site didn't need to change; js/schedule.js's game button passes
  // 'game' explicitly.
  window.activatePracticeCancellation = function (eventId, message, afterOk, afterFail, eventType) {
    eventType = eventType || 'practice';
    const items = (eventType === 'game'
      ? (window.getGamesCached ? window.getGamesCached() : [])
      : (window.getPracticesCached ? window.getPracticesCached() : []));
    const event = items.find(x => x.id === eventId);
    if (!event) { if (afterFail) afterFail(`${eventType === 'game' ? 'Game' : 'Practice'} not found.`); return; }
    const endsAtDate = computeEndsAt(event, eventType);
    if (!endsAtDate || isNaN(endsAtDate.getTime()) || endsAtDate.getTime() <= Date.now()) {
      if (afterFail) afterFail(`This ${eventType} has already ended.`);
      return;
    }
    const finalMessage = (message && message.trim()) ||
      (eventType === 'game'
        ? 'This game is canceled due to weather. Stay safe -- see you next time!'
        : 'Practice is canceled due to lightning in the area. Stay safe -- see you next time!');
    const setting = buildCancelSetting(finalMessage, eventId, fmtEventMeta(event, eventType), endsAtDate, eventType);
    saveCancelSetting(setting, afterOk, afterFail);
  };
  window.deactivatePracticeCancellation = deactivateCancelSetting;

  // Nathan: "Coaches should see if in the canceled practice how many have
  // confirmed in the app during the cancellation period." Renders into a
  // wrap <div> that the game/practice-detail view provides (same "owns its
  // own section, called from renderDetail()" pattern as js/drone-footage.js's
  // window.renderDroneFootageSection). Three states: no notice tied to
  // this event yet (show the Cancel button, coaches only), a notice tied
  // to THIS event that's still active (red status + live confirm count +
  // End Notice Now), or one that already ended (same confirm count, kept
  // around as a record instead of just vanishing the moment it expires).
  //
  // window.renderPracticeCancelSection(practice) and
  // window.renderGameCancelSection(game) are thin wrappers so
  // js/practices.js and js/schedule.js each just call the one that matches
  // what they're rendering.
  function renderEventCancelSection(wrapId, event, eventType) {
    const wrap = document.getElementById(wrapId);
    if (!wrap || !event || !event.id) return;
    const savedItems = (eventType === 'game'
      ? (window.getGamesCached ? window.getGamesCached() : [])
      : (window.getPracticesCached ? window.getPracticesCached() : []));
    if (!savedItems.some(x => x.id === event.id)) { wrap.innerHTML = ''; return; } // not saved yet -- nothing to cancel
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;

    loadCancelSetting().then(setting => {
      if (document.getElementById(wrapId) !== wrap) return; // coach navigated on while this was loading
      const tiedToThisEvent = setting && setting.eventId === event.id && setting.eventType === eventType;
      if (tiedToThisEvent) {
        renderCancelStatusBlock(wrap, event, eventType, setting, approved, isActiveNow(setting));
      } else if (approved) {
        renderCancelButton(wrap, event, eventType);
      } else {
        wrap.innerHTML = '';
      }
    });
  }

  function renderCancelButton(wrap, event, eventType) {
    const endsAtDate = computeEndsAt(event, eventType);
    if (!endsAtDate || isNaN(endsAtDate.getTime()) || endsAtDate.getTime() <= Date.now()) {
      wrap.innerHTML = ''; // already over -- nothing left to cancel
      return;
    }
    const btnId = eventType === 'game' ? 'gameCancelWeatherBtn' : 'practiceCancelWeatherBtn';
    wrap.innerHTML = `<div style="margin:12px 0;">
      <button type="button" class="navBtn danger" id="${btnId}" style="display:block;width:100%;text-align:center;box-sizing:border-box;">⛈️ Cancel Due to Weather</button>
    </div>`;
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!confirm(`Cancel this ${eventType} due to weather?\n\nEveryone will get a full-screen notice until it ends. This replaces any other active cancellation notice.`)) return;
      btn.disabled = true;
      btn.textContent = 'Canceling…';
      window.activatePracticeCancellation(event.id, null, () => {
        renderEventCancelSection(wrap.id, event, eventType);
      }, msg => {
        btn.disabled = false;
        btn.textContent = '⛈️ Cancel Due to Weather';
        alert(`Could not cancel: ${msg}`);
      }, eventType);
    });
  }

  function renderCancelStatusBlock(wrap, event, eventType, setting, approved, active) {
    const header = active
      ? `<div class="lbSectionHeader" style="text-align:center;color:#c62828;">🚨 Canceled Due to Weather</div>
         <div class="lbSub" style="text-align:center;margin:2px 0 8px;">"${escapeHtml(setting.message)}"<br>Notice ends ${escapeHtml(fmtEndsAt(setting.endsAt))}</div>`
      : `<div class="lbSub" style="text-align:center;margin:10px 0 4px;">⛈️ This ${eventType} was canceled due to weather.</div>`;
    // Confirmation names are coach-only -- everyone else already got the
    // popup itself; who-tapped-what isn't really their business to browse.
    const countLine = approved ? `<div class="lbSub" style="text-align:center;margin-bottom:8px;" id="eventCancelConfirmCount">Loading confirmations…</div>` : '';
    const endBtn = active && approved ? `<div style="text-align:center;"><button type="button" class="lbLinkBtn" id="eventCancelEndBtn">End Notice Now</button></div>` : '';
    wrap.innerHTML = header + countLine + endBtn;

    if (approved) {
      loadConfirmations(setting.noticeId).then(confirmations => {
        const el = document.getElementById('eventCancelConfirmCount');
        if (!el) return;
        const names = confirmations ? Object.values(confirmations).map(c => c && c.name).filter(Boolean).sort() : [];
        el.textContent = names.length
          ? `✅ ${names.length} confirmed${active ? '' : ' while it was active'}: ${names.join(', ')}`
          : (setting.noticeId ? 'No one has confirmed yet.' : 'Confirmations weren’t tracked for this older notice.');
      });
    }
    const endBtnEl = document.getElementById('eventCancelEndBtn');
    if (endBtnEl) {
      endBtnEl.addEventListener('click', () => {
        if (!confirm('End this cancellation notice now?')) return;
        endBtnEl.disabled = true;
        window.deactivatePracticeCancellation(() => renderEventCancelSection(wrap.id, event, eventType), msg => {
          alert(`Could not end notice: ${msg}`);
          endBtnEl.disabled = false;
        });
      });
    }
  }

  window.renderPracticeCancelSection = function (practice) { renderEventCancelSection('practiceCancelSection', practice, 'practice'); };
  window.renderGameCancelSection = function (game) { renderEventCancelSection('gameCancelSection', game, 'game'); };
})();

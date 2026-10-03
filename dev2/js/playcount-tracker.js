// ---------------------------------------------------------------------------
// Coach Tools > Play Count -- Nathan: "we also need a section in the coaches
// area for live in game tracking of plays for certain kids. There is a
// minimum number of plays so certain kids need to be tracked to make sure
// they have at least 8-10 plays. We need a spot to add players with numbers
// so they can be sorted. and then be able to say there are in on a snap and
// log it with a confirmation step. It should show a bar of how many they
// need with a red yellow or green status. we should have the options to
// define number of plays on the screen, then add players and then track
// them on the track next page."
//
// Three steps, matching that exact flow: Setup (the target play count) ->
// Players (which kids need tracking, by jersey #, auto-named off the real
// Team Roster -- same rosterByNum() idiom js/depth-chart.js already
// established) -> Track (the live, sideline screen).
//
// Per-game, full-screen -- Nathan's follow-up, after the first version
// shipped as one ongoing Coach Tools panel: "add a plays counts tab here
// on the Game preview page. The tracking is per game and changes per week.
// Let's make sure it's independent to each game so we can go back to check
// it out... I also want the Play Counts tab to open full screen with an X
// to close out of it. It should retain numbers so if it is closed, you can
// go back to the game and continue play counts." Each real schedule game
// now gets its own, fully independent record (dev2PlayData/
// playCountTracker/<gameId>) instead of one flat global node -- closing
// the overlay just hides it (Firebase data untouched), and the "New Game"
// reset from the old single-session design is now "Reset This Game" --
// switching which game you're tracking is the picker screen's job, not a
// destructive action. Overlay chrome copies js/gameplan-builder.js's own
// full-screen convention exactly (entered/exited outside window.setMode(),
// real NavHistory back-button support).
//
// Resume prompt -- Nathan: "If you exit the app and you want to keep doing
// the play counts - there should be a pop up window that asks the person,
// you are current counting plays for a live game, do you want to continue?
// Yes or No." window.checkPlayCountResume(), called once from boot() (see
// index.html), reads a small localStorage marker (device-local, not
// Firebase -- this is "did THIS coach leave a session open," not shared
// state) set whenever a specific game's tracker is actually opened, and
// only cleared by an explicit "No" answer -- never by just closing the
// overlay, matching "retain numbers... go back and continue."
//
// Confirm-before-logging: tapping a player's row ARMS it (a visibly
// different highlighted state, "Tap again to confirm"), not a full modal --
// a coach may do this many times a game, and a modal for every single snap
// would be real friction on the sideline. Tapping the SAME row again while
// armed logs it; tapping elsewhere, waiting a few seconds, or the explicit
// ✕ cancels back to normal. Same two-tap idiom js/ball-path-editor.js's own
// addPlayer() already uses ("tap the same player again to undo").
// ---------------------------------------------------------------------------
(function () {

  const ACTIVE_SESSION_KEY = 'bengalsActivePlayCountSession';
  const ARM_TIMEOUT_MS = 4000;

  let state = {
    gameId: '', gameLabel: '',
    targetPlays: 8,
    players: [], // [{id, num, name, count}]
    log: [],     // [{playerId, ts}] -- most recent last
  };
  let loaded = false;
  let step = 'setup'; // 'setup' | 'players' | 'track'
  let armedPlayerId = null;
  let armTimer = null;
  let games = [];

  function trackerUrl(gameId) {
    return `${FIREBASE_DB_URL}/playCountTracker/${encodeURIComponent(gameId)}.json`;
  }

  function genId() {
    return 'pc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  // Same numeric-rank idiom js/depth-chart.js's own rosterByNum/sort
  // already established -- blank/non-numeric # sorts to the bottom, not
  // clumped at "0".
  function rank(num) {
    return (num === '' || num == null || isNaN(Number(num))) ? Infinity : Number(num);
  }
  function rosterByNum() {
    const map = {};
    (window.getTeamRosterCached ? window.getTeamRosterCached() : []).forEach(p => { map[String(p.num)] = p; });
    return map;
  }
  function sortedPlayers() {
    return state.players.slice().sort((a, b) => rank(a.num) - rank(b.num));
  }

  function gameLabelFor(g) {
    return `${g.homeAway === 'Away' ? '@' : 'vs'} ${g.opponent || 'TBD'} — ${g.date || ''}`;
  }

  function normalize(data, gameId, gameLabel) {
    if (!data || typeof data !== 'object') return { gameId, gameLabel, targetPlays: 8, players: [], log: [] };
    return {
      gameId, gameLabel,
      targetPlays: Number.isFinite(Number(data.targetPlays)) && Number(data.targetPlays) > 0 ? Number(data.targetPlays) : 8,
      players: Array.isArray(data.players) ? data.players.map(p => ({
        id: p.id || genId(), num: String(p.num || ''), name: p.name || '', count: Number.isFinite(Number(p.count)) ? Number(p.count) : 0,
      })) : [],
      log: Array.isArray(data.log) ? data.log.filter(e => e && e.playerId) : [],
    };
  }

  function load(gameId, gameLabel) {
    return window.firebaseAuthed(trackerUrl(gameId)).then(url => fetch(url, { cache: 'no-store' })).then(r => r.ok ? r.json() : null)
      .then(data => { state = normalize(data, gameId, gameLabel); loaded = true; return state; })
      .catch(err => {
        console.error('Could not load Play Count Tracker:', err);
        state = { gameId, gameLabel, targetPlays: 8, players: [], log: [] };
        loaded = true;
        return state;
      });
  }

  function setStatus(text, isError) {
    const el = document.getElementById('pctStatus');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#c0392b' : '';
  }

  function persist(afterOk, afterFail) {
    const payload = { targetPlays: state.targetPlays, players: state.players, log: state.log, updatedAt: new Date().toISOString() };
    window.firebaseAuthed(trackerUrl(state.gameId)).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })).then(r => {
      if (r.ok) { if (afterOk) afterOk(); }
      else if (afterFail) afterFail(`HTTP ${r.status}`);
    }).catch(err => {
      console.error('Play Count Tracker save failed:', err);
      if (afterFail) afterFail(err.message);
    });
  }

  function saveAndRerender() {
    setStatus('Saving…');
    persist(() => { setStatus('Saved'); setTimeout(() => setStatus(''), 1200); },
      msg => setStatus('Save failed: ' + msg, true));
    render();
  }

  function clearArm() {
    armedPlayerId = null;
    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
  }

  // ---- Setup step ----
  function setTarget(n) {
    const v = Math.max(1, Math.min(30, Math.round(n)));
    if (v === state.targetPlays) return;
    state.targetPlays = v;
    saveAndRerender();
  }

  // ---- Players step ----
  function addPlayerByNum(numRaw) {
    const num = String(numRaw || '').trim();
    if (!num) return;
    if (state.players.some(p => p.num === num)) { setStatus(`#${num} is already being tracked.`, true); return; }
    const roster = rosterByNum();
    const rosterEntry = roster[num];
    state.players.push({ id: genId(), num, name: rosterEntry ? rosterEntry.name : '', count: 0 });
    saveAndRerender();
  }
  function removePlayer(playerId) {
    const p = state.players.find(x => x.id === playerId);
    if (!p) return;
    if (!confirm(`Stop tracking #${p.num}${p.name ? ' ' + p.name : ''}? Their count will be lost.`)) return;
    state.players = state.players.filter(x => x.id !== playerId);
    state.log = state.log.filter(e => e.playerId !== playerId);
    saveAndRerender();
  }

  // ---- Track step ----
  function armPlayer(playerId) {
    if (armedPlayerId === playerId) { confirmLog(playerId); return; }
    clearArm();
    armedPlayerId = playerId;
    armTimer = setTimeout(() => { clearArm(); render(); }, ARM_TIMEOUT_MS);
    render();
  }
  function cancelArm() {
    clearArm();
    render();
  }
  function confirmLog(playerId) {
    clearArm();
    const p = state.players.find(x => x.id === playerId);
    if (!p) { render(); return; }
    p.count += 1;
    state.log.push({ playerId, ts: Date.now() });
    saveAndRerender();
  }
  function undoLast() {
    const last = state.log.pop();
    if (!last) return;
    const p = state.players.find(x => x.id === last.playerId);
    if (p && p.count > 0) p.count -= 1;
    saveAndRerender();
  }
  function resetThisGame() {
    if (!confirm(`Reset play counts for ${state.gameLabel || 'this game'}? Every tracked player's count goes back to 0 -- the target and player list stay the same.`)) return;
    state.players.forEach(p => { p.count = 0; });
    state.log = [];
    clearArm();
    saveAndRerender();
  }

  // ---- Status bar ----
  // Red < 50% of target, yellow 50-99%, green 100%+ -- same plain red/
  // amber/green language the app's own W/L badges and 2-Minute Drill
  // banners already use (#c62828/#f9a825/#2e7d32), not new colors.
  function statusColor(count, target) {
    const pct = target > 0 ? count / target : 0;
    if (pct >= 1) return '#2e7d32';
    if (pct >= 0.5) return '#f9a825';
    return '#c62828';
  }
  function barHtml(p) {
    const pct = Math.max(0, Math.min(1, state.targetPlays > 0 ? p.count / state.targetPlays : 0));
    const color = statusColor(p.count, state.targetPlays);
    return `
      <div class="pctBarTrack">
        <div class="pctBarFill" style="width:${Math.round(pct * 100)}%;background:${color};"></div>
        <div class="pctBarLabel">${p.count} / ${state.targetPlays}</div>
      </div>`;
  }

  function stepTabsHtml() {
    const steps = [['setup', '1. Target'], ['players', '2. Players'], ['track', '3. Track']];
    return `<div class="coachToolsModuleTabs" style="margin-bottom:14px;">${steps.map(([key, label]) =>
      `<button type="button" class="coachToolsModuleTab${step === key ? ' active' : ''}" data-step="${key}">${label}</button>`
    ).join('')}</div>`;
  }

  function setupStepHtml() {
    return `
      <div class="pctSetupCard">
        <div class="lbSub" style="text-align:center;margin-bottom:10px;">Minimum plays each tracked player needs this game</div>
        <div class="pctTargetRow">
          <button type="button" class="pctStepBtn" data-act="target-down">−</button>
          <div class="pctTargetValue" id="pctTargetValue">${state.targetPlays}</div>
          <button type="button" class="pctStepBtn" data-act="target-up">+</button>
        </div>
        <button type="button" class="navBtn" id="pctToPlayersBtn" style="display:block;width:100%;margin-top:18px;">Next: Add Players ›</button>
      </div>`;
  }

  function playersStepHtml() {
    const rows = sortedPlayers().map(p => `
      <div class="pctPlayerRow" data-id="${escapeHtml(p.id)}">
        <span class="pctPlayerNum">#${escapeHtml(p.num)}</span>
        <span class="pctPlayerName">${escapeHtml(p.name || 'Not on roster')}</span>
        <button type="button" class="pctIconBtn pctRemoveBtn" data-act="remove" title="Stop tracking">✕</button>
      </div>`).join('');
    return `
      <div class="pctAddRow">
        <input type="text" inputmode="numeric" id="pctAddNumInput" class="pctAddInput" placeholder="Jersey #">
        <button type="button" class="navBtn secondary" id="pctAddBtn" style="width:auto;">+ Add</button>
      </div>
      <div class="pctPlayerList">${rows || '<div class="lbEmpty">No players added yet -- add the kids who need a minimum play count.</div>'}</div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button type="button" class="navBtn secondary" id="pctBackToSetupBtn" style="flex:1;">‹ Back</button>
        <button type="button" class="navBtn" id="pctToTrackBtn" style="flex:1;" ${state.players.length ? '' : 'disabled'}>Start Tracking ›</button>
      </div>`;
  }

  function trackStepHtml() {
    const last = state.log.length ? state.log[state.log.length - 1] : null;
    const lastPlayer = last ? state.players.find(p => p.id === last.playerId) : null;
    const rows = sortedPlayers().map(p => {
      const isArmed = armedPlayerId === p.id;
      return `
        <button type="button" class="pctTrackRow${isArmed ? ' armed' : ''}" data-id="${escapeHtml(p.id)}">
          <span class="pctTrackTop">
            <span class="pctPlayerNum">#${escapeHtml(p.num)}</span>
            <span class="pctPlayerName">${escapeHtml(p.name || 'Not on roster')}</span>
          </span>
          ${isArmed
            ? `<span class="pctArmedHint">Tap again to log a play for #${escapeHtml(p.num)} <span class="pctCancelX" data-act="cancel-arm">✕ cancel</span></span>`
            : barHtml(p)}
        </button>`;
    }).join('');
    return `
      <div class="pctTrackHeader">
        <span class="lbSub">Tap a player once they're confirmed in on a snap.</span>
        <button type="button" class="pctIconBtn" id="pctUndoBtn" title="Undo last logged play" ${last ? '' : 'disabled'}>↩ Undo${lastPlayer ? ` (#${escapeHtml(lastPlayer.num)})` : ''}</button>
      </div>
      <div class="pctTrackList">${rows || '<div class="lbEmpty">No players added yet.</div>'}</div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button type="button" class="lbLinkBtn" id="pctEditPlayersBtn">‹ Target / Players</button>
        <button type="button" class="navBtn danger" id="pctResetGameBtn" style="margin-left:auto;">🔄 Reset This Game</button>
      </div>`;
  }

  function render() {
    const wrap = document.getElementById('pctBody');
    if (!wrap) return;
    if (!loaded) { wrap.innerHTML = '<div class="lbEmpty">Loading…</div>'; return; }

    const bodyHtml = step === 'setup' ? setupStepHtml() : step === 'players' ? playersStepHtml() : trackStepHtml();
    wrap.innerHTML = stepTabsHtml() + bodyHtml + '<div id="pctStatus" class="lbSub" style="margin-top:10px;text-align:center;"></div>';

    wrap.querySelectorAll('.coachToolsModuleTab').forEach(btn => {
      btn.addEventListener('click', () => { clearArm(); step = btn.getAttribute('data-step'); render(); });
    });

    if (step === 'setup') {
      wrap.querySelector('[data-act="target-down"]').addEventListener('click', () => setTarget(state.targetPlays - 1));
      wrap.querySelector('[data-act="target-up"]').addEventListener('click', () => setTarget(state.targetPlays + 1));
      document.getElementById('pctToPlayersBtn').addEventListener('click', () => { step = 'players'; render(); });
    } else if (step === 'players') {
      const input = document.getElementById('pctAddNumInput');
      const submit = () => { addPlayerByNum(input.value); input.value = ''; input.focus(); };
      document.getElementById('pctAddBtn').addEventListener('click', submit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      wrap.querySelectorAll('.pctPlayerRow').forEach(row => {
        const id = row.getAttribute('data-id');
        row.querySelector('[data-act="remove"]').addEventListener('click', () => removePlayer(id));
      });
      document.getElementById('pctBackToSetupBtn').addEventListener('click', () => { step = 'setup'; render(); });
      const toTrack = document.getElementById('pctToTrackBtn');
      if (toTrack) toTrack.addEventListener('click', () => { step = 'track'; render(); });
    } else {
      wrap.querySelectorAll('.pctTrackRow').forEach(row => {
        const id = row.getAttribute('data-id');
        row.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-act="cancel-arm"]')) { cancelArm(); return; }
          armPlayer(id);
        });
      });
      const undoBtn = document.getElementById('pctUndoBtn');
      if (undoBtn) undoBtn.addEventListener('click', undoLast);
      document.getElementById('pctEditPlayersBtn').addEventListener('click', () => { clearArm(); step = 'players'; render(); });
      document.getElementById('pctResetGameBtn').addEventListener('click', resetThisGame);
    }
  }

  // ---- Active-session marker (resume prompt) -- device-local, not shared
  // Firebase state. Set whenever a specific game's tracker is actually
  // shown; cleared only by an explicit "No" at the resume prompt. ----
  function markActiveSession(gameId, gameLabel) {
    try { localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ gameId, gameLabel })); } catch (e) { /* private mode, etc -- resume prompt just won't fire next time */ }
  }
  function clearActiveSession() {
    try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch (e) { /* ignore */ }
  }

  // ---- Game picker screen ----
  function renderGameList() {
    const list = document.getElementById('pctGameList');
    if (!list) return;
    list.innerHTML = '';
    games.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).forEach(g => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gpbOpponentBtn';
      btn.textContent = gameLabelFor(g);
      btn.addEventListener('click', () => openForGame(g.id, gameLabelFor(g)));
      list.appendChild(btn);
    });
    if (!games.length) list.innerHTML = '<div class="lbEmpty">No games on the schedule yet -- add one in Schedule first.</div>';
  }

  function showGamePicker() {
    const gameScreen = document.getElementById('pctGameScreen');
    const trackerScreen = document.getElementById('pctTrackerScreen');
    if (gameScreen) gameScreen.style.display = '';
    if (trackerScreen) trackerScreen.style.display = 'none';
    const subtitle = document.getElementById('pctSubtitle');
    if (subtitle) subtitle.textContent = '';
    renderGameList();
  }

  function openForGame(gameId, gameLabel) {
    const gameScreen = document.getElementById('pctGameScreen');
    const trackerScreen = document.getElementById('pctTrackerScreen');
    if (gameScreen) gameScreen.style.display = 'none';
    if (trackerScreen) trackerScreen.style.display = '';
    const subtitle = document.getElementById('pctSubtitle');
    if (subtitle) subtitle.textContent = gameLabel;
    loaded = false;
    const wrap = document.getElementById('pctBody');
    if (wrap) wrap.innerHTML = '<div class="lbEmpty">Loading…</div>';
    const rosterReady = window.isTeamRosterLoaded && window.isTeamRosterLoaded()
      ? Promise.resolve()
      : (window.loadTeamRoster ? window.loadTeamRoster() : Promise.resolve());
    Promise.all([rosterReady, load(gameId, gameLabel)]).then(() => {
      // Land on Track directly once players are already set up (the
      // common case after the first open for this game) -- Setup/Players
      // stay one tap away via "‹ Target / Players", not re-shown every
      // single open.
      step = state.players.length ? 'track' : 'setup';
      render();
      markActiveSession(gameId, gameLabel);
    });
  }

  function closeOverlay() {
    const overlay = document.getElementById('playCountOverlay');
    if (overlay) { overlay.classList.remove('show'); overlay.style.display = 'none'; }
  }

  function playCountBackUndo() {
    closeOverlay();
  }

  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    const closeBtn = document.getElementById('pctCloseBtn');
    closeBtn.addEventListener('click', () => {
      if (window.NavHistory && window.NavHistory.depth() > 0) window.NavHistory.goBack();
      else closeOverlay();
    });
    const switchBtn = document.getElementById('pctSwitchGameBtn');
    switchBtn.addEventListener('click', () => { clearArm(); showGamePicker(); });
  }

  // Entry point -- either a specific game's own detail page (js/schedule.js's
  // "🎯 Play Counts" button, gameId/gameLabel already known) or Coach Tools'
  // own "🎯 Play Count" tab (no args -- shows the game picker first). Always
  // does its own fresh load of the real schedule, same "self-contained"
  // precedent js/gameplan-builder.js/js/two-minute-drill.js already use.
  window.openPlayCountTracker = function (gameId, gameLabel) {
    const overlay = document.getElementById('playCountOverlay');
    if (!overlay) return;
    wire();
    overlay.classList.add('show');
    overlay.style.display = 'block';
    // Same fix js/two-minute-drill.js's/js/gameplan-builder.js's own open
    // functions already established: the inline background default in
    // index.html is a deliberate stale-CSS fallback, corrected here now
    // that the real theme is known.
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    overlay.style.background = isDark ? '#161616' : '#f4f2ee';
    if (window.NavHistory) window.NavHistory.push('playcount', playCountBackUndo);
    (window.ensureGamesLoaded ? window.ensureGamesLoaded() : Promise.resolve([])).then(list => {
      games = list || [];
      if (gameId) {
        const match = games.find(g => g.id === gameId);
        openForGame(gameId, gameLabel || (match ? gameLabelFor(match) : ''));
      } else {
        showGamePicker();
      }
    });
  };

  // Kept as the real Coach Tools tab's init -- always opens straight into
  // the game picker (no game is implied by that entry point).
  window.initPlayCountTracker = function () {
    window.openPlayCountTracker();
  };

  // ---- Resume prompt -- called once from boot() (index.html), after auth
  // and the real schedule data are both ready. Only ever shows for an
  // approved coach (play counting is a coach-only action) and only when a
  // marker from a previous open is still sitting in localStorage. ----
  window.checkPlayCountResume = function () {
    if (!(window.isApprovedCoachProfile && window.isApprovedCoachProfile())) return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved || !saved.gameId) return;
    const overlay = document.getElementById('pctResumeOverlay');
    const textEl = document.getElementById('pctResumeText');
    const yesBtn = document.getElementById('pctResumeYesBtn');
    const noBtn = document.getElementById('pctResumeNoBtn');
    if (!overlay || !yesBtn || !noBtn) return;
    if (textEl) textEl.textContent = `You're currently counting plays for ${saved.gameLabel || 'a game'}.`;
    overlay.classList.add('show');
    overlay.style.display = 'flex';
    const cleanup = () => { overlay.classList.remove('show'); overlay.style.display = 'none'; };
    yesBtn.onclick = () => { cleanup(); window.openPlayCountTracker(saved.gameId, saved.gameLabel); };
    noBtn.onclick = () => { clearActiveSession(); cleanup(); };
  };
})();

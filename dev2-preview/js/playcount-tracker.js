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
// established) -> Track (the live, sideline screen). Deliberately not tied
// to a specific Schedule game id -- this is one ongoing session a coach
// resets explicitly ("🔄 New Game") rather than something picked from the
// schedule, same self-contained-state precedent js/two-minute-drill.js
// already uses.
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

  const TRACKER_URL = `${FIREBASE_DB_URL}/playCountTracker.json`;
  const ARM_TIMEOUT_MS = 4000;

  let state = {
    targetPlays: 8,
    players: [], // [{id, num, name, count}]
    log: [],     // [{playerId, ts}] -- most recent last
  };
  let loaded = false;
  let step = 'setup'; // 'setup' | 'players' | 'track'
  let armedPlayerId = null;
  let armTimer = null;

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

  function normalize(data) {
    if (!data || typeof data !== 'object') return { targetPlays: 8, players: [], log: [] };
    return {
      targetPlays: Number.isFinite(Number(data.targetPlays)) && Number(data.targetPlays) > 0 ? Number(data.targetPlays) : 8,
      players: Array.isArray(data.players) ? data.players.map(p => ({
        id: p.id || genId(), num: String(p.num || ''), name: p.name || '', count: Number.isFinite(Number(p.count)) ? Number(p.count) : 0,
      })) : [],
      log: Array.isArray(data.log) ? data.log.filter(e => e && e.playerId) : [],
    };
  }

  function load() {
    return window.firebaseAuthed(TRACKER_URL).then(url => fetch(url, { cache: 'no-store' })).then(r => r.ok ? r.json() : null)
      .then(data => { state = normalize(data); loaded = true; return state; })
      .catch(err => {
        console.error('Could not load Play Count Tracker:', err);
        state = { targetPlays: 8, players: [], log: [] };
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
    window.firebaseAuthed(TRACKER_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, state, { updatedAt: new Date().toISOString() })),
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
  function newGame() {
    if (!confirm('Start a new game? Every tracked player\'s count resets to 0 -- the target and player list stay the same.')) return;
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
        <button type="button" class="navBtn danger" id="pctNewGameBtn" style="margin-left:auto;">🔄 New Game</button>
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
      const valueEl = document.getElementById('pctTargetValue');
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
      document.getElementById('pctNewGameBtn').addEventListener('click', newGame);
    }
  }

  window.initPlayCountTracker = function () {
    const wrap = document.getElementById('pctBody');
    if (wrap) wrap.innerHTML = '<div class="lbEmpty">Loading…</div>';
    const rosterReady = window.isTeamRosterLoaded && window.isTeamRosterLoaded()
      ? Promise.resolve()
      : (window.loadTeamRoster ? window.loadTeamRoster() : Promise.resolve());
    // Always a fresh load (no-store, same as every other re-entered coach
    // panel in this app) -- live, in-game data, not something to trust a
    // stale in-memory copy for across a tab switch.
    Promise.all([rosterReady, load()]).then(() => {
      // Land on Track directly once players are already set up (the
      // common case after the first game) -- Setup/Players stay one tap
      // away via "‹ Target / Players", not re-shown every single open.
      step = state.players.length ? 'track' : 'setup';
      render();
    });
  };
})();

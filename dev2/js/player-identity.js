/* ============================================================
   PLAYER IDENTITY -- name + 4-digit code, required for everyone (players
   and coaches alike) right after the site login, so every session in the
   app is tied to a real person instead of being anonymous. No email, no
   password reset flow, just a short code a kid can remember -- same
   spirit as the rest of this app. Reuses the same SHA-256-hash-on-device
   pattern as the login/admin gates (window.sha256Hex from auth.js) and
   the same anonymous-auth'd Firebase calls as everything else
   (window.firebaseAuthed).

   dev2-only: player records live under a "dev2Players" path, kept
   separate from anything that will eventually ship to the real dev/
   site, so test sign-ins during development never touch real data.
   See dev/tools/play-calls-quiz/PLAN.md for the full design.

   Exposes window.PlayerIdentity.gate(onReady): call this once, right
   after the site login screen is dismissed. If someone's already
   identified on this device, onReady() runs immediately. Otherwise this
   shows a full-screen, non-dismissable "who's playing?" screen and only
   calls onReady() once they've signed in or signed up -- nothing else
   in the app is usable until then.
   ============================================================ */
(function(){
  const PLAYERS_PATH = 'dev2Players';
  const SESSION_KEY = 'bengalsPlayerSession'; // { playerId, name, position? }
  // Per-player (not per-device) "don't ask again" flag for the position
  // prompt -- keyed by playerId so switching players on the same device
  // doesn't carry over someone else's dismissal, and Skip is remembered
  // across reloads instead of nagging every session. Nathan: "skippable
  // and changeable later."
  const POS_SKIP_PREFIX = 'bengalsPosSkipped_';

  // Nathan's mapping: "if they say QB, it is the same as the 1. RB is the 2
  // or 3, 4 in the wing, 5 and 6 are TE. and the line is each individual
  // position as it calls out" (Coach added as its own option too, since
  // not everyone signing in through this same name+PIN flow is a kid on
  // offense). Values match exactly what the diagrams use as player ids --
  // numbers 1-6 as strings, and the O-line's own LT/LG/C/RG/RT ids -- so a
  // stored position can be used directly to drive which circle gets
  // highlighted in Play Calls, no separate lookup table needed there.
  const POSITION_OPTIONS = [
    { value: '1', label: 'QB', sub: '#1' },
    { value: '2', label: 'RB', sub: '#2' },
    { value: '3', label: 'RB', sub: '#3' },
    { value: '4', label: 'Wing', sub: '#4' },
    { value: '5', label: 'TE', sub: '#5' },
    { value: '6', label: 'TE', sub: '#6' },
    { value: 'LT', label: 'LT' },
    { value: 'LG', label: 'LG' },
    { value: 'C', label: 'C' },
    { value: 'RG', label: 'RG' },
    { value: 'RT', label: 'RT' },
    { value: 'COACH', label: 'Coach' },
  ];
  const POSITION_LABELS = {};
  POSITION_OPTIONS.forEach(o => { POSITION_LABELS[o.value] = o.sub ? `${o.label} ${o.sub}` : o.label; });

  function getSession(){
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch(e){ return null; }
  }
  function setSession(session){
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch(e){}
  }
  function clearSession(){
    try { localStorage.removeItem(SESSION_KEY); } catch(e){}
  }

  async function fetchAllPlayers(){
    const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}.json`);
    const res = await fetch(url);
    if(!res.ok) return {};
    const data = await res.json();
    return data || {};
  }

  async function findByName(name){
    const all = await fetchAllPlayers();
    const needle = name.trim().toLowerCase();
    return Object.keys(all)
      .filter(id => (all[id].name || '').trim().toLowerCase() === needle)
      .map(id => Object.assign({id: id}, all[id]));
  }

  async function createPlayer(name, pinHash, isCoach){
    const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}.json`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        name: name, pinHash: pinHash, isCoach: !!isCoach,
        createdAt: new Date().toISOString(), lastSeen: new Date().toISOString(),
      }),
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.name; // Firebase's POST response key is the generated push ID
  }

  // Fire-and-forget -- so a session-resume or a fresh sign-in never blocks
  // on this, but the admin view still has a real "who's actually using it"
  // signal to show, not just "who signed up once."
  function touchLastSeen(playerId){
    window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}/${playerId}.json`)
      .then(url => fetch(url, {
        method: 'PATCH',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ lastSeen: new Date().toISOString() }),
      }))
      .catch(() => {}); // best-effort; not being able to log a timestamp shouldn't block anyone
  }

  // ---- Session-duration tracking (Nathan: "show me metrics of how often
  // they are using it, how long they are using it") -----------------------
  // Nothing in the app tracked elapsed time before this -- lastSeen is a
  // single rolling "last activity" stamp, not a log of visits. This logs
  // one row per visit to analytics/sessions, and keeps it roughly current
  // via a periodic heartbeat while the tab is open, same fire-and-forget
  // spirit as touchLastSeen and cloudPush elsewhere -- never blocks the
  // app, and a missed write just means one slightly-stale duration number,
  // not a broken session.
  const SESSION_HEARTBEAT_MS = 25000;
  // A forgotten-open tab shouldn't be able to report a multi-day "session"
  // -- cap how much a single heartbeat can advance duration by, same idea
  // as the route-clamping elsewhere in this app.
  const SESSION_MAX_MS = 3 * 60 * 60 * 1000; // 3 hours
  let sessionTrackingStarted = false;

  function startSessionTracking(playerId, name){
    if(sessionTrackingStarted) return; // once per page load is enough -- gate() can run more than once
    sessionTrackingStarted = true;
    const startedAtMs = Date.now();
    // Updated on every tap/keypress (cheap, in-memory only -- no network
    // call here) so an idle-but-open tab stops padding duration once a kid
    // walks away; the heartbeat interval below is what actually persists
    // it, on its own fixed cadence, not once per tap.
    let lastActivityMs = startedAtMs;
    let sessionKey = null;

    function currentDurationMs(){
      return Math.min(lastActivityMs - startedAtMs, SESSION_MAX_MS);
    }
    function writeHeartbeat(){
      if(!sessionKey) return;
      window.firebaseAuthed(`${FIREBASE_DB_URL}/analytics/sessions/${sessionKey}.json`)
        .then(url => fetch(url, {
          method: 'PATCH',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            lastActivityAt: new Date(lastActivityMs).toISOString(),
            durationMs: currentDurationMs(),
          }),
        }))
        .catch(() => {});
    }
    function markActivity(){ lastActivityMs = Date.now(); }
    ['click', 'touchstart', 'keydown'].forEach(evt => {
      document.addEventListener(evt, markActivity, { passive: true });
    });

    window.firebaseAuthed(`${FIREBASE_DB_URL}/analytics/sessions.json`)
      .then(url => fetch(url, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          playerId: playerId, name: name,
          startedAt: new Date(startedAtMs).toISOString(),
          lastActivityAt: new Date(startedAtMs).toISOString(),
          durationMs: 0,
        }),
      }))
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if(data && data.name) sessionKey = data.name; // Firebase POST response key is the generated push ID
      })
      .catch(() => {});

    setInterval(writeHeartbeat, SESSION_HEARTBEAT_MS);
    // Opportunistic extra write the moment the tab goes to the background --
    // may not always finish before the browser suspends things, but costs
    // nothing to try, and catches a lot of real "closed the app" moments
    // the next scheduled heartbeat would otherwise miss by up to 25s.
    document.addEventListener('visibilitychange', () => {
      if(document.hidden) writeHeartbeat();
    });
  }

  // Admin-only: wipes a player's tracked Play Calls Quiz stats (best score,
  // last score, play count) -- e.g. clearing out a coach's own test runs so
  // they don't show up as a real score on the leaderboard/admin view.
  // Doesn't touch the player's identity itself (name/pin/createdAt), just
  // the quiz-result fields, so they don't have to sign up again.
  async function resetQuizStats(playerId){
    const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}/${playerId}.json`);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        pcqBestScore: null, pcqBestMaxScore: null,
        pcqLastScore: null, pcqLastMaxScore: null,
        pcqPlaysCount: null, pcqLastPlayedAt: null,
      }),
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
  }

  // Persists which offensive position (or Coach) a player picked. Also
  // updates the local session cache so subsequent page loads don't need a
  // fresh Firebase read just to know it's already set -- see
  // maybeShowPositionPrompt below.
  async function setPosition(playerId, position){
    const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}/${playerId}.json`);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ position: position }),
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const session = getSession();
    if(session && session.playerId === playerId){
      session.position = position;
      setSession(session);
    }
  }

  // Fetches the signed-in player's own record (name, best score so far,
  // etc.) -- used so a quiz can show "your best: X" before/after a run.
  async function getPlayerRecord(playerId){
    try {
      const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}/${playerId}.json`);
      const res = await fetch(url);
      if(!res.ok) return null;
      return await res.json();
    } catch(e){ return null; }
  }

  // Records one Play Calls Quiz result against the signed-in player,
  // bumping their best score if this run beat it, AND (Nathan: "keep all
  // record history available to see") appends a full-history row to
  // analytics/pcqResults -- the player record itself still only carries
  // best/last (cheap to read for the leaderboard/My Stats), but the coach
  // dashboard's real history/trend view reads the append-only log instead.
  // Fire-and-forget by design, same spirit as touchLastSeen.
  async function recordQuizResult(score, maxScore){
    const session = getSession();
    if(!session) return null;
    try {
      const existing = await getPlayerRecord(session.playerId);
      const prevBest = (existing && existing.pcqBestScore) || 0;
      const patch = {
        pcqLastScore: score,
        pcqLastMaxScore: maxScore,
        pcqLastPlayedAt: new Date().toISOString(),
        pcqPlaysCount: ((existing && existing.pcqPlaysCount) || 0) + 1,
      };
      const isNewBest = score > prevBest;
      if(isNewBest){
        patch.pcqBestScore = score;
        patch.pcqBestMaxScore = maxScore;
      }
      const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}/${session.playerId}.json`);
      await fetch(url, {
        method: 'PATCH',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(patch),
      });
      window.firebaseAuthed(`${FIREBASE_DB_URL}/analytics/pcqResults.json`)
        .then(historyUrl => fetch(historyUrl, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            playerId: session.playerId, name: session.name,
            score: score, maxScore: maxScore, date: new Date().toISOString(),
          }),
        }))
        .catch(() => {});
      return { isNewBest: isNewBest, bestScore: isNewBest ? score : prevBest, bestMaxScore: isNewBest ? maxScore : (existing && existing.pcqBestMaxScore) || maxScore };
    } catch(e){ return null; } // best-effort; a failed save shouldn't block the done screen
  }

  // ---- UI wiring (full-screen mandatory overlay, same treatment as the
  // site login screen) ----
  const screenEl = document.getElementById('playerIdScreen');
  const nameInput = document.getElementById('playerIdNameInput');
  const pinInput = document.getElementById('playerIdPinInput');
  const errorEl = document.getElementById('playerIdError');
  const btnEl = document.getElementById('playerIdBtn');
  const badgeNameEl = document.getElementById('playerIdBadgeName');
  const switchBtn = document.getElementById('playerIdSwitchBtn');

  function showOverlay(){
    nameInput.value = '';
    pinInput.value = '';
    errorEl.style.display = 'none';
    screenEl.classList.remove('hide');
    setTimeout(() => nameInput.focus(), 50);
  }
  function hideOverlay(){
    screenEl.classList.add('hide');
  }
  function updateBadge(name){
    if(badgeNameEl) badgeNameEl.textContent = name;
  }

  // ---- Position picker (posPromptOverlay) -- skippable, reopenable
  // anytime from the player menu to change. Not part of the mandatory
  // sign-in gate: it's shown AFTER onReady() already ran, so a slow or
  // skipped answer never blocks anyone from using the app. ----
  const posPromptOverlay = document.getElementById('posPromptOverlay');
  const posPromptTitle = document.getElementById('posPromptTitle');
  const posPillGrid = document.getElementById('posPillGrid');
  const posPromptSkipBtn = document.getElementById('posPromptSkipBtn');
  let posPickerSession = null;

  function refreshPosPillActive(current){
    if(!posPillGrid) return;
    [...posPillGrid.querySelectorAll('.posPill')].forEach(btn => {
      btn.classList.toggle('active', btn.dataset.position === current);
    });
  }
  // opts.isFirstAsk: true when this is the auto-prompt after sign-in (so
  // the dismiss button reads "Skip for now"); false when opened deliberately
  // from the menu to change an existing answer (reads "Close" instead).
  function openPositionPicker(session, opts){
    opts = opts || {};
    if(!posPromptOverlay || !session) return;
    posPickerSession = session;
    posPromptTitle.textContent = opts.isFirstAsk ? "🏈 What position do you play?" : '🏈 Change your position';
    if(posPromptSkipBtn) posPromptSkipBtn.textContent = opts.isFirstAsk ? 'Skip for now' : 'Close';
    refreshPosPillActive(session.position || null);
    posPromptOverlay.classList.add('show');
  }
  function closePositionPicker(){
    if(posPromptOverlay) posPromptOverlay.classList.remove('show');
    posPickerSession = null;
  }
  function markPositionPromptDismissed(playerId){
    try { localStorage.setItem(POS_SKIP_PREFIX + playerId, '1'); } catch(e){}
  }
  if(posPillGrid){
    posPillGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.posPill');
      if(!btn || !posPickerSession) return;
      const position = btn.dataset.position;
      const session = posPickerSession;
      refreshPosPillActive(position); // optimistic -- don't make a kid wait on the network to see it stick
      session.position = position;
      setSession(session);
      markPositionPromptDismissed(session.playerId);
      closePositionPicker();
      setPosition(session.playerId, position).catch(err => console.error('Could not save position:', err));
    });
  }
  if(posPromptSkipBtn){
    posPromptSkipBtn.addEventListener('click', () => {
      if(posPickerSession) markPositionPromptDismissed(posPickerSession.playerId);
      closePositionPicker();
    });
  }

  // Decides whether to auto-show the position prompt after a sign-in
  // resolves. isFreshSignup lets a brand-new account skip the extra
  // Firebase read below -- we already know for certain it has no position.
  // For a RETURNING session, the local cache never has position on it yet
  // for anyone who signed in before this feature existed, so this checks
  // Firebase once; if it's still missing there too (and they haven't
  // dismissed the prompt before on this device), the picker shows.
  async function maybeShowPositionPrompt(session, isFreshSignup){
    if(!session || session.position) return;
    if(!isFreshSignup && localStorage.getItem(POS_SKIP_PREFIX + session.playerId) === '1') return;
    let position = null;
    if(!isFreshSignup){
      const record = await getPlayerRecord(session.playerId);
      position = record && record.position;
    }
    if(position){
      session.position = position;
      setSession(session);
      return;
    }
    openPositionPicker(session, { isFirstAsk: true });
  }

  let pendingReady = null;

  async function attemptSignIn(){
    const name = nameInput.value.trim();
    const pin = pinInput.value.trim();
    errorEl.style.display = 'none';
    if(!name){ errorEl.textContent = 'Type your name first.'; errorEl.style.display = 'block'; return; }
    if(!/^\d{4}$/.test(pin)){ errorEl.textContent = 'Code needs to be 4 digits.'; errorEl.style.display = 'block'; return; }
    btnEl.disabled = true;
    btnEl.textContent = 'Checking…';
    try {
      const pinHash = await window.sha256Hex(pin);
      const matches = await findByName(name);
      let session, isFreshSignup;
      if(matches.length === 0){
        // Brand new player (or coach) -- create the profile with this name+code.
        const playerId = await createPlayer(name, pinHash, window.isCoachSession);
        session = { playerId: playerId, name: name };
        isFreshSignup = true;
      } else {
        const match = matches.find(m => m.pinHash === pinHash);
        if(!match){
          errorEl.textContent = 'That name is already taken with a different code. Double check your code, or use a slightly different name (e.g. add your last initial).';
          errorEl.style.display = 'block';
          btnEl.disabled = false;
          btnEl.textContent = 'Continue';
          return;
        }
        session = { playerId: match.id, name: match.name };
        isFreshSignup = false;
        touchLastSeen(match.id);
      }
      setSession(session);
      updateBadge(session.name);
      hideOverlay();
      startSessionTracking(session.playerId, session.name);
      if(pendingReady){ const cb = pendingReady; pendingReady = null; cb(); }
      // Fire-and-forget -- app usability never waits on this, per Nathan
      // ("skippable and changeable later").
      maybeShowPositionPrompt(session, isFreshSignup).catch(() => {});
    } catch(e){
      errorEl.textContent = 'Could not reach the team server -- check your connection and try again.';
      errorEl.style.display = 'block';
      console.error('Player sign-in failed:', e);
    } finally {
      btnEl.disabled = false;
      btnEl.textContent = 'Continue';
    }
  }

  btnEl.addEventListener('click', attemptSignIn);
  pinInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') attemptSignIn(); });
  nameInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') pinInput.focus(); });
  if(switchBtn){
    switchBtn.addEventListener('click', () => {
      if(!confirm('Switch player? You\'ll need to sign in again.')) return;
      clearSession();
      window.location.reload();
    });
  }

  // ---- Top-right player menu: name pill opens a small dropdown
  // (My Stats / My Position / Sign Out) instead of the old always-visible
  // text bar. ----
  const menuBtn = document.getElementById('playerMenuBtn');
  const menuDropdown = document.getElementById('playerMenuDropdown');
  const myStatsBtn = document.getElementById('myStatsBtn');
  const myPositionBtn = document.getElementById('myPositionBtn');
  if(menuBtn && menuDropdown){
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menuDropdown.classList.toggle('show');
    });
    document.addEventListener('click', () => menuDropdown.classList.remove('show'));
  }
  if(myStatsBtn){
    myStatsBtn.addEventListener('click', () => {
      menuDropdown.classList.remove('show');
      // showMyStats() lives in study-quiz.js, which loads before this file
      // in the script order, so it's already a global by the time this runs.
      if(typeof window.showMyStats === 'function') window.showMyStats();
    });
  }
  if(myPositionBtn){
    myPositionBtn.addEventListener('click', async () => {
      menuDropdown.classList.remove('show');
      let session = getSession();
      if(!session) return;
      // The local cache might not have position on it yet even though
      // it's already set in Firebase (e.g. set from another device, or
      // this is the very first time this device has opened the menu after
      // the auto-prompt was skipped and later answered elsewhere) --
      // refresh from the source of truth before showing what's "current."
      if(!session.position){
        const record = await getPlayerRecord(session.playerId);
        if(record && record.position){
          session.position = record.position;
          setSession(session);
        }
      }
      openPositionPicker(session, { isFirstAsk: false });
    });
  }
  const thisweekMenuBtn = document.getElementById('thisweekMenuBtn');
  if(thisweekMenuBtn){
    thisweekMenuBtn.addEventListener('click', () => {
      menuDropdown.classList.remove('show');
      // setSection() is a top-level function in study-quiz.js (loaded
      // before this file), same sharing pattern as FIREBASE_DB_URL --
      // reachable as a bare global from any later classic script on this
      // page. Goes through the top-level section switcher (not setMode()
      // directly) so the Play sub-tab bar hides and the top nav shows
      // "This Week" as active, matching what a tap on that top tab does.
      if(typeof setSection === 'function') setSection('thisweek');
    });
  }
  const studyGuideBtn = document.getElementById('studyGuideBtn');
  if(studyGuideBtn){
    studyGuideBtn.addEventListener('click', () => {
      menuDropdown.classList.remove('show');
      // showStudyGuide() lives in study-guide.js, which loads after this
      // file (right after play-calls.js) -- already a global by the time
      // anyone can actually click this button.
      if(typeof window.showStudyGuide === 'function') window.showStudyGuide();
    });
  }

  // ---- The mandatory gate ----
  // Wrapping onReady (rather than sprinkling this at every call site) so
  // it fires exactly once, right when a name/session is actually known,
  // regardless of which of the two paths below got there -- coach-only nav
  // (Coach Tools tab, etc.) reads window.isCoachSession/PlayerIdentity, so
  // it can't be decided correctly any earlier than this.
  function gate(rawOnReady){
    const onReady = function(){
      if (typeof window.refreshCoachToolsVisibility === 'function') window.refreshCoachToolsVisibility();
      rawOnReady();
    };
    const session = getSession();
    if(session && session.name){
      updateBadge(session.name);
      touchLastSeen(session.playerId);
      startSessionTracking(session.playerId, session.name);
      onReady();
      // Fire-and-forget, same as the fresh-sign-in path above -- covers
      // every returning player whose account predates this feature.
      maybeShowPositionPrompt(session, false).catch(() => {});
      return;
    }
    pendingReady = onReady;
    showOverlay();
  }

  window.PlayerIdentity = {
    getSession, setSession, clearSession, fetchAllPlayers, gate, getPlayerRecord,
    recordQuizResult, resetQuizStats, setPosition, openPositionPicker,
    POSITION_OPTIONS, POSITION_LABELS,
  };
})();

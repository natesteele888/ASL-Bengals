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
  // Same idea, for a parent's child-link picker (see childPromptOverlay
  // wiring further down) -- kept as its own prefix since a device could
  // in principle be used for both a player and a parent sign-in over time.
  const CHILD_SKIP_PREFIX = 'bengalsChildSkipped_';

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

  // Nathan: "some people have two kids in the house on the team that may
  // need a way to swap between 2 users." A local, per-DEVICE list of
  // every profile that's ever signed in here -- separate from
  // dev2Players (the real, team-wide record of every player, in
  // Firebase). This is just "who's used this phone/tablet before,"
  // deliberately NOT storing a PIN -- switching to one of these still
  // re-verifies the PIN against Firebase every time (see resolveSessionFor
  // below), same as the very first sign-in. Capped at 8 -- plenty for a
  // family device, avoids unbounded growth if a device gets handed around.
  const KNOWN_PROFILES_KEY = 'bengalsKnownProfiles'; // [{playerId, name}]
  function getKnownProfiles(){
    try { const list = JSON.parse(localStorage.getItem(KNOWN_PROFILES_KEY) || '[]'); return Array.isArray(list) ? list : []; }
    catch(e){ return []; }
  }
  function rememberKnownProfile(session){
    if(!session || !session.playerId) return;
    const list = getKnownProfiles().filter(p => p.playerId !== session.playerId);
    list.unshift({ playerId: session.playerId, name: session.name });
    try { localStorage.setItem(KNOWN_PROFILES_KEY, JSON.stringify(list.slice(0, 8))); } catch(e){}
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
    // role is stored explicitly (not just inferred) so anything reading
    // this record later -- like the coach admin panel -- can reliably
    // label a parent account instead of it looking like a plain player.
    const role = window.userRole || (isCoach ? 'coach' : 'player');
    const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}.json`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        name: name, pinHash: pinHash, isCoach: !!isCoach, role: role,
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
  //
  // Nathan (later): "send out push notifications to congratulate kids
  // for... logging in for 3 straight days... need more gamification."
  // Folded the streak computation into this same read-then-write instead of
  // a separate call -- it has to run BEFORE lastSeen gets overwritten with
  // today's timestamp, since the streak math compares today's date against
  // whatever lastSeen still says. Consecutive CALENDAR days (toDateString(),
  // not a rolling 24h window) -- logging in Monday evening then Tuesday
  // morning still counts as two different days, the more intuitive
  // definition for a kid checking the math. Only notifies once per real
  // milestone, the day it's actually reached (not on every same-day
  // reopen), and never for a coach session -- this is a kid-facing nudge to
  // keep coming back, not something coaches need.
  const STREAK_MILESTONES = [3, 5, 7, 14, 21, 30, 60, 100];
  function dateOnlyStr(d){ return d.toDateString(); }
  async function touchLastSeen(playerId, name){
    try {
      const prev = await getPlayerRecord(playerId);
      const today = new Date();
      const todayStr = dateOnlyStr(today);
      const prevSeenStr = prev && prev.lastSeen ? dateOnlyStr(new Date(prev.lastSeen)) : null;
      const alreadyLoggedToday = prevSeenStr === todayStr;
      let streak = (prev && prev.loginStreak) || 0;
      if(!alreadyLoggedToday){
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        streak = (prevSeenStr === dateOnlyStr(yesterday)) ? streak + 1 : 1;
      }
      const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}/${playerId}.json`);
      await fetch(url, {
        method: 'PATCH',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ lastSeen: today.toISOString(), loginStreak: streak }),
      });
      if(!alreadyLoggedToday && STREAK_MILESTONES.indexOf(streak) !== -1 && !window.isCoachSession &&
        'Notification' in window && Notification.permission === 'granted' && window.showLocalNotification){
        window.showLocalNotification(
          `🔥 ${streak}-Day Streak!`,
          `${name}, you've opened the app ${streak} days in a row -- keep it going!`,
          { tag: 'aslBengalsStreak' }
        );
      }
    } catch(e){ /* best-effort; not being able to log a timestamp shouldn't block anyone */ }
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

  // Nathan: "see how their child is doing" -- a parent session (see
  // window.userRole, auth.js) links itself to one or more roster player
  // ids instead of picking a position of their own. Same
  // patch-and-update-local-cache shape as setPosition above.
  async function setChildLinks(playerId, childRosterIds){
    const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}/${playerId}.json`);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ childRosterIds: childRosterIds }),
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const session = getSession();
    if(session && session.playerId === playerId){
      session.childRosterIds = childRosterIds;
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
      // Nathan: "send out push notifications to congratulate kids for...
      // getting ranked." notifyIfRanked/fetchPCQLeaderboardData are bare
      // globals from study-quiz.js (loaded before this file, same sharing
      // pattern as everything else cross-referenced between these two
      // files) -- only worth checking when this run actually moved the
      // needle (a new best).
      if(isNewBest && typeof fetchPCQLeaderboardData === 'function' && typeof notifyIfRanked === 'function'){
        fetchPCQLeaderboardData().then(data => notifyIfRanked(session.name, 'Play Calls Quiz', data)).catch(() => {});
      }
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
  // Nathan: "have the player pill button with a football icon and their
  // name and # if added." The session itself doesn't carry a jersey # (only
  // name/position/etc.), so this does the same best-effort roster-name
  // match every other cross-reference in this app already relies on
  // (teamRoster.json's `num`, matched case-insensitively by name) --
  // loading the roster first if it hasn't been fetched yet this session.
  // Matched roster entry for whoever's currently signed in -- set inside
  // updateBadge()'s applyNum, read by myCardBtn's click handler below so it
  // doesn't have to redo the same roster lookup.
  let myCardRosterMatch = null;
  function updateBadge(name){
    if(badgeNameEl) badgeNameEl.textContent = name;
    const numEl = document.getElementById('playerIdBadgeNum');
    const myCardBtn = document.getElementById('myCardBtn');
    myCardRosterMatch = null;
    if(numEl) numEl.textContent = '';
    if(myCardBtn) myCardBtn.style.display = 'none'; // re-shown below only if there's a roster match to open
    const applyNum = () => {
      const roster = window.getTeamRosterCached ? window.getTeamRosterCached() : [];
      const target = (name || '').trim().toLowerCase();
      const match = roster.find(p => (p.name || '').trim().toLowerCase() === target);
      if(numEl) numEl.textContent = (match && match.num !== undefined && match.num !== null && match.num !== '') ? `#${match.num}` : '';
      myCardRosterMatch = match || null;
      // This is the one place that ever shows myCardBtn -- study-quiz.js's
      // refreshCoachToolsVisibility() only ever hides it (for a parent
      // session), never shows it, specifically so it can't stomp on the
      // "only show once a roster match is confirmed" decision made here,
      // regardless of which of the two runs first.
      const isParent = !!window.isParentSession;
      if(myCardBtn && match && !isParent) myCardBtn.style.display = '';
    };
    if(window.isTeamRosterLoaded && window.isTeamRosterLoaded()) applyNum();
    else if(window.loadTeamRoster) window.loadTeamRoster().then(applyNum).catch(() => {});
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

  // ---- Child picker (childPromptOverlay) -- Nathan: "Just want them to
  // log in, see how their child is doing, see the schedule." A parent
  // (window.userRole === 'parent', set at role-pick time in auth.js) gets
  // this instead of the position prompt above -- same skippable,
  // reopenable-from-the-menu shape, just built dynamically from the team
  // roster (which player it is, unlike a position, isn't a fixed list)
  // and supporting more than one selection for a family with two kids on
  // the team. ----
  const childPromptOverlay = document.getElementById('childPromptOverlay');
  const childPillGrid = document.getElementById('childPillGrid');
  const childPromptSearch = document.getElementById('childPromptSearch');
  const childPromptDoneBtn = document.getElementById('childPromptDoneBtn');
  const childPromptEmpty = document.getElementById('childPromptEmpty');
  let childPickerSession = null;
  let childPickerSelected = [];  // roster ids currently checked, this picker session
  let childPickerRoster = [];    // cached roster list, this picker session
  let childPickerIsFirstAsk = false;

  function escapeHtmlLocal(s){
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  function renderChildPills(filterText){
    if(!childPillGrid) return;
    const needle = (filterText || '').trim().toLowerCase();
    const filtered = childPickerRoster.filter(p => !needle || (p.name || '').toLowerCase().indexOf(needle) !== -1);
    childPillGrid.innerHTML = '';
    filtered.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'posPill' + (childPickerSelected.indexOf(p.id) !== -1 ? ' active' : '');
      btn.innerHTML = `${escapeHtmlLocal(p.name)}${p.num ? `<span class="posPillSub">#${escapeHtmlLocal(String(p.num))}</span>` : ''}`;
      btn.addEventListener('click', () => {
        const idx = childPickerSelected.indexOf(p.id);
        if(idx !== -1) childPickerSelected.splice(idx, 1); else childPickerSelected.push(p.id);
        renderChildPills(childPromptSearch ? childPromptSearch.value : '');
      });
      childPillGrid.appendChild(btn);
    });
    if(childPromptEmpty) childPromptEmpty.style.display = filtered.length ? 'none' : '';
  }
  async function fetchRosterForPicker(){
    if(window.isTeamRosterLoaded && window.isTeamRosterLoaded()){
      return window.getTeamRosterCached ? window.getTeamRosterCached() : [];
    }
    if(window.loadTeamRoster){
      await window.loadTeamRoster();
      return window.getTeamRosterCached ? window.getTeamRosterCached() : [];
    }
    return [];
  }
  async function openChildPicker(session, opts){
    opts = opts || {};
    if(!childPromptOverlay || !session) return;
    childPickerSession = session;
    childPickerIsFirstAsk = !!opts.isFirstAsk;
    childPickerSelected = (session.childRosterIds || []).slice();
    childPickerRoster = await fetchRosterForPicker();
    if(childPromptSearch) childPromptSearch.value = '';
    renderChildPills('');
    childPromptOverlay.classList.add('show');
  }
  function closeChildPicker(){
    if(childPromptOverlay) childPromptOverlay.classList.remove('show');
    childPickerSession = null;
  }
  function markChildPromptDismissed(playerId){
    try { localStorage.setItem(CHILD_SKIP_PREFIX + playerId, '1'); } catch(e){}
  }
  if(childPromptSearch){
    childPromptSearch.addEventListener('input', () => renderChildPills(childPromptSearch.value));
  }
  if(childPromptDoneBtn){
    childPromptDoneBtn.addEventListener('click', () => {
      if(!childPickerSession) return;
      const session = childPickerSession;
      const ids = childPickerSelected.slice();
      const roster = childPickerRoster;
      const wasFirstAsk = childPickerIsFirstAsk;
      markChildPromptDismissed(session.playerId);
      closeChildPicker();
      setChildLinks(session.playerId, ids).catch(err => console.error('Could not save linked child(ren):', err));
      renderParentChildBanner(session, roster, ids);
      // Nice touch on first link: jump straight to the child's card so a
      // parent sees right away what this was for. Not on later edits from
      // the menu -- that'd be surprising when they're just changing it.
      if(wasFirstAsk && ids.length === 1 && window.showPlayerProfile){
        const entry = roster.find(p => p.id === ids[0]);
        if(entry) window.showPlayerProfile(entry.num);
      }
    });
  }

  // Nathan: "Just want them to log in, see how their child is doing, see
  // the schedule." Since a parent's Play/This Week/Coach Tools are all
  // hidden (refreshCoachToolsVisibility in study-quiz.js), Schedule is
  // their whole app -- this keeps a one-tap way back to their child's
  // card always visible instead of it only showing up once at sign-in.
  // Re-rendered every time the link changes (Done above) so it never goes
  // stale, and pass a pre-fetched roster in when the caller already has
  // one handy rather than re-fetching.
  async function renderParentChildBanner(session, roster, childRosterIds){
    const wrap = document.getElementById('parentChildBanner');
    if(!wrap) return;
    const ids = childRosterIds || (session && session.childRosterIds) || [];
    if(!ids.length){ wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    const list = roster || await fetchRosterForPicker();
    const entries = ids.map(id => list.find(p => p.id === id)).filter(Boolean);
    if(!entries.length){ wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    wrap.style.display = '';
    // Nathan: "would be great for parents to be able to see how their
    // player is doing on the quizzes and maybe what play signals or play
    // calls they need help with." Second button per linked child opens a
    // read-only progress view (window.showChildQuizProgress, study-quiz.js)
    // -- keyed off the child's name, not jersey #, since a roster player
    // can now exist without one yet.
    wrap.innerHTML = `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:10px 16px 0;">${
      entries.map(p => `<button type="button" class="lbLinkBtn" data-num="${escapeHtmlLocal(String(p.num))}">👤 ${escapeHtmlLocal(p.name)}'s Card</button>` +
        `<button type="button" class="lbLinkBtn" data-progress-name="${escapeHtmlLocal(p.name)}" data-progress-id="${escapeHtmlLocal(p.loginPlayerId || '')}">📊 ${escapeHtmlLocal(p.name)}'s Progress</button>`).join('')
    }</div>`;
    wrap.querySelectorAll('button[data-num]').forEach(btn => {
      btn.addEventListener('click', () => {
        if(window.showPlayerProfile) window.showPlayerProfile(btn.dataset.num);
      });
    });
    // p.loginPlayerId (set by a coach in Coach Tools > Roster) is the real
    // link between this roster entry and the dev2Players login whose quiz
    // results should show -- passed through when set so showChildQuizProgress
    // doesn't have to fall back to guessing by name.
    wrap.querySelectorAll('button[data-progress-name]').forEach(btn => {
      btn.addEventListener('click', () => {
        if(window.showChildQuizProgress) window.showChildQuizProgress(btn.dataset.progressName, btn.dataset.progressId || null);
      });
    });
  }

  // Decides whether to auto-show the child-linking prompt after a
  // sign-in resolves -- parent's counterpart to maybeShowPositionPrompt
  // above, and also responsible for keeping the quick-access banner
  // (renderParentChildBanner) in sync on every return visit.
  async function maybeShowChildPrompt(session, isFreshSignup){
    if(!session) return;
    if(session.childRosterIds && session.childRosterIds.length){
      renderParentChildBanner(session, null, session.childRosterIds);
      return;
    }
    if(!isFreshSignup && localStorage.getItem(CHILD_SKIP_PREFIX + session.playerId) === '1') return;
    let childRosterIds = null;
    if(!isFreshSignup){
      const record = await getPlayerRecord(session.playerId);
      childRosterIds = record && record.childRosterIds;
    }
    if(childRosterIds && childRosterIds.length){
      session.childRosterIds = childRosterIds;
      setSession(session);
      renderParentChildBanner(session, null, childRosterIds);
      return;
    }
    openChildPicker(session, { isFirstAsk: true });
  }

  // Coaches are often parents of a player on the team too (Nathan: "give
  // the coaches the option to choose their player as well"). Unlike a
  // parent session, this doesn't pop up automatically on first login for a
  // coach -- they already get the position prompt, and can link a child
  // whenever they want via the My Child button. This just keeps the
  // quick-access banner in sync if they've already linked one on a
  // previous visit, same as renderParentChildBanner does for parents.
  async function syncChildBannerIfLinked(session){
    if(!session) return;
    let ids = session.childRosterIds;
    if(!ids){
      const record = await getPlayerRecord(session.playerId);
      ids = record && record.childRosterIds;
      if(ids && ids.length){ session.childRosterIds = ids; setSession(session); }
    }
    if(ids && ids.length) renderParentChildBanner(session, null, ids);
  }

  // Player/coach get the position prompt, a parent gets the child picker
  // instead -- single dispatcher so gate() and attemptSignIn() below don't
  // each need their own role branch. Coach additionally gets a silent
  // banner sync (see syncChildBannerIfLinked above).
  function maybeShowRolePrompt(session, isFreshSignup){
    if(window.userRole === 'parent') return maybeShowChildPrompt(session, isFreshSignup);
    const result = maybeShowPositionPrompt(session, isFreshSignup);
    if(window.userRole === 'coach') syncChildBannerIfLinked(session).catch(() => {});
    return result;
  }

  let pendingReady = null;

  // Pure name+PIN -> session resolution, no DOM in here -- pulled out of
  // attemptSignIn so the Switch Profile overlay (below) can reuse the
  // exact same create-or-verify logic instead of duplicating it. Throws
  // on failure; err.isNameTaken distinguishes "wrong PIN for that name"
  // (show the message as-is) from a network/other failure (generic
  // message at the call site).
  async function resolveSessionFor(name, pin){
    const pinHash = await window.sha256Hex(pin);
    const matches = await findByName(name);
    if(matches.length === 0){
      // Brand new player (or coach) -- create the profile with this name+code.
      const playerId = await createPlayer(name, pinHash, window.isCoachSession);
      return { session: { playerId: playerId, name: name }, isFreshSignup: true };
    }
    const match = matches.find(m => m.pinHash === pinHash);
    if(!match){
      const err = new Error('That name is already taken with a different code. Double check your code, or use a slightly different name (e.g. add your last initial).');
      err.isNameTaken = true;
      throw err;
    }
    touchLastSeen(match.id, match.name);
    return { session: { playerId: match.id, name: match.name }, isFreshSignup: false };
  }

  // Shared tail end of both the mandatory sign-in gate and the Switch
  // Profile overlay -- everything that has to happen once a session is
  // actually decided.
  function completeSignIn(session, isFreshSignup){
    setSession(session);
    rememberKnownProfile(session);
    updateBadge(session.name);
    hideOverlay();
    startSessionTracking(session.playerId, session.name);
    if(pendingReady){ const cb = pendingReady; pendingReady = null; cb(); }
    // Fire-and-forget -- app usability never waits on this, per Nathan
    // ("skippable and changeable later").
    maybeShowRolePrompt(session, isFreshSignup).catch(() => {});
    // Nathan: "send out push notifications to congratulate kids for
    // signing up... need more gamification." Only actually fires if
    // Notification permission was already granted on this device (e.g. a
    // sibling signing up on a device a parent already opted in on) -- a
    // brand-new device's very first sign-in hasn't hit the "Enable
    // Notifications" prompt yet, so there's nothing to congratulate with
    // yet, same limitation every other local-notification feature in this
    // app already has (no real background push on the free Firebase plan).
    if(isFreshSignup && !window.isCoachSession && 'Notification' in window &&
      Notification.permission === 'granted' && window.showLocalNotification){
      window.showLocalNotification(
        '🎉 Welcome to the team!',
        `${session.name}, your account's all set -- explore the Play Calls and Study Guide to start learning the playbook.`,
        { tag: 'aslBengalsWelcome' }
      );
    }
  }

  async function attemptSignIn(){
    const name = nameInput.value.trim();
    const pin = pinInput.value.trim();
    errorEl.style.display = 'none';
    if(!name){ errorEl.textContent = 'Type your name first.'; errorEl.style.display = 'block'; return; }
    if(!/^\d{4}$/.test(pin)){ errorEl.textContent = 'Code needs to be 4 digits.'; errorEl.style.display = 'block'; return; }
    btnEl.disabled = true;
    btnEl.textContent = 'Checking…';
    try {
      const result = await resolveSessionFor(name, pin);
      completeSignIn(result.session, result.isFreshSignup);
    } catch(e){
      errorEl.textContent = e.isNameTaken ? e.message : 'Could not reach the team server -- check your connection and try again.';
      errorEl.style.display = 'block';
      if(!e.isNameTaken) console.error('Player sign-in failed:', e);
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

  // ---- Switch Profile overlay -- Nathan: "some people have two kids in
  // the house on the team that may need a way to swap between 2 users...
  // click and hold the name plate. It gives you the option to switch
  // users. It will show you other user names that have logged in or add
  // another... they will need to put in the pin number to load the other
  // profile." Two states in the same overlay: a list of this device's
  // known profiles (openSwitchForm(name) pre-fills+locks the name, so
  // it's just a PIN check), or "+ Add Another Profile" (name editable,
  // blank) -- both funnel into the same resolveSessionFor() the mandatory
  // sign-in screen uses, so a name that already exists elsewhere on the
  // team still just needs its real PIN, and a genuinely new name creates
  // a fresh profile exactly like it always has. ----
  const switchOverlay = document.getElementById('switchProfileOverlay');
  const switchListWrap = document.getElementById('switchProfileListWrap');
  const switchListEl = document.getElementById('switchProfileList');
  const switchAddBtn = document.getElementById('switchProfileAddBtn');
  const switchFormWrap = document.getElementById('switchProfileFormWrap');
  const switchNameInput = document.getElementById('switchProfileNameInput');
  const switchPinInput = document.getElementById('switchProfilePinInput');
  const switchErrorEl = document.getElementById('switchProfileError');
  const switchConfirmBtn = document.getElementById('switchProfileConfirmBtn');
  const switchBackBtn = document.getElementById('switchProfileBackBtn');
  const switchCloseBtn = document.getElementById('switchProfileCloseBtn');
  let switchLockedName = null; // set when verifying a known profile; null when adding a fresh one

  function renderSwitchList(){
    if(!switchListEl) return;
    const current = getSession();
    const others = getKnownProfiles().filter(p => !current || p.playerId !== current.playerId);
    switchListEl.innerHTML = others.length
      ? others.map(p => `<button type="button" class="lbLinkBtn switchProfileRow" data-name="${escapeHtmlLocal(p.name)}" style="display:block;width:100%;text-align:left;margin-bottom:6px;">👤 ${escapeHtmlLocal(p.name)}</button>`).join('')
      : '<div class="lbEmpty">No other profiles on this device yet.</div>';
    switchListEl.querySelectorAll('.switchProfileRow').forEach(row => {
      row.addEventListener('click', () => openSwitchForm(row.dataset.name));
    });
  }
  function openSwitchForm(nameToVerify){
    switchLockedName = nameToVerify || null;
    switchListWrap.style.display = 'none';
    switchFormWrap.style.display = '';
    switchErrorEl.style.display = 'none';
    switchPinInput.value = '';
    switchNameInput.value = nameToVerify || '';
    switchNameInput.disabled = !!nameToVerify;
    setTimeout(() => (nameToVerify ? switchPinInput : switchNameInput).focus(), 50);
  }
  function closeSwitchForm(){
    switchFormWrap.style.display = 'none';
    switchListWrap.style.display = '';
  }
  function openSwitchProfileOverlay(){
    if(!switchOverlay) return;
    closeSwitchForm();
    renderSwitchList();
    switchOverlay.classList.add('show');
  }
  function closeSwitchProfileOverlay(){
    if(switchOverlay) switchOverlay.classList.remove('show');
  }
  async function attemptSwitchConfirm(){
    const name = (switchLockedName || switchNameInput.value.trim());
    const pin = switchPinInput.value.trim();
    switchErrorEl.style.display = 'none';
    if(!name){ switchErrorEl.textContent = 'Type a name first.'; switchErrorEl.style.display = 'block'; return; }
    if(!/^\d{4}$/.test(pin)){ switchErrorEl.textContent = 'Code needs to be 4 digits.'; switchErrorEl.style.display = 'block'; return; }
    switchConfirmBtn.disabled = true;
    switchConfirmBtn.textContent = 'Checking…';
    try {
      const result = await resolveSessionFor(name, pin);
      closeSwitchProfileOverlay();
      completeSignIn(result.session, result.isFreshSignup);
      // completeSignIn covers the session/badge/local state, but a lot of
      // the rest of the app (nav visibility, cached roster/schedule data,
      // position/child prompts already dismissed this page load, etc.)
      // assumes one session per page load -- reload for a fully clean
      // re-init under the new profile, same as the existing Sign Out
      // button already does.
      window.location.reload();
    } catch(e){
      switchErrorEl.textContent = e.isNameTaken ? e.message : (e.message || 'Could not reach the team server -- check your connection and try again.');
      switchErrorEl.style.display = 'block';
      if(!e.isNameTaken) console.error('Profile switch failed:', e);
    } finally {
      switchConfirmBtn.disabled = false;
      switchConfirmBtn.textContent = 'Continue';
    }
  }
  if(switchAddBtn) switchAddBtn.addEventListener('click', () => openSwitchForm(null));
  if(switchBackBtn) switchBackBtn.addEventListener('click', closeSwitchForm);
  if(switchConfirmBtn) switchConfirmBtn.addEventListener('click', attemptSwitchConfirm);
  if(switchPinInput) switchPinInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') attemptSwitchConfirm(); });
  if(switchCloseBtn) switchCloseBtn.addEventListener('click', closeSwitchProfileOverlay);

  // ---- Top-right player menu: name pill opens a small dropdown
  // (My Stats / My Position / Sign Out) instead of the old always-visible
  // text bar. Press-and-hold (not a plain tap) opens Switch Profile
  // instead -- first long-press gesture in this codebase, built from a
  // plain pointerdown/timer/pointerup rather than any existing pattern.
  // ----
  const menuBtn = document.getElementById('playerMenuBtn');
  const menuDropdown = document.getElementById('playerMenuDropdown');
  const myStatsBtn = document.getElementById('myStatsBtn');
  const myPositionBtn = document.getElementById('myPositionBtn');
  if(menuBtn && menuDropdown){
    const LONG_PRESS_MS = 550;
    let longPressTimer = null;
    let longPressFired = false;
    menuBtn.title = 'Tap for menu, press and hold to switch profiles';
    menuBtn.addEventListener('pointerdown', () => {
      longPressFired = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        longPressFired = true;
        if(navigator.vibrate) navigator.vibrate(15); // small haptic cue where supported; harmless no-op elsewhere
        openSwitchProfileOverlay();
      }, LONG_PRESS_MS);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => {
      menuBtn.addEventListener(evt, () => clearTimeout(longPressTimer));
    });
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if(longPressFired){ longPressFired = false; return; } // long-press already opened Switch Profile -- don't also toggle the dropdown
      menuDropdown.classList.toggle('show');
    });
    document.addEventListener('click', () => menuDropdown.classList.remove('show'));
  }
  const myCardBtn = document.getElementById('myCardBtn');
  if(myCardBtn){
    myCardBtn.addEventListener('click', () => {
      menuDropdown.classList.remove('show');
      // myCardRosterMatch is set by updateBadge()'s roster lookup above --
      // the button's only ever visible when a match was actually found.
      if(myCardRosterMatch && window.showPlayerProfile) window.showPlayerProfile(myCardRosterMatch.num);
    });
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
  const myChildBtn = document.getElementById('myChildBtn');
  if(myChildBtn){
    myChildBtn.addEventListener('click', async () => {
      menuDropdown.classList.remove('show');
      let session = getSession();
      if(!session) return;
      if(!session.childRosterIds){
        const record = await getPlayerRecord(session.playerId);
        if(record && record.childRosterIds){
          session.childRosterIds = record.childRosterIds;
          setSession(session);
        }
      }
      openChildPicker(session, { isFirstAsk: false });
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
      if (typeof window.refreshWhatsNewBadge === 'function') window.refreshWhatsNewBadge();
      // Nathan: drone footage "push" notifications (see js/drone-footage.js)
      // -- same trigger point as the What's New badge/notify check above,
      // now that a session is actually known.
      if (typeof window.maybeNotifyNewDroneClips === 'function') window.maybeNotifyNewDroneClips();
      // A drone-footage notification tapped while the app was closed opens
      // a fresh tab via ?practice=<id> (sw.js's notificationclick can't run
      // JS in a not-yet-loaded page) -- jump straight to that practice now
      // that scripts are loaded and the session/nav is ready, then drop
      // the param so a refresh doesn't reopen it.
      try {
        const practiceId = new URLSearchParams(location.search).get('practice');
        if (practiceId && window.openPracticeDetail) {
          window.openPracticeDetail(practiceId);
          history.replaceState(null, '', location.pathname + location.hash);
        }
      } catch (e) { /* URLSearchParams/history unavailable -- ignore, deep link just won't auto-open */ }
      // Same cold-start pattern as the drone-footage ?practice= deep link
      // above, for This Week's "Keys are up" notification (js/thisweek.js's
      // saveThisWeek) -- sw.js appends ?thisweek=1 when there's no already-
      // open tab to postMessage instead.
      try {
        const wantsThisWeek = new URLSearchParams(location.search).get('thisweek');
        if (wantsThisWeek && typeof setSection === 'function') {
          setSection('thisweek');
          history.replaceState(null, '', location.pathname + location.hash);
        }
      } catch (e) { /* ignore -- deep link just won't auto-open */ }
      rawOnReady();
    };
    const session = getSession();
    if(session && session.name){
      updateBadge(session.name);
      touchLastSeen(session.playerId, session.name);
      rememberKnownProfile(session);
      startSessionTracking(session.playerId, session.name);
      onReady();
      // Fire-and-forget, same as the fresh-sign-in path above -- covers
      // every returning player whose account predates this feature.
      maybeShowRolePrompt(session, false).catch(() => {});
      return;
    }
    pendingReady = onReady;
    showOverlay();
  }

  window.PlayerIdentity = {
    getSession, setSession, clearSession, fetchAllPlayers, gate, getPlayerRecord,
    recordQuizResult, resetQuizStats, setPosition, openPositionPicker,
    setChildLinks, openChildPicker, renderParentChildBanner,
    getKnownProfiles, openSwitchProfileOverlay,
    POSITION_OPTIONS, POSITION_LABELS,
  };
})();

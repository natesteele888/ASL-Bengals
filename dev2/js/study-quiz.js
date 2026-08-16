// Card data now lives in data/cards.json and is fetched by the small loader
// in index.html before any of these scripts run, so it's already sitting on
// window by the time this line executes -- same as the old inline JSON blob.
const ALL_CARDS = window.ALL_CARDS;

function shuffleArr(arr){
  for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  return arr;
}
function slug(s){ return s.replace(/[^a-zA-Z0-9]/g,''); }

/* ============================================================
   MODE SWITCHING
   ============================================================ */
const modeTabsEl = document.getElementById('modeTabs');
const studyModeEl = document.getElementById('studyMode');
const quizModeEl = document.getElementById('quizMode');
const timedModeEl = document.getElementById('timedMode');
const playcallsModeEl = document.getElementById('playcallsMode');
const playcallsquizModeEl = document.getElementById('playcallsquizMode');
const editPlaysModeEl = document.getElementById('editPlaysMode');
const thisweekModeEl = document.getElementById('thisweekMode');
const coachtoolsModeEl = document.getElementById('coachtoolsMode');
const scheduleModeEl = document.getElementById('scheduleMode');
function setMode(mode){
  modeTabsEl.querySelectorAll('.modeBtn').forEach(b=> b.classList.toggle('active', b.dataset.mode===mode));
  studyModeEl.classList.toggle('show', mode==='study');
  quizModeEl.classList.toggle('show', mode==='quiz');
  timedModeEl.classList.toggle('show', mode==='timed');
  playcallsModeEl.classList.toggle('show', mode==='playcalls');
  playcallsquizModeEl.classList.toggle('show', mode==='playcallsquiz');
  editPlaysModeEl.classList.toggle('show', mode==='editplays');
  if (thisweekModeEl) thisweekModeEl.classList.toggle('show', mode==='thisweek');
  if (coachtoolsModeEl) coachtoolsModeEl.classList.toggle('show', mode==='coachtools');
  if (scheduleModeEl) scheduleModeEl.classList.toggle('show', mode==='schedule');
  if (mode !== 'playcalls' && mode !== 'editplays') {
    const gate = document.getElementById('playCallsGate');
    if (gate) gate.classList.remove('show');
  }
  if(mode==='timed' && typeof timedBuildQuiz === 'function') timedBuildQuiz();
  if(mode==='playcalls' && typeof initPlayCalls === 'function') initPlayCalls();
  if(mode==='editplays') openEditPlaysGated();
  if(mode==='thisweek' && typeof window.initThisWeek === 'function') window.initThisWeek();
  if(mode==='coachtools' && typeof window.initDriveBuilder === 'function') window.initDriveBuilder();
  if(mode==='schedule' && typeof window.initSchedule === 'function') window.initSchedule();
}
modeTabsEl.querySelectorAll('.modeBtn').forEach(btn=>{
  btn.addEventListener('click', ()=> { lastPlaySubMode = btn.dataset.mode; setMode(btn.dataset.mode); });
});

/* ============================================================
   TOP-LEVEL SECTIONS -- Play (the sub-tab bar above, unchanged) vs This
   Week, with room for more sections later (Nathan: "other coaches and
   players tabs to come"). Only one of these two exists today, so This
   Week has no sub-tabs of its own yet -- it's just the one page setMode()
   already knows how to show.
   ============================================================ */
const topSectionsEl = document.getElementById('topSections');
let lastPlaySubMode = 'study';
function setSection(section){
  if (topSectionsEl) topSectionsEl.querySelectorAll('.modeBtn').forEach(b=> b.classList.toggle('active', b.dataset.section===section));
  if (section === 'thisweek' || section === 'coachtools' || section === 'schedule') {
    modeTabsEl.style.display = 'none';
    setMode(section);
  } else {
    modeTabsEl.style.display = '';
    setMode(lastPlaySubMode);
  }
}
if (topSectionsEl) {
  topSectionsEl.querySelectorAll('.modeBtn').forEach(btn=>{
    btn.addEventListener('click', ()=> setSection(btn.dataset.section));
  });
}

// Coach Tools' top-level tab only exists for an approved coach profile
// (window.isApprovedCoachProfile(), auth.js) -- called once a name/session
// is actually known (see player-identity.js's gate() wrapper) and re-run
// any time it might change (sign out, switch profile). If someone's
// viewing Coach Tools when this determines they no longer qualify (e.g.
// they just signed out), it bounces them back to Play rather than leaving
// a coach-only page open under a non-coach session.
window.refreshCoachToolsVisibility = function(){
  const btn = document.getElementById('coachToolsSectionBtn');
  if (!btn) return;
  const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
  btn.style.display = approved ? '' : 'none';
  if (!approved && btn.classList.contains('active')) {
    setSection('play');
  }
};

let editPlaysUnlocked = false;
let editPlaysInitialized = false;
function openEditPlaysGated(){
  if (editPlaysUnlocked || window.isCoachSession) {
    editPlaysUnlocked = true;
    proceedIntoEditPlays();
    return;
  }
  const gate = document.getElementById('playCallsGate');
  gate.classList.add('show');
  document.getElementById('pcGateInput').value = '';
  document.getElementById('pcGateError').textContent = '';
  setTimeout(() => document.getElementById('pcGateInput').focus(), 50);
  gate.dataset.pendingTarget = 'editplays';
}
function proceedIntoEditPlays(){
  if (!editPlaysInitialized) {
    editPlaysInitialized = true;
    if (typeof window.initEditPlays === 'function') window.initEditPlays();
  }
  window._playCallsShouldRebuild = true;
}

/* ============================================================
   STUDY SIGNALS — grouped, collapsible
   ============================================================ */
function cardGroup(c){ return (c.group && c.group.trim()) ? c.group : 'Other Calls'; }
const studyGrid = document.getElementById('studyGrid');
const STUDY_GROUP_ORDER = ['Location / Direction', '#4 Identity', 'Play Call', 'Other Calls'];

function wireCollapsibles(root){
  root.querySelectorAll('.vaSubHeader').forEach(h=>{
    h.addEventListener('click', ()=>{
      h.classList.toggle('collapsed');
      const body = root.querySelector('#'+h.dataset.target);
      if(body) body.classList.toggle('collapsed');
    });
  });
}

function renderStudyGrid(){
  const groups = {};
  ALL_CARDS.forEach(c=>{
    const g = cardGroup(c);
    if(!groups[g]) groups[g] = [];
    groups[g].push(c);
  });
  const orderedGroupNames = [
    ...STUDY_GROUP_ORDER.filter(g=>groups[g]),
    ...Object.keys(groups).filter(g=>!STUDY_GROUP_ORDER.includes(g))
  ];
  studyGrid.innerHTML = orderedGroupNames.map(g=>{
    const cards = groups[g];
    const bodyId = 'study-'+slug(g);
    const cardsHtml = cards.map(c=>`
      <div class="study-card">
        <img src="${c.img}" alt="signal ${c.id}">
        <div class="info">
          <div class="num">Signal #${c.id}</div>
          <div class="meaning">${c.meaning}</div>
        </div>
      </div>`).join('');
    return `<div class="vaSection">
      <div class="vaSubHeader" data-target="${bodyId}">
        <span>${g} <span class="vaCount">(${cards.length})</span></span><span class="vaChevron">▾</span>
      </div>
      <div class="vaSubBody study-grid-inner" id="${bodyId}">${cardsHtml}</div>
    </div>`;
  }).join('');
  wireCollapsibles(studyGrid);
}
renderStudyGrid();

/* ============================================================
   SOUND EFFECTS
   ============================================================ */
const correctSound = document.getElementById('correctSound');
const wrongSound = document.getElementById('wrongSound');
correctSound.volume = 0.17;
function playSound(el){
  try { el.currentTime = 0; el.play().catch(()=>{}); } catch(e){}
}

/* ============================================================
   LEADERBOARD (persisted per-device via localStorage)
   Two boards: standard quiz scores, and timed-challenge times.
   ============================================================ */
/* ============================================================
   PER-SIGNAL STATS + FULL HISTORY (separate from the named
   leaderboard — this logs automatically, every run, no name
   needed, purely for "how am I doing" self-review).
   ============================================================ */
const SIGNAL_STATS_KEY = 'bengalsSignalStats';
const HISTORY_KEY = 'bengalsQuizHistory';
const HISTORY_MAX = 200;

function getSignalStats(){
  try { return JSON.parse(localStorage.getItem(SIGNAL_STATS_KEY) || '{}'); } catch(e) { return {}; }
}
function recordSignalAttempt(id, correct){
  try {
    const stats = getSignalStats();
    if(!stats[id]) stats[id] = {attempts:0, misses:0};
    stats[id].attempts++;
    if(!correct) stats[id].misses++;
    localStorage.setItem(SIGNAL_STATS_KEY, JSON.stringify(stats));
  } catch(e) {}
}
function getHistory(){
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch(e) { return []; }
}
function logHistory(entry){
  try {
    const list = getHistory();
    list.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch(e) {}
}
function renderHistoryOverlay(){
  const stats = getSignalStats();
  const entries = Object.keys(stats).map(id=>{
    const s = stats[id];
    const card = ALL_CARDS.find(c=>c.id===Number(id));
    return card ? { card, attempts: s.attempts, misses: s.misses, missRate: s.misses/s.attempts } : null;
  }).filter(e=>e && e.attempts >= 1);

  const toughest = [...entries].filter(e=>e.missRate>0).sort((a,b)=> b.missRate-a.missRate || b.misses-a.misses).slice(0,5);
  const easiest = [...entries].filter(e=>e.missRate===0).sort((a,b)=> b.attempts-a.attempts).slice(0,5);

  function statItemHtml(e){
    const pctRight = Math.round((1-e.missRate)*100);
    return `<div class="missedItem">
      <img src="${e.card.img}" alt="signal ${e.card.id}">
      <div><div class="missedNum">Signal #${e.card.id}</div><div class="missedMeaning">${e.card.meaning}</div>
      <div class="missedStat">${pctRight}% correct (${e.attempts-e.misses}/${e.attempts})</div></div>
    </div>`;
  }
  document.getElementById('toughestList').innerHTML = toughest.length
    ? toughest.map(statItemHtml).join('')
    : '<div class="lbEmpty">Not enough data yet — play a few more rounds!</div>';
  document.getElementById('easiestList').innerHTML = easiest.length
    ? easiest.map(statItemHtml).join('')
    : '<div class="lbEmpty">Not enough data yet — play a few more rounds!</div>';

  const history = getHistory();
  const historyList = document.getElementById('historyList');
  if(history.length === 0){
    historyList.innerHTML = '<div class="lbEmpty">No completed quizzes yet on this device.</div>';
  } else {
    historyList.innerHTML = history.map(h=>{
      const d = new Date(h.date);
      const dateStr = isNaN(d) ? '' : d.toLocaleDateString(undefined, {month:'short', day:'numeric'}) + ' ' +
        d.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
      let icon, resultText;
      if(h.mode === 'timed'){ icon = '⏱️'; resultText = `${formatClock(h.timeMs)} • ✗${h.mistakes}`; }
      else if(h.mode === 'practice'){ icon = '📖'; resultText = `${h.score}/${h.total} (practice)`; }
      else { icon = '📝'; resultText = `${h.score}/${h.total}`; }
      return `<div class="lbRow">
        <div class="lbRank">${icon}</div>
        <div class="lbName">${dateStr}</div>
        <div class="lbScore">${resultText}</div>
      </div>`;
    }).join('');
  }
}
document.getElementById('historyBtn').addEventListener('click', ()=>{
  renderHistoryOverlay();
  document.getElementById('historyOverlay').classList.add('show');
});
document.getElementById('historyCloseBtn').addEventListener('click', ()=>{
  document.getElementById('historyOverlay').classList.remove('show');
});

/* ============================================================
   LEADERBOARD — synced across every device on the team via a
   free Firebase Realtime Database. No login for players: saving
   a score just POSTs a small JSON entry, and viewing the board
   GETs everyone's entries back. Local storage is kept purely as
   an offline fallback if the network request fails.
   ============================================================ */
const FIREBASE_DB_URL = 'https://aslbengals-default-rtdb.firebaseio.com';
const LEADERBOARD_KEY = 'bengalsSignalLeaderboard';
const TIMED_LEADERBOARD_KEY = 'bengalsTimedLeaderboard';
const LEADERBOARD_MAX = 20;
const TIMED_LEADERBOARD_MAX = 20;

async function cloudPush(path, entry){
  try {
    const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${path}.json`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(entry),
    });
    return res.ok;
  } catch(e) { return false; }
}
async function cloudFetch(path){
  try {
    const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${path}.json`);
    const res = await fetch(url);
    if(!res.ok) return null;
    const data = await res.json();
    return data ? Object.values(data) : [];
  } catch(e) { return null; } // null means "could not reach it", distinct from an empty board
}

/* Nathan: "once players start to register with name and pin, keep all
   record history available to see... metrics of how often they are using
   it." Every analytics write in this file used to be anonymous -- a date
   string with no player attached, so a coach could see "37 timed-quiz
   starts happened" but never "who." This tags whichever signed-in player
   is on this device onto every analytics entry going forward (older
   entries stay anonymous -- there's no way to retroactively attribute
   them). Returns {} if nobody's signed in yet (shouldn't normally happen,
   since the identity gate runs before any quiz mode is reachable, but this
   keeps every write safe either way). */
function currentPlayerTag(){
  const session = window.PlayerIdentity && window.PlayerIdentity.getSession();
  return session ? { playerId: session.playerId, name: session.name } : {};
}

/* Fire-and-forget usage counters — logs every time someone actually starts
   a quiz (not just opens the tab), so the coach can see real usage instead
   of just who bothered to save a score. Doesn't block the UI either way. */
function logQuizStart(kind){
  cloudPush(`analytics/${kind}`, Object.assign({ date: new Date().toISOString() }, currentPlayerTag()));
}

/* ============================================================
   COACH STATS — hidden admin view. Tap the header logo 5 times
   within 3 seconds to bring up a 4-digit code prompt; the right
   code then opens team-wide usage stats. Not linked anywhere in
   the normal UI on purpose — this is a peek for the coach, not a
   player-facing feature.
   ============================================================ */
// SHA-256 hash of the PIN, not the plaintext -- matches the pattern used
// for the main login codes in auth.js, so it isn't sitting in plain view
// in the shipped JS. Still a client-side check like every gate in this app.
const ADMIN_PIN_HASH = 'a598a622f48075f13c88c0f051e4e8051bb9d8f695c581c8a3300a882f6673ab';
let _logoTapCount = 0;
let _logoTapTimer = null;
document.getElementById('headerLogo').addEventListener('click', ()=>{
  _logoTapCount++;
  clearTimeout(_logoTapTimer);
  _logoTapTimer = setTimeout(()=>{ _logoTapCount = 0; }, 3000);
  if(_logoTapCount >= 5){
    _logoTapCount = 0;
    clearTimeout(_logoTapTimer);
    const pinInput = document.getElementById('adminPinInput');
    pinInput.value = '';
    document.getElementById('adminPinError').style.display = 'none';
    document.getElementById('adminPinOverlay').classList.add('show');
    setTimeout(()=> pinInput.focus(), 50);
  }
});
document.getElementById('adminPinCancelBtn').addEventListener('click', ()=>{
  document.getElementById('adminPinOverlay').classList.remove('show');
});
async function tryAdminPin(){
  const pinInput = document.getElementById('adminPinInput');
  const hash = window.sha256Hex ? await window.sha256Hex(pinInput.value) : null;
  if(hash === ADMIN_PIN_HASH){
    document.getElementById('adminPinOverlay').classList.remove('show');
    openAdminStats();
  } else {
    document.getElementById('adminPinError').style.display = 'block';
    pinInput.value = '';
    pinInput.focus();
  }
}
document.getElementById('adminPinSubmitBtn').addEventListener('click', tryAdminPin);
document.getElementById('adminPinInput').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') tryAdminPin();
});

async function openAdminStats(){
  const overlay = document.getElementById('adminOverlay');
  const body = document.getElementById('adminStatsBody');
  overlay.classList.add('show');
  body.innerHTML = '<div class="lbEmpty">Loading…</div>';

  const [timedStarts, standardStarts, standardResults, timedResults, signalAttempts, timedLbEntries, sessions, pcqResults, pcqRoundAttempts] = await Promise.all([
    cloudFetch('analytics/timedStarts'),
    cloudFetch('analytics/standardStarts'),
    cloudFetch('analytics/standardResults'),
    cloudFetch('analytics/timedResults'),
    cloudFetch('analytics/signalAttempts'),
    cloudFetch('timedLeaderboard'),
    cloudFetch('analytics/sessions'),
    cloudFetch('analytics/pcqResults'),
    cloudFetch('analytics/pcqRoundAttempts'),
  ]);
  const players = window.PlayerIdentity ? await window.PlayerIdentity.fetchAllPlayers() : {};

  if([timedStarts, standardStarts, standardResults, timedResults, signalAttempts].includes(null)){
    body.innerHTML = '<div class="lbEmpty">⚠️ Could not reach the team server — check your connection and try again.</div>';
    return;
  }

  // ---- Registered players -- who's set up a name+code, and when they
  // were last seen. Not tied to any specific quiz's scores yet (that
  // needs each quiz to record against a player id, which isn't wired up
  // yet) -- this is "who's using the app at all," which is the first
  // piece of that picture. ----
  const playerRows = Object.keys(players).map(id => Object.assign({id}, players[id]))
    .sort((a, b) => new Date(b.lastSeen || b.createdAt || 0) - new Date(a.lastSeen || a.createdAt || 0));
  function fmtWhen(iso){
    if(!iso) return '—';
    const d = new Date(iso);
    if(isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, {month:'short', day:'numeric'}) + ' ' +
      d.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
  }
  function playerRowHtml(p){
    const tag = p.isCoach ? ' <span style="opacity:.6">(coach)</span>' : '';
    const best = p.pcqBestScore ? `🧠 ${p.pcqBestScore}/${p.pcqBestMaxScore}` : '—';
    // Reset button only shows once there's actually a score to clear --
    // e.g. wiping out a coach's own test run so it doesn't linger as a
    // real entry on the leaderboard/admin view.
    const resetBtn = p.pcqBestScore
      ? `<button class="lbLinkBtn pcqResetBtn" data-player-id="${p.id}" data-player-name="${p.name}" style="display:block;margin-left:auto;font-size:9.5px;margin-top:1px;">Reset</button>`
      : '';
    return `<div class="lbRow"><div class="lbRank" style="font-size:10px;width:auto;background:transparent;color:var(--muted)">${fmtWhen(p.lastSeen)}</div>
      <div class="lbName">${p.name}${tag}</div>
      <div class="lbScore" style="font-size:10px;text-align:right;">${best}${resetBtn}</div></div>`;
  }
  const playersHtml = playerRows.length
    ? playerRows.map(playerRowHtml).join('')
    : '<div class="lbEmpty">No one has signed in with a name+code yet.</div>';

  function statCard(num, label){
    return `<div class="adminStatCard"><div class="num">${num}</div><div class="lbl">${label}</div></div>`;
  }

  // ---- Standard quiz aggregate stats ----
  let standardBlock = '<div class="lbEmpty">No completed Standard Quiz runs yet.</div>';
  if(standardResults.length){
    const avgScore = standardResults.reduce((s,r)=>s+r.score,0) / standardResults.length;
    const avgPct = Math.round(avgScore / standardResults[0].total * 100);
    standardBlock = `<div class="adminStatGrid">
      ${statCard(standardResults.length, 'Runs Completed')}
      ${statCard(avgPct+'%', 'Average Score')}
    </div>`;
  }

  // ---- Timed quiz aggregate stats ----
  let timedBlock = '<div class="lbEmpty">No completed Timed Quiz runs yet.</div>';
  if(timedResults.length){
    const times = timedResults.map(r=>r.timeMs);
    const avgMs = times.reduce((a,b)=>a+b,0) / times.length;
    const fastest = Math.min(...times);
    const slowest = Math.max(...times);
    timedBlock = `<div class="adminStatGrid">
      ${statCard(timedResults.length, 'Runs Completed')}
      ${statCard(formatClock(avgMs), 'Average Time')}
      ${statCard(formatClock(fastest), 'Fastest Time')}
      ${statCard(formatClock(slowest), 'Slowest Time')}
    </div>`;
  }

  // ---- Recent individual timed sessions -- matched against the saved
  // leaderboard so unsaved/unnamed runs (someone finished but never
  // entered a name) are clearly flagged rather than invisible ----
  const savedEntries = (timedLbEntries || []).slice();
  function findSavedName(result){
    const match = savedEntries.find(e => e.timeMs === result.timeMs && e.mistakes === result.mistakes);
    return match ? match.name : null;
  }
  const recentSessions = timedResults.slice()
    .sort((a,b) => new Date(b.date) - new Date(a.date))
    .slice(0, 20);
  function sessionRowHtml(r){
    const d = new Date(r.date);
    const dateStr = isNaN(d) ? '' : d.toLocaleDateString(undefined, {month:'short', day:'numeric'}) + ' ' +
      d.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
    const name = findSavedName(r);
    const nameHtml = name
      ? `<span style="color:var(--ink)">${name}</span>`
      : `<span style="color:#b03030;font-weight:800">❓ Unsaved</span>`;
    return `<div class="lbRow"><div class="lbRank" style="font-size:10px;width:auto;background:transparent;color:var(--muted)">${dateStr}</div>
      <div class="lbName">${nameHtml}</div>
      <div class="lbScore">${formatClock(r.timeMs)} • ✗${r.mistakes}</div></div>`;
  }
  const sessionsHtml = recentSessions.length
    ? recentSessions.map(sessionRowHtml).join('')
    : '<div class="lbEmpty">No timed sessions yet.</div>';
  const unsavedCount = recentSessions.filter(r => !findSavedName(r)).length;

  // ---- Team-wide hardest / easiest signals, from every recorded attempt ----
  const bySignal = {};
  signalAttempts.forEach(a=>{
    if(!bySignal[a.signalId]) bySignal[a.signalId] = {attempts:0, misses:0};
    bySignal[a.signalId].attempts++;
    if(!a.correct) bySignal[a.signalId].misses++;
  });
  const signalRows = Object.keys(bySignal).map(id=>{
    const s = bySignal[id];
    const card = ALL_CARDS.find(c=>c.id===Number(id));
    return card ? { card, attempts:s.attempts, misses:s.misses, missRate:s.misses/s.attempts } : null;
  }).filter(r=>r && r.attempts>=3);

  function signalRowHtml(r){
    const pct = Math.round((1-r.missRate)*100);
    return `<div class="lbRow"><div class="lbRank">#${r.card.id}</div>
      <div class="lbName">${r.card.meaning}</div>
      <div class="lbScore">${pct}% (${r.attempts-r.misses}/${r.attempts})</div></div>`;
  }
  const hardest = [...signalRows].filter(r=>r.missRate>0).sort((a,b)=>b.missRate-a.missRate).slice(0,5);
  const easiest = [...signalRows].filter(r=>r.missRate===0).sort((a,b)=>b.attempts-a.attempts).slice(0,5);
  const hardestHtml = hardest.length ? hardest.map(signalRowHtml).join('') : '<div class="lbEmpty">Not enough team data yet.</div>';
  const easiestHtml = easiest.length ? easiest.map(signalRowHtml).join('') : '<div class="lbEmpty">Not enough team data yet.</div>';

  // ---- Player Activity & Highlights -- Nathan: "once players start to
  // register with name and pin, keep all record history available to
  // see. show me metrics of how often they are using it, how long they
  // are using it, what scores they are getting, create a little report
  // with highlights and players who are excelling then those who are
  // struggling and what they could do." Everything here reads from the
  // newly-added analytics/sessions, analytics/pcqResults, and
  // analytics/pcqRoundAttempts logs -- entries from before this feature
  // shipped won't have a playerId (or won't exist at all for sessions),
  // so history/highlights only start building up from here forward, not
  // retroactively.
  const sessionsSafe = sessions || [];
  const pcqResultsSafe = pcqResults || [];
  const pcqRoundAttemptsSafe = pcqRoundAttempts || [];
  const nowMs = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const nonCoachPlayers = playerRows.filter(p => !p.isCoach);

  const activePlayers7d = nonCoachPlayers.filter(p =>
    p.lastSeen && (nowMs - new Date(p.lastSeen).getTime()) <= SEVEN_DAYS_MS).length;
  const sessions7dCount = sessionsSafe.filter(s =>
    s.startedAt && (nowMs - new Date(s.startedAt).getTime()) <= SEVEN_DAYS_MS).length;
  const sessionsWithDuration = sessionsSafe.filter(s => typeof s.durationMs === 'number' && s.durationMs > 0);
  const avgSessionMsTeam = sessionsWithDuration.length
    ? sessionsWithDuration.reduce((sum, s) => sum + s.durationMs, 0) / sessionsWithDuration.length
    : 0;
  const teamPcqAttempts = pcqResultsSafe.filter(r => r.maxScore);
  const teamPcqAvgPct = teamPcqAttempts.length
    ? Math.round(teamPcqAttempts.reduce((s,r) => s + r.score/r.maxScore, 0) / teamPcqAttempts.length * 100)
    : null;

  function fmtDuration(ms){
    if(!ms) return '—';
    const mins = Math.round(ms/60000);
    if(mins < 1) return '<1 min';
    if(mins < 60) return mins + ' min';
    return `${Math.floor(mins/60)}h ${mins%60}m`;
  }

  // Per-player Play Calls Quiz attempt history (newest first).
  const pcqByPlayer = {};
  pcqResultsSafe.forEach(r => {
    if(!r.playerId) return; // pre-instrumentation entries can't be attributed
    (pcqByPlayer[r.playerId] = pcqByPlayer[r.playerId] || []).push(r);
  });
  Object.keys(pcqByPlayer).forEach(id => pcqByPlayer[id].sort((a,b) => new Date(b.date) - new Date(a.date)));

  // Per-player, per-play-call miss rate -- powers the "what they could do"
  // tip on a struggling player's card with something specific instead of
  // a generic "practice more."
  const roundsByPlayer = {};
  pcqRoundAttemptsSafe.forEach(a => {
    if(!a.playerId) return;
    const byKey = (roundsByPlayer[a.playerId] = roundsByPlayer[a.playerId] || {});
    const entry = (byKey[a.playKey] = byKey[a.playKey] || {attempts:0, misses:0});
    entry.attempts++;
    if(!a.correct) entry.misses++;
  });
  function playLabel(key){
    const pt = (window.DATA && DATA.playTypes || []).find(p => p.key === key);
    return pt ? pt.label : key;
  }
  function weakestPlayFor(playerId){
    const byKey = roundsByPlayer[playerId];
    if(!byKey) return null;
    const candidates = Object.keys(byKey)
      .map(k => Object.assign({key:k, missRate: byKey[k].misses / byKey[k].attempts}, byKey[k]))
      .filter(c => c.attempts >= 2 && c.misses > 0);
    if(!candidates.length) return null;
    candidates.sort((a,b) => b.missRate - a.missRate);
    return playLabel(candidates[0].key);
  }

  const playerActivityRows = nonCoachPlayers.map(p => {
    const history = pcqByPlayer[p.id] || [];
    const scored = history.filter(r => r.maxScore);
    const avgPct = scored.length ? Math.round(scored.reduce((s,r) => s + r.score/r.maxScore, 0) / scored.length * 100) : null;
    const playerSessions = sessionsSafe.filter(s => s.playerId === p.id);
    const playerSessionsWithDur = playerSessions.filter(s => typeof s.durationMs === 'number' && s.durationMs > 0);
    const avgDur = playerSessionsWithDur.length
      ? playerSessionsWithDur.reduce((s,x) => s + x.durationMs, 0) / playerSessionsWithDur.length
      : 0;
    return {
      id: p.id, name: p.name, attempts: scored.length, avgPct: avgPct,
      sessionsCount: playerSessions.length, avgSessionMs: avgDur,
      lastSeen: p.lastSeen, history: history.slice(0, 5),
    };
  });

  // Needs at least 2 scored attempts before showing up in either list --
  // one lucky/unlucky run shouldn't brand someone as excelling or
  // struggling.
  const MIN_ATTEMPTS_FOR_HIGHLIGHT = 2;
  const eligibleForHighlights = playerActivityRows.filter(p => p.attempts >= MIN_ATTEMPTS_FOR_HIGHLIGHT && p.avgPct !== null);
  const excelling = [...eligibleForHighlights].sort((a,b) => b.avgPct - a.avgPct).slice(0,3);
  const needsAttention = [...eligibleForHighlights].sort((a,b) => a.avgPct - b.avgPct).slice(0,3);

  function highlightRowHtml(p, isExcelling){
    const icon = isExcelling ? '🌟' : '🧭';
    const weak = !isExcelling ? weakestPlayFor(p.id) : null;
    const tip = isExcelling
      ? `Averaging ${p.avgPct}% across ${p.attempts} plays.`
      : (weak
        ? `Missing "${weak}" calls most -- worth a few extra reps there.`
        : `Averaging ${p.avgPct}% across ${p.attempts} plays -- keep at it!`);
    return `<div class="lbRow"><div class="lbRank">${icon}</div>
      <div class="lbNameTip"><div class="lbNameTipTitle">${p.name}</div><div class="lbTip">${tip}</div></div>
      <div class="lbScore">${p.avgPct}%</div></div>`;
  }
  const excellingHtml = excelling.length ? excelling.map(p => highlightRowHtml(p, true)).join('') : '<div class="lbEmpty">Not enough Play Calls Quiz data yet (needs at least 2 scored attempts per player).</div>';
  const needsAttentionHtml = needsAttention.length ? needsAttention.map(p => highlightRowHtml(p, false)).join('') : '<div class="lbEmpty">Not enough Play Calls Quiz data yet (needs at least 2 scored attempts per player).</div>';

  const activitySorted = playerActivityRows.slice().sort((a,b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
  function activityRowHtml(p){
    const historyHtml = p.history.length
      ? p.history.map(h => {
          const d = new Date(h.date);
          const dateStr = isNaN(d) ? '' : d.toLocaleDateString(undefined, {month:'short', day:'numeric'});
          const pct = h.maxScore ? Math.round(h.score/h.maxScore*100) : null;
          return `<div class="activityHistoryRow"><span>${dateStr}</span><span>${h.score}/${h.maxScore}${pct !== null ? ` (${pct}%)` : ''}</span></div>`;
        }).join('')
      : '<div class="activityHistoryRow" style="opacity:.6;">No Play Calls Quiz attempts yet.</div>';
    return `<details class="activityDetails">
      <summary class="lbRow"><div class="lbRank" style="font-size:10px;width:auto;background:transparent;color:var(--muted)">${fmtWhen(p.lastSeen)}</div>
        <div class="lbName">${p.name}</div>
        <div class="lbScore" style="font-size:10px;text-align:right;">${p.sessionsCount} visit${p.sessionsCount===1?'':'s'} • ${fmtDuration(p.avgSessionMs)} avg</div></summary>
      <div class="activityHistoryList">${historyHtml}</div>
    </details>`;
  }
  const activityListHtml = activitySorted.length ? activitySorted.map(activityRowHtml).join('') : '<div class="lbEmpty">No one has signed in with a name+code yet.</div>';

  // ---- Dashboard shell: a home screen of buttons instead of one long
  // scroll -- each button opens exactly one panel below, with a Back
  // button to return. Panels are all rendered up front (data's already
  // fetched) and just toggled with display:none/'' -- no re-fetching on
  // navigation.
  body.innerHTML = `
    <div id="adminHome">
      <div class="adminStatGrid">
        ${statCard(timedStarts.length, 'Timed Quiz Starts')}
        ${statCard(standardStarts.length, 'Standard Quiz Starts')}
      </div>
      <div class="adminDashGrid">
        <button class="adminDashBtn" data-panel="activity">📈 Player Activity &amp; Highlights</button>
        <button class="adminDashBtn" data-panel="players">👤 Registered Players<span class="adminDashCount">${playerRows.length}</span></button>
        <button class="adminDashBtn" data-panel="standard">📝 Standard Quiz</button>
        <button class="adminDashBtn" data-panel="timed">⏱️ Timed Quiz</button>
        <button class="adminDashBtn" data-panel="sessions">🕓 Recent Sessions${unsavedCount ? `<span class="adminDashCount">${unsavedCount} unsaved</span>` : ''}</button>
        <button class="adminDashBtn" data-panel="signals">🎯 Signal Stats</button>
      </div>
    </div>
    <button class="navBtn secondary adminBackBtn" id="adminBackBtn" style="display:none;">‹ Back to Dashboard</button>
    <div class="adminPanel" data-panel="activity" style="display:none;">
      <div class="lbSectionHeader">📈 Team Snapshot</div>
      <div class="adminStatGrid">
        ${statCard(activePlayers7d, 'Active Players (7d)')}
        ${statCard(sessions7dCount, 'Visits (7d)')}
        ${statCard(fmtDuration(avgSessionMsTeam), 'Avg. Session')}
        ${statCard(teamPcqAvgPct !== null ? teamPcqAvgPct + '%' : '—', 'Team PCQ Avg')}
      </div>
      <div class="lbSectionHeader">🌟 Excelling</div>
      <div class="lbList">${excellingHtml}</div>
      <div class="lbSectionHeader">🧭 Needs Attention</div>
      <div class="lbList">${needsAttentionHtml}</div>
      <div class="lbSectionHeader">🕓 Every Player</div>
      <div class="lbList" style="max-height:340px;overflow-y:auto;">${activityListHtml}</div>
      <div class="lbSub" style="margin:8px 0 12px;">Tap a player to see their recent Play Calls Quiz history. Highlights need at least 2 scored attempts per player. Visits/session length only cover time since this feature shipped -- nothing before that was tracked.</div>
    </div>
    <div class="adminPanel" data-panel="players" style="display:none;">
      <div class="lbSectionHeader">👤 Registered Players (${playerRows.length})</div>
      <div class="lbList" style="max-height:340px;overflow-y:auto;">${playersHtml}</div>
      <div class="lbSub" style="margin:2px 0 12px;">Sorted by most recently active. 🧠 column is each player's Play Calls Quiz personal best (Study/Timed Quiz aren't tied to player IDs yet).</div>
    </div>
    <div class="adminPanel" data-panel="standard" style="display:none;">
      <div class="lbSectionHeader">📝 Standard Quiz</div>
      ${standardBlock}
      <div class="lbSub">Starts count every attempt, even if never finished.</div>
    </div>
    <div class="adminPanel" data-panel="timed" style="display:none;">
      <div class="lbSectionHeader">⏱️ Timed Quiz</div>
      ${timedBlock}
      <div class="lbSub">Starts count every attempt, even if never finished.</div>
    </div>
    <div class="adminPanel" data-panel="sessions" style="display:none;">
      <div class="lbSectionHeader">🕓 Recent Timed Sessions${unsavedCount ? ` (${unsavedCount} unsaved)` : ''}</div>
      <div class="lbList">${sessionsHtml}</div>
      <div class="lbSub">"Unsaved" means someone completed a timed run but never entered a name on the leaderboard.</div>
    </div>
    <div class="adminPanel" data-panel="signals" style="display:none;">
      <div class="lbSectionHeader">🥵 Hardest Signals (team-wide)</div>
      <div class="lbList">${hardestHtml}</div>
      <div class="lbSectionHeader">😎 Easiest Signals (team-wide)</div>
      <div class="lbList">${easiestHtml}</div>
      <div class="lbSub">Needs at least 3 team-wide attempts per signal to show.</div>
    </div>
    <div class="lbSub" style="opacity:.5;margin-top:14px;">build 2026-08-13 v5 (player activity + highlights)</div>`;

  const homeEl = body.querySelector('#adminHome');
  const backBtn = body.querySelector('#adminBackBtn');
  const panels = [...body.querySelectorAll('.adminPanel')];
  body.querySelectorAll('.adminDashBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      homeEl.style.display = 'none';
      backBtn.style.display = '';
      panels.forEach(p => { p.style.display = (p.dataset.panel === btn.dataset.panel) ? '' : 'none'; });
    });
  });
  body.querySelectorAll('.pcqResetBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.playerId;
      const name = btn.dataset.playerName;
      if(!confirm(`Clear ${name}'s Play Calls Quiz score? This can't be undone.`)) return;
      btn.disabled = true;
      btn.textContent = '…';
      try {
        await window.PlayerIdentity.resetQuizStats(id);
        await openAdminStats(); // re-fetch + rerender with the cleared score
        const playersBtnAgain = body.querySelector('.adminDashBtn[data-panel="players"]');
        if(playersBtnAgain) playersBtnAgain.dispatchEvent(new Event('click')); // stay on the Players panel
      } catch(e){
        btn.disabled = false;
        btn.textContent = 'Reset';
        alert('Could not reach the team server -- try again.');
      }
    });
  });
  backBtn.addEventListener('click', () => {
    homeEl.style.display = '';
    backBtn.style.display = 'none';
    panels.forEach(p => { p.style.display = 'none'; });
  });
}
document.getElementById('adminCloseBtn').addEventListener('click', ()=>{
  document.getElementById('adminOverlay').classList.remove('show');
});

function getLeaderboard(){
  try { const raw = localStorage.getItem(LEADERBOARD_KEY); return raw ? JSON.parse(raw) : []; } catch(e) { return []; }
}
function saveLeaderboardLocal(entry){
  const list = getLeaderboard();
  list.push(entry);
  list.sort((a,b)=> b.score - a.score || (b.bestStreak||0) - (a.bestStreak||0) || new Date(a.date) - new Date(b.date));
  try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list.slice(0, LEADERBOARD_MAX))); } catch(e) {}
}
function getTimedLeaderboard(){
  try { const raw = localStorage.getItem(TIMED_LEADERBOARD_KEY); return raw ? JSON.parse(raw) : []; } catch(e) { return []; }
}
function saveTimedLeaderboardLocal(entry){
  const list = getTimedLeaderboard();
  list.push(entry);
  list.sort((a,b)=> a.timeMs - b.timeMs || a.mistakes - b.mistakes || new Date(a.date) - new Date(b.date));
  try { localStorage.setItem(TIMED_LEADERBOARD_KEY, JSON.stringify(list.slice(0, TIMED_LEADERBOARD_MAX))); } catch(e) {}
}

function lbRowHtml(entry, i, highlightEntry, scoreHtml){
  const isMe = highlightEntry && entry.date === highlightEntry.date && entry.name === highlightEntry.name;
  const medal = i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : (i+1);
  return `<div class="lbRow${isMe?' me':''}${i<3?' top3':''}">
    <div class="lbRank">${medal}</div>
    <div class="lbName">${entry.name}</div>
    <div class="lbScore">${scoreHtml}</div>
  </div>`;
}

// ---- Name-based dedup: "same name is the same person" -- each board
// should only give one person one spot, keeping their best entry. Done
// client-side at render time (not by deleting anything from Firebase),
// so nothing's lost if two different people ever did share a name.
function normName(n){ return (n||'').trim().toLowerCase(); }
function dedupeBestByName(list, isBetter){
  const byName = {};
  list.forEach(entry => {
    const key = normName(entry.name);
    if(!key) return;
    if(!byName[key] || isBetter(entry, byName[key])) byName[key] = entry;
  });
  return Object.values(byName);
}
function quizIsBetter(a, b){
  if(a.score !== b.score) return a.score > b.score;
  return (a.bestStreak||0) > (b.bestStreak||0);
}
function timedIsBetter(a, b){
  if(a.timeMs !== b.timeMs) return a.timeMs < b.timeMs;
  return a.mistakes < b.mistakes;
}

async function fetchQuizLeaderboardData(){
  const cloudList = await cloudFetch('leaderboard');
  const offline = cloudList === null;
  const raw = (offline ? getLeaderboard() : cloudList).slice();
  const deduped = dedupeBestByName(raw, quizIsBetter);
  deduped.sort((a,b)=> b.score - a.score || (b.bestStreak||0) - (a.bestStreak||0) || new Date(a.date) - new Date(b.date));
  return { list: deduped.slice(0, LEADERBOARD_MAX), offline: offline };
}
async function fetchTimedLeaderboardData(){
  const cloudList = await cloudFetch('timedLeaderboard');
  const offline = cloudList === null;
  const raw = (offline ? getTimedLeaderboard() : cloudList).slice();
  const deduped = dedupeBestByName(raw, timedIsBetter);
  deduped.sort((a,b)=> a.timeMs - b.timeMs || a.mistakes - b.mistakes || new Date(a.date) - new Date(b.date));
  return { list: deduped.slice(0, TIMED_LEADERBOARD_MAX), offline: offline };
}
// Play Calls Quiz doesn't need its own manual "save to leaderboard" step or
// storage path -- every signed-in player's best run is already tracked on
// their player record (pcqBestScore), so this just reads that straight
// from PlayerIdentity instead of duplicating the data.
async function fetchPCQLeaderboardData(){
  if(!window.PlayerIdentity) return { list: [], offline: true };
  const players = await window.PlayerIdentity.fetchAllPlayers();
  const raw = Object.values(players)
    .filter(p => p.pcqBestScore)
    .map(p => ({ name: p.name, score: p.pcqBestScore, maxScore: p.pcqBestMaxScore }));
  const deduped = dedupeBestByName(raw, (a, b) => a.score > b.score);
  deduped.sort((a,b)=> b.score - a.score);
  return { list: deduped.slice(0, LEADERBOARD_MAX), offline: false };
}

async function renderLeaderboard(highlightEntry){
  const lbList = document.getElementById('lbList');
  lbList.innerHTML = '<div class="lbEmpty">Loading team scores…</div>';
  const { list, offline } = await fetchQuizLeaderboardData();
  if(list.length === 0){
    lbList.innerHTML = '<div class="lbEmpty">No scores yet — finish a quiz to be the first!</div>';
  } else {
    lbList.innerHTML = list.map((e,i)=> lbRowHtml(e, i, highlightEntry, `${e.score}/${e.total}${e.bestStreak?` • 🔥${e.bestStreak}`:''}`)).join('');
  }
  if(offline){
    lbList.innerHTML += '<div class="lbOfflineNote">⚠️ Showing scores saved on this device only — could not reach the team server.</div>';
  }
}
async function renderTimedLeaderboard(highlightEntry){
  const timedLbList = document.getElementById('timedLbList');
  timedLbList.innerHTML = '<div class="lbEmpty">Loading team times…</div>';
  const { list, offline } = await fetchTimedLeaderboardData();
  if(list.length === 0){
    timedLbList.innerHTML = '<div class="lbEmpty">No times yet — finish a Timed Quiz to be the first!</div>';
  } else {
    timedLbList.innerHTML = list.map((e,i)=> lbRowHtml(e, i, highlightEntry, `${formatClock(e.timeMs)} • ✗${e.mistakes}`)).join('');
  }
  if(offline){
    timedLbList.innerHTML += '<div class="lbOfflineNote">⚠️ Showing times saved on this device only — could not reach the team server.</div>';
  }
}
async function renderPCQLeaderboard(){
  const pcqLbList = document.getElementById('pcqLbList');
  pcqLbList.innerHTML = '<div class="lbEmpty">Loading team scores…</div>';
  const { list } = await fetchPCQLeaderboardData();
  pcqLbList.innerHTML = list.length
    ? list.map((e,i)=> lbRowHtml(e, i, null, `${e.score}/${e.maxScore}`)).join('')
    : '<div class="lbEmpty">No Play Calls Quiz scores yet — finish a run to be the first!</div>';
}

// ---- Overall: rank-based points (20 for 1st down to 1 for 20th) on each
// contributing board, summed by name. Quiz Scores is deliberately left out
// -- with the standard quiz being easy enough that most engaged players
// land on 30/30, ranking it wouldn't mean much (per Nathan's note).
function pointsForRank(list){
  const pts = {};
  list.slice(0, 20).forEach((e, i) => { pts[normName(e.name)] = { name: e.name, points: 20 - i }; });
  return pts;
}
// Shared by both the Overall leaderboard tab and My Stats, so the two
// never disagree about what someone's overall rank/points actually are.
async function computeOverallStandings(){
  const [timedData, pcqData] = await Promise.all([fetchTimedLeaderboardData(), fetchPCQLeaderboardData()]);
  const timedPts = pointsForRank(timedData.list);
  const pcqPts = pointsForRank(pcqData.list);
  const combined = {};
  [timedPts, pcqPts].forEach(ptsMap => {
    Object.keys(ptsMap).forEach(key => {
      if(!combined[key]) combined[key] = { name: ptsMap[key].name, points: 0 };
      combined[key].points += ptsMap[key].points;
    });
  });
  return Object.values(combined).sort((a,b)=> b.points - a.points);
}
async function renderOverallLeaderboard(){
  const overallLbList = document.getElementById('overallLbList');
  overallLbList.innerHTML = '<div class="lbEmpty">Loading overall standings…</div>';
  const ranked = await computeOverallStandings();
  overallLbList.innerHTML = ranked.length
    ? ranked.map((e,i)=> lbRowHtml(e, i, null, `${e.points} pt${e.points===1?'':'s'}`)).join('')
    : '<div class="lbEmpty">No points yet — finish a Timed Quiz or Play Calls Quiz to get on the board!</div>';
}

// ---- My Stats: a signed-in player's own bests + ranks. Deliberately
// summary-only (best score/time + rank per board) -- no round-by-round or
// session-by-session history here. Recent quiz history stays admin-only,
// in Coach Stats -- per Nathan's instruction, players (other than the
// admin account) shouldn't be able to see anyone's detailed history,
// including their own, only the headline numbers.
function findEntryAndRank(list, name){
  const idx = list.findIndex(e => normName(e.name) === normName(name));
  return idx === -1 ? { entry: null, rank: null } : { entry: list[idx], rank: idx + 1 };
}
// Turns a rank + board size into a 0-100 fill for the progress bar --
// rank 1 (best) fills all the way, worst rank still leaves a visible
// sliver so the bar always reads as "a bar", never as empty/broken.
function msBarFillPct(rank, total){
  if(!rank) return 0;
  if(total <= 1) return 100;
  return Math.max(6, Math.round(((total - rank) / (total - 1)) * 100));
}
// "Top 15% • #3 of 20" -- more meaningful at a glance than the rank number
// alone, since #3 means something very different on a board of 4 vs 20.
function msRankCaption(rank, total){
  if(!rank) return 'Not on the board yet';
  const topPct = Math.max(1, Math.ceil((rank / total) * 100));
  return `Top ${topPct}% • #${rank} of ${total}`;
}
function myStatRowHtml(icon, label, valueText, rank, total, isHero){
  const barPct = msBarFillPct(rank, total);
  const caption = total ? msRankCaption(rank, total) : 'No data yet';
  return `<div class="msStatCard${isHero ? ' msHero' : ''}">
    <div class="msStatTop">
      <span class="msIcon">${icon}</span>
      <span class="msLabel">${label}</span>
      <span class="msValue">${valueText}</span>
    </div>
    <div class="msBarTrack"><div class="msBarFill" style="width:${barPct}%"></div></div>
    <div class="msCaption">${caption}</div>
  </div>`;
}
window.showMyStats = async function showMyStats(){
  const session = window.PlayerIdentity ? window.PlayerIdentity.getSession() : null;
  const overlay = document.getElementById('myStatsOverlay');
  const body = document.getElementById('myStatsBody');
  if(!overlay || !body || !session) return;
  overlay.classList.add('show');
  body.innerHTML = '<div class="lbEmpty">Loading your stats…</div>';
  const [timedData, pcqData, quizData, overallList] = await Promise.all([
    fetchTimedLeaderboardData(), fetchPCQLeaderboardData(), fetchQuizLeaderboardData(), computeOverallStandings(),
  ]);
  const pcq = findEntryAndRank(pcqData.list, session.name);
  const timed = findEntryAndRank(timedData.list, session.name);
  const quiz = findEntryAndRank(quizData.list, session.name);
  const overall = findEntryAndRank(overallList, session.name);
  body.innerHTML = '<div class="msStatList">' + [
    myStatRowHtml('🏆', 'Overall Points', overall.entry ? `${overall.entry.points} pts` : '0 pts', overall.rank, overallList.length, true),
    myStatRowHtml('⏱️', 'Timed Quiz', timed.entry ? formatClock(timed.entry.timeMs) : 'No time saved yet', timed.rank, timedData.list.length),
    myStatRowHtml('🧠', 'Play Calls Quiz', pcq.entry ? `${pcq.entry.score}/${pcq.entry.maxScore}` : 'No score yet', pcq.rank, pcqData.list.length),
    myStatRowHtml('📝', 'Quiz Scores', quiz.entry ? `${quiz.entry.score}/${quiz.entry.total}${quiz.entry.bestStreak ? ` 🔥${quiz.entry.bestStreak}` : ''}` : 'No score yet', quiz.rank, quizData.list.length),
  ].join('') + '</div>' +
  '<div class="lbSub" style="margin-top:4px;">Ranks are out of the top 20 saved on each board. Overall points come from your Timed Quiz and Play Calls Quiz ranks (Quiz Scores isn\'t point-scored -- most players clear it, so ranking it wouldn\'t mean much). Timed Quiz and Quiz Scores need a saved name matching yours to show up here.</div>';
};
document.getElementById('myStatsCloseBtn').addEventListener('click', () => {
  document.getElementById('myStatsOverlay').classList.remove('show');
});

const LB_TAB_LIST_IDS = { overall: 'overallLbList', timed: 'timedLbList', quiz: 'lbList', pcq: 'pcqLbList' };
function showLbTab(tabKey){
  document.querySelectorAll('.lbTabBtn').forEach(b => b.classList.toggle('active', b.dataset.lbtab === tabKey));
  Object.keys(LB_TAB_LIST_IDS).forEach(key => {
    document.getElementById(LB_TAB_LIST_IDS[key]).style.display = key === tabKey ? '' : 'none';
  });
  const overallNote = document.getElementById('overallLbNote');
  if(overallNote) overallNote.style.display = tabKey === 'overall' ? '' : 'none';
}

const lbOverlay = document.getElementById('lbOverlay');
document.getElementById('openLeaderboardBtn').addEventListener('click', ()=>{
  lbOverlay.classList.add('show');
  showLbTab('overall');
  renderOverallLeaderboard();
  renderTimedLeaderboard(null);
  renderLeaderboard(null);
  renderPCQLeaderboard();
});
[...document.querySelectorAll('.lbTabBtn')].forEach(btn => {
  btn.addEventListener('click', () => showLbTab(btn.dataset.lbtab));
});
document.getElementById('lbCloseBtn').addEventListener('click', ()=>{
  lbOverlay.classList.remove('show');
});
document.getElementById('lbSaveBtn').addEventListener('click', async ()=>{
  const nameInput = document.getElementById('lbNameInput');
  const name = nameInput.value.trim();
  if(!name){ nameInput.focus(); return; }
  const entry = { name: name.slice(0,20)||'Anonymous', score: sigScore, total: sigDeck.length, bestStreak: sigBestStreakThisRun, date: new Date().toISOString() };
  saveLeaderboardLocal(entry);
  document.getElementById('lbSaveForm').style.display = 'none';
  document.getElementById('lbSaveConfirm').style.display = 'block';
  lbOverlay.classList.add('show');
  await cloudPush('leaderboard', entry);
  renderLeaderboard(entry);
});
document.getElementById('timedLbSaveBtn').addEventListener('click', async ()=>{
  const nameInput = document.getElementById('timedLbNameInput');
  const name = nameInput.value.trim();
  if(!name){ nameInput.focus(); return; }
  const entry = { name: name.slice(0,20)||'Anonymous', timeMs: timedElapsedMs, mistakes: timedMistakes, date: new Date().toISOString() };
  saveTimedLeaderboardLocal(entry);
  document.getElementById('timedLbSaveForm').style.display = 'none';
  lbOverlay.classList.add('show');
  await cloudPush('timedLeaderboard', entry);
  renderTimedLeaderboard(entry);
  renderOverallLeaderboard();
});

/* ============================================================
   SIGNAL QUIZ — multiple choice, rounds of up to 6 (count derived
   from ALL_CARDS.length below, not hardcoded), 2x2 answers
   ============================================================ */
const SIG_ROUND_SIZE = 6;
const SIG_TOTAL_ROUNDS = Math.ceil(ALL_CARDS.length / SIG_ROUND_SIZE);

let sigDeck = [], sigIdx = 0, sigScore = 0, sigRoundScore = 0, sigAnswered = false;
let sigCurrentStreak = 0, sigBestStreakThisRun = 0;
let sigMissedCards = [];
let sigPracticeMode = false;
const BEST_STREAK_KEY = 'bengalsSignalBestStreak';
function getBestStreakEver(){
  try { return parseInt(localStorage.getItem(BEST_STREAK_KEY) || '0', 10); } catch(e) { return 0; }
}
function maybeSaveBestStreak(streak){
  try {
    if(streak > getBestStreakEver()) localStorage.setItem(BEST_STREAK_KEY, String(streak));
  } catch(e) {}
}

const sigStatsLine = document.getElementById('sigStatsLine');
const sigImgWrap = document.getElementById('sigImgWrap');
const sigQImg = document.getElementById('sigQImg');
const sigChoices = document.getElementById('sigChoices');
const sigFeedback = document.getElementById('sigFeedback');
const sigNavRow = document.getElementById('sigNavRow');
const sigRoundScreen = document.getElementById('sigRoundScreen');
const sigRoundTitle = document.getElementById('sigRoundTitle');
const sigRoundText = document.getElementById('sigRoundText');
const sigDoneScreen = document.getElementById('sigDoneScreen');
const sigDoneText = document.getElementById('sigDoneText');
const sigHintEl = document.querySelector('#signalQuiz .sigHint');

function sigCurrentRound(){ return Math.floor(sigIdx / SIG_ROUND_SIZE) + 1; }
function sigPosInRound(){ return (sigIdx % SIG_ROUND_SIZE) + 1; }

// Replaces the old single dot-separated sentence ("Round 1 of 5 • Signal 1
// of 6 • Score 0/0 • 🔥 Streak 0") with a tidy stat row plus a dot strip
// showing position within the current round -- same information, a lot
// less to parse at a glance.
function renderSigStatsLine(){
  if(sigPracticeMode){
    sigStatsLine.innerHTML = `<div class="qsRow">` +
      `<span>Practice ${sigIdx+1} of ${sigDeck.length}</span>` +
      `<span class="qsScore">${sigScore}/${sigIdx}</span>` +
      `<span class="qsStreak">🔥 ${sigCurrentStreak}</span>` +
      `</div>`;
    return;
  }
  const pos = sigPosInRound();
  const dots = Array.from({length: SIG_ROUND_SIZE}, (_, i) => {
    const n = i + 1;
    const cls = n < pos ? 'qsDot filled' : (n === pos ? 'qsDot current' : 'qsDot');
    return `<span class="${cls}"></span>`;
  }).join('');
  sigStatsLine.innerHTML = `<div class="qsRow">` +
    `<span>Round ${sigCurrentRound()} of ${SIG_TOTAL_ROUNDS}</span>` +
    `<span class="qsScore">${sigScore}/${sigIdx}</span>` +
    `<span class="qsStreak">🔥 ${sigCurrentStreak}</span>` +
    `</div><div class="qsDots">${dots}</div>`;
}

function sigDisplayText(c){
  if(cardGroup(c) === 'Location / Direction'){
    if(/LEFT/i.test(c.meaning)) return 'LEFT';
    if(/RIGHT/i.test(c.meaning)) return 'RIGHT';
  }
  if(/MOTION/i.test(c.meaning)) return 'MOTION';
  return c.meaning;
}

function sigBuildQuiz(){
  sigPracticeMode = false;
  sigDeck = shuffleArr(ALL_CARDS.slice());
  sigIdx = 0; sigScore = 0; sigRoundScore = 0;
  sigCurrentStreak = 0; sigBestStreakThisRun = 0;
  sigMissedCards = [];
  document.getElementById('lbSaveForm').style.display = 'flex';
  document.getElementById('lbSaveConfirm').style.display = 'none';
  document.getElementById('lbNameInput').value = '';
  logQuizStart('standardStarts');
  sigShowQuestionUI();
  sigRenderQuestion();
}
function sigBuildPracticeQuiz(cards){
  sigPracticeMode = true;
  sigDeck = shuffleArr(cards.slice());
  sigIdx = 0; sigScore = 0; sigRoundScore = 0;
  sigCurrentStreak = 0; sigBestStreakThisRun = 0;
  sigMissedCards = [];
  document.getElementById('lbSaveForm').style.display = 'none';
  sigShowQuestionUI();
  sigRenderQuestion();
}
function sigShowQuestionUI(){
  sigRoundScreen.style.display = 'none';
  sigDoneScreen.style.display = 'none';
  sigImgWrap.style.display = '';
  sigChoices.style.display = 'grid';
  sigHintEl.style.display = '';
}
function sigRenderQuestion(){
  if(sigIdx >= sigDeck.length){ sigFinishQuiz(); return; }
  sigAnswered = false;
  const c = sigDeck[sigIdx];
  sigQImg.src = c.img;
  sigFeedback.textContent = ''; sigFeedback.className = 'seq-feedback';
  sigNavRow.style.display = 'none';
  renderSigStatsLine();

  const correctText = sigDisplayText(c);
  const seenTexts = new Set([correctText]);
  const distractors = [];
  shuffleArr(ALL_CARDS.slice()).forEach(x=>{
    if(distractors.length>=3) return;
    if(x.id===c.id) return;
    const t = sigDisplayText(x);
    if(seenTexts.has(t)) return;
    seenTexts.add(t);
    distractors.push(x);
  });
  const options = shuffleArr([c, ...distractors]);
  sigChoices.innerHTML = options.map(o=>`<button class="seq-choice" data-id="${o.id}">${sigDisplayText(o)}</button>`).join('');
  sigChoices.querySelectorAll('.seq-choice').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(sigAnswered) return;
      sigAnswered = true;
      const correct = Number(btn.dataset.id) === c.id;
      recordSignalAttempt(c.id, correct);
      cloudPush('analytics/signalAttempts', Object.assign({ signalId: c.id, correct, date: new Date().toISOString() }, currentPlayerTag()));
      if(correct){
        sigScore++; sigRoundScore++; playSound(correctSound);
        sigCurrentStreak++;
        sigBestStreakThisRun = Math.max(sigBestStreakThisRun, sigCurrentStreak);
      } else {
        playSound(wrongSound);
        sigCurrentStreak = 0;
        sigMissedCards.push(c);
      }
      sigChoices.querySelectorAll('.seq-choice').forEach(b=>{
        b.disabled = true;
        if(Number(b.dataset.id)===c.id) b.classList.add('correct');
        else if(b===btn) b.classList.add('wrong');
      });
      sigFeedback.textContent = correct ? ('✓ Correct — ' + correctText) : ('✗ It was — ' + correctText);
      sigFeedback.classList.add(correct?'good':'bad');
      sigNavRow.style.display = 'flex';
    });
  });
}
document.getElementById('sigNextBtn').addEventListener('click', ()=>{
  sigIdx++;
  if(!sigPracticeMode && sigIdx < sigDeck.length && sigIdx % SIG_ROUND_SIZE === 0){
    sigShowRoundBreak();
  } else {
    sigRenderQuestion();
  }
});
function sigShowRoundBreak(){
  sigImgWrap.style.display = 'none';
  sigChoices.style.display = 'none';
  sigHintEl.style.display = 'none';
  sigFeedback.textContent = ''; sigNavRow.style.display = 'none';
  const finishedRound = sigIdx / SIG_ROUND_SIZE;
  sigRoundTitle.textContent = `Round ${finishedRound} Complete!`;
  sigRoundText.textContent = `${sigRoundScore}/${SIG_ROUND_SIZE} correct this round  •  ${sigScore}/${sigIdx} overall`;
  sigRoundScreen.style.display = 'block';
  sigRoundScore = 0;
}
document.getElementById('sigRoundContinueBtn').addEventListener('click', ()=>{
  sigShowQuestionUI();
  sigRenderQuestion();
});
function sigFinishQuiz(){
  sigImgWrap.style.display = 'none';
  sigChoices.style.display = 'none';
  sigHintEl.style.display = 'none';
  sigFeedback.textContent = ''; sigNavRow.style.display = 'none';
  sigRoundScreen.style.display = 'none';
  sigDoneScreen.style.display = 'block';

  const reviewRow = document.getElementById('reviewMissedRow');
  const practiceTag = document.getElementById('practiceModeTag');
  practiceTag.style.display = sigPracticeMode ? 'inline-block' : 'none';

  if(sigPracticeMode){
    sigDoneText.textContent = `${sigScore}/${sigDeck.length} correct on your practice round.`;
    reviewRow.style.display = sigMissedCards.length ? 'flex' : 'none';
    document.getElementById('reviewMissedBtn').textContent = `📖 Review Missed (${sigMissedCards.length})`;
    logHistory({ date: new Date().toISOString(), mode: 'practice', score: sigScore, total: sigDeck.length });
  } else {
    maybeSaveBestStreak(sigBestStreakThisRun);
    sigDoneText.textContent = `${sigScore}/${sigDeck.length} correct — nice work! Best streak: 🔥${sigBestStreakThisRun} (all-time best on this device: 🔥${getBestStreakEver()})`;
    reviewRow.style.display = sigMissedCards.length ? 'flex' : 'none';
    document.getElementById('reviewMissedBtn').textContent = `📖 Review Missed (${sigMissedCards.length})`;
    logHistory({ date: new Date().toISOString(), mode: 'standard', score: sigScore, total: sigDeck.length, bestStreak: sigBestStreakThisRun });
    cloudPush('analytics/standardResults', Object.assign({ score: sigScore, total: sigDeck.length, mistakes: sigDeck.length-sigScore, bestStreak: sigBestStreakThisRun, date: new Date().toISOString() }, currentPlayerTag()));
  }
}
document.getElementById('sigRestartBtn').addEventListener('click', sigBuildQuiz);

/* ---- Missed-signal review + practice ---- */
document.getElementById('reviewMissedBtn').addEventListener('click', ()=>{
  const list = document.getElementById('missedList');
  list.innerHTML = sigMissedCards.map((c,i)=>`
    <div class="missedItem">
      <img src="${c.img}" alt="signal ${c.id}">
      <div><div class="missedNum">Signal #${c.id}</div><div class="missedMeaning">${c.meaning}</div></div>
    </div>`).join('');
  document.getElementById('missedOverlay').classList.add('show');
});
document.getElementById('missedCloseBtn').addEventListener('click', ()=>{
  document.getElementById('missedOverlay').classList.remove('show');
});
document.getElementById('practiceMissedBtn').addEventListener('click', ()=>{
  const missedSet = sigMissedCards.slice();
  document.getElementById('missedOverlay').classList.remove('show');
  sigBuildPracticeQuiz(missedSet);
});

sigBuildQuiz();

/* ============================================================
   TIMED CHALLENGE — every signal (ALL_CARDS.length), clock runs
   continuously.
   Right answer -> instant advance. Wrong answer -> flash red,
   reveal the correct meaning, then the card goes to the back of
   the queue so it comes back around later. Finishes when every
   signal has been answered correctly at least once.
   ============================================================ */
let timedDeck = [];
let timedAnswered = false;
let timedStarted = false;
let timedStartMs = 0;
let timedElapsedMs = 0;
let timedTickHandle = null;
let timedMistakes = 0;
let timedTotalAnswered = 0;
const BEST_TIME_KEY = 'bengalsTimedBestMs';

const timedStatsLine = document.getElementById('timedStatsLine');
const timedClockBig = document.getElementById('timedClockBig');
const timedImgWrap = document.getElementById('timedImgWrap');
const timedQImg = document.getElementById('timedQImg');
const timedChoices = document.getElementById('timedChoices');
const timedFeedback = document.getElementById('timedFeedback');
const timedDoneScreen = document.getElementById('timedDoneScreen');
const timedDoneText = document.getElementById('timedDoneText');
const timedStartOverlay = document.getElementById('timedStartOverlay');

function formatClock(ms){
  const totalTenths = Math.floor(ms/100);
  const tenths = totalTenths % 10;
  const totalSec = Math.floor(ms/1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec/60);
  return `${m}:${String(s).padStart(2,'0')}.${tenths}`;
}
function getBestTimeEver(){
  try {
    const v = localStorage.getItem(BEST_TIME_KEY);
    return v ? parseInt(v,10) : null;
  } catch(e) { return null; }
}
function maybeSaveBestTime(ms){
  try {
    const best = getBestTimeEver();
    if(best === null || ms < best) localStorage.setItem(BEST_TIME_KEY, String(ms));
  } catch(e) {}
}

function timedBuildQuiz(){
  clearInterval(timedTickHandle);
  timedDeck = shuffleArr(ALL_CARDS.slice());
  timedMistakes = 0;
  timedTotalAnswered = 0;
  timedElapsedMs = 0;
  timedStarted = false;
  timedDoneScreen.style.display = 'none';
  timedImgWrap.style.display = '';
  timedClockBig.style.display = '';
  timedStatsLine.style.display = '';
  timedChoices.style.display = 'none';
  timedChoices.innerHTML = '';
  timedFeedback.textContent = ''; timedFeedback.className = 'seq-feedback';
  timedStartOverlay.classList.add('show');
  document.getElementById('timedLbSaveForm').style.display = 'flex';
  document.getElementById('timedLbNameInput').value = '';
  // show the first card's photo right away, behind the "tap to start" overlay,
  // but don't wire answers or start the clock until the player taps it.
  const c = timedDeck[0];
  timedQImg.src = c.img;
  timedUpdateStats();
}
function timedStartRun(){
  if(timedStarted) return;
  timedStarted = true;
  timedStartOverlay.classList.remove('show');
  timedStartMs = Date.now();
  logQuizStart('timedStarts');
  timedTickHandle = setInterval(()=>{
    timedElapsedMs = Date.now() - timedStartMs;
    timedUpdateStats();
  }, 100);
  timedRenderQuestion();
}
function timedUpdateStats(){
  // Was hardcoded to 30 -- broke (could never show "31 of 31", and the
  // running "solved" count came out wrong) once the Split Formation signal
  // was added as card #31. Derive the total from ALL_CARDS itself so this
  // can't drift out of sync with the deck again.
  const total = ALL_CARDS.length;
  const remaining = timedDeck.length;
  const solved = total - remaining;
  timedClockBig.textContent = formatClock(timedElapsedMs);
  timedStatsLine.textContent = `Solved ${solved} of ${total}  •  ✗ ${timedMistakes}`;
}
function timedRenderQuestion(){
  if(timedDeck.length === 0){ timedFinishQuiz(); return; }
  timedChoices.style.display = 'grid';
  timedAnswered = false;
  const c = timedDeck[0];
  timedQImg.src = c.img;
  timedFeedback.textContent = ''; timedFeedback.className = 'seq-feedback';
  timedUpdateStats();

  const correctText = sigDisplayText(c);
  const seenTexts = new Set([correctText]);
  const distractors = [];
  shuffleArr(ALL_CARDS.slice()).forEach(x=>{
    if(distractors.length>=3) return;
    if(x.id===c.id) return;
    const t = sigDisplayText(x);
    if(seenTexts.has(t)) return;
    seenTexts.add(t);
    distractors.push(x);
  });
  const options = shuffleArr([c, ...distractors]);
  timedChoices.innerHTML = options.map(o=>`<button class="seq-choice" data-id="${o.id}">${sigDisplayText(o)}</button>`).join('');
  timedChoices.querySelectorAll('.seq-choice').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(timedAnswered) return;
      timedAnswered = true;
      timedTotalAnswered++;
      const correct = Number(btn.dataset.id) === c.id;
      recordSignalAttempt(c.id, correct);
      cloudPush('analytics/signalAttempts', Object.assign({ signalId: c.id, correct, date: new Date().toISOString() }, currentPlayerTag()));
      timedChoices.querySelectorAll('.seq-choice').forEach(b=>{
        b.disabled = true;
        if(Number(b.dataset.id)===c.id) b.classList.add('correct');
        else if(b===btn) b.classList.add('wrong');
      });
      if(correct){
        playSound(correctSound);
        timedDeck.shift();
        timedFeedback.textContent = '✓ Correct';
        timedFeedback.classList.add('good');
        setTimeout(timedRenderQuestion, 350);
      } else {
        playSound(wrongSound);
        timedMistakes++;
        timedStartMs -= 1000; // 1-second time penalty
        timedElapsedMs = Date.now() - timedStartMs;
        timedUpdateStats();
        timedDeck.push(timedDeck.shift());
        timedFeedback.textContent = '✗ It was — ' + correctText + '  (+1s penalty)';
        timedFeedback.classList.add('bad');
        setTimeout(timedRenderQuestion, 1000);
      }
    });
  });
}
function timedFinishQuiz(){
  clearInterval(timedTickHandle);
  timedImgWrap.style.display = 'none';
  timedChoices.style.display = 'none';
  timedClockBig.style.display = 'none';
  timedStatsLine.style.display = 'none';
  timedFeedback.textContent = '';
  timedDoneScreen.style.display = 'block';
  const finalMs = timedElapsedMs;
  const prevBest = getBestTimeEver();
  maybeSaveBestTime(finalMs);
  const isNewBest = prevBest === null || finalMs < prevBest;
  timedDoneText.textContent = `Final time: ${formatClock(finalMs)}  •  ${timedMistakes} mistake${timedMistakes===1?'':'s'}` +
    (isNewBest ? `  —  🏆 New best time on this device!` : `  •  Best on this device: ${formatClock(getBestTimeEver())}`);
  logHistory({ date: new Date().toISOString(), mode: 'timed', timeMs: finalMs, mistakes: timedMistakes });
  cloudPush('analytics/timedResults', Object.assign({ timeMs: finalMs, mistakes: timedMistakes, date: new Date().toISOString() }, currentPlayerTag()));
}
document.getElementById('timedRestartBtn').addEventListener('click', timedBuildQuiz);
timedStartOverlay.addEventListener('click', timedStartRun);

/* ============================================================
   ONBOARDING TIPS — shown once per device, reopenable via the
   help icon in the toolbar.
   ============================================================ */
const TIPS_SEEN_KEY = 'bengalsTipsSeen';
function maybeShowTips(){
  try {
    if(localStorage.getItem(TIPS_SEEN_KEY) !== '1'){
      document.getElementById('tipsOverlay').classList.add('show');
    }
  } catch(e) {}
}
document.getElementById('tipsGotItBtn').addEventListener('click', ()=>{
  document.getElementById('tipsOverlay').classList.remove('show');
  try { localStorage.setItem(TIPS_SEEN_KEY, '1'); } catch(e) {}
});
document.getElementById('helpBtn').addEventListener('click', ()=>{
  document.getElementById('tipsOverlay').classList.add('show');
});

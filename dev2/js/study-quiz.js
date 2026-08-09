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
function setMode(mode){
  modeTabsEl.querySelectorAll('.modeBtn').forEach(b=> b.classList.toggle('active', b.dataset.mode===mode));
  studyModeEl.classList.toggle('show', mode==='study');
  quizModeEl.classList.toggle('show', mode==='quiz');
  timedModeEl.classList.toggle('show', mode==='timed');
  playcallsModeEl.classList.toggle('show', mode==='playcalls');
  playcallsquizModeEl.classList.toggle('show', mode==='playcallsquiz');
  editPlaysModeEl.classList.toggle('show', mode==='editplays');
  if (mode !== 'playcalls' && mode !== 'editplays') {
    const gate = document.getElementById('playCallsGate');
    if (gate) gate.classList.remove('show');
  }
  if(mode==='timed' && typeof timedBuildQuiz === 'function') timedBuildQuiz();
  if(mode==='playcalls' && typeof initPlayCalls === 'function') initPlayCalls();
  if(mode==='editplays') openEditPlaysGated();
}
modeTabsEl.querySelectorAll('.modeBtn').forEach(btn=>{
  btn.addEventListener('click', ()=> setMode(btn.dataset.mode));
});

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

/* Fire-and-forget usage counters — logs every time someone actually starts
   a quiz (not just opens the tab), so the coach can see real usage instead
   of just who bothered to save a score. Doesn't block the UI either way. */
function logQuizStart(kind){
  cloudPush(`analytics/${kind}`, { date: new Date().toISOString() });
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

  const [timedStarts, standardStarts, standardResults, timedResults, signalAttempts, timedLbEntries] = await Promise.all([
    cloudFetch('analytics/timedStarts'),
    cloudFetch('analytics/standardStarts'),
    cloudFetch('analytics/standardResults'),
    cloudFetch('analytics/timedResults'),
    cloudFetch('analytics/signalAttempts'),
    cloudFetch('timedLeaderboard'),
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
    return `<div class="lbRow"><div class="lbRank" style="font-size:10px;width:auto;background:transparent;color:var(--muted)">${fmtWhen(p.lastSeen)}</div>
      <div class="lbName">${p.name}${tag}</div>
      <div class="lbScore" style="font-size:10px;">${best}</div></div>`;
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
        <button class="adminDashBtn" data-panel="players">👤 Registered Players<span class="adminDashCount">${playerRows.length}</span></button>
        <button class="adminDashBtn" data-panel="standard">📝 Standard Quiz</button>
        <button class="adminDashBtn" data-panel="timed">⏱️ Timed Quiz</button>
        <button class="adminDashBtn" data-panel="sessions">🕓 Recent Sessions${unsavedCount ? `<span class="adminDashCount">${unsavedCount} unsaved</span>` : ''}</button>
        <button class="adminDashBtn" data-panel="signals">🎯 Signal Stats</button>
      </div>
    </div>
    <button class="navBtn secondary adminBackBtn" id="adminBackBtn" style="display:none;">‹ Back to Dashboard</button>
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
    <div class="lbSub" style="opacity:.5;margin-top:14px;">build 2026-08-09 v4 (dashboard)</div>`;

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

async function renderLeaderboard(highlightEntry){
  const lbList = document.getElementById('lbList');
  lbList.innerHTML = '<div class="lbEmpty">Loading team scores…</div>';
  const cloudList = await cloudFetch('leaderboard');
  const offline = cloudList === null;
  const list = (offline ? getLeaderboard() : cloudList).slice();
  list.sort((a,b)=> b.score - a.score || (b.bestStreak||0) - (a.bestStreak||0) || new Date(a.date) - new Date(b.date));
  const trimmed = list.slice(0, LEADERBOARD_MAX);
  if(trimmed.length === 0){
    lbList.innerHTML = '<div class="lbEmpty">No scores yet — finish a quiz to be the first!</div>';
  } else {
    lbList.innerHTML = trimmed.map((e,i)=> lbRowHtml(e, i, highlightEntry, `${e.score}/${e.total}${e.bestStreak?` • 🔥${e.bestStreak}`:''}`)).join('');
  }
  if(offline){
    lbList.innerHTML += '<div class="lbOfflineNote">⚠️ Showing scores saved on this device only — could not reach the team server.</div>';
  }
}
async function renderTimedLeaderboard(highlightEntry){
  const timedLbList = document.getElementById('timedLbList');
  timedLbList.innerHTML = '<div class="lbEmpty">Loading team times…</div>';
  const cloudList = await cloudFetch('timedLeaderboard');
  const offline = cloudList === null;
  const list = (offline ? getTimedLeaderboard() : cloudList).slice();
  list.sort((a,b)=> a.timeMs - b.timeMs || a.mistakes - b.mistakes || new Date(a.date) - new Date(b.date));
  const trimmed = list.slice(0, TIMED_LEADERBOARD_MAX);
  if(trimmed.length === 0){
    timedLbList.innerHTML = '<div class="lbEmpty">No times yet — finish a Timed Quiz to be the first!</div>';
  } else {
    timedLbList.innerHTML = trimmed.map((e,i)=> lbRowHtml(e, i, highlightEntry, `${formatClock(e.timeMs)} • ✗${e.mistakes}`)).join('');
  }
  if(offline){
    timedLbList.innerHTML += '<div class="lbOfflineNote">⚠️ Showing times saved on this device only — could not reach the team server.</div>';
  }
}

const lbOverlay = document.getElementById('lbOverlay');
document.getElementById('openLeaderboardBtn').addEventListener('click', ()=>{
  lbOverlay.classList.add('show');
  document.querySelectorAll('.lbTabBtn').forEach(b => b.classList.toggle('active', b.dataset.lbtab === 'timed'));
  document.getElementById('timedLbList').style.display = '';
  document.getElementById('lbList').style.display = 'none';
  renderLeaderboard(null);
  renderTimedLeaderboard(null);
});
[...document.querySelectorAll('.lbTabBtn')].forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lbTabBtn').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('timedLbList').style.display = btn.dataset.lbtab === 'timed' ? '' : 'none';
    document.getElementById('lbList').style.display = btn.dataset.lbtab === 'quiz' ? '' : 'none';
  });
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
  renderTimedLeaderboard(null);
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
  renderLeaderboard(null);
  renderTimedLeaderboard(entry);
});

/* ============================================================
   SIGNAL QUIZ — multiple choice, 5 rounds of 6, 2x2 answers
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
  if(sigPracticeMode){
    sigStatsLine.textContent = `Practice ${sigIdx+1} of ${sigDeck.length}  •  Score ${sigScore}/${sigIdx}  •  🔥 Streak ${sigCurrentStreak}`;
  } else {
    sigStatsLine.textContent = `Round ${sigCurrentRound()} of ${SIG_TOTAL_ROUNDS}  •  Signal ${sigPosInRound()} of ${SIG_ROUND_SIZE}  •  Score ${sigScore}/${sigIdx}  •  🔥 Streak ${sigCurrentStreak}`;
  }

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
      cloudPush('analytics/signalAttempts', { signalId: c.id, correct, date: new Date().toISOString() });
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
    cloudPush('analytics/standardResults', { score: sigScore, total: sigDeck.length, mistakes: sigDeck.length-sigScore, bestStreak: sigBestStreakThisRun, date: new Date().toISOString() });
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
   TIMED CHALLENGE — all 30 signals, clock runs continuously.
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
  const remaining = timedDeck.length;
  const solved = 30 - remaining;
  timedClockBig.textContent = formatClock(timedElapsedMs);
  timedStatsLine.textContent = `Solved ${solved} of 30  •  ✗ ${timedMistakes}`;
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
      cloudPush('analytics/signalAttempts', { signalId: c.id, correct, date: new Date().toISOString() });
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
  cloudPush('analytics/timedResults', { timeMs: finalMs, mistakes: timedMistakes, date: new Date().toISOString() });
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

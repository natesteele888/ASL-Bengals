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
  if(mode==='coachtools' && typeof window.initCoachToolsNav === 'function') window.initCoachToolsNav();
  if(mode==='schedule' && typeof window.initScheduleNav === 'function') window.initScheduleNav();
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

// Nathan (original): "have all these things be visible only on the coaching
// login FrontSeat on not on the kids side until we add it over" -- This
// Week and Schedule started coach-only while unfinished. Nathan later asked
// specifically: "Schedule is added to player visibility automatically when
// they exist on the schedule" -- so Schedule is now visible to every signed
// in user (players included); This Week and Coach Tools stay behind their
// original gates (isCoachSession / isApprovedCoachProfile respectively).
// Called once a name/session is actually known (see player-identity.js's
// gate() wrapper) and re-run any time it might change (sign out, switch
// profile). If someone's viewing a tab that this determines they no longer
// qualify for, it bounces them back to Play rather than leaving a gated
// page open under a session that shouldn't see it.
// Nathan: "I need a way for parents to utilize the app too... not sure
// they need visibility to the stats or play calls and all. Just want
// them to log in, see how their child is doing, see the schedule." A
// parent (window.isParentSession, set at role-pick time in auth.js) gets
// Schedule as their entire app -- Play (Study/Quiz/Play Calls/Play Quiz)
// hides alongside This Week and Coach Tools, which were already
// coach-only. Their one extra bit of visibility -- their own child's
// player card -- lives in the toolbar's child pill (#childPillsWrap, see
// player-identity.js's renderChildToolbarPills), not in this nav.
window.refreshCoachToolsVisibility = function(){
  const isCoach = !!window.isCoachSession;
  const isParent = !!window.isParentSession;
  const approvedCoach = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;

  // Nathan: "make sure the players can see the This Week info on their
  // end as well - even if it's just the AI write up." This tab used to be
  // isCoach-only, which also hid it from players (players aren't
  // isCoachSession -- that's only true for a coach-code login). Open it
  // to anyone who isn't a parent: thisweek.js itself already renders the
  // Week Ahead write-up (and read-only 3 Keys/plays) for anyone once the
  // tab is reachable -- only the coach-editing inputs inside stay gated
  // by isApprovedCoachProfile(). Parents deliberately keep Schedule as
  // their whole app (see the comment above this function) so they're
  // still excluded here.
  const isPlayerOrCoach = window.userRole !== 'parent';
  const thisweekBtn = document.getElementById('thisweekSectionBtn');
  if (thisweekBtn) thisweekBtn.style.display = isPlayerOrCoach ? '' : 'none';
  const scheduleBtn = document.getElementById('scheduleSectionBtn');
  if (scheduleBtn) scheduleBtn.style.display = ''; // visible to everyone
  const thisweekMenuBtn = document.getElementById('thisweekMenuBtn');
  if (thisweekMenuBtn) thisweekMenuBtn.style.display = isPlayerOrCoach ? '' : 'none';

  const coachToolsBtn = document.getElementById('coachToolsSectionBtn');
  if (coachToolsBtn) coachToolsBtn.style.display = approvedCoach ? '' : 'none';

  // Nathan: "make sure kids can't edit the plays or rename them." Same
  // approvedCoach check as everything else here -- see the comment in
  // auth.js's applyRole() and openEditPlaysGated() above for why this
  // moved off the broader isCoachSession check.
  const editPlaysBtn = document.getElementById('editPlaysTabBtn');
  if (editPlaysBtn) editPlaysBtn.style.display = approvedCoach ? '' : 'none';

  const playBtn = document.getElementById('playSectionBtn');
  if (playBtn) playBtn.style.display = isParent ? 'none' : '';

  // Study/Quiz/Play Calls have nothing to do with a parent account -- swap
  // the leaderboard and My Stats/My Position for a My Child shortcut
  // instead (player-identity.js wires myChildBtn's click).
  const leaderboardBtn = document.getElementById('openLeaderboardBtn');
  if (leaderboardBtn) leaderboardBtn.style.display = isParent ? 'none' : '';
  const myStatsBtn = document.getElementById('myStatsBtn');
  if (myStatsBtn) myStatsBtn.style.display = isParent ? 'none' : '';
  const myPositionBtn = document.getElementById('myPositionBtn');
  if (myPositionBtn) myPositionBtn.style.display = isParent ? 'none' : '';
  // Nathan: "By clicking it up a menu dropdown with card and progress" --
  // My Card, same audience as My Stats (a parent already has My Child for
  // that). Only enforced one-directionally here (never force-shown) --
  // player-identity.js's updateBadge() is the one that decides whether to
  // actually show it (only once a roster match is confirmed), and can run
  // either before or after this depending on whether the roster was
  // already cached; unconditionally setting '' here would re-show it for
  // every non-parent regardless of match and stomp on that decision.
  const myCardBtn = document.getElementById('myCardBtn');
  if (myCardBtn && isParent) myCardBtn.style.display = 'none';
  // Coaches are often parents of a player on the team too (Nathan: "give
  // the coaches the option to choose their player as well") -- so My Child
  // shows for coach sessions as well, alongside all their normal coach
  // nav (unlike a parent, nothing else is hidden for a coach).
  const myChildBtn = document.getElementById('myChildBtn');
  if (myChildBtn) myChildBtn.style.display = (isParent || isCoach) ? '' : 'none';
  // Nathan: "there should be a 2nd pill next to your own pill for the
  // player" -- coach/parent-only, same audience as myChildBtn above.
  // Cleared (not just hidden) on Switch Profile into a plain player session
  // so a previous coach/parent's child pill(s) on this device can't linger.
  const childPillsWrap = document.getElementById('childPillsWrap');
  if (childPillsWrap && !isParent && !isCoach) childPillsWrap.innerHTML = '';

  const activeBtn = topSectionsEl && topSectionsEl.querySelector('.modeBtn.active');
  const activeSection = activeBtn && activeBtn.dataset.section;
  const stillAllowed =
    (activeSection === 'play' && !isParent) ||
    activeSection === 'schedule' ||
    (activeSection === 'thisweek' && isCoach) ||
    (activeSection === 'coachtools' && approvedCoach);
  if (isParent) {
    // Schedule is the only thing a parent can ever land on -- send them
    // there straight away instead of the Play tab everyone else defaults to.
    setSection('schedule');
  } else if (activeSection && !stillAllowed) {
    setSection('play');
  }
};

let editPlaysUnlocked = false;
let editPlaysInitialized = false;
function openEditPlaysGated(){
  // Nathan: "make sure kids can't edit the plays or rename them." This
  // used to bypass straight past the password gate for anyone with
  // isCoachSession -- true for ANYONE who typed the shared team "coach"
  // code, not just the 5 named coaches (window.isApprovedCoachProfile()),
  // unlike every other coach-only feature in this app (Roster, Schedule,
  // Practices, Drone Footage, Coach Tools all already use the stricter
  // named check). Tightened to match.
  const approvedCoach = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
  if (editPlaysUnlocked || approvedCoach) {
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
   COACH DASHBOARD SHORTCUT -- Nathan: "I think we could move everything
   from the 5 button tap coach stats to a dashboard in Coach Tools." The
   full Coach Stats view now lives in js/coachtools-dashboard.js as a real
   Coach Tools tab (window.initCoachToolsDashboard) -- Coach Tools is
   already hidden from everyone but an approved coach, so the old PIN gate
   here was a redundant second lock and was dropped. The 5-tap gesture on
   the header logo is kept as a muscle-memory shortcut, but now just jumps
   straight to that tab instead of opening its own overlay.
   ============================================================ */
let _logoTapCount = 0;
let _logoTapTimer = null;
document.getElementById('headerLogo').addEventListener('click', ()=>{
  _logoTapCount++;
  clearTimeout(_logoTapTimer);
  _logoTapTimer = setTimeout(()=>{ _logoTapCount = 0; }, 3000);
  if(_logoTapCount >= 5){
    _logoTapCount = 0;
    clearTimeout(_logoTapTimer);
    if(window.openCoachToolsTab) window.openCoachToolsTab('dashboard');
  }
});

function getLeaderboard(){
  try { const raw = localStorage.getItem(LEADERBOARD_KEY); return raw ? JSON.parse(raw) : []; } catch(e) { return []; }
}
function saveLeaderboardLocal(entry){
  const list = getLeaderboard();
  list.push(entry);
  list.sort((a,b)=> coachSortWeight(a) - coachSortWeight(b) || b.score - a.score || (b.bestStreak||0) - (a.bestStreak||0) || new Date(a.date) - new Date(b.date));
  try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list.slice(0, LEADERBOARD_MAX))); } catch(e) {}
}
function getTimedLeaderboard(){
  try { const raw = localStorage.getItem(TIMED_LEADERBOARD_KEY); return raw ? JSON.parse(raw) : []; } catch(e) { return []; }
}
function saveTimedLeaderboardLocal(entry){
  const list = getTimedLeaderboard();
  list.push(entry);
  list.sort((a,b)=> coachSortWeight(a) - coachSortWeight(b) || a.timeMs - b.timeMs || a.mistakes - b.mistakes || new Date(a.date) - new Date(b.date));
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
// Nathan: "coaches can do the quizzes, don't let them have the top spots --
// put coaching scores at the bottom of the list." Leaderboard entries are
// just a freely-typed name (no real identity link on the Quiz/Timed
// boards), so this matches against the same COACH_PROFILE_NAMES allowlist
// auth.js already uses for isApprovedCoachProfile -- if someone typed a
// known coach name to save their score, they're a coach for ranking
// purposes. Used as the primary sort key everywhere leaderboards are
// ordered, so coach entries always sink below every player regardless of
// score, and only sort against each other by the normal score-based rule.
function isCoachEntryName(name){
  const n = normName(name);
  return !!(n && window.COACH_PROFILE_NAMES && window.COACH_PROFILE_NAMES.indexOf(n) !== -1);
}
function coachSortWeight(entry){ return isCoachEntryName(entry.name) ? 1 : 0; }
// Nathan (follow-up to the sink-to-bottom request above): "coaches
// shouldn't be awarded points with the kids -- they can be completely
// separate." Sorting coaches to the bottom of one shared list still let a
// coach occupy a real ranked slot (and, on the Overall board, still earn
// rank-based points) whenever the team + coach count together was small
// enough to land inside the top 20. This splits a sorted/deduped list into
// two fully independent groups instead -- players ranked only against
// players, coaches ranked only against other coaches, starting back at #1
// in their own section, never sharing a rank or a points pool.
function splitByCoach(sortedList){
  const players = [];
  const coaches = [];
  sortedList.forEach(e => (isCoachEntryName(e.name) ? coaches : players).push(e));
  return { players, coaches };
}
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

// Nathan: "if someone gets 100% or other % on the quiz multiple times, show
// x2 or however many times they get it." The leaderboard itself only ever
// shows one row per person (their best run), so the repeat count comes
// from a separate source: analytics/standardResults logs EVERY completed
// run automatically (score/total/name, no manual "save" step needed --
// see currentPlayerTag/logQuizStart-style writes elsewhere in this file),
// so it's a true count of how many times that exact score was hit, not
// just how many times they bothered to resave to the public board.
function countTimesAchieved(history, name, matches){
  const key = normName(name);
  return history.filter(r => normName(r.name) === key && matches(r)).length;
}
async function fetchQuizLeaderboardData(){
  const [cloudList, historyRaw] = await Promise.all([cloudFetch('leaderboard'), cloudFetch('analytics/standardResults')]);
  const offline = cloudList === null;
  const raw = (offline ? getLeaderboard() : cloudList).slice();
  const deduped = dedupeBestByName(raw, quizIsBetter);
  const history = historyRaw || [];
  deduped.forEach(e => { e.timesAchieved = countTimesAchieved(history, e.name, r => r.score === e.score && r.total === e.total); });
  deduped.sort((a,b)=> b.score - a.score || (b.bestStreak||0) - (a.bestStreak||0) || new Date(a.date) - new Date(b.date));
  const { players, coaches } = splitByCoach(deduped);
  return { list: players.slice(0, LEADERBOARD_MAX), players: players.slice(0, LEADERBOARD_MAX), coaches: coaches.slice(0, LEADERBOARD_MAX), offline: offline };
}
async function fetchTimedLeaderboardData(){
  const cloudList = await cloudFetch('timedLeaderboard');
  const offline = cloudList === null;
  const raw = (offline ? getTimedLeaderboard() : cloudList).slice();
  const deduped = dedupeBestByName(raw, timedIsBetter);
  deduped.sort((a,b)=> a.timeMs - b.timeMs || a.mistakes - b.mistakes || new Date(a.date) - new Date(b.date));
  const { players, coaches } = splitByCoach(deduped);
  return { list: players.slice(0, TIMED_LEADERBOARD_MAX), players: players.slice(0, TIMED_LEADERBOARD_MAX), coaches: coaches.slice(0, TIMED_LEADERBOARD_MAX), offline: offline };
}
// Play Calls Quiz doesn't need its own manual "save to leaderboard" step or
// storage path -- every signed-in player's best run is already tracked on
// their player record (pcqBestScore), so this just reads that straight
// from PlayerIdentity instead of duplicating the data.
async function fetchPCQLeaderboardData(){
  if(!window.PlayerIdentity) return { list: [], players: [], coaches: [], offline: true };
  const [players, historyRaw] = await Promise.all([window.PlayerIdentity.fetchAllPlayers(), cloudFetch('analytics/pcqResults')]);
  const raw = Object.values(players)
    .filter(p => p.pcqBestScore)
    .map(p => ({ name: p.name, score: p.pcqBestScore, maxScore: p.pcqBestMaxScore }));
  const deduped = dedupeBestByName(raw, (a, b) => a.score > b.score);
  const history = historyRaw || [];
  deduped.forEach(e => { e.timesAchieved = countTimesAchieved(history, e.name, r => r.score === e.score && r.maxScore === e.maxScore); });
  deduped.sort((a,b)=> b.score - a.score);
  const split = splitByCoach(deduped);
  return { list: split.players.slice(0, LEADERBOARD_MAX), players: split.players.slice(0, LEADERBOARD_MAX), coaches: split.coaches.slice(0, LEADERBOARD_MAX), offline: false };
}

// Nathan: "send out push notifications to congratulate kids for... getting
// ranked... need more gamification." Fires when a freshly-saved score/time
// lands in the top 3 of its board (a medal position) -- the moment worth
// celebrating, rather than pinging on every single save. Skips coach
// entries entirely (isCoachEntryName), matching how coaches are kept out of
// the kids' points pool everywhere else on the leaderboards now. `data` is
// whatever a fetch*LeaderboardData() call just returned (already split into
// players/coaches).
async function notifyIfRanked(name, boardLabel, data){
  if(!name || isCoachEntryName(name)) return;
  if(!('Notification' in window) || Notification.permission !== 'granted' || !window.showLocalNotification) return;
  const { rank } = findEntryAndRank(data.players, name);
  if(rank && rank <= 3){
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
    window.showLocalNotification(
      `${medal} You're Ranked #${rank}!`,
      `${name}, you're #${rank} on the ${boardLabel} board -- nice work!`,
      { tag: `aslBengalsRank${boardLabel.replace(/\s+/g,'')}` }
    );
  }
}
// Nathan: "coaches shouldn't be awarded points with the kids -- they can be
// completely separate." Renders the coach group (if any coach has a saved
// score) as its own section below the player board -- its own header, its
// own #1/#2/#3 medals starting fresh, never touching the player ranks or
// counting toward anything above it.
function coachSectionHtml(coaches, scoreFn){
  if(!coaches.length) return '';
  return '<div class="lbSectionHeader" style="margin-top:14px;">🔐 Coaches</div>' +
    coaches.map((e,i)=> lbRowHtml(e, i, null, scoreFn(e))).join('');
}
async function renderLeaderboard(highlightEntry){
  const lbList = document.getElementById('lbList');
  lbList.innerHTML = '<div class="lbEmpty">Loading team scores…</div>';
  const { players, coaches, offline } = await fetchQuizLeaderboardData();
  const scoreFn = e => `${e.score}/${e.total}${e.timesAchieved>1?` ×${e.timesAchieved}`:''}${e.bestStreak?` • 🔥${e.bestStreak}`:''}`;
  lbList.innerHTML = players.length === 0
    ? '<div class="lbEmpty">No scores yet — finish a quiz to be the first!</div>'
    : players.map((e,i)=> lbRowHtml(e, i, highlightEntry, scoreFn(e))).join('');
  lbList.innerHTML += coachSectionHtml(coaches, scoreFn);
  if(offline){
    lbList.innerHTML += '<div class="lbOfflineNote">⚠️ Showing scores saved on this device only — could not reach the team server.</div>';
  }
}
async function renderTimedLeaderboard(highlightEntry){
  const timedLbList = document.getElementById('timedLbList');
  timedLbList.innerHTML = '<div class="lbEmpty">Loading team times…</div>';
  const { players, coaches, offline } = await fetchTimedLeaderboardData();
  const scoreFn = e => `${formatClock(e.timeMs)} • ✗${e.mistakes}`;
  timedLbList.innerHTML = players.length === 0
    ? '<div class="lbEmpty">No times yet — finish a Timed Quiz to be the first!</div>'
    : players.map((e,i)=> lbRowHtml(e, i, highlightEntry, scoreFn(e))).join('');
  timedLbList.innerHTML += coachSectionHtml(coaches, scoreFn);
  if(offline){
    timedLbList.innerHTML += '<div class="lbOfflineNote">⚠️ Showing times saved on this device only — could not reach the team server.</div>';
  }
}
async function renderPCQLeaderboard(){
  const pcqLbList = document.getElementById('pcqLbList');
  pcqLbList.innerHTML = '<div class="lbEmpty">Loading team scores…</div>';
  const { players, coaches } = await fetchPCQLeaderboardData();
  const scoreFn = e => `${e.score}/${e.maxScore}${e.timesAchieved>1?` ×${e.timesAchieved}`:''}`;
  pcqLbList.innerHTML = players.length
    ? players.map((e,i)=> lbRowHtml(e, i, null, scoreFn(e))).join('')
    : '<div class="lbEmpty">No Play Calls Quiz scores yet — finish a run to be the first!</div>';
  pcqLbList.innerHTML += coachSectionHtml(coaches, scoreFn);
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
function combinePoints(...ptsMaps){
  const combined = {};
  ptsMaps.forEach(ptsMap => {
    Object.keys(ptsMap).forEach(key => {
      if(!combined[key]) combined[key] = { name: ptsMap[key].name, points: 0 };
      combined[key].points += ptsMap[key].points;
    });
  });
  return Object.values(combined).sort((a,b)=> b.points - a.points);
}
// Shared by both the Overall leaderboard tab and My Stats, so the two
// never disagree about what someone's overall rank/points actually are.
// Nathan: "coaches shouldn't be awarded points with the kids -- they can be
// completely separate." players/coaches each get rank-based points from
// their OWN group only (a coach's rank-based points come from ranking
// against other coaches on Timed/PCQ, never against the team) -- two
// entirely separate points pools, not one shared one with coaches just
// sorted to the bottom.
async function computeOverallStandings(){
  const [timedData, pcqData] = await Promise.all([fetchTimedLeaderboardData(), fetchPCQLeaderboardData()]);
  const players = combinePoints(pointsForRank(timedData.players), pointsForRank(pcqData.players));
  const coaches = combinePoints(pointsForRank(timedData.coaches), pointsForRank(pcqData.coaches));
  return { players, coaches };
}
async function renderOverallLeaderboard(){
  const overallLbList = document.getElementById('overallLbList');
  overallLbList.innerHTML = '<div class="lbEmpty">Loading overall standings…</div>';
  const { players, coaches } = await computeOverallStandings();
  const scoreFn = e => `${e.points} pt${e.points===1?'':'s'}`;
  overallLbList.innerHTML = players.length
    ? players.map((e,i)=> lbRowHtml(e, i, null, scoreFn(e))).join('')
    : '<div class="lbEmpty">No points yet — finish a Timed Quiz or Play Calls Quiz to get on the board!</div>';
  overallLbList.innerHTML += coachSectionHtml(coaches, scoreFn);
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
// Nathan: "coaches shouldn't be awarded points with the kids -- they can be
// completely separate." My Stats/child-progress ranks whoever's being
// looked up against their own group only -- a coach's own board (rank +
// total) never mixes with the player board's numbers, matching how the
// leaderboard tabs themselves now render two fully separate sections.
function groupFor(data, name){ return isCoachEntryName(name) ? data.coaches : data.players; }
window.showMyStats = async function showMyStats(){
  const session = window.PlayerIdentity ? window.PlayerIdentity.getSession() : null;
  const overlay = document.getElementById('myStatsOverlay');
  const body = document.getElementById('myStatsBody');
  if(!overlay || !body || !session) return;
  overlay.classList.add('show');
  body.innerHTML = '<div class="lbEmpty">Loading your stats…</div>';
  const [timedData, pcqData, quizData, overallData, ownRecord] = await Promise.all([
    fetchTimedLeaderboardData(), fetchPCQLeaderboardData(), fetchQuizLeaderboardData(), computeOverallStandings(),
    window.PlayerIdentity.getPlayerRecord(session.playerId),
  ]);
  const overallList = groupFor(overallData, session.name);
  const timedList = groupFor(timedData, session.name);
  const pcqList = groupFor(pcqData, session.name);
  const quizList = groupFor(quizData, session.name);
  const pcq = findEntryAndRank(pcqList, session.name);
  const timed = findEntryAndRank(timedList, session.name);
  const quiz = findEntryAndRank(quizList, session.name);
  const overall = findEntryAndRank(overallList, session.name);
  // Nathan: "need more gamification" -- surfaces the login streak
  // player-identity.js's touchLastSeen() already tracks, so it's visible
  // somewhere beyond just the milestone push notifications.
  const streak = (ownRecord && ownRecord.loginStreak) || 0;
  const streakHtml = streak > 1
    ? `<div class="lbSub" style="text-align:center;margin-bottom:8px;font-weight:700;">🔥 ${streak}-day login streak</div>`
    : '';
  body.innerHTML = streakHtml + '<div class="msStatList">' + [
    myStatRowHtml('🏆', 'Overall Points', overall.entry ? `${overall.entry.points} pts` : '0 pts', overall.rank, overallList.length, true),
    myStatRowHtml('⏱️', 'Timed Quiz', timed.entry ? formatClock(timed.entry.timeMs) : 'No time saved yet', timed.rank, timedList.length),
    myStatRowHtml('🧠', 'Play Calls Quiz', pcq.entry ? `${pcq.entry.score}/${pcq.entry.maxScore}` : 'No score yet', pcq.rank, pcqList.length),
    myStatRowHtml('📝', 'Quiz Scores', quiz.entry ? `${quiz.entry.score}/${quiz.entry.total}${quiz.entry.bestStreak ? ` 🔥${quiz.entry.bestStreak}` : ''}` : 'No score yet', quiz.rank, quizList.length),
  ].join('') + '</div>' +
  '<div class="lbSub" style="margin-top:4px;">Ranks are out of the top 20 saved on each board. Overall points come from your Timed Quiz and Play Calls Quiz ranks (Quiz Scores isn\'t point-scored -- most players clear it, so ranking it wouldn\'t mean much). Timed Quiz and Quiz Scores need a saved name matching yours to show up here.</div>';
};
document.getElementById('myStatsCloseBtn').addEventListener('click', () => {
  document.getElementById('myStatsOverlay').classList.remove('show');
});

function escStatsHtml(s){
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// Nathan: "would be great for parents to be able to see how their player
// is doing on the quizzes and maybe what play signals or play calls they
// need help with." Reuses the My Stats overlay markup (only otherwise
// opened by myStatsBtn, which is hidden for parents/only shows a coach's
// own stats) rather than adding new HTML, but shows a different, deeper
// picture than My Stats does -- specific misses, not just leaderboard
// rank -- since a parent isn't the player comparing themselves to
// teammates, they're trying to help their kid improve.
//
// Quiz results are tied to a *login* (dev2Players playerId), while a
// parent links a *roster* entry (teamRoster id) as their child -- there's
// no real foreign key between the two, so like the leaderboards elsewhere
// in this file, this matches on name (best-effort, same heuristic already
// used everywhere names are cross-referenced in this app). If the child
// has never signed in with their own name + code, there's simply no quiz
// data yet to show -- that's explained rather than showing an empty chart.
window.showChildQuizProgress = async function(childName, explicitPlayerId){
  const overlay = document.getElementById('myStatsOverlay');
  const body = document.getElementById('myStatsBody');
  if(!overlay || !body) return;
  overlay.classList.add('show');
  body.innerHTML = '<div class="lbEmpty">Loading…</div>';

  const allPlayers = window.PlayerIdentity ? await window.PlayerIdentity.fetchAllPlayers() : {};

  // Nathan: "As the admin, I need the ability to link those kids to the
  // profiles that already exist." explicitPlayerId comes from
  // roster.js's loginPlayerId (set in Coach Tools > Roster) -- a real
  // link, not a guess. Only fall back to matching by name (the old
  // heuristic, same one leaderboards already use) when nothing's been
  // explicitly linked yet.
  let rec = null;
  if(explicitPlayerId && allPlayers && allPlayers[explicitPlayerId]){
    rec = Object.assign({ id: explicitPlayerId }, allPlayers[explicitPlayerId]);
  } else {
    const target = normName(childName);
    const matches = Object.keys(allPlayers || {})
      .map(id => Object.assign({ id }, allPlayers[id]))
      .filter(p => !p.isCoach && normName(p.name) === target)
      .sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
    rec = matches[0];
  }

  if(!rec){
    const linkHint = window.isApprovedCoachProfile && window.isApprovedCoachProfile()
      ? ' If they log in under a different name than their roster name, link their login to this roster entry in Coach Tools > Roster.'
      : '';
    body.innerHTML = `<div class="lbSub" style="margin-bottom:6px;">${escStatsHtml(childName)}'s quiz activity</div>` +
      `<div class="lbEmpty">${escStatsHtml(childName)} hasn't signed in with their own name + code yet, so there's no quiz activity to show. Once they log in, their progress will show up here.${linkHint}</div>`;
    return;
  }

  // Nathan: "for kid's progress it should show what they are ranked per
  // points." Same rank lookup showMyStats does for the signed-in player's
  // own name, just run against the child's roster/login name instead --
  // reuses fetchTimedLeaderboardData/fetchPCQLeaderboardData/
  // fetchQuizLeaderboardData/computeOverallStandings so the numbers can
  // never drift from what the actual leaderboards show. Quiz Scores is
  // deliberately NOT point-scored (see computeOverallStandings/
  // pointsForRank) -- most engaged players clear 31/31, so ranking it
  // wouldn't mean anything and it's excluded from Overall Points on
  // purpose, not by oversight.
  const [pcqRoundAttempts, signalAttempts, timedData, pcqData, quizData, overallData] = await Promise.all([
    cloudFetch('analytics/pcqRoundAttempts'),
    cloudFetch('analytics/signalAttempts'),
    fetchTimedLeaderboardData(), fetchPCQLeaderboardData(), fetchQuizLeaderboardData(), computeOverallStandings(),
  ]);
  // A linked child is always a player, never a coach, but grouping through
  // groupFor() (same helper showMyStats uses) keeps this consistent rather
  // than assuming.
  const childPcq = findEntryAndRank(groupFor(pcqData, rec.name), rec.name);
  const childTimed = findEntryAndRank(groupFor(timedData, rec.name), rec.name);
  const childQuiz = findEntryAndRank(groupFor(quizData, rec.name), rec.name);
  const childOverall = findEntryAndRank(groupFor(overallData, rec.name), rec.name);

  // Weakest Play Calls Quiz play types -- same shape as weakestPlayFor()
  // in Coach Tools > Dashboard (js/coachtools-dashboard.js), just kept
  // local here since that one's scoped inside initCoachToolsDashboard().
  const roundsForPlayer = {};
  (pcqRoundAttempts || []).forEach(a => {
    if(a.playerId !== rec.id) return;
    const e = (roundsForPlayer[a.playKey] = roundsForPlayer[a.playKey] || { attempts: 0, misses: 0 });
    e.attempts++;
    if(!a.correct) e.misses++;
  });
  function playLabelLocal(key){
    const pt = (window.DATA && DATA.playTypes || []).find(p => p.key === key);
    return pt ? pt.label : key;
  }
  const weakPlays = Object.keys(roundsForPlayer)
    .map(k => Object.assign({ key: k }, roundsForPlayer[k]))
    .filter(c => c.attempts >= 2 && c.misses > 0)
    .map(c => Object.assign(c, { missRate: c.misses / c.attempts }))
    .sort((a, b) => b.missRate - a.missRate)
    .slice(0, 3);

  // Weakest hand signals (Study/Timed Quiz).
  const bySig = {};
  (signalAttempts || []).forEach(a => {
    if(a.playerId !== rec.id) return;
    const e = (bySig[a.signalId] = bySig[a.signalId] || { attempts: 0, misses: 0 });
    e.attempts++;
    if(!a.correct) e.misses++;
  });
  const weakSignals = Object.keys(bySig).map(id => {
    const s = bySig[id];
    const card = ALL_CARDS.find(c => c.id === Number(id));
    return card ? Object.assign({ card }, s, { missRate: s.misses / s.attempts }) : null;
  }).filter(r => r && r.attempts >= 2 && r.misses > 0)
    .sort((a, b) => b.missRate - a.missRate)
    .slice(0, 3);

  const pcqLine = rec.pcqBestScore
    ? `${rec.pcqBestScore}/${rec.pcqBestMaxScore || '?'} best${rec.pcqLastScore ? ` · last: ${rec.pcqLastScore}/${rec.pcqBestMaxScore || '?'}` : ''}`
    : 'No Play Calls Quiz score yet';

  const weakPlaysHtml = weakPlays.length
    ? weakPlays.map(c => `<div class="lbRow"><div class="lbName">${escStatsHtml(playLabelLocal(c.key))}</div><div class="lbScore">${c.misses}/${c.attempts} missed</div></div>`).join('')
    : '<div class="lbEmpty">Not enough Play Calls Quiz attempts yet to spot a pattern.</div>';

  const weakSignalsHtml = weakSignals.length
    ? weakSignals.map(r => `<div class="lbRow"><div class="lbName">${escStatsHtml(r.card.meaning)}</div><div class="lbScore">${r.misses}/${r.attempts} missed</div></div>`).join('')
    : '<div class="lbEmpty">Not enough Study/Timed Quiz attempts yet to spot a pattern.</div>';

  body.innerHTML = `
    <div class="lbSub" style="margin-bottom:6px;">${escStatsHtml(rec.name)}'s quiz activity</div>
    <div class="msStatList">
      ${myStatRowHtml('🏆', 'Overall Points', childOverall.entry ? `${childOverall.entry.points} pts` : '0 pts', childOverall.rank, groupFor(overallData, rec.name).length, true)}
      ${myStatRowHtml('⏱️', 'Timed Quiz', childTimed.entry ? formatClock(childTimed.entry.timeMs) : 'No time saved yet', childTimed.rank, groupFor(timedData, rec.name).length)}
      ${myStatRowHtml('🧠', 'Play Calls Quiz', pcqLine, childPcq.rank, groupFor(pcqData, rec.name).length)}
      ${myStatRowHtml('📝', 'Quiz Scores', childQuiz.entry ? `${childQuiz.entry.score}/${childQuiz.entry.total}${childQuiz.entry.bestStreak ? ` 🔥${childQuiz.entry.bestStreak}` : ''}` : 'No score yet', childQuiz.rank, groupFor(quizData, rec.name).length)}
    </div>
    <div class="lbSub" style="margin-top:4px;">Overall Points comes from Timed Quiz and Play Calls Quiz ranks only -- Quiz Scores isn't point-scored, since most players clear 31/31 and ranking it wouldn't mean much.</div>
    <div class="statsGroupHeading" style="margin-top:14px;">🎯 Could use extra reps on -- Play Calls</div>
    ${weakPlaysHtml}
    <div class="statsGroupHeading" style="margin-top:14px;">✋ Could use extra reps on -- Signals</div>
    ${weakSignalsHtml}
    <div class="lbSub" style="margin-top:10px;">Based on quiz attempts logged since they signed in with their own name + code.</div>`;
};

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
  fetchQuizLeaderboardData().then(data => notifyIfRanked(entry.name, 'Quiz Scores', data));
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
  fetchTimedLeaderboardData().then(data => notifyIfRanked(entry.name, 'Timed Quiz', data));
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

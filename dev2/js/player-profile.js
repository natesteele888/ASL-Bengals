// ---------------------------------------------------------------------------
// Player Profile -- Nathan: "With rosters we can also have player profiles
// just as the attached [ESPN player page] - season stats - career stats
// though it starts now - then recent games for passing and rushing or
// defense only depending on positioning."
//
// Opened from a roster chip (Coach Tools > Roster) or a leaderboard name
// (Coach Tools > Stats). Reads the same schedule.json game records the
// leaderboard does, via the shared window.computeGamePlayerStats aggregator
// (js/coachtools-stats.js) -- one source of truth, no separate copy of the
// math. "Career" = every game ever recorded; since the app has no season
// boundaries yet, career and season are the same total today by design
// (Nathan: "career stats though it starts now") -- they'll diverge
// naturally once a new season's games start getting added and old ones are
// distinguishable by year.
// ---------------------------------------------------------------------------
(function () {

  const SCHEDULE_URL = `${FIREBASE_DB_URL}/schedule.json`;

  const OFFENSE_CATS = [
    { key: 'passYds', label: 'Passing Yds' },
    { key: 'rushYds', label: 'Rushing Yds' },
    { key: 'recYds', label: 'Receiving Yds' },
    { key: 'koYds', label: 'Kickoff Yds' },
  ];
  const DEFENSE_CATS = [
    { key: 'tackles', label: 'Tackles' },
    { key: 'sacks', label: 'Sacks' },
    { key: 'int', label: 'Interceptions' },
    { key: 'pbu', label: 'Pass Breakups' },
  ];
  // Positions that lead with defensive categories on their own profile --
  // everyone still sees every category they have a nonzero number in, this
  // just decides display order.
  const DEFENSE_FIRST_POSITIONS = ['DL', 'LB', 'DB'];

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  function fmtDate(dateStr) {
    if (!dateStr) return 'TBD';
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function formatNum(n) {
    const v = Number(n) || 0;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  function loadGames() {
    return window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => Array.isArray(data) ? data.filter(g => g && g.id) : [])
      .catch(err => { console.error('Could not load schedule for player profile:', err); return []; });
  }

  function blankTotals() {
    return { rushYds: 0, passYds: 0, recYds: 0, koYds: 0, tackles: 0, sacks: 0, int: 0, pbu: 0, games: 0 };
  }

  function render(num, rosterEntry, games) {
    const body = document.getElementById('playerProfileBody');
    if (!body) return;

    const name = rosterEntry ? rosterEntry.name : '';
    const position = rosterEntry ? rosterEntry.position : '';

    const totals = blankTotals();
    const recentGames = [];
    games.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(g => {
      if (!g.statSheet) return;
      const perGame = window.computeGamePlayerStats(g.statSheet);
      const rec = perGame[num];
      if (!rec) return;
      const hasAny = OFFENSE_CATS.concat(DEFENSE_CATS).some(c => (rec[c.key] || 0) > 0);
      if (!hasAny) return;
      totals.games += 1;
      OFFENSE_CATS.concat(DEFENSE_CATS).forEach(c => { totals[c.key] += rec[c.key] || 0; });
      recentGames.push({ game: g, rec });
    });

    const catsOrder = DEFENSE_FIRST_POSITIONS.includes(position) ? DEFENSE_CATS.concat(OFFENSE_CATS) : OFFENSE_CATS.concat(DEFENSE_CATS);
    const activeCats = catsOrder.filter(c => (totals[c.key] || 0) > 0);

    body.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;margin-bottom:14px;';
    header.innerHTML = `
      <div style="width:56px;height:56px;border-radius:50%;background:var(--bengal-orange);color:#fff;font-weight:900;font-size:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;">#${escapeHtml(num)}</div>
      <div style="font-size:17px;font-weight:900;">${escapeHtml(name || 'Player #' + num)}</div>
      <div class="lbSub" style="margin:2px 0 0;">${position ? escapeHtml(position) : 'Position not set'}</div>`;
    body.appendChild(header);

    if (!activeCats.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = 'No stats recorded for this player yet.';
      body.appendChild(empty);
      return;
    }

    // ---- Season Stats (== Career Stats today; see file header) ----
    [['📅 Season Stats', totals], ['🏆 Career Stats', totals]].forEach(([title, data], idx) => {
      const heading = document.createElement('div');
      heading.className = 'statsGroupHeading';
      heading.textContent = title;
      if (idx === 1) {
        const note = document.createElement('span');
        note.className = 'lbSub';
        note.style.cssText = 'font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px;';
        note.textContent = '(tracking starts this season)';
        heading.appendChild(note);
      }
      body.appendChild(heading);
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:16px;';
      activeCats.forEach(c => {
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid #eee;border-radius:8px;padding:8px;text-align:center;';
        card.innerHTML = `<div style="font-size:18px;font-weight:900;color:var(--bengal-orange,#e0201a);">${formatNum(data[c.key])}</div><div style="font-size:10.5px;color:#666;font-weight:700;">${c.label}</div>`;
        grid.appendChild(card);
      });
      const gamesCard = document.createElement('div');
      gamesCard.style.cssText = 'border:1px solid #eee;border-radius:8px;padding:8px;text-align:center;';
      gamesCard.innerHTML = `<div style="font-size:18px;font-weight:900;">${data.games}</div><div style="font-size:10.5px;color:#666;font-weight:700;">Games</div>`;
      grid.appendChild(gamesCard);
      body.appendChild(grid);
    });

    // ---- Recent Games ----
    const rgHeading = document.createElement('div');
    rgHeading.className = 'statsGroupHeading';
    rgHeading.textContent = '🕓 Recent Games';
    body.appendChild(rgHeading);

    if (!recentGames.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = 'No games recorded yet.';
      body.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    recentGames.slice(0, 10).forEach(({ game: g, rec }) => {
      const row = document.createElement('div');
      row.style.cssText = 'border:1px solid #eee;border-radius:8px;padding:8px 10px;font-size:12px;';
      const lineParts = catsOrder.filter(c => (rec[c.key] || 0) > 0).map(c => `${formatNum(rec[c.key])} ${c.label}`);
      row.innerHTML = `<div style="display:flex;justify-content:space-between;font-weight:800;margin-bottom:2px;">
          <span>${g.homeAway === 'Away' ? '@' : 'vs'} ${escapeHtml(g.opponent || 'TBD')}</span>
          <span style="color:#666;font-weight:600;">${fmtDate(g.date)}</span>
        </div>
        <div style="color:#555;">${lineParts.join(' · ') || 'No categories recorded'}</div>`;
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  window.showPlayerProfile = function (num) {
    const overlay = document.getElementById('playerProfileOverlay');
    const body = document.getElementById('playerProfileBody');
    if (!overlay || !body) return;
    overlay.classList.add('show');
    body.innerHTML = '<div class="lbEmpty">Loading…</div>';

    const rosterReady = window.isTeamRosterLoaded && window.isTeamRosterLoaded()
      ? Promise.resolve()
      : (window.loadTeamRoster ? window.loadTeamRoster() : Promise.resolve());

    Promise.all([rosterReady, loadGames()]).then(([, games]) => {
      const roster = window.getTeamRosterCached ? window.getTeamRosterCached() : [];
      const rosterEntry = roster.find(p => String(p.num) === String(num));
      render(num, rosterEntry, games);
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('playerProfileCloseBtn');
    const overlay = document.getElementById('playerProfileOverlay');
    if (closeBtn && overlay) closeBtn.addEventListener('click', () => overlay.classList.remove('show'));
  });
  // DOMContentLoaded may already have fired by the time this classic script
  // runs (it's loaded dynamically after boot()) -- wire immediately too.
  (function wireNow() {
    const closeBtn = document.getElementById('playerProfileCloseBtn');
    const overlay = document.getElementById('playerProfileOverlay');
    if (closeBtn && overlay && !closeBtn.dataset.wired) {
      closeBtn.dataset.wired = '1';
      closeBtn.addEventListener('click', () => overlay.classList.remove('show'));
    }
  })();
})();

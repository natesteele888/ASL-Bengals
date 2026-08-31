// ---------------------------------------------------------------------------
// Coach Tools > Stats -- Nathan: "Stats on a game and schedule should be
// independent... Another section for Stats where we can see team leaders,
// game leaders, graphs for each player. Those stats are added to that team
// stat board once stats are added to a Game on schedule... theres at stats
// section where you can add stats to a game on the schedule. That stats
// feed the leaderboard automatically."
//
// Two sub-views (pill tabs at the top of this panel):
//   Enter Stats  -- pick a game from schedule.json (or quick-create one),
//                   edit its statSheet with the shared editor
//                   (js/game-stats-editor.js, roster auto-seeded from
//                   js/roster.js), Save writes straight back into that
//                   game's record in schedule.json. No separate "draft" or
//                   "assign to game" step anymore -- stats are entered
//                   directly against a real schedule game, which is what
//                   keeps this independent of the Schedule page itself
//                   (Schedule no longer renders any stats UI at all).
//   Leaderboard  -- read-only aggregate computed fresh from every game's
//                   statSheet on schedule.json: Team Leaders (season
//                   totals, top 3 per category), Game Leaders (top
//                   performer per category for one picked game), and a
//                   simple per-player bar graph across games. Nothing here
//                   is stored separately -- it's fully derived, so it can
//                   never drift from what's entered per game.
// ---------------------------------------------------------------------------
(function () {

  const SCHEDULE_URL = `${FIREBASE_DB_URL}/schedule.json`;

  const CATS = [
    { key: 'rushYds', label: 'Rushing Yards' },
    { key: 'passYds', label: 'Passing Yards' },
    { key: 'recYds', label: 'Receiving Yards' },
    { key: 'koYds', label: 'Kickoff Yards' },
    // Nathan: "touchdowns as their own flag" -- `td` is every TD a player
    // personally scored (rushing/receiving/kickoff-return/defensive
    // return); `passTd` is kept separate since a passing score credits the
    // QB, not the ball carrier, so lumping them together would double-count
    // a single play against two players' "touchdowns" totals.
    { key: 'td', label: 'Touchdowns' },
    { key: 'passTd', label: 'Passing Touchdowns' },
    { key: 'tackles', label: 'Tackles' },
    { key: 'sacks', label: 'Sacks' },
    { key: 'int', label: 'Interceptions' },
    { key: 'pbu', label: 'Pass Breakups' },
  ];

  let games = [];
  let loaded = false;
  let subTab = 'enter'; // 'enter' | 'leaderboard'
  let selectedGameId = null;
  let leaderboardGameId = null; // which game "Game Leaders" is showing
  let leaderboardPlayerNum = null; // which player the graph is showing

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  function genId() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---- Cloud load/save (own copy -- deliberately independent of
  // schedule.js's module state, per "stats and schedule should be
  // independent"; both simply read/write the same schedule.json record). ----
  function loadGames() {
    return window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        games = Array.isArray(data) ? data.filter(g => g && g.id) : [];
        loaded = true;
        return games;
      })
      .catch(err => {
        console.error('Could not load schedule for stats:', err);
        games = [];
        loaded = true;
        return games;
      });
  }

  function sortedGames() {
    return games.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  }

  // ---- Aggregation: raw statSheet -> per-player totals for one game ----
  function gamePlayerStats(statSheet) {
    const ss = window.normalizeGameStatSheet(statSheet);
    const byNum = {};
    function ensure(num, name) {
      if (!byNum[num]) byNum[num] = { num, name: name || '', rushYds: 0, passYds: 0, recYds: 0, koYds: 0, solo: 0, assist: 0, tackles: 0, int: 0, pbu: 0, sacks: 0, td: 0, passTd: 0 };
      if (name && !byNum[num].name) byNum[num].name = name;
      return byNum[num];
    }
    (ss.roster || []).forEach(p => ensure(p.num, p.name));
    const yardFields = { rushing: 'rushYds', passing: 'passYds', receiving: 'recYds', kickoffs: 'koYds' };
    Object.keys(yardFields).forEach(sectionKey => {
      (ss[sectionKey] || []).forEach(row => {
        const rec = ensure(row.num);
        let total = 0, tdCount = 0;
        (row.attempts || []).forEach(a => {
          if (sectionKey === 'passing' && !a.comp) return;
          total += Number(a.yds) || 0;
          if (a.td) tdCount++;
        });
        rec[yardFields[sectionKey]] += total;
        // A passing TD credits the QB under passTd, not td -- td is reserved
        // for whoever actually carried/caught/returned it into the end zone.
        if (sectionKey === 'passing') rec.passTd += tdCount;
        else rec.td += tdCount;
      });
    });
    (ss.tackles || []).forEach(row => {
      const rec = ensure(row.num);
      const solo = (row.marks || []).filter(m => m === 'solo').length;
      const assist = (row.marks || []).filter(m => m === 'assist').length;
      rec.solo += solo; rec.assist += assist; rec.tackles += solo + assist * 0.5;
    });
    (ss.defExtra || []).forEach(row => {
      const rec = ensure(row.num);
      rec.int += Number(row.int) || 0;
      rec.pbu += Number(row.pbu) || 0;
      rec.sacks += Number(row.sacks) || 0;
      if (row.td) rec.td += 1;
    });
    return byNum;
  }
  // Shared with js/player-profile.js so a player's profile page computes
  // per-game and season totals the exact same way the team leaderboard
  // does -- one aggregator, not two copies that could drift apart.
  window.computeGamePlayerStats = gamePlayerStats;

  function seasonAggregate() {
    const byNum = {};
    const playedGames = [];
    games.forEach(g => {
      if (!g.statSheet || !window.gameStatSheetHasAnything(window.normalizeGameStatSheet(g.statSheet))) return;
      playedGames.push(g);
      const perGame = gamePlayerStats(g.statSheet);
      Object.values(perGame).forEach(rec => {
        if (!byNum[rec.num]) byNum[rec.num] = { num: rec.num, name: rec.name, rushYds: 0, passYds: 0, recYds: 0, koYds: 0, tackles: 0, int: 0, pbu: 0, sacks: 0, td: 0, passTd: 0, games: 0 };
        const agg = byNum[rec.num];
        if (rec.name && !agg.name) agg.name = rec.name;
        CATS.forEach(c => { agg[c.key] += rec[c.key] || 0; });
        agg.games += 1;
      });
    });
    return { byNum, playedGames };
  }

  function playerLabel(rec) {
    return `#${escapeHtml(rec.num)}${rec.name ? ' ' + escapeHtml(rec.name) : ''}`;
  }

  // ---- Tendencies -- Nathan: "I want to see state with tendencies, where
  // do we run, who runs where, etc." Reads the `dir` tag captured on each
  // rushing attempt (js/game-stats-editor.js) straight off every game's
  // statSheet -- legacy attempts entered before direction-tagging existed
  // fall into "Middle" so old games still count toward the totals.
  const DIRS = window.runDirections || ['Left', 'Middle', 'Right'];
  function runTendencies() {
    const byDir = {}; DIRS.forEach(d => { byDir[d] = { att: 0, yds: 0 }; });
    const byPlayer = {};
    games.forEach(g => {
      if (!g.statSheet) return;
      const ss = window.normalizeGameStatSheet(g.statSheet);
      (ss.rushing || []).forEach(row => {
        const known = (ss.roster || []).find(p => String(p.num) === String(row.num));
        if (!byPlayer[row.num]) {
          byPlayer[row.num] = { num: row.num, name: known ? known.name : '', totalAtt: 0 };
          DIRS.forEach(d => { byPlayer[row.num][d] = { att: 0, yds: 0 }; });
        }
        if (known && known.name && !byPlayer[row.num].name) byPlayer[row.num].name = known.name;
        (row.attempts || []).forEach(a => {
          const dir = DIRS.includes(a.dir) ? a.dir : 'Middle';
          byDir[dir].att++; byDir[dir].yds += Number(a.yds) || 0;
          byPlayer[row.num][dir].att++; byPlayer[row.num][dir].yds += Number(a.yds) || 0;
          byPlayer[row.num].totalAtt++;
        });
      });
    });
    return { byDir, byPlayer };
  }

  function renderTendencies(wrap) {
    const { byDir, byPlayer } = runTendencies();
    const totalAtt = DIRS.reduce((s, d) => s + byDir[d].att, 0);
    if (!totalAtt) {
      wrap.appendChild(sectionHeading('🧭 Tendencies — Where We Run'));
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = 'No rushing attempts entered yet.';
      wrap.appendChild(empty);
      return;
    }

    wrap.appendChild(sectionHeading('🧭 Tendencies — Where We Run'));
    const dirBox = document.createElement('div');
    dirBox.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:18px;';
    DIRS.forEach(d => {
      const { att, yds } = byDir[d];
      const pct = totalAtt ? (att / totalAtt * 100) : 0;
      const ypc = att ? (yds / att).toFixed(1) : '0.0';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;';
      row.innerHTML = `<span style="width:56px;flex:0 0 auto;font-weight:800;">${d}</span>
        <span style="flex:1;background:#f0f0f0;border-radius:4px;overflow:hidden;height:18px;"><span style="display:block;height:100%;width:${pct.toFixed(0)}%;background:var(--bengal-orange,#e0201a);"></span></span>
        <span style="width:110px;flex:0 0 auto;text-align:right;color:#666;">${att} att · ${ypc} ypc</span>`;
      dirBox.appendChild(row);
    });
    wrap.appendChild(dirBox);

    wrap.appendChild(sectionHeading('🏃 Who Runs Where'));
    const players = Object.values(byPlayer).filter(p => p.totalAtt > 0).sort((a, b) => b.totalAtt - a.totalAtt).slice(0, 8);
    if (!players.length) {
      wrap.appendChild(document.createTextNode(''));
    }
    const whoBox = document.createElement('div');
    whoBox.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    players.forEach(p => {
      const row = document.createElement('div');
      row.style.cssText = 'font-size:12px;';
      const segs = DIRS.map(d => {
        const { att } = p[d];
        const pct = p.totalAtt ? (att / p.totalAtt * 100) : 0;
        const color = d === 'Left' ? '#c0342a' : d === 'Right' ? '#1c6fc0' : '#888';
        return att ? `<span title="${d}: ${att} att" style="display:inline-block;height:100%;width:${pct.toFixed(0)}%;background:${color};"></span>` : '';
      }).join('');
      row.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:2px;"><b>${playerLabel(p)}</b><span style="color:#666;">${p.totalAtt} att — L ${p.Left.att} · M ${p.Middle.att} · R ${p.Right.att}</span></div>
        <div style="background:#f0f0f0;border-radius:4px;overflow:hidden;height:10px;display:flex;">${segs}</div>`;
      whoBox.appendChild(row);
    });
    wrap.appendChild(whoBox);
  }

  // ---- Sub-nav ----
  function renderSubNav() {
    const nav = document.getElementById('coachStatsSubNav');
    if (!nav) return;
    nav.innerHTML = '';
    [['enter', '✏️ Enter Stats'], ['leaderboard', '🏆 Leaderboard'], ['tendencies', '🧭 Tendencies']].forEach(([key, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gameplanChip' + (subTab === key ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => { subTab = key; renderAll(); });
      nav.appendChild(btn);
    });
  }

  // ---- Enter Stats sub-view ----
  function renderEnterStats() {
    const wrap = document.getElementById('coachStatsBody');
    if (!wrap) return;
    wrap.innerHTML = '';

    const pickWrap = document.createElement('div');
    pickWrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;';
    const sel = document.createElement('select');
    sel.style.cssText = 'flex:1 1 220px;padding:9px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;';
    const blankOpt = document.createElement('option');
    blankOpt.value = ''; blankOpt.textContent = games.length ? 'Pick a game…' : 'No games on the schedule yet';
    sel.appendChild(blankOpt);
    sortedGames().forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = `${g.homeAway === 'Away' ? '@' : 'vs'} ${g.opponent || 'TBD'}${g.date ? ' — ' + g.date : ''}`;
      if (g.id === selectedGameId) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => { selectedGameId = sel.value || null; renderEnterStats(); });
    pickWrap.appendChild(sel);

    const newBtn = document.createElement('button');
    newBtn.type = 'button'; newBtn.className = 'lbLinkBtn'; newBtn.textContent = '+ New Game';
    newBtn.addEventListener('click', () => {
      const opponent = prompt('Opponent name for the new game?');
      if (!opponent || !opponent.trim()) return;
      const newGame = { id: genId(), opponent: opponent.trim(), date: '', arriveTime: '', warmupTime: '', gameTime: '', homeAway: 'Home', location: '', ourScore: '', oppScore: '', writeup: '', scouting: '', statSheet: window.blankGameStatSheet(), updatedAt: null };
      games.push(newGame);
      persistGames(() => { selectedGameId = newGame.id; renderEnterStats(); }, msg => setStatus(`Could not create game: ${msg}`));
    });
    pickWrap.appendChild(newBtn);
    wrap.appendChild(pickWrap);

    const game = games.find(g => g.id === selectedGameId);
    if (!game) {
      const hint = document.createElement('div');
      hint.className = 'lbEmpty';
      hint.textContent = 'Pick a game above to enter its stats.';
      wrap.appendChild(hint);
      return;
    }
    game.statSheet = window.normalizeGameStatSheet(game.statSheet);

    // Nathan: "I want to use the stats as they are written [in Stat Keeper]
    // to write into the player profiles and attached to the game." Reads a
    // Stat Keeper "Download Game Log" export (js/statkeeper-import.js does
    // the actual play-by-play -> statSheet translation) and REPLACES this
    // game's statSheet entirely (confirmed choice -- simpler and more
    // predictable than trying to merge with any manually-entered stats
    // already on this game). Drops the coach into the same editor below to
    // review/adjust before Save actually writes it -- import alone never
    // touches schedule.json.
    if (window.translateStatKeeperExport) {
      const importRow = document.createElement('div');
      importRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px;';
      const importBtn = document.createElement('button');
      importBtn.type = 'button'; importBtn.className = 'lbLinkBtn';
      importBtn.textContent = '⬆ Import from Stat Keeper';
      const fileInput = document.createElement('input');
      fileInput.type = 'file'; fileInput.accept = 'application/json,.json'; fileInput.style.display = 'none';
      importBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          let exportData;
          try { exportData = JSON.parse(reader.result); } catch (e) { alert('That file isn\'t valid JSON -- make sure it\'s a Stat Keeper "Download Game Log" export.'); return; }
          if (!exportData || !Array.isArray(exportData.plays)) { alert('That doesn\'t look like a Stat Keeper game log export (no plays[] found).'); return; }
          if (!window.getTeamRosterCached || !window.isTeamRosterLoaded || !window.isTeamRosterLoaded()) { alert('Team roster hasn\'t loaded yet -- wait a moment and try again.'); return; }
          const hasExisting = window.gameStatSheetHasAnything && window.gameStatSheetHasAnything(game.statSheet);
          if (hasExisting && !confirm('This game already has stats entered. Importing will REPLACE all of them with the Stat Keeper log. Continue?')) return;
          const result = window.translateStatKeeperExport(exportData, window.getTeamRosterCached());
          game.statSheet = result.statSheet;
          renderEnterStats();
          if (result.warnings.length) {
            setStatus('Imported with ' + result.warnings.length + ' warning' + (result.warnings.length === 1 ? '' : 's') + ' -- see below. Nothing is saved yet; review then hit Save.');
            alert('Imported, but a few things need a look:\n\n' + result.warnings.join('\n'));
          } else {
            setStatus('Imported from Stat Keeper. Nothing is saved yet -- review below, then hit Save.');
          }
        };
        reader.readAsText(file);
      });
      importRow.appendChild(importBtn);
      importRow.appendChild(fileInput);
      wrap.appendChild(importRow);
    }

    const editorWrap = document.createElement('div');
    editorWrap.id = 'coachStatsEditorWrap';
    wrap.appendChild(editorWrap);
    if (window.renderGameStatSheet) window.renderGameStatSheet(editorWrap, game.statSheet, false);

    const saveRow = document.createElement('div');
    saveRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:14px;';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button'; saveBtn.className = 'navBtn'; saveBtn.textContent = '💾 Save Stats';
    saveBtn.style.cssText = 'flex:0 0 auto;padding:9px 18px;';
    saveBtn.addEventListener('click', () => {
      saveBtn.disabled = true;
      const label = saveBtn.textContent;
      saveBtn.textContent = 'Saving…';
      persistGames(() => { saveBtn.textContent = '✅ Saved'; setTimeout(() => { saveBtn.textContent = label; saveBtn.disabled = false; }, 1600); },
        msg => { saveBtn.textContent = '⚠️ Failed'; setStatus(`Save failed: ${msg}`); setTimeout(() => { saveBtn.textContent = label; saveBtn.disabled = false; }, 2200); });
    });
    saveRow.appendChild(saveBtn);
    const status = document.createElement('span');
    status.id = 'coachStatsStatusMsg';
    status.className = 'lbSub';
    status.style.margin = '0';
    saveRow.appendChild(status);
    wrap.appendChild(saveRow);
  }

  function setStatus(text) {
    const el = document.getElementById('coachStatsStatusMsg');
    if (el) el.textContent = text || '';
  }

  function persistGames(afterOk, afterFail) {
    window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(games),
    })).then(r => {
      if (r.ok) { if (afterOk) afterOk(); }
      else if (afterFail) afterFail(`HTTP ${r.status}`);
    }).catch(err => {
      console.error('Stats save failed:', err);
      if (afterFail) afterFail(err.message);
    });
  }

  // ---- Leaderboard sub-view ----
  function renderLeaderboard() {
    const wrap = document.getElementById('coachStatsBody');
    if (!wrap) return;
    wrap.innerHTML = '';

    const { byNum, playedGames } = seasonAggregate();
    const players = Object.values(byNum);

    if (!players.length) {
      wrap.innerHTML = '<div class="lbEmpty">No stats entered for any game yet -- enter some under "Enter Stats" and the leaderboard fills in automatically.</div>';
      return;
    }

    // ---- Team Leaders ----
    wrap.appendChild(sectionHeading('🏆 Team Leaders (season)'));
    const leadersGrid = document.createElement('div');
    leadersGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:20px;';
    CATS.forEach(cat => {
      const top = players.filter(p => (p[cat.key] || 0) > 0).sort((a, b) => b[cat.key] - a[cat.key]).slice(0, 3);
      const card = document.createElement('div');
      card.style.cssText = 'border:2px solid #eee;border-radius:10px;padding:10px;';
      let rows = top.length
        ? top.map((p, i) => `<div class="lbLinkBtn" data-player-num="${escapeHtml(p.num)}" style="display:flex;justify-content:space-between;font-size:12.5px;padding:2px 0;text-decoration:none;color:inherit;cursor:pointer;">${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${playerLabel(p)}<b>${formatNum(p[cat.key])}</b></div>`).join('')
        : '<div class="lbEmpty" style="padding:2px 0;">None yet</div>';
      card.innerHTML = `<div style="font-weight:800;font-size:12px;color:var(--bengal-orange,#e0201a);margin-bottom:6px;">${cat.label}</div>${rows}`;
      leadersGrid.appendChild(card);
    });
    leadersGrid.addEventListener('click', (e) => {
      const target = e.target.closest('[data-player-num]');
      if (target && window.showPlayerProfile) window.showPlayerProfile(target.dataset.playerNum);
    });
    wrap.appendChild(leadersGrid);

    // ---- Game Leaders ----
    wrap.appendChild(sectionHeading('🏅 Game Leaders'));
    const gameSel = document.createElement('select');
    gameSel.style.cssText = 'width:100%;padding:9px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:10px;';
    playedGames.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = `${g.homeAway === 'Away' ? '@' : 'vs'} ${g.opponent || 'TBD'}${g.date ? ' — ' + g.date : ''}`;
      if (!leaderboardGameId) leaderboardGameId = g.id;
      if (g.id === leaderboardGameId) opt.selected = true;
      gameSel.appendChild(opt);
    });
    gameSel.addEventListener('change', () => { leaderboardGameId = gameSel.value; renderLeaderboard(); });
    wrap.appendChild(gameSel);

    const gameLeadersBox = document.createElement('div');
    const theGame = playedGames.find(g => g.id === leaderboardGameId);
    if (theGame) {
      const perGame = Object.values(gamePlayerStats(theGame.statSheet));
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;';
      CATS.forEach(cat => {
        const top = perGame.filter(p => (p[cat.key] || 0) > 0).sort((a, b) => b[cat.key] - a[cat.key])[0];
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid #eee;border-radius:8px;padding:8px;font-size:12px;';
        card.innerHTML = top
          ? `<div style="font-weight:700;color:#666;">${cat.label}</div><div>${playerLabel(top)} — <b>${formatNum(top[cat.key])}</b></div>`
          : `<div style="font-weight:700;color:#666;">${cat.label}</div><div class="lbEmpty" style="padding:0;">None</div>`;
        grid.appendChild(card);
      });
      gameLeadersBox.appendChild(grid);
    } else {
      gameLeadersBox.innerHTML = '<div class="lbEmpty">No games with stats yet.</div>';
    }
    wrap.appendChild(gameLeadersBox);

    // ---- Player Graph ----
    wrap.appendChild(sectionHeading('📈 Player Trend'));
    const playerSel = document.createElement('select');
    playerSel.style.cssText = 'width:100%;padding:9px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:10px;';
    players.sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0)).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.num;
      opt.textContent = playerLabel(p).replace(/<[^>]+>/g, '');
      if (!leaderboardPlayerNum) leaderboardPlayerNum = p.num;
      if (p.num === leaderboardPlayerNum) opt.selected = true;
      playerSel.appendChild(opt);
    });
    playerSel.addEventListener('change', () => { leaderboardPlayerNum = playerSel.value; renderLeaderboard(); });
    wrap.appendChild(playerSel);

    const catSel = document.createElement('select');
    catSel.style.cssText = 'width:100%;padding:9px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:10px;';
    CATS.forEach(c => {
      const opt = document.createElement('option'); opt.value = c.key; opt.textContent = c.label;
      if (c.key === (window.__coachStatsGraphCat || 'rushYds')) opt.selected = true;
      catSel.appendChild(opt);
    });
    catSel.addEventListener('change', () => { window.__coachStatsGraphCat = catSel.value; renderLeaderboard(); });
    wrap.appendChild(catSel);

    const graphCat = window.__coachStatsGraphCat || 'rushYds';
    const perGameVals = playedGames.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(g => {
      const perGame = gamePlayerStats(g.statSheet);
      const rec = perGame[leaderboardPlayerNum];
      return { opponent: g.opponent || 'TBD', date: g.date, val: rec ? (rec[graphCat] || 0) : 0 };
    });
    const maxVal = Math.max(1, ...perGameVals.map(v => v.val));
    const graphBox = document.createElement('div');
    graphBox.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    perGameVals.forEach(v => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:11.5px;';
      row.innerHTML = `<span style="width:110px;flex:0 0 auto;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(v.opponent)}</span>
        <span style="flex:1;background:#f0f0f0;border-radius:4px;overflow:hidden;height:16px;"><span style="display:block;height:100%;width:${(v.val / maxVal * 100).toFixed(0)}%;background:var(--bengal-orange,#e0201a);"></span></span>
        <b style="width:40px;text-align:right;">${formatNum(v.val)}</b>`;
      graphBox.appendChild(row);
    });
    if (!perGameVals.length) graphBox.innerHTML = '<div class="lbEmpty">No games with stats yet.</div>';
    wrap.appendChild(graphBox);
  }

  function formatNum(n) {
    const v = Number(n) || 0;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
  function sectionHeading(text) {
    const h = document.createElement('div');
    h.className = 'statsGroupHeading';
    h.textContent = text;
    return h;
  }

  function renderAll() {
    renderSubNav();
    if (subTab === 'leaderboard') renderLeaderboard();
    else if (subTab === 'tendencies') { const wrap = document.getElementById('coachStatsBody'); if (wrap) { wrap.innerHTML = ''; renderTendencies(wrap); } }
    else renderEnterStats();
  }

  window.initCoachToolsStats = function () {
    if (window.loadTeamRoster && !window.isTeamRosterLoaded()) window.loadTeamRoster();
    if (!loaded) {
      const wrap = document.getElementById('coachStatsBody');
      if (wrap) wrap.innerHTML = '<div class="lbSub" style="text-align:center;">Loading…</div>';
      loadGames().then(renderAll);
    } else {
      loadGames().then(renderAll); // cheap re-fetch so stats entered elsewhere show up
    }
  };
})();

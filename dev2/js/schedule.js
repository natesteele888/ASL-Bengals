// ---------------------------------------------------------------------------
// Schedule -- Nathan: "there was a schedule button that shows an interactive
// schedule for the year. All games listed with home or away, time and
// location in a whiteboard style display. After game results are added it
// shows a W in green or L in red to show the result. It should show score
// and have a button to show a write up for the game."
//
// Visible to everyone (a top-level section, same tier as This Week) -- only
// the add/edit/delete controls are gated to an approved coach profile
// (window.isApprovedCoachProfile(), auth.js). Games are entered by coaches
// through this page itself, same self-serve pattern as This Week and Drive
// Builder, rather than needing the season schedule handed over to be
// hardcoded. (Note: This Week and Schedule are both currently hidden from
// player logins entirely per a later request -- see refreshCoachToolsVisibility
// in study-quiz.js -- so "everyone" below means everyone who can currently
// reach this tab, i.e. any coach login, not just the named allowlist.)
//
// Nathan: "We could also incorporate another section for the coming week
// where coaches can call out... highlight any known tendencies or good
// players on the upcoming opponent." Rather than a separate section that
// has to track which game is "this week" on its own, that scouting info
// lives right on the relevant game here -- a "Scouting Report" free-text
// field, pre-game (shown above Stats/Write-Up, which are post-game), same
// edit gate as the rest of a game's details.
//
// STATS -- rebuilt twice this session before landing here:
//   v1: one row per player with fixed columns (runs/yards/passes/etc).
//   v2: split into Offense / Defense box-score tables, richer categories.
//   v3 -- Nathan: "What you created with big columns doesn't work - it will
//   be updated as the game goes on..." (full quote lives in
//   game-stats-editor.js now). Roster + per-category attempt grids.
//
// The actual stat-sheet editor (Roster, attempt grids, Tackles, Defensive
// Extra, Turnovers) was extracted into js/game-stats-editor.js so Coach
// Tools can run the identical UI on a standalone "draft" stat sheet that
// isn't attached to a Schedule game yet (Nathan: "Print and input the stats
// for to then assign to a game"). This file just owns the per-game record
// (statSheet field) and calls window.renderGameStatSheet(wrap, statSheet,
// readOnly) to draw it -- see renderStatSheet() below.
// ---------------------------------------------------------------------------
(function () {

  const SCHEDULE_URL = `${FIREBASE_DB_URL}/schedule.json`;
  const blankStatSheet = () => window.blankGameStatSheet();
  const normalizeStatSheet = (s) => window.normalizeGameStatSheet(s);

  let games = [];     // [{id, opponent, date, time, homeAway, location, ourScore, oppScore, writeup, scouting, statSheet, updatedAt}]
  let current = null; // game open in the detail view, or null (list view)
  let loaded = false;

  function genId() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function resultFor(g) {
    if (g.ourScore === null || g.ourScore === undefined || g.oppScore === null || g.oppScore === undefined || g.ourScore === '' || g.oppScore === '') return null;
    const us = Number(g.ourScore), them = Number(g.oppScore);
    if (isNaN(us) || isNaN(them)) return null;
    if (us > them) return 'W';
    if (us < them) return 'L';
    return 'T';
  }

  function fmtDate(dateStr) {
    if (!dateStr) return 'Date TBD';
    // date input value is 'YYYY-MM-DD' -- parse as local, not UTC, so the
    // displayed day never shifts by one depending on timezone.
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ---- Cloud load/save ----
  function loadGames() {
    const statusEl = document.getElementById('scheduleCloudStatus');
    if (statusEl) statusEl.textContent = 'Loading schedule…';
    return window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        games = Array.isArray(data) ? data.filter(g => g && g.id) : [];
        if (statusEl) statusEl.textContent = '';
        renderList();
      })
      .catch(err => {
        console.error('Could not load schedule:', err);
        if (statusEl) statusEl.textContent = 'Could not reach the cloud -- showing nothing saved yet.';
      });
  }

  function persistGames(afterOk) {
    const statusEl = document.getElementById('scheduleDetailStatus') || document.getElementById('scheduleCloudStatus');
    window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(games),
    })).then(r => {
      if (r.ok) {
        if (afterOk) afterOk();
      } else if (statusEl) {
        statusEl.textContent = `Save failed (HTTP ${r.status}).`;
      }
    }).catch(err => {
      console.error('Schedule save failed:', err);
      if (statusEl) statusEl.textContent = `Save failed: ${err.message}`;
    });
  }

  // ---- List view ----
  function renderList() {
    const listEl = document.getElementById('scheduleList');
    const addWrap = document.getElementById('scheduleAddWrap');
    if (!listEl) return;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    if (addWrap) addWrap.style.display = approved ? '' : 'none';

    listEl.innerHTML = '';
    if (!games.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = approved ? 'No games on the schedule yet -- add one below.' : 'No games on the schedule yet.';
      listEl.appendChild(empty);
      return;
    }
    games.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).forEach(g => {
      const result = resultFor(g);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'scheduleRow';
      const badge = result
        ? `<span class="scheduleResultBadge ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'tie'}">${result}</span>`
        : `<span class="scheduleResultBadge upcoming">Upcoming</span>`;
      const scoreStr = result ? `${g.ourScore}-${g.oppScore}` : '';
      row.innerHTML = `
        <span class="scheduleRowDate">${fmtDate(g.date)}${g.time ? ' • ' + escapeHtml(g.time) : ''}</span>
        <span class="scheduleRowMain">
          <span class="scheduleRowOpp">${g.homeAway === 'Away' ? '@' : 'vs'} ${escapeHtml(g.opponent || 'TBD')}</span>
          <span class="scheduleRowLoc">${escapeHtml(g.location || '')}</span>
        </span>
        <span class="scheduleRowResult">${badge}${scoreStr ? `<span class="scheduleRowScore">${scoreStr}</span>` : ''}</span>`;
      row.addEventListener('click', () => openDetail(g.id));
      listEl.appendChild(row);
    });
  }

  // ---- Detail view (read-only for everyone, edit inputs added on top for an approved coach) ----
  function openDetail(id) {
    if (id) {
      const existing = games.find(g => g.id === id);
      current = existing ? { ...existing } : null;
    }
    if (!current) {
      current = { id: genId(), opponent: '', date: '', time: '', homeAway: 'Home', location: '', ourScore: '', oppScore: '', writeup: '', scouting: '', statSheet: blankStatSheet(), updatedAt: null };
    }
    current.statSheet = normalizeStatSheet(current.statSheet); // older saved games predate this field / had the old shape
    if (typeof current.scouting !== 'string') current.scouting = '';
    document.getElementById('scheduleListWrap').style.display = 'none';
    document.getElementById('scheduleDetail').style.display = '';
    renderDetail();
  }

  function closeDetail() {
    current = null;
    document.getElementById('scheduleDetail').style.display = 'none';
    document.getElementById('scheduleListWrap').style.display = '';
    renderList();
  }

  function renderDetail() {
    const body = document.getElementById('scheduleDetailBody');
    const editControls = document.getElementById('scheduleDetailEditControls');
    const deleteBtn = document.getElementById('scheduleDeleteBtn');
    if (!body || !current) return;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    editControls.style.display = approved ? '' : 'none';
    if (deleteBtn) deleteBtn.style.display = games.some(g => g.id === current.id) ? '' : 'none';

    if (!approved) {
      // ---- Read-only view ----
      const result = resultFor(current);
      const badgeHtml = result
        ? `<span class="scheduleResultBadge ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'tie'}">${result} ${current.ourScore}-${current.oppScore}</span>`
        : `<span class="scheduleResultBadge upcoming">Upcoming</span>`;
      body.innerHTML = `
        <div class="lbSectionHeader">${current.homeAway === 'Away' ? '@' : 'vs'} ${escapeHtml(current.opponent || 'TBD')}</div>
        <div class="lbSub" style="margin-bottom:10px;">${fmtDate(current.date)}${current.time ? ' • ' + escapeHtml(current.time) : ''} • ${escapeHtml(current.location || 'Location TBD')} • ${current.homeAway || 'Home'}</div>
        <div style="text-align:center;margin:10px 0;">${badgeHtml}</div>
        <div class="lbSectionHeader" style="margin-top:16px;">🔎 Scouting Report</div>
        <div class="scheduleWriteup">${current.scouting ? escapeHtml(current.scouting).replace(/\n/g, '<br>') : '<span class="lbEmpty" style="padding:0;">No scouting notes yet.</span>'}</div>
        <div class="lbSectionHeader" style="margin-top:16px;">📊 Stats</div>
        <div id="schedStatsWrap"></div>
        <div class="lbSectionHeader" style="margin-top:16px;">📝 Game Write-Up</div>
        <div class="scheduleWriteup">${current.writeup ? escapeHtml(current.writeup).replace(/\n/g, '<br>') : '<span class="lbEmpty" style="padding:0;">No write-up yet.</span>'}</div>`;
      renderStatSheet(true);
      return;
    }

    // ---- Coach edit view ----
    body.innerHTML = `
      <input type="text" id="schedOpponent" placeholder="Opponent" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:15px;font-weight:700;box-sizing:border-box;margin-bottom:8px;">
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <input type="date" id="schedDate" style="flex:1;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <input type="text" id="schedTime" placeholder="Time (e.g. 10:00 AM)" style="flex:1;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
      </div>
      <input type="text" id="schedLocation" placeholder="Location" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <div class="gameplanPickerGrid" id="schedHomeAwayGrid" style="margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
        <span class="lbSub" style="margin:0;">Final score:</span>
        <input type="number" id="schedOurScore" placeholder="Us" style="width:64px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <span>-</span>
        <input type="number" id="schedOppScore" placeholder="Them" style="width:64px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <span class="lbSub" style="margin:0;">(leave blank until played)</span>
      </div>
      <div class="lbSectionHeader" style="margin-top:6px;">🔎 Scouting Report</div>
      <div class="lbSub" style="margin:2px 0 8px;">Known tendencies, notable players, anything else worth calling out about this opponent -- visible to the whole team ahead of the game.</div>
      <textarea id="schedScouting" placeholder="e.g. &quot;#7 is their best runner, mostly runs right. Weak on outside contain.&quot;" style="width:100%;min-height:80px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;margin-bottom:4px;"></textarea>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;">
        <div class="lbSectionHeader" style="margin:0;">📊 Stats</div>
        <button class="lbLinkBtn" id="schedPrintStatSheetBtn">🖨️ Print Blank Stat Sheet</button>
      </div>
      <div class="lbSub" style="margin:2px 0 8px;">Tap a box to mark it a 1st down. Update this live as the game goes -- it saves whenever you hit Save Game below.</div>
      <div id="schedStatsWrap"></div>
      <div class="lbSectionHeader" style="margin-top:16px;">📝 Game Write-Up</div>
      <textarea id="schedWriteup" placeholder="How the game went…" style="width:100%;min-height:90px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;"></textarea>`;

    document.getElementById('schedPrintStatSheetBtn').addEventListener('click', (e) => {
      e.preventDefault();
      if (window.generateGameStatSheetPDF) {
        const doc = window.generateGameStatSheetPDF(current);
        doc.save(`ASL_Bengals_Stat_Sheet_${(current.opponent || 'game').replace(/[^a-z0-9]+/gi, '_')}.pdf`);
      }
    });
    renderStatSheet(false);

    document.getElementById('schedOpponent').value = current.opponent || '';
    document.getElementById('schedDate').value = current.date || '';
    document.getElementById('schedTime').value = current.time || '';
    document.getElementById('schedLocation').value = current.location || '';
    document.getElementById('schedOurScore').value = current.ourScore === null || current.ourScore === undefined ? '' : current.ourScore;
    document.getElementById('schedOppScore').value = current.oppScore === null || current.oppScore === undefined ? '' : current.oppScore;
    document.getElementById('schedWriteup').value = current.writeup || '';
    document.getElementById('schedScouting').value = current.scouting || '';

    const haGrid = document.getElementById('schedHomeAwayGrid');
    ['Home', 'Away'].forEach(v => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gameplanChip' + (current.homeAway === v ? ' active' : '');
      chip.textContent = v;
      chip.addEventListener('click', () => { current.homeAway = v; renderDetail(); });
      haGrid.appendChild(chip);
    });
  }

  // Thin delegate to the shared editor (js/game-stats-editor.js) -- keeps
  // this file owning only the per-game record, not the stat-sheet UI itself.
  function renderStatSheet(readOnly) {
    const wrap = document.getElementById('schedStatsWrap');
    if (!wrap || !window.renderGameStatSheet) return;
    window.renderGameStatSheet(wrap, current.statSheet, readOnly);
  }

  function saveCurrent() {
    if (!current) return;
    current.opponent = document.getElementById('schedOpponent').value.trim();
    current.date = document.getElementById('schedDate').value;
    current.time = document.getElementById('schedTime').value.trim();
    current.location = document.getElementById('schedLocation').value.trim();
    const ourScoreRaw = document.getElementById('schedOurScore').value.trim();
    const oppScoreRaw = document.getElementById('schedOppScore').value.trim();
    current.ourScore = ourScoreRaw === '' ? '' : Number(ourScoreRaw);
    current.oppScore = oppScoreRaw === '' ? '' : Number(oppScoreRaw);
    current.writeup = document.getElementById('schedWriteup').value.trim();
    current.scouting = document.getElementById('schedScouting').value.trim();
    if (!current.opponent) {
      const statusEl = document.getElementById('scheduleDetailStatus');
      if (statusEl) statusEl.textContent = 'Give the game an opponent first.';
      return;
    }
    current.updatedAt = new Date().toISOString();
    const idx = games.findIndex(g => g.id === current.id);
    if (idx >= 0) games[idx] = current; else games.push(current);
    persistGames(() => closeDetail());
  }

  function deleteCurrent() {
    if (!current) return;
    if (!confirm(`Delete the game vs ${current.opponent || 'this opponent'}? This can't be undone.`)) return;
    games = games.filter(g => g.id !== current.id);
    persistGames(() => closeDetail());
  }

  let controlsWired = false;
  function wireControls() {
    if (controlsWired) return;
    controlsWired = true;
    document.getElementById('scheduleNewBtn').addEventListener('click', () => { current = null; openDetail(null); });
    document.getElementById('scheduleBackBtn').addEventListener('click', closeDetail);
    document.getElementById('scheduleSaveBtn').addEventListener('click', saveCurrent);
    document.getElementById('scheduleDeleteBtn').addEventListener('click', deleteCurrent);
  }

  window.initSchedule = function () {
    wireControls();
    if (!loaded) {
      loaded = true;
      loadGames();
    } else {
      document.getElementById('scheduleDetail').style.display = 'none';
      document.getElementById('scheduleListWrap').style.display = '';
      renderList();
    }
  };
})();

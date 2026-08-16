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
//   v3 (this version) -- Nathan: "What you created with big columns doesn't
//   work - it will be updated as the game goes on. So I would want to write
//   in the name and # of all the running backs, QBs and Receivers as a
//   roster, then reference their number. When they run you add in the
//   yardage in an attempt box. So each row may have 20 attempts and you put
//   in the yardage for each attempt. have a little corner on the box that
//   can be filled in if it is for a first down. For passing you can put a
//   dash for an incomplete pass or the yardage gained - at the end of these
//   rows we need a cumulative total. defensive player names and #s are
//   added to the roster sheet and # will have a divided box - if a player
//   makes a solo tackle, the full box is filled, if it's assisted you fill
//   in half. Pass Int and break ups will be done for Defensive players as
//   well. along with sacks - include turnovers in a seperate section to
//   write in a number and what they did. give me kick off numbers too -
//   again a box to write in the yardage - each box will be an attempt.
//   have this be a PDF but also work as an electronic version I can update
//   after the game." So: a shared Roster (# + Name, offense and defense
//   together), then per-category ATTEMPT GRIDS keyed by player number --
//   Rushing/Passing/Receiving/Kickoffs are "one box per attempt, write the
//   yardage" (Passing boxes can also be "-" for incomplete; FD is a small
//   corner marker on Rushing/Passing/Receiving boxes, tap to toggle here,
//   handwritten on paper). Tackles is the same one-box-per-play idea but
//   each box is solo (full) or assisted (half) instead of a number. INT /
//   pass breakups / sacks are simple per-defender counters (rare, discrete
//   events -- a whole attempt-grid for these would mostly be empty boxes).
//   Turnovers is a free-write numbered log ("what they did"), not a grid.
//   The whole thing lives in current.statSheet -- see blankStatSheet().
// ---------------------------------------------------------------------------
(function () {

  const SCHEDULE_URL = `${FIREBASE_DB_URL}/schedule.json`;

  // Rushing/Passing/Receiving/Kickoffs all share the exact same "one box per
  // attempt" shape -- rendered (both on screen and on paper) by the same
  // generic code, driven off this config, rather than four near-duplicate
  // implementations.
  const ATTEMPT_SECTIONS = [
    { key: 'rushing', title: '🏃 Rushing', allowFD: true, passingMode: false },
    { key: 'passing', title: '🎯 Passing', allowFD: true, passingMode: true },
    { key: 'receiving', title: '🙌 Receiving', allowFD: true, passingMode: false },
    { key: 'kickoffs', title: '🦵 Kickoffs', allowFD: false, passingMode: false },
  ];
  window.gameStatAttemptSections = ATTEMPT_SECTIONS;

  function blankStatSheet() {
    return { roster: [], rushing: [], passing: [], receiving: [], kickoffs: [], tackles: [], defExtra: [], turnovers: [] };
  }
  function normalizeStatSheet(s) {
    const blank = blankStatSheet();
    if (!s || typeof s !== 'object') return blank;
    Object.keys(blank).forEach(k => { if (!Array.isArray(s[k])) s[k] = blank[k]; });
    return s;
  }
  window.blankGameStatSheet = blankStatSheet;

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

  function rosterName(num) {
    const p = (current.statSheet.roster || []).find(r => String(r.num) === String(num));
    return p ? p.name : '';
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

  // =========================================================================
  // STAT SHEET -- Roster, then Rushing/Passing/Receiving/Kickoffs (attempt
  // grids), then Tackles (solo/assist grid), then Defensive Extra (INT/PBU/
  // Sacks counters) and Turnovers (free-write log). current.statSheet IS the
  // live source of truth (same "mutate directly, only re-render on
  // structural add/remove" pattern as Drive Builder's play list) -- no
  // separate harvest-on-save step.
  // =========================================================================
  function renderStatSheet(readOnly) {
    const wrap = document.getElementById('schedStatsWrap');
    if (!wrap) return;
    const ss = current.statSheet;
    wrap.innerHTML = '';

    if (readOnly) {
      const hasAnything = ss.roster.length || ATTEMPT_SECTIONS.some(s => ss[s.key].length) || ss.tackles.length || ss.defExtra.length || ss.turnovers.length;
      if (!hasAnything) {
        wrap.innerHTML = '<div class="lbEmpty">Not entered yet.</div>';
        return;
      }
    } else if (!ss.roster.length) {
      const hint = document.createElement('div');
      hint.className = 'lbSub';
      hint.style.margin = '0 0 8px';
      hint.textContent = 'Start with the roster below -- every other section picks players from it by number.';
      wrap.appendChild(hint);
    }

    wrap.appendChild(sectionHeading('👥 Roster'));
    wrap.appendChild(renderRoster(readOnly));

    ATTEMPT_SECTIONS.forEach(cfg => {
      if (readOnly && !ss[cfg.key].length) return;
      wrap.appendChild(sectionHeading(cfg.title));
      wrap.appendChild(renderAttemptSection(cfg, readOnly));
    });

    if (!readOnly || ss.tackles.length) {
      wrap.appendChild(sectionHeading('💥 Tackles'));
      wrap.appendChild(renderTackles(readOnly));
    }

    if (!readOnly || ss.defExtra.length) {
      wrap.appendChild(sectionHeading('🛡️ Defensive Extra (INT / Pass Breakups / Sacks)'));
      wrap.appendChild(renderDefExtra(readOnly));
    }

    if (!readOnly || ss.turnovers.length) {
      wrap.appendChild(sectionHeading('🔁 Turnovers'));
      wrap.appendChild(renderTurnovers(readOnly));
    }
  }

  function sectionHeading(text) {
    const h = document.createElement('div');
    h.className = 'statsGroupHeading';
    h.textContent = text;
    return h;
  }
  function pickerSelect(placeholder) {
    const sel = document.createElement('select');
    sel.className = 'statsRosterPicker';
    const opt0 = document.createElement('option');
    opt0.value = ''; opt0.textContent = placeholder;
    sel.appendChild(opt0);
    (current.statSheet.roster || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.num;
      opt.textContent = `#${p.num} ${p.name}`;
      sel.appendChild(opt);
    });
    return sel;
  }

  // ---- Roster ----
  function renderRoster(readOnly) {
    const box = document.createElement('div');
    box.className = 'statsRosterBox';
    const roster = current.statSheet.roster;

    if (!roster.length && readOnly) {
      box.innerHTML = '<div class="lbEmpty">No roster entered.</div>';
      return box;
    }
    const list = document.createElement('div');
    list.className = 'statsRosterList';
    roster.forEach((p, i) => {
      const chip = document.createElement('span');
      chip.className = 'statsRosterChip';
      chip.innerHTML = `<b>#${escapeHtml(p.num)}</b> ${escapeHtml(p.name)}`;
      if (!readOnly) {
        const rm = document.createElement('button');
        rm.type = 'button'; rm.textContent = '✕'; rm.className = 'statsRmBtnSmall';
        rm.addEventListener('click', () => { roster.splice(i, 1); renderStatSheet(false); });
        chip.appendChild(rm);
      }
      list.appendChild(chip);
    });
    box.appendChild(list);

    if (!readOnly) {
      const form = document.createElement('div');
      form.className = 'statsRosterAddForm';
      const numInput = document.createElement('input');
      numInput.type = 'text'; numInput.placeholder = '#'; numInput.className = 'statsRosterNumInput';
      const nameInput = document.createElement('input');
      nameInput.type = 'text'; nameInput.placeholder = 'Name'; nameInput.className = 'statsRosterNameInput';
      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'lbLinkBtn'; addBtn.textContent = '+ Add to Roster';
      function addPlayer() {
        const num = numInput.value.trim(), name = nameInput.value.trim();
        if (!num || !name) return;
        roster.push({ num, name });
        numInput.value = ''; nameInput.value = '';
        renderStatSheet(false);
      }
      addBtn.addEventListener('click', addPlayer);
      nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addPlayer(); });
      form.appendChild(numInput); form.appendChild(nameInput); form.appendChild(addBtn);
      box.appendChild(form);
    }
    return box;
  }

  // ---- Rushing / Passing / Receiving / Kickoffs (attempt grids) ----
  function attemptTotal(rowData, passingMode) {
    return (rowData.attempts || []).reduce((sum, a) => {
      if (passingMode && !a.comp) return sum;
      return sum + (Number(a.yds) || 0);
    }, 0);
  }

  function renderAttemptSection(cfg, readOnly) {
    const box = document.createElement('div');
    box.className = 'attemptSectionBox';
    const rows = current.statSheet[cfg.key];

    if (!rows.length && readOnly) {
      box.innerHTML = '<div class="lbEmpty">Not entered.</div>';
      return box;
    }

    rows.forEach((rowData, rowIdx) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'attemptRow';

      const label = document.createElement('div');
      label.className = 'attemptRowLabel';
      label.textContent = `#${rowData.num}${rosterName(rowData.num) ? ' ' + rosterName(rowData.num) : ''}`;
      rowEl.appendChild(label);

      const boxesWrap = document.createElement('div');
      boxesWrap.className = 'attemptBoxesWrap';
      rowData.attempts.forEach((a, aIdx) => {
        const cell = document.createElement('div');
        cell.className = 'attemptBox' + (cfg.allowFD && a.fd ? ' fd' : '') + (cfg.passingMode && !a.comp ? ' incomplete' : '');
        cell.textContent = cfg.passingMode && !a.comp ? '-' : (a.yds === '' || a.yds === null || a.yds === undefined ? '' : a.yds);
        if (!readOnly && cfg.allowFD) {
          cell.title = 'Tap to mark/unmark 1st down';
          cell.addEventListener('click', () => { a.fd = !a.fd; renderStatSheet(false); });
        }
        boxesWrap.appendChild(cell);
      });

      if (!readOnly) {
        const addWrap = document.createElement('span');
        addWrap.className = 'attemptAddWrap';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = cfg.passingMode ? 'Yds or -' : 'Yds';
        input.className = 'attemptAddInput';
        function commitAttempt() {
          const raw = input.value.trim();
          if (raw === '') return;
          if (cfg.passingMode) {
            if (raw === '-') rowData.attempts.push({ yds: null, comp: false, fd: false });
            else { const n = Number(raw); if (!isNaN(n)) rowData.attempts.push({ yds: n, comp: true, fd: false }); }
          } else {
            const n = Number(raw);
            if (!isNaN(n)) rowData.attempts.push({ yds: n, fd: false });
          }
          input.value = '';
          renderStatSheet(false);
        }
        input.addEventListener('keydown', e => { if (e.key === 'Enter') commitAttempt(); });
        const addBtn = document.createElement('button');
        addBtn.type = 'button'; addBtn.className = 'statsSmallBtn'; addBtn.textContent = '+';
        addBtn.addEventListener('click', commitAttempt);
        const undoBtn = document.createElement('button');
        undoBtn.type = 'button'; undoBtn.className = 'statsSmallBtn'; undoBtn.textContent = '↺';
        undoBtn.title = 'Remove last attempt';
        undoBtn.addEventListener('click', () => { rowData.attempts.pop(); renderStatSheet(false); });
        const rmRowBtn = document.createElement('button');
        rmRowBtn.type = 'button'; rmRowBtn.className = 'statsRmBtn'; rmRowBtn.textContent = '✕ Row';
        rmRowBtn.addEventListener('click', () => { rows.splice(rowIdx, 1); renderStatSheet(false); });
        addWrap.appendChild(input); addWrap.appendChild(addBtn); addWrap.appendChild(undoBtn); addWrap.appendChild(rmRowBtn);
        boxesWrap.appendChild(addWrap);
      }
      rowEl.appendChild(boxesWrap);

      const total = document.createElement('div');
      total.className = 'attemptRowTotal';
      total.textContent = `${attemptTotal(rowData, cfg.passingMode)} yds`;
      rowEl.appendChild(total);

      box.appendChild(rowEl);
    });

    if (!readOnly) {
      const pickWrap = document.createElement('div');
      pickWrap.className = 'statsAddRowWrap';
      const sel = pickerSelect('Pick player #…');
      const addRowBtn = document.createElement('button');
      addRowBtn.type = 'button'; addRowBtn.className = 'lbLinkBtn'; addRowBtn.textContent = '+ Add Player Row';
      addRowBtn.addEventListener('click', () => {
        if (!sel.value) return;
        rows.push({ num: sel.value, attempts: [] });
        renderStatSheet(false);
      });
      pickWrap.appendChild(sel); pickWrap.appendChild(addRowBtn);
      box.appendChild(pickWrap);
    }
    return box;
  }

  // ---- Tackles (solo = full box, assisted = half box) ----
  function renderTackles(readOnly) {
    const box = document.createElement('div');
    box.className = 'attemptSectionBox';
    const rows = current.statSheet.tackles;

    if (!rows.length && readOnly) {
      box.innerHTML = '<div class="lbEmpty">Not entered.</div>';
      return box;
    }

    rows.forEach((rowData, rowIdx) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'attemptRow';
      const label = document.createElement('div');
      label.className = 'attemptRowLabel';
      label.textContent = `#${rowData.num}${rosterName(rowData.num) ? ' ' + rosterName(rowData.num) : ''}`;
      rowEl.appendChild(label);

      const boxesWrap = document.createElement('div');
      boxesWrap.className = 'attemptBoxesWrap';
      rowData.marks.forEach((mark, mIdx) => {
        const cell = document.createElement('div');
        cell.className = 'attemptBox tackleBox ' + mark; // 'solo' | 'assist'
        if (!readOnly) {
          cell.title = 'Tap to remove';
          cell.addEventListener('click', () => { rowData.marks.splice(mIdx, 1); renderStatSheet(false); });
        }
        boxesWrap.appendChild(cell);
      });

      if (!readOnly) {
        const addWrap = document.createElement('span');
        addWrap.className = 'attemptAddWrap';
        const soloBtn = document.createElement('button');
        soloBtn.type = 'button'; soloBtn.className = 'statsSmallBtn'; soloBtn.textContent = '+ Solo';
        soloBtn.addEventListener('click', () => { rowData.marks.push('solo'); renderStatSheet(false); });
        const astBtn = document.createElement('button');
        astBtn.type = 'button'; astBtn.className = 'statsSmallBtn'; astBtn.textContent = '+ Ast';
        astBtn.addEventListener('click', () => { rowData.marks.push('assist'); renderStatSheet(false); });
        const rmRowBtn = document.createElement('button');
        rmRowBtn.type = 'button'; rmRowBtn.className = 'statsRmBtn'; rmRowBtn.textContent = '✕ Row';
        rmRowBtn.addEventListener('click', () => { rows.splice(rowIdx, 1); renderStatSheet(false); });
        addWrap.appendChild(soloBtn); addWrap.appendChild(astBtn); addWrap.appendChild(rmRowBtn);
        boxesWrap.appendChild(addWrap);
      }
      rowEl.appendChild(boxesWrap);

      const solo = rowData.marks.filter(m => m === 'solo').length;
      const ast = rowData.marks.filter(m => m === 'assist').length;
      const total = document.createElement('div');
      total.className = 'attemptRowTotal';
      total.textContent = `${solo + ast * 0.5} tot (${solo} solo, ${ast} ast)`;
      rowEl.appendChild(total);

      box.appendChild(rowEl);
    });

    if (!readOnly) {
      const pickWrap = document.createElement('div');
      pickWrap.className = 'statsAddRowWrap';
      const sel = pickerSelect('Pick player #…');
      const addRowBtn = document.createElement('button');
      addRowBtn.type = 'button'; addRowBtn.className = 'lbLinkBtn'; addRowBtn.textContent = '+ Add Player Row';
      addRowBtn.addEventListener('click', () => {
        if (!sel.value) return;
        rows.push({ num: sel.value, marks: [] });
        renderStatSheet(false);
      });
      pickWrap.appendChild(sel); pickWrap.appendChild(addRowBtn);
      box.appendChild(pickWrap);
    }
    return box;
  }

  // ---- Defensive Extra: INT / Pass Breakups / Sacks -- simple per-defender
  // counters (rare, discrete events -- not worth a whole attempt grid). ----
  function renderDefExtra(readOnly) {
    const box = document.createElement('div');
    const rows = current.statSheet.defExtra;
    if (!rows.length && readOnly) {
      box.innerHTML = '<div class="lbEmpty">Not entered.</div>';
      return box;
    }
    const table = document.createElement('table');
    table.className = 'statsTable' + (readOnly ? '' : ' statsTableEdit');
    table.innerHTML = `<thead><tr><th>#</th><th>Name</th><th>INT</th><th>PBU</th><th>Sacks</th>${readOnly ? '' : '<th></th>'}</tr></thead>`;
    const tbody = document.createElement('tbody');
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      const numTd = document.createElement('td'); numTd.textContent = r.num; numTd.className = 'statsIdentityCell';
      const nameTd = document.createElement('td'); nameTd.textContent = rosterName(r.num) || '—'; nameTd.className = 'statsIdentityCell';
      tr.appendChild(numTd); tr.appendChild(nameTd);
      ['int', 'pbu', 'sacks'].forEach(field => {
        const td = document.createElement('td');
        if (readOnly) {
          td.textContent = r[field] || 0;
        } else {
          const input = document.createElement('input');
          input.type = 'number'; input.className = 'statsCellInput'; input.value = r[field] || 0;
          input.addEventListener('input', () => { r[field] = Number(input.value) || 0; });
          td.appendChild(input);
        }
        tr.appendChild(td);
      });
      if (!readOnly) {
        const rmTd = document.createElement('td');
        const rmBtn = document.createElement('button');
        rmBtn.type = 'button'; rmBtn.textContent = '✕'; rmBtn.className = 'statsRmBtn';
        rmBtn.addEventListener('click', () => { rows.splice(i, 1); renderStatSheet(false); });
        rmTd.appendChild(rmBtn);
        tr.appendChild(rmTd);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);

    if (!readOnly) {
      const pickWrap = document.createElement('div');
      pickWrap.className = 'statsAddRowWrap';
      const sel = pickerSelect('Pick player #…');
      const addRowBtn = document.createElement('button');
      addRowBtn.type = 'button'; addRowBtn.className = 'lbLinkBtn'; addRowBtn.textContent = '+ Add Player Row';
      addRowBtn.addEventListener('click', () => {
        if (!sel.value) return;
        rows.push({ num: sel.value, int: 0, pbu: 0, sacks: 0 });
        renderStatSheet(false);
      });
      pickWrap.appendChild(sel); pickWrap.appendChild(addRowBtn);
      box.appendChild(pickWrap);
    }
    return box;
  }

  // ---- Turnovers: free-write numbered log ("write in a number and what
  // they did") -- not tied to the roster, just a running list. ----
  function renderTurnovers(readOnly) {
    const box = document.createElement('div');
    const rows = current.statSheet.turnovers;
    if (!rows.length && readOnly) {
      box.innerHTML = '<div class="lbEmpty">None recorded.</div>';
      return box;
    }
    const list = document.createElement('div');
    list.className = 'turnoverList';
    rows.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'turnoverRow';
      const n = document.createElement('span');
      n.className = 'turnoverNum';
      n.textContent = String(i + 1);
      row.appendChild(n);
      if (readOnly) {
        const txt = document.createElement('span');
        txt.textContent = t.desc || '';
        row.appendChild(txt);
      } else {
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'turnoverInput';
        input.placeholder = 'e.g. "Fumble, recovered by #22"';
        input.value = t.desc || '';
        input.addEventListener('input', () => { t.desc = input.value; });
        row.appendChild(input);
        const rm = document.createElement('button');
        rm.type = 'button'; rm.textContent = '✕'; rm.className = 'statsRmBtnSmall';
        rm.addEventListener('click', () => { rows.splice(i, 1); renderStatSheet(false); });
        row.appendChild(rm);
      }
      list.appendChild(row);
    });
    box.appendChild(list);
    if (!readOnly) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'lbLinkBtn'; addBtn.style.marginTop = '6px';
      addBtn.textContent = '+ Add Turnover';
      addBtn.addEventListener('click', () => { rows.push({ desc: '' }); renderStatSheet(false); });
      box.appendChild(addBtn);
    }
    return box;
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

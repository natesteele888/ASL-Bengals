// ---------------------------------------------------------------------------
// Coach Tools > Depth Chart -- Nathan: "create another tab under coaching
// tools for Depth Chart. You can use the example from Madden for an idea of
// what we could do - Should have name and number with + or - to add or
// remove guys from the roster." (Madden "Lineup" screenshot: Offense/
// Defense/Special Teams tabs, position cards with a starter + backups.)
//
// Position groups are coach-defined, not a fixed list -- Nathan's first real
// depth chart came in as "(QB) - #1 - Sonny, Will, Dean", "(RB) - #2 -
// James, Connor", "(RB) - #3 - Will, Desmond", "(TE) - #5 - Jacob", "(TE) -
// #6 - Caden", "Left CB", "Right CB", "Middle LB", etc. -- his offense uses
// numbered slots (matching data/plays.json's backfield/split numbering,
// 1=QB, 2/3=the two backs, 4=wing, 5/6=ends) where RB #2 and RB #3 are
// different roles/players, not one generic "RB" bucket with a starter and a
// backup. A fixed QB/RB/WR/TE/OL/DL/LB/DB/K/P/Returner list (this file's
// original version) can't represent that, so groups are add/rename/
// remove-able per section instead.
//
// "+ / -" still only reorders/manages a POSITION GROUP's depth list -- it
// does NOT add or remove anyone from the master team roster (js/roster.js
// already owns that).
//
// Nathan (follow-up): "I also need depth charts for kick off, kick return,
// and defense. Instead of a list of players on the depth chart, I want it
// to look like a depth chart with player cards in the spots on the field."
// Two things bundled together: (1) Kickoff and Kick Return join Offense/
// Defense as their own real sections (same coach-defined-groups system, not
// a special case), and (2) every spatial section (those four -- Special
// Teams individual roles stay a plain list, there's no "field spot" for
// "our punter" the way there is for an 11-man coverage team) now lays its
// cards out on an actual grid instead of a top-to-bottom stack, each
// card's spot set by a row/col the coach can nudge with arrows -- not a
// fixed template guessing what "RDE" or "WHIP" means for every team, since
// that's exactly the kind of team-specific position naming the group
// system above already had to support.
//
// Storage: depthChart.json = { groups: [{id, section, label, players:[num,...], row, col}] }.
// ---------------------------------------------------------------------------
(function () {

  const DEPTH_URL = `${FIREBASE_DB_URL}/depthChart.json`;
  const SECTION_ORDER = ['offense', 'defense', 'kickoff', 'kickreturn', 'special'];
  const SECTION_LABELS = { offense: 'Offense', defense: 'Defense', kickoff: 'Kickoff Coverage', kickreturn: 'Kick Return', special: 'Special Teams' };
  // Which sections get the spatial field-grid layout vs. the plain
  // top-to-bottom list Special Teams already used (an individual role like
  // "Kicker" or "Holder" doesn't have a field spot the way an 11-man unit's
  // positions do).
  const SPATIAL_SECTIONS = ['offense', 'defense', 'kickoff', 'kickreturn'];
  const GRID_COLS = 10; // enough resolution to spread an 11-man kickoff/return line across the full width, and to cluster an O-line/D-line tightly within it

  // Seeds depthChart.json the very first time it's ever opened for this
  // team (i.e. nothing saved there yet) -- Nathan's real starting depth
  // chart as given, matched against the live roster's actual jersey
  // numbers. Once real data exists, this constant is never consulted
  // again; editing it later does nothing for a team that's already saved
  // a chart. row/col below are rough starting spots only -- coaches drag
  // them into place with the arrow controls once real formations matter.
  const DEFAULT_GROUPS = [
    { id: 'qb',  section: 'offense', label: 'QB',        players: ['51', '5', '11'], row: 2, col: 5 },
    { id: 'rb2', section: 'offense', label: 'RB #2',     players: ['87', '8'], row: 3, col: 4 },
    { id: 'rb3', section: 'offense', label: 'RB #3',     players: ['5', '76'], row: 3, col: 6 },
    { id: 'wr',  section: 'offense', label: 'WR',        players: ['7', '49'], row: 1, col: 1 },
    { id: 'te5', section: 'offense', label: 'TE #5',     players: ['6'], row: 1, col: 8 },
    { id: 'te6', section: 'offense', label: 'TE #6',     players: ['86'], row: 1, col: 10 },
    { id: 'lt',  section: 'offense', label: 'LT',        players: [], row: 1, col: 4 },
    { id: 'lg',  section: 'offense', label: 'LG',        players: [], row: 1, col: 5 },
    { id: 'c',   section: 'offense', label: 'C',         players: ['99'], row: 1, col: 6 },
    { id: 'rg',  section: 'offense', label: 'RG',        players: [], row: 1, col: 7 },
    { id: 'rt',  section: 'offense', label: 'RT',        players: [], row: 1, col: 3 },
    { id: 'dl',  section: 'defense', label: 'DL',        players: [], row: 2, col: 5 },
    { id: 'lcb', section: 'defense', label: 'Left CB',   players: ['76'], row: 1, col: 2 },
    { id: 'rcb', section: 'defense', label: 'Right CB',  players: ['27'], row: 1, col: 9 },
    { id: 'mlb', section: 'defense', label: 'Middle LB', players: ['6', '44'], row: 1, col: 5 },
    { id: 'k',   section: 'special', label: 'K',         players: [] },
    { id: 'p',   section: 'special', label: 'P',         players: [] },
    { id: 'ret', section: 'special', label: 'Returner',  players: [] },
  ];

  let groups = []; // [{id, section, label, players:[num,...], row, col}]
  let loaded = false;
  let pendingSeedSave = false; // true if we just seeded defaults and still need to persist them once

  function genId() {
    return 'pos' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeChart(data) {
    if (data && Array.isArray(data.groups) && data.groups.length) {
      return data.groups.map((g, i) => ({
        id: g.id || genId(),
        section: SECTION_ORDER.includes(g.section) ? g.section : 'offense',
        label: g.label || '?',
        players: Array.isArray(g.players) ? g.players.filter(n => n !== null && n !== undefined).map(String) : [],
        // Nathan: "player cards in the spots on the field" -- a group saved
        // before this existed just gets spread left-to-right on row 1 as a
        // starting point (index-based, wraps at GRID_COLS), not stacked on
        // top of each other at (1,1).
        row: Number.isFinite(g.row) ? g.row : (Math.floor(i / GRID_COLS) + 1),
        col: Number.isFinite(g.col) ? g.col : ((i % GRID_COLS) + 1),
      }));
    }
    return null; // nothing real saved yet
  }

  function loadChart() {
    return window.firebaseAuthed(DEPTH_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        const normalized = normalizeChart(data);
        if (normalized) {
          groups = normalized;
        } else {
          groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
          pendingSeedSave = true;
        }
        loaded = true;
        return groups;
      })
      .catch(err => {
        console.error('Could not load depth chart:', err);
        groups = [];
        loaded = true;
        return groups;
      });
  }

  function persistChart(afterOk, afterFail) {
    window.firebaseAuthed(DEPTH_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups }),
    })).then(r => {
      if (r.ok) { if (afterOk) afterOk(); }
      else if (afterFail) afterFail(`HTTP ${r.status}`);
    }).catch(err => {
      console.error('Depth chart save failed:', err);
      if (afterFail) afterFail(err.message);
    });
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function rosterByNum() {
    const map = {};
    (window.getTeamRosterCached ? window.getTeamRosterCached() : []).forEach(p => { map[String(p.num)] = p; });
    return map;
  }

  function setStatus(text, isError) {
    const el = document.getElementById('depthChartStatus');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#c0392b' : '';
  }

  function saveAndRerender() {
    setStatus('Saving…');
    persistChart(() => { setStatus('Saved'); setTimeout(() => setStatus(''), 1200); },
      msg => setStatus('Save failed: ' + msg, true));
    render();
  }

  function findGroup(groupId) {
    return groups.find(g => g.id === groupId);
  }

  function moveInGroup(groupId, num, dir) {
    const g = findGroup(groupId);
    if (!g) return;
    const i = g.players.indexOf(num);
    if (i === -1) return;
    const j = i + dir;
    if (j < 0 || j >= g.players.length) return;
    const tmp = g.players[i]; g.players[i] = g.players[j]; g.players[j] = tmp;
    saveAndRerender();
  }

  function removeFromGroup(groupId, num) {
    const g = findGroup(groupId);
    if (!g) return;
    g.players = g.players.filter(n => n !== num);
    saveAndRerender();
  }

  function addToGroup(groupId, num) {
    const g = findGroup(groupId);
    if (!g || !num || g.players.includes(num)) return;
    g.players.push(num);
    saveAndRerender();
  }

  function addGroup(section, label) {
    if (!label || !label.trim()) return;
    const sectionGroups = groups.filter(g => g.section === section);
    // New card starts just to the right of whatever's already there so it
    // doesn't land stacked on top of an existing one -- easy to drag into
    // its real spot afterward either way.
    const row = sectionGroups.length ? sectionGroups[sectionGroups.length - 1].row : 1;
    const col = sectionGroups.length ? Math.min(GRID_COLS, sectionGroups[sectionGroups.length - 1].col + 1) : 1;
    groups.push({ id: genId(), section, label: label.trim(), players: [], row, col });
    saveAndRerender();
  }

  function removeGroup(groupId) {
    const g = findGroup(groupId);
    if (!g) return;
    if (!confirm(`Remove the "${g.label}" position group? This only removes the group itself -- it doesn't touch the roster.`)) return;
    groups = groups.filter(x => x.id !== groupId);
    saveAndRerender();
  }

  // Nathan: "player cards in the spots on the field." Nudges this card's
  // grid position by one step -- clamped so a card can never get dragged
  // fully off the visible grid (row 1+ and col within GRID_COLS).
  function nudgeGroup(groupId, drow, dcol) {
    const g = findGroup(groupId);
    if (!g) return;
    g.row = Math.max(1, (g.row || 1) + drow);
    g.col = Math.max(1, Math.min(GRID_COLS, (g.col || 1) + dcol));
    saveAndRerender();
  }

  function groupCardHtml(g, byNum, spatial) {
    const rowsHtml = g.players.map((num, i) => {
      const p = byNum[num];
      if (!p) return ''; // stale reference (player removed from roster elsewhere) -- just skip it, don't touch storage
      const label = i === 0 ? 'Starter' : `Backup ${i}`;
      return `
        <div class="depthChartRow" data-group="${escapeHtml(g.id)}" data-num="${escapeHtml(num)}">
          <span class="depthChartSlotLabel">${label}</span>
          <span class="depthChartPlayer">#${escapeHtml(num)} ${escapeHtml(p.name || '')}</span>
          <span class="depthChartRowBtns">
            <button type="button" class="depthChartIconBtn" data-act="up" title="Move up" ${i === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" class="depthChartIconBtn" data-act="down" title="Move down" ${i === g.players.length - 1 ? 'disabled' : ''}>▼</button>
            <button type="button" class="depthChartIconBtn depthChartRemoveBtn" data-act="remove" title="Remove from ${escapeHtml(g.label)}">✕</button>
          </span>
        </div>`;
    }).join('');
    const emptyHtml = g.players.length ? '' : '<div class="lbEmpty" style="padding:6px 0;">No one listed yet.</div>';

    const listedNums = new Set(g.players);
    const available = Object.values(byNum).filter(p => p.num && !listedNums.has(String(p.num)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const options = available.map(p => `<option value="${escapeHtml(p.num)}">#${escapeHtml(p.num)} ${escapeHtml(p.name || '')}</option>`).join('');

    // Nathan: "I want it to look like a depth chart with player cards in
    // the spots on the field" -- starter's name/number is the headline
    // (same bold-name-and-number look the reference image's cards use),
    // backups stack underneath in smaller text; the position label sits
    // above the card like a jersey/field marker rather than inside it.
    const starterNum = g.players[0];
    const starterP = starterNum ? byNum[starterNum] : null;
    const backups = g.players.slice(1).map(n => byNum[n]).filter(Boolean);
    const starterHtml = starterP
      ? `<div class="depthChartStarterLine" data-group="${escapeHtml(g.id)}" data-num="${escapeHtml(starterNum)}">#${escapeHtml(starterNum)} ${escapeHtml(starterP.name || '')}</div>`
      : `<div class="depthChartStarterLine empty">— open —</div>`;
    const backupsHtml = backups.length
      ? backups.map((p, i) => `<div class="depthChartBackupLine" data-group="${escapeHtml(g.id)}" data-num="${escapeHtml(g.players[i+1])}">#${escapeHtml(p.num)} ${escapeHtml(p.name || '')}</div>`).join('')
      : '';

    const nudgeHtml = spatial ? `
        <div class="depthChartNudge">
          <button type="button" class="depthChartNudgeBtn" data-act="nudge" data-dr="-1" data-dc="0" title="Move up">↑</button>
          <div class="depthChartNudgeMid">
            <button type="button" class="depthChartNudgeBtn" data-act="nudge" data-dr="0" data-dc="-1" title="Move left">←</button>
            <button type="button" class="depthChartNudgeBtn" data-act="nudge" data-dr="0" data-dc="1" title="Move right">→</button>
          </div>
          <button type="button" class="depthChartNudgeBtn" data-act="nudge" data-dr="1" data-dc="0" title="Move down">↓</button>
        </div>` : '';

    const gridStyle = spatial ? ` style="grid-row:${g.row||1};grid-column:${g.col||1};"` : '';

    return `
      <div class="depthChartCard${spatial ? ' spatial' : ''}" data-group="${escapeHtml(g.id)}"${gridStyle}>
        <div class="depthChartCardTitle">
          <span>${escapeHtml(g.label)}</span>
          <button type="button" class="depthChartIconBtn depthChartRemoveBtn depthChartRemoveGroupBtn" data-act="removeGroup" title="Remove this position group">✕</button>
        </div>
        ${nudgeHtml}
        ${starterHtml}${backupsHtml}${!g.players.length ? emptyHtml : ''}
        <details class="depthChartDetails">
          <summary>Edit depth (${g.players.length})</summary>
          ${rowsHtml}
          <div class="depthChartAddRow">
            <select class="depthChartAddSel">
              <option value="">+ Add to ${escapeHtml(g.label)}…</option>
              ${options}
            </select>
          </div>
        </details>
      </div>`;
  }

  function sectionAddGroupHtml(section) {
    return `
      <div class="depthChartAddGroupRow" data-section="${escapeHtml(section)}">
        <input type="text" class="depthChartNewGroupInput" placeholder="+ Add a position (e.g. Safety, RT)…">
        <button type="button" class="lbLinkBtn depthChartAddGroupBtn">Add</button>
      </div>`;
  }

  function render() {
    const wrap = document.getElementById('depthChartBody');
    if (!wrap) return;
    if (!loaded) { wrap.innerHTML = '<div class="lbEmpty">Loading…</div>'; return; }
    const byNum = rosterByNum();

    wrap.innerHTML = SECTION_ORDER.map(section => {
      const sectionGroups = groups.filter(g => g.section === section);
      const spatial = SPATIAL_SECTIONS.includes(section);
      const gridHtml = spatial
        ? `<div class="depthChartFieldGrid" style="grid-template-columns:repeat(${GRID_COLS}, minmax(64px,1fr));">
            ${sectionGroups.map(g => groupCardHtml(g, byNum, true)).join('')}
          </div>`
        : `<div class="depthChartGrid">${sectionGroups.map(g => groupCardHtml(g, byNum, false)).join('')}</div>`;
      return `
        <div class="lbSectionHeader" style="margin-top:14px;">${escapeHtml(SECTION_LABELS[section])}</div>
        ${!sectionGroups.length ? '<div class="lbEmpty">No positions added yet.</div>' : gridHtml}
        ${sectionAddGroupHtml(section)}
      `;
    }).join('') + '<div id="depthChartStatus" class="lbSub" style="margin-top:10px;"></div>';

    wrap.querySelectorAll('.depthChartRow').forEach(row => {
      const groupId = row.getAttribute('data-group');
      const num = row.getAttribute('data-num');
      row.querySelectorAll('.depthChartIconBtn').forEach(btn => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-act');
          if (act === 'up') moveInGroup(groupId, num, -1);
          else if (act === 'down') moveInGroup(groupId, num, 1);
          else if (act === 'remove') removeFromGroup(groupId, num);
        });
      });
    });
    wrap.querySelectorAll('.depthChartCard').forEach(card => {
      const groupId = card.getAttribute('data-group');
      const sel = card.querySelector('.depthChartAddSel');
      if (sel) sel.addEventListener('change', () => { addToGroup(groupId, sel.value); });
      const removeGroupBtn = card.querySelector('.depthChartRemoveGroupBtn');
      if (removeGroupBtn) removeGroupBtn.addEventListener('click', () => removeGroup(groupId));
      card.querySelectorAll('.depthChartNudgeBtn').forEach(btn => {
        btn.addEventListener('click', () => nudgeGroup(groupId, Number(btn.getAttribute('data-dr')), Number(btn.getAttribute('data-dc'))));
      });
    });
    wrap.querySelectorAll('.depthChartAddGroupRow').forEach(row => {
      const section = row.getAttribute('data-section');
      const input = row.querySelector('.depthChartNewGroupInput');
      const btn = row.querySelector('.depthChartAddGroupBtn');
      const submit = () => { addGroup(section, input.value); input.value = ''; };
      btn.addEventListener('click', submit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    });
  }

  window.initDepthChart = function () {
    const wrap = document.getElementById('depthChartBody');
    if (wrap) wrap.innerHTML = '<div class="lbEmpty">Loading…</div>';
    const rosterReady = window.isTeamRosterLoaded && window.isTeamRosterLoaded()
      ? Promise.resolve()
      : (window.loadTeamRoster ? window.loadTeamRoster() : Promise.resolve());
    Promise.all([rosterReady, loadChart()]).then(() => {
      render();
      if (pendingSeedSave) {
        pendingSeedSave = false;
        // Silent one-time save of the seeded defaults so they become real,
        // editable data going forward instead of re-seeding on every load.
        persistChart(() => {}, msg => console.error('Depth chart seed save failed:', msg));
      }
    });
  };
})();


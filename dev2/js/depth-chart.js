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
// numbered slots where RB #2 and RB #3 are different roles/players, not one
// generic "RB" bucket with a starter and a backup. A fixed QB/RB/WR/TE/OL/
// DL/LB/DB/K/P/Returner list (this file's original version) can't represent
// that, so groups are add/rename/remove-able per section instead.
//
// "+ / -" still only reorders/manages a POSITION GROUP's depth list -- it
// does NOT add or remove anyone from the master team roster (js/roster.js
// already owns that).
//
// Nathan (follow-up): "I also need depth charts for kick off, kick return,
// and defense... I want it to look like a depth chart with player cards in
// the spots on the field." Kickoff and Kick Return joined Offense/Defense as
// their own real sections. The first visual attempt at "spots on the field"
// was a full CSS grid of position cards, coach-draggable with arrow nudges --
// Nathan (follow-up): "this is used primarily on mobile so that just gives
// me a big string of cards - not defined by spots on the field. Maybe we use
// the basic wing formation and have that be at the top and down below are
// the players listed in the order when a position is selected." Full-size
// cards laid out wide just doesn't fit a phone no matter how the grid is
// tuned -- a real depth chart in hand is a small formation map you point at,
// not a grid of cards to scroll through. So: a small, compact formation
// diagram up top (each position a tappable dot at its own x/y spot,
// coach-placed once and rarely touched again) with the SELECTED position's
// actual starter/backups/edit controls in a normal, roomy list underneath --
// only one position's full detail on screen at a time, which is exactly
// what fits a phone.
//
// Storage: depthChart.json = { groups: [{id, section, label, players:[num,...], x, y}] }.
// x/y are 0-100 percentages within the section's own diagram box.
// ---------------------------------------------------------------------------
(function () {

  const DEPTH_URL = `${FIREBASE_DB_URL}/depthChart.json`;
  const SECTION_ORDER = ['offense', 'defense', 'kickoff', 'kickreturn', 'special'];
  const SECTION_LABELS = { offense: 'Offense', defense: 'Defense', kickoff: 'Kickoff Coverage', kickreturn: 'Kick Return', special: 'Special Teams' };
  // Which sections get the tap-a-spot-on-the-formation treatment vs. the
  // plain top-to-bottom list Special Teams already used (an individual role
  // like "Kicker" or "Holder" doesn't have a field spot the way an 11-man
  // unit's positions do).
  const SPATIAL_SECTIONS = ['offense', 'defense', 'kickoff', 'kickreturn'];

  // Seeds depthChart.json the very first time it's ever opened for this
  // team (i.e. nothing saved there yet) -- Nathan's real starting depth
  // chart as given, matched against the live roster's actual jersey
  // numbers. Once real data exists, this constant is never consulted again.
  // x/y below sketch out a basic Wing-formation look (5-man line, QB under
  // center, two backs, ends split wide) as a starting point -- nudged into
  // an exact match with the arrow controls once it matters, not meant to be
  // pixel-perfect out of the box.
  const DEFAULT_GROUPS = [
    { id: 'wr',  section: 'offense', label: 'WR',        players: ['7', '49'], x: 6,  y: 45 },
    { id: 'lt',  section: 'offense', label: 'LT',        players: [],          x: 28, y: 45 },
    { id: 'lg',  section: 'offense', label: 'LG',        players: [],          x: 39, y: 45 },
    { id: 'c',   section: 'offense', label: 'C',         players: ['99'],      x: 50, y: 45 },
    { id: 'rg',  section: 'offense', label: 'RG',        players: [],          x: 61, y: 45 },
    { id: 'rt',  section: 'offense', label: 'RT',        players: [],          x: 72, y: 45 },
    { id: 'te5', section: 'offense', label: 'TE #5',     players: ['6'],       x: 88, y: 42 },
    { id: 'te6', section: 'offense', label: 'TE #6',     players: ['86'],      x: 94, y: 55 },
    { id: 'qb',  section: 'offense', label: 'QB',        players: ['51', '5', '11'], x: 50, y: 68 },
    { id: 'rb2', section: 'offense', label: 'RB #2',     players: ['87', '8'], x: 40, y: 85 },
    { id: 'rb3', section: 'offense', label: 'RB #3',     players: ['5', '76'], x: 62, y: 85 },
    { id: 'dl',  section: 'defense', label: 'DL',        players: [],          x: 50, y: 30 },
    { id: 'lcb', section: 'defense', label: 'Left CB',   players: ['76'],      x: 10, y: 20 },
    { id: 'rcb', section: 'defense', label: 'Right CB',  players: ['27'],      x: 90, y: 20 },
    { id: 'mlb', section: 'defense', label: 'Middle LB', players: ['6', '44'], x: 50, y: 55 },
    { id: 'k',   section: 'special', label: 'K',         players: [] },
    { id: 'p',   section: 'special', label: 'P',         players: [] },
    { id: 'ret', section: 'special', label: 'Returner',  players: [] },
  ];

  let groups = []; // [{id, section, label, players:[num,...], x, y}]
  let loaded = false;
  let pendingSeedSave = false; // true if we just seeded defaults and still need to persist them once
  let selectedByCategory = {}; // { [section]: groupId } -- which position's detail is showing, per section

  function genId() {
    return 'pos' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeChart(data) {
    if (data && Array.isArray(data.groups) && data.groups.length) {
      return data.groups.map((g, i) => {
        const sectionGroupsSoFar = data.groups.slice(0, i).filter(o => o.section === g.section).length;
        return {
          id: g.id || genId(),
          section: SECTION_ORDER.includes(g.section) ? g.section : 'offense',
          label: g.label || '?',
          players: Array.isArray(g.players) ? g.players.filter(n => n !== null && n !== undefined).map(String) : [],
          // Nathan: "player cards in the spots on the field" -- a group
          // saved before x/y existed (or before this from a row/col
          // version) just gets spread left-to-right on one line as a
          // starting point, not stacked on top of each other at (0,0).
          x: Number.isFinite(g.x) ? g.x : Math.min(92, 8 + sectionGroupsSoFar * 12),
          y: Number.isFinite(g.y) ? g.y : 50,
        };
      });
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
    const newGroup = { id: genId(), section, label: label.trim(), players: [] };
    if (SPATIAL_SECTIONS.includes(section)) {
      // New marker starts just to the right of whatever's already there so
      // it doesn't land stacked on top of an existing one -- easy to nudge
      // into its real spot afterward either way.
      newGroup.x = sectionGroups.length ? Math.min(92, sectionGroups[sectionGroups.length - 1].x + 10) : 50;
      newGroup.y = sectionGroups.length ? sectionGroups[sectionGroups.length - 1].y : 50;
    }
    groups.push(newGroup);
    if (SPATIAL_SECTIONS.includes(section)) selectedByCategory[section] = newGroup.id;
    saveAndRerender();
  }

  function removeGroup(groupId) {
    const g = findGroup(groupId);
    if (!g) return;
    if (!confirm(`Remove the "${g.label}" position group? This only removes the group itself -- it doesn't touch the roster.`)) return;
    groups = groups.filter(x => x.id !== groupId);
    if (selectedByCategory[g.section] === groupId) delete selectedByCategory[g.section];
    saveAndRerender();
  }

  // Nathan: "player cards in the spots on the field." Nudges the SELECTED
  // marker's diagram position by a few percent -- clamped to stay on the
  // visible diagram (0-100 both axes).
  function nudgeGroup(groupId, dx, dy) {
    const g = findGroup(groupId);
    if (!g) return;
    g.x = Math.max(2, Math.min(98, (g.x != null ? g.x : 50) + dx));
    g.y = Math.max(2, Math.min(98, (g.y != null ? g.y : 50) + dy));
    saveAndRerender();
  }

  // ---- Diagram (tappable markers, one per position, no roster detail on
  // them at all -- just enough to point at and say "that one"). ----
  function diagramHtml(section, sectionGroups) {
    const selectedId = selectedByCategory[section];
    const markers = sectionGroups.map(g => {
      const isSelected = g.id === selectedId;
      return `<button type="button" class="depthChartMarker${isSelected ? ' selected' : ''}" data-group="${escapeHtml(g.id)}"
        style="left:${g.x}%;top:${g.y}%;">${escapeHtml(g.label)}</button>`;
    }).join('');
    return `<div class="depthChartDiagram" data-section="${escapeHtml(section)}">${markers}</div>`;
  }

  // ---- Detail panel for whichever one marker is currently selected. ----
  function detailHtml(g, byNum) {
    if (!g) return '<div class="lbEmpty">Tap a position above to see who\'s listed there.</div>';
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

    const nudgeHtml = (g.x != null) ? `
      <div class="depthChartNudge">
        <span class="depthChartNudgeLabel">Reposition on diagram:</span>
        <div class="depthChartNudgeBtns">
          <button type="button" class="depthChartIconBtn" data-act="nudge" data-dx="-4" data-dy="0" title="Move left">←</button>
          <button type="button" class="depthChartIconBtn" data-act="nudge" data-dx="0" data-dy="-4" title="Move up">↑</button>
          <button type="button" class="depthChartIconBtn" data-act="nudge" data-dx="0" data-dy="4" title="Move down">↓</button>
          <button type="button" class="depthChartIconBtn" data-act="nudge" data-dx="4" data-dy="0" title="Move right">→</button>
        </div>
      </div>` : '';

    return `
      <div class="depthChartCard" data-group="${escapeHtml(g.id)}">
        <div class="depthChartCardTitle">
          <span>${escapeHtml(g.label)}</span>
          <button type="button" class="depthChartIconBtn depthChartRemoveBtn depthChartRemoveGroupBtn" data-act="removeGroup" title="Remove this position group">✕</button>
        </div>
        ${rowsHtml}${emptyHtml}
        <div class="depthChartAddRow">
          <select class="depthChartAddSel">
            <option value="">+ Add to ${escapeHtml(g.label)}…</option>
            ${options}
          </select>
        </div>
        ${nudgeHtml}
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
      if (SPATIAL_SECTIONS.includes(section)) {
        // Nathan: "down below are the players listed in the order when a
        // position is selected." Defaults to the first position so the
        // panel never opens on an empty "tap something" state when there's
        // an obvious first thing to show.
        if (!selectedByCategory[section] && sectionGroups.length) selectedByCategory[section] = sectionGroups[0].id;
        const selected = findGroup(selectedByCategory[section]);
        return `
          <div class="lbSectionHeader" style="margin-top:14px;">${escapeHtml(SECTION_LABELS[section])}</div>
          ${sectionGroups.length ? diagramHtml(section, sectionGroups) : '<div class="lbEmpty">No positions added yet.</div>'}
          ${detailHtml(selected, byNum)}
          ${sectionAddGroupHtml(section)}
        `;
      }
      // Special Teams -- plain list, unchanged from before (no field spot
      // for a single specialist role the way there is for an 11-man unit).
      return `
        <div class="lbSectionHeader" style="margin-top:14px;">${escapeHtml(SECTION_LABELS[section])}</div>
        ${!sectionGroups.length ? '<div class="lbEmpty">No positions added yet.</div>' : `<div class="depthChartGrid">${sectionGroups.map(g => detailHtml(g, byNum)).join('')}</div>`}
        ${sectionAddGroupHtml(section)}
      `;
    }).join('') + '<div id="depthChartStatus" class="lbSub" style="margin-top:10px;"></div>';

    wrap.querySelectorAll('.depthChartDiagram').forEach(diagram => {
      const section = diagram.getAttribute('data-section');
      diagram.querySelectorAll('.depthChartMarker').forEach(marker => {
        marker.addEventListener('click', () => {
          selectedByCategory[section] = marker.getAttribute('data-group');
          render();
        });
      });
    });
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
      card.querySelectorAll('[data-act="nudge"]').forEach(btn => {
        btn.addEventListener('click', () => nudgeGroup(groupId, Number(btn.getAttribute('data-dx')), Number(btn.getAttribute('data-dy'))));
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

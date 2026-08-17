// ---------------------------------------------------------------------------
// "This Week" -- Nathan: "when a coach logs in, they can click their profile
// and choose gameplan. They can write in a focus for the offense then choose
// 5-15 plays that will appear in the playbook for the week. Those plays will
// be featured or very important to the game plan." Then, mid-build: "coaches
// should be able to click their profile name and go to 'This Week' and they
// can add their 3 Keys to the week for all players to see."
//
// One shared team page, not per-coach (matches how the rest of the app's
// data -- Play Calls, Study Guide -- is already shared, not per-login).
// Any coach session can edit it; every signed-in player/coach sees the same
// read result. The 3 Keys + featured-play picker only render for a coach
// session; everyone else gets a read-only view of whatever's currently
// saved.
//
// Featured plays reuse the exact same family+direction numbering the Call
// Sheet PDF uses (see call-sheet-pdf.js's buildPlayNumberIndex) so a play
// picked here lines up with the number a coach already knows from the
// printed sheet -- recomputed locally off window.playbookLiveFamilies()
// (exposed by playbook-pdf.js) rather than duplicated data.
// ---------------------------------------------------------------------------
(function () {

  const THISWEEK_URL = `${FIREBASE_DB_URL}/thisWeek.json`;
  const SCHEDULE_URL = `${FIREBASE_DB_URL}/schedule.json`;
  const PRACTICES_URL = `${FIREBASE_DB_URL}/practices.json`;
  const MAX_PLAYS = 15;
  const MIN_RECOMMENDED = 5;
  const NUM_KEYS = 3;

  // Coach-name allowlist now lives in auth.js (window.isApprovedCoachProfile)
  // since Coach Tools / Drive Builder need the exact same check -- read-only
  // viewing here stays open to everyone regardless, this only gates the
  // editor.

  // Nathan: "We should be able to assign Weekly Goals and game plans to the
  // upcoming games so players can check them out and be prepared." This
  // Week stays the one shared page (not split per-game), but can now point
  // at a specific upcoming Schedule game via gameId -- shown as a link here,
  // and schedule.js pulls the same saved keys/plays onto that game's own
  // detail page when its id matches.
  let saved = { keys: ['', '', ''], plays: [], gameId: '', updatedAt: null };
  let pendingSelection = []; // coach's in-progress play selection: [{key, direction}]
  let pendingGameId = '';
  let upcomingGames = []; // light read-only copy of schedule.json for the game picker
  let upcomingPractices = []; // light read-only copy of practices.json for the Week Ahead write-up
  let loaded = false;

  function loadUpcomingGames() {
    return window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        upcomingGames = Array.isArray(data) ? data.filter(g => g && g.id) : [];
      })
      .catch(err => console.error('Could not load schedule for This Week game picker:', err));
  }
  // Own light copy rather than depending on js/practices.js's cache -- This
  // Week can render before the Schedule > Practices tab has ever been
  // opened, same reasoning as loadUpcomingGames() above.
  function loadUpcomingPractices() {
    return window.firebaseAuthed(PRACTICES_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        upcomingPractices = Array.isArray(data) ? data.filter(p => p && p.id) : [];
      })
      .catch(err => console.error('Could not load practices for This Week look-ahead:', err));
  }
  function gameLabel(g) {
    return `${g.homeAway === 'Away' ? '@' : 'vs'} ${g.opponent || 'TBD'}${g.date ? ' — ' + g.date : ''}`;
  }

  function resultFor(g) {
    if (g.ourScore === null || g.ourScore === undefined || g.oppScore === null || g.oppScore === undefined || g.ourScore === '' || g.oppScore === '') return null;
    const us = Number(g.ourScore), them = Number(g.oppScore);
    if (isNaN(us) || isNaN(them)) return null;
    if (us > them) return 'W'; if (us < them) return 'L'; return 'T';
  }
  // Same record math as js/schedule.js's bengalsRecord() -- duplicated
  // locally rather than reaching into that file's closure.
  function bengalsRecord(list) {
    let w = 0, l = 0, t = 0;
    (list || []).forEach(g => {
      const r = resultFor(g);
      if (r === 'W') w++; else if (r === 'L') l++; else if (r === 'T') t++;
    });
    if (w + l + t === 0) return '';
    return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
  }
  // Same fix as js/schedule.js/js/practices.js -- Game Time is a native
  // time picker storing 24hr "HH:MM"; this displays it as "6:00 PM".
  function to12h(str) {
    if (!str) return '';
    const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return str;
    let h = Number(m[1]);
    const min = m[2];
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${min} ${ap}`;
  }
  function joinList(items) {
    if (items.length === 1) return items[0];
    if (items.length === 2) return items.join(' and ');
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  // Nathan: "can we incorporate an AI generated look ahead for the team?"
  // then, after seeing a first pass: "week ahead write up is a little
  // weak, need more to it, written more like the game preview." Rewritten
  // to give each game its own full sentence (matchup, type, time,
  // location) the same way js/schedule.js's buildGamePreviewText does,
  // instead of a bare "Wed Scrimmage @ Clinton" list. Still fully
  // template-composed from Schedule's own data -- see the index.html
  // comment above #thisweekAheadBox for why (static, key-less site).
  function buildWeekAheadText(games, practices) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Nathan: "Football typically has Sunday as part of the prior weekdays
    // as prep. Monday through Sunday is the typical week." A plain
    // "today through today+6" rolling window doesn't match that -- viewed
    // on, say, a Wednesday, it spills a game on the following Tuesday into
    // "this week" while still correctly catching Sunday; but viewed later
    // in the week it can just as easily miss a Sunday game that's clearly
    // still part of the current football week. Anchor explicitly to the
    // most recent Monday through the following Sunday instead, so Sunday
    // always counts as the close of *this* week no matter what day of the
    // week this renders on.
    const dow = today.getDay(); // 0=Sun..6=Sat
    const mondayOffset = (dow + 6) % 7; // days since most recent Monday
    const start = new Date(today);
    start.setDate(start.getDate() - mondayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 6); // Sunday
    const toDateOnly = (dateStr) => {
      const parts = (dateStr || '').split('-').map(Number);
      if (parts.length !== 3 || parts.some(isNaN)) return null;
      return new Date(parts[0], parts[1] - 1, parts[2]);
    };
    const inWindow = (d) => d && d >= start && d <= end;
    const weekdayShort = (d) => d.toLocaleDateString(undefined, { weekday: 'short' });
    const weekdayFull = (d) => d.toLocaleDateString(undefined, { weekday: 'long' });

    const gameEntries = [];
    const practiceEntries = [];
    (games || []).forEach(g => {
      const d = toDateOnly(g.date);
      if (!inWindow(d)) return;
      gameEntries.push({ d, g });
    });
    (practices || []).forEach(p => {
      const d = toDateOnly(p.date);
      if (!inWindow(d)) return;
      practiceEntries.push({ d, p });
    });
    gameEntries.sort((a, b) => a.d - b.d);
    practiceEntries.sort((a, b) => a.d - b.d);

    if (!gameEntries.length && !practiceEntries.length) {
      return 'Nothing on the Schedule this week (Mon-Sun) yet -- once games or practices are added, they’ll show up here.';
    }

    const record = bengalsRecord(games);
    const recordPart = record ? ` (${record})` : '';
    const practiceCount = practiceEntries.filter(e => e.p.type !== 'film').length;
    const filmCount = practiceEntries.length - practiceCount;

    const sentences = [];

    // Opening line -- what's on tap this week, at a glance.
    const openParts = [];
    if (gameEntries.length) openParts.push(`${gameEntries.length} game${gameEntries.length !== 1 ? 's' : ''}`);
    if (practiceCount) openParts.push(`${practiceCount} practice${practiceCount !== 1 ? 's' : ''}`);
    if (filmCount) openParts.push(`${filmCount} film night${filmCount !== 1 ? 's' : ''}`);
    sentences.push(`The Bengals${recordPart} have ${openParts.length ? joinList(openParts) : 'nothing new'} on tap this week.`);

    // Practice/film-night days, grouped into one line rather than a
    // sentence per day.
    const practiceDays = practiceEntries.filter(e => e.p.type !== 'film').map(e => weekdayShort(e.d));
    const filmDays = practiceEntries.filter(e => e.p.type === 'film').map(e => weekdayShort(e.d));
    if (practiceDays.length) sentences.push(`Practice is set for ${joinList(practiceDays)}${filmDays.length ? `, with film night on ${joinList(filmDays)}` : ''}.`);
    else if (filmDays.length) sentences.push(`Film night is on ${joinList(filmDays)}.`);

    // One full sentence per game, same voice as the Game Preview on each
    // game's own Schedule page.
    gameEntries.forEach(({ d, g }) => {
      const verb = g.homeAway === 'Away' ? 'travel to face' : 'host';
      const typeWord = g.gameType === 'Playoff' ? 'Playoff game' : (g.gameType && g.gameType !== 'Regular Season' ? g.gameType : 'game');
      const timeStr = g.gameTime ? ` at ${to12h(g.gameTime)}` : '';
      const locPart = g.location ? ` at ${g.location}` : '';
      sentences.push(`On ${weekdayFull(d)}, the Bengals ${verb} ${g.opponent || 'TBD'} in a${/^[aeiou]/i.test(typeWord) ? 'n' : ''} ${typeWord}${timeStr}${locPart}.`);
    });

    return sentences.join(' ');
  }

  function renderWeekAhead() {
    const box = document.getElementById('thisweekAheadBox');
    const textEl = document.getElementById('thisweekAheadText');
    if (!box || !textEl) return;
    box.style.display = '';
    textEl.textContent = buildWeekAheadText(upcomingGames, upcomingPractices);
  }

  function numberedRows() {
    if (!window.playbookLiveFamilies || !window.DATA || !window.DATA.playTypes) return [];
    const families = window.playbookLiveFamilies();
    let n = 1;
    const rows = [];
    families.forEach(fam => {
      ['Left', 'Right'].forEach(direction => {
        rows.push({ number: n++, key: fam.key, label: fam.label, color: fam.color, direction });
      });
    });
    return rows;
  }

  function isSelected(row) {
    return pendingSelection.some(p => p.key === row.key && p.direction === row.direction);
  }

  // ---- Cloud load/save -- same firebaseAuthed()/fetch pattern as
  // play-calls.js's loadLiveEditsIntoData() and edit-plays.js's Save to
  // Cloud button. ----
  function loadThisWeek() {
    const statusEl = document.getElementById('thisweekCloudStatus');
    if (statusEl) statusEl.textContent = 'Loading this week’s page…';
    return window.firebaseAuthed(THISWEEK_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && typeof data === 'object') {
          const keys = Array.isArray(data.keys) ? data.keys.slice(0, NUM_KEYS) : [];
          while (keys.length < NUM_KEYS) keys.push('');
          saved = {
            keys,
            plays: Array.isArray(data.plays) ? data.plays.filter(p => p && p.key && p.direction) : [],
            gameId: data.gameId || '',
            updatedAt: data.updatedAt || null,
          };
        }
        pendingSelection = saved.plays.slice();
        pendingGameId = saved.gameId || '';
        if (statusEl) statusEl.textContent = '';
        return Promise.all([loadUpcomingGames(), loadUpcomingPractices()]);
      })
      .then(() => {
        renderReadOnly();
        renderEditor();
        renderWeekAhead();
      })
      .catch(err => {
        console.error('Could not load This Week:', err);
        if (statusEl) statusEl.textContent = 'Could not reach the cloud -- showing nothing set yet.';
      });
  }

  function saveThisWeek() {
    const saveBtn = document.getElementById('thisweekSaveBtn');
    const statusEl = document.getElementById('thisweekCloudStatus');
    const keys = [];
    for (let i = 0; i < NUM_KEYS; i++) {
      const el = document.getElementById(`thisweekKeyInput${i}`);
      keys.push(el ? el.value.trim() : '');
    }
    const payload = { keys, plays: pendingSelection.slice(), gameId: pendingGameId || '', updatedAt: new Date().toISOString() };
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
    window.firebaseAuthed(THISWEEK_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })).then(r => {
      if (r.ok) {
        saved = payload;
        if (statusEl) statusEl.textContent = 'Saved -- this is what the team sees now.';
        if (saveBtn) saveBtn.textContent = 'Saved!';
        renderReadOnly();
      } else {
        if (statusEl) statusEl.textContent = `Save failed (HTTP ${r.status}).`;
        if (saveBtn) saveBtn.textContent = 'Save Failed';
      }
      setTimeout(() => { if (saveBtn) { saveBtn.textContent = 'Save This Week'; saveBtn.disabled = false; } }, 2200);
    }).catch(err => {
      console.error('This Week save failed:', err);
      if (statusEl) statusEl.textContent = `Save failed: ${err.message}`;
      if (saveBtn) { saveBtn.textContent = 'Save Failed'; saveBtn.disabled = false; }
      setTimeout(() => { if (saveBtn) saveBtn.textContent = 'Save This Week'; }, 2200);
    });
  }

  // ---- Read-only view: everyone sees this ----
  function makeStaticCard(row) {
    const wrap = document.createElement('div');
    wrap.className = 'gameplanCard';
    const label = document.createElement('div');
    label.className = 'gameplanCardLabel';
    label.style.color = row.color;
    label.textContent = `#${row.number} · ${row.label} • ${row.direction}`;
    wrap.appendChild(label);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'gameplanCardSvg');
    wrap.appendChild(svg);
    if (window.renderCardDiagram && window.DATA) {
      const playType = window.DATA.playTypes.find(p => p.key === row.key);
      const def = (window.playbookDefaultSubvariant && playType) ? window.playbookDefaultSubvariant(playType) : { io: null, rp: null };
      window.renderCardDiagram(svg, row.key, row.direction, row.direction, null, '4x4', def.io, false, false, def.rp);
    }
    return wrap;
  }

  function renderReadOnly() {
    const emptyEl = document.getElementById('thisweekEmptyState');
    const keysBox = document.getElementById('thisweekKeysBox');
    const keysList = document.getElementById('thisweekKeysList');
    const gridEl = document.getElementById('thisweekCardsGrid');
    const gameLinkEl = document.getElementById('thisweekGameLink');
    if (!keysBox || !keysList || !gridEl) return;

    if (gameLinkEl) {
      const game = saved.gameId ? upcomingGames.find(g => g.id === saved.gameId) : null;
      if (game) {
        gameLinkEl.style.display = '';
        gameLinkEl.textContent = `🏈 This week's game: ${gameLabel(game)} ›`;
        gameLinkEl.onclick = () => { if (window.openScheduleGame) window.openScheduleGame(game.id); };
      } else {
        gameLinkEl.style.display = 'none';
      }
    }

    const realKeys = (saved.keys || []).map(k => (k || '').trim()).filter(Boolean);
    const hasContent = realKeys.length > 0 || (saved.plays && saved.plays.length > 0);
    if (emptyEl) emptyEl.style.display = hasContent ? 'none' : '';

    keysBox.style.display = realKeys.length ? '' : 'none';
    keysList.innerHTML = '';
    realKeys.forEach(k => {
      const li = document.createElement('li');
      li.textContent = k;
      keysList.appendChild(li);
    });

    gridEl.innerHTML = '';
    const rows = numberedRows();
    (saved.plays || []).forEach(sel => {
      const row = rows.find(r => r.key === sel.key && r.direction === sel.direction);
      if (row) gridEl.appendChild(makeStaticCard(row));
    });
  }

  // ---- Coach editor ----
  function renderEditor() {
    const section = document.getElementById('thisweekEditSection');
    if (!section) return;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    section.style.display = approved ? '' : 'none';
    if (!approved) return;

    for (let i = 0; i < NUM_KEYS; i++) {
      const el = document.getElementById(`thisweekKeyInput${i}`);
      if (el && document.activeElement !== el) el.value = (saved.keys && saved.keys[i]) || '';
    }

    const gameSelect = document.getElementById('thisweekGameSelect');
    if (gameSelect && document.activeElement !== gameSelect) {
      gameSelect.innerHTML = '';
      const blankOpt = document.createElement('option');
      blankOpt.value = ''; blankOpt.textContent = 'No game linked';
      gameSelect.appendChild(blankOpt);
      upcomingGames.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id; opt.textContent = gameLabel(g);
        if (g.id === pendingGameId) opt.selected = true;
        gameSelect.appendChild(opt);
      });
      gameSelect.value = pendingGameId || '';
      gameSelect.onchange = () => { pendingGameId = gameSelect.value; };
    }

    const pickerGrid = document.getElementById('thisweekPickerGrid');
    const countEl = document.getElementById('thisweekPickerCount');
    if (!pickerGrid) return;
    pickerGrid.innerHTML = '';
    numberedRows().forEach(row => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gameplanChip' + (isSelected(row) ? ' active' : '');
      chip.style.setProperty('--chip-color', row.color);
      chip.textContent = `#${row.number} ${row.label} • ${row.direction}`;
      chip.addEventListener('click', () => {
        const idx = pendingSelection.findIndex(p => p.key === row.key && p.direction === row.direction);
        if (idx >= 0) {
          pendingSelection.splice(idx, 1);
        } else {
          if (pendingSelection.length >= MAX_PLAYS) {
            alert(`Featured plays are capped at ${MAX_PLAYS} -- remove one first.`);
            return;
          }
          pendingSelection.push({ key: row.key, direction: row.direction });
        }
        renderEditor();
      });
      pickerGrid.appendChild(chip);
    });
    if (countEl) {
      const n = pendingSelection.length;
      countEl.textContent = `Featured plays — ${n} selected (aim for ${MIN_RECOMMENDED}-${MAX_PLAYS})`;
      countEl.style.color = (n > MAX_PLAYS) ? '#e0201a' : '';
    }
  }

  // Reused by schedule.js to show this same week's featured plays inline on
  // the linked game's own detail page, without duplicating the diagram
  // rendering logic.
  window.renderFeaturedPlayCards = function (wrapEl, plays) {
    if (!wrapEl) return;
    wrapEl.innerHTML = '';
    const rows = numberedRows();
    (plays || []).forEach(sel => {
      const row = rows.find(r => r.key === sel.key && r.direction === sel.direction);
      if (row) wrapEl.appendChild(makeStaticCard(row));
    });
  };

  let controlsWired = false;
  function wireEditorControls() {
    if (controlsWired) return;
    controlsWired = true;
    const saveBtn = document.getElementById('thisweekSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveThisWeek);
  }

  window.initThisWeek = function () {
    wireEditorControls();
    if (!loaded) {
      loaded = true;
      loadThisWeek();
    } else {
      renderReadOnly();
      renderEditor();
      renderWeekAhead();
    }
  };
})();

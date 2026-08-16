// ---------------------------------------------------------------------------
// Shared game stat sheet editor -- the Roster / Rushing / Passing /
// Receiving / Kickoffs / Tackles / Defensive Extra / Turnovers UI, extracted
// out of schedule.js so it can be reused for a standalone "draft" stat sheet
// in Coach Tools (Nathan: "Print and input the stats for to then assign to a
// game" -- a coach may want to start tracking a game's stats before that
// game even has a Schedule entry yet, then attach the finished sheet to one
// afterward). Both schedule.js (a specific game's statSheet) and
// coachtools-print.js (a not-yet-assigned draft statSheet) call the same
// window.renderGameStatSheet(wrap, statSheet, readOnly) -- one
// implementation, two callers, no drift between "the game version" and "the
// draft version."
//
// statSheet IS the live source of truth for whichever object owns it (mutate
// directly, re-render on structural add/remove -- same pattern as Drive
// Builder's play list); this file never persists anything itself, that's
// each caller's job.
// ---------------------------------------------------------------------------
(function () {

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
  window.normalizeGameStatSheet = normalizeStatSheet;

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function statSheetHasAnything(ss) {
    return ss.roster.length || ATTEMPT_SECTIONS.some(s => ss[s.key].length) || ss.tackles.length || ss.defExtra.length || ss.turnovers.length;
  }
  window.gameStatSheetHasAnything = statSheetHasAnything;

  // wrap: a DOM element to render into. statSheet: the data object (mutated
  // in place). readOnly: hide all editing controls.
  window.renderGameStatSheet = function renderGameStatSheet(wrap, statSheet, readOnly) {
    if (!wrap || !statSheet) return;
    const ss = statSheet;
    const rerender = () => renderGameStatSheet(wrap, statSheet, readOnly);

    function rosterName(num) {
      const p = (ss.roster || []).find(r => String(r.num) === String(num));
      return p ? p.name : '';
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
      (ss.roster || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.num;
        opt.textContent = `#${p.num} ${p.name}`;
        sel.appendChild(opt);
      });
      return sel;
    }

    // ---- Roster ----
    function renderRoster() {
      const box = document.createElement('div');
      box.className = 'statsRosterBox';
      const roster = ss.roster;

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
          rm.addEventListener('click', () => { roster.splice(i, 1); rerender(); });
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
          rerender();
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

    function renderAttemptSection(cfg) {
      const box = document.createElement('div');
      box.className = 'attemptSectionBox';
      const rows = ss[cfg.key];

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
        rowData.attempts.forEach(a => {
          const cell = document.createElement('div');
          cell.className = 'attemptBox' + (cfg.allowFD && a.fd ? ' fd' : '') + (cfg.passingMode && !a.comp ? ' incomplete' : '');
          cell.textContent = cfg.passingMode && !a.comp ? '-' : (a.yds === '' || a.yds === null || a.yds === undefined ? '' : a.yds);
          if (!readOnly && cfg.allowFD) {
            cell.title = 'Tap to mark/unmark 1st down';
            cell.addEventListener('click', () => { a.fd = !a.fd; rerender(); });
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
            rerender();
          }
          input.addEventListener('keydown', e => { if (e.key === 'Enter') commitAttempt(); });
          const addBtn = document.createElement('button');
          addBtn.type = 'button'; addBtn.className = 'statsSmallBtn'; addBtn.textContent = '+';
          addBtn.addEventListener('click', commitAttempt);
          const undoBtn = document.createElement('button');
          undoBtn.type = 'button'; undoBtn.className = 'statsSmallBtn'; undoBtn.textContent = '↺';
          undoBtn.title = 'Remove last attempt';
          undoBtn.addEventListener('click', () => { rowData.attempts.pop(); rerender(); });
          const rmRowBtn = document.createElement('button');
          rmRowBtn.type = 'button'; rmRowBtn.className = 'statsRmBtn'; rmRowBtn.textContent = '✕ Row';
          rmRowBtn.addEventListener('click', () => { rows.splice(rowIdx, 1); rerender(); });
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
          rerender();
        });
        pickWrap.appendChild(sel); pickWrap.appendChild(addRowBtn);
        box.appendChild(pickWrap);
      }
      return box;
    }

    // ---- Tackles (solo = full box, assisted = half box) ----
    function renderTackles() {
      const box = document.createElement('div');
      box.className = 'attemptSectionBox';
      const rows = ss.tackles;

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
            cell.addEventListener('click', () => { rowData.marks.splice(mIdx, 1); rerender(); });
          }
          boxesWrap.appendChild(cell);
        });

        if (!readOnly) {
          const addWrap = document.createElement('span');
          addWrap.className = 'attemptAddWrap';
          const soloBtn = document.createElement('button');
          soloBtn.type = 'button'; soloBtn.className = 'statsSmallBtn'; soloBtn.textContent = '+ Solo';
          soloBtn.addEventListener('click', () => { rowData.marks.push('solo'); rerender(); });
          const astBtn = document.createElement('button');
          astBtn.type = 'button'; astBtn.className = 'statsSmallBtn'; astBtn.textContent = '+ Ast';
          astBtn.addEventListener('click', () => { rowData.marks.push('assist'); rerender(); });
          const rmRowBtn = document.createElement('button');
          rmRowBtn.type = 'button'; rmRowBtn.className = 'statsRmBtn'; rmRowBtn.textContent = '✕ Row';
          rmRowBtn.addEventListener('click', () => { rows.splice(rowIdx, 1); rerender(); });
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
          rerender();
        });
        pickWrap.appendChild(sel); pickWrap.appendChild(addRowBtn);
        box.appendChild(pickWrap);
      }
      return box;
    }

    // ---- Defensive Extra: INT / Pass Breakups / Sacks -- simple
    // per-defender counters (rare, discrete events -- not worth a whole
    // attempt grid). ----
    function renderDefExtra() {
      const box = document.createElement('div');
      const rows = ss.defExtra;
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
          rmBtn.addEventListener('click', () => { rows.splice(i, 1); rerender(); });
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
          rerender();
        });
        pickWrap.appendChild(sel); pickWrap.appendChild(addRowBtn);
        box.appendChild(pickWrap);
      }
      return box;
    }

    // ---- Turnovers: free-write numbered log ("write in a number and what
    // they did") -- not tied to the roster, just a running list. ----
    function renderTurnovers() {
      const box = document.createElement('div');
      const rows = ss.turnovers;
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
          rm.addEventListener('click', () => { rows.splice(i, 1); rerender(); });
          row.appendChild(rm);
        }
        list.appendChild(row);
      });
      box.appendChild(list);
      if (!readOnly) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button'; addBtn.className = 'lbLinkBtn'; addBtn.style.marginTop = '6px';
        addBtn.textContent = '+ Add Turnover';
        addBtn.addEventListener('click', () => { rows.push({ desc: '' }); rerender(); });
        box.appendChild(addBtn);
      }
      return box;
    }

    // ---- Assemble ----
    wrap.innerHTML = '';
    if (readOnly) {
      if (!statSheetHasAnything(ss)) {
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
    wrap.appendChild(renderRoster());

    ATTEMPT_SECTIONS.forEach(cfg => {
      if (readOnly && !ss[cfg.key].length) return;
      wrap.appendChild(sectionHeading(cfg.title));
      wrap.appendChild(renderAttemptSection(cfg));
    });

    if (!readOnly || ss.tackles.length) {
      wrap.appendChild(sectionHeading('💥 Tackles'));
      wrap.appendChild(renderTackles());
    }

    if (!readOnly || ss.defExtra.length) {
      wrap.appendChild(sectionHeading('🛡️ Defensive Extra (INT / Pass Breakups / Sacks)'));
      wrap.appendChild(renderDefExtra());
    }

    if (!readOnly || ss.turnovers.length) {
      wrap.appendChild(sectionHeading('🔁 Turnovers'));
      wrap.appendChild(renderTurnovers());
    }
  };
})();

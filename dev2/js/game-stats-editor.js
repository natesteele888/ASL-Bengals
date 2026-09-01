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

  // Nathan: "I want to see state with tendencies, where do we run, who runs
  // where, etc." Rushing attempts (only) also tag a run direction
  // (Left/Middle/Right) so Coach Tools > Stats can build a Tendencies
  // breakdown -- kept off Passing/Receiving/Kickoffs to not clutter entry
  // for stats where "direction" isn't the interesting question.
  const RUN_DIRECTIONS = ['Left', 'Middle', 'Right'];
  // Nathan: "Need the ability to show where on the field the ball is at all
  // times so it would tell momentum in the game" + "Ability to go back and
  // add 'plays called' ... to go along with the play result." Both only
  // make sense for actual snaps from scrimmage -- Kickoffs already jump the
  // ball a long way by definition (return yardage, not a normal down), so
  // it's excluded from both, same reasoning allowFD already excludes it for.
  const ATTEMPT_SECTIONS = [
    { key: 'rushing', title: '🏃 Rushing', allowFD: true, passingMode: false, trackDirection: true, trackFieldPosition: true, trackPlayCall: true },
    { key: 'passing', title: '🎯 Passing', allowFD: true, passingMode: true, trackFieldPosition: true, trackPlayCall: true },
    { key: 'receiving', title: '🙌 Receiving', allowFD: true, passingMode: false, trackFieldPosition: true, trackPlayCall: true },
    { key: 'kickoffs', title: '🦵 Kickoffs', allowFD: false, passingMode: false },
  ];
  window.gameStatAttemptSections = ATTEMPT_SECTIONS;
  window.runDirections = RUN_DIRECTIONS;

  // ---- Field position (Nathan: "show where on the field the ball is at
  // all times ... momentum in the game") ----
  // Same 0-100 absolute-scale convention as _stat-keeper-prototype's
  // absoluteSpot(): 0 = our own goal line, 100 = the opponent's, so two
  // spots can always be compared/subtracted for real net yardage regardless
  // of which side of the field they're on.
  function absoluteSpot(side, yard) {
    if (!side || yard === '' || yard == null) return null;
    const y = Number(yard);
    if (isNaN(y)) return null;
    return side === 'OWN' ? y : (100 - y);
  }
  function ballPositionLabel(spot) {
    if (spot === null || spot === undefined || isNaN(spot)) return 'Not set';
    const r = Math.round(spot);
    if (r === 50) return 'Midfield';
    return r < 50 ? `OWN ${r}` : `OPP ${100 - r}`;
  }

  // ---- Play called (Nathan: "add 'plays called' and 'plays executed' to
  // go along with the play result") ----
  // Reuses the exact same {key, direction} shape/catalog js/drivebuilder.js
  // already picks real plays from (window.DATA.playTypes via
  // window.playbookLiveFamilies) -- this is a real link to a named play
  // from the playbook, not free text. Same "each file keeps its own tiny
  // copy of this numbering, no shared export" house rule drivebuilder.js's
  // own comment already documents (js/thisweek.js and js/call-sheet-pdf.js
  // do the same).
  function playCallOptions() {
    if (!window.playbookLiveFamilies || !window.DATA || !window.DATA.playTypes) return [];
    const families = window.playbookLiveFamilies();
    const out = [];
    families.forEach(fam => {
      ['Left', 'Right'].forEach(direction => out.push({ key: fam.key, direction, label: `${fam.label} • ${direction}` }));
    });
    return out;
  }
  function playCallLabelFor(pc) {
    if (!pc || !pc.key) return '';
    const families = window.playbookLiveFamilies ? window.playbookLiveFamilies() : [];
    const fam = families.find(f => f.key === pc.key);
    return fam ? `${fam.label}${pc.direction ? ' • ' + pc.direction : ''}` : pc.key;
  }

  // Nathan: "I need these stats to load into the live season" -- Stat Keeper
  // (a standalone prototype) tracks several categories the live app never
  // had a place for: penalties, punts/punt returns, PAT/2pt/safety scoring,
  // forced punts, and opponent passing allowed. Added here so a game record
  // can hold them; js/statkeeper-import.js is what actually fills them in.
  function blankStatSheet() {
    return {
      roster: [], rushing: [], passing: [], receiving: [], kickoffs: [], tackles: [], defExtra: [], turnovers: [],
      penalties: [], punts: [], puntReturns: [],
      scoring: { patGood: 0, patNoGood: 0, twoPtGood: 0, twoPtNoGood: 0, safety: 0 },
      penaltyTotals: { us: { count: 0, yds: 0 }, opponent: { count: 0, yds: 0 } },
      onside: { us: 0, opponent: 0 },
      oppPassing: { att: 0, comp: 0, yds: 0 },
      forcedPunts: 0,
    };
  }
  // Array fields get replaced wholesale if missing/malformed (matches the
  // original behavior); object/number fields get filled in key-by-key so a
  // partially-old record (missing only the newer fields) doesn't lose
  // whatever it already had.
  function normalizeStatSheet(s) {
    const blank = blankStatSheet();
    if (!s || typeof s !== 'object') return blank;
    Object.keys(blank).forEach(k => {
      const def = blank[k];
      if (Array.isArray(def)) {
        if (!Array.isArray(s[k])) s[k] = def;
      } else if (typeof def === 'number') {
        if (typeof s[k] !== 'number') s[k] = def;
      } else if (def && typeof def === 'object') {
        if (!s[k] || typeof s[k] !== 'object') s[k] = JSON.parse(JSON.stringify(def));
        else Object.keys(def).forEach(k2 => {
          if (def[k2] && typeof def[k2] === 'object') {
            if (!s[k][k2] || typeof s[k][k2] !== 'object') s[k][k2] = JSON.parse(JSON.stringify(def[k2]));
          } else if (s[k][k2] === undefined) {
            s[k][k2] = def[k2];
          }
        });
      }
    });
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

  // Nathan: "I need the option on the coaching side to create a roster with
  // positions, # and so on so they can be auto-assigned to games to add
  // their stats." The first time a stat sheet's roster is empty and hasn't
  // been seeded yet, pull every player straight from the team roster
  // (js/roster.js) instead of making a coach retype names/numbers per game.
  // ss._rosterSeeded remembers this happened so removing a player (e.g. an
  // injury, a player who didn't play) doesn't just come back on next render.
  function seedRosterFromTeam(ss) {
    if (ss._rosterSeeded || ss.roster.length) return;
    const team = window.getTeamRosterCached ? window.getTeamRosterCached() : [];
    if (!team.length) return;
    ss.roster = team.slice().sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0))
      .map(p => ({ num: p.num, name: p.name, position: p.position || '' }));
    ss._rosterSeeded = true;
  }

  // wrap: a DOM element to render into. statSheet: the data object (mutated
  // in place). readOnly: hide all editing controls.
  window.renderGameStatSheet = function renderGameStatSheet(wrap, statSheet, readOnly) {
    if (!wrap || !statSheet) return;
    const ss = statSheet;
    if (!readOnly) seedRosterFromTeam(ss);
    const rerender = () => renderGameStatSheet(wrap, statSheet, readOnly);

    function rosterName(num) {
      const p = (ss.roster || []).find(r => String(r.num) === String(num));
      return p ? p.name : '';
    }
    // Flags an EXISTING row whose number is shared by more than one
    // roster player -- e.g. an already-imported row from before the
    // Jaiden L / Dean A jersey-number collision was caught. The row can't
    // say for certain which of them it belongs to, so this just makes
    // that visible instead of silently showing whichever one happens to
    // match first.
    function rosterNameDisplay(num) {
      const name = rosterName(num);
      const key = num === null || num === undefined ? '' : String(num);
      const count = (ss.roster || []).filter(r => String(r.num === null || r.num === undefined ? '' : r.num) === key).length;
      if (count > 1) return `${name || '(unknown)'} ⚠️ shared #${num || '(no #)'} -- could be a different player`;
      return name;
    }
    function sectionHeading(text) {
      const h = document.createElement('div');
      h.className = 'statsGroupHeading';
      h.textContent = text;
      return h;
    }
    // Nathan: "The stats mistakenly have Jaiden L with the receiving
    // yards. Dean A had the 16 yards." Root cause: every stat row is keyed
    // by jersey NUMBER, but several roster players legitimately have no
    // number yet -- so two blank-number players (or, in principle, two
    // players who were accidentally given the same real number) collapse
    // onto the exact same row, and whichever one happens to come first in
    // the roster "wins" the display name. There's no safe way to add a
    // stat row for a player whose number collides with someone else's --
    // the row itself couldn't tell them apart afterward -- so those
    // options are disabled here rather than just warned about, same fix
    // applied to the Stat Keeper import/push translators.
    function pickerSelect(placeholder) {
      const sel = document.createElement('select');
      sel.className = 'statsRosterPicker';
      const numCounts = {};
      (ss.roster || []).forEach(p => {
        const key = p.num === null || p.num === undefined ? '' : String(p.num);
        numCounts[key] = (numCounts[key] || 0) + 1;
      });
      const opt0 = document.createElement('option');
      opt0.value = ''; opt0.textContent = placeholder;
      sel.appendChild(opt0);
      (ss.roster || []).forEach(p => {
        const key = p.num === null || p.num === undefined ? '' : String(p.num);
        const ambiguous = (numCounts[key] || 0) > 1;
        const opt = document.createElement('option');
        opt.value = p.num;
        opt.textContent = ambiguous
          ? `#${p.num || '(no #)'} ${p.name} — fix jersey # first (shared with another player)`
          : `#${p.num} ${p.name}`;
        if (ambiguous) opt.disabled = true;
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

        // Team roster grew after this game's roster was seeded (new player
        // joined mid-season) -- offer to pull in anyone missing rather than
        // making the coach retype them.
        const team = window.getTeamRosterCached ? window.getTeamRosterCached() : [];
        const missing = team.filter(t => !roster.some(r => String(r.num) === String(t.num)));
        if (missing.length) {
          const syncBtn = document.createElement('button');
          syncBtn.type = 'button'; syncBtn.className = 'lbLinkBtn'; syncBtn.style.display = 'block'; syncBtn.style.marginTop = '4px';
          syncBtn.textContent = `+ Add ${missing.length} player${missing.length === 1 ? '' : 's'} from team roster`;
          syncBtn.addEventListener('click', () => {
            missing.forEach(t => roster.push({ num: t.num, name: t.name, position: t.position || '' }));
            rerender();
          });
          box.appendChild(syncBtn);
        }
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
        label.textContent = `#${rowData.num}${rosterName(rowData.num) ? ' ' + rosterNameDisplay(rowData.num) : ''}`;
        rowEl.appendChild(label);

        const boxesWrap = document.createElement('div');
        boxesWrap.className = 'attemptBoxesWrap';
        rowData.attempts.forEach(a => {
          const cell = document.createElement('div');
          cell.className = 'attemptBox' + (cfg.allowFD && a.fd ? ' fd' : '') + (cfg.passingMode && !a.comp ? ' incomplete' : '');
          cell.textContent = cfg.passingMode && !a.comp ? '-' : (a.yds === '' || a.yds === null || a.yds === undefined ? '' : a.yds);
          // Nathan: "plays called" + "show where on the field the ball is"
          // -- both ride along in this same hover tooltip rather than more
          // visible tags, so a play entered before this feature existed (or
          // one where the coach skipped the optional play-call picker)
          // looks exactly the same as it always did.
          const infoParts = [];
          if (cfg.trackDirection && a.dir) infoParts.push(a.dir);
          if (a.fd) infoParts.push('1st down');
          if (a.playCall) { const lbl = playCallLabelFor(a.playCall); if (lbl) infoParts.push(`Called: ${lbl}`); }
          if (cfg.trackFieldPosition && a.spot != null) infoParts.push(`Ball at ${ballPositionLabel(a.spot)}`);
          if (infoParts.length) cell.title = `${a.yds ?? 0} yds — ${infoParts.join(' — ')}`;
          if (cfg.trackDirection && a.dir) {
            const tag = document.createElement('span');
            tag.className = 'attemptBoxDirTag';
            tag.textContent = a.dir[0];
            cell.appendChild(tag);
          }
          if (!readOnly && cfg.allowFD) {
            cell.title = (cell.title ? cell.title + ' — ' : '') + 'Tap to mark/unmark 1st down';
            cell.addEventListener('click', () => { a.fd = !a.fd; rerender(); });
          }
          // Touchdown badge -- separate tap target (stops propagation so it
          // doesn't also toggle 1st down) since Stat Keeper imports carry a
          // per-play td flag and a coach entering stats by hand should be
          // able to mark one too.
          if (a.td || !readOnly) {
            const tdTag = document.createElement('span');
            tdTag.className = 'attemptBoxTdTag' + (a.td ? ' on' : '');
            tdTag.textContent = 'TD';
            tdTag.title = 'Tap to mark/unmark touchdown';
            if (!readOnly) {
              tdTag.addEventListener('click', (e) => { e.stopPropagation(); a.td = !a.td; rerender(); });
            }
            cell.appendChild(tdTag);
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
          let dirSelect = null;
          if (cfg.trackDirection) {
            dirSelect = document.createElement('select');
            dirSelect.className = 'statsSmallBtn';
            RUN_DIRECTIONS.forEach(d => {
              const opt = document.createElement('option');
              opt.value = d; opt.textContent = d;
              if (d === (rowData._lastDir || 'Middle')) opt.selected = true;
              dirSelect.appendChild(opt);
            });
          }
          // Nathan: "Ability to go back and add 'plays called' ... to go
          // along with the play result." Optional -- a coach entering
          // stats quickly can skip it and it just stays untagged, same as
          // direction/FD/TD are all optional today.
          let playCallSelect = null;
          if (cfg.trackPlayCall) {
            const options = playCallOptions();
            if (options.length) {
              playCallSelect = document.createElement('select');
              playCallSelect.className = 'statsSmallBtn';
              const blankOpt = document.createElement('option');
              blankOpt.value = ''; blankOpt.textContent = 'Play called (optional)';
              playCallSelect.appendChild(blankOpt);
              options.forEach(o => {
                const opt = document.createElement('option');
                opt.value = `${o.key}|${o.direction}`; opt.textContent = o.label;
                playCallSelect.appendChild(opt);
              });
            }
          }
          function commitAttempt() {
            const raw = input.value.trim();
            if (raw === '') return;
            const dir = dirSelect ? dirSelect.value : undefined;
            if (dir) rowData._lastDir = dir;
            let playCall = null;
            if (playCallSelect && playCallSelect.value) {
              const [key, direction] = playCallSelect.value.split('|');
              playCall = { key, direction };
            }
            // Nathan: "show where on the field the ball is at all times" --
            // spot is the line of scrimmage BEFORE this play (the shared
            // "Ball Position" control above the Rushing section, kept live
            // on ss._currentLos so it survives the full rerender() this
            // file does after every commit). seq is a simple incrementing
            // counter so a later chart can put every rushing/passing/
            // receiving play from the whole game back in true chronological
            // order -- statSheet is otherwise organized by player, not by
            // time, so without this there'd be no way to tell whose play
            // came before whose.
            let spot = null, seq;
            if (cfg.trackFieldPosition) {
              spot = ss._currentLos != null ? ss._currentLos : null;
              seq = ss._nextSeq || 1;
              ss._nextSeq = seq + 1;
            }
            const extra = {};
            if (playCall) extra.playCall = playCall;
            if (cfg.trackFieldPosition) { extra.spot = spot; extra.seq = seq; }
            if (cfg.passingMode) {
              if (raw === '-') rowData.attempts.push(Object.assign({ yds: null, comp: false, fd: false }, extra));
              else { const n = Number(raw); if (!isNaN(n)) rowData.attempts.push(Object.assign({ yds: n, comp: true, fd: false }, extra)); }
            } else {
              const n = Number(raw);
              if (!isNaN(n)) rowData.attempts.push(Object.assign(dir ? { yds: n, fd: false, dir } : { yds: n, fd: false }, extra));
            }
            // Only real yardage (not an incomplete pass) actually moves the
            // ball -- clamped to the field's ends so a long TD run can't
            // push the tracker past 100/below 0.
            if (cfg.trackFieldPosition && spot != null) {
              const n = Number(raw);
              if (!isNaN(n)) ss._currentLos = Math.max(0, Math.min(100, spot + n));
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
          undoBtn.addEventListener('click', () => {
            const removed = rowData.attempts.pop();
            // Put the "Ball Position" tracker back where it was before that
            // play, not just wherever it ended up -- otherwise an undo
            // right after a big run would leave the next play defaulting
            // to the WRONG (already-advanced) spot.
            if (removed && cfg.trackFieldPosition && removed.spot != null) ss._currentLos = removed.spot;
            rerender();
          });
          const rmRowBtn = document.createElement('button');
          rmRowBtn.type = 'button'; rmRowBtn.className = 'statsRmBtn'; rmRowBtn.textContent = '✕ Row';
          rmRowBtn.addEventListener('click', () => { rows.splice(rowIdx, 1); rerender(); });
          addWrap.appendChild(input);
          if (dirSelect) addWrap.appendChild(dirSelect);
          addWrap.appendChild(addBtn); addWrap.appendChild(undoBtn); addWrap.appendChild(rmRowBtn);
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

    // Nathan: "Need the ability to show where on the field the ball is at
    // all times." One shared control (not per-player, not per-section --
    // there's only one ball) shown once, above Rushing/Passing/Receiving,
    // for overriding ss._currentLos -- start of the game, after a kickoff
    // return, a turnover, a punt, or the start of any new drive. Every
    // normal committed play (see commitAttempt above) auto-advances it, so
    // this is a rare override, not a per-play requirement.
    function renderBallPositionControl() {
      const box = document.createElement('div');
      box.className = 'attemptSectionBox';
      box.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
      const label = document.createElement('span');
      label.className = 'lbSub';
      label.style.margin = '0';
      label.textContent = `Currently: ${ballPositionLabel(ss._currentLos)}`;
      box.appendChild(label);
      const sideSel = document.createElement('select');
      sideSel.className = 'statsSmallBtn';
      ['OWN', 'OPP'].forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sideSel.appendChild(o); });
      const yardInput = document.createElement('input');
      yardInput.type = 'number'; yardInput.min = '0'; yardInput.max = '50'; yardInput.placeholder = 'Yard line';
      yardInput.className = 'attemptAddInput'; yardInput.style.width = '80px';
      const setBtn = document.createElement('button');
      setBtn.type = 'button'; setBtn.className = 'statsSmallBtn'; setBtn.textContent = 'Set';
      setBtn.addEventListener('click', () => {
        const spot = absoluteSpot(sideSel.value, yardInput.value);
        if (spot == null) return;
        ss._currentLos = spot;
        rerender();
      });
      box.appendChild(sideSel); box.appendChild(yardInput); box.appendChild(setBtn);
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
        label.textContent = `#${rowData.num}${rosterName(rowData.num) ? ' ' + rosterNameDisplay(rowData.num) : ''}`;
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
      table.innerHTML = `<thead><tr><th>#</th><th>Name</th><th>INT</th><th>PBU</th><th>Sacks</th><th>FR</th><th>TD</th>${readOnly ? '' : '<th></th>'}</tr></thead>`;
      const tbody = document.createElement('tbody');
      rows.forEach((r, i) => {
        const tr = document.createElement('tr');
        const numTd = document.createElement('td'); numTd.textContent = r.num; numTd.className = 'statsIdentityCell';
        const nameTd = document.createElement('td'); nameTd.textContent = rosterNameDisplay(r.num) || '—'; nameTd.className = 'statsIdentityCell';
        tr.appendChild(numTd); tr.appendChild(nameTd);
        ['int', 'pbu', 'sacks', 'fum'].forEach(field => {
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
        // Touchdown (e.g. a defensive/special-teams score off this INT/fumble)
        // -- same clickable-tag pattern as the attempt-grid TD toggle, since
        // there's no native checkbox styling elsewhere in this file.
        const tdCell = document.createElement('td');
        tdCell.style.position = 'relative'; // .attemptBoxTdTag is absolutely positioned
        if (r.td || !readOnly) {
          const tdTag = document.createElement('span');
          tdTag.className = 'attemptBoxTdTag' + (r.td ? ' on' : '');
          tdTag.textContent = 'TD';
          tdTag.title = 'Tap to mark/unmark touchdown';
          if (!readOnly) {
            tdTag.addEventListener('click', () => { r.td = !r.td; rerender(); });
          }
          tdCell.appendChild(tdTag);
        }
        tr.appendChild(tdCell);
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
          rows.push({ num: sel.value, int: 0, pbu: 0, sacks: 0, fum: 0, td: false });
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

    if (!readOnly) {
      wrap.appendChild(sectionHeading('📍 Ball Position'));
      wrap.appendChild(renderBallPositionControl());
    }

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

// ---------------------------------------------------------------------------
// Drive Builder -- Nathan: "I want to have a Drive Builder for coaches where
// they can select either a goal such as run the ball for 30 yards, have a
// series of plays ready to go." No yardage/outcome data is tracked per play
// yet (Stats is a separate, still-pending feature), so a real goal-driven
// generator has nothing real to calculate from -- Nathan chose manual drive
// scripting instead (see the AskUserQuestion in this session): build/name
// an ordered list of plays for a drive or situation ahead of time (an
// opening script, a red zone package, a 2-minute drill), saved and pullable
// back up on the sideline.
//
// Lives inside the coach-only Coach Tools top-level section -- the tab
// itself is hidden unless window.isApprovedCoachProfile() (auth.js), so
// nothing in here needs its own separate gate on top of that.
//
// Multiple named scripts, stored as one array at driveScripts.json (same
// whole-array PUT pattern as playEdits.json) -- there's only ever a handful
// of these, so there's no need for per-script Firebase keys.
// ---------------------------------------------------------------------------
(function () {

  const SCRIPTS_URL = `${FIREBASE_DB_URL}/driveScripts.json`;

  // Nathan: "Can you draft some base scripts for us to start? Red Zone run
  // heavy. 2 minute drill with more throwing, etc." Built from the real
  // playbook (data/plays.json's playTypes: inside_zone, outside_zone,
  // option, blast, double_blast, option_pass, sweep -- option_pass is the
  // only pass-type call in this offense, so "more throwing" leans on that
  // one repeated/mixed with quick-hitters rather than a dropback game that
  // doesn't exist here). Offered as a one-tap "Add Starter Scripts" button
  // on the list view rather than force-seeded, so a coach can also just
  // build their own from scratch and never see these if they don't want
  // them -- and re-tapping only fills in whichever of these four are
  // missing by name, so it's safe to tap more than once.
  const STARTER_SCRIPTS = [
    {
      name: 'Opening Script',
      plays: [
        { key: 'inside_zone', direction: 'Left' },
        { key: 'outside_zone', direction: 'Right' },
        { key: 'sweep', direction: 'Left' },
        { key: 'option', direction: 'Right' },
        { key: 'blast', direction: 'Left' },
      ],
    },
    {
      name: 'Red Zone (Run Heavy)',
      plays: [
        { key: 'blast', direction: 'Left' },
        { key: 'double_blast', direction: 'Right' },
        { key: 'inside_zone', direction: 'Right' },
        { key: 'blast', direction: 'Right' },
        { key: 'double_blast', direction: 'Left' },
      ],
    },
    {
      name: '2-Minute Drill',
      plays: [
        { key: 'option_pass', direction: 'Left' },
        { key: 'sweep', direction: 'Right' },
        { key: 'option_pass', direction: 'Right' },
        { key: 'outside_zone', direction: 'Left' },
        { key: 'option_pass', direction: 'Left' },
      ],
    },
    {
      name: 'Short Yardage / Goal Line',
      plays: [
        { key: 'double_blast', direction: 'Left' },
        { key: 'blast', direction: 'Right' },
        { key: 'double_blast', direction: 'Right' },
        { key: 'blast', direction: 'Left' },
      ],
    },
  ];

  let scripts = [];   // [{id, name, plays:[{key,direction}], updatedAt}]
  let current = null; // the script currently open in the editor, or null (list view)
  let loaded = false;
  // Read-only copy of This Week's own Game Plan (thisWeek.json's `plays`),
  // for the picker below -- Nathan: "The script piece comes after where you
  // can choose plays from your week's game plan." Used to be sourced from
  // the WHOLE playbook (numberedRows(), the same family+direction list This
  // Week/Call Sheet used before Game Plan existed) -- refetched every time
  // the editor opens rather than cached at boot, so it can't go stale
  // across a session where a coach edits This Week in one tab and Drive
  // Scripts in another.
  let gamePlanEntries = [];

  function genId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function loadGamePlanForPicker() {
    const url = `${FIREBASE_DB_URL}/thisWeek.json`;
    return window.firebaseAuthed(url).then(u => fetch(u)).then(r => (r.ok ? r.json() : null))
      .then(data => { gamePlanEntries = (data && Array.isArray(data.plays)) ? data.plays : []; })
      .catch(err => { console.error('Could not load Game Plan for Drive Scripts picker:', err); gamePlanEntries = []; });
  }

  // ---- Cloud load/save ----
  // Real bug, found in review: `scripts` is fetched exactly once, at boot
  // -- persistScripts() (below) never re-fetches, it always PUTs whatever
  // is currently in this variable. A non-OK response used to fall through
  // to `data: null` -> `scripts = []` on the SUCCESS path (no error shown
  // at all, just a silently-empty list indistinguishable from "nothing's
  // been saved yet"). The very next save -- most temptingly the prominent
  // "Add Starter Scripts" one-tap button -- would then overwrite
  // driveScripts.json with just the new content, permanently erasing
  // every real script the coaches built for this weekend. scriptsLoaded
  // only ever becomes true after a REAL, confirmed load succeeds;
  // persistScripts() below refuses to write at all until it has.
  let scriptsLoaded = false;
  function loadScripts() {
    const statusEl = document.getElementById('driveScriptCloudStatus');
    if (statusEl) statusEl.textContent = 'Loading drive scripts…';
    return window.firebaseAuthed(SCRIPTS_URL).then(url => fetch(url))
      .then(r => { if (!r.ok) throw new Error(`load failed (HTTP ${r.status})`); return r.json(); })
      .then(data => {
        scripts = Array.isArray(data) ? data.filter(s => s && s.id) : [];
        scriptsLoaded = true;
        if (statusEl) statusEl.textContent = '';
        renderList();
      })
      .catch(err => {
        console.error('Could not load drive scripts:', err);
        if (statusEl) statusEl.textContent = 'Could not reach the cloud -- reload before saving, or you could overwrite real scripts.';
      });
  }

  function persistScripts(afterOk) {
    const statusEl = document.getElementById('driveScriptCloudStatus');
    if (!scriptsLoaded) {
      if (statusEl) statusEl.textContent = "Couldn't confirm your current scripts loaded -- reload the page before saving.";
      return;
    }
    window.firebaseAuthed(SCRIPTS_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scripts),
    })).then(r => {
      if (r.ok) {
        if (statusEl) statusEl.textContent = 'Saved.';
        if (afterOk) afterOk();
      } else if (statusEl) {
        statusEl.textContent = `Save failed (HTTP ${r.status}).`;
      }
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2200);
    }).catch(err => {
      console.error('Drive script save failed:', err);
      if (statusEl) statusEl.textContent = `Save failed: ${err.message}`;
    });
  }

  // ---- List view ----
  function renderList() {
    const listEl = document.getElementById('driveScriptList');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!scripts.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = 'No drive scripts yet -- build one below.';
      listEl.appendChild(empty);
      return;
    }
    scripts.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).forEach(s => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'driveScriptRow';
      const count = (s.plays || []).length;
      row.innerHTML = `<span class="driveScriptRowName">${escapeHtml(s.name || 'Untitled script')}</span><span class="driveScriptRowCount">${count} play${count === 1 ? '' : 's'}</span>`;
      row.addEventListener('click', () => openEditor(s.id));
      listEl.appendChild(row);
    });
  }

  function addStarterScripts() {
    const existingNames = new Set(scripts.map(s => (s.name || '').trim().toLowerCase()));
    const toAdd = STARTER_SCRIPTS.filter(s => !existingNames.has(s.name.toLowerCase()));
    if (!toAdd.length) {
      const statusEl = document.getElementById('driveScriptCloudStatus');
      if (statusEl) { statusEl.textContent = 'Starter scripts are already on your list.'; setTimeout(() => { statusEl.textContent = ''; }, 2200); }
      return;
    }
    toAdd.forEach(s => scripts.push({ id: genId(), name: s.name, plays: s.plays.map(p => ({ ...p })), updatedAt: new Date().toISOString() }));
    persistScripts(() => renderList());
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ---- Editor view ----
  function openEditor(id) {
    if (id) {
      const existing = scripts.find(s => s.id === id);
      current = existing ? { ...existing, plays: existing.plays.map(p => ({ ...p })) } : null;
    }
    if (!current) {
      current = { id: genId(), name: '', plays: [], updatedAt: null };
    }
    document.getElementById('driveScriptListWrap').style.display = 'none';
    document.getElementById('driveScriptEditor').style.display = '';
    document.getElementById('driveScriptNameInput').value = current.name || '';
    document.getElementById('driveScriptDeleteBtn').style.display = scripts.some(s => s.id === current.id) ? '' : 'none';
    renderPlayList();
    renderPicker(); // once immediately with whatever's cached, so the picker isn't blank while the fetch below is in flight
    loadGamePlanForPicker().then(renderPicker);
  }

  function closeEditor() {
    current = null;
    document.getElementById('driveScriptEditor').style.display = 'none';
    document.getElementById('driveScriptListWrap').style.display = '';
    renderList();
  }

  function renderPlayList() {
    const listEl = document.getElementById('driveScriptPlayList');
    if (!listEl || !current) return;
    listEl.innerHTML = '';
    if (!current.plays.length) {
      const li = document.createElement('li');
      li.className = 'driveScriptEmptyRow';
      li.textContent = 'No plays added yet -- tap one below.';
      listEl.appendChild(li);
      return;
    }
    current.plays.forEach((sel, i) => {
      // window.GamePlan.describe() handles BOTH shapes a script's own
      // plays[] can hold: a v2 entry (added since Game Plan's picker
      // replaced the old full-playbook one below) with its own real
      // wingSide/toggles, and a plain v1 {key,direction} (every script
      // built before today, including the real starter scripts) --
      // no branching needed here, describe() already resolves either.
      const info = window.GamePlan ? window.GamePlan.describe(sel) : { label: `${sel.key} • ${sel.direction}`, color: '' };
      const li = document.createElement('li');
      li.className = 'driveScriptPlayRow';
      const label = document.createElement('span');
      label.className = 'driveScriptPlayLabel';
      label.style.color = info.color || '';
      label.textContent = info.label;
      li.appendChild(label);

      const controls = document.createElement('span');
      controls.className = 'driveScriptRowControls';
      const upBtn = document.createElement('button');
      upBtn.type = 'button'; upBtn.textContent = '↑'; upBtn.disabled = i === 0;
      upBtn.addEventListener('click', () => { [current.plays[i - 1], current.plays[i]] = [current.plays[i], current.plays[i - 1]]; renderPlayList(); });
      const downBtn = document.createElement('button');
      downBtn.type = 'button'; downBtn.textContent = '↓'; downBtn.disabled = i === current.plays.length - 1;
      downBtn.addEventListener('click', () => { [current.plays[i + 1], current.plays[i]] = [current.plays[i], current.plays[i + 1]]; renderPlayList(); });
      const rmBtn = document.createElement('button');
      rmBtn.type = 'button'; rmBtn.textContent = '✕';
      rmBtn.addEventListener('click', () => { current.plays.splice(i, 1); renderPlayList(); });
      controls.appendChild(upBtn); controls.appendChild(downBtn); controls.appendChild(rmBtn);
      li.appendChild(controls);
      listEl.appendChild(li);
    });
  }

  // Nathan: "The script piece comes after where you can choose plays from
  // your week's game plan and create 3-5 play scripts that are specific
  // plays to memorize and run at high speeds in the game with no delay."
  // Used to list the WHOLE playbook (every family x direction) -- now
  // lists only what's actually in This Week's own Game Plan, each already
  // a specific, dialed-in call (real wingSide/toggles for anything added
  // via "+ Add to Game Plan" on the real card, not just a play's default).
  function renderPicker() {
    const gridEl = document.getElementById('driveScriptPickerGrid');
    if (!gridEl) return;
    gridEl.innerHTML = '';
    if (!gamePlanEntries.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = "Your Game Plan is empty -- add plays on This Week first, then come back here to build a script from them.";
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'lbLinkBtn';
      link.style.display = 'block';
      link.style.margin = '6px auto 0';
      link.textContent = 'Go to This Week →';
      link.addEventListener('click', () => { if (window.setSection) window.setSection('thisweek'); });
      gridEl.appendChild(empty);
      gridEl.appendChild(link);
      return;
    }
    // A picker tap here ADDS another instance to the end of the ordered
    // list (not a toggle like This Week's picker) -- a drive script is a
    // sequence, and calling the same play more than once in a drive (e.g.
    // Inside Zone twice in a row) is completely normal.
    gamePlanEntries.forEach(entry => {
      const info = window.GamePlan ? window.GamePlan.describe(entry) : { label: `${entry.key} • ${entry.direction}`, color: '' };
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gameplanChip';
      chip.style.setProperty('--chip-color', info.color);
      chip.textContent = info.label;
      chip.addEventListener('click', () => {
        // Deep-copy, not a reference to the Game Plan's own entry -- a
        // script is a frozen, memorized sequence; it should not silently
        // change later if the Game Plan gets edited (a play swapped out,
        // a toggle changed) after this script was built.
        const copy = Object.assign({}, entry);
        if (copy.alignmentValues) copy.alignmentValues = Object.assign({}, copy.alignmentValues);
        current.plays.push(copy);
        renderPlayList();
      });
      gridEl.appendChild(chip);
    });
  }

  function saveCurrent() {
    if (!current) return;
    const nameInput = document.getElementById('driveScriptNameInput');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      const statusEl = document.getElementById('driveScriptEditorStatus');
      if (statusEl) statusEl.textContent = 'Give the script a name first.';
      return;
    }
    current.name = name;
    current.updatedAt = new Date().toISOString();
    const idx = scripts.findIndex(s => s.id === current.id);
    if (idx >= 0) scripts[idx] = current; else scripts.push(current);
    persistScripts(() => closeEditor());
  }

  function deleteCurrent() {
    if (!current) return;
    if (!confirm(`Delete "${current.name || 'this script'}"? This can't be undone.`)) return;
    scripts = scripts.filter(s => s.id !== current.id);
    persistScripts(() => closeEditor());
  }

  let controlsWired = false;
  function wireControls() {
    if (controlsWired) return;
    controlsWired = true;
    document.getElementById('driveScriptNewBtn').addEventListener('click', () => { current = null; openEditor(null); });
    const starterBtn = document.getElementById('driveScriptStarterBtn');
    if (starterBtn) starterBtn.addEventListener('click', addStarterScripts);
    document.getElementById('driveScriptBackBtn').addEventListener('click', closeEditor);
    document.getElementById('driveScriptSaveBtn').addEventListener('click', saveCurrent);
    document.getElementById('driveScriptDeleteBtn').addEventListener('click', deleteCurrent);
  }

  window.initDriveBuilder = function () {
    wireControls();
    if (!loaded) {
      loaded = true;
      loadScripts();
    } else {
      document.getElementById('driveScriptEditor').style.display = 'none';
      document.getElementById('driveScriptListWrap').style.display = '';
      renderList();
    }
  };
})();

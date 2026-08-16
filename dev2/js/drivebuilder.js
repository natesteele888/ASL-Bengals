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

  function genId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Same family+direction numbering the Call Sheet PDF and This Week picker
  // use -- reimplemented locally (small, pure) rather than reaching into
  // another file's IIFE-private function, matching how thisweek.js and
  // call-sheet-pdf.js already each keep their own tiny copy of this.
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
  function rowFor(sel) {
    return numberedRows().find(r => r.key === sel.key && r.direction === sel.direction);
  }

  // ---- Cloud load/save ----
  function loadScripts() {
    const statusEl = document.getElementById('driveScriptCloudStatus');
    if (statusEl) statusEl.textContent = 'Loading drive scripts…';
    return window.firebaseAuthed(SCRIPTS_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        scripts = Array.isArray(data) ? data.filter(s => s && s.id) : [];
        if (statusEl) statusEl.textContent = '';
        renderList();
      })
      .catch(err => {
        console.error('Could not load drive scripts:', err);
        if (statusEl) statusEl.textContent = 'Could not reach the cloud -- showing nothing saved yet.';
      });
  }

  function persistScripts(afterOk) {
    const statusEl = document.getElementById('driveScriptCloudStatus');
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
    renderPicker();
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
      const row = rowFor(sel);
      const li = document.createElement('li');
      li.className = 'driveScriptPlayRow';
      const label = document.createElement('span');
      label.className = 'driveScriptPlayLabel';
      label.style.color = row ? row.color : '';
      label.textContent = row ? `#${row.number} ${row.label} • ${row.direction}` : `${sel.key} • ${sel.direction}`;
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

  function renderPicker() {
    const gridEl = document.getElementById('driveScriptPickerGrid');
    if (!gridEl) return;
    gridEl.innerHTML = '';
    // A picker tap here ADDS another instance to the end of the ordered
    // list (not a toggle like This Week's picker) -- a drive script is a
    // sequence, and calling the same play more than once in a drive (e.g.
    // Inside Zone twice in a row) is completely normal.
    numberedRows().forEach(row => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gameplanChip';
      chip.style.setProperty('--chip-color', row.color);
      chip.textContent = `#${row.number} ${row.label} • ${row.direction}`;
      chip.addEventListener('click', () => {
        current.plays.push({ key: row.key, direction: row.direction });
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

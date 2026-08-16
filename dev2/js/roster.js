// ---------------------------------------------------------------------------
// Team Roster -- Nathan: "I also need the option on the coaching side to
// create a roster with positions, # and so on so they can be auto-assigned
// to games to add their stats." A single team-wide roster (name, #,
// position), managed by an approved coach in Coach Tools > Roster. Stats
// entry (js/game-stats-editor.js) auto-seeds a game's stat sheet roster from
// this list the first time it's opened, instead of a coach retyping every
// player's # and name from scratch on every single game.
// ---------------------------------------------------------------------------
(function () {

  const ROSTER_URL = `${FIREBASE_DB_URL}/teamRoster.json`;
  const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ATH'];

  let roster = []; // [{id, num, name, position}]
  let loaded = false;

  function genId() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ---- Cloud load/save ----
  function loadRoster() {
    return window.firebaseAuthed(ROSTER_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        roster = Array.isArray(data) ? data.filter(p => p && p.id) : [];
        loaded = true;
        return roster;
      })
      .catch(err => {
        console.error('Could not load team roster:', err);
        roster = [];
        loaded = true;
        return roster;
      });
  }

  function persistRoster(afterOk, afterFail) {
    window.firebaseAuthed(ROSTER_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roster),
    })).then(r => {
      if (r.ok) { if (afterOk) afterOk(); }
      else if (afterFail) afterFail(`HTTP ${r.status}`);
    }).catch(err => {
      console.error('Roster save failed:', err);
      if (afterFail) afterFail(err.message);
    });
  }

  // Sorted, numeric-aware by jersey #.
  function sortedRoster() {
    return roster.slice().sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0));
  }

  // ---- Public read API (used by game-stats-editor.js to auto-seed) ----
  window.getTeamRosterCached = function () { return roster.slice(); };
  window.isTeamRosterLoaded = function () { return loaded; };
  window.loadTeamRoster = loadRoster;

  // ---- Manager UI ----
  function renderManager(wrap) {
    if (!wrap) return;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    wrap.innerHTML = '';

    if (!roster.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = approved ? 'No players on the roster yet -- add one below.' : 'No players on the roster yet.';
      wrap.appendChild(empty);
    } else {
      const table = document.createElement('table');
      table.className = 'statsTable statsTableEdit';
      table.innerHTML = `<thead><tr><th>#</th><th>Name</th><th>Position</th>${approved ? '<th></th>' : ''}</tr></thead>`;
      const tbody = document.createElement('tbody');
      sortedRoster().forEach(p => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = 'View player profile';
        tr.addEventListener('click', (e) => {
          if (e.target.closest('button')) return; // don't open profile when tapping Remove
          if (window.showPlayerProfile) window.showPlayerProfile(p.num);
        });
        const numTd = document.createElement('td'); numTd.textContent = p.num; numTd.className = 'statsIdentityCell';
        const nameTd = document.createElement('td'); nameTd.textContent = p.name; nameTd.className = 'statsIdentityCell';
        const posTd = document.createElement('td'); posTd.textContent = p.position || '—';
        tr.appendChild(numTd); tr.appendChild(nameTd); tr.appendChild(posTd);
        if (approved) {
          const rmTd = document.createElement('td');
          const rmBtn = document.createElement('button');
          rmBtn.type = 'button'; rmBtn.className = 'statsRmBtn'; rmBtn.textContent = '✕';
          rmBtn.addEventListener('click', () => {
            if (!confirm(`Remove #${p.num} ${p.name} from the roster?`)) return;
            roster = roster.filter(x => x.id !== p.id);
            persistRoster(() => renderManager(wrap), msg => { statusMsg(wrap, `Remove failed: ${msg}`); renderManager(wrap); });
          });
          rmTd.appendChild(rmBtn);
          tr.appendChild(rmTd);
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
    }

    if (approved) {
      const form = document.createElement('div');
      form.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px;';

      const numInput = document.createElement('input');
      numInput.type = 'text'; numInput.placeholder = '#'; numInput.className = 'statsRosterNumInput';
      numInput.style.cssText = 'width:56px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;';

      const nameInput = document.createElement('input');
      nameInput.type = 'text'; nameInput.placeholder = 'Name';
      nameInput.style.cssText = 'flex:1 1 140px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;';

      const posSelect = document.createElement('select');
      posSelect.style.cssText = 'padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;';
      const blankOpt = document.createElement('option'); blankOpt.value = ''; blankOpt.textContent = 'Position…';
      posSelect.appendChild(blankOpt);
      POSITIONS.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; posSelect.appendChild(o); });

      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'navBtn'; addBtn.textContent = '+ Add Player';
      addBtn.style.cssText = 'flex:0 0 auto;padding:8px 16px;';

      function addPlayer() {
        const num = numInput.value.trim(), name = nameInput.value.trim(), position = posSelect.value;
        if (!num || !name) return;
        roster.push({ id: genId(), num, name, position });
        numInput.value = ''; nameInput.value = ''; posSelect.value = '';
        persistRoster(() => renderManager(wrap), msg => { statusMsg(wrap, `Save failed: ${msg}`); renderManager(wrap); });
      }
      addBtn.addEventListener('click', addPlayer);
      nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addPlayer(); });

      form.appendChild(numInput); form.appendChild(nameInput); form.appendChild(posSelect); form.appendChild(addBtn);
      wrap.appendChild(form);
    }

    const status = document.createElement('div');
    status.id = 'teamRosterStatus';
    status.style.cssText = 'text-align:center;font-size:11px;color:#999;margin-top:8px;';
    wrap.appendChild(status);
  }

  function statusMsg(wrap, text) {
    const el = wrap.querySelector('#teamRosterStatus');
    if (el) el.textContent = text;
  }

  window.initTeamRoster = function (wrap) {
    if (!wrap) return;
    if (loaded) { renderManager(wrap); return; }
    wrap.innerHTML = '<div class="lbSub" style="text-align:center;">Loading roster…</div>';
    loadRoster().then(() => renderManager(wrap));
  };
})();

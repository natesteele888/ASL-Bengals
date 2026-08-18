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

  let roster = []; // [{id, num, name, position, loginPlayerId?}]
  let loaded = false;

  // Nathan: "Quiz info isnt tied to kid profiles that have already logged
  // in... As the admin, I need the ability to link those kids to the
  // profiles that already exist." Quiz results are tagged with a
  // dev2Players login id, not a roster id -- there's no real link between
  // "Desmond Steele #76 on the roster" and "the 'Desmond' who signed in
  // with a name+PIN" unless a coach explicitly connects them (name
  // matching alone is what showChildQuizProgress falls back to when this
  // isn't set, but that's a guess, not a fact). loginPlayerId, once set
  // here, is the real link -- study-quiz.js's showChildQuizProgress and
  // player-identity.js's renderParentChildBanner both prefer it over the
  // name-matching fallback.
  let loginPlayers = [];
  let loginPlayersLoaded = false;
  // Nathan: "all the coaches profiles (Aaron, Coach Joe, Coach Nate, Coach
  // Shane, Coachmatt) are all sitting in the Roster section waiting to
  // assign to a player." Root cause: isCoach/role only got stamped onto a
  // dev2Players record starting when the Player/Coach/Parent role picker was
  // added (see createPlayer above) -- these five logins predate that and
  // have neither field set, so they slipped through this filter as if they
  // were plain players. Falling back to the same COACH_PROFILE_NAMES
  // allowlist auth.js already uses for elevated access (window.js/auth.js)
  // catches exactly those legacy accounts without needing a one-time data
  // migration on the live database.
  function isKnownCoachName(name) {
    return !!(window.COACH_PROFILE_NAMES && window.COACH_PROFILE_NAMES.indexOf((name || '').trim().toLowerCase()) !== -1);
  }
  function loadLoginPlayers() {
    if (loginPlayersLoaded) return Promise.resolve(loginPlayers);
    if (!window.PlayerIdentity || !window.PlayerIdentity.fetchAllPlayers) return Promise.resolve([]);
    return window.PlayerIdentity.fetchAllPlayers().then(all => {
      loginPlayers = Object.keys(all || {})
        .map(id => Object.assign({ id }, all[id]))
        .filter(p => !p.isCoach && p.role !== 'parent' && p.role !== 'coach' && !isKnownCoachName(p.name))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      loginPlayersLoaded = true;
      return loginPlayers;
    }).catch(() => { loginPlayers = []; loginPlayersLoaded = true; return loginPlayers; });
  }

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

  // Sorted, numeric-aware by jersey #. Players with no # yet (still being
  // set up) sort to the bottom instead of clumping at "0" with real #0s.
  function sortedRoster() {
    const rank = (p) => (p.num === '' || p.num == null || isNaN(Number(p.num))) ? Infinity : Number(p.num);
    return roster.slice().sort((a, b) => rank(a) - rank(b));
  }

  // ---- Public read API (used by game-stats-editor.js to auto-seed) ----
  window.getTeamRosterCached = function () { return roster.slice(); };
  window.isTeamRosterLoaded = function () { return loaded; };
  window.loadTeamRoster = loadRoster;

  // Nathan: "Each parent who claims their player, should be able to add a
  // picture or update their #." A parent edits from the player card
  // (player-profile.js), not the coach-only Roster manager above -- this
  // is the narrow write path that lets that card's Save button update
  // just the jersey # on this one roster entry, without needing the full
  // coach Roster UI or an approved-coach gate. Mutates the same in-memory
  // roster array the rest of this module uses, so getTeamRosterCached()
  // reflects it immediately (before the network PUT even resolves), then
  // persists like every other roster edit.
  window.updateRosterPlayerNum = function (rosterId, newNum, afterOk, afterFail) {
    const entry = roster.find(x => x.id === rosterId);
    if (!entry) { if (afterFail) afterFail('Player not found on roster'); return; }
    entry.num = newNum;
    persistRoster(afterOk, afterFail);
  };

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
      table.innerHTML = `<thead><tr><th>#</th><th>Name</th><th>Position</th>${approved ? '<th title="Which name+PIN login is this player -- links their quiz stats and parent progress view to this roster entry">Login</th>' : ''}<th></th>${approved ? '<th></th>' : ''}</tr></thead>`;
      const tbody = document.createElement('tbody');

      // Persist one field edit on an existing roster entry, then re-render
      // (re-render picks up any re-sort if # changed).
      function updatePlayer(p, field, value) {
        const entry = roster.find(x => x.id === p.id);
        if (!entry) return;
        entry[field] = value;
        persistRoster(() => renderManager(wrap), msg => { statusMsg(wrap, `Save failed: ${msg}`); renderManager(wrap); });
      }

      sortedRoster().forEach(p => {
        const tr = document.createElement('tr');
        const numTd = document.createElement('td'); numTd.className = 'statsIdentityCell';
        const nameTd = document.createElement('td'); nameTd.className = 'statsIdentityCell';
        const posTd = document.createElement('td');

        if (approved) {
          // Editable in place -- lets a coach fill in # / position later for
          // a player who was added without them, without deleting/re-adding.
          const numInput = document.createElement('input');
          numInput.type = 'text'; numInput.value = p.num || ''; numInput.placeholder = 'TBD';
          numInput.className = 'statsRosterNumInput';
          numInput.style.cssText = 'width:48px;padding:6px;border:2px solid #ccc;border-radius:6px;font-size:13px;box-sizing:border-box;';
          numInput.addEventListener('change', () => updatePlayer(p, 'num', numInput.value.trim()));
          numTd.appendChild(numInput);

          const nameInputEdit = document.createElement('input');
          nameInputEdit.type = 'text'; nameInputEdit.value = p.name || '';
          nameInputEdit.style.cssText = 'width:100%;min-width:100px;padding:6px;border:2px solid #ccc;border-radius:6px;font-size:13px;box-sizing:border-box;';
          nameInputEdit.addEventListener('change', () => {
            const v = nameInputEdit.value.trim();
            if (!v) { nameInputEdit.value = p.name || ''; return; } // name can't be blanked out
            updatePlayer(p, 'name', v);
          });
          nameTd.appendChild(nameInputEdit);

          const posSelectEdit = document.createElement('select');
          posSelectEdit.style.cssText = 'padding:6px;border:2px solid #ccc;border-radius:6px;font-size:13px;box-sizing:border-box;';
          const blankOptEdit = document.createElement('option'); blankOptEdit.value = ''; blankOptEdit.textContent = 'TBD';
          posSelectEdit.appendChild(blankOptEdit);
          POSITIONS.forEach(pos => { const o = document.createElement('option'); o.value = pos; o.textContent = pos; if (pos === p.position) o.selected = true; posSelectEdit.appendChild(o); });
          posSelectEdit.addEventListener('change', () => updatePlayer(p, 'position', posSelectEdit.value));
          posTd.appendChild(posSelectEdit);

          const loginTd = document.createElement('td');
          const loginSelect = document.createElement('select');
          loginSelect.style.cssText = 'padding:6px;border:2px solid #ccc;border-radius:6px;font-size:12px;box-sizing:border-box;max-width:120px;';
          const notLinkedOpt = document.createElement('option'); notLinkedOpt.value = ''; notLinkedOpt.textContent = 'Not linked';
          loginSelect.appendChild(notLinkedOpt);
          // Nathan: "when a player is added to the roster and a Login is
          // assigned to them, remove that login from the list. You should
          // only be able to assign each login to one player only." --
          // exclude logins already claimed by any OTHER roster row from
          // this row's dropdown (this row's own current login still shows,
          // so its existing assignment doesn't disappear on re-render).
          const loginsUsedElsewhere = new Set(
            roster.filter(x => x.id !== p.id && x.loginPlayerId).map(x => x.loginPlayerId)
          );
          loginPlayers.forEach(lp => {
            if (loginsUsedElsewhere.has(lp.id)) return;
            const o = document.createElement('option');
            o.value = lp.id; o.textContent = lp.name;
            if (lp.id === p.loginPlayerId) o.selected = true;
            loginSelect.appendChild(o);
          });
          // A login that was set before but no longer shows up in the
          // current dev2Players list (renamed, deleted) -- keep it visible
          // instead of silently reverting to "Not linked".
          if (p.loginPlayerId && !loginPlayers.some(lp => lp.id === p.loginPlayerId)) {
            const staleOpt = document.createElement('option');
            staleOpt.value = p.loginPlayerId; staleOpt.textContent = '(missing login)'; staleOpt.selected = true;
            loginSelect.appendChild(staleOpt);
          }
          loginSelect.addEventListener('change', () => updatePlayer(p, 'loginPlayerId', loginSelect.value || null));
          loginTd.appendChild(loginSelect);
          tr.appendChild(numTd); tr.appendChild(nameTd); tr.appendChild(posTd); tr.appendChild(loginTd);
        } else {
          numTd.textContent = p.num || '—';
          nameTd.textContent = p.name;
          posTd.textContent = p.position || '—';
          tr.appendChild(numTd); tr.appendChild(nameTd); tr.appendChild(posTd);
        }

        const viewTd = document.createElement('td');
        if (p.num) {
          const viewBtn = document.createElement('button');
          viewBtn.type = 'button'; viewBtn.className = 'statsRmBtn'; viewBtn.textContent = '👁';
          viewBtn.title = 'View player profile';
          viewBtn.style.cssText = 'background:transparent;';
          viewBtn.addEventListener('click', () => { if (window.showPlayerProfile) window.showPlayerProfile(p.num); });
          viewTd.appendChild(viewBtn);
        }
        tr.appendChild(viewTd);

        if (approved) {
          const rmTd = document.createElement('td');
          const rmBtn = document.createElement('button');
          rmBtn.type = 'button'; rmBtn.className = 'statsRmBtn'; rmBtn.textContent = '✕';
          rmBtn.addEventListener('click', () => {
            if (!confirm(`Remove ${p.num ? '#' + p.num + ' ' : ''}${p.name} from the roster?`)) return;
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
      numInput.type = 'text'; numInput.placeholder = '# (optional)'; numInput.className = 'statsRosterNumInput';
      numInput.style.cssText = 'width:90px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;';

      const nameInput = document.createElement('input');
      nameInput.type = 'text'; nameInput.placeholder = 'Name';
      nameInput.style.cssText = 'flex:1 1 140px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;';

      const posSelect = document.createElement('select');
      posSelect.style.cssText = 'padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;';
      const blankOpt = document.createElement('option'); blankOpt.value = ''; blankOpt.textContent = 'Position… (optional)';
      posSelect.appendChild(blankOpt);
      POSITIONS.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; posSelect.appendChild(o); });

      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'navBtn'; addBtn.textContent = '+ Add Player';
      addBtn.style.cssText = 'flex:0 0 auto;padding:8px 16px;';

      // Only the name is required -- a coach can add a kid to the roster
      // first and fill in # / position later (editable inline in the table
      // above) once they're assigned.
      function addPlayer() {
        const num = numInput.value.trim(), name = nameInput.value.trim(), position = posSelect.value;
        if (!name) return;
        roster.push({ id: genId(), num, name, position });
        numInput.value = ''; nameInput.value = ''; posSelect.value = '';
        persistRoster(() => renderManager(wrap), msg => { statusMsg(wrap, `Save failed: ${msg}`); renderManager(wrap); });
      }
      addBtn.addEventListener('click', addPlayer);
      nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addPlayer(); });

      const hint = document.createElement('div');
      hint.style.cssText = 'flex-basis:100%;font-size:11px;color:#999;';
      hint.textContent = '# and Position are optional -- add a player without them and fill those in later.';

      form.appendChild(numInput); form.appendChild(nameInput); form.appendChild(posSelect); form.appendChild(addBtn);
      form.appendChild(hint);
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
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    const loginsPromise = approved ? loadLoginPlayers() : Promise.resolve([]);
    if (loaded) { loginsPromise.then(() => renderManager(wrap)); return; }
    wrap.innerHTML = '<div class="lbSub" style="text-align:center;">Loading roster…</div>';
    Promise.all([loadRoster(), loginsPromise]).then(() => renderManager(wrap));
  };
})();

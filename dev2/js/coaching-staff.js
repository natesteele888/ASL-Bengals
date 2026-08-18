// ---------------------------------------------------------------------------
// Coaching Staff -- Nathan: "add a coaching staff section to go with the
// roster so we can link log ins to coaches." Same shape/pattern as Team
// Roster (js/roster.js) -- a coach-managed list, just of the coaching staff
// itself (name + title) instead of players -- including the exact same
// "link this entry to a real name+PIN login" pattern roster.js already uses
// for players (loginPlayerId), here linking each staff entry to whichever
// dev2Players login actually signed in as a coach (isCoach:true / role
// 'coach'). That gives a real, stable link -- "this staff entry IS this
// specific login" -- instead of guessing from name matching. Lives right
// alongside Team Roster in Coach Tools > Roster (see coachingStaffWrap in
// index.html), and is a directory + login-linking feature only: it does NOT
// change who gets elevated Coach Tools access (This Week editing, Play
// editing, etc.) -- that's still the separate window.COACH_PROFILE_NAMES
// allowlist in auth.js, untouched by this.
//
// NOTE (same caveat drone-footage.js's header already flags for its own new
// path): coachingStaff is a brand-new top-level Firebase path. If your
// Realtime Database rules allowlist specific paths (teamRoster, practices,
// etc.) rather than a catch-all, this needs its own entry added, matching
// whatever rule already covers "teamRoster" -- something like:
//   "coachingStaff": { ".read": "auth != null", ".write": "auth != null" }
// ---------------------------------------------------------------------------
(function () {

  const STAFF_URL = `${FIREBASE_DB_URL}/coachingStaff.json`;

  let staff = []; // [{id, name, title, loginId?}]
  let loaded = false;

  // Same idea as roster.js's loginPlayers, just filtered to the opposite
  // side of the same dev2Players list -- logins that actually signed in as
  // a coach, so this dropdown only ever offers real coach logins to link to.
  //
  // Nathan: "all the coaches profiles (Aaron, Coach Joe, Coach Nate, Coach
  // Shane, Coachmatt) are all sitting in the Roster section waiting to
  // assign to a player. Profiles to assign to coaches doesnt show." Those
  // five logins predate the Player/Coach/Parent role picker (see
  // player-identity.js's createPlayer), so isCoach/role were never stamped
  // onto their dev2Players records -- p.isCoach/p.role === 'coach' alone
  // misses them entirely. Falling back to the same COACH_PROFILE_NAMES
  // allowlist auth.js already uses for elevated access catches exactly
  // those legacy accounts without a one-time migration on the live data.
  let coachLogins = [];
  let coachLoginsLoaded = false;
  function isCoachLoginName(name) {
    return !!(window.COACH_PROFILE_NAMES && window.COACH_PROFILE_NAMES.indexOf((name || '').trim().toLowerCase()) !== -1);
  }
  function loadCoachLogins() {
    if (coachLoginsLoaded) return Promise.resolve(coachLogins);
    if (!window.PlayerIdentity || !window.PlayerIdentity.fetchAllPlayers) return Promise.resolve([]);
    return window.PlayerIdentity.fetchAllPlayers().then(all => {
      coachLogins = Object.keys(all || {})
        .map(id => Object.assign({ id }, all[id]))
        .filter(p => p.isCoach || p.role === 'coach' || isCoachLoginName(p.name))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      coachLoginsLoaded = true;
      return coachLogins;
    }).catch(() => { coachLogins = []; coachLoginsLoaded = true; return coachLogins; });
  }

  function genId() {
    return 'cs' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ---- Cloud load/save (same whole-array PUT/GET pattern as roster.js) ----
  function loadStaff() {
    return window.firebaseAuthed(STAFF_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        staff = Array.isArray(data) ? data.filter(p => p && p.id) : [];
        loaded = true;
        return staff;
      })
      .catch(err => {
        console.error('Could not load coaching staff:', err);
        staff = [];
        loaded = true;
        return staff;
      });
  }

  function persistStaff(afterOk, afterFail) {
    window.firebaseAuthed(STAFF_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staff),
    })).then(r => {
      if (r.ok) { if (afterOk) afterOk(); }
      else if (afterFail) afterFail(`HTTP ${r.status}`);
    }).catch(err => {
      console.error('Coaching staff save failed:', err);
      if (afterFail) afterFail(err.message);
    });
  }

  function sortedStaff() {
    return staff.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  // ---- Public read API, same shape as roster.js's getTeamRosterCached ----
  window.getCoachingStaffCached = function () { return staff.slice(); };
  window.isCoachingStaffLoaded = function () { return loaded; };

  // ---- Manager UI ----
  function renderManager(wrap) {
    if (!wrap) return;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    wrap.innerHTML = '';

    if (!staff.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = approved ? 'No coaching staff added yet -- add one below.' : 'No coaching staff added yet.';
      wrap.appendChild(empty);
    } else {
      const table = document.createElement('table');
      table.className = 'statsTable statsTableEdit';
      table.innerHTML = `<thead><tr><th>Name</th><th>Title</th>${approved ? '<th title="Which name+PIN login is this coach -- links their real sign-in to this staff entry">Login</th>' : ''}${approved ? '<th></th>' : ''}</tr></thead>`;
      const tbody = document.createElement('tbody');

      function updateStaffer(p, field, value) {
        const entry = staff.find(x => x.id === p.id);
        if (!entry) return;
        entry[field] = value;
        persistStaff(() => renderManager(wrap), msg => { statusMsg(wrap, `Save failed: ${msg}`); renderManager(wrap); });
      }

      sortedStaff().forEach(p => {
        const tr = document.createElement('tr');
        const nameTd = document.createElement('td'); nameTd.className = 'statsIdentityCell';
        const titleTd = document.createElement('td');

        if (approved) {
          const nameInputEdit = document.createElement('input');
          nameInputEdit.type = 'text'; nameInputEdit.value = p.name || '';
          nameInputEdit.style.cssText = 'width:100%;min-width:100px;padding:6px;border:2px solid #ccc;border-radius:6px;font-size:13px;box-sizing:border-box;';
          nameInputEdit.addEventListener('change', () => {
            const v = nameInputEdit.value.trim();
            if (!v) { nameInputEdit.value = p.name || ''; return; } // name can't be blanked out
            updateStaffer(p, 'name', v);
          });
          nameTd.appendChild(nameInputEdit);

          const titleInputEdit = document.createElement('input');
          titleInputEdit.type = 'text'; titleInputEdit.value = p.title || ''; titleInputEdit.placeholder = 'e.g. Head Coach';
          titleInputEdit.style.cssText = 'width:100%;min-width:120px;padding:6px;border:2px solid #ccc;border-radius:6px;font-size:13px;box-sizing:border-box;';
          titleInputEdit.addEventListener('change', () => updateStaffer(p, 'title', titleInputEdit.value.trim()));
          titleTd.appendChild(titleInputEdit);

          const loginTd = document.createElement('td');
          const loginSelect = document.createElement('select');
          loginSelect.style.cssText = 'padding:6px;border:2px solid #ccc;border-radius:6px;font-size:12px;box-sizing:border-box;max-width:120px;';
          const notLinkedOpt = document.createElement('option'); notLinkedOpt.value = ''; notLinkedOpt.textContent = 'Not linked';
          loginSelect.appendChild(notLinkedOpt);
          // Same "only one staff entry per login" rule roster.js enforces
          // for players -- exclude logins already claimed by any OTHER
          // staff row (this row's own current login still shows).
          const loginsUsedElsewhere = new Set(
            staff.filter(x => x.id !== p.id && x.loginId).map(x => x.loginId)
          );
          coachLogins.forEach(lp => {
            if (loginsUsedElsewhere.has(lp.id)) return;
            const o = document.createElement('option');
            o.value = lp.id; o.textContent = lp.name;
            if (lp.id === p.loginId) o.selected = true;
            loginSelect.appendChild(o);
          });
          // A login that was linked before but no longer shows up in the
          // current dev2Players list (renamed, deleted) -- keep it visible
          // instead of silently reverting to "Not linked".
          if (p.loginId && !coachLogins.some(lp => lp.id === p.loginId)) {
            const staleOpt = document.createElement('option');
            staleOpt.value = p.loginId; staleOpt.textContent = '(missing login)'; staleOpt.selected = true;
            loginSelect.appendChild(staleOpt);
          }
          loginSelect.addEventListener('change', () => updateStaffer(p, 'loginId', loginSelect.value || null));
          loginTd.appendChild(loginSelect);
          tr.appendChild(nameTd); tr.appendChild(titleTd); tr.appendChild(loginTd);
        } else {
          nameTd.textContent = p.name;
          titleTd.textContent = p.title || '—';
          tr.appendChild(nameTd); tr.appendChild(titleTd);
        }

        if (approved) {
          const rmTd = document.createElement('td');
          const rmBtn = document.createElement('button');
          rmBtn.type = 'button'; rmBtn.className = 'statsRmBtn'; rmBtn.textContent = '✕';
          rmBtn.addEventListener('click', () => {
            if (!confirm(`Remove ${p.name} from the coaching staff list?`)) return;
            staff = staff.filter(x => x.id !== p.id);
            persistStaff(() => renderManager(wrap), msg => { statusMsg(wrap, `Remove failed: ${msg}`); renderManager(wrap); });
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

      const nameInput = document.createElement('input');
      nameInput.type = 'text'; nameInput.placeholder = 'Name';
      nameInput.style.cssText = 'flex:1 1 140px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;';

      const titleInput = document.createElement('input');
      titleInput.type = 'text'; titleInput.placeholder = 'Title (optional, e.g. Head Coach)';
      titleInput.style.cssText = 'flex:1 1 160px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;';

      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'navBtn'; addBtn.textContent = '+ Add Coach';
      addBtn.style.cssText = 'flex:0 0 auto;padding:8px 16px;';

      // Only the name is required -- title (and the login link, in the
      // table above once the entry exists) can be filled in later.
      function addStaffer() {
        const name = nameInput.value.trim(), title = titleInput.value.trim();
        if (!name) return;
        staff.push({ id: genId(), name, title });
        nameInput.value = ''; titleInput.value = '';
        persistStaff(() => renderManager(wrap), msg => { statusMsg(wrap, `Save failed: ${msg}`); renderManager(wrap); });
      }
      addBtn.addEventListener('click', addStaffer);
      nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addStaffer(); });

      const hint = document.createElement('div');
      hint.style.cssText = 'flex-basis:100%;font-size:11px;color:#999;';
      hint.textContent = 'Add a coach here, then link them to their actual login in the table above once they\'ve signed in at least once.';

      form.appendChild(nameInput); form.appendChild(titleInput); form.appendChild(addBtn);
      form.appendChild(hint);
      wrap.appendChild(form);
    }

    const status = document.createElement('div');
    status.id = 'coachingStaffStatus';
    status.style.cssText = 'text-align:center;font-size:11px;color:#999;margin-top:8px;';
    wrap.appendChild(status);
  }

  function statusMsg(wrap, text) {
    const el = wrap.querySelector('#coachingStaffStatus');
    if (el) el.textContent = text;
  }

  window.initCoachingStaff = function (wrap) {
    if (!wrap) return;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    const loginsPromise = approved ? loadCoachLogins() : Promise.resolve([]);
    if (loaded) { loginsPromise.then(() => renderManager(wrap)); return; }
    wrap.innerHTML = '<div class="lbSub" style="text-align:center;">Loading coaching staff…</div>';
    Promise.all([loadStaff(), loginsPromise]).then(() => renderManager(wrap));
  };
})();

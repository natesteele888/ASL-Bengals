// ---------------------------------------------------------------------------
// Player Profile -- Nathan: "With rosters we can also have player profiles
// just as the attached [ESPN player page] - season stats - career stats
// though it starts now - then recent games for passing and rushing or
// defense only depending on positioning." Later: "Let's expand the player
// profile to appear like a player card shown here. Copy the formatting as
// best you can. Set it up with place holders and showing '-' where stats
// arent available. Spot for height and weight as well."
//
// Opened from a roster chip (Coach Tools > Roster) or a leaderboard name
// (Coach Tools > Stats). Stats are read from the same schedule.json game
// records the leaderboard does, via the shared window.computeGamePlayerStats
// aggregator (js/coachtools-stats.js) -- one source of truth, no separate
// copy of the math. "Career" = every game ever recorded; since the app has
// no season boundaries yet, career and season are the same total today by
// design (Nathan: "career stats though it starts now") -- they'll diverge
// naturally once a new season's games start getting added and old ones are
// distinguishable by year.
//
// Photo / height / weight / grade -- Nathan: "Remember this is personal
// info so make sure it's not accessible and saved where it is publicly
// accessible." This app is deployed as a static GitHub Pages site, so any
// file committed to the repo (including images) is public regardless of
// the in-app login gate. Photo/HT/WT/grade are therefore never written to
// a repo file -- they live only in playerProfiles.json in Firebase RTDB,
// the same auth-gated database every other piece of team data (roster,
// stats, opponent logos) already goes through, keyed by the player's
// roster id so it survives jersey-number reuse across seasons.
// ---------------------------------------------------------------------------
(function () {

  const SCHEDULE_URL = `${FIREBASE_DB_URL}/schedule.json`;
  const PROFILES_URL = `${FIREBASE_DB_URL}/playerProfiles.json`;

  const OFFENSE_CATS = [
    { key: 'passYds', label: 'Pass Yds' },
    { key: 'rushYds', label: 'Rush Yds' },
    // Nathan: "we are missing attempts for rushing yards which will allow
    // us to show yards per carry" -- rushAtt was already tracked/summed
    // for ypc's sake (see totals.rushAtt below), just never shown as its
    // own column here.
    { key: 'rushAtt', label: 'Rush Att' },
    { key: 'recYds', label: 'Rec Yds' },
    { key: 'koYds', label: 'KO Yds' },
    { key: 'td', label: 'TD' },
    { key: 'passTd', label: 'Pass TD' },
    // ypc (yards/carry) is a ratio, not a raw total -- computeGamePlayerStats
    // and this file's own season-totals loop below both compute it as a
    // final step (rushYds/rushAtt) rather than storing it play-by-play, so
    // it's already a plain number by the time this table reads it.
    { key: 'ypc', label: 'YPC' },
  ];
  const DEFENSE_CATS = [
    { key: 'tackles', label: 'Tackles' },
    { key: 'sacks', label: 'Sacks' },
    { key: 'int', label: 'INT' },
    { key: 'pbu', label: 'PBU' },
    { key: 'fum', label: 'FR' },
  ];
  // Positions that lead with defensive categories on their own profile --
  // everyone still sees every category, this just decides display order.
  const DEFENSE_FIRST_POSITIONS = ['DL', 'LB', 'DB'];
  const ALL_CATS = OFFENSE_CATS.concat(DEFENSE_CATS);

  let profiles = {};      // roster id -> {photo, height, weight, grade}
  let profilesLoaded = false;
  let editing = false;

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  function fmtDate(dateStr) {
    if (!dateStr) return 'TBD';
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function formatNum(n) {
    const v = Number(n) || 0;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
  function gameResult(g) {
    if (g.ourScore === '' || g.ourScore == null || g.oppScore === '' || g.oppScore == null) return '-';
    const us = Number(g.ourScore), them = Number(g.oppScore);
    if (isNaN(us) || isNaN(them)) return '-';
    if (us > them) return 'W';
    if (us < them) return 'L';
    return 'T';
  }

  // ---- Cloud load/save for photo/HT/WT/grade (Firebase only -- never a
  // committed file, see file header). ----
  function loadProfiles() {
    if (profilesLoaded) return Promise.resolve(profiles);
    return window.firebaseAuthed(PROFILES_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        profiles = (data && typeof data === 'object') ? data : {};
        profilesLoaded = true;
        return profiles;
      })
      .catch(err => {
        console.error('Could not load player profiles:', err);
        profiles = {};
        profilesLoaded = true;
        return profiles;
      });
  }
  function saveProfile(id, data, afterOk, afterFail) {
    profiles[id] = data;
    window.firebaseAuthed(PROFILES_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profiles),
    })).then(r => {
      if (r.ok) { if (afterOk) afterOk(); }
      else if (afterFail) afterFail(`HTTP ${r.status}`);
    }).catch(err => {
      console.error('Player profile save failed:', err);
      if (afterFail) afterFail(err.message);
    });
  }

  // Downscales an uploaded photo client-side before it goes into Firebase --
  // portrait-ish cap, plenty for a small card photo, keeps the record light.
  function fileToPhotoDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const max = 360;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function loadGames() {
    return window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => Array.isArray(data) ? data.filter(g => g && g.id) : [])
      .catch(err => { console.error('Could not load schedule for player profile:', err); return []; });
  }

  function blankTotals() {
    return { rushYds: 0, passYds: 0, recYds: 0, koYds: 0, tackles: 0, sacks: 0, int: 0, pbu: 0, td: 0, passTd: 0, rushAtt: 0, fum: 0, ypc: 0, games: 0 };
  }

  function statCell(hasGames, value) {
    return hasGames ? `<td>${formatNum(value)}</td>` : `<td class="playerCardDash">-</td>`;
  }

  function render(num, rosterEntry, games, profile) {
    const body = document.getElementById('playerProfileBody');
    if (!body) return;

    const name = rosterEntry ? rosterEntry.name : '';
    const position = rosterEntry ? rosterEntry.position : '';
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    // Nathan: "give the parent the option to update their kid's player
    // card info" / "Each parent who claims their player, should be able
    // to add a picture or update their #" -- a parent who has linked this
    // specific player as their child (session.childRosterIds, set via the
    // My Child picker) can edit the same photo/#/height/weight/grade
    // fields a coach can, but only for that one linked child, not the
    // whole roster. Coach Nate (or any approved coach) already gets
    // canEdit=true here for every player's card via `approved` alone --
    // no separate admin flag needed.
    const rosterId = rosterEntry && rosterEntry.id;
    const session = window.PlayerIdentity && window.PlayerIdentity.getSession ? window.PlayerIdentity.getSession() : null;
    const isLinkedParent = !!(window.isParentSession && session && rosterId &&
      Array.isArray(session.childRosterIds) && session.childRosterIds.includes(rosterId));
    const canEdit = approved || isLinkedParent;
    const p = profile || {};

    const totals = blankTotals();
    const recentGames = [];
    games.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(g => {
      if (!g.statSheet) return;
      const perGame = window.computeGamePlayerStats(g.statSheet);
      const rec = perGame[num];
      if (!rec) return;
      const hasAny = ALL_CATS.some(c => (rec[c.key] || 0) > 0);
      if (!hasAny) return;
      totals.games += 1;
      // ypc is a ratio (rushYds/rushAtt) -- summing each game's ypc here
      // would average-of-averages, which is wrong. It's recomputed below
      // from the career-summed rushYds/rushAtt once every game is in.
      // rushAtt is skipped here too and added once below instead -- now
      // that it's its own ALL_CATS entry, summing it in both places would
      // double it.
      ALL_CATS.forEach(c => { if (c.key === 'ypc' || c.key === 'rushAtt') return; totals[c.key] += rec[c.key] || 0; });
      totals.rushAtt += rec.rushAtt || 0;
      recentGames.push({ game: g, rec });
    });
    totals.ypc = totals.rushAtt > 0 ? totals.rushYds / totals.rushAtt : 0;

    const catsOrder = DEFENSE_FIRST_POSITIONS.includes(position) ? DEFENSE_CATS.concat(OFFENSE_CATS) : OFFENSE_CATS.concat(DEFENSE_CATS);
    const hasGames = totals.games > 0;
    const activeCats = catsOrder.filter(c => (totals[c.key] || 0) > 0);
    const gameCols = activeCats.slice(0, 4);

    body.innerHTML = '';

    // ---- Header (ESPN-card style: dark band, photo left, name/meta right) ----
    const head = document.createElement('div');
    head.className = 'playerCardHead';
    const photoHtml = p.photo
      ? `<div class="playerCardPhotoWrap"><img src="${p.photo}" alt="${escapeHtml(name || 'Player')}"></div>`
      : `<div class="playerCardPhotoWrap"><span class="playerCardPhotoPlaceholder">#${escapeHtml(num)}</span></div>`;
    head.innerHTML = `
      ${photoHtml}
      <div class="playerCardHeadInfo">
        <div class="playerCardName">${escapeHtml(name || 'Player #' + num)}</div>
        <div class="playerCardMeta">${escapeHtml(position || 'Position not set')} &middot; #${escapeHtml(num)} &middot; ${escapeHtml(p.grade || '-')}</div>
        <div class="playerCardHW"><span>HT <b>${escapeHtml(p.height || '-')}</b></span><span>WT <b>${escapeHtml(p.weight || '-')}</b></span></div>
        <div id="playerCardEditSlot"></div>
      </div>`;
    body.appendChild(head);

    if (canEdit) {
      const editSlot = head.querySelector('#playerCardEditSlot');
      if (!editing) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'playerCardEditToggle';
        toggle.textContent = 'Edit photo / # / height / weight / grade';
        toggle.addEventListener('click', () => { editing = true; render(num, rosterEntry, games, profile); });
        editSlot.appendChild(toggle);
      } else {
        const form = document.createElement('div');
        form.className = 'playerCardEditForm';
        form.innerHTML = `
          <div>
            <label>Photo</label>
            <input type="file" accept="image/*" id="playerCardPhotoInput">
          </div>
          <div class="playerCardEditRow">
            <div><label>Jersey #</label><input type="text" id="playerCardNumInput" placeholder="e.g. 76" value="${escapeHtml(num || '')}"></div>
            <div><label>Grade</label><input type="text" id="playerCardGradeInput" placeholder="e.g. 6th Grade" value="${escapeHtml(p.grade || '')}"></div>
          </div>
          <div class="playerCardEditRow">
            <div><label>Height</label><input type="text" id="playerCardHeightInput" placeholder="e.g. 5'4&quot;" value="${escapeHtml(p.height || '')}"></div>
            <div><label>Weight</label><input type="text" id="playerCardWeightInput" placeholder="e.g. 98 lbs" value="${escapeHtml(p.weight || '')}"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:2px;">
            <button type="button" class="navBtn" id="playerCardSaveBtn" style="flex:1;padding:8px;">Save</button>
            <button type="button" class="navBtn secondary" id="playerCardCancelBtn" style="flex:1;padding:8px;">Cancel</button>
          </div>
          <div id="playerCardEditStatus" style="text-align:center;font-size:10.5px;color:#9aa4ae;"></div>`;
        editSlot.appendChild(form);

        let pendingPhoto = p.photo || null;
        const photoInput = form.querySelector('#playerCardPhotoInput');
        const statusEl = form.querySelector('#playerCardEditStatus');
        photoInput.addEventListener('change', () => {
          const file = photoInput.files && photoInput.files[0];
          if (!file) return;
          statusEl.textContent = 'Processing photo…';
          fileToPhotoDataUrl(file).then(dataUrl => {
            pendingPhoto = dataUrl;
            statusEl.textContent = 'Photo ready -- click Save.';
          }).catch(() => { statusEl.textContent = 'Could not read that photo.'; });
        });
        form.querySelector('#playerCardCancelBtn').addEventListener('click', () => {
          editing = false;
          render(num, rosterEntry, games, profile);
        });
        // Nathan: "Each parent who claims their player, should be able to
        // add a picture or update their #." Jersey # lives on the roster
        // entry (roster.js), not the photo/HT/WT/grade profile record --
        // saved separately via window.updateRosterPlayerNum, then the
        // whole card is re-fetched under the (possibly new) # so stats,
        // the photo placeholder, and everything else stay in sync.
        form.querySelector('#playerCardSaveBtn').addEventListener('click', () => {
          const newProfile = {
            photo: pendingPhoto || null,
            height: form.querySelector('#playerCardHeightInput').value.trim(),
            weight: form.querySelector('#playerCardWeightInput').value.trim(),
            grade: form.querySelector('#playerCardGradeInput').value.trim(),
          };
          const rosterId = rosterEntry && rosterEntry.id;
          if (!rosterId) { statusEl.textContent = 'Could not save -- player has no roster id.'; return; }
          const newNum = form.querySelector('#playerCardNumInput').value.trim();
          const numChanged = newNum && newNum !== String(num || '');
          statusEl.textContent = 'Saving…';
          saveProfile(rosterId, newProfile, () => {
            if (!numChanged) {
              editing = false;
              render(num, rosterEntry, games, newProfile);
              return;
            }
            if (!window.updateRosterPlayerNum) { editing = false; render(num, rosterEntry, games, newProfile); return; }
            window.updateRosterPlayerNum(rosterId, newNum, () => {
              editing = false;
              if (window.showPlayerProfile) window.showPlayerProfile(newNum);
            }, msg => { statusEl.textContent = `Photo/height/weight/grade saved, but # failed: ${msg}`; });
          }, msg => { statusEl.textContent = `Save failed: ${msg}`; });
        });
      }
    }

    // ---- Season / Career stat tables (fixed columns, "-" placeholders) ----
    [['Season Stats', '📅'], ['Career Stats', '🏆']].forEach(([title, icon], idx) => {
      const heading = document.createElement('div');
      heading.className = 'statsGroupHeading';
      heading.textContent = `${icon} ${title}`;
      if (idx === 1) {
        const note = document.createElement('span');
        note.className = 'lbSub';
        note.style.cssText = 'font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px;';
        note.textContent = '(tracking starts this season)';
        heading.appendChild(note);
      }
      const heading2 = document.createElement('div');
      heading2.className = 'lbList playerCardStatBox';
      const table = document.createElement('table');
      table.className = 'playerCardStatTable';
      table.innerHTML = `
        <thead><tr>${catsOrder.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}<th>GP</th></tr></thead>
        <tbody><tr>${catsOrder.map(c => statCell(hasGames, totals[c.key])).join('')}<td>${hasGames ? totals.games : '-'}</td></tr></tbody>`;
      heading2.appendChild(table);
      body.appendChild(heading);
      body.appendChild(heading2);
    });

    // ---- Recent Games ----
    const rgHeading = document.createElement('div');
    rgHeading.className = 'statsGroupHeading';
    rgHeading.textContent = '🕓 Recent Games';
    body.appendChild(rgHeading);

    const rgWrap = document.createElement('div');
    rgWrap.className = 'lbList playerCardGamesBox';

    if (!recentGames.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = 'No games recorded yet.';
      rgWrap.appendChild(empty);
    } else {
      const table = document.createElement('table');
      table.className = 'playerCardGamesTable';
      const rows = recentGames.slice(0, 10).map(({ game: g, rec }) => {
        const cols = gameCols.map(c => `<td>${formatNum(rec[c.key] || 0)}</td>`).join('');
        return `<tr>
          <td>${fmtDate(g.date)}</td>
          <td class="playerCardGameOpp">${g.homeAway === 'Away' ? '@' : 'vs'} ${escapeHtml(g.opponent || 'TBD')}</td>
          <td>${gameResult(g)}</td>
          ${cols}
        </tr>`;
      }).join('');
      table.innerHTML = `
        <thead><tr><th>Date</th><th>Opp</th><th>Res</th>${gameCols.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>`;
      rgWrap.appendChild(table);
    }
    body.appendChild(rgWrap);
  }

  window.showPlayerProfile = function (num) {
    const overlay = document.getElementById('playerProfileOverlay');
    const body = document.getElementById('playerProfileBody');
    if (!overlay || !body) return;
    editing = false;
    overlay.classList.add('show');
    body.innerHTML = '<div class="lbEmpty">Loading…</div>';

    const rosterReady = window.isTeamRosterLoaded && window.isTeamRosterLoaded()
      ? Promise.resolve()
      : (window.loadTeamRoster ? window.loadTeamRoster() : Promise.resolve());

    Promise.all([rosterReady, loadGames(), loadProfiles()]).then(([, games]) => {
      const roster = window.getTeamRosterCached ? window.getTeamRosterCached() : [];
      const rosterEntry = roster.find(p => String(p.num) === String(num));
      const profile = rosterEntry ? profiles[rosterEntry.id] : null;
      render(num, rosterEntry, games, profile);
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('playerProfileCloseBtn');
    const overlay = document.getElementById('playerProfileOverlay');
    if (closeBtn && overlay) closeBtn.addEventListener('click', () => overlay.classList.remove('show'));
  });
  // DOMContentLoaded may already have fired by the time this classic script
  // runs (it's loaded dynamically after boot()) -- wire immediately too.
  (function wireNow() {
    const closeBtn = document.getElementById('playerProfileCloseBtn');
    const overlay = document.getElementById('playerProfileOverlay');
    if (closeBtn && overlay && !closeBtn.dataset.wired) {
      closeBtn.dataset.wired = '1';
      closeBtn.addEventListener('click', () => overlay.classList.remove('show'));
    }
  })();
})();

// ---------------------------------------------------------------------------
// Schedule -- Nathan: "there was a schedule button that shows an interactive
// schedule for the year. All games listed with home or away, time and
// location in a whiteboard style display. After game results are added it
// shows a W in green or L in red to show the result. It should show score
// and have a button to show a write up for the game."
//
// Visible to everyone (a top-level section, same tier as This Week) -- only
// the add/edit/delete controls are gated to an approved coach profile
// (window.isApprovedCoachProfile(), auth.js). Games are entered by coaches
// through this page itself, same self-serve pattern as This Week and Drive
// Builder, rather than needing the season schedule handed over to be
// hardcoded. (Note: This Week and Schedule are both currently hidden from
// player logins entirely per a later request -- see refreshCoachToolsVisibility
// in study-quiz.js -- so "everyone" below means everyone who can currently
// reach this tab, i.e. any coach login, not just the named allowlist.)
//
// Nathan: "We could also incorporate another section for the coming week
// where coaches can call out... highlight any known tendencies or good
// players on the upcoming opponent." Rather than a separate section that
// has to track which game is "this week" on its own, that scouting info
// lives right on the relevant game here -- a "Scouting Report" free-text
// field, pre-game, same edit gate as the rest of a game's details.
//
// STATS -- Nathan: "Stats on a game and schedule should be independent. It
// should just be Add games to Schedule." Stats used to be embedded right in
// this game detail view (three redesigns' worth, see js/game-stats-editor.js
// for that history) -- now they live entirely in Coach Tools > Stats, which
// picks a game from this same schedule.json and writes into its statSheet
// field from over there. This file no longer touches statSheet UI at all,
// only the plain game record.
//
// TIMES -- Nathan: "We also need an Arrive by Time - Warm Up Start Time -
// Game Time." Replaces the old single free-text `time` field with three:
// arriveTime, warmupTime, gameTime. Older saved games only have `time` --
// openDetail() below folds that into gameTime on load so nothing old breaks.
//
// LOCATION -- Nathan: "need to be able to have Google recognize an address
// to pin a location." Full Places Autocomplete needs a billing-enabled
// Google Maps API key, which isn't set up here -- so `location` stays a
// plain address text field, but every place it's shown now also gets a
// "View on Map" link/embed built from a no-key Google Maps URL
// (maps.google.com/maps?q=...) -- a real pin, zero setup. Swap in real
// Autocomplete later by dropping a <script src="...maps.googleapis.com...">
// tag in and initializing it on #schedLocation once a key exists.
// ---------------------------------------------------------------------------
(function () {

  const SCHEDULE_URL = `${FIREBASE_DB_URL}/schedule.json`;
  const OPPONENT_LOGOS_URL = `${FIREBASE_DB_URL}/opponentLogos.json`;

  let games = [];     // [{id, opponent, date, arriveTime, warmupTime, gameTime, homeAway, location, ourScore, oppScore, writeup, scouting, statSheet, updatedAt}]
  let current = null; // game open in the detail view, or null (list view)
  let loaded = false;

  function genId() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---- Team badges -- Nathan: "I want the app to look like the styling of
  // ESPN mobile app with team logos." Real opponent logo art gets uploaded
  // by a coach right on the game's edit page (stored small, as a data URL,
  // in opponentLogos.json keyed by a normalized opponent name -- so
  // uploading Clinton's logo once covers every game against Clinton, past
  // or future, not just the one it was uploaded on). A few opponents ship
  // bundled as static assets (BUNDLED_LOGOS) so they work with zero setup;
  // uploaded logos in Firebase take priority if both exist. Anyone without
  // a logo on file yet gets an auto-generated colored initials badge
  // (deterministic color from the name) as a placeholder. Bengals always
  // use the real mascot logo already shipped for the header.
  const BUNDLED_LOGOS = {
    clinton: 'assets/images/opponents/clinton.png',
  };
  let opponentLogos = {}; // normalized opponent key -> data URL, loaded from Firebase

  function normalizeOpponentKey(name) {
    const cleaned = (name || '').replace(/\(.*?\)/g, '').trim(); // drop "(Scrimmage)" etc -- not part of the team name
    const firstWord = cleaned.split(/\s+/).filter(Boolean)[0] || '';
    return firstWord.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function hashColor(str) {
    let hash = 0;
    for (let i = 0; i < (str || '').length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 38%)`;
  }
  function initials(name) {
    const cleaned = (name || '').replace(/\(.*?\)/g, '').trim();
    const words = cleaned.split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
    if (!words.length) return '?';
    const letter = w => (w.match(/[a-zA-Z]/) || ['?'])[0];
    if (words.length === 1) return words[0].replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || '?';
    return (letter(words[0]) + letter(words[1])).toUpperCase();
  }
  function bengalsBadgeHtml() {
    return `<span class="scheduleTeamBadge"><img src="assets/images/header-logo.png" alt="ASL Bengals"></span>`;
  }
  function opponentLogoSrc(name) {
    const key = normalizeOpponentKey(name);
    return opponentLogos[key] || BUNDLED_LOGOS[key] || null;
  }
  function opponentBadgeHtml(name) {
    const logo = opponentLogoSrc(name);
    if (logo) return `<span class="scheduleTeamBadge"><img src="${logo}" alt="${escapeHtml(name || '')}"></span>`;
    return `<span class="scheduleTeamBadge" style="background:${hashColor(name)};">${escapeHtml(initials(name))}</span>`;
  }

  function loadOpponentLogos() {
    return window.firebaseAuthed(OPPONENT_LOGOS_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => { opponentLogos = (data && typeof data === 'object') ? data : {}; })
      .catch(err => { console.error('Could not load opponent logos:', err); opponentLogos = {}; });
  }
  function saveOpponentLogo(name, dataUrl, afterOk, afterFail) {
    const key = normalizeOpponentKey(name);
    if (!key) { if (afterFail) afterFail('Enter an opponent name first.'); return; }
    opponentLogos[key] = dataUrl;
    window.firebaseAuthed(OPPONENT_LOGOS_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opponentLogos),
    })).then(r => { if (r.ok) { if (afterOk) afterOk(); } else if (afterFail) afterFail(`HTTP ${r.status}`); })
      .catch(err => { console.error('Logo save failed:', err); if (afterFail) afterFail(err.message); });
  }
  // Downscales an uploaded image client-side (coaches will drop in whatever
  // size photo/logo they have) to a small badge-sized PNG before it goes
  // into Firebase -- keeps the whole opponentLogos.json record light.
  function fileToBadgeDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const max = 200;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function mapUrl(address) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
  }
  function mapSearchUrl(address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  function resultFor(g) {
    if (g.ourScore === null || g.ourScore === undefined || g.oppScore === null || g.oppScore === undefined || g.ourScore === '' || g.oppScore === '') return null;
    const us = Number(g.ourScore), them = Number(g.oppScore);
    if (isNaN(us) || isNaN(them)) return null;
    if (us > them) return 'W';
    if (us < them) return 'L';
    return 'T';
  }

  function fmtDate(dateStr) {
    if (!dateStr) return 'Date TBD';
    // date input value is 'YYYY-MM-DD' -- parse as local, not UTC, so the
    // displayed day never shifts by one depending on timezone.
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ---- Cloud load/save ----
  function loadGames() {
    const statusEl = document.getElementById('scheduleCloudStatus');
    if (statusEl) statusEl.textContent = 'Loading schedule…';
    const gamesFetch = window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => { games = Array.isArray(data) ? data.filter(g => g && g.id) : []; })
      .catch(err => { console.error('Could not load schedule:', err); if (statusEl) statusEl.textContent = 'Could not reach the cloud -- showing nothing saved yet.'; });
    return Promise.all([gamesFetch, loadOpponentLogos()]).then(() => {
      if (statusEl) statusEl.textContent = '';
      renderList();
    });
  }

  function persistGames(afterOk) {
    const statusEl = document.getElementById('scheduleDetailStatus') || document.getElementById('scheduleCloudStatus');
    window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(games),
    })).then(r => {
      if (r.ok) {
        if (afterOk) afterOk();
      } else if (statusEl) {
        statusEl.textContent = `Save failed (HTTP ${r.status}).`;
      }
    }).catch(err => {
      console.error('Schedule save failed:', err);
      if (statusEl) statusEl.textContent = `Save failed: ${err.message}`;
    });
  }

  // ---- List view ----
  function renderList() {
    const listEl = document.getElementById('scheduleList');
    const addWrap = document.getElementById('scheduleAddWrap');
    if (!listEl) return;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    if (addWrap) addWrap.style.display = approved ? '' : 'none';

    listEl.innerHTML = '';
    if (!games.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = approved ? 'No games on the schedule yet -- add one below.' : 'No games on the schedule yet.';
      listEl.appendChild(empty);
      return;
    }
    games.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).forEach(g => {
      const result = resultFor(g);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'scheduleRow';
      const badge = result
        ? `<span class="scheduleResultBadge ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'tie'}">${result}</span>`
        : `<span class="scheduleResultBadge upcoming">Upcoming</span>`;
      const gameTime = g.gameTime || g.time || ''; // g.time is the pre-Arrive/Warmup/Game-split field
      const usScore = result ? `<span class="scheduleTeamScore">${escapeHtml(String(g.ourScore))}</span>` : `<span class="scheduleTeamScore tbd">—</span>`;
      const themScore = result ? `<span class="scheduleTeamScore">${escapeHtml(String(g.oppScore))}</span>` : `<span class="scheduleTeamScore tbd">—</span>`;
      row.innerHTML = `
        <span class="scheduleRowDate">${fmtDate(g.date)}${gameTime ? ' • ' + escapeHtml(gameTime) : ''}${g.location ? ' • ' + escapeHtml(g.location) : ''}</span>
        <span class="scheduleRowMatchup">
          <span class="scheduleTeamSide home">${bengalsBadgeHtml()}<span class="scheduleTeamName">Bengals</span>${usScore}</span>
          <span class="scheduleRowCenter"><span class="scheduleRowLoc" style="max-width:none;">${g.homeAway === 'Away' ? '@' : 'vs'}</span>${badge}</span>
          <span class="scheduleTeamSide away">${themScore}<span class="scheduleTeamName">${escapeHtml(g.opponent || 'TBD')}</span>${opponentBadgeHtml(g.opponent)}</span>
        </span>`;
      row.addEventListener('click', () => openDetail(g.id));
      listEl.appendChild(row);
    });
  }

  // ---- Detail view (read-only for everyone, edit inputs added on top for an approved coach) ----
  function openDetail(id) {
    if (id) {
      const existing = games.find(g => g.id === id);
      current = existing ? { ...existing } : null;
    }
    if (!current) {
      current = { id: genId(), opponent: '', date: '', arriveTime: '', warmupTime: '', gameTime: '', homeAway: 'Home', location: '', ourScore: '', oppScore: '', writeup: '', scouting: '', statSheet: window.blankGameStatSheet(), updatedAt: null };
    }
    if (current.statSheet) current.statSheet = window.normalizeGameStatSheet(current.statSheet); // older saved games predate this field / had the old shape
    if (typeof current.scouting !== 'string') current.scouting = '';
    if (!current.gameTime && current.time) current.gameTime = current.time; // fold in the old single-time field
    current.arriveTime = current.arriveTime || '';
    current.warmupTime = current.warmupTime || '';
    current.gameTime = current.gameTime || '';
    document.getElementById('scheduleListWrap').style.display = 'none';
    document.getElementById('scheduleDetail').style.display = '';
    renderDetail();
  }

  function closeDetail() {
    current = null;
    document.getElementById('scheduleDetail').style.display = 'none';
    document.getElementById('scheduleListWrap').style.display = '';
    renderList();
  }

  function renderDetail() {
    const body = document.getElementById('scheduleDetailBody');
    const editControls = document.getElementById('scheduleDetailEditControls');
    const deleteBtn = document.getElementById('scheduleDeleteBtn');
    if (!body || !current) return;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    editControls.style.display = approved ? '' : 'none';
    if (deleteBtn) deleteBtn.style.display = games.some(g => g.id === current.id) ? '' : 'none';

    const timesLine = [
      current.arriveTime ? `Arrive ${escapeHtml(current.arriveTime)}` : '',
      current.warmupTime ? `Warm-up ${escapeHtml(current.warmupTime)}` : '',
      current.gameTime ? `Kickoff ${escapeHtml(current.gameTime)}` : '',
    ].filter(Boolean).join(' • ');

    const heroHtml = (() => {
      const result = resultFor(current);
      const badgeHtml = result
        ? `<span class="scheduleResultBadge ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'tie'}">${result}</span>`
        : `<span class="scheduleResultBadge upcoming">Upcoming</span>`;
      const usScore = result ? `<span class="scheduleTeamScore">${escapeHtml(String(current.ourScore))}</span>` : `<span class="scheduleTeamScore tbd">—</span>`;
      const themScore = result ? `<span class="scheduleTeamScore">${escapeHtml(String(current.oppScore))}</span>` : `<span class="scheduleTeamScore tbd">—</span>`;
      return `
        <div class="scheduleDetailHero">
          <div class="scheduleRowDate" style="text-align:center;margin-bottom:10px;">${fmtDate(current.date)}${timesLine ? ' • ' + timesLine : ''}</div>
          <div class="scheduleRowMatchup">
            <span class="scheduleTeamSide home">${bengalsBadgeHtml()}<span class="scheduleTeamName">Bengals</span>${usScore}</span>
            <span class="scheduleRowCenter">${badgeHtml}</span>
            <span class="scheduleTeamSide away">${themScore}<span class="scheduleTeamName">${escapeHtml(current.opponent || 'TBD')}</span>${opponentBadgeHtml(current.opponent)}</span>
          </div>
        </div>`;
    })();

    if (!approved) {
      // ---- Read-only view ----
      body.innerHTML = `
        ${heroHtml}
        <div class="lbSub" style="margin-bottom:10px;text-align:center;">${escapeHtml(current.location || 'Location TBD')} • ${current.homeAway || 'Home'}</div>
        ${current.location ? `<a href="${mapSearchUrl(current.location)}" target="_blank" rel="noopener" class="lbLinkBtn">📍 View on Map</a><iframe src="${mapUrl(current.location)}" style="width:100%;height:140px;border:0;border-radius:8px;margin-top:6px;" loading="lazy"></iframe>` : ''}
        <div id="schedGamePlanWrap" style="display:none;">
          <div class="lbSectionHeader" style="margin-top:16px;">🎯 This Week's Keys</div>
          <ol id="schedGamePlanKeys" class="thisweekKeysList"></ol>
          <div class="gameplanCardsGrid" id="schedGamePlanCards"></div>
        </div>
        <div class="lbSectionHeader" style="margin-top:16px;">🔎 Scouting Report</div>
        <div class="scheduleWriteup">${current.scouting ? escapeHtml(current.scouting).replace(/\n/g, '<br>') : '<span class="lbEmpty" style="padding:0;">No scouting notes yet.</span>'}</div>
        <div class="lbSectionHeader" style="margin-top:16px;">📝 Game Write-Up</div>
        <div class="scheduleWriteup">${current.writeup ? escapeHtml(current.writeup).replace(/\n/g, '<br>') : '<span class="lbEmpty" style="padding:0;">No write-up yet.</span>'}</div>`;
      loadLinkedGamePlan();
      return;
    }

    // ---- Coach edit view ----
    body.innerHTML = `
      ${heroHtml}
      <input type="text" id="schedOpponent" placeholder="Opponent" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:15px;font-weight:700;box-sizing:border-box;margin-bottom:8px;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <label class="lbLinkBtn" style="cursor:pointer;">🖼️ Upload Team Logo<input type="file" id="schedLogoInput" accept="image/*" style="display:none;"></label>
        <span id="schedLogoStatus" class="lbSub" style="margin:0;"></span>
      </div>
      <input type="date" id="schedDate" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
        <input type="text" id="schedArriveTime" placeholder="Arrive by (e.g. 8:30 AM)" style="flex:1 1 150px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <input type="text" id="schedWarmupTime" placeholder="Warm-up start (e.g. 9:00 AM)" style="flex:1 1 150px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <input type="text" id="schedGameTime" placeholder="Game time (e.g. 10:00 AM)" style="flex:1 1 150px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
      </div>
      <div style="display:flex;gap:8px;margin-bottom:4px;">
        <input type="text" id="schedLocation" placeholder="Address (e.g. 123 Field Rd, Leominster MA)" style="flex:1;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <a id="schedMapLink" href="#" target="_blank" rel="noopener" class="lbLinkBtn" style="white-space:nowrap;align-self:center;">📍 View on Map</a>
      </div>
      <div id="schedMapPreviewWrap" style="margin-bottom:8px;"></div>
      <div class="gameplanPickerGrid" id="schedHomeAwayGrid" style="margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
        <span class="lbSub" style="margin:0;">Final score:</span>
        <input type="number" id="schedOurScore" placeholder="Us" style="width:64px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <span>-</span>
        <input type="number" id="schedOppScore" placeholder="Them" style="width:64px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <span class="lbSub" style="margin:0;">(leave blank until played)</span>
      </div>
      <div class="lbSectionHeader" style="margin-top:6px;">🔎 Scouting Report</div>
      <div class="lbSub" style="margin:2px 0 8px;">Known tendencies, notable players, anything else worth calling out about this opponent -- visible to the whole team ahead of the game.</div>
      <textarea id="schedScouting" placeholder="e.g. &quot;#7 is their best runner, mostly runs right. Weak on outside contain.&quot;" style="width:100%;min-height:80px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;margin-bottom:4px;"></textarea>
      <div class="lbSub" style="margin:8px 0;">Stats for this game are entered separately under Coach Tools &gt; Stats, once it's played.</div>
      <div class="lbSectionHeader" style="margin-top:16px;">📝 Game Write-Up</div>
      <textarea id="schedWriteup" placeholder="How the game went…" style="width:100%;min-height:90px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;"></textarea>`;

    document.getElementById('schedOpponent').value = current.opponent || '';
    document.getElementById('schedDate').value = current.date || '';
    document.getElementById('schedArriveTime').value = current.arriveTime || '';
    document.getElementById('schedWarmupTime').value = current.warmupTime || '';
    document.getElementById('schedGameTime').value = current.gameTime || '';
    document.getElementById('schedLocation').value = current.location || '';
    document.getElementById('schedOurScore').value = current.ourScore === null || current.ourScore === undefined ? '' : current.ourScore;
    document.getElementById('schedOppScore').value = current.oppScore === null || current.oppScore === undefined ? '' : current.oppScore;
    document.getElementById('schedWriteup').value = current.writeup || '';
    document.getElementById('schedScouting').value = current.scouting || '';

    function refreshMapPreview() {
      const loc = document.getElementById('schedLocation').value.trim();
      const link = document.getElementById('schedMapLink');
      const previewWrap = document.getElementById('schedMapPreviewWrap');
      if (loc) {
        link.href = mapSearchUrl(loc);
        link.style.opacity = '1'; link.style.pointerEvents = '';
        previewWrap.innerHTML = `<iframe src="${mapUrl(loc)}" style="width:100%;height:140px;border:0;border-radius:8px;" loading="lazy"></iframe>`;
      } else {
        link.href = '#'; link.style.opacity = '.4'; link.style.pointerEvents = 'none';
        previewWrap.innerHTML = '';
      }
    }
    document.getElementById('schedLocation').addEventListener('input', refreshMapPreview);
    refreshMapPreview();

    const logoInput = document.getElementById('schedLogoInput');
    const logoStatus = document.getElementById('schedLogoStatus');
    if (logoInput) {
      logoInput.addEventListener('change', () => {
        const file = logoInput.files && logoInput.files[0];
        if (!file) return;
        const opponentName = document.getElementById('schedOpponent').value.trim() || current.opponent;
        if (!opponentName) { logoStatus.textContent = 'Enter the opponent name first.'; return; }
        logoStatus.textContent = 'Uploading…';
        fileToBadgeDataUrl(file).then(dataUrl => {
          saveOpponentLogo(opponentName, dataUrl, () => {
            logoStatus.textContent = `Saved -- used for every ${opponentName} game.`;
            renderDetail(); // repaint the hero with the new logo immediately
          }, msg => { logoStatus.textContent = `Upload failed: ${msg}`; });
        }).catch(err => { console.error('Logo processing failed:', err); logoStatus.textContent = 'Could not read that image.'; });
      });
    }

    const haGrid = document.getElementById('schedHomeAwayGrid');
    ['Home', 'Away'].forEach(v => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gameplanChip' + (current.homeAway === v ? ' active' : '');
      chip.textContent = v;
      chip.addEventListener('click', () => { current.homeAway = v; renderDetail(); });
      haGrid.appendChild(chip);
    });
  }

  // If This Week (js/thisweek.js) is currently pointed at this game, pull
  // its 3 Keys + featured plays onto this game's own page too -- Nathan:
  // "assign Weekly Goals and game plans to the upcoming games so players
  // can check them out and be prepared."
  function loadLinkedGamePlan() {
    const wrap = document.getElementById('schedGamePlanWrap');
    if (!wrap || !current) return;
    const THISWEEK_URL = `${FIREBASE_DB_URL}/thisWeek.json`;
    window.firebaseAuthed(THISWEEK_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || data.gameId !== current.id) { wrap.style.display = 'none'; return; }
        const keys = (Array.isArray(data.keys) ? data.keys : []).map(k => (k || '').trim()).filter(Boolean);
        const plays = Array.isArray(data.plays) ? data.plays : [];
        if (!keys.length && !plays.length) { wrap.style.display = 'none'; return; }
        wrap.style.display = '';
        const keysList = document.getElementById('schedGamePlanKeys');
        if (keysList) { keysList.innerHTML = ''; keys.forEach(k => { const li = document.createElement('li'); li.textContent = k; keysList.appendChild(li); }); }
        if (window.renderFeaturedPlayCards) window.renderFeaturedPlayCards(document.getElementById('schedGamePlanCards'), plays);
      })
      .catch(err => console.error('Could not load linked This Week game plan:', err));
  }

  // Lets other modules (This Week's "This week's game" link) jump straight
  // to a specific game's detail page from outside this file.
  window.openScheduleGame = function (gameId) {
    if (typeof window.setSection === 'function') window.setSection('schedule');
    else if (typeof setSection === 'function') setSection('schedule');
    function actuallyOpen() {
      document.getElementById('scheduleListWrap').style.display = 'none';
      document.getElementById('scheduleDetail').style.display = '';
      openDetail(gameId);
    }
    if (!loaded) {
      loaded = true;
      loadGames().then(actuallyOpen);
    } else {
      actuallyOpen();
    }
  };

  function saveCurrent() {
    if (!current) return;
    current.opponent = document.getElementById('schedOpponent').value.trim();
    current.date = document.getElementById('schedDate').value;
    current.arriveTime = document.getElementById('schedArriveTime').value.trim();
    current.warmupTime = document.getElementById('schedWarmupTime').value.trim();
    current.gameTime = document.getElementById('schedGameTime').value.trim();
    current.location = document.getElementById('schedLocation').value.trim();
    const ourScoreRaw = document.getElementById('schedOurScore').value.trim();
    const oppScoreRaw = document.getElementById('schedOppScore').value.trim();
    current.ourScore = ourScoreRaw === '' ? '' : Number(ourScoreRaw);
    current.oppScore = oppScoreRaw === '' ? '' : Number(oppScoreRaw);
    current.writeup = document.getElementById('schedWriteup').value.trim();
    current.scouting = document.getElementById('schedScouting').value.trim();
    if (!current.opponent) {
      const statusEl = document.getElementById('scheduleDetailStatus');
      if (statusEl) statusEl.textContent = 'Give the game an opponent first.';
      return;
    }
    current.updatedAt = new Date().toISOString();
    const idx = games.findIndex(g => g.id === current.id);
    if (idx >= 0) games[idx] = current; else games.push(current);
    persistGames(() => closeDetail());
  }

  function deleteCurrent() {
    if (!current) return;
    if (!confirm(`Delete the game vs ${current.opponent || 'this opponent'}? This can't be undone.`)) return;
    games = games.filter(g => g.id !== current.id);
    persistGames(() => closeDetail());
  }

  let controlsWired = false;
  function wireControls() {
    if (controlsWired) return;
    controlsWired = true;
    document.getElementById('scheduleNewBtn').addEventListener('click', () => { current = null; openDetail(null); });
    document.getElementById('scheduleBackBtn').addEventListener('click', closeDetail);
    document.getElementById('scheduleSaveBtn').addEventListener('click', saveCurrent);
    document.getElementById('scheduleDeleteBtn').addEventListener('click', deleteCurrent);
  }

  window.initSchedule = function () {
    wireControls();
    if (!loaded) {
      loaded = true;
      loadGames();
    } else {
      document.getElementById('scheduleDetail').style.display = 'none';
      document.getElementById('scheduleListWrap').style.display = '';
      renderList();
    }
  };
})();

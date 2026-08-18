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

  // Nathan: "I also need to tag the game as something - for instance the
  // Clinton game is a scrimmage and the Marlborough game is the jamboree."
  // 'Regular Season' is the default and deliberately shown nowhere -- most
  // games ARE that, so only the exceptions (scrimmages, jamborees,
  // playoffs) get a visible tag.
  const GAME_TYPES = ['Regular Season', 'Scrimmage', 'Jamboree', 'Playoff'];

  let games = [];     // [{id, opponent, date, arriveTime, warmupTime, gameTime, homeAway, location, ourScore, oppScore, writeup, scouting, statSheet, updatedAt, fieldPhoto, infoUrl}]
  let current = null; // game open in the detail view, or null (list view)
  let loaded = false;
  // Nathan: "would be awesome if we could include an image of the field
  // we are playing at - also include links for more info such as the
  // jamboree." fieldPhoto is a downscaled data URL (same pattern as the
  // opponent logo/player photo uploads elsewhere in this app), stored per
  // game rather than per-opponent since a photo of "the field" is tied to
  // the specific venue for that game, not the opponent's identity.
  // pendingFieldPhoto holds an uploaded-but-not-yet-saved photo across the
  // edit session -- module-level (not local to renderDetail's edit
  // branch) so syncFormToCurrent()/saveCurrent() below can read it too.
  let pendingFieldPhoto = null;
  // Nathan: "when I am logged in as a coach, I cant see it how the players
  // see it. Give me an edit button at the top that puts me in editable
  // mode." A coach used to always land straight in the edit form with no
  // way back to what players actually see -- now every detail page opens
  // read-only by default (same as a player), even for an approved coach,
  // with an "Edit" button to switch into the form. editMode always resets
  // to false when a fresh detail is opened (openDetail below) so it's
  // never "sticky" from a previous visit.
  let editMode = false;

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
  // Nathan: "can we do PNG logos for the teams instead of having them in
  // the little circles? I would also like the logo to appear bigger."
  // hasLogo drops the circle crop/background for real team PNGs (shown
  // full via object-fit:contain in CSS) -- the colored-circle-with-
  // initials look is now reserved for the no-logo-on-file fallback only.
  function bengalsBadgeHtml() {
    return `<span class="scheduleTeamBadge hasLogo"><img src="assets/images/header-logo.png" alt="ASL Bengals"></span>`;
  }
  function opponentLogoSrc(name) {
    const key = normalizeOpponentKey(name);
    return opponentLogos[key] || BUNDLED_LOGOS[key] || null;
  }
  function opponentBadgeHtml(name) {
    const logo = opponentLogoSrc(name);
    if (logo) return `<span class="scheduleTeamBadge hasLogo"><img src="${logo}" alt="${escapeHtml(name || '')}"></span>`;
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
          // Bumped from 200 -> 320: logos now render at full size (not
          // cropped into a small circle), so they need more source
          // resolution to still look sharp at the bigger display size.
          const max = 320;
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

  // Same downscale-before-storing pattern as fileToBadgeDataUrl above and
  // player-profile.js's player-photo upload -- 360px/JPEG q0.85 to match
  // the latter, since this is a photographic image (a field/venue), not a
  // small badge-style logo.
  function fileToFieldPhotoDataUrl(file) {
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

  // Nathan: "If teams have a record, it should be shown below the team
  // name on the game cards." We only track results for our own games (an
  // opponent's overall season record against everyone else isn't data
  // this app has), so this is the Bengals' own W-L(-T) record, computed
  // from every completed game -- shown the same on every card/hero rather
  // than a snapshot of "record entering this specific game," which would
  // need per-game history snapshots we don't keep.
  function bengalsRecord(list) {
    let w = 0, l = 0, t = 0;
    (list || []).forEach(g => {
      const r = resultFor(g);
      if (r === 'W') w++; else if (r === 'L') l++; else if (r === 'T') t++;
    });
    if (w + l + t === 0) return '';
    return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
  }

  // Nathan: "Add in an AI write up preview of the game going on what you
  // have." Same reasoning as This Week's Week Ahead write-up (see
  // js/thisweek.js) -- this is a static site with no backend, so a real
  // hosted LLM call would mean shipping an API key publicly. This composes
  // a short preview from data the app actually has: the Bengals' record,
  // the matchup/date/time/location, and head-to-head history against this
  // same opponent (matched by normalizeOpponentKey so "Clinton" and
  // "Clinton (Scrimmage)" count as the same team).
  function buildGamePreviewText(game, allGames) {
    if (!game || !game.opponent) return '';
    const record = bengalsRecord(allGames);
    const recordPart = record ? ` (${record})` : '';
    const verb = game.homeAway === 'Away' ? 'travel to face' : 'host';
    const dateStr = game.date ? fmtDate(game.date) : 'a date still to be determined';
    // Nathan: "there is a lot of info about arriving for 12pm and warm up
    // at 1pm and game at 230pm -- that should all be mentioned in the game
    // preview." Previously this only surfaced kickoff time; now it lists
    // whichever of arrive/warm-up/kickoff are actually filled in for this
    // game (older games that only ever had a single Time field just fall
    // back to kickoff-only, same as before).
    const timeParts = [];
    if (game.arriveTime) timeParts.push(`arrive ${to12h(game.arriveTime)}`);
    if (game.warmupTime) timeParts.push(`warm-up ${to12h(game.warmupTime)}`);
    if (game.gameTime) timeParts.push(`kickoff ${to12h(game.gameTime)}`);
    const timeStr = timeParts.length ? ` (${timeParts.join(', ')})` : '';
    const typeWord = game.gameType === 'Playoff' ? 'Playoff game'
      : (game.gameType && game.gameType !== 'Regular Season' ? game.gameType : 'matchup');
    const locPart = game.location ? ` at ${game.location}` : '';

    const oppKey = normalizeOpponentKey(game.opponent);
    const past = (allGames || []).filter(g => g.id !== game.id && normalizeOpponentKey(g.opponent) === oppKey && resultFor(g));
    let seriesPart;
    if (past.length) {
      let w = 0, l = 0, t = 0;
      past.forEach(g => { const r = resultFor(g); if (r === 'W') w++; else if (r === 'L') l++; else t++; });
      if (w > l) seriesPart = ` The Bengals lead the series ${w}-${l}${t ? `-${t}` : ''} against ${game.opponent} this season.`;
      else if (l > w) seriesPart = ` ${game.opponent} leads the series ${l}-${w}${t ? `-${t}` : ''} against the Bengals this season.`;
      else seriesPart = ` The series against ${game.opponent} is tied ${w}-${w}${t ? `-${t}` : ''} this season.`;
    } else {
      seriesPart = ' This is the first meeting between these two teams this season.';
    }

    // Nathan: "add some context -- this is the opening jamboree of the
    // season, it will be a good test to see how we fair against another
    // opponent." Data-driven rather than hardcoded to one specific game:
    // fires for any Jamboree that happens to be the earliest-dated game on
    // the whole schedule, so it stays correct automatically if next
    // season's opener is scheduled the same way.
    let openerPart = '';
    if (game.gameType === 'Jamboree' && game.date) {
      const dated = (allGames || []).filter(g => g.date);
      const earliest = dated.slice().sort((a, b) => a.date.localeCompare(b.date))[0];
      if (earliest && earliest.id === game.id) {
        openerPart = ' This is the Bengals\' season-opening Jamboree -- a good early test to see how the team stacks up against another opponent.';
      }
    }

    const base = `The Bengals${recordPart} ${verb} ${game.opponent} in a${/^[aeiou]/i.test(typeWord) ? 'n' : ''} ${typeWord} on ${dateStr}${timeStr}${locPart}.${openerPart}${seriesPart}`;
    const statsText = teamLeadersAndAveragesText(allGames);
    return statsText ? `${base} ${statsText}` : base;
  }

  // Nathan: "Game previews should have team leaders and team stat averages
  // that we have available." Reuses the exact same aggregation Coach
  // Tools > Stats' leaderboard uses (window.computeGamePlayerStats, plus
  // js/game-stats-editor.js's normalize/hasAnything helpers) rather than a
  // second copy of that math -- this file just re-runs it locally since
  // coachtools-stats.js keeps its own season aggregate private to its
  // closure.
  function teamSeasonAggregate(allGames) {
    const CATS = [
      { key: 'rushYds', label: 'rushing yards' }, { key: 'passYds', label: 'passing yards' },
      { key: 'recYds', label: 'receiving yards' }, { key: 'koYds', label: 'kickoff yards' },
    ];
    const byNum = {};
    const playedGames = [];
    if (!window.computeGamePlayerStats || !window.normalizeGameStatSheet || !window.gameStatSheetHasAnything) {
      return { byNum, playedGames, CATS };
    }
    (allGames || []).forEach(g => {
      if (!g.statSheet) return;
      const norm = window.normalizeGameStatSheet(g.statSheet);
      if (!window.gameStatSheetHasAnything(norm)) return;
      playedGames.push(g);
      const perGame = window.computeGamePlayerStats(g.statSheet);
      Object.values(perGame).forEach(rec => {
        if (!byNum[rec.num]) byNum[rec.num] = { num: rec.num, name: rec.name, rushYds: 0, passYds: 0, recYds: 0, koYds: 0, tackles: 0, int: 0, pbu: 0, sacks: 0 };
        const agg = byNum[rec.num];
        if (rec.name && !agg.name) agg.name = rec.name;
        ['rushYds', 'passYds', 'recYds', 'koYds', 'tackles', 'int', 'pbu', 'sacks'].forEach(k => { agg[k] += rec[k] || 0; });
      });
    });
    return { byNum, playedGames, CATS };
  }
  function formatNum(n) {
    const v = Number(n) || 0;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
  function teamLeadersAndAveragesText(allGames) {
    const { byNum, playedGames, CATS } = teamSeasonAggregate(allGames);
    const players = Object.values(byNum);
    if (!players.length || !playedGames.length) return '';

    // Lead with whichever offensive category the team has actually put up
    // the most total yards in this season -- e.g. a run-heavy team gets a
    // rushing leader/average called out, a pass-heavy team gets passing.
    const offenseTotals = CATS.filter(c => c.key !== 'koYds').map(c => ({ ...c, total: players.reduce((s, p) => s + p[c.key], 0) }));
    const topOffense = offenseTotals.sort((a, b) => b.total - a.total)[0];

    const leaderLines = [];
    if (topOffense && topOffense.total > 0) {
      const leader = players.slice().sort((a, b) => b[topOffense.key] - a[topOffense.key])[0];
      if (leader && leader[topOffense.key] > 0) {
        leaderLines.push(`#${leader.num}${leader.name ? ' ' + escapeHtml(leader.name) : ''} leads the team in ${topOffense.label} (${formatNum(leader[topOffense.key])}).`);
      }
    }
    const tacklesLeader = players.slice().sort((a, b) => b.tackles - a.tackles)[0];
    if (tacklesLeader && tacklesLeader.tackles > 0) {
      leaderLines.push(`#${tacklesLeader.num}${tacklesLeader.name ? ' ' + escapeHtml(tacklesLeader.name) : ''} leads the defense with ${formatNum(tacklesLeader.tackles)} tackles.`);
    }

    const avgParts = [];
    if (topOffense && topOffense.total > 0) avgParts.push(`${formatNum(topOffense.total / playedGames.length)} ${topOffense.label}`);
    const totalTackles = players.reduce((s, p) => s + p.tackles, 0);
    if (totalTackles > 0) avgParts.push(`${formatNum(totalTackles / playedGames.length)} tackles`);
    const avgLine = avgParts.length ? ` The Bengals are averaging ${avgParts.join(' and ')} per game this season.` : '';

    return `${leaderLines.join(' ')}${avgLine}`.trim();
  }

  function renderGamePreview() {
    const wrap = document.getElementById('schedGamePreviewWrap');
    const textEl = document.getElementById('schedGamePreviewText');
    if (!wrap || !textEl || !current) return;
    const text = buildGamePreviewText(current, games);
    wrap.style.display = text ? '' : 'none';
    textEl.textContent = text;
  }

  function renderWeather() {
    const wrap = document.getElementById('schedWeatherWrap');
    if (!wrap || !current || !window.loadWeatherInto) return;
    window.loadWeatherInto(wrap, current.location, current.date, current.gameTime);
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

  // Nathan: "saving the schedule on my phone worked but it assigned all
  // day instead of the times I selected. Since it's not a time field we
  // did, maybe it isn't recognizing the time." Root cause: Arrive/Warm-up/
  // Game Time used to be free-text inputs, and js/calendar-export.js's
  // parseTime() only accepted a strict "8:30 AM" shape -- anything typed
  // slightly differently (no colon, no space, etc.) on a phone keyboard
  // silently failed to parse and the .ics event fell back to all-day.
  // Fixed by switching these to real <input type="time"> pickers, which
  // always hand back a clean 24hr "HH:MM" string -- no parsing ambiguity
  // possible. to24h() below is only needed to migrate whatever an older
  // free-text save left behind so it still populates the picker instead
  // of showing blank; to12h() turns a clean "HH:MM" back into "8:30 AM"
  // for read-only display everywhere the time gets shown as text.
  function to24h(str) {
    if (!str) return '';
    const s = str.trim().toLowerCase();
    const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!m) return '';
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    const ap = m[3];
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) return '';
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  function to12h(str) {
    if (!str) return '';
    const m = str.trim().match(/^(\d{1,2}):(\d{2})$/); // strict 24hr, no am/pm -- already-formatted strings pass through untouched
    if (!m) return str;
    let h = Number(m[1]);
    const min = m[2];
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${min} ${ap}`;
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
    const recordStr = bengalsRecord(games);
    const recordHtml = recordStr ? `<span class="scheduleTeamRecord">${escapeHtml(recordStr)}</span>` : '';
    games.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).forEach(g => {
      const result = resultFor(g);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'scheduleRow';
      const badge = result
        ? `<span class="scheduleResultBadge ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'tie'}">${result}</span>`
        : `<span class="scheduleResultBadge upcoming">Upcoming</span>`;
      const gameTime = to12h(g.gameTime || g.time || ''); // g.time is the pre-Arrive/Warmup/Game-split field
      const usScore = result ? `<span class="scheduleTeamScore">${escapeHtml(String(g.ourScore))}</span>` : '';
      const themScore = result ? `<span class="scheduleTeamScore">${escapeHtml(String(g.oppScore))}</span>` : '';
      const locLine = `${g.homeAway === 'Away' ? 'AWAY' : 'HOME'}${g.location ? ' • ' + escapeHtml(g.location) : ''}${g.infoUrl ? ' <span title="More info available on this game">🔗</span>' : ''}`;
      const gameTypeTag = g.gameType && g.gameType !== 'Regular Season' ? `<span class="scheduleGameTypeTag">${escapeHtml(g.gameType)}</span>` : '';
      const weatherId = `scheduleRowWeather-${g.id}`;
      row.innerHTML = `
        ${gameTypeTag}
        <span class="scheduleRowDate">${locLine}</span>
        <span class="scheduleRowMatchup">
          <span class="scheduleTeamSide home">${bengalsBadgeHtml()}<span class="scheduleTeamName">Bengals</span>${recordHtml}${usScore}</span>
          <span class="scheduleRowCenter">
            <span class="scheduleRowCenterDate">${fmtDate(g.date)}</span>
            ${gameTime ? `<span class="scheduleRowCenterTime">${escapeHtml(gameTime)}</span>` : ''}
            ${badge}
          </span>
          <span class="scheduleTeamSide away">${opponentBadgeHtml(g.opponent)}<span class="scheduleTeamName">${escapeHtml(g.opponent || 'TBD')}</span>${themScore}</span>
        </span>
        <div class="scheduleRowWeatherCenter" id="${weatherId}" style="display:none;"></div>`;
      row.addEventListener('click', () => openDetail(g.id));
      listEl.appendChild(row);
      // Nathan: "add that little weather icon in the bottom of the center
      // of the Game card." Same fired-after-append pattern as practice
      // rows (js/practices.js) -- compact chip, hidden by default until
      // (if) the forecast resolves.
      if (window.loadCompactWeatherInto) {
        window.loadCompactWeatherInto(document.getElementById(weatherId), g.location, g.date, g.gameTime || g.time || '');
      }
    });
  }

  // ---- Detail view (read-only for everyone, edit inputs added on top for an approved coach) ----
  function openDetail(id) {
    if (id) {
      const existing = games.find(g => g.id === id);
      current = existing ? { ...existing } : null;
    }
    if (!current) {
      current = { id: genId(), opponent: '', date: '', arriveTime: '', warmupTime: '', gameTime: '', homeAway: 'Home', location: '', gameType: 'Regular Season', ourScore: '', oppScore: '', writeup: '', scouting: '', statSheet: window.blankGameStatSheet(), updatedAt: null, fieldPhoto: null, infoUrl: '' };
    }
    if (current.statSheet) current.statSheet = window.normalizeGameStatSheet(current.statSheet); // older saved games predate this field / had the old shape
    if (typeof current.scouting !== 'string') current.scouting = '';
    if (!current.gameTime && current.time) current.gameTime = current.time; // fold in the old single-time field
    current.arriveTime = current.arriveTime || '';
    current.warmupTime = current.warmupTime || '';
    current.gameTime = current.gameTime || '';
    current.gameType = GAME_TYPES.includes(current.gameType) ? current.gameType : 'Regular Season'; // older saved games predate this field
    current.fieldPhoto = current.fieldPhoto || null; // older saved games predate this field
    current.infoUrl = current.infoUrl || '';
    pendingFieldPhoto = current.fieldPhoto; // fresh edit session starts from whatever's already saved
    // Brand-new, never-saved games have nothing to preview yet -- open
    // those straight into the edit form; anything already on the
    // schedule opens read-only first, same as a player would see it.
    editMode = !games.some(g => g.id === current.id);
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
    const showEditForm = approved && editMode;
    editControls.style.display = showEditForm ? '' : 'none';
    if (deleteBtn) deleteBtn.style.display = games.some(g => g.id === current.id) ? '' : 'none';

    // Arrive/Warm-up sit on the hero's top line (context info, unique to
    // this hero); kickoff time moves into the center with the date, same
    // spot the list card uses -- see the CSS comment on .scheduleRowCenter.
    const preGameTimesLine = [
      current.arriveTime ? `Arrive ${escapeHtml(to12h(current.arriveTime))}` : '',
      current.warmupTime ? `Warm-up ${escapeHtml(to12h(current.warmupTime))}` : '',
    ].filter(Boolean).join(' • ');
    const timesLine = [
      current.arriveTime ? `Arrive ${escapeHtml(to12h(current.arriveTime))}` : '',
      current.warmupTime ? `Warm-up ${escapeHtml(to12h(current.warmupTime))}` : '',
      current.gameTime ? `Kickoff ${escapeHtml(to12h(current.gameTime))}` : '',
    ].filter(Boolean).join(' • ');

    const heroHtml = (() => {
      const result = resultFor(current);
      const badgeHtml = result
        ? `<span class="scheduleResultBadge ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'tie'}">${result}</span>`
        : `<span class="scheduleResultBadge upcoming">Upcoming</span>`;
      const usScore = result ? `<span class="scheduleTeamScore">${escapeHtml(String(current.ourScore))}</span>` : '';
      const themScore = result ? `<span class="scheduleTeamScore">${escapeHtml(String(current.oppScore))}</span>` : '';
      const topLine = `${current.homeAway === 'Away' ? 'AWAY' : 'HOME'}${preGameTimesLine ? ' • ' + preGameTimesLine : ''}`;
      const gameTypeTag = current.gameType && current.gameType !== 'Regular Season' ? `<div style="text-align:center;margin-bottom:8px;"><span class="scheduleGameTypeTag">${escapeHtml(current.gameType)}</span></div>` : '';
      const heroRecordStr = bengalsRecord(games);
      const heroRecordHtml = heroRecordStr ? `<span class="scheduleTeamRecord">${escapeHtml(heroRecordStr)}</span>` : '';
      return `
        <div class="scheduleDetailHero">
          ${gameTypeTag}
          <div class="scheduleRowDate" style="text-align:center;margin-bottom:10px;">${topLine}</div>
          <div class="scheduleRowMatchup">
            <span class="scheduleTeamSide home">${bengalsBadgeHtml()}<span class="scheduleTeamName">Bengals</span>${heroRecordHtml}${usScore}</span>
            <span class="scheduleRowCenter">
              <span class="scheduleRowCenterDate">${fmtDate(current.date)}</span>
              ${current.gameTime ? `<span class="scheduleRowCenterTime">${escapeHtml(to12h(current.gameTime))}</span>` : ''}
              ${badgeHtml}
            </span>
            <span class="scheduleTeamSide away">${opponentBadgeHtml(current.opponent)}<span class="scheduleTeamName">${escapeHtml(current.opponent || 'TBD')}</span>${themScore}</span>
          </div>
        </div>`;
    })();

    if (!showEditForm) {
      // ---- Read-only view (also what an approved coach sees by default
      // now -- see the editMode comment up top) ----
      body.innerHTML = `
        ${approved ? `<div style="text-align:center;margin-bottom:10px;"><button type="button" class="lbLinkBtn" id="schedEditToggleBtn">✏️ Edit This Game</button></div>` : ''}
        ${heroHtml}
        <div id="schedGamePreviewWrap" class="thisweekKeysBox" style="display:none;">
          <div class="thisweekKeysTitle">📰 Game Preview</div>
          <div id="schedGamePreviewText" style="font-size:14px;font-weight:600;line-height:1.45;"></div>
        </div>
        <div id="schedWeatherWrap" style="display:none;"></div>
        <div class="lbSub" style="margin-bottom:6px;text-align:center;">${escapeHtml(current.location || 'Location TBD')}</div>
        <div style="text-align:center;margin-bottom:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button type="button" class="lbLinkBtn" id="schedAddToCalBtn">📅 Add to Calendar</button>
          ${current.infoUrl ? `<a href="${escapeHtml(current.infoUrl)}" target="_blank" rel="noopener" class="lbLinkBtn">🔗 More Info</a>` : ''}
        </div>
        ${current.fieldPhoto ? `<img src="${current.fieldPhoto}" alt="Field/venue photo" style="width:100%;border-radius:10px;margin-bottom:8px;display:block;">` : ''}
        ${current.location ? `<a href="${mapSearchUrl(current.location)}" target="_blank" rel="noopener" class="lbLinkBtn">📍 View on Map</a><iframe src="${mapUrl(current.location)}" style="width:100%;height:140px;border:0;border-radius:8px;margin-top:6px;" loading="lazy"></iframe>` : ''}
        <div id="schedGamePlanWrap" style="display:none;">
          <div class="lbSectionHeader" style="margin-top:16px;">🎯 This Week's Keys</div>
          <ol id="schedGamePlanKeys" class="thisweekKeysList"></ol>
          <div class="gameplanCardsGrid" id="schedGamePlanCards"></div>
        </div>
        <div class="lbSectionHeader" style="margin-top:16px;">🔎 Scouting Report</div>
        <div class="scheduleWriteup">${current.scouting ? escapeHtml(current.scouting).replace(/\n/g, '<br>') : '<span class="lbEmpty" style="padding:0;">No scouting notes yet.</span>'}</div>
        <div class="lbSectionHeader" style="margin-top:16px;">📝 Game Write-Up</div>
        <div class="scheduleWriteup">${current.writeup ? escapeHtml(current.writeup).replace(/\n/g, '<br>') : '<span class="lbEmpty" style="padding:0;">No write-up yet.</span>'}</div>
        <div class="scheduleFinePrint">Game Preview is auto-generated from this game's Schedule info.</div>`;
      const editToggleBtn = document.getElementById('schedEditToggleBtn');
      if (editToggleBtn) editToggleBtn.addEventListener('click', () => { editMode = true; renderDetail(); });
      wireAddToCalendar();
      loadLinkedGamePlan();
      renderGamePreview();
      renderWeather();
      return;
    }

    // ---- Coach edit view ----
    body.innerHTML = `
      <div style="text-align:center;margin-bottom:10px;"><button type="button" class="lbLinkBtn" id="schedPreviewToggleBtn">👁 Preview (Player View)</button></div>
      ${heroHtml}
      <div id="schedGamePreviewWrap" class="thisweekKeysBox" style="display:none;">
        <div class="thisweekKeysTitle">📰 Game Preview</div>
        <div id="schedGamePreviewText" style="font-size:14px;font-weight:600;line-height:1.45;"></div>
      </div>
      <div id="schedWeatherWrap" style="display:none;"></div>
      <input type="text" id="schedOpponent" placeholder="Opponent" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:15px;font-weight:700;box-sizing:border-box;margin-bottom:8px;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
        <label class="lbLinkBtn" style="cursor:pointer;">🖼️ Upload Team Logo<input type="file" id="schedLogoInput" accept="image/*" style="display:none;"></label>
        <span id="schedLogoStatus" class="lbSub" style="margin:0;"></span>
        <button type="button" class="lbLinkBtn" id="schedAddToCalBtn">📅 Add to Calendar</button>
      </div>
      <input type="date" id="schedDate" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
        <div style="flex:1 1 120px;"><div class="lbSub" style="margin:0 0 3px;">Arrive by</div><input type="time" id="schedArriveTime" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;"></div>
        <div style="flex:1 1 120px;"><div class="lbSub" style="margin:0 0 3px;">Warm-up</div><input type="time" id="schedWarmupTime" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;"></div>
        <div style="flex:1 1 120px;"><div class="lbSub" style="margin:0 0 3px;">Game Time</div><input type="time" id="schedGameTime" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;"></div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:4px;">
        <input type="text" id="schedLocation" placeholder="Address (e.g. 123 Field Rd, Leominster MA)" style="flex:1;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <a id="schedMapLink" href="#" target="_blank" rel="noopener" class="lbLinkBtn" style="white-space:nowrap;align-self:center;">📍 View on Map</a>
      </div>
      <div id="schedMapPreviewWrap" style="margin-bottom:8px;"></div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;flex-wrap:wrap;">
        <label class="lbLinkBtn" style="cursor:pointer;">🖼️ Upload Field Photo<input type="file" id="schedFieldPhotoInput" accept="image/*" style="display:none;"></label>
        <span id="schedFieldPhotoStatus" class="lbSub" style="margin:0;"></span>
      </div>
      <div id="schedFieldPhotoPreviewWrap" style="margin-bottom:8px;"></div>
      <input type="text" id="schedInfoUrl" placeholder="More info link (e.g. https://hudsonyouthfootball.com/jamboree/)" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <div class="lbSub" style="margin:0 0 4px;">Game type:</div>
      <div class="gameplanPickerGrid" id="schedGameTypeGrid" style="margin-bottom:12px;"></div>
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
      <textarea id="schedWriteup" placeholder="How the game went…" style="width:100%;min-height:90px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;"></textarea>
      <div class="scheduleFinePrint">Game Preview is auto-generated -- updates once you save.</div>`;

    document.getElementById('schedOpponent').value = current.opponent || '';
    document.getElementById('schedDate').value = current.date || '';
    document.getElementById('schedArriveTime').value = to24h(current.arriveTime);
    document.getElementById('schedWarmupTime').value = to24h(current.warmupTime);
    document.getElementById('schedGameTime').value = to24h(current.gameTime);
    document.getElementById('schedLocation').value = current.location || '';
    document.getElementById('schedOurScore').value = current.ourScore === null || current.ourScore === undefined ? '' : current.ourScore;
    document.getElementById('schedOppScore').value = current.oppScore === null || current.oppScore === undefined ? '' : current.oppScore;
    document.getElementById('schedWriteup').value = current.writeup || '';
    document.getElementById('schedScouting').value = current.scouting || '';
    document.getElementById('schedInfoUrl').value = current.infoUrl || '';

    function renderFieldPhotoPreview() {
      const wrap = document.getElementById('schedFieldPhotoPreviewWrap');
      if (!wrap) return;
      wrap.innerHTML = pendingFieldPhoto
        ? `<img src="${pendingFieldPhoto}" alt="Field/venue photo" style="width:100%;border-radius:10px;display:block;">`
        : '';
    }
    renderFieldPhotoPreview();

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

    // Field photo -- unlike the opponent logo above, this is NOT saved
    // immediately on choosing a file; it's held in pendingFieldPhoto and
    // only actually written to Firebase when the whole game is Saved
    // (syncFormToCurrent/saveCurrent below), same deferred pattern as
    // every other field on this form.
    const fieldPhotoInput = document.getElementById('schedFieldPhotoInput');
    const fieldPhotoStatus = document.getElementById('schedFieldPhotoStatus');
    if (fieldPhotoInput) {
      fieldPhotoInput.addEventListener('change', () => {
        const file = fieldPhotoInput.files && fieldPhotoInput.files[0];
        if (!file) return;
        fieldPhotoStatus.textContent = 'Processing photo…';
        fileToFieldPhotoDataUrl(file).then(dataUrl => {
          pendingFieldPhoto = dataUrl;
          fieldPhotoStatus.textContent = 'Photo ready -- click Save.';
          renderFieldPhotoPreview();
        }).catch(err => { console.error('Field photo processing failed:', err); fieldPhotoStatus.textContent = 'Could not read that image.'; });
      });
    }
    wireAddToCalendar();

    const haGrid = document.getElementById('schedHomeAwayGrid');
    ['Home', 'Away'].forEach(v => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gameplanChip' + (current.homeAway === v ? ' active' : '');
      chip.textContent = v;
      chip.addEventListener('click', () => { current.homeAway = v; renderDetail(); });
      haGrid.appendChild(chip);
    });

    const gtGrid = document.getElementById('schedGameTypeGrid');
    GAME_TYPES.forEach(v => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gameplanChip' + (current.gameType === v ? ' active' : '');
      chip.textContent = v;
      chip.addEventListener('click', () => { current.gameType = v; renderDetail(); });
      gtGrid.appendChild(chip);
    });
    const previewToggleBtn = document.getElementById('schedPreviewToggleBtn');
    if (previewToggleBtn) {
      previewToggleBtn.addEventListener('click', () => {
        syncFormToCurrent(); // pulls in whatever's typed so far, even if incomplete/unsaved
        editMode = false;
        renderDetail();
      });
    }
    renderGamePreview();
    renderWeather();
  }

  // If This Week (js/thisweek.js) is currently pointed at this game, pull
  // its 3 Keys + featured plays onto this game's own page too -- Nathan:
  // "assign Weekly Goals and game plans to the upcoming games so players
  // can check them out and be prepared."
  // Nathan: "give me the option of saving all the events to your device or
  // Google calendars or Apple calendars" -- single-event .ics for whichever
  // game is currently open (js/calendar-export.js has the full-schedule
  // bulk version).
  function wireAddToCalendar() {
    const btn = document.getElementById('schedAddToCalBtn');
    if (!btn || !current) return;
    btn.addEventListener('click', () => {
      if (!current.date) { alert('Add a date first.'); return; }
      if (!window.buildICS || !window.downloadICS) return;
      const ics = window.buildICS([{
        uid: current.id, date: current.date, time: current.gameTime || current.time || '', durationMinutes: 120,
        title: `ASL Bengals ${current.homeAway === 'Away' ? '@' : 'vs'} ${current.opponent || 'TBD'}${current.gameType && current.gameType !== 'Regular Season' ? ' (' + current.gameType + ')' : ''}`,
        location: current.location || '',
        description: [current.arriveTime ? `Arrive by ${to12h(current.arriveTime)}` : '', current.warmupTime ? `Warm-up ${to12h(current.warmupTime)}` : ''].filter(Boolean).join(' • '),
      }]);
      window.downloadICS(`ASL_Bengals_vs_${(current.opponent || 'game').replace(/[^a-z0-9]+/gi, '_')}.ics`, ics);
    });
  }

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
    if (window.showScheduleGamesTab) window.showScheduleGamesTab();
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

  // Reads the edit form's current field values into `current`, without
  // persisting or closing -- shared by saveCurrent() (which also persists)
  // and the "Preview (Player View)" button (which just wants to render
  // whatever's been typed so far, unsaved, the way a player would see
  // it). Returns false (and leaves current untouched otherwise) if the
  // opponent field is blank, since that's the one required field.
  function syncFormToCurrent() {
    if (!current) return false;
    const opponent = document.getElementById('schedOpponent').value.trim();
    if (!opponent) return false;
    current.opponent = opponent;
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
    current.infoUrl = document.getElementById('schedInfoUrl').value.trim();
    current.fieldPhoto = pendingFieldPhoto;
    return true;
  }

  function saveCurrent() {
    if (!current) return;
    if (!syncFormToCurrent()) {
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

  // Used by Full Schedule (js/schedule-full.js) to merge games in without
  // needing the Games tab to have been opened first.
  window.getGamesCached = () => games;
  window.ensureGamesLoaded = function () {
    if (loaded) return Promise.resolve(games);
    loaded = true;
    return loadGames().then(() => games);
  };
})();

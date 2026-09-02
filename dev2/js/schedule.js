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
  // Own light read-only copy of js/player-profile.js's private photo store
  // (roster id -> {photo,...}), same "duplicate a small local copy instead
  // of exposing a new global" convention this file already uses for
  // opponent logos -- just enough to put a real headshot on a Season
  // Leaders card instead of always falling back to initials.
  const PLAYER_PROFILES_URL = `${FIREBASE_DB_URL}/playerProfiles.json`;
  let playerProfiles = {}; // roster id -> {photo, height, weight, grade}
  let playerProfilesLoaded = false;
  function loadPlayerProfilesLocal() {
    if (playerProfilesLoaded) return Promise.resolve(playerProfiles);
    return window.firebaseAuthed(PLAYER_PROFILES_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => { playerProfiles = (data && typeof data === 'object') ? data : {}; playerProfilesLoaded = true; return playerProfiles; })
      .catch(err => { console.error('Could not load player photos for Season Leaders:', err); playerProfiles = {}; playerProfilesLoaded = true; return playerProfiles; });
  }

  // Nathan: "I also need to tag the game as something - for instance the
  // Clinton game is a scrimmage and the Marlborough game is the jamboree."
  // 'Regular Season' is the default and deliberately shown nowhere -- most
  // games ARE that, so only the exceptions (scrimmages, jamborees,
  // playoffs) get a visible tag.
  const GAME_TYPES = ['Regular Season', 'Scrimmage', 'Jamboree', 'Playoff'];

  let games = [];     // [{id, opponent, date, arriveTime, warmupTime, gameTime, homeAway, location, ourScore, oppScore, writeup, scouting, statSheet, updatedAt, fieldPhoto, infoUrl, opponentFilmUrl, opponentFilmNote}]
  let current = null; // game open in the detail view, or null (list view)
  let loaded = false;
  // Nathan: "when you go to this week ahead, and you click on a game or
  // practice, it brings me to the edit screen instead of the info screen."
  // Root cause: openScheduleGame() (used by This Week's cards) calls
  // window.setSection('schedule') first, which synchronously runs
  // initSchedule() -> sets `loaded = true` and kicks off loadGames() (async,
  // not awaited) -- so by the time openScheduleGame's own `if (!loaded)`
  // check ran, `loaded` was already true (just set by initSchedule a
  // moment ago), and it opened the detail view immediately, before `games`
  // had actually been fetched. openDetail() then couldn't find the game by
  // id, treated it as a brand-new unsaved one, and forced edit mode --
  // exactly the symptom reported. gamesReadyPromise is the fix: both
  // initSchedule() and openScheduleGame() share the same in-flight promise,
  // so whichever one starts the fetch, the other always waits on the real
  // result instead of racing a flag.
  let gamesReadyPromise = null;
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

  // Shared one-liner ("Bengals defeated/fell to/tied X 20-14") used both by
  // buildGameHighlightsText's stat-based recap below and by
  // buildGameRecapText's no-stats-yet fallback, so a completed game without
  // a box score entered still gets a real score line instead of nothing.
  function scoreLineFor(game) {
    const result = resultFor(game);
    if (!result) return '';
    return `The Bengals ${result === 'W' ? 'defeated' : result === 'L' ? 'fell to' : 'tied'} ${game.opponent || 'their opponent'} ${game.ourScore}-${game.oppScore}.`;
  }

  // Nathan: "Once an event date has passed don't show it as upcoming... it
  // should be a running calendar and date should be reflective of the
  // dates. Only keep the upcoming badge there until the event time has
  // passed." Without this, a game that already happened but hasn't had its
  // score entered yet kept saying "Upcoming" forever -- date-driven, not
  // score-driven. Parses the same 'YYYY-MM-DD' + 'HH:MM' shapes fmtDate/
  // to12h already use elsewhere in this file. When only a date is known (no
  // kickoff time saved yet), the game stays "not passed" through the end of
  // that calendar day rather than flipping the instant midnight local time
  // starts, so a same-day game doesn't lose its Upcoming badge mid-morning
  // just because no time was ever entered.
  function hasEventPassed(dateStr, timeStr) {
    if (!dateStr) return false;
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return false;
    const tm = (timeStr || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    const d = tm
      ? new Date(parts[0], parts[1] - 1, parts[2], Number(tm[1]), Number(tm[2]))
      : new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
    return d.getTime() < Date.now();
  }

  // Nathan: "If teams have a record, it should be shown below the team
  // name on the game cards." We only track results for our own games (an
  // opponent's overall season record against everyone else isn't data
  // this app has), so this is the Bengals' own W-L(-T) record, computed
  // from every completed game -- shown the same on every card/hero rather
  // than a snapshot of "record entering this specific game," which would
  // need per-game history snapshots we don't keep.
  // Nathan: "Any scrimmage or jamboree results are preseason games and
  // should not count towards the teams regular season standings." Scrimmage
  // and Jamboree are practice-style tune-up games (see GAME_TYPES above),
  // so they're excluded here even though they still show scores/W-L badges
  // on their own game card elsewhere in this file -- this is specifically
  // the season *record* tally.
  function countsTowardRecord(g) {
    return g.gameType !== 'Scrimmage' && g.gameType !== 'Jamboree';
  }
  function bengalsRecord(list) {
    let w = 0, l = 0, t = 0;
    (list || []).filter(countsTowardRecord).forEach(g => {
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

  // Nathan: "make an AI write up of some of the game highlights based on
  // what happened. This should be what shows in the Game results section
  // when a game is complete." Same "no backend" reasoning as
  // buildGamePreviewText above -- this composes a recap from the real
  // per-player stats (js/coachtools-stats.js's shared
  // computeGamePlayerStats, the exact same aggregator the leaderboard and
  // player profiles use) instead of calling a hosted model. Unlike the
  // preview, this feeds the coach-editable Game Write-Up field via a "Fill
  // from Stats" button rather than auto-displaying, since a recap is
  // something a coach will want to personalize afterward.
  function buildGameHighlightsText(game) {
    if (!game || !window.computeGamePlayerStats || !window.normalizeGameStatSheet || !window.gameStatSheetHasAnything) return '';
    const norm = window.normalizeGameStatSheet(game.statSheet);
    if (!window.gameStatSheetHasAnything(norm)) return '';
    const perPlayer = Object.values(window.computeGamePlayerStats(game.statSheet));
    // Plain text, not HTML -- this feeds a textarea's .value, so no
    // escapeHtml() here (that's for innerHTML destinations elsewhere in
    // this file; escaping here would leave literal "&#39;"-style entities
    // sitting in the write-up text instead of real characters).
    const playerName = p => `#${p.num}${p.name ? ' ' + p.name : ''}`;

    const scoreLine = scoreLineFor(game);

    const scorers = perPlayer.filter(p => p.td > 0).sort((a, b) => b.td - a.td);
    const passers = perPlayer.filter(p => p.passTd > 0).sort((a, b) => b.passTd - a.passTd);
    const tdParts = [];
    scorers.forEach(p => tdParts.push(`${playerName(p)} scored ${p.td > 1 ? p.td + ' touchdowns' : 'a touchdown'}`));
    passers.forEach(p => tdParts.push(`${playerName(p)} threw ${p.passTd > 1 ? p.passTd + ' touchdown passes' : 'a touchdown pass'}`));
    const tdLine = tdParts.length ? tdParts.join('; ') + '.' : '';

    const yardCats = [
      { key: 'rushYds', label: 'rushing yards' },
      { key: 'passYds', label: 'passing yards' },
      { key: 'recYds', label: 'receiving yards' },
    ];
    const standoutParts = [];
    yardCats.forEach(c => {
      const leader = perPlayer.filter(p => p[c.key] > 0).sort((a, b) => b[c.key] - a[c.key])[0];
      if (leader) standoutParts.push(`${playerName(leader)} led the team with ${formatNum(leader[c.key])} ${c.label}`);
    });
    const standoutLine = standoutParts.length ? standoutParts.join('; ') + '.' : '';

    const defenseParts = [];
    const tackleLeader = perPlayer.filter(p => p.tackles > 0).sort((a, b) => b.tackles - a.tackles)[0];
    if (tackleLeader) defenseParts.push(`${playerName(tackleLeader)} led the defense with ${formatNum(tackleLeader.tackles)} tackles`);
    perPlayer.filter(p => p.int > 0).forEach(p => defenseParts.push(`${playerName(p)} had ${p.int > 1 ? p.int + ' interceptions' : 'an interception'}`));
    perPlayer.filter(p => p.sacks > 0).forEach(p => defenseParts.push(`${playerName(p)} had ${p.sacks > 1 ? p.sacks + ' sacks' : 'a sack'}`));
    const defenseLine = defenseParts.length ? defenseParts.join('; ') + '.' : '';

    return [scoreLine, tdLine, standoutLine, defenseLine].filter(Boolean).join(' ');
  }

  // Nathan: "When a game is complete, let's make sure it changes from a game
  // preview writeup to a game recap write up." Feeds the same top-of-page
  // box renderGamePreview() fills in -- buildGamePreviewText before the
  // game, this after. Prefers the full stats-based recap from
  // buildGameHighlightsText above; if no box score has been entered yet
  // under Coach Tools > Stats, buildGameHighlightsText returns '' entirely
  // (it bails before ever building a score line), so this falls back to
  // just the final score via scoreLineFor rather than showing nothing for
  // a game that's clearly over.
  function buildGameRecapText(game) {
    if (!game || !resultFor(game)) return '';
    return buildGameHighlightsText(game) || scoreLineFor(game);
  }

  // ---- Head-to-Head (Nathan, from the Apple Sports "Team Stats" screenshot:
  // "It has a bar under the stat with a color representing each team's
  // stats as a portion of the total.") We only have our own stats in detail
  // (game-stats-editor.js's statSheet) -- Total Yards is computed straight
  // from that; the opponent side and Turnovers come from the light manual
  // entry added to the coach edit form above (schedOppYards/schedOurTurnovers/
  // schedOppTurnovers), same "fill it in after the game" spirit as the
  // score itself. Only shows once the game is actually final -- a live
  // in-game version isn't possible without someone on the sideline entering
  // it play by play, which Nathan ruled out. ----
  function ourTotalYardsFor(game) {
    if (!game || !game.statSheet || !window.computeGamePlayerStats) return 0;
    const perPlayer = window.computeGamePlayerStats(game.statSheet);
    return Object.values(perPlayer).reduce((s, r) => s + (r.rushYds || 0) + (r.passYds || 0), 0);
  }
  // Nathan: "Show stats like first downs." Same derived-from-statSheet
  // pattern as Total Yards above -- the fd toggle per rushing/passing/
  // receiving attempt (game-stats-editor.js) already existed, it just
  // wasn't summed into anything until coachtools-stats.js's
  // gamePlayerStats() started tracking it per player (rec.fd). Opponent's
  // side is a manual number (schedOppFirstDowns) same as oppYards, since we
  // have no play-by-play on them.
  function ourFirstDownsFor(game) {
    if (!game || !game.statSheet || !window.computeGamePlayerStats) return 0;
    const perPlayer = window.computeGamePlayerStats(game.statSheet);
    return Object.values(perPlayer).reduce((s, r) => s + (r.fd || 0), 0);
  }
  function h2hBarHtml(label, us, them, oppName) {
    const total = us + them;
    const usPct = total > 0 ? Math.round((us / total) * 100) : 50;
    const themPct = 100 - usPct;
    return `
      <div class="h2hStat">
        <div class="h2hStatRow">
          <span class="h2hVal us">${formatNum(us)}</span>
          <span class="h2hStatLabel">${escapeHtml(label)}</span>
          <span class="h2hVal them">${formatNum(them)}</span>
        </div>
        <div class="h2hBar">
          <span class="h2hBarUs" style="width:${usPct}%;"></span>
          <span class="h2hBarThem" style="width:${themPct}%;background:${hashColor(oppName)};"></span>
        </div>
      </div>`;
  }
  function renderHeadToHead() {
    const wrap = document.getElementById('schedH2HWrap');
    if (!wrap || !current) return;
    if (!resultFor(current)) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    const ourYards = ourTotalYardsFor(current);
    const oppYards = Number(current.oppYards) || 0;
    const ourFD = ourFirstDownsFor(current);
    const oppFD = Number(current.oppFirstDowns) || 0;
    const ourTOs = current.ourTurnovers === '' || current.ourTurnovers == null ? null : Number(current.ourTurnovers);
    const oppTOs = current.oppTurnovers === '' || current.oppTurnovers == null ? null : Number(current.oppTurnovers);
    const bars = [];
    if (ourYards > 0 || oppYards > 0) bars.push(h2hBarHtml('Total Yards', ourYards, oppYards, current.opponent));
    if (ourFD > 0 || oppFD > 0) bars.push(h2hBarHtml('First Downs', ourFD, oppFD, current.opponent));
    if (ourTOs != null || oppTOs != null) bars.push(h2hBarHtml('Turnovers', ourTOs || 0, oppTOs || 0, current.opponent));
    if (!bars.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    wrap.style.display = '';
    wrap.innerHTML = `<div class="lbSectionHeader">🥊 Head-to-Head</div><div class="h2hBox">${bars.join('')}</div>`;
  }

  // Nathan: "Need the ability to show where on the field the ball is at
  // all times so it would tell momentum in the game." Pulls the spot/seq
  // pairs game-stats-editor.js's "Ball Position" tracker stamped onto every
  // rushing/passing/receiving attempt (see commitAttempt there) back out in
  // true chronological order -- statSheet is otherwise organized by
  // player, not by time, so seq is what makes "the game's actual sequence
  // of plays" reconstructable at all.
  function fieldPositionSeries(game) {
    if (!game || !game.statSheet) return [];
    const ss = game.statSheet;
    const out = [];
    ['rushing', 'passing', 'receiving'].forEach(key => {
      (ss[key] || []).forEach(row => {
        (row.attempts || []).forEach(a => {
          if (a.spot !== null && a.spot !== undefined && a.seq !== null && a.seq !== undefined) out.push({ seq: a.seq, spot: a.spot });
        });
      });
    });
    return out.sort((a, b) => a.seq - b.seq);
  }
  // Simple inline-SVG line/area chart -- 0 (own goal line) at the bottom,
  // 100 (opponent's goal line) at the top, so a line trending up the chart
  // reads the same way it would on an actual field. No chart library
  // needed for something this small, same "plain SVG string" approach
  // h2hBarHtml above already uses for its bars.
  function momentumChartSvg(series) {
    const W = 600, H = 150, padL = 34, padR = 10, padT = 10, padB = 6;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const n = series.length;
    const x = i => padL + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const y = spot => padT + innerH - (Math.max(0, Math.min(100, spot)) / 100) * innerH;
    const floorY = (padT + innerH).toFixed(1);
    const midY = y(50).toFixed(1);
    const points = series.map((p, i) => `${x(i).toFixed(1)},${y(p.spot).toFixed(1)}`).join(' ');
    const fillPoints = `${x(0).toFixed(1)},${floorY} ${points} ${x(n - 1).toFixed(1)},${floorY}`;
    return `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
        <line x1="${padL}" y1="${midY}" x2="${W - padR}" y2="${midY}" stroke="#999" stroke-width="1" stroke-dasharray="3,3"/>
        <text x="${padL - 4}" y="${floorY}" font-size="9" fill="#888" text-anchor="end">Own GL</text>
        <text x="${padL - 4}" y="${midY}" font-size="9" fill="#888" text-anchor="end" dy="3">50</text>
        <text x="${padL - 4}" y="${(padT + 7).toFixed(1)}" font-size="9" fill="#888" text-anchor="end">Opp GL</text>
        <polygon points="${fillPoints}" style="fill:var(--bengal-orange);opacity:.15;"/>
        <polyline points="${points}" style="fill:none;stroke:var(--bengal-orange);stroke-width:2px;" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>`;
  }
  function renderMomentumChart() {
    const wrap = document.getElementById('schedMomentumWrap');
    if (!wrap || !current) return;
    const series = fieldPositionSeries(current);
    // Need at least 2 plotted plays for a line to mean anything -- a single
    // point (or none, e.g. every play skipped the optional Ball Position
    // override so ss._currentLos was never set) just hides the section
    // rather than showing an empty/flat chart.
    if (series.length < 2) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    wrap.style.display = '';
    wrap.innerHTML = `<div class="lbSectionHeader">📈 Momentum (Field Position)</div><div class="h2hBox">${momentumChartSvg(series)}</div>`;
  }

  // ---- Season Leaders -- Nathan: "Passing Yards, Rushing Yards, Receiving
  // Yards, Sacks, Tackles... showing their profile image with name under
  // it, even placeholders before stats are there." Reuses the same season
  // aggregation as the Game Preview write-up above (teamSeasonAggregate),
  // plus a local read-only copy of player-profile.js's photo store (see
  // loadPlayerProfilesLocal near the top of this file) so a real headshot
  // shows when one's on file, falling back to the same colored-initials
  // look used everywhere else in this app that doesn't have a photo yet. ----
  const LEADER_CATS = [
    { key: 'passYds', label: 'Passing Yards' },
    { key: 'rushYds', label: 'Rushing Yards' },
    { key: 'recYds', label: 'Receiving Yards' },
    { key: 'sacks', label: 'Sacks' },
    { key: 'tackles', label: 'Tackles' },
  ];
  function leaderCardHtml(cat, rec, roster) {
    if (!rec) {
      return `
        <div class="leaderCard">
          <div class="leaderCat">${escapeHtml(cat.label)}</div>
          <span class="leaderPhoto placeholder">?</span>
          <div class="leaderName lbEmpty" style="padding:0;">No stats yet</div>
        </div>`;
    }
    const rosterEntry = roster.find(r => String(r.num) === String(rec.num));
    const photo = rosterEntry ? (playerProfiles[rosterEntry.id] || {}).photo : null;
    const photoHtml = photo
      ? `<span class="leaderPhoto"><img src="${photo}" alt="${escapeHtml(rec.name || '')}"></span>`
      : `<span class="leaderPhoto" style="background:${hashColor(rec.name || String(rec.num))};">${escapeHtml(initials(rec.name || String(rec.num)))}</span>`;
    return `
      <div class="leaderCard">
        <div class="leaderCat">${escapeHtml(cat.label)}</div>
        ${photoHtml}
        <div class="leaderName">#${escapeHtml(String(rec.num))} ${escapeHtml(rec.name || '')}</div>
        <div class="leaderStat">${formatNum(rec[cat.key])}</div>
      </div>`;
  }
  function renderSeasonLeaders() {
    const wrap = document.getElementById('schedLeadersWrap');
    if (!wrap) return;
    const { byNum } = teamSeasonAggregate(games);
    const players = Object.values(byNum);
    loadPlayerProfilesLocal().then(() => {
      const roster = window.getTeamRosterCached ? window.getTeamRosterCached() : [];
      const cards = LEADER_CATS.map(cat => {
        const top = players.filter(p => p[cat.key] > 0).sort((a, b) => b[cat.key] - a[cat.key])[0];
        return leaderCardHtml(cat, top || null, roster);
      }).join('');
      wrap.innerHTML = `<div class="lbSectionHeader">🏆 Season Leaders</div><div class="leaderGrid">${cards}</div>`;
    });
  }

  // ---- Last 5 Games / Vs This Opponent -- Nathan: "two tab section showin
  // LAST 5 GAMES. Show date opponent and result with score." Reuses the
  // exact same .scheduleRow card the main list already uses (compact date
  // on top instead of the full home/away+location line) so these read as
  // the same component, not a new one-off. The second tab reuses the same
  // past-meetings filter buildGamePreviewText already computes for the
  // series-record sentence, just rendered as real rows instead of a line
  // of text. ----
  function compactGameRowHtml(g) {
    const result = resultFor(g);
    const badge = result
      ? `<span class="scheduleResultBadge ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'tie'}">${result}</span>`
      : hasEventPassed(g.date, g.gameTime || g.time) ? '' : `<span class="scheduleResultBadge upcoming">Upcoming</span>`;
    const usScore = result ? `<span class="scheduleTeamScore">${escapeHtml(String(g.ourScore))}</span>` : '';
    const themScore = result ? `<span class="scheduleTeamScore">${escapeHtml(String(g.oppScore))}</span>` : '';
    return `
      <button type="button" class="scheduleRow last5Row" data-game-id="${escapeHtml(g.id)}">
        <span class="scheduleRowDate">${fmtDate(g.date)}</span>
        <span class="scheduleRowMatchup">
          <span class="scheduleTeamSide home">${bengalsBadgeHtml()}<span class="scheduleTeamName">Bengals</span>${usScore}</span>
          <span class="scheduleRowCenter">${badge}</span>
          <span class="scheduleTeamSide away">${opponentBadgeHtml(g.opponent)}<span class="scheduleTeamName">${escapeHtml(g.opponent || 'TBD')}</span>${themScore}</span>
        </span>
      </button>`;
  }
  function renderLast5Panel(tab) {
    const wrap = document.getElementById('schedLast5Wrap');
    if (!wrap || !current) return;
    const played = games.filter(g => g.id !== current.id && resultFor(g)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const oppKey = normalizeOpponentKey(current.opponent);
    const vsOpp = played.filter(g => normalizeOpponentKey(g.opponent) === oppKey);
    const list = tab === 'vsopp' ? vsOpp : played.slice(0, 5);
    const rowsHtml = list.length ? list.map(compactGameRowHtml).join('') : '<div class="lbEmpty">No games yet.</div>';
    wrap.innerHTML = `
      <div class="lbSectionHeader">📊 Recent Form</div>
      <div class="gameplanPickerGrid" style="margin-bottom:10px;">
        <button type="button" class="gameplanChip${tab === 'last5' ? ' active' : ''}" data-last5tab="last5">Last 5 Games</button>
        <button type="button" class="gameplanChip${tab === 'vsopp' ? ' active' : ''}" data-last5tab="vsopp">${current.opponent ? 'Vs ' + escapeHtml(current.opponent) : 'Vs This Opponent'}</button>
      </div>
      <div class="last5List">${rowsHtml}</div>`;
    wrap.querySelectorAll('[data-last5tab]').forEach(btn => {
      btn.addEventListener('click', () => renderLast5Panel(btn.dataset.last5tab));
    });
    wrap.querySelectorAll('.last5Row').forEach(row => {
      row.addEventListener('click', () => openDetail(row.dataset.gameId));
    });
  }

  function renderGamePreview() {
    const wrap = document.getElementById('schedGamePreviewWrap');
    const titleEl = document.getElementById('schedGamePreviewTitle');
    const textEl = document.getElementById('schedGamePreviewText');
    if (!wrap || !textEl || !current) return;
    // Nathan: "When a game is complete, let's make sure it changes from a
    // game preview writeup to a game recap write up." Previously this box
    // always showed buildGamePreviewText, even for games long since final --
    // it never checked resultFor at all. Now a completed game (score
    // entered) swaps in the auto-generated recap instead.
    const isFinal = !!resultFor(current);
    const text = isFinal ? buildGameRecapText(current) : buildGamePreviewText(current, games);
    wrap.style.display = text ? '' : 'none';
    if (titleEl) titleEl.textContent = isFinal ? '📰 Game Recap' : '📰 Game Preview';
    textEl.textContent = text;
  }

  function renderWeather() {
    const wrap = document.getElementById('schedWeatherWrap');
    if (!wrap || !current || !window.loadWeatherInto) return;
    window.loadWeatherInto(wrap, current.location, current.date, current.gameTime);
  }

  const INJURY_STATUSES = ['Probable', 'Questionable', 'Out'];
  // Coach edit list -- picks a real roster player per row (not free text)
  // so the read-only side can show their real jersey number, same pattern
  // as Coach Tools' stat entry picking from the roster rather than retyping
  // names. Mutates current.injuryReport in place and re-renders just this
  // block, same add/remove-row pattern as game-stats-editor.js's Turnovers.
  function renderInjuryEditor() {
    const wrap = document.getElementById('schedInjuryWrap');
    if (!wrap || !current) return;
    if (window.loadTeamRoster && !window.isTeamRosterLoaded()) { window.loadTeamRoster().then(renderInjuryEditor); return; }
    const roster = window.getTeamRosterCached ? window.getTeamRosterCached() : [];
    const rows = current.injuryReport;
    wrap.innerHTML = '';
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = 'No one listed -- add a player below if needed.';
      wrap.appendChild(empty);
    }
    rows.forEach((entry, i) => {
      if (!entry.status) entry.status = 'Questionable';
      const row = document.createElement('div');
      row.className = 'injuryEditRow';
      const sel = document.createElement('select');
      sel.className = 'injuryEditSelect';
      const blankOpt = document.createElement('option'); blankOpt.value = ''; blankOpt.textContent = 'Pick a player…';
      sel.appendChild(blankOpt);
      roster.slice().sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0)).forEach(p => {
        const o = document.createElement('option');
        o.value = p.id; o.textContent = `#${p.num || '--'} ${p.name}`;
        if (entry.rosterId === p.id) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        const p = roster.find(r => r.id === sel.value);
        entry.rosterId = sel.value || null;
        entry.num = p ? p.num : '';
        entry.name = p ? p.name : '';
      });
      row.appendChild(sel);
      const statusSel = document.createElement('select');
      statusSel.className = 'injuryEditStatus';
      INJURY_STATUSES.forEach(s => {
        const o = document.createElement('option'); o.value = s; o.textContent = s;
        if (entry.status === s) o.selected = true;
        statusSel.appendChild(o);
      });
      statusSel.addEventListener('change', () => { entry.status = statusSel.value; });
      row.appendChild(statusSel);
      const noteInput = document.createElement('input');
      noteInput.type = 'text'; noteInput.placeholder = 'Note (optional)'; noteInput.className = 'injuryEditNote';
      noteInput.value = entry.note || '';
      noteInput.addEventListener('input', () => { entry.note = noteInput.value; });
      row.appendChild(noteInput);
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'statsRmBtnSmall'; rm.textContent = '✕';
      rm.addEventListener('click', () => { rows.splice(i, 1); renderInjuryEditor(); });
      row.appendChild(rm);
      wrap.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'lbLinkBtn'; addBtn.style.marginTop = '4px';
    addBtn.textContent = '+ Add Player';
    addBtn.addEventListener('click', () => { rows.push({ rosterId: null, num: '', name: '', status: 'Questionable', note: '' }); renderInjuryEditor(); });
    wrap.appendChild(addBtn);
  }

  function injuryReportReadOnlyHtml(game) {
    const rows = Array.isArray(game.injuryReport) ? game.injuryReport.filter(e => e.name) : [];
    if (!rows.length) return '<span class="lbEmpty" style="padding:0;">No injuries reported.</span>';
    return `<div class="injuryList">${rows.map(e => `
      <div class="injuryRow">
        <span class="injuryRowName">#${escapeHtml(String(e.num || '--'))} ${escapeHtml(e.name)}</span>
        <span class="injuryStatus ${(e.status || 'Questionable').toLowerCase()}">${escapeHtml(e.status || 'Questionable')}</span>
        ${e.note ? `<span class="injuryRowNote">${escapeHtml(e.note)}</span>` : ''}
      </div>`).join('')}</div>`;
  }

  // Nathan: "Need an option to add game Footage to the games on the app...
  // They live in my google drive, I can link the video in the drive." Just
  // a title + link per clip (e.g. "Q1", "Full Game") -- visible to everyone
  // (players/parents included, same as Scouting Report/Game Write-Up above)
  // in the read-only view; only approved coaches get the add/remove editor.
  // Nathan also asked for a "simple version" of casting to a TV: opening
  // this same link on whatever device you want (a tablet, a smart TV's
  // browser) already gets you that, via Google Drive's own player -- no
  // separate cast button needed here.
  function gameFootageReadOnlyHtml(game) {
    const clips = Array.isArray(game.gameFootage) ? game.gameFootage.filter(c => c.url) : [];
    if (!clips.length) return '<span class="lbEmpty" style="padding:0;">No footage linked yet.</span>';
    // Nathan: "remove telestrator for now as it doesn't work" -- pulled the
    // TeleStrator link (telestrator.html) that used to sit next to each
    // clip below. Plain footage links stay; telestrator.html itself is left
    // on disk, unlinked from anywhere in the app, so the drawing/cast work
    // already done on it isn't lost if it gets revisited later.
    return `<div style="display:flex;flex-direction:column;gap:6px;">${clips.map(c => `
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener" class="lbLinkBtn" style="justify-content:flex-start;flex:1;">🎥 ${escapeHtml(c.title || 'Game Footage')}</a>
      </div>`).join('')}</div>`;
  }

  // Coach edit list -- mutates current.gameFootage in place and re-renders
  // just this block, same pattern as renderInjuryEditor above.
  function renderGameFootageEditor() {
    const wrap = document.getElementById('schedFootageWrap');
    if (!wrap || !current) return;
    const clips = current.gameFootage;
    wrap.innerHTML = '';
    if (!clips.length) {
      const empty = document.createElement('div');
      empty.className = 'lbEmpty';
      empty.textContent = 'No footage linked yet -- add a Google Drive (or other) link below.';
      wrap.appendChild(empty);
    }
    clips.forEach((clip, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;';
      const titleInput = document.createElement('input');
      titleInput.type = 'text'; titleInput.placeholder = 'Title (e.g. "Q1" or "Full Game")'; titleInput.value = clip.title || '';
      titleInput.style.cssText = 'flex:1 1 140px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;';
      titleInput.addEventListener('input', () => { clip.title = titleInput.value; });
      row.appendChild(titleInput);
      const urlInput = document.createElement('input');
      urlInput.type = 'text'; urlInput.placeholder = 'Google Drive (or other) video link'; urlInput.value = clip.url || '';
      urlInput.style.cssText = 'flex:2 1 200px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;';
      urlInput.addEventListener('input', () => { clip.url = urlInput.value.trim(); });
      row.appendChild(urlInput);
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'statsRmBtnSmall'; rm.textContent = '✕';
      rm.addEventListener('click', () => { clips.splice(i, 1); renderGameFootageEditor(); });
      row.appendChild(rm);
      wrap.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'lbLinkBtn'; addBtn.style.marginTop = '4px';
    addBtn.textContent = '+ Add Footage Link';
    addBtn.addEventListener('click', () => { clips.push({ id: genId(), title: '', url: '' }); renderGameFootageEditor(); });
    wrap.appendChild(addBtn);
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
    // Nathan: "when going to schedule - the next game should show at the
    // pinned at the top of the view. older dates should be listed below it
    // in the history." Pulls out the single soonest game that hasn't been
    // played yet (same hasEventPassed() the Upcoming badge above already
    // uses) and pins it first, then lists everything else newest-first so
    // it reads as a history feed working backward in time underneath it --
    // matches how every other list in this app (This Week, leaderboard)
    // puts the most current thing at the top.
    const sortedByDate = games.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const nextGame = sortedByDate.find(g => !hasEventPassed(g.date, g.gameTime || g.time));
    const rest = sortedByDate.filter(g => g !== nextGame)
      .sort((a, b) => (b.date || '0000').localeCompare(a.date || '0000'));
    const orderedGames = nextGame ? [nextGame].concat(rest) : rest;
    orderedGames.forEach(g => {
      const result = resultFor(g);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'scheduleRow';
      const badge = result
        ? `<span class="scheduleResultBadge ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'tie'}">${result}</span>`
        : hasEventPassed(g.date, g.gameTime || g.time) ? '' : `<span class="scheduleResultBadge upcoming">Upcoming</span>`;
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
      current = { id: genId(), opponent: '', date: '', arriveTime: '', warmupTime: '', gameTime: '', homeAway: 'Home', location: '', gameType: 'Regular Season', ourScore: '', oppScore: '', writeup: '', scouting: '', statSheet: window.blankGameStatSheet(), updatedAt: null, fieldPhoto: null, infoUrl: '', oppYards: '', ourTurnovers: '', oppTurnovers: '', oppFirstDowns: '', injuryReport: [], gameFootage: [], gameFootageAnnotations: [], opponentFilmUrl: '', opponentFilmNote: '' };
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
    // Nathan: "Once we add in all the stats from the game including a box
    // score and figures, we want to have the ESPN style graphs with a stat
    // call out in the center and a bar showing a representation of the
    // numbers." We already track every Bengals stat in detail via statSheet,
    // but nothing about the OPPONENT -- these three light manual numbers
    // (entered after the game, same as Final Score already is, not live-
    // tracked) are just enough to drive a real us-vs-them bar for Total
    // Yards and Turnovers instead of only ever showing our own side.
    current.oppYards = current.oppYards === undefined ? '' : current.oppYards;
    current.ourTurnovers = current.ourTurnovers === undefined ? '' : current.ourTurnovers;
    current.oppTurnovers = current.oppTurnovers === undefined ? '' : current.oppTurnovers;
    // Nathan: "Show stats like first downs." Same "older saved games predate
    // this field" backfill as oppYards/ourTurnovers/oppTurnovers above.
    current.oppFirstDowns = current.oppFirstDowns === undefined ? '' : current.oppFirstDowns;
    // Nathan: "Injury Report section that coaches can add in guys to it
    // with a write-in for status." Lives on the game itself (like Scouting
    // Report) since it's inherently about who's available for THIS game.
    current.injuryReport = Array.isArray(current.injuryReport) ? current.injuryReport : [];
    // Nathan: "Need an option to add game Footage to the games on the app."
    // No paid Firebase Storage plan and full games run 700MB+ per quarter,
    // so (unlike js/drone-footage.js's base64-in-database practice clips)
    // this only ever stores a link to wherever the actual video already
    // lives (Nathan's Google Drive) -- see gameFootageReadOnlyHtml/
    // renderGameFootageEditor below.
    current.gameFootage = Array.isArray(current.gameFootage) ? current.gameFootage : [];
    // Nathan: "Let a coach save a drawn-on frame... attached to the game."
    // Populated by telestrator.html directly (it reads/writes schedule.json
    // itself, same as this file) -- declared here too just so it's a known
    // field on every game record, same backfill discipline as everything
    // else in this block.
    current.gameFootageAnnotations = Array.isArray(current.gameFootageAnnotations) ? current.gameFootageAnnotations : [];
    // Nathan: "We also have footage from the other teams we play. I need an
    // option to add in Opponent Film on the Upcoming Game." Distinct from
    // gameFootage above -- that's footage OF one of OUR games (recorded
    // after the fact, possibly several clips). This is scouting footage
    // OF THE OPPONENT (from Hudl, Drive, wherever it already lives), so
    // it's a single link, entered ahead of the game like Scouting Report,
    // not a growing list. Surfaced as a "Watch Game Film of our Upcoming
    // Opponent" button both here on the game's own Schedule preview and on
    // This Week (js/thisweek.js), which reads it straight off whichever
    // game is linked as saved.gameId.
    current.opponentFilmUrl = current.opponentFilmUrl || '';
    // Nathan: "include a write-in spot for the footage to say something
    // underneath it. example is 'Nipmuc is in white. Final score: Nipmuc 7
    // - Merrimack Valley 6'" -- a short caption shown right under the Watch
    // Footage button, same linking (saved.gameId -> upcomingGames) as the
    // URL itself.
    current.opponentFilmNote = current.opponentFilmNote || '';
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
    // Drives the "Game Preview" -> "Game Recap" fine-print copy below;
    // renderGamePreview() (called after this innerHTML is set) does the
    // same check to swap the actual box title/text.
    const gameIsFinal = !!resultFor(current);

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
        : hasEventPassed(current.date, current.gameTime || current.time) ? '' : `<span class="scheduleResultBadge upcoming">Upcoming</span>`;
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
        ${current.opponentFilmUrl ? `<a href="${escapeHtml(current.opponentFilmUrl)}" target="_blank" rel="noopener" class="navBtn" style="display:block;width:100%;text-align:center;box-sizing:border-box;${current.opponentFilmNote ? 'margin-bottom:4px;' : 'margin-bottom:12px;'}">🎥 Watch Game Film of our Upcoming Opponent</a>` : ''}
        ${current.opponentFilmUrl && current.opponentFilmNote ? `<div class="lbSub" style="text-align:center;margin:0 0 12px;">${escapeHtml(current.opponentFilmNote)}</div>` : ''}
        <div id="schedGamePreviewWrap" class="thisweekKeysBox" style="display:none;">
          <div class="thisweekKeysTitle" id="schedGamePreviewTitle">📰 Game Preview</div>
          <div id="schedGamePreviewText" style="font-size:14px;font-weight:600;line-height:1.45;"></div>
        </div>
        <div id="schedWeatherWrap" style="display:none;"></div>
        <div id="schedH2HWrap" style="display:none;"></div>
        <div id="schedMomentumWrap" style="display:none;"></div>
        <div id="schedLeadersWrap" style="margin-top:16px;"></div>
        <div style="margin-top:16px;">
          <div class="lbSectionHeader">🩹 Injury Report</div>
          ${injuryReportReadOnlyHtml(current)}
        </div>
        <div id="schedLast5Wrap" style="margin-top:16px;"></div>
        <div id="gameCancelSection"></div>
        <div class="lbSub" style="margin:16px 0 6px;text-align:center;">${escapeHtml(current.location || 'Location TBD')}</div>
        <div style="text-align:center;margin-bottom:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button type="button" class="lbLinkBtn" id="schedAddToCalBtn">📅 Add to Calendar</button>
          ${current.infoUrl ? `<a href="${escapeHtml(current.infoUrl)}" target="_blank" rel="noopener" class="lbLinkBtn">🔗 More Info</a>` : ''}
        </div>
        ${current.fieldPhoto ? `<img src="${current.fieldPhoto}" alt="Field/venue photo" style="width:100%;border-radius:10px;margin-bottom:8px;display:block;">` : ''}
        ${current.location ? `<a href="${mapSearchUrl(current.location)}" target="_blank" rel="noopener" class="lbLinkBtn">📍 View on Map</a><iframe src="${mapUrl(current.location)}" style="width:100%;height:140px;border:0;border-radius:8px;margin-top:6px;" loading="lazy"></iframe>` : ''}
        <div id="schedGamePlanWrap" style="display:none;">
          <div class="lbSectionHeader" style="margin-top:16px;">🎯 This Week's Keys</div>
          <div id="schedGamePlanKeys"></div>
          <div class="gameplanCardsGrid" id="schedGamePlanCards"></div>
        </div>
        <div class="lbSectionHeader" style="margin-top:16px;">🔎 Scouting Report</div>
        <div class="scheduleWriteup">${current.scouting ? escapeHtml(current.scouting).replace(/\n/g, '<br>') : '<span class="lbEmpty" style="padding:0;">No scouting notes yet.</span>'}</div>
        <div class="lbSectionHeader" style="margin-top:16px;">📝 Game Write-Up</div>
        <div class="scheduleWriteup">${current.writeup ? escapeHtml(current.writeup).replace(/\n/g, '<br>') : '<span class="lbEmpty" style="padding:0;">No write-up yet.</span>'}</div>
        <div class="lbSectionHeader" style="margin-top:16px;">🎥 Game Footage</div>
        ${gameFootageReadOnlyHtml(current)}
        <div class="scheduleFinePrint">${gameIsFinal ? "Game Recap is auto-generated from this game's stats (Coach Tools &gt; Stats)." : "Game Preview is auto-generated from this game's Schedule info."}</div>`;
      const editToggleBtn = document.getElementById('schedEditToggleBtn');
      if (editToggleBtn) editToggleBtn.addEventListener('click', () => { editMode = true; renderDetail(); });
      wireAddToCalendar();
      loadLinkedGamePlan();
      renderGamePreview();
      renderWeather();
      renderHeadToHead();
      renderMomentumChart();
      renderSeasonLeaders();
      renderLast5Panel('last5');
      // Nathan (6th pass on weather cancellation): "It should be available
      // to coaches when they click into a scheduled game or practice." See
      // js/practice-cancel.js's window.renderGameCancelSection -- same
      // "Cancel Due to Weather" button/status pattern js/practices.js
      // already had, just pointed at this game instead.
      if (window.renderGameCancelSection) window.renderGameCancelSection(current);
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
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
        <span class="lbSub" style="margin:0;">Final score:</span>
        <input type="number" id="schedOurScore" placeholder="Us" style="width:64px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <span>-</span>
        <input type="number" id="schedOppScore" placeholder="Them" style="width:64px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <span class="lbSub" style="margin:0;">(leave blank until played)</span>
      </div>
      <!-- Nathan: "we want to have the ESPN style graphs with a stat call
           out in the center and a bar showing a representation of the
           numbers." We already track our own stats in detail (Coach Tools
           > Stats); these three are just enough opponent-side numbers,
           filled in after the game like the score above, to draw a real
           us-vs-them bar instead of only ever showing our own side. -->
      <div class="lbSub" style="margin:0 0 4px;">Opponent box score (leave blank until played):</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
        <span class="lbSub" style="margin:0;">Their total yards:</span>
        <input type="number" id="schedOppYards" placeholder="Yds" style="width:70px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <span class="lbSub" style="margin:0 0 0 6px;">Their first downs:</span>
        <input type="number" id="schedOppFirstDowns" placeholder="FD" style="width:56px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <span class="lbSub" style="margin:0 0 0 6px;">Turnovers -- us:</span>
        <input type="number" id="schedOurTurnovers" placeholder="Us" style="width:56px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <span class="lbSub" style="margin:0;">them:</span>
        <input type="number" id="schedOppTurnovers" placeholder="Them" style="width:56px;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
      </div>
      <div class="lbSub" style="margin:-8px 0 12px;">Our first downs/total yards are figured automatically from Coach Tools &gt; Stats -- no need to enter them here.</div>
      <div class="lbSectionHeader" style="margin-top:6px;">🩹 Injury Report</div>
      <div class="lbSub" style="margin:2px 0 8px;">Who's banged up entering this game -- visible to the whole team.</div>
      <div id="schedInjuryWrap" style="margin-bottom:8px;"></div>
      <div class="lbSectionHeader" style="margin-top:6px;">🔎 Scouting Report</div>
      <div class="lbSub" style="margin:2px 0 8px;">Known tendencies, notable players, anything else worth calling out about this opponent -- visible to the whole team ahead of the game.</div>
      <textarea id="schedScouting" placeholder="e.g. &quot;#7 is their best runner, mostly runs right. Weak on outside contain.&quot;" style="width:100%;min-height:80px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;margin-bottom:4px;"></textarea>
      <div class="lbSectionHeader" style="margin-top:12px;">🎥 Opponent Film</div>
      <div class="lbSub" style="margin:2px 0 8px;">Link to game film of this opponent (Hudl share link, Google Drive, YouTube, etc.) -- shows a "Watch Game Film of our Upcoming Opponent" button here and on This Week once a game is linked to it.</div>
      <input type="text" id="schedOpponentFilmUrl" placeholder="https://…" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <input type="text" id="schedOpponentFilmNote" placeholder="e.g. &quot;Nipmuc is in white. Final score: Nipmuc 7 - Merrimack Valley 6&quot;" style="width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:4px;">
      <div class="lbSub" style="margin:2px 0 8px;">Optional note shown right under the film button -- jersey colors, final score, anything worth flagging before they hit play.</div>
      <div class="lbSub" style="margin:8px 0;">Stats for this game are entered separately under Coach Tools &gt; Stats, once it's played.</div>
      <div id="gameCancelSection"></div>
      <div class="lbSectionHeader" style="margin-top:16px;">📝 Game Write-Up</div>
      <div style="margin-bottom:4px;"><button type="button" class="lbLinkBtn" id="schedFillHighlightsBtn">✨ Fill from Stats</button></div>
      <textarea id="schedWriteup" placeholder="How the game went…" style="width:100%;min-height:90px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;"></textarea>
      <div class="lbSectionHeader" style="margin-top:16px;">🎥 Game Footage</div>
      <div class="lbSub" style="margin:2px 0 8px;">Link to wherever the footage already lives (Google Drive, Hudl, YouTube, etc.) -- visible to the whole team. To "cast" it, just open the link on whatever screen you want (a tablet or a smart TV's browser); most video players (Drive included) already have their own cast button once the video is open.</div>
      <div id="schedFootageWrap" style="margin-bottom:8px;"></div>
      <div class="scheduleFinePrint">${gameIsFinal ? 'Game Recap is auto-generated -- updates once you save.' : 'Game Preview is auto-generated -- updates once you save.'}</div>`;

    document.getElementById('schedOpponent').value = current.opponent || '';
    document.getElementById('schedDate').value = current.date || '';
    document.getElementById('schedArriveTime').value = to24h(current.arriveTime);
    document.getElementById('schedWarmupTime').value = to24h(current.warmupTime);
    document.getElementById('schedGameTime').value = to24h(current.gameTime);
    document.getElementById('schedLocation').value = current.location || '';
    document.getElementById('schedOurScore').value = current.ourScore === null || current.ourScore === undefined ? '' : current.ourScore;
    document.getElementById('schedOppScore').value = current.oppScore === null || current.oppScore === undefined ? '' : current.oppScore;
    document.getElementById('schedOppYards').value = current.oppYards === null || current.oppYards === undefined ? '' : current.oppYards;
    document.getElementById('schedOppFirstDowns').value = current.oppFirstDowns === null || current.oppFirstDowns === undefined ? '' : current.oppFirstDowns;
    document.getElementById('schedOurTurnovers').value = current.ourTurnovers === null || current.ourTurnovers === undefined ? '' : current.ourTurnovers;
    document.getElementById('schedOppTurnovers').value = current.oppTurnovers === null || current.oppTurnovers === undefined ? '' : current.oppTurnovers;
    renderInjuryEditor();
    renderGameFootageEditor();
    document.getElementById('schedWriteup').value = current.writeup || '';
    document.getElementById('schedScouting').value = current.scouting || '';
    document.getElementById('schedOpponentFilmUrl').value = current.opponentFilmUrl || '';
    document.getElementById('schedOpponentFilmNote').value = current.opponentFilmNote || '';
    const fillHighlightsBtn = document.getElementById('schedFillHighlightsBtn');
    if (fillHighlightsBtn) {
      fillHighlightsBtn.addEventListener('click', () => {
        const highlights = buildGameHighlightsText(current);
        if (!highlights) { alert('No stats entered for this game yet -- add them under Coach Tools > Stats first.'); return; }
        const ta = document.getElementById('schedWriteup');
        if (ta.value.trim() && !confirm('Replace the current write-up with a stats-based draft? You can still edit it after.')) return;
        ta.value = highlights;
      });
    }
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
    // Same "Cancel Due to Weather" section as the read-only view above --
    // available from the edit view too, not just the read-only default,
    // since a coach mid-edit shouldn't have to back out to read-only just
    // to cancel the game they're already looking at.
    if (window.renderGameCancelSection) window.renderGameCancelSection(current);
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
        // Nathan: "add in Coaches Names with 3 areas to show their 3
        // KEYS" -- thisWeek.json's keys moved from one flat array to
        // per-coach coachKeys (see js/thisweek.js); mirror that same
        // per-coach grouping here instead of just the old flat list.
        const coachKeys = (Array.isArray(data.coachKeys) ? data.coachKeys : [])
          .map(c => ({ name: (c && c.name || '').trim() || 'Coach', keys: (c && Array.isArray(c.keys) ? c.keys : []).map(k => (k || '').trim()).filter(Boolean) }))
          .filter(c => c.keys.length);
        const plays = Array.isArray(data.plays) ? data.plays : [];
        if (!coachKeys.length && !plays.length) { wrap.style.display = 'none'; return; }
        wrap.style.display = '';
        const keysList = document.getElementById('schedGamePlanKeys');
        if (keysList) {
          keysList.innerHTML = '';
          coachKeys.forEach(c => {
            const heading = document.createElement('div');
            heading.className = 'thisweekCoachName';
            heading.textContent = c.name;
            keysList.appendChild(heading);
            const ol = document.createElement('ol');
            ol.className = 'thisweekKeysList';
            c.keys.forEach(k => { const li = document.createElement('li'); li.textContent = k; ol.appendChild(li); });
            keysList.appendChild(ol);
          });
        }
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
    if (gamesReadyPromise) {
      gamesReadyPromise.then(actuallyOpen);
    } else {
      loaded = true;
      gamesReadyPromise = loadGames();
      gamesReadyPromise.then(actuallyOpen);
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
    const oppYardsRaw = document.getElementById('schedOppYards').value.trim();
    const oppFirstDownsRaw = document.getElementById('schedOppFirstDowns').value.trim();
    const ourTOsRaw = document.getElementById('schedOurTurnovers').value.trim();
    const oppTOsRaw = document.getElementById('schedOppTurnovers').value.trim();
    current.oppYards = oppYardsRaw === '' ? '' : Number(oppYardsRaw);
    current.oppFirstDowns = oppFirstDownsRaw === '' ? '' : Number(oppFirstDownsRaw);
    current.ourTurnovers = ourTOsRaw === '' ? '' : Number(ourTOsRaw);
    current.oppTurnovers = oppTOsRaw === '' ? '' : Number(oppTOsRaw);
    current.writeup = document.getElementById('schedWriteup').value.trim();
    current.scouting = document.getElementById('schedScouting').value.trim();
    current.infoUrl = document.getElementById('schedInfoUrl').value.trim();
    current.opponentFilmUrl = document.getElementById('schedOpponentFilmUrl').value.trim();
    current.opponentFilmNote = document.getElementById('schedOpponentFilmNote').value.trim();
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
      gamesReadyPromise = loadGames();
    } else {
      document.getElementById('scheduleDetail').style.display = 'none';
      document.getElementById('scheduleListWrap').style.display = '';
      renderList();
    }
  };

  // Used by Full Schedule (js/schedule-full.js) to merge games in without
  // needing the Games tab to have been opened first.
  window.getGamesCached = () => games;
  // Same gamesReadyPromise fix as openScheduleGame above -- `loaded` alone
  // isn't safe to branch on here since something else (initSchedule,
  // openScheduleGame) may have already set it true while its own fetch is
  // still in flight; waiting on the shared promise instead of the flag
  // guarantees `games` is actually populated before resolving.
  window.ensureGamesLoaded = function () {
    if (gamesReadyPromise) return gamesReadyPromise.then(() => games);
    loaded = true;
    gamesReadyPromise = loadGames();
    return gamesReadyPromise.then(() => games);
  };
})();

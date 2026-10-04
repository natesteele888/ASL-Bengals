// ---------------------------------------------------------------------------
// Gameday splash -- Nathan: "with it being gameday, I also want to have cool
// photos to feature of the team for gameday. The app will display a full
// image background on Gamedays when you first open the app that day. Use
// this as the main image. Show PNGs of logos for Bengals vs opponent.
// Arrival time of 12:00PM, Game at 2:30PM. Big Let's Go Bengals CTA to get
// into the app."
//
// Deliberately data-driven rather than hardcoded to one specific game:
// opponent name, logos, and arrive/warm-up/kickoff times are all read live
// off whatever's already entered in Coach Tools > Schedule for a game dated
// today, the same schedule.json + opponentLogos.json Coach Tools' Schedule
// tab and This Week already read (own light read-only copy rather than
// reaching into schedule.js's closure, same pattern js/thisweek.js already
// uses for the same reason -- this can render before the Schedule tab has
// ever been opened). That means this keeps working automatically every
// single game week, with zero code changes -- a coach just enters the game
// like normal and the splash follows.
//
// Team badge logic (normalizeOpponentKey/hashColor/initials/logo lookup) is
// a direct copy of js/schedule.js's own functions -- same duplicated-on-
// purpose pattern thisweek.js uses for its own opponent badges, rather than
// reaching into another file's closure.
// ---------------------------------------------------------------------------
(function () {
  const SCHEDULE_URL = `${FIREBASE_DB_URL}/schedule.json`;
  const OPPONENT_LOGOS_URL = `${FIREBASE_DB_URL}/opponentLogos.json`;
  const BUNDLED_LOGOS = {
    clinton: 'assets/images/opponents/clinton.png',
    grafton: 'assets/images/opponents/grafton.png',
    // normalizeOpponentKey("Leicester/Spencer") -- no space before the
    // slash, so the whole thing counts as one "word" (same reasoning
    // js/schedule.js's own copy documents). Was missing from this
    // file's own copy of the map even though js/schedule.js already had
    // it -- found by a live audit against the real league roster, not
    // new art.
    leicesterspencer: 'assets/images/opponents/leicesterspencer.png',
    leominster: 'assets/images/opponents/leominster.png',
    oxfordwebster: 'assets/images/opponents/oxfordwebster.png',
    merrimack: 'assets/images/opponents/merrimack.png',
    milford: 'assets/images/opponents/milford.png',
    tewksbury: 'assets/images/opponents/tewksbury.png',
    wachusett: 'assets/images/opponents/wachusett.png',
    westfordactonboxboroughlittleton: 'assets/images/opponents/westfordactonboxboroughlittleton.png',
    hudson: 'assets/images/opponents/hudson.png',
    worcester: 'assets/images/opponents/worcester.png',
    northborosouthboro: 'assets/images/opponents/northborosouthboro.png',
    fitchburg: 'assets/images/opponents/fitchburg.png',
    auburn: 'assets/images/opponents/auburn.png',
    // normalizeOpponentKey("Maynard/Nashoba") -- no space before the
    // slash, so the whole thing counts as one "word", then the slash
    // gets stripped (same reasoning js/schedule.js's own copy documents).
    maynardnashoba: 'assets/images/opponents/maynardnashoba.png',
    charltondudley: 'assets/images/opponents/charltondudley.png',
    nipmuc: 'assets/images/opponents/nipmuc.png',
    // "North Middlesex" does NOT use the plain first-word key ("north")
    // -- "North County" is a separate, real team that would collide on
    // that exact key. Keyed on normalizeOpponentFullKey (the whole
    // name) instead -- see opponentBadgeHtml below, same reasoning
    // js/schedule.js's own copy documents.
    northmiddlesex: 'assets/images/opponents/north-middlesex.png',
    northbridgeuxbridge: 'assets/images/opponents/northbridgeuxbridge.png',
    tantasqua: 'assets/images/opponents/tantasqua.png',
    tyngsboro: 'assets/images/opponents/tyngsboro.png',
    westborough: 'assets/images/opponents/westborough.png',
    oakmont: 'assets/images/opponents/oakmont.png',
    southbridge: 'assets/images/opponents/southbridge.png',
    // normalizeOpponentKey("Millbury/Sutton") -- no space before the
    // slash, so the whole thing counts as one "word" (same reasoning
    // leicesterspencer/oxfordwebster above document).
    millburysutton: 'assets/images/opponents/millburysutton.png',
    // "North County" has the SAME first-word collision as "North
    // Middlesex" above (both reduce to "north") -- keyed on
    // normalizeOpponentFullKey for the same reason.
    northcounty: 'assets/images/opponents/northcounty.png',
  };
  // Stores the last calendar date (YYYY-MM-DD) this was actually shown and
  // dismissed -- "first open of the app that day" per device, same spirit
  // as the badges-intro/coach-digest/parent-digest once-per-day guards
  // elsewhere in this app.
  const SEEN_KEY = 'aslBengalsGameDaySplashSeenDate';

  // Local calendar date, not UTC -- a game at 7pm Eastern shouldn't flip to
  // "not today" for someone on the West coast just because UTC already
  // rolled over. Same reasoning as schedule.js's hasEventPassed parsing
  // dateStr as explicit y/m/d rather than trusting new Date(str).
  function todayLocalDateStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function normalizeOpponentKey(name) {
    const cleaned = (name || '').replace(/\(.*?\)/g, '').trim();
    const firstWord = cleaned.split(/\s+/).filter(Boolean)[0] || '';
    return firstWord.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  // Same idea, but keeps the WHOLE name instead of just the first word
  // -- see js/schedule.js's own copy for why this exists (the
  // "North Middlesex"/"North County" first-word collision).
  function normalizeOpponentFullKey(name) {
    const cleaned = (name || '').replace(/\(.*?\)/g, '').trim();
    return cleaned.toLowerCase().replace(/[^a-z0-9]/g, '');
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
  function escapeHtmlGD(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  // Strict 24hr "HH:MM" -> "h:MM AM/PM" -- same as schedule.js/thisweek.js's
  // own to12h, duplicated locally for the same reason as the badge helpers
  // above. Already-formatted/free-text strings pass through untouched.
  function to12h(str) {
    if (!str) return '';
    const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return str;
    let h = Number(m[1]);
    const min = m[2];
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${min} ${ap}`;
  }

  // Nathan: "instead of using the circle logos, use the PNG images exactly
  // as they are on the schedule page" -- the .hasLogo class here already
  // matched .scheduleTeamBadge's own has-logo/no-logo split; only
  // css/styles.css's .gameDayTeamLogo.hasLogo rule needed to change (circle
  // + object-fit:cover -> transparent rounded-square + object-fit:contain,
  // same as .scheduleTeamBadge.hasLogo) for a real uploaded PNG to render
  // uncropped here exactly like it does on the Schedule page. The no-logo
  // fallback below keeps its colored-circle-with-initials look, matching
  // .scheduleTeamBadge's own default (non-.hasLogo) treatment.
  function opponentBadgeHtml(name, opponentLogos) {
    const fullKey = normalizeOpponentFullKey(name);
    const key = normalizeOpponentKey(name);
    const logo = (opponentLogos && (opponentLogos[fullKey] || opponentLogos[key])) || BUNDLED_LOGOS[fullKey] || BUNDLED_LOGOS[key] || null;
    if (logo) return `<span class="gameDayTeamLogo hasLogo"><img src="${logo}" alt="${escapeHtmlGD(name || 'Opponent')}"></span>`;
    return `<span class="gameDayTeamLogo" style="background:${hashColor(name)};">${escapeHtmlGD(initials(name))}</span>`;
  }

  function findTodaysGame(games) {
    const today = todayLocalDateStr();
    return (games || []).find(g => g && g.id && g.date === today) || null;
  }

  function renderAndShow(game, opponentLogos) {
    const overlay = document.getElementById('gameDaySplashOverlay');
    if (!overlay) return;
    const badgeEl = document.getElementById('gameDayOpponentBadge');
    const nameEl = document.getElementById('gameDayOpponentName');
    const vsEl = document.getElementById('gameDayVsLabel');
    const timesEl = document.getElementById('gameDayTimes');
    if (badgeEl) badgeEl.innerHTML = opponentBadgeHtml(game.opponent, opponentLogos);
    if (nameEl) nameEl.textContent = game.opponent || 'TBD';
    // Nathan: "already assumed it's at the 2nd logo" -- dropped the old
    // '@' (Away)/'VS' (Home) split; always just 'VS' now, since which side
    // is the opponent is already conveyed by logo order (Bengals first,
    // opponent second) rather than needing this label to also carry it.
    if (vsEl) vsEl.textContent = 'VS';
    if (timesEl) {
      const parts = [];
      if (game.arriveTime) parts.push(`Arrive ${to12h(game.arriveTime)}`);
      if (game.warmupTime) parts.push(`Warm-up ${to12h(game.warmupTime)}`);
      if (game.gameTime) parts.push(`Kickoff ${to12h(game.gameTime)}`);
      timesEl.innerHTML = parts.map(p => `<div class="gameDayTimeRow">${escapeHtmlGD(p)}</div>`).join('');
    }
    overlay.classList.add('show');
    // Same "lock the page behind a full-screen overlay" treatment as the
    // storm cancellation panel -- keeps a stray scroll from happening
    // behind the splash while it's up.
    document.body.style.overflow = 'hidden';
    const ctaBtn = document.getElementById('gameDaySplashCtaBtn');
    if (ctaBtn) {
      ctaBtn.onclick = function () {
        overlay.classList.remove('show');
        document.body.style.overflow = '';
        try { localStorage.setItem(SEEN_KEY, todayLocalDateStr()); } catch (e) { /* ignore -- worst case it shows again next open today */ }
      };
    }
  }

  // Called from player-identity.js's gate() onReady, same trigger point as
  // the other post-session full-screen checks there (badges intro, storm
  // cancellation, etc.) -- by the time this runs a real session already
  // exists, so window.firebaseAuthed can read schedule data that requires
  // a real (non-anonymous) login.
  window.maybeShowGameDaySplash = async function () {
    try {
      let alreadySeenToday = false;
      try { alreadySeenToday = localStorage.getItem(SEEN_KEY) === todayLocalDateStr(); } catch (e) { /* ignore */ }
      if (alreadySeenToday) return;
      const [gamesRes, logosRes] = await Promise.all([
        fetch(await window.firebaseAuthed(SCHEDULE_URL)),
        fetch(await window.firebaseAuthed(OPPONENT_LOGOS_URL)),
      ]);
      const games = gamesRes.ok ? await gamesRes.json() : null;
      const logosData = logosRes.ok ? await logosRes.json() : null;
      const game = findTodaysGame(Array.isArray(games) ? games : []);
      if (!game) return; // no game on the schedule today -- nothing to show
      const opponentLogos = (logosData && typeof logosData === 'object') ? logosData : {};
      renderAndShow(game, opponentLogos);
    } catch (e) { /* best-effort -- gameday hype should never block getting into the app */ }
  };
})();

// ---------------------------------------------------------------------------
// "This Week" -- Nathan: "when a coach logs in, they can click their profile
// and choose gameplan. They can write in a focus for the offense then choose
// 5-15 plays that will appear in the playbook for the week. Those plays will
// be featured or very important to the game plan." Then, mid-build: "coaches
// should be able to click their profile name and go to 'This Week' and they
// can add their 3 Keys to the week for all players to see."
//
// One shared team page (the featured-play picker + which game it's tied to
// stay team-wide, not per-coach). The 3 Keys, though, are per-coach --
// Nathan: "add in Coaches Names with 3 areas to show their 3 KEYS...
// editable and removable if needed" -- so thisWeek.json's `keys` (one flat
// array) became `coachKeys` (an array of {name, keys[3]}, one entry per
// coach), seeded with the named coaches on first load. Any coach session
// can edit the whole list (add/rename/remove coaches, edit anyone's keys);
// every signed-in player/coach sees the same read result, grouped by coach
// name, skipping any coach who hasn't filled in a key yet.
//
// Featured plays reuse the exact same family+direction numbering the Call
// Sheet PDF uses (see call-sheet-pdf.js's buildPlayNumberIndex) so a play
// picked here lines up with the number a coach already knows from the
// printed sheet -- recomputed locally off window.playbookLiveFamilies()
// (exposed by playbook-pdf.js) rather than duplicated data.
// ---------------------------------------------------------------------------
(function () {

  const THISWEEK_URL = `${FIREBASE_DB_URL}/thisWeek.json`;
  const SCHEDULE_URL = `${FIREBASE_DB_URL}/schedule.json`;
  const PRACTICES_URL = `${FIREBASE_DB_URL}/practices.json`;
  // Nathan: "logos for games can be brought in" -- own light copy of the
  // same opponentLogos.json js/schedule.js reads, rather than reaching
  // into that file's closure (it's not exposed on window, and its own
  // load only kicks off once the Schedule tab has actually been opened --
  // This Week can render before that ever happens). Same
  // own-read-only-copy pattern already used here for upcomingGames/
  // upcomingPractices below.
  const OPPONENT_LOGOS_URL = `${FIREBASE_DB_URL}/opponentLogos.json`;
  const BUNDLED_LOGOS = {
    clinton: 'assets/images/opponents/clinton.png',
    grafton: 'assets/images/opponents/grafton.png',
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
  };
  let opponentLogos = {};
  // Delegates to js/gameplan.js's own MAX_PLAYS (same "one real source,
  // not a second copy that can drift" discipline as numberedRows()/
  // pickerGroups() just below) -- gameplan.js loads before this file, so
  // window.GamePlan already exists by the time this line runs.
  const MAX_PLAYS = window.GamePlan ? window.GamePlan.MAX_PLAYS : 100;
  const MIN_RECOMMENDED = 5;
  const NUM_KEYS = 3;
  // Nathan: "add in Coaches Names with 3 areas to show their 3 KEYS.
  // Include the following coaches names but they should be editable and
  // removable if needed." Seeded once, the first time coachKeys doesn't
  // exist yet in the cloud -- after that, whatever the coach editor last
  // saved (including any adds/renames/removals) is the source of truth.
  const DEFAULT_COACHES = ['Coach Joe', 'Coach Matt', 'Coach Aaron', 'Coach Shane', 'Coach Nate'];

  // Coach-name allowlist now lives in auth.js (window.isApprovedCoachProfile)
  // since Coach Tools / Drive Builder need the exact same check -- read-only
  // viewing here stays open to everyone regardless, this only gates the
  // editor.

  // Nathan: "We should be able to assign Weekly Goals and game plans to the
  // upcoming games so players can check them out and be prepared." This
  // Week stays the one shared page (not split per-game), but can now point
  // at a specific upcoming Schedule game via gameId -- shown as a link here,
  // and schedule.js pulls the same saved keys/plays onto that game's own
  // detail page when its id matches.
  let saved = { coachKeys: [], plays: [], gameId: '', updatedAt: null };
  let pendingSelection = []; // coach's in-progress play selection: [{key, direction}]
  let pendingGameId = '';
  // Editor's working copy of coachKeys -- [{name, keys:['','','']}, ...],
  // mutated directly by the Add/Remove/rename/key-input handlers below and
  // written back wholesale on Save (same in-progress-copy pattern as
  // pendingSelection above).
  let pendingCoachKeys = [];
  let upcomingGames = []; // light read-only copy of schedule.json for the game picker
  let upcomingPractices = []; // light read-only copy of practices.json for the Week Ahead write-up
  let loaded = false;
  let myPlaysOnly = false; // "My Plays" filter toggle -- resets on reload, not persisted

  function loadUpcomingGames() {
    return window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        upcomingGames = Array.isArray(data) ? data.filter(g => g && g.id) : [];
      })
      .catch(err => console.error('Could not load schedule for This Week game picker:', err));
  }
  // Own light copy rather than depending on js/practices.js's cache -- This
  // Week can render before the Schedule > Practices tab has ever been
  // opened, same reasoning as loadUpcomingGames() above.
  function loadUpcomingPractices() {
    return window.firebaseAuthed(PRACTICES_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        upcomingPractices = Array.isArray(data) ? data.filter(p => p && p.id) : [];
      })
      .catch(err => console.error('Could not load practices for This Week look-ahead:', err));
  }
  function loadOpponentLogosForWeekAhead() {
    return window.firebaseAuthed(OPPONENT_LOGOS_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => { opponentLogos = (data && typeof data === 'object') ? data : {}; })
      .catch(err => { console.error('Could not load opponent logos for This Week look-ahead:', err); opponentLogos = {}; });
  }
  function gameLabel(g) {
    return `${g.homeAway === 'Away' ? '@' : 'vs'} ${g.opponent || 'TBD'}${g.date ? ' — ' + g.date : ''}`;
  }
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  // Same team-badge logic as js/schedule.js's normalizeOpponentKey/
  // hashColor/initials/opponentBadgeHtml/bengalsBadgeHtml -- duplicated
  // locally rather than depending on that file's closure, same reasoning
  // as opponentLogos above.
  function normalizeOpponentKey(name) {
    const cleaned = (name || '').replace(/\(.*?\)/g, '').trim();
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
    return `<span class="scheduleTeamBadge hasLogo"><img src="assets/images/header-logo.png" alt="ASL Bengals"></span>`;
  }
  function opponentBadgeHtml(name) {
    const key = normalizeOpponentKey(name);
    const logo = opponentLogos[key] || BUNDLED_LOGOS[key] || null;
    if (logo) return `<span class="scheduleTeamBadge hasLogo"><img src="${logo}" alt="${escapeHtml(name || '')}"></span>`;
    return `<span class="scheduleTeamBadge" style="background:${hashColor(name)};">${escapeHtml(initials(name))}</span>`;
  }

  function resultFor(g) {
    if (g.ourScore === null || g.ourScore === undefined || g.oppScore === null || g.oppScore === undefined || g.ourScore === '' || g.oppScore === '') return null;
    const us = Number(g.ourScore), them = Number(g.oppScore);
    if (isNaN(us) || isNaN(them)) return null;
    if (us > them) return 'W'; if (us < them) return 'L'; return 'T';
  }
  // Same date-driven fix as js/schedule.js's hasEventPassed -- duplicated
  // locally rather than reaching into that file's closure, same spirit as
  // the other small helpers on this page. See that file's comment for why.
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
  // Same record math as js/schedule.js's bengalsRecord() -- duplicated
  // locally rather than reaching into that file's closure.
  // Same record math as js/schedule.js's bengalsRecord() -- including the
  // Scrimmage/Jamboree exclusion (Nathan: those are preseason and shouldn't
  // count toward the regular season record) and the Bye exclusion added to
  // schedule.js's own copy afterward (found live, codebase audit,
  // 2026-09-26 -- this copy had drifted, missing that third exclusion).
  function countsTowardRecord(g) {
    return g.gameType !== 'Scrimmage' && g.gameType !== 'Jamboree' && g.gameType !== 'Bye';
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
  // Same fix as js/schedule.js/js/practices.js -- Game Time is a native
  // time picker storing 24hr "HH:MM"; this displays it as "6:00 PM".
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
  // Nathan: "can we incorporate an AI generated look ahead for the team?"
  // then: "week ahead write up is a little weak, need more to it, written
  // more like the game preview." Then: "I dont like that the week ahead
  // is just a little text blurb. Would love a more infographic style look
  // with callouts for number of games and practices - logos for games can
  // be brought in just make it a place to visit." buildWeekAheadData below
  // is the same Mon-Sun window/game/practice-gathering logic the old
  // sentence-writer used, just returning structured data instead of
  // prose; weekAheadInfographicHtml (further down) turns that into real
  // clickable cards -- reusing js/schedule.js's .scheduleRow game-card
  // look (with real opponent logos) and js/practices.js's .practiceRow
  // look, rather than inventing new components, so this actually matches
  // the rest of the app instead of introducing a third visual style.
  // Nathan: "Football typically has Sunday as part of the prior weekdays
  // as prep. Monday through Sunday is the typical week." A plain
  // "today through today+6" rolling window doesn't match that -- viewed
  // on, say, a Wednesday, it spills a game on the following Tuesday into
  // "this week" while still correctly catching Sunday; but viewed later
  // in the week it can just as easily miss a Sunday game that's clearly
  // still part of the current football week. Anchor explicitly to the
  // most recent Monday through the following Sunday instead, so Sunday
  // always counts as the close of *this* week no matter what day of the
  // week this renders on. Exposed on window (not just used internally by
  // buildWeekAheadData below) so js/schedule.js's own game list can mark
  // "the current game for this week" with the same Mon-Sun math, rather
  // than growing a second, driftable copy of this exact date logic --
  // that's the precise class of bug the 2026-09-26 codebase audit just
  // found and fixed twice elsewhere in this app.
  function toDateOnly(dateStr) {
    const parts = (dateStr || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  function currentWeekWindow() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay(); // 0=Sun..6=Sat
    const mondayOffset = (dow + 6) % 7; // days since most recent Monday
    const start = new Date(today);
    start.setDate(start.getDate() - mondayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 6); // Sunday
    return { start, end };
  }
  window.isDateInCurrentWeek = function (dateStr) {
    const d = toDateOnly(dateStr);
    if (!d) return false;
    const { start, end } = currentWeekWindow();
    return d >= start && d <= end;
  };

  function buildWeekAheadData(games, practices) {
    const { start, end } = currentWeekWindow();
    const inWindow = (d) => d && d >= start && d <= end;
    const gameEntries = [];
    const practiceEntries = [];
    (games || []).forEach(g => {
      const d = toDateOnly(g.date);
      if (!inWindow(d)) return;
      gameEntries.push({ d, g });
    });
    (practices || []).forEach(p => {
      const d = toDateOnly(p.date);
      if (!inWindow(d)) return;
      practiceEntries.push({ d, p });
    });
    gameEntries.sort((a, b) => a.d - b.d);
    practiceEntries.sort((a, b) => a.d - b.d);

    // Nathan: "add another type of practice to the schedule which is Walk
    // Through." Counted separately from plain Practice, same as Film Night
    // already was, so the Week Ahead stat cards/hype line don't lump a
    // walkthrough in as a regular practice.
    const filmCount = practiceEntries.filter(e => e.p.type === 'film').length;
    const walkthroughCount = practiceEntries.filter(e => e.p.type === 'walkthrough').length;
    const practiceCount = practiceEntries.length - filmCount - walkthroughCount;

    return {
      hasAny: !!(gameEntries.length || practiceEntries.length),
      record: bengalsRecord(games),
      gameEntries,
      practiceEntries,
      practiceCount,
      filmCount,
      walkthroughCount,
      weekStart: start, // this week's Monday -- used to pick a stable-per-week hype closer, see weekAheadWriteupText
    };
  }

  function weekAheadStatCardHtml(num, label) {
    return `<div class="adminStatCard"><div class="num">${num}</div><div class="lbl">${escapeHtml(label)}</div></div>`;
  }
  // Fuller than the plain weekday-only label used for the practice/film
  // grouping in the old prose version -- these cards each stand alone, so
  // "Wed" alone isn't enough context once it's out of a sentence.
  function weekAheadCardDate(d) {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  // Same markup/classes as js/schedule.js's Games list row (.scheduleRow,
  // .scheduleTeamSide, .scheduleTeamBadge, etc.) so this looks and behaves
  // like a real Schedule card, real opponent logo included -- clicking it
  // jumps straight to that game's own detail page via
  // window.openScheduleGame (wired up in weekAheadInfographicHtml below).
  function weekAheadGameCardHtml(d, g, record) {
    const result = resultFor(g);
    const recordHtml = record ? `<span class="scheduleTeamRecord">${escapeHtml(record)}</span>` : '';
    const badge = result
      ? `<span class="scheduleResultBadge ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'tie'}">${result}</span>`
      : hasEventPassed(g.date, g.gameTime || g.time) ? '' : `<span class="scheduleResultBadge upcoming">Upcoming</span>`;
    const usScore = result ? `<span class="scheduleTeamScore">${escapeHtml(String(g.ourScore))}</span>` : '';
    const themScore = result ? `<span class="scheduleTeamScore">${escapeHtml(String(g.oppScore))}</span>` : '';
    const gameTime = to12h(g.gameTime || g.time || '');
    const locLine = `${g.homeAway === 'Away' ? 'AWAY' : 'HOME'}${g.location ? ' • ' + escapeHtml(g.location) : ''}`;
    const gameTypeTag = g.gameType && g.gameType !== 'Regular Season' ? `<span class="scheduleGameTypeTag">${escapeHtml(g.gameType)}</span>` : '';
    return `
      <button type="button" class="scheduleRow" data-open-game="${escapeHtml(g.id)}">
        ${gameTypeTag}
        <span class="scheduleRowDate">${locLine}</span>
        <span class="scheduleRowMatchup">
          <span class="scheduleTeamSide home">${bengalsBadgeHtml()}<span class="scheduleTeamName">Bengals</span>${recordHtml}${usScore}</span>
          <span class="scheduleRowCenter">
            <span class="scheduleRowCenterDate">${weekAheadCardDate(d)}</span>
            ${gameTime ? `<span class="scheduleRowCenterTime">${escapeHtml(gameTime)}</span>` : ''}
            ${badge}
          </span>
          <span class="scheduleTeamSide away">${opponentBadgeHtml(g.opponent)}<span class="scheduleTeamName">${escapeHtml(g.opponent || 'TBD')}</span>${themScore}</span>
        </span>
      </button>`;
  }
  // Same markup/classes as js/practices.js's list row (.practiceRow,
  // .practiceRowTop, .practiceTypeBadge) -- clicking jumps to that
  // practice's own detail page via window.openPracticeDetail.
  function weekAheadPracticeCardHtml(d, p) {
    // Nathan: "add another type of practice to the schedule which is Walk
    // Through." Same badge class/label practices.js's badgeClassFor/TYPES
    // use, so this card matches the one you'd see on the actual Practices
    // tab for the same entry.
    const badgeClass = p.type === 'film' ? 'film' : p.type === 'walkthrough' ? 'walkthrough' : 'practice';
    const badgeLabel = p.type === 'film' ? '🎬 Film Night' : p.type === 'walkthrough' ? '🚶 Walk Through' : '🏃 Practice';
    const timeStr = p.time ? (p.endTime ? `${to12h(p.time)} - ${to12h(p.endTime)}` : to12h(p.time)) : '';
    return `
      <button type="button" class="practiceRow" data-open-practice="${escapeHtml(p.id)}" style="margin-bottom:8px;">
        <div class="practiceRowTop">
          <span class="practiceTypeBadge ${badgeClass}">${badgeLabel}</span>
          <span class="practiceRowDateTime">${weekAheadCardDate(d)}${timeStr ? ' • ' + escapeHtml(timeStr) : ''}</span>
        </div>
        ${p.location ? `<span class="practiceRowLoc">📍 ${escapeHtml(p.location)}</span>` : ''}
      </button>`;
  }

  function joinList(items) {
    if (items.length === 1) return items[0];
    if (items.length === 2) return items.join(' and ');
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  // Nathan: "also keep a short write up in there with a little
  // motivation." Then: "hype line is weak - move it to the top and have
  // it be worth having there." Then (2026-09-01): "don't need the pump up
  // copy to be in that orange CTA style bar, just have it as an AI write
  // up of the week ahead with more context." So this moved from a single
  // punchy banner line to an actual short paragraph -- still no backend/
  // API key (composed client-side straight off the same games/practices
  // data the stat cards below use, see the header comment above
  // buildWeekAheadData), but now reads like a couple of real sentences: who
  // the Bengals play, when, home or away, and what's on deck in practice
  // before then, plus the same rotating closer line as before instead of a
  // one-line hype banner. The closer is picked off data.weekStart (this
  // week's Monday) rather than Math.random() so it's stable for the whole
  // week -- reloading the page mid-week shouldn't change the write-up,
  // only a new week should. "First game action of the year" is detected
  // off data.record: bengalsRecord() only counts games with an entered
  // score (see resultFor), so an empty record string across the WHOLE
  // season (not just this week) plus a game this week means nothing's
  // been played yet.
  const HYPE_CLOSERS = ["Let's go, Bengals!", 'Bring the energy!', "Time to bring it!", "Let's make it count!", 'Get after it!'];
  function pickHypeCloser(weekStart) {
    const weekIndex = Math.floor(weekStart.getTime() / (7 * 86400000));
    return HYPE_CLOSERS[Math.abs(weekIndex) % HYPE_CLOSERS.length];
  }
  function weekAheadWriteupText(data) {
    if (!data.hasAny) return '';
    const closer = pickHypeCloser(data.weekStart);
    const practiceParts = [];
    if (data.practiceCount) practiceParts.push(`${data.practiceCount} practice${data.practiceCount === 1 ? '' : 's'}`);
    if (data.filmCount) practiceParts.push(`${data.filmCount} film night${data.filmCount === 1 ? '' : 's'}`);
    if (data.walkthroughCount) practiceParts.push(`${data.walkthroughCount} walk-through${data.walkthroughCount === 1 ? '' : 's'}`);

    const gameParts = data.gameEntries.map(({ d, g }) => {
      const label = (g.gameType && g.gameType !== 'Regular Season') ? g.gameType.toLowerCase() : 'game';
      const dayName = d.toLocaleDateString(undefined, { weekday: 'long' });
      const timeStr = to12h(g.gameTime || g.time || '');
      const timeBit = timeStr ? ` at ${timeStr}` : '';
      if (!g.opponent) return `a ${label} ${dayName}${timeBit}`;
      const where = g.homeAway === 'Away' ? `on the road against ${g.opponent}` : `at home against ${g.opponent}`;
      return `a ${label} ${dayName}${timeBit} ${where}`;
    });

    const sentences = [];
    const hasGame = gameParts.length > 0;
    if (hasGame) {
      const isSeasonOpener = !data.record;
      const intro = isSeasonOpener
        ? "It's finally here -- the Bengals kick off the season this week with"
        : data.gameEntries.length > 1
          ? `The Bengals (${data.record}) have a busy week on tap, with`
          : `The Bengals (${data.record}) are back in action this week with`;
      sentences.push(`${intro} ${joinList(gameParts)}.`);
    } else {
      sentences.push('No game on the schedule this week, but the team is still putting in the work.');
    }
    if (practiceParts.length) {
      sentences.push(hasGame
        ? `Between now and then, look for ${joinList(practiceParts)} to get everyone sharp and ready.`
        : `This week brings ${joinList(practiceParts)} to keep sharpening up for what's next.`);
    }
    sentences.push(closer);
    return sentences.join(' ');
  }

  // Nathan: "callouts for number of games and practices... just make it a
  // place to visit." Stat cards (reusing the same .adminStatCard look
  // Coach Dashboard's Team Snapshot uses), then real clickable Schedule/
  // Practice cards below instead of a paragraph of prose.
  // Nathan (later): "Game and Practices cards on Week Ahead should be
  // side by side" -- .weekAheadColumns lays the two card lists out as a
  // 2-column grid (collapsing to 1 column on narrow phones, see
  // css/styles.css) instead of one full-width section stacked above the
  // other.
  // Nathan (later): "hype line is weak - move it to the top and have it
  // be worth having there" -- now the very first thing in the box, ahead
  // of the stat cards. Nathan (later still, 2026-09-01): "don't need the
  // pump up copy to be in that orange CTA style bar, just have it as an
  // AI write up of the week ahead with more context" -- see
  // .weekAheadWriteup in css/styles.css for the current plain-paragraph
  // treatment (was a bold orange banner before).
  function weekAheadInfographicHtml(data) {
    if (!data.hasAny) {
      return '<div class="lbEmpty">Nothing on the Schedule this week (Mon-Sun) yet -- once games or practices are added, they\'ll show up here.</div>';
    }
    const statCards = [];
    if (data.gameEntries.length) statCards.push(weekAheadStatCardHtml(data.gameEntries.length, data.gameEntries.length === 1 ? 'Game' : 'Games'));
    if (data.practiceCount) statCards.push(weekAheadStatCardHtml(data.practiceCount, data.practiceCount === 1 ? 'Practice' : 'Practices'));
    if (data.filmCount) statCards.push(weekAheadStatCardHtml(data.filmCount, data.filmCount === 1 ? 'Film Night' : 'Film Nights'));
    if (data.walkthroughCount) statCards.push(weekAheadStatCardHtml(data.walkthroughCount, data.walkthroughCount === 1 ? 'Walk Through' : 'Walk Throughs'));

    const gamesHtml = data.gameEntries.map(({ d, g }) => weekAheadGameCardHtml(d, g, data.record)).join('');
    const practicesHtml = data.practiceEntries.map(({ d, p }) => weekAheadPracticeCardHtml(d, p)).join('');

    // Nathan (2026-09-01, final placement): "move the CTA to just below
    // the number icons callouts... so it would sit just above the Games
    // This Week section." These two elements used to be static markup in
    // index.html; now they're generated fresh as part of this same
    // innerHTML so they can land in the exact spot Nathan wants (between
    // the stat cards above and the Games/Practices columns below) --
    // renderWeekAhead() finds them by these same ids right after setting
    // textEl.innerHTML to this return value and fills in href/text/visibility.
    // thisweekWatchFootageWrap is a plain container, not the button itself
    // -- renderWeekAhead() fills it with window.filmButtonHtml()'s own
    // markup (js/schedule.js), same as every other Watch Game Film button
    // in the app, so this one opens inline instead of jumping to a new tab.
    const footageHtml = `
      <div id="thisweekWatchFootageWrap"></div>
      <div id="thisweekWatchFootageNote" class="lbSub" style="display:none;text-align:center;margin:0 0 8px;"></div>
      <div id="thisweekOpponentScoutingWrap"></div>
      <!-- Nathan: "link formatting and placement isn't good - needs
           breathing room for other things and needs to be centered."
           Real, found cause: .lbSectionHeader's own margin-top:0 for
           whichever header is first-of-type in its own column (both
           "Games this week" and "Practice & film" qualify, each the only
           section header in its own .weekAheadCol) means nothing above
           this wrap was ever pushing space between them -- this toggle
           link had zero margin of its own either, so the two sat flush
           against each other with no gap. text-align:center also fixes
           the link itself -- .lbLinkBtn is a plain inline-block button,
           so without it the link just sits flush left instead of centered
           under the stat cards above it, same as every other centered
           toggle on this screen. -->
      <div id="thisweekOpponentFormWrap" style="text-align:center;margin:10px 0 16px;"></div>
    `;

    return `
      <div class="weekAheadWriteup">${escapeHtml(weekAheadWriteupText(data))}</div>
      <div class="weekAheadStats">${statCards.join('')}</div>
      ${footageHtml}
      <div class="weekAheadColumns">
        ${gamesHtml ? `<div class="weekAheadCol"><div class="lbSectionHeader">🏈 Games this week</div>${gamesHtml}</div>` : ''}
        ${practicesHtml ? `<div class="weekAheadCol"><div class="lbSectionHeader">🏃 Practice &amp; film</div>${practicesHtml}</div>` : ''}
      </div>
    `;
  }

  // Nathan: "same CTA to watch the upcoming opponents video footage" needs
  // to know which game This Week is currently pointing at -- the manually-set
  // saved.gameId (Weekly Goals' own game picker) often isn't set even when
  // Week Ahead is already showing this week's game automatically
  // (buildWeekAheadData scans the same upcomingGames list by date, no manual
  // link required), so this falls back to that same auto-detected game.
  // Shared by renderReadOnly() (the "This week's game: ..." link) and
  // renderWeekAhead() (the Watch Footage CTA) so both agree on the exact
  // same game without duplicating this lookup.
  function getLinkedWeekGame() {
    const autoWeekGame = (buildWeekAheadData(upcomingGames, upcomingPractices).gameEntries[0] || {}).g || null;
    return (saved.gameId ? upcomingGames.find(g => g.id === saved.gameId) : null) || autoWeekGame;
  }

  function renderWeekAhead() {
    const box = document.getElementById('thisweekAheadBox');
    const textEl = document.getElementById('thisweekAheadText');
    if (!box || !textEl) return;
    box.style.display = '';
    textEl.innerHTML = weekAheadInfographicHtml(buildWeekAheadData(upcomingGames, upcomingPractices));
    // Nathan: "just make it a place to visit" -- each card jumps straight
    // to that game's/practice's own Schedule detail page. Plain
    // addEventListener per button (innerHTML was just rebuilt above, so
    // nothing from a previous render is still attached) rather than
    // inline onclick, consistent with how every other list in this app
    // wires up its rows.
    textEl.querySelectorAll('[data-open-game]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.openScheduleGame) window.openScheduleGame(btn.dataset.openGame);
      });
    });
    textEl.querySelectorAll('[data-open-practice]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof window.setSection === 'function') window.setSection('schedule');
        if (window.openPracticeDetail) window.openPracticeDetail(btn.dataset.openPractice);
      });
    });

    // Nathan: "I need an option to add in Opponent Film on the Upcoming
    // Game... When you click into This Week it should have a Watch
    // Footage button that opens the film from the upcoming opponent." The
    // button/note themselves are now generated fresh as part of the
    // innerHTML above (see weekAheadInfographicHtml) so they land between
    // the stat cards and the Games/Practices columns -- this just finds
    // them by id (they may not exist at all if there's nothing on the
    // Schedule this week, hence the "Nothing on the Schedule" early-return
    // branch in weekAheadInfographicHtml, so every lookup below is guarded)
    // and fills in href/text/visibility from whichever game This Week is
    // currently linked to.
    const linkedGame = getLinkedWeekGame();
    const watchFootageWrap = document.getElementById('thisweekWatchFootageWrap');
    const watchFootageNoteEl = document.getElementById('thisweekWatchFootageNote');
    const hasFootageNote = !!(linkedGame && linkedGame.opponentFilmUrl && linkedGame.opponentFilmNote);
    if (watchFootageWrap) {
      if (linkedGame && linkedGame.opponentFilmUrl && window.filmButtonHtml) {
        // Nathan: "I still hate that the google videos open in another
        // screen - walk it to open in a local player." This used to be a
        // bare <a target="_blank"> -- the one Watch Film button left in
        // the app that still jumped to a new tab instead of using that
        // fix. window.filmButtonHtml (js/schedule.js) is the exact same
        // function every other Watch Game Film button already goes
        // through, so this one now opens inline the same way. filmGameId
        // still carries the same data-film-game-id attribute
        // js/film-views.js's "let me know who is watching film" listener
        // reads, unchanged.
        watchFootageWrap.innerHTML = window.filmButtonHtml(linkedGame.opponentFilmUrl, '🎥 Watch Game Film of our Upcoming Opponent', {
          filmGameId: linkedGame.id,
          btnClass: 'navBtn',
          btnStyle: `display:block;width:100%;text-align:center;box-sizing:border-box;${hasFootageNote ? 'margin-bottom:4px;' : 'margin-bottom:12px;'}`,
        });
      } else {
        watchFootageWrap.innerHTML = '';
      }
    }
    // Nathan: "include a write-in spot for the footage to say something
    // underneath it. example is 'Nipmuc is in white. Final score: Nipmuc 7
    // - Merrimack Valley 6'" -- same opponentFilmNote a coach sets on the
    // game itself (schedule.js), only shown alongside the button above.
    if (watchFootageNoteEl) {
      if (hasFootageNote) {
        watchFootageNoteEl.style.display = '';
        watchFootageNoteEl.textContent = linkedGame.opponentFilmNote;
      } else {
        watchFootageNoteEl.style.display = 'none';
        watchFootageNoteEl.textContent = '';
      }
    }
    // Nathan: "The team we are playing that week should also have the
    // film visible in the WEEK AHEAD section so kids can see film on the
    // opponent ahead." Separate from the single opponentFilmUrl button
    // right above (which stays exactly as it was) -- these are the
    // richer, multi-clip js/opponent-film.js entries for this week's
    // opponent, fetched fresh each render (cheap, small document) rather
    // than cached, since a coach could add one mid-week.
    const scoutingWrap = document.getElementById('thisweekOpponentScoutingWrap');
    if (scoutingWrap) {
      scoutingWrap.innerHTML = '';
      if (linkedGame && linkedGame.opponent && window.OpponentFilm && window.filmButtonHtml) {
        window.OpponentFilm.load().then((entries) => {
          if (!scoutingWrap.isConnected) return;
          const clips = window.OpponentFilm.clipsForTeam(entries, linkedGame.opponent);
          if (!clips.length) return;
          scoutingWrap.innerHTML = `<div class="lbSectionHeader" style="font-size:13px;">🔭 Scouting Film: ${escapeHtml(linkedGame.opponent)}</div>` + clips.map((c) => window.filmButtonHtml(c.url, escapeHtml(c.title || `🎥 Watch ${linkedGame.opponent} Film`), {
            btnClass: 'navBtn',
            btnStyle: 'display:block;width:100%;text-align:center;box-sizing:border-box;margin-bottom:4px;',
          })).join('') + '<div style="margin-bottom:10px;"></div>';
        }).catch(() => {});
      }
    }
    renderOpponentForm(linkedGame);
  }

  // Nathan, follow-up to "what else can we pull in from CMYFCC": "the
  // upcoming opponent's own real season results, not just ours" -- a
  // coach/kid can already see this by drilling into that specific
  // Schedule game's own "Last 5 Games" > "<Opponent>'s Last 5" tab (js/
  // schedule.js's renderLast5Panel), but that's a real click-through away;
  // This Week is the actual weekly dashboard, right next to the Scouting
  // Film section above, so it shows up without a coach having to go
  // looking for it. Reuses the exact same real functions that panel
  // already proved out (js/standings.js's fetchCmyfccGamesFor/
  // window.compactGameRowHtml/window.opponentBadgeHtml) -- no second,
  // drifting copy of the CMYFCC fetch/match/row-rendering logic.
  //
  // Same "not final" caution js/schedule.js's own renderLast5Panel already
  // has: these rows carry CMYFCC's own game ids, not one of OUR local
  // Schedule game ids, so they're never wired to open a game detail page
  // (would silently open a blank draft) -- only the opponent's own logo is
  // clickable, to their Standings team page (window.openStandingsTeamPage,
  // same destination compactGameRowHtml's own click target would use
  // elsewhere in the app).
  // Nathan: "I don't need the opponents full schedule in this week ahead.
  // we can have a drop down that says see opponents recent results and it
  // shows recent games, but all this shouldn't show up on load." Collapsed
  // by default, same toggle-link pattern js/play-calls.js's own
  // renderBallCarrierFilterBar already established -- no CMYFCC fetch at
  // all until a coach/kid actually asks for it. Only recent (final) games
  // now -- the opponent's own upcoming schedule isn't relevant to
  // studying THIS week's matchup, and was unrequested clutter on every
  // load either way.
  function renderOpponentForm(linkedGame) {
    const wrap = document.getElementById('thisweekOpponentFormWrap');
    if (!wrap) return;
    const opponent = linkedGame && linkedGame.gameType !== 'Bye' ? linkedGame.opponent : null;
    if (!opponent || !window.fetchCmyfccGamesFor || !window.compactGameRowHtml || !window.opponentBadgeHtml) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = '';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'lbLinkBtn';
    const closedLabel = `📊 See ${opponent}'s Recent Results ›`;
    const openLabel = `📊 Hide ${opponent}'s Recent Results`;
    toggleBtn.textContent = closedLabel;
    const body = document.createElement('div');
    body.style.display = 'none';
    body.style.marginTop = '8px';
    let fetched = false;
    toggleBtn.addEventListener('click', () => {
      const show = body.style.display === 'none';
      body.style.display = show ? '' : 'none';
      toggleBtn.textContent = show ? openLabel : closedLabel;
      if (show && !fetched) {
        fetched = true;
        loadOpponentRecentResults(opponent, body);
      }
    });
    wrap.appendChild(toggleBtn);
    wrap.appendChild(body);
  }
  function loadOpponentRecentResults(opponent, body) {
    body.innerHTML = '<div class="hint" style="text-align:center;">Loading…</div>';
    window.fetchCmyfccGamesFor(opponent).then((all) => {
      // Stale-response guard, same reasoning as js/standings.js's own
      // loadOpponentRecentForm -- a slow response landing after the coach
      // has already collapsed this, or navigated away from This Week
      // entirely, shouldn't clobber whatever's on screen now. Checking
      // the body node's own connectedness directly (rather than
      // re-fetching thisweekOpponentFormWrap by id and comparing) works
      // the same way but doesn't depend on this still being the CURRENT
      // wrap's own body -- it just asks "is this still live."
      if (!body.isConnected) return;
      const recent = all.filter((g) => g.isFinal).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
      if (!recent.length) {
        body.innerHTML = `<div class="lbEmpty">No recent games found for ${escapeHtml(opponent)} on CMYFCC yet.</div>`;
        return;
      }
      const badgeHtml = window.teamBadgeHtmlFor ? window.teamBadgeHtmlFor(opponent) : window.opponentBadgeHtml(opponent);
      const rowsHtml = recent.map((g) => window.compactGameRowHtml(g, { teamName: opponent, teamBadgeHtml: badgeHtml })).join('');
      body.innerHTML = `<div class="last5List">${rowsHtml}</div>`;
      body.querySelectorAll('.last5RowOpponentLogo').forEach((el) => {
        const name = el.dataset.opponentName;
        if (!name || !window.openStandingsTeamPage) return;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          window.openStandingsTeamPage(name, null);
        });
      });
    }).catch((e) => {
      if (!body.isConnected) return;
      body.innerHTML = `<div class="lbEmpty">Couldn't load from CMYFCC: ${escapeHtml(e.message)}</div>`;
    });
  }

  // js/gameplan.js (loads earlier in index.html's scripts array) now owns
  // this numbering -- was a private copy here, byte-identical to the one
  // that file needs anyway for describe()'s own v1 label/color lookup;
  // delegating avoids maintaining two copies of the same logic. (js/
  // call-sheet-pdf.js never had a copy of this at all -- it builds its own
  // rows straight off window.DATA.playTypes; js/drivebuilder.js's own
  // picker also no longer calls this, having since moved to sourcing
  // straight from thisWeek.json's own plays via gamePlanEntries.)
  function numberedRows() {
    return window.GamePlan ? window.GamePlan.numberedRows() : [];
  }

  function isSelected(row) {
    return pendingSelection.some(p => p.key === row.key && p.direction === row.direction);
  }

  // ---- Cloud load/save -- same firebaseAuthed()/fetch pattern as
  // play-calls.js's loadLiveEditsIntoData() and edit-plays.js's Save to
  // Cloud button. ----
  function loadThisWeek() {
    const statusEl = document.getElementById('thisweekCloudStatus');
    if (statusEl) statusEl.textContent = 'Loading this week’s page…';
    return window.firebaseAuthed(THISWEEK_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        let coachKeys = null;
        if (data && Array.isArray(data.coachKeys)) {
          coachKeys = data.coachKeys
            .filter(c => c && typeof c === 'object')
            .map(c => {
              const keys = Array.isArray(c.keys) ? c.keys.slice(0, NUM_KEYS).map(k => k || '') : [];
              while (keys.length < NUM_KEYS) keys.push('');
              return { name: (c.name || '').toString(), keys };
            });
        }
        if (!coachKeys) {
          // First time this ever loads (or nothing saved yet) -- seed the
          // named coaches with blank keys.
          coachKeys = DEFAULT_COACHES.map(name => ({ name, keys: ['', '', ''] }));
          // Don't drop a still-in-place legacy single shared "3 Keys" set
          // (the pre-per-coach data shape) -- fold it into its own editable
          // row up top so a coach can see it, redistribute or delete it,
          // nothing silently vanishes.
          if (data && Array.isArray(data.keys)) {
            const legacyKeys = data.keys.slice(0, NUM_KEYS).map(k => (k || '').toString());
            while (legacyKeys.length < NUM_KEYS) legacyKeys.push('');
            if (legacyKeys.some(k => k.trim())) {
              coachKeys.unshift({ name: '(Unassigned — from before per-coach keys)', keys: legacyKeys });
            }
          }
        }
        if (data && typeof data === 'object') {
          saved = {
            coachKeys,
            plays: Array.isArray(data.plays) ? data.plays.filter(p => p && p.key && p.direction) : [],
            gameId: data.gameId || '',
            updatedAt: data.updatedAt || null,
          };
        } else {
          saved = { coachKeys, plays: [], gameId: '', updatedAt: null };
        }
        pendingSelection = saved.plays.slice();
        pendingGameId = saved.gameId || '';
        pendingCoachKeys = saved.coachKeys.map(c => ({ name: c.name, keys: c.keys.slice() }));
        if (statusEl) statusEl.textContent = '';
        // Nathan: "assigning plays to study for a particular player." Real
        // roster data (names/numbers for a spotlight badge, and for
        // resolving "is this MY play" below) needs to be loaded BEFORE the
        // first render, not lazily after -- unlike js/depth-chart.js's own
        // getDefenseStarterNumbers (silent, shows up on whatever render
        // happens next), a coach/kid's very first look at This Week should
        // already be correct.
        const rosterReady = (window.isTeamRosterLoaded && window.isTeamRosterLoaded())
          ? Promise.resolve() : (window.loadTeamRoster ? window.loadTeamRoster() : Promise.resolve());
        return Promise.all([loadUpcomingGames(), loadUpcomingPractices(), loadOpponentLogosForWeekAhead(), rosterReady]);
      })
      .then(() => {
        renderReadOnly();
        renderEditor();
        renderWeekAhead();
      })
      .catch(err => {
        console.error('Could not load This Week:', err);
        if (statusEl) statusEl.textContent = 'Could not reach the cloud -- showing nothing set yet.';
      });
  }

  function saveThisWeek() {
    const saveBtn = document.getElementById('thisweekSaveBtn');
    const statusEl = document.getElementById('thisweekCloudStatus');
    // Drop fully-blank rows (no name typed, no keys filled) so an
    // accidental "+ Add Coach" tap that's never used doesn't get saved --
    // anything with a name and/or at least one key is kept as-is.
    const coachKeys = pendingCoachKeys
      .map(c => ({ name: (c.name || '').trim(), keys: (c.keys || ['', '', '']).slice(0, NUM_KEYS).map(k => (k || '').trim()) }))
      .filter(c => c.name || c.keys.some(k => k));
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
    // Found live (codebase audit, 2026-09-26): this used to PUT straight
    // from whatever pendingCoachKeys/pendingSelection/pendingGameId held
    // from whenever loadThisWeek() last ran, with no re-fetch first --
    // unlike js/gameplan.js's addEntry()/saveDraftAsGamePlan(), which both
    // fetch current thisWeek.json right before writing specifically so a
    // stale local copy can't silently clobber a save that landed from
    // elsewhere (a different coach's device, or a "+ Add to Game Plan"
    // tap on a real card) in the meantime. Same fetch-then-merge here now,
    // for the same reason -- Object.assign over the fresh fetch keeps
    // this editor narrowly responsible for coachKeys/plays/gameId/
    // updatedAt without silently reverting some other field this file
    // doesn't know about.
    window.firebaseAuthed(THISWEEK_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null).then(current => {
      const payload = Object.assign({}, current, { coachKeys, plays: pendingSelection.slice(), gameId: pendingGameId || '', updatedAt: new Date().toISOString() });
      return window.firebaseAuthed(THISWEEK_URL).then(url => fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })).then(r => ({ r, payload }));
    }).then(({ r, payload }) => {
      if (r.ok) {
        saved = payload;
        pendingCoachKeys = coachKeys.map(c => ({ name: c.name, keys: c.keys.slice() }));
        if (statusEl) statusEl.textContent = 'Saved -- this is what the team sees now.';
        if (saveBtn) saveBtn.textContent = 'Saved!';
        renderReadOnly();
        // Nathan: "make sure that when coaches add Keys to the week, it is
        // visible as a notification linking them to the This Week section."
        // Only fires when there's actually a non-blank key set to tell
        // people about -- saving with everything cleared shouldn't ping
        // anyone.
        const hasKeysNow = coachKeys.some(c => c.keys.some(k => k));
        if (hasKeysNow && window.showLocalNotification) {
          window.showLocalNotification(
            '🎯 This Week\'s Keys are up',
            'Coaches posted new keys for this week -- tap to check them out.',
            { tag: 'aslBengalsThisWeek', thisWeek: true }
          );
        }
      } else {
        if (statusEl) statusEl.textContent = `Save failed (HTTP ${r.status}).`;
        if (saveBtn) saveBtn.textContent = 'Save Failed';
      }
      setTimeout(() => { if (saveBtn) { saveBtn.textContent = 'Save This Week'; saveBtn.disabled = false; } }, 2200);
    }).catch(err => {
      console.error('This Week save failed:', err);
      if (statusEl) statusEl.textContent = `Save failed: ${err.message}`;
      if (saveBtn) { saveBtn.textContent = 'Save Failed'; saveBtn.disabled = false; }
      setTimeout(() => { if (saveBtn) saveBtn.textContent = 'Save This Week'; }, 2200);
    });
  }

  // ---- Read-only view: everyone sees this ----
  // Takes a SAVED entry (v1 `{key,direction}` or v2, the real, dialed-in
  // call shape js/gameplan.js's "+ Add to Game Plan" button produces on the
  // real play card) -- window.GamePlan.describe() resolves either shape to
  // a label/color, and (for v1 only) the same generic `row` this function
  // already rendered from before v2 existed. A v2 entry is rendered with
  // its OWN full toggle state (wingSide independent of direction, Motion/
  // Boot/Counter/PopVariant/alignmentToggles) instead of always the play's
  // bare default -- this is the actual fix for "with the directions and
  // toggles I want." A v1 entry's own rendering is byte-identical to
  // before -- same def.io/def.rp lookup, same authoredFormationId check.
  function makeStaticCard(entry) {
    const info = window.GamePlan ? window.GamePlan.describe(entry) : { label: '', color: '#999', v2: null, row: null };
    const wrap = document.createElement('div');
    wrap.className = 'gameplanCard';
    const label = document.createElement('div');
    label.className = 'gameplanCardLabel';
    label.style.color = info.color;
    label.textContent = info.label;
    wrap.appendChild(label);
    // Nathan: "create packages for certain players... assigning plays to
    // study for a particular player." spotlightPlayers is additive to
    // EITHER shape (v1 or v2), read off the raw entry, not info.v2 --
    // js/gameplan-builder.js's own tag panel is the only place this ever
    // gets set.
    if (entry.spotlightPlayers && entry.spotlightPlayers.length && window.getTeamRosterCached) {
      const byId = {};
      window.getTeamRosterCached().forEach(p => { byId[String(p.id)] = p; });
      const names = entry.spotlightPlayers.map(id => {
        const p = byId[String(id)];
        return p ? `#${p.num || '?'} ${p.name || ''}`.trim() : null;
      }).filter(Boolean);
      if (names.length) {
        const tag = document.createElement('div');
        tag.className = 'gameplanCardSpotlight';
        tag.textContent = '🎯 ' + names.join(', ');
        wrap.appendChild(tag);
      }
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'gameplanCardSvg');
    wrap.appendChild(svg);
    if (window.renderCardDiagram && window.DATA) {
      if (info.v2) {
        const e = info.v2;
        const formationId = e.formation === 'shotgun' ? undefined : e.formation;
        if (e.formation === 'split' && window.renderSplitDiagram) {
          window.renderSplitDiagram(svg, e.key, e.splitSide, e.insideOutside, e.readPosition, e.leftCall, e.rightCall, e.passOn, null, e.protection);
        } else {
          window.renderCardDiagram(svg, e.key, e.direction, e.wingSide, null, '4x4', e.insideOutside, e.motionOn, e.bootOn, e.readPosition, e.counterOn, e.popVariantOn, formationId, e.overloadOn, e.alignmentValues, e.qbSneakOn, e.reverseOn, e.qbKeepOn);
        }
      } else if (info.row) {
        const row = info.row;
        const playType = window.DATA.playTypes.find(p => p.key === row.key);
        const def = (window.playbookDefaultSubvariant && playType) ? window.playbookDefaultSubvariant(playType) : { io: null, rp: null };
        // A custom-formation play (authoredFormationId set by js/playbuilder/
        // legacy-adapter.js, e.g. "i") is already resolved against its OWN
        // real anchors, not Wing's -- renderCardDiagram defaults formationId
        // to 'wing' when not passed, which would shift its points onto
        // Wing's shotgun geometry and render nonsense. Every classic Wing
        // play has no authoredFormationId, so this stays undefined ->
        // 'wing' for them, unchanged.
        // wingSide: a v1 row only ever stored ONE direction value -- wrong
        // for I's Sweep (directionOpposesWing), whose real toggle always
        // keeps wingSide opposite of direction. See js/gameplan.js's
        // legacyWingSideFor for the full story; no-op for every other play.
        const wingSide = window.GamePlan ? window.GamePlan.legacyWingSideFor(row.key, row.direction) : row.direction;
        window.renderCardDiagram(svg, row.key, row.direction, wingSide, null, '4x4', def.io, false, false, def.rp, false, false, playType && playType.authoredFormationId);
      }
    }
    return wrap;
  }

  function renderReadOnly() {
    const emptyEl = document.getElementById('thisweekEmptyState');
    const keysBox = document.getElementById('thisweekKeysBox');
    const keysList = document.getElementById('thisweekKeysList');
    const gridEl = document.getElementById('thisweekCardsGrid');
    const gameLinkEl = document.getElementById('thisweekGameLink');
    if (!keysBox || !keysList || !gridEl) return;

    // Nathan: "column width CTA under the Week Ahead write up on the This
    // Week tab is still missing. Should have the same CTA... that is
    // available on the game card when you click into the schedule." The
    // Watch Footage CTA itself is now populated over in renderWeekAhead()
    // (its button/note markup lives inside #thisweekAheadText's own
    // innerHTML now -- see weekAheadInfographicHtml) -- this just still
    // needs linkedGame for the separate "This week's game: ..." link below.
    const linkedGame = getLinkedWeekGame();
    if (gameLinkEl) {
      if (linkedGame) {
        gameLinkEl.style.display = '';
        gameLinkEl.textContent = `🏈 This week's game: ${gameLabel(linkedGame)} ›`;
        gameLinkEl.onclick = () => { if (window.openScheduleGame) window.openScheduleGame(linkedGame.id); };
      } else {
        gameLinkEl.style.display = 'none';
      }
    }

    // Only coaches who actually filled in at least one key show up here --
    // an empty seeded row (e.g. a coach who hasn't posted keys yet) stays
    // invisible to players rather than showing a blank heading.
    const coachesWithKeys = (saved.coachKeys || [])
      .map(c => ({ name: (c.name || '').trim() || 'Coach', keys: (c.keys || []).map(k => (k || '').trim()).filter(Boolean) }))
      .filter(c => c.keys.length);
    const hasContent = coachesWithKeys.length > 0 || (saved.plays && saved.plays.length > 0);
    if (emptyEl) emptyEl.style.display = hasContent ? 'none' : '';

    keysBox.style.display = coachesWithKeys.length ? '' : 'none';
    keysList.innerHTML = '';
    coachesWithKeys.forEach(c => {
      const heading = document.createElement('div');
      heading.className = 'thisweekCoachName';
      heading.textContent = c.name;
      keysList.appendChild(heading);
      const ol = document.createElement('ol');
      ol.className = 'thisweekKeysList';
      c.keys.forEach(k => {
        const li = document.createElement('li');
        li.textContent = k;
        ol.appendChild(li);
      });
      keysList.appendChild(ol);
    });

    // Nathan: "assigning plays to study for a particular player." Only
    // shown when the current session actually resolves to a real roster
    // row (js/roster.js's new myRosterEntry()) -- no point offering a
    // filter that can never match anyone (a coach profile, an unlinked
    // guest, etc.).
    const myPlaysBtn = document.getElementById('thisweekMyPlaysBtn');
    const myEntry = window.myRosterEntry ? window.myRosterEntry() : null;
    const myTaggedCount = myEntry ? (saved.plays || []).filter(p => p.spotlightPlayers && p.spotlightPlayers.map(String).includes(String(myEntry.id))).length : 0;
    if (myPlaysBtn) {
      if (myEntry && myTaggedCount) {
        myPlaysBtn.style.display = '';
        myPlaysBtn.textContent = myPlaysOnly ? '← Show everyone’s plays' : `🎯 Show just #${myEntry.num || '?'} ${myEntry.name}’s plays (${myTaggedCount})`;
        myPlaysBtn.onclick = () => { myPlaysOnly = !myPlaysOnly; renderReadOnly(); };
      } else {
        myPlaysBtn.style.display = 'none';
        myPlaysOnly = false;
      }
    }

    gridEl.innerHTML = '';
    // Pass each saved entry straight through -- makeStaticCard's own
    // describe() call resolves v1 vs v2 now, so a v2 entry's real toggle
    // state actually reaches the renderer (the old rows.find()-first lookup
    // here only ever matched on key+direction, silently discarding
    // everything a v2 entry adds).
    const visiblePlays = (myPlaysOnly && myEntry)
      ? (saved.plays || []).filter(p => p.spotlightPlayers && p.spotlightPlayers.map(String).includes(String(myEntry.id)))
      : (saved.plays || []);
    visiblePlays.forEach(sel => {
      gridEl.appendChild(makeStaticCard(sel));
    });
  }

  // ---- Coach editor ----
  // Nathan: "add in Coaches Names with 3 areas to show their 3 KEYS...
  // they should be editable and removable if needed." One card per coach
  // in pendingCoachKeys -- a name field, 3 key inputs, and a Remove button.
  // Rebuilds are skipped while a coach is actively typing inside this list
  // (same "don't stomp on what someone's mid-typing" pattern already used
  // for thisweekGameSelect/the old key inputs below) unless `force` is
  // passed, which Add Coach / Remove use since those are structural
  // changes that have to redraw regardless.
  function renderCoachEditorList(force) {
    const listEl = document.getElementById('thisweekCoachEditorList');
    if (!listEl) return;
    if (!force && listEl.contains(document.activeElement)) return;
    listEl.innerHTML = '';
    pendingCoachKeys.forEach((coach, idx) => {
      const card = document.createElement('div');
      card.className = 'thisweekCoachEditCard';

      const row = document.createElement('div');
      row.className = 'thisweekCoachEditRow';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'thisweekCoachNameInput';
      nameInput.maxLength = 40;
      nameInput.placeholder = 'Coach name';
      nameInput.value = coach.name || '';
      nameInput.addEventListener('input', () => { coach.name = nameInput.value; });
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'thisweekCoachRemoveBtn';
      removeBtn.textContent = '✕ Remove';
      removeBtn.addEventListener('click', () => {
        pendingCoachKeys.splice(idx, 1);
        renderCoachEditorList(true);
      });
      row.appendChild(nameInput);
      row.appendChild(removeBtn);
      card.appendChild(row);

      if (!coach.keys) coach.keys = ['', '', ''];
      for (let i = 0; i < NUM_KEYS; i++) {
        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.className = 'thisweekKeyInput';
        keyInput.maxLength = 80;
        keyInput.placeholder = `Key #${i + 1}`;
        keyInput.value = coach.keys[i] || '';
        keyInput.addEventListener('input', () => { coach.keys[i] = keyInput.value; });
        card.appendChild(keyInput);
      }
      listEl.appendChild(card);
    });
  }

  // The Game Plan's own review list -- every play a coach has actually
  // added (via the picker chips above, OR via "+ Add to Game Plan" on the
  // real play card, js/play-calls.js's buildCard -- the only path that
  // captures a specific direction/wingSide/toggle combo, not just a play's
  // bare default). One row per entry, in the order added, with a readable
  // summary (window.GamePlan.describe()) and a Remove button. Kept
  // separate from the chip grid above rather than replacing it -- the chip
  // grid is still the fast "just add this play's default look" path, and
  // an open-ended set of specific calls isn't flatly enumerable as chips
  // the way ~16-32 default plays are.
  function renderGamePlanList() {
    const listEl = document.getElementById('thisweekGamePlanList');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!pendingSelection.length) {
      const empty = document.createElement('div');
      empty.className = 'lbSub';
      empty.style.textAlign = 'center';
      empty.textContent = 'Nothing added yet -- tap a play above, or browse to any play and tap "+ Add to Game Plan" for a specific direction/side/toggle combo.';
      listEl.appendChild(empty);
      return;
    }
    pendingSelection.forEach((sel, idx) => {
      const info = window.GamePlan ? window.GamePlan.describe(sel) : { label: `${sel.key} • ${sel.direction}`, color: '#999' };
      const row = document.createElement('div');
      row.className = 'gameplanListRow';
      const labelEl = document.createElement('span');
      labelEl.className = 'gameplanListLabel';
      labelEl.style.color = info.color;
      labelEl.textContent = info.label;
      row.appendChild(labelEl);
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'gameplanListRemoveBtn';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        pendingSelection.splice(idx, 1);
        renderEditor();
      });
      row.appendChild(removeBtn);
      listEl.appendChild(row);
    });
  }

  function renderEditor() {
    const section = document.getElementById('thisweekEditSection');
    if (!section) return;
    const approved = window.isApprovedCoachProfile ? window.isApprovedCoachProfile() : false;
    // Nathan: "It should be right below the top box." Now lives outside
    // #thisweekEditSection (see index.html) so it needs its own gate here,
    // set before the early return below so a non-coach session (which
    // returns early) still correctly hides it.
    const buildBtnEl = document.getElementById('thisweekBuildGamePlanBtn');
    // Nathan: "the Create Your Game Plan CTA is justified left, it should
    // be centered under the other section." Setting display back to ''
    // dropped the inline display:block a <button> needs for its own
    // margin:0 auto centering to actually take effect (a <button>
    // defaults to inline-block, which margin:auto doesn't center) --
    // 'block' here is what index.html's own inline style already assumes.
    if (buildBtnEl) buildBtnEl.style.display = approved ? 'block' : 'none';
    section.style.display = approved ? '' : 'none';
    if (!approved) return;

    renderCoachEditorList(false);

    const gameSelect = document.getElementById('thisweekGameSelect');
    if (gameSelect && document.activeElement !== gameSelect) {
      gameSelect.innerHTML = '';
      const blankOpt = document.createElement('option');
      blankOpt.value = ''; blankOpt.textContent = 'No game linked';
      gameSelect.appendChild(blankOpt);
      upcomingGames.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id; opt.textContent = gameLabel(g);
        if (g.id === pendingGameId) opt.selected = true;
        gameSelect.appendChild(opt);
      });
      gameSelect.value = pendingGameId || '';
      gameSelect.onchange = () => { pendingGameId = gameSelect.value; };
    }

    const pickerGrid = document.getElementById('thisweekPickerGrid');
    const countEl = document.getElementById('thisweekPickerCount');
    if (!pickerGrid) return;
    pickerGrid.className = 'gameplanGroupList';
    pickerGrid.innerHTML = '';
    const groups = window.GamePlan ? window.GamePlan.pickerGroups() : [];
    groups.forEach(group => {
      const card = document.createElement('div');
      card.className = 'gameplanGroup';
      const header = document.createElement('div');
      header.className = 'gameplanGroupHeader';
      header.style.setProperty('--chip-color', group.color);
      header.textContent = group.header;
      card.appendChild(header);
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'gameplanGroupChips';
      group.entries.forEach(row => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'gameplanChip coachToolsSubChip' + (isSelected(row) ? ' active' : '');
        chip.style.setProperty('--chip-color', row.color);
        // Multi-formation group ("Blast"): each chip needs to say which
        // formation it's from ("Wing L", "I R"), since the header no
        // longer does. Single-formation group: the header already carries
        // that (e.g. "5 Guys: 1"), so a chip is just its direction.
        chip.textContent = group.multi ? `${row.formation} ${row.direction === 'Left' ? 'L' : 'R'}` : row.direction;
        chip.addEventListener('click', () => {
          const idx = pendingSelection.findIndex(p => p.key === row.key && p.direction === row.direction);
          if (idx >= 0) {
            pendingSelection.splice(idx, 1);
          } else {
            if (pendingSelection.length >= MAX_PLAYS) {
              alert(`Game Plan is capped at ${MAX_PLAYS} -- remove one first.`);
              return;
            }
            pendingSelection.push({ key: row.key, direction: row.direction });
          }
          renderEditor();
        });
        chipsWrap.appendChild(chip);
      });
      card.appendChild(chipsWrap);
      pickerGrid.appendChild(card);
    });
    renderGamePlanList();
    if (countEl) {
      const n = pendingSelection.length;
      // "Aim for 5-15" read as a hard ceiling once MAX_PLAYS was raised
      // well past 15 -- MIN_RECOMMENDED is still a real, useful floor to
      // suggest, there's just no longer a target UPPER number worth
      // stating (MAX_PLAYS is a generous backstop now, not a goal).
      countEl.textContent = `Game Plan — ${n} selected (aim for at least ${MIN_RECOMMENDED})`;
      countEl.style.color = (n > MAX_PLAYS) ? '#e0201a' : '';
    }
  }

  // Reused by schedule.js to show this same week's featured plays inline on
  // the linked game's own detail page, without duplicating the diagram
  // rendering logic.
  window.renderFeaturedPlayCards = function (wrapEl, plays) {
    if (!wrapEl) return;
    wrapEl.innerHTML = '';
    (plays || []).forEach(sel => {
      wrapEl.appendChild(makeStaticCard(sel));
    });
  };

  // Two-way hook, same pattern Play Builder V2's own editor/formation-editor
  // already established this session -- js/gameplan.js's addEntry() already
  // saved the new play for real (see its own comment for why: an in-memory-
  // only push here would be lost the next time This Week reloads) before
  // calling this, so this is purely "reflect it on screen if this screen
  // happens to already be open" -- guarded on `loaded` since neither
  // saved/pendingSelection nor the DOM this renders into exist until
  // initThisWeek() has actually run once.
  window.ThisWeekGamePlan = {
    onExternalAdd(entry) {
      saved = Object.assign({}, saved, { plays: (saved.plays || []).concat([entry]) });
      pendingSelection.push(entry);
      if (loaded) { renderReadOnly(); renderEditor(); }
    },
    // Same two-way-sync idea as onExternalAdd, for the Game Plan Builder's
    // own whole-list Save (js/gameplan-builder.js/js/gameplan.js's
    // saveDraftAsGamePlan) -- already saved for real by the time this
    // fires, so this is purely "reflect it on screen if This Week's own
    // editor happens to already be open."
    onReplace(gameId, plays) {
      saved = Object.assign({}, saved, { plays: (plays || []).slice(), gameId: gameId || '' });
      pendingSelection = (plays || []).slice();
      pendingGameId = gameId || '';
      if (loaded) { renderReadOnly(); renderEditor(); }
    },
  };

  let controlsWired = false;
  function wireEditorControls() {
    if (controlsWired) return;
    controlsWired = true;
    const saveBtn = document.getElementById('thisweekSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveThisWeek);
    const addCoachBtn = document.getElementById('thisweekAddCoachBtn');
    if (addCoachBtn) addCoachBtn.addEventListener('click', () => {
      pendingCoachKeys.push({ name: '', keys: ['', '', ''] });
      renderCoachEditorList(true);
    });
    // Nathan: "generate a call sheet for the week... a printable 1 page PDF
    // with all the details." Prints pendingSelection (what's actually on
    // screen right now) rather than only the last-saved list -- "print what
    // I'm looking at" is the less surprising choice than a coach who just
    // added a play wondering why it's missing from the sheet. Same
    // disabled/originalLabel/try-catch-finally pattern js/coachtools-
    // print.js's own PDF buttons already use.
    const printBtn = document.getElementById('thisweekPrintCallSheetBtn');
    if (printBtn) {
      const originalLabel = printBtn.textContent;
      printBtn.addEventListener('click', async () => {
        if (printBtn.disabled || !window.generateGamePlanPDF) return;
        if (!pendingSelection.length) { alert('Add at least one play to the Game Plan first.'); return; }
        printBtn.disabled = true;
        printBtn.textContent = '📋 Generating…';
        try {
          const doc = await window.generateGamePlanPDF(pendingSelection);
          doc.save('ASL_Bengals_Game_Plan_Call_Sheet.pdf');
          printBtn.textContent = '✅ Saved!';
        } catch (err) {
          console.error('Game Plan PDF generation failed:', err);
          printBtn.textContent = '⚠️ Failed — tap to retry';
        } finally {
          setTimeout(() => { printBtn.textContent = originalLabel; printBtn.disabled = false; }, 2200);
        }
      });
    }
    // Nathan: "I need a simplified version for the print out... just a
    // list of Play Calls with available Formations to run it out of...
    // and Formations with pills of each play you run out of it." Same
    // disabled/originalLabel/try-catch-finally pattern as the detailed
    // Call Sheet button just above -- a second, additive print option,
    // not a replacement.
    const quickRefBtn = document.getElementById('thisweekPrintQuickRefBtn');
    if (quickRefBtn) {
      const originalQuickRefLabel = quickRefBtn.textContent;
      quickRefBtn.addEventListener('click', async () => {
        if (quickRefBtn.disabled || !window.generateQuickReferencePDF) return;
        if (!pendingSelection.length) { alert('Add at least one play to the Game Plan first.'); return; }
        quickRefBtn.disabled = true;
        quickRefBtn.textContent = '📝 Generating…';
        try {
          const doc = await window.generateQuickReferencePDF(pendingSelection);
          doc.save('ASL_Bengals_Game_Plan_Quick_Reference.pdf');
          quickRefBtn.textContent = '✅ Saved!';
        } catch (err) {
          console.error('Game Plan Quick Reference PDF generation failed:', err);
          quickRefBtn.textContent = '⚠️ Failed — tap to retry';
        } finally {
          setTimeout(() => { quickRefBtn.textContent = originalQuickRefLabel; quickRefBtn.disabled = false; }, 2200);
        }
      });
    }
    // Nathan: "Lets have it so it opens full screen like the 2-min drill
    // and you choose your opponent on the schedule to game plan
    // against." js/gameplan-builder.js owns the overlay itself; this is
    // just the entry point, same "check the global exists" guard the
    // other buttons in this function use.
    const buildBtn = document.getElementById('thisweekBuildGamePlanBtn');
    if (buildBtn) buildBtn.addEventListener('click', () => {
      if (window.openGamePlanBuilder) window.openGamePlanBuilder();
    });
  }

  window.initThisWeek = function () {
    wireEditorControls();
    if (!loaded) {
      loaded = true;
      loadThisWeek();
    } else {
      renderReadOnly();
      renderEditor();
      renderWeekAhead();
    }
  };
})();

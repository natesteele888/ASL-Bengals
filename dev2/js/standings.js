// ---------------------------------------------------------------------------
// League Standings -- Nathan: "need a place where I can copy standing from
// the coaches app and drop it directly into a field under Coaching Tools to
// paste in to update the standings. It should show the record for opponents
// and update them as the season goes on." Followed up with the exact paste
// format: a tab-separated table copied straight out of the league site --
// Team (name, then " · Tackle 11U" or similar division tag), Record (W-L or
// W-L-T), PF, PA.
//
// Two surfaces share this one file: the Coach Tools > Standings paste box
// (window.initCoachToolsStandings, gated behind Coach Tools' own
// approvedCoach check same as every other tab there) writes to Firebase;
// the read-only Standings top-level tab (window.initStandingsNav, visible
// to everyone -- see study-quiz.js's refreshCoachToolsVisibility) just
// reads and renders it. Every team in the pasted table shows here,
// including our own upcoming opponents' current records -- that's the
// "record for opponents" Nathan asked for, no separate lookup needed.
// ---------------------------------------------------------------------------
(function () {

  const STANDINGS_URL = `${FIREBASE_DB_URL}/standings.json`;
  let standingsData = null;
  let loaded = false;

  // Nathan: "I just learned that the CMYFCC.app that the coaches use also
  // has a public facing site with results and standings... it would be
  // great if this could check for updates." This IS "the league site" the
  // paste box above already expects text copied from (same "Team ·
  // Division" / record shape) -- turns out it has a real, public,
  // unauthenticated JSON API behind its own Standings/Results pages
  // (confirmed live: no login, no API key, just a POST with an empty
  // body), so this reads it directly instead of a coach copy-pasting.
  // Chose the "Sync Now" button over a fully-unattended weekly job on
  // Nathan's own call -- a truly unattended job needs its own stored
  // Firebase credential (Firebase requires a real signed-in session for
  // every write, same as this app's own saveStandings below), which is a
  // real, separate decision; this reuses the coach's own already-logged-in
  // session, so no new credentials anywhere.
  const CMYFCC_API_URL = 'https://us-central1-project-f95863ee-dc3b-4ada-964.cloudfunctions.net/getPublicSeasonSchedule';
  // CMYFCC's own name for our program -- confirmed live against the real
  // API, not guessed. Matched case-insensitively in case they ever
  // re-case it; there is no more stable id to key off of from outside
  // their system (associationId is real but undocumented/could change).
  const CMYFCC_OUR_ASSOCIATION_NAME = 'Ayer/Shirley/Lunenburg';
  // Real, live bug found testing this live: Ayer/Shirley/Lunenburg fields
  // a team in EVERY age division (9U through 13U, confirmed against the
  // real API), not just ours -- matching on associationName alone grabbed
  // whichever one happened to sort first (Tackle 10U), not this app's own
  // 11U team. This app is (and has only ever been) the 11U team -- see
  // index.html's own "11U Bengals" header -- so the division is pinned
  // here too, not derived.
  const CMYFCC_OUR_DIVISION_KEY = 'Tackle 11U';
  // Nathan: "I want to have the ability to see the standings with all the
  // other age groups... 9U, 10U, 11U, 12U, 13U" -- Ayer/Shirley/Lunenburg
  // fields a Bengals team in every one of these (confirmed live, see the
  // comment above CMYFCC_OUR_DIVISION_KEY), each its own separate
  // division/standings/playoff bracket in the same CMYFCC payload this
  // file already fetches for our own 11U team.
  const BENGALS_DIVISIONS = [
    { key: 'Tackle 9U', label: '9U' },
    { key: 'Tackle 10U', label: '10U' },
    { key: 'Tackle 11U', label: '11U' },
    { key: 'Tackle 12U', label: '12U' },
    { key: 'Tackle 13U', label: '13U' },
  ];

  async function fetchCmyfccStandings() {
    const res = await fetch(CMYFCC_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    });
    if (!res.ok) throw new Error(`CMYFCC returned HTTP ${res.status}`);
    const body = await res.json();
    const payload = body.result || body.data || body;
    if (!payload || payload.available === false || !Array.isArray(payload.standings)) {
      throw new Error('CMYFCC response missing standings data');
    }
    const ourRow = payload.standings.find(s =>
      (s.associationName || '').toLowerCase() === CMYFCC_OUR_ASSOCIATION_NAME.toLowerCase() &&
      s.divisionKey === CMYFCC_OUR_DIVISION_KEY);
    if (!ourRow) throw new Error(`Couldn't find "${CMYFCC_OUR_ASSOCIATION_NAME}" · "${CMYFCC_OUR_DIVISION_KEY}" in CMYFCC's standings -- their site may have renamed us or the division.`);
    const divisionRows = payload.standings.filter(s => s.divisionKey === ourRow.divisionKey);
    // CMYFCC's standings rows don't carry PF/PA -- summed straight from
    // every COMPLETED game (result present) in the same division, home and
    // away, rather than leaving pf/pa blank. This is actually MORE than
    // the paste box's own current best case (see parseStandingsText's own
    // comment: the league site's newer copy-paste shape dropped real PF/PA
    // in favor of Win%/Diff only).
    const pfpa = {};
    (payload.games || []).forEach(g => {
      if (g.divisionKey !== ourRow.divisionKey || !g.result || g.result.status !== 'final') return;
      const h = g.homeTeamId, a = g.awayTeamId;
      pfpa[h] = pfpa[h] || { pf: 0, pa: 0 };
      pfpa[a] = pfpa[a] || { pf: 0, pa: 0 };
      pfpa[h].pf += g.result.homeScore; pfpa[h].pa += g.result.awayScore;
      pfpa[a].pf += g.result.awayScore; pfpa[a].pa += g.result.homeScore;
    });
    const teams = divisionRows.map(s => {
      const isUs = s.associationId === ourRow.associationId;
      const totals = pfpa[s.teamId] || { pf: null, pa: null };
      return {
        // Relabeled ONLY for our own row -- isBengalsRow() (below) matches
        // on the word "Bengal" to highlight our row in the table, same as
        // it already would for a coach's own manual paste; CMYFCC's raw
        // name ("Ayer/Shirley/Lunenburg") never contained that word, so
        // this was never actually highlighting before either.
        team: isUs ? `${s.associationName} (Bengals)` : s.associationName,
        division: s.divisionKey,
        wins: s.wins, losses: s.losses, ties: s.ties,
        pf: totals.pf, pa: totals.pa,
        diff: totals.pf != null ? totals.pf - totals.pa : null,
      };
    });
    const rawText = [
      'Team\tRecord\tPF\tPA',
      ...teams.map(t => `${t.team} · ${t.division}\t${t.wins}-${t.losses}${t.ties ? '-' + t.ties : ''}\t${t.pf ?? ''}\t${t.pa ?? ''}`),
    ].join('\n');
    return { teams, rawText, divisionKey: ourRow.divisionKey };
  }

  // Nathan: "CYMFCC site also has a playoff ladder that I want to
  // incorporate." Same real, public, unauthenticated API as
  // fetchCmyfccStandings above -- confirmed live (not guessed) that its
  // response already carries a top-level playoffProjection array, one
  // entry per division, each with a real seeded-bracket shape (seeds,
  // byes, opening round, fixed semifinals, championship) rather than
  // needing to be derived from the standings by hand. CMYFCC's own note
  // field on this data is explicit that it's a live projection, not a
  // locked bracket ("If the season ended today... This does not qualify,
  // seed, or schedule any team") -- carried straight through to the UI
  // rather than presented as final.
  async function fetchCmyfccPlayoffProjection() {
    const res = await fetch(CMYFCC_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    });
    if (!res.ok) throw new Error(`CMYFCC returned HTTP ${res.status}`);
    const body = await res.json();
    const payload = body.result || body.data || body;
    if (!payload || payload.available === false || !Array.isArray(payload.playoffProjection)) {
      throw new Error('CMYFCC response missing playoff projection data');
    }
    const ours = payload.playoffProjection.find(p => p.divisionKey === CMYFCC_OUR_DIVISION_KEY);
    if (!ours) throw new Error(`No playoff projection posted yet for "${CMYFCC_OUR_DIVISION_KEY}".`);
    return ours;
  }

  // Nathan (follow-up): "Can we also utilize the CMYFCC website to also
  // pull in team game history for the other teams?" Same real API as
  // fetchCmyfccStandings above -- its own .games array already has every
  // completed game for every team in the league, home and away, so this
  // needs no separate lookup, just a different filter/reshape of the same
  // payload. Matched by fuzzy token overlap (teamTokens/matchScheduleOpponent's
  // own convention, defined below) rather than an exact string, since a
  // Schedule game's typed opponent name ("North Middlesex") and CMYFCC's
  // own associationName aren't guaranteed to match exactly either. Scoped
  // to CMYFCC_OUR_DIVISION_KEY specifically -- same real reason as
  // fetchCmyfccStandings's own division pin: a town can field a
  // same-named program in several age divisions, and every real opponent
  // on OUR schedule only ever plays us within our own division anyway.
  // Same "not yet happened" date-only logic as js/schedule.js's own
  // hasEventPassed (private to that file's own IIFE, same reason every
  // other small cross-file helper in this app gets its own local copy
  // instead of reaching into another file's closure) -- CMYFCC's
  // logistics block for a game doesn't reliably carry a kickoff time the
  // way our own Schedule records do, so this only ever compares by
  // calendar date (a same-day game stays "not passed" through the end of
  // that day, same fallback behavior hasEventPassed uses when it has no
  // time either).
  function cmyfccEventPassed(dateStr) {
    if (!dateStr) return false;
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return false;
    const d = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
    return d.getTime() < Date.now();
  }
  // Nathan: "when clicking on another team in the standings, don't just
  // show their finished games but use the master schedule to show their
  // upcoming games as well." CMYFCC's getPublicSeasonSchedule payload
  // (CMYFCC_API_URL) IS the division's real master schedule -- every game
  // for every team, played or not -- so this is the one real fetch+match
  // both fetchCmyfccRecentGamesFor (final games only) and
  // fetchCmyfccUpcomingGamesFor (below) now build on, instead of each
  // issuing its own separate network call for the same payload.
  // ourScore/oppScore are left undefined for a game with no final result
  // yet -- compactGameRowHtml (js/schedule.js) already renders that
  // correctly as an "Upcoming" pill with no score, the exact same
  // convention it already uses for our own not-yet-played Schedule games.
  // Reshapes a raw CMYFCC games array into the {id, date, opponent,
  // ourScore, oppScore, isFinal} shape window.compactGameRowHtml (js/
  // schedule.js) already knows how to render -- factored out so
  // fetchAllBengalsTeamsData (below) can reuse the exact same home/away/
  // score resolution for the OTHER divisions' own Bengals team, instead
  // of a second, drift-prone copy of this logic.
  function shapeTeamGames(games, isMatch) {
    return games
      .filter(g => isMatch(g.homeTeam && g.homeTeam.associationName) || isMatch(g.awayTeam && g.awayTeam.associationName))
      .map(g => {
        const isHome = isMatch(g.homeTeam && g.homeTeam.associationName);
        const isFinal = !!(g.result && g.result.status === 'final');
        return {
          id: g.id,
          date: g.logistics ? g.logistics.date : null,
          opponent: isHome ? (g.awayTeam && g.awayTeam.associationName) : (g.homeTeam && g.homeTeam.associationName),
          ourScore: isFinal ? (isHome ? g.result.homeScore : g.result.awayScore) : undefined,
          oppScore: isFinal ? (isHome ? g.result.awayScore : g.result.homeScore) : undefined,
          isFinal,
        };
      });
  }
  async function fetchCmyfccGamesFor(teamName) {
    const res = await fetch(CMYFCC_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    });
    if (!res.ok) throw new Error(`CMYFCC returned HTTP ${res.status}`);
    const body = await res.json();
    const payload = body.result || body.data || body;
    if (!payload || payload.available === false || !Array.isArray(payload.games)) {
      throw new Error('CMYFCC response missing games data');
    }
    const tTokens = teamTokens(teamName);
    if (!tTokens.length) return [];
    const isMatch = (assocName) => {
      const gTokens = teamTokens(assocName);
      return gTokens.length && tTokens.some(t => gTokens.includes(t));
    };
    return shapeTeamGames(payload.games.filter(g => g.divisionKey === CMYFCC_OUR_DIVISION_KEY), isMatch);
  }
  async function fetchCmyfccRecentGamesFor(teamName, limit) {
    limit = limit || 5;
    const all = await fetchCmyfccGamesFor(teamName);
    return all
      .filter(g => g.isFinal)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, limit);
  }
  // The other half of the same master schedule -- games with no final
  // result yet. Soonest-first (not furthest-out-first), matching how a
  // coach actually thinks about "what's next" for a team; also excludes
  // anything whose date has already passed without a posted result (a
  // postponed/cancelled game, or a final score CMYFCC just hasn't entered
  // yet) rather than mislabeling it "Upcoming."
  async function fetchCmyfccUpcomingGamesFor(teamName, limit) {
    limit = limit || 5;
    const all = await fetchCmyfccGamesFor(teamName);
    return all
      .filter(g => !g.isFinal && !cmyfccEventPassed(g.date))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(0, limit);
  }
  // Nathan: "recent games for our opponents are not showing" -- flagged
  // against a Schedule game's own "Recent Form" section, which only ever
  // showed OUR OWN past games (last 5, or head-to-head vs this opponent --
  // see js/schedule.js's renderLast5Panel), never the opponent's OWN
  // season, which is exactly what CMYFCC has real data for and is what a
  // coach actually wants for an opponent they've never played yet.
  // Exposed here (not duplicated) since js/schedule.js loads before this
  // file but only ever CALLS this at real interaction time, by which
  // point the whole app -- this file included -- has already parsed, same
  // convention window.opponentBadgeHtml/window.getOpponentLogoSrc already
  // establish in the other direction.
  window.fetchCmyfccRecentGamesFor = fetchCmyfccRecentGamesFor;
  window.fetchCmyfccUpcomingGamesFor = fetchCmyfccUpcomingGamesFor;
  // The lower-level, un-split fetch -- exposed too (js/thisweek.js's own
  // Opponent Scouting section) so a caller wanting BOTH recent and
  // upcoming can do it in the one real network round-trip
  // loadOpponentRecentForm below already does, instead of the two
  // separate CMYFCC calls going through both wrappers above would cost.
  window.fetchCmyfccGamesFor = fetchCmyfccGamesFor;

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // "1-0" or "1-0-1" (ties) -- youth football box scores don't always carry
  // ties, so the third group is optional.
  function parseRecord(str) {
    const m = String(str || '').trim().match(/^(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) return null;
    return { w: Number(m[1]), l: Number(m[2]), t: m[3] ? Number(m[3]) : 0 };
  }

  // Nathan's paste is tab-separated (straight out of a table); fall back to
  // splitting on 2+ spaces in case whatever copied it collapsed the tabs.
  function splitCols(line) {
    let cols = line.split('\t').map(c => c.trim()).filter(c => c !== '');
    if (cols.length < 4) cols = line.split(/ {2,}/).map(c => c.trim()).filter(c => c !== '');
    return cols;
  }

  // The league site started prepending its own rank number as the first
  // column (Nathan's paste now starts "1  Leominster · Tackle 11U...")
  // where it used to start straight with the team name -- that column is
  // redundant (this file computes its own sort order in sortedTeams()
  // anyway) and would otherwise shift every other column over by one, so
  // strip a lone-integer leading column before reading the real ones.
  function stripLeadingRankCol(cols) {
    return (cols.length > 1 && /^\d+$/.test(cols[0])) ? cols.slice(1) : cols;
  }

  // The league site also started appending a same-cell status badge with
  // no separator onto the division tag for teams with an unresolved
  // tiebreaker -- "Tackle 11UCOIN FLIP PENDING" -- rather than a real part
  // of the division name. Strips any run of unspaced caps text glued
  // directly onto a "<digits>U" grade tag (11U, 10U, ...); a clean
  // division with nothing glued on passes through untouched.
  function cleanDivision(s) {
    return String(s || '').replace(/(\d+U)[A-Z][A-Z ]*$/, '$1').trim();
  }

  function parseStandingsText(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const teams = [];
    const warnings = [];
    lines.forEach((line, i) => {
      // Header row ("Team  Record  PF  PA" or "#  Team  Record  Win%  Diff")
      // -- skip it rather than treat it as a broken data row.
      if (/^team\b/i.test(line) && /record/i.test(line)) return;
      if (/^#?\s*team\b/i.test(line) && /win%|record/i.test(line)) return;
      const cols = stripLeadingRankCol(splitCols(line));
      if (cols.length < 4) {
        warnings.push(`Line ${i + 1}: couldn't read "${line}" -- skipped.`);
        return;
      }
      const [nameRaw, recordRaw, col3Raw, col4Raw] = cols;
      const rec = parseRecord(recordRaw);
      if (!rec) {
        warnings.push(`Line ${i + 1}: couldn't read record "${recordRaw}" for "${nameRaw}" -- skipped.`);
        return;
      }
      // Two shapes the league site has used for the last two columns:
      // PF/PA (both raw point totals) or Win%/Diff (a percentage, then a
      // single point-differential number) -- the presence of a "%" in the
      // 3rd column reliably tells them apart. Diff is kept either way
      // (computed from PF/PA in the old shape, read directly in the new
      // one) since that's what sortedTeams()'s tiebreak and the power
      // ranking below actually need; PF/PA themselves are cosmetic display
      // only and simply aren't available anymore in the new shape.
      let pf = null, pa = null, diff;
      if (/%/.test(col3Raw)) {
        diff = Number(String(col4Raw).replace(/[^0-9.-]/g, ''));
        if (Number.isNaN(diff)) {
          warnings.push(`Line ${i + 1}: couldn't read point differential "${col4Raw}" for "${nameRaw}" -- skipped.`);
          return;
        }
      } else {
        pf = Number(col3Raw);
        pa = Number(col4Raw);
        if (Number.isNaN(pf) || Number.isNaN(pa)) {
          warnings.push(`Line ${i + 1}: couldn't read PF/PA for "${nameRaw}" -- skipped.`);
          return;
        }
        diff = pf - pa;
      }
      // "Ayer/Shirley/Lunenburg · Tackle 11U" -- team name, then a division
      // tag separated by " · ". Keep both, but the tag is cosmetic only.
      const parts = nameRaw.split('·').map(s => s.trim()).filter(Boolean);
      teams.push({
        team: parts[0] || nameRaw,
        division: cleanDivision(parts[1] || ''),
        wins: rec.w, losses: rec.l, ties: rec.t,
        pf: pf, pa: pa, diff: diff,
      });
    });
    return { teams, warnings };
  }

  function teamDiff(t) {
    return t.diff != null ? t.diff : (t.pf != null && t.pa != null ? t.pf - t.pa : 0);
  }
  function winPct(t) {
    const gp = t.wins + t.losses + t.ties;
    return gp ? (t.wins + t.ties * 0.5) / gp : 0;
  }

  // Standard win-pct (ties count half a win/loss each) with point
  // differential as the tiebreaker -- close enough to how any real
  // standings page ranks a one-division league like this. This SAME order
  // is what "power rank" below actually is -- see computePowerRanks().
  function sortedTeams(teams) {
    return teams.slice().sort((a, b) => {
      const pctA = winPct(a), pctB = winPct(b);
      if (pctB !== pctA) return pctB - pctA;
      const diffA = teamDiff(a), diffB = teamDiff(b);
      if (diffB !== diffA) return diffB - diffA;
      return (b.pf || 0) - (a.pf || 0);
    });
  }

  // Nathan: "trending like they do in the NFL showing an arrow up or down
  // for where they moved since the last week." Power rank IS just this
  // same sorted order (win% then point differential) -- the standard
  // blend when a full schedule-strength calculation isn't possible from a
  // pasted aggregate table (no opponent-by-opponent data, just each team's
  // own record/diff). Trend compares this week's rank position for each
  // team against its position in the PREVIOUS saved snapshot (matched by
  // name, same token-overlap matching matchScheduleOpponent uses below,
  // since the league site doesn't always spell a team name identically
  // week to week) -- computed once here at save time and persisted on
  // each team, so the read-only Standings tab never has to re-derive it or
  // keep its own history log.
  function computePowerRanks(teams, previousTeams) {
    const ordered = sortedTeams(teams);
    const prevOrdered = previousTeams && previousTeams.length ? sortedTeams(previousTeams) : null;
    return ordered.map((t, i) => {
      const powerRank = i + 1;
      let trend = null;
      if (prevOrdered) {
        const tTokens = teamTokens(t.team);
        const prevIdx = prevOrdered.findIndex(p => teamTokens(p.team).some(tok => tTokens.includes(tok)));
        if (prevIdx !== -1) trend = (prevIdx + 1) - powerRank; // positive = moved up
      }
      return Object.assign({}, t, { powerRank, trend });
    });
  }

  function recordStr(t) {
    return t.wins + '-' + t.losses + (t.ties ? '-' + t.ties : '');
  }

  // The /bengal/i check alone only catches OUR row after a "Sync from
  // CMYFCC" save, which relabels it "<real name> (Bengals)" (see
  // fetchCmyfccStandings above). A coach using the still-fully-supported
  // manual paste box instead gets our row exactly as the league site
  // names it -- e.g. "Ayer/Shirley/Lunenburg", no "bengal" substring at
  // all -- which isBengalsRow would then wrongly say is NOT us, making
  // our own row a clickable "opponent" link into a self-referential team
  // page. Same fuzzy token-overlap match teamTokens/matchScheduleOpponent
  // already use elsewhere in this file for exactly this "names aren't
  // guaranteed to match exactly" reason, rather than a brittle exact
  // string compare.
  // teamTokens/IGNORED_TEAM_WORDS aren't declared until further down this
  // file (both hoist as far as JS scoping goes, but IGNORED_TEAM_WORDS is
  // a `const` -- calling teamTokens() up here at module-parse time would
  // hit its temporal dead zone). Computed lazily inside the function
  // instead, which also means it's always computed against the real,
  // current CMYFCC_OUR_ASSOCIATION_NAME rather than a value snapshotted
  // once at load time.
  // js/schedule.js's isBengalsTeamName is the same check (built later,
  // reusing this function's own logic, for compactGameRowHtml's own
  // right-column badge -- see its comment) -- delegate to it so the two
  // never drift, falling back to the original inline logic only if
  // schedule.js somehow hasn't loaded yet.
  function isBengalsRow(t) {
    const name = t.team || '';
    if (window.isBengalsTeamName) return window.isBengalsTeamName(name);
    if (/bengal/i.test(name)) return true;
    const tTokens = teamTokens(name);
    if (!tTokens.length) return false;
    const ourTokens = teamTokens(CMYFCC_OUR_ASSOCIATION_NAME);
    return ourTokens.some(tok => tTokens.includes(tok));
  }

  // ---- Opponent Page (Nathan: "I want to develop a opponent page where
  // you click on their logo or their name in the standings and you see
  // game footage from them, notes, key players and things like that.")
  // Scoped to teams actually on our own Schedule -- everyone else in the
  // league has nothing real to show (no film link, no scouting notes,
  // since we've never played them), so they stay plain text. Reuses
  // whatever's already on that Schedule game (opponentFilmUrl/Note,
  // scouting) rather than a separate data store to keep in sync.
  //
  // League standings names ("Ayer/Shirley/Lunenburg") and our own
  // schedule's opponent field (whatever a coach actually typed there,
  // e.g. "Ayer Shirley") aren't guaranteed to match exactly, so this
  // compares normalized word tokens instead of the raw strings -- a
  // shared distinctive word (ignoring division/league boilerplate like
  // "Tackle"/"11U"/"Regional"/"Youth Football") counts as a match.
  const IGNORED_TEAM_WORDS = new Set(['tackle', '11u', 'regional', 'youth', 'football', 'high', 'school', 'the', 'jr', 'sr']);
  function teamTokens(s) {
    return String(s || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t.length > 2 && !IGNORED_TEAM_WORDS.has(t));
  }
  function matchScheduleOpponent(teamName, games) {
    const tTokens = teamTokens(teamName);
    if (!tTokens.length) return null;
    return (games || []).find(g => {
      const gTokens = teamTokens(g.opponent);
      return gTokens.length && tTokens.some(t => gTokens.includes(t));
    }) || null;
  }

  // Nathan (follow-up): "Teams on your schedule should also have their
  // record shown under their name like ours. They are on the standings to
  // reference." Same token-overlap matching as matchScheduleOpponent just
  // above, entered from the other direction -- given an opponent's name as
  // typed on a Schedule game, find its standings row -- so js/schedule.js's
  // game cards can show it without needing to know anything about how
  // standings are parsed/stored. One self-contained async function (loads +
  // caches standings internally via loadStandings) rather than exposing the
  // teams array/token helpers separately, same shape as
  // window.fetchTwoMinDrillRawHistory etc. elsewhere in the app. Returns
  // null (not an empty string) when there's no standings data yet or no
  // matching row, so a caller can tell "nothing to show" apart from a
  // genuine 0-0 record.
  window.getOpponentRecordText = async function (opponentName) {
    if (!opponentName) return null;
    const data = await loadStandings();
    if (!data || !Array.isArray(data.teams) || !data.teams.length) return null;
    const oTokens = teamTokens(opponentName);
    if (!oTokens.length) return null;
    const row = data.teams.find(t => {
      const tTokens = teamTokens(t.team);
      return tTokens.length && oTokens.some(tok => tTokens.includes(tok));
    });
    return row ? recordStr(row) : null;
  };

  async function loadStandings(force) {
    if (loaded && !force) return standingsData;
    try {
      // Nathan: "if I add standings, save, it shows. But once I leave the
      // app, it doesn't store the standings and they are gone when I
      // reenter." Root cause: this read was a plain unauthenticated fetch,
      // but the Firebase rules on this project require an auth token on
      // every read/write (see schedule.js's loadGames -- it wraps its GET
      // in firebaseAuthed() too, not just its saves). An unauthenticated
      // GET here was silently getting rejected, so standingsData came back
      // null on every fresh page load -- the paste box only ever looked
      // like it worked because it re-rendered from the in-memory `teams`
      // array right after a successful save, not from an actual re-read.
      const url = await window.firebaseAuthed(STANDINGS_URL);
      const res = await fetch(url);
      standingsData = res.ok ? await res.json() : null;
    } catch (e) {
      standingsData = null;
    }
    loaded = true;
    return standingsData;
  }

  async function saveStandings(teams, rawText, statusEl) {
    // Power rank + trend computed against whatever was the PREVIOUS save
    // (not re-fetched -- standingsData/loaded already holds it from
    // whatever loaded this Coach Tools screen) before it gets overwritten
    // below, so the read-only tab can just read t.powerRank/t.trend
    // straight off each saved team.
    const previousTeams = loaded && standingsData && Array.isArray(standingsData.teams) ? standingsData.teams : null;
    const rankedTeams = computePowerRanks(teams, previousTeams);
    const payload = { updatedAt: new Date().toISOString(), rawText: rawText || '', teams: rankedTeams };
    if (statusEl) statusEl.textContent = 'Saving…';
    try {
      const url = await window.firebaseAuthed(STANDINGS_URL);
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      standingsData = payload;
      loaded = true;
      return { ok: true };
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Save failed: ' + e.message;
      return { ok: false };
    }
  }

  // Nathan: "Show the power rank number next to them and whether they went
  // up or down since the last week." trend/powerRank are computed once at
  // save time (see saveStandings/computePowerRanks) and persisted on each
  // team -- this just renders whatever's there. Falls back to the live
  // sort position (no trend arrow) for the Coach Tools paste box's own
  // preview, which renders straight from the just-parsed teams before
  // Save has run computePowerRanks on them yet.
  function powerRankCellHtml(t, fallbackRank) {
    const rank = t.powerRank != null ? t.powerRank : fallbackRank;
    if (t.trend == null) return `${rank}`;
    if (t.trend === 0) return `${rank} <span class="standingsTrend standingsTrendSame">–</span>`;
    const up = t.trend > 0;
    return `${rank} <span class="standingsTrend ${up ? 'standingsTrendUp' : 'standingsTrendDown'}">${up ? '▲' : '▼'}${Math.abs(t.trend)}</span>`;
  }

  function renderTable(container, data, games) {
    if (!container) return;
    if (!data || !Array.isArray(data.teams) || !data.teams.length) {
      container.innerHTML = '<div class="lbEmpty">No standings posted yet.</div>';
      return;
    }
    const ordered = sortedTeams(data.teams);
    const updated = data.updatedAt
      ? new Date(data.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';
    let html = '';
    if (updated) html += `<div class="lbSub" style="text-align:center;margin-bottom:10px;">Last updated ${escapeHtml(updated)}</div>`;
    html += '<div class="standingsTableWrap"><table class="standingsTable"><thead><tr>' +
      '<th>Power</th><th>Team</th><th>Record</th><th>Win%</th><th>Diff</th></tr></thead><tbody>';
    ordered.forEach((t, i) => {
      const diff = teamDiff(t);
      const diffStr = (diff > 0 ? '+' : '') + diff;
      const pctStr = (winPct(t) * 100).toFixed(1) + '%';
      // Nathan: "Now that we have stats for all games played, we should be
      // able to have team pages for all teams now" -- every real division
      // team gets a clickable team page (real logo, record, CMYFCC recent
      // form), not just the ones on our own Schedule. A team we've
      // actually played ALSO gets film/scouting/a "View on Schedule" link,
      // via its matched Schedule game -- showOpponentPage/opponentPageHtml
      // already render correctly either way. Our own row used to stay
      // plain text ("there's no opponent page for ourselves") -- found
      // live that Playoff Probabilities' own logo-click already reaches
      // that same page for us (and, once its real bug was fixed just
      // above -- BENGALS_HERO_HUE -- renders a real, correct, useful
      // page: our own record plus CMYFCC's real recent/upcoming games).
      // Nathan: "our own team, I can't click on in the standings" --
      // since the page already works correctly when reached the other
      // way, the real fix is making it reachable here too, not leaving
      // this the one dead end into an otherwise-working feature.
      const matchedGame = games ? matchScheduleOpponent(t.team, games) : null;
      const isUs = isBengalsRow(t);
      // Coach Tools' own paste-preview (initCoachToolsStandings) calls
      // this with NO games arg at all -- it has no #standingsOpponentDetail/
      // #standingsListPanel of its own for showOpponentPage to write into
      // (those live in the separate, public #standingsMode panel), so a
      // team-name link there would silently write into a hidden panel the
      // coach can't see. `games` being genuinely absent (not just an
      // empty array -- the real read-only tab always passes one, even
      // empty) is exactly that call site; keep it plain text there.
      const hasGamesContext = games !== undefined && games !== null;
      // Nathan: "we need to incorporate the team logos into the
      // standings." This was the one team-rendering function in the file
      // with no logo at all -- Playoff Picture/Probabilities/the team
      // page/"All Bengals Teams" already call window.teamBadgeHtmlFor
      // (js/schedule.js), which already does the right thing either way
      // (our own real logo for a Bengals row via isBengalsTeamName, an
      // uploaded/bundled opponent logo or a deterministic colored-initials
      // fallback otherwise) -- reused here rather than a second copy.
      // Folded INTO the existing clickable button (not a separate badge
      // next to it) so tapping the logo opens the team page too, same as
      // tapping the name already does -- no dead tap target next to a
      // live one.
      const badgeHtml = window.teamBadgeHtmlFor ? window.teamBadgeHtmlFor(t.team) : '';
      const nameCell = !hasGamesContext
        ? `<span class="standingsTeamCell">${badgeHtml}<span>${escapeHtml(t.team)}</span></span>`
        : `<button type="button" class="standingsTeamLink standingsTeamCell" data-open-team="${escapeHtml(t.team)}" data-open-opponent="${matchedGame ? escapeHtml(matchedGame.id) : ''}">${badgeHtml}<span>${escapeHtml(t.team)} ›</span></button>`;
      html += `<tr class="${isUs ? 'standingsRowUs' : ''}">` +
        `<td class="standingsPowerCell">${powerRankCellHtml(t, i + 1)}</td>` +
        `<td>${nameCell}${t.division ? `<span class="standingsDivTag">${escapeHtml(t.division)}</span>` : ''}</td>` +
        `<td>${escapeHtml(recordStr(t))}</td>` +
        `<td>${pctStr}</td><td>${diffStr}</td></tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
    container.querySelectorAll('[data-open-team]').forEach(btn => {
      btn.addEventListener('click', () => showOpponentPage(btn.dataset.openOpponent || null, btn.dataset.openTeam, data.teams, games || []));
    });
  }

  // Nathan: "The team logo can be used in place of the football in the
  // team page header. Instead of the Orange header background for team
  // pages, it should match the team logo color." hashHue is the exact
  // same hash/mod computation js/schedule.js's own hashColor uses for its
  // no-logo initials-badge fallback (duplicated locally, same convention
  // as every other small cross-file helper in this app) -- using it here
  // too means a team's header gradient and its initials-badge color (when
  // it has no real logo) always agree. It's also what opponentPageHtml
  // uses to color the header SYNCHRONOUSLY (name-hash, instant, no
  // network/image dependency) so the page never flashes orange while a
  // real logo's own dominant color is still being sampled -- see
  // applyOpponentHeroColor below, which upgrades to the logo's real hue
  // once that resolves.
  function hashHue(str) {
    let hash = 0;
    for (let i = 0; i < (str || '').length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(hash) % 360;
  }
  function heroGradient(hue) {
    return `linear-gradient(160deg, hsl(${hue}, 60%, 42%) 0%, hsl(${hue}, 66%, 24%) 100%)`;
  }
  // The real Bengals orange (--bengal-orange, #ff6a13) expressed as a hue
  // for heroGradient -- fixed, not computed, so our own team's page always
  // gets this exact color through the SAME gradient formula every other
  // team's hero already uses, just with a known-correct hue instead of a
  // hash or a sampled logo color.
  const BENGALS_HERO_HUE = 22;
  function rgbToHue(r, g, b) {
    const rf = r / 255, gf = g / 255, bf = b / 255;
    const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
    const d = max - min;
    if (d === 0) return 0;
    let h;
    if (max === rf) h = ((gf - bf) / d) % 6;
    else if (max === gf) h = (bf - rf) / d + 2;
    else h = (rf - gf) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    return Math.round(h);
  }
  // Samples a small offscreen render of the team's real logo and picks
  // its most common non-white/non-black/non-gray color, converted down
  // to just a hue -- everything else in this app's color system
  // (hashColor/hashHue) only ever varies by hue at a fixed saturation/
  // lightness, so a logo's real brand hue slots into that same,
  // already-readable-for-white-text scheme rather than using the logo's
  // own (often much lighter or unevenly-saturated) raw color directly.
  // Bundled logos are same-origin static assets and Firebase-uploaded
  // ones are already data: URLs, so neither taints the canvas.
  function extractDominantHue(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const size = 48;
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          const buckets = {};
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 128) continue; // transparent -- not part of the logo art
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const lightness = (max + min) / 2 / 255;
            const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
            // Skip near-white/near-black outline & background pixels and
            // near-gray ones -- without this, white logo backgrounds
            // dominate the count and every team ends up beige.
            if (lightness > 0.9 || lightness < 0.08 || sat < 0.18) continue;
            const qr = Math.round(r / 24) * 24, qg = Math.round(g / 24) * 24, qb = Math.round(b / 24) * 24;
            const key = qr + ',' + qg + ',' + qb;
            if (!buckets[key]) buckets[key] = { count: 0, r: qr, g: qg, b: qb };
            buckets[key].count++;
          }
          let best = null;
          Object.keys(buckets).forEach(k => { if (!best || buckets[k].count > best.count) best = buckets[k]; });
          resolve(best ? rgbToHue(best.r, best.g, best.b) : null);
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  // Upgrades the header from its instant name-hash color to the real
  // logo's own dominant color, once a real logo exists and a confident
  // dominant hue can be sampled from it -- silently keeps the name-hash
  // color otherwise (no real logo on file yet, or a logo that's too
  // white/black/gray to yield one). data-opponent guards against a coach
  // tapping into a DIFFERENT opponent before this async work resolves.
  async function applyOpponentHeroColor(opponentName) {
    if (!window.getOpponentLogoSrc) return;
    const src = window.getOpponentLogoSrc(opponentName);
    if (!src) return;
    const hue = await extractDominantHue(src);
    if (hue == null) return;
    const hero = document.getElementById('standingsOpponentHero');
    if (!hero || hero.dataset.opponent !== opponentName) return;
    hero.style.background = heroGradient(hue);
  }

  // Builds the combined film section's inner markup from a plain list of
  // {label, url, note?} clips -- the single legacy game.opponentFilmUrl
  // (if any) plus every js/opponent-film.js clip for this team, already
  // merged by the caller. Returns '' (section renders empty/absent) when
  // there's nothing at all -- most team pages won't have scouting film,
  // and an empty box on every one of those would just be clutter.
  function opponentFilmSectionHtml(clips) {
    if (!clips || !clips.length) return '';
    const items = clips.map((c) => {
      const btn = window.filmButtonHtml
        ? window.filmButtonHtml(c.url, escapeHtml(c.label), { btnClass: 'navBtn', btnStyle: 'display:block;width:100%;text-align:center;box-sizing:border-box;margin-bottom:4px;' })
        : `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener" class="navBtn" style="display:block;width:100%;text-align:center;box-sizing:border-box;margin-bottom:4px;">${escapeHtml(c.label)}</a>`;
      return `${btn}${c.note ? `<div class="lbSub" style="text-align:center;margin:0 0 10px;">${escapeHtml(c.note)}</div>` : ''}`;
    }).join('');
    return `<div class="lbSectionHeader">🎥 Opponent Film</div>${items}<div style="margin-bottom:10px;"></div>`;
  }

  function opponentPageHtml(game, teamRow) {
    const diffStr = teamRow ? ((teamDiff(teamRow) > 0 ? '+' : '') + teamDiff(teamRow)) : '';
    const hasFootage = !!game.opponentFilmUrl;
    // A real Schedule record exists for this team (we've actually played
    // or are scheduled to play them) vs. a division-only team pulled
    // straight from Standings with no Schedule game to pull film/
    // scouting/a schedule-link from -- see showOpponentPage, which builds
    // a plain {opponent: teamName} stand-in for that second case.
    const hasGame = !!game.id;
    // Found live: viewing OUR OWN team's page (reachable via Playoff
    // Probabilities' own logo-click, the first real entry point into this
    // function for "us" -- the main list's row has always stayed plain
    // text specifically because "there's no opponent page for ourselves"
    // predates that) showed an arbitrary blue/purple hero instead of our
    // real Bengals orange. Two compounding reasons, both real: hashHue is
    // a generic per-OPPONENT color so each one reads as visually distinct
    // -- meaningless applied to our own name, which hashes to whatever
    // color it happens to. And applyOpponentHeroColor's own real-logo-hue
    // upgrade (below) never fires for us at all, because
    // getOpponentLogoSrc has no entry for our own team (bengalsBadgeHtml
    // is a separate, dedicated lookup) -- so the arbitrary color was
    // permanent, not just a brief flash before the real one loaded. We
    // already know our own exact brand color -- nothing to hash or
    // sample -- so BENGALS_HERO_HUE (the real #ff6a13 orange, converted)
    // is used directly instead of either mechanism.
    const isUsPage = window.isBengalsTeamName && window.isBengalsTeamName(game.opponent);
    const hue = isUsPage ? BENGALS_HERO_HUE : hashHue(game.opponent);
    const badgeHtml = window.teamBadgeHtmlFor ? window.teamBadgeHtmlFor(game.opponent) : (window.opponentBadgeHtml ? window.opponentBadgeHtml(game.opponent) : '');
    let html = `<div class="lbHeroHeader" id="standingsOpponentHero" data-opponent="${escapeHtml(game.opponent || '')}" style="background:${heroGradient(hue)};">
        <div class="lbHeroTeamBadgeWrap">${badgeHtml}</div>
        <h3>${escapeHtml(game.opponent || 'Opponent')}</h3>
        ${teamRow ? `<div class="lbSub">${escapeHtml(recordStr(teamRow))} &middot; Diff ${escapeHtml(diffStr)}${teamRow.powerRank != null ? ` &middot; Power Rank #${teamRow.powerRank}` : ''}</div>` : ''}
      </div>`;
    // Nathan: "Right at the top below the header and before previous game
    // results, I want to have CTAs to footage where teams can play it
    // back." Moved up from below Recent Games (where the single legacy
    // opponentFilmUrl link used to render) to right here -- shows the
    // legacy link immediately (synchronous, no fetch needed), then
    // showOpponentPage's own loadOpponentFilmSection() rebuilds this same
    // div with the legacy link PLUS every js/opponent-film.js clip for
    // this team once that fetch resolves.
    const legacyClips = hasFootage ? [{ label: `🎥 Watch Game Film of ${game.opponent || 'this Opponent'}`, url: game.opponentFilmUrl, note: game.opponentFilmNote }] : [];
    html += `<div id="standingsOpponentFilm">${opponentFilmSectionHtml(legacyClips)}</div>`;
    // Nathan: "utilize the CMYFCC website to also pull in team game
    // history for the other teams" -- filled in asynchronously by
    // showOpponentPage right below (real network call, shouldn't block
    // this page's own first render), same progressive-render pattern
    // js/schedule.js's own Game Recap narrative already uses.
    html += `<div id="standingsOpponentRecentForm"><div class="lbSectionHeader">📊 Recent Games</div><div class="hint" style="text-align:center;">Loading from CMYFCC…</div></div>`;
    if (game.scouting) {
      html += `<div class="lbSectionHeader">🔎 Scouting Report</div>
        <div class="thisweekKeysBox" style="white-space:pre-wrap;font-size:14px;line-height:1.5;">${escapeHtml(game.scouting)}</div>`;
    }
    if (!hasFootage && !game.scouting) {
      // Opponent-film.js clips may still turn this from "nothing" into
      // "something" once the async fetch above resolves -- this synchronous
      // empty note is about SCOUTING specifically now (not footage, which
      // has its own section with its own independent empty/non-empty
      // state), so there's no contradiction once film shows up a moment
      // later.
      html += hasGame
        ? '<div class="lbEmpty">No scouting notes added for this opponent yet -- a coach can add them from this game\'s Schedule page.</div>'
        : `<div class="lbEmpty">We haven't played ${escapeHtml(game.opponent || 'this team')} yet this season.</div>`;
    }
    if (hasGame) {
      html += `<div style="text-align:center;margin-top:16px;">
          <button type="button" class="lbLinkBtn" id="standingsOpponentScheduleLink">View this game on Schedule ›</button>
        </div>`;
    }
    return html;
  }

  // Rebuilds #standingsOpponentFilm with the legacy single link (if any)
  // PLUS every js/opponent-film.js clip for this team, once that fetch
  // resolves. Matches loadOpponentRecentForm's own async-fill shape right
  // below. A no-op if OpponentFilm isn't loaded for some reason (script
  // load failure) -- the legacy link, already rendered synchronously by
  // opponentPageHtml above, stays exactly as it is.
  function loadOpponentFilmSection(game) {
    const wrap = document.getElementById('standingsOpponentFilm');
    if (!wrap || !window.OpponentFilm) return;
    window.OpponentFilm.load().then((entries) => {
      if (!wrap.isConnected) return;
      const stored = window.OpponentFilm.clipsForTeam(entries, game.opponent).map((c) => ({
        label: c.title || `🎥 Watch${game.opponent ? ' ' + game.opponent : ''} Film`,
        url: c.url,
      }));
      const legacyClips = game.opponentFilmUrl ? [{ label: `🎥 Watch Game Film of ${game.opponent || 'this Opponent'}`, url: game.opponentFilmUrl, note: game.opponentFilmNote }] : [];
      wrap.innerHTML = opponentFilmSectionHtml(legacyClips.concat(stored));
    }).catch(() => {});
  }

  function showOpponentPage(gameId, teamName, teams, games) {
    const listPanel = document.getElementById('standingsListPanel');
    const detailPanel = document.getElementById('standingsOpponentDetail');
    const body = document.getElementById('standingsOpponentBody');
    if (!listPanel || !detailPanel || !body) return;
    const realGame = gameId ? (games || []).find(g => g.id === gameId) : null;
    // A team on our own Schedule gets its real game record (film link,
    // scouting notes, "View this game on Schedule"); a division-only team
    // we haven't played still gets a real page -- just without those
    // sections, since there's no Schedule record to pull them from.
    // opponentPageHtml's own hasGame check (and the empty-state text
    // above) already render either case correctly.
    const game = realGame || { opponent: teamName };
    if (!game.opponent) return;
    const teamRow = (teams || []).find(t => matchScheduleOpponent(t.team, [game]))
      || (teams || []).find(t => t.team === teamName) || null;
    body.innerHTML = opponentPageHtml(game, teamRow);
    listPanel.style.display = 'none';
    detailPanel.style.display = '';
    // Real back-button support (js/nav-history.js) -- always reachable
    // from the list (see this function's own comment, above), so going
    // back always means showStandingsList(), the same place its own
    // "‹ All Standings" button already goes.
    if (window.NavHistory) window.NavHistory.push('standings:opponent', () => showStandingsList({ fromHistory: true }));
    const scheduleLink = document.getElementById('standingsOpponentScheduleLink');
    if (scheduleLink) scheduleLink.addEventListener('click', () => { if (window.openScheduleGame) window.openScheduleGame(game.id); });
    loadOpponentRecentForm(game.opponent, teams, games);
    loadOpponentFilmSection(game);
    // Skipped for our own team -- opponentPageHtml already set the real,
    // fixed Bengals color synchronously (BENGALS_HERO_HUE); this upgrade
    // exists to find an UNKNOWN opponent's real logo hue, which doesn't
    // apply to us and would be a guaranteed no-op anyway (no entry for
    // our own team in getOpponentLogoSrc) -- skipped outright rather than
    // relying on that no-op, so a future change there can't silently
    // override our own fixed color.
    if (!(window.isBengalsTeamName && window.isBengalsTeamName(game.opponent))) {
      applyOpponentHeroColor(game.opponent);
    }
  }

  async function loadOpponentRecentForm(opponentName, teams, games) {
    const wrap = document.getElementById('standingsOpponentRecentForm');
    if (!wrap) return;
    if (!window.compactGameRowHtml || !window.opponentBadgeHtml) {
      wrap.innerHTML = '';
      return;
    }
    // Nathan: "if you are on a team page from the standings, and you see
    // the 'recent form' let's change that to 'recent games' as form is
    // more of a soccer term." Plain rename, same section, same data.
    //
    // Nathan (follow-up): "don't just show their finished games but use
    // the master schedule to show their upcoming games as well." One
    // shared fetchCmyfccGamesFor call (the real master schedule payload)
    // instead of two separate network round-trips for what's really one
    // dataset split two ways -- Recent Games stays exactly as it was,
    // Upcoming Games is new, appended below it.
    try {
      const all = await fetchCmyfccGamesFor(opponentName);
      // A stale response landing after the coach has already navigated
      // to a DIFFERENT opponent (or back to the list) shouldn't clobber
      // whatever's on screen now -- re-check the container's still
      // showing a loading state for the SAME opponent before writing.
      const stillOnThisOpponent = document.getElementById('standingsOpponentRecentForm') === wrap && wrap.isConnected;
      if (!stillOnThisOpponent) return;
      const recent = all
        .filter(g => g.isFinal)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 5);
      const upcoming = all
        .filter(g => !g.isFinal && !cmyfccEventPassed(g.date))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .slice(0, 5);
      const badgeHtml = window.teamBadgeHtmlFor ? window.teamBadgeHtmlFor(opponentName) : window.opponentBadgeHtml(opponentName);
      const rowsHtmlFor = (rows) => rows.map(g => window.compactGameRowHtml(g, {
        teamName: opponentName,
        teamBadgeHtml: badgeHtml,
      })).join('');
      const recentHtml = recent.length
        ? `<div class="lbSectionHeader">📊 Recent Games</div><div class="last5List">${rowsHtmlFor(recent)}</div>`
        : `<div class="lbSectionHeader">📊 Recent Games</div><div class="lbEmpty">No completed games found for ${escapeHtml(opponentName || 'this team')} on CMYFCC yet.</div>`;
      // Omitted entirely (not an empty-state line) when there genuinely
      // are none left -- a team with no games remaining this season
      // doesn't need a section telling you so.
      const upcomingHtml = upcoming.length
        ? `<div class="lbSectionHeader" style="margin-top:16px;">📅 Upcoming Games</div><div class="last5List">${rowsHtmlFor(upcoming)}</div>`
        : '';
      wrap.innerHTML = recentHtml + upcomingHtml;
      // Nathan: "if you click on a logo of one of the opponent's it should
      // go to that teams page." Each row's own away-side badge (this
      // team's opponent in THAT game) is wrapped by compactGameRowHtml in
      // a .last5RowOpponentLogo span specifically so it can be made
      // clickable independently of the row itself (which already opens
      // that specific game). stopPropagation so tapping the logo doesn't
      // also fire the row's own click. gameId is left null -- these rows
      // come from CMYFCC, not our own Schedule, so there's usually no
      // matching local game record; showOpponentPage already falls back
      // to a real, name-only team page in exactly that case (same as a
      // division-only team we've never played). Wired once over the whole
      // wrap, so it covers both the Recent and Upcoming sections' rows.
      wrap.querySelectorAll('.last5RowOpponentLogo').forEach((el) => {
        const name = el.dataset.opponentName;
        if (!name) return;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          showOpponentPage(null, name, teams, games);
        });
      });
    } catch (e) {
      wrap.innerHTML = `<div class="lbSectionHeader">📊 Recent Games</div><div class="lbEmpty">Couldn't load from CMYFCC: ${escapeHtml(e.message)}</div>`;
    }
  }

  // ---- Playoff Picture (Nathan: "CYMFCC site also has a playoff ladder
  // that I want to incorporate.") A round-by-round list rather than a
  // graphical bracket tree -- matches this app's own established card
  // language everywhere else (Schedule, Recent Games) instead of
  // introducing a wide, hard-to-read-on-a-phone diagram, and every real
  // element (byes, opening round, fixed semifinals, championship) already
  // has a natural "round" to sit under. Both divisions render -- a coach
  // reasonably wants to see the other bracket too, not just ours -- with
  // OUR OWN row highlighted wherever it appears (playoffSeedUs), reusing
  // isBengalsRow's own fuzzy-match logic against a synthetic {team:
  // teamLabel} object since that's all it ever reads.
  function playoffTeamShortName(teamLabel) {
    return (teamLabel || '').split(' · ')[0].trim();
  }
  function playoffSeedChipHtml(seed) {
    if (!seed) return '';
    const name = playoffTeamShortName(seed.teamLabel);
    const isUs = isBengalsRow({ team: seed.teamLabel });
    // Nathan: "Use the Bengals logo for the Ayer/Shirley/Lunenburg team
    // logo." Now goes through the same shared teamBadgeHtmlFor every
    // other badge site in the app uses (js/schedule.js) instead of its
    // own separate isUs branch + hardcoded markup -- this was the
    // original, first-found instance of this bug class; consolidated
    // once the other 3 sites needed the identical fix, so there's one
    // real place left to ever update the logo markup.
    // teamBadgeHtmlFor's own Bengals check tolerates the full label (extra
    // tokens like "Tackle"/"11U" don't cause a false match either way),
    // but the non-Bengals logo lookup needs the SHORT name -- same value
    // the original, pre-consolidation code here already passed -- since
    // opponentLogos/BUNDLED_LOGOS are keyed off a team's first word, not
    // the full "Team · Division" label.
    const badge = window.isBengalsTeamName && window.isBengalsTeamName(seed.teamLabel)
      ? (window.bengalsBadgeHtml ? window.bengalsBadgeHtml() : '')
      : (window.opponentBadgeHtml ? window.opponentBadgeHtml(name) : '');
    return `<span class="playoffSeedChip${isUs ? ' playoffSeedUs' : ''}">
        <span class="playoffSeedNum">#${escapeHtml(String(seed.seed))}</span>
        ${badge}
        <span class="scheduleTeamName">${escapeHtml(name)}</span>
        <span class="scheduleTeamRecord">${escapeHtml(seed.record || '')}</span>
      </span>`;
  }
  function playoffTbdChipHtml(text) {
    return `<span class="playoffTbdChip">${escapeHtml(text)}</span>`;
  }
  function playoffMatchupRowHtml(leftHtml, rightHtml) {
    return `<div class="playoffMatchupRow">
        <div class="playoffMatchupSide">${leftHtml}</div>
        <div class="playoffMatchupVs">vs</div>
        <div class="playoffMatchupSide">${rightHtml}</div>
      </div>`;
  }
  function playoffWinnerOfHtml(bracket, seedNums) {
    const label = (seedNums || []).map(n => {
      const s = bracket.seeds.find(x => x.seed === n);
      return s ? `#${n} ${playoffTeamShortName(s.teamLabel)}` : `#${n}`;
    }).join(' / ');
    return playoffTbdChipHtml(`Winner: ${label}`);
  }
  function playoffBracketHtml(bracket) {
    const seedByNum = (n) => bracket.seeds.find(s => s.seed === n);
    const byeRows = (bracket.byes || [])
      .map(n => playoffMatchupRowHtml(playoffSeedChipHtml(seedByNum(n)), playoffTbdChipHtml('BYE')))
      .join('');
    const openingRows = (bracket.openingRound || [])
      .map(m => playoffMatchupRowHtml(playoffSeedChipHtml(seedByNum(m.homeSeed)), playoffSeedChipHtml(seedByNum(m.awaySeed))))
      .join('');
    const semiRows = (bracket.semifinals || [])
      .map(sf => playoffMatchupRowHtml(playoffSeedChipHtml(seedByNum(sf.fixedSeed)), playoffWinnerOfHtml(bracket, sf.winnerOf)))
      .join('');
    const champHtml = bracket.championship
      ? playoffMatchupRowHtml(playoffTbdChipHtml('Winner: Semifinal 1'), playoffTbdChipHtml('Winner: Semifinal 2'))
      : '';
    return `
      <div class="playoffBracketCard">
        <div class="lbSectionHeader">${escapeHtml(bracket.label || ('Division ' + bracket.division))}</div>
        ${byeRows ? `<div class="playoffRoundLabel">First-Round Bye</div>${byeRows}` : ''}
        ${openingRows ? `<div class="playoffRoundLabel">Opening Round</div>${openingRows}` : ''}
        ${semiRows ? `<div class="playoffRoundLabel">Semifinals</div>${semiRows}` : ''}
        ${champHtml ? `<div class="playoffRoundLabel">Championship</div>${champHtml}` : ''}
      </div>`;
  }
  async function loadPlayoffPicture() {
    const wrap = document.getElementById('standingsPlayoffBody');
    if (!wrap) return;
    wrap.innerHTML = '<div class="hint" style="text-align:center;">Loading from CMYFCC…</div>';
    try {
      const projection = await fetchCmyfccPlayoffProjection();
      const brackets = Array.isArray(projection.brackets) ? projection.brackets : [];
      if (!brackets.length) {
        wrap.innerHTML = '<div class="lbEmpty">No playoff projection posted yet.</div>';
        return;
      }
      wrap.innerHTML =
        (projection.note ? `<div class="lbSub" style="text-align:center;margin-bottom:14px;">${escapeHtml(projection.note)}</div>` : '') +
        brackets.map(playoffBracketHtml).join('');
    } catch (e) {
      wrap.innerHTML = `<div class="lbEmpty">Couldn't load the playoff picture from CMYFCC: ${escapeHtml(e.message)}</div>`;
    }
  }

  // ---- Playoff Probabilities (Nathan: "add in playoff probabilities for
  // teams based on the current results available... shown in standings
  // under a second tab.") CMYFCC's own playoffProjection (above) is a
  // single deterministic "if the season ended today" bracket -- real,
  // but not a probability. Confirmed live (not guessed) exactly how that
  // bracket gets populated before building this: cross-checked both
  // divisions' own seed lists against the flat, rank-ordered standings
  // list for Tackle 11U (21 teams total) -- Division 1's 6 seeds are
  // EXACTLY overall ranks 1-6, Division 2's are EXACTLY ranks 7-12, in
  // order, both times. So "making the playoffs" here means "finishing in
  // the top 12 of Tackle 11U by season end" -- genuinely uncertain for
  // teams on the bubble (9 teams currently sit outside that line), which
  // is what this Monte Carlo simulation actually estimates.
  //
  // Real, disclosed simplifications (shown in the UI itself, not just
  // here) rather than a false precision this app can't actually back up:
  // CMYFCC's real standingsPoints formula includes an opponentWinPoints
  // bonus (schema confirmed via standingsPolicy, exact semantics not
  // documented anywhere reachable) -- this simulation ranks each
  // simulated season by the base win/tie/loss points alone (10/5/0),
  // which is the dominant factor in a real standings table regardless.
  // Each remaining game's own winner is drawn using a simple log5-style
  // estimate from each team's CURRENT winning percentage (clamped to
  // 15%-85% so a single early loss/win can't make a team's remaining
  // games deterministic) -- "based on the current results available," in
  // Nathan's own words, not a coin flip that ignores how teams have
  // actually played. Simulated outcomes are binary (win/loss only, no
  // simulated ties) -- real ties are rare enough in this data that
  // modeling them adds real complexity for very little accuracy gained.
  // Raw fetch+parse, unfiltered -- factored out of fetchCmyfccDivisionData
  // so "All Bengals Teams" (below) can pull every division's data from
  // ONE network call instead of 5 separate fetches of the same payload.
  async function fetchCmyfccRawPayload() {
    const res = await fetch(CMYFCC_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    });
    if (!res.ok) throw new Error(`CMYFCC returned HTTP ${res.status}`);
    const body = await res.json();
    const payload = body.result || body.data || body;
    if (!payload || payload.available === false || !Array.isArray(payload.games)) {
      throw new Error('CMYFCC response missing games data');
    }
    const standingsArr = Array.isArray(payload.standings) ? payload.standings : Object.values(payload.standings || {});
    return { games: payload.games, standings: standingsArr };
  }
  async function fetchCmyfccDivisionData(divisionKey) {
    const key = divisionKey || CMYFCC_OUR_DIVISION_KEY;
    const { games, standings } = await fetchCmyfccRawPayload();
    return {
      games: games.filter((g) => g.divisionKey === key),
      standings: standings.filter((s) => s.divisionKey === key),
    };
  }
  // "All Bengals Teams" -- Nathan: "it doesn't need to be full standings
  // but have their record, their place in standings (3 of 12), and their
  // playoff probabilities." One compact row per age group, reusing the
  // SAME simulatePlayoffOdds this file already runs for our own 11U team
  // (below), just run once per division against that division's own
  // games/standings slice. CMYFCC's own "rank" field on each standings row
  // is used directly for "place in standings" (confirmed live: the same
  // overall rank its playoffProjection's seeding is built from, not
  // re-derived from wins/losses here) -- division size (the "of 12") is
  // just that division's own standings row count.
  async function fetchAllBengalsTeamsData() {
    const { games, standings } = await fetchCmyfccRawPayload();
    return BENGALS_DIVISIONS.map((div) => {
      const divGames = games.filter((g) => g.divisionKey === div.key);
      const divStandings = standings.filter((s) => s.divisionKey === div.key);
      const ourRow = divStandings.find((s) =>
        (s.associationName || '').toLowerCase() === CMYFCC_OUR_ASSOCIATION_NAME.toLowerCase());
      if (!ourRow) return { division: div.label, divisionKey: div.key, missing: true };
      const odds = divStandings.length ? simulatePlayoffOdds(divGames, divStandings) : [];
      const ourOdds = odds.find((o) => o.name === ourRow.associationName);
      // Nathan: "It would be nice to be able to see the game cards from
      // those other bengals teams and not just their record." divGames
      // was already fetched (and already filtered to this division) for
      // simulatePlayoffOdds just above -- this just also reshapes the
      // SAME division's own Bengals games via shapeTeamGames, matched by
      // ourRow's own real associationName (already resolved, no fuzzy
      // token matching needed the way fetchCmyfccGamesFor needs for an
      // arbitrary typed-in opponent name). No second network call.
      const ourGames = shapeTeamGames(divGames, (assocName) => assocName === ourRow.associationName);
      return {
        division: div.label,
        divisionKey: div.key,
        isCurrent: div.key === CMYFCC_OUR_DIVISION_KEY,
        record: ourRow.record,
        rank: ourRow.rank,
        total: divStandings.length,
        probability: ourOdds ? ourOdds.probability : null,
        games: ourGames,
      };
    });
  }
  function simulatePlayoffOdds(games, standings, iterations) {
    iterations = iterations || 4000;
    const names = standings.map((s) => s.associationName);
    const baseWins = {}, baseLosses = {}, baseTies = {};
    standings.forEach((s) => { baseWins[s.associationName] = s.wins || 0; baseLosses[s.associationName] = s.losses || 0; baseTies[s.associationName] = s.ties || 0; });
    function strength(name) {
      const w = baseWins[name] || 0, l = baseLosses[name] || 0, t = baseTies[name] || 0;
      const gp = w + l + t;
      if (!gp) return 0.5;
      const pct = (w + 0.5 * t) / gp;
      return Math.min(0.85, Math.max(0.15, pct));
    }
    const remaining = games.filter((g) => !(g.result && g.result.status === 'final') && g.homeTeam && g.awayTeam);
    const playoffCount = {};
    names.forEach((n) => { playoffCount[n] = 0; });
    const strengthByName = {};
    names.forEach((n) => { strengthByName[n] = strength(n); });
    for (let i = 0; i < iterations; i++) {
      const wins = Object.assign({}, baseWins);
      remaining.forEach((g) => {
        const home = g.homeTeam.associationName, away = g.awayTeam.associationName;
        const sh = strengthByName[home] != null ? strengthByName[home] : 0.5;
        const sa = strengthByName[away] != null ? strengthByName[away] : 0.5;
        const pHome = sh / (sh + sa);
        if (Math.random() < pHome) wins[home] = (wins[home] || 0) + 1;
        else wins[away] = (wins[away] || 0) + 1;
      });
      const ranked = names.map((name) => ({ name, points: (wins[name] || 0) * 10 + (baseTies[name] || 0) * 5, tiebreak: Math.random() }));
      ranked.sort((a, b) => (b.points - a.points) || (a.tiebreak - b.tiebreak));
      ranked.slice(0, 12).forEach((t) => { playoffCount[t.name]++; });
    }
    return standings.map((s) => ({
      name: s.associationName,
      teamLabel: s.teamLabel,
      record: s.record,
      probability: playoffCount[s.associationName] / iterations,
    })).sort((a, b) => b.probability - a.probability);
  }
  function probabilityRowHtml(row) {
    const isUs = isBengalsRow({ team: row.teamLabel });
    const badge = window.isBengalsTeamName && window.isBengalsTeamName(row.teamLabel)
      ? (window.bengalsBadgeHtml ? window.bengalsBadgeHtml() : '')
      : (window.opponentBadgeHtml ? window.opponentBadgeHtml(row.name) : '');
    const pct = Math.round(row.probability * 100);
    return `<div class="playoffSeedChip standingsProbabilityRow${isUs ? ' playoffSeedUs' : ''}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;">
        ${badge}
        <span class="scheduleTeamName" style="flex:1;">${escapeHtml(row.name)}</span>
        <span class="scheduleTeamRecord">${escapeHtml(row.record || '')}</span>
        <span style="font-weight:900;font-size:15px;min-width:48px;text-align:right;color:${pct >= 50 ? 'var(--bengal-orange)' : 'var(--muted)'};">${pct}%</span>
      </div>`;
  }
  async function loadPlayoffProbabilities() {
    const wrap = document.getElementById('standingsProbabilitiesBody');
    if (!wrap) return;
    wrap.innerHTML = '<div class="hint" style="text-align:center;">Simulating the rest of the season…</div>';
    try {
      const { games, standings } = await fetchCmyfccDivisionData();
      if (!standings.length) {
        wrap.innerHTML = '<div class="lbEmpty">No standings data available from CMYFCC yet.</div>';
        return;
      }
      const rows = simulatePlayoffOdds(games, standings);
      wrap.innerHTML =
        '<div class="lbSub" style="text-align:center;margin-bottom:14px;">Odds of finishing in the top 12 of Tackle 11U (both playoff brackets combined) -- simulating the rest of the season 4,000 times from each team’s current record. Not an official CMYFCC number, just this app’s own estimate.</div>' +
        rows.map(probabilityRowHtml).join('');
    } catch (e) {
      wrap.innerHTML = `<div class="lbEmpty">Couldn't simulate playoff odds: ${escapeHtml(e.message)}</div>`;
    }
  }

  // Nathan: "It would be nice to be able to see the game cards from those
  // other bengals teams and not just their record." Real game rows (date,
  // opponent, score/Upcoming pill), not a second, simpler card -- reuses
  // window.compactGameRowHtml (js/schedule.js), the SAME renderer
  // loadOpponentRecentForm (below) already proves out for CMYFCC-sourced
  // games, so this reads identically to every other "recent/upcoming
  // games" list in the app. Deliberately does NOT wire a click handler on
  // each row's own opponent logo the way loadOpponentRecentForm does --
  // that calls showOpponentPage against OUR 11U division's own
  // teams/games list, which wouldn't find an opponent from a different
  // division at all. Soonest-upcoming-first, then most-recent-final,
  // matching "what's next, then what just happened" over a flat date sort.
  function allTeamsGamesHtml(games) {
    if (!games || !games.length) return '<div class="lbEmpty" style="margin:6px 0 2px;">No games posted for this division yet.</div>';
    const upcoming = games.filter(g => !g.isFinal).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const recent = games.filter(g => g.isFinal).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const badge = window.bengalsBadgeHtml ? window.bengalsBadgeHtml() : '';
    return [...upcoming, ...recent]
      .map(g => window.compactGameRowHtml ? window.compactGameRowHtml(g, { teamName: 'Ayer/Shirley/Lunenburg', teamBadgeHtml: badge }) : '')
      .join('');
  }
  function allTeamsRowHtml(row) {
    if (row.missing) {
      return `<div class="playoffSeedChip standingsProbabilityRow" style="display:flex;align-items:center;gap:10px;padding:10px;">
          <span class="allTeamsDivBadge">${escapeHtml(row.division)}</span>
          <span class="scheduleTeamName" style="flex:1;">No ${escapeHtml(row.division)} data posted by CMYFCC yet</span>
        </div>`;
    }
    const pct = row.probability != null ? Math.round(row.probability * 100) : null;
    const badge = window.bengalsBadgeHtml ? window.bengalsBadgeHtml() : '';
    const safeKey = (row.divisionKey || row.division).replace(/[^a-zA-Z0-9]/g, '_');
    return `<div class="standingsAllTeamsRowWrap">
      <div class="playoffSeedChip standingsProbabilityRow standingsAllTeamsToggle${row.isCurrent ? ' playoffSeedUs' : ''}" data-games-target="allTeamsGames-${safeKey}" style="display:flex;align-items:center;gap:10px;padding:10px;cursor:pointer;">
        <span class="allTeamsDivBadge">${escapeHtml(row.division)}</span>
        ${badge}
        <span style="flex:1;min-width:0;">
          <span class="scheduleTeamName" style="display:block;max-width:none;white-space:normal;">Ayer/Shirley/Lunenburg</span>
          <span class="scheduleTeamRecord">${escapeHtml(row.record || '')} · ${row.rank} of ${row.total}</span>
        </span>
        <span style="font-weight:900;font-size:15px;min-width:48px;text-align:right;color:${pct != null && pct >= 50 ? 'var(--bengal-orange)' : 'var(--muted)'};">${pct != null ? pct + '%' : '--'}</span>
        <span class="standingsAllTeamsChevron">▾</span>
      </div>
      <div class="standingsAllTeamsGames" id="allTeamsGames-${safeKey}" style="display:none;">${allTeamsGamesHtml(row.games)}</div>
    </div>`;
  }
  async function loadAllBengalsTeams() {
    const wrap = document.getElementById('standingsAllTeamsBody');
    if (!wrap) return;
    wrap.innerHTML = '<div class="hint" style="text-align:center;">Loading every Bengals team…</div>';
    try {
      const rows = await fetchAllBengalsTeamsData();
      wrap.innerHTML =
        '<div class="lbSub" style="text-align:center;margin-bottom:14px;">Record, standing, and simulated playoff odds for every Ayer/Shirley/Lunenburg Bengals team, 9U through 13U -- tap a team to see its games. This app is the 11U team\'s own -- the others are shown read-only for reference.</div>' +
        rows.map(allTeamsRowHtml).join('');
      // Collapsed by default (same "don't show everything on load"
      // principle This Week's own Recent Results toggle already uses) --
      // the games were already fetched above (one request covers every
      // division), so opening one is instant, no extra network round trip.
      wrap.querySelectorAll('.standingsAllTeamsToggle').forEach((row) => {
        row.addEventListener('click', () => {
          const target = document.getElementById(row.dataset.gamesTarget);
          if (!target) return;
          const show = target.style.display === 'none';
          target.style.display = show ? '' : 'none';
          const chevron = row.querySelector('.standingsAllTeamsChevron');
          if (chevron) chevron.textContent = show ? '▴' : '▾';
        });
      });
    } catch (e) {
      wrap.innerHTML = `<div class="lbEmpty">Couldn't load Bengals teams: ${escapeHtml(e.message)}</div>`;
    }
  }

  // One shared toggler for the Standings tab's panels -- was 3 separate,
  // nearly-identical functions each hand-listing every panel id; adding a
  // 4th panel (All Bengals Teams) on top of that copy-paste risked
  // forgetting to hide it in one of them. showOpponentPage (above) stays
  // on its own separate, simpler list/detail-only toggle -- it's only
  // ever reached from a context where the other 3 detail panels are
  // already hidden (see its own comment), so folding it in here isn't
  // needed and would be unrelated scope.
  const STANDINGS_PANEL_IDS = ['standingsListPanel', 'standingsOpponentDetail', 'standingsPlayoffDetail', 'standingsProbabilitiesDetail', 'standingsAllTeamsDetail'];
  // Real back-button support (js/nav-history.js). currentStandingsPanel
  // tracks which of the 5 is up WITHIN an already-open Standings section
  // -- kept separate from setMode's own currentMode (study-quiz.js),
  // which only knows "the Standings section is open," not which panel
  // inside it. navOpts.silent is for initStandingsNav's own unconditional
  // reset-to-list on every section entry (below) -- not a real user
  // navigation, so it resyncs the tracked variable without pushing.
  let currentStandingsPanel = 'standingsListPanel';
  function showStandingsPanel(activeId, navOpts) {
    navOpts = navOpts || {};
    const fromPanel = currentStandingsPanel;
    STANDINGS_PANEL_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = (id === activeId) ? '' : 'none';
    });
    currentStandingsPanel = activeId;
    if (!navOpts.fromHistory && !navOpts.silent && fromPanel !== activeId && window.NavHistory) {
      window.NavHistory.push('standings:' + activeId, () => showStandingsPanel(fromPanel, { fromHistory: true }));
    }
  }

  function showStandingsList(navOpts) { showStandingsPanel('standingsListPanel', navOpts); }

  function showPlayoffPicture() {
    showStandingsPanel('standingsPlayoffDetail');
    loadPlayoffPicture();
  }

  function showPlayoffProbabilities() {
    showStandingsPanel('standingsProbabilitiesDetail');
    loadPlayoffProbabilities();
  }

  function showAllBengalsTeams() {
    showStandingsPanel('standingsAllTeamsDetail');
    loadAllBengalsTeams();
  }

  let backBtnWired = false;

  // ---- Read-only Standings tab (everyone) ----
  window.initStandingsNav = async function () {
    const container = document.getElementById('standingsTableWrap');
    if (!container) return;
    // Every back button here routes through NavHistory.goBack() (js/
    // nav-history.js), not showStandingsList() directly -- a real
    // history.back() fires popstate, which runs the matching undo (always
    // showStandingsList() for these 4, see showStandingsPanel/
    // showOpponentPage above), keeping an on-screen tap and a hardware
    // back press on the exact same code path.
    const goBackToList = () => {
      if (window.NavHistory && window.NavHistory.depth() > 0) window.NavHistory.goBack();
      else showStandingsList();
    };
    if (!backBtnWired) {
      const backBtn = document.getElementById('standingsOpponentBackBtn');
      if (backBtn) { backBtn.addEventListener('click', goBackToList); backBtnWired = true; }
      const playoffBackBtn = document.getElementById('standingsPlayoffBackBtn');
      if (playoffBackBtn) { playoffBackBtn.addEventListener('click', goBackToList); }
      const playoffOpenBtn = document.getElementById('standingsPlayoffOpenBtn');
      if (playoffOpenBtn) { playoffOpenBtn.addEventListener('click', showPlayoffPicture); }
      const probBackBtn = document.getElementById('standingsProbabilitiesBackBtn');
      if (probBackBtn) { probBackBtn.addEventListener('click', goBackToList); }
      const probOpenBtn = document.getElementById('standingsProbabilitiesOpenBtn');
      if (probOpenBtn) { probOpenBtn.addEventListener('click', showPlayoffProbabilities); }
      const allTeamsBackBtn = document.getElementById('standingsAllTeamsBackBtn');
      if (allTeamsBackBtn) { allTeamsBackBtn.addEventListener('click', goBackToList); }
      const allTeamsOpenBtn = document.getElementById('standingsAllTeamsOpenBtn');
      if (allTeamsOpenBtn) { allTeamsOpenBtn.addEventListener('click', showAllBengalsTeams); }
    }
    // Silent -- this unconditionally resets to the list every time the
    // Standings SECTION is entered (not a real user navigation within an
    // already-open section), so it just resyncs currentStandingsPanel
    // without pushing a history entry for it.
    showStandingsList({ silent: true });
    container.innerHTML = '<div class="hint" style="text-align:center;">Loading standings…</div>';
    const [data, games] = await Promise.all([
      loadStandings(),
      window.ensureGamesLoaded ? window.ensureGamesLoaded() : Promise.resolve([]),
    ]);
    renderTable(container, data, games);
  };

  // Nathan: "When I am looking at an upcoming game, I should be able to
  // click on the opponent logo and have it take me to their team page."
  // Called from js/schedule.js's own game detail hero. Runs through
  // initStandingsNav() first rather than loading data and calling
  // showOpponentPage directly -- that's where the Standings screen's own
  // one-time "‹ Back" button wiring and list-view setup happen
  // (backBtnWired, above), so a player who's never opened the Standings
  // tab this session still lands on a fully-working team page, not one
  // with a dead Back button.
  window.openStandingsTeamPage = async function (teamName, gameId) {
    if (!teamName) return;
    if (typeof window.setSection === 'function') window.setSection('standings');
    await window.initStandingsNav();
    const [data, games] = await Promise.all([
      loadStandings(),
      window.ensureGamesLoaded ? window.ensureGamesLoaded() : Promise.resolve([]),
    ]);
    const teams = (data && data.teams) || [];
    showOpponentPage(gameId || null, teamName, teams, games);
  };

  // ---- Coach Tools paste box ----
  window.initCoachToolsStandings = async function () {
    const wrap = document.getElementById('coachStandingsWrap');
    if (!wrap) return;
    const data = await loadStandings();
    wrap.innerHTML =
      '<button type="button" class="navBtn" id="standingsSyncBtn" style="display:block;width:100%;margin-bottom:8px;">🔄 Sync from CMYFCC</button>' +
      '<div id="standingsSyncStatus" class="hint" style="text-align:center;margin-bottom:12px;"></div>' +
      '<textarea id="standingsPasteBox" placeholder="Paste the standings table here -- Team, Record, and either PF/PA or Win%/Diff columns" style="width:100%;min-height:220px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;font-family:monospace;white-space:pre;margin-bottom:8px;">' +
      escapeHtml((data && data.rawText) || '') +
      '</textarea>' +
      '<button type="button" class="navBtn" id="standingsSaveBtn" style="display:block;width:100%;">💾 Save Standings</button>' +
      '<div id="standingsSaveStatus" class="hint" style="text-align:center;margin-top:8px;"></div>' +
      '<div id="standingsPreviewWrap" style="margin-top:16px;"></div>';
    const previewWrap = document.getElementById('standingsPreviewWrap');
    if (data && Array.isArray(data.teams) && data.teams.length) renderTable(previewWrap, data);
    document.getElementById('standingsSyncBtn').addEventListener('click', async () => {
      const syncBtn = document.getElementById('standingsSyncBtn');
      const syncStatusEl = document.getElementById('standingsSyncStatus');
      const pasteBox = document.getElementById('standingsPasteBox');
      syncBtn.disabled = true;
      syncStatusEl.textContent = 'Checking CMYFCC…';
      try {
        const { teams, rawText } = await fetchCmyfccStandings();
        pasteBox.value = rawText;
        const saveStatusEl = document.getElementById('standingsSaveStatus');
        const result = await saveStandings(teams, rawText, saveStatusEl);
        if (result.ok) {
          syncStatusEl.textContent = `Synced -- ${teams.length} team${teams.length === 1 ? '' : 's'} pulled live from CMYFCC and saved.`;
          renderTable(previewWrap, standingsData);
        } else {
          syncStatusEl.textContent = 'Pulled from CMYFCC, but the save failed -- see the message below the paste box.';
        }
      } catch (e) {
        syncStatusEl.textContent = `Couldn't sync: ${e.message}`;
      } finally {
        syncBtn.disabled = false;
      }
    });
    document.getElementById('standingsSaveBtn').addEventListener('click', async () => {
      const text = document.getElementById('standingsPasteBox').value;
      const statusEl = document.getElementById('standingsSaveStatus');
      const { teams, warnings } = parseStandingsText(text);
      if (!teams.length) {
        statusEl.textContent = "Nothing readable in there -- check the paste (Team, Record, and either PF/PA or Win%/Diff columns) and try again.";
        return;
      }
      const result = await saveStandings(teams, text, statusEl);
      if (result.ok) {
        statusEl.textContent = `Saved -- ${teams.length} team${teams.length === 1 ? '' : 's'} now showing on the Standings tab.` +
          (warnings.length ? ` (${warnings.length} line${warnings.length === 1 ? '' : 's'} skipped -- ${warnings[0]})` : '');
        // standingsData now holds the just-saved payload, powerRank/trend
        // already computed against last week's snapshot -- render that
        // (not the raw un-ranked `teams`) so the preview matches exactly
        // what the read-only Standings tab will show.
        renderTable(previewWrap, standingsData);
      }
    });
  };
})();

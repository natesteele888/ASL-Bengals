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
  async function fetchCmyfccRecentGamesFor(teamName, limit) {
    limit = limit || 5;
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
    return payload.games
      .filter(g => g.divisionKey === CMYFCC_OUR_DIVISION_KEY && g.result && g.result.status === 'final')
      .filter(g => isMatch(g.homeTeam && g.homeTeam.associationName) || isMatch(g.awayTeam && g.awayTeam.associationName))
      .map(g => {
        const isHome = isMatch(g.homeTeam && g.homeTeam.associationName);
        return {
          id: g.id,
          date: g.logistics ? g.logistics.date : null,
          opponent: isHome ? (g.awayTeam && g.awayTeam.associationName) : (g.homeTeam && g.homeTeam.associationName),
          ourScore: isHome ? g.result.homeScore : g.result.awayScore,
          oppScore: isHome ? g.result.awayScore : g.result.homeScore,
        };
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
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

  function isBengalsRow(t) {
    return /bengal/i.test(t.team || '');
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
      // already render correctly either way. Our own row stays plain text
      // -- there's no "opponent" page for ourselves.
      const matchedGame = games ? matchScheduleOpponent(t.team, games) : null;
      const isUs = isBengalsRow(t);
      const nameCell = isUs
        ? escapeHtml(t.team)
        : `<button type="button" class="standingsTeamLink" data-open-team="${escapeHtml(t.team)}" data-open-opponent="${matchedGame ? escapeHtml(matchedGame.id) : ''}">${escapeHtml(t.team)} ›</button>`;
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

  function opponentPageHtml(game, teamRow) {
    const diffStr = teamRow ? ((teamDiff(teamRow) > 0 ? '+' : '') + teamDiff(teamRow)) : '';
    const hasFootage = !!game.opponentFilmUrl;
    // A real Schedule record exists for this team (we've actually played
    // or are scheduled to play them) vs. a division-only team pulled
    // straight from Standings with no Schedule game to pull film/
    // scouting/a schedule-link from -- see showOpponentPage, which builds
    // a plain {opponent: teamName} stand-in for that second case.
    const hasGame = !!game.id;
    const hue = hashHue(game.opponent);
    const badgeHtml = window.opponentBadgeHtml ? window.opponentBadgeHtml(game.opponent) : '';
    let html = `<div class="lbHeroHeader" id="standingsOpponentHero" data-opponent="${escapeHtml(game.opponent || '')}" style="background:${heroGradient(hue)};">
        <div class="lbHeroTeamBadgeWrap">${badgeHtml}</div>
        <h3>${escapeHtml(game.opponent || 'Opponent')}</h3>
        ${teamRow ? `<div class="lbSub">${escapeHtml(recordStr(teamRow))} &middot; Diff ${escapeHtml(diffStr)}${teamRow.powerRank != null ? ` &middot; Power Rank #${teamRow.powerRank}` : ''}</div>` : ''}
      </div>`;
    // Nathan: "utilize the CMYFCC website to also pull in team game
    // history for the other teams" -- filled in asynchronously by
    // showOpponentPage right below (real network call, shouldn't block
    // this page's own first render), same progressive-render pattern
    // js/schedule.js's own Game Recap narrative already uses.
    html += `<div id="standingsOpponentRecentForm"><div class="lbSectionHeader">📊 Recent Form</div><div class="hint" style="text-align:center;">Loading from CMYFCC…</div></div>`;
    if (hasFootage) {
      html += `<a href="${escapeHtml(game.opponentFilmUrl)}" target="_blank" rel="noopener" class="navBtn" data-film-game-id="${escapeHtml(game.id)}" style="display:block;width:100%;text-align:center;box-sizing:border-box;${game.opponentFilmNote ? 'margin-bottom:4px;' : 'margin-bottom:14px;'}">🎥 Watch Game Film of ${escapeHtml(game.opponent || 'this Opponent')}</a>`;
      if (game.opponentFilmNote) html += `<div class="lbSub" style="text-align:center;margin:0 0 14px;">${escapeHtml(game.opponentFilmNote)}</div>`;
    }
    if (game.scouting) {
      html += `<div class="lbSectionHeader">🔎 Scouting Report</div>
        <div class="thisweekKeysBox" style="white-space:pre-wrap;font-size:14px;line-height:1.5;">${escapeHtml(game.scouting)}</div>`;
    }
    if (!hasFootage && !game.scouting) {
      html += hasGame
        ? '<div class="lbEmpty">No footage or scouting notes added for this opponent yet -- a coach can add them from this game\'s Schedule page.</div>'
        : `<div class="lbEmpty">We haven't played ${escapeHtml(game.opponent || 'this team')} yet this season -- once they're on the Schedule, footage and scouting notes can be added there.</div>`;
    }
    if (hasGame) {
      html += `<div style="text-align:center;margin-top:16px;">
          <button type="button" class="lbLinkBtn" id="standingsOpponentScheduleLink">View this game on Schedule ›</button>
        </div>`;
    }
    return html;
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
    const scheduleLink = document.getElementById('standingsOpponentScheduleLink');
    if (scheduleLink) scheduleLink.addEventListener('click', () => { if (window.openScheduleGame) window.openScheduleGame(game.id); });
    loadOpponentRecentForm(game.opponent);
    applyOpponentHeroColor(game.opponent);
  }

  async function loadOpponentRecentForm(opponentName) {
    const wrap = document.getElementById('standingsOpponentRecentForm');
    if (!wrap) return;
    if (!window.compactGameRowHtml || !window.opponentBadgeHtml) {
      wrap.innerHTML = '';
      return;
    }
    try {
      const rows = await fetchCmyfccRecentGamesFor(opponentName, 5);
      // A stale response landing after the coach has already navigated
      // to a DIFFERENT opponent (or back to the list) shouldn't clobber
      // whatever's on screen now -- re-check the container's still
      // showing a loading state for the SAME opponent before writing.
      const stillOnThisOpponent = document.getElementById('standingsOpponentRecentForm') === wrap && wrap.isConnected;
      if (!stillOnThisOpponent) return;
      if (!rows.length) {
        wrap.innerHTML = `<div class="lbSectionHeader">📊 Recent Form</div><div class="lbEmpty">No completed games found for ${escapeHtml(opponentName || 'this team')} on CMYFCC yet.</div>`;
        return;
      }
      const rowsHtml = rows.map(g => window.compactGameRowHtml(g, {
        teamName: opponentName,
        teamBadgeHtml: window.opponentBadgeHtml(opponentName),
      })).join('');
      wrap.innerHTML = `<div class="lbSectionHeader">📊 Recent Form</div><div class="last5List">${rowsHtml}</div>`;
    } catch (e) {
      wrap.innerHTML = `<div class="lbSectionHeader">📊 Recent Form</div><div class="lbEmpty">Couldn't load from CMYFCC: ${escapeHtml(e.message)}</div>`;
    }
  }

  function showStandingsList() {
    const listPanel = document.getElementById('standingsListPanel');
    const detailPanel = document.getElementById('standingsOpponentDetail');
    if (listPanel) listPanel.style.display = '';
    if (detailPanel) detailPanel.style.display = 'none';
  }

  let backBtnWired = false;

  // ---- Read-only Standings tab (everyone) ----
  window.initStandingsNav = async function () {
    const container = document.getElementById('standingsTableWrap');
    if (!container) return;
    if (!backBtnWired) {
      const backBtn = document.getElementById('standingsOpponentBackBtn');
      if (backBtn) { backBtn.addEventListener('click', showStandingsList); backBtnWired = true; }
    }
    showStandingsList();
    container.innerHTML = '<div class="hint" style="text-align:center;">Loading standings…</div>';
    const [data, games] = await Promise.all([
      loadStandings(),
      window.ensureGamesLoaded ? window.ensureGamesLoaded() : Promise.resolve([]),
    ]);
    renderTable(container, data, games);
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

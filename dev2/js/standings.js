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
      const matchedGame = games ? matchScheduleOpponent(t.team, games) : null;
      const nameCell = matchedGame
        ? `<button type="button" class="standingsTeamLink" data-open-opponent="${escapeHtml(matchedGame.id)}">${escapeHtml(t.team)} ›</button>`
        : escapeHtml(t.team);
      html += `<tr class="${isBengalsRow(t) ? 'standingsRowUs' : ''}">` +
        `<td class="standingsPowerCell">${powerRankCellHtml(t, i + 1)}</td>` +
        `<td>${nameCell}${t.division ? `<span class="standingsDivTag">${escapeHtml(t.division)}</span>` : ''}</td>` +
        `<td>${escapeHtml(recordStr(t))}</td>` +
        `<td>${pctStr}</td><td>${diffStr}</td></tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
    if (games) {
      container.querySelectorAll('[data-open-opponent]').forEach(btn => {
        btn.addEventListener('click', () => showOpponentPage(btn.dataset.openOpponent, data.teams, games));
      });
    }
  }

  function opponentPageHtml(game, teamRow) {
    const diffStr = teamRow ? ((teamDiff(teamRow) > 0 ? '+' : '') + teamDiff(teamRow)) : '';
    const hasFootage = !!game.opponentFilmUrl;
    let html = `<div class="lbHeroHeader">
        <div class="lbHeroTrophy">🏈</div>
        <h3>${escapeHtml(game.opponent || 'Opponent')}</h3>
        ${teamRow ? `<div class="lbSub">${escapeHtml(recordStr(teamRow))} &middot; Diff ${escapeHtml(diffStr)}${teamRow.powerRank != null ? ` &middot; Power Rank #${teamRow.powerRank}` : ''}</div>` : ''}
      </div>`;
    if (hasFootage) {
      html += `<a href="${escapeHtml(game.opponentFilmUrl)}" target="_blank" rel="noopener" class="navBtn" data-film-game-id="${escapeHtml(game.id)}" style="display:block;width:100%;text-align:center;box-sizing:border-box;${game.opponentFilmNote ? 'margin-bottom:4px;' : 'margin-bottom:14px;'}">🎥 Watch Game Film of ${escapeHtml(game.opponent || 'this Opponent')}</a>`;
      if (game.opponentFilmNote) html += `<div class="lbSub" style="text-align:center;margin:0 0 14px;">${escapeHtml(game.opponentFilmNote)}</div>`;
    }
    if (game.scouting) {
      html += `<div class="lbSectionHeader">🔎 Scouting Report</div>
        <div class="thisweekKeysBox" style="white-space:pre-wrap;font-size:14px;line-height:1.5;">${escapeHtml(game.scouting)}</div>`;
    }
    if (!hasFootage && !game.scouting) {
      html += '<div class="lbEmpty">No footage or scouting notes added for this opponent yet -- a coach can add them from this game\'s Schedule page.</div>';
    }
    html += `<div style="text-align:center;margin-top:16px;">
        <button type="button" class="lbLinkBtn" id="standingsOpponentScheduleLink">View this game on Schedule ›</button>
      </div>`;
    return html;
  }

  function showOpponentPage(gameId, teams, games) {
    const listPanel = document.getElementById('standingsListPanel');
    const detailPanel = document.getElementById('standingsOpponentDetail');
    const body = document.getElementById('standingsOpponentBody');
    const game = (games || []).find(g => g.id === gameId);
    if (!game || !listPanel || !detailPanel || !body) return;
    const teamRow = (teams || []).find(t => matchScheduleOpponent(t.team, [game]));
    body.innerHTML = opponentPageHtml(game, teamRow);
    listPanel.style.display = 'none';
    detailPanel.style.display = '';
    const scheduleLink = document.getElementById('standingsOpponentScheduleLink');
    if (scheduleLink) scheduleLink.addEventListener('click', () => { if (window.openScheduleGame) window.openScheduleGame(gameId); });
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
      '<textarea id="standingsPasteBox" placeholder="Paste the standings table here -- Team, Record, and either PF/PA or Win%/Diff columns" style="width:100%;min-height:220px;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;font-family:monospace;white-space:pre;margin-bottom:8px;">' +
      escapeHtml((data && data.rawText) || '') +
      '</textarea>' +
      '<button type="button" class="navBtn" id="standingsSaveBtn" style="display:block;width:100%;">💾 Save Standings</button>' +
      '<div id="standingsSaveStatus" class="hint" style="text-align:center;margin-top:8px;"></div>' +
      '<div id="standingsPreviewWrap" style="margin-top:16px;"></div>';
    const previewWrap = document.getElementById('standingsPreviewWrap');
    if (data && Array.isArray(data.teams) && data.teams.length) renderTable(previewWrap, data);
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

// ---------------------------------------------------------------------------
// Coach Tools > Dashboard -- Nathan: "I think we could move everything from
// the 5 button tap coach stats to a dashboard in Coach Tools." This is that
// move: the full team-usage view that used to live behind a hidden 5-tap
// logo gesture + PIN (js/study-quiz.js's old openAdminStats()) is now a
// real Coach Tools tab. Coach Tools itself is already hidden from everyone
// but an approved coach, so the PIN gate was a redundant second lock and
// was dropped -- the 5-tap gesture still works, it just deep-links here now
// (see study-quiz.js's headerLogo click handler + coachtools-nav.js's
// window.openCoachToolsTab).
//
// Also folds in three things Nathan asked for on top of the original view:
//   1. "choose any of the players on the team and see who doesn't have an
//      account setup" -- new Account Setup panel, cross-referencing
//      teamRoster (roster.js) against linked/matched dev2Players accounts.
//   2. "who is spending the most cumulative time on it, who isn't using
//      it" -- Player Activity now tracks total (not just average) session
//      time per player, plus an explicit Not Using It list.
//   3. "what plays are the toughest for the kids to remember" -- a
//      team-wide Play Call difficulty breakdown (same shape as the
//      existing team-wide Signal difficulty view), not just the per-player
//      "could use extra reps" tip.
// ---------------------------------------------------------------------------
(function () {

  const FIREBASE_URL = 'https://aslbengals-default-rtdb.firebaseio.com';

  function norm(n) { return (n || '').trim().toLowerCase(); }
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  async function cloudFetch(path) {
    try {
      const url = await window.firebaseAuthed(`${FIREBASE_URL}/${path}.json`);
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return data ? Object.values(data) : [];
    } catch (e) { return null; }
  }

  // Nathan: "Drone footage visible toggle should come out of Dashboard and
  // have a new pill called settings..." -- moved to js/coachtools-settings.js.

  function fmtWhen(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function fmtDuration(ms) {
    if (!ms) return '—';
    const mins = Math.round(ms / 60000);
    if (mins < 1) return '<1 min';
    if (mins < 60) return mins + ' min';
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }
  function statCard(num, label) {
    return `<div class="adminStatCard"><div class="num">${num}</div><div class="lbl">${label}</div></div>`;
  }
  function playLabel(key) {
    const pt = (window.DATA && window.DATA.playTypes || []).find(p => p.key === key);
    return pt ? pt.label : key;
  }
  // Nathan: "we don't need to call out that Coach Shane and the other
  // coaches are logging time or what not on the dashboard." Filtering on
  // just p.isCoach/p.role missed accounts that were never explicitly
  // flagged that way (e.g. a coach who signed in before the role picker
  // existed, or picked "Player" by mistake) -- matching the name itself
  // against auth.js's COACH_PROFILE_NAMES allowlist (same trick already
  // used for the quiz leaderboards' coach-sort fix) catches those too.
  function isCoachName(name) {
    const n = norm(name);
    return !!(n && window.COACH_PROFILE_NAMES && window.COACH_PROFILE_NAMES.indexOf(n) !== -1);
  }
  function isCoachRecord(p) {
    return !!(p.isCoach || p.role === 'coach' || isCoachName(p.name));
  }

  window.initCoachToolsDashboard = async function () {
    const body = document.getElementById('coachDashboardBody');
    if (!body) return;
    body.innerHTML = '<div class="lbEmpty">Loading…</div>';
    const buildEl = document.getElementById('coachDashBuildVersion');
    if (buildEl && window.BUILD_V) buildEl.textContent = window.BUILD_V;

    const [timedStarts, standardStarts, standardResults, timedResults, signalAttempts, timedLbEntries, sessions, pcqResults, pcqRoundAttempts, quizLbEntries] = await Promise.all([
      cloudFetch('analytics/timedStarts'),
      cloudFetch('analytics/standardStarts'),
      cloudFetch('analytics/standardResults'),
      cloudFetch('analytics/timedResults'),
      cloudFetch('analytics/signalAttempts'),
      cloudFetch('timedLeaderboard'),
      cloudFetch('analytics/sessions'),
      cloudFetch('analytics/pcqResults'),
      cloudFetch('analytics/pcqRoundAttempts'),
      cloudFetch('leaderboard'),
    ]);
    const players = window.PlayerIdentity ? await window.PlayerIdentity.fetchAllPlayers() : {};
    const roster = (window.isTeamRosterLoaded && window.isTeamRosterLoaded())
      ? window.getTeamRosterCached()
      : (window.loadTeamRoster ? await window.loadTeamRoster() : []);

    if ([timedStarts, standardStarts, standardResults, timedResults, signalAttempts].includes(null)) {
      body.innerHTML = '<div class="lbEmpty">⚠️ Could not reach the team server — check your connection and try again.</div>';
      return;
    }

    // ---- Registered players ----
    const playerRows = Object.keys(players).map(id => Object.assign({ id }, players[id]))
      .sort((a, b) => new Date(b.lastSeen || b.createdAt || 0) - new Date(a.lastSeen || a.createdAt || 0));
    function playerRowHtml(p) {
      const roleTag = p.role === 'parent' ? ' <span style="opacity:.6">(parent)</span>'
        : (p.role === 'coach' || p.isCoach) ? ' <span style="opacity:.6">(coach)</span>' : '';
      const best = p.pcqBestScore ? `🧠 ${p.pcqBestScore}/${p.pcqBestMaxScore}` : '—';
      const resetBtn = p.pcqBestScore
        ? `<button class="lbLinkBtn pcqResetBtn" data-player-id="${p.id}" data-player-name="${escapeHtml(p.name)}" style="display:block;margin-left:auto;font-size:9.5px;margin-top:1px;">Reset</button>`
        : '';
      return `<div class="lbRow"><div class="lbRank" style="font-size:10px;width:auto;background:transparent;color:var(--muted)">${fmtWhen(p.lastSeen)}</div>
        <div class="lbName">${escapeHtml(p.name)}${roleTag}</div>
        <div class="lbScore" style="font-size:10px;text-align:right;">${best}${resetBtn}</div></div>`;
    }
    const playersHtml = playerRows.length ? playerRows.map(playerRowHtml).join('') : '<div class="lbEmpty">No one has signed in with a name+code yet.</div>';

    // ---- Standard quiz aggregate ----
    let standardBlock = '<div class="lbEmpty">No completed Standard Quiz runs yet.</div>';
    if (standardResults.length) {
      const avgScore = standardResults.reduce((s, r) => s + r.score, 0) / standardResults.length;
      const avgPct = Math.round(avgScore / standardResults[0].total * 100);
      standardBlock = `<div class="adminStatGrid">${statCard(standardResults.length, 'Runs Completed')}${statCard(avgPct + '%', 'Average Score')}</div>`;
    }

    // ---- Timed quiz aggregate ----
    let timedBlock = '<div class="lbEmpty">No completed Timed Quiz runs yet.</div>';
    if (timedResults.length) {
      const times = timedResults.map(r => r.timeMs);
      const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
      timedBlock = `<div class="adminStatGrid">${statCard(timedResults.length, 'Runs Completed')}${statCard(formatClock(avgMs), 'Average Time')}${statCard(formatClock(Math.min(...times)), 'Fastest Time')}${statCard(formatClock(Math.max(...times)), 'Slowest Time')}</div>`;
    }

    // ---- Recent timed sessions ----
    const savedEntries = (timedLbEntries || []).slice();
    function findSavedName(result) {
      const match = savedEntries.find(e => e.timeMs === result.timeMs && e.mistakes === result.mistakes);
      return match ? match.name : null;
    }
    const recentSessions = timedResults.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
    function sessionRowHtml(r) {
      const name = findSavedName(r);
      const nameHtml = name ? `<span style="color:var(--ink)">${escapeHtml(name)}</span>` : `<span style="color:#b03030;font-weight:800">❓ Unsaved</span>`;
      return `<div class="lbRow"><div class="lbRank" style="font-size:10px;width:auto;background:transparent;color:var(--muted)">${fmtWhen(r.date)}</div>
        <div class="lbName">${nameHtml}</div>
        <div class="lbScore">${formatClock(r.timeMs)} • ✗${r.mistakes}</div></div>`;
    }
    const sessionsHtml = recentSessions.length ? recentSessions.map(sessionRowHtml).join('') : '<div class="lbEmpty">No timed sessions yet.</div>';
    const unsavedCount = recentSessions.filter(r => !findSavedName(r)).length;

    // ---- Team-wide Signal difficulty ----
    const bySignal = {};
    signalAttempts.forEach(a => {
      const e = (bySignal[a.signalId] = bySignal[a.signalId] || { attempts: 0, misses: 0 });
      e.attempts++;
      if (!a.correct) e.misses++;
    });
    const signalRows = Object.keys(bySignal).map(id => {
      const s = bySignal[id];
      const card = ALL_CARDS.find(c => c.id === Number(id));
      return card ? { card, attempts: s.attempts, misses: s.misses, missRate: s.misses / s.attempts } : null;
    }).filter(r => r && r.attempts >= 3);
    function signalRowHtml(r) {
      const pct = Math.round((1 - r.missRate) * 100);
      return `<div class="lbRow"><div class="lbRank">#${r.card.id}</div><div class="lbName">${escapeHtml(r.card.meaning)}</div><div class="lbScore">${pct}% (${r.attempts - r.misses}/${r.attempts})</div></div>`;
    }
    const hardestSignals = [...signalRows].filter(r => r.missRate > 0).sort((a, b) => b.missRate - a.missRate).slice(0, 5);
    const easiestSignals = [...signalRows].filter(r => r.missRate === 0).sort((a, b) => b.attempts - a.attempts).slice(0, 5);
    const hardestSignalsHtml = hardestSignals.length ? hardestSignals.map(signalRowHtml).join('') : '<div class="lbEmpty">Not enough team data yet.</div>';
    const easiestSignalsHtml = easiestSignals.length ? easiestSignals.map(signalRowHtml).join('') : '<div class="lbEmpty">Not enough team data yet.</div>';

    // ---- Team-wide Play Call difficulty -- Nathan: "we need... to use it
    // as a coaching tool on what plays are the toughest for the kids to
    // remember." Same shape as Signal difficulty above, but aggregated
    // across every player's Play Calls Quiz attempts instead of one
    // player's -- the per-player "could use extra reps" tip elsewhere
    // (showChildQuizProgress) only ever showed this one player at a time;
    // this is the team-wide version a coach actually needs for practice
    // planning.
    const pcqRoundAttemptsSafe = pcqRoundAttempts || [];
    const byPlayTeam = {};
    pcqRoundAttemptsSafe.forEach(a => {
      const e = (byPlayTeam[a.playKey] = byPlayTeam[a.playKey] || { attempts: 0, misses: 0 });
      e.attempts++;
      if (!a.correct) e.misses++;
    });
    const playRowsTeam = Object.keys(byPlayTeam).map(k => ({
      key: k, label: playLabel(k), attempts: byPlayTeam[k].attempts, misses: byPlayTeam[k].misses,
      missRate: byPlayTeam[k].misses / byPlayTeam[k].attempts,
    })).filter(r => r.attempts >= 3);
    function playRowHtml(r) {
      const pct = Math.round((1 - r.missRate) * 100);
      return `<div class="lbRow"><div class="lbRank" style="font-size:10px;width:auto;background:transparent;">🏈</div><div class="lbName">${escapeHtml(r.label)}</div><div class="lbScore">${pct}% (${r.attempts - r.misses}/${r.attempts})</div></div>`;
    }
    const toughestPlaysTeam = [...playRowsTeam].filter(r => r.missRate > 0).sort((a, b) => b.missRate - a.missRate).slice(0, 5);
    const easiestPlaysTeam = [...playRowsTeam].filter(r => r.missRate === 0).sort((a, b) => b.attempts - a.attempts).slice(0, 5);
    const toughestPlaysHtml = toughestPlaysTeam.length ? toughestPlaysTeam.map(playRowHtml).join('') : '<div class="lbEmpty">Not enough team data yet (needs 3+ attempts on a play).</div>';
    const easiestPlaysHtml = easiestPlaysTeam.length ? easiestPlaysTeam.map(playRowHtml).join('') : '<div class="lbEmpty">Not enough team data yet (needs 3+ attempts on a play).</div>';

    // ---- Player Activity & Highlights ----
    const sessionsSafe = sessions || [];
    const pcqResultsSafe = pcqResults || [];
    const nowMs = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const nonCoachPlayers = playerRows.filter(p => !isCoachRecord(p));

    const activePlayers7d = nonCoachPlayers.filter(p => p.lastSeen && (nowMs - new Date(p.lastSeen).getTime()) <= SEVEN_DAYS_MS).length;
    const sessions7dCount = sessionsSafe.filter(s => s.startedAt && (nowMs - new Date(s.startedAt).getTime()) <= SEVEN_DAYS_MS).length;
    const sessionsWithDuration = sessionsSafe.filter(s => typeof s.durationMs === 'number' && s.durationMs > 0);
    const avgSessionMsTeam = sessionsWithDuration.length ? sessionsWithDuration.reduce((sum, s) => sum + s.durationMs, 0) / sessionsWithDuration.length : 0;
    const totalTeamMs = sessionsWithDuration.reduce((sum, s) => sum + s.durationMs, 0);
    const teamPcqAttempts = pcqResultsSafe.filter(r => r.maxScore);
    const teamPcqAvgPct = teamPcqAttempts.length ? Math.round(teamPcqAttempts.reduce((s, r) => s + r.score / r.maxScore, 0) / teamPcqAttempts.length * 100) : null;

    const pcqByPlayer = {};
    pcqResultsSafe.forEach(r => {
      if (!r.playerId) return;
      (pcqByPlayer[r.playerId] = pcqByPlayer[r.playerId] || []).push(r);
    });
    Object.keys(pcqByPlayer).forEach(id => pcqByPlayer[id].sort((a, b) => new Date(b.date) - new Date(a.date)));

    // Nathan: "don't just look at play quiz scores for that" (Excelling /
    // Needs Attention) -- Standard Quiz and Timed Quiz results are tagged
    // with playerId too (study-quiz.js's currentPlayerTag(), same as PCQ),
    // just never rolled into these two highlight lists before now. Standard
    // Quiz already has a natural score/total %; Timed Quiz only logs a
    // mistake count against the full signal deck, so its % here is
    // accuracy -- (deck size - mistakes) / deck size -- comparable to the
    // other two even though the run itself is about speed.
    const standardResultsSafe = standardResults || [];
    const timedResultsSafe = timedResults || [];
    const standardByPlayer = {};
    standardResultsSafe.forEach(r => {
      if (!r.playerId || !r.total) return;
      (standardByPlayer[r.playerId] = standardByPlayer[r.playerId] || []).push(r.score / r.total);
    });
    const timedDeckSize = (window.ALL_CARDS && window.ALL_CARDS.length) || 0;
    const timedByPlayer = {};
    timedResultsSafe.forEach(r => {
      if (!r.playerId || !timedDeckSize) return;
      const mistakes = typeof r.mistakes === 'number' ? r.mistakes : 0;
      (timedByPlayer[r.playerId] = timedByPlayer[r.playerId] || []).push(Math.max(0, timedDeckSize - mistakes) / timedDeckSize);
    });

    const roundsByPlayer = {};
    pcqRoundAttemptsSafe.forEach(a => {
      if (!a.playerId) return;
      const byKey = (roundsByPlayer[a.playerId] = roundsByPlayer[a.playerId] || {});
      const entry = (byKey[a.playKey] = byKey[a.playKey] || { attempts: 0, misses: 0 });
      entry.attempts++;
      if (!a.correct) entry.misses++;
    });
    function weakestPlayFor(playerId) {
      const byKey = roundsByPlayer[playerId];
      if (!byKey) return null;
      const candidates = Object.keys(byKey).map(k => Object.assign({ key: k, missRate: byKey[k].misses / byKey[k].attempts }, byKey[k])).filter(c => c.attempts >= 2 && c.misses > 0);
      if (!candidates.length) return null;
      candidates.sort((a, b) => b.missRate - a.missRate);
      return playLabel(candidates[0].key);
    }

    // Nathan: "who is spending the most cumulative time on it" -- total
    // (sum), not average, session duration per player. avgSessionMs is
    // kept alongside since it's still useful context (a big total from
    // many short visits reads differently than a few long ones).
    const playerActivityRows = nonCoachPlayers.map(p => {
      const history = pcqByPlayer[p.id] || [];
      const pcqPcts = history.filter(r => r.maxScore).map(r => r.score / r.maxScore);
      // Nathan: "don't just look at play quiz scores for that" -- combined
      // pool of every scored quiz attempt (PCQ + Standard + Timed) this
      // player has, pooled rather than averaged-per-type-then-combined so a
      // player who's done a lot of one quiz type isn't drowned out by a
      // single attempt on another.
      const allPcts = pcqPcts.concat(standardByPlayer[p.id] || [], timedByPlayer[p.id] || []);
      const avgPct = allPcts.length ? Math.round(allPcts.reduce((s, x) => s + x, 0) / allPcts.length * 100) : null;
      const playerSessions = sessionsSafe.filter(s => s.playerId === p.id);
      const playerSessionsWithDur = playerSessions.filter(s => typeof s.durationMs === 'number' && s.durationMs > 0);
      const totalMs = playerSessionsWithDur.reduce((s, x) => s + x.durationMs, 0);
      const avgDur = playerSessionsWithDur.length ? totalMs / playerSessionsWithDur.length : 0;
      return {
        id: p.id, name: p.name, attempts: allPcts.length, avgPct: avgPct,
        sessionsCount: playerSessions.length, avgSessionMs: avgDur, totalSessionMs: totalMs,
        lastSeen: p.lastSeen, history: history.slice(0, 5),
      };
    });

    const MIN_ATTEMPTS_FOR_HIGHLIGHT = 2;
    const eligibleForHighlights = playerActivityRows.filter(p => p.attempts >= MIN_ATTEMPTS_FOR_HIGHLIGHT && p.avgPct !== null);
    // Nathan: "show the top 5 in most time logged - show the top 5 in
    // needs attention - and the 5 in excelling" -- all three capped at 5.
    const excelling = [...eligibleForHighlights].sort((a, b) => b.avgPct - a.avgPct).slice(0, 5);
    const needsAttention = [...eligibleForHighlights].sort((a, b) => a.avgPct - b.avgPct).slice(0, 5);
    // Nathan: "say who is spending the most cumulative time on it" --
    // credit for effort/engagement, separate from who's scoring well.
    const mostTime = playerActivityRows.filter(p => p.totalSessionMs > 0).sort((a, b) => b.totalSessionMs - a.totalSessionMs).slice(0, 5);

    function highlightRowHtml(p, kind) {
      const icon = kind === 'excelling' ? '🌟' : kind === 'time' ? '⏳' : '🧭';
      const weak = kind === 'attention' ? weakestPlayFor(p.id) : null;
      let tip, right;
      if (kind === 'excelling') { tip = `Averaging ${p.avgPct}% across ${p.attempts} quiz attempts.`; right = `${p.avgPct}%`; }
      else if (kind === 'time') { tip = `${p.sessionsCount} visit${p.sessionsCount === 1 ? '' : 's'} logged.`; right = fmtDuration(p.totalSessionMs); }
      else { tip = weak ? `Missing "${weak}" calls most -- worth a few extra reps there.` : `Averaging ${p.avgPct}% across ${p.attempts} quiz attempts -- keep at it!`; right = `${p.avgPct}%`; }
      return `<div class="lbRow"><div class="lbRank">${icon}</div>
        <div class="lbNameTip"><div class="lbNameTipTitle">${escapeHtml(p.name)}</div><div class="lbTip">${tip}</div></div>
        <div class="lbScore">${right}</div></div>`;
    }
    // Nathan: "don't just look at play quiz scores for that" -- avgPct now
    // pools Standard Quiz + Timed Quiz + Play Calls Quiz attempts, so the
    // empty-state copy shouldn't single out PCQ either.
    const excellingHtml = excelling.length ? excelling.map(p => highlightRowHtml(p, 'excelling')).join('') : '<div class="lbEmpty">Not enough quiz data yet (needs at least 2 scored Standard/Timed/Play Calls Quiz attempts per player).</div>';
    const needsAttentionHtml = needsAttention.length ? needsAttention.map(p => highlightRowHtml(p, 'attention')).join('') : '<div class="lbEmpty">Not enough quiz data yet (needs at least 2 scored Standard/Timed/Play Calls Quiz attempts per player).</div>';
    const mostTimeHtml = mostTime.length ? mostTime.map(p => highlightRowHtml(p, 'time')).join('') : '<div class="lbEmpty">No session time logged yet.</div>';

    const activitySorted = playerActivityRows.slice().sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
    function activityRowHtml(p) {
      const historyHtml = p.history.length
        ? p.history.map(h => {
            const pct = h.maxScore ? Math.round(h.score / h.maxScore * 100) : null;
            return `<div class="activityHistoryRow"><span>${fmtWhen(h.date)}</span><span>${h.score}/${h.maxScore}${pct !== null ? ` (${pct}%)` : ''}</span></div>`;
          }).join('')
        : '<div class="activityHistoryRow" style="opacity:.6;">No Play Calls Quiz attempts yet.</div>';
      return `<details class="activityDetails">
        <summary class="lbRow"><div class="lbRank" style="font-size:10px;width:auto;background:transparent;color:var(--muted)">${fmtWhen(p.lastSeen)}</div>
          <div class="lbName">${escapeHtml(p.name)}</div>
          <div class="lbScore" style="font-size:10px;text-align:right;">${p.sessionsCount} visit${p.sessionsCount === 1 ? '' : 's'} • ${fmtDuration(p.totalSessionMs)} total</div></summary>
        <div class="activityHistoryList">${historyHtml}</div>
      </details>`;
    }
    const activityListHtml = activitySorted.length ? activitySorted.map(activityRowHtml).join('') : '<div class="lbEmpty">No one has signed in with a name+code yet.</div>';

    // ---- Account Setup -- Nathan: "as a coach, I should be able to choose
    // any of the players on the team and see who doesn't have an account
    // setup." Cross-references teamRoster (the coach-managed name/#/
    // position list) against dev2Players accounts, preferring the explicit
    // loginPlayerId link set in Coach Tools > Roster over the same
    // name-matching fallback used everywhere else in this app.
    const playersById = players;
    const playersByName = {};
    Object.keys(players).forEach(id => {
      const p = players[id];
      if (isCoachRecord(p)) return;
      const key = norm(p.name);
      if (key && !playersByName[key]) playersByName[key] = Object.assign({ id }, p);
    });
    function linkedAccountFor(rp) {
      if (rp.loginPlayerId && playersById[rp.loginPlayerId]) return Object.assign({ id: rp.loginPlayerId }, playersById[rp.loginPlayerId]);
      const byName = playersByName[norm(rp.name)];
      return byName || null;
    }
    const rosterCrossRef = (roster || []).filter(rp => !isCoachName(rp.name)).map(rp => {
      const linked = linkedAccountFor(rp);
      const hasActivity = linked ? (sessionsSafe.some(s => s.playerId === linked.id) || pcqResultsSafe.some(r => r.playerId === linked.id)) : false;
      return Object.assign({}, rp, { linked, hasActivity });
    });
    const noAccount = rosterCrossRef.filter(rp => !rp.linked);
    const hasAccount = rosterCrossRef.filter(rp => rp.linked);
    // Nathan: "Show the overall usage rate but don't include coaches." %
    // of the (coach-excluded) roster that's both linked to an account AND
    // has real recorded activity -- a linked-but-never-opened account
    // shouldn't count as "using it."
    const usageRatePct = rosterCrossRef.length
      ? Math.round(rosterCrossRef.filter(rp => rp.linked && rp.hasActivity).length / rosterCrossRef.length * 100)
      : null;
    function accountRowHtml(rp, missing) {
      const numTag = rp.num ? `#${escapeHtml(String(rp.num))} ` : '';
      const right = missing
        ? '<span style="color:#b03030;font-weight:800">🚫 No account</span>'
        : (rp.hasActivity ? '<span style="color:#2e8b2e;font-weight:800">✅ Active</span>' : '<span style="opacity:.6">Linked, no activity yet</span>');
      return `<div class="lbRow"><div class="lbName">${numTag}${escapeHtml(rp.name)}${rp.position ? ` <span style="opacity:.6">${escapeHtml(rp.position)}</span>` : ''}</div><div class="lbScore" style="font-size:11px;">${right}</div></div>`;
    }
    const noAccountHtml = noAccount.length ? noAccount.map(rp => accountRowHtml(rp, true)).join('') : '<div class="lbEmpty">Everyone on the roster has a linked account. 🎉</div>';
    const hasAccountHtml = hasAccount.length ? hasAccount.map(rp => accountRowHtml(rp, false)).join('') : '<div class="lbEmpty">No roster players linked yet.</div>';
    // "Not Using It" for the Activity panel: no account at all, OR linked
    // but genuinely zero recorded activity -- the two different reasons a
    // player wouldn't be showing up anywhere else on this dashboard.
    const notUsingIt = rosterCrossRef.filter(rp => !rp.linked || !rp.hasActivity);
    const notUsingItHtml = notUsingIt.length
      ? notUsingIt.map(rp => `<div class="lbRow"><div class="lbName">${escapeHtml(rp.name)}</div><div class="lbScore" style="font-size:11px;opacity:.75;">${rp.linked ? 'No activity yet' : 'No account set up'}</div></div>`).join('')
      : '<div class="lbEmpty">Everyone on the roster is using the app. 🎉</div>';

    // ---- On Leaderboard, Not Registered -- Nathan: "there are also some
    // kids who are on the leaderboard who have used the app but haven't
    // signed in recently and registered on the new version." Quiz Scores/
    // Timed Quiz leaderboard entries are just a freely-typed name (see
    // study-quiz.js) with no real account link, so a name can be sitting
    // on a board from before the dev2Players login system existed (or from
    // someone who never re-signed-in since) with no matching current
    // account at all -- different problem from "no activity yet" above,
    // since these kids clearly HAVE used the app, just not the current
    // named-login version of it.
    const registeredNames = new Set(playerRows.map(p => norm(p.name)));
    const legacyNames = new Map();
    [...(quizLbEntries || []), ...(timedLbEntries || [])].forEach(e => {
      const key = norm(e && e.name);
      if (key && !legacyNames.has(key)) legacyNames.set(key, e.name);
    });
    const staleLeaderboardNames = [...legacyNames.entries()]
      .filter(([key, name]) => !registeredNames.has(key) && !isCoachName(name))
      .map(([, name]) => name)
      .sort((a, b) => a.localeCompare(b));
    const staleLeaderboardHtml = staleLeaderboardNames.length
      ? staleLeaderboardNames.map(name => `<div class="lbRow"><div class="lbName">${escapeHtml(name)}</div><div class="lbScore" style="font-size:11px;opacity:.75;">On a leaderboard, no current account</div></div>`).join('')
      : '<div class="lbEmpty">No stale leaderboard names found.</div>';

    // ---- Shell ----
    body.innerHTML = `
      <div id="coachDashHome">
        <div class="adminStatGrid">
          ${statCard(timedStarts.length, 'Timed Quiz Starts')}
          ${statCard(standardStarts.length, 'Standard Quiz Starts')}
        </div>
        <div class="adminDashGrid">
          <button class="adminDashBtn" data-panel="activity">📈 Player Activity &amp; Highlights</button>
          <button class="adminDashBtn" data-panel="accounts">🧾 Account Setup${noAccount.length ? `<span class="adminDashCount">${noAccount.length} missing</span>` : ''}</button>
          <button class="adminDashBtn" data-panel="players">👤 Registered Players<span class="adminDashCount">${playerRows.length}</span></button>
          <button class="adminDashBtn" data-panel="difficulty">🎯 Difficulty (Signals &amp; Plays)</button>
          <button class="adminDashBtn" data-panel="standard">📝 Standard Quiz</button>
          <button class="adminDashBtn" data-panel="timed">⏱️ Timed Quiz</button>
          <button class="adminDashBtn" data-panel="sessions">🕓 Recent Sessions${unsavedCount ? `<span class="adminDashCount">${unsavedCount} unsaved</span>` : ''}</button>
        </div>
      </div>
      <button class="navBtn secondary adminBackBtn" id="coachDashBackBtn" style="display:none;">‹ Back to Dashboard</button>
      <div class="adminPanel" data-panel="activity" style="display:none;">
        <div class="lbSectionHeader">📈 Team Snapshot</div>
        <div class="adminStatGrid">
          ${statCard(usageRatePct !== null ? usageRatePct + '%' : '—', 'Usage Rate')}
          ${statCard(activePlayers7d, 'Active Players (7d)')}
          ${statCard(sessions7dCount, 'Visits (7d)')}
          ${statCard(fmtDuration(totalTeamMs), 'Total Team Time')}
          ${statCard(teamPcqAvgPct !== null ? teamPcqAvgPct + '%' : '—', 'Team PCQ Avg')}
        </div>
        <div class="lbSectionHeader">🌟 Excelling</div>
        <div class="lbList">${excellingHtml}</div>
        <div class="lbSectionHeader">⏳ Most Time Logged</div>
        <div class="lbList">${mostTimeHtml}</div>
        <div class="lbSectionHeader">🧭 Needs Attention</div>
        <div class="lbList">${needsAttentionHtml}</div>
        <div class="lbSectionHeader">😴 Not Using It</div>
        <div class="lbList">${notUsingItHtml}</div>
        <div class="lbSectionHeader">🕰️ On Leaderboard, Not Registered</div>
        <div class="lbList">${staleLeaderboardHtml}</div>
        <div class="lbSectionHeader">🕓 Every Player</div>
        <div class="lbList" style="max-height:340px;overflow-y:auto;">${activityListHtml}</div>
        <div class="lbSub" style="margin:8px 0 12px;">Tap a player to see their recent Play Calls Quiz history. Highlights need at least 2 scored attempts per player. Visits/session length only cover time since that tracking shipped -- nothing before that was tracked. "On Leaderboard, Not Registered" names have a Quiz Scores or Timed Quiz entry but no matching current account -- ask them to sign in again with a name + PIN on this version.</div>
      </div>
      <div class="adminPanel" data-panel="accounts" style="display:none;">
        <div class="lbSectionHeader">🚫 No Account Set Up (${noAccount.length})</div>
        <div class="lbList">${noAccountHtml}</div>
        <div class="lbSectionHeader">✅ Linked (${hasAccount.length})</div>
        <div class="lbList" style="max-height:300px;overflow-y:auto;">${hasAccountHtml}</div>
        <div class="lbSub" style="margin-top:8px;">Matched by an explicit link set in Coach Tools &gt; Roster, or by name if none was set. Fix a mismatch or missing link from Coach Tools &gt; Roster.</div>
      </div>
      <div class="adminPanel" data-panel="players" style="display:none;">
        <div class="lbSectionHeader">👤 Registered Players (${playerRows.length})</div>
        <div class="lbList" style="max-height:340px;overflow-y:auto;">${playersHtml}</div>
        <div class="lbSub" style="margin:2px 0 12px;">Sorted by most recently active. 🧠 column is each player's Play Calls Quiz personal best (Study/Timed Quiz aren't tied to player IDs yet).</div>
      </div>
      <div class="adminPanel" data-panel="difficulty" style="display:none;">
        <div class="lbSectionHeader">🥵 Hardest Signals (team-wide)</div>
        <div class="lbList">${hardestSignalsHtml}</div>
        <div class="lbSectionHeader">😎 Easiest Signals (team-wide)</div>
        <div class="lbList">${easiestSignalsHtml}</div>
        <div class="lbSectionHeader">🏈 Toughest Play Calls (team-wide)</div>
        <div class="lbList">${toughestPlaysHtml}</div>
        <div class="lbSectionHeader">✅ Easiest Play Calls (team-wide)</div>
        <div class="lbList">${easiestPlaysHtml}</div>
        <div class="lbSub">Needs at least 3 team-wide attempts to show. Use the toughest lists to steer practice reps.</div>
      </div>
      <div class="adminPanel" data-panel="standard" style="display:none;">
        <div class="lbSectionHeader">📝 Standard Quiz</div>
        ${standardBlock}
        <div class="lbSub">Starts count every attempt, even if never finished.</div>
      </div>
      <div class="adminPanel" data-panel="timed" style="display:none;">
        <div class="lbSectionHeader">⏱️ Timed Quiz</div>
        ${timedBlock}
        <div class="lbSub">Starts count every attempt, even if never finished.</div>
      </div>
      <div class="adminPanel" data-panel="sessions" style="display:none;">
        <div class="lbSectionHeader">🕓 Recent Timed Sessions${unsavedCount ? ` (${unsavedCount} unsaved)` : ''}</div>
        <div class="lbList">${sessionsHtml}</div>
        <div class="lbSub">"Unsaved" means someone completed a timed run but never entered a name on the leaderboard.</div>
      </div>`;

    const homeEl = body.querySelector('#coachDashHome');
    const backBtn = body.querySelector('#coachDashBackBtn');
    const panels = [...body.querySelectorAll('.adminPanel')];
    body.querySelectorAll('.adminDashBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        homeEl.style.display = 'none';
        backBtn.style.display = '';
        panels.forEach(p => { p.style.display = (p.dataset.panel === btn.dataset.panel) ? '' : 'none'; });
      });
    });
    body.querySelectorAll('.pcqResetBtn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.playerId;
        const name = btn.dataset.playerName;
        if (!confirm(`Clear ${name}'s Play Calls Quiz score? This can't be undone.`)) return;
        btn.disabled = true;
        btn.textContent = '…';
        try {
          await window.PlayerIdentity.resetQuizStats(id);
          await window.initCoachToolsDashboard();
          const playersBtnAgain = body.querySelector('.adminDashBtn[data-panel="players"]');
          if (playersBtnAgain) playersBtnAgain.dispatchEvent(new Event('click'));
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'Reset';
          alert('Could not reach the team server -- try again.');
        }
      });
    });
    backBtn.addEventListener('click', () => {
      homeEl.style.display = '';
      backBtn.style.display = 'none';
      panels.forEach(p => { p.style.display = 'none'; });
    });
  };
})();

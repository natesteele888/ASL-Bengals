// Final-week scenarios for the Standings tab -- Nathan: "with this being the
// last game of the regular season - build out some scenarios in the standings
// section showing where the ASL Bengals may finish in the standings based on
// some results of the top 6 teams."
//
// Two halves in this one file:
//   1. The ENGINE: takes the league's own master-schedule payload (the same
//      CMYFCC response js/standings.js already reads), re-computes the whole
//      division's table under any set of results for the games still to play,
//      and ranks it with the league's OWN published rules (payload.
//      standingsPolicy) -- winning percentage first; a two-team tie goes to
//      head-to-head, then CMYFCC points, then a coin flip; a tie of three or
//      more goes to CMYFCC points, then head-to-head if that leaves exactly
//      two, then a coin flip. CMYFCC points are 10 per win and 5 per tie, plus
//      2 for every win each beaten opponent finished with (1 for each tied
//      opponent's wins). Pure functions with no DOM, so Node can load this file
//      and check it against the league's published standings.
//   2. The SCREEN (further down): the "Final Week Scenarios" panel on the
//      Standings tab.
//
// Why this isn't js/standings.js's simulatePlayoffOdds: that one ranks by raw
// win/tie points with a random tiebreak (it says so in its own comment) and
// answers "how likely"; this one answers "what happens if", so it has to get
// the real tiebreakers right -- a team's CMYFCC points move with OTHER teams'
// results, which is exactly what decides a seed when two teams finish level.
/* global module */
(function (root) {
  'use strict';

  const OUR_NAME = 'Ayer/Shirley/Lunenburg';
  const DEFAULT_POLICY = {
    basePoints: { win: 10, tie: 5, loss: 0 },
    opponentWinPoints: { beatenOpponent: 2, tiedOpponent: 1 },
  };

  // ---------------------------------------------------------------------
  // League model
  // ---------------------------------------------------------------------

  // payload: the CMYFCC master schedule (result.games / .standings /
  // .standingsPolicy / .playoffProjection). One division's slice of it, with
  // every team and game reduced to what the table math needs.
  function buildLeague(payload, divisionKey) {
    const games = (payload.games || []).filter((g) => g.divisionKey === divisionKey);
    const standings = (Array.isArray(payload.standings) ? payload.standings : Object.values(payload.standings || {}))
      .filter((s) => s.divisionKey === divisionKey);
    const teams = [];
    const index = {};
    function teamIndex(name, id) {
      if (!(name in index)) { index[name] = teams.length; teams.push({ name, id: id || name }); }
      return index[name];
    }
    // Standings rows first so every team exists even before it plays.
    standings.forEach((s) => teamIndex(s.associationName, s.teamId));
    const out = [];
    games.forEach((g) => {
      if (!g.homeTeam || !g.awayTeam) return;
      const r = g.result;
      const final = !!(r && r.status === 'final');
      out.push({
        id: g.id,
        week: g.week,
        date: (g.logistics && g.logistics.date) || null,
        time: (g.logistics && g.logistics.kickoffTime) || null,
        h: teamIndex(g.homeTeam.associationName, g.homeTeamId),
        a: teamIndex(g.awayTeam.associationName, g.awayTeamId),
        final,
        hs: final ? r.homeScore : null,
        as: final ? r.awayScore : null,
      });
    });
    const policy = payload.standingsPolicy || {};
    const base = Object.assign({}, DEFAULT_POLICY.basePoints, policy.basePoints || {});
    const opp = Object.assign({}, DEFAULT_POLICY.opponentWinPoints, policy.opponentWinPoints || {});
    const proj = (payload.playoffProjection || []).find((p) => p.divisionKey === divisionKey);
    return {
      divisionKey,
      teams,
      index,
      games: out,
      remaining: out.filter((g) => !g.final),
      points: { win: base.win, tie: base.tie, beaten: opp.beatenOpponent, tiedOpp: opp.tiedOpponent },
      brackets: bracketShape(proj),
      published: standings.map((s) => ({ name: s.associationName, rank: s.rank, record: s.record, points: s.standingsPoints, tiebreaker: s.tiebreaker || null })),
      policyNote: policy.status && policy.status !== 'final' && policy.note ? policy.note : null,
    };
  }

  // The league's own bracket description, reduced to what a finishing place
  // means: which bracket (Division 1 = overall places 1-6, Division 2 = 7-12),
  // the seed in it, and what that seed plays first.
  function bracketShape(proj) {
    const list = proj && Array.isArray(proj.brackets) ? proj.brackets : [];
    if (!list.length) return [{ label: 'Division 1', size: 6, byes: [1, 2], openingRound: [{ homeSeed: 3, awaySeed: 6 }, { homeSeed: 4, awaySeed: 5 }] }, { label: 'Division 2', size: 6, byes: [1, 2], openingRound: [{ homeSeed: 3, awaySeed: 6 }, { homeSeed: 4, awaySeed: 5 }] }];
    return list.map((b) => ({
      label: b.label || ('Division ' + b.division),
      size: Array.isArray(b.seeds) ? b.seeds.length : 6,
      byes: Array.isArray(b.byes) ? b.byes : [],
      openingRound: Array.isArray(b.openingRound) ? b.openingRound : [],
    }));
  }

  // What an overall finishing place means in the bracket.
  function placeMeaning(league, place) {
    let offset = 0;
    for (let b = 0; b < league.brackets.length; b++) {
      const br = league.brackets[b];
      if (place <= offset + br.size) {
        const seed = place - offset;
        let text;
        if (br.byes.indexOf(seed) !== -1) {
          text = 'a first-round bye';
        } else {
          const match = br.openingRound.find((m) => m.homeSeed === seed || m.awaySeed === seed);
          if (match) {
            const home = match.homeSeed === seed;
            text = (home ? 'hosts' : 'visits') + ' the #' + (home ? match.awaySeed : match.homeSeed) + ' seed in the opening round';
          } else {
            text = 'in the bracket';
          }
        }
        return { bracket: b + 1, label: br.label, seed, text };
      }
      offset += br.size;
    }
    return { bracket: null, label: null, seed: null, text: 'outside both brackets' };
  }

  // ---------------------------------------------------------------------
  // Table + ranking
  // ---------------------------------------------------------------------

  // outcomes: { [gameId]: 'H' | 'A' | 'T' } for games not yet final (home win,
  // away win, tie). A game with neither a final result nor an outcome is
  // treated as unplayed.
  function evaluate(league, outcomes) {
    const n = league.teams.length;
    const w = new Array(n).fill(0), l = new Array(n).fill(0), t = new Array(n).fill(0);
    const decided = [];
    for (let k = 0; k < league.games.length; k++) {
      const g = league.games[k];
      let res = null;
      if (g.final) res = g.hs > g.as ? 'H' : (g.hs < g.as ? 'A' : 'T');
      else if (outcomes) res = outcomes[g.id] || null;
      if (!res) continue;
      decided.push([g.h, g.a, res]);
      if (res === 'H') { w[g.h]++; l[g.a]++; }
      else if (res === 'A') { w[g.a]++; l[g.h]++; }
      else { t[g.h]++; t[g.a]++; }
    }
    const P = league.points;
    const pts = new Array(n);
    for (let i = 0; i < n; i++) pts[i] = P.win * w[i] + P.tie * t[i];
    for (let k = 0; k < decided.length; k++) {
      const h = decided[k][0], a = decided[k][1], res = decided[k][2];
      if (res === 'H') pts[h] += P.beaten * w[a];
      else if (res === 'A') pts[a] += P.beaten * w[h];
      else { pts[h] += P.tiedOpp * w[a]; pts[a] += P.tiedOpp * w[h]; }
    }
    const gp = w.map((x, i) => x + l[i] + t[i]);
    const rows = [];
    for (let i = 0; i < n; i++) rows.push({ i, name: league.teams[i].name, w: w[i], l: l[i], t: t[i], gp: gp[i], pts: pts[i] });

    // 1. winning percentage ((wins + half the ties) / games played), compared
    //    by cross-multiplying so a team with a game more or less in hand is
    //    ranked fairly.
    const num = (r) => 2 * r.w + r.t;
    const cmpPct = (a, b) => {
      const da = 2 * a.gp, db = 2 * b.gp;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return num(b) * da - num(a) * db;     // negative: a ahead of b
    };
    const sorted = rows.slice().sort(cmpPct);
    const groups = [];
    for (let k = 0; k < sorted.length; k++) {
      if (k > 0 && cmpPct(sorted[k - 1], sorted[k]) === 0) groups[groups.length - 1].push(sorted[k]);
      else groups.push([sorted[k]]);
    }

    function headToHead(a, b) {            // > 0: a ahead, < 0: b ahead, 0: not separated
      let aw = 0, bw = 0;
      for (let k = 0; k < decided.length; k++) {
        const h = decided[k][0], x = decided[k][1], res = decided[k][2];
        if (!((h === a && x === b) || (h === b && x === a))) continue;
        if (res === 'T') continue;
        const winner = res === 'H' ? h : x;
        if (winner === a) aw++; else bw++;
      }
      return aw - bw;
    }

    // 2. ties inside a group of equal percentage. Each result entry is a "slot":
    //    one team, or several that only a coin flip can separate.
    function resolve(group) {
      if (group.length === 1) return [{ teams: [group[0]], coin: false, rule: null }];
      if (group.length === 2) {
        const a = group[0], b = group[1];
        const hh = headToHead(a.i, b.i);
        if (hh !== 0) {
          const first = hh > 0 ? a : b, second = hh > 0 ? b : a;
          return [{ teams: [first], coin: false, rule: 'head-to-head', vs: second }, { teams: [second], coin: false, rule: 'head-to-head', vs: first }];
        }
        if (a.pts !== b.pts) {
          const first = a.pts > b.pts ? a : b, second = a.pts > b.pts ? b : a;
          return [{ teams: [first], coin: false, rule: 'cmyfcc-points', vs: second }, { teams: [second], coin: false, rule: 'cmyfcc-points', vs: first }];
        }
        return [{ teams: [a, b], coin: true, rule: 'coin-flip' }];
      }
      // three or more: CMYFCC points; head-to-head only if that leaves exactly two level
      const byPts = {};
      group.forEach((r) => { (byPts[r.pts] = byPts[r.pts] || []).push(r); });
      const levels = Object.keys(byPts).map(Number).sort((x, y) => y - x);
      const out = [];
      levels.forEach((p) => {
        const sub = byPts[p];
        if (sub.length === 1) out.push({ teams: [sub[0]], coin: false, rule: 'cmyfcc-points', multi: group });
        else if (sub.length === 2) {
          const hh = headToHead(sub[0].i, sub[1].i);
          if (hh !== 0) {
            const first = hh > 0 ? sub[0] : sub[1], second = hh > 0 ? sub[1] : sub[0];
            out.push({ teams: [first], coin: false, rule: 'head-to-head', vs: second, multi: group });
            out.push({ teams: [second], coin: false, rule: 'head-to-head', vs: first, multi: group });
          } else out.push({ teams: sub, coin: true, rule: 'coin-flip', multi: group });
        } else out.push({ teams: sub, coin: true, rule: 'coin-flip', multi: group });
      });
      return out;
    }

    const order = [];
    let place = 1;
    groups.forEach((grp) => {
      const tiedGroup = grp.length > 1 ? grp : null;
      resolve(grp).forEach((slot) => {
        slot.teams.forEach((r) => {
          order.push({ row: r, place, placeHi: place + slot.teams.length - 1, coin: slot.coin, rule: slot.rule, vs: slot.vs || null, tiedWith: tiedGroup });
        });
        place += slot.teams.length;
      });
    });
    const placeOf = new Array(n), placeHiOf = new Array(n), coinOf = new Array(n);
    order.forEach((o) => { placeOf[o.row.i] = o.place; placeHiOf[o.row.i] = o.placeHi; coinOf[o.row.i] = o.coin; });
    return { rows, order, placeOf, placeHiOf, coinOf };
  }

  // ---------------------------------------------------------------------
  // Scenarios for one team
  // ---------------------------------------------------------------------

  // Which games decide the top of the table. A game is a "key game" when it
  // involves one of the teams currently in the first `cut` places (the top 6
  // who make Division 1, plus the first team outside them, since that team is
  // one result away from bumping someone) or the team we're analyzing; every
  // other unplayed game is an "other game" -- never shown as a choice, but
  // still enumerated so its effect on a CMYFCC-points tiebreak is never guessed.
  function splitGames(league, targetName, cut) {
    const now = evaluate(league, null);
    const near = new Set();
    now.order.forEach((o) => { if (o.place <= cut) near.add(o.row.i); });
    const target = league.index[targetName];
    near.add(target);
    const key = [], other = [];
    league.remaining.forEach((g) => { (near.has(g.h) || near.has(g.a) ? key : other).push(g); });
    return { key, other, now, near: Array.from(near) };
  }

  const KEY_STATES = ['H', 'T', 'A'];       // home win, tie, away win
  const OTHER_STATES = ['H', 'A'];

  // One pass over every way the unplayed games can end: each key game three
  // ways (win / tie / loss), each other game two ways. For every combination
  // it records the place range (lo..hi: a coin-flip group spans several
  // places) of the team we're analyzing plus the other teams in
  // `trackedNames`, so any "what if I pick these results?" question after that
  // is a cheap filter over this table instead of a fresh season of math.
  // `key` games are the ones the screen lets you pick; `other` games can only
  // matter through a CMYFCC-points tiebreak, but are still enumerated so that
  // is never guessed.
  function buildCube(league, targetName, key, other, trackedNames) {
    const tracked = [league.index[targetName]];
    (trackedNames || []).forEach((nm) => {
      const i = typeof nm === 'number' ? nm : league.index[nm];
      if (i != null && tracked.indexOf(i) === -1) tracked.push(i);
    });
    const T = tracked.length, K = key.length, O = other.length;
    const kN = Math.pow(3, K), oN = Math.pow(2, O);
    const lo = new Uint8Array(kN * oN * T), hi = new Uint8Array(kN * oN * T), flip = new Uint8Array(kN * oN);
    const outcomes = {};
    for (let kc = 0; kc < kN; kc++) {
      let r = kc;
      for (let k = 0; k < K; k++) { outcomes[key[k].id] = KEY_STATES[r % 3]; r = (r / 3) | 0; }
      for (let oc = 0; oc < oN; oc++) {
        let q = oc;
        for (let o = 0; o < O; o++) { outcomes[other[o].id] = OTHER_STATES[q & 1]; q >>= 1; }
        const ev = evaluate(league, outcomes);
        const idx = kc * oN + oc, base = idx * T;
        for (let t = 0; t < T; t++) { lo[base + t] = Math.min(ev.placeOf[tracked[t]], 255); hi[base + t] = Math.min(ev.placeHiOf[tracked[t]], 255); }
        flip[idx] = ev.coinOf[tracked[0]] ? 1 : 0;
      }
    }
    return { league, target: tracked[0], tracked, key, other, K, O, kN, oN, lo, hi, flip };
  }

  const KEY_DIGIT = { H: 0, T: 1, A: 2 };
  const OTHER_DIGIT = { H: 0, A: 1 };

  function expandDigits(digitLists, base) {
    let list = [0], mult = 1;
    digitLists.forEach((ds) => {
      const next = [];
      list.forEach((v) => ds.forEach((d) => next.push(v + d * mult)));
      list = next;
      mult *= base;
    });
    return list;
  }

  // sel: { key: [state|null per key game], other: [state|null per other game], noTies }
  // -- a null means "any result". noTies leaves unpicked key games as win/loss only.
  function allowed(cube, sel) {
    sel = sel || {};
    const keyDigits = cube.key.map((g, k) => {
      const s = sel.key && sel.key[k];
      return s ? [KEY_DIGIT[s]] : (sel.noTies ? [0, 2] : [0, 1, 2]);
    });
    const otherDigits = cube.other.map((g, o) => {
      const s = sel.other && sel.other[o];
      return s ? [OTHER_DIGIT[s]] : [0, 1];
    });
    return { kcs: expandDigits(keyDigits, 3), ocs: expandDigits(otherDigits, 2) };
  }

  function decodeKey(cube, kc) {
    const o = {};
    let r = kc;
    cube.key.forEach((g) => { o[g.id] = KEY_STATES[r % 3]; r = (r / 3) | 0; });
    return o;
  }
  function decodeOther(cube, oc) {
    const o = {};
    let q = oc;
    cube.other.forEach((g) => { o[g.id] = OTHER_STATES[q & 1]; q >>= 1; });
    return o;
  }

  // Everything the table says about the tracked teams under a selection.
  function summarize(cube, sel) {
    const { kcs, ocs } = allowed(cube, sel);
    const T = cube.tracked.length;
    const mins = new Array(T).fill(255), maxs = new Array(T).fill(0);
    const counts = {};
    let flips = 0, total = 0, othersMatter = false;
    kcs.forEach((kc) => {
      let first = null;
      ocs.forEach((oc) => {
        const idx = kc * cube.oN + oc, base = idx * T;
        for (let t = 0; t < T; t++) {
          if (cube.lo[base + t] < mins[t]) mins[t] = cube.lo[base + t];
          if (cube.hi[base + t] > maxs[t]) maxs[t] = cube.hi[base + t];
        }
        total++;
        if (cube.flip[idx]) flips++;
        const sig = cube.lo[base] + ':' + cube.hi[base];
        if (first === null) first = sig; else if (sig !== first) othersMatter = true;
        for (let p = cube.lo[base]; p <= cube.hi[base]; p++) counts[p] = (counts[p] || 0) + 1;
      });
    });
    return { total, keyCombos: kcs.length, mins, maxs, counts, flips, othersMatter };
  }

  // The unpicked games whose result would still change where the target ends up.
  function sensitiveGames(cube, sel) {
    const base = summarize(cube, sel);
    const sig = (s) => s.mins[0] + ':' + s.maxs[0] + ':' + JSON.stringify(s.counts);
    const out = { key: [], other: [] };
    cube.key.forEach((g, k) => {
      if (sel.key && sel.key[k]) return;
      const sigs = KEY_STATES.filter((st) => !(sel.noTies && st === 'T')).map((st) => {
        const key = (sel.key || cube.key.map(() => null)).slice(); key[k] = st;
        return sig(summarize(cube, Object.assign({}, sel, { key })));
      });
      if (new Set(sigs).size > 1) out.key.push(k);
    });
    cube.other.forEach((g, o) => {
      if (sel.other && sel.other[o]) return;
      const sigs = OTHER_STATES.map((st) => {
        const other = (sel.other || cube.other.map(() => null)).slice(); other[o] = st;
        return sig(summarize(cube, Object.assign({}, sel, { other })));
      });
      if (new Set(sigs).size > 1) out.other.push(o);
    });
    out.base = base;
    return out;
  }

  function shortName(league, i) {
    const nm = typeof i === 'number' ? league.teams[i].name : i;
    return nm === OUR_NAME ? 'Bengals' : nm.split('/')[0];
  }
  function recordText(r) { return r.w + '-' + r.l + (r.t ? '-' + r.t : ''); }

  // What a place is worth, in plain words: 'bye' | 'home' | 'road' | 'div2'.
  function placeKind(league, place) {
    const m = placeMeaning(league, place);
    if (m.bracket !== 1) return 'div2';
    if (m.text.indexOf('bye') !== -1) return 'bye';
    if (m.text.indexOf('hosts') !== -1) return 'home';
    return 'road';
  }
  const KIND_LABEL = { bye: 'Bye', home: 'Home game', road: 'Road game', div2: 'Division 2' };
  function rangeKinds(league, lo, hi) {
    const seen = [];
    for (let p = lo; p <= hi; p++) { const k = placeKind(league, p); if (seen.indexOf(k) === -1) seen.push(k); }
    return seen;
  }

  // The quick-look table. Its axes are the games of the teams right around
  // us in the standings -- the two nearest teams ABOVE us (their results are
  // what decide a bye) pick the rows, the nearest team BELOW us picks the
  // columns -- and the block we're in is our own result. Every cell is the
  // range of places we can land in for that win/loss pattern, over every
  // result of the games that aren't on an axis (ties left out). Falls back to
  // whatever key games exist when we're at the very top or have no game left.
  function quickTable(cube, now) {
    const me = cube.target;
    const myPlace = now.placeOf[me];
    const ourK = cube.key.findIndex((g) => g.h === me || g.a === me);
    const gameOfTeam = (i) => cube.key.findIndex((g, k) => k !== ourK && (g.h === i || g.a === i));
    const near = cube.tracked.filter((i) => i !== me).map((i) => ({ i, place: now.placeOf[i] }));
    const above = near.filter((x) => x.place < myPlace).sort((x, y) => y.place - x.place);
    const below = near.filter((x) => x.place >= myPlace).sort((x, y) => x.place - y.place);
    const used = [];
    const take = (list) => { for (const x of list) { const k = gameOfTeam(x.i); if (k >= 0 && used.indexOf(k) === -1) { used.push(k); return k; } } return -1; };
    const rowAxes = [];
    for (let n = 0; n < 2; n++) { let k = take(above); if (k < 0) k = take(below); if (k >= 0) rowAxes.push(k); }
    let colAxis = take(below);
    if (colAxis < 0) colAxis = take(above);
    if (colAxis < 0) {
      const spare = cube.key.findIndex((g, k) => k !== ourK && used.indexOf(k) === -1);
      if (spare >= 0) { colAxis = spare; used.push(spare); }
    }
    const blocks = ourK >= 0 ? ['W', 'L'] : [null];
    const rowCombos = 1 << rowAxes.length;
    const out = blocks.map((blk) => {
      const rows = [];
      for (let rc = 0; rc < rowCombos; rc++) {
        const cells = [];
        for (let cc = 0; cc < (colAxis >= 0 ? 2 : 1); cc++) {
          const key = cube.key.map(() => null);
          const rowStates = rowAxes.map((k, n) => { const st = ((rc >> (rowAxes.length - 1 - n)) & 1) ? 'A' : 'H'; key[k] = st; return st; });
          let colState = null;
          if (colAxis >= 0) { colState = cc ? 'A' : 'H'; key[colAxis] = colState; }
          if (ourK >= 0) key[ourK] = (blk === 'W') === (cube.key[ourK].h === me) ? 'H' : 'A';
          const sm = summarize(cube, { key, noTies: true });
          cells.push({ lo: sm.mins[0], hi: sm.maxs[0], flips: sm.flips, total: sm.total, othersMatter: sm.othersMatter, key, rowStates, colState });
        }
        rows.push({ rowStates: rowAxes.map((k, n) => ((rc >> (rowAxes.length - 1 - n)) & 1) ? 'A' : 'H'), cells });
      }
      return { block: blk, rows };
    });
    return { ourK, rowAxes, colAxis, blocks: out };
  }

  // The paragraph that says how a tie at the target's record gets settled in a
  // scenario. evs: the evaluations of that scenario under every combination of
  // the games that weren't picked (just one when they all were). When those
  // other results can change the order, the numbers are shown as ranges and the
  // text says the outcome hangs on them instead of naming a winner.
  function tieStory(league, evs, i) {
    const first = evs[0];
    const o = first.order.find((x) => x.row.i === i);
    if (!o || !o.tiedWith) return null;
    const rec = recordText(o.row);
    const place = (e, j) => e.placeOf[j] + ':' + e.placeHiOf[j];
    const settled = evs.every((e) => place(e, i) === place(first, i));
    const ptsOf = (j) => {
      let lo = Infinity, hi = -Infinity;
      evs.forEach((e) => { const p = e.rows[j].pts; if (p < lo) lo = p; if (p > hi) hi = p; });
      return lo === hi ? String(lo) : lo + '–' + hi;
    };
    const me = shortName(league, i);
    const nm = (r) => (r.i === i ? me : shortName(league, r.i));
    const mates = o.tiedWith.filter((x) => x.i !== i);
    if (mates.length === 1) {
      const m = mates[0];
      const mo = first.order.find((x) => x.row.i === m.i);
      const meAhead = o.place < mo.place;
      if (o.rule === 'head-to-head') {
        const winner = meAhead ? me : nm(m), loser = meAhead ? nm(m) : me;
        return `Level with ${nm(m)} at ${rec}. The league looks at head-to-head first: ${winner} beat ${loser} this season.`;
      }
      if (o.rule === 'cmyfcc-points' || !settled) {
        const verdict = settled ? (meAhead ? ' — we\'re ahead' : ' — they\'re ahead') : ' — it hangs on results in other games';
        return `Level with ${nm(m)} at ${rec} and they haven't played each other, so CMYFCC points decide: ${me} ${ptsOf(i)} · ${nm(m)} ${ptsOf(m.i)}${verdict}.`;
      }
      return `Level with ${nm(m)} at ${rec} on record and on CMYFCC points (${ptsOf(i)} each) — only a coin flip separates them.`;
    }
    const list = o.tiedWith.map((r) => `${nm(r)} ${ptsOf(r.i)}`).join(' · ');
    let text = `${o.tiedWith.length}-way tie at ${rec} (${o.tiedWith.map(nm).join(', ')}). CMYFCC points break it: ${list}.`;
    if (!settled) text += ' The order depends on results in other games.';
    else if (o.rule === 'coin-flip') text += ' Teams still level after that go to a coin flip.';
    else if (o.rule === 'head-to-head') text += ' Two of them are level on points, so head-to-head decides between those two.';
    return text;
  }

  // Everything the screen needs for one fully-picked scenario of the key games.
  function detail(cube, sel) {
    const { kcs, ocs } = allowed(cube, sel);
    if (kcs.length !== 1) return null;
    const outcomes = decodeKey(cube, kcs[0]);
    const evs = ocs.map((oc) => evaluate(cube.league, Object.assign({}, outcomes, decodeOther(cube, oc))));
    const me = cube.target;
    const sigOf = (e) => { const o = e.order.find((x) => x.row.i === me); return e.placeOf[me] + ':' + e.placeHiOf[me] + ':' + (o.rule || ''); };
    const same = evs.every((e) => sigOf(e) === sigOf(evs[0]));
    return { evs, same, ev: evs[0], outcomes, story: tieStory(cube.league, evs, me) };
  }


  // =====================================================================
  // THE SCREEN -- Standings > "Final Week Scenarios"
  // =====================================================================

  const MAX_EVALUATIONS = 40000;            // 3^key x 2^other worth of table math before we decline

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  const rangeText = (lo, hi) => '#' + lo + (hi > lo ? '–' + hi : '');
  function fmtWhen(g) {
    if (!g.date) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(g.date);
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
    const day = d ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] : g.date;
    let t = '';
    const tm = g.time && /^(\d{1,2}):(\d{2})/.exec(g.time);
    if (tm) { const h = +tm[1]; t = ' · ' + (h % 12 || 12) + ':' + tm[2] + (h >= 12 ? ' PM' : ' AM'); }
    return day + t;
  }
  function kindOfRange(league, lo, hi) { return rangeKinds(league, lo, hi); }
  const KIND_CLASS = { bye: 'scnBye', home: 'scnHome', road: 'scnRoad', div2: 'scnDiv2' };

  function render(container, payload, opts) {
    opts = opts || {};
    const ourName = opts.ourName || OUR_NAME;
    const league = buildLeague(payload, opts.divisionKey || 'Tackle 11U');
    if (!league.teams.length || league.index[ourName] == null) {
      container.innerHTML = '<div class="lbEmpty">No standings data available from CMYFCC yet.</div>';
      return;
    }
    const now = evaluate(league, null);
    const me = league.index[ourName];
    const badge = (name) => '<span class="scnBadge">' + (root.teamBadgeHtmlFor ? root.teamBadgeHtmlFor(name) : '') + '</span>';
    const sn = (i) => shortName(league, i);

    // ---- nothing left to play: just say where we ended ----
    if (!league.remaining.length) {
      const m = placeMeaning(league, now.placeOf[me]);
      container.innerHTML = '<div class="scnWrap"><div class="scnCard scnHeadCard"><div class="scnEyebrow">Regular season complete</div>' +
        '<div class="scnBig">' + esc(rangeText(now.placeOf[me], now.placeHiOf[me])) + '</div>' +
        '<div class="scnHeadLine">' + esc(m.label ? m.label + ' · ' + m.text : m.text) + '</div></div></div>';
      return;
    }

    container.innerHTML = '<div class="hint" style="text-align:center;">Working through every way the last games can end…</div>';
    const token = (container.__scnToken = (container.__scnToken || 0) + 1);
    setTimeout(() => {
      if (container.__scnToken !== token) return;
      let split = splitGames(league, ourName, 7);
      const size = (sp) => Math.pow(3, sp.key.length) * Math.pow(2, sp.other.length);
      if (size(split) > MAX_EVALUATIONS) split = splitGames(league, ourName, 6);
      if (size(split) > MAX_EVALUATIONS) {
        container.innerHTML = '<div class="lbEmpty">Too many games are still open to map out every result. This fills in once the final week is all that’s left.</div>';
        return;
      }
      build(split);
    }, 30);

    function build(split) {
      const key = split.key, other = split.other;
      const cube = buildCube(league, ourName, key, other, split.near);
      const sel = { key: key.map(() => null), other: other.map(() => null) };
      const ourK = key.findIndex((g) => g.h === me || g.a === me);
      const ourGame = ourK >= 0 ? key[ourK] : null;
      const featured = (g) => (now.placeOf[g.h] <= now.placeOf[g.a] ? g.h : g.a);        // the better-placed team in a game
      // wording for one result of one game, from the point of view of its featured team
      const sideText = (g, st) => {
        if (st === 'T') return sn(g.h) + ' and ' + sn(g.a) + ' tie';
        const f = featured(g), winner = st === 'H' ? g.h : g.a;
        return sn(f) + (winner === f ? ' wins' : ' loses');
      };
      const kindWords = (lo, hi) => { const w = kindOfRange(league, lo, hi).map((k) => KIND_LABEL[k].toLowerCase()); return w.length > 1 ? w.slice(0, -1).join(', ') + ' or ' + w[w.length - 1] : w[0]; };

      // ---------- 1. headline ----------
      const all = summarize(cube, {});
      const lo = all.mins[0], hi = all.maxs[0];
      const div1 = league.brackets[0] ? league.brackets[0].size : 6;
      const Q = quickTable(cube, now);
      const lines = [];
      if (hi <= div1) lines.push(['good', '✅', 'Division 1 is locked up. Nothing that can happen this week drops us out of the top ' + div1 + '.']);
      else if (lo > div1) lines.push(['warn', '⚠️', 'Division 1 is out of reach. We finish in Division 2.']);
      else lines.push(['warn', '⚠️', 'Division 1 isn’t settled yet. We can finish anywhere from ' + rangeText(lo, hi) + '.']);
      lines.push(['', '🎁', byeSentence()]);
      function byeSentence() {
        const byeSeeds = league.brackets[0] ? league.brackets[0].byes : [1, 2];
        const topBye = Math.max.apply(null, byeSeeds);
        if (lo > topBye) return 'A first-round bye isn’t possible any more. The best we can do is ' + rangeText(lo, lo) + ' (' + placeMeaning(league, lo).text + ').';
        if (hi <= topBye) return 'We have a first-round bye locked up.';
        // which win/loss patterns of the games above us still leave a bye in reach?
        const byeRows = [];
        Q.blocks.forEach((blk) => blk.rows.forEach((r) => { if (r.cells.some((c) => c.lo <= topBye)) byeRows.push({ blk: blk.block, rowStates: r.rowStates }); }));
        const parts = [];
        if (Q.ourK >= 0 && byeRows.every((r) => r.blk === 'W')) parts.push('a win ' + (ourGame.h === me ? 'vs ' + sn(ourGame.a) : 'at ' + sn(ourGame.h)));
        // an axis is "required" when every bye-possible pattern has its featured team losing
        const favLoses = (n, r) => r.rowStates[n] !== (key[Q.rowAxes[n]].h === featured(key[Q.rowAxes[n]]) ? 'H' : 'A');
        const required = Q.rowAxes.map((k, n) => n).filter((n) => byeRows.length && byeRows.every((r) => favLoses(n, r)));
        const names = Q.rowAxes.map((k) => sn(featured(key[k])));
        const patterns = {};
        byeRows.forEach((r) => { patterns[r.rowStates.join('')] = true; });
        let help = '';
        const unrestricted = Object.keys(patterns).length === (1 << Q.rowAxes.length);      // every pattern of those games still leaves a bye in reach
        if (required.length) help = required.map((n) => names[n]).join(' and ') + ' losing';
        else if (Q.rowAxes.length === 2 && Object.keys(patterns).length === 3 && !byeRows.some((r) => !favLoses(0, r) && !favLoses(1, r))) help = names[0] + ' or ' + names[1] + ' losing';
        else if (Q.rowAxes.length && !unrestricted) help = 'some help from the other results';
        if (help) parts.push(help);
        if (!parts.length) return 'A first-round bye (top ' + topBye + ') is still possible.';
        return 'A first-round bye (top ' + topBye + ') is still possible. It takes ' + parts.join(' plus ') + '.';
      }
      const headHtml = '<div class="scnCard scnHeadCard">' +
        '<div class="scnEyebrow">Where the Bengals can finish</div>' +
        '<div class="scnBigRow">' + badge(ourName) + '<span class="scnBig">' + esc(rangeText(lo, hi)) + '</span></div>' +
        lines.map((l) => '<div class="scnHeadLine ' + l[0] + '"><span class="scnHeadIcon">' + l[1] + '</span><span>' + esc(l[2]) + '</span></div>').join('') +
        (league.policyNote ? '<div class="scnFine">Seeds aren’t official until the league confirms them.</div>' : '') +
        '</div>';

      // ---------- 2. the quick table ----------
      const colHead = (st) => esc(Q.colAxis >= 0 ? sideText(key[Q.colAxis], st) : '');
      function cellHtml(c, blkIdx, rowIdx, colIdx) {
        const kinds = kindOfRange(league, c.lo, c.hi);
        const mark = c.flips ? '<sup title="A coin flip is possible">*</sup>' : '';
        return '<button type="button" class="scnCell ' + KIND_CLASS[kinds[0]] + '" data-pick="q:' + blkIdx + ':' + rowIdx + ':' + colIdx + '">' + esc(rangeText(c.lo, c.hi)) + mark + '</button>';
      }
      const ourWord = ourGame ? (ourGame.h === me ? 'vs ' + sn(ourGame.a) : 'at ' + sn(ourGame.h)) : '';
      const qtHtml = '<div class="scnSection">If it goes like this…</div><div class="scnCard">' + Q.blocks.map((blk, bi) => {
        const title = blk.block === 'W' ? 'If we win ' + ourWord : (blk.block === 'L' ? 'If we lose ' + ourWord : 'Results above us');
        return '<div class="scnQBlock">' +
          '<div class="scnQTitle ' + (blk.block === 'W' ? 'win' : 'loss') + '">' + esc(title) + '</div>' +
          '<div class="scnQGrid cols' + (Q.colAxis >= 0 ? 2 : 1) + '">' +
            '<div class="scnQCorner"></div>' + (Q.colAxis >= 0 ? '<div class="scnQHead">' + colHead('H') + '</div><div class="scnQHead">' + colHead('A') + '</div>' : '<div class="scnQHead">Finish</div>') +
            blk.rows.map((r, ri) => ({ r, ri, upsets: r.rowStates.filter((st, n) => (st === 'H') !== (key[Q.rowAxes[n]].h === featured(key[Q.rowAxes[n]]))).length }))
              .sort((a, b) => a.upsets - b.upsets || a.ri - b.ri)
              .map((x) => '<div class="scnQRow">' + x.r.rowStates.map((st, n) => esc(sideText(key[Q.rowAxes[n]], st))).join('<br>') + '</div>' + x.r.cells.map((c, ci) => cellHtml(c, bi, x.ri, ci)).join('')).join('') +
          '</div></div>';
      }).join('') +
        '<div class="scnLegend"><span><i class="scnDot scnBye"></i>Bye (#1–2)</span><span><i class="scnDot scnHome"></i>Home game (#3–4)</span><span><i class="scnDot scnRoad"></i>Road game (#5–6)</span></div>' +
        '<div class="scnFine">A range means the finish comes down to a tiebreaker. * a coin flip is possible. Tap a box to see exactly how.</div></div>';

      // ---------- 3. who can finish where ----------
      const whoRows = cube.tracked.map((i, t) => ({ i, t, lo: all.mins[t], hi: all.maxs[t], place: now.placeOf[i] })).sort((a, b) => a.place - b.place || a.lo - b.lo);
      const whoHtml = '<div class="scnSection">Who can finish where</div><div class="scnCard scnWho">' + whoRows.map((r) => {
        const row = now.rows[r.i];
        const tag = r.hi <= div1 ? '<span class="scnTag good">Division 1</span>' : (r.lo > div1 ? '<span class="scnTag">Division 2</span>' : '<span class="scnTag warn">on the bubble</span>');
        return '<div class="scnWhoRow' + (r.i === me ? ' us' : '') + '">' + badge(league.teams[r.i].name) +
          '<span class="scnWhoName">' + esc(sn(r.i)) + '<small>' + esc(recordText(row)) + ' now</small></span>' + tag +
          '<span class="scnWhoRange">' + esc(rangeText(r.lo, r.hi)) + '</span></div>';
      }).join('') + '<div class="scnFine">Counting every possible result of this week’s games, ties included.</div></div>';

      // ---------- 4. pick the results ----------
      const gameCard = (g, idx, kind, isOurs) => {
        const cur = (kind === 'key' ? sel.key : sel.other)[idx];
        const teamBtn = (side, st) => {
          const team = side === 'h' ? g.h : g.a;
          return '<button type="button" class="scnTeamBtn' + (cur === st ? ' on' : '') + '" data-g="' + kind + ':' + idx + ':' + st + '">' + badge(league.teams[team].name) +
            '<span class="scnTeamTxt">' + esc(sn(team)) + '<small>' + esc(recordText(now.rows[team])) + '</small></span></button>';
        };
        return '<div class="scnGame' + (isOurs ? ' ours' : '') + '"><div class="scnGameWhen">' + esc(fmtWhen(g)) + (isOurs ? ' · <b>Bengals</b>' : '') + '</div>' +
          '<div class="scnGameBtns' + (kind === 'key' ? '' : ' noTie') + '">' + teamBtn('h', 'H') +
          (kind === 'key' ? '<button type="button" class="scnTieBtn' + (cur === 'T' ? ' on' : '') + '" data-g="' + kind + ':' + idx + ':T">Tie</button>' : '') +
          teamBtn('a', 'A') + '</div></div>';
      };
      function pickerHtml() {
        const order = key.map((g, k) => k).sort((a, b) => (b === ourK) - (a === ourK) || (key[a].date + key[a].time).localeCompare(key[b].date + key[b].time));
        const keyCards = order.map((k) => gameCard(key[k], k, 'key', k === ourK)).join('');
        const otherOrder = other.map((g, o) => o).sort((a, b) => (other[a].date + other[a].time).localeCompare(other[b].date + other[b].time));
        const otherCards = otherOrder.map((o) => gameCard(other[o], o, 'other', false)).join('');
        return '<div class="scnPicks">' + keyCards + '</div>' +
          (other.length ? '<details class="scnOther"' + (sel.other.some(Boolean) ? ' open' : '') + '><summary>Other games this week (' + other.length + ')</summary>' +
            '<div class="scnFine" style="margin:6px 0 8px;">These don’t touch the top of the table, but a CMYFCC-points tiebreak counts every team’s opponents’ wins, so they can matter in a close one.</div>' +
            '<div class="scnPicks">' + otherCards + '</div></details>' : '');
      }

      // ---------- 5. the result of the picks ----------
      function resultHtml() {
        const picked = sel.key.some(Boolean) || sel.other.some(Boolean);
        const s = summarize(cube, sel);
        const lo2 = s.mins[0], hi2 = s.maxs[0];
        const outcomes = {};
        key.forEach((g, k) => { if (sel.key[k]) outcomes[g.id] = sel.key[k]; });
        other.forEach((g, o) => { if (sel.other[o]) outcomes[g.id] = sel.other[o]; });
        const evPicked = evaluate(league, outcomes);
        const sens = sensitiveGames(cube, sel);
        let html = '<div class="scnCard scnResult" id="scnResult">';
        html += '<div class="scnEyebrow">' + (picked ? 'With those results' : 'Pick some results above to narrow it down') + '</div>';
        html += '<div class="scnBigRow">' + badge(ourName) + '<span class="scnBig">' + esc(rangeText(lo2, hi2)) + '</span>' +
          '<span class="scnBigNote">' + esc(placeMeaning(league, lo2).bracket ? (lo2 === hi2 ? placeMeaning(league, lo2).label + ' · ' + placeMeaning(league, lo2).text : kindWords(lo2, hi2)) : '') + '</span></div>';
        const allKeyPicked = s.keyCombos === 1;
        const det = allKeyPicked ? detail(cube, sel) : null;
        if (picked && allKeyPicked) {
          if (det && det.story) html += '<div class="scnStory">' + esc(det.story) + '</div>';
          else if (lo2 === hi2) html += '<div class="scnStory">No tie to break — our record puts us here outright.</div>';
          if (s.flips) html += '<div class="scnStory warn">' + (s.flips === s.total ? 'However the other games go, the teams end up level' : 'If the other games land just right, the teams end up level') + ' on record, head-to-head and CMYFCC points, and the league settles it with a coin flip.</div>';
          if (s.othersMatter && sens.other.length) {
            html += '<div class="scnStory warn">This one comes down to a points tiebreak that other games can move: ' + sens.other.map((o) => esc(sn(other[o].h) + ' v ' + sn(other[o].a))).join(', ') + '. Open “Other games” above and pick them to see the exact answer.</div>';
          }
        } else if (picked && sens.key.length) {
          html += '<div class="scnStory">Still open and able to change this: ' + sens.key.map((k) => esc(sn(key[k].h) + ' v ' + sn(key[k].a))).join(', ') + '.</div>';
        }
        // the table with the picks applied
        const rows = cube.tracked.map((i, t) => ({ i, t, lo: s.mins[t], hi: s.maxs[t] })).sort((a, b) => a.lo - b.lo || a.hi - b.hi || now.placeOf[a.i] - now.placeOf[b.i]);
        html += '<div class="scnWho scnResultTable">' + rows.map((r) => {
          const row = evPicked.rows[r.i];
          return '<div class="scnWhoRow' + (r.i === me ? ' us' : '') + '"><span class="scnWhoPlace">' + esc(rangeText(r.lo, r.hi)) + '</span>' + badge(league.teams[r.i].name) +
            '<span class="scnWhoName">' + esc(sn(r.i)) + '</span><span class="scnWhoRec">' + esc(recordText(row)) + '</span></div>';
        }).join('') + '</div>';
        html += '<div class="scnFine">Records include your picks; a team whose game isn’t picked is shown as it stands now.</div>';
        if (picked) html += '<div style="text-align:center;margin-top:10px;"><button type="button" class="lbLinkBtn" data-clear="1">Clear my picks</button></div>';
        return html + '</div>';
      }

      const tiesHtml = '<details class="scnHow"><summary>How the league breaks ties</summary>' + (league.policyNote ? '<p class="scnPolicyNote">CMYFCC marks this policy as provisional: “' + esc(league.policyNote) + '”</p>' : '') + '<ol>' +
        '<li><b>Winning percentage</b> first (a tie counts as half a win).</li>' +
        '<li>Two teams level: <b>head-to-head</b>, then <b>CMYFCC points</b>, then a <b>coin flip</b>.</li>' +
        '<li>Three or more level: <b>CMYFCC points</b>, then head-to-head if that leaves exactly two, then a coin flip.</li></ol>' +
        '<p>CMYFCC points are 10 for a win and 5 for a tie, <b>plus 2 for every win each team you beat finished with</b> (1 for each tied team’s wins). So a rival’s result against someone else can move your points.</p></details>';

      const intro = '<p class="scnIntro">The last games of the regular season. The top ' + div1 + ' make the Division 1 bracket, and #1 and #2 get a first-round bye. These are the real league tiebreakers, worked out for every way these games can end.</p>';

      // ---------- paint + wire ----------
      const shell = '<div class="scnWrap">' + intro + headHtml + qtHtml + whoHtml +
        '<div class="scnSection">Pick the results yourself</div><div id="scnPickWrap"></div><div id="scnResultWrap"></div>' + tiesHtml + '</div>';
      container.innerHTML = shell;
      const pickWrap = container.querySelector('#scnPickWrap'), resultWrap = container.querySelector('#scnResultWrap');
      function refresh() { pickWrap.innerHTML = pickerHtml(); resultWrap.innerHTML = resultHtml(); }
      refresh();
      container.querySelector('.scnWrap').addEventListener('click', (e) => {
        const g = e.target.closest('[data-g]');
        if (g) {
          const [kind, idx, st] = g.getAttribute('data-g').split(':');
          const arr = kind === 'key' ? sel.key : sel.other;
          arr[+idx] = arr[+idx] === st ? null : st;
          refresh();
          return;
        }
        const q = e.target.closest('[data-pick]');
        if (q) {
          const [, bi, ri, ci] = q.getAttribute('data-pick').split(':').map((v, n) => (n ? +v : v));
          const cell = Q.blocks[bi].rows[ri].cells[ci];
          sel.key = cell.key.slice();
          sel.other = other.map(() => null);
          refresh();
          const r = container.querySelector('#scnResult');
          if (r && r.scrollIntoView) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (e.target.closest('[data-clear]')) {
          sel.key = key.map(() => null); sel.other = other.map(() => null);
          refresh();
        }
      });
    }
  }

  const api = { OUR_NAME, buildLeague, evaluate, placeMeaning, placeKind, rangeKinds, KIND_LABEL, splitGames, buildCube, summarize, sensitiveGames, quickTable, detail, tieStory, shortName, recordText, decodeKey, decodeOther, KEY_STATES, OTHER_STATES, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StandingsScenarios = api;
})(typeof window !== 'undefined' ? window : this);

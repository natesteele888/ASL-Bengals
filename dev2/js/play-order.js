// Puts a saved Stat Keeper log (statKeeperLogs/{gameId}.plays) in true game
// order: first play to last.
//
// Nathan: "trying to play back one of the saved stat-taken games from early
// in the season, and it was reversed." Until early September 2026 Stat
// Keeper added each new play to the FRONT of the list (newest first). It
// has added to the END since (oldest first), and so has Game Wizard.
// Saved games were never rewritten, so both kinds are in the database,
// and the readers either assumed one kind (playback, recap) or reversed it
// on purpose (the stats push numbering). This works the order out on read
// and never writes anything back.
//
//   stored (early season):  [Q2 run, Q1 end, Q1 pass, Q1 kickoff]
//   orderPlays() returns:   [Q1 kickoff, Q1 pass, Q1 end, Q2 run]
//
// How:
//   1. Which way is the list stored? Look at the quarters first (a quarter
//      can only go up during a game), then at the time in each play's id
//      (play_1757000000000 / q_... from Stat Keeper, play_<base36 time><4>
//      from Game Wizard). Most pairs of plays going down = newest first,
//      so flip it.
//   2. Keep quarters in order. A quarter comes from the "End of Q" markers
//      when the log has them (a play added later keeps the quarter that
//      was current when it was typed, so its own field can be stale), and
//      from the play's own quarter otherwise.
//   3. Inside a quarter where every play has a game clock ("7:42"), the
//      clock counts down. Otherwise the stored order (the order the coach
//      placed them in) stands.
// Loaded by index.html (schedule.js recap, statkeeper-import.js),
// game-playback.html and stat-keeper.html. Tests: dev2/tests/play-order.test.js.
(function(root){
  function idTime(id){
    if (typeof id !== 'string') return null;
    let m = id.match(/^(?:play|q)_(\d{12,14})$/);
    if (m) return Number(m[1]);
    m = id.match(/^play_([0-9a-z]{8})[0-9a-z]{4}$/);
    if (m) return parseInt(m[1], 36);
    return null;
  }
  function clockSeconds(c){
    if (typeof c === 'number' && isFinite(c)) return c;
    const m = typeof c === 'string' && c.trim().match(/^(\d{1,2}):([0-5]\d)$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function num(v){ const n = Number(v); return (v === null || v === undefined || v === '' || !isFinite(n)) ? null : n; }

  // Counts pairs (i < j) whose keys go up vs down. O(n^2) is fine for a
  // game (a couple hundred plays at most).
  function trend(keys){
    let up = 0, down = 0;
    for (let i = 0; i < keys.length; i++){
      if (keys[i] == null) continue;
      for (let j = i + 1; j < keys.length; j++){
        if (keys[j] == null || keys[j] === keys[i]) continue;
        if (keys[j] > keys[i]) up++; else down++;
      }
    }
    return { up: up, down: down };
  }

  function isNewestFirst(list){
    const q = trend(list.map(function(p){
      return p.type === 'quarterEnd' ? (num(p.quarter) == null ? null : num(p.quarter) + 0.5) : num(p.quarter);
    }));
    if (q.up !== q.down) return q.down > q.up;
    const t = trend(list.map(function(p){ return idTime(p.id); }));
    if (t.up !== t.down) return t.down > t.up;
    // A log Stat Keeper rebuilt from live stats (ids rebuilt_1...) has no
    // times or quarters. It was saved newest first with the untimed plays
    // (defense, kicks...) in front of our own timed snaps; it's saved with
    // the snaps first now.
    const real = list.filter(function(p){ return p.type !== 'quarterEnd'; });
    if (real.length && real.every(function(p){ return /^rebuilt_/.test(String(p.id)); })){
      const isSnap = function(p){ return (p.type === 'run' && p.runTeam !== 'Opponent' && p.side !== 'defense') || (p.type === 'pass' && p.passTeam !== 'Opponent' && p.side !== 'defense'); };
      const firstSnap = real.findIndex(isSnap);
      const firstOther = real.findIndex(function(p){ return !isSnap(p); });
      if (firstSnap !== -1 && firstOther !== -1) return firstOther < firstSnap;
    }
    return false;
  }

  function orderPlays(plays){
    const list = (Array.isArray(plays) ? plays : []).filter(function(p){ return p && typeof p === 'object'; });
    if (isNewestFirst(list)) list.reverse();
    const hasMarkers = list.some(function(p){ return p.type === 'quarterEnd' && num(p.quarter) != null; });
    let markerQ = 1, lastQ = 1;
    const rows = list.map(function(p, i){
      let q;
      if (p.type === 'quarterEnd' && num(p.quarter) != null){
        q = num(p.quarter) + 0.5; // sits at the end of the quarter it closes
        markerQ = num(p.quarter) + 1;
      } else if (hasMarkers){
        q = markerQ;
      } else {
        q = num(p.quarter) != null ? num(p.quarter) : lastQ;
        lastQ = q;
      }
      return { p: p, i: i, q: q, clock: p.type === 'quarterEnd' ? null : clockSeconds(p.clock) };
    });
    // Clock only decides inside a quarter where every play has one.
    const clockOk = {};
    rows.forEach(function(r){
      if (r.p.type === 'quarterEnd') return;
      if (!(r.q in clockOk)) clockOk[r.q] = true;
      if (r.clock == null) clockOk[r.q] = false;
    });
    rows.sort(function(a, b){
      if (a.q !== b.q) return a.q - b.q;
      if (clockOk[a.q] && a.clock != null && b.clock != null && a.clock !== b.clock) return b.clock - a.clock;
      return a.i - b.i;
    });
    return rows.map(function(r){ return r.p; });
  }

  const api = { orderPlays: orderPlays, isNewestFirst: isNewestFirst, clockSeconds: clockSeconds };
  root.BengalsPlayOrder = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

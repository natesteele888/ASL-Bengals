// Saving the coaches' play edits (playEdits.json / splitRouteEdits.json)
// without wiping anyone else's.
//
// THE BUG THIS FIXES (Nov 2026, "master plays don't save to the cloud")
// Edit Plays used to PUT its WHOLE in-memory play list on every Save -- the
// list as it was when that coach first opened Edit Plays. So:
//   - a phone that opened Edit Plays yesterday and saved one tweak today put
//     yesterday's copy of every other play back, undoing every save another
//     coach (or Play Builder) made in between;
//   - a phone whose first load failed ("could not reach the cloud -- showing
//     the built-in defaults") saved the defaults over everyone's edits.
// Either way a coach's save "didn't stick", with nothing on screen saying so.
//
// Now a save reads the latest copy from the database first, swaps in ONLY
// the plays (or Split route calls) this coach actually changed, and writes
// that back. If the read fails, nothing is written at all -- the save
// reports the failure instead of guessing.
//
// Pure helpers (mergePlays, mergeSplitRoutes, changedSplitLeaves, forCloud)
// are exported for node tests: dev2/tests/play-edits-store.test.js.
(function () {
  'use strict';

  var DB = 'https://aslbengals-default-rtdb.firebaseio.com';
  var PLAYS_PATH = 'playEdits';
  var SPLIT_PATH = 'splitRouteEdits';

  // Fields other layers hang on a play at runtime (assignment overrides and
  // ball paths live on their own database keys, see assignment-store.js).
  // They must never be baked into playEdits.json: a stale copy there would
  // bring back an override a coach had since cleared.
  var RUNTIME_ONLY_FIELDS = ['assignments', 'ballPath'];

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  // A play as it should be stored: a deep copy minus runtime-only layers.
  function forCloud(pt) {
    var c = clone(pt) || {};
    RUNTIME_ONLY_FIELDS.forEach(function (f) { delete c[f]; });
    return c;
  }

  // Firebase hands back a dense array as an array but a sparse one as an
  // object keyed "0","1",... -- accept either.
  function toList(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    if (v && typeof v === 'object') {
      return Object.keys(v)
        .sort(function (a, b) { return Number(a) - Number(b); })
        .map(function (k) { return v[k]; })
        .filter(Boolean);
    }
    return null;
  }

  // cloudList with each changed play swapped in by key (or added at the end
  // if the cloud doesn't have it yet). Order of everything else is kept.
  function mergePlays(cloudList, changed) {
    var out = (cloudList || []).slice();
    (changed || []).forEach(function (p) {
      var i = -1;
      for (var j = 0; j < out.length; j++) { if (out[j] && out[j].key === p.key) { i = j; break; } }
      if (i === -1) out.push(p); else out[i] = p;
    });
    return out;
  }

  // Split routes are DATA.splitRoutes[side][slot][call] -- e.g.
  // Right.wide.houston. Each of those leaves is one thing a coach edits.
  function splitLeaves(routes) {
    var out = {};
    Object.keys(routes || {}).forEach(function (side) {
      var s = routes[side];
      if (!s || typeof s !== 'object') return;
      Object.keys(s).forEach(function (slot) {
        var sl = s[slot];
        if (!sl || typeof sl !== 'object') return;
        Object.keys(sl).forEach(function (call) {
          out[side + '|' + slot + '|' + call] = JSON.stringify(sl[call]);
        });
      });
    });
    return out;
  }

  // Leaf paths ("Right|wide|houston") that differ between a baseline
  // snapshot (from splitLeaves) and the current routes.
  function changedSplitLeaves(baselineLeaves, routes) {
    var now = splitLeaves(routes);
    var base = baselineLeaves || {};
    return Object.keys(now).filter(function (k) { return now[k] !== base[k]; });
  }

  function mergeSplitRoutes(cloudRoutes, localRoutes, leafPaths) {
    var out = clone(cloudRoutes && typeof cloudRoutes === 'object' ? cloudRoutes : {}) || {};
    (leafPaths || []).forEach(function (path) {
      var parts = path.split('|');
      var side = parts[0], slot = parts[1], call = parts[2];
      var v = localRoutes && localRoutes[side] && localRoutes[side][slot]
        ? localRoutes[side][slot][call] : undefined;
      if (v === undefined) return;
      out[side] = out[side] && typeof out[side] === 'object' ? out[side] : {};
      out[side][slot] = out[side][slot] && typeof out[side][slot] === 'object' ? out[side][slot] : {};
      out[side][slot][call] = clone(v);
    });
    return out;
  }

  async function readFailure(res, what) {
    var body = '';
    try { body = await res.text(); } catch (e) {}
    var err = new Error('Could not ' + what + ' (HTTP ' + res.status + ')' + (body ? ': ' + body.slice(0, 200) : ''));
    err.status = res.status;
    return err;
  }

  async function getJson(path) {
    var url = await window.firebaseAuthed(DB + '/' + path + '.json');
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw await readFailure(res, 'read the latest saved plays');
    return res.json();
  }

  async function putJson(path, body) {
    var url = await window.firebaseAuthed(DB + '/' + path + '.json');
    var res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await readFailure(res, 'save');
    return res;
  }

  // Save the given plays into playEdits.json without touching any other
  // play there. opts.whenEmpty: the full list to start from if the database
  // has no saved edits at all yet (first save ever), so a first save still
  // writes a complete playbook the way it always has.
  async function savePlays(changed, opts) {
    var fresh = toList(await getJson(PLAYS_PATH));
    var base = fresh && fresh.length ? fresh
      : ((opts && opts.whenEmpty) || []).map(forCloud);
    var merged = mergePlays(base, (changed || []).map(forCloud));
    await putJson(PLAYS_PATH, merged);
    return merged;
  }

  async function saveSplitRoutes(localRoutes, leafPaths) {
    var fresh = await getJson(SPLIT_PATH);
    var merged = mergeSplitRoutes(fresh, localRoutes, leafPaths);
    await putJson(SPLIT_PATH, merged);
    return merged;
  }

  var api = {
    forCloud: forCloud,
    toList: toList,
    mergePlays: mergePlays,
    splitLeaves: splitLeaves,
    changedSplitLeaves: changedSplitLeaves,
    mergeSplitRoutes: mergeSplitRoutes,
    savePlays: savePlays,
    saveSplitRoutes: saveSplitRoutes,
  };
  if (typeof window !== 'undefined') window.PlayEditsStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

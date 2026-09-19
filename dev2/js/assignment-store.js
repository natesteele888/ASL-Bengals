// Where per-alignment assignment overrides live.
//
// Shape, at /assignmentOverrides in the Realtime Database:
//
//   assignmentOverrides
//     inside_zone
//       wing:Right+overload
//         "5": { pathIndex, points, points4x4 }
//
// playKey -> alignmentKey -> owner. Nothing else is nested in there, and each
// save writes ONE alignment's leaf.
//
// WHY NOT FOLD THIS INTO playEdits.json
// Because that key already demonstrates the failure mode. "Save to Cloud"
// writes the coach's ENTIRE DATA.playTypes array as one snapshot, so a
// browser running older code silently drops any field it did not know about,
// permanently, for everyone -- which is exactly why SHIPPED_PLAY_FLAGS has to
// re-stamp behavioural flags over cloud data on every load. Overrides get
// their own narrow path, and a save touches only the alignment being edited,
// so two coaches working on different formations cannot overwrite each other
// and old code cannot delete work it does not understand.
//
// TWO BACKENDS, ONE INTERFACE
// The real app has an authenticated Firebase session, so it reads and writes
// the database. The standalone dev preview has no login by design, so it
// falls back to this browser's own storage. Same calls either way, and
// `backend()` reports which one is live -- a screen that saved to
// localStorage must not tell a coach his team has the change.

(function () {
  'use strict';

  var DB = 'https://aslbengals-default-rtdb.firebaseio.com';
  var PATH = 'assignmentOverrides';
  var LS_KEY = 'bengalsAssignmentOverrides';

  function hasCloud() {
    return typeof window.firebaseAuthed === 'function';
  }

  function backend() {
    return hasCloud() ? 'cloud' : 'local';
  }

  // Firebase returns a dense array as an array but a sparse one as an object
  // keyed "0","1",... Points come back either way depending on what was
  // written, so normalise rather than trusting the shape.
  function toPointList(v) {
    if (!v) return null;
    var arr = Array.isArray(v) ? v : Object.keys(v)
      .sort(function (a, b) { return Number(a) - Number(b); })
      .map(function (k) { return v[k]; });
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (!p) continue;
      var x = Array.isArray(p) ? p[0] : p['0'];
      var y = Array.isArray(p) ? p[1] : p['1'];
      if (typeof x !== 'number' || typeof y !== 'number') return null;
      out.push([x, y]);
    }
    return out.length ? out : null;
  }

  function normalizeOwnerMap(raw) {
    var out = {};
    Object.keys(raw || {}).forEach(function (owner) {
      var ov = raw[owner];
      if (!ov) return;
      var pts = toPointList(ov.points);
      var pts4 = toPointList(ov.points4x4);
      if (!pts && !pts4) return; // nothing usable -- drop rather than half-apply
      var clean = { pathIndex: ov.pathIndex || 0 };
      if (pts) clean.points = pts;
      if (pts4) clean.points4x4 = pts4;
      if (ov.endType) clean.endType = ov.endType;
      if (ov.isBlocking !== undefined) clean.isBlocking = !!ov.isBlocking;
      out[owner] = clean;
    });
    return out;
  }

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeLocal(all) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(all)); } catch (e) {}
  }

  // Everything, as playKey -> alignKey -> owner. One fetch on boot.
  function loadAll() {
    if (!hasCloud()) return Promise.resolve(readLocal());
    return window.firebaseAuthed(DB + '/' + PATH + '.json')
      .then(function (url) { return fetch(url); })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (raw) { return raw || {}; })
      .catch(function () { return {}; });
  }

  // Merge into the live play data so renderCardDiagram picks them up. Plays
  // carry their own overrides, which is what keeps applyAssignmentOverrides a
  // pure function of the play it is drawing.
  function applyTo(playTypes, all) {
    if (!playTypes || !all) return 0;
    var n = 0;
    playTypes.forEach(function (pt) {
      var forPlay = all[pt.key];
      if (!forPlay) return;
      var merged = {};
      Object.keys(forPlay).forEach(function (alignKey) {
        var owners = normalizeOwnerMap(forPlay[alignKey]);
        if (Object.keys(owners).length) { merged[alignKey] = owners; n++; }
      });
      if (Object.keys(merged).length) pt.assignments = merged;
    });
    return n;
  }

  function load(playTypes) {
    return loadAll().then(function (all) {
      return { count: applyTo(playTypes, all), all: all };
    });
  }

  // Write ONE alignment's overrides. An empty map clears that alignment
  // rather than leaving an empty object behind.
  function save(playKey, alignKey, ownerMap) {
    var body = (ownerMap && Object.keys(ownerMap).length) ? ownerMap : null;

    if (!hasCloud()) {
      var all = readLocal();
      all[playKey] = all[playKey] || {};
      if (body) all[playKey][alignKey] = body;
      else delete all[playKey][alignKey];
      if (!Object.keys(all[playKey]).length) delete all[playKey];
      writeLocal(all);
      return Promise.resolve({ ok: true, backend: 'local' });
    }

    var leaf = DB + '/' + PATH + '/' + encodeURIComponent(playKey)
      + '/' + encodeURIComponent(alignKey) + '.json';
    return window.firebaseAuthed(leaf)
      .then(function (url) {
        return fetch(url, {
          method: body ? 'PUT' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error('save failed (' + r.status + ')');
        return { ok: true, backend: 'cloud' };
      });
  }

  // --- Ball paths -------------------------------------------------------
  // Same store, its own key: /ballPaths/<playKey> -> the ordered legs.
  //
  // NOT keyed by alignment, unlike assignment overrides. Who touches the ball
  // and in what order is the play -- a reverse is a reverse out of any
  // formation. Only the exchange POINTS are positional, and they travel with
  // the formation the same way every other coordinate does.
  var BALL_PATH = 'ballPaths';
  var LS_BALL = 'bengalsBallPaths';

  function toLegList(v) {
    if (!v) return null;
    var arr = Array.isArray(v) ? v : Object.keys(v)
      .sort(function (a, b) { return Number(a) - Number(b); })
      .map(function (k) { return v[k]; });
    var out = [];
    arr.forEach(function (leg) {
      if (!leg || leg.player == null) return;
      var clean = { player: leg.player };
      if (leg.how) clean.how = leg.how;
      if (leg.at) {
        var x = Array.isArray(leg.at) ? leg.at[0] : leg.at['0'];
        var y = Array.isArray(leg.at) ? leg.at[1] : leg.at['1'];
        if (typeof x === 'number' && typeof y === 'number') clean.at = [x, y];
      }
      out.push(clean);
    });
    return out.length ? out : null;
  }

  function loadBallPaths() {
    if (!hasCloud()) {
      try { return Promise.resolve(JSON.parse(localStorage.getItem(LS_BALL) || '{}')); }
      catch (e) { return Promise.resolve({}); }
    }
    return window.firebaseAuthed(DB + '/' + BALL_PATH + '.json')
      .then(function (url) { return fetch(url); })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (raw) { return raw || {}; })
      .catch(function () { return {}; });
  }

  function applyBallPaths(playTypes, all) {
    if (!playTypes || !all) return 0;
    var n = 0;
    playTypes.forEach(function (pt) {
      var legs = toLegList(all[pt.key]);
      if (legs) { pt.ballPath = legs; n++; }
    });
    return n;
  }

  function saveBallPath(playKey, legs) {
    var body = (legs && legs.length) ? legs : null;
    if (!hasCloud()) {
      var all = {};
      try { all = JSON.parse(localStorage.getItem(LS_BALL) || '{}'); } catch (e) {}
      if (body) all[playKey] = body; else delete all[playKey];
      try { localStorage.setItem(LS_BALL, JSON.stringify(all)); } catch (e) {}
      return Promise.resolve({ ok: true, backend: 'local' });
    }
    var leaf = DB + '/' + BALL_PATH + '/' + encodeURIComponent(playKey) + '.json';
    return window.firebaseAuthed(leaf)
      .then(function (url) {
        return fetch(url, {
          method: body ? 'PUT' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error('save failed (' + r.status + ')');
        return { ok: true, backend: 'cloud' };
      });
  }

  window.AssignmentStore = {
    loadBallPaths: loadBallPaths,
    applyBallPaths: applyBallPaths,
    saveBallPath: saveBallPath,
    backend: backend,
    loadAll: loadAll,
    load: load,
    applyTo: applyTo,
    save: save,
    normalizeOwnerMap: normalizeOwnerMap,
  };
})();

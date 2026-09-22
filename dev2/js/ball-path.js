// Where the ball goes, and when.
//
// Nathan: "an easy way to show the path of the ball through the play, where in
// the play sequence it is with certain players, when it is flipped on a
// reverse, when do we want to pass on a pop pass... it needs to be easy to
// make on the fly."
//
// WHAT WAS THERE BEFORE
// Almost nothing, and what was there was built for one play. A path could be
// flagged `ball` (who is credited with it) and separately `ballStart` (who the
// floating ball icon rides first). A single `handoffIndex` on the RECEIVER's
// path, paired with a hand-timed `delayMs` on the giver's, produced one
// exchange. Across the whole playbook that machinery is used by two paths.
//
// It cannot express a reverse, because a reverse is two exchanges. It cannot
// say when a pop pass is released, because a release is not a handoff. And
// nothing about it is authorable without editing coordinates by hand.
//
// THE MODEL
// A ball path is an ordered list of legs -- who has it, and for every leg
// after the first, where and how he got it:
//
//   playType.ballPath = [
//     { player: 1 },                                  // the snap
//     { player: 3, at: [x, y], how: 'handoff' },
//     { player: 4, at: [x, y], how: 'pitch'   },       // the reverse
//     { player: 6, at: [x, y], how: 'pass'    },       // the release
//   ]
//
// The order IS the sequence, which is what makes "where in the play is it with
// this player" answerable at all. `how` is the coaching word for the exchange,
// not a rendering detail -- a pitch and a throw look different and are taught
// differently.
//
// Deliberately separate from the existing `ball`/`ballStart` flags rather than
// replacing them: those feed the quiz's answer key and Boot's carrier swap,
// and a play with no authored ballPath keeps exactly its current behaviour.

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // The exchanges a coach actually calls, in the words he calls them.
  // `label` is the noun a coach calls it; `verb` is how it reads in a sentence
  // written for an eleven-year-old. Both are needed -- "then handoff it to #2"
  // is what you get from using the noun as a verb, and it is not English.
  var EXCHANGES = {
    snap:    { label: 'Snap',    verb: 'snap it',      colour: '#d99000' },
    handoff: { label: 'Handoff', verb: 'hand it off',  colour: '#d99000' },
    pitch:   { label: 'Pitch',   verb: 'pitch it',     colour: '#e0570a' },
    reverse: { label: 'Reverse', verb: 'reverse it',   colour: '#e0570a' },
    pass:    { label: 'Pass',    verb: 'throw it',     colour: '#c0392b' },
    keep:    { label: 'Keep',    verb: 'keep it',      colour: '#d99000' },
  };

  function el(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function isValid(bp) {
    return Array.isArray(bp) && bp.length > 0 && bp[0] && bp[0].player != null;
  }

  // Plain English, for the study guide and for a coach checking his own work:
  // "Snap to #1, handoff to #3, pitch to #4, pass to #6."
  function describe(bp) {
    if (!isValid(bp)) return '';
    var parts = ['Snap to #' + bp[0].player];
    for (var i = 1; i < bp.length; i++) {
      var leg = bp[i];
      var ex = EXCHANGES[leg.how] || EXCHANGES.handoff;
      parts.push(ex.label.toLowerCase() + ' to #' + leg.player);
    }
    return parts.join(', ') + '.';
  }

  // What one player does with the ball, for a position-specific study guide --
  // this is the "where in the sequence is it with me" question asked from the
  // player's side rather than the ball's.
  function legsFor(bp, player) {
    if (!isValid(bp)) return [];
    var out = [];
    for (var i = 0; i < bp.length; i++) {
      if (String(bp[i].player) !== String(player)) continue;
      out.push({
        index: i,
        gets: i === 0 ? 'snap' : (bp[i].how || 'handoff'),
        givesTo: bp[i + 1] ? bp[i + 1].player : null,
        givesHow: bp[i + 1] ? (bp[i + 1].how || 'handoff') : null,
      });
    }
    return out;
  }

  // Where the ball is when a leg BEGINS. The first leg starts at the snap,
  // which is the center; every later one starts where the exchange was
  // authored.
  function legStart(bp, i, align) {
    if (i === 0) return (align && align.C) ? align.C.slice() : null;
    return bp[i].at ? bp[i].at.slice() : null;
  }

  // Draw the ball's journey over a rendered diagram: a gold line through the
  // exchange points in order, with a numbered badge at each.
  //
  // It is drawn as its own overlay rather than woven into the route paths on
  // purpose -- the ball's trip is a different question from any one player's
  // assignment, and a coach looking for "who ends up with it" should not have
  // to trace five overlapping routes to find out.
  function drawOverlay(stage, bp, align, opts) {
    opts = opts || {};
    var g = stage._mainGroup;
    if (!g || !isValid(bp)) return null;

    var layer = el('g', { 'data-ball-path': '1' });
    var pts = [];
    for (var i = 0; i < bp.length; i++) {
      var p = legStart(bp, i, align);
      if (p) pts.push({ at: p, leg: bp[i], index: i });
    }
    if (!pts.length) { g.appendChild(layer); stage._ballPathLayer = layer; return layer; }

    // The connector, under the badges.
    if (pts.length > 1) {
      var d = 'M ' + pts.map(function (q) { return q.at[0] + ' ' + q.at[1]; }).join(' L ');
      layer.appendChild(el('path', {
        d: d, fill: 'none', stroke: '#d99000', 'stroke-width': 6,
        'stroke-dasharray': '2 14', 'stroke-linecap': 'round', opacity: 0.95,
      }));
    }

    pts.forEach(function (q) {
      var how = q.index === 0 ? 'snap' : (q.leg.how || 'handoff');
      var ex = EXCHANGES[how] || EXCHANGES.handoff;
      var badge = el('g', { 'data-ball-step': String(q.index) });
      badge.appendChild(el('circle', {
        cx: q.at[0], cy: q.at[1], r: 21,
        fill: ex.colour, stroke: '#fff', 'stroke-width': 4,
      }));
      var t = el('text', {
        x: q.at[0], y: q.at[1], 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': 24, 'font-weight': 800, fill: '#fff',
        style: 'pointer-events:none;user-select:none',
      });
      t.textContent = String(q.index + 1);
      badge.appendChild(t);

      // The word, above the badge, so the diagram reads without a legend.
      if (opts.labels !== false) {
        var lt = el('text', {
          x: q.at[0], y: q.at[1] - 32, 'text-anchor': 'middle',
          'font-size': 22, 'font-weight': 800, fill: ex.colour,
          style: 'pointer-events:none;user-select:none',
        });
        lt.textContent = ex.label + ' → #' + q.leg.player;
        badge.appendChild(lt);
      }
      layer.appendChild(badge);
    });

    g.appendChild(layer);
    stage._ballPathLayer = layer;
    return layer;
  }

  // --- Timing -----------------------------------------------------------
  //
  // An exchange has a place but not a time, because a coach places the point
  // and should not then have to tell us WHEN. So the time is derived: find how
  // far along the receiver's own route he is when he reaches the exchange
  // point, and hand the ball over then. Every route is stroked linearly over
  // the same animation window, so a distance fraction IS a time fraction.
  //
  // Measured along the receiver rather than the giver because the receiver is
  // the one arriving to take it -- a giver can be standing still at the mesh
  // point long before the exchange, which would hand off far too early.
  function fractionAlongPath(points, target) {
    if (!points || points.length < 2 || !target) return null;
    var segs = [], total = 0;
    for (var i = 1; i < points.length; i++) {
      var a = points[i - 1], b = points[i];
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push({ a: a, b: b, len: len, before: total });
      total += len;
    }
    if (!total) return null;

    var best = null, bestDist = Infinity;
    segs.forEach(function (sg) {
      var dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1];
      var t = sg.len ? (((target[0] - sg.a[0]) * dx + (target[1] - sg.a[1]) * dy) / (sg.len * sg.len)) : 0;
      t = Math.max(0, Math.min(1, t));
      var px = sg.a[0] + dx * t, py = sg.a[1] + dy * t;
      var d = Math.hypot(target[0] - px, target[1] - py);
      if (d < bestDist) { bestDist = d; best = (sg.before + sg.len * t) / total; }
    });
    return best;
  }

  // Same per-segment projection as fractionAlongPath, but for the Build
  // screen's staleness check rather than animation timing: how far off the
  // receiver's CURRENT route (post formation-shift, post any hand-edit) does
  // an authored exchange point now sit, and where would it land if snapped
  // back on. A separate function rather than a second return value off
  // fractionAlongPath -- that one is read-hot inside schedule() for every
  // animation frame's setup and stays untouched; this one only runs when a
  // coach is actively looking at the Ball Path panel.
  function nearestPointOnPath(points, target) {
    if (!points || points.length < 2 || !target) return null;
    var best = null, bestDist = Infinity, bestFrac = 0, total = 0;
    var segs = [];
    for (var i = 1; i < points.length; i++) {
      var a = points[i - 1], b = points[i];
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push({ a: a, b: b, len: len, before: total });
      total += len;
    }
    if (!total) return null;
    segs.forEach(function (sg) {
      var dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1];
      var t = sg.len ? (((target[0] - sg.a[0]) * dx + (target[1] - sg.a[1]) * dy) / (sg.len * sg.len)) : 0;
      t = Math.max(0, Math.min(1, t));
      var px = sg.a[0] + dx * t, py = sg.a[1] + dy * t;
      var d = Math.hypot(target[0] - px, target[1] - py);
      if (d < bestDist) { bestDist = d; best = [px, py]; bestFrac = (sg.before + sg.len * t) / total; }
    });
    return { point: best, distance: bestDist, fraction: bestFrac };
  }

  // Turn an authored ball path into a carrier schedule the animation can run:
  // [{ player, circleEl, atMs }], in order.
  //
  // `lookup(player)` hands back that player's rendered circle and the points
  // actually drawn for him. A leg whose man was never drawn is dropped rather
  // than stalling the ball on a carrier that does not exist.
  function schedule(bp, lookup, animMs) {
    if (!isValid(bp)) return [];
    var out = [];
    for (var i = 0; i < bp.length; i++) {
      var found = lookup(bp[i].player);
      if (!found || !found.circleEl) continue;
      var at = 0;
      if (i > 0) {
        var frac = fractionAlongPath(found.points, bp[i].at);
        // No usable route for the receiver (a blocker taking a handoff, say)
        // -- fall back to spacing the exchange evenly through the play rather
        // than dropping it.
        at = (frac == null ? (i / bp.length) : frac) * animMs;
      }
      out.push({ player: bp[i].player, circleEl: found.circleEl, atMs: at });
    }
    // An exchange cannot happen before the one before it, whatever the
    // geometry says -- a receiver whose route crosses the mesh point early
    // would otherwise be handed the ball before the previous carrier has it.
    for (var j = 1; j < out.length; j++) {
      if (out[j].atMs <= out[j - 1].atMs) out[j].atMs = out[j - 1].atMs + Math.max(120, animMs * 0.08);
    }
    return out;
  }

  function clearOverlay(stage) {
    if (stage._ballPathLayer && stage._ballPathLayer.parentNode) {
      stage._ballPathLayer.parentNode.removeChild(stage._ballPathLayer);
    }
    stage._ballPathLayer = null;
  }

  window.BallPath = {
    EXCHANGES: EXCHANGES,
    isValid: isValid,
    describe: describe,
    legsFor: legsFor,
    legStart: legStart,
    drawOverlay: drawOverlay,
    fractionAlongPath: fractionAlongPath,
    nearestPointOnPath: nearestPointOnPath,
    schedule: schedule,
    clearOverlay: clearOverlay,
  };
})();

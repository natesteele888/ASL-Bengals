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
    clearOverlay: clearOverlay,
  };
})();

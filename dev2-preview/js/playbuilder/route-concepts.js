// Route/blocking "concepts" -- one-click preset shapes for Play Builder's
// Selected Player panel. Nathan, after seeing footballplaybook.com:
// "pick from the pre-determined routes... just so much easier... Let's
// really step up our version." This is that piece -- zero schema change,
// a concept just WRITES the same PlayerAssignment.points/sameSideRoute/
// crossSideRoute array a coach could already fill in by hand, one click
// instead of many.
//
// Round 2 -- Nathan: "the pre-determined routes need some work, since
// point[s] have a middle point to bend the route, the stock routes have
// to be more accurate to standard routes." Real bug, not just shape
// tuning: editor.js's curvedPathD() (the function that actually draws
// every route in this app, not just concepts) treats a 3+ point array as
// alternating (control, on-curve) pairs after point 0 -- ANY odd-indexed
// point is a bezier CONTROL point, pulling the curve toward it, not a
// waypoint the line passes through. Round 1's concepts were authored as
// plain waypoint lists (start, corner, end), so a "sharp" break like a
// Slant's 45-degree cut rendered as one soft, undefined curve bulging
// toward the corner instead of two straight segments meeting there.
//
// Fixed by building every concept through two small helpers that respect
// this app's own real curve convention instead of fighting it:
//   corner() -- a SHARP break: inserts the exact midpoint between the
//     previous on-curve point and the new one as the control point. A
//     quadratic bezier with its control AT the midpoint of its two
//     endpoints is mathematically a straight line (control=(A+B)/2 makes
//     point(t) = A(1-t)+Bt, plain linear interpolation) -- so two calls
//     to corner() in a row produce two real straight segments meeting at
//     a true sharp angle, matching a standard route tree's "cut" (Slant,
//     Out, In, Hitch, Drag, Cross, Post, Corner, Out & Up, Stop & Go,
//     Post-Corner all break this way).
//   bend() -- a genuine SMOOTH curve: the control point is deliberately
//     offset off the direct line, so the curve actually arcs, reserved
//     for the two routes whose defining shape IS a continuous bend
//     (Wheel's sweeping turn upfield, Curl's turn-back) rather than a
//     discrete cut.
//
// Depth/break sizes are hand-calibrated against this app's own real,
// already-shipped route data, NOT a literal yards-per-pixel conversion --
// this field was never drawn to one consistent real-world scale (confirmed
// by comparing real anchor spacing to real football dimensions: the
// horizontal axis runs close to ~114.5 SVG units/yard, using real O-line
// splits as ground truth, while the vertical/downfield axis runs closer to
// ~40 units/yard, using real backfield/LB/safety depths as ground truth --
// a genuine ~2.8x mismatch between axes, not rounding noise; see editor.js's
// point-info readout, which reports the two axes separately instead of
// forcing them into one number). Every concept below stays within a
// conservative ~12-yard total upfield reach (480 units) from its own
// origin regardless of starting depth, which keeps it safely inside this
// app's own already-verified field crop even for a player whose route
// starts right at the line of scrimmage.
//
// `outwardSign`: +1 if this concept's break should move toward +x,
// -1 toward -x. Resolved by the caller (editor.js's applyConcept()) from
// the selected player's OWN current x versus the formation's center, so
// "Out" always breaks toward the near sideline, "In"/"Slant"/crossers
// always break toward the ball, regardless of which side of the
// formation this specific player happens to line up on.
(function () {
  'use strict';

  // Appends a SHARP corner to `pts` (mutates and returns it) -- delta is
  // relative to the current last point. See the file header for the
  // control-at-midpoint-equals-straight-line math.
  function corner(pts, delta) {
    const from = pts[pts.length - 1];
    const to = { x: from.x + delta.dx, y: from.y + delta.dy };
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    pts.push(mid, to);
    return pts;
  }

  // Appends a genuine SMOOTH bend -- both control and end are relative to
  // the current last point, control deliberately off the direct line.
  function bend(pts, controlDelta, toDelta) {
    const from = pts[pts.length - 1];
    const control = { x: from.x + controlDelta.dx, y: from.y + controlDelta.dy };
    const to = { x: from.x + toDelta.dx, y: from.y + toDelta.dy };
    pts.push(control, to);
    return pts;
  }

  function start(origin) {
    return [{ x: origin.x, y: origin.y }];
  }

  const ROUTES = [
    // Straight -- a 2-point route needs no curve mechanics at all.
    { id: 'go', label: 'Go', build: (o) => [{ x: o.x, y: o.y }, { x: o.x, y: o.y - 480 }] },

    // Stem, then one sharp 45-ish degree cut toward the ball.
    { id: 'slant', label: 'Slant', build: (o, s) => corner(corner(start(o), { dx: 0, dy: -120 }), { dx: -s * 180, dy: -140 }) },

    // Stem, then a sharp, mostly-flat cut to the sideline.
    { id: 'out', label: 'Out', build: (o, s) => corner(corner(start(o), { dx: 0, dy: -280 }), { dx: s * 260, dy: -20 }) },

    // Stem, then a sharp, mostly-flat cut toward the middle.
    { id: 'in', label: 'In', build: (o, s) => corner(corner(start(o), { dx: 0, dy: -360 }), { dx: -s * 300, dy: -20 }) },

    // Deeper stem, sharp diagonal break toward the middle of the field.
    { id: 'post', label: 'Post', build: (o, s) => corner(corner(start(o), { dx: 0, dy: -300 }), { dx: -s * 220, dy: -180 }) },

    // Deeper stem, sharp diagonal break toward the sideline.
    { id: 'corner', label: 'Corner', build: (o, s) => corner(corner(start(o), { dx: 0, dy: -300 }), { dx: s * 240, dy: -160 }) },

    // Stem, sharp settle back toward the LOS to face the QB.
    { id: 'hitch', label: 'Hitch', build: (o) => corner(corner(start(o), { dx: 0, dy: -220 }), { dx: 0, dy: 40 }) },

    // Stem (sharp), then a genuine smooth turn-back curve.
    { id: 'curl', label: 'Curl', build: (o, s) => bend(corner(start(o), { dx: 0, dy: -320 }), { dx: -s * 60, dy: -40 }, { dx: -s * 90, dy: 30 }) },

    // One continuous smooth arc: flat release curving into the upfield run.
    { id: 'wheel', label: 'Wheel', build: (o, s) => bend(start(o), { dx: s * 180, dy: -140 }, { dx: s * 100, dy: -420 }) },

    // Shallow stem, sharp long flat crosser.
    { id: 'drag', label: 'Drag', build: (o, s) => corner(corner(start(o), { dx: 0, dy: -100 }), { dx: -s * 480, dy: 20 }) },

    // Deeper stem, sharp long flatter crosser.
    { id: 'cross', label: 'Cross', build: (o, s) => corner(corner(start(o), { dx: 0, dy: -300 }), { dx: -s * 480, dy: -20 }) },

    // Stem, sharp out-fake, sharp break back upfield.
    { id: 'outup', label: 'Out & Up', build: (o, s) => corner(corner(corner(start(o), { dx: 0, dy: -220 }), { dx: s * 140, dy: -20 }), { dx: s * 60, dy: -240 }) },

    // Stem, sharp hitch dip, sharp continue deep.
    { id: 'stopgo', label: 'Stop & Go', build: (o) => corner(corner(corner(start(o), { dx: 0, dy: -200 }), { dx: 0, dy: 30 }), { dx: 0, dy: -300 }) },

    // Stem, sharp post-fake break, sharp break back out to the corner.
    { id: 'postcorner', label: 'Post-Corner', build: (o, s) => corner(corner(corner(start(o), { dx: 0, dy: -300 }), { dx: -s * 120, dy: -100 }), { dx: s * 260, dy: -80 }) },
  ];

  const BLOCKS = [
    { id: 'base', label: 'Base', build: (o) => [{ x: o.x, y: o.y }, { x: o.x, y: o.y - 40 }] },
    { id: 'crack', label: 'Crack', build: (o, s) => [{ x: o.x, y: o.y }, { x: o.x - s * 180, y: o.y - 60 }] },
    { id: 'cut', label: 'Cut', build: (o, s) => [{ x: o.x, y: o.y }, { x: o.x + s * 60, y: o.y + 20 }] },
  ];

  function generate(concept, origin, outwardSign) {
    return concept.build(origin, outwardSign).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  }

  window.PlayBuilderConcepts = { ROUTES, BLOCKS, generate };
})();

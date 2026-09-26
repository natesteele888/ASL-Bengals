// Route/blocking "concepts" -- one-click preset shapes for Play Builder's
// Selected Player panel. Nathan, after seeing footballplaybook.com:
// "pick from the pre-determined routes... just so much easier... Let's
// really step up our version." This is that piece -- zero schema change,
// a concept just WRITES the same PlayerAssignment.points/sameSideRoute/
// crossSideRoute array a coach could already fill in by hand, one click
// instead of many.
//
// Each concept is authored as RELATIVE step deltas (dx/dy) from the
// player's own CURRENT route origin -- not absolute field coordinates --
// so the same shape works regardless of which formation/slot/direction
// the player is in. `dy` is in this app's local coordinate convention
// (negative = upfield, toward the defense; see editor.js/mirror.js).
//
// Depth/break sizes are hand-calibrated against this app's own real,
// already-shipped route data, NOT a literal yards-per-pixel conversion --
// this field was never drawn to one consistent real-world scale (confirmed
// by comparing real anchor spacing to real football dimensions: the
// horizontal axis runs close to ~114.5 SVG units/yard, using real O-line
// splits as ground truth, while the vertical/downfield axis runs closer to
// ~40 units/yard, using real backfield/LB/safety depths as ground truth --
// a genuine ~2.8x mismatch between axes, not rounding noise, so a single
// combined "diagonal yards" number would be misleading; see editor.js's
// point-info readout, which reports the two axes separately instead of
// forcing them into one number). Every concept below stays within a
// conservative ~12-yard total upfield reach (480 units) from its own
// origin regardless of starting depth, which keeps it safely inside this
// app's own already-verified field crop (see coachtools-playbuilder.js's
// own comment on #pbField's aspect-ratio) even for a player whose route
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

  function steps(list) { return list; }

  const ROUTES = [
    { id: 'go', label: 'Go', steps: () => steps([{ dx: 0, dy: -480 }]) },
    { id: 'slant', label: 'Slant', steps: (s) => steps([{ dx: 0, dy: -120 }, { dx: -s * 180, dy: -140 }]) },
    { id: 'out', label: 'Out', steps: (s) => steps([{ dx: 0, dy: -280 }, { dx: s * 260, dy: -20 }]) },
    { id: 'in', label: 'In', steps: (s) => steps([{ dx: 0, dy: -360 }, { dx: -s * 300, dy: -20 }]) },
    { id: 'post', label: 'Post', steps: (s) => steps([{ dx: 0, dy: -300 }, { dx: -s * 220, dy: -180 }]) },
    { id: 'corner', label: 'Corner', steps: (s) => steps([{ dx: 0, dy: -300 }, { dx: s * 240, dy: -160 }]) },
    { id: 'hitch', label: 'Hitch', steps: () => steps([{ dx: 0, dy: -220 }, { dx: 0, dy: 40 }]) },
    { id: 'curl', label: 'Curl', steps: (s) => steps([{ dx: 0, dy: -320 }, { dx: -s * 40, dy: 50 }]) },
    { id: 'wheel', label: 'Wheel', steps: (s) => steps([{ dx: s * 140, dy: -20 }, { dx: s * 100, dy: -400 }]) },
    { id: 'drag', label: 'Drag', steps: (s) => steps([{ dx: 0, dy: -100 }, { dx: -s * 480, dy: 20 }]) },
    { id: 'cross', label: 'Cross', steps: (s) => steps([{ dx: 0, dy: -300 }, { dx: -s * 480, dy: -20 }]) },
    { id: 'outup', label: 'Out & Up', steps: (s) => steps([{ dx: 0, dy: -220 }, { dx: s * 140, dy: -20 }, { dx: s * 60, dy: -240 }]) },
    { id: 'stopgo', label: 'Stop & Go', steps: () => steps([{ dx: 0, dy: -200 }, { dx: 0, dy: 30 }, { dx: 0, dy: -300 }]) },
    { id: 'postcorner', label: 'Post-Corner', steps: (s) => steps([{ dx: 0, dy: -300 }, { dx: -s * 120, dy: -100 }, { dx: s * 260, dy: -80 }]) },
  ];

  const BLOCKS = [
    { id: 'base', label: 'Base', steps: () => steps([{ dx: 0, dy: -40 }]) },
    { id: 'crack', label: 'Crack', steps: (s) => steps([{ dx: -s * 180, dy: -60 }]) },
    { id: 'cut', label: 'Cut', steps: (s) => steps([{ dx: s * 60, dy: 20 }]) },
  ];

  // Turns a concept's relative steps into absolute {x,y} points starting at
  // `origin` -- the player's own CURRENT route start (editor.js's
  // applyConcept() always reuses whatever editablePointsForSelected()
  // already has as point 0, the same origin convention every other
  // lazily-seeded route in this app already uses, rather than re-deriving
  // an anchor here).
  function toAbsolutePoints(origin, stepList) {
    const points = [{ x: origin.x, y: origin.y }];
    let x = origin.x;
    let y = origin.y;
    stepList.forEach((step) => {
      x += step.dx;
      y += step.dy;
      points.push({ x: Math.round(x), y: Math.round(y) });
    });
    return points;
  }

  function generate(concept, origin, outwardSign) {
    return toAbsolutePoints(origin, concept.steps(outwardSign));
  }

  window.PlayBuilderConcepts = { ROUTES, BLOCKS, generate };
})();

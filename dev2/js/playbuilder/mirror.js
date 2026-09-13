// ============================================================
// Play Builder v2 -- mirroring.
//
// Two structurally different kinds of position, confirmed against dev2's
// actual data (formation/backfield/wing are top-level globals, never
// nested per-direction -- only paths/routes vary by direction):
//
//  - REGULAR position (O-line, 1/2/3, 5/6): standing spot is FIXED,
//    never moves for direction OR wing side (LT is always physically on
//    the left, full stop). Only which way their route/block goes flips --
//    mirrored around their OWN anchor x, not the field's center, so the
//    route's first point always still equals that fixed anchor exactly.
//
//  - WING position (today: just #4): standing spot genuinely relocates
//    to the other physical side of the field via the Wing L/R toggle,
//    independent of Direction. Rather than mirror a single authored
//    route (which can't represent "attack the near safety" vs "run a
//    genuine crossing route" -- two different SHAPES, not reflections of
//    each other), a wing position authors two routes (sameSideRoute /
//    crossSideRoute) and direction's whole effect is just picking which
//    one applies; the chosen route is then repositioned with a
//    field-center mirror only when wingSide is 'left', to actually move
//    it to that physical spot.
//
// This is what makes "the Left side quietly doesn't match Right"
// structurally impossible for both kinds: a regular position's route is
// mathematically pinned to its own fixed anchor, and a wing position's
// two route shapes are both real authored data a coach can see and edit,
// not a silent copy nobody re-checks.
// ============================================================

function getCenterX(formation) {
  const center = formation.positions.find((p) => p.id === 'C');
  if (!center) {
    throw new Error(`Formation "${formation.id}" has no "C" (center) position -- wing mirroring needs it as the reflection axis.`);
  }
  return center.x;
}

function reflect(x, axisX) {
  return axisX + (axisX - x);
}

function isWingPosition(formation, positionId) {
  return (formation.wingPositionIds || []).includes(positionId);
}

/**
 * A regular (non-wing) position's fixed anchor -- same regardless of
 * wingSide/direction, by definition.
 * @param {import('./schema.js').Formation} formation
 * @param {number|string} positionId
 */
function getFixedAnchor(formation, positionId) {
  const pos = formation.positions.find((p) => p.id === positionId);
  if (!pos) throw new Error(`Formation "${formation.id}" has no position "${positionId}".`);
  return { x: pos.x, y: pos.y };
}

/**
 * @param {import('./schema.js').Formation} formation
 * @param {number|string} positionId
 * @param {{ wingSide: 'left'|'right' }} options - direction does NOT affect anchor, only wingSide does
 */
function resolveAnchor(formation, positionId, { wingSide }) {
  const anchor = getFixedAnchor(formation, positionId);
  if (isWingPosition(formation, positionId) && wingSide === 'left') {
    return { x: reflect(anchor.x, getCenterX(formation)), y: anchor.y };
  }
  return anchor;
}

/**
 * @param {import('./schema.js').Formation} formation
 * @param {import('./schema.js').PlayerAssignment} assignment
 * @param {{ wingSide: 'left'|'right', direction: 'left'|'right' }} options
 * @returns {import('./schema.js').RoutePoint[]}
 */
function resolveRoute(formation, assignment, { wingSide, direction }) {
  if (isWingPosition(formation, assignment.player)) {
    const sameSide = wingSide === direction;
    const points = sameSide ? assignment.sameSideRoute : assignment.crossSideRoute;
    if (!points) {
      throw new Error(`Wing position ${assignment.player} is missing its ${sameSide ? 'sameSideRoute' : 'crossSideRoute'}.`);
    }
    if (wingSide !== 'left') return points;
    const centerX = getCenterX(formation);
    return points.map((pt) => ({ x: reflect(pt.x, centerX), y: pt.y }));
  }

  // Regular position: route mirrors LOCALLY around the player's own fixed
  // anchor when direction is 'left' -- never around the field center --
  // so the route's own first point always exactly equals getFixedAnchor(),
  // the same guarantee that was missing for Pop Pass's #4 originally.
  if (direction !== 'left') return assignment.points;
  const anchor = getFixedAnchor(formation, assignment.player);
  return assignment.points.map((pt) => ({ x: reflect(pt.x, anchor.x), y: pt.y }));
}

window.PlayBuilderMirror = { resolveRoute, resolveAnchor, getFixedAnchor, getCenterX, reflect };

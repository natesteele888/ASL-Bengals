// ============================================================
// Play Builder v2 -- mirroring.
//
// Four structurally different kinds of position, confirmed against dev2's
// actual data (formation/backfield/wing are top-level globals, never
// nested per-direction -- only paths/routes vary by direction):
//
//  - REGULAR position (O-line, Shotgun's 1/2/3): standing spot is FIXED,
//    never moves for direction OR wing side (LT is always physically on
//    the left, full stop). Only which way their route/block goes flips --
//    mirrored around their OWN anchor x, not the field's center, so the
//    route's first point always still equals that fixed anchor exactly.
//
//  - WING position (Shotgun/Split's #4): standing spot genuinely
//    relocates to the other physical side of the field via the Wing L/R
//    toggle, independent of Direction. Rather than mirror a single
//    authored route (which can't represent "attack the near safety" vs
//    "run a genuine crossing route" -- two different SHAPES, not
//    reflections of each other), a wing position authors two routes
//    (sameSideRoute/crossSideRoute) and direction's whole effect is just
//    picking which one applies; the chosen route is then repositioned
//    with a field-center mirror only when wingSide is 'left'.
//
//  - SWAP-PAIR position (Split's 5/6): confirmed against dev2's real
//    digitized Split data, these are NOT reflections of themselves --
//    Left's 5 is the reflection of Right's 6, and vice versa (whichever
//    number is "wide" swaps with whichever is "flex" when the play runs
//    the other way). See schema.js's Formation.mirrorSwapPairs.
//
//  - CENTER-MIRROR position (Split's 3): also confirmed against real
//    data -- Left's 3 is a straight field-center reflection of Right's 3
//    (not a LOCAL reflection around its own anchor the way a regular
//    position is, and not a swap with anyone else, it just genuinely
//    relocates across the formation like a wing position does, minus the
//    two-shape same/cross-side authoring a real independent wingSide
//    toggle needs). See schema.js's Formation.centerMirrorPositionIds.
//
// This is what makes "the Left side quietly doesn't match Right"
// structurally impossible for all four kinds: a regular position's route
// is mathematically pinned to its own fixed anchor, a wing position's two
// route shapes are both real authored data a coach can see and edit (not
// a silent copy nobody re-checks), a swap-pair position's Left identity
// is computed directly from its partner's own real data, and a center-
// mirror position's Left identity is computed directly from its own Right
// data -- none of the four leave room for a second, separately-authored
// copy to quietly drift.
// ============================================================
//
// IIFE-wrapped so none of these function names (reflect, getCenterX, etc.
// -- plausible enough to collide with something else in a large, still-
// growing real app) leak into the shared classic-script global scope.
// Nothing outside this file ever calls them by bare name -- every real
// caller (js/playbuilder/editor.js, formation-editor.js, copy-across-
// formations.js, legacy-adapter.js) already goes through
// window.PlayBuilderMirror, confirmed before wrapping.
(function () {

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
 * A DefenseLook's positions, reflected for direction='left' -- schema.js's
 * own DefenseLook doc already said "one mirror pass on direction is all a
 * defense look ever needs," but nothing had actually implemented it (js/
 * playbuilder/legacy-adapter.js's fbLegacyBuildLeaf used the same absolute
 * defender positions for both directions). A defender's x is a straight
 * field-center reflection, same math as every other center-mirror case in
 * this file -- there's no per-defender "kind" to account for the way
 * offense has REGULAR/WING/SWAP-PAIR/CENTER-MIRROR (a starting alignment
 * has no routes to preserve the shape of, just standing spots). Right
 * (direction !== 'left') returns positions completely unchanged, not even
 * a clone -- so a caller that never asks for 'left' pays nothing extra.
 * @param {{id:string,label:string,x:number,y:number}[]} positions
 * @param {'left'|'right'} direction
 * @param {number} centerX
 */
function reflectDefensePositions(positions, direction, centerX) {
  if (direction !== 'left') return positions;
  return positions.map((p) => Object.assign({}, p, { x: reflect(p.x, centerX) }));
}

/**
 * The OTHER member of positionId's swap pair, or null if positionId isn't
 * part of one. See schema.js's Formation.mirrorSwapPairs doc.
 * @param {import('./schema.js').Formation} formation
 * @param {number|string} positionId
 */
function findSwapPartner(formation, positionId) {
  const pairs = formation.mirrorSwapPairs || [];
  for (const pair of pairs) {
    if (pair[0] === positionId) return pair[1];
    if (pair[1] === positionId) return pair[0];
  }
  return null;
}

/**
 * True if positionId reflects around the formation center on its own,
 * with no swap partner. See schema.js's Formation.centerMirrorPositionIds.
 * @param {import('./schema.js').Formation} formation
 * @param {number|string} positionId
 */
function usesCenterMirror(formation, positionId) {
  return (formation.centerMirrorPositionIds || []).includes(positionId);
}

/**
 * A regular (non-wing) position's fixed anchor -- same regardless of
 * wingSide/direction, by definition. `alignment` (an AlignmentToggle value
 * id, schema.js) swaps in that value's own alternate anchor when the
 * position has one (FormationPosition.alignments) -- omitted, or a
 * position with no alignments override for it, falls straight back to the
 * position's own base x/y, so every existing caller that never passes
 * this is completely unaffected.
 * @param {import('./schema.js').Formation} formation
 * @param {number|string} positionId
 * @param {string} [alignment]
 */
function getFixedAnchor(formation, positionId, alignment) {
  const pos = formation.positions.find((p) => p.id === positionId);
  if (!pos) throw new Error(`Formation "${formation.id}" has no position "${positionId}".`);
  const alt = alignment && pos.alignments && pos.alignments[alignment];
  return alt ? { x: alt.x, y: alt.y } : { x: pos.x, y: pos.y };
}

/**
 * @param {import('./schema.js').Formation} formation
 * @param {number|string} positionId
 * @param {{ wingSide: 'left'|'right', direction: 'left'|'right', alignment?: string }} options -
 *   direction only matters for a swap-pair position; every other regular
 *   position's anchor is genuinely fixed regardless of either toggle.
 *   alignment (an AlignmentToggle value id) only matters for a position
 *   the formation's own alignmentToggles covers -- see getFixedAnchor.
 */
function resolveAnchor(formation, positionId, { wingSide, direction, alignment }) {
  if (isWingPosition(formation, positionId)) {
    const anchor = getFixedAnchor(formation, positionId, alignment);
    if (wingSide === 'left') return { x: reflect(anchor.x, getCenterX(formation)), y: anchor.y };
    return anchor;
  }
  if (direction === 'left') {
    const partnerId = findSwapPartner(formation, positionId);
    if (partnerId != null) {
      const partnerAnchor = getFixedAnchor(formation, partnerId);
      return { x: reflect(partnerAnchor.x, getCenterX(formation)), y: partnerAnchor.y };
    }
    if (usesCenterMirror(formation, positionId)) {
      const anchor = getFixedAnchor(formation, positionId);
      return { x: reflect(anchor.x, getCenterX(formation)), y: anchor.y };
    }
  }
  return getFixedAnchor(formation, positionId, alignment);
}

/**
 * @param {import('./schema.js').Formation} formation
 * @param {import('./schema.js').PlayerAssignment[]} players - the current
 *   variant's full players list (not just one assignment) -- resolving a
 *   swap-pair member's Left-side route needs its PARTNER's own data, not
 *   just its own.
 * @param {number|string} playerId
 * @param {{ wingSide: 'left'|'right', direction: 'left'|'right', alignment?: string }} options -
 *   alignment (an AlignmentToggle value id, schema.js) only matters for a
 *   position the formation's own alignmentToggles covers -- looks up
 *   assignment.alignmentOverrides[alignment] first, falling back to this
 *   assignment's own top-level fields for anything that value didn't
 *   override. Omitted (every existing caller) behaves exactly as before.
 * @returns {import('./schema.js').RoutePoint[]|null} null if this player has no assignment yet
 */
function resolveRoute(formation, players, playerId, { wingSide, direction, alignment }) {
  const assignment = players.find((p) => p.player === playerId);
  if (!assignment) return null;
  const alignmentData = (alignment && assignment.alignmentOverrides && assignment.alignmentOverrides[alignment]) || null;

  if (isWingPosition(formation, playerId)) {
    const sameSide = wingSide === direction;
    const points = sameSide
      ? ((alignmentData && alignmentData.sameSideRoute) || assignment.sameSideRoute)
      : ((alignmentData && alignmentData.crossSideRoute) || assignment.crossSideRoute);
    if (!points) {
      throw new Error(`Wing position ${playerId} is missing its ${sameSide ? 'sameSideRoute' : 'crossSideRoute'}.`);
    }
    if (wingSide !== 'left') return points;
    const centerX = getCenterX(formation);
    return points.map((pt) => ({ x: reflect(pt.x, centerX), y: pt.y }));
  }

  // Most specific wins: an explicit, independently-authored route for
  // THIS EXACT direction (schema.js's own PlayerAssignment.overrides doc)
  // overrides even swap-pair/center-mirror handling below -- a coach who
  // drew a real one-off route for this direction means it, regardless of
  // what the formation-level swap/mirror machinery would otherwise
  // compute. Keyed by direction ONLY, never wingSide -- a regular
  // position's rendered route genuinely never depends on wingSide in
  // this system (confirmed: nothing below this point ever reads it for
  // a regular position), and js/playbuilder/legacy-adapter.js's own
  // fbLegacyBuildLeaf always calls this with wingSide pinned to 'left'
  // as an internal baking convention unrelated to the real formation-
  // level wingSide -- a wingSide-keyed override would silently never be
  // found once baked, a real bug caught before it shipped.
  // ...EXCEPT when a non-default alignment ALSO has its own explicit
  // route for this position (alignmentOverrides[value].points) -- that
  // reflects a more fundamental fact (where the player is actually
  // STANDING) than a direction-only technique authored assuming the
  // formation's DEFAULT alignment, so it wins instead. Real, confirmed
  // collision, not hypothetical -- schema.js's own PlayerAssignment.
  // overrides doc already flagged this as "not yet supported," and I's
  // own real Sweep data hits it directly: #5/#6 each have BOTH a real
  // `overrides.left` (a genuine per-direction O-line pulling technique)
  // AND `alignmentOverrides.right`/`.left` (their real Overload-shifted
  // spot) on the SAME play. Nathan, on "I Wing": "if overload is L, wing
  // is R, the 4 (wing) is too far down on the presnap alignment... make
  // sure the pre-snap and post-snap alignments are correct" -- without
  // this check, the direction override always won regardless of
  // Overload, stranding the moved player's drawn route at his OLD,
  // un-shifted spot while his CIRCLE (a completely separate, live
  // resolveAnchor call, unaffected by this bug) correctly showed him
  // overloaded -- the exact circle/path mismatch he was seeing. Only
  // skips the direction override when alignmentData genuinely has its
  // own `.points` to offer; falls through to it unchanged otherwise, so
  // every position with only ONE of the two mechanisms is unaffected.
  const hasAlignmentPoints = !!(alignmentData && alignmentData.points);
  if (assignment.overrides && !hasAlignmentPoints) {
    const key = direction;
    if (assignment.overrides[key]) return assignment.overrides[key];
  }

  if (direction === 'left') {
    const partnerId = findSwapPartner(formation, playerId);
    if (partnerId != null) {
      // A swap-pair member's Left-side identity genuinely IS the other
      // player's data, reflected around the formation center -- not a
      // local reflection of its own route. Falls back to this player's
      // own (locally-mirrored) route below if the partner hasn't been
      // authored yet, so an in-progress play never renders nothing.
      const partnerAssignment = players.find((p) => p.player === partnerId);
      if (partnerAssignment && partnerAssignment.points) {
        const centerX = getCenterX(formation);
        return partnerAssignment.points.map((pt) => ({ x: reflect(pt.x, centerX), y: pt.y }));
      }
    } else if (usesCenterMirror(formation, playerId) && assignment.points) {
      const centerX = getCenterX(formation);
      return assignment.points.map((pt) => ({ x: reflect(pt.x, centerX), y: pt.y }));
    }
  }

  // Regular position: route mirrors LOCALLY around the player's own fixed
  // anchor when direction is 'left' -- never around the field center --
  // so the route's own first point always exactly equals getFixedAnchor(),
  // the same guarantee that was missing for Pop Pass's #4 originally.
  // assignment.directionIndependent (schema.js's own PlayerAssignment doc)
  // opts a specific player OUT of that default for a specific play --
  // confirmed necessary against real data: an O-line zone-block technique
  // that's genuinely the SAME regardless of which back ends up carrying,
  // not a locally-mirrored one. Unset/false for every assignment nothing
  // has ever opted in for, so this changes nothing already relied on.
  const points = (alignmentData && alignmentData.points) || assignment.points;
  if (direction !== 'left' || assignment.directionIndependent) return points;
  const anchor = getFixedAnchor(formation, playerId, alignment);
  return points.map((pt) => ({ x: reflect(pt.x, anchor.x), y: pt.y }));
}

window.PlayBuilderMirror = { resolveRoute, resolveAnchor, getFixedAnchor, getCenterX, reflect, findSwapPartner, reflectDefensePositions };

})();

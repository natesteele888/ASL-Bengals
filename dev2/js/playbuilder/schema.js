// ============================================================
// Play Builder v2 -- data model.
//
// Design goal: every player's route is the SAME kind of object, full
// stop. No player === 4 special case, no wingSeamRelative/blockRelative/
// motionIndependentBlock/dualSideBlock branches, no chip-block panel
// that only some positions get. That special-casing is the entire reason
// a one-line-looking fix to Pop Pass took a week and needed a stale
// Firebase node (playEdits.json shadowing dev2PlayData/plays.json)
// tracked down before it would even show up live -- see the ASL Bengals
// repo's commit history from 2026-09-12 for the full story if it's ever
// unclear why this rebuild exists.
//
// Left/Right and run-direction are NOT separately authored data anymore.
// A play is authored ONCE, canonically, and the viewer/editor mirrors it
// (flip x around the formation's center line) for the other wing side or
// direction. Today's dev2 stores Left and Right as separately-authored
// (and frequently just silently identical, or silently drifted) copies --
// that duplication is exactly how Pop Pass's Left side could be wrong
// without anyone noticing for a week. One canonical version, computed
// mirrors, means there is no "other copy" to drift.
// ============================================================

/**
 * @typedef {Object} FormationPosition
 * @property {number|string} id - player number (1-6) or an O-line id ("LT","LG","C","RG","RT")
 * @property {string} [label] - display label; defaults to String(id) if omitted
 * @property {number} x
 * @property {number} y
 */

/**
 * A reusable, named set of starting positions. Saved once, referenced by
 * many plays (Play.formationId) -- this is the "have formation setups and
 * then pick them to assign to plays" piece. Authored for the canonical
 * (wing-right, direction-right) side; every other combination is a mirror
 * computed at render time, see mirror.js.
 *
 * @typedef {Object} Formation
 * @property {string} id
 * @property {string} label
 * @property {'shotgun'|'split'} type
 * @property {FormationPosition[]} positions
 * @property {(number|string)[]} wingPositionIds - which position(s) can flip
 *   side independently of the play's overall direction (today: just #4).
 *   Dev2 has both a "Wing L/R" toggle (where THIS player lines up) and a
 *   separate "Dir L/R" toggle (which way the whole play runs) -- most
 *   positions only ever care about direction, but a wing position's actual
 *   standing spot is its own independent choice. See mirror.js for how the
 *   two compose.
 */

/**
 * One point in a route. Plain field coordinates, nothing anchor-relative,
 * nothing player-number-conditional. Every point in a route -- including
 * the first -- is freely draggable/addable/removable in the editor. A
 * route's first point does not have to match the player's formation
 * position exactly (usually will, for realism), but nothing in the data
 * model FORCES it to, the way today's player===4 handling does.
 *
 * @typedef {Object} RoutePoint
 * @property {number} x
 * @property {number} y
 */

/**
 * One player's assignment within one play variant. Almost every position
 * uses `points` -- a single route, mirrored as a whole when the play's
 * direction flips. A position listed in Formation.wingPositionIds instead
 * uses `sameSideRoute`/`crossSideRoute`: which one applies is resolved
 * from whether this player's wing side matches the play's direction or
 * not (see mirror.js), same idea as dev2's old sameSideOffsets/
 * crossOffsets but as plain absolute points instead of anchor-relative
 * offsets, and reusing the exact same RoutePoint[] shape `points` uses --
 * not a third, different data format.
 *
 * @typedef {Object} PlayerAssignment
 * @property {number|string} player - matches a Formation position's id
 * @property {RoutePoint[]} [points] - for non-wing positions. Length 2 =
 *   straight line, 3 = one curve bend, more = a more complex path; every
 *   point, including the first, is freely draggable/addable/removable.
 * @property {RoutePoint[]} [sameSideRoute] - for wing positions only, used
 *   when wingSide === direction
 * @property {RoutePoint[]} [crossSideRoute] - for wing positions only, used
 *   when wingSide !== direction
 * @property {boolean} hasBall - true if this player is the one carrying/
 *   catching the ball for this segment
 * @property {number} delayMs - how long after the snap this player's route
 *   starts; the "fine-tune timing if it isn't what you want" knob,
 *   available to every player uniformly, not just some
 * @property {'run'|'block'} endType - visual end-cap only; does not gate
 *   which editing features are available the way isBlocking implicitly did
 *   before
 */

/**
 * The ball's path through the play as a sequence of carriers -- replaces
 * the old ball/ballStart/handoffIndex fields scattered across whichever
 * path objects happened to be involved. One list, one place, in order.
 *
 * @typedef {Object} BallCarrierSegment
 * @property {number|string} player
 * @property {number} fromPointIndex - index into that player's own points array
 */

/**
 * A named alternate version of a play (what dev2 currently calls a
 * "variant" like Pop/Pop2, or Normal/Counter) -- NOT a Left/Right/
 * direction split, those are mirrors, not variants. Only players who
 * differ from the base variant need an entry; anyone not listed inherits
 * the base variant's assignment for that player unchanged.
 *
 * @typedef {Object} PlayVariant
 * @property {string} id
 * @property {string} label
 * @property {PlayerAssignment[]} players
 * @property {BallCarrierSegment[]} ballCarrierSequence
 */

/**
 * A reusable, named set of defender positions for the diagram -- same
 * "save once, pick it for a play" idea as Formation, kept as its own thing
 * since defense doesn't need wing-position independence (nobody's marking
 * a defender as an independently-flippable wing spot). One mirror pass on
 * `direction` is all a defense look ever needs.
 *
 * @typedef {Object} DefenseLook
 * @property {string} id
 * @property {string} label
 * @property {{ id: string, label: string, x: number, y: number }[]} positions
 */

/**
 * @typedef {Object} Play
 * @property {string} id
 * @property {string} label
 * @property {string} formationId - references a Formation.id
 * @property {string} defenseLookId - references a DefenseLook.id
 * @property {PlayVariant[]} variants - variants[0] is always the base/default
 */

// JSDoc-only file -- no runtime code. Loaded as a plain <script> like every
// other dev2 file (this repo has no build step and no ES module loading),
// so this exists purely for editor autocomplete/documentation, not import.

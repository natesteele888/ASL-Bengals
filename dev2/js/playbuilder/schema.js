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
 * @property {Object.<string, {x:number,y:number}>} [alignments] - alternate
 *   anchor, keyed by an AlignmentToggle value id, for a position this
 *   formation's alignmentToggles covers. Omit entirely for a position with
 *   no alignment toggle, or for its toggle's own default value (x/y above
 *   already IS that default). See Formation.alignmentToggles.
 */

/**
 * A formation-level, independent on/off (or multi-value) choice for one or
 * more positions -- e.g. Nathan's "I" formation: #4 is a Wing-kind position
 * (its own L/R toggle, same as every other wing position) that ALSO needs a
 * second, orthogonal choice -- tucked in tight next to #2 ("Heavy") or out
 * at a normal wing depth -- pickable independently of which play is called
 * or which side he's lined up on. Not a PlayVariant (that's "a different
 * play," authored per-play) and not wingPositionIds (that's the L/R side
 * axis, already composes with this one) -- a THIRD, general axis so a coach
 * can add one of these without needing new code each time, the same way
 * Wing L/R and Direction L/R already don't need per-toggle code.
 *
 * @typedef {Object} AlignmentToggle
 * @property {string} id - e.g. 'heavy'
 * @property {string} label - e.g. 'Heavy'
 * @property {(number|string)[]} positionIds - which of this formation's
 *   positions this toggle affects (a position can be covered by at most
 *   one alignment toggle)
 * @property {{id: string, label: string}[]} values - e.g.
 *   [{id:'off',label:'Off'},{id:'on',label:'On'}]. First value is the
 *   default -- a FormationPosition's own x/y and a PlayerAssignment's own
 *   top-level route fields already ARE that default value's data; only
 *   non-default values need an entry in .alignments / .alignmentOverrides.
 * @property {boolean} [compactValues] - js/play-calls.js's real card shows
 *   every alignmentToggle in ONE shared slot (the same one Read A/B/
 *   Counter/Pop Pass 2 already share) -- fine for a 2-value toggle prefixed
 *   with its own label ("Heavy On"/"Heavy Off"), but a 3+-value toggle
 *   (Overload: Off/Right/Left) overflowed it that way (confirmed live,
 *   Nathan: "make It Overload (R,L, Off)"). Set true and give `values` its
 *   own short labels ("Off"/"R"/"L") to render as one label ONCE (the
 *   toggle's own `label`) plus bare, compact pills next to it, instead of
 *   repeating the toggle's label on every pill. Omit for the normal,
 *   Heavy-style prefixed rendering.
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
 * @property {Object.<string,{x:number,y:number}>} [wingLeftAnchors] -
 *   explicit, literal alternate anchor for a REGULAR position (keyed by
 *   position id, e.g. "2"), used ONLY when wingSide is 'left'. A REAL,
 *   different need than wingPositionIds/wingMirrorPlayers: on "5 Guys"
 *   (5-wide, empty, wingPositionIds:[4]), when the wing (#4) moves to a
 *   side, he needs the OTHER two receivers already there to make room --
 *   but Nathan was explicit those two never cross sides: "Make sure the
 *   3 and 5 remain the inside receivers on the left and 6 and 2 are on
 *   the right" (#4 is the only one whose SIDE changes). So this is not a
 *   reflection/swap (nothing here crosses the center) -- each covered
 *   position just gets a real, authored, alternate x/y for wingSide=left,
 *   computed to preserve real spacing/order once the wing joins that
 *   side (or leaves it): "the 3, 5, 2 and 6 all have to slide... so the
 *   spacing on the left side is the same as it was on the right side."
 *   A position with no entry here keeps its normal (wingSide=right, i.e.
 *   base x/y) anchor for BOTH sides -- omit entirely for a formation
 *   where no regular position's spot depends on wing side at all (every
 *   formation but "5 Guys" today). A play whose route for this position
 *   needs to start from the new anchor (almost always true) also needs
 *   PlayerAssignment.wingLeftRoute for the SAME position -- see its own
 *   doc; the anchor alone only moves the circle, not the line drawn from
 *   it.
 * @property {(number|string)[][]} [mirrorSwapPairs] - pairs of REGULAR
 *   (non-wing) position ids that swap which player's canonical anchor/route
 *   feeds which visual slot when direction is 'left', reflected around the
 *   formation's center line. Confirmed against dev2's real digitized Split
 *   data: Split's players 5 and 6 are NOT reflections of themselves the way
 *   an O-lineman is -- Left's 5 is the reflection of Right's 6, and vice
 *   versa (5 is always "wide", 6 is always "flex", or the reverse, whichever
 *   side the formation is run to). Modeled on FormationBuilder's own
 *   DEFAULT_SWAP (js/formation-builder.js). Omit entirely for formations
 *   with no swap positions (e.g. Shotgun, where every regular position's
 *   standing spot is genuinely fixed regardless of direction).
 * @property {(number|string)[]} [centerMirrorPositionIds] - REGULAR
 *   position ids that reflect around the formation center on their OWN
 *   (not a local reflection around their own anchor, and not a swap with
 *   any other player) when direction is 'left'. Also confirmed against
 *   real Split data: player 3's Left anchor/route is a straight
 *   field-center reflection of its Right anchor/route -- it genuinely
 *   relocates across the formation, same as a wing position, but doesn't
 *   need a wing position's second (same/cross-side) authored shape since
 *   nothing about it is independent of direction the way #4's own
 *   standing side can be.
 * @property {AlignmentToggle[]} [alignmentToggles] - independent, general
 *   choices like Heavy (see AlignmentToggle's own doc) -- omit entirely for
 *   a formation with none.
 * @property {number} [touchCardId] - which hand-signal card (window.
 *   ALL_CARDS / js/signals.js's Signals.PENDING_IDS, any group -- not
 *   just 'Play Call') a coach flashes first to say "this play's coming
 *   from THIS formation," before naming the specific play. Picked in the
 *   Formations screen's own "Touch card" selector. Omit for a formation
 *   with none set yet -- js/playbuilder/editor.js's signal-sequence
 *   preview falls back to js/signals.js's own hardcoded
 *   TOUCH_CARD_BY_FORMATION (wing/split) in that case, or an honest "no
 *   card set" placeholder for anything else.
 * @property {{flanker: (number|string), flankerAnchors: Object.<string,{x:number,y:number}>}} [overload] -
 *   Nathan's I-formation "Overload" call (a real `alignmentToggles` entry
 *   on positions 5/6 handles the tight-end stacking itself -- this field
 *   is ONLY the flanker's own extra shift). `flanker` (I: #4) is already
 *   covered by a DIFFERENT alignment toggle (Heavy) -- a position can only
 *   be covered by one (AlignmentToggle's own doc), so this can't just be a
 *   3rd toggle value. `flankerAnchors.right`/`.left` are his precomputed,
 *   absolute anchor for "Heavy is off (he's already out at a real wing
 *   depth) AND Overload is called to HIS OWN current wing side" -- the one
 *   scenario Nathan actually described and the only one this applies to;
 *   confirmed live, he collides with the newly-arrived 2nd tight end
 *   otherwise. Each is computed the same way js/formations.js's own
 *   (older, Wing-only) applyOverload already does: the flanker keeps the
 *   same gap from the front tight end that he had before, now measured
 *   from the BACK tight end's own new (overloaded) spot. Read directly by
 *   js/play-calls.js's p4AnchorOn -- not resolved through mirror.js, since
 *   it depends on TWO toggles' current values at once (Heavy AND
 *   Overload), which resolveAnchor's single `alignment` param can't
 *   express.
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
 * @property {boolean} [directionIndependent] - for a REGULAR (non-wing,
 *   non-swap, non-center-mirror) position's `points` only: when true, this
 *   exact route applies for BOTH directions, skipping the usual local
 *   mirror-around-own-anchor for direction='left'. Confirmed necessary
 *   against real shipped data (js/playbuilder/legacy-adapter.js's
 *   verification): Inside Zone's O-line blocks are the SAME regardless of
 *   which back ends up carrying -- not a mirrored technique, the identical
 *   one authored once. Defaults to false/unset, which is the ordinary
 *   local-mirror behavior every existing Phase 0-4 formation/play already
 *   relies on -- this is a per-play, per-player opt-OUT of that default,
 *   never a change to it.
 * @property {Object.<string, {points?: RoutePoint[], sameSideRoute?:
 *   RoutePoint[], crossSideRoute?: RoutePoint[], hasBall?: boolean,
 *   endType?: 'run'|'block', delayMs?: number}>} [alignmentOverrides] -
 *   for a position covered by its Formation's alignmentToggles only, keyed
 *   by that toggle's non-default value id (e.g. 'on' for Heavy). Same
 *   inherit-unless-overridden rule as PlayVariant: only the fields that
 *   genuinely differ for that alignment need an entry -- anything omitted
 *   falls back to this assignment's own top-level field. In practice a
 *   position whose STANDING SPOT changes by alignment (Heavy moves #4's
 *   anchor, not just his route -- see FormationPosition.alignments) will
 *   usually need a full route/anchor rewrite per alignment, same as it
 *   already needs two full shapes for sameSideRoute/crossSideRoute.
 * @property {Object.<string, RoutePoint[]>} [overrides] - for a REGULAR
 *   (non-wing) position only: an explicit, independently-authored route
 *   for a SPECIFIC wingSide+direction combination, keyed
 *   `"<wingSide>:<direction>"` (e.g. `"left:left"`, `"right:left"`) --
 *   used AS-IS (absolute points, no further mirror/reflection) instead
 *   of the default local-mirror-around-own-anchor. The all-default
 *   combination ("right:right") is never a key here -- that's just this
 *   assignment's own top-level `points`, unchanged. Nathan: "regardless
 *   of toggles, all players paths should be allowed to be edited. It is
 *   fine to default to a side, but if I click a player, I should be able
 *   to edit their path and it should save for them on the exact play
 *   call and not affect other variations of the play with different
 *   toggle selections." The default mirror assumption (this whole
 *   rebuild's own starting principle, to stop Pop Pass's Left side
 *   silently drifting) is still the real default for every combination
 *   with no entry here; this is the general escape hatch for a
 *   combination that genuinely needs to be a one-off (e.g. Dive's #3/#4
 *   doing the identical thing regardless of which way the ball actually
 *   goes). Checked BEFORE `directionIndependent` in mirror.js's
 *   resolveRoute -- a position only ever needs one of the two. Does not
 *   currently compose with alignmentOverrides (a position covered by
 *   both an alignment toggle and one of these overrides at once isn't
 *   yet supported -- no real play has needed both together).
 * @property {RoutePoint[]} [wingLeftRoute] - explicit, absolute route used
 *   for THIS position on THIS play when wingSide is 'left' AND the
 *   formation's own Formation.wingLeftAnchors covers this position (see
 *   its doc) -- the anchor alone only moves the circle; this is what
 *   makes the actual drawn line start from the new spot instead of the
 *   old one. Not resolved through mirror.js at all (unlike `overrides`
 *   above, a DIFFERENT axis keyed by direction) -- read directly at
 *   render time from the real Play Builder V2 Play object, the same way
 *   #4's own same/cross-side routes are, since it depends on the LIVE
 *   wingSide toggle a formation-agnostic bake can't anticipate. Omit for
 *   a position wingLeftAnchors doesn't cover, or one whose route
 *   genuinely doesn't need to change shape (rare -- almost always needed
 *   together with the anchor).
 * @property {boolean} [wingLeftHasBall] - overrides `hasBall` (above) for
 *   THIS position when wingSide is 'left'. "5 Guys": the play-call number
 *   names a left-to-right SLOT ("throw to the #1 receiver"), not a fixed
 *   jersey number -- Nathan: "the target refers to the 1st position going
 *   from receivers left to right... when the wing switches to the other
 *   side, the wing becomes the outside guy making him position 1 and the
 *   3 is now in position 2." So WHO is featured on a given play rotates
 *   to a different player when Wing flips, not just where the same
 *   player is drawn -- e.g. on "5 Guys #1", #3 carries at wingSide=right
 *   (`hasBall:true`, unchanged) but #4 carries at wingSide=left
 *   (`wingLeftHasBall:true` on #4's OWN assignment; #3's own assignment
 *   gets `wingLeftHasBall:false` to override his plain `hasBall:true`,
 *   since he's no longer featured once Wing flips). Read live off the
 *   real Play Builder V2 Play object at render time (same reasoning as
 *   wingLeftRoute just above) -- never baked by the adapter, since the
 *   adapter has no live wingSide to bake against. Works for a WING
 *   position (like #4) too, not just ones wingLeftAnchors covers, since
 *   it's a plain data lookup keyed by player id, independent of the
 *   anchor/route mechanism. Falls back to `hasBall` when unset -- a
 *   no-op for every position/play that's never touched by this.
 * @property {RoutePoint[]} [overloadOppositeRoute] - explicit, absolute
 *   route for a WING position (like #4), used INSTEAD of the normal
 *   sameSideRoute/crossSideRoute selection whenever the formation's
 *   `overload` alignment toggle is set to the side OPPOSITE this
 *   position's OWN current wingSide (e.g. Wing Left + Overload Right).
 *   Nathan: "I Wing Left Overload Right Blast Left. The wing needs to
 *   come in off the LT since the TE is in overload to the Right" -- a
 *   real technique change (release inside off the tackle instead of
 *   outside toward the corner), driven by a RELATIONSHIP between two
 *   toggles (wingSide vs. overload's value), not a fixed value either
 *   toggle can reach alone -- `alignmentOverrides` (above) can't express
 *   this, since it's keyed by one toggle's own absolute value, not a
 *   comparison between two. Authored in the SAME canonical frame as
 *   sameSideRoute/crossSideRoute (wingSide='right'); reflected around
 *   field center at render time when this position's actual wingSide is
 *   'left' -- same reflection js/play-calls.js already does for #4's
 *   older "plain points" convention, reused rather than reinvented. Read
 *   live off the real Play Builder V2 Play object (window.
 *   PlayBuilderPlaysById), same reasoning as wingLeftRoute above, since
 *   it depends on the LIVE overload toggle value a formation-agnostic
 *   bake can't anticipate. Omit for a position/play where Overload
 *   opposite-side doesn't change technique (the common case).
 */

/**
 * The ball's path through the play as an ordered list of legs -- replaces
 * the old ball/ballStart/handoffIndex fields scattered across whichever
 * path objects happened to be involved. One list, one place, in order.
 *
 * Reuses js/ball-path.js's own real, already-proven shape exactly (not a
 * simplified from-scratch design) -- that module's EXCHANGES/describe/
 * drawOverlay/schedule all key off this exact structure, and
 * js/ball-path-editor.js's BallPathEditor authors it directly via
 * "tap the players in order." `at` is an explicit point (not an index
 * into anyone's route), since an exchange is its own place on the field --
 * usually near the midpoint between giver and receiver, but a coach can
 * drag it whereever the real mesh point is. Timing is derived at
 * render/animate time from how far along the RECEIVER's own route that
 * point falls (js/ball-path.js's fractionAlongPath), not authored here.
 *
 * @typedef {Object} BallPathLeg
 * @property {number|string} player - who has it for this leg
 * @property {number[]} [at] - [x,y], omitted for the first leg (the snap,
 *   which is always at the formation's center)
 * @property {'handoff'|'pitch'|'reverse'|'pass'|'keep'} [how] - omitted for
 *   the first leg; js/ball-path.js's EXCHANGES has the full set + labels
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
 * @property {BallPathLeg[]} [ballPath] - same inherit-unless-overridden
 *   rule as players: empty/omitted on a NON-base variant means "same ball
 *   path as base," not "nobody has it" -- only the base variant's own
 *   empty ballPath means that literally. (today's boolean hasBall
 *   checkboxes on each PlayerAssignment keep working either way -- this is
 *   additive, not a replacement for them)
 * @property {BallPathLeg[]} [wingLeftBallPath] - the ballPath sibling of
 *   PlayerAssignment.wingLeftHasBall above -- used instead of `ballPath`
 *   when wingSide is 'left', for the same "5 Guys" reason: the exchange
 *   TARGET (not just where he's drawn) rotates to a different player when
 *   Wing flips. Omit unless the play genuinely reaches a different
 *   receiver at wingSide=left (i.e. unless some PlayerAssignment on this
 *   play sets wingLeftHasBall) -- every other play just keeps using
 *   `ballPath` for both wingSides, correctly. Read live off the real Play
 *   Builder V2 Play object, same as wingLeftRoute/wingLeftHasBall -- never
 *   baked by the adapter, which only ever bakes ONE, direction-varying
 *   ballPath per PlayType and has no live wingSide to bake a second one
 *   against.
 * @property {BallPathLeg[]} [directionLeftBallPath] - the direction-axis
 *   sibling of wingLeftBallPath -- used instead of `ballPath` when
 *   `direction` is 'left', for a play where the GIVER's own route is a
 *   real, hand-authored fake per direction (PlayerAssignment.overrides),
 *   not a mirror of the canonical shape, so exactly WHERE his path
 *   crosses the receiver's genuinely differs by direction too. Nathan, on
 *   I's Dive: "It's hiking the ball to the 2, then the 1 has it as it
 *   moved by the 2 and then it jumps back to the 2. Should go to 1, then
 *   hand to 2 as the 1 and 2 cross paths" -- the exchange point has to be
 *   wherever the two paths ACTUALLY cross for THIS direction, not a
 *   single fixed point that's only right for one of the two. Read live
 *   off the real Play Builder V2 Play object, same as wingLeftBallPath --
 *   never baked by the adapter, which has no live direction axis
 *   separate from which direction leaf it's already baking.
 * @property {string} [legacyKey] - which value this variant represents
 *   under its Play's own `legacyDimension` (e.g. 'Counter', 'B',
 *   'Outside', 'Pop2') -- only meaningful, and only needed, on a variant
 *   past the base (variants[0] is always the dimension's "off"/default
 *   state and needs no key of its own). Omit for a variant that isn't
 *   reachable via a live toggle (a coach's own draft/comparison variant).
 * @property {Object.<string, Object.<string, BallPathLeg[]>>}
 *   [alignmentBallPath] - the ballPath sibling of PlayerAssignment.
 *   alignmentOverrides[value].hasBall -- used instead of `ballPath` when
 *   an alignment toggle's CURRENT value has an entry here. Nested by
 *   toggle id THEN value id (`{heavy: {off: [...]}}`), not flat by value
 *   alone -- a formation can have more than one alignment toggle active
 *   on the same play (I's Heavy + Overload), and a flat key would risk
 *   colliding if two toggles happen to share a value name (both Heavy and
 *   Overload have an 'off'). Nathan, on I's Sweep: "When the 4 is out
 *   wide in I formation, the sweep can no longer go to the 4. If the 4 is
 *   out of heavy, the ball would be pitched to the 3 back" -- WHO carries
 *   (and how -- handoff vs pitch) depends on the alignment, not just
 *   wingSide, the same reason wingLeftBallPath exists for a wingSide-
 *   driven case. Read live off the real Play Builder V2 Play object, same
 *   as wingLeftBallPath -- never baked by the adapter, which has no live
 *   alignmentValues to bake a second ballPath against.
 */

/**
 * One defender's real assignment on a given DefenseLook -- Nathan: "you can
 * choose a defender and give them man to man or zone assignments and
 * choose the offensive player, tell them to blitz and draw the path they
 * should take." Mutually exclusive by `type`, matching the reference
 * product's own Responsibility picker (Man / Zone / Blitz, one at a time
 * per defender) rather than a defender carrying more than one
 * simultaneously.
 *
 * @typedef {Object} DefenderResponsibility
 * @property {'man'|'zone'|'blitz'} type
 * @property {number|string} [target] - for 'man' only: the OFFENSIVE
 *   position id (a Formation position's own id, e.g. 3, 'Y', 'TE') this
 *   defender is matched up on. Resolved against whichever Formation the
 *   play showing this DefenseLook is actually using -- a target id that
 *   formation doesn't have just means "uncovered," same as any other
 *   dangling reference elsewhere in this schema.
 * @property {RoutePoint[]} [area] - for 'zone' only: a small shape
 *   marking the zone's coverage area, authored the same RoutePoint[] way
 *   a route is (2+ points outlining/anchoring the area) rather than a
 *   second, bespoke shape format.
 * @property {RoutePoint[]} [path] - for 'blitz' only: the pressure path
 *   toward the backfield, same RoutePoint[] convention as a
 *   PlayerAssignment's own `points` -- a blitzing defender is, mechanically,
 *   just a player with a route.
 */

/**
 * A reusable, named set of defender positions for the diagram -- same
 * "save once, pick it for a play" idea as Formation, kept as its own thing
 * since defense doesn't need wing-position independence (nobody's marking
 * a defender as an independently-flippable wing spot). One mirror pass on
 * `direction` is all a defense look ever needs (not yet implemented in
 * js/playbuilder/legacy-adapter.js's fbLegacyBuildLeaf as of the
 * DefenderResponsibility work below -- it uses the same absolute
 * positions for both directions today; a real, pre-existing gap to close
 * alongside building real per-defender assignment, not introduced by it).
 *
 * @typedef {Object} DefenseLook
 * @property {string} id
 * @property {string} label
 * @property {{ id: string, label: string, x: number, y: number, responsibility?: DefenderResponsibility }[]} positions
 */

/**
 * @typedef {Object} Play
 * @property {string} id
 * @property {string} label
 * @property {string} formationId - references a Formation.id
 * @property {string} defenseLookId - references a DefenseLook.id
 * @property {PlayVariant[]} variants - variants[0] is always the base/default
 * @property {number} [signalCardId] - which hand-signal card (window.
 *   ALL_CARDS / js/signals.js's Signals.PENDING_IDS, group 'Play Call')
 *   represents this play. One card per Play, not per variant -- a coach
 *   calls the same signal regardless of which variant actually runs.
 * @property {string} [signalLabel] - the card's own label, carried
 *   alongside the id so it reads without a lookup
 * @property {string} [signalRecipe] - which js/signals.js RECIPES series
 *   this play's full flip-side signal sequence uses (e.g. 'i') --
 *   js/play-calls.js's own recipeNameFor() already reads this field on
 *   the legacy PlayType, falling back to the formation's own default
 *   ('wing') when unset. Copied straight through by js/playbuilder/
 *   legacy-adapter.js.
 * @property {(number|string)[][]} [directionSwapPairs] - pairs of REGULAR
 *   position ids whose ROUTE (not standing spot -- see Formation's own
 *   mirrorSwapPairs for that, a different axis) swaps by direction, for
 *   THIS PLAY specifically. Confirmed against real shipped data
 *   (js/playbuilder/legacy-adapter.js's verification): Inside Zone,
 *   Outside Zone, and Blast all have their two backfield candidates (2
 *   and 3) trade which one actually carries when direction flips -- one
 *   runs left, the other right, mirrored around the formation center --
 *   while Double Blast and Option have the SAME player carry both
 *   directions. Not a Formation-level truth (declaring it there would
 *   incorrectly swap Double Blast/Option too, which never authors a
 *   second carrier), so it lives on the specific play that needs it.
 *   Affects resolveRoute() only, never resolveAnchor() -- these two
 *   players still stand in their normal, fixed formation spots for both
 *   directions, only which one's route appears in which slot changes.
 * @property {(number|string)[]} [wingMirrorPlayers] - REGULAR position ids
 *   whose route reflects around the formation's CENTER when wingSide is
 *   'left', for THIS PLAY specifically -- a real, different axis than
 *   directionSwapPairs/centerMirrorPositionIds above (both keyed by
 *   `direction`; this is keyed by `wingSide`). Nathan, on I's Sweep: "I
 *   have the wing (4) right so he 4 goes out to the edge and the 3
 *   follows him. If I change the wing to the left, the 3 should
 *   automatically match what the 4 is doing... They need to sync up."
 *   A sweep-style ball carrier's real assignment is "follow wherever the
 *   wing actually is," not a fixed side independent of personnel --
 *   unlike Dive, where Direction genuinely is independent of Wing (that
 *   distinction is real and play-specific, not a universal rule, which
 *   is why this lives on the Play, not the Formation). Checked in
 *   mirror.js's resolveRoute using the SAME reflect-around-center math
 *   `usesCenterMirror` already proves out for the direction axis, not a
 *   new transform, just a new trigger. See Formation.wingLeftAnchors
 *   below for the DIFFERENT, formation-level axis "5 Guys" actually
 *   needs -- a position whose side never changes but whose standing spot
 *   still shifts to make room for the wing.
 * @property {{Left: string, Right: string}} [readKeyId] - which defender
 *   (a DefenseLook position id) this play's read is watching, per
 *   direction -- e.g. Inside Zone reads the backside "DT" defender,
 *   {Left: 'DT_L', Right: 'DT_R'}. Confirmed against real shipped data:
 *   readKeyId is a play-level (not per-variant) fact -- Inside Zone's Read
 *   A and Read B variants watch the SAME defender and differ in what the
 *   play does depending on what he does, not in who's being read. Stored
 *   explicitly per direction, not derived from an _L/_R naming
 *   convention -- not every DefenseLook position follows that pattern
 *   (MLB/FS/SS don't), so deriving it would be fragile where an explicit
 *   pair (matching how the OLD system itself just stores both) is not.
 * @property {'readToggle'|'counter'|'insideOutside'|'popVariant'} [legacyDimension] -
 *   which extra live toggle (if any) reveals this play's OTHER variants
 *   (variants[1+] -- variants[0] is always the toggle's "off"/default
 *   state). Each non-base variant that this toggle should reach needs its
 *   own PlayVariant.legacyKey ('B' for readToggle, 'Counter' for counter,
 *   'Outside' for insideOutside, 'Pop2' for popVariant). Omit for a play
 *   with no extra toggle -- js/playbuilder/editor.js's own "+ New Variant"
 *   flow asks a coach which kind of toggle (if any) a new variant is for,
 *   and sets both this and the variant's own legacyKey together, so
 *   authoring a Counter/Read-B/etc. variant is what makes it live for
 *   real, not a separate step. A play can have at most one of these --
 *   the old system's own two-dimension plays (Blast: hasInsideOutside AND
 *   hasCounter together) aren't representable here yet.
 * @property {boolean} [noBoot] - true to hide the Boot toggle for this
 *   play (e.g. a play where #1 already has/fakes the ball, so a Boot fake
 *   makes no football sense). Default false/omitted = Boot shows, same as
 *   every play that predates this field.
 * @property {boolean} [noMotion] - true to hide the Motion toggle for
 *   this play. Default false/omitted = Motion shows.
 * @property {string[]} [excludeAlignmentToggles] - ids of the
 *   FORMATION's own alignmentToggles (e.g. 'overload') to hide for this
 *   one play specifically. A Formation's alignmentToggles otherwise
 *   apply to every play built for it uniformly (js/playbuilder/
 *   legacy-adapter.js copies them straight through) -- same shape gap
 *   noBoot/noMotion already exist to close for the universal Boot/Motion
 *   toggles, generalized to any formation-level toggle. Nathan, on I
 *   Wing's Pop Pass: "doesn't need the overload toggle" -- a pass play
 *   with no run-blocking scheme has no use for a call about where the
 *   extra tight end lines up. Default omitted/empty = every one of the
 *   formation's own toggles shows, same as every play that predates this
 *   field. Hiding a toggle here only omits its UI control -- the coach
 *   can never set alignmentValues[toggleId] away from its own default for
 *   this play, so getVariant() (js/play-calls.js) never walks into an
 *   "on" leaf for it either; no baked route data needs removing.
 * @property {boolean} [isPass] - true to tag this play as a pass, not a
 *   run, everywhere the real app shows that distinction (the "PASS"/"RUN"
 *   badge on its browse tile, buildPlayList()'s own run-plays-first sort).
 *   Default false/omitted = shows as RUN, same as every play that
 *   predates this field -- there is no third, neutral state.
 * @property {boolean} [hasQbSneak] - true to show a "QB Sneak" switch IN
 *   PLACE OF Boot for this play (the two are mutually exclusive -- Boot
 *   assumes #1 already has a real ball-path to swap into; a play with
 *   hasQbSneak has no such swap, it's a genuinely different QB option).
 *   Nathan, on "5 Guys": "the option for a QB sneak which should be a
 *   toggle in place of Boot for 5 guys plays... The QB just has an
 *   option of running up between the tackles if there is nothing on the
 *   pass" -- confirmed this does NOT turn the play into a run (a later
 *   correction: "all the plays for 5 guys is supposed to [be] passing
 *   plays not running plays"), it's a live, in-game backup a coach wants
 *   kids to see, not a called alternate play. So turning it on swaps
 *   ONLY #1's own drawn path (qbSneakRoute below) for his normal one --
 *   every receiver's route stays exactly as authored, same "swap one
 *   thing, leave everything else alone" shape Boot's own toggle already
 *   uses. Default false/omitted = Boot shows as normal (or hides, if
 *   noBoot is ALSO set) -- every existing play is unaffected.
 * @property {RoutePoint[]} [qbSneakRoute] - #1's own drawn path when
 *   hasQbSneak is on and the coach has actually flipped the switch --
 *   omit if hasQbSneak is false, required if it's true. Absolute points,
 *   used as-is (this replaces #1's whole path for the card, not just a
 *   segment of it).
 * @property {boolean} [noDirection] - true to hide the Dir L/R toggle for
 *   this play entirely (same shape/precedent as the real, existing
 *   `isQbSneak` case in js/play-calls.js's buildCard, generalized to be
 *   data-driven instead of hardcoded to one play key). Nathan, on "5
 *   Guys": "it's either right or left to say which side the 4 will be
 *   on, everything is the same... remove the direction toggle and just
 *   keep the Wing Left or R" -- only sound to set when EVERY assignment
 *   on the play is truly directionIndependent (confirmed live before
 *   this was ever turned on for "5 Guys" -- Direction L vs R render
 *   byte-identical for all 5 plays). `direction` still exists
 *   internally and stays synced to whatever Wing L/R is set to, so
 *   anything that ever reads it sees a real, current value, not a
 *   stale one -- the toggle is just never shown. Default false/omitted
 *   = Dir L/R shows as normal, every existing play unaffected.
 * @property {boolean} [directionOpposesWing] - hides the Dir L/R toggle
 *   (same as noDirection) but syncs `direction` to the OPPOSITE of
 *   whatever Wing L/R is set to, not the same value. Nathan, on I's
 *   Sweep: "the 4 (wing) is the one getting the ball, and running away
 *   from the wing side... If wing is Left, then the sweep has to go
 *   right. There is no sweep left handing off to the 4, with the wing in
 *   heavy on the left side" -- direction isn't independently callable at
 *   all here, it's always implied by (and opposite of) wherever the wing
 *   actually is. Mutually exclusive with noDirection in practice (a play
 *   only ever needs one sync rule) -- noDirection wins if both are
 *   somehow set. Default false/omitted = Dir L/R shows as normal, every
 *   existing play unaffected.
 * @property {boolean} [directionDefaultsAwayFromWing] - changes only
 *   which direction the card OPENS on, before a coach touches either
 *   toggle -- both wingSide and direction otherwise default to 'Left',
 *   which is the SAME-side pairing; this makes direction's own initial
 *   value the opposite of wingSide's instead. Direction stays fully
 *   independent and visible (unlike directionOpposesWing, no locking, no
 *   hiding) -- a coach can still freely call the same-side pairing
 *   afterward. Nathan, on I's Dive: "the default on this play is for the
 *   2 back to run the ball to the opposite side of the 4... You can have
 *   the dive go to the same side as the wing but it's about
 *   misdirection... having the other backs go strong side while the ball
 *   goes weak side." Default false/omitted = both toggles open 'Left',
 *   every existing play unaffected.
 */

// JSDoc-only file -- no runtime code. Loaded as a plain <script> like every
// other dev2 file (this repo has no build step and no ES module loading),
// so this exists purely for editor autocomplete/documentation, not import.

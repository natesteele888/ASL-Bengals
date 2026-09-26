// ============================================================
// Play Builder v2 -- legacy adapter.
//
// Produces a js/play-calls.js-shaped PlayType (what DATA.playTypes holds,
// what renderCardDiagram/getVariant actually consume) from a Play Builder
// V2 Formation + Play, by running PlayBuilderMirror.resolveRoute across
// both directions -- "adapter, not full rewrite of every consumer" (the
// plan's own Decision 2). Most existing consumers (renderCardDiagram,
// buildSignalSequence, the PDF exporters, This Week, the quiz) need zero
// changes; they just read window.DATA.playTypes the same as always.
//
// KEY FINDING, confirmed against real shipped Inside Zone data before
// writing this: the OLD system's directions.Left/directions.Right are NOT
// a computed mirror of each other for most players -- they're two
// separately authored datasets (which is exactly how Pop Pass's Left side
// went stale for a week, the whole reason this rebuild exists). This
// adapter reproduces that shape correctly by asking Play Builder V2's OWN
// mirror model the right question for each output direction:
//   - every position, wing included: resolveRoute(formation, players, id,
//     {wingSide: 'left', direction: dirKey}) -- 'left' because
//     renderCardDiagram's own generic #4-handling assumes "plain points
//     are authored assuming Wing Left as the base" (see the Counter
//     double-mirror bug fixed earlier this session in play-calls.js) and
//     mirrors to Right at render time; non-wing positions ignore wingSide
//     entirely, so passing 'left' uniformly is always safe. For a WING
//     position, `direction` (not wingSide) is exactly what picks
//     sameSideRoute vs crossSideRoute (mirror.js: sameSide = wingSide ===
//     direction) -- a real route-SHAPE difference, not a mirror. An
//     earlier version of this file force-passed direction:'left'
//     unconditionally for wing positions on the assumption the two shapes
//     "happen to be identical" -- confirmed WRONG against real data:
//     Inside Zone/Outside Zone/Option/Blast/Double Blast/Sweep all have a
//     real, non-trivial same-vs-cross difference for their wing player's
//     block target, exactly reproduced (verified byte-for-byte against
//     shipped-defaults.js, every leaf, all 6 plays) just by passing the
//     real leaf's direction here like any other position -- no special
//     case, no new schema field needed.
//   - PlayerAssignment.directionIndependent (new field, schema.js) for a
//     regular position whose real technique doesn't change by direction
//     at all (confirmed: Inside Zone's O-line blocks are byte-identical
//     Left vs Right, not mirrored) -- mirror.js already implements this.
//   - Play.directionSwapPairs (new field, schema.js) for two backfield
//     candidates who trade which one carries by direction (confirmed:
//     Inside Zone/Outside Zone/Blast's players 2 and 3 swap, reflected
//     around field center -- verified by hand against real data to
//     sub-1px precision). Merged into a temporary formation object passed
//     ONLY to resolveRoute calls, never resolveAnchor -- these players
//     still stand in their normal, fixed spots; only their route swaps.
// ============================================================
//
// IIFE-wrapped, matching every other playbuilder/*.js file -- this file
// had "no consumer until Phase 7" when it was first written, so it
// deliberately stayed unwrapped (nothing outside it called it, and
// index.html didn't load it at all). js/playbuilder/sync-custom-
// formations.js is now that consumer, and index.html loads this file for
// real for the first time -- confirmed no CURRENT collision with any of
// its 5 top-level names (fbLegacyEffectivePlayers/fbLegacyRouteFormation/
// fbLegacyAssignmentFor/fbLegacyBuildLeaf/toLegacyPlayType) against
// everything else in the real scripts array, but wrapping now, at the
// moment it actually joins that shared scope, closes off the same class
// of risk Phase 6 already fixed for every sibling file rather than
// leaving this one as a standing exception.
(function () {

function fbLegacyEffectivePlayers(play, variant) {
  const base = play.variants[0];
  if (variant === base) return variant.players;
  const merged = base.players.map((p) => variant.players.find((o) => o.player === p.player) || p);
  variant.players.forEach((p) => { if (!merged.find((m) => m.player === p.player)) merged.push(p); });
  return merged;
}

function fbLegacyRouteFormation(formation, play) {
  if (!play.directionSwapPairs || !play.directionSwapPairs.length) return formation;
  return Object.assign({}, formation, {
    mirrorSwapPairs: (formation.mirrorSwapPairs || []).concat(play.directionSwapPairs),
  });
}

// Which assignment's OWN flags (ball, isBlocking) actually apply to a
// given formation slot for this direction -- almost always that slot's
// own assignment, except a swap-pair position (formation-level OR this
// play's own directionSwapPairs) on direction='left', where resolveRoute
// draws the PARTNER's route in this slot.
function fbLegacyAssignmentFor(formation, play, players, playerId, directionLower) {
  if (directionLower === 'left') {
    const pairs = (formation.mirrorSwapPairs || []).concat(play.directionSwapPairs || []);
    const pair = pairs.find((p) => p[0] === playerId || p[1] === playerId);
    if (pair) {
      const partnerId = pair[0] === playerId ? pair[1] : pair[0];
      const partnerAssignment = players.find((p) => p.player === partnerId);
      if (partnerAssignment && partnerAssignment.points) return partnerAssignment;
    }
  }
  return players.find((p) => p.player === playerId);
}

// The AlignmentToggle (schema.js) covering this position, or null -- a
// position is covered by at most one (schema.js's own doc). Same lookup
// js/playbuilder/editor.js's alignmentToggleFor() does; duplicated here
// (not shared) since this file and editor.js are never loaded on the
// same page context in a way that would make sharing it worthwhile.
function fbLegacyAlignmentToggleFor(formation, positionId) {
  return (formation.alignmentToggles || []).find((t) => t.positionIds.includes(positionId)) || null;
}

function fbLegacyBuildLeaf(play, variant, formation, defenseLook, dirKeyCapitalized, alignmentValues) {
  const mirrorApi = window.PlayBuilderMirror;
  const directionLower = dirKeyCapitalized.toLowerCase();
  const players = fbLegacyEffectivePlayers(play, variant);
  const routeFormation = fbLegacyRouteFormation(formation, play);

  const paths = [];
  formation.positions.forEach((pos) => {
    const assignment = fbLegacyAssignmentFor(formation, play, players, pos.id, directionLower);
    if (!assignment) return;
    // wingSide stays pinned 'left' for every position (see header comment);
    // direction is always the real leaf being built, wing positions
    // included -- that's what correctly selects sameSideRoute vs
    // crossSideRoute for a wing player's genuine same/cross-side shape.
    // alignment (only set for a position this formation's own
    // alignmentToggles covers, e.g. Heavy on #4) picks that toggle's
    // CURRENT value out of alignmentValues, falling back to its default
    // (first-declared) value -- same fallback mirror.js's own
    // resolveRoute/resolveAnchor already apply when alignment is
    // undefined, so a position with no toggle at all is unaffected.
    const toggle = fbLegacyAlignmentToggleFor(formation, pos.id);
    const alignment = toggle ? ((alignmentValues && alignmentValues[toggle.id]) || toggle.values[0].id) : undefined;
    const points = mirrorApi.resolveRoute(routeFormation, players, pos.id, { wingSide: 'left', direction: directionLower, alignment });
    if (!points) return;
    const rawPoints = points.map((pt) => [pt.x, pt.y]);
    const path = {
      ball: !!assignment.hasBall,
      width: assignment.endType === 'block' ? 7 : 9,
      points: rawPoints,
    };
    if (assignment.endType === 'block') {
      path.isBlocking = true;
      // play-calls.js's renderCardDiagram (~line 1324) prefers isBlocking
      // paths' points4x4 over points whenever present, in 4x4 mode -- the
      // ONLY mode the real app ever renders in today (4x3 retired). A
      // Play Builder V2 assignment has just one authored points array (no
      // 4x3-vs-4x4 split -- that split is purely a legacy artifact), so
      // mirroring it into both fields here means whichever one a given
      // consumer reads, it gets the real, current, correctly-migrated
      // value -- never the stale 4x3-era points a couple of real
      // positions (confirmed: Inside Zone's LT/C/RT) still disagree with.
      path.points4x4 = rawPoints;
    }
    if (typeof pos.id === 'number') path.player = pos.id; else { path.player = null; path.id = pos.id; }
    paths.push(path);
  });

  const defensePositions = (defenseLook.positions || []).map((d) => ({ pos: [d.x, d.y], label: d.label, id: d.id }));
  const readKeyId = play.readKeyId ? play.readKeyId[dirKeyCapitalized] : undefined;
  return {
    defense: defensePositions,
    defense4x4: defensePositions,
    readKeyId: readKeyId || null,
    paths,
  };
}

// The existing play-variant dimension (readToggle/counter/insideOutside/
// popVariant, opts.legacyDimension) for ONE direction leaf, given a fixed
// alignmentValues selection -- exactly what toLegacyPlayType's own
// direction loop already did, just factored out so the NEW alignment-
// toggle nesting (below) can wrap it once per combination instead of
// duplicating this same variant-walk logic per alignment value.
function fbLegacyBuildVariantLevels(play, formation, defenseLook, dirKeyCapitalized, opts, alignmentValues) {
  if (!opts.legacyDimension) {
    return fbLegacyBuildLeaf(play, play.variants[0], formation, defenseLook, dirKeyCapitalized, alignmentValues);
  }
  const leafByKey = {};
  play.variants.forEach((variant) => {
    const legacyKey = opts.legacyVariantKeys && opts.legacyVariantKeys[variant.id];
    if (legacyKey) leafByKey[legacyKey] = fbLegacyBuildLeaf(play, variant, formation, defenseLook, dirKeyCapitalized, alignmentValues);
  });
  return leafByKey;
}

// Nests one level per AlignmentToggle the formation declares (Heavy is
// the first -- formation.alignmentToggles, schema.js), keyed by each
// toggle's own value ids, OUTSIDE the existing variant dimension -- a
// formation-wide axis (every play from "I" gets the SAME Heavy choice),
// not a per-play one, so it wraps opts.legacyDimension's own nesting
// rather than living alongside it. A formation with no alignmentToggles
// (every existing one) skips straight to fbLegacyBuildVariantLevels, so
// this is a no-op recursion depth of zero for them -- byte-identical
// output to before this existed.
function fbLegacyBuildAlignmentLevels(play, formation, defenseLook, dirKeyCapitalized, opts, toggles, idx, alignmentValues) {
  if (idx >= toggles.length) {
    return fbLegacyBuildVariantLevels(play, formation, defenseLook, dirKeyCapitalized, opts, alignmentValues);
  }
  const toggle = toggles[idx];
  const level = {};
  toggle.values.forEach((v) => {
    const nextValues = Object.assign({}, alignmentValues, { [toggle.id]: v.id });
    level[v.id] = fbLegacyBuildAlignmentLevels(play, formation, defenseLook, dirKeyCapitalized, opts, toggles, idx + 1, nextValues);
  });
  return level;
}

/**
 * @param {import('./schema.js').Play} play
 * @param {import('./schema.js').Formation} formation
 * @param {import('./schema.js').DefenseLook} defenseLook
 * @param {Object} [opts]
 * @param {'readToggle'|'counter'|'insideOutside'|'popVariant'} [opts.legacyDimension] -
 *   which OLD-system nesting dimension play.variants[] represents, if any.
 *   Omit for a play with only variants[0] (no extra dimension).
 * @param {Object.<string,string>} [opts.legacyVariantKeys] - maps each
 *   PlayVariant.id to its key under that dimension, e.g. for readToggle:
 *   {default: 'A', read_b: 'B'}
 * @returns {Object} a js/play-calls.js-shaped PlayType entry
 */
function toLegacyPlayType(play, formation, defenseLook, opts) {
  opts = opts || {};
  // play.excludeAlignmentToggles (schema.js) lets ONE play opt out of a
  // toggle its formation otherwise applies to every play uniformly (e.g.
  // Pop Pass doesn't need I Wing's Overload call). Real bug, found live:
  // an earlier version of this fix filtered only the UI-facing
  // result.alignmentToggles further down, AFTER `directions` had already
  // been built by fbLegacyBuildAlignmentLevels nested one level deep for
  // the excluded toggle -- getVariant() (js/play-calls.js) then walked
  // using the FILTERED list, stopping one level too shallow, and handed
  // buildCard the toggle's own wrapper object ({off:{...}}) instead of
  // the actual leaf, crashing on variant.paths.forEach. Filtering here,
  // before fbLegacyBuildAlignmentLevels ever runs, keeps the data's own
  // nesting depth and the exposed metadata in agreement -- confirmed via
  // a live render-card check, not just reasoning about it.
  const toggles = play.excludeAlignmentToggles && play.excludeAlignmentToggles.length
    ? (formation.alignmentToggles || []).filter((t) => !play.excludeAlignmentToggles.includes(t.id))
    : (formation.alignmentToggles || []);
  const directions = {};
  ['Left', 'Right'].forEach((dirKeyCapitalized) => {
    directions[dirKeyCapitalized] = fbLegacyBuildAlignmentLevels(play, formation, defenseLook, dirKeyCapitalized, opts, toggles, 0, {});
  });

  const result = { key: play.id, label: play.label, directions };
  // renderCardDiagram (js/play-calls.js) shifts every play's paths from
  // wherever they were "authored" (assumed to be Wing, via authoredAlign)
  // to wherever the requested formationId actually stands -- the exact
  // mechanism the OLD customFormations system depends on (a coach never
  // re-authors, Wing's own routes get shifted+overridden live). A Play
  // Builder V2 play is NOT that: fbLegacyBuildLeaf already resolved every
  // point directly against `formation`'s own real anchors (not Wing's), so
  // it is already correctly positioned for ITS OWN formation. Without this
  // field, renderCardDiagram would shift it a SECOND time (by formation's
  // anchor minus Wing's anchor) on top of that, corrupting every point --
  // confirmed live: player 1's authored (806,299) rendered as (803,160).
  // Tells renderCardDiagram which formation this play's own points are
  // already relative to, so the shift becomes a correct no-op when
  // rendering at that same formation (and, if it's ever asked to render at
  // a DIFFERENT formation, shifts from the right starting point instead of
  // always assuming Wing).
  result.authoredFormationId = formation.id;
  if (opts.legacyDimension === 'readToggle') result.hasReadToggle = true;
  if (opts.legacyDimension === 'counter') result.hasCounter = true;
  if (opts.legacyDimension === 'insideOutside') result.hasInsideOutside = true;
  if (opts.legacyDimension === 'popVariant') result.hasPopVariant = true;
  // Per-play toggle availability -- Nathan: "ability to say which options
  // should be available for toggles (counter, boot, motion, or custom)."
  // Both booleans, both opt-OUT (default false = the toggle shows, same
  // as every play that predates this field), set directly from the
  // Play Builder V2 Play record, not from opts -- unlike legacyDimension
  // (a formation-agnostic CHOICE of which extra variant dimension applies,
  // needing real routes authored for the "on" state) Boot/Motion are pure
  // live route-shifts with no second variant to author, so there's
  // nothing to wire beyond "is this allowed for this play or not."
  if (play.noBoot) result.noBoot = true;
  if (play.noMotion) result.noMotion = true;
  // Nathan: "all the plays for 5 guys is supposed to [be] passing plays
  // not running plays" -- real bug, not just a label: this field never
  // existed on this adapter's output at all, so every Play Builder V2
  // play (regardless of what, if anything, Play.isPass was set to) fell
  // back to the legacy default (false/RUN) everywhere the real app shows
  // that distinction.
  if (play.isPass) result.isPass = true;
  if (play.hasQbSneak) { result.hasQbSneak = true; result.qbSneakRoute = play.qbSneakRoute; }
  if (play.noDirection) result.noDirection = true;
  // I's Sweep: Nathan: "If wing is Left, then the sweep has to go right.
  // There is no sweep left handing off to the 4, with the wing in heavy
  // on the left side." Direction isn't independently callable at all for
  // a play like this -- it's ALWAYS the opposite of wherever the wing
  // (#4) actually is, never a free 4th combination. Distinct from
  // noDirection (which syncs direction to MATCH wingSide, e.g. "5 Guys")
  // -- this syncs it to the OPPOSITE.
  if (play.directionOpposesWing) result.directionOpposesWing = true;
  // I's Dive: unlike directionOpposesWing, this only changes what the
  // card OPENS on -- Direction stays fully independent/visible, a real
  // misdirection call away from wing side is still one tap away.
  if (play.directionDefaultsAwayFromWing) result.directionDefaultsAwayFromWing = true;
  // Copied straight through, same shape schema.js's own Play.
  // wingMirrorPlayers doc describes -- js/play-calls.js's renderCardDiagram
  // reads this directly (gated on it existing at all, which no real Wing/
  // Split PlayType has ever set) to reflect a regular position around
  // center for Wing:Right, the same convention #4's own hardcoded
  // handling already uses, generalized to whichever positions this play
  // declares.
  if (play.wingMirrorPlayers && play.wingMirrorPlayers.length) result.wingMirrorPlayers = play.wingMirrorPlayers;
  // "5 Guys"' own wingLeftAnchors (a DIFFERENT, formation-level axis --
  // see schema.js's own doc) needs no pass-through here at all: js/
  // play-calls.js reads it straight off window.PlayBuilderFormationsById,
  // the same live formation stash p4OverloadCollisionAnchor already
  // uses, not off the legacy PlayType this function builds.
  // Copied straight through (same shape js/play-calls.js's getVariant and
  // buildCard both expect) -- omitted entirely for a formation with none,
  // matching every existing PlayType. `toggles` (above) is already
  // filtered by play.excludeAlignmentToggles, so this agrees with
  // `directions`'s own nesting depth by construction -- see that
  // computation's own comment for why filtering has to happen there, not
  // here.
  if (toggles.length) result.alignmentToggles = toggles;
  if (play.signalCardId != null) {
    result.signalCardId = play.signalCardId;
    result.signalLabel = play.signalLabel;
  }
  if (play.signalRecipe) result.signalRecipe = play.signalRecipe;
  // js/play-calls.js's real card already knows how to draw and animate a
  // ballPath (window.BallPath.isValid/drawOverlay/schedule, gated purely
  // on playType.ballPath being present) -- confirmed no shipped Wing/
  // Split play has ever set one, so this was previously unreachable for
  // every real play. `at` is a canonical-frame point (not itself
  // direction/wingSide-aware); the real renderer resolves each leg's
  // actual on-screen spot from the player's own already-mirrored
  // position, so one authored ballPath is correct for all 4 direction x
  // wingSide combinations, same as a route. Only the base variant --
  // playType.ballPath is a single, play-wide field today (not nested per
  // variant/alignment), matching how js/play-calls.js already reads it;
  // a play with more than one meaningfully different exchange point
  // would need that extended, not something any play needs yet.
  const baseBallPath = play.variants && play.variants[0] && play.variants[0].ballPath;
  if (baseBallPath && baseBallPath.length) result.ballPath = baseBallPath;
  return result;
}

window.PlayBuilderLegacyAdapter = { toLegacyPlayType };

})();

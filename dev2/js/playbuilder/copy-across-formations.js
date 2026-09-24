// ============================================================
// Play Builder v2 -- "author once, reuse across formations."
//
// Same idea js/play-calls.js's shiftPathsToFormation (~line 1047) already
// proves out for the real app: shift each player's route by exactly how
// far THAT player moved between the two formations, in the SAME canonical
// (wing-right, direction-right) frame every Play Builder V2 play is
// authored in -- so this needs no special-casing for wing/swap/center-
// mirror positions at all, only each player's own canonical anchor delta.
//
// Produces a brand-new, fully independent Play record, never a live
// link/override back to the source -- that override relationship is
// exactly what let Pop Pass's Left side silently drift for a week in the
// old system (see schema.js's own header comment). Editing the copy must
// never be able to touch the original.
// ============================================================
//
// IIFE-wrapped so none of these fbShiftCopy*-prefixed helpers leak into
// the shared classic-script global scope -- nothing outside this file
// references them by bare name, only via
// window.PlayBuilderCopyAcrossFormations.
(function () {

function fbShiftCopyCanonicalAnchor(formation, playerId) {
  const pos = formation.positions.find((p) => p.id === playerId);
  if (!pos) throw new Error(`Formation "${formation.id}" has no position "${playerId}".`);
  return { x: pos.x, y: pos.y };
}

function fbShiftCopyDelta(sourceFormation, targetFormation, playerId) {
  const from = fbShiftCopyCanonicalAnchor(sourceFormation, playerId);
  const to = fbShiftCopyCanonicalAnchor(targetFormation, playerId);
  return { dx: to.x - from.x, dy: to.y - from.y };
}

function fbShiftCopyPoints(points, dx, dy) {
  return (points || []).map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
}

function fbShiftCopyIsWing(formation, playerId) {
  return (formation.wingPositionIds || []).includes(playerId);
}

// One player's assignment, shifted from the source formation's canonical
// anchor to the target's. The two formations don't have to agree on
// which positions are wing positions -- a source wing shape folds down to
// a single route if the target treats that slot as regular, and a source
// single route gets seeded into both wing shapes if the target treats it
// as wing (same bootstrap js/playbuilder/editor.js's own selectPlayer()
// already does for a brand-new wing assignment -- the coach differentiates
// same/cross-side from there, same as authoring one from scratch would).
// Shifts whichever of points/sameSideRoute/crossSideRoute a route-shaped
// object (an assignment, or one of its alignmentOverrides entries) has, by
// the same wing-fold rules fbShiftCopyAssignment's own top level uses --
// factored out so alignmentOverrides (see below) gets the identical
// treatment instead of a second, drifting copy of this logic.
function fbShiftCopyRouteShape(source, sourceWing, targetWing, dx, dy) {
  const out = {};
  if (sourceWing && targetWing) {
    out.sameSideRoute = fbShiftCopyPoints(source.sameSideRoute, dx, dy);
    out.crossSideRoute = fbShiftCopyPoints(source.crossSideRoute, dx, dy);
  } else if (sourceWing && !targetWing) {
    out.points = fbShiftCopyPoints(source.sameSideRoute, dx, dy);
  } else if (!sourceWing && targetWing) {
    const shifted = fbShiftCopyPoints(source.points, dx, dy);
    out.sameSideRoute = shifted;
    out.crossSideRoute = shifted.map((pt) => ({ x: pt.x, y: pt.y }));
  } else {
    out.points = fbShiftCopyPoints(source.points, dx, dy);
  }
  return out;
}

function fbShiftCopyAssignment(assignment, sourceFormation, targetFormation) {
  const { dx, dy } = fbShiftCopyDelta(sourceFormation, targetFormation, assignment.player);
  const sourceWing = fbShiftCopyIsWing(sourceFormation, assignment.player);
  const targetWing = fbShiftCopyIsWing(targetFormation, assignment.player);
  const out = Object.assign({
    player: assignment.player,
    hasBall: !!assignment.hasBall,
    delayMs: assignment.delayMs || 0,
    endType: assignment.endType || 'run',
  }, fbShiftCopyRouteShape(assignment, sourceWing, targetWing, dx, dy));

  // Both carried forward verbatim/shifted rather than silently dropped --
  // confirmed live this session as a real data-loss bug (the copy's
  // O-line block would come back incorrectly locally-mirrored on
  // direction=left, and a Heavy-covered player's non-default alignment
  // route would just vanish). directionIndependent is a plain flag, not
  // coordinate data, so it carries over unshifted. alignmentOverrides is
  // keyed by an AlignmentToggle VALUE id (e.g. 'wing') that only means
  // anything if the TARGET formation happens to declare a toggle using
  // the same value ids -- if it doesn't, mirror.js's own
  // alignmentToggleFor() simply never finds a covering toggle for this
  // position on the target and this extra data is inert, same as any
  // other field a formation doesn't currently use.
  if (assignment.directionIndependent) out.directionIndependent = true;
  if (assignment.alignmentOverrides) {
    out.alignmentOverrides = {};
    Object.keys(assignment.alignmentOverrides).forEach((value) => {
      const ov = assignment.alignmentOverrides[value];
      const shifted = fbShiftCopyRouteShape(ov, sourceWing, targetWing, dx, dy);
      if (ov.hasBall !== undefined) shifted.hasBall = ov.hasBall;
      if (ov.endType !== undefined) shifted.endType = ov.endType;
      if (ov.delayMs !== undefined) shifted.delayMs = ov.delayMs;
      out.alignmentOverrides[value] = shifted;
    });
  }
  return out;
}

/**
 * @param {import('./schema.js').Play} sourcePlay
 * @param {import('./schema.js').Formation} sourceFormation
 * @param {import('./schema.js').Formation} targetFormation
 * @param {string} newId
 * @param {string} newLabel
 * @returns {import('./schema.js').Play} a brand-new Play, sharing no
 *   object references with sourcePlay -- editing it can never reach back
 *   into the original.
 */
// A ballPath leg's `at` isn't any one player's own canonical anchor (it's
// typically the midpoint between a giver and a receiver -- see
// js/ball-path-editor.js's _defaultPointFor), so there's no single
// "correct" delta the way a route point has. Shifting by the RECEIVING
// player's (leg.player) own delta is the same approximation
// BallPathEditor's own default placement already makes -- "near this
// receiver" -- and a coach can drag it back onto the real mesh point for
// the new formation same as authoring one from scratch.
function fbShiftCopyBallPath(ballPath, sourceFormation, targetFormation) {
  return (ballPath || []).map((leg, i) => {
    if (i === 0 || !leg.at) return { player: leg.player, how: leg.how, at: leg.at };
    const { dx, dy } = fbShiftCopyDelta(sourceFormation, targetFormation, leg.player);
    return { player: leg.player, how: leg.how, at: [leg.at[0] + dx, leg.at[1] + dy] };
  });
}

function copyPlayToFormation(sourcePlay, sourceFormation, targetFormation, newId, newLabel) {
  const out = {
    id: newId,
    label: newLabel,
    formationId: targetFormation.id,
    defenseLookId: sourcePlay.defenseLookId,
    viewBox: (sourcePlay.viewBox || []).slice(),
    topPad: sourcePlay.topPad,
    signalCardId: sourcePlay.signalCardId,
    signalLabel: sourcePlay.signalLabel,
    variants: sourcePlay.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      players: variant.players.map((a) => fbShiftCopyAssignment(a, sourceFormation, targetFormation)),
      ballPath: fbShiftCopyBallPath(variant.ballPath, sourceFormation, targetFormation),
    })),
  };
  // Both play-level (not per-variant, not per-formation) fields, carried
  // forward verbatim -- neither is coordinate data that needs shifting.
  // Confirmed live as a real data-loss bug: without these, a copy of a
  // play like Inside Zone silently loses its Direction:Left backfield-
  // carrier swap and its read-key defender highlight, with nothing to
  // indicate either went missing.
  if (sourcePlay.directionSwapPairs) out.directionSwapPairs = sourcePlay.directionSwapPairs.map((pair) => pair.slice());
  if (sourcePlay.readKeyId) out.readKeyId = Object.assign({}, sourcePlay.readKeyId);
  return out;
}

window.PlayBuilderCopyAcrossFormations = { copyPlayToFormation };

})();

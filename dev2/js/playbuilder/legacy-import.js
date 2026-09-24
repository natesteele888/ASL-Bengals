// ============================================================
// Play Builder v2 -- import an existing (legacy, shipped) play as the
// starting point for a NEW Play Builder V2 play on a different formation.
//
// Nathan: "I should be able to add one of my existing plays from another
// formation but remake existing plays." The offensive line and split
// ends don't change just because the backfield look does -- confirmed
// live building I's own real Inside Zone this session: their anchors are
// IDENTICAL to Wing's -- so those get carried over as a real, usable
// starting point straight from the source's own technique. The backfield
// (1/2/3) and ball path genuinely depend on the whole formation's shape
// (shotgun vs. under-center, etc.) and can't be auto-derived from a
// single player's anchor delta the way copy-across-formations.js's own
// shift can -- those come back as a short, honest "remake me" stub
// (`needsRemake`) rather than a guessed-at, wrong-looking route.
//
// Only Wing is a legacy source today -- Split's plays live in a
// structurally different system (js/edit-plays.js's splitRoutes, no
// directions.Right.paths[] to read at all), so it's left out of scope
// here rather than silently producing something wrong.
//
// IIFE-wrapped, same convention as every sibling playbuilder/*.js file --
// window.PlayBuilderLegacyImport is the only thing this file exposes.
(function () {

const BACKFIELD_IDS = [1, 2, 3];

function fbImportPointsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((pt, i) => Math.abs(pt[0] - b[i][0]) < 0.01 && Math.abs(pt[1] - b[i][1]) < 0.01);
}

function fbImportToPointObjs(points) {
  return (points || []).map((pt) => ({ x: pt[0], y: pt[1] }));
}

function fbImportAnchor(formation, positionId) {
  const pos = (formation.positions || []).find((p) => p.id === positionId);
  return pos ? { x: pos.x, y: pos.y } : null;
}

// hasReadToggle plays (Inside Zone, Outside Zone, ...) nest a second key
// (their read-variant, e.g. "A"/"B") under directions.Left/.Right; a flat
// play (Sweep, ...) doesn't. variantKey is which to use for the former --
// omit it for the latter.
function fbImportLegacyLeaf(playType, variantKey) {
  const dirs = playType.directions || {};
  const left = variantKey ? (dirs.Left && dirs.Left[variantKey]) : dirs.Left;
  const right = variantKey ? (dirs.Right && dirs.Right[variantKey]) : dirs.Right;
  return { left, right };
}

/**
 * @param {object} playType - an entry from window.DATA.playTypes, Wing-
 *   sourced (see file header -- Split isn't supported).
 * @param {import('./schema.js').Formation} targetFormation
 * @param {string} newId
 * @param {string} newLabel
 * @param {string} [variantKey] - e.g. 'A' for a hasReadToggle play; omit
 *   for a flat one.
 * @returns {{ play: import('./schema.js').Play, needsRemake: (number|string)[] }}
 *   needsRemake lists every position this import could NOT populate for
 *   real (always the backfield) -- surface this to whoever's authoring,
 *   never hide it.
 */
function importLegacyPlayToFormation(playType, targetFormation, newId, newLabel, variantKey) {
  const { left, right } = fbImportLegacyLeaf(playType, variantKey);
  if (!right || !right.paths) throw new Error(`"${playType.label}" has no Right-direction data to import.`);
  const targetWingIds = targetFormation.wingPositionIds || [];
  const players = [];
  const needsRemake = [];

  right.paths.forEach((leg) => {
    const positionId = leg.id || leg.player;
    if (positionId == null || BACKFIELD_IDS.includes(positionId)) return; // backfield handled below, stubbed

    if (targetWingIds.includes(positionId)) {
      const anchor = fbImportAnchor(targetFormation, positionId);
      if (!anchor || !leg.sameSidePoints4x4) return;
      const sameDelta = leg.sameSidePoints4x4[1];
      const crossDelta = (leg.crossPoints4x4 || leg.sameSidePoints4x4)[1];
      players.push({
        player: positionId,
        hasBall: false,
        delayMs: 0,
        endType: leg.ball ? 'run' : 'block',
        sameSideRoute: [{ x: anchor.x, y: anchor.y }, { x: anchor.x + sameDelta[0], y: anchor.y + sameDelta[1] }],
        crossSideRoute: [{ x: anchor.x, y: anchor.y }, { x: anchor.x + crossDelta[0], y: anchor.y + crossDelta[1] }],
      });
      return;
    }

    const rightPoints = leg.points4x4 || leg.points;
    if (!rightPoints) return;
    const leftLeg = left && left.paths && left.paths.find((l) => (l.id || l.player) === positionId);
    const leftPoints = leftLeg && (leftLeg.points4x4 || leftLeg.points);
    // Real, confirmed pattern (Inside Zone): a true zone-block technique
    // is genuinely identical regardless of direction -- mirror.js's own
    // directionIndependent flag exists for exactly this. Detected here,
    // not guessed: only set when the source's own Left and Right data
    // for this exact position actually match. When they don't (Sweep's
    // pulling/kick-out technique really does differ by side), Right's
    // technique is used as the one authored route and Left falls back to
    // Play Builder V2's own local mirror -- a reasonable stand-in, not a
    // byte-identical copy of the source's own hand-tuned asymmetry.
    const sameBothDirections = leftPoints && fbImportPointsEqual(rightPoints, leftPoints);

    const assignment = {
      player: positionId,
      hasBall: false,
      delayMs: leg.delayMs || 0,
      endType: leg.isBlocking ? 'block' : 'run',
      points: fbImportToPointObjs(rightPoints),
    };
    if (sameBothDirections) assignment.directionIndependent = true;
    players.push(assignment);
  });

  BACKFIELD_IDS.forEach((id) => {
    const anchor = fbImportAnchor(targetFormation, id);
    if (!anchor) return;
    players.push({
      player: id,
      hasBall: false,
      delayMs: 0,
      endType: 'run',
      points: [{ x: anchor.x, y: anchor.y }, { x: anchor.x, y: anchor.y - 40 }],
    });
    needsRemake.push(id);
  });

  const play = {
    id: newId,
    label: newLabel,
    formationId: targetFormation.id,
    defenseLookId: 'base_4x4',
    viewBox: [1600, 1030],
    topPad: 400,
    variants: [{ id: 'base', label: 'Base', players, ballPath: [] }],
  };
  return { play, needsRemake };
}

window.PlayBuilderLegacyImport = { importLegacyPlayToFormation };

})();

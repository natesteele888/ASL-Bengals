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

// A play's real Left/Right direction data can be nested by ZERO, ONE, or
// (Blast) TWO independent variant dimensions before reaching real
// {paths, ...} data -- confirmed live across all 9 real Wing plays, not
// assumed: hasReadToggle ('A'/'B', Inside Zone), hasInsideOutside
// ('Outside'/'Inside', Double Blast), hasCounter ('Normal'/'Counter',
// Outside Zone/Option), hasPopVariant ('Pop'/'Pop2', Pop Pass), a flat
// play with `.paths` directly (Sweep, Option Pass, Shuffle Pass), and
// Blast, which nests Inside/Outside THEN Normal/Counter -- two levels at
// once. Real bug, found live: Nathan, copying "Double Blast" into a new
// formation, got "has no Right-direction data to import" -- the ORIGINAL
// version of this resolver only ever considered flat vs. hasReadToggle-
// nested, so nothing ever supplied the right key for an
// hasInsideOutside-only play at all, let alone a two-level one.
//
// Rather than have the caller pre-compute which of these apply (fragile --
// js/playbook-pdf.js's own defaultSubvariant(), the obvious place to ask,
// carries a play-specific label-only override for Sweep that doesn't
// match Sweep's real, flat data shape, and would send this looking for a
// key that was never there), this walks down through whichever nesting is
// ACTUALLY present, always picking that level's own base/default value
// (never the toggled-on variant, matching every other consumer's "default
// subvariant" convention) until it reaches real path data or runs out of
// known keys to try -- self-correcting to the real shape at every level,
// not guessing once at the top.
const DEFAULT_VARIANT_KEYS = ['A', 'Outside', 'Normal', 'Pop'];
function fbImportResolveLeaf(node, explicitKey) {
  if (!node) return null;
  if (node.paths) return node;
  if (explicitKey && node[explicitKey]) {
    const viaExplicit = fbImportResolveLeaf(node[explicitKey]);
    if (viaExplicit) return viaExplicit;
  }
  for (let i = 0; i < DEFAULT_VARIANT_KEYS.length; i++) {
    const key = DEFAULT_VARIANT_KEYS[i];
    if (node[key]) {
      const resolved = fbImportResolveLeaf(node[key]);
      if (resolved) return resolved;
    }
  }
  return null; // nested by something none of the known default keys match
  // -- surfaced to the caller as "no Right-direction data" (an honest
  // "not supported yet"), not a silently wrong import.
}
function fbImportLegacyLeaf(playType, variantKey) {
  const dirs = playType.directions || {};
  return {
    left: fbImportResolveLeaf(dirs.Left, variantKey),
    right: fbImportResolveLeaf(dirs.Right, variantKey),
  };
}

/**
 * @param {object} playType - an entry from window.DATA.playTypes, Wing-
 *   sourced (see file header -- Split isn't supported).
 * @param {import('./schema.js').Formation} targetFormation
 * @param {string} newId
 * @param {string} newLabel
 * @param {string} [variantKey] - optional explicit override for the
 *   TOP-level variant to prefer (e.g. 'Counter' to import that variant
 *   instead of the default 'Normal'); omit to always get each level's own
 *   default -- fbImportLegacyLeaf's own resolver auto-detects and walks
 *   whatever nesting the play's real data actually has, so this is never
 *   required just to make a play importable.
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

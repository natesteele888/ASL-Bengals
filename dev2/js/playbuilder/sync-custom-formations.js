// ============================================================
// Play Builder v2 -- syncs custom (non-Wing/Split) formations authored in
// Play Builder V2 into the REAL app's coach-facing surfaces, at boot,
// app-wide -- same reasoning as index.html's own customFormations sync
// right above this file's call site (js/formations.js's registry has to
// be populated before ANYTHING renders a play, not lazily inside one
// panel).
//
// Two things, per non-Wing/Split Play Builder V2 formation:
//   1. Registers it into window.Formations (registerCustom) -- so
//      js/play-calls.js's renderFormationPicker() lists it, exactly like
//      a formation built the old way already does.
//   2. Converts each of its plays via js/playbuilder/legacy-adapter.js's
//      toLegacyPlayType() and merges the result into window.DATA.
//      playTypes by key -- so renderCardDiagram/getVariant/the quiz/PDFs/
//      This Week/dev-regression.html -- everything that already reads
//      DATA.playTypes -- picks them up with ZERO changes to any of them.
//
// Wing and Split themselves are explicitly skipped -- their own cutover
// (switching js/play-calls.js's loadLiveEditsIntoData() to source THEM
// from the adapter too) is separate, later work (the plan's own Phase 7),
// not folded in here. This file only ever adds NEW playType keys or
// replaces ones it itself previously added; it never touches Wing/Split's
// existing, live, shipped-defaults-or-playEdits-sourced entries.
//
// Deliberately does NOT touch formationPlays (which of a formation's
// plays are CURATED to actually show up for coaches/kids to browse).
// Nathan, after Formation Builder auto-assigned every play to a brand-new
// formation without asking: "it automatically assigned all plays to the
// formation without me verifying which plays I wanted to assign." A
// brand-new custom formation's curation stays empty here too (matching
// js/play-calls.js's own renderFormationPlays() fallback -- "not
// built-in" + no formationPlays entry means nothing shown yet, not
// everything) until explicitly set via the already-existing
// AssignmentStore.saveFormationPlays().
//
// IIFE-wrapped, matching every other playbuilder/*.js file -- nothing
// here is called by bare name from outside, only via
// window.PlayBuilderSyncCustomFormations.
(function () {

// window.Formations' registerCustom()/positions() convention predates
// computed mirrors -- it expects BOTH sides' positions explicitly stored
// (js/formations.js's own header comment: "positions are stored per side,
// not mirrored on the fly"). Derives Left the same way every other real
// consumer already trusts (PlayBuilderMirror.resolveAnchor), not a
// second, reimplemented reflection -- this function exists only to
// satisfy window.Formations' own older storage shape, not to introduce a
// new mirroring idea.
function legacyPositionsForSide(formation, side) {
  const out = {};
  formation.positions.forEach((pos) => {
    const anchor = window.PlayBuilderMirror.resolveAnchor(formation, pos.id, { wingSide: side, direction: side });
    out[pos.label || String(pos.id)] = [anchor.x, anchor.y];
  });
  return out;
}

// window.Formations' own registry only ever stores ONE static position per
// side per slot (js/formations.js's positions(), confirmed: only reads
// opts.overload, has no idea alignmentToggles exists at all) -- baked in
// above using resolveAnchor with no `alignment` passed, i.e. always the
// toggle's DEFAULT value. Fine for every position with no toggle, wrong
// for one that has one (Heavy on I's #4): the legacy registry can only
// ever show the default (Heavy On) spot, never Off, no matter what's
// actually selected. Stashing the real Play Builder V2 Formation object
// here lets js/play-calls.js's p4AnchorOn resolve the REAL, alignment-
// aware anchor directly via PlayBuilderMirror when one exists, instead of
// going through the legacy registry's static-only shape -- confirmed
// live as a real bug: Nathan, on I's Heavy toggle, "Heavy On is still
// incorrect... the 4 should move down to the spot next to the 2 back" --
// the circle was always rendering at Wing's own real wing-out spot
// (window.Formations.positions('wing',...) -- a SEPARATE, older bug in
// p4AnchorOn's own hardcoded 'wing' -- see that file's own comment)
// regardless of Heavy's state, and even once THAT was fixed, the legacy
// registry alone still couldn't move between Heavy's two real states.
window.PlayBuilderFormationsById = window.PlayBuilderFormationsById || {};
// Real, live Play Builder V2 Play objects (base variant's players array is
// what matters here), keyed by play id -- js/play-calls.js's
// renderCardDiagram reads this for a WING position (#4 on "I") specifically,
// so it can call PlayBuilderMirror.resolveRoute directly with the REAL,
// live wingSide at render time, instead of trusting the adapter's own
// per-DIRECTION-only pre-baked data. That baked data is genuinely
// UNDER-DETERMINED for a wing position with real, distinct sameSideRoute/
// crossSideRoute shapes -- which one is correct depends on wingSide, which
// isn't known yet at bake time (the adapter bakes once per direction, using
// a wingSide PINNED to 'left' purely so the OLD, Wing-only render-time
// branch's own reflect-based convention would round-trip correctly -- see
// that branch's own comment in play-calls.js). No reflection applied at
// render time can recover the correct SHAPE once the wrong one (same vs
// cross) was already selected at bake time -- confirmed live: Sweep's #4
// rendered his cross-side technique at Wing Right/Direction Right instead
// of same-side, invisible only as long as the two shapes happened to be
// identical. Direct re-resolution sidesteps the whole problem.
window.PlayBuilderPlaysById = window.PlayBuilderPlaysById || {};

function registerFormation(formation) {
  window.PlayBuilderFormationsById[formation.id] = formation;
  // Already real -- either built-in (impossible here, callers already
  // skip wing/split) or a formation this same sync already registered on
  // an earlier boot. window.Formations has no "update an existing
  // registration" call, and re-registering identically would be a no-op
  // anyway, so skip rather than re-derive positions for nothing.
  if (!window.Formations || window.Formations.get(formation.id)) return;
  window.Formations.registerCustom({
    id: formation.id,
    name: formation.label,
    side: 'offense',
    lineSlots: ['LT', 'LG', 'C', 'RG', 'RT'],
    anchored: [],
    positions: {
      Right: legacyPositionsForSide(formation, 'right'),
      Left: legacyPositionsForSide(formation, 'left'),
    },
  });
}

function mergePlayType(legacy) {
  const playTypes = window.DATA.playTypes;
  const i = playTypes.findIndex((p) => p.key === legacy.key);
  if (i === -1) playTypes.push(legacy); else playTypes[i] = legacy;
}

// toLegacyPlayType()'s opts.legacyDimension/legacyVariantKeys were
// previously only ever set by hand -- never by this, the one real call
// site, which is why NO Play Builder V2 play's extra variant (Counter,
// Read A/B, Inside/Outside, Pop Variant) was ever reachable live, no
// matter how a coach authored it. play.legacyDimension (set by editor.js's
// "+ New Variant" -- see its own comment) says WHICH of those dimensions
// this play uses, if any; each of its own variants (past the base) carries
// its own legacyKey (e.g. 'Counter', 'B', 'Outside', 'Pop2') saying which
// value it represents under that dimension.
function fbLegacyOptsFor(play) {
  if (!play.legacyDimension) return undefined;
  const legacyVariantKeys = {};
  play.variants.forEach((v) => { if (v.legacyKey) legacyVariantKeys[v.id] = v.legacyKey; });
  return { legacyDimension: play.legacyDimension, legacyVariantKeys };
}

// The real DefenseLook every play should render against this week (or
// null -- fall back to each play's own default). Set here, at the same
// boot-time sync point as every other Play Builder V2 stash, so it's
// ready before the first real card ever renders. js/play-calls.js's
// renderCardDiagram reads this directly -- Nathan: "I need to be able to
// set the defense for the week so all our plays run against that look."
window.PlayBuilderActiveDefenseLook = window.PlayBuilderActiveDefenseLook || null;

async function syncCustomFormationsIntoData() {
  if (!window.PlayBuilderStore || !window.PlayBuilderLegacyAdapter || !window.PlayBuilderMirror) return;
  if (!window.DATA || !window.DATA.playTypes) return;
  const data = await window.PlayBuilderStore.loadAll();
  const defenseLook = (data.defenseLooks || [])[0];
  if (!defenseLook) return; // nothing to render defenders against yet
  window.PlayBuilderActiveDefenseLook = (data.defenseLooks || []).find((d) => d.id === data.activeDefenseLookId) || null;

  data.formations
    .filter((f) => f.id !== 'shotgun' && f.id !== 'split')
    .forEach((formation) => {
      registerFormation(formation);
      data.plays
        .filter((p) => p.formationId === formation.id)
        .forEach((play) => {
          try {
            mergePlayType(window.PlayBuilderLegacyAdapter.toLegacyPlayType(play, formation, defenseLook, fbLegacyOptsFor(play)));
            window.PlayBuilderPlaysById[play.id] = play;
          } catch (err) {
            // One malformed play (e.g. mid-edit, missing an assignment)
            // degrades to "not shown yet," never breaks every other real
            // play already loaded -- same "one bad thing, not the whole
            // boot" shape index.html's own boot() uses throughout.
            console.error(`[sync-custom-formations] failed to convert play "${play.id}" (continuing anyway):`, err);
          }
        });
    });
}

window.PlayBuilderSyncCustomFormations = { syncCustomFormationsIntoData };

})();

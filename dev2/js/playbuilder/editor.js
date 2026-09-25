// ============================================================
// Play Builder v2 -- interactive editor.
//
// Editing always happens in the CANONICAL frame (wing-right, direction-
// right) -- the Wing/Direction toggles in this page are PREVIEW-only,
// disabled while a player's route is actively selected for editing. That
// sidesteps an entire class of write-back/un-mirror math (figuring out
// what a drag in a mirrored view means for the underlying canonical data)
// that was a real source of bugs in the old editor. A coach previews the
// mirrored result, then goes back to Right/Right to keep editing.
//
// IIFE-wrapped so none of these names (render, selectPlayer, svgEl,
// syncSignalUI, playCallSignalDeck, svgPointFromEvent, state, els, q, ...)
// leak into the shared classic-script global scope -- confirmed real,
// not hypothetical: js/edit-plays.js and js/play-calls.js ALREADY declare
// their OWN top-level render/svgEl/etc., and this file shares a page with
// both in the real app (js/coachtools-playbuilder.js). Without this,
// loading both would silently overwrite whichever one's render() runs
// second, breaking Edit Plays even though only its ENTRY POINT was
// meant to be retired, not its code -- undermining the "old tools stay
// in the DOM, just unlinked" rollback safety Phase 6 exists to have.
// js/playbuilder/formation-editor.js -- the one file that DOES need
// cross-file access to state/render/populatePlaySelect/svgEl/drawCircle
// -- gets it explicitly via window.PlayBuilderEditor (below), not bare
// shared scope.
(function () {

const els = {};
function q(id) { return document.getElementById(id); }

const state = {
  formations: [],
  defenseLooks: [],
  plays: [],
  currentPlay: null,
  currentVariantIndex: 0,
  wingSide: 'right',
  direction: 'right',
  selectedPlayer: null,
  /** For a wing player only: which authored shape is being edited. */
  wingRouteSide: 'sameSide',
  /** Preview only, field-wide: current value id per AlignmentToggle.id
   *  (schema.js), for every toggle the current formation declares -- same
   *  role as wingSide/direction above, just N of them instead of one. */
  alignmentPreview: {},
  /** For the currently selected player only, when their position has an
   *  AlignmentToggle: which value's own route data is being edited right
   *  now (same role as wingRouteSide, for a different, independent axis).
   *  null when the selected player has no alignment toggle. */
  editingAlignment: null,
  selectedPointIndex: null,
  dragging: false,
  /** While true, clicking a player taps them onto the ball path sequence
   *  (js/ball-path-editor.js's BallPathEditor) instead of selecting them
   *  for route editing -- the two share one click, so only one is live. */
  ballPathMode: false,
  /** True while playPreview() (the "Play" button) is animating. */
  isPlaying: false,
  /** Populated fresh by every render() -- {posId: {pathEl, circleEl,
   *  textEl, points, hasBall, anchor}}, playPreview()'s own tween targets. */
  lastRendered: {},
};

const PLAYER_R = 34;
const HANDLE_R = 14;

// A brand-new, unsaved play draft for the given formation -- the shape
// both "+ New Play" and the real Play tab's "Modify -> +" handoff (see
// init()'s own pendingFormation check) need, factored out so the two
// don't drift. `id`/`label` are placeholders; both real call sites
// overwrite them (one from a prompt, the other left as-is until the
// coach renames it via Save).
// Saving a play here never used to make it show up anywhere real -- which
// plays are CURATED to display for a formation (js/assignment-store.js's
// formationPlays) was always a deliberately separate step, so a coach
// using the real Play tab's own "Modify -> +" (js/play-calls.js's
// renderFormationPlays) to build a play, then hitting Save, saw... nothing
// change. Nathan: "Clicking there opens the play builder which then
// assigns the play into the correct formation" -- the assigning IS this:
// every successful save adds this play to its own formation's curated
// list, if it isn't already there. A coach who wants it hidden again uses
// the same real screen's "Modify" to uncheck it -- same one mechanism
// either direction, not a second, separate publishing step. window.
// AssignmentStore only exists in the real app (not this standalone page),
// same guard every other real-app-only integration in this file already
// uses.
async function ensureCuratedForFormation(play) {
  if (!window.AssignmentStore || !play.formationId) return;
  try {
    const all = await window.AssignmentStore.loadFormationPlays();
    const current = all[play.formationId] || [];
    if (current.indexOf(play.id) !== -1) return;
    await window.AssignmentStore.saveFormationPlays(play.formationId, current.concat([play.id]));
  } catch (err) {
    // A coach can always fix curation by hand via Modify -- never block
    // the actual play save (the far more important half) over this.
    console.error('[playbuilder] failed to auto-curate play into its formation (continuing anyway):', err);
  }
}

function newPlayDraft(formationId, viewBox, topPad) {
  return {
    id: 'new_play', label: 'New Play',
    formationId, defenseLookId: state.defenseLooks[0]?.id,
    viewBox, topPad,
    variants: [{ id: 'default', label: 'Base', players: [], ballPath: [] }],
  };
}

function currentFormation() {
  return state.formations.find((f) => f.id === state.currentPlay.formationId);
}
function currentDefenseLook() {
  return state.formations.length ? state.defenseLooks.find((d) => d.id === state.currentPlay.defenseLookId) : null;
}
function currentVariant() {
  return state.currentPlay.variants[state.currentVariantIndex];
}
function baseVariant() {
  return state.currentPlay.variants[0];
}
// A variant only stores players who DIFFER from the base (schema.js's
// PlayVariant doc) -- for any variant past the base, an unlisted player
// isn't "no assignment," it's "same as base," so this falls through to
// base's own entry instead of returning undefined. The base variant
// itself has nothing further to fall through to.
function assignmentFor(playerId) {
  const variant = currentVariant();
  const own = variant.players.find((p) => p.player === playerId);
  if (own || variant === baseVariant()) return own;
  return baseVariant().players.find((p) => p.player === playerId);
}
// The full player list a non-base variant actually plays with, once
// inheritance is resolved: base's own entries, with any of this variant's
// own overrides substituted in by player id, plus any player this variant
// introduces that base never had. render()'s route/circle drawing needs
// this (not the raw, possibly-sparse variant.players) so an untouched
// player in a new variant still shows base's real route, not nothing.
function effectivePlayers(variant) {
  if (variant === baseVariant()) return variant.players;
  const merged = baseVariant().players.map((p) => variant.players.find((o) => o.player === p.player) || p);
  variant.players.forEach((p) => { if (!merged.find((m) => m.player === p.player)) merged.push(p); });
  return merged;
}
// Same inherit-unless-overridden rule as effectivePlayers(), applied to
// the whole ball path (it's one sequence for the variant, not a per-player
// thing, so there's nothing to merge -- a non-base variant either has its
// OWN full sequence, once a coach has actually touched it, or shows
// base's). A brand-new variant should visibly play the same ball path as
// Base, not "nobody has it," until a coach changes that.
function effectiveBallPath(variant) {
  if (variant.ballPath && variant.ballPath.length) return variant.ballPath;
  if (variant !== baseVariant()) return baseVariant().ballPath || [];
  return [];
}
function isWing(playerId) {
  return (currentFormation().wingPositionIds || []).includes(playerId);
}
// The AlignmentToggle (schema.js) covering this position, or null -- a
// position is covered by at most one (schema.js's own doc).
function alignmentToggleFor(formation, playerId) {
  return (formation.alignmentToggles || []).find((t) => t.positionIds.includes(playerId)) || null;
}
// Field-wide PREVIEW value for a position's own alignment toggle, or
// undefined for a position with none -- same role as state.wingSide/
// state.direction, just looked up per-position since different positions
// in the same formation could in principle have different toggles.
function previewAlignmentFor(formation, positionId) {
  const toggle = alignmentToggleFor(formation, positionId);
  if (!toggle) return undefined;
  return state.alignmentPreview[toggle.id] || toggle.values[0].id;
}
// The object to read/write route data (points/sameSideRoute/crossSideRoute)
// on for the CURRENTLY SELECTED player, given state.editingAlignment --
// `assignment` itself for the toggle's default value (nothing new to
// create, matches every position with no toggle at all), or a real,
// lazily-created entry under assignment.alignmentOverrides[value]
// otherwise -- seeded from that alignment's own real anchor (mirror.js's
// resolveAnchor, canonical Right/Right frame) the same way selectPlayer()
// already seeds a brand-new default-alignment route, so a coach editing a
// non-default alignment for the first time starts from a real point on
// the field, never nothing.
function routeHolder(assignment, playerId) {
  const toggle = alignmentToggleFor(currentFormation(), playerId);
  const value = state.editingAlignment;
  if (toggle && value && value !== toggle.values[0].id) {
    if (!assignment.alignmentOverrides) assignment.alignmentOverrides = {};
    if (!assignment.alignmentOverrides[value]) {
      const anchor = window.PlayBuilderMirror.resolveAnchor(currentFormation(), playerId, { wingSide: 'right', direction: 'right', alignment: value });
      assignment.alignmentOverrides[value] = isWing(playerId)
        ? { sameSideRoute: [{ x: anchor.x, y: anchor.y }], crossSideRoute: [{ x: anchor.x, y: anchor.y }] }
        : { points: [{ x: anchor.x, y: anchor.y }] };
    }
    const holder = assignment.alignmentOverrides[value];
    if (isWing(playerId)) {
      if (holder.sameSideRoute.length < 2) holder.sameSideRoute.push({ x: holder.sameSideRoute[0].x, y: holder.sameSideRoute[0].y - 100 });
      if (holder.crossSideRoute.length < 2) holder.crossSideRoute.push({ x: holder.crossSideRoute[0].x, y: holder.crossSideRoute[0].y - 100 });
    } else if (holder.points.length < 2) {
      holder.points.push({ x: holder.points[0].x, y: holder.points[0].y - 100 });
    }
    return holder;
  }
  // "5 Guys"-style formations: a regular position's Wing-Left redistribution
  // (Formation.wingLeftAnchors / PlayerAssignment.wingLeftRoute -- see
  // wingLeftAnchorFor/wingLeftRouteFor near render()) is itself an
  // independently-authored, absolute route, same idea as overrides.left --
  // so editing while PREVIEWING Wing Left on a covered position has to
  // write INTO wingLeftRoute, or the drag handles would edit data the
  // Wing-Left render doesn't even use (render() already prefers
  // wingLeftRoute over the base route whenever both exist). Checked before
  // the direction-override branch below since it's the render's own
  // priority too.
  if (!isWing(playerId) && state.wingSide === 'left' && currentFormation().wingLeftAnchors && currentFormation().wingLeftAnchors[playerId]) {
    if (!assignment.wingLeftRoute || !assignment.wingLeftRoute.length) {
      const alt = currentFormation().wingLeftAnchors[playerId];
      assignment.wingLeftRoute = [{ x: alt.x, y: alt.y }];
    }
    if (assignment.wingLeftRoute.length < 2) {
      assignment.wingLeftRoute.push({ x: assignment.wingLeftRoute[0].x, y: assignment.wingLeftRoute[0].y - 100 });
    }
    return { points: assignment.wingLeftRoute };
  }
  // General wingSide+direction override -- regular (non-wing) positions
  // only, schema.js's own PlayerAssignment.overrides. Nathan: "regardless
  // of toggles, all players paths should be allowed to be edited... if I
  // click a player, I should be able to edit their path and it should
  // save for them on the exact play call and not affect other
  // variations." Keyed off whatever's actually being PREVIEWED right now
  // (state.wingSide/state.direction) -- no separate "which am I editing"
  // sub-toggle needed, what you're looking at is what you edit. Keyed by
  // DIRECTION ONLY, never wingSide -- a regular position's route never
  // actually depends on wingSide in this system (mirror.js's own resolveRoute
  // never reads it for one), so "Wing Left, Dir Right" and "Wing Right, Dir
  // Right" are the exact same route and correctly edit the same underlying
  // data; only switching Direction to Left reaches a real, separate
  // override. Direction:Right is the ordinary/base case and needs no
  // override at all -- returns the base assignment, same as always.
  // Doesn't compose with an alignment-override edit in progress (schema.js's
  // own doc already flags this as not yet supported) -- the alignment
  // branch above always takes priority when both could apply.
  if (!isWing(playerId) && state.direction === 'left') {
    if (!assignment.overrides) assignment.overrides = {};
    if (!assignment.overrides.left) {
      // Seeded from the REAL, currently-computed route for this direction
      // (not a blank stub) -- a coach previewing the mirrored view and
      // clicking a player starts from the shape they're already looking
      // at and adjusts it into a genuine one-off, rather than redrawing
      // from scratch.
      const computed = window.PlayBuilderMirror.resolveRoute(currentFormation(), currentVariant().players, playerId, { wingSide: 'right', direction: 'left' });
      assignment.overrides.left = (computed || assignment.points || []).map((pt) => ({ x: pt.x, y: pt.y }));
    }
    return { points: assignment.overrides.left };
  }
  return assignment;
}
// Which assignment's OWN flags (hasBall, endType) actually apply to a
// given formation slot -- almost always that slot's own assignment,
// EXCEPT a swap-pair position on direction='left', where resolveRoute
// (mirror.js) draws the PARTNER's route in this slot, so which player is
// "carrying" has to follow the same swap or a swapped slot would show the
// wrong player's ball/color. Mirrors ONLY the swap-pair branch of
// resolveRoute's own logic -- wing and center-mirror positions never
// change WHICH assignment applies, only how its points are transformed,
// so they need no equivalent here.
// A play's OWN directionSwapPairs (schema.js: which two REGULAR
// positions' ROUTES -- not standing spots -- trade by direction, for
// THIS play specifically, e.g. Inside Zone's players 2/3) merges into the
// formation's own (unrelated) mirrorSwapPairs for exactly this render --
// same fbLegacyRouteFormation() js/playbuilder/legacy-adapter.js already
// does for the real, live card. Without this, Play Builder V2's OWN
// Direction:Left preview would show the WRONG backfield carrier for such
// a play, disagreeing with what actually plays live -- not reachable with
// any play authored today (nothing sets directionSwapPairs yet), but
// wired now so authoring one doesn't silently break the preview later.
function routeFormationFor(formation, play) {
  if (!play.directionSwapPairs || !play.directionSwapPairs.length) return formation;
  return Object.assign({}, formation, {
    mirrorSwapPairs: (formation.mirrorSwapPairs || []).concat(play.directionSwapPairs),
  });
}

function resolveAssignment(formation, players, playerId, direction, play) {
  if (direction === 'left') {
    const pairs = (formation.mirrorSwapPairs || []).concat((play && play.directionSwapPairs) || []);
    const pair = pairs.find((p) => p[0] === playerId || p[1] === playerId);
    if (pair) {
      const partnerId = pair[0] === playerId ? pair[1] : pair[0];
      const partnerAssignment = players.find((p) => p.player === partnerId);
      if (partnerAssignment && partnerAssignment.points) return partnerAssignment;
    }
  }
  return players.find((p) => p.player === playerId);
}
function isEditingPreviewLocked() {
  // Used to gate ALL editing to the canonical (Wing Right, Dir Right)
  // frame -- Nathan: "regardless of toggles, all players paths should be
  // allowed to be edited. It is fine to default to a side, but if I
  // click a player, I should be able to edit their path and it should
  // save for them on the exact play call and not affect other
  // variations of the play with different toggle selections." Editing
  // now writes to whichever combination is actually being previewed
  // (routeHolder(), schema.js's own PlayerAssignment.overrides), so
  // there's no longer a real/safety reason to block it -- kept as a
  // named function (rather than deleting every call site) so the
  // ball-path-mode and click-handling call sites below read the same as
  // before; always unlocked now.
  return false;
}
// The one remaining real use of "canonical frame only" -- ball path
// editing (see its own call site's comment), which has no per-context
// override storage the way route points now do.
function isCanonicalFrame() {
  return state.wingSide === 'right' && state.direction === 'right';
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

// Straight polyline through the raw points, in order -- used ONLY for the
// dashed edit-handle guide line, which should show handles exactly where
// they are and how they're connected, not the smoothed shape the actual
// route renders as (see curvedPathD below for that).
function pointsToPathD(points) {
  if (points.length < 2) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

// The actual rendered route stroke. Same alternating control/on-curve
// quadratic-bezier convention js/play-calls.js's chainedCurvePathD already
// uses for the real cards and js/edit-plays.js's route editor already
// authors with (point 0 = on-curve start, then control/on-curve/control/
// on-curve/... in pairs, any leftover single point falls back to a
// straight `L`) -- not a second, different curve model. A 2-point route is
// unaffected (falls straight through to the final `L`). Nathan: "it should
// be intuitive where you can grab the middle of the line and pull to
// manipulate the curvature of the line. We had it in a previous build" --
// the earlier straight-segments-between-every-point rendering (kept only
// for the guide line above) made a 3rd point look like a kink, not a
// curve, even once a coach found a way to add one.
function curvedPathD(points) {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  let i = 1;
  for (; i + 1 < points.length; i += 2) {
    d += ` Q ${points[i].x} ${points[i].y} ${points[i + 1].x} ${points[i + 1].y}`;
  }
  if (i < points.length) d += ` L ${points[i].x} ${points[i].y}`;
  return d;
}

// Nearest-segment lookup for "grab the middle of the line and pull" --
// projects `pt` onto every consecutive pair of points and returns the
// index i such that inserting a new point between points[i]/points[i+1]
// (i.e. at i+1) lands it right where the coach actually grabbed the line,
// not just appended/prepended. Plain point-to-segment distance, not curve-
// aware -- consistent with js/edit-plays.js's own "+" badge, which also
// inserts a raw midpoint between two adjacent authored points regardless
// of which of them are curve control points.
function nearestSegmentIndex(points, pt) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq ? ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const dist = (pt.x - px) ** 2 + (pt.y - py) ** 2;
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

function svgPointFromEvent(ev) {
  const pt = els.svg.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  const ctm = els.fieldGroup.getScreenCTM().inverse();
  const local = pt.matrixTransform(ctm);
  return { x: Math.round(local.x), y: Math.round(local.y) };
}

// "5 Guys"-style formations: a REGULAR (non-wing) position can carry an
// explicit, literal alternate anchor for wingSide='left' -- redistributing
// around wherever the true wing position ends up, never crossing sides
// (Formation.wingLeftAnchors, schema.js). js/play-calls.js's own
// wingLeftAnchor/wingLeftRouteFor already apply this to the real
// coach-facing card; this canvas needs the identical lookup, or switching
// the field's own Wing toggle to Left only moves the true wing position
// and leaves 3/5/2/6 stranded at their Wing-Right spots -- found live,
// Nathan: "I change the toggle to Wing Left and it moves him over without
// adjusting the other 3, 5, 2, or 6."
function wingLeftAnchorFor(formation, positionId, anchor) {
  const alt = formation.wingLeftAnchors && formation.wingLeftAnchors[positionId];
  return (alt && state.wingSide === 'left') ? { x: alt.x, y: alt.y } : anchor;
}

// Nathan, testing a newly-imported "Double Blast" live on "I Wing": the
// flanker (#4) and the Overloaded tight end drew right on top of each
// other. js/play-calls.js's real, coach-facing card already has this fix
// (p4OverloadCollisionAnchor, built earlier this session) -- confirmed by
// direct render-and-inspect that the real card does NOT show this overlap
// in any Wing/Overload combination -- but it was only ever built into
// that file, never mirrored into this standalone authoring canvas, which
// resolves every position's anchor through plain resolveAnchor() with no
// awareness of Formation.overload.flankerAnchors at all. Same logic,
// adapted to this file's own lowercase wingSide convention and
// state.alignmentPreview (play-calls.js's own alignmentValues).
function overloadCollisionAnchorFor(formation, positionId, wingSide) {
  if (!formation.overload || formation.overload.flanker !== positionId) return null;
  const heavyToggle = (formation.alignmentToggles || []).find((t) => t.positionIds.includes(positionId));
  if (heavyToggle) {
    const heavyValue = state.alignmentPreview[heavyToggle.id] || heavyToggle.values[0].id;
    if (heavyValue === heavyToggle.values[0].id) return null; // Heavy at its default (tucked) -- nothing to collide with
  }
  const overloadToggle = (formation.alignmentToggles || []).find((t) => t.id === 'overload');
  const overloadValue = overloadToggle ? (state.alignmentPreview[overloadToggle.id] || overloadToggle.values[0].id) : null;
  if (!overloadValue || overloadValue === 'off' || overloadValue !== wingSide) return null;
  const anchor = formation.overload.flankerAnchors && formation.overload.flankerAnchors[wingSide];
  return anchor ? { x: anchor.x, y: anchor.y } : null;
}

function wingLeftRouteFor(formation, players, positionId) {
  if (!formation.wingLeftAnchors || !formation.wingLeftAnchors[positionId] || state.wingSide !== 'left') return null;
  const assignment = players.find((p) => p.player === positionId);
  return (assignment && assignment.wingLeftRoute) ? assignment.wingLeftRoute.map((pt) => ({ x: pt.x, y: pt.y })) : null;
}

// "5 Guys": WHO'S featured (has the ball) rotates to a DIFFERENT player
// when Wing flips, not just where the same player is drawn. Nathan: "the
// target refers to the 1st position going from receivers left to right...
// when the wing switches to the other side, the wing becomes the outside
// guy making him position 1 and the 3 is now in position 2" -- so "5
// Guys #1" means "whoever is standing in the #1 (leftmost) spot," and
// that's a DIFFERENT jersey number depending on wingSide. Player-agnostic
// (works for the wing position #4 too, not just wingLeftAnchors-covered
// regular positions) since it's purely a live data lookup, not tied to
// the anchor/route mechanism above. Falls back to the assignment's own
// plain hasBall when nothing overrides it -- a no-op for every position/
// play that was never touched by this, including every non-"5 Guys" play.
function wingLeftHasBall(assignment, hasBall) {
  if (state.wingSide !== 'left' || !assignment) return hasBall;
  return assignment.wingLeftHasBall != null ? assignment.wingLeftHasBall : hasBall;
}

// I's Sweep: Nathan: "When the 4 is out wide in I formation, the sweep
// can no longer go to the 4. If the 4 is out of heavy, the ball would be
// pitched to the 3 back" -- deliberately checks the 'heavy' toggle BY
// NAME, not previewAlignmentFor (which only resolves a value for a
// position actually listed in that toggle's OWN positionIds -- #4's
// Heavy coverage). #3 isn't listed there at all (his STANDING SPOT never
// changes, only his ROLE does), and this formation's OTHER toggle
// (Overload) also defaults to a value literally named 'off' -- a generic
// "does any toggle's current value match a key in alignmentOverrides"
// check would wrongly fire off Overload sitting at its own default,
// regardless of Heavy. Reads state.alignmentPreview directly (the same
// map previewAlignmentFor itself reads) since there's no per-position
// gate to go through here.
function alignmentHasBall(formation, positionId, assignment, hasBall) {
  const toggle = (formation.alignmentToggles || []).find((t) => t.id === 'heavy');
  if (!toggle || !assignment) return hasBall;
  const value = state.alignmentPreview[toggle.id] || toggle.values[0].id;
  const override = assignment.alignmentOverrides && assignment.alignmentOverrides[value];
  return (override && override.hasBall != null) ? override.hasBall : hasBall;
}

// Same class of gap as wingLeftRouteFor -- resolveRoute only applies an
// alignment override for a position previewAlignmentFor resolves a value
// for, which requires that position to be listed in the toggle's OWN
// positionIds (#4 for Heavy). #3's own alignmentOverrides.off.points (his
// "carry the sweep when Heavy is off" route) would never apply at all,
// same reasoning as alignmentHasBall just above. A no-op for #4 himself
// (he uses sameSideRoute/crossSideRoute inside alignmentOverrides, never
// `.points`, so this naturally finds nothing for him -- already correctly
// handled by the normal resolveRoute path).
function alignmentRouteFor(formation, players, positionId) {
  const toggle = (formation.alignmentToggles || []).find((t) => t.id === 'heavy');
  if (!toggle) return null;
  const value = state.alignmentPreview[toggle.id] || toggle.values[0].id;
  const assignment = players.find((p) => p.player === positionId);
  const override = assignment && assignment.alignmentOverrides && assignment.alignmentOverrides[value];
  return (override && override.points) ? override.points.map((pt) => ({ x: pt.x, y: pt.y })) : null;
}

function render() {
  // Nathan: "include the name of the play at the top of the editing
  // screen so I know what play I am editing." Every render, not just on
  // play-switch, since it's cheap and this way it can never drift out of
  // sync with whatever's actually loaded (a new/renamed play, the real
  // Play tab's own "+" handoff, etc.) the way a change-listener-only sync
  // could.
  if (els.pbFieldTitle) {
    els.pbFieldTitle.textContent = state.currentPlay
      ? `${currentFormation()?.label || ''} — ${state.currentPlay.label || '(untitled play)'}`
      : '';
  }
  // Same "every render, can't drift" reasoning as pbFieldTitle just above
  // -- real bug, found live: Nathan, on Coach Tools' own Play Builder:
  // "I want to add a play to the 5 guys formation. it says it is set to
  // 5 guys on the right but still shows I formation." Root cause: this
  // select is disabled (deliberately -- see its own doc, a play can't be
  // reassigned to a different formation here) but nothing ever kept its
  // DISPLAYED value in sync with state.currentPlay.formationId except
  // onFormationSaved(), a hook that only fires when a formation gets
  // saved from the OTHER screen -- switching which PLAY is loaded here
  // (els.pbPlaySelect's own change handler) never touched it at all, so
  // it just kept showing whatever formation happened to be displayed
  // last, regardless of which play was actually on screen.
  if (els.pbFormationSelect && state.currentPlay) {
    els.pbFormationSelect.value = state.currentPlay.formationId;
  }
  els.svg.innerHTML = '';
  if (!state.currentPlay) return;
  renderAlignmentPreviewToggles();

  const [vw, vh] = state.currentPlay.viewBox || [1600, 1030];
  const topPad = state.currentPlay.topPad ?? 400;
  els.svg.setAttribute('viewBox', `0 0 ${vw} ${vh + topPad}`);
  els.svg.appendChild(svgEl('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: '#ffffff' }));

  const fieldGroup = svgEl('g', { transform: `translate(0,${topPad})` });
  els.fieldGroup = fieldGroup;
  // js/ball-path.js's drawOverlay / js/ball-path-editor.js's BallPathEditor
  // both read stage._mainGroup directly (same convention renderCardDiagram
  // uses in the real app) -- rebuilt fresh every render since fieldGroup
  // itself is a brand-new node each time.
  els.svg._mainGroup = fieldGroup;
  const defenseLayer = svgEl('g', {});
  const pathsLayer = svgEl('g', {});
  const circlesLayer = svgEl('g', {});
  const handlesLayer = svgEl('g', {});

  const formation = currentFormation();
  const defenseLook = currentDefenseLook();
  const variant = currentVariant();
  const { resolveAnchor, resolveRoute } = window.PlayBuilderMirror;

  // Defense. Same real-jersey-number substitution as js/play-calls.js's
  // own renderCardDiagram/renderSplitDiagram (js/depth-chart.js's
  // getDefenseStarterNumbers, our own team's Depth Chart -- see its
  // comment for the matching rule) -- kept consistent here too, since a
  // coach previews plays against this exact defense right before they go
  // into the real card.
  const defensePositions = defenseLook?.positions || [];
  const editorDefenderNumbers = window.getDefenseStarterNumbers ? window.getDefenseStarterNumbers(defensePositions) : {};
  defensePositions.forEach((d) => {
    const label = editorDefenderNumbers[d.id] || d.label;
    defenseLayer.appendChild(drawCircle(d.x, d.y, label, '#e8720c', 26));
  });

  // Routes (behind circles, so a player's number stays readable). Iterates
  // FORMATION SLOTS, not variant.players directly -- for a swap-pair
  // position on the Left side, which player's authored data belongs in
  // this slot depends on the swap (see resolveRoute), not on which slot
  // happens to already have an assignment. Uses effectivePlayers(), not
  // variant.players directly, so a non-base variant's untouched players
  // still draw base's real route instead of nothing.
  const players = effectivePlayers(variant);
  // Per-position handles for playPreview() (the "Play" button) to tween --
  // same {pathEl, circleEl, textEl, points, hasBall} shape js/play-calls.js's
  // own lastRenderedPaths convention uses, rebuilt fresh every render since
  // the whole SVG is rebuilt fresh every render too.
  state.lastRendered = {};
  const routeFormation = routeFormationFor(formation, state.currentPlay);
  formation.positions.forEach((pos) => {
    let points = resolveRoute(routeFormation, players, pos.id, { wingSide: state.wingSide, direction: state.direction, alignment: previewAlignmentFor(formation, pos.id) });
    if (!points) return;
    const wingLeftPoints = wingLeftRouteFor(formation, players, pos.id);
    if (wingLeftPoints) points = wingLeftPoints;
    const alignmentPoints = alignmentRouteFor(formation, players, pos.id);
    if (alignmentPoints) points = alignmentPoints;
    const assignment = resolveAssignment(formation, players, pos.id, state.direction, state.currentPlay);
    const hasBall = alignmentHasBall(formation, pos.id, assignment, wingLeftHasBall(assignment, !!(assignment && assignment.hasBall)));
    const color = hasBall ? '#e0201a' : '#123a8c';
    const pathEl = svgEl('path', {
      d: curvedPathD(points), fill: 'none', stroke: color, 'stroke-width': 7, 'stroke-linecap': 'round',
    });
    pathsLayer.appendChild(pathEl);
    state.lastRendered[pos.id] = { pathEl, points, hasBall };
  });

  // Player circles
  formation.positions.forEach((pos) => {
    const anchor = overloadCollisionAnchorFor(formation, pos.id, state.wingSide)
      || wingLeftAnchorFor(formation, pos.id, resolveAnchor(formation, pos.id, { wingSide: state.wingSide, direction: state.direction, alignment: previewAlignmentFor(formation, pos.id) }));
    const isSelected = state.selectedPlayer === pos.id;
    const c = drawCircle(anchor.x, anchor.y, String(pos.label ?? pos.id), '#111111', PLAYER_R, isSelected);
    c.style.cursor = 'pointer';
    c.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // Preview-locked (previewing a mirrored Wing/Direction) means
      // looking, not editing -- neither branch below should fire. This
      // used to only gate the ball-path branch; the plain-select branch
      // had no lock check at all, so clicking a player while "just
      // looking" at a mirrored preview still called selectPlayer(),
      // which unconditionally forks that player's assignment into the
      // current variant (a real, silent, persisted mutation from a click
      // that was never meant to edit anything) -- confirmed live.
      if (isEditingPreviewLocked()) return;
      // Ball Path mode reuses js/ball-path-editor.js's own real
      // interaction (tap players in order) completely unmodified -- it
      // listens for this exact 'playerclick' event, the same one
      // renderCardDiagram dispatches in the real app. Only live in the
      // canonical frame and only while that mode's on, so it can never
      // collide with the "click to select for route editing" interaction
      // this same circle click means the rest of the time.
      if (state.ballPathMode) {
        // A lineman (LT/LG/C/RG/RT -- string ids, unlike every real ball-
        // carrying position's numeric id) never actually touches the ball
        // in this game -- js/ball-path-editor.js's own addPlayer() had no
        // check at all, so tapping one mid-sequence silently added a real,
        // nonsensical leg (a "handoff to the Center"). Nathan: "there is
        // no way to remove a ball path. To fix the no handoff issue, I had
        // to first tap the center, then the QB, then the RB" -- a tap
        // that likely landed on a lineman by mistake (I's backfield is
        // tightly stacked) is exactly what this was silently allowing.
        if (typeof pos.id !== 'number') {
          if (els.statusEl) els.statusEl.textContent = `#${pos.id} can't touch the ball -- only real ball carriers (1-6) can be tapped into the sequence.`;
          return;
        }
        els.svg.dispatchEvent(new CustomEvent('playerclick', { detail: pos.id }));
      } else {
        selectPlayer(pos.id);
      }
    });
    circlesLayer.appendChild(c);
    if (state.lastRendered[pos.id]) {
      state.lastRendered[pos.id].circleEl = c.circleEl;
      state.lastRendered[pos.id].textEl = c.textEl;
      state.lastRendered[pos.id].anchor = anchor;
    }
  });

  // Edit handles for the selected player -- only ever shown in canonical
  // frame; see isEditingPreviewLocked().
  if (state.selectedPlayer !== null && !isEditingPreviewLocked()) {
    const editPoints = editablePointsForSelected();

    handlesLayer.appendChild(svgEl('path', {
      d: pointsToPathD(editPoints), fill: 'none', stroke: '#1a8c3a', 'stroke-width': 3, 'stroke-dasharray': '6 6',
    }));

    // Invisible, wide hit-target laid over the same guide line -- grab
    // anywhere along it (not just an existing handle) and drag to insert a
    // new point right there, dragging immediately in the same gesture. The
    // thin dashed stroke above is too narrow to reliably grab on its own;
    // this gives it a generous hit area without changing how it looks.
    if (editPoints.length >= 2) {
      const hitPath = svgEl('path', {
        d: pointsToPathD(editPoints), fill: 'none', stroke: 'transparent', 'stroke-width': 28, cursor: 'copy',
      });
      hitPath.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        const pt = svgPointFromEvent(ev);
        const insertAt = nearestSegmentIndex(editPoints, pt) + 1;
        editPoints.splice(insertAt, 0, pt);
        state.selectedPointIndex = insertAt;
        state.dragging = true;
        render();
      });
      hitPath.addEventListener('click', (ev) => ev.stopPropagation());
      handlesLayer.appendChild(hitPath);
    }

    editPoints.forEach((pt, idx) => {
      const isPicked = state.selectedPointIndex === idx;
      const h = svgEl('circle', {
        cx: pt.x, cy: pt.y, r: isPicked ? HANDLE_R + 4 : HANDLE_R,
        fill: '#ffde00', stroke: '#111', 'stroke-width': 2, cursor: 'pointer',
      });
      h.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        state.selectedPointIndex = idx;
        state.dragging = true;
        render();
      });
      // pointerdown selects the handle; without also stopping the
      // subsequent bubbled click here, that click would reach the field's
      // own click handler and immediately deselect the point it was just
      // set to (see that handler's "clicking away deselects" branch) --
      // a select-then-instantly-deselect flicker on every handle click.
      h.addEventListener('click', (ev) => ev.stopPropagation());
      handlesLayer.appendChild(h);

      if (isPicked && editPoints.length > 2) {
        const badge = svgEl('g', { cursor: 'pointer' });
        badge.appendChild(svgEl('circle', { cx: pt.x + 26, cy: pt.y - 26, r: 13, fill: '#e0201a' }));
        const x = svgEl('text', { x: pt.x + 26, y: pt.y - 21, 'text-anchor': 'middle', fill: '#fff', 'font-size': 16, 'font-weight': 900 });
        x.textContent = '✕';
        badge.appendChild(x);
        badge.addEventListener('click', (ev) => {
          ev.stopPropagation();
          editPoints.splice(idx, 1);
          state.selectedPointIndex = null;
          render();
        });
        handlesLayer.appendChild(badge);
      }
    });
  }

  fieldGroup.appendChild(defenseLayer);
  fieldGroup.appendChild(pathsLayer);
  fieldGroup.appendChild(circlesLayer);
  fieldGroup.appendChild(handlesLayer);
  els.svg.appendChild(fieldGroup);

  // Ball path overlay -- canonical frame only, UNLIKE route-point editing
  // above (isEditingPreviewLocked() is now always unlocked for that --
  // see its own comment). A ball-path leg's `at` has no per-context
  // override mechanism the way a route's overrides does -- it's a single,
  // global canonical-frame point, and there's no per-leg mirror math here
  // yet (that would need the same kind of per-owner delta resolveRoute
  // already does for routes). Editing it while previewing a mirrored
  // frame would silently store a Right-looking drag as if it were the
  // canonical value -- a real, different-shaped bug than the route-lock
  // Nathan asked to remove, so this stays gated on its own, narrower
  // check rather than following that change.
  if (els.ballPathEditor && isCanonicalFrame()) {
    const align = {};
    formation.positions.forEach((pos) => {
      const a = resolveAnchor(formation, pos.id, { wingSide: state.wingSide, direction: state.direction });
      align[String(pos.id)] = [a.x, a.y];
    });
    els.ballPathEditor.setAlign(align);
    window.BallPath.clearOverlay(els.svg);
    window.BallPath.drawOverlay(els.svg, els.ballPathEditor.ballPath, align);
    if (state.ballPathMode) els.ballPathEditor._makeBadgesDraggable();
  }

  renderSidebar();
  renderBallPathPanel();
  syncSignalUI();
}

function drawCircle(x, y, label, stroke, r, selected) {
  const wrap = svgEl('g', {});
  const circle = svgEl('circle', {
    cx: x, cy: y, r, fill: selected ? '#fff7e6' : '#ffffff', stroke, 'stroke-width': selected ? 10 : 8,
  });
  wrap.appendChild(circle);
  const t = svgEl('text', { x, y: y + 10, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 900, fill: stroke });
  t.textContent = label;
  wrap.appendChild(t);
  // Matches js/play-calls.js's own drawCircle convention -- playPreview()
  // (the "Play" button) needs direct handles to tween, same as the real
  // card's own animation already does.
  wrap.circleEl = circle;
  wrap.textEl = t;
  return wrap;
}

function selectPlayer(playerId) {
  state.selectedPlayer = playerId;
  state.selectedPointIndex = null;
  // Default to whichever shape is CURRENTLY BEING PREVIEWED (same logic as
  // editingAlignment just below) -- was an unconditional 'sameSide', which
  // only ever matched by coincidence back when editing was canonical-frame-
  // only (sameSide is always true there). Now that Wing/Direction previews
  // other than the default are directly editable, defaulting to the wrong
  // shape would silently edit a route the coach isn't even looking at --
  // the exact bug already fixed for editingAlignment below, same fix here.
  state.wingRouteSide = (state.wingSide === state.direction) ? 'sameSide' : 'crossSide';
  // Default the editing target to whatever alignment is CURRENTLY BEING
  // PREVIEWED for this position, not always the toggle's own default --
  // confirmed live as a real bug: with Heavy previewed "on," clicking the
  // player circle (drawn at the Heavy anchor) silently selected the OFF/
  // default route for editing instead, so a drag edited a route the coach
  // wasn't even looking at.
  const toggle = alignmentToggleFor(currentFormation(), playerId);
  state.editingAlignment = toggle ? previewAlignmentFor(currentFormation(), playerId) : null;

  // Look up (and, if needed, create) the OWN entry in THIS variant --
  // never assignmentFor() here, which would hand back base's shared
  // object for an inherited player; editing that in place would silently
  // edit the base variant too.
  let assignment = currentVariant().players.find((p) => p.player === playerId);
  if (!assignment) {
    const inherited = currentVariant() !== baseVariant()
      ? baseVariant().players.find((p) => p.player === playerId)
      : null;
    // A non-base variant's first edit to a player who was inheriting from
    // base starts from a REAL COPY of base's data (so e.g. Counter's #4
    // starts from Base's actual route, not a blank line) -- deep-cloned so
    // editing the copy can never reach back into base's own object. First
    // time ever assigned in either variant: nothing to inherit, blank.
    assignment = inherited
      ? JSON.parse(JSON.stringify(inherited))
      : { player: playerId, hasBall: false, delayMs: 0, endType: 'run' };
    currentVariant().players.push(assignment);
  }

  const formationPos = currentFormation().positions.find((p) => p.id === playerId);
  if (isWing(playerId)) {
    if (!assignment.sameSideRoute) assignment.sameSideRoute = [{ x: formationPos.x, y: formationPos.y }];
    if (!assignment.crossSideRoute) assignment.crossSideRoute = [{ x: formationPos.x, y: formationPos.y }];
    if (assignment.sameSideRoute.length < 2) assignment.sameSideRoute.push({ x: assignment.sameSideRoute[0].x, y: assignment.sameSideRoute[0].y - 100 });
    if (assignment.crossSideRoute.length < 2) assignment.crossSideRoute.push({ x: assignment.crossSideRoute[0].x, y: assignment.crossSideRoute[0].y - 100 });
  } else if (!assignment.points || assignment.points.length < 2) {
    assignment.points = [{ x: formationPos.x, y: formationPos.y }, { x: formationPos.x, y: formationPos.y - 100 }];
  }
  render();
}

function editablePointsForSelected() {
  if (state.selectedPlayer === null) return null;
  const assignment = assignmentFor(state.selectedPlayer);
  const holder = routeHolder(assignment, state.selectedPlayer);
  if (isWing(state.selectedPlayer)) {
    return state.wingRouteSide === 'sameSide' ? holder.sameSideRoute : holder.crossSideRoute;
  }
  return holder.points;
}

function initEvents() {
  els.svg.addEventListener('pointermove', (ev) => {
    if (!state.dragging || state.selectedPointIndex === null) return;
    const pts = editablePointsForSelected();
    const local = svgPointFromEvent(ev);
    pts[state.selectedPointIndex] = local;
    render();
  });
  window.addEventListener('pointerup', () => { state.dragging = false; });

  // Click empty field space: with a point picked, clicking away just
  // deselects it (dragging is how you move a point, not clicking). With a
  // player selected but no point picked, clicking adds a new point at the
  // end of their route -- the actual "build the route" interaction.
  els.svg.addEventListener('click', (ev) => {
    if (state.selectedPlayer === null || isEditingPreviewLocked()) return;
    if (state.selectedPointIndex !== null) {
      state.selectedPointIndex = null;
      render();
      return;
    }
    const pts = editablePointsForSelected();
    pts.push(svgPointFromEvent(ev));
    render();
  });
}

function renderSidebar() {
  const assignment = state.selectedPlayer !== null ? assignmentFor(state.selectedPlayer) : null;
  els.pbPlayerPanel.style.display = assignment ? '' : 'none';
  if (!assignment) return;

  els.pbPlayerLabel.textContent = `#${state.selectedPlayer}`;
  els.pbHasBallCheckbox.checked = !!assignment.hasBall;
  els.pbDelayInput.value = assignment.delayMs || 0;
  els.pbEndTypeSelect.value = assignment.endType || 'run';
  els.pbWingRouteToggle.style.display = isWing(state.selectedPlayer) ? '' : 'none';
  // Unlike the other toggles here, wingRouteSide can change WITHOUT a
  // click on this toggle (selectPlayer() always resets it to 'sameSide'
  // when switching players) -- so this sync has to run on every render,
  // not just react to a click. Sets both: .active for playbuilder.html's
  // own plain-button CSS, aria-pressed (+ the real app's placeToggleThumb,
  // when this markup was built with buildToggleGroup) for the real app's
  // .toggle-group CSS, which keys off aria-pressed instead.
  els.pbWingRouteToggle.querySelectorAll('button').forEach((b) => {
    const isActive = b.dataset.value === state.wingRouteSide;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  if (window.placeToggleThumb) window.placeToggleThumb(els.pbWingRouteToggle);
  els.pbPreviewLockNote.style.display = isEditingPreviewLocked() ? '' : 'none';

  // The selected player's OWN alignment toggle (e.g. Heavy), if their
  // position has one -- a second, independent editing-target axis
  // alongside wingRouteSide above, same "always re-sync, not just on
  // click" reasoning (selectPlayer() resets editingAlignment too).
  const editToggle = alignmentToggleFor(currentFormation(), state.selectedPlayer);
  if (els.pbAlignmentEditToggle) {
    els.pbAlignmentEditToggle.style.display = editToggle ? '' : 'none';
    if (editToggle) {
      buildAlignmentToggleGroup(els.pbAlignmentEditToggle, editToggle, state.editingAlignment, (value) => {
        state.editingAlignment = value;
        state.selectedPointIndex = null;
        render();
      });
    }
  }

  // No separate "which direction am I editing" control anymore -- Nathan:
  // "if I click a player, I should be able to edit their path" regardless
  // of what's toggled. routeHolder() now keys directly off the live
  // Direction preview toggle, so this element is just a plain-language
  // confirmation of what that means right now (a regular position's edit
  // target follows Direction only -- Wing side never affects a regular
  // position's route in this system; a wing position's edit target
  // follows its own Same/Cross-side toggle above instead).
  if (els.pbDirectionEditToggle) {
    const showNote = !isWing(state.selectedPlayer);
    els.pbDirectionEditToggle.style.display = showNote ? '' : 'none';
    if (showNote) {
      els.pbDirectionEditToggle.textContent = state.direction === 'left'
        ? "Editing a one-off just for Direction: Left -- won't affect Direction: Right."
        : 'Editing the default (Direction: Right) -- switch the Direction toggle above to Left to edit that side independently.';
    }
  }
}

// Rebuilds a toggle-group's buttons from an AlignmentToggle's own values
// (schema.js) -- unlike pbWingRouteToggle/pbWingSideToggle (fixed L/R
// shape, static markup, just re-synced), a formation's alignment toggles
// are arbitrary (Heavy today, whatever's added next), so their buttons
// have to be built from that data, not pre-existing HTML. Rebuilt fully
// on every call rather than diffed -- cheap (2-4 buttons), same
// "correctness over micro-perf" trade-off the rest of this editor makes.
function buildAlignmentToggleGroup(container, toggle, currentValue, onChange) {
  container.innerHTML = toggle.values.map((v) =>
    `<button data-value="${v.id}" class="${v.id === currentValue ? 'active' : ''}" aria-pressed="${v.id === currentValue ? 'true' : 'false'}">${v.label}</button>`
  ).join('');
  container.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => onChange(b.dataset.value));
  });
  if (window.placeToggleThumb) window.placeToggleThumb(container);
}

// Field-wide PREVIEW row -- one toggle-group per AlignmentToggle the
// current formation declares (Shotgun/Split have none; a formation like
// "I" has Heavy), same role as the fixed Wing/Direction preview toggles
// but built dynamically since the set of toggles varies by formation.
function renderAlignmentPreviewToggles() {
  if (!els.pbAlignmentPreviewToggles) return;
  const formation = currentFormation();
  const toggles = (formation && formation.alignmentToggles) || [];
  if (!toggles.length) { els.pbAlignmentPreviewToggles.innerHTML = ''; return; }
  els.pbAlignmentPreviewToggles.innerHTML = toggles.map((t) =>
    `<span class="hint" style="margin:0">${t.label} (preview)</span><span class="toggleGroup" data-toggle="${t.id}"></span>`
  ).join('');
  toggles.forEach((t) => {
    const group = els.pbAlignmentPreviewToggles.querySelector(`[data-toggle="${t.id}"]`);
    const current = state.alignmentPreview[t.id] || t.values[0].id;
    buildAlignmentToggleGroup(group, t, current, (value) => {
      state.alignmentPreview[t.id] = value;
      render();
    });
  });
}

// The "Play" button -- Play Builder V2 had no way to WATCH a play, only
// look at its static diagram, unlike the real Play Calls card's own ▶.
// Reuses the exact same low-level tween primitives that card's animation
// uses (js/play-calls.js's animatePathDraw/tweenPoint, js/ball-path.js's
// schedule/legStart -- both already exported for exactly this), rather
// than a second, drifting reimplementation. Only reachable in the
// standalone js/play-calls.js is loaded (the real app always does; this
// standalone page, js/coachtools-playbuilder.js's own consumer, does
// not) -- degrades to a no-op rather than throwing when it isn't.
async function playPreview() {
  if (state.isPlaying || !state.currentPlay) return;
  if (!window.animatePathDraw || !window.tweenPoint || !window.BallPath) return;
  state.isPlaying = true;
  if (els.pbPlayBtn) { els.pbPlayBtn.disabled = true; els.pbPlayBtn.textContent = 'Playing…'; }
  // Fresh render first -- ensures state.lastRendered's handles are current
  // (not, say, left over from a different variant) and nothing mid-edit
  // (a picked point, a locked preview note) is showing during playback.
  render();

  const animMs = 1400;
  // "5 Guys": the exchange TARGET rotates to a different player when
  // previewing Wing Left (PlayVariant.wingLeftBallPath, schema.js) -- same
  // reasoning as wingLeftHasBall above. Layered on top of
  // effectiveBallPath()'s own variant-inheritance result rather than
  // changing that function, since its other callers (the ball-path EDITOR
  // itself) are deliberately canonical-frame-only and must keep reading
  // the base ballPath regardless of the field's own wingSide preview.
  const baseBallPath = effectiveBallPath(currentVariant());
  const wingLeftBP = currentVariant().wingLeftBallPath;
  const ballPath = (state.wingSide === 'left' && wingLeftBP && wingLeftBP.length) ? wingLeftBP : baseBallPath;
  const centerEntry = state.lastRendered['C'];
  const align = centerEntry ? { C: [centerEntry.anchor.x, centerEntry.anchor.y] } : null;

  const revealPromises = Object.keys(state.lastRendered).map((posId) => {
    const entry = state.lastRendered[posId];
    return window.animatePathDraw(entry.pathEl, null, animMs, 0, entry.circleEl, entry.textEl);
  });

  // The ball, hopping exchange point to exchange point, timed off when
  // each receiver's OWN route-draw actually reaches that point -- exactly
  // what window.BallPath.schedule() computes, same mechanism the real
  // card's own animation uses. Simpler than that card's carrier-tracking
  // (which eases toward a continuously-moving circle, frame by frame) --
  // this tweens straight point-to-point instead, arriving exactly on
  // schedule either way; plenty for "does this ball path make sense,"
  // which is what this button is for.
  if (align && window.BallPath.isValid(ballPath)) {
    const lookup = (player) => {
      const entry = state.lastRendered[player];
      return (entry && entry.circleEl) ? { circleEl: entry.circleEl, points: entry.points.map((p) => [p.x, p.y]) } : null;
    };
    const pairedLegs = ballPath.filter((leg) => lookup(leg.player));
    const schedule = window.BallPath.schedule(ballPath, lookup, animMs);
    if (pairedLegs.length && schedule.length === pairedLegs.length) {
      const ball = svgEl('ellipse', { rx: 20, ry: 13, fill: '#7a4a24', stroke: '#f4e9dc', 'stroke-width': 3 });
      els.fieldGroup.appendChild(ball);

      // Nathan: "the ball should go to the 1 to start and stay with the 1
      // player until the point is set for handoff." Used to start at the
      // fixed center point and tween straight to the handoff coordinate,
      // skipping the snap-taker entirely. Now rides his own live circle
      // (already being animated by animatePathDraw in revealPromises
      // above, same route-reveal loop -- no second tween needed) until
      // the scheduled exchange, THEN tweens leg-by-leg same as before.
      const snapEntry = state.lastRendered[String(pairedLegs[0].player)];
      const startPos = (snapEntry && snapEntry.circleEl)
        ? { x: parseFloat(snapEntry.circleEl.getAttribute('cx')), y: parseFloat(snapEntry.circleEl.getAttribute('cy')) }
        : { x: align.C[0], y: align.C[1] };
      ball.setAttribute('cx', startPos.x);
      ball.setAttribute('cy', startPos.y);

      (async () => {
        const firstExchangeMs = pairedLegs[1] ? schedule[1].atMs : animMs;
        if (snapEntry && snapEntry.circleEl && firstExchangeMs > 0) {
          await new Promise((resolve) => {
            const start = performance.now();
            function frame(now) {
              const t = (now - start) / firstExchangeMs;
              ball.setAttribute('cx', snapEntry.circleEl.getAttribute('cx'));
              ball.setAttribute('cy', snapEntry.circleEl.getAttribute('cy'));
              if (t < 1 && state.isPlaying) requestAnimationFrame(frame); else resolve();
            }
            requestAnimationFrame(frame);
          });
        }

        let prevPos = (snapEntry && snapEntry.circleEl)
          ? { x: parseFloat(snapEntry.circleEl.getAttribute('cx')), y: parseFloat(snapEntry.circleEl.getAttribute('cy')) }
          : startPos;
        let prevAtMs = firstExchangeMs;
        for (let i = 1; i < pairedLegs.length; i++) {
          const legPos = window.BallPath.legStart(pairedLegs, i, align);
          if (!legPos) continue;
          const atMs = schedule[i].atMs;
          await window.tweenPoint(prevPos, { x: legPos[0], y: legPos[1] }, Math.max(80, atMs - prevAtMs), (pt) => {
            ball.setAttribute('cx', pt.x);
            ball.setAttribute('cy', pt.y);
          });
          prevPos = { x: legPos[0], y: legPos[1] };
          prevAtMs = atMs;
        }
      })();
    }
  }

  await Promise.all(revealPromises);
  state.isPlaying = false;
  if (els.pbPlayBtn) { els.pbPlayBtn.disabled = false; els.pbPlayBtn.textContent = '▶ Play'; }
}

// Reads els.ballPathEditor.ballPath directly (its own live, in-progress
// array) rather than currentVariant().ballPath -- BallPathEditor mutates
// its own array FIRST, then calls render() (which gets here) BEFORE its
// onChange fires to persist that array back onto the variant, so reading
// the variant here would show last-render's sequence, one edit behind.
function renderBallPathPanel() {
  if (!els.ballPathEditor || !state.currentPlay) return;
  els.pbBallPathModeToggle.checked = state.ballPathMode;
  const bp = els.ballPathEditor.ballPath;
  if (!bp.length) {
    els.pbBallPathSeq.innerHTML = '<div style="color:#999">Tap players 1-6 on the field, in order, to build the sequence. Tap the same player again to remove that step, or Clear to start over.</div>';
    return;
  }
  // Nathan: "there is no way to remove a ball path" -- BallPathEditor's
  // own addPlayer() already supports tap-the-last-player-again-to-undo
  // (verified earlier this session), it just had no visible hint or
  // button anywhere, so it wasn't discoverable. Both fixed here: the
  // hint above, and this explicit ✕ on the LAST step specifically (undo
  // only ever removes from the end, matching what addPlayer() itself
  // does -- a middle step can't be removed without also removing
  // everything after it, same as tapping that same player again would).
  const HOW_OPTIONS = Object.keys(window.BallPath.EXCHANGES).filter((k) => k !== 'snap');
  els.pbBallPathSeq.innerHTML = bp.map((leg, i) => {
    const isLast = i === bp.length - 1;
    const removeBtn = `<button type="button" class="ballPathRemoveLast" style="margin-left:auto;border:none;background:none;color:#b00;font-weight:800;cursor:pointer;padding:0 4px" title="Remove this step">✕</button>`;
    if (i === 0) return `<div style="display:flex;align-items:center;padding:3px 0">1. Snap to #${leg.player}${isLast ? removeBtn : ''}</div>`;
    const options = HOW_OPTIONS.map((k) => `<option value="${k}"${leg.how === k ? ' selected' : ''}>${window.BallPath.EXCHANGES[k].label}</option>`).join('');
    return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0">${i + 1}. #${leg.player}
      <select data-leg="${i}" class="ballPathHowSelect">${options}</select>${isLast ? removeBtn : ''}</div>`;
  }).join('');
  const removeLastBtn = els.pbBallPathSeq.querySelector('.ballPathRemoveLast');
  if (removeLastBtn) {
    removeLastBtn.addEventListener('click', () => {
      els.ballPathEditor.addPlayer(bp[bp.length - 1].player); // tap-again-to-undo, same mechanic as the field itself
    });
  }
  els.pbBallPathSeq.querySelectorAll('.ballPathHowSelect').forEach((sel) => {
    sel.addEventListener('change', () => {
      els.ballPathEditor.setHow(Number(sel.dataset.leg), sel.value);
    });
  });
}

// A PENDING id (js/signals.js's own hand-maintained photo-less list)
// whose card has SINCE been photographed and shipped in window.ALL_CARDS
// (e.g. #33 I-FORMATION, once assets/cards/33.png landed) is never
// automatically removed from that list -- window.Signals.load()'s own
// register() already guards its internal byId table against a stale
// PENDING entry overwriting the real one ("must not overwrite the real
// thing"), but that guard only protects Signals.get()/.src() lookups, not
// a deck built by directly concatenating ALL_CARDS with
// PENDING_IDS.map(Signals.get) the way both decks below do -- Signals.
// get(33) still returns the REAL, already-registered card, so the concat
// ends up with the SAME card object twice, back to back. Harmless for
// VALUE (both entries carry id 33), but a real, visibly doubled option/
// tile in anything built from these decks -- confirmed live via the
// Touch card picker (js/coachtools-playbuilder.js) showing two identical
// "I-FORMATION" tiles. Dedupe by id here, once, so neither deck has to
// care which source registers a given id first.
function dedupeCardsById(cards) {
  const seen = new Set();
  return cards.filter((c) => {
    if (!c || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

// The Play Call deck doesn't change during a session, so filtering it is
// cheap to just do fresh here rather than caching -- ports js/edit-plays.js's
// own playCallSignalDeck() unchanged (only the 'Play Call' group is ever a
// play's own identity card). window.ALL_CARDS comes from the real app's
// Firebase boot and is never loaded in this standalone page -- degrades to
// just the photo-less PENDING signals, same fallback the real app already
// has for a card that hasn't been photographed yet.
function playCallSignalDeck() {
  const pending = ((window.Signals && window.Signals.PENDING_IDS) || []).map((id) => window.Signals.get(id));
  return dedupeCardsById((window.ALL_CARDS || []).concat(pending))
    .filter((c) => c && c.group === 'Play Call')
    .sort((a, b) => a.meaning.localeCompare(b.meaning));
}

function populateSignalSelect() {
  const deck = playCallSignalDeck();
  els.pbSignalSelect.innerHTML = '<option value="">(none)</option>' + deck.map((c) => `<option value="${c.id}">${c.meaning} (#${c.id})</option>`).join('');
}

// The FULL deck, every group -- not just 'Play Call'. Nathan: "I should
// have the ability to drop in any card to change how the play reads
// out." Used by formation-editor.js's "Touch card" picker (a formation's
// own identity card is just as likely to be tagged 'Formation' as
// anything else, e.g. card 31/33 -- SPLIT FORMATION/I-FORMATION -- so a
// 'Play Call'-only filter would hide the exact cards this picker exists
// for), shared here rather than duplicated so both decks can never drift
// out of sync with each other or with window.Signals' own registry.
function anySignalDeck() {
  const pending = ((window.Signals && window.Signals.PENDING_IDS) || []).map((id) => window.Signals.get(id));
  return dedupeCardsById((window.ALL_CARDS || []).concat(pending))
    .sort((a, b) => a.meaning.localeCompare(b.meaning));
}

// Boot/Motion default to allowed (unchecked noBoot/noMotion) -- matches
// every play that predates these fields, which show both toggles live.
function syncToggleAvailabilityUI() {
  if (!state.currentPlay || !els.pbAllowBootCheckbox) return;
  els.pbAllowBootCheckbox.checked = !state.currentPlay.noBoot;
  els.pbAllowMotionCheckbox.checked = !state.currentPlay.noMotion;
}

function syncSignalUI() {
  if (!state.currentPlay) return;
  syncToggleAvailabilityUI();
  const id = state.currentPlay.signalCardId;
  els.pbSignalSelect.value = id != null ? String(id) : '';
  // Signals.src(id) (NOT .get(id).src -- the raw registered card only has
  // .img, and only when a photo's actually been taken) already handles the
  // un-photographed case with a real placeholder image, same fallback the
  // rest of the app gets -- no need to duplicate that logic here.
  if (id != null && window.Signals) {
    els.pbSignalPreviewImg.src = window.Signals.src(id);
    els.pbSignalPreviewImg.style.display = '';
  } else {
    els.pbSignalPreviewImg.style.display = 'none';
  }
  renderSignalSequencePreview();
}

// The FULL flip-side sequence a coach would actually flash, not just this
// play's own identity card -- Nathan: "you can't just choose one signal,
// it should be the sequence of signals for the new play."
//
// Runs the REAL js/signals.js RECIPES engine (RECIPES[formation.id], or
// play.signalRecipe when a play names its own) whenever one exists --
// js/signals.js's own runRecipePreview, not a second, hand-rolled
// approximation of its shape. This is a correction, not the original
// design: an earlier version of this function built a generic touch/side/
// play/direction sequence with any active alignment toggle tacked on at
// the end as a plain status line, reasonable back when no real "i" recipe
// existed yet. Once RECIPES.i landed, that generic shape went actively
// WRONG for it -- Nathan, looking at this exact preview: "this is wrong.
// I formation with Non-Heavy should be: I > Wing (signal 7 or 8) > Left
// (direction) > Dive > Right (direction)" -- the real recipe's explicit,
// conditional "Wing" card (RECIPES.i's own 2nd step) is what actually
// communicates Heavy's state; a trailing "Heavy: Off" status line is
// redundant with it, not a substitute. Delegating to the same recipe the
// real app runs means this preview can never drift from it again, the
// same reasoning as every other "single source of truth" fix this session
// (Pop Pass's own original drift problem, generalized).
//
// ctx is built from LIVE, possibly-unsaved editor state (not a
// DATA.playTypes lookup -- window.buildSignalSequence itself can't be
// called here for exactly that reason: an in-progress draft, or an edit
// to an already-saved play, isn't reflected in DATA.playTypes until the
// next full page boot). runRecipePreview (not runRecipe) is used
// specifically so an unset play card still renders as a visible "no card
// set" row instead of silently vanishing -- correct for an app coach
// actively flashing calls, wrong for a coach still building the play and
// wondering where the card went.
//
// Falls back to the old generic shape only for a formation with no
// dedicated recipe at all (RECIPES has no entry for its id) -- so a
// brand-new custom formation, built before a recipe is authored for it,
// still shows a reasonable approximation instead of nothing.
function buildSignalSequencePreview() {
  if (!window.Signals || !state.currentPlay) return [];
  const formation = currentFormation();
  const play = state.currentPlay;
  const recipeName = play.signalRecipe || formation.id;
  const recipe = window.Signals.RECIPES && window.Signals.RECIPES[recipeName];
  if (recipe) {
    const cap = (s) => (s === 'left' ? 'Left' : 'Right');
    const ctx = {
      wingSide: cap(state.wingSide),
      direction: cap(state.direction),
      playKey: play.id,
      playSignalId: play.signalCardId != null ? play.signalCardId : null,
      // The real app's own playSignalLabelFor (js/play-calls.js) shows the
      // CARD's own meaning (playType.signalLabel, e.g. "Inside Zone"), not
      // the play's own name/id-label ("Dive") -- matching that exactly so
      // this preview shows the actual word a coach will say, not a
      // different one. Falls back to the play's own label only when no
      // signal card has been picked yet, so the placeholder row still
      // reads as something recognizable rather than blank.
      playSignalLabel: play.signalLabel || play.label,
      alignmentValues: Object.assign({}, state.alignmentPreview),
    };
    return window.Signals.runRecipePreview(recipe, ctx);
  }
  if (!window.randomFingerId) return [];
  const steps = [];
  const touchId = formation.touchCardId != null
    ? formation.touchCardId
    : (window.Signals.TOUCH_CARD_BY_FORMATION && window.Signals.TOUCH_CARD_BY_FORMATION[formation.id]);
  steps.push({ label: `${formation.label} touch`, src: touchId != null ? window.Signals.src(touchId) : null });
  const sideFingerId = window.randomFingerId(state.wingSide);
  steps.push({ label: `${formation.label}: ${state.wingSide}`, src: window.Signals.src(sideFingerId) });
  steps.push({ label: play.signalLabel || play.label, src: play.signalCardId != null ? window.Signals.src(play.signalCardId) : null });
  const dirFingerId = window.randomFingerId(state.direction, sideFingerId);
  steps.push({ label: `Direction: ${state.direction}`, src: window.Signals.src(dirFingerId) });
  (formation.alignmentToggles || []).forEach((toggle) => {
    const value = state.alignmentPreview[toggle.id] || toggle.values[0].id;
    if (value === toggle.values[0].id) return; // only the ACTIVE (non-default) toggles get their own card, same as Boot/Counter only appearing when on
    const valueLabel = (toggle.values.find((v) => v.id === value) || {}).label || value;
    steps.push({ label: `${toggle.label}: ${valueLabel}` });
  });
  return steps;
}

function renderSignalSequencePreview() {
  if (!els.pbSignalSequence) return;
  const steps = buildSignalSequencePreview();
  els.pbSignalSequence.innerHTML = steps.map((s, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:3px 0">
      <span style="font-size:11px;color:var(--muted);width:14px">${i + 1}.</span>
      ${s.src
        ? `<img src="${s.src}" style="width:30px;height:37px;object-fit:cover;border-radius:4px;border:1px solid var(--line);background:#fff">`
        : `<span style="width:30px;height:37px;border-radius:4px;border:1px dashed var(--line);display:flex;align-items:center;justify-content:center;font-size:8px;color:var(--muted);text-align:center;line-height:1.1">no card set</span>`}
      <span style="font-size:12px">${s.label}</span>
    </div>`).join('');
}

function populateVariantSelect() {
  els.pbVariantSelect.innerHTML = state.currentPlay.variants.map((v, i) => `<option value="${i}">${v.label}</option>`).join('');
  els.pbVariantSelect.value = String(state.currentVariantIndex);
}

function bindSidebar() {
  els.pbHasBallCheckbox.addEventListener('change', () => {
    assignmentFor(state.selectedPlayer).hasBall = els.pbHasBallCheckbox.checked;
  });
  els.pbDelayInput.addEventListener('input', () => {
    assignmentFor(state.selectedPlayer).delayMs = Number(els.pbDelayInput.value) || 0;
  });
  els.pbEndTypeSelect.addEventListener('change', () => {
    assignmentFor(state.selectedPlayer).endType = els.pbEndTypeSelect.value;
    render();
  });
  els.pbWingRouteToggle.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      state.wingRouteSide = b.dataset.value;
      state.selectedPointIndex = null;
      render();
    });
  });

  els.pbWingSideToggle.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      state.wingSide = b.dataset.value;
      state.selectedPointIndex = null;
      render();
    });
  });
  els.pbDirectionToggle.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      state.direction = b.dataset.value;
      state.selectedPointIndex = null;
      render();
    });
  });

  els.pbSaveBtn.addEventListener('click', async () => {
    els.pbSaveBtn.textContent = 'Saving…';
    // Nathan: "That is what I originally wanted for the What's New section
    // which would show any new plays you create." Checked BEFORE saving --
    // state.plays is this screen's own already-loaded list, so "not in it
    // yet" means this is this play's first-ever save, the same "brand-new
    // plays always announce themselves" rule edit-plays.js's own Duplicate
    // flow already established (js/whats-new.js's logNewPlayToWhatsNew).
    const isNewPlay = !state.plays.some((p) => p.id === state.currentPlay.id);
    try {
      await window.PlayBuilderStore.savePlay(state.currentPlay);
      await ensureCuratedForFormation(state.currentPlay);
      // Real, separate gap found alongside this: this local list never
      // added a play this screen's OWN Save button just created (only
      // onPlaySaved(), called by OTHER screens, ever did) -- so a second
      // save of the same brand-new play, later in the same session, would
      // have logged to What's New again. Fixed the same way onPlaySaved()
      // already dedups.
      const i = state.plays.findIndex((p) => p.id === state.currentPlay.id);
      if (i === -1) state.plays.push(state.currentPlay); else state.plays[i] = state.currentPlay;
      if (isNewPlay && window.logNewPlayToWhatsNew) window.logNewPlayToWhatsNew(state.currentPlay.id, state.currentPlay.label);
      els.pbSaveBtn.textContent = 'Saved!';
    } catch (err) {
      els.pbSaveBtn.textContent = 'Save failed';
      console.error(err);
      alert(err.message);
    }
    setTimeout(() => { els.pbSaveBtn.textContent = 'Save Play'; }, 1800);
  });

  els.pbDeletePlayBtn.addEventListener('click', async () => {
    const play = state.currentPlay;
    if (!play) { els.statusEl.textContent = 'No play selected.'; return; }
    if (!confirm(`Remove "${play.label}"? This can't be undone.`)) return;

    els.pbDeletePlayBtn.textContent = 'Removing…';
    try {
      await window.PlayBuilderStore.deletePlay(play.id);
      state.plays = state.plays.filter((p) => p.id !== play.id);
      state.currentPlay = state.plays[0] || null;
      state.currentVariantIndex = 0;
      state.selectedPlayer = null;
      populatePlaySelect();
      render();
      els.pbDeletePlayBtn.textContent = 'Removed!';
      els.statusEl.textContent = `Removed "${play.label}".`;
    } catch (err) {
      els.pbDeletePlayBtn.textContent = 'Remove failed';
      console.error(err);
      alert(err.message);
    }
    setTimeout(() => { els.pbDeletePlayBtn.textContent = 'Remove Play'; }, 1800);
  });

  if (els.pbPlayBtn) {
    if (!window.animatePathDraw) els.pbPlayBtn.style.display = 'none'; // js/play-calls.js not loaded (standalone page)
    els.pbPlayBtn.addEventListener('click', () => { playPreview(); });
  }

  els.pbNewPlayBtn.addEventListener('click', () => {
    // Nathan, live, trying to start "5 Guys"' very first play: "when I
    // try to add a new play, I can't choose 5 guys as the formation, it
    // starts to add to I formation instead." Real gap, not just the
    // earlier stale-label bug: this always derived formationId from
    // whichever play was CURRENTLY loaded (fixed once already, from
    // state.formations[0] to this, but that only helps when the coach
    // happens to already have the right formation's OWN play open --
    // impossible for a formation with zero plays yet, exactly "5 Guys"'
    // situation). The Formation select itself stays deliberately disabled
    // (still true -- reassigning an EXISTING play's formation here would
    // desync its routes from the anchors they're actually drawn against;
    // "Copy a play from another formation" is still the only correct way
    // to do that). A brand-NEW, not-yet-drawn play has no such routes to
    // protect, so it's the one case where asking directly is safe and
    // actually necessary. Numbered list (not typed formation names) so a
    // typo or a formation renamed since can't silently pick the wrong
    // one -- same reasoning "Copy a play"'s own prompts already lean on
    // (a pre-filled default, not free-form matching).
    const currentFormationId = state.currentPlay ? state.currentPlay.formationId : state.formations[0]?.id;
    const defaultIdx = Math.max(0, state.formations.findIndex((f) => f.id === currentFormationId));
    const formationList = state.formations.map((f, i) => `${i + 1}. ${f.label}`).join('\n');
    const formationAnswer = prompt(`Which formation is this play for?\n${formationList}`, String(defaultIdx + 1));
    if (!formationAnswer) return;
    const formationIdx = parseInt(formationAnswer, 10) - 1;
    const chosenFormation = state.formations[formationIdx];
    if (!chosenFormation) { alert('Not a valid formation number -- try again.'); return; }
    const formationId = chosenFormation.id;

    const id = prompt('New play key (lowercase, underscores, e.g. "trap_left"):');
    if (!id) return;
    const label = prompt('Display label (e.g. "Trap"):') || id;
    const draft = newPlayDraft(formationId, window.PlayBuilderSeeds.viewBox, window.PlayBuilderSeeds.topPad);
    draft.id = id;
    draft.label = label;
    state.currentPlay = draft;
    state.currentVariantIndex = 0;
    state.selectedPlayer = null;
    state.ballPathMode = false;
    populatePlaySelect();
    populateVariantSelect();
    els.ballPathEditor.set(effectiveBallPath(currentVariant())); // triggers render() via renderPlay
  });

  els.pbPlaySelect.addEventListener('change', () => {
    const play = state.plays.find((p) => p.id === els.pbPlaySelect.value);
    if (!play) return;
    state.currentPlay = play;
    state.currentVariantIndex = 0;
    state.selectedPlayer = null;
    state.ballPathMode = false;
    populateVariantSelect();
    els.ballPathEditor.set(effectiveBallPath(currentVariant())); // triggers render() via renderPlay
  });

  // NAVIGATES to a different formation's plays -- never reassigns the
  // CURRENT play's own formationId. It used to: picking a different
  // formation here just reassigned formationId in place, with NO shift of
  // any player's route data -- since a route is authored in ITS
  // formation's own coordinate space, every position pointed at whatever
  // the new formation happened to have at that same slot id, detached
  // from the actual player dot at best (real, saved data corruption), or
  // an uncaught mirror.js error at worst. Confirmed live -- fixed by
  // disabling the field outright. Nathan, later: "when I go into Play
  // Design, it is locked on a single play and doesn't allow me to change
  // the formation" -- the Play dropdown already lists every real play
  // across every formation, but nothing said so, and a coach reasonably
  // expects the Formation field itself to be what switches formations.
  // Re-enabled as a genuinely different, safe operation: loads that
  // formation's own first real play, or starts a fresh, unsaved draft for
  // it if it has none yet (same mechanism "+ New Play" already uses,
  // e.g. Wing/Split, whose real plays still live in the older
  // shipped-defaults system, not Play Builder V2's own store) -- the
  // CURRENT play's data is never touched either way. Moving a play
  // BETWEEN formations still only has one correct mechanism -- the
  // Formations screen's own "Copy a play from another formation" (js/
  // playbuilder/copy-across-formations.js), which shifts every point by
  // its owner's actual anchor delta instead of reusing raw old
  // coordinates.
  els.pbFormationSelect.addEventListener('change', () => {
    const formationId = els.pbFormationSelect.value;
    const existing = state.plays.find((p) => p.formationId === formationId);
    state.currentPlay = existing || newPlayDraft(formationId, window.PlayBuilderSeeds.viewBox, window.PlayBuilderSeeds.topPad);
    state.currentVariantIndex = 0;
    state.selectedPlayer = null;
    state.ballPathMode = false;
    populatePlaySelect();
    populateVariantSelect();
    els.ballPathEditor.set(effectiveBallPath(currentVariant())); // triggers render() via renderPlay
  });

  els.pbVariantSelect.addEventListener('change', () => {
    state.currentVariantIndex = Number(els.pbVariantSelect.value);
    state.selectedPlayer = null;
    state.selectedPointIndex = null;
    els.ballPathEditor.set(effectiveBallPath(currentVariant())); // triggers render() via renderPlay
  });

  els.pbNewVariantBtn.addEventListener('click', () => {
    const id = prompt('New variant key (lowercase, underscores, e.g. "counter"):');
    if (!id) return;
    if (state.currentPlay.variants.find((v) => v.id === id)) { alert('A variant with that key already exists.'); return; }
    const label = prompt('Display label (e.g. "Counter"):') || id;

    // Which live toggle (if any) reveals this variant to a coach studying
    // plays -- schema.js's own Play.legacyDimension/PlayVariant.legacyKey
    // doc. A play can only have ONE such toggle (matches the old system's
    // own one-extra-dimension-per-play reality) -- picking one here
    // replaces whatever the play had before. Blank/unrecognized answer
    // means "just my own draft/comparison variant," same as every variant
    // already worked before this existed: fully authorable, just not
    // reachable via a live toggle yet.
    const choice = (prompt(
      'Should a toggle reveal this variant on the real card, once this formation is live?\n\n' +
      '(Leave blank for no -- just your own draft/comparison variant.)\n\n' +
      'Type one: read = Read A/B, counter = Counter, inout = Inside/Outside, pop = Pop Variant'
    ) || '').trim().toLowerCase();
    const DIMENSION_MAP = {
      read: { dimension: 'readToggle', legacyKey: 'B' },
      counter: { dimension: 'counter', legacyKey: 'Counter' },
      inout: { dimension: 'insideOutside', legacyKey: 'Inside' },
      pop: { dimension: 'popVariant', legacyKey: 'Pop2' },
    };
    const picked = DIMENSION_MAP[choice];

    // Starts EMPTY -- schema.js's PlayVariant doc: "only players who
    // differ from the base variant need an entry." A brand-new variant IS
    // identical to Base until the coach changes something -- render()'s
    // effectivePlayers()/effectiveBallPath() already resolve that
    // correctly with zero entries, so there's nothing to pre-fill.
    const variant = { id, label, players: [], ballPath: [] };
    if (picked) {
      state.currentPlay.legacyDimension = picked.dimension;
      variant.legacyKey = picked.legacyKey;
    }
    state.currentPlay.variants.push(variant);
    state.currentVariantIndex = state.currentPlay.variants.length - 1;
    state.selectedPlayer = null;
    state.selectedPointIndex = null;
    populateVariantSelect();
    els.ballPathEditor.set(effectiveBallPath(currentVariant())); // triggers render() via renderPlay
  });

  els.pbAllowBootCheckbox.addEventListener('change', () => {
    if (els.pbAllowBootCheckbox.checked) delete state.currentPlay.noBoot;
    else state.currentPlay.noBoot = true;
  });
  els.pbAllowMotionCheckbox.addEventListener('change', () => {
    if (els.pbAllowMotionCheckbox.checked) delete state.currentPlay.noMotion;
    else state.currentPlay.noMotion = true;
  });

  els.pbSignalSelect.addEventListener('change', () => {
    const id = els.pbSignalSelect.value ? Number(els.pbSignalSelect.value) : null;
    if (id == null) {
      delete state.currentPlay.signalCardId;
      delete state.currentPlay.signalLabel;
    } else {
      const card = window.Signals && window.Signals.get(id);
      state.currentPlay.signalCardId = id;
      state.currentPlay.signalLabel = card ? card.meaning : undefined;
    }
    syncSignalUI();
  });
  els.pbSignalResetBtn.addEventListener('click', () => {
    delete state.currentPlay.signalCardId;
    delete state.currentPlay.signalLabel;
    syncSignalUI();
  });

  els.pbBallPathModeToggle.addEventListener('change', () => {
    state.ballPathMode = els.pbBallPathModeToggle.checked;
    if (state.ballPathMode) {
      state.selectedPlayer = null;
      state.selectedPointIndex = null;
    }
    render();
  });
  els.pbBallPathClearBtn.addEventListener('click', () => {
    els.ballPathEditor.clear(); // triggers render() via renderPlay
  });
}

function populatePlaySelect() {
  els.pbPlaySelect.innerHTML = state.plays.map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
  if (state.currentPlay) els.pbPlaySelect.value = state.currentPlay.id;
}
function populateFormationSelect() {
  els.pbFormationSelect.innerHTML = state.formations.map((f) => `<option value="${f.id}">${f.label}</option>`).join('');
}

async function init() {
  els.svg = q('pbField');
  els.pbFieldTitle = q('pbFieldTitle');
  els.pbPlayerPanel = q('pbPlayerPanel');
  els.pbPlayerLabel = q('pbPlayerLabel');
  els.pbHasBallCheckbox = q('pbHasBallCheckbox');
  els.pbDelayInput = q('pbDelayInput');
  els.pbEndTypeSelect = q('pbEndTypeSelect');
  els.pbWingRouteToggle = q('pbWingRouteToggle');
  els.pbWingSideToggle = q('pbWingSideToggle');
  els.pbDirectionToggle = q('pbDirectionToggle');
  els.pbPreviewLockNote = q('pbPreviewLockNote');
  els.pbAlignmentEditToggle = q('pbAlignmentEditToggle');
  els.pbDirectionEditToggle = q('pbDirectionEditToggle');
  els.pbAlignmentPreviewToggles = q('pbAlignmentPreviewToggles');
  els.pbSaveBtn = q('pbSaveBtn');
  els.pbDeletePlayBtn = q('pbDeletePlayBtn');
  els.pbPlayBtn = q('pbPlayBtn');
  els.pbNewPlayBtn = q('pbNewPlayBtn');
  els.pbPlaySelect = q('pbPlaySelect');
  els.pbFormationSelect = q('pbFormationSelect');
  // A real, functional switcher -- see its own 'change' listener below for
  // why it's safe (navigates, never reassigns the current play's data).
  els.pbVariantSelect = q('pbVariantSelect');
  els.pbNewVariantBtn = q('pbNewVariantBtn');
  els.pbAllowBootCheckbox = q('pbAllowBootCheckbox');
  els.pbAllowMotionCheckbox = q('pbAllowMotionCheckbox');
  els.pbSignalSelect = q('pbSignalSelect');
  els.pbSignalPreviewImg = q('pbSignalPreviewImg');
  els.pbSignalResetBtn = q('pbSignalResetBtn');
  els.pbSignalSequence = q('pbSignalSequence');
  els.pbBallPathModeToggle = q('pbBallPathModeToggle');
  els.pbBallPathSeq = q('pbBallPathSeq');
  els.pbBallPathClearBtn = q('pbBallPathClearBtn');
  els.statusEl = q('pbStatus');

  // Reuses js/ball-path-editor.js's BallPathEditor completely unmodified --
  // renderPlay: render wires it into the SAME "coordinator re-renders,
  // then reattaches drag handles" pattern js/coachtools-createplay.js's
  // own renderDiagram() already proves out for the real app; onChange
  // just persists its live array back onto the current variant, matching
  // how every other edit in this file mutates state.currentPlay directly.
  els.ballPathEditor = new window.BallPathEditor({
    svg: els.svg,
    renderPlay: render,
    onChange: () => { currentVariant().ballPath = els.ballPathEditor.get(); },
  });

  initEvents();
  bindSidebar();
  // Signals.get()/.src() read from an internal table that starts EMPTY
  // and stays that way until something calls load() -- in the real app
  // that's index.html's own boot, once window.ALL_CARDS has arrived from
  // Firebase. This standalone page never fetches ALL_CARDS (no login
  // here), so load() gets called with whatever's there (nothing, today) --
  // without this, Signals.get() would return null even for the PENDING_IDS
  // signals playCallSignalDeck() means to include, filtering the whole
  // deck down to empty regardless of what's actually pending.
  if (window.Signals) window.Signals.load(window.ALL_CARDS || []);
  populateSignalSelect();

  els.statusEl.textContent = 'Loading…';
  if (await window.PlayBuilderStore.isEmpty()) {
    els.statusEl.textContent = 'First run -- seeding starter formations…';
    await window.PlayBuilderStore.seedFromDefaults();
  }
  const data = await window.PlayBuilderStore.loadAll();
  state.formations = data.formations;
  state.defenseLooks = data.defenseLooks;
  state.plays = data.plays;

  // Real, already-live custom formations (I, I Wing, and any future one),
  // built through the old, now-unlinked Formation Builder -- surfaced here
  // as importable seed sources so "+ New Formation" can start from their
  // REAL geometry instead of a coach redrawing all 11 players from
  // scratch. Purely additive stubs, never a live link: importing one means
  // seeding the drag canvas from it, then a real, independent Save Formation
  // (js/playbuilder/formation-editor.js's fbSaveBtn handler) -- from that
  // point on Play Builder V2 has its own copy and never reads
  // window.Formations for this id again. Excluded once a real save under
  // that id has actually landed in THIS store (state.formations already
  // has it) -- checked fresh here since this only runs once, at boot.
  if (window.Formations) {
    const existingIds = new Set(state.formations.map((f) => f.id));
    window.Formations.list().forEach((f) => {
      if (f.id === 'wing' || f.id === 'split') return; // already Shotgun/Split, natively
      if (existingIds.has(f.id)) return;
      const posMap = window.Formations.positions(f.id, 'Right') || {};
      const positions = Object.keys(posMap).map((key) => ({
        id: /^\d+$/.test(key) ? Number(key) : key,
        label: key,
        x: posMap[key][0],
        y: posMap[key][1],
      }));
      if (!positions.length) return;
      state.formations.push({
        id: f.id,
        label: (f.name || f.label || f.id) + ' (import)',
        type: 'custom',
        positions,
        // #4 defaults to an independent wing-style L/R toggle -- true for
        // every real custom formation built so far (I and I Wing both
        // move #4 by side), and a coach can change it after seeding if a
        // future import needs something else.
        wingPositionIds: [4],
        legacyImport: true,
      });
    });
  }

  populateFormationSelect();
  populatePlaySelect();

  // Notify the Formations screen (js/playbuilder/formation-editor.js) once
  // data's loaded, rather than having it independently re-fetch the same
  // store -- one owner for loading, one shared state.formations array both
  // screens read/update. Guarded since that script may not always be
  // present (e.g. a future stripped-down embed).
  if (window.PlayBuilderFormationEditor) {
    window.PlayBuilderFormationEditor.onDataLoaded({ viewBox: data.viewBox, topPad: data.topPad });
  }

  // Set by the real, coach-facing Play tab's own "Modify" -> "+" tile
  // (js/play-calls.js's renderFormationPlays) right before it navigates
  // here via window.openCoachToolsTab('playbuilder') -- a coach browsing
  // a formation's plays and tapping + should land directly on a fresh,
  // already-correctly-formationed draft, not have to separately find and
  // re-pick that same formation a second time. Consumed once so a later
  // reload of this screen doesn't keep re-triggering it.
  const pendingFormationId = window.__pbPendingNewPlayFormationId;
  window.__pbPendingNewPlayFormationId = null;
  const pendingFormation = pendingFormationId && state.formations.find((f) => f.id === pendingFormationId);

  // Same handoff, for "+ Add a play" -> "copy an existing play" (rather
  // than "start blank"): js/playbuilder/legacy-import.js's import already
  // saved a brand-new, real Play to the store before navigating here, so
  // this just needs to select it -- not build another draft on top of it.
  const pendingPlayId = window.__pbPendingLoadPlayId;
  window.__pbPendingLoadPlayId = null;
  const pendingPlay = pendingPlayId && state.plays.find((p) => p.id === pendingPlayId);

  if (pendingPlay) {
    state.currentPlay = pendingPlay;
  } else if (pendingFormation) {
    state.currentPlay = newPlayDraft(pendingFormation.id, data.viewBox, data.topPad);
  } else if (state.plays.length) {
    state.currentPlay = state.plays[0];
  } else {
    state.currentPlay = newPlayDraft(state.formations[0]?.id, data.viewBox, data.topPad);
  }
  populateVariantSelect();
  els.statusEl.textContent = '';
  els.ballPathEditor.set(effectiveBallPath(currentVariant())); // triggers render() via renderPlay
}

// Exposed explicitly rather than only self-booting on DOMContentLoaded --
// js/coachtools-playbuilder.js (the real app) injects this screen's
// markup lazily, on first tab activation, same "built by that script at
// init time" pattern every other Coach Tools panel already uses, so the
// pbField/etc. elements don't exist yet at the real app's own
// DOMContentLoaded. playbuilder.html's markup, by contrast, is already
// fully present in the page source by the time this script (the last one
// on the page) runs, so it can safely still self-boot immediately.
window.initPlayBuilderEditor = function () {
  init().catch((err) => {
    console.error(err);
    q('pbStatus').textContent = `Failed to load: ${err.message}`;
  });
};
if (document.getElementById('pbField')) window.initPlayBuilderEditor();

// Two-way hook back from the Formations screen (formation-editor.js): a
// newly saved/edited formation needs to show up in THIS screen's own
// formation picker immediately, without a full reload.
window.PlayBuilderEditor = {
  onFormationSaved(formation) {
    const i = state.formations.findIndex((f) => f.id === formation.id);
    if (i === -1) state.formations.push(formation);
    else state.formations[i] = formation;
    populateFormationSelect();
    if (state.currentPlay && els.pbFormationSelect) els.pbFormationSelect.value = state.currentPlay.formationId;
  },
  // Same idea, for a play saved (or copied to a new formation) from the
  // Formations screen -- keeps this screen's own play picker current
  // without a full reload.
  onPlaySaved(play) {
    const i = state.plays.findIndex((p) => p.id === play.id);
    if (i === -1) state.plays.push(play);
    else state.plays[i] = play;
    populatePlaySelect();
  },
  // Same idea, the removal direction -- formation-editor.js's "Remove
  // Formation" action already filtered state.formations/state.plays
  // itself (a shared array reference, see the block comment below); this
  // just re-renders THIS screen's own dropdowns and clears a stale
  // selection so it doesn't keep pointing at a play/formation that's gone.
  onFormationRemoved() {
    populateFormationSelect();
    if (state.currentPlay && !state.formations.find((f) => f.id === state.currentPlay.formationId)) {
      state.currentPlay = state.plays[0] || null;
      state.currentVariantIndex = 0;
      state.selectedPlayer = null;
      populatePlaySelect();
      render();
    }
  },
  // Deliberate cross-file sharing (NOT a public API for anything else to
  // depend on) -- js/playbuilder/formation-editor.js aliases these into
  // its own local consts once, at load time, exactly like it would if
  // both files were still one shared classic-script scope. state's own
  // identity never changes (only its properties do), and
  // render/populatePlaySelect/svgEl/drawCircle are stable function
  // objects for the module's lifetime, so a one-time reference like this
  // stays correct permanently -- no live sync mechanism needed. Exists
  // ONLY because both files are now IIFE-wrapped (js/edit-plays.js and
  // js/play-calls.js already declare their OWN top-level render/svgEl/
  // etc. -- letting these leak into the shared real-app global scope
  // would silently overwrite those, not just risk a naming clash).
  state,
  render,
  populatePlaySelect,
  anySignalDeck,
  svgEl,
  drawCircle,
};

})();

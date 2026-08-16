// Play/formation data now lives in data/plays.json, fetched by the loader in
// index.html before any of these scripts run -- same timing as the old
// inline `let DATA = {...}` blob. Declared here at top level (not inside the
// IIFE below) because edit-plays.js also reads this same DATA variable.
let DATA = window.DATA;

// Snapshot of the code-owned, behavioral flags shipped in data/plays.json
// (noBoot, hasReadToggle, hasInsideOutside), keyed by play key, captured
// right now -- before any Firebase cloud data has a chance to replace
// DATA.playTypes. "Save to Cloud" (edit-plays.js) writes the coach's
// *entire* DATA.playTypes array as one big snapshot, not just the point
// edits they made -- so if that snapshot was saved before a flag like
// noBoot existed in the code, the cloud copy permanently lacks it, and
// every future page load silently loses that flag for every player,
// forever, until someone re-saves from a browser with the newer code
// loaded. These three flags describe how the UI should behave for a given
// play, not coach-authored point positions, so they should always come
// from the shipped file, never from a stale cloud snapshot. Applied in
// normalizePlayData() below, which both Play Calls and Edit Plays already
// run on any cloud data before using it.
const SHIPPED_PLAY_FLAGS = {};
(window.DATA.playTypes || []).forEach(pt => {
  SHIPPED_PLAY_FLAGS[pt.key] = {
    noBoot: !!pt.noBoot,
    hasReadToggle: !!pt.hasReadToggle,
    hasInsideOutside: !!pt.hasInsideOutside,
    directionFixed: !!pt.directionFixed,
  };
});

// Same "cloud always wins" problem, one level up: a coach's "Save to Cloud"
// snapshot (edit-plays.js) writes the *entire* DATA.playTypes array it has
// loaded at that moment, wholesale. If a whole new play (like Sweep) ships
// in the code after that snapshot was saved -- or a play that used to only
// exist as cloud data (Sweep's original situation) isn't present in a given
// cloud snapshot for any other reason -- the cloud array simply doesn't have
// an entry for it at all, and normalizePlayData's per-play repairs below
// have nothing to repair: there's no play object there to fix. Without this,
// every browser that successfully loads real cloud data would silently lose
// any play the shipped file has that the cloud snapshot doesn't, forever,
// the same way Sweep itself first went missing. Snapshotted once, right now,
// before cloud data ever gets a chance to replace DATA.playTypes.
const SHIPPED_PLAY_TYPES_BY_KEY = {};
(window.DATA.playTypes || []).forEach(pt => {
  SHIPPED_PLAY_TYPES_BY_KEY[pt.key] = pt;
});

// The Option play's Direction Left/Right were themselves swapped for a
// while (Left's ball path actually ran right) -- fixed by swapping the
// direction-carrying paths (players 1/2/3 and the dashed option-read line)
// between the two direction blocks. Like every other fix on this page,
// that's invisible to anyone loading a Firebase snapshot saved before the
// fix, since Firebase always wins over the shipped file. Unlike the other
// fixes, there's no missing flag to graft in -- the OLD data is just as
// "complete" as the new data, only mislabeled -- so this repairs it by
// swapping the direction-carrying paths back into the correct slot,
// in place, the same way the original data fix did. This preserves
// whatever a coach has since edited on either side; it only fixes which
// direction key that content lives under.
function repairStaleDirectionOrientation(pt) {
  if (!pt.directions || !pt.directions.Left || !pt.directions.Right) return;
  const isDirectionPath = (p) => p.player === 1 || p.player === 2 || p.player === 3 || p.optionLine;
  const leftMatches = (pt.directions.Left.paths || []).filter(isDirectionPath);
  const rightMatches = (pt.directions.Right.paths || []).filter(isDirectionPath);
  leftMatches.forEach(lp => {
    const key = lp.player != null ? lp.player : 'optionLine';
    const rp = rightMatches.find(r => (r.player != null ? r.player : 'optionLine') === key);
    if (!rp) return;
    const tmp = lp.points;
    lp.points = rp.points;
    rp.points = tmp;
  });
}

// Same problem, one level deeper: a path can gain a brand-new BLOCKING
// CAPABILITY (like the Option play's playside TE splitting into a same-
// side/cross-side target instead of always blocking the backside DE) --
// not just an authored point tweak. A cloud snapshot saved before that
// capability existed has the path WITHOUT the dualSideBlock flag at all,
// so it'd silently keep the old fixed behavior forever. Snapshot every
// currently-shipped dualSideBlock path, keyed by playKey|direction|player,
// so normalizePlayData() can graft the capability (flag + its two target
// options) onto a matching cloud path that's missing it -- but only if
// that cloud path doesn't already have its own dualSideBlock data, so a
// coach's own post-upgrade re-aim of these targets is never overwritten.
const SHIPPED_DUAL_SIDE_BLOCKS = {};
(window.DATA.playTypes || []).forEach(pt => {
  Object.entries(pt.directions || {}).forEach(([dirKey, dirVal]) => {
    const variants = dirVal.paths ? [dirVal] : Object.values(dirVal);
    variants.forEach(variant => {
      (variant && variant.paths || []).forEach(p => {
        if (!p.dualSideBlock) return;
        SHIPPED_DUAL_SIDE_BLOCKS[`${pt.key}|${dirKey}|${p.player}`] = {
          dualSideBlock: true,
          sameSidePoints: p.sameSidePoints,
          crossPoints: p.crossPoints,
          sameSidePoints4x4: p.sameSidePoints4x4,
          crossPoints4x4: p.crossPoints4x4,
        };
      });
    });
  });
});

// Firebase's database deletes any field whose value is `null` when you save
// it (that's how you delete a field via their API) -- so a path object
// authored as `{player: null, id: 'LT', ...}` round-trips through a cloud
// save as `{id: 'LT', ...}` with no `player` key at all. Several places in
// play-calls.js/edit-plays.js specifically check `p.player === null` (vs.
// looking it up by `p.id`) to tell an O-line blocker apart from a numbered
// player -- `undefined !== null`, so those checks silently failed for any
// play loaded from a cloud save, which is what broke the O-line's circles
// from tracking their block lines during playback (arrows for players 1-6
// were unaffected since their `player` field is a real number, never null).
// Called right after fetching playEdits.json, before it's assigned to
// DATA.playTypes, so loaded data behaves identically to the built-in JSON.
function normalizePlayData(playTypes) {
  playTypes = playTypes || [];
  // Graft in any shipped play that's entirely missing from this cloud
  // snapshot (see SHIPPED_PLAY_TYPES_BY_KEY above) BEFORE the per-play
  // repairs below run, so a newly-grafted play gets every other repair
  // (signal card id, readKeyId default, dualSideBlock, etc.) applied to it
  // exactly like any other play -- additive only, and only for keys the
  // cloud data doesn't already have, so a coach's own edits (including a
  // coach's own from-scratch version of that play) are never touched.
  const presentKeys = new Set(playTypes.map(pt => pt.key));
  Object.keys(SHIPPED_PLAY_TYPES_BY_KEY).forEach(key => {
    if (!presentKeys.has(key)) {
      playTypes.push(JSON.parse(JSON.stringify(SHIPPED_PLAY_TYPES_BY_KEY[key])));
    }
  });
  playTypes.forEach(pt => {
    // Same "Firebase always wins" problem, this time for which signal card
    // a play's flip side shows -- Nathan: "Sweep play shows Double blast as
    // the signal on the flipped card. needs to correctly use signal #17
    // (sweep)." PLAY_TYPE_SIGNAL_ID is the canonical, code-owned mapping
    // (below), but a play's own signalCardId field, if a coach's saved
    // snapshot happens to carry one (e.g. authored by copy/pasting from a
    // similar play, or from before this play existed in PLAY_TYPE_SIGNAL_ID
    // at all), takes priority over that map wherever it's read -- so a
    // stale/wrong value baked into an old cloud snapshot sticks around
    // forever otherwise, same as every other "cloud always wins" bug on
    // this page. Only overrides plays the map actually knows about --
    // 'boot' has no map entry precisely because it NEEDS its own
    // signalCardId (26) to work at all, so that one's left alone.
    if (PLAY_TYPE_SIGNAL_ID[pt.key] !== undefined) pt.signalCardId = PLAY_TYPE_SIGNAL_ID[pt.key];
    // Force the behavioral flags back to whatever's actually shipped in
    // code, regardless of what this particular cloud snapshot has (or is
    // missing) for them -- see SHIPPED_PLAY_FLAGS above for why.
    const shippedFlags = SHIPPED_PLAY_FLAGS[pt.key];
    // Repair BEFORE stamping the flag on, and only if this cloud copy
    // hasn't already been fixed (either by this same repair on a previous
    // load, or by a coach re-saving after the real fix shipped) -- otherwise
    // a second pass would swap an already-correct play right back to wrong.
    if (shippedFlags && shippedFlags.directionFixed && !pt.directionFixed) {
      repairStaleDirectionOrientation(pt);
    }
    if (shippedFlags) Object.assign(pt, shippedFlags);
    Object.entries(pt.directions || {}).forEach(([dirKey, dirVal]) => {
      const variants = (dirVal.paths) ? [dirVal] : Object.values(dirVal);
      variants.forEach(variant => {
        if (!variant) return;
        if (variant.readKeyId === undefined) variant.readKeyId = null;
        (variant.paths || []).forEach(p => {
          if (p.player === undefined) p.player = null;
          // Graft in a shipped dualSideBlock capability this path is
          // missing (see SHIPPED_DUAL_SIDE_BLOCKS above) -- but never
          // overwrite a cloud path that already has its own dualSideBlock
          // data, so a coach's own re-aimed targets always win.
          if (!p.dualSideBlock) {
            const shipped = SHIPPED_DUAL_SIDE_BLOCKS[`${pt.key}|${dirKey}|${p.player}`];
            if (shipped) Object.assign(p, shipped);
          }
        });
      });
    });
  });
  // Nathan: "boot was added as a play call. needs to be removed - its just
  // an add on option for other plays." Removed from the shipped data, but
  // a cloud snapshot saved (via Edit Plays' "Save to Cloud") before this
  // change still has it as a whole playType entry -- same "cloud always
  // wins" class of bug as everything else on this page, so without this it
  // would silently reappear in the grid. This only drops the standalone
  // 'boot' PLAY; the Boot on/off TOGGLE that other plays use (BOOT_SIGNAL_ID,
  // bootOn throughout this file) is a completely separate mechanism and is
  // untouched.
  return playTypes.filter(pt => pt.key !== 'boot');
}

// Canonical playType-key -> signal-card-id/label mapping. Declared here, at
// top level outside the IIFE below (like normalizePlayData and the SHIPPED_*
// tables above it), specifically so normalizePlayData can reach it -- it
// used to live inside the IIFE (where the signal-sequence builder functions
// that also use it are defined), which meant it was invisible to
// normalizePlayData's own closure scope and silently threw a
// ReferenceError the moment cloud data actually needed the sweep-signal
// repair below (never caught by any existing test, since none of them
// exercised normalizePlayData against a play carrying its own signalCardId
// until the Sweep bug was diagnosed).
const PLAY_TYPE_SIGNAL_ID = {
  inside_zone: 9, outside_zone: 10, option: 15, option_pass: 16, blast: 13, double_blast: 14, sweep: 17,
};
const PLAY_TYPE_SIGNAL_LABEL = {
  inside_zone: 'Inside Zone', outside_zone: 'Outside Zone', option: 'Option',
  option_pass: 'Option Pass', blast: 'Blast', double_blast: 'Double Blast', sweep: 'Sweep',
};

// Split's Houston/Seattle/Florida routes (DATA.splitRoutes, saved
// separately to splitRouteEdits.json -- see edit-plays.js) went through two
// rounds of an auto-repair here that are now BOTH removed:
//   1. Detect the Right side's known pre-fix (Seattle/Florida swapped)
//      shape and swap it back -- never actually fired, because whatever
//      was really sitting in Firebase didn't exactly match the assumed
//      snapshot.
//   2. Unconditionally force the Right side back to the shipped routes on
//      every load, sidestepping the detection problem entirely -- this
//      DID work, but it also silently discarded every future save, because
//      it can't tell "stale pre-fix data" apart from "a coach's brand new,
//      more accurate hand-edit." Nathan hit exactly that: he was actively
//      re-drawing Right's routes in the editor because the shipped ones
//      were "generic... less accurate," and his saves kept reverting.
// So this is back to a plain pass-through again -- whatever's saved to
// splitRouteEdits.json is trusted as-is, Left and Right both, same as
// every other cloud save in this app. The actual fix for the original
// swap bug lives in the shipped file's data (see plays.json) and in
// whatever Nathan saves next from the editor now that it's unlocked; there
// is no longer any code-level correction layered on top of it.
//
// One narrow exception, added when Boston shipped: a cloud save made
// before a route call existed simply doesn't have that key at all -- that
// isn't a coach's edit to respect, it's just missing, and the whole-object
// assignment at the call site (DATA.splitRoutes = repairStaleSplitRoutes(...))
// was silently dropping it, leaving nothing to show or edit ("There are no
// paths showing up for Boston. Needs to be editable"). So: fill in ONLY
// route calls the saved data doesn't have yet, per side/slot, from the
// shipped defaults -- every call the coach actually has saved (including a
// from-scratch Boston edit) is left completely untouched.
function repairStaleSplitRoutes(splitRoutes) {
  const shipped = DATA.splitRoutes;
  if (!shipped) return splitRoutes;
  ['Left', 'Right'].forEach(side => {
    if (!splitRoutes[side] || !shipped[side]) return;
    ['wide', 'flex'].forEach(slot => {
      const savedSlot = splitRoutes[side][slot];
      const shippedSlot = shipped[side][slot];
      if (!savedSlot || !shippedSlot) return;
      Object.keys(shippedSlot).forEach(call => {
        if (call === 'player') return; // metadata (which player number), not a route call
        if (!(call in savedSlot)) savedSlot[call] = shippedSlot[call];
      });
    });
  });
  return splitRoutes;
}

// ---- Shared toggle-group pill component ----
// Declared at top level (not inside either file's IIFE), same reasoning
// as DATA/normalizePlayData above: play-calls.js loads before
// edit-plays.js as a plain <script> tag, so a top-level function
// declaration here becomes a global both files can call. Used for every
// L/R-style toggle in the app -- Play Calls builds its per-card toggles
// with buildToggleGroup(); Edit Plays' static HTML toggles are wired with
// wireToggle() in edit-plays.js, which also calls placeToggleThumb().

// Slides/resizes the white "active" pill inside a .toggle-group to match
// whichever button currently has aria-pressed="true". Needs the group to
// actually be laid out (not display:none) to measure correctly -- call it
// again any time a group becomes visible after being hidden.
function placeToggleThumb(group) {
  const active = group.querySelector('.toggle-btn[aria-pressed="true"]');
  const thumb = group.querySelector('.toggle-thumb');
  if (!active || !thumb) return;
  thumb.style.width = active.offsetWidth + 'px';
  thumb.style.transform = `translateX(${active.offsetLeft - 2}px)`;
}

// Builds a complete two-button toggle-group. `color` is one of the
// toggle-<color> modifier classes (orange/black/green/red/brown), `extraClass`
// is an optional additional class (e.g. 'toggle-tiny'), `options` is
// [{value, label}, {value, label}] -- an option can also carry an optional
// `short` field (e.g. 'BOS' for 'Boston') which a narrow-screen CSS rule
// swaps to via `content: attr(data-short)` when the full label doesn't fit
// (see the Split route-call toggles below); options without `short` are
// unaffected. `initialValue` picks which one starts pressed, and
// `onChange(value)` fires on every click (including re-clicks of the
// already-active button, same as the old .active-class toggles did).
function buildToggleGroup(color, options, initialValue, onChange, extraClass) {
  const group = document.createElement('div');
  group.className = `toggle-group toggle-${color}` + (extraClass ? ' ' + extraClass : '');
  const thumb = document.createElement('span');
  thumb.className = 'toggle-thumb';
  group.appendChild(thumb);
  const buttons = options.map(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toggle-btn';
    btn.dataset.value = opt.value;
    btn.textContent = opt.label;
    if (opt.short) btn.dataset.short = opt.short;
    btn.setAttribute('aria-pressed', opt.value === initialValue ? 'true' : 'false');
    group.appendChild(btn);
    return btn;
  });
  group.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.toggle-btn');
    if (!btn) return;
    buttons.forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
    placeToggleThumb(group);
    onChange(btn.dataset.value);
  });
  return group;
}

// Builds a compact on/off switch for simple binary toggles (Motion, Boot)
// where showing the same word twice ("Motion Off" / "Motion On") is
// redundant -- the label sits once to the left, and a small red/green pill
// switch with a sliding knob shows the current state, same idea as a
// standard iOS-style toggle. `checked` is the initial boolean state,
// `onChange(nextBoolean)` fires on every click.
function buildSwitchToggle(label, checked, onChange, extraClass) {
  const wrap = document.createElement('div');
  wrap.className = 'switch-control' + (extraClass ? ' ' + extraClass : '');
  const lbl = document.createElement('span');
  lbl.className = 'switch-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'switch-toggle';
  btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
  btn.setAttribute('aria-label', label);
  const track = document.createElement('span');
  track.className = 'switch-track';
  const thumb = document.createElement('span');
  thumb.className = 'switch-thumb';
  track.appendChild(thumb);
  btn.appendChild(track);
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', next ? 'true' : 'false');
    onChange(next);
  });
  wrap.appendChild(btn);
  return wrap;
}

(function() {
  const SIGNAL_CARDS = {};
  ALL_CARDS.forEach(c => { SIGNAL_CARDS[c.id] = c.img; });

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function tweenPoint(from, to, durationMs, onUpdate) {
  return new Promise(resolve => {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      onUpdate({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      if (t < 1) requestAnimationFrame(frame); else resolve();
    }
    requestAnimationFrame(frame);
  });
}
function straightPathD(pts) { const [[x0,y0],[x1,y1]] = pts; return `M ${x0} ${y0} L ${x1} ${y1}`; }
function quadPathD(pts) { const [[x0,y0],[x1,y1],[x2,y2]] = pts; return `M ${x0} ${y0} Q ${x1} ${y1} ${x2} ${y2}`; }
function lineThenCurvePathD(pts) {
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] = pts;
  return `M ${x0} ${y0} L ${x1} ${y1} Q ${x2} ${y2} ${x3} ${y3}`;
}
function multiCurvePathD(pts) {
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3],[x4,y4]] = pts;
  return `M ${x0} ${y0} Q ${x1} ${y1} ${x2} ${y2} Q ${x3} ${y3} ${x4} ${y4}`;
}
function placeArrowAtFraction(arrowEl, pathEl, frac) {
  const len = pathEl.getTotalLength();
  const pt = pathEl.getPointAtLength(len * frac);
  const pt2 = pathEl.getPointAtLength(Math.max(0, len * frac - 1));
  const angle = Math.atan2(pt.y - pt2.y, pt.x - pt2.x) * 180 / Math.PI;
  arrowEl.setAttribute('transform', `translate(${pt.x},${pt.y}) rotate(${angle})`);
}

// Mirrors edit-plays.js's endTypeFor/buildEndCapEl -- same end-cap doctrine
// (an explicit p.endType wins; otherwise isBlocking implies a 'block' T-bar
// and everything else is a 'run' arrow), so a path edited in Edit Plays
// looks the same when a coach actually pulls up the card in Play Calls.
function endTypeFor(p) {
  return p.endType || (p.isBlocking ? 'block' : 'run');
}
function buildEndCapEl(endType, color, width) {
  if (endType === 'block') {
    const barLen = Math.max(13, width * 2.2);
    return svgEl('line', {
      x1: 0, y1: -barLen / 2, x2: 0, y2: barLen / 2,
      stroke: color, 'stroke-width': Math.max(6, width + 2), 'stroke-linecap': 'round',
    });
  }
  return svgEl('polygon', { points: '-2,-11 20,0 -2,11', fill: color });
}
function animatePathDraw(pathEl, arrowEl, durationMs, delayMs, circleEl, textEl) {
  return new Promise(async resolve => {
    if (delayMs) await wait(delayMs);
    const len = pathEl.getTotalLength();
    pathEl.style.strokeDasharray = `${len} ${len}`;
    pathEl.style.strokeDashoffset = `${len}`;
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      pathEl.style.strokeDashoffset = `${len * (1 - t)}`;
      if (arrowEl) placeArrowAtFraction(arrowEl, pathEl, t);
      if (circleEl) {
        const pt = pathEl.getPointAtLength(len * t);
        circleEl.setAttribute('cx', pt.x); circleEl.setAttribute('cy', pt.y);
        if (textEl) { textEl.setAttribute('x', pt.x); textEl.setAttribute('y', pt.y + 12); }
      }
      if (t < 1) requestAnimationFrame(frame); else resolve();
    }
    requestAnimationFrame(frame);
  });
}

const DEFENSE_COLOR = '#1a3fae';
const READKEY_COLOR = '#e0201a';
const BALL_COLOR = '#e0201a';
const NOBALL_COLOR = '#123a8c';
const CIRCLE_R = 36;

function getVariant(playType, direction, insideOutside, readPosition) {
  let v = playType.directions[direction];
  if (playType.hasInsideOutside) v = v[insideOutside || 'Outside'];
  if (playType.hasReadToggle) v = v[readPosition || 'A'];
  return v;
}

// ---- Build every base play x direction combo (wing is a per-card toggle, not a filter) ----
const BASE_PLAY_ORDER = ['inside_zone', 'outside_zone', 'option', 'option_pass', 'blast', 'double_blast'];
function buildPlayList() {
  const base = BASE_PLAY_ORDER
    .map(playKey => DATA.playTypes.find(p => p.key === playKey))
    .filter(Boolean);
  const extras = DATA.playTypes.filter(p => !BASE_PLAY_ORDER.includes(p.key));
  return base.concat(extras)
    .map(playType => ({ playKey: playType.key, label: playType.label, hasInsideOutside: !!playType.hasInsideOutside, hasReadToggle: !!playType.hasReadToggle, noBoot: !!playType.noBoot }));
}

// Universal rule: 0/2/4 fingers = right, 1/3/5 fingers = left (not play-specific).
// Using 2-fingers/1-finger as the consistent, simple choice for every signal.
const WING_TOUCH_ID = 7;
const FINGER_RIGHT_IDS = [4, 5, 6];  // 0 (fist), 2, 4 fingers -- all mean EVEN = RIGHT
const FINGER_LEFT_IDS = [1, 2, 3];   // 1, 3, 5 fingers -- all mean ODD = LEFT
// Two different real signals both mean "motion is on" -- picking randomly
// between them (same idea as the finger-count randomization below) keeps
// the defense from pattern-reading a single fixed sign. Boot only has one
// dedicated card.
const MOTION_SIGNAL_IDS = [11, 12];
const BOOT_SIGNAL_ID = 26;

// ---- Split formation (added alongside Wing, doesn't touch anything above) ----
// Split's own touch/identity card, parallel to WING_TOUCH_ID. Real photo is
// still TBD from Nathan -- card 31 currently points at a plain placeholder
// image so nothing looks broken in the meantime; swap the image file in
// once the real signal photo exists, no code change needed.
const SPLIT_TOUCH_ID = 31;
// Any of the three named calls (Houston/Seattle/Florida) means the same
// thing at this level of the app -- "it's a pass" -- so Pass is a single
// on/off switch (like Motion/Boot), and which of the three cards actually
// shows is randomized the same way Motion picks between its two cards, to
// keep the defense from pattern-reading a fixed sign.
const PASS_SIGNAL_IDS = [28, 29, 30];

// The three named audibles (Houston/Seattle/Florida) a coach can call at
// the line for the wide receiver and, independently, for the flexed-out
// inside receiver -- "both the left and right receivers can get any of the
// 3 calls at the line." DATA.splitRoutes[splitSide].wide/.flex each hold
// the real-coordinate route for all three calls, digitized from Nathan's
// two route-diagram images (players 2/6 for Split Right, 5/3 for Split
// Left) the same way the formation positions were: calibrated against the
// player's own real Split anchor point, not assumed to mirror between
// sides -- the two reference images turned out to assign different route
// shapes to the wide vs. flex role depending on side, so each side's three
// routes are stored and used exactly as drawn rather than derived from one
// another.
const SPLIT_ROUTE_CALLS = ['seattle', 'houston', 'florida', 'boston'];
const SPLIT_ROUTE_LABELS = { seattle: 'Seattle', houston: 'Houston', florida: 'Florida', boston: 'Boston' };
// Nathan: "on split, you cant see boston on the right side because it
// takes up too much room -- maybe we abbreviate them on mobile view to
// SEA HOU FLO BOS." Full names still show at normal width; a narrow-screen
// CSS rule (`.toggle-btn[data-short]`) swaps to these on phones -- see
// buildToggleGroup's optional `short` option field below.
const SPLIT_ROUTE_SHORT_LABELS = { seattle: 'SEA', houston: 'HOU', florida: 'FLO', boston: 'BOS' };

function randomFingerId(side, exclude) {
  const pool = side === 'Right' ? FINGER_RIGHT_IDS : FINGER_LEFT_IDS;
  const options = exclude !== undefined ? pool.filter(id => id !== exclude) : pool;
  return options[Math.floor(Math.random() * options.length)];
}

// Split's signal order, per Nathan: Split -> Direction (the split side) ->
// Play call -> Direction (the split side AGAIN, as its own explicit card) ->
// optional Pass, which negates the run call (receivers run their routes
// either way; Pass just changes who else on the line/backfield blocks vs.
// releases -- that part isn't drawn yet, see task board for the diagram
// work still to come). An earlier version of this had that final Direction
// card always call the side OPPOSITE the split -- Nathan corrected that:
// "Ensure the run is always going to the split side. So Split right inside
// blast would have to be inside blast Right." The run itself was already
// always to the split side (getSplitBlockingPaths/getVariant always pass
// splitSide as the direction); this was purely the verbal call disagreeing
// with what the diagram actually shows, same category of bug as the title
// bar fix below in onComboChanged. Both direction cards -- the early
// "Split: X" one and this later "Direction: X" one -- now say the same
// side, matching the actual run direction and the naming convention coaches
// use for the play itself ("Inside Blast Right").
// passOn is a plain boolean now -- Nathan: "it's just any of those signals
// means it is pass", so which of Pass 1/2/3 actually shows is randomized,
// same idea as MOTION_SIGNAL_IDS below, not a coach-facing choice.
function buildSplitSignalSequence(playKey, splitSide, insideOutside, passOn) {
  const splitFingerId = randomFingerId(splitSide);
  // Avoid showing the literal same card image twice in a row for the two
  // direction cards (both now the same side) -- same dedup approach Wing's
  // Direction card already uses when direction === wingSide.
  const dirFingerId = randomFingerId(splitSide, splitFingerId);
  const playType = DATA.playTypes.find(p => p.key === playKey);
  const playSignalId = (playType && playType.signalCardId != null) ? playType.signalCardId : PLAY_TYPE_SIGNAL_ID[playKey];
  const playSignalLabel = (playType && playType.signalLabel) ? playType.signalLabel : PLAY_TYPE_SIGNAL_LABEL[playKey];
  const signals = [
    { src: SIGNAL_CARDS[SPLIT_TOUCH_ID], label: 'Split' },
    { src: SIGNAL_CARDS[splitFingerId], label: `Split: ${splitSide}` },
  ];
  if (playKey === 'blast' || playKey === 'double_blast') {
    if (insideOutside === 'Outside') {
      signals.push({ src: SIGNAL_CARDS[PLAY_TYPE_SIGNAL_ID['outside_zone']], label: 'Outside Zone' });
    }
    signals.push({ src: SIGNAL_CARDS[playSignalId], label: playSignalLabel });
  } else {
    signals.push({ src: SIGNAL_CARDS[playSignalId], label: playSignalLabel });
  }
  signals.push({ src: SIGNAL_CARDS[dirFingerId], label: `Direction: ${splitSide}` });
  if (passOn) {
    const passId = PASS_SIGNAL_IDS[Math.floor(Math.random() * PASS_SIGNAL_IDS.length)];
    signals.push({ src: SIGNAL_CARDS[passId], label: 'Pass' });
  }
  return signals;
}

// formation/splitSide/passOn are new, optional, and appended at the end
// specifically so every existing caller (play-calls-quiz.js included) that
// only ever passes the first 6 args keeps working completely unchanged --
// formation defaults to Wing behavior whenever it's left undefined.
function buildSignalSequence(playKey, wingSide, direction, insideOutside, motionOn, bootOn, formation, splitSide, passOn) {
  if (formation === 'split') {
    return buildSplitSignalSequence(playKey, splitSide, insideOutside, passOn);
  }
  const wingFingerId = randomFingerId(wingSide);
  const dirFingerId = direction === wingSide
    ? randomFingerId(direction, wingFingerId)
    : randomFingerId(direction);
  const playType = DATA.playTypes.find(p => p.key === playKey);
  const playSignalId = (playType && playType.signalCardId != null) ? playType.signalCardId : PLAY_TYPE_SIGNAL_ID[playKey];
  const playSignalLabel = (playType && playType.signalLabel) ? playType.signalLabel : PLAY_TYPE_SIGNAL_LABEL[playKey];
  const signals = [
    { src: SIGNAL_CARDS[WING_TOUCH_ID], label: 'Wing' },
    { src: SIGNAL_CARDS[wingFingerId], label: `Wing Location: ${wingSide}` },
  ];
  // Motion is called right after the wing spot is set, since it's part of
  // the pre-snap picture -- matches where the Motion toggle sits in the UI.
  if (motionOn) {
    const motionId = MOTION_SIGNAL_IDS[Math.floor(Math.random() * MOTION_SIGNAL_IDS.length)];
    signals.push({ src: SIGNAL_CARDS[motionId], label: 'Motion' });
  }
  if (playKey === 'blast' || playKey === 'double_blast') {
    // Inside is a silent default for BOTH Blast and Double Blast -- no
    // extra card at all, just the play card then direction. Outside is
    // the one that gets called out explicitly, with the real Outside Zone
    // card inserted BEFORE the play card (same "modifier before play name"
    // order as every other play -- see the onComboChanged() comment above
    // and Nathan's own example: "Wing, Right, Outside, Double Blast,
    // Right"). Blast used to show an explicit Inside/Outside card either
    // way (reusing plain finger-count images) -- that was wrong; both
    // plays behave identically here.
    if (insideOutside === 'Outside') {
      signals.push({ src: SIGNAL_CARDS[PLAY_TYPE_SIGNAL_ID['outside_zone']], label: 'Outside Zone' });
    }
    signals.push({ src: SIGNAL_CARDS[playSignalId], label: playSignalLabel });
  } else {
    signals.push({ src: SIGNAL_CARDS[playSignalId], label: playSignalLabel });
  }
  signals.push({ src: SIGNAL_CARDS[dirFingerId], label: `Direction: ${direction}` });
  // Boot is a modifier tacked on at the very end, after direction is set.
  if (bootOn) {
    signals.push({ src: SIGNAL_CARDS[BOOT_SIGNAL_ID], label: 'Boot' });
  }
  return signals;
}
// Exposed globally so play-calls-quiz.js (loaded after this file) can
// reuse the exact same signal-sequence logic instead of duplicating it --
// this whole file is wrapped in an IIFE, so without this the bare name
// isn't reachable from other scripts.
window.buildSignalSequence = buildSignalSequence;
// Exposed the same way, for the exact same reason -- js/playbook-pdf.js
// (loaded after this file) generates the sideline PDF by calling these
// SAME render functions off-screen against a hidden SVG stage, instead of
// re-deriving the play geometry a second time in a different language. That
// guarantees the PDF can never show routes that disagree with what Play
// Calls itself is showing on screen, which a separate reimplementation
// could always silently drift from.
window.renderCardDiagram = renderCardDiagram;
window.renderSplitDiagram = renderSplitDiagram;

// ---- Render a card's diagram into its SVG stage ----
function renderCardDiagram(stage, playKey, direction, wingSide, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition) {
  stage.innerHTML = '';
  const playType = DATA.playTypes.find(p => p.key === playKey);
  const variant = getVariant(playType, direction, insideOutside, readPosition);
  const vw = DATA.viewBox[0], vh = DATA.viewBox[1];

  // Boot: swap which path is treated as the ball carrier, purely for this
  // render/animation -- doesn't touch DATA, so nothing else about the play
  // (routes, blocking, everyone else's paths) changes, matching "the rest
  // of the play works exactly the same." If #1 already has the ball (e.g.
  // Option), there's nothing to swap and the toggle is a no-op.
  let bootBallPath = null, bootFakePath = null;
  if (bootOn) {
    const realBallPath = variant.paths.find(p => p.ball && !p.optionLine);
    const qbPath = variant.paths.find(p => p.player === 1 && !p.optionLine && !p.ball);
    if (realBallPath && qbPath) { bootBallPath = qbPath; bootFakePath = realBallPath; }
  }
  stage.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  const g = svgEl('g', { transform: `translate(0,${DATA.topPad})` });
  const pathsLayer = svgEl('g', {});
  const circlesLayer = svgEl('g', {});
  // Nathan: "I don't like how washed out the others are, makes it
  // difficult to see whats going on... keep them full opacity but have an
  // orange pulsing glow to the indicated player." Nobody dims anymore --
  // everyone always renders at full opacity -- the selected player's own
  // circle/path just gets an extra `selected-glow` class (see styles.css)
  // instead. A LINE position selected (selectedPlayer is a string id)
  // glows the matching O-line spot; a NUMBERED selection glows the
  // matching numbered circle. Defenders are never selectable, so they
  // never glow either way.
  const isLineSelectedForCircles = typeof selectedPlayer === 'string';
  const wingPos = DATA.wing[wingSide];
  const activeDefense = (defenseMode === '4x4' && variant.defense4x4) ? variant.defense4x4 : variant.defense;

  function drawCircle(x, y, label, stroke, fontSize, isSelected, r, playerNum) {
    r = r || CIRCLE_R;
    const wrap = svgEl('g', { class: isSelected ? 'full-op selected-glow' : 'full-op' });
    wrap.appendChild(svgEl('circle', { cx: x, cy: y, r, fill: '#fff', stroke, 'stroke-width': 8 }));
    const t = svgEl('text', { x, y: y + 12, 'font-size': fontSize, 'font-weight': 900, 'font-style': 'italic', 'text-anchor': 'middle', fill: stroke });
    t.textContent = label;
    wrap.appendChild(t);
    wrap.circleEl = wrap.children[0]; wrap.textEl = t;
    if (playerNum !== undefined) {
      wrap.style.cursor = 'pointer';
      wrap.addEventListener('click', (ev) => { ev.stopPropagation(); stage.dispatchEvent(new CustomEvent('playerclick', { detail: playerNum })); });
    }
    return wrap;
  }
  const playerCircles = {};

  // Short on-diagram callout for a play/path that has a conditional,
  // situational assignment the static arrow alone can't show (currently
  // just Option's cross-side TE block -- see the crossNote comment above).
  // Full explanation goes in a <title> for hover/screen-reader access.
  // Nathan: "this needs to be a bigger callout - have the CB flash and
  // have this text above the CB show and be x3 the size." -- endPoint is
  // the block target's own position (crossPoints lands exactly on the
  // defender), so it doubles as the anchor for placing the text above him.
  function buildReadNoteEl(endPoint, fullText) {
    const [ex, ey] = endPoint;
    const g = svgEl('g', {});
    const title = svgEl('title', {});
    title.textContent = fullText;
    g.appendChild(title);
    const fontSize = 45; // 15 * 3
    const lineHeight = 51; // 17 * 3
    const gapAboveCircle = 14;
    // Nathan: "TE READ:LB or CB / Needs to say TE READ: If no LB behind DE,
    // take the CB" -- wrapped across short lines (rather than one long one)
    // so it stays centered on the defender without running off the left or
    // right edge of the diagram when he's out near the sideline.
    const lines = ['TE READ:', 'If no LB', 'behind DE,', 'take the CB'];
    const lastLineY = ey - CIRCLE_R - gapAboveCircle;
    const firstLineY = lastLineY - lineHeight * (lines.length - 1);
    const t = svgEl('text', {
      x: ex, y: firstLineY, 'text-anchor': 'middle', 'font-size': fontSize,
      'font-weight': 800, 'font-style': 'italic', fill: READKEY_COLOR,
    });
    lines.forEach((line, i) => {
      const tspan = svgEl('tspan', { x: ex, dy: i === 0 ? 0 : lineHeight });
      tspan.textContent = line;
      t.appendChild(tspan);
    });
    g.appendChild(t);
    return g;
  }

  // Find whichever defender's circle sits at this exact spot (crossPoints
  // always lands squarely on the actual block target) so it can flash --
  // populated below, keyed by defender id, as the defense circles get drawn.
  const defenseCircles = {};
  function flashDefenderAt(pt) {
    const [px, py] = pt;
    let bestId = null, bestDist = Infinity;
    activeDefense.forEach(d => {
      const dist = Math.hypot(d.pos[0] - px, d.pos[1] - py);
      if (dist < bestDist) { bestDist = dist; bestId = d.id; }
    });
    if (bestId && defenseCircles[bestId]) defenseCircles[bestId].classList.add('te-read-flash');
  }

  activeDefense.forEach(d => {
    const isReadKey = variant.readKeyId && d.id === variant.readKeyId;
    const stroke = isReadKey ? READKEY_COLOR : DEFENSE_COLOR;
    const r = CIRCLE_R;
    const fs = 26;
    const dc = drawCircle(d.pos[0], d.pos[1], d.label, stroke, fs, false, r);
    circlesLayer.appendChild(dc);
    defenseCircles[d.id] = dc;
  });

  const c5Selected = selectedPlayer === 5;
  const c5 = drawCircle(DATA.formation['5'][0], DATA.formation['5'][1], '5', '#111', 34, c5Selected, null, 5);
  circlesLayer.appendChild(c5); playerCircles['5'] = c5;
  // O-line circles were never selectable/highlightable at all originally
  // (no playerNum -> no click listener) -- added so a player whose
  // position is an O-line spot (LT/LG/C/RG/RT) can have it auto-highlighted
  // the same way numbered positions already were. Only glows for a LINE
  // selection (isLineSelectedForCircles) -- a numbered selection leaves
  // these alone, same as it always has.
  ['LT','LG','C','RG','RT'].forEach(k => {
    const isSelected = isLineSelectedForCircles && selectedPlayer === k;
    const c = drawCircle(DATA.formation[k][0], DATA.formation[k][1], k, '#111', 22, isSelected, null, k);
    circlesLayer.appendChild(c); playerCircles[k] = c;
  });
  const c6Selected = selectedPlayer === 6;
  const c6 = drawCircle(DATA.formation['6'][0], DATA.formation['6'][1], '6', '#111', 34, c6Selected, null, 6);
  circlesLayer.appendChild(c6); playerCircles['6'] = c6;

  // Motion is now a pure playback choice, exactly like Wing L/R and Dir L/R
  // -- not something authored per play. Whatever side #4 is set on, turning
  // Motion on always sends him to the opposite side before the snap; his
  // route/blocking math below is anchored from wherever he actually ends
  // up standing.
  const oppositeWingSide = wingSide === 'Left' ? 'Right' : 'Left';
  const p4Anchor = motionOn ? DATA.wing[oppositeWingSide] : wingPos;
  // Which side #4 is ACTUALLY standing on -- used to mirror his
  // block/seam offsets correctly. Using raw wingSide here (ignoring
  // Motion) left the mirror sign out of sync with p4Anchor whenever
  // Motion was on, sending block assignments miles off their intended
  // spot, occasionally clear off screen.
  const p4Side = motionOn ? oppositeWingSide : wingSide;

  const wingSelected = selectedPlayer === 4;
  const c4 = drawCircle(p4Anchor[0], p4Anchor[1], '4', '#111', 34, wingSelected, null, 4);
  circlesLayer.appendChild(c4); playerCircles['4'] = c4;

  if (motionOn) {
    circlesLayer.appendChild(svgEl('path', {
      d: `M ${wingPos[0]} ${wingPos[1]} L ${p4Anchor[0]} ${p4Anchor[1]}`,
      fill: 'none', stroke: '#111', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': '3 12',
    }));
  }

  ['3','1','2'].forEach(num => {
    const isSelected = String(selectedPlayer) === num;
    const c = drawCircle(DATA.backfield[num][0], DATA.backfield[num][1], num, '#111', 34, isSelected, null, Number(num));
    circlesLayer.appendChild(c); playerCircles[num] = c;
  });

  const lastRenderedPaths = [];
  // O-line blocking paths (and any other isBlocking path with player:null,
  // e.g. #4/5/6 staying in to block) carry an `id` like 'LT' instead of a
  // player number -- see the O-line circles above. A LINE position selected
  // (selectedPlayer is a string) glows the matching block; a NUMBERED
  // position selected glows the matching route/carry. Everything else stays
  // full opacity either way -- no more "background context" dimming
  // exception to reason about now that dimming itself is gone.
  const isLineSelected = typeof selectedPlayer === 'string';
  variant.paths.forEach(p => {
    const isSelected = selectedPlayer !== null && (isLineSelected ? (p.id === selectedPlayer) : (p.player === selectedPlayer));
    const wrap = svgEl('g', { class: isSelected ? 'full-op selected-glow' : 'full-op' });

    let points = (defenseMode === '4x4' && p.isBlocking && !p.blockRelative && !p.dualSideBlock && p.points4x4) ? p.points4x4 : p.points;
    // Set below when this path is a dualSideBlock currently showing its
    // cross-side target AND has a crossNote -- Nathan: "On the play call
    // Option, when the call is option left and the wing is to the right,
    // the TE on the left side will look to block the LB that is stacked
    // behind the DE, but if there is no outside LB there behind the DE,
    // the TE would go out to block the CB. I want it to be called out on
    // the diagram someway." The diagram can only draw ONE fixed arrow (to
    // the CB, cross-side's actual target), so this renders a short text
    // callout next to it explaining the real, conditional read -- rather
    // than the diagram silently implying "always blocks the CB" as if it
    // were the only assignment. Data-driven (crossNote on the path itself)
    // so it's specific to whichever play/path actually has one -- doesn't
    // affect Double Blast's or the Wing's own dualSideBlock-style paths,
    // which don't set it.
    let readNoteToShow = null;
    if (p.dualSideBlock) {
      // Fixed-position blocker (e.g. the Option play's playside TE) whose
      // block target depends on whether the wing is on the same side as the
      // play's direction or the opposite side.
      const sameSide = p4Side === direction;
      const baseKey = sameSide ? 'sameSidePoints' : 'crossPoints';
      const fieldKey = defenseMode === '4x4' ? baseKey + '4x4' : baseKey;
      points = p[fieldKey] || p.points;
      if (!sameSide && p.crossNote) readNoteToShow = p.crossNote;
    } else if (p.player === 4 && !p.optionLine) {
      if (p.wingSeamRelative) {
        const sameSide = p4Side === direction;
        const offsets = sameSide ? p.sameSideOffsets : p.crossOffsets;
        const sign = p4Side === 'Left' ? 1 : -1;
        points = offsets.map(([dx, dy]) => [p4Anchor[0] + sign * dx, p4Anchor[1] + dy]);
      } else if (p.blockRelative) {
        const sameSide = p4Side === direction;
        const baseKey = sameSide ? 'sameSidePoints' : 'crossPoints';
        const fieldKey = defenseMode === '4x4' ? baseKey + '4x4' : baseKey;
        const srcPoints = p[fieldKey] || p.points;
        const [dx, dy] = srcPoints[1];
        const sign = p4Side === 'Left' ? 1 : -1;
        points = [p4Anchor, [p4Anchor[0] + sign * dx, p4Anchor[1] + dy]];
      } else {
        points = [p4Anchor, ...points.slice(1)];
      }
    }
    if (p.optionLine) {
      const [[x1,y1],[x2,y2]] = p.points;
      const path = svgEl('path', { d: `M ${x1} ${y1} L ${x2} ${y2}`, fill: 'none', stroke: '#555', 'stroke-width': p.width, 'stroke-linecap': 'round', 'stroke-dasharray': '9 7' });
      wrap.appendChild(path);
      pathsLayer.appendChild(wrap);
      return;
    }

    const effectiveBall = p === bootBallPath ? true : (p === bootFakePath ? false : p.ball);
    const color = p.isBlocking ? '#e8720c' : (effectiveBall ? BALL_COLOR : NOBALL_COLOR);
    const d = p.lineThenCurve ? lineThenCurvePathD(points) : (points.length === 5 ? multiCurvePathD(points) : (points.length === 2 ? straightPathD(points) : quadPathD(points)));
    const attrs = { d, fill: 'none', stroke: color, 'stroke-width': p.width, 'stroke-linecap': 'round' };
    if (p.fake) attrs['stroke-dasharray'] = '10 8';
    const path = svgEl('path', attrs);
    wrap.appendChild(path);

    let arrowEl = null;
    if (!p.fake) {
      arrowEl = buildEndCapEl(endTypeFor(p), color, p.width);
      wrap.appendChild(arrowEl);
      placeArrowAtFraction(arrowEl, path, 1);
    }
    pathsLayer.appendChild(wrap);

    if (readNoteToShow) {
      flashDefenderAt(points[points.length - 1]);
      pathsLayer.appendChild(buildReadNoteEl(points[points.length - 1], readNoteToShow));
    }

    const ownerKey = p.player !== null ? String(p.player) : p.id;
    const ownerCircle = (ownerKey && !p.fake) ? playerCircles[ownerKey] : null;
    lastRenderedPaths.push({ el: path, arrowEl, player: p.player, id: p.id, isBall: effectiveBall, isBlocking: !!p.isBlocking, delayMs: p.delayMs || 0,
      circleEl: ownerCircle ? ownerCircle.circleEl : null, textEl: ownerCircle ? ownerCircle.textEl : null });
  });

  g.appendChild(pathsLayer);
  g.appendChild(circlesLayer);
  stage.appendChild(g);

  stage._mainGroup = g;
  stage._circlesLayerRef = circlesLayer;
  stage._lastRenderedPaths = lastRenderedPaths;
}

// ---- Render the Split formation's lineup, plus whichever of the play's
// existing Shotgun blocking assignments transfer over unchanged ----
// DATA.split.Left/.Right hold real-coordinate positions for 5, 6, 3, 4, 1, 2,
// derived from Nathan's Split Right/Split Left reference diagrams and
// corrected per his follow-up (Split Right's 2/3/4 were rotated one slot in
// the first pass). Same O-line row as Shotgun, reused unchanged from
// DATA.formation. The pattern that held once corrected: 5 is always on the
// left / 6 always on the right (tight-on-the-line on the non-split side,
// split out wide on the split side); 1 is always the QB at Shotgun's exact
// center-backfield anchor; whichever of 2 (right identity) / 3 (left
// identity) sits on the side OPPOSITE the split is the backfield companion,
// snapped to that exact Shotgun backfield anchor, while the other one
// flexes out to a perimeter spot on the split side; 4 is always the flex
// spot on the side opposite the split (matching Nathan's original "#4 is
// always opposite the split" rule).
//
// Because the O-line, the QB (1), and the direction-appropriate ball
// carrier all sit at the *exact same real coordinates* in Split as they do
// in Shotgun, their existing blocking/ballcarrier paths for
// direction = splitSide (Nathan: "any run calls would go to the same side
// as the split") transfer over with zero changes. Same for whichever of
// 5/6 stays tight on the line -- it blocks exactly like it already does in
// Shotgun. What does NOT transfer: the flexed-out back, player 4, and the
// wide one of 5/6 -- in Split those three run routes instead of blocking
// (Nathan: "even if the team runs the receivers still run their assigned
// routes"), and the actual route shapes (Houston/Seattle/Florida) aren't
// authored yet, so those three are left out of the reused paths rather than
// shown blocking, which would be wrong.
function getSplitBlockingPaths(playType, splitSide, insideOutside, readPosition) {
  const variant = getVariant(playType, splitSide, insideOutside, readPosition);
  const wideNum = splitSide === 'Right' ? 6 : 5;
  const flexBackNum = splitSide === 'Right' ? 2 : 3;
  const excluded = new Set([wideNum, flexBackNum, 4]);
  return (variant.paths || []).filter(p => {
    if (p.optionLine || p.dualSideBlock) return false; // Option-style relative blocking isn't wired for Split yet
    return p.player === null || !excluded.has(p.player);
  });
}

// When Pass is on, the play isn't a run anymore -- Nathan: "the lineman
// need to pass block not run block, they wouldn't go up field." The O-line
// and the tight one of 5/6 (not split out) stay in and take a short,
// generic kick-slide step to protect instead of releasing downfield --
// that part is the same regardless of which of the 6 plays is on the card.
// The QB himself also sells a fake handoff (a short dashed step toward the
// mesh point, same "sell the fake" convention as the companion's dashed
// fake path below) before pulling the ball back and dropping one short
// step to throw from -- Nathan: "QB fakes the handoff and drops a step
// back to throw." That replaced an earlier version that just had him carry
// the ball 90 units straight back with a run-style arrow, which looked
// like he was taking off on a scramble rather than setting up to pass.
//
// The backfield companion (whichever of 2/3 isn't flexed out) is the one
// exception that DOES still depend on which play is selected. Nathan
// refined this three times:
//   1. "the running back in the backside still runs his fake handoff then
//      looks to pickup anyone coming in on the qb" -- first version had him
//      run the real run path as a fake, then continue on to a separate
//      computed spot nearer the QB to block from.
//   2. "the running back has to fake the handoff by running through the
//      handoff and blocking at the hole they would hit on the run. so an
//      inside blast, they would run the blast path and block someone
//      coming through the hole" -- swapped that computed spot for a short
//      block stub starting exactly where the fake run path ends.
//   3. "dont do this. you made it so the path goes but the RB 2 starts over
//      the line of scrimmage then slides back along the line. just have
//      him run the path" -- that stub is gone too now. No second segment
//      at all: he just runs the exact same path he would have carried the
//      ball on (reused from the play's own run data, same as
//      getSplitBlockingPaths reuses it for a real run), drawn as a fake
//      (dashed, no ball, no arrowhead -- same convention as Option's fake
//      dive). That alone is the whole assignment now -- no separate block
//      indicator drawn after it. The three route-runners (wide, flex,
//      player 4) are unaffected either way -- getSplitRoutePaths already
//      draws their routes regardless of run/pass, per "even if the team
//      runs the receivers still run their assigned routes."
function getSplitPassProtectionPaths(playType, splitSide, insideOutside, readPosition) {
  const pos = DATA.split[splitSide];
  const tightNum = splitSide === 'Right' ? 5 : 6; // stays in (the wide one of 5/6 is out running a route instead)
  const companionNum = splitSide === 'Right' ? 3 : 2; // the backfield player NOT flexed out
  const paths = [];

  ['LT', 'LG', 'C', 'RG', 'RT'].forEach(k => {
    const [x, y] = DATA.formation[k];
    paths.push({ id: k, isBlocking: true, endType: 'block', width: 7, points: [[x, y], [x, y + 22]] });
  });

  const [tx, ty] = pos[tightNum];
  paths.push({ player: tightNum, isBlocking: true, endType: 'block', width: 7, points: [[tx, ty], [tx, ty + 22]] });

  const [cx] = pos[companionNum]; // only the x is needed now, for the QB's mesh-step direction below
  const variant = playType ? getVariant(playType, splitSide, insideOutside, readPosition) : null;
  const realBallPath = variant && (variant.paths || []).find(p => p.player === companionNum && p.ball && !p.optionLine);
  if (realBallPath) {
    // Just run the path -- no separate block segment tacked on after it.
    paths.push({ player: companionNum, ball: false, fake: true, width: 9, points: realBallPath.points });
  }
  const [qx, qy] = pos['1'];

  // QB: fake the handoff toward the companion's mesh point (short, dashed,
  // no ball -- generic regardless of which run this pass is dressed up as,
  // same as every other pre-snap look on this card), then a short drop
  // step straight back to throw from. Not the old 90-unit straight run.
  const meshSign = cx >= qx ? 1 : -1;
  const fakeMeshSpot = [qx + meshSign * 40, qy - 15];
  paths.push({ player: 1, ball: false, fake: true, width: 9, points: [[qx, qy], fakeMeshSpot] });
  const dropSpot = [qx, qy + 35];
  paths.push({ player: 1, ball: true, endType: 'run', width: 9, points: [fakeMeshSpot, dropSpot] });

  return paths;
}

// Slides a route's whole points array so its first point (the player's
// real starting spot) lands exactly on newAnchor, preserving every other
// point's offset from that start -- used to reuse a route's SHAPE at a
// different player's real position (see player-4 handling below).
function reanchorRoute(points, newAnchor) {
  const [ax, ay] = points[0];
  const vw = (DATA.viewBox && DATA.viewBox[0]) || 1600;
  // Player 4's real spot differs from the route's original owner (2/3), so
  // sliding the whole shape over can push the far end past the canvas edge
  // (e.g. an already-wide route shifted further right) -- clamp to a safe
  // margin the same way the route data itself was clamped when authored.
  return points.map(([x, y]) => [
    Math.max(20, Math.min(vw - 20, x - ax + newAnchor[0])),
    Math.max(-390, Math.min(600, y - ay + newAnchor[1])),
  ]);
}

// The two route calls always run, independent of run/pass ("even if the
// team runs the receivers still run their assigned routes") -- but per
// Nathan's correction, they're not a "wide receiver call" / "inside
// receiver call" pair. They're a LEFT-side call and a RIGHT-side call: "the
// group of receivers on the left side of the play (split L would be 5 and
// 3 on left, and only the 4 on the right)." Whichever side the split is on
// has TWO receivers (the wide one + the flexed one, e.g. 5 and 3 for Split
// Left) and both run that side's call from DATA.splitRoutes -- the wide
// route and the flex/inside route are two different paths in the same
// diagram, not two coaches picking independently. The side OPPOSITE the
// split has just the one receiver, player 4, who always runs the inside
// route for whatever's called to his side: "if they called the houston on
// the right too, the 4 would run the inside positions route for Houston."
// There's no separate reference image for 4 specifically -- he's re-using
// the flex-route SHAPE from whichever split direction naturally puts a
// flex player on that same physical side (Split Left's flex is player 3 on
// the left; Split Right's flex is player 2 on the right), re-anchored to
// 4's own real position via reanchorRoute().
function getSplitRoutePaths(splitSide, leftCall, rightCall) {
  const routes = DATA.splitRoutes;
  if (!routes) return [];
  const out = [];
  const splitSideData = routes[splitSide];
  const splitSideCall = splitSide === 'Right' ? rightCall : leftCall;
  if (splitSideData) {
    if (splitSideData.wide && splitSideData.wide[splitSideCall]) {
      out.push({ points: splitSideData.wide[splitSideCall], player: splitSideData.wide.player, width: 7 });
    }
    if (splitSideData.flex && splitSideData.flex[splitSideCall]) {
      out.push({ points: splitSideData.flex[splitSideCall], player: splitSideData.flex.player, width: 7 });
    }
  }
  const oppositeSide = splitSide === 'Right' ? 'Left' : 'Right';
  const oppositeCall = splitSide === 'Right' ? leftCall : rightCall;
  const oppositeFlexSource = routes[oppositeSide] && routes[oppositeSide].flex;
  const fourPos = DATA.split[splitSide] && DATA.split[splitSide]['4'];
  if (oppositeFlexSource && oppositeFlexSource[oppositeCall] && fourPos) {
    out.push({ points: reanchorRoute(oppositeFlexSource[oppositeCall], fourPos), player: 4, width: 7 });
  }
  return out;
}

// Split's defensive look. Nathan: "The defense should always remain in the
// 4x4 defense with no change." So this is the exact same static 4x4 front
// used everywhere else in the app (every playType's defense4x4 field is
// this identical array -- see DEFENDER_IDS_4x4 above) -- 4 down linemen, 4
// linebackers, 2 corners, 1 free safety, always at these same fixed spots,
// never shifted based on splitSide or where the receivers are standing. No
// nickel, no second safety, no per-side tracking -- those were a previous,
// over-designed attempt at "smart" coverage that Nathan asked to remove.
function getSplitDefense() {
  return [
    { id: 'DE_L', label: 'DE', pos: [436, 110] },
    { id: 'DT_L', label: 'DT', pos: [662, 110] },
    { id: 'DT_R', label: 'DT', pos: [949, 110] },
    { id: 'DE_R', label: 'DE', pos: [1183, 110] },
    { id: 'LB1', label: 'LB', pos: [500, -20] },
    { id: 'LB2', label: 'LB', pos: [700, -20] },
    { id: 'LB3', label: 'LB', pos: [900, -20] },
    { id: 'LB4', label: 'LB', pos: [1100, -20] },
    { id: 'CB_L', label: 'CB', pos: [150, 90] },
    { id: 'CB_R', label: 'CB', pos: [1460, 90] },
    { id: 'FS', label: 'S', pos: [805, -190] },
  ];
}

function renderSplitDiagram(stage, playKey, splitSide, insideOutside, readPosition, leftCall, rightCall, passOn, selectedPlayer) {
  stage.innerHTML = '';
  const vw = DATA.viewBox[0], vh = DATA.viewBox[1];
  stage.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  const g = svgEl('g', { transform: `translate(0,${DATA.topPad})` });
  const pathsLayer = svgEl('g', {});
  const circlesLayer = svgEl('g', {});
  const pos = DATA.split[splitSide];

  // Auto-highlight the signed-in player's own position, same idea as
  // renderCardDiagram (Shotgun). Also now click-to-toggle just like
  // Shotgun -- `selectedPlayer` starts from defaultHighlightForSignedInPlayer()
  // but a tap on any circle here dispatches the same 'playerclick' event
  // buildCard already listens for, so no other wiring changed.
  selectedPlayer = selectedPlayer === undefined ? null : selectedPlayer;
  const isLineSelected = typeof selectedPlayer === 'string';

  function drawCircle(x, y, label, fontSize, r, stroke, isSelected, playerNum) {
    stroke = stroke || '#111';
    const wrap = svgEl('g', { class: isSelected ? 'full-op selected-glow' : 'full-op' });
    wrap.appendChild(svgEl('circle', { cx: x, cy: y, r: r || CIRCLE_R, fill: '#fff', stroke, 'stroke-width': 8 }));
    const t = svgEl('text', { x, y: y + 12, 'font-size': fontSize, 'font-weight': 900, 'font-style': 'italic', 'text-anchor': 'middle', fill: stroke });
    t.textContent = label;
    wrap.appendChild(t);
    wrap.circleEl = wrap.children[0]; wrap.textEl = t;
    if (playerNum !== undefined) {
      wrap.style.cursor = 'pointer';
      wrap.addEventListener('click', (ev) => { ev.stopPropagation(); stage.dispatchEvent(new CustomEvent('playerclick', { detail: playerNum })); });
    }
    return wrap;
  }

  getSplitDefense().forEach(d => {
    circlesLayer.appendChild(drawCircle(d.pos[0], d.pos[1], d.label, 26, CIRCLE_R, DEFENSE_COLOR, false));
  });

  const playerCircles = {};
  ['LT', 'LG', 'C', 'RG', 'RT'].forEach(k => {
    // Same rule as renderCardDiagram's Shotgun O-line circles: only glows
    // for a LINE selection, not a numbered one.
    const isSelected = isLineSelected && selectedPlayer === k;
    const c = drawCircle(DATA.formation[k][0], DATA.formation[k][1], k, 22, null, null, isSelected, k);
    circlesLayer.appendChild(c); playerCircles[k] = c;
  });
  ['5', '6', '3', '4', '1', '2'].forEach(num => {
    const isSelected = selectedPlayer === Number(num);
    const c = drawCircle(pos[num][0], pos[num][1], num, 34, null, null, isSelected, Number(num));
    circlesLayer.appendChild(c); playerCircles[num] = c;
  });

  const lastRenderedPaths = [];
  function drawPath(p) {
    const color = p.isBlocking ? '#e8720c' : (p.ball ? BALL_COLOR : NOBALL_COLOR);
    const points = p.points;
    const d = p.lineThenCurve ? lineThenCurvePathD(points) : (points.length === 5 ? multiCurvePathD(points) : (points.length === 2 ? straightPathD(points) : quadPathD(points)));
    // Same matching rule as renderCardDiagram's Shotgun path: a numbered
    // selection glows the matching route/carry; a LINE selection (O-line
    // id) glows just that one block. Everything else stays full opacity.
    const isSelected = selectedPlayer !== null && (isLineSelected ? (p.id === selectedPlayer) : (p.player === selectedPlayer));
    const wrap = svgEl('g', { class: isSelected ? 'full-op selected-glow' : 'full-op' });
    const attrs = { d, fill: 'none', stroke: color, 'stroke-width': p.width, 'stroke-linecap': 'round' };
    if (p.fake) attrs['stroke-dasharray'] = '10 8';
    const pathEl = svgEl('path', attrs);
    wrap.appendChild(pathEl);
    let arrowEl = null;
    if (!p.fake) {
      arrowEl = buildEndCapEl(endTypeFor(p), color, p.width);
      wrap.appendChild(arrowEl);
      placeArrowAtFraction(arrowEl, pathEl, 1);
    }
    pathsLayer.appendChild(wrap);
    const ownerKey = p.player !== null ? String(p.player) : p.id;
    const ownerCircle = ownerKey ? playerCircles[ownerKey] : null;
    lastRenderedPaths.push({
      el: pathEl, arrowEl, player: p.player, id: p.id, isBall: !!p.ball, isBlocking: !!p.isBlocking, delayMs: p.delayMs || 0,
      circleEl: ownerCircle ? ownerCircle.circleEl : null, textEl: ownerCircle ? ownerCircle.textEl : null,
    });
  }

  const playType = DATA.playTypes.find(p => p.key === playKey);
  if (passOn) {
    getSplitPassProtectionPaths(playType, splitSide, insideOutside, readPosition).forEach(drawPath);
  } else if (playType) {
    getSplitBlockingPaths(playType, splitSide, insideOutside, readPosition).forEach(drawPath);
  }
  getSplitRoutePaths(splitSide, leftCall, rightCall).forEach(drawPath);

  g.appendChild(pathsLayer);
  g.appendChild(circlesLayer);
  stage.appendChild(g);

  stage._mainGroup = g;
  stage._circlesLayerRef = circlesLayer;
  stage._lastRenderedPaths = lastRenderedPaths;
}

// ---- Play the animation for a Split card's run (linemen/QB/carrier/tight
// blocker only -- see getSplitBlockingPaths above for what's not included
// yet). Mirrors playCardAnimation below, minus the Wing/Motion/Boot/
// selected-player machinery that doesn't apply to Split. ----
async function playSplitAnimation(stage, splitSide, speedMultiplier, isPlayingRef) {
  if (isPlayingRef.value) return;
  isPlayingRef.value = true;

  const animMs = 1400 * speedMultiplier;
  const mainGroup = stage._mainGroup;
  const circlesLayerRef = stage._circlesLayerRef;
  const lastRenderedPaths = stage._lastRenderedPaths || [];

  const ball = svgEl('ellipse', { rx: 34, ry: 21, fill: '#7a4a24', stroke: '#f4e9dc', 'stroke-width': 3 });
  const centerPos = { x: DATA.formation['C'][0], y: DATA.formation['C'][1] };
  const qbPos = { x: DATA.split[splitSide]['1'][0], y: DATA.split[splitSide]['1'][1] };
  ball.setAttribute('cx', centerPos.x); ball.setAttribute('cy', centerPos.y);
  mainGroup.insertBefore(ball, circlesLayerRef);

  await wait(250 * speedMultiplier);
  await tweenPoint(centerPos, qbPos, 450 * speedMultiplier, pt => { ball.setAttribute('cx', pt.x); ball.setAttribute('cy', pt.y); });
  await wait(150 * speedMultiplier);

  const pathPromises = lastRenderedPaths.map(({ el, arrowEl, delayMs, circleEl, textEl }) =>
    animatePathDraw(el, arrowEl, animMs, (delayMs || 0) * speedMultiplier, circleEl, textEl));

  const ballEntry = lastRenderedPaths.find(p => p.isBall);
  const OFFY = 50;
  if (ballEntry && ballEntry.circleEl) {
    await wait((ballEntry.delayMs || 0) * speedMultiplier);
    const carrier = ballEntry.circleEl;
    let cx = qbPos.x, cy = qbPos.y;
    let catchingUp = true;
    function catchUpFrame() {
      const targetX = Number(carrier.getAttribute('cx'));
      const targetY = Number(carrier.getAttribute('cy')) + OFFY;
      cx += (targetX - cx) * 0.25;
      cy += (targetY - cy) * 0.25;
      ball.setAttribute('cx', cx);
      ball.setAttribute('cy', cy);
      const dist = Math.hypot(targetX - cx, targetY - cy);
      if (catchingUp && dist > 3) {
        requestAnimationFrame(catchUpFrame);
      } else {
        catchingUp = false;
        track();
      }
    }
    catchUpFrame();
    let tracking = true;
    function track() {
      if (!tracking) return;
      ball.setAttribute('cx', carrier.getAttribute('cx'));
      ball.setAttribute('cy', Number(carrier.getAttribute('cy')) + OFFY);
      requestAnimationFrame(track);
    }
    await wait(animMs);
    tracking = false;
  } else {
    await wait(animMs);
  }
  await Promise.all(pathPromises);
  await wait(300 * speedMultiplier);
  ball.remove();
  isPlayingRef.value = false;
}

// ---- Play the animation for a card ----
async function playCardAnimation(stage, playKey, direction, wingSide, speedMultiplier, isPlayingRef, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition) {
  if (isPlayingRef.value) return;
  isPlayingRef.value = true;
  renderCardDiagram(stage, playKey, direction, wingSide, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition);

  const animMs = 1400 * speedMultiplier;
  const mainGroup = stage._mainGroup;
  const circlesLayerRef = stage._circlesLayerRef;
  // Nathan: "it should default to all paths are moving... have the
  // highlighted path glow but show all paths run." Selecting a player only
  // adds the glow (see renderCardDiagram) -- it no longer narrows down
  // which paths the ▶ animation actually plays. Matches Split, which
  // never filtered by selection to begin with.
  const lastRenderedPaths = stage._lastRenderedPaths;

  const ball = svgEl('ellipse', { rx: 34, ry: 21, fill: '#7a4a24', stroke: '#f4e9dc', 'stroke-width': 3 });
  const centerPos = { x: DATA.formation['C'][0], y: DATA.formation['C'][1] };
  const qbPos = { x: DATA.backfield['1'][0], y: DATA.backfield['1'][1] };
  ball.setAttribute('cx', centerPos.x); ball.setAttribute('cy', centerPos.y);
  mainGroup.insertBefore(ball, circlesLayerRef);

  // Pre-snap motion: purely a playback choice (like Wing/Dir), not authored
  // per play -- whatever side #4 is set on, Motion On always sends him to
  // the opposite side. He's already drawn there (renderCardDiagram anchors
  // his route/blocking off that spot); for the animation, temporarily snap
  // him back to his real lineup spot and let him visibly run the motion
  // before the snap, otherwise it'd look identical to just picking the
  // other wing side to begin with.
  if (motionOn) {
    const p4Entry = lastRenderedPaths.find(p => p.player === 4);
    if (p4Entry && p4Entry.circleEl) {
      const oppositeSide = wingSide === 'Left' ? 'Right' : 'Left';
      const startPos = { x: DATA.wing[wingSide][0], y: DATA.wing[wingSide][1] };
      const endPos = { x: DATA.wing[oppositeSide][0], y: DATA.wing[oppositeSide][1] };
      p4Entry.circleEl.setAttribute('cx', startPos.x); p4Entry.circleEl.setAttribute('cy', startPos.y);
      if (p4Entry.textEl) { p4Entry.textEl.setAttribute('x', startPos.x); p4Entry.textEl.setAttribute('y', startPos.y + 12); }
      await tweenPoint(startPos, endPos, 2200 * speedMultiplier, pt => {
        p4Entry.circleEl.setAttribute('cx', pt.x); p4Entry.circleEl.setAttribute('cy', pt.y);
        if (p4Entry.textEl) { p4Entry.textEl.setAttribute('x', pt.x); p4Entry.textEl.setAttribute('y', pt.y + 12); }
      });
      await wait(150 * speedMultiplier);
    }
  }

  await wait(250 * speedMultiplier);
  await tweenPoint(centerPos, qbPos, 450 * speedMultiplier, pt => { ball.setAttribute('cx', pt.x); ball.setAttribute('cy', pt.y); });
  await wait(150 * speedMultiplier);

  const pathPromises = lastRenderedPaths.map(({ el, arrowEl, delayMs, circleEl, textEl }) =>
    animatePathDraw(el, arrowEl, animMs, (delayMs || 0) * speedMultiplier, circleEl, textEl));

  const ballEntry = lastRenderedPaths.find(p => p.isBall);
  const OFFY = 50;
  if (ballEntry && ballEntry.circleEl) {
    await wait((ballEntry.delayMs || 0) * speedMultiplier);
    const carrier = ballEntry.circleEl;
    // ease toward the carrier's LIVE position every frame (never a stale
    // snapshot target) -- the carrier is already moving along his own path
    // by this point, so tweening to a fixed captured point goes stale and
    // causes a visible jump once tracking begins
    let cx = qbPos.x, cy = qbPos.y;
    let catchingUp = true;
    function catchUpFrame() {
      const targetX = Number(carrier.getAttribute('cx'));
      const targetY = Number(carrier.getAttribute('cy')) + OFFY;
      cx += (targetX - cx) * 0.25;
      cy += (targetY - cy) * 0.25;
      ball.setAttribute('cx', cx);
      ball.setAttribute('cy', cy);
      const dist = Math.hypot(targetX - cx, targetY - cy);
      if (catchingUp && dist > 3) {
        requestAnimationFrame(catchUpFrame);
      } else {
        catchingUp = false;
        track();
      }
    }
    catchUpFrame();
    let tracking = true;
    function track() {
      if (!tracking) return;
      ball.setAttribute('cx', carrier.getAttribute('cx'));
      ball.setAttribute('cy', Number(carrier.getAttribute('cy')) + OFFY);
      requestAnimationFrame(track);
    }
    await wait(animMs);
    tracking = false;
  } else {
    await wait(animMs);
  }
  await Promise.all(pathPromises);
  await wait(300 * speedMultiplier);
  ball.remove();
  isPlayingRef.value = false;
}

// Signed-in player's stored position (player-identity.js), translated into
// whatever renderCardDiagram/renderSplitDiagram's selectedPlayer expects --
// a NUMBER for the six numbered spots, a STRING id ('LT'/'LG'/'C'/'RG'/'RT')
// for the O-line, or null for "nothing to auto-highlight" (no position set,
// or they picked Coach). Every play card defaults its highlight to this
// instead of nobody, so a kid's own job is called out automatically without
// needing to tap their own number every single time -- Nathan: "either
// that position is called out on the plays or there is a study guide...".
// Re-read live (not cached at module load) since My Position can change
// the session's stored value at any point while Play Calls is already open.
function defaultHighlightForSignedInPlayer() {
  const session = window.PlayerIdentity && window.PlayerIdentity.getSession && window.PlayerIdentity.getSession();
  const pos = session && session.position;
  if (!pos || pos === 'COACH') return null;
  return /^[1-6]$/.test(pos) ? Number(pos) : pos;
}

// ---- Build a single flip-card ----
function buildCard(combo) {
  const outer = document.createElement('div');
  outer.className = 'card-outer';
  const inner = document.createElement('div');
  inner.className = 'card-inner';

  let wingSide = 'Left';
  let direction = 'Left';
  // Split formation -- a second, independent formation alongside Shotgun
  // (the existing Wing-based formation; every play up to now has been run
  // out of Shotgun, it's just never been called out explicitly since it's
  // the default -- see the formationToggle below). 'shotgun' keeps every
  // bit of existing behavior; 'split' uses its own signal order
  // (buildSplitSignalSequence), its own single Split Side toggle instead of
  // Wing/Direction, and its own lineup diagram (renderSplitDiagram, from
  // DATA.split) instead of renderCardDiagram. Routes for the Houston/
  // Seattle/Florida calls, and Play button animation, are the next
  // increment -- for now the front of the card shows the real Split Right/
  // Split Left lineup at rest, matching Nathan's reference diagrams.
  let formation = 'shotgun';
  let splitSide = 'Left';
  // Pass is a plain on/off switch -- off means run, on means whichever of
  // the three named calls (Houston/Seattle/Florida, i.e. Pass 1/2/3 in the
  // card catalog) gets randomized in as the final signal. Nathan: "any of
  // those signals means it is pass" -- not a coach-facing choice of which.
  let passOn = false;
  // Which of Seattle/Houston/Florida is called to each SIDE of the play --
  // not a wide-receiver-vs-inside-receiver choice. The split side's two
  // receivers (wide + flex) both run whatever's called to their side;
  // player 4, alone on the other side, runs the inside route for whatever
  // is called to his side. See getSplitRoutePaths for the full mapping.
  // Always in effect (drawn and animated) regardless of Pass, since
  // receivers run their routes on every play, run or pass.
  let leftCall = 'seattle';
  let rightCall = 'seattle';
  // 4x3 removed as an option -- everything is 4x4 now.
  const defenseMode = '4x4';
  let insideOutside = 'Outside';
  // Inside Zone reads the play-side DT: lined up outside the LG -> A gap,
  // lined up inside closer to the C -> B gap. Same play call either way --
  // this just lets a coach/player flip between the two alignments to see
  // both gap reads. Only Inside Zone has this (hasReadToggle in the data).
  let readPosition = 'A';
  // Defaults to the signed-in player's own position instead of nobody --
  // see defaultHighlightForSignedInPlayer above. A manual tap on a
  // different number still works for the rest of that view; it's just
  // onComboChanged (below) that snaps it back to their own position,
  // same as every other toggle-driven reset already did before this.
  let selectedPlayer = defaultHighlightForSignedInPlayer();
  let speedMultiplier = 1;
  // Both Motion and Boot default off -- they're modifiers on top of the
  // play as authored, not a state most cards should start in.
  let motionOn = false;
  let bootOn = false;
  const isPlayingRef = { value: false };

  // FRONT
  const front = document.createElement('div');
  front.className = 'card-face card-front';
  const titleBar = document.createElement('div');
  titleBar.className = 'card-title-bar';
  front.appendChild(titleBar);

  // Two fixed rows so toggles never shift around from card to card: the
  // basics (Wing, Dir) are on every play, always top row, always in that
  // order. The second row has one dedicated slot each for In/Out, Motion,
  // Boot, and Read, in that order -- a play that doesn't have a given
  // toggle just leaves its slot empty instead of letting the others slide
  // over, so e.g. Motion always lands in the same spot whether or not the
  // card next to it has In/Out or Boot.
  const toggleRow = document.createElement('div');
  toggleRow.className = 'card-toggle-row';

  function labeledGroup(labelText, group) {
    const wrap = document.createElement('div');
    wrap.className = 'switch-control';
    const lbl = document.createElement('span');
    lbl.className = 'switch-label';
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    wrap.appendChild(group);
    return wrap;
  }

  // Formation -- Shotgun (existing, default) vs Split (new). Split's own
  // Side toggle + Pass switch share this SAME row (rather than a row of
  // their own) so switching to Split never adds an extra row of vertical
  // space above the diagram -- that used to push the field diagram down
  // far enough to get cut off on shorter screens.
  const formationRow = document.createElement('div');
  formationRow.className = 'toggle-row-basics';
  const formationToggle = buildToggleGroup('green', [
    { value: 'shotgun', label: 'Shotgun' },
    { value: 'split', label: 'Split' },
  ], formation, (v) => { if (isPlayingRef.value) return; formation = v; updateFormationRows(); onComboChanged(); });
  formationRow.appendChild(formationToggle);

  // Split Side (the signal sequence always calls the second direction as
  // whichever side is opposite this, so there's no separate Direction
  // toggle to show for Split) plus a Pass on/off switch. Off = run (normal
  // blocking, nothing extra called). On adds a randomized Pass 1/2/3 card
  // as the final signal in the sequence -- negates the run without
  // changing who's eligible; receivers run their assigned routes either
  // way. Which of the three cards shows isn't a coach-facing choice (see
  // PASS_SIGNAL_IDS above), so there's no picker.
  const splitSideToggle = buildToggleGroup('orange', [
    { value: 'Left', label: 'Split L' },
    { value: 'Right', label: 'Split R' },
  ], splitSide, (v) => { if (isPlayingRef.value) return; splitSide = v; onComboChanged(); });
  formationRow.appendChild(splitSideToggle);
  const passSwitch = buildSwitchToggle('Pass', passOn, (v) => {
    if (isPlayingRef.value) return;
    passOn = v;
    onComboChanged();
  });
  formationRow.appendChild(passSwitch);
  toggleRow.appendChild(formationRow);

  const basicsRow = document.createElement('div');
  basicsRow.className = 'toggle-row-basics';

  const wingToggle = buildToggleGroup('orange', [
    { value: 'Left', label: 'Wing L' },
    { value: 'Right', label: 'Wing R' },
  ], wingSide, (v) => { if (isPlayingRef.value) return; wingSide = v; onComboChanged(); });
  basicsRow.appendChild(wingToggle);

  const dirToggle = buildToggleGroup('black', [
    { value: 'Left', label: 'Dir L' },
    { value: 'Right', label: 'Dir R' },
  ], direction, (v) => { if (isPlayingRef.value) return; direction = v; onComboChanged(); });
  basicsRow.appendChild(dirToggle);

  toggleRow.appendChild(basicsRow);

  // Route calls -- one picker for whatever's called to the LEFT side of
  // the play, one for the RIGHT side, each independently choosing Seattle/
  // Houston/Florida. These live in the extras row below, swapped in for
  // Motion/Boot (which don't apply to Split -- renderSplitDiagram/
  // playSplitAnimation don't read either toggle) so Split never needs a
  // row of its own for them either.
  const routeCallOptions = SPLIT_ROUTE_CALLS.map(v => ({ value: v, label: SPLIT_ROUTE_LABELS[v], short: SPLIT_ROUTE_SHORT_LABELS[v] }));
  const leftCallToggle = buildToggleGroup('green', routeCallOptions, leftCall, (v) => { if (isPlayingRef.value) return; leftCall = v; onComboChanged(); }, 'toggle-tiny');
  const rightCallToggle = buildToggleGroup('brown', routeCallOptions, rightCall, (v) => { if (isPlayingRef.value) return; rightCall = v; onComboChanged(); }, 'toggle-tiny');
  const leftCallWrap = labeledGroup('Left', leftCallToggle);
  const rightCallWrap = labeledGroup('Right', rightCallToggle);
  // Label-over-pills instead of label-beside-pills -- "Left"/"Right" plus a
  // 3-option Seattle/Houston/Florida picker is too much to fit on one line
  // in these narrow slots on a phone (Nathan: "the receivers calls are too
  // wide with Left and Right and options all written in-line").
  leftCallWrap.classList.add('route-call-wrap');
  rightCallWrap.classList.add('route-call-wrap');

  const extrasRow = document.createElement('div');
  extrasRow.className = 'toggle-row-extras';

  const ioSlot = document.createElement('div');
  ioSlot.className = 'toggle-slot';
  if (combo.hasInsideOutside) {
    const ioToggle = buildToggleGroup('brown', [
      { value: 'Outside', label: 'Out' },
      { value: 'Inside', label: 'In' },
    ], insideOutside, (v) => { if (isPlayingRef.value) return; insideOutside = v; onComboChanged(); });
    ioSlot.appendChild(ioToggle);
  }
  extrasRow.appendChild(ioSlot);

  // #4 is the only player who ever goes in motion, so this is a simple
  // on/off rather than a direction pick. Every play has this slot in
  // Shotgun; in Split it's swapped out for the Left route-call picker.
  const motionSlot = document.createElement('div');
  motionSlot.className = 'toggle-slot';
  const motionToggle = buildSwitchToggle('Motion', motionOn, (v) => { if (isPlayingRef.value) return; motionOn = v; onComboChanged(); });
  motionSlot.appendChild(motionToggle);
  motionSlot.appendChild(leftCallWrap);
  extrasRow.appendChild(motionSlot);

  // Boot: QB (#1) keeps the ball instead of handing off -- everything else
  // about the play (routes, blocking) stays exactly as authored, this just
  // swaps who's carrying for this card's diagram/animation. Doesn't apply
  // to plays where #1 already has the ball or already has a built-in fake
  // (Option, Option Pass, Double Blast) -- noBoot in the data leaves this
  // slot empty rather than hiding it and letting Read slide over. In Split
  // it's swapped out for the Right route-call picker.
  const bootSlot = document.createElement('div');
  bootSlot.className = 'toggle-slot';
  let bootToggle = null;
  if (!combo.noBoot) {
    bootToggle = buildSwitchToggle('Boot', bootOn, (v) => { if (isPlayingRef.value) return; bootOn = v; onComboChanged(); });
    bootSlot.appendChild(bootToggle);
  }
  bootSlot.appendChild(rightCallWrap);
  extrasRow.appendChild(bootSlot);

  const readSlot = document.createElement('div');
  readSlot.className = 'toggle-slot';
  if (combo.hasReadToggle) {
    const readToggle = buildToggleGroup('brown', [
      { value: 'A', label: 'Read A' },
      { value: 'B', label: 'Read B' },
    ], readPosition, (v) => { if (isPlayingRef.value) return; readPosition = v; onComboChanged(); });
    readSlot.appendChild(readToggle);
  }
  extrasRow.appendChild(readSlot);

  toggleRow.appendChild(extrasRow);
  front.appendChild(toggleRow);

  function updateFormationRows() {
    const isSplit = formation === 'split';
    basicsRow.style.display = isSplit ? 'none' : '';
    splitSideToggle.style.display = isSplit ? '' : 'none';
    passSwitch.style.display = isSplit ? '' : 'none';
    motionToggle.style.display = isSplit ? 'none' : '';
    leftCallWrap.style.display = isSplit ? '' : 'none';
    if (bootToggle) bootToggle.style.display = isSplit ? 'none' : '';
    rightCallWrap.style.display = isSplit ? '' : 'none';
    // In/Out and Read don't apply to Split at all (their slots are just
    // empty placeholders there), so hide those two slots outright and let
    // Left/Right's route-call pickers each claim a full half of the row
    // instead of being squeezed into one of four equal columns.
    ioSlot.style.display = isSplit ? 'none' : '';
    readSlot.style.display = isSplit ? 'none' : '';
    extrasRow.classList.toggle('split-extras', isSplit);
    requestAnimationFrame(() => {
      [...toggleRow.querySelectorAll('.toggle-group')].forEach(g => placeToggleThumb(g));
    });
  }
  updateFormationRows();

  // Groups built above may not be in the live DOM yet (buildCard() runs
  // before the caller appends its result), so their thumbs would measure
  // 0-width if placed synchronously -- defer one frame, by which point
  // the card is guaranteed to be inserted.
  requestAnimationFrame(() => {
    [...toggleRow.querySelectorAll('.toggle-group')].forEach(g => placeToggleThumb(g));
  });

  const stageWrap = document.createElement('div');
  stageWrap.className = 'card-stage-wrap';

  const stage = svgEl('svg', {});
  stageWrap.appendChild(stage);

  function rerenderDiagram() {
    if (formation === 'split') { renderSplitDiagram(stage, combo.playKey, splitSide, insideOutside, readPosition, leftCall, rightCall, passOn, selectedPlayer); return; }
    renderCardDiagram(stage, combo.playKey, direction, wingSide, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition);
  }

  stage.addEventListener('playerclick', (ev) => {
    if (isPlayingRef.value) return;
    const n = ev.detail;
    selectedPlayer = (selectedPlayer === n) ? null : n;
    rerenderDiagram();
  });

  const controls = document.createElement('div');
  controls.className = 'card-controls';

  const playBtn = document.createElement('button');
  playBtn.className = 'card-btn play-btn';
  playBtn.innerHTML = '&#9654;';
  playBtn.addEventListener('click', () => {
    if (formation === 'split') {
      // Whatever's currently staged in stage._lastRenderedPaths plays --
      // rerenderDiagram() already picked pass-protection vs run-blocking
      // paths based on passOn, so playSplitAnimation doesn't need to know
      // which one it's animating.
      playSplitAnimation(stage, splitSide, speedMultiplier, isPlayingRef);
      return;
    }
    playCardAnimation(stage, combo.playKey, direction, wingSide, speedMultiplier, isPlayingRef, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition);
  });

  const speedToggle = document.createElement('div');
  speedToggle.className = 'speed-toggle';
  const b1 = document.createElement('button'); b1.textContent = '1x'; b1.className = 'active';
  const b2 = document.createElement('button'); b2.textContent = '½x';
  b1.addEventListener('click', () => { speedMultiplier = 1; b1.classList.add('active'); b2.classList.remove('active'); });
  b2.addEventListener('click', () => { speedMultiplier = 2; b2.classList.add('active'); b1.classList.remove('active'); });
  speedToggle.appendChild(b1); speedToggle.appendChild(b2);

  controls.appendChild(playBtn);
  controls.appendChild(speedToggle);
  stageWrap.appendChild(controls);

  const flipBtn = document.createElement('button');
  flipBtn.className = 'card-btn flip-btn';
  flipBtn.innerHTML = '&#8635;';
  flipBtn.addEventListener('click', () => { outer.classList.toggle('flipped'); if (outer.classList.contains('flipped')) startSignalSequence(); else stopSignalSequence(); });
  stageWrap.appendChild(flipBtn);

  front.appendChild(stageWrap);

  // BACK
  const back = document.createElement('div');
  back.className = 'card-face card-back';
  const signalStage = document.createElement('div');
  signalStage.className = 'signal-stage';
  const img = document.createElement('img');
  signalStage.appendChild(img);
  const label = document.createElement('div');
  label.className = 'signal-label';
  const progress = document.createElement('div');
  progress.className = 'signal-progress';

  const backFlipBtn = document.createElement('button');
  backFlipBtn.className = 'card-btn flip-btn';
  backFlipBtn.innerHTML = '&#8635;';
  backFlipBtn.addEventListener('click', () => { outer.classList.remove('flipped'); stopSignalSequence(); });

  const replayBtn = document.createElement('button');
  replayBtn.className = 'replay-btn';
  replayBtn.innerHTML = '&#8635; Replay';
  replayBtn.style.display = 'none';
  replayBtn.addEventListener('click', () => startSignalSequence());

  back.appendChild(signalStage);
  back.appendChild(label);
  back.appendChild(progress);
  back.appendChild(replayBtn);
  back.appendChild(backFlipBtn);

  let seqTimer = null;
  function startSignalSequence() {
    stopSignalSequence();
    replayBtn.style.display = 'none';
    const signals = buildSignalSequence(combo.playKey, wingSide, direction, insideOutside, motionOn, bootOn, formation, splitSide, passOn);
    progress.innerHTML = '';
    signals.forEach(() => { const d = document.createElement('div'); d.className = 'dot'; progress.appendChild(d); });
    // Longer calls (Motion and/or Boot stacked on top of In/Out) pack more
    // signals into the same sequence -- slow the pace down a bit per extra
    // signal past 4 so a 7-signal call isn't as rushed as a plain 4-signal
    // one.
    const BASE_STEP_MS = 950;
    const EXTRA_MS_PER_SIGNAL = 120;
    const stepDurationMs = BASE_STEP_MS + Math.max(0, signals.length - 4) * EXTRA_MS_PER_SIGNAL;
    const MAX_LOOPS = 2;
    let i = 0;
    let loopCount = 0;
    function showStep() {
      if (i >= signals.length) {
        i = 0;
        loopCount++;
        if (loopCount >= MAX_LOOPS) { seqTimer = null; replayBtn.style.display = 'flex'; return; }
      }
      img.src = signals[i].src;
      label.textContent = signals[i].label;
      [...progress.children].forEach((d, idx) => d.classList.toggle('done', idx <= i));
      i++;
      seqTimer = setTimeout(showStep, stepDurationMs);
    }
    showStep();
  }
  function stopSignalSequence() { if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; } }

  function onComboChanged() {
    selectedPlayer = defaultHighlightForSignedInPlayer();
    rerenderDiagram();
    let parts;
    if (formation === 'split') {
      // Split Side IS the run direction -- "Split Right, the ball is always
      // run to the right" (Nathan). The title bar names the play the same
      // way a coach would say it -- e.g. "Split Right Inside Blast Right"
      // -- so the final direction word is always appended too, and it
      // always matches splitSide (never the old, now-removed "opposite"
      // convention -- see buildSplitSignalSequence for that same fix on the
      // back-of-card verbal call). Nathan: "it isn't saying the direction.
      // needs to include the final direction... Ensure the run is always
      // going to the split side. So Split right inside blast would have to
      // be inside blast Right."
      parts = [`Split ${splitSide}`];
      if (combo.hasInsideOutside) parts.push(insideOutside);
      parts.push(combo.label);
      parts.push(splitSide);
      if (passOn) parts.push('Pass');
    } else {
      // Same order as the actual signal call: Wing side, then Motion (right
      // after the wing spot is set), then In/Out if this play has it, then
      // the play itself, then Direction, then Boot tacked on at the very end.
      parts = [`Wing ${wingSide}`];
      if (motionOn) parts.push('Motion');
      if (combo.hasInsideOutside) parts.push(insideOutside);
      parts.push(combo.label);
      parts.push(direction);
      if (bootOn) parts.push('Boot');
    }
    titleBar.textContent = parts.join(' ');
    if (outer.classList.contains('flipped')) startSignalSequence();
  }

  onComboChanged();

  inner.appendChild(front);
  inner.appendChild(back);
  outer.appendChild(inner);
  return outer;
}

// ---- Build an accordion: list of play names, tap to open/close one card at a time ----
let openAccordionItem = null;
function buildGrid() {
  const grid = document.getElementById('playCallsGrid');
  grid.innerHTML = '';
  openAccordionItem = null;
  buildPlayList().forEach(combo => {
    const item = document.createElement('div');
    item.className = 'accordion-item';

    const header = document.createElement('button');
    header.className = 'accordion-header';
    header.innerHTML = `<span>${combo.label}</span><span class="accordion-chevron">&#9660;</span>`;

    const body = document.createElement('div');
    body.className = 'accordion-body';

    header.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      if (openAccordionItem && openAccordionItem !== item) {
        openAccordionItem.classList.remove('open');
      }
      if (isOpen) {
        item.classList.remove('open');
        openAccordionItem = null;
      } else {
        if (!body.dataset.built) {
          body.dataset.built = '1';
          body.appendChild(buildCard(combo));
        }
        item.classList.add('open');
        openAccordionItem = item;
      }
    });

    item.appendChild(header);
    item.appendChild(body);
    grid.appendChild(item);
  });
}



  // Tutorial "seen" state used to live in a plain in-memory flag, so it
  // reset (and the overlay auto-popped up again) on every page reload --
  // in practice that meant almost every time a coach opened Play Calls on
  // the sideline. Persisted to localStorage instead so it only ever
  // auto-shows once per device; the "i" button (pcInfoBtn, always visible
  // at the top of the screen) remains as the on-demand way to reopen it.
  const PC_TUTORIAL_SEEN_KEY = 'aslBengalsPcTutorialSeen';
  function hasSeenPcTutorial() {
    try { return localStorage.getItem(PC_TUTORIAL_SEEN_KEY) === '1'; }
    catch (e) { return false; }
  }
  function markPcTutorialSeen() {
    try { localStorage.setItem(PC_TUTORIAL_SEEN_KEY, '1'); }
    catch (e) { /* localStorage unavailable -- just won't persist */ }
  }
  let playCallsUnlocked = false;
  let playCallsDataLoaded = false;
  // SHA-256 hash of the password, not the plaintext -- matches the pattern
  // used for the main login codes in auth.js. Still a client-side check
  // (any client-only gate is ultimately readable/bypassable via dev tools),
  // but this at least keeps the actual password out of plain view in the JS.
  const PC_PASSWORD_HASH = 'fde7fd37696f9bc49c1e13a1dae70923a5ef1dec148e1ce16d5136519dac162d';

  function proceedIntoPlayCalls() {
    const grid = document.getElementById('playCallsGrid');
    const statusEl = document.getElementById('playCallsCloudStatus');

    function finishBuilding() {
      if (!grid.dataset.built || window._playCallsShouldRebuild) {
        grid.dataset.built = '1';
        window._playCallsShouldRebuild = false;
        buildGrid();
      }
      if (!hasSeenPcTutorial()) {
        markPcTutorialSeen();
        showPcTutorialStep(0);
        document.getElementById('playCallsInfoOverlay').classList.add('show');
      }
    }

    if (playCallsDataLoaded) {
      finishBuilding();
      return;
    }
    if (statusEl) statusEl.textContent = 'Checking for the latest saved routes\u2026';
    Promise.all([
      window.firebaseAuthed(`${FIREBASE_DB_URL}/playEdits.json`).then(url => fetch(url)).then(r => r.ok ? r.json() : null),
      // Split's Houston/Seattle/Florida routes save to their own key (see
      // edit-plays.js) rather than being folded into playEdits.json's
      // bare-array shape -- fetched alongside so coach-saved route edits
      // show up here too, not just in the builder tool.
      window.firebaseAuthed(`${FIREBASE_DB_URL}/splitRouteEdits.json`).then(url => fetch(url)).then(r => r.ok ? r.json() : null),
    ])
      .then(([saved, savedSplitRoutes]) => {
        let gotAny = false;
        if (saved && Array.isArray(saved) && saved.length) {
          DATA.playTypes = normalizePlayData(saved);
          gotAny = true;
        }
        if (savedSplitRoutes && typeof savedSplitRoutes === 'object') {
          DATA.splitRoutes = repairStaleSplitRoutes(savedSplitRoutes);
          gotAny = true;
        }
        if (statusEl) statusEl.textContent = gotAny ? 'Showing the latest saved routes from the builder tool.' : 'Showing built-in default routes (no saved edits found).';
        playCallsDataLoaded = true;
        finishBuilding();
      })
      .catch(err => {
        console.error('Could not load play edits from cloud:', err);
        if (statusEl) statusEl.textContent = 'Could not reach the cloud -- showing built-in default routes.';
        playCallsDataLoaded = true;
        finishBuilding();
      });
  }

  window.initPlayCalls = function() {
    playCallsUnlocked = true;
    proceedIntoPlayCalls();
  };

  async function attemptUnlock() {
    const input = document.getElementById('pcGateInput');
    const hash = window.sha256Hex ? await window.sha256Hex(input.value) : null;
    if (hash === PC_PASSWORD_HASH) {
      playCallsUnlocked = true;
      editPlaysUnlocked = true;
      const gate = document.getElementById('playCallsGate');
      const target = gate.dataset.pendingTarget || 'playcalls';
      gate.classList.remove('show');
      if (target === 'editplays') {
        proceedIntoEditPlays();
      } else {
        proceedIntoPlayCalls();
      }
    } else {
      document.getElementById('pcGateError').textContent = 'Incorrect password.';
      input.value = '';
      input.focus();
    }
  }
  document.getElementById('pcGateSubmitBtn').addEventListener('click', attemptUnlock);
  document.getElementById('pcGateInput').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') attemptUnlock();
  });

  // ---- Play Calls tutorial: a few short steps, each with a small mock-up
  // of the real control (open a play, try a toggle, tap your number, flip
  // for the signal). Shows automatically the first time a player opens
  // Play Calls each session, and any time via the "i" button.
  // Scoped to this tutorial's own #pcTutorialSteps container -- an
  // unscoped document-wide query here used to also pick up the separate
  // welcome/crash-course popup's steps (same .pcTutorialStep class, shared
  // for consistent styling), corrupting both tutorials' step count and
  // indexing (extra dots, blank steps).
  const pcTutorialStepsContainer = document.getElementById('pcTutorialSteps') || document;
  const pcTutorialSteps = [...pcTutorialStepsContainer.querySelectorAll('.pcTutorialStep')];
  const pcTutorialDotsEl = document.getElementById('pcTutorialDots');
  const pcTutorialBackBtn = document.getElementById('pcTutorialBackBtn');
  const pcTutorialNextBtn = document.getElementById('pcTutorialNextBtn');
  pcTutorialSteps.forEach(() => {
    const d = document.createElement('div');
    d.className = 'pcTutorialDot';
    pcTutorialDotsEl.appendChild(d);
  });
  const pcTutorialDots = [...pcTutorialDotsEl.children];
  let pcTutorialIndex = 0;

  function showPcTutorialStep(i) {
    pcTutorialIndex = i;
    pcTutorialSteps.forEach((el, idx) => el.classList.toggle('active', idx === i));
    pcTutorialDots.forEach((d, idx) => d.classList.toggle('active', idx === i));
    pcTutorialBackBtn.disabled = i === 0;
    pcTutorialNextBtn.textContent = i === pcTutorialSteps.length - 1 ? "Let's go!" : 'Next';
    // The step's decorative toggle mock-up (step 2, "Try different
    // looks") reuses the real .toggle-group markup so it always matches
    // the live styling -- place its thumb now that the step is visible
    // (display:none until now means it couldn't be measured before this).
    const activeStep = pcTutorialSteps[i];
    if (activeStep) {
      [...activeStep.querySelectorAll('.toggle-group')].forEach(g => placeToggleThumb(g));
    }
  }

  pcTutorialBackBtn.addEventListener('click', () => {
    if (pcTutorialIndex > 0) showPcTutorialStep(pcTutorialIndex - 1);
  });
  pcTutorialNextBtn.addEventListener('click', () => {
    if (pcTutorialIndex < pcTutorialSteps.length - 1) {
      showPcTutorialStep(pcTutorialIndex + 1);
    } else {
      document.getElementById('playCallsInfoOverlay').classList.remove('show');
    }
  });

  document.getElementById('pcInfoBtn').addEventListener('click', () => {
    showPcTutorialStep(0);
    document.getElementById('playCallsInfoOverlay').classList.add('show');
  });
})();

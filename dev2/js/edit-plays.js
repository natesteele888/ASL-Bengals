(function() {


const BALL_COLOR = '#e0201a';
const NOBALL_COLOR = '#123a8c';
const DEFENSE_COLOR = '#e8720c';
const READKEY_COLOR = '#e0201a';
const CIRCLE_R = 36;

let wingSide = 'Left';
let playKey = DATA.playTypes[0].key;
let direction = 'Left';
let readPosition = 'A';
let insideOutside = 'Outside';

function getPlayVariant(playType, dir) {
  let v = playType.directions[dir];
  if (playType.hasInsideOutside) v = v[insideOutside];
  if (playType.hasReadToggle) v = v[readPosition];
  return v;
}
let selectedPlayer = null;
// Defaults ON. This is a session-only display toggle -- it's never saved to
// or loaded from Firebase, so it silently reset to off on every page load,
// which looked exactly like "blocking breaks after I save": no blocking
// lines drawn at all, for anyone, until someone happened to click
// Blocking: On again. Defaulting to on means what's already on the page
// (built-in or previously-saved) is visible immediately.
let blockingEnabled = true;
// Motion is a pure playback choice, exactly like Wing L/R and Dir L/R --
// never authored per play, never saved. Whatever side #4 is set on,
// turning this on always sends him to the opposite side before the snap.
// Defaults off, matching Play Calls, so what's shown out of the box
// matches the play as authored.
let motionOn = false;
let editMode = false;
let speedMultiplier = 1; // 1 = normal, 2 = half speed
let mainGroup = null;
let circlesLayerRef = null;
let lastRenderedPaths = []; // [{el, player, isBall}] -- populated on every render

// Split route editing -- entirely separate data shape from Shotgun's
// playType/direction/variant.paths (DATA.splitRoutes[side].wide/.flex[call]
// are plain absolute point arrays, not authored per play), so it gets its
// own small parallel state instead of being threaded through the Shotgun-
// specific render()/writeBackPoint() machinery above.
let editorFormation = 'shotgun'; // 'shotgun' | 'split'
let splitSide = 'Left';
let splitCall = 'seattle';
let splitEditTarget = null; // 'wide' | 'flex' | null
let splitSelectedHandle = null; // {arr, index} | null
const SPLIT_ROUTE_LABELS_EDIT = { seattle: 'Seattle', houston: 'Houston', florida: 'Florida' };

const wingToggle = document.getElementById('wingToggle');
const dirToggle = document.getElementById('dirToggle');
const playSelect = document.getElementById('playSelect');
const stage = document.getElementById('stage');

const DUPLICATE_OPTION_VALUE = '__duplicate__';

function rebuildPlaySelectOptions() {
  playSelect.innerHTML = '';
  DATA.playTypes.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.key;
    opt.textContent = p.label;
    playSelect.appendChild(opt);
  });
  const dupOpt = document.createElement('option');
  dupOpt.value = DUPLICATE_OPTION_VALUE;
  dupOpt.textContent = '+ Duplicate a play…';
  playSelect.appendChild(dupOpt);
}
rebuildPlaySelectOptions();

// Mirrors Play Calls' base signal-card mapping just enough to carry a
// signal forward when duplicating one of the 6 standard plays.
const BASE_SIGNAL_MAP = {
  inside_zone: { id: 9, label: 'Inside Zone' }, outside_zone: { id: 10, label: 'Outside Zone' },
  option: { id: 15, label: 'Option' }, option_pass: { id: 16, label: 'Option Pass' },
  blast: { id: 13, label: 'Blast' }, double_blast: { id: 14, label: 'Double Blast' },
  boot: { id: 26, label: 'Boot' },
};

// Asks which existing play to duplicate (a plain numbered prompt, matching
// the rest of this tool's lightweight prompt()-based UX rather than
// building a custom picker modal). Defaults to whichever play was open,
// so hitting Enter behaves like the old duplicate button did.
function promptForPlayToDuplicate() {
  const list = DATA.playTypes.map((p, i) => `${i + 1}. ${p.label}`).join('\n');
  const currentIdx = DATA.playTypes.findIndex(p => p.key === playKey);
  const answer = prompt(`Which play do you want to duplicate?\n\n${list}\n\nEnter a number:`, String(currentIdx + 1));
  if (!answer) return null;
  const idx = parseInt(answer, 10) - 1;
  if (isNaN(idx) || !DATA.playTypes[idx]) {
    alert('Not a valid play number -- nothing duplicated.');
    return null;
  }
  return DATA.playTypes[idx];
}

function duplicatePlay(original) {
  const newLabel = prompt('Name for the new play (e.g. "Inside Zone Wham"):', original.label + ' Copy');
  if (!newLabel || !newLabel.trim()) return;

  let baseKey = newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  let newKey = baseKey;
  let n = 2;
  while (DATA.playTypes.some(p => p.key === newKey)) { newKey = baseKey + '_' + n; n++; }

  const clone = JSON.parse(JSON.stringify(original));
  clone.key = newKey;
  clone.label = newLabel.trim();
  const carriedSignal = (original.signalCardId != null) ? { id: original.signalCardId, label: original.signalLabel }
    : BASE_SIGNAL_MAP[original.key];
  if (carriedSignal) { clone.signalCardId = carriedSignal.id; clone.signalLabel = carriedSignal.label; }

  DATA.playTypes.push(clone);
  rebuildPlaySelectOptions();
  playSelect.value = newKey;
  playKey = newKey;
  updateReadPosVisibility();
  render();
  alert('"' + clone.label + '" created as a copy of "' + original.label + '". It reuses that signal for now -- edit routes/blocking freely, then Save to Cloud when ready.');
}

function wireToggle(el, getter, setter) {
  const buttons = [...el.querySelectorAll('.toggle-btn')];
  buttons.forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.value === getter() ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if (isPlaying) return;
      setter(btn.dataset.value);
      buttons.forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
      placeToggleThumb(el);
      render();
    });
  });
  // The thumb needs real layout to measure -- some groups (readPosToggle,
  // insideOutsideToggle) start hidden (display:none) until a play with
  // that flag is selected, so this initial call is a no-op for those and
  // updateReadPosVisibility() re-calls it once they're actually shown.
  placeToggleThumb(el);
}
// Exposed globally so play-calls-quiz.js (loaded after this file) can
// reuse the exact same toggle-wiring behavior for its answer panel,
// instead of duplicating it -- this whole file is wrapped in an IIFE, so
// without this the bare name isn't reachable from other scripts.
window.wireToggle = wireToggle;

wireToggle(wingToggle, () => wingSide, v => wingSide = v);
wireToggle(dirToggle, () => direction, v => direction = v);

// Formation -- Shotgun (existing editor, unchanged above) vs Split. Split
// has no Play/Wing/Dir/Motion/Boot/Blocking/Read/In-Out/Ball-Carrier
// concept -- those controls hide, and Split Side + Route Call show instead.
const editFormationToggle = document.getElementById('editFormationToggle');
const splitSideWrap = document.getElementById('splitSideWrap');
const splitCallWrap = document.getElementById('splitCallWrap');
const editSplitSideToggle = document.getElementById('editSplitSideToggle');
const editSplitCallToggle = document.getElementById('editSplitCallToggle');
const splitEditHint = document.getElementById('splitEditHint');
const wingWrap = wingToggle.closest('.inline-control');
const dirWrap = dirToggle.closest('.inline-control');
const playWrapEl = document.getElementById('playWrap');

function updateFormationControlsVisibility() {
  const isSplit = editorFormation === 'split';
  [wingWrap, playWrapEl, dirWrap, motionToggle.closest('.inline-control'), bootToggle.closest('.inline-control'), blockingToggle.closest('.inline-control')].forEach(el => {
    if (el) el.style.display = isSplit ? 'none' : '';
  });
  splitSideWrap.style.display = isSplit ? '' : 'none';
  splitCallWrap.style.display = isSplit ? '' : 'none';
  splitEditHint.style.display = isSplit ? '' : 'none';
  playBtn.style.display = isSplit ? 'none' : '';
  if (isSplit) {
    document.getElementById('ballCarrierWrap').style.display = 'none';
    readPosGroup.style.display = 'none';
    insideOutsideGroup.style.display = 'none';
  } else {
    updateReadPosVisibility(); // restores whatever the currently selected Shotgun play needs
  }
  requestAnimationFrame(() => {
    [editFormationToggle, editSplitSideToggle, editSplitCallToggle].forEach(el => placeToggleThumb(el));
  });
}

wireToggle(editFormationToggle, () => editorFormation, v => {
  editorFormation = v;
  editTarget = null;
  selectedHandle = null;
  splitEditTarget = null;
  splitSelectedHandle = null;
  settingBallCarrier = false;
  updateFormationControlsVisibility();
});
wireToggle(editSplitSideToggle, () => splitSide, v => { splitSide = v; splitEditTarget = null; splitSelectedHandle = null; });
wireToggle(editSplitCallToggle, () => splitCall, v => { splitCall = v; splitSelectedHandle = null; });

const motionToggle = document.getElementById('motionToggle');
wireToggle(motionToggle, () => (motionOn ? 'on' : 'off'), v => motionOn = (v === 'on'));

// Boot: QB (#1) keeps the ball instead of handing off -- everything else
// about the play (routes, blocking) stays exactly as authored. Same idea
// as Motion: a pure playback toggle, nothing saved, works for any play.
let bootOn = false;
const bootToggle = document.getElementById('bootToggle');
wireToggle(bootToggle, () => (bootOn ? 'on' : 'off'), v => bootOn = (v === 'on'));

// Wherever #4 actually is at the snap -- his set wing spot, or the
// opposite one if Motion is on. Every player-4-specific point computation
// (route start, block-relative offset anchor, seam-route offset anchor)
// reads from this instead of the raw wing spot.
function p4Anchor() {
  const wingPos = DATA.wing[wingSide];
  if (!motionOn) return wingPos;
  const oppositeSide = wingSide === 'Left' ? 'Right' : 'Left';
  return DATA.wing[oppositeSide];
}
// Which side #4 is ACTUALLY standing on -- his set wing side, or the
// opposite one once Motion has sent him there. Block/seam offsets mirror
// off of this (not the raw wingSide) since the anchor itself has moved:
// using wingSide alone here left the mirror sign out of sync with
// p4Anchor() whenever Motion was on, which sent block assignments miles
// off their intended spot (occasionally clear off screen).
function p4Side() {
  if (!motionOn) return wingSide;
  return wingSide === 'Left' ? 'Right' : 'Left';
}

// 4x3 removed as an option -- everything is 4x4 now, most teams played are
// a 4x4 front and it halves the number of blocking assignments to keep up
// to date. Left as a variable (rather than ripping out every
// defenseMode === '4x4' check below) since those checks all still work
// correctly with a value that never changes.
const defenseMode = '4x4';

const insideOutsideGroup = document.getElementById('insideOutsideGroup');
const insideOutsideToggle = document.getElementById('insideOutsideToggle');
wireToggle(insideOutsideToggle, () => insideOutside, v => insideOutside = v);

// Fixes a play that was duplicated from an Inside/Outside play (Blast,
// Double Blast) but was never meant to have that toggle -- keeps whichever
// side is currently selected as the play's only routes, discards the other
// side, and removes the toggle. A regular data edit like any other; nothing
// is final until Save to Cloud.
const removeInOutBtn = document.getElementById('removeInOutBtn');
removeInOutBtn.addEventListener('click', () => {
  const playType = DATA.playTypes.find(p => p.key === playKey);
  if (!playType || !playType.hasInsideOutside) return;
  const keep = insideOutside;
  const drop = keep === 'Inside' ? 'Outside' : 'Inside';
  const ok = confirm(`Remove the Inside/Outside toggle from "${playType.label}"?\n\nThis keeps only the ${keep} routes you're currently viewing and permanently discards the ${drop} version. This can't be undone once you Save to Cloud.`);
  if (!ok) return;
  Object.keys(playType.directions).forEach(dir => {
    playType.directions[dir] = playType.directions[dir][keep];
  });
  playType.hasInsideOutside = false;
  updateReadPosVisibility();
  render();
  alert(`Done -- "${playType.label}" now always uses the ${keep} routes. Click Save to Cloud when you're ready to make this permanent.`);
});

const readPosGroup = document.getElementById('readPosGroup');
const readPosToggle = document.getElementById('readPosToggle');
wireToggle(readPosToggle, () => readPosition, v => readPosition = v);

const blockingToggle = document.getElementById('blockingToggle');
wireToggle(blockingToggle, () => (blockingEnabled ? 'on' : 'off'), v => blockingEnabled = (v === 'on'));

const editToggle = document.getElementById('editToggle');
const exportBtn = document.getElementById('exportBtn');
const saveCloudBtn = document.getElementById('saveCloudBtn');
wireToggle(editToggle, () => (editMode ? 'on' : 'off'), v => {
  editMode = (v === 'on');
  editTarget = null;
  selectedHandle = null;
  splitEditTarget = null;
  splitSelectedHandle = null;
  settingBallCarrier = false;
  exportBtn.style.display = editMode ? '' : 'none';
  saveCloudBtn.style.display = editMode ? '' : 'none';
  document.getElementById('ballCarrierWrap').style.display = (editMode && editorFormation !== 'split') ? '' : 'none';
});

document.getElementById('ballCarrierBtn').addEventListener('click', () => {
  if (!editMode) return;
  settingBallCarrier = true;
  editTarget = null; // clear any route-editing target so the click goes to carrier selection
  render();
});

const speedToggle = document.getElementById('speedToggle');
wireToggle(speedToggle, () => (speedMultiplier === 2 ? 'half' : 'normal'), v => {
  speedMultiplier = (v === 'half') ? 2 : 1;
});

exportBtn.addEventListener('click', () => {
  const modal = document.getElementById('exportModal');
  const text = document.getElementById('exportText');
  text.value = JSON.stringify({ playTypes: DATA.playTypes, splitRoutes: DATA.splitRoutes }, null, 2);
  modal.style.display = 'block';
});
document.getElementById('exportCloseBtn').addEventListener('click', () => {
  document.getElementById('exportModal').style.display = 'none';
});
document.getElementById('exportCopyBtn').addEventListener('click', () => {
  const text = document.getElementById('exportText');
  text.select();
  navigator.clipboard && navigator.clipboard.writeText(text.value).catch(() => {});
});


// Auto-heal blocking distances before every save. Older cloud saves (from
// before blocking was extended to 90% of the way to the defender) can get
// silently re-persisted by an unrelated edit+save, which is exactly what
// broke playback for the coach. Rather than trust whatever's currently
// loaded, every save recomputes each block's distance from its actual
// start point and stretches anything short back out to 90%.
function sanitizeBlockingDistances(playTypes) {
  const NEW_FRAC = 0.9;
  function dist(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1]); }
  function closest(defenders, point) {
    return defenders.reduce((best, d) => dist(d.pos, point) < dist(best.pos, point) ? d : best, defenders[0]);
  }
  playTypes.forEach(pt => {
    Object.keys(pt.directions || {}).forEach(direction => {
      const dirData = pt.directions[direction];
      const variants = pt.hasReadToggle ? [dirData.A, dirData.B].filter(Boolean)
        : pt.hasInsideOutside ? [dirData.Inside, dirData.Outside].filter(Boolean)
        : [dirData];
      variants.forEach(variant => {
        (variant.paths || []).forEach(p => {
          if (!p.isBlocking) return;
          // sameSidePoints/crossPoints (player 4's block-relative fields) store
          // an offset FROM the wing position, not an absolute field coordinate --
          // comparing those against defenders' absolute positions doesn't mean
          // anything, so only points/points4x4 (which are absolute) belong here.
          if (p.blockRelative) return;
          [['points', variant.defense], ['points4x4', variant.defense4x4]].forEach(([field, defenders]) => {
            if (!p[field] || !defenders || !defenders.length) return;
            const start = p[field][0];
            const end = p[field][1];
            const target = closest(defenders, end);
            const distToDefender = dist(target.pos, end);
            if (distToDefender > 130) return; // not actually aimed at this defender, leave alone
            const newEnd = [start[0] + NEW_FRAC*(target.pos[0]-start[0]), start[1] + NEW_FRAC*(target.pos[1]-start[1])];
            if (dist(newEnd, end) > 2) p[field] = [p[field][0], newEnd]; // only touch it if it's actually short -- keep the stored start point as-is, only fix the end
          });
        });
      });
    });
  });
  return playTypes;
}

const FIREBASE_URL = 'https://aslbengals-default-rtdb.firebaseio.com';
const cloudStatusEl = document.getElementById('cloudStatus');

// Split's Houston/Seattle/Florida routes save to their own Firebase key
// rather than being folded into playEdits.json's shape (which Play Calls
// and this tool both already expect to be a bare array of playTypes) --
// keeps this additive instead of risking the well-tested existing save/
// load path for Shotgun plays.
const SPLIT_ROUTES_URL = `${FIREBASE_URL}/splitRouteEdits.json`;

saveCloudBtn.addEventListener('click', async () => {
  saveCloudBtn.textContent = 'Saving\u2026';
  const [playsUrl, splitUrl] = await Promise.all([
    window.firebaseAuthed(`${FIREBASE_URL}/playEdits.json`),
    window.firebaseAuthed(SPLIT_ROUTES_URL),
  ]);
  Promise.all([
    fetch(playsUrl, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(sanitizeBlockingDistances(DATA.playTypes)),
    }),
    fetch(splitUrl, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(DATA.splitRoutes),
    }),
  ]).then(async ([r1, r2]) => {
    if (r1.ok && r2.ok) {
      saveCloudBtn.textContent = 'Saved!';
      cloudStatusEl.textContent = 'Showing the latest saved play edits.';
    } else {
      const failed = !r1.ok ? r1 : r2;
      const bodyText = await failed.text().catch(() => '');
      saveCloudBtn.textContent = 'Save Failed';
      cloudStatusEl.textContent = `Save failed (HTTP ${failed.status}): ${bodyText.slice(0, 200)}`;
      console.error('Save to Cloud failed:', r1.status, r2.status, bodyText);
    }
    setTimeout(() => { saveCloudBtn.textContent = 'Save to Cloud'; }, 2500);
  }).catch(err => {
    saveCloudBtn.textContent = 'Save Failed';
    cloudStatusEl.textContent = `Save failed: ${err.message}`;
    console.error('Save to Cloud failed:', err);
    setTimeout(() => { saveCloudBtn.textContent = 'Save to Cloud'; }, 2500);
  });
});

function loadSavedPlaysFromCloud() {
  return Promise.all([
    window.firebaseAuthed(`${FIREBASE_URL}/playEdits.json`).then(url => fetch(url)).then(r => r.ok ? r.json() : null),
    window.firebaseAuthed(SPLIT_ROUTES_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null),
  ]).then(([savedPlays, savedSplitRoutes]) => {
    let gotAny = false;
    if (savedPlays && Array.isArray(savedPlays) && savedPlays.length) {
      DATA.playTypes = normalizePlayData(savedPlays);
      rebuildPlaySelectOptions();
      // guard against the loaded data not including whatever play was
      // already selected (e.g. a partial save) -- fall back to the first
      // available play rather than crashing on an undefined lookup
      if (!DATA.playTypes.some(p => p.key === playKey)) {
        playKey = DATA.playTypes[0].key;
        playSelect.value = playKey;
      }
      gotAny = true;
    }
    if (savedSplitRoutes && typeof savedSplitRoutes === 'object') {
      // repairStaleSplitRoutes (play-calls.js) now unconditionally forces
      // the Right side's Seattle/Houston/Florida routes back to the shipped
      // (correct) shapes, regardless of whatever's actually sitting in this
      // cloud snapshot -- see the comment on that function for why. Applying
      // it here too, not just in the read-only Play Calls view, means this
      // editor will always show Right's routes correctly, but it ALSO means
      // any future point-drag edit to Right's Seattle/Houston/Florida made
      // in here and saved to cloud will look right for the rest of THIS
      // session but get silently overwritten back to shipped on the next
      // load -- Right's side of this editor is effectively read-only via
      // the cloud path until this override is intentionally removed. Left's
      // routes are unaffected and still fully editable/persistable as
      // before.
      DATA.splitRoutes = repairStaleSplitRoutes(savedSplitRoutes);
      gotAny = true;
    }
    cloudStatusEl.textContent = gotAny ? 'Showing the latest saved play edits.' : 'No saved edits found -- showing the built-in defaults.';
  }).catch(() => {
    cloudStatusEl.textContent = 'Could not reach the cloud -- showing the built-in defaults.';
  });
}

function updateReadPosVisibility() {
  const playType = DATA.playTypes.find(p => p.key === playKey);
  readPosGroup.style.display = playType.hasReadToggle ? 'flex' : 'none';
  insideOutsideGroup.style.display = playType.hasInsideOutside ? 'flex' : 'none';
  // These groups start hidden (display:none), so their thumb couldn't be
  // measured correctly by wireToggle()'s initial call -- re-place it now
  // that they're actually laid out, whenever they're shown.
  if (playType.hasReadToggle) placeToggleThumb(readPosToggle);
  if (playType.hasInsideOutside) placeToggleThumb(insideOutsideToggle);
  // Boot doesn't make sense on plays where #1 already has the ball or
  // already has a built-in fake (Option, Option Pass, Double Blast) --
  // hide the toggle and force it back off so a swap from a previously
  // selected play can't silently carry over onto one where it's a no-op.
  const bootAllowed = !playType.noBoot;
  bootToggle.parentElement.style.display = bootAllowed ? 'flex' : 'none';
  if (!bootAllowed && bootOn) {
    bootOn = false;
    [...bootToggle.querySelectorAll('.toggle-btn')].forEach(b => b.setAttribute('aria-pressed', b.dataset.value === 'off' ? 'true' : 'false'));
    placeToggleThumb(bootToggle);
  } else if (bootAllowed) {
    placeToggleThumb(bootToggle);
  }
}

playSelect.addEventListener('change', () => {
  if (isPlaying) return;
  if (playSelect.value === DUPLICATE_OPTION_VALUE) {
    playSelect.value = playKey; // snap the dropdown back before the prompt opens
    const original = promptForPlayToDuplicate();
    if (original) duplicatePlay(original);
    return;
  }
  playKey = playSelect.value;
  updateReadPosVisibility();
  render();
});

function selectPlayer(n) {
  if (isPlaying) return;
  if (settingBallCarrier && editMode) {
    const variant = getPlayVariant(DATA.playTypes.find(p => p.key === playKey), direction);
    variant.paths.forEach(p => { if (p.player !== null && !p.optionLine) p.ball = false; });
    const targetPath = variant.paths.find(p => p.player === n && !p.optionLine);
    if (targetPath) targetPath.ball = true;
    settingBallCarrier = false;
    render();
    return;
  }
  if (editMode) {
    editTarget = (editTarget && editTarget.player === n) ? null : { player: n };
    selectedHandle = null;
    selectedPlayer = n; // keep the route visible/highlighted while editing it
    render();
    return;
  }
  selectedPlayer = (selectedPlayer === n) ? null : n;
  render();
}

function selectOLineBlocker(id) {
  if (isPlaying || !editMode) return;
  editTarget = (editTarget && editTarget.id === id) ? null : { id };
  selectedHandle = null;
  render();
}

const playBtn = document.getElementById('playBtn');
const ANIMATE_MS = 1400;
const PAUSE_MS = 500;
let isPlaying = false;

function setControlsDisabled(disabled) {
  [wingToggle, dirToggle, motionToggle, bootToggle, blockingToggle, speedToggle].forEach(el => {
    [...el.querySelectorAll('.toggle-btn')].forEach(b => b.disabled = disabled);
  });
  playSelect.disabled = disabled;
  playBtn.disabled = disabled;
  playBtn.style.opacity = disabled ? 0.6 : 1;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function tweenPoint(fromPt, toPt, durationMs, onFrame) {
  return new Promise(resolve => {
    const start = Date.now();
    function step() {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      onFrame({ x: fromPt.x + (toPt.x - fromPt.x) * t, y: fromPt.y + (toPt.y - fromPt.y) * t });
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

function animateBallAlongPath(pathEl, durationMs, onFrame) {
  return new Promise(resolve => {
    const totalLen = pathEl.getTotalLength();
    const start = Date.now();
    function step() {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const pt = pathEl.getPointAtLength(t * totalLen);
      onFrame(pt);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

// Draws a path on progressively (stroke-dashoffset) while sliding its
// arrowhead along the growing tip, instead of a static SVG marker that
// would just sit at the endpoint from the very start.
function animatePathDraw(pathEl, arrowEl, durationMs, delayMs, circleEl, textEl) {
  return new Promise(resolve => {
    const totalLen = pathEl.getTotalLength();
    pathEl.style.strokeDasharray = totalLen;
    pathEl.style.strokeDashoffset = totalLen;
    if (arrowEl) arrowEl.style.opacity = 0;
    setTimeout(() => {
      const start = Date.now();
      function step() {
        const t = Math.min(1, (Date.now() - start) / durationMs);
        pathEl.style.strokeDashoffset = totalLen * (1 - t);
        if (arrowEl) {
          arrowEl.style.opacity = t > 0.02 ? 1 : 0;
          placeArrowAtFraction(arrowEl, pathEl, t);
        }
        if (circleEl) {
          const pt = pathEl.getPointAtLength(t * totalLen);
          circleEl.setAttribute('cx', pt.x);
          circleEl.setAttribute('cy', pt.y);
          if (textEl) { textEl.setAttribute('x', pt.x); textEl.setAttribute('y', pt.y + 12); }
        }
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    }, delayMs || 0);
  });
}

async function playSequence() {
  if (isPlaying) return;
  isPlaying = true;
  setControlsDisabled(true);
  playBtn.textContent = '\u25B6 Playing\u2026';

  const animMs = ANIMATE_MS * speedMultiplier;
  const pauseMs = PAUSE_MS * speedMultiplier;

  selectedPlayer = null;
  render(); // full opacity, nothing dimmed -- we're watching the whole play develop

  // the football -- starts at the snap (Center), goes to the QB, then
  // travels to and tracks whoever actually carries it. Inserted BEHIND the
  // circles layer so it renders under a player's circle while possessed,
  // instead of floating on top of it.
  const ball = svgEl('ellipse', {rx:34, ry:21, fill:'#7a4a24', stroke:'#f4e9dc', 'stroke-width':3});
  const centerPos = { x: DATA.formation['C'][0], y: DATA.formation['C'][1] };
  const qbPos = { x: DATA.backfield['1'][0], y: DATA.backfield['1'][1] };
  ball.setAttribute('cx', centerPos.x);
  ball.setAttribute('cy', centerPos.y);
  mainGroup.insertBefore(ball, circlesLayerRef);

  await wait(250 * speedMultiplier); // beat before the snap, like a cadence
  await tweenPoint(centerPos, qbPos, 450 * speedMultiplier, pt => {
    ball.setAttribute('cx', pt.x);
    ball.setAttribute('cy', pt.y);
  });
  await wait(150 * speedMultiplier);

  // draw every path -- this is the play actually happening. Each path can
  // carry its own delay (e.g. Double Blast's QB starts after the blockers,
  // since he's following behind them, not moving in lockstep).
  const pathPromises = lastRenderedPaths.map(({el, arrowEl, delayMs, circleEl, textEl}) =>
    animatePathDraw(el, arrowEl, animMs, (delayMs || 0) * speedMultiplier, circleEl, textEl));

  const ballPathEntry = lastRenderedPaths.find(p => p.isBall);
  const BALL_OFFSET_X = 0, BALL_OFFSET_Y = 50; // peeks out below the circle, clear of the number
  if (ballPathEntry && ballPathEntry.circleEl) {
    await wait((ballPathEntry.delayMs || 0) * speedMultiplier);
    // travel to wherever the carrier's circle actually is right now (it may
    // already be moving), then track it exactly -- guarantees the ball and
    // the circle never drift apart, since it's reading the same live position.
    const carrierCircle = ballPathEntry.circleEl;
    const liveStart = {
      x: Number(carrierCircle.getAttribute('cx')) + BALL_OFFSET_X,
      y: Number(carrierCircle.getAttribute('cy')) + BALL_OFFSET_Y,
    };
    await tweenPoint(qbPos, liveStart, 200 * speedMultiplier, pt => {
      ball.setAttribute('cx', pt.x);
      ball.setAttribute('cy', pt.y);
    });
    let tracking = true;
    function trackCarrier() {
      if (!tracking) return;
      ball.setAttribute('cx', Number(carrierCircle.getAttribute('cx')) + BALL_OFFSET_X);
      ball.setAttribute('cy', Number(carrierCircle.getAttribute('cy')) + BALL_OFFSET_Y);
      requestAnimationFrame(trackCarrier);
    }
    trackCarrier();
    await wait(animMs);
    tracking = false;
    // snap to the final resting position exactly, in case a frame was missed
    ball.setAttribute('cx', Number(carrierCircle.getAttribute('cx')) + BALL_OFFSET_X);
    ball.setAttribute('cy', Number(carrierCircle.getAttribute('cy')) + BALL_OFFSET_Y);
  } else {
    await wait(animMs);
  }
  await Promise.all(pathPromises);

  await wait(pauseMs);
  ball.remove();

  setControlsDisabled(false);
  playBtn.textContent = '\u25B6 Play';
  isPlaying = false;
}
playBtn.addEventListener('click', playSequence);

function quadPathD(points) {
  const [[x0,y0],[x1,y1],[x2,y2]] = points;
  return `M ${x0} ${y0} Q ${x1} ${y1} ${x2} ${y2}`;
}
function straightPathD(points) {
  const [[x0,y0],[x1,y1]] = points;
  return `M ${x0} ${y0} L ${x1} ${y1}`;
}
function lineThenCurvePathD(points) {
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] = points;
  return `M ${x0} ${y0} L ${x1} ${y1} Q ${x2} ${y2} ${x3} ${y3}`;
}
function multiCurvePathD(points) {
  // 5 points: start, control1, midpoint (on-curve), control2, end --
  // two chained quadratic beziers, for routes that need to duck under/over
  // multiple obstacles rather than one simple arc.
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3],[x4,y4]] = points;
  return `M ${x0} ${y0} Q ${x1} ${y1} ${x2} ${y2} Q ${x3} ${y3} ${x4} ${y4}`;
}

// Places an arrowhead polygon at a given fraction (0-1) along a path,
// oriented along the path's direction of travel there -- this is what
// lets the arrowhead slide along with the line as it draws, instead of
// sitting fixed at the endpoint the whole time like an SVG marker would.
function placeArrowAtFraction(arrowEl, pathEl, fraction) {
  const totalLen = pathEl.getTotalLength();
  const dist = Math.max(0, Math.min(totalLen, fraction * totalLen));
  const pt = pathEl.getPointAtLength(dist);
  const behind = pathEl.getPointAtLength(Math.max(0, dist - 2));
  const angle = Math.atan2(pt.y - behind.y, pt.x - behind.x) * 180 / Math.PI;
  arrowEl.setAttribute('transform', `translate(${pt.x},${pt.y}) rotate(${angle})`);
}

// Which end-cap a path's line should draw: 'run' (arrowhead, the existing
// default) means the player keeps running that direction past this point;
// 'block' (a straight perpendicular T-bar) means they plant and block right
// there. A coach can set this explicitly per path in the editor (p.endType);
// if it's never been touched, it falls back to whatever isBlocking already
// implied, so old saved data keeps drawing exactly like it always did.
function endTypeFor(p) {
  return p.endType || (p.isBlocking ? 'block' : 'run');
}

// Builds the actual end-cap SVG element for a path -- an arrowhead polygon
// for 'run', or a short perpendicular bar for 'block'. Both are positioned
// identically via placeArrowAtFraction (translate to the point + rotate to
// the direction of travel there), so the T-bar automatically ends up
// perpendicular to the route without any extra math.
function buildEndCapEl(endType, color, width) {
  if (endType === 'block') {
    const barLen = Math.max(13, width * 2.2);
    return svgEl('line', {
      x1: 0, y1: -barLen / 2, x2: 0, y2: barLen / 2,
      stroke: color, 'stroke-width': Math.max(6, width + 2), 'stroke-linecap': 'round',
    });
  }
  return svgEl('polygon', {points: '-2,-11 20,0 -2,11', fill: color});
}

function svgPointFromEvent(ev) {
  const pt = stage.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  const ctm = mainGroup.getScreenCTM();
  if (!ctm) return {x: 0, y: 0};
  const local = pt.matrixTransform(ctm.inverse());
  return {x: local.x, y: local.y};
}

function getBlockFieldKey() {
  const sameSide = p4Side() === direction;
  const base = sameSide ? 'sameSidePoints' : 'crossPoints';
  return (defenseMode === '4x4') ? base + '4x4' : base;
}

// Old saved data (from before same-side/cross-side blocking was independent)
// only has points/points4x4. Rather than crash on the missing field, migrate
// it in-memory the first time it's touched, so old cloud saves keep working.
function getBlockPoints(p) {
  const fieldKey = getBlockFieldKey();
  if (!p[fieldKey]) {
    const fallback = defenseMode === '4x4' ? (p.points4x4 || p.points) : p.points;
    p.sameSidePoints = p.sameSidePoints || p.points || fallback;
    p.crossPoints = p.crossPoints || p.points || fallback;
    p.sameSidePoints4x4 = p.sameSidePoints4x4 || p.points4x4 || fallback;
    p.crossPoints4x4 = p.crossPoints4x4 || p.points4x4 || fallback;
  }
  return p[fieldKey];
}

function getAbsolutePoints(p) {
  // mirrors the same substitution logic used in render() for player 4's
  // special path types, so chip-block math can read the CURRENT on-screen
  // points without duplicating render()'s full pipeline
  if (p.dualSideBlock) {
    // Not anchored to #4 at all -- a fixed-position blocker (e.g. a TE)
    // whose block TARGET flips between two authored options depending on
    // whether the wing is on the same side as the play's direction or not.
    // getBlockFieldKey()/getBlockPoints() already do exactly this same-side/
    // cross-side lookup for #4's blockRelative paths -- reused as-is here
    // since both are just "pick sameSidePoints or crossPoints".
    return getBlockPoints(p);
  }
  if (p.player === 4 && !p.optionLine) {
    const anchor = p4Anchor();
    if (p.blockRelative) {
      const [dx, dy] = getBlockPoints(p)[1];
      const sign = p4Side() === 'Left' ? 1 : -1;
      return [anchor, [anchor[0] + sign * dx, anchor[1] + dy]];
    } else if (p.wingSeamRelative) {
      const sameSide = p4Side() === direction;
      const offsets = sameSide ? p.sameSideOffsets : p.crossOffsets;
      const sign = p4Side() === 'Left' ? 1 : -1;
      return offsets.map(([dx, dy]) => [anchor[0] + sign * dx, anchor[1] + dy]);
    }
    return [anchor, ...p.points.slice(1)];
  }
  return p.points;
}

function applyChipBlock(p, defenderId, variant) {
  const abs = getAbsolutePoints(p);
  const start = abs[0];
  const after = abs[2] || abs[abs.length - 1];
  if (!defenderId) {
    // no chip -- straighten the early part back to a simple, direct line
    const mid = [(start[0] + after[0]) / 2, (start[1] + after[1]) / 2];
    writeBackPoint(p, 1, mid[0], mid[1]);
    return;
  }
  const d = getActiveDefenseArr(variant).find(x => x.id === defenderId);
  if (!d) return;
  const frac = 0.5; // brief chip -- only swings partway toward him, then releases
  const chipPt = [start[0] + frac*(d.pos[0]-start[0]), start[1] + frac*(d.pos[1]-start[1])];
  writeBackPoint(p, 1, chipPt[0], chipPt[1]);
}

function writeBackPoint(p, idx, absX, absY) {
  const anchor = p4Anchor();
  if (p.dualSideBlock) {
    // Absolute coordinates, not #4-anchor-relative -- just write straight
    // into whichever of sameSidePoints/crossPoints is currently showing.
    getBlockPoints(p); // ensures the field exists (migrates old data if needed)
    const fieldKey = getBlockFieldKey();
    p[fieldKey][idx] = [absX, absY];
  } else if (p.blockRelative) {
    if (idx === 0) return; // start always tracks the wing circle itself
    const sign = p4Side() === 'Left' ? 1 : -1;
    getBlockPoints(p); // ensures the field exists (migrates old data if needed)
    const fieldKey = getBlockFieldKey();
    p[fieldKey][1] = [(absX - anchor[0]) / sign, absY - anchor[1]];
  } else if (p.wingSeamRelative) {
    if (idx === 0) return;
    const sameSide = p4Side() === direction;
    const offsets = sameSide ? p.sameSideOffsets : p.crossOffsets;
    const sign = p4Side() === 'Left' ? 1 : -1;
    offsets[idx] = [(absX - anchor[0]) / sign, absY - anchor[1]];
  } else if (p.player === 4 && !p.optionLine) {
    if (idx === 0) return;
    p.points[idx] = [absX, absY];
  } else {
    p.points[idx] = [absX, absY];
  }
}

function getEditablePointsArray(p) {
  // returns the actual mutable array backing this path's points, for add/remove
  if (p.blockRelative || p.dualSideBlock || (p.player === 4 && p.wingSeamRelative)) return null; // structurally fixed, no add/remove
  return p.points;
}

// selectedHandle: {pathData, pointIndex} -- the point awaiting a placement click
let selectedHandle = null;
// editTarget: {player} | {id} -- which blocker/route is currently being configured in edit mode
let editTarget = null;
let settingBallCarrier = false;

const DEFENDER_IDS_4x3 = ['DE_L','DT_L','DT_R','DE_R','OLB_L','MLB','OLB_R','CB_L','CB_R','FS','SS'];
const DEFENDER_IDS_4x4 = ['DE_L','DT_L','DT_R','DE_R','LB1','LB2','LB3','LB4','CB_L','CB_R','FS'];
function getDefenderIds() {
  return defenseMode === '4x4' ? DEFENDER_IDS_4x4 : DEFENDER_IDS_4x3;
}
function getActiveDefenseArr(variant) {
  return (defenseMode === '4x4' && variant.defense4x4) ? variant.defense4x4 : variant.defense;
}

function assignBlockerToDefender(p, blockerStart, defenderId, variant) {
  const d = getActiveDefenseArr(variant).find(d => d.id === defenderId);
  if (!d) return;
  const frac = 0.9;
  const actualStart = p.blockRelative ? p4Anchor() : blockerStart;
  const end = [actualStart[0] + frac*(d.pos[0]-actualStart[0]), actualStart[1] + frac*(d.pos[1]-actualStart[1])];
  if (p.blockRelative) {
    const anchor = p4Anchor();
    const sign = p4Side() === 'Left' ? 1 : -1;
    const fieldKey = getBlockFieldKey();
    p[fieldKey] = [[0,0], [(end[0]-anchor[0])/sign, end[1]-anchor[1]]];
  } else if (p.dualSideBlock) {
    // Reassigning only updates whichever same-side/cross-side variant is
    // currently showing -- the other one (the play run the opposite way
    // relative to the wing) keeps whatever it was already set to.
    const fieldKey = getBlockFieldKey();
    p[fieldKey] = [blockerStart.slice(), end];
  } else {
    const targetKey = defenseMode === '4x4' ? 'points4x4' : 'points';
    p[targetKey] = [blockerStart.slice(), end];
  }
}

stage.addEventListener('click', (ev) => {
  if (!editMode) return;
  const target = ev.target;
  if (target.classList && target.classList.contains('edit-handle')) return; // handled by its own listener
  if (editorFormation === 'split') {
    if (splitSelectedHandle) {
      const local = svgPointFromEvent(ev);
      splitSelectedHandle.arr[splitSelectedHandle.index] = [local.x, local.y];
      splitSelectedHandle = null;
      render();
      return;
    }
    if (splitEditTarget) {
      splitEditTarget = null;
      render();
    }
    return;
  }
  if (selectedHandle) {
    // clicked empty canvas while a handle is selected -> move it here
    const local = svgPointFromEvent(ev);
    writeBackPoint(selectedHandle.pathData, selectedHandle.pointIndex, local.x, local.y);
    selectedHandle = null;
    render();
    return;
  }
  // clicked empty canvas with nothing picked -> back out of editing this player
  if (editTarget) {
    editTarget = null;
    render();
  }
});

function findEditTargetPath(variant) {
  if (!editTarget) return null;
  return variant.paths.find(p => {
    if (editTarget.player !== undefined) return p.player === editTarget.player && p.player !== null;
    if (editTarget.id !== undefined) return p.id === editTarget.id;
    return false;
  }) || null;
}

const editToolbar = document.getElementById('editToolbar');
const assignPanel = document.getElementById('assignPanel');
const assignLabel = document.getElementById('assignLabel');
const endTypePanel = document.getElementById('endTypePanel');
const endTypeRunBtn = document.getElementById('endTypeRunBtn');
const endTypeBlockBtn = document.getElementById('endTypeBlockBtn');

function updateEditUI(variant) {
  const addPointBtn = document.getElementById('addPointBtn');
  if (!editMode || !editTarget) {
    editToolbar.style.display = 'none';
    assignPanel.style.display = 'none';
    endTypePanel.style.display = 'none';
    return;
  }
  editToolbar.style.display = 'flex'; // Done Editing is always available once a target is picked
  const p = findEditTargetPath(variant);
  if (!p) {
    addPointBtn.style.display = 'none';
    assignPanel.style.display = 'none';
    endTypePanel.style.display = 'none';
    return;
  }

  const editableArr = getEditablePointsArray(p);
  addPointBtn.style.display = editableArr ? '' : 'none';

  // End cap (Run arrow / Block T-bar) -- available for any real drawn path,
  // independent of the assign-panel's own tap-a-defender/chip-block flow
  // below. optionLine/fake paths never draw a cap at all (see render()), so
  // there's nothing useful to toggle for those.
  if (!p.optionLine && !p.fake) {
    endTypePanel.style.display = 'flex';
    const et = endTypeFor(p);
    endTypeRunBtn.classList.toggle('active', et === 'run');
    endTypeBlockBtn.classList.toggle('active', et === 'block');
  } else {
    endTypePanel.style.display = 'none';
  }

  if (p.isBlocking) {
    assignPanel.style.display = 'flex';
    const who = editTarget.player !== undefined ? `#${editTarget.player}` : editTarget.id;
    assignLabel.textContent = `${who} blocks: tap a defender on the field`;
    [...assignPanel.querySelectorAll('button')].forEach(b => b.remove());
  } else if ([4,5,6].includes(editTarget.player)) {
    // a real route (going out for a pass) -- offer a quick chip block on
    // the way, which only nudges the early part of the route and leaves
    // the release/pattern itself alone
    assignPanel.style.display = 'flex';
    assignLabel.textContent = `#${editTarget.player} chip block: tap a defender on the field, then release`;
    [...assignPanel.querySelectorAll('button')].forEach(b => b.remove());
    const noneBtn = document.createElement('button');
    noneBtn.textContent = 'No Chip';
    noneBtn.addEventListener('click', () => {
      applyChipBlock(p, null, variant);
      selectedHandle = null;
      render();
    });
    assignPanel.appendChild(noneBtn);
  } else {
    assignPanel.style.display = 'none';
  }
}

function setEditTargetEndType(newEndType) {
  const playType = DATA.playTypes.find(pt => pt.key === playKey);
  const variant = getPlayVariant(playType, direction);
  const p = findEditTargetPath(variant);
  if (!p) return;
  p.endType = newEndType;
  render();
}
endTypeRunBtn.addEventListener('click', () => setEditTargetEndType('run'));
endTypeBlockBtn.addEventListener('click', () => setEditTargetEndType('block'));

document.getElementById('doneEditingBtn').addEventListener('click', () => {
  editTarget = null;
  selectedHandle = null;
  splitEditTarget = null;
  splitSelectedHandle = null;
  render();
});

document.getElementById('addPointBtn').addEventListener('click', () => {
  if (editorFormation === 'split') {
    if (!splitEditTarget) return;
    const routeData = DATA.splitRoutes && DATA.splitRoutes[splitSide];
    const arr = routeData && routeData[splitEditTarget] && routeData[splitEditTarget][splitCall];
    if (!arr) return;
    const insertAfter = splitSelectedHandle && splitSelectedHandle.arr === arr ? splitSelectedHandle.index : arr.length - 1;
    const a = arr[insertAfter];
    const b = arr[Math.min(insertAfter + 1, arr.length - 1)];
    const mid = [(a[0]+b[0])/2, (a[1]+b[1])/2 - 20];
    arr.splice(insertAfter + 1, 0, mid);
    splitSelectedHandle = null;
    render();
    return;
  }
  const playType = DATA.playTypes.find(p => p.key === playKey);
  const variant = getPlayVariant(playType, direction);
  const p = findEditTargetPath(variant);
  if (!p) return;
  const arr = getEditablePointsArray(p);
  if (!arr) return;
  const insertAfter = selectedHandle && selectedHandle.pathData === p ? selectedHandle.pointIndex : arr.length - 1;
  const a = arr[insertAfter];
  const b = arr[Math.min(insertAfter + 1, arr.length - 1)];
  const mid = [(a[0]+b[0])/2, (a[1]+b[1])/2 - 20];
  arr.splice(insertAfter + 1, 0, mid);
  selectedHandle = null;
  render();
});
// ---- Split route editor: an entirely separate render path from Shotgun's
// render() below. DATA.splitRoutes[side].wide/.flex[call] are plain
// absolute point arrays (no blockRelative/dualSideBlock/wingSeamRelative
// special-casing like Shotgun's player-4 paths have), so editing them just
// means mutating that array directly -- same drag-a-handle / add-point /
// delete-point interactions as the Shotgun editor, reimplemented small and
// self-contained rather than threaded through render()'s Shotgun-specific
// logic. Player 4's route isn't shown here -- it's automatically re-derived
// (reanchored) from the flex route on the opposite side, not stored data
// of its own, so there's nothing to edit for him directly. ----
function renderSplitEditor() {
  const [vw, vh] = DATA.viewBox;
  stage.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  stage.innerHTML = '';
  stage.appendChild(svgEl('rect', {x:0, y:0, width:'100%', height:'100%', fill:'#ffffff'}));

  const g = svgEl('g', {transform: `translate(0,${DATA.topPad})`});
  const pathsLayer = svgEl('g', {});
  const circlesLayer = svgEl('g', {});
  const handlesLayer = svgEl('g', {});
  const pos = DATA.split[splitSide];

  function drawCircle(x, y, label, fontSize, r, stroke) {
    stroke = stroke || '#111111';
    const wrap = svgEl('g', {});
    const circleEl = svgEl('circle', {cx:x, cy:y, r: r || CIRCLE_R, fill:'#ffffff', stroke, 'stroke-width':8});
    wrap.appendChild(circleEl);
    const t = svgEl('text', {x, y:y+12, 'font-size':fontSize, 'font-weight':900, 'font-style':'italic',
      'text-anchor':'middle', fill:stroke});
    t.textContent = label;
    wrap.appendChild(t);
    return wrap;
  }

  ['LT','LG','C','RG','RT'].forEach(k => {
    circlesLayer.appendChild(drawCircle(DATA.formation[k][0], DATA.formation[k][1], k, 22));
  });

  const wideNum = splitSide === 'Right' ? 6 : 5;
  const flexNum = splitSide === 'Right' ? 2 : 3;
  ['5', '6', '3', '4', '1', '2'].forEach(num => {
    const role = (Number(num) === wideNum) ? 'wide' : (Number(num) === flexNum) ? 'flex' : null;
    const isTarget = role && splitEditTarget === role;
    const stroke = isTarget ? '#1a8c3a' : '#111111';
    const c = drawCircle(pos[num][0], pos[num][1], num, 34, null, stroke);
    if (role && editMode) {
      c.style.cursor = 'pointer';
      c.addEventListener('click', (ev) => {
        ev.stopPropagation();
        splitEditTarget = (splitEditTarget === role) ? null : role;
        splitSelectedHandle = null;
        render();
      });
    }
    circlesLayer.appendChild(c);
  });

  function drawRoute(role, arr, color) {
    if (!arr || !arr.length) return;
    const d = arr.length === 5 ? multiCurvePathD(arr) : (arr.length === 2 ? straightPathD(arr) : quadPathD(arr));
    const path = svgEl('path', {d, fill:'none', stroke: color, 'stroke-width': 7, 'stroke-linecap': 'round'});
    pathsLayer.appendChild(path);
    const arrowEl = buildEndCapEl('run', color, 7);
    pathsLayer.appendChild(arrowEl);
    placeArrowAtFraction(arrowEl, path, 1);

    if (editMode && splitEditTarget === role) {
      const guideD = arr.map((pt, i) => (i === 0 ? 'M' : 'L') + ` ${pt[0]} ${pt[1]}`).join(' ');
      handlesLayer.appendChild(svgEl('path', {d: guideD, class: 'edit-handle-line'}));
      arr.forEach((pt, idx) => {
        const isPicked = splitSelectedHandle && splitSelectedHandle.arr === arr && splitSelectedHandle.index === idx;
        const h = svgEl('circle', {cx: pt[0], cy: pt[1], r: isPicked ? 19 : 16,
          class: 'edit-handle' + (isPicked ? ' picked' : '')});
        h.addEventListener('click', (ev) => {
          ev.stopPropagation();
          splitSelectedHandle = isPicked ? null : { arr, index: idx };
          render();
        });
        handlesLayer.appendChild(h);

        if (isPicked && arr.length > 2) {
          const bx = pt[0] + 26, by = pt[1] - 26;
          const delBadge = svgEl('g', {});
          delBadge.appendChild(svgEl('circle', {cx:bx, cy:by, r:15, fill:'#e0201a', stroke:'#fff', 'stroke-width':2}));
          const xMark = svgEl('text', {x:bx, y:by+6, 'font-size':18, 'font-weight':900, 'text-anchor':'middle', fill:'#fff'});
          xMark.textContent = '✕';
          delBadge.appendChild(xMark);
          delBadge.addEventListener('click', (ev) => {
            ev.stopPropagation();
            arr.splice(idx, 1);
            splitSelectedHandle = null;
            render();
          });
          handlesLayer.appendChild(delBadge);
        }
        if (isPicked) {
          const ax = pt[0] - 26, ay = pt[1] - 26;
          const addBadge = svgEl('g', {});
          addBadge.appendChild(svgEl('circle', {cx:ax, cy:ay, r:15, fill:'#1a8c3a', stroke:'#fff', 'stroke-width':2}));
          const plusMark = svgEl('text', {x:ax, y:ay+6, 'font-size':20, 'font-weight':900, 'text-anchor':'middle', fill:'#fff'});
          plusMark.textContent = '+';
          addBadge.appendChild(plusMark);
          addBadge.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const a = arr[idx];
            const b = arr[Math.min(idx + 1, arr.length - 1)];
            const mid = [(a[0]+b[0])/2, (a[1]+b[1])/2 - 20];
            arr.splice(idx + 1, 0, mid);
            splitSelectedHandle = null;
            render();
          });
          handlesLayer.appendChild(addBadge);
        }
      });
    }
  }

  const routeData = DATA.splitRoutes && DATA.splitRoutes[splitSide];
  if (routeData) {
    drawRoute('wide', routeData.wide && routeData.wide[splitCall], NOBALL_COLOR);
    drawRoute('flex', routeData.flex && routeData.flex[splitCall], BALL_COLOR);
  }

  g.appendChild(pathsLayer);
  g.appendChild(circlesLayer);
  g.appendChild(handlesLayer);
  circlesLayerRef = circlesLayer;
  mainGroup = g;
  stage.appendChild(g);

  const title = svgEl('text', {x:vw/2, y:vh-30, 'font-size':44, 'font-weight':900, 'font-style':'italic',
    'text-anchor':'middle', fill:'#111111'});
  title.textContent = `SPLIT ${splitSide.toUpperCase()} – ${SPLIT_ROUTE_LABELS_EDIT[splitCall].toUpperCase()}`;
  stage.appendChild(title);

  const addPointBtn = document.getElementById('addPointBtn');
  if (!editMode || !splitEditTarget) {
    editToolbar.style.display = 'none';
    assignPanel.style.display = 'none';
    endTypePanel.style.display = 'none';
  } else {
    editToolbar.style.display = 'flex';
    addPointBtn.style.display = '';
    assignPanel.style.display = 'none'; // no blocking/chip-block concept for a route
    endTypePanel.style.display = 'none'; // routes are always a run-style arrow here, no T-bar concept
  }
}

function render() {
  if (editorFormation === 'split') { renderSplitEditor(); return; }
  const playType = DATA.playTypes.find(p => p.key === playKey);
  const variant = getPlayVariant(playType, direction);

  // Boot: swap which path is treated as the ball carrier, purely for this
  // render/animation -- doesn't touch the play data, so nothing else about
  // the play (routes, blocking, everyone else's paths) changes. No-op if
  // #1 already has the ball (e.g. Option).
  let bootBallPath = null, bootFakePath = null;
  if (bootOn) {
    const realBallPath = variant.paths.find(p => p.ball && !p.optionLine);
    const qbPath = variant.paths.find(p => p.player === 1 && !p.optionLine && !p.ball);
    if (realBallPath && qbPath) { bootBallPath = qbPath; bootFakePath = realBallPath; }
  }

  const ballCarrierBtn = document.getElementById('ballCarrierBtn');
  if (ballCarrierBtn) {
    ballCarrierBtn.textContent = settingBallCarrier ? 'Tap a player…' : 'Ball Carrier';
    ballCarrierBtn.classList.toggle('active', settingBallCarrier);
  }
  const [vw, vh] = DATA.viewBox;
  stage.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  stage.innerHTML = '';
  stage.appendChild(svgEl('rect', {x:0, y:0, width:'100%', height:'100%', fill:'#ffffff'}));

  const g = svgEl('g', {transform: `translate(0,${DATA.topPad})`});
  const pathsLayer = svgEl('g', {});
  const circlesLayer = svgEl('g', {});
  const handlesLayer = svgEl('g', {});
  const anyPlayerSelected = selectedPlayer !== null;

  function drawCircle(x, y, label, stroke, fontSize, dim, r, playerNum) {
    r = r || CIRCLE_R;
    const wrap = svgEl('g', {class: dim ? 'dimmed' : 'full-op'});
    const circleEl = svgEl('circle', {cx:x, cy:y, r, fill:'#ffffff', stroke, 'stroke-width':8});
    wrap.appendChild(circleEl);
    const t = svgEl('text', {x, y:y+12, 'font-size':fontSize, 'font-weight':900, 'font-style':'italic',
      'text-anchor':'middle', fill:stroke});
    t.textContent = label;
    wrap.appendChild(t);
    wrap.circleEl = circleEl;
    wrap.textEl = t;
    if (playerNum !== undefined) {
      wrap.classList.add('player-circle');
      wrap.addEventListener('click', (ev) => { ev.stopPropagation(); selectPlayer(playerNum); });
    }
    return wrap;
  }
  const playerCircles = {}; // player number (string) -> {circleEl, textEl, startX, startY}

  // defense -- now dims too when a player is selected ("D" per the request)
  const activeDefense = (defenseMode === '4x4' && variant.defense4x4) ? variant.defense4x4 : variant.defense;
  const assignablePath = (editMode && editTarget) ? findEditTargetPath(variant) : null;
  const isAssignableBlock = assignablePath && assignablePath.isBlocking;
  const isAssignableChip = assignablePath && !assignablePath.isBlocking && [4,5,6].includes(editTarget && editTarget.player);
  activeDefense.forEach(d => {
    const isReadKey = variant.readKeyId && d.id === variant.readKeyId;
    const stroke = isReadKey ? READKEY_COLOR : DEFENSE_COLOR;
    const r = d.extra ? 30 : CIRCLE_R;
    const fs = d.extra ? 22 : 26;
    const defCircle = drawCircle(d.pos[0], d.pos[1], d.label, stroke, fs, anyPlayerSelected, r);
    if (isAssignableBlock || isAssignableChip) {
      defCircle.style.cursor = 'pointer';
      defCircle.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (isAssignableBlock) {
          const blockerStart = assignablePath.blockRelative ? [0,0] : assignablePath.points[0];
          assignBlockerToDefender(assignablePath, blockerStart, d.id, variant);
        } else {
          applyChipBlock(assignablePath, d.id, variant);
        }
        selectedHandle = null;
        render();
      });
    }
    circlesLayer.appendChild(defCircle);
    if (isReadKey) {
      const bx = d.pos[0] + 44, by = d.pos[1] - 40;
      const badge = svgEl('g', {class: anyPlayerSelected ? 'dimmed' : 'full-op'});
      badge.appendChild(svgEl('circle', {cx:bx, cy:by, r:28, fill:READKEY_COLOR, stroke:'#fff', 'stroke-width':3}));
      const bt = svgEl('text', {x:bx, y:by+10, 'font-size':34, 'font-weight':900, 'text-anchor':'middle', fill:'#fff'});
      bt.textContent = 'R';
      badge.appendChild(bt);
      circlesLayer.appendChild(badge);
    }
  });

  // formation (O-line + 5/6) -- now dims too ("line" per the request)
  const c5Dim = anyPlayerSelected && selectedPlayer !== 5;
  const c5 = drawCircle(DATA.formation['5'][0], DATA.formation['5'][1], '5', '#111111', 34, c5Dim, null, 5);
  circlesLayer.appendChild(c5);
  playerCircles['5'] = c5;
  ['LT','LG','C','RG','RT'].forEach(k => {
    const dimOLine = anyPlayerSelected || (editMode && editTarget && !(editTarget.id === k));
    const c = drawCircle(DATA.formation[k][0], DATA.formation[k][1], k, '#111111', 22, dimOLine);
    if (editMode) {
      c.classList.add('player-circle');
      c.addEventListener('click', (ev) => { ev.stopPropagation(); selectOLineBlocker(k); });
    }
    circlesLayer.appendChild(c);
    playerCircles[k] = c;
  });
  const c6Dim = anyPlayerSelected && selectedPlayer !== 6;
  const c6 = drawCircle(DATA.formation['6'][0], DATA.formation['6'][1], '6', '#111111', 34, c6Dim, null, 6);
  circlesLayer.appendChild(c6);
  playerCircles['6'] = c6;

  // wing (#4) -- position depends on wingSide, independent of play direction.
  // Motion is a pure playback choice (like Wing/Dir) -- if it's on, he's
  // drawn at the opposite wing spot instead, and everything below anchors
  // off that same spot so his route/blocking math stays correct.
  const wingPos = DATA.wing[wingSide];
  const p4Pos = p4Anchor();
  const wingDim = anyPlayerSelected && selectedPlayer !== 4;
  const c4 = drawCircle(p4Pos[0], p4Pos[1], '4', '#111111', 34, wingDim, null, 4);
  circlesLayer.appendChild(c4);
  playerCircles['4'] = c4;

  // motion path -- dotted line from #4's real lineup spot to the opposite
  // side, always visible whenever Motion is on so it's clear at a glance.
  if (motionOn) {
    const motionLine = svgEl('path', {
      d: `M ${wingPos[0]} ${wingPos[1]} L ${p4Pos[0]} ${p4Pos[1]}`,
      fill: 'none', stroke: '#111111', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': '3 12',
    });
    circlesLayer.appendChild(motionLine);
  }

  // backfield (#3, #1, #2) -- always fixed positions
  ['3','1','2'].forEach(num => {
    const dim = anyPlayerSelected && String(selectedPlayer) !== num;
    const c = drawCircle(DATA.backfield[num][0], DATA.backfield[num][1], num, '#111111', 34, dim, null, Number(num));
    circlesLayer.appendChild(c);
    playerCircles[num] = c;
  });

  // paths -- appended to a layer placed BEHIND the circles layer, so a
  // player's number stays readable as their circle slides across a line.
  lastRenderedPaths = [];
  const animatePaths = [];
  variant.paths.forEach(p => {
    if (p.isBlocking && !blockingEnabled) return;
    const isSelected = anyPlayerSelected && p.player === selectedPlayer;
    const dim = anyPlayerSelected && (p.player === null || p.player !== selectedPlayer);
    const wrap = svgEl('g', {class: dim ? 'dimmed' : 'full-op'});

    // #4's own position depends on the Wing Side toggle, independent of the
    // play data -- so his path (if any) always starts from wherever he's
    // actually standing, not a coordinate baked into the play. Blocking
    // paths for #4 also need their END point computed relative to his live
    // position, since which defender he's nearest to depends on wing side.
    let points = (defenseMode === '4x4' && p.isBlocking && !p.blockRelative && !p.dualSideBlock && p.points4x4) ? p.points4x4 : p.points;
    if (p.dualSideBlock) {
      // Fixed-position blocker (e.g. the Option play's playside TE) whose
      // block target depends on whether the wing is on the same side as the
      // play's direction or the opposite side -- see getBlockFieldKey().
      points = getBlockPoints(p);
    } else if (p.player === 4 && !p.optionLine) {
      if (p.blockRelative) {
        const [dx, dy] = getBlockPoints(p)[1];
        const sign = p4Side() === 'Left' ? 1 : -1; // offset authored assuming Left; mirror for Right
        points = [p4Pos, [p4Pos[0] + sign * dx, p4Pos[1] + dy]];
      } else if (p.wingSeamRelative) {
        // Two shapes, both authored assuming Wing Left as the base: one for
        // when he's on the SAME side as the play's direction (stays on his
        // own side, attacks the near safety), one for when he's on the
        // OPPOSITE side (a genuine crossing route to match the QB). This
        // has to key off #4's ACTUAL side -- his set wing side, or the
        // opposite one if Motion has sent him there -- not the raw wing
        // side setting. Otherwise Motion just mirrors the same-side route
        // instead of switching to the crossing route, sending him away
        // from the pass action instead of into it. Mirror (flip dx)
        // whenever he's actually standing on the right.
        const sameSide = p4Side() === direction;
        const offsets = sameSide ? p.sameSideOffsets : p.crossOffsets;
        const sign = p4Side() === 'Left' ? 1 : -1;
        points = offsets.map(([dx, dy]) => [p4Pos[0] + sign * dx, p4Pos[1] + dy]);
      } else {
        points = [p4Pos, ...points.slice(1)];
      }
    }

    const matchesEditTarget = editTarget && (
      (editTarget.player !== undefined && p.player === editTarget.player && p.player !== null) ||
      (editTarget.id !== undefined && p.id === editTarget.id)
    );
    const showHandles = editMode && matchesEditTarget;
    if (showHandles && !p.optionLine) {
      const guideD = points.map((pt,i) => (i===0?'M':'L') + ` ${pt[0]} ${pt[1]}`).join(' ');
      handlesLayer.appendChild(svgEl('path', {d: guideD, class: 'edit-handle-line'}));
      const editableArrForP = getEditablePointsArray(p);
      points.forEach((pt, idx) => {
        const isPicked = selectedHandle && selectedHandle.pathData === p && selectedHandle.pointIndex === idx;
        const h = svgEl('circle', {cx: pt[0], cy: pt[1], r: isPicked ? 19 : 16,
          class: 'edit-handle' + (isPicked ? ' picked' : '')});
        h.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (isPicked) {
            selectedHandle = null; // tap again to deselect
          } else {
            selectedHandle = { pathData: p, pointIndex: idx };
          }
          render();
        });
        handlesLayer.appendChild(h);

        // contextual delete badge, right next to the currently-picked point --
        // easier to find on mobile than a toolbar button elsewhere on screen
        if (isPicked && editableArrForP && editableArrForP.length > 2) {
          const bx = pt[0] + 26, by = pt[1] - 26;
          const delBadge = svgEl('g', {});
          delBadge.appendChild(svgEl('circle', {cx:bx, cy:by, r:15, fill:'#e0201a', stroke:'#fff', 'stroke-width':2}));
          const xMark = svgEl('text', {x:bx, y:by+6, 'font-size':18, 'font-weight':900, 'text-anchor':'middle', fill:'#fff'});
          xMark.textContent = '\u2715';
          delBadge.appendChild(xMark);
          delBadge.addEventListener('click', (ev) => {
            ev.stopPropagation();
            editableArrForP.splice(idx, 1);
            selectedHandle = null;
            render();
          });
          handlesLayer.appendChild(delBadge);
        }
        if (isPicked && editableArrForP) {
          const ax = pt[0] - 26, ay = pt[1] - 26;
          const addBadge = svgEl('g', {});
          addBadge.appendChild(svgEl('circle', {cx:ax, cy:ay, r:15, fill:'#1a8c3a', stroke:'#fff', 'stroke-width':2}));
          const plusMark = svgEl('text', {x:ax, y:ay+6, 'font-size':20, 'font-weight':900, 'text-anchor':'middle', fill:'#fff'});
          plusMark.textContent = '+';
          addBadge.appendChild(plusMark);
          addBadge.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const a = editableArrForP[idx];
            const b = editableArrForP[Math.min(idx + 1, editableArrForP.length - 1)];
            const mid = [(a[0]+b[0])/2, (a[1]+b[1])/2 - 20];
            editableArrForP.splice(idx + 1, 0, mid);
            selectedHandle = null;
            render();
          });
          handlesLayer.appendChild(addBadge);
        }
      });
    }

    if (p.optionLine) {
      const [[x1,y1],[x2,y2]] = p.points;
      const path = svgEl('path', {d:`M ${x1} ${y1} L ${x2} ${y2}`, fill:'none', stroke:'#555555',
        'stroke-width':p.width, 'stroke-linecap':'round', 'stroke-dasharray':'9 7'});
      wrap.appendChild(path);
      pathsLayer.appendChild(wrap);
      return;
    }

    const effectiveBall = p === bootBallPath ? true : (p === bootFakePath ? false : p.ball);
    const color = effectiveBall ? BALL_COLOR : NOBALL_COLOR;
    const d = p.lineThenCurve ? lineThenCurvePathD(points) : (points.length === 5 ? multiCurvePathD(points) : (points.length === 2 ? straightPathD(points) : quadPathD(points)));
    const attrs = {d, fill:'none', stroke:color, 'stroke-width':p.width, 'stroke-linecap':'round'};
    if (p.fake) attrs['stroke-dasharray'] = '10 8';
    const path = svgEl('path', attrs);
    wrap.appendChild(path);

    let arrowEl = null;
    if (!p.fake) {
      arrowEl = buildEndCapEl(endTypeFor(p), color, p.width);
      wrap.appendChild(arrowEl);
      placeArrowAtFraction(arrowEl, path, 1); // static: sits at the finished tip until animated
    }

    pathsLayer.appendChild(wrap);

    const ownerKey = p.player !== null ? String(p.player) : p.id;
    const ownerCircle = (ownerKey && !p.fake) ? playerCircles[ownerKey] : null;
    lastRenderedPaths.push({el: path, arrowEl, player: p.player, isBall: effectiveBall,
      delayMs: p.delayMs || 0, circleEl: ownerCircle ? ownerCircle.circleEl : null,
      textEl: ownerCircle ? ownerCircle.textEl : null});
    if (isSelected) animatePaths.push({el: path, arrowEl,
      circleEl: ownerCircle ? ownerCircle.circleEl : null, textEl: ownerCircle ? ownerCircle.textEl : null});
  });

  g.appendChild(pathsLayer);
  g.appendChild(circlesLayer);
  g.appendChild(handlesLayer);
  circlesLayerRef = circlesLayer;
  mainGroup = g;
  stage.appendChild(g);

  const title = svgEl('text', {x:vw/2, y:vh-30, 'font-size':44, 'font-weight':900, 'font-style':'italic',
    'text-anchor':'middle', fill:'#111111'});
  title.textContent = `WING ${wingSide.toUpperCase()}` + (motionOn ? ' MOTION' : '') +
    ` ${playType.label.toUpperCase()} ${direction.toUpperCase()}` + (bootOn ? ' BOOT' : '');
  stage.appendChild(title);


  animatePaths.forEach(({el, arrowEl, circleEl, textEl}) => {
    animatePathDraw(el, arrowEl, ANIMATE_MS, 0, circleEl, textEl);
  });

  updateEditUI(variant);
}



window.initEditPlays = function() {
  playSelect.value = playKey;
  updateReadPosVisibility();
  render();
  loadSavedPlaysFromCloud().then(() => {
    updateReadPosVisibility();
    render();
  });
};
})();

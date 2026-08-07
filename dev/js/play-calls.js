// Play/formation data now lives in data/plays.json, fetched by the loader in
// index.html before any of these scripts run -- same timing as the old
// inline `let DATA = {...}` blob. Declared here at top level (not inside the
// IIFE below) because edit-plays.js also reads this same DATA variable.
let DATA = window.DATA;

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
  (playTypes || []).forEach(pt => {
    Object.values(pt.directions || {}).forEach(dirVal => {
      const variants = (dirVal.paths) ? [dirVal] : Object.values(dirVal);
      variants.forEach(variant => {
        if (!variant) return;
        if (variant.readKeyId === undefined) variant.readKeyId = null;
        (variant.paths || []).forEach(p => {
          if (p.player === undefined) p.player = null;
        });
      });
    });
  });
  return playTypes;
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
// [{value, label}, {value, label}], `initialValue` picks which one starts
// pressed, and `onChange(value)` fires on every click (including re-clicks
// of the already-active button, same as the old .active-class toggles did).
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
const INSIDE_SIGNAL_ID = 1;  // reuses the "1 finger" image -- Inside
const OUTSIDE_SIGNAL_ID = 5; // reuses the "2 fingers" image -- Outside
const PLAY_TYPE_SIGNAL_ID = {
  inside_zone: 9, outside_zone: 10, option: 15, option_pass: 16, blast: 13, double_blast: 14,
};
const PLAY_TYPE_SIGNAL_LABEL = {
  inside_zone: 'Inside Zone', outside_zone: 'Outside Zone', option: 'Option',
  option_pass: 'Option Pass', blast: 'Blast', double_blast: 'Double Blast',
};
// Two different real signals both mean "motion is on" -- picking randomly
// between them (same idea as the finger-count randomization below) keeps
// the defense from pattern-reading a single fixed sign. Boot only has one
// dedicated card.
const MOTION_SIGNAL_IDS = [11, 12];
const BOOT_SIGNAL_ID = 26;

function randomFingerId(side, exclude) {
  const pool = side === 'Right' ? FINGER_RIGHT_IDS : FINGER_LEFT_IDS;
  const options = exclude !== undefined ? pool.filter(id => id !== exclude) : pool;
  return options[Math.floor(Math.random() * options.length)];
}

function buildSignalSequence(playKey, wingSide, direction, insideOutside, motionOn, bootOn) {
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
  if (playKey === 'blast') {
    const ioId = insideOutside === 'Inside' ? INSIDE_SIGNAL_ID : OUTSIDE_SIGNAL_ID;
    signals.push({ src: SIGNAL_CARDS[ioId], label: insideOutside === 'Inside' ? 'Inside' : 'Outside' });
    signals.push({ src: SIGNAL_CARDS[playSignalId], label: playSignalLabel });
  } else if (playKey === 'double_blast') {
    signals.push({ src: SIGNAL_CARDS[playSignalId], label: playSignalLabel });
    if (insideOutside === 'Outside') {
      signals.push({ src: SIGNAL_CARDS[PLAY_TYPE_SIGNAL_ID['outside_zone']], label: 'Outside Zone' });
    }
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
  const anySelected = selectedPlayer !== null;
  const wingPos = DATA.wing[wingSide];
  const activeDefense = (defenseMode === '4x4' && variant.defense4x4) ? variant.defense4x4 : variant.defense;

  function drawCircle(x, y, label, stroke, fontSize, dim, r, playerNum) {
    r = r || CIRCLE_R;
    const wrap = svgEl('g', { class: dim ? 'dimmed' : 'full-op' });
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

  activeDefense.forEach(d => {
    const isReadKey = variant.readKeyId && d.id === variant.readKeyId;
    const stroke = isReadKey ? READKEY_COLOR : DEFENSE_COLOR;
    const r = CIRCLE_R;
    const fs = 26;
    circlesLayer.appendChild(drawCircle(d.pos[0], d.pos[1], d.label, stroke, fs, anySelected, r));
  });

  const c5Dim = anySelected && selectedPlayer !== 5;
  const c5 = drawCircle(DATA.formation['5'][0], DATA.formation['5'][1], '5', '#111', 34, c5Dim, null, 5);
  circlesLayer.appendChild(c5); playerCircles['5'] = c5;
  ['LT','LG','C','RG','RT'].forEach(k => {
    const c = drawCircle(DATA.formation[k][0], DATA.formation[k][1], k, '#111', 22, false);
    circlesLayer.appendChild(c); playerCircles[k] = c;
  });
  const c6Dim = anySelected && selectedPlayer !== 6;
  const c6 = drawCircle(DATA.formation['6'][0], DATA.formation['6'][1], '6', '#111', 34, c6Dim, null, 6);
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

  const wingDim = anySelected && selectedPlayer !== 4;
  const c4 = drawCircle(p4Anchor[0], p4Anchor[1], '4', '#111', 34, wingDim, null, 4);
  circlesLayer.appendChild(c4); playerCircles['4'] = c4;

  if (motionOn) {
    circlesLayer.appendChild(svgEl('path', {
      d: `M ${wingPos[0]} ${wingPos[1]} L ${p4Anchor[0]} ${p4Anchor[1]}`,
      fill: 'none', stroke: '#111', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': '3 12',
    }));
  }

  ['3','1','2'].forEach(num => {
    const dim = anySelected && String(selectedPlayer) !== num;
    const c = drawCircle(DATA.backfield[num][0], DATA.backfield[num][1], num, '#111', 34, dim, null, Number(num));
    circlesLayer.appendChild(c); playerCircles[num] = c;
  });

  const lastRenderedPaths = [];
  variant.paths.forEach(p => {
    const isSelected = anySelected && p.player === selectedPlayer;
    const dim = anySelected && !p.isBlocking && (p.player === null || p.player !== selectedPlayer);
    const wrap = svgEl('g', { class: dim ? 'dimmed' : 'full-op' });

    let points = (defenseMode === '4x4' && p.isBlocking && !p.blockRelative && p.points4x4) ? p.points4x4 : p.points;
    if (p.player === 4 && !p.optionLine) {
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
      arrowEl = svgEl('polygon', { points: '-2,-11 20,0 -2,11', fill: color });
      wrap.appendChild(arrowEl);
      placeArrowAtFraction(arrowEl, path, 1);
    }
    pathsLayer.appendChild(wrap);

    const ownerKey = p.player !== null ? String(p.player) : p.id;
    const ownerCircle = (ownerKey && !p.fake) ? playerCircles[ownerKey] : null;
    lastRenderedPaths.push({ el: path, arrowEl, player: p.player, isBall: effectiveBall, isBlocking: !!p.isBlocking, delayMs: p.delayMs || 0,
      circleEl: ownerCircle ? ownerCircle.circleEl : null, textEl: ownerCircle ? ownerCircle.textEl : null });
  });

  g.appendChild(pathsLayer);
  g.appendChild(circlesLayer);
  stage.appendChild(g);

  stage._mainGroup = g;
  stage._circlesLayerRef = circlesLayer;
  stage._lastRenderedPaths = lastRenderedPaths;
}

// ---- Play the animation for a card ----
async function playCardAnimation(stage, playKey, direction, wingSide, speedMultiplier, isPlayingRef, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition) {
  if (isPlayingRef.value) return;
  isPlayingRef.value = true;
  renderCardDiagram(stage, playKey, direction, wingSide, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition);

  const animMs = 1400 * speedMultiplier;
  const mainGroup = stage._mainGroup;
  const circlesLayerRef = stage._circlesLayerRef;
  const allPaths = stage._lastRenderedPaths;
  // if a player is selected, animate his path plus all blocking (blocking
  // supports the play regardless of which skill player is being isolated);
  // otherwise animate everyone
  const lastRenderedPaths = selectedPlayer === null
    ? allPaths
    : allPaths.filter(p => p.player === selectedPlayer || p.isBlocking);

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
    const p4Entry = lastRenderedPaths.find(p => p.player === 4) || allPaths.find(p => p.player === 4);
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

// ---- Build a single flip-card ----
function buildCard(combo) {
  const outer = document.createElement('div');
  outer.className = 'card-outer';
  const inner = document.createElement('div');
  inner.className = 'card-inner';

  let wingSide = 'Left';
  let direction = 'Left';
  // 4x3 removed as an option -- everything is 4x4 now.
  const defenseMode = '4x4';
  let insideOutside = 'Outside';
  // Inside Zone reads the play-side DT: lined up outside the LG -> A gap,
  // lined up inside closer to the C -> B gap. Same play call either way --
  // this just lets a coach/player flip between the two alignments to see
  // both gap reads. Only Inside Zone has this (hasReadToggle in the data).
  let readPosition = 'A';
  let selectedPlayer = null;
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

  const toggleRow = document.createElement('div');
  toggleRow.className = 'card-toggle-row';

  if (combo.hasInsideOutside) {
    const ioToggle = buildToggleGroup('brown', [
      { value: 'Outside', label: 'Out' },
      { value: 'Inside', label: 'In' },
    ], insideOutside, (v) => { if (isPlayingRef.value) return; insideOutside = v; onComboChanged(); });
    toggleRow.appendChild(ioToggle);
  }

  if (combo.hasReadToggle) {
    const readToggle = buildToggleGroup('brown', [
      { value: 'A', label: 'Read A' },
      { value: 'B', label: 'Read B' },
    ], readPosition, (v) => { if (isPlayingRef.value) return; readPosition = v; onComboChanged(); });
    toggleRow.appendChild(readToggle);
  }

  const wingToggle = buildToggleGroup('orange', [
    { value: 'Left', label: 'Wing L' },
    { value: 'Right', label: 'Wing R' },
  ], wingSide, (v) => { if (isPlayingRef.value) return; wingSide = v; onComboChanged(); });
  toggleRow.appendChild(wingToggle);

  // #4 is the only player who ever goes in motion, so this is a simple
  // on/off rather than a direction pick -- sits between Wing and Dir since
  // it's part of the pre-snap picture, same as the wing spot.
  const motionToggle = buildToggleGroup('green', [
    { value: 'off', label: 'Motion Off' },
    { value: 'on', label: 'Motion On' },
  ], motionOn ? 'on' : 'off', (v) => { if (isPlayingRef.value) return; motionOn = (v === 'on'); onComboChanged(); });
  toggleRow.appendChild(motionToggle);

  const dirToggle = buildToggleGroup('black', [
    { value: 'Left', label: 'Dir L' },
    { value: 'Right', label: 'Dir R' },
  ], direction, (v) => { if (isPlayingRef.value) return; direction = v; onComboChanged(); });
  toggleRow.appendChild(dirToggle);

  // Boot: QB (#1) keeps the ball instead of handing off -- everything else
  // about the play (routes, blocking) stays exactly as authored, this just
  // swaps who's carrying for this card's diagram/animation. Doesn't apply
  // to plays where #1 already has the ball or already has a built-in fake
  // (Option, Option Pass, Double Blast) -- noBoot in the data hides it.
  if (!combo.noBoot) {
    const bootToggle = buildToggleGroup('red', [
      { value: 'off', label: 'Boot Off' },
      { value: 'on', label: 'Boot On' },
    ], bootOn ? 'on' : 'off', (v) => { if (isPlayingRef.value) return; bootOn = (v === 'on'); onComboChanged(); });
    toggleRow.appendChild(bootToggle);
  }

  front.appendChild(toggleRow);

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

  function rerenderDiagram() { renderCardDiagram(stage, combo.playKey, direction, wingSide, selectedPlayer, defenseMode, insideOutside, motionOn, bootOn, readPosition); }

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
    const signals = buildSignalSequence(combo.playKey, wingSide, direction, insideOutside, motionOn, bootOn);
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
    selectedPlayer = null;
    rerenderDiagram();
    // Same order as the actual signal call: Wing side, then Motion (right
    // after the wing spot is set), then In/Out if this play has it, then
    // the play itself, then Direction, then Boot tacked on at the very end.
    const parts = [`Wing ${wingSide}`];
    if (motionOn) parts.push('Motion');
    if (combo.hasInsideOutside) parts.push(insideOutside);
    parts.push(combo.label);
    parts.push(direction);
    if (bootOn) parts.push('Boot');
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



  let playCallsSeenThisSession = false;
  let playCallsUnlocked = false;
  let playCallsDataLoaded = false;
  const PC_PASSWORD = 'FrontSeat';

  function proceedIntoPlayCalls() {
    const grid = document.getElementById('playCallsGrid');
    const statusEl = document.getElementById('playCallsCloudStatus');

    function finishBuilding() {
      if (!grid.dataset.built || window._playCallsShouldRebuild) {
        grid.dataset.built = '1';
        window._playCallsShouldRebuild = false;
        buildGrid();
      }
      if (!playCallsSeenThisSession) {
        playCallsSeenThisSession = true;
        showPcTutorialStep(0);
        document.getElementById('playCallsInfoOverlay').classList.add('show');
      }
    }

    if (playCallsDataLoaded) {
      finishBuilding();
      return;
    }
    if (statusEl) statusEl.textContent = 'Checking for the latest saved routes\u2026';
    fetch(`${FIREBASE_DB_URL}/playEdits.json`)
      .then(r => r.ok ? r.json() : null)
      .then(saved => {
        if (saved && Array.isArray(saved) && saved.length) {
          DATA.playTypes = normalizePlayData(saved);
          if (statusEl) statusEl.textContent = 'Showing the latest saved routes from the builder tool.';
        } else {
          if (statusEl) statusEl.textContent = 'Showing built-in default routes (no saved edits found).';
        }
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

  function attemptUnlock() {
    const input = document.getElementById('pcGateInput');
    if (input.value === PC_PASSWORD) {
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
  const pcTutorialSteps = [...document.querySelectorAll('.pcTutorialStep')];
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

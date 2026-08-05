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

function getVariant(playType, direction, insideOutside) {
  let v = playType.directions[direction];
  if (playType.hasInsideOutside) v = v[insideOutside || 'Outside'];
  if (playType.hasReadToggle) v = v['A'];
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
    .map(playType => ({ playKey: playType.key, label: playType.label, hasInsideOutside: !!playType.hasInsideOutside }));
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

function randomFingerId(side, exclude) {
  const pool = side === 'Right' ? FINGER_RIGHT_IDS : FINGER_LEFT_IDS;
  const options = exclude !== undefined ? pool.filter(id => id !== exclude) : pool;
  return options[Math.floor(Math.random() * options.length)];
}

function buildSignalSequence(playKey, wingSide, direction, insideOutside) {
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
  return signals;
}

// ---- Render a card's diagram into its SVG stage ----
function renderCardDiagram(stage, playKey, direction, wingSide, selectedPlayer, defenseMode, insideOutside) {
  stage.innerHTML = '';
  const playType = DATA.playTypes.find(p => p.key === playKey);
  const variant = getVariant(playType, direction, insideOutside);
  const vw = DATA.viewBox[0], vh = DATA.viewBox[1];
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

  const wingDim = anySelected && selectedPlayer !== 4;
  const p4MotionPath = variant.paths.find(p => p.player === 4 && !p.optionLine && p.hasMotion && p.motionEnd);
  const p4CirclePos = p4MotionPath ? p4MotionPath.motionEnd : wingPos;
  const c4 = drawCircle(p4CirclePos[0], p4CirclePos[1], '4', '#111', 34, wingDim, null, 4);
  circlesLayer.appendChild(c4); playerCircles['4'] = c4;

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
        const sameSide = wingSide === direction;
        const offsets = sameSide ? p.sameSideOffsets : p.crossOffsets;
        const sign = wingSide === 'Left' ? 1 : -1;
        points = offsets.map(([dx, dy]) => [wingPos[0] + sign * dx, wingPos[1] + dy]);
      } else if (p.blockRelative) {
        const sameSide = wingSide === direction;
        const baseKey = sameSide ? 'sameSidePoints' : 'crossPoints';
        const fieldKey = defenseMode === '4x4' ? baseKey + '4x4' : baseKey;
        const srcPoints = p[fieldKey] || p.points;
        const [dx, dy] = srcPoints[1];
        const sign = wingSide === 'Left' ? 1 : -1;
        points = [wingPos, [wingPos[0] + sign * dx, wingPos[1] + dy]];
      } else {
        const motionStart = (p.hasMotion && p.motionEnd) ? p.motionEnd : wingPos;
        points = [motionStart, ...points.slice(1)];
      }
    }
    if (p.optionLine) {
      const [[x1,y1],[x2,y2]] = p.points;
      const path = svgEl('path', { d: `M ${x1} ${y1} L ${x2} ${y2}`, fill: 'none', stroke: '#555', 'stroke-width': p.width, 'stroke-linecap': 'round', 'stroke-dasharray': '9 7' });
      wrap.appendChild(path);
      pathsLayer.appendChild(wrap);
      return;
    }

    const color = p.isBlocking ? '#e8720c' : (p.ball ? BALL_COLOR : NOBALL_COLOR);
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
    lastRenderedPaths.push({ el: path, arrowEl, player: p.player, isBall: !!p.ball, isBlocking: !!p.isBlocking, delayMs: p.delayMs || 0,
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
async function playCardAnimation(stage, playKey, direction, wingSide, speedMultiplier, isPlayingRef, selectedPlayer, defenseMode, insideOutside) {
  if (isPlayingRef.value) return;
  isPlayingRef.value = true;
  renderCardDiagram(stage, playKey, direction, wingSide, selectedPlayer, defenseMode, insideOutside);

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

  // Pre-snap motion: if #4 is set to motion, he's already drawn at his
  // motionEnd spot (so his route/blocking math is correct from the start).
  // For the animation specifically, temporarily snap him back to his real
  // lineup spot and let him visibly run the motion before the snap --
  // otherwise "motion" would look identical to just picking the other wing.
  const motionPlayType = DATA.playTypes.find(p => p.key === playKey);
  const motionVariant = getVariant(motionPlayType, direction, insideOutside);
  const motionPath = (motionVariant.paths || []).find(p => p.player === 4 && !p.optionLine && p.hasMotion && p.motionEnd);
  if (motionPath) {
    const p4Entry = lastRenderedPaths.find(p => p.player === 4) || allPaths.find(p => p.player === 4);
    if (p4Entry && p4Entry.circleEl) {
      const startPos = { x: DATA.wing[wingSide][0], y: DATA.wing[wingSide][1] };
      const endPos = { x: motionPath.motionEnd[0], y: motionPath.motionEnd[1] };
      p4Entry.circleEl.setAttribute('cx', startPos.x); p4Entry.circleEl.setAttribute('cy', startPos.y);
      if (p4Entry.textEl) { p4Entry.textEl.setAttribute('x', startPos.x); p4Entry.textEl.setAttribute('y', startPos.y + 12); }
      await tweenPoint(startPos, endPos, 900 * speedMultiplier, pt => {
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
  let defenseMode = '4x3';
  let insideOutside = 'Outside';
  let selectedPlayer = null;
  let speedMultiplier = 1;
  const isPlayingRef = { value: false };

  // FRONT
  const front = document.createElement('div');
  front.className = 'card-face card-front';
  const titleBar = document.createElement('div');
  titleBar.className = 'card-title-bar';
  front.appendChild(titleBar);

  const toggleRow = document.createElement('div');
  toggleRow.className = 'card-toggle-row';

  const defToggle = document.createElement('div');
  defToggle.className = 'def-toggle';
  const def3 = document.createElement('button'); def3.textContent = '4x3'; def3.className = 'active';
  const def4 = document.createElement('button'); def4.textContent = '4x4';
  def3.addEventListener('click', () => { if (isPlayingRef.value) return; defenseMode = '4x3'; def3.classList.add('active'); def4.classList.remove('active'); onComboChanged(); });
  def4.addEventListener('click', () => { if (isPlayingRef.value) return; defenseMode = '4x4'; def4.classList.add('active'); def3.classList.remove('active'); onComboChanged(); });
  defToggle.appendChild(def3); defToggle.appendChild(def4);
  toggleRow.appendChild(defToggle);

  if (combo.hasInsideOutside) {
    const ioToggle = document.createElement('div');
    ioToggle.className = 'def-toggle';
    const ioOut = document.createElement('button'); ioOut.textContent = 'Out'; ioOut.className = 'active';
    const ioIn = document.createElement('button'); ioIn.textContent = 'In';
    ioOut.addEventListener('click', () => { if (isPlayingRef.value) return; insideOutside = 'Outside'; ioOut.classList.add('active'); ioIn.classList.remove('active'); onComboChanged(); });
    ioIn.addEventListener('click', () => { if (isPlayingRef.value) return; insideOutside = 'Inside'; ioIn.classList.add('active'); ioOut.classList.remove('active'); onComboChanged(); });
    ioToggle.appendChild(ioOut); ioToggle.appendChild(ioIn);
    toggleRow.appendChild(ioToggle);
  }

  const wingToggle = document.createElement('div');
  wingToggle.className = 'wing-toggle';
  const wL = document.createElement('button'); wL.textContent = 'Wing L'; wL.className = 'active';
  const wR = document.createElement('button'); wR.textContent = 'Wing R';
  wL.addEventListener('click', () => { if (isPlayingRef.value) return; wingSide = 'Left'; wL.classList.add('active'); wR.classList.remove('active'); onComboChanged(); });
  wR.addEventListener('click', () => { if (isPlayingRef.value) return; wingSide = 'Right'; wR.classList.add('active'); wL.classList.remove('active'); onComboChanged(); });
  wingToggle.appendChild(wL); wingToggle.appendChild(wR);
  toggleRow.appendChild(wingToggle);

  const dirToggle = document.createElement('div');
  dirToggle.className = 'dir-toggle';
  const dL = document.createElement('button'); dL.textContent = 'Dir L'; dL.className = 'active';
  const dR = document.createElement('button'); dR.textContent = 'Dir R';
  dL.addEventListener('click', () => { if (isPlayingRef.value) return; direction = 'Left'; dL.classList.add('active'); dR.classList.remove('active'); onComboChanged(); });
  dR.addEventListener('click', () => { if (isPlayingRef.value) return; direction = 'Right'; dR.classList.add('active'); dL.classList.remove('active'); onComboChanged(); });
  dirToggle.appendChild(dL); dirToggle.appendChild(dR);
  toggleRow.appendChild(dirToggle);

  front.appendChild(toggleRow);

  const stageWrap = document.createElement('div');
  stageWrap.className = 'card-stage-wrap';

  const stage = svgEl('svg', {});
  stageWrap.appendChild(stage);

  function rerenderDiagram() { renderCardDiagram(stage, combo.playKey, direction, wingSide, selectedPlayer, defenseMode, insideOutside); }

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
    playCardAnimation(stage, combo.playKey, direction, wingSide, speedMultiplier, isPlayingRef, selectedPlayer, defenseMode, insideOutside);
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
    const signals = buildSignalSequence(combo.playKey, wingSide, direction, insideOutside);
    progress.innerHTML = '';
    signals.forEach(() => { const d = document.createElement('div'); d.className = 'dot'; progress.appendChild(d); });
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
      seqTimer = setTimeout(showStep, 950);
    }
    showStep();
  }
  function stopSignalSequence() { if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; } }

  function onComboChanged() {
    selectedPlayer = null;
    rerenderDiagram();
    titleBar.textContent = combo.hasInsideOutside ? `Wing ${wingSide} ${insideOutside} ${combo.label} ${direction}` : `Wing ${wingSide} ${combo.label} ${direction}`;
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

  document.getElementById('pcInfoBtn').addEventListener('click', () => {
    document.getElementById('playCallsInfoOverlay').classList.add('show');
  });
  document.getElementById('pcInfoCloseBtn').addEventListener('click', () => {
    document.getElementById('playCallsInfoOverlay').classList.remove('show');
  });
})();

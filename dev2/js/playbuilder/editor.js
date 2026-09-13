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
// ============================================================

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
  selectedPointIndex: null,
  dragging: false,
};

const PLAYER_R = 34;
const HANDLE_R = 14;

function currentFormation() {
  return state.formations.find((f) => f.id === state.currentPlay.formationId);
}
function currentDefenseLook() {
  return state.formations.length ? state.defenseLooks.find((d) => d.id === state.currentPlay.defenseLookId) : null;
}
function currentVariant() {
  return state.currentPlay.variants[state.currentVariantIndex];
}
function assignmentFor(playerId) {
  return currentVariant().players.find((p) => p.player === playerId);
}
function isWing(playerId) {
  return (currentFormation().wingPositionIds || []).includes(playerId);
}
function isEditingPreviewLocked() {
  // Editing is only meaningful/safe in the canonical frame -- see header comment.
  return state.wingSide !== 'right' || state.direction !== 'right';
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function pointsToPathD(points) {
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  // Quadratic-ish through-curve for 3+ points: straight segments between
  // each, good enough for v1 -- a true smooth curve is a fast-follow, not
  // a blocker for "can I make a play."
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

function svgPointFromEvent(ev) {
  const pt = els.svg.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  const ctm = els.fieldGroup.getScreenCTM().inverse();
  const local = pt.matrixTransform(ctm);
  return { x: Math.round(local.x), y: Math.round(local.y) };
}

function render() {
  els.svg.innerHTML = '';
  if (!state.currentPlay) return;

  const [vw, vh] = state.currentPlay.viewBox || [1600, 1030];
  const topPad = state.currentPlay.topPad ?? 400;
  els.svg.setAttribute('viewBox', `0 0 ${vw} ${vh + topPad}`);
  els.svg.appendChild(svgEl('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: '#ffffff' }));

  const fieldGroup = svgEl('g', { transform: `translate(0,${topPad})` });
  els.fieldGroup = fieldGroup;
  const defenseLayer = svgEl('g', {});
  const pathsLayer = svgEl('g', {});
  const circlesLayer = svgEl('g', {});
  const handlesLayer = svgEl('g', {});

  const formation = currentFormation();
  const defenseLook = currentDefenseLook();
  const variant = currentVariant();
  const { resolveAnchor, resolveRoute } = window.PlayBuilderMirror;

  // Defense
  (defenseLook?.positions || []).forEach((d) => {
    defenseLayer.appendChild(drawCircle(d.x, d.y, d.label, '#e8720c', 26));
  });

  // Routes (behind circles, so a player's number stays readable)
  variant.players.forEach((assignment) => {
    const points = resolveRoute(formation, assignment, { wingSide: state.wingSide, direction: state.direction });
    const color = assignment.hasBall ? '#e0201a' : '#123a8c';
    pathsLayer.appendChild(svgEl('path', {
      d: pointsToPathD(points), fill: 'none', stroke: color, 'stroke-width': 7, 'stroke-linecap': 'round',
    }));
  });

  // Player circles
  formation.positions.forEach((pos) => {
    const anchor = resolveAnchor(formation, pos.id, { wingSide: state.wingSide });
    const isSelected = state.selectedPlayer === pos.id;
    const c = drawCircle(anchor.x, anchor.y, String(pos.label ?? pos.id), '#111111', PLAYER_R, isSelected);
    c.style.cursor = 'pointer';
    c.addEventListener('click', (ev) => { ev.stopPropagation(); selectPlayer(pos.id); });
    circlesLayer.appendChild(c);
  });

  // Edit handles for the selected player -- only ever shown in canonical
  // frame; see isEditingPreviewLocked().
  if (state.selectedPlayer !== null && !isEditingPreviewLocked()) {
    const assignment = assignmentFor(state.selectedPlayer);
    const editPoints = isWing(state.selectedPlayer)
      ? (state.wingRouteSide === 'sameSide' ? assignment.sameSideRoute : assignment.crossSideRoute)
      : assignment.points;

    handlesLayer.appendChild(svgEl('path', {
      d: pointsToPathD(editPoints), fill: 'none', stroke: '#1a8c3a', 'stroke-width': 3, 'stroke-dasharray': '6 6',
    }));

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

  renderSidebar();
}

function drawCircle(x, y, label, stroke, r, selected) {
  const wrap = svgEl('g', {});
  wrap.appendChild(svgEl('circle', {
    cx: x, cy: y, r, fill: selected ? '#fff7e6' : '#ffffff', stroke, 'stroke-width': selected ? 10 : 8,
  }));
  const t = svgEl('text', { x, y: y + 10, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 900, fill: stroke });
  t.textContent = label;
  wrap.appendChild(t);
  return wrap;
}

function selectPlayer(playerId) {
  state.selectedPlayer = playerId;
  state.selectedPointIndex = null;
  state.wingRouteSide = 'sameSide';

  let assignment = assignmentFor(playerId);
  if (!assignment) {
    // First time this player's been selected for this variant -- nothing
    // to inherit, start a blank assignment rather than crash on an
    // undefined lookup.
    assignment = { player: playerId, hasBall: false, delayMs: 0, endType: 'run' };
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
  if (isWing(state.selectedPlayer)) {
    return state.wingRouteSide === 'sameSide' ? assignment.sameSideRoute : assignment.crossSideRoute;
  }
  return assignment.points;
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
  els.playerPanel.style.display = assignment ? '' : 'none';
  if (!assignment) return;

  els.playerLabel.textContent = `#${state.selectedPlayer}`;
  els.hasBallCheckbox.checked = !!assignment.hasBall;
  els.delayInput.value = assignment.delayMs || 0;
  els.endTypeSelect.value = assignment.endType || 'run';
  els.wingRouteToggle.style.display = isWing(state.selectedPlayer) ? '' : 'none';
  els.wingRouteToggle.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.value === state.wingRouteSide);
  });
  els.previewLockNote.style.display = isEditingPreviewLocked() ? '' : 'none';
}

function bindSidebar() {
  els.hasBallCheckbox.addEventListener('change', () => {
    assignmentFor(state.selectedPlayer).hasBall = els.hasBallCheckbox.checked;
  });
  els.delayInput.addEventListener('input', () => {
    assignmentFor(state.selectedPlayer).delayMs = Number(els.delayInput.value) || 0;
  });
  els.endTypeSelect.addEventListener('change', () => {
    assignmentFor(state.selectedPlayer).endType = els.endTypeSelect.value;
    render();
  });
  els.wingRouteToggle.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      state.wingRouteSide = b.dataset.value;
      state.selectedPointIndex = null;
      render();
    });
  });

  els.wingSideToggle.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      state.wingSide = b.dataset.value;
      state.selectedPointIndex = null;
      render();
    });
  });
  els.directionToggle.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      state.direction = b.dataset.value;
      state.selectedPointIndex = null;
      render();
    });
  });

  els.saveBtn.addEventListener('click', async () => {
    els.saveBtn.textContent = 'Saving…';
    try {
      await window.PlayBuilderStore.savePlay(state.currentPlay);
      els.saveBtn.textContent = 'Saved!';
    } catch (err) {
      els.saveBtn.textContent = 'Save failed';
      console.error(err);
      alert(err.message);
    }
    setTimeout(() => { els.saveBtn.textContent = 'Save Play'; }, 1800);
  });

  els.newPlayBtn.addEventListener('click', () => {
    const id = prompt('New play key (lowercase, underscores, e.g. "trap_left"):');
    if (!id) return;
    const label = prompt('Display label (e.g. "Trap"):') || id;
    const formationId = state.formations[0]?.id;
    const defenseLookId = state.defenseLooks[0]?.id;
    state.currentPlay = {
      id, label, formationId, defenseLookId,
      viewBox: window.PlayBuilderSeeds.viewBox, topPad: window.PlayBuilderSeeds.topPad,
      variants: [{ id: 'default', label: 'Base', players: [] }],
    };
    state.currentVariantIndex = 0;
    state.selectedPlayer = null;
    populatePlaySelect();
    render();
  });

  els.playSelect.addEventListener('change', () => {
    const play = state.plays.find((p) => p.id === els.playSelect.value);
    if (!play) return;
    state.currentPlay = play;
    state.currentVariantIndex = 0;
    state.selectedPlayer = null;
    render();
  });

  els.formationSelect.addEventListener('change', () => {
    state.currentPlay.formationId = els.formationSelect.value;
    state.selectedPlayer = null;
    render();
  });
}

function populatePlaySelect() {
  els.playSelect.innerHTML = state.plays.map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
  if (state.currentPlay) els.playSelect.value = state.currentPlay.id;
}
function populateFormationSelect() {
  els.formationSelect.innerHTML = state.formations.map((f) => `<option value="${f.id}">${f.label}</option>`).join('');
}

async function init() {
  els.svg = q('field');
  els.playerPanel = q('playerPanel');
  els.playerLabel = q('playerLabel');
  els.hasBallCheckbox = q('hasBallCheckbox');
  els.delayInput = q('delayInput');
  els.endTypeSelect = q('endTypeSelect');
  els.wingRouteToggle = q('wingRouteToggle');
  els.wingSideToggle = q('wingSideToggle');
  els.directionToggle = q('directionToggle');
  els.previewLockNote = q('previewLockNote');
  els.saveBtn = q('saveBtn');
  els.newPlayBtn = q('newPlayBtn');
  els.playSelect = q('playSelect');
  els.formationSelect = q('formationSelect');
  els.statusEl = q('status');

  initEvents();
  bindSidebar();

  els.statusEl.textContent = 'Loading…';
  if (await window.PlayBuilderStore.isEmpty()) {
    els.statusEl.textContent = 'First run -- seeding starter formations…';
    await window.PlayBuilderStore.seedFromDefaults();
  }
  const data = await window.PlayBuilderStore.loadAll();
  state.formations = data.formations;
  state.defenseLooks = data.defenseLooks;
  state.plays = data.plays;

  populateFormationSelect();
  populatePlaySelect();

  if (state.plays.length) {
    state.currentPlay = state.plays[0];
  } else {
    state.currentPlay = {
      id: 'new_play', label: 'New Play',
      formationId: state.formations[0]?.id, defenseLookId: state.defenseLooks[0]?.id,
      viewBox: data.viewBox, topPad: data.topPad,
      variants: [{ id: 'default', label: 'Base', players: [] }],
    };
  }
  els.statusEl.textContent = '';
  render();
}

window.addEventListener('DOMContentLoaded', () => {
  init().catch((err) => {
    console.error(err);
    q('status').textContent = `Failed to load: ${err.message}`;
  });
});

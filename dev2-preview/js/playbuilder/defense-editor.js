// ============================================================
// Play Builder v2 -- Defense editor.
//
// Nathan: "I need to be able to set the defense for the week so all our
// plays run against that look" + "I also need to be able to setup the
// defensive alignment." Scoped, with his own confirmation, to ALIGNMENT
// ONLY for this first pass -- drag all 11 defenders to a new starting
// look, save it, pick it as "this week's defense." Per-defender man/zone/
// blitz ASSIGNMENT (schema.js's own DefenderResponsibility, already
// documented) is real, wanted, and deliberately NOT built here -- a
// second, later phase, once alignment is proven and shipped.
//
// Deliberately its own small, independent drag surface rather than
// reusing FormationBuilder (js/formation-builder.js) -- that class is
// built around OFFENSE's own real needs (side-mirroring, lineSlots,
// anchored/swap-pair authoring) that don't apply here at all: a defense
// has no "side" to mirror while authoring (js/playbuilder/mirror.js's
// own reflectDefensePositions handles direction entirely at RENDER time,
// not authoring time) and no O-line-style special slots. Simpler to
// write a dedicated ~11-dot drag loop than to bend that class to fit.
//
// IIFE-wrapped, matching every sibling file in this shared-scope page.
(function () {

function q(id) { return document.getElementById(id); }

const SVG_NS = 'http://www.w3.org/2000/svg';
// Real, live O-line anchors (LT/LG/C/RG/RT) -- the SAME ones every
// formation in this app actually uses at the line of scrimmage (verbatim
// from js/shipped-defaults.js's own real Wing data, confirmed against it
// earlier this session while building "I"). Shown here as a plain, non-
// interactive reference so a coach can place a DE "outside the tackle"
// against a real tackle, not a guess -- never read by anything else, and
// never saved as part of a DefenseLook.
const OLINE_REF = [
  { id: 'LT', x: 577, y: 204 }, { id: 'LG', x: 692, y: 204 }, { id: 'C', x: 806, y: 204 },
  { id: 'RG', x: 921, y: 204 }, { id: 'RT', x: 1035, y: 204 },
];

const dbState = {
  looks: [],
  editingId: null,
  positions: [],
  activeId: null,
  viewBox: [1600, 1030],
  topPad: 400,
  dragId: null,
  built: false,
};

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// Same pointer-to-field-coordinate math FormationBuilder's own _toLocal
// uses (js/formation-builder.js) -- accounts for the SVG being scaled down
// to fit its container instead of rendered 1:1.
function toLocal(svg, ev) {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const scaleX = vb.width / rect.width;
  const scaleY = vb.height / rect.height;
  return { x: (ev.clientX - rect.left) * scaleX + vb.x, y: (ev.clientY - rect.top) * scaleY + vb.y };
}

function render() {
  const svg = q('dbField');
  if (!svg) return;
  svg.innerHTML = '';
  const vw = dbState.viewBox[0];
  const topPad = dbState.topPad;
  svg.setAttribute('viewBox', `0 0 ${vw} ${topPad + 300}`);

  const g = svgEl('g', { transform: `translate(0,${topPad})` });
  svg.appendChild(g);

  // Nathan: "can we move the line of scrimmage down below to be just
  // above the offensive line circles?" Purely a visual reference line --
  // the O-line reference itself (below, y=204, r=28) is what's real, so
  // "just above" it is literally y = 204 - 28 = 176, not the true y=0
  // LOS the actual coordinate system uses (which left a wide, empty-
  // looking gap between the line and the O-line row it's meant to sit
  // near).
  const losY = OLINE_REF[0].y - 28;
  g.appendChild(svgEl('line', {
    x1: 0, y1: losY, x2: vw, y2: losY, stroke: '#999', 'stroke-width': 2, 'stroke-dasharray': '10 8',
  }));
  const losLabel = svgEl('text', { x: 12, y: losY - 8, 'font-size': 13, fill: '#999', 'font-weight': 700 });
  losLabel.textContent = 'LINE OF SCRIMMAGE';
  g.appendChild(losLabel);

  OLINE_REF.forEach((p) => {
    g.appendChild(svgEl('circle', {
      cx: p.x, cy: p.y, r: 28, fill: 'none', stroke: '#aaa', 'stroke-width': 3, 'stroke-dasharray': '4 5',
    }));
    const t = svgEl('text', {
      x: p.x, y: p.y + 6, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: '#aaa',
    });
    t.textContent = p.id;
    g.appendChild(t);
  });

  dbState.positions.forEach((p) => {
    const wrap = svgEl('g', {});
    wrap.style.cursor = 'grab';
    wrap.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: 31, fill: '#fff', stroke: '#c62828', 'stroke-width': 7 }));
    const t = svgEl('text', {
      x: p.x, y: p.y + 8, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 900, 'font-style': 'italic', fill: '#c62828',
    });
    t.textContent = p.label;
    wrap.appendChild(t);
    wrap.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      dbState.dragId = p.id;
    });
    g.appendChild(wrap);
  });

  svg.onpointermove = (ev) => {
    if (!dbState.dragId) return;
    const pt = toLocal(svg, ev);
    const p = dbState.positions.find((d) => d.id === dbState.dragId);
    if (!p) return;
    p.x = Math.round(pt.x);
    p.y = Math.round(pt.y - topPad);
    render();
  };
  svg.onpointerup = () => { dbState.dragId = null; };
  svg.onpointerleave = () => { dbState.dragId = null; };

  renderSidebar();
}

function renderSidebar() {
  const sel = q('dbLookSelect');
  if (sel) {
    sel.innerHTML = dbState.looks.map((l) => `<option value="${l.id}">${l.label}</option>`).join('');
    if (dbState.editingId) sel.value = dbState.editingId;
  }
  const status = q('dbActiveStatus');
  if (status) {
    const activeLook = dbState.looks.find((l) => l.id === dbState.activeId);
    status.textContent = activeLook
      ? `This week, every play renders against "${activeLook.label}."`
      : `Using each play's own default defense (no weekly override set).`;
  }
  const setBtn = q('dbSetActiveBtn');
  if (setBtn) {
    const isActive = dbState.editingId && dbState.editingId === dbState.activeId;
    setBtn.textContent = isActive ? 'This IS the weekly defense' : "Set as this week's defense";
    setBtn.disabled = !!isActive;
  }
  const removeBtn = q('dbRemoveLookBtn');
  if (removeBtn) removeBtn.disabled = (dbState.editingId === 'base_4x4');
}

function loadLook(id) {
  const look = dbState.looks.find((l) => l.id === id);
  dbState.editingId = look ? id : null;
  dbState.positions = look ? look.positions.map((p) => Object.assign({}, p)) : [];
  render();
}

function bind() {
  const sel = q('dbLookSelect');
  if (sel) sel.addEventListener('change', () => loadLook(sel.value));

  const newBtn = q('dbNewLookBtn');
  if (newBtn) newBtn.addEventListener('click', () => {
    const label = prompt("Name this defense (e.g. the opponent's name):");
    if (!label || !label.trim()) return;
    let id = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!id) id = 'look_' + Date.now();
    if (dbState.looks.find((l) => l.id === id)) { alert('A defense with that name already exists.'); return; }
    const base = dbState.looks.find((l) => l.id === 'base_4x4') || dbState.looks[0];
    const newLook = { id, label: label.trim(), positions: (base ? base.positions : []).map((p) => Object.assign({}, p)) };
    dbState.looks.push(newLook);
    loadLook(id);
  });

  const saveBtn = q('dbSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const look = dbState.looks.find((l) => l.id === dbState.editingId);
    if (!look || !window.PlayBuilderStore) return;
    look.positions = dbState.positions.map((p) => Object.assign({}, p));
    saveBtn.disabled = true;
    const original = saveBtn.textContent;
    saveBtn.textContent = 'Saving…';
    try {
      await window.PlayBuilderStore.saveDefenseLook(look);
      saveBtn.textContent = 'Saved';
    } catch (e) {
      saveBtn.textContent = 'Save failed';
      console.error('[defense-editor] save failed:', e);
    }
    setTimeout(() => { saveBtn.disabled = false; saveBtn.textContent = original; }, 1200);
  });

  const setActiveBtn = q('dbSetActiveBtn');
  if (setActiveBtn) setActiveBtn.addEventListener('click', async () => {
    if (!window.PlayBuilderStore || !dbState.editingId) return;
    dbState.activeId = dbState.editingId;
    await window.PlayBuilderStore.saveActiveDefenseLookId(dbState.activeId);
    renderSidebar();
  });

  const clearActiveBtn = q('dbClearActiveBtn');
  if (clearActiveBtn) clearActiveBtn.addEventListener('click', async () => {
    if (!window.PlayBuilderStore) return;
    dbState.activeId = null;
    await window.PlayBuilderStore.saveActiveDefenseLookId(null);
    renderSidebar();
  });

  const removeBtn = q('dbRemoveLookBtn');
  if (removeBtn) removeBtn.addEventListener('click', async () => {
    if (!window.PlayBuilderStore || dbState.editingId === 'base_4x4') return;
    const look = dbState.looks.find((l) => l.id === dbState.editingId);
    if (!look) return;
    if (!confirm(`Remove "${look.label}"? This can't be undone.`)) return;
    await window.PlayBuilderStore.deleteDefenseLook(look.id);
    if (dbState.activeId === look.id) {
      dbState.activeId = null;
      await window.PlayBuilderStore.saveActiveDefenseLookId(null);
    }
    dbState.looks = dbState.looks.filter((l) => l.id !== look.id);
    loadLook(dbState.looks[0] ? dbState.looks[0].id : null);
  });
}

async function init() {
  // coachtools-nav.js-style pattern (js/coachtools-playbuilder.js's own
  // `built` flag) -- this tab can be revisited without losing in-progress
  // drag edits or re-binding every listener a second time.
  if (dbState.built) return;
  dbState.built = true;
  if (!window.PlayBuilderStore) return;
  const data = await window.PlayBuilderStore.loadAll();
  dbState.looks = data.defenseLooks;
  dbState.activeId = data.activeDefenseLookId;
  dbState.viewBox = data.viewBox;
  dbState.topPad = data.topPad;
  bind();
  loadLook(dbState.looks[0] ? dbState.looks[0].id : null);
}

window.initPlayBuilderDefense = init;

})();

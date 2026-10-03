// ============================================================
// Play Builder v2 -- Defense editor.
//
// Nathan: "I need to be able to set the defense for the week so all our
// plays run against that look" + "I also need to be able to setup the
// defensive alignment" + "choose a defender and give them man to man or
// zone assignments and choose the offensive player, tell them to blitz
// and draw the path they should take." Alignment (drag all 11 defenders,
// save, pick it as "this week's defense") shipped first, on Nathan's own
// scope call given a real deadline; this file now also carries the
// second phase -- per-defender Man/Zone/Blitz assignment (schema.js's
// DefenderResponsibility, documented since the first pass) -- a real,
// separate MODE from alignment-dragging, not folded into the same
// gesture: dragging a defender repositions his standing spot, selecting
// one (a plain click, no drag) opens his own assignment editor. Keeping
// these as two distinct, explicitly-chosen modes (a toggle, not a
// pointerdown-vs-click guess) avoids the exact gesture-ambiguity this
// app's own offensive route editor had to work through earlier this
// session (see js/playbuilder/editor.js's own "editing on the reverse is
// so strange" fix) -- here it's avoided by construction instead of fixed
// after the fact.
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
// Man coverage's own target picker -- the canonical offensive position-id
// vocabulary every real formation in this app uses (1-6 plus the five
// O-line spots), not one specific formation's own list. Matches schema.js's
// own DefenderResponsibility doc exactly: "a target id that formation
// doesn't have just means uncovered" -- this picker is deliberately
// formation-agnostic, since the SAME DefenseLook can be the active weekly
// defense against Wing, Split, 5 Guys, I, or I Wing, and a man-coverage
// call like "cover the 4" should resolve correctly against whichever one
// is actually on screen, not just the formation open in THIS editor.
const MAN_TARGET_IDS = ['1', '2', '3', '4', '5', '6', 'LT', 'LG', 'C', 'RG', 'RT'];
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
  // 'alignment' (existing drag-to-reposition) or 'assignment' (select a
  // defender, author Man/Zone/Blitz). selectedId/selectedPointIndex only
  // mean anything in 'assignment' mode -- reset on every mode switch and
  // every look-load so stale state from a different defender/look can
  // never leak into a fresh selection.
  mode: 'alignment',
  selectedId: null,
  selectedPointIndex: null,
  draggingPoint: false,
};

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// Same point-array helpers js/playbuilder/editor.js already proved out for
// offensive routes (pointsToPathD/curvedPathD/nearestSegmentIndex) --
// copied, not imported, matching this whole file family's own established
// convention (every sibling file is IIFE-wrapped and self-contained rather
// than sharing a module system). Zone's own `area` doesn't need the curve
// treatment -- a coverage zone reads as a region, not a running route, so
// its own renderer (closedAreaPathD, below) closes a straight-edged
// polygon instead.
function pointsToPathD(points) {
  if (points.length < 2) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}
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
function closedAreaPathD(points) {
  if (points.length < 3) return pointsToPathD(points);
  return pointsToPathD(points) + ' Z';
}
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
function defenderById(id) { return dbState.positions.find((d) => d.id === id); }

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

  // Nathan: "choose a defender and give them man to man or zone
  // assignments... or blitz and draw the path." A SEPARATE mode from
  // alignment-dragging (see this file's own top-of-file comment for why),
  // so a defender circle's own interaction branches here: 'alignment'
  // keeps the original drag-to-reposition gesture untouched; 'assignment'
  // is a plain click-to-select, with the actual Man/Zone/Blitz editing
  // happening in the side panel + (for Zone/Blitz) the point-handle
  // overlay drawn further below.
  const isAssign = dbState.mode === 'assignment';
  dbState.positions.forEach((p) => {
    const wrap = svgEl('g', {});
    wrap.style.cursor = isAssign ? 'pointer' : 'grab';
    const isSelected = isAssign && dbState.selectedId === p.id;
    wrap.appendChild(svgEl('circle', {
      cx: p.x, cy: p.y, r: isSelected ? 35 : 31, fill: '#fff',
      stroke: isSelected ? '#ffde00' : '#c62828', 'stroke-width': isSelected ? 9 : 7,
    }));
    const t = svgEl('text', {
      x: p.x, y: p.y + 8, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 900, 'font-style': 'italic', fill: '#c62828',
    });
    t.textContent = p.label;
    wrap.appendChild(t);
    // A small corner badge naming the defender's current assignment (M/Z/B)
    // so a coach can see at a glance who's covered without having to tap
    // through all 11 -- drawn regardless of mode (alignment mode benefits
    // from this context too), absent entirely for an unassigned defender.
    if (p.responsibility && p.responsibility.type) {
      const letter = p.responsibility.type === 'man' ? 'M' : p.responsibility.type === 'zone' ? 'Z' : 'B';
      const bx = p.x + 24, by = p.y - 24;
      wrap.appendChild(svgEl('circle', { cx: bx, cy: by, r: 13, fill: '#1a7a4a', stroke: '#fff', 'stroke-width': 2 }));
      const bt = svgEl('text', { x: bx, y: by + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 900, fill: '#fff' });
      bt.textContent = letter;
      wrap.appendChild(bt);
    }
    wrap.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      if (isAssign) return; // selection handled by the click listener below, not drag
      dbState.dragId = p.id;
    });
    if (isAssign) {
      wrap.addEventListener('click', (ev) => {
        ev.stopPropagation();
        dbState.selectedId = p.id;
        dbState.selectedPointIndex = null;
        render();
      });
    }
    g.appendChild(wrap);
  });

  // Zone/Blitz point-editing overlay -- same grab/drag/insert/remove
  // mechanics js/playbuilder/editor.js already proved out for offensive
  // routes (nearestSegmentIndex's own hit-path-insert trick included),
  // adapted to whichever shape the selected defender's own responsibility
  // currently holds. Absent entirely outside assignment mode, with no
  // defender selected, or for a Man assignment (no points to edit).
  const selected = isAssign && dbState.selectedId ? defenderById(dbState.selectedId) : null;
  const resp = selected ? selected.responsibility : null;
  if (selected && resp && (resp.type === 'zone' || resp.type === 'blitz')) {
    const key = resp.type === 'zone' ? 'area' : 'path';
    const pts = resp[key] || (resp[key] = []);
    const shapeD = resp.type === 'zone' ? closedAreaPathD(pts) : curvedPathD(pts);
    if (pts.length >= 2) {
      g.appendChild(svgEl('path', {
        d: shapeD, fill: resp.type === 'zone' ? '#1a7a4a' : 'none',
        'fill-opacity': resp.type === 'zone' ? 0.18 : undefined,
        stroke: resp.type === 'zone' ? '#1a7a4a' : '#e0201a',
        'stroke-width': 3, 'stroke-dasharray': resp.type === 'zone' ? '5 4' : '8 6',
      }));
    }
    if (pts.length >= 2) {
      const hitPath = svgEl('path', {
        d: pointsToPathD(pts), fill: 'none', stroke: 'transparent', 'stroke-width': 28, cursor: 'copy',
      });
      hitPath.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        const pt = toLocal(svg, ev);
        pt.y -= topPad;
        const insertAt = nearestSegmentIndex(pts, pt) + 1;
        pts.splice(insertAt, 0, { x: Math.round(pt.x), y: Math.round(pt.y) });
        dbState.selectedPointIndex = insertAt;
        dbState.draggingPoint = true;
        render();
      });
      // Without this, the 'click' that naturally follows a pointerdown+
      // pointerup on the hit-path bubbles up to the field's own onclick
      // (below) and appends a SECOND point at the tap location, on top of
      // the one just inserted here -- same stopPropagation the pointerdown
      // listener above already needs, just for the other event.
      hitPath.addEventListener('click', (ev) => ev.stopPropagation());
      g.appendChild(hitPath);
    }
    pts.forEach((pt, idx) => {
      const isPicked = dbState.selectedPointIndex === idx;
      const h = svgEl('circle', {
        cx: pt.x, cy: pt.y, r: isPicked ? 15 : 11,
        fill: '#ffde00', stroke: '#111', 'stroke-width': 2, cursor: 'pointer',
      });
      h.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        dbState.selectedPointIndex = idx;
        dbState.draggingPoint = true;
        render();
      });
      h.addEventListener('click', (ev) => ev.stopPropagation());
      g.appendChild(h);
      if (isPicked && pts.length > 2) {
        const badge = svgEl('g', { cursor: 'pointer' });
        badge.appendChild(svgEl('circle', { cx: pt.x + 22, cy: pt.y - 22, r: 11, fill: '#e0201a' }));
        const x = svgEl('text', { x: pt.x + 22, y: pt.y - 18, 'text-anchor': 'middle', fill: '#fff', 'font-size': 14, 'font-weight': 900 });
        x.textContent = '✕';
        badge.appendChild(x);
        badge.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        badge.addEventListener('click', (ev) => {
          ev.stopPropagation();
          pts.splice(idx, 1);
          dbState.selectedPointIndex = null;
          render();
        });
        g.appendChild(badge);
      }
    });
  }
  // Click anywhere else on the field (not a handle, not the hit-path --
  // both stop propagation before this ever sees the event) appends a new
  // point at the end -- same "tap empty space to extend" convention
  // editor.js's own route editing uses, letting a coach build a shape
  // from scratch with no points yet by just tapping around the field.
  // Property assignment (matching onpointermove/up/leave below), not
  // addEventListener -- render() runs on every single point drag/insert,
  // and an addEventListener(once:true) added fresh each of those times,
  // never actually firing until a genuine click happens, would stack an
  // unbounded pile of listeners instead of the one real one this needs.
  // Explicitly cleared (not just left stale) outside an active Zone/Blitz
  // edit, since property assignment -- unlike addEventListener -- doesn't
  // un-set itself when this code path isn't the one that runs.
  svg.onclick = (selected && resp && (resp.type === 'zone' || resp.type === 'blitz')) ? (ev) => {
    const key = resp.type === 'zone' ? 'area' : 'path';
    const pts = resp[key] || (resp[key] = []);
    const pt = toLocal(svg, ev);
    pt.y -= topPad;
    pts.push({ x: Math.round(pt.x), y: Math.round(pt.y) });
    render();
  } : null;

  svg.onpointermove = (ev) => {
    if (dbState.draggingPoint && dbState.selectedPointIndex !== null && resp) {
      const key = resp.type === 'zone' ? 'area' : 'path';
      const pts = resp[key];
      if (!pts || !pts[dbState.selectedPointIndex]) return;
      const pt = toLocal(svg, ev);
      pts[dbState.selectedPointIndex] = { x: Math.round(pt.x), y: Math.round(pt.y - topPad) };
      render();
      return;
    }
    if (!dbState.dragId) return;
    const pt = toLocal(svg, ev);
    const p = dbState.positions.find((d) => d.id === dbState.dragId);
    if (!p) return;
    p.x = Math.round(pt.x);
    p.y = Math.round(pt.y - topPad);
    render();
  };
  svg.onpointerup = () => { dbState.dragId = null; dbState.draggingPoint = false; };
  svg.onpointerleave = () => { dbState.dragId = null; dbState.draggingPoint = false; };

  renderSidebar();
  renderAssignPanel();
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

  // Same "plain navBtn = active, navBtn+secondary = inactive" swap this
  // file's own Man/Zone/Blitz type picker already uses (renderAssignPanel)
  // -- .navBtn has no separate .active CSS rule to toggle, this pairing is
  // the real, already-proven way this app shows "which one's on" here.
  const alignBtn = q('dbModeAlignBtn');
  const assignBtn = q('dbModeAssignBtn');
  if (alignBtn && assignBtn) {
    alignBtn.className = 'navBtn' + (dbState.mode === 'alignment' ? '' : ' secondary');
    assignBtn.className = 'navBtn' + (dbState.mode === 'assignment' ? '' : ' secondary');
  }
  const modeHint = q('dbModeHint');
  if (modeHint) {
    modeHint.textContent = dbState.mode === 'alignment'
      ? 'Drag any defender to set where they line up. The dashed circles are your own O-line, shown for reference only.'
      : 'Tap a defender to give him a Man, Zone, or Blitz assignment. Switch back to Alignment to reposition defenders.';
  }
}

// Builds the whole Assignments-mode side panel fresh each render(), same
// "small dynamic DOM, not a dozen pre-wired static ids" approach
// js/playbuilder/editor.js's own renderSidebar already uses for its
// per-player panel -- simpler to get right than wiring up/showing/hiding
// a large fixed set of elements for every Man/Zone/Blitz/no-selection
// combination.
function renderAssignPanel() {
  const panel = q('dbAssignPanel');
  if (!panel) return;
  if (dbState.mode !== 'assignment') { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  panel.style.display = '';

  const selected = dbState.selectedId ? defenderById(dbState.selectedId) : null;
  if (!selected) {
    panel.innerHTML = '<div class="hint">Tap a defender on the field to set his assignment.</div>';
    return;
  }
  const resp = selected.responsibility;
  const type = resp ? resp.type : null;

  const wrap = document.createElement('div');
  const label = document.createElement('div');
  label.className = 'build-panel-label';
  label.textContent = `${selected.label} (${selected.id})`;
  wrap.appendChild(label);

  const typeRow = document.createElement('div');
  typeRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px';
  [['man', '🧍 Man'], ['zone', '🛡️ Zone'], ['blitz', '⚡ Blitz']].forEach(([val, txt]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'navBtn' + (type === val ? '' : ' secondary');
    btn.style.cssText = 'flex:1 1 0;margin:0;padding:8px 4px;font-size:12px';
    btn.textContent = txt;
    btn.addEventListener('click', () => {
      // Switching type starts that type completely fresh (not carried
      // over from whatever was set before) -- a Man target and a Zone's
      // own authored points mean nothing to each other, so there's no
      // sensible partial-carry-over between them, unlike (for example)
      // switching Formation Builder's own alignment toggles.
      if (val === 'man') selected.responsibility = { type: 'man', target: selected.responsibility && selected.responsibility.target };
      else selected.responsibility = { type: val };
      dbState.selectedPointIndex = null;
      render();
    });
    typeRow.appendChild(btn);
  });
  wrap.appendChild(typeRow);

  if (type) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'navBtn secondary';
    clearBtn.style.cssText = 'width:100%;margin:0 0 12px';
    clearBtn.textContent = '✕ Clear Assignment';
    clearBtn.addEventListener('click', () => {
      selected.responsibility = undefined;
      dbState.selectedPointIndex = null;
      render();
    });
    wrap.appendChild(clearBtn);
  }

  if (type === 'man') {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.style.marginBottom = '6px';
    hint.textContent = 'Which offensive position is he covering?';
    wrap.appendChild(hint);
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px';
    MAN_TARGET_IDS.forEach((tid) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isOn = resp && String(resp.target) === tid;
      btn.className = 'navBtn' + (isOn ? '' : ' secondary');
      btn.style.cssText = 'margin:0;padding:8px 2px;font-size:12px';
      btn.textContent = tid;
      btn.addEventListener('click', () => {
        selected.responsibility = { type: 'man', target: tid };
        render();
      });
      grid.appendChild(btn);
    });
    wrap.appendChild(grid);
  } else if (type === 'zone' || type === 'blitz') {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = type === 'zone'
      ? 'Tap the field to add points outlining his coverage area. Drag a point to move it, grab the line to add one, tap a selected point’s ✕ to remove it.'
      : 'Tap the field to draw his rush path toward the backfield. Drag a point to move it, grab the line to add one, tap a selected point’s ✕ to remove it.';
    wrap.appendChild(hint);
    const pts = resp[type === 'zone' ? 'area' : 'path'];
    if (pts && pts.length) {
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'navBtn secondary';
      resetBtn.style.cssText = 'width:100%;margin-top:8px';
      resetBtn.textContent = '↺ Reset Shape';
      resetBtn.addEventListener('click', () => {
        resp[type === 'zone' ? 'area' : 'path'] = [];
        dbState.selectedPointIndex = null;
        render();
      });
      wrap.appendChild(resetBtn);
    }
  }

  panel.innerHTML = '';
  panel.appendChild(wrap);
}

// A real, non-hypothetical risk a shallow Object.assign({}, p) per
// position would have: x/y are primitives (reassigning one on the copy
// never touches the original), but `responsibility` is a nested object --
// a shallow copy shares that SAME reference with whatever's still sitting
// in dbState.looks (this look's own, not-yet-saved cached entry). Editing
// a Zone/Blitz's points mutates resp.area/.path IN PLACE (push/splice),
// which would silently corrupt the cached look -- visible if a coach
// switches away without saving and back again in the same session, even
// though the real, server-side data was never touched. Deep-cloned here
// instead, same one level deeper than loadLook's own x/y copy already
// goes for exactly this reason.
function cloneResponsibility(r) {
  if (!r) return undefined;
  const next = { type: r.type, target: r.target };
  if (r.area) next.area = r.area.map((pt) => Object.assign({}, pt));
  if (r.path) next.path = r.path.map((pt) => Object.assign({}, pt));
  return next;
}
function loadLook(id) {
  const look = dbState.looks.find((l) => l.id === id);
  dbState.editingId = look ? id : null;
  dbState.positions = look ? look.positions.map((p) => Object.assign({}, p, { responsibility: cloneResponsibility(p.responsibility) })) : [];
  dbState.selectedId = null;
  dbState.selectedPointIndex = null;
  render();
}

function bind() {
  const sel = q('dbLookSelect');
  if (sel) sel.addEventListener('change', () => loadLook(sel.value));

  const alignBtn = q('dbModeAlignBtn');
  const assignBtn = q('dbModeAssignBtn');
  if (alignBtn) alignBtn.addEventListener('click', () => {
    dbState.mode = 'alignment';
    dbState.selectedId = null;
    dbState.selectedPointIndex = null;
    render();
  });
  if (assignBtn) assignBtn.addEventListener('click', () => {
    dbState.mode = 'assignment';
    render();
  });

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

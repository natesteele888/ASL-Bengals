// ---------------------------------------------------------------------------
// Position Crash Course PDF -- "what does the 4 actually DO?" for a player who
// just changed spots.
//
// Nathan (2026-10-10): "I have a player who has been playing the 3 most of the
// season but he is now moving to the 4 (wing)... I need a way of exporting a
// crash course for him with the 4 so he knows what he is doing on most plays.
// Where does he line up in formations, what plays are designed runs for him,
// what plays does he go out on a route, what plays does he block."
//
// Nothing here re-derives a play. Every look is drawn by the SAME renderers the
// play cards use (renderCardDiagram / renderSplitDiagram), into an offscreen
// stage, and the position's job is read straight off what got drawn: a path
// flagged as the ball carrier is a CARRY, a path with a block end cap is a
// BLOCK, any other path is a ROUTE. So the sheet can never disagree with the
// card a player is looking at -- including every Left/Right look, every
// add-on (Counter, Overload, Heavy...) and the custom formations built in Play
// Builder -- and it follows the live data, not a snapshot.
//
// Which plays count for a formation comes from playsForFormation() -- the same
// curation/fallback rules the Plays tab and the Full Playbook Reference PDF use.
//
// Position-agnostic on purpose (a kid changing spots is a recurring thing, not
// a one-off): pass '4', '3', '1', 'LT'... The 4's nickname is the only
// position-specific text.
// ---------------------------------------------------------------------------
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Same formation order/colors js/gameplan-pdf.js uses for the Call Sheet, so
  // a formation looks the same on every printout.
  const FORMATION_ORDER = ['wing', 'split', '5-guys', 'i', 'i-wing', 'jumbo'];
  const FORMATION_COLORS = { wing: '#1f6f43', split: '#2a5d8f', '5-guys': '#8a3b12', i: '#6b3fa0', 'i-wing': '#8a2e5c', jumbo: '#8a7b12' };
  const FALLBACK_COLOR = '#455a64';

  // The three line colors play-calls.js draws with (BALL_COLOR / NOBALL_COLOR /
  // BLOCK_COLOR), so the legend matches the diagrams exactly. The Game HUD
  // preview theme swaps the ball color; both are recognized below.
  const ROLE_COLOR = { CARRY: '#e0201a', ROUTE: '#123a8c', BLOCK: '#e8720c' };
  const BALL_STROKES = ['#e0201a', '#ff4136'];

  const OFFENSE_LABEL = /^(\d|LT|LG|C|RG|RT)$/;
  const LINE_LABELS = ['LT', 'LG', 'C', 'RG', 'RT'];
  const POSITION_NICKNAMES = { '4': 'Wing' };

  const RASTER_SCALE = 3;

  // ---- small helpers -------------------------------------------------------
  function isNumberPos(p) { return /^\d$/.test(String(p)); }
  function posLabel(p) { return isNumberPos(p) ? '#' + p : String(p); }
  function positionTitle(p) {
    const nick = POSITION_NICKNAMES[String(p)];
    if (isNumberPos(p)) return nick ? `The ${p} (${nick})` : `The ${p}`;
    return String(p);
  }
  function opposite(s) { return s === 'Left' ? 'Right' : 'Left'; }
  function median(nums) {
    const a = nums.slice().sort((x, y) => x - y);
    return a.length ? a[Math.floor(a.length / 2)] : 0;
  }
  function formationName(id) {
    const f = window.Formations && window.Formations.get(id);
    return (f && f.name) || id;
  }
  function formationColor(id) { return FORMATION_COLORS[id] || FALLBACK_COLOR; }
  function orderedFormations() {
    const rank = (id) => { const i = FORMATION_ORDER.indexOf(id); return i === -1 ? FORMATION_ORDER.length : i; };
    return window.Formations.list().slice().sort((a, b) => rank(a.id) - rank(b.id));
  }
  function groupBy(items, keyFn) {
    const m = new Map();
    items.forEach((it) => { const k = keyFn(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it); });
    return m;
  }
  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  // ---- offscreen stage + rasterizing --------------------------------------
  function makeStage() {
    const [VW, VH] = window.DATA.viewBox;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden';
    document.body.appendChild(wrap);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
    svg.setAttribute('width', VW);
    svg.setAttribute('height', VH);
    wrap.appendChild(svg);
    return { svg, wrap };
  }
  function viewBoxOf(stage) {
    const v = stage.viewBox.baseVal;
    return { x: v.x, y: v.y, w: v.width, h: v.height };
  }
  // Rasterizes the stage at its own aspect ratio (the renderers pad the viewBox,
  // and a crop changes it again) -- sizing the <svg> to the viewBox first means
  // the picture is never stretched.
  function svgToPng(stage, widthPt) {
    const vb = viewBoxOf(stage);
    stage.setAttribute('width', vb.w);
    stage.setAttribute('height', vb.h);
    const heightPt = widthPt * (vb.h / vb.w);
    return new Promise((resolve, reject) => {
      const xml = new XMLSerializer().serializeToString(stage);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(widthPt * RASTER_SCALE);
        canvas.height = Math.round(heightPt * RASTER_SCALE);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ png: canvas.toDataURL('image/png'), aspect: vb.h / vb.w });
      };
      img.onerror = (e) => reject(e);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    });
  }

  // ---- drawing one look -----------------------------------------------------
  // `cfg` is a bag of the card's own toggles; anything missing is the card's
  // default. Split is a different renderer with different knobs.
  function renderConfig(stage, entry, cfg) {
    const combo = entry.combo;
    if (entry.isSplit) {
      window.renderSplitDiagram(stage, combo.playKey, cfg.splitSide, cfg.insideOutside, cfg.readPosition || 'A',
        'seattle', 'seattle', !!cfg.passOn, null, 'pocket');
    } else {
      window.renderCardDiagram(stage, combo.playKey, cfg.direction, cfg.wingSide, null, '4x4', cfg.insideOutside,
        !!cfg.motionOn, !!cfg.bootOn, cfg.readPosition || 'A', !!cfg.counterOn, !!cfg.popVariantOn, entry.formationId,
        !!cfg.overloadOn, cfg.alignmentValues, !!cfg.qbSneakOn, !!cfg.reverseOn, !!cfg.qbKeepOn);
    }
  }

  function pathsFor(stage, pos) {
    const key = String(pos);
    // O-line paths carry no `player` (Firebase strips nulls) -- their id is the label.
    return (stage._lastRenderedPaths || []).filter((e) => String(e.player != null ? e.player : e.id) === key);
  }
  // CARRY / BLOCK / ROUTE / NONE, read off what the renderer actually drew.
  function roleFor(stage, pos) {
    const mine = pathsFor(stage, pos);
    if (!mine.length) return 'NONE';
    if (mine.some((e) => e.isBall)) return 'CARRY';
    // A route split at a "ball starts here" handoff point: both halves report
    // isBall:false, but the second half is drawn in the ball color.
    if (mine.some((e) => e.handoffFraction != null)
        && mine.some((e) => e.el && BALL_STROKES.indexOf(e.el.getAttribute('stroke')) !== -1)) return 'CARRY';
    if (mine.some((e) => e.isBlocking)) return 'BLOCK';
    return 'ROUTE';
  }

  // ---- which looks / add-ons a play has -----------------------------------
  // The card locks Direction for some plays (js/play-calls.js buildCard): a
  // noDirection play always calls the wing side, directionOpposesWing always
  // the other one. Only calls a coach can actually make are considered.
  function validLooks(combo, isSplit) {
    if (isSplit) return [{ splitSide: 'Left' }, { splitSide: 'Right' }];
    const looks = [];
    ['Left', 'Right'].forEach((wingSide) => {
      const dirs = combo.noDirection ? [wingSide] : (combo.directionOpposesWing ? [opposite(wingSide)] : ['Left', 'Right']);
      dirs.forEach((direction) => looks.push({ wingSide, direction }));
    });
    return looks;
  }
  // The look the card itself opens on.
  function defaultLook(combo, isSplit) {
    if (isSplit) return { splitSide: 'Right' };
    const direction = (combo.directionOpposesWing || combo.directionDefaultsAwayFromWing) ? 'Right' : 'Left';
    return { wingSide: 'Left', direction: combo.noDirection ? 'Left' : direction };
  }
  function baseConfig(combo) {
    return { insideOutside: combo.hasInsideOutside ? 'Outside' : null, readPosition: 'A' };
  }
  // Every single add-on the play offers. Only the ones that CHANGE the
  // position's job end up on the sheet.
  function variantsFor(combo, isSplit) {
    const v = [{ label: '', cfg: {}, alignment: false }];
    if (isSplit) { v.push({ label: 'Pass', cfg: { passOn: true }, alignment: false }); return v; }
    if (!combo.noMotion) v.push({ label: 'Motion', cfg: { motionOn: true }, alignment: false });
    if (!combo.noBoot) v.push({ label: 'Boot', cfg: { bootOn: true }, alignment: false });
    if (combo.hasCounter) v.push({ label: 'Counter', cfg: { counterOn: true }, alignment: false });
    if (combo.hasPopVariant) v.push({ label: 'Pop variant', cfg: { popVariantOn: true }, alignment: false });
    if (combo.hasInsideOutside) v.push({ label: 'Inside', cfg: { insideOutside: 'Inside' }, alignment: false });
    if (combo.hasReadToggle) v.push({ label: 'Read B', cfg: { readPosition: 'B' }, alignment: false });
    if (!combo.noOverload) v.push({ label: 'Overload', cfg: { overloadOn: true }, alignment: true });
    if (combo.hasQbSneak) v.push({ label: 'QB Sneak', cfg: { qbSneakOn: true }, alignment: false });
    if (combo.hasQbKeep) v.push({ label: 'QB Keep', cfg: { qbKeepOn: true }, alignment: false });
    if (combo.hasReverse) v.push({ label: 'Reverse', cfg: { reverseOn: true }, alignment: false });
    // Formation-level alignment toggles (Heavy, Overload R/L...) -- the first
    // value of each is its default, so only the others are variants.
    (combo.alignmentToggles || []).forEach((t) => {
      (t.values || []).slice(1).forEach((val) => {
        v.push({ label: `${t.label} ${val.label}`, cfg: { alignmentValues: { [t.id]: val.id } }, alignment: true });
      });
    });
    return v;
  }

  // "when the wing is Left" / "when the play goes Right" -- only said when the
  // job isn't the same on every look.
  function conditionText(group, all, combo, isSplit) {
    if (group.length === all.length) return '';
    if (isSplit) return group.map((l) => 'Split ' + l.splitSide).join(' / ');
    const freeDir = !combo.noDirection && !combo.directionOpposesWing;
    const sameWing = group.every((l) => l.wingSide === group[0].wingSide);
    if (sameWing && (!freeDir || group.length === all.filter((l) => l.wingSide === group[0].wingSide).length)) {
      return 'when the wing is ' + group[0].wingSide;
    }
    const sameDir = freeDir && group.every((l) => l.direction === group[0].direction);
    if (sameDir && group.length === all.filter((l) => l.direction === group[0].direction).length) {
      return 'when the play goes ' + group[0].direction;
    }
    return group.map((l) => freeDir ? `Wing ${l.wingSide[0]} / Dir ${l.direction[0]}` : `Wing ${l.wingSide[0]}`).join(', ');
  }

  // ---- where does the position stand? ------------------------------------
  function circlesOf(stage) {
    const out = {};
    Array.from(stage.querySelectorAll('g')).forEach((g) => {
      if (g.children.length < 2 || g.children[0].tagName !== 'circle' || g.children[1].tagName !== 'text') return;
      const label = g.children[1].textContent.trim();
      if (!OFFENSE_LABEL.test(label)) return;   // defenders are DE/DT/LB/CB/S
      out[label] = { x: Number(g.children[0].getAttribute('cx')), y: Number(g.children[0].getAttribute('cy')) };
    });
    return out;
  }
  // "Just off the line, on the right side, outside #6."
  function describeSpot(pos, circles) {
    const me = circles[String(pos)];
    if (!me) return null;
    const line = LINE_LABELS.map((k) => circles[k]).filter(Boolean);
    const lineY = median(line.map((c) => c.y));
    const centerX = circles.C ? circles.C.x : median(line.map((c) => c.x));
    const dy = me.y - lineY;
    const dx = me.x - centerX;
    const group = (y) => ((y - lineY) <= 110 ? 'line' : 'back');
    const myGroup = group(me.y);
    const depth = dy <= 35 ? 'on the line' : (dy <= 110 ? 'just off the line' : 'in the backfield');
    const side = Math.abs(dx) < 45 ? 'in the middle' : (dx > 0 ? 'on the right side' : 'on the left side');

    // The teammate standing between you and the middle, at your depth, closest to you.
    const candidates = Object.keys(circles).filter((k) => {
      if (k === String(pos)) return false;
      const c = circles[k];
      if (group(c.y) !== myGroup) return false;
      const cdx = c.x - centerX;
      const closer = Math.abs(cdx) < Math.abs(dx);
      const sameSide = (cdx > 0) === (dx > 0) || Math.abs(cdx) < 45;
      return closer && sameSide;
    }).sort((a, b) => Math.abs(circles[b].x - centerX) - Math.abs(circles[a].x - centerX));
    let neighbor = '';
    if (candidates.length) {
      const lab = posLabel(candidates[0]);
      neighbor = (myGroup === 'line' ? 'outside ' : 'next to ') + lab;
    } else if (myGroup === 'line' && Math.abs(dx) >= 45) {
      neighbor = 'at the end of the line';
    }
    const parts = [depth.charAt(0).toUpperCase() + depth.slice(1), side];
    if (neighbor) parts.push(neighbor);
    return parts.join(', ') + '.';
  }

  // ---- highlighting the position on a rendered stage ----------------------
  function highlight(stage, pos) {
    const key = String(pos);
    const mainG = stage.firstElementChild;
    const pathsLayer = mainG && mainG.children[0];
    (stage._lastRenderedPaths || []).forEach((e) => {
      const mine = String(e.player != null ? e.player : e.id) === key;
      [e.el, e.arrowEl].forEach((n) => {
        if (!n) return;
        if (!mine) n.setAttribute('opacity', '0.16');
        else if (n.tagName === 'path') n.setAttribute('stroke-width', String(Number(n.getAttribute('stroke-width') || 16) * 1.3));
      });
    });
    if (pathsLayer) Array.from(pathsLayer.querySelectorAll('text')).forEach((t) => t.setAttribute('opacity', '0.3'));
    const isCircleGroup = (n) => n.tagName === 'g' && n.children.length >= 2 && n.children[0].tagName === 'circle' && n.children[1].tagName === 'text';
    const circleGroups = Array.from(stage.querySelectorAll('g')).filter(isCircleGroup);
    // The week's defensive assignments (man lines, zone shading, blitz arrows) are
    // drawn into the circles layer too. They aren't part of this player's job here,
    // and a red dashed blitz line would read as "you carry the ball" -- so they go.
    if (circleGroups.length) {
      Array.from(circleGroups[0].parentNode.children).forEach((n) => { if (!isCircleGroup(n)) n.remove(); });
    }
    circleGroups.forEach((g) => {
      if (g.children[1].textContent.trim() !== key) { g.setAttribute('opacity', '0.3'); return; }
      const c = g.children[0];
      const cx = c.getAttribute('cx'), cy = Number(c.getAttribute('cy'));
      const halo = document.createElementNS(SVG_NS, 'circle');
      halo.setAttribute('cx', cx); halo.setAttribute('cy', cy); halo.setAttribute('r', '62');
      halo.setAttribute('fill', '#fff1dd'); halo.setAttribute('stroke', '#e8720c'); halo.setAttribute('stroke-width', '7');
      g.insertBefore(halo, c);
      const tag = document.createElementNS(SVG_NS, 'text');
      tag.setAttribute('x', cx); tag.setAttribute('y', String(cy - 76));
      tag.setAttribute('font-size', '38'); tag.setAttribute('font-weight', '900'); tag.setAttribute('text-anchor', 'middle');
      tag.setAttribute('fill', '#e8720c'); tag.textContent = 'YOU';
      g.appendChild(tag);
    });
  }

  // ---- the analysis -------------------------------------------------------
  // For every formation with plays: where the position lines up, and every
  // (play x add-on x look) that gives it a job, grouped into tiles.
  async function analyze(stage, pos, onProgress) {
    const result = { alignments: [], entries: [], none: [] };
    const formations = orderedFormations();
    for (const f of formations) {
      const combos = await window.playsForFormation(f.id);
      if (!combos.length) continue;
      if (onProgress) onProgress(`Reading ${formationName(f.id)}…`);
      const isSplit = f.id === 'split';
      const formationId = f.id === 'wing' ? undefined : f.id;
      const meta = { formationKey: f.id, formationName: formationName(f.id), isSplit, formationId };

      for (const combo of combos) {
        const entryBase = Object.assign({ combo }, meta);
        const looks = validLooks(combo, isSplit);
        const def = defaultLook(combo, isSplit);
        const variants = variantsFor(combo, isSplit);
        const basePart = baseConfig(combo);

        // role[variantIndex][lookIndex]
        const roles = variants.map((v) => looks.map((look) => {
          try {
            renderConfig(stage, entryBase, Object.assign({}, basePart, v.cfg, look));
            return roleFor(stage, pos);
          } catch (e) {
            console.error('[crash course] could not read', f.id, combo.playKey, v.label, e);
            return 'ERR';
          }
        }));

        const pushGroup = (variantIdx, role, groupLooks) => {
          if (role === 'ERR') return;
          const v = variants[variantIdx];
          if (role === 'NONE') { if (variantIdx === 0) result.none.push({ formationName: meta.formationName, label: combo.label }); return; }
          const sample = groupLooks.find((l) => JSON.stringify(l) === JSON.stringify(def)) || groupLooks[0];
          const cfg = Object.assign({}, basePart, v.cfg, sample);
          // The shape of the position's own line(s) as drawn. Two plays where it's
          // identical are the same job, and get merged into one tile below.
          renderConfig(stage, entryBase, cfg);
          const sig = pathsFor(stage, pos).map((e) => e.el.getAttribute('d')).join('|');
          result.entries.push(Object.assign({}, entryBase, {
            variantLabel: v.label, role, sig, cfg,
            condition: conditionText(groupLooks, looks, combo, isSplit),
          }));
        };

        // the play as called, with no add-on
        groupBy(looks.map((look, li) => ({ look, role: roles[0][li] })), (x) => x.role)
          .forEach((items, role) => pushGroup(0, role, items.map((x) => x.look)));
        // add-ons: only where they change the job relative to the plain call on the same look
        for (let vi = 1; vi < variants.length; vi++) {
          const changed = looks.map((look, li) => ({ look, role: roles[vi][li], baseRole: roles[0][li] })).filter((x) => x.role !== x.baseRole);
          groupBy(changed, (x) => x.role).forEach((items, role) => pushGroup(vi, role, items.map((x) => x.look)));
        }
      }

      try {
        result.alignments.push(await alignmentFor(stage, pos, f, combos, meta));
      } catch (e) {
        // one formation's picture failing shouldn't sink the whole sheet
        console.error('[crash course] could not draw the lineup for', f.id, e);
      }
    }
    return result;
  }

  // Where the position stands in this formation: a clean picture (no routes),
  // a plain-English line, and a note for each add-on that moves him.
  async function alignmentFor(stage, pos, f, combos, meta) {
    const first = combos[0];
    const entryBase = Object.assign({ combo: first }, meta);
    const def = defaultLook(first, meta.isSplit);
    const base = Object.assign({}, baseConfig(first), def);
    renderConfig(stage, entryBase, base);
    const circles = circlesOf(stage);
    const out = { formationKey: f.id, formationName: meta.formationName, present: !!circles[String(pos)], text: '', notes: [], png: null };
    if (!out.present) return out;
    out.text = describeSpot(pos, circles);

    // does the spot flip with the wing / split call?
    const other = meta.isSplit ? { splitSide: opposite(def.splitSide) } : { wingSide: opposite(def.wingSide), direction: def.direction };
    renderConfig(stage, entryBase, Object.assign({}, baseConfig(first), other));
    const flipped = circlesOf(stage)[String(pos)];
    const here = circles[String(pos)];
    if (flipped && Math.abs(flipped.x - here.x) > 60) {
      out.notes.push(meta.isSplit
        ? `Picture shows Split ${def.splitSide}. On Split ${opposite(def.splitSide)} you're on the other side.`
        : `Picture shows the wing on the ${def.wingSide}. When the wing is ${opposite(def.wingSide)}, you're on the other side.`);
    }

    // add-ons that move him (Overload, Heavy...) -- first play that offers each
    const seen = new Set();
    for (const combo of combos) {
      for (const v of variantsFor(combo, meta.isSplit).filter((x) => x.alignment)) {
        if (seen.has(v.label)) continue;
        seen.add(v.label);
        const d = defaultLook(combo, meta.isSplit);
        renderConfig(stage, Object.assign({ combo }, meta), Object.assign({}, baseConfig(combo), d, v.cfg));
        const moved = circlesOf(stage);
        const m = moved[String(pos)];
        if (m && Math.abs(m.x - here.x) + Math.abs(m.y - here.y) > 40) {
          const spot = describeSpot(pos, moved);
          if (spot !== out.text) {
            out.notes.push(`With ${v.label}: ${spot}`);
          } else {
            // same words, different place -- say how far he moves (a spot is one lineman's width)
            const cx0 = circles.C ? circles.C.x : 0, cx1 = moved.C ? moved.C.x : cx0;
            const spots = Math.round((Math.abs(m.x - cx1) - Math.abs(here.x - cx0)) / 115);
            out.notes.push(spots === 0
              ? `With ${v.label}: you shift over a little.`
              : `With ${v.label}: you slide ${Math.abs(spots)} spot${Math.abs(spots) === 1 ? '' : 's'} ${spots > 0 ? 'farther out' : 'closer in'}.`);
          }
        }
      }
    }
    out.notes = out.notes.slice(0, 3);

    // the picture: the default alignment, no routes, cropped to the offense
    renderConfig(stage, entryBase, base);
    const mainG = stage.firstElementChild;
    if (mainG && mainG.children.length >= 2) mainG.removeChild(mainG.children[0]);
    // where you line up has nothing to do with the defense -- offense only
    Array.from(stage.querySelectorAll('g')).forEach((g) => {
      if (g.children.length >= 2 && g.children[0].tagName === 'circle' && g.children[1].tagName === 'text'
          && !OFFENSE_LABEL.test(g.children[1].textContent.trim())) g.remove();
    });
    highlight(stage, pos);
    const topPad = (window.DATA && window.DATA.topPad) || 0;
    const xs = Object.values(circles).map((c) => c.x), ys = Object.values(circles).map((c) => c.y);
    const x0 = Math.min.apply(null, xs) - 130, x1 = Math.max.apply(null, xs) + 130;
    const y0 = Math.min.apply(null, ys) + topPad - 130, y1 = Math.max.apply(null, ys) + topPad + 80;
    stage.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
    const img = await svgToPng(stage, 258);
    out.png = img.png; out.aspect = img.aspect;
    return out;
  }

  // ---- the PDF ------------------------------------------------------------
  async function generatePositionCrashCoursePDF(position, opts) {
    opts = opts || {};
    const pos = String(position == null ? '4' : position);
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    if (!window.DATA || !window.DATA.playTypes) throw new Error('Play data not loaded yet.');
    if (!window.renderCardDiagram || !window.playsForFormation || !window.Formations) throw new Error('Play renderer not loaded yet.');
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');
    // Same first step the other PDFs take: coaches' latest saved edits, not a snapshot.
    if (window.loadLiveEditsIntoData) await window.loadLiveEditsIntoData();

    const { svg: stage, wrap: stageWrap } = makeStage();
    let analysis;
    try {
      analysis = await analyze(stage, pos, onProgress);
    } catch (e) { stageWrap.remove(); throw e; }

    // Plays where the position's own line is IDENTICAL are the same job -- one
    // tile naming all of them (e.g. every Split play, or the Wing plays where the
    // 4 makes the same block) instead of the same picture over and over.
    const byRole = { CARRY: [], ROUTE: [], BLOCK: [] };
    const merged = new Map();
    analysis.entries.forEach((e) => {
      if (!byRole[e.role]) return;
      const key = [e.formationKey, e.role, e.variantLabel, e.condition, e.sig].join('|');
      if (merged.has(key)) { merged.get(key).names.push(e.combo.label); return; }
      const g = Object.assign({}, e, { names: [e.combo.label] });
      merged.set(key, g);
      byRole[e.role].push(g);
    });
    // "N plays" counts distinct plays -- not add-on variants, not merged tiles
    const playCount = (role) => new Set(analysis.entries.filter((e) => e.role === role)
      .map((e) => e.formationKey + '|' + e.combo.playKey)).size;
    const counts = { CARRY: playCount('CARRY'), ROUTE: playCount('ROUTE'), BLOCK: playCount('BLOCK'), NONE: analysis.none.length };

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const PAGE_W = 612, PAGE_H = 792, M = 30, USABLE_W = PAGE_W - 2 * M;
    let y = M, pageNo = 0;
    function newPage() { if (pageNo > 0) doc.addPage(); pageNo++; y = M; }
    function ensureRoom(h) { if (y + h > PAGE_H - M - 8) newPage(); }
    function setText(font, size, color) { doc.setFont('helvetica', font); doc.setFontSize(size); doc.setTextColor(color); }
    newPage();

    // -- title band
    doc.setFillColor('#1b1b1b'); doc.rect(0, 0, PAGE_W, 76, 'F');
    doc.setFillColor('#e8720c'); doc.rect(0, 76, PAGE_W, 4, 'F');
    setText('bold', 8, '#f3a65a'); doc.text('ASL BENGALS 11U  ·  POSITION CRASH COURSE', M, 24);
    setText('bold', 26, '#ffffff'); doc.text(positionTitle(pos), M, 56);
    if (opts.playerName) { setText('bold', 11, '#ffffff'); doc.text('For: ' + opts.playerName, PAGE_W - M, 38, { align: 'right' }); }
    setText('normal', 8, '#cfcfcf'); doc.text(new Date().toLocaleDateString(), PAGE_W - M, 56, { align: 'right' });
    y = 96;

    // -- at a glance
    const BOX_GAP = 8, BOX_W = (USABLE_W - 2 * BOX_GAP) / 3, BOX_H = 50;
    [['CARRY', 'plays you carry the ball'], ['ROUTE', 'plays you run a route'], ['BLOCK', 'plays you block']].forEach(([role, label], i) => {
      const bx = M + i * (BOX_W + BOX_GAP);
      doc.setDrawColor('#d5d5d5'); doc.setLineWidth(0.8); doc.roundedRect(bx, y, BOX_W, BOX_H, 5, 5);
      doc.setFillColor(ROLE_COLOR[role]); doc.roundedRect(bx, y, 5, BOX_H, 2, 2, 'F');
      setText('bold', 24, ROLE_COLOR[role]); doc.text(String(counts[role]), bx + 16, y + 32);
      setText('normal', 8, '#444444'); doc.text(label, bx + 46, y + 30);
    });
    y += BOX_H + 12;

    // -- legend
    const legendY = y + 8;
    setText('bold', 7.5, '#222222'); doc.text('HOW TO READ THE PICTURES', M, legendY);
    const lg = legendY + 14;
    doc.setLineWidth(3);
    doc.setDrawColor(ROLE_COLOR.CARRY); doc.line(M, lg, M + 22, lg);
    setText('normal', 7.5, '#333333'); doc.text('Red line: you carry the ball', M + 28, lg + 2.5);
    doc.setDrawColor(ROLE_COLOR.ROUTE); doc.line(M + 150, lg, M + 172, lg);
    doc.setFillColor(ROLE_COLOR.ROUTE); doc.triangle(M + 172, lg - 4, M + 172, lg + 4, M + 179, lg, 'F');
    doc.text('Blue arrow: your route', M + 184, lg + 2.5);
    doc.setDrawColor(ROLE_COLOR.BLOCK); doc.line(M + 295, lg, M + 316, lg); doc.setLineWidth(3.5); doc.line(M + 316, lg - 4, M + 316, lg + 4);
    doc.setLineWidth(3); doc.text('Orange T: your block', M + 324, lg + 2.5);
    doc.setDrawColor('#e8720c'); doc.setFillColor('#fff1dd'); doc.setLineWidth(1.6); doc.circle(M + 452, lg, 5.5, 'FD');
    doc.text('Orange ring + YOU: that’s you (the rest are faded)', M + 462, lg + 2.5, { maxWidth: PAGE_W - M - (M + 462) });
    y = lg + 20;

    // -- section header helper
    function sectionHeader(num, title, subtitle, color, needBelow) {
      ensureRoom(34 + (needBelow || 12));
      doc.setFillColor(color); doc.rect(M, y, 5, 24, 'F');
      setText('bold', 13, '#111111'); doc.text(`${num}. ${title}`, M + 12, y + 11);
      setText('normal', 8, '#666666'); doc.text(subtitle, M + 12, y + 22, { maxWidth: USABLE_W - 12 });
      y += 34;
    }

    // -- 1. where you line up
    sectionHeader(1, 'WHERE YOU LINE UP', 'The orange ring marked YOU is your spot. Look at the picture first, then the words under it.', '#e8720c');
    const aligned = analysis.alignments.filter((a) => a.present && a.png);
    const A_GAP = 10, A_W = (USABLE_W - A_GAP) / 2, A_IMG_H = 112, A_HEAD_H = 14;
    for (const row of chunk(aligned, 2)) {
      // card height is driven by the tallest note block in the row
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6);
      const textBlocks = row.map((a) => doc.splitTextToSize([a.text].concat(a.notes).join('  '), A_W - 10));
      const rowH = A_HEAD_H + A_IMG_H + 8 + Math.max.apply(null, textBlocks.map((t) => t.length)) * 9.4 + 8;
      ensureRoom(rowH);
      row.forEach((a, i) => {
        const ax = M + i * (A_W + A_GAP);
        doc.setDrawColor('#d5d5d5'); doc.setLineWidth(0.6); doc.rect(ax, y, A_W, rowH);
        doc.setFillColor(formationColor(a.formationKey)); doc.rect(ax, y, A_W, A_HEAD_H, 'F');
        setText('bold', 8, '#ffffff'); doc.text(a.formationName.toUpperCase(), ax + 6, y + A_HEAD_H - 4);
        const iw = Math.min(A_W - 8, (A_IMG_H) / a.aspect), ih = iw * a.aspect;
        doc.addImage(a.png, 'PNG', ax + (A_W - iw) / 2, y + A_HEAD_H + 4 + (A_IMG_H - ih) / 2, iw, ih);
        // plain-English line first (bold), notes after (normal)
        let ty = y + A_HEAD_H + A_IMG_H + 14;
        setText('bold', 7.8, '#111111');
        const main = doc.splitTextToSize(a.text, A_W - 12);
        doc.text(main, ax + 6, ty); ty += main.length * 9.4;
        setText('normal', 7.2, '#555555');
        a.notes.forEach((n) => { const nl = doc.splitTextToSize(n, A_W - 12); doc.text(nl, ax + 6, ty); ty += nl.length * 8.8; });
      });
      y += rowH + 8;
    }
    if (!aligned.length) { setText('italic', 9, '#777777'); doc.text('This position isn’t used in the current formations.', M, y + 8); y += 20; }
    y += 6;

    // -- play tiles: one picture per distinct job, grouped by formation within each
    // role. A section is fully drawn (rasterized and measured) BEFORE anything is
    // placed, so its header can never be left stranded at the bottom of a page.
    const TILE_GAP = 8;
    const lineH = (size) => size * 1.15;
    async function prepareTiles(groups, cols) {
      const W = (USABLE_W - (cols - 1) * TILE_GAP) / cols;
      const tiles = [];
      for (const g of groups) {
        if (onProgress) onProgress(`Drawing ${g.names[0]} (${g.formationName})\u2026`);
        let img;
        try {
          renderConfig(stage, g, g.cfg);
          highlight(stage, pos);
          img = await svgToPng(stage, W);
        } catch (e) {
          console.error('[crash course] could not draw', g.names[0], g.formationName, e);
          continue;   // skip this tile; the rest of the sheet still builds
        }
        const titleSize = g.names.length > 1 ? 7.2 : 7.8;
        setText('bold', titleSize, '#111111');
        const titleLines = doc.splitTextToSize(g.names.join(', '), W - 8).slice(0, 3);
        const capH = 5 + titleLines.length * lineH(titleSize) + lineH(6.6) + (g.condition ? lineH(6.4) + 1 : 0) + 3;
        tiles.push({ g, png: img.png, imgH: W * img.aspect, titleSize, titleLines, h: 3 + W * img.aspect + capH });
      }
      const byFormation = [];
      groupBy(tiles, (t) => t.g.formationKey).forEach((ts, fKey) => {
        byFormation.push({ fKey, plays: ts.reduce((n, t) => n + t.g.names.length, 0), rows: chunk(ts, cols) });
      });
      return byFormation;
    }
    function drawTileGroups(byFormation, cols) {
      const W = (USABLE_W - (cols - 1) * TILE_GAP) / cols;
      const strip = (fg, cont) => {
        doc.setFillColor(formationColor(fg.fKey)); doc.rect(M, y, USABLE_W, 11, 'F');
        setText('bold', 7.4, '#ffffff');
        doc.text(`${formationName(fg.fKey).toUpperCase()}  (${fg.plays} ${fg.plays === 1 ? 'play' : 'plays'})${cont ? '  — continued' : ''}`, M + 5, y + 8.2);
        y += 14;
      };
      for (const fg of byFormation) {
        ensureRoom(14 + Math.max.apply(null, fg.rows[0].map((t) => t.h)));
        strip(fg, false);
        for (let ri = 0; ri < fg.rows.length; ri++) {
          const row = fg.rows[ri];
          const rowH = Math.max.apply(null, row.map((t) => t.h));
          // a formation that runs onto a new page says so, instead of floating without a label
          if (ri > 0 && y + rowH > PAGE_H - M - 8) { newPage(); strip(fg, true); }
          row.forEach((t, c) => {
            const tx = M + c * (W + TILE_GAP);
            doc.setDrawColor('#d5d5d5'); doc.setLineWidth(0.6); doc.rect(tx, y, W, rowH);
            doc.setFillColor(ROLE_COLOR[t.g.role]); doc.rect(tx, y, W, 2.2, 'F');
            doc.addImage(t.png, 'PNG', tx, y + 3, W, t.imgH);
            let ty = y + 3 + t.imgH + 9;
            setText('bold', t.titleSize, '#111111');
            doc.text(t.titleLines, tx + 4, ty);
            ty += t.titleLines.length * lineH(t.titleSize);
            const sub = t.g.formationName + (t.g.variantLabel ? ' + ' + t.g.variantLabel : '');
            setText('normal', 6.6, '#666666');
            doc.text(doc.splitTextToSize(sub, W - 8)[0], tx + 4, ty);
            if (t.g.condition) {
              ty += lineH(6.4) + 1;
              setText('bold', 6.4, ROLE_COLOR[t.g.role]);
              doc.text(doc.splitTextToSize(t.g.condition, W - 8)[0], tx + 4, ty);
            }
          });
          y += rowH + 5;
        }
        y += 3;
      }
    }

    const sections = [
      ['CARRY', 2, 'YOU CARRY THE BALL', 'Designed runs for you. Follow the red line \u2014 the ball is coming to you.'],
      ['ROUTE', 3, 'YOU RUN A ROUTE', 'Follow the blue arrow. Run it all the way, every time, even when the ball isn\u2019t coming to you.'],
      ['BLOCK', 4, 'YOU BLOCK', 'The orange line ends with a T \u2014 that\u2019s your block. Get there and stay on your man.'],
    ];
    for (const [role, num, title, subtitle] of sections) {
      if (!byRole[role].length) {
        sectionHeader(num, title, subtitle, ROLE_COLOR[role], 18);
        setText('italic', 9, '#777777');
        doc.text('None in the plays set up right now.', M + 12, y + 2); y += 18;
        continue;
      }
      const prepared = await prepareTiles(byRole[role], 3);
      if (!prepared.length) {
        sectionHeader(num, title, subtitle, ROLE_COLOR[role], 18);
        setText('italic', 9, '#777777');
        doc.text('These pictures couldn\u2019t be drawn. Try again, or tell Nathan.', M + 12, y + 2); y += 18;
        continue;
      }
      // header + the first formation strip + the first row have to fit together
      sectionHeader(num, title, subtitle, ROLE_COLOR[role], 14 + Math.max.apply(null, prepared[0].rows[0].map((t) => t.h)));
      drawTileGroups(prepared, 3);
      y += 4;
    }

    if (analysis.none.length) {
      ensureRoom(40);
      setText('bold', 8.5, '#111111'); doc.text('No assignment drawn for you on:', M, y + 8);
      setText('normal', 8, '#555555');
      const lines = doc.splitTextToSize(analysis.none.map((n) => `${n.label} (${n.formationName})`).join(', '), USABLE_W);
      doc.text(lines, M, y + 19);
      y += 22 + lines.length * 9.4;
    }

    stageWrap.remove();

    // footer on every page
    const buildLabel = window.BUILD_V ? `Build ${window.BUILD_V}` : 'ASL Bengals';
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      setText('normal', 6.8, '#999999');
      doc.text(`ASL Bengals crash course · ${positionTitle(pos)} · ${buildLabel}`, M, PAGE_H - 14);
      doc.text(`Page ${p} of ${pageCount}`, PAGE_W - M, PAGE_H - 14, { align: 'right' });
    }

    return { doc, summary: { position: pos, counts, formations: analysis.alignments.map((a) => a.formationName) } };
  }

  window.generatePositionCrashCoursePDF = generatePositionCrashCoursePDF;
})();

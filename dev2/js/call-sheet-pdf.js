// ---------------------------------------------------------------------------
// Play Call Chart PDF (a.k.a. "Print Play Sheet" in Coach Tools > Resources).
//
// Replaces the old plain numbered-index call sheet with the landscape
// decision-tree chart Nathan designed by hand over a few review rounds:
// Formation -> Side -> (Motion, Wing only) -> Play Call -> Direction ->
// (Boot, Wing / Pass, Split), plus a Receiver Routes reference at the
// bottom showing the real route shapes for Seattle/Houston/Florida/Boston,
// drawn Left and Right, pulled live from window.DATA.splitRoutes.
//
// Layout/box chrome (rects, rounded rects, text) is drawn as native jsPDF
// vector content -- reliable and crisp, the same approach call-sheet-pdf.js
// always used. The curved route paths are the one thing jsPDF's own path
// API has burned this codebase before (see playbook-pdf.js's note: "curve
// /path shapes wrong on anything more complex than a gentle bend, confirmed
// even after flattening into hundreds of line segments"). So exactly like
// playbook-pdf.js's diagrams, each route icon is built as a real <svg>,
// rasterized through the browser's own SVG renderer via a plain <img>
// decode + canvas (svgToPng), then embedded as a PNG. Can't misdraw a curve
// the browser itself is rendering.
// ---------------------------------------------------------------------------
(function () {

  const COLOR = {
    orange: '#ff6a13', orangeDark: '#e0570a', black: '#111111',
    ink: '#1b1b1b', muted: '#6b6a66', line: '#d8d3c8', paper: '#faf9f6',
    motion: '#1baf7a', motionTint: '#e6f7f0',
    boot: '#e34948', bootTint: '#fdecec',
    pass: '#2a78d6', passTint: '#e9f1fb',
    // Nathan: "make sure if a coach prints the play calls, it's reflective
    // to the options we have in the play calls" -- Counter (Option/Outside
    // Zone/Blast, see hasCounter in data/plays.json) is a real, coach-
    // callable toggle in the live app (counterToggle in index.html) but
    // this chart never mentioned it anywhere. Given its own color (distinct
    // from Boot's red, since the two are mutually exclusive per-call and
    // shouldn't read as the same option) so the legend dot and the play-chip
    // badge below both key off one consistent color.
    counter: '#6b3fa0', counterTint: '#efe7f7',
  };

  // Coach's chosen call-order (matches the app's own play grid, and keeps
  // Wing and Split reading the same left-to-right so a coach scanning both
  // bands doesn't have to re-search for a play).
  const PLAY_ORDER = ['inside_zone', 'outside_zone', 'blast', 'sweep', 'option', 'option_pass', 'double_blast'];
  const ROUTE_NAMES = ['seattle', 'houston', 'florida', 'boston'];

  // ---- SVG rasterization helpers (same pattern as playbook-pdf.js's
  // makeStage/svgToPng -- kept local here since these two files don't share
  // an internal module scope). ----
  function makeStage(vw, vh) {
    const wrap = document.createElement('div');
    wrap.style.position = 'fixed';
    wrap.style.left = '-99999px';
    wrap.style.top = '0';
    wrap.style.width = '0';
    wrap.style.height = '0';
    wrap.style.overflow = 'hidden';
    document.body.appendChild(wrap);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    svg.setAttribute('width', vw);
    svg.setAttribute('height', vh);
    wrap.appendChild(svg);
    return { svg, wrap };
  }

  function svgToPng(stage, cellWpt, cellHpt, scale) {
    return new Promise((resolve, reject) => {
      const xml = new XMLSerializer().serializeToString(stage);
      const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      const img = new Image();
      img.onload = () => {
        const canvasEl = document.createElement('canvas');
        canvasEl.width = Math.round(cellWpt * scale);
        canvasEl.height = Math.round(cellHpt * scale);
        const ctx = canvasEl.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
        resolve(canvasEl.toDataURL('image/png'));
      };
      img.onerror = (e) => reject(e);
      img.src = dataUri;
    });
  }

  // ---- Route icon geometry -- ports the same normalize/scale/quad-bezier
  // math the app itself uses to draw these (play-calls.js quadPathD/
  // straightPathD): 2-point routes are a straight line, 3-point routes are
  // a QUADRATIC BEZIER through [start, control, end] -- not a polyline
  // through all three, which looks visibly wrong (sharp Vs instead of the
  // real curl/comeback/out shapes). Computed live from window.DATA
  // .splitRoutes so an edited route reprints correctly without a code change. ----
  // Nathan, on the first pass at these icons (both routes redrawn from a
  // shared synthetic start point): "it needs to be more visual... use the
  // images provided for the routes. The lower receiver is inside man." His
  // reference screenshots are crops of the app's own diagram: two numbered
  // circles sitting at their REAL relative field position (the wide guy
  // up, the flex/inside guy below-right of him -- they're naturally
  // "stacked" because that's really where they line up), each with its own
  // colored route. So this keeps both routes in one pair's TRUE relative
  // geometry (via DATA.split[side], not renormalized to a shared origin)
  // instead of collapsing both to one point.
  function buildRouteGeometry(splitRoutes) {
    const sides = ['Left', 'Right'];
    const roles = ['wide', 'flex'];
    const W = 100, H = 84, padL = 15, padR = 15, padT = 15, padB = 15;
    const innerW = W - padL - padR, innerH = H - padT - padB;

    // One shared scale across every pair so a deep route (Houston) reads
    // visibly longer than a short one (Boston) -- fit the scale to
    // whichever pair is largest, then center each pair individually within
    // its own icon at that same scale.
    const pairBBox = {};
    let maxSpanX = 0, maxSpanY = 0;
    sides.forEach(side => ROUTE_NAMES.forEach(name => {
      const pts = splitRoutes[side].wide[name].concat(splitRoutes[side].flex[name]);
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const bbox = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      pairBBox[`${side}_${name}`] = bbox;
      maxSpanX = Math.max(maxSpanX, bbox[1] - bbox[0]);
      maxSpanY = Math.max(maxSpanY, bbox[3] - bbox[2]);
    }));
    const scale = Math.min(innerW / maxSpanX, innerH / maxSpanY);

    function pathD(pts) {
      if (pts.length === 2) {
        const [[x0, y0], [x1, y1]] = pts;
        return { d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`, end: [x1, y1], tangent: [x1 - x0, y1 - y0] };
      }
      const [[x0, y0], [x1, y1], [x2, y2]] = pts;
      return { d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${x1.toFixed(1)} ${y1.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`, end: [x2, y2], tangent: [x2 - x1, y2 - y1] };
    }
    function arrowPts(end, tangent, length, half) {
      const [ex, ey] = end, [dx, dy] = tangent;
      const norm = Math.hypot(dx, dy) || 1;
      const ux = dx / norm, uy = dy / norm, bx = -uy, by = ux;
      const backx = ex - ux * length, backy = ey - uy * length;
      const p1 = [backx + bx * half, backy + by * half], p2 = [backx - bx * half, backy - by * half];
      return `${ex.toFixed(1)},${ey.toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }

    const out = {};
    sides.forEach(side => ROUTE_NAMES.forEach(name => {
      const bbox = pairBBox[`${side}_${name}`];
      const cx0 = (bbox[0] + bbox[1]) / 2, cy0 = (bbox[2] + bbox[3]) / 2;
      const toSvg = (pts) => pts.map(([x, y]) => [W / 2 + (x - cx0) * scale, H / 2 + (y - cy0) * scale]);
      roles.forEach(role => {
        const rawPts = splitRoutes[side][role][name];
        const svgPts = toSvg(rawPts);
        const { d, end, tangent } = pathD(svgPts);
        const startPt = svgPts[0];
        out[`${side}_${name}_${role}`] = {
          d, arrow: arrowPts(end, tangent, 7, 3),
          startX: startPt[0], startY: startPt[1],
          player: splitRoutes[side][role].player,
        };
      });
    }));
    return { geo: out, W, H };
  }

  function renderRouteIcon(svgEl, geo, W, H, name) {
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    const NS = 'http://www.w3.org/2000/svg';
    const GAP = 18;
    const totalW = W * 2 + GAP;
    svgEl.setAttribute('viewBox', `0 0 ${totalW} ${H}`);
    svgEl.setAttribute('width', totalW);
    svgEl.setAttribute('height', H);
    const ROLE_COLOR = { wide: COLOR.pass, flex: COLOR.boot };
    ['Left', 'Right'].forEach((side, i) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `translate(${i * (W + GAP)},0)`);
      // Circles first, THEN routes on top -- #5/#3 (or #6/#2) line up close
      // enough that their circles overlap, so a route drawn underneath can
      // vanish behind the OTHER player's circle right where it starts
      // (confirmed on Seattle's flex route -- almost entirely hidden
      // behind the wide receiver's circle). Routes on top guarantees the
      // full path is always visible; the tradeoff (a route stub crossing
      // through a nearby circle) reads fine and matches the density of the
      // reference screenshots.
      ['wide', 'flex'].forEach(role => {
        const entry = geo[`${side}_${name}_${role}`];
        const circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', entry.startX); circle.setAttribute('cy', entry.startY);
        circle.setAttribute('r', 9);
        circle.setAttribute('fill', '#ffffff');
        circle.setAttribute('stroke', COLOR.black);
        circle.setAttribute('stroke-width', 2.2);
        g.appendChild(circle);
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', entry.startX); t.setAttribute('y', entry.startY + 3.3);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('font-size', '9.5');
        t.setAttribute('font-weight', '900');
        t.setAttribute('font-style', 'italic');
        t.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
        t.setAttribute('fill', COLOR.black);
        t.textContent = entry.player;
        g.appendChild(t);
      });
      ['wide', 'flex'].forEach(role => {
        const entry = geo[`${side}_${name}_${role}`];
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', entry.d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', ROLE_COLOR[role]);
        path.setAttribute('stroke-width', '2.6');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        g.appendChild(path);
        const poly = document.createElementNS(NS, 'polygon');
        poly.setAttribute('points', entry.arrow);
        poly.setAttribute('fill', ROLE_COLOR[role]);
        g.appendChild(poly);
      });
      svgEl.appendChild(g);
    });
  }

  async function generateCallSheetPDF() {
    if (!window.DATA || !window.DATA.playTypes || !window.DATA.splitRoutes) throw new Error('Play data not loaded yet.');
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');

    // Same freshness fix as the playbook/game-stats PDFs -- pull the
    // coach's real saved edits (renamed plays, noBoot flags, edited route
    // shapes) before drawing anything, so this can't silently print stale
    // bootstrap data.
    if (window.loadLiveEditsIntoData) await window.loadLiveEditsIntoData();

    const { jsPDF } = window.jspdf;
    const PAGE_W = 792, PAGE_H = 612; // landscape letter
    const MARGIN = 20;
    const USABLE_W = PAGE_W - 2 * MARGIN;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

    const playByKey = {};
    window.DATA.playTypes.forEach(p => { playByKey[p.key] = p; });
    const wingPlays = PLAY_ORDER.map(k => playByKey[k]).filter(Boolean);

    // ---- Header ----
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(COLOR.black);
    doc.text('ASL Bengals Play Call Chart', MARGIN, MARGIN + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(COLOR.muted);
    doc.text('SIDELINE QUICK REFERENCE — CALL IT LEFT TO RIGHT', MARGIN, MARGIN + 15);
    doc.setDrawColor(COLOR.black);
    doc.setLineWidth(1.6);
    doc.line(MARGIN, MARGIN + 22, PAGE_W - MARGIN, MARGIN + 22);

    // ---- Legend ----
    let ly = MARGIN + 36;
    function legendDot(x, y, color, label) {
      doc.setFillColor(color);
      doc.circle(x, y - 2.5, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(COLOR.muted);
      doc.text(label, x + 7, y);
    }
    legendDot(MARGIN, ly, COLOR.motion, 'Motion');
    legendDot(MARGIN + 72, ly, COLOR.boot, 'Boot');
    legendDot(MARGIN + 134, ly, COLOR.pass, 'Pass');
    legendDot(MARGIN + 196, ly, COLOR.counter, 'Counter');
    // Unicode dash glyphs (┈) aren't in jsPDF's built-in Helvetica metrics
    // and print as "%" -- draw an actual short dashed line instead.
    doc.setDrawColor(COLOR.muted);
    doc.setLineWidth(1.4);
    doc.setLineDashPattern([2, 1.6], 0);
    doc.line(MARGIN + 258, ly - 2.5, MARGIN + 276, ly - 2.5);
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(COLOR.muted);
    doc.text('dashed = optional', MARGIN + 282, ly);

    // Nathan: "For Blast and Double Blast -- it can either be inside or
    // outside. If just Double Blast is shown, it's inside. If they want it
    // to the outside, Outside Zone is shown, then Blast or Double Blast."
    // I.e. Inside is the unmarked default for either play; calling "Outside
    // Zone" immediately before Blast/Double Blast is what selects the
    // Outside variant -- it's a modifier in that spot, not a second play.
    // Flagged generically off playTypes[].hasInsideOutside (same flag
    // play-calls.js itself uses for its own Inside/Outside toggle) rather
    // than hardcoding "blast"/"double_blast", so this note and the *
    // markers below stay correct if that ever changes.
    ly += 13;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(COLOR.pass);
    doc.text('*', MARGIN, ly);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(COLOR.muted);
    doc.text('Inside by default — call "Outside Zone" right before it for the Outside variant (e.g. "Outside Zone, Blast").', MARGIN + 8, ly);

    // Nathan: "make sure if a coach prints the play calls, it's reflective
    // to the options we have in the play calls" -- same "*" note pattern
    // as Inside/Outside just above, but for the purple "C" tag drawn on
    // play chips below (see playGrid's hasCounter block). Counter only
    // ever shows in the Wing band (play-calls.js hides counterToggle
    // whenever isSplit is true), so the Split grid below intentionally has
    // no "C" tags -- not an oversight.
    ly += 13;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(COLOR.counter);
    doc.text('C', MARGIN, ly);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(COLOR.muted);
    doc.text('Counter available (Wing side only) — never call it together with Boot on the same play.', MARGIN + 8, ly);

    // ---- Shared column layout for the Wing & Split bands (fixed widths
    // so every box lines up vertically between the two bands -- Split has
    // no Motion step, so it gets an empty placeholder column instead of
    // just being skipped). ----
    const COL = { formation: 66, arrow: 15, side: 64, motion: 98, direction: 64, optional: 112 };
    const bandX0 = MARGIN;
    const bandW = USABLE_W;
    const accentW = 6;
    const innerX0 = bandX0 + accentW + 12;
    const innerRight = bandX0 + bandW - 12;
    const innerW = innerRight - innerX0;
    const fixedSum = COL.formation + COL.arrow + COL.side + COL.arrow + COL.motion + COL.arrow + COL.arrow + COL.direction + COL.arrow + COL.optional;
    const playcallW = innerW - fixedSum;

    function roundedBox(x, y, w, h, r, fill, stroke) {
      doc.setDrawColor(stroke || COLOR.line);
      doc.setLineWidth(1.1);
      if (fill) { doc.setFillColor(fill); doc.roundedRect(x, y, w, h, r, r, 'FD'); }
      else doc.roundedRect(x, y, w, h, r, r, 'S');
    }

    function stepTitle(x, w, y, label) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(COLOR.muted);
      doc.text(label.toUpperCase(), x + w / 2, y, { align: 'center' });
    }

    function lrBox(x, w, yTop, rowH) {
      const boxH = 32;
      const y = yTop + (rowH - boxH) / 2;
      roundedBox(x, y, w, boxH, 7, '#ffffff', COLOR.ink);
      doc.setDrawColor(COLOR.ink);
      const chipW = (w - 3 * 7) / 2;
      ['L', 'R'].forEach((l, i) => {
        const cx = x + 7 + i * (chipW + 7);
        const cy = y + 5;
        doc.setFillColor(COLOR.paper);
        doc.setDrawColor(COLOR.line);
        doc.setLineWidth(0.8);
        doc.roundedRect(cx, cy, chipW, boxH - 10, 4, 4, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(COLOR.ink);
        doc.text(l, cx + chipW / 2, cy + (boxH - 10) / 2 + 3.5, { align: 'center' });
      });
      return y + boxH;
    }

    function formationChip(x, w, yTop, rowH, label, bg, border) {
      const boxH = 32;
      const y = yTop + (rowH - boxH) / 2;
      doc.setFillColor(bg);
      doc.setDrawColor(border);
      doc.setLineWidth(1.2);
      doc.roundedRect(x, y, w, boxH, 7, 7, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor('#ffffff');
      doc.text(label, x + w / 2, y + boxH / 2 + 4.2, { align: 'center' });
    }

    function optionalBox(x, w, yTop, rowH, border, tint, name, note) {
      const boxH = 50;
      const y = yTop + (rowH - boxH) / 2;
      doc.setFillColor(tint);
      doc.setDrawColor(border);
      doc.setLineWidth(1.2);
      doc.setLineDashPattern([2, 1.6], 0);
      doc.roundedRect(x, y, w, boxH, 7, 7, 'FD');
      doc.setLineDashPattern([], 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.4);
      doc.setTextColor(COLOR.muted);
      doc.text('OPTIONAL', x + w / 2, y + 12, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(COLOR.ink);
      doc.text(name, x + w / 2, y + 25, { align: 'center' });
      if (note) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.4);
        doc.setTextColor(COLOR.ink);
        const lines = doc.splitTextToSize(note, w - 12);
        doc.text(lines, x + w / 2, y + 36, { align: 'center' });
      }
    }

    function playGrid(x, w, yTop, rowH, plays, showTags) {
      const boxH = 70;
      const y = yTop + (rowH - boxH) / 2;
      roundedBox(x, y, w, boxH, 9, '#ffffff', COLOR.ink);
      const cols = 4, gap = 6;
      const chipW = (w - 12 - (cols - 1) * gap) / cols;
      const chipH = (boxH - 12 - gap) / 2;
      plays.forEach((p, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const cx = x + 6 + col * (chipW + gap);
        const cy = y + 6 + row * (chipH + gap);
        doc.setFillColor(COLOR.paper);
        doc.setDrawColor(COLOR.line);
        doc.setLineWidth(0.8);
        doc.roundedRect(cx, cy, chipW, chipH, 5, 5, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.8);
        doc.setTextColor(COLOR.ink);
        // Flags the Inside/Outside plays (see the "*" note under the top
        // legend) -- driven off the same hasInsideOutside flag play-calls.js
        // uses for its own toggle, not a hardcoded key check.
        const displayLabel = p.hasInsideOutside ? `${p.label} *` : p.label;
        const lines = doc.splitTextToSize(displayLabel, chipW - 10);
        const lineH = 11;
        const startY = cy + chipH / 2 - ((lines.length - 1) * lineH) / 2 + 3.5;
        lines.forEach((ln, li) => doc.text(ln, cx + chipW / 2, startY + li * lineH, { align: 'center' }));
        if (showTags) {
          // A checkmark/X glyph isn't in jsPDF's built-in Helvetica metrics
          // (renders as a stray apostrophe) -- draw the check/X as vectors
          // instead of text.
          const allowBoot = !p.noBoot;
          doc.setFillColor(allowBoot ? COLOR.motion : COLOR.boot);
          const tw = 18, th = 11;
          const tx = cx + chipW - tw + 5, ty = cy - 5;
          doc.roundedRect(tx, ty, tw, th, 5, 5, 'F');
          doc.setDrawColor('#ffffff');
          doc.setLineWidth(1.3);
          const mcx = tx + tw / 2, mcy = ty + th / 2;
          if (allowBoot) {
            doc.lines([[2.2, 2.2], [4, -5.2]], mcx - 4.4, mcy + 0.3, [1, 1], 'S', false);
          } else {
            doc.line(mcx - 3, mcy - 3, mcx + 3, mcy + 3);
            doc.line(mcx - 3, mcy + 3, mcx + 3, mcy - 3);
          }

          // Nathan: "make sure if a coach prints the play calls, it's
          // reflective to the options we have in the play calls" -- Counter
          // is real and callable for this play (see hasCounter, matches the
          // "C" legend note above) but nothing on this chart said so before.
          // Drawn bottom-LEFT (mirrored from the Boot check/X badge's
          // top-right) rather than stacked under it -- both badges protrude
          // slightly outside their own chip on purpose (see the Boot badge's
          // ty = cy - 5 just above), and a second right-side badge directly
          // under it would have collided with the NEXT row's Boot badge
          // (which protrudes upward into that same gap). Left side has
          // nothing else drawn, so there's no collision there.
          // Just a presence marker, not a yes/no like Boot's check/X --
          // there's no "Counter not allowed" state worth flagging here.
          if (p.hasCounter) {
            const ctw = 18, cth = 11;
            const ctx = cx - 5, cty = cy + chipH - cth + 5;
            doc.setFillColor(COLOR.counter);
            doc.roundedRect(ctx, cty, ctw, cth, 5, 5, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor('#ffffff');
            doc.text('C', ctx + ctw / 2, cty + cth / 2 + 2.4, { align: 'center' });
          }
        }
      });
      return y + boxH;
    }

    function drawArrow(x, yTop, rowH, dashed) {
      const y = yTop + rowH / 2;
      doc.setDrawColor(dashed ? COLOR.muted : COLOR.line);
      doc.setLineWidth(1.3);
      if (dashed) doc.setLineDashPattern([2, 1.6], 0);
      doc.line(x, y, x + COL.arrow - 3, y);
      doc.setLineDashPattern([], 0);
      doc.setFillColor(dashed ? COLOR.muted : COLOR.line);
      doc.triangle(x + COL.arrow - 3, y - 2.6, x + COL.arrow - 3, y + 2.6, x + COL.arrow + 2, y, 'F');
    }

    function drawBand(yTop, opts) {
      const bandH = opts.bandH;
      roundedBox(bandX0, yTop, bandW, bandH, 10, '#ffffff', COLOR.line);
      doc.setFillColor(opts.accentColor);
      doc.roundedRect(bandX0, yTop, accentW, bandH, 3, 3, 'F');
      doc.rect(bandX0 + accentW / 2, yTop, accentW / 2, bandH, 'F'); // square off the inner edge

      const rowTop = yTop + 14;
      const rowH = 84;
      let x = innerX0;

      stepTitle(x, COL.formation, rowTop, 'Formation');
      formationChip(x, COL.formation, rowTop + 7, rowH - 7, opts.formationLabel, opts.accentColor, opts.accentBorder);
      x += COL.formation;

      drawArrow(x, rowTop + 7, rowH - 7, false); x += COL.arrow;

      stepTitle(x, COL.side, rowTop, opts.sideLabel);
      lrBox(x, COL.side, rowTop + 7, rowH - 7);
      x += COL.side;

      if (opts.motion) {
        drawArrow(x, rowTop + 7, rowH - 7, true); x += COL.arrow;
        stepTitle(x, COL.motion, rowTop, 'Optional');
        optionalBox(x, COL.motion, rowTop + 7, rowH - 7, COLOR.motion, COLOR.motionTint, '+ Motion', null);
        x += COL.motion;
      } else {
        x += COL.arrow + COL.motion; // empty placeholder -- keeps Play Call aligned under Wing's
      }

      drawArrow(x, rowTop + 7, rowH - 7, false); x += COL.arrow;

      stepTitle(x, playcallW, rowTop, 'Play Call');
      playGrid(x, playcallW, rowTop + 7, rowH - 7, opts.plays, opts.showTags);
      x += playcallW;

      drawArrow(x, rowTop + 7, rowH - 7, false); x += COL.arrow;

      stepTitle(x, COL.direction, rowTop, 'Direction');
      lrBox(x, COL.direction, rowTop + 7, rowH - 7);
      x += COL.direction;

      drawArrow(x, rowTop + 7, rowH - 7, true); x += COL.arrow;

      stepTitle(x, COL.optional, rowTop, 'Optional');
      optionalBox(x, COL.optional, rowTop + 7, rowH - 7, opts.optColor, opts.optTint, opts.optName, opts.optNote);

      const exampleY = yTop + bandH - 12;
      doc.setDrawColor(COLOR.line);
      doc.setLineWidth(0.6);
      doc.setLineDashPattern([2, 1.6], 0);
      doc.line(innerX0, exampleY - 14, innerRight, exampleY - 14);
      doc.setLineDashPattern([], 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(COLOR.muted);
      doc.text('Example: ', innerX0, exampleY);
      const w1 = doc.getTextWidth('Example: ');
      doc.setTextColor(COLOR.ink);
      doc.text(opts.exampleBold, innerX0 + w1, exampleY);
      const w2 = doc.getTextWidth(opts.exampleBold);
      doc.setTextColor(opts.optColor);
      doc.text(' ' + opts.examplePlus, innerX0 + w1 + w2, exampleY);
    }

    const BAND_H = 128;
    let y = ly + 18;
    drawBand(y, {
      formationLabel: 'WING', accentColor: COLOR.orange, accentBorder: COLOR.orangeDark,
      sideLabel: 'Wing Side', motion: true, plays: wingPlays, showTags: true,
      optColor: COLOR.boot, optTint: COLOR.bootTint, optName: '+ Boot', optNote: 'Not on Option / Opt. Pass / Dbl Blast',
      exampleBold: 'WING · RIGHT · INSIDE ZONE · LEFT', examplePlus: '+ BOOT', bandH: BAND_H,
    });
    y += BAND_H + 14;

    drawBand(y, {
      formationLabel: 'SPLIT', accentColor: COLOR.black, accentBorder: '#000000',
      sideLabel: 'Split Side', motion: false, plays: wingPlays, showTags: false,
      optColor: COLOR.pass, optTint: COLOR.passTint, optName: '+ Pass', optNote: 'Routes below',
      exampleBold: 'SPLIT · LEFT · SWEEP · RIGHT', examplePlus: '+ PASS (Houston)', bandH: BAND_H,
    });
    y += BAND_H + 14;

    // ---- Receiver Routes ----
    const ROUTES_H = 190;
    roundedBox(bandX0, y, bandW, ROUTES_H, 10, '#ffffff', COLOR.line);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(COLOR.muted);
    doc.text('RECEIVER ROUTES — SPLIT + PASS', innerX0, y + 18);

    const { geo, W: iconW, H: iconH } = buildRouteGeometry(window.DATA.splitRoutes);
    const ICON_GAP = 18;
    const iconPairW = iconW * 2 + ICON_GAP;
    const { svg: stage, wrap: stageWrap } = makeStage(iconPairW, iconH);
    const routeColW = innerW / ROUTE_NAMES.length;
    const ICON_DISPLAY_W = Math.min(190, routeColW - 14);
    const ICON_DISPLAY_H = ICON_DISPLAY_W * (iconH / iconPairW);
    for (let i = 0; i < ROUTE_NAMES.length; i++) {
      const name = ROUTE_NAMES[i];
      const colX = innerX0 + i * routeColW;
      const label = name.charAt(0).toUpperCase() + name.slice(1);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(COLOR.ink);
      doc.text(label, colX + routeColW / 2, y + 36, { align: 'center' });

      renderRouteIcon(stage, geo, iconW, iconH, name);
      const png = await svgToPng(stage, ICON_DISPLAY_W, ICON_DISPLAY_H, 3);
      const imgX = colX + (routeColW - ICON_DISPLAY_W) / 2;
      doc.addImage(png, 'PNG', imgX, y + 44, ICON_DISPLAY_W, ICON_DISPLAY_H);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(COLOR.muted);
      const halfW = (ICON_DISPLAY_W - 10) / 2;
      doc.text('L', imgX + halfW / 2, y + 44 + ICON_DISPLAY_H + 11, { align: 'center' });
      doc.text('R', imgX + halfW + 10 + halfW / 2, y + 44 + ICON_DISPLAY_H + 11, { align: 'center' });
    }
    stageWrap.remove();

    const legendY = y + ROUTES_H - 28;
    doc.setDrawColor(COLOR.line);
    doc.setLineWidth(0.6);
    doc.setLineDashPattern([2, 1.6], 0);
    doc.line(innerX0, legendY - 14, innerRight, legendY - 14);
    doc.setLineDashPattern([], 0);
    // Solid-color swatches (blue = wide, red = flex/inside) instead of a
    // solid-vs-dashed distinction -- matches Nathan's reference images,
    // where the two routes are told apart by color, not line style, and
    // each has its own numbered circle at its real release point besides.
    doc.setDrawColor(COLOR.pass);
    doc.setLineWidth(2.4);
    doc.line(innerX0, legendY - 3, innerX0 + 18, legendY - 3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(COLOR.muted);
    doc.text('Wide receiver', innerX0 + 24, legendY);
    const seg2X = innerX0 + 24 + doc.getTextWidth('Wide receiver') + 18;
    doc.setDrawColor(COLOR.boot);
    doc.line(seg2X, legendY - 3, seg2X + 18, legendY - 3);
    doc.text('Flex (inside) receiver', seg2X + 24, legendY);
    const noteX = seg2X + 24 + doc.getTextWidth('Flex (inside) receiver') + 20;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(COLOR.muted);
    doc.setFontSize(7.4);
    doc.text('Same call, run independently either side of the field — shown here Left and Right.', noteX, legendY);

    // Nathan: "For non split side, the wing on the opposite side runs the
    // inside route" -- the lone receiver on the side without the split
    // (player #4) isn't a third diagram here since it's literally the same
    // shape as the flex/inside route above, just reanchored to his own
    // spot (play-calls.js's getSplitRoutePaths + reanchorRoute) -- a note
    // is clearer than a near-duplicate icon.
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.4);
    doc.setTextColor(COLOR.muted);
    doc.text('On the side without the split, the wing (#4) runs this same inside route shape, reanchored to his own spot.', innerX0, legendY + 13);

    // ---- Footer / build stamp ----
    const buildLabel = window.BUILD_V ? `ASL Bengals Play Call Chart — Build ${window.BUILD_V}` : 'ASL Bengals Play Call Chart';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor('#999999');
    doc.text(buildLabel, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });

    return doc;
  }

  window.generateCallSheetPDF = generateCallSheetPDF;

  const btn = document.getElementById('adminCallSheetDownloadBtn');
  if (btn) {
    const originalLabel = btn.textContent;
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = '📋 Generating…';
      try {
        const doc = await generateCallSheetPDF();
        doc.save('ASL_Bengals_Call_Sheet.pdf');
        btn.textContent = '✅ Saved!';
      } catch (err) {
        console.error('Call sheet PDF generation failed:', err);
        btn.textContent = '⚠️ Failed — tap to retry';
      } finally {
        setTimeout(() => { btn.textContent = originalLabel; btn.disabled = false; }, 2200);
      }
    });
  }
})();

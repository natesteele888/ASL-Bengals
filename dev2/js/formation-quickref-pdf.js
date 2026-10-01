// The sideline quick-reference booklet: one formation per page, its
// alignment diagram at the top, every callable play listed below it with
// letter badges for what can be added to the call -- built to be printed
// and read with no electronics on the sideline, which is why this is a PDF
// and not a screen.
//
// Nathan: "coaches can't use any electronics on the sideline... built
// digitally and then printed as a PDF. Or two and print it double sided."
// "I don't think this needs play diagrams -- let's [do] Formation diagrams
// with all the plays listed below it that can be called... needs to be an
// easy way for the coach to know what they can call... this is a quick
// reference sheet so a lot of plays can fit into it."
//
// One page per formation is deliberate: printed double-sided, a single
// sheet of paper carries two formations (front/back), and a stack of sheets
// is the whole booklet -- exactly the physical object described.
//
// The badges on each row come from js/play-modifiers.js, which derives them
// from the real signal recipe and toggle-availability flags rather than a
// hand-typed table -- see that file's own header for why, and for the
// specific Wing/Split examples it was checked against.
//
// The formation diagram is drawn as plain jsPDF vector shapes (circles,
// lines, text) -- no SVG rasterization needed here, unlike call-sheet-pdf.js's
// route icons, because an alignment diagram is just dots and a scrimmage
// line, well within what jsPDF's own primitives draw reliably.

(function () {
  'use strict';

  var COLOR = {
    ink: '#1b1b1b', muted: '#6b6a66', line: '#d8d3c8', paper: '#faf9f6',
    accent: '#ff6a13', accentDark: '#e0570a',
  };

  // ---- Formation diagram, pure jsPDF vector ----
  //
  // Auto-fits whatever positions it is given rather than assuming a fixed
  // coordinate range -- correct for Wing, Split, or any formation a coach
  // builds later, without this file needing to know their coordinate span
  // in advance.
  function drawFormationDiagram(doc, x0, y0, w, h, positions, lineSlots) {
    var slots = Object.keys(positions);
    var xs = slots.map(function (k) { return positions[k][0]; });
    var ys = slots.map(function (k) { return positions[k][1]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var pad = 90; // headroom so a circle at the edge of the formation isn't clipped
    var spanX = (maxX - minX) + pad * 2, spanY = (maxY - minY) + pad * 2;
    var scale = Math.min(w / spanX, h / spanY);
    var offX = x0 + (w - spanX * scale) / 2 - (minX - pad) * scale;
    var offY = y0 + (h - spanY * scale) / 2 - (minY - pad) * scale;
    function px(pt) { return [offX + pt[0] * scale, offY + pt[1] * scale]; }

    // Line of scrimmage, at the center's own y -- follows whatever the
    // formation actually does rather than assuming linemen sit at one fixed
    // height.
    if (positions.C) {
      var cy = px(positions.C)[1];
      doc.setDrawColor(COLOR.accentDark);
      doc.setLineWidth(1);
      doc.setLineDashPattern([3, 2], 0);
      doc.line(x0, cy, x0 + w, cy);
      doc.setLineDashPattern([], 0);
    }

    var R = 10;
    slots.forEach(function (k) {
      var p = px(positions[k]);
      var isLine = lineSlots.indexOf(k) !== -1;
      doc.setFillColor(isLine ? COLOR.ink : '#ffffff');
      doc.setDrawColor(COLOR.ink);
      doc.setLineWidth(1.2);
      doc.circle(p[0], p[1], R, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(String(k).length > 1 ? 7.5 : 9);
      doc.setTextColor(isLine ? '#ffffff' : COLOR.ink);
      doc.text(String(k), p[0], p[1] + 3.1, { align: 'center' });
    });
  }

  // ---- One badge chip ----
  function drawBadge(doc, x, y, badge) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    var padX = 4.5;
    var tw = doc.getTextWidth(badge.code);
    var w = tw + padX * 2, h = 12;
    doc.setFillColor(badge.color);
    doc.roundedRect(x, y, w, h, 3, 3, 'F');
    doc.setTextColor('#ffffff');
    doc.text(badge.code, x + w / 2, y + h / 2 + 2.7, { align: 'center' });
    return w;
  }

  // ---- One formation's page ----
  function drawFormationPage(doc, PAGE_W, PAGE_H, MARGIN, formation, playRows) {
    var USABLE_W = PAGE_W - 2 * MARGIN;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(COLOR.ink);
    doc.text(formation.name.toUpperCase(), MARGIN, MARGIN + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(COLOR.muted);
    doc.text('SIDELINE QUICK REFERENCE', MARGIN, MARGIN + 28);
    doc.setDrawColor(COLOR.ink);
    doc.setLineWidth(1.4);
    doc.line(MARGIN, MARGIN + 36, PAGE_W - MARGIN, MARGIN + 36);

    // Diagram, right-aligned so the play list (the part actually read
    // during a game) starts flush left where a coach's eye already is.
    var diagW = 190, diagH = 130;
    var diagX = PAGE_W - MARGIN - diagW, diagY = MARGIN + 46;
    doc.setDrawColor(COLOR.line);
    doc.setLineWidth(0.8);
    doc.roundedRect(diagX, diagY, diagW, diagH, 6, 6, 'S');
    drawFormationDiagram(doc, diagX + 8, diagY + 8, diagW - 16, diagH - 16,
      formation.positions, formation.lineSlots);

    // ---- The play list -- dense, single column, badges right-aligned so
    // every row's letters land in the same vertical band and read as a
    // column of their own, not scattered per name length. ----
    var listX = MARGIN, listW = USABLE_W - diagW - 24;
    var listY = MARGIN + 46;
    var rowH = 30;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(COLOR.muted);
    doc.text('PLAY', listX, listY);
    doc.text('CAN CALL', listX + listW - 140, listY);
    listY += 8;

    var usedCodes = {};
    playRows.forEach(function (row, i) {
      var y = listY + i * rowH;
      doc.setDrawColor(COLOR.line);
      doc.setLineWidth(0.7);
      doc.line(listX, y, listX + listW, y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(COLOR.ink);
      doc.text(row.label, listX, y + 20);

      // Badges packed right-to-left so they stay flush against the list's
      // right edge regardless of how many a given play has. drawBadge both
      // measures and draws in one left-to-right call, so widths are
      // measured first, then each badge is placed working backward from
      // the right edge.
      var badges = row.badges.slice().reverse();
      badges.forEach(function (b) { usedCodes[b.code] = b; });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      var widths = badges.map(function (b) { return doc.getTextWidth(b.code) + 9; });
      var cursor = listX + listW;
      badges.forEach(function (b, bi) {
        cursor -= widths[bi];
        drawBadge(doc, cursor, y + 9, b);
        cursor -= 5;
      });
    });
    doc.setDrawColor(COLOR.line);
    doc.line(listX, listY + playRows.length * rowH, listX + listW, listY + playRows.length * rowH);

    // ---- Legend: only the codes actually used on THIS page, so a Split
    // page never shows Boot/Counter and a Wing page never shows Split's
    // "Sp"/"P" -- a coach should never have to wonder why a code on the
    // legend never appears anywhere on the sheet. ----
    var legendY = diagY + diagH + 20;
    var legend = window.PlayModifiers.legendEntries().filter(function (b) { return usedCodes[b.code]; });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(COLOR.muted);
    doc.text('KEY', diagX, legendY);
    legendY += 12;
    legend.forEach(function (b) {
      doc.setFillColor(b.color);
      doc.roundedRect(diagX, legendY - 8, 16, 11, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor('#ffffff');
      doc.text(b.code, diagX + 8, legendY - 0.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.6);
      doc.setTextColor(COLOR.muted);
      doc.text(b.label, diagX + 22, legendY);
      legendY += 14;
    });

    var buildLabel = window.BUILD_V ? 'ASL Bengals Quick Reference — Build ' + window.BUILD_V : 'ASL Bengals Quick Reference';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor('#999999');
    doc.text(buildLabel, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
  }

  // selection: { formationId: [playKey, ...], ... } -- the full matrix, or a
  // week's narrowed-down subset of it. Formations with an empty or missing
  // list are skipped rather than printing an empty page.
  async function generateFormationQuickRefPDF(selection, opts) {
    if (!window.DATA || !window.DATA.playTypes) throw new Error('Play data not loaded yet.');
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');
    if (!window.Formations) throw new Error('Formation registry not loaded yet.');
    if (!window.PlayModifiers) throw new Error('Play modifiers not loaded yet.');
    // loadLiveEditsIntoData reaches for FIREBASE_DB_URL, a global only
    // index.html defines -- guarded on firebaseAuthed existing (the same
    // cloud-availability check js/assignment-store.js uses) so this still
    // works in the standalone dev preview, which has no Firebase by design.
    if (window.loadLiveEditsIntoData && window.firebaseAuthed) await window.loadLiveEditsIntoData();

    opts = opts || {};
    var side = opts.side || 'Right';
    var playByKey = {};
    window.DATA.playTypes.forEach(function (p) { playByKey[p.key] = p; });

    var { jsPDF } = window.jspdf;
    var PAGE_W = 792, PAGE_H = 612, MARGIN = 24; // landscape letter, same as call-sheet-pdf.js
    var doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

    // Built-ins first, then customs, matching Formations.list()'s own
    // order -- so the booklet reads Wing, Split, then whatever a coach has
    // added, the same order they appear everywhere else in the app.
    var order = window.Formations.list().map(function (f) { return f.id; })
      .filter(function (fid) { return selection[fid] && selection[fid].length; });

    var printed = 0;
    order.forEach(function (fid) {
      var formation = window.Formations.get(fid);
      if (!formation) return;
      var positions = window.Formations.positions(fid, side);
      if (!positions) return;

      var rows = selection[fid]
        .map(function (key) { return playByKey[key]; })
        .filter(Boolean)
        .map(function (pt) {
          return { label: pt.label || pt.key, badges: window.PlayModifiers.badgesFor(pt, fid) };
        });
      if (!rows.length) return;

      if (printed > 0) doc.addPage();
      drawFormationPage(doc, PAGE_W, PAGE_H, MARGIN,
        { name: formation.name, positions: positions, lineSlots: window.Formations.lineSlots(fid) },
        rows);
      printed++;
    });

    if (!printed) throw new Error('Nothing selected to print.');
    return doc;
  }

  window.generateFormationQuickRefPDF = generateFormationQuickRefPDF;
})();

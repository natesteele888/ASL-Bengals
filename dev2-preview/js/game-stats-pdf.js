// ---------------------------------------------------------------------------
// Printable blank Game Stat Sheet -- Nathan: "It has to be a compact sheet
// not 8 pages - I need a single sheet - there will only be 2-3 QBs, and 4-6
// RB and 4-6 WR." Rebuilt again as ONE portrait page, every grid sized to
// that actual roster instead of padded-out guesses, and no separate Roster
// page -- each grid gets its own small "#"/"Name" write-in columns (same
// idea as the reference sheet Nathan first shared, which also never had a
// standalone roster page). The electronic version in schedule.js keeps its
// own Roster section (a dropdown picker is genuinely useful there, and it
// isn't fighting a page limit) -- this file only needs to match its
// category structure, not its exact roster UI.
//
// Sections, top to bottom on one page: Rushing, Passing, Receiving,
// Kickoffs, Defense (tackle boxes + INT/PBU/Sacks in the same table, since
// it's the same set of defenders either way), Turnovers.
// ---------------------------------------------------------------------------
(function () {

  const PAGE_W = 612, PAGE_H = 792; // portrait letter -- more vertical room to stack sections than landscape
  const MARGIN = 18;
  const USABLE_W = PAGE_W - 2 * MARGIN;

  function drawHeader(doc, game) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor('#111111');
    doc.text('ASL BENGALS — GAME STAT SHEET', MARGIN, MARGIN + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor('#333333');
    const oppLine = game && game.opponent
      ? `${game.homeAway === 'Away' ? '@' : 'vs'} ${game.opponent}    Date: ${game.date || '_________'}    Location: ${game.location || '_________'}`
      : `Opponent: ______________________    Date: ____________    Location: ______________________`;
    doc.text(oppLine, MARGIN, MARGIN + 18);
    return MARGIN + 30;
  }

  function stampFooter(doc) {
    const buildLabel = window.BUILD_V ? `ASL Bengals Game Stat Sheet — Build ${window.BUILD_V}` : 'ASL Bengals Game Stat Sheet';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor('#999999');
    doc.text(buildLabel, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
  }

  function sectionLabel(doc, text, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor('#e0201a');
    doc.text(text, MARGIN, y);
    return y + 10;
  }

  function noteText(doc, text, y) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor('#888888');
    doc.text(text, MARGIN, y);
  }

  // Draws one compact grid: NUM col, NAME col, `cols` small attempt boxes,
  // a TOTAL col -- `rows` blank player rows. Returns the y position just
  // below it. `mode`: 'yardage' | 'passing' | 'tackle' controls the box
  // style guide drawn inside each cell (corner tick for a 1st down, or a
  // diagonal divider for solo/assisted tackles); extraCols (Defense only)
  // appends narrow labeled counter columns after the attempt boxes instead
  // of a plain Total.
  function drawGrid(doc, topY, opts) {
    const { rows, cols, mode, extraCols } = opts;
    const NUM_COL_W = 20, NAME_COL_W = 68, TOTAL_COL_W = extraCols ? 0 : 28;
    const extraW = extraCols ? extraCols.length * 26 : 0;
    const gridW = USABLE_W - NUM_COL_W - NAME_COL_W - TOTAL_COL_W - extraW;
    const boxW = gridW / cols;
    const rowH = 15, headerH = 12;

    doc.setDrawColor('#999999');
    doc.setLineWidth(0.5);
    doc.setFillColor('#222222');
    doc.rect(MARGIN, topY, USABLE_W, headerH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor('#ffffff');
    doc.text('#', MARGIN + NUM_COL_W / 2, topY + headerH - 3.5, { align: 'center' });
    doc.text('NAME', MARGIN + NUM_COL_W + NAME_COL_W / 2, topY + headerH - 3.5, { align: 'center' });
    for (let c = 0; c < cols; c++) {
      doc.text(String(c + 1), MARGIN + NUM_COL_W + NAME_COL_W + c * boxW + boxW / 2, topY + headerH - 3.5, { align: 'center' });
    }
    if (extraCols) {
      extraCols.forEach((label, i) => {
        doc.text(label, MARGIN + NUM_COL_W + NAME_COL_W + gridW + i * 26 + 13, topY + headerH - 3.5, { align: 'center' });
      });
    } else {
      doc.text('TOT', MARGIN + USABLE_W - TOTAL_COL_W / 2, topY + headerH - 3.5, { align: 'center' });
    }

    let y = topY + headerH;
    for (let r = 0; r < rows; r++) {
      if (r % 2 === 1) { doc.setFillColor('#f6f6f6'); doc.rect(MARGIN, y, USABLE_W, rowH, 'F'); }
      doc.rect(MARGIN, y, NUM_COL_W, rowH);
      doc.rect(MARGIN + NUM_COL_W, y, NAME_COL_W, rowH);
      for (let c = 0; c < cols; c++) {
        const bx = MARGIN + NUM_COL_W + NAME_COL_W + c * boxW;
        doc.rect(bx, y, boxW, rowH);
        doc.setDrawColor('#dddddd');
        doc.setLineWidth(0.4);
        if (mode === 'tackle') {
          doc.line(bx, y, bx + boxW, y + rowH); // diagonal: whole box=solo, lower-left half=assist
        } else if (mode !== 'plain') {
          doc.line(bx + boxW - 5, y, bx + boxW, y + 5); // small 1st-down corner tick
        }
        doc.setDrawColor('#999999');
        doc.setLineWidth(0.5);
      }
      if (extraCols) {
        extraCols.forEach((label, i) => {
          doc.rect(MARGIN + NUM_COL_W + NAME_COL_W + gridW + i * 26, y, 26, rowH);
        });
      } else {
        doc.rect(MARGIN + USABLE_W - TOTAL_COL_W, y, TOTAL_COL_W, rowH);
      }
      y += rowH;
    }
    doc.rect(MARGIN, topY, USABLE_W, headerH + rows * rowH);
    return y;
  }

  function drawTurnovers(doc, topY, lines) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor('#888888');
    doc.text('Write a number and what happened, e.g. "1. Fumble -- recovered by #22"', MARGIN, topY);
    let y = topY + 11;
    const colW = USABLE_W / 2 - 6;
    doc.setDrawColor('#999999');
    for (let i = 0; i < lines; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = MARGIN + col * (colW + 12);
      const ly = y + row * 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor('#333333');
      doc.text(String(i + 1) + '.', x, ly);
      doc.line(x + 14, ly + 1, x + colW, ly + 1);
    }
    return y + Math.ceil(lines / 2) * 14;
  }

  function generateGameStatSheetPDF(game) {
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

    let y = drawHeader(doc, game);

    // Row counts sized to Nathan's actual roster (2-3 QB, 4-6 RB, 4-6 WR),
    // plus a spare row or two rather than a padded-out guess -- this is
    // what keeps the whole thing on one page.
    y = sectionLabel(doc, '🏃 RUSHING', y);
    y = drawGrid(doc, y, { rows: 6, cols: 10, mode: 'yardage' });
    y += 10;

    y = sectionLabel(doc, '🎯 PASSING  (write yards, or "-" for incomplete)', y);
    y = drawGrid(doc, y, { rows: 3, cols: 10, mode: 'passing' });
    y += 10;

    y = sectionLabel(doc, '🙌 RECEIVING', y);
    y = drawGrid(doc, y, { rows: 6, cols: 10, mode: 'yardage' });
    y += 10;

    y = sectionLabel(doc, '🦵 KICKOFFS', y);
    y = drawGrid(doc, y, { rows: 2, cols: 6, mode: 'plain' });
    y += 10;

    y = sectionLabel(doc, '🛡️ DEFENSE  (tackles: shade whole box=solo, half=assist)', y);
    y = drawGrid(doc, y, { rows: 11, cols: 8, mode: 'tackle', extraCols: ['INT', 'PBU', 'SK'] });
    y += 10;

    y = sectionLabel(doc, '🔁 TURNOVERS', y);
    y = drawTurnovers(doc, y, 6);

    noteText(doc, '1st down: shade the small top-right corner tick on that box.', y + 4);
    stampFooter(doc);

    return doc;
  }

  window.generateGameStatSheetPDF = generateGameStatSheetPDF;
})();

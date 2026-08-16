// ---------------------------------------------------------------------------
// Printable blank Game Stat Sheet -- rebuilt to match how Nathan actually
// wants to track a game live: "write in the name and # of all the running
// backs, QBs and Receivers as a roster, then reference their number. When
// they run you add in the yardage in an attempt box. So each row may have
// 20 attempts and you put in the yardage for each attempt. have a little
// corner on the box that can be filled in if it is for a first down. For
// passing you can put a dash for an incomplete pass or the yardage gained -
// at the end of these rows we need a cumulative total. defensive player
// names and #s are added to the roster sheet and # will have a divided box
// - if a player makes a solo tackle, the full box is filled, if it's
// assisted you fill in half. Pass Int and break ups will be done for
// Defensive players as well. along with sacks - include turnovers in a
// seperate section to write in a number and what they did. give me kick off
// numbers too - again a box to write in the yardage - each box will be an
// attempt."
//
// Same shape/columns as the electronic version in schedule.js (roster +
// ATTEMPT_SECTIONS + tackles + defExtra + turnovers) so paper and app never
// drift apart -- one page per section:
//   1. Roster (blank # / Name write-in lines)
//   2. Rushing (attempt grid, FD corner tick)
//   3. Passing (attempt grid, FD corner tick, dash = incomplete)
//   4. Receiving (attempt grid, FD corner tick)
//   5. Kickoffs (attempt grid, no FD)
//   6. Tackles (divided box: full = solo, half = assisted)
//   7. Defensive Extra (INT / Pass Breakups / Sacks) + Turnovers log
// ---------------------------------------------------------------------------
(function () {

  const PAGE_W = 792, PAGE_H = 612; // landscape letter
  const MARGIN = 24;
  const USABLE_W = PAGE_W - 2 * MARGIN;

  function drawHeader(doc, game, pageLabel) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor('#111111');
    doc.text('ASL BENGALS — GAME STAT SHEET', MARGIN, MARGIN + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor('#333333');
    const oppLine = game && game.opponent
      ? `${game.homeAway === 'Away' ? '@' : 'vs'} ${game.opponent}    Date: ${game.date || '____________'}    Location: ${game.location || '____________'}`
      : `Opponent: ________________________    Date: ______________    Location: ________________________`;
    doc.text(oppLine, MARGIN, MARGIN + 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor('#e0201a');
    doc.text(pageLabel, MARGIN, MARGIN + 40);
  }

  function stampFooter(doc, pageNum, pageCount) {
    const buildLabel = window.BUILD_V ? `ASL Bengals Game Stat Sheet — Build ${window.BUILD_V}` : 'ASL Bengals Game Stat Sheet';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor('#999999');
    doc.text(`${buildLabel} · Page ${pageNum}/${pageCount}`, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' });
  }

  function note(doc, text, y) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#777777');
    doc.text(text, MARGIN, y);
  }

  // ---- Roster page: blank "#___  Name________________" write-in lines, two columns. ----
  function drawRosterPage(doc, game) {
    drawHeader(doc, game, 'Roster');
    const cols = 2, rowsPerCol = 15;
    const colW = USABLE_W / cols;
    const rowH = 24;
    const topY = MARGIN + 56;
    doc.setDrawColor('#999999');
    doc.setLineWidth(0.7);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rowsPerCol; r++) {
        const x = MARGIN + c * colW;
        const y = topY + r * rowH;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor('#333333');
        doc.text('#', x, y + 14);
        doc.line(x + 12, y + 15, x + 48, y + 15);
        doc.text('Name:', x + 56, y + 14);
        doc.line(x + 90, y + 15, x + colW - 12, y + 15);
      }
    }
    note(doc, 'One roster covers both offense and defense -- write in every player who might touch the ball or make a tackle.', topY + rowsPerCol * rowH + 16);
  }

  // ---- Attempt grid: R blank player rows x C attempt boxes + a Total box.
  // allowFD draws a small corner tick in each box as a "mark here for a 1st
  // down" guide. ----
  function drawAttemptGridPage(doc, game, title, opts) {
    drawHeader(doc, game, title);
    const { rows, cols, allowFD, passingMode } = opts;
    const NUM_COL_W = 30, NAME_COL_W = 96, TOTAL_COL_W = 56;
    const gridW = USABLE_W - NUM_COL_W - NAME_COL_W - TOTAL_COL_W;
    const boxW = gridW / cols;
    const rowH = 28;
    const headerH = 22;
    const topY = MARGIN + 54;

    doc.setDrawColor('#999999');
    doc.setLineWidth(0.7);
    // Header
    doc.setFillColor('#111111');
    doc.rect(MARGIN, topY, USABLE_W, headerH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor('#ffffff');
    doc.text('#', MARGIN + NUM_COL_W / 2, topY + headerH - 6, { align: 'center' });
    doc.text('NAME', MARGIN + NUM_COL_W + NAME_COL_W / 2, topY + headerH - 6, { align: 'center' });
    for (let c = 0; c < cols; c++) {
      doc.text(String(c + 1), MARGIN + NUM_COL_W + NAME_COL_W + c * boxW + boxW / 2, topY + headerH - 6, { align: 'center' });
    }
    doc.text('TOTAL', MARGIN + USABLE_W - TOTAL_COL_W / 2, topY + headerH - 6, { align: 'center' });

    let y = topY + headerH;
    for (let r = 0; r < rows; r++) {
      if (r % 2 === 1) { doc.setFillColor('#f5f5f5'); doc.rect(MARGIN, y, USABLE_W, rowH, 'F'); }
      doc.rect(MARGIN, y, NUM_COL_W, rowH);
      doc.rect(MARGIN + NUM_COL_W, y, NAME_COL_W, rowH);
      for (let c = 0; c < cols; c++) {
        const bx = MARGIN + NUM_COL_W + NAME_COL_W + c * boxW;
        doc.rect(bx, y, boxW, rowH);
        if (allowFD) {
          // Small corner-tick guide -- a coach shades/circles this corner
          // by hand to mark a 1st down on that attempt.
          doc.setDrawColor('#cccccc');
          doc.setLineWidth(0.5);
          doc.line(bx + boxW - 8, y, bx + boxW, y + 8);
          doc.setDrawColor('#999999');
          doc.setLineWidth(0.7);
        }
      }
      doc.rect(MARGIN + USABLE_W - TOTAL_COL_W, y, TOTAL_COL_W, rowH);
      y += rowH;
    }
    doc.rect(MARGIN, topY, USABLE_W, headerH + rows * rowH);

    let noteText = 'Write the yardage gained in each box.';
    if (passingMode) noteText += ' Put a dash "-" for an incomplete pass.';
    if (allowFD) noteText += ' Shade the small top-right corner tick if that play was a 1st down.';
    note(doc, noteText, y + 14);
    return y + 14;
  }

  // ---- Tackles grid: same shape, but each box gets a diagonal divider
  // (guide: fill the whole box for a solo tackle, just the top-left half
  // for an assist). ----
  function drawTackleGridPage(doc, game, rows, cols) {
    drawHeader(doc, game, 'Tackles');
    const NUM_COL_W = 30, NAME_COL_W = 96, TOTAL_COL_W = 56;
    const gridW = USABLE_W - NUM_COL_W - NAME_COL_W - TOTAL_COL_W;
    const boxW = gridW / cols;
    const rowH = 28;
    const headerH = 22;
    const topY = MARGIN + 54;

    doc.setDrawColor('#999999');
    doc.setLineWidth(0.7);
    doc.setFillColor('#111111');
    doc.rect(MARGIN, topY, USABLE_W, headerH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor('#ffffff');
    doc.text('#', MARGIN + NUM_COL_W / 2, topY + headerH - 6, { align: 'center' });
    doc.text('NAME', MARGIN + NUM_COL_W + NAME_COL_W / 2, topY + headerH - 6, { align: 'center' });
    for (let c = 0; c < cols; c++) {
      doc.text(String(c + 1), MARGIN + NUM_COL_W + NAME_COL_W + c * boxW + boxW / 2, topY + headerH - 6, { align: 'center' });
    }
    doc.text('TOTAL', MARGIN + USABLE_W - TOTAL_COL_W / 2, topY + headerH - 6, { align: 'center' });

    let y = topY + headerH;
    for (let r = 0; r < rows; r++) {
      if (r % 2 === 1) { doc.setFillColor('#f5f5f5'); doc.rect(MARGIN, y, USABLE_W, rowH, 'F'); }
      doc.rect(MARGIN, y, NUM_COL_W, rowH);
      doc.rect(MARGIN + NUM_COL_W, y, NAME_COL_W, rowH);
      for (let c = 0; c < cols; c++) {
        const bx = MARGIN + NUM_COL_W + NAME_COL_W + c * boxW;
        doc.rect(bx, y, boxW, rowH);
        doc.setDrawColor('#cccccc');
        doc.setLineWidth(0.5);
        doc.line(bx, y, bx + boxW, y + rowH); // diagonal divider guide
        doc.setDrawColor('#999999');
        doc.setLineWidth(0.7);
      }
      doc.rect(MARGIN + USABLE_W - TOTAL_COL_W, y, TOTAL_COL_W, rowH);
      y += rowH;
    }
    doc.rect(MARGIN, topY, USABLE_W, headerH + rows * rowH);
    note(doc, 'Solo tackle: shade the whole box. Assisted tackle: shade just the lower-left half (below the diagonal line).', y + 14);
  }

  // ---- Defensive Extra (INT / PBU / Sacks) + Turnovers, sharing one page. ----
  function drawDefExtraAndTurnoversPage(doc, game) {
    drawHeader(doc, game, 'Defensive Extra & Turnovers');
    const topY = MARGIN + 54;

    // Defensive Extra: small counter table
    const NUM_COL_W = 34, NAME_COL_W = 130, COUNT_COL_W = 70;
    const tableW = NUM_COL_W + NAME_COL_W + COUNT_COL_W * 3;
    const rowH = 22, headerH = 20, rows = 10;
    doc.setDrawColor('#999999');
    doc.setLineWidth(0.7);
    doc.setFillColor('#111111');
    doc.rect(MARGIN, topY, tableW, headerH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor('#ffffff');
    ['#', 'NAME', 'INT', 'PBU', 'SACKS'].forEach((label, i) => {
      const w = i === 0 ? NUM_COL_W : i === 1 ? NAME_COL_W : COUNT_COL_W;
      const x = MARGIN + (i === 0 ? 0 : i === 1 ? NUM_COL_W : NUM_COL_W + NAME_COL_W + (i - 2) * COUNT_COL_W);
      doc.text(label, x + w / 2, topY + headerH - 5, { align: 'center' });
    });
    let y = topY + headerH;
    for (let r = 0; r < rows; r++) {
      if (r % 2 === 1) { doc.setFillColor('#f5f5f5'); doc.rect(MARGIN, y, tableW, rowH, 'F'); }
      doc.rect(MARGIN, y, NUM_COL_W, rowH);
      doc.rect(MARGIN + NUM_COL_W, y, NAME_COL_W, rowH);
      for (let i = 0; i < 3; i++) doc.rect(MARGIN + NUM_COL_W + NAME_COL_W + i * COUNT_COL_W, y, COUNT_COL_W, rowH);
      y += rowH;
    }
    doc.rect(MARGIN, topY, tableW, headerH + rows * rowH);
    note(doc, 'PBU = pass breakups.', y + 12);

    // Turnovers log, to the right
    const toX = MARGIN + tableW + 30;
    const toW = USABLE_W - tableW - 30;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor('#111111');
    doc.text('Turnovers', toX, topY + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor('#777777');
    doc.text('Write a number and what happened, e.g. "1. Fumble -- recovered by #22"', toX, topY + 24);
    let ty = topY + 40;
    doc.setDrawColor('#999999');
    for (let i = 1; i <= 12; i++) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor('#333333');
      doc.text(String(i) + '.', toX, ty);
      doc.line(toX + 18, ty + 1, toX + toW, ty + 1);
      ty += 22;
    }
  }

  function generateGameStatSheetPDF(game) {
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');
    if (!window.gameStatAttemptSections) throw new Error('Stat config not loaded yet (schedule.js).');
    const { jsPDF } = window.jspdf;
    const attemptSections = window.gameStatAttemptSections;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

    // rushing gets more attempt columns/rows than kickoffs -- roughly
    // matches how often each actually happens in a youth game.
    const GRID_OPTS = {
      rushing: { rows: 10, cols: 18 },
      passing: { rows: 8, cols: 15 },
      receiving: { rows: 10, cols: 12 },
      kickoffs: { rows: 6, cols: 8 },
    };

    const pageCount = 1 + attemptSections.length + 2; // roster + attempt sections + tackles + defExtra/turnovers
    let pageNum = 1;

    drawRosterPage(doc, game);
    stampFooter(doc, pageNum++, pageCount);

    attemptSections.forEach(cfg => {
      doc.addPage();
      const g = GRID_OPTS[cfg.key] || { rows: 10, cols: 12 };
      drawAttemptGridPage(doc, game, cfg.title.replace(/^[^\w]+/, '').trim(), { rows: g.rows, cols: g.cols, allowFD: cfg.allowFD, passingMode: cfg.passingMode });
      stampFooter(doc, pageNum++, pageCount);
    });

    doc.addPage();
    drawTackleGridPage(doc, game, 10, 15);
    stampFooter(doc, pageNum++, pageCount);

    doc.addPage();
    drawDefExtraAndTurnoversPage(doc, game);
    stampFooter(doc, pageNum++, pageCount);

    return doc;
  }

  window.generateGameStatSheetPDF = generateGameStatSheetPDF;
})();

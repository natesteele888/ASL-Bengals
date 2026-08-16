// ---------------------------------------------------------------------------
// Printable blank Game Stat Sheet -- Nathan: "I need a way to record the
// stats on the sidelines on a printed sheet so that I can input in the same
// format on the app after the game." Columns come from window.gameStatColumns
// (schedule.js) so this sheet and the in-app stats entry table in the
// Schedule detail view are always identical, in the same order -- a coach
// transcribing from paper never has to remap anything.
//
// Triggered from a specific game's "Print Blank Stat Sheet" button (see
// schedule.js), so the opponent/date/location get printed at the top --
// falls back to blank write-in lines if called without a game.
// ---------------------------------------------------------------------------
(function () {

  function generateGameStatSheetPDF(game) {
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');
    if (!window.gameStatColumns) throw new Error('Stat columns not loaded yet (schedule.js).');
    const { jsPDF } = window.jspdf;
    const cols = window.gameStatColumns;

    const PAGE_W = 792, PAGE_H = 612; // landscape letter
    const MARGIN = 24;
    const USABLE_W = PAGE_W - 2 * MARGIN;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

    // ---- Header ----
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

    // ---- Table ----
    const HEADER_H = 26;
    const ROW_H = 26;   // tall enough to write in by hand
    const NUM_ROWS = 16;
    // Stretch remaining width evenly across columns so the table always
    // fills the page width regardless of the exact pdfW values above.
    const definedW = cols.reduce((s, c) => s + c.pdfW, 0);
    const stretch = (USABLE_W - definedW) / cols.length;
    const colW = cols.map(c => c.pdfW + stretch);
    const colX = [];
    let x = MARGIN;
    colW.forEach(w => { colX.push(x); x += w; });

    let y = MARGIN + 36;

    // Header row
    doc.setFillColor('#111111');
    doc.rect(MARGIN, y, USABLE_W, HEADER_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor('#ffffff');
    cols.forEach((c, i) => {
      doc.text(c.label.toUpperCase(), colX[i] + colW[i] / 2, y + HEADER_H / 2 + 3, { align: 'center' });
    });
    y += HEADER_H;

    // Blank rows
    doc.setDrawColor('#999999');
    doc.setLineWidth(0.7);
    for (let r = 0; r < NUM_ROWS; r++) {
      if (r % 2 === 1) {
        doc.setFillColor('#f5f5f5');
        doc.rect(MARGIN, y, USABLE_W, ROW_H, 'F');
      }
      doc.rect(MARGIN, y, USABLE_W, ROW_H);
      colX.slice(1).forEach(cx => {
        doc.line(cx, y, cx, y + ROW_H);
      });
      y += ROW_H;
    }
    doc.rect(MARGIN, MARGIN + 36, USABLE_W, HEADER_H + NUM_ROWS * ROW_H);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#777777');
    doc.text('Pass (C/A) = completions/attempts, e.g. "3/5"   •   Fill in whatever categories apply to that player -- blanks are fine.', MARGIN, y + 14);

    const buildLabel = window.BUILD_V ? `ASL Bengals Game Stat Sheet — Build ${window.BUILD_V}` : 'ASL Bengals Game Stat Sheet';
    doc.setFontSize(6.5);
    doc.setTextColor('#999999');
    doc.text(buildLabel, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' });

    return doc;
  }

  window.generateGameStatSheetPDF = generateGameStatSheetPDF;
})();

// ---------------------------------------------------------------------------
// Printable blank Game Stat Sheet -- Nathan: "I need a way to record the
// stats on the sidelines on a printed sheet so that I can input in the same
// format on the app after the game." Columns/groups come from
// window.gameStatColumns / .gameStatGroups (schedule.js) so this sheet and
// the in-app stats entry table in the Schedule detail view are always
// identical, in the same order -- a coach transcribing from paper never has
// to remap anything.
//
// Nathan later shared a reference stat sheet with a lot more detail (full
// play-by-play passing log, drive chart, quarter-by-quarter scoring) and
// picked "richer box score, skip the play-by-play" -- one page per stat
// group (Offense, then Defense & Special Teams) instead of trying to cram
// everything onto one page.
//
// Triggered from a specific game's "Print Blank Stat Sheet" button (see
// schedule.js), so the opponent/date/location get printed at the top of
// every page -- falls back to blank write-in lines if called without a game.
// ---------------------------------------------------------------------------
(function () {

  function drawHeader(doc, game, margin, pageLabel) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor('#111111');
    doc.text('ASL BENGALS — GAME STAT SHEET', margin, margin + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor('#333333');
    const oppLine = game && game.opponent
      ? `${game.homeAway === 'Away' ? '@' : 'vs'} ${game.opponent}    Date: ${game.date || '____________'}    Location: ${game.location || '____________'}`
      : `Opponent: ________________________    Date: ______________    Location: ________________________`;
    doc.text(oppLine, margin, margin + 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor('#e0201a');
    doc.text(pageLabel, margin, margin + 40);
  }

  // Draws one blank stat table (a page's worth of NUM_ROWS blank rows) for
  // the given list of column keys, returns the y position just below it.
  function drawStatTable(doc, colByKey, keys, margin, usableW, topY, numRows) {
    const cols = keys.map(k => colByKey[k]);
    const HEADER_H = 26;
    const ROW_H = 26; // tall enough to write in by hand

    const definedW = cols.reduce((s, c) => s + c.pdfW, 0);
    const stretch = (usableW - definedW) / cols.length;
    const colW = cols.map(c => c.pdfW + stretch);
    const colX = [];
    let x = margin;
    colW.forEach(w => { colX.push(x); x += w; });

    let y = topY;
    doc.setFillColor('#111111');
    doc.rect(margin, y, usableW, HEADER_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor('#ffffff');
    cols.forEach((c, i) => {
      doc.text(c.label.toUpperCase(), colX[i] + colW[i] / 2, y + HEADER_H / 2 + 3, { align: 'center' });
    });
    y += HEADER_H;

    doc.setDrawColor('#999999');
    doc.setLineWidth(0.7);
    for (let r = 0; r < numRows; r++) {
      if (r % 2 === 1) {
        doc.setFillColor('#f5f5f5');
        doc.rect(margin, y, usableW, ROW_H, 'F');
      }
      doc.rect(margin, y, usableW, ROW_H);
      colX.slice(1).forEach(cx => doc.line(cx, y, cx, y + ROW_H));
      y += ROW_H;
    }
    doc.rect(margin, topY + HEADER_H, usableW, numRows * ROW_H);
    return y;
  }

  function generateGameStatSheetPDF(game) {
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');
    if (!window.gameStatColByKey || !window.gameStatGroups) throw new Error('Stat columns not loaded yet (schedule.js).');
    const { jsPDF } = window.jspdf;
    const colByKey = window.gameStatColByKey;
    const groups = window.gameStatGroups;

    const PAGE_W = 792, PAGE_H = 612; // landscape letter
    const MARGIN = 24;
    const USABLE_W = PAGE_W - 2 * MARGIN;
    const NUM_ROWS = 16;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

    groups.forEach((group, i) => {
      if (i > 0) doc.addPage();
      drawHeader(doc, game, MARGIN, group.title.replace(/^[^\w]+/, '').trim());
      const keys = group.keys.includes('num') ? group.keys : ['num', 'name', ...group.keys];
      const bottomY = drawStatTable(doc, colByKey, keys, MARGIN, USABLE_W, MARGIN + 50, NUM_ROWS);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor('#777777');
      const note = i === 0
        ? 'Fill in whatever categories apply to that player -- blanks are fine. A player with no offensive touches doesn\'t need a row here.'
        : 'Fum Lost = fumbles lost by our team. INT = interceptions our defense made. Fill in whatever categories apply -- blanks are fine.';
      doc.text(note, MARGIN, bottomY + 14);

      const buildLabel = window.BUILD_V ? `ASL Bengals Game Stat Sheet — Build ${window.BUILD_V}` : 'ASL Bengals Game Stat Sheet';
      doc.setFontSize(6.5);
      doc.setTextColor('#999999');
      doc.text(`${buildLabel} · Page ${i + 1}/${groups.length}`, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' });
    });

    return doc;
  }

  window.generateGameStatSheetPDF = generateGameStatSheetPDF;
})();

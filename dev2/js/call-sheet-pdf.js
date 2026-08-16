// ---------------------------------------------------------------------------
// Call Sheet PDF -- a numbered play index, text only (no diagrams). Modeled
// on a call sheet example Nathan shared: a plain numbered list of every
// callable base play, grouped by family, so a play can be called/logged by
// number instead of only by name. Left gets odd numbers, Right gets the
// next even number, mirroring the odd/even Left/Right convention in the
// reference sheet.
//
// Design notes from Nathan's feedback:
// - Read A/B (inside_zone's hasReadToggle) is something the ball carrier
//   reads on the field after the snap, not something a coach calls -- so it
//   is NOT its own numbered entry. One base number covers both reads.
// - Motion and Boot are optional ADD-ONS layered onto a base call, not
//   separate numbered plays of their own -- e.g. there's no separate "13 =
//   Inside Zone Boot," just "1 = Inside Zone Left" plus "+ Boot" if the
//   coach adds it. Each base row lists which add-ons are actually legal for
//   it (Boot isn't available on every play -- see each play type's noBoot).
// - Wing L/R is its own independent alignment call (which side #4 lines up
//   on before the snap), not tied to which way the play runs -- listed in
//   the add-on legend rather than baked into the base numbering.
//
// IMPORTANT: this app has no pre-existing play-numbering convention
// (coaches call plays by hand signal, not a shouted number) -- the
// numbering here is a clean, consistent scheme invented for this document.
// ---------------------------------------------------------------------------
(function () {

  function buildPlayNumberIndex(families) {
    let n = 1;
    const rows = []; // { number, familyLabel, color, direction, addOns: [] }
    families.forEach(fam => {
      const pt = window.DATA.playTypes.find(p => p.key === fam.key);
      const addOns = ['Wing L/R', 'Motion'];
      if (!pt.noBoot) addOns.push('Boot');
      ['Left', 'Right'].forEach(direction => {
        rows.push({ number: n++, familyLabel: fam.label, color: fam.color, direction, addOns });
      });
    });
    return rows;
  }

  function buildSplitIndex(families) {
    let n = 1;
    const rows = [];
    families.forEach(fam => {
      ['Left', 'Right'].forEach(side => {
        rows.push({ number: n++, familyLabel: fam.label, color: fam.color, side, name: `${fam.label} Run` });
      });
    });
    families.forEach(fam => {
      ['Left', 'Right'].forEach(side => {
        rows.push({ number: n++, familyLabel: fam.label, color: fam.color, side, name: `${fam.label} Pass Pro` });
      });
    });
    ['seattle', 'houston', 'florida', 'boston'].forEach(call => {
      ['Left', 'Right'].forEach(side => {
        rows.push({ number: n++, familyLabel: 'Route Call', color: '#1a6b6b', side,
          name: `${call[0].toUpperCase()}${call.slice(1)}` });
      });
    });
    return rows;
  }

  async function generateCallSheetPDF() {
    if (!window.DATA || !window.DATA.playTypes) throw new Error('Play data not loaded yet.');
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');
    if (!window.playbookLiveFamilies) throw new Error('Playbook helper not loaded yet.');

    const { jsPDF } = window.jspdf;
    const PAGE_W = 792, PAGE_H = 612; // landscape letter
    const MARGIN = 20;
    const USABLE_W = PAGE_W - 2 * MARGIN;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

    const families = window.playbookLiveFamilies();
    const baseRows = buildPlayNumberIndex(families);
    const splitRows = buildSplitIndex(families);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor('#111111');
    doc.text('ASL Bengals — Numbered Play Index', MARGIN, MARGIN);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor('#666666');
    doc.text('Odd = Left, Even = Right. Add-Ons are called alongside the number, not their own numbers.', MARGIN, MARGIN + 12);

    // ==== BASE PLAYS table: Number | Play | Dir | Add-Ons ====
    const topY = MARGIN + 26;
    const TABLE_W = USABLE_W * 0.62;
    const NUM_W = 22, PLAY_W = TABLE_W * 0.42, DIR_W = 30, ADDON_W = TABLE_W - NUM_W - PLAY_W - DIR_W;
    const ROW_H = 15, HEADER_H = 14;

    let y = topY;
    doc.setFillColor('#111111');
    doc.rect(MARGIN, y, TABLE_W, HEADER_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor('#ffffff');
    doc.text('#', MARGIN + 4, y + HEADER_H - 4);
    doc.text('PLAY', MARGIN + NUM_W + 4, y + HEADER_H - 4);
    doc.text('DIR', MARGIN + NUM_W + PLAY_W + 4, y + HEADER_H - 4);
    doc.text('ADD-ONS AVAILABLE', MARGIN + NUM_W + PLAY_W + DIR_W + 4, y + HEADER_H - 4);
    y += HEADER_H;

    let curFamily = null;
    baseRows.forEach(row => {
      if (row.familyLabel !== curFamily) {
        curFamily = row.familyLabel;
        doc.setFillColor(row.color);
        doc.rect(MARGIN, y, TABLE_W, 11, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor('#ffffff');
        doc.text(curFamily.toUpperCase(), MARGIN + 4, y + 8);
        y += 11;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor('#111111');
      doc.text(String(row.number), MARGIN + 4, y + ROW_H - 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(row.familyLabel, MARGIN + NUM_W + 4, y + ROW_H - 5);
      doc.text(row.direction, MARGIN + NUM_W + PLAY_W + 4, y + ROW_H - 5);
      doc.setFontSize(7.3);
      doc.setTextColor('#555555');
      doc.text(row.addOns.join(', '), MARGIN + NUM_W + PLAY_W + DIR_W + 4, y + ROW_H - 5);
      doc.setDrawColor('#e5e5e5');
      doc.setLineWidth(0.4);
      doc.line(MARGIN, y + ROW_H, MARGIN + TABLE_W, y + ROW_H);
      y += ROW_H;
    });

    // ==== ADD-ON LEGEND, to the right of the base table ====
    const legendX = MARGIN + TABLE_W + 24;
    const legendW = USABLE_W - TABLE_W - 24;
    let ly = topY;
    doc.setFillColor('#111111');
    doc.rect(legendX, ly, legendW, HEADER_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor('#ffffff');
    doc.text('ADD-ON CALLS', legendX + 4, ly + HEADER_H - 4);
    ly += HEADER_H + 4;

    const legend = [
      ['Wing L/R', 'Sets which side #4 lines up on before the snap. Independent of which way the play runs — call it either side regardless of direction.'],
      ['Motion', 'Sends the wing in motion to the opposite side just before the snap.'],
      ['Boot', 'QB fakes the handoff and rolls out. Only legal on plays marked "Boot" in Add-Ons — not every play allows it.'],
    ];
    doc.setTextColor('#111111');
    legend.forEach(([term, desc]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(term, legendX, ly);
      ly += 11;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      doc.setTextColor('#555555');
      const lines = doc.splitTextToSize(desc, legendW);
      doc.text(lines, legendX, ly);
      ly += lines.length * 9 + 8;
      doc.setTextColor('#111111');
    });

    // ==== SPLIT FORMATION index, below the base table ====
    y += 10;
    if (y + HEADER_H + 30 > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN; }
    doc.setFillColor('#1a6b6b');
    doc.rect(MARGIN, y, TABLE_W, HEADER_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor('#ffffff');
    doc.text('SPLIT FORMATION', MARGIN + 4, y + HEADER_H - 4);
    y += HEADER_H + 3;

    const SPLIT_COLS = 2;
    const SPLIT_COL_W = (TABLE_W - 12) / SPLIT_COLS;
    const perCol = Math.ceil(splitRows.length / SPLIT_COLS);
    let idx = 0;
    for (let col = 0; col < SPLIT_COLS; col++) {
      const colX = MARGIN + col * (SPLIT_COL_W + 12);
      let cy = y;
      let curFam = null;
      const colRows = splitRows.slice(idx, idx + perCol);
      idx += perCol;
      colRows.forEach(row => {
        if (row.familyLabel !== curFam) {
          curFam = row.familyLabel;
          doc.setFillColor(row.color);
          doc.rect(colX, cy, SPLIT_COL_W, 10, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor('#ffffff');
          doc.text(curFam.toUpperCase(), colX + 3, cy + 7.5);
          cy += 10;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor('#111111');
        doc.text(String(row.number), colX + 3, cy + 8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.text(`Split ${row.side} - ${row.name}`, colX + 20, cy + 8);
        cy += 10.5;
      });
    }

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

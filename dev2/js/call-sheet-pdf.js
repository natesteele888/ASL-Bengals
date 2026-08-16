// ---------------------------------------------------------------------------
// Call Sheet PDF -- a numbered play index, text only (no diagrams). Modeled
// on a call sheet example Nathan shared: a plain numbered list of every
// callable base play, grouped by family, so a play can be called/logged by
// number instead of only by name. Left gets odd numbers, Right gets the
// next even number, mirroring the odd/even Left/Right convention in the
// reference sheet.
//
// Design notes from Nathan's feedback (in order of how the design evolved):
// - Read A/B (inside_zone's hasReadToggle) is something the ball carrier
//   reads on the field after the snap, not something a coach calls -- one
//   base number covers both reads.
// - Motion and Boot are optional ADD-ONS layered onto a base call, not
//   separate numbered plays -- listed in an Add-Ons column per row instead.
// - Wing L/R is its own independent alignment call, not tied to which way
//   the play runs -- also an add-on, not baked into the base numbering.
// - Split formation doesn't need its own separate numbered section --
//   every base play can also be run out of Split, so "Split" is just
//   another add-on on the same base number rather than a whole second list.
// - Route Calls (Seattle/Houston/Florida/Boston) are called live at the
//   line, not planned ahead by number -- kept as a plain reference table,
//   not part of the numbered system.
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
      addOns.push('Split');
      ['Left', 'Right'].forEach(direction => {
        rows.push({ number: n++, familyLabel: fam.label, color: fam.color, direction, addOns });
      });
    });
    return rows;
  }

  function buildRouteCallReference() {
    const rows = [];
    ['seattle', 'houston', 'florida', 'boston'].forEach(call => {
      ['Left', 'Right'].forEach(side => {
        rows.push({ side, name: `${call[0].toUpperCase()}${call.slice(1)}` });
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
    const routeRows = buildRouteCallReference();

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

    // ==== ROUTE CALL REFERENCE, below the base table -- called live at the
    // line, not part of the numbered system, so it's visually distinct
    // (gray, no numbers) rather than looking like more numbered plays.
    y += 10;
    doc.setFillColor('#777777');
    doc.rect(MARGIN, y, TABLE_W, HEADER_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor('#ffffff');
    doc.text('ROUTE CALLS (Split formation — called at the line, not numbered)', MARGIN + 4, y + HEADER_H - 4);
    y += HEADER_H + 3;

    const ROUTE_COLS = 4;
    const ROUTE_COL_W = (TABLE_W - (ROUTE_COLS - 1) * 8) / ROUTE_COLS;
    let rx = MARGIN, ry = y;
    routeRows.forEach((row, i) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor('#333333');
      doc.text(`${row.name} — ${row.side}`, rx + 4, ry + 10);
      if ((i + 1) % ROUTE_COLS === 0) { rx = MARGIN; ry += 14; }
      else { rx += ROUTE_COL_W + 8; }
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
      ['Split', 'Runs the same numbered play out of Split formation instead of Shotgun. Direction still applies the same way.'],
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

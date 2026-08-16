// ---------------------------------------------------------------------------
// Call Sheet PDF -- a numbered play index, text only (no diagrams). Modeled
// on a call sheet example Nathan shared: a plain numbered list of every
// callable play, grouped by family, so a play can be called/logged by
// number instead of only by name. Left-direction variants get odd numbers,
// Right gets the next even number, mirroring the odd/even Left/Right
// convention in the reference sheet.
//
// (An earlier version of this file also generated a second, situational
// call sheet -- Nathan: "the situational call sheet can be scrapped" --
// removed. If a situational sheet comes back later, it should be its own
// deliberate design pass with real scouting/tendency input, not a
// first-guess auto-fill.)
//
// IMPORTANT: this app has no pre-existing play-numbering convention
// (coaches call plays by hand signal, not a shouted number) -- the
// numbering here is a clean, consistent scheme invented for this document.
// ---------------------------------------------------------------------------
(function () {

  // Nathan: "the plays also need to be complete: Wing L/R or Split L/R -
  // Motion (optional) - Play Call - Direction - Boot (optional)" -- builds
  // the full spoken/signaled call as one string, in that exact order,
  // rather than the old terse "Family • Boot" labels that left out which
  // way the play actually goes.
  function buildCallLabel({ familyText, direction, motion, boot }) {
    const parts = [`Wing ${direction}`];
    if (motion) parts.push('Motion');
    parts.push(familyText);
    parts.push(direction);
    if (boot) parts.push('Boot');
    return parts.join(' - ');
  }

  function buildPlayNumberIndex(families) {
    let n = 1;
    const rows = []; // { number, familyLabel, color, direction, name }
    const FORCE_SINGLE_VARIANT = window.playbookForceSingleVariant || {};

    families.forEach(fam => {
      const pt = window.DATA.playTypes.find(p => p.key === fam.key);
      const hasRead = !!pt.hasReadToggle;
      const forcedIo = FORCE_SINGLE_VARIANT[pt.key];
      const hasIo = !!pt.hasInsideOutside && !forcedIo;
      const noBoot = !!pt.noBoot;

      const subVariants = hasRead ? [['A', 'Read A'], ['B', 'Read B']]
        : hasIo ? [['Inside', 'Inside'], ['Outside', 'Outside']]
        : [[null, null]];

      subVariants.forEach(([, subLabel]) => {
        const familyText = subLabel ? `${fam.label} ${subLabel}` : fam.label;
        ['Left', 'Right'].forEach(direction => {
          rows.push({
            number: n++, familyLabel: fam.label, color: fam.color, direction,
            name: buildCallLabel({ familyText, direction, motion: false, boot: false }),
          });
        });
      });

      if (!noBoot) {
        ['Left', 'Right'].forEach(direction => {
          rows.push({ number: n++, familyLabel: fam.label, color: fam.color, direction,
            name: buildCallLabel({ familyText: fam.label, direction, motion: false, boot: true }) });
        });
      }
      ['Left', 'Right'].forEach(direction => {
        rows.push({ number: n++, familyLabel: fam.label, color: fam.color, direction,
          name: buildCallLabel({ familyText: fam.label, direction, motion: true, boot: false }) });
      });
    });

    return rows;
  }

  function buildSplitIndex(families) {
    let n = 1;
    const rows = [];
    families.forEach(fam => {
      ['Left', 'Right'].forEach(side => {
        rows.push({ number: n++, familyLabel: fam.label, color: fam.color, side,
          name: `Split ${side} - ${fam.label} Run` });
      });
    });
    families.forEach(fam => {
      ['Left', 'Right'].forEach(side => {
        rows.push({ number: n++, familyLabel: fam.label, color: fam.color, side,
          name: `Split ${side} - ${fam.label} Pass Pro` });
      });
    });
    ['seattle', 'houston', 'florida', 'boston'].forEach(call => {
      ['Left', 'Right'].forEach(side => {
        rows.push({ number: n++, familyLabel: 'Route Call', color: '#1a6b6b', side,
          name: `Split ${side} - ${call[0].toUpperCase()}${call.slice(1)}` });
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
    // One combined, continuous list -- Shotgun rows, a Split Formation
    // divider, then Split rows -- flowed together into columns so it
    // doesn't force a page break just because the source is two arrays.
    const rows = [
      ...buildPlayNumberIndex(families),
      { divider: true, label: 'Split Formation' },
      ...buildSplitIndex(families),
    ];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor('#111111');
    doc.text('ASL Bengals — Numbered Play Index', MARGIN, MARGIN);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor('#666666');
    doc.text('Odd = Left, Even = Right within each pair.', MARGIN, MARGIN + 12);

    const topY = MARGIN + 26;
    const COLS = 3;
    const COL_GAP = 14;
    const COL_W = (USABLE_W - COL_GAP * (COLS - 1)) / COLS;
    const ROW_H = 10.5;
    const HEADER_H = 12;
    const NUM_GUTTER = 20; // room for the number before the call text starts

    // Fixed column-fill layout sized to fit one page: split the combined
    // row list into COLS equal-ish chunks up front (rather than filling
    // column 1 all the way before starting column 2), so a family header
    // never gets stranded alone at the bottom of a column with its rows
    // pushed to the next one.
    const perCol = Math.ceil(rows.length / COLS);
    let idx = 0;

    for (let col = 0; col < COLS; col++) {
      const colX = MARGIN + col * (COL_W + COL_GAP);
      let y = topY;
      let curFamily = null;
      const colRows = rows.slice(idx, idx + perCol);
      idx += perCol;

      colRows.forEach(row => {
        if (row.divider) {
          doc.setFillColor('#111111');
          doc.rect(colX, y, COL_W, HEADER_H, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor('#ffffff');
          doc.text(row.label.toUpperCase(), colX + 4, y + HEADER_H - 3);
          y += HEADER_H;
          curFamily = null;
          return;
        }
        if (row.familyLabel !== curFamily) {
          curFamily = row.familyLabel;
          doc.setFillColor(row.color);
          doc.rect(colX, y, COL_W, HEADER_H, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor('#ffffff');
          doc.text(curFamily.toUpperCase(), colX + 4, y + HEADER_H - 3);
          y += HEADER_H;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor('#111111');
        doc.text(String(row.number), colX + 4, y + ROW_H - 2.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.text(row.name, colX + NUM_GUTTER, y + ROW_H - 2.5);
        doc.setDrawColor('#e5e5e5');
        doc.setLineWidth(0.4);
        doc.line(colX, y + ROW_H, colX + COL_W, y + ROW_H);
        y += ROW_H;
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

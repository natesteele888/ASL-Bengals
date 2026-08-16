// ---------------------------------------------------------------------------
// Call Sheet PDF -- text-only, no diagrams. Two sections in one document,
// modeled on two call sheet examples Nathan shared:
//
//  1. NUMBERED PLAY INDEX -- a plain numbered list of every callable play,
//     grouped by family, so a play can be called/logged by number instead
//     of only by name. Left-direction variants get odd numbers, Right
//     get the next even number, mirroring the odd/even Left/Right
//     convention in the reference sheet.
//  2. SITUATIONAL CALL SHEET -- colored boxes grouped by game situation
//     (1st & 10, short yardage, redzone, etc.), each listing which plays
//     fit that situation, matching the second reference sheet's format.
//
// IMPORTANT: this app has no existing play-numbering convention (coaches
// call plays by hand signal, not a shouted number) and no situational
// scouting data to draw from. The numbering here is a clean, consistent
// scheme invented for this document; the situational groupings are a
// first-draft starting point based on general offensive football logic
// (power plays for short yardage/goal line, perimeter/chunk plays for
// 2-minute, etc.), not Nathan's actual tendencies -- meant to be edited,
// not treated as gospel. Both are called out on the PDF itself and should
// be reviewed before relying on them in a game.
// ---------------------------------------------------------------------------
(function () {

  function buildPlayNumberIndex(families) {
    let n = 1;
    const rows = []; // { number, familyKey, familyLabel, color, direction, name }
    const defaultSubvariant = window.playbookDefaultSubvariant;
    const FORCE_SINGLE_VARIANT = window.playbookForceSingleVariant || {};

    families.forEach(fam => {
      const pt = window.DATA.playTypes.find(p => p.key === fam.key);
      const hasRead = !!pt.hasReadToggle;
      const forcedIo = FORCE_SINGLE_VARIANT[pt.key];
      const hasIo = !!pt.hasInsideOutside && !forcedIo;
      const noBoot = !!pt.noBoot;
      const def = defaultSubvariant(pt);

      const subVariants = hasRead ? [['A', 'Read A'], ['B', 'Read B']]
        : hasIo ? [['Inside', 'Inside'], ['Outside', 'Outside']]
        : [[null, null]];

      subVariants.forEach(([, subLabel]) => {
        ['Left', 'Right'].forEach(direction => {
          rows.push({
            number: n++, familyKey: fam.key, familyLabel: fam.label, color: fam.color, direction,
            name: subLabel ? `${fam.label} • ${subLabel}` : fam.label,
          });
        });
      });

      if (!noBoot) {
        ['Left', 'Right'].forEach(direction => {
          rows.push({ number: n++, familyKey: fam.key, familyLabel: fam.label, color: fam.color, direction,
            name: `${fam.label} • Boot` });
        });
      }
      ['Left', 'Right'].forEach(direction => {
        rows.push({ number: n++, familyKey: fam.key, familyLabel: fam.label, color: fam.color, direction,
          name: `${fam.label} • Motion` });
      });
    });

    return rows;
  }

  function buildSplitIndex(families) {
    let n = 1;
    const rows = [];
    families.forEach(fam => {
      ['Left', 'Right'].forEach(side => {
        rows.push({ number: n++, familyLabel: fam.label, color: fam.color, side, name: `${fam.label} • Run` });
      });
    });
    families.forEach(fam => {
      ['Left', 'Right'].forEach(side => {
        rows.push({ number: n++, familyLabel: fam.label, color: fam.color, side, name: `${fam.label} • Pass Pro` });
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

  // First-draft situational groupings -- see file header. References plays
  // by family (+ modifier), not by number/direction, since direction is
  // still called live at the line.
  const SITUATIONS = [
    { label: '1st & 10', color: '#2a5d8f', plays: ['Inside Zone', 'Outside Zone', 'Option'] },
    { label: 'Short Yardage (3rd/4th & Short)', color: '#5b3a8a', plays: ['Blast', 'Double Blast', 'Inside Zone'] },
    { label: 'Redzone', color: '#8a2e5c', plays: ['Blast', 'Double Blast', 'Option', 'Option Pass'] },
    { label: 'Goal Line', color: '#b8232a', plays: ['Blast', 'Double Blast'] },
    { label: '2-Minute / Hurry-Up', color: '#1f6f43', plays: ['Outside Zone', 'Sweep', 'Option Pass'] },
    { label: 'Play Action / RPO', color: '#b8860b', plays: ['Option Pass', 'Option • Boot'] },
    { label: 'Versus Blitz', color: '#8a3b12', plays: ['Inside Zone', 'Option'] },
    { label: 'Coming Out (Backed Up)', color: '#1a3fae', plays: ['Inside Zone', 'Outside Zone'] },
    { label: 'Split Formation Shots', color: '#1a6b6b', plays: ['Seattle', 'Houston', 'Florida', 'Boston'] },
  ];

  async function generateCallSheetPDF() {
    if (!window.DATA || !window.DATA.playTypes) throw new Error('Play data not loaded yet.');
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');
    if (!window.playbookLiveFamilies) throw new Error('Playbook helper not loaded yet.');

    const { jsPDF } = window.jspdf;
    const PAGE_W = 612, PAGE_H = 792; // portrait letter -- list-heavy, reads better tall
    const MARGIN = 30;
    const USABLE_W = PAGE_W - 2 * MARGIN;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

    const families = window.playbookLiveFamilies();
    const index = buildPlayNumberIndex(families);
    const splitIndex = buildSplitIndex(families);

    // ==== PAGE 1+: NUMBERED PLAY INDEX ====
    let y = MARGIN;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor('#111111');
    doc.text('ASL Bengals — Numbered Play Index', MARGIN, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#666666');
    doc.text('Reference numbering for calling/logging plays. Odd = Left, Even = Right within each pair.', MARGIN, y);
    y += 18;

    const COL_GAP = 24;
    const COL_W = (USABLE_W - COL_GAP) / 2;
    const ROW_H = 13.5;

    function newPage(title) {
      doc.addPage();
      y = MARGIN;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor('#111111');
      doc.text(title, MARGIN, y);
      y += 16;
    }

    function drawIndexTable(rows, title) {
      newPage(title);
      let col = 0, colY = [y, y];
      let curFamily = null;
      rows.forEach(row => {
        const cx = MARGIN + col * (COL_W + COL_GAP);
        if (row.familyLabel !== curFamily) {
          curFamily = row.familyLabel;
          if (colY[col] + ROW_H * 2 > PAGE_H - MARGIN) {
            col = col === 0 ? 1 : 0;
            if (col === 0) { newPage(title + ' (cont.)'); colY = [y, y]; }
          }
          doc.setFillColor(row.color);
          doc.rect(cx, colY[col], COL_W, ROW_H, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor('#ffffff');
          doc.text(curFamily.toUpperCase(), cx + 5, colY[col] + ROW_H - 3.5);
          colY[col] += ROW_H;
        }
        if (colY[col] + ROW_H > PAGE_H - MARGIN) {
          col = col === 0 ? 1 : 0;
          if (col === 0) { newPage(title + ' (cont.)'); colY = [y, y]; curFamily = null; }
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor('#111111');
        doc.text(String(row.number), cx + 5, colY[col] + ROW_H - 3.5);
        doc.setFont('helvetica', 'normal');
        doc.text(row.name, cx + 30, colY[col] + ROW_H - 3.5);
        doc.setDrawColor('#e5e5e5');
        doc.setLineWidth(0.4);
        doc.line(cx, colY[col] + ROW_H, cx + COL_W, colY[col] + ROW_H);
        colY[col] += ROW_H;
      });
    }

    drawIndexTable(index, 'Shotgun Formation — Play Index');
    drawIndexTable(splitIndex, 'Split Formation — Play Index');

    // ==== NEXT PAGE: SITUATIONAL CALL SHEET ====
    doc.addPage();
    y = MARGIN;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor('#111111');
    doc.text('ASL Bengals — Situational Call Sheet', MARGIN, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#666666');
    doc.text('First-draft groupings by general offensive logic -- review and adjust to actual tendencies/scouting.', MARGIN, y);
    y += 18;

    const BOX_GAP = 14;
    const BOX_COLS = 2;
    const BOX_W = (USABLE_W - BOX_GAP) / BOX_COLS;
    const BOX_HEADER_H = 18;
    const BOX_ROW_H = 14;
    let boxCol = 0;
    let colTopY = [y, y];

    SITUATIONS.forEach(sit => {
      const boxH = BOX_HEADER_H + sit.plays.length * BOX_ROW_H + 6;
      if (colTopY[boxCol] + boxH > PAGE_H - MARGIN) {
        boxCol = boxCol === 0 ? 1 : 0;
        if (boxCol === 0) {
          doc.addPage();
          y = MARGIN;
          colTopY = [y, y];
        }
      }
      const bx = MARGIN + boxCol * (BOX_W + BOX_GAP);
      const by = colTopY[boxCol];
      doc.setFillColor(sit.color);
      doc.rect(bx, by, BOX_W, BOX_HEADER_H, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor('#ffffff');
      doc.text(sit.label.toUpperCase(), bx + 6, by + BOX_HEADER_H - 5.5);
      doc.setDrawColor('#cccccc');
      doc.setLineWidth(0.6);
      doc.rect(bx, by + BOX_HEADER_H, BOX_W, sit.plays.length * BOX_ROW_H + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor('#111111');
      sit.plays.forEach((p, i) => {
        doc.text('• ' + p, bx + 8, by + BOX_HEADER_H + 12 + i * BOX_ROW_H);
      });
      colTopY[boxCol] = by + boxH + 12;
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

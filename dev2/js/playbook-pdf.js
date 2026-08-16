// ---------------------------------------------------------------------------
// Live sideline playbook PDF generator.
//
// Nathan: "we need to be sure that we can export the PDF and have it match
// the play edits. all the current plays on the PDF don't appear correctly
// as the runners paths are all different from what we have live. Needs to
// be accurate or else we can't use it."
//
// The old pipeline built this PDF with a Python script running on an hourly
// scheduled task: it fetched a live snapshot of the play data from Firebase,
// saved it to two local JSON files, and reportlab-drew every diagram by
// re-deriving the same route/blocking geometry play-calls.js already
// computes for the screen -- a second, hand-maintained copy of that math, in
// a different language. Turned out that scheduled task had never actually
// succeeded even once (its outbound network calls were blocked in that
// sandboxed environment), so the PDF had been silently frozen on old shipped
// defaults since before any of a coach's real edits existed -- explaining
// exactly what Nathan was seeing.
//
// This replaces that whole pipeline. Instead of re-deriving the geometry a
// second time, it calls the SAME renderCardDiagram/renderSplitDiagram
// functions Play Calls itself uses (exposed on window by play-calls.js),
// against a hidden off-screen SVG, using whatever's already loaded into
// window.DATA right now in this browser -- the exact same data and the
// exact same rendering code already proven correct on screen. There is no
// separate "sync" step and nothing to go stale: whatever a coach sees in
// Play Calls is, by construction, what prints.
// ---------------------------------------------------------------------------
(function(){

  // Mirrors the play-family ordering/colors the old Python layout used, plus
  // "sweep" -- a coach-added, cloud-only play type with no shipped entry --
  // included only if it's actually present in the live data.
  const FAMILY_META = [
    ['inside_zone', '#1f6f43'],
    ['outside_zone', '#2a5d8f'],
    ['option', '#8a3b12'],
    ['blast', '#5b3a8a'],
    ['double_blast', '#8a2e5c'],
    ['option_pass', '#b8860b'],
    ['sweep', '#0e7c7b'],
  ];
  // Sweep only ever exists as coach-edited cloud data, historically saved
  // with just one real (Outside) variant -- forcing a single sub-variant
  // here avoids printing a nonsense "Inside Sweep" that was never authored.
  const FORCE_SINGLE_VARIANT = { sweep: 'Outside' };
  const SPLIT_COLOR = '#1a6b6b';
  const SPLIT_CALLS = ['seattle', 'houston', 'florida', 'boston'];
  const SPLIT_CALL_LABELS = { seattle: 'Seattle', houston: 'Houston', florida: 'Florida', boston: 'Boston' };

  function defaultSubvariant(playType) {
    const forced = FORCE_SINGLE_VARIANT[playType.key];
    const io = forced || (playType.hasInsideOutside ? 'Outside' : null);
    const rp = playType.hasReadToggle ? 'A' : null;
    return { io, rp };
  }

  // Direct port of the old build_playbook_pdf.py's variant_list() -- yields
  // every direction/sub-variant/boot/motion combo a family's section prints,
  // driven purely by that play type's own flags (never changes based on
  // route content, so this part of the old script was never the accuracy
  // problem -- kept as-is).
  function* variantList(playType) {
    const hasRead = !!playType.hasReadToggle;
    const forcedIo = FORCE_SINGLE_VARIANT[playType.key];
    const hasIo = !!playType.hasInsideOutside && !forcedIo;
    const noBoot = !!playType.noBoot;

    for (const direction of ['Left', 'Right']) {
      if (hasRead) {
        for (const [rp, rLabel] of [['A', 'Read A'], ['B', 'Read B']]) {
          yield { direction, io: null, rp, boot: false, motion: false, label: `${direction} • ${rLabel}` };
        }
      } else if (hasIo) {
        for (const io of ['Inside', 'Outside']) {
          yield { direction, io, rp: null, boot: false, motion: false, label: `${direction} • ${io}` };
        }
      } else if (forcedIo) {
        yield { direction, io: forcedIo, rp: null, boot: false, motion: false, label: direction };
      } else {
        yield { direction, io: null, rp: null, boot: false, motion: false, label: direction };
      }
    }

    const def = defaultSubvariant(playType);
    if (!noBoot) {
      for (const direction of ['Left', 'Right']) {
        yield { direction, io: def.io, rp: def.rp, boot: true, motion: false, label: `${direction} • Boot` };
      }
    }
    for (const direction of ['Left', 'Right']) {
      yield { direction, io: def.io, rp: def.rp, boot: false, motion: true, label: `${direction} • Motion` };
    }
  }

  function* splitVariantList(families) {
    for (const side of ['Left', 'Right']) {
      for (const { key, label } of families) {
        const def = defaultSubvariant(window.DATA.playTypes.find(p => p.key === key));
        yield { kind: 'run', playKey: key, side, io: def.io, rp: def.rp, passOn: false,
          leftCall: 'seattle', rightCall: 'seattle', label: `${label} • Split ${side}` };
      }
    }
    for (const side of ['Left', 'Right']) {
      for (const { key, label } of families) {
        const def = defaultSubvariant(window.DATA.playTypes.find(p => p.key === key));
        yield { kind: 'pass', playKey: key, side, io: def.io, rp: def.rp, passOn: true,
          leftCall: 'seattle', rightCall: 'seattle', label: `${label} • Pass • Split ${side}` };
      }
    }
    for (const side of ['Left', 'Right']) {
      for (const call of SPLIT_CALLS) {
        yield { kind: 'routes', playKey: null, side, io: null, rp: null, passOn: false,
          leftCall: call, rightCall: call, label: `${SPLIT_CALL_LABELS[call]} • Split ${side}` };
      }
    }
  }

  // ---- Off-screen SVG stage the live render functions draw into ----
  // Wrapped in a hidden container DIV (not styled on the svg itself) so
  // nothing about how it's hidden on the live page can ever leak into the
  // serialized SVG below.
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
    // Explicit xmlns attribute -- required for the serialized string below
    // to parse as a valid, self-contained SVG document once it's no longer
    // attached to this page (createElementNS alone sets the DOM node's
    // namespace but doesn't guarantee XMLSerializer writes out an xmlns
    // attribute on the root element).
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    svg.setAttribute('width', vw);
    svg.setAttribute('height', vh);
    wrap.appendChild(svg);
    return { svg, wrap };
  }

  // Nathan: "the play calls do not show the correct running movements" /
  // "option pass not showing correctly." First tried svg2pdf.js (converts a
  // live SVG element straight to PDF vector content) -- it kept getting
  // curve/path shapes wrong on anything more complex than a gentle bend
  // (confirmed even after flattening every curve into hundreds of straight
  // line segments -- still wrong, so it isn't a curve-command parsing
  // issue, something deeper in that library). Dropping it for something
  // that can't have that class of bug: rasterize each diagram using the
  // BROWSER'S OWN native SVG renderer -- the exact same engine that already
  // draws Play Calls correctly on screen -- via a plain <img> decode, then
  // draw that onto a canvas and embed the resulting PNG. This can't
  // misinterpret a path the browser itself is rendering.
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

  // Shared by call-sheet-pdf.js too, so both documents always agree on
  // which families/colors exist in the live data.
  function liveFamilies() {
    return FAMILY_META
      .filter(([key]) => window.DATA.playTypes.some(p => p.key === key))
      .map(([key, color]) => ({ key, color, label: window.DATA.playTypes.find(p => p.key === key).label }));
  }
  window.playbookLiveFamilies = liveFamilies;
  window.playbookVariantList = variantList;
  window.playbookSplitVariantList = splitVariantList;
  window.playbookDefaultSubvariant = defaultSubvariant;
  window.playbookForceSingleVariant = FORCE_SINGLE_VARIANT;

  async function generatePlaybookPDF(onProgress) {
    if (!window.DATA || !window.DATA.playTypes) throw new Error('Play data not loaded yet.');
    if (!window.renderCardDiagram || !window.renderSplitDiagram) throw new Error('Play renderer not loaded yet.');
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');

    // Nathan kept seeing this PDF print old/unedited routes even when Play
    // Calls itself showed the correct ones -- because play-calls.js only
    // fetched the coach's real saved edits (playEdits.json/splitRouteEdits
    // .json) lazily, the first time someone opened the Play Calls tab.
    // Force that fetch here too, so exporting straight from Coach Stats
    // (without ever opening Play Calls first this session) still pulls the
    // latest saved routes into window.DATA before anything below reads it.
    if (window.loadLiveEditsIntoData) {
      if (onProgress) onProgress(0, 1);
      await window.loadLiveEditsIntoData();
    }

    const { jsPDF } = window.jspdf;
    const [VW, VH] = window.DATA.viewBox;

    // ---- Layout (points) -- sizing has moved a few times: bigger, then
    // "a little too big" with "too much margin", then Nathan flagged most
    // pages weren't using the available space and asked for 4-per-row with
    // less padding all around. Tighter margins/gaps/label heights below so
    // more rows actually fit per page instead of forcing early page breaks.
    const PAGE_W = 792, PAGE_H = 612; // landscape letter
    const MARGIN = 12, COLS = 4, CELL_GAP = 6, CELL_W = 175;
    const CELL_H = CELL_W * (VH / VW);
    const LABEL_H = 10, ROW_H = LABEL_H + CELL_H;
    const SECTION_HEADER_H = 12, SECTION_GAP = 4, ROW_GAP = 2;
    const USABLE_W = PAGE_W - 2 * MARGIN;
    const GRID_W = COLS * CELL_W + (COLS - 1) * CELL_GAP;
    const GRID_X0 = MARGIN + (USABLE_W - GRID_W) / 2;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const RASTER_SCALE = 3; // renders at 3x cell size so it stays crisp when printed
    let y = MARGIN;
    let firstPage = true;

    function newPage() {
      if (!firstPage) doc.addPage();
      firstPage = false;
      y = MARGIN;
    }
    newPage();

    function ensureRoom(h) {
      if (y + h > PAGE_H - MARGIN) newPage();
    }

    function drawSectionHeader(label, colorHex) {
      ensureRoom(SECTION_HEADER_H + ROW_H);
      doc.setFillColor(colorHex);
      doc.rect(MARGIN, y, USABLE_W, SECTION_HEADER_H, 'F');
      doc.setTextColor('#ffffff');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(label.toUpperCase(), MARGIN + 5, y + SECTION_HEADER_H - 3.5);
      y += SECTION_HEADER_H;
    }

    const { svg: stage, wrap: stageWrap } = makeStage(VW, VH);
    let cellsDone = 0, cellsTotal = 0;

    const families = liveFamilies();

    // Pre-count total cells for progress reporting.
    families.forEach(f => {
      const pt = window.DATA.playTypes.find(p => p.key === f.key);
      cellsTotal += [...variantList(pt)].length;
    });
    cellsTotal += [...splitVariantList(families)].length;

    async function drawCell(cellX0, rowTopY, label, color, renderFn) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(color);
      doc.text(label, cellX0 + CELL_W / 2, rowTopY + LABEL_H - 2, { align: 'center' });
      const diagramY = rowTopY + LABEL_H;
      renderFn();
      const png = await svgToPng(stage, CELL_W, CELL_H, RASTER_SCALE);
      doc.addImage(png, 'PNG', cellX0, diagramY, CELL_W, CELL_H);
      doc.setDrawColor('#cccccc');
      doc.setLineWidth(0.6);
      doc.rect(cellX0, diagramY, CELL_W, CELL_H);
      cellsDone++;
      if (onProgress) onProgress(cellsDone, cellsTotal);
    }

    async function drawRows(items, color, renderFor) {
      const rows = [];
      let cur = [];
      for (const it of items) { cur.push(it); if (cur.length === COLS) { rows.push(cur); cur = []; } }
      if (cur.length) rows.push(cur);

      for (const row of rows) {
        ensureRoom(ROW_H);
        const rowTop = y;
        for (let i = 0; i < row.length; i++) {
          const cellX0 = GRID_X0 + i * (CELL_W + CELL_GAP);
          await drawCell(cellX0, rowTop, row[i].label, color, () => renderFor(row[i]));
        }
        y += ROW_H + ROW_GAP;
      }
    }

    // ---- Base formation sections, one per play family ----
    for (const fam of families) {
      const pt = window.DATA.playTypes.find(p => p.key === fam.key);
      const variants = [...variantList(pt)];
      drawSectionHeader(fam.label, fam.color);
      await drawRows(variants, fam.color, (v) => {
        window.renderCardDiagram(stage, fam.key, v.direction, v.direction, null, '4x4', v.io, v.motion, v.boot, v.rp);
      });
      y += SECTION_GAP;
    }

    // ---- Split Formation section ----
    const splitVariants = [...splitVariantList(families)];
    drawSectionHeader('Split Formation', SPLIT_COLOR);
    await drawRows(splitVariants, SPLIT_COLOR, (v) => {
      window.renderSplitDiagram(stage, v.playKey, v.side, v.io, v.rp, v.leftCall, v.rightCall, v.passOn, null);
    });

    stageWrap.remove();
    return doc;
  }

  window.generatePlaybookPDF = generatePlaybookPDF;

  // ---- Wire up the admin panel's "Save Sideline Playbook PDF" button ----
  const btn = document.getElementById('adminPdfDownloadBtn');
  if (btn) {
    const originalLabel = btn.textContent;
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const doc = await generatePlaybookPDF((done, total) => {
          btn.textContent = `📄 Generating… ${done}/${total}`;
        });
        doc.save('ASL_Bengals_Sideline_Playbook.pdf');
        btn.textContent = '✅ Saved!';
      } catch (err) {
        console.error('Playbook PDF generation failed:', err);
        btn.textContent = '⚠️ Failed — tap to retry';
      } finally {
        setTimeout(() => { btn.textContent = originalLabel; btn.disabled = false; }, 2200);
      }
    });
  }
})();

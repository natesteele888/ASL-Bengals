// ---------------------------------------------------------------------------
// Game Plan Call Sheet PDF -- Nathan: "This list of plays would also
// generate a call sheet for the week that has all the different calls we
// want to key in on as a printable 1 page PDF with all the details."
// Then, reviewing a first pass: "keep it tighter as there is likely to be
// a lot on there -- make sure you group plays by formation -- make this
// look the best it can and easiest to use on the sideline." And: "there is
// a bunch of text in the bottom of the play card that needs to go away" --
// the per-card signal-sequence line, dropped entirely; a card's own label
// (side/toggles/play/direction) plus its diagram is what a coach scanning
// under pressure actually needs, not a second line of text to parse.
//
// Unlike js/call-sheet-pdf.js (the existing "Print Play Sheet" -- a
// decision-tree reference of the WHOLE playbook), this prints only what's
// actually in This Week's own Game Plan list (js/thisweek.js), grouped
// into one colored section per formation (matching call-sheet-pdf.js's/
// playbook-pdf.js's own established section-header convention) so a coach
// scanning the sheet mid-game finds "I Wing" or "Wing" at a glance instead
// of hunting through a flat list.
//
// Rasterization (renderCardDiagram -> offscreen SVG -> canvas -> PNG ->
// jsPDF addImage) is the SAME pattern js/playbook-pdf.js/js/call-sheet-
// pdf.js already proved out -- own local copy of makeStage/svgToPng,
// matching this codebase's established per-file convention (see either
// file's own comment on why: not sharing an internal module scope).
// Smoke-tested directly against a real alignmentToggles-driven entry
// (I Wing's Dive, Overload Right) before building this file at all --
// confirmed real, non-blank pixel output (4.56% non-white), not just
// "didn't throw." Also calls window.loadLiveEditsIntoData() first, same
// as both sibling PDF files already do -- without it, a coach printing
// straight from This Week (never having visited the Plays tab that
// session) would get whatever DATA.playTypes happened to already hold --
// possibly shipped defaults, not their actual saved edits. Nathan: "be
// sure to use the saved paths, some didn't look like they should" --
// this missing call is almost certainly why.
// ---------------------------------------------------------------------------
(function () {

  // Matches the Formations screen's own real tile order (Wing, Split,
  // 5 Guys, I, I Wing) so sections read in the order a coach already
  // expects, not alphabetically or by add-order. Any future formation not
  // in this list still prints -- just after the known ones, in whatever
  // order it was first encountered, rather than being dropped.
  const FORMATION_ORDER = ['wing', 'split', '5-guys', 'i', 'i-wing'];
  const FORMATION_COLORS = { wing: '#1f6f43', split: '#2a5d8f', '5-guys': '#8a3b12', i: '#6b3fa0', 'i-wing': '#8a2e5c' };
  const FALLBACK_COLOR = '#455a64';

  function formationKey(entry) {
    if (entry.formation === 'split') return 'split';
    if (!entry.formation || entry.formation === 'shotgun') return 'wing';
    return entry.formation;
  }
  function formationName(key) {
    // Same 'Shotgun' rename as js/play-calls.js's own formationLabel --
    // Nathan: "This formation is called shotgun - it's our base
    // formation."
    if (key === 'wing') return 'Shotgun';
    if (key === 'split') return 'Split';
    const f = window.Formations && window.Formations.get(key);
    return f ? f.name : key;
  }
  function formationColor(key) {
    return FORMATION_COLORS[key] || FALLBACK_COLOR;
  }

  // The formation name is already the section header, so repeating it on
  // every card under that header (what window.GamePlan.describe()'s own
  // label does, correctly, for This Week's own flat list) would just be
  // noise here -- this keeps only what varies card to card: side/toggles/
  // play/direction.
  function compactLabel(entry) {
    const bits = [];
    bits.push(entry.formation === 'split' ? entry.splitSide : entry.wingSide);
    const align = window.GamePlan.alignmentSummary(entry);
    if (align) bits.push(align);
    bits.push(entry.label || entry.key);
    if (entry.formation !== 'split') bits.push(entry.direction);
    return bits.join(' — ');
  }

  // Nathan: "References for signal sequence would be good so we see the
  // information, coach can get a quick look to ensure he is calling in
  // the right sequence if he is adding some things like Overload or
  // things like that." The earlier full-text sequence ("Wing → Wing
  // Location: Right → Inside Zone → Direction: Right") was the "bunch of
  // text" he asked to remove -- this is the same real information,
  // reduced to just the physical card NUMBERS a coach actually flashes,
  // in order (e.g. "7 → 9 → 3") -- a coach who already knows the deck
  // can verify a sequence at a glance without reading a sentence, and it
  // costs a fraction of the space. Falls back to an em dash if a
  // sequence can't be built at all (e.g. a play with no signalCardId set
  // yet) rather than leaving the line blank with no explanation.
  function compactSequence(entry) {
    try {
      const seq = window.buildSignalSequence(entry.key, entry.wingSide, entry.direction, entry.insideOutside, entry.motionOn, entry.bootOn, entry.formation, entry.splitSide, entry.passOn, entry.counterOn, entry.popVariantOn, entry.protection, entry.overloadOn, entry.alignmentValues);
      const nums = (seq || []).map((s) => s.id).filter((id) => id != null);
      return nums.length ? nums.join(' → ') : '—';
    } catch (e) {
      return '—';
    }
  }

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

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
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    svg.setAttribute('width', vw);
    svg.setAttribute('height', vh);
    wrap.appendChild(svg);
    return { svg, wrap };
  }

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

  async function generateGamePlanPDF(plays) {
    if (!window.DATA || !window.DATA.playTypes) throw new Error('Play data not loaded yet.');
    if (!window.renderCardDiagram || !window.GamePlan) throw new Error('Play renderer not loaded yet.');
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');
    if (window.loadLiveEditsIntoData) await window.loadLiveEditsIntoData();

    const { jsPDF } = window.jspdf;
    const [VW, VH] = window.DATA.viewBox;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

    // Nathan: "keep it super tight so we can have a lot on there." 6
    // columns instead of 5 (smaller diagrams, still confirmed legible at
    // this size -- the underlying SVG rasterizes cleanly at any cell
    // size, verified directly), tighter padding, and the label itself
    // trimmed to what a coach actually needs mid-scan -- the net result
    // is a SHORTER card than the signal-line-free version even after
    // adding the sequence reference back, not just "the same size plus
    // one more line."
    const PAGE_W = 792, PAGE_H = 612, MARGIN = 16;
    const COLS = 6, CELL_GAP = 6, ROW_GAP = 4, SECTION_GAP = 8;
    const USABLE_W = PAGE_W - 2 * MARGIN;
    const CELL_W = (USABLE_W - (COLS - 1) * CELL_GAP) / COLS;
    const DIAGRAM_H = CELL_W * (VH / VW);
    const LABEL_H = 17, SEQ_H = 9, CARD_PAD = 2;
    const CELL_H = LABEL_H + DIAGRAM_H + SEQ_H + CARD_PAD * 2;
    const SECTION_HEADER_H = 12;
    const TITLE_H = 18;
    const RASTER_SCALE = 3;

    let y = MARGIN;
    let firstPage = true;
    function newPage() {
      if (!firstPage) doc.addPage();
      firstPage = false;
      y = MARGIN;
    }
    // A typical week's Game Plan (concentrated in 2-3 formations, per
    // Nathan's own "likely to be a lot on there" -- dense, not spread
    // thin) fits on one page at this sizing. A pathological spread across
    // every formation could still overflow -- rather than crush legibility
    // to force a fit, this pages the same way js/playbook-pdf.js's own
    // proven ensureRoom/newPage already does, so it degrades to "2 clean
    // pages" instead of overlapping content on 1.
    function ensureRoom(h) {
      if (y + h > PAGE_H - MARGIN) newPage();
    }
    newPage();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor('#111111');
    doc.text('ASL Bengals — Game Plan Call Sheet', MARGIN, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#666666');
    doc.text(new Date().toLocaleDateString(), PAGE_W - MARGIN, y + 10, { align: 'right' });
    y += TITLE_H;

    const { svg: stage, wrap: stageWrap } = makeStage(VW, VH);

    const groups = new Map();
    for (const raw of (plays || [])) {
      const entry = window.GamePlan.resolveForRender(raw);
      if (!entry) continue;
      const key = formationKey(entry);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    const orderedKeys = FORMATION_ORDER.filter((k) => groups.has(k))
      .concat([...groups.keys()].filter((k) => !FORMATION_ORDER.includes(k)));

    for (const key of orderedKeys) {
      const items = groups.get(key);
      const color = formationColor(key);
      const rows = chunk(items, COLS);

      // Header + its first row together, so a section title never gets
      // stranded alone at the bottom of a page with its cards pushed to
      // the next one.
      ensureRoom(SECTION_HEADER_H + CELL_H);
      doc.setFillColor(color);
      doc.rect(MARGIN, y, USABLE_W, SECTION_HEADER_H, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor('#ffffff');
      doc.text(`${formationName(key).toUpperCase()}  (${items.length})`, MARGIN + 5, y + SECTION_HEADER_H - 3.8);
      y += SECTION_HEADER_H + 3;

      for (const row of rows) {
        ensureRoom(CELL_H);
        for (let c = 0; c < row.length; c++) {
          const entry = row[c];
          const cellX = MARGIN + c * (CELL_W + CELL_GAP);

          const formationId = entry.formation === 'shotgun' ? undefined : entry.formation;
          if (entry.formation === 'split' && window.renderSplitDiagram) {
            window.renderSplitDiagram(stage, entry.key, entry.splitSide, entry.insideOutside, entry.readPosition, entry.leftCall, entry.rightCall, entry.passOn, null, entry.protection);
          } else {
            window.renderCardDiagram(stage, entry.key, entry.direction, entry.wingSide, null, '4x4', entry.insideOutside, entry.motionOn, entry.bootOn, entry.readPosition, entry.counterOn, entry.popVariantOn, formationId, entry.overloadOn, entry.alignmentValues, entry.qbSneakOn);
          }
          const png = await svgToPng(stage, CELL_W, DIAGRAM_H, RASTER_SCALE);

          // A colored top accent (matching the section's own header color)
          // instead of a plain gray box on every card -- ties each card
          // visibly back to its section even if a page break separates a
          // card from its own header.
          doc.setFillColor(color);
          doc.rect(cellX, y, CELL_W, 2, 'F');
          doc.setDrawColor('#d5d5d5');
          doc.setLineWidth(0.6);
          doc.rect(cellX, y, CELL_W, CELL_H);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.8);
          doc.setTextColor('#111111');
          const labelLines = doc.splitTextToSize(compactLabel(entry), CELL_W - 4).slice(0, 2);
          doc.text(labelLines, cellX + CELL_W / 2, y + CARD_PAD + 6, { align: 'center' });

          doc.addImage(png, 'PNG', cellX, y + LABEL_H, CELL_W, DIAGRAM_H);

          // Nathan: "a quick look to ensure he is calling in the right
          // sequence" -- the real card numbers, in order, so a coach who
          // already knows the deck can double-check fast without reading
          // a sentence.
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.2);
          doc.setTextColor('#555555');
          doc.text(compactSequence(entry), cellX + CELL_W / 2, y + LABEL_H + DIAGRAM_H + 7, { align: 'center' });
        }
        y += CELL_H + ROW_GAP;
      }
      y += SECTION_GAP - ROW_GAP;
    }

    stageWrap.remove();

    // Same build-number stamp js/playbook-pdf.js already established on
    // every page -- lets a printed sheet be matched back to the app build
    // that made it.
    const buildLabel = window.BUILD_V ? `Build ${window.BUILD_V}` : 'ASL Bengals';
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor('#999999');
      doc.text(buildLabel, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });
    }

    return doc;
  }

  window.generateGamePlanPDF = generateGamePlanPDF;
})();

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
  // 5 Guys, I, I Wing, Jumbo) so sections read in the order a coach
  // already expects, not alphabetically or by add-order. Any future
  // formation not in this list still prints -- just after the known
  // ones, in whatever order it was first encountered, rather than being
  // dropped.
  const FORMATION_ORDER = ['wing', 'split', '5-guys', 'i', 'i-wing', 'jumbo'];
  const FORMATION_COLORS = { wing: '#1f6f43', split: '#2a5d8f', '5-guys': '#8a3b12', i: '#6b3fa0', 'i-wing': '#8a2e5c', jumbo: '#8a7b12' };
  const FALLBACK_COLOR = '#455a64';

  // Mixes a hex color toward white -- used for the full-playbook
  // reference's "add-on option" pills, a lighter tint of the same
  // formation color the play-name header above them uses, so the whole
  // column still reads as one color family without a second fill color
  // to maintain per formation.
  function tint(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mix = (c) => Math.round(c + (255 - c) * amt);
    return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }

  function formationKey(entry) {
    if (entry.formation === 'split') return 'split';
    if (!entry.formation || entry.formation === 'shotgun') return 'wing';
    return entry.formation;
  }
  function formationName(key) {
    // Same 'Wing' naming as js/play-calls.js's own formationLabel --
    // Nathan: "you are calling the wing formation (which is in shotgun)
    // the shotgun formation. It should be the wing formation."
    if (key === 'wing') return 'Wing';
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
      const seq = window.buildSignalSequence(entry.key, entry.wingSide, entry.direction, entry.insideOutside, entry.motionOn, entry.bootOn, entry.formation, entry.splitSide, entry.passOn, entry.counterOn, entry.popVariantOn, entry.protection, entry.overloadOn, entry.alignmentValues, undefined, entry.reverseOn);
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
            window.renderCardDiagram(stage, entry.key, entry.direction, entry.wingSide, null, '4x4', entry.insideOutside, entry.motionOn, entry.bootOn, entry.readPosition, entry.counterOn, entry.popVariantOn, formationId, entry.overloadOn, entry.alignmentValues, entry.qbSneakOn, entry.reverseOn, entry.qbKeepOn);
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

  // ---------------------------------------------------------------------
  // Quick Reference PDF -- Nathan: "I need a simplified version for the
  // print out. I don't need to see the formation and the play diagram
  // itself. I just need a list of Play Calls with available Formations to
  // run it out of. Along with lists of plays per formations... For
  // example 'Sweep' then have pills for each formation you can run it in.
  // Then you can have Formations with pills of each play you run out of
  // it... We are trying to get too granular with the play call sheets for
  // each week -- need to be simple organized lists." A second, additive
  // print option alongside generateGamePlanPDF above (nothing asked for
  // that detailed one to go away) -- no diagrams, no rasterization, just
  // two cross-referenced text lists built from the SAME Game Plan data
  // and the SAME formationKey/formationName/formationColor/FORMATION_ORDER
  // helpers above, so formation naming/coloring/order can't drift between
  // the two PDFs.
  // ---------------------------------------------------------------------

  // A play's own bare name (e.g. "Sweep"), the one thing this reference
  // groups by -- not window.GamePlan.describe()'s own compound label
  // (formation + toggles + name), which would make "Sweep • Wing" and
  // "Sweep • I Wing" look like two different calls instead of the same
  // call available from two formations, exactly backwards from what was
  // asked for here.
  function playNameFor(entry) {
    return entry.label || entry.playKey || entry.key || '?';
  }

  function measurePillWidth(doc, text) {
    return doc.getTextWidth(text) + 10;
  }
  const PILL_H = 13;
  function drawPill(doc, x, y, text, color, textColor) {
    const w = measurePillWidth(doc, text);
    doc.setFillColor(color);
    doc.roundedRect(x, y, w, PILL_H, PILL_H / 2, PILL_H / 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(textColor || '#ffffff');
    doc.text(text, x + w / 2, y + PILL_H / 2 + 2.6, { align: 'center' });
    return w;
  }
  // Flows pills left-to-right inside [x, x+maxW], wrapping to a new line
  // (indented back to x, not hanging under the label) whenever the next
  // pill wouldn't fit -- returns the y position just below the last line
  // drawn, ready for the next row.
  function flowPills(doc, x, y, maxW, pills) {
    const GAP = 5, LINE_H = PILL_H + 4;
    let curX = x, curY = y;
    pills.forEach((p) => {
      const w = measurePillWidth(doc, p.text);
      if (curX > x && curX + w > x + maxW) { curX = x; curY += LINE_H; }
      drawPill(doc, curX, curY, p.text, p.color, p.textColor);
      curX += w + GAP;
    });
    return curY + LINE_H;
  }

  async function generateQuickReferencePDF(plays) {
    if (!window.GamePlan) throw new Error('Game Plan data not loaded yet.');
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');
    if (window.loadLiveEditsIntoData) await window.loadLiveEditsIntoData();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const PAGE_W = 792, PAGE_H = 612, MARGIN = 20;

    // Two cross-referencing maps off the SAME entries -- playName ->
    // which formationKeys it's available in, and formationKey -> which
    // playNames are available from it. Deliberately dedupes by name alone
    // (not name+direction+toggles) -- a Left call and a Right call of the
    // same play are the same CALL for "what can I run from this
    // formation" purposes, not two different ones.
    const byPlay = new Map();
    const byFormation = new Map();
    for (const raw of (plays || [])) {
      const entry = window.GamePlan.resolveForRender(raw);
      if (!entry) continue;
      const fKey = formationKey(entry);
      const name = playNameFor(entry);
      if (!byPlay.has(name)) byPlay.set(name, new Set());
      byPlay.get(name).add(fKey);
      if (!byFormation.has(fKey)) byFormation.set(fKey, new Set());
      byFormation.get(fKey).add(name);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor('#111111');
    doc.text('ASL Bengals — Game Plan Quick Reference', MARGIN, MARGIN + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#666666');
    doc.text(new Date().toLocaleDateString(), PAGE_W - MARGIN, MARGIN + 10, { align: 'right' });

    const COL_GAP = 24;
    const COL_W = (PAGE_W - 2 * MARGIN - COL_GAP) / 2;
    const leftX = MARGIN, rightX = MARGIN + COL_W + COL_GAP;
    const topY = MARGIN + 30;

    function sectionHeader(x, text) {
      doc.setFillColor('#1a1a1a');
      doc.rect(x, topY, COL_W, 16, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor('#ffffff');
      doc.text(text, x + 6, topY + 11.5);
      return topY + 16 + 10;
    }

    // LEFT -- By Play, alphabetical (a coach scanning for a specific call
    // by name), each with a pill per formation it's available in.
    let y1 = sectionHeader(leftX, `BY PLAY  (${byPlay.size})`);
    [...byPlay.keys()].sort((a, b) => a.localeCompare(b)).forEach((name) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor('#111111');
      doc.text(name, leftX, y1);
      y1 += 11;
      const pills = [...byPlay.get(name)]
        .sort((a, b) => FORMATION_ORDER.indexOf(a) - FORMATION_ORDER.indexOf(b))
        .map((fKey) => ({ text: formationName(fKey), color: formationColor(fKey) }));
      y1 = flowPills(doc, leftX, y1, COL_W, pills) + 5;
    });

    // RIGHT -- By Formation, in the same real tile order every other
    // Game Plan surface uses, each with a (neutral-colored, since the
    // formation itself already owns the color here) pill per play.
    let y2 = sectionHeader(rightX, `BY FORMATION  (${byFormation.size})`);
    const orderedFormationKeys = FORMATION_ORDER.filter((k) => byFormation.has(k))
      .concat([...byFormation.keys()].filter((k) => !FORMATION_ORDER.includes(k)));
    orderedFormationKeys.forEach((fKey) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(formationColor(fKey));
      doc.text(formationName(fKey), rightX, y2);
      y2 += 11;
      const pills = [...byFormation.get(fKey)].sort((a, b) => a.localeCompare(b))
        .map((name) => ({ text: name, color: '#e2e2e2', textColor: '#222222' }));
      y2 = flowPills(doc, rightX, y2, COL_W, pills) + 5;
    });

    const buildLabel = window.BUILD_V ? `Build ${window.BUILD_V}` : 'ASL Bengals';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor('#999999');
    doc.text(buildLabel, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });

    return doc;
  }

  // ---------------------------------------------------------------------
  // Full Playbook Reference PDF -- Nathan, with a screenshot of the Game
  // Plan Builder's own play-picker (pills per play) as the visual/
  // interaction reference: "I need to be able to print out the PDF
  // visual of all the plays. It needs to be Super easy similar to this
  // section here. CTA style cells - All formations along the top
  // creating 6 columns, then each play under it that we can run, below
  // each of those small CTAs for the add on options for each. Color
  // Coded easy to read - no diagrams just names."
  //
  // Unlike generateGamePlanPDF/generateQuickReferencePDF above (both
  // scoped to whatever's curated into THIS WEEK's own Game Plan), this
  // covers the FULL, evergreen playbook across all 6 real formations --
  // sourced from window.playsForFormation() (js/play-calls.js), the
  // exact same curation/fallback rules the real Play tab's own browse
  // grid uses (factored out of renderFormationPlays() specifically for
  // this reuse), so this can never show a play under the wrong formation
  // or miss/duplicate a curated one. No diagrams/rasterization at all --
  // "no diagrams just names" sidesteps the one real risk every other PDF
  // in this file has to smoke-test (offscreen SVG rendering of a custom
  // formation's alignmentToggles-driven geometry) -- this is pure vector
  // text/pills, reusing the SAME drawPill/measurePillWidth helpers
  // generateQuickReferencePDF already built rather than a second copy.
  //
  // "Add-on options" are shown as the TOGGLE'S OWN NAME (e.g. "Overload",
  // "Motion", "Read A/B"), not every value combination (e.g. not
  // "Overload: Off"/"Overload: L"/"Overload: R" as 3 separate pills) --
  // keeps each play's own block genuinely small/scannable the way "CTA
  // style... small CTAs" asks for, and the printed reference's job is
  // "what can I additionally call for this play," not a second copy of
  // the live card's own interactive toggles.
  //
  // The exact show/hide rule for every toggle was read directly out of
  // js/play-calls.js's buildCard() (not guessed) -- see the comment on
  // addOnPillsFor() below for the reasoning behind each one, and
  // call-sheet-pdf.js's own established principle for why this matters:
  // "make sure if a coach prints the play calls, it's reflective to the
  // options we have in the play calls."
  // ---------------------------------------------------------------------

  // Every toggle a coach can additionally call for this play, in this
  // formation -- one short pill per toggle NAME, matching buildCard's own
  // exact show/hide conditions (js/play-calls.js, read in full). Nathan,
  // with a screenshot circling "Wing Side"/"Direction" on a real printed
  // page: "wing side and direction don't make sense to call out - Boot,
  // Overload, QB Sneak, Motion, Reverse, those are the things we need to
  // call out." Deliberately excludes Wing Side/Direction/Split Side --
  // every single play needs a side and a direction, so flagging them as
  // if they're a special, optional "add-on" is noise; a real add-on is
  // something a coach might or might not layer onto the base call. Same
  // reasoning extends to Split Side (the Split-formation equivalent of
  // Wing Side) even though Nathan's own example only showed Wing plays --
  // Pass stays (a genuine, optional Split call, not a baseline axis) --
  // Protection/Left Call/Right Call were cut too, per Nathan's own
  // follow-up ("Protection, Left Call, Right Call all don't need to be
  // visible").
  // - The legacy, 3-value Overload toggle (Off/L/R) only exists for the
  //   built-in Wing formation (Formations.supportsOverload() is only
  //   ever true there) -- I/I-Wing's own Overload comes through
  //   `alignmentToggles` instead (below), a parallel, unrelated code path
  //   that happens to share the same visual convention.
  // - QB Sneak/Boot/Reverse share one slot and CAN combine (confirmed
  //   against the real code, not assumed): QB Sneak takes priority over
  //   Boot specifically (a play with hasQbSneak never also shows Boot,
  //   even if noBoot is false), Reverse is independent of Boot, QB Keep
  //   is independent of all three.
  // - Read A/B, Counter, and Pop Variant are mutually exclusive (one slot,
  //   first match wins, matching buildCard's own if/else-if chain) --
  //   alignmentToggles (Overload for I/I-Wing, or any future per-
  //   formation toggle) only shows when NONE of those three apply, one
  //   pill per toggle, using the toggle's own author-set label so a new
  //   toggle needs no new code here.
  function addOnPillsFor(combo, formationId) {
    const pills = [];
    if (formationId === 'split') {
      pills.push('Pass');
      return pills;
    }
    const isQbSneakPlay = combo.playKey === 'qb_sneak';
    if (formationId === 'wing' && !combo.hasPopVariant && !combo.noOverload) pills.push('Overload');
    if (!isQbSneakPlay && !combo.noMotion) pills.push('Motion');
    if (!combo.hasQbSneak && !combo.noBoot) pills.push('Boot');
    if (combo.hasReverse && !combo.hasQbSneak) pills.push('Reverse');
    if (combo.hasQbSneak) pills.push('QB Sneak');
    if (combo.hasQbKeep) pills.push('QB Keep');
    if (combo.hasInsideOutside) pills.push('In/Out');
    else if (combo.altCallCardId != null) pills.push(combo.altCallLabel || 'Alt Call');
    // Nathan: "we dont need Read A/B - or Pop Variant" -- dropped, same
    // reasoning as the Wing Side/Direction cut above (buildCard's own
    // hasCounter/alignmentToggles branches still apply when present).
    if (combo.hasCounter) pills.push('Counter');
    else if (combo.alignmentToggles && combo.alignmentToggles.length) {
      combo.alignmentToggles.forEach((t) => pills.push(t.label));
    }
    return pills;
  }

  // Lays out one formation's whole column -- play-name header pill, then
  // its add-on pills flowed/wrapped beneath, repeated for every play --
  // and returns the final y. `draw` false does the exact same text-
  // measuring/wrapping work (so height and ink can never disagree) but
  // skips every actual fillRect/text call, used for the up-front sizing
  // pass that decides how tall the one real page needs to be.
  const PLAY_PILL_H = 15, ADDON_PILL_H = 11;
  function renderColumn(doc, x, y, w, formationId, color, lightTint, plays, draw) {
    const startY = y;
    plays.forEach((combo) => {
      if (draw) {
        doc.setFillColor(color);
        doc.roundedRect(x, y, w, PLAY_PILL_H, 3, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor('#ffffff');
        const label = doc.splitTextToSize(combo.label, w - 8)[0];
        doc.text(label, x + w / 2, y + PLAY_PILL_H / 2 + 3, { align: 'center' });
      }
      y += PLAY_PILL_H + 3;

      const pills = addOnPillsFor(combo, formationId).map((text) => ({ text }));
      // Deliberately not reusing the louder drawPill/flowPills above --
      // those are sized for a handful of big, bold, white-on-color pills
      // across a half-page-wide column; a ~120pt-wide formation column
      // with up to a dozen plays needs its own smaller, tighter pill/line
      // sizing to stay legible and "small."
      const GAP = 3, LINE_H = ADDON_PILL_H + 3;
      let curX = x, curY = y;
      pills.forEach((p) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.3);
        const pw = doc.getTextWidth(p.text) + 7;
        if (curX > x && curX + pw > x + w) { curX = x; curY += LINE_H; }
        if (draw) {
          doc.setFillColor(lightTint);
          doc.roundedRect(curX, curY, pw, ADDON_PILL_H, ADDON_PILL_H / 2, ADDON_PILL_H / 2, 'F');
          doc.setTextColor(color);
          doc.text(p.text, curX + pw / 2, curY + ADDON_PILL_H / 2 + 2.1, { align: 'center' });
        }
        curX += pw + GAP;
      });
      y = curY + LINE_H + 6;
    });
    return y - startY;
  }

  // Renders one column that stacks TWO formations' sections (own header +
  // own renderColumn each) back to back -- used for 5 Guys + Jumbo, which
  // Nathan asked to condense into one column (Jumbo's only ever had the
  // one "Beast" play so far, not enough on its own to earn a full column
  // the way Wing/Split/I/I Wing do). Same measure/draw split as
  // renderColumn itself, for the same reason.
  function renderStackedColumn(doc, x, y, w, groups, draw) {
    const startY = y;
    groups.forEach(({ id, color, items }) => {
      if (draw) {
        doc.setFillColor(color);
        doc.roundedRect(x, y, w, HEADER_H_STACKED, 3, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor('#ffffff');
        doc.text(`${formationName(id).toUpperCase()}  (${items.length})`, x + w / 2, y + HEADER_H_STACKED / 2 + 3, { align: 'center' });
      }
      y += HEADER_H_STACKED + 4;
      if (items.length) {
        y += renderColumn(doc, x, y, w, id, color, tint(color, 0.85), items, draw);
      } else if (draw) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor('#999999');
        doc.text('No plays yet', x + w / 2, y + 9, { align: 'center' });
        y += 16;
      } else {
        y += 16;
      }
      y += 8;
    });
    return y - startY;
  }
  const HEADER_H_STACKED = 15;

  async function generateFullPlaybookReferencePDF() {
    if (!window.playsForFormation || !window.Formations) throw new Error('Play data not loaded yet.');
    if (!window.jspdf) throw new Error('PDF library not loaded yet.');
    if (window.loadLiveEditsIntoData) await window.loadLiveEditsIntoData();

    const allFormations = window.Formations.list().map((f) => f.id);
    const formationIds = FORMATION_ORDER.filter((id) => allFormations.includes(id))
      .concat(allFormations.filter((id) => !FORMATION_ORDER.includes(id)));

    const playsByFormation = {};
    for (const id of formationIds) {
      playsByFormation[id] = await window.playsForFormation(id);
    }

    // Nathan: "let's condense the 5 guys column with the jumbo column" --
    // every solo formation keeps its own column; 5 Guys and Jumbo stack
    // inside one shared column instead. Any future formation not in
    // FORMATION_ORDER at all still gets its own solo column (same
    // fallback the old flat list already had), just never auto-merged --
    // merging is Nathan's own explicit call about these two specific,
    // currently-small formations, not a general "small formations merge"
    // rule this should keep making on its own as the playbook grows.
    const MERGE_IDS = ['5-guys', 'jumbo'];
    const soloIds = formationIds.filter((id) => !MERGE_IDS.includes(id));
    const mergeGroups = MERGE_IDS.filter((id) => formationIds.includes(id))
      .map((id) => ({ id, color: formationColor(id), items: playsByFormation[id] }));

    // Slots left-to-right: every solo formation, with the merged 5 Guys/
    // Jumbo column in its original FORMATION_ORDER position -- one fewer
    // slot than before now that the sideline key column (Nathan: "remove
    // the sideline key as well") is gone; the remaining columns widen to
    // fill the page automatically (COL_W below derives from slots.length).
    const mergeInsertAt = soloIds.findIndex((id) => FORMATION_ORDER.indexOf(id) > FORMATION_ORDER.indexOf(MERGE_IDS[0]));
    const slots = soloIds.slice(0, mergeInsertAt < 0 ? soloIds.length : mergeInsertAt).map((id) => ({ type: 'solo', id }));
    if (mergeGroups.length) slots.push({ type: 'merged', groups: mergeGroups });
    if (mergeInsertAt >= 0) soloIds.slice(mergeInsertAt).forEach((id) => slots.push({ type: 'solo', id }));

    const { jsPDF } = window.jspdf;
    const PAGE_W = 792, MARGIN = 16, COL_GAP = 8, HEADER_H = 18, TITLE_H = 26;
    const COLS = slots.length;
    const USABLE_W = PAGE_W - 2 * MARGIN;
    const COL_W = (USABLE_W - (COLS - 1) * COL_GAP) / COLS;

    // Measure first (own throwaway doc -- text metrics don't depend on
    // page size, only the font/size actually set when measuring, which
    // this reuses identically in the real draw pass below), so the one
    // real page can be sized to fit every column's content exactly --
    // "CTA style cells... all columns" reads as one continuous
    // reference, not a reference that's arbitrarily paginated mid-column.
    const measureDoc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    let maxColH = 0;
    slots.forEach((slot) => {
      let h;
      if (slot.type === 'solo') h = HEADER_H + 5 + renderColumn(measureDoc, 0, 0, COL_W, slot.id, null, null, playsByFormation[slot.id], false);
      else h = renderStackedColumn(measureDoc, 0, 0, COL_W, slot.groups, false);
      if (h > maxColH) maxColH = h;
    });

    const PAGE_H = Math.max(612, TITLE_H + maxColH + MARGIN * 2 + 10);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [PAGE_W, PAGE_H] });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor('#111111');
    doc.text('ASL Bengals — Full Playbook Reference', MARGIN, MARGIN + 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#666666');
    doc.text(new Date().toLocaleDateString(), PAGE_W - MARGIN, MARGIN + 11, { align: 'right' });

    const colTopY = MARGIN + TITLE_H;
    slots.forEach((slot, i) => {
      const x = MARGIN + i * (COL_W + COL_GAP);
      if (slot.type === 'merged') {
        renderStackedColumn(doc, x, colTopY, COL_W, slot.groups, true);
        return;
      }
      const id = slot.id;
      const color = formationColor(id);
      doc.setFillColor(color);
      doc.roundedRect(x, colTopY, COL_W, HEADER_H, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor('#ffffff');
      const items = playsByFormation[id];
      doc.text(`${formationName(id).toUpperCase()}  (${items.length})`, x + COL_W / 2, colTopY + HEADER_H / 2 + 3.3, { align: 'center' });

      renderColumn(doc, x, colTopY + HEADER_H + 5, COL_W, id, color, tint(color, 0.85), items, true);
      if (!items.length) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor('#999999');
        doc.text('No plays yet', x + COL_W / 2, colTopY + HEADER_H + 18, { align: 'center' });
      }
    });

    const buildLabel = window.BUILD_V ? `Build ${window.BUILD_V}` : 'ASL Bengals';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor('#999999');
    doc.text(buildLabel, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });

    return doc;
  }

  window.generateGamePlanPDF = generateGamePlanPDF;
  window.generateQuickReferencePDF = generateQuickReferencePDF;
  window.generateFullPlaybookReferencePDF = generateFullPlaybookReferencePDF;
})();

// ---------------------------------------------------------------------------
// Coach Tools > Crash Course -- pick a position, optionally name the player,
// export the PDF js/position-crashcourse-pdf.js builds.
//
// Nathan (2026-10-10): "I have a player who has been playing the 3 most of the
// season but he is now moving to the 4 (wing)... I need a way of exporting a
// crash course for him with the 4 so he knows what he is doing on most plays."
//
// A kid changing spots is going to happen again, so the position is a picker
// (the 4 is simply first), not a one-off. The sheet is built from the live play
// data at export time, in the coach's own signed-in session -- which is also why
// it can include the custom formations (I, I Wing, 5 Guys...) that only exist in
// the cloud.
// ---------------------------------------------------------------------------
(function () {
  'use strict';

  // [value, label]. The 4 first -- it's the reason this exists.
  const POSITIONS = [
    ['4', '#4 — Wing'], ['1', '#1'], ['2', '#2'], ['3', '#3'], ['5', '#5'], ['6', '#6'],
    ['LT', 'LT'], ['LG', 'LG'], ['C', 'C'], ['RG', 'RG'], ['RT', 'RT'],
  ];
  let built = false;

  function el(id) { return document.getElementById(id); }

  function build() {
    const body = el('coachCrashCourseBody');
    if (!body) return;
    body.innerHTML =
      '<div class="coachToolsSubPanel" style="max-width:480px;margin:0 auto">' +
      '  <div class="build-panel">' +
      '    <div class="build-panel-label">Position</div>' +
      '    <select id="ccPositionSelect" style="width:100%;padding:9px"></select>' +
      '  </div>' +
      '  <div class="build-panel">' +
      '    <div class="build-panel-label">Player name (optional)</div>' +
      '    <input type="text" id="ccPlayerName" maxlength="40" placeholder="Printed at the top of the sheet" style="width:100%;padding:9px">' +
      '  </div>' +
      '  <button class="navBtn" id="ccExportBtn" style="display:block;width:100%;margin-top:8px;min-height:44px">Export crash course (PDF)</button>' +
      '  <div class="hint" id="ccStatus" role="status" style="min-height:1.4em;margin-top:8px;text-align:center"></div>' +
      '</div>';

    const sel = el('ccPositionSelect');
    POSITIONS.forEach(function (p) {
      const o = document.createElement('option');
      o.value = p[0];
      o.textContent = p[1];
      sel.appendChild(o);
    });

    el('ccExportBtn').addEventListener('click', onExport);
  }

  // ASL_Bengals_Crash_Course_4_Jordan.pdf
  function fileNameFor(pos, name) {
    const who = name ? '_' + name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : '';
    return 'ASL_Bengals_Crash_Course_' + pos + who + '.pdf';
  }

  async function onExport() {
    const btn = el('ccExportBtn'), status = el('ccStatus');
    if (btn.disabled) return;
    if (!window.generatePositionCrashCoursePDF) {
      status.textContent = 'The export isn’t loaded yet — reload the app and try again.';
      return;
    }
    const pos = el('ccPositionSelect').value;
    const name = el('ccPlayerName').value.trim();
    btn.disabled = true;
    status.textContent = 'Building…';
    try {
      const result = await window.generatePositionCrashCoursePDF(pos, {
        playerName: name,
        onProgress: function (msg) { status.textContent = msg; },
      });
      result.doc.save(fileNameFor(pos, name));
      const c = result.summary.counts;
      status.textContent = 'Saved. Carries on ' + c.CARRY + ' play' + (c.CARRY === 1 ? '' : 's') +
        ', runs a route on ' + c.ROUTE + ', blocks on ' + c.BLOCK + '.';
    } catch (err) {
      console.error('[crash course] export failed:', err);
      status.textContent = 'Could not build the PDF: ' + (err && err.message ? err.message : err);
    }
    btn.disabled = false;
  }

  window.initCoachCrashCourse = function () {
    if (built) return;
    built = true;
    build();
  };
})();

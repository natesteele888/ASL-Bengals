// Formation Builder, for real -- Coach Tools' own panel, not the
// dev-preview.html sandbox. Nathan: "I need to switch it and then be able
// to go in and start... creating the new formations... That needs to be
// complete and baked in ready to go."
//
// Ported from dev-preview.html's #step1 (FormationBuilder itself is
// untouched -- js/formation-builder.js -- only this page's own wiring
// around it is new, and built from the real app's own components
// (buildToggleGroup/placeToggleThumb from js/play-calls.js, already
// global -- not dev-preview's own .seg/.fieldcard/.wrap, which have no
// styling at all outside that standalone page). The one real behavior
// rewrite: saving now goes through real Firebase
// (js/assignment-store.js's saveFormation/loadFormations), replacing
// dev-preview's localStorage-only save, and a saved formation is
// registered directly via Formations.registerCustom() -- not a full
// loadCustom() re-fetch -- so it's visible everywhere in this SAME
// session (Play Calls' own formation picker included) with no network
// round-trip and no risk of a bulk-replace race dropping something else.
//
// coachtools-nav.js calls init() on every tab activation, not just the
// first (see js/coachtools-nav.js's setActiveTab) -- `built` guards
// against reconstructing the DOM and the live FormationBuilder instance
// each time a coach taps back into this tab.

(function () {
  'use strict';

  var built = false;
  var builder = null;
  var seedId = 'wing';

  function build() {
    var body = document.getElementById('coachFormationBuilderBody');
    body.style.display = 'flex';
    body.style.gap = '16px';
    body.style.flexWrap = 'wrap';

    var fieldCard = document.createElement('div');
    fieldCard.className = 'diagramCard';
    fieldCard.style.flex = '1 1 480px';
    fieldCard.style.minWidth = '320px';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    fieldCard.appendChild(svg);
    body.appendChild(fieldCard);

    var side = document.createElement('div');
    side.className = 'coachToolsSubPanel';
    side.style.flex = '0 0 320px';
    side.style.minWidth = '280px';
    // .lbl exists in the real stylesheet but scoped to .adminStatCard --
    // it wouldn't apply here, so this panel's own labels are styled
    // inline, matching that same look (small, muted, uppercase).
    var LBL = 'display:block;font-size:10.5px;color:var(--muted);font-weight:700;' +
      'text-transform:uppercase;letter-spacing:.03em;margin:10px 0 6px';
    // .navBtn has no display/width of its own (it's a plain <button>, sized
    // to its label) -- BTN forces the vertical, full-width stack this form
    // needs instead of several buttons wrapping inline.
    var BTN = 'display:block;width:100%;margin-top:8px';
    side.innerHTML =
      '<label style="' + LBL + '">Start from</label>' +
      '<select id="cfbSeedSel" style="width:100%;padding:9px;margin-bottom:12px"></select>' +
      '<label style="' + LBL + '">Side</label>' +
      '<div id="cfbSideSeg" style="margin-bottom:10px"></div>' +
      '<button class="navBtn secondary" id="cfbMirrorBtn" style="' + BTN + '">Mirror this side → other side</button>' +
      '<div id="cfbAnchorBox" style="display:none;margin-top:10px">' +
      '  <label style="' + LBL + '">Selected player</label>' +
      '  <div style="display:flex;align-items:center;gap:10px">' +
      '    <span id="cfbSelName" style="font-weight:800;font-size:15px"></span>' +
      '    <label style="font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;cursor:pointer">' +
      '      <input type="checkbox" id="cfbAnchorChk"> stays put when mirrored' +
      '    </label>' +
      '  </div>' +
      '</div>' +
      '<label style="' + LBL + '">Formation name</label>' +
      '<input type="text" id="cfbNameInput" placeholder="e.g. I-Formation" style="width:100%;padding:9px;margin-bottom:10px">' +
      '<button class="navBtn" id="cfbSaveBtn" style="' + BTN + '">Save formation</button>' +
      '<button class="navBtn secondary" id="cfbResetBtn" style="' + BTN + '">Reset to start</button>' +
      '<div class="hint" id="cfbStatus" style="min-height:1.4em"></div>' +
      '<div class="hint" id="cfbSavedList"></div>' +
      '<div class="hint">' +
      '  Linemen (LT LG C RG RT) block, 1–6 run routes -- drag any of the 11 ' +
      '  to set where they line up. The line of scrimmage follows the center, ' +
      '  so you can shift the whole front.<br><br>' +
      '  Build one side, hit <b>Mirror</b>, then fix up anything that shouldn’t ' +
      '  flip — real formations often aren’t symmetric.' +
      '</div>';
    body.appendChild(side);

    var statusEl = document.getElementById('cfbStatus');
    var nameInput = document.getElementById('cfbNameInput');
    var seedSel = document.getElementById('cfbSeedSel');
    var anchorBox = document.getElementById('cfbAnchorBox');
    var anchorChk = document.getElementById('cfbAnchorChk');
    var selName = document.getElementById('cfbSelName');

    function refreshSeedOptions(keepId) {
      seedSel.innerHTML = '';
      window.Formations.list().forEach(function (f) {
        var o = document.createElement('option');
        o.value = f.id;
        o.textContent = f.name + (f.builtIn ? '' : '  (yours)');
        seedSel.appendChild(o);
      });
      if (keepId) seedSel.value = keepId;
    }

    // Custom formations are already loaded app-wide at boot (index.html
    // calls AssignmentStore.loadFormations() -> Formations.loadCustom()
    // before any Coach Tools tab is reachable) -- this just lists what's
    // registered right now, for the "saved" line below.
    function refreshSavedList() {
      var here = window.Formations.list().filter(function (f) { return !f.builtIn; });
      document.getElementById('cfbSavedList').textContent = here.length
        ? 'Saved: ' + here.map(function (f) { return f.name; }).join(', ')
        : '';
    }

    function syncSelection() {
      var sel = builder.selected;
      if (!sel) { anchorBox.style.display = 'none'; return; }
      anchorBox.style.display = 'block';
      selName.textContent = builder.isLine(sel) ? sel : 'Player ' + sel;
      anchorChk.checked = builder.isAnchored(sel);
    }

    builder = new window.FormationBuilder({
      svg: svg,
      viewBox: window.DATA.viewBox || [1600, 1030],
      topPad: typeof window.DATA.topPad === 'number' ? window.DATA.topPad : 400,
      onChange: function () { statusEl.textContent = ''; },
      onSelect: function () { syncSelection(); },
    });

    refreshSeedOptions(seedId);
    refreshSavedList();
    builder.seedFrom(seedId);

    // Same toggle-group component every other formation/side control in the
    // real app already uses (js/play-calls.js) -- not dev-preview's own
    // bespoke .seg markup, which has no styling here.
    var sideGroup = window.buildToggleGroup('orange', [
      { value: 'Left', label: 'Left' },
      { value: 'Right', label: 'Right' },
    ], 'Right', function (val) { builder.setSide(val); });
    document.getElementById('cfbSideSeg').appendChild(sideGroup);
    requestAnimationFrame(function () { window.placeToggleThumb(sideGroup); });

    anchorChk.addEventListener('change', function () {
      if (builder.selected) builder.toggleAnchor(builder.selected);
    });

    seedSel.addEventListener('change', function () {
      seedId = seedSel.value;
      builder.seedFrom(seedId);
      var f = window.Formations.get(seedId);
      nameInput.value = f && !f.builtIn ? f.name : '';
      statusEl.textContent = '';
    });

    document.getElementById('cfbMirrorBtn').addEventListener('click', function () {
      var other = builder.mirrorToOtherSide();
      statusEl.textContent = 'Mirrored ' + builder.side + ' → ' + other + '.';
    });

    document.getElementById('cfbResetBtn').addEventListener('click', function () {
      builder.seedFrom(seedId);
      statusEl.textContent = 'Reset to ' + (window.Formations.get(seedId) || {}).name + '.';
    });

    document.getElementById('cfbSaveBtn').addEventListener('click', function () {
      var name = (nameInput.value || '').trim();
      if (!name) { statusEl.textContent = 'Give the formation a name first.'; return; }
      var id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (window.Formations.get(id) && window.Formations.get(id).builtIn) {
        statusEl.textContent = 'That name collides with a built-in formation — pick another.';
        return;
      }
      var session = window.PlayerIdentity && window.PlayerIdentity.getSession && window.PlayerIdentity.getSession();
      var formationJSON = builder.toFormation({
        id: id, name: name,
        createdBy: session && session.name ? session.name : null,
        createdAt: new Date().toISOString(),
      });
      statusEl.textContent = 'Saving…';
      window.AssignmentStore.saveFormation(id, formationJSON).then(function (res) {
        window.Formations.registerCustom(Object.assign({}, formationJSON, { id: id }));
        refreshSeedOptions(id);
        refreshSavedList();
        seedId = id;
        statusEl.textContent = (res.backend === 'cloud'
          ? 'Saved to the team playbook'
          : 'Saved on this device only (no login here)')
          + ' — “' + name + '”. Head to Create a Play to use it.';
      }).catch(function (e) {
        statusEl.textContent = 'Save failed: ' + e.message;
      });
    });
  }

  window.initCoachFormationBuilder = function () {
    if (built) return;
    built = true;
    build();
  };
})();

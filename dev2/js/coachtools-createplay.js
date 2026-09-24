// Create a Play, for real -- Coach Tools' own panel. Nathan: "I need to
// switch it and then be able to go in and start editing plays... creating
// the plays. That needs to be complete and baked in ready to go."
//
// Three steps -- formation, which plays, then the unified route/block +
// ball-path Build screen -- ported from dev-preview.html's
// #stepChooseFormation/#step2/#stepBuild. Built from the real app's own
// components throughout (buildToggleGroup, .coachToolsSubPanel,
// .diagramCard, .formation-play-grid/.play-tile from Browse Plays) instead
// of dev-preview's own page-local .seg/.panel/.playgrid, which have no
// styling here.
//
// The 3 steps are built ONCE as permanent sibling divs, shown/hidden by
// toggling display -- never rebuilt via innerHTML. Step 3's editors hold a
// live reference to their own svg node; wiping the container would orphan
// them (see js/assignment-editor.js's AssignmentEditor, js/ball-path-
// editor.js's BallPathEditor). coachtools-nav.js calls init() on every tab
// activation, not just the first -- `built` skips reconstruction entirely
// on repeat activation, same reasoning as coachtools-formationbuilder.js.

(function () {
  'use strict';

  var built = false;
  var currentFormationId = null;
  // Nathan: "I shouldn't be choosing Left or Right on the initial call --
  // it always defaults to Right." Right is the authored/canonical side;
  // Left is something you mirror to later once you're editing an actual
  // play (see the Mirror button in step 3), not a blind upfront choice.
  var chosenSide = 'Right';

  var stepDivs = {};
  var splitNotice = null;
  var activeStep = 1;

  function playsFor() { return (window.DATA && window.DATA.playTypes) || []; }

  function goStep(n) {
    activeStep = n;
    // AssignmentEditor/BallPathEditor (see initBuildStep) are built entirely
    // around Wing-style side/direction -- Split has no such thing, it's
    // splitSide/leftCall/rightCall/passOn instead (see renderSplitDiagram).
    // Showing step 3's real shell for Split would authoring-edit a play
    // through the wrong coordinate system, so it's swapped for a plain
    // notice instead -- never built via stepDivs[3].innerHTML, which would
    // orphan assignEditor's live <svg> the moment a coach picks a Wing
    // formation again (same "permanent sibling divs" reasoning as the 3
    // steps themselves).
    var showSplitNotice = (n === 3 && currentFormationId === 'split');
    [1, 2, 3].forEach(function (i) {
      stepDivs[i].style.display = (i === n && !showSplitNotice) ? '' : 'none';
    });
    splitNotice.style.display = showSplitNotice ? '' : 'none';
    [].forEach.call(document.querySelectorAll('#coachCreatePlaySubNav .coachToolsModuleTab'), function (b) {
      b.classList.toggle('active', Number(b.getAttribute('data-step')) === n);
    });
    if (n === 2) renderPlayGrid();
    if (n === 3 && !showSplitNotice) initBuildStep();
  }

  // ---- Step 1: which formation -----------------------------------------
  function buildStep1() {
    var div = document.createElement('div');
    div.innerHTML =
      '<div class="hint" style="margin-bottom:12px">Built-in formations and anything saved in Formation Builder.</div>' +
      '<div class="coachToolsSubPanel" style="max-width:360px">' +
      '  <label style="display:block;font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px">Formation</label>' +
      '  <select id="ccpFormationSel" style="width:100%;padding:9px;margin-bottom:12px"></select>' +
      '  <button class="navBtn" id="ccpNextBtn" style="display:block;width:100%">Next: choose a play →</button>' +
      '</div>';
    document.getElementById('coachCreatePlayBody').appendChild(div);

    document.getElementById('ccpNextBtn').addEventListener('click', function () {
      currentFormationId = document.getElementById('ccpFormationSel').value;
      chosenSide = 'Right';
      // assignEditor/sideGroup only exist once step 3 has been built at
      // least once (see initBuildStep's `if (!assignEditor)` guard) -- if
      // a coach already built one play and came back to start a different
      // one, its side has to be reset here too, or the new formation would
      // silently open still on whatever side the LAST play was left on.
      if (assignEditor) {
        assignEditor.side = chosenSide;
        setToggleGroupValue(sideGroup, chosenSide);
      }
      goStep(2);
    });

    return div;
  }

  function populateFormationPicker() {
    var sel = document.getElementById('ccpFormationSel');
    var keep = sel.value;
    sel.innerHTML = '';
    window.Formations.list().forEach(function (f) {
      var o = document.createElement('option');
      o.value = f.id; o.textContent = f.name + (f.builtIn ? '' : '  (yours)');
      sel.appendChild(o);
    });
    if (keep && window.Formations.get(keep)) sel.value = keep;
    else if (currentFormationId && window.Formations.get(currentFormationId)) sel.value = currentFormationId;
  }

  // ---- Step 2: which plays this formation can call -----------------------
  // Source of truth is AssignmentStore directly -- real Firebase (or its
  // local fallback), no dev-preview-style parallel localStorage cache.
  var formationPlaysAll = {};

  function miniDiagram(playKey, formationId) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var pt = playsFor().find(function (p) { return p.key === playKey; });
    try {
      // Same fix as play-calls.js's own buildPlayTile: Split isn't a
      // renderCardDiagram formation, it needs renderSplitDiagram's own
      // splitSide/leftCall/rightCall shape instead.
      if (formationId === 'split') {
        window.renderSplitDiagram(svg, playKey, 'Left',
          (pt && pt.hasInsideOutside) ? 'Outside' : null, 'A', 'seattle', 'seattle', false, null, 'pocket');
      } else {
        window.renderCardDiagram(svg, playKey, 'Right', 'Right', null, '4x4',
          (pt && pt.hasInsideOutside) ? 'Outside' : null, false, false, 'A', false, false,
          formationId);
      }
      svg.setAttribute('viewBox', '0 250 1600 760');
    } catch (e) {
      svg.setAttribute('viewBox', '0 0 200 40');
    }
    return svg;
  }

  function renderPlayGrid() {
    var div = stepDivs[2];
    div.innerHTML =
      '<button class="navBtn secondary" id="ccpBackBtn" style="width:auto;display:inline-block;margin-bottom:12px">← Back to formation</button>' +
      '<div class="hint" id="ccpPickCount" style="margin-bottom:10px"></div>' +
      '<div class="formation-play-grid" id="ccpPlayGrid"></div>';
    document.getElementById('ccpBackBtn').addEventListener('click', function () { goStep(1); });

    var grid = document.getElementById('ccpPlayGrid');
    var chosen = formationPlaysAll[currentFormationId] || [];
    playsFor().forEach(function (pt) {
      var tile = document.createElement('div');
      tile.className = 'play-tile' + (chosen.indexOf(pt.key) !== -1 ? ' selected' : '');
      tile.appendChild(miniDiagram(pt.key, currentFormationId));
      var cap = document.createElement('div'); cap.className = 'play-tile-cap';
      var nm = document.createElement('span'); nm.className = 'play-tile-nm'; nm.textContent = pt.label || pt.key;
      var pill = document.createElement('span');
      pill.className = 'play-tile-pill ' + (pt.isPass ? 'pass' : 'run');
      pill.textContent = pt.isPass ? 'PASS' : 'RUN';
      cap.appendChild(nm); cap.appendChild(pill); tile.appendChild(cap);
      tile.addEventListener('click', function () {
        var list = formationPlaysAll[currentFormationId] || [];
        var i = list.indexOf(pt.key);
        if (i === -1) list.push(pt.key); else list.splice(i, 1);
        formationPlaysAll[currentFormationId] = list;
        window.AssignmentStore.saveFormationPlays(currentFormationId, list);
        tile.classList.toggle('selected');
        updatePickCount();
      });
      grid.appendChild(tile);
    });
    updatePickCount();
  }

  function updatePickCount() {
    var list = formationPlaysAll[currentFormationId] || [];
    var el = document.getElementById('ccpPickCount');
    if (el) el.textContent = list.length + ' of ' + playsFor().length + ' plays selected';
  }

  // ---- Step 3: the unified Build screen ---------------------------------
  // Near-verbatim port of dev-preview.html's initBuildStep/renderDiagram/
  // playBoth/seekBoth/loadBuildFor/renderBallSeq/refreshCoupling/
  // refreshMovedList/refreshPlaySel -- same window.DATA/window.Formations/
  // window.AssignmentStore/window.renderCardDiagram/window.playCardAnimation/
  // window.seekCardAnimation/window.BallPath calls throughout, only the
  // DOM ids and the Side/Overload controls (now buildToggleGroup, not
  // dev-preview's own .seg) changed.
  var assignEditor = null, ballEditor = null;
  var isPlayingRef = { value: false };
  var assignAll = {};
  var ballAll = {};
  var staleLegs = {};
  var STALE_DISTANCE = 60;
  var sideGroup = null, ovGroup = null;

  function refreshAssignAll() {
    return window.AssignmentStore.loadAll().then(function (all) { assignAll = all || {}; return assignAll; });
  }
  function refreshBallAll() {
    return window.AssignmentStore.loadBallPaths().then(function (all) { ballAll = all || {}; return ballAll; });
  }
  function currentOverrides() {
    var forPlay = assignAll[assignEditor.playKey];
    return (forPlay && forPlay[assignEditor.alignKey()]) || {};
  }

  function refreshMovedList() {
    var moved = assignEditor.movedSlots();
    var host = document.getElementById('ccpMovedList');
    document.getElementById('ccpMovedNote').textContent = moved.length
      ? 'This lineup moves ' + moved.length + ' player' + (moved.length === 1 ? '' : 's')
        + '. Their assignments were shifted automatically -- drag to correct anything that doesn’t look right.'
      : 'Nobody moves in this lineup, so every assignment is still the one the play was drawn with.';
    var editable = assignEditor.editableSlots();
    host.innerHTML = moved.length
      ? moved.map(function (k) {
        var state, colour;
        if (editable.indexOf(k) === -1) { state = 'no fixed target to drag'; colour = 'var(--muted)'; }
        else if (assignEditor.hasOverride(k)) { state = 'edited'; colour = 'var(--accent)'; }
        else { state = 'auto-shifted'; colour = 'var(--muted)'; }
        return '<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;margin:4px 0">'
          + '<span style="width:26px;height:26px;border-radius:50%;border:2px solid var(--ink);'
          + 'display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">' + k + '</span>'
          + '<span style="color:' + colour + '">' + state + '</span></div>';
      }).join('')
      : '';
  }

  function refreshPlaySel() {
    var picks = formationPlaysAll[currentFormationId] || [];
    var list = picks.length ? picks : playsFor().map(function (p) { return p.key; });
    var sel = document.getElementById('ccpPlaySel');
    sel.innerHTML = '';
    list.forEach(function (k) {
      var pt = playsFor().find(function (p) { return p.key === k; });
      if (!pt) return;
      var o = document.createElement('option');
      o.value = k; o.textContent = pt.label || k;
      sel.appendChild(o);
    });
    return sel.value;
  }

  function renderBallSeq() {
    var bp = ballEditor.get();
    var host = document.getElementById('ccpBallSeq');
    if (!bp.length) {
      host.innerHTML = '<div class="hint">Nothing yet — tap a player on the field.</div>';
      document.getElementById('ccpBallPlain').textContent = '';
      return;
    }
    var WORDS = Object.keys(window.BallPath.EXCHANGES).filter(function (k) { return k !== 'snap'; });
    host.innerHTML = bp.map(function (leg, i) {
      var badge = '<span style="width:24px;height:24px;border-radius:50%;background:var(--ink);color:var(--paper);'
        + 'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0">' + (i + 1) + '</span>';
      var who = '<b style="min-width:30px">#' + leg.player + '</b>';
      var how = i === 0
        ? '<span style="font-size:12px;color:var(--muted)">snap</span>'
        : '<select data-leg="' + i + '" style="width:auto;padding:3px 6px;font-size:12px">'
          + WORDS.map(function (w) {
            return '<option value="' + w + '"' + ((leg.how || 'handoff') === w ? ' selected' : '') + '>'
              + window.BallPath.EXCHANGES[w].label + '</option>';
          }).join('')
          + '</select>';
      var rm = '<button data-rm="' + i + '" style="margin-left:auto;border:0;background:none;color:var(--muted);'
        + 'cursor:pointer;font-size:15px;font-weight:800;padding:0 4px">×</button>';
      var row = '<div style="display:flex;align-items:center;gap:8px;margin:5px 0">' + badge + who + how + rm + '</div>';
      if (staleLegs[i]) {
        row += '<div class="stale-chip">may be off the route now'
          + '<button class="navBtn" data-snap="' + i + '" style="width:auto;display:inline-block;margin:0 0 0 6px;padding:2px 9px;font-size:11px">Snap to route</button></div>';
      }
      return row;
    }).join('');
    document.getElementById('ccpBallPlain').textContent = window.BallPath.describe(bp);

    [].forEach.call(host.querySelectorAll('select[data-leg]'), function (sel) {
      sel.addEventListener('change', function () {
        ballEditor.setHow(Number(this.getAttribute('data-leg')), this.value);
      });
    });
    [].forEach.call(host.querySelectorAll('button[data-rm]'), function (b) {
      b.addEventListener('click', function () { ballEditor.removeAt(Number(this.getAttribute('data-rm'))); });
    });
    [].forEach.call(host.querySelectorAll('button[data-snap]'), function (b) {
      b.addEventListener('click', function () {
        var i = Number(this.getAttribute('data-snap'));
        var leg = ballEditor.get()[i];
        var resolved = document.getElementById('ccpBuildField')._resolvedPaths || [];
        var entry = leg && resolved.find(function (p) { return String(p.player) === String(leg.player) && p.points; });
        if (entry) ballEditor.resnapToPath(i, entry.points);
      });
    });
  }

  function refreshCoupling() {
    staleLegs = {};
    if (!ballEditor) return;
    var bp = ballEditor.get();
    var resolved = document.getElementById('ccpBuildField')._resolvedPaths || [];
    for (var i = 1; i < bp.length; i++) {
      var leg = bp[i];
      if (!leg.at) continue;
      var entry = resolved.find(function (p) { return String(p.player) === String(leg.player) && p.points; });
      if (!entry) continue;
      var hit = window.BallPath.nearestPointOnPath(entry.points, leg.at);
      if (hit && hit.distance > STALE_DISTANCE) staleLegs[i] = true;
    }
  }

  function renderDiagram() {
    if (!assignEditor || !assignEditor.playKey) return;
    var playType = window.DATA.playTypes.find(function (p) { return p.key === assignEditor.playKey; });
    if (!playType) return;
    var alignKey = assignEditor.alignKey();
    var hadAssignments = playType.assignments;
    var hadBallPath = playType.ballPath;
    playType.assignments = Object.assign({}, hadAssignments || {});
    playType.assignments[alignKey] = assignEditor.overrides;
    playType.ballPath = ballEditor ? ballEditor.ballPath : hadBallPath;
    try {
      window.renderCardDiagram(
        document.getElementById('ccpBuildField'), assignEditor.playKey, assignEditor.side, assignEditor.side,
        null, '4x4', playType.hasInsideOutside ? 'Outside' : null,
        false, false, 'A', false, false,
        assignEditor.formationId, assignEditor.overload);
    } finally {
      if (hadAssignments) playType.assignments = hadAssignments; else delete playType.assignments;
      if (hadBallPath !== undefined) playType.ballPath = hadBallPath; else delete playType.ballPath;
    }
    document.getElementById('ccpBuildField').setAttribute('viewBox', '0 250 1600 760');
    if (assignEditor) assignEditor._drawHandles();
    if (ballEditor) ballEditor._makeBadgesDraggable();
    refreshCoupling();
  }

  function playBoth(onDone) {
    if (isPlayingRef.value || !assignEditor || !assignEditor.playKey) return;
    var playType = window.DATA.playTypes.find(function (p) { return p.key === assignEditor.playKey; });
    if (!playType) return;
    var alignKey = assignEditor.alignKey();
    var hadAssignments = playType.assignments;
    var hadBallPath = playType.ballPath;
    playType.assignments = Object.assign({}, hadAssignments || {});
    playType.assignments[alignKey] = assignEditor.overrides;
    playType.ballPath = ballEditor ? ballEditor.ballPath : hadBallPath;

    function finish() {
      if (hadAssignments) playType.assignments = hadAssignments; else delete playType.assignments;
      if (hadBallPath !== undefined) playType.ballPath = hadBallPath; else delete playType.ballPath;
      isPlayingRef.value = false;
      assignEditor.render();
      if (onDone) onDone();
    }
    try {
      var result = window.playCardAnimation(
        document.getElementById('ccpBuildField'), assignEditor.playKey, assignEditor.side, assignEditor.side,
        1, isPlayingRef, null, '4x4', playType.hasInsideOutside ? 'Outside' : null,
        false, false, 'A', false, false,
        assignEditor.formationId, assignEditor.overload);
      if (result && typeof result.then === 'function') result.then(finish, finish);
      else finish();
    } catch (e) {
      isPlayingRef.value = false;
      finish();
    }
  }

  function seekBoth(frac) {
    if (!window.seekCardAnimation) return;
    window.seekCardAnimation(document.getElementById('ccpBuildField'), frac * 1400, 1);
  }

  function loadBuildFor(playKey) {
    assignEditor.playKey = playKey;
    ballEditor.setAlign(window.Formations.positions(assignEditor.formationId, assignEditor.side));
    ballEditor.set(ballAll[playKey] || []);
    renderBallSeq();
    document.getElementById('ccpBallStatus').textContent =
      window.AssignmentStore.backend() === 'cloud' ? '' : 'Saves to this device only (no login).';
    assignEditor.setOverrides(currentOverrides());
    document.getElementById('ccpAssignStatus').textContent =
      window.AssignmentStore.backend() === 'cloud' ? '' : 'Saves to this device only (no login).';
    refreshMovedList();
  }

  function buildStep3Shell() {
    var div = stepDivs[3];
    div.innerHTML =
      '<div class="diagramCard">' +
      '  <svg id="ccpBuildField"></svg>' +
      '  <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid var(--line)">' +
      '    <button class="navBtn" id="ccpBuildPlayBtn" style="width:auto;display:inline-block;margin:0;padding:9px 18px">▶ Play</button>' +
      '    <input type="range" id="ccpBuildScrub" min="0" max="1000" value="1000" style="flex:1">' +
      '    <span id="ccpBuildScrubLabel" style="font-size:12px;font-weight:800;color:var(--muted);min-width:32px;text-align:right">100%</span>' +
      '  </div>' +
      '</div>' +
      '<div class="coachToolsSubPanel" style="margin-top:14px">' +
      '  <label style="display:block;font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px">Play</label>' +
      '  <select id="ccpPlaySel" style="width:100%;padding:9px;margin-bottom:12px"></select>' +
      '  <label style="display:block;font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px">Side</label>' +
      '  <div id="ccpSideSeg" style="margin-bottom:10px"></div>' +
      '  <label style="display:block;font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px">Overload</label>' +
      '  <div id="ccpOvSeg" style="margin-bottom:4px"></div>' +
      '  <div class="build-panel build-panel-lineup">' +
      '    <div class="build-panel-label">Routes &amp; blocks — this lineup only</div>' +
      '    <div class="hint" id="ccpMovedNote" style="margin:2px 0 8px"></div>' +
      '    <div id="ccpMovedList"></div>' +
      '    <button class="navBtn" id="ccpSaveAssignBtn" style="display:block;width:100%;margin-top:8px">Save routes &amp; blocks</button>' +
      '    <button class="navBtn secondary" id="ccpMirrorAssignBtn" style="display:block;width:100%;margin-top:8px">Mirror to …</button>' +
      '    <button class="navBtn secondary" id="ccpResetAssignBtn" style="display:block;width:100%;margin-top:8px">Reset to auto</button>' +
      '    <div class="hint" id="ccpAssignStatus" style="min-height:1.4em;margin-top:8px"></div>' +
      '  </div>' +
      '  <div class="build-panel build-panel-play">' +
      '    <div class="build-panel-label">Ball path — this play, every formation and side</div>' +
      '    <label style="display:block;font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin:8px 0 6px">Sequence</label>' +
      '    <div id="ccpBallSeq"></div>' +
      '    <div class="hint" id="ccpBallPlain" style="margin-top:6px"></div>' +
      '    <button class="navBtn" id="ccpSaveBallBtn" style="display:block;width:100%;margin-top:8px">Save ball path</button>' +
      '    <button class="navBtn secondary" id="ccpClearBallBtn" style="display:block;width:100%;margin-top:8px">Clear</button>' +
      '    <div class="hint" id="ccpBallStatus" style="min-height:1.4em;margin-top:8px"></div>' +
      '  </div>' +
      '  <div class="hint" style="margin-top:14px">' +
      '    Tapping just <b>one</b> player says he carries it the whole play. Drag any point on a route or block ' +
      '    to correct it — only players this lineup <i>moved</i> get a handle. A flagged ball-path leg means a ' +
      '    route or formation change moved that receiver away from where the exchange was set.' +
      '  </div>' +
      '</div>';
  }

  function refreshMirrorBtnLabel() {
    var other = assignEditor.side === 'Left' ? 'Right' : 'Left';
    document.getElementById('ccpMirrorAssignBtn').textContent = 'Mirror to ' + other;
  }

  function setToggleGroupValue(group, value) {
    [].forEach.call(group.querySelectorAll('.toggle-btn'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.value === value ? 'true' : 'false');
    });
    window.placeToggleThumb(group);
  }

  function initBuildStep() {
    if (!assignEditor) {
      buildStep3Shell();

      assignEditor = new window.AssignmentEditor({
        svg: document.getElementById('ccpBuildField'),
        formationId: currentFormationId,
        side: chosenSide,
        renderPlay: renderDiagram,
        onChange: function () {
          document.getElementById('ccpAssignStatus').textContent = 'Unsaved changes.';
          refreshMovedList();
          resetScrubUI();
        },
      });
      ballEditor = new window.BallPathEditor({
        svg: document.getElementById('ccpBuildField'),
        renderPlay: renderDiagram,
        onChange: function () {
          renderBallSeq();
          document.getElementById('ccpBallStatus').textContent = 'Unsaved changes.';
          resetScrubUI();
        },
      });

      var scrubEl = document.getElementById('ccpBuildScrub');
      var scrubLabelEl = document.getElementById('ccpBuildScrubLabel');
      var playBtnEl = document.getElementById('ccpBuildPlayBtn');

      function resetScrubUI() {
        scrubEl.value = 1000;
        scrubLabelEl.textContent = '100%';
      }

      scrubEl.addEventListener('input', function () {
        var frac = Number(this.value) / 1000;
        scrubLabelEl.textContent = Math.round(frac * 100) + '%';
        seekBoth(frac);
      });

      playBtnEl.addEventListener('click', function () {
        if (isPlayingRef.value) return;
        playBtnEl.disabled = true;
        scrubEl.disabled = true;
        playBoth(function () {
          playBtnEl.disabled = false;
          scrubEl.disabled = false;
          resetScrubUI();
        });
      });

      document.getElementById('ccpPlaySel').addEventListener('change', function () {
        loadBuildFor(this.value);
      });

      sideGroup = window.buildToggleGroup('orange', [
        { value: 'Left', label: 'Left' },
        { value: 'Right', label: 'Right' },
      ], chosenSide, function (val) {
        assignEditor.side = val;
        refreshMirrorBtnLabel();
        loadBuildFor(assignEditor.playKey);
      });
      document.getElementById('ccpSideSeg').appendChild(sideGroup);

      ovGroup = window.buildToggleGroup('black', [
        { value: 'off', label: 'Off' },
        { value: 'on', label: 'On' },
      ], 'off', function (val) {
        assignEditor.overload = val === 'on';
        loadBuildFor(assignEditor.playKey);
      });
      document.getElementById('ccpOvSeg').appendChild(ovGroup);
      requestAnimationFrame(function () {
        window.placeToggleThumb(sideGroup);
        window.placeToggleThumb(ovGroup);
      });

      document.getElementById('ccpSaveAssignBtn').addEventListener('click', function () {
        var st = document.getElementById('ccpAssignStatus');
        st.textContent = 'Saving…';
        window.AssignmentStore.save(assignEditor.playKey, assignEditor.alignKey(), assignEditor.toJSON())
          .then(function (res) {
            st.textContent = res.backend === 'cloud'
              ? 'Saved to the team playbook — ' + assignEditor.alignKey() + '.'
              : 'Saved on this device only (no login here) — ' + assignEditor.alignKey() + '.';
            return refreshAssignAll();
          })
          .then(refreshMovedList)
          .catch(function (e) { st.textContent = 'Save failed: ' + e.message; });
      });
      document.getElementById('ccpResetAssignBtn').addEventListener('click', function () {
        assignEditor.clearAll();
        window.AssignmentStore.save(assignEditor.playKey, assignEditor.alignKey(), {})
          .then(refreshAssignAll)
          .then(function () {
            document.getElementById('ccpAssignStatus').textContent = 'Back to the automatic shift.';
            refreshMovedList();
          });
      });
      document.getElementById('ccpMirrorAssignBtn').addEventListener('click', function () {
        var st = document.getElementById('ccpAssignStatus');
        var result = assignEditor.mirrorToOtherSide();
        var targetSide = result.side;
        var targetKey = window.Formations.alignmentKey(
          assignEditor.formationId, targetSide, { overload: assignEditor.overload });
        st.textContent = 'Mirroring to ' + targetSide + '…';
        window.AssignmentStore.save(assignEditor.playKey, targetKey, result.overrides)
          .then(function (res) { return refreshAssignAll().then(function () { return res; }); })
          .then(function (res) {
            assignEditor.side = targetSide;
            setToggleGroupValue(sideGroup, targetSide);
            refreshMirrorBtnLabel();
            loadBuildFor(assignEditor.playKey);
            st.textContent = (res.backend === 'cloud'
              ? 'Saved to the team playbook'
              : 'Saved on this device only (no login here)')
              + ' — mirrored to ' + targetKey + '. Check it with Play, then adjust'
              + ' anything that needs it -- the two sides are independent from here.';
          })
          .catch(function (e) { st.textContent = 'Mirror failed: ' + e.message; });
      });
      document.getElementById('ccpSaveBallBtn').addEventListener('click', function () {
        var st = document.getElementById('ccpBallStatus');
        st.textContent = 'Saving…';
        window.AssignmentStore.saveBallPath(assignEditor.playKey, ballEditor.get())
          .then(function (res) {
            st.textContent = res.backend === 'cloud'
              ? 'Saved to the team playbook.'
              : 'Saved on this device only (no login here).';
            return refreshBallAll();
          })
          .catch(function (e) { st.textContent = 'Save failed: ' + e.message; });
      });
      document.getElementById('ccpClearBallBtn').addEventListener('click', function () {
        ballEditor.clear();
        window.AssignmentStore.saveBallPath(assignEditor.playKey, []).then(refreshBallAll);
        document.getElementById('ccpBallStatus').textContent = 'Cleared.';
      });
    }

    setToggleGroupValue(sideGroup, assignEditor.side);
    refreshMirrorBtnLabel();
    assignEditor.formationId = currentFormationId;
    var first = refreshPlaySel();
    Promise.all([refreshAssignAll(), refreshBallAll()]).then(function () { loadBuildFor(first); });
  }

  // ---- Shell + sub-nav ---------------------------------------------------
  function build() {
    stepDivs[1] = document.createElement('div');
    stepDivs[2] = document.createElement('div');
    stepDivs[3] = document.createElement('div');
    var body = document.getElementById('coachCreatePlayBody');
    body.appendChild(stepDivs[1]);
    body.appendChild(stepDivs[2]);
    body.appendChild(stepDivs[3]);

    splitNotice = document.createElement('div');
    splitNotice.className = 'hint';
    splitNotice.style.cssText = 'display:none;max-width:520px;margin:32px auto;text-align:center';
    splitNotice.textContent = "Split doesn't work in the Build step yet -- its routes are authored " +
      "against splitSide/left-right route calls instead of Wing-style side/direction, which this " +
      "editor doesn't speak yet. Formation Builder and picking which plays it can call (steps 1-2) " +
      "both already work for Split; pick a Wing-based formation to build a play here for now.";
    body.appendChild(splitNotice);

    var subNav = document.getElementById('coachCreatePlaySubNav');
    [
      { step: 1, label: '1. Formation' },
      { step: 2, label: '2. Plays' },
      { step: 3, label: '3. Build the play' },
    ].forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'coachToolsModuleTab';
      b.setAttribute('data-step', t.step);
      b.textContent = t.label;
      b.addEventListener('click', function () { goStep(t.step); });
      subNav.appendChild(b);
    });

    buildStep1();
    goStep(1);
  }

  window.initCoachCreatePlay = function () {
    if (built) { populateFormationPicker(); return; }
    built = true;
    window.AssignmentStore.loadFormationPlays().then(function (all) {
      formationPlaysAll = all || {};
      build();
      populateFormationPicker();
    });
  };
})();

// Play Builder -- Coach Tools' unified formation + play authoring panel.
// Nathan: "we can't have two places - work to combine the i form and all
// formation creation, formation edits, play creation and play edits all
// in one. This needs to be correct." Replaces the old, separate Formation
// Builder and Create a Play tabs (js/coachtools-formationbuilder.js,
// js/coachtools-createplay.js -- both left in place, just unlinked from
// coachtools-nav.js, for instant rollback) and, by retiring the Play
// tab's own Edit entry point, js/edit-plays.js too.
//
// This file's ONLY job is to build the real app's own markup (not
// playbuilder.html's bespoke styling) around the exact element ids
// js/playbuilder/editor.js and js/playbuilder/formation-editor.js already
// expect, then hand off to their own exported init functions --
// initPlayBuilderEditor()/initPlayBuilderFormationEditor(). Their
// interaction logic is completely unchanged (see the plan file for the
// full Phase 0-5 verification history); this is purely a new shell.
//
// coachtools-nav.js calls init() on every tab activation, not just the
// first -- `built` guards against reconstructing the DOM (which would
// orphan the live SVG references editor.js/formation-editor.js hold) and
// re-running their own init a second time.

(function () {
  'use strict';

  var built = false;
  // True from the moment the FIRST-ever activation starts building the DOM
  // until editor.js's own init() (awaited via the promise
  // initPlayBuilderEditor() now returns) has actually finished loading and
  // consumed the Play tab's own pencil/Copy handoff globals. Real bug,
  // found in review: init() suspends at its own first real network await
  // (PlayBuilderStore.isEmpty()), and `built` was set true SYNCHRONOUSLY
  // before that -- so a coach double-tapping the pencil fast enough (real
  // on a slow connection) could have their SECOND tap's own
  // initCoachPlayBuilder() call see `built===true` and reach for
  // consumePendingHandoff() instead, which reads-and-clears the SAME
  // window.__pbPendingLoadPlayId global the still-in-flight FIRST init()
  // hadn't gotten to yet -- a real race between two independent consumers
  // of one global, decided by whichever finishes last, not by which click
  // was more recent.
  var initializing = false;

  // A small, styled toggle-group container matching the app's own
  // buildToggleGroup/placeToggleThumb component (js/play-calls.js) --
  // js/playbuilder/editor.js's/formation-editor.js's own existing click
  // handling attaches to whatever buttons end up inside a container with
  // the right id (see their own bindSidebar()/bind()), so this only needs
  // to construct the right markup; onChange stays a no-op except where
  // noted, since their own listener (attached afterward, once
  // initPlayBuilderEditor()/initPlayBuilderFormationEditor() run) is what
  // actually drives state.
  function toggle(id, color, options, initialValue, onChange) {
    var group = window.buildToggleGroup(color, options, initialValue, onChange || function () {});
    group.id = id;
    return group;
  }

  function buildPlaysView() {
    var view = document.createElement('div');
    view.id = 'pbPlaysView';
    view.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap';
    var LBL = 'display:block;font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin:10px 0 6px';
    var BTN = 'display:block;width:100%;margin-top:8px';

    // Nathan, mobile: "should also display Formation First, then the
    // play." Formation used to live mid-sidebar, well below the field --
    // fine on desktop's side-by-side layout, but on a narrow phone the
    // whole sidebar stacks under the diagram, so "which formation am I
    // even looking at" ended up buried under it. `flex:1 1 100%` forces
    // this onto its own full-width row above fieldCard/side regardless of
    // viewport, not just as an accident of mobile wrapping.
    var formationBar = document.createElement('div');
    formationBar.className = 'coachToolsSubPanel';
    formationBar.style.cssText = 'flex:1 1 100%';
    formationBar.innerHTML =
      '<label style="' + LBL + 'margin-top:0">Formation</label>' +
      // Switches which formation's plays this screen is showing -- see
      // editor.js's own comment on its 'change' listener for why this is
      // safe (navigates, never reassigns the CURRENT play's own data).
      '<select id="pbFormationSelect" style="width:100%;padding:9px"></select>';
    view.appendChild(formationBar);

    var fieldCard = document.createElement('div');
    fieldCard.className = 'diagramCard';
    fieldCard.style.cssText = 'flex:7 1 0;min-width:380px';
    // Nathan: "include the name of the play at the top of the editing
    // screen so I know what play I am editing" -- synced by editor.js's
    // own renderSidebar() (same "always re-sync on render" pattern as
    // every other field-editing-context indicator on this screen), not
    // just set once, so it stays correct through the Play dropdown,
    // "+ New Play," and the real Play tab's own handoff into a draft.
    var fieldTitle = document.createElement('div');
    fieldTitle.id = 'pbFieldTitle';
    fieldTitle.style.cssText = 'padding:10px 14px;border-bottom:1px solid var(--line);font-weight:800;font-size:14px';
    fieldCard.appendChild(fieldTitle);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'pbField';
    // Nathan, mobile: "the play is at the top, with tons of room below
    // it." The shared field coordinate system's viewBox is always 1430
    // units tall (see editor.js's own render()), but every real play's
    // actual content (defense through backfield) sits within roughly
    // 210-860 of that -- confirmed by scanning every shipped play's real
    // coordinates, p99 well under 860. .diagramCard svg{height:auto}
    // mirrors the FULL 1430-tall viewBox 1:1, so ~40% of the rendered
    // card was always blank canvas. `slice` + a shorter aspect-ratio
    // (css#pbField) crops that blank margin off instead of just shrinking
    // everything proportionally -- same "content decoupled from the raw
    // viewBox ratio" idea the real Play tab's own .card-outer already
    // uses (aspect-ratio there too, just a different value), not a new
    // technique for this app.
    svg.setAttribute('preserveAspectRatio', 'xMidYMin slice');
    fieldCard.appendChild(svg);
    var fieldFooter = document.createElement('div');
    fieldFooter.style.cssText = 'display:flex;align-items:center;gap:14px;padding:10px 14px;border-top:1px solid var(--line);flex-wrap:wrap';
    fieldFooter.innerHTML =
      '<span class="hint" style="margin:0">Wing (preview)</span>';
    fieldFooter.appendChild(toggle('pbWingSideToggle', 'orange', [{ value: 'left', label: 'L' }, { value: 'right', label: 'R' }], 'right'));
    fieldFooter.insertAdjacentHTML('beforeend', '<span class="hint" style="margin:0">Direction (preview)</span>');
    fieldFooter.appendChild(toggle('pbDirectionToggle', 'orange', [{ value: 'left', label: 'L' }, { value: 'right', label: 'R' }], 'right'));
    // Built and populated entirely by editor.js's own renderAlignmentPreviewToggles()
    // -- empty for a formation with no alignmentToggles (Shotgun/Split today).
    var alignmentPreviewSpan = document.createElement('span');
    alignmentPreviewSpan.id = 'pbAlignmentPreviewToggles';
    alignmentPreviewSpan.style.cssText = 'display:flex;align-items:center;gap:14px';
    fieldFooter.appendChild(alignmentPreviewSpan);
    var playBtn = document.createElement('button');
    playBtn.id = 'pbPlayBtn';
    playBtn.className = 'navBtn secondary';
    playBtn.style.cssText = 'width:auto;margin:0 0 0 auto;padding:7px 18px';
    playBtn.textContent = '▶ Play';
    fieldFooter.appendChild(playBtn);
    fieldCard.appendChild(fieldFooter);
    view.appendChild(fieldCard);

    var side = document.createElement('div');
    side.className = 'coachToolsSubPanel';
    side.style.cssText = 'flex:3 1 0;min-width:280px';
    side.innerHTML =
      '<label style="' + LBL + 'margin-top:0">Play</label>' +
      '<select id="pbPlaySelect" style="width:100%;padding:9px"></select>' +
      '<button class="navBtn secondary" id="pbNewPlayBtn" style="' + BTN + '">+ New Play</button>' +
      // Nathan, live: "I want to add a play to the 5 guys formation...
      // it says it is set to 5 guys... but still shows I formation." Two
      // real things, both addressed: the Formation label below WAS
      // genuinely stale (fixed in editor.js's own render() -- it's kept
      // in sync every render now, the same way pbFieldTitle already is)
      // -- but even with that fixed, "+ New Play" itself was never going
      // to help here: it always starts a draft under whichever formation
      // is CURRENTLY LOADED (editor.js's own pbNewPlayBtn handler), and a
      // formation with zero plays yet has nothing loaded to derive that
      // from. Verified live which path actually works for a formation
      // with no plays yet: the Formations screen's own "Copy a play from
      // another formation" list (NOT an "+ Add a play" tile -- that only
      // exists on the real, coach-facing Play tab's Modify mode, gated
      // behind the formation already being curated there) -- this hint
      // exists so a coach finds that path before hitting the same
      // confusion again.
      '<div class="hint" style="margin-top:4px">Asks which formation the new play is for. To move an EXISTING play to a different formation instead, use Formations → "Copy a play from another formation," which correctly shifts every route.</div>' +
      // Nathan: "I realized I messed up as this play is I Wing - Blast not
      // Double Blast. I need to be able to edit it on that one place." A
      // play's label was previously write-once (set only at "+ New Play"/
      // "Copy a play"'s own prompt) -- this is the rename affordance,
      // matching the Formations screen's own fbNameInput convention
      // exactly: a persistent text field, edited freely, actually applied
      // on the next Save Play (not a separate prompt/button).
      '<label style="' + LBL + '">Play Name</label>' +
      '<input type="text" id="pbLabelInput" style="width:100%;padding:9px;box-sizing:border-box">' +
      '<div class="hint" style="margin-top:4px">Edit, then hit Save Play to rename.</div>' +
      '<label style="' + LBL + '">Variant</label>' +
      '<select id="pbVariantSelect" style="width:100%;padding:9px"></select>' +
      '<button class="navBtn secondary" id="pbNewVariantBtn" style="' + BTN + '">+ New Variant</button>' +
      '<button class="navBtn" id="pbSaveBtn" style="' + BTN + '">Save Play</button>' +
      '<button class="navBtn danger" id="pbDeletePlayBtn" style="' + BTN + '">Remove Play</button>' +
      '<div class="hint" id="pbStatus" style="min-height:1.4em;margin-top:8px"></div>' +
      '<div class="build-panel">' +
      '  <div class="build-panel-label">Toggles</div>' +
      // Boot/Motion: simple per-play on/off -- both toggles already work
      // live (js/play-calls.js), these two checkboxes are the only thing
      // that was missing: a way to say a SPECIFIC play shouldn't offer
      // them. Checked (allowed) by default, matching every play that
      // predates this field. Counter/Read/Inside-Outside/Pop Variant
      // aren't simple on/off -- they reveal a REAL, separately-authored
      // variant, so those are set by picking one when you hit "+ New
      // Variant" above, not here.
      '  <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:8px">' +
      '    <input type="checkbox" id="pbAllowBootCheckbox" checked> Allow Boot' +
      '  </label>' +
      '  <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer">' +
      '    <input type="checkbox" id="pbAllowMotionCheckbox" checked> Allow Motion' +
      '  </label>' +
      '  <div class="hint" style="margin-top:8px">Counter / Read A-B / Inside-Outside / Pop Variant: pick one when you hit "+ New Variant" above.</div>' +
      '</div>' +
      '<div class="build-panel">' +
      '  <div class="build-panel-label">Signal</div>' +
      '  <select id="pbSignalSelect" style="width:100%;padding:9px;margin-bottom:8px"></select>' +
      '  <div style="display:flex;align-items:center;gap:10px">' +
      '    <img id="pbSignalPreviewImg" style="width:48px;height:59px;object-fit:cover;border-radius:5px;border:1px solid var(--line);background:#fff;display:none">' +
      '    <button class="navBtn secondary" id="pbSignalResetBtn" style="width:auto;margin:0;padding:7px 14px">Reset</button>' +
      '  </div>' +
      // Built and populated entirely by editor.js's own renderSignalSequencePreview() --
      // the full flip-side sequence, not just this play's own identity card.
      '  <div class="hint" style="margin:10px 0 4px">Full sequence (preview)</div>' +
      '  <div id="pbSignalSequence"></div>' +
      '</div>' +
      '<div class="build-panel">' +
      '  <div class="build-panel-label">Ball Path</div>' +
      '  <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer">' +
      '    <input type="checkbox" id="pbBallPathModeToggle"> Editing ball path -- tap players in order' +
      '  </label>' +
      '  <div id="pbBallPathSeq" style="font-size:12px;margin-top:8px"></div>' +
      '  <button class="navBtn secondary" id="pbBallPathClearBtn" style="width:auto;margin-top:8px;padding:7px 14px">Clear</button>' +
      '</div>' +
      '<div class="build-panel" id="pbPlayerPanel" style="display:none">' +
      '  <div class="build-panel-label">Selected Player</div>' +
      '  <h3 id="pbPlayerLabel" style="margin:0 0 8px">#4</h3>' +
      '  <div class="hint" id="pbPreviewLockNote" style="background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px;margin-bottom:10px"></div>' +
      '  <div id="pbWingRouteToggleWrap" style="margin-bottom:10px">' +
      '    <label style="' + LBL + '">Editing which shape?</label>' +
      '  </div>' +
      '  <div style="margin-bottom:10px">' +
      '    <label style="' + LBL + '" id="pbAlignmentEditLabel">Editing which alignment?</label>' +
      // Built and populated entirely by editor.js's own buildAlignmentToggleGroup()
      // -- hidden for a player whose position has no alignment toggle.
      '    <span id="pbAlignmentEditToggle" class="toggleGroup" style="display:none"></span>' +
      '  </div>' +
      '  <div style="margin-bottom:10px">' +
      // Regular (non-wing) positions only -- editor.js hides this for a
      // wing player (their own Same/Cross-side toggle above covers it).
      // Plain status text, not a control -- the field-wide Wing/Direction
      // toggles above the field ARE the editing-target selector now; this
      // just confirms what that currently means for this player.
      '    <div id="pbDirectionEditToggle" class="hint" style="background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px"></div>' +
      '  </div>' +
      '  <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:8px">' +
      '    <input type="checkbox" id="pbHasBallCheckbox"> Has the ball' +
      '  </label>' +
      '  <label style="' + LBL + '">Start delay (ms)</label>' +
      '  <input type="number" id="pbDelayInput" value="0" step="50" style="width:100%;padding:9px">' +
      '  <label style="' + LBL + '">Ends with</label>' +
      '  <select id="pbEndTypeSelect" style="width:100%;padding:9px">' +
      '    <option value="run">Run (arrow)</option><option value="block">Block (bar)</option>' +
      '  </select>' +
      '  <div class="hint" style="margin-top:12px">' +
      '    Click the field to add a point to this player’s route. Click a point to select it, drag to move it. Click a selected point’s ✕ badge to remove it (min. 2 points).' +
      '  </div>' +
      '</div>' +
      '<div class="hint" style="margin-top:14px">Click a player to start building or editing their route.</div>';
    view.appendChild(side);

    var wingRouteToggle = toggle('pbWingRouteToggle', 'black', [{ value: 'sameSide', label: 'Same Side' }, { value: 'crossSide', label: 'Cross Side' }], 'sameSide');
    wingRouteToggle.style.display = 'none'; // editor.js's own renderSidebar() drives visibility
    side.querySelector('#pbWingRouteToggleWrap').appendChild(wingRouteToggle);

    return view;
  }

  function buildFormationsView() {
    var view = document.createElement('div');
    view.id = 'pbFormationsView';
    view.style.cssText = 'display:none;gap:16px;flex-wrap:wrap';

    var fieldCard = document.createElement('div');
    fieldCard.className = 'diagramCard';
    fieldCard.style.cssText = 'flex:7 1 0;min-width:380px';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'fbField';
    fieldCard.appendChild(svg);
    var fieldFooter = document.createElement('div');
    fieldFooter.style.cssText = 'display:flex;align-items:center;gap:14px;padding:10px 14px;border-top:1px solid var(--line);flex-wrap:wrap';
    fieldCard.appendChild(fieldFooter);
    view.appendChild(fieldCard);

    var side = document.createElement('div');
    side.className = 'coachToolsSubPanel';
    side.style.cssText = 'flex:3 1 0;min-width:280px';
    var LBL = 'display:block;font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin:10px 0 6px';
    var BTN = 'display:block;width:100%;margin-top:8px';
    side.innerHTML =
      '<label style="' + LBL + '">Formation</label>' +
      '<select id="fbFormationSelect" style="width:100%;padding:9px"></select>' +
      '<button class="navBtn secondary" id="fbNewBtn" style="' + BTN + '">+ New Formation</button>' +
      '<label style="' + LBL + '">Formation name</label>' +
      '<input type="text" id="fbNameInput" placeholder="e.g. I-Formation" style="width:100%;padding:9px">' +
      '<label style="' + LBL + '">Touch card</label>' +
      // The REAL <select id="fbTouchCardSelect"> is what formation-editor.js
      // actually reads/writes (fbPopulateTouchCardSelect()/fbSyncTouchCard(),
      // plus fbSaveBtn's own q('fbTouchCardSelect').value read) -- left
      // completely alone, just visually hidden, so none of that logic (or
      // its Save-path correctness) has to change for this. What a coach
      // actually taps is fbTouchCardPickerBtn below: a coach recognizes a
      // touch card by its PHOTO, not by reading "Down and Out (#14)" text
      // out of a tiny native dropdown at practice -- Nathan: "I should have
      // the ability to drop in any card," which is exactly why the full,
      // any-group deck (not just Play Call) needs a picker a coach can
      // actually scan by sight. wireTouchCardPicker() (below) builds the
      // tap-to-open image grid and keeps this select in sync in both
      // directions.
      '<select id="fbTouchCardSelect" style="display:none"></select>' +
      '<button type="button" id="fbTouchCardPickerBtn" class="navBtn secondary" style="display:flex;align-items:center;gap:10px;text-align:left;padding:8px;margin-bottom:8px;height:auto">' +
      '  <img id="fbTouchCardPreviewImg" style="width:44px;height:54px;object-fit:cover;border-radius:5px;border:1px solid var(--line);background:#fff;flex:none;display:none">' +
      '  <span id="fbTouchCardPickerLabel" style="flex:1;font-size:13px;font-weight:600">(none set)</span>' +
      '  <span class="hint" style="margin:0">Choose ▸</span>' +
      '</button>' +
      '<button class="navBtn" id="fbSaveBtn" style="' + BTN + '">Save Formation</button>' +
      '<button class="navBtn danger" id="fbDeleteBtn" style="' + BTN + '">Remove Formation</button>' +
      '<div class="hint" id="fbStatus" style="min-height:1.4em;margin-top:8px"></div>' +
      '<div class="build-panel" id="fbPlayerPanel" style="display:none">' +
      '  <div class="build-panel-label">Selected Player</div>' +
      '  <h3 id="fbPlayerLabel" style="margin:0 0 8px">#4</h3>' +
      '  <label style="' + LBL + '">When the play runs the other way…</label>' +
      '  <select id="fbKindSelect" style="width:100%;padding:9px">' +
      '    <option value="regular">Stays put (default)</option>' +
      '    <option value="wing">Independent Wing L/R toggle</option>' +
      '    <option value="swap">Swaps with another player</option>' +
      '    <option value="center">Relocates alone (mirrors across the field)</option>' +
      '  </select>' +
      '  <div id="fbPartnerField" style="display:none;margin-top:8px">' +
      '    <label style="' + LBL + '">Swap partner</label>' +
      '    <select id="fbPartnerSelect" style="width:100%;padding:9px"></select>' +
      '  </div>' +
      '</div>' +
      '<div class="hint" id="fbNoSelectionNote" style="margin-top:10px">Click a player to reposition them and set how they behave when the play runs the other way.</div>' +
      '<div class="hint" style="margin-top:10px">' +
      '  Drag any of the 11 to set where they line up. Everyone defaults to "stays put" -- correct for the O-line and most backs, since only their route flips, not their standing spot. Use Wing/Swap/Relocate only for a player whose actual spot on the field changes with direction.' +
      '</div>' +
      '<div class="build-panel">' +
      '  <div class="build-panel-label">Plays on this formation</div>' +
      '  <div id="fbOwnPlaysList" style="font-size:13px"></div>' +
      '</div>' +
      '<div class="build-panel">' +
      '  <div class="build-panel-label">Copy a play from another formation</div>' +
      '  <div id="fbCopyPlaysList" style="font-size:13px"></div>' +
      '</div>';
    view.appendChild(side);

    fieldFooter.appendChild(toggle('fbPreviewSideToggle', 'orange', [{ value: 'right', label: 'Preview: Right' }, { value: 'left', label: 'Preview: Left' }], 'right'));

    return view;
  }

  // Nathan: "I also need to be able to setup the defensive alignment...
  // I need to be able to set the defense for the week so all our plays
  // run against that look." Alignment only this pass (his own choice,
  // given the Sunday deadline) -- js/playbuilder/defense-editor.js does
  // the actual drag/save/set-active work; this only builds its markup,
  // same split as every other view on this screen.
  function buildDefenseView() {
    var view = document.createElement('div');
    view.id = 'pbDefenseView';
    view.style.cssText = 'display:none;gap:16px;flex-wrap:wrap';

    var fieldCard = document.createElement('div');
    fieldCard.className = 'diagramCard';
    fieldCard.style.cssText = 'flex:7 1 0;min-width:380px';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'dbField';
    fieldCard.appendChild(svg);
    view.appendChild(fieldCard);

    var side = document.createElement('div');
    side.className = 'coachToolsSubPanel';
    side.style.cssText = 'flex:3 1 0;min-width:280px';
    var LBL = 'display:block;font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin:10px 0 6px';
    var BTN = 'display:block;width:100%;margin-top:8px';
    side.innerHTML =
      '<label style="' + LBL + '">Defense</label>' +
      '<select id="dbLookSelect" style="width:100%;padding:9px"></select>' +
      '<button class="navBtn secondary" id="dbNewLookBtn" style="' + BTN + '">+ New Defense</button>' +
      '<button class="navBtn" id="dbSaveBtn" style="' + BTN + '">Save Defense</button>' +
      '<button class="navBtn danger" id="dbRemoveLookBtn" style="' + BTN + '">Remove Defense</button>' +
      '<div class="build-panel" style="margin-top:14px">' +
      '  <div class="build-panel-label">This week</div>' +
      '  <div class="hint" id="dbActiveStatus" style="margin-bottom:8px"></div>' +
      '  <button class="navBtn" id="dbSetActiveBtn" style="' + BTN + '">Set as this week\'s defense</button>' +
      '  <button class="navBtn secondary" id="dbClearActiveBtn" style="' + BTN + '">Use each play\'s own default</button>' +
      '</div>' +
      '<div class="hint" style="margin-top:10px">Drag any defender to set where they line up. The dashed circles are your own O-line, shown for reference only. This sets ALIGNMENT only for now -- man/zone/blitz assignment is a later phase.</div>';
    view.appendChild(side);

    return view;
  }

  // ------------------------------------------------------------------
  // Touch card picker -- a tap-friendly image grid standing in for the
  // real (hidden) fbTouchCardSelect. Its own overlay, own classes
  // (.lbOverlay/.lbCard, the same pattern js/study-quiz.js's leaderboard
  // and js/two-minute-drill.js's overlay already use) so this never
  // touches or races the app's actual #lbOverlay singleton, which those
  // two features already share between themselves.
  // ------------------------------------------------------------------
  function buildTouchCardPickerOverlay() {
    var existing = document.getElementById('fbTouchCardPickerOverlay');
    if (existing) return existing;
    var overlay = document.createElement('div');
    overlay.className = 'lbOverlay';
    overlay.id = 'fbTouchCardPickerOverlay';
    overlay.innerHTML =
      '<div class="lbCard" style="max-width:480px;padding:0">' +
      '  <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line)">' +
      '    <h3 style="margin:0">Choose touch card</h3>' +
      '    <button type="button" class="navBtn secondary" id="fbTouchCardPickerCloseBtn" style="width:auto;margin:0;padding:6px 14px">Close</button>' +
      '  </div>' +
      '  <div id="fbTouchCardPickerGrid" style="max-height:60vh;overflow-y:auto;padding:14px 18px 18px;-webkit-overflow-scrolling:touch"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    // Tapping the dimmed backdrop (not the card itself) closes it -- same
    // "tap outside to dismiss" behavior every other overlay in the app gets.
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeTouchCardPicker();
    });
    overlay.querySelector('#fbTouchCardPickerCloseBtn').addEventListener('click', closeTouchCardPicker);
    return overlay;
  }

  function closeTouchCardPicker() {
    var overlay = document.getElementById('fbTouchCardPickerOverlay');
    if (overlay) overlay.classList.remove('show');
  }

  // Sets the REAL select's value and fires a real 'change' event --
  // formation-editor.js's own bind() already listens for that on
  // fbTouchCardSelect and updates fbTouchCardPreviewImg from it (and
  // fbSaveBtn later reads the same select's .value) -- this file never
  // duplicates that read/write logic, only drives the same input a native
  // dropdown would have.
  function chooseTouchCard(idOrEmpty) {
    var sel = document.getElementById('fbTouchCardSelect');
    if (!sel) return;
    sel.value = idOrEmpty;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    closeTouchCardPicker();
  }

  function openTouchCardPicker() {
    var anySignalDeck = window.PlayBuilderEditor && window.PlayBuilderEditor.anySignalDeck;
    if (!anySignalDeck || !window.Signals) return;
    var overlay = buildTouchCardPickerOverlay();
    var grid = overlay.querySelector('#fbTouchCardPickerGrid');
    var sel = document.getElementById('fbTouchCardSelect');
    var currentId = sel && sel.value !== '' ? Number(sel.value) : null;

    // Grouped (Formation, Play Call, ...) in whatever order each group's
    // first card is first encountered -- anySignalDeck() is already sorted
    // by meaning within that, so groups themselves land in a stable order
    // run to run without this needing its own separate sort pass.
    var groupOrder = [];
    var groups = {};
    anySignalDeck().forEach(function (c) {
      var g = c.group || 'Other';
      if (!groups[g]) { groups[g] = []; groupOrder.push(g); }
      groups[g].push(c);
    });

    var cardStyle = function (selected) {
      return 'display:flex;flex-direction:column;align-items:center;padding:6px;border-radius:8px;border:2px solid ' +
        (selected ? 'var(--bengal-orange)' : 'transparent') + ';background:none;cursor:pointer;width:100%';
    };
    var gridRowStyle = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:8px';

    // The "(none set)" choice gets its own single-item grid row -- same
    // gridRowStyle wrapper every group below gets, just with one button in
    // it, so it doesn't stretch full width above the groups.
    var html = '<div style="' + gridRowStyle + '"><button type="button" class="tcpCardBtn" data-id="" style="' + cardStyle(currentId === null) + '">' +
      '<span style="width:100%;aspect-ratio:4/5;border:1px dashed var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--muted);text-align:center">no card</span>' +
      '<span style="font-size:10.5px;line-height:1.2;margin-top:4px;text-align:center">(none set)</span></button></div>';
    groupOrder.forEach(function (g) {
      html += '<div style="font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin:14px 0 6px">' + g + '</div>' +
        '<div style="' + gridRowStyle + '">';
      groups[g].forEach(function (c) {
        html += '<button type="button" class="tcpCardBtn" data-id="' + c.id + '" style="' + cardStyle(currentId === c.id) + '">' +
          '<img src="' + window.Signals.src(c.id) + '" style="width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:6px;display:block;background:#fff;border:1px solid var(--line)">' +
          '<span style="font-size:10.5px;line-height:1.2;margin-top:4px;text-align:center">' + c.meaning + '</span></button>';
      });
      html += '</div>';
    });
    grid.innerHTML = html;
    grid.querySelectorAll('.tcpCardBtn').forEach(function (btn) {
      btn.addEventListener('click', function () { chooseTouchCard(btn.dataset.id); });
    });
    overlay.classList.add('show');
  }

  // The button's own label/thumbnail can't just be set once -- formation-
  // editor.js's fbSyncTouchCard() (switching formations, +New Formation)
  // updates fbTouchCardPreviewImg DIRECTLY, with no 'change' event, so a
  // plain change-listener here would miss those. The <img> is the one
  // element every code path (fbSyncTouchCard AND this file's own change
  // dispatch, via formation-editor.js's existing listener) already touches
  // reliably, so watch IT rather than duplicating "what's selected" state.
  function watchTouchCardLabel() {
    var img = document.getElementById('fbTouchCardPreviewImg');
    var label = document.getElementById('fbTouchCardPickerLabel');
    var sel = document.getElementById('fbTouchCardSelect');
    if (!img || !label || !sel) return;
    function refresh() {
      var opt = sel.selectedOptions && sel.selectedOptions[0];
      label.textContent = (opt && opt.value !== '') ? opt.textContent : '(none set)';
    }
    refresh();
    new MutationObserver(refresh).observe(img, { attributes: true, attributeFilter: ['src', 'style'] });
  }

  function wireTouchCardPicker() {
    var btn = document.getElementById('fbTouchCardPickerBtn');
    if (btn) btn.addEventListener('click', openTouchCardPicker);
    watchTouchCardLabel();
  }

  function build() {
    var body = document.getElementById('coachPlayBuilderBody');

    var modeTabs = document.createElement('div');
    modeTabs.id = 'pbTopModeToggle';
    modeTabs.className = 'coachToolsModuleTabs';
    modeTabs.innerHTML =
      '<button class="coachToolsModuleTab active" data-mode="plays">Plays</button>' +
      '<button class="coachToolsModuleTab" data-mode="formations">Formations</button>' +
      '<button class="coachToolsModuleTab" data-mode="defense">Defense</button>';
    body.appendChild(modeTabs);

    var playsView = buildPlaysView();
    var formationsView = buildFormationsView();
    var defenseView = buildDefenseView();
    body.appendChild(playsView);
    body.appendChild(formationsView);
    body.appendChild(defenseView);

    // Position every toggle-group's sliding thumb now that each is
    // actually laid out in the DOM (offsetWidth/offsetLeft need a real
    // layout pass) -- same requestAnimationFrame timing
    // js/coachtools-formationbuilder.js's own toggle setup already uses.
    requestAnimationFrame(function () {
      ['pbWingSideToggle', 'pbDirectionToggle', 'pbWingRouteToggle', 'fbPreviewSideToggle'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) window.placeToggleThumb(el);
      });
    });

    // Both scripts read window.PlayBuilderStore/PlayBuilderMirror/etc.,
    // never window.DATA -- loading order relative to the rest of
    // index.html's scripts array doesn't matter, only relative to each
    // other and to the playbuilder/*.js files themselves (already
    // enforced by the scripts array order).
    window.initPlayBuilderFormationEditor();
    var editorReady = window.initPlayBuilderEditor();

    // After initPlayBuilderFormationEditor() -- wireTouchCardPicker()'s
    // watchTouchCardLabel() needs fbPopulateTouchCardSelect()'s options
    // already in the (hidden) select to read an initial label off it.
    wireTouchCardPicker();

    return editorReady;
  }

  window.initCoachPlayBuilder = function () {
    if (built) {
      // Still mid-FIRST-activation (see `initializing`'s own comment
      // above) -- do NOT touch window.__pbPendingLoadPlayId here. It was
      // already correctly overwritten with this click's own play id
      // before play-calls.js called openCoachToolsTab('playbuilder'); the
      // still-in-flight init() will read whatever's there once it
      // actually gets to it, so leaving it alone is enough for the most
      // recent click to win instead of racing a second consumer.
      if (initializing) return;
      // DOM/editors already exist from a previous activation -- editor.js's
      // own init() (called from build(), below) only ever runs ONCE per
      // page load, so it's not what consumes a LATER Play-tab "Modify ->
      // pencil"/Copy handoff. Real bug, found live: without this, a second
      // pencil click anywhere in the same session silently did nothing --
      // window.PlayBuilderEditor.consumePendingHandoff() is the fix,
      // exported by editor.js specifically for this re-activation case.
      if (window.PlayBuilderEditor && window.PlayBuilderEditor.consumePendingHandoff) {
        window.PlayBuilderEditor.consumePendingHandoff();
      }
      return;
    }
    built = true;
    initializing = true;
    // Real gap, found in review: neither a synchronous throw inside
    // build() (a missing DOM element, a broken wiring call somewhere in
    // formation-editor.js's own bind()) nor a Play Builder Firebase fetch
    // that hangs instead of cleanly failing (no AbortController/timeout
    // anywhere in that chain -- realistic on bad sideline wifi, exactly
    // this app's real environment) ever reached the plain
    // `ready.then(...)` this used to be -- either one left `initializing`
    // stuck true forever, silently no-op'ing every later tap on this tab
    // for the rest of the page session with only a full reload as the
    // fix. A timeout racing the returned promise, a second (rejection)
    // handler alongside the fulfillment one, and a try/catch around the
    // synchronous call all guarantee this flag always eventually clears.
    var cleared = false;
    var clearInitializing = function () {
      if (cleared) return;
      cleared = true;
      clearTimeout(timeoutId);
      initializing = false;
    };
    var timeoutId = setTimeout(clearInitializing, 20000);
    try {
      var ready = build();
      if (ready && ready.then) ready.then(clearInitializing, clearInitializing);
      else clearInitializing();
    } catch (err) {
      console.error('[playbuilder] build() failed:', err);
      clearInitializing();
    }
  };
})();

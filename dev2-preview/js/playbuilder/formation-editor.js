// ============================================================
// Play Builder v2 -- Formations screen.
//
// Reuses FormationBuilder (js/formation-builder.js) purely as a drag
// surface for the 11 fixed player slots -- NOT its own mirrorToOtherSide()/
// anchored/DEFAULT_SWAP machinery, which is a different, older mirror
// model built for the still-live Coach Tools Formation Builder panel
// (js/coachtools-formationbuilder.js) and its per-side-authored
// {positions:{Left,Right}} data shape. Deliberately left untouched here --
// this screen only ever reads/writes builder.positions.Right directly and
// computes its own Left-side preview through window.PlayBuilderMirror
// (mirror.js), the SAME mirror model the real Play Builder V2 editor and
// every saved Play already use. Two different mirror models bridged at
// this one boundary, rather than merged, so neither the old, live panel
// nor the new schema's correctness guarantees are put at risk.
//
// Editing (dragging, kind changes) only ever happens on the canonical
// Right side, same principle as js/playbuilder/editor.js's own
// isEditingPreviewLocked() -- "Preview: Left" swaps the SVG for a
// read-only rendering computed from the live Right-side data, never a
// second editable copy that could drift from it.
//
// IIFE-wrapped, like js/playbuilder/editor.js now is, so none of THIS
// file's own names leak into the shared real-app global scope either.
// The two files still need to share state/render/populatePlaySelect/
// svgEl/drawCircle (editor.js's own) -- aliased once, below, via
// window.PlayBuilderEditor (editor.js's explicit export for exactly this)
// instead of bare shared scope. q() gets its own trivial local copy
// rather than importing editor.js's -- not worth a cross-file dependency
// for one line.
// ============================================================
(function () {

function q(id) { return document.getElementById(id); }
const state = window.PlayBuilderEditor.state;
const render = window.PlayBuilderEditor.render;
const populatePlaySelect = window.PlayBuilderEditor.populatePlaySelect;
const anySignalDeck = window.PlayBuilderEditor.anySignalDeck;
const svgEl = window.PlayBuilderEditor.svgEl;
const drawCircle = window.PlayBuilderEditor.drawCircle;

const LINE_SLOTS = ['LT', 'LG', 'C', 'RG', 'RT'];

const fbState = {
  viewBox: [1600, 1030],
  topPad: 400,
  builder: null,
  /** slotId(string) -> { kind: 'regular'|'wing'|'swap'|'center', partner?: slotId(string) } */
  kinds: {},
  selectedSlot: null,
  editingId: null,
  currentType: 'custom',
  previewSide: 'right',
};

function slotIdFromKey(key) {
  return /^\d+$/.test(key) ? Number(key) : key;
}

function kindsFromFormation(formation) {
  const kinds = {};
  (formation.positions || []).forEach((p) => { kinds[String(p.id)] = { kind: 'regular' }; });
  (formation.wingPositionIds || []).forEach((id) => { kinds[String(id)] = { kind: 'wing' }; });
  (formation.mirrorSwapPairs || []).forEach(([a, b]) => {
    kinds[String(a)] = { kind: 'swap', partner: String(b) };
    kinds[String(b)] = { kind: 'swap', partner: String(a) };
  });
  (formation.centerMirrorPositionIds || []).forEach((id) => { kinds[String(id)] = { kind: 'center' }; });
  return kinds;
}

// Keeps a swap pair symmetric: setting A's partner to B always sets B's
// partner to A, and moving A away from a stale partner clears that
// partner's own back-reference rather than leaving it pointing at a slot
// that no longer claims it.
function setKind(slot, kind, partner) {
  const prev = fbState.kinds[slot];
  if (prev && prev.kind === 'swap' && prev.partner && prev.partner !== partner) {
    const stalePartner = fbState.kinds[prev.partner];
    if (stalePartner && stalePartner.partner === slot) fbState.kinds[prev.partner] = { kind: 'regular' };
  }
  if (kind === 'swap' && partner) {
    fbState.kinds[slot] = { kind: 'swap', partner };
    fbState.kinds[partner] = { kind: 'swap', partner: slot };
  } else {
    fbState.kinds[slot] = { kind };
  }
}

function eligiblePartners(slot) {
  return Object.keys(fbState.kinds).filter((s) => {
    if (s === slot) return false;
    const k = fbState.kinds[s];
    return k.kind === 'regular' || (k.kind === 'swap' && k.partner === slot);
  });
}

// The Play Builder V2 Formation this screen's current drag positions +
// per-player kinds would produce if saved right now -- used both to
// render the Left preview and, unchanged, as the actual save payload.
function buildDraftFormation() {
  const right = fbState.builder.positions.Right || {};
  const positions = Object.keys(right).map((key) => ({ id: slotIdFromKey(key), label: key, x: right[key][0], y: right[key][1] }));
  const wingPositionIds = [];
  const mirrorSwapPairs = [];
  const centerMirrorPositionIds = [];
  const seenPairs = new Set();
  Object.entries(fbState.kinds).forEach(([slot, info]) => {
    if (info.kind === 'wing') wingPositionIds.push(slotIdFromKey(slot));
    else if (info.kind === 'center') centerMirrorPositionIds.push(slotIdFromKey(slot));
    else if (info.kind === 'swap' && info.partner) {
      const pairKey = [slot, info.partner].sort().join('|');
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        mirrorSwapPairs.push([slotIdFromKey(slot), slotIdFromKey(info.partner)]);
      }
    }
  });
  return { id: '__draft__', positions, wingPositionIds, mirrorSwapPairs, centerMirrorPositionIds };
}

function seedBuilderFrom(formation) {
  const slotMap = {};
  formation.positions.forEach((p) => { slotMap[String(p.id)] = [p.x, p.y]; });
  fbState.builder.positions.Right = slotMap;
  fbState.builder.lineSlots = LINE_SLOTS.slice();
  fbState.builder.anchored = [];
  fbState.builder.selected = null;
  fbState.kinds = kindsFromFormation(formation);
  fbState.selectedSlot = null;
  fbRender();
  fbRenderSidebar();
}

// "Author once, reuse across formations" (js/playbuilder/copy-across-
// formations.js) -- lists plays already on the loaded formation, and
// offers every OTHER formation's plays as one-click copy candidates. Only
// meaningful once the current formation has itself been saved (a copied
// play needs a real formationId to land on), so a not-yet-saved new
// formation shows a note instead of a copy list.
function renderPlaysSection() {
  const savedFormation = state.formations.find((f) => f.id === fbState.editingId);
  if (!savedFormation) {
    q('fbOwnPlaysList').innerHTML = '<div style="color:#999">None yet.</div>';
    q('fbCopyPlaysList').innerHTML = '<div style="color:#999">Save this formation first, then come back here to add plays to it.</div>';
    return;
  }

  const ownPlays = state.plays.filter((p) => p.formationId === savedFormation.id);
  q('fbOwnPlaysList').innerHTML = ownPlays.length
    ? ownPlays.map((p) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0">${p.label} <button class="fbEditPlayBtn" data-play="${p.id}">Edit</button></div>`).join('')
    : '<div style="color:#999">None yet.</div>';
  q('fbOwnPlaysList').querySelectorAll('.fbEditPlayBtn').forEach((b) => {
    b.addEventListener('click', () => {
      const play = state.plays.find((p) => p.id === b.dataset.play);
      if (!play) return;
      q('pbTopModeToggle').querySelector('[data-mode="plays"]').click();
      state.currentPlay = play;
      state.currentVariantIndex = 0;
      state.selectedPlayer = null;
      populatePlaySelect();
      render();
    });
  });

  const others = state.plays.filter((p) => p.formationId !== savedFormation.id);
  q('fbCopyPlaysList').innerHTML = others.length
    ? others.map((p) => {
        const srcFormation = state.formations.find((f) => f.id === p.formationId);
        const srcLabel = srcFormation ? srcFormation.label : p.formationId;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0">${p.label} <span style="color:#999">(${srcLabel})</span> <button class="fbCopyPlayBtn" data-play="${p.id}">Copy here</button></div>`;
      }).join('')
    : '<div style="color:#999">No other plays yet.</div>';
  q('fbCopyPlaysList').querySelectorAll('.fbCopyPlayBtn').forEach((b) => {
    b.addEventListener('click', () => { copyPlayHere(b.dataset.play, savedFormation); });
  });
}

function copyPlayHere(sourcePlayId, targetFormation) {
  const sourcePlay = state.plays.find((p) => p.id === sourcePlayId);
  const sourceFormation = state.formations.find((f) => f.id === sourcePlay.formationId);
  if (!sourcePlay || !sourceFormation) return;

  const suggestedId = `${sourcePlay.id}_${targetFormation.id}`;
  const newId = (prompt('New play key for the copy:', suggestedId) || '').trim();
  if (!newId) return;
  if (state.plays.find((p) => p.id === newId)) { alert('A play with that key already exists -- pick another.'); return; }
  const newLabel = (prompt('Display label:', sourcePlay.label) || sourcePlay.label).trim() || sourcePlay.label;

  let newPlay;
  try {
    newPlay = window.PlayBuilderCopyAcrossFormations.copyPlayToFormation(sourcePlay, sourceFormation, targetFormation, newId, newLabel);
  } catch (err) {
    console.error(err);
    alert(err.message);
    return;
  }
  q('fbStatus').textContent = 'Saving copy…';
  window.PlayBuilderStore.savePlay(newPlay).then(() => {
    if (window.PlayBuilderEditor) window.PlayBuilderEditor.onPlaySaved(newPlay);
    renderPlaysSection();
    q('fbStatus').textContent = `Copied "${newLabel}" to ${targetFormation.label}.`;
  }).catch((err) => {
    q('fbStatus').textContent = 'Copy failed: ' + err.message;
    console.error(err);
  });
}

function renderLeftPreview() {
  const svg = q('fbField');
  svg.innerHTML = '';
  const draft = buildDraftFormation();
  const W = fbState.viewBox[0];
  const top = fbState.builder.viewport.y;
  const height = fbState.builder.viewport.height;
  svg.setAttribute('viewBox', `0 ${top} ${W} ${height}`);
  const g = svgEl('g', {});
  svg.appendChild(g);
  g.appendChild(svgEl('rect', { x: 0, y: top, width: W, height, fill: 'var(--fb-turf)' }));
  draft.positions.forEach((pos) => {
    const anchor = window.PlayBuilderMirror.resolveAnchor(draft, pos.id, { wingSide: 'left', direction: 'left' });
    g.appendChild(drawCircle(anchor.x, anchor.y, String(pos.label), '#111111', 34, false));
  });
}

function fbRender() {
  if (fbState.previewSide === 'left') renderLeftPreview();
  else fbState.builder.render();
}

function fbRenderSidebar() {
  const slot = fbState.selectedSlot;
  q('fbPlayerPanel').style.display = slot ? '' : 'none';
  q('fbNoSelectionNote').style.display = slot ? 'none' : '';
  if (!slot) return;

  q('fbPlayerLabel').textContent = /^\d+$/.test(slot) ? `#${slot}` : slot;
  const info = fbState.kinds[slot] || { kind: 'regular' };
  q('fbKindSelect').value = info.kind;
  const partnerField = q('fbPartnerField');
  partnerField.style.display = info.kind === 'swap' ? '' : 'none';
  if (info.kind === 'swap') {
    const sel = q('fbPartnerSelect');
    sel.innerHTML = eligiblePartners(slot).map((s) => `<option value="${s}">${/^\d+$/.test(s) ? '#' + s : s}</option>`).join('');
    sel.value = info.partner || '';
  }
}

function fbPopulateFormationSelect() {
  q('fbFormationSelect').innerHTML = state.formations.map((f) => `<option value="${f.id}">${f.label}</option>`).join('');
  if (fbState.editingId) q('fbFormationSelect').value = fbState.editingId;
}

// The formation's own identity/touch card -- the FULL deck (any group),
// not just 'Play Call' -- Nathan: "I should have the ability to drop in
// any card to change how the play reads out." Real for any formation
// that's had one picked here; js/playbuilder/editor.js's own signal-
// sequence preview falls back to js/signals.js's hardcoded
// TOUCH_CARD_BY_FORMATION (wing/split, and "i" until this is used) when
// this hasn't been set.
function fbPopulateTouchCardSelect() {
  const sel = q('fbTouchCardSelect');
  if (!sel || !anySignalDeck) return;
  const deck = anySignalDeck();
  sel.innerHTML = '<option value="">(none set)</option>' + deck.map((c) => `<option value="${c.id}">${c.meaning} (#${c.id})</option>`).join('');
}

function fbSyncTouchCard(formation) {
  const sel = q('fbTouchCardSelect');
  const img = q('fbTouchCardPreviewImg');
  if (!sel) return;
  const id = formation && formation.touchCardId;
  sel.value = id != null ? String(id) : '';
  if (img) {
    if (id != null && window.Signals) {
      img.src = window.Signals.src(id);
      img.style.display = '';
    } else {
      img.style.display = 'none';
    }
  }
}

function bind() {
  fbPopulateTouchCardSelect();
  q('fbTouchCardSelect').addEventListener('change', () => {
    const img = q('fbTouchCardPreviewImg');
    const id = q('fbTouchCardSelect').value;
    if (img) {
      if (id !== '' && window.Signals) { img.src = window.Signals.src(Number(id)); img.style.display = ''; }
      else img.style.display = 'none';
    }
  });

  q('pbTopModeToggle').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      q('pbTopModeToggle').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      // 'flex', not '' -- both views' 2-column layout is only ever set via
      // inline style (coachtools-playbuilder.js's buildPlaysView()/
      // buildFormationsView()), never a stylesheet rule, so clearing
      // `display` to '' falls back to a bare <div>'s default `block`,
      // silently losing the flex row (found live: Formations reverted to
      // stacked full-width columns the moment you switched to it).
      q('pbPlaysView').style.display = b.dataset.mode === 'plays' ? 'flex' : 'none';
      q('pbFormationsView').style.display = b.dataset.mode === 'formations' ? 'flex' : 'none';
      // Defense tab (js/playbuilder/defense-editor.js) -- same convention,
      // added alongside rather than generalizing this 2-case switch into a
      // loop, to keep this a small, obviously-safe diff.
      const defenseView = q('pbDefenseView');
      if (defenseView) defenseView.style.display = b.dataset.mode === 'defense' ? 'flex' : 'none';
      if (b.dataset.mode === 'defense' && window.initPlayBuilderDefense) window.initPlayBuilderDefense();
    });
  });

  q('fbPreviewSideToggle').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      fbState.previewSide = b.dataset.value;
      q('fbPreviewSideToggle').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      fbRender();
    });
  });

  q('fbFormationSelect').addEventListener('change', () => {
    const formation = state.formations.find((f) => f.id === q('fbFormationSelect').value);
    if (!formation) return;
    seedBuilderFrom(formation);
    fbState.editingId = formation.id;
    fbState.currentType = formation.type || 'custom';
    q('fbNameInput').value = formation.label;
    fbSyncTouchCard(formation);
    q('fbStatus').textContent = '';
    renderPlaysSection();
  });

  q('fbKindSelect').addEventListener('change', () => {
    const slot = fbState.selectedSlot;
    const kind = q('fbKindSelect').value;
    if (kind === 'swap') {
      const eligible = eligiblePartners(slot);
      if (!eligible.length) {
        q('fbStatus').textContent = 'No other "stays put" position available to swap with -- change that player’s behavior first.';
        fbRenderSidebar();
        return;
      }
      setKind(slot, 'swap', eligible[0]);
    } else {
      setKind(slot, kind);
    }
    q('fbStatus').textContent = '';
    fbRenderSidebar();
    fbRender();
  });

  q('fbPartnerSelect').addEventListener('change', () => {
    setKind(fbState.selectedSlot, 'swap', q('fbPartnerSelect').value);
    fbRenderSidebar();
    fbRender();
  });

  q('fbNewBtn').addEventListener('click', () => {
    const label = (prompt('New formation name (e.g. "I-Formation"):') || '').trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) { alert('Please use at least one letter or number.'); return; }
    if (state.formations.find((f) => f.id === id)) {
      alert('A formation with that name already exists -- pick another name.');
      return;
    }
    // No blank canvas -- start from whichever formation is currently loaded.
    const seedFormation = state.formations.find((f) => f.id === q('fbFormationSelect').value) || state.formations[0];
    seedBuilderFrom(seedFormation);
    fbState.editingId = id;
    fbState.currentType = 'custom';
    q('fbNameInput').value = label;
    fbSyncTouchCard(null);
    q('fbStatus').textContent = `Starting "${label}" from ${seedFormation.label}'s layout -- drag players, then Save Formation.`;
    renderPlaysSection();
  });

  q('fbSaveBtn').addEventListener('click', async () => {
    const label = (q('fbNameInput').value || '').trim();
    if (!label) { q('fbStatus').textContent = 'Give the formation a name first.'; return; }
    const draft = buildDraftFormation();
    // This screen's drag canvas only ever tracks a position's base x/y --
    // it has no UI for alignmentToggles or a position's alternate
    // `alignments` anchor (that mechanism was built after this screen, and
    // is authored through the Plays screen's own alignment-preview toggle
    // instead). Without this, EVERY save here -- not just a drag, even
    // just re-selecting the formation and hitting Save -- would silently
    // wipe both fields, since buildDraftFormation() only ever produces
    // plain {id,label,x,y} positions. Confirmed live: re-saving "I" here
    // dropped its real Heavy alignmentToggles and #4's wing `alignments`
    // entirely. Carries them forward from whatever's already on the
    // formation being edited so this screen can never destroy them --
    // real editing of alignments themselves still only happens where it
    // already did, the Plays screen.
    const existing = state.formations.find((f) => f.id === fbState.editingId);
    const positions = draft.positions.map((p) => {
      const prior = existing && existing.positions.find((op) => String(op.id) === String(p.id));
      return (prior && prior.alignments) ? Object.assign({}, p, { alignments: prior.alignments }) : p;
    });
    const formation = {
      id: fbState.editingId,
      label,
      type: fbState.currentType,
      positions,
      wingPositionIds: draft.wingPositionIds,
      mirrorSwapPairs: draft.mirrorSwapPairs,
      centerMirrorPositionIds: draft.centerMirrorPositionIds,
    };
    if (existing && existing.alignmentToggles) formation.alignmentToggles = existing.alignmentToggles;
    // Same reasoning as alignmentToggles just above, for a field added
    // after that fix was already written: Formation.overload (schema.js
    // -- Nathan's Overload collision-avoidance anchors for the flanker,
    // js/play-calls.js's p4OverloadCollisionAnchor). This screen has no
    // UI for it either, so it needs the exact same carry-forward or
    // every Save here silently drops it too -- confirmed live, this is
    // NOT hypothetical: it happened, re-saving "I" wiped it, and #4
    // collided with the newly-squeezed-in 2nd tight end again until this
    // was found and fixed.
    if (existing && existing.overload) formation.overload = existing.overload;
    // Found live (codebase audit, 2026-09-26), same exact class of bug as
    // alignmentToggles/overload just above -- Formation.wingLeftAnchors
    // (the "5 Guys" 3/5/2/6 redistribute-around-the-wing mechanism,
    // schema.js) has no UI on this screen either and buildDraftFormation()
    // never produces it, so every Save here was silently dropping it too.
    // Re-saving "5 Guys" for any reason (nudging a player, changing its
    // touch card) would have reproduced the exact bug already found and
    // fixed once this session: "I change the toggle to Wing Left and it
    // moves him over without adjusting the other 3, 5, 2, or 6."
    if (existing && existing.wingLeftAnchors) formation.wingLeftAnchors = existing.wingLeftAnchors;
    const touchCardValue = q('fbTouchCardSelect') ? q('fbTouchCardSelect').value : '';
    if (touchCardValue !== '') formation.touchCardId = Number(touchCardValue);
    q('fbSaveBtn').textContent = 'Saving…';
    try {
      await window.PlayBuilderStore.saveFormation(formation);
      if (window.PlayBuilderEditor) window.PlayBuilderEditor.onFormationSaved(formation);
      fbPopulateFormationSelect();
      q('fbFormationSelect').value = formation.id;
      q('fbSaveBtn').textContent = 'Saved!';
      q('fbStatus').textContent = `Saved "${label}".`;
      // Was possibly just-created (not yet in state.formations when this
      // handler started) -- now that onFormationSaved has landed it there,
      // the "save this formation first" note can flip to a real plays list.
      renderPlaysSection();
    } catch (err) {
      q('fbSaveBtn').textContent = 'Save failed';
      console.error(err);
      alert(err.message);
    }
    setTimeout(() => { q('fbSaveBtn').textContent = 'Save Formation'; }, 1800);
  });

  q('fbDeleteBtn').addEventListener('click', async () => {
    const formation = state.formations.find((f) => f.id === fbState.editingId);
    if (!formation) { q('fbStatus').textContent = 'Nothing to remove.'; return; }
    if (formation.id === 'shotgun' || formation.id === 'split') {
      alert('Shotgun and Split are built in and can\'t be removed.');
      return;
    }

    // A formation can have plays two different ways at once: real Play
    // Builder V2 plays (state.plays) and, for one still built through the
    // old, now-unlinked Formation Builder/Create-a-Play tools, real plays
    // living under the SAME id in the legacy formationPlays/
    // assignmentOverrides store (js/assignment-store.js -- only present in
    // the real app, not this standalone page). Check both before asking,
    // so the warning is honest about everything "remove" actually deletes.
    const ownPlays = state.plays.filter((p) => p.formationId === formation.id);
    let legacyKeys = [];
    if (window.AssignmentStore) {
      try {
        const allFormationPlays = await window.AssignmentStore.loadFormationPlays();
        legacyKeys = allFormationPlays[formation.id] || [];
      } catch (err) { console.error('[formation-editor] failed to check legacy plays (continuing anyway):', err); }
    }

    const parts = [];
    if (ownPlays.length) parts.push(`${ownPlays.length} Play Builder play(s) (${ownPlays.map((p) => p.label).join(', ')})`);
    if (legacyKeys.length) parts.push(`${legacyKeys.length} older, still-linked play(s) (${legacyKeys.join(', ')})`);
    // Found live (codebase audit, 2026-09-26): the deletion below removes
    // this formation's real position data from window.Formations/
    // AssignmentStore whenever formation.legacyImport is true -- not only
    // when legacyKeys.length is also non-zero. An import stub with no
    // legacy plays curated yet still had real, live position data, and
    // the warning said nothing about losing it -- just "Remove 'X
    // (import)'? This can't be undone." with no hint it wasn't only an
    // import preview being discarded.
    if (formation.legacyImport) parts.push('its real position data (this is a live formation, not just an import preview)');
    const warning = (parts.length
      ? `Removing "${formation.label}" also removes: ${parts.join('; ')}. `
      : `Remove "${formation.label}"? `) + 'This can\'t be undone. Continue?';
    if (!confirm(warning)) return;

    q('fbDeleteBtn').textContent = 'Removing…';
    try {
      for (const p of ownPlays) await window.PlayBuilderStore.deletePlay(p.id);
      if (!formation.legacyImport) await window.PlayBuilderStore.deleteFormation(formation.id);
      if (window.AssignmentStore && (legacyKeys.length || formation.legacyImport)) {
        for (const key of legacyKeys) {
          await window.AssignmentStore.save(key, formation.id + ':Right', null);
          await window.AssignmentStore.save(key, formation.id + ':Left', null);
        }
        await window.AssignmentStore.saveFormationPlays(formation.id, null);
        await window.AssignmentStore.deleteFormation(formation.id);
      }

      state.formations = state.formations.filter((f) => f.id !== formation.id);
      state.plays = state.plays.filter((p) => p.formationId !== formation.id);
      if (window.PlayBuilderEditor) window.PlayBuilderEditor.onFormationRemoved();

      fbPopulateFormationSelect();
      const next = state.formations[0];
      fbState.editingId = next ? next.id : null;
      fbState.currentType = next ? (next.type || 'custom') : 'custom';
      q('fbNameInput').value = next ? next.label : '';
      fbSyncTouchCard(next);
      if (next) seedBuilderFrom(next);
      q('fbDeleteBtn').textContent = 'Removed!';
      q('fbStatus').textContent = `Removed "${formation.label}".`;
      renderPlaysSection();
    } catch (err) {
      q('fbDeleteBtn').textContent = 'Remove failed';
      console.error(err);
      alert(err.message);
    }
    setTimeout(() => { q('fbDeleteBtn').textContent = 'Remove Formation'; }, 1800);
  });
}

// Named distinctly from editor.js's own init() -- both files are plain
// classic <script>s sharing one top-level scope (no modules, no IIFE
// wrapper here), so two functions named `init` would silently collide:
// whichever loads second wins the name, and editor.js's own async init()
// (which its own initPlayBuilderEditor() export relies on returning a
// real Promise) would quietly stop being what runs.
//
// Same explicit-export-over-unconditional-DOMContentLoaded reasoning as
// editor.js's own initPlayBuilderEditor(): js/coachtools-playbuilder.js
// (the real app) injects this screen's markup lazily on first tab
// activation, so pbTopModeToggle/fbField/etc. don't exist yet at the real
// app's own DOMContentLoaded -- only playbuilder.html's markup is already
// present in the page source by the time this script runs.
window.initPlayBuilderFormationEditor = function () {
  bind();
};
if (document.getElementById('pbTopModeToggle')) window.initPlayBuilderFormationEditor();

// Called by js/playbuilder/editor.js's init() once store data (including
// state.formations, shared top-level state across both scripts) has
// loaded -- this screen deliberately never fetches the store itself, so
// there's one loader, one shared formations array, no race.
window.PlayBuilderFormationEditor = {
  onDataLoaded({ viewBox, topPad }) {
    fbState.viewBox = viewBox || fbState.viewBox;
    fbState.topPad = typeof topPad === 'number' ? topPad : fbState.topPad;
    fbState.builder = new window.FormationBuilder({
      svg: q('fbField'),
      viewBox: fbState.viewBox,
      topPad: fbState.topPad,
      onChange: () => { q('fbStatus').textContent = ''; },
      onSelect: (slot) => { fbState.selectedSlot = slot; fbRenderSidebar(); },
    });
    fbPopulateFormationSelect();
    const first = state.formations[0];
    if (first) {
      seedBuilderFrom(first);
      fbState.editingId = first.id;
      fbState.currentType = first.type || 'custom';
      q('fbNameInput').value = first.label;
      fbSyncTouchCard(first);
      renderPlaysSection();
    }
  },
};

})();

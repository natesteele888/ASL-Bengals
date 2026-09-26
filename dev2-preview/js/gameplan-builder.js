// ---------------------------------------------------------------------------
// Game Plan Builder -- a full-screen, opponent-scoped authoring flow for the
// Game Plan (js/gameplan.js) This Week already shows to the kids. Nathan:
// "Lets have it so it opens full screen like the 2-min drill and you choose
// your opponent on the schedule to game plan against. Then you choose your
// base plays. Then you add those plays to a playlist and edit them from
// there to fine tune the directions and all. Then you save to that game
// plan... needs to be easy to do at practice."
//
// Copies js/two-minute-drill.js's own overlay convention exactly (a fixed,
// inset:0 div stacked above the normal tab-panel system, entered/exited
// outside window.setMode()) and is fully self-contained the same way --
// its own fetch of thisWeek.json/schedule.json on open, not dependent on
// This Week's own editor (js/thisweek.js) having been opened this session.
//
// Phase 1 (this file): opponent -> base plays -> playlist (reorder/remove)
// -> save. Fine-tuning a specific play's direction/wingSide/motion/overload
// still means browsing to that play's real card and tapping its existing
// "+ Add to Game Plan" button (js/play-calls.js's buildCard) -- that add
// flows straight into this same playlist via window.GamePlan.addEntry()'s
// existing onExternalAdd-style sync, so nothing here needs to duplicate
// buildCard's toggle logic to support it. An inline, embedded per-row
// fine-tune panel (closing that last gap) is a deliberate follow-up, not
// built here -- see the plan file's own "Phase 2" note.
// ---------------------------------------------------------------------------
(function () {
  const state = {
    currentStep: 'opponent', mode: null, gameId: '', draftPlays: [], games: [],
    dirty: false, status: '', editingIndex: -1, taggingIndex: -1,
  };

  function gpbGameLabel(g) {
    return `${g.homeAway === 'Away' ? '@' : 'vs'} ${g.opponent || 'TBD'} — ${g.date || ''}`;
  }

  function renderStatus() {
    const el = document.getElementById('gpbStatus');
    if (el) el.textContent = state.status || '';
  }

  function renderSubtitle() {
    const el = document.getElementById('gpbSubtitle');
    if (!el) return;
    const opponentText = state.gameId
      ? (() => { const g = state.games.find((x) => x.id === state.gameId); return g ? gpbGameLabel(g) : ''; })()
      : 'No specific opponent';
    el.textContent = state.mode ? `${opponentText} — ${state.mode === 'offense' ? 'Offense' : 'Defense'}` : opponentText;
  }

  // Nathan: "it just says create your game plan. You choose offense or
  // defense. For offense, you go through the playbook... For defense, you
  // can set your defensive alignments." Which steps exist depends on that
  // choice -- Offense keeps the original Base Plays/Playlist pair,
  // Defense is a single screen pointing at the real Defense Builder (see
  // gpbDefenseScreen's own comment in index.html for why that's a link,
  // not a second embedded copy). Step numbers are computed here, not
  // hardcoded in the markup, so they always match whichever branch is
  // actually showing.
  function activeSteps() {
    const steps = [
      { id: 'opponent', label: '1. Opponent' },
      { id: 'mode', label: '2. Offense/Defense' },
    ];
    if (state.mode === 'offense') {
      steps.push({ id: 'plays', label: '3. Base Plays' });
      steps.push({ id: 'playlist', label: '4. Playlist' });
    } else if (state.mode === 'defense') {
      steps.push({ id: 'defense', label: '3. Defense' });
    }
    return steps;
  }
  const SCREEN_EL_ID = {
    opponent: 'gpbOpponentScreen', mode: 'gpbModeScreen', plays: 'gpbPlaysScreen',
    playlist: 'gpbPlaylistScreen', defense: 'gpbDefenseScreen',
  };

  function renderStepTabs() {
    const tabsEl = document.getElementById('gpbStepTabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = '';
    activeSteps().forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'coachToolsModuleTab' + (state.currentStep === s.id ? ' active' : '');
      btn.textContent = s.label;
      btn.addEventListener('click', () => goStep(s.id));
      tabsEl.appendChild(btn);
    });
  }

  function goStep(stepId) {
    // A step that isn't valid under the CURRENT mode (e.g. still 'plays'
    // from a previous Offense visit, after switching to Defense) falls
    // back to the mode-choice screen instead of showing a stale one.
    state.currentStep = activeSteps().some((s) => s.id === stepId) ? stepId : 'mode';
    renderStepTabs();
    Object.keys(SCREEN_EL_ID).forEach((id) => {
      const el = document.getElementById(SCREEN_EL_ID[id]);
      if (el) el.style.display = id === state.currentStep ? '' : 'none';
    });
    if (state.currentStep === 'opponent') renderOpponentScreen();
    if (state.currentStep === 'mode') renderModeScreen();
    if (state.currentStep === 'plays') renderPlaysScreen();
    if (state.currentStep === 'playlist') renderPlaylistScreen();
    if (state.currentStep === 'defense') renderDefenseScreen();
    renderSubtitle();
  }

  // ---- Screen 1: Opponent ----
  function renderOpponentScreen() {
    const list = document.getElementById('gpbOpponentList');
    if (!list) return;
    list.innerHTML = '';
    const noneBtn = document.createElement('button');
    noneBtn.type = 'button';
    noneBtn.className = 'gpbOpponentBtn' + (!state.gameId ? ' selected' : '');
    noneBtn.textContent = 'No specific opponent (general)';
    noneBtn.addEventListener('click', () => { state.gameId = ''; state.dirty = true; goStep('mode'); });
    list.appendChild(noneBtn);
    state.games.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).forEach((g) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gpbOpponentBtn' + (g.id === state.gameId ? ' selected' : '');
      btn.textContent = gpbGameLabel(g);
      btn.addEventListener('click', () => { state.gameId = g.id; state.dirty = true; goStep('mode'); });
      list.appendChild(btn);
    });
  }

  // ---- Screen 2: Offense or Defense ----
  function renderModeScreen() {
    const wrap = document.getElementById('gpbModeChoice');
    if (!wrap) return;
    wrap.innerHTML = '';
    const offenseBtn = document.createElement('button');
    offenseBtn.type = 'button';
    offenseBtn.className = 'gpbModeBtn' + (state.mode === 'offense' ? ' selected' : '');
    offenseBtn.innerHTML = '<span class="gpbModeBtnIcon">🏈</span><span class="gpbModeBtnLabel">Offense</span><span class="gpbModeBtnHint">Pick plays from the playbook, fine-tune them, build your call sheet</span>';
    offenseBtn.addEventListener('click', () => { state.mode = 'offense'; goStep('plays'); });
    const defenseBtn = document.createElement('button');
    defenseBtn.type = 'button';
    defenseBtn.className = 'gpbModeBtn' + (state.mode === 'defense' ? ' selected' : '');
    defenseBtn.innerHTML = '<span class="gpbModeBtnIcon">🛡️</span><span class="gpbModeBtnLabel">Defense</span><span class="gpbModeBtnHint">Set this week’s defensive alignment</span>';
    defenseBtn.addEventListener('click', () => { state.mode = 'defense'; goStep('defense'); });
    wrap.appendChild(offenseBtn);
    wrap.appendChild(defenseBtn);
  }

  // ---- Defense branch: points at the real Defense Builder rather than a
  // second, parallel copy of it (see index.html's own comment on
  // #gpbDefenseScreen for why). ----
  function renderDefenseScreen() {
    const el = document.getElementById('gpbDefenseSummary');
    if (!el) return;
    el.textContent = 'Loading…';
    const loader = window.PlayBuilderStore ? window.PlayBuilderStore.loadAll() : Promise.resolve(null);
    loader.then((all) => {
      if (!all) { el.textContent = 'Defense Builder isn’t available right now.'; return; }
      const look = all.activeDefenseLookId ? (all.defenseLooks || []).find((l) => l.id === all.activeDefenseLookId) : null;
      el.textContent = look
        ? `This week's defense is set to "${look.label}" -- every play studies against it.`
        : 'No specific defense set for this week yet -- every play shows its own default look.';
    }).catch(() => { el.textContent = 'Could not load the current defense.'; });
  }

  // ---- Screen 2: Pick base plays ----
  // One tile per PLAY (not per direction, unlike This Week's own picker
  // chips) -- direction/toggles are a fine-tune concern (Screen 3 / the
  // real card's own "+ Add to Game Plan"), matching Nathan's own two-stage
  // spec ("choose your base plays... fine tune them for Direction").
  function baseRows() {
    const rows = window.GamePlan ? window.GamePlan.numberedRows() : [];
    const seen = new Set();
    const out = [];
    rows.forEach((row) => {
      if (seen.has(row.key)) return;
      seen.add(row.key);
      out.push(row);
    });
    return out;
  }

  function isKeySelected(key) {
    return state.draftPlays.some((p) => p.key === key);
  }

  function renderPlaysScreen() {
    const grid = document.getElementById('gpbPlayGrid');
    const countEl = document.getElementById('gpbPlaysCount');
    if (!grid) return;
    grid.innerHTML = '';
    baseRows().forEach((row) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gameplanChip' + (isKeySelected(row.key) ? ' active' : '');
      chip.style.setProperty('--chip-color', row.color);
      chip.textContent = row.label;
      chip.addEventListener('click', () => {
        if (isKeySelected(row.key)) {
          // Removes EVERY entry for this play (v1 or v2, any direction) --
          // a coach who wants both directions of the same play deliberately
          // in the plan should add the second one from the real card's own
          // "+ Add to Game Plan," which is additive and direction-specific.
          state.draftPlays = state.draftPlays.filter((p) => p.key !== row.key);
        } else {
          const cap = window.GamePlan ? window.GamePlan.MAX_PLAYS : 15;
          if (state.draftPlays.length >= cap) {
            alert(`Game Plan is capped at ${cap} -- remove one first.`);
            return;
          }
          state.draftPlays.push({ key: row.key, direction: 'Right' });
        }
        state.dirty = true;
        renderPlaysScreen();
      });
      grid.appendChild(chip);
    });
    if (countEl) {
      const n = state.draftPlays.length;
      countEl.textContent = `${n} play${n === 1 ? '' : 's'} chosen so far -- tap to add or remove`;
    }
  }

  // ---- Screen 3: Playlist ----
  // Same describe()/renderCardDiagram pairing js/thisweek.js's own
  // makeStaticCard already established (that function is private to
  // thisweek.js's own IIFE, so this is its own small, matching copy --
  // the same intentional per-file duplication js/gameplan.js's own header
  // comment already documents for numberedRows()).
  function playlistThumbSvg(entry) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'gpbPlaylistThumb');
    if (window.renderCardDiagram && window.DATA) {
      if (entry.v === 2) {
        const formationId = entry.formation === 'shotgun' ? undefined : entry.formation;
        if (entry.formation === 'split' && window.renderSplitDiagram) {
          window.renderSplitDiagram(svg, entry.key, entry.splitSide, entry.insideOutside, entry.readPosition, entry.leftCall, entry.rightCall, entry.passOn, null, entry.protection);
        } else {
          window.renderCardDiagram(svg, entry.key, entry.direction, entry.wingSide, null, '4x4', entry.insideOutside, entry.motionOn, entry.bootOn, entry.readPosition, entry.counterOn, entry.popVariantOn, formationId, entry.overloadOn, entry.alignmentValues, entry.qbSneakOn);
        }
      } else {
        const playType = window.DATA.playTypes.find((p) => p.key === entry.key);
        const def = (window.playbookDefaultSubvariant && playType) ? window.playbookDefaultSubvariant(playType) : { io: null, rp: null };
        window.renderCardDiagram(svg, entry.key, entry.direction, entry.direction, null, '4x4', def.io, false, false, def.rp, false, false, playType && playType.authoredFormationId);
      }
    }
    return svg;
  }

  function renderPlaylistScreen() {
    const list = document.getElementById('gpbPlaylist');
    if (!list) return;
    list.innerHTML = '';
    if (!state.draftPlays.length) {
      const empty = document.createElement('div');
      empty.className = 'lbSub';
      empty.style.textAlign = 'center';
      empty.textContent = 'Nothing chosen yet -- go to "3. Base Plays" and tap a few.';
      list.appendChild(empty);
      return;
    }
    state.draftPlays.forEach((entry, idx) => {
      const info = window.GamePlan ? window.GamePlan.describe(entry) : { label: `${entry.key} • ${entry.direction}`, color: '#999' };
      const row = document.createElement('div');
      row.className = 'gpbPlaylistRow';
      row.appendChild(playlistThumbSvg(entry));
      const label = document.createElement('span');
      label.className = 'gpbPlaylistLabel';
      label.style.color = info.color;
      label.textContent = info.label;
      if (entry.spotlightPlayers && entry.spotlightPlayers.length) {
        const tag = document.createElement('span');
        tag.className = 'gpbSpotlightTag';
        tag.textContent = spotlightSummary(entry.spotlightPlayers);
        label.appendChild(document.createElement('br'));
        label.appendChild(tag);
      }
      row.appendChild(label);

      const controls = document.createElement('div');
      controls.className = 'driveScriptRowControls';
      const upBtn = document.createElement('button');
      upBtn.type = 'button'; upBtn.textContent = '↑'; upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', () => {
        const tmp = state.draftPlays[idx - 1];
        state.draftPlays[idx - 1] = state.draftPlays[idx];
        state.draftPlays[idx] = tmp;
        state.dirty = true;
        renderPlaylistScreen();
      });
      const downBtn = document.createElement('button');
      downBtn.type = 'button'; downBtn.textContent = '↓'; downBtn.disabled = idx === state.draftPlays.length - 1;
      downBtn.addEventListener('click', () => {
        const tmp = state.draftPlays[idx + 1];
        state.draftPlays[idx + 1] = state.draftPlays[idx];
        state.draftPlays[idx] = tmp;
        state.dirty = true;
        renderPlaylistScreen();
      });
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button'; removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        state.draftPlays.splice(idx, 1);
        if (state.editingIndex === idx) state.editingIndex = -1;
        if (state.taggingIndex === idx) state.taggingIndex = -1;
        state.dirty = true;
        renderPlaylistScreen();
      });
      const editBtn = document.createElement('button');
      editBtn.type = 'button'; editBtn.textContent = '✎'; editBtn.title = 'Fine-tune direction, motion, overload…';
      editBtn.addEventListener('click', () => {
        state.editingIndex = state.editingIndex === idx ? -1 : idx;
        state.taggingIndex = -1;
        renderPlaylistScreen();
      });
      // Nathan: "assigning plays to study for a particular player or
      // players. If a certain player is going to get 3 handoffs..."
      const tagBtn = document.createElement('button');
      tagBtn.type = 'button'; tagBtn.textContent = '🎯'; tagBtn.title = 'Tag which player(s) this play is for';
      tagBtn.addEventListener('click', () => {
        state.taggingIndex = state.taggingIndex === idx ? -1 : idx;
        state.editingIndex = -1;
        renderPlaylistScreen();
      });
      controls.appendChild(editBtn);
      controls.appendChild(tagBtn);
      controls.appendChild(upBtn);
      controls.appendChild(downBtn);
      controls.appendChild(removeBtn);
      row.appendChild(controls);
      list.appendChild(row);

      if (state.editingIndex === idx) {
        list.appendChild(renderEditPanel(entry, idx));
      }
      if (state.taggingIndex === idx) {
        list.appendChild(renderTagPanel(entry, idx));
      }
    });
  }

  // A short "#23, #44" summary for the Playlist row's own small badge --
  // spotlightSummaryFull (below) is the fuller "#23 Marcus" version used
  // inside the tag panel itself, where there's more room.
  function spotlightSummary(ids) {
    const roster = window.getTeamRosterCached ? window.getTeamRosterCached() : [];
    const byId = {};
    roster.forEach((p) => { byId[String(p.id)] = p; });
    return '🎯 ' + ids.map((id) => {
      const p = byId[String(id)];
      return p ? `#${p.num || '?'}` : '#?';
    }).join(', ');
  }

  // ---- Player tagging ("packages") -- Nathan: "create packages for
  // certain players... assigning plays to study for a particular player
  // or players." Tags this exact Game Plan entry with real roster
  // player(s) -- additive to whichever shape (v1 or v2) the entry already
  // is, no upgrade needed (window.GamePlan.describe()/thisweek.js's own
  // makeStaticCard already only ever branch on entry.v === 2, so an extra
  // field on a v1 entry doesn't change which path it renders through).
  // Surfaces on This Week's own read-only cards (js/thisweek.js) as a
  // small badge, and drives a "My Plays" filter there for whichever real
  // kid is logged in -- see js/roster.js's new myRosterEntry().
  function ensureRosterLoadedForTagging() {
    if (window.isTeamRosterLoaded && window.isTeamRosterLoaded()) return Promise.resolve();
    return window.loadTeamRoster ? window.loadTeamRoster() : Promise.resolve();
  }
  function rosterSortedByNumber() {
    const roster = window.getTeamRosterCached ? window.getTeamRosterCached() : [];
    const rank = (p) => (p.num === '' || p.num == null || isNaN(Number(p.num))) ? Infinity : Number(p.num);
    return roster.slice().sort((a, b) => rank(a) - rank(b));
  }
  function renderTagPanel(entry, idx) {
    const panel = document.createElement('div');
    panel.className = 'gpbTagPanel';
    const title = document.createElement('div');
    title.className = 'lbSub';
    title.style.textAlign = 'center';
    title.textContent = 'Tag which player(s) this play is for:';
    panel.appendChild(title);
    const list = document.createElement('div');
    list.className = 'gpbTagList';
    panel.appendChild(list);

    function renderChips() {
      list.innerHTML = '';
      const current = state.draftPlays[idx];
      const tagged = new Set((current.spotlightPlayers || []).map(String));
      const roster = rosterSortedByNumber();
      if (!roster.length) {
        const empty = document.createElement('div');
        empty.className = 'lbSub';
        empty.textContent = 'Loading roster…';
        list.appendChild(empty);
        return;
      }
      roster.forEach((p) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'gameplanChip' + (tagged.has(String(p.id)) ? ' active' : '');
        chip.textContent = `#${p.num || '?'} ${p.name || ''}`;
        chip.addEventListener('click', () => {
          const set = new Set((state.draftPlays[idx].spotlightPlayers || []).map(String));
          if (set.has(String(p.id))) set.delete(String(p.id)); else set.add(String(p.id));
          state.draftPlays[idx] = Object.assign({}, state.draftPlays[idx], { spotlightPlayers: Array.from(set) });
          state.dirty = true;
          renderChips();
        });
        list.appendChild(chip);
      });
    }
    renderChips();
    ensureRosterLoadedForTagging().then(renderChips);

    const closeRow = document.createElement('div');
    closeRow.style.textAlign = 'right';
    closeRow.style.marginTop = '10px';
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'navBtn secondary';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('click', () => { state.taggingIndex = -1; renderPlaylistScreen(); });
    closeRow.appendChild(doneBtn);
    panel.appendChild(closeRow);
    return panel;
  }

  // The fine-tune panel -- mounts the REAL, unmodified interactive play
  // card (js/play-calls.js's buildCard, via window.buildGamePlanEditCard)
  // right inside the overlay, rather than a second, separately-maintained
  // toggle UI. Confirmed safe to mount a second instance (no page-
  // singleton state) during this session's own research before building
  // this. Starts from that play's own real defaults, same as opening it
  // fresh from the Play tab -- NOT pre-seeded to this entry's current
  // toggle values (buildCard has no such hook today) -- a coach dials it
  // in here the same way they already know how to from browsing plays all
  // season. "Use This" (buildCard's own "+ Add to Game Plan" button,
  // relabeled via opts.onGamePlanCapture) replaces this exact playlist
  // slot instead of writing to Firebase -- nothing here touches real data
  // until the Builder's own "Save Game Plan".
  function renderEditPanel(entry, idx) {
    const panel = document.createElement('div');
    panel.className = 'gpbEditPanel';
    if (!window.buildGamePlanEditCard) {
      const closeRow = document.createElement('div');
      closeRow.style.textAlign = 'right';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'navBtn secondary';
      closeBtn.textContent = '✕ Close';
      closeBtn.addEventListener('click', () => { state.editingIndex = -1; renderPlaylistScreen(); });
      closeRow.appendChild(closeBtn);
      panel.appendChild(closeRow);
      const note = document.createElement('div');
      note.className = 'lbSub';
      note.textContent = 'Fine-tuning isn’t available right now -- try again after the page finishes loading.';
      panel.appendChild(note);
      return panel;
    }
    const card = window.buildGamePlanEditCard(entry, {
      onGamePlanCapture(capturedState) {
        const next = Object.assign({}, capturedState, {
          v: 2,
          id: (entry && entry.id) || ('gp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
          addedAt: (entry && entry.addedAt) || new Date().toISOString(),
          // Fine-tuning a play is a different edit than tagging it for a
          // player -- carry an existing tag forward rather than silently
          // dropping it, same "don't lose what's already there" reasoning
          // as id/addedAt just above.
          spotlightPlayers: (entry && entry.spotlightPlayers) || undefined,
        });
        state.draftPlays[idx] = next;
        state.editingIndex = -1;
        state.dirty = true;
        renderPlaylistScreen();
      },
    });
    // Nathan, testing on his own phone: "I see I can reorder them in but I
    // don't see a way to save the edits, just close." Real gap, not a
    // missing feature -- the real card's OWN save button (relabeled "Use
    // This" above) is the only thing that can actually read its own live
    // toggle state, so it can't be duplicated, but on a tall mobile card
    // it's scrolled well below the diagram/toggles with only "Close"
    // visible up top. Fixed by pinning a real, always-visible action row
    // (sticky within the overlay's own scroll) that finds and clicks the
    // real button rather than reimplementing its capture logic a second
    // time -- same "one real place this logic lives" discipline as
    // everything else in this panel.
    const topRow = document.createElement('div');
    topRow.className = 'gpbEditPanelTopRow';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'navBtn';
    saveBtn.textContent = '💾 Save This Play';
    saveBtn.addEventListener('click', () => {
      const realBtn = card && card.querySelector('.card-gameplan-btn');
      if (realBtn) realBtn.click();
    });
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'navBtn secondary';
    closeBtn.textContent = '✕ Close';
    closeBtn.addEventListener('click', () => { state.editingIndex = -1; renderPlaylistScreen(); });
    topRow.appendChild(saveBtn);
    topRow.appendChild(closeBtn);
    panel.appendChild(topRow);
    if (card) panel.appendChild(card);
    return panel;
  }

  function saveBuilderDraft() {
    if (!window.GamePlan) return;
    const btn = document.getElementById('gpbSaveBtn');
    const statusEl = document.getElementById('gpbStatus');
    const original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    window.GamePlan.saveDraftAsGamePlan(state.gameId, state.draftPlays).then(() => {
      state.dirty = false;
      if (btn) btn.textContent = 'Saved!';
      if (statusEl) statusEl.textContent = 'Saved -- this is what the team sees now.';
      setTimeout(() => {
        closeBuilder();
        if (btn) { btn.textContent = original; btn.disabled = false; }
      }, 900);
    }).catch((err) => {
      console.error('Game Plan Builder save failed:', err);
      if (btn) { btn.textContent = 'Save Failed'; btn.disabled = false; }
      if (statusEl) statusEl.textContent = `Save failed: ${err.message}`;
      setTimeout(() => { if (btn) btn.textContent = original; }, 2200);
    });
  }

  // Returns whether it actually closed (false if the coach backed out of
  // the "discard unsaved changes" confirm) -- the "Open Defense Builder"
  // button (below) needs to know before it navigates away, same
  // unsaved-work protection as the X button already has.
  function closeBuilder() {
    if (state.dirty && !confirm('Discard unsaved changes to this Game Plan?')) return false;
    const overlay = document.getElementById('gamePlanBuilderOverlay');
    if (overlay) { overlay.classList.remove('show'); overlay.style.display = 'none'; }
    return true;
  }

  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    const closeBtn = document.getElementById('gpbCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeBuilder);
    const saveBtn = document.getElementById('gpbSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveBuilderDraft);
    // Nathan: "For defense, you can set your defensive alignments." Points
    // at the real, single Defense Builder instance (Coach Tools -> Play
    // Design -> Play Builder -> Defense) -- see index.html's own comment
    // on #gpbDefenseScreen for why this is a link, not a second embedded
    // copy. Auto-selects the Defense sub-tab there via the same button
    // formation-editor.js's own tab row already exposes, one frame after
    // the panel's had a chance to build.
    const openDefenseBtn = document.getElementById('gpbOpenDefenseBtn');
    if (openDefenseBtn) openDefenseBtn.addEventListener('click', () => {
      if (!closeBuilder()) return;
      if (window.openCoachToolsTab) window.openCoachToolsTab('playbuilder');
      requestAnimationFrame(() => {
        const defBtn = document.querySelector('#pbTopModeToggle [data-mode="defense"]');
        if (defBtn) defBtn.click();
      });
    });
    // "Set your defensive starters" -- Depth Chart already owns this (real
    // players assigned to position groups, js/depth-chart.js), just never
    // had a doorway from here. Same closeBuilder()-first pattern as the
    // Defense Builder link above -- protects an in-progress Offense draft
    // the same way.
    const openDepthChartBtn = document.getElementById('gpbOpenDepthChartBtn');
    if (openDepthChartBtn) openDepthChartBtn.addEventListener('click', () => {
      if (!closeBuilder()) return;
      if (window.openCoachToolsTab) window.openCoachToolsTab('depthchart');
    });
  }

  // Entry point -- js/thisweek.js's new "🏗 Build Game Plan" button calls
  // this. Always does its own fresh load (games + the current Game Plan)
  // rather than trusting whatever state this module happened to already
  // have, so it's correct whether or not This Week's editor was ever
  // opened this session, matching the "self-contained" precedent
  // two-minute-drill.js already established.
  window.openGamePlanBuilder = function () {
    const overlay = document.getElementById('gamePlanBuilderOverlay');
    if (!overlay) return;
    wire();
    overlay.classList.add('show');
    overlay.style.display = 'block';
    // Same fix js/two-minute-drill.js's own openTwoMinDrillOverlay()
    // already established: the inline background:#f4f2ee default in
    // index.html is a deliberate stale-CSS fallback, kept as-is, but
    // corrected here now that the real theme is known -- otherwise a
    // dark-mode coach gets a bright cream overlay every time.
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    overlay.style.background = isDark ? '#161616' : '#f4f2ee';
    state.status = 'Loading…';
    renderStatus();
    Promise.all([
      window.ensureGamesLoaded ? window.ensureGamesLoaded() : Promise.resolve([]),
      window.GamePlan ? window.GamePlan.loadCurrentGamePlan() : Promise.resolve({ gameId: '', plays: [] }),
    ]).then(([games, gp]) => {
      state.games = games || [];
      state.gameId = gp.gameId || '';
      state.draftPlays = (gp.plays || []).slice();
      state.dirty = false;
      state.status = '';
      state.editingIndex = -1;
      state.mode = null;
      renderStatus();
      goStep('opponent');
    }).catch((err) => {
      console.error('Game Plan Builder: failed to load', err);
      state.status = 'Could not load -- try closing and reopening.';
      renderStatus();
    });
  };
})();

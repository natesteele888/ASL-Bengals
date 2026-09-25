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
  const state = { step: 1, gameId: '', draftPlays: [], games: [], dirty: false, status: '', editingIndex: -1 };

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
    if (!state.gameId) { el.textContent = 'No specific opponent'; return; }
    const g = state.games.find((x) => x.id === state.gameId);
    el.textContent = g ? gpbGameLabel(g) : '';
  }

  function goStep(n) {
    state.step = n;
    document.querySelectorAll('#gpbStepTabs .coachToolsModuleTab').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.step) === n);
    });
    const screens = { 1: 'gpbOpponentScreen', 2: 'gpbPlaysScreen', 3: 'gpbPlaylistScreen' };
    Object.keys(screens).forEach((k) => {
      const el = document.getElementById(screens[k]);
      if (el) el.style.display = Number(k) === n ? '' : 'none';
    });
    if (n === 1) renderOpponentScreen();
    if (n === 2) renderPlaysScreen();
    if (n === 3) renderPlaylistScreen();
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
    noneBtn.addEventListener('click', () => { state.gameId = ''; state.dirty = true; goStep(2); });
    list.appendChild(noneBtn);
    state.games.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).forEach((g) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gpbOpponentBtn' + (g.id === state.gameId ? ' selected' : '');
      btn.textContent = gpbGameLabel(g);
      btn.addEventListener('click', () => { state.gameId = g.id; state.dirty = true; goStep(2); });
      list.appendChild(btn);
    });
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
      empty.textContent = 'Nothing chosen yet -- go to "2. Base Plays" and tap a few.';
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
        state.dirty = true;
        renderPlaylistScreen();
      });
      const editBtn = document.createElement('button');
      editBtn.type = 'button'; editBtn.textContent = '✎'; editBtn.title = 'Fine-tune direction, motion, overload…';
      editBtn.addEventListener('click', () => {
        state.editingIndex = state.editingIndex === idx ? -1 : idx;
        renderPlaylistScreen();
      });
      controls.appendChild(editBtn);
      controls.appendChild(upBtn);
      controls.appendChild(downBtn);
      controls.appendChild(removeBtn);
      row.appendChild(controls);
      list.appendChild(row);

      if (state.editingIndex === idx) {
        list.appendChild(renderEditPanel(entry, idx));
      }
    });
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
    const closeRow = document.createElement('div');
    closeRow.style.textAlign = 'right';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'navBtn secondary';
    closeBtn.textContent = '✕ Close';
    closeBtn.addEventListener('click', () => { state.editingIndex = -1; renderPlaylistScreen(); });
    closeRow.appendChild(closeBtn);
    panel.appendChild(closeRow);
    if (!window.buildGamePlanEditCard) {
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
        });
        state.draftPlays[idx] = next;
        state.editingIndex = -1;
        state.dirty = true;
        renderPlaylistScreen();
      },
    });
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

  function closeBuilder() {
    if (state.dirty && !confirm('Discard unsaved changes to this Game Plan?')) return;
    const overlay = document.getElementById('gamePlanBuilderOverlay');
    if (overlay) { overlay.classList.remove('show'); overlay.style.display = 'none'; }
  }

  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    const closeBtn = document.getElementById('gpbCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeBuilder);
    document.querySelectorAll('#gpbStepTabs .coachToolsModuleTab').forEach((btn) => {
      btn.addEventListener('click', () => goStep(Number(btn.dataset.step)));
    });
    const saveBtn = document.getElementById('gpbSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveBuilderDraft);
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
      renderStatus();
      goStep(1);
    }).catch((err) => {
      console.error('Game Plan Builder: failed to load', err);
      state.status = 'Could not load -- try closing and reopening.';
      renderStatus();
    });
  };
})();

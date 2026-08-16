// ---------------------------------------------------------------------------
// Coach Tools: Print & Game Stats -- Nathan: "when I go to the Coach Tools -
// I should have the option to Print the Playbook, Print the Play Sheet, and
// Print and input the stats for to then assign to a game."
//
// Print Playbook / Print Play Sheet just call the existing PDF generators
// (playbook-pdf.js / call-sheet-pdf.js) -- same functions the admin panel's
// buttons already use.
//
// The Stats tool is the new piece: a coach may want to start tracking a
// game's stats before that game is even entered on the Schedule (arriving at
// the field, no time to add the game first). So this keeps one standalone
// "draft" stat sheet (Firebase key draftGameStats.json, not tied to any game
// id) using the exact same editor as a Schedule game's stats
// (js/game-stats-editor.js, window.renderGameStatSheet) -- then
// "Assign to Game" attaches the finished draft to an existing Schedule game,
// or a brand new one, via the same schedule.json read-modify-write pattern
// schedule.js itself uses, and clears the draft.
// ---------------------------------------------------------------------------
(function () {

  const DRAFT_URL = `${FIREBASE_DB_URL}/draftGameStats.json`;
  const SCHEDULE_URL = `${FIREBASE_DB_URL}/schedule.json`;

  let draftStatSheet = null;
  let loaded = false;
  let assignPickerOpen = false;

  function statusEl() { return document.getElementById('coachStatsStatus'); }
  function setStatus(text) { const el = statusEl(); if (el) el.textContent = text || ''; }

  function genId() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---- Draft load/save ----
  function loadDraft() {
    setStatus('Loading draft…');
    return window.firebaseAuthed(DRAFT_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        draftStatSheet = window.normalizeGameStatSheet(data);
        setStatus('');
        renderEditor();
      })
      .catch(err => {
        console.error('Could not load draft stat sheet:', err);
        draftStatSheet = window.blankGameStatSheet();
        setStatus('Could not reach the cloud -- starting a fresh draft.');
        renderEditor();
      });
  }

  function saveDraft(afterOk) {
    setStatus('Saving…');
    window.firebaseAuthed(DRAFT_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftStatSheet),
    })).then(r => {
      if (r.ok) {
        setStatus('Draft saved.');
        if (afterOk) afterOk();
      } else {
        setStatus(`Save failed (HTTP ${r.status}).`);
      }
    }).catch(err => {
      console.error('Draft save failed:', err);
      setStatus(`Save failed: ${err.message}`);
    });
  }

  function clearDraftRemote(afterOk) {
    window.firebaseAuthed(DRAFT_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    })).then(r => { if (r.ok && afterOk) afterOk(); })
      .catch(err => console.error('Draft clear failed:', err));
  }

  // ---- Editor ----
  function renderEditor() {
    const wrap = document.getElementById('coachStatsDraftWrap');
    if (!wrap || !window.renderGameStatSheet) return;
    if (!draftStatSheet) draftStatSheet = window.blankGameStatSheet();
    window.renderGameStatSheet(wrap, draftStatSheet, false);
  }

  // ---- Assign to Game ----
  function closeAssignPicker() {
    assignPickerOpen = false;
    const wrap = document.getElementById('coachAssignPickerWrap');
    if (wrap) wrap.style.display = 'none';
  }

  function openAssignPicker() {
    if (!draftStatSheet || !window.gameStatSheetHasAnything(draftStatSheet)) {
      setStatus('Enter some stats before assigning to a game.');
      return;
    }
    assignPickerOpen = true;
    const wrap = document.getElementById('coachAssignPickerWrap');
    if (!wrap) return;
    wrap.style.display = '';
    wrap.innerHTML = '<div class="lbSub">Loading games…</div>';

    window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url)).then(r => r.ok ? r.json() : null)
      .then(data => {
        const games = Array.isArray(data) ? data.filter(g => g && g.id) : [];
        wrap.innerHTML = '';

        const label = document.createElement('div');
        label.className = 'lbSub';
        label.style.margin = '0 0 8px';
        label.textContent = games.length ? 'Pick a game to attach this stat sheet to:' : 'No games on the schedule yet -- create one below.';
        wrap.appendChild(label);

        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '6px';
        games.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).forEach(g => {
          const hasStats = g.statSheet && window.gameStatSheetHasAnything(window.normalizeGameStatSheet(g.statSheet));
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'navBtn secondary';
          btn.style.textAlign = 'left';
          btn.textContent = `${g.homeAway === 'Away' ? '@' : 'vs'} ${g.opponent || 'TBD'}${g.date ? ' — ' + g.date : ''}${hasStats ? ' (has existing stats -- will be overwritten)' : ''}`;
          btn.addEventListener('click', () => assignToGame(games, g.id));
          list.appendChild(btn);
        });
        wrap.appendChild(list);

        const newWrap = document.createElement('div');
        newWrap.style.display = 'flex';
        newWrap.style.gap = '6px';
        newWrap.style.marginTop = '10px';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'New game -- opponent name';
        nameInput.style.cssText = 'flex:1;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:13px;box-sizing:border-box;';
        const createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'lbLinkBtn';
        createBtn.textContent = '+ Create & Assign';
        createBtn.addEventListener('click', () => {
          const opponent = nameInput.value.trim();
          if (!opponent) return;
          const newGame = { id: genId(), opponent, date: '', time: '', homeAway: 'Home', location: '', ourScore: '', oppScore: '', writeup: '', scouting: '', statSheet: window.blankGameStatSheet(), updatedAt: null };
          games.push(newGame);
          assignToGame(games, newGame.id);
        });
        newWrap.appendChild(nameInput); newWrap.appendChild(createBtn);
        wrap.appendChild(newWrap);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'lbLinkBtn';
        cancelBtn.style.marginTop = '8px';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', closeAssignPicker);
        wrap.appendChild(cancelBtn);
      })
      .catch(err => {
        console.error('Could not load schedule for assignment:', err);
        wrap.innerHTML = '<div class="lbSub">Could not reach the cloud -- try again in a moment.</div>';
      });
  }

  function assignToGame(games, gameId) {
    const idx = games.findIndex(g => g.id === gameId);
    if (idx < 0) return;
    games[idx].statSheet = draftStatSheet;
    games[idx].updatedAt = new Date().toISOString();
    setStatus('Assigning…');
    window.firebaseAuthed(SCHEDULE_URL).then(url => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(games),
    })).then(r => {
      if (r.ok) {
        closeAssignPicker();
        clearDraftRemote(() => {
          draftStatSheet = window.blankGameStatSheet();
          renderEditor();
          setStatus(`Assigned to ${games[idx].opponent || 'game'} -- draft cleared. See it under Schedule.`);
        });
      } else {
        setStatus(`Assign failed (HTTP ${r.status}).`);
      }
    }).catch(err => {
      console.error('Assign failed:', err);
      setStatus(`Assign failed: ${err.message}`);
    });
  }

  function discardDraft() {
    if (!draftStatSheet || !window.gameStatSheetHasAnything(draftStatSheet)) {
      draftStatSheet = window.blankGameStatSheet();
      renderEditor();
      return;
    }
    if (!confirm('Discard the current draft stat sheet? This can\'t be undone.')) return;
    clearDraftRemote(() => {
      draftStatSheet = window.blankGameStatSheet();
      closeAssignPicker();
      renderEditor();
      setStatus('Draft discarded.');
    });
  }

  // ---- Print buttons ----
  function wirePrintButtons() {
    const playbookBtn = document.getElementById('coachPrintPlaybookBtn');
    if (playbookBtn && !playbookBtn.dataset.wired) {
      playbookBtn.dataset.wired = '1';
      const originalLabel = playbookBtn.textContent;
      playbookBtn.addEventListener('click', async () => {
        if (playbookBtn.disabled || !window.generatePlaybookPDF) return;
        playbookBtn.disabled = true;
        try {
          const doc = await window.generatePlaybookPDF((done, total) => {
            playbookBtn.textContent = `📘 Generating… ${done}/${total}`;
          });
          doc.save('ASL_Bengals_Sideline_Playbook.pdf');
          playbookBtn.textContent = '✅ Saved!';
        } catch (err) {
          console.error('Playbook PDF generation failed:', err);
          playbookBtn.textContent = '⚠️ Failed — tap to retry';
        } finally {
          setTimeout(() => { playbookBtn.textContent = originalLabel; playbookBtn.disabled = false; }, 2200);
        }
      });
    }

    const callSheetBtn = document.getElementById('coachPrintCallSheetBtn');
    if (callSheetBtn && !callSheetBtn.dataset.wired) {
      callSheetBtn.dataset.wired = '1';
      const originalLabel = callSheetBtn.textContent;
      callSheetBtn.addEventListener('click', async () => {
        if (callSheetBtn.disabled || !window.generateCallSheetPDF) return;
        callSheetBtn.disabled = true;
        callSheetBtn.textContent = '📋 Generating…';
        try {
          const doc = await window.generateCallSheetPDF();
          doc.save('ASL_Bengals_Play_Sheet.pdf');
          callSheetBtn.textContent = '✅ Saved!';
        } catch (err) {
          console.error('Call sheet PDF generation failed:', err);
          callSheetBtn.textContent = '⚠️ Failed — tap to retry';
        } finally {
          setTimeout(() => { callSheetBtn.textContent = originalLabel; callSheetBtn.disabled = false; }, 2200);
        }
      });
    }

    const blankStatsBtn = document.getElementById('coachPrintBlankStatsBtn');
    if (blankStatsBtn && !blankStatsBtn.dataset.wired) {
      blankStatsBtn.dataset.wired = '1';
      blankStatsBtn.addEventListener('click', () => {
        if (!window.generateGameStatSheetPDF) return;
        const doc = window.generateGameStatSheetPDF(null);
        doc.save('ASL_Bengals_Stat_Sheet_Blank.pdf');
      });
    }
  }

  let controlsWired = false;
  function wireControls() {
    if (controlsWired) return;
    controlsWired = true;
    wirePrintButtons();
    const saveBtn = document.getElementById('coachSaveStatsDraftBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => saveDraft());
    const assignBtn = document.getElementById('coachAssignStatsBtn');
    if (assignBtn) assignBtn.addEventListener('click', () => { assignPickerOpen ? closeAssignPicker() : openAssignPicker(); });
    const discardBtn = document.getElementById('coachDiscardStatsBtn');
    if (discardBtn) discardBtn.addEventListener('click', discardDraft);
  }

  window.initCoachToolsPrint = function () {
    wireControls();
    wirePrintButtons(); // re-check in case Coach Tools panel HTML was (re)rendered
    if (!loaded) {
      loaded = true;
      loadDraft();
    } else {
      renderEditor();
    }
  };
})();

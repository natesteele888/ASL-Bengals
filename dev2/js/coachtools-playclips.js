// Play Clips admin -- Nathan: "our games are now being recorded in
// snippets for each play. I would like to load in the playlist with the
// individual files in order so I can match up what happened on the play
// to the clip of the play." This is the bulk-upload authoring screen:
// pick a game, paste a batch of links (one per line, already in play
// order -- however the coach's camera app/Drive folder already lists
// them), review/reorder/remove, then save. The actual store is
// window.savePlayClips (js/schedule.js), and the real sync workflow
// lives in game-wizard.html's own play-clip playlist panel.
(function () {
  let gamesCache = [];
  let selectedGameId = '';
  let staged = []; // [{id, url}], unsaved working copy -- not written until "Save Clip Order"
  let dirty = false;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function genId() { return 'clip_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  function gameLabel(g) {
    return (g.homeAway === 'Away' ? '@ ' : 'vs ') + (g.opponent || 'TBD') + (g.date ? ' — ' + g.date : '');
  }

  function loadStagedFromGame() {
    const g = gamesCache.find((x) => x.id === selectedGameId);
    staged = (g && Array.isArray(g.playClips)) ? g.playClips.map((c) => ({ id: c.id || genId(), url: c.url || '' })) : [];
    dirty = false;
  }

  function renderGamePicker() {
    const sel = document.getElementById('playClipsGameSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select a game —</option>' +
      gamesCache.map((g) => `<option value="${escapeHtml(g.id)}"${g.id === selectedGameId ? ' selected' : ''}>${escapeHtml(gameLabel(g))}</option>`).join('');
  }

  function renderList() {
    const wrap = document.getElementById('playClipsList');
    const status = document.getElementById('playClipsStatus');
    if (!wrap) return;
    if (!selectedGameId) {
      wrap.innerHTML = '<div class="lbEmpty">Pick a game above to see or add its play clips.</div>';
      if (status) status.textContent = '';
      return;
    }
    if (!staged.length) {
      wrap.innerHTML = '<div class="lbEmpty">No clips yet -- paste links below, one per line, in play order.</div>';
    } else {
      wrap.innerHTML = staged.map((c, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee;">
          <span style="flex:0 0 28px;font-weight:800;color:var(--dim);">${i + 1}</span>
          <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.url)}</span>
          <div class="driveScriptRowControls">
            <button type="button" data-action="clip-up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" data-action="clip-down" data-i="${i}" ${i === staged.length - 1 ? 'disabled' : ''}>▼</button>
          </div>
          <button type="button" class="statsRmBtnSmall" data-action="clip-remove" data-i="${i}">✕</button>
        </div>`).join('');
    }
    if (status) status.textContent = dirty ? '⚠️ Unsaved changes -- tap "Save Clip Order" below.' : '';
  }

  function parseAndAppend(text) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return 0;
    lines.forEach((url) => staged.push({ id: genId(), url }));
    dirty = true;
    return lines.length;
  }

  window.initPlayClipsAdmin = function () {
    if (!window.isApprovedCoachProfile || !window.isApprovedCoachProfile()) {
      const wrap = document.getElementById('coachPlayClipsPanel');
      if (wrap) wrap.innerHTML = '<div class="lbEmpty">Coach access required.</div>';
      return;
    }
    const gameSel = document.getElementById('playClipsGameSelect');
    if (gameSel && !gameSel.dataset.wired) {
      gameSel.dataset.wired = '1';
      gameSel.addEventListener('change', () => {
        if (dirty && !confirm('You have unsaved clip changes for this game -- switch games anyway and lose them?')) {
          gameSel.value = selectedGameId;
          return;
        }
        selectedGameId = gameSel.value;
        loadStagedFromGame();
        renderList();
      });
    }
    const pasteBtn = document.getElementById('playClipsPasteBtn');
    if (pasteBtn && !pasteBtn.dataset.wired) {
      pasteBtn.dataset.wired = '1';
      pasteBtn.addEventListener('click', () => {
        if (!selectedGameId) { alert('Pick a game first.'); return; }
        const ta = document.getElementById('playClipsPasteArea');
        const added = parseAndAppend(ta ? ta.value : '');
        if (ta) ta.value = '';
        renderList();
        const status = document.getElementById('playClipsStatus');
        if (status && added) status.textContent = `➕ Added ${added} clip${added === 1 ? '' : 's'} -- ⚠️ unsaved, tap "Save Clip Order" below.`;
      });
    }
    const listEl = document.getElementById('playClipsList');
    if (listEl && !listEl.dataset.wired) {
      listEl.dataset.wired = '1';
      listEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const i = Number(btn.dataset.i);
        if (btn.dataset.action === 'clip-up' && i > 0) {
          [staged[i - 1], staged[i]] = [staged[i], staged[i - 1]];
          dirty = true;
        } else if (btn.dataset.action === 'clip-down' && i < staged.length - 1) {
          [staged[i + 1], staged[i]] = [staged[i], staged[i + 1]];
          dirty = true;
        } else if (btn.dataset.action === 'clip-remove') {
          staged.splice(i, 1);
          dirty = true;
        } else {
          return;
        }
        renderList();
      });
    }
    const saveBtn = document.getElementById('playClipsSaveBtn');
    if (saveBtn && !saveBtn.dataset.wired) {
      saveBtn.dataset.wired = '1';
      saveBtn.addEventListener('click', () => {
        if (!selectedGameId) { alert('Pick a game first.'); return; }
        saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
        window.savePlayClips(selectedGameId, staged.map((c) => ({ id: c.id, url: c.url })), () => {
          dirty = false;
          saveBtn.disabled = false; saveBtn.textContent = '💾 Save Clip Order';
          renderList();
          const status = document.getElementById('playClipsStatus');
          if (status) { status.textContent = '✅ Saved'; setTimeout(() => { if (!dirty) status.textContent = ''; }, 2200); }
        }, (err) => {
          saveBtn.disabled = false; saveBtn.textContent = '💾 Save Clip Order';
          const status = document.getElementById('playClipsStatus');
          if (status) status.textContent = '⚠️ ' + (err || 'Could not save.');
        });
      });
    }
    (window.ensureGamesLoaded ? window.ensureGamesLoaded() : Promise.resolve([])).then((games) => {
      gamesCache = games || [];
      renderGamePicker();
    });
  };
})();

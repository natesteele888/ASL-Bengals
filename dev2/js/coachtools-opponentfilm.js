// Opponent Film admin -- Nathan: "Make it accessible in the coach tools
// section to upload in library. Choose the team/teams, add the link and
// upload." The actual store is js/opponent-film.js (shared with the two
// real-app display sites, This Week's Week Ahead and a team's Standings
// page); this file is just the Coach Tools authoring screen over it, same
// "panel built fresh each time it's shown" convention js/drone-footage.js's
// own Film Vault tab already uses.
(function () {
  let clipsCache = null;
  let gamesCache = null;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function groupByTeam(clips) {
    const byTeam = {};
    (clips || []).forEach((c) => {
      const key = (c.teamName || 'Unknown').trim();
      (byTeam[key] = byTeam[key] || []).push(c);
    });
    return Object.keys(byTeam).sort((a, b) => a.localeCompare(b)).map((team) => ({ team, clips: byTeam[team] }));
  }

  function renderForm() {
    const formEl = document.getElementById('opponentFilmForm');
    if (!formEl) return;
    const names = window.OpponentFilm.distinctOpponentNames(gamesCache || []);
    const options = names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    formEl.innerHTML = `
      <div class="lbSub" style="margin-bottom:4px;">Team (pick from the Schedule, or type a new one below)</div>
      <select id="opponentFilmTeamSelect" style="width:100%;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
        <option value="">— choose a team —</option>
        ${options}
      </select>
      <input type="text" id="opponentFilmTeamFreeText" placeholder="Or type a team name not yet on the Schedule…" autocomplete="off" style="width:100%;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <input type="text" id="opponentFilmTitle" placeholder="Title (optional -- e.g. “Week 3 vs. Nipmuc”)" autocomplete="off" style="width:100%;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <input type="text" id="opponentFilmUrlInput" placeholder="Google Drive (or YouTube) link…" autocomplete="off" style="width:100%;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <button type="button" class="navBtn" id="opponentFilmAddBtn" style="width:100%;">+ Add Film</button>
      <div class="lbSub" id="opponentFilmFormStatus" style="text-align:center;margin-top:6px;min-height:16px;"></div>
    `;
  }

  function clipRowHtml(clip) {
    const label = clip.title ? clip.title : '🎥 Watch';
    const btn = window.filmButtonHtml
      ? window.filmButtonHtml(clip.url, escapeHtml(label), { btnClass: 'lbLinkBtn', btnStyle: 'display:inline;padding:0;' })
      : `<a href="${escapeHtml(clip.url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee;">
        <span style="flex:1;font-size:13px;">${btn}</span>
        <button type="button" class="statsRmBtnSmall" data-action="remove-clip" data-clip-id="${escapeHtml(clip.id)}">✕</button>
      </div>`;
  }

  function renderList() {
    const listEl = document.getElementById('opponentFilmList');
    if (!listEl) return;
    if (!clipsCache) { listEl.innerHTML = '<div class="lbEmpty">Loading…</div>'; return; }
    if (!clipsCache.length) { listEl.innerHTML = '<div class="lbEmpty">No opponent film added yet -- use the form above to add the first clip.</div>'; return; }
    const groups = groupByTeam(clipsCache);
    listEl.innerHTML = groups.map((g) => `
      <div style="margin-bottom:14px;">
        <div class="lbSectionHeader" style="font-size:13px;">${escapeHtml(g.team)}</div>
        ${g.clips.map(clipRowHtml).join('')}
      </div>`).join('');
  }

  function reload() {
    return window.OpponentFilm.load().then((clips) => {
      clipsCache = clips;
      renderList();
    });
  }

  window.initOpponentFilmAdmin = function () {
    if (!window.isApprovedCoachProfile || !window.isApprovedCoachProfile()) {
      const wrap = document.getElementById('coachOpponentFilmPanel');
      if (wrap) wrap.innerHTML = '<div class="lbEmpty">Coach access required.</div>';
      return;
    }
    const formEl = document.getElementById('opponentFilmForm');
    if (formEl && !formEl.dataset.wired) {
      formEl.dataset.wired = '1';
      formEl.addEventListener('click', (e) => {
        if (e.target.id !== 'opponentFilmAddBtn') return;
        const select = document.getElementById('opponentFilmTeamSelect');
        const freeText = document.getElementById('opponentFilmTeamFreeText');
        const titleInput = document.getElementById('opponentFilmTitle');
        const urlInput = document.getElementById('opponentFilmUrlInput');
        const statusEl = document.getElementById('opponentFilmFormStatus');
        const teamName = (freeText && freeText.value.trim()) || (select && select.value) || '';
        const btn = document.getElementById('opponentFilmAddBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
        window.OpponentFilm.addClip({ teamName, title: titleInput && titleInput.value, url: urlInput && urlInput.value })
          .then(() => {
            if (statusEl) { statusEl.textContent = '✅ Added'; setTimeout(() => { statusEl.textContent = ''; }, 2200); }
            if (freeText) freeText.value = '';
            if (titleInput) titleInput.value = '';
            if (urlInput) urlInput.value = '';
            if (select) select.value = '';
            return reload();
          })
          .catch((err) => { if (statusEl) statusEl.textContent = '⚠️ ' + (err && err.message ? err.message : 'Could not save.'); })
          .then(() => { if (btn) { btn.disabled = false; btn.textContent = '+ Add Film'; } });
      });
    }
    const listEl = document.getElementById('opponentFilmList');
    if (listEl && !listEl.dataset.wired) {
      listEl.dataset.wired = '1';
      listEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="remove-clip"]');
        if (!btn) return;
        if (!confirm('Remove this film clip?')) return;
        window.OpponentFilm.removeClip(btn.dataset.clipId).then(reload);
      });
    }
    (window.ensureGamesLoaded ? window.ensureGamesLoaded() : Promise.resolve([])).then((games) => {
      gamesCache = games;
      renderForm();
    });
    reload();
  };
})();

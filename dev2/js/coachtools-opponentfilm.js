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
  // Nathan (follow-up): "upload of video only allows to choose one
  // opponent while there are 2 teams on the film. Need to pick both
  // teams playing in the game." A clip's film naturally shows TWO teams
  // -- selectedTeams is the working set for the form currently being
  // filled out, reset after each successful add. customTeams holds any
  // typed-in names not already on the Schedule, so they get their own
  // chip (with their own remove ✕) alongside the real Schedule ones.
  let selectedTeams = new Set();
  let customTeams = [];

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // A clip now carries `teamNames` (array) -- it's listed under EVERY
  // team it covers (so browsing either team's group finds it), each row
  // still showing its FULL team list so a two-team clip doesn't look
  // like two separate, unrelated entries when found via one team's group.
  function groupByTeam(clips) {
    const byTeam = {};
    (clips || []).forEach((c) => {
      (Array.isArray(c.teamNames) ? c.teamNames : []).forEach((team) => {
        const key = (team || 'Unknown').trim();
        (byTeam[key] = byTeam[key] || []).push(c);
      });
    });
    return Object.keys(byTeam).sort((a, b) => a.localeCompare(b)).map((team) => ({ team, clips: byTeam[team] }));
  }

  function renderForm() {
    const formEl = document.getElementById('opponentFilmForm');
    if (!formEl) return;
    const names = window.OpponentFilm.distinctOpponentNames(gamesCache || []);
    const allChipNames = names.concat(customTeams.filter((n) => !names.some((x) => x.toLowerCase() === n.toLowerCase())));
    const chips = allChipNames.map((n) => {
      const active = selectedTeams.has(n) ? ' active' : '';
      const isCustom = customTeams.some((c) => c.toLowerCase() === n.toLowerCase()) && !names.some((x) => x.toLowerCase() === n.toLowerCase());
      return `<button type="button" class="gameplanChip${active}" data-action="toggle-team" data-team="${escapeHtml(n)}">${escapeHtml(n)}${isCustom ? ' ✕' : ''}</button>`;
    }).join('');
    formEl.innerHTML = `
      <div class="lbSub" style="margin-bottom:6px;">Team(s) in this film -- tap all that apply (a game usually has two)</div>
      <div id="opponentFilmChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">${chips || '<div class="lbEmpty" style="margin:0;">No teams on the Schedule yet.</div>'}</div>
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <input type="text" id="opponentFilmTeamFreeText" placeholder="Add a team not on the Schedule…" autocomplete="off" style="flex:1;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;">
        <button type="button" class="navBtn" id="opponentFilmAddTeamBtn" style="padding:8px 12px;flex:0 0 auto;">+ Add</button>
      </div>
      <input type="text" id="opponentFilmTitle" placeholder="Title (optional -- e.g. “Week 3: Nipmuc vs. Tyngsboro”)" autocomplete="off" style="width:100%;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <input type="text" id="opponentFilmUrlInput" placeholder="Google Drive (or YouTube) link…" autocomplete="off" style="width:100%;padding:8px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">
      <button type="button" class="navBtn" id="opponentFilmAddBtn" style="width:100%;">+ Add Film</button>
      <div class="lbSub" id="opponentFilmFormStatus" style="text-align:center;margin-top:6px;min-height:16px;"></div>
    `;
  }

  function clipRowHtml(clip) {
    const teams = Array.isArray(clip.teamNames) ? clip.teamNames.join(' vs. ') : '';
    const label = clip.title ? clip.title : (teams ? `🎥 ${teams}` : '🎥 Watch');
    const btn = window.filmButtonHtml
      ? window.filmButtonHtml(clip.url, escapeHtml(label), { btnClass: 'lbLinkBtn', btnStyle: 'display:inline;padding:0;' })
      : `<a href="${escapeHtml(clip.url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee;">
        <span style="flex:1;font-size:13px;">${btn}${clip.title && teams ? `<div class="lbSub" style="margin-top:2px;">${escapeHtml(teams)}</div>` : ''}</span>
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
        const toggleBtn = e.target.closest('[data-action="toggle-team"]');
        if (toggleBtn) {
          const team = toggleBtn.dataset.team;
          const isCustom = customTeams.some((c) => c.toLowerCase() === team.toLowerCase())
            && !window.OpponentFilm.distinctOpponentNames(gamesCache || []).some((x) => x.toLowerCase() === team.toLowerCase());
          if (isCustom && selectedTeams.has(team)) {
            // Tapping an already-selected CUSTOM chip removes it entirely
            // (its own ✕) rather than just deselecting it -- it has no
            // other way to come back once typed, unlike a real Schedule
            // team which just stays in the list, deselected.
            selectedTeams.delete(team);
            customTeams = customTeams.filter((c) => c.toLowerCase() !== team.toLowerCase());
          } else if (selectedTeams.has(team)) {
            selectedTeams.delete(team);
          } else {
            selectedTeams.add(team);
          }
          renderForm();
          return;
        }
        if (e.target.id === 'opponentFilmAddTeamBtn') {
          const freeText = document.getElementById('opponentFilmTeamFreeText');
          const name = freeText ? freeText.value.trim() : '';
          if (!name) return;
          if (!customTeams.some((c) => c.toLowerCase() === name.toLowerCase())) customTeams.push(name);
          selectedTeams.add(name);
          if (freeText) freeText.value = '';
          renderForm();
          return;
        }
        if (e.target.id !== 'opponentFilmAddBtn') return;
        const titleInput = document.getElementById('opponentFilmTitle');
        const urlInput = document.getElementById('opponentFilmUrlInput');
        const statusEl = document.getElementById('opponentFilmFormStatus');
        const btn = document.getElementById('opponentFilmAddBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
        window.OpponentFilm.addClip({ teamNames: Array.from(selectedTeams), title: titleInput && titleInput.value, url: urlInput && urlInput.value })
          .then(() => {
            if (statusEl) { statusEl.textContent = '✅ Added'; setTimeout(() => { statusEl.textContent = ''; }, 2200); }
            selectedTeams = new Set();
            customTeams = [];
            if (titleInput) titleInput.value = '';
            if (urlInput) urlInput.value = '';
            renderForm();
            return reload();
          })
          .catch((err) => { if (statusEl) statusEl.textContent = '⚠️ ' + (err && err.message ? err.message : 'Could not save.'); })
          .then(() => { const b = document.getElementById('opponentFilmAddBtn'); if (b) { b.disabled = false; b.textContent = '+ Add Film'; } });
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

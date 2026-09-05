// ---------------------------------------------------------------------------
// Coach Tools top CTAs -- Nathan: "I don't like how it's all in one list, it
// should be tabs at the top or CTAs at the top that shows the different
// sections like Resources... Then theres at stats section..." Switches
// between the Coach Tools panels and lazy-inits each panel's own module the
// first time it's shown.
//
// Nathan (follow-up): "there needs to be more organization there. I often
// find myself searching for things and callouts that I know exist but don't
// know where to find them sometimes." Twelve tabs in one flat row was
// exactly the "all in one list" problem he originally flagged, just moved
// down a level -- this groups them into five categories a coach would
// actually think in (Game Day / Team / Data / Library / Admin) and adds a
// search box that jumps straight to a tab by name regardless of which
// category it's filed under, for exactly the "I know it exists, I just
// can't find it" moment.
// ---------------------------------------------------------------------------
(function () {

  const TABS = [
    { key: 'resources', label: '🖨️ Resources', category: 'library', panel: 'coachResourcesPanel', init: () => window.initCoachToolsPrint && window.initCoachToolsPrint() },
    // Nathan: "a place where I can copy standing from the coaches app and
    // drop it directly into a field under Coaching Tools to paste in to
    // update the standings." See js/standings.js -- also feeds the
    // read-only Standings top-level tab everyone sees.
    { key: 'standings', label: '🏆 Standings', category: 'data', panel: 'coachStandingsPanel', init: () => window.initCoachToolsStandings && window.initCoachToolsStandings() },
    // Nathan: "I need to be able to copy all the information from the
    // coaches site and extract the game schedule with field, kickoff time,
    // arrival time and other details needed... Would be great for this to
    // just go into the site without manually extracting out the info." See
    // js/schedule-import.js -- same paste-box pattern as Standings above,
    // feeds straight into the Schedule tab everyone sees.
    { key: 'scheduleimport', label: '📅 Schedule Import', category: 'data', panel: 'coachScheduleImportPanel', init: () => window.initCoachToolsScheduleImport && window.initCoachToolsScheduleImport() },
    { key: 'stats', label: '📊 Stats', category: 'data', panel: 'coachStatsPanel', init: () => window.initCoachToolsStats && window.initCoachToolsStats() },
    { key: 'dashboard', label: '📈 Dashboard', category: 'data', panel: 'coachDashboardPanel', init: () => window.initCoachToolsDashboard && window.initCoachToolsDashboard() },
    // Nathan: "add a coaching staff section to go with the roster so we can
    // link log ins to coaches" -- js/coaching-staff.js, rendered right below
    // Team Roster in the same panel (see coachingStaffWrap in index.html).
    { key: 'roster', label: '👥 Roster', category: 'team', panel: 'coachRosterPanel', init: () => {
      window.initTeamRoster && window.initTeamRoster(document.getElementById('coachRosterWrap'));
      window.initCoachingStaff && window.initCoachingStaff(document.getElementById('coachingStaffWrap'));
    } },
    // Nathan: "create another tab under coaching tools for Depth Chart...
    // name and number with + or - to add or remove guys" (from a Madden
    // Lineup screenshot) -- js/depth-chart.js. +/- reorders each position's
    // depth list only; it doesn't touch the master roster above.
    { key: 'depthchart', label: '📋 Depth Chart', category: 'team', panel: 'coachDepthChartPanel', init: () => window.initDepthChart && window.initDepthChart() },
    { key: 'drivescripts', label: '🧢 Drive Scripts', category: 'gameday', panel: 'coachDriveScriptsPanel', init: () => window.initDriveBuilder && window.initDriveBuilder() },
    // Nathan: "make it so any drone videos added are in a Film Vault tab in
    // Coaches Tools - they should be categorized by alphabetical order since
    // they are written by play" + "have that be searchable to narrow the
    // list." See js/drone-footage.js's Film Vault section for the render/
    // search/sort logic -- this just gives it a tab like everything else here.
    { key: 'filmvault', label: '🎬 Film Vault', category: 'library', panel: 'coachFilmVaultPanel', init: () => window.initFilmVault && window.initFilmVault() },
    // Nathan: "make sure that the notes that were added to the What's New
    // can be added at any time by a coach in the Coach Tools block" -- the
    // Houston route note was a one-off migration script; this tab is the
    // real, repeatable version of that.
    { key: 'updates', label: '📣 Updates', category: 'library', panel: 'coachUpdatesPanel', init: () => window.initCoachToolsUpdates && window.initCoachToolsUpdates() },
    // Nathan: "Drone footage visible toggle should come out of Dashboard
    // and have a new pill called settings with that and other toggles to
    // turn on and off visibility to groups."
    { key: 'settings', label: '⚙️ Settings', category: 'admin', panel: 'coachSettingsPanel', init: () => window.initCoachToolsSettings && window.initCoachToolsSettings() },
    // Nathan: "Develop a how to section in the coaching tools... walkthrough
    // explanations of how to do things such as add another login to your
    // device, save the app as an app on your phone home screen." See
    // js/coachtools-howto.js.
    { key: 'howto', label: '❓ How To', category: 'admin', panel: 'coachHowToPanel', init: () => window.initCoachToolsHowTo && window.initCoachToolsHowTo() },
  ];

  const CATEGORIES = [
    { key: 'gameday', label: '🏈 Game Day' },
    { key: 'team', label: '👥 Team' },
    { key: 'data', label: '📈 Data & Stats' },
    { key: 'library', label: '📚 Library' },
    { key: 'admin', label: '⚙️ Admin' },
  ];

  // Nathan: "I want this to be tied into Coach Nate profile... for now."
  // Same per-person check as the Games tab's Keep Stats CTA (js/
  // schedule.js) -- these are new, still-being-worked-out tools, scoped to
  // just Nate's own session rather than every coach who shares the team
  // coach code.
  function isCoachNateSession() {
    if (!window.isCoachSession) return false;
    const session = window.PlayerIdentity && window.PlayerIdentity.getSession && window.PlayerIdentity.getSession();
    const name = session && session.name ? session.name.trim().toLowerCase() : '';
    return name === 'coach nate';
  }
  // Nathan: "this whole project is really a series of mini apps that work
  // together." These are separate standalone pages (not Coach Tools panels
  // like everything else here), so they're real links, not tab switches --
  // kept visually distinct from the TABS chips below rather than mixed in
  // as if they were one of them.
  const GAME_DAY_LINKS = [
    { label: '🧙 Game Wizard', href: 'game-wizard.html' },
    { label: '📋 Stat Keeper', href: 'stat-keeper.html' },
    { label: '🎬 Game Playback', href: 'game-playback.html' },
  ];

  let activeCategory = 'gameday';
  let activeTab = 'resources';
  let searchQuery = '';

  function tabsForCategory(catKey) { return TABS.filter(t => t.category === catKey); }

  function renderNav() {
    const nav = document.getElementById('coachToolsSubNav');
    if (!nav) return;
    nav.innerHTML = '';

    // ---- Search box -- typing jumps straight to a matching tab by name,
    // regardless of which category it's filed under. ----
    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'margin-bottom:10px;';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.value = searchQuery;
    searchInput.placeholder = '🔍 Search Coach Tools…';
    searchInput.style.cssText = 'width:100%;padding:10px;border:2px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;';
    searchInput.addEventListener('input', () => { searchQuery = searchInput.value; renderNav(); });
    searchWrap.appendChild(searchInput);
    nav.appendChild(searchWrap);

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      // Search mode: flat list of every matching tab, category label shown
      // as a small tag so it's still obvious where each result normally
      // lives -- helps build the mental map for next time, not just this
      // one lookup.
      const matches = TABS.filter(t => t.label.toLowerCase().indexOf(q) !== -1);
      const resultsWrap = document.createElement('div');
      resultsWrap.className = 'gameplanPickerGrid';
      if (!matches.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#999;font-size:13px;padding:6px 2px;';
        empty.textContent = 'No matches.';
        resultsWrap.appendChild(empty);
      } else {
        matches.forEach(t => {
          const catLabel = (CATEGORIES.find(c => c.key === t.category) || {}).label || '';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'gameplanChip' + (activeTab === t.key ? ' active' : '');
          btn.textContent = t.label + (catLabel ? ' · ' + catLabel.replace(/^\S+\s/, '') : '');
          btn.addEventListener('click', () => { searchQuery = ''; activeCategory = t.category; setActiveTab(t.key); });
          resultsWrap.appendChild(btn);
        });
      }
      nav.appendChild(resultsWrap);
      return;
    }

    // ---- Normal mode: category pills, then that category's own tabs. ----
    const catRow = document.createElement('div');
    catRow.className = 'gameplanPickerGrid';
    catRow.style.marginBottom = '10px';
    CATEGORIES.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gameplanChip' + (activeCategory === c.key ? ' active' : '');
      btn.textContent = c.label;
      btn.addEventListener('click', () => { activeCategory = c.key; renderNav(); });
      catRow.appendChild(btn);
    });
    nav.appendChild(catRow);

    const tabRow = document.createElement('div');
    tabRow.className = 'gameplanPickerGrid';
    tabsForCategory(activeCategory).forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gameplanChip' + (activeTab === t.key ? ' active' : '');
      btn.textContent = t.label;
      btn.addEventListener('click', () => setActiveTab(t.key));
      tabRow.appendChild(btn);
    });
    nav.appendChild(tabRow);

    if (activeCategory === 'gameday' && isCoachNateSession()) {
      const linkRow = document.createElement('div');
      linkRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed #444;';
      const note = document.createElement('div');
      note.style.cssText = 'width:100%;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;';
      note.textContent = 'Live Game Tools (separate apps)';
      linkRow.appendChild(note);
      GAME_DAY_LINKS.forEach(l => {
        const a = document.createElement('a');
        a.href = l.href;
        a.className = 'gameplanChip';
        a.style.textDecoration = 'none';
        a.textContent = l.label;
        linkRow.appendChild(a);
      });
      nav.appendChild(linkRow);
    }
  }

  function setActiveTab(key) {
    activeTab = key;
    const tab = TABS.find(t => t.key === key);
    if (tab) activeCategory = tab.category;
    TABS.forEach(t => {
      const panel = document.getElementById(t.panel);
      if (panel) panel.style.display = t.key === key ? '' : 'none';
    });
    renderNav();
    if (tab) tab.init();
  }

  window.initCoachToolsNav = function () {
    renderNav();
    // Team roster is used by both the Roster tab and stat entry's
    // auto-seed -- load it once up front regardless of which tab opens
    // first, so it's ready by the time Stats needs it.
    if (window.loadTeamRoster && !window.isTeamRosterLoaded()) window.loadTeamRoster();
    setActiveTab(activeTab);
  };

  // Deep-link straight into a specific Coach Tools tab -- used by the
  // header logo's 5-tap shortcut (see study-quiz.js) to jump right to
  // Dashboard instead of just landing on the Coach Tools section's default
  // tab. Switching the top-level section (window.setSection, defined in
  // study-quiz.js) re-runs initCoachToolsNav(), which reads activeTab back
  // out -- setting it here first is what makes that land on the right tab.
  window.openCoachToolsTab = function (key) {
    activeTab = key;
    const tab = TABS.find(t => t.key === key);
    if (tab) activeCategory = tab.category;
    if (window.setSection) window.setSection('coachtools');
    else setActiveTab(key);
  };
})();

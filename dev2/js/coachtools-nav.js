// ---------------------------------------------------------------------------
// Coach Tools top CTAs -- Nathan: "I don't like how it's all in one list, it
// should be tabs at the top or CTAs at the top that shows the different
// sections like Resources... Then theres at stats section..." Switches
// between the four Coach Tools panels (Resources / Stats / Roster / Drive
// Scripts) and lazy-inits each panel's own module the first time it's shown.
// ---------------------------------------------------------------------------
(function () {

  const TABS = [
    { key: 'resources', label: '🖨️ Resources', panel: 'coachResourcesPanel', init: () => window.initCoachToolsPrint && window.initCoachToolsPrint() },
    // Nathan: "a place where I can copy standing from the coaches app and
    // drop it directly into a field under Coaching Tools to paste in to
    // update the standings." See js/standings.js -- also feeds the
    // read-only Standings top-level tab everyone sees.
    { key: 'standings', label: '🏆 Standings', panel: 'coachStandingsPanel', init: () => window.initCoachToolsStandings && window.initCoachToolsStandings() },
    { key: 'stats', label: '📊 Stats', panel: 'coachStatsPanel', init: () => window.initCoachToolsStats && window.initCoachToolsStats() },
    // Nathan: "add a coaching staff section to go with the roster so we can
    // link log ins to coaches" -- js/coaching-staff.js, rendered right below
    // Team Roster in the same panel (see coachingStaffWrap in index.html).
    { key: 'roster', label: '👥 Roster', panel: 'coachRosterPanel', init: () => {
      window.initTeamRoster && window.initTeamRoster(document.getElementById('coachRosterWrap'));
      window.initCoachingStaff && window.initCoachingStaff(document.getElementById('coachingStaffWrap'));
    } },
    // Nathan: "create another tab under coaching tools for Depth Chart...
    // name and number with + or - to add or remove guys" (from a Madden
    // Lineup screenshot) -- js/depth-chart.js. +/- reorders each position's
    // depth list only; it doesn't touch the master roster above.
    { key: 'depthchart', label: '📋 Depth Chart', panel: 'coachDepthChartPanel', init: () => window.initDepthChart && window.initDepthChart() },
    { key: 'drivescripts', label: '🧢 Drive Scripts', panel: 'coachDriveScriptsPanel', init: () => window.initDriveBuilder && window.initDriveBuilder() },
    // Nathan: "make it so any drone videos added are in a Film Vault tab in
    // Coaches Tools - they should be categorized by alphabetical order since
    // they are written by play" + "have that be searchable to narrow the
    // list." See js/drone-footage.js's Film Vault section for the render/
    // search/sort logic -- this just gives it a tab like everything else here.
    { key: 'filmvault', label: '🎬 Film Vault', panel: 'coachFilmVaultPanel', init: () => window.initFilmVault && window.initFilmVault() },
    // Nathan: "make sure that the notes that were added to the What's New
    // can be added at any time by a coach in the Coach Tools block" -- the
    // Houston route note was a one-off migration script; this tab is the
    // real, repeatable version of that.
    { key: 'updates', label: '📣 Updates', panel: 'coachUpdatesPanel', init: () => window.initCoachToolsUpdates && window.initCoachToolsUpdates() },
    { key: 'dashboard', label: '📊 Dashboard', panel: 'coachDashboardPanel', init: () => window.initCoachToolsDashboard && window.initCoachToolsDashboard() },
    // Nathan: "Drone footage visible toggle should come out of Dashboard
    // and have a new pill called settings with that and other toggles to
    // turn on and off visibility to groups."
    { key: 'settings', label: '⚙️ Settings', panel: 'coachSettingsPanel', init: () => window.initCoachToolsSettings && window.initCoachToolsSettings() },
    // Nathan: "Develop a how to section in the coaching tools... walkthrough
    // explanations of how to do things such as add another login to your
    // device, save the app as an app on your phone home screen." See
    // js/coachtools-howto.js.
    { key: 'howto', label: '❓ How To', panel: 'coachHowToPanel', init: () => window.initCoachToolsHowTo && window.initCoachToolsHowTo() },
  ];

  let activeTab = 'resources';

  function renderNav() {
    const nav = document.getElementById('coachToolsSubNav');
    if (!nav) return;
    nav.innerHTML = '';
    TABS.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gameplanChip' + (activeTab === t.key ? ' active' : '');
      btn.textContent = t.label;
      btn.addEventListener('click', () => setActiveTab(t.key));
      nav.appendChild(btn);
    });
  }

  function setActiveTab(key) {
    activeTab = key;
    TABS.forEach(t => {
      const panel = document.getElementById(t.panel);
      if (panel) panel.style.display = t.key === key ? '' : 'none';
    });
    renderNav();
    const tab = TABS.find(t => t.key === key);
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
    if (window.setSection) window.setSection('coachtools');
    else setActiveTab(key);
  };
})();

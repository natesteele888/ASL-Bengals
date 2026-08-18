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
    { key: 'stats', label: '📊 Stats', panel: 'coachStatsPanel', init: () => window.initCoachToolsStats && window.initCoachToolsStats() },
    { key: 'roster', label: '👥 Roster', panel: 'coachRosterPanel', init: () => window.initTeamRoster && window.initTeamRoster(document.getElementById('coachRosterWrap')) },
    { key: 'drivescripts', label: '🧢 Drive Scripts', panel: 'coachDriveScriptsPanel', init: () => window.initDriveBuilder && window.initDriveBuilder() },
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

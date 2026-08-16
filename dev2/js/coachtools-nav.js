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
})();

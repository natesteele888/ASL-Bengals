// ---------------------------------------------------------------------------
// Schedule top CTAs -- Games vs Practices. Nathan: "I also wants to add in
// practices to the app to - not sure they should all be together in the
// same list." Two separate lists (js/schedule.js for games,
// js/practices.js for practices/film nights), switched here instead of
// mixed into one feed -- same lazy-init-on-first-show pattern as Coach
// Tools' sub-nav (js/coachtools-nav.js).
// ---------------------------------------------------------------------------
(function () {

  const TABS = [
    { key: 'games', label: '🏈 Games', panel: 'scheduleGamesPanel', init: () => window.initSchedule && window.initSchedule() },
    { key: 'practices', label: '🏃 Practices', panel: 'schedulePracticesPanel', init: () => window.initPractices && window.initPractices() },
    { key: 'full', label: '📅 Full Schedule', panel: 'scheduleFullPanel', init: () => window.initScheduleFull && window.initScheduleFull() },
  ];

  let activeTab = 'games';

  function renderNav() {
    const nav = document.getElementById('scheduleSubNav');
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

  window.initScheduleNav = function () {
    renderNav();
    setActiveTab(activeTab);
  };
  // Used by This Week's "jump to this game" link (js/thisweek.js via
  // window.openScheduleGame in schedule.js) so landing on a specific game
  // always lands on the Games tab, even if Practices was showing.
  window.showScheduleGamesTab = function () { setActiveTab('games'); };
  window.showSchedulePracticesTab = function () { setActiveTab('practices'); };
})();

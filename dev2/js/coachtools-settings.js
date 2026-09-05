// ---------------------------------------------------------------------------
// Coach Tools > Settings -- Nathan: "Drone footage visible toggle should
// come out of Dashboard and have a new pill called settings with that and
// other toggles to turn on and off visibility to groups." Split out of
// js/coachtools-dashboard.js, which used to own the drone toggle directly.
// Intentionally a thin, dedicated home for group-visibility toggles so more
// can be added here later without cluttering the Dashboard's usage/coaching
// view.
// ---------------------------------------------------------------------------
(function () {

  // Nathan: "give me a toggle on the admin 5 click coaching gate to have a
  // toggle to show or hide drone footage from parents and players
  // accounts." See js/drone-footage.js's window.getDroneFootageVisibility/
  // setDroneFootageVisibility -- this just drives that toggle's button.
  function refreshDroneVisibilityToggle() {
    const btn = document.getElementById('coachSettingsDroneToggleBtn');
    if (!btn || !window.getDroneFootageVisibility) return;
    btn.textContent = '…';
    btn.disabled = true;
    window.getDroneFootageVisibility().then(visible => {
      btn.textContent = visible ? '✅ Visible' : '🚫 Hidden';
      btn.disabled = false;
      btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = 'Saving…';
        window.setDroneFootageVisibility(!visible, refreshDroneVisibilityToggle, msg => {
          btn.disabled = false;
          btn.textContent = 'Save failed';
          console.error('Drone visibility toggle failed:', msg);
        });
      };
    });
  }

  // Nathan (follow-up): "I would argue to keep it available long term as a
  // programmable link or destination within the setting menu. Setting
  // appears to only have 1 single thing with one setting." The
  // press-and-hold on the header logo (js/study-quiz.js) still works and
  // is staying, per Nathan's own "agreed on the gesture" -- this is a
  // second, permanent, discoverable way to reach the exact same
  // window.enterPlayerPreview() (js/auth.js), for exactly the reason
  // Nathan gave: a whole feature living ONLY behind a secret gesture is
  // easy to forget exists, and Settings had room for it.
  function wirePreviewButton() {
    const btn = document.getElementById('coachSettingsPreviewBtn');
    if (!btn) return;
    btn.onclick = () => { if (window.enterPlayerPreview) window.enterPlayerPreview(); };
  }

  window.initCoachToolsSettings = function () {
    refreshDroneVisibilityToggle();
    wirePreviewButton();
    // Nathan (6th pass on weather cancellation): "I also don't want it to
    // be in the Coach Tools section. It should be available to coaches
    // when they click into a scheduled game or practice." The manual
    // Practice Cancellation Notice form that used to live here is gone --
    // see js/practice-cancel.js's window.renderPracticeCancelSection /
    // window.renderGameCancelSection, wired into js/practices.js and
    // js/schedule.js's own detail views instead.
  };
})();

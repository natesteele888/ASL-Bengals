// Gridiron Hub — theme toggle. localStorage is fine here (this is a real
// deployed site, not a Claude artifact preview, where localStorage is
// disallowed). Applied before paint via the inline snippet in each page's
// <head> to avoid a flash of the wrong theme on load; this file just wires
// up the actual toggle button and keeps localStorage in sync.
(function () {
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.querySelector('.theme-toggle');
    if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  }
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.theme-toggle');
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current);
    if (btn) {
      btn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        localStorage.setItem('gridironHubTheme', next);
        applyTheme(next);
      });
    }
  });
})();

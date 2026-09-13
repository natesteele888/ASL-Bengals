// ============================================================
// Game HUD preview theme -- per-device only, opt-in.
//
// Visit the site once with ?preview=1 in the URL and this device (this
// browser, via localStorage -- not tied to any login/role) remembers it
// forever after, applying the .gameHudPreview class to <html> on every
// load. ?preview=0 turns it back off. Nobody else -- not other coaches,
// not any player, not the same coach on a different device -- sees
// anything different; there is no server-side flag, no account setting,
// nothing that could leak this to a kid's device by accident.
//
// Loaded FIRST, before styles.css's own stylesheet link even resolves in
// practice (it's a synchronous inline check against a tiny, already-parsed
// script), so the class is on <html> before first paint -- no flash of
// the normal theme before switching over.
// ============================================================
(function () {
  var STORAGE_KEY = 'bengalsGameHudPreview';
  var params = new URLSearchParams(location.search);

  if (params.has('preview')) {
    var on = params.get('preview') !== '0';
    try {
      if (on) localStorage.setItem(STORAGE_KEY, '1');
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    // Strip the query param so it's not sitting in the address bar / any
    // link a coach might accidentally share -- the localStorage flag is
    // what actually persists it from here on.
    params.delete('preview');
    var clean = location.pathname + (params.toString() ? '?' + params.toString() : '') + location.hash;
    history.replaceState(null, '', clean);
  }

  var enabled = false;
  try { enabled = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) {}

  if (enabled) {
    document.documentElement.classList.add('gameHudPreview');
    // Only fetched for a device with the flag on -- everyone else's page
    // load shouldn't pay for a Google Fonts request they'll never see the
    // result of.
    var fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Barlow:wght@600;700;800&display=swap';
    document.head.appendChild(fontLink);
  }

  window.isGameHudPreview = function () { return enabled; };
})();

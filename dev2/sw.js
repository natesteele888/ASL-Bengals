// Minimal service worker -- mainly here to satisfy Chrome's "installable"
// criteria for the Add to Home Screen / Install app prompt (some Android
// Chrome versions require a registered service worker with a fetch handler
// before offering a full install, not just a plain bookmark). As a side
// benefit, it caches the app shell so the study guide still opens if a
// player's on the sideline with a weak signal -- though live play data
// itself always needs a real connection to the database, same as before.
// IMPORTANT: bump this string every time index.html/BUILD_V or
// css/styles.css's ?v= gets bumped. The fetch handler below is
// network-first, but on any flaky connection (sideline wifi, cell signal
// at a field) it silently falls back to whatever shell got cached at
// *install* time -- if CACHE_NAME never changes, a phone that installed
// this PWA weeks ago can keep falling back to an ancient index.html/css
// forever and look "broken" (unstyled buttons, giant unsized images,
// missing layout) even though the live site is fully up to date. Bumping
// this forces a fresh install + activate, which deletes the old cache
// (see the activate handler) and re-caches the current shell files.
const CACHE_NAME = 'bengals-shell-20260817y';
const SHELL_FILES = [
  './index.html',
  './css/styles.css',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network-first: always try the real network (so plays/logins/edits are
// never served stale), only falling back to the cached shell if the
// network request fails outright (offline).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

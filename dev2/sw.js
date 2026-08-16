// Minimal service worker -- mainly here to satisfy Chrome's "installable"
// criteria for the Add to Home Screen / Install app prompt (some Android
// Chrome versions require a registered service worker with a fetch handler
// before offering a full install, not just a plain bookmark). As a side
// benefit, it caches the app shell so the study guide still opens if a
// player's on the sideline with a weak signal -- though live play data
// itself always needs a real connection to the database, same as before.
const CACHE_NAME = 'bengals-shell-v1';
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

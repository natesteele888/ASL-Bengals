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
const CACHE_NAME = 'bengals-shell-20260822n';
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

// Nathan: "NEW PLAY ADDED" notifications, and later "same thing for push
// notification... when drone footage has been uploaded with a link to
// the practice" (see js/whats-new.js's showLocalNotification -- fired via
// reg.showNotification when the app is opened and finds something new,
// since real background push needs a paid plan this project isn't on).
// Without this handler, tapping the notification banner itself does
// nothing on most browsers.
//
// A drone-footage notification carries data.practiceId. If there's
// already an open tab, this focuses it and postMessages the id so the
// page can jump straight to that practice (index.html listens for this
// message and calls window.openPracticeDetail). If there's no open tab,
// clients.openWindow() can't run arbitrary JS in the new page before it
// loads, so the id is appended as a ?practice= query param instead --
// player-identity.js's gate() checks for that on boot, once a session is
// confirmed, and opens the same practice that way.
// This Week's "Keys are up" notification (js/thisweek.js's saveThisWeek)
// carries data.thisWeek instead of a practiceId -- same open-tab-vs-cold-
// start split as the practiceId case just below (postMessage if a tab's
// already open, ?thisweek=1 query param if a fresh one has to be opened;
// player-identity.js's gate() reads that param back).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.practiceId
    ? `./index.html?practice=${encodeURIComponent(data.practiceId)}`
    : (data.thisWeek ? './index.html?thisweek=1' : './index.html');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (data.practiceId) client.postMessage({ type: 'openPractice', id: data.practiceId });
          else if (data.thisWeek) client.postMessage({ type: 'openThisWeek' });
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

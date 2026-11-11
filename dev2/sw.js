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
// The activate handler only deletes caches named bengals-shell-*: every
// github.io app shares one Cache Storage, so deleting everything else
// would wipe the other apps' offline copies.
const CACHE_NAME = 'bengals-shell-20261111a';
// SHELL_FILES lists bare paths, no ?v= (same as lybs-ballclub/sw.js): the
// fetch handler matches with {ignoreSearch: true}, so js/auth.js?v=20261106d
// still hits the entry cached as js/auth.js. Only CACHE_NAME has to move when
// BUILD_V does. Every script index.html loads is listed -- with only the
// three shell files, a phone with no signal got a page with none of its
// scripts. Add a script here when you add one to index.html's list.
const SHELL_FILES = [
  './index.html',
  './css/styles.css',
  './manifest.json',
  // The two header images, so the app opened with no signal isn't topped
  // by two broken-image icons.
  './assets/images/header-logo.png',
  './assets/images/bengals-wordmark.png',
  // Stat Keeper, so a coach can open it and log a game with no signal.
  // Besides itself it only loads js/play-order.js (listed below).
  './stat-keeper.html',
  './js/assignment-editor.js',
  './js/assignment-store.js',
  './js/auth.js',
  './js/ball-path-editor.js',
  './js/ball-path.js',
  './js/calendar-export.js',
  './js/call-sheet-pdf.js',
  './js/cloud-auth.js',
  './js/coaching-staff.js',
  './js/coachtools-crashcourse.js',
  './js/coachtools-dashboard.js',
  './js/coachtools-howto.js',
  './js/coachtools-nav.js',
  './js/coachtools-opponentfilm.js',
  './js/coachtools-playbuilder.js',
  './js/coachtools-playclips.js',
  './js/coachtools-print.js',
  './js/coachtools-settings.js',
  './js/coachtools-signals-admin.js',
  './js/coachtools-stats.js',
  './js/coachtools-updates.js',
  './js/depth-chart.js',
  './js/drivebuilder.js',
  './js/drone-footage.js',
  './js/edit-plays.js',
  './js/film-views.js',
  './js/film-room.js',
  './js/guide.js',
  './js/gameday-banner.js',
  './js/formation-builder.js',
  './js/formations.js',
  './js/game-stats-editor.js',
  './js/game-stats-pdf.js',
  './js/gameday.js',
  './js/gameplan-builder.js',
  './js/gameplan-pdf.js',
  './js/gameplan.js',
  './js/launch-screen.js',
  './js/nav-history.js',
  './js/opp-offense.js',
  './js/opponent-film.js',
  './js/play-calls-quiz.js',
  './js/play-calls.js',
  './js/playbook-pdf.js',
  './js/playbuilder/copy-across-formations.js',
  './js/playbuilder/defense-editor.js',
  './js/playbuilder/editor.js',
  './js/playbuilder/formation-editor.js',
  './js/playbuilder/legacy-adapter.js',
  './js/playbuilder/legacy-import.js',
  './js/playbuilder/mirror.js',
  './js/playbuilder/route-concepts.js',
  './js/playbuilder/schema.js',
  './js/playbuilder/seed-formations.js',
  './js/playbuilder/store.js',
  './js/playbuilder/sync-custom-formations.js',
  './js/play-order.js',
  './js/playcount-tracker.js',
  './js/player-identity.js',
  './js/player-profile.js',
  './js/position-crashcourse-pdf.js',
  './js/practice-cancel.js',
  './js/practices.js',
  './js/preview-theme.js',
  './js/roster.js',
  './js/schedule-full.js',
  './js/schedule-import.js',
  './js/schedule-nav.js',
  './js/schedule.js',
  './js/scout-diagrams.js',
  './js/scout-quiz.js',
  './js/shipped-defaults.js',
  './js/signals.js',
  './js/standings-scenarios.js',
  './js/standings.js',
  './js/statkeeper-import.js',
  './js/study-guide.js',
  './js/study-quiz.js',
  './js/thisweek.js',
  './js/two-minute-drill.js',
  './js/weather.js',
  './js/whats-new.js',
];

self.addEventListener('install', (event) => {
  // No .catch(): addAll is all-or-nothing, so if one file fails on a flaky
  // connection the phone keeps the previous, complete worker and retries
  // later, instead of switching to a half-empty cache.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n.startsWith('bengals-shell-') && n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Network-first: always try the real network (so plays/logins/edits are
// never served stale). If it hasn't answered in 2.5s (a weak sideline
// signal can hang a long time before failing), use the cached copy; if
// nothing is cached, keep waiting on the network.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Opening the app by its bare /dev2/ address, or index.html with any
  // ?practice= / ?thisweek= link, uses the one cached index.html. Other
  // pages in this folder (stat-keeper.html...) keep their own entry.
  const path = new URL(event.request.url).pathname;
  const isAppPage = event.request.mode === 'navigate' && (path.endsWith('/') || path.endsWith('/index.html'));
  const cacheKey = isAppPage ? './index.html' : event.request;
  event.respondWith((async () => {
    const networkPromise = fetch(event.request).catch(() => null);
    const early = await Promise.race([networkPromise, timeout(2500)]);
    if (early) return early;
    const cached = await caches.match(cacheKey, { ignoreSearch: true });
    if (cached) return cached;
    const late = await networkPromise;
    return late || Response.error();
  })());
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

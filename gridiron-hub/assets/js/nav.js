// Gridiron Hub — shared nav, injected into every page's <div id="nav-root">.
// This exists because 13 of 15 pages had silently drifted out of sync with
// each other (missing links, fake/hardcoded auth state) -- one nav built in
// one place, used everywhere, makes that class of bug structurally
// impossible instead of something to remember to keep in sync by hand.
//
// Each page sets two globals BEFORE including this script:
//   window.NAV_DEPTH   = 0 (root files) or 1 (about/, programs/, resources/)
//   window.NAV_CURRENT = 'home' | 'schedule' | 'teams' | 'photos' | '' (blank = no highlight)

const DEPTH = window.NAV_DEPTH || 0;
const P = DEPTH === 0 ? '' : '../'.repeat(DEPTH);
const CURRENT = window.NAV_CURRENT || '';

function cur(key) { return CURRENT === key ? ' class="current"' : ''; }

const navHtml = `
  <div class="wrap">
    <div class="nav-brand"><img src="${P}assets/img/tiger-logo.png" alt=""><span>GRIDIRON HUB</span></div>
    <div class="nav-links">
      <a href="${P}index.html"${cur('home')}>Home</a>
      <a href="${P}schedule.html"${cur('schedule')}>Schedule</a>
      <a href="${P}teams.html"${cur('teams')}>Teams</a>
      <a href="${P}photos.html"${cur('photos')}>Photos</a>
      <div class="navdrop">
        <span>About</span>
        <div class="navdrop-menu">
          <a href="${P}about/about.html">About The Bengals</a>
          <a href="${P}about/board.html">Board of Directors</a>
          <a href="${P}about/facilities.html">Our Facilities</a>
        </div>
      </div>
      <div class="navdrop">
        <span>Football &amp; Cheer</span>
        <div class="navdrop-menu">
          <a href="${P}programs/flex-football.html">Flex</a>
          <a href="${P}programs/tackle-football.html">Tackle</a>
          <a href="${P}programs/cheer.html">Cheer</a>
        </div>
      </div>
      <div class="navdrop">
        <span>Resources</span>
        <div class="navdrop-menu">
          <a href="${P}resources/for-coaches.html">For Coaches</a>
          <a href="${P}resources/for-parents.html">For Parents</a>
          <a href="${P}resources/sponsors.html">Sponsors</a>
        </div>
      </div>
      <button class="theme-toggle" aria-label="Toggle theme"></button>
      <span id="navAuthSlot"></span>
    </div>
  </div>
`;

const rootEl = document.getElementById('nav-root');
if (rootEl) rootEl.innerHTML = navHtml;

// Auth state is real here (imports the actual Firebase SDK) -- this
// replaces every page's previous static/fake "you@example.com" text with
// whichever account is actually signed in, or a real Sign In link if not.
import(`${P}src/firebase-config.js`).then(({ auth }) => {
  import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js').then(({ onAuthStateChanged, signOut }) => {
    onAuthStateChanged(auth, (user) => {
      const slot = document.getElementById('navAuthSlot');
      if (!slot) return;
      if (user) {
        slot.innerHTML = `<span class="nav-user-email">${user.email}</span><button class="nav-signout-btn">Sign Out</button>`;
        slot.querySelector('.nav-signout-btn').addEventListener('click', () => signOut(auth));
      } else {
        slot.innerHTML = `<a href="${P}login.html" class="nav-cta">Sign In</a>`;
      }
    });
  });
});

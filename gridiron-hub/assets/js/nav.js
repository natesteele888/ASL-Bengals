// Gridiron Hub — shared nav, injected into every page's <div id="nav-root">.
// One nav built in one place, used everywhere -- eliminates the class of
// bug where pages silently drift out of sync (missing links, stale auth
// state). Also the single point where a mobile-menu fix reaches all 14
// pages at once, which is the whole reason this exists as a shared file
// rather than copy-pasted per page.
//
// Each page sets two globals BEFORE including this script:
//   window.NAV_DEPTH   = 0 (root files) or 1 (about/, programs/, resources/)
//   window.NAV_CURRENT = 'home' | 'schedule' | 'watch' | 'teams' | 'photos' | 'faq' | '' (blank = no highlight)

const DEPTH = window.NAV_DEPTH || 0;
const P = DEPTH === 0 ? '' : '../'.repeat(DEPTH);
const CURRENT = window.NAV_CURRENT || '';

function cur(key) { return CURRENT === key ? ' class="current"' : ''; }

const navHtml = `
  <div class="wrap">
    <a href="${P}index.html" class="nav-brand"><img src="${P}assets/img/tiger-logo.png" alt=""><span>GRIDIRON HUB</span></a>
    <button class="nav-hamburger" id="navHamburger" aria-label="Menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-links" id="navLinks">
      <a href="${P}index.html"${cur('home')}>Home</a>
      <a href="${P}schedule.html"${cur('schedule')}>Schedule</a>
      <a href="${P}watch-live.html"${cur('watch')} style="color:#ff4444;">🔴 Watch Live</a>
      <a href="${P}teams.html"${cur('teams')}>Teams</a>
      <a href="${P}photos.html"${cur('photos')}>Photos</a>
      <div class="navdrop">
        <span class="navdrop-label">About</span>
        <div class="navdrop-menu">
          <a href="${P}about/about.html">About The Bengals</a>
          <a href="${P}about/board.html">Board of Directors</a>
          <a href="${P}about/facilities.html">Our Facilities</a>
        </div>
      </div>
      <div class="navdrop">
        <span class="navdrop-label">Football &amp; Cheer</span>
        <div class="navdrop-menu">
          <a href="${P}programs.html" style="font-weight:800;border-bottom:1px solid var(--line);margin-bottom:4px;padding-bottom:10px;">All Programs</a>
          <a href="${P}programs/flex-football.html">Flex</a>
          <a href="${P}programs/tackle-football.html">Tackle</a>
          <a href="${P}programs/cheer.html">Cheer</a>
        </div>
      </div>
      <div class="navdrop">
        <span class="navdrop-label">Resources</span>
        <div class="navdrop-menu">
          <a href="${P}resources/for-coaches.html">For Coaches</a>
          <a href="${P}resources/for-parents.html">For Parents</a>
          <a href="${P}resources/sponsors.html">Sponsors</a>
        </div>
      </div>
      <a href="${P}faq.html"${cur('faq')}>FAQ</a>
      <div class="nav-links-footer">
        <button class="theme-toggle" aria-label="Toggle theme"></button>
        <span id="navAuthSlot"></span>
      </div>
    </div>
  </div>
`;

const rootEl = document.getElementById('nav-root');
if (rootEl) rootEl.innerHTML = navHtml;

// Hamburger toggle -- shows/hides the whole panel on mobile. Harmless no-op
// on desktop since .nav-links is always visible there regardless of this class.
const hamburger = document.getElementById('navHamburger');
const navLinks = document.getElementById('navLinks');
if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('mobile-open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
}

// Dropdown sections (About / Football & Cheer / Resources) rely on :hover
// on desktop, which doesn't exist on touch -- click-to-expand handles both
// mobile (menu open, tap a section) and any touch-desktop hybrid, without
// interfering with the existing hover behavior on real desktop.
document.querySelectorAll('.navdrop-label').forEach(label => {
  label.addEventListener('click', () => {
    const drop = label.closest('.navdrop');
    const wasOpen = drop.classList.contains('mobile-drop-open');
    document.querySelectorAll('.navdrop').forEach(d => d.classList.remove('mobile-drop-open'));
    if (!wasOpen) drop.classList.add('mobile-drop-open');
  });
});

// Tapping any real link inside the mobile panel closes it -- otherwise the
// menu stays open over the new page after navigation.
navLinks?.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    navLinks.classList.remove('mobile-open');
    hamburger?.classList.remove('open');
  });
});

// Auth state is real here (imports the actual Firebase SDK) -- shows
// whichever account is actually signed in, or a real Sign In link if not.
// Signed-in users also get a quiet extra Firestore read of their own
// profile, purely to decide whether to show the Admin link -- the real
// gate is firestore.rules, this is just so an admin doesn't have to know
// the URL by heart.
//
// This used to be `${P}src/firebase-config.js` -- a bare specifier
// (nothing before "src"), which is invalid per the ES module spec outside
// an import map and silently throws instead of resolving. That broke
// nav.js's auth state entirely on every page (console error, caught
// nowhere); login.html and dashboard.html had the same bug in their own
// separate imports, fixed alongside this one, which meant sign-in itself
// never actually worked. Also note this is a *dynamic* import inside an
// external file, so -- unlike an inline <script type="module"> in the
// page itself -- it resolves relative to nav.js's own location
// (assets/js/), not the including page, regardless of page depth. Hence
// a fixed "../../" here rather than reusing P, which exists only for the
// page-relative href attributes in the nav markup above.
import('../../src/firebase-config.js').then(({ auth, db }) => {
  Promise.all([
    import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js'),
  ]).then(([{ onAuthStateChanged, signOut }, { doc, getDoc }]) => {
    onAuthStateChanged(auth, async (user) => {
      const slot = document.getElementById('navAuthSlot');
      if (!slot) return;
      if (user) {
        let isAdmin = false;
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          isAdmin = snap.exists() && snap.data().role === 'admin';
        } catch (e) { /* rules not deployed yet, or offline -- just skip the link */ }
        slot.innerHTML =
          (isAdmin ? `<a href="${P}admin.html" class="nav-cta" style="background:none;border:1px solid var(--line);color:var(--text-dim);">Admin</a>` : '') +
          `<span class="nav-user-email">${user.email}</span><button class="nav-signout-btn">Sign Out</button>`;
        slot.querySelector('.nav-signout-btn').addEventListener('click', () => signOut(auth));
      } else {
        slot.innerHTML = `<a href="${P}login.html" class="nav-cta">Sign In</a>`;
      }
    });
  });
});

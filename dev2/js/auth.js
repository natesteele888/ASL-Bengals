/* ============================================================
   WELCOME / CRASH-COURSE POPUP — Nathan: "the app update screen is
   far too little. The kids haven't seen the play calls at all or
   the play quiz. They need a crash course for using it. Both
   shotgun and split formations." A short multi-step walkthrough
   (same look/mechanics as the in-app Play Calls "i" tutorial, just
   its own instance) covering what's new, Play Calls in Shotgun,
   Play Calls in Split, and Play Quiz. Shows once (ever, per
   device/browser) on top of whatever screen the page lands on --
   login screen for new/signed-out visitors, or straight over the
   app for anyone already logged in on this device from before this
   shipped. Purely informational: dismissing just sets a flag.
   ============================================================ */
(function(){
  var SEEN_KEY = 'bengalsWhatsNewSeen';
  var overlay = document.getElementById('welcomeOverlay');
  var stepsEl = document.getElementById('welcomeTutorialSteps');
  var dotsEl = document.getElementById('welcomeTutorialDots');
  var backBtn = document.getElementById('welcomeTutorialBackBtn');
  var nextBtn = document.getElementById('welcomeTutorialNextBtn');
  if(!overlay || !stepsEl || !dotsEl || !backBtn || !nextBtn) return;

  var steps = [].slice.call(stepsEl.querySelectorAll('.pcTutorialStep'));
  steps.forEach(function(){
    var d = document.createElement('div');
    d.className = 'pcTutorialDot';
    dotsEl.appendChild(d);
  });
  var dots = [].slice.call(dotsEl.children);
  var index = 0;

  function showStep(i){
    index = i;
    steps.forEach(function(el, idx){ el.classList.toggle('active', idx === i); });
    dots.forEach(function(d, idx){ d.classList.toggle('active', idx === i); });
    backBtn.disabled = i === 0;
    nextBtn.textContent = i === steps.length - 1 ? "Let's go!" : 'Next';
  }

  function alreadySeen(){
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch(e) { return false; }
  }
  function dismiss(){
    overlay.classList.remove('show');
    try { localStorage.setItem(SEEN_KEY, '1'); } catch(e) {}
  }

  showStep(0);
  if(!alreadySeen()){
    overlay.classList.add('show');
  }

  backBtn.addEventListener('click', function(){
    if(index > 0) showStep(index - 1);
  });
  nextBtn.addEventListener('click', function(){
    if(index < steps.length - 1) showStep(index + 1);
    else dismiss();
  });
})();

/* ============================================================
   BACKGROUND MUSIC — mellow loop, mute toggle in the corner,
   preference remembered per device.
   ============================================================ */
(function(){
  var BG_MUTE_KEY = 'bengalsBgMusicMuted';
  var bgMusic = document.getElementById('bgMusic');
  var muteBtn = document.getElementById('muteBtn');
  var topToolbar = document.getElementById('topToolbar');

  function isMutedPref(){
    try { return localStorage.getItem(BG_MUTE_KEY) === '1'; } catch(e) { return false; }
  }
  function updateMuteIcon(){
    muteBtn.textContent = bgMusic.muted ? '🔇' : '🔊';
  }
  window.startBgMusic = function(){
    bgMusic.muted = isMutedPref();
    bgMusic.volume = 0;
    bgMusic.play().catch(function(){});
    topToolbar.style.display = 'flex';
    updateMuteIcon();
    // Fade the music up gradually over the same span as the roar clip, so it
    // swells in as the roar fades out instead of both hitting full volume at once.
    var target = 0.8;
    var duration = 3400;
    var steps = 34;
    var count = 0;
    var fadeTimer = setInterval(function(){
      count++;
      bgMusic.volume = Math.min(target, (target/steps)*count);
      if(count >= steps) clearInterval(fadeTimer);
    }, duration/steps);
  };
  muteBtn.addEventListener('click', function(){
    bgMusic.muted = !bgMusic.muted;
    try { localStorage.setItem(BG_MUTE_KEY, bgMusic.muted ? '1' : '0'); } catch(e) {}
    updateMuteIcon();
  });

  // Browsers can block autoplay-with-sound on a fresh page load even for a
  // returning (already-logged-in) user, since the login click happened on a
  // previous visit, not this one. Fall back to starting on first interaction.
  function resumeIfBlocked(){
    if(bgMusic.paused && topToolbar.style.display !== 'none'){
      bgMusic.play().catch(function(){});
    }
  }
  document.addEventListener('click', resumeIfBlocked, { once: true });
  document.addEventListener('touchstart', resumeIfBlocked, { once: true });
})();

/* ============================================================
   DARK MODE — toggle in the corner, preference remembered per
   device. The actual "apply before paint" step lives in a tiny
   inline <script> right after <body> in index.html (so a returning
   dark-mode user never sees a flash of the light theme); this just
   wires the toggle button and keeps the icon in sync.
   ============================================================ */
(function(){
  var THEME_KEY = 'bengalsTheme';
  var themeBtn = document.getElementById('themeToggleBtn');
  if(!themeBtn) return;

  function isDark(){ return document.documentElement.getAttribute('data-theme') === 'dark'; }
  // title used to always read "Dark mode" even once already in dark mode,
  // where clicking it actually switches back to light -- keep it in sync
  // with the icon instead.
  function updateIcon(){
    themeBtn.textContent = isDark() ? '☀️' : '🌙';
    themeBtn.title = isDark() ? 'Light mode' : 'Dark mode';
  }
  updateIcon();

  themeBtn.addEventListener('click', function(){
    var next = !isDark();
    if(next){ document.documentElement.setAttribute('data-theme', 'dark'); }
    else { document.documentElement.removeAttribute('data-theme'); }
    try { localStorage.setItem(THEME_KEY, next ? 'dark' : 'light'); } catch(e) {}
    updateIcon();
  });
})();

(function(){
  var CODE_HASH = '225da58fbc98dacc1b5ced08e9cb5a7e82cb3a4ae07d554e546e50ec62b356f8';
  var COACH_CODE_HASH = 'fde7fd37696f9bc49c1e13a1dae70923a5ef1dec148e1ce16d5136519dac162d';
  window.isCoachSession = false;
  var STORAGE_KEY = 'bengalsPlaybookAuthed';
  var LOCKOUT_KEY = 'bengalsPlaybookLockout';
  var MAX_ATTEMPTS = 5;
  var LOCKOUT_MS = 30000;

  var screenEl = document.getElementById('loginScreen');
  var contentEl = document.querySelector('.loginContent');
  var inputEl = document.getElementById('loginCode');
  var btnEl = document.getElementById('loginBtn');
  var errorEl = document.getElementById('loginError');
  var attempts = 0;
  var lockTimer = null;

  try {
    // Only auto-skip the code screen if this device both (a) was
    // remembered as logged-in before, AND (b) already has a real gate
    // session saved (cloud-auth.js). (b) will be missing exactly once,
    // for anyone who logged in before this file shipped -- their old
    // "remembered" flag has nothing real backing it, so they fall through
    // to the visible login screen below and re-enter their code one more
    // time, which establishes the real session going forward.
    if(localStorage.getItem(STORAGE_KEY) === '1' && window.hasGateSession && window.hasGateSession()){
      screenEl.classList.add('hide'); window.startBgMusic();
      if(localStorage.getItem('bengalsCoachSession') === '1'){
        window.isCoachSession = true;
      }
      if(window.__resolveBengalsAuth) window.__resolveBengalsAuth();
      // This runs the instant auth.js executes, before the later scripts
      // (including player-identity.js) have necessarily finished loading --
      // poll briefly rather than assume a fixed delay is always enough.
      (function waitForPlayerIdentity(){
        if(window.PlayerIdentity){ window.PlayerIdentity.gate(function(){ maybeShowTips(); }); }
        else setTimeout(waitForPlayerIdentity, 50);
      })();
    }
  } catch(e) {}

  async function sha256Hex(text){
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
  }
  // Shared with play-calls.js (FrontSeat gate) and study-quiz.js (admin PIN)
  // so those secrets can be hashed the same way instead of sitting as
  // plaintext in the shipped JS.
  window.sha256Hex = sha256Hex;
  function setLocked(msRemaining){
    inputEl.disabled = true; btnEl.disabled = true;
    var secs = Math.ceil(msRemaining/1000);
    errorEl.textContent = 'Too many attempts — try again in ' + secs + 's.';
    clearTimeout(lockTimer);
    lockTimer = setTimeout(function(){
      var left = getLockRemaining();
      if(left > 0){ setLocked(left); } else { clearLock(); }
    }, 1000);
  }
  function clearLock(){
    inputEl.disabled = false; btnEl.disabled = false;
    errorEl.textContent = '';
    attempts = 0;
    try { localStorage.removeItem(LOCKOUT_KEY); } catch(e) {}
  }
  function getLockRemaining(){
    try {
      var until = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10);
      return Math.max(0, until - Date.now());
    } catch(e) { return 0; }
  }
  (function checkExistingLock(){
    var left = getLockRemaining();
    if(left > 0) setLocked(left);
  })();

  async function attemptLogin(){
    if(inputEl.disabled) return;
    if(!window.crypto || !window.crypto.subtle){
      errorEl.textContent = 'This browser can\'t verify the code securely — try a modern browser over https.';
      return;
    }
    var hash = await sha256Hex(inputEl.value);
    if(hash === CODE_HASH || hash === COACH_CODE_HASH){
      var isCoach = hash === COACH_CODE_HASH;
      // Establish a real, non-anonymous Firebase session tied to this
      // code before doing anything else -- the database rules now
      // require this for the actual play/card data, so if this fails
      // (e.g. offline), treat it the same as a wrong code rather than
      // showing an app that will silently fail to load its data.
      try {
        await window.signInWithGate(isCoach ? 'coach' : 'player', hash);
      } catch(gateErr) {
        console.error('Gate sign-in failed:', gateErr);
        errorEl.textContent = "Couldn't verify that code right now -- check your connection and try again.";
        inputEl.value = '';
        inputEl.focus();
        return;
      }
      if(isCoach){
        window.isCoachSession = true;
        try { localStorage.setItem('bengalsCoachSession', '1'); } catch(e) {}
        var epBtn2 = document.getElementById('editPlaysTabBtn');
        if (epBtn2) epBtn2.style.display = '';
      }
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch(e) {}
      if(window.__resolveBengalsAuth) window.__resolveBengalsAuth();
      try {
        var roar = document.getElementById('roarSound');
        roar.currentTime = 0;
        roar.play().catch(function(){});
      } catch(e) {}
      screenEl.classList.add('fadeOut');
      window.startBgMusic();
      setTimeout(function(){
        screenEl.classList.add('hide');
        // player-identity.js now finishes loading later than before (it
        // waits behind the database data fetch), so don't assume it's
        // ready the instant this fires -- poll briefly, same pattern as
        // the "already logged in" fast path above.
        (function waitForPlayerIdentity(){
          if(window.PlayerIdentity){ window.PlayerIdentity.gate(function(){ maybeShowTips(); }); }
          else setTimeout(waitForPlayerIdentity, 50);
        })();
      }, 1500);
    } else {
      attempts++;
      inputEl.value = '';
      if(attempts >= MAX_ATTEMPTS){
        var until = Date.now() + LOCKOUT_MS;
        try { localStorage.setItem(LOCKOUT_KEY, String(until)); } catch(e) {}
        setLocked(LOCKOUT_MS);
      } else {
        errorEl.textContent = 'Incorrect code — try again.';
        inputEl.focus();
      }
      contentEl.classList.remove('shake');
      void contentEl.offsetWidth;
      contentEl.classList.add('shake');
    }
  }
  btnEl.addEventListener('click', attemptLogin);
  inputEl.addEventListener('keydown', function(e){ if(e.key === 'Enter') attemptLogin(); });
if (window.isCoachSession) {
    var epBtn = document.getElementById('editPlaysTabBtn');
    if (epBtn) epBtn.style.display = '';
  }
})();

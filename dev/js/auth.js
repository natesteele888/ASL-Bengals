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
    if(localStorage.getItem(STORAGE_KEY) === '1'){
      screenEl.classList.add('hide'); window.startBgMusic(); setTimeout(function(){ maybeShowTips(); }, 400);
      if(localStorage.getItem('bengalsCoachSession') === '1'){
        window.isCoachSession = true;
      }
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
      if(hash === COACH_CODE_HASH){
        window.isCoachSession = true;
        try { localStorage.setItem('bengalsCoachSession', '1'); } catch(e) {}
        var epBtn2 = document.getElementById('editPlaysTabBtn');
        if (epBtn2) epBtn2.style.display = '';
      }
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch(e) {}
      try {
        var roar = document.getElementById('roarSound');
        roar.currentTime = 0;
        roar.play().catch(function(){});
      } catch(e) {}
      screenEl.classList.add('fadeOut');
      window.startBgMusic();
      setTimeout(function(){ screenEl.classList.add('hide'); maybeShowTips(); }, 1500);
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

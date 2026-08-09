/* ============================================================
   PLAYER IDENTITY -- name + 4-digit code, required for everyone (players
   and coaches alike) right after the site login, so every session in the
   app is tied to a real person instead of being anonymous. No email, no
   password reset flow, just a short code a kid can remember -- same
   spirit as the rest of this app. Reuses the same SHA-256-hash-on-device
   pattern as the login/admin gates (window.sha256Hex from auth.js) and
   the same anonymous-auth'd Firebase calls as everything else
   (window.firebaseAuthed).

   dev2-only: player records live under a "dev2Players" path, kept
   separate from anything that will eventually ship to the real dev/
   site, so test sign-ins during development never touch real data.
   See dev/tools/play-calls-quiz/PLAN.md for the full design.

   Exposes window.PlayerIdentity.gate(onReady): call this once, right
   after the site login screen is dismissed. If someone's already
   identified on this device, onReady() runs immediately. Otherwise this
   shows a full-screen, non-dismissable "who's playing?" screen and only
   calls onReady() once they've signed in or signed up -- nothing else
   in the app is usable until then.
   ============================================================ */
(function(){
  const PLAYERS_PATH = 'dev2Players';
  const SESSION_KEY = 'bengalsPlayerSession'; // { playerId, name }

  function getSession(){
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch(e){ return null; }
  }
  function setSession(session){
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch(e){}
  }
  function clearSession(){
    try { localStorage.removeItem(SESSION_KEY); } catch(e){}
  }

  async function fetchAllPlayers(){
    const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}.json`);
    const res = await fetch(url);
    if(!res.ok) return {};
    const data = await res.json();
    return data || {};
  }

  async function findByName(name){
    const all = await fetchAllPlayers();
    const needle = name.trim().toLowerCase();
    return Object.keys(all)
      .filter(id => (all[id].name || '').trim().toLowerCase() === needle)
      .map(id => Object.assign({id: id}, all[id]));
  }

  async function createPlayer(name, pinHash, isCoach){
    const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}.json`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        name: name, pinHash: pinHash, isCoach: !!isCoach,
        createdAt: new Date().toISOString(), lastSeen: new Date().toISOString(),
      }),
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.name; // Firebase's POST response key is the generated push ID
  }

  // Fire-and-forget -- so a session-resume or a fresh sign-in never blocks
  // on this, but the admin view still has a real "who's actually using it"
  // signal to show, not just "who signed up once."
  function touchLastSeen(playerId){
    window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}/${playerId}.json`)
      .then(url => fetch(url, {
        method: 'PATCH',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ lastSeen: new Date().toISOString() }),
      }))
      .catch(() => {}); // best-effort; not being able to log a timestamp shouldn't block anyone
  }

  // ---- UI wiring (full-screen mandatory overlay, same treatment as the
  // site login screen) ----
  const screenEl = document.getElementById('playerIdScreen');
  const nameInput = document.getElementById('playerIdNameInput');
  const pinInput = document.getElementById('playerIdPinInput');
  const errorEl = document.getElementById('playerIdError');
  const btnEl = document.getElementById('playerIdBtn');
  const badgeNameEl = document.getElementById('playerIdBadgeName');
  const switchBtn = document.getElementById('playerIdSwitchBtn');

  function showOverlay(){
    nameInput.value = '';
    pinInput.value = '';
    errorEl.style.display = 'none';
    screenEl.classList.remove('hide');
    setTimeout(() => nameInput.focus(), 50);
  }
  function hideOverlay(){
    screenEl.classList.add('hide');
  }
  function updateBadge(name){
    if(badgeNameEl) badgeNameEl.textContent = name;
  }

  let pendingReady = null;

  async function attemptSignIn(){
    const name = nameInput.value.trim();
    const pin = pinInput.value.trim();
    errorEl.style.display = 'none';
    if(!name){ errorEl.textContent = 'Type your name first.'; errorEl.style.display = 'block'; return; }
    if(!/^\d{4}$/.test(pin)){ errorEl.textContent = 'Code needs to be 4 digits.'; errorEl.style.display = 'block'; return; }
    btnEl.disabled = true;
    btnEl.textContent = 'Checking…';
    try {
      const pinHash = await window.sha256Hex(pin);
      const matches = await findByName(name);
      let session;
      if(matches.length === 0){
        // Brand new player (or coach) -- create the profile with this name+code.
        const playerId = await createPlayer(name, pinHash, window.isCoachSession);
        session = { playerId: playerId, name: name };
      } else {
        const match = matches.find(m => m.pinHash === pinHash);
        if(!match){
          errorEl.textContent = 'That name is already taken with a different code. Double check your code, or use a slightly different name (e.g. add your last initial).';
          errorEl.style.display = 'block';
          btnEl.disabled = false;
          btnEl.textContent = 'Continue';
          return;
        }
        session = { playerId: match.id, name: match.name };
        touchLastSeen(match.id);
      }
      setSession(session);
      updateBadge(session.name);
      hideOverlay();
      if(pendingReady){ const cb = pendingReady; pendingReady = null; cb(); }
    } catch(e){
      errorEl.textContent = 'Could not reach the team server -- check your connection and try again.';
      errorEl.style.display = 'block';
      console.error('Player sign-in failed:', e);
    } finally {
      btnEl.disabled = false;
      btnEl.textContent = 'Continue';
    }
  }

  btnEl.addEventListener('click', attemptSignIn);
  pinInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') attemptSignIn(); });
  nameInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') pinInput.focus(); });
  if(switchBtn){
    switchBtn.addEventListener('click', () => {
      if(!confirm('Switch player? You\'ll need to sign in again.')) return;
      clearSession();
      window.location.reload();
    });
  }

  // ---- The mandatory gate ----
  function gate(onReady){
    const session = getSession();
    if(session && session.name){
      updateBadge(session.name);
      touchLastSeen(session.playerId);
      onReady();
      return;
    }
    pendingReady = onReady;
    showOverlay();
  }

  window.PlayerIdentity = { getSession, setSession, clearSession, fetchAllPlayers, gate };
})();

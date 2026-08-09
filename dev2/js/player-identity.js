/* ============================================================
   PLAYER IDENTITY -- name + 4-digit code, so Play Calls Quiz points
   can follow a player across visits and devices without a real
   account system. Same spirit as the rest of the app: no email, no
   password reset flow, just a short code a kid can remember. Reuses
   the same SHA-256-hash-on-device pattern as the login/admin gates
   (window.sha256Hex from auth.js) and the same anonymous-auth'd
   Firebase calls as everything else (window.firebaseAuthed).

   dev2-only: player records live under a "dev2Players" path, kept
   separate from anything that will eventually ship to the real dev/
   site, so test sign-ins during development never touch real data.
   See dev/tools/play-calls-quiz/PLAN.md for the full design.
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

  async function createPlayer(name, pinHash){
    const url = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${PLAYERS_PATH}.json`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name: name, pinHash: pinHash, createdAt: new Date().toISOString() }),
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.name; // Firebase's POST response key is the generated push ID
  }

  // ---- UI wiring ----
  const signInEl = document.getElementById('pcqSignIn');
  const signedInEl = document.getElementById('pcqSignedIn');
  const nameInput = document.getElementById('pcqNameInput');
  const pinInput = document.getElementById('pcqPinInput');
  const errorEl = document.getElementById('pcqSignInError');
  const signInBtn = document.getElementById('pcqSignInBtn');
  const playerNameEl = document.getElementById('pcqPlayerName');
  const switchBtn = document.getElementById('pcqSwitchPlayerBtn');

  function showSignedIn(name){
    playerNameEl.textContent = name;
    signInEl.style.display = 'none';
    signedInEl.style.display = '';
  }
  function showSignIn(){
    nameInput.value = '';
    pinInput.value = '';
    errorEl.style.display = 'none';
    signInEl.style.display = '';
    signedInEl.style.display = 'none';
  }

  function refreshFromSession(){
    const session = getSession();
    if(session && session.name) showSignedIn(session.name);
    else showSignIn();
  }

  async function attemptSignIn(){
    const name = nameInput.value.trim();
    const pin = pinInput.value.trim();
    errorEl.style.display = 'none';
    if(!name){ errorEl.textContent = 'Type your name first.'; errorEl.style.display = 'block'; return; }
    if(!/^\d{4}$/.test(pin)){ errorEl.textContent = 'Code needs to be 4 digits.'; errorEl.style.display = 'block'; return; }
    signInBtn.disabled = true;
    signInBtn.textContent = 'Checking…';
    try {
      const pinHash = await window.sha256Hex(pin);
      const matches = await findByName(name);
      if(matches.length === 0){
        // Brand new player -- create the profile with this name+code.
        const playerId = await createPlayer(name, pinHash);
        setSession({ playerId: playerId, name: name });
        showSignedIn(name);
      } else {
        const match = matches.find(m => m.pinHash === pinHash);
        if(match){
          setSession({ playerId: match.id, name: match.name });
          showSignedIn(match.name);
        } else {
          errorEl.textContent = 'That name is already taken with a different code. Double check your code, or use a slightly different name (e.g. add your last initial).';
          errorEl.style.display = 'block';
        }
      }
    } catch(e){
      errorEl.textContent = 'Could not reach the team server -- check your connection and try again.';
      errorEl.style.display = 'block';
      console.error('Player sign-in failed:', e);
    } finally {
      signInBtn.disabled = false;
      signInBtn.textContent = 'Continue';
    }
  }

  signInBtn.addEventListener('click', attemptSignIn);
  pinInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') attemptSignIn(); });
  nameInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') pinInput.focus(); });
  switchBtn.addEventListener('click', () => { clearSession(); showSignIn(); nameInput.focus(); });

  refreshFromSession();

  // Exposed for the quiz engine (Phase 2) and points plumbing (Phase 3) to
  // read who's currently signed in without re-implementing any of this.
  window.PlayerIdentity = { getSession, setSession, clearSession, fetchAllPlayers };
})();

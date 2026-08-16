/* ============================================================
   Firebase Auth -- two modes.

   1) Anonymous (legacy): every visitor silently signed in on page load,
      before they've proven they know any access code. Kept only so
      pre-login cloud calls (if any) don't hard-fail; the database rules
      no longer trust anonymous sessions with anything sensitive.

   2) Gate sign-in (real): once someone types the correct team/coach
      access code (checked by auth.js against CODE_HASH/COACH_CODE_HASH,
      same as before), we sign them into a real, non-anonymous Firebase
      account tied to that code -- window.signInWithGate(kind, hash) below.
      The "password" for that account IS the SHA-256 hash auth.js already
      computed for the local compare, so the plaintext code itself is
      never sent anywhere or stored; only someone who can reproduce that
      exact hash (i.e. someone who knows the real code) can ever sign in
      again. The account is created automatically the first time this
      runs after this file shipped (EMAIL_NOT_FOUND -> sign up instead of
      sign in) -- no manual Firebase console step needed to bootstrap it.

      Database rules key off auth.token.firebase.sign_in_provider to tell
      a gate session ('password') apart from a throwaway anonymous one
      ('anonymous'): see the Realtime Database rules, not this file, for
      the actual enforcement.

   Uses Firebase's plain REST endpoints (Identity Toolkit) rather than the
   full Firebase JS SDK, to stay consistent with the rest of this app,
   which is a no-build-step static site that talks to the Realtime
   Database with plain fetch() calls.

   Exposes:
     window.getFirebaseIdToken()   -- async, resolves to a currently-valid
       ID token, preferring a saved gate session, refreshing/signing in
       as needed.
     window.firebaseAuthed(url)    -- async, returns the given Firebase
       Realtime Database URL with "?auth=<token>" (or "&auth=..." if the
       URL already has a query string) appended, ready to fetch().
     window.signInWithGate(kind, passwordHash) -- async, kind is 'player'
       or 'coach'. Called by auth.js right after a correct code is typed.
     window.hasGateSession() -- sync, true if this device already has a
       real (non-anonymous) session saved, so auth.js knows whether it's
       safe to skip straight past the login screen.
   ============================================================ */
(function(){
  // Firebase Web API key -- this is a *public* identifier, not a secret.
  // Google's own docs say it's safe to ship in client-side code: actual
  // access control is enforced by the Realtime Database security rules,
  // not by hiding this key. It only identifies which Firebase project a
  // request belongs to.
  const FIREBASE_API_KEY = 'AIzaSyCBvobt9qfyLoJOGUz6fIiGrFKMEQFsA3E';
  const SIGNUP_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
  const SIGNIN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
  const REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
  // Refresh a little before actual expiry so an in-flight request never
  // gets built with a token that expires mid-flight.
  const SAFETY_MARGIN_MS = 60000;

  // Fixed, meaningless addresses -- one per gate. Not real inboxes; just a
  // stable identity for "whoever currently knows the team code" vs
  // "whoever currently knows the coach code" to sign into.
  const GATE_EMAILS = {
    player: 'player-gate@aslbengals.internal',
    coach: 'coach-gate@aslbengals.internal',
  };
  const GATE_SESSION_KEY = 'bengalsGateSession'; // {refreshToken, kind} in localStorage

  let cached = null;   // { idToken, refreshToken, expiresAt, kind? }
  let inFlight = null; // Promise<cached>, shared so concurrent callers
                        // (e.g. several cloudFetch calls firing at once)
                        // don't each trigger their own sign-in/refresh.

  function loadGateSession(){
    try { return JSON.parse(localStorage.getItem(GATE_SESSION_KEY) || 'null'); }
    catch(e){ return null; }
  }
  function saveGateSession(refreshToken, kind){
    try { localStorage.setItem(GATE_SESSION_KEY, JSON.stringify({refreshToken, kind})); }
    catch(e){}
  }
  window.hasGateSession = function(){
    const s = loadGateSession();
    return !!(s && s.refreshToken);
  };

  async function signInAnonymously(){
    const res = await fetch(SIGNUP_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({returnSecureToken: true}),
    });
    if(!res.ok) throw new Error('Anonymous sign-in failed: HTTP ' + res.status);
    const data = await res.json();
    return {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + (Number(data.expiresIn) * 1000),
    };
  }

  async function refreshIdToken(refreshToken){
    const res = await fetch(REFRESH_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    });
    if(!res.ok) throw new Error('Token refresh failed: HTTP ' + res.status);
    const data = await res.json();
    return {
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (Number(data.expires_in) * 1000),
    };
  }

  // Called by auth.js once a typed code matches CODE_HASH/COACH_CODE_HASH.
  // passwordHash is that same SHA-256 hex string -- reused as the Firebase
  // account password so the real plaintext code never has to travel any
  // further than auth.js's own local compare.
  window.signInWithGate = async function(kind, passwordHash){
    const email = GATE_EMAILS[kind];
    if(!email) throw new Error('Unknown gate kind: ' + kind);
    let res = await fetch(SIGNIN_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ email, password: passwordHash, returnSecureToken: true }),
    });
    if(!res.ok){
      const errBody = await res.json().catch(() => ({}));
      const code = errBody.error && errBody.error.message;
      if(code === 'EMAIL_NOT_FOUND'){
        // First time this gate has been used since this shipped -- create
        // it now. Safe to do from the client: nobody can sign into it
        // again afterward without reproducing this same hash, which
        // means knowing the real code.
        res = await fetch(SIGNUP_URL, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ email, password: passwordHash, returnSecureToken: true }),
        });
        if(!res.ok) throw new Error('Gate account setup failed: HTTP ' + res.status);
      } else {
        throw new Error('Gate sign-in failed: ' + (code || res.status));
      }
    }
    const data = await res.json();
    cached = {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + (Number(data.expiresIn) * 1000),
      kind,
    };
    saveGateSession(cached.refreshToken, kind);
    return cached;
  };

  window.getFirebaseIdToken = async function(){
    if(cached && cached.expiresAt - SAFETY_MARGIN_MS > Date.now()){
      return cached.idToken;
    }
    if(!inFlight){
      inFlight = (async () => {
        try {
          if(cached && cached.refreshToken){
            cached = Object.assign({}, await refreshIdToken(cached.refreshToken), {kind: cached.kind});
          } else {
            const saved = loadGateSession();
            if(saved && saved.refreshToken){
              cached = Object.assign({}, await refreshIdToken(saved.refreshToken), {kind: saved.kind});
              saveGateSession(cached.refreshToken, saved.kind);
            } else {
              // No gate session on this device yet (code not entered
              // here before) -- fall back to anonymous so pre-login
              // calls don't hard-fail. Anonymous tokens are rejected by
              // the database rules for anything protected, by design.
              cached = await signInAnonymously();
            }
          }
        } catch(e){
          cached = await signInAnonymously();
        }
        return cached;
      })().finally(() => { inFlight = null; });
    }
    const c = await inFlight;
    return c.idToken;
  };

  window.firebaseAuthed = async function(url){
    const token = await window.getFirebaseIdToken();
    const sep = url.indexOf('?') === -1 ? '?' : '&';
    return `${url}${sep}auth=${encodeURIComponent(token)}`;
  };

  // Kick off sign-in immediately on load rather than waiting for the
  // first cloud call, so Play Calls / Edit Plays / quiz saves don't stall
  // on it later. If a gate session is already saved, this quietly
  // upgrades straight to it instead of bothering with anonymous first.
  window.getFirebaseIdToken().catch(function(e){
    console.error('Firebase sign-in failed:', e);
  });

  // ---- One-time mirror of the shipped play/card data into the database
  // ---- (migration step -- see index.html's boot() for when this runs) --
  const FIREBASE_DB_URL = 'https://aslbengals-default-rtdb.firebaseio.com';
  const SEED_PATH = 'dev2PlayData';
  window.__seedBengalsPlayData = async function(){
    // Requires a real gate session -- the database rules only grant this
    // path to non-anonymous auth, so bail early with a clear reason
    // instead of a confusing 401 if this ever runs before that's ready.
    if(!window.hasGateSession || !window.hasGateSession()) return;
    if(!window.DATA || !window.ALL_CARDS) return; // shipped data not loaded yet
    const checkUrl = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${SEED_PATH}/_seededAt.json`);
    const checkRes = await fetch(checkUrl);
    if(checkRes.ok){
      const existing = await checkRes.json();
      if(existing) return; // already seeded by someone -- nothing to do
    }
    const putUrl = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${SEED_PATH}.json`);
    const res = await fetch(putUrl, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        plays: window.DATA,
        cards: window.ALL_CARDS,
        _seededAt: new Date().toISOString(),
      }),
    });
    if(!res.ok) throw new Error('Seed write failed: HTTP ' + res.status);
    console.log('ASL Bengals: play/card data mirrored into the database.');
  };
})();

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
    // Try creating the account first, not signing in first. Newer Firebase
    // projects have "email enumeration protection" on by default, which
    // makes sign-in deliberately return the same vague error whether the
    // account is missing or the password's wrong -- so branching on a
    // specific sign-in error code (e.g. EMAIL_NOT_FOUND) isn't reliable
    // any more. Account *creation*, on the other hand, always still
    // reports EMAIL_EXISTS unambiguously when the account is already
    // there, so that's the reliable signal to branch on instead.
    let res = await fetch(SIGNUP_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ email, password: passwordHash, returnSecureToken: true }),
    });
    if(!res.ok){
      const errBody = await res.json().catch(() => ({}));
      const code = errBody.error && errBody.error.message;
      if(code === 'EMAIL_EXISTS'){
        // Not the first time -- this gate account already exists, so sign
        // into it instead. If this fails too, the code the person typed
        // really doesn't match what the account was created with.
        res = await fetch(SIGNIN_URL, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ email, password: passwordHash, returnSecureToken: true }),
        });
        if(!res.ok) throw new Error('Gate sign-in failed: HTTP ' + res.status);
      } else {
        throw new Error('Gate account setup failed: ' + (code || res.status));
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

  // ---- One-time cleanup of two bad leaderboard entries -- Nathan:
  // "Desmond 3 was an early typo and score can be removed. Wyatt80 can
  // also be removed as Wyatt 80 is the correct one with a faster time."
  // Same self-healing-migration idea as __seedBengalsPlayData above --
  // guarded by a flag written to the database (not localStorage) so it
  // truly only runs once no matter which device/session happens to open
  // the app first, then never touches these paths again. Checks both the
  // Quiz Score and Timed Quiz boards for each bad name (rather than
  // assuming which board each typo landed on) since an exact-name match
  // against a specific known-bad string is safe either way -- "wyatt 80"
  // (with the space -- the correct, faster entry) is a different string
  // and is never touched.
  const CLEANUP_FLAG_PATH = 'cleanup/leaderboardFix1';
  const BAD_LEADERBOARD_NAMES = ['desmond 3', 'wyatt80'];
  window.__cleanupBadLeaderboardEntries = async function(){
    if(!window.hasGateSession || !window.hasGateSession()) return;
    try {
      const checkUrl = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${CLEANUP_FLAG_PATH}.json`);
      const checkRes = await fetch(checkUrl);
      if(checkRes.ok){
        const already = await checkRes.json();
        if(already) return; // already cleaned up by some earlier session
      }
      let removed = 0;
      for(const boardPath of ['leaderboard', 'timedLeaderboard']){
        const listUrl = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${boardPath}.json`);
        const listRes = await fetch(listUrl);
        if(!listRes.ok) continue;
        const data = await listRes.json();
        if(!data) continue;
        for(const key of Object.keys(data)){
          const entry = data[key];
          const name = entry && entry.name ? entry.name.trim().toLowerCase() : '';
          if(BAD_LEADERBOARD_NAMES.indexOf(name) !== -1){
            const delUrl = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${boardPath}/${key}.json`);
            const delRes = await fetch(delUrl, { method: 'DELETE' });
            if(delRes.ok) removed++;
          }
        }
      }
      const flagUrl = await window.firebaseAuthed(`${FIREBASE_DB_URL}/${CLEANUP_FLAG_PATH}.json`);
      await fetch(flagUrl, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(new Date().toISOString()),
      });
      console.log(`ASL Bengals: leaderboard cleanup removed ${removed} bad entr${removed === 1 ? 'y' : 'ies'}.`);
    } catch(e){ console.error('Leaderboard cleanup failed:', e); }
  };
})();

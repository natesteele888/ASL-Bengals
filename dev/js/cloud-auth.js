/* ============================================================
   Anonymous Firebase Auth -- so the Realtime Database can require a
   signed-in request instead of being wide open to anyone who finds the
   database URL. Every visitor (player or coach) is silently signed in as
   an anonymous Firebase user on page load; there's no extra login step
   and nothing the user sees or has to do.

   Uses Firebase's plain REST endpoints (Identity Toolkit) rather than the
   full Firebase JS SDK, to stay consistent with the rest of this app,
   which is a no-build-step static site that talks to the Realtime
   Database with plain fetch() calls.

   Exposes:
     window.getFirebaseIdToken()  -- async, resolves to a currently-valid
       ID token, signing in or refreshing as needed.
     window.firebaseAuthed(url)   -- async, returns the given Firebase
       Realtime Database URL with "?auth=<token>" (or "&auth=..." if the
       URL already has a query string) appended, ready to fetch().
   ============================================================ */
(function(){
  // Firebase Web API key -- this is a *public* identifier, not a secret.
  // Google's own docs say it's safe to ship in client-side code: actual
  // access control is enforced by the Realtime Database security rules,
  // not by hiding this key. It only identifies which Firebase project a
  // request belongs to.
  const FIREBASE_API_KEY = 'AIzaSyCBvobt9qfyLoJOGUz6fIiGrFKMEQFsA3E';
  const SIGNUP_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
  const REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
  // Refresh a little before actual expiry so an in-flight request never
  // gets built with a token that expires mid-flight.
  const SAFETY_MARGIN_MS = 60000;

  let cached = null;   // { idToken, refreshToken, expiresAt }
  let inFlight = null; // Promise<cached>, shared so concurrent callers
                        // (e.g. several cloudFetch calls firing at once)
                        // don't each trigger their own sign-in/refresh.

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

  window.getFirebaseIdToken = async function(){
    if(cached && cached.expiresAt - SAFETY_MARGIN_MS > Date.now()){
      return cached.idToken;
    }
    if(!inFlight){
      inFlight = (async () => {
        try {
          cached = (cached && cached.refreshToken)
            ? await refreshIdToken(cached.refreshToken)
            : await signInAnonymously();
        } catch(e){
          // Refresh failed (e.g. token revoked) -- fall back to a fresh
          // anonymous sign-in rather than leaving every cloud call broken
          // for the rest of the session.
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
  // on it later.
  window.getFirebaseIdToken().catch(function(e){
    console.error('Firebase anonymous sign-in failed:', e);
  });
})();

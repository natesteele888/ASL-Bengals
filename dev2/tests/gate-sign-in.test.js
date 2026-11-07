// Run: node dev2/tests/gate-sign-in.test.js
// Loads the real js/cloud-auth.js into a fake page that talks to a fake
// Firebase Auth, and checks the gate sign-in: the Firebase password comes
// from the typed code (not the published hash), an account still on the old
// hash password is moved over, and a saved session Firebase has ended sends
// the device back to the code screen. Fake codes and a fake server only.
// To see it fail on the old file: node dev2/tests/gate-sign-in.test.js path/to/old/cloud-auth.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createHash, pbkdf2Sync, webcrypto } = require('crypto');

const SRC = fs.readFileSync(process.argv[2] || path.join(__dirname, '../js/cloud-auth.js'), 'utf8');
const sha = s => createHash('sha256').update(s).digest('hex');
const newPw = (code, kind) => pbkdf2Sync(code, 'aslbengals-gate-v2|' + kind, 100000, 32, 'sha256').toString('hex');
const CODE = 'fake-test-code-77';
const EMAIL = { player: 'player-gate@aslbengals.internal', coach: 'coach-gate@aslbengals.internal' };

// A tiny Firebase Auth: accounts keep a password and a token generation.
// Changing a password starts a new generation, which ends older refresh tokens.
function fakeAuth(accounts, opts = {}) {
  let anon = 0;
  const reply = (status, body) => ({ status, ok: status < 300, json: async () => body });
  const tokens = e => ({ idToken: 'id|' + e, refreshToken: 'rt|' + e + '|' + accounts[e].epoch, expiresIn: '3600' });
  const calls = [];
  async function fetch(url, init) {
    const text = (init && init.body) || ''; let b = {}; try { b = JSON.parse(text); } catch (e) {}
    calls.push(url.replace(/\?.*/, '').replace(/^.*\//, '') + (b.email ? ' ' + b.email : ''));
    if (/accounts:signUp/.test(url)) {
      if (!b.email) return reply(200, { idToken: 'anon' + (++anon), refreshToken: 'rt-anon', expiresIn: '3600' });
      if (accounts[b.email]) return reply(400, { error: { message: 'EMAIL_EXISTS' } });
      accounts[b.email] = { password: b.password, epoch: 0 }; return reply(200, tokens(b.email));
    }
    if (/signInWithPassword/.test(url)) {
      const a = accounts[b.email];
      return a && a.password === b.password ? reply(200, tokens(b.email)) : reply(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } });
    }
    if (/accounts:update/.test(url)) {
      if (opts.updateFails) throw new Error('network down');
      const e = String(b.idToken).replace(/^id\|/, ''); if (!accounts[e]) return reply(400, { error: { message: 'INVALID_ID_TOKEN' } });
      accounts[e].password = b.password; accounts[e].epoch++; return reply(200, tokens(e));
    }
    if (/securetoken/.test(url)) {
      if (opts.refreshStatus) return reply(opts.refreshStatus, { error: { message: 'SERVER' } });
      const m = /^rt\|(.+)\|(\d+)$/.exec(decodeURIComponent(/refresh_token=(.+)$/.exec(text)[1]));
      const a = m && accounts[m[1]];
      return a && String(a.epoch) === m[2] ? reply(200, { id_token: 'id|' + m[1], refresh_token: 'rt|' + m[1] + '|' + a.epoch, expires_in: '3600' }) : reply(400, { error: { message: 'TOKEN_EXPIRED' } });
    }
    return reply(404, {});
  }
  return { fetch, accounts, calls };
}

function memStore(init = {}) {
  const s = Object.assign({}, init);
  return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; }, _s: s };
}
function load(auth, { local = memStore(), session = memStore() } = {}) {
  const sb = {
    console: { log() {}, error() {}, warn() {} }, Date, Number, JSON, Math, Promise, Array, Uint8Array, String, Object, Error, TextEncoder, encodeURIComponent,
    crypto: webcrypto, localStorage: local, sessionStorage: session, fetch: auth.fetch, reloads: 0,
  };
  sb.location = { reload() { sb.reloads++; } };
  sb.window = sb; vm.createContext(sb); vm.runInContext(SRC, sb);
  return sb;
}
const SESSION_KEY = 'bengalsGateSession';
const seed = (e, epoch) => memStore({ [SESSION_KEY]: JSON.stringify({ refreshToken: 'rt|' + e + '|' + epoch, kind: 'player' }) });

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok - ' + name); }
  catch (e) { failed++; console.log('not ok - ' + name + '\n    ' + String(e && e.message ? e.message : e).slice(0, 300)); }
}

(async () => {
  await test('a brand-new gate account is created with a password derived from the code, not the published hash', async () => {
    const a = fakeAuth({}); const w = load(a);
    await w.signInWithGate('player', CODE);
    assert.strictEqual(a.accounts[EMAIL.player].password, newPw(CODE, 'player'));
    assert.notStrictEqual(a.accounts[EMAIL.player].password, sha(CODE));
    assert(w.hasGateSession(), 'no saved session');
  });
  await test('an account already on the new password signs in with the right code', async () => {
    const a = fakeAuth({ [EMAIL.coach]: { password: newPw(CODE, 'coach'), epoch: 0 } }); const w = load(a);
    await w.signInWithGate('coach', CODE);
    assert(w.hasGateSession(), 'no saved session');
    assert(!a.calls.some(c => /accounts:update/.test(c)), 'should not need to change the password');
  });
  await test('an account still on the old hash password signs in and is moved to the new one', async () => {
    const a = fakeAuth({ [EMAIL.player]: { password: sha(CODE), epoch: 0 } }); const w = load(a);
    await w.signInWithGate('player', CODE);
    assert.strictEqual(a.accounts[EMAIL.player].password, newPw(CODE, 'player'), 'password not moved');
    assert(w.hasGateSession(), 'no saved session');
    const saved = JSON.parse(w.localStorage.getItem(SESSION_KEY));
    assert(saved.refreshToken.endsWith('|1'), 'saved session should be the post-move one: ' + saved.refreshToken);
  });
  await test('after the move, the published hash no longer works as the password', async () => {
    const a = fakeAuth({ [EMAIL.coach]: { password: sha(CODE), epoch: 0 } }); const w = load(a);
    await w.signInWithGate('coach', CODE);
    const r = await a.fetch('https://x/accounts:signInWithPassword', { body: JSON.stringify({ email: EMAIL.coach, password: sha(CODE) }) });
    assert(!r.ok, 'the hash still signs in');
  });
  await test('a wrong code is refused and changes nothing', async () => {
    const a = fakeAuth({ [EMAIL.player]: { password: sha(CODE), epoch: 0 } }); const w = load(a);
    await assert.rejects(w.signInWithGate('player', 'some-other-code'));
    assert.strictEqual(a.accounts[EMAIL.player].password, sha(CODE)); assert(!w.hasGateSession());
  });
  await test('someone who only has the published hash cannot sign in through the app', async () => {
    const a = fakeAuth({ [EMAIL.player]: { password: newPw(CODE, 'player'), epoch: 0 } }); const w = load(a);
    await assert.rejects(w.signInWithGate('player', sha(CODE)));
    assert(!w.hasGateSession());
  });
  await test('if moving the password fails, the person is still signed in and the account is untouched', async () => {
    const a = fakeAuth({ [EMAIL.player]: { password: sha(CODE), epoch: 0 } }, { updateFails: true }); const w = load(a);
    await w.signInWithGate('player', CODE);
    assert(w.hasGateSession(), 'locked out by a failed move');
    assert.strictEqual(a.accounts[EMAIL.player].password, sha(CODE));
  });
  await test('a saved session that Firebase ended is dropped and the page reloads once to the code screen', async () => {
    const a = fakeAuth({ [EMAIL.player]: { password: newPw(CODE, 'player'), epoch: 1 } });
    const w = load(a, { local: seed(EMAIL.player, 0) });
    assert(w.hasGateSession(), 'precondition');
    await w.getFirebaseIdToken();
    assert(!w.hasGateSession(), 'dead session kept'); assert.strictEqual(w.reloads, 1);
  });
  await test('the reload cannot loop: a second ended session within 30 seconds does not reload again', async () => {
    const a = fakeAuth({ [EMAIL.player]: { password: newPw(CODE, 'player'), epoch: 1 } });
    const session = memStore({ bengalsGateEndedAt: String(Date.now()) });
    const w = load(a, { local: seed(EMAIL.player, 0), session });
    await w.getFirebaseIdToken();
    assert(!w.hasGateSession()); assert.strictEqual(w.reloads, 0);
  });
  await test('a server or network error does not end the saved session', async () => {
    const a = fakeAuth({ [EMAIL.player]: { password: newPw(CODE, 'player'), epoch: 0 } }, { refreshStatus: 503 });
    const w = load(a, { local: seed(EMAIL.player, 0) });
    await w.getFirebaseIdToken();
    assert(w.hasGateSession(), 'session dropped on a blip'); assert.strictEqual(w.reloads, 0);
  });
  console.log(passed + ' passed' + (failed ? ', ' + failed + ' FAILED' : ''));
  if (failed) process.exit(1);
})();

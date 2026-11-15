// Run: node dev2/tests/plays-save.test.js
// The "master plays don't save to the cloud" bug. Loads the real
// js/edit-plays.js, js/play-edits-store.js and
// js/playbuilder/sync-custom-formations.js into a fake page that talks to a
// fake Realtime Database, and checks that a coach's save:
//   - keeps every other coach's newer edits (Edit Plays used to put its
//     whole, possibly days-old, list back over them),
//   - never writes the built-in defaults over everyone after a failed load,
//   - writes nothing when it can't read the latest copy, and says so,
//   - never sticks on "Saving..." when sign-in fails,
//   - keeps Play Builder formations' plays and override layers out of
//     playEdits.json,
// and that a Play Builder save of Wing's Pop Pass reaches playEdits.json, so
// the play cards still show it after a reload. Shipped play data only; no
// names, codes or real database.
// To see the old Edit Plays fail: node dev2/tests/plays-save.test.js path/to/old/edit-plays.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '../js/');
const EDIT_PLAYS = fs.readFileSync(process.argv[2] || JS + 'edit-plays.js', 'utf8');
const STORE = fs.readFileSync(JS + 'play-edits-store.js', 'utf8');
const SYNC = fs.readFileSync(JS + 'playbuilder/sync-custom-formations.js', 'utf8');
const SHIPPED = fs.readFileSync(JS + 'shipped-defaults.js', 'utf8');
// Real helper from play-calls.js that edit-plays.js's save uses.
const COLLECT_LEAVES = fs.readFileSync(JS + 'play-calls.js', 'utf8').match(/function collectLeafVariants\(node\) \{[\s\S]*?\n\}/)[0];
const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));

// ---- A fake Realtime Database (REST, the way the app calls it) ----------
function fakeDb(initial) {
  const data = clone(initial) || {};
  const log = [];
  const opts = { failReads: false, failWrites: false };
  const keyOf = url => decodeURIComponent(new URL(url).pathname.replace(/^\//, '').replace(/\.json$/, ''));
  const reply = (status, body) => ({ status, ok: status < 300, json: async () => clone(body), text: async () => JSON.stringify(body) });
  async function fetch(url, init) {
    const method = (init && init.method) || 'GET';
    const key = keyOf(url);
    log.push(method + ' ' + key);
    if (method === 'GET') {
      if (opts.failReads) return reply(500, { error: 'down' });
      return reply(200, key.split('/').reduce((o, k) => (o == null ? null : o[k]), data) ?? null);
    }
    if (opts.failWrites) return reply(401, { error: 'Permission denied' });
    if (method === 'PUT') { data[key] = JSON.parse(init.body); return reply(200, data[key]); }
    return reply(405, {});
  }
  return { data, log, opts, fetch, writes: () => log.filter(l => l.startsWith('PUT')) };
}

// ---- A fake page: just enough DOM for edit-plays.js to load -------------
function stubEl(id) {
  const handlers = {};
  return {
    id, handlers, style: {}, dataset: {}, children: [], options: [], value: '', textContent: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(t, f) { (handlers[t] = handlers[t] || []).push(f); },
    querySelectorAll() { return []; }, querySelector() { return null; },
    appendChild(c) { return c; }, insertBefore(c) { return c; }, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute() { return null; }, focus() {}, closest() { return null; },
    contains() { return false; }, cloneNode() { return stubEl(); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    getTotalLength() { return 10; }, getPointAtLength() { return { x: 0, y: 0 }; },
    get parentElement() { return stubEl(); },
  };
}

function page(db, { authFails = false } = {}) {
  const els = {};
  const timers = [];
  const document = {
    getElementById: id => els[id] || (els[id] = stubEl(id)),
    createElementNS: () => stubEl(), createElement: () => stubEl(),
    querySelectorAll: () => [], querySelector: () => null, addEventListener() {},
    body: stubEl('body'), documentElement: stubEl('html'),
  };
  const ctx = {
    document, console: { log() {}, warn() {}, error() {} }, JSON, Math, Promise, URL,
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {},
    prompt: () => '', confirm: () => true, alert() {},
    localStorage: { getItem() { return null; }, setItem() {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, performance: { now: () => 0 },
    navigator: {}, location: { search: '' }, addEventListener() {},
    fetch: db.fetch,
  };
  ctx.window = ctx;
  ctx.firebaseAuthed = async url => { if (authFails) throw new Error('Firebase sign-in failed'); return url + '?auth=test'; };
  vm.createContext(ctx);
  vm.runInContext(SHIPPED, ctx);
  ctx.DATA_INIT = clone(ctx.SHIPPED_PLAYS_JSON);
  // What play-calls.js provides to edit-plays.js on the real page.
  vm.runInContext('var DATA = window.DATA = DATA_INIT; function normalizePlayData(x){return x} function repairStaleSplitRoutes(x){return x} function placeToggleThumb(){} ' + COLLECT_LEAVES, ctx);
  vm.runInContext(STORE, ctx);
  vm.runInContext(EDIT_PLAYS, ctx, { filename: 'edit-plays.js' });
  const tick = () => new Promise(r => setImmediate(r));
  return {
    ctx, els,
    async open() { ctx.initEditPlays(); for (let i = 0; i < 20; i++) await tick(); },
    async save() {
      const p = els.saveCloudBtn.handlers.click[0]();
      for (let i = 0; i < 40; i++) await tick();
      await p;
      return { button: els.saveCloudBtn.textContent, status: els.cloudStatus.textContent };
    },
    play: key => ctx.DATA.playTypes.find(p => p.key === key),
  };
}

// First drawn route of a play's first variant -- what a coach drags.
function firstPath(pt) {
  let v = pt.directions.Left;
  while (v && !v.paths) v = v[Object.keys(v)[0]];
  return v.paths.find(p => Array.isArray(p.points) && p.points.length);
}
function nudge(pt, dx) { const p = firstPath(pt); p.points[0] = [p.points[0][0] + dx, p.points[0][1]]; return p.points[0][0]; }
const cloudPlay = (db, key) => db.data.playEdits.find(p => p.key === key);

const shipped = () => { const c = { window: {} }; vm.createContext(c); vm.runInContext(SHIPPED.replace(/window\./g, 'this.window.'), c); return clone(c.window.SHIPPED_PLAYS_JSON); };
const SHIP = shipped();

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('a save keeps another coach\'s newer edit to a different play', async () => {
  const db = fakeDb({ playEdits: clone(SHIP.playTypes), splitRouteEdits: clone(SHIP.splitRoutes) });
  const me = page(db);
  await me.open();                                   // my phone loads (yesterday)
  const theirs = nudge(cloudPlay(db, 'blast'), 40);  // then another coach saves Blast
  const mine = nudge(me.play('inside_zone'), 25);    // I drag Inside Zone and save
  const r = await me.save();
  assert.strictEqual(r.button, 'Saved!', r.status);
  assert.strictEqual(firstPath(cloudPlay(db, 'inside_zone')).points[0][0], mine, 'my edit saved');
  assert.strictEqual(firstPath(cloudPlay(db, 'blast')).points[0][0], theirs, 'their Blast edit was kept');
  assert.strictEqual(db.data.playEdits.length, SHIP.playTypes.length, 'no plays lost or doubled');
});

test('after a failed first load, a save does not put the defaults over everyone', async () => {
  const saved = clone(SHIP.playTypes); const theirs = nudge(saved.find(p => p.key === 'sweep'), 55);
  const db = fakeDb({ playEdits: saved, splitRouteEdits: clone(SHIP.splitRoutes) });
  const me = page(db);
  db.opts.failReads = true; await me.open(); db.opts.failReads = false; // "could not reach the cloud"
  nudge(me.play('option'), 12);
  const r = await me.save();
  assert.strictEqual(r.button, 'Saved!', r.status);
  assert.strictEqual(firstPath(cloudPlay(db, 'sweep')).points[0][0], theirs, 'Sweep edit survived');
});

test('if the latest copy cannot be read, nothing is written and the coach is told', async () => {
  const db = fakeDb({ playEdits: clone(SHIP.playTypes), splitRouteEdits: clone(SHIP.splitRoutes) });
  const me = page(db); await me.open();
  nudge(me.play('option'), 12);
  db.opts.failReads = true;
  const r = await me.save();
  assert.strictEqual(r.button, 'Save Failed');
  assert.match(r.status, /nothing was changed/);
  assert.deepStrictEqual(db.writes(), []);
});

test('a refused write says Save Failed, and the next save tries the play again', async () => {
  const db = fakeDb({ playEdits: clone(SHIP.playTypes), splitRouteEdits: clone(SHIP.splitRoutes) });
  const me = page(db); await me.open();
  const mine = nudge(me.play('option'), 12);
  db.opts.failWrites = true;
  assert.strictEqual((await me.save()).button, 'Save Failed');
  db.opts.failWrites = false;
  assert.strictEqual((await me.save()).button, 'Saved!');
  assert.strictEqual(firstPath(cloudPlay(db, 'option')).points[0][0], mine);
});

test('a sign-in failure says Save Failed instead of sticking on Saving...', async () => {
  const db = fakeDb({ playEdits: clone(SHIP.playTypes), splitRouteEdits: clone(SHIP.splitRoutes) });
  const me = page(db, { authFails: true });
  me.ctx.initEditPlays(); await new Promise(r => setImmediate(r));
  nudge(me.play('option'), 12);
  const r = await me.save().catch(e => ({ button: me.els.saveCloudBtn.textContent, threw: e }));
  assert.strictEqual(r.button, 'Save Failed');
});

test('saving with nothing changed writes nothing', async () => {
  const db = fakeDb({ playEdits: clone(SHIP.playTypes), splitRouteEdits: clone(SHIP.splitRoutes) });
  const me = page(db); await me.open();
  const r = await me.save();
  assert.strictEqual(r.button, 'Saved!');
  assert.deepStrictEqual(db.writes(), []);
});

test('Split routes: my Seattle edit and their Houston edit both stay', async () => {
  const db = fakeDb({ playEdits: clone(SHIP.playTypes), splitRouteEdits: clone(SHIP.splitRoutes) });
  const me = page(db); await me.open();
  db.data.splitRouteEdits.Right.wide.houston = { theirs: true };
  me.ctx.DATA.splitRoutes.Left.flex.seattle = { mine: true };
  assert.strictEqual((await me.save()).button, 'Saved!');
  assert.deepStrictEqual(db.data.splitRouteEdits.Right.wide.houston, { theirs: true });
  assert.deepStrictEqual(db.data.splitRouteEdits.Left.flex.seattle, { mine: true });
  assert.ok(!db.writes().includes('PUT playEdits'), 'plays untouched');
});

test('Play Builder plays and override layers never get copied into playEdits.json', async () => {
  const db = fakeDb({ playEdits: clone(SHIP.playTypes), splitRouteEdits: clone(SHIP.splitRoutes) });
  const me = page(db); await me.open();
  me.ctx.DATA.playTypes.push({ key: 'pb_trips_flood', label: 'Flood', authoredFormationId: 'trips', directions: {} });
  me.play('blast').assignments = { 'wing:Right': { 5: { points: [[1, 2]] } } }; // layered on by Play Calls
  me.play('blast').ballPath = [{ from: 1 }];
  nudge(me.play('option'), 9);
  assert.strictEqual((await me.save()).button, 'Saved!');
  assert.ok(!cloudPlay(db, 'pb_trips_flood'), 'foreign Play Builder play not written');
  assert.ok(!('assignments' in cloudPlay(db, 'blast')) && !('ballPath' in cloudPlay(db, 'blast')), 'layers not written');
  assert.ok(me.play('blast').assignments, 'layer still on the page');
});

test('a brand-new duplicated play is added without dropping anyone else\'s', async () => {
  const db = fakeDb({ playEdits: clone(SHIP.playTypes), splitRouteEdits: clone(SHIP.splitRoutes) });
  const me = page(db); await me.open();
  const copy = clone(me.play('sweep')); copy.key = 'sweep_wham'; copy.label = 'Sweep Wham';
  me.ctx.DATA.playTypes.push(copy);
  const theirs = nudge(cloudPlay(db, 'blast'), 33);
  assert.strictEqual((await me.save()).button, 'Saved!');
  assert.ok(cloudPlay(db, 'sweep_wham'));
  assert.strictEqual(firstPath(cloudPlay(db, 'blast')).points[0][0], theirs);
});

test('first save ever (no saved edits yet) still writes the whole playbook', async () => {
  const db = fakeDb({});
  const me = page(db); await me.open();
  nudge(me.play('option'), 4);
  assert.strictEqual((await me.save()).button, 'Saved!');
  assert.strictEqual(db.data.playEdits.length, SHIP.playTypes.length);
});

// ---- Play Builder's Save on Wing Pop Pass -------------------------------
function pbPage(db) {
  const ctx = { console: { log() {}, warn() {}, error() {} }, JSON, Math, Promise, URL, fetch: db.fetch, setTimeout };
  ctx.window = ctx;
  ctx.firebaseAuthed = async url => url + '?auth=test';
  vm.createContext(ctx);
  vm.runInContext(STORE, ctx);
  ctx.DATA = clone(SHIP);
  ctx.PlayBuilderPlaysById = {};
  ctx.PlayBuilderMirror = { resolveAnchor: () => ({ x: 0, y: 0 }) };
  ctx.Formations = { registerCustom() {} };
  const route = [[100, 100], [200, 50]];
  ctx.PlayBuilderStore = { loadAll: async () => ({ formations: [{ id: 'shotgun', positions: [] }], plays: [], defenseLooks: [{ id: 'd1' }], activeDefenseLookId: 'd1' }) };
  ctx.PlayBuilderLegacyAdapter = {
    toLegacyPlayType: (play) => ({ key: play.id, label: play.label, authoredFormationId: 'shotgun',
      directions: { Right: { paths: [{ player: 4, points: route }] }, Left: { paths: [{ player: 4, points: route }] } } }),
  };
  vm.runInContext(SYNC, ctx);
  return { ctx, route };
}

test('Play Builder save of Pop Pass reaches playEdits.json (survives a reload)', async () => {
  const db = fakeDb({ playEdits: clone(SHIP.playTypes) });
  const theirs = nudge(cloudPlay(db, 'blast'), 21);
  const { ctx, route } = pbPage(db);
  const pop2Before = clone(cloudPlay(db, 'pop_pass').directions.Right.Pop2);
  await ctx.PlayBuilderSyncCustomFormations.mergeWingSplitPlayIntoData({ id: 'pop_pass', formationId: 'shotgun', label: 'Pop Pass', variants: [] });
  const saved = cloudPlay(db, 'pop_pass');
  assert.deepStrictEqual(saved.directions.Right.Pop.paths[0].points, route, 'new Pop route saved');
  assert.deepStrictEqual(saved.directions.Right.Pop2, pop2Before, 'Pop Pass 2 left as it was');
  assert.ok(!saved.authoredFormationId, 'still a native Wing play');
  assert.strictEqual(firstPath(cloudPlay(db, 'blast')).points[0][0], theirs, 'other plays untouched');
});

test('Play Builder save says it failed when the play cards could not be updated', async () => {
  const db = fakeDb({ playEdits: clone(SHIP.playTypes) });
  db.opts.failWrites = true;
  const { ctx } = pbPage(db);
  await assert.rejects(
    ctx.PlayBuilderSyncCustomFormations.mergeWingSplitPlayIntoData({ id: 'pop_pass', formationId: 'shotgun', label: 'Pop Pass', variants: [] }),
    /play cards could not be updated/);
});

test('Play Builder save of any other Wing play stays a no-op', async () => {
  const db = fakeDb({ playEdits: clone(SHIP.playTypes) });
  const { ctx } = pbPage(db);
  await ctx.PlayBuilderSyncCustomFormations.mergeWingSplitPlayIntoData({ id: 'sweep', formationId: 'shotgun', label: 'Sweep', variants: [] });
  assert.deepStrictEqual(db.writes(), []);
});

// ---- Play Calls after visiting Edit Plays --------------------------------
test('Play Calls puts Play Builder plays and overrides back after Edit Plays', async () => {
  const db = fakeDb({ playEdits: clone(SHIP.playTypes), splitRouteEdits: clone(SHIP.splitRoutes) });
  const pg = page(db); // a fake page; load play-calls.js into a fresh one of the same kind
  const ctx = pg.ctx;
  const PLAY_CALLS = fs.readFileSync(JS + 'play-calls.js', 'utf8');
  const c2 = Object.assign({}, ctx); c2.window = c2;
  c2.DATA = clone(SHIP); c2.sha256Hex = async () => '';
  c2.FIREBASE_DB_URL = 'https://aslbengals-default-rtdb.firebaseio.com'; // a study-quiz.js global on the real page
  const override = { 'wing:Right': { 5: { points: [[1, 2]] } } };
  c2.AssignmentStore = {
    loadAll: async () => ({ blast: override }), loadBallPaths: async () => ({}),
    applyTo: (pts, all) => { pts.forEach(pt => { if (all[pt.key]) pt.assignments = all[pt.key]; }); return 1; },
    applyBallPaths: () => 0,
  };
  c2.PlayBuilderSyncCustomFormations = { syncCustomFormationsIntoData: async () => {
    if (!c2.DATA.playTypes.some(p => p.key === 'pb_flood')) c2.DATA.playTypes.push({ key: 'pb_flood', authoredFormationId: 'trips', directions: {} });
  } };
  vm.createContext(c2);
  vm.runInContext(PLAY_CALLS, c2, { filename: 'play-calls.js' });
  const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)); };
  try { c2.initPlayCalls(); } catch (e) {}
  await settle();
  assert.ok(c2.DATA.playTypes.some(p => p.key === 'pb_flood'), 'boot layered it on');
  // Edit Plays opens: swaps in a fresh copy from playEdits.json.
  c2.DATA.playTypes = clone(SHIP.playTypes);
  c2._playCallsShouldRebuild = true;
  try { c2.initPlayCalls(); } catch (e) {}
  await settle();
  assert.ok(c2.DATA.playTypes.some(p => p.key === 'pb_flood'), 'Play Builder play back');
  assert.deepStrictEqual(c2.DATA.playTypes.find(p => p.key === 'blast').assignments, override, 'override back');
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok   ' + name); }
    catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.message)); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();

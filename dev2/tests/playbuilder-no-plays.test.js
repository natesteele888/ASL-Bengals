// Run: node dev2/tests/playbuilder-no-plays.test.js
// Play Builder with no plays loaded (no signal, so the store can't load).
// Loads the real js/playbuilder/editor.js and formation-editor.js into a
// fake page whose store fails to load, then taps Save Play, + New Variant,
// Clear (ball path), + New Formation and Preview: Left. None may crash, and
// Save Play must say why it did nothing. No real database, no data.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PB = path.join(__dirname, '../js/playbuilder/');
const EDITOR = fs.readFileSync(process.argv[2] || PB + 'editor.js', 'utf8');
const FORMATIONS = fs.readFileSync(process.argv[3] || PB + 'formation-editor.js', 'utf8');

// Any element the scripts ask for: records click/change handlers, answers
// everything else with harmless defaults.
function stubEl(id) {
  const handlers = {};
  const el = {
    id, handlers, style: {}, dataset: { value: 'left' }, children: [], options: [], value: '', textContent: '', innerHTML: '',
    checked: false, disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(t, f) { (handlers[t] = handlers[t] || []).push(f); },
    removeEventListener() {},
    querySelectorAll() { return kids; }, querySelector() { return null; },
    appendChild(c) { return c; }, removeChild() {}, insertBefore(c) { return c; }, append() {}, prepend() {}, remove() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    focus() {}, blur() {}, click() {},
  };
  // Toggle groups (Preview: Left/Right etc.) hand back one button each.
  const kids = id && /Toggle$/.test(id) ? [stubEl()] : [];
  return el;
}

function page() {
  const byId = {};
  const get = id => (byId[id] = byId[id] || stubEl(id));
  const errors = [];
  const document = {
    getElementById: get, createElement: () => stubEl(), createElementNS: () => stubEl(),
    createTextNode: () => stubEl(), querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, body: stubEl('body'), activeElement: null,
  };
  const noSignal = async () => { throw new Error('Failed to fetch'); };
  const window = {
    document, console: { log() {}, warn() {}, error: (e) => errors.push(e) },
    PlayBuilderStore: { isEmpty: noSignal, loadAll: noSignal, savePlay: noSignal, seedFromDefaults: noSignal },
    PlayBuilderSeeds: { viewBox: [1600, 1030], topPad: 0 },
    BallPathEditor: function (o) { let a = []; return { set(v) { a = v || []; o.renderPlay(); }, get: () => a, clear() { a = []; o.onChange(); o.renderPlay(); } }; },
    FormationBuilder: function () { return { positions: {}, viewport: { y: 0, height: 100 }, render() {} }; },
    PlayBuilderMirror: { resolveAnchor: () => ({ x: 0, y: 0 }) },
    prompt: () => 'counter', alert() {}, confirm: () => true,
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
  };
  window.window = window;
  const ctx = vm.createContext(window);
  ctx.globalThis = ctx;
  return { ctx, get, errors };
}

async function tap(el, type = 'click') {
  for (const f of el.handlers[type] || []) await f({ preventDefault() {}, stopPropagation() {}, target: el });
}

async function main() {
  const { ctx, get, errors } = page();
  vm.runInContext(EDITOR, ctx, { filename: 'editor.js' });
  vm.runInContext(FORMATIONS, ctx, { filename: 'formation-editor.js' });
  await new Promise(r => setImmediate(r));
  assert.strictEqual(get('pbStatus').textContent, 'Failed to load: Failed to fetch', 'store load should fail only for want of signal');
  assert.strictEqual(ctx.PlayBuilderEditor.state.currentPlay, null);

  const tests = [
    ['Save Play', 'pbSaveBtn'],
    ['+ New Variant', 'pbNewVariantBtn'],
    ['Clear (ball path)', 'pbBallPathClearBtn'],
    ['+ New Formation', 'fbNewBtn'],
  ];
  let failed = 0;
  for (const [name, id] of tests) {
    try { await tap(get(id)); console.log('ok   ' + name); }
    catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); }
  }
  try {
    for (const b of get('fbPreviewSideToggle').querySelectorAll('button')) await tap(b);
    console.log('ok   Preview: Left');
  } catch (e) { failed++; console.log('FAIL Preview: Left: ' + e.message); }

  try {
    await tap(get('pbSaveBtn'));
    assert.strictEqual(get('pbStatus').textContent, 'No play loaded yet.');
    assert.notStrictEqual(get('pbSaveBtn').textContent, 'Saving…');
    console.log('ok   Save Play says no play is loaded');
  } catch (e) { failed++; console.log('FAIL Save Play message: ' + e.message); }
  try {
    assert.strictEqual(get('fbStatus').textContent, "Formations haven't loaded yet.");
    console.log('ok   + New Formation says formations have not loaded');
  } catch (e) { failed++; console.log('FAIL New Formation message: ' + e.message); }

  if (failed) { console.log(failed + ' failed'); process.exit(1); }
  console.log('all passed');
}
main().catch(e => { console.error(e); process.exit(1); });

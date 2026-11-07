// Run: node dev2/tests/film-room.test.js
// Loads the real js/film-room.js into a fake page, opens a film, and checks
// the notes HTML it builds from what the database returns. Fake data only.
// Notes come from other people's devices, so a value that isn't what the
// Film Room itself would have saved must never reach the page as markup.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '../js/film-room.js'), 'utf8');
const FILM_URL = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMn/preview';
const FILM_KEY = '1AbCdEfGhIjKlMn';
const tick = () => new Promise(r => setImmediate(r));

function fakeEl() {
  const kids = {};
  return {
    innerHTML: '', textContent: '', value: '', dataset: {}, style: {}, isConnected: true,
    classList: { add() {}, remove() {} },
    querySelector(sel) { return kids[sel] || (kids[sel] = fakeEl()); },
    querySelectorAll() { return []; },
    appendChild() {}, scrollIntoView() {}, contains() { return false; },
  };
}

// Opens the film with `notes` stored for it; returns the notes box's HTML.
// notesStatus 403 plays a database whose rules don't allow filmRoom yet.
async function openFilm({ notes = {}, coach = false, notesStatus = 200 } = {}) {
  const host = fakeEl();
  // A fresh copy each time: the Film Room keeps what it fetches and adds to it.
  const reply = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => JSON.parse(JSON.stringify(data)) });
  const sandbox = {
    console, setTimeout: () => 0, Math, Date, JSON, Object, Array, String, Number, Promise, RegExp, isNaN,
    document: {
      getElementById: id => (id === 'filmRoomPanel' ? host : null),
      createElement: () => fakeEl(), head: fakeEl(), addEventListener() {},
    },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: async url => {
      if (/\/schedule\.json/.test(url)) return reply(200, [{ date: '2099-01-01', opponent: 'Test Team', gameFootage: [{ url: FILM_URL, title: 'Game film' }] }]);
      if (/\/filmViews\.json/.test(url)) return reply(200, {});
      if (/\/filmRoom\/notes/.test(url)) return reply(notesStatus, notesStatus === 200 ? notes : { error: 'Permission denied' });
      return reply(404, null);
    },
  };
  sandbox.window = sandbox;
  sandbox.firebaseAuthed = sandbox.window.firebaseAuthed = async u => u;
  sandbox.PlayerIdentity = { getSession: () => ({ playerId: 'p1', name: 'Player 1' }) };
  sandbox.isCoachSession = coach;
  sandbox.setSection = s => { if (s === 'film') sandbox.initFilmRoomNav(); };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  sandbox.FilmRoom.open(FILM_URL, { skipLog: true });
  for (let i = 0; i < 40; i++) await tick();
  return host.querySelector('#frNotes').innerHTML;
}

const note = over => Object.assign({ t: 754, text: 'Looks left before he runs left', tag: 'O', by: 'Player 2', byId: 'p2', at: '2026-11-07T12:00:00.000Z' }, over);
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok - ' + name); }
  catch (e) { failed++; console.log('not ok - ' + name + '\n    ' + String(e && e.message ? e.message : e).slice(0, 400)); }
}

(async () => {
  await test('a normal note shows its time and jumps to it', async () => {
    const html = await openFilm({ notes: { n1: note() } });
    assert(html.includes('data-jump="754"'), html);
    assert(html.includes('12:34'), html);
  });
  await test('a note with no time has no time button', async () => {
    const html = await openFilm({ notes: { n1: note({ t: null }) } });
    assert(html.includes('Looks left before he runs left'), html);
    assert(!html.includes('data-jump'), html);
  });
  await test('a time that is really an attribute payload cannot break out', async () => {
    const html = await openFilm({ notes: { n1: note({ t: '1" autofocus onfocus="alert(1)' }) } });
    assert(!/onfocus/.test(html), html);
    assert(html.includes('data-jump="0"'), html);
  });
  await test('a time that is really a tag cannot add markup', async () => {
    const html = await openFilm({ notes: { n1: note({ t: '<img src=x onerror=alert(1)>' }) } });
    assert(!/<img/i.test(html) && !/onerror/.test(html), html);
  });
  await test('typed text, names and the note id stay escaped', async () => {
    const html = await openFilm({ notes: { 'x"y': note({ text: '<b>bold</b>', by: '<i>Sam</i>' }) } });
    assert(html.includes('&lt;b&gt;bold&lt;/b&gt;') && html.includes('&lt;i&gt;Sam&lt;/i&gt;'), html);
    assert(!html.includes('<b>bold') && !html.includes('<i>Sam') && !html.includes('data-note="x"y"'), html);
  });
  await test('when the database refuses filmRoom, a coach is told to copy the teamRoster rule, not to open it to every signed-in visitor', async () => {
    const html = await openFilm({ coach: true, notesStatus: 403 });
    assert(html.includes('teamRoster'), html);
    assert(!html.includes('auth != null'), html);
  });
  await test('when the database refuses filmRoom, a player is only told to ask a coach', async () => {
    const html = await openFilm({ coach: false, notesStatus: 403 });
    assert(html.includes('Ask a coach'), html);
    assert(!html.includes('teamRoster'), html);
  });
  console.log(passed + ' passed' + (failed ? ', ' + failed + ' FAILED' : ''));
  if (failed) process.exit(1);
})();

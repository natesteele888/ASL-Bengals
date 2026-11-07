// Run: node dev2/tests/play-order.test.js
// Fake plays only ("Player 12"). Each case stores a game out of order and
// checks orderPlays() gives first play to last.
const assert = require('assert');
const { orderPlays } = require('../js/play-order.js');
const ids = list => orderPlays(list).map(p => p.id);
const t0 = 1756000000000; // late August 2026
const sk = n => 'play_' + (t0 + n * 30000);           // Stat Keeper id
const wz = n => 'play_' + (t0 + n * 30000).toString(36) + 'ab12'; // Game Wizard id
let passed = 0;
function test(name, fn){ fn(); passed++; console.log('ok - ' + name); }

// Five plays in true order, two quarters.
function game(idFn){
  return [
    { id: idFn(1), type: 'kick', side: 'offense', quarter: 1, returner: 'Player 12' },
    { id: idFn(2), type: 'run', side: 'offense', quarter: 1, runTeam: 'Us', rusher: 'Player 12', yards: 5 },
    { id: 'q_' + (t0 + 3 * 30000), type: 'quarterEnd', quarter: 1 },
    { id: idFn(4), type: 'pass', side: 'offense', quarter: 2, passTeam: 'Us', passer: 'Player 7', yards: 12 },
    { id: idFn(5), type: 'score', quarter: 2, scoreKind: 'Touchdown', scoreTeam: 'Us' },
  ];
}
const truth = game(sk).map(p => p.id);

test('new game stored oldest first stays as is', () => {
  assert.deepStrictEqual(ids(game(sk)), truth);
});
test('early-season game stored newest first is flipped', () => {
  assert.deepStrictEqual(ids(game(sk).reverse()), truth);
});
test('newest first with no quarter markers or quarters: id times decide', () => {
  const list = game(sk).filter(p => p.type !== 'quarterEnd').map(p => Object.assign({}, p, { quarter: undefined })).reverse();
  assert.deepStrictEqual(ids(list), truth.filter(id => !id.startsWith('q_')));
});
test('Game Wizard ids (base36 time) are read too', () => {
  const list = game(wz).map(p => Object.assign({}, p, { quarter: 1, type: p.type === 'quarterEnd' ? 'kneel' : p.type }));
  assert.deepStrictEqual(ids(list.slice().reverse()), list.map(p => p.id));
});
test('a play the coach added later in its right spot keeps that spot', () => {
  // Typed during Q2 (so quarter: 2 and a later id) but placed in Q1.
  const list = game(sk);
  list.splice(1, 0, { id: sk(9), type: 'tackle', side: 'defense', quarter: 2, tackler: 'Player 22' });
  assert.deepStrictEqual(ids(list), [truth[0], sk(9)].concat(truth.slice(1)));
  assert.deepStrictEqual(ids(list.slice().reverse()), [truth[0], sk(9)].concat(truth.slice(1)));
});
test('shuffled quarters without markers go by quarter, then stored order', () => {
  const list = [
    { id: 'a', type: 'run', quarter: 1 }, { id: 'b', type: 'run', quarter: 1 },
    { id: 'c', type: 'run', quarter: 3 }, { id: 'd', type: 'run', quarter: 2 },
    { id: 'e', type: 'run', quarter: 2 }, { id: 'f', type: 'run', quarter: 3 },
  ];
  assert.deepStrictEqual(ids(list), ['a', 'b', 'd', 'e', 'c', 'f']);
  assert.deepStrictEqual(ids(list.slice().reverse()), ['a', 'b', 'd', 'e', 'c', 'f']); // stored newest first: flipped, same result
});
test('game clock counts down inside a quarter when every play has one', () => {
  const list = [
    { id: 'x1', type: 'run', quarter: 1, clock: '3:10' },
    { id: 'x2', type: 'run', quarter: 1, clock: '7:45' },
    { id: 'x3', type: 'run', quarter: 2, clock: '8:00' },
    { id: 'x4', type: 'run', quarter: 1, clock: '5:00' },
  ];
  assert.deepStrictEqual(ids(list), ['x2', 'x4', 'x1', 'x3']);
});
test('clock is ignored in a quarter where some plays have none', () => {
  const list = [
    { id: 'y1', type: 'run', quarter: 1, clock: '3:10' },
    { id: 'y2', type: 'run', quarter: 1 },
    { id: 'y3', type: 'run', quarter: 1, clock: '7:45' },
  ];
  assert.deepStrictEqual(ids(list), ['y1', 'y2', 'y3']);
});
test('old rebuilt-from-live-stats log (saved newest first) is flipped', () => {
  // Saved as reverse(snaps in order + untimed plays).
  const inOrder = [
    { id: 'rebuilt_1', type: 'run', side: 'offense', runTeam: 'Us', quarter: 1 },
    { id: 'rebuilt_3', type: 'pass', side: 'offense', passTeam: 'Us', quarter: 1 },
    { id: 'rebuilt_2', type: 'run', side: 'offense', runTeam: 'Us', quarter: 1 },
    { id: 'rebuilt_4', type: 'tackle', side: 'defense', quarter: 1 },
  ];
  assert.deepStrictEqual(ids(inOrder.slice().reverse()), inOrder.map(p => p.id));
  assert.deepStrictEqual(ids(inOrder), inOrder.map(p => p.id));
});
test('does not change the saved list it was given', () => {
  const list = game(sk).reverse(); const before = JSON.stringify(list);
  orderPlays(list);
  assert.strictEqual(JSON.stringify(list), before);
});
test('empty and junk input', () => {
  assert.deepStrictEqual(orderPlays(null), []);
  assert.deepStrictEqual(ids([null, { id: 'z', type: 'run' }]), ['z']);
});
console.log(passed + ' passed');

import assert from 'node:assert';
import { init, apply, board, removable, moves, ADJ } from './rules.js';
for (let i = 0; i < 24; i++) for (const j of ADJ[i]) assert(ADJ[j].includes(i));
assert.equal(ADJ.flat().length, 64); // 32 Kanten
let s = init();
const P = (p, pl) => (s = apply(s, { t: 'place', p }, pl)) || assert.fail('place ' + p);
assert.equal(apply(s, { t: 'place', p: 0 }, 2), null); // nicht am Zug
P(0, 1); P(21, 2); assert.equal(apply(s, { t: 'place', p: 0 }, 1), null); P(1, 1); P(22, 2); P(2, 1);
assert(s.remove && s.turn === 1); assert.deepEqual(removable(s, 1).sort(), [21, 22]);
s = apply(s, { t: 'remove', p: 21 }, 1); assert(!s.remove && s.turn === 2 && board(s)[21] === 0);
// Zufallsspiele: nie Absturz, immer legal, endet oder läuft weiter
for (let g = 0; g < 300; g++) {
  s = init(1 + (g % 2));
  for (let k = 0; k < 400 && !s.winner; k++) {
    const pl = s.turn, b = board(s);
    const opts = s.remove ? removable(s, pl).map(p => ({ t: 'remove', p })) : s.placed[pl] < 9 ? [...b.keys()].filter(p => !b[p]).map(p => ({ t: 'place', p })) : moves(s, pl).map(([from, to]) => ({ t: 'move', from, to }));
    assert(opts.length, 'kein Zug ohne Sieger');
    s = apply(s, opts[Math.floor(Math.random() * opts.length)], pl); assert(s);
  }
}
console.log('ok');
{ const { spare } = await import('./rules.js');
  let t = init(); for (const [p, pl] of [[0,1],[21,2],[1,1],[22,2],[2,1]]) t = apply(t, { t: 'place', p }, pl);
  const u = spare(t); assert(u && !u.remove && u.turn === 2 && board(u)[21] === 2 && spare(u) === null); console.log('spare ok'); }

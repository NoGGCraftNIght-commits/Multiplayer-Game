// Mühle-Regeln, rein funktional: apply() gibt neuen Zustand zurück oder null, wenn der Zug illegal ist.
// Punkte 0–23: Außen-, Mittel-, Innenring; XY im Raster 0–6.
export const XY = [[0,0],[3,0],[6,0],[1,1],[3,1],[5,1],[2,2],[3,2],[4,2],[0,3],[1,3],[2,3],[4,3],[5,3],[6,3],[2,4],[3,4],[4,4],[1,5],[3,5],[5,5],[0,6],[3,6],[6,6]];
export const MILLS = [[0,1,2],[3,4,5],[6,7,8],[9,10,11],[12,13,14],[15,16,17],[18,19,20],[21,22,23],
  [0,9,21],[3,10,18],[6,11,15],[1,4,7],[16,19,22],[8,12,17],[5,13,20],[2,14,23]];
export const ADJ = XY.map(() => []);
for (const [a, b, c] of MILLS) { ADJ[a].push(b); ADJ[b].push(a, c); ADJ[c].push(b); }

const opp = (pl) => 3 - pl;
// Steine: id 0–8 Weiß (1), 9–17 Schwarz (2); p = Punkt, -1 = in der Hand, -2 = geschlagen
export const init = (start = 1) => ({ pieces: Array.from({ length: 18 }, (_, i) => ({ o: i < 9 ? 1 : 2, p: -1 })), turn: start, start, placed: [0, 0, 0], remove: false, mill: null, winner: 0, n: 0 });
export const board = (s) => { const b = Array(24).fill(0); for (const k of s.pieces) if (k.p >= 0) b[k.p] = k.o; return b; };
const onBoard = (s, pl) => s.pieces.filter(k => k.o === pl && k.p >= 0).length;
const alive = (s, pl) => s.pieces.filter(k => k.o === pl && k.p !== -2).length;
export const phase = (s, pl) => s.placed[pl] < 9 ? 'place' : onBoard(s, pl) === 3 ? 'fly' : 'move';
const millAt = (b, p, pl) => MILLS.find(m => m.includes(p) && m.every(q => b[q] === pl)) || null;

export function removable(s, pl) { // Steine des Gegners von pl, die pl schlagen darf
  const b = board(s), o = opp(pl), mine = [...b.keys()].filter(p => b[p] === o);
  const free = mine.filter(p => !millAt(b, p, o));
  return free.length ? free : mine;
}
export function moves(s, pl) { // alle Züge [von, nach] in der Zugphase
  const b = board(s), fly = phase(s, pl) === 'fly', out = [];
  for (let f = 0; f < 24; f++) if (b[f] === pl) for (const t of fly ? b.keys() : ADJ[f]) if (!b[t]) out.push([f, t]);
  return out;
}

export function apply(s0, a, pl) {
  if (s0.winner || s0.turn !== pl || !a) return null;
  const s = structuredClone(s0), b = board(s), ph = phase(s, pl);
  const ok = (p) => Number.isInteger(p) && p >= 0 && p < 24;
  let dest;
  if (s.remove) {
    if (a.t !== 'remove' || !ok(a.p) || !removable(s, pl).includes(a.p)) return null;
    s.pieces.find(k => k.p === a.p).p = -2;
    s.remove = false; s.mill = null;
    if (alive(s, opp(pl)) < 3) s.winner = pl;
    return end(s, pl);
  }
  if (a.t === 'place') {
    if (ph !== 'place' || !ok(a.p) || b[a.p]) return null;
    s.pieces.find(k => k.o === pl && k.p === -1).p = dest = a.p; s.placed[pl]++;
  } else if (a.t === 'move') {
    if (ph === 'place' || !ok(a.from) || !ok(a.to) || b[a.from] !== pl || b[a.to] || (ph === 'move' && !ADJ[a.from].includes(a.to))) return null;
    s.pieces.find(k => k.p === a.from).p = dest = a.to;
  } else return null;
  s.n++;
  const m = millAt(board(s), dest, pl);
  if (m && removable(s, pl).length) { s.remove = true; s.mill = m; return s; }
  return end(s, pl);
}
function end(s, pl) {
  s.turn = opp(pl);
  if (!s.winner && phase(s, s.turn) !== 'place' && !moves(s, s.turn).length) s.winner = pl; // Gegner eingesperrt
  return s;
}

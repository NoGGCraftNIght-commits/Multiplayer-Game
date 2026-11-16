import { startGame } from './game-server.js';

// Spiel-Logik des Browser-Gastgebers als Worker. Nachrichten: ['add'|'msg'|'drop', Verbindung, Inhalt] hinein,
// [Verbindung, Inhalt] hinaus (p2p.js leitet sie an den eigenen Client oder per WebRTC weiter).
// Server-Seite einer Verbindung, so wie game-server.js Socket.io benutzt
class HostSocket {
  constructor(io, id, send) { Object.assign(this, { io, id, send, h: {}, rooms: new Set() }); }
  on(ev, fn) { this.h[ev] = fn; }
  emit(ev, d) { this.send([ev, d]); }
  get volatile() { return this; }
  join(r) { this.rooms.add(r); }
  to(r) { return this.io.to(r, this); }
  recv([ev, args = [], ack]) { this.h[ev]?.(...args, ...(ack != null ? [(res) => this.send(['__ack', ack, res])] : [])); }
}
class HostIO {
  socks = new Map();
  on(ev, fn) { this.onConn = fn; }
  add(id, send) { const s = new HostSocket(this, id, send); this.socks.set(id, s); this.onConn(s); return s; }
  drop(id) { const s = this.socks.get(id); if (s) { this.socks.delete(id); s.h.disconnect?.(); } }
  to(r, except) {
    const list = [...this.socks.values()].filter(s => s !== except && (s.id === r || s.rooms.has(r)));
    const e = { emit: (ev, d) => { for (const s of list) s.emit(ev, d); } }; e.volatile = e;
    return e;
  }
}
const io = new HostIO();
startGame(io, { migrate: true });
onmessage = ({ data: [t, id, m] }) => {
  if (t === 'add') io.add(id, (msg) => postMessage([id, msg]));
  else if (t === 'msg') io.socks.get(id)?.recv(m);
  else io.drop(id);
};

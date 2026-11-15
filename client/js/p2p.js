import { Peer } from 'peerjs';
import { startGame } from './game-server.js';

// Spielen ohne eigenen Server: Der Browser, der einen Raum erstellt, rechnet das Spiel (game-server.js),
// die anderen verbinden sich direkt per WebRTC. Den Kontakt vermittelt der freie PeerJS-Dienst.
// Raumliste: Ein Gastgeber hält das Verzeichnis (feste Kennung LOBBY); fehlt es, übernimmt der nächste.
const PFX = 'grand-tor-auto-v1-', LOBBY = PFX + 'lobby';
const PEER = new URLSearchParams(location.search).get('peer'); // ?peer=host:port = eigener Vermittler (lokale Tests); beim Laden lesen, das Spiel ändert die Adresse später
const opts = () => PEER ? { host: PEER.split(':')[0], port: +PEER.split(':')[1] || 9000, path: '/', secure: false } : {};

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
// Client-Seite, so wie net.js Socket.io benutzt
class ClientSocket {
  constructor() { Object.assign(this, { h: {}, acks: {}, n: 0, send: null, closer: null }); }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); }
  once(ev, fn) { const w = (d) => { this.h[ev] = this.h[ev].filter(f => f !== w); fn(d); }; this.on(ev, w); }
  emit(ev, ...a) { const ack = typeof a.at(-1) === 'function' ? a.pop() : null; if (ack) this.acks[++this.n] = ack; this.send?.([ev, a, ack ? this.n : null]); }
  get volatile() { return this; }
  recv([ev, d, r]) { if (ev === '__ack') { this.acks[d]?.(r); delete this.acks[d]; } else this.fire(ev, d); }
  fire(ev, d) { for (const f of this.h[ev] || []) f(d); }
  close() { this.closer?.(); }
}

// Raum erstellen: Spiel läuft hier, eigener Client über eine direkte Leitung; andere kommen per WebRTC
export function host(code, name) {
  const io = new HostIO(), timer = startGame(io), cs = new ClientSocket(), clone = (m) => JSON.parse(JSON.stringify(m));
  const local = io.add('local', (m) => { const c = clone(m); queueMicrotask(() => cs.recv(c)); });
  cs.send = (m) => { const c = clone(m); queueMicrotask(() => local.recv(c)); };
  const peer = new Peer(PFX + code.toLowerCase(), opts());
  peer.on('connection', (conn) => {
    if (conn.peer.startsWith(PFX + 'lobby')) return;
    conn.on('open', () => {
      const s = io.add(conn.connectionId, (m) => conn.open && conn.send(m));
      conn.on('data', (m) => s.recv(m));
      conn.on('close', () => io.drop(s.id));
    });
  });
  peer.on('error', (e) => { if (e.type === 'peer-unavailable' && e.message.includes(LOBBY)) becomeLobby(); else console.warn('P2P', e.type); });
  let lobby = null;
  const announce = () => {
    const info = { code, host: name, n: io.socks.size };
    if (dir) return dir.set(code, { ...info, t: Date.now() });
    if (lobby?.open) return lobby.send(['add', info]);
    if (peer.open) { lobby = peer.connect(LOBBY, { serialization: 'json' }); lobby.on('open', () => lobby.send(['add', info])); }
  };
  const ann = setInterval(announce, 5000); setTimeout(announce, 1500);
  cs.closer = () => { clearInterval(ann); clearInterval(timer); peer.destroy(); dirPeer?.destroy(); dir = dirPeer = null; };
  return cs;
}

// Verzeichnis offener Räume (nur bei einem Gastgeber)
let dir = null, dirPeer = null;
function becomeLobby() {
  if (dirPeer) return;
  dirPeer = new Peer(LOBBY, opts());
  dirPeer.on('open', () => { dir = new Map(); });
  dirPeer.on('error', () => { dirPeer?.destroy(); dirPeer = null; }); // jemand anderes war schneller
  dirPeer.on('connection', (c) => c.on('data', ([t, info]) => {
    if (t === 'add' && dir) dir.set(info.code, { ...info, t: Date.now() });
    if (t === 'list') c.send([...(dir?.values() || [])].filter(r => Date.now() - r.t < 15000));
  }));
}
export function listRooms() {
  return new Promise((res) => {
    if (dir) return res([...dir.values()]);
    const p = new Peer(opts()), done = (v) => { p.destroy(); res(v); };
    p.on('open', () => { const c = p.connect(LOBBY, { serialization: 'json' }); c.on('open', () => c.send(['list'])); c.on('data', done); });
    p.on('error', () => done([]));
    setTimeout(() => done([]), 8000);
  });
}

// Einem Raum beitreten: direkte Verbindung zum Gastgeber
export function connect(code) {
  return new Promise((res, rej) => {
    const peer = new Peer(opts()), cs = new ClientSocket(), fail = (m) => { peer.destroy(); rej(new Error(m)); };
    const t = setTimeout(() => fail('Raum antwortet nicht.'), 12000);
    peer.on('open', () => {
      const conn = peer.connect(PFX + code.toLowerCase(), { serialization: 'json', reliable: true });
      cs.send = (m) => conn.open && conn.send(m); cs.closer = () => peer.destroy();
      conn.on('open', () => { clearTimeout(t); res(cs); });
      conn.on('data', (m) => cs.recv(m));
      conn.on('close', () => cs.fire('disconnect', 'Gastgeber hat den Raum verlassen'));
    });
    peer.on('error', (e) => { clearTimeout(t); fail(e.type === 'peer-unavailable' ? `Raum ${code} gibt es nicht (mehr).` : 'Keine Verbindung: ' + e.type); });
  });
}

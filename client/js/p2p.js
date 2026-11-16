import { Peer } from 'peerjs';

// Spielen ohne eigenen Server: Der Browser, der einen Raum erstellt, rechnet das Spiel (game-server.js),
// die anderen verbinden sich direkt per WebRTC. Den Kontakt vermittelt der freie PeerJS-Dienst.
// Raumliste: Ein Gastgeber hält das Verzeichnis (feste Kennung LOBBY); fehlt es, übernimmt der nächste.
const PFX = 'grand-tor-auto-v1-', LOBBY = PFX + 'lobby';
const PEER = new URLSearchParams(location.search).get('peer'); // ?peer=host:port = eigener Vermittler (lokale Tests); beim Laden lesen, das Spiel ändert die Adresse später
// Schulnetze lassen direkte Verbindungen oft nicht durch: dann läuft alles über einen TURN-Relay (auch über Port 443/TCP).
// shortcut: öffentlicher Gratis-Relay (Open Relay Project), kann abgeschaltet werden; dann eigenen TURN-Server eintragen
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }];
const opts = () => ({ ...(PEER ? { host: PEER.split(':')[0], port: +PEER.split(':')[1] || 9000, path: '/', secure: false } : {}), config: { iceServers: ICE } });

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

// Raum erstellen: Spiel läuft in einem Worker (Hintergrund-Tabs bremsen dort keine Timer), eigener Client direkt, andere per WebRTC
export function host(code, name) {
  const w = new Worker(new URL('./host-worker.js', import.meta.url), { type: 'module' }), conns = new Map(), cs = new ClientSocket();
  w.onmessage = ({ data: [id, m] }) => conns.get(id)?.(m);
  conns.set('local', (m) => cs.recv(m)); w.postMessage(['add', 'local']);
  cs.send = (m) => w.postMessage(['msg', 'local', m]);
  const peer = new Peer(PFX + code.toLowerCase(), opts());
  peer.on('connection', (conn) => {
    if (conn.peer.startsWith(PFX + 'lobby')) return;
    conn.on('open', () => {
      const id = conn.connectionId;
      let last = Date.now();
      const drop = () => { if (!conns.delete(id)) return; clearInterval(beat); conn.close(); w.postMessage(['drop', id]); };
      const beat = setInterval(() => Date.now() - last > 20000 && drop(), 5000); // stumme Mitspieler (Tab zu, Netz weg) entfernen
      conns.set(id, (m) => conn.open && conn.send(m)); w.postMessage(['add', id]);
      conn.on('data', (m) => { last = Date.now(); w.postMessage(['msg', id, m]); });
      conn.on('close', drop);
    });
  });
  peer.on('error', (e) => { if (e.type === 'peer-unavailable' && e.message.includes(LOBBY)) becomeLobby(); else console.warn('P2P', e.type); });
  let lobby = null;
  const announce = () => {
    const info = { code, host: name, n: conns.size };
    if (dir) return dir.set(code, { ...info, t: Date.now() });
    if (lobby?.open) return lobby.send(['add', info]);
    if (peer.open) { lobby = peer.connect(LOBBY, { serialization: 'json' }); lobby.on('open', () => lobby.send(['add', info])); }
  };
  const ann = setInterval(announce, 5000); setTimeout(announce, 1500);
  cs.closer = () => { clearInterval(ann); w.terminate(); peer.destroy(); dirPeer?.destroy(); dir = dirPeer = null; };
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
export function connect(code, wait = 12000) {
  return new Promise((res, rej) => {
    const peer = new Peer(opts()), cs = new ClientSocket(), fail = (m) => { peer.destroy(); rej(new Error(m)); };
    const t = setTimeout(() => fail('Raum antwortet nicht.'), wait);
    peer.on('open', () => {
      const conn = peer.connect(PFX + code.toLowerCase(), { serialization: 'json', reliable: true });
      let last = Date.now(), gone = false, beat = 0;
      const lost = () => { if (gone) return; gone = true; clearInterval(beat); peer.destroy(); cs.fire('disconnect', 'Gastgeber hat den Raum verlassen'); };
      cs.send = (m) => conn.open && conn.send(m); cs.closer = () => { gone = true; clearInterval(beat); peer.destroy(); };
      conn.on('open', () => { clearTimeout(t); last = Date.now(); beat = setInterval(() => Date.now() - last > 6000 && lost(), 2000); res(cs); }); // Browser melden ein geschlossenes Gegenüber oft nicht: Stille = weg
      conn.on('data', (m) => { last = Date.now(); cs.recv(m); });
      conn.on('close', lost);
    });
    peer.on('error', (e) => { clearTimeout(t); fail(e.type === 'peer-unavailable' ? `Raum ${code} gibt es nicht (mehr).` : 'Keine Verbindung: ' + e.type); });
  });
}

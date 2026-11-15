import { io } from 'socket.io-client';

// Puffer für Snapshot-Interpolation: speichert (Serverzeit, Zustand) und liefert
// die zwei umgebenden Zustände + Mischfaktor für eine Renderzeit in der Vergangenheit.
export class Interp {
  constructor() { this.b = []; }
  push(t, s) {
    const b = this.b;
    if (b.length && t <= b[b.length - 1].t) return;
    b.push({ t, s });
    if (b.length > 30) b.shift();
  }
  clear() { this.b.length = 0; }
  len() { return this.b.length; }
  last() { return this.b[this.b.length - 1]?.s; }
  sample(t) {
    const b = this.b;
    if (!b.length) return null;
    if (t <= b[0].t) return [b[0].s, b[0].s, 0];
    for (let i = b.length - 1; i >= 0; i--) {
      if (b[i].t <= t) {
        const a = b[i], n = b[i + 1];
        if (!n) return [a.s, a.s, 0]; // keine neueren Daten: letzten Stand halten statt riskant zu extrapolieren
        if (i > 2) b.splice(0, i - 2); // danach stimmen die Indizes nicht mehr -> a/n vorher merken
        return [a.s, n.s, (t - a.t) / (n.t - a.t)];
      }
    }
    return null;
  }
}

export const RENDER_DELAY = 110; // ms "in der Vergangenheit" rendern (2 Server-Ticks Puffer)

export class Net {
  constructor(url, socket) { // socket = direkte Verbindung (p2p.js) statt Socket.io
    this.socket = socket || io(url || undefined, { transports: ['websocket', 'polling'], reconnection: true, timeout: 8000 });
    this.offset = null; // Serverzeit - lokale Zeit
  }
  serverNow() { return performance.now() + (this.offset ?? 0); }
  sync(t) {
    const o = t - performance.now();
    // kleine Verzögerungen sofort übernehmen, Ausreißer nur langsam
    this.offset = this.offset === null ? o : (o > this.offset ? this.offset + (o - this.offset) * 0.2 : this.offset + (o - this.offset) * 0.02);
  }
  on(ev, fn) { this.socket.on(ev, fn); }
  emit(ev, ...a) { this.socket.emit(ev, ...a); }
  volatile(ev, ...a) { this.socket.volatile.emit(ev, ...a); }
  join(data) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('Server antwortet nicht. Läuft er und stimmt die Adresse?')), 9000);
      this.socket.once('connect_error', (e) => { clearTimeout(t); rej(new Error('Keine Verbindung zum Server: ' + e.message)); });
      this.socket.emit('join', data, (r) => { clearTimeout(t); r.error ? rej(new Error(r.error)) : res(r); });
    });
  }
  close() { this.socket.close(); }
}

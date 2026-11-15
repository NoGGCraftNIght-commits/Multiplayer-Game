// Selbsttest des Servers: `npm test` startet ihn auf einem Testport und spielt echte Clients durch.
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { MAX_PLAYERS, WEAPONS } from '../client/js/shared.js';

process.env.PORT ||= '3987';
const { httpServer, io, rooms } = await import('./server.js');
const url = `http://localhost:${process.env.PORT}`;
const clients = [];
const client = () => { const s = connect(url, { transports: ['websocket'], forceNew: true }); clients.push(s); return s; };
const join = (s, data) => new Promise(res => s.emit('join', data, res));
const once = (s, ev, ok = () => true) => new Promise(res => { const f = (d) => { if (ok(d)) { s.off(ev, f); res(d); } }; s.on(ev, f); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const step = (name) => console.log('ok  ' + name);

// --- HTTP: Client wird ausgeliefert, kein Zugriff außerhalb von client/
assert.equal(await (await fetch(url + '/health')).text(), 'ok');
assert.match(await (await fetch(url + '/')).text(), /Spritzstadt/);
assert.notEqual((await fetch(url + '/..%2fserver%2fserver.js')).status, 200);
step('HTTP');

// --- Beitritt: Eingaben werden bereinigt, zweiter Spieler landet im selben Raum
const a = client(), b = client();
const ra = await join(a, { name: 'Anna<script>', avatar: 99, color: 'rot' });
assert.match(ra.room, /^[A-Z0-9]{5}$/);
assert.deepEqual([ra.players[0].name, ra.players[0].avatar, ra.players[0].color], ['Annascript', 11, '#ff5aa0']);
assert(ra.vehicles.length > 20 && ra.vehicles.some(v => v[11]), 'geparkte Autos und Verkehr');
const joined = once(a, 'pjoin');
const rb = await join(b, { room: ra.room.toLowerCase(), name: 'Ben', avatar: 1, color: '#35c2ff' });
assert.equal(rb.room, ra.room); assert.equal((await joined).name, 'Ben'); assert.equal(rb.players.length, 2);
step('Beitritt');

// --- Zustand: eigene Position kommt im Snapshot bei den anderen an; Passanten werden gesendet
const [bx, bz] = rb.spawn;
a.emit('st', [bx + 30, 0, bz, 1.5, 2, 1, 0.1]);
const snap = await once(b, 'snap', s => s.p.some(p => p[0] === ra.id && Math.abs(p[1] - (bx + 30)) < 0.01));
assert.equal(snap.p.find(p => p[0] === ra.id)[7], 1, 'Waffe wird übertragen');
assert.equal((await once(b, 'peds')).a.length % 5, 0);
step('Snapshots');

// --- Treffer: aus 30 m ist die Konfetti-Kanone (Reichweite 22 m) zu weit weg -> abgelehnt
let hp = null; b.on('hp', d => { hp = d; });
a.emit('hit', { t: 'p', id: rb.id, w: 2 }); await sleep(150);
assert.equal(hp, null, 'Treffer außerhalb der Reichweite wird verworfen');
a.emit('st', [bx + 3, 0, bz, 0, 0, 0, 0]); await sleep(60);
a.emit('hit', { t: 'p', id: rb.id, w: 0 }); await once(b, 'hp');
assert.equal(hp.hp, 100 - WEAPONS[0].damage);
for (let i = 0; i < 400; i++) a.emit('hit', { t: 'p', id: rb.id, w: 3 }); // Dauerfeuer weit über der Feuerrate
await sleep(200);
assert(hp.hp >= 100 - WEAPONS[0].damage - 2 * WEAPONS[3].damage, 'Feuerrate wird serverseitig begrenzt, 400 Treffer kommen nicht durch: ' + hp.hp);
step('Treffer + Schutz vor Schummeln');

// --- K.o. und Rückkehr
const ko = once(b, 'ko'), back = once(b, 'respawn');
for (let i = 0; i < 14; i++) { a.emit('hit', { t: 'p', id: rb.id, w: 3 }); await sleep(380); if (hp.hp === 0) break; }
assert.deepEqual([(await ko).id, (await ko).by, (await ko).score], [rb.id, ra.id, 1]);
assert.equal((await back).id, rb.id);
step('K.o. + Respawn');

// --- Fahrzeug: einsteigen nur aus der Nähe, Zustand wird verteilt, aussteigen gibt frei
const car = ra.vehicles.find(v => !v[11] && Math.hypot(v[1] - bx, v[3] - bz) > 30);
assert.equal(await new Promise(res => a.emit('enter', car[0], res)), false, 'zu weit weg');
a.emit('st', [car[1] + 2, 0, car[3], 0, 0, 0, 0]); await sleep(60);
const own = once(b, 'vown');
assert.equal(await new Promise(res => a.emit('enter', car[0], res)), true);
assert.deepEqual(await own, { vid: car[0], driver: ra.id });
assert.equal(await new Promise(res => b.emit('enter', car[0], res)), false, 'schon besetzt');
a.emit('vs', [car[0], car[1] + 5, 0, car[3], 0, 0, 0, 1, 0.2]);
await once(b, 'snap', s => s.v.some(v => v[0] === car[0] && Math.abs(v[1] - (car[1] + 5)) < 0.01 && v[9] === ra.id));
const free = once(b, 'vown'); a.emit('exit');
assert.equal((await free).driver, 0);
step('Fahrzeuge');

// --- Verkehr fließt (bleibt nicht hinter geparkten Autos hängen)
const room = rooms.get(ra.room), traffic = room.vehicles.filter(v => v.traffic), from = traffic.map(v => [v.x, v.z]);
await sleep(4000);
const moving = traffic.filter((v, i) => Math.hypot(v.x - from[i][0], v.z - from[i][1]) > 8).length;
assert(moving >= traffic.length - 2, `Verkehr steht: nur ${moving} von ${traffic.length} fahren`);
step('Verkehr');

// --- Raum voll
for (let i = 2; i < MAX_PLAYERS; i++) assert(!(await join(client(), { room: ra.room })).error);
assert.match((await join(client(), { room: ra.room })).error, /voll/);
const left = once(a, 'pleave'); b.close();
assert.equal((await left).id, rb.id);
step('Raumgrenze + Verlassen');

for (const s of clients) s.close();
io.close(); httpServer.close();
console.log('Alle Server-Tests bestanden.');
process.exit(0);

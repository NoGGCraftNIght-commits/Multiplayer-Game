// Selbsttest des Servers: `npm test` startet ihn auf einem Testport und spielt echte Clients durch.
// Aufbau per direktem Zugriff auf den Serverzustand (place), geprüft wird über das Netzprotokoll.
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { MAX_PLAYERS, WEAPONS, AVATARS, buildCity, node } from '../client/js/shared.js';

process.env.PORT ||= '3987';
const { httpServer, io, rooms } = await import('./server.js');
const url = `http://localhost:${process.env.PORT}`;
const clients = [];
const client = () => { const s = connect(url, { transports: ['websocket'], forceNew: true }); clients.push(s); return s; };
const join = (s, data) => new Promise(res => s.emit('join', data, res));
const once = (s, ev, ok = () => true) => new Promise((res, rej) => { // hängt nie: nach 15 s Fehler mit Ereignisname
  const t = setTimeout(() => rej(new Error('wartet vergeblich auf: ' + ev)), 15000);
  const f = (d) => { if (ok(d)) { clearTimeout(t); s.off(ev, f); res(d); } };
  s.on(ev, f);
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const step = (name) => console.log('ok  ' + name);
const place = (p, x, z) => Object.assign(p, { x, z, budget: 12 });

// --- HTTP: Client wird ausgeliefert, kein Zugriff außerhalb von client/
assert.equal(await (await fetch(url + '/health')).text(), 'ok');
assert.match(await (await fetch(url + '/')).text(), /Spritzstadt/);
assert.notEqual((await fetch(url + '/..%2fserver%2fserver.js')).status, 200);
step('HTTP');

// --- Beitritt: Eingaben werden bereinigt, zweiter Spieler landet im selben Raum
const a = client(), b = client();
const ra = await join(a, { name: 'Anna<script>', avatar: 99, color: 'rot' });
assert.match(ra.room, /^[A-Z0-9]{5}$/);
assert.deepEqual([ra.players[0].name, ra.players[0].avatar, ra.players[0].color], ['Annascript', AVATARS.length - 1, '#ff5aa0']);
assert(ra.vehicles.length > 20 && ra.vehicles.some(v => v[11]), 'geparkte Autos und Verkehr');
const joined = once(a, 'pjoin');
const rb = await join(b, { room: ra.room.toLowerCase(), name: 'Ben', avatar: 1, color: '#35c2ff' });
assert.equal(rb.room, ra.room); assert.equal((await joined).name, 'Ben'); assert.equal(rb.players.length, 2);
step('Beitritt');

const room = rooms.get(ra.room), all = [...room.players.values()], pa = all.find(p => p.id === ra.id), pb = all.find(p => p.id === rb.id);
const [X, Z] = node(2, 2), wall = buildCity().solids[0], wz = (wall.z0 + wall.z1) / 2; // freie Kreuzung, ein Gebäude
const fixes = [], ammoMsgs = []; a.on('fix', f => fixes.push(f)); a.on('ammo', m => ammoMsgs.push(m));
let hp = null; b.on('hp', d => { hp = d; });
let seen = 0; b.on('shoot', () => { seen++; });
const shoot = (w, x, z, dx) => a.emit('shoot', { w, o: [x, 1.4, z], d: [dx, 0, 0], seed: 1 });
const hitB = (w) => a.emit('hit', { t: 'p', id: rb.id, w });

// --- Position: normale Schritte kommen an, Teleport und Gebäude-Innenraum werden zurückgesetzt
place(pa, X, Z);
a.emit('st', [X + 0.3, 0, Z, 1.5, 2, 1, 0.1]);
const snap = await once(b, 'snap', s => s.p.some(p => p[0] === ra.id && Math.abs(p[1] - (X + 0.3)) < 0.01));
assert.equal(snap.p.find(p => p[0] === ra.id)[7], 1, 'Waffe wird übertragen');
await sleep(40); // der Server nimmt höchstens alle 25 ms einen Stand an
a.emit('st', [X + 60, 0, Z, 0, 0, 0, 0]); await sleep(120);
assert.deepEqual([fixes.length, fixes[0], pa.x], [1, [X + 0.3, Z], X + 0.3], 'Teleport abgelehnt und zurückgesetzt');
place(pa, wall.x0 - 1, wz); await sleep(250);
a.emit('st', [wall.x0 + 1, 0, wz, 0, 0, 0, 0]); await sleep(120);
assert.deepEqual([fixes.length, pa.x], [2, wall.x0 - 1], 'Position im Gebäude abgelehnt');
assert.equal((await once(b, 'peds')).a.length % 5, 0);
step('Position');

// --- Treffer zählen nur mit passendem Schuss: Richtung, Sichtlinie, ein Projektil = ein Treffer
place(pa, X + 3, Z); place(pb, X, Z);
hitB(0); await sleep(120);
assert.equal(hp, null, 'Treffer ohne Schuss wird verworfen');
shoot(0, X + 3, Z, 1); hitB(0); await sleep(150);
assert.equal(hp, null, 'Schuss in die falsche Richtung trifft nicht');
shoot(0, X + 3, Z, -1); hitB(0); hitB(0); await sleep(150);
assert.equal(hp.hp, 100 - WEAPONS[0].damage, 'ein Projektil, ein Treffer');
place(pa, wall.x0 - 2, wz); place(pb, wall.x1 + 2, wz);
shoot(0, wall.x0 - 2, wz, 1); hitB(0); await sleep(150);
assert.equal(hp.hp, 100 - WEAPONS[0].damage, 'kein Treffer durch die Wand');
step('Treffer nur mit echtem Schuss');

// --- Munition und Feuerrate liegen beim Server
place(pa, X + 3, Z); place(pb, X, Z); await sleep(400); seen = 0;
for (let i = 0; i < 60; i++) shoot(0, X + 3, Z, -1);
await sleep(200);
assert(seen >= 1 && seen <= 5 && ammoMsgs.length > 50, `Dauerfeuer wird gebremst: ${seen} von 60 Schüssen`);
pa.ammo[1] = 1; await sleep(500);
shoot(1, X + 3, Z, -1); await sleep(450); ammoMsgs.length = 0;
shoot(1, X + 3, Z, -1); await sleep(100);
assert.deepEqual([pa.ammo[1], ammoMsgs.length, ammoMsgs[0]?.[1]], [0, 1, 0], 'leeres Magazin: kein Schuss, Client bekommt den echten Stand');
pa.reloadAt = 0; await sleep(400);
shoot(1, X + 3, Z, -1); await sleep(100);
assert.equal(pa.ammo[1], WEAPONS[1].mag - 1, 'nach dem Nachladen ist das Magazin voll');
step('Munition');

// --- K.o. und Rückkehr
pb.hp = 5; await sleep(200);
const ko = once(b, 'ko'), back = once(b, 'respawn');
shoot(0, X + 3, Z, -1); hitB(0);
assert.deepEqual([(await ko).id, (await ko).by, (await ko).score], [rb.id, ra.id, 1]);
assert.equal((await back).id, rb.id);
step('K.o. + Respawn');

// --- Fahrzeug: einsteigen nur aus der Nähe, Zustand wird verteilt, Teleport wird zurückgesetzt
const car = ra.vehicles.find(v => !v[11]), v = room.vehicles[car[0]], enter = (s) => new Promise(res => s.emit('enter', car[0], res));
place(pa, car[1] + 30, car[3]);
assert.equal(await enter(a), false, 'zu weit weg');
place(pa, car[1] + 2, car[3]);
const own = once(b, 'vown');
assert.equal(await enter(a), true);
assert.deepEqual(await own, { vid: car[0], driver: ra.id });
assert.equal(await enter(b), false, 'schon besetzt');
let t = 5000, z = car[3];
const vs = (x) => a.emit('vs', [car[0], x, 0, z, 0, 0, 0, 1, 0.2, t += 50]);
vs(car[1] + 5);
await once(b, 'snap', s => s.v.some(q => q[0] === car[0] && Math.abs(q[1] - (car[1] + 5)) < 0.01 && q[9] === ra.id));
const vfix = once(a, 'vfix'); vs(car[1] + 400);
assert.equal((await vfix)[1], car[1] + 5, 'Auto-Teleport abgelehnt');
step('Fahrzeuge');

// --- Autoschaden: der Server liest den Aufprall aus dem Fahrverlauf (72 km/h -> Stand), Zone vorn, dann Feuer und Explosion
// sanft auf 20 m/s beschleunigen (starkes Beschleunigen wäre selbst ein Stoß von hinten), dann schlagartig stehen
const drive = async () => { for (let k = 1; k <= 14; k++) { if (k <= 12) z += Math.min(20, k * 2) * 0.05; vs(car[1] + 5); await sleep(50); } };
let dmg = once(a, 'vdmg'); await drive();
let d = await dmg;
assert(d[1] < 75 && d[1] > 50 && d[2] > 20 && d[3] + d[4] + d[5] === 0 && d[6] === 0, 'Frontschaden nach Aufprall: ' + d);
v.hp = 5; dmg = once(a, 'vdmg', q => q[6] === 1); await drive();
await dmg; // brennt
const boom = once(b, 'vdmg', q => q[6] === 2), koA = once(a, 'ko'), freed = once(b, 'vown');
v.boomAt = 0;
assert.equal((await boom)[1], 0);
assert.deepEqual([(await koA).id, (await koA).by, (await koA).w, (await freed).driver], [ra.id, 0, -2, 0], 'Explosion wirft den Fahrer um');
place(pb, v.x + 2, v.z);
assert.equal(await enter(b), false, 'Wrack ist nicht fahrbar');
const fresh = once(b, 'vdmg', q => q[6] === 0); v.resetAt = 0;
assert.deepEqual((await fresh).slice(1), [100, 0, 0, 0, 0, 0], 'Wrack wird ersetzt');
assert.deepEqual([v.x, v.z], v.home.slice(0, 2), 'und steht wieder am Parkplatz');
step('Autoschaden + Explosion');

// --- Fahndung: Sterne für Vergehen, Stadtwache rückt an und spritzt zurück, ab 3 Sternen Hubschrauber mit Abseilen, Verjährung
await once(a, 'respawn');
const wantedMsgs = []; a.on('wanted', m => wantedMsgs.push(m));
const ped = room.peds[0];
place(pa, ped.x + 3, ped.z); pa.wanted = 0.6; await sleep(300);
a.emit('shoot', { w: 0, o: [pa.x, 1.4, pa.z], d: [ped.x - pa.x, 0, ped.z - pa.z], seed: 1 }); a.emit('hit', { t: 'n', id: 0, w: 0 });
await once(a, 'wanted', m => m.stars === 1);
const pedsMsg = await once(a, 'peds', m => m.c?.some((q, i) => i % 6 === 4 && q >= 0));
assert.equal(pedsMsg.c.length, 48, 'Wachen stehen in der Passanten-Nachricht');
const cop = room.cops.find(Boolean);
assert(Math.hypot(cop.x - pa.x, cop.z - pa.z) > 40, 'Wache erscheint außer Sicht');
place(pa, X, Z); Object.assign(cop, { x: X + 8, z: Z, node: null }); pa.hp = 100;
assert.equal((await once(a, 'hp', q => q.id === ra.id)).w, -3, 'Wache trifft mit Wasser');
cop.hp = 1; const before = pa.wanted;
a.emit('shoot', { w: 0, o: [X, 1.4, Z], d: [1, 0, 0], seed: 1 }); a.emit('hit', { t: 'c', id: cop.id, w: 0 }); await sleep(150);
assert.deepEqual([cop.state, pa.wanted > before + 1], ['down', true], 'Wache umgespritzt gibt Sterne');
pa.wanted = 3.2; pa.hp = 1e6; await once(a, 'peds', m => m.h);
Object.assign(room.heli, { x: X, z: Z, y: room.heli.want });
await once(a, 'peds', m => m.h[4] === 1); // Seil hängt: jemand kommt herunter
const roper = room.cops.find(c => c && c.state === 'rope');
assert(roper.y > 10, 'Wache seilt sich aus dem Hubschrauber ab');
room.cops.fill(null); room.heli = null; pa.seenT = 0; pa.hp = 100;
await once(a, 'wanted', m => m.stars === 0);
assert.equal(pa.wanted, 0, 'Sterne verjähren ohne Wache in der Nähe');
step('Fahndung, Stadtwache, Hubschrauber');

// --- Verkehr fließt (bleibt nicht hinter geparkten Autos hängen)
const traffic = room.vehicles.filter(q => q.traffic), from = traffic.map(q => [q.x, q.z]);
await sleep(4000);
const moving = traffic.filter((q, i) => Math.hypot(q.x - from[i][0], q.z - from[i][1]) > 8).length;
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

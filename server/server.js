// Spritzstadt – Multiplayer-Server (Node.js + Socket.io)
// Verwaltet Räume (max. 16 Spieler), synchronisiert Spieler, Fahrzeuge, Schüsse,
// simuliert Passanten und Verkehr serverseitig und liefert optional den Client aus.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import {
  MAX_PLAYERS, TICK_HZ, PED_HZ, A, AVATARS, WEAPONS, VEHICLE_TYPES, CAR_HIT_DAMAGE, GRID, HALF, BEACH, LANE, ROAD,
  buildCity, sidewalkLoop, node, rng, clamp, sanitizeName, sanitizeRoom,
} from '../client/js/shared.js';

const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const IDLES = [A.idle, A.look, A.phone, A.photo, A.talk, A.laugh, A.dance, A.clap]; // Passanten stehen nicht nur herum
const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client');
const SEED = 1337;           // alle Räume nutzen dieselbe Stadt
const PEDS_PER_ROOM = 70;
const TRAFFIC_PER_ROOM = 12;
const RESPAWN_MS = 4000;

// ---------- statische Dateien (damit "npm start" lokal sofort spielbar ist) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const httpServer = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (p === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(CLIENT_DIR, '.' + p);
  if (!file.startsWith(CLIENT_DIR + path.sep)) { res.writeHead(403); return res.end(); } // Path-Traversal-Schutz
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const io = new Server(httpServer, { cors: { origin: CORS_ORIGIN }, pingInterval: 10000, pingTimeout: 8000, maxHttpBufferSize: 1e5 });
const city = buildCity(SEED);
const rooms = new Map();
const r2 = (v) => Math.round(v * 100) / 100;
const finite = (...a) => a.every(Number.isFinite);

function newCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s;
  do { s = Array.from({ length: 5 }, () => c[Math.floor(Math.random() * c.length)]).join(''); } while (rooms.has(s));
  return s;
}

function randomSidewalkSpot(rand = Math.random) {
  const blocks = city.blocks;
  const b = blocks[Math.floor(rand() * blocks.length)];
  const loop = sidewalkLoop(b);
  const i = Math.floor(rand() * 4), [ax, az] = loop[i], [bx, bz] = loop[(i + 1) % 4], t = rand();
  return [ax + (bx - ax) * t, az + (bz - az) * t];
}

// ---------- Raum ----------
function createRoom(code) {
  const rand = rng(Math.floor(Math.random() * 1e9));
  const room = { code, players: new Map(), nextPid: 1, vehicles: [], peds: [], start: Date.now(), emptySince: 0 };
  // geparkte Autos
  city.parking.forEach((s, i) => {
    room.vehicles.push(makeVehicle(i, VEHICLE_TYPES[Math.floor(rand() * VEHICLE_TYPES.length)], s.x, s.z, s.yaw));
  });
  // Verkehr
  for (let k = 0; k < TRAFFIC_PER_ROOM; k++) {
    const i = Math.floor(rand() * (GRID + 1)), j = Math.floor(rand() * (GRID + 1));
    const types = ['sedan', 'taxi', 'van', 'suv', 'hatchback_sports', 'delivery_van', 'truck', 'police_car'];
    const v = makeVehicle(room.vehicles.length, types[k % types.length], 0, 0, 0);
    v.traffic = { path: [], from: [i, j], at: [i, j], speed: 9 + rand() * 4, cur: 0, wait: 0 };
    planTraffic(v, rand);
    const [x, z] = v.traffic.path[0];
    v.x = x; v.z = z;
    room.vehicles.push(v);
  }
  // Passanten
  for (let k = 0; k < PEDS_PER_ROOM; k++) {
    const block = Math.floor(rand() * city.blocks.length);
    room.peds.push({ id: k, avatar: Math.floor(rand() * AVATARS.length), block, s: rand() * 4 * 44, dir: rand() < 0.5 ? 1 : -1,
      base: 1.0 + rand() * 0.35, state: 'walk', timer: 3 + rand() * 10, x: 0, z: 0, yaw: 0, anim: A.walk, fleeFrom: null });
  }
  room.rand = rand;
  rooms.set(code, room);
  return room;
}

function makeVehicle(id, type, x, z, yaw) {
  return { id, type, x, y: 0, z, qx: 0, qy: Math.sin(yaw / 2), qz: 0, qw: Math.cos(yaw / 2), steer: 0, driver: 0, traffic: null, moved: Date.now() };
}

// Verkehrsweg: Spur rechts, an Kreuzungen weiche Kurve (quadratische Bézierkurve)
function planTraffic(v, rand) {
  const T = v.traffic;
  while (T.path.length < 12) {
    const [i, j] = T.at, [pi, pj] = T.from;
    const opts = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a <= GRID && b <= GRID);
    let next = opts.filter(([a, b]) => !(a === pi && b === pj));
    if (!next.length) next = opts;
    const [ni, nj] = next[Math.floor(rand() * next.length)];
    const [ax, az] = node(i, j), [bx, bz] = node(ni, nj);
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    const rx = -dz * LANE, rz = dx * LANE, inset = ROAD / 2 + 1;
    const start = [ax + dx * inset + rx, az + dz * inset + rz];
    const end = [bx - dx * inset + rx, bz - dz * inset + rz];
    const last = T.path[T.path.length - 1];
    if (last) { // Kurve von letzter Position über Kreuzungsecke zum neuen Startpunkt
      const cx = (last[0] + start[0]) / 2, cz = (last[1] + start[1]) / 2;
      const ctrl = Math.abs(last[0] - start[0]) > 1 && Math.abs(last[1] - start[1]) > 1
        ? (Math.abs(T.lastDir[0]) > 0.5 ? [start[0], last[1]] : [last[0], start[1]]) : [cx, cz];
      for (let s = 1; s <= 4; s++) {
        const t = s / 5, u = 1 - t;
        T.path.push([u * u * last[0] + 2 * u * t * ctrl[0] + t * t * start[0], u * u * last[1] + 2 * u * t * ctrl[1] + t * t * start[1]]);
      }
    }
    T.path.push(start, end);
    T.lastDir = [dx, dz];
    T.from = [i, j]; T.at = [ni, nj];
  }
}

function stepTraffic(room, v, dt) {
  const T = v.traffic;
  let target = T.path[T.cur + 1];
  if (!target) return;
  // vor Hindernissen im eigenen Fahrstreifen bremsen (Korridor statt Kegel: geparkte Autos am Rand zählen nicht)
  const dx0 = target[0] - v.x, dz0 = target[1] - v.z, l0 = Math.hypot(dx0, dz0) || 1, fx = dx0 / l0, fz = dz0 / l0;
  const ahead = (x, z, dist) => { const ax = x - v.x, az = z - v.z, f = ax * fx + az * fz; return f > 0.5 && f < dist && Math.abs(ax * fz - az * fx) < 1.7; };
  let car = false, person = false;
  for (const o of room.vehicles) if (o !== v && ahead(o.x, o.z, 9)) { car = true; break; }
  for (const p of room.players.values()) if (p.alive && !p.veh && ahead(p.x, p.z, 7)) { person = true; break; }
  T.wait = car ? T.wait + dt : 0; // steht dauerhaft ein Auto im Weg (verlassen, Stau über Kreuz), nach 5 s vorbeischieben
  const blocked = person || (car && T.wait < 5);
  T.v = blocked ? Math.max(0, (T.v || 0) - 20 * dt) : Math.min(T.speed, (T.v || 0) + 4 * dt);
  let move = T.v * dt;
  while (move > 0 && target) {
    const dx = target[0] - v.x, dz = target[1] - v.z, d = Math.hypot(dx, dz);
    if (d <= move) { v.x = target[0]; v.z = target[1]; move -= d; T.cur++; target = T.path[T.cur + 1]; }
    else { v.x += dx / d * move; v.z += dz / d * move; move = 0; }
    if (d > 0.01) { const yaw = Math.atan2(dx, dz); v.qy = Math.sin(yaw / 2); v.qw = Math.cos(yaw / 2); }
  }
  if (T.cur > 6) { T.path.splice(0, T.cur); T.cur = 0; planTraffic(v, room.rand); }
  v.y = 0; v.moved = Date.now();
}

function stepPed(room, p, dt) {
  const b = city.blocks[p.block], loop = sidewalkLoop(b);
  const per = (b.x1 - b.x0 - 4) * 4; // Umfang des Gehweg-Rundwegs (quadratischer Block)
  p.timer -= dt;
  let speed = 0;
  switch (p.state) {
    case 'walk': speed = p.base; p.anim = A.walk;
      if (p.timer <= 0) { const r = room.rand(); if (r < 0.3) { p.state = 'idle'; p.timer = 4 + room.rand() * 6; p.ia = IDLES[Math.floor(room.rand() * IDLES.length)]; } else if (r < 0.32) { p.state = 'sit'; p.timer = 6 + room.rand() * 6; } else { p.timer = 4 + room.rand() * 10; if (room.rand() < 0.2) p.dir *= -1; } }
      break;
    case 'idle': p.anim = p.ia ?? A.idle; if (p.timer <= 0) { p.state = 'walk'; p.timer = 5 + room.rand() * 10; } break;
    case 'sit': p.anim = A.crouch; if (p.timer <= 0) { p.state = 'walk'; p.timer = 5 + room.rand() * 8; } break;
    case 'greet': p.anim = A.wave; if (p.timer <= 0) { p.state = 'walk'; p.timer = 4; } break;
    case 'react': p.anim = A.scared; if (p.timer <= 0) { p.state = 'flee'; p.timer = 6; } break;
    case 'down': p.anim = A.down; if (p.timer <= 0) { p.state = 'react'; p.timer = 1.2; } break;
    case 'flee': speed = 5.2; p.anim = A.sprint;
      if (p.fleeFrom) { // vom Störer weglaufen: Richtung entlang des Rundwegs wählen
        const [ax, az] = pedPos(loop, per, p.s + 1), away = Math.hypot(ax - p.fleeFrom[0], az - p.fleeFrom[1]) > Math.hypot(p.x - p.fleeFrom[0], p.z - p.fleeFrom[1]);
        p.dir = away ? 1 : -1; p.fleeFrom = null;
      }
      if (p.timer <= 0) { p.state = 'walk'; p.timer = 5; }
      break;
  }
  p.s = ((p.s + p.dir * speed * dt) % per + per) % per;
  const [x, z] = pedPos(loop, per, p.s);
  if (speed > 0) { const dx = x - p.x, dz = z - p.z; if (Math.abs(dx) + Math.abs(dz) > 1e-4) p.yaw = Math.atan2(dx, dz); }
  if (p.state === 'greet' && p.faceTo) p.yaw = Math.atan2(p.faceTo[0] - x, p.faceTo[1] - z);
  p.x = x; p.z = z;
}

function pedPos(loop, per, s) {
  const side = per / 4, i = Math.floor(s / side) % 4, t = (s - i * side) / side;
  const [ax, az] = loop[i], [bx, bz] = loop[(i + 1) % 4];
  return [ax + (bx - ax) * t, az + (bz - az) * t];
}

function scarePeds(room, x, z, radius) {
  for (const p of room.peds) {
    if (p.state === 'down' || p.state === 'react') continue;
    if (Math.hypot(p.x - x, p.z - z) < radius) { p.state = 'flee'; p.timer = 5 + room.rand() * 3; p.fleeFrom = [x, z]; }
  }
}

const publicPlayer = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, hp: p.hp, score: p.score, kos: p.kos });
const vehState = (v) => [v.id, r2(v.x), r2(v.y), r2(v.z), r2(v.qx), r2(v.qy), r2(v.qz), r2(v.qw), r2(v.steer), v.driver, VEHICLE_TYPES.indexOf(v.type), v.traffic ? 1 : 0];

// ---------- Verbindungen ----------
io.on('connection', (socket) => {
  let room = null, me = null;

  socket.on('join', (data, ack) => {
    if (typeof ack !== 'function' || room) return;
    data = data || {};
    let code = sanitizeRoom(data.room);
    if (!code) code = newCode();
    room = rooms.get(code) || createRoom(code);
    if (room.players.size >= MAX_PLAYERS) { const full = room; room = null; if (!full.players.size) rooms.delete(code); return ack({ error: `Raum ${code} ist voll (${MAX_PLAYERS} Spieler).` }); }
    const color = /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : '#ff5aa0';
    const [x, z] = randomSidewalkSpot();
    me = { id: room.nextPid++, sid: socket.id, name: sanitizeName(data.name), avatar: clamp(data.avatar | 0, 0, AVATARS.length - 1), color,
      x, y: 0, z, yaw: 0, anim: A.idle, veh: 0, weap: 0, pitch: 0, hp: 100, alive: true, score: 0, kos: 0, hitLog: [], lastSt: 0 };
    room.players.set(socket.id, me);
    room.emptySince = 0;
    socket.join(code);
    socket.to(code).emit('pjoin', publicPlayer(me));
    ack({ id: me.id, room: code, seed: SEED, spawn: [x, z], serverTime: Date.now(), start: room.start,
      players: [...room.players.values()].map(publicPlayer), vehicles: room.vehicles.map(vehState) });
  });

  // eigener Spielerzustand: [x,y,z,yaw,anim,weap,pitch]
  socket.on('st', (s) => {
    if (!me || !Array.isArray(s)) return;
    const now = Date.now();
    if (now - me.lastSt < 25) return; // max. ~40/s
    me.lastSt = now;
    const [x, y, z, yaw, anim, weap, pitch] = s;
    if (!finite(x, y, z, yaw, pitch)) return;
    if (!me.alive) return; // während KO bestimmt der Server
    me.x = clamp(x, -HALF, HALF + BEACH + 5); me.y = clamp(y, -1, 200); me.z = clamp(z, -HALF, HALF);
    me.yaw = yaw; me.anim = clamp(anim | 0, 0, 127); me.weap = clamp(weap | 0, 0, WEAPONS.length - 1); me.pitch = clamp(pitch, -1.5, 1.5);
  });

  // Fahrzeugzustand vom Fahrer: [vid,x,y,z,qx,qy,qz,qw,steer]
  socket.on('vs', (s) => {
    if (!me || !Array.isArray(s)) return;
    const v = room.vehicles[s[0] | 0];
    if (!v || v.driver !== me.id || !finite(...s.slice(1, 9))) return;
    [, v.x, v.y, v.z, v.qx, v.qy, v.qz, v.qw, v.steer] = s;
    v.x = clamp(v.x, -HALF, HALF + BEACH + 5); v.z = clamp(v.z, -HALF, HALF); v.y = clamp(v.y, -2, 100);
    v.moved = Date.now();
    me.x = v.x; me.z = v.z; me.y = v.y;
  });

  socket.on('enter', (vid, ack) => {
    if (!me || typeof ack !== 'function') return;
    const v = room.vehicles[vid | 0];
    if (!v || !me.alive || me.veh || v.driver) return ack(false);
    if (Math.hypot(v.x - me.x, v.z - me.z) > 6) return ack(false);
    if (v.traffic) { v.traffic = null; scarePeds(room, v.x, v.z, 10); } // Verkehrsauto übernommen: Fahrer flieht (unsichtbar) – Passanten erschrecken
    v.driver = me.id; me.veh = v.id + 1; v.moved = Date.now();
    io.to(room.code).emit('vown', { vid: v.id, driver: me.id });
    ack(true);
  });

  socket.on('exit', () => {
    if (!me || !me.veh) return;
    releaseVehicle(room, me);
  });

  // Schuss (nur Effekt, Treffer kommen separat)
  socket.on('shoot', (s) => {
    if (!me || !me.alive || !s || !Array.isArray(s.o) || !Array.isArray(s.d)) return;
    if (!finite(...s.o, ...s.d)) return;
    socket.to(room.code).volatile.emit('shoot', { id: me.id, w: clamp(s.w | 0, 0, WEAPONS.length - 1), o: s.o.map(r2), d: s.d.map(r2), seed: s.seed | 0 });
    scarePeds(room, s.o[0], s.o[2], 16);
  });

  // Trefferbehauptung des Schützen -> Server prüft Plausibilität und wendet Schaden an
  socket.on('hit', (h) => {
    if (!me || !me.alive || !h) return;
    const now = Date.now();
    const isCar = h.w === 'car';
    const w = isCar ? null : WEAPONS[h.w | 0];
    if (!isCar && !w) return;
    // Ratenbegrenzung: nicht mehr Treffer als die Waffe abgeben kann
    me.hitLog = me.hitLog.filter(t => now - t < 1000);
    const maxPerSec = isCar ? 4 : Math.ceil(w.rate * w.pellets * 1.3) + 1;
    if (me.hitLog.length >= maxPerSec) return;
    me.hitLog.push(now);
    const src = isCar ? room.vehicles[me.veh - 1] : me;
    if (!src) return;
    const range = isCar ? 7 : w.range + 6;
    if (h.t === 'n') {
      const p = room.peds[h.id | 0];
      if (!p || Math.hypot(p.x - src.x, p.z - src.z) > range) return;
      if (isCar) { p.state = 'down'; p.timer = 2.5; }
      else if (p.state !== 'down') { p.state = 'react'; p.timer = 0.9; p.fleeFrom = [me.x, me.z]; }
      io.to(room.code).emit('pedhit', { id: p.id, by: me.id, car: isCar });
      return;
    }
    const target = [...room.players.values()].find(p => p.id === (h.id | 0));
    if (!target || target === me || !target.alive) return;
    if (Math.hypot(target.x - src.x, target.z - src.z) > range) return;
    const dmg = isCar ? CAR_HIT_DAMAGE : w.damage;
    target.hp = Math.max(0, target.hp - dmg);
    io.to(room.code).emit('hp', { id: target.id, hp: target.hp, by: me.id, w: isCar ? -1 : (h.w | 0) });
    if (target.hp <= 0) knockOut(room, target, me, isCar ? -1 : (h.w | 0));
  });

  socket.on('greet', (pid) => {
    if (!me) return;
    const p = room.peds[pid | 0];
    if (!p || Math.hypot(p.x - me.x, p.z - me.z) > 4 || p.state === 'flee' || p.state === 'down') return;
    p.state = 'greet'; p.timer = 2.2; p.faceTo = [me.x, me.z];
    io.to(room.code).emit('say', { ped: p.id, line: Math.floor(Math.random() * 1000), to: me.id });
  });

  socket.on('horn', () => { if (me && me.veh) { socket.to(room.code).volatile.emit('horn', { vid: me.veh - 1 }); const v = room.vehicles[me.veh - 1]; scarePeds(room, v.x, v.z, 9); } });
  socket.on('emote', (e) => { if (me) socket.to(room.code).emit('emote', { id: me.id, e: clamp(e | 0, 0, 3) }); });

  socket.on('disconnect', () => {
    if (!room || !me) return;
    if (me.veh) releaseVehicle(room, me);
    room.players.delete(socket.id);
    io.to(room.code).emit('pleave', { id: me.id });
    if (!room.players.size) room.emptySince = Date.now();
  });
});

function releaseVehicle(room, p) {
  const v = room.vehicles[p.veh - 1];
  p.veh = 0;
  if (!v) return;
  v.driver = 0; v.steer = 0; v.moved = Date.now();
  io.to(room.code).emit('vown', { vid: v.id, driver: 0 });
}

function knockOut(room, target, by, w) {
  target.alive = false; target.anim = A.down; by.score++; target.kos++;
  if (target.veh) releaseVehicle(room, target);
  io.to(room.code).emit('ko', { id: target.id, by: by.id, w, score: by.score, kos: target.kos });
  scarePeds(room, target.x, target.z, 14);
  setTimeout(() => {
    if (!room.players.has(target.sid)) return;
    const [x, z] = randomSidewalkSpot();
    Object.assign(target, { alive: true, hp: 100, x, y: 0, z, anim: A.idle });
    io.to(room.code).emit('respawn', { id: target.id, x, z });
  }, RESPAWN_MS);
}

// ---------- Simulation & Broadcast ----------
let pedAcc = 0;
setInterval(() => {
  const dt = 1 / TICK_HZ, now = Date.now();
  pedAcc += dt;
  const sendPeds = pedAcc >= 1 / PED_HZ - 1e-6;
  if (sendPeds) pedAcc = 0;
  for (const [code, room] of rooms) {
    if (!room.players.size) { if (now - room.emptySince > 60000) rooms.delete(code); continue; }
    for (const v of room.vehicles) if (v.traffic && !v.driver) stepTraffic(room, v, dt);
    for (const p of room.peds) stepPed(room, p, dt);
    const players = [...room.players.values()].map(p => [p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), p.anim, p.veh, p.weap, r2(p.pitch), p.hp]);
    const vehicles = room.vehicles.filter(v => v.driver || v.traffic || now - v.moved < 3000).map(vehState);
    io.to(code).emit('snap', { t: now, p: players, v: vehicles });
    if (sendPeds) {
      const a = [];
      for (const p of room.peds) a.push(r2(p.x), r2(p.z), r2(p.yaw), p.anim, p.avatar);
      io.to(code).emit('peds', { t: now, a });
    }
  }
}, 1000 / TICK_HZ);

httpServer.listen(PORT, () => {
  console.log(`Spritzstadt-Server läuft auf Port ${PORT}`);
  console.log(`Lokal spielen: http://localhost:${PORT}/`);
});

export { httpServer, io, rooms }; // für Tests

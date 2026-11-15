import * as THREE from 'three';
import { SERVER_URL } from './config.js';
import { loadAll, loadModel, assets } from './assets.js';
import { World, SLAB, QUALITY } from './world.js';
import { Vehicles } from './vehicles.js';
import { Character } from './character.js';
import { Combat } from './combat.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { makeHeli } from './heli.js';
import { Net, Interp, RENDER_DELAY } from './net.js';
import { A, AIM_FLAG, AVATARS, COPS, WEAPONS, DAY_LENGTH, TICK_HZ, PED_HZ, HALF, BEACH, buildCity, pushOut, clamp, sanitizeName, sanitizeRoom } from './shared.js';

// Spritzstadt – Spielschleife: Menü, Beitritt, eigene Figur, Kamera, Fahren, Netz, HUD.
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const COLORS = [['#ff5aa0', 'Pink'], ['#35c2ff', 'Blau'], ['#ffd23f', 'Gelb'], ['#7dffb0', 'Mint'], ['#b44dff', 'Lila'], ['#ff8a1f', 'Orange'], ['#ff4d4d', 'Rot'], ['#21e6c8', 'Türkis'], ['#ffffff', 'Weiß'], ['#9aa7ff', 'Flieder']];
const HELLO = ['Hi!', 'Schönes Wetter, oder?', 'Na, alles klar?', 'Tolle Farbe!', 'Moin!', 'Pass auf die Autos auf!', 'Ab an den Strand!', 'Hallo du!'];
const OUCH = ['Hey!', 'Ich bin ganz nass!', 'Na warte!', 'Uff!', 'Meine Frisur!', 'Huch!'];
const VERB = ['nass gespritzt', 'mit Schaumpfeilen erwischt', 'in Konfetti begraben', 'bunt angemalt'];
const WALK_V = 1.5, RUN_V = 3.6, SPRINT_V = 6.4, RADIUS = 0.38;

const store = {
  get(k, d) { try { return localStorage.getItem('ss_' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ss_' + k, v); } catch { /* privater Modus: Einstellungen gelten nur bis zum Neuladen */ } },
};
const settings = {
  quality: store.get('quality', matchMedia('(pointer: coarse)').matches ? 'low' : 'medium'), style: store.get('style', 'real'),
  sens: clamp(+store.get('sens', 1) || 1, 0.3, 2.5), sound: store.get('sound', '1') === '1',
};
if (!QUALITY[settings.quality]) settings.quality = 'medium';

const lerp = (a, b, k) => a + (b - a) * k;
const turn = (a, b) => { const d = (b - a) % (Math.PI * 2); return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d; }; // kürzester Winkel von a nach b
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const txt = (el, s) => { if (el._t !== s) el.textContent = el._t = s; };
const carYaw = (v) => Math.atan2(2 * (v.quat.w * v.quat.y + v.quat.x * v.quat.z), 1 - 2 * (v.quat.y * v.quat.y + v.quat.x * v.quat.x));
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _h = new THREE.Vector3(), fwd = new THREE.Vector3(), aimPt = new THREE.Vector3();
const head = (o) => _h.set(o.pos.x, o.pos.y + (o.veh ? 2.5 : 2.05), o.pos.z);

const canvas = $('game'), ui = {};
for (const id of ['hpbar', 'wname', 'ammo', 'weapon', 'speed', 'kmh', 'vname', 'crosshair', 'hitmarker', 'hint', 'ko', 'kotext', 'vignette', 'scoreboard', 'clock', 'playerCount', 'tAct', 'tHorn', 'tFire', 'tAim', 'tWeapon']) ui[id] = $(id);
const my = { name: '', avatar: 0, color: COLORS[0][0] };
const players = new Map(), joining = new Set(), peds = [], pedBuf = new Interp();
// Stadtwache: 8 feste Plätze; ohne Wachen/Hubschrauber schickt der Server nichts -> Leerstand einsetzen
const cops = [], copBuf = new Interp(), heliBuf = new Interp(), NOCOPS = Array.from({ length: 48 }, (_, i) => i % 6 === 4 ? -1 : 0), NOHELI = [0, -999, 0, 0, 0];
const cam = { yaw: 0, pitch: -0.12, dist: 3.9, side: 0.42, up: 1.6, fov: 65, free: 0, d: 3.9 };
let city, world, vehicles, combat, audio, input, hud, preview, net, me, heli, link = '';
// ?debug: Spielzustand für automatische Tests offenlegen (G.tod = feste Tageszeit)
const DEBUG = params.has('debug') ? window.G = { players, peds, cops, cam, tod: null, get heli() { return heli; }, get me() { return me; }, get net() { return net; }, get vehicles() { return vehicles; }, get combat() { return combat; }, get input() { return input; }, get world() { return world; } } : null;
let phase = 'load', paused = false, roomStart = 0, sendT = 0, slowT = 0, lockLost = 0, koUntil = 0, koBy = '', hitT = 0, tod = 0.735, simT = 0, last = performance.now();

// ---------- Start ----------
async function boot() {
  await loadAll(p => { $('loadbar').style.width = Math.round(p * 100) + '%'; });
  city = buildCity();
  world = new World(canvas, city, settings);
  vehicles = new Vehicles(world.scene, city, world.heights);
  audio = new Audio(); audio.enabled = settings.sound;
  input = new Input(canvas); input.sens = settings.sens;
  hud = new Hud(city);
  combat = new Combat({ scene: world.scene, city, heights: world.heights, groundY: (x, z) => world.groundY(x, z), vehicles, audio, targets, onHit, onReload: (w) => net.emit('reload', w) });
  vehicles.onBoom = (v) => { audio.play('impact', { pos: v.pos, vol: 3, rate: 0.32 }); audio.play('land', { pos: v.pos, vol: 2.5, rate: 0.45 }); };
  setupMenu();
  $('loading').classList.add('hidden'); $('menu').classList.remove('hidden');
  phase = 'menu';
  requestAnimationFrame(frame);
}

// kleine Vorschau der gewählten Figur (eigener Renderer auf dem Menü-Canvas)
function makePreview() {
  const r = new THREE.WebGLRenderer({ canvas: $('avatarPreview'), antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(180, 180, false);
  const scene = new THREE.Scene(), c = new THREE.PerspectiveCamera(26, 1, 0.1, 20), sun = new THREE.DirectionalLight(0xfff0e0, 2.2);
  c.position.set(0, 1.05, 4.5); c.lookAt(0, 0.95, 0); sun.position.set(2, 4, 3);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8090b0, 2.4), sun);
  let ch = null;
  return {
    set() {
      const a = my.avatar; $('avNum').textContent = `${a + 1} / ${AVATARS.length}`;
      loadModel(AVATARS[a]).then(() => { // bis die Figur da ist, bleibt die alte stehen
        if (a !== my.avatar) return;
        ch?.dispose(); ch = new Character(a, my.color, { ring: true, castShadow: false }); ch.setWeapon(0); scene.add(ch.root);
      });
    },
    draw(dt, t) { if (!ch) return; ch.root.rotation.y = Math.sin(t * 0.6) * 0.7; ch.update(dt); r.render(scene, c); },
  };
}

function setupMenu() {
  $('menu').querySelector('.settings-slot').append($('settings'));
  $('quality').value = settings.quality; $('style').value = settings.style; $('sens').value = settings.sens; $('sound').checked = settings.sound;
  $('settings').addEventListener('input', (e) => {
    Object.assign(settings, { quality: $('quality').value, style: $('style').value, sens: +$('sens').value, sound: $('sound').checked });
    for (const k of ['quality', 'style', 'sens']) store.set(k, settings[k]);
    store.set('sound', settings.sound ? '1' : '0');
    input.sens = settings.sens; audio.setEnabled(settings.sound);
    if (e.target.id === 'quality' || e.target.id === 'style') world.applySettings(settings);
  });

  my.avatar = clamp(+store.get('avatar', 0) | 0, 0, AVATARS.length - 1);
  my.color = COLORS.find(c => c[0] === store.get('color', ''))?.[0] || COLORS[0][0];
  preview = makePreview(); preview.set();
  const pick = (d) => { my.avatar = (my.avatar + d + AVATARS.length) % AVATARS.length; store.set('avatar', my.avatar); preview.set(); };
  $('avPrev').onclick = () => pick(-1); $('avNext').onclick = () => pick(1);
  for (const [c, label] of COLORS) {
    const b = document.createElement('button');
    b.style.background = c; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', label); b.setAttribute('aria-checked', c === my.color);
    b.onclick = () => { my.color = c; store.set('color', c); for (const o of $('colors').children) o.setAttribute('aria-checked', o === b); preview.set(); };
    $('colors').append(b);
  }

  $('name').value = store.get('name', '');
  $('room').value = sanitizeRoom(params.get('room'));
  $('serverUrl').value = params.get('server') || store.get('server', '');
  try { $('menuError').textContent = sessionStorage.getItem('ss_err') || ''; sessionStorage.removeItem('ss_err'); } catch { /* ohne Speicher keine Meldung */ }
  $('play').onclick = join;
  for (const id of ['name', 'room', 'serverUrl']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  $('resume').onclick = () => setPause(false);
  $('leave').onclick = () => { net.close(); location.href = location.pathname; };
  $('invite').onclick = $('roomBadge').onclick = async () => {
    try { await navigator.clipboard.writeText(link); hud.feed('Einladungslink kopiert'); } catch { prompt('Einladungslink zum Kopieren:', link); }
  };
  // Esc beendet den Maus-Fang -> Pause
  document.addEventListener('pointerlockchange', () => {
    if (phase === 'play' && !paused && input.mode === 'desktop' && document.pointerLockElement !== canvas) { lockLost = performance.now(); setPause(true); }
  });
}

async function join() {
  if (phase !== 'menu') return;
  phase = 'join'; $('menuError').textContent = ''; $('play').textContent = 'Verbinde …';
  audio.unlock().catch(() => {});
  my.name = sanitizeName($('name').value);
  await loadModel(AVATARS[my.avatar]);
  const typed = $('serverUrl').value.trim(), url = typed || SERVER_URL, n = new Net(url);
  store.set('name', my.name); store.set('server', typed);
  try { start(n, await n.join({ room: $('room').value, ...my }), url); } catch (e) {
    n.close(); phase = 'menu'; $('play').textContent = 'Spielen';
    const noServer = /Verbindung|antwortet/.test(e.message);
    $('menuError').textContent = e.message + (noServer ? ' Prüfe die Server-Adresse unter „Server & Grafik“.' : '');
    if (noServer) $('advanced').open = true;
  }
}

function start(n, r, url) {
  if (r.seed !== city.seed) throw new Error('Server und Spiel haben verschiedene Versionen.');
  net = n; roomStart = r.start; net.sync(r.serverTime);
  const [x, z] = r.spawn;
  me = { id: r.id, ...my, hp: 100, alive: true, score: 0, kos: 0, stars: 0, pos: new THREE.Vector3(x, world.groundY(x, z), z), yaw: 0, speed: 0, vy: 0, air: false,
    veh: null, busy: false, aim: false, pitch: 0, fireT: 0, emote: 'wave', emoteT: 0, stepD: 0, anim: 'idle', nearCar: null, nearPed: -1, char: new Character(my.avatar, my.color) };
  me.char.setWeapon(0); world.scene.add(me.char.root);
  for (const p of r.players) if (p.id !== me.id) addPlayer(p);
  for (const v of r.vehicles) vehicles.add(v);
  for (const d of r.damage) vehicles.setDamage(d, true);
  bindNet();
  link = location.origin + location.pathname + '?room=' + r.room + (url && url !== SERVER_URL ? '&server=' + encodeURIComponent(url) : '');
  history.replaceState(null, '', link + (params.has('debug') ? '&debug' : '')); // Neuladen landet wieder im selben Raum
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); $('roomCode').textContent = r.room;
  $('pause').querySelector('.settings-slot').append($('settings'));
  input.enabled = true; phase = 'play'; lock();
  hud.feed(`Willkommen in Raum ${r.room}`);
}

function lock() { // klappt nur direkt nach einer Nutzergeste; sonst holt der nächste Klick ins Spiel die Maus
  if (input.mode === 'desktop') try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* kein Maus-Fang verfügbar */ }
}

function setPause(on) {
  if (phase !== 'play' || paused === on) return;
  paused = on; $('pause').classList.toggle('hidden', !on);
  input.enabled = !on; input.fireHeld = input.aimHeld = false;
  if (on) document.exitPointerLock?.(); else lock();
}

// ---------- Netz ----------
function addPlayer(p) {
  if (players.has(p.id) || joining.has(p.id)) return;
  joining.add(p.id);
  loadModel(AVATARS[p.avatar]).then(() => {
    if (!joining.delete(p.id)) return; // während des Ladens schon wieder gegangen
    const char = new Character(p.avatar, p.color, { ring: true });
    char.root.visible = false; world.scene.add(char.root);
    players.set(p.id, { ...p, char, buf: new Interp(), pos: new THREE.Vector3(), veh: 0, alive: true, tag: hud.tag(p.name, p.color) });
  });
}

const who = (id) => id === me.id ? me : players.get(id);
const pedHead = (i) => () => peds[i]?.char?.root.visible ? _h.set(peds[i].x, SLAB + 2.05, peds[i].z) : null;

function bindNet() {
  net.on('snap', (s) => {
    net.sync(s.t);
    for (const p of s.p) {
      const o = who(p[0]); if (!o) continue;
      o.hp = p[9]; if (o !== me) o.buf.push(s.t, p);
    }
    for (const v of s.v) vehicles.snapshot(s.t, v);
  });
  net.on('peds', (s) => { pedBuf.push(s.t, s.a); copBuf.push(s.t, s.c || NOCOPS); heliBuf.push(s.t, s.h || NOHELI); });
  net.on('wanted', ({ stars, hide }) => {
    if (stars > me.stars) { hud.feed(me.stars ? 'Die Fahndung wird verschärft!' : 'Die Stadtwache sucht dich!'); audio.play('ui', { vol: 0.9, rate: 0.6 }); }
    else if (!stars && me.stars) hud.feed('Fahndung eingestellt');
    me.stars = stars;
    txt($('starsOn'), '★'.repeat(stars)); txt($('starsOff'), '★'.repeat(5 - stars));
    $('stars').className = stars ? (hide ? 'hide' : '') : 'off'; // blinkt, solange dich keine Wache sieht
  });
  net.on('pjoin', (p) => { addPlayer(p); hud.feed(`${p.name} ist da`); });
  net.on('pleave', ({ id }) => {
    joining.delete(id);
    const p = players.get(id); if (!p) return;
    hud.feed(`${p.name} ist weg`); p.char.dispose(); p.tag.remove(); players.delete(id);
  });
  net.on('vown', ({ vid, driver }) => {
    const v = vehicles.list[vid]; if (!v) return;
    v.driver = driver; if (!driver && me.veh === v) leaveCar(false); // z. B. nach K.o. am Steuer
  });
  net.on('vdmg', (s) => {
    const v = vehicles.list[s[0]]; if (!v) return;
    if (s[1] < v.hp) audio.play('impact', { pos: v === me.veh ? null : v.pos, vol: 1.3, rate: 0.55 });
    vehicles.setDamage(s);
  });
  // Server-Korrekturen: echter Munitionsstand, abgelehnte Sprünge
  net.on('ammo', (a) => { combat.ammo = a; });
  net.on('fix', ([x, z]) => { if (!me.veh) { me.pos.x = x; me.pos.z = z; } });
  net.on('vfix', (s) => vehicles.fix(s));
  net.on('hp', ({ id, hp, by, w }) => {
    const o = who(id); if (!o) return;
    o.hp = hp;
    if (o === me) { flash(w === -2 ? '#ff8a1f' : who(by)?.color || '#35c2ff'); audio.play('hurt', { vol: 0.7 }); }
  });
  net.on('ko', ({ id, by, w, score, kos }) => {
    const a = who(by), b = who(id);
    if (a) a.score = score; if (b) { b.kos = kos; b.hp = 0; }
    const bn = b?.name ?? 'Jemand';
    hud.feed(w === -2 ? `${bn} ist mit einem Auto in die Luft geflogen` : w === -3 ? `${bn} wurde von der Stadtwache erwischt` : `${a?.name ?? 'Jemand'} hat ${bn} ${VERB[w] ?? 'umgeschubst'}`);
    if (b === me) {
      me.alive = false; koUntil = performance.now() + 4000; ui.ko.classList.remove('hidden'); audio.play('kill');
      koBy = w === -2 ? 'durch eine Explosion' : w === -3 ? 'von der Stadtwache' : `von ${a?.name ?? 'jemandem'}`;
      txt(ui.ko.firstChild, w === -3 ? 'Erwischt!' : w === -2 ? 'Bumm!' : 'Durchgeweicht!');
    }
    else if (a === me) audio.play('coin', { vol: 0.8 });
  });
  net.on('respawn', ({ id, x, z }) => {
    const o = who(id); if (!o) return;
    o.hp = 100; o.alive = true;
    if (o !== me) return o.buf.clear();
    me.pos.set(x, world.groundY(x, z), z); me.air = false; ui.ko.classList.add('hidden');
    combat.ammo = WEAPONS.map(w => w.mag); combat.reloadT = 0;
  });
  net.on('shoot', (s) => { // Schütze: Mitspieler oder Wache (negative Nummer)
    const p = players.get(s.id), ch = p?.char || cops[-1 - s.id]?.char;
    combat.spawn(s, false, p?.color); if (ch) ch.kick = 1;
  });
  net.on('pedhit', ({ id }) => hud.say(OUCH[(id + Math.floor(performance.now())) % OUCH.length], pedHead(id), 1.6));
  net.on('say', ({ ped, line }) => hud.say(HELLO[line % HELLO.length], pedHead(ped), 2.6));
  net.on('horn', ({ vid }) => { const v = vehicles.list[vid]; if (v) audio.horn(v.pos); });
  net.on('emote', ({ id, e }) => hud.say(e ? '👎' : '👋', () => { const p = players.get(id); return p && head(p); }, 1.8));
  net.on('disconnect', (why) => {
    if (why === 'io client disconnect') return; // selbst verlassen
    try { sessionStorage.setItem('ss_err', 'Verbindung zum Server verloren. Mit „Spielen“ kommst du zurück in den Raum.'); } catch { /* dann eben ohne Meldung */ }
    location.reload();
  });
}

// Ziele für Projektile: Mitspieler, sichtbare Passanten, Wachen und ich selbst (nur für fremde Schüsse)
function targets() {
  const out = [];
  for (const p of players.values()) if (p.alive && !p.veh && p.char.root.visible) out.push({ t: 'p', id: p.id, x: p.pos.x, y: p.pos.y, z: p.pos.z });
  peds.forEach((p, i) => { if (p.char?.root.visible) out.push({ t: 'n', id: i, x: p.x, y: SLAB, z: p.z }); });
  cops.forEach((c, i) => { if (c.on && c.char && !c.down) out.push({ t: 'c', id: i, x: c.pos.x, y: c.pos.y, z: c.pos.z }); });
  if (me.alive && !me.veh) out.push({ me: true, x: me.pos.x, y: me.pos.y, z: me.pos.z });
  return out;
}

function onHit(target, weapon) {
  if (target.me) return;
  net.emit('hit', { t: target.t, id: target.id, w: weapon });
  ui.hitmarker.classList.add('on'); clearTimeout(hitT); hitT = setTimeout(() => ui.hitmarker.classList.remove('on'), 70);
}

function flash(color) { // kurzer farbiger Bildrand, wenn ich getroffen werde
  const s = ui.vignette.style;
  s.setProperty('--hitc', color); s.transition = 'none'; s.opacity = 0.9;
  void ui.vignette.offsetWidth; // Stil sofort anwenden, damit das Ausblenden danach sichtbar ist
  s.transition = ''; s.opacity = 0;
}

// ---------- eigene Figur ----------
function controls() {
  if (input.pressed('enter')) me.veh ? leaveCar(true) : enterCar();
  if (me.veh) {
    if (input.pressed('horn')) { audio.horn(null); net.emit('horn'); }
    if (input.pressed('flip')) vehicles.resetUpright();
    return;
  }
  let w = combat.weapon;
  for (let i = 0; i < WEAPONS.length; i++) if (input.pressed('w' + i)) w = i;
  if (input.pressed('weaponNext')) w++;
  if (input.pressed('weaponPrev')) w--;
  if (w !== combat.weapon) { combat.switchTo(w); me.char.setWeapon(combat.weapon); audio.play('ui', { vol: 0.4 }); }
  if (input.pressed('reload')) combat.reload();
  if (input.pressed('jump') && !me.air) { me.vy = 5.4; me.air = true; }
  if (input.pressed('interact')) { if (me.nearPed >= 0) { net.emit('greet', me.nearPed); emote(0, false); } else emote(0, true); }
  if (input.pressed('emoteYes')) emote(0, true);
  if (input.pressed('emoteNo')) emote(1, true);
}

function emote(e, tell) {
  me.emote = e ? 'no' : 'wave'; me.emoteT = 2.4;
  if (tell) { net.emit('emote', e); hud.say(e ? '👎' : '👋', () => head(me), 1.8); }
}

function walk(dt, ctl) {
  const p = me.pos, mv = ctl ? input.move : { x: 0, y: 0 }, len = Math.hypot(mv.x, mv.y), moving = len > 0.12;
  me.fireT -= dt; me.emoteT -= dt;
  me.aim = ctl && (input.aim || input.fire || me.fireT > 0);
  me.speed = lerp(me.speed, moving ? (me.aim ? WALK_V : input.sprint ? SPRINT_V : RUN_V) : 0, Math.min(1, dt * 10));
  const pace = me.speed * Math.min(1, len); // Touch-Stick: halber Ausschlag = halbes Tempo
  if (moving) {
    const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw), k = 1 / Math.max(1, len);
    const dx = (s * mv.y - c * mv.x) * k, dz = (c * mv.y + s * mv.x) * k; // vorwärts = Blickrichtung, rechts = (-cos, sin)
    p.x += dx * me.speed * dt; p.z += dz * me.speed * dt;
    if (!me.aim) me.yaw += turn(me.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 12);
    me.emoteT = 0;
    if (!me.air && (me.stepD += pace * dt) > (pace > 5 ? 1.9 : pace > 2.2 ? 1.3 : 0.75)) { me.stepD = 0; audio.play('step', { vol: 0.2 }); }
  }
  if (me.aim) me.yaw += turn(me.yaw, cam.yaw) * Math.min(1, dt * 18);
  // Kollision: Gebäude/Bäume, Fahrzeuge, Stadtrand
  let o = pushOut(city.solids, p.x, p.z, RADIUS); if (o) { p.x += o[0]; p.z += o[1]; }
  o = vehicles.pushOut(p.x, p.z, RADIUS); if (o) { p.x += o[0]; p.z += o[1]; }
  p.x = clamp(p.x, -HALF + 0.4, HALF + BEACH + 4); p.z = clamp(p.z, -HALF + 0.4, HALF - 0.4);
  const g = world.groundY(p.x, p.z);
  if (me.air) {
    me.vy -= 16 * dt; p.y += me.vy * dt;
    if (p.y <= g) { p.y = g; me.air = false; me.vy = 0; audio.play('land', { vol: 0.4 }); }
  } else p.y = lerp(p.y, g, Math.min(1, dt * 20)); // Bordstein weich hoch/runter
  me.anim = !me.alive ? 'down' : me.air ? 'jump' : !moving ? (me.emoteT > 0 ? me.emote : 'idle') : pace > 5 ? 'sprint' : pace > 2.2 ? 'run' : 'walk';
  me.char.play(me.anim, 0.18, pace);
  me.char.root.position.copy(p); me.char.root.rotation.y = me.yaw;
  me.nearCar = me.alive ? vehicles.nearest(p, 4.2) : null;
  me.nearPed = -1; let best = 3.2 ** 2;
  peds.forEach((q, i) => { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < best) { best = d; me.nearPed = i; } });
}

// Zielen + Schießen (nach der Kamera, weil das Fadenkreuz das Ziel bestimmt)
function shoot(dt, ctl) {
  const ch = me.char;
  if (me.veh) return;
  if (me.aim) {
    // Zielpunkt = erstes Hindernis oder erste Figur auf dem Kamerastrahl
    const o = world.camera.position, from = cam.d + 0.7, h2 = fwd.x * fwd.x + fwd.z * fwd.z;
    let d = combat.trace(o, fwd, 120, 0.6, from);
    if (h2 > 1e-4) for (const t of targets()) {
      const s = ((t.x - o.x) * fwd.x + (t.z - o.z) * fwd.z) / h2, y = o.y + fwd.y * s;
      if (t.me || s < from || s > d || y < t.y || y > t.y + 1.85 || (o.x + fwd.x * s - t.x) ** 2 + (o.z + fwd.z * s - t.z) ** 2 > 0.2) continue;
      d = s;
    }
    aimPt.copy(o).addScaledVector(fwd, d);
    _b.copy(aimPt).sub(_a.set(me.pos.x, me.pos.y + 1.42, me.pos.z)); // ab Schulterhöhe
    if (_b.length() < 1.6) _b.copy(fwd);
    ch.aimAt(_b.normalize()); me.pitch = Math.asin(clamp(_b.y, -1, 1));
  } else { ch.aimAt(null); me.pitch = 0; }
  ch.update(dt);
  if (ctl && me.aim && input.fire && ch.aimW > 0.55) { // erst schießen, wenn der Arm oben ist
    ch.muzzleWorld(_a); _b.copy(aimPt).sub(_a);
    if (_b.length() < 1.2) _b.copy(fwd);
    const shot = combat.fire(_a, _b.normalize(), me.color);
    if (shot) { net.emit('shoot', shot); ch.kick = 1; me.fireT = 0.9; }
  }
}

// ---------- Fahren ----------
function enterCar() {
  const v = me.nearCar; if (!v || me.busy) return;
  me.busy = true;
  net.emit('enter', v.id, (ok) => {
    me.busy = false; if (!ok || me.veh) return;
    me.veh = v; v.driver = me.id; vehicles.startDriving(v);
    me.char.root.visible = false; me.char.aimAt(null); me.aim = false; cam.free = 0;
    audio.play('confirm', { vol: 0.5 });
  });
}

function leaveCar(tell) {
  const v = me.veh; if (!v) return;
  if (tell) { sendCar(true); net.emit('exit'); } // letzter Stand sicher zustellen, sonst springt das Auto zurück
  const yaw = carYaw(v), ex = Math.cos(yaw), ez = -Math.sin(yaw), d = v.half.x + 0.75; // (ex, ez) = links vom Auto
  vehicles.stopDriving(); audio.engine(false); me.veh = null; v.driver = 0;
  const free = (s) => !pushOut(city.solids, v.pos.x + ex * d * s, v.pos.z + ez * d * s, 0.4) && !vehicles.pushOut(v.pos.x + ex * d * s, v.pos.z + ez * d * s, 0.4);
  const side = free(1) || !free(-1) ? 1 : -1; // Fahrertür, sonst Beifahrerseite
  me.pos.set(v.pos.x + ex * d * side, 0, v.pos.z + ez * d * side); me.pos.y = world.groundY(me.pos.x, me.pos.z);
  me.yaw = yaw; me.air = false; me.vy = 0; me.speed = 0; me.char.root.visible = true;
}

function drive(dt, ctl, look) {
  const v = me.veh, mv = ctl ? input.move : { x: 0, y: 0 };
  vehicles.drive({ throttle: mv.y, steer: mv.x, handbrake: ctl && input.handbrake }, dt);
  audio.engine(true, v.speed, mv.y);
  cam.free = look.x || look.y ? 2 : cam.free - dt; // Kamera folgt dem Auto, solange niemand umschaut
  if (cam.free <= 0) { cam.yaw += turn(cam.yaw, carYaw(v)) * Math.min(1, dt * 3); cam.pitch = lerp(cam.pitch, -0.2, Math.min(1, dt * 2)); }
}

// Auto stößt Figuren um (ab ~15 km/h); über Schaden entscheidet der Server
function bump(v, now) {
  if (Math.abs(v.speed) < 4) return;
  const yaw = carYaw(v), s = Math.sin(yaw), c = Math.cos(yaw), cz = (v.bb.max.z + v.bb.min.z) / 2;
  const hit = (o, x, z) => {
    const dx = x - v.pos.x, dz = z - v.pos.z;
    if (now < (o.bumpT || 0) || Math.abs(dx * c - dz * s) > v.half.x + 0.35 || Math.abs(dx * s + dz * c - cz) > v.half.z + 0.35) return false;
    o.bumpT = now + 1500; audio.play('impact', { vol: 0.9, rate: 0.7 });
    return true;
  };
  peds.forEach((p, i) => { if (hit(p, p.x, p.z)) net.emit('hit', { t: 'n', id: i, w: 'car' }); });
  cops.forEach((c, i) => { if (c.on && !c.down && c.pos.y < 2 && hit(c, c.pos.x, c.pos.z)) net.emit('hit', { t: 'c', id: i, w: 'car' }); });
  for (const p of players.values()) if (p.alive && !p.veh && hit(p, p.pos.x, p.pos.z)) net.emit('hit', { t: 'p', id: p.id, w: 'car' });
}

// ---------- Kamera ----------
function camera(dt) {
  const c = world.camera, v = me.veh, k = Math.min(1, dt * 9), sp = v ? Math.min(Math.abs(v.speed), 45) : 0;
  const [dist, side, up, fov] = v ? [5.6 + sp * 0.06, 0, 1.8, 65 + sp * 0.3] : me.aim ? [2.2, 0.62, 1.62, 50] : [3.9, 0.42, 1.6, 65];
  cam.dist = lerp(cam.dist, dist, k); cam.side = lerp(cam.side, side, k); cam.up = lerp(cam.up, up, k); cam.fov = lerp(cam.fov, fov, k);
  if (Math.abs(c.fov - cam.fov) > 0.05) { c.fov = cam.fov; c.updateProjectionMatrix(); }
  const cp = Math.cos(cam.pitch), s = Math.sin(cam.yaw), cs = Math.cos(cam.yaw);
  fwd.set(s * cp, Math.sin(cam.pitch), cs * cp);
  _a.set(me.pos.x, me.pos.y + cam.up, me.pos.z);
  // über die rechte Schulter schauen; Wände drücken die Kamera zur Figur
  const off = v ? 0 : Math.max(0, Math.min(cam.side, combat.trace(_a, _b.set(-cs, 0, s), cam.side + 0.25, 0.1) - 0.25));
  _a.x -= cs * off; _a.z += s * off;
  cam.d = Math.max(v ? 3.2 : 0.45, combat.trace(_a, _b.copy(fwd).negate(), cam.dist + 0.3, 0.2, v ? 3 : 0.3) - 0.3); // ab 3 m: eigenes Auto nicht mitzählen
  c.position.copy(_a).addScaledVector(fwd, -cam.d);
  c.lookAt(_b.copy(c.position).add(fwd)); c.updateMatrixWorld();
}

// ---------- andere Figuren ----------
function updatePlayers(dt, t) {
  for (const p of players.values()) {
    const s = p.buf.sample(t); if (!s) continue;
    const [a, b, k] = s, anim = b[5] & 63;
    p.pos.set(lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k));
    p.veh = b[6]; p.alive = anim !== A.down;
    const ch = p.char; ch.root.visible = !p.veh;
    if (p.veh) continue;
    const yaw = a[4] + turn(a[4], b[4]) * k, pitch = lerp(a[8], b[8], k);
    ch.root.position.copy(p.pos); ch.root.rotation.y = yaw;
    ch.setWeapon(b[7]);
    ch.play(anim, 0.2, Math.hypot(b[1] - a[1], b[3] - a[3]) * TICK_HZ);
    ch.aimAt(b[5] & AIM_FLAG ? _a.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)) : null);
    ch.update(dt);
  }
}

function updatePeds(dt, t) {
  const s = pedBuf.sample(t); if (!s) return;
  const [a, b, k] = s, c = world.camera.position, far = world.q.pedDist ** 2;
  for (let i = 0, o = 0; o < b.length; i++, o += 5) {
    const p = peds[i] ||= { char: null, x: 0, z: 0 };
    p.x = lerp(a[o], b[o], k); p.z = lerp(a[o + 1], b[o + 1], k);
    const near = (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < far;
    if (near && !p.char) { // Figur erst laden und bauen, wenn sie in Sicht kommt
      const av = AVATARS[b[o + 4] % world.q.pedKinds];
      if (!assets.models[av]) loadModel(av);
      else { p.char = new Character(av, null, { castShadow: world.q.shadows > 0 }); world.scene.add(p.char.root); }
    }
    if (p.char) p.char.root.visible = near;
    if (!near || !p.char) continue;
    p.char.root.position.set(p.x, SLAB, p.z); p.char.root.rotation.y = a[o + 2] + turn(a[o + 2], b[o + 2]) * k;
    p.char.play(b[o + 3], 0.25, Math.hypot(b[o] - a[o], b[o + 1] - a[o + 1]) * PED_HZ);
    if ((p.x - c.x) * fwd.x + (p.z - c.z) * fwd.z > -4) p.char.update(dt); // hinter der Kamera nicht animieren
  }
}

// Stadtwache: wie Passanten, aber mit Höhe (Abseilen), Blaster und Zielhaltung
function updateCops(dt, t) {
  const s = copBuf.sample(t); if (!s) return;
  const [a, b, k] = s;
  for (let i = 0, o = 0; o < b.length; i++, o += 6) {
    const c = cops[i] ||= { char: null, pos: new THREE.Vector3(), on: false, down: false, kind: -1, color: '#3d7bff' };
    const anim = b[o + 4], u = a[o + 4] < 0 ? 1 : k; // gerade erschienen: nicht vom Nullpunkt herüberschieben
    c.on = anim >= 0;
    if (c.on && c.kind !== b[o + 5]) { c.char?.dispose(); c.char = null; c.kind = b[o + 5]; } // neue Wache auf diesem Platz
    if (c.on && !c.char) {
      const m = COPS[c.kind];
      if (!assets.models[m]) loadModel(m);
      else { c.char = new Character(m, null, { castShadow: world.q.shadows > 0 }); c.char.setWeapon(0); world.scene.add(c.char.root); }
    }
    if (c.char) c.char.root.visible = c.on;
    if (!c.on || !c.char) continue;
    const x = lerp(a[o], b[o], u), z = lerp(a[o + 2], b[o + 2], u), yaw = a[o + 3] + turn(a[o + 3], b[o + 3]) * u;
    c.pos.set(x, world.groundY(x, z) + lerp(a[o + 1], b[o + 1], u), z);
    c.down = (anim & 63) === A.down;
    c.char.root.position.copy(c.pos); c.char.root.rotation.y = yaw;
    c.char.play(anim & 63, 0.2, Math.hypot(b[o] - a[o], b[o + 2] - a[o + 2]) * PED_HZ);
    c.char.aimAt(anim & AIM_FLAG ? _a.set(Math.sin(yaw), -0.04, Math.cos(yaw)) : null);
    c.char.update(dt);
  }
}

function updateHeli(dt, t) {
  const s = heliBuf.sample(t), on = !!s && s[1][1] > -900;
  if (heli) heli.group.visible = on;
  audio.rotor(on ? world.camera.position.distanceTo(heli?.group.position || world.camera.position) : -1);
  if (!on) return;
  heli ||= makeHeli(world.scene);
  const b = s[1], a = s[0][1] > -900 ? s[0] : b, k = s[2], g = heli.group; // erster Stand: ohne Übergang
  g.position.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
  g.rotation.y += turn(g.rotation.y, a[3] + turn(a[3], b[3]) * k) * Math.min(1, dt * 3);
  heli.rotor.rotation.y += dt * 38; heli.tail.rotation.x += dt * 60;
  const len = Math.max(1, g.position.y - world.groundY(g.position.x, g.position.z) - 1.3);
  heli.rope.visible = !!b[4]; heli.rope.scale.y = len; heli.rope.position.y = -1.3 - len / 2;
  heli.beam.visible = world.night > 0.4; heli.beam.scale.set(len * 0.16, len, len * 0.16); heli.beam.position.y = -1.3 - len / 2; // Suchscheinwerfer
}

// ---------- Senden ----------
function sendCar(sure) {
  const v = me.veh, p = v.pos, q = v.quat;
  net[sure ? 'emit' : 'volatile']('vs', [v.id, r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), r2(v.steer), Math.round(simT)]); // Spielzeit: daraus liest der Server das Tempo
}

function send(dt) {
  if ((sendT += dt) < 1 / TICK_HZ) return;
  sendT = 0;
  const p = me.pos, v = me.veh;
  if (v) sendCar(false);
  net.volatile('st', [r2(p.x), r2(p.y), r2(p.z), r2(v ? carYaw(v) : me.yaw), v ? A.drive : A[me.anim] | (me.aim ? AIM_FLAG : 0), combat.weapon, r2(me.pitch)]);
}

// ---------- HUD ----------
function drawHud(dt, now) {
  const v = me.veh, touch = input.mode === 'touch';
  ui.hpbar.style.width = me.hp + '%';
  txt(ui.wname, combat.w.name); txt(ui.ammo, combat.reloadT > 0 ? 'lädt …' : `${combat.ammo[combat.weapon]} / ${combat.w.mag}`);
  ui.weapon.classList.toggle('hidden', !!v); ui.speed.classList.toggle('hidden', !v);
  if (v) { txt(ui.kmh, Math.round(Math.abs(v.speed) * 3.6)); txt(ui.vname, `${v.cfg.name} · ${v.st ? 'brennt!' : v.hp + ' %'}`); }
  ui.crosshair.style.opacity = v || !me.alive ? 0 : ''; ui.crosshair.classList.toggle('aim', me.aim);
  const key = (k, s) => touch ? s : `${k} – ${s}`;
  const hint = !me.alive || paused ? '' : !touch && document.pointerLockElement !== canvas ? 'Ins Spiel klicken, um die Maus zu fangen'
    : v ? (v.st ? key('F', 'Raus hier – das Auto brennt!') : Math.abs(v.speed) < 3 ? key('F', 'Aussteigen') : '') : me.nearCar ? key('F', me.nearCar.cfg.name + ' fahren') : me.nearPed >= 0 ? key('E', 'Hallo sagen') : '';
  if (hint) txt(ui.hint, hint);
  ui.hint.classList.toggle('on', !!hint);
  ui.tAct.classList.toggle('hidden', !!v || me.nearPed < 0); ui.tHorn.classList.toggle('hidden', !v);
  for (const b of [ui.tFire, ui.tAim, ui.tWeapon]) b.classList.toggle('hidden', !!v);
  if (!me.alive) txt(ui.kotext, `${koBy} · weiter in ${Math.max(1, Math.ceil((koUntil - now) / 1000))} s`);
  ui.scoreboard.classList.toggle('hidden', !input.scoreboard);
  for (const p of players.values()) { hud.pin(p.tag, head(p), world.camera, 80); p.tag.lastChild.firstChild.style.width = p.hp + '%'; }
  hud.update(world.camera);
  if ((slowT += dt) < 0.1) return; // Rest: 10x pro Sekunde reicht
  slowT = 0;
  hud.minimap(me.pos, v ? carYaw(v) : me.yaw, cam.yaw, [...players.values(), ...cops.filter(c => c.on)], vehicles.list);
  const m = Math.floor(tod * 1440);
  txt(ui.clock, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  txt(ui.playerCount, players.size + 1);
  if (input.scoreboard) hud.scores([me, ...players.values()], me.id);
}

// ---------- Schleife ----------
function play(dt, now) {
  const t = net.serverNow() - RENDER_DELAY, ctl = !paused && me.alive, look = input.consumeLook(dt);
  if (!paused) { cam.yaw -= look.x; cam.pitch = clamp(cam.pitch - look.y, -1.1, 1.2); }
  if (input.pressed('pause') && now - lockLost > 300) setPause(!paused); // Esc löst sonst Pause + sofort wieder Weiter aus
  if (ctl) controls();
  input.edges.clear();
  if (me.veh) drive(dt, ctl, look); else walk(dt, ctl);
  vehicles.update(dt, t, world.night, world.camera.position);
  if (me.veh) { me.pos.copy(me.veh.pos); bump(me.veh, now); }
  updatePlayers(dt, t); updatePeds(dt, t); updateCops(dt, t); updateHeli(dt, t);
  camera(dt);
  shoot(dt, ctl);
  combat.update(dt);
  send(dt);
  const u = ((net.serverNow() - roomStart) / 1000 / DAY_LENGTH + 0.25) % 1; // 70 % der Zeit ist Tag, die Nacht läuft schneller
  tod = DEBUG?.tod ?? (u < 0.7 ? 0.22 + u * 0.8 : (0.78 + (u - 0.7) / 0.3 * 0.44) % 1);
  world.updateTime(tod, me.pos);
  drawHud(dt, now);
  Object.assign(audio.listener, { x: world.camera.position.x, z: world.camera.position.z, yaw: cam.yaw });
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  simT += dt * 1000; // Spielzeit in ms: bleibt bei Rucklern stehen wie die Physik (sonst sähe ein Ruckler wie ein Aufprall aus)
  if (phase === 'play') play(dt, now);
  else { // Menü: Kameraflug über die Stadt im Abendlicht
    const a = now * 4e-5, c = world.camera;
    c.position.set(40 + Math.sin(a) * 200, 48, Math.cos(a) * 200); c.lookAt(40, 16, 0);
    world.updateTime(0.735, _a.set(40, 0, 0));
    preview.draw(dt, now / 1000);
    input.consumeLook(); input.edges.clear();
  }
  world.render();
}

boot().catch(e => { $('loadtext').textContent = 'Fehler beim Laden: ' + e.message; console.error(e); });

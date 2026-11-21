import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';
import { XY, MILLS } from '../muehle/rules.js';

// 3D-Duell um einen Stein. Die Arena ist ein riesiges Mühlebrett: Säulen an den 24 Punkten, Linien leuchten,
// der umkämpfte Stein schwebt in der Mitte. Jeder Client steuert seinen Kämpfer selbst; der Schütze meldet Treffer,
// der Gastgeber (bzw. lokal im Training) entscheidet über das Ende.
export const HP = { att: 125, def: 100 }; // Mühle-Bonus für den Angreifer
const DUR = 90, STEP = 6, GRAV = 24, SPEED = 7.2, JUMP = 8, R = 0.45, EYE = 1.6;
const FIRE = 0.15, MAG = 12, RELOAD = 1.3, DMG = 18, HEAD = 40;
const COL = { 1: 0xfff3dc, 2: 0x3b3552 }, GLOW = { 1: 0xffcf5c, 2: 0x9b6bff };

// ---------- Klang (eigene Synthese) ----------
let ac, noise;
function sfx(kind) {
  try {
    ac ??= new AudioContext();
    if (!noise) { noise = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2; }
    const t = ac.currentTime, g = ac.createGain(); g.connect(ac.destination);
    const osc = (f, to, d, type = 'square', v = 0.1) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(to, t + d); const gg = ac.createGain(); gg.gain.setValueAtTime(v, t); gg.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(gg).connect(ac.destination); o.start(t); o.stop(t + d); };
    const hiss = (d, v, f = 1800) => { const s = ac.createBufferSource(), fl = ac.createBiquadFilter(); s.buffer = noise; fl.type = 'bandpass'; fl.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); s.connect(fl).connect(g); s.start(t); s.stop(t + d); };
    if (kind === 'shot') { hiss(0.18, 0.5, 2400); osc(900, 120, 0.12, 'sawtooth', 0.07); }
    if (kind === 'eshot') { hiss(0.15, 0.2, 1500); }
    if (kind === 'hit') osc(1400, 1300, 0.06, 'square', 0.06);
    if (kind === 'head') { osc(2200, 2100, 0.12, 'sine', 0.12); osc(1650, 1600, 0.12, 'sine', 0.08); }
    if (kind === 'hurt') { hiss(0.25, 0.4, 400); osc(160, 60, 0.25, 'sine', 0.25); }
    if (kind === 'reload') { osc(500, 700, 0.05, 'square', 0.05); setTimeout(() => sfx('click'), 900); }
    if (kind === 'click') osc(1200, 900, 0.04, 'square', 0.06);
    if (kind === 'jump') osc(220, 420, 0.12, 'sine', 0.06);
    if (kind === 'dash') hiss(0.3, 0.25, 900);
    if (kind === 'beep') osc(660, 660, 0.15, 'sine', 0.12);
    if (kind === 'go') { osc(880, 880, 0.35, 'sine', 0.14); osc(1320, 1320, 0.35, 'sine', 0.08); }
    if (kind === 'boom') { hiss(0.8, 0.6, 300); osc(120, 30, 0.8, 'sine', 0.3); }
  } catch { /* ohne Ton */ }
}

// ---------- Arena ----------
const P = XY.map(([x, y]) => [(x - 3) * STEP, (y - 3) * STEP]);
// Außenring hoch, Mittelring niedrig (Deckung zum Draufspringen), Innenring mittel
const ringH = (i) => (i <= 2 || i === 9 || i === 14 || i >= 21) ? 3.4 : (i <= 5 || i === 10 || i === 13 || i >= 18) ? 1.15 : 2.4;
const WALL = 23;
function buildArena(scene, defColor) {
  const boxes = [], solids = [];
  scene.background = new THREE.Color(0x0d0b1a);
  scene.fog = new THREE.Fog(0x0d0b1a, 30, 75);
  scene.add(new THREE.HemisphereLight(0xa898ff, 0x2a1840, 1.7));
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.4); sun.position.set(10, 30, 15); scene.add(sun);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WALL * 2, WALL * 2), new THREE.MeshStandardMaterial({ color: 0x29224d, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor); solids.push(floor);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffcf5c });
  for (const [a, , c] of MILLS) {
    const [x1, z1] = P[a], [x2, z2] = P[c], len = Math.hypot(x2 - x1, z2 - z1);
    const l = new THREE.Mesh(new THREE.BoxGeometry(x1 === x2 ? 0.18 : len, 0.02, x1 === x2 ? len : 0.18), lineMat);
    l.position.set((x1 + x2) / 2, 0.012, (z1 + z2) / 2); scene.add(l);
  }
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5a4c9a, roughness: 0.55, metalness: 0.15, emissive: 0x1c1440 });
  const capMat = new THREE.MeshBasicMaterial({ color: 0xffcf5c });
  P.forEach(([x, z], i) => {
    const h = ringH(i), m = new THREE.Mesh(new THREE.BoxGeometry(1.8, h, 1.8), pillarMat);
    m.position.set(x, h / 2, z); scene.add(m); solids.push(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.08, 1.86), capMat); cap.position.set(x, h, z); scene.add(cap);
    boxes.push({ x0: x - 0.9, x1: x + 0.9, z0: z - 0.9, z1: z + 0.9, top: h });
  });
  // Wände mit Leuchtband
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x241d44, roughness: 0.9 });
  const bandMat = new THREE.MeshBasicMaterial({ color: 0xff4d8d });
  for (const [x, z, w, d] of [[0, -WALL, WALL * 2, 1], [0, WALL, WALL * 2, 1], [-WALL, 0, 1, WALL * 2], [WALL, 0, 1, WALL * 2]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), wallMat); m.position.set(x, 3, z); scene.add(m); solids.push(m);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w * 0.999, 0.12, d * 1.02), bandMat); b.position.set(x, 1.2, z); scene.add(b);
  }
  // umkämpfter Stein schwebt in der Mitte
  const stone = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.7, 40), new THREE.MeshStandardMaterial({ color: COL[defColor], roughness: 0.35, metalness: 0.1, emissive: GLOW[defColor], emissiveIntensity: 0.15 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.06, 8, 64), new THREE.MeshBasicMaterial({ color: GLOW[defColor] }));
  ring.rotation.x = Math.PI / 2; stone.add(disc, ring); stone.position.set(0, 5.5, 0); scene.add(stone);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.6, 5.5, 16, 1, true), new THREE.MeshBasicMaterial({ color: GLOW[defColor], transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 2.75; scene.add(beam);
  // Staubteilchen für Tiefe
  const dust = new THREE.BufferGeometry(), pts = new Float32Array(600 * 3);
  for (let i = 0; i < pts.length; i += 3) { pts[i] = (Math.random() - 0.5) * WALL * 2; pts[i + 1] = Math.random() * 10; pts[i + 2] = (Math.random() - 0.5) * WALL * 2; }
  dust.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const dustM = new THREE.Points(dust, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.07, transparent: true, opacity: 0.6, depthWrite: false }));
  scene.add(dustM);
  return { boxes, solids, stone, ring, dust: dustM };
}

// ---------- Kämpfer ----------
function makeAvatar(color) {
  const g = new THREE.Group(), vis = new THREE.Group(); g.add(vis);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.75, 4, 12), new THREE.MeshStandardMaterial({ color: COL[color], roughness: 0.45 }));
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), body.material); head.position.y = 1.62;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.1), new THREE.MeshBasicMaterial({ color: GLOW[color] })); visor.position.set(0, 1.66, -0.27);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.04, 6, 24), visor.material); band.rotation.x = Math.PI / 2; band.position.y = 1.0;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.7), new THREE.MeshStandardMaterial({ color: 0x15121f })); gun.position.set(0.32, 1.25, -0.4);
  vis.add(body, head, visor, band, gun);
  const inv = new THREE.MeshBasicMaterial({ visible: false });
  const hb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.9), inv); hb.position.y = 0.7; hb.userData.part = 'body';
  const hh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), inv); hh.position.y = 1.64; hh.userData.part = 'head';
  g.add(hb, hh);
  return { g, vis, hits: [hb, hh], gun };
}
class Fighter {
  constructor(scene, color, x, z) {
    Object.assign(this, { pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), yaw: Math.atan2(x, z), pitch: 0, ground: true, dash: 0, dashCd: 0, cool: 0, ammo: MAG, reload: 0, color });
    this.av = makeAvatar(color); scene.add(this.av.g); this.sync();
  }
  sync() { this.av.g.position.copy(this.pos); this.av.g.rotation.y = this.yaw; }
  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z); }
  dir() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  // Bewegung mit Säulen-Kollision; niedrige Säulen kann man erspringen und darauf stehen
  step(dt, inp, boxes) {
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), r = new THREE.Vector3(-f.z, 0, f.x);
    const wish = f.multiplyScalar(inp.fwd).add(r.multiplyScalar(inp.side)); if (wish.lengthSq() > 1) wish.normalize();
    const acc = this.ground ? 14 : 4;
    this.vel.x += (wish.x * SPEED - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (wish.z * SPEED - this.vel.z) * Math.min(1, acc * dt);
    this.dashCd -= dt;
    if (inp.dash && this.dashCd <= 0 && wish.lengthSq() > 0.01) { this.vel.x = wish.x * 22; this.vel.z = wish.z * 22; this.dashCd = 1.6; this.dash = 0.2; inp.onDash?.(); }
    if (inp.jump && this.ground) { this.vel.y = JUMP; this.ground = false; inp.onJump?.(); }
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    for (const b of boxes) {
      if (b.top <= this.pos.y + 0.05) continue;
      const cx = Math.max(b.x0, Math.min(this.pos.x, b.x1)), cz = Math.max(b.z0, Math.min(this.pos.z, b.z1));
      const dx = this.pos.x - cx, dz = this.pos.z - cz, d = Math.hypot(dx, dz);
      if (d < R) {
        if (d > 1e-4) { this.pos.x = cx + dx / d * R; this.pos.z = cz + dz / d * R; }
        else { const ex = [b.x0 - R - this.pos.x, b.x1 + R - this.pos.x], ez = [b.z0 - R - this.pos.z, b.z1 + R - this.pos.z]; const m = [...ex, ...ez].reduce((a, v) => Math.abs(v) < Math.abs(a) ? v : a); if (ex.includes(m)) this.pos.x += m; else this.pos.z += m; }
      }
    }
    const lim = WALL - 0.5 - R; this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x)); this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));
    this.vel.y -= GRAV * dt; this.pos.y += this.vel.y * dt;
    let gnd = 0;
    for (const b of boxes) if (b.top <= prevY + 0.06 && this.pos.x > b.x0 - R * 0.6 && this.pos.x < b.x1 + R * 0.6 && this.pos.z > b.z0 - R * 0.6 && this.pos.z < b.z1 + R * 0.6) gnd = Math.max(gnd, b.top);
    const was = this.ground;
    if (this.pos.y <= gnd) { this.pos.y = gnd; this.vel.y = 0; this.ground = true; if (!was) inp.onLand?.(); } else if (this.pos.y > gnd + 0.05) this.ground = false;
    this.sync();
  }
}

// ---------- Bot (Training und automatischer Test) ----------
function botInput(me, foe, t, st, see) {
  const to = foe.pos.clone().sub(me.pos), dist = Math.hypot(to.x, to.z);
  const aimYaw = Math.atan2(-to.x, -to.z), aimPitch = Math.atan2(foe.pos.y + 1.2 - me.pos.y - EYE, dist);
  st.err ??= 0.5; st.err = see ? Math.max(0.03, st.err - 0.012) : Math.min(0.5, st.err + 0.02);
  const dy = Math.atan2(Math.sin(aimYaw - me.yaw), Math.cos(aimYaw - me.yaw));
  me.yaw += dy * 0.12 + Math.sin(t * 3.1) * st.err * 0.04; me.pitch += (aimPitch - me.pitch) * 0.12;
  st.strafe ??= 1; if (Math.random() < 0.01) st.strafe *= -1;
  return { fwd: see ? (dist > 14 ? 1 : dist < 7 ? -0.6 : 0) : 1, side: see ? st.strafe : Math.sin(t) * 0.5, jump: Math.random() < 0.006, dash: Math.random() < 0.004,
    fire: see && Math.abs(dy) < 0.12 + st.err * 0.3 && Math.random() < 0.55 };
}

// ---------- Duell ----------
// opts: { role: 'att'|'def', color: 1|2, foeColor, send(m), host: bool, training: bool, auto: bool, onEnd(winRole) }
export function startDuel(opts) {
  const { role, color } = opts, foeRole = role === 'att' ? 'def' : 'att', foeColor = 3 - color;
  const root = document.createElement('div'); root.id = 'duel'; root.innerHTML = HUD; document.body.append(root);
  const $ = (s) => root.querySelector(s);
  const touch = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.25 : 1.75)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.prepend(renderer.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(78, 1, 0.05, 200); scene.add(cam);
  const arena = buildArena(scene, role === 'def' ? color : foeColor);
  const sp = (r) => r === 'att' ? [-9, -WALL + 2.5] : [9, WALL - 2.5]; // zwischen zwei Außensäulen, Blick zur Mitte
  const me = new Fighter(scene, color, ...sp(role)), foe = new Fighter(scene, foeColor, ...sp(foeRole));
  me.av.vis.visible = false;
  const hp = { [role]: HP[role], [foeRole]: HP[foeRole] };
  $('#nmMe').textContent = 'DU' + (role === 'att' ? ' · Angreifer' : ' · Verteidiger'); $('#nmFoe').textContent = (opts.training ? 'BOT' : 'GEGNER') + (foeRole === 'att' ? ' · Angreifer' : ' · Verteidiger');
  $('#vs').innerHTML = `<div class="vsrow"><b style="--c:${hex(GLOW[color])}">DU</b><span>VS</span><b style="--c:${hex(GLOW[foeColor])}">${opts.training ? 'BOT' : 'GEGNER'}</b></div>
    <div class="vssub">${role === 'att' ? 'Du willst den Stein schlagen' : 'Verteidige deinen Stein'} · Angreifer hat ${HP.att} Leben (Mühle-Bonus), Verteidiger ${HP.def}</div><div class="cd" id="cd">3</div>
    <div class="vshelp">${touch ? 'Links bewegen · rechts wischen zum Zielen · Knöpfe zum Schießen/Springen' : 'Klicken zum Zielen · WASD laufen · Maus zielen · Klick schießen · Leertaste springen · Shift Sprint-Stoß · R nachladen'}</div>`;

  // Viewmodel
  const vm = new THREE.Group(); cam.add(vm);
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x4a4270, roughness: 0.35, metalness: 0.4 });
  const g1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.34), gunMat), g2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), gunMat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.2, 10), gunMat); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.25);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.012, 0.22), new THREE.MeshBasicMaterial({ color: GLOW[color] }));
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.03, 0.06), strip.material);
  g2.position.set(0, -0.09, 0.08); g2.rotation.x = 0.3; strip.position.set(0, 0.046, -0.02); core.position.set(0, -0.01, 0.1); vm.add(g1, g2, barrel, strip, core);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.set(0, 0.01, -0.37); vm.add(flash);
  const flashLight = new THREE.PointLight(0xffd08a, 0, 8); flashLight.position.set(0, 0, -0.5); vm.add(flashLight);
  vm.position.set(0.2, -0.17, -0.42); vm.scale.setScalar(0.7);

  // Effekte
  const fx = [];
  function tracer(a, b, colr) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: colr, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(l); fx.push({ o: l, t: 0.12, max: 0.12, kind: 'fade' });
  }
  function sparks(p, colr, n = 10, speed = 5, size = 0.06) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color: colr, transparent: true }));
      s.position.copy(p); scene.add(s);
      fx.push({ o: s, t: 0.5 + Math.random() * 0.4, max: 0.9, kind: 'phys', v: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed) });
    }
  }
  function shatter(f) {
    f.av.g.visible = false; sfx('boom');
    const c = f.pos.clone().add(new THREE.Vector3(0, 1, 0));
    sparks(c, COL[f.color], 40, 9, 0.18); sparks(c, GLOW[f.color], 30, 12, 0.08);
  }
  const dmgNums = [];
  function dmgNum(p, n, head) {
    const d = document.createElement('div'); d.className = 'dn' + (head ? ' hd' : ''); d.textContent = n; root.append(d);
    dmgNums.push({ d, p: p.clone(), t: 0.8 });
  }

  // Eingabe
  const keys = {}, inp = { fwd: 0, side: 0, jump: false, dash: false, fire: false };
  let locked = false, mouseDown = false;
  const onKey = (e, v) => { keys[e.code] = v; if (v && e.code === 'KeyR') startReload(); if (['Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault(); };
  const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
  const mm = (e) => { if (!locked || !live()) return; me.yaw -= e.movementX * 0.0022; me.pitch = clampP(me.pitch - e.movementY * 0.0022); };
  const md = (e) => { if (touch) return; if (!locked) { renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); return; } if (e.button === 0) mouseDown = true; };
  const mu = (e) => { if (e.button === 0) mouseDown = false; };
  const plc = () => { locked = document.pointerLockElement === renderer.domElement; $('#lock').classList.toggle('hidden', locked || touch || phase !== 'fight' || opts.auto); };
  addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('mousemove', mm); root.addEventListener('mousedown', md); addEventListener('mouseup', mu);
  document.addEventListener('pointerlockchange', plc);
  const clampP = (p) => Math.max(-1.45, Math.min(1.45, p));
  // Touch: links Stick, rechts Blick, Knöpfe
  const tch = { move: null, look: null, fire: false, jump: false, dash: false };
  if (touch) {
    $('#touch').classList.remove('hidden');
    const btn = (id, k) => { const b = $(id); b.addEventListener('touchstart', (e) => { e.preventDefault(); tch[k] = true; if (k === 'reload') startReload(); }, { passive: false }); b.addEventListener('touchend', (e) => { e.preventDefault(); tch[k] = false; }, { passive: false }); };
    btn('#bFire', 'fire'); btn('#bJump', 'jump'); btn('#bDash', 'dash'); btn('#bRel', 'reload');
    renderer.domElement.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) { if (t.clientX < innerWidth / 2 && !tch.move) tch.move = { id: t.identifier, x: t.clientX, y: t.clientY, dx: 0, dy: 0 }; else if (!tch.look) tch.look = { id: t.identifier, x: t.clientX, y: t.clientY }; } e.preventDefault(); }, { passive: false });
    renderer.domElement.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) {
      if (tch.move?.id === t.identifier) { tch.move.dx = Math.max(-1, Math.min(1, (t.clientX - tch.move.x) / 50)); tch.move.dy = Math.max(-1, Math.min(1, (t.clientY - tch.move.y) / 50)); }
      if (tch.look?.id === t.identifier && live()) { me.yaw -= (t.clientX - tch.look.x) * 0.006; me.pitch = clampP(me.pitch - (t.clientY - tch.look.y) * 0.006); tch.look.x = t.clientX; tch.look.y = t.clientY; }
    } e.preventDefault(); }, { passive: false });
    const te = (e) => { for (const t of e.changedTouches) { if (tch.move?.id === t.identifier) tch.move = null; if (tch.look?.id === t.identifier) tch.look = null; } };
    renderer.domElement.addEventListener('touchend', te); renderer.domElement.addEventListener('touchcancel', te);
  }

  // Ablauf
  let phase = 'intro', clock = 0, left = DUR, ended = false, slow = 1, shake = 0, kick = 0, hurt = 0, hitT = 0, bob = 0, last = performance.now(), raf = 0, netT = 0, botSt = {}, autoSt = {};
  const live = () => phase === 'fight';
  const buf = []; // empfangene Gegnerpositionen
  function startReload() { if (me.reload > 0 || me.ammo === MAG || !live()) return; me.reload = RELOAD; sfx('reload'); }
  const ray = new THREE.Raycaster();
  function shoot(f, target) {
    const spread = (f.ground ? 0.006 : 0.03) + Math.hypot(f.vel.x, f.vel.z) * 0.0012;
    const d = f.dir().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)).normalize();
    ray.set(f.eye(), d); ray.far = 120;
    const hits = ray.intersectObjects([...arena.solids, ...target.av.hits], false);
    const h = hits[0], end = h ? h.point : f.eye().add(d.multiplyScalar(120));
    const part = h?.object.userData.part;
    return { end, dmg: part === 'head' ? HEAD : part === 'body' ? DMG : 0, head: part === 'head' };
  }
  function muzzle(f) { const p = f.eye(); const d = f.dir(); p.add(d.multiplyScalar(0.6)); p.y -= 0.25; return p; }
  function myFire() {
    if (me.cool > 0 || me.reload > 0) return;
    if (me.ammo <= 0) return startReload();
    me.cool = FIRE; me.ammo--; kick = 1; shake = Math.max(shake, 0.15);
    const r = shoot(me, foe), from = new THREE.Vector3(); flash.getWorldPosition(from);
    tracer(from, r.end, GLOW[color]); sparks(r.end, r.dmg ? 0xff4d8d : 0xffd9a0, r.dmg ? 12 : 6, 4);
    sfx('shot'); flash.material.opacity = 1; flashLight.intensity = 6;
    if (r.dmg) { hitT = 0.25; $('#hm').classList.toggle('hd', r.head); sfx(r.head ? 'head' : 'hit'); dmgNum(r.end, r.dmg, r.head); damage(foeRole, r.dmg); }
    opts.send?.({ t: 'shot', a: from.toArray(), b: r.end.toArray(), dmg: r.dmg, head: r.head });
    if (me.ammo <= 0) startReload();
  }
  function botFire() { // Training: Bot schießt lokal auf mich
    if (foe.cool > 0 || foe.reload > 0) return;
    if (foe.ammo <= 0) { foe.reload = RELOAD; return; }
    foe.cool = FIRE * 1.25; foe.ammo--;
    if (foe.ammo <= 0) foe.reload = RELOAD;
    const r = shoot(foe, me); remoteShot(muzzle(foe), r.end, r.dmg, r.head);
  }
  function remoteShot(a, b, dmg, head) {
    tracer(a, b, GLOW[foeColor]); sparks(b, 0xffd9a0, 5, 3); sfx('eshot');
    if (dmg) { hurt = 1; shake = 0.5; sfx('hurt'); damage(role, dmg, head); }
  }
  function damage(r, n) {
    if (ended || hp[r] <= 0) return;
    hp[r] = Math.max(0, hp[r] - n); hud();
    if (hp[r] > 0) return;
    if (r === role) { if (opts.host) finish(foeRole); else opts.send?.({ t: 'dead' }); shatter(me); }
    else { shatter(foe); if (opts.host) finish(role); }
    slow = 0.25; setTimeout(() => { slow = 1; }, 900);
  }
  function finish(winRole) { // nur Gastgeber/Training
    if (ended) return; ended = true;
    opts.send?.({ t: 'end', win: winRole });
    banner(winRole); setTimeout(() => opts.onEnd(winRole), 2600);
  }
  function banner(winRole) {
    ended = true; phase = 'end'; document.exitPointerLock?.();
    if (hp[winRole === role ? foeRole : role] > 0) (winRole === role ? shatter(foe) : shatter(me), slow = 0.3, setTimeout(() => { slow = 1; }, 900));
    const won = winRole === role, sub = winRole === 'att' ? 'Der Stein wird geschlagen' : 'Der Stein bleibt stehen';
    $('#end').innerHTML = `<b class="${won ? 'win' : 'lose'}">${won ? 'SIEG' : 'NIEDERLAGE'}</b><div>${sub}</div>`; $('#end').classList.remove('hidden');
    $('#lock').classList.add('hidden');
  }
  function hud() {
    const set = (id, r) => { $(id).style.width = (hp[r] / HP[r]) * 100 + '%'; $(id).parentElement.dataset.v = Math.ceil(hp[r]); };
    set('#hpMe', role); set('#hpFoe', foeRole);
  }
  hud();

  function recv(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'pos' && Array.isArray(m.p)) buf.push({ t: performance.now(), p: m.p, yaw: +m.yaw || 0, pitch: +m.pitch || 0 }), buf.length > 30 && buf.shift();
    if (m.t === 'shot' && Array.isArray(m.a) && Array.isArray(m.b)) remoteShot(new THREE.Vector3(...m.a), new THREE.Vector3(...m.b), Math.min(HEAD, +m.dmg || 0), !!m.head);
    if (m.t === 'dead' && opts.host) { shatter(foe); hp[foeRole] = 0; hud(); finish(role); }
    if (m.t === 'end' && !opts.host && !ended && (m.win === 'att' || m.win === 'def')) banner(m.win);
  }

  // Intro-Countdown
  const cdT = [setTimeout(() => { $('#cd').textContent = '2'; sfx('beep'); }, 1000), setTimeout(() => { $('#cd').textContent = '1'; sfx('beep'); }, 2000),
    setTimeout(() => { phase = 'fight'; sfx('go'); $('#vs').classList.add('out'); plc(); setTimeout(() => $('#vs').classList.add('hidden'), 500); }, 3000)];
  sfx('beep');

  function resize() { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const rdt = Math.min(0.05, (now - last) / 1000); last = now; const dt = rdt * slow;
    clock += dt;
    if (live()) {
      left -= dt; if (left <= 0 && opts.host && !ended) finish(hp.att / HP.att > hp.def / HP.def ? 'att' : 'def'); // Zeit um: mehr Leben (anteilig) gewinnt, Gleichstand hält der Verteidiger
      $('#time').textContent = Math.max(0, Math.ceil(left));
      $('#time').classList.toggle('low', left < 10);
    }
    // eigene Steuerung
    const see = hasSight(me, foe);
    if (opts.auto && live()) Object.assign(inp, botInput(me, foe, clock, autoSt, see));
    else {
      inp.fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - (tch.move?.dy || 0);
      inp.side = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (tch.move?.dx || 0);
      inp.jump = keys.Space || tch.jump; inp.dash = keys.ShiftLeft || keys.ShiftRight || tch.dash; inp.fire = mouseDown || tch.fire;
    }
    if (!live() || hp[role] <= 0) { inp.fwd = inp.side = 0; inp.jump = inp.dash = inp.fire = false; }
    inp.onJump = () => sfx('jump'); inp.onDash = () => { sfx('dash'); shake = Math.max(shake, 0.2); }; inp.onLand = () => { bob = 0.4; };
    me.cool -= dt; if (me.reload > 0 && (me.reload -= dt) <= 0) me.ammo = MAG;
    if (hp[role] > 0) me.step(dt, inp, arena.boxes);
    if (inp.fire && live() && hp[role] > 0) myFire();
    // Gegner: Bot oder Netz
    if (opts.training) {
      const bi = live() && hp[foeRole] > 0 ? botInput(foe, me, clock, botSt, hasSight(foe, me)) : { fwd: 0, side: 0 };
      foe.step(dt, bi, arena.boxes); foe.cool -= dt; if (foe.reload > 0 && (foe.reload -= dt) <= 0) foe.ammo = MAG;
      if (bi.fire && hp[foeRole] > 0 && hp[role] > 0) botFire();
    } else if (buf.length) {
      const rt = now - 110; let a = buf[0], b = buf[buf.length - 1];
      for (let i = buf.length - 1; i > 0; i--) if (buf[i - 1].t <= rt) { a = buf[i - 1]; b = buf[i]; break; }
      const k = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 1;
      foe.pos.set(a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k);
      foe.yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * k; foe.pitch = b.pitch; foe.sync();
    }
    netT -= rdt;
    if (netT <= 0 && opts.send && !opts.training) { netT = 1 / 15; opts.send({ t: 'pos', p: [+me.pos.x.toFixed(2), +me.pos.y.toFixed(2), +me.pos.z.toFixed(2)], yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(3) }); }

    // Kamera
    const spd = Math.hypot(me.vel.x, me.vel.z);
    bob += me.ground ? spd * dt * 1.6 : 0;
    shake = Math.max(0, shake - rdt * 2.5); kick = Math.max(0, kick - rdt * 9);
    cam.position.set(me.pos.x, me.pos.y + EYE + Math.sin(bob * 2) * 0.04 * Math.min(1, spd / SPEED), me.pos.z);
    cam.rotation.set(me.pitch + kick * 0.03 + (Math.random() - 0.5) * shake * 0.04, me.yaw + (Math.random() - 0.5) * shake * 0.04, 0, 'YXZ');
    cam.fov = 78 + Math.min(8, Math.max(0, spd - SPEED) * 0.6); cam.updateProjectionMatrix();
    vm.position.set(0.2 + Math.sin(bob) * 0.01, -0.17 + Math.abs(Math.cos(bob)) * 0.008 - (me.reload > 0 ? 0.1 : 0), -0.42 + kick * 0.05);
    vm.rotation.x = kick * 0.18 + (me.reload > 0 ? -0.5 : 0);
    flash.material.opacity *= 0.55; flashLight.intensity *= 0.5;
    // Arena-Leben
    arena.stone.rotation.y += rdt * 0.6; arena.stone.position.y = 5.5 + Math.sin(clock * 1.5) * 0.3; arena.ring.rotation.z += rdt;
    arena.dust.rotation.y += rdt * 0.01;
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i]; e.t -= dt;
      if (e.kind === 'phys') { e.v.y -= 14 * dt; e.o.position.addScaledVector(e.v, dt); if (e.o.position.y < 0.03) { e.o.position.y = 0.03; e.v.multiplyScalar(0.4); e.v.y = Math.abs(e.v.y); } e.o.rotation.x += dt * 8; }
      e.o.material.opacity = Math.max(0, e.t / e.max);
      if (e.t <= 0) { scene.remove(e.o); e.o.geometry.dispose(); e.o.material.dispose(); fx.splice(i, 1); }
    }
    // HUD
    hitT = Math.max(0, hitT - rdt); hurt = Math.max(0, hurt - rdt * 1.8);
    $('#hm').style.opacity = hitT > 0 ? 1 : 0; $('#vig').style.opacity = hurt * 0.9 + (hp[role] / HP[role] < 0.3 ? 0.25 + Math.sin(clock * 6) * 0.1 : 0);
    $('#xh').style.setProperty('--g', 6 + spd * 0.8 + kick * 10 + (me.ground ? 0 : 10) + 'px');
    $('#ammo').innerHTML = me.reload > 0 ? '<i>LÄDT…</i>' : `<b>${me.ammo}</b>/${MAG}`;
    $('#dash').style.setProperty('--p', Math.max(0, me.dashCd / 1.6));
    for (let i = dmgNums.length - 1; i >= 0; i--) {
      const n = dmgNums[i]; n.t -= rdt; n.p.y += rdt * 1.2;
      const v = n.p.clone().project(cam);
      n.d.style.transform = `translate(${(v.x + 1) / 2 * innerWidth}px, ${(1 - v.y) / 2 * innerHeight}px) translate(-50%,-50%) scale(${1 + n.t * 0.5})`;
      n.d.style.opacity = v.z < 1 ? Math.min(1, n.t * 2) : 0;
      if (n.t <= 0) { n.d.remove(); dmgNums.splice(i, 1); }
    }
    renderer.render(scene, cam);
  }
  const sightRay = new THREE.Raycaster();
  function hasSight(a, b) {
    const from = a.eye(), to = b.pos.clone(); to.y += 1.2; const d = to.clone().sub(from), len = d.length();
    sightRay.set(from, d.normalize()); sightRay.far = len;
    return sightRay.intersectObjects(arena.solids, false).length === 0;
  }
  raf = requestAnimationFrame(frame);

  return {
    recv,
    stop() {
      cancelAnimationFrame(raf); cdT.forEach(clearTimeout);
      removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('mousemove', mm); removeEventListener('mouseup', mu); removeEventListener('resize', resize);
      document.removeEventListener('pointerlockchange', plc);
      if (document.pointerLockElement) document.exitPointerLock();
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      renderer.dispose(); renderer.forceContextLoss(); root.remove();
    },
  };
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

const HUD = `
<div id="vig"></div>
<div class="bars"><div class="bar me" data-v=""><i id="hpMe"></i><span id="nmMe"></span></div><div id="time">90</div><div class="bar foe" data-v=""><i id="hpFoe"></i><span id="nmFoe"></span></div></div>
<div id="xh"><i></i><i></i><i></i><i></i></div><div id="hm"><i></i><i></i><i></i><i></i></div>
<div id="ammo"></div><div id="dash"></div>
<div id="vs"></div>
<div id="lock" class="hidden">Klicken zum Zielen</div>
<div id="end" class="hidden"></div>
<div id="touch" class="hidden"><button id="bFire">●</button><button id="bJump">⤒</button><button id="bDash">»</button><button id="bRel">R</button></div>`;

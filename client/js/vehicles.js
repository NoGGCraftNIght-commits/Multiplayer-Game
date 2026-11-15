import * as THREE from 'three';
import { stdMat, LITE } from './gfx.js';
import * as CANNON from 'cannon-es';
import { assets } from './assets.js';
import { VEHICLES, VEHICLE_TYPES, CAR_SIZE, HALF, SIZE, BLOCK, BEACH, RIVER, BRIDGES, BRIDGE_HALF, JUMPS, ROAD, roadCenter, rampParts, riverY } from './shared.js';
import { SLAB } from './world.js';
import { Interp } from './net.js';

const SCALE = new THREE.Vector3(...CAR_SIZE);
const HC = 0.62;          // Höhe des Physik-Schwerpunkts über Modellboden (m)
const WHEEL_R = 0.3 * SCALE.y;
const REST = 0.3, SAG = 0.065; // Federweg; SAG = Einfedern im Stand (g / (4 * Federhärte))
const DOOR_AT = 45;       // ab so viel Seitenschaden fehlt die Tür
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _ray = new THREE.Raycaster();
const ramp = (u, from) => { const t = Math.min(1, Math.max(0, (u - from) / (1 - from))); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const BURNT = stdMat({ color: 0x141312, roughness: 1 }), HOLE = new THREE.MeshBasicMaterial({ color: 0x07080a });
const GREY = [0.62, 0.62, 0.64], DARK = [0.07, 0.07, 0.07], FIRE = [3.2, 1.1, 0.18], EMBER = [2.4, 0.35, 0.05];
// Kenney-Atlas (8 x 8 Farbfelder, alle Autos teilen ihn): je Feld Lack, Glas, Zierteile, Reifen oder Chrom
const CELL_KIND = { '3,4': 'trim', '3,5': 'trim', '2,4': 'tire', '2,5': 'tire', '5,4': 'chrome', '5,5': 'chrome', '0,6': 'glass', '0,7': 'glass' }; // 'Spalte,Zeile'
const KIND = { paint: [0.32, 0.15, 1, '#c4c4c4'], glass: [0.06, 0, 0.5, '#262d38'], trim: [0.45, 0.2, 0.4, '#7a7f88'], tire: [0.92, 0, 0, '#5a5a5a'], chrome: [0.12, 1, 0, '#ffffff'], light: [0.2, 0, 1, '#ffffff'] }; // Rauheit, Metall, Klarlack, Farbe (multipliziert)
let CAR = null;
function carMaterial(map) {
  if (CAR) return CAR;
  const img = map.image, n = img.width, s = n / 8, mk = () => Object.assign(document.createElement('canvas'), { width: n, height: n });
  const col = mk(), rm = mk(), cc = mk(), g = col.getContext('2d'), gr = rm.getContext('2d'), gc = cc.getContext('2d');
  g.drawImage(img, 0, 0); g.globalCompositeOperation = 'multiply';
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    const k = CELL_KIND[x + ',' + y] || (y >= 6 && x <= 2 ? 'light' : 'paint');
    const [r, m, c, tint] = KIND[k];
    gr.fillStyle = `rgb(0,${r * 255 | 0},${m * 255 | 0})`; gr.fillRect(x * s, y * s, s, s); // glTF-Art: Rauheit in Grün, Metall in Blau
    gc.fillStyle = `rgb(${c * 255 | 0},0,0)`; gc.fillRect(x * s, y * s, s, s);
    g.fillStyle = tint; g.fillRect(x * s, y * s, s, s); // Lack etwas tiefer, Glas dunkel getönt
  }
  const tex = (c, srgb) => Object.assign(new THREE.CanvasTexture(c), { flipY: map.flipY, colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace, anisotropy: 4 });
  if (LITE) return CAR = new THREE.MeshLambertMaterial({ map: tex(col, true) }); // Chromebook: kein Klarlack
  const rmT = tex(rm);
  return CAR = new THREE.MeshPhysicalMaterial({ map: tex(col, true), roughnessMap: rmT, metalnessMap: rmT, clearcoatMap: tex(cc), clearcoat: 1, clearcoatRoughness: 0.06, roughness: 1, metalness: 1 });
}
const pixel = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
const SOFT = (() => { // weicher runder Tupfer für Rauch und Flammen
  const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.6, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

// Rauch und Feuer: Punktwolke, auf der CPU bewegt; Farbe [r,g,b] mit Deckkraft, die über die Lebenszeit ausblendet
class Puffs {
  constructor(scene, n, size, additive) {
    this.n = n; this.i = 0; this.q = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-999), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: SOFT, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.pts.frustumCulled = false; scene.add(this.pts);
  }
  emit(p, vx, vy, vz, life, c, a = 1) { this.q[this.i = (this.i + 1) % this.n] = { x: p.x, y: p.y, z: p.z, vx, vy, vz, life, age: 0, c, a }; }
  update(dt) {
    const pos = this.pts.geometry.attributes.position, col = this.pts.geometry.attributes.color, drag = 1 - Math.min(1, dt * 1.6);
    for (let k = 0; k < this.n; k++) {
      const q = this.q[k]; if (!q) continue;
      if ((q.age += dt) >= q.life) { this.q[k] = null; pos.setXYZ(k, 0, -999, 0); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vx *= drag; q.vz *= drag;
      pos.setXYZ(k, q.x, q.y, q.z); col.setXYZW(k, q.c[0], q.c[1], q.c[2], q.a * (1 - q.age / q.life));
    }
    pos.needsUpdate = col.needsUpdate = true;
  }
}

export class Vehicles {
  constructor(scene, city, heights) {
    this.scene = scene;
    this.list = [];
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0.2;
    this.world.allowSleep = false;
    const addBox = (x, y, z, hx, hy, hz, rx = 0) => this.world.addBody(new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), position: new CANNON.Vec3(x, y, z), quaternion: new CANNON.Quaternion().setFromEuler(rx, 0, 0) }));
    // Boden aus Boxen (Raycasts gegen CANNON.Plane treffen in cannon-es 0.20 nur eine Hälfte der Ebene), mit Lücke für den Fluss
    const { z0, z1, bed, slope } = RIVER, F = 1500, mz = (z0 + z1) / 2;
    addBox(0, -1, (z0 - F) / 2, F, 1, (z0 + F) / 2); addBox(0, -1, (z1 + F) / 2, F, 1, (F - z1) / 2);
    for (const s of [-1, 1]) addBox(s * (HALF + F) / 2, -1, mz, (F - HALF) / 2, 1, (z1 - z0) / 2);
    addBox(0, bed - 1, mz, HALF, 1, (z1 - z0) / 2 - slope);                                                     // Flussbett
    const a = Math.atan2(-bed, slope), sl = Math.hypot(bed, slope) / 2;                                            // Böschungen
    for (const s of [-1, 1]) addBox(0, bed / 2 - 0.5 * Math.cos(a), mz + s * ((z1 - z0) / 2 - slope / 2) + s * 0.5 * Math.sin(a), HALF, 0.5, sl, s * -a);
    for (const s of [-1, 1]) addBox(s * (HALF + 0.5), bed / 2, mz, 0.5, -bed / 2, (z1 - z0) / 2);                // Kanalenden
    for (const c of BRIDGES) { // Brücken (an den Stadträndern nur bis zum Kanalende) mit Brüstung
      const xa = Math.max(c - BRIDGE_HALF, -HALF), xb = Math.min(c + BRIDGE_HALF, HALF);
      addBox((xa + xb) / 2, -RIVER.deck / 2, mz, (xb - xa) / 2, RIVER.deck / 2, (z1 - z0) / 2);
      for (const x of [xa + 0.2, xb - 0.2]) addBox(x, 0.55, mz, 0.2, 0.55, (z1 - z0) / 2);
    }
    for (const i of JUMPS) for (const s of [-1, 1]) for (const p of rampParts()) // Sprungrampen an beiden Ufern, Kante genau an der Böschung
      addBox(roadCenter(i), p.y - Math.cos(p.a), mz + s * ((z1 - z0) / 2 + p.d) - s * Math.sin(p.a), ROAD / 2, 1, p.L / 2 + 0.05, s * p.a);
    for (const b of city.blocks) {
      if (b.type !== 'river') { addBox((b.x0 + b.x1) / 2, SLAB / 2, (b.z0 + b.z1) / 2, BLOCK / 2, SLAB / 2, BLOCK / 2); continue; }
      for (const [za, zb] of [[b.z0, z0], [z1, b.z1]]) addBox((b.x0 + b.x1) / 2, SLAB / 2, (za + zb) / 2, BLOCK / 2, SLAB / 2, (zb - za) / 2);
    }
    city.solids.forEach((s, i) => { const h = heights[i] || 4; addBox((s.x0 + s.x1) / 2, h / 2, (s.z0 + s.z1) / 2, (s.x1 - s.x0) / 2, h / 2, (s.z1 - s.z0) / 2); });
    for (const [x, z, hx, hz] of [[BEACH / 2, -HALF - 1, SIZE / 2 + BEACH / 2 + 6, 1], [BEACH / 2, HALF + 1, SIZE / 2 + BEACH / 2 + 6, 1], [-HALF - 1, 0, 1, SIZE / 2 + 2], [HALF + BEACH + 5, 0, 1, SIZE / 2 + 2]]) addBox(x, 2, z, hx, 2, hz);
    this.mine = null; // { v, rv } wenn ich fahre
    this.far = 400;   // Sichtweite für Autos, setzt main.js nach der Qualitätsstufe
    this.hz = 60;     // Physik-Takt (Chromebook-Stufen: 30)
    this.smoke = new Puffs(scene, 260, 1.7, false); this.fire = new Puffs(scene, 220, 1.0, true); this.debris = [];
    this.flash = new THREE.PointLight(0xff8a30, 0, 45); scene.add(this.flash); // von Anfang an in der Szene: kein Shader-Neubau beim ersten Knall
    this.onBoom = null; // (v) => Ton usw.
    // weicher Schatten unter jedem Auto, ein Draw Call für alle (auf "Niedrig" der einzige Schatten)
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: SOFT, color: 0, transparent: true, opacity: 0.6, depthWrite: false }), 160);
    this.blobs.frustumCulled = false; this.blobs.count = 0; scene.add(this.blobs);
  }

  // s = [id,x,y,z,qx,qy,qz,qw,steer,driver,typeIdx,traffic]
  add(s) {
    const type = VEHICLE_TYPES[s[10]] || 'sedan';
    const cfg = VEHICLES[type];
    const model = assets.models[type].scene.clone(true);
    model.scale.copy(SCALE);
    model.traverse(o => { if (o.isMesh && o.material.map) o.material = carMaterial(o.material.map); });
    const group = new THREE.Group(); group.add(model); this.scene.add(group);
    // Räder aus der gestreckten Karosserie lösen (sonst würden sie oval); das Reserverad am Heck zählt nicht
    const wheels = [];
    model.traverse(o => { if (/^wheel-(front|back)-(left|right)$/.test(o.name)) wheels.push({ node: o, front: o.name.includes('front'), base: o.quaternion.clone() }); });
    for (const w of wheels) { w.node.position.multiply(SCALE); w.node.scale.multiplyScalar(SCALE.y); group.add(w.node); }
    const shell = []; model.traverse(o => { if (o.isMesh) shell.push(o); }); // Karosserie-Teile (verformbar)
    const bb = new THREE.Box3().setFromObject(group);
    const half = new CANNON.Vec3((bb.max.x - bb.min.x) / 2 * 0.95, 0.36, (bb.max.z - bb.min.z) / 2 * 0.97);
    const body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0 });
    body.addShape(new CANNON.Box(half), new CANNON.Vec3(0, 0.12, (bb.max.z + bb.min.z) / 2));
    this.world.addBody(body);
    // Licht: Scheinwerfer (emissiv, leuchten nachts mit Bloom)
    const lightMat = stdMat({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.3 });
    const tailMat = stdMat({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 0.4 });
    const hl = new THREE.BoxGeometry(0.3, 0.11, 0.05);
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(hl, lightMat); h.position.set(sx * half.x * 0.62, 0.6, bb.max.z + 0.01); group.add(h);
      const t = new THREE.Mesh(hl, tailMat); t.position.set(sx * half.x * 0.66, 0.68, bb.min.z - 0.01); group.add(t);
    }
    const v = { id: s[0], type, cfg, group, model, wheels, shell, body, half, bb, lightMat, tailMat, buf: new Interp(), hp: 100, dz: [0, 0, 0, 0], st: 0, doors: [null, null], hop: -1, driver: s[9], traffic: !!s[11], spin: 0, steer: 0, speed: 0,
      pos: new THREE.Vector3(s[1], s[2], s[3]), quat: new THREE.Quaternion(s[4], s[5], s[6], s[7]) };
    this.list[v.id] = v;
    this.place(v, v.pos, v.quat);
    return v;
  }

  place(v, pos, quat) {
    v.group.position.copy(pos); v.group.quaternion.copy(quat);
    v.body.position.set(pos.x, pos.y + HC, pos.z);
    v.body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
  }

  snapshot(t, s) {
    const v = this.list[s[0]] || this.add(s);
    v.driver = s[9]; v.traffic = !!s[11];
    if (this.mine?.v === v) return;
    v.buf.push(t, s);
  }

  // ---------- selbst fahren ----------
  startDriving(v) {
    const cfg = v.cfg, body = v.body;
    this.world.removeBody(body);
    body.type = CANNON.Body.DYNAMIC; body.mass = cfg.mass; body.updateMassProperties();
    body.angularDamping = 0.5; body.linearDamping = 0.02;
    body.velocity.setZero(); body.angularVelocity.setZero();
    body.position.y += 0.12;
    const rv = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    for (const w of v.wheels) {
      const p = w.node.position; // Radmitte in Metern (Fahrzeugkoordinaten)
      rv.addWheel({
        radius: WHEEL_R, directionLocal: new CANNON.Vec3(0, -1, 0), axleLocal: new CANNON.Vec3(-1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(p.x, p.y - HC + REST - SAG, p.z),
        suspensionStiffness: 38, suspensionRestLength: REST, frictionSlip: cfg.grip, dampingRelaxation: 2.6, dampingCompression: 4.2,
        maxSuspensionForce: 1e6, rollInfluence: 0.04, maxSuspensionTravel: 0.25, customSlidingRotationalSpeed: -30, useCustomSlidingRotationalSpeed: true,
      });
      rv.wheelInfos[rv.wheelInfos.length - 1].isFront = w.front;
    }
    rv.addToWorld(this.world);
    this.mine = { v, rv, flipT: 0 };
    v.buf.clear();
  }

  stopDriving() {
    if (!this.mine) return;
    const { v, rv } = this.mine;
    rv.removeFromWorld(this.world);
    const b = v.body;
    b.type = CANNON.Body.KINEMATIC; b.mass = 0; b.updateMassProperties();
    b.velocity.setZero(); b.angularVelocity.setZero();
    this.world.addBody(b);
    this.mine = null;
  }

  // Server hat einen Sprung abgelehnt: Auto auf seinen Stand zurücksetzen
  fix(s) {
    const b = this.mine?.v.body;
    if (b && this.mine.v.id === s[0]) { b.position.set(s[1], s[2] + HC, s[3]); b.velocity.setZero(); b.angularVelocity.setZero(); }
  }

  // input: { throttle -1..1, steer -1..1, handbrake }
  drive(input, dt) {
    const { v, rv } = this.mine, cfg = v.cfg, b = v.body;
    const power = v.st ? 0 : 0.5 + 0.5 * Math.min(1, v.hp / 60); // angeschlagener Motor zieht schlechter, brennend gar nicht
    const fwd = new CANNON.Vec3(); b.quaternion.vmult(new CANNON.Vec3(0, 0, 1), fwd);
    const speed = b.velocity.dot(fwd);
    v.speed = speed;
    let engine = 0, brake = 0;
    if (riverY(b.position.x, b.position.z) < -0.3) engine = 0.7; // im Kanal: mehr Zugkraft, damit auch schwere Wagen die Böschung hochkommen
    if (input.throttle > 0) { if (speed < -1) brake = 60; else if (speed < cfg.vmax) engine = cfg.force * input.throttle * power * (1 + engine); }
    else if (input.throttle < 0) { if (speed > 1) brake = 70 * -input.throttle; else if (speed > -12) engine = cfg.force * 0.6 * input.throttle * power; }
    else brake = 4;
    this.braking = brake > 10 || !!input.handbrake;
    const steerMax = cfg.steer * (1 - Math.min(Math.abs(speed) / cfg.vmax, 1) * 0.6);
    v.steer += (input.steer * steerMax - v.steer) * Math.min(1, dt * 8);
    rv.wheelInfos.forEach((w, i) => {
      if (w.isFront) rv.setSteeringValue(-v.steer, i);
      rv.applyEngineForce(w.isFront ? 0 : -engine / 2, i); // negative Kraft = vorwärts (+z); je Hinterrad die halbe Motorkraft
      const hb = input.handbrake && !w.isFront;
      rv.setBrake(hb ? 90 : brake, i);
      w.frictionSlip = hb ? cfg.grip * 0.45 : cfg.grip;
    });
    b.linearDamping = b.position.y < RIVER.water + 0.4 ? 0.4 : 0.02; // im Fluss bremst das Wasser
    // Abtrieb: mehr Bodenhaftung bei Tempo
    b.applyForce(new CANNON.Vec3(0, -Math.abs(speed) * cfg.mass * 0.04, 0)); // im Schwerpunkt (cannon-es: Angriffspunkt ist relativ, nicht in Weltkoordinaten)
    // Umgekippt? -> nach 1,5 s automatisch aufrichten
    const upv = new CANNON.Vec3(); b.quaternion.vmult(new CANNON.Vec3(0, 1, 0), upv);
    this.mine.flipT = upv.y < 0.35 && Math.abs(speed) < 3 ? this.mine.flipT + dt : 0;
    if (this.mine.flipT > 1.5) this.resetUpright();
  }

  resetUpright() {
    const b = this.mine.v.body, e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w), 'YXZ');
    b.quaternion.setFromEuler(0, e.y, 0, 'YXZ'); b.position.y += 1.2; b.velocity.setZero(); b.angularVelocity.setZero(); this.mine.flipT = 0;
  }

  // ---------- pro Frame ----------
  update(dt, renderT, night, eye) {
    const self = this.mine?.v;
    let nb = 0;
    for (const v of this.list) if (v) v.group.visible = v.pos.distanceToSquared(eye) < this.far * this.far; // hinter dem Nebel: nicht zeichnen (Kamera reicht bis zu den Bergen)
    for (const v of this.list) if (v && nb < 160) this.blobs.setMatrixAt(nb++, _m1.compose(_p.set(v.pos.x, v.pos.y + 0.04, v.pos.z), v.quat, _d.set((v.bb.max.x - v.bb.min.x) * 1.15, 1, (v.bb.max.z - v.bb.min.z) * 1.1)));
    this.blobs.count = nb; this.blobs.instanceMatrix.needsUpdate = true;
    // fremde Fahrzeuge: interpolierte Pose -> Kinematik-Körper
    for (const v of this.list) {
      if (!v || v === self) continue;
      const s = v.buf.sample(renderT);
      if (!s) continue;
      const [a, c, k] = s;
      const np = new THREE.Vector3(a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k, a[3] + (c[3] - a[3]) * k);
      const nq = new THREE.Quaternion(a[4], a[5], a[6], a[7]).slerp(new THREE.Quaternion(c[4], c[5], c[6], c[7]), k);
      const moved = np.clone().sub(v.pos);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(nq);
      v.speed = dt > 0 ? moved.dot(fwd) / dt : 0;
      v.steer = a[8] + (c[8] - a[8]) * k;
      v.body.velocity.set(moved.x / Math.max(dt, 1e-3), moved.y / Math.max(dt, 1e-3), moved.z / Math.max(dt, 1e-3));
      v.pos.copy(np); v.quat.copy(nq);
      this.place(v, np, nq);
    }
    this.world.step(1 / this.hz, dt, 4);
    for (const v of this.list) {
      if (!v) continue;
      if (v === self) { // eigene Pose aus Physik, zwischen den festen Physikschritten geglättet (auch der Server liest daraus das Tempo)
        const b = v.body, q = b.interpolatedQuaternion, p = b.interpolatedPosition;
        v.quat.set(q.x, q.y, q.z, q.w);
        v.pos.set(p.x, p.y - HC, p.z);
        v.group.position.copy(v.pos); v.group.quaternion.copy(v.quat);
      } else if (!v.buf.len()) { v.body.velocity.setZero(); }
      // Räder drehen + lenken
      v.spin += v.speed * dt / WHEEL_R;
      for (const w of v.wheels) {
        w.node.quaternion.copy(w.base);
        if (w.front) w.node.rotateY(v.steer);
        w.node.rotateX(v.spin);
      }
      const lit = night > 0.4 && (v.driver || v.traffic);
      v.lightMat.emissiveIntensity = lit ? 4 : 0.3;
      v.tailMat.emissiveIntensity = v === self && this.braking ? 4 : lit ? 2.5 : 0.4;
      if (v.hop >= 0) { // Explosion wirft das Wrack hoch (nur Optik, der Server lässt es stehen)
        const u = (v.hop += dt) / 1.1;
        this.place(v, v.pos, v.quat);
        if (u >= 1) v.hop = -1; else { v.group.position.y += 4 * u * (1 - u) * 1.9; v.group.rotateZ(Math.sin(u * Math.PI) * 0.5); }
      }
      // Rauch ab halber Energie (erst hell, dann dunkel), Flammen wenn es brennt
      if ((v.hp >= 55 && !v.st) || v.pos.distanceToSquared(eye) > 150 * 150) continue;
      const hood = v.group.localToWorld(_p.set(rnd(-0.3, 0.3), 0.95, v.st === 2 ? rnd(-1, 1) : v.bb.max.z - 0.75));
      if (Math.random() < dt * (v.st ? 30 : 12)) this.smoke.emit(hood, rnd(-0.4, 0.4), rnd(1.4, 2.6), rnd(-0.4, 0.4), rnd(1.8, 3), v.st || v.hp < 28 ? DARK : GREY, v.st ? 0.95 : 0.6);
      if (v.st) for (let k = Math.random() < dt * (v.st === 1 ? 70 : 14) ? 2 : 0; k > 0; k--) this.fire.emit(hood, rnd(-0.5, 0.5), rnd(1.2, 3.2), rnd(-0.5, 0.5), rnd(0.3, 0.7), k > 1 ? FIRE : EMBER);
    }
    this.smoke.update(dt); this.fire.update(dt);
    this.flash.intensity *= Math.exp(-dt * 8);
    this.debris = this.debris.filter(d => { // abgefallene Türen
      if ((d.t += dt) > 10) { this.scene.remove(d.mesh); return false; }
      if (d.vel) {
        d.vel.y -= 12 * dt; d.mesh.position.addScaledVector(d.vel, dt); d.mesh.rotation.x += d.spin * dt; d.mesh.rotation.z += d.spin * 0.7 * dt;
        if (d.mesh.position.y < 0.1) { d.mesh.position.y = 0.1; d.mesh.rotation.set(0, d.mesh.rotation.y, Math.PI / 2); d.vel = null; }
      }
      return true;
    });
  }

  // ---------- Schaden: die Zahlen kommen vom Server, hier wird nur gezeigt ----------
  // s = [id, hp, vorn, hinten, links, rechts, zustand]; quiet = Stand beim Beitritt (ohne Knall und fliegende Türen)
  setDamage(s, quiet) {
    const v = this.list[s[0]]; if (!v) return;
    const was = v.st, dz = s.slice(2, 6);
    v.hp = s[1]; v.st = s[6];
    if (dz.some((d, i) => d !== v.dz[i])) { v.dz = dz; this.crumple(v); }
    for (const i of [0, 1]) if ((dz[2 + i] >= DOOR_AT) !== !!v.doors[i]) this.door(v, i, quiet);
    if ((v.st === 2) !== (was === 2)) v.group.traverse(o => { // Wrack: alles verkohlt; ersetztes Auto: Originalmaterial zurück
      if (!o.isMesh || v.doors.includes(o)) return;
      if (v.st === 2) { o.userData.mat ||= o.material; o.material = BURNT; } else if (o.userData.mat) o.material = o.userData.mat;
    });
    if (v.st === 2 && was !== 2 && !quiet) this.boom(v);
  }

  // Blech je Zone zur Fahrzeugmitte drücken (immer aus der Originalform gerechnet: 0 Schaden = wieder heil)
  crumple(v) {
    const bb = v.bb, cx = (bb.max.x + bb.min.x) / 2, cz = (bb.max.z + bb.min.z) / 2, hx = (bb.max.x - bb.min.x) / 2, hz = (bb.max.z - bb.min.z) / 2;
    const [f, r, l, rt] = v.dz.map(d => d / 100);
    v.group.updateMatrixWorld(true);
    _m1.copy(v.group.matrixWorld).invert();
    for (const o of v.shell) {
      const base = o.userData.base ||= o.geometry.attributes.position;
      if (!o.userData.own) { // erst beim ersten Schaden bekommt das Auto eine eigene Geometrie (sonst teilen sich alle Autos eines Typs eine)
        o.geometry = o.geometry.clone(); o.geometry.setAttribute('position', new THREE.Float32BufferAttribute(base.count * 3, 3)); o.userData.own = true;
      }
      const pos = o.geometry.attributes.position;
      _m2.multiplyMatrices(_m1, o.matrixWorld); _m3.copy(_m2).invert();
      for (let i = 0; i < base.count; i++) {
        _p.fromBufferAttribute(base, i).applyMatrix4(_m2); // in Metern, Fahrzeugkoordinaten
        const n = Math.abs(Math.sin(_p.x * 12.9898 + _p.y * 78.233 + _p.z * 37.719) * 43758.5453) % 1, k = 0.55 + 0.45 * n; // Zufall aus dem Ort: doppelte Eckpunkte bleiben zusammen
        const u = (_p.z - cz) / hz, w = (_p.x - cx) / hx, mid = 1 - 0.5 * Math.abs(u);
        const tf = ramp(u, 0.3) * f, tr = ramp(-u, 0.3) * r, tl = ramp(w, 0.5) * l * mid, tq = ramp(-w, 0.5) * rt * mid;
        _p.z += (tr - tf) * hz * 0.42 * k;
        _p.x += (tq - tl) * hx * 0.36 * k + (tf + tr) * (n - 0.5) * 0.22;
        _p.y -= (tf + tr) * 0.16 * n * Math.max(0, _p.y - 0.4);
        _p.applyMatrix4(_m3); pos.setXYZ(i, _p.x, _p.y, _p.z);
      }
      pos.needsUpdate = true; o.geometry.computeVertexNormals();
    }
  }

  // Tür i (0 links, 1 rechts) fehlt: dunkle Öffnung in der Seite, die Tür selbst fliegt weg. Zweiter Aufruf = Tür wieder da.
  door(v, i, quiet) {
    if (v.doors[i]) { v.group.remove(v.doors[i]); v.doors[i] = null; return; }
    const sx = i ? -1 : 1, len = v.bb.max.z - v.bb.min.z, z = (v.bb.max.z + v.bb.min.z) / 2 + len * 0.04;
    v.group.updateMatrixWorld(true);
    _ray.set(v.group.localToWorld(_p.set(sx * 3, 0.62, z)), _d.set(-sx, 0, 0).transformDirection(v.group.matrixWorld));
    const hit = _ray.intersectObjects(v.shell, false)[0]; // Blech der Seite: dort sitzt die Öffnung, dort wird die Lackfarbe abgelesen
    const x = hit ? v.group.worldToLocal(hit.point).x : sx * v.half.x, img = hit?.object.material.map?.image;
    let color = 0x777b84;
    if (img && hit.uv) {
      const uv = hit.object.material.map.transformUv(hit.uv);
      pixel.drawImage(img, Math.floor(uv.x * img.width), Math.floor(uv.y * img.height), 1, 1, 0, 0, 1, 1);
      const c = pixel.getImageData(0, 0, 1, 1).data; color = (c[0] << 16) | (c[1] << 8) | c[2];
    }
    const hole = v.doors[i] = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.27, 0.62), HOLE);
    hole.position.set(x + sx * 0.03, 0.66, z); hole.rotation.y = sx * Math.PI / 2; v.group.add(hole);
    if (quiet) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, len * 0.27), stdMat({ color, roughness: 0.6 }));
    hole.getWorldPosition(mesh.position); mesh.quaternion.copy(v.quat); mesh.castShadow = true; this.scene.add(mesh);
    this.debris.push({ mesh, t: 0, spin: rnd(3, 7), vel: _d.set(sx * 3.5, 2.6, 0).applyQuaternion(v.quat).clone() });
  }

  boom(v) {
    v.hop = 0;
    const p = _p.copy(v.pos); p.y += 0.9;
    for (let k = 0; k < 60; k++) { const a = rnd(0, 6.28), sp = rnd(1, 9); this.fire.emit(p, Math.cos(a) * sp, rnd(1, 8), Math.sin(a) * sp, rnd(0.45, 1.1), k % 3 ? FIRE : EMBER); }
    for (let k = 0; k < 34; k++) { const a = rnd(0, 6.28), sp = rnd(0.5, 5); this.smoke.emit(p, Math.cos(a) * sp, rnd(2, 6), Math.sin(a) * sp, rnd(1.8, 3.4), DARK, 0.85); }
    this.flash.position.copy(p).y += 1.2; this.flash.intensity = 1400;
    this.onBoom?.(v);
  }

  nearest(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const v of this.list) {
      if (!v || v.driver || v.st === 2) continue; // Wracks fährt niemand
      const d = v.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  // Kreis (Spieler) aus allen Fahrzeug-Quadern schieben
  pushOut(x, z, rad) {
    let ox = 0, oz = 0;
    for (const v of this.list) {
      if (!v) continue;
      const dx = x - v.pos.x, dz = z - v.pos.z;
      if (dx * dx + dz * dz > 25) continue;
      const yaw = Math.atan2(2 * (v.quat.w * v.quat.y + v.quat.x * v.quat.z), 1 - 2 * (v.quat.y * v.quat.y + v.quat.x * v.quat.x));
      const c = Math.cos(-yaw), s = Math.sin(-yaw);
      const lx = dx * c + dz * s, lz = -dx * s + dz * c;
      const hx = v.half.x, hz = v.half.z, cz = (v.bb.max.z + v.bb.min.z) / 2;
      const px = Math.max(-hx, Math.min(lx, hx)), pz = Math.max(cz - hz, Math.min(lz, cz + hz));
      let ex = lx - px, ez = lz - pz, d = Math.hypot(ex, ez);
      if (d >= rad) continue;
      if (d < 1e-4) { ex = Math.sign(lx) || 1; ez = 0; d = 0; } else { ex /= d; ez /= d; }
      const push = rad - d;
      // zurück in Weltkoordinaten
      ox += (ex * c - ez * s) * push; oz += (ex * s + ez * c) * push;
    }
    return ox || oz ? [ox, oz] : null;
  }
}

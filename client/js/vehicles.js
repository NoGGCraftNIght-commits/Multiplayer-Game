import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { assets } from './assets.js';
import { VEHICLES, VEHICLE_TYPES, CAR_SCALE, HALF, SIZE, BLOCK, BEACH } from './shared.js';
import { SLAB } from './world.js';
import { Interp } from './net.js';

const HC = 1.0;           // Höhe des Physik-Schwerpunkts über Modellboden (m)
const WHEEL_R = 0.3 * CAR_SCALE;
const REST = 0.35;

export class Vehicles {
  constructor(scene, city, heights) {
    this.scene = scene;
    this.list = [];
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0.2;
    this.world.allowSleep = false;
    // Boden als große Box: Raycasts gegen CANNON.Plane treffen in cannon-es 0.20 nur eine Hälfte der Ebene
    this.world.addBody(new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(1500, 1, 1500)), position: new CANNON.Vec3(0, -1, 0) }));
    const addBox = (x, y, z, hx, hy, hz) => this.world.addBody(new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), position: new CANNON.Vec3(x, y, z) }));
    for (const b of city.blocks) addBox((b.x0 + b.x1) / 2, SLAB / 2, (b.z0 + b.z1) / 2, BLOCK / 2, SLAB / 2, BLOCK / 2);
    city.solids.forEach((s, i) => { const h = heights[i] || 4; addBox((s.x0 + s.x1) / 2, h / 2, (s.z0 + s.z1) / 2, (s.x1 - s.x0) / 2, h / 2, (s.z1 - s.z0) / 2); });
    for (const [x, z, hx, hz] of [[BEACH / 2, -HALF - 1, SIZE / 2 + BEACH / 2 + 6, 1], [BEACH / 2, HALF + 1, SIZE / 2 + BEACH / 2 + 6, 1], [-HALF - 1, 0, 1, SIZE / 2 + 2], [HALF + BEACH + 5, 0, 1, SIZE / 2 + 2]]) addBox(x, 2, z, hx, 2, hz);
    this.mine = null; // { v, rv } wenn ich fahre
  }

  // s = [id,x,y,z,qx,qy,qz,qw,steer,driver,typeIdx,traffic]
  add(s) {
    const type = VEHICLE_TYPES[s[10]] || 'sedan';
    const cfg = VEHICLES[type];
    const model = assets.models[type].scene.clone(true);
    model.scale.setScalar(CAR_SCALE);
    const group = new THREE.Group(); group.add(model); this.scene.add(group);
    const wheels = [];
    model.traverse(o => { if (o.name.startsWith('wheel-')) wheels.push({ node: o, front: o.name.includes('front'), base: o.quaternion.clone() }); });
    const bb = new THREE.Box3().setFromObject(model);
    const half = new CANNON.Vec3((bb.max.x - bb.min.x) / 2 * 0.95, 0.55, (bb.max.z - bb.min.z) / 2 * 0.97);
    const body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0 });
    body.addShape(new CANNON.Box(half), new CANNON.Vec3(0, 0.25, (bb.max.z + bb.min.z) / 2));
    this.world.addBody(body);
    // Licht: Scheinwerfer (emissiv, leuchten nachts mit Bloom)
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.3 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 0.4 });
    const hl = new THREE.BoxGeometry(0.35, 0.15, 0.05);
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(hl, lightMat); h.position.set(sx * half.x * 0.6, 0.85, bb.max.z + 0.01); group.add(h);
      const t = new THREE.Mesh(hl, tailMat); t.position.set(sx * half.x * 0.65, 0.95, bb.min.z - 0.01); group.add(t);
    }
    const v = { id: s[0], type, cfg, group, model, wheels, body, half, bb, lightMat, tailMat, buf: new Interp(), driver: s[9], traffic: !!s[11], spin: 0, steer: 0, speed: 0,
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
    body.position.y += 0.3;
    const rv = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    for (const w of v.wheels) {
      const p = w.node.position;
      rv.addWheel({
        radius: WHEEL_R, directionLocal: new CANNON.Vec3(0, -1, 0), axleLocal: new CANNON.Vec3(-1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(p.x * CAR_SCALE, p.y * CAR_SCALE - HC + 0.2, p.z * CAR_SCALE),
        suspensionStiffness: 38, suspensionRestLength: REST, frictionSlip: cfg.grip, dampingRelaxation: 2.6, dampingCompression: 4.2,
        maxSuspensionForce: 1e6, rollInfluence: 0.04, maxSuspensionTravel: 0.3, customSlidingRotationalSpeed: -30, useCustomSlidingRotationalSpeed: true,
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

  // input: { throttle -1..1, steer -1..1, handbrake }
  drive(input, dt) {
    const { v, rv } = this.mine, cfg = v.cfg, b = v.body;
    const fwd = new CANNON.Vec3(); b.quaternion.vmult(new CANNON.Vec3(0, 0, 1), fwd);
    const speed = b.velocity.dot(fwd);
    v.speed = speed;
    let engine = 0, brake = 0;
    if (input.throttle > 0) { if (speed < -1) brake = 60; else if (speed < cfg.vmax) engine = cfg.force * input.throttle; }
    else if (input.throttle < 0) { if (speed > 1) brake = 70 * -input.throttle; else if (speed > -12) engine = cfg.force * 0.6 * input.throttle; }
    else brake = 4;
    const steerMax = cfg.steer * (1 - Math.min(Math.abs(speed) / cfg.vmax, 1) * 0.6);
    v.steer += (input.steer * steerMax - v.steer) * Math.min(1, dt * 8);
    rv.wheelInfos.forEach((w, i) => {
      if (w.isFront) rv.setSteeringValue(-v.steer, i);
      rv.applyEngineForce(w.isFront ? 0 : -engine, i); // negative Kraft = vorwärts (+z)
      const hb = input.handbrake && !w.isFront;
      rv.setBrake(hb ? 90 : brake, i);
      w.frictionSlip = hb ? cfg.grip * 0.45 : cfg.grip;
    });
    // Abtrieb: mehr Bodenhaftung bei Tempo
    b.applyForce(new CANNON.Vec3(0, -Math.abs(speed) * cfg.mass * 0.04, 0), b.position);
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
  update(dt, renderT, night) {
    const self = this.mine?.v;
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
    this.world.step(1 / 60, dt, 4);
    for (const v of this.list) {
      if (!v) continue;
      if (v === self) { // eigene Pose aus Physik
        const b = v.body;
        v.quat.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        v.pos.set(b.position.x, b.position.y - HC, b.position.z);
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
      v.tailMat.emissiveIntensity = lit ? 2.5 : (v === self && this.braking ? 3 : 0.4);
    }
  }

  nearest(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const v of this.list) {
      if (!v || v.driver) continue;
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

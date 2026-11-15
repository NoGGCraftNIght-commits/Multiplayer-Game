import * as THREE from 'three';
import { WEAPONS, rng, pushOut } from './shared.js';

// Spielzeug-Blaster: Projektile fliegen sichtbar (Wasser, Schaumpfeile, Konfetti, Farbkleckse).
// Der Schütze erkennt Treffer lokal und meldet sie dem Server, der sie prüft und den Schaden setzt; fremde Schüsse sind nur Effekt.
// Munition zählt der Server mit: der Zähler hier ist nur die Vorhersage fürs HUD.
// Streuung kommt aus einem Seed, damit alle Clients dieselben Flugbahnen sehen.
const MAXP = 240, MAXQ = 900, MAXD = 140;
const Z = new THREE.Vector3(0, 0, 1), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color();
const SHAPE = { water: [0.05, 0.3], dart: [0.035, 0.22], confetti: [0.05, 0.05], paint: [0.15, 0.15] };
const SOUND = { water: 1.5, dart: 0.9, confetti: 0.6, paint: 0.45 };

export class Combat {
  // env: { scene, city, heights, groundY(x,z), vehicles, audio, targets() -> [{t,id,x,y,z,me?}], onHit(target, weapon), onReload(weapon) }
  constructor(env) {
    Object.assign(this, env);
    this.weapon = 0; this.ammo = WEAPONS.map(w => w.mag); this.cool = 0; this.reloadT = 0;
    this.shots = []; this.parts = []; this.decalN = 0;
    this.projMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshStandardMaterial({ roughness: 0.35 }), MAXP);
    this.projMesh.count = 0; this.projMesh.frustumCulled = false;
    this.decals = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14), new THREE.MeshStandardMaterial({ roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -4 }), MAXD);
    this.decals.count = 0; this.decals.frustumCulled = false; this.decals.receiveShadow = true;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXQ * 3).fill(-999), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXQ * 3), 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, sizeAttenuation: true }));
    this.points.frustumCulled = false; this.partI = 0;
    this.scene.add(this.projMesh, this.decals, this.points);
  }

  get w() { return WEAPONS[this.weapon]; }
  switchTo(i) { this.weapon = (i + WEAPONS.length) % WEAPONS.length; this.reloadT = 0; this.cool = Math.max(this.cool, 0.25); }
  reload() { if (!this.reloadT && this.ammo[this.weapon] < this.w.mag) { this.reloadT = this.w.reload; this.onReload(this.weapon); this.audio.play('dash', { vol: 0.5 }); } }

  // lokaler Schuss; liefert das Netzwerk-Paket oder null (Abklingzeit, leer, lädt nach)
  fire(origin, dir, color) {
    if (this.cool > 0 || this.reloadT > 0) return null;
    if (this.ammo[this.weapon] <= 0) { this.reload(); return null; }
    this.ammo[this.weapon]--; this.cool = 1 / this.w.rate;
    if (this.ammo[this.weapon] <= 0) this.reload();
    const shot = { w: this.weapon, o: origin.toArray(), d: dir.toArray(), seed: (Math.random() * 1e9) | 0 };
    this.spawn(shot, true, color);
    return shot;
  }

  spawn(shot, mine, color) {
    const w = WEAPONS[shot.w]; if (!w) return;
    const r = rng(shot.seed), d = new THREE.Vector3().fromArray(shot.d).normalize();
    const side = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? Z : new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(side, d);
    for (let i = 0; i < w.pellets; i++) {
      const v = d.clone().addScaledVector(side, (r() - 0.5) * 2 * w.spread).addScaledVector(up, (r() - 0.5) * 2 * w.spread).normalize().multiplyScalar(w.speed * (0.92 + r() * 0.16));
      const col = w.fx === 'confetti' ? new THREE.Color().setHSL(r(), 0.95, 0.58) : w.fx === 'water' ? new THREE.Color(0x8fe3ff) : w.fx === 'dart' ? new THREE.Color(0xff8a1f) : new THREE.Color(color);
      if (this.shots.length < MAXP) this.shots.push({ w, wi: shot.w, mine, col, p: new THREE.Vector3().fromArray(shot.o), v, left: w.range, hitIds: null });
      if (!i) this.burst(_v.fromArray(shot.o), w.fx === 'water' ? _c.set(0xd8f4ff) : col, w.fx === 'confetti' ? 6 : 3, 1.1, 0.22); // Mündungsnebel statt Feuer
    }
    this.audio.play('shoot', { pos: mine ? null : { x: shot.o[0], z: shot.o[2] }, vol: mine ? 0.5 : 0.8, rate: SOUND[w.fx] });
  }

  // Welt-Kollision eines Punktes: Normale oder null
  solidAt(x, y, z, n) {
    if (y < this.groundY(x, z)) return n.set(0, 1, 0);
    const s = this.city.solids;
    for (let i = 0; i < s.length; i++) {
      const b = s[i];
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || y > this.heights[i]) continue;
      const dx = Math.min(x - b.x0, b.x1 - x), dz = Math.min(z - b.z0, b.z1 - z), dy = this.heights[i] - y;
      if (dy < dx && dy < dz) return n.set(0, 1, 0);
      return dx < dz ? n.set(x - b.x0 < b.x1 - x ? -1 : 1, 0, 0) : n.set(0, 0, z - b.z0 < b.z1 - z ? -1 : 1);
    }
    if (y < 2.4) { const o = this.vehicles.pushOut(x, z, 0.05); if (o) return n.set(o[0], 0, o[1]).normalize(); }
    return null;
  }

  // Strahl in Schritten abtasten: Distanz bis zum ersten Hindernis (Zielpunkt, Kamera)
  trace(o, d, max, step = 0.5, from = 0) {
    for (let t = from; t < max; t += step) if (this.solidAt(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t, _v)) return t;
    return max;
  }

  burst(p, col, n, speed, life = 0.7) {
    for (let i = 0; i < n; i++) {
      const k = this.partI = (this.partI + 1) % MAXQ;
      this.parts[k] = { p: p.clone(), v: new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).multiplyScalar(speed * (0.4 + Math.random())), life: life * (0.6 + Math.random() * 0.8) };
      this.points.geometry.attributes.color.setXYZ(k, col.r, col.g, col.b);
    }
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  splat(p, n, col, size) {
    const i = this.decalN++ % MAXD;
    this.decals.count = Math.min(this.decalN, MAXD);
    this.decals.setMatrixAt(i, _m.compose(_v.copy(p).addScaledVector(n, 0.03), _q.setFromUnitVectors(Z, n), _s.set(size * (0.8 + Math.random() * 0.5), size, 1)));
    this.decals.setColorAt(i, col);
    this.decals.instanceMatrix.needsUpdate = true; this.decals.instanceColor.needsUpdate = true;
  }

  impact(s, n, target) {
    const fx = s.w.fx;
    this.burst(s.p, s.col, fx === 'paint' ? 26 : fx === 'confetti' ? 5 : 7, fx === 'paint' ? 4 : 2.6, fx === 'confetti' ? 1.6 : 0.6);
    if (!target && fx === 'paint') this.splat(s.p, n, s.col, 0.75);
    if (!target && fx === 'water') this.splat(s.p, n, _c.set(0x5f7f95), 0.16);
    this.audio.play(target ? 'hit' : 'impact', { pos: s.p, vol: fx === 'paint' ? 0.9 : 0.35, rate: fx === 'paint' ? 0.7 : 1.3 });
  }

  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
    if (this.reloadT > 0 && (this.reloadT -= dt) <= 0) { this.reloadT = 0; this.ammo[this.weapon] = this.w.mag; this.audio.play('confirm', { vol: 0.4 }); }
    const targets = this.shots.length ? this.targets() : [], n = new THREE.Vector3();
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.v.y -= (s.w.gravity ?? 1.5) * dt;
      const dist = s.v.length() * dt, steps = Math.max(1, Math.ceil(dist / 0.35));
      let dead = (s.left -= dist) <= 0;
      for (let k = 0; k < steps && !dead; k++) {
        s.p.addScaledVector(s.v, dt / steps);
        for (const t of targets) { // Zylinder um die Figur
          if ((s.mine && t.me) || s.p.y < t.y || s.p.y > t.y + 1.85 || (s.p.x - t.x) ** 2 + (s.p.z - t.z) ** 2 > 0.2) continue;
          this.impact(s, n, t); if (s.mine) this.onHit(t, s.wi); dead = true; break;
        }
        if (!dead && this.solidAt(s.p.x, s.p.y, s.p.z, n)) { this.impact(s, n, null); dead = true; }
      }
      if (dead) this.shots.splice(i, 1);
    }
    // Projektile zeichnen (gestreckt in Flugrichtung)
    this.projMesh.count = this.shots.length;
    this.shots.forEach((s, i) => {
      const [r, l] = SHAPE[s.w.fx];
      this.projMesh.setMatrixAt(i, _m.compose(s.p, _q.setFromUnitVectors(Z, _v.copy(s.v).normalize()), _s.set(r, r, l)));
      this.projMesh.setColorAt(i, s.col);
    });
    this.projMesh.instanceMatrix.needsUpdate = true; if (this.projMesh.instanceColor) this.projMesh.instanceColor.needsUpdate = true;
    // Partikel
    const pos = this.points.geometry.attributes.position;
    for (let k = 0; k < this.parts.length; k++) {
      const p = this.parts[k]; if (!p) continue;
      if ((p.life -= dt) <= 0) { this.parts[k] = null; pos.setXYZ(k, 0, -999, 0); continue; }
      p.v.y -= 9 * dt; p.p.addScaledVector(p.v, dt);
      const gy = this.groundY(p.p.x, p.p.z) + 0.03; if (p.p.y < gy) { p.p.y = gy; p.v.set(0, 0, 0); }
      pos.setXYZ(k, p.p.x, p.p.y, p.p.z);
    }
    pos.needsUpdate = true;
  }
}

// Selbsttest der Kollisionslogik (läuft unter Node: `node client/js/combat.js` braucht three -> nur im Browser-Test genutzt)
export function selfTest() {
  const c = Object.create(Combat.prototype);
  Object.assign(c, { city: { solids: [{ x0: 0, x1: 10, z0: 0, z1: 10 }] }, heights: [8], groundY: () => 0, vehicles: { pushOut: () => null } });
  const n = new THREE.Vector3();
  console.assert(c.solidAt(5, 3, 5, n) && c.solidAt(0.1, 3, 5, n).x === -1, 'Wand links');
  console.assert(c.solidAt(5, 7.9, 5, n).y === 1 && !c.solidAt(5, 9, 5, n) && c.solidAt(20, -0.1, 20, n).y === 1, 'Dach/Boden');
  console.assert(Math.abs(c.trace(new THREE.Vector3(-5, 1, 5), new THREE.Vector3(1, 0, 0), 50, 0.5) - 5) < 0.51, 'trace');
  console.assert(pushOut(c.city.solids, -0.2, 5, 0.4)[0] < 0, 'pushOut');
  return true;
}

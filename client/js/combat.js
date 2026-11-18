import * as THREE from 'three';
import { LITE } from './gfx.js';
import { WEAPONS, rng, pushOut } from './shared.js';

// Schusswaffen: jede Kugel fliegt sichtbar als Leuchtspur, an der Mündung blitzt es, am Ziel gibt es Funken, Staub und Einschusslöcher.
// Der Schütze erkennt Treffer lokal und meldet sie dem Server, der sie prüft und den Schaden setzt; fremde Schüsse sind nur Effekt.
// Munition zählt der Server mit: der Zähler hier ist nur die Vorhersage fürs HUD.
// Streuung kommt aus einem Seed, damit alle Clients dieselben Flugbahnen sehen.
const MAXP = 240, MAXQ = 900, MAXD = 140, NFLASH = 8;
const Z = new THREE.Vector3(0, 0, 1), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
const TRACER = new THREE.Color(5, 3.4, 1.6), SPARK = new THREE.Color(4, 2.6, 0.9), DUST = new THREE.Color(0x8d8a82), BLOOD = new THREE.Color(0x6e0b0b), HOLE = new THREE.Color(0x141312), BRASS = new THREE.Color(0xc9a24a), SHELL = new THREE.Color(0x9c1f1f);
const FLASH_TEX = (() => { // Mündungsfeuer: heller Kern mit Strahlen
  const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,250,220,1)'); r.addColorStop(0.25, 'rgba(255,200,90,.9)'); r.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = r; g.beginPath();
  for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, l = k % 2 ? 9 : 30; g.lineTo(32 + Math.cos(a) * l, 32 + Math.sin(a) * l); }
  g.fill(); return new THREE.CanvasTexture(c);
})();

const EMPTY = [];
export class Combat {
  // env: { scene, city, heights, groundY(x,z), vehicles, audio, targets() -> [{t,id,x,y,z,me?}], onHit(target, weapon), onReload(weapon) }
  constructor(env) {
    Object.assign(this, env);
    this.weapon = 0; this.ammo = WEAPONS.map(w => w.mag); this.cool = 0; this.reloadT = 0;
    this.shots = []; this.parts = []; this.decalN = 0;
    // Leuchtspuren als Linien und Mündungsfeuer als Punkte: beides lässt die Umgebungsverdeckung (GTAO) aus, Sprites würde sie schwarz malen
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true };
    this.tracers = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial(add));
    this.tracers.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 6), 3));
    this.tracers.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXP * 6), 3));
    this.flash = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ ...add, size: 0.55, map: FLASH_TEX }));
    this.flash.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NFLASH * 3).fill(-999), 3));
    this.flash.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NFLASH * 3).fill(2.2), 3));
    this.tracers.frustumCulled = this.flash.frustumCulled = false; this.flashT = new Float32Array(NFLASH);
    this.decals = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14), new THREE.MeshStandardMaterial({ roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -4 }), MAXD);
    this.decals.count = 0; this.decals.frustumCulled = false; this.decals.receiveShadow = true;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXQ * 3).fill(-999), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXQ * 3), 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, sizeAttenuation: true }));
    this.points.frustumCulled = false; this.partI = 0;
    this.flashI = 0;
    if (!LITE) { this.light = new THREE.PointLight(0xffb060, 0, 14, 2); this.scene.add(this.light); } // von Anfang an da: kein Shader-Neubau beim ersten Schuss
    this.scene.add(this.tracers, this.flash, this.decals, this.points);
  }

  get w() { return WEAPONS[this.weapon]; }
  switchTo(i) { this.weapon = (i + WEAPONS.length) % WEAPONS.length; this.reloadT = 0; this.cool = Math.max(this.cool, 0.25); }
  reload() { if (!this.reloadT && this.ammo[this.weapon] < this.w.mag) { this.reloadT = this.w.reload; this.onReload(this.weapon); this.audio.play('reload', { vol: 0.7 }); } }

  // lokaler Schuss; liefert das Netzwerk-Paket oder null (Abklingzeit, leer, lädt nach)
  fire(origin, dir, color) {
    if (this.cool > 0 || this.reloadT > 0) return null;
    if (this.ammo[this.weapon] <= 0) { this.audio.play('click', { vol: 0.5 }); this.cool = 0.25; this.reload(); return null; }
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
      if (this.shots.length < MAXP) this.shots.push({ w, wi: shot.w, mine, p: new THREE.Vector3().fromArray(shot.o), v, left: w.range, age: 0 });
    }
    // Mündungsfeuer + kurzer Lichtblitz, Hülse fliegt nach rechts oben
    const o = _v.fromArray(shot.o), k = this.flashI = (this.flashI + 1) % NFLASH, big = w.fx === 'shotgun' || w.fx === 'rifle';
    _p.copy(o).addScaledVector(d, 0.08); this.flash.geometry.attributes.position.setXYZ(k, _p.x, _p.y, _p.z); this.flash.geometry.attributes.position.needsUpdate = true; this.flashT[k] = 0.05;
    if (this.light) { this.light.position.copy(_p); this.light.intensity = big ? 9 : 6; }
    if (w.fx !== 'shotgun') this.burst(o.addScaledVector(side, 0.06), BRASS, 1, 2.2, 0.9);
    const pos = mine ? null : { x: shot.o[0], z: shot.o[2] };
    this.audio.play('gun' + shot.w, { pos, vol: mine ? 0.75 : 1, fall: 0.0008, muffle: true });
    if (w.fx === 'shotgun') { this.audio.play('pump', { pos, vol: 0.55, delay: 0.32 }); setTimeout(() => this.burst(_v.fromArray(shot.o).addScaledVector(side, 0.06), SHELL, 1, 2, 1), 380); }
    else this.audio.play('casing', { pos, vol: 0.18, delay: 0.35 + Math.random() * 0.15 });
  }

  // Welt-Kollision eines Punktes: Normale oder null
  solidAt(x, y, z, n) {
    if (y < this.groundY(x, z, y)) return n.set(0, 1, 0);
    const s = this.city.solids, cell = this.grid(x, z);
    for (const i of cell) {
      const b = s[i];
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || y > this.heights[i] || y < (b.y0 || -9)) continue;
      const dx = Math.min(x - b.x0, b.x1 - x), dz = Math.min(z - b.z0, b.z1 - z), dy = this.heights[i] - y;
      if (b.y0 && y - b.y0 < Math.min(dx, dz, dy)) return n.set(0, -1, 0); // Decke von unten
      if (dy < dx && dy < dz) return n.set(0, 1, 0);
      return dx < dz ? n.set(x - b.x0 < b.x1 - x ? -1 : 1, 0, 0) : n.set(0, 0, z - b.z0 < b.z1 - z ? -1 : 1);
    }
    if (y < 2.4) { const o = this.vehicles.pushOut(x, z, 0.05); if (o) return n.set(o[0], 0, o[1]).normalize(); }
    return null;
  }

  // Raster (16 m) über alle Hindernisse: jede Abfrage prüft nur die paar Rechtecke ihrer Zelle statt ~1500 (schont schwache CPUs)
  grid(x, z) {
    const G = 16, key = (a, b) => a * 4096 + b;
    if (!this.cells || this.cellsFor !== this.city.solids) {
      this.cells = new Map(); this.cellsFor = this.city.solids;
      this.city.solids.forEach((b, i) => {
        for (let a = Math.floor(b.x0 / G); a <= Math.floor(b.x1 / G); a++) for (let c = Math.floor(b.z0 / G); c <= Math.floor(b.z1 / G); c++) {
          const k = key(a, c); (this.cells.get(k) || this.cells.set(k, []).get(k)).push(i);
        }
      });
    }
    return this.cells.get(key(Math.floor(x / G), Math.floor(z / G))) || EMPTY;
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
    if (target) { this.burst(s.p, BLOOD, 7, 2, 0.45); this.audio.play('flesh', { pos: s.p, vol: 0.7 }); return; }
    this.burst(s.p, SPARK, 4, 5, 0.18); this.burst(s.p, DUST, 5, 1.2, 0.6);
    this.splat(s.p, n, HOLE, 0.045);
    this.audio.play(Math.random() < 0.12 ? 'ricochet' : 'bimpact', { pos: s.p, vol: 0.45 });
  }

  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
    for (let k = 0; k < NFLASH; k++) if (this.flashT[k] > 0 && (this.flashT[k] -= dt) <= 0) { this.flash.geometry.attributes.position.setXYZ(k, 0, -999, 0); this.flash.geometry.attributes.position.needsUpdate = true; }
    if (this.light) this.light.intensity *= Math.exp(-dt * 40);
    if (this.reloadT > 0 && (this.reloadT -= dt) <= 0) { this.reloadT = 0; this.ammo[this.weapon] = this.w.mag; this.audio.play('confirm', { vol: 0.4 }); }
    const targets = this.shots.length ? this.targets() : [], n = new THREE.Vector3();
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.v.y -= 1.5 * dt; s.age += dt;
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
    // Leuchtspur: Linie hinter der Kugel, vorn hell, hinten dunkel; beim Start kürzer (sonst ragt sie hinten aus der Waffe)
    const tp = this.tracers.geometry.attributes.position, tc = this.tracers.geometry.attributes.color;
    this.shots.forEach((s, i) => {
      const l = Math.min(2.5, s.age * s.w.speed * 0.6 + 0.3);
      _v.copy(s.v).normalize(); _p.copy(s.p).addScaledVector(_v, -l);
      tp.setXYZ(2 * i, _p.x, _p.y, _p.z); tp.setXYZ(2 * i + 1, s.p.x, s.p.y, s.p.z);
      tc.setXYZ(2 * i, 0.3, 0.15, 0.05); tc.setXYZ(2 * i + 1, TRACER.r, TRACER.g, TRACER.b);
    });
    this.tracers.geometry.setDrawRange(0, this.shots.length * 2); tp.needsUpdate = tc.needsUpdate = true;
    // Partikel
    const pos = this.points.geometry.attributes.position;
    for (let k = 0; k < this.parts.length; k++) {
      const p = this.parts[k]; if (!p) continue;
      if ((p.life -= dt) <= 0) { this.parts[k] = null; pos.setXYZ(k, 0, -999, 0); continue; }
      p.v.y -= 9 * dt; p.p.addScaledVector(p.v, dt);
      const gy = this.groundY(p.p.x, p.p.z, p.p.y) + 0.03; if (p.p.y < gy) { p.p.y = gy; p.v.set(0, 0, 0); }
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
  c.city.solids.push({ x0: 20, x1: 30, z0: 0, z1: 10, y0: 4 }); c.heights.push(9); c.cells = null; // Decke eines Ladens
  console.assert(!c.solidAt(25, 2, 5, n) && c.solidAt(25, 4.2, 5, n).y === -1 && pushOut(c.city.solids, 25, 5, 0.4) === null, 'Decke: darunter frei');
  return true;
}

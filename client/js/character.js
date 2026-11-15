import * as THREE from 'three';
import { stdMat } from './gfx.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assets } from './assets.js';
import { AVATARS, ANIMS, WEAPONS } from './shared.js';

// Realistische Menschen (Microsoft Rocketbox, MIT) mit Motion-Capture-Clips. Alle Avatare teilen
// ein Skelett, deshalb liegt jeder Clip nur einmal in avatar_clips.glb.
const ONCE = new Set(['interact', 'wave', 'no', 'shrug']);
const FEMALE = { idle: 'f_idle', walk: 'f_walk', run: 'f_run' };
const PACE = { walk: 1.01, run: 2.89, sprint: 5.83, f_walk: 1.22, f_run: 2.75 }; // m/s, die ein Clip von Natur aus zurücklegt
const UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4();
const guns = {}, rigs = {};
let clips;

// Griff-Ausrichtung einmal pro Avatar aus der T-Pose ableiten (Finger = vorn, Daumen = oben)
function rigOf(name) {
  if (rigs[name]) return rigs[name];
  const s = assets.models[name].scene; s.updateMatrixWorld(true);
  const hand = s.getObjectByName('Bip01_R_Hand'), fore = hand.parent;
  const hp = hand.getWorldPosition(new THREE.Vector3()), F = hp.clone().sub(fore.getWorldPosition(new THREE.Vector3())).normalize();
  const U = new THREE.Vector3(0, 0, 1).addScaledVector(F, -F.z).normalize(), N = new THREE.Vector3().crossVectors(U, F);
  const grip = hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(N, U, F)));
  return rigs[name] = { grip, gripInv: grip.clone().invert(), palm: hand.worldToLocal(hp.clone().addScaledVector(F, 0.085).addScaledVector(N, 0.03)),
    upperAxis: fore.position.clone().normalize(), foreAxis: hand.position.clone().normalize() };
}

// Knochen so drehen, dass seine Längsachse in Weltrichtung dir zeigt (w = Überblendung)
function point(bone, axis, dir, w) {
  bone.parent.getWorldQuaternion(_q).invert();
  _v.copy(dir).applyQuaternion(_q);
  _v2.copy(axis).applyQuaternion(bone.quaternion);
  bone.quaternion.slerp(_q2.setFromUnitVectors(_v2, _v).multiply(bone.quaternion), w);
}

// Blaster aus Grundkörpern, Maße in Metern. Griff liegt im Ursprung, Mündung zeigt nach +z.
// Teil: [Form b=Kasten/c=Zylinder, Material 0=Polymer/1=Metall/2=orange Spitze, Breite, Höhe, Länge, x, y, z, Neigung um x]
const GUNS = [
  { muzzle: [0, 0.062, 0.168], parts: [ // Pistole
    ['b', 1, 0.03, 0.032, 0.19, 0, 0.062, 0.045], ['b', 0, 0.028, 0.02, 0.15, 0, 0.036, 0.035], ['b', 0, 0.03, 0.105, 0.042, 0, -0.012, -0.022, 0.26],
    ['b', 0, 0.034, 0.012, 0.046, 0, -0.064, -0.037, 0.26], ['b', 0, 0.01, 0.006, 0.05, 0, 0.004, 0.04], ['b', 0, 0.01, 0.03, 0.007, 0, 0.017, 0.064],
    ['b', 1, 0.006, 0.02, 0.006, 0, 0.018, 0.033, -0.3], ['c', 1, 0.012, 0.012, 0.02, 0, 0.062, 0.145], ['b', 1, 0.022, 0.008, 0.01, 0, 0.081, -0.04],
    ['b', 1, 0.005, 0.007, 0.007, 0, 0.081, 0.128], ['c', 2, 0.017, 0.017, 0.012, 0, 0.062, 0.161]] },
  { muzzle: [0, 0.065, 0.325], parts: [ // Maschinenpistole
    ['b', 1, 0.045, 0.06, 0.26, 0, 0.06, 0.05], ['b', 1, 0.022, 0.01, 0.2, 0, 0.095, 0.05], ['c', 1, 0.03, 0.03, 0.12, 0, 0.065, 0.24],
    ['b', 0, 0.032, 0.1, 0.04, 0, -0.01, -0.02, 0.26], ['b', 0, 0.01, 0.006, 0.06, 0, 0, 0.04], ['b', 0, 0.01, 0.03, 0.007, 0, 0.015, 0.07],
    ['b', 1, 0.028, 0.16, 0.035, 0, -0.035, 0.12, -0.08], ['b', 1, 0.008, 0.008, 0.2, 0.016, 0.07, -0.17], ['b', 1, 0.008, 0.008, 0.2, -0.016, 0.07, -0.17],
    ['b', 0, 0.04, 0.07, 0.014, 0, 0.055, -0.275], ['b', 1, 0.006, 0.02, 0.006, 0, 0.105, 0.16], ['c', 2, 0.034, 0.034, 0.02, 0, 0.065, 0.31]] },
  { muzzle: [0, 0.075, 0.66], parts: [ // Pump-Schrotflinte
    ['b', 1, 0.045, 0.07, 0.2, 0, 0.055, 0.04], ['c', 1, 0.028, 0.028, 0.5, 0, 0.077, 0.39], ['c', 1, 0.024, 0.024, 0.4, 0, 0.045, 0.34],
    ['c', 0, 0.044, 0.044, 0.16, 0, 0.047, 0.3], ['b', 0, 0.032, 0.095, 0.04, 0, -0.01, -0.03, 0.3], ['b', 0, 0.04, 0.075, 0.3, 0, 0.022, -0.22, -0.12],
    ['b', 0, 0.045, 0.11, 0.022, 0, -0.002, -0.37, -0.12], ['b', 0, 0.01, 0.006, 0.06, 0, 0.002, 0.03], ['c', 1, 0.007, 0.007, 0.007, 0, 0.094, 0.62],
    ['c', 2, 0.034, 0.034, 0.02, 0, 0.077, 0.645]] },
  { muzzle: [0, 0.085, 0.615], parts: [ // Sturmgewehr
    ['b', 1, 0.04, 0.05, 0.2, 0, 0.04, 0.04], ['b', 1, 0.042, 0.045, 0.24, 0, 0.085, 0.05], ['b', 1, 0.024, 0.012, 0.24, 0, 0.114, 0.08],
    ['b', 0, 0.05, 0.055, 0.26, 0, 0.08, 0.3], ['c', 1, 0.018, 0.018, 0.16, 0, 0.085, 0.5], ['b', 1, 0.028, 0.15, 0.055, 0, -0.03, 0.11, -0.25],
    ['b', 0, 0.032, 0.1, 0.04, 0, -0.01, -0.02, 0.3], ['b', 0, 0.04, 0.07, 0.25, 0, 0.065, -0.2], ['b', 0, 0.042, 0.11, 0.03, 0, 0.05, -0.33],
    ['c', 1, 0.035, 0.035, 0.1, 0, 0.145, 0.06], ['b', 1, 0.02, 0.02, 0.07, 0, 0.126, 0.06], ['b', 1, 0.008, 0.04, 0.01, 0, 0.12, 0.42],
    ['b', 0, 0.01, 0.006, 0.06, 0, 0, 0.05], ['c', 2, 0.03, 0.03, 0.03, 0, 0.085, 0.595]] },
];
const GUN_MATS = [
  stdMat({ color: 0x1b1d20, roughness: 0.72 }),
  stdMat({ color: 0x34373c, metalness: 0.85, roughness: 0.36 }),
  stdMat({ color: 0xff6a00, roughness: 0.5 }),
];

// Teile je Material zu einer Geometrie verschmelzen (3 Draw Calls je Blaster)
function gunOf(wi) {
  if (guns[wi]) return guns[wi];
  const by = [[], [], []];
  for (const [k, m, w, h, l, x, y, z, rx = 0] of GUNS[wi].parts) {
    const g = k === 'b' ? new RoundedBoxGeometry(w, h, l, 2, Math.min(w, h, l) * 0.18) : new THREE.CylinderGeometry(w / 2, w / 2, l, 14).rotateX(Math.PI / 2);
    by[m].push(g.rotateX(rx).translate(x, y, z).toNonIndexed());
  }
  return guns[wi] = by.map(list => mergeGeometries(list));
}

export function makeBlaster(wi) {
  const g = new THREE.Group();
  gunOf(wi).forEach((geo, m) => { const o = new THREE.Mesh(geo, GUN_MATS[m]); o.castShadow = true; g.add(o); });
  g.userData.muzzle = new THREE.Vector3().fromArray(GUNS[wi].muzzle);
  g.scale.setScalar(100); // Handknochen rechnet in cm
  return g;
}

// Seitenansicht als weiße Silhouette fürs HUD (dieselben Teile wie das Modell)
export function gunIcon(wi, c) {
  const P = GUNS[wi].parts, z0 = Math.min(...P.map(p => p[7] - p[4] / 2)), z1 = Math.max(...P.map(p => p[7] + p[4] / 2));
  const y0 = Math.min(...P.map(p => p[6] - p[3] / 2)), y1 = Math.max(...P.map(p => p[6] + p[3] / 2));
  const g = c.getContext('2d'), k = 0.9 * Math.min(c.width / (z1 - z0), c.height / (y1 - y0));
  g.clearRect(0, 0, c.width, c.height); g.fillStyle = '#fff';
  for (const [, , , h, l, , y, z, rx = 0] of P) {
    g.setTransform(1, 0, 0, 1, c.width / 2 + (z - (z0 + z1) / 2) * k, c.height / 2 - (y - (y0 + y1) / 2) * k);
    g.rotate(rx); g.fillRect(-l * k / 2, -h * k / 2, l * k, h * k);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}

export class Character {
  // avatar = Index in AVATARS oder Modellname (Stadtwache); noch nicht geladene Figuren fallen auf Figur 1 zurück
  constructor(avatar, color, { ring = false, castShadow = true } = {}) {
    const want = typeof avatar === 'string' ? avatar : AVATARS[avatar], name = assets.models[want] ? want : AVATARS[0];
    clips ||= Object.fromEntries(assets.models.avatar_clips.animations.map(c => [c.name, c]));
    this.rig = rigOf(name);
    this.female = name.includes('_f');
    this.color = color;
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(assets.models[name].scene);
    this.root.add(this.model);
    this.model.traverse(o => { if (o.isMesh) { o.castShadow = castShadow; o.receiveShadow = false; } });
    this.hand = this.model.getObjectByName('Bip01_R_Hand'); this.fore = this.hand.parent; this.upper = this.fore.parent;
    if (ring) { // Bodenring in Spielerfarbe: Mitspieler von Passanten unterscheiden
      const r = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.y = 0.04; this.root.add(r);
    }
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.aim = new THREE.Vector3(0, 0, 1); this.aiming = false; this.aimW = 0; this.kick = 0; this.tip = 0; this.down = false;
    this.weapon = -1; this.current = null;
    this.play('idle', 0);
  }

  setWeapon(wi) {
    if (wi === this.weapon) return;
    if (this.blaster) this.hand.remove(this.blaster);
    this.weapon = wi; this.blaster = null;
    if (wi < 0 || !WEAPONS[wi]) return;
    this.blaster = makeBlaster(wi);
    this.blaster.quaternion.copy(this.rig.grip); this.blaster.position.copy(this.rig.palm);
    this.hand.add(this.blaster);
  }

  // Zielrichtung (Welt) setzen oder mit null den Arm wieder der Animation überlassen
  aimAt(dir) { this.aiming = !!dir; if (dir) this.aim.copy(dir); }

  muzzleWorld(out) {
    if (!this.blaster) return this.root.getWorldPosition(out).add(_v.set(0, 1.4, 0));
    this.blaster.updateWorldMatrix(true, false);
    return this.blaster.localToWorld(out.copy(this.blaster.userData.muzzle));
  }

  // mps = Bodentempo in m/s: die Schrittfrequenz passt sich an, damit die Füße nicht rutschen
  play(name, fade = 0.2, mps = 0) {
    if (typeof name === 'number') name = ANIMS[name] || 'idle';
    this.down = name === 'down';
    let clip = this.down ? 'idle' : name, speed = 1;
    if (this.female && FEMALE[clip]) clip = FEMALE[clip];
    if (!clips[clip]) clip = this.female ? 'f_idle' : 'idle';
    if (name === 'jump' || name === 'fall') { clip = this.female ? 'f_run' : 'run'; speed = 0.35; } // in der Luft: gedehnter Laufschritt
    else if (mps && PACE[clip]) speed = THREE.MathUtils.clamp(mps / PACE[clip], 0.6, 1.7);
    const a = (this.actions[clip] ||= this.mixer.clipAction(clips[clip]));
    this.currentName = name;
    if (this.current === a) { a.timeScale = speed; return; }
    if (ONCE.has(clip)) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
    a.reset(); a.timeScale = speed; a.enabled = true; a.setEffectiveWeight(1);
    if (this.current) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
  }

  update(dt) {
    this.mixer.update(dt);
    this.tip += ((this.down ? 1 : 0) - this.tip) * Math.min(1, dt * 7); // K.o.: nach hinten umfallen
    this.model.rotation.x = -this.tip * Math.PI / 2; this.model.position.y = this.tip * 0.14;
    this.kick = Math.max(0, this.kick - dt * 7);
    this.aimW += ((this.aiming && this.blaster && !this.down ? 1 : 0) - this.aimW) * Math.min(1, dt * 14);
    if (this.aimW < 0.01) return;
    _d.copy(this.aim); _d.y += this.kick * 0.22; _d.normalize();
    point(this.upper, this.rig.upperAxis, _d, this.aimW);
    point(this.fore, this.rig.foreAxis, _d, this.aimW);
    // Handgelenk: Blaster zeigt exakt in Zielrichtung, Griff nach unten
    _q.setFromRotationMatrix(_m.lookAt(_d, ZERO, UP)).multiply(this.rig.gripInv);
    this.hand.parent.getWorldQuaternion(_q2).invert();
    this.hand.quaternion.slerp(_q2.multiply(_q), this.aimW);
  }

  dispose() { this.root.removeFromParent(); this.mixer.stopAllAction(); }
}

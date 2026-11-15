import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
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

// Bunte Flächen der Blaster-Textur werden zu schwarzem Kunststoff, graue zu dunklem Stahl
function gunmetal(map) {
  const c = document.createElement('canvas'); c.width = map.image.width; c.height = map.image.height;
  const g = c.getContext('2d'); g.drawImage(map.image, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const mx = Math.max(p[i], p[i + 1], p[i + 2]), mn = Math.min(p[i], p[i + 1], p[i + 2]);
    const v = mx && (mx - mn) / mx > 0.25 ? 26 + mx * 0.09 : mx * 0.5;
    p[i] = v; p[i + 1] = v * 1.03; p[i + 2] = v * 1.1;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  return Object.assign(t, { flipY: map.flipY, colorSpace: map.colorSpace, magFilter: map.magFilter, minFilter: map.minFilter, generateMipmaps: map.generateMipmaps });
}

// Maße, dunkles Material und Mündung (vorderste Punkte des Modells, Mündung liegt bei -z) einmal je Blaster
function gunOf(wi) {
  if (guns[wi]) return guns[wi];
  const src = assets.models[WEAPONS[wi].model].scene; src.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(src), len = bb.max.z - bb.min.z, front = [];
  let map = null, x = 0, y = 0, r = 0;
  src.traverse(o => {
    if (!o.isMesh) return;
    map ||= o.material.map;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) if (_v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).z < bb.min.z + len * 0.012) front.push(_v.x, _v.y);
  });
  for (let i = 0; i < front.length; i += 2) { x += front[i] * 2 / front.length; y += front[i + 1] * 2 / front.length; }
  for (let i = 0; i < front.length; i += 2) r = Math.max(r, Math.hypot(front[i] - x, front[i + 1] - y));
  return guns[wi] = { src, bb, len, x, y, r, mat: new THREE.MeshStandardMaterial({ map: map && gunmetal(map), color: map ? 0xffffff : 0x25272c, metalness: 0.55, roughness: 0.42 }) };
}
const TIP = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.5 });

// Spielzeug-Blaster: Form vom Originalmodell, Farben wie echtes Gerät; nur die orange Mündung verrät das Spielzeug.
// Griff liegt im Ursprung, Mündung zeigt nach +z.
function makeBlaster(wi) {
  const { src, bb, len, x, y, r, mat } = gunOf(wi);
  const gy = bb.min.y + (bb.max.y - bb.min.y) * 0.25, gz = bb.max.z - len * 0.25;
  const inner = src.clone(true); inner.rotation.y = Math.PI; inner.position.set(0, -gy, gz);
  inner.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = true; } });
  const g = new THREE.Group(); g.add(inner);
  g.userData.muzzle = new THREE.Vector3(-x, y - gy, gz - bb.min.z);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.12, len * 0.05, 12), TIP);
  tip.rotation.x = Math.PI / 2; tip.position.copy(g.userData.muzzle).z -= len * 0.02; g.add(tip);
  g.scale.setScalar(100 * THREE.MathUtils.clamp(len * 0.42, 0.34, 0.6) / len); // Handknochen rechnet in cm
  return g;
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

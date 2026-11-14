import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { assets } from './assets.js';
import { GRID, BLOCK, ROAD, CELL, SIZE, HALF, BEACH, blockMin, roadCenter } from './shared.js';

export const SLAB = 0.14; // Gehweghöhe (Bordstein)

export const QUALITY = {
  low:    { pixel: 0.75, maxDpr: 1,   shadows: 0,    bloom: false, ao: false, fog: 140, pedDist: 45, aa: false },
  medium: { pixel: 1,    maxDpr: 1.5, shadows: 1024, bloom: true,  ao: false, fog: 260, pedDist: 80, aa: true },
  high:   { pixel: 1,    maxDpr: 2,   shadows: 2048, bloom: true,  ao: true,  fog: 380, pedDist: 120, aa: true },
};

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();

// Ein GLTF-Modell vielfach mit einem Draw Call pro Teilmesh zeichnen
function addInstanced(parent, gltfScene, matrices, shadows = true, colors = null) {
  if (!matrices.length) return;
  gltfScene.updateMatrixWorld(true);
  gltfScene.traverse(o => {
    if (!o.isMesh) return;
    const im = new THREE.InstancedMesh(o.geometry, o.material, matrices.length);
    matrices.forEach((m, i) => { im.setMatrixAt(i, tmpM.multiplyMatrices(m, o.matrixWorld)); if (colors) im.setColorAt(i, colors[i]); });
    im.castShadow = shadows; im.receiveShadow = true;
    im.computeBoundingSphere();
    parent.add(im);
  });
}

// prozedurale Texturen für den semi-realistischen Stil (kein Download nötig)
function canvasTex(kind, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const noise = (base, amp, n, size) => {
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < n; i++) {
      const v = (Math.random() - 0.5) * amp;
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, size, size);
    }
  };
  if (kind === 'asphalt') {
    noise('#4a4d55', 0.18, 26000, 2);
    g.strokeStyle = 'rgba(20,20,22,.35)'; g.lineWidth = 2;
    for (let i = 0; i < 8; i++) { g.beginPath(); let x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - .5) * 60; y += (Math.random() - .5) * 60; g.lineTo(x, y); } g.stroke(); }
  } else if (kind === 'sidewalk') {
    noise('#bdb8ae', 0.1, 9000, 2);
    g.strokeStyle = 'rgba(80,75,70,.45)'; g.lineWidth = 3;
    for (let i = 0; i <= 512; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  } else if (kind === 'grass') {
    noise('#4f9a45', 0.22, 30000, 3);
  } else if (kind === 'sand') {
    noise('#ead7a6', 0.12, 22000, 2);
  } else if (kind === 'plaza') {
    noise('#9c968c', 0.12, 12000, 2);
    g.strokeStyle = 'rgba(60,55,50,.35)'; g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// kachelbare Wellen-Normalmap fürs Meer (Sonnenglitzern ohne Shader-Aufwand)
function waterNormals() {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), k = Math.PI * 2 / n;
  const h = (x, y) => Math.sin(k * (6 * x + 2 * y)) + 0.7 * Math.sin(k * (8 * y - 4 * x)) + 0.35 * Math.sin(k * 16 * (x + y));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4;
    img.data[i] = 128 + (h(x + 1, y) - h(x - 1, y)) * 200; img.data[i + 1] = 128 + (h(x, y + 1) - h(x, y - 1)) * 200; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(140, 200);
  return t;
}

const PASTEL = [0xffc4d6, 0xb8f0e0, 0xfff0b0, 0xc4e2ff, 0xffd6b0, 0xe0ccff, 0xffffff];
const NEON = [0xff2d95, 0x21e6ff, 0xb44dff, 0xff9a1f, 0x3dff8a];
const Y = new THREE.Vector3(0, 1, 0);

export class World {
  constructor(canvas, city, settings) {
    this.city = city;
    this.settings = { ...settings };
    const q = QUALITY[settings.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.aa, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 1200);
    this.scene.fog = new THREE.Fog(0xbcd6ef, 30, q.fog);

    // Himmel + Licht
    this.sky = new Sky(); this.sky.scale.setScalar(4000); this.scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 8; u.rayleigh.value = 2.2; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a5040, 1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -55;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 55;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 400; this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight(0x8aa6ff, 0.3); this.scene.add(this.moon);
    this.stars = this.makeStars(); this.scene.add(this.stars);
    this.envTex = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;

    this.buildCity();
    this.applySettings(settings);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  makeStars() {
    const n = 1200, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
      pos.set([Math.sin(ph) * Math.cos(th) * 1500, Math.cos(ph) * 1500, Math.sin(ph) * Math.sin(th) * 1500], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  }

  buildCity() {
    const { city, scene } = this;
    const M = this.mats = {
      asphalt: new THREE.MeshStandardMaterial({ color: 0x3d414c, roughness: 0.95 }),
      sidewalk: new THREE.MeshStandardMaterial({ color: 0xcbc5bb, roughness: 0.9 }),
      grass: new THREE.MeshStandardMaterial({ color: 0x6cc46a, roughness: 1 }),
      plaza: new THREE.MeshStandardMaterial({ color: 0xa8a39a, roughness: 0.9 }),
      outer: new THREE.MeshStandardMaterial({ color: 0x7fc36f, roughness: 1 }),
      sand: new THREE.MeshStandardMaterial({ color: 0xf0dcae, roughness: 1 }),
    };
    this.tex = { asphalt: canvasTex('asphalt', SIZE / 12), sidewalk: canvasTex('sidewalk', BLOCK / 4), grass: canvasTex('grass', 10), plaza: canvasTex('plaza', 8), outer: canvasTex('grass', 120), sand: canvasTex('sand', 40) };

    const outer = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), M.outer);
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.35; outer.receiveShadow = true; scene.add(outer);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), M.asphalt);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    // Strand + Meer im Osten
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(BEACH + 1, 2400), M.sand);
    sand.rotation.x = -Math.PI / 2; sand.position.set(HALF + (BEACH + 1) / 2, -0.02, 0); sand.receiveShadow = true; scene.add(sand);
    this.waterNormal = waterNormals();
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 2400), new THREE.MeshStandardMaterial({ color: 0x14b4c6, roughness: 0.16, metalness: 0.2,
      normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.5, 0.5), transparent: true, opacity: 0.93 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(HALF + BEACH + 800, 0.05, 0); scene.add(sea);
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2400), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2; foam.position.set(HALF + BEACH + 0.7, 0.07, 0); scene.add(foam);

    // Blöcke: Gehweg-Platte + Innenfläche (Park/Platz)
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const slabs = new THREE.InstancedMesh(box, M.sidewalk, city.blocks.length);
    const parks = city.blocks.filter(b => b.type === 'park'), lots = city.blocks.filter(b => b.type !== 'park');
    const parkMesh = new THREE.InstancedMesh(box, M.grass, parks.length), lotMesh = new THREE.InstancedMesh(box, M.plaza, lots.length);
    const inner = BLOCK - 8;
    city.blocks.forEach((b, i) => slabs.setMatrixAt(i, tmpM.compose(tmpP.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2), tmpQ.identity(), tmpS.set(BLOCK, SLAB, BLOCK))));
    parks.forEach((b, i) => parkMesh.setMatrixAt(i, tmpM.compose(tmpP.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2), tmpQ, tmpS.set(inner, SLAB + 0.03, inner))));
    lots.forEach((b, i) => lotMesh.setMatrixAt(i, tmpM.compose(tmpP.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2), tmpQ, tmpS.set(inner, SLAB + 0.02, inner))));
    for (const m of [slabs, parkMesh, lotMesh]) { m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); }

    // Fahrbahnmarkierungen + Zebrastreifen (eine Instanz-Gruppe)
    const marks = [];
    const mark = (x, z, w, d) => marks.push(new THREE.Matrix4().compose(tmpP.set(x, 0.015, z), tmpQ.identity(), tmpS.set(w, 1, d)));
    for (let i = 0; i <= GRID; i++) for (let j = 0; j < GRID; j++) {
      const rc = roadCenter(i), s = blockMin(j);
      for (let k = 6; k < BLOCK - 6; k += 6) { mark(rc, s + k + 1.5, 0.25, 3); mark(s + k + 1.5, rc, 3, 0.25); }
      for (let k = 0; k < 7; k++) {
        const off = -5.4 + k * 1.8;
        for (const zz of [s + 2, s + BLOCK - 2]) { mark(rc + off, zz, 0.8, 3); mark(zz, rc + off, 3, 0.8); }
      }
    }
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
    const markMesh = new THREE.InstancedMesh(plane, new THREE.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), marks.length);
    marks.forEach((m, i) => markMesh.setMatrixAt(i, m)); markMesh.receiveShadow = true; markMesh.computeBoundingSphere(); scene.add(markMesh);

    // Gebäude
    this.heights = []; // gleiche Reihenfolge wie city.solids
    const byKind = {};
    const tints = {}, neon = [];
    city.buildings.forEach((b, bi) => {
      const g = assets.models[b.kind].scene;
      const bb = new THREE.Box3().setFromObject(g), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
      const sx = b.w / sz.x, sz2 = b.d / sz.z, sy = (sx + sz2) / 2;
      const m = new THREE.Matrix4().compose(tmpP.set(b.x, SLAB, b.z), tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot), tmpS.set(sx, sy, sz2))
        .multiply(new THREE.Matrix4().makeTranslation(-c.x, -bb.min.y, -c.z));
      (byKind[b.kind] ||= []).push(m);
      const h = sz.y * sy, tower = b.kind.startsWith('sky');
      this.heights.push(h + SLAB);
      (tints[b.kind] ||= []).push(new THREE.Color(tower ? 0xffffff : PASTEL[(bi * 7 + 3) % PASTEL.length]));
      // Neon: Türme bekommen Kantenlinien, Häuser Leuchtbänder an der Front (Modelle schauen nach +z)
      const place = (ox, oy, oz, sx2, sy2, sz3, c) => neon.push([new THREE.Matrix4().compose(tmpP.set(b.x, SLAB, b.z), tmpQ.setFromAxisAngle(Y, b.rot), tmpS.set(1, 1, 1))
        .multiply(new THREE.Matrix4().compose(tmpP.set(ox, oy, oz), tmpQ.identity(), tmpS.set(sx2, sy2, sz3))), NEON[c % NEON.length]]);
      if (tower) for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) place(ex * b.w / 2, h / 2, ez * b.d / 2, 0.3, h, 0.3, bi);
      else { place(0, h - 0.4, b.d / 2 + 0.1, b.w * 0.92, 0.26, 0.16, bi * 3); place(0, 3.5, b.d / 2 + 0.1, b.w * 0.6, 0.2, 0.16, bi * 3 + 2); }
    });
    for (const k in byKind) addInstanced(scene, assets.models[k].scene, byKind[k], true, tints[k]);
    this.neonMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const neonMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.neonMat, neon.length), col = new THREE.Color();
    neon.forEach(([m, c], i) => { neonMesh.setMatrixAt(i, m); neonMesh.setColorAt(i, col.set(c)); });
    neonMesh.computeBoundingSphere(); scene.add(neonMesh);

    // Bäume, Büsche, Steine
    const propsBy = {};
    for (const p of city.props) {
      const m = new THREE.Matrix4().compose(tmpP.set(p.x, SLAB, p.z), tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), tmpS.setScalar(p.s));
      (propsBy[p.kind] ||= []).push(m);
      if (p.solid) this.heights.push(4);
    }
    for (const k in propsBy) addInstanced(scene, assets.models[k].scene, propsBy[k]);

    // Sonnenschirme + Handtücher am Strand
    const shade = new THREE.ConeGeometry(1.5, 0.55, 10); shade.translate(0, 2.2, 0);
    const stick = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5); stick.translate(0, 1.1, 0);
    const towel = new THREE.BoxGeometry(0.9, 0.03, 1.9); towel.translate(1.2, 0.01, 0);
    const nb = city.beach.length, white = new THREE.Color(0xffffff);
    const shades = new THREE.InstancedMesh(shade, new THREE.MeshStandardMaterial({ roughness: 0.8 }), nb);
    const sticks = new THREE.InstancedMesh(stick, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }), nb);
    const towels = new THREE.InstancedMesh(towel, new THREE.MeshStandardMaterial({ roughness: 1 }), nb);
    city.beach.forEach((p, i) => {
      tmpM.compose(tmpP.set(p.x, 0, p.z), tmpQ.setFromAxisAngle(Y, p.rot), tmpS.set(1, 1, 1));
      shades.setMatrixAt(i, tmpM); sticks.setMatrixAt(i, tmpM); towels.setMatrixAt(i, tmpM);
      shades.setColorAt(i, col.set(NEON[p.c % NEON.length]).lerp(white, 0.3)); towels.setColorAt(i, col.set(PASTEL[(p.c + 2) % PASTEL.length]));
    });
    for (const m of [shades, sticks, towels]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); }

    // Straßenlaternen (leuchten nachts, Bloom)
    const lamps = [];
    for (const b of city.blocks) for (const [x, z] of [[b.x0 + 0.6, b.z0 + 12], [b.x0 + 0.6, b.z1 - 12], [b.x1 - 0.6, b.z0 + 24], [b.x0 + 24, b.z0 + 0.6], [b.x1 - 12, b.z1 - 0.6]]) lamps.push([x, z]);
    const pole = new THREE.CylinderGeometry(0.09, 0.12, 6, 6); pole.translate(0, 3, 0);
    const head = new THREE.SphereGeometry(0.35, 10, 8); head.translate(0, 6.1, 0);
    const poleMesh = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.5, metalness: 0.6 }), lamps.length);
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 0.2 });
    const headMesh = new THREE.InstancedMesh(head, this.lampMat, lamps.length);
    lamps.forEach(([x, z], i) => { const m = tmpM.makeTranslation(x, SLAB, z); poleMesh.setMatrixAt(i, m); headMesh.setMatrixAt(i, m); });
    poleMesh.castShadow = true; poleMesh.computeBoundingSphere(); headMesh.computeBoundingSphere(); scene.add(poleMesh, headMesh);
    this.lamps = lamps;

    // Begrenzung am Stadtrand
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8a23a, roughness: 0.7 });
    for (const [x, z, w, d] of [[BEACH / 2, -HALF - 1, SIZE + BEACH + 12, 2], [BEACH / 2, HALF + 1, SIZE + BEACH + 12, 2], [-HALF - 1, 0, 2, SIZE + 4]]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), wallMat); wall.position.set(x, 0.6, z); wall.castShadow = wall.receiveShadow = true; scene.add(wall);
    }
  }

  groundY(x, z) {
    const u = x + HALF - ROAD, v = z + HALF - ROAD;
    const i = Math.floor(u / CELL), j = Math.floor(v / CELL);
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) return 0;
    return (u - i * CELL < BLOCK && v - j * CELL < BLOCK) ? SLAB : 0;
  }

  applySettings(s) {
    this.settings = { ...s };
    const q = this.q = QUALITY[s.quality];
    const real = s.style === 'real';
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, q.maxDpr) * q.pixel);
    r.shadowMap.enabled = q.shadows > 0;
    this.sun.castShadow = q.shadows > 0;
    if (q.shadows) { this.sun.shadow.mapSize.set(q.shadows, q.shadows); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.scene.fog.far = q.fog;
    this.camera.far = q.fog + 200; this.camera.updateProjectionMatrix();
    this.scene.environment = real ? this.envTex : null;
    for (const k of ['asphalt', 'sidewalk', 'grass', 'plaza', 'outer', 'sand']) {
      const m = this.mats[k];
      m.map = real ? this.tex[k] : null;
      m.color.set(real ? 0xffffff : { asphalt: 0x3d414c, sidewalk: 0xcbc5bb, grass: 0x6cc46a, plaza: 0xa8a39a, outer: 0x7fc36f, sand: 0xf0dcae }[k]);
      m.roughness = real ? 0.85 : 1;
      m.needsUpdate = true;
    }
    r.toneMappingExposure = real ? 1.0 : 0.95;
    this.scene.traverse(o => { if (o.isMesh && o.material?.needsUpdate !== undefined) o.material.needsUpdate = true; });
    this.setupPost(q.bloom, q.ao || (real && s.quality !== 'low'));
    this.resize();
  }

  setupPost(bloom, ao) {
    this.composer?.dispose?.();
    this.composer = null;
    if (!bloom && !ao) return;
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (ao) {
      const p = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
      p.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1.2 });
      c.addPass(p);
    }
    if (bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.45, 0.82); c.addPass(this.bloom); }
    c.addPass(new OutputPass());
    this.composer = c;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  }

  // tod: 0..1 (0.25 Sonnenaufgang, 0.5 Mittag, 0.75 Sonnenuntergang)
  updateTime(tod, focus) {
    const phi = (tod - 0.25) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0.35).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(dir);
    const day = THREE.MathUtils.clamp(dir.y * 4 + 0.15, 0, 1);
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(dir.y) * 5, 0, 1);
    this.night = 1 - day;
    this.sun.intensity = 2.6 * day;
    this.sun.color.setHSL(0.09, 0.6 * dusk + 0.1, 0.55 + 0.4 * (1 - dusk));
    this.sun.position.copy(focus).addScaledVector(dir.y > 0 ? dir : dir.clone().negate(), 150);
    this.sun.target.position.copy(focus);
    this.moon.intensity = 0.45 * (1 - day);
    this.moon.position.set(focus.x - 60, focus.y + 120, focus.z + 40);
    this.hemi.intensity = 0.35 + 0.9 * day;
    this.hemi.color.setRGB(0.55 + 0.25 * day, 0.62 + 0.3 * day, 0.85 + 0.15 * day);
    const fog = new THREE.Color(0x1a1238).lerp(new THREE.Color(0xbfd8ef), day).lerp(new THREE.Color(0xff8f9f), dusk * 0.6 * day);
    this.scene.fog.color.copy(fog);
    this.stars.material.opacity = THREE.MathUtils.clamp((0.6 - day) * 1.6, 0, 1);
    this.stars.position.copy(this.camera.position);
    this.lampMat.emissiveIntensity = 0.2 + 3.5 * (1 - day);
    if (this.bloom) this.bloom.strength = 0.22 + 0.6 * (1 - day);
    this.neonMat.color.setScalar(0.3 + 2.4 * (1 - day));
    this.waterNormal.offset.set(performance.now() * 1.2e-5, performance.now() * 2e-5);
    this.renderer.toneMappingExposure = (this.settings.style === 'real' ? 1.0 : 0.95) * (0.75 + 0.25 * day) + 0.15 * (1 - day);
  }

  render() {
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }
}

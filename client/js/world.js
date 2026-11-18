import * as THREE from 'three';
import { stdMat, QUALITY, LITE } from './gfx.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { assets } from './assets.js';
import { makeBuildings } from './buildings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRID, BLOCK, ROAD, WALK, CELL, SIZE, HALF, BEACH, RIVER, BRIDGES, BRIDGE_HALF, JUMPS, RIVER_ROW, blockMin, roadCenter, riverY, rampParts, localPoint, SPRAYS, RESPAWN } from './shared.js';

export const SLAB = 0.14; // Gehweghöhe (Bordstein)

export { QUALITY };

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
    g.fillStyle = base; g.fillRect(0, 0, 512, 512); // base 'rgba(0,0,0,0)' = nur Körnung

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
    for (let i = 0; i < 4; i++) { const v = Math.random() < 0.5 ? 18 : 120; g.fillStyle = `rgba(${v},${v},${v + 4},.1)`; g.fillRect(Math.random() * 400, Math.random() * 400, 40 + Math.random() * 110, 30 + Math.random() * 80); } // Flicken
    for (let i = 0; i < 5; i++) { // Ölflecken
      const x = Math.random() * 512, y = Math.random() * 512, r = 8 + Math.random() * 20, o = g.createRadialGradient(x, y, 0, x, y, r);
      o.addColorStop(0, 'rgba(12,12,14,.32)'); o.addColorStop(1, 'rgba(12,12,14,0)'); g.fillStyle = o; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  } else if (kind === 'sidewalk') {
    noise('#bdb8ae', 0.1, 9000, 2);
    g.strokeStyle = 'rgba(80,75,70,.45)'; g.lineWidth = 3;
    for (let i = 0; i <= 512; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  } else if (kind === 'grass') {
    noise('#4f9a45', 0.22, 30000, 3);
  } else if (kind === 'sand') {
    noise('#ead7a6', 0.12, 22000, 2);
  } else if (kind === 'concrete') {
    noise('#a39f96', 0.14, 16000, 2);
    for (let i = 0; i < 46; i++) { // Wasserspuren
      const x = Math.random() * 512, l = 40 + Math.random() * 200, gr = g.createLinearGradient(0, 512 - l, 0, 512);
      gr.addColorStop(0, 'rgba(48,44,38,0)'); gr.addColorStop(1, 'rgba(48,44,38,.22)'); g.fillStyle = gr; g.fillRect(x, 512 - l, 3 + Math.random() * 12, l);
    }
    g.fillStyle = 'rgba(55,52,48,.45)'; for (let i = 0; i < 512; i += 128) { g.fillRect(i, 0, 2, 512); g.fillRect(0, i, 512, 2); } // Fugen
  } else if (kind === 'hazard') {
    g.fillStyle = '#f0bf1a'; g.fillRect(0, 0, 512, 512); g.fillStyle = '#1c1c1c';
    for (let i = -512; i < 512; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 0); g.lineTo(i + 576, 512); g.lineTo(i + 512, 512); g.fill(); }
    noise('rgba(0,0,0,0)', 0.2, 6000, 3);
  } else if (kind === 'plaza') {
    noise('#9c968c', 0.12, 12000, 2);
    g.strokeStyle = 'rgba(60,55,50,.35)'; g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Umgebung für Spiegelungen: oben Himmel, am Horizont hell, unten Straße und Häuser (statt eines Innenraums)
function skyEnv(renderer) {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  for (const [t, col] of [[0, '#2f6fc4'], [0.38, '#8fbbe8'], [0.49, '#e4eef5'], [0.52, '#8a8d90'], [0.6, '#55585c'], [1, '#2a2b2e']]) gr.addColorStop(t, col);
  g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.PMREMGenerator(renderer).fromEquirectangular(t).texture;
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
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// waagrechte Fläche mit Welt-UVs (k Meter je Texturkachel), damit getrennte Stücke nahtlos weiterkacheln
function rect(x0, x1, z0, z1, y = 0, k = SIZE) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / k, -p.getZ(i) / k);
  return g;
}
const scaledUV = (g, su, sv) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; };

// Parkboden (40 x 40 m): Mähstreifen, Kreuzwege, runder Platz (Brunnen) oder Ringweg um einen Teich, Blumenbeete
function parkTex(pond, res) {
  const c = document.createElement('canvas'); c.width = c.height = res;
  const g = c.getContext('2d'), circle = (r, col) => { g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); };
  g.scale(res / 40, res / 40); g.translate(20, 20); // ab hier Meter, Parkmitte = 0
  g.fillStyle = '#4c9444'; g.fillRect(-20, -20, 40, 40);
  for (let i = -20; i < 20; i += 2.5) { g.fillStyle = Math.round(i / 2.5) % 2 ? 'rgba(255,255,220,.07)' : 'rgba(0,30,0,.07)'; g.fillRect(i, -20, 2.5, 40); } // Mähstreifen
  for (let i = 0; i < 9000; i++) { const v = Math.random() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.14})`; g.fillRect(Math.random() * 40 - 20, Math.random() * 40 - 20, 0.12, 0.12); }
  g.fillStyle = '#c9bc9b'; g.fillRect(-1.5, -20, 3, 40); g.fillRect(-20, -1.5, 40, 3);
  for (const [x, z, w, d] of [[-4.8, 12.5, 1.2, 5.5], [3.6, 12.5, 1.2, 5.5], [-4.8, -18, 1.2, 5.5], [3.6, -18, 1.2, 5.5], [12.5, -4.8, 5.5, 1.2], [12.5, 3.6, 5.5, 1.2], [-18, -4.8, 5.5, 1.2], [-18, 3.6, 5.5, 1.2]]) {
    g.fillStyle = '#4a3a2a'; g.fillRect(x, z, w, d); // Blumenbeete
    for (let i = 0; i < 70; i++) { g.fillStyle = ['#e8434f', '#f4d03f', '#f7f2f2', '#b05ad8', '#ff8a3d'][i % 5]; g.fillRect(x + Math.random() * (w - 0.2), z + Math.random() * (d - 0.2), 0.2, 0.2); }
  }
  if (pond) { circle(11.2, '#c9bc9b'); circle(8.8, '#4c9444'); circle(7.7, '#3f4a38'); }
  else {
    circle(8.5, '#b8b1a3'); g.strokeStyle = 'rgba(70,64,58,.35)'; g.lineWidth = 0.06;
    for (let r = 1.5; r < 8.5; r += 1.4) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
    for (let a = 0; a < 24; a++) { g.beginPath(); g.moveTo(Math.cos(a * Math.PI / 12) * 3.3, Math.sin(a * Math.PI / 12) * 3.3); g.lineTo(Math.cos(a * Math.PI / 12) * 8.5, Math.sin(a * Math.PI / 12) * 8.5); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Berge jenseits des Meeres im Norden und Westen (Kulisse, nicht begehbar): Höhenraster mit Farben nach Höhe und Steilheit
function makeHills(step) {
  const h2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h2(ix, iy), h2(ix + 1, iy), u), THREE.MathUtils.lerp(h2(ix, iy + 1), h2(ix + 1, iy + 1), u), v);
  };
  const fbm = (x, y, n, ridge) => { let a = 0, f = 1, w = 0.5; for (let i = 0; i < n; i++) { const v = vnoise(x * f, y * f); a += w * (ridge ? 1 - Math.abs(v * 2 - 1) : v); f *= 2.03; w *= 0.5; } return a; };
  const coast = -HALF - 150, smooth = THREE.MathUtils.smoothstep;
  const height = (x, z) => {
    const d = Math.max(coast - z, coast - x - Math.max(0, z - 250)) + (fbm(x / 260, z / 260, 3) - 0.5) * 160; // > 0 = Land
    if (d < 0) return d * 0.08 - 3;
    const peak = 380 * Math.exp(-((x + 1150) ** 2 + (z + 1350) ** 2) / 520 ** 2); // ein hoher Gipfel
    return Math.min(d / 70, 1) * 14 + smooth(d, 120, 1100) * (90 + 300 * fbm(x / 520, z / 520, 6, true)) + 40 * fbm(x / 110, z / 110, 3, true) * smooth(d, 40, 400) + peak * smooth(d, 200, 700);
  };
  const X0 = -2600, X1 = 1600, Z0 = -2600, Z1 = 1000, nx = Math.round((X1 - X0) / step), nz = Math.round((Z1 - Z0) / step);
  const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx, nz).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const col = new Float32Array(p.count * 3), c = new THREE.Color(), n = geo.attributes.normal;
  const SAND = new THREE.Color(0xcdb98c), GREEN = new THREE.Color(0x56763a), DRY = new THREE.Color(0xa58a55), ROCK = new THREE.Color(0x8a6c52), FOREST = new THREE.Color(0x34522c);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i), steep = 1 - n.getY(i), v = fbm(x / 90, z / 90, 3);
    c.copy(GREEN).lerp(DRY, smooth(y + v * 80, 60, 200)).lerp(FOREST, smooth(v, 0.55, 0.68) * (1 - smooth(y, 150, 260)));
    c.lerp(ROCK, smooth(steep + v * 0.2, 0.22, 0.42)).lerp(SAND, 1 - smooth(y, 1.5, 6));
    c.multiplyScalar(0.85 + v * 0.3); col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
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
    this.scene.fog = new THREE.Fog(0xbcd6ef, 18, q.fog); // früh einsetzender Dunst: Tiefe wie an einem feuchtwarmen Küstentag

    // Himmel + Licht
    this.sky = new Sky(); this.sky.scale.setScalar(4000); this.scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8; // Trübung + Streuung folgen der Tageszeit (updateTime)
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a5040, 1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -55;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 55;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 400; this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight(0x8aa6ff, 0.3); this.scene.add(this.moon);
    this.stars = this.makeStars(); this.scene.add(this.stars);
    this.envTex = skyEnv(this.renderer);

    this.buildCity();
    this.applySettings(settings);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  makeStars() {
    const n = 1200, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
      pos.set([Math.sin(ph) * Math.cos(th) * 320, Math.cos(ph) * 320, Math.sin(ph) * Math.sin(th) * 320], i * 3); // innerhalb der Sichtweite jeder Qualitätsstufe
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  }

  buildCity() {
    const { city, scene } = this;
    const M = this.mats = {
      asphalt: stdMat({ color: 0x3d414c, roughness: 0.95 }),
      sidewalk: stdMat({ color: 0xcbc5bb, roughness: 0.9 }),
      grass: stdMat({ color: 0x6cc46a, roughness: 1 }),
      plaza: stdMat({ color: 0xa8a39a, roughness: 0.9 }),
      sand: stdMat({ color: 0xf0dcae, roughness: 1 }),
    };
    this.tex = { asphalt: canvasTex('asphalt', SIZE / 12), concrete: canvasTex('concrete', 1), hazard: canvasTex('hazard', 1), sidewalk: canvasTex('sidewalk', BLOCK / 4), grass: canvasTex('grass', 10), plaza: canvasTex('plaza', 8), sand: canvasTex('sand', 6) };
    this.tex.sand.repeat.set(6, 56);

    // Fahrbahn: zwei Hälften nördlich und südlich des Flusses, dazwischen nur die Brücken
    const roads = [rect(-HALF, HALF, -HALF, RIVER.z0), rect(-HALF, HALF, RIVER.z1, HALF), ...BRIDGES.map(c => rect(Math.max(c - ROAD / 2, -HALF), Math.min(c + ROAD / 2, HALF), RIVER.z0, RIVER.z1))];
    const ground = new THREE.Mesh(mergeGeometries(roads), M.asphalt);
    ground.receiveShadow = true; scene.add(ground);

    // Die Stadt ist eine Insel: Strand im Osten, Meer ringsum (ein Mesh, Wellen-UVs in Weltmetern)
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(BEACH + 1, SIZE + 4), M.sand);
    sand.rotation.x = -Math.PI / 2; sand.position.set(HALF + (BEACH + 1) / 2, -0.02, 0); sand.receiveShadow = true; scene.add(sand);
    this.waterNormal = waterNormals();
    const E = HALF + BEACH, far = 2800, sp = [], su = [];
    for (const [x0, x1, z0, z1] of [[E, far, -far, far], [-far, -HALF - 2, -far, far], [-HALF - 2, E, -far, -HALF - 2], [-HALF - 2, E, HALF + 2, far]])
      for (const [x, z] of [[x0, z1], [x1, z1], [x1, z0], [x0, z1], [x1, z0], [x0, z0]]) { sp.push(x, 0.05, z); su.push(x / 12, z / 12); }
    const seaGeo = new THREE.BufferGeometry();
    seaGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); seaGeo.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); seaGeo.computeVertexNormals();
    this.sea = new THREE.Mesh(seaGeo, stdMat({ color: 0x14b4c6, roughness: 0.16, metalness: 0.2, normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.5, 0.5) }));
    scene.add(this.sea);
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(2.4, SIZE + 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2; foam.position.set(E + 0.7, 0.07, 0); scene.add(foam);

    // Blöcke: Gehweg-Platte + Innenfläche (Park/Platz); am Fluss nur die Uferstreifen
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const slabRects = city.blocks.flatMap(b => b.type !== 'river' ? [[b.x0, b.x1, b.z0, b.z1]] : [[b.x0, b.x1, b.z0, RIVER.z0], [b.x0, b.x1, RIVER.z1, b.z1]]);
    const slabs = new THREE.InstancedMesh(box, M.sidewalk, slabRects.length);
    const lots = city.blocks.filter(b => b.type !== 'park' && b.type !== 'river');
    const lotMesh = new THREE.InstancedMesh(box, M.plaza, lots.length);
    const inner = BLOCK - 8;
    slabRects.forEach(([x0, x1, z0, z1], i) => slabs.setMatrixAt(i, tmpM.compose(tmpP.set((x0 + x1) / 2, 0, (z0 + z1) / 2), tmpQ.identity(), tmpS.set(x1 - x0, SLAB, z1 - z0))));
    lots.forEach((b, i) => lotMesh.setMatrixAt(i, tmpM.compose(tmpP.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2), tmpQ, tmpS.set(inner, SLAB + 0.02, inner))));
    for (const m of [slabs, lotMesh]) { m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); }
    const lamps = this.makeParks(this.makeRiver());

    // Fahrbahnmarkierungen (eine Instanz-Gruppe): gelbe Doppellinie, weiße Randlinie zur Parkspur, Zebrastreifen
    const marks = [], YELLOW = 0xe9bd2a, WHITE = 0xf2f2ea;
    const mark = (x, z, w, d, c = WHITE) => marks.push([new THREE.Matrix4().compose(tmpP.set(x, 0.015, z), tmpQ.identity(), tmpS.set(w, 1, d)), c]);
    for (let i = 0; i <= GRID; i++) for (let j = 0; j < GRID; j++) {
      const rc = roadCenter(i), s = blockMin(j), mid = s + BLOCK / 2, len = BLOCK - 10;
      const ns = j !== RIVER_ROW || !JUMPS.includes(i); // Nord-Süd-Stück endet an einer Sprungrampe: keine Markierung
      for (const o of [-0.16, 0.16]) { if (ns) mark(rc + o, mid, 0.12, len, YELLOW); mark(mid, rc + o, len, 0.12, YELLOW); }
      for (const o of [-4.2, 4.2]) { if (ns) mark(rc + o, mid, 0.1, len); mark(mid, rc + o, len, 0.1); }
      for (let k = 0; k < 7; k++) {
        const off = -5.4 + k * 1.8;
        for (const zz of [s + 2, s + BLOCK - 2]) { if (ns) mark(rc + off, zz, 0.8, 3); mark(zz, rc + off, 3, 0.8); }
      }
    }
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
    const markMesh = new THREE.InstancedMesh(plane, stdMat({ roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), marks.length), mc = new THREE.Color();
    marks.forEach(([m, c], i) => { markMesh.setMatrixAt(i, m); markMesh.setColorAt(i, mc.set(c)); });
    markMesh.receiveShadow = true; markMesh.computeBoundingSphere(); scene.add(markMesh);

    // Gebäude (prozedural, echter Maßstab) + Neon
    const B = makeBuildings(city, SLAB, this.settings.quality !== 'low');
    scene.add(...B.meshes);
    this.litMats = B.lit;
    // Lackierereien: Portal über der Fahrbahn mit Leuchtschild und Sprührohr (Pfeiler stehen auf den Gehwegen)
    const sc = Object.assign(document.createElement('canvas'), { width: 512, height: 96 }), sg = sc.getContext('2d');
    sg.fillStyle = '#17141f'; sg.fillRect(0, 0, 512, 96); sg.font = 'bold 56px system-ui, sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
    sg.shadowColor = '#ff5aa0'; sg.shadowBlur = 18; sg.fillStyle = '#ff8cc4'; sg.fillText('LACK & SPRAY', 256, 50);
    const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace;
    const signMat = stdMat({ map: stex, emissive: 0xffffff, emissiveMap: stex, emissiveIntensity: 0.5 }); this.litMats.push(signMat);
    const off = ROAD / 2 + 1.2, frame = mergeGeometries([new THREE.BoxGeometry(0.5, 5.6, 0.5).translate(0, 2.8, off), new THREE.BoxGeometry(0.5, 5.6, 0.5).translate(0, 2.8, -off),
      new THREE.BoxGeometry(0.7, 0.6, 2 * off + 0.5).translate(0, 5.5, 0), new THREE.CylinderGeometry(0.09, 0.09, 2 * off, 8).rotateX(Math.PI / 2).translate(0, 5.05, 0)]);
    const signGeo = mergeGeometries([new THREE.BoxGeometry(0.12, 1.3, 8).translate(0.42, 6.4, 0), new THREE.BoxGeometry(0.12, 1.3, 8).rotateY(Math.PI).translate(-0.42, 6.4, 0)]);
    const frameMat = stdMat({ color: 0x3a3f4a, roughness: 0.5, metalness: 0.5 });
    for (const q of SPRAYS) {
      const g = new THREE.Group(); g.position.set(q.x, 0, q.z); if (q.along === 'z') g.rotation.y = Math.PI / 2;
      const f = new THREE.Mesh(frame, frameMat), sign = new THREE.Mesh(signGeo, signMat); f.castShadow = true; g.add(f, sign); scene.add(g);
    }
    // Krankenhaus und Polizeiwache: Leuchtschild auf zwei Pfosten am Gehweg (dort startet man nach K.o. bzw. Festnahme)
    for (const [[x, z], text, col, mark] of [[RESPAWN.hospital, 'KRANKENHAUS', '#e0222a', '✚'], [RESPAWN.police, 'POLIZEI', '#3d7bff', '★']]) {
      const c = Object.assign(document.createElement('canvas'), { width: 512, height: 128 }), g = c.getContext('2d');
      g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 512, 128); g.fillStyle = col; g.fillRect(0, 0, 128, 128);
      g.font = 'bold 84px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(mark, 64, 68);
      g.font = 'bold 50px system-ui, sans-serif'; g.fillStyle = '#1b1d22'; g.fillText(text, 320, 66);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = stdMat({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.5 }); this.litMats.push(m);
      const board = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 0.12), [frameMat, frameMat, frameMat, frameMat, m, frameMat]);
      board.position.set(x, 3, z - 1.4); board.castShadow = true;
      const posts = new THREE.Mesh(mergeGeometries([-1.6, 1.6].map(dx => new THREE.BoxGeometry(0.12, 2.6, 0.12).translate(x + dx, 1.3, z - 1.4))), frameMat);
      scene.add(board, posts);
    }
    this.heights = city.solids.map(s => s.h); // Oberkanten für Treffer und Kamera
    // Innenräume je Stadt-Kachel: nur in der Nähe zeichnen; Kleinkram drinnen nur, wenn eine Ladentür nah ist
    this.rooms = B.rooms.map(R => { const g = new THREE.Group(); g.add(...R.meshes); g.visible = false; scene.add(g); return { x: R.x, z: R.z, g }; });
    this.inside = new THREE.Group(); scene.add(this.inside);
    this.doors = city.buildings.filter(b => b.room).map(b => localPoint(b, 0, b.d / 2));
    this.neonMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    // Ampeln an den Kreuzungen (nur Optik): Mast mit Ausleger über die Fahrbahn, Lampen leuchten über das Neon-Mesh
    {
      const pole = new THREE.CylinderGeometry(0.1, 0.13, 6, 6).translate(0, 3, 0), arm = new THREE.BoxGeometry(5.6, 0.14, 0.14).translate(-2.8, 5.85, 0);
      const box = new THREE.BoxGeometry(0.36, 1.05, 0.34).translate(-4.9, 5.25, 0), signals = [];
      const signalMesh = new THREE.InstancedMesh(mergeGeometries([pole, arm, box].map(g => g.toNonIndexed())), stdMat({ color: 0x23262b, roughness: 0.55, metalness: 0.6 }), city.blocks.length * 2);
      city.blocks.forEach((b, i) => [[b.x0 + 0.7, b.z0 + 0.7, 0], [b.x1 - 0.7, b.z1 - 0.7, Math.PI]].forEach(([x, z, a], k) => {
        const at = new THREE.Matrix4().compose(tmpP.set(x, SLAB, z), tmpQ.setFromAxisAngle(Y, a), tmpS.set(1, 1, 1)), red = (i + k) % 2;
        signalMesh.setMatrixAt(i * 2 + k, at);
        for (const side of [-1, 1]) signals.push([at.clone().multiply(new THREE.Matrix4().compose(tmpP.set(-4.9, 5.25 + (red ? 0.3 : -0.3), side * 0.18), tmpQ.identity(), tmpS.set(0.2, 0.2, 0.03))), red ? 0xff2a1a : 0x2aff6a]);
      }));
      signalMesh.castShadow = true; signalMesh.computeBoundingSphere(); scene.add(signalMesh);
      B.neon.push(...signals);
    }
    const neonMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.neonMat, B.neon.length), col = new THREE.Color();
    B.neon.forEach(([m, c], i) => { neonMesh.setMatrixAt(i, m); neonMesh.setColorAt(i, col.set(c)); });
    neonMesh.computeBoundingSphere(); scene.add(neonMesh);

    // Bäume, Büsche, Steine (Kenney-Modelle in natürlichen Farben)
    const NATURE = { leafsGreen: 0x3f9a44, leafsDark: 0x2f7240, woodBark: 0x86684a, woodBarkDark: 0x5f4630, grass: 0x4f9a45, dirt: 0x8a7a66 };

    const propsBy = {};
    const skip = LITE ? ['flower_red', 'satellite_dish', 'generator'] : []; // Chromebook: Kleinkram weglassen spart Draw Calls
    for (const p of city.props) {
      if (skip.includes(p.kind)) continue;
      const m = new THREE.Matrix4().compose(tmpP.set(p.x, p.y ?? SLAB, p.z), tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), tmpS.setScalar(p.s));
      (propsBy[p.kind + (p.inside ? '|in' : '')] ||= []).push(m);
    }
    for (const key in propsBy) {
      const [k, inside] = key.split('|');
      assets.models[k].scene.traverse(o => { if (o.isMesh && NATURE[o.material.name]) o.material.color.set(NATURE[o.material.name]); });
      addInstanced(inside ? this.inside : scene, assets.models[k].scene, propsBy[key], !inside);
    }
    // Frachtschiffe vor der Küste (Kenney-Modell, auf Schiffsgröße gestreckt)
    if (!LITE) addInstanced(scene, assets.models.cargo_ship.scene, [[-HALF - 70, -40, 0.4], [HALF + BEACH + 150, 90, -1.2]].map(([x, z, a]) => new THREE.Matrix4().compose(tmpP.set(x, -2.5, z), tmpQ.setFromAxisAngle(Y, a), tmpS.setScalar(26))), false);

    // Sonnenschirme + Handtücher am Strand
    const shade = new THREE.ConeGeometry(1.5, 0.55, 10); shade.translate(0, 2.2, 0);
    const stick = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5); stick.translate(0, 1.1, 0);
    const towel = new THREE.BoxGeometry(0.9, 0.03, 1.9); towel.translate(1.2, 0.01, 0);
    const nb = city.beach.length, white = new THREE.Color(0xffffff);
    const shades = new THREE.InstancedMesh(shade, stdMat({ roughness: 0.8 }), nb);
    const sticks = new THREE.InstancedMesh(stick, stdMat({ color: 0xf2f2f2, roughness: 0.6 }), nb);
    const towels = new THREE.InstancedMesh(towel, stdMat({ roughness: 1 }), nb);
    city.beach.forEach((p, i) => {
      tmpM.compose(tmpP.set(p.x, 0, p.z), tmpQ.setFromAxisAngle(Y, p.rot), tmpS.set(1, 1, 1));
      shades.setMatrixAt(i, tmpM); sticks.setMatrixAt(i, tmpM); towels.setMatrixAt(i, tmpM);
      shades.setColorAt(i, col.set(NEON[p.c % NEON.length]).lerp(white, 0.3)); towels.setColorAt(i, col.set(PASTEL[(p.c + 2) % PASTEL.length]));
    });
    for (const m of [shades, sticks, towels]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); }

    // Straßenlaternen (leuchten nachts, Bloom)
    for (const b of city.blocks) for (const [x, z] of [[b.x0 + 0.6, b.z0 + 12], [b.x0 + 0.6, b.z1 - 12], [b.x1 - 0.6, b.z0 + 24], [b.x0 + 24, b.z0 + 0.6], [b.x1 - 12, b.z1 - 0.6]]) if (this.groundY(x, z) >= 0) lamps.push([x, z]);
    const pole = new THREE.CylinderGeometry(0.09, 0.12, 6, 6); pole.translate(0, 3, 0);
    const head = new THREE.SphereGeometry(0.35, 10, 8); head.translate(0, 6.1, 0);
    const poleMesh = new THREE.InstancedMesh(pole, stdMat({ color: 0x2b2f3a, roughness: 0.5, metalness: 0.6 }), lamps.length);
    this.lampMat = stdMat({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 0.2 });
    const headMesh = new THREE.InstancedMesh(head, this.lampMat, lamps.length);
    lamps.forEach(([x, z], i) => { const m = tmpM.makeTranslation(x, this.groundY(x, z) > 0.1 ? SLAB : 0, z); poleMesh.setMatrixAt(i, m); headMesh.setMatrixAt(i, m); });
    poleMesh.castShadow = true; poleMesh.computeBoundingSphere(); headMesh.computeBoundingSphere(); scene.add(poleMesh, headMesh);
    this.lamps = lamps;
    // Lichtkegel auf dem Boden unter jeder Laterne (nachts, ein Draw Call)
    const pc = document.createElement('canvas'); pc.width = pc.height = 64;
    const pg = pc.getContext('2d'), grad = pg.createRadialGradient(32, 32, 0, 32, 32, 32); grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    pg.fillStyle = grad; pg.fillRect(0, 0, 64, 64);
    this.poolMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), color: 0xffc078, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), this.poolMat, lamps.length);
    lamps.forEach(([x, z], i) => this.pools.setMatrixAt(i, tmpM.makeTranslation(x, this.groundY(x, z) + 0.05, z)));
    this.pools.computeBoundingSphere(); scene.add(this.pools);

    // Ufermauer am Stadtrand
    const wallMat = stdMat({ color: 0xd9d3c7, roughness: 0.8 });
    for (const [x, z, w, d] of [[BEACH / 2, -HALF - 1, SIZE + BEACH + 12, 2], [BEACH / 2, HALF + 1, SIZE + BEACH + 12, 2], [-HALF - 1, 0, 2, SIZE + 4]]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), wallMat); wall.position.set(x, 0.6, z); wall.castShadow = wall.receiveShadow = true; scene.add(wall);
    }

    // Berge hinter dem Meer: eigener, viel weiterer Dunst als die Stadt (sonst verschwänden sie im Nebel der niedrigen Stufen)
    this.haze = { value: new THREE.Vector2(150, 2000) };
    const hillMat = this.hillMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    hillMat.onBeforeCompile = (sh) => {
      sh.uniforms.haze = this.haze;
      sh.fragmentShader = 'uniform vec2 haze;\n' + sh.fragmentShader.replace('#include <fog_fragment>', '#ifdef USE_FOG\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, 0.8 * smoothstep(haze.x, haze.y, vFogDepth));\n#endif');
    };
  }

  // Fluss: Betonböschungen, Wasser, Brücken mit Brüstung, gelb-schwarze Sprungrampen. Gibt das Wasser-Mesh zurück (Parks hängen Teiche an)
  makeRiver() {
    const { z0, z1, bed, slope, water, deck } = RIVER, mz = (z0 + z1) / 2, a = Math.atan2(-bed, slope), sl = Math.hypot(bed, slope), scene = this.scene;
    const concrete = stdMat({ map: this.tex.concrete, roughness: 0.92 }), parts = [];
    for (const s of [-1, 1]) parts.push(scaledUV(new THREE.PlaneGeometry(2 * HALF, sl), 2 * HALF / 8, sl / 8).rotateX(-Math.PI / 2).rotateX(-s * a).translate(0, bed / 2, mz + s * ((z1 - z0) / 2 - slope / 2)));
    for (const s of [-1, 1]) parts.push(scaledUV(new THREE.PlaneGeometry(z1 - z0, -bed), (z1 - z0) / 8, -bed / 8).rotateY(-s * Math.PI / 2).translate(s * HALF, bed / 2, mz)); // Kanalenden
    for (const c of BRIDGES) {
      const xa = Math.max(c - BRIDGE_HALF, -HALF), xb = Math.min(c + BRIDGE_HALF, HALF);
      parts.push(scaledUV(new THREE.BoxGeometry(xb - xa, deck, z1 - z0), 2, 3).translate((xa + xb) / 2, -deck / 2 - 0.01, mz));
      for (const x of [xa + 0.2, xb - 0.2]) parts.push(scaledUV(new THREE.BoxGeometry(0.4, 1.1, z1 - z0 + 0.4), 3, 1).translate(x, 0.55, mz)); // Brüstung
      for (const [p, q] of [[xa, c - ROAD / 2], [c + ROAD / 2, xb]]) if (q - p > 0.1) parts.push(new THREE.BoxGeometry(q - p, SLAB, z1 - z0).translate((p + q) / 2, SLAB / 2, mz)); // Gehweg
    }
    const riverMesh = new THREE.Mesh(mergeGeometries(parts), concrete); riverMesh.receiveShadow = riverMesh.castShadow = true; scene.add(riverMesh);
    const kick = JUMPS.flatMap(i => [-1, 1].flatMap(s => rampParts().map(p =>
      scaledUV(new THREE.BoxGeometry(ROAD, 2, p.L + 0.1), 2, 0.5).rotateX(s * p.a).translate(roadCenter(i), p.y - Math.cos(p.a), mz + s * ((z1 - z0) / 2 + p.d) - s * Math.sin(p.a)))));
    const kicker = new THREE.Mesh(mergeGeometries(kick), stdMat({ map: this.tex.hazard, roughness: 0.7 })); kicker.castShadow = kicker.receiveShadow = true; scene.add(kicker);
    const off = slope * water / bed - 0.4;
    this.riverWater = rect(-HALF, HALF, z0 + off, z1 - off, water, 12);
    return stdMat({ color: 0x3b6a63, roughness: 0.1, metalness: 0.15, normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.4, 0.4) });
  }

  // Parks: Wegekreuz, Brunnen oder Teich, Bänke, Hecken mit Durchgängen, Laternen. Liefert die Laternenliste
  makeParks(waterMat) {
    const scene = this.scene, res = this.settings.quality === 'low' ? 512 : 1024, lamps = [], wet = [this.riverWater], stone = [], spray = [], benches = [];
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), inner = BLOCK - 2 * WALK;
    for (const pond of [false, true]) {
      const list = this.city.parks.filter(p => p.pond === pond);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(box, stdMat({ map: parkTex(pond, res), roughness: 1 }), list.length);
      list.forEach((p, i) => mesh.setMatrixAt(i, tmpM.compose(tmpP.set(p.x, 0, p.z), tmpQ.identity(), tmpS.set(inner, SLAB + 0.03, inner))));
      mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh);
    }
    const Y0 = SLAB + 0.03;
    for (const p of this.city.parks) {
      const at = (g) => g.translate(p.x, Y0, p.z);
      if (p.pond) {
        stone.push(at(new THREE.CylinderGeometry(7.6, 7.8, 0.3, 40).translate(0, 0.05, 0)));
        wet.push(at(new THREE.CylinderGeometry(7.25, 7.25, 0.05, 40).translate(0, 0.2, 0)));
      } else {
        stone.push(at(new THREE.CylinderGeometry(3.3, 3.5, 0.7, 32).translate(0, 0.35, 0)), at(new THREE.CylinderGeometry(0.45, 0.65, 1.7, 12).translate(0, 1.5, 0)),
          at(new THREE.CylinderGeometry(1.5, 0.45, 0.4, 24).translate(0, 2.35, 0)), at(new THREE.CylinderGeometry(0.14, 0.24, 0.7, 10).translate(0, 2.85, 0)));
        wet.push(at(new THREE.CylinderGeometry(3.0, 3.0, 0.05, 32).translate(0, 0.72, 0)), at(new THREE.CylinderGeometry(1.32, 1.32, 0.05, 24).translate(0, 2.56, 0)));
        spray.push(at(new THREE.CylinderGeometry(1.45, 2.4, 1.85, 24, 1, true).translate(0, 1.6, 0)), at(new THREE.CylinderGeometry(0.05, 0.16, 1.3, 8).translate(0, 3.85, 0)));
      }
      for (const [x, z, r] of [[2.3, 14.5, -1], [-2.3, -14.5, 1], [14.5, -2.3, 0], [-14.5, 2.3, 2], [2.3, -14.5, -1], [-2.3, 14.5, 1], [14.5, 2.3, 2], [-14.5, -2.3, 0]])
        benches.push(new THREE.Matrix4().compose(tmpP.set(p.x + x, Y0, p.z + z), tmpQ.setFromAxisAngle(Y, r * Math.PI / 2), tmpS.set(1, 1, 1)));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lamps.push([p.x + sx * 6.8, p.z + sz * 6.8]);
    }
    for (const b of this.city.blocks) if (b.type === 'river') for (const x of [b.x0 + 14, b.x0 + 34]) lamps.push([x, b.z0 + 6.5], [x, b.z1 - 6.5]); // Uferpromenade
    const add = (geos, mat, shadow = true) => { if (!geos.length) return; const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); };
    add(stone, stdMat({ color: 0xd6cfc0, roughness: 0.8 }));
    add(wet, waterMat, false);
    add(spray, stdMat({ color: 0xeaf6ff, transparent: true, opacity: 0.35, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide }), false);
    // Bank: Sitz, Lehne, zwei Seitenteile (zeigt nach +z)
    const bench = mergeGeometries([new THREE.BoxGeometry(1.7, 0.07, 0.45).translate(0, 0.45, 0.02), new THREE.BoxGeometry(1.7, 0.4, 0.06).translate(0, 0.72, -0.2).rotateX(-0.12),
      new THREE.BoxGeometry(0.07, 0.45, 0.5).translate(-0.8, 0.22, 0), new THREE.BoxGeometry(0.07, 0.45, 0.5).translate(0.8, 0.22, 0)].map(g => g.toNonIndexed()));
    const benchMesh = new THREE.InstancedMesh(bench, stdMat({ color: 0x7a5636, roughness: 0.75 }), Math.max(1, benches.length));
    benches.forEach((m, i) => benchMesh.setMatrixAt(i, m)); benchMesh.count = benches.length;
    const hedges = this.city.solids.filter(sd => sd.hedge), hedgeMesh = new THREE.InstancedMesh(box, stdMat({ color: 0x8fd07a, map: this.tex.grass, roughness: 1 }), Math.max(1, hedges.length));
    hedges.forEach((h, i) => hedgeMesh.setMatrixAt(i, tmpM.compose(tmpP.set((h.x0 + h.x1) / 2, SLAB, (h.z0 + h.z1) / 2), tmpQ.identity(), tmpS.set(h.x1 - h.x0, h.h, h.z1 - h.z0)))); hedgeMesh.count = hedges.length;
    for (const m of [benchMesh, hedgeMesh]) { m.castShadow = m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); }
    return lamps;
  }

  // y = aktuelle Höhe: unter einer Brücke zählt das Flussbett, darüber die Fahrbahn
  groundY(x, z, y = 9) {
    const ry = riverY(x, z);
    if (ry < 0) {
      for (const c of BRIDGES) if (Math.abs(x - c) < BRIDGE_HALF && y > -RIVER.deck - 0.4) return Math.abs(x - c) < ROAD / 2 ? 0 : SLAB;
      return ry;
    }
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
    this.camera.far = 4000; this.camera.updateProjectionMatrix(); // Berge; Autos jenseits des Nebels blendet vehicles.js aus
    this.haze.value.set(150, q.fog * 8 + 900);
    if (this.hillStep !== q.hills) { // Berge je Stufe feiner oder gar nicht
      if (this.hills) { this.scene.remove(this.hills); this.hills.geometry.dispose(); }
      this.hills = q.hills ? new THREE.Mesh(makeHills(q.hills), this.hillMat) : null;
      if (this.hills) this.scene.add(this.hills);
      this.hillStep = q.hills;
    }
    this.scene.environment = this.envTex; // auch im Low-Poly-Stil: Autolack und Glas brauchen etwas zum Spiegeln
    for (const k of ['asphalt', 'sidewalk', 'grass', 'plaza', 'sand']) {
      const m = this.mats[k];
      m.map = real ? this.tex[k] : null;
      m.color.set(real ? 0xffffff : { asphalt: 0x3d414c, sidewalk: 0xcbc5bb, grass: 0x6cc46a, plaza: 0xa8a39a, sand: 0xf0dcae }[k]);
      m.roughness = real ? 0.85 : 1;
      m.needsUpdate = true;
    }
    this.scene.traverse(o => { if (o.isMesh && o.material?.needsUpdate !== undefined) o.material.needsUpdate = true; });
    this.setupPost(q.bloom, q.ao || (real && q.shadows > 0), q.grade);
    this.resize();
  }

  setupPost(bloom, ao, grade) {
    this.composer?.dispose?.();
    this.composer = null;
    if (!bloom && !ao && !grade) return;
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (ao) {
      const p = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
      p.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1.2 });
      c.addPass(p);
    }
    if (bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.4, 1); c.addPass(this.bloom); }
    c.addPass(new OutputPass());
    if (grade) c.addPass(new ShaderPass({ // Kino: etwas wärmer, satter, mehr Kontrast, dunkle Ränder
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main() { vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(.299, .587, .114));
          c.rgb = mix(vec3(l), c.rgb, 1.15) * vec3(1.05, 1.0, .93); c.rgb = (c.rgb - .5) * 1.07 + .5;
          c.rgb *= mix(.7, 1., smoothstep(.85, .3, distance(vUv, vec2(.5)))); gl_FragColor = c; }`,
    }));
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
    this.inside.visible = this.doors.some(([x, z]) => (x - focus.x) ** 2 + (z - focus.z) ** 2 < 32 * 32);
    for (const R of this.rooms) R.g.visible = (R.x - focus.x) ** 2 + (R.z - focus.z) ** 2 < this.q.rooms ** 2;
    const phi = (tod - 0.25) * Math.PI * 2, clamp = THREE.MathUtils.clamp;
    const dir = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0.35).normalize();
    const day = clamp(dir.y * 4 + 0.15, 0, 1), dusk = clamp(1 - Math.abs(dir.y) * 5, 0, 1), dark = 1 - day;
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(dir); u.turbidity.value = 2.5 + 7 * dusk; u.rayleigh.value = 1.1 + 2.4 * dusk; // mittags tiefblau, abends orange-rosa
    this.night = dark;
    // Der Himmel-Shader ist sehr hell: niedrige Belichtung, dafür kräftige Lichter
    this.sun.intensity = 5.5 * day;
    this.sun.color.setHSL(0.09, 0.6 * dusk + 0.25, 0.55 + 0.38 * (1 - dusk)); // auch mittags leicht warm
    this.sun.position.copy(focus).addScaledVector(dir.y > 0 ? dir : dir.clone().negate(), 150);
    this.sun.target.position.copy(focus);
    this.moon.intensity = 1.1 * dark;
    this.moon.position.set(focus.x - 60, focus.y + 120, focus.z + 40);
    this.hemi.intensity = 0.55 + 1.5 * day;
    this.hemi.color.setRGB(0.55 + 0.25 * day, 0.62 + 0.3 * day, 0.85 + 0.15 * day);
    this.scene.environmentIntensity = 0.2 + 1.1 * day;
    this.scene.fog.color.setHex(0x0b0a1e).lerp(new THREE.Color(0xbfd8ef).multiplyScalar(2.2), day).lerp(new THREE.Color(0xff9a8a).multiplyScalar(1.8), dusk * 0.6 * day);
    this.stars.material.opacity = clamp((0.6 - day) * 1.6, 0, 1);
    this.stars.position.copy(this.camera.position);
    this.lampMat.emissiveIntensity = 0.4 + 4.5 * dark;
    this.poolMat.opacity = 0.6 * dark; this.pools.visible = dark > 0.05;
    if (this.bloom) { this.bloom.strength = 0.36 * dark * dark; this.bloom.enabled = this.bloom.strength > 0.02; } // tagsüber aus: sonst überstrahlt der helle Himmel alle Kanten
    this.neonMat.color.setScalar(0.3 + 2.4 * dark);
    const lit = clamp((0.6 - day) * 2.2, 0, 1) * 1.25; // Fenster und Ladenschilder gehen in der Dämmerung an
    for (const m of this.litMats) m.emissiveIntensity = lit;
    this.waterNormal.offset.set(performance.now() * 1.5e-5, performance.now() * 2.4e-5);
    this.renderer.toneMappingExposure = 0.5 + 0.3 * dark;
  }

  render() {
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }
}

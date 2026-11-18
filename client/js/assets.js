import * as THREE from 'three';
import { stdMat, LITE } from './gfx.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { AVATARS } from './shared.js';

export const MODELS = [
  AVATARS[0], 'avatar_clips',
  'tree_oak', 'tree_pine', 'tree_fat', 'tree_palm', 'bush', 'bush_large', 'rock_small', 'barrel', 'crate',
  'tree_autumn', 'tree_pine_tall', 'flower_red', 'satellite_dish', 'generator', 'cargo_ship', 'target', 'burger', 'fries', 'hot_dog', 'donut', 'cake', 'pizza',
];
export const SOUNDS = ['shoot', 'hit', 'impact', 'land', 'step', 'ui', 'confirm', 'kill', 'hurt', 'coin', 'dash'];

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
export const assets = { models: {}, sounds: {} };

// Einige Kenney/Quaternius-Modelle nutzen unbeleuchtete Materialien -> einheitlich PBR machen,
// damit Licht, Schatten und Tageszeit auf alles wirken.
function fixMaterials(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const fixed = mats.map(m => {
      if (m.isMeshStandardMaterial && !LITE) { m.roughness = Math.max(m.roughness, 0.6); m.metalness = Math.min(m.metalness, 0.2); return m; }
      return stdMat({ color: m.color, map: m.map || null, roughness: 0.85, vertexColors: !!m.vertexColors, name: m.name, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side });
    });
    o.material = Array.isArray(o.material) ? fixed : fixed[0];
  });
}

const pending = {};
// Modell einmal laden. Figuren kommen so erst bei Bedarf (alle 42 wären beim Start 12 MB); fällt eine aus, springt Figur 1 ein.
export function loadModel(n, must = false) {
  return pending[n] ||= loader.loadAsync(`assets/models/${n}.glb`).then(g => { fixMaterials(g.scene); assets.models[n] = g; },
    (e) => { if (must) throw e; assets.models[n] = assets.models[AVATARS[0]]; });
}

export async function loadAll(onProgress) {
  let done = 0;
  const total = MODELS.length + SOUNDS.length;
  const tick = () => onProgress(++done / total);
  await Promise.all(MODELS.map(n => loadModel(n, true).then(tick)));
  await Promise.all(SOUNDS.map(async n => {
    try { assets.sounds[n] = await (await fetch(`assets/sfx/${n}.ogg`)).arrayBuffer(); } catch { /* Ton optional */ }
    tick();
  }));
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { AVATARS, VEHICLE_TYPES, WEAPONS } from './shared.js';

export const MODELS = [
  ...AVATARS, 'avatar_clips', ...VEHICLE_TYPES, ...WEAPONS.map(w => w.model),
  'building_a', 'building_b', 'building_c', 'building_d', 'building_e', 'building_f', 'building_g', 'building_h',
  'skyscraper_a', 'skyscraper_b', 'skyscraper_c',
  'tree_oak', 'tree_pine', 'tree_fat', 'tree_palm', 'bush', 'bush_large', 'rock_small', 'barrel', 'crate',
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
      if (m.isMeshStandardMaterial) { m.roughness = Math.max(m.roughness, 0.6); m.metalness = Math.min(m.metalness, 0.2); return m; }
      return new THREE.MeshStandardMaterial({ color: m.color, map: m.map || null, roughness: 0.85, vertexColors: !!m.vertexColors, name: m.name });
    });
    o.material = Array.isArray(o.material) ? fixed : fixed[0];
  });
}

export async function loadAll(onProgress) {
  let done = 0;
  const total = MODELS.length + SOUNDS.length;
  const tick = () => onProgress(++done / total);
  await Promise.all(MODELS.map(async n => {
    const g = await loader.loadAsync(`assets/models/${n}.glb`);
    fixMaterials(g.scene);
    assets.models[n] = g;
    tick();
  }));
  await Promise.all(SOUNDS.map(async n => {
    try { assets.sounds[n] = await (await fetch(`assets/sfx/${n}.ogg`)).arrayBuffer(); } catch { /* Ton optional */ }
    tick();
  }));
}

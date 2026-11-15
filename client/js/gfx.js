import * as THREE from 'three';

// Grafik-Stufen ("Shader"), im Startmenü als Karten wählbar. Die Chromebook-Stufen sind nur für schwache Geräte gebaut:
// Lambert-Shader statt PBR (keine Spiegelungen, kaum Rechenarbeit pro Pixel), kleinere Auflösung, 30 Bilder/s,
// Physik mit 30 Hz und wenige Passanten – das entlastet vor allem die CPU. Ob Lambert gilt, steht beim Laden fest.
// speed/look = Balken in der Auswahl (1–5); hills = Rasterweite der Berge in m (0 = keine); fps 0 = ohne Grenze
export const QUALITY = {
  cbturbo: { name: 'Chromebook Turbo', tag: 'Sehr schwache Chromebooks', speed: 5, look: 1, lite: true, pixel: 0.5, maxDpr: 1, shadows: 0, bloom: false, ao: false, grade: false, fog: 95, pedDist: 28, pedKinds: 6, aa: false, fps: 30, phys: 30, hills: 0 },
  cb:      { name: 'Chromebook', tag: 'Chromebooks mit schwacher CPU', speed: 4, look: 2, lite: true, pixel: 0.62, maxDpr: 1, shadows: 0, bloom: false, ao: false, grade: false, fog: 120, pedDist: 36, pedKinds: 10, aa: false, fps: 30, phys: 30, hills: 90 },
  low:     { name: 'Niedrig', tag: 'Handy, Tablet, alte Laptops', speed: 4, look: 3, pixel: 0.75, maxDpr: 1, shadows: 0, bloom: false, ao: false, grade: false, fog: 140, pedDist: 45, pedKinds: 14, aa: false, fps: 0, phys: 60, hills: 60 },
  medium:  { name: 'Mittel', tag: 'Schatten, Glanz, Spiegelungen', speed: 3, look: 4, pixel: 1, maxDpr: 1.5, shadows: 1024, bloom: true, ao: false, grade: false, fog: 260, pedDist: 80, pedKinds: 42, aa: true, fps: 0, phys: 60, hills: 32 },
  high:    { name: 'Hoch', tag: 'Scharfe Schatten, Tiefenwirkung', speed: 2, look: 5, pixel: 1, maxDpr: 2, shadows: 2048, bloom: true, ao: true, grade: false, fog: 380, pedDist: 120, pedKinds: 42, aa: true, fps: 0, phys: 60, hills: 22 },
  kino:    { name: 'Kino', tag: 'Farbfilter, Vignette, weite Sicht', speed: 1, look: 5, pixel: 1, maxDpr: 2, shadows: 2048, bloom: true, ao: true, grade: true, fog: 480, pedDist: 120, pedKinds: 42, aa: true, fps: 0, phys: 60, hills: 18 },
};
export const CHROMEBOOK = /\bCrOS\b/.test(navigator.userAgent);
export const DEFAULT_Q = CHROMEBOOK ? 'cb' : matchMedia('(pointer: coarse)').matches ? 'low' : 'medium';
let stored = null; try { stored = localStorage.getItem('ss_quality'); } catch { /* privater Modus */ }
export const START_Q = QUALITY[stored] ? stored : DEFAULT_Q;
export const LITE = !!QUALITY[START_Q].lite;

// Standard-Material, auf den Chromebook-Stufen als Lambert (PBR-Werte fallen weg)
export function stdMat(p = {}) {
  if (!LITE) return new THREE.MeshStandardMaterial(p);
  const { roughness, metalness, roughnessMap, metalnessMap, envMapIntensity, ...rest } = p;
  return new THREE.MeshLambertMaterial(rest);
}

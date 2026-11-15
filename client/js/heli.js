import * as THREE from 'three';

// Hubschrauber der Stadtwache aus Grundformen (Nase zeigt nach +z, Ursprung in der Kabinenmitte).
// Liefert die beweglichen Teile; Seil und Lichtkegel haben Höhe 1 und werden pro Bild auf die Flughöhe gestreckt.
export function makeHeli(scene) {
  const g = new THREE.Group();
  const mat = (color, o) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
  const white = mat(0xf1f3f6), blue = mat(0x1f4f9e), dark = mat(0x1a1c21, { roughness: 0.8 }), glass = mat(0x0b141f, { roughness: 0.12, metalness: 0.7 });
  const ball = new THREE.SphereGeometry(1, 20, 14), box = new THREE.BoxGeometry(1, 1, 1);
  const add = (geo, m, pos, scale = [1, 1, 1], parent = g) => {
    const o = new THREE.Mesh(geo, m); o.position.set(...pos); o.scale.set(...scale); o.castShadow = true; parent.add(o); return o;
  };
  add(ball, white, [0, 0, 0], [1.15, 1.2, 2.3]);                                   // Kabine
  add(ball, glass, [0, 0.14, 1.0], [1.02, 0.98, 1.5]);                              // Kanzel
  add(ball, blue, [0, -0.5, -0.3], [1.19, 0.8, 2.1]);                               // blauer Rumpfboden
  add(new THREE.CylinderGeometry(0.13, 0.3, 4.8, 10), white, [0, 0.35, -4.2]).rotation.x = -Math.PI / 2; // Heckausleger
  add(box, blue, [0, 1.05, -6.3], [0.1, 1.6, 0.9]);                                 // Seitenleitwerk
  add(box, blue, [0, 0.4, -5.7], [1.7, 0.08, 0.5]);                                 // Höhenleitwerk
  add(new THREE.CylinderGeometry(0.2, 0.3, 0.7, 10), dark, [0, 1.45, 0]);           // Rotormast
  const rotor = new THREE.Group(); rotor.position.set(0, 1.85, 0); g.add(rotor);
  add(box, dark, [0, 0, 0], [10.8, 0.05, 0.36], rotor); add(box, dark, [0, 0, 0], [0.36, 0.05, 10.8], rotor);
  const tail = new THREE.Group(); tail.position.set(0.2, 1.1, -6.45); g.add(tail);
  add(box, dark, [0, 0, 0], [0.05, 1.9, 0.16], tail); add(box, dark, [0, 0, 0], [0.05, 0.16, 1.9], tail);
  for (const sx of [-1, 1]) {                                                       // Kufen mit Streben
    add(box, dark, [sx * 1.05, -1.6, 0.1], [0.1, 0.1, 3.6]);
    for (const z of [-0.9, 1.1]) add(box, dark, [sx * 0.9, -1.3, z], [0.07, 0.7, 0.07]).rotation.z = sx * 0.4;
  }
  add(ball, new THREE.MeshBasicMaterial({ color: 0xff2a2a }), [0, -1.15, -0.6], [0.12, 0.12, 0.12]).castShadow = false; // Positionslicht
  const rope = add(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), dark, [0, 0, 0]); rope.castShadow = false;
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xcfe2ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  g.add(beam); scene.add(g);
  return { group: g, rotor, tail, rope, beam };
}

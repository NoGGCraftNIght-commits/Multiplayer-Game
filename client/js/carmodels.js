import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stdMat, LITE } from './gfx.js';

// Eigene Fahrzeugmodelle im Stil der 80er, ganz aus Code: Seitenprofil mit ausgeschnittenen Radläufen wird zur Karosserie
// extrudiert, darauf eine getönte Glaskabine mit lackierten Säulen und Dach. Maße in Metern, vorn = +z, Boden = y 0.
// Je Auto: Lack, Glas, Anbauteile (Farbe je Ecke), 4 Räder, Scheinwerfer, Rückleuchten = 10 Draw Calls.

// Profil: L Länge, W Breite, r Radradius, ax Achsen [hinten, vorn], yb Bodenfreiheit, nose Front oben, hood Haubenvorderkante,
// belt Gürtellinie, ws/rf/rr/rs Scheibenfuß vorn, Dach vorn, Dach hinten, Scheibenfuß hinten (z), roof Dachhöhe,
// trunk/tail Heckdeckel/Heckkante (Höhe), lamp [Scheinwerfer, Rückleuchte] (Höhe), chrome Stoßstangen, extra Aufbau
const BASE = {
  sedan: { L: 4.6, W: 1.85, r: 0.34, ax: [-1.42, 1.38], yb: 0.3, nose: 0.74, hood: 0.82, belt: 0.88, ws: 0.8, rf: 0.02, rr: -0.98, rs: -1.42, roof: 1.4, trunk: 0.87, tail: 0.8, lamp: [0.62, 0.7], chrome: true },
  sports: { L: 4.4, W: 1.9, r: 0.33, ax: [-1.35, 1.38], yb: 0.24, nose: 0.52, hood: 0.6, belt: 0.74, ws: 0.6, rf: -0.25, rr: -0.95, rs: -1.75, roof: 1.16, trunk: 0.77, tail: 0.78, lamp: [0.43, 0.62] },
  hatch: { L: 3.9, W: 1.75, r: 0.32, ax: [-1.22, 1.25], yb: 0.28, nose: 0.68, hood: 0.76, belt: 0.86, ws: 0.72, rf: 0.02, rr: -1.55, rs: -1.85, roof: 1.4, trunk: 0.9, tail: 0.9, lamp: [0.58, 0.74] },
  suv: { L: 4.55, W: 1.95, r: 0.4, ax: [-1.4, 1.38], yb: 0.42, nose: 0.98, hood: 1.05, belt: 1.12, ws: 0.98, rf: 0.42, rr: -2.18, rs: -2.22, roof: 1.86, trunk: 1.12, tail: 1.1, lamp: [0.86, 0.95] },
  van: { L: 4.8, W: 1.95, r: 0.36, ax: [-1.55, 1.5], yb: 0.32, nose: 0.9, hood: 1.0, belt: 1.06, ws: 1.85, rf: 1.2, rr: -2.32, rs: -2.36, roof: 2.0, trunk: 1.06, tail: 1.02, lamp: [0.76, 0.86], chrome: true },
  box: { L: 5.4, W: 2.05, r: 0.38, ax: [-1.7, 1.75], yb: 0.36, nose: 0.95, hood: 1.04, belt: 1.1, ws: 2.1, rf: 1.55, rr: 0.9, rs: 0.85, roof: 2.08, trunk: 1.1, tail: 1.0, lamp: [0.8, 0.9] },
  pickup: { L: 5.0, W: 1.9, r: 0.38, ax: [-1.6, 1.5], yb: 0.4, nose: 0.95, hood: 1.02, belt: 1.08, ws: 1.0, rf: 0.45, rr: -0.42, rs: -0.48, roof: 1.78, trunk: 0.78, tail: 0.78, lamp: [0.84, 0.86], chrome: true },
  lorry: { L: 7.4, W: 2.4, r: 0.5, ax: [-2.4, 2.35], yb: 0.5, nose: 1.3, hood: 1.4, belt: 1.45, ws: 3.5, rf: 3.15, rr: 2.25, rs: 2.2, roof: 2.65, trunk: 1.05, tail: 1.05, lamp: [1.0, 1.0] },
  race: { L: 4.5, W: 1.98, r: 0.34, ax: [-1.4, 1.42], yb: 0.17, nose: 0.4, hood: 0.5, belt: 0.66, ws: 0.25, rf: -0.45, rr: -1.0, rs: -1.75, roof: 1.02, trunk: 0.7, tail: 0.72, lamp: [0.34, 0.56] },
};
// Typ -> Profil, feste Lackfarbe (sonst zufällig je Auto) und Aufbauten
const TYPES = {
  sedan: { p: 'sedan' }, taxi: { p: 'sedan', paint: 0xf2c12e, sign: true }, police_car: { p: 'sedan', paint: 0x15171b, police: true },
  sedan_sports: { p: 'sports', spoiler: true }, hatchback_sports: { p: 'hatch' }, race_car: { p: 'race', spoiler: true, stripes: true },
  suv: { p: 'suv' }, suv_luxury: { p: 'suv', chrome: true, L: 4.75 }, van: { p: 'van' },
  delivery_van: { p: 'box', paint: 0xeeeeea, cargo: 2.55 }, ambulance: { p: 'box', paint: 0xf4f4f0, cargo: 2.55, stripe: 0xc8202a, bar: true },
  truck: { p: 'pickup', bed: true }, truck_flat: { p: 'pickup', deck: 0.86 },
  delivery_flat: { p: 'lorry', W: 2.2, L: 6.4, deck: 1.05 }, firetruck: { p: 'lorry', paint: 0xb51d1d, cargo: 2.45, ladder: true, bar: true },
  garbage_truck: { p: 'lorry', paint: 0x3d6b45, cargo: 2.95 },
};
// Lackfarben der Zeit: Pastell, Weiß, Schwarz, Metallic
export const PAINTS = [0xf2f2ee, 0xf29bb8, 0x3fc1c0, 0x7fb7e8, 0xb3202a, 0x16171a, 0xb9bec4, 0xe8dcc0, 0x9fe0c0, 0x23345c, 0x6a1f2b, 0xe9c33a, 0xb79ad8, 0x8a6a45, 0x2f6b4f, 0xd8622a];

const DETAIL = stdMat({ vertexColors: true, roughness: 0.42, metalness: LITE ? 0 : 0.55 });
const GLASS = LITE ? new THREE.MeshLambertMaterial({ color: 0x1a222c }) : new THREE.MeshPhysicalMaterial({ color: 0x0e141b, roughness: 0.04, metalness: 0.3, clearcoat: 1, envMapIntensity: 1.6 });
const WHEEL = stdMat({ vertexColors: true, roughness: 0.6, metalness: LITE ? 0 : 0.35 });
const PAINT_PROTO = new THREE.MeshBasicMaterial(); // Platzhalter, vehicles.js setzt den Lack je Auto
const paints = new Map();
export function paintMat(hex) {
  if (paints.has(hex)) return paints.get(hex);
  const m = LITE ? new THREE.MeshLambertMaterial({ color: hex }) : new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.35, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  paints.set(hex, m); return m;
}
export const isPaint = (m) => m === PAINT_PROTO || [...paints.values()].includes(m);
export const fixedPaint = (type) => TYPES[type]?.paint;

const C = { trim: 0x141516, chrome: 0xd9dde2, plate: 0xe9e6d8, white: 0xf2f2ee, red: 0xc61f22, blue: 0x1f4fd6, amber: 0xffa21f, tire: 0x171717, rim: 0xaeb3ba, wood: 0x6b4a2c };
function tint(g, hex) { // Farbe pro Ecke, damit alle Anbauteile ein Draw Call bleiben
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  const c = new THREE.Color(hex), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const plain = (g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; };
const box = (w, h, l, x, y, z) => new THREE.BoxGeometry(w, h, l).translate(x, y, z);
// Seitenprofil (z, y) -> Körper der Breite W, mittig
function extrude(pts, W, bev) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  return new THREE.ExtrudeGeometry(s, { depth: W - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 4 }).rotateY(-Math.PI / 2).translate((W - 2 * bev) / 2, 0, 0);
}
// Balken von a nach b (z, y) auf Seite x
function beam([za, ya], [zb, yb], x, tx, ty) {
  const l = Math.hypot(zb - za, yb - ya);
  return new THREE.BoxGeometry(tx, ty, l).rotateX(-Math.atan2(yb - ya, zb - za)).translate(x, (ya + yb) / 2, (za + zb) / 2);
}

const wheels = new Map();
function wheelGeo(r) {
  if (wheels.has(r)) return wheels.get(r);
  const tw = 0.24, parts = [tint(new THREE.CylinderGeometry(r, r, tw, 20).rotateZ(Math.PI / 2), C.tire), tint(new THREE.CylinderGeometry(r * 0.6, r * 0.6, tw + 0.012, 14).rotateZ(Math.PI / 2), C.rim),
    tint(new THREE.CylinderGeometry(r * 0.2, r * 0.2, tw + 0.03, 10).rotateZ(Math.PI / 2), C.chrome)];
  for (let k = 0; k < 5; k++) parts.push(tint(new THREE.BoxGeometry(tw + 0.02, r * 0.09, r * 0.5).translate(0, 0, r * 0.3).rotateX(k * Math.PI * 0.4), C.trim)); // Speichen-Schatten
  const g = mergeGeometries(parts); wheels.set(r, g); return g;
}

const cache = {};
export function carModel(type) {
  if (cache[type]) return cache[type];
  const t = TYPES[type] || TYPES.sedan, P = { ...BASE[t.p], ...(t.L ? { L: t.L } : {}), ...(t.W ? { W: t.W } : {}) };
  const { W, r, yb, nose, hood, belt, roof, trunk, tail } = P, L2 = P.L / 2, k = P.L / BASE[t.p].L;
  const [ws, rf, rr, rs] = [P.ws, P.rf, P.rr, P.rs].map(z => z * k), ax = P.ax.map(a => a * k), body = [], det = [], glass = [];
  // Karosserie unten: Boden mit Radläufen, Front, Haube, (Kabine), Heck
  const pts = [[-L2, yb]];
  for (const a of ax) { // Radlauf: Halbkreis um die Radmitte, unterhalb der Bodenlinie abgeschnitten
    const ra = r + 0.08, h = Math.max(r, yb);
    pts.push([a - ra, yb], [a - ra, h]);
    for (let i = 1; i < 8; i++) { const q = Math.PI * (1 - i / 8), y = r + ra * Math.sin(q); if (y > h + 0.01) pts.push([a + ra * Math.cos(q), y]); }
    pts.push([a + ra, h], [a + ra, yb]);
  }
  pts.push([L2, yb], [L2, nose], [L2 - 0.12, hood], [ws, belt]);
  if (t.bed || t.deck) pts.push([rs, belt], [rs - 0.04, t.deck || trunk], [-L2, t.deck || trunk], [-L2, yb + 0.1]);
  else pts.push([rs, belt], [-L2 + 0.12, trunk], [-L2, tail]);
  body.push(extrude(pts.filter((q, i) => !i || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-3), W, 0.05));
  // Kabine aus getöntem Glas, darauf Dach und Säulen in Lackfarbe
  const Wc = W - 0.2, cab = [[rs, belt - 0.02], [ws, belt - 0.02], [rf, roof], [rr, roof]];
  glass.push(extrude(cab, Wc, 0.03));
  body.push(plain(new THREE.BoxGeometry(Wc + 0.02, 0.06, rf - rr + 0.04).translate(0, roof + 0.01, (rf + rr) / 2)));
  const bz = rs + (ws - rs) * (t.p === 'sedan' ? 0.48 : 0.55), sideC = t.p === 'van' ? [rr + 0.6, rr + 1.6] : [];
  for (const s of [-1, 1]) {
    const x = s * (Wc / 2);
    body.push(plain(beam([ws, belt], [rf, roof], x, 0.05, 0.08)), plain(beam([rs, belt], [rr, roof], x, 0.05, t.p === 'sedan' ? 0.28 : 0.1)));
    if (ws - rs > 1.3) body.push(plain(box(0.05, roof - belt, 0.09, x, (roof + belt) / 2, bz)));
    for (const z of sideC) body.push(plain(box(0.05, roof - belt, 0.08, x, (roof + belt) / 2, z)));
    body.push(plain(box(0.08, 0.07, 0.12, s * (W / 2 + 0.05), belt + 0.06, ws - 0.12))); // Spiegel
    // Gummileiste, Türfugen, Griffe
    det.push(tint(box(0.02, 0.05, P.L * 0.62, s * (W / 2 + 0.006), yb + 0.26, (ax[0] + ax[1]) / 2), C.trim));
    for (const z of [ws - 0.08, bz, ...(ws - rs > 1.3 ? [rs + 0.08] : [])]) det.push(tint(box(0.012, belt - yb - 0.25, 0.015, s * (W / 2 + 0.002), (belt + yb + 0.15) / 2, z), C.trim));
    det.push(tint(box(0.02, 0.025, 0.12, s * (W / 2 + 0.01), belt - 0.1, bz - 0.2), C.chrome));
    if (t.police) det.push(tint(box(0.012, belt - yb - 0.32, ws - rs - 0.3, s * (W / 2 + 0.008), (belt + yb + 0.1) / 2, (ws + rs) / 2), C.white));
    if (t.stripe) det.push(tint(box(0.012, 0.16, P.L - 0.3, s * (W / 2 + 0.035), belt + 0.25, 0), t.stripe));
    if (t.stripes) det.push(tint(box(0.012, 0.08, P.L * 0.7, s * (W / 2 + 0.008), (yb + belt) / 2, 0.1), C.white));
  }
  // Front und Heck: Stoßstangen (Chrom bei Limousinen der Zeit), Kühlergrill, Kennzeichen
  const bump = (t.chrome ?? P.chrome) ? C.chrome : C.trim, by0 = yb + 0.1;
  det.push(tint(box(W + 0.04, 0.13, 0.14, 0, by0, L2 + 0.03), bump), tint(box(W + 0.04, 0.13, 0.14, 0, by0, -L2 - 0.03), bump));
  det.push(tint(box(W * 0.42, Math.min(0.16, nose - by0 - 0.12), 0.02, 0, P.lamp[0], L2 + 0.006), C.trim));
  det.push(tint(box(0.5, 0.12, 0.02, 0, by0 + 0.13, L2 + 0.04), C.plate), tint(box(0.5, 0.12, 0.02, 0, by0 + 0.15, -L2 - 0.04), C.plate));
  if (t.spoiler) { det.push(tint(box(W - 0.1, 0.03, 0.3, 0, tail + 0.22, -L2 + 0.18), C.trim)); for (const s of [-0.6, 0.6]) det.push(tint(box(0.04, 0.2, 0.12, s, tail + 0.1, -L2 + 0.2), C.trim)); }
  if (t.stripes) det.push(tint(box(0.3, 0.012, P.L - 0.4, 0, roof + 0.045, 0), C.white), tint(box(0.3, 0.012, L2 - ws - 0.1, 0, hood + 0.03, (L2 + ws) / 2), C.white));
  if (t.sign) det.push(tint(box(0.6, 0.18, 0.22, 0, roof + 0.12, (rf + rr) / 2), 0xffe27a));
  // Ladefläche, Pritsche, Koffer, Leiter
  if (t.bed) for (const s of [-1, 1]) body.push(plain(box(0.06, belt - trunk, rs + L2, s * (W / 2 - 0.03), (belt + trunk) / 2, (rs - L2) / 2)));
  if (t.bed) body.push(plain(box(W, belt - trunk, 0.06, 0, (belt + trunk) / 2, -L2 + 0.03)));
  if (t.deck) det.push(tint(box(W + 0.06, 0.1, rs + L2 - 0.1, 0, t.deck + 0.05, (rs - L2 - 0.1) / 2), C.wood));
  if (t.cargo) body.push(plain(new THREE.BoxGeometry(W + 0.04, t.cargo - hood + 0.3, rs + L2 - 0.15).translate(0, (t.cargo + hood - 0.3) / 2, (rs - 0.15 - L2) / 2)));
  if (t.ladder) {
    const z0 = -L2 + 0.3, z1 = rs - 0.1;
    for (const s of [-0.35, 0.35]) det.push(tint(box(0.06, 0.06, z1 - z0, s, t.cargo + 0.2, (z0 + z1) / 2), C.chrome));
    for (let z = z0; z < z1; z += 0.4) det.push(tint(box(0.7, 0.03, 0.03, 0, t.cargo + 0.2, z), C.chrome));
  }
  const bar = [];
  if (t.police || t.bar) { // Blaulichtbalken: zwei Hälften mit eigenem Material, vehicles.js lässt sie blinken
    const y = (t.cargo || roof) + 0.09, z = t.cargo ? rs + 0.1 : (rf + rr) / 2 + 0.1;
    det.push(tint(box(1.2, 0.05, 0.28, 0, y - 0.06, z), C.trim));
    bar.push(box(0.56, 0.1, 0.24, -0.29, y, z), box(0.56, 0.1, 0.24, 0.29, y, z));
  }
  // zusammenführen: ein Mesh je Material
  const g = new THREE.Group(), add = (geos, mat, name) => { const m = new THREE.Mesh(mergeGeometries(geos.map(plain2)), mat); m.name = name; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(body, PAINT_PROTO, 'paint'); add(glass, GLASS, 'glass'); add(det, DETAIL, 'detail');
  if (bar.length) { const red = add([bar[0]], DETAIL, 'bar-r'), blue = add([bar[1]], DETAIL, 'bar-b'); red.castShadow = blue.castShadow = false; }
  const wg = wheelGeo(r);
  for (const [z, f] of [[ax[1], 'front'], [ax[0], 'back']]) for (const [s, n] of [[1, 'left'], [-1, 'right']]) {
    const w = new THREE.Mesh(wg, WHEEL); w.name = `wheel-${f}-${n}`; w.position.set(s * (W / 2 - 0.15), r, z); w.castShadow = true; g.add(w);
  }
  g.userData = { wheelR: r, lamp: P.lamp, front: L2, back: -L2, W };
  return cache[type] = g;
}
function plain2(g) { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); if (!g.attributes.color) tint(g, 0xffffff); return g; }

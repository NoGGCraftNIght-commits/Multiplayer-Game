// Geteilter Code für Client UND Server: Stadtlayout, Konstanten, Protokoll-Tabellen.
// Der Server importiert diese Datei direkt (../client/js/shared.js), damit beide Seiten
// garantiert dieselbe Stadt aus demselben Seed erzeugen.

export const MAX_PLAYERS = 16;
export const TICK_HZ = 20;          // Server-Snapshots pro Sekunde
export const PED_HZ = 10;           // Passanten-Updates pro Sekunde
export const DAY_LENGTH = 12 * 60;  // Sekunden für einen Tag-Nacht-Zyklus

// Reihenfolge = Netzwerk-ID der Animation (nur Zahlen gehen übers Netz); +AIM_FLAG = Arm zielt
export const ANIMS = ['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'drive', 'down', 'crouch', 'interact', 'wave', 'cheer',
  'no', 'talk', 'phone', 'dance', 'scared', 'photo', 'laugh', 'shrug', 'clap', 'look'];
export const A = Object.fromEntries(ANIMS.map((n, i) => [n, i]));
export const AIM_FLAG = 64;

// Reihenfolge = Netzwerk-ID. Die ersten 12 bleiben vorn, damit eine gespeicherte Auswahl gültig bleibt.
const figs = (p, nums) => nums.map(n => `avatar_${p}${String(n).padStart(2, '0')}`);
export const AVATARS = ['avatar_m01', 'avatar_f03', 'avatar_m04', 'avatar_f01', 'avatar_m06', 'avatar_f08',
  'avatar_m08', 'avatar_f12', 'avatar_m16', 'avatar_f13', 'avatar_m17', 'avatar_f17',
  ...figs('f', [2, 4, 5, 6, 7, 9, 10, 11, 14, 15, 16]), ...figs('m', [2, 3, 5, 7, 9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21]),
  'avatar_fb1', 'avatar_mb1', 'avatar_fs1', 'avatar_ms1']; // b = Büro, s = Strand
export const COPS = ['cop_m1', 'cop_f1', 'cop_m2']; // Stadtwache

// Spielzeug-Blaster: Schaden = "Spritzpunkte" auf 100 Energie
// Waffen wie im großen Vorbild: Gattungsnamen ohne Marken. Sie verschießen weiter Wasser, Schaum, Konfetti und Farbe.
// Am Anfang hat jeder nur die Pistole; den Rest findet man in der Stadt (PICKUP) oder kauft ihn im Waffenladen (price, $)
export const WEAPONS = [
  { id: 'splash', name: 'Pistole', damage: 14, rate: 4, range: 45, spread: 0.01, pellets: 1, speed: 60, fx: 'water', mag: 15, reload: 1.3, price: 0 },
  { id: 'dart', name: 'Maschinenpistole', damage: 8, rate: 11, range: 40, spread: 0.022, pellets: 1, speed: 80, fx: 'dart', mag: 30, reload: 1.8, price: 250 },
  { id: 'confetti', name: 'Pump-Schrotflinte', damage: 9, rate: 1.1, range: 24, spread: 0.07, pellets: 8, speed: 60, fx: 'confetti', mag: 6, reload: 2.4, price: 400 },
  { id: 'paint', name: 'Sturmgewehr', damage: 13, rate: 7, range: 75, spread: 0.008, pellets: 1, speed: 85, fx: 'paint', mag: 30, reload: 2.2, gravity: 2, price: 650 },
];
export const START_MONEY = 300, KO_MONEY = 150, JUMP_MONEY = 100, PICKUP_RESPAWN = 45000;
export const CAR_HIT_DAMAGE = 35;

// Fahrzeugtypen: Masse, Motorkraft, Höchstgeschwindigkeit (m/s), Grip, Lenkwinkel
export const VEHICLES = {
  sedan:            { name: 'Limousine',   mass: 1200, force: 5200, vmax: 38, grip: 3.2, steer: 0.55 },
  sedan_sports:     { name: 'Sportwagen',  mass: 1050, force: 7200, vmax: 52, grip: 3.8, steer: 0.5 },
  hatchback_sports: { name: 'Flitzer',     mass: 950,  force: 6000, vmax: 46, grip: 3.6, steer: 0.58 },
  suv:              { name: 'Geländewagen',mass: 1700, force: 6400, vmax: 36, grip: 3.0, steer: 0.5 },
  suv_luxury:       { name: 'Luxus-SUV',   mass: 1800, force: 7200, vmax: 40, grip: 3.0, steer: 0.5 },
  taxi:             { name: 'Taxi',        mass: 1250, force: 5400, vmax: 38, grip: 3.2, steer: 0.55 },
  police_car:       { name: 'Streifenwagen', mass: 1300, force: 6600, vmax: 46, grip: 3.4, steer: 0.55 },
  van:              { name: 'Kleinbus',    mass: 1900, force: 5400, vmax: 32, grip: 2.8, steer: 0.48 },
  delivery_van:     { name: 'Lieferwagen', mass: 2300, force: 6000, vmax: 30, grip: 2.7, steer: 0.45 },
  truck:            { name: 'Pick-up',     mass: 2000, force: 6600, vmax: 36, grip: 3.0, steer: 0.48 },
  ambulance:        { name: 'Rettungswagen', mass: 2400, force: 6600, vmax: 36, grip: 2.8, steer: 0.45 },
  firetruck:        { name: 'Feuerwehr',   mass: 3200, force: 8200, vmax: 33, grip: 2.7, steer: 0.42 },
  garbage_truck:    { name: 'Müllwagen',   mass: 3400, force: 8000, vmax: 30, grip: 2.7, steer: 0.4 },
  race_car:         { name: 'Rennwagen',   mass: 900,  force: 8200, vmax: 60, grip: 4.2, steer: 0.5 },
  truck_flat:       { name: 'Pritschenwagen', mass: 2100, force: 6600, vmax: 35, grip: 3.0, steer: 0.48 },
  delivery_flat:    { name: 'Kleinlaster', mass: 2600, force: 6800, vmax: 32, grip: 2.8, steer: 0.44 },
};
export const VEHICLE_TYPES = Object.keys(VEHICLES);
export const CAR_SIZE = [1.2, 1.12, 1.5]; // Kenney-Modelle auf echte Maße strecken: Breite, Höhe, Länge (Limousine 1,8 x 1,46 x 3,8 m)

// ---------- deterministischer Zufall ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Stadtlayout ----------
export const GRID = 7;          // Blöcke pro Achse
export const BLOCK = 48;        // Blockgröße inkl. Gehweg
export const ROAD = 14;         // Straßenbreite
export const WALK = 4;          // Gehwegbreite
export const CELL = BLOCK + ROAD;
export const SIZE = GRID * CELL + ROAD;
export const HALF = SIZE / 2;
export const BEACH = 46;        // Sandstreifen östlich der Stadt, dahinter das Meer
export const LANE = 2.3;        // Fahrspur-Versatz von der Mittellinie (Rechtsverkehr); außen daneben liegt die Parkspur

export const GH = 4.2, FH = 3.2, SLAB_H = 0.14; // Erdgeschoss-, Geschosshöhe, Gehweghöhe (m)
export const DOOR = 1, DOOR_H = 2.5, WALL_T = 0.3;  // halbe Türbreite, Türhöhe, Wandstärke betretbarer Häuser
export const roadCenter = (i) => -HALF + ROAD / 2 + i * CELL;            // i = 0..GRID
export const blockMin = (i) => -HALF + ROAD + i * CELL;                  // i = 0..GRID-1

// Fluss: Betonkanal quer durch Blockreihe RIVER_ROW (Uferpromenade, schräge Böschung, hüfttiefes Wasser).
// Die Nord-Süd-Straßen queren ihn auf Brücken; an JUMPS fehlt die Brücke: dort Sprungrampen, Verkehr fährt nicht hin
export const RIVER_ROW = 5, JUMPS = [2, 5];
export const RIVER = { z0: blockMin(RIVER_ROW) + 7, z1: blockMin(RIVER_ROW) + BLOCK - 7, bed: -3, slope: 10, water: -2.2, deck: 0.7 }; // Böschung 17°
// Sprungrampe als Bogen aus drei Stücken [Länge m, Neigung rad] (ein einzelner Knick bremst das Auto zu stark), Kante 1,6 m hoch am Ufer.
// rampParts(): je Stück d = Abstand der Oberseitenmitte vor der Kante, y = Höhe dort, a = Neigung, L = Länge
export const RAMP = [[3, 0.07], [3, 0.17], [3, 0.3]];
export function rampParts() {
  const total = RAMP.reduce((t, [L, a]) => t + L * Math.cos(a), 0); let x = 0, h = 0;
  return RAMP.map(([L, a]) => { const p = { d: total - x - L * Math.cos(a) / 2, y: h + L * Math.sin(a) / 2, a, L }; x += L * Math.cos(a); h += L * Math.sin(a); return p; });
}
export const BRIDGES = Array.from({ length: GRID + 1 }, (_, i) => i).filter(i => !JUMPS.includes(i)).map(roadCenter);
export const BRIDGE_HALF = ROAD / 2 + WALK; // Fahrbahn + beide Gehwege
export function riverY(x, z) { // Kanalprofil ohne Brücken, 0 = Straßenniveau
  if (x < -HALF || x > HALF || z <= RIVER.z0 || z >= RIVER.z1) return 0;
  return Math.max(RIVER.bed, Math.min(z - RIVER.z0, RIVER.z1 - z) * RIVER.bed / RIVER.slope);
}
export const roadOpen = (i, j, a, b) => !(i === a && JUMPS.includes(i) && Math.min(j, b) === RIVER_ROW); // Straßenstück (i,j)-(a,b) befahrbar?

export function buildCity(seed = 1337) {
  const r = rng(seed);
  const blocks = [], buildings = [], props = [], parking = [], parks = [], pickups = [];
  const mid = (GRID - 1) / 2;
  for (let bx = 0; bx < GRID; bx++) for (let bz = 0; bz < GRID; bz++) {
    const x0 = blockMin(bx), z0 = blockMin(bz), x1 = x0 + BLOCK, z1 = z0 + BLOCK;
    const d = Math.max(Math.abs(bx - mid), Math.abs(bz - mid));
    let type = d <= 1 ? 'downtown' : 'town';
    if (bz === RIVER_ROW) type = 'river';
    else if ((bx === 1 && bz === 6) || (bx === 5 && bz === 1) || (bx === 3 && bz === 3)) type = 'park';
    else if (d >= 2 && r() < 0.12) type = 'park';
    blocks.push({ bx, bz, x0, z0, x1, z1, type });
    const ix0 = x0 + WALK, iz0 = z0 + WALK, inner = BLOCK - 2 * WALK; // 40m Innenfläche
    if (type === 'river') { // Palmen auf beiden Uferpromenaden
      for (let x = x0 + 8; x < x1 - 4; x += 11) for (const z of [z0 + 5.5, z1 - 5.5]) props.push({ kind: 'tree_palm', x: x + r() * 2, z, rot: r() * 6.28, s: 4.4 + r() * 1.6, solid: true });
      continue;
    }
    if (type === 'park') { // Kreuzwege zu einem runden Platz mit Brunnen oder Teich, Bäume in den vier Vierteln
      const cx = ix0 + inner / 2, cz = iz0 + inner / 2;
      parks.push({ x: cx, z: cz, pond: (bx + bz) % 2 === 1 });
      pickups.push({ x: cx, z: cz - 10, y: SLAB_H, w: 1 });
      for (let k = 0; k < 10; k++) { const a = r() * 6.28, d = 12.5 + r() * 5; props.push({ kind: 'flower_red', x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, rot: r() * 6.28, s: 2 + r(), solid: false }); }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let k = 0; k < 6; k++) {
        const dx = 3.4 + r() * 14, dz = 3.4 + r() * 14, tree = k < 4;
        if (Math.hypot(dx, dz) < 11.5) continue; // Platz und Ringweg frei lassen
        const kind = tree ? ['tree_oak', 'tree_fat', 'tree_pine', 'tree_palm', 'tree_autumn', 'tree_pine_tall'][Math.floor(r() * 6)] : r() < 0.5 ? 'bush' : 'bush_large';
        props.push({ kind, x: cx + sx * dx, z: cz + sz * dz, rot: r() * 6.28, s: tree ? 3.8 + r() * 2.4 : 3 + r() * 2, solid: tree });
      }
      continue;
    }
    // 2x2 Grundstücke, Downtown: teilweise ein Turm über den ganzen Block.
    // style + floors bestimmen Fassade und Höhe (siehe buildings.js); an der Strandpromenade stehen Art-déco-Hotels
    if (type === 'downtown' && r() < 0.55) {
      const w = inner - 6;
      buildings.push({ style: r() < 0.6 ? 'glass' : 'condo', floors: 22 + Math.floor(r() * 18), x: ix0 + inner / 2, z: iz0 + inner / 2, w, d: w, rot: Math.floor(r() * 4) * Math.PI / 2, room: 'lobby' });
    } else if (bx === GRID - 1 && r() < 0.5) { // Strandhotel: Scheibe längs der Küste, Front zum Meer
      buildings.push({ style: 'hotel', floors: 9 + Math.floor(r() * 8), x: ix0 + inner / 2, z: iz0 + inner / 2, w: inner - 6, d: 15, rot: Math.PI / 2, room: 'lobby' });
    } else {
      const lot = inner / 2;
      for (let lx = 0; lx < 2; lx++) for (let lz = 0; lz < 2; lz++) {
        const pool = type === 'downtown' ? ['office', 'glass', 'condo', 'office', 'brick'] : bx === GRID - 1 ? ['deco', 'deco', 'deco', 'condo'] : ['deco', 'brick', 'condo', 'office', 'brick'];
        const style = r() < 0.07 ? 'garage' : pool[Math.floor(r() * pool.length)];
        const floors = style === 'garage' ? 3 + Math.floor(r() * 3) : type === 'downtown' ? 7 + Math.floor(r() * 9) : style === 'condo' ? 4 + Math.floor(r() * 6) : style === 'brick' ? 3 + Math.floor(r() * 5) : 2 + Math.floor(r() * 4);
        // Front zeigt zur nächsten Straße (+z = vorn)
        const rot = lz === 1 ? 0 : Math.PI;
        const w = lot - 2.5 - r() * 2, dd = lot - 2.5 - r() * 2;
        const room = style !== 'garage' && r() < 0.55 ? ['markt', 'markt', 'imbiss', 'imbiss', 'bar', 'mode'][Math.floor(r() * 6)] : null; // betretbarer Laden im Erdgeschoss
        buildings.push({ style, floors, x: ix0 + lot * lx + lot / 2, z: iz0 + lot * lz + lot / 2, w, d: dd, rot, room });
      }
      if (r() < 0.35) pickups.push({ x: ix0 + inner / 2, z: iz0 + inner / 2, y: SLAB_H, w: 1 + Math.floor(r() * 2) }); // Waffe in der Gasse zwischen den Häusern
    }
    // Straßenbäume an den Gehweg-Ecken
    for (const [px, pz] of [[x0 + 2, z0 + 2], [x1 - 2, z0 + 2], [x0 + 2, z1 - 2], [x1 - 2, z1 - 2]]) {
      if (r() < 0.75) props.push({ kind: 'tree_palm', x: px, z: pz, rot: r() * 6.28, s: 4.6 + r() * 1.6, solid: true });
    }
  }
  // Strand: Palmenreihe an der Promenade, Sonnenschirme im Sand
  const beach = [];
  for (let z = -HALF + 8; z < HALF - 8; z += 11) props.push({ kind: 'tree_palm', x: HALF + 3 + r() * 2, z: z + r() * 4, rot: r() * 6.28, s: 5 + r() * 2, solid: true });
  for (let k = 0; k < 70; k++) beach.push({ x: HALF + 10 + r() * (BEACH - 18), z: -HALF + 6 + r() * (SIZE - 12), rot: r() * 6.28, c: Math.floor(r() * 6) });
  // Parkplätze am Straßenrand (Parkspur = 5,5 m neben der Mittellinie)
  for (let i = 0; i <= GRID; i++) for (let j = 0; j < GRID; j++) {
    if (r() < 0.45 && (j !== RIVER_ROW || !JUMPS.includes(i))) {
      const side = r() < 0.5 ? 1 : -1;
      const along = blockMin(j) + 8 + r() * (BLOCK - 16);
      // Straße entlang z (x konstant) bzw. entlang x
      if (r() < 0.5) parking.push({ x: roadCenter(i) + side * 5.5, z: along, yaw: side > 0 ? Math.PI : 0 }); // in Fahrtrichtung der Seite geparkt
      else parking.push({ x: along, z: roadCenter(i) + side * 5.5, yaw: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
  }
  // Waffenläden: je ein betretbarer Laden nahe drei Ecken der Stadt
  for (const [ax, az] of [[-140, -140], [140, 20], [-80, 175]]) {
    const b = buildings.filter(q => q.room && q.room !== 'lobby').sort((p, q) => Math.hypot(p.x - ax, p.z - az) - Math.hypot(q.x - ax, q.z - az))[0];
    if (b) b.room = 'waffen';
  }
  // Fundorte: unter zwei Brücken im Flussbett, am Strand
  pickups.push({ x: BRIDGES[1], z: (RIVER.z0 + RIVER.z1) / 2, y: RIVER.bed, w: 2 }, { x: BRIDGES[BRIDGES.length - 2], z: (RIVER.z0 + RIVER.z1) / 2, y: RIVER.bed, w: 3 },
    { x: HALF + 30, z: -150, y: 0, w: 2 }, { x: HALF + 30, z: 120, y: 0, w: 1 });
  // Kollision (achsenparallel; Häuser sind 0/90/180/270° gedreht). h = Oberkante, y0 = Unterkante (Decke über einem Laden),
  // wall = blockiert Sicht und Schüsse, bld = gehört zu einem betretbaren Haus (Autos stoßen dort an den ganzen Grundriss)
  const solids = [];
  for (const b of buildings) {
    const swap = Math.abs(Math.sin(b.rot)) > 0.5, hw = (swap ? b.d : b.w) / 2, hd = (swap ? b.w : b.d) / 2;
    b.fp = { x0: b.x - hw, x1: b.x + hw, z0: b.z - hd, z1: b.z + hd };
    b.h = SLAB_H + GH + (b.floors - 1) * FH + 0.55;
    if (!b.room) { solids.push({ ...b.fp, h: b.h, wall: true }); continue; }
    const W = b.w / 2, D = b.d / 2, t = WALL_T, ix = W - t, iz = D - t, box = (x0, x1, z0, z1, o) => solids.push({ ...localRect(b, x0, x1, z0, z1), bld: true, ...o });
    for (const [x0, x1, z0, z1] of [[-W, W, -D, -D + t], [-W, -W + t, -D, D], [W - t, W, -D, D], [-W, -DOOR, D - t, D], [DOOR, W, D - t, D]]) box(x0, x1, z0, z1, { h: b.h, wall: true });
    box(-DOOR, DOOR, D - t, D, { y0: SLAB_H + DOOR_H, h: b.h, wall: true }); // Sturz über der Tür
    box(-W, W, -D, D, { y0: SLAB_H + GH, h: b.h });                       // Decke: oben ist das Haus massiv
    b.items = roomItems(b.room, ix, iz, r);
    for (const [kind, x, z, w, d, h] of b.items) if (kind !== 'stool') box(x - w / 2, x + w / 2, z - d / 2, z + d / 2, { h: SLAB_H + h, kind });
    if (b.room === 'waffen') b.buy = localPoint(b, 0, -iz + 5.2);
    for (const [kind, x, z, y, rot, sc] of roomProps(b.room, b.items)) { const [wx, wz] = localPoint(b, x, z); props.push({ kind, x: wx, z: wz, y: SLAB_H + y, rot: b.rot + rot, s: sc, solid: false, inside: true }); }
  }
  // Dachtechnik aus dem Modellpaket: Satellitenschüsseln und Aggregate
  for (const b of buildings) if (b.floors < 18 && b.style !== 'garage' && r() < 0.5) {
    const [x, z] = localPoint(b, (r() - 0.5) * (b.w - 4), (r() - 0.5) * (b.d - 4));
    props.push({ kind: r() < 0.6 ? 'satellite_dish' : 'generator', x, z, y: b.h, rot: r() * 6.28, s: 2.2, solid: false });
  }
  for (const p of props) if (p.solid) solids.push({ x0: p.x - 0.5, x1: p.x + 0.5, z0: p.z - 0.5, z1: p.z + 0.5, h: 4 });
  for (const p of parks) {
    const a = p.pond ? 5 : 2.5, e = (BLOCK - 2 * WALK) / 2 - 0.6; // Brunnen-/Teichrand (Quadrat im Kreis), Hecken 0,6 m innerhalb des Gehwegs
    solids.push({ x0: p.x - a, x1: p.x + a, z0: p.z - a, z1: p.z + a, h: 0.9 });
    for (const s of [-1, 1]) for (const [lo, hi] of [[-e - 0.4, -2.1], [2.1, e + 0.4]]) { // Durchgänge an den Wegen
      solids.push({ x0: p.x + lo, x1: p.x + hi, z0: p.z + s * e - 0.4, z1: p.z + s * e + 0.4, h: 1, hedge: true });
      solids.push({ x0: p.x + s * e - 0.4, x1: p.x + s * e + 0.4, z0: p.z + lo, z1: p.z + hi, h: 1, hedge: true });
    }
  }
  return { seed, blocks, buildings, props, parking, solids, beach, parks, pickups };
}

// Punkt / Rechteck in Hauskoordinaten (x quer, z nach vorn zur Tür) -> Welt
export function localPoint(b, x, z) { const c = Math.cos(b.rot), s = Math.sin(b.rot); return [b.x + x * c + z * s, b.z - x * s + z * c]; }
function localRect(b, x0, x1, z0, z1) {
  const [ax, az] = localPoint(b, x0, z0), [bx, bz] = localPoint(b, x1, z1);
  return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) };
}
// Möbel je Ladenart: [Art, x, z, Breite, Tiefe, Höhe] in Hauskoordinaten (ix/iz = halbe Innenmaße, Tür bei +iz)
function roomItems(kind, ix, iz, r) {
  const it = [];
  if (kind === 'markt') {
    it.push(['counter', -ix + 1.9, iz - 2.6, 2.8, 0.9, 1], ['fridge', 0, -iz + 0.45, 2 * ix - 1.6, 0.9, 2.2]);
    for (let x = -ix + 5.4; x < ix - 1.4; x += 2.9) it.push(['shelf', x, -0.9, 1, 2 * iz - 8, 1.7]);
  } else if (kind === 'imbiss') {
    it.push(['counter', 0, -iz + 2.4, 2 * ix - 4, 0.9, 1.05]);
    for (let z = -iz + 4.8; z + 2.3 < iz - 2.6; z += 3.4) it.push(['booth', -ix + 1.2, z, 2.2, 0.55, 1.1], ['table', -ix + 1.2, z + 1.1, 2, 0.8, 0.76], ['booth', -ix + 1.2, z + 2.2, 2.2, 0.55, 1.1]);
    for (let x = -ix + 4.5; x < ix - 1.5; x += 1.3) it.push(['stool', x, -iz + 3.6, 0.45, 0.45, 0.75]);
  } else if (kind === 'bar') {
    it.push(['bar', ix - 2.3, -1, 0.9, 2 * iz - 6.5, 1.1], ['backbar', ix - 0.35, -1, 0.5, 2 * iz - 6.5, 2.4]);
    for (let z = -iz + 3; z < iz - 3; z += 1.4) it.push(['stool', ix - 3.3, z, 0.45, 0.45, 0.75]);
    for (const [x, z] of [[-ix + 2.5, -iz + 2.5], [-ix + 2.5, 0.5], [-1, -iz + 3.5]]) it.push(['table', x, z, 1, 1, 1.05]);
  } else if (kind === 'mode') {
    it.push(['counter', ix - 2.2, iz - 3, 2.6, 0.9, 1]);
    for (let x = -ix + 2.5; x < ix - 3.5; x += 3.2) for (let z = -iz + 2.5; z < iz - 4.5; z += 2.8) it.push(['rack', x, z, 2.2, 0.5, 1.6]);
  } else if (kind === 'waffen') {
    it.push(['glass', 0, -iz + 3.6, 2 * ix - 2.4, 0.9, 1.05], ['gunwall', 0, -iz + 0.2, 2 * ix - 1.4, 0.3, 2.6]);
    for (const s of [-1, 1]) it.push(['rack', s * (ix - 0.6), 1.5, 0.6, 2 * iz - 8, 1.8]);
  } else { // Lobby: Empfang, Sofas, Pflanzen, Aufzüge an der Rückwand
    it.push(['desk', 0, -iz + 4.5, Math.min(7, ix), 1.2, 1.1], ['lift', 0, -iz + 0.15, Math.min(10, 2 * ix - 4), 0.3, 2.6]);
    for (const s of [-1, 1]) it.push(['sofa', s * (ix - 2.5), 0.5, 1, 3.2, 0.8], ['table', s * (ix - 4.2), 0.5, 1, 1.6, 0.45]);
  }
  return it;
}
// Kleinkram aus dem Modellpaket auf Theken und an Wänden: [Modell, x, z, y, Drehung, Größe]
function roomProps(kind, items) {
  const out = [], top = (k) => items.filter(i => i[0] === k);
  if (kind === 'imbiss') for (const [, x, z, w, , h] of top('counter')) for (let k = 0; k < 5; k++) out.push([['burger', 'fries', 'hot_dog', 'donut', 'cake'][k], x - w / 2 + 1 + k * (w - 2) / 4, z, h, 0.3 * k, 1.1]);
  if (kind === 'imbiss') for (const [, x, z, , , h] of top('table')) out.push(['pizza', x, z, h, 0, 0.8]);
  if (kind === 'markt') for (const [, x, z, , , h] of top('counter')) out.push(['donut', x - 0.5, z, h, 0, 1.2], ['cake', x + 0.6, z, h, 0, 0.7]);
  if (kind === 'waffen') for (const [, x, z, w] of top('gunwall')) for (const s of [-1, 1]) out.push(['target', x + s * (w / 2 - 0.4), z + 0.25, 1.3, -Math.PI / 2, 4]);
  if (kind === 'lobby') for (const [, x, z] of top('sofa')) out.push(['bush_large', x, z + 2.6, 0, 0, 1.6]);
  return out;
}

// Rundweg eines Passanten um einen Block (Gehwegmitte)
export function sidewalkLoop(block) {
  const o = WALK / 2;
  return [[block.x0 + o, block.z0 + o], [block.x1 - o, block.z0 + o], [block.x1 - o, block.z1 - o], [block.x0 + o, block.z1 - o]];
}

// Kreuzungs-Knoten für Verkehr
export const node = (i, j) => [roadCenter(i), roadCenter(j)];

// Prüft, ob Punkt (x,z) mit Radius rad in einem Rechteck steckt -> Ausstoß-Vektor oder null
export function pushOut(solids, x, z, rad) {
  let ox = 0, oz = 0;
  for (const s of solids) {
    if (s.y0) continue; // Decken über Läden stören Fußgänger nicht
    if (x < s.x0 - rad || x > s.x1 + rad || z < s.z0 - rad || z > s.z1 + rad) continue;
    const cx = Math.max(s.x0, Math.min(x + ox, s.x1)), cz = Math.max(s.z0, Math.min(z + oz, s.z1));
    const dx = x + ox - cx, dz = z + oz - cz, d2 = dx * dx + dz * dz;
    if (d2 >= rad * rad) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (rad - d) / d; ox += dx * k; oz += dz * k; }
    else { // Mittelpunkt im Rechteck: kürzester Weg raus
      const l = x - s.x0, rr = s.x1 - x, t = z - s.z0, b = s.z1 - z, m = Math.min(l, rr, t, b);
      if (m === l) ox -= l + rad; else if (m === rr) ox += rr + rad; else if (m === t) oz -= t + rad; else oz += b + rad;
    }
  }
  return ox || oz ? [ox, oz] : null;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sanitizeName = (s) => String(s || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16) || 'Gast';
export const sanitizeRoom = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

import * as THREE from 'three';
import { stdMat } from './gfx.js';
import { rng } from './shared.js';

// Prozedurale Miami-Häuser in echtem Maßstab (Geschoss 3,2 m, Tür 2,2 m): Kästen mit gekachelten
// Fassaden-Texturen, Simsen, Balkonen und Dachaufbauten. Fenster und Ladenschilder leuchten nachts.
// Alle Häuser landen in sechs zusammengefassten Meshes (ein Draw Call pro Fassadentyp).
export const FH = 3.2, GH = 4.2; // Geschosshöhe, Erdgeschosshöhe (m)
const BAY = 3.2, PX = 128;       // Fensterachse (m) und ihre Breite in der Textur (px)
const TINT = {
  deco: [0xff9ebb, 0x8fe3cf, 0xffe38a, 0x9fd0ff, 0xffc29a, 0xd3b8ff, 0xffffff],
  condo: [0xffffff, 0xfff1dc, 0xe6f3f8, 0xffe0cf],
  office: [0xe9dfce, 0xdcdcdc, 0xf2e8da, 0xd2dbe0],
  glass: [0x9fe8f0, 0x8fc0ff, 0xa6f0c6, 0xffd9a8, 0xd8e4f0],
  brick: [0xffffff, 0xf3dfd2, 0xe2d2c6, 0xffe6d0, 0xd6c8c0],
  garage: [0xffffff, 0xe8e4dc, 0xd8dade],
  hotel: [0xffffff, 0xfff1dc, 0xe6f3f8, 0xffe0cf, 0xffd6e0],
};
const NEON = [0xff2d95, 0x21e6ff, 0xb44dff, 0xff9a1f, 0x3dff8a];
const SIGN = [['#5a1f47', '#ff3fa4'], ['#12485a', '#35e0ff'], ['#3c2a66', '#b06bff'], ['#6a3a10', '#ffa53a']]; // Schild: Tagfarbe, Leuchtfarbe
// Fensterflächen je Zelle (x, y, b, h in Zellanteilen, y von oben), Anteil erleuchteter Fenster, Lichtfarben
const LIT = {
  deco: [[[0.235, 0.235, 0.53, 0.47]], 0.42, ['#ffd9a0', '#ffe9c4', '#fff4e0', '#bfe0ff']],
  condo: [[[0.117, 0.25, 0.375, 0.69], [0.508, 0.25, 0.375, 0.69]], 0.38, ['#ffd9a0', '#ffe9c4', '#ffcf8a', '#c9e4ff']],
  office: [[[0.055, 0.19, 0.89, 0.53]], 0.5, ['#eaf4ff', '#f4f8ff', '#fff6e0']],
  glass: [[[0.02, 0.02, 0.47, 0.72], [0.51, 0.02, 0.47, 0.72]], 0.33, ['#eaf4ff', '#ffe9c4', '#d6ecff']],
  brick: [[[0.266, 0.172, 0.47, 0.625]], 0.4, ['#ffd9a0', '#ffcf8a', '#ffe9c4']],
  garage: [[[0.08, 0.1, 0.84, 0.04]], 0.85, ['#e8f2ff', '#f4f8ff']],
};

let K = 1, RM = null; // K = Texturauflösung (2 auf mittel/hoch); RM = Rauheit/Metall-Leinwand der gerade gezeichneten Fassade
const GLOSS = 'rgb(0,18,150)', MATT = 'rgb(0,230,0)'; // glTF-Art: Rauheit in Grün, Metall in Blau
// Leinwand in logischen Pixeln (PX je Fensterachse), intern K-fach aufgelöst
function canvas(w, h, k = K) { const c = document.createElement('canvas'); c.width = w * k; c.height = h * k; const g = c.getContext('2d'); g.scale(k, k); return [c, g]; }

function texture(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.repeat.set(repeat, repeat);
  return t;
}

// Material mit Farbe, Nachtlicht und glatten, spiegelnden Scheiben
function facadeMat(c, rc, ec, emissiveRepeat) {
  const rm = texture(rc, 1, false);
  return stdMat({ map: texture(c), roughnessMap: rm, metalnessMap: rm, roughness: 1, metalness: 1, emissiveMap: texture(ec, emissiveRepeat), emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true });
}

// Schmutzschlieren unter Simsen und Fenstern: Fassaden wirken bewohnt statt frisch gerendert
function grime(g, w, h, r, n) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, l = 18 + r() * 70, gr = g.createLinearGradient(0, y, 0, y + l);
    gr.addColorStop(0, 'rgba(45,38,30,.13)'); gr.addColorStop(1, 'rgba(45,38,30,0)');
    g.fillStyle = gr; g.fillRect(x, y, 2 + r() * 6, l);
  }
}

// Scheibe: Verlauf (oben spiegelt der Himmel) + schräger Lichtstreifen
function glass(g, x, y, w, h, top, bottom, r) {
  const grad = g.createLinearGradient(0, y, 0, y + h); grad.addColorStop(0, top); grad.addColorStop(1, bottom);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = grad; g.fillRect(x, y, w, h);
  const o = x + w * (0.25 + r() * 0.6);
  g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(o, y); g.lineTo(o + w * 0.2, y); g.lineTo(o + w * 0.2 - h * 0.45, y + h); g.lineTo(o - h * 0.45, y + h); g.fill();
  g.restore();
  if (RM) { RM.fillStyle = GLOSS; RM.fillRect(x, y, w, h); }
}

function noise(g, w, h, r, amount, n) { // Putz-Körnung
  for (let i = 0; i < n; i++) { const v = r() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${r() * amount})`; g.fillRect(r() * w, r() * h, 2, 2); }
}

// eine Fassadenzelle (3,2 m x 3,2 m) zeichnen; X/Y = linke obere Ecke
const CELL = {
  deco(g, X, Y, r) {
    const wx = X + 30, wy = Y + 30, ww = 68, wh = 60;
    g.fillStyle = 'rgba(0,0,0,.09)'; for (const y of [104, 110, 116]) g.fillRect(X, Y + y, PX, 2); // Zierstreifen
    g.fillStyle = '#ffffff'; g.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
    glass(g, wx, wy, ww, wh, '#7396ab', '#2c4152', r);
    g.fillStyle = '#f4f4f4'; g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); g.fillRect(wx, wy + wh * 0.42, ww, 2.5);
    if (r() < 0.35) { g.fillStyle = 'rgba(232,228,214,.88)'; g.fillRect(wx, wy, ww, wh * (0.25 + r() * 0.5)); } // Rollo
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(wx - 9, wy - 6, ww + 18, 4);
    g.fillStyle = '#ffffff'; g.fillRect(wx - 9, wy - 12, ww + 18, 6); // "Augenbraue" über dem Fenster
  },
  condo(g, X, Y, r) {
    g.fillStyle = '#6f7a84'; g.fillRect(X + 10, Y + 24, 108, 96); // verschattete Loggia
    for (const dx of [X + 15, X + 65]) { g.fillStyle = '#eef0f1'; g.fillRect(dx - 3, Y + 29, 54, 91); glass(g, dx, Y + 32, 48, 88, '#4f6a7d', '#1f2d38', r); }
    if (r() < 0.4) { g.fillStyle = 'rgba(240,235,225,.85)'; g.fillRect(X + 15, Y + 32, 12 + r() * 22, 88); } // Vorhang
    const sh = g.createLinearGradient(0, Y + 24, 0, Y + 44); sh.addColorStop(0, 'rgba(0,0,0,.4)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(X + 10, Y + 24, 108, 20);
    g.fillStyle = '#fafafa'; g.fillRect(X, Y + 120, PX, 8); // Balkonplatte
  },
  office(g, X, Y, r) {
    g.fillStyle = '#f0f0f0'; g.fillRect(X + 4, Y + 21, 120, 74);
    glass(g, X + 7, Y + 24, 114, 68, '#628399', '#263a4a', r);
    g.fillStyle = '#e4e7ea'; for (const k of [1, 2]) g.fillRect(X + 6 + 38 * k, Y + 24, 2.5, 68);
    g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(X, Y, 1.5, PX); g.fillRect(X, Y + 126, PX, 2); // Plattenfugen
  },
  brick(g, X, Y, r) {
    g.save(); g.beginPath(); g.rect(X, Y, PX, PX); g.clip();
    for (let y = 0; y < PX; y += 4) for (let x = (y / 4) % 2 ? -5 : 0; x < PX; x += 10) { // Läuferverband, Fugen = heller Grund
      const v = r(); g.fillStyle = `rgb(${142 + v * 44},${66 + v * 26},${50 + v * 18})`; g.fillRect(X + x + 0.6, Y + y + 0.6, 9, 3);
    }
    g.restore();
    const wx = X + 34, wy = Y + 22, ww = 60, wh = 80;
    g.fillStyle = '#d9d1c1'; g.fillRect(wx - 6, wy - 10, ww + 12, 9); g.fillRect(wx - 5, wy + wh + 2, ww + 10, 5); // Sturz, Fensterbank
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(wx - 5, wy + wh + 7, ww + 10, 3);
    g.fillStyle = '#f1eee6'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    glass(g, wx, wy, ww, wh, '#6d8696', '#26343f', r);
    g.fillStyle = '#f1eee6'; g.fillRect(wx, wy + wh / 2 - 2, ww, 4); g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); // Sprossen
    if (r() < 0.35) { g.fillStyle = 'rgba(236,230,214,.9)'; g.fillRect(wx, wy, ww, wh * (0.2 + r() * 0.3)); } // Rollo
    if (r() < 0.14) { g.fillStyle = '#c9c9c4'; g.fillRect(wx + 6, wy + wh / 2 + 4, 32, 20); g.fillStyle = '#8f8f8a'; for (let k = 0; k < 4; k++) g.fillRect(wx + 8, wy + wh / 2 + 7 + k * 4, 28, 1.5); } // Fenster-Klimagerät
  },
  garage(g, X, Y, r) {
    g.fillStyle = '#1b1e22'; g.fillRect(X, Y + 12, PX, 70); // offenes Parkdeck
    if (r() < 0.6) { // Autodach hinter der Brüstung
      const cx = X + 12 + r() * 48; g.fillStyle = ['#8a1c1c', '#d8d8d8', '#1c3a6a', '#2a2a2a', '#9a9a9a', '#c7a020'][Math.floor(r() * 6)];
      g.fillRect(cx, Y + 60, 60, 22); g.fillStyle = 'rgba(150,180,200,.4)'; g.fillRect(cx + 12, Y + 62, 36, 9);
    }
    g.fillStyle = '#c4c1ba'; g.fillRect(X, Y + 82, PX, 46); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(X, Y + 82, PX, 3); // Brüstung
    g.fillStyle = '#b3b0a9'; g.fillRect(X, Y, PX, 12); g.fillRect(X, Y + 12, 9, 70); // Deckenkante, Stütze
  },
  glass(g, X, Y, r) {
    for (const k of [0, 1]) { const l = 30 + r() * 12; glass(g, X + k * 64, Y, 64, 96, `hsl(${198 + r() * 10},36%,${l + 28}%)`, `hsl(204,40%,${l}%)`, r); }
    g.fillStyle = '#5f7a8a'; g.fillRect(X, Y + 96, PX, 32); // Brüstungsband
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(X, Y + 96, PX, 6);
    g.fillStyle = '#c3ced6'; g.fillRect(X, Y, PX, 2); g.fillRect(X, Y + 95, PX, 2); for (const k of [0, 1]) g.fillRect(X + k * 64, Y, 2, PX);
  },
};

// Fassade: Farbtextur 4x4 Zellen, Leuchttextur 8x8 Zellen (halbe Wiederholung -> Muster wiederholt sich erst nach 8 Geschossen)
function facade(style, r) {
  const S = PX * 4, [c, g] = canvas(S, S), [rc, rg] = canvas(S, S, 1), [ec, e] = canvas(256, 256, 1), [rects, share, lights] = LIT[style];
  rg.fillStyle = MATT; rg.fillRect(0, 0, S, S); RM = rg;
  g.fillStyle = style === 'office' ? '#d2d2d2' : '#dedede'; g.fillRect(0, 0, S, S);
  if (style !== 'glass') noise(g, S, S, r, 0.07, 9000 * K);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    CELL[style](g, i * PX, j * PX, r);
    if (style === 'deco') { const sh = g.createLinearGradient(0, j * PX, 0, j * PX + 14); sh.addColorStop(0, 'rgba(0,0,0,.24)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(i * PX, j * PX, PX, 14); } // Schatten unterm Sims
  }
  RM = null;
  if (style !== 'glass') grime(g, S, S, r, 60);
  e.fillStyle = '#000'; e.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) for (const [x, y, w, h] of rects) {
    if (r() > share) continue;
    e.globalAlpha = 0.45 + r() * 0.55; e.fillStyle = lights[Math.floor(r() * lights.length)];
    e.fillRect((i + x) * 32, (j + y) * 32, w * 32, h * 32);
  }
  return facadeMat(c, rc, ec, 0.5);
}

// Erdgeschoss: 4 Achsen mit Schaufenstern, Tür, Markisen und Ladenschildern (Schilder leuchten nachts in Neonfarben)
function shopfront(r) {
  const W = PX * 4, H = 256, m = H / GH, [c, g] = canvas(W, H), [rc, rg] = canvas(W, H, 1), [ec, e] = canvas(W, H, 1);
  rg.fillStyle = MATT; rg.fillRect(0, 0, W, H); RM = rg;
  g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, W, H); noise(g, W, H, r, 0.06, 4000);
  g.fillStyle = '#7f7f7f'; g.fillRect(0, H - 0.35 * m, W, 0.35 * m); // Sockel
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const X = i * PX, gx = X + 9, gw = 110, gy = H - 2.95 * m, gh = 2.6 * m, [bg, glow] = SIGN[i];
    g.fillStyle = '#2b2f36'; g.fillRect(gx - 4, gy - 4, gw + 8, gh + 4);
    glass(g, gx, gy, gw, gh, '#7fa0b3', '#33485a', r);
    e.fillStyle = 'rgba(255,214,150,.3)'; e.fillRect(gx, gy, gw, gh);
    if (i === 1) { // Tür
      g.fillStyle = '#23272d'; g.fillRect(X + 40, H - 2.25 * m, 48, 2.25 * m);
      glass(g, X + 44, H - 2.2 * m, 40, 2.2 * m - 8, '#8aabbd', '#3c5364', r);
      g.fillStyle = '#d9d9d9'; g.fillRect(X + 78, H - 1.15 * m, 3, 14);
    } else if (i !== 3) { // gestreifte Markise
      for (let s = 0; s < 12; s++) { g.fillStyle = s % 2 ? '#ffffff' : glow; g.fillRect(gx - 6 + s * 10.2, gy - 8, 10.3, 0.42 * m); }
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(gx - 6, gy - 8 + 0.42 * m, 122.4, 4);
    }
    const sy = H - 3.85 * m, sh = 0.72 * m; // Ladenschild mit angedeuteter Schrift
    g.fillStyle = bg; g.fillRect(X + 10, sy, 108, sh); e.fillStyle = glow; e.globalAlpha = 0.55; e.fillRect(X + 10, sy, 108, sh); e.globalAlpha = 1;
    for (let x = X + 18; x < X + 104;) {
      const lw = 5 + r() * 9;
      g.fillStyle = '#f6f0e6'; g.fillRect(x, sy + sh * 0.26, lw, sh * 0.48); e.fillStyle = '#ffffff'; e.fillRect(x, sy + sh * 0.26, lw, sh * 0.48);
      x += lw + 3 + (r() < 0.2 ? 8 : 0);
    }
  }
  RM = null;
  const dirt = g.createLinearGradient(0, H - 0.9 * m, 0, H); dirt.addColorStop(0, 'rgba(35,30,25,0)'); dirt.addColorStop(1, 'rgba(35,30,25,.4)'); // Spritzwasser-Schmutz am Sockel
  g.fillStyle = dirt; g.fillRect(0, H - 0.9 * m, W, 0.9 * m);
  return facadeMat(c, rc, ec, 1);
}

// sammelt Vierecke für ein Material
class Part {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  // Ecken gegen den Uhrzeigersinn (von außen gesehen), in Gebäudekoordinaten; m = Gebäude-Matrix
  quad(m, pts, u0, v0, u1, v1, col) {
    const k = this.p.length / 3, v = pts.map(q => new THREE.Vector3(...q).applyMatrix4(m));
    const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[3], v[0])).normalize();
    for (const q of v) { this.p.push(q.x, q.y, q.z); this.n.push(n.x, n.y, n.z); this.c.push(col.r, col.g, col.b); }
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  // vier Wände eines Quaders mit Kachel-UVs: nu/nw = Texturkacheln entlang x/z, v0..v1 in der Höhe
  walls(m, hw, hd, y0, y1, nu, nw, v0, v1, col, u0 = 0) {
    this.quad(m, [[-hw, y0, hd], [hw, y0, hd], [hw, y1, hd], [-hw, y1, hd]], u0, v0, u0 + nu, v1, col);
    this.quad(m, [[hw, y0, -hd], [-hw, y0, -hd], [-hw, y1, -hd], [hw, y1, -hd]], u0, v0, u0 + nu, v1, col);
    this.quad(m, [[hw, y0, hd], [hw, y0, -hd], [hw, y1, -hd], [hw, y1, hd]], u0, v0, u0 + nw, v1, col);
    this.quad(m, [[-hw, y0, -hd], [-hw, y0, hd], [-hw, y1, hd], [-hw, y1, -hd]], u0, v0, u0 + nw, v1, col);
  }
  // einfarbiger Quader (Sims, Balkon, Dachaufbau); top = andere Farbe für die Oberseite
  box(m, x0, x1, y0, y1, z0, z1, col, top = col) {
    this.quad(m, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0, 0, 0, 0, col);
    this.quad(m, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0, 0, 0, 0, col);
    this.quad(m, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 0, 0, 0, 0, col);
    this.quad(m, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 0, 0, 0, 0, col);
    this.quad(m, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 0, 0, 0, 0, top);
    this.quad(m, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0, 0, 0, 0, col);
  }
  // stehendes n-Eck (Wassertank, Rohr); Deckel als Dreiecksfächer
  prism(m, cx, cz, rad, y0, y1, n, col, top = col) {
    for (let k = 0; k < n; k++) {
      const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, x0 = cx + Math.sin(a0) * rad, z0 = cz + Math.cos(a0) * rad, x1 = cx + Math.sin(a1) * rad, z1 = cz + Math.cos(a1) * rad;
      this.quad(m, [[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]], 0, 0, 0, 0, col);
      this.quad(m, [[cx, y1, cz], [x0, y1, z0], [x1, y1, z1], [x1, y1, z1]], 0, 0, 0, 0, top);
    }
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material); mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
}

// liefert { meshes, heights (wie city.buildings), neon: [[Matrix4, Farbe]], lit: Materialien mit Nachtbeleuchtung }
// hi = schärfere Fassaden (doppelte Auflösung) für mittlere und hohe Qualität
export function makeBuildings(city, baseY, hi = false) {
  K = hi ? 2 : 1;
  const r = rng(city.seed + 7), pick = (a) => a[Math.floor(r() * a.length)];
  const P = { deco: new Part(), condo: new Part(), office: new Part(), glass: new Part(), brick: new Part(), garage: new Part(), shop: new Part(), plain: new Part() };
  const heights = [], neon = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
  const WHITE = new THREE.Color(0xf7f5f0), DARK = new THREE.Color(0x3a444e), UNIT = new THREE.Color(0x9a9da2), RAIL = new THREE.Color(0xb9cdd6);
  const ROOFS = [0x74777c, 0x5b5e63, 0x8a857a, 0x4a4c50].map(c => new THREE.Color(c)), STONE = new THREE.Color(0xd9d1c1), IRON = new THREE.Color(0x2c2f33), WOOD = new THREE.Color(0x7b5b40), WOODTOP = new THREE.Color(0x4f3b2a);
  for (const b of city.buildings) {
    const { style, floors } = b, top = GH + (floors - 1) * FH, tower = floors >= 18;
    // Büro- und Glastürme springen im oberen Drittel zurück (schlankere Silhouette); unten volle Grundfläche
    const back = tower && (style === 'office' || style === 'glass'), f1 = back ? Math.round((floors - 1) * 0.68) : floors - 1, y1 = GH + f1 * FH, sb = back ? 0.76 : 1;
    let w = b.w, d = b.d, hw = w / 2, hd = d / 2;
    const nx = Math.max(1, Math.round(w / BAY)), nz = Math.max(1, Math.round(d / BAY)), u0 = Math.floor(r() * 4) / 4;
    const tint = new THREE.Color(pick(TINT[style])), trim = style === 'glass' ? DARK : style === 'brick' ? STONE : WHITE, col = pick(NEON), ROOF = pick(ROOFS), fs = style === 'hotel' ? 'condo' : style;
    m.compose(new THREE.Vector3(b.x, baseY, b.z), q.setFromAxisAngle(UP, b.rot), ONE);
    const glow = (x, y, z, sx, sy, sz, c = col) => neon.push([m.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz))), c]);
    P.shop.walls(m, hw, hd, 0, GH, nx / 4, nz / 4, 0, 1, tint.clone().lerp(WHITE, 0.5), u0);
    P[fs].walls(m, hw, hd, GH, y1, nx / 4, nz / 4, 0, f1 / 4, tint, u0);
    if (back) {
      P.plain.box(m, -hw - 0.3, hw + 0.3, y1, y1 + 0.5, -hd - 0.3, hd + 0.3, trim, ROOF); // Terrasse auf dem Rücksprung
      for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) glow(ex * (hw + 0.05), (GH + y1) / 2, ez * (hd + 0.05), 0.28, y1 - GH, 0.28);
      w *= sb; d *= sb; hw *= sb; hd *= sb;
      P[fs].walls(m, hw, hd, y1 + 0.5, top, nx * sb / 4, nz * sb / 4, f1 / 4, (floors - 1) / 4, tint, u0);
    }
    P.plain.box(m, -hw - 0.45, hw + 0.45, GH - 0.11, GH + 0.11, -hd - 0.45, hd + 0.45, trim);       // Vordach über den Läden
    P.plain.box(m, -hw - 0.3, hw + 0.3, top, top + 0.55, -hd - 0.3, hd + 0.3, trim, ROOF);         // Attika + Dachfläche
    heights.push(baseY + top + 0.55);
    // Dachaufbauten: Treppenhaus + Klimageräte, bei Türmen Technikgeschoss mit Antenne
    const ax = (r() - 0.5) * (w - 6), az = (r() - 0.5) * (d - 6);
    P.plain.box(m, ax - 1.6, ax + 1.6, top + 0.55, top + 3.1, az - 1.6, az + 1.6, trim, ROOF);
    for (let k = 0; k < 2; k++) { const x = (r() - 0.5) * (w - 4), z = (r() - 0.5) * (d - 4); P.plain.box(m, x - 0.8, x + 0.8, top + 0.55, top + 1.6, z - 0.8, z + 0.8, UNIT); }
    if (tower) {
      P.plain.box(m, -hw * 0.55, hw * 0.55, top + 0.55, top + 5.5, -hd * 0.55, hd * 0.55, trim, ROOF);
      P.plain.box(m, -0.15, 0.15, top + 5.5, top + 19, -0.15, 0.15, DARK);
      glow(0, top + 19.2, 0, 0.5, 0.5, 0.5, 0xff2222);                                              // Flugwarnlicht
      const yc = back ? y1 : GH; // Eck-Neon am oberen Teil
      for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) glow(ex * (hw + 0.05), (yc + top) / 2, ez * (hd + 0.05), 0.28, top - yc, 0.28);
      for (const s of [-1, 1]) { glow(0, top + 0.3, s * (hd + 0.32), w + 0.7, 0.2, 0.12); glow(s * (hw + 0.32), top + 0.3, 0, 0.12, 0.2, d + 0.7); }
    } else if (style !== 'office') glow(0, top + 0.28, hd + 0.33, w * 0.94, 0.16, 0.1);             // Neonband an der Dachkante
    if (style === 'deco') {
      for (let f = 1; f < floors - 1; f++) { const y = GH + f * FH; P.plain.box(m, -hw - 0.28, hw + 0.28, y - 0.08, y + 0.08, -hd - 0.28, hd + 0.28, WHITE); } // Simse
      if (floors >= 3 && r() < 0.65) { // senkrechte Art-déco-Finne mit Neonröhre
        P.plain.box(m, -0.38, 0.38, GH + 0.4, top + 2.4, hd, hd + 0.75, WHITE);
        glow(0, (GH + 0.9 + top + 2.1) / 2, hd + 0.79, 0.14, top + 1.2 - GH, 0.08);
      }
    }
    if (!tower && floors >= 3 && style !== 'garage' && r() < 0.4) { // Wassertank aus Holz auf Stahlstelzen
      const x = (r() - 0.5) * (w - 5), z = (r() - 0.5) * (d - 5), y = top + 0.55;
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.plain.box(m, x + lx * 0.85 - 0.07, x + lx * 0.85 + 0.07, y, y + 1.7, z + lz * 0.85 - 0.07, z + lz * 0.85 + 0.07, IRON);
      P.plain.prism(m, x, z, 1.25, y + 1.7, y + 4.3, 12, WOOD, WOODTOP);
      P.plain.prism(m, x, z, 0.35, y + 4.3, y + 4.8, 6, IRON);
    }
    if (style === 'brick') {
      P.plain.box(m, -hw - 0.45, hw + 0.45, top - 0.6, top + 0.1, -hd - 0.45, hd + 0.45, STONE, ROOF); // Kranzgesims
      if (floors >= 3 && r() < 0.6) { // Feuertreppe vorn: Podest je Geschoss mit Geländer
        const fx = (r() < 0.5 ? -1 : 1) * Math.max(0, hw - 2.6);
        for (let f = 1; f < floors; f++) {
          const y = GH + (f - 1) * FH;
          P.plain.box(m, fx - 1.7, fx + 1.7, y - 0.06, y, hd, hd + 1.15, IRON);
          for (const yy of [y + 0.5, y + 1.0]) P.plain.box(m, fx - 1.7, fx + 1.7, yy - 0.03, yy + 0.03, hd + 1.1, hd + 1.15, IRON);
          for (const xx of [fx - 1.7, fx + 1.68]) P.plain.box(m, xx, xx + 0.04, y, y + FH, hd + 1.1, hd + 1.15, IRON);
        }
      }
    }
    if (style === 'garage') for (let k = 0; k < 3; k++) { // Autos auf dem Parkdeck
      const x = (r() - 0.5) * (w - 5), z = (r() - 0.5) * (d - 7), c = new THREE.Color(pick([0x8a1c1c, 0xd8d8d8, 0x1c3a6a, 0x2a2a2a, 0x9a9a9a, 0xc7a020]));
      P.plain.box(m, x - 0.9, x + 0.9, top + 0.55, top + 1.25, z - 2.1, z + 2.1, c); P.plain.box(m, x - 0.8, x + 0.8, top + 1.25, top + 1.85, z - 1.1, z + 0.9, c.clone().multiplyScalar(0.55));
    }
    if (style === 'hotel') { // Leuchtschild auf dem Dach, zur Küste
      P.plain.box(m, -hw * 0.45, hw * 0.45, top + 0.55, top + 4.2, hd - 1.2, hd - 0.9, DARK);
      glow(0, top + 2.4, hd - 0.85, hw * 0.85, 2.6, 0.08);
    }
    if (style === 'condo' || style === 'hotel') for (let f = 1; f < floors; f++) for (const s of [-1, 1]) { // Balkone vorn und hinten
      const y = GH + (f - 1) * FH, z0 = s * hd, z1 = s * (hd + 1.3);
      P.plain.box(m, -hw + 0.5, hw - 0.5, y - 0.14, y, Math.min(z0, z1), Math.max(z0, z1), WHITE);
      P.plain.box(m, -hw + 0.5, hw - 0.5, y, y + 1.05, Math.min(z1, z1 - s * 0.06), Math.max(z1, z1 - s * 0.06), RAIL);
    }
  }
  const mats = { deco: facade('deco', r), condo: facade('condo', r), office: facade('office', r), glass: facade('glass', r), brick: facade('brick', r), garage: facade('garage', r), shop: shopfront(r), plain: stdMat({ vertexColors: true, roughness: 0.85 }) };
  return { meshes: Object.keys(P).filter(k => P[k].p.length).map(k => P[k].mesh(mats[k])), heights, neon, lit: Object.values(mats).filter(m => m.emissiveMap) };
}

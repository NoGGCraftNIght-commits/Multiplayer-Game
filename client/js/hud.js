import * as THREE from 'three';
import { HALF, SIZE, BEACH, BLOCK, WALK, ROAD, RIVER, BRIDGES, BRIDGE_HALF, JUMPS, roadCenter } from './shared.js';

// HUD-Teile, die nur DOM/Canvas anfassen: Minikarte, Namensschilder, Sprechblasen, Meldungen, Punkteliste.
const $ = (id) => document.getElementById(id), { clamp } = THREE.MathUtils;
const _v = new THREE.Vector3();
const PAD = 140, ZOOM = 1.15; // Karte: 1 px = 1 m; PAD = Rand ums Stadtgebiet

export class Hud {
  constructor(city) {
    this.g = $('minimap').getContext('2d');
    this.bg = this.drawCity(city);
    this.bubbles = [];
  }

  // Stadtplan einmal vorzeichnen (x nach rechts, z nach unten)
  drawCity(city) {
    const c = document.createElement('canvas'); c.width = SIZE + BEACH + PAD * 2; c.height = SIZE + PAD * 2;
    const g = c.getContext('2d');
    g.fillStyle = '#2b3530'; g.fillRect(0, 0, c.width, c.height);
    g.translate(PAD + HALF, PAD + HALF); // ab hier Weltkoordinaten
    g.fillStyle = '#1d3550'; g.fillRect(HALF + BEACH, -HALF - PAD, PAD, c.height);
    g.fillStyle = '#5c5a4c'; g.fillRect(HALF, -HALF - PAD, BEACH, c.height);
    g.fillStyle = '#8a8f94'; g.fillRect(-HALF, -HALF, SIZE, SIZE);
    for (const b of city.blocks) {
      g.fillStyle = '#4b5056'; g.fillRect(b.x0, b.z0, BLOCK, BLOCK);
      g.fillStyle = b.type === 'park' ? '#33503a' : '#3b3f45'; g.fillRect(b.x0 + WALK, b.z0 + WALK, BLOCK - 2 * WALK, BLOCK - 2 * WALK);
    }
    const rh = RIVER.z1 - RIVER.z0; // Fluss, Brücken (Fahrbahn + Gehweg), gelbe Sprungrampen
    g.fillStyle = '#1d3550'; g.fillRect(-HALF, RIVER.z0, SIZE, rh);
    for (const c of BRIDGES) { g.fillStyle = '#4b5056'; g.fillRect(c - BRIDGE_HALF, RIVER.z0, 2 * BRIDGE_HALF, rh); g.fillStyle = '#8a8f94'; g.fillRect(c - ROAD / 2, RIVER.z0, ROAD, rh); }
    g.fillStyle = '#e0b020'; for (const i of JUMPS) for (const z of [RIVER.z0 - 6, RIVER.z1 + 3]) g.fillRect(roadCenter(i) - ROAD / 2, z, ROAD, 3);
    for (const b of city.buildings) { const s = b.fp; g.fillStyle = b.room ? '#3a3e46' : '#2e3136'; g.fillRect(s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0); } // Läden etwas heller
    return c;
  }

  // pos/yaw = ich; camYaw = Blickrichtung (zeigt auf der Karte nach oben); others = [{pos, color}]; cars = Fahrzeugliste
  minimap(pos, yaw, camYaw, others, cars, marks = []) {
    const g = this.g, W = g.canvas.width, H = g.canvas.height, cx = W / 2, cy = H * 0.66; // Spieler im unteren Drittel: mehr Sicht nach vorn
    const a = camYaw - Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#2b3530'; g.fillRect(0, 0, W, H);
    g.translate(cx, cy); g.rotate(a); g.scale(ZOOM, ZOOM); g.translate(-pos.x, -pos.z);
    g.drawImage(this.bg, -HALF - PAD, -HALF - PAD);
    for (const v of cars) if (v?.driver) { g.fillStyle = '#d8dade'; g.fillRect(v.pos.x - 1.6, v.pos.z - 1.6, 3.2, 3.2); }
    for (const m of marks) { g.beginPath(); g.arc(m.x, m.z, m.r, 0, 7); g.fillStyle = m.c; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#000'; g.stroke(); } // Waffenladen, Fundorte
    g.setTransform(1, 0, 0, 1, cx, cy);
    for (const o of others) { // Mitspieler außerhalb der Karte am Rand festhalten, damit man sich findet
      const x = clamp(((o.pos.x - pos.x) * ca - (o.pos.z - pos.z) * sa) * ZOOM, 7 - cx, W - cx - 7), y = clamp(((o.pos.x - pos.x) * sa + (o.pos.z - pos.z) * ca) * ZOOM, 7 - cy, H - cy - 7);
      g.beginPath(); g.arc(x, y, 5, 0, 7); g.fillStyle = o.color; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#000'; g.stroke();
    }
    g.rotate(a - yaw); g.beginPath(); g.moveTo(0, 9); g.lineTo(-6, -6); g.lineTo(0, -3); g.lineTo(6, -6); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#000'; g.stroke();
  }

  // Namensschild eines Mitspielers (Name + kleine Energieleiste)
  tag(name, color) {
    const el = Object.assign(document.createElement('div'), { className: 'tag' }), bar = Object.assign(document.createElement('span'), { className: 'mini' });
    el.style.color = color; bar.append(document.createElement('i')); el.append(name, bar);
    $('labels').append(el);
    return el;
  }

  // Element über einen Weltpunkt setzen; außerhalb von Sicht oder Reichweite ausblenden
  pin(el, pos, camera, max) {
    const on = pos.distanceToSquared(camera.position) < max * max && _v.copy(pos).project(camera).z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
    el.style.display = on ? '' : 'none';
    if (on) { el.style.left = (_v.x + 1) * innerWidth / 2 + 'px'; el.style.top = (1 - _v.y) * innerHeight / 2 + 'px'; }
  }

  // Sprechblase, die einem Weltpunkt folgt: at() liefert die Position (oder nichts = Blase weg)
  say(text, at, secs = 2.2) {
    const el = Object.assign(document.createElement('div'), { className: 'bubble', textContent: text });
    $('labels').append(el);
    this.bubbles.push({ el, at, until: performance.now() + secs * 1000 });
  }

  update(camera) {
    const now = performance.now();
    this.bubbles = this.bubbles.filter(b => {
      const p = now < b.until && b.at();
      if (!p) { b.el.remove(); return false; }
      this.pin(b.el, p, camera, 45);
      return true;
    });
  }

  feed(text) {
    const box = $('feed'), d = Object.assign(document.createElement('div'), { textContent: text });
    box.append(d);
    if (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  scores(list, myId) {
    const td = (t) => Object.assign(document.createElement('td'), { textContent: t });
    const rows = [{ name: 'Spieler', score: 'Punkte', kos: 'Nass', head: true }, ...list.sort((a, b) => b.score - a.score)];
    $('scores').replaceChildren(...rows.map(p => {
      const tr = document.createElement('tr'), dot = td(p.head ? '' : '●');
      dot.style.color = p.color || '';
      if (p.head) tr.style.opacity = 0.6; else if (p.id === myId) tr.style.color = '#ffd23f';
      tr.append(dot, td(p.name), td(p.score), td(p.kos));
      return tr;
    }));
  }
}

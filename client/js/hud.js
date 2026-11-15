import * as THREE from 'three';
import { HALF, SIZE, BEACH, BLOCK, WALK } from './shared.js';

// HUD-Teile, die nur DOM/Canvas anfassen: Minikarte, Namensschilder, Sprechblasen, Meldungen, Punkteliste.
const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const PAD = 100, ZOOM = 1.15, R = 90; // Karte: 1 px = 1 m; PAD = Rand ums Stadtgebiet; R = halbe Kartenbreite

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
    g.fillStyle = '#6fae62'; g.fillRect(0, 0, c.width, c.height);
    g.translate(PAD + HALF, PAD + HALF); // ab hier Weltkoordinaten
    g.fillStyle = '#1fa9bd'; g.fillRect(HALF + BEACH, -HALF - PAD, PAD, c.height);
    g.fillStyle = '#ecd9a8'; g.fillRect(HALF, -HALF - PAD, BEACH, c.height);
    g.fillStyle = '#454a57'; g.fillRect(-HALF, -HALF, SIZE, SIZE);
    for (const b of city.blocks) {
      g.fillStyle = '#b9b4aa'; g.fillRect(b.x0, b.z0, BLOCK, BLOCK);
      g.fillStyle = b.type === 'park' ? '#5fb45a' : '#928d85'; g.fillRect(b.x0 + WALK, b.z0 + WALK, BLOCK - 2 * WALK, BLOCK - 2 * WALK);
    }
    g.fillStyle = '#ded3ea';
    city.solids.slice(0, city.buildings.length).forEach(s => g.fillRect(s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0));
    return c;
  }

  // pos/yaw = ich; camYaw = Blickrichtung (zeigt auf der Karte nach oben); others = [{pos, color}]; cars = Fahrzeugliste
  minimap(pos, yaw, camYaw, others, cars) {
    const g = this.g, a = camYaw - Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#6fae62'; g.fillRect(0, 0, 2 * R, 2 * R);
    g.translate(R, R); g.rotate(a); g.scale(ZOOM, ZOOM); g.translate(-pos.x, -pos.z);
    g.drawImage(this.bg, -HALF - PAD, -HALF - PAD);
    for (const v of cars) if (v) { g.fillStyle = v.driver ? '#ffffff' : '#1d2029'; g.fillRect(v.pos.x - 1.6, v.pos.z - 1.6, 3.2, 3.2); }
    g.setTransform(1, 0, 0, 1, R, R);
    for (const o of others) { // Mitspieler außerhalb der Karte am Rand festhalten, damit man sich findet
      let x = ((o.pos.x - pos.x) * ca - (o.pos.z - pos.z) * sa) * ZOOM, y = ((o.pos.x - pos.x) * sa + (o.pos.z - pos.z) * ca) * ZOOM;
      const d = Math.hypot(x, y); if (d > R - 8) { x *= (R - 8) / d; y *= (R - 8) / d; }
      g.beginPath(); g.arc(x, y, 5, 0, 7); g.fillStyle = o.color; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke();
    }
    g.rotate(a - yaw); g.beginPath(); g.moveTo(0, 8); g.lineTo(-5.5, -6); g.lineTo(0, -3); g.lineTo(5.5, -6); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#18203a'; g.stroke();
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

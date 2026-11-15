// Einheitliche Eingabe: Tastatur/Maus ODER Touch. Wechselt automatisch je nach zuletzt
// benutztem Gerät (Touch-Bedienelemente werden nur bei Touch eingeblendet).
const $ = (id) => document.getElementById(id);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.edges = new Set();
    this.look = { x: 0, y: 0 };
    this.stick = { x: 0, y: 0 };
    this.fireHeld = false; this.aimHeld = false; this.aimToggle = false;
    this.sens = 1;
    this.enabled = false;
    this.mode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop';
    this.setMode(this.mode);
    this.bindDesktop();
    this.bindTouch();
  }

  setMode(m) {
    this.mode = m;
    document.body.classList.toggle('touch', m === 'touch');
    $('touch').classList.toggle('hidden', m !== 'touch');
  }

  pressed(name) { const h = this.edges.has(name); this.edges.delete(name); return h; }
  consumeLook() { const l = { x: this.look.x, y: this.look.y }; this.look.x = this.look.y = 0; return l; }

  get move() {
    if (this.mode === 'touch') return { x: this.stick.x, y: -this.stick.y };
    const k = this.keys;
    return { x: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      y: (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) };
  }
  get sprint() { return this.mode === 'touch' ? Math.hypot(this.stick.x, this.stick.y) > 0.92 : this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  get fire() { return this.fireHeld; }
  get aim() { return this.aimHeld || this.aimToggle; }
  get handbrake() { return this.keys.has('Space') || this.touchJumpHeld; }
  get scoreboard() { return this.keys.has('Tab') || this.touchScore; }

  bindDesktop() {
    const map = { KeyF: 'enter', KeyY: 'enter', KeyE: 'interact', Space: 'jump', KeyQ: 'weaponNext', KeyH: 'horn', KeyG: 'emoteYes', KeyN: 'emoteNo', KeyR: 'reload',
      Digit1: 'w0', Digit2: 'w1', Digit3: 'w2', Digit4: 'w3', Escape: 'pause', KeyP: 'pause', KeyT: 'flip' };
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (this.mode !== 'desktop') this.setMode('desktop');
      if (this.enabled && (e.code === 'Tab' || e.code === 'Space')) e.preventDefault();
      if (!e.repeat && map[e.code]) this.edges.add(map[e.code]);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.fireHeld = this.aimHeld = false; });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || !this.enabled) return;
      if (this.mode !== 'desktop') this.setMode('desktop');
      if (document.pointerLockElement !== this.canvas) { this.canvas.requestPointerLock?.(); return; }
      if (e.button === 0) this.fireHeld = true;
      if (e.button === 2) this.aimHeld = true;
    });
    addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') { if (e.button === 0) this.fireHeld = false; if (e.button === 2) this.aimHeld = false; } });
    addEventListener('contextmenu', (e) => e.preventDefault());
    // direkt nach dem Fangen meldet der Browser einen Sprung (Cursor wird zentriert) -> kurz ignorieren
    document.addEventListener('pointerlockchange', () => { this.lockT = performance.now(); });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas && performance.now() - this.lockT > 150) { this.look.x += e.movementX * 0.0022 * this.sens; this.look.y += e.movementY * 0.0022 * this.sens; }
    });
    addEventListener('wheel', (e) => { if (this.enabled) this.edges.add(e.deltaY > 0 ? 'weaponNext' : 'weaponPrev'); }, { passive: true });
  }

  bindTouch() {
    const stick = $('stick'), knob = stick.querySelector('i');
    let sid = null;
    const toTouch = (e) => { if (e.pointerType === 'touch' && this.mode !== 'touch') this.setMode('touch'); };
    addEventListener('pointerdown', toTouch, true);
    const setStick = (e) => {
      const r = stick.getBoundingClientRect(), R = r.width / 2;
      let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      this.stick.x = x; this.stick.y = y;
      knob.style.transform = `translate(${x * R * 0.7}px, ${y * R * 0.7}px)`;
    };
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(sid); setStick(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setStick(e); });
    const endStick = (e) => { if (e.pointerId !== sid) return; sid = null; this.stick.x = this.stick.y = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);

    // Blick: Wischen in der rechten Hälfte (und während Feuer gehalten wird)
    const dragLook = (el, onDown, onUp) => {
      const last = new Map();
      el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); last.set(e.pointerId, [e.clientX, e.clientY]); onDown?.(); e.preventDefault(); });
      el.addEventListener('pointermove', (e) => {
        const p = last.get(e.pointerId); if (!p) return;
        this.look.x += (e.clientX - p[0]) * 0.0055 * this.sens; this.look.y += (e.clientY - p[1]) * 0.0055 * this.sens;
        last.set(e.pointerId, [e.clientX, e.clientY]);
      });
      const up = (e) => { if (last.delete(e.pointerId)) onUp?.(); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    };
    dragLook($('lookzone'));
    dragLook($('tFire'), () => { this.fireHeld = true; $('tFire').classList.add('on'); }, () => { this.fireHeld = false; $('tFire').classList.remove('on'); });
    const tap = (id, edge) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); this.edges.add(edge); });
    tap('tEnter', 'enter'); tap('tWeapon', 'weaponNext'); tap('tAct', 'interact'); tap('tHorn', 'horn'); tap('pauseBtn', 'pause');
    const j = $('tJump');
    j.addEventListener('pointerdown', (e) => { e.preventDefault(); this.edges.add('jump'); this.touchJumpHeld = true; });
    const ju = () => { this.touchJumpHeld = false; }; j.addEventListener('pointerup', ju); j.addEventListener('pointercancel', ju);
    $('tAim').addEventListener('pointerdown', (e) => { e.preventDefault(); this.aimToggle = !this.aimToggle; $('tAim').classList.toggle('on', this.aimToggle); });
    const sc = $('tScore');
    sc.addEventListener('pointerdown', () => { this.touchScore = true; }); sc.addEventListener('pointerup', () => { this.touchScore = false; }); sc.addEventListener('pointercancel', () => { this.touchScore = false; });
  }
}

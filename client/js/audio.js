import { assets } from './assets.js';

// Kleine WebAudio-Schicht: Samples mit Entfernungsdämpfung + Stereo, synthetischer Motor & Hupe.
export class Audio {
  constructor() { this.enabled = true; this.buffers = {}; this.listener = { x: 0, z: 0, yaw: 0 }; }

  async unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain(); this.master.gain.value = this.enabled ? 0.7 : 0; this.master.connect(this.ctx.destination);
    for (const [n, buf] of Object.entries(assets.sounds)) {
      try { this.buffers[n] = await this.ctx.decodeAudioData(buf.slice(0)); } catch { /* Format nicht unterstützt (z. B. ältere Safari) -> stumm */ }
    }
  }

  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.7 : 0; }

  play(name, { pos = null, vol = 1, rate = 1 } = {}) {
    const b = this.buffers[name]; if (!b || !this.ctx) return;
    let g = vol, pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z, d = Math.hypot(dx, dz);
      g *= 1 / (1 + d * d * 0.004); if (g < 0.02) return;
      const ang = Math.atan2(dx, dz) - this.listener.yaw; pan = Math.max(-1, Math.min(1, -Math.sin(ang)));
    }
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const gain = this.ctx.createGain(); gain.gain.value = g;
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; s.connect(gain).connect(p).connect(this.master); } else s.connect(gain).connect(this.master);
    s.start();
  }

  engine(on, speed = 0, throttle = 0) {
    if (!this.ctx) return;
    if (on && !this.eng) {
      const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g).connect(this.master); o.start(); o2.start();
      this.eng = { o, o2, f, g };
    }
    if (!this.eng) return;
    const t = this.ctx.currentTime, gear = Math.abs(speed) % 12 / 12;
    const hz = 40 + gear * 70 + Math.min(Math.abs(speed), 50) * 1.2;
    this.eng.o.frequency.setTargetAtTime(hz, t, 0.05); this.eng.o2.frequency.setTargetAtTime(hz * 0.5, t, 0.05);
    this.eng.f.frequency.setTargetAtTime(400 + Math.abs(throttle) * 900, t, 0.1);
    this.eng.g.gain.setTargetAtTime(on ? 0.06 + Math.abs(throttle) * 0.05 : 0, t, 0.1);
  }

  // Hubschrauber: tiefes Knattern, leiser mit der Entfernung (dist < 0 = aus)
  rotor(dist) {
    if (!this.ctx || (dist < 0 && !this.rot)) return;
    if (!this.rot) {
      const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 19; f.type = 'lowpass'; f.frequency.value = 260; g.gain.value = 0;
      o.connect(f).connect(g).connect(this.master); o.start();
      this.rot = g;
    }
    this.rot.gain.setTargetAtTime(dist < 0 ? 0 : 0.5 / (1 + dist * dist * 0.0004), this.ctx.currentTime, 0.2);
  }

  horn(pos) {
    if (!this.ctx) return;
    let g = 0.25;
    if (pos) { const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z); g /= 1 + d * d * 0.003; }
    const t = this.ctx.currentTime, gain = this.ctx.createGain();
    gain.gain.setValueAtTime(g, t); gain.gain.setTargetAtTime(0, t + 0.35, 0.05); gain.connect(this.master);
    for (const f of [392, 494]) { const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(gain); o.start(t); o.stop(t + 0.6); }
  }
}

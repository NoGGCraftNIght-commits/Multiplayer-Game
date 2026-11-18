import { assets } from './assets.js';

// Waffenklänge aus Code (keine Fremdaufnahmen): Knall = Rauschen, Wumms = fallender Sinus, Hall + Echo von den Hauswänden.
// je Waffe: [Knall ms, Wumms Hz, Wumms s, Hall s, Lautstärke, Echo]
const GUN_SFX = [[12, 140, 0.08, 0.55, 0.8, 0.3], [7, 175, 0.05, 0.4, 0.62, 0.25], [32, 72, 0.17, 1.1, 1, 0.38], [9, 105, 0.09, 0.85, 0.92, 0.34]];
function buffer(ctx, sec, fn) {
  const sr = ctx.sampleRate, b = ctx.createBuffer(2, Math.ceil(sr * sec), sr);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); fn(d, sr); for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i]); }
  return b;
}
// kurzes Metallgeräusch (Klick, Klack, Hülse) bei Sekunde at
function clack(d, sr, at, amp, freqs, decay) {
  const i0 = Math.floor(at * sr), n = Math.min(d.length - i0, Math.floor(decay * 6 * sr));
  for (let i = 0; i < n; i++) {
    const t = i / sr, e = Math.exp(-t / decay);
    let v = (Math.random() * 2 - 1) * Math.exp(-t / 0.002);
    for (const f of freqs) v += Math.sin(6.283 * f * t) * 0.5;
    d[i0 + i] += amp * v * e;
  }
}
// Autoradio: eigene Sender, Musik live aus Oszillatoren (keine Aufnahmen). Akkorde als MIDI-Noten, je Takt einer.
export const STATIONS = [
  { name: 'Radio aus' },
  { name: 'Neon 88 FM', bpm: 112, prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], arp: [0, 2, 1, 2, 0, 2, 1, 2], four: false, bass: 'sawtooth', lead: 'square' },
  { name: 'Kassette 101', bpm: 124, prog: [[50, 53, 57], [46, 50, 53], [48, 51, 55], [45, 48, 52]], arp: [0, 1, 2, 1, 2, 0, 2, 1], four: true, bass: 'square', lead: 'triangle' },
];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function makeSfx(ctx) {
  const out = {};
  GUN_SFX.forEach(([crack, hz, boom, tail, vol, echo], k) => out['gun' + k] = buffer(ctx, tail + 0.25, (d, sr) => {
    let prev = 0, lp = 0, ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, w = Math.random() * 2 - 1;
      const c = (w - prev) * Math.exp(-t * 1000 / crack); prev = w;
      lp += (w - lp) * 0.05; ph += 6.283 * hz * (1 + 1.6 * Math.exp(-t * 35)) / sr;
      d[i] = c * 0.9 + Math.sin(ph) * Math.exp(-t / boom) * 1.3 + lp * Math.exp(-t / (tail * 0.28)) * Math.min(1, t * 80) * 2.4;
    }
    const e = Math.floor(sr * 0.12); // Echo: rückwärts, damit es nur einmal widerhallt
    for (let i = d.length - 1; i >= e; i--) d[i] += d[i - e] * echo;
    for (let i = 0; i < d.length; i++) d[i] *= vol * 1.4;
  }));
  out.click = buffer(ctx, 0.08, (d, sr) => clack(d, sr, 0, 0.5, [2400, 3900], 0.006));
  out.reload = buffer(ctx, 1.2, (d, sr) => { clack(d, sr, 0.04, 0.5, [900, 1700], 0.012); clack(d, sr, 0.5, 0.8, [600, 1300], 0.02); clack(d, sr, 0.95, 0.7, [1100, 2300], 0.015); });
  out.pump = buffer(ctx, 0.45, (d, sr) => { clack(d, sr, 0, 0.8, [500, 1150], 0.025); clack(d, sr, 0.2, 0.9, [650, 1400], 0.022); });
  out.casing = buffer(ctx, 0.4, (d, sr) => { clack(d, sr, 0, 0.35, [3150, 4700, 6250], 0.03); clack(d, sr, 0.12, 0.2, [3150, 4700, 6250], 0.025); clack(d, sr, 0.2, 0.1, [3150, 4700], 0.02); });
  out.flesh = buffer(ctx, 0.15, (d, sr) => { let lp = 0; for (let i = 0; i < d.length; i++) { const t = i / sr; lp += (Math.random() * 2 - 1 - lp) * 0.08; d[i] = (lp * 3 + Math.sin(6.283 * 85 * t)) * Math.exp(-t / 0.03) * 0.8; } });
  out.ricochet = buffer(ctx, 0.5, (d, sr) => {
    let ph = 0;
    for (let i = 0; i < d.length; i++) { const t = i / sr; ph += 6.283 * (2700 - 1500 * t / 0.5 + 60 * Math.sin(t * 90)) / sr; d[i] = Math.sin(ph) * 0.35 * Math.exp(-t / 0.15) + (Math.random() * 2 - 1) * Math.exp(-t / 0.004) * 0.6; }
  });
  out.bimpact = buffer(ctx, 0.12, (d, sr) => { let lp = 0; for (let i = 0; i < d.length; i++) { const t = i / sr, w = Math.random() * 2 - 1; lp += (w - lp) * 0.25; d[i] = (w * Math.exp(-t / 0.003) + lp * 1.5 * Math.exp(-t / 0.025)) * 0.7; } });
  return out;
}

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
    Object.assign(this.buffers, makeSfx(this.ctx));
  }

  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.7 : 0; }

  // fall = Abnahme mit der Entfernung (Schüsse tragen weit), muffle = in der Ferne dumpfer
  play(name, { pos = null, vol = 1, rate = 1, delay = 0, fall = 0.004, muffle = false } = {}) {
    const b = this.buffers[name]; if (!b || !this.ctx) return;
    let g = vol, pan = 0, d = 0;
    if (pos) {
      const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z; d = Math.hypot(dx, dz);
      g *= 1 / (1 + d * d * fall); if (g < 0.02) return;
      const ang = Math.atan2(dx, dz) - this.listener.yaw; pan = Math.max(-1, Math.min(1, -Math.sin(ang)));
    }
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const gain = this.ctx.createGain(); gain.gain.value = g;
    let n = s;
    if (muffle && d > 8) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 18000 / (1 + d / 15); n = n.connect(f); }
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; n.connect(gain).connect(p).connect(this.master); } else n.connect(gain).connect(this.master);
    s.start(this.ctx.currentTime + delay);
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

  // Sender i einschalten (0 = aus); geplant wird in 25-ms-Schritten 0,12 s voraus
  radio(i) {
    if (!this.ctx) return;
    this.station = i;
    if (!this.rbus) {
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3800; // klingt nach Autolautsprecher
      this.rbus = this.ctx.createGain(); this.rbus.gain.value = 0; this.rbus.connect(f).connect(this.master);
      const n = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate), d = n.getChannelData(0); for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
      this.noise = n;
    }
    this.rbus.gain.setTargetAtTime(i ? 0.2 : 0, this.ctx.currentTime, 0.1);
    clearInterval(this.rtimer); this.rtimer = null;
    if (!i) return;
    this.rnext = this.ctx.currentTime + 0.05; this.rstep = 0;
    this.rtimer = setInterval(() => { const S = STATIONS[this.station], sp = 15 / S.bpm; while (this.rnext < this.ctx.currentTime + 0.12) { this.beat(S, this.rstep++, this.rnext, sp); this.rnext += sp; } }, 25);
  }

  // eine Sechzehntel: Bassdrum, Snare, Hi-Hat, Bass, Arpeggio, Flächenakkord
  beat(S, k, t, sp) {
    const ch = S.prog[Math.floor(k / 16) % S.prog.length], s = k % 16;
    const tone = (type, hz, at, len, vol, cut = 0) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.value = hz;
      g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + len);
      if (cut) { const f = this.ctx.createBiquadFilter(); f.frequency.value = cut; o.connect(f).connect(g); } else o.connect(g);
      g.connect(this.rbus); o.start(at); o.stop(at + len + 0.02);
      return o;
    };
    const hiss = (at, len, vol, hp) => { const n = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); n.buffer = this.noise; f.type = 'highpass'; f.frequency.value = hp; g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + len); n.connect(f).connect(g).connect(this.rbus); n.start(at, Math.random() * 0.5); n.stop(at + len + 0.02); };
    if (S.four ? s % 4 === 0 : s === 0 || s === 8 || s === 10) { const o = tone('sine', 150, t, 0.28, 0.9); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); }
    if (s === 4 || s === 12) { hiss(t, 0.32, 0.5, 900); tone('triangle', 190, t, 0.1, 0.3); } // Snare mit langem Hall der Zeit
    if (s % 2 === 0) hiss(t, 0.04, 0.12, 7000);
    if (s % 2 === 0) tone(S.bass, mtof(ch[0] - 24 + (s % 8 === 6 ? 12 : 0)), t, sp * 1.7, 0.22, 900);
    tone(S.lead, mtof(ch[S.arp[s % 8]] + 12), t, sp * 0.9, 0.05, 2600);
    if (s === 0) for (const m of ch) for (const det of [-6, 6]) { const o = tone('sawtooth', mtof(m), t, sp * 15, 0.035, 1400); o.detune.value = det; }
  }

  // Polizeisirene: auf- und abschwellender Heulton der nächsten Sirene (dist < 0 = aus)
  siren(dist) {
    if (!this.ctx || (dist < 0 && !this.sir)) return;
    if (!this.sir) {
      const o = this.ctx.createOscillator(), lfo = this.ctx.createOscillator(), depth = this.ctx.createGain(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 950; lfo.frequency.value = 0.55; depth.gain.value = 380; f.type = 'lowpass'; f.frequency.value = 2400; g.gain.value = 0;
      lfo.connect(depth).connect(o.frequency); o.connect(f).connect(g).connect(this.master); o.start(); lfo.start();
      this.sir = g;
    }
    this.sir.gain.setTargetAtTime(dist < 0 ? 0 : 0.11 / (1 + dist * dist * 0.0015), this.ctx.currentTime, 0.15);
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

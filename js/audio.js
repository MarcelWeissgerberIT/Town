// Procedural soundscape: everything is synthesised with WebAudio, no files.
export class Soundscape {
  constructor() {
    this.on = false;
    this.ctx = null;
    this.timers = { bird: 1, cricket: 0, site: 2 };
    this.lastHour = -1;
  }
  enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.7; this.master.connect(c.destination);
      // noise buffer shared by all noisy sounds
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      this.white = c.createBuffer(1, len, c.sampleRate);
      const wd = this.white.getChannelData(0);
      for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
      // city bed: filtered brown noise
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      this.bed = c.createGain(); this.bed.gain.value = 0;
      src.connect(lp); lp.connect(this.bed); this.bed.connect(this.master);
      src.start();
    }
    this.ctx.resume?.();
    this.on = true;
    return true;
  }
  disable() { this.on = false; if (this.ctx) this.ctx.suspend?.(); }
  toggle() { return this.on ? (this.disable(), false) : this.enable(); }

  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  tone(freq, type, t, a, peak, dec, dest = this.master, glide = null) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + a + dec);
    this.env(g, t, a, peak, dec);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + dec + 0.05);
  }
  burst(t, f, q, peak, dec, buf = this.white) {
    const c = this.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    this.env(g, t, 0.004, peak, dec);
    s.connect(bp); bp.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dec + 0.05);
  }

  bird(vol) {
    const t = this.ctx.currentTime;
    const base = 2600 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const st = t + i * (0.09 + Math.random() * 0.05);
      this.tone(base * (0.9 + Math.random() * 0.25), 'sine', st, 0.01, 0.05 * vol, 0.07, this.master, base * (1.2 + Math.random() * 0.4));
    }
  }
  cricket(vol) {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this.tone(4300 + Math.random() * 200, 'sine', t + i * 0.06, 0.005, 0.018 * vol, 0.04);
  }
  clank(vol) {
    const t = this.ctx.currentTime;
    const hits = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < hits; i++) {
      const st = t + i * 0.32;
      this.burst(st, 1800 + Math.random() * 900, 6, 0.14 * vol, 0.09);
      this.tone(720 + Math.random() * 300, 'triangle', st, 0.002, 0.05 * vol, 0.12);
    }
  }
  bells(count, vol) {
    const t = this.ctx.currentTime;
    for (let i = 0; i < count; i++) {
      const st = t + i * 1.9;
      for (const [r, a] of [[1, 0.09], [2, 0.04], [2.76, 0.03], [5.4, 0.012]]) this.tone(392 * r, 'sine', st, 0.006, a * vol, 3.2);
    }
  }

  play(name) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (name === 'click') this.tone(1300, 'sine', t, 0.002, 0.04, 0.05);
    else if (name === 'build') { this.tone(150, 'sine', t, 0.004, 0.25, 0.22, this.master, 70); this.burst(t, 600, 1.5, 0.08, 0.15, this.noise); }
    else if (name === 'zone') this.tone(660, 'triangle', t, 0.005, 0.06, 0.12, this.master, 880);
    else if (name === 'tree') this.tone(520, 'sine', t, 0.004, 0.06, 0.14, this.master, 780);
    else if (name === 'demolish') { this.burst(t, 300, 0.8, 0.3, 0.45, this.noise); this.burst(t + 0.08, 900, 1.2, 0.12, 0.3); }
    else if (name === 'fanfare') [523, 659, 784, 1046].forEach((f, i) => { this.tone(f, 'triangle', t + i * 0.14, 0.01, 0.12, i === 3 ? 0.9 : 0.25); this.tone(f / 2, 'sine', t + i * 0.14, 0.01, 0.06, 0.3); });
  }

  // ambient layer, driven by the time of day and what is visible
  update(dt, s) {
    if (!this.on || !this.ctx) return;
    const zoom = Math.min(1, Math.max(0, (s.ppu - 6) / 40));
    const day = s.hour > 5 && s.hour < 20.5;
    const target = (0.025 + Math.min(1, s.cars / 30) * 0.07) * (0.4 + zoom * 0.6) * (s.paused ? 0.3 : 1);
    this.bed.gain.setTargetAtTime(target, this.ctx.currentTime, 0.6);
    if (s.paused) return;
    this.timers.bird -= dt; this.timers.cricket -= dt; this.timers.site -= dt;
    if (day && this.timers.bird <= 0) { this.timers.bird = 0.6 + Math.random() * (3.5 - s.trees * 2); if (zoom > 0.1) this.bird(0.4 + zoom * 0.8); }
    if (!day && this.timers.cricket <= 0) { this.timers.cricket = 0.35 + Math.random() * 0.6; this.cricket(0.5 + zoom); }
    if (s.sites > 0 && day && this.timers.site <= 0) { this.timers.site = 1.2 + Math.random() * 3 / s.sites; if (zoom > 0.15) this.clank(zoom); }
    const h = Math.floor(s.hour);
    if (h !== this.lastHour) {
      if (this.lastHour >= 0 && s.church && h >= 7 && h <= 21 && zoom > 0.05) this.bells(Math.min(6, h % 12 || 12), 0.6 + zoom * 0.6);
      this.lastHour = h;
    }
  }
}

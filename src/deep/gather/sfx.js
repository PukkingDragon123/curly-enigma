// Sounds of gathering, built from the game's synth (Audio.tone / noise) and its presets: soil
// crunching under the paw, roots tearing like stitches, a stem's creak rising toward the snap,
// a wet POP as it comes free, berry plips that climb with a streak.
export class GatherSfx {
  constructor(audio) {
    this.a = audio;
  }
  play(name, o) { try { this.a?.play?.(name, o); } catch (e) { /* no audio */ } }
  tone(o) { try { this.a?.tone?.(o); } catch (e) { /* no audio */ } }
  noise(o) { try { this.a?.noise?.(o); } catch (e) { /* no audio */ } }

  grip() { this.noise({ color: 'pink', filter: 'bandpass', f: 1400, q: 0.9, dur: 0.08, vol: 0.12 }); this.tone({ f: 140, f2: 110, type: 'triangle', dur: 0.06, vol: 0.05 }); }
  /** Soil shifting under a wiggle (amp 0..1.6). */
  scrunch(amp = 1) {
    this.noise({ color: 'brown', filter: 'lowpass', f: 420 + Math.random() * 200, dur: 0.11, vol: 0.1 + amp * 0.06 });
    this.noise({ color: 'pink', filter: 'bandpass', f: 2600 + Math.random() * 900, q: 2, dur: 0.05, vol: 0.04 + amp * 0.03, delay: 0.02 });
  }
  /** The soil cracking open a bit more. */
  crack() {
    for (let i = 0; i < 3; i++) this.noise({ color: 'white', filter: 'bandpass', f: 1800 + i * 500, q: 3, dur: 0.03, vol: 0.06, delay: i * 0.035 });
    this.tone({ f: 90, f2: 60, type: 'sine', dur: 0.12, vol: 0.08 });
  }
  loose() { this.play('ding', { vol: 0.35 }); this.tone({ f: 660, f2: 990, type: 'triangle', dur: 0.12, vol: 0.05, delay: 0.05 }); }
  /** A root tearing free: a fibrous rip, sharper when it snaps instead of slipping out. */
  root(rip, n = 0) {
    const f = 1200 + n * 120;
    for (let i = 0; i < (rip ? 5 : 3); i++) this.noise({ color: 'white', filter: 'bandpass', f: f + Math.random() * 1200, q: 2.5, dur: 0.025, vol: rip ? 0.11 : 0.07, delay: i * 0.028 });
    this.noise({ color: 'brown', filter: 'lowpass', f: 500, dur: 0.14, vol: 0.09, delay: 0.02 });
    if (rip) this.tone({ f: 260, f2: 120, type: 'sawtooth', dur: 0.06, vol: 0.04, filter: 'lowpass', ff: 1400 });
    else this.tone({ f: 420 + n * 40, f2: 620 + n * 40, type: 'triangle', dur: 0.05, vol: 0.035 });
  }
  /** The stem creaking under strain (k 0..1). */
  creak(k) {
    this.tone({ f: 90 + k * 220, f2: 70 + k * 160, type: 'sawtooth', dur: 0.14, vol: 0.04 + k * 0.05, filter: 'lowpass', ff: 900 + k * 600 });
    if (k > 0.6) this.noise({ color: 'white', filter: 'highpass', f: 3500, dur: 0.04, vol: 0.04 });
  }
  /** The good band: a soft chime the first time the needle settles in. */
  band() { this.tone({ f: 784, type: 'sine', dur: 0.08, vol: 0.035 }); }
  pop(perfect) {
    this.play('bloop', { pitch: 1.15 });
    this.noise({ color: 'brown', filter: 'lowpass', f: 900, f2: 200, dur: 0.22, vol: 0.18 });
    this.tone({ f: 300, f2: 900, type: 'square', dur: 0.1, vol: 0.06, filter: 'lowpass', ff: 2600 });
    this.play('pickup', { pitch: 1.1 });
    if (perfect) { this.play('perfect', { vol: 0.55 }); this.play('sparkle', { vol: 0.5 }); }
  }
  snap() {
    this.play('crack', { vol: 0.7 });
    this.noise({ color: 'white', filter: 'bandpass', f: 2200, q: 1.2, dur: 0.12, vol: 0.18 });
    this.play('oops', { vol: 0.5 });
  }
  /** Fibres stretching while you hold tension (call every frame): soft ticks that quicken and rise. */
  tension(dt, k, strain = 0) {
    this.tickT = (this.tickT ?? 0) - dt;
    if (k < 0.12 || this.tickT > 0) return;
    this.tickT = 0.34 - Math.min(0.22, k * 0.17) - strain * 0.06;
    this.noise({ color: 'pink', filter: 'bandpass', f: 700 + k * 900 + strain * 900, q: 3, dur: 0.035, vol: 0.025 + k * 0.025 + strain * 0.03 });
  }
  stop() { this.tickT = 0; }
  // ---- picking
  beat(ripe) { this.tone({ f: ripe ? 520 : 330, type: 'triangle', dur: 0.05, vol: 0.03 }); }
  pick(perfect, n) {
    const f = 660 * Math.pow(1.06, Math.min(12, n));
    this.tone({ f, f2: f * 1.5, type: 'square', dur: 0.06, vol: 0.06, filter: 'lowpass', ff: 3200 });
    this.noise({ color: 'pink', filter: 'bandpass', f: 1800, q: 1.5, dur: 0.05, vol: 0.08 });
    if (perfect) this.tone({ f: f * 2, type: 'sine', dur: 0.12, vol: 0.05, delay: 0.05 });
  }
  squash() { this.play('squish', { vol: 0.5 }); this.noise({ color: 'pink', filter: 'lowpass', f: 700, dur: 0.12, vol: 0.14 }); }
  miss() { this.tone({ f: 260, f2: 200, type: 'triangle', dur: 0.1, vol: 0.04 }); }
  // ---- peeling / digging / lifting / hazards
  peel(v) { this.noise({ color: 'pink', filter: 'bandpass', f: 900 + v * 3000, q: 1.2, dur: 0.06, vol: 0.05 + Math.min(0.08, v * 0.15) }); }
  tear() { this.noise({ color: 'white', filter: 'bandpass', f: 1800, q: 1.4, dur: 0.18, vol: 0.18 }); }
  dig() { this.noise({ color: 'brown', filter: 'lowpass', f: 600, dur: 0.14, vol: 0.14 }); this.noise({ color: 'pink', filter: 'bandpass', f: 2200, q: 2, dur: 0.06, vol: 0.06, delay: 0.03 }); }
  exposed() { this.play('ding', { vol: 0.45 }); }
  eggCrack() { this.play('crack', { vol: 0.6 }); this.play('oops', { vol: 0.45 }); }
  wobble(k) { this.tone({ f: 200 + k * 80, f2: 180, type: 'triangle', dur: 0.05, vol: 0.02 + k * 0.02 }); }
  spore() { this.play('sneeze', { vol: 0.5 }); }
  burn() { this.play('sizzle'); this.play('hurt', { vol: 0.5 }); }
  numb() { this.play('freeze', { vol: 0.6 }); }
  crackle() { this.play('buzz', { vol: 0.4 }); }
  zap(hit) { this.play('zap', { vol: 0.6 }); if (hit) this.play('hurt', { vol: 0.5 }); }
  result(q, p) { if (p) this.play('success', { vol: 0.5 }); else if (q >= 70) this.play('good', { vol: 0.45 }); }
  whoosh() { this.play('whoosh', { vol: 0.35 }); }
}

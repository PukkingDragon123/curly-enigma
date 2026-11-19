// Old Star shows how (wave 18): the lessons teach by his example, not by cards. He mimes the step
// in front of you (pump the bellows, hammer, quench, grind, level a blade; chop, crack, stir,
// season; swing a pick) for a couple of seconds, each blow with its own sound and, through `onBeat`,
// its sparks or chips; then you copy him. Used by the forge lesson (src/forge/tutorial.js), the
// cooking lesson (src/cooking/lesson.js) and the home lessons' digging demonstration (lessons.js).
//   const d = new StarDemo(rig, { audio, onBeat(kind, i) });  d.play('hammer', 2.6)
//   per frame, AFTER rig.update(dt): d.apply(dt)        (poses over the rig; nothing allocated)
// A rig whose own update reads swingPhase ('swing' state) can be driven with d.swing(dt) instead.
const smooth = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };

/** Per kind: the beat (s between blows), the sound of each blow, the pose (k = 0..1 through a beat). */
const KINDS = {
  pump: { beat: 0.95, snd: ['bellows', { vol: 0.55 }] },
  hammer: { beat: 0.72, snd: ['clang', { vol: 0.5 }] },
  quench: { beat: 1.5, snd: ['sizzle', { vol: 0.6 }] },
  grind: { beat: 0.42, snd: ['chisel', { vol: 0.25, pitch: 1.3 }] },
  balance: { beat: 1.6, snd: null },
  chop: { beat: 0.36, snd: ['chop', { vol: 0.45 }] },
  crack: { beat: 1.25, snd: ['crack_egg', { vol: 0.5 }] },
  stir: { beat: 1.3, snd: ['stir', { vol: 0.35 }] },
  simmer: { beat: 1.3, snd: ['bubble', { vol: 0.35 }] },
  season: { beat: 0.5, snd: ['shake', { vol: 0.3 }] },
  dig: { beat: 0.9, snd: ['hit', { snd: 'stone', vol: 0.55 }] },
};
export const DEMO_KINDS = Object.keys(KINDS);

export class StarDemo {
  constructor(rig, o = {}) {
    this.rig = rig;
    this.audio = o.audio || null;
    this.onBeat = o.onBeat || null;
    this.kind = null;
    this.t = 0;
    this.dur = 0;
    this.n = -1;
  }

  get on() { return !!this.kind; }

  /** Show `kind` for `secs` (a few beats). */
  play(kind, secs = 2.6) {
    if (!KINDS[kind] || !this.rig) return false;
    this.kind = kind;
    this.t = 0;
    this.dur = secs;
    this.n = -1;
    this.rig.setPick?.(kind === 'dig' || kind === 'hammer');
    return true;
  }

  stop() {
    if (!this.kind) return;
    this.kind = null;
    this.rig?.setPick?.(null);
  }

  /** The blows: a sound and the onBeat hook at each strike. */
  tick(dt) {
    const K = KINDS[this.kind];
    this.t += dt;
    const ph = this.t / K.beat, n = Math.floor(ph - 0.7); // (a blow lands 70% of the way through a beat)
    if (n > this.n && ph >= 0.7) {
      this.n = n;
      if (K.snd && this.audio) this.audio.play(K.snd[0], { ...K.snd[1], pitch: (K.snd[1].pitch || 1) * (0.94 + Math.random() * 0.12) });
      try { this.onBeat?.(this.kind, n); } catch (e) { /* the scene went */ }
    }
    if (this.t >= this.dur) { this.stop(); return -1; }
    return ph % 1;
  }

  /** Pose the rig for the step (after its own update). */
  apply(dt) {
    if (!this.kind || !this.rig) return;
    const r = this.rig, kind = this.kind;
    const k = this.tick(dt);
    if (k < 0) return;
    const { armL, armR, hip, neck } = r;
    if (!armL || !armR) return;
    // (in and out of the mime: the first and last quarter second blend from / to his own pose)
    const w = smooth(Math.min(this.t / 0.25, (this.dur - this.t) / 0.25));
    const set = (o, x, y, z) => { o.rotation.x += (x - o.rotation.x) * w; o.rotation.y += (y - o.rotation.y) * w; o.rotation.z += (z - o.rotation.z) * w; };
    const up = (a, b, x) => smooth((x - a) / (b - a)); // (0 → 1 between a and b)
    switch (kind) {
      case 'pump': case 'simmer': {
        // both paws on a handle (the bellows, the fire's air), pulled down and let rise
        const p = kind === 'pump' ? 0.5 - 0.5 * Math.cos(k * Math.PI * 2) : 0.5 - 0.5 * Math.cos(k * Math.PI * 2) * 0.4;
        set(armL, -1.5 + p * 0.75, 0, 0.3); set(armR, -1.5 + p * 0.75, 0, -0.3);
        if (hip) hip.rotation.x += p * 0.16 * w;
        break;
      }
      case 'hammer': case 'dig': case 'crack': {
        // anticipation (a slow raise), a fast blow, a little bounce off the work
        const big = kind === 'dig' ? 1.25 : kind === 'crack' ? 0.55 : 1;
        const raise = k < 0.62 ? up(0, 0.62, k) : k < 0.72 ? 1 - up(0.62, 0.72, k) * 1.08 : -0.08 + up(0.72, 1, k) * 0.08;
        set(armR, -0.55 - raise * 2.1 * big, 0, -0.18); set(armL, kind === 'dig' ? -0.55 - raise * 1.8 : -0.95, 0, 0.32);
        if (hip) hip.rotation.x += (0.16 - raise * 0.22 * big) * w;
        if (neck) neck.rotation.x += 0.2 * w;
        break;
      }
      case 'quench': {
        // up out of the fire, then plunged down hard into the barrel, held there
        const p = k < 0.55 ? up(0, 0.55, k) : k < 0.7 ? 1 - up(0.55, 0.7, k) : 0;
        set(armL, -0.6 - p * 0.9, 0, 0.25); set(armR, -0.6 - p * 0.9, 0, -0.25);
        if (hip) hip.rotation.x += (0.3 - p * 0.2) * w;
        break;
      }
      case 'grind': {
        const j = Math.sin(this.t * 30) * 0.05;
        set(armL, -1.3 + j, 0, 0.18); set(armR, -1.3 - j, 0, -0.18);
        if (hip) hip.rotation.x += 0.22 * w;
        break;
      }
      case 'balance': {
        // paws out flat, tipping, settling level
        const tip = Math.sin(this.t * 3.2) * 0.35 * Math.max(0, 1 - this.t / this.dur * 1.3);
        set(armL, -1.2, 0, 0.9 + tip); set(armR, -1.2, 0, -0.9 + tip);
        break;
      }
      case 'chop': {
        const p = k < 0.6 ? up(0, 0.6, k) : 1 - up(0.6, 0.75, k);
        set(armR, -0.7 - p * 0.9, 0, -0.1); set(armL, -1.0, 0, 0.35);
        if (neck) neck.rotation.x += 0.3 * w;
        break;
      }
      case 'stir': {
        const a = this.t * (Math.PI * 2 / KINDS.stir.beat);
        set(armR, -1.15 + Math.sin(a) * 0.18, Math.cos(a) * 0.35, -0.2); set(armL, -0.5, 0, 0.3);
        if (neck) neck.rotation.x += 0.28 * w;
        break;
      }
      case 'season': {
        set(armR, -1.7, 0, -0.2 + Math.sin(this.t * 22) * 0.22); set(armL, -0.4, 0, 0.3);
        break;
      }
      default: break;
    }
  }

  /** For a rig that poses itself from swingPhase ('swing' state): drive the phase, fire the beats. */
  swing(dt) {
    if (!this.kind || !this.rig) return;
    const k = this.tick(dt);
    if (k < 0) return;
    // (the rig's 'swing' pose: 0 → 0.55 the windup, 0.55 → 1 the blow; here a slow windup, a fast
    // blow landing on the beat at 70%, and a rest)
    this.rig.swingPhase = k < 0.55 ? smooth(k / 0.55) * 0.55 : k < 0.7 ? 0.55 + ((k - 0.55) / 0.15) * 0.45 : 0.999;
  }
}

// Little paper sounds for the quest strip, the book and the map, synthesized on the fly:
// a quill scratching, an ink stamp, a scroll unrolling, a brush inking the map, a pin pushed in.
const ok = (a) => a && a.ctx && a.ctx.state === 'running';

export const SFX = {
  /** A quill scratching a few strokes. */
  scratch(audio, { n = 4, vol = 1 } = {}) {
    if (!ok(audio)) return;
    for (let i = 0; i < n; i++) {
      const d = i * (0.055 + Math.random() * 0.05);
      audio.noise({ color: 'white', filter: 'bandpass', f: 3800 + Math.random() * 2600, f2: 2400 + Math.random() * 1600, q: 2.2, dur: 0.04 + Math.random() * 0.05, vol: 0.05 * vol, a: 0.004, delay: d });
      if (Math.random() < 0.5) audio.noise({ color: 'white', filter: 'highpass', f: 6500, q: 0.7, dur: 0.02, vol: 0.025 * vol, delay: d + 0.02 });
    }
  },
  /** A tick in a box. */
  tick(audio) {
    if (!ok(audio)) return;
    audio.noise({ filter: 'bandpass', f: 4200, f2: 2600, q: 3, dur: 0.05, vol: 0.06 });
    audio.noise({ filter: 'bandpass', f: 3000, f2: 5200, q: 3, dur: 0.08, vol: 0.05, delay: 0.06 });
  },
  /** Old Star's rubber stamp coming down hard. */
  stamp(audio) {
    if (!ok(audio)) return;
    audio.tone({ f: 120, f2: 55, type: 'sine', dur: 0.16, vol: 0.32, a: 0.002, release: 0.08 });
    audio.noise({ color: 'brown', filter: 'lowpass', f: 900, dur: 0.12, vol: 0.35, a: 0.001 });
    audio.noise({ filter: 'bandpass', f: 2200, q: 0.8, dur: 0.06, vol: 0.12, a: 0.001 });
    audio.noise({ filter: 'bandpass', f: 1400, f2: 700, q: 1.2, dur: 0.18, vol: 0.05, delay: 0.05 });
  },
  /** A scroll rolling up or opening out. */
  unroll(audio, { up = false } = {}) {
    if (!ok(audio)) return;
    audio.noise({ filter: 'bandpass', f: up ? 3200 : 1400, f2: up ? 1200 : 3600, q: 0.9, dur: 0.32, vol: 0.07, a: 0.04 });
    audio.noise({ filter: 'highpass', f: 5000, q: 0.6, dur: 0.18, vol: 0.02, a: 0.02, delay: 0.1 });
  },
  /** A brush of ink across the map (loop it a few times while the quill draws). */
  brush(audio, { vol = 1 } = {}) {
    if (!ok(audio)) return;
    audio.noise({ color: 'pink', filter: 'bandpass', f: 2600 + Math.random() * 1500, f2: 1600, q: 1.4, dur: 0.12 + Math.random() * 0.08, vol: 0.045 * vol, a: 0.02 });
  },
  /** A pin pushed into the paper. */
  pin(audio) {
    if (!ok(audio)) return;
    audio.tone({ f: 1800, f2: 900, type: 'triangle', dur: 0.05, vol: 0.08, a: 0.001, release: 0.04 });
    audio.noise({ filter: 'bandpass', f: 3000, q: 2, dur: 0.04, vol: 0.06 });
  },
  /** A quick flick for tabs. */
  flick(audio) {
    if (!ok(audio)) return;
    audio.noise({ filter: 'bandpass', f: 2400, f2: 4200, q: 1.5, dur: 0.07, vol: 0.06, a: 0.003 });
  },
};

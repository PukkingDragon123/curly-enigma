// A tame (or taming) raptor's voice, synthesized like the other creature sounds (enemies/sfx.js):
// chirps and trills when it's happy, a soft coo, a hiss when it's scared, quick sniffs, a whimper
// when it's hurt, a yelp, and the scratch of its claws at a wall that smells of ore.
// Every preset honours { vol, pitch, pan } (Enemies.sound adds the distance falloff and pan).
import { VOL } from '../enemies/sfx.js';

const R = (a, b) => a + Math.random() * (b - a);

const SFX = {
  raptor_chirp: [(a, o) => {
    const v = o.vol ?? 1, p = (o.pitch || 1) * R(0.94, 1.08), pan = o.pan, n = o.n || 2;
    for (let i = 0; i < n; i++) {
      const f = (1250 + i * 160) * p;
      a.tone({ f, f2: f * 1.45, type: 'triangle', dur: 0.07, vol: 0.05 * v, filter: 'bandpass', ff: 2400 * p, q: 1.6, delay: i * 0.09, pan });
      a.tone({ f: f * 2, f2: f * 2.6, type: 'sine', dur: 0.05, vol: 0.016 * v, delay: i * 0.09 + 0.01, pan });
    }
  }, 0.12],
  raptor_trill: [(a, o) => {
    const v = o.vol ?? 1, p = (o.pitch || 1) * R(0.95, 1.05), pan = o.pan;
    a.tone({ f: 1500 * p, f2: 2100 * p, type: 'triangle', dur: 0.42, a: 0.02, vol: 0.05 * v, filter: 'bandpass', ff: 2600 * p, q: 1.4, vib: 140, vibRate: 26, pan });
    a.tone({ f: 2100 * p, f2: 1700 * p, type: 'sine', dur: 0.16, vol: 0.03 * v, delay: 0.4, pan });
  }, 0.3],
  raptor_coo: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1, pan = o.pan;
    a.tone({ f: 420 * p, f2: 360 * p, type: 'sine', dur: 0.5, a: 0.08, vol: 0.06 * v, vib: 18, vibRate: 22, pan });
    a.tone({ f: 840 * p, f2: 700 * p, type: 'triangle', dur: 0.4, a: 0.08, vol: 0.014 * v, vib: 18, vibRate: 22, pan });
  }, 0.4],
  raptor_hiss: [(a, o) => {
    const v = o.vol ?? 1, pan = o.pan;
    a.noise({ filter: 'highpass', f: 2800, dur: 0.5, a: 0.04, vol: 0.13 * v, pan });
    a.tone({ f: 170, f2: 120, type: 'sawtooth', dur: 0.45, a: 0.03, vol: 0.035 * v, filter: 'lowpass', ff: 700, q: 3, vib: 25, vibRate: 19, pan });
  }, 0.5],
  raptor_sniff: [(a, o) => {
    const v = o.vol ?? 1, pan = o.pan;
    for (let i = 0; i < (o.n || 3); i++) a.noise({ filter: 'bandpass', f: R(1900, 2800), q: 2.2, dur: 0.045, a: 0.01, vol: 0.09 * v, delay: i * R(0.09, 0.12), pan });
  }, 0.35],
  raptor_whimper: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1, pan = o.pan;
    a.tone({ f: 1100 * p, f2: 640 * p, type: 'triangle', dur: 0.55, a: 0.04, vol: 0.04 * v, vib: 30, vibRate: 9, filter: 'bandpass', ff: 1600, q: 1.2, pan });
  }, 0.6],
  raptor_yelp: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1, pan = o.pan;
    a.tone({ f: 1900 * p, f2: 1200 * p, type: 'square', dur: 0.16, vol: 0.04 * v, filter: 'bandpass', ff: 2600, q: 2, pan });
    a.noise({ filter: 'highpass', f: 3500, dur: 0.1, vol: 0.06 * v, pan });
  }, 0.2],
  raptor_scratch: [(a, o) => {
    const v = o.vol ?? 1, pan = o.pan;
    for (let i = 0; i < 4; i++) {
      a.noise({ color: 'brown', filter: 'lowpass', f: R(700, 1100), dur: 0.06, vol: 0.2 * v, delay: i * R(0.07, 0.1), pan });
      a.noise({ filter: 'bandpass', f: R(2500, 4200), q: 3, dur: 0.03, vol: 0.06 * v, delay: i * 0.085 + 0.01, pan });
    }
  }, 0.4],
};

let done = false;
/** Add the presets once (they honour { vol }: Enemies.sound fades them with distance). */
export function defineTameSounds(audio) {
  if (!audio?.define) return;
  for (const k of Object.keys(SFX)) VOL.add(k);
  if (done && audio.presets?.raptor_chirp) return;
  done = true;
  for (const [k, [fn, gap]] of Object.entries(SFX)) if (!audio.presets?.[k]) audio.define(k, fn, gap);
}

// Synthesized creature and combat sounds, added to the game's audio presets once (audio.define).
// Every preset honours { vol, pitch, pan } (Enemies.sound fills in pan and distance falloff).
const R = (a, b) => a + Math.random() * (b - a);

const SFX = {
  // ---------------------------------------------------------------- golems
  golem_roar: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1, pan = o.pan;
    a.tone({ f: 120 * p, f2: 68 * p, slide: 0.9, type: 'sawtooth', dur: 0.95, a: 0.12, vol: 0.09 * v, filter: 'lowpass', ff: 700, ff2: 240, q: 2, vib: 9, vibRate: 11, pan });
    a.tone({ f: 182 * p, f2: 96 * p, slide: 0.85, type: 'square', dur: 0.8, a: 0.1, vol: 0.035 * v, filter: 'lowpass', ff: 900, q: 1.5, vib: 14, vibRate: 7, delay: 0.03, pan });
    a.noise({ color: 'brown', filter: 'lowpass', f: 420, f2: 150, dur: 0.95, a: 0.1, vol: 0.32 * v, pan });
  }, 0.35],
  crystal_ring: [(a, o) => {
    const v = o.vol ?? 1, f = (o.pitch || 1) * R(1900, 2500), pan = o.pan;
    a.tone({ f, type: 'sine', dur: 0.7, vol: 0.07 * v, reverb: 0.7, pan });
    a.tone({ f: f * 2.76, type: 'sine', dur: 0.35, vol: 0.03 * v, reverb: 0.6, pan });
    a.tone({ f: f * 1.5, type: 'triangle', dur: 0.5, vol: 0.022 * v, delay: 0.02, reverb: 0.6, pan });
    a.noise({ filter: 'highpass', f: 5500, dur: 0.05, vol: 0.12 * v, pan });
  }, 0.04],
  golem_crumble: [(a, o) => {
    const v = o.vol ?? 1;
    a.noise({ color: 'brown', filter: 'lowpass', f: 900, f2: 120, dur: 1.4, a: 0.05, vol: 0.5 * v });
    a.tone({ f: 70, f2: 35, type: 'sine', dur: 0.9, vol: 0.25 * v });
    for (let i = 0; i < 10; i++) a.noise({ filter: 'bandpass', f: R(900, 3200), q: 2, dur: 0.04, vol: 0.08 * v, delay: R(0.05, 1.1) });
  }, 0.3],

  // ---------------------------------------------------------------- combat
  block: [(a, o) => {
    const v = o.vol ?? 1, h = o.heavy ? 1 : 0;
    a.noise({ color: 'brown', filter: 'lowpass', f: 700 - h * 250, dur: 0.14 + h * 0.1, vol: (0.45 + h * 0.25) * v });
    a.tone({ f: 170 - h * 60, f2: 80, type: 'sine', dur: 0.12 + h * 0.1, vol: 0.28 * v });
    a.tone({ f: 620, f2: 540, type: 'square', dur: 0.05, vol: 0.04 * v, filter: 'bandpass', ff: 1400, q: 3 });
    a.noise({ filter: 'bandpass', f: 2600, q: 4, dur: 0.06, vol: 0.12 * v });
  }, 0.05],
  parry: [(a, o) => {
    const v = o.vol ?? 1;
    for (const [f, k, d] of [[1240, 0.08, 0.9], [1860, 0.06, 0.7], [2970, 0.035, 0.5], [4150, 0.02, 0.3]]) a.tone({ f, type: 'sine', dur: d, vol: k * v, reverb: 0.55 });
    a.noise({ filter: 'highpass', f: 4000, dur: 0.07, vol: 0.3 * v });
    a.noise({ filter: 'bandpass', f: 3000, f2: 7000, q: 2, dur: 0.25, vol: 0.08 * v, delay: 0.02 });
    a.tone({ f: 140, f2: 70, type: 'sine', dur: 0.12, vol: 0.2 * v });
  }, 0.08],
  thwack: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1;
    a.noise({ filter: 'bandpass', f: 1100 * p, f2: 280, q: 1.4, dur: 0.08, vol: 0.5 * v });
    a.tone({ f: 150 * p, f2: 62, type: 'sine', dur: 0.1, vol: 0.32 * v });
    a.noise({ color: 'brown', filter: 'lowpass', f: 500, dur: 0.1, vol: 0.25 * v });
  }, 0.03],
  smash: [(a, o) => {
    const v = o.vol ?? 1;
    a.noise({ color: 'brown', filter: 'lowpass', f: 1300, f2: 180, dur: 0.24, vol: 0.6 * v });
    a.tone({ f: 96, f2: 38, type: 'sine', dur: 0.28, vol: 0.42 * v });
    a.tone({ f: 210, f2: 90, type: 'square', dur: 0.1, vol: 0.05 * v, filter: 'lowpass', ff: 800 });
    for (let i = 0; i < 4; i++) a.noise({ filter: 'highpass', f: R(2500, 5000), dur: 0.03, vol: 0.1 * v, delay: R(0.02, 0.15) });
  }, 0.06],
  tell: [(a, o) => {
    const v = o.vol ?? 1;
    a.tone({ f: 1700, f2: 3400, type: 'sine', dur: 0.09, vol: 0.05 * v, pan: o.pan });
    a.tone({ f: 3400, type: 'sine', dur: 0.18, vol: 0.02 * v, delay: 0.07, reverb: 0.5, pan: o.pan });
  }, 0.12],
  tell_heavy: [(a, o) => {
    const v = o.vol ?? 1;
    a.tone({ f: 118, f2: 92, type: 'square', dur: 0.32, vol: 0.06 * v, filter: 'lowpass', ff: 600, pan: o.pan });
    a.tone({ f: 236, f2: 184, type: 'sawtooth', dur: 0.3, vol: 0.025 * v, filter: 'lowpass', ff: 900, pan: o.pan });
  }, 0.2],
  stomp: [(a, o) => {
    const v = o.vol ?? 1;
    a.tone({ f: 62, f2: 30, type: 'sine', dur: 0.32, vol: 0.5 * v, pan: o.pan });
    a.noise({ color: 'brown', filter: 'lowpass', f: 320, dur: 0.38, vol: 0.45 * v, pan: o.pan });
    a.noise({ filter: 'bandpass', f: 1600, q: 1, dur: 0.06, vol: 0.12 * v, pan: o.pan });
  }, 0.08],

  // ---------------------------------------------------------------- voices
  growl: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1, d = o.dur || 0.7;
    a.tone({ f: 96 * p, f2: 78 * p, type: 'sawtooth', dur: d, a: 0.1, vol: 0.07 * v, filter: 'lowpass', ff: 520 * p, q: 3, vib: 7 * p, vibRate: 23, pan: o.pan });
    a.noise({ color: 'brown', filter: 'bandpass', f: 260 * p, q: 2, dur: d, a: 0.1, vol: 0.2 * v, pan: o.pan });
  }, 0.4],
  roar_big: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1;
    a.tone({ f: 150 * p, f2: 58 * p, slide: 1.5, type: 'sawtooth', dur: 1.6, a: 0.2, vol: 0.12 * v, filter: 'lowpass', ff: 1100, ff2: 300, q: 2.5, vib: 11, vibRate: 13, reverb: 0.5 });
    a.tone({ f: 228 * p, f2: 96 * p, slide: 1.4, type: 'square', dur: 1.4, a: 0.2, vol: 0.04 * v, filter: 'lowpass', ff: 1300, q: 1.5, vib: 16, vibRate: 9 });
    a.tone({ f: 48 * p, f2: 34 * p, type: 'sine', dur: 1.6, a: 0.25, vol: 0.3 * v });
    a.noise({ color: 'brown', filter: 'lowpass', f: 700, f2: 180, dur: 1.7, a: 0.2, vol: 0.5 * v, reverb: 0.4 });
    a.noise({ filter: 'bandpass', f: 1800, f2: 700, q: 1.2, dur: 1.2, a: 0.15, vol: 0.12 * v });
  }, 1],
  screech: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1, pan = o.pan;
    a.tone({ f: 1450 * p, f2: 880 * p, type: 'square', dur: 0.38, a: 0.02, vol: 0.05 * v, filter: 'bandpass', ff: 2200 * p, q: 2, vib: 90, vibRate: 31, pan });
    a.tone({ f: 2100 * p, f2: 1300 * p, type: 'sawtooth', dur: 0.3, vol: 0.025 * v, filter: 'bandpass', ff: 3000, q: 3, pan });
    a.noise({ filter: 'highpass', f: 3000, dur: 0.3, a: 0.02, vol: 0.08 * v, pan });
  }, 0.25],
  bark: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1, pan = o.pan;
    for (let i = 0; i < (o.n || 2); i++) {
      a.tone({ f: 760 * p, f2: 1180 * p, type: 'square', dur: 0.06, vol: 0.05 * v, filter: 'bandpass', ff: 1600, q: 2, delay: i * 0.11, pan });
      a.noise({ filter: 'bandpass', f: 1800 * p, q: 3, dur: 0.05, vol: 0.08 * v, delay: i * 0.11, pan });
    }
  }, 0.15],
  chitter: [(a, o) => {
    const v = o.vol ?? 1, pan = o.pan;
    for (let i = 0; i < 9; i++) a.noise({ filter: 'highpass', f: R(3500, 6000), dur: 0.014, vol: 0.12 * v, delay: i * R(0.025, 0.04), pan });
    a.tone({ f: 2600, f2: 1900, type: 'square', dur: 0.06, vol: 0.012 * v, filter: 'bandpass', ff: 2600, q: 5, pan });
  }, 0.2],
  spider_hiss: [(a, o) => {
    const v = o.vol ?? 1;
    a.noise({ filter: 'highpass', f: 2400, dur: 0.55, a: 0.12, vol: 0.14 * v, pan: o.pan });
    for (let i = 0; i < 5; i++) a.noise({ filter: 'highpass', f: 5000, dur: 0.012, vol: 0.12 * v, delay: 0.3 + i * 0.03, pan: o.pan });
  }, 0.4],
  wail: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1;
    a.tone({ f: 540 * p, f2: 360 * p, slide: 1.2, type: 'sine', dur: 1.3, a: 0.25, vol: 0.06 * v, vib: 26, vibRate: 5.5, reverb: 0.9, pan: o.pan });
    a.tone({ f: 812 * p, f2: 530 * p, slide: 1.2, type: 'triangle', dur: 1.2, a: 0.3, vol: 0.025 * v, vib: 30, vibRate: 6.3, reverb: 0.9, pan: o.pan });
    a.noise({ filter: 'bandpass', f: 1400, f2: 700, q: 4, dur: 1.2, a: 0.3, vol: 0.06 * v, reverb: 0.8, pan: o.pan });
  }, 1.2],
  whisper: [(a, o) => {
    const v = o.vol ?? 1;
    for (let i = 0; i < 4; i++) a.noise({ filter: 'bandpass', f: R(1500, 3200), q: 6, dur: R(0.12, 0.25), a: 0.05, vol: 0.05 * v, delay: i * R(0.12, 0.2), reverb: 0.7, pan: o.pan });
  }, 0.8],
  blorp: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1;
    a.tone({ f: 210 * p, f2: 540 * p, type: 'sine', dur: 0.12, vol: 0.12 * v, pan: o.pan });
    a.tone({ f: 420 * p, f2: 260 * p, type: 'sine', dur: 0.08, vol: 0.06 * v, delay: 0.09, pan: o.pan });
    a.noise({ color: 'pink', filter: 'lowpass', f: 900, dur: 0.07, vol: 0.12 * v, pan: o.pan });
  }, 0.06],
  splat: [(a, o) => {
    const v = o.vol ?? 1;
    a.noise({ color: 'pink', filter: 'lowpass', f: 1200, f2: 300, dur: 0.18, vol: 0.4 * v, pan: o.pan });
    a.tone({ f: 190, f2: 70, type: 'sine', dur: 0.14, vol: 0.18 * v, pan: o.pan });
  }, 0.05],
  snarl: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1;
    a.tone({ f: 150 * p, f2: 110 * p, type: 'sawtooth', dur: 0.6, a: 0.04, vol: 0.07 * v, filter: 'lowpass', ff: 900, q: 4, vib: 22, vibRate: 17, pan: o.pan });
    a.noise({ filter: 'bandpass', f: 900, q: 2, dur: 0.55, a: 0.03, vol: 0.16 * v, pan: o.pan });
  }, 0.35],
  inhale: [(a, o) => {
    const v = o.vol ?? 1, d = o.dur || 0.85;
    a.noise({ filter: 'bandpass', f: 500, f2: 2600, q: 1.5, dur: d, a: d * 0.8, vol: 0.2 * v, pan: o.pan });
    a.tone({ f: 70, f2: 120, type: 'sine', dur: d, a: d * 0.7, vol: 0.12 * v, pan: o.pan });
  }, 0.5],
  fire_breath: [(a, o) => {
    const v = o.vol ?? 1, d = o.dur || 1.1;
    a.noise({ color: 'brown', filter: 'lowpass', f: 1600, f2: 600, dur: d, a: 0.05, vol: 0.55 * v, pan: o.pan });
    a.noise({ filter: 'bandpass', f: 2600, q: 0.8, dur: d * 0.9, a: 0.04, vol: 0.12 * v, pan: o.pan });
    for (let i = 0; i < 10; i++) a.noise({ filter: 'highpass', f: R(3000, 6000), dur: 0.02, vol: 0.1 * v, delay: R(0, d), pan: o.pan });
  }, 0.5],
  grunt: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1;
    a.tone({ f: 92 * p, f2: 66 * p, type: 'sawtooth', dur: 0.32, a: 0.03, vol: 0.09 * v, filter: 'lowpass', ff: 480, q: 3, pan: o.pan });
    a.noise({ color: 'brown', filter: 'lowpass', f: 380, dur: 0.3, vol: 0.28 * v, pan: o.pan });
  }, 0.25],
  yip: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1;
    a.tone({ f: 640 * p, f2: 980 * p, type: 'square', dur: 0.07, vol: 0.045 * v, filter: 'lowpass', ff: 2400, pan: o.pan });
    a.tone({ f: 980 * p, f2: 760 * p, type: 'square', dur: 0.06, vol: 0.035 * v, filter: 'lowpass', ff: 2400, delay: 0.08, pan: o.pan });
  }, 0.1],
  chomp: [(a, o) => {
    const v = o.vol ?? 1;
    for (let i = 0; i < 2; i++) {
      a.noise({ filter: 'bandpass', f: 1300, q: 1.5, dur: 0.05, vol: 0.25 * v, delay: i * 0.13, pan: o.pan });
      a.tone({ f: 260, f2: 130, type: 'sine', dur: 0.05, vol: 0.1 * v, delay: i * 0.13, pan: o.pan });
    }
  }, 0.3],
  crunch: [(a, o) => {
    const v = o.vol ?? 1;
    for (let i = 0; i < 6; i++) a.noise({ filter: 'highpass', f: R(1500, 4000), dur: 0.025, vol: 0.14 * v, delay: R(0, 0.18), pan: o.pan });
    a.noise({ color: 'brown', filter: 'lowpass', f: 600, dur: 0.15, vol: 0.2 * v, pan: o.pan });
  }, 0.2],
  flap: [(a, o) => {
    const v = o.vol ?? 1;
    a.noise({ color: 'brown', filter: 'lowpass', f: 520, f2: 220, dur: 0.14, vol: 0.32 * v, pan: o.pan });
    a.noise({ filter: 'bandpass', f: 900, q: 1, dur: 0.08, vol: 0.06 * v, pan: o.pan });
  }, 0.12],
  web_shot: [(a, o) => {
    const v = o.vol ?? 1;
    a.noise({ filter: 'bandpass', f: 2000, f2: 900, q: 2, dur: 0.18, vol: 0.18 * v, pan: o.pan });
    a.tone({ f: 600, f2: 300, type: 'triangle', dur: 0.12, vol: 0.05 * v, pan: o.pan });
  }, 0.15],
  web_tear: [(a, o) => {
    const v = o.vol ?? 1;
    for (let i = 0; i < 5; i++) a.noise({ filter: 'bandpass', f: R(1400, 2600), q: 3, dur: 0.04, vol: 0.15 * v, delay: i * 0.035 });
  }, 0.1],
  big_snore: [(a, o) => {
    const v = o.vol ?? 1, p = o.pitch || 1;
    a.noise({ color: 'brown', filter: 'bandpass', f: 140 * p, q: 3, dur: 1.2, a: 0.5, vol: 0.18 * v, pan: o.pan });
    a.tone({ f: 60 * p, f2: 48 * p, type: 'sawtooth', dur: 1.1, a: 0.5, vol: 0.03 * v, filter: 'lowpass', ff: 260, pan: o.pan });
  }, 1.5],
};

export function defineSounds(audio) {
  if (!audio?.define) return;
  for (const [k, [fn, gap]] of Object.entries(SFX)) if (!audio.presets?.[k]) audio.define(k, fn, gap);
}

/** Sounds that honour { vol } (the others are only played when the creature is close). */
export const VOL = new Set(['hit', 'break', 'thud', 'clunk', 'land', 'debris', 'explode', 'zap', 'clang', 'bellows', 'splash', ...Object.keys(SFX)]);

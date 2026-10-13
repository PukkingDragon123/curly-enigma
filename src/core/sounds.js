// SFX presets, ambience loops and music tracks for the whole game.
import { midiToFreq } from './Audio.js';

const R = (a, b) => a + Math.random() * (b - a);

export function registerSounds(au) {
  const d = (name, fn, gap) => au.define(name, fn, gap);

  // ---------- UI ----------
  d('ui_click', (a, o) => a.tone({ f: 880 * (o.pitch || 1), f2: 660, type: 'square', dur: 0.04, vol: 0.06, filter: 'lowpass', ff: 3000 }));
  d('ui_hover', (a) => a.tone({ f: 1320, type: 'sine', dur: 0.025, vol: 0.025 }), 0.03);
  d('ui_open', (a) => { a.tone({ f: 523, type: 'triangle', dur: 0.07, vol: 0.08 }); a.tone({ f: 784, type: 'triangle', dur: 0.09, vol: 0.08, delay: 0.05 }); });
  d('ui_close', (a) => { a.tone({ f: 784, type: 'triangle', dur: 0.06, vol: 0.07 }); a.tone({ f: 523, type: 'triangle', dur: 0.08, vol: 0.07, delay: 0.045 }); });
  d('ui_error', (a) => { a.tone({ f: 220, type: 'square', dur: 0.09, vol: 0.06, filter: 'lowpass', ff: 1200 }); a.tone({ f: 175, type: 'square', dur: 0.12, vol: 0.06, delay: 0.08, filter: 'lowpass', ff: 1000 }); });
  d('ui_buy', (a) => { [659, 880, 1175].forEach((f, i) => a.tone({ f, type: 'square', dur: 0.06, vol: 0.05, delay: i * 0.05, filter: 'lowpass', ff: 4000 })); });
  d('coins', (a, o) => {
    const n = Math.min(8, Math.max(2, o.n || 4));
    for (let i = 0; i < n; i++) {
      const f = R(1900, 2600);
      a.tone({ f, type: 'square', dur: 0.05, vol: 0.035, delay: i * 0.055, filter: 'highpass', ff: 1200, reverb: 0.15 });
      a.tone({ f: f * 1.5, type: 'sine', dur: 0.08, vol: 0.03, delay: i * 0.055 + 0.02 });
    }
  }, 0.08);
  d('discover', (a) => {
    [72, 76, 79, 84, 88].forEach((m, i) => a.tone({ f: midiToFreq(m), type: 'square', dur: 0.09, vol: 0.05, delay: i * 0.07, filter: 'lowpass', ff: 3500, reverb: 0.35 }));
    a.tone({ f: midiToFreq(96), type: 'sine', dur: 0.5, vol: 0.05, delay: 0.36, reverb: 0.5 });
  }, 0.3);
  d('page', (a) => a.noise({ color: 'pink', filter: 'bandpass', f: 2500, f2: 900, q: 0.8, dur: 0.18, a: 0.03, vol: 0.12 }));
  d('toast', (a) => a.tone({ f: 988, type: 'sine', dur: 0.09, vol: 0.05 }));
  d('levelup', (a) => {
    [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => a.tone({ f: midiToFreq(m), type: 'square', dur: 0.08, vol: 0.05, delay: i * 0.06, filter: 'lowpass', ff: 3000, reverb: 0.3 }));
  }, 0.4);

  // ---------- movement ----------
  d('step', (a, o) => {
    const m = o.mat || 'dirt';
    if (m === 'stone') a.noise({ filter: 'bandpass', f: R(1400, 2000), q: 2, dur: 0.035, vol: 0.05 * (o.vol ?? 1) });
    else if (m === 'wood') a.tone({ f: R(180, 230), type: 'triangle', dur: 0.05, vol: 0.06 * (o.vol ?? 1), filter: 'lowpass', ff: 900 });
    else if (m === 'sand') a.noise({ color: 'pink', filter: 'highpass', f: 2500, dur: 0.06, a: 0.015, vol: 0.05 * (o.vol ?? 1) });
    else if (m === 'water') a.noise({ color: 'pink', filter: 'bandpass', f: 900, f2: 400, q: 1, dur: 0.12, vol: 0.06 });
    else a.noise({ color: 'brown', filter: 'lowpass', f: R(500, 700), dur: 0.05, vol: 0.12 * (o.vol ?? 1) });
  }, 0.06);
  d('jump', (a) => { a.tone({ f: 260, f2: 520, type: 'square', dur: 0.08, vol: 0.04, filter: 'lowpass', ff: 1500 }); a.noise({ color: 'brown', f: 400, filter: 'lowpass', dur: 0.05, vol: 0.06 }); });
  d('land', (a, o) => a.noise({ color: 'brown', filter: 'lowpass', f: 300 + (o.hard ? 300 : 0), dur: 0.09, vol: 0.15 * (o.vol ?? 1) }), 0.08);
  d('climb', (a) => a.noise({ color: 'pink', filter: 'bandpass', f: R(800, 1300), q: 1, dur: 0.06, vol: 0.05 }), 0.12);
  d('swim', (a) => a.noise({ color: 'pink', filter: 'bandpass', f: R(500, 800), q: 1.2, dur: 0.18, a: 0.05, vol: 0.06 }), 0.25);
  d('splash', (a, o) => { a.noise({ color: 'white', filter: 'bandpass', f: 1500, f2: 400, q: 0.7, dur: 0.35, vol: 0.18 * (o.vol ?? 1) }); for (let i = 0; i < 4; i++) a.tone({ f: R(500, 1200), f2: R(1200, 2200), slide: 0.05, type: 'sine', dur: 0.05, vol: 0.04, delay: R(0.02, 0.2) }); }, 0.15);

  // ---------- mining hits ----------
  const hit = {
    dirt: (a, v) => { a.noise({ color: 'brown', filter: 'lowpass', f: R(600, 900), dur: 0.08, vol: 0.32 * v }); a.tone({ f: R(90, 120), f2: 60, type: 'sine', dur: 0.07, vol: 0.12 * v }); },
    sand: (a, v) => { a.noise({ color: 'pink', filter: 'highpass', f: 1800, dur: 0.1, a: 0.01, vol: 0.12 * v }); a.noise({ color: 'brown', filter: 'lowpass', f: 600, dur: 0.06, vol: 0.12 * v }); },
    clay: (a, v) => { a.noise({ color: 'brown', filter: 'lowpass', f: R(300, 420), dur: 0.12, a: 0.01, vol: 0.32 * v }); a.tone({ f: 140, f2: 90, type: 'sine', dur: 0.09, vol: 0.12 * v }); },
    stone: (a, v) => { a.noise({ filter: 'bandpass', f: R(1800, 2600), q: 1.4, dur: 0.06, vol: 0.18 * v }); a.tone({ f: R(900, 1300), type: 'square', dur: 0.03, vol: 0.03 * v, filter: 'bandpass', ff: 2000, q: 4 }); a.noise({ color: 'brown', filter: 'lowpass', f: 500, dur: 0.07, vol: 0.12 * v }); },
    hard: (a, v) => { a.noise({ filter: 'bandpass', f: R(2600, 3400), q: 2, dur: 0.05, vol: 0.18 * v }); const f = R(1600, 2100); a.tone({ f, type: 'sine', dur: 0.18, vol: 0.06 * v, reverb: 0.25 }); a.tone({ f: f * 2.7, type: 'sine', dur: 0.1, vol: 0.025 * v }); },
    crystal: (a, v) => { const f = R(2200, 3200); a.tone({ f, type: 'sine', dur: 0.35, vol: 0.07 * v, reverb: 0.5 }); a.tone({ f: f * 1.5, type: 'sine', dur: 0.25, vol: 0.04 * v, delay: 0.01, reverb: 0.5 }); a.noise({ filter: 'highpass', f: 5000, dur: 0.04, vol: 0.08 * v }); },
    metal: (a, v) => { const f = R(1300, 1700); a.tone({ f, type: 'square', dur: 0.06, vol: 0.04 * v, filter: 'bandpass', ff: f, q: 8 }); a.tone({ f: f * 2.41, type: 'sine', dur: 0.25, vol: 0.05 * v, reverb: 0.3 }); a.noise({ filter: 'bandpass', f: 3000, q: 2, dur: 0.04, vol: 0.1 * v }); },
    wood: (a, v) => { a.tone({ f: R(200, 260), f2: 150, type: 'triangle', dur: 0.08, vol: 0.18 * v }); a.noise({ filter: 'bandpass', f: 1200, q: 2, dur: 0.05, vol: 0.1 * v }); },
    ice: (a, v) => { a.noise({ filter: 'highpass', f: 3500, dur: 0.08, vol: 0.14 * v }); a.tone({ f: R(1700, 2300), f2: 1200, type: 'sine', dur: 0.1, vol: 0.05 * v }); },
    flesh: (a, v) => { a.noise({ color: 'pink', filter: 'lowpass', f: 900, dur: 0.06, vol: 0.2 * v }); a.tone({ f: 300, f2: 180, type: 'triangle', dur: 0.06, vol: 0.08 * v }); },
  };
  d('hit', (a, o) => (hit[o.snd] || hit.stone)(a, o.vol ?? 1), 0.03);

  const brk = {
    dirt: (a, v) => { a.noise({ color: 'brown', filter: 'lowpass', f: 900, f2: 200, dur: 0.3, vol: 0.4 * v }); for (let i = 0; i < 3; i++) a.noise({ color: 'pink', filter: 'bandpass', f: R(400, 900), q: 1, dur: 0.05, vol: 0.08 * v, delay: R(0.05, 0.22) }); },
    sand: (a, v) => { a.noise({ color: 'pink', filter: 'highpass', f: 1500, dur: 0.4, a: 0.05, vol: 0.12 * v }); a.noise({ color: 'brown', filter: 'lowpass', f: 500, dur: 0.25, vol: 0.2 * v }); },
    clay: (a, v) => { a.noise({ color: 'brown', filter: 'lowpass', f: 500, f2: 150, dur: 0.3, vol: 0.4 * v }); a.tone({ f: 120, f2: 70, type: 'sine', dur: 0.15, vol: 0.14 * v }); },
    stone: (a, v) => { a.noise({ color: 'brown', filter: 'lowpass', f: 1400, f2: 250, dur: 0.35, vol: 0.45 * v }); for (let i = 0; i < 5; i++) a.noise({ filter: 'bandpass', f: R(1500, 3500), q: 2, dur: 0.03, vol: 0.07 * v, delay: R(0.04, 0.35) }); },
    hard: (a, v) => { a.noise({ color: 'brown', filter: 'lowpass', f: 1800, f2: 300, dur: 0.4, vol: 0.45 * v }); a.tone({ f: 90, f2: 50, type: 'sine', dur: 0.2, vol: 0.2 * v }); for (let i = 0; i < 6; i++) a.tone({ f: R(1800, 3000), type: 'sine', dur: 0.05, vol: 0.03 * v, delay: R(0.05, 0.4) }); },
    crystal: (a, v) => { for (let i = 0; i < 9; i++) { const f = R(2400, 5200); a.tone({ f, type: 'sine', dur: R(0.1, 0.35), vol: 0.05 * v, delay: R(0, 0.25), reverb: 0.6 }); } a.noise({ filter: 'highpass', f: 4000, dur: 0.2, vol: 0.1 * v }); },
    metal: (a, v) => { brk.stone(a, v); a.tone({ f: 1100, type: 'sine', dur: 0.5, vol: 0.04 * v, reverb: 0.4 }); },
    wood: (a, v) => { a.noise({ filter: 'bandpass', f: 900, f2: 400, q: 1.5, dur: 0.25, vol: 0.25 * v }); a.tone({ f: 180, f2: 90, type: 'triangle', dur: 0.15, vol: 0.15 * v }); },
    ice: (a, v) => { brk.crystal(a, v * 0.7); a.noise({ color: 'pink', filter: 'highpass', f: 2500, dur: 0.3, vol: 0.12 * v }); },
    flesh: (a, v) => hit.flesh(a, v),
  };
  d('break', (a, o) => (brk[o.snd] || brk.stone)(a, o.vol ?? 1), 0.04);

  d('chisel', (a) => { const f = R(3200, 4200); a.tone({ f, type: 'square', dur: 0.025, vol: 0.04, filter: 'bandpass', ff: f, q: 6 }); a.tone({ f: f * 0.5, type: 'sine', dur: 0.08, vol: 0.03, delay: 0.005 }); }, 0.05);
  d('brush', (a) => a.noise({ color: 'pink', filter: 'bandpass', f: R(3000, 4500), f2: R(1500, 2500), q: 0.9, dur: 0.16, a: 0.04, vol: 0.09 }), 0.09);
  d('debris', (a, o) => a.noise({ filter: 'bandpass', f: R(1200, 3600), q: 3, dur: 0.02, vol: 0.03 * (o.vol ?? 1) }), 0.025);
  d('ore_damage', (a) => { a.tone({ f: 700, f2: 300, type: 'square', dur: 0.12, vol: 0.05, filter: 'lowpass', ff: 1800 }); a.noise({ filter: 'bandpass', f: 2500, q: 2, dur: 0.06, vol: 0.1 }); }, 0.06);
  d('ore_free', (a) => {
    a.tone({ f: 330, f2: 660, type: 'triangle', dur: 0.08, vol: 0.12 });
    [1047, 1319, 1568, 2093].forEach((f, i) => a.tone({ f, type: 'sine', dur: 0.15, vol: 0.05, delay: 0.06 + i * 0.05, reverb: 0.4 }));
  }, 0.1);
  d('pristine', (a) => { [1568, 2093, 2637, 3136].forEach((f, i) => a.tone({ f, type: 'sine', dur: 0.25, vol: 0.05, delay: i * 0.06, reverb: 0.6 })); }, 0.2);
  d('pickup', (a, o) => { const p = o.pitch || 1; a.tone({ f: 600 * p, f2: 1200 * p, slide: 0.06, type: 'square', dur: 0.07, vol: 0.05, filter: 'lowpass', ff: 3500 }); }, 0.04);
  d('pickup_gem', (a) => { [1319, 1760, 2637].forEach((f, i) => a.tone({ f, type: 'sine', dur: 0.12, vol: 0.06, delay: i * 0.045, reverb: 0.4 })); }, 0.05);
  d('creak', (a) => { a.tone({ f: R(70, 110), f2: R(50, 80), type: 'sawtooth', dur: 0.6, a: 0.1, vol: 0.05, filter: 'bandpass', ff: 300, q: 6, vib: 6, vibRate: 13 }); a.noise({ color: 'brown', filter: 'lowpass', f: 200, dur: 0.6, a: 0.2, vol: 0.12 }); }, 0.4);
  d('trickle', (a) => { for (let i = 0; i < 5; i++) a.noise({ color: 'pink', filter: 'bandpass', f: R(1500, 3000), q: 2, dur: 0.02, vol: 0.04, delay: R(0, 0.4) }); }, 0.2);
  d('collapse', (a, o) => {
    const v = o.vol ?? 1;
    a.noise({ color: 'brown', filter: 'lowpass', f: 700, f2: 90, dur: 1.4, vol: 0.6 * v, a: 0.01 });
    a.tone({ f: 60, f2: 30, type: 'sine', dur: 0.8, vol: 0.3 * v });
    for (let i = 0; i < 10; i++) a.noise({ filter: 'bandpass', f: R(600, 2500), q: 2, dur: 0.06, vol: 0.12 * v, delay: R(0.05, 1.0) });
  }, 0.15);
  d('thud', (a, o) => { const v = o.vol ?? 1; a.noise({ color: 'brown', filter: 'lowpass', f: 400, f2: 120, dur: 0.25, vol: 0.4 * v }); a.tone({ f: 80, f2: 40, type: 'sine', dur: 0.2, vol: 0.25 * v }); }, 0.05);
  d('explode', (a, o) => {
    const v = o.vol ?? 1;
    a.noise({ color: 'white', filter: 'lowpass', f: 3000, f2: 120, dur: 1.2, vol: 0.55 * v });
    a.noise({ color: 'brown', filter: 'lowpass', f: 300, dur: 1.6, vol: 0.7 * v });
    a.tone({ f: 90, f2: 25, type: 'sine', dur: 0.9, vol: 0.45 * v });
  }, 0.1);
  d('zap', (a, o) => {
    const v = o.vol ?? 1;
    for (let i = 0; i < 6; i++) a.tone({ f: R(800, 3200), f2: R(200, 900), type: 'sawtooth', dur: 0.04, vol: 0.05 * v, delay: i * 0.025, filter: 'highpass', ff: 600 });
    a.noise({ filter: 'highpass', f: 3000, dur: 0.2, vol: 0.14 * v });
  }, 0.07);
  d('sizzle', (a) => a.noise({ filter: 'highpass', f: 4000, dur: 0.5, a: 0.02, vol: 0.12 }), 0.1);
  d('steam', (a) => a.noise({ color: 'white', filter: 'bandpass', f: 4000, f2: 2500, q: 0.6, dur: 0.8, a: 0.05, vol: 0.14 }), 0.15);
  d('bubble', (a) => { const f = R(300, 700); a.tone({ f, f2: f * 2.2, slide: 0.06, type: 'sine', dur: 0.07, vol: 0.06 }); }, 0.04);
  d('drip', (a) => { const f = R(1400, 2400); a.tone({ f, f2: f * 1.7, slide: 0.04, type: 'sine', dur: 0.06, vol: 0.05, reverb: 0.7 }); }, 0.08);
  d('bloop', (a) => { const f = R(90, 160); a.tone({ f, f2: f * 2, slide: 0.12, type: 'sine', dur: 0.16, vol: 0.12 }); a.noise({ color: 'brown', filter: 'lowpass', f: 300, dur: 0.15, vol: 0.12 }); }, 0.1);
  d('freeze', (a) => { for (let i = 0; i < 5; i++) a.tone({ f: R(3000, 5000), type: 'sine', dur: 0.08, vol: 0.03, delay: i * 0.04, reverb: 0.5 }); a.noise({ filter: 'highpass', f: 6000, dur: 0.3, vol: 0.06 }); }, 0.2);
  d('ignite', (a) => { a.noise({ color: 'pink', filter: 'lowpass', f: 400, f2: 2000, dur: 0.35, a: 0.05, vol: 0.2 }); }, 0.15);
  d('glow', (a) => a.tone({ f: 660, f2: 990, type: 'sine', dur: 0.4, vol: 0.04, reverb: 0.6 }), 0.3);
  d('xray_on', (a) => { a.tone({ f: 200, f2: 800, type: 'sine', dur: 0.25, vol: 0.06, reverb: 0.4 }); a.tone({ f: 203, f2: 806, type: 'sine', dur: 0.25, vol: 0.06 }); });
  d('drill_start', (a) => a.tone({ f: 60, f2: 160, type: 'sawtooth', dur: 0.25, vol: 0.06, filter: 'lowpass', ff: 1200 }));
  d('overheat', (a) => { a.tone({ f: 1200, type: 'square', dur: 0.08, vol: 0.05, filter: 'lowpass', ff: 3000 }); a.tone({ f: 900, type: 'square', dur: 0.08, vol: 0.05, delay: 0.1, filter: 'lowpass', ff: 3000 }); a.noise({ filter: 'highpass', f: 3000, dur: 0.6, vol: 0.1, delay: 0.1 }); }, 0.4);

  // ---------- creatures / chars ----------
  d('hurt', (a) => { a.tone({ f: 520, f2: 260, type: 'square', dur: 0.14, vol: 0.06, filter: 'lowpass', ff: 2000 }); a.noise({ color: 'pink', filter: 'lowpass', f: 1200, dur: 0.08, vol: 0.1 }); }, 0.2);
  d('faint', (a) => { [67, 63, 60, 55].forEach((m, i) => a.tone({ f: midiToFreq(m), type: 'triangle', dur: 0.22, vol: 0.08, delay: i * 0.18, vib: 4 })); }, 1);
  d('eat', (a) => { for (let i = 0; i < 3; i++) a.noise({ color: 'pink', filter: 'bandpass', f: R(700, 1100), q: 1.5, dur: 0.06, vol: 0.14, delay: i * 0.13 }); a.tone({ f: 600, f2: 900, type: 'sine', dur: 0.08, vol: 0.05, delay: 0.42 }); }, 0.3);
  d('gulp', (a) => a.tone({ f: 200, f2: 500, type: 'sine', dur: 0.1, vol: 0.1 }), 0.15);
  d('squeak', (a, o) => { const f = R(2200, 3000) * (o.pitch || 1); a.tone({ f, f2: f * 1.3, type: 'sine', dur: 0.06, vol: 0.04 }); a.tone({ f: f * 1.2, f2: f, type: 'sine', dur: 0.05, vol: 0.03, delay: 0.07 }); }, 0.15);
  d('chirp', (a) => { for (let i = 0; i < 3; i++) a.tone({ f: 4200, type: 'square', dur: 0.015, vol: 0.02, delay: i * 0.035, filter: 'bandpass', ff: 4200, q: 4 }); }, 0.3);
  d('click', (a) => { a.noise({ filter: 'bandpass', f: 2800, q: 5, dur: 0.02, vol: 0.08 }); a.noise({ filter: 'bandpass', f: 2600, q: 5, dur: 0.02, vol: 0.08, delay: 0.06 }); }, 0.1);
  d('slurp', (a) => a.noise({ color: 'pink', filter: 'bandpass', f: 500, f2: 1400, q: 3, dur: 0.25, a: 0.05, vol: 0.08 }), 0.4);
  d('buzz', (a) => a.tone({ f: 180, type: 'sawtooth', dur: 0.3, vol: 0.03, filter: 'bandpass', ff: 600, q: 2, vib: 30, vibRate: 25 }), 0.4);
  d('hiss', (a) => a.noise({ filter: 'highpass', f: 3500, dur: 0.4, a: 0.05, vol: 0.08 }), 0.3);
  d('wisp', (a) => { a.tone({ f: 880, f2: 1320, type: 'sine', dur: 0.6, vol: 0.04, reverb: 0.8, vib: 20, vibRate: 7 }); }, 0.5);
  d('cluck', (a, o) => { const p = o.pitch || 1; const n = o.n || (1 + (Math.random() * 3) | 0); for (let i = 0; i < n; i++) { const f = R(500, 650) * p; a.tone({ f, f2: f * 0.7, type: 'square', dur: 0.05, vol: 0.05, delay: i * 0.11, filter: 'bandpass', ff: 1400, q: 2 }); } }, 0.25);
  d('bawk', (a, o) => { const p = o.pitch || 1; a.tone({ f: 600 * p, f2: 900 * p, type: 'square', dur: 0.08, vol: 0.06, filter: 'bandpass', ff: 1500, q: 2 }); a.tone({ f: 900 * p, f2: 500 * p, type: 'square', dur: 0.22, vol: 0.06, delay: 0.09, filter: 'bandpass', ff: 1400, q: 2, vib: 30, vibRate: 18 }); }, 0.4);
  d('babble', (a, o) => {
    const base = o.pitch || 300;
    const n = Math.max(2, Math.min(10, o.n || 5));
    for (let i = 0; i < n; i++) {
      const f = base * R(0.85, 1.25);
      a.tone({ f, f2: f * R(0.85, 1.15), type: o.wave || 'square', dur: 0.05, vol: 0.035, delay: i * 0.075, filter: 'bandpass', ff: base * 3, q: 1.5 });
    }
  }, 0.15);
  d('laugh', (a, o) => { const b = o.pitch || 400; for (let i = 0; i < 4; i++) a.tone({ f: b * (1.3 - i * 0.06), f2: b, type: 'square', dur: 0.06, vol: 0.04, delay: i * 0.1, filter: 'bandpass', ff: b * 3, q: 1.5 }); }, 0.5);
  d('sneeze', (a) => { a.tone({ f: 500, f2: 900, type: 'sine', dur: 0.3, vol: 0.04, a: 0.2 }); a.noise({ filter: 'bandpass', f: 3000, q: 0.8, dur: 0.18, vol: 0.18, delay: 0.32 }); }, 0.5);
  d('yawn', (a) => a.tone({ f: 380, f2: 220, type: 'triangle', dur: 0.7, a: 0.15, vol: 0.06, vib: 5, vibRate: 4 }), 1);
  d('snore', (a) => a.noise({ color: 'brown', filter: 'bandpass', f: 180, q: 3, dur: 0.9, a: 0.4, vol: 0.14 }), 1);
  d('emote', (a, o) => {
    const k = o.kind;
    if (k === 'love') [880, 1109, 1319].forEach((f, i) => a.tone({ f, type: 'sine', dur: 0.12, vol: 0.04, delay: i * 0.06 }));
    else if (k === 'alert') a.tone({ f: 1200, f2: 1600, type: 'square', dur: 0.06, vol: 0.04, filter: 'lowpass', ff: 3000 });
    else if (k === 'question') { a.tone({ f: 700, f2: 1100, type: 'sine', dur: 0.15, vol: 0.05 }); }
    else if (k === 'angry') a.tone({ f: 200, f2: 150, type: 'sawtooth', dur: 0.15, vol: 0.04, filter: 'lowpass', ff: 900 });
    else a.tone({ f: 990, type: 'sine', dur: 0.06, vol: 0.03 });
  }, 0.12);

  // ---------- forge ----------
  d('clang', (a, o) => {
    const v = o.vol ?? 1;
    const f = (o.pitch || 1) * R(780, 900);
    a.tone({ f, type: 'square', dur: 0.05, vol: 0.06 * v, filter: 'bandpass', ff: f * 2, q: 5 });
    a.tone({ f: f * 2.76, type: 'sine', dur: 0.6, vol: 0.06 * v, reverb: 0.35 });
    a.tone({ f: f * 5.4, type: 'sine', dur: 0.3, vol: 0.03 * v, reverb: 0.35 });
    a.noise({ filter: 'bandpass', f: 4000, q: 1.5, dur: 0.05, vol: 0.18 * v });
  }, 0.05);
  d('clunk', (a, o) => { const v = o.vol ?? 1; a.tone({ f: 260, f2: 180, type: 'triangle', dur: 0.12, vol: 0.12 * v }); a.noise({ filter: 'bandpass', f: 1200, q: 1.5, dur: 0.06, vol: 0.14 * v }); }, 0.05);
  d('bellows', (a, o) => a.noise({ color: 'pink', filter: 'lowpass', f: 350, f2: 900, dur: 0.55, a: 0.18, vol: 0.32 * (o.vol ?? 1) }), 0.15);
  d('quench', (a) => {
    a.noise({ color: 'white', filter: 'highpass', f: 2500, dur: 1.6, a: 0.01, vol: 0.28 });
    a.noise({ color: 'pink', filter: 'bandpass', f: 1200, f2: 600, q: 0.7, dur: 1.2, vol: 0.18 });
    for (let i = 0; i < 10; i++) a.tone({ f: R(400, 900), f2: R(900, 1800), slide: 0.05, type: 'sine', dur: 0.05, vol: 0.04, delay: R(0.1, 1.2) });
  }, 0.4);
  d('crack', (a) => { a.noise({ filter: 'highpass', f: 2000, dur: 0.08, vol: 0.25 }); a.tone({ f: 1800, f2: 400, type: 'square', dur: 0.12, vol: 0.05, filter: 'lowpass', ff: 2500 }); }, 0.15);
  d('sparkle', (a) => { for (let i = 0; i < 4; i++) a.tone({ f: R(2500, 4500), type: 'sine', dur: 0.08, vol: 0.03, delay: i * 0.05, reverb: 0.5 }); }, 0.1);
  d('whoosh', (a) => a.noise({ color: 'pink', filter: 'bandpass', f: 500, f2: 2000, q: 0.8, dur: 0.22, a: 0.06, vol: 0.18 }), 0.08);
  d('success', (a) => {
    [60, 64, 67, 72].forEach((m, i) => a.tone({ f: midiToFreq(m), type: 'square', dur: 0.12, vol: 0.05, delay: i * 0.09, filter: 'lowpass', ff: 3000, reverb: 0.3 }));
    a.tone({ f: midiToFreq(76), type: 'square', dur: 0.4, vol: 0.05, delay: 0.38, filter: 'lowpass', ff: 3000, reverb: 0.4, vib: 6 });
  }, 0.5);
  d('fail', (a) => { [64, 60, 57].forEach((m, i) => a.tone({ f: midiToFreq(m), type: 'triangle', dur: 0.18, vol: 0.07, delay: i * 0.15 })); }, 0.5);

  // ---------- cooking ----------
  d('chop', (a) => { a.tone({ f: R(500, 650), f2: 300, type: 'triangle', dur: 0.05, vol: 0.18 }); a.noise({ filter: 'bandpass', f: 2200, q: 1.5, dur: 0.035, vol: 0.12 }); }, 0.04);
  d('crack_egg', (a) => { a.noise({ filter: 'bandpass', f: 2500, q: 3, dur: 0.04, vol: 0.2 }); a.noise({ color: 'pink', filter: 'lowpass', f: 900, dur: 0.15, vol: 0.1, delay: 0.08 }); }, 0.1);
  d('stir', (a) => a.noise({ color: 'pink', filter: 'bandpass', f: R(600, 900), q: 1.5, dur: 0.2, a: 0.06, vol: 0.08 }), 0.12);
  d('pour', (a) => a.noise({ color: 'pink', filter: 'bandpass', f: 1500, f2: 900, q: 1, dur: 0.6, a: 0.1, vol: 0.12 }), 0.3);
  d('ding', (a) => { a.tone({ f: 1760, type: 'sine', dur: 0.8, vol: 0.08, reverb: 0.4 }); a.tone({ f: 1760 * 2.76, type: 'sine', dur: 0.3, vol: 0.02 }); }, 0.3);
  d('perfect', (a) => { [72, 76, 79, 84, 88, 91].forEach((m, i) => a.tone({ f: midiToFreq(m), type: 'square', dur: 0.08, vol: 0.05, delay: i * 0.055, filter: 'lowpass', ff: 4000, reverb: 0.3 })); }, 0.3);
  d('good', (a) => { [72, 76, 79].forEach((m, i) => a.tone({ f: midiToFreq(m), type: 'square', dur: 0.08, vol: 0.05, delay: i * 0.06, filter: 'lowpass', ff: 3500 })); }, 0.3);
  d('oops', (a) => { a.tone({ f: 400, f2: 250, type: 'triangle', dur: 0.25, vol: 0.08, vib: 8, vibRate: 9 }); }, 0.3);
  d('plate', (a) => { a.tone({ f: 1400, type: 'sine', dur: 0.25, vol: 0.05, reverb: 0.3 }); a.tone({ f: 2100, type: 'sine', dur: 0.15, vol: 0.03 }); }, 0.2);
  d('shake', (a) => { for (let i = 0; i < 3; i++) a.noise({ filter: 'bandpass', f: 5000, q: 1.5, dur: 0.04, vol: 0.06, delay: i * 0.05 }); }, 0.1);
  d('squish', (a) => { a.tone({ f: 170, f2: 110, type: 'triangle', dur: 0.09, vol: 0.12 }); a.noise({ color: 'pink', filter: 'lowpass', f: 700, dur: 0.07, vol: 0.08 }); }, 0.05);
  d('flip', (a) => { a.noise({ color: 'pink', filter: 'bandpass', f: 800, f2: 1600, q: 1, dur: 0.15, vol: 0.1 }); }, 0.1);

  // ---------- world ----------
  d('door', (a) => { a.tone({ f: 160, f2: 120, type: 'triangle', dur: 0.15, vol: 0.12 }); a.noise({ color: 'brown', filter: 'lowpass', f: 600, dur: 0.12, vol: 0.12 }); }, 0.2);
  d('bell', (a) => { a.tone({ f: 1046, type: 'sine', dur: 1.5, vol: 0.1, reverb: 0.5 }); a.tone({ f: 1046 * 2.4, type: 'sine', dur: 0.8, vol: 0.04, reverb: 0.5 }); }, 0.3);
  d('gate', (a) => { a.noise({ filter: 'bandpass', f: 1500, q: 3, dur: 0.3, vol: 0.14 }); a.tone({ f: 300, f2: 200, type: 'square', dur: 0.2, vol: 0.04, filter: 'lowpass', ff: 900 }); }, 0.2);
  d('place', (a) => { a.tone({ f: 330, f2: 260, type: 'triangle', dur: 0.08, vol: 0.12 }); a.noise({ color: 'brown', filter: 'lowpass', f: 700, dur: 0.06, vol: 0.12 }); }, 0.05);
  d('remove', (a) => { a.tone({ f: 260, f2: 440, type: 'triangle', dur: 0.08, vol: 0.1 }); }, 0.05);
  d('seagull', (a) => { for (let i = 0; i < 2; i++) a.tone({ f: 1500, f2: 1100, type: 'sawtooth', dur: 0.18, vol: 0.025, delay: i * 0.25, filter: 'bandpass', ff: 1800, q: 3, vib: 40, vibRate: 20 }); }, 1);
  d('firework', (a) => { a.tone({ f: 300, f2: 1600, type: 'sine', dur: 0.6, vol: 0.03 }); a.noise({ filter: 'lowpass', f: 2500, f2: 300, dur: 0.8, vol: 0.25, delay: 0.6 }); for (let i = 0; i < 8; i++) a.noise({ filter: 'highpass', f: 5000, dur: 0.03, vol: 0.05, delay: 0.7 + R(0, 0.6) }); }, 0.2);
  d('fanfare', (a) => {
    const seq = [[67, 0], [72, 0.14], [76, 0.28], [79, 0.42], [76, 0.62], [79, 0.76], [84, 0.95]];
    seq.forEach(([m, t]) => { a.tone({ f: midiToFreq(m), type: 'square', dur: 0.16, vol: 0.05, delay: t, filter: 'lowpass', ff: 3500, reverb: 0.3 }); a.tone({ f: midiToFreq(m - 12), type: 'triangle', dur: 0.16, vol: 0.06, delay: t }); });
  }, 1);
  d('rumble_hit', (a) => a.noise({ color: 'brown', filter: 'lowpass', f: 160, dur: 0.6, a: 0.1, vol: 0.4 }), 0.3);

  // ---------- loops ----------
  au.defineLoop('drill', (a, out) => {
    const s1 = a.oscSource(out, 'sawtooth', 70, 0.05);
    const s2 = a.oscSource(out, 'square', 141, 0.025);
    const n = a.noiseSource(out, 'white', 'bandpass', 2600, 1.2);
    n.gain.gain.value = 0.1;
    const lfo = a.ctx.createOscillator();
    const lg = a.ctx.createGain();
    lfo.frequency.value = 32;
    lg.gain.value = 10;
    lfo.connect(lg).connect(s1.osc.frequency);
    lfo.start();
    return {
      set(p) {
        if (p.load !== undefined) {
          const f = 70 + p.load * 50;
          s1.osc.frequency.setTargetAtTime(f, a.ctx.currentTime, 0.05);
          s2.osc.frequency.setTargetAtTime(f * 2.01, a.ctx.currentTime, 0.05);
          n.filter.frequency.setTargetAtTime(2000 + p.load * 2500, a.ctx.currentTime, 0.05);
        }
      },
      stop() { s1.stop(); s2.stop(); n.stop(); try { lfo.stop(); } catch (e) { /* */ } },
    };
  });
  const crackleLoop = (base, freq, crackleRate) => (a, out, p) => {
    const n = a.noiseSource(out, 'brown', 'lowpass', freq, 0.5);
    n.gain.gain.value = base;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      if (Math.random() < crackleRate) a.noise({ filter: 'bandpass', f: R(1500, 4500), q: 2, dur: 0.015, vol: R(0.02, 0.07) * (p.crackle ?? 1), bus: out });
      setTimeout(tick, R(30, 110));
    };
    tick();
    return {
      set(q) { if (q.intensity !== undefined) n.filter.frequency.setTargetAtTime(freq * (0.6 + q.intensity), a.ctx.currentTime, 0.1); },
      stop() { alive = false; n.stop(); },
    };
  };
  au.defineLoop('fire', crackleLoop(0.35, 380, 0.45));
  au.defineLoop('forge_fire', crackleLoop(0.55, 520, 0.6));
  au.defineLoop('rumble', (a, out) => {
    const n = a.noiseSource(out, 'brown', 'lowpass', 140, 1);
    n.gain.gain.value = 1;
    return { stop() { n.stop(); } };
  });
  au.defineLoop('xray', (a, out) => {
    const o1 = a.oscSource(out, 'sine', 330, 0.03);
    const o2 = a.oscSource(out, 'sine', 333.5, 0.03);
    const n = a.noiseSource(out, 'white', 'highpass', 7000, 0.5);
    n.gain.gain.value = 0.015;
    return { stop() { o1.stop(); o2.stop(); n.stop(); } };
  });
  au.defineLoop('water', (a, out) => {
    const n = a.noiseSource(out, 'pink', 'bandpass', 700, 0.8);
    n.gain.gain.value = 0.25;
    let alive = true;
    const tick = () => { if (!alive) return; a.play('bubble', { gap: 0 }); setTimeout(tick, R(120, 600)); };
    tick();
    return { stop() { alive = false; n.stop(); } };
  });
  au.defineLoop('lava', (a, out) => {
    const n = a.noiseSource(out, 'brown', 'lowpass', 180, 1);
    n.gain.gain.value = 0.6;
    let alive = true;
    const tick = () => { if (!alive) return; a.play('bloop', { gap: 0 }); setTimeout(tick, R(300, 1200)); };
    tick();
    return { stop() { alive = false; n.stop(); } };
  });
  au.defineLoop('sizzle', (a, out) => {
    const n = a.noiseSource(out, 'white', 'highpass', 3500, 0.5);
    n.gain.gain.value = 0.18;
    const lfo = a.ctx.createOscillator();
    const lg = a.ctx.createGain();
    lfo.frequency.value = 7;
    lg.gain.value = 0.08;
    lfo.connect(lg).connect(n.gain.gain);
    lfo.start();
    return { stop() { n.stop(); try { lfo.stop(); } catch (e) { /* */ } } };
  });
  au.defineLoop('boil', (a, out) => {
    const n = a.noiseSource(out, 'brown', 'lowpass', 260, 1);
    n.gain.gain.value = 0.25;
    let alive = true;
    const tick = () => { if (!alive) return; const f = R(200, 500); a.tone({ f, f2: f * 2, slide: 0.05, type: 'sine', dur: 0.06, vol: 0.05, bus: out }); setTimeout(tick, R(60, 260)); };
    tick();
    return { stop() { alive = false; n.stop(); } };
  });
  au.defineLoop('wind', (a, out) => {
    const n = a.noiseSource(out, 'pink', 'bandpass', 500, 0.6);
    n.gain.gain.value = 0.25;
    const lfo = a.ctx.createOscillator();
    const lg = a.ctx.createGain();
    lfo.frequency.value = 0.13;
    lg.gain.value = 300;
    lfo.connect(lg).connect(n.filter.frequency);
    lfo.start();
    return { stop() { n.stop(); try { lfo.stop(); } catch (e) { /* */ } } };
  });
  au.defineLoop('waves', (a, out) => {
    const n = a.noiseSource(out, 'pink', 'lowpass', 900, 0.4);
    n.gain.gain.value = 0.25;
    const lfo = a.ctx.createOscillator();
    const lg = a.ctx.createGain();
    lfo.frequency.value = 0.11;
    lg.gain.value = 0.22;
    lfo.connect(lg).connect(n.gain.gain);
    lfo.start();
    const lfo2 = a.ctx.createOscillator();
    const lg2 = a.ctx.createGain();
    lfo2.frequency.value = 0.11;
    lg2.gain.value = 500;
    lfo2.connect(lg2).connect(n.filter.frequency);
    lfo2.start();
    return { stop() { n.stop(); try { lfo.stop(); lfo2.stop(); } catch (e) { /* */ } } };
  });
  au.defineLoop('elevator', (a, out) => {
    const o = a.oscSource(out, 'sawtooth', 55, 0.04);
    const n = a.noiseSource(out, 'brown', 'lowpass', 300, 1);
    n.gain.gain.value = 0.4;
    let alive = true;
    const tick = () => { if (!alive) return; a.noise({ filter: 'bandpass', f: R(800, 1600), q: 4, dur: 0.03, vol: 0.05, bus: out }); setTimeout(tick, R(150, 500)); };
    tick();
    return { stop() { alive = false; o.stop(); n.stop(); } };
  });
  au.defineLoop('grind', (a, out) => {
    const n = a.noiseSource(out, 'white', 'bandpass', 3200, 2);
    n.gain.gain.value = 0.25;
    const o = a.oscSource(out, 'sawtooth', 220, 0.015);
    return { stop() { n.stop(); o.stop(); } };
  });
  au.defineLoop('hum', (a, out, p) => {
    const o1 = a.oscSource(out, 'sine', p.f || 110, 0.05);
    const o2 = a.oscSource(out, 'sine', (p.f || 110) * 1.5 + 0.7, 0.025);
    return { stop() { o1.stop(); o2.stop(); } };
  });

  registerMusic(au);
}

// ---------------- music ----------------
// Melody strings: one char per 8th note; digits = scale degree (1 = root), '-' rest,
// '=' hold previous. Letters a/b/c = degrees 10/11/12; '0' = degree below root.
function degreeToMidi(scale, root, deg) {
  const idx = deg - 1;
  const oct = Math.floor(idx / scale.length);
  const n = ((idx % scale.length) + scale.length) % scale.length;
  return root + scale[n] + oct * 12;
}
function parseMelody(str) {
  const out = [];
  for (const ch of str.replace(/[|\s]/g, '')) {
    if (ch === '-') out.push(null);
    else if (ch === '=') out.push('=');
    else if (ch === '0') out.push(0);
    else if (/[a-c]/.test(ch)) out.push(10 + ch.charCodeAt(0) - 97);
    else out.push(parseInt(ch, 10));
  }
  return out;
}
function melodyVoice(api, inst, scale, root, mel, step, time, vol, extra) {
  if (step % 2 !== 0) return; // 8th notes
  const i = (step / 2) % mel.length;
  const deg = mel[i];
  if (deg === null || deg === '=') return;
  let len = 1;
  while (mel[(i + len) % mel.length] === '=' && len < 8) len++;
  api.note(inst, degreeToMidi(scale, root, deg), time, api.stepDur * 2 * len, vol, extra);
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PENTA_MIN = [0, 3, 5, 7, 10];

function chordTones(scale, root, deg) {
  return [degreeToMidi(scale, root, deg), degreeToMidi(scale, root, deg + 2), degreeToMidi(scale, root, deg + 4)];
}

function registerMusic(au) {
  // Title: warm, wistful, a little hopeful (A minor → C)
  const titleMel = parseMelody('5-6-5-3-|2=--1-2-|3-5-6-8-|7===----|5-6-5-3-|2=--3-2-|1-2-3-5-|3===----');
  au.defineTrack('title', {
    bpm: 80, gain: 0.85,
    tick(api, step, t) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const prog = [6, 4, 1, 5];
      const deg = prog[bar % 4];
      const ch = chordTones(MAJOR, 60, deg);
      if (s === 0) ch.forEach((m) => api.note('pad', m - 12, t, api.stepDur * 16, 0.9, { cutoff: 1100, attack: 0.6 }));
      if (s % 4 === 0) api.note('bass', ch[0] - 24, t, api.stepDur * 3, 0.8);
      if (s % 2 === 0) api.note('pluck', ch[(s / 2) % 3] + (s >= 8 ? 12 : 0), t, api.stepDur * 2, 0.55);
      if (bar >= 2) melodyVoice(api, 'bell', MAJOR, 72, titleMel, step - 32, t, 0.8);
    },
  });

  // Town: bouncy folk waltz-ish in F
  const townMel = parseMelody('5-3-1-35|6-5-3-2-|4-6-8-64|5==-3-2-|1-3-5-86|5-4-3-2-|4-3-2-1-|1==-----');
  au.defineTrack('town', {
    bpm: 104, gain: 0.8, swing: 0.12,
    tick(api, step, t) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const prog = [1, 6, 4, 5, 1, 6, 2, 5];
      const ch = chordTones(MAJOR, 65, prog[bar % 8]);
      if (s === 0 || s === 8) api.note('bass', (s === 0 ? ch[0] : ch[2]) - 24, t, api.stepDur * 3, 0.9);
      if (s === 4 || s === 12) ch.forEach((m) => api.note('uke', m - 12, t, api.stepDur * 2, 0.5));
      if (s % 4 === 2) api.drum('shaker', t, 0.8);
      if (s === 0) api.drum('wood', t, 0.35);
      melodyVoice(api, 'accordion', MAJOR, 65, townMel, step, t, 0.9);
    },
  });

  // Home: music box lullaby in G
  const homeMel = parseMelody('3-5-8-7-|6=--5---|4-6-8-6-|5===----|3-5-8-a-|9=--8---|7-6-5-4-|3===----');
  au.defineTrack('home', {
    bpm: 76, gain: 0.8,
    tick(api, step, t) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const prog = [1, 6, 4, 5];
      const ch = chordTones(MAJOR, 67, prog[bar % 4]);
      if (s === 0) api.note('bass', ch[0] - 24, t, api.stepDur * 8, 0.6);
      if (s % 2 === 0) api.note('bell', ch[(s / 2) % 3] + 12, t, api.stepDur * 2, 0.35, { reverb: 0.3 });
      melodyVoice(api, 'bell', MAJOR, 67, homeMel, step, t, 0.75);
    },
  });

  // Mine: sparse ambient drone + pentatonic drips. params.depth (0..1) darkens it.
  au.defineTrack('mine', {
    bpm: 56, gain: 0.9,
    tick(api, step, t) {
      const depth = api.params.depth || 0;
      const root = 50 - Math.round(depth * 7);
      const s = step % 64;
      if (s === 0) {
        api.note('drone', root - 12, t, api.stepDur * 64, 0.9, { cutoff: 260 - depth * 80 });
        api.note('pad', root + 3, t, api.stepDur * 32, 0.5, { cutoff: 600 - depth * 200, attack: 2 });
      }
      if (s === 32) api.note('pad', root + 7, t, api.stepDur * 32, 0.45, { cutoff: 600 - depth * 200, attack: 2 });
      if (step % 2 === 0 && Math.random() < 0.13) {
        const deg = PENTA_MIN[(Math.random() * PENTA_MIN.length) | 0];
        api.note('pluck', root + 12 + deg + (Math.random() < 0.3 ? 12 : 0), t, api.stepDur * 3, 0.45, { reverb: 0.7 });
      }
      if (Math.random() < 0.03) api.drum('drip', t + Math.random() * 0.1, 1);
    },
  });

  // Forge: driving, heroic D minor with anvil rhythm
  const forgeMel = parseMelody('1-1-3-5-|4=--3-2-|1-1-3-5-|7===----|8-7-5-4-|3=--2-1-|2-3-4-5-|1===----');
  au.defineTrack('forge', {
    bpm: 96, gain: 0.75,
    tick(api, step, t) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const prog = [1, 6, 7, 5];
      const ch = chordTones(MINOR, 62, prog[bar % 4]);
      if (s === 0) ch.forEach((m) => api.note('pad', m - 12, t, api.stepDur * 16, 0.8, { cutoff: 1000, attack: 0.2 }));
      if (s % 2 === 0) api.note('bass', ch[0] - 24 + (s % 8 === 6 ? 7 : 0), t, api.stepDur * 1.6, 0.9);
      if (s === 0 || s === 6 || s === 8) api.drum('kick', t, 0.8);
      if (s === 4 || s === 12) api.note('anvil', 81, t, 0.2, 0.9);
      if (bar % 8 >= 4) melodyVoice(api, 'lead', MINOR, 62, forgeMel, step, t, 0.8);
    },
  });

  // Cooking: upbeat, cute, marimba in C
  const cookMel = parseMelody('1-3-5-3-|4-6-8-6-|5-3-4-2-|3-1-2-5-|1-3-5-8-|a-8-6-4-|5-4-3-2-|1=-5-1--');
  au.defineTrack('cooking', {
    bpm: 132, gain: 0.75,
    tick(api, step, t) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const prog = [1, 4, 5, 1, 6, 4, 5, 1];
      const ch = chordTones(MAJOR, 60, prog[bar % 8]);
      if (s % 4 === 0) api.note('bass', ch[s % 8 === 0 ? 0 : 2] - 24, t, api.stepDur * 1.5, 0.9);
      if (s % 4 === 2) ch.forEach((m) => api.note('pluck', m, t, api.stepDur, 0.35, { reverb: 0.1 }));
      if (s % 2 === 1) api.drum('hat', t, 0.7);
      if (s === 4 || s === 12) api.drum('clap', t, 0.6);
      melodyVoice(api, 'marimba', MAJOR, 72, cookMel, step, t, 0.8);
    },
  });

  // Beach: relaxed ukulele in E
  const beachMel = parseMelody('5=-3-5-6|5===3---|4=-2-4-5|3=======|5=-3-5-8|7===6---|5=-4-3-2|1=======');
  au.defineTrack('beach', {
    bpm: 84, gain: 0.85, swing: 0.15,
    tick(api, step, t) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const prog = [1, 6, 4, 5];
      const ch = chordTones(MAJOR, 64, prog[bar % 4]);
      if (s === 0 || s === 10) api.note('bass', ch[0] - 24, t, api.stepDur * 4, 0.7);
      if ([0, 3, 6, 8, 10, 12, 14].includes(s)) ch.forEach((m, i) => api.note('uke', m, t + i * 0.012, api.stepDur * 2, 0.4));
      if (s % 2 === 0) api.drum('shaker', t, 0.6);
      if (bar >= 2) melodyVoice(api, 'organ', MAJOR, 76, beachMel, step, t, 0.7);
    },
  });

  // Elevator / ending ascent: rising arpeggios
  au.defineTrack('ascent', {
    bpm: 112, gain: 0.8,
    tick(api, step, t) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const prog = [6, 4, 1, 5, 6, 4, 2, 5];
      const ch = chordTones(MAJOR, 60, prog[bar % 8]);
      if (s === 0) ch.forEach((m) => api.note('pad', m, t, api.stepDur * 16, 0.8, { cutoff: 1500, attack: 0.3 }));
      api.note('pluck', ch[s % 3] + 12 + (s >= 8 ? 12 : 0), t, api.stepDur, 0.4);
      if (s % 4 === 0) api.note('bass', ch[0] - 24, t, api.stepDur * 3, 0.8);
      if (s % 8 === 4) api.drum('snare', t, 0.4);
      if (s % 8 === 0) api.drum('kick', t, 0.6);
    },
  });
}

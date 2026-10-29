// The forest's sounds, synthesized (registered once on the game's audio, all named forest_*):
//   loops     forest_leaves (leaves rustling in slow gusts, a low wind under them),
//             forest_brook (a babbling stream: bubbling noise and little bloops)
//   one-shots forest_song (a songbird phrase: kind 'trill' | 'robin' | 'cuckoo' | 'dove' | 'wren'),
//             forest_squirrel, forest_flutter, forest_flock, forest_woodpecker, forest_frog,
//             forest_deer, forest_snap (a root tearing), forest_groan (a tree's long creak),
//             forest_chest (the lid's creak), forest_chord (gold and gems: a magical shimmer)
//   forestSounds(audio): define them (idempotent).
const R = (a, b) => a + Math.random() * (b - a);

export function forestSounds(au) {
  if (!au || au.presets?.forest_song) return;
  const d = (name, fn, gap) => au.define(name, fn, gap);

  au.defineLoop('forest_leaves', (a, out) => {
    const hi = a.noiseSource(out, 'pink', 'bandpass', 3200, 0.45);
    hi.gain.gain.value = 0.08;
    const lo = a.noiseSource(out, 'brown', 'lowpass', 360, 0.7);
    lo.gain.gain.value = 0.16;
    let alive = true;
    const gust = () => {
      if (!alive) return;
      const t = a.ctx.currentTime, g = R(0.04, 0.24);
      hi.gain.gain.setTargetAtTime(g, t, 0.9);
      lo.gain.gain.setTargetAtTime(0.08 + g * 0.6, t, 1.3);
      hi.filter.frequency.setTargetAtTime(R(2200, 4600), t, 1.1);
      setTimeout(gust, R(1400, 4200));
    };
    gust();
    return { stop() { alive = false; hi.stop(); lo.stop(); } };
  });
  au.defineLoop('forest_brook', (a, out) => {
    const n = a.noiseSource(out, 'pink', 'bandpass', 1100, 0.9);
    n.gain.gain.value = 0.22;
    const t2 = a.noiseSource(out, 'white', 'highpass', 5200, 0.5);
    t2.gain.gain.value = 0.025;
    let alive = true;
    const bloop = () => {
      if (!alive) return;
      const f = R(500, 1500);
      a.tone({ f, f2: f * R(1.3, 2.2), type: 'sine', dur: R(0.03, 0.07), vol: R(0.02, 0.05), a: 0.003, release: 0.03, bus: out });
      n.filter.frequency.setTargetAtTime(R(800, 1500), a.ctx.currentTime, 0.2);
      setTimeout(bloop, R(60, 260));
    };
    bloop();
    return { stop() { alive = false; n.stop(); t2.stop(); } };
  });

  d('forest_song', (a, o) => {
    const kind = o.kind || 'trill', pan = o.pan || 0, vol = o.vol ?? 0.03, p = o.pitch || 1;
    const tone = (f, f2, dur, delay, v = vol, type = 'sine', extra = {}) => a.tone({ f: f * p, f2: f2 * p, type, dur, vol: v, a: 0.006, release: 0.05, delay, pan, reverb: 0.4, ...extra });
    if (kind === 'cuckoo') { tone(690, 660, 0.22, 0, vol * 1.2); tone(560, 540, 0.32, 0.32, vol * 1.2); }
    else if (kind === 'dove') { for (let i = 0; i < 3; i++) tone(380, i === 1 ? 330 : 360, i === 1 ? 0.5 : 0.28, i * 0.55, vol * 1.3, 'sine', { vib: 8, vibRate: 7 }); }
    else if (kind === 'wren') { let t = 0; for (let i = 0; i < 14; i++) { const f = R(3600, 5200); tone(f, f * R(0.8, 1.2), 0.035, t, vol * 0.8); t += 0.05; } }
    else if (kind === 'robin') { let t = 0; for (let i = 0; i < 5; i++) { const f = R(2600, 4200); tone(f, f * R(0.6, 1.5), R(0.08, 0.16), t, vol); t += R(0.12, 0.22); } }
    else { let t = 0; const base = R(2600, 3800); for (let i = 0; i < 3 + ((Math.random() * 4) | 0); i++) { const f = base * (1 + (Math.random() - 0.4) * 0.35); tone(f, f * (Math.random() < 0.5 ? 1.35 : 0.72), R(0.07, 0.13), t); t += R(0.09, 0.17); } }
  }, 0.05);
  d('forest_squirrel', (a) => { let t = 0; for (let i = 0; i < 7; i++) { a.tone({ f: R(2400, 3200), f2: R(1500, 2000), type: 'square', dur: 0.03, vol: 0.02, delay: t, filter: 'bandpass', ff: 2600, q: 2 }); t += R(0.05, 0.08); } a.noise({ color: 'pink', filter: 'bandpass', f: 3000, dur: 0.35, vol: 0.05, delay: 0.1 }); });
  d('forest_flutter', (a, o) => { for (let i = 0; i < 6; i++) a.noise({ color: 'pink', filter: 'bandpass', f: R(900, 1500), q: 1.2, dur: 0.05, vol: (o.vol ?? 0.06) * (1 - i * 0.12), delay: i * 0.06, pan: o.pan || 0 }); });
  d('forest_flock', (a) => {
    for (let i = 0; i < 26; i++) a.noise({ color: 'pink', filter: 'bandpass', f: R(700, 1700), q: 1, dur: 0.05, vol: R(0.03, 0.07), delay: R(0, 1.2), pan: R(-0.8, 0.8) });
    for (let i = 0; i < 5; i++) a.tone({ f: R(2600, 4200), f2: R(1800, 3000), type: 'sine', dur: 0.08, vol: 0.025, delay: R(0, 0.9), pan: R(-0.7, 0.7), reverb: 0.4 });
  }, 0.5);
  d('forest_woodpecker', (a, o) => { const n = 9 + ((Math.random() * 5) | 0); for (let i = 0; i < n; i++) a.noise({ color: 'white', filter: 'bandpass', f: 1500, q: 3, dur: 0.018, vol: (o.vol ?? 0.07) * (1 - i / n * 0.6), delay: i * 0.052, pan: o.pan || 0.3, reverb: 0.5 }); }, 0.6);
  d('forest_frog', (a) => { for (let i = 0; i < 2; i++) a.tone({ f: 190, f2: 150, type: 'square', dur: 0.09, vol: 0.04, delay: i * 0.14, filter: 'lowpass', ff: 700, vib: 30, vibRate: 40 }); }, 0.4);
  d('forest_deer', (a) => { a.noise({ color: 'pink', filter: 'bandpass', f: 600, q: 0.8, dur: 0.25, vol: 0.06, a: 0.02 }); for (let i = 0; i < 6; i++) a.tone({ f: 90, f2: 60, type: 'sine', dur: 0.06, vol: 0.06, delay: 0.25 + i * 0.16 }); }, 1);
  d('forest_snap', (a, o) => {
    const v = o.vol ?? 0.3;
    a.noise({ color: 'white', filter: 'highpass', f: 1800, dur: 0.05, vol: v, a: 0.001 });
    a.noise({ color: 'pink', filter: 'bandpass', f: R(400, 900), q: 1.5, dur: 0.18, vol: v * 0.6, delay: 0.01 });
    a.tone({ f: 140, f2: 60, type: 'triangle', dur: 0.12, vol: v * 0.5 });
  }, 0.04);
  d('forest_groan', (a, o) => {
    const f = R(70, 110) * (o.pitch || 1);
    a.tone({ f, f2: f * R(0.75, 0.9), type: 'sawtooth', dur: R(0.9, 1.6), vol: o.vol ?? 0.05, a: 0.2, release: 0.4, filter: 'lowpass', ff: 420, vib: 4, vibRate: 5, reverb: 0.4 });
  }, 0.3);
  d('forest_chest', (a) => { a.tone({ f: 220, f2: 320, type: 'sawtooth', dur: 0.5, vol: 0.04, a: 0.03, filter: 'lowpass', ff: 900, vib: 14, vibRate: 22 }); });
  d('forest_chord', (a, o) => {
    const v = o.vol ?? 0.05;
    [72, 76, 79, 83, 86, 91].forEach((m, i) => {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      a.tone({ f, type: i % 2 ? 'triangle' : 'sine', dur: 1.6 - i * 0.12, vol: v * (1 - i * 0.1), a: 0.02, delay: i * 0.09, reverb: 0.7, sustain: true, release: 0.8 });
    });
    for (let i = 0; i < 10; i++) a.tone({ f: R(3000, 6000), type: 'sine', dur: 0.05, vol: v * 0.4, delay: 0.3 + i * R(0.06, 0.12), reverb: 0.6, pan: R(-0.6, 0.6) });
  }, 0.8);
}

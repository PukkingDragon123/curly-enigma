// The forest's sounds, all from the game's recordings (src/audio, played through src/core/Audio.js;
// nothing here makes a sound of its own). The single-shot names the journey uses (forest_song,
// forest_squirrel, forest_flutter, forest_flock, forest_woodpecker, forest_frog, forest_deer,
// forest_snap, forest_groan, forest_chest, forest_chord) and the loops forest_leaves and
// forest_brook are recorded presets in src/core/sounds.js. This file adds the layers that make the
// wood sound deep and alive (wave 8):
//   loops     forest_air     wind high in the crowns: a low roar that swells and falls in slow
//                            gusts, the leaves hissing and rattling on top of each gust, now and
//                            then a branch creaking far up
//             forest_chorus  the evening chorus, placed in space: near birds bright and close, far
//                            ones dull and echoing; calls answered from the other side of the trail,
//                            a dove somewhere deep in the wood, a woodpecker drumming far off.
//                            set({ density: 0..1 }) thins it (the clearing; the ground groaning)
//   one-shots forest_rustle  the undergrowth stirring in a gust ({ pan, vol })
//             forest_twig    a twig snapping under foot or in the wood ({ pan, vol, far })
//             forest_crunch  dry leaves under his boot ({ vol })
//   forestSounds(audio): define them (idempotent).
const R = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];

export function forestSounds(au) {
  if (!au || au.loopDefs?.forest_chorus) return;
  /** Recorded one-shots dropped into a loop's output every [min, max] s while alive() holds. */
  const every = (alive, min, max, fn, first = 0.5) => {
    const tick = () => { if (!alive()) return; try { fn(); } catch (e) { /* audio gone */ } setTimeout(tick, R(min, max) * 1000); };
    setTimeout(tick, R(min, max) * 1000 * first);
  };

  au.defineLoop('forest_air', (a, out) => {
    const low = a.bed(out, 'lp_wind', { rate: 0.62, vol: 0.55, filter: 'lowpass', ff: 520 });
    const hiss = a.bed(out, 'lp_wind', { rate: 1.25, vol: 0.12, filter: 'bandpass', ff: 2600, q: 0.6, offset: 0.37 });
    let alive = true, gust = 0.4;
    const live = () => alive && !!a.ctx;
    // slow gusts: the low roar swells first, the leaves answer a moment later
    every(live, 2.2, 5.5, () => {
      const t = a.ctx.currentTime;
      gust = R(0.15, 1);
      low.gain.gain.setTargetAtTime(0.35 + gust * 0.45, t, 1.4);
      low.filter.frequency.setTargetAtTime(380 + gust * 420, t, 1.6);
      hiss.gain.gain.setTargetAtTime(0.05 + gust * 0.22, t + 0.5, 1.1);
      if (gust > 0.55) for (let i = 0; i < 2; i++) a.sample(['rustle1', 'rustle2', 'rustle3'], { bus: out, vol: 0.12 + gust * 0.14, pitch: R(0.85, 1.25), pan: R(-0.9, 0.9), delay: 0.6 + i * R(0.3, 0.9), reverb: 0.25, filter: 'highpass', ff: 900 });
    }, 0.2);
    // a branch creaking high up, now and then, when the wind leans on it
    every(live, 7, 16, () => {
      if (gust < 0.4) return;
      a.sample(['creak1', 'creak2', 'tree_groan'], { bus: out, vol: R(0.05, 0.11), pitch: R(0.45, 0.7), pan: R(-0.8, 0.8), reverb: 0.7, filter: 'lowpass', ff: 1100, jit: 0.08 });
    });
    return { stop() { alive = false; low.stop(); hiss.stop(); } };
  });

  au.defineLoop('forest_chorus', (a, out) => {
    let alive = true, density = 1;
    const live = () => alive && !!a.ctx;
    const SONG = ['bird1', 'bird2', 'bird5', 'bird6', 'bird4', 'chirp1', 'chirp2'];
    const call = (o = {}) => {
      const far = o.far ?? Math.random() < 0.55;
      const id = o.id || pick(SONG);
      const pan = o.pan ?? R(-0.95, 0.95);
      const pitch = (o.pitch ?? R(0.88, 1.22)) * (id.startsWith('chirp') ? 1.15 : 1);
      a.sample(id, far
        ? { bus: out, vol: R(0.09, 0.16), pitch, pan: pan * 0.8, reverb: 0.7, filter: 'lowpass', ff: R(1800, 2800), delay: o.delay || 0, jit: 0.04 }
        : { bus: out, vol: R(0.2, 0.32), pitch, pan, reverb: 0.3, delay: o.delay || 0, jit: 0.04 });
      return { id, pan, pitch, far };
    };
    every(live, 0.5, 2.3, () => {
      if (Math.random() > density) return;
      const c = call();
      // often answered: the same kind of bird, from across the trail
      if (Math.random() < 0.45) call({ id: c.id, pan: -c.pan * R(0.5, 1), pitch: c.pitch * R(0.95, 1.06), far: !c.far, delay: R(0.7, 1.6) });
    }, 0.15);
    // a dove crooning deep in the wood, a cuckoo across the valley
    every(live, 9, 18, () => {
      if (Math.random() > density) return;
      if (Math.random() < 0.6) for (let i = 0; i < 3; i++) a.sample('bird6', { bus: out, vol: 0.1, pitch: 0.62, pan: -0.6, reverb: 0.8, filter: 'lowpass', ff: 1400, delay: i * 0.75, jit: 0.02 });
      else for (let i = 0; i < 2; i++) a.sample('bird3', { bus: out, vol: 0.08, pitch: 0.9, pan: 0.7, reverb: 0.8, filter: 'lowpass', ff: 1800, delay: i * 0.55, jit: 0 });
    });
    // a woodpecker drumming far off
    every(live, 11, 22, () => {
      if (Math.random() > density) return;
      const n = 10 + ((Math.random() * 6) | 0), pan = R(-0.9, 0.9);
      for (let i = 0; i < n; i++) a.sample('knock', { bus: out, vol: 0.13 * (1 - (i / n) * 0.6), pitch: 1.5, jit: 0.02, delay: i * 0.055, pan, reverb: 0.75, filter: 'lowpass', ff: 2200 });
    });
    return { set(p) { if (p.density != null) density = Math.max(0, Math.min(1, p.density)); }, stop() { alive = false; } };
  });

  au.define('forest_rustle', (a, o = {}) => a.sample(['rustle1', 'rustle2', 'rustle3', 'brush1', 'brush2'], { vol: (o.vol ?? 1) * 0.22, pitch: R(1.05, 1.5), pan: o.pan || 0, filter: 'highpass', ff: 700, dur: R(0.25, 0.45), release: 0.12 }), 0.15);
  au.define('forest_twig', (a, o = {}) => a.sample(['snap2', 'snap1', 'tick2'], { vol: (o.vol ?? 1) * (o.far ? 0.12 : 0.28), pitch: R(1.2, 1.7), pan: o.pan || 0, reverb: o.far ? 0.6 : 0.15, filter: o.far ? 'lowpass' : undefined, ff: 2000 }), 0.2);
  au.define('forest_crunch', (a, o = {}) => a.sample(['brush1', 'brush2', 'brush3'], { vol: (o.vol ?? 1) * 0.16, pitch: R(1.1, 1.5), jit: 0.08, dur: 0.18, release: 0.06 }), 0.12);
  // the raptor egg (wave 10): a faint peep from inside the shell, the tick of the shell, his kerchief
  // wrapped round it, the bundle stowed on his pack
  au.define('forest_eggchirp', (a, o = {}) => {
    a.sample(['squeak1', 'squeak2', 'squeak3', 'chirp1'], { vol: (o.vol ?? 1) * 0.2, pitch: R(1.55, 1.95), pan: o.pan || 0, reverb: 0.3, filter: o.muffled ? 'lowpass' : undefined, ff: 1900 });
    if (o.n > 1) a.sample(['squeak1', 'squeak2', 'chirp1'], { vol: (o.vol ?? 1) * 0.14, pitch: R(1.7, 2.0), pan: o.pan || 0, reverb: 0.3, delay: R(0.16, 0.24), filter: o.muffled ? 'lowpass' : undefined, ff: 1900 });
  }, 0.2);
  au.define('forest_eggtick', (a, o = {}) => a.sample(['crack1', 'crack2', 'crack3', 'tick1'], { vol: (o.vol ?? 1) * 0.1, pitch: R(1.6, 2.0), pan: o.pan || 0, dur: R(0.08, 0.14), release: 0.04, filter: 'highpass', ff: 1200, reverb: 0.2 }), 0.08);
  au.define('forest_wrap', (a, o = {}) => {
    a.sample(['brush1', 'brush2', 'brush3'], { vol: (o.vol ?? 1) * 0.22, pitch: R(0.8, 1.0), pan: o.pan || 0, dur: R(0.35, 0.5), release: 0.15 });
    a.sample(['rustle1', 'rustle2', 'rustle3'], { vol: (o.vol ?? 1) * 0.1, pitch: R(1.2, 1.5), pan: o.pan || 0, delay: R(0.1, 0.2), filter: 'highpass', ff: 900, dur: 0.3, release: 0.1 });
  }, 0.15);
  au.define('forest_stow', (a, o = {}) => {
    a.sample(['brush1', 'brush2'], { vol: (o.vol ?? 1) * 0.2, pitch: R(0.7, 0.85), dur: 0.3, release: 0.1 });
    a.sample(['latch1', 'latch2'], { vol: (o.vol ?? 1) * 0.12, pitch: R(1.1, 1.3), delay: 0.22 });
  }, 0.3);
  // the small birds' own voices (forest/critters.js): a call, a tiny peck in the litter, a flock lifting off
  au.define('forest_chirp', (a, o = {}) => a.sample(['chirp1', 'chirp2', 'bird5', 'bird4'], { vol: (o.vol ?? 1) * 0.22, pitch: (o.pitch ?? 1) * R(1.05, 1.35), pan: o.pan || 0, reverb: 0.25, jit: 0.04 }), 0.06);
  au.define('forest_peck', (a, o = {}) => a.sample(['tick1', 'tick2'], { vol: (o.vol ?? 1) * 0.06, pitch: R(1.8, 2.4), pan: o.pan || 0, dur: 0.05, release: 0.02 }), 0.05);
  au.define('forest_takeoff', (a, o = {}) => {
    const n = o.n || 4;
    for (let i = 0; i < n; i++) a.sample(['flap1', 'flap2'], { vol: (o.vol ?? 1) * R(0.18, 0.3), pitch: R(1.4, 1.9), pan: (o.pan || 0) + R(-0.15, 0.15), delay: i * R(0.03, 0.08), jit: 0.05 });
  }, 0.25);
}

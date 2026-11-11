// The title cave's sounds, all from the game's recordings (src/audio, played through
// src/core/Audio.js; nothing here synthesizes a sound):
//   loops     cave_air    the chamber's breath: a low, slow wind through the rock, now and then a
//                         far drip ringing round the dome or a pebble ticking down a wall
//             cave_water  a thin trickle somewhere behind the glowcaps
//   one-shots cave_drip / cave_plink   a drop landing on stone / in the pool ({ pan, vol, far })
//             chase_step   the mole's quick paws on loam      chase_rstep  the raptor's heavy feet
//             chase_screech / chase_bark / chase_snap / chase_skid   the raptor
//             chase_squish / chase_brush / chase_puff / chase_thud   mushrooms knocked about
//             egg_crack    a short crack in a shell ({ vol, pitch })   egg_hatch  the shell gives
//             egg_chirp    the hatchling                              egg_break  an egg smashed
//   caveSounds(audio): define them (idempotent).
const R = (a, b) => a + Math.random() * (b - a);

export function caveSounds(au) {
  if (!au || !au.define || au.loopDefs?.cave_air) return;
  const every = (alive, min, max, fn, first = 0.5) => {
    const tick = () => { if (!alive()) return; try { fn(); } catch (e) { /* audio gone */ } setTimeout(tick, R(min, max) * 1000); };
    setTimeout(tick, R(min, max) * 1000 * first);
  };
  au.defineLoop('cave_air', (a, out) => {
    const low = a.bed(out, 'lp_wind', { rate: 0.45, vol: 0.42, filter: 'lowpass', ff: 360 });
    let alive = true;
    const live = () => alive && !!a.ctx;
    every(live, 3, 7, () => {
      const t = a.ctx.currentTime, g = R(0.2, 1);
      low.gain.gain.setTargetAtTime(0.25 + g * 0.3, t, 2.2);
      low.filter.frequency.setTargetAtTime(260 + g * 220, t, 2.4);
    }, 0.3);
    // far drops ringing round the dome, a pebble ticking down a wall
    every(live, 2.5, 6, () => a.sample(['drip1', 'drip2', 'drip3', 'drip4'], { bus: out, vol: R(0.05, 0.12), pitch: R(0.7, 1.15), pan: R(-0.9, 0.9), reverb: 0.85, filter: 'lowpass', ff: 2400 }));
    every(live, 12, 26, () => { const pan = R(-0.8, 0.8); for (let i = 0; i < 3; i++) a.sample(['tick1', 'tick2'], { bus: out, vol: 0.05 * (1 - i * 0.25), pitch: R(0.8, 1.2), pan, reverb: 0.7, delay: i * R(0.12, 0.25) }); });
    return { stop() { alive = false; low.stop(); } };
  });
  au.defineLoop('cave_water', (a, out) => {
    const w = a.bed(out, 'lp_water', { rate: 0.8, vol: 0.32, filter: 'bandpass', ff: 1600, q: 0.5 });
    return { stop() { w.stop(); } };
  });
  const S = (name, ids, base, o = {}, gap = 0.04) => au.define(name, (a, p = {}) => a.sample(ids, { vol: (p.vol ?? 1) * base, pitch: (p.pitch ?? 1) * R(o.p0 ?? 0.92, o.p1 ?? 1.1), pan: p.pan || 0, reverb: p.far ? (o.rv ?? 0.4) + 0.3 : (o.rv ?? 0.4), filter: p.far ? 'lowpass' : o.filter, ff: p.far ? 1800 : o.ff, dur: o.dur, release: o.release }), gap);
  S('cave_drip', ['drip1', 'drip2', 'drip3', 'drip4'], 0.22, { p0: 0.85, p1: 1.25, rv: 0.6 }, 0.12);
  S('cave_plink', ['drip1', 'drip2', 'drip3', 'drip4'], 0.26, { p0: 1.2, p1: 1.6, rv: 0.75 }, 0.12);
  S('chase_step', ['step_dirt1', 'step_dirt2', 'step_dirt3', 'step_dirt4'], 0.1, { p0: 1.35, p1: 1.7, rv: 0.25, dur: 0.16, release: 0.05 }, 0.07);
  S('chase_rstep', ['step_dirt1', 'step_dirt2', 'thud1', 'step_dirt3'], 0.2, { p0: 0.62, p1: 0.8, rv: 0.35 }, 0.08);
  S('chase_screech', ['screech1', 'screech2'], 0.5, { p0: 1.05, p1: 1.3, rv: 0.6 }, 0.6);
  S('chase_bark', ['bark1', 'bark2', 'snarl1', 'snarl2'], 0.45, { p0: 1.0, p1: 1.25, rv: 0.5 }, 0.5);
  S('chase_snap', ['chomp1', 'chomp2'], 0.55, { p0: 0.95, p1: 1.15, rv: 0.3 }, 0.3);
  S('chase_skid', ['brush1', 'brush2', 'hit_dirt1'], 0.3, { p0: 0.7, p1: 0.9, rv: 0.35 }, 0.3);
  S('chase_squish', ['squish1', 'squish2', 'splat1'], 0.38, { p0: 0.8, p1: 1.05, rv: 0.4 }, 0.15);
  S('chase_brush', ['rustle1', 'rustle2', 'squish1'], 0.18, { p0: 1.1, p1: 1.4, rv: 0.3 }, 0.15);
  S('chase_puff', ['n_pop', 'bloop1', 'bloop2'], 0.3, { p0: 0.7, p1: 0.95, rv: 0.45 }, 0.15);
  S('chase_thud', ['thud1', 'thud2', 'thud3'], 0.22, { p0: 1.1, p1: 1.4, rv: 0.35 }, 0.15);
  // the eggs: a hairline crack (short, high, quiet); the shell giving; the hatchling; a smashed egg
  au.define('egg_crack', (a, p = {}) => {
    a.sample(['crack1', 'crack2', 'crack3'], { vol: (p.vol ?? 1) * 0.16, pitch: (p.pitch ?? 1) * R(1.5, 1.9), pan: p.pan || 0, dur: R(0.12, 0.2), release: 0.05, filter: 'highpass', ff: 900, reverb: 0.25 });
    if (Math.random() < 0.6) a.sample('egg', { vol: (p.vol ?? 1) * 0.12, pitch: R(1.3, 1.6), pan: p.pan || 0, dur: 0.12, release: 0.04, delay: 0.03 });
  }, 0.09);
  au.define('egg_hatch', (a, p = {}) => {
    a.sample('egg', { vol: (p.vol ?? 1) * 0.42, pitch: R(0.95, 1.1), pan: p.pan || 0, reverb: 0.3 });
    a.sample(['crack1', 'crack2', 'crack3'], { vol: (p.vol ?? 1) * 0.3, pitch: R(1.2, 1.4), pan: p.pan || 0, delay: 0.05, dur: 0.3, release: 0.1 });
  }, 0.2);
  au.define('egg_chirp', (a, p = {}) => a.sample(['squeak1', 'squeak2', 'squeak3', 'chirp1'], { vol: (p.vol ?? 1) * 0.28, pitch: R(1.4, 1.8), pan: p.pan || 0, reverb: 0.25 }), 0.25);
  au.define('egg_break', (a, p = {}) => {
    a.sample(['smash1', 'smash2', 'egg'], { vol: (p.vol ?? 1) * 0.45, pitch: R(1.0, 1.2), pan: p.pan || 0, reverb: 0.3 });
    a.sample(['crack1', 'crack2', 'crack3'], { vol: (p.vol ?? 1) * 0.3, pitch: R(0.9, 1.1), pan: p.pan || 0, delay: 0.04 });
  }, 0.2);
}

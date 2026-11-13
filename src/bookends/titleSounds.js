// The title's own sounds (the save-slot eggs), all from the game's recordings (src/audio, played
// through src/core/Audio.js; nothing here synthesizes a sound):
//   egg_crack    a short crack in a shell ({ vol, pitch })   egg_hatch  the shell gives
//   egg_chirp    the hatchling                              egg_break  an egg smashed
//   titleSounds(audio): define them (idempotent).
const R = (a, b) => a + Math.random() * (b - a);

export function titleSounds(au) {
  if (!au || !au.define || au.presets?.egg_break) return;
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

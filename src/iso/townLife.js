// Ambient life for Deep Town: dust motes drifting in lantern light, spores puffing off
// the glowing mushrooms, twinkling glow-worms under the overhang, fireflies over the plaza,
// chimney smoke curling up the cliffs, and the waterfall's mist and splashes.
import { TOWN } from './townLayout.js';
import { rand, chance } from '../core/util.js';

export function townLife(S) {
  const P = S.particles;
  // ---- dust motes in the warm light pools (only near the camera)
  const lamps = S.lightPool.sources.filter((s) => s.real && s.intensity >= 3 && ((s.color >> 16) & 255) > 200 && ((s.color & 255) < 200));
  P.addEmitter({
    every: 0.09,
    emit: (p) => {
      const f = S.cam.focus;
      const near = lamps.filter((l) => (l.x - f.x) ** 2 + (l.z - f.z) ** 2 < 100);
      if (!near.length) return;
      const l = near[Math.floor(Math.random() * near.length)];
      const a = rand(0, 6.28), r = rand(0, 1.3);
      p.spawn({ x: l.x + Math.cos(a) * r, y: rand(0.3, l.y + 0.4), z: l.z + Math.sin(a) * r, vy: rand(-0.04, 0.06), vx: rand(-0.04, 0.04), vz: rand(-0.04, 0.04), life: rand(3, 6), size: rand(0.9, 1.4), color: 0xffe0a8, alpha: 0.75, alpha2: 0, add: true, wob: 0.12, blink: rand(2, 6) });
    },
  });
  // ---- glow-worms: slow twinkles at the thread tips
  const worms = S.glowWorms || [];
  if (worms.length) P.addEmitter({
    every: 0.07,
    emit: (p) => {
      const f = S.cam.focus;
      const w = worms[Math.floor(Math.random() * worms.length)];
      if ((w.x - f.x) ** 2 + (w.z - f.z) ** 2 > 196) return;
      p.spawn({ x: w.x + rand(-0.03, 0.03), y: w.y + rand(0, w.len), z: w.z + rand(-0.03, 0.03), life: rand(0.8, 1.8), size: rand(1.2, 2.2), color: chance(0.5) ? 0x9affe0 : 0x7ad8ff, alpha: 0.95, alpha2: 0, add: true, blink: rand(3, 8) });
    },
  });
  // ---- fireflies drifting over the plaza and the mushroom groves
  const PL = TOWN.plaza;
  for (let i = 0; i < 14; i++) {
    const cx = PL.x + rand(-6, 6), cz = PL.z + rand(-6, 6), cy = rand(0.8, 2.4);
    const ph = rand(0, 6.28), sp = rand(0.15, 0.4), r = rand(0.6, 1.8);
    P.spawn({
      x: cx, y: cy, z: cz, life: 1e9, size: 1.5, color: i % 3 ? 0xd8ff7a : 0xffe07a, alpha: 0.9, alpha2: 0.9, add: true, blink: rand(1.5, 4),
      fn: (q) => {
        const t = q.t * sp + ph;
        q.x = cx + Math.cos(t) * r + Math.sin(t * 2.7) * 0.4;
        q.z = cz + Math.sin(t * 0.8) * r;
        q.y = cy + Math.sin(t * 1.9) * 0.35;
      },
    });
  }
  // ---- spores puffing off the glowing mushroom clumps
  const shrooms = S.lightPool.sources.filter((s) => !s.real && s.pool && s.y < 0.6 && (s.color & 255) > 150);
  if (shrooms.length) P.addEmitter({
    every: 0.35,
    emit: (p) => {
      const f = S.cam.focus;
      const s = shrooms[Math.floor(Math.random() * shrooms.length)];
      if ((s.x - f.x) ** 2 + (s.z - f.z) ** 2 > 144) return;
      p.spawn({ x: s.x + rand(-0.2, 0.2), y: 0.35, z: s.z + rand(-0.2, 0.2), vy: rand(0.12, 0.3), life: rand(2.5, 4.5), size: 1.2, color: s.color, alpha: 0.85, alpha2: 0, add: true, wob: 0.3 });
    },
  });
  // ---- chimney smoke (houses on the rims and the pipes on the cliff)
  for (const c of S.chimneys || []) {
    P.addEmitter({
      every: 0.42,
      when: () => S.near(c.x, c.z, 16),
      emit: (p) => p.spawn({ x: c.x + rand(-0.04, 0.04), y: c.y, z: c.z + rand(-0.04, 0.04), vy: rand(0.3, 0.5), vx: 0.06, vz: rand(-0.03, 0.03), life: rand(2.6, 3.8), size: 2.5, size2: 7, color: 0x8a8090, color2: 0x3a3440, alpha: 0.45, alpha2: 0, wob: 0.25 }),
    });
  }
  // ---- the waterfall: mist at the bottom, splashes, a few drops off the lip
  const W = S.falls;
  if (W) {
    const L = W.land, B = W.basin;
    P.addEmitter({
      every: 0.06,
      when: () => S.near(L.x, L.z, 15),
      emit: (p) => {
        p.spawn({ x: L.x + rand(-0.22, 0.22), y: B.y + 0.04, z: L.z + rand(-0.05, 0.12), vx: rand(-0.6, 0.6), vy: rand(0.7, 1.4), vz: rand(0.1, 0.6), grav: 6, life: 0.6, size: 1.4, color: 0xe8fbff, color2: 0x8ad0f0, alpha: 0.95, alpha2: 0.2, fn: (q) => { if (q.y < B.y && q.t > 0.15) q.dead = true; } });
        if (Math.random() < 0.45) p.spawn({ x: L.x + rand(-0.3, 0.3), y: B.y + rand(0.05, 0.3), z: L.z + rand(0, 0.4), vy: rand(0.08, 0.2), vx: rand(-0.08, 0.08), vz: rand(0.05, 0.2), life: rand(1.6, 2.8), size: rand(3, 4.5), size2: rand(7, 10), color: 0xd8eef8, color2: 0x9ab8d0, alpha: 0.28, alpha2: 0, drag: 0.5 });
      },
    });
    P.addEmitter({
      every: 0.5,
      when: () => S.near(L.x, L.z, 15),
      emit: (p) => p.spawn({ x: W.top.x + rand(-0.15, 0.15), y: W.top.y, z: W.top.z + 0.05, vz: rand(0.1, 0.3), vy: -0.2, grav: 7, life: 1.4, size: 1.2, color: 0xbfe8ff, alpha: 0.9, alpha2: 0.6, fn: (q) => { if (q.y < B.y) q.dead = true; } }),
    });
  }
}

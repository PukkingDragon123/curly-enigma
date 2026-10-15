// Ambient life for first-person Deep Town: dust motes drifting in the lantern light, fireflies over
// the plaza and the mushroom grove, spores puffing off the glowing mushrooms, beetles circling
// the mushroom caps, glow-worm sparkles under the overhangs, chimney smoke curling up to the
// roof, the waterfall's mist, splashes and drops, the fountain's spray, sun motes in the beam,
// drips from the ceiling and sparks off Grubb's grindstone. Town units; only near the mole.
import { TOWN } from '../iso/townLayout.js';
import { rand, chance, pick } from '../core/util.js';

export function townLife(S) {
  const P = S.particles;
  const near = (x, z, r) => S.near(x, z, r);
  // ---- dust motes in the warm light pools near the mole
  const lamps = S.lights.sources.filter((s) => s.real && s.intensity >= 2.5 && ((s.color >> 16) & 255) > 200 && ((s.color & 255) < 200));
  P.addEmitter({
    every: 0.06,
    emit: (p) => {
      const pl = S.player;
      const close = lamps.filter((l) => (l.x - pl.x) ** 2 + (l.z - pl.z) ** 2 < 120);
      if (!close.length) return;
      const l = close[Math.floor(Math.random() * close.length)];
      const a = rand(0, 6.28), r = rand(0, 1.4);
      p.spawn({ x: l.x + Math.cos(a) * r, y: rand(0.3, l.y + 0.5), z: l.z + Math.sin(a) * r, vy: rand(-0.04, 0.06), vx: rand(-0.04, 0.04), vz: rand(-0.04, 0.04), life: rand(3, 6), size: rand(0.8, 1.3), color: 0xffe0a8, alpha: 0.8, alpha2: 0, add: true, wob: 0.12, blink: rand(2, 6) });
    },
  });
  // ---- glow-worm thread tips twinkling under the overhangs
  const worms = S.glowWorms || [];
  if (worms.length) P.addEmitter({
    every: 0.05,
    emit: (p) => {
      const w = worms[Math.floor(Math.random() * worms.length)];
      if (!near(w.x, w.z, 16)) return;
      p.spawn({ x: w.x + rand(-0.03, 0.03), y: w.y + rand(0, w.len), z: w.z + rand(-0.03, 0.03), life: rand(0.8, 1.8), size: rand(1.2, 2), color: chance(0.5) ? 0x9affe0 : 0x7ad8ff, alpha: 0.95, alpha2: 0, add: true, blink: rand(3, 8) });
    },
  });
  // ---- fireflies over the plaza, the grove and the back lanes
  const swarms = [[TOWN.plaza.x, TOWN.plaza.z, 6, 14], ...TOWN.trees.map((t) => [t.x, t.z, t.r + 1.2, 5]), [22, 30.5, 8, 6]];
  for (const [sx, sz, rad, n] of swarms) for (let i = 0; i < n; i++) {
    const cx = sx + rand(-rad, rad), cz = sz + rand(-rad, rad), cy = rand(0.7, 2.6);
    const ph = rand(0, 6.28), sp = rand(0.15, 0.4), r = rand(0.5, 1.6);
    P.spawn({
      x: cx, y: cy, z: cz, life: 1e9, size: 1.5, color: i % 3 ? 0xd8ff7a : 0xffe07a, alpha: 0.95, alpha2: 0.95, add: true, blink: rand(1.5, 4),
      fn: (q) => {
        const t = q.t * sp + ph;
        q.vx = q.vy = q.vz = 0;
        q.x = cx + Math.cos(t) * r + Math.sin(t * 2.7) * 0.4;
        q.z = cz + Math.sin(t * 0.8) * r;
        q.y = cy + Math.sin(t * 1.9) * 0.35;
      },
    });
  }
  // ---- beetles circling the mushroom caps
  for (const t of S.trees || []) for (let k = 0; k < 3; k++) {
    const ph = rand(0, 6.28), rad = rand(0.8, 2.2), sp = rand(0.4, 0.9) * (chance(0.5) ? 1 : -1), cy = t.h * 0.6;
    P.spawn({ x: t.x, y: cy, z: t.z, life: 1e9, size: 1.7, color: 0xc8ff7a, alpha: 1, alpha2: 1, add: true, blink: 3, fn: (q) => { q.vx = q.vy = q.vz = 0; const tt = q.t * sp + ph; q.x = t.x + Math.cos(tt) * rad + Math.sin(tt * 2.3) * 0.3; q.z = t.z + Math.sin(tt) * rad; q.y = cy + Math.sin(tt * 1.7) * 0.5; } });
    P.addEmitter({ every: 0.45, when: () => near(t.x, t.z, 14), emit: (p) => { const a = rand(0, 6.28), r = rand(0, t.r); p.spawn({ x: t.x + Math.cos(a) * r, y: t.h - 0.4, z: t.z + Math.sin(a) * r, vy: -rand(0.12, 0.25), life: rand(4, 7), size: 1.3, color: t.light.color, alpha: 0.9, alpha2: 0, add: true, wob: 0.35 }); } });
  }
  // ---- spores puffing off the glowing mushroom clumps
  const shrooms = S.lights.sources.filter((s) => !s.real && s.y < 0.6 && (s.color & 255) > 150);
  if (shrooms.length) P.addEmitter({
    every: 0.25,
    emit: (p) => {
      const s = shrooms[Math.floor(Math.random() * shrooms.length)];
      if (!near(s.x, s.z, 12)) return;
      p.spawn({ x: s.x + rand(-0.2, 0.2), y: 0.35, z: s.z + rand(-0.2, 0.2), vy: rand(0.12, 0.3), life: rand(2.5, 4.5), size: 1.3, color: s.color, alpha: 0.85, alpha2: 0, add: true, wob: 0.3 });
    },
  });
  // ---- chimney smoke, curling up toward the roof
  for (const c of S.chimneys || []) {
    P.addEmitter({
      every: 0.32,
      when: () => near(c.x, c.z, 22),
      emit: (p) => p.spawn({ x: c.x + rand(-0.04, 0.04), y: c.y, z: c.z + rand(-0.04, 0.04), vy: rand(0.35, 0.55), vx: rand(-0.04, 0.08), vz: rand(-0.04, 0.04), life: rand(3.4, 5), size: 7, size2: 22, color: 0x8a8090, color2: 0x3a3440, alpha: 0.42, alpha2: 0, wob: 0.25 }),
    });
  }
  // ---- the waterfall: mist at the bottom, splashes, a few drops off the lip
  const W = S.falls;
  if (W) {
    const L = W.land, B = W.basin;
    P.addEmitter({
      every: 0.05,
      when: () => near(L.x, L.z, 16),
      emit: (p) => {
        p.spawn({ x: L.x + rand(-0.22, 0.22), y: B.y + 0.04, z: L.z + rand(-0.05, 0.12), vx: rand(-0.6, 0.6), vy: rand(0.7, 1.4), vz: rand(0.1, 0.6), grav: 6, life: 0.6, size: 1.5, color: 0xe8fbff, color2: 0x8ad0f0, alpha: 0.95, alpha2: 0.2, fn: (q) => { if (q.y < B.y && q.t > 0.15) q.dead = true; } });
        if (Math.random() < 0.5) p.spawn({ x: L.x + rand(-0.3, 0.3), y: B.y + rand(0.05, 0.4), z: L.z + rand(0, 0.4), vy: rand(0.08, 0.2), vx: rand(-0.08, 0.08), vz: rand(0.05, 0.25), life: rand(1.8, 3), size: rand(6, 9), size2: rand(14, 20), color: 0xd8eef8, color2: 0x9ab8d0, alpha: 0.2, alpha2: 0, drag: 0.5 });
      },
    });
    P.addEmitter({
      every: 0.4,
      when: () => near(L.x, L.z, 16),
      emit: (p) => p.spawn({ x: W.top.x + rand(-0.15, 0.15), y: W.top.y, z: W.top.z + 0.05, vz: rand(0.1, 0.3), vy: -0.2, grav: 7, life: 1.4, size: 1.3, color: 0xbfe8ff, alpha: 0.9, alpha2: 0.6, fn: (q) => { if (q.y < B.y) q.dead = true; } }),
    });
  }
  // ---- the fountain: spray from the bowl, a spout from the crystal
  const F = TOWN.fountain, f = S.fountainInfo;
  if (f) {
    P.addEmitter({
      every: 0.04,
      when: () => near(F.x, F.z, 15),
      emit: (p) => {
        const a = Math.random() * Math.PI * 2, r0 = f.bowlR;
        p.spawn({ x: F.x + Math.cos(a) * r0, y: f.bowlY, z: F.z + Math.sin(a) * r0, vx: Math.cos(a) * rand(0.35, 0.6), vz: Math.sin(a) * rand(0.35, 0.6), vy: rand(0.2, 0.6), grav: 5, life: 1.0, size: 1.5, color: 0xd8f6ff, color2: 0x7ac8f0, alpha: 0.95, alpha2: 0.4, fn: (q) => { if (q.y < f.basinY) { q.dead = true; if (Math.random() < 0.3) p.spawn({ x: q.x, y: f.basinY + 0.02, z: q.z, vy: 0.5, grav: 3, life: 0.25, size: 1.2, color: 0xffffff, alpha: 0.8 }); } } });
      },
    });
    P.addEmitter({
      every: 0.1,
      when: () => near(F.x, F.z, 15),
      emit: (p) => p.spawn({ x: F.x + rand(-0.06, 0.06), y: f.crystal.y - 0.2, z: F.z + rand(-0.06, 0.06), vy: rand(0.9, 1.3), vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), grav: 3.2, life: 0.9, size: 1.4, color: 0xe8fbff, alpha: 0.85, alpha2: 0.2, fn: (q) => { if (q.y < f.bowlY && q.t > 0.2) q.dead = true; } }),
    });
  }
  // ---- sun motes in the beam
  const B2 = S.beam;
  if (B2) P.addEmitter({
    every: 0.1,
    when: () => near(B2.x0, B2.z0, 18),
    emit: (p) => {
      const t = Math.random(), a = rand(0, 6.28), r = rand(0, 0.7 + t * 0.4);
      p.spawn({ x: B2.x0 + (B2.x1 - B2.x0) * t + Math.cos(a) * r, y: B2.y0 + (B2.y1 - B2.y0) * t, z: B2.z0 + (B2.z1 - B2.z0) * t + Math.sin(a) * r, vy: rand(-0.05, 0.08), vx: rand(-0.05, 0.05), life: rand(3, 5.5), size: rand(1, 1.6), color: 0xfff8d8, alpha: 0.9, alpha2: 0, add: true, wob: 0.18, blink: 5 });
    },
  });
  // ---- drips from the roof and the overhangs
  let dripT = 2;
  S.tickers.push((dt) => {
    dripT -= dt;
    if (dripT > 0) return;
    dripT = rand(0.8, 2.2);
    const [x, z] = pick(S.drips || [[20, 20]]);
    if (!near(x, z, 14)) return;
    const y = (S.ceilingAt ? S.ceilingAt(x, z) : 8) - 0.2;
    P.spawn({ x, y, z, vy: -1, grav: 9, life: 3, size: 1.5, color: 0x9fd6ff, alpha: 0.9, alpha2: 0.9, fn: (q) => { if (q.y < 0.05 && !q.dead) { q.dead = true; P.burst(4, { x: q.x, y: 0.05, z: q.z, vy: 0.7, grav: 5, life: 0.3, size: 1.1, color: 0xd8f6ff, alpha: 0.8, alpha2: 0 }, { x: 0.02, z: 0.02, v: 0.4 }); if (near(x, z, 5)) S.game.audio.play('drip'); } } });
  });
  // ---- sparks off Grubb's grindstone
  let sparkT = 3;
  S.tickers.push((dt) => {
    sparkT -= dt;
    if (sparkT > 0 || !S.grindstone) return;
    sparkT = rand(2.5, 6);
    const gs = S.grindstone;
    if (!near(gs.x, gs.z, 12)) return;
    P.burst(12, { x: gs.x, y: 0.62, z: gs.z, vy: 1.8, life: 0.7, size: 1.5, size2: 0.8, color: 0xffd060, color2: 0xff5a1a, alpha: 1, alpha2: 0.2, grav: 4.5, add: true }, { x: 0.05, y: 0.05, z: 0.05, v: 1.4 });
    if (near(gs.x, gs.z, 6)) S.game.audio.play('chisel', { vol: 0.5 });
  });
}

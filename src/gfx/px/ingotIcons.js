// 32×32 ingot icons: a cast bar with a chamfered top, seen in 3/4 view on the facet
// renderer; each metal gets its own hand-tuned ramp and finish (sheen, hammer marks,
// iridescence, starlight).
import { hash2 } from './shade.js';
import { Scene, material, rampOf, glint, view } from './facets.js';

const LOOK = {
  copper_ingot: { R: [0xfff0dc, 0xffc496, 0xf08e56, 0xc8622e, 0x8e3e22, 0x5e2418, 0x2a0e0c] },
  tin_ingot: { R: [0xffffff, 0xe6e9ea, 0xc6cbcd, 0xa0a6aa, 0x787e86, 0x545866, 0x262834], matte: true },
  bronze_ingot: { R: [0xfff6d8, 0xf6d28e, 0xd8a452, 0xb07a34, 0x7e5224, 0x52341c, 0x24140c] },
  iron_ingot: { R: [0xeef0f2, 0xbcc0c6, 0x92979e, 0x6e737c, 0x50545e, 0x373a46, 0x181a24], rough: true },
  steel_ingot: { R: [0xffffff, 0xe0eaf4, 0xaebdcc, 0x8293a6, 0x5c6a80, 0x3c4660, 0x1a1e32] },
  silver_ingot: { R: [0xffffff, 0xf4f6fa, 0xd6dce6, 0xaab3c2, 0x7e879a, 0x585e74, 0x262a3c] },
  gold_ingot: { R: [0xfffbe0, 0xffe88a, 0xf8c43c, 0xdc941c, 0xa8641a, 0x703e14, 0x34180a] },
  mithril_ingot: { R: [0xf4ffff, 0xc8f6f6, 0x96e0e6, 0x66b8c8, 0x4488a2, 0x2c5c7a, 0x122a42], irid: true },
  moonsilver_ingot: { R: [0xffffff, 0xf0f0ff, 0xd6d6f4, 0xb0aee2, 0x8884c2, 0x5e5a98, 0x2a2652], glow: 0.35 },
  adamant_ingot: { R: [0xeafff4, 0xa2f2ca, 0x56d8a0, 0x2cae7c, 0x1a805c, 0x105444, 0x062620] },
  starmetal_ingot: { R: [0xfffbe8, 0xfff0a8, 0xf8d066, 0xd8a03a, 0xa8702a, 0x6e4420, 0x30180c], star: true, glow: 0.3 },
};

/** Octagonal ring (cut corners) at height y: half sizes a × c, corner cut k. */
const oct = (a, c, k, y) => [[-a + k, y, -c], [a - k, y, -c], [a, y, -c + k], [a, y, c - k], [a - k, y, c], [-a + k, y, c], [-a, y, c - k], [-a, y, -c + k]];

export function drawIngot(pc, id, base) {
  const L = LOOK[id] || { R: null };
  const R = rampOf(L.R || [0xffffff, 0xe0e0e0, 0xc0c0c0, base ?? 0xa0a0a0, 0x707070, 0x484848, 0x202020]);
  const sc = new Scene(32);
  const m = material(R, {
    eq: 0.6, q: [0.12, 0.42, 0.7, 0.9], grad: 0.08, ridgeAll: true,
    tex: L.rough ? (c) => (hash2(c.x, c.y, 5) < 0.12 ? 1 : hash2(c.x, c.y, 6) < 0.05 ? -1 : 0) : null,
    glow: L.glow || 0,
  });
  // world points: bottom ring, a bevel ring just under the top, the top plateau
  const a = 11.5, c = 5.8, h = 7.5;
  const pts = [...oct(a, c, 0.9, 0), ...oct(a * 0.92, c * 0.82, 0.9, h * 0.82), ...oct(a * 0.84, c * 0.66, 0.8, h)];
  const yaw = -0.38, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const W = pts.map(([x, y, z]) => [x * cy - z * sy, y - h / 2, x * sy + z * cy]);
  const P = view(W, 16, 17, 0.78);
  const ob = sc.hull(m, P);
  sc.render(pc);
  // the top plateau: find it, give it a cast sheen band and a stamped mark
  let top = null, best = -2;
  for (const f of ob.faces) if (-f.n[1] > best) { best = -f.n[1]; top = f; }
  const inT = (x, y) => sc.pidAt(x, y) === top.pid;
  let x0 = 99, x1 = -1, y0 = 99, y1 = -1;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (inT(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!inT(x, y)) continue;
    const u = (x - x0) / Math.max(1, x1 - x0), v = (y - y0) / Math.max(1, y1 - y0);
    const d = u - v * 0.5;
    let k = 2;
    if (!L.matte && d > 0.14 && d < 0.2) k = 0;
    else if (!L.matte && d > 0.08 && d < 0.3) k = 1;
    else if (d > 0.66) k = 3;
    if (L.matte) k = d > 0.5 ? 3 : 2;
    pc.set(x, y, R[k]);
  }
  // stamp: a small sunk cartouche with a lit lower lip
  const sx = Math.round((x0 + x1) / 2 + 2), sy2 = Math.round((y0 + y1) / 2);
  for (let i = -2; i <= 2; i++) { if (inT(sx + i, sy2)) pc.set(sx + i, sy2, R[4]); if (inT(sx + i, sy2 + 1)) pc.set(sx + i, sy2 + 1, R[i === -2 ? 4 : 1]); }
  if (inT(sx + 3, sy2 + 1)) pc.set(sx + 3, sy2 + 1, R[1]);
  if (L.irid) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (sc.objAt(x, y) !== ob.id) continue;
    const b = (x - y * 0.6 + 40) % 13;
    const k = sc.k[y * 32 + x];
    if (b < 1 && k >= 1 && k <= 3) pc.set(x, y, 0xf0d8ff);
    else if (b > 6 && b < 7 && k >= 2 && k <= 4) pc.set(x, y, 0xc8fff0);
  }
  if (L.star) {
    glint(pc, 24, 7, 2, 0xffffff, 0xfff0a0, 1);
    glint(pc, 6, 23, 1, 0xffffff, 0xfff0a0, 1);
    for (const [x, y] of [[11, 21], [18, 23], [24, 20]]) if (sc.objAt(x, y) === ob.id) { pc.set(x, y, 0xfffbe0); pc.emit(x, y, 1); }
  } else if (!L.matte) glint(pc, x0 + 3, y0 + 1, 1, 0xffffff, R[1]);
}

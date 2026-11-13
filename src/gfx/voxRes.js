// Voxel resolution by object size: the one rule every voxel builder (home, mine props, town) asks.
// Small things a mole picks up or peers at (cups, tools, books, mushrooms, candles) get fine voxels,
// furniture-sized things a medium voxel, and big structure (walls, rock, beams, trees) stays coarse,
// so the triangles go where the eye is.
//
//   voxelSizeFor(L)          → target voxel edge (m) for an object whose largest extent is L m
//   refineSteps(L, vox)      → how many 2× refinements take a grid at `vox` m per voxel to its target
//   refine2(data, w, h, d)   → a 2× finer copy of a voxel grid (Uint32 colours, 0 = empty) that
//                              rounds convex edges, fills concave creases and smooths colour edges
//                              (a 3D Scale2x), so an old coarse model comes out finer, not just bigger
//   refineGrid(grid, n)      → refine2 n times on anything with { w, h, d, data } (VoxelGrid, PGrid)
//   contentExtent(grid)      → the largest extent (voxels) of the filled voxels
//   keepFine(grid, vox)      → is this grid small enough that it must never be built coarser?
//
// Budget: refining is only for the small and middle sizes (a few thousand voxels each), the greedy
// mesher keeps flat runs merged, and big pieces are never refined.
//
// Wave 12 ("super high resolution"): some categories go finer than this table, each with its own
// LOD so the cost stays near the eye (RES12 below, ?res12=0 turns all of it off):
//   creatures   near copies at 1/96 m (phones 1/72 m) built in a worker with surface detail, worn
//               only by the few creatures in arm's reach (deep/enemies/hires.js, hiBuild.js)
//   plants      twice as fine (1/96-1/128 m) with leaf rims, teeth, veins and gills, worker-built,
//               planted only in chunks within ~6.5 m (phones 3.5 m) (deep/veg/fine.js, fineAsk.js)
//   crystals    1/48 m hexagonal crystals instead of refined 1/16 m blocks (deep/props/crystalHi.js)
//   ore         a 1/128 m skin of nuggets / crystal points on every exposed ore face, built in the
//               chunk workers, fewer per chunk on phones (deep/props/oreBits.js, Props.placeOre)

/** ?voxrule=0 turns the rule off (A/B screenshots): everything is built at the voxel it was drawn at. */
export const VOX_RULE_ON = !(typeof location !== 'undefined' && /[?&]voxrule=0/.test(location.search || ''));

/**
 * ?res12=0 turns off the wave-12 "super high resolution" pass (A/B shots): creatures' hi-res near
 * copies (deep/enemies/hires.js), the finer plants (deep/veg/plants.js), the finer crystals and the
 * ore nodes in the walls.
 */
export let RES12 = !(typeof location !== 'undefined' && /[?&]res12=0/.test(location.search || ''));
/** (a worker has no page query: the game hands the switch over with its init message) */
export function setRes12(on) { RES12 = !!on; }

/** Size classes (largest extent in m → voxel edge in m). */
export const VOX_RULE = [
  { upTo: 0.8, vox: 1 / 64 }, // cups, tools, books, candles, mushrooms, lanterns, plants
  { upTo: 2.0, vox: 1 / 32 }, // furniture: crates, barrels, chairs, carts, stalagmites, crystals
  { upTo: Infinity, vox: 1 / 16 }, // walls, rock, beams, big trees: coarse
];

/** The target voxel edge (m) for an object whose largest extent is L (m). */
export function voxelSizeFor(L) {
  for (const r of VOX_RULE) if (L <= r.upTo) return r.vox;
  return VOX_RULE[VOX_RULE.length - 1].vox;
}

/** 2× refinements (0, 1 or 2) that take a grid built at `vox` m per voxel to its size class. */
export function refineSteps(L, vox) {
  if (!VOX_RULE_ON) return 0;
  const want = voxelSizeFor(L);
  // (two steps, 4× finer, only for the really small things: past ~0.4 m that costs too many faces)
  const most = L <= 0.4 ? 2 : 1;
  let n = 0, v = vox;
  while (v > want * 1.4 && n < most) { v /= 2; n++; }
  return n;
}

/** Largest extent (in voxels) of the filled voxels of a grid { w, h, d, data }. */
export function contentExtent(g) {
  const { w, h, d, data } = g;
  let x0 = w, y0 = h, z0 = d, x1 = -1, y1 = -1, z1 = -1;
  for (let z = 0, i = 0; z < d; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    if (!data[i]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return x1 < 0 ? 0 : Math.max(x1 - x0, y1 - y0, z1 - z0) + 1;
}

/** Small enough (by its grid's size at `vox` m per voxel) that it should never be built coarser. */
export function keepFine(g, vox) {
  if (!VOX_RULE_ON) return false;
  return Math.max(g.w, g.h, g.d) * vox <= VOX_RULE[0].upTo;
}

/**
 * A 2× finer copy of a voxel grid: Uint32Array data (x fastest, then y, then z; 0 = empty).
 * Shape follows a 3D Scale2x on occupancy (a sub-voxel at a convex edge whose two outward
 * neighbours are empty and whose inward ones are solid is cut away; one in a concave crease whose
 * two neighbours are solid and whose opposite ones are empty is filled), colour follows Scale2x on
 * the colours (so diagonal colour edges step at the finer size). Off the grid counts as the voxel
 * itself (a model cut off at its grid's edge stays square there). Returns { data, w, h, d }.
 */
export function refine2(src, w, h, d) {
  const W = w * 2, H = h * 2, D = d * 2, WH = W * H;
  const out = new Uint32Array(W * H * D);
  const sy = w, sz = w * h;
  for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) {
    let i = y * sy + z * sz;
    for (let x = 0; x < w; x++, i++) {
      const e = src[i];
      const xm = x > 0 ? src[i - 1] : e, xp = x < w - 1 ? src[i + 1] : e;
      const ym = y > 0 ? src[i - sy] : e, yp = y < h - 1 ? src[i + sy] : e;
      const zm = z > 0 ? src[i - sz] : e, zp = z < d - 1 ? src[i + sz] : e;
      const o = 2 * x + W * 2 * y + WH * 2 * z;
      // inside a flat run (or in open air): all eight sub-voxels are the voxel
      if (xm === e && xp === e && ym === e && yp === e && zm === e && zp === e) {
        if (e) { out[o] = e; out[o + 1] = e; out[o + W] = e; out[o + W + 1] = e; out[o + WH] = e; out[o + WH + 1] = e; out[o + WH + W] = e; out[o + WH + W + 1] = e; }
        continue;
      }
      for (let k = 0; k < 8; k++) {
        const bx = k & 1, by = (k >> 1) & 1, bz = k >> 2;
        const A = bx ? xp : xm, A2 = bx ? xm : xp;
        const B = by ? yp : ym, B2 = by ? ym : yp;
        const C = bz ? zp : zm, C2 = bz ? zm : zp;
        let v = e;
        if (e) {
          // a convex edge or corner: both outward neighbours empty, both inward ones solid
          if ((!A && !B && A2 && B2) || (!A && !C && A2 && C2) || (!B && !C && B2 && C2)) v = 0;
          // colour edges (Scale2x among filled neighbours)
          else if (A && A === B && A !== A2 && B !== B2) v = A;
          else if (A && A === C && A !== A2 && C !== C2) v = A;
          else if (B && B === C && B !== B2 && C !== C2) v = B;
        } else {
          // a concave crease: both neighbours solid, both opposite ones empty
          if (A && B && !A2 && !B2) v = A;
          else if (A && C && !A2 && !C2) v = A;
          else if (B && C && !B2 && !C2) v = B;
        }
        if (v) out[o + bx + W * by + WH * bz] = v;
      }
    }
  }
  return { data: out, w: W, h: H, d: D };
}

/** Refine any grid { w, h, d, data } n times in place (its data and size replaced). */
export function refineGrid(g, n = 1) {
  for (let i = 0; i < n; i++) {
    const r = refine2(g.data, g.w, g.h, g.d);
    g.data = r.data; g.w = r.w; g.h = r.h; g.d = r.d;
  }
  return g;
}

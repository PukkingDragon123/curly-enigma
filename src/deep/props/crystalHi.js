// Wave 12, "super high resolution" crystals: the grotto's crystal clusters (floor and ceiling), the
// frost vault's ice and the core's floating void shards, modelled at 1/48 m (3× the prop voxel)
// instead of refined from 1/16 m blocks, with what only shows at that size:
//
//   - real hexagonal prisms (six flat facets at the crystal's own twist) ending in a six-faced
//     pyramid tip, each facet one flat tone lit from the top left (so facets read, and the greedy
//     mesher keeps each facet a few long quads)
//   - bright facet edges, a few chipped edges, growth striations across the facets
//   - inclusions: milky clouds and dark specks under the surface, a brighter phantom near the base
//   - a matrix of rubble and finer pebbles they grow out of
//
// The size rule (gfx/voxRes.js) puts crystals with the small things now: the builders return
// scale = PU / 3 and refine: false. Same placement, light and emitters as the 1/16 m models.
import { PGrid, PU, hv, shade, mixc } from './grid.js';

const K = 3; // fine voxels per prop voxel
export const CRYSTAL_K = K;

/** Light from the top left (+y, -x, +z a little): how lit a facet with normal (nx, ny, nz) is, 0..1. */
const lit = (nx, ny, nz) => Math.max(0, Math.min(1, 0.5 + 0.42 * (-nx * 0.55 + ny * 0.7 + nz * 0.35)));

/**
 * A hexagonal crystal along +y (or -y: o.down) from (bx, by, bz) (fine voxels): len, radius w,
 * lean [lx, lz] per voxel of length, twist rot (rad), pal { c, hi, lo, tip, g }.
 */
export function hexPrism(g, bx, by, bz, len, w, lean, rot, pal, o = {}) {
  const dirY = o.down ? -1 : 1;
  const tipLen = Math.max(3, w * 1.5);
  const seed = o.seed || 1;
  const nrm = [];
  for (let k = 0; k < 6; k++) { const a = rot + k * Math.PI / 3; nrm.push([Math.cos(a), Math.sin(a)]); }
  // facet tones (sides), and the tip's facets a step lighter
  const side = nrm.map(([nx, nz]) => lit(nx, 0, nz));
  const tone = (l) => (l > 0.72 ? pal.hi : l > 0.55 ? mixc(pal.c, pal.hi, 0.45) : l > 0.4 ? pal.c : l > 0.28 ? mixc(pal.c, pal.lo, 0.5) : pal.lo);
  const R0 = Math.ceil(w) + 1;
  const stripe = 4 + (seed % 3); // growth lines every few voxels
  for (let t = 0; t < len; t++) {
    const fromTip = len - 1 - t;
    const R = fromTip < tipLen ? Math.max(0.35, w * (fromTip + 0.5) / tipLen) : w;
    const inTip = fromTip < tipLen;
    const cx = bx + lean[0] * t, cz = bz + lean[1] * t, y = by + t * dirY;
    for (let dz = -R0; dz <= R0; dz++) for (let dx = -R0; dx <= R0; dx++) {
      const px = Math.round(cx) + dx - cx, pz = Math.round(cz) + dz - cz;
      // hexagon: the largest projection on the three facet normals
      let best = -1, bi = 0, second = -1;
      for (let k = 0; k < 3; k++) {
        const p = px * nrm[k][0] + pz * nrm[k][1], ap = Math.abs(p);
        if (ap > best) { second = best; best = ap; bi = p >= 0 ? k : k + 3; } else if (ap > second) second = ap;
      }
      if (best > R + 0.01) continue;
      const X = Math.round(cx) + dx, Z = Math.round(cz) + dz;
      const surf = best > R - 1.05;
      const h = hv(X, y, Z, seed);
      let c = pal.c, gl = o.glow === false ? 0 : pal.g;
      if (!surf) { c = shade(pal.c, 0.9); }
      else {
        const edge = best - second < 0.9 && R > 1;
        if (edge && h < 0.07 && !inTip && fromTip > 2) continue; // a chipped edge
        if (inTip) {
          // pyramid facets: the side tone tilted up, lighter; the very tip white-hot
          const ny = 0.6;
          c = tone(lit(nrm[bi][0] * 0.8, ny, nrm[bi][1] * 0.8) + 0.05);
          if (fromTip < 1.5) { c = pal.tip; gl = Math.min(3, gl + 1); }
          else if (edge) c = mixc(pal.hi, pal.tip, 0.5);
        } else {
          c = tone(side[bi]);
          if (edge) { c = mixc(c, pal.tip, 0.55); if (o.edgeGlow) gl = o.edgeGlow; } // the bright edge between two facets
          else if (t % stripe === 0) c = shade(c, 0.86); // growth striations
          if (!edge && h < 0.025) c = mixc(c, 0xffffff, 0.55); // milky inclusion
          else if (!edge && h > 0.985) c = shade(pal.lo, 0.6); // dark speck
          else if (!edge && t < len * 0.3 && hv(X >> 1, y >> 1, Z >> 1, seed + 3) < 0.08) c = mixc(c, pal.hi, 0.6); // the phantom near the base
        }
      }
      g.set(X, y, Z, c, gl);
    }
  }
}

/** Rubble the cluster grows out of: a lumpy mound with finer pebbles in it (fine voxels). */
function rubbleHi(g, cx, cy, cz, rx, ry, c0, c1, seed) {
  g.ell(cx, cy, cz, rx, ry, rx, (x, y, z) => {
    const n = hv(x >> 2, y >> 1, z >> 2, seed), m = hv(x, y, z, seed + 1);
    return m < 0.06 ? shade(c1, 0.75) : m > 0.95 ? shade(c0, 1.25) : n < 0.5 ? c0 : c1;
  });
  for (let i = 0; i < 10; i++) {
    const a = hv(i, 1, 2, seed) * Math.PI * 2, d = rx * (0.6 + 0.5 * hv(i, 2, 3, seed));
    const pr = 1 + hv(i, 3, 4, seed) * 1.6;
    g.ell(cx + Math.cos(a) * d, cy + 0.5, cz + Math.sin(a) * d, pr, pr * 0.7, pr, (x, y, z) => (hv(x, y, z, seed + 9) < 0.3 ? shade(c0, 1.2) : c1));
  }
}

export function crystalHi(r, v, pal) {
  const big = v % 2 === 0;
  const S = (big ? 24 : 16) * K, H = (big ? 30 : 18) * K;
  const g = new PGrid(S, H, S);
  const c = S / 2;
  rubbleHi(g, c, 0, c, (big ? 5.5 : 3.6) * K, 1.8 * K, pal.base, shade(pal.base, 0.8), 17);
  const n = big ? r.int(5, 8) : r.int(3, 5);
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const a = r() * Math.PI * 2, d = main ? r.range(0, 1) : r.range(2, big ? 6 : 4);
    const bx = c + Math.cos(a) * d * K, bz = c + Math.sin(a) * d * K;
    const len = main ? (big ? r.int(22, 28) : r.int(12, 16)) : Math.round((big ? r.range(7, 18) : r.range(5, 11)));
    const w = main ? (big ? r.range(2.6, 3.2) : r.range(1.6, 2.1)) : r.range(1, 2.2);
    const lean = main ? [r.range(-0.08, 0.08), r.range(-0.08, 0.08)] : [Math.cos(a) * r.range(0.12, 0.3), Math.sin(a) * r.range(0.12, 0.3)];
    hexPrism(g, bx, 0, bz, Math.min(len, H / K - 1) * K, w * K * 0.9, lean, r() * Math.PI, pal, { seed: 31 + i * 7 });
  }
  return g;
}

export function crystalCHi(r, pal) {
  const g = new PGrid(16 * K, 18 * K, 16 * K);
  const c = 8 * K, top = 17 * K;
  rubbleHi(g, c, top, c, 4 * K, 1.6 * K, pal.base, shade(pal.base, 0.8), 19);
  const n = r.int(3, 6);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = i ? r.range(1.5, 4.5) : 0;
    const len = i ? r.int(4, 11) : r.int(11, 16), w = i ? r.range(1, 1.8) : r.range(1.6, 2.2);
    const ln = [Math.cos(a) * r.range(0, 0.25), Math.sin(a) * r.range(0, 0.25)];
    hexPrism(g, c + Math.cos(a) * d * K, 16 * K, c + Math.sin(a) * d * K, len * K, w * K * 0.9, ln, r() * Math.PI, pal, { down: true, seed: 41 + i * 5 });
  }
  return g;
}

/** The core's floating void shard: a long double-ended crystal with glowing edges. */
export function shardHi(r, v, L, W) {
  const edge = v % 2 ? 0x6af0ff : 0xe070ff;
  const pal = { c: 0x34204e, hi: 0x5a3a82, lo: 0x1a0e2c, tip: edge, g: 1 };
  const g = new PGrid(9 * K, (L + 1) * K, 9 * K);
  const c = 4 * K + 1, rot = r() * Math.PI;
  // two pyramids back to back: the lower one short and pointing down
  const mid = Math.round(L * 0.42 * K);
  hexPrism(g, c, mid, c, L * K - mid, W * K * 0.85, [0, 0], rot, pal, { seed: 51, edgeGlow: 3 });
  hexPrism(g, c, mid, c, mid + 1, W * K * 0.85, [0, 0], rot, pal, { down: true, seed: 53, edgeGlow: 3 });
  return { g, edge };
}

export { PU };

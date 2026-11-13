// Wave 12, "super high resolution" ore: every face of an ore voxel that meets open cave wears a
// little 1/128 m voxel patch of the ore itself (Props places them: one per exposed face, gone with
// the voxel), so a deposit in the wall reads as real ore at arm's length instead of a 1/16 m block:
//
//   nugget   lumpy metal nuggets in a gangue crust, lit tops, dark undersides, glints
//   crystal  / gem: little hexagonal points (./crystalHi.js hexPrism) with facets and a bright tip
//   coal     stacked glossy flakes with sheen on their edges
//   salt     tiny cubes
//   fossil   a ribbed shell fragment
//   truffle  warty lumps
//
// A patch covers its 1/16 m face exactly (8 × 8 voxels of 1/128 m), so neighbouring faces tile into
// one skin, and stands at most ~5 voxels proud. oreBit(r, v, oreId, mount) → the builder's
// { grid, pivot, scale, refine, main } for mount 'floor' (on top), 'ceil' (underneath, hanging)
// or 'wall' (z = 0 is the rock face, out along +z).
import { PGrid, PU, hv, shade, mixc } from './grid.js';
import { hexPrism } from './crystalHi.js';
import { ORES } from '../../data/ores.js';
import { shapeOf, oreColors } from '../clumps/grid.js';

export const BIT_K = 8; // voxels per prop voxel (1/128 m)
const N = BIT_K; // the patch's footprint (one 1/16 m terrain voxel face)
const HH = 6; // its height room
const Q = N / 12; // (the shapes below were drawn for a 12-voxel patch)

/** The patch growing up (+y) from y = 0 over N × N, in a scratch grid. */
function patch(r, v, oreId) {
  const item = ORES[oreId]?.item || 'copper_ore';
  const shape = shapeOf(item);
  const [dark, main, main2, light, glint] = oreColors(item, oreId);
  const g = new PGrid(N, HH, N);
  const gang = mixc(shade(dark, 0.7), 0x3a332c, 0.5), gang2 = shade(gang, 1.25);
  const s = (v + 1) * 977 + oreId * 131;
  // a thin crust over the whole face: gangue with ore showing through, so the coarse face beneath
  // never shows (1-2 voxels, its height from a little noise)
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const n = hv(x >> 1, z >> 1, 3, s), m = hv(x >> 1, z >> 1, 5, s);
    const ore = hv(x >> 1, 7, z >> 1, s + 1) < 0.5;
    const c = ore ? (m < 0.5 ? main : main2) : (m < 0.5 ? gang : gang2);
    g.set(x, 0, z, c);
    if (n > 0.55) g.set(x, 1, z, ore ? (m > 0.85 ? light : main) : gang2);
  }
  const lit = (c, y, top) => (top ? light : y <= 1 ? dark : c);
  if (shape === 'nugget' || shape === 'truffle') {
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const cx = 2 + r() * (N - 4), cz = 2 + r() * (N - 4), rr = ((shape === 'truffle' ? 2.4 : 1.8) + r() * 1.6) * Q, ry = rr * (0.55 + r() * 0.4);
      g.ell(cx, 1, cz, rr, ry + 1, rr, (x, y, z, dx, dy, dz) => {
        const k = hv(x, y, z, s + i);
        if (Math.abs(dx) + Math.abs(dz) > 1.25 && k < 0.35) return -1; // lumpy outline
        if (shape === 'truffle') return k < 0.12 ? shade(dark, 0.8) : dy > 0.5 ? (k > 0.8 ? light : main) : dy < 0 ? dark : main2;
        if (dy > 0.55 && k > 0.9) return glint;
        return lit(k < 0.5 ? main : main2, y, dy > 0.6);
      });
    }
    // flecks of glint and a few warts
    for (let i = 0; i < 4; i++) { const x = Math.floor(r() * N), z = Math.floor(r() * N); for (let y = HH - 1; y >= 0; y--) if (g.has(x, y, z)) { g.set(x, y + 1, z, shape === 'truffle' ? dark : glint, shape === 'truffle' ? 0 : 1); break; } }
  } else if (shape === 'crystal' || shape === 'gem') {
    const pal = { c: main, hi: light, lo: dark, tip: glint, g: shape === 'gem' ? 1 : 0 };
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const cx = 2 + r() * (N - 4), cz = 2 + r() * (N - 4);
      const a = r() * Math.PI * 2, lean = 0.12 + r() * 0.22;
      hexPrism(g, cx, 1, cz, 3 + Math.floor(r() * (HH - 3)), (1.1 + r() * 1.1) * Q * 1.2, [Math.cos(a) * lean, Math.sin(a) * lean], r() * Math.PI, pal, { seed: s + i * 13 });
    }
  } else if (shape === 'coal') {
    for (let i = 0; i < 3; i++) {
      const cx = 2 + r() * (N - 4), cz = 2 + r() * (N - 4), rr = (2 + r() * 2.2) * Q, y = 1 + i;
      for (let z = Math.floor(cz - rr); z <= cz + rr; z++) for (let x = Math.floor(cx - rr); x <= cx + rr; x++) {
        const d = Math.hypot(x - cx, (z - cz) * 1.3);
        if (d > rr || hv(x, y, z, s) < 0.15) continue;
        g.set(x, y, z, d > rr - 1 ? light : hv(x >> 1, y, z >> 1, s + 2) < 0.3 ? main2 : main); // sheen on the flake's rim
      }
    }
  } else if (shape === 'salt') {
    for (let i = 0; i < 5; i++) {
      const x0 = Math.floor(1 + r() * (N - 4)), z0 = Math.floor(1 + r() * (N - 4)), w = 1 + Math.floor(r() * 2);
      for (let y = 1; y <= w; y++) for (let z = z0; z < z0 + w; z++) for (let x = x0; x < x0 + w; x++) g.set(x, y, z, y === w ? light : x === x0 ? main2 : main);
    }
  } else {
    // fossil: a ribbed curl of shell
    const cx = N / 2, cz = N / 2;
    for (let t = 0; t < 22; t++) {
      const a = t * 0.5, rad = (1 + t * 0.14) * Q;
      const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
      g.set(x, 1, z, t % 3 === 0 ? dark : light); g.set(x, 2, z, t % 3 === 0 ? main2 : main);
    }
  }
  return { g, main };
}

export function oreBit(r, v, oreId, mount) {
  const { g: P, main } = patch(r, v, oreId);
  let g, pivot;
  if (mount === 'ceil') {
    g = new PGrid(N, HH, N);
    for (let z = 0; z < N; z++) for (let y = 0; y < HH; y++) for (let x = 0; x < N; x++) { const d = P.data[x + N * (y + HH * z)]; if (d) g.data[x + N * ((HH - 1 - y) + HH * z)] = d; }
    pivot = [N / 2, HH, N / 2];
  } else if (mount === 'wall') {
    g = new PGrid(N, N, HH);
    for (let z = 0; z < N; z++) for (let y = 0; y < HH; y++) for (let x = 0; x < N; x++) { const d = P.data[x + N * (y + HH * z)]; if (d) g.data[x + N * (z + N * y)] = d; }
    pivot = [N / 2, N / 2, 0];
  } else { g = P; pivot = [N / 2, 0, N / 2]; }
  const c = [((main >> 16) & 255) / 255, ((main >> 8) & 255) / 255, (main & 255) / 255];
  return { grid: g, pivot, scale: PU / BIT_K, refine: false, main: c };
}

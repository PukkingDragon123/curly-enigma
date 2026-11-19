// Wave 16: the commonest cave props drawn natively at 1/64 m (crates, barrels, signs) and 1/32 m
// (ore carts, rails, timber supports) instead of being refined up from coarser grids, so every
// plank seam, grain streak, nail head, rivet, hoop, spoke and tie plate is a deliberate voxel.
// Registered over ./hires.js and ./models.js by ./models.js (same ids, same contract):
// (r, v, p) → { grid, pivot (voxels), scale, light?, main, ao? }.
import { PGrid, hv } from './grid.js';

export const P4 = 1 / 64;
const P2 = 1 / 32;

const IRON_D = 0x24262a, IRON = 0x3a3e44, IRON_M = 0x50555c, IRON_L = 0x727982, IRON_H = 0xa8b0ba;
const RUST_D = 0x4e2614, RUST = 0x7a3c1e, RUST_L = 0xa65a2e, RUST_H = 0xc8783c;
const OAK = [0x26170b, 0x3a2412, 0x4e3119, 0x623e20, 0x784d28, 0x8e5e32, 0xa8723e, 0xc08a50];
const PINE = [0x4a3418, 0x5e4220, 0x74522a, 0x8a6434, 0xa07840, 0xb88e50, 0xcca664, 0xdcbc7c];
const STONE = [0x2a2624, 0x3a3532, 0x4a4440, 0x5a534e, 0x6c645e, 0x80776f, 0x968c82];
const ROPE = [0x3e2e1a, 0x544028, 0x6c5434, 0x846842, 0x9c7e52, 0xb8986a];
const ORES = [[0xb07a1c, 0xf0c040, 0xfff0a0], [0x8a3e1a, 0xd8743a, 0xffb07a], [0x6e7c8a, 0xb8c4d0, 0xf0f6ff], [0x2a5a8a, 0x4aa0e0, 0xbfe8ff]];
const t = (R, k) => R[Math.max(0, Math.min(R.length - 1, Math.round(k)))];

/** Wood along an axis: per-plank tone, grain streaks, the odd knot (dark ring, lighter heart). */
function wood(R, axis, base, seed = 0, plank = 0) {
  return (x, y, z) => {
    const a = axis === 'x' ? x : axis === 'y' ? y : z;
    const u = axis === 'x' ? y * 3 + z : axis === 'y' ? x * 3 + z : x * 3 + y;
    const streak = hv(u, Math.floor(a / 9), plank, 31 + seed) < 0.28 ? -1 : hv(u, Math.floor(a / 6), plank, 33 + seed) > 0.85 ? 1 : 0;
    const kx = Math.floor(a / 14), kn = hv(kx, plank, 0, 35 + seed);
    let knot = 0;
    if (kn < 0.35) { const ka = kx * 14 + 7, d = Math.hypot(a - ka, (u % 9) - 4); if (d < 1.6) knot = d < 0.8 ? -1 : -2; }
    return t(R, base + streak + knot + (hv(plank, seed, 0, 39) - 0.5) * 1.2);
  };
}
/** A rivet / nail head: a 2×2 cap with a lit corner, standing proud by one voxel on face dir. */
function rivet(g, x, y, z, dx, dy, dz, big = true) {
  const put = (a, b, c) => g.set(x + a, y + b, z + c, a + b + c === 0 ? IRON_H : IRON_L);
  if (!big) { g.set(x, y, z, IRON_H); return; }
  if (dz) { put(0, 0, 0); put(1, 0, 0); put(0, 1, 0); put(1, 1, 0); g.set(x, y + 1, z, IRON_H); g.set(x + 1, y, z, IRON_M); }
  else if (dx) { put(0, 0, 0); put(0, 1, 0); put(0, 0, 1); put(0, 1, 1); g.set(x, y + 1, z, IRON_H); g.set(x, y, z + 1, IRON_M); }
  else { put(0, 0, 0); put(1, 0, 0); put(0, 0, 1); put(1, 0, 1); g.set(x, y, z, IRON_H); }
}
/** A heap of ore lumps over a floor (x0..x1, z0..z1) up to about h: rock lumps and glinting ore. */
function oreHeap(g, x0, x1, z0, z1, yb, h, seed) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < 70; i++) {
    const x = x0 + hv(i, 1, seed, 81) * (x1 - x0), z = z0 + hv(i, 2, seed, 81) * (z1 - z0);
    const top = yb + h * (1 - 0.6 * Math.hypot((x - cx) / ((x1 - x0) / 2), (z - cz) / ((z1 - z0) / 2)));
    const r = 2 + hv(i, 3, seed, 81) * 2.6, y = yb + hv(i, 4, seed, 81) * Math.max(0, top - yb);
    const ore = hv(i, 5, seed, 81) < 0.28 ? ORES[Math.floor(hv(i, 6, seed, 81) * ORES.length)] : null;
    g.ell(x, y, z, r, r * 0.8, r, (xx, yy, zz, dx, dy) => {
      if (ore) return dy > 0.5 && hv(xx, yy, zz, 9) < 0.3 ? ore[2] : dy > -0.2 ? ore[1] : ore[0];
      return t(STONE, 2.6 + dy * 1.6 + (hv(xx >> 1, yy >> 1, zz >> 1, 85) - 0.5) * 1.2);
    }, ore ? 1 : 0);
  }
}

export const HIRES64 = {
  /** A crate: chamfered oak frame, pine planks with seams, grain and knots, a Z-brace, nails,
   *  corner brackets, rope handles and a stencilled emblem (v 1: broken open, ore spilling). */
  crate(r, v) {
    const S = 40, g = new PGrid(S + 4, S + 2, S + 4);
    const broken = v % 2 === 1, top = broken ? 24 : S;
    const lo = 2, hi = S + 1;
    g.box(lo, 0, lo, S, top, S, (x, y, z) => {
      const ex = x <= lo + 2 || x >= hi - 2, ez = z <= lo + 2 || z >= hi - 2, ey = y <= 2 || y >= top - 3;
      const sx = x === lo || x === hi, sz = z === lo || z === hi, sy = y === 0 || y === top - 1;
      const n = (ex && ez) + (ex && ey) + (ez && ey);
      if (n) {
        // frame: chamfer the outer edge, oak grain along its length
        if ((sx && sz) || (sx && sy && ez) || (sz && sy && ex)) return t(OAK, 2);
        return wood(OAK, ex && ez ? 'y' : ex ? 'z' : 'x', 4, 1, 0)(x, y, z);
      }
      if (!sx && !sz && !sy) return broken && y > 6 ? -1 : 0x1e140a;
      if (sy) return y === 0 ? t(PINE, 2) : (broken ? -1 : (x % 10 === 0 ? t(PINE, 1) : wood(PINE, 'z', 4, 2, x / 10 | 0)(x, y, z)));
      const along = sx ? z : x, pl = Math.floor(y / 9);
      if (y % 9 === 0) return t(PINE, 0); // the seam between planks
      if (broken && y > top - 6 && hv(along >> 2, pl, sx ? 1 : 2, 87) < 0.5) return -1; // splintered tops
      return wood(PINE, sx ? 'z' : 'x', 4, 3, pl * 4 + (sx ? 1 : 2))(x, y, z);
    });
    if (!broken) {
      // a Z-brace on the two broad faces, nails at the plank ends, corner brackets on top
      for (const zf of [lo - 1, hi + 1]) {
        for (let k = 0; k < S - 6; k++) for (let w = 0; w < 3; w++) g.set(lo + 3 + k, 3 + k + w - 1, zf, wood(OAK, 'x', w === 1 ? 5 : 3, 4)(k, k, zf));
        for (let y = 4; y < S - 2; y += 9) for (const x of [lo + 4, hi - 5]) rivet(g, x, y, zf, 0, 0, 1, false);
      }
      for (const [x, z] of [[lo - 1, lo - 1], [hi, lo - 1], [lo - 1, hi], [hi, hi]]) for (let k = 0; k < 6; k++) { g.set(x + (x > lo ? 1 : 0), top - 1 - k, z + (z < lo ? 0 : 1) + (z > lo ? 0 : 0), k === 0 ? IRON_L : IRON); }
      // rope handles on the narrow faces
      for (const xf of [lo - 2, hi + 2]) for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI; g.set(xf, S - 12 + Math.round(Math.sin(a) * 3), S / 2 - 4 + Math.round(k * 0.75), t(ROPE, 2 + (k & 1) * 1.5)); }
      // the stencil: a pick crossed over a star, in chipped red paint
      const em = (y, z) => {
        const dy = y - 20, dz = z - (S / 2 + 2);
        const star = Math.abs(dy) + Math.abs(dz) * 0.5 < 5 || Math.abs(dz) + Math.abs(dy) * 0.5 < 5;
        const pick = (Math.abs(dy - dz) < 1.2 && Math.abs(dz) < 9) || (Math.abs(dy + dz - 7) < 1.2 && dz > -2 && dz < 8 && dy > 2);
        return (star || pick) && hv(y, z, 7, 91) < 0.86;
      };
      for (let y = 8; y < 32; y++) for (let z = lo + 6; z < hi - 6; z++) if (em(y, z) && g.has(hi, y, z)) g.set(hi, y, z, hv(y >> 1, z >> 1, 3, 92) < 0.2 ? 0x6a1e12 : 0x9a3020);
    } else {
      oreHeap(g, lo + 3, hi - 3, lo + 3, hi - 3, 2, 14, 7);
      g.line(lo + 4, 22, lo - 2, hi - 6, 3, lo - 4, (tt) => wood(PINE, 'x', 4, 5, 9)(Math.round(tt * 30), 0, 0), 0, 1.6); // a loose plank
    }
    return { grid: g, pivot: [S / 2 + 2, 0.5, S / 2 + 2], scale: P4, main: [0.42, 0.3, 0.18] };
  },

  /** A barrel: bellied staves with bevelled seams and grain, three riveted hoops with rust running
   *  under them, a planked head with a bung and a chalk mark (v 1: open, full of water). */
  barrel(r, v) {
    const c = 22, H = 48, g = new PGrid(46, H + 3, 46);
    const hoops = [[4, 6], [17, 19], [H - 7, H - 5]];
    for (let y = 0; y < H; y++) {
      const R = 14.6 + Math.sin((y / (H - 1)) * Math.PI) * 3.4;
      const hp = hoops.find(([a, b]) => y >= a && y <= b);
      g.cylY(c, c, R + (hp ? 0.7 : 0), y, y + 1, (x, yy, z) => {
        const d = Math.hypot(x - c, z - c);
        if (d < R - 2.6) return -1; // hollow
        const a = Math.atan2(z - c, x - c), sv = ((a + Math.PI) / (Math.PI * 2)) * 22, stave = Math.floor(sv);
        if (hp) {
          if (yy === hp[0] + 1 && Math.floor(sv * 2) % 7 === 0) return IRON_H; // rivets
          return hv(x, yy, z, 8) < 0.12 ? RUST : yy === hp[1] ? IRON_L : yy === hp[0] ? IRON_D : IRON;
        }
        if (sv - stave < 0.07) return t(OAK, 1); // the seam
        const under = hoops.some(([a]) => yy < a && yy > a - 6 && hv(Math.round(a * 30), stave, 0, 41) < 0.3);
        if (under && hv(x, yy, z, 42) < 0.6) return yy > hoops.find(([a]) => yy < a)[0] - 3 ? RUST : RUST_D; // rust runs
        const lit = Math.cos(a - 2.4) * 0.9;
        return t(OAK, 4 + (stave & 1 ? 0.5 : -0.4) + lit + (hv(stave, yy >> 2, 0, 9) < 0.18 ? -1 : 0) + (hv(stave * 7 + (x & 1), yy >> 3, 1, 10) < 0.15 ? 1 : 0));
      });
    }
    if (v % 2) {
      g.cylY(c, c, 13, H - 4, H - 3, (x, y, z) => (Math.hypot(x - c + 4, z - c + 3) < 3 ? 0xbfe0f4 : hv(x, y, z, 12) < 0.08 ? 0x8ab8d8 : (x + z) % 7 === 0 ? 0x3a5a7a : 0x2c4a6a), 0);
    } else {
      g.cylY(c, c, 13.4, H - 2, H - 1, (x, y, z) => ((x - c + 30) % 9 === 0 ? t(OAK, 1) : wood(OAK, 'z', 4, 6, (x - c + 30) / 9 | 0)(x, y, z)));
      g.cylY(c, c, 2.2, H - 1, H + 1, t(OAK, 2)); g.set(c, H, c, t(OAK, 4)); // the bung
      for (let k = -5; k <= 5; k++) { g.set(c + k, H - 1, c + 6 + (Math.abs(k) > 3 ? 1 : 0), 0xe8e0d0); if (k > -4 && k < 4) g.set(c + 4, H - 1, c + 6 + k * 0.5, 0xe8e0d0); } // a chalk tally
    }
    return { grid: g, pivot: [c, 0.5, c], scale: P4, ao: false, main: [0.42, 0.28, 0.16] };
  },

  /** A signpost: a barked post, a planked board with a carved arrow and painted letters, nails, a
   *  little roof of shakes (v 1: weathered, a corner split off). */
  sign(r, v) {
    const g = new PGrid(68, 92, 26);
    // the post: bark with deep furrows, a split near the top
    g.box(6, 0, 8, 7, 84, 7, (x, y, z) => {
      const edge = (x === 6 || x === 12) && (z === 8 || z === 14);
      if (edge) return -1;
      const fur = ((x + z * 3 + (y >> 3)) % 5 === 0);
      return y < 6 ? 0x3a2414 : fur ? 0x3e2814 : hv(x, y >> 2, z, 63) < 0.25 ? 0x6a4a2a : 0x5a3c20;
    });
    // the board: three planks with seams, grain, a carved arrow, painted letters
    const by0 = 52, by1 = 74, bx1 = 56;
    for (let y = by0; y <= by1; y++) for (let x = 0; x <= bx1; x++) {
      const tip = x > bx1 - 8 ? Math.abs(y - (by0 + by1) / 2) > (bx1 - x) * 1.3 : false;
      if (tip) continue;
      if (v % 2 && x < 6 && y > by1 - 6 && x + (by1 - y) < 7) continue; // the split corner
      const pl = Math.floor((y - by0) / 7.5), seam = (y - by0) % 7.5 < 1 && y > by0;
      for (let z = 15; z <= 17; z++) g.set(x, y, z, seam ? t(PINE, 1) : wood(PINE, 'x', 4.4, 8, pl)(x, y, z));
    }
    // the carved arrow (sunk, darker) and painted letters (hand-made blocky glyphs)
    for (let x = 14; x <= 50; x++) for (let y = by0 + 3; y <= by1 - 3; y++) {
      const mid = (by0 + by1) / 2;
      const shaft = x < 42 && Math.abs(y - mid) < 1.2, head = x >= 40 && Math.abs(y - mid) < (50 - x) * 0.9;
      if (shaft || head) g.set(x, y, 18, t(PINE, 1));
    }
    const glyph = ['1110 1001 1110 1001 1110', '0110 1001 1111 1001 1001', '1001 1101 1011 1001 1001', '1111 1000 1110 1000 1111'];
    for (let k = 0; k < 3; k++) {
      const rows = glyph[(k + v) % glyph.length].split(' ');
      rows.forEach((row, ry) => [...row].forEach((b, rx) => { if (b === '1' && hv(k, rx, ry, 71) < 0.9) g.set(16 + k * 7 + rx, by1 - 4 - ry, 18, 0xf0e4c8); }));
    }
    for (const [x, y] of [[3, by0 + 3], [3, by1 - 3], [bx1 - 10, by0 + 3], [bx1 - 10, by1 - 3]]) rivet(g, x, y, 18, 0, 0, 1);
    // a little roof of shakes over it
    for (let x = -2; x <= bx1 - 6; x++) for (let k = 0; k < 5; k++) g.set(x + 2, by1 + 3 + k, 12 + k * 2 - (k > 2 ? 0 : 0), (x + k * 3) % 6 === 0 ? t(OAK, 1) : t(OAK, 3 + (hv(x >> 2, k, 0, 77) < 0.3 ? -1 : 0)));
    g.box(8, by1 + 1, 12, 3, 4, 3, t(OAK, 2)); // the roof's bracket
    if (v % 2) for (let y = 30; y < 50; y += 3) g.set(5, y, 11, hv(y, 1, 2, 78) < 0.5 ? 0x3e7a32 : 0x5a9a3e); // moss up the post
    return { grid: g, pivot: [9.5, 2, 11.5], scale: P4, main: [0.45, 0.32, 0.2] };
  },

  /** An ore cart: a riveted iron tub with corner plates, ribs, rust and a dent, buffers, a push
   *  bar, leaf springs and axle boxes on flanged six-spoke wheels; heaped ore (v 1: tipped, spilt). */
  cart(r, v) {
    const tipped = v % 2 === 1;
    const W = 30, H = 26, D = 22;
    const g = tipped ? new PGrid(W + 4, D + 2, H + 20) : new PGrid(W + 4, H + 2, D + 2);
    const put = (x, y, z, c, gl = 0) => { if (tipped) g.set(x + 2, D - z, y, c, gl); else g.set(x + 2, y, z + 1, c, gl); };
    for (let y = 8; y < H; y++) {
      const fl = Math.round((y - 8) / 9);
      for (let z = 1 - fl; z < D - 1 + fl; z++) for (let x = 1 - fl; x < W - 1 + fl; x++) {
        const wall = x === 1 - fl || x === W - 2 + fl || z === 1 - fl || z === D - 2 + fl;
        if (!wall && y > 9) continue;
        const corner = (x <= 2 - fl || x >= W - 3 + fl) && (z <= 2 - fl || z >= D - 3 + fl);
        const rim = y >= H - 2, rib = !rim && (x === 8 || x === 15 || x === 22) && wall, band = y === 10 || y === 11;
        const dent = Math.hypot(x - 19, y - 16) < 3 && z === 1 - fl;
        let c = rim ? (y === H - 1 ? IRON_L : IRON_D) : rib || band || corner ? IRON_D : dent ? 0x4a443e : hv(x >> 2, y >> 2, z >> 2, 51) < 0.25 ? (hv(x, y, z, 50) < 0.5 ? RUST : RUST_D) : hv(x >> 1, y >> 1, z >> 1, 52) < 0.06 ? RUST_L : (y > 18 ? 0x625a52 : 0x56504a);
        if ((rib || corner) && y % 3 === 0) c = IRON_H; // rivets
        if ((band || rim) && x % 3 === 0 && wall) c = IRON_H;
        put(x, y, z, c);
      }
    }
    // buffers on the ends, a push bar at the back, a coupling hook
    for (const x of [-1, W]) for (const z of [5, D - 6]) { put(x, 12, z, IRON_D); put(x, 13, z, IRON_L); put(x, 12, z + 1, IRON); put(x, 13, z + 1, IRON_M); }
    for (let z = 4; z < D - 4; z++) put(-1, H, z, z % 4 === 0 ? IRON_D : IRON_L);
    put(-1, H - 1, 4, IRON_D); put(-1, H - 1, D - 5, IRON_D); put(W, 10, D / 2, IRON_L); put(W, 9, D / 2, IRON_D);
    // the load
    if (!tipped) {
      const gg = new PGrid(W, 14, D);
      oreHeap(gg, 2, W - 3, 2, D - 3, 1, 9, 3);
      for (let z = 0; z < D; z++) for (let y = 0; y < 14; y++) for (let x = 0; x < W; x++) { const c = gg.color(x, y, z); if (c >= 0 && x > 1 && z > 1 && x < W - 2 && z < D - 2) put(x, y + 10, z, c, (gg.data[x + gg.w * (y + gg.h * z)] >>> 25) & 3); }
    }
    // chassis, leaf springs, axle boxes, wheels: flanged rims, six spokes, hubs
    for (let x = 2; x < W - 2; x++) { put(x, 7, 4, IRON_D); put(x, 7, D - 5, IRON_D); }
    for (const wx of [7, 22]) {
      for (let z = 1; z < D - 1; z++) put(wx, 5, z, IRON);
      for (const wz of [1, D - 2]) {
        for (let k = -3; k <= 3; k++) put(wx + k, 8 - (Math.abs(k) > 2 ? 0 : 0) - (Math.abs(k) === 3 ? 0 : 1) + 1, wz + (wz < 5 ? 1 : -1), Math.abs(k) === 3 ? IRON_D : IRON_M); // spring
        put(wx, 6, wz + (wz < 5 ? 1 : -1), IRON_D); put(wx, 7, wz + (wz < 5 ? 1 : -1), IRON_L); // axle box
        for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
          const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
          if (d > 5.3) continue;
          const tyre = d > 4.2, spoke = d > 1.3 && Math.abs(((a / (Math.PI / 3)) % 1 + 1) % 1 - 0.5) > 0.38;
          if (!tyre && !spoke && d > 1.4) continue;
          put(wx + dx, 5 + dy, wz, d < 1.4 ? IRON_H : tyre ? (dy > 0 ? IRON_M : IRON_D) : IRON);
          if (tyre && d > 4.8) put(wx + dx, 5 + dy, wz + (wz < 5 ? 1 : -1), IRON_D); // the flange
        }
      }
    }
    if (tipped) {
      g.ell(17, 0.5, H + 11, 11, 3, 8, (x, y, z) => (g.has(x, y, z) ? -1 : hv(x, y, z, 57) < 0.07 ? ORES[Math.floor(hv(x, y, z, 58) * 4)][1] : t(STONE, 2.4 + (hv(x >> 1, y, z >> 1, 59) - 0.5) * 2.5)), 0);
      return { grid: g, pivot: [17, 2, 14], scale: P2, ao: false, main: [0.35, 0.3, 0.28] };
    }
    return { grid: g, pivot: [17, -6, 12], scale: P2, ao: false, main: [0.35, 0.3, 0.28] };
  },

  /** A rail length: a ballast bed of stones, adzed sleepers with grain and tie plates, rails with
   *  a real head / web / foot profile and spikes (v 1: a sleeper slipped, a rail end sprung). */
  rail(r, v) {
    const g = new PGrid(32, 12, 24);
    g.box(0, 0, 3, 32, 4, 18, (x, y, z) => {
      const sx = x >> 1, sz = z >> 1;
      if (y === 3 && (z === 3 || z === 20) && hv(sx, sz, v, 2) < 0.6) return -1;
      const h = hv(sx, y, sz, 1);
      return h < 0.3 ? 0x423c38 : h < 0.6 ? 0x5a524c : h < 0.85 ? 0x6e6660 : 0x847a72;
    });
    for (let x = 1; x < 32; x += 8) {
      const off = v === 1 && x === 17 ? 2 : 0;
      g.box(x, 3, 1 + off, 5, 3, 22, (xx, y, z) => {
        if ((xx === x || xx === x + 4) && y === 5) return 0x3a2614; // adzed edges
        return y === 3 ? 0x3e2a16 : wood(OAK, 'z', 3.4, 12, x)(xx, y, z);
      });
    }
    for (const z of [6, 17]) {
      const end = v === 1 && z === 17 ? 23 : 32;
      for (let x = 0; x < end; x++) {
        const rust = hv(x >> 1, z, v, 5) < 0.2;
        g.set(x, 6, z - 1, IRON_D); g.set(x, 6, z, IRON_D); g.set(x, 6, z + 1, IRON_D); // foot
        g.set(x, 7, z, rust ? RUST : IRON); // web
        g.set(x, 8, z, rust ? RUST_L : IRON_L); g.set(x, 8, z + 1, rust ? RUST : IRON_M); // head
        g.set(x, 9, z, x % 5 === 0 ? IRON_L : IRON_H); // polished running top (1/8 m + over the spot, as before)
      }
      if (v === 1 && z === 17) { g.set(23, 9, 17, RUST); g.set(24, 10, 18, RUST_L); }
      for (let x = 1; x < 32; x += 8) for (const zz of [z - 2, z + 2]) { g.set(x + 2, 6, zz, IRON_M); g.set(x + 1, 6, zz, IRON_D); g.set(x + 2, 7, zz, IRON_L); } // tie plates and spikes
    }
    return { grid: g, pivot: [16, 4, 12], scale: P2, main: [0.3, 0.22, 0.15] };
  },

  /** A timber support: a chamfered post with grain and iron bands, a capping beam with knee braces
   *  and wedges, footing stones (v 1: rope-lashed, a lamp hook). p: height (1/16 m voxels). */
  post(r, v, Hp) {
    const H = Hp * 2, g = new PGrid(20, H, 16);
    const cx = 8, cz = 6;
    g.box(cx - 2, 0, cz - 2, 5, H - 4, 5, (x, y, z) => {
      const ex = x === cx - 2 || x === cx + 2, ez = z === cz - 2 || z === cz + 2;
      if (ex && ez) return -1; // chamfered
      if ((y % 22 === 10 || y % 22 === 11) && y < H - 10) return y % 22 === 10 ? IRON : IRON_L; // iron bands
      return wood(OAK, 'y', 4, 13, 0)(x, y, z);
    });
    // the capping beam, its knee braces and wedges
    g.box(1, H - 4, cz - 3, 18, 4, 7, (x, y, z) => ((x === 1 || x === 18) && (y === H - 4) ? -1 : y === H - 1 ? wood(OAK, 'x', 5, 14, 1)(x, y, z) : wood(OAK, 'x', 3.6, 14, 2)(x, y, z)));
    for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) g.box(cx + sd * (3 + k), H - 5 - (5 - k), cz - 1, 1, 2, 3, wood(OAK, 'y', 3.4, 15, 3));
    g.box(cx - 1, H - 5, cz + 3, 3, 1, 1, t(PINE, 5)); // a wedge
    rivet(g, cx, H - 3, cz + 4, 0, 0, 1);
    for (const [x, z, rr] of [[cx - 4, cz + 1, 2.4], [cx + 4, cz - 2, 2], [cx + 1, cz + 4, 1.8]]) g.ell(x, 0.8, z, rr, 1.6, rr, (xx, yy, zz) => t(STONE, 3 + (hv(xx, yy, zz, 64) - 0.5) * 2));
    if (v % 2) {
      for (let y = 8; y < H - 12; y += 12) for (let k = 0; k < 4; k++) g.box(cx - 3, y + k, cz - 3, 7, 1, 7, (x, yy, z) => (x === cx - 3 || x === cx + 3 || z === cz - 3 || z === cz + 3 ? t(ROPE, 2 + ((x + z + k) & 1) * 1.5) : -1));
      g.set(cx, H - 6, cz + 3, IRON_D); g.set(cx, H - 7, cz + 4, IRON_L); g.set(cx, H - 8, cz + 4, IRON_D); // a lamp hook
    }
    return { grid: g, pivot: [cx + 0.5, 0.5, cz + 0.5], scale: P2, main: [0.35, 0.24, 0.14] };
  },
};

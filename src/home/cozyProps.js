// The cosy dressing of Old Star's cave (wave 18, "make your house a lot better, more detailed"):
// the root-beam roof (thick old roots that run across the rock like rafters, a hewn ridge beam
// wedged between them with iron straps and hooks, rootlets trailing down), bunches of herbs, chillies,
// garlic and mushrooms drying on the hooks, his workbench and its clutter, a shelf of jars by the
// forge, candles that have run down in long wax drips, the family portrait (Old Star, young, with
// Marigold and the little ones), a mushroom garden in a planter box in the damp corner and a
// patchwork quilt. Conventions as caveProps.js: tile units (the room group is scaled to metres);
// floor pieces centred at their foot with the front toward +z; wall pieces have x along the wall,
// origin on the wall at their foot, +z out of it. Size-based voxels (gfx/voxRes.js): the roots and
// the beam at 1/32 m, the bench's frame at 1/32 m, everything small at 1/64 m, the painting's canvas
// at 1/128 m.
import { VoxelGrid, line, ring, sag, M32, G32, group, mulc, mixc, h3, S32, S16 } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';

const T = (v) => v * S32; // 1/64 m voxels → tiles
const T2 = (v) => v * S16; // 1/32 m voxels → tiles
const BARK = [0x6e4c32, 0x7a5a3c, 0x60422c, 0x86643f, 0x6a4a30];
const PALE = [0xc8ab84, 0xb8996e, 0xd8c0a0, 0xa88a62];
const OAK = [0x5e3c24, 0x6e4a2c, 0x54341e, 0x684428];
const IRON = 0x33333b, IRONL = 0x55555f, RUST = 0x7a4228;
const WAX = [0xf2e8d2, 0xece0c4, 0xe4d6b6];
const FLAME = [0xff9a3a, 0xffd870, 0xfff4c8];

/** A candle that has burnt down unevenly, wax run down its sides in drips and pooled round its foot (1/64 m voxels). Returns the flame's voxel. */
export function dripCandle(g, gl, x, y, z, h, seed = 1, w = 2) {
  const col = WAX[seed % 3];
  // the pool of wax round its foot, spread unevenly over whatever it stands on
  for (let dz = -3; dz <= w + 2; dz++) for (let dx = -3; dx <= w + 2; dx++) {
    const ex = Math.max(0, -dx, dx - w + 1), ez = Math.max(0, -dz, dz - w + 1);
    if (ex * ex + ez * ez > 5 + hash2(dx + 9, dz + 9, seed) * 4) continue;
    g.set(x + dx, y, z + dz, hash2(dx, dz, seed + 3) < 0.25 ? mulc(col, 0.9) : col);
  }
  // the stick, its rim melted lower on one side
  for (let yy = 1; yy <= h; yy++) for (let dz = 0; dz < w; dz++) for (let dx = 0; dx < w; dx++) {
    if (yy === h && dx === 0 && dz === w - 1 && w > 1) continue;
    g.set(x + dx, y + yy, z + dz, yy === h ? mulc(col, 0.94) : col);
  }
  // drips: runs of wax from the rim down the sides, each ending in a bead
  for (let k = 0; k < 4; k++) {
    const side = (k + seed) & 3, len = 1 + Math.floor(hash2(k, 7, seed) * (h - 1));
    const sx = side === 0 ? -1 : side === 1 ? w : Math.floor(hash2(k, 1, seed) * w);
    const sz = side === 2 ? -1 : side === 3 ? w : Math.floor(hash2(k, 2, seed) * w);
    for (let j = 0; j < len; j++) g.set(x + sx, y + h - j, z + sz, mixc(col, 0xfff8ec, 0.3));
    g.set(x + sx + (side === 0 ? -1 : side === 1 ? 1 : 0), y + h - len + 1, z + sz + (side === 2 ? -1 : side === 3 ? 1 : 0), col);
  }
  // the wick and the flame
  const fx = x + (w > 1 ? 1 : 0), fz = z;
  g.set(fx, y + h + 1, fz, 0x2a2018);
  gl.set(fx, y + h + 2, fz, FLAME[0]); gl.set(fx, y + h + 3, fz, FLAME[1]); gl.set(fx, y + h + 4, fz, FLAME[2]);
  if (seed % 2) gl.set(fx, y + h + 2, fz + 1, FLAME[0]);
  return { x: fx + 0.5, y: y + h + 3, z: fz + 0.5 };
}

/** A glass jar with what's in it (1/64 m voxels): a cork or a cloth over the top tied with string, a paper label. */
function jar(g, x, y, z, r, h, c, top = 0x8a6a3a, fill = 0.75, seed = 1) {
  for (let yy = 0; yy < h; yy++) ring(g, x, z, 0, r, y + yy, y + yy + 1, (xx, yyy, zz) => {
    const edge = Math.hypot(xx + 0.5 - x, zz + 0.5 - z) > r - 1;
    if (yy >= h * fill) return edge ? 0xc8e0dc : -1;
    if (edge) return h3(xx, yyy, zz, seed) < 0.18 ? 0xe8f4f0 : mixc(c, 0xc8e0dc, 0.3);
    return h3(xx >> 1, yyy, zz >> 1, seed + 1) < 0.3 ? mulc(c, 0.8) : c;
  });
  ring(g, x, z, 0, r - 0.6, y + h, y + h + 1, mulc(top, 0.9));
  ring(g, x, z, 0, r + 0.4, y + h + 1, y + h + 2, top);
  ring(g, x, z, r - 0.2, r + 0.5, y + h - 1, y + h, 0x9a8a5a); // the string
  // the label on the front
  for (let yy = 1; yy < Math.min(h - 1, 5); yy++) for (let xx = -1; xx <= 1; xx++) g.set(Math.round(x + xx - 0.5), y + yy, Math.round(z + r - 0.5), yy === 3 && xx !== 0 ? 0x5a4a3a : 0xeadcbe);
}

// ---------------------------------------------------------------- the roof
/**
 * A great root run across the roof like a rafter (1/32 m), following pts ([x, y, z] m, absolute,
 * the root's axis), with side roots and bark knots, earth still clinging to it, and fine rootlets
 * trailing down from it (1/64 m). Returns { obj, at: { x, y, z } } (obj's origin at `at`, metres).
 */
export function rootRib(pts, seed = 401, o = {}) {
  const V = 32, pad = 5, drop = o.drop ?? 0.5;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const [x, y, z] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z); }
  x0 -= 0.25; z0 -= 0.25; x1 += 0.25; z1 += 0.25; y0 -= drop; y1 += 0.12;
  const W = Math.ceil((x1 - x0) * V) + pad * 2, H = Math.ceil((y1 - y0) * V) + pad * 2, D = Math.ceil((z1 - z0) * V) + pad * 2;
  const g = new VoxelGrid(W, H, D);
  const vp = (p) => [(p[0] - x0) * V + pad, (p[1] - y0) * V + pad, (p[2] - z0) * V + pad];
  const P = pts.map(vp);
  const R0 = o.r ?? 2.3;
  const bark = (x, y, z, t) => {
    if (h3(x >> 1, y >> 1, z >> 1, seed + 7) < 0.07) return h3(x, y, z, seed) < 0.5 ? 0x5a4632 : 0x4e3c2a; // earth still on it
    let c = BARK[Math.floor(hash2(Math.floor(t * 70), ((x + z) >> 1) & 7, seed) * BARK.length)];
    if ((x * 7 + y * 13 + z * 5) % 6 === 0) c = mulc(c, 0.74); // the grooves of the bark
    if (h3(x, y, z, seed + 3) < 0.05) c = mixc(c, 0x8a7a5a, 0.4); // lichen flecks
    return c;
  };
  line(g, P, (t) => R0 * (0.72 + 0.4 * Math.sin(t * Math.PI)) * (1 + 0.16 * Math.sin(t * 29 + seed)), bark);
  // knots: a lump here and there where a side root broke off long ago
  const at = (t) => { const f = t * (P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), u = f - i; return [P[i][0] + (P[i + 1][0] - P[i][0]) * u, P[i][1] + (P[i + 1][1] - P[i][1]) * u, P[i][2] + (P[i + 1][2] - P[i][2]) * u]; };
  for (let k = 0; k < 4; k++) { const p = at(0.15 + hash2(k, 3, seed) * 0.7); g.ellipsoid(p[0], p[1] - 0.5, p[2], R0 * 0.9, R0 * 1.0, R0 * 0.9, (x, y, z) => (h3(x, y, z, seed + k) < 0.4 ? 0x3a2818 : bark(x, y, z, 0.5))); }
  // side roots: thinner ones peeling off and back into the rock, a few sagging down a little
  const tips = [];
  for (let k = 0; k < (o.sides ?? 5); k++) {
    const t = 0.08 + hash2(k, 11, seed) * 0.84, p = at(t), q = at(Math.min(1, t + 0.04));
    const ax = q[0] - p[0], az = q[2] - p[2], l = Math.hypot(ax, az) || 1;
    const s = hash2(k, 12, seed) < 0.5 ? -1 : 1, nx = -az / l * s, nz = ax / l * s;
    const len = (0.18 + hash2(k, 13, seed) * 0.3) * V, sagd = 2 + hash2(k, 14, seed) * 5;
    const a = [p[0], p[1], p[2]], b = [p[0] + nx * len + ax / l * len * 0.4, p[1] + 1 + hash2(k, 15, seed) * 3, p[2] + nz * len + az / l * len * 0.4];
    const pts2 = sag(a, b, 8, sagd);
    line(g, pts2, (u) => 1.4 * (1 - u * 0.6), bark);
    tips.push(pts2[5]);
  }
  // rootlets trailing down from it (1/64 m, each in a little grid of its own): pale at their ends,
  // a root hair or a clod of earth now and then
  const parts = [M32(g, [pad, pad, pad], { scale: S16 })];
  const n = Math.round((o.tendrils ?? 7) * Math.hypot(x1 - x0, z1 - z0));
  for (let k = 0; k < n; k++) {
    const p = k < tips.length ? tips[k] : at(hash2(k, 21, seed));
    const len = Math.round((0.06 + hash2(k, 22, seed) ** 1.6 * (drop - 0.08)) * 64);
    const fg = new VoxelGrid(14, len + 8, 14);
    let x = 7, z = 7;
    const ph = hash2(k, 23, seed) * 6.28;
    for (let j = 0; j < len; j++) {
      const u = j / len, y = len + 4 - j;
      x += Math.sin(j * 0.35 + ph) * 0.45; z += Math.cos(j * 0.27 + ph) * 0.35;
      const c = u < 0.5 ? BARK[(k + j) % BARK.length] : PALE[(k + (j >> 2)) % PALE.length];
      fg.set(x, y, z, c);
      if (u < 0.3) fg.set(x + 1, y, z, c);
      if (j > 4 && hash2(k, j, seed + 5) < 0.06) { fg.set(x + 1, y - 1, z, PALE[0]); fg.set(x + 2, y - 2, z, PALE[1]); } // a root hair
    }
    if (hash2(k, 24, seed) < 0.18) fg.ellipsoid(x, 4, z, 1.6, 1.4, 1.6, 0x4a3a2a); // a clod of earth caught on the end
    const m = M32(fg, [7, len + 4, 7]);
    // (the rib's voxels are 1/32 m = 1/16 tile: its grid point p is at p / 16 tiles from the origin)
    m.position.set((p[0] - pad) * S16, (p[1] - pad - R0 * 0.7) * S16, (p[2] - pad) * S16);
    parts.push(m);
  }
  const obj = group(...parts);
  return { obj, at: { x: x0, y: y0, z: z0 } };
}

/**
 * A hewn ridge beam (1/32 m) along x, len m: adzed faces, grain, a long check down one side,
 * iron straps where it rests on the roots (straps: positions 0..1), oak wedges driven in over it,
 * and iron hooks under it (hooks: 0..1). Origin at its middle, on its axis. Returns { obj, hooks: [x tiles] }.
 */
export function hewnBeam(len, seed = 411, o = {}) {
  const L = Math.round(len * 32), S = 4, pad = 3;
  const g = new VoxelGrid(L, S + pad * 2 + 2, S + pad * 2);
  const c0 = pad;
  for (let x = 0; x < L; x++) for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) {
    // adzed: the corners knocked off in scoops, the faces dished a little every few voxels
    const corner = (y === 0 || y === S - 1) && (z === 0 || z === S - 1);
    if (corner && hash2(x >> 1, y + z * 4, seed) < 0.55) continue;
    let c = OAK[(Math.floor(hash2(x >> 3, y + z * 5, seed) * 4) + ((y + z) & 1)) % 4];
    if ((x + Math.floor(hash2(y, z, seed) * 9)) % 9 === 0) c = mulc(c, 0.84); // the grain
    if (z === S - 1 && y === 1 && x > L * 0.2 && x < L * 0.62) c = 0x24160c; // a long check
    if (y === 0 && h3(x, 0, z, seed) < 0.06) c = 0x2a2420; // soot from the fire, under it
    g.set(x, y + c0, z + c0, c);
  }
  // iron straps over it and its root, with rivet heads
  for (const t of o.straps || [0.12, 0.88]) {
    const sx = Math.round(t * (L - 3));
    for (let x = sx; x < sx + 2; x++) for (let y = -1; y <= S; y++) for (let z = -1; z <= S; z++) {
      if (y > -1 && y < S && z > -1 && z < S) continue;
      g.set(x, y + c0, z + c0, (x + y + z) % 5 === 0 ? RUST : IRON);
    }
    g.set(sx, c0 + 1, c0 + S, IRONL); g.set(sx + 1, c0 + 2, c0 - 1, IRONL);
  }
  // oak wedges hammered in over each end, to bind it against the rock
  for (const ex of [2, L - 5]) for (let k = 0; k < 3; k++) g.box(ex + k, c0 + S, c0 + 1, 1, 1 + k, 2, OAK[(k + 1) % 4]);
  // hooks under it: an iron S hook in a staple
  const hooks = [];
  for (const t of o.hooks || []) {
    const hx = Math.round(t * (L - 1));
    g.set(hx, c0 - 1, c0 + 1, IRON); g.set(hx, c0 - 2, c0 + 2, IRON); g.set(hx, c0 - 3, c0 + 2, IRONL);
    hooks.push(T2(hx + 0.5 - L / 2));
  }
  return { obj: M32(g, [L / 2, c0 + S / 2, c0 + S / 2], { scale: S16 }), hooks, drop: T2(S / 2 + 3) };
}

/**
 * A bunch hung up to dry (1/64 m), by kind: 'lavender', 'yarrow', 'sage', 'chilli' (a string of red
 * chillies), 'shrooms' (mushrooms threaded on a cord), 'garlic' (a plait). Hangs from its top.
 */
export function herbBundle(kind = 'lavender', seed = 421) {
  const N = 18, Hh = 26, c = N / 2;
  const g = new VoxelGrid(N, Hh, N);
  const top = Hh - 1;
  if (kind === 'chilli' || kind === 'shrooms' || kind === 'garlic') {
    line(g, [[c, top, c], [c + 0.5, top - 19, c]], 0.5, 0x9a8a5a); // the cord
    for (let k = 0; k < 6; k++) {
      const y = top - 3 - k * 2.8, a = k * 2.1 + seed, dx = Math.cos(a) * 2, dz = Math.sin(a) * 2;
      if (kind === 'chilli') {
        const col = [0xb8281e, 0xa82018, 0xc8402a, 0x8a1a14][k % 4];
        line(g, [[c, y, c], [c + dx, y - 1.5, c + dz], [c + dx * 1.6, y - 6, c + dz * 1.6]], (u) => (u < 0.2 ? 0.9 : 1.2 - u * 0.7), (x, yy, z, u) => (u < 0.12 ? 0x4a6a2a : h3(x, yy, z, seed) < 0.2 ? mulc(col, 1.25) : col));
      } else if (kind === 'shrooms') {
        const col = [0x8a6a4a, 0x9a7a52, 0x7a5a3a][k % 3];
        g.ellipsoid(c + dx * 0.5, y - 1, c + dz * 0.5, 2.6, 1.3, 2.6, (x, yy, z) => (yy < y - 1 ? 0xb8a07a : col)); // a dried cap, gills under it
      } else {
        g.ellipsoid(c + dx * 0.6, y - 1.5, c + dz * 0.6, 2.2, 2.4, 2.2, (x, yy, z) => ((x + z) % 3 === 0 ? 0xd8ccb4 : 0xece4d0));
        g.set(Math.round(c + dx * 0.6), Math.round(y - 4.2), Math.round(c + dz * 0.6), 0xc8b088); // the root tuft
        line(g, [[c, y + 1, c], [c + dx * 0.6, y - 0.5, c + dz * 0.6]], 0.5, 0xb8a878); // the plaited stalk
      }
    }
    return M32(g, [c, Hh, c]);
  }
  // a bunch: stalks tied at the top with twine, hanging head down and splaying out
  const pal = kind === 'lavender' ? { stem: [0x6a7a4a, 0x5a6a3a], head: [0x8a6aa8, 0x7a5a98, 0xa88ac0] }
    : kind === 'yarrow' ? { stem: [0x7a8a5a, 0x6a7a4a], head: [0xece6d2, 0xd8d2bc, 0xf4f0e0] }
    : { stem: [0x6a7a62, 0x5e6e56], head: [0x8a9a82, 0x7a8a72, 0x9aaa8e] };
  for (let k = 0; k < 13; k++) {
    const a = hash2(k, 1, seed) * 6.28, r = 1 + hash2(k, 2, seed) * 4, len = 9 + hash2(k, 3, seed) * 8;
    const ex = c + Math.cos(a) * r, ez = c + Math.sin(a) * r, ey = top - 4 - len;
    line(g, [[c, top - 3, c], [c + Math.cos(a) * r * 0.4, top - 8, c + Math.sin(a) * r * 0.4], [ex, ey, ez]], 0.5, pal.stem[k % 2]);
    if (kind === 'sage') {
      for (let j = 0; j < 4; j++) { const yy = ey + 2 + j * 3; g.ellipsoid(ex + (j % 2 ? 1 : -1), yy, ez, 1.3, 2, 1, pal.head[(k + j) % 3]); }
    } else if (kind === 'yarrow') {
      g.ellipsoid(ex, ey, ez, 2.2, 1.1, 2.2, (x, y, z) => pal.head[(x + z + k) % 3]);
    } else {
      for (let j = 0; j < 5; j++) g.set(ex + (j % 2), ey + j, ez, pal.head[(k + j) % 3]);
    }
  }
  for (let y = top - 4; y <= top - 2; y++) ring(g, c, c, 0, 1.8, y, y + 1, 0x9a8a5a); // the twine
  line(g, [[c, top - 2, c], [c, top, c]], 0.5, 0x9a8a5a);
  return M32(g, [c, Hh, c]);
}

// ---------------------------------------------------------------- the workbench
/**
 * Old Star's workbench (a floor piece, its back to the rock): a thick top of two old planks on
 * splayed legs with stretchers and a shelf under it (a crate of offcuts, a sack), a wooden vice at
 * one end, a tool rail along the back; on it, at 1/64 m, a hand plane among curls of shavings, a
 * mallet, chisels in a block, a jar of nails, a saw, a half-carved wooden mole, his spectacles, a
 * mug, a candle run down in long drips. Returns { obj, flame (local tiles), top (tiles), hw, hd (m), spot (books, local tiles) }.
 */
export function workbench(seed = 431, len = 0.96) {
  const L = Math.round(len * 32), D = 12, Hb = 14; // 1/32 m: 0.96 × 0.375 m, 0.44 m to the top
  const g = new VoxelGrid(L + 2, Hb + 10, D + 2);
  const wd = (x, y, z) => { let c = OAK[(Math.floor(hash2(x >> 2, z, seed) * 4) + (z >> 2)) % 4]; if ((x + z * 3) % 11 === 0) c = mulc(c, 0.85); return c; };
  // the top: two thick planks with a gap, dents and a scorch where a hot iron was set down
  g.box(1, Hb - 2, 1, L, 2, D, (x, y, z) => {
    if (z === Math.floor(D / 2)) return y === Hb - 1 ? 0x2a1c12 : wd(x, y, z);
    if (y === Hb - 1 && Math.hypot(x - L * 0.68, z - 4) < 2.2) return 0x2a2018; // the scorch
    if (y === Hb - 1 && h3(x, y, z, seed) < 0.06) return mixc(wd(x, y, z), 0xd8b880, 0.35); // pale knocks
    return wd(x, y, z);
  });
  // legs, a little splayed, stretchers and the shelf under it
  for (const [lx, lz] of [[2, 2], [L - 2, 2], [2, D - 1], [L - 2, D - 1]]) for (let y = 0; y < Hb - 2; y++) {
    const sp = y < 4 ? (lx < L / 2 ? -1 : 1) : 0;
    g.box(lx - 1 + sp, y, lz - 1, 2, 1, 2, (x, yy, z) => mulc(wd(x, yy, z), 0.9));
  }
  g.box(2, 3, 2, L - 2, 1, D - 2, (x, y, z) => mulc(wd(x, y, z), 0.82)); // the shelf
  // under it: a crate of offcuts and a sack of charcoal
  g.box(4, 4, 3, 9, 5, 7, (x, y, z) => (x === 4 || x === 12 || z === 3 || z === 9 ? (y === 6 ? 0x3e2618 : 0x7a5434) : y === 8 && (x + z) % 3 ? 0xa8784a : -1));
  g.ellipsoid(L - 8, 6, 7, 3.6, 3, 3, (x, y, z) => (y > 7 && (x + y) % 4 === 0 ? 0x7a6a4a : 0x8a7a58));
  // the vice at the left end: a jaw block, its iron screw and a tommy bar through it
  g.box(0, Hb - 5, D - 4, 2, 5, 4, (x, y, z) => mulc(wd(x, y, z), 1.1));
  g.box(-0, Hb - 4, D - 2, 1, 1, 3, IRON);
  g.set(0, Hb - 4, D + 1, IRONL); g.set(0, Hb - 3, D + 1, IRONL); g.set(0, Hb - 5, D + 1, IRONL);
  // the tool rail along the back, with a square and a bit of saw hanging off it
  g.box(1, Hb, 0, L, 3, 1, (x, y, z) => mulc(wd(x, y, z), 0.95));
  const body = M32(g, [L / 2 + 1, 0, D / 2 + 1], { scale: S16 });
  // ---- the clutter on top, at 1/64 m (the top's surface is at y0)
  const F = 2, W2 = (L + 2) * F, D2 = (D + 2) * F, y0 = Hb * F;
  const c = new VoxelGrid(W2, y0 + 30, D2), gl = new VoxelGrid(W2, y0 + 30, D2);
  // shavings: pale curls scattered over the left half
  for (let k = 0; k < 22; k++) {
    const x = 6 + hash2(k, 1, seed) * (W2 * 0.45), z = 4 + hash2(k, 2, seed) * (D2 - 8);
    for (let j = 0; j < 4; j++) c.set(x + Math.cos(j * 1.6 + k) * 1.2, y0 + (j === 2 ? 1 : 0), z + Math.sin(j * 1.6 + k) * 1.2, [0xe8c890, 0xd8b478, 0xf0d8a8][(k + j) % 3]);
  }
  // the hand plane: a wooden body, an iron blade and a knob
  c.box(14, y0, 9, 10, 3, 4, (x, y, z) => (y === y0 + 2 && x > 16 && x < 21 ? 0x7a5434 : 0x8a6040));
  c.box(17, y0 + 3, 10, 2, 3, 2, IRONL); c.box(21, y0 + 3, 10, 2, 2, 2, 0x5e3c24);
  // the mallet: a beech head on a handle, lying across
  c.box(30, y0, 6, 6, 4, 5, (x, y, z) => (y === y0 + 3 ? 0xc8a070 : 0xb8905e));
  line(c, [[33, y0 + 1.5, 11], [36, y0 + 1.5, 21]], 0.8, 0x8a6040);
  // chisels standing in a block, handles up
  c.box(40, y0, 4, 8, 5, 4, 0x6e4a2c);
  for (let k = 0; k < 4; k++) { const x = 41 + k * 2; c.box(x, y0 + 5, 5, 1, 6 + (k % 2) * 2, 2, [0x9a6a3a, 0x7a4a2a, 0xa87a48][k % 3]); c.set(x, y0 + 11 + (k % 2) * 2, 5, 0xc8a050); }
  // a jar of nails, a mug with a chip out of it, his spectacles folded on a book (the books' spot)
  jar(c, 52, y0, 8, 3, 7, 0x6a6a72, 0x7a5a3a, 0.7, seed);
  ring(c, 58, 18, 1.6, 3, y0, y0 + 6, (x, y, z) => (h3(x, y, z, seed) < 0.1 ? 0xe8dcc0 : 0x3a6a8a)); ring(c, 58, 18, 0, 1.6, y0, y0 + 1, 0x3a6a8a); c.set(61, y0 + 3, 18, 0x3a6a8a); c.set(62, y0 + 3, 18, 0x3a6a8a); c.set(61, y0 + 5, 18, 0x3a6a8a);
  c.box(Math.round(W2 * 0.72), y0, 14, 9, 3, 7, (x, y, z) => (y === y0 + 2 ? 0x7a2a22 : x === Math.round(W2 * 0.72) ? 0x5a1a14 : 0xeadcbe));
  for (const dx of [1, 5]) c.box(Math.round(W2 * 0.72) + dx, y0 + 3, 16, 3, 1, 2, 0x8a7a5a);
  c.box(Math.round(W2 * 0.72) + 4, y0 + 3, 16, 1, 1, 1, 0xc8a050);
  // the half-carved wooden mole on its stand, a heap of chips round it
  const mx = 26, mz = 20;
  c.box(mx - 2, y0, mz - 2, 5, 1, 5, 0x7a5434);
  c.ellipsoid(mx, y0 + 5, mz, 2.6, 4, 2.4, (x, y, z) => (y > y0 + 6 ? 0xd8b478 : 0xc8a068)); // the body
  c.ellipsoid(mx, y0 + 9.5, mz + 1, 2, 2, 2.2, 0xd8b478); c.set(mx, y0 + 9, mz + 3, 0xe8a0a0); // the head, a dab of pink paint on the nose
  for (let k = 0; k < 8; k++) c.set(mx - 4 + hash2(k, 5, seed) * 8, y0, mz - 3 + hash2(k, 6, seed) * 6, 0xe8c890);
  // a saw lying along the front edge
  c.box(8, y0, D2 - 5, 20, 1, 3, (x, y, z) => (z === D2 - 3 && x % 2 ? -1 : 0x9a9aa2));
  c.box(4, y0, D2 - 6, 5, 2, 4, 0x7a4a2a);
  // the candle on a tin saucer at the right-hand end, run down in long drips
  ring(c, W2 - 9, 7, 0, 3.4, y0, y0 + 1, 0x8a8a92); c.set(W2 - 5, y0 + 1, 7, 0x8a8a92); c.set(W2 - 5, y0 + 2, 7, 0x8a8a92);
  const fl = dripCandle(c, gl, W2 - 10, y0 + 1, 6, 9, seed);
  const clutter = group(M32(c, [W2 / 2, 0, D2 / 2]), G32(gl, [W2 / 2, 0, D2 / 2]));
  return {
    obj: group(body, clutter),
    flame: { x: T(fl.x - W2 / 2), y: T(fl.y), z: T(fl.z - D2 / 2) },
    top: T2(Hb), hw: (L + 2) / 64, hd: (D + 2) / 64,
    spot: { x: T(Math.round(W2 * 0.72) + 4 - W2 / 2), y: T(y0 + 3), z: T(17 - D2 / 2) },
  };
}

// ---------------------------------------------------------------- wall pieces
/**
 * A shelf of jars by the forge (wall piece, 1/64 m): a thick plank on forged brackets, jars of
 * pickled mushrooms, honey, buttons and rivets, a tin of flux, a candle that's run down, and his
 * tongs and a file hanging from nails under it. len m. Returns { obj, flame (local tiles) }.
 */
export function jarShelf(len = 0.58, seed = 441) {
  const L = Math.round(len * 64), Hh = 40, D = 12;
  const g = new VoxelGrid(L, Hh, D), gl = new VoxelGrid(L, Hh, D);
  const sy = 18;
  g.box(0, sy, 0, L, 3, D, (x, y, z) => { let c = OAK[(Math.floor(hash2(x >> 3, z, seed) * 4)) % 4]; if (y === sy + 2 && (x + z) % 13 === 0) c = mulc(c, 0.8); if (z === D - 1 && y === sy) c = mulc(c, 0.7); return c; });
  for (const bx of [4, L - 6]) { line(g, [[bx, sy - 1, 1], [bx, sy - 8, 1], [bx, sy - 1, 9]], 0.7, IRON); g.set(bx, sy - 8, 0, IRONL); }
  // the jars and tins along it
  const goods = [[0x6a5a2a, 0x8a6a3a, 0.7], [0xc8901e, 0xd8ccb0, 0.85], [0xb8b0a0, 0x7a2a22, 0.6], [0x5a7a3a, 0x8a6a3a, 0.75], [0x8a5a8a, 0x3a3a42, 0.55]];
  let x = 4;
  for (let k = 0; x < L - 10; k++) {
    if (k === 2) { g.box(x, sy + 3, 3, 7, 4, 6, (xx, yy, zz) => (yy === sy + 6 ? 0x9a9aa2 : (xx + zz) % 4 === 0 ? 0xa83a2a : 0x7a7a82)); x += 9; continue; } // a tin of flux
    const [c, top, fill] = goods[k % goods.length];
    const r = 2.6 + (k % 2) * 0.8, h = 8 + ((k * 3) % 4);
    jar(g, x + r, sy + 3, 6, r, h, c, top, fill, seed + k);
    x += r * 2 + 2;
  }
  const fl = dripCandle(g, gl, L - 7, sy + 3, 5, 6, seed + 1);
  // tongs and a file hanging from nails under it
  g.set(10, sy - 1, 1, IRONL); line(g, [[10, sy - 2, 2], [9, sy - 15, 2]], 0.6, IRON); line(g, [[10, sy - 2, 2], [12, sy - 15, 2]], 0.6, IRON);
  g.set(20, sy - 1, 1, IRONL); g.box(19, sy - 13, 2, 2, 11, 1, (xx, yy) => (yy % 2 ? 0x6a6a72 : 0x55555f)); g.box(19, sy - 16, 2, 2, 3, 1, 0x7a4a2a);
  return { obj: group(M32(g, [L / 2, 0, 0]), G32(gl, [L / 2, 0, 0])), flame: { x: T(fl.x - L / 2), y: T(fl.y), z: T(fl.z) } };
}

/** The painting itself: Old Star young, Marigold, and the two little ones, in oils gone dark (u, v in 0..1, v up). */
function familyPaint(u, v, i, j) {
  const n = hash2(i, j, 17), n2 = hash2(i >> 1, j >> 1, 19);
  // the moles: [cx, cy (head), head r, body w, body top, coat, nose, star?, size]
  const M = [
    { x: 0.66, y: 0.66, r: 0.115, bw: 0.2, coat: 0x6a4a2a, apron: true, star: true }, // Old Star, young, in his apron
    { x: 0.36, y: 0.6, r: 0.105, bw: 0.19, coat: 0x6a2a4a, lace: true }, // Marigold
    { x: 0.24, y: 0.32, r: 0.08, bw: 0.12, coat: 0xa83a2a, small: true }, // the little ones in front
    { x: 0.53, y: 0.3, r: 0.075, bw: 0.11, coat: 0x3a6a8a, small: true },
  ];
  let col = null, rim = false;
  for (let k = M.length - 1; k >= 0 && col === null; k--) {
    const m = M[k];
    const dx = (u - m.x) / 1.3, dy = v - m.y;
    const wob = (hash2(Math.floor(u * 40), Math.floor(v * 40), k) - 0.5) * 0.012;
    const head = Math.hypot(dx * 1.05, dy * 1.12) - m.r - wob;
    const by = m.y - m.r * 0.6;
    const body = v < by && Math.abs(u - m.x) < m.bw * (0.8 + (by - v) * 0.9) && v > (m.small ? 0.06 : 0.12);
    if (head < 0) {
      rim = head > -0.012;
      col = rim ? 0x2a2420 : (dx < -0.02 && dy > 0.02 ? 0x5e544e : 0x4a403a); // fur, lit from the left
      // eyes, the nose (a pink star for him), a smile
      if (Math.abs(Math.abs(dx) - m.r * 0.38) < 0.012 && Math.abs(dy - m.r * 0.2) < 0.016) col = 0x141012;
      if (Math.abs(dx + m.r * 0.38 + 0.004) < 0.006 && Math.abs(dy - m.r * 0.26) < 0.008) col = 0xf0f0e8;
      const nd = Math.hypot(dx, (dy + m.r * 0.25) * 1.2);
      if (nd < m.r * 0.22) col = nd < m.r * 0.12 ? 0xf0a0b0 : 0xd87890;
      if (m.star && nd < m.r * 0.42 && nd > m.r * 0.2 && (Math.floor((Math.atan2(dy + m.r * 0.25, dx) + 3.2) * 3.2) % 2 === 0)) col = 0xe88aa0;
      if (Math.abs(dy + m.r * 0.6) < 0.008 && Math.abs(dx) < m.r * 0.25) col = 0x2a1a1a;
    } else if (body) {
      col = m.coat;
      if (m.apron && Math.abs(u - m.x) < m.bw * 0.45 && v < by - 0.03) col = 0x8a5a32;
      if (m.lace && v > by - 0.05) col = (i + j) % 2 ? 0xf0ece0 : 0xd8d0c0;
      if (v > by - 0.012 || Math.abs(Math.abs(u - m.x) - m.bw * (0.8 + (by - v) * 0.9)) < 0.012) col = mulc(col, 0.6);
      if (Math.abs(Math.abs(u - m.x) - m.bw * 0.7) < 0.025 && Math.abs(v - (by - 0.12)) < 0.03) col = 0xe8a8a8; // paws
    }
  }
  if (col === null) {
    // the parlour behind them: a dark green wall, a red drape on the left, the floor
    if (v < 0.1) col = mixc(0x4a3424, 0x5e4430, n2);
    else if (u < 0.12 + Math.sin(v * 9) * 0.02) col = mixc(0x7a2a24, 0x9a3a2e, (Math.sin(u * 60 + v * 4) + 1) / 2);
    else col = mixc(0x2e3a2a, 0x46523a, v * 0.6 + n2 * 0.25 + (Math.hypot(u - 0.55, v - 0.75) < 0.3 ? 0.3 : 0));
  }
  // in oils: brush texture, and gone a little dark and yellow with the years (a crackle here and there)
  col = mulc(col, 0.92 + n * 0.12);
  if (hash2(i, j, 23) < 0.015) col = mulc(col, 0.6);
  return mixc(col, 0x8a6a2a, 0.12);
}

/**
 * The family portrait (wall piece): a carved oak frame (1/64 m) with a little brass plate, a dried
 * flower tucked in its corner, round a canvas painted at 1/128 m. w, h: the canvas (m). Returns { obj }.
 */
export function familyPortrait(seed = 451, w = 0.42, h = 0.32) {
  const W = Math.round(w * 64), Hh = Math.round(h * 64), F = 4;
  const g = new VoxelGrid(W + F * 2 + 4, Hh + F * 2 + 4, 5);
  for (let y = 0; y < Hh + F * 2; y++) for (let x = 0; x < W + F * 2; x++) {
    const e = Math.min(x, y, W + F * 2 - 1 - x, Hh + F * 2 - 1 - y);
    if (e >= F) continue;
    const corner = (x < F + 2 || x > W + F - 3) && (y < F + 2 || y > Hh + F - 3);
    let c = e === 0 ? 0x2e1c10 : e === F - 1 ? 0x3e2618 : (x + y) % 5 === 0 ? 0x8a6040 : 0x6e4a2c;
    if (corner && (x + y) % 2) c = 0xa87a48; // carved rosettes in the corners
    g.box(x + 2, y + 2, 0, 1, 1, e === 1 || e === 2 || corner ? 4 : 3, c);
  }
  // the brass plate on the bottom rail, a dried flower tucked behind the top left corner
  g.box(2 + F + Math.round(W / 2) - 5, 2 + 1, 3, 10, 2, 1, 0xc8a050);
  for (let k = 0; k < 4; k++) g.set(2 + k, 2 + Hh + F * 2 - 3 + k, 4, 0x6a7a4a);
  for (const [dx, dy, c] of [[0, 2, 0xc89ab8], [1, 3, 0xd8b0c8], [-1, 3, 0xb888a8], [0, 4, 0xe8c050]]) g.set(5 + dx, 2 + Hh + F * 2 + dy - 1, 4, c);
  // the nail and its string over the top
  line(g, [[2 + F, 2 + Hh + F * 2 - 1, 1], [2 + F + W / 2, 2 + Hh + F * 2 + 2, 1], [2 + W + F, 2 + Hh + F * 2 - 1, 1]], 0.5, 0x8a7a5a);
  const frame = M32(g, [(W + F * 2 + 4) / 2, 0, 0]);
  // the canvas at 1/128 m, a voxel proud of the frame's back
  const cw = W * 2, ch = Hh * 2;
  const cv = new VoxelGrid(cw, ch, 1);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) cv.set(i, j, 0, familyPaint((i + 0.5) / cw, (j + 0.5) / ch, i, j));
  const canvas = M32(cv, [cw / 2, -(2 + F) * 2, -2], { scale: S32 / 2 });
  return { obj: group(frame, canvas) };
}

// ---------------------------------------------------------------- the damp corner
/**
 * His mushroom garden in the damp corner (floor piece, 1/64 m): a planter box of old boards, black
 * loam with a mulch of chips, glowing blue caps, brown buttons and a red toadstool with white spots,
 * oyster shelves on the box's side, a little watering can and a label stake. Returns { obj, glows: [local tiles] }.
 */
export function mushroomGarden(seed = 461) {
  const W = 24, D = 20, Hb = 7;
  const g = new VoxelGrid(W + 12, 30, D + 4), gl = new VoxelGrid(W + 12, 30, D + 4);
  const ox = 8, oz = 2;
  // the box: planks with nails, one board split
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) for (let y = 0; y < Hb; y++) {
    const wall = x === 0 || x === W - 1 || z === 0 || z === D - 1;
    if (!wall) { if (y < Hb - 1) continue; g.set(x + ox, y, z + oz, h3(x, y, z, seed) < 0.2 ? 0x6a4a2a : h3(x >> 1, 1, z >> 1, seed) < 0.5 ? 0x2a2018 : 0x342a20); continue; }
    let c = (y >> 1) % 2 ? 0x7a5434 : 0x6e4a2c;
    if (y === 3 && (x === 0 || x === W - 1)) c = 0x3e2618;
    if ((x === 1 || x === W - 2) && (y === 1 || y === 5) && (z === 0 || z === D - 1)) c = IRONL;
    if (z === D - 1 && x > 8 && x < 13 && y === 4) c = 0x241a10; // the split
    g.set(x + ox, y, z + oz, c);
  }
  // the mushrooms: [x, z, height, cap r, kind]
  const glows = [];
  const shroom = (x, z, h, r, kind) => {
    const sx = x + ox, sz = z + oz;
    for (let y = Hb; y < Hb + h; y++) g.set(sx, y, sz, kind === 'glow' ? 0xc8e8e0 : 0xe8dcc0);
    if (h > 6) g.set(sx + 1, Hb + Math.floor(h / 2), sz, kind === 'glow' ? 0xc8e8e0 : 0xe8dcc0);
    for (let l = 0; l < 3; l++) {
      const rr = r * (1 - l * 0.32);
      for (let dz = -Math.ceil(rr); dz <= Math.ceil(rr); dz++) for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) {
        const d = Math.hypot(dx, dz);
        if (d > rr + (hash2(dx + 9, dz + 9, seed + l) - 0.5) * 0.6) continue;
        const y = Hb + h + l;
        if (kind === 'glow') gl.set(sx + dx, y, sz + dz, l === 2 ? 0xc8fff8 : d > rr - 1 ? 0x2aa8c0 : 0x5ad8e8);
        else if (kind === 'red') g.set(sx + dx, y, sz + dz, (dx * 3 + dz * 5 + l) % 7 === 0 ? 0xf4ecd8 : d > rr - 1 ? 0x8a1a14 : 0xc8302a);
        else g.set(sx + dx, y, sz + dz, l === 2 ? 0xa8805a : d > rr - 1 ? 0x6a4a2a : 0x8a6440);
      }
    }
    if (kind === 'glow') glows.push({ x: T(sx + 0.5 - (W + 12) / 2), y: T(Hb + h + 1), z: T(sz + 0.5 - (D + 4) / 2) });
  };
  [[5, 6, 9, 3.4, 'glow'], [9, 12, 6, 2.6, 'glow'], [4, 14, 4, 1.8, 'glow'], [15, 5, 7, 2.8, 'brown'], [19, 9, 4, 2, 'brown'], [17, 14, 3, 1.5, 'brown'], [12, 4, 3, 1.4, 'brown'], [13, 15, 10, 3.6, 'red'], [20, 15, 3, 1.4, 'glow']].forEach(([x, z, h, r, k]) => shroom(x, z, h, r, k));
  // oyster shelves on the box's right side
  for (const [y, z] of [[2, 6], [4, 9], [3, 13]]) for (let dz = -2; dz <= 2; dz++) for (let dx = 0; dx < 3 - Math.abs(dz) * 0.6; dx++) g.set(ox + W + dx, y, oz + z + dz, dx === 0 ? 0x9a8a7a : 0xb8aa96);
  // the watering can beside it (on its left), a label stake
  const wx = 3, wz = oz + 14;
  for (let y = 0; y < 7; y++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dz) < 4) g.set(wx + dx, y, wz + dz, y === 6 ? 0x5a6a62 : (y + dx) % 3 ? 0x6a7a72 : 0x7a8a82);
  line(g, [[wx, 2, wz - 2], [wx, 8, wz - 5]], 0.6, 0x6a7a72); line(g, [[wx, 6, wz + 2], [wx, 9, wz + 3], [wx, 9, wz - 1], [wx, 6, wz]], 0.5, 0x5a6a62);
  g.box(ox + 2, Hb, oz + 1, 1, 7, 1, 0x8a6a42); g.box(ox + 1, Hb + 5, oz + 1, 4, 3, 1, 0xeadcbe); g.set(ox + 2, Hb + 6, oz + 1, 0x3a2a22);
  return { obj: group(M32(g, [(W + 12) / 2, 0, (D + 4) / 2]), G32(gl, [(W + 12) / 2, 0, (D + 4) / 2])), glows };
}

/** A few candles that have run down on a flat stone or a ledge (1/64 m): n of them, in drips and puddles. Returns { obj, flames }. */
export function candleCluster(n = 3, seed = 471) {
  const g = new VoxelGrid(26, 28, 22), gl = new VoxelGrid(26, 28, 22);
  const flames = [];
  for (let k = 0; k < n; k++) {
    const x = 5 + ((k * 7 + seed) % 14), z = 5 + ((k * 5 + seed * 3) % 10), h = [12, 7, 4, 9][k % 4];
    const f = dripCandle(g, gl, x, 0, z, h, seed + k, k === 0 ? 3 : 2);
    flames.push({ x: T(f.x - 13), y: T(f.y), z: T(f.z - 11) });
  }
  return { obj: group(M32(g, [13, 0, 11]), G32(gl, [13, 0, 11])), flames };
}

/** A patchwork quilt colour for a bedroll's blanket (1/32 m voxels): squares of old cloth, stitched. */
export function quiltColor(x, z, seed = 1) {
  const PATCH = [0xa83a2a, 0xc89a3a, 0x6e7e54, 0x6a3a5a, 0xe0d0a8, 0x3a5a7a, 0x8a5a3a];
  const px = Math.floor(x / 5), pz = Math.floor(z / 5), lx = x % 5, lz = z % 5;
  if (lx === 0 || lz === 0) return 0x4a3a2a; // the stitching between the squares
  const k = Math.floor(hash2(px, pz, seed) * PATCH.length), c = PATCH[k];
  // each square its own cloth: a check, dots, a stripe or plain
  const kind = (px * 3 + pz * 7 + seed) % 4;
  if (kind === 0 && (lx + lz) % 2 === 0) return mulc(c, 0.8);
  if (kind === 1 && lx === 2 && lz === 2) return 0xf0e8d0;
  if (kind === 2 && lz === 2) return mixc(c, 0xf0e8d0, 0.4);
  return c;
}

// Trees for the forest trail, all voxels, all built from a branch skeleton:
//   makeBroadleaf(seed, opts)  oaks, beeches, maples and birches: a curving trunk that forks into
//                              limbs, lumpy leaf clumps at the limb ends (lit warm on the sun side,
//                              deep blue-green underneath, ragged at the rim), moss on the shady side.
//   kind 'giant'               the ancient ones: a massive fluted trunk, buttress roots snaking over
//                              the ground, a hollow at the foot, a coat of moss, ivy climbing,
//                              shelf fungi, huge low limbs and a crown like a cloud.
//   makeConifer(seed, opts)    spruces (skirts to the ground) and pines (a tall bare trunk).
//   makeSnag(seed, opts)       a dead tree: broken top, bare branches, woodpecker holes, fungi.
// Each returns { wood, leaves, height, radius } geometries (metres, origin at the trunk's foot), so
// the forest can instance every variant; build them at a few voxel sizes for levels of detail.
import * as THREE from 'three';
import { VoxelGrid, meshVoxGreedy, hash3, fmix } from '../vox.js';
import { makeRng, makeNoise2D, clamp } from '../../core/util.js';

const SUN = new THREE.Vector3(-0.36, 0.44, -0.82).normalize();

export const BARK = {
  oak: [0x7a6650, 0x6a5642, 0x5a4836, 0x46382a, 0x30261c],
  giant: [0x6e6252, 0x5e5244, 0x4e4438, 0x3c342a, 0x28221c],
  beech: [0xa8a496, 0x969284, 0x847f72, 0x6e6a5e, 0x56524a],
  maple: [0x8a7058, 0x7a6048, 0x6a523c, 0x564230, 0x3e3024],
  birch: [0xf0ece0, 0xdcd8cc, 0xc4c0b2, 0x48443c, 0x2a2622],
  dead: [0x9a8a78, 0x857664, 0x6e6052, 0x544a3e, 0x3a322a],
};
export const LEAF = {
  oak: [0xb4c464, 0x8eac4a, 0x66903c, 0x456c30, 0x2c4c28],
  giant: [0xaec05c, 0x86a646, 0x5f8a3a, 0x40682e, 0x264624],
  beech: [0xc4cc6a, 0x9cb44c, 0x74983e, 0x507834, 0x34562a],
  maple: [0xf4b44c, 0xe08a32, 0xc06428, 0x8e4422, 0x5a2c1c],
  gold: [0xf0dc6a, 0xd8b844, 0xb09434, 0x7a6c2c, 0x4e4a24],
  birch: [0xd0dc74, 0xa8c454, 0x80a444, 0x5c8236, 0x3c602a],
};
const MOSS = [0x7a9a40, 0x648a36, 0x50762e, 0x3e6228];
const IVY = [0x3a6a2e, 0x2e5a28, 0x4a7a34, 0x24481e];
const FUNGUS = [0xe8c890, 0xd0a868, 0xb08850, 0xf4e0b0];

// ------------------------------------------------------------------ skeleton helpers
/** Fill a capsule (a→b, radius r0→r1, voxel units) calling col(x, y, z, t, dist) for its colour. */
function capsule(g, a, b, r0, r1, col) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz) || 1;
  const rm = Math.max(r0, r1);
  const x0 = Math.floor(Math.min(a[0], b[0]) - rm - 1), x1 = Math.ceil(Math.max(a[0], b[0]) + rm + 1);
  const y0 = Math.floor(Math.min(a[1], b[1]) - rm - 1), y1 = Math.ceil(Math.max(a[1], b[1]) + rm + 1);
  const z0 = Math.floor(Math.min(a[2], b[2]) - rm - 1), z1 = Math.ceil(Math.max(a[2], b[2]) + rm + 1);
  const ux = dx / L, uy = dy / L, uz = dz / L;
  for (let z = Math.max(0, z0); z <= Math.min(g.d - 1, z1); z++) for (let y = Math.max(0, y0); y <= Math.min(g.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(g.w - 1, x1); x++) {
    const px = x + 0.5 - a[0], py = y + 0.5 - a[1], pz = z + 0.5 - a[2];
    let t = (px * ux + py * uy + pz * uz) / L;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = px - ux * t * L, qy = py - uy * t * L, qz = pz - uz * t * L;
    const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
    const r = r0 + (r1 - r0) * t;
    if (d <= r) {
      const c = col(x, y, z, t, d / Math.max(0.5, r), qx, qy, qz);
      if (c !== -1 && c !== undefined) g.set(x, y, z, c);
    }
  }
}

/** A gently wandering path of n segments from p along dir (metres), returns points. */
function wander(rng, p, dir, len, n, wob) {
  const pts = [p.slice()];
  const d = dir.slice();
  for (let i = 0; i < n; i++) {
    d[0] += rng.range(-wob, wob); d[1] += rng.range(-wob, wob) * 0.5; d[2] += rng.range(-wob, wob);
    const l = Math.hypot(d[0], d[1], d[2]);
    d[0] /= l; d[1] /= l; d[2] /= l;
    const q = pts[pts.length - 1];
    pts.push([q[0] + d[0] * len / n, q[1] + d[1] * len / n, q[2] + d[2] * len / n]);
  }
  return pts;
}

// ------------------------------------------------------------------ broadleaf
/**
 * A broadleaf tree. opts: kind ('oak' | 'beech' | 'maple' | 'birch' | 'giant'), height (m),
 * crownR (m), trunkR (m), k (wood voxels per metre), kl (leaf voxels per metre), leaf (a LEAF
 * palette override), lod (true: skip the small details for far copies).
 */
export function makeBroadleaf(seed, opts = {}) {
  const kind = opts.kind || 'oak';
  const giant = kind === 'giant';
  const rng = makeRng(seed);
  const nz = makeNoise2D(seed * 3 + 1);
  const H = opts.height ?? (giant ? 17 : kind === 'birch' ? 12 : 13);
  const CR = opts.crownR ?? (giant ? 7.5 : kind === 'birch' ? 2.6 : 4.2);
  const TR = opts.trunkR ?? (giant ? 1.05 : kind === 'birch' ? 0.2 : kind === 'beech' ? 0.36 : 0.42);
  const k = opts.k ?? 8, kl = opts.kl ?? 5;
  const lod = !!opts.lod;
  const bark = opts.bark || BARK[kind] || BARK.oak;
  const leafPal = opts.leaf || LEAF[kind] || LEAF.oak;

  // ---- the skeleton (metres): segments {a, b, r0, r1, depth}
  const segs = [];
  const clumps = []; // {c: [x,y,z], r}
  const lean = [rng.range(-0.06, 0.06), 1, rng.range(-0.06, 0.06)];
  const trunkTop = H * (giant ? 0.42 : kind === 'birch' ? 0.82 : 0.55);
  const trunk = wander(rng, [0, 0, 0], lean, trunkTop, giant ? 6 : 5, giant ? 0.12 : kind === 'birch' ? 0.05 : 0.08);
  for (let i = 0; i < trunk.length - 1; i++) {
    const t0 = i / (trunk.length - 1), t1 = (i + 1) / (trunk.length - 1);
    segs.push({ a: trunk[i], b: trunk[i + 1], r0: TR * (1 - t0 * 0.35), r1: TR * (1 - t1 * 0.35), depth: 0 });
  }
  const top = trunk[trunk.length - 1];
  // limbs: from the upper trunk, up and out, forking once or twice
  const nL = giant ? 7 : kind === 'birch' ? 5 : rng.int(4, 6);
  const ph = rng.range(0, Math.PI * 2);
  const limb = (p, dir, len, r, depth) => {
    const pts = wander(rng, p, dir, len, 3, 0.18);
    for (let i = 0; i < pts.length - 1; i++) {
      const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1);
      segs.push({ a: pts[i], b: pts[i + 1], r0: r * (1 - t0 * 0.55), r1: r * (1 - t1 * 0.55), depth });
    }
    const end = pts[pts.length - 1];
    if (depth < 2 && len > CR * 0.35) {
      const nf = depth === 0 ? 2 : rng.int(1, 2);
      for (let f = 0; f < nf; f++) {
        const az = Math.atan2(dir[2], dir[0]) + (f ? 1 : -1) * rng.range(0.35, 0.8);
        const el = Math.asin(clamp(dir[1], -1, 1)) + rng.range(0.05, 0.35);
        limb(pts[2], [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)], len * rng.range(0.5, 0.7), r * 0.5, depth + 1);
      }
    }
    // leaves at the tips (and a smaller one along the way)
    const cr = CR * (giant ? 0.42 : kind === 'birch' ? 0.62 : 0.5) * rng.range(0.8, 1.15) * (depth === 0 ? 1 : 0.85);
    clumps.push({ c: end, r: cr });
    if (depth > 0 && !giant) clumps.push({ c: pts[2], r: cr * 0.7 });
  };
  for (let i = 0; i < nL; i++) {
    const az = ph + (i / nL) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const el = giant ? rng.range(0.2, 0.55) : kind === 'birch' ? rng.range(0.7, 1.1) : rng.range(0.45, 0.85);
    const at = giant ? rng.range(0.55, 1) : rng.range(0.6, 1);
    const ti = Math.min(trunk.length - 1, Math.max(1, Math.round(at * (trunk.length - 1))));
    const p = trunk[ti];
    const len = CR * (giant ? rng.range(0.75, 0.95) : rng.range(0.6, 0.85));
    limb(p, [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)], len, TR * (giant ? rng.range(0.42, 0.55) : 0.5), 0);
  }
  // the leader: the trunk carries on up into the middle of the crown
  {
    const pts = wander(rng, top, [lean[0], 1, lean[2]], H - trunkTop - CR * 0.45, 3, 0.15);
    for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1], r0: TR * 0.6 * (1 - i * 0.25), r1: TR * 0.6 * (1 - (i + 1) * 0.25), depth: 1 });
    clumps.push({ c: pts[pts.length - 1], r: CR * (kind === 'birch' ? 0.62 : 0.55) });
    clumps.push({ c: pts[1], r: CR * 0.5 });
  }
  // giants: buttress roots snaking out over the ground (and under it)
  if (giant || opts.roots) {
    const nR = giant ? 7 : 4;
    for (let i = 0; i < nR; i++) {
      const az = ph + 0.4 + (i / nR) * Math.PI * 2 + rng.range(-0.25, 0.25);
      const reach = (giant ? rng.range(2.6, 4.4) : rng.range(0.9, 1.4));
      const pts = [];
      const n = 7;
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        const r = TR * 0.7 + reach * t;
        const wob = nz(i * 3.1, t * 2.2) * 0.5 * t;
        // up the trunk at the start, then down over the ground and under it
        const y = (1 - t) ** 2 * TR * 1.6 - t * t * 0.35;
        pts.push([Math.cos(az + wob) * r, y, Math.sin(az + wob) * r]);
      }
      for (let s = 0; s < n; s++) {
        const t0 = s / n, t1 = (s + 1) / n;
        segs.push({ a: pts[s], b: pts[s + 1], r0: TR * (giant ? 0.55 : 0.4) * (1 - t0 * 0.8) + 0.05, r1: TR * (giant ? 0.55 : 0.4) * (1 - t1 * 0.8) + 0.05, depth: -1 });
      }
    }
  }

  // ---- bounds
  let bx = 0.5, by0 = -0.6, by1 = 1;
  for (const s of segs) for (const p of [s.a, s.b]) { bx = Math.max(bx, Math.abs(p[0]) + s.r0 + 0.3, Math.abs(p[2]) + s.r0 + 0.3); by1 = Math.max(by1, p[1] + s.r0 + 0.3); }
  let lx = 0.5, ly1 = 1, ly0 = H;
  for (const c of clumps) { lx = Math.max(lx, Math.abs(c.c[0]) + c.r * 1.25 + 0.3, Math.abs(c.c[2]) + c.r * 1.25 + 0.3); ly1 = Math.max(ly1, c.c[1] + c.r + 0.4); ly0 = Math.min(ly0, c.c[1] - c.r - 0.4); }

  // ---- wood
  const W = Math.ceil(bx * 2 * k) + 2, Hh = Math.ceil((by1 - by0) * k) + 2;
  const wood = new VoxelGrid(W, Hh, W);
  const ox = W / 2, oy = -by0 * k, oz = W / 2;
  const V = (p) => [ox + p[0] * k, oy + p[1] * k, oz + p[2] * k];
  const grooves = giant ? 14 : kind === 'beech' ? 0 : 9;
  for (const s of segs) {
    const isRoot = s.depth < 0;
    capsule(wood, V(s.a), V(s.b), s.r0 * k, s.r1 * k, (x, y, z, t, e, qx, qy, qz) => {
      const wy = (y - oy) / k;
      const a = Math.atan2(qz, qx);
      const sx = Math.cos(a), sz = Math.sin(a);
      const shady = sx * 0.36 + sz * 0.82; // away from the sun (+x, +z)
      const upward = qy / Math.max(0.5, Math.hypot(qx, qy, qz));
      let col;
      // fluted, grooved bark (birch: white with black marks; beech: smooth grey with lichen)
      const u = (a / (Math.PI * 2) + 0.5) * Math.max(1, grooves) + nz(wy * 0.6, a) * 0.8;
      const groove = grooves > 0 && Math.abs(u - Math.round(u)) < 0.14;
      const lit = -shady;
      col = groove ? bark[4] : lit > 0.4 ? bark[0] : lit > -0.15 ? bark[1] : bark[2];
      if (!groove && hash3(x, y >> 1, z, seed) < 0.08) col = bark[3];
      if (kind === 'birch') {
        col = lit > 0.2 ? bark[0] : lit > -0.3 ? bark[1] : bark[2];
        if (hash3(x >> 1, y >> 1, z >> 1, seed + 2) < 0.1 || (y % 7 === 0 && hash3(x, y, z, seed + 3) < 0.6)) col = bark[3 + (hash3(x, y, z, 1) < 0.5 ? 0 : 1)];
      } else if (kind === 'beech') {
        if (hash3(x >> 1, y >> 2, z >> 1, seed + 4) < 0.06) col = fmix(col, 0x9ab878, 0.5); // lichen
      }
      // moss: on the shady side low down, on the tops of roots and big limbs
      if (!lod) {
        const mossLow = giant ? 4.5 : kind === 'birch' ? 0 : 1.6;
        const m1 = shady > 0.05 && wy < mossLow * (0.6 + 0.4 * nz(a * 2, wy * 0.4 + 3)) && hash3(x >> 1, y >> 1, z >> 1, seed + 5) < 0.85;
        const m2 = (isRoot || s.depth === 0) && upward > 0.45 && hash3(x >> 1, y, z >> 1, seed + 6) < (giant ? 0.85 : 0.5);
        if (m1 || m2) col = MOSS[(hash3(x, y, z, seed + 7) * 4) | 0];
      }
      return col;
    });
  }
  if (giant && !lod) {
    // the hollow at the foot: a dark cave into the trunk on the side toward the trail (+z)
    const hx = ox + 0.1 * k, hz = oz + TR * k * 0.7, hy = oy;
    for (let y = 0; y < Math.round(1.25 * k); y++) for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - hx) / (0.42 * k), dy = (y + 0.5 - hy) / (1.15 * k), dz = (z + 0.5 - hz) / (0.9 * k);
      if (dx * dx + dy * dy + dz * dz < 1 && y + 0.5 > hy) {
        if (wood.filled(x, y, z)) wood.set(x, y, z, dx * dx + dy * dy + dz * dz > 0.7 ? 0x3a2a1e : -1);
      }
    }
    // the hollow's inside: dark
    wood.paint((x, y, z, c) => {
      const dx = (x + 0.5 - hx) / (0.5 * k), dy = (y + 0.5 - hy) / (1.25 * k), dz = (z + 0.5 - hz) / (1.0 * k);
      return dx * dx + dy * dy + dz * dz < 1 ? 0x22180f : undefined;
    });
    // ivy climbing the trunk: two wandering vines with leaves
    for (let v = 0; v < 3; v++) {
      let a = rng.range(0, Math.PI * 2);
      for (let y = 0; y < trunkTop * k * 0.95; y += 0.5) {
        a += nz(v * 7.3, y * 0.05) * 0.06;
        const t = y / (trunkTop * k);
        const r = (TR * (1 - t * 0.35)) * k + 0.6;
        const tp = trunk[Math.min(trunk.length - 1, Math.floor(t * (trunk.length - 1)))];
        const x = ox + tp[0] * k + Math.cos(a) * r, z = oz + tp[2] * k + Math.sin(a) * r;
        wood.set(x, oy + y, z, IVY[1]);
        if (hash3(Math.round(x), Math.round(y), Math.round(z), seed + 11) < 0.35) {
          const lx2 = x + Math.cos(a) * 1.2, lz2 = z + Math.sin(a) * 1.2;
          for (const [ddx, ddy, ddz] of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0]]) wood.set(lx2 + ddx, oy + y + ddy, lz2 + ddz, IVY[(hash3(Math.round(lx2 + ddx), Math.round(y + ddy), 0, v) * 4) | 0]);
        }
      }
    }
  }
  if (!lod && kind !== 'birch') {
    // shelf fungi on the shady side of the trunk
    const nF = giant ? 6 : rng.int(0, 2);
    for (let i = 0; i < nF; i++) {
      const y = rng.range(0.4, Math.min(trunkTop, 3.5));
      const a = rng.range(0.3, 1.6); // shady side
      const t = y / trunkTop;
      const tp = trunk[Math.min(trunk.length - 1, Math.floor(t * (trunk.length - 1)))];
      const r = TR * (1 - t * 0.35);
      const cx = ox + (tp[0] + Math.cos(a) * r) * k, cz = oz + (tp[2] + Math.sin(a) * r) * k, cy = oy + y * k;
      const R = (giant ? rng.range(0.22, 0.38) : 0.16) * k;
      for (let tier = 0; tier < (giant ? 2 : 1); tier++) {
        const yy = cy - tier * R * 0.9;
        for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
          const ddx = dx * Math.cos(a) - dz * Math.sin(a);
          if (Math.hypot(dx, dz) > R || ddx < -1) continue;
          const e = Math.hypot(dx, dz) / R;
          wood.set(cx + dx, yy, cz + dz, e > 0.75 ? FUNGUS[3] : FUNGUS[(hash3(dx, tier, dz, i) * 3) | 0]);
          if (e < 0.6) wood.set(cx + dx, yy - 1, cz + dz, FUNGUS[2]);
        }
      }
    }
  }

  // ---- leaves
  const LW = Math.ceil(lx * 2 * kl) + 2, LH = Math.ceil((ly1 - Math.min(0, ly0)) * kl) + 2;
  const leaves = new VoxelGrid(LW, LH, LW);
  const lox = LW / 2, loy = -Math.min(0, ly0) * kl, loz = LW / 2;
  const n3 = (x, y, z) => nz(x * 0.31 + z * 0.17, y * 0.29 - z * 0.23);
  for (const cl of clumps) {
    const cx = lox + cl.c[0] * kl, cy = loy + cl.c[1] * kl, cz = loz + cl.c[2] * kl;
    const rx = cl.r * kl * 1.18, ry = cl.r * kl * (kind === 'birch' ? 1.05 : 0.78), rz = cl.r * kl * 1.18;
    for (let z = Math.floor(cz - rz * 1.3); z <= Math.ceil(cz + rz * 1.3); z++) for (let y = Math.floor(cy - ry * 1.3); y <= Math.ceil(cy + ry * 1.3); y++) for (let x = Math.floor(cx - rx * 1.3); x <= Math.ceil(cx + rx * 1.3); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // lumpy: noise on the radius; flatter underneath
      const lump = 1 + n3(x, y, z) * 0.5 + (dy < 0 ? dy * 0.25 : 0);
      if (d > lump) continue;
      if (d > lump - 0.1 && hash3(x >> 1, y >> 1, z >> 1, seed + 21) < 0.14) continue; // ragged rim (in 2x2 bites: holes cost faces)
      // colour: by the clump's surface normal against the sun and the sky
      const nl = (dx * -SUN.x + dy * -SUN.y + dz * -SUN.z) / Math.max(0.2, d); // 1 = facing away from the sun?
      const sunward = -nl;
      const up = dy / Math.max(0.2, d);
      const outer = d / lump;
      let li = sunward * 0.6 + up * 0.5 + (outer - 0.7) * 1.2;
      li += (hash3(Math.floor(x / 3), Math.floor(y / 3), Math.floor(z / 3), seed + 22) - 0.5) * 0.4; // patches, so faces merge
      let col = li > 0.75 ? leafPal[0] : li > 0.3 ? leafPal[1] : li > -0.15 ? leafPal[2] : li > -0.6 ? leafPal[3] : leafPal[4];
      if (hash3(x >> 1, y >> 1, z >> 1, seed + 23) < 0.02 && li > 0.4) col = fmix(col, 0xfff0a0, 0.3); // sunlit flecks
      const prev = leaves.get(x, y, z);
      if (prev >= 0 && outer < 0.6) continue; // keep the first clump's surface
      leaves.set(x, y, z, col);
    }
  }
  const woodGeo = meshVoxGreedy(wood, { scale: 1 / k, pivot: [ox, oy, oz] });
  const leafGeo = meshVoxGreedy(leaves, { scale: 1 / kl, pivot: [lox, loy, loz] });
  return { wood: woodGeo, leaves: leafGeo, height: ly1, radius: lx, trunkR: TR, kind };
}

// ------------------------------------------------------------------ conifers
const NEEDLE = {
  spruce: [0x5e8a5a, 0x426e4a, 0x30583e, 0x22442e, 0x163222],
  pine: [0x7aa05a, 0x5a8648, 0x426c3e, 0x2e5432, 0x1e3a26],
};
/**
 * A conifer. kind 'spruce' (dense skirts nearly to the ground, blue-green) or 'pine' (tall bare
 * trunk, flat-topped tiers). height in metres, k voxels per metre.
 */
export function makeConifer(seed, { kind = 'spruce', height = 14, k = 6, spread = 2.4, lod = false } = {}) {
  const rng = makeRng(seed);
  const nz = makeNoise2D(seed * 7 + 1);
  const pal = NEEDLE[kind] || NEEDLE.spruce;
  const bark = kind === 'pine' ? [0x9a6a44, 0x86583a, 0x6e4630, 0x563626, 0x3e261a] : BARK.maple;
  const H = Math.round(height * k);
  const R = Math.round(spread * k);
  const W = 2 * R + 10;
  const c = W / 2;
  const wood = new VoxelGrid(W, H + 8, W), leaves = new VoxelGrid(W, H + 8, W);
  const lx = rng.range(-0.01, 0.01), lz = rng.range(-0.01, 0.01);
  const tr0 = (kind === 'pine' ? 0.32 : 0.36) * k;
  const cxAt = (y) => c + lx * y, czAt = (y) => c + lz * y;
  const crown0 = Math.round(Math.max(H * (kind === 'pine' ? 0.5 : 0.12), 2.4 * k));
  for (let y = 0; y < H - 2; y++) {
    const t = y / H;
    let r = tr0 * (1 - t * 0.85) + 0.6;
    if (y < 0.6 * k) r += ((0.6 * k - y) / (0.6 * k)) ** 2 * 0.3 * k;
    wood.cylinderY(cxAt(y), czAt(y), r, y, y + 1, (x, yy, z) => {
      const a = Math.atan2(z + 0.5 - czAt(yy), x + 0.5 - cxAt(yy));
      const u = (a / (Math.PI * 2) + 0.5) * Math.max(6, Math.round(r * 1.6)) + nz(yy * 0.05, 3) * 0.6;
      const groove = Math.abs(u - Math.round(u)) < 0.16;
      const lit = -Math.cos(a) * 0.36 - Math.sin(a) * 0.82;
      let col = groove ? bark[4] : lit > 0.35 ? bark[0] : lit > -0.2 ? bark[1] : bark[2];
      if (kind === 'pine' && yy > H * 0.35 && !groove) col = fmix(col, 0xc87848, 0.35); // the pine's orange upper bark
      if (!lod && yy < 1.4 * k && Math.sin(a) * 0.82 + Math.cos(a) * 0.36 > 0.15 && hash3(x >> 1, yy >> 1, z >> 1, seed + 4) < 0.7) col = MOSS[(x + yy + z) % 4];
      return col;
    });
  }
  // roots
  if (!lod) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const len = rng.range(0.8, 1.3) * k;
      for (let s = 0; s < len; s++) {
        const t = s / len, rr = (1 - t) * 0.14 * k + 0.6;
        wood.ellipsoid(c + Math.cos(a) * (tr0 + s), (1 - t) * 0.2 * k, c + Math.sin(a) * (tr0 + s), rr, rr, rr, (x, y) => (y > (1 - t) * 0.2 * k ? bark[1] : bark[2]));
      }
    }
    // dead twigs on the bare lower trunk
    for (let i = 0; i < (kind === 'pine' ? 8 : 3); i++) {
      const y = rng.range(H * 0.08, Math.max(H * 0.1, crown0 - 0.3 * k));
      const a = rng.range(0, Math.PI * 2), len = rng.range(0.3, 0.9) * k;
      for (let s = 0; s < len; s++) wood.set(cxAt(y) + Math.cos(a) * (tr0 * 0.7 + s), y - s * 0.3, czAt(y) + Math.sin(a) * (tr0 * 0.7 + s), bark[3]);
    }
  }
  // tiers of drooping needle skirts
  const tierH = (kind === 'pine' ? 0.95 : 0.62) * k;
  const nT = Math.max(3, Math.floor((H - crown0) / tierH));
  for (let ti = 0; ti < nT; ti++) {
    const ty = crown0 + ti * tierH + rng.range(-0.1, 0.1) * k;
    const tt = (ty - crown0) / (H - crown0);
    const shape = kind === 'pine' ? Math.pow(1 - tt, 0.6) * (0.7 + 0.3 * Math.sin(tt * 3.1)) : Math.pow(1 - tt, 0.95);
    const tr = R * shape * (0.82 + rng.range(0, 0.18)) + 0.22 * k;
    const droop = (kind === 'pine' ? 0.4 : 0.6) * k * (0.6 + 0.4 * (1 - tt));
    const thick = Math.max(2, 0.3 * k * (1 - tt * 0.5));
    const phs = rng.range(0, 6.28);
    const cx = cxAt(ty), cz = czAt(ty);
    for (let b = 0; b < 5; b++) {
      const a = phs + b * 1.26;
      for (let s = tr0 * 0.5; s < tr * 0.75; s += 0.7) wood.set(cx + Math.cos(a) * s, ty - (s / tr) ** 2 * droop - 1, cz + Math.sin(a) * s, bark[2]);
    }
    const lo = Math.floor(-tr - 1), hi = Math.ceil(tr + 1);
    for (let dz = lo; dz <= hi; dz++) for (let dx = lo; dx <= hi; dx++) {
      const d = Math.hypot(dx + 0.5, dz + 0.5);
      const a = Math.atan2(dz + 0.5, dx + 0.5);
      const rim = tr * (0.84 + 0.16 * Math.sin(a * 7 + phs) + 0.08 * Math.sin(a * 13 + phs * 2));
      if (d > rim) continue;
      const e = d / rim;
      const topY = ty - e * e * droop;
      const th = thick * (1 - e * 0.6) + 1;
      for (let s = 0; s < th; s++) {
        const y = Math.round(topY - s);
        const x = Math.round(cx + dx), z = Math.round(cz + dz);
        if (e > 0.76 && hash3(x, y, z, seed + 1) < 0.26) continue;
        const under = s >= th - 1.5;
        const lit = -Math.cos(a) * 0.36 - Math.sin(a) * 0.82 + (1 - e) * 0.15;
        let col = under ? pal[4] : s === 0 ? (lit > 0.35 ? pal[0] : lit > -0.05 ? pal[1] : pal[2]) : pal[3];
        if (s === 0 && e > 0.8 && hash3(x, y, z, seed + 2) < 0.3) col = fmix(col, 0xb0c878, 0.3); // fresh tips
        if (!lod && s === 0 && e > 0.5 && hash3(x, y, z, seed + 9) < 0.008) col = 0x8a5a32; // a cone
        leaves.set(x, y, z, col);
      }
    }
  }
  const tx = cxAt(H), tz = czAt(H);
  for (let y = H - 3; y < H + 5; y++) leaves.set(tx, y, tz, y > H + 2 ? pal[0] : pal[1]);
  const s = 1 / k;
  const opts = { scale: s, pivot: [c, 0, c] };
  return { wood: meshVoxGreedy(wood, opts), leaves: meshVoxGreedy(leaves, opts), height: (H + 5) / k, radius: R / k, kind };
}

// ------------------------------------------------------------------ a dead snag
/** A dead tree: a broken trunk, a few bare limbs, woodpecker holes and bracket fungi. */
export function makeSnag(seed, { height = 7, k = 8 } = {}) {
  const rng = makeRng(seed);
  const bark = BARK.dead;
  const TR = 0.38;
  const segs = [];
  const trunk = wander(rng, [0, 0, 0], [0.05, 1, -0.03], height, 5, 0.06);
  for (let i = 0; i < trunk.length - 1; i++) segs.push({ a: trunk[i], b: trunk[i + 1], r0: TR * (1 - i * 0.1), r1: TR * (1 - (i + 1) * 0.1) });
  for (let i = 0; i < 4; i++) {
    const p = trunk[rng.int(2, trunk.length - 2)];
    const az = rng.range(0, 6.28), el = rng.range(0.2, 0.8);
    const pts = wander(rng, p, [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)], rng.range(0.8, 1.8), 2, 0.3);
    for (let j = 0; j < pts.length - 1; j++) segs.push({ a: pts[j], b: pts[j + 1], r0: 0.09 * (1 - j * 0.4), r1: 0.09 * (1 - (j + 1) * 0.4) });
  }
  const W = Math.ceil(6 * k), Hh = Math.ceil((height + 1.5) * k);
  const g = new VoxelGrid(W, Hh, W);
  const ox = W / 2, oz = W / 2;
  const V = (p) => [ox + p[0] * k, p[1] * k, oz + p[2] * k];
  for (const s of segs) capsule(g, V(s.a), V(s.b), s.r0 * k, s.r1 * k, (x, y, z, t, e, qx, qy, qz) => {
    const a = Math.atan2(qz, qx);
    const lit = -Math.cos(a) * 0.36 - Math.sin(a) * 0.82;
    let col = lit > 0.3 ? bark[0] : lit > -0.2 ? bark[1] : bark[2];
    if (hash3(x, y >> 2, z, seed) < 0.12) col = bark[3];
    if (Math.abs(Math.sin(a * 7 + y * 0.05)) < 0.12) col = bark[4];
    return col;
  });
  // the broken top: jagged
  const topY = Math.round(height * k);
  for (let y = topY - 6; y < Hh; y++) for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) if (g.filled(x, y, z) && hash3(x, 0, z, seed + 3) * 8 < y - (topY - 6)) g.clear(x, y, z);
  // woodpecker holes and fungi
  for (let i = 0; i < 3; i++) {
    const y = Math.round(rng.range(2.5, height - 1) * k), a = rng.range(-1.2, 1.2) + Math.PI / 2;
    const tp = trunk[Math.min(trunk.length - 1, Math.floor(y / k / height * (trunk.length - 1)))];
    const cx = ox + tp[0] * k + Math.cos(a) * TR * k * 0.85, cz = oz + tp[2] * k + Math.sin(a) * TR * k * 0.85;
    for (let dy = -1; dy <= 1; dy++) for (let d = 0; d < 3; d++) g.set(cx - Math.cos(a) * d, y + dy, cz - Math.sin(a) * d, 0x1a120c);
  }
  for (let i = 0; i < 4; i++) {
    const y = Math.round(rng.range(0.6, 3) * k), a = rng.range(0.4, 1.5);
    const tp = trunk[1];
    const cx = ox + tp[0] * k + Math.cos(a) * TR * k, cz = oz + tp[2] * k + Math.sin(a) * TR * k;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.hypot(dx, dz) < 2.4) g.set(cx + dx, y, cz + dz, Math.hypot(dx, dz) > 1.6 ? FUNGUS[3] : FUNGUS[1]);
  }
  return { wood: meshVoxGreedy(g, { scale: 1 / k, pivot: [ox, 0, oz] }), leaves: null, height, radius: 1.5 };
}

export function triCount(geo) { return geo ? (geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3) : 0; }

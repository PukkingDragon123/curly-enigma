// The forest floor's things, in voxels (geometries in metres, origin at the base, for instancing):
//   makeFernGeo        a shuttlecock of arching fronds with leaflets, fresh green to dark at the base
//   makeMushroomGeo    a little cluster: fly agaric, porcini, chanterelle, inkcaps or puffballs
//   makeMossGeo        a rounded cushion of moss with tiny sporophytes
//   makeBoulderGeo     a mossy boulder with lichen spots
//   makeFallenLogGeo   a great fallen trunk: moss on top, shelf fungi, a broken end, a hollow end
//   makeFoxgloveGeo    a spike of purple bells
//   makeShrubGeo       a low leafy shrub (bilberry, holly) with berries
//   makeRootArcGeo     a root arching out of the ground (across the trail)
import { VoxelGrid, meshVoxGreedy, hash3, fshade, fmix } from '../vox.js';
import { makeRng, makeNoise2D } from '../../core/util.js';

const FROND = [0x2e5a26, 0x3e7230, 0x55903a, 0x74a846, 0x9cc45a];
const MOSS = [0x86a844, 0x6e9638, 0x5a8230, 0x486c28, 0x3a5a22];

/** A fern (radius r metres) at 1/k m voxels. dry: a browner bracken. */
export function makeFernGeo(seed, { r = 0.5, k = 20, dry = 0 } = {}) {
  const rng = makeRng(seed);
  const R = Math.ceil(r * k) + 3;
  const W = 2 * R + 2;
  const g = new VoxelGrid(W, Math.ceil(r * k * 1.1) + 4, W);
  const c = W / 2;
  const n = rng.int(7, 10);
  const pal = dry ? FROND.map((col, i) => fmix(col, [0x5a3a1e, 0x7a5228, 0x9a6a30, 0xb88a40, 0xd0a858][i], dry)) : FROND;
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const len = r * k * rng.range(0.75, 1.05);
    const rise = rng.range(0.7, 1.05); // how steeply it rises before arching over
    const steps = Math.ceil(len * 1.4);
    let px = c, py = 0.5, pz = c;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      // the rachis: up and out, arching over toward the tip
      const el = rise * (1 - t * 1.6);
      px = c + Math.cos(a) * (t * len);
      pz = c + Math.sin(a) * (t * len);
      py += Math.sin(el) * (len / steps) * 0.95;
      if (py < 0.5) py = 0.5;
      const ci = t < 0.15 ? 0 : t < 0.45 ? 1 : t < 0.75 ? 2 : 3;
      g.set(px, py, pz, pal[ci]);
      // leaflets (pinnae) on both sides, shorter toward the tip
      if (s % 2 === 0 && t > 0.08) {
        const pl = Math.max(1, Math.round((1 - t) * (1 - t * 0.3) * r * k * 0.32));
        for (let side = -1; side <= 1; side += 2) {
          for (let q = 1; q <= pl; q++) {
            const qx = px + Math.cos(a + side * Math.PI / 2) * q - Math.cos(a) * q * 0.25;
            const qz = pz + Math.sin(a + side * Math.PI / 2) * q - Math.sin(a) * q * 0.25;
            const qy = py - q * 0.35;
            const tipLit = q === pl ? 1 : 0;
            g.set(qx, qy, qz, pal[Math.min(4, ci + tipLit + (hash3(Math.round(qx), Math.round(qy), Math.round(qz), seed) < 0.2 ? 1 : 0))]);
          }
        }
      }
    }
  }
  // a fiddlehead or two curled up in the middle
  for (let i = 0; i < 2; i++) {
    const a = rng.range(0, 6.28);
    for (let s = 0; s < 6; s++) g.set(c + Math.cos(a) * (s > 3 ? 1 : 0), 1 + s, c + Math.sin(a) * (s > 3 ? 1 : 0), pal[2]);
    g.set(c + Math.cos(a) * 1.5, 6, c + Math.sin(a) * 1.5, pal[4]);
  }
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [c, 0, c] });
}

const SHROOM = {
  agaric: { cap: [0xe0321e, 0xc02818, 0x8e1c12], spot: 0xfff6e8, stem: 0xf0e8d8, gill: 0xf4ead8, shape: 'dome' },
  porcini: { cap: [0x9a5a2a, 0x7e4620, 0x5e3418], spot: 0, stem: 0xe8d8b0, gill: 0xd8c890, shape: 'bun' },
  chanterelle: { cap: [0xf4b030, 0xe0961e, 0xb87418], spot: 0, stem: 0xe8a028, gill: 0xd88a1e, shape: 'funnel' },
  inkcap: { cap: [0xe8e0d0, 0xc8bca8, 0x8a8070], spot: 0, stem: 0xf4f0e8, gill: 0x4a443c, shape: 'bell' },
  puffball: { cap: [0xf4eee0, 0xe0d8c4, 0xc4b8a0], spot: 0xd8ccb4, stem: 0xe8e0cc, gill: 0xe8e0cc, shape: 'ball' },
  brown: { cap: [0xc8945a, 0xa8743e, 0x80562e], spot: 0, stem: 0xf0e8d8, gill: 0xe0d0b0, shape: 'dome' },
};
/** A cluster of n mushrooms of one kind (1/k m voxels). Returns a geometry. */
export function makeMushroomGeo(seed, { kind = 'agaric', n = 3, k = 32, scale = 1 } = {}) {
  const S = SHROOM[kind] || SHROOM.agaric;
  const rng = makeRng(seed);
  const W = Math.round(26 * scale) + 8, Hh = Math.round(22 * scale) + 6;
  const g = new VoxelGrid(W, Hh, W);
  const c = W / 2;
  for (let i = 0; i < n; i++) {
    const big = i === 0;
    const s = (big ? 1 : rng.range(0.45, 0.8)) * scale;
    const a = rng.range(0, 6.28), d = big ? 0 : rng.range(3, 8) * scale;
    const x0 = c + Math.cos(a) * d, z0 = c + Math.sin(a) * d;
    const sh = (kind === 'chanterelle' ? 7 : kind === 'puffball' ? 1 : kind === 'inkcap' ? 10 : 9) * s;
    const sr = Math.max(1, (kind === 'porcini' ? 2.6 : 1.3) * s);
    const lean = rng.range(-0.08, 0.08);
    for (let y = 0; y < sh; y++) g.cylinderY(x0 + lean * y, z0, sr * (kind === 'porcini' ? 1 - y / sh * 0.3 : 1), y, y + 1, (x, yy, z) => (hash3(x, yy, z, i) < 0.15 ? fshade(S.stem, 0.9) : S.stem));
    const cx = x0 + lean * sh, cy = sh, cz = z0;
    const cr = (kind === 'puffball' ? 3 : kind === 'inkcap' ? 2.4 : kind === 'chanterelle' ? 3.2 : 4.2) * s;
    for (let dy = -cr; dy <= cr * 1.2; dy++) for (let dz = -cr - 1; dz <= cr + 1; dz++) for (let dx = -cr - 1; dx <= cr + 1; dx++) {
      const rr = Math.hypot(dx, dz) / cr;
      let inside = false, under = false;
      if (S.shape === 'dome') { inside = dy >= 0 && rr * rr + (dy / (cr * 0.75)) ** 2 <= 1; under = dy === 0; }
      else if (S.shape === 'bun') { inside = dy >= -1 && rr * rr + (dy / (cr * 0.6)) ** 2 <= 1; under = dy <= 0; }
      else if (S.shape === 'funnel') { inside = dy >= 0 && dy <= 2 && rr <= 1 && rr >= dy * 0.08 && (dy < 2 || rr > 0.5); under = dy === 0; }
      else if (S.shape === 'bell') { inside = dy >= -cr * 0.6 && (rr * rr) * (1 + dy / cr) + (dy / (cr * 1.4)) ** 2 <= 1.0; under = dy < -cr * 0.3; }
      else { inside = rr * rr + ((dy - cr * 0.2) / cr) ** 2 <= 1; under = false; }
      if (!inside) continue;
      const X = cx + dx, Y = cy + dy, Z = cz + dz;
      const top = dy / (cr * 0.75) + rr * 0.2;
      let col = under ? S.gill : top > 0.55 ? S.cap[0] : top > 0.15 ? S.cap[1] : S.cap[2];
      if (S.spot && !under && hash3(Math.round(X), Math.round(Y), Math.round(Z), seed + i) < 0.12) col = S.spot;
      g.set(X, Y, Z, col);
    }
  }
  // a bit of moss and a leaf at the foot
  for (let i = 0; i < 6; i++) g.set(c + rng.range(-5, 5), 0, c + rng.range(-5, 5), MOSS[rng.int(0, 4)]);
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [c, 0, c] });
}

/** A moss cushion r metres across (1/k m), with a few sporophytes. */
export function makeMossGeo(seed, { r = 0.45, h = 0.16, k = 12 } = {}) {
  const rng = makeRng(seed);
  const nz = makeNoise2D(seed + 5);
  const R = Math.ceil(r * k), Hh = Math.ceil(h * k) + 4;
  const W = 2 * R + 4;
  const g = new VoxelGrid(W, Hh, W);
  const c = W / 2;
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - c) / R, dz = (z + 0.5 - c) / R;
    const d = Math.hypot(dx, dz) * (1 + nz(x * 0.3, z * 0.3) * 0.35);
    if (d > 1) continue;
    const top = Math.max(1, Math.round((1 - d * d) * h * k + nz(x * 0.4 + 9, z * 0.4) * 0.8));
    for (let y = 0; y < top; y++) {
      const ft = top - 1 - y;
      const col = ft === 0 ? MOSS[(hash3(x >> 2, 0, z >> 2, seed) * 3) | 0] : MOSS[3];
      g.set(x, y, z, col);
    }
    if (hash3(x, 9, z, seed) < 0.05) { g.set(x, top, z, 0x9a8a3a); g.set(x, top + 1, z, 0xc89a4a); } // sporophytes
  }
  void rng;
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [c, 0, c] });
}

/** A mossy boulder (w × h × d metres, 1/k m voxels). */
export function makeBoulderGeo(seed, { w = 1.4, h = 0.9, d = 1.1, k = 12, moss = 0.7, tone = 0x8a8478 } = {}) {
  const nz = makeNoise2D(seed * 5 + 3);
  const rx = w * k / 2, ry = h * k, rz = d * k / 2;
  const W = Math.ceil(rx * 2.6) + 4, D = Math.ceil(rz * 2.6) + 4, Hh = Math.ceil(ry * 1.3) + 4;
  const g = new VoxelGrid(W, Hh, D);
  const cx = W / 2, cz = D / 2;
  const TONES = [fshade(tone, 1.12), tone, fshade(tone, 0.88), fshade(tone, 0.74)];
  for (let z = 0; z < D; z++) for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 + ry * 0.25) / (ry * 1.25), dz = (z + 0.5 - cz) / rz;
    const n = nz(x * 0.18 + y * 0.07, z * 0.18 - y * 0.05) * 0.28 + nz(x * 0.5, z * 0.5 + y * 0.3) * 0.08;
    const e = dx * dx + dy * dy + dz * dz;
    if (e > 1 + n) continue;
    // faceted: flat-ish planes catch the light
    const up = dy / Math.sqrt(e + 1e-3);
    const lit = (-dx * 0.36 - dz * 0.82) * 0.5 + up * 0.6;
    let col = lit > 0.55 ? TONES[0] : lit > 0.1 ? TONES[1] : lit > -0.3 ? TONES[2] : TONES[3];
    if (hash3(x >> 1, y >> 1, z >> 1, seed) < 0.06) col = fmix(col, 0xd8d0a0, 0.45); // lichen
    if (hash3(x, y, z, seed + 2) < 0.04) col = fmix(col, 0xb8c0a8, 0.35);
    // moss: on top and the shady (+x, +z) side, in soft patches
    const mz = up * 0.9 + (dx * 0.36 + dz * 0.82) * 0.35 + nz(x * 0.25 + 7, z * 0.25) * 0.5;
    if (moss > 0 && mz > 1 - moss) col = MOSS[(hash3(x, y, z, seed + 3) * 4) | 0];
    g.set(x, y, z, col);
  }
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [cx, ry * 0.25, cz] });
}

/** A great fallen trunk along +x (len metres, radius r), 1/k m voxels. */
export function makeFallenLogGeo(seed, { len = 5, r = 0.45, k = 12, hollow = true } = {}) {
  const rng = makeRng(seed);
  const nz = makeNoise2D(seed + 11);
  const L = Math.ceil(len * k), R = r * k;
  const W = L + 6, Hh = Math.ceil(R * 2.6) + 6, D = Math.ceil(R * 2.6) + 8;
  const g = new VoxelGrid(W, Hh, D);
  const cy = R + 0.5, cz = D / 2;
  const BARKC = [0x6e5a46, 0x5a4838, 0x483a2e, 0x34291f];
  for (let x = 3; x < L + 3; x++) {
    const t = (x - 3) / L;
    const rr = R * (1 - t * 0.18) * (1 + nz(t * 6, 1) * 0.06);
    const sag = Math.sin(t * Math.PI) * 0.6;
    for (let z = 0; z < D; z++) for (let y = 0; y < Hh; y++) {
      const dy = y + 0.5 - (cy - sag), dz = z + 0.5 - cz;
      const d = Math.hypot(dy, dz);
      if (d > rr) continue;
      const endCut = x < 4 || x > L + 1;
      if (hollow && x > L - 2 * R && d < rr * 0.55) continue; // the hollow end
      const a = Math.atan2(dy, dz);
      let col;
      if (endCut) col = Math.round(d) % 2 ? 0xb88a5a : 0x9a7048;
      else {
        const groove = Math.abs(Math.sin(a * 5 + nz(x * 0.1, 3) * 2)) < 0.18;
        col = groove ? BARKC[3] : dy > rr * 0.3 ? BARKC[0] : dy > -rr * 0.3 ? BARKC[1] : BARKC[2];
        if (d < rr - 1.2) col = 0x7a5a3a;
        // moss over the top, thick
        if (dy > rr * 0.25 + nz(x * 0.2, z * 0.2) * rr * 0.4) col = MOSS[(hash3(x, y, z, seed) * 4) | 0];
        if (hash3(x >> 1, y >> 1, z >> 1, seed + 1) < 0.05) col = fmix(col, 0xc8c090, 0.3);
      }
      g.set(x, y, z, col);
    }
  }
  // shelf fungi along the side, a few toadstools on top, broken branch stubs
  for (let i = 0; i < 5; i++) {
    const x = Math.round(rng.range(6, L - 4)), side = rng.chance(0.6) ? 1 : -1;
    const z0 = cz + side * R * 0.95, y0 = Math.round(cy + rng.range(-0.3, 0.4) * R);
    for (let dx = -3; dx <= 3; dx++) for (let dz = 0; dz <= 2; dz++) if (Math.hypot(dx / 3, dz / 2.2) <= 1) g.set(x + dx, y0, z0 + side * dz, dz === 2 ? 0xf4e0b0 : 0xd0a868);
  }
  for (let i = 0; i < 3; i++) {
    const x = Math.round(rng.range(6, L - 6)), a = rng.range(-0.8, 0.8);
    for (let s = 0; s < R * 1.4; s++) g.set(x + s * 0.3, cy + Math.cos(a) * (R + s * 0.8), cz + Math.sin(a) * (R + s * 0.8), BARKC[1]);
  }
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [3 + L / 2, 0.6, cz] });
}

/** A foxglove spike (h metres) of purple-pink bells, 1/k m. */
export function makeFoxgloveGeo(seed, { h = 0.9, k = 24, color = 0xc85aa8 } = {}) {
  const rng = makeRng(seed);
  const H = Math.ceil(h * k) + 4, W = 16;
  const g = new VoxelGrid(W, H, W);
  const c = W / 2;
  // basal leaves
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    for (let s = 0; s < 6; s++) g.set(c + Math.cos(a) * s, 1 + (s < 3 ? 1 : 0), c + Math.sin(a) * s, s < 2 ? 0x3e6a30 : 0x5a8a40);
  }
  const top = Math.round(h * k);
  for (let y = 0; y < top; y++) g.set(c, y, c, y > top - 4 ? 0x8ab060 : 0x4a7a36);
  for (let y = Math.round(top * 0.35); y < top - 3; y += 2) {
    const a = y * 2.4;
    const bx = c + Math.cos(a) * 1.4, bz = c + Math.sin(a) * 1.4;
    const t = (y - top * 0.35) / (top * 0.65);
    g.set(bx, y, bz, fshade(color, 1.1 - t * 0.2));
    g.set(bx, y - 1, bz, fshade(color, 0.85));
    if (t < 0.6) g.set(bx + Math.cos(a), y - 1, bz + Math.sin(a), fmix(color, 0xffffff, 0.35));
  }
  void rng;
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [c, 0, c] });
}

/** A low leafy shrub (r metres) with berries (bilberry blue, holly red, or none). */
export function makeShrubGeo(seed, { r = 0.5, h = 0.45, k = 11, berry = 0, leaf = [0x8aac48, 0x6a9238, 0x4e762e, 0x365a26] } = {}) {
  const nz = makeNoise2D(seed + 3);
  const R = Math.ceil(r * k) + 2, Hh = Math.ceil(h * k * 1.3) + 3;
  const W = 2 * R + 2;
  const g = new VoxelGrid(W, Hh, W);
  const c = W / 2;
  for (let z = 0; z < W; z++) for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - c) / (r * k), dy = (y + 0.5) / (h * k), dz = (z + 0.5 - c) / (r * k);
    const e = dx * dx + (dy - 0.15) ** 2 * 1.2 + dz * dz;
    const n = nz(x * 0.35 + y * 0.2, z * 0.35 - y * 0.2) * 0.35;
    if (e > 1 + n || dy < 0) continue;
    if (e > 0.8 + n && hash3(x >> 1, y >> 1, z >> 1, seed) < 0.2) continue;
    const lit = dy * 0.8 - dx * 0.3 - dz * 0.6;
    let col = lit > 0.5 ? leaf[0] : lit > 0.1 ? leaf[1] : lit > -0.3 ? leaf[2] : leaf[3];
    if (berry && e > 0.55 && hash3(x, y, z, seed + 1) < 0.05) col = berry;
    g.set(x, y, z, col);
  }
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [c, 0, c] });
}

/** A root arching out of the ground and back in (span metres along +x), 1/k m. */
export function makeRootArcGeo(seed, { span = 1.6, r = 0.07, rise = 0.16, k = 16, moss = 0.4 } = {}) {
  const rng = makeRng(seed);
  const L = Math.ceil(span * k), R = Math.max(1, r * k);
  const W = L + 6, Hh = Math.ceil((rise + r * 2) * k) + 4, D = Math.ceil(R * 2 + 10);
  const g = new VoxelGrid(W, Hh, D);
  const cz = D / 2;
  const wob = rng.range(-1, 1);
  for (let x = 3; x < L + 3; x++) {
    const t = (x - 3) / L;
    const y = Math.sin(t * Math.PI) * rise * k + R * 0.2 - 0.5;
    const z = cz + Math.sin(t * 5 + wob) * 1.5;
    const rr = R * (1.15 - t * 0.4);
    g.ellipsoid(x, y, z, 0.8, rr, rr, (xx, yy) => (yy > y + rr * 0.3 && hash3(xx, yy, Math.round(z), seed) < moss ? MOSS[(hash3(xx, yy, 1, seed) * 3) | 0] : yy > y ? 0x6e5a44 : 0x54442f));
  }
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [3 + L / 2, 0, cz] });
}

/** A few pebbles in a little cluster (1/k m). */
export function makePebblesGeo(seed, { k = 30 } = {}) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(20, 6, 20);
  const TONES = [0x9a948a, 0x8a8478, 0xb0a898, 0x7a7468, 0xa89a80];
  for (let i = 0; i < 5; i++) {
    const x = rng.range(4, 16), z = rng.range(4, 16), r = rng.range(1.2, 2.6);
    const c = TONES[rng.int(0, 4)];
    g.ellipsoid(x, 0.5, z, r, r * 0.7, r * rng.range(0.8, 1.2), (xx, y) => (y > 0 ? fshade(c, 1.08) : c));
  }
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [10, 0.5, 10] });
}

/** A fallen twig with a fork (1/k m). */
export function makeTwigGeo(seed, { k = 32 } = {}) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(26, 4, 26);
  const len = rng.int(12, 20), a = rng.range(0, 3.14);
  for (let s = 0; s < len; s++) g.set(13 + Math.cos(a) * (s - len / 2), 0, 13 + Math.sin(a) * (s - len / 2), s % 5 === 0 ? 0x6a5236 : 0x7e6444);
  const fs = rng.int(4, len - 4), fa = a + rng.range(0.5, 0.9);
  for (let s = 0; s < 6; s++) g.set(13 + Math.cos(a) * (fs - len / 2) + Math.cos(fa) * s, 0, 13 + Math.sin(a) * (fs - len / 2) + Math.sin(fa) * s, 0x7e6444);
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [13, 0, 13] });
}

/** A scatter of fallen leaves (autumn colours), flat on the ground (1/k m). */
export function makeLeavesGeo(seed, { k = 40, n = 7 } = {}) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(28, 2, 28);
  const COLS = [0xc87830, 0xd8a040, 0xa85a28, 0x8a7a3a, 0xb8902e, 0x9a4a22];
  for (let i = 0; i < n; i++) {
    const x = rng.range(4, 24), z = rng.range(4, 24), a = rng.range(0, 3.14), c = COLS[rng.int(0, 5)];
    for (let s = -2; s <= 2; s++) for (let w = -1; w <= 1; w++) {
      if (Math.abs(w) === 1 && Math.abs(s) === 2) continue;
      g.set(x + Math.cos(a) * s - Math.sin(a) * w, 0, z + Math.sin(a) * s + Math.cos(a) * w, w === 0 ? fshade(c, 0.85) : c);
    }
  }
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [14, 0, 14] });
}

// ------------------------------------------------------------------ fine things (wave 8)
// Small things are built from small voxels: a flower clump at 1/40 m, cones and acorns at 1/48 m,
// a fallen branch at 1/24 m, a sapling at 1/16 m; the bough that hangs into the opening shot at
// 1/14 m wood and 1/9 m leaves (it is seen up close).

const FLOWER = {
  bluebell: { petal: [0x6a6ae8, 0x4a4ac0, 0x8a8af0], leaf: [0x2e5a2a, 0x3e7230, 0x4e8a3a], nod: true, h: 0.22 },
  anemone: { petal: [0xfaf6ff, 0xe8e0f0, 0xf0d0e8], heart: 0xf0d050, leaf: [0x3e6a2e, 0x4e8236, 0x62983e], h: 0.12 },
  primrose: { petal: [0xfff2a0, 0xf8e080, 0xfff8c8], heart: 0xf0a030, leaf: [0x3e7232, 0x5a9440, 0x6aa448], h: 0.08, rosette: true },
  violet: { petal: [0x7a4ac8, 0x6a3ab0, 0x9a6ae0], heart: 0xf8f0e0, leaf: [0x2e6a2e, 0x3e7a34, 0x4e8a3a], h: 0.09 },
  campion: { petal: [0xf070a0, 0xe05888, 0xff98c0], heart: 0xa03060, leaf: [0x3a6a2e, 0x4a7e36, 0x5a8e3e], h: 0.3 },
  wood_sorrel: { petal: [0xfff4f8, 0xf0d8e4, 0xfffaff], heart: 0xd8a0c0, leaf: [0x5aa044, 0x6ab04c, 0x7ac058], h: 0.06, trefoil: true },
};
/** A little clump of woodland flowers (1/k m voxels): kind 'bluebell' | 'anemone' | 'primrose' | 'violet' | 'campion' | 'wood_sorrel'. */
export function makeFlowerClumpGeo(seed, { kind = 'bluebell', n = 5, k = 40 } = {}) {
  const F = FLOWER[kind] || FLOWER.bluebell;
  const rng = makeRng(seed);
  const H = Math.ceil(F.h * k) + 6, W = Math.ceil(0.34 * k);
  const g = new VoxelGrid(W, H, W);
  const c = W / 2;
  // leaves round the foot: strap leaves (bluebell), rosettes (primrose), trefoils (sorrel), hearts
  const nl = F.rosette ? 9 : 7;
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * Math.PI * 2 + rng.range(-0.3, 0.3), len = (F.rosette ? 0.07 : F.trefoil ? 0.04 : 0.09) * k * rng.range(0.8, 1.2);
    for (let s = 0; s < len; s++) {
      const t = s / len, y = F.rosette || F.trefoil ? 1 + Math.sin(t * Math.PI) * 1.2 : 1 + t * len * 0.5 - t * t * len * 0.35;
      const x = c + Math.cos(a) * s, z = c + Math.sin(a) * s;
      const w = F.rosette ? Math.sin(t * Math.PI) * 1.6 : F.trefoil ? (t > 0.5 ? 1.2 : 0) : 0.6;
      for (let q = -Math.round(w); q <= Math.round(w); q++) g.set(x - Math.sin(a) * q, y, z + Math.cos(a) * q, F.leaf[q === 0 ? 0 : t > 0.6 ? 2 : 1]);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, 6.28), d = rng.range(0, 0.07) * k;
    const x0 = c + Math.cos(a) * d, z0 = c + Math.sin(a) * d;
    const h = F.h * k * rng.range(0.75, 1.1);
    const lx = rng.range(-0.15, 0.15), lz = rng.range(-0.15, 0.15);
    for (let y = 0; y < h; y++) g.set(x0 + lx * y, y, z0 + lz * y, y > h - 3 ? F.leaf[2] : F.leaf[1]);
    const tx = x0 + lx * h, tz = z0 + lz * h;
    if (F.nod) {
      // bluebells: the stem arches over and the bells hang down one side
      for (let b = 0; b < 5; b++) {
        const bx = tx + 1 + b * 0.35, by = h - b * 1.6, bz = tz + (b % 2 ? 0.6 : -0.4);
        g.set(bx, by, bz, F.leaf[1]);
        g.set(bx + 1, by - 1, bz, F.petal[0]); g.set(bx + 1, by - 2, bz, F.petal[1]); g.set(bx + 2, by - 2, bz, F.petal[2]); g.set(bx + 1, by - 2, bz + 1, F.petal[1]);
      }
    } else {
      // an open flower: petals round a heart, facing up and a little out (toward the low sun)
      const r = kind === 'campion' ? 2.2 : 2;
      for (let p = 0; p < 5; p++) {
        const pa = p * 1.2566 + a;
        for (let s = 1; s <= r; s++) g.set(tx + Math.cos(pa) * s, h + (s > 1 ? 0.4 : 0), tz + Math.sin(pa) * s, F.petal[s > 1 ? (p % 2 ? 2 : 0) : 1]);
      }
      g.set(tx, h, tz, F.heart);
    }
  }
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [c, 0, c] });
}

/** A fallen branch along +x (len m) with side twigs, moss and a few dead leaves (1/k m). */
export function makeBranchGeo(seed, { len = 1.4, r = 0.045, k = 24 } = {}) {
  const rng = makeRng(seed);
  const L = Math.ceil(len * k), R = Math.max(1, r * k);
  const W = L + 8, D = Math.ceil(len * 0.6 * k) + 8, Hh = Math.ceil(R * 2) + 8;
  const g = new VoxelGrid(W, Hh, D);
  const cz = D / 2;
  const BK = [0x6a5440, 0x584432, 0x7a6248, 0x463626];
  const wob = rng.range(0, 6);
  for (let x = 4; x < L + 4; x++) {
    const t = (x - 4) / L, rr = R * (1 - t * 0.5);
    const z = cz + Math.sin(t * 3 + wob) * 2;
    g.ellipsoid(x, rr, z, 0.7, rr, rr, (xx, yy, zz) => (yy > rr * 1.4 && hash3(xx, yy, zz, seed) < 0.45 ? MOSS[(hash3(xx, 1, zz, seed) * 3) | 0] : BK[yy > rr ? 0 : hash3(xx, yy, zz, seed + 1) < 0.2 ? 3 : 1]));
  }
  for (let i = 0; i < 4; i++) {
    const x0 = 4 + rng.range(0.15, 0.85) * L, a = (i % 2 ? 1 : -1) * rng.range(0.5, 1.0), l = rng.range(0.12, 0.3) * k;
    const z0 = cz + Math.sin(((x0 - 4) / L) * 3 + wob) * 2;
    for (let s = 0; s < l; s++) g.set(x0 + Math.cos(a) * s, R + (s > l * 0.6 ? 1 : 0), z0 + Math.sin(a) * s, BK[2]);
  }
  const LV = [0xa86a30, 0xc88a3a, 0x8a5a2a, 0xb89a48];
  for (let i = 0; i < 5; i++) { const x = 4 + rng.range(0, L), z = cz + rng.range(-6, 6); g.set(x, 0, z, LV[i % 4]); g.set(x + 1, 0, z, LV[(i + 1) % 4]); g.set(x, 0, z + 1, LV[i % 4]); }
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [4 + L / 2, 0, cz] });
}

/** A scatter of cones and acorns on the ground (1/k m). */
export function makeConesGeo(seed, { k = 48, n = 7, pine = true } = {}) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(30, 8, 30);
  for (let i = 0; i < n; i++) {
    const x = rng.range(5, 25), z = rng.range(5, 25), a = rng.range(0, 3.14);
    if (pine && i % 3 !== 2) {
      // a cone lying on its side: scales in rings
      for (let s = 0; s < 6; s++) {
        const rr = 1.6 * Math.sin(((s + 0.5) / 6) * Math.PI) + 0.4;
        g.ellipsoid(x + Math.cos(a) * s * 0.9, rr, z + Math.sin(a) * s * 0.9, 0.6, rr, rr, s % 2 ? 0x8a5a32 : 0x6a4226);
      }
    } else {
      // an acorn in its cup
      g.ellipsoid(x, 1.2, z, 1.1, 1.3, 1.1, 0xa87a3a); g.set(x, 2.6, z, 0x7a6a3a); g.ellipsoid(x + 0.8, 1.2, z, 0.8, 1.0, 1.1, 0x6a5a34);
    }
  }
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [15, 0, 15] });
}

/** A flat path stone, mossy round its edges (w × d m, 1/k m). */
export function makeSlabGeo(seed, { w = 0.42, d = 0.32, k = 24, tone = 0x9a9284 } = {}) {
  const nz = makeNoise2D(seed + 7);
  const W = Math.ceil(w * k) + 4, D = Math.ceil(d * k) + 4;
  const g = new VoxelGrid(W, 4, D);
  const T = [fshade(tone, 1.1), tone, fshade(tone, 0.88), fshade(tone, 0.76)];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - W / 2) / (w * k / 2), dz = (z + 0.5 - D / 2) / (d * k / 2);
    const e = dx * dx + dz * dz + nz(x * 0.4, z * 0.4) * 0.35;
    if (e > 1) continue;
    const top = e < 0.55 ? 2 : 1;
    for (let y = 0; y < top; y++) {
      let col = y === top - 1 ? T[(hash3(x >> 1, 0, z >> 1, seed) * 2) | 0] : T[2];
      if (e > 0.72 && y === top - 1 && hash3(x, y, z, seed + 1) < 0.6) col = MOSS[(hash3(x, 2, z, seed) * 3) | 0];
      if (hash3(x, y, z, seed + 3) < 0.04) col = fmix(col, 0xd8d0a0, 0.5); // lichen
      g.set(x, y, z, col);
    }
  }
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [W / 2, 0.6, D / 2] });
}

/**
 * A young tree of the understory (h m): a slender, slightly crooked stem with alternate side
 * shoots, each ending in a loose cluster of leaves (lit on top and toward the sun, dark beneath,
 * with gaps). 1/k m voxels. Returns { wood, leaves } geometries.
 */
export function makeSaplingGeo(seed, { h = 1.3, k = 16, leaf = [0xa8c060, 0x84a84a, 0x62903c, 0x46722e, 0x2e5224], bark = 0x8a8478 } = {}) {
  const rng = makeRng(seed);
  const H = Math.ceil(h * k) + 6, R = Math.ceil(0.55 * h * k) + 4, W = 2 * R + 2;
  const wood = new VoxelGrid(W, H, W), leaves = new VoxelGrid(W, H, W);
  const c = W / 2;
  // the stem: a gentle zig-zag (each shoot pulls it a little)
  const stem = [[c, 0, c]];
  let sx = c, sz = c;
  const nS = Math.round(h * k * 0.95);
  for (let y = 1; y <= nS; y++) { if (y % 5 === 0) { sx += rng.range(-0.6, 0.6); sz += rng.range(-0.6, 0.6); } stem.push([sx, y, sz]); }
  for (const [x, y, z] of stem) wood.set(x, y, z, y < 3 ? fshade(bark, 0.8) : bark);
  const clusters = [];
  const nB = 4 + rng.int(0, 3);
  for (let b = 0; b < nB; b++) {
    const t = 0.35 + (b / nB) * 0.55 + rng.range(-0.04, 0.04);
    const [x0, y0, z0] = stem[Math.min(stem.length - 1, Math.round(t * nS))];
    const a = b * 2.4 + rng.range(-0.4, 0.4); // alternate, spiralling round the stem
    const len = (1.05 - t) * 0.45 * h * k * rng.range(0.8, 1.15);
    let x = x0, y = y0, z = z0;
    for (let s = 0; s < len; s++) { x += Math.cos(a); z += Math.sin(a); y += 0.45 - s / len * 0.4; if (s < len * 0.8) wood.set(x, y, z, fshade(bark, 0.9)); }
    clusters.push([x, y, z, (0.13 + (1 - t) * 0.12) * k * rng.range(0.85, 1.15)]);
    if (len > 5) clusters.push([x0 + Math.cos(a) * len * 0.5, y0 + len * 0.25, z0 + Math.sin(a) * len * 0.5, 0.1 * k]);
  }
  const top = stem[stem.length - 1];
  clusters.push([top[0], top[1] + 1, top[2], 0.16 * k]);
  for (const [cx, cy, cz, r] of clusters) {
    for (let z = Math.floor(cz - r - 1); z <= cz + r + 1; z++) for (let y = Math.floor(cy - r * 0.7); y <= cy + r * 0.7 + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / (r * 0.62), dz = (z + 0.5 - cz) / r;
      const e = dx * dx + dy * dy + dz * dz;
      if (e > 1 || (e > 0.5 && hash3(x, y, z, seed) < 0.3)) continue;
      const lit = dy * 0.7 + (-dx * 0.36 - dz * 0.82) * 0.35 + (hash3(x >> 1, y >> 1, z >> 1, seed + 1) - 0.5) * 0.5;
      leaves.set(x, y, z, leaf[lit > 0.55 ? 0 : lit > 0.15 ? 1 : lit > -0.2 ? 2 : lit > -0.55 ? 3 : 4]);
    }
  }
  const o = { scale: 1 / k, pivot: [c, 0, c] };
  return { wood: meshVoxGreedy(wood, o), leaves: meshVoxGreedy(leaves, o) };
}

/**
 * A leafy bough hanging into a shot (along +x, drooping): a limb that forks into twigs, each
 * ending in sprays of leaves. Wood at 1/kw m, leaves at 1/kl m. Returns { wood, leaves }.
 */
export function makeBoughGeo(seed, { len = 3.2, kw = 14, kl = 9, leaf = [0xd0d878, 0xa8c45a, 0x7ea446, 0x5a8238, 0x3a5e2c], bark = [0x7a6650, 0x5e4e3c, 0x46382a] } = {}) {
  const rng = makeRng(seed);
  // the skeleton in metres: a limb from the origin out along +x, sagging, forking into twigs
  const segs = [];
  const tips = [];
  const grow = (p, dir, l, r, depth) => {
    const n = 4;
    let q = p.slice(), d = dir.slice();
    for (let i = 0; i < n; i++) {
      d[0] += rng.range(-0.15, 0.15); d[1] += rng.range(-0.18, 0.06) - 0.06; d[2] += rng.range(-0.18, 0.18);
      const m = Math.hypot(d[0], d[1], d[2]); d = d.map((v) => v / m);
      const nq = [q[0] + d[0] * l / n, q[1] + d[1] * l / n, q[2] + d[2] * l / n];
      segs.push({ a: q, b: nq, r: r * (1 - (i / n) * 0.5) });
      if (depth < 2 && i > 0 && rng() < 0.75) {
        const side = rng() < 0.5 ? 1 : -1;
        grow(nq, [d[0] * 0.6 - d[2] * side * 0.8, d[1] - 0.15, d[2] * 0.6 + d[0] * side * 0.8], l * 0.45, r * 0.5, depth + 1);
      }
      q = nq;
    }
    tips.push(q);
  };
  grow([0, 0, 0], [1, -0.05, 0], len, 0.07, 0);
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0, z0 = 0, z1 = 0;
  for (const s of segs) for (const p of [s.a, s.b]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
  const pad = 0.55;
  const mk = (k) => { const g = new VoxelGrid(Math.ceil((x1 - x0 + pad * 2) * k), Math.ceil((y1 - y0 + pad * 2) * k), Math.ceil((z1 - z0 + pad * 2) * k)); return { g, k, V: (p) => [(p[0] - x0 + pad) * k, (p[1] - y0 + pad) * k, (p[2] - z0 + pad) * k] }; };
  const W = mk(kw), Lf = mk(kl);
  for (const s of segs) {
    const a = W.V(s.a), b = W.V(s.b), L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    for (let t = 0; t <= L; t += 0.5) {
      const u = t / Math.max(1, L), p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
      const rr = Math.max(0.6, s.r * kw);
      W.g.ellipsoid(p[0], p[1], p[2], rr, rr, rr, (x, y, z) => (y > p[1] + rr * 0.4 && hash3(x, y, z, seed) < 0.4 ? MOSS[(hash3(x, 0, z, seed) * 3) | 0] : y > p[1] ? bark[0] : hash3(x, y, z, seed + 1) < 0.3 ? bark[2] : bark[1]));
    }
  }
  // leaf sprays: flat, layered plates of single leaves (a beech spray seen from below), drooping
  // at their rims, two or three tiers on every twig tip and along the outer twigs, with sky
  // showing between the leaves
  const sprays = [...tips];
  for (const s of segs) if (s.r < 0.03 && rng() < 0.6) sprays.push(s.b);
  for (const p of sprays) {
    const [cx, cy, cz] = Lf.V(p);
    const tiers = 1 + rng.int(1, 2);
    for (let t = 0; t < tiers; t++) {
      const R = rng.range(0.22, 0.36) * kl * (1 - t * 0.2);
      const ox = rng.range(-0.12, 0.12) * kl, oz = rng.range(-0.12, 0.12) * kl, oy = -t * 0.09 * kl;
      const ph = rng.range(0, 6.28), tilt = rng.range(-0.25, 0.25);
      for (let z = -R - 1; z <= R + 1; z++) for (let x = -R - 1; x <= R + 1; x++) {
        const d = Math.hypot(x, z), a = Math.atan2(z, x);
        const rim = R * (0.78 + 0.22 * Math.sin(a * 5 + ph) + 0.1 * Math.sin(a * 11 + ph * 2));
        if (d > rim) continue;
        // single leaves: 3 x 2 voxel cells in staggered rows, some missing
        const lx = Math.floor((x + R + ((Math.floor((z + R) / 2) % 2) ? 1.5 : 0)) / 3), lz = Math.floor((z + R) / 2);
        const hl = hash3(lx, t, lz, seed + 7 + Math.round(cx));
        if (hl < 0.18) continue;
        const X = Math.round(cx + ox + x), Z = Math.round(cz + oz + z);
        const Y = Math.round(cy + oy - (d / R) ** 2 * R * 0.35 + x * tilt * 0.3 + (hl > 0.85 ? 1 : 0));
        const lit = (1 - d / R) * 0.3 + (hl - 0.5) * 0.9 + (-x * 0.36 - z * 0.82) / R * 0.25 - t * 0.2;
        Lf.g.set(X, Y, Z, leaf[lit > 0.45 ? 0 : lit > 0.1 ? 1 : lit > -0.2 ? 2 : lit > -0.45 ? 3 : 4]);
      }
    }
  }
  return {
    wood: meshVoxGreedy(W.g, { scale: 1 / kw, pivot: [(-x0 + pad) * kw, (-y0 + pad) * kw, (-z0 + pad) * kw] }),
    leaves: meshVoxGreedy(Lf.g, { scale: 1 / kl, pivot: [(-x0 + pad) * kl, (-y0 + pad) * kl, (-z0 + pad) * kl] }),
  };
}

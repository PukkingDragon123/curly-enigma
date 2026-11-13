// The raptor egg the mole finds in the forest (the journey) and keeps by his bedroll at home: the
// title's Amber egg (titleNest.js EGGS[0]: the same shape, shell ramp, speckles and crack network,
// voxels at 1/96 m), in plain vertex colours so any toon or lit material shows it; a nest for it
// (twigs, straw, moss, down and a bit of old shell, 1/64 m: small things); the egg wrapped in his
// spotted kerchief, knotted on top (the bundle he carries on his pack, 1/96 m); and the two halves
// it leaves when it hatches.
//
//   const E = buildRaptorEgg(seed);  new THREE.Mesh(E.geo, mat);  E.setCrack(0..1)  (0 smooth, 1 crazed
//     all over its front, warm light in every crack)  E.height, E.radius, E.pip (Vector3)
//   E.half / E.top: the hatched shell's bottom (jagged rim) and its cap (geometries).
//   nestGeo(seed, { r }) · bundleGeo(seed): geometries, pivot on the ground / the bundle's foot.
import * as THREE from 'three';
import { VoxelGrid, meshVoxGreedy, hash3, fshade } from '../vox.js';
import { makeRng, clamp } from '../../core/util.js';

const TAU = Math.PI * 2;
/** The title's Amber egg (titleNest.js EGGS[0]). */
export const EGG_SPEC = { shell: [0x8a6a44, 0xc4a070, 0xe4cc9c, 0xf6e8cc], spot: [0x5a3418, 0x84542a], inner: 0xfff0d8, light: 0xffb048 };

const EV = 1 / 96;
const EH = 27, ER = 9.6; // 0.28 × 0.2 m, as on the title
const EW = 2 * Math.ceil(ER) + 4;
const ECX = EW / 2, ECZ = EW / 2;
const eggR = (t) => { const u = 2 * t - 1; return ER * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.13 * u); };
const inEgg = (x, y, z, shrink = 0) => {
  const t = (y + 0.5) / EH;
  if (t <= 0 || t >= 1) return false;
  return Math.hypot(x + 0.5 - ECX, z + 0.5 - ECZ) <= eggR(t) - shrink;
};
const fmix = (a, b, k) => {
  const r = ((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k, g = ((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k, bl = (a & 255) * (1 - k) + (b & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
const _c = new THREE.Color();

/** Voxels → faces (no merging, so each voxel can be recoloured): { geo, owner (vertex → voxel) }. */
function meshFaces(vox, solid, faceCol) {
  const pos = [], nor = [], col = [], owner = [], idx = [];
  vox.forEach((v, vi) => {
    for (const f of FACES) {
      if (solid(v.x + f.n[0], v.y + f.n[1], v.z + f.n[2])) continue;
      _c.setHex(faceCol ? (faceCol(v, f) ?? v.c) : v.c);
      const b = pos.length / 3;
      for (const k of f.c) {
        pos.push((v.x + k[0] - ECX) * EV, (v.y + k[1]) * EV, (v.z + k[2] - ECZ) * EV);
        nor.push(...f.n);
        col.push(_c.r, _c.g, _c.b);
        owner.push(vi);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return { geo: g, owner };
}

/** The egg: { geo, setCrack(k), half, top, height, radius, pip }. */
export function buildRaptorEgg(seed = 31, spec = EGG_SPEC) {
  const rng = makeRng(seed);
  const key = (x, y, z) => x + 64 * (y + 64 * z);
  const surf = new Map(), list = [];
  for (let z = 0; z < EW; z++) for (let y = 0; y < EH; y++) for (let x = 0; x < EW; x++) {
    if (!inEgg(x, y, z)) continue;
    if (inEgg(x + 1, y, z) && inEgg(x - 1, y, z) && inEgg(x, y + 1, z) && inEgg(x, y - 1, z) && inEgg(x, y, z + 1) && inEgg(x, y, z - 1)) continue;
    surf.set(key(x, y, z), list.length);
    list.push({ x, y, z, c: 0, o: 9, e: 9 });
  }
  // the shell: a ramp by height, speckles, a few blotches (as on the title)
  const S = spec.shell;
  for (const v of list) {
    const t = (v.y + 0.5) / EH;
    let c = t > 0.78 ? S[3] : t > 0.3 ? S[2] : t > 0.12 ? S[1] : S[0];
    if (t > 0.3 && t < 0.78 && hash3(v.x, v.y >> 2, v.z, seed) < 0.18) c = fmix(S[2], S[3], 0.5);
    const h = hash3(v.x, v.y, v.z, seed + 1);
    if (h < 0.07) c = spec.spot[h < 0.03 ? 0 : 1];
    else if (hash3(v.x >> 1, v.y >> 1, v.z >> 1, seed + 2) < 0.045) c = fmix(c, spec.spot[1], 0.55);
    v.c = c;
  }
  // the crack: from a pip on the front (+z), two tips zigzagging round it, branching as it goes
  let pip = 0, pd = 1e9;
  const pipAt = [ECX + rng.range(-2.5, 2.5), EH * 0.6, EW];
  list.forEach((v, i) => { const d = Math.hypot(v.x + 0.5 - pipAt[0], v.y + 0.5 - pipAt[1], v.z + 0.5 - pipAt[2]); if (d < pd) { pd = d; pip = i; } });
  const N = Math.round(list.length * 0.2);
  let count = 0;
  list[pip].o = 0;
  const normal = (v) => { const n = [v.x + 0.5 - ECX, (v.y + 0.5 - EH * 0.5) * 0.55, v.z + 0.5 - ECZ]; const l = Math.hypot(...n) || 1; return n.map((q) => q / l); };
  const tang = (d, n) => { const k = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]; const o = [d[0] - n[0] * k, d[1] - n[1] * k, d[2] - n[2] * k]; const l = Math.hypot(...o) || 1; return o.map((q) => q / l); };
  const pv = list[pip];
  const side = tang([1, 0, 0], normal(pv));
  const tips = [{ i: pip, d: side, life: 999, z: 0 }, { i: pip, d: side.map((q) => -q), life: 999, z: 2 }];
  let guard = 0;
  while (tips.length && count < N && guard++ < 20000) {
    const T = tips.shift();
    const v = list[T.i];
    const n = normal(v);
    T.z++;
    const zig = ((T.z >> 1) & 1 ? 1 : -1) * 0.75;
    const up = tang([0, 1, 0], n);
    const want = [T.d[0] + up[0] * zig, T.d[1] + up[1] * zig, T.d[2] + up[2] * zig];
    let best = -1, bs = -1e9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      const j = surf.get(key(v.x + dx, v.y + dy, v.z + dz));
      if (j === undefined || list[j].o < 9) continue;
      const l = Math.hypot(dx, dy, dz);
      const sc = (dx * want[0] + dy * want[1] + dz * want[2]) / l + rng() * 0.5 - (l > 1.5 ? 0.3 : 0) + dz * 0.12;
      if (sc > bs) { bs = sc; best = j; }
    }
    if (best < 0 || T.life <= 0) continue;
    count++;
    list[best].o = count / N;
    const b = list[best];
    const st = [b.x - v.x, b.y - v.y, b.z - v.z];
    T.d = tang([T.d[0] * 0.75 + st[0] * 0.25 + rng.range(-0.15, 0.15), T.d[1] * 0.75 + st[1] * 0.1 + rng.range(-0.1, 0.1), T.d[2] * 0.75 + st[2] * 0.25 + rng.range(-0.15, 0.15)], normal(b));
    T.i = best; T.life--;
    tips.push(T);
    if (rng() < 0.045 + 0.09 * (count / N) && tips.length < 9) {
      const a = rng.range(0.9, 1.4) * (rng() < 0.5 ? 1 : -1), nb = normal(b);
      const c = Math.cos(a), s = Math.sin(a);
      const cr = [nb[1] * T.d[2] - nb[2] * T.d[1], nb[2] * T.d[0] - nb[0] * T.d[2], nb[0] * T.d[1] - nb[1] * T.d[0]];
      tips.push({ i: best, d: [T.d[0] * c + cr[0] * s, T.d[1] * c + cr[1] * s, T.d[2] * c + cr[2] * s], life: rng.int(5, 16), z: rng.int(0, 3) });
    }
  }
  // each voxel's lip: when the crack beside it opens (it darkens)
  list.forEach((v, i) => {
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = surf.get(key(v.x + dx, v.y + dy, v.z + dz));
      if (j !== undefined && j !== i) v.e = Math.min(v.e, list[j].o);
    }
  });
  const { geo, owner } = meshFaces(list, (x, y, z) => inEgg(x, y, z));
  const colA = geo.attributes.color;
  const glow = fmix(spec.light, 0xffffff, 0.25), deep = fshade(spec.light, 0.55);
  /** Crack it to k (0..1): the crack's voxels show the warm light inside, their lips darken. */
  const setCrack = (k) => {
    for (let q = 0; q < owner.length; q++) {
      const v = list[owner[q]];
      let c = v.c;
      if (v.o < k) c = (k - v.o) * 6 > 1 ? glow : deep;
      else if (v.e < k) c = fshade(v.c, 0.5);
      _c.setHex(c);
      colA.setXYZ(q, _c.r, _c.g, _c.b);
    }
    colA.needsUpdate = true;
  };
  // hatched: the shell, hollow, broken along a zigzag; the bottom stays, the cap comes off
  const cutT = (x, z) => { const a = Math.atan2(z + 0.5 - ECZ, x + 0.5 - ECX); const tw = ((a / TAU) * 9 + 9) % 1; return 0.6 + (Math.abs(tw - 0.5) * 2 - 0.5) * 0.14; };
  const half = [], top = [];
  const inShell = (x, y, z) => inEgg(x, y, z) && !inEgg(x, y, z, 1.6);
  for (let z = 0; z < EW; z++) for (let y = 0; y < EH; y++) for (let x = 0; x < EW; x++) {
    if (!inShell(x, y, z)) continue;
    const t = (y + 0.5) / EH, ct = cutT(x, z);
    const s = list[surf.get(key(x, y, z))];
    const c = s ? s.c : S[1];
    if (t < ct) half.push({ x, y, z, c, rim: t > ct - 1.6 / EH });
    else if (t > ct + 1.2 / EH) top.push({ x, y, z, c, rim: t < ct + 2.6 / EH });
  }
  const hk = new Set(half.map((v) => key(v.x, v.y, v.z))), tk = new Set(top.map((v) => key(v.x, v.y, v.z)));
  const innerCol = (v, f) => (inEgg(v.x + f.n[0], v.y + f.n[1], v.z + f.n[2], 1.6) ? (f.n[1] > 0 ? fshade(spec.inner, 0.92) : spec.inner) : v.rim && f.n[1] > 0 ? fshade(v.c, 0.8) : undefined);
  const halfGeo = meshFaces(half, (x, y, z) => hk.has(key(x, y, z)), innerCol).geo;
  const topGeo = meshFaces(top, (x, y, z) => tk.has(key(x, y, z)), innerCol).geo;
  return {
    geo, setCrack, half: halfGeo, top: topGeo, height: EH * EV, radius: ER * EV,
    pip: new THREE.Vector3((pv.x + 0.5 - ECX) * EV, (pv.y + 0.5) * EV, (pv.z + 1 - ECZ) * EV),
    dispose() { geo.dispose(); halfGeo.dispose(); topGeo.dispose(); },
  };
}

/**
 * A ground nest for one big egg (1/64 m): a shallow dish of straw, moss and down inside a ring of
 * twigs laid round and across, a few sticking out, a feather and a curl of old shell tucked in.
 * r: the ring's outer radius (m). Pivot: the middle, on the ground.
 */
export function nestGeo(seed = 7, { r = 0.24, straw = 1 } = {}) {
  const K = 64;
  const rng = makeRng(seed);
  const RO = r * K, RI = RO * 0.56;
  const W = Math.ceil(RO * 2 + 12), H = Math.ceil(0.13 * K), D = W, cx = W / 2, cz = D / 2;
  const g = new VoxelGrid(W, H, D);
  const BARK = [0x2e2016, 0x423022, 0x5a4430, 0x74583e, 0x8e7254];
  const STRAW = [0x7a6a40, 0x9a8a56, 0xb4a46c, 0xcab882];
  const MOSS = [0x4e7634, 0x5a8238, 0x668e40];
  const dishY = (d) => Math.round(1 + Math.min(1.6, d / RI) ** 2 * 2.4);
  const rimY = (d) => Math.max(0, Math.min(dishY(d), Math.round(1 + ((RO * 0.98 - d) / (RO * 0.3)) * dishY(RO * 0.7))));
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (d > RO * 0.96) continue;
    // (the outside of the ring slopes down to the ground: a heap of twigs and straw, not a basket)
    const dish = rimY(d);
    for (let y = 0; y <= Math.min(H - 1, dish); y++) {
      const h = hash3(x, y, z, seed);
      let c = h < 0.55 * straw ? STRAW[(hash3(x >> 1, y, z, seed + 1) * 4) | 0] : h < 0.78 ? MOSS[(hash3(x, y, z, 3) * 3) | 0] : h < 0.86 ? 0xdcd2bc : BARK[2];
      if (d < RI * 0.8 && y === dish && hash3(x >> 1, 0, z >> 1, seed + 7) < 0.4) c = 0xf2ecde; // down
      g.set(x, y, z, c);
    }
  }
  // twigs round the ring, criss-crossing, a few sticking out
  const twig = (a0, r0, len, tone0) => {
    const j = rng.range(-0.7, 0.7) + (rng() < 0.5 ? Math.PI : 0);
    const tx = -Math.sin(a0), tz = Math.cos(a0);
    const dx = tx * Math.cos(j) - Math.cos(a0) * Math.sin(j) * 0.6, dz = tz * Math.cos(j) - Math.sin(a0) * Math.sin(j) * 0.6;
    const dl = Math.hypot(dx, dz) || 1;
    const x0 = cx + Math.cos(a0) * r0, z0 = cz + Math.sin(a0) * r0;
    const y0 = rimY(r0) + rng.range(0, 2.5), dy = rng.range(-1.5, 2);
    const steps = Math.ceil(len * 1.4);
    for (let s = 0; s <= steps; s++) {
      const k = s / steps, u = k * len;
      const x = x0 + (dx / dl) * u, z = z0 + (dz / dl) * u;
      const y = Math.min(H - 1, y0 + dy * k + Math.sin(k * 6 + a0) * 0.5);
      if (Math.hypot(x - cx, z - cz) < RI * 0.88) continue; // (keeps out of the egg's bed)
      g.set(x, y, z, k > 0.95 || k < 0.04 ? BARK[4] : BARK[clamp(Math.round(tone0 + Math.sin(s * 0.9) * 0.6), 0, 4)]);
    }
  };
  const n = Math.round(46 * (r / 0.24) ** 2);
  for (let i = 0; i < n; i++) twig(rng() * TAU, rng.range(RI * 1.02, RO * 0.96), rng.range(5, 12), rng.range(0.6, 3.2));
  // a striped feather and a curl of old shell on the rim
  {
    const a = rng() * TAU, x0 = cx + Math.cos(a) * RO * 0.8, z0 = cz + Math.sin(a) * RO * 0.8;
    for (let s = 0; s < 9; s++) { const x = x0 + Math.cos(a + 1.3) * s * 0.9, z = z0 + Math.sin(a + 1.3) * s * 0.9; g.set(x, Math.min(H - 1, 4 + s * 0.2), z, s % 3 ? 0x6a5a48 : 0xd8ccb4); if (s > 1 && s < 8) g.set(x + Math.cos(a) * 0.9, Math.min(H - 1, 4 + s * 0.2), z + Math.sin(a) * 0.9, s % 2 ? 0x8a7a64 : 0xe8dcc4); }
    const b = a + 2.4, sx = cx + Math.cos(b) * RO * 0.74, sz = cz + Math.sin(b) * RO * 0.74;
    for (let q = 0; q < 6; q++) g.set(sx + (q % 3), 4 + (q > 2 ? 1 : 0), sz + (q % 2), q === 4 ? EGG_SPEC.spot[1] : EGG_SPEC.shell[2]);
  }
  return meshVoxGreedy(g, { scale: 1 / K, pivot: [cx, 0, cz] });
}

/**
 * The egg wrapped in his kerchief (1/96 m): rust-red cloth with cream spots gathered up round the
 * egg to just over its middle, folds pulled taut, the corners knotted on one side; the top of the
 * shell shows above it. Pivot: the foot.
 */
export function bundleGeo(seed = 5) {
  const W = EW + 6, H = EH + 6, cx = W / 2, cz = W / 2;
  const g = new VoxelGrid(W, H, W);
  const CLOTH = [0x8a2e22, 0xa83a2a, 0xc04a32], SPOT = 0xf0dcb4;
  const ox = (W - EW) / 2;
  for (let z = 0; z < W; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ex = x - ox, ez = z - ox;
    const t = (y + 0.5) / EH;
    const egg = inEgg(ex, y, ez);
    const rr = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    const a = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
    // the cloth: a hand's thickness round the egg, up to a wavy hem a little over the middle
    const hem = 0.66 + Math.sin(a * 5 + seed) * 0.05;
    const cloth = t < hem && t > -0.02 && !egg && rr <= eggR(clamp(t, 0.02, 0.98)) + 1.3 + (t < 0.08 ? 0.6 : 0) && y < H;
    if (egg && t >= hem - 0.02) {
      // the shell above the hem (speckled like the egg)
      const S = EGG_SPEC.shell, h = hash3(ex, y, ez, 31);
      g.set(x, y, z, h < 0.06 ? EGG_SPEC.spot[1] : t > 0.78 ? S[3] : S[2]);
    } else if (cloth) {
      const fold = Math.sin(a * 7 + t * 9) > 0.55; // folds pulled up to the hem
      let c = fold ? CLOTH[0] : CLOTH[1];
      if (t > hem - 0.05) c = CLOTH[2]; // the rolled hem
      if (((Math.round(a * 6) + Math.round(t * 9)) & 1) && hash3(x >> 1, y >> 1, z >> 1, seed) < 0.3) c = SPOT;
      g.set(x, y, z, c);
    }
  }
  // the knot and the two ears of the kerchief on one side (+x), above the hem
  const ky = Math.round(EH * 0.62), kx = Math.round(cx + eggR(0.62) + 1);
  g.ellipsoid(kx, ky, cz, 2.2, 2.0, 2.2, (x, y) => (y > ky ? CLOTH[2] : CLOTH[0]));
  for (let s = 1; s <= 5; s++) {
    g.set(kx + 1 + s * 0.5, ky + 1 + s, cz - 1 - s * 0.3, s === 5 ? CLOTH[0] : CLOTH[1]); g.set(kx + 1 + s * 0.5, ky + 1 + s, cz - s * 0.3, CLOTH[2]);
    g.set(kx + 1 + s * 0.6, ky + 1 + s * 0.7, cz + 1 + s * 0.4, s === 5 ? CLOTH[0] : CLOTH[1]); g.set(kx + 1 + s * 0.6, ky + 1 + s * 0.7, cz + 2 + s * 0.4, s % 2 ? SPOT : CLOTH[2]);
  }
  return meshVoxGreedy(g, { scale: EV, pivot: [cx, 0, cz] });
}

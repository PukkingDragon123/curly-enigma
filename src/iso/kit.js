// Modelling kit for the iso props: 1/32-voxel grids, structured material fills
// (wood grain, iron with rivets, stone, cloth, straw, moss), 3D lines for ropes,
// chains, rails and roots, and mesh shortcuts. Colors are sRGB hex.
import * as THREE from 'three';
import { VoxelGrid } from '../gfx/Voxel.js';
import { fastMesh } from './mesher.js';
import { hash2 } from './surface.js';

export { VoxelGrid };
export const S32 = 1 / 32;
export const S16 = 1 / 16;

const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
export const mulc = (c, k) => (cl(((c >> 16) & 255) * k) << 16) | (cl(((c >> 8) & 255) * k) << 8) | cl((c & 255) * k);
export const mixc = (a, b, t) => (cl(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) << 16) | (cl(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) << 8) | cl((a & 255) * (1 - t) + (b & 255) * t);
export const h3 = (x, y, z, s = 0) => hash2(x * 7919 + z * 104729, y, s);
/**
 * Sparse speckle multiplier: 1 for most voxels, 1±a for a fraction p of them. Keeps surfaces
 * textured while letting the greedy mesher merge the plain runs (continuous noise kills merging).
 */
export const sp3 = (x, y, z, s = 0, p = 0.1, a = 0.1) => { const h = h3(x, y, z, s); return h < p / 2 ? 1 - a : h > 1 - p / 2 ? 1 + a : 1; };

// ---------------------------------------------------------------- palettes
export const C = {
  wood: 0x8a5a32, woodD: 0x5a3a22, woodL: 0xb07a4a, woodG: 0x6e5a48, woodR: 0x9a4a2a,
  iron: 0x3a3a44, ironL: 0x5c5c68, ironD: 0x24242a, rust: 0x8a4a2a,
  brass: 0xc8a050, gold: 0xf2c23a, copper: 0xc87a4a,
  stone: 0x8a8078, stoneD: 0x5e564f, stoneL: 0xaaa096,
  rope: 0xc8a878, ropeD: 0x9a7a52, straw: 0xd9b45a, burlap: 0xb89a6a,
  moss: 0x4f7f34, mossL: 0x6a9a44, mossD: 0x355a26,
  glowW: 0xffd890, glowO: 0xffb24a, glowY: 0xfff2c0,
  shroomB: 0x5ad0e0, shroomBL: 0xd8faff, shroomBD: 0x2a7a9a,
};

// ---------------------------------------------------------------- material fills (return fn(x,y,z) → color)
/** Wood with grain running along `axis` ('x'|'y'|'z'), planks `pw` voxels wide across `across`. */
export function wood(base = C.wood, { axis = 'y', across = 'x', pw = 6, seed = 1, knots = true, dark = 0.8 } = {}) {
  const A = { x: 0, y: 1, z: 2 };
  const ai = A[axis], bi = A[across];
  const p = [0, 0, 0];
  return (x, y, z) => {
    p[0] = x; p[1] = y; p[2] = z;
    const along = p[ai], acr = p[bi];
    const plank = Math.floor(acr / pw);
    const inP = acr - plank * pw;
    if (pw > 1 && pw < 99 && inP === 0) return mulc(base, dark); // seam between boards
    const ph = hash2(plank, seed, 3);
    let c = mulc(base, 0.88 + Math.floor(ph * 4) * 0.07);
    // straight grain lines along the board, broken into long streaks
    const line = (inP + Math.floor(ph * 5)) % 3 === 0;
    if (line && hash2(Math.floor(along / 9), acr, seed + 1) < 0.7) c = mulc(c, 0.9);
    if (knots && ph > 0.6) {
      const kp = Math.floor(ph * 977) % 23;
      if (Math.abs((along % 23) - kp) < 1.2 && Math.abs(inP - pw / 2) < 1.2) c = mulc(base, 0.55);
    }
    return c;
  };
}

/** Rough-sawn beam: darker ends/edges, grain along axis. */
export function beam(base = C.woodD, axis = 'y', seed = 2) {
  return wood(base, { axis, across: axis === 'x' ? 'z' : 'x', pw: 99, seed, knots: true });
}

export function iron(base = C.iron, seed = 3) {
  return (x, y, z) => {
    const h = h3(x, y, z, seed);
    return h > 0.975 ? mixc(base, C.rust, 0.6) : h < 0.03 ? mulc(base, 1.18) : base;
  };
}

export function stone(base = C.stone, { seed = 4, block = 0, mortar = 0x4a423c } = {}) {
  return (x, y, z) => {
    if (block) {
      const row = Math.floor(y / block), off = (row % 2) * Math.floor(block * 0.9);
      if (y % block === 0 || ((x + z + off) % (block * 2)) === 0) return mortar;
      const bh = hash2(Math.floor((x + z + off) / (block * 2)), row, seed);
      return mulc(base, (0.88 + Math.floor(bh * 4) * 0.07) * sp3(x, y, z, seed, 0.08, 0.1));
    }
    const h = hash2(Math.floor((x + z) / 3), y >> 1, seed);
    return mulc(base, (0.9 + Math.floor(h * 3) * 0.07) * sp3(x, y, z, seed + 1, 0.08, 0.12));
  };
}

export function cloth(base, { stripe = 0, alt = null, seed = 5 } = {}) {
  return (x, y, z) => {
    let c = base;
    if (stripe && alt !== null && Math.floor((x + z) / stripe) % 2) c = alt;
    if (y % 4 === 0) c = mulc(c, 0.95);
    return mulc(c, sp3(x, y, z, seed, 0.06, 0.12));
  };
}

export function straw(seed = 6) {
  return (x, y, z) => {
    const h = hash2(x >> 1, y * 31 + (z >> 1), seed);
    return h < 0.2 ? 0xb8913a : h < 0.6 ? C.straw : h < 0.85 ? 0xe8c870 : 0xc8a04a;
  };
}

export function moss(seed = 7) {
  return (x, y, z) => {
    const h = hash2(x >> 1, y * 17 + (z >> 1), seed);
    return h < 0.3 ? C.mossD : h < 0.75 ? C.moss : h < 0.97 ? C.mossL : 0xf0e070;
  };
}

// ---------------------------------------------------------------- shape helpers
/** Fill voxels along a 3D polyline with radius r (voxel units). col: color or fn(x,y,z,t). */
export function line(g, pts, r, col) {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.max(1, Math.ceil(L * 2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      const tt = total ? (acc + L * t) / total : 0;
      const rr = typeof r === 'function' ? r(tt) : r;
      if (rr <= 0.5) { g.set(Math.round(x - 0.5), Math.round(y - 0.5), Math.round(z - 0.5), typeof col === 'function' ? col(Math.round(x - 0.5), Math.round(y - 0.5), Math.round(z - 0.5), tt) : col); continue; }
      for (let zz = Math.floor(z - rr); zz <= Math.ceil(z + rr); zz++) for (let yy = Math.floor(y - rr); yy <= Math.ceil(y + rr); yy++) for (let xx = Math.floor(x - rr); xx <= Math.ceil(x + rr); xx++) {
        if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 + (zz + 0.5 - z) ** 2 <= rr * rr) g.set(xx, yy, zz, typeof col === 'function' ? col(xx, yy, zz, tt) : col);
      }
    }
    acc += L;
  }
  return g;
}

/** Catenary-ish sag points between a and b (voxel coords). */
export function sag(a, b, n, depth) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * depth, a[2] + (b[2] - a[2]) * t]);
  }
  return pts;
}

/** Hollow cylinder wall (staves/rings) along y. */
export function ring(g, cx, cz, r0, r1, y0, y1, col) {
  for (let y = y0; y < y1; y++) for (let z = Math.floor(cz - r1); z <= Math.ceil(cz + r1); z++) for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
    const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (d <= r1 && d >= r0) g.set(x, y, z, typeof col === 'function' ? col(x, y, z, Math.atan2(z + 0.5 - cz, x + 0.5 - cx)) : col);
  }
  return g;
}

// ---------------------------------------------------------------- level of detail
let LOW = 0;
/**
 * Build with every 1/32 mesh (M32/G32) downsampled to 1/16: for small, repeated background
 * decor (mushroom clumps, crystals, roots...) that never gets a close look. ~4x fewer faces.
 */
export function lowRes(fn) { LOW++; try { return fn(); } finally { LOW--; } }

/**
 * Halve a grid: each 2x2x2 block becomes one voxel when at least `min` of its cells are set,
 * taking its most common color (ties go to the top/front cells, the ones the camera sees).
 */
export function half(g, min = 2) {
  const W = Math.ceil(g.w / 2), H = Math.ceil(g.h / 2), D = Math.ceil(g.d / 2);
  const out = new VoxelGrid(W, H, D);
  const src = g.data, gw = g.w, gh = g.h, gd = g.d, dst = out.data;
  const cols = new Uint32Array(8), cnt = new Uint8Array(8);
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let n = 0, k = 0;
    for (let dz = 1; dz >= 0; dz--) {
      const sz = z * 2 + dz;
      if (sz >= gd) continue;
      for (let dy = 1; dy >= 0; dy--) {
        const sy = y * 2 + dy;
        if (sy >= gh) continue;
        const row = gw * (sy + gh * sz);
        for (let dx = 1; dx >= 0; dx--) {
          const sx = x * 2 + dx;
          if (sx >= gw) continue;
          const v = src[sx + row];
          if (!v) continue;
          n++;
          let j = 0;
          while (j < k && cols[j] !== v) j++;
          if (j === k) { cols[k] = v; cnt[k] = 0; k++; }
          cnt[j]++;
        }
      }
    }
    if (n < min) continue;
    let best = 0;
    for (let j = 1; j < k; j++) if (cnt[j] > cnt[best]) best = j;
    dst[x + W * (y + H * z)] = cols[best];
  }
  return out;
}

// ---------------------------------------------------------------- meshes
/** Lit mesh at 1/32 (pivot bottom-center by default). Inside lowRes() it is built at 1/16. */
export function M32(g, pivot, o = {}) {
  const pv = pivot ?? [g.w / 2, 0, g.d / 2];
  if (LOW && !o.scale) return fastMesh(half(g), { scale: S16, pivot: pv.map((v) => v / 2), kind: 'toon', outline: o.outline !== false, view: o.view });
  return fastMesh(g, { scale: o.scale ?? S32, pivot: pv, kind: 'toon', outline: o.outline !== false, view: o.view });
}
/** Glowing (unlit) mesh at 1/32 (1/16 inside lowRes()). */
export function G32(g, pivot, o = {}) {
  const pv = pivot ?? [g.w / 2, 0, g.d / 2];
  if (LOW && !o.scale) return fastMesh(half(g, 1), { scale: S16, pivot: pv.map((v) => v / 2), kind: 'basic', shade: true, outline: o.outline ?? false, view: o.view });
  return fastMesh(g, { scale: o.scale ?? S32, pivot: pv, kind: 'basic', shade: true, outline: o.outline ?? false, view: o.view });
}
/** Lit mesh at 1/16. */
export function M16(g, pivot, o = {}) { return fastMesh(g, { scale: S16, pivot: pivot ?? [g.w / 2, 0, g.d / 2], kind: 'toon', outline: o.outline !== false, view: o.view }); }
export function G16(g, pivot, o = {}) { return fastMesh(g, { scale: S16, pivot: pivot ?? [g.w / 2, 0, g.d / 2], kind: 'basic', shade: true, outline: o.outline ?? false, view: o.view }); }

/** Group helper. */
export function group(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}

/** Position a mesh in voxel coordinates of a parent grid (scale s, parent pivot bottom-center). */
export function at(mesh, x, y, z, s = S32) { mesh.position.set(x * s, y * s, z * s); return mesh; }

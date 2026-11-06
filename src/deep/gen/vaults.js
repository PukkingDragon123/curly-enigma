// The giant caverns, dressed (the shapes are gen/network.js: planVaults / vault / vaultFloor).
//
// Plan time (dressVaults): a vault's lake becomes a 'lake' feature (basin: the water fills the
// cavern's own basin below its level; the flow sim treats it as a reservoir like any lake), a
// danger for the radar, and lava's glow; falls pour from cracks in the roof into the lake (a sheet
// of water voxels from the roof down to the surface: the mesher draws it as falling water, the sim
// leaves it be until something breaks it); glowing crystal clusters grow from the walls and the roof
// (hexagonal prisms with pointed tips, voxel by voxel) and light the hall (plan.lights: the post
// pass draws light shafts toward the brightest one in a tall hall).
//
// Chunk time (vaultColumns + vaultSolid, from the generator's fill loop): the stalactite forests
// (patchy; a stalagmite under many of them where the drip lands, some grown together into
// columns), fluted columns from floor to roof, as voxel shapes with rings, a lean, a drip bulb at
// a stalactite's tip and a flared "fried egg" base under a stalagmite. Pure and deterministic.
import { M } from '../materials.js';
import { h3 } from '../noise.js';
import { makeRng } from '../../core/util.js';
import { lakeDist, vaultSpan, inVaultLake } from './network.js';

/** Giant caverns per depth band (zone): how many, lake chance and what fills it, size, forests. */
export const VAULT_BANDS = [
  { zone: 1, d0: 12, d1: 22, n: 1, lake: 0.9, fluid: 'water', big: 0.85, stal: 0.8 },
  { zone: 2, d0: 29, d1: 52, n: 2, lake: 0.8, fluid: 'water', big: 1 },
  { zone: 3, d0: 60, d1: 87, n: 2, lake: 0.75, fluid: 'water', big: 1.05, stal: 1.25 },
  { zone: 4, d0: 95, d1: 127, n: 2, lake: 0.65, fluid: 'lava', big: 1.05, stal: 0.6 },
  { zone: 5, d0: 135, d1: 167, n: 2, lake: 0.6, fluid: 'water', big: 1, stal: 1.1 },
  { zone: 6, d0: 175, d1: 205, n: 1, lake: 0.5, fluid: 'lava', big: 1.1, stal: 0.7 },
];

// per zone: what hangs from the roof and grows from the floor, the crystals and their light
const ZDRESS = [
  null,
  { stal: M.FLOWSTONE, mite: M.FLOWSTONE, cry: M.CRYSTAL_GREEN, light: [0.32, 0.9, 0.55] },
  { stal: M.FLOWSTONE, mite: M.FLOWSTONE, cry: M.CRYSTAL_AMBER, light: [1.0, 0.66, 0.26] },
  { stal: M.FLOWSTONE, mite: M.FLOWSTONE, cry: M.CRYSTAL, light: [0.55, 0.5, 1.1] },
  { stal: M.BASALT, mite: M.OBSIDIAN, cry: M.CRYSTAL_FIRE, light: [1.25, 0.42, 0.14] },
  { stal: M.ICE, mite: M.ICE, cry: M.CRYSTAL_ICE, light: [0.45, 0.75, 1.15] },
  { stal: M.VOIDROCK, mite: M.STARROCK, cry: M.CRYSTAL_VOID, light: [0.75, 0.38, 1.25] },
];
export const vaultDress = (v) => ZDRESS[v.zone] || ZDRESS[1];

const G = 1.1; // stalactite cell (m)

/**
 * Plan time: lakes, falls, crystal clusters and their lights, column spans. density: the
 * generator's caveDensity (the shapes are final by now). Appends to plan.features (the lakes),
 * plan.dangers, plan.lights, and fills plan.falls and plan.clusters.
 */
export function dressVaults(plan, density) {
  const V = plan.net?.vaults || [];
  const nz = plan.noise;
  plan.falls = [];
  plan.clusters = [];
  const open = (x, y, z, k = 0.02) => density(plan, x, y, z) > k;
  for (const v of V) {
    const r = makeRng(plan.seed + 3131 + v.id * 97);
    const D = vaultDress(v);
    // columns: the floor and roof each one stands between
    for (const c of v.cols) {
      const f = vaultSpan(v, nz, c.x, c.z, v.y0 + 1).floor;
      c.f = f - 0.4;
      c.rf = vaultSpan(v, nz, c.x, c.z, v.y0 + v.H * 0.75).roof + 1.2;
    }
    if (v.lake) {
      const L = v.lake, fluid = L.fluid === 'lava' ? M.LAVA : M.WATER;
      const rr = Math.max(L.rx, L.rz) * 1.85 + 0.5;
      plan.features.push({ kind: 'lake', basin: true, vault: v.id, x: L.x, y: L.wl, z: L.z, r: rr, wl: L.wl, fluid, shell: 0, depth: L.D + 1.6 });
      plan.dangers.push({ kind: fluid === M.LAVA ? 'lava' : 'water', x: L.x, y: L.wl, z: L.z, r: Math.max(L.rx, L.rz), zone: v.zone, vault: v.id });
      if (fluid === M.LAVA) plan.lights.push({ x: L.x, y: L.wl + 0.7, z: L.z, c: [1.6, 0.55, 0.16], r: Math.max(L.rx, L.rz) * 1.9, lava: true, vault: v.id });
      // falls from cracks in the roof into the lake
      const want = fluid === M.LAVA ? 1 : r() < 0.7 ? 2 : 1;
      for (let k = 0, made = 0; k < 18 && made < want; k++) {
        const a = r() * 6.283, d = r.range(0.4, 0.82);
        const u = Math.cos(a) * L.rx * d, w = Math.sin(a) * L.rz * d;
        const x = L.x + u * L.c - w * L.s, z = L.z + u * L.s + w * L.c;
        if (lakeDist(L, nz, x, z) > 0.88) continue;
        if (v.cols.some((c) => Math.hypot(c.x - x, c.z - z) < c.r * 1.9 + 0.8)) continue;
        if (plan.falls.some((f) => Math.hypot(f.x - x, f.z - z) < 4)) continue;
        let y = L.wl + 0.4, ok = true, i = 0;
        for (; y < v.y0 + v.H + 4; y += 0.3, i++) {
          if (!open(x, y, z, 0.03)) break;
          if (i % 3 === 0 && (!open(x + 0.35, y, z, 0) || !open(x - 0.35, y, z, 0) || !open(x, y, z + 0.35, 0) || !open(x, y, z - 0.35, 0))) { ok = false; break; }
        }
        if (!ok || y - L.wl < 4 || open(x, y + 0.7, z, 0)) continue; // a roof right over it
        const hw = r.range(0.1, 0.26), ht = r.range(0.045, 0.08), pad = hw + 0.2;
        plan.falls.push({ x, z, yb: L.wl - 0.3, yt: y + 0.5, a: r() * Math.PI, hw, ht, fluid, seed: r.int(1, 1e6), vault: v.id, bb: [x - pad, L.wl - 0.4, z - pad, x + pad, y + 0.6, z + pad] });
        made++;
      }
    }
    // glowing crystal clusters on the walls and the roof (and the light they give)
    const nCl = r.int(2, 4);
    for (let k = 0, tries = 0; k < nCl && tries < 24; tries++) {
      let ax, ay, az, nx, ny, nzz;
      if (r() < 0.35) {
        const a = r() * 6.283, d = r.range(0.1, 0.55);
        const x = v.x + Math.cos(a) * v.Rx * d, z = v.z + Math.sin(a) * v.Rz * d;
        let y = v.y0 + 2.5;
        if (!open(x, y, z)) continue;
        for (; y < v.y0 + v.H + 4; y += 0.4) if (!open(x, y, z, 0)) break;
        if (open(x, y, z, 0)) continue;
        ax = x; ay = y + 0.05; az = z; nx = 0; ny = -1; nzz = 0;
      } else {
        const a = r() * 6.283, y = v.y0 + r.range(1.4, v.H * 0.55);
        const dx = Math.cos(a), dz = Math.sin(a);
        let t = 1, found = false;
        for (; t < v.Rm * 1.6; t += 0.4) {
          if (!open(v.x + dx * t, y, v.z + dz * t, 0)) { found = t > 2; break; }
        }
        if (!found) continue;
        ax = v.x + dx * t; ay = y; az = v.z + dz * t;
        const l = Math.hypot(1, 0.3); nx = -dx / l; ny = 0.3 / l; nzz = -dz / l;
      }
      if (inVaultLake(v, nz, ax, ay - 0.8, az)) continue;
      if (plan.clusters.some((c) => Math.hypot(c.x - ax, c.y - ay, c.z - az) < 6)) continue;
      if (plan.falls.some((f) => Math.hypot(f.x - ax, f.z - az) < 2.5)) continue;
      const cl = makeCluster(ax, ay, az, nx, ny, nzz, D.cry, r, 1);
      cl.vault = v.id;
      plan.clusters.push(cl);
      const L = D.light, s = r.range(0.75, 1.05);
      plan.lights.push({ x: ax + nx * 1.1, y: ay + ny * 1.1, z: az + nzz * 1.1, c: [L[0] * s, L[1] * s, L[2] * s], r: r.range(8, 11), crystal: true, vault: v.id });
      k++;
    }
  }
}

/**
 * A cluster of crystals growing out of a rock face at (x, y, z) with outward normal n: hexagonal
 * prisms with pointed terminations, a big one or two and a spray of smaller ones. size scales it.
 */
export function makeCluster(x, y, z, nx, ny, nz, m, rng, size = 1) {
  const prisms = [];
  const n = Math.round(rng.range(7, 13) * Math.min(1.3, size));
  let bx0 = 1e9, by0 = 1e9, bz0 = 1e9, bx1 = -1e9, by1 = -1e9, bz1 = -1e9;
  // two directions across the face
  let tx = Math.abs(ny) > 0.8 ? 1 : 0, ty = Math.abs(ny) > 0.8 ? 0 : 1, tz = 0;
  let ux = ny * tz - nz * ty, uy = nz * tx - nx * tz, uz = nx * ty - ny * tx;
  let ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  for (let i = 0; i < n; i++) {
    const big = i < 2;
    const len = (big ? rng.range(1.1, 2.3) : rng.range(0.35, 1.3)) * size;
    const r = Math.max(0.05, len * rng.range(0.1, 0.15));
    // tilted away from the face's normal, the small ones more
    const sp = big ? 0.35 : 0.85;
    let ax = nx + (rng() - 0.5) * 2 * sp, ay = ny + (rng() - 0.5) * 2 * sp, az = nz + (rng() - 0.5) * 2 * sp;
    let al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
    if (ax * nx + ay * ny + az * nz < 0.35) { ax = (ax + nx) / 2; ay = (ay + ny) / 2; az = (az + nz) / 2; al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al; }
    const o1 = (rng() - 0.5) * (big ? 0.3 : 0.9) * size, o2 = (rng() - 0.5) * (big ? 0.3 : 0.9) * size;
    // the root a little way into the rock
    const bx = x + ux * o1 + vx * o2 - ax * 0.3, by = y + uy * o1 + vy * o2 - ay * 0.3, bz = z + uz * o1 + vz * o2 - az * 0.3;
    // across-axes of the prism (a random turn round its axis)
    let ex = Math.abs(ay) > 0.85 ? 1 : 0, ey = Math.abs(ay) > 0.85 ? 0 : 1, ez = 0;
    let e1x = ey * az - ez * ay, e1y = ez * ax - ex * az, e1z = ex * ay - ey * ax;
    const el = Math.hypot(e1x, e1y, e1z) || 1; e1x /= el; e1y /= el; e1z /= el;
    const e2x = ay * e1z - az * e1y, e2y = az * e1x - ax * e1z, e2z = ax * e1y - ay * e1x;
    const tw = rng() * Math.PI / 3, ct = Math.cos(tw), st = Math.sin(tw);
    const p = {
      bx, by, bz, ax, ay, az, len: len + 0.3, r,
      e1x: e1x * ct + e2x * st, e1y: e1y * ct + e2y * st, e1z: e1z * ct + e2z * st,
      e2x: -e1x * st + e2x * ct, e2y: -e1y * st + e2y * ct, e2z: -e1z * st + e2z * ct,
    };
    const tx2 = bx + ax * p.len, ty2 = by + ay * p.len, tz2 = bz + az * p.len, pr = r * 1.2 + 0.05;
    p.bb = [Math.min(bx, tx2) - pr, Math.min(by, ty2) - pr, Math.min(bz, tz2) - pr, Math.max(bx, tx2) + pr, Math.max(by, ty2) + pr, Math.max(bz, tz2) + pr];
    bx0 = Math.min(bx0, p.bb[0]); by0 = Math.min(by0, p.bb[1]); bz0 = Math.min(bz0, p.bb[2]);
    bx1 = Math.max(bx1, p.bb[3]); by1 = Math.max(by1, p.bb[4]); bz1 = Math.max(bz1, p.bb[5]);
    prisms.push(p);
  }
  return { x, y, z, m, prisms, bb: [bx0, by0, bz0, bx1, by1, bz1] };
}

/**
 * Stamp crystal clusters into a chunk (into open air, and their roots into natural rock: host[m]).
 * VOX: voxels per metre.
 */
export function stampClusters(list, vox, X0, Y0, Z0, CS, VOX, host) {
  if (!list || !list.length) return;
  const cx0 = X0 / VOX, cy0 = Y0 / VOX, cz0 = Z0 / VOX, cm = CS / VOX;
  for (const cl of list) {
    const B = cl.bb;
    if (B[3] < cx0 || B[0] > cx0 + cm || B[4] < cy0 || B[1] > cy0 + cm || B[5] < cz0 || B[2] > cz0 + cm) continue;
    for (const p of cl.prisms) {
      const b = p.bb;
      const lx0 = Math.max(0, Math.floor(b[0] * VOX) - X0), lx1 = Math.min(CS, Math.ceil(b[3] * VOX) - X0);
      const ly0 = Math.max(0, Math.floor(b[1] * VOX) - Y0), ly1 = Math.min(CS, Math.ceil(b[4] * VOX) - Y0);
      const lz0 = Math.max(0, Math.floor(b[2] * VOX) - Z0), lz1 = Math.min(CS, Math.ceil(b[5] * VOX) - Z0);
      if (lx0 >= lx1 || ly0 >= ly1 || lz0 >= lz1) continue;
      const len = p.len, r = p.r;
      for (let z = lz0; z < lz1; z++) for (let y = ly0; y < ly1; y++) for (let x = lx0; x < lx1; x++) {
        const qx = (X0 + x + 0.5) / VOX - p.bx, qy = (Y0 + y + 0.5) / VOX - p.by, qz = (Z0 + z + 0.5) / VOX - p.bz;
        const t = qx * p.ax + qy * p.ay + qz * p.az;
        if (t < 0 || t > len) continue;
        const rx = qx - p.ax * t, ry = qy - p.ay * t, rz = qz - p.az * t;
        const a1 = rx * p.e1x + ry * p.e1y + rz * p.e1z, a2 = rx * p.e2x + ry * p.e2y + rz * p.e2z;
        // a hexagon (apothem re): the largest of the three face distances
        const d = Math.max(Math.abs(a1), Math.abs(0.5 * a1 + 0.866 * a2), Math.abs(0.5 * a1 - 0.866 * a2));
        // a slight taper, then a six-sided point
        const re = Math.min(r * (1 - 0.16 * t / len), (len - t) * 0.6);
        if (d > re) continue;
        const vi = x + CS * (y + CS * z), cur = vox[vi];
        if (cur === 0 || (t < 0.45 && host[cur])) vox[vi] = cl.m;
      }
    }
  }
}

/** Plan time: falls into a chunk: a wavering sheet of fluid from the roof crack to the lake. */
export function stampFalls(list, vox, X0, Y0, Z0, CS, VOX, host) {
  if (!list || !list.length) return;
  const cx0 = X0 / VOX, cy0 = Y0 / VOX, cz0 = Z0 / VOX, cm = CS / VOX;
  for (const f of list) {
    const b = f.bb;
    if (b[3] < cx0 || b[0] > cx0 + cm || b[4] < cy0 || b[1] > cy0 + cm || b[5] < cz0 || b[2] > cz0 + cm) continue;
    const lx0 = Math.max(0, Math.floor(b[0] * VOX) - X0), lx1 = Math.min(CS, Math.ceil(b[3] * VOX) - X0);
    const ly0 = Math.max(0, Math.floor(b[1] * VOX) - Y0), ly1 = Math.min(CS, Math.ceil(b[4] * VOX) - Y0);
    const lz0 = Math.max(0, Math.floor(b[2] * VOX) - Z0), lz1 = Math.min(CS, Math.ceil(b[5] * VOX) - Z0);
    const ca = Math.cos(f.a), sa = Math.sin(f.a);
    for (let y = ly0; y < ly1; y++) {
      const ym = (Y0 + y + 0.5) / VOX;
      if (ym < f.yb || ym > f.yt) continue;
      // the sheet sways a little and frays as it falls
      const k = (f.yt - ym) / Math.max(1, f.yt - f.yb);
      const sx = Math.sin(ym * 0.9 + f.seed) * 0.06 * k, hw = f.hw * (1 + 0.35 * k) * (0.9 + 0.2 * Math.sin(ym * 2.3 + f.seed * 0.7));
      for (let z = lz0; z < lz1; z++) for (let x = lx0; x < lx1; x++) {
        const dx = (X0 + x + 0.5) / VOX - f.x - sx, dz = (Z0 + z + 0.5) / VOX - f.z;
        const al = dx * ca + dz * sa, ac = -dx * sa + dz * ca;
        if (Math.abs(al) > hw || Math.abs(ac) > f.ht + k * 0.03) continue;
        const vi = x + CS * (y + CS * z), cur = vox[vi];
        if (cur === 0 || (ym > f.yt - 0.55 && host[cur])) vox[vi] = f.fluid;
      }
    }
  }
}

/**
 * Per chunk: the stalactites, stalagmites and columns over each (x, z) column of the chunk, or
 * null when no vault reaches it. out: a reusable record (makeColumns()).
 */
export function makeColumns(CS) {
  const n = CS * CS, F = () => new Float32Array(n);
  return { v: null, has: new Uint8Array(n), cx: F(), cz: F(), rb: F(), L: F(), root: F(), lx: F(), lz: F(), ph: F(), mrb: F(), mL: F(), mroot: F(), col: new Int16Array(n), cd: F(), ca: F(),
    t0: F(), t1: F(), m0: F(), m1: F(), mat: 0, mite: 0 };
}

export function vaultColumns(plan, X0, Y0, Z0, CS, VOX, out) {
  const V = plan.net?.vaults;
  if (!V || !V.length) return null;
  const cx0 = X0 / VOX, cy0 = Y0 / VOX, cz0 = Z0 / VOX, cm = CS / VOX;
  let v = null;
  for (const q of V) {
    if (cx0 + cm < q.x0 || cx0 > q.x1 || cz0 + cm < q.z0 || cz0 > q.z1 || cy0 + cm < q.yb0 || cy0 > q.yb1) continue;
    v = q; break;
  }
  if (!v) return null;
  const nz = plan.noise, seed = plan.seed + v.id * 131;
  const D = vaultDress(v);
  out.v = v; out.mat = D.stal; out.mite = D.mite;
  out.has.fill(0);
  // each column's profile (foot and head flares) by voxel height in this chunk
  if (!out.prof || out.prof.length < v.cols.length * CS) out.prof = new Float32Array(Math.max(8, v.cols.length) * CS);
  out.Y0 = Y0;
  for (let k = 0; k < v.cols.length; k++) {
    const c = v.cols[k];
    for (let y = 0; y < CS; y++) {
      const ym = (Y0 + y) / VOX, t = Math.max(0, Math.min(1, (ym - c.f) / (c.rf - c.f)));
      out.prof[k * CS + y] = ym > c.f - 1 && ym < c.rf ? c.r * (0.72 + 0.55 * (Math.exp(-t * 7) + Math.exp(-(1 - t) * 6))) : -1;
    }
  }
  const falls = (plan.falls || []).filter((f) => f.vault === v.id);
  // cell spikes, cached per chunk (roof and floor under each looked up once)
  const cells = new Map();
  const cell = (ix, iz) => {
    const key = ix * 100003 + iz;
    let c = cells.get(key);
    if (c !== undefined) return c;
    c = null;
    const hp = h3(ix, iz, 7, seed);
    const sx = (ix + 0.5 + (h3(ix, iz, 1, seed) - 0.5) * 0.5) * G, sz = (iz + 0.5 + (h3(ix, iz, 2, seed) - 0.5) * 0.5) * G;
    const dx = sx - v.x, dz = sz - v.z;
    const hh = Math.hypot((dx * v.c + dz * v.s) * v.iRx, (-dx * v.s + dz * v.c) * v.iRz);
    const forest = v.stal * (0.3 + 1.4 * Math.max(0, nz[2].n(sx * 0.09 + v.ph, 5.5, sz * 0.09)));
    if (hh < 0.93 && hp < forest && !falls.some((f) => Math.hypot(f.x - sx, f.z - sz) < f.hw + 0.9)) {
      const s1 = vaultSpan(v, nz, sx, sz, v.y0 + v.H * 0.75);
      const s0 = vaultSpan(v, nz, sx, sz, v.y0 + 1);
      const gap = s1.roof - s0.floor;
      if (gap > 2.2) {
        const hl = h3(ix, iz, 3, seed), hr = h3(ix, iz, 4, seed);
        const L = Math.min(gap * 0.8, 0.45 + hl * hl * v.stalL);
        const rb = 0.07 + L * 0.075 + hr * 0.06;
        const la = h3(ix, iz, 5, seed) * 6.283, lk = (h3(ix, iz, 6, seed) - 0.5) * 0.18 * L;
        c = { sx, sz, rb, L, root: s1.roof + 1.4, lx: Math.cos(la) * lk, lz: Math.sin(la) * lk, ph: hr * 6.283, mrb: 0, mL: 0, mroot: 0 };
        // a stalagmite where its drip lands (not in the lake)
        const dry = !v.lake || inVaultLake(v, nz, sx, s0.floor + 0.05, sz) === false;
        if (dry && h3(ix, iz, 8, seed) < (hh < 0.6 ? 0.65 : 0.4)) {
          c.mL = Math.min(gap - L * 0.6, L * (0.3 + h3(ix, iz, 9, seed) * 0.7) + 0.3);
          c.mrb = rb * 1.35 + 0.04;
          c.mroot = s0.floor - 0.6;
          if (c.mL < 0.25) c.mL = 0;
        }
      }
    }
    cells.set(key, c);
    return c;
  };
  for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
    const i = lx + CS * lz;
    const xm = (X0 + lx + 0.5) / VOX, zm = (Z0 + lz + 0.5) / VOX;
    // a column?
    out.col[i] = -1;
    for (let k = 0; k < v.cols.length; k++) {
      const c = v.cols[k], d = Math.hypot(xm - c.x, zm - c.z);
      if (d < c.r * 1.5 + 0.12) { out.col[i] = k; out.cd[i] = d; out.ca[i] = Math.atan2(zm - c.z, xm - c.x); out.has[i] = 1; break; }
    }
    // the nearest spike reaching over this column
    const ix = Math.floor(xm / G), iz = Math.floor(zm / G);
    let best = null, bk = 1e9;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = cell(ix + dx, iz + dz);
      if (!c) continue;
      const reach = Math.max(c.rb * 1.4, c.mrb * 1.9) + Math.abs(c.lx) + Math.abs(c.lz);
      const d = Math.hypot(xm - c.sx, zm - c.sz);
      if (d < reach && d / reach < bk) { bk = d / reach; best = c; }
    }
    out.t0[i] = out.t1[i] = out.m0[i] = out.m1[i] = 0;
    if (best) {
      out.has[i] = 1;
      out.cx[i] = best.sx; out.cz[i] = best.sz; out.rb[i] = best.rb; out.L[i] = best.L; out.root[i] = best.root;
      out.lx[i] = best.lx; out.lz[i] = best.lz; out.ph[i] = best.ph; out.mrb[i] = best.mrb; out.mL[i] = best.mL; out.mroot[i] = best.mroot;
      // the heights where each could reach over this column (most voxels skip the shapes)
      const d0 = Math.hypot(xm - best.sx, zm - best.sz), lean = Math.abs(best.lx) + Math.abs(best.lz);
      if (d0 - lean < best.rb * 1.25 + 0.04) { out.t0[i] = best.root - 1.4 - best.L * 1.06; out.t1[i] = best.root - 1.4 + 1.5; }
      if (best.mL > 0 && d0 < best.mrb * 1.8 + 0.04) { out.m0[i] = best.mroot + 0.6 - best.mL; out.m1[i] = best.mroot + 0.6 + best.mL; }
      if (out.t0[i] === out.t1[i] && out.m0[i] === out.m1[i] && out.col[i] < 0) out.has[i] = 0;
    } else out.rb[i] = 0;
  }
  return out;
}

/** The material of a formation filling open voxel (xm, ym, zm) over column i (0 = none). */
export function vaultSolid(o, i, xm, ym, zm, jit) {
  if (!o.has[i]) return 0;
  const k = o.col[i];
  if (k >= 0) {
    const pr = o.prof[k * 32 + ((ym * 16 - o.Y0 + 0.5) | 0)];
    if (pr > 0 && o.cd[i] < pr * 1.15 + 0.04) {
      const c = o.v.cols[k], th = o.ca[i];
      // fluted: ribs round it, wider at the foot and the head
      const rr = pr * (1 + 0.1 * Math.sin(c.k * th + c.ph + ym * 0.35) + 0.04 * Math.sin(17 * th + ym * 1.3));
      if (o.cd[i] < rr + jit * 0.04) return o.mat;
    }
  }
  const rb = o.rb[i];
  if (rb > 0) {
    // stalactite: root in the roof, rings down its length, a lean, a drop swelling at the tip
    if (ym > o.t0[i] && ym < o.t1[i]) {
      const L = o.L[i], t = (o.root[i] - 1.4 - ym) / L;
      const tt = t > 0 ? t : 0, lean = tt * tt;
      const d = Math.hypot(xm - o.cx[i] - o.lx[i] * lean, zm - o.cz[i] - o.lz[i] * lean);
      const q = 1 - tt;
      let r = t < 0 ? rb * 1.25 : q > 0 ? rb * q * Math.sqrt(Math.sqrt(q)) * (1 + 0.14 * Math.sin(t * L * 9 + o.ph)) : 0;
      if (t > 0.9) r = Math.max(r, rb * 0.24 * Math.max(0, 1 - Math.abs(t - 0.98) * 9));
      if (d < r + jit * 0.025) return o.mat;
    }
    // stalagmite: blunt, rounded on top, a flared "fried egg" foot
    const mL = o.mL[i];
    if (mL > 0 && ym > o.m0[i] && ym < o.m1[i]) {
      const u = (ym - o.mroot[i] - 0.6) / mL;
      {
        const uu = Math.max(0, u);
        const d = Math.hypot(xm - o.cx[i], zm - o.cz[i]);
        let r = o.mrb[i] * (0.3 + 0.7 * Math.pow(1 - uu, 0.7)) * (1 + 0.1 * Math.sin(uu * mL * 7 + o.ph)) + o.mrb[i] * 0.8 * Math.exp(-uu * 9);
        if (u > 0.8) r *= Math.sqrt(Math.max(0, (1 - u) / 0.2));
        if (d < r + jit * 0.025) return o.mite;
      }
    }
  }
  return 0;
}

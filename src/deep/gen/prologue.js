// Old Star's old copper dig: a natural grotto a short walk from the mine entrance lift (L0), where a
// new miner finds their first copper (the mining lesson, src/deep/FirstDig.js, sends you here; it is
// an ordinary part of the mine afterwards). One layout (prologueLayout) is shared by the stamp below
// (voxels, run by the chunk generator, maybe in a web worker: pure, deterministic, no DOM, imports
// only materials/noise), by the generator (the copper seams are real ore deposits: plan.areas, see
// Generator.js), by the vegetation and by the lesson.
//
// Everything is in meters relative to the feature { kind: 'prologue', x, y, z, to?, lift? } (the
// chamber's floor centre); the lift room (plan.lifts L0) comes from f.lift, or from f.to, which the
// generator puts 1.4 m in from the lift room's north-east corner. Voxel maths goes through VOX.
//
// From the lift: out of the cage south into the old trail (the trails to the trading post and the
// herbalist start there), and on its east side the mouth of an old crawl (head height for a mole)
// that winds east past the lift room, round and down into the grotto: a lumpy cave about 6 × 5 m,
// its walls the mine's own rock. Copper seams stick out of the walls (one in the crawl, a few steps
// from the cage, the rest round the grotto), each in a pocket of soft loam so it's quick to dig
// round. A shell round the crawl and the grotto is kept solid, so random caves never break it.
import { M, VOX, ORE_BASE, granM } from '../materials.js';
import { makeNoise3D } from '../noise.js';

export const PROLOGUE_BB = 10; // meters around the centre this feature may touch (the crawl reaches ~9.5)

const NOISE = makeNoise3D(4242);
const LAYOUTS = new Map();
const POCKET = 0.42; // the loam round each seam (m)

/**
 * The layout in world meters (cached per feature position). Points are { x, y, z }.
 *  o (the grotto's floor centre), lift, box (the grotto), mouth (the crawl's grotto end), corner,
 *  nook (the lift end), crawl [mouth → corner], door (in front of the cage), cage, room (the lift
 *  room box), seams [{ x, y, z, r, q }] (the copper: real deposits, nearest the cage first).
 */
export function prologueLayout(f) {
  const key = `${f.x},${f.y},${f.z},${f.lift ? f.lift.x + ',' + f.lift.z : f.to ? f.to.x + ',' + f.to.z : ''}`;
  let L = LAYOUTS.get(key);
  if (L) return L;
  const o = { x: f.x, y: f.y, z: f.z };
  const P = (x, y, z) => ({ x: o.x + x, y: o.y + y, z: o.z + z });
  const lift = f.lift ? { x: f.lift.x, y: f.lift.y, z: f.lift.z } : f.to ? { x: f.to.x - 1.4, y: f.to.y, z: f.to.z + 1.4 } : { x: o.x - 6, y: o.y + 1.5, z: o.z + 6 };
  const LP = (x, y, z) => ({ x: lift.x + x, y: lift.y + y, z: lift.z + z });
  // the crawl: from the grotto's south-west out past the lift room's east side, then west into the nook
  const mouth = P(-2.25, 0, 2.45);
  const corner = LP(2.75, 0, 2.6);
  const nook = LP(0, 0, 2.6);
  const crawl = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, s = t * t * (3 - 2 * t);
    crawl.push({ x: mouth.x + (corner.x - mouth.x) * t, y: mouth.y + (corner.y - mouth.y) * s, z: mouth.z + (corner.z - mouth.z) * t });
  }
  L = {
    o, lift,
    box: { x0: o.x - 3.4, x1: o.x + 3.4, y0: o.y, y1: o.y + 2.8, z0: o.z - 2.9, z1: o.z + 2.9 },
    mouth, corner, nook, crawl,
    door: LP(0, 0, 1.12),
    cage: LP(0, 0, 0.05),
    room: { x0: lift.x - 1.5, x1: lift.x + 1.5, y0: lift.y, y1: lift.y + 2.3, z0: lift.z - 1.5, z1: lift.z + 1.5 },
    seams: [],
  };
  LAYOUTS.set(key, L);
  // the copper: march out from the open space until it meets rock; a seam sits just inside
  const seam = (x, y, z, dx, dz, r, q, fy) => {
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    for (let d = 0; d < 4; d += 0.02) {
      const px = x + dx * d, pz = z + dz * d;
      if (!carved(L, px, y, pz, px - o.x, y - o.y, pz - o.z)) { L.seams.push({ x: px + dx * 0.07, y, z: pz + dz * 0.07, r, q, nx: -dx, nz: -dz, fy }); return; }
    }
  };
  // one in the crawl, a few steps from the cage (on its outer wall), one half way down, and four round the grotto
  const cA = crawl[5], cB = crawl[6], cM = crawl[3], cN = crawl[4];
  seam(cA.x, cA.y + 0.42, cA.z, -(cB.z - cA.z), cB.x - cA.x, 0.2, 82, cA.y);
  seam(cM.x, cM.y + 0.38, cM.z, cN.z - cM.z, -(cN.x - cM.x), 0.17, 76, cM.y);
  seam(o.x, o.y + 0.55, o.z + 0.45, -1, 0, 0.24, 88, o.y);
  seam(o.x + 0.9, o.y + 0.85, o.z, 0, -1, 0.2, 84, o.y);
  seam(o.x, o.y + 0.5, o.z + 0.8, 1, 0, 0.22, 80, o.y);
  seam(o.x + 0.6, o.y + 0.4, o.z + 0.6, 0.55, 0.83, 0.18, 90, o.y);
  return L;
}

// ---------------------------------------------------------------- the stamp
// distance (xz) from a point to a segment; the parameter lands in SEG_T (no allocations: this runs
// for every voxel of every chunk the layout touches)
let SEG_T = 0;
function d2seg(px, pz, a, b) {
  const ax = b.x - a.x, az = b.z - a.z, l2 = ax * ax + az * az || 1;
  let t = ((px - a.x) * ax + (pz - a.z) * az) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  SEG_T = t;
  const qx = a.x + ax * t - px, qz = a.z + az * t - pz;
  return Math.sqrt(qx * qx + qz * qz);
}

/**
 * What the layout wants at a point (world meters): -1 = leave as generated, 0 = air, else a material.
 * out.shell = true when the point is in the solid shell round the carved space (filled if it is air).
 */
function classify(L, x, y, z, out) {
  const o = L.o;
  const lx = x - o.x, ly = y - o.y, lz = z - o.z;
  out.shell = false;
  const R = L.room;
  if (x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1 && y > R.y0 - 0.2 && y < R.y1 + 0.3) return -1; // the lift room is the generator's
  if (carved(L, x, y, z, lx, ly, lz)) return 0;
  // soft loam round each copper seam (quick to dig round; the ore itself is stamped later, a deposit)
  for (const s of L.seams) {
    const dx = x - s.x, dy = y - s.y, dz = z - s.z;
    if (dx * dx + dy * dy * 1.3 + dz * dz < POCKET * POCKET) return M.LOAM;
  }
  // the solid shell round everything carved
  out.shell = carvedNear(L, x, y, z, lx, ly, lz);
  return -1;
}

/** Is the point inside the dug-out space? */
function carved(L, x, y, z, lx, ly, lz) {
  // the grotto: a lumpy rounded cave with a fairly flat floor and a low, uneven vault
  if (ly > 0 && ly < 3.0 && lx > -3.5 && lx < 3.5 && lz > -3.0 && lz < 3.0) {
    const wob = 1 + NOISE.fbm(x * 1.1, y * 1.4, z * 1.1, 2) * 0.1;
    const nx = lx / (3.1 * wob), nz = lz / (2.6 * wob);
    const nx2 = nx * nx, nz2 = nz * nz;
    const se = nx2 * nx2 * nx2 + nz2 * nz2 * nz2;
    const lim = 1.1 - (ly > 1.6 ? (ly - 1.6) * 0.45 : 0) - (ly < 0.25 ? (0.25 - ly) * 1.2 : 0);
    if (se < lim) {
      if (ly < 1.8) return true; // (never lower than that)
      const ceil = 2.0 + 0.55 * Math.max(0, 1 - nx2 - nz2) + NOISE.n(x * 0.9, 7.3, z * 0.9) * 0.2;
      if (ly < ceil) return true;
    }
  }
  // the crawl: a low tunnel rising toward the lift, then west into the nook
  if (lz > 2.0) {
    const C = L.crawl;
    for (let i = 0; i < C.length - 1; i++) {
      const a = C[i], b = C[i + 1];
      if (y < Math.min(a.y, b.y) - 0.1 || y > Math.max(a.y, b.y) + 1.4) continue;
      const d = d2seg(x, z, a, b);
      if (d > 0.66) continue;
      const fy = a.y + (b.y - a.y) * SEG_T;
      const yy = y - fy;
      if (yy <= 0 || yy > 1.35) continue;
      if (d > 0.46 && d > 0.55 + NOISE.n(x * 2.3, y * 2.3, z * 2.3) * 0.08) continue;
      const roof = yy + Math.max(0, d - 0.25) * 0.5;
      if (roof < 1.1 || roof < 1.18 + NOISE.n(x * 1.9, 5.1, z * 1.9) * 0.08) return true;
    }
    const a = L.corner, N = L.nook;
    const yy = y - a.y;
    if (yy > 0 && yy < 1.4) {
      const d = d2seg(x, z, a, N);
      if (d < 0.66 && d < 0.55 + NOISE.n(x * 2.3, y * 2.3, z * 2.3) * 0.08 && yy < 1.18 - Math.max(0, d - 0.25) * 0.5) return true;
      // the nook: a little wider and taller
      const nx = (x - N.x) / 1.0, nz = (z - (N.z + 0.1)) / 0.62;
      if (yy < 1.3 && nx * nx * nx * nx + nz * nz * nz * nz < 1 - (yy > 1 ? (yy - 1) * 1.5 : 0)) return true;
    }
  }
  return false;
}

/** Within the shell (0.45 m) round the carved space? (bounding shapes, not exact) */
function carvedNear(L, x, y, z, lx, ly, lz) {
  const pad = 0.45;
  if (ly > -pad && ly < 3.0 + pad && lx > -3.5 - pad && lx < 3.5 + pad && lz > -3.0 - pad && lz < 3.0 + pad) return true;
  if (lz > 2.0) {
    const C = L.crawl;
    for (let i = 0; i < C.length - 1; i++) {
      const a = C[i], b = C[i + 1];
      if (y < Math.min(a.y, b.y) - pad || y > Math.max(a.y, b.y) + 1.35 + pad) continue;
      const d = d2seg(x, z, a, b);
      const fy = a.y + (b.y - a.y) * SEG_T;
      if (d < 0.6 + pad && y > fy - pad && y < fy + 1.35 + pad) return true;
    }
    if (d2seg(x, z, L.corner, L.nook) < 1.05 + pad && y > L.nook.y - pad && y < L.nook.y + 1.4 + pad) return true;
  }
  return false;
}

/** Bounding boxes (world meters) of everything the stamp may touch, for quick chunk rejection. */
function boxes(L) {
  if (L.boxes) return L.boxes;
  const o = L.o, out = [];
  out.push([o.x - 4.0, o.y - 0.6, o.z - 3.5, o.x + 4.0, o.y + 3.5, o.z + 3.5]);
  const C = [...L.crawl, L.corner, L.nook];
  for (let i = 0; i < C.length - 1; i++) {
    const a = C[i], b = C[i + 1];
    const p = i === C.length - 2 ? 1.6 : 1.2; // the nook is wider
    out.push([Math.min(a.x, b.x) - p, Math.min(a.y, b.y) - 0.5, Math.max(Math.min(a.z, b.z) - p, L.o.z + 2.0), Math.max(a.x, b.x) + p, Math.max(a.y, b.y) + 1.9, Math.max(a.z, b.z) + p]);
  }
  L.boxes = out;
  return out;
}

const _out = { shell: false };

/**
 * Called by ChunkGen.stamp for the plan feature { kind: 'prologue', x, y, z, to?, lift? }: fills the
 * chunk's voxels (Uint8Array CS³, index x + CS*(y + CS*z), chunk origin X0/Y0/Z0 in voxels).
 */
export function stampPrologue(f, vox, X0, Y0, Z0, CS) {
  const L = prologueLayout(f);
  const cx0 = X0 / VOX, cy0 = Y0 / VOX, cz0 = Z0 / VOX, cx1 = (X0 + CS) / VOX, cy1 = (Y0 + CS) / VOX, cz1 = (Z0 + CS) / VOX;
  // each of the layout's boxes this chunk touches (a voxel in two boxes is classified twice: harmless)
  for (const bx of boxes(L)) {
    if (bx[3] < cx0 || bx[0] > cx1 || bx[4] < cy0 || bx[1] > cy1 || bx[5] < cz0 || bx[2] > cz1) continue;
    const a0 = Math.max(0, Math.floor(bx[0] * VOX) - X0), a1 = Math.min(CS, Math.ceil(bx[3] * VOX) - X0);
    const b0 = Math.max(0, Math.floor(bx[1] * VOX) - Y0), b1 = Math.min(CS, Math.ceil(bx[4] * VOX) - Y0);
    const c0 = Math.max(0, Math.floor(bx[2] * VOX) - Z0), c1 = Math.min(CS, Math.ceil(bx[5] * VOX) - Z0);
    for (let z = c0; z < c1; z++) for (let y = b0; y < b1; y++) for (let x = a0; x < a1; x++) {
      const vi = x + CS * (y + CS * z);
      const cur = vox[vi];
      if (cur === M.BEDROCK || cur === M.BURROW || cur === M.TIMBER || cur === M.BOARDS || cur === M.LANTERN) continue;
      const xm = (X0 + x + 0.5) / VOX, ym = (Y0 + y + 0.5) / VOX, zm = (Z0 + z + 0.5) / VOX;
      const m = classify(L, xm, ym, zm, _out);
      if (m >= 0) vox[vi] = m;
      // the shell: air, fluids and anything that pours (sand, gravel) become earth, so nothing
      // runs or trickles in
      else if (_out.shell && cur < ORE_BASE && (cur === 0 || cur >= 40 || granM(cur))) vox[vi] = ym - L.o.y > 1.4 ? M.LOAM : M.DIRT;
    }
  }
  // round the lift room (the generator's) and the start of its trail: sand and gravel there would
  // pour onto the floor you step out onto, so they become earth (air and everything else stays)
  const F = firmBox(L);
  if (F[3] < cx0 || F[0] > cx1 || F[4] < cy0 || F[1] > cy1 || F[5] < cz0 || F[2] > cz1) return;
  const a0 = Math.max(0, Math.floor(F[0] * VOX) - X0), a1 = Math.min(CS, Math.ceil(F[3] * VOX) - X0);
  const b0 = Math.max(0, Math.floor(F[1] * VOX) - Y0), b1 = Math.min(CS, Math.ceil(F[4] * VOX) - Y0);
  const c0 = Math.max(0, Math.floor(F[2] * VOX) - Z0), c1 = Math.min(CS, Math.ceil(F[5] * VOX) - Z0);
  for (let z = c0; z < c1; z++) for (let y = b0; y < b1; y++) for (let x = a0; x < a1; x++) {
    const vi = x + CS * (y + CS * z);
    if (granM(vox[vi])) vox[vi] = (Y0 + y + 0.5) / VOX - L.lift.y > 1.4 ? M.LOAM : M.DIRT;
  }
}

/** The box round the lift room where nothing may pour (world meters). */
function firmBox(L) {
  const f = L.lift, o = L.o;
  // kept inside the feature's bounds (the generator's f.bb: y from o.y - 2 to o.y + 4)
  return L.firm ||= [f.x - 2.6, Math.max(o.y - 1.9, f.y - 0.4), f.z - 1.6, f.x + 2.6, Math.min(o.y + 3.9, f.y + 4.2), f.z + 4.2];
}

/** Is the point in the dug-out space (the grotto, the crawl, the nook)? */
export function prologueCarved(L, x, y, z) { const o = L.o; return carved(L, x, y, z, x - o.x, y - o.y, z - o.z); }

/**
 * Is a point in (or within pad of) the crawl or the nook? Props, cave spikes and plants stay out of
 * there so the way through is never blocked; the grotto itself is dressed like any other cave.
 */
export function prologueInside(L, x, y, z, pad = 0.3) {
  if (z < L.o.z + 2.0 - pad) return false;
  const C = L.crawl;
  for (let i = 0; i < C.length - 1; i++) {
    const d = d2seg(x, z, C[i], C[i + 1]);
    const fy = C[i].y + (C[i + 1].y - C[i].y) * SEG_T;
    if (d < 0.75 + pad && y > fy - 0.4 - pad && y < fy + 1.5 + pad) return true;
  }
  const d = d2seg(x, z, L.corner, L.nook);
  if (d < 0.75 + pad && y > L.nook.y - 0.4 - pad && y < L.nook.y + 1.5 + pad) return true;
  if (Math.abs(x - L.nook.x) < 1.1 + pad && Math.abs(z - L.nook.z) < 0.9 + pad && Math.abs(y - L.nook.y - 0.6) < 1 + pad) return true;
  return false;
}

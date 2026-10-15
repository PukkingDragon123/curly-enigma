// Voxel models for the blacksmith corner, built at 1/32-unit voxels for close-up detail.
// Layout numbers (positions, anchors, sizes in the returned handles) are kept in V = 1/16 units
// so the forging code and the room layout stay put; P = 1/32 is the modelling grid.
// Builders return THREE groups plus handles for the parts the scene animates.
import * as THREE from 'three';
import { VoxelGrid, voxelMaterial } from '../gfx/Voxel.js';
import { voxMesh, hash3 } from '../bookends/vox.js';
import { cyl, bar, pj, pp } from '../bookends/props.js';
import { makeRng, mixHex, shade } from '../core/util.js';

export const V = 1 / 16; // layout unit
export const P = 1 / 32; // modelling voxel

function mesh(grid, pivot, opts = {}) {
  return voxMesh(grid, { pivot, scale: opts.scale ?? P, kind: opts.kind || 'toon', outline: opts.outline ?? true, material: opts.material, ao: opts.ao, interior: opts.interior });
}

/** Unlit glowing voxel material (unique, so its color can be animated). */
export function glowMaterial() {
  return voxelMaterial('basic', { unique: true });
}

/** Lit voxel material with its own emissive (for glowing hot metal). */
export function hotMaterial() {
  return voxelMaterial('toon', { unique: true, emissive: 0x000000 });
}

const jit = (c, x, y, z, amt = 0.06, seed = 1) => pj(c, x, y, z, seed, amt, 1);

// ---------------------------------------------------------------- palettes
const IRON = 0x3e3c42, IRON_HI = 0x6a6872, IRON_LO = 0x2a282e, RUST = 0x7a4a2a;
const WOOD = [0x6a4424, 0x74482a, 0x60401f], WOOD_DK = 0x45291a, WOOD_HI = 0x8c5c34;
const BRICKS = [0x8a3a28, 0x7a3222, 0x96422e, 0x6e2c20, 0x844030, 0x9a4a32];
const STONES = [0x8a8278, 0x7a7068, 0x948a80, 0x6e665e, 0x847a70];
const BRASS = 0xc8a040, BRASS_HI = 0xf0d070, BRASS_LO = 0x8a6a24;

/** Brick colour for wall coordinates (u along, v up) in voxels: 6x3 bricks, staggered. */
function brick(u, v, seed = 3, mortar = 0x3a2a24) {
  const row = Math.floor(v / 3);
  const uu = u + (row % 2) * 3 + 60;
  if (v % 3 === 2 || uu % 6 === 5) return mortar;
  const h = hash3(Math.floor(uu / 6), row, seed, 1);
  let c = BRICKS[(h * BRICKS.length) | 0];
  if (v % 3 === 0) c = shade(c, 1.07);
  if (hash3(u, v, seed, 2) < 0.05) c = shade(c, 0.86);
  return c;
}

/** Wood with grain running along `a` (voxel index along the board), `b` across it. */
function woodGrain(a, b, x, y, z, seed = 1, base = WOOD) {
  // one tone per board-length streak, wavy grain lines, the odd knot
  let c = base[(hash3(Math.floor(a / 9), b, seed, 7) * base.length) | 0];
  const ring = Math.sin(a * 0.42 + Math.sin(b * 1.3 + seed) * 2.1 + Math.sin(a * 0.07 + b) * 1.5);
  if (ring > 0.82) c = shade(c, 0.78);
  else if (ring < -0.92) c = shade(c, 1.1);
  if (hash3(x, y, z, seed + 3) < 0.012) c = shade(c, 0.62);
  return c;
}

// ---------------------------------------------------------------- hearth
/**
 * Brick forge with a cast-iron firepot full of coals, a sooty firebrick back, an ash-pit arch
 * and a riveted copper hood. Origin: floor center of the base.
 * Returns { group, coalMat, emberMat, firePos, bedY, bed:{w,d}, size, tuyere }.
 */
export function makeHearth(opts = {}) {
  const W = 48, D = 36, H = opts.H ?? 26;
  const right = !!opts.tuyereRight; // bellows socket on the +x side
  const TY = opts.H ? H - 7 : 17; // tuyere centre height
  const g = new VoxelGrid(W + 2, H + 22, D + 2);
  const o = 1; // margin for the overhanging capstone
  // plinth course of stone, then brick
  g.box(o, 0, o, W, H - 2, D, (x, y, z) => {
    const fx = x - o, fz = z - o;
    const outer = fx === 0 || fx === W - 1 || fz === 0 || fz === D - 1;
    if (!outer) return 0x241c1a;
    const u = fz === 0 || fz === D - 1 ? fx : fz + 5;
    if (y < 3) return pj(STONES[(hash3(Math.floor(u / 7), 0, 3) * STONES.length) | 0], x, y, z, 4, 0.05, 2);
    let c = brick(u, y - 3, 7);
    // soot creeping up the front and staining the corners
    const soot = Math.max(0, (y - 8) / (H - 8)) * (fz === D - 1 ? 0.45 : 0.25);
    return mixHex(c, 0x1e1412, soot);
  });
  // stone corner quoins
  for (const [x, z] of [[o, o], [o + W - 3, o], [o, o + D - 3], [o + W - 3, o + D - 3]]) {
    for (let y = 3; y < H - 2; y += 4) g.box(x, y, z, 3, 3, 3, (xx, yy, zz) => pj(0x8a8076, xx, yy, zz, 9, 0.05, 2));
  }
  // capstone slab, overhanging by a voxel, with a worn lighter front edge
  g.box(0, H - 2, 0, W + 2, 2, D + 2, (x, y, z) => {
    let c = pp([0x6e665e, 0x665e56, 0x766c64], x, y, z, 5, 3);
    if (hash3(x >> 1, y, z >> 1, 14) < 0.22) c = shade(c, 0.8); // soot and scorch
    if (y === H - 1 && (z === D + 1 || x === 0 || x === W + 1)) c = shade(c, 1.12);
    if (y === H - 2) c = shade(c, 0.85);
    return c;
  });
  // firepot recess: cast iron lining
  const fx0 = 7, fx1 = W - 5, fz0 = 7, fz1 = D - 5;
  for (let x = fx0; x < fx1; x++) for (let z = fz0; z < fz1; z++) {
    for (let y = H - 5; y < H; y++) g.clear(x, y, z);
    g.set(x, H - 6, z, 0x161212);
  }
  for (let x = fx0 - 1; x <= fx1; x++) for (let z = fz0 - 1; z <= fz1; z++) {
    const edge = x === fx0 - 1 || x === fx1 || z === fz0 - 1 || z === fz1;
    if (!edge) continue;
    for (let y = H - 5; y < H; y++) g.set(x, y, z, y === H - 1 ? IRON_HI : hash3(x, y, z, 6) < 0.15 ? RUST : IRON);
  }
  // ash pit arch at the front
  const ax = o + W / 2;
  const AH = Math.min(13, H - 9), AS = AH - 6;
  for (let x = ax - 9; x < ax + 9; x++) for (let y = 0; y < AH; y++) {
    const dx = (x + 0.5 - ax) / 8.5, dy = Math.max(0, y - 6) / AS;
    if (dx * dx + dy * dy < 1) { g.clear(x, y, o + D - 1); g.clear(x, y, o + D - 2); g.set(x, y, o + D - 3, y < 2 ? 0x2a1c18 : 0x120c0a); }
    else if (dx * dx + dy * dy < 1.45 && y > 2) g.set(x, y, o + D - 1, pj(0x9a8c80, x, y, 0, 3, 0.05, 2)); // stone voussoirs
  }
  // firebrick back wall rising behind the coals, blackened toward the top
  for (let x = o + 4; x < o + W - 4; x++) for (let y = H; y < H + 18; y++) for (let z = o; z < o + 5; z++) {
    let c = brick(x, y - H, 11, 0x2a1c16);
    const soot = Math.min(1, (y - H) / 16);
    c = mixHex(c, 0x1a1210, 0.25 + soot * 0.55);
    if (z === o + 4 && y < H + 3 && hash3(x, y, z, 12) < 0.25) c = 0x6a2a14;
    g.set(x, y, z, c);
  }
  // tuyere flange (bellows nozzle socket) on one side, poker and shovel hanging on the other
  const tx = right ? o + W - 1 : 0, px = right ? 0 : o + W;
  g.box(tx, TY - 3, o + 16, 2, 6, 6, (x, y, z) => (y === TY - 3 || y === TY + 2 ? IRON_HI : IRON));
  g.box(right ? tx + 1 : tx, TY - 2, o + 17, 1, 4, 4, 0x141012);
  for (let y = 6; y < H - 4; y++) g.set(px, y, o + 10, y < 9 ? 0x5a5a62 : IRON);
  g.box(px, H - 5, o + 9, 1, 1, 3, IRON_HI);
  for (let y = 9; y < H - 5; y++) g.set(px, y, o + 24, WOOD_HI);
  g.box(px, 4, o + 22, 1, 5, 5, (x, y) => (y === 4 ? IRON_LO : IRON));
  const group = new THREE.Group();
  const body = mesh(g, [(W + 2) / 2, 0, (D + 2) / 2]);
  group.add(body);

  // coal bed: chunky lumps, hot in the middle and dark at the edges
  const rng = makeRng(17);
  const cw = fx1 - fx0, cd = fz1 - fz0;
  const dark = new VoxelGrid(cw, 9, cd);
  const hot = new VoxelGrid(cw, 9, cd);
  const HOT = [0xff9a2a, 0xffc04a, 0xe0501a, 0xff7a1a, 0xffe08a, 0xd8401a];
  for (let i = 0; i < 150; i++) {
    const x = rng.range(1, cw - 1), z = rng.range(1, cd - 1);
    const dx = (x - cw / 2) / (cw / 2), dz = (z - cd / 2) / (cd / 2);
    const r = Math.sqrt(dx * dx * 0.8 + dz * dz);
    const y = Math.max(1, 4.5 - r * 3.2 + rng.range(-0.5, 0.8));
    const s = rng.range(1.2, 2.1);
    const glowing = r < 0.78 && rng.chance(0.8 - r * 0.5);
    if (glowing) {
      const core = r < 0.4 && rng.chance(0.6);
      hot.ellipsoid(x, y, z, s, s * 0.8, s, (xx, yy, zz, ddx, ddy) => (ddy > 0.3 ? (core ? 0xffe08a : rng.pick(HOT)) : core ? 0xffb040 : 0xd8401a));
    } else {
      dark.ellipsoid(x, y, z, s, s * 0.8, s, (xx, yy, zz, ddx, ddy) => (ddy > 0.45 ? 0x4a4650 : pp([0x1e1a1c, 0x262224, 0x2e2a2c], xx, yy, zz, 3, 1)));
    }
  }
  for (let x = 0; x < cw; x++) for (let z = 0; z < cd; z++) if (!dark.filled(x, 0, z) && !hot.filled(x, 0, z)) dark.set(x, 0, z, 0x1a1616);
  const bedY = (H - 6) * P;
  const coalDark = mesh(dark, [cw / 2, 0, cd / 2]);
  const coalMat = glowMaterial();
  const coalHot = mesh(hot, [cw / 2, 0, cd / 2], { material: coalMat, outline: false });
  coalHot.userData.dynamic = true;
  const bedZ = (fz0 + cd / 2 - (D + 2) / 2) * P;
  const bedX = (fx0 + cw / 2 - (W + 2) / 2) * P;
  for (const m of [coalDark, coalHot]) { m.position.set(bedX, bedY + P, bedZ); group.add(m); }

  // glowing embers in the ash pit
  const pit = new VoxelGrid(16, 3, 4);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 3; z++) if (rng.chance(0.45)) pit.set(x, rng.int(0, 1), z, rng.pick(HOT));
  const emberMat = glowMaterial();
  const pitMesh = mesh(pit, [8, 0, 2], { material: emberMat, outline: false });
  pitMesh.position.set(0, 0, ((D + 2) / 2 - 4) * P);
  pitMesh.userData.dynamic = true;
  group.add(pitMesh);

  // copper hood + chimney pipe, with a sooty lining that glows with the fire below it
  const hood = makeHood();
  hood.position.set(0, (H + 26) * P, -2 * P);
  group.add(hood);
  const lining = makeHoodLining();
  lining.mesh.position.copy(hood.position);
  lining.mesh.userData.dynamic = true;
  group.add(lining.mesh);
  return {
    group, coalMat, emberMat,
    bedY: bedY + 6 * P,
    firePos: new THREE.Vector3(bedX, bedY + 6 * P, bedZ),
    bed: { w: cw * P, d: cd * P },
    size: { w: W * P, h: H * P, d: D * P },
    tuyere: new THREE.Vector3((right ? 1 : -1) * (W + 2) / 2 * P, (TY + 0.5) * P, (o + 19 - (D + 2) / 2) * P),
    hood,
    liningMat: lining.mat,
  };
}

/** The inside of the hood: soot with glowing flecks, one voxel inside the copper (unlit; tint it). */
function makeHoodLining() {
  const W = 52, D = 38, HH = 22;
  const g = new VoxelGrid(W, HH, D);
  for (let y = 1; y < HH - 1; y++) {
    const t = y / (HH - 1);
    const hw = Math.round((W / 2) * (1 - t * 0.62)) - 1, hd = Math.round((D / 2) * (1 - t * 0.55)) - 1;
    const cx = W / 2, cz = D / 2;
    for (let x = cx - hw; x < cx + hw; x++) for (let z = cz - hd; z < cz + hd; z++) {
      const edge = x === cx - hw || x === cx + hw - 1 || z === cz - hd || z === cz + hd - 1;
      if (!edge && y !== HH - 2) continue;
      const r = hash3(x, y, z, 31);
      let c = mixHex(0xc8683a, 0x3a2218, Math.min(1, t * 1.15));
      if (r < 0.14) c = shade(c, 0.72);
      else if (r > 0.9) c = shade(c, 1.12);
      if (r > 0.985 && t > 0.2) c = 0xffc070; // a fleck of glowing soot
      g.set(x, y, z, c);
    }
  }
  const mat = glowMaterial();
  return { mesh: mesh(g, [W / 2, 0, D / 2], { material: mat, outline: false }), mat };
}

function makeHood() {
  const W = 52, D = 38, HH = 22, PIPE = 70;
  const g = new VoxelGrid(W, HH + PIPE, D);
  const COP = [0x8a5038, 0x9a5a3e, 0x7a4632];
  for (let y = 0; y < HH; y++) {
    const t = y / (HH - 1);
    const hw = Math.round((W / 2) * (1 - t * 0.62)), hd = Math.round((D / 2) * (1 - t * 0.55));
    const cx = W / 2, cz = D / 2;
    for (let x = cx - hw; x < cx + hw; x++) for (let z = cz - hd; z < cz + hd; z++) {
      const edge = x === cx - hw || x === cx + hw - 1 || z === cz - hd || z === cz + hd - 1;
      if (!edge && y !== HH - 1) continue;
      let c = pp(COP, x, y, z, 3, 2);
      if (y < 2) c = 0x5a3424; // rolled bottom lip
      if (y === 3 && (x + z) % 4 === 0) c = 0x3a2016; // rivets
      if (y % 7 === 6) c = shade(c, 0.82); // seams
      if (hash3(x >> 1, y >> 1, z >> 1, 5) < 0.07) c = pp([0x4a8a7a, 0x5a9a88], x, y, z, 7, 1); // patina
      if (y > HH - 7) c = mixHex(c, 0x2a2224, 0.4 + (y - (HH - 7)) * 0.06); // sooty top
      g.set(x, y, z, c);
    }
  }
  // chimney pipe with bands
  const cx = W / 2, cz = D / 2;
  for (let y = HH; y < HH + PIPE; y++) for (let x = cx - 8; x < cx + 8; x++) for (let z = cz - 8; z < cz + 8; z++) {
    const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (d > 7.6 || d < 6.2) continue;
    let c = (y - HH) % 16 < 2 ? 0x2a2426 : pj(0x3e3a3c, x, y, z, 4, 0.06, 2);
    if ((y - HH) % 16 === 2 && (x + z) % 3 === 0) c = 0x5a5658;
    if (Math.cos(Math.atan2(z - cz, x - cx) - 2.4) > 0.85) c = shade(c, 1.3); // a lit streak
    g.set(x, y, z, c);
  }
  // a lucky horseshoe nailed to the front of the hood
  const hs = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [3, 5], [4, 5], [5, 5], [6, 4], [7, 3], [7, 2], [7, 1], [7, 0]];
  const hz = Math.round(cz + (D / 2) * (1 - (8 / (HH - 1)) * 0.55)) - 1;
  for (const [dx, dy] of hs) { g.set(cx - 4 + dx, 6 + dy, hz, 0x9a9aa2); g.set(cx - 4 + dx, 6 + dy, hz + 1, dy > 3 ? 0xc8c8d0 : 0x8a8a92); }
  const m = mesh(g, [W / 2, 0, D / 2]);
  const grp = new THREE.Group();
  grp.add(m);
  return grp;
}

// ---------------------------------------------------------------- bellows
/**
 * Leather bellows on a trestle, nozzle toward +x. setCompress(k) squeezes it (0..1).
 * Origin: floor below the nozzle hinge. Returns { group, setCompress, grip, nozzleTip, length }.
 */
export function makeBellows(opts = {}) {
  const L = 28, Wd = 22; // in P voxels
  const SH = opts.standH ?? 12; // trestle height (P voxels)
  const group = new THREE.Group();
  const shape = (x) => { // half-width of the pear-shaped board at x (0 = hinge, L = back)
    const t = x / L;
    return Math.max(3, (Wd / 2) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5 + 0.12));
  };
  const board = (top) => {
    const g = new VoxelGrid(L + 2, 4, Wd + 4);
    for (let x = 0; x < L; x++) {
      const hw = shape(x);
      for (let z = Math.round(Wd / 2 - hw) + 2; z < Math.round(Wd / 2 + hw) + 2; z++) {
        const edge = z === Math.round(Wd / 2 - hw) + 2 || z === Math.round(Wd / 2 + hw) + 1;
        for (let y = 0; y < 2; y++) g.set(x, y, z, edge ? WOOD_DK : woodGrain(x, z, x, y, z, top ? 4 : 5));
      }
      // brass studs along the rim of the top board
      if (top && x > 3 && x % 4 === 1) { g.set(x, 2, Math.round(Wd / 2 - hw) + 3, BRASS_HI); g.set(x, 2, Math.round(Wd / 2 + hw), BRASS_HI); }
    }
    if (top) for (let z = Math.round(Wd / 2) - 3; z < Math.round(Wd / 2) + 4; z++) for (let x = 10; x < 13; x++) g.set(x, 2, z + 2, x === 11 ? 0x4a2a1a : 0x6a3a22); // leather strap
    return g;
  };
  const bottom = mesh(board(false), [0, 0, Wd / 2 + 2]);
  // leather wedge: taller toward the back, with deep pleats and stitched edges
  const lg = new VoxelGrid(L, 16, Wd + 4);
  for (let x = 0; x < L; x++) {
    const hw = shape(x) - 0.6;
    const hgt = Math.max(1, Math.round(1 + (x / L) * 15));
    for (let y = 0; y < hgt; y++) {
      const fold = (y % 4);
      const inset = fold === 2 ? 2 : fold === 1 || fold === 3 ? 1 : 0;
      for (let z = Math.round(Wd / 2 - hw + inset) + 2; z < Math.round(Wd / 2 + hw - inset) + 2; z++) {
        let c = fold === 2 ? 0x2a1810 : fold === 0 ? 0x6a3c22 : pj(0x4e2c18, x, y, z, 6, 0.06, 2);
        if (fold === 0 && x % 3 === 0) c = 0xc8a070; // stitching
        lg.set(x, y, z, c);
      }
    }
  }
  const leather = mesh(lg, [0, 0, Wd / 2 + 2]);
  const top = mesh(board(true), [0, 0, Wd / 2 + 2]);
  // handle at the back end of the top board
  const hg = new VoxelGrid(6, 14, 14);
  hg.box(2, 0, 6, 2, 12, 2, WOOD_HI);
  hg.box(2, 12, 0, 2, 2, 14, (x, y, z) => (z === 0 || z === 13 ? WOOD_DK : 0x9a6a3a));
  const handle = mesh(hg, [3, 0, 7]);
  handle.position.set((L - 3) * P, 2 * P, 0);
  handle.rotation.z = 0.5;
  const topPivot = new THREE.Group();
  topPivot.add(top, handle);
  const grip = new THREE.Object3D();
  grip.position.set((L - 3) * P + Math.sin(-0.5) * 12 * P, 14 * P, 0);
  topPivot.add(grip);

  // nozzle pipe: brass collar, iron pipe, flared tip
  const ng = new VoxelGrid(14, 6, 6);
  ng.box(0, 0, 0, 14, 6, 6, (x, y, z) => {
    const d = Math.hypot(y + 0.5 - 3, z + 0.5 - 3);
    if (d > 3) return -1;
    if (x < 3) return y > 3 ? BRASS_HI : BRASS;
    if (x > 11) return 0x2a2426;
    return y > 3 ? IRON_HI : IRON;
  });
  const nozzle = mesh(ng, [14, 3, 3]);

  // trestle stand
  const sg = new VoxelGrid(L + 4, SH, Wd + 4);
  for (const sx of [3, L - 4]) {
    sg.box(sx, 0, 2, 2, SH, 2, (x, y, z) => woodGrain(y, x, x, y, z, 7));
    sg.box(sx, 0, Wd, 2, SH, 2, (x, y, z) => woodGrain(y, x, x, y, z, 8));
    sg.box(sx, SH - 2, 2, 2, 2, Wd, (x, y, z) => woodGrain(z, y, x, y, z, 9));
    if (SH > 6) sg.box(sx, 3, 4, 2, 1, Wd - 4, WOOD_DK);
  }
  if (SH > 8) sg.box(3, 5, Math.round(Wd / 2) + 1, L - 6, 2, 2, (x, y, z) => woodGrain(x, y, x, y, z, 10));
  const stand = mesh(sg, [0, 0, (Wd + 4) / 2]);

  const body = new THREE.Group(); // positioned so the hinge is at the origin x
  body.position.y = SH * P;
  leather.position.set(0, 2 * V, 0);
  topPivot.position.set(0, 2 * V, 0);
  body.add(bottom, leather, topPivot);
  // flip so the nozzle (hinge at x=0) points toward +x
  const flip = new THREE.Group();
  flip.rotation.y = Math.PI;
  flip.add(body, stand);
  nozzle.position.set(7 * V, SH * P + 2.5 * V, 0);
  group.add(flip, nozzle);
  for (const o of [leather, topPivot]) o.userData.dynamic = true;

  const setCompress = (k) => {
    const s = 1 - 0.62 * k;
    leather.scale.y = s;
    topPivot.position.y = 2 * V + s * V;
    topPivot.rotation.z = Math.atan2(s * 7 * V, L * P);
  };
  setCompress(0);
  return { group, setCompress, grip, topPivot, nozzleTip: new THREE.Vector3(7 * V, SH * P + 2.5 * V, 0), length: L * P };
}

// ---------------------------------------------------------------- anvil & stump
/** London-pattern anvil (horn, step, face, heel with hardy & pritchel holes) strapped to a stump.
 * Origin: floor center. Returns { group, faceY, faceLen, faceX }. */
export function makeAnvil(opts = {}) {
  const group = new THREE.Group();
  const SH = opts.stumpH ?? 8; // stump height (P voxels) under its top ring
  // stump with bark furrows, growth rings and iron straps
  const sg = new VoxelGrid(28, SH + 1, 28);
  sg.cylinderY(14, 14, 13, 0, SH, (x, y, z) => {
    const dx = x + 0.5 - 14, dz = z + 0.5 - 14;
    const r = Math.hypot(dx, dz);
    if (r > 11.6) {
      if (y === 2 || y === SH - 2) return (Math.round(Math.atan2(dz, dx) * 8) % 4 === 0) ? 0x7a7880 : IRON;
      const furrow = Math.sin(Math.atan2(dz, dx) * 13 + y * 0.3) > 0.4;
      return furrow ? 0x3a2414 : pj(0x5a3a24, x, y, z, 3, 0.08, 2);
    }
    return 0x6a4428;
  });
  sg.cylinderY(14, 14, 11.6, SH, SH + 1, (x, y, z) => {
    const r = Math.hypot(x + 0.5 - 14, z + 0.5 - 14);
    if (r < 1.2) return 0x7a5030;
    return Math.round(r * 0.9) % 2 ? 0xa8804e : 0xc09460;
  });
  // root flares
  for (const [x, z] of [[1, 13], [26, 15], [13, 1], [15, 26]]) sg.box(x, 0, z, 2, 2, 2, 0x4a2e1c);
  group.add(mesh(sg, [14, 0, 14]));
  // the anvil, along x: horn toward -x, heel toward +x, polished face on top (local y 9 = 18P overall)
  const X0 = 32; // anvil origin offset inside its grid (x = 0 at the stump centre)
  const ag = new VoxelGrid(56, 12, 14);
  const IRONS = [0x3e3c42, 0x38363c, 0x444248];
  const iron = (x, y, z) => pp(IRONS, x, y, z, 5, 2);
  const at = (x) => x + X0;
  // feet + base (with the arch cut out between the feet)
  ag.box(at(-14), 0, 0, 30, 2, 14, (x, y, z) => (y === 1 ? shade(iron(x, y, z), 1.08) : iron(x, y, z)));
  for (let x = at(-7); x < at(9); x++) for (let z = 0; z < 14; z++) if (z < 3 || z > 10) ag.clear(x, 0, z);
  // waist
  ag.box(at(-8), 2, 3, 18, 3, 8, iron);
  // body flaring up to the face
  ag.box(at(-12), 5, 2, 26, 2, 10, iron);
  ag.box(at(-14), 7, 1, 30, 2, 12, iron);
  // face plate (hardened steel), with a polished, scuffed working area and a few dents
  const FACE = [0x9a9ca6, 0x92949e, 0xa2a4ac];
  ag.box(at(-14), 9, 1, 30, 1, 12, (x, y, z) => {
    const fx = x - X0;
    let c = pp(FACE, x, y, z, 7, 2);
    const wear = Math.abs(fx - 1) < 9 && z > 3 && z < 10;
    if (wear && hash3(x, y, z, 8) < 0.28) c = 0xc8ccd6;
    if (hash3(x, y, z, 9) < 0.035) c = 0x6a6c74;
    if (z === 1 || z === 12) c = shade(c, 0.86);
    if (fx === -14 || fx === 15) c = shade(c, 0.9);
    return c;
  });
  // the step (a voxel below the face) toward the horn
  ag.box(at(-18), 8, 2, 4, 1, 10, (x, y, z) => pp([0x5a5a62, 0x62626a], x, y, z, 2, 1));
  ag.box(at(-18), 5, 3, 4, 3, 8, iron);
  // heel overhang and the holes
  ag.box(at(16), 6, 2, 4, 3, 10, iron);
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) ag.set(at(12) + dx, 9, 6 + dz, 0x121014); // hardy hole
  ag.set(at(8), 9, 6, 0x121014); ag.set(at(8), 9, 7, 0x1a181c); // pritchel hole
  // the horn: a cone tapering to a slightly upturned point
  for (let i = 0; i < 14; i++) {
    const x = at(-18 - i);
    const r = 2.9 * (1 - i / 15) + 0.4;
    const cy = 6.2 + i * 0.08, cz = 7;
    for (let y = 2; y < 11; y++) for (let z = 0; z < 14; z++) {
      if ((y + 0.5 - cy) ** 2 + (z + 0.5 - cz) ** 2 > r * r) continue;
      ag.set(x, y, z, y + 0.5 > cy + r * 0.45 ? 0x7a7c84 : iron(x, y, z));
    }
  }
  // maker's mark on the waist: a tiny mole paw
  for (const [dx, dy] of [[0, 0], [1, 1], [-1, 1], [0, 2], [2, 2], [-2, 2]]) ag.set(at(1) + dx, 2 + dy, 11, 0x5a5862);
  const anvil = mesh(ag, [X0, 0, 7]);
  anvil.position.y = SH * P;
  group.add(anvil);
  return { group, faceY: (SH + 10) * P, faceLen: 15 * V, faceX: (11.5 - 11) * V };
}

/** Low wooden step the mole stands on at the anvil. */
export function makePlatform() {
  const g = new VoxelGrid(28, 6, 18);
  g.box(0, 0, 0, 28, 6, 18, (x, y, z) => {
    if (y === 5) return z % 6 === 5 ? WOOD_DK : woodGrain(x, z - (z % 6), x, y, z, 12, [0x8a5a32, 0x7e5430, 0x946238]);
    if (x < 2 || x > 25) return WOOD_DK;
    return pj(0x5a3a20, x, y, z, 13, 0.06, 2);
  });
  for (let z = 2; z < 18; z += 6) { g.set(2, 5, z, 0x9a9aa2); g.set(25, 5, z, 0x9a9aa2); } // nail heads
  return mesh(g, [14, 0, 9]);
}

// ---------------------------------------------------------------- quench barrel
/** Barrel with iron hoops and an open top. Returns { group, water, waterY, radius }. */
export function makeBarrel(waterTex) {
  const R = 11, Hh = 20;
  const g = new VoxelGrid(24, Hh, 24);
  g.cylinderY(12, 12, R, 0, Hh, (x, y, z) => {
    const dx = x + 0.5 - 12, dz = z + 0.5 - 12;
    const r = Math.hypot(dx, dz);
    if (r < R - 2.1 && y > 1) return -1;
    const a = Math.atan2(dz, dx);
    if (y === 3 || y === 4 || y === Hh - 5 || y === Hh - 4) {
      const c = (Math.round(a * 12) % 5 === 0 && y % 2 === 1) ? 0x8a8890 : IRON; // rivets
      return y % 2 === 0 ? shade(c, 1.15) : c;
    }
    const stave = Math.floor((a + Math.PI) / (Math.PI * 2) * 18);
    const seam = ((a + Math.PI) / (Math.PI * 2) * 18) % 1 < 0.08;
    if (seam && r > R - 1.2) return 0x2e1a10;
    let c = stave % 2 ? 0x7a4a26 : 0x6a4020;
    if (y > Hh - 4) c = shade(c, 0.72); // wet rim
    if (r < R - 1.1) c = shade(c, 0.6); // inside wall
    return pj(c, x, y, z, stave, 0.05, 2);
  });
  const group = new THREE.Group();
  group.add(mesh(g, [12, 0, 12]));
  const water = new THREE.Mesh(new THREE.CircleGeometry((R - 2.1) * P, 24), new THREE.MeshLambertMaterial({ map: waterTex, emissive: 0x0a1a20 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = (Hh - 3.2) * P;
  group.add(water);
  return { group, water, waterY: water.position.y, radius: (R - 2) * P };
}

// ---------------------------------------------------------------- grindstone
export function makeGrindstone() {
  const group = new THREE.Group();
  // waist-high for a mole: two braced side frames carry the axle, a water trough sits below
  const fg = new VoxelGrid(20, 15, 18);
  for (const x of [2, 16]) {
    fg.box(x, 0, 2, 2, 12, 2, (xx, y, z) => woodGrain(y, xx, xx, y, z, 21));
    fg.box(x, 0, 14, 2, 12, 2, (xx, y, z) => woodGrain(y, xx, xx, y, z, 22));
    fg.box(x, 4, 4, 2, 1, 10, WOOD_DK); // brace
    fg.box(x, 10, 4, 2, 2, 10, (xx, y, z) => woodGrain(z, y, xx, y, z, 23)); // top rail
    fg.box(x, 12, 8, 2, 2, 2, (xx, y) => (y === 13 ? IRON_HI : IRON)); // bearing
  }
  fg.box(0, 12, 8, 2, 2, 2, IRON); fg.box(18, 12, 8, 2, 2, 2, IRON); // axle ends
  // trough with water
  fg.box(5, 0, 3, 10, 4, 12, (x, y, z) => {
    if (y === 3 && x > 5 && x < 14 && z > 3 && z < 14) return (x + z) % 5 === 0 ? 0x5a9aa8 : 0x2a5a68;
    return woodGrain(x, z, x, y, z, 24);
  });
  group.add(mesh(fg, [10, 0, 9]));
  // sandstone wheel: grit speckles, a darker wet band on the rim, an iron hub
  const R = 9.2, D = 20;
  const wg = new VoxelGrid(D, D, 6);
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const r = Math.hypot(x + 0.5 - D / 2, y + 0.5 - D / 2);
    if (r > R) continue;
    for (let z = 0; z < 6; z++) {
      let c;
      if (r < 2.2) c = z === 0 || z === 5 ? IRON_HI : IRON;
      else if (r > R - 1.3) c = 0x8a7a5e;
      else c = pp([0xb8a684, 0xb09e7c, 0xc0ae8c], x, y, z, 3, 1);
      if (r > 2.2 && hash3(x, y, z, 4) < 0.06) c = 0x9a8a6a;
      if ((z === 0 || z === 5) && Math.abs(r - 5.5) < 0.5) c = shade(c, 0.9); // turned ring
      wg.set(x, y, z, c);
    }
  }
  const wheel = mesh(wg, [D / 2, D / 2, 3]);
  wheel.rotation.y = Math.PI / 2;
  const hub = new THREE.Group();
  hub.position.set(0, 6.5 * V, 0);
  hub.add(wheel);
  hub.userData.dynamic = true;
  group.add(hub);
  // crank on the axle end: an arm and a handle, turning with the wheel
  const cg = new VoxelGrid(6, 8, 2);
  cg.box(0, 0, 0, 2, 8, 2, IRON); cg.box(2, 6, 0, 4, 2, 2, WOOD_HI);
  const crank = mesh(cg, [1, 1, 1]);
  crank.position.set(5.5 * V, 0, 0);
  hub.add(crank);
  return { group, wheel, hub, contact: new THREE.Vector3(0, 6.5 * V + R * P, 0) };
}

// ---------------------------------------------------------------- racks, benches, decor
/** Wall rack: three pairs of tongs, a cross-peen, a ball-peen and a sledge, files, punches. */
export function makeToolRack() {
  const g = new VoxelGrid(52, 34, 7);
  // board with pegs
  g.box(0, 24, 0, 52, 6, 2, (x, y, z) => (y === 29 ? shade(WOOD_HI, 0.9) : woodGrain(x, y, x, y, z, 31)));
  for (let x = 3; x < 52; x += 6) g.box(x, 26, 2, 2, 2, 3, WOOD_DK);
  g.set(1, 27, 2, 0x9a9aa2); g.set(50, 27, 2, 0x9a9aa2);
  // tongs: long reins with differently shaped jaws
  const tongs = (x, jaw) => {
    for (let y = 2; y < 27; y++) { g.set(x, y, 4, y > 24 ? IRON_HI : IRON); g.set(x + 2, y, 4, y > 24 ? IRON_HI : IRON); }
    g.box(x, 5, 4, 3, 2, 1, IRON_LO); // rivet joint
    g.set(x + 1, 6, 5, 0x8a8890);
    if (jaw === 'flat') { g.box(x - 1, 0, 4, 2, 3, 1, IRON_LO); g.box(x + 2, 0, 4, 2, 3, 1, IRON_LO); }
    else if (jaw === 'bolt') { g.box(x - 1, 0, 4, 1, 5, 2, IRON_LO); g.box(x + 3, 0, 4, 1, 5, 2, IRON_LO); }
    else { g.set(x - 1, 1, 4, IRON_LO); g.set(x - 2, 0, 4, IRON_LO); g.set(x + 3, 1, 4, IRON_LO); g.set(x + 4, 0, 4, IRON_LO); }
  };
  tongs(3, 'flat'); tongs(9, 'bolt'); tongs(15, 'wolf');
  // hammers hanging head-down
  const hammer = (x, len, head, kind) => {
    for (let y = 4; y < 4 + len; y++) { g.set(x, y, 4, y > len ? WOOD_DK : (y % 5 === 0 ? 0x7a4a26 : 0x9a6a3a)); g.set(x + 1, y, 4, 0x8a5a32); }
    g.box(x - head, 0, 3, head * 2 + 2, 4, 3, (xx, y, z) => (y === 3 ? 0x6a6870 : IRON));
    if (kind === 'ball') g.box(x - head - 1, 1, 3, 1, 2, 3, IRON_HI);
    if (kind === 'peen') g.box(x + head + 2, 2, 4, 1, 1, 1, IRON_HI);
    g.box(x - head, 0, 3, 1, 4, 3, IRON_HI); // bright striking face
  };
  hammer(23, 20, 3, 'peen');
  hammer(31, 19, 2, 'ball');
  hammer(39, 18, 4, 'sledge');
  // files & punches
  for (let y = 6; y < 24; y++) g.set(46, y, 4, y > 17 ? 0x7a4a26 : (y % 2 ? 0x6a6a72 : 0x7a7a82));
  for (let y = 12; y < 25; y++) g.set(49, y, 4, y > 21 ? 0x8a8a92 : 0x4a484c);
  for (let y = 14; y < 25; y++) g.set(43, y, 4, 0x5a5860);
  return mesh(g, [26, 0, 0]);
}

/** Workbench along a wall with a vise, candle and a balance fulcrum. Returns { group, topY, fulcrum, fulcrumTop, candleMat, flame }. */
export function makeWorkbench() {
  const group = new THREE.Group();
  const W = 56, D = 22, H = 20;
  const g = new VoxelGrid(W, H, D);
  // thick top of planks, edges darker, a burn mark
  g.box(0, H - 3, 0, W, 3, D, (x, y, z) => {
    if (y < H - 1) return z === 0 || z === D - 1 ? WOOD_DK : 0x6a4424;
    if (z % 7 === 6) return WOOD_DK;
    let c = woodGrain(x, z - (z % 7), x, y, z, 41, [0x9a6a3a, 0x8e6034, 0xa47040]);
    if (Math.hypot(x - 40, z - 12) < 2.5) c = 0x3a2416;
    return c;
  });
  for (const x of [2, W - 5]) for (const z of [2, D - 5]) g.box(x, 0, z, 3, H - 3, 3, (xx, y, zz) => woodGrain(y, xx, xx, y, zz, 42));
  g.box(2, 4, 2, W - 4, 2, D - 4, (x, y, z) => woodGrain(x, z, x, y, z, 43)); // lower shelf
  // stuff on the lower shelf: a coal sack, ingots, a crock
  g.ellipsoid(10, 10, 10, 5, 4, 5, (x, y, z) => ((x + y + z) % 2 ? 0xb89a6a : 0xa88a5a));
  g.box(8, 13, 9, 4, 2, 3, 0x8a6a3a);
  for (let i = 0; i < 3; i++) g.box(20 + i * 5, 6, 8, 4, 2, 4, (x, y) => (y === 7 ? shade([0x8a8f96, 0xd9773f, 0xc8a050][i], 1.12) : [0x8a8f96, 0xd9773f, 0xc8a050][i]));
  g.box(21, 8, 9, 4, 2, 3, (x, y) => (y === 9 ? 0xf0b080 : 0xd9773f));
  g.cylinderY(40, 11, 3.5, 6, 13, (x, y) => (y === 12 ? 0x5a3a22 : y === 9 ? 0x4a6aa0 : 0xc8b090));
  group.add(mesh(g, [W / 2, 0, D / 2]));
  // vise
  const vg = new VoxelGrid(10, 10, 12);
  vg.box(0, 0, 0, 10, 4, 8, IRON); vg.box(0, 4, 0, 10, 6, 2, (x, y) => (y === 9 ? IRON_HI : 0x4a484c));
  vg.box(0, 4, 6, 10, 6, 2, (x, y) => (y === 9 ? IRON_HI : 0x4a484c)); vg.box(4, 6, 8, 2, 2, 4, 0x2a2a2e);
  vg.box(1, 6, 11, 8, 1, 1, 0x6a6870);
  const vise = mesh(vg, [5, 0, 6]);
  vise.position.set((W / 2 - 8) * P, H * P, -2 * P);
  group.add(vise);
  // candle in a little dish
  const cg = new VoxelGrid(6, 10, 6);
  cg.box(0, 0, 0, 6, 1, 6, 0x6a5a40); cg.box(1, 1, 1, 4, 1, 4, 0x7a6a50);
  cg.box(2, 1, 2, 2, 7, 2, (x, y) => (y > 5 ? 0xf8f0d8 : 0xf0e6c8));
  cg.set(4, 6, 2, 0xf8f0d8); cg.set(4, 5, 2, 0xf8f0d8); // a drip
  const candle = mesh(cg, [3, 0, 3]);
  candle.position.set(-(W / 2 - 6) * P, H * P, -4 * P);
  group.add(candle);
  const fg = new VoxelGrid(2, 4, 2);
  fg.box(0, 0, 0, 2, 2, 2, 0xffd27a); fg.box(0, 2, 0, 2, 1, 2, 0xfff0b0); fg.set(0, 3, 0, 0xffffff);
  const candleMat = glowMaterial();
  const flame = mesh(fg, [1, 0, 1], { material: candleMat, outline: false });
  flame.position.set(-(W / 2 - 6) * P, (H + 8) * P, -4 * P);
  flame.userData.dynamic = true;
  group.add(flame);
  // balance fulcrum (wooden wedge with a steel edge)
  const fu = new VoxelGrid(14, 12, 10);
  for (let y = 0; y < 12; y++) {
    const hw = Math.max(0, 6 - Math.floor(y / 2));
    fu.box(7 - hw, y, 0, hw * 2 + 1, 1, 10, (x, yy, z) => (yy >= 11 ? 0xc8d0d8 : yy === 10 ? 0x8a929a : woodGrain(yy, x, x, yy, z, 44)));
  }
  const fulcrum = mesh(fu, [7, 0, 5]);
  fulcrum.position.set(2 * V, H * P, 1 * V);
  group.add(fulcrum);
  return { group, topY: H * P, fulcrum, fulcrumTop: new THREE.Vector3(2 * V, (H + 12) * P, 1 * V), candleMat, flame };
}

export function makeCoalBin() {
  const g = new VoxelGrid(24, 18, 18);
  g.box(0, 0, 0, 24, 12, 18, (x, y, z) => {
    const edge = x < 2 || x > 21 || z < 2 || z > 15 || y < 2;
    if (!edge) return -1;
    if (y % 6 === 5) return WOOD_DK;
    if ((x < 2 || x > 21) && (z < 2 || z > 15)) return 0x4a2e1a; // corner posts
    return woodGrain(x + z, y, x, y, z, 51);
  });
  // iron corner brackets
  for (const [x, z] of [[0, 0], [22, 0], [0, 16], [22, 16]]) g.box(x, 9, z, 2, 3, 2, IRON);
  // a heap of coal lumps with a blue-grey sheen on the tops
  const rng = makeRng(5);
  for (let i = 0; i < 70; i++) {
    const x = rng.range(3, 21), z = rng.range(3, 15);
    const y = 9 + 4 - Math.hypot(x - 12, z - 9) * 0.35 + rng.range(-0.6, 0.6);
    const s = rng.range(1.2, 2.2);
    g.ellipsoid(x, y, z, s, s * 0.8, s, (xx, yy, zz, dx, dy) => (dy > 0.5 ? (hash3(xx, yy, zz, 3) < 0.4 ? 0x5a5868 : 0x3e3c48) : pp([0x1e1a1c, 0x262224, 0x2e2a2c], xx, yy, zz, 4, 1)));
  }
  for (let x = 2; x < 22; x++) for (let z = 2; z < 16; z++) for (let y = 2; y < 9; y++) g.set(x, y, z, 0x1a1618);
  // shovel stuck in the heap
  for (let y = 10; y < 18; y++) g.set(18, y, 5, y > 16 ? WOOD_DK : WOOD_HI);
  g.box(16, 8, 3, 5, 4, 5, (x, y) => (y === 11 ? IRON_HI : 0x4a484c));
  return mesh(g, [12, 0, 9]);
}

export function makeCrate() {
  const g = new VoxelGrid(20, 16, 20);
  g.box(0, 0, 0, 20, 16, 20, (x, y, z) => {
    const fx = x < 2 || x > 17, fy = y < 2 || y > 13, fz = z < 2 || z > 17;
    if ((fx && fy) || (fz && fy) || (fx && fz)) return pj(0x5a3a20, x, y, z, 61, 0.06, 2);
    if (y % 4 === 1) return 0x4a2e18;
    return woodGrain(x + z, y, x, y, z, 62, [0x8a5a34, 0x7e5230, 0x946238]);
  });
  // a stencilled ore mark and nail heads
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 1], [1, 2], [0, 2], [-1, 1]]) g.set(9 + dx, 7 + dy, 19, 0x3a2414);
  for (const [x, y] of [[1, 1], [18, 1], [1, 14], [18, 14]]) g.set(x, y, 19, 0x9a9aa2);
  return mesh(g, [10, 0, 10]);
}

/** Wall shelf with jars, a pot of glowing blue mushrooms and ingots. Returns { group, glowMat }. */
export function makeShelf() {
  const group = new THREE.Group();
  const g = new VoxelGrid(44, 22, 10);
  g.box(0, 6, 0, 44, 2, 10, (x, y, z) => (y === 7 ? woodGrain(x, z, x, y, z, 71, [0x8a5a32, 0x946236]) : 0x6a4424));
  for (const bx of [4, 38]) { g.box(bx, 0, 0, 2, 6, 2, WOOD_DK); g.box(bx, 4, 2, 2, 2, 5, WOOD_DK); } // brackets
  // jars: glass with contents, cloth lids tied with string
  const jar = (x, c, h, lid) => {
    g.box(x, 8, 2, 4, h, 4, (xx, y, z) => {
      const glass = xx === x || xx === x + 3 || z === 2 || z === 5;
      if (y < 8 + h - 2) return glass ? (xx === x && z === 3 ? 0xe8f4f8 : mixHex(c, 0x9ab8c0, 0.35)) : c;
      return glass ? 0x9ab8c0 : -1;
    });
    g.box(x, 8 + h, 2, 4, 1, 4, lid); g.box(x + 1, 9 + h, 3, 2, 1, 2, lid);
  };
  jar(2, 0xc8e0d0, 7, 0xc94a3a); jar(8, 0xd8c8a0, 5, 0x7a4a26); jar(24, 0x9ad0c0, 9, 0x3a6ac9);
  // ingots stacked
  g.box(30, 8, 2, 8, 2, 4, 0xd9773f); g.box(30, 10, 2, 8, 2, 4, 0xf2c23a); g.box(31, 12, 3, 6, 1, 2, 0xc8ccd4);
  g.box(31, 9, 2, 6, 1, 1, 0xf0a070); g.box(31, 11, 2, 6, 1, 1, 0xffe08a);
  // the mushroom pot
  g.cylinderY(17, 4.5, 3.5, 8, 13, (x, y) => (y === 12 ? 0xc8704a : 0xb8603a));
  g.cylinderY(17, 4.5, 2.8, 12, 13, 0x4a3020);
  group.add(mesh(g, [22, 0, 0]));
  const mg = new VoxelGrid(10, 10, 6);
  for (const [x, z, h, r] of [[5, 3, 6, 2.6], [2, 2, 4, 1.8], [8, 4, 3, 1.6]]) {
    for (let y = 0; y < h; y++) mg.set(x, y, z, 0xd8f0ff);
    mg.ellipsoid(x + 0.5, h, z + 0.5, r, r * 0.6, r, (xx, y, zz, dx, dy) => (dy < -0.1 ? -1 : dy > 0.4 ? 0x9ae4ff : 0x5ac8ff));
  }
  const glowMat = glowMaterial();
  const shrooms = mesh(mg, [5, 0, 3], { material: glowMat });
  shrooms.position.set(-5 * P, 13 * P, 4.5 * P);
  shrooms.userData.dynamic = true;
  group.add(shrooms);
  return { group, glowMat };
}

/** Hanging oil lantern (emissive glass, no extra light). chain in V units. Returns { group, glassMat }. */
export function makeLantern(chain = 10) {
  const group = new THREE.Group();
  const C = chain * 2;
  const g = new VoxelGrid(12, C + 18, 12);
  for (let y = 15; y < 15 + C; y++) g.set(6, y, 6, (y % 3) === 0 ? 0x4a4a52 : 0x2a2a2e); // chain links
  g.box(1, 0, 1, 10, 2, 10, (x, y) => (y === 1 ? IRON_HI : IRON));
  g.box(2, 12, 2, 8, 1, 8, IRON); g.box(1, 11, 1, 10, 1, 10, IRON_HI); g.box(4, 13, 4, 4, 2, 4, IRON);
  for (const [x, z] of [[1, 1], [9, 1], [1, 9], [9, 9]]) g.box(x, 2, z, 2, 9, 2, IRON);
  group.add(mesh(g, [6, 0, 6]));
  const gg = new VoxelGrid(6, 9, 6);
  gg.box(0, 0, 0, 6, 9, 6, (x, y, z) => {
    const inner = x > 0 && x < 5 && z > 0 && z < 5;
    if (inner) return y > 1 && y < 6 && x > 1 && x < 4 && z > 1 && z < 4 ? 0xffffff : -1;
    return y > 5 ? 0xffe8a0 : 0xffc060;
  });
  const glassMat = glowMaterial();
  const glass = mesh(gg, [3, 0, 3], { material: glassMat, outline: false });
  glass.position.y = 2 * P;
  group.add(glass);
  group.userData.dynamic = true;
  return { group, glassMat };
}

const HERB_KINDS = [
  { stem: 0x7a8a4a, leaf: [0x9a7ad0, 0xb89ae8, 0x7a5ab0] }, // lavender
  { stem: 0x6a7a3a, leaf: [0xe0c040, 0xf0d860, 0xc8a030] }, // tansy
  { stem: 0x5a6a3a, leaf: [0x8aa86a, 0x7a9a5a, 0xa0b880] }, // sage
  { stem: 0x5a4a2a, leaf: [0xc8402a, 0xe0583a, 0xa8301e] }, // chilies
  { stem: 0x8a7a5a, leaf: [0xe8e0d0, 0xf6f0e4, 0xd0c8b0] }, // garlic
];

/** A dried-herb bundle hanging on a string (string in V units). */
export function makeHerbBundle(kind = 0, string = 6, seed = 1) {
  const k = HERB_KINDS[kind % HERB_KINDS.length];
  const rng = makeRng(seed);
  const S = string * 2;
  const g = new VoxelGrid(14, S + 20, 10);
  g.box(6, 18, 4, 1, S + 2, 1, 0xd8c8a0);
  g.box(4, 16, 3, 5, 2, 4, (x, y) => (y === 17 ? 0xd8b070 : 0xc8a070)); // tie
  for (let i = 0; i < 16; i++) {
    const x0 = 6 + rng.range(-1, 1), z0 = 5 + rng.range(-1, 1);
    const sx = rng.range(-0.3, 0.3), sz = rng.range(-0.22, 0.22);
    const len = rng.int(10, 16);
    for (let j = 0; j < len; j++) {
      const x = x0 + sx * j, z = z0 + sz * j, y = 15 - j;
      g.set(x, y, z, j < 4 ? k.stem : j > len - 3 && kind === 3 ? k.leaf[0] : rng.chance(0.6) ? rng.pick(k.leaf) : k.stem);
      if (j > 4 && rng.chance(0.4)) g.set(x + (rng.chance(0.5) ? 1 : -1), y, z, rng.pick(k.leaf));
    }
  }
  return mesh(g, [7, S + 20, 5]);
}

/** A hanging vine strand (len in V units). */
export function makeVine(len = 12, seed = 1) {
  const rng = makeRng(seed);
  const L = len * 2;
  const g = new VoxelGrid(10, L, 6);
  let x = 5;
  for (let y = L - 1; y >= 0; y--) {
    if (rng.chance(0.2)) x = Math.max(2, Math.min(7, x + (rng.chance(0.5) ? 1 : -1)));
    g.set(x, y, 3, rng.pick([0x3a6024, 0x4a7a2a]));
    if (rng.chance(0.35)) {
      // a leaf: a little diamond of two greens
      const sx = rng.chance(0.5) ? 1 : -1;
      g.set(x + sx, y, 3, 0x5a9a3a); g.set(x + sx * 2, y, 3, 0x6aaa44); g.set(x + sx, y - 1, 3, 0x4a8a32); g.set(x + sx, y, 2, 0x5a9a3a);
    }
    if (rng.chance(0.03)) { g.set(x, y, 4, 0xf0d8e8); g.set(x, y - 1, 4, 0xffe8f4); } // tiny flower
  }
  return mesh(g, [5, L, 3]);
}

/** Dark wooden beam (box): lenV, hV, dV in V units, along x. */
export function makeBeam(lenV, hV = 4, dV = 3, color = 0x4a2e1c) {
  const L = Math.round(lenV * 2), Hh = hV * 2, Dd = dV * 2;
  const g = new VoxelGrid(L, Hh, Dd);
  g.box(0, 0, 0, L, Hh, Dd, (x, y, z) => {
    const ring = Math.sin(x * 0.18 + Math.sin(y * 0.7 + z) * 1.2);
    let c = pj(color, x, y, z, 81, 0.05, 3);
    if (ring > 0.88) c = shade(c, 0.82);
    if (y === Hh - 1) c = shade(c, 1.14);
    if (y === 0) c = shade(c, 0.8);
    if (x % 44 === 21 && y === Hh - 3 && z === Dd - 1) c = 0x8a8a92; // nail heads
    if (hash3(x >> 2, y >> 1, z, 82) < 0.025) c = 0x2a1a10; // knots / adze marks
    return c;
  });
  return mesh(g, [L / 2, Hh / 2, Dd / 2]);
}

/** Moss clumps that sit on top of beams and ledges (lenV in V units). */
export function makeMossStrip(lenV, seed = 1) {
  const rng = makeRng(seed);
  const L = Math.round(lenV * 2);
  const g = new VoxelGrid(L, 4, 6);
  for (let x = 0; x < L; x++) {
    if (!rng.chance(0.5)) continue;
    const z = rng.int(0, 5);
    g.set(x, 0, z, rng.pick([0x4a7a2a, 0x5a8a32, 0x3a6024]));
    if (rng.chance(0.5)) g.set(x, 1, z, rng.pick([0x6a9a3a, 0x5a8a32]));
    if (rng.chance(0.15)) g.set(x, 2, z, 0x7aaa44);
  }
  return mesh(g, [L / 2, 0, 3], { outline: false });
}

// ---------------------------------------------------------------- handheld
/** Smithing hammer held in the mole's paw: handle along -y from the grip, head across z.
 * userData.face marks the striking face (for syncing blows). */
export function makeHammer() {
  const g = new VoxelGrid(6, 16, 10);
  // handle: grain, a leather wrap where the paw holds it, a wedge in the eye
  for (let y = 3; y < 16; y++) for (let x = 2; x < 4; x++) for (let z = 4; z < 6; z++) {
    let c = y > 12 ? (y % 2 ? 0x5a2a1a : 0x7a3a24) : (y + x) % 4 === 0 ? 0x8a5a30 : 0x9a6a3a;
    if (x === 2 && y < 13) c = shade(c, 0.88);
    g.set(x, y, z, c);
  }
  // head: a striking face (bright) toward -z and a cross peen toward +z
  g.box(0, 0, 0, 6, 4, 10, (x, y, z) => {
    if (z === 0) return 0xc8ccd4; // polished face
    if (z > 7 && (y === 0 || y === 3)) return -1; // tapering peen
    if (z === 9) return 0x9aa0a8;
    return y === 3 ? 0x6a6870 : IRON;
  });
  g.box(2, 4, 4, 2, 1, 2, 0x8a5a2a);
  const m = mesh(g, [3, 15, 5]);
  const grp = new THREE.Group();
  grp.add(m);
  const face = new THREE.Object3D();
  face.position.set(0, -6.5 * V, -2.5 * V);
  grp.add(face);
  grp.userData.face = face;
  return grp;
}

/** Long tongs. Jaws at local -x, handles toward +x (len in V units). */
export function makeTongs(len = 16) {
  const L = len * 2;
  const g = new VoxelGrid(L + 4, 6, 8);
  g.box(4, 2, 0, L, 2, 2, (x, y) => (y === 3 ? IRON_HI : IRON));
  g.box(4, 2, 6, L, 2, 2, (x, y) => (y === 3 ? IRON_HI : IRON));
  g.box(8, 1, 1, 3, 4, 6, IRON_LO);
  g.set(9, 5, 4, 0x8a8890);
  g.box(0, 0, 0, 5, 6, 2, IRON_LO); g.box(0, 0, 6, 5, 6, 2, IRON_LO);
  return mesh(g, [0, 3, 4]);
}

/** Clay crucible with a spout. Returns { group, mat, melt, meltMat, chunks:[] }. */
export function makeCrucible(oreColor = 0xd9773f) {
  const group = new THREE.Group();
  const g = new VoxelGrid(20, 18, 18);
  for (let y = 0; y < 16; y++) {
    const r = 5.2 + Math.min(3.2, y * 0.35);
    g.cylinderY(9, 9, r, y, y + 1, (x, yy, z) => {
      const rr = Math.hypot(x + 0.5 - 9, z + 0.5 - 9);
      if (rr < r - 2 && yy > 1) return -1;
      let c = pp([0x5a4a44, 0x645048, 0x524640], x, yy, z, 3, 2);
      if (yy >= 14) c = 0x8a7a6a; // rim
      if (rr < r - 1 && yy > 1) c = 0x2a2220; // scorched inside
      if (yy === 4 || yy === 9) c = shade(c, 0.86);
      return c;
    });
  }
  g.box(15, 12, 8, 4, 2, 2, 0x6a5a50); g.box(17, 13, 8, 2, 1, 2, 0x7a6a5e); // spout
  const mat = hotMaterial();
  const body = mesh(g, [9, 0, 9], { material: mat });
  group.add(body);
  const meltMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const melt = new THREE.Mesh(new THREE.CylinderGeometry(3.1 * V, 2.6 * V, 0.6 * V, 14), meltMat);
  melt.position.y = 2 * V;
  melt.scale.set(0.6, 1, 0.6);
  group.add(melt);
  const chunks = [];
  const rng = makeRng(23);
  for (let i = 0; i < 6; i++) {
    const cg = new VoxelGrid(6, 4, 6);
    cg.ellipsoid(3, 2, 3, 2.4 + rng.range(0, 0.6), 1.8, 2.4, (x, y, z) => (hash3(x, y, z, i) < 0.35 ? oreColor : pp([0x6a5a4b, 0x5a4a3e], x, y, z, i, 1)));
    const c = mesh(cg, [3, 0, 3]);
    c.position.set(rng.range(-1.6, 1.6) * V, (2 + (i % 2) * 1.6) * V, rng.range(-1.6, 1.6) * V);
    c.rotation.y = rng.range(0, 3);
    group.add(c);
    chunks.push(c);
  }
  return { group, mat, melt, meltMat, chunks };
}

/** Iron ingot mold with a fill that rises. Returns { group, fill, fillMat, cavityTop }. */
export function makeMold() {
  const group = new THREE.Group();
  const g = new VoxelGrid(20, 6, 12);
  g.box(0, 0, 0, 20, 6, 12, (x, y, z) => (y === 5 ? (hash3(x, y, z, 3) < 0.2 ? RUST : IRON_HI) : pp([0x3a383c, 0x423e44], x, y, z, 4, 2)));
  for (let x = 4; x < 16; x++) for (let z = 2; z < 10; z++) { g.clear(x, 5, z); g.clear(x, 4, z); if (x > 4 && x < 15 && z > 2 && z < 9) { g.clear(x, 3, z); g.clear(x, 2, z); } }
  for (let x = 5; x < 15; x++) for (let z = 3; z < 9; z++) g.set(x, 1, z, 0x1a1618);
  // little handles at the ends
  g.box(0, 2, 4, 1, 2, 4, IRON_LO); g.box(19, 2, 4, 1, 2, 4, IRON_LO);
  group.add(mesh(g, [10, 0, 6]));
  const fillMat = new THREE.MeshToonMaterial({ color: 0x8a8f96, emissive: 0xff8a2a });
  const fill = new THREE.Mesh(new THREE.BoxGeometry(6 * V, 2 * V, 4 * V), fillMat);
  fill.position.y = 1 * V;
  fill.scale.y = 0.001;
  fill.visible = false;
  fill.userData.dynamic = true;
  group.add(fill);
  return { group, fill, fillMat, cavityTop: 3 * V };
}

/** A metal ingot (trapezoid bar with a stamped mole paw). */
export function makeIngot(color) {
  const g = new VoxelGrid(14, 6, 8);
  for (let y = 0; y < 6; y++) {
    const inset = Math.floor(y / 2);
    g.box(inset, y, inset > 1 ? 1 : 0, 14 - inset * 2, 1, 8 - (inset > 1 ? 2 : 0), (x, yy, z) => {
      let c = pj(color, x, yy, z, 3, 0.04, 2);
      if (yy === 5) c = shade(color, 1.18);
      if (yy < 2) c = shade(color, 0.86);
      return c;
    });
  }
  for (const [dx, dz] of [[0, 0], [1, 1], [-1, 1], [0, 2]]) g.set(7 + dx, 5, 3 + dz, shade(color, 0.78));
  const grp = new THREE.Group();
  const mat = hotMaterial();
  grp.add(mesh(g, [7, 0, 4], { material: mat }));
  grp.userData.mat = mat;
  return grp;
}

/** Small crystal cluster for infusions. */
export function makeCrystal(color, size = 1) {
  const g = new VoxelGrid(16, 20, 16);
  const hi = mixHex(color, 0xffffff, 0.45), lo = shade(color, 0.6);
  const spike = (x, z, h, lx, lz, r) => cyl(g, [x, 0, z], [x + lx, h, z + lz], r, (t, ang, d) => {
    if (t > 0.7 && d > (1 - t) / 0.3) return -1;
    if (t > 0.9) return 0xffffff;
    const f = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 6) % 3;
    return f === 0 ? hi : f === 1 ? color : lo;
  });
  spike(8, 8, 18, 0, 0, 2.6); spike(4, 9, 11, -2, 1, 1.8); spike(11, 6, 11, 2, -1, 1.8); spike(9, 12, 8, 1, 2, 1.4);
  const mat = glowMaterial();
  const m = mesh(g, [8, 0, 8], { material: mat, scale: P * size });
  return { mesh: m, mat };
}

/** Faceted gem for the pommel socket. */
export function makeGem(color, s = 1) {
  const g = new VoxelGrid(6, 6, 6);
  g.ellipsoid(3, 3, 3, 3, 3, 3, (x, y, z, dx, dy) => (dy > 0.5 ? mixHex(color, 0xffffff, 0.5) : dy < -0.4 ? shade(color, 0.7) : (x + z) % 2 ? color : mixHex(color, 0xffffff, 0.2)));
  return mesh(g, [3, 3, 3], { scale: P * s, kind: 'basic' });
}

/** Burlap sack of charcoal, slumped. */
export function makeSack() {
  const g = new VoxelGrid(18, 20, 16);
  g.ellipsoid(9, 7, 8, 8.4, 7.2, 7.2, (x, y, z) => (((x + y) % 2 === 0) !== ((z + y) % 2 === 0) ? 0xb89a6a : 0xc8aa78));
  g.box(6, 12, 6, 6, 4, 4, (x, y, z) => ((x + z + y) % 2 ? 0xa88a5a : 0xb89a6a));
  g.box(6, 16, 6, 6, 2, 4, 0x7a5a3a);
  for (let x = 4; x < 14; x++) g.set(x, 14, 8, 0x2a2426);
  // charcoal spilling from a hole
  for (const [x, y] of [[8, 3], [9, 3], [10, 2], [8, 2], [11, 1], [12, 1], [9, 1]]) g.set(x, y, 15, x % 2 ? 0x1e1a1c : 0x2e2a2c);
  return mesh(g, [9, 0, 8]);
}

/** A little heap of offcuts, bent bars and a cracked old blade. */
export function makeScrapPile(seed = 3) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(24, 8, 20);
  for (let i = 0; i < 16; i++) {
    const x = rng.int(1, 17), z = rng.int(1, 16), len = rng.int(4, 8), y = rng.int(0, 3);
    const col = rng.pick([0x5a5a62, 0x6a6e76, 0x8a5a3a, 0x7a4a2a, 0x4a4a50, 0xa86a3a, 0x7a7e86]);
    if (rng.chance(0.5)) g.box(x, y, z, len, 2, 2, (xx, yy) => (yy === y + 1 ? shade(col, 1.12) : col));
    else g.box(x, y, z, 2, 2, len, (xx, yy) => (yy === y + 1 ? shade(col, 1.12) : col));
  }
  // an old cracked blade
  g.box(4, 0, 14, 14, 1, 4, (x, y, z) => (z === 14 || z === 17 ? 0xb8c0c8 : 0x8a8f96));
  g.set(17, 0, 15, 0x1a1414); g.set(16, 0, 16, 0x1a1414);
  g.box(1, 0, 14, 3, 2, 4, 0x5a3a22);
  return mesh(g, [12, 0, 10]);
}

/** Three-legged wooden stool. */
export function makeStool() {
  const g = new VoxelGrid(16, 14, 16);
  g.cylinderY(8, 8, 7.2, 12, 14, (x, y, z) => {
    const r = Math.hypot(x + 0.5 - 8, z + 0.5 - 8);
    if (y === 13 && Math.round(r) % 3 === 0) return 0x8a5a32;
    return y === 12 ? WOOD_DK : woodGrain(x, z, x, y, z, 91, [0x9a6a3a, 0xa4703e]);
  });
  for (const [x, z] of [[2, 4], [12, 4], [7, 13]]) g.box(x, 0, z, 2, 12, 2, (xx, y, zz) => woodGrain(y, xx, xx, y, zz, 92));
  g.box(3, 4, 6, 10, 1, 2, WOOD_DK);
  return mesh(g, [8, 0, 8]);
}

/** Stacked split logs for the hearth. */
export function makeLogs() {
  const g = new VoxelGrid(24, 14, 12);
  const log = (x, y, z, len, r) => cyl(g, [x, y, z], [x + len, y, z], r, (t, ang, d) => {
    if (t < 0.03 || t > 0.97) return d < 0.3 ? 0xc8a070 : Math.round(d * 5) % 2 ? 0xd8b080 : 0xb08a5a;
    return Math.sin(ang * 7) > 0.5 ? 0x3e2616 : 0x5a3a22;
  });
  log(0, 2.4, 3.2, 24, 2.4); log(0, 2.4, 8.4, 23, 2.4); log(1, 6.6, 5.8, 22, 2.4); log(2, 10.6, 5.5, 20, 2.2);
  return mesh(g, [12, 0, 6]);
}

// ---------------------------------------------------------------- extra decor
/** A squat stone pedestal (h in V units) for the ingot mold. */
export function makeStoneBlock(h = 6.4) {
  const Hh = Math.round(h * 2);
  const g = new VoxelGrid(20, Hh, 20);
  g.box(0, 0, 0, 20, Hh, 20, (x, y, z) => {
    const course = Math.floor(y / 4);
    const u = (x + z + course * 5) % 10;
    if (y % 4 === 3 && y < Hh - 1) return 0x3a322e;
    if (u === 0 && (x === 0 || x === 19 || z === 0 || z === 19)) return 0x3a322e;
    let c = pp(STONES, x >> 1, course, z >> 1, 3, 1);
    if (y === Hh - 1) c = shade(c, 1.12);
    if (hash3(x, y, z, 5) < 0.05) c = shade(c, 0.8);
    return c;
  });
  return mesh(g, [10, 0, 10]);
}

/** An old barrel bristling with finished blades and hafts. */
export function makeBladeBarrel(seed = 4) {
  const rng = makeRng(seed);
  const R = 9, Hh = 18;
  const g = new VoxelGrid(30, 48, 30);
  const c0 = 15;
  g.cylinderY(c0, c0, R, 0, Hh, (x, y, z) => {
    const dx = x + 0.5 - c0, dz = z + 0.5 - c0;
    const r = Math.hypot(dx, dz);
    if (r < R - 1.6 && y > 1) return -1;
    if (y === 3 || y === Hh - 4) return IRON;
    const a = Math.atan2(dz, dx);
    const stave = Math.floor((a + Math.PI) / (Math.PI * 2) * 14);
    return pj(stave % 2 ? 0x6a4424 : 0x5e3c20, x, y, z, stave, 0.05, 2);
  });
  const METAL = [0xb8c0c8, 0xd9773f, 0x8a8f96, 0xc8a050, 0xa8b8c8];
  for (let i = 0; i < 6; i++) {
    const ax = c0 + rng.range(-4, 4), az = c0 + rng.range(-4, 4);
    const lx = rng.range(-0.25, 0.25), lz = rng.range(-0.25, 0.25);
    const len = rng.int(20, 28);
    const m = rng.pick(METAL);
    const sword = i < 4;
    if (sword) {
      // hilt up: grip, crossguard, pommel; blade down into the barrel
      for (let k = 0; k < len; k++) {
        const x = ax + lx * k, z = az + lz * k, y = Hh - 6 + k;
        if (k < len - 10) { g.set(x, y, z, k % 7 === 0 ? mixHex(m, 0xffffff, 0.4) : m); g.set(x + 1, y, z, shade(m, 0.85)); }
        else if (k < len - 8) for (let s = -3; s <= 3; s++) g.set(x + s, y, z, 0xc98a3a);
        else if (k < len - 2) g.set(x, y, z, k % 2 ? 0x3a2214 : 0x5a3420);
        else g.ellipsoid(x + 0.5, y, z + 0.5, 1.4, 1.2, 1.4, m);
      }
    } else {
      // a wooden haft with an axe head
      for (let k = 0; k < len; k++) g.set(ax + lx * k, Hh - 6 + k, az + lz * k, k % 6 === 0 ? 0x5a3a20 : WOOD_HI);
      const hx = ax + lx * len, hz = az + lz * len, hy = Hh - 6 + len;
      g.box(Math.round(hx) - 5, hy - 5, Math.round(hz), 5, 6, 1, (x, y) => (x === Math.round(hx) - 5 ? 0xd8e0e8 : y === hy ? 0x9aa0a8 : 0x7a8088));
    }
  }
  return mesh(g, [c0, 0, c0]);
}

/** A round shield with crossed swords, for the wall. Faces +z. */
export function makeWallDisplay() {
  const g = new VoxelGrid(44, 44, 6);
  // crossed swords behind
  for (const s of [-1, 1]) {
    for (let k = 0; k < 40; k++) {
      const x = 22 + s * (k - 20) * 0.92, y = 4 + k * 0.92;
      g.set(x, y, 1, k > 32 ? 0x3a2214 : k > 30 ? 0xc98a3a : (k % 5 === 0 ? 0xe8f0f8 : 0xb8c0c8));
      if (k <= 30) g.set(x + s, y, 1, 0x8a929a);
      if (k === 31) for (let d = -3; d <= 3; d++) g.set(x + d * 0.7, y - d * 0.7 * s, 1, 0xc98a3a);
    }
  }
  // the shield: wood planks, an iron rim, a boss, and a little painted mole paw
  for (let y = 0; y < 44; y++) for (let x = 0; x < 44; x++) {
    const d = Math.hypot(x + 0.5 - 22, y + 0.5 - 22);
    if (d > 16) continue;
    let c;
    if (d > 14.6) c = (Math.round(Math.atan2(y - 22, x - 22) * 6) % 3 === 0) ? 0x8a8890 : IRON;
    else if (d < 3.6) c = d < 2 ? 0xc8ccd4 : 0x6a6872;
    else {
      c = (Math.floor(x / 6) % 2) ? 0x9a3a2a : 0xe8d2a0;
      if (x % 6 === 0) c = shade(c, 0.8);
    }
    g.set(x, y, 3, c);
    g.set(x, y, 2, shade(c, 0.8));
    if (d > 14.6 || d < 3.6) g.set(x, y, 4, shade(c, 1.1));
  }
  return mesh(g, [22, 22, 3]);
}

/** A wooden water bucket with a rope handle. */
export function makeBucket() {
  const g = new VoxelGrid(14, 18, 14);
  g.cylinderY(7, 7, 6, 0, 10, (x, y, z) => {
    const r = Math.hypot(x + 0.5 - 7, z + 0.5 - 7);
    if (r < 4.8 && y > 1) return y === 8 ? ((x + z) % 3 ? 0x2a5a68 : 0x5a9aa8) : -1;
    if (y === 2 || y === 7) return IRON;
    return pj((Math.round(Math.atan2(z - 7, x - 7) * 3) % 2) ? 0x7a4a26 : 0x6a4020, x, y, z, 3, 0.05, 2);
  });
  for (let a = 0; a <= 12; a++) { const t = (a / 12) * Math.PI; g.set(7 + Math.cos(t) * 6, 10 + Math.sin(t) * 6, 7, 0xc8a070); }
  return mesh(g, [7, 0, 7]);
}

// ---------------------------------------------------------------- first-person extras
/** An iron chain along -y (links alternate facing), len in P voxels. Origin: top centre. */
export function makeChain(len = 20, seed = 1) {
  const g = new VoxelGrid(5, len, 5);
  for (let y = 0; y < len; y++) {
    const link = Math.floor(y / 3), k = y % 3;
    const face = link % 2 === 0;
    const c = (hash3(link, seed, 1, 4) < 0.3 ? 0x5a5860 : 0x48464e);
    if (k === 1) { if (face) { g.set(1, y, 2, c); g.set(3, y, 2, c); } else { g.set(2, y, 1, c); g.set(2, y, 3, c); } }
    else g.set(2, y, 2, k === 0 ? shade(c, 1.25) : c);
  }
  return mesh(g, [2.5, len, 2.5]);
}

/** A twisted hemp rope hanging along -y (len in half-P voxels). Origin: top centre. */
export function makeRope(len = 40, seed = 1) {
  const g = new VoxelGrid(2, len, 2);
  const C = [0xd0aa74, 0xb08a58, 0x8e6c42];
  for (let y = 0; y < len; y++) for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) {
    const k = (y + (x ? 2 : 0) + (z ? 1 : 0)) % 4;
    g.set(x, y, z, k === 0 ? C[2] : k === 3 ? C[0] : C[1]);
  }
  return mesh(g, [1, len, 1], { scale: P / 2 });
}

/**
 * The bellows pull: a pulley on a bracket with a chain dropping to a wooden T-handle, and a second
 * chain running off to the bellows. Origin: the pulley axle. Returns { group, handle, chain,
 * dropLen (P), setPull(k), handleRest (local) }. setPull(k) lowers the handle by up to ~4 V.
 */
export function makeBellowsPull(drop = 22) {
  const group = new THREE.Group();
  // bracket + pulley wheel (turns as the chain runs)
  const bg = new VoxelGrid(10, 6, 4);
  bg.box(0, 3, 0, 10, 2, 4, (x, y) => (y === 4 ? IRON_HI : IRON));
  bg.box(4, 0, 0, 2, 4, 1, IRON); bg.box(4, 0, 3, 2, 4, 1, IRON);
  const bracket = mesh(bg, [5, 1, 2]);
  group.add(bracket);
  const wg = new VoxelGrid(7, 7, 2);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const r = Math.hypot(x + 0.5 - 3.5, y + 0.5 - 3.5);
    if (r > 3.6) continue;
    for (let z = 0; z < 2; z++) wg.set(x, y, z, r < 1.2 ? 0x8a8890 : r > 2.8 ? 0x2e2c32 : (x + y) % 2 ? IRON : IRON_LO);
  }
  const wheel = mesh(wg, [3.5, 3.5, 1]);
  wheel.userData.dynamic = true;
  group.add(wheel);
  // the drop rope and the handle (dynamic: the rope pays out with the pull)
  const chain = makeRope(drop * 2, 3);
  chain.position.set(3.5 * P, -3.5 * P, 0);
  chain.userData.dynamic = true;
  group.add(chain);
  const hg = new VoxelGrid(12, 6, 4);
  hg.box(0, 0, 0, 12, 3, 4, (x, y, z) => (x < 1 || x > 10 ? WOOD_DK : woodGrain(x, z, x, y, z, 77, [0x9a6a3a, 0x8e6034])));
  hg.box(5, 3, 1, 2, 3, 2, (x, y) => (y === 5 ? IRON_HI : IRON)); // iron eye
  for (const x of [3, 6, 9]) hg.set(x, 2, 3, 0x5a3420); // grip notches
  const handle = mesh(hg, [6, 0, 2]);
  handle.userData.dynamic = true;
  group.add(handle);
  const rest = new THREE.Vector3(3.5 * P, -(drop + 3.5 + 3) * P, 0);
  const setPull = (k) => {
    const extra = k * 8;
    chain.scale.set(1, (drop + extra) / drop, 1);
    handle.position.set(rest.x, rest.y - extra * P, 0);
    wheel.rotation.z = -k * 2.2;
  };
  setPull(0);
  return { group, handle, chain, wheel, setPull, dropLen: drop };
}

/**
 * A stretchable chain segment between two world points: add it to the scene root, then call
 * set(a, b) (world coordinates). s = world size of one model unit.
 */
export function makeChainSpan(seed = 5, s = 1) {
  const N = 80;
  const ch = makeRope(N, seed);
  const grp = new THREE.Group();
  ch.rotation.x = -Math.PI / 2; // the chain (hanging along -y from its top) now runs along +z
  grp.add(ch);
  grp.scale.setScalar(s);
  grp.userData.dynamic = true;
  grp.set = (a, b) => {
    grp.position.copy(a);
    grp.lookAt(b);
    ch.scale.set(1, a.distanceTo(b) / s / (N * P / 2), 1);
  };
  return grp;
}

/** A plank door in a stone-and-timber frame, facing +z. W/H in P voxels. Origin: floor centre. */
export function makeDoor(W = 32, H = 54) {
  const g = new VoxelGrid(W + 10, H + 6, 6);
  const cx = (W + 10) / 2;
  // stone jambs and a timber lintel
  for (const x0 of [0, W + 5]) g.box(x0, 0, 0, 5, H + 1, 5, (x, y, z) => {
    const course = Math.floor(y / 6);
    if (y % 6 === 5) return 0x2e2622;
    return pp(STONES, x >> 1, course, z, 9 + x0, 1);
  });
  g.box(0, H + 1, 0, W + 10, 5, 6, (x, y, z) => (y === H + 5 ? shade(WOOD_HI, 0.9) : woodGrain(x, y, x, y, z, 88, [0x5a3a22, 0x50341e])));
  // the door: vertical planks, two iron straps with nail heads, a ring pull and a little mole-hole peephole
  g.box(5, 0, 1, W, H + 1, 3, (x, y, z) => {
    const u = x - 5;
    const plank = Math.floor(u / 6);
    let c = woodGrain(y, u - plank * 6, x, y, z, 90 + plank, [0x7a4a28, 0x70442a, 0x84502c]);
    if (u % 6 === 0) c = 0x3a2416;
    const strap = Math.abs(y - 12) <= 1 || Math.abs(y - (H - 12)) <= 1;
    if (strap && z === 3) c = (u % 5 === 2) ? 0x8a8890 : IRON;
    else if (strap) c = IRON_LO;
    return c;
  });
  // straps stand proud with nail heads
  for (const yy of [12, H - 12]) for (let x = 6; x < W + 4; x++) { g.set(x, yy, 4, x % 5 === 2 ? 0x9a9aa2 : IRON); if (x > W - 4) { g.set(x, yy - 1, 4, IRON); g.set(x, yy + 1, 4, IRON); } }
  // ring pull
  const rx = 5 + W - 7, ry = Math.round(H * 0.48);
  for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; g.set(rx + Math.round(Math.cos(t) * 2.4), ry + Math.round(Math.sin(t) * 2.4) - 2, 5, 0xc8a040); }
  g.box(rx - 1, ry, 4, 2, 2, 1, 0x8a6a24);
  // round peephole with a brass rim
  const hx = cx, hy = H - 8;
  for (let y = hy - 3; y <= hy + 3; y++) for (let x = hx - 3; x <= hx + 3; x++) {
    const r = Math.hypot(x + 0.5 - hx, y + 0.5 - hy);
    if (r < 1.8) { g.set(x, y, 3, 0x120c08); g.set(x, y, 2, 0x120c08); g.set(x, y, 1, 0x2a1c12); }
    else if (r < 3) g.set(x, y, 3, r > 2.4 ? BRASS_LO : BRASS);
  }
  return mesh(g, [cx, 0, 3]);
}

/** A rough stone plinth course for the foot of a wall (len along x, P voxels). */
export function makePlinth(len = 64, h = 8, d = 4, seed = 2) {
  const g = new VoxelGrid(len, h, d);
  g.box(0, 0, 0, len, h, d, (x, y, z) => {
    const course = Math.floor(y / 4);
    const u = x + course * 5;
    if (y % 4 === 3 && y < h - 1) return 0x2e2622;
    if (u % 9 === 0) return 0x2e2622;
    let c = pp(STONES, Math.floor(u / 9), course, z >> 2, seed, 1);
    if (y === h - 1) c = shade(c, 1.12);
    if (hash3(x, y, z, seed + 3) < 0.05) c = shade(c, 0.82);
    if (hash3(x >> 1, y, seed, 6) < 0.05 && z === d - 1) c = pp([0x4a7a2a, 0x5a8a32], x, y, z, 3, 1); // moss
    return c;
  });
  return mesh(g, [0, 0, 0]);
}

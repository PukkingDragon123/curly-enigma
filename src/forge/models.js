// Voxel models for the blacksmith corner. One voxel = 1/16 world unit (character scale).
// Builders return THREE groups plus handles for the parts the scene animates.
import * as THREE from 'three';
import { VoxelGrid, voxelMesh, voxelMaterial } from '../gfx/Voxel.js';
import { makeRng, mixHex, shade } from '../core/util.js';

export const V = 1 / 16;

function h3(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const jit = (c, x, y, z, amt = 0.06, seed = 1) => shade(c, 1 + ((h3(x + seed * 7, y, z) % 1000) / 1000 - 0.5) * 2 * amt);

function mesh(grid, pivot, opts = {}) {
  return voxelMesh(grid, { pivot, scale: opts.scale ?? V, kind: opts.kind || 'toon', outline: opts.outline ?? true, material: opts.material, ao: opts.ao });
}

/** Unlit glowing voxel material (unique, so its color can be animated). */
export function glowMaterial() {
  return voxelMaterial('basic', { unique: true });
}

/** Lit voxel material with its own emissive (for glowing hot metal). */
export function hotMaterial() {
  return voxelMaterial('toon', { unique: true, emissive: 0x000000 });
}

// ---------------------------------------------------------------- stone helpers
const STONES = [0x7a7068, 0x6e655e, 0x857a70, 0x645a54, 0x726a62];
function stone(u, v, seed = 1, mortar = 0x3a302a) {
  const row = Math.floor(v / 3);
  const uu = u + (row % 2) * 2 + 40;
  if (v % 3 === 0 || uu % 5 === 0) return mortar;
  const h = h3(Math.floor(uu / 5), row, seed);
  return shade(STONES[h % STONES.length], 0.9 + (h >> 8) % 20 / 100);
}

// ---------------------------------------------------------------- hearth
/**
 * Stone hearth with a recessed coal bed, firebrick back, ash-pit arch and a copper hood.
 * Origin: floor center of the base. Returns { group, coalMat, emberMat, firePos, bedY, bed:{w,d}, hood }.
 */
export function makeHearth() {
  const W = 24, D = 18, H = 13;
  const g = new VoxelGrid(W, H + 12, D);
  g.box(0, 0, 0, W, H, D, (x, y, z) => {
    const outer = x === 0 || x === W - 1 || z === D - 1 || z === 0 || y === H - 1;
    if (!outer) return 0x2a2422;
    const u = z === D - 1 || z === 0 ? x : z + 3;
    return stone(u, y, 3);
  });
  // capstone rim
  g.box(0, H - 1, 0, W, 1, D, (x, y, z) => jit(0x8a8078, x, y, z, 0.05));
  g.box(-1 + 1, H - 1, D - 1, W, 1, 1, (x, y, z) => jit(0x968a80, x, y, z, 0.04));
  // firepot recess
  const fx0 = 3, fx1 = W - 3, fz0 = 3, fz1 = D - 3;
  for (let x = fx0; x < fx1; x++) for (let z = fz0; z < fz1; z++) { g.clear(x, H - 1, z); g.clear(x, H - 2, z); g.set(x, H - 3, z, 0x1a1414); }
  // ash pit arch at the front
  for (let x = 8; x < 16; x++) for (let y = 0; y < 5; y++) {
    const dx = (x + 0.5 - 12) / 4, dy = y / 5;
    if (dx * dx + dy * dy * 0.9 < 1 || y < 3) { g.clear(x, y, D - 1); g.clear(x, y, D - 2); g.set(x, y, D - 3, 0x120c0a); }
  }
  // firebrick back wall rising behind the coals
  for (let x = 2; x < W - 2; x++) for (let y = H; y < H + 9; y++) for (let z = 0; z < 3; z++) {
    const row = Math.floor((y - H) / 2);
    const u = x + (row % 2) * 2;
    const mortar = (y - H) % 2 === 1 || u % 4 === 0;
    const soot = Math.min(1, (y - H) / 9);
    g.set(x, y, z, mortar ? 0x2a1c16 : mixHex(jit(0x8a3a28, x, y, z, 0.1), 0x241614, soot * 0.6));
  }
  // tuyere on the left side (bellows nozzle socket)
  g.box(-0 + 0, H - 5, 7, 1, 3, 3, 0x3a3436);
  const group = new THREE.Group();
  group.add(mesh(g, [W / 2, 0, D / 2]));

  // coal bed: dark lumps around the edges, glowing heap in the middle
  const rng = makeRng(17);
  const cw = fx1 - fx0, cd = fz1 - fz0;
  const dark = new VoxelGrid(cw, 4, cd);
  const hot = new VoxelGrid(cw, 4, cd);
  const HOT = [0xff9a2a, 0xffc04a, 0xe0501a, 0xff7a1a, 0xffe08a, 0xd8401a];
  for (let x = 0; x < cw; x++) for (let z = 0; z < cd; z++) {
    const dx = (x + 0.5 - cw / 2) / (cw / 2), dz = (z + 0.5 - cd / 2) / (cd / 2);
    const r = Math.sqrt(dx * dx * 0.8 + dz * dz);
    const hgt = Math.max(1, Math.round(3 - r * 1.8 + rng.range(-0.6, 0.6)));
    for (let y = 0; y < hgt; y++) {
      const glowing = r < 0.75 && (y === hgt - 1 ? rng.chance(0.75) : rng.chance(0.25));
      if (glowing) hot.set(x, y, z, rng.pick(HOT));
      else dark.set(x, y, z, rng.chance(0.2) ? 0x3a3236 : rng.pick([0x1e1a1c, 0x262022, 0x2e2628]));
    }
  }
  const bedY = (H - 3) * V;
  const coalDark = mesh(dark, [cw / 2, 0, cd / 2]);
  const coalMat = glowMaterial();
  const coalHot = mesh(hot, [cw / 2, 0, cd / 2], { material: coalMat, outline: false });
  for (const m of [coalDark, coalHot]) { m.position.set(0, bedY + V, (fz0 + cd / 2 - D / 2) * V); group.add(m); }

  // glowing embers in the ash pit
  const pit = new VoxelGrid(8, 2, 2);
  for (let x = 0; x < 8; x++) if (rng.chance(0.6)) pit.set(x, 0, rng.int(0, 1), rng.pick(HOT));
  const emberMat = glowMaterial();
  const pitMesh = mesh(pit, [4, 0, 1], { material: emberMat, outline: false });
  pitMesh.position.set(0, 0, (D / 2 - 3.5) * V);
  group.add(pitMesh);

  // copper hood + chimney pipe
  const hood = makeHood();
  hood.position.set(0, (H + 13) * V, -1 * V);
  group.add(hood);
  return {
    group, coalMat, emberMat,
    bedY: bedY + 3 * V,
    firePos: new THREE.Vector3(0, bedY + 3 * V, (fz0 + cd / 2 - D / 2) * V),
    bed: { w: cw * V, d: cd * V },
    size: { w: W * V, h: H * V, d: D * V },
    tuyere: new THREE.Vector3(-W / 2 * V, (H - 4) * V, (8.5 - D / 2) * V),
  };
}

function makeHood() {
  const W = 28, D = 21, HH = 13, PIPE = 30;
  const g = new VoxelGrid(W, HH + PIPE, D);
  const COP = 0xb8683c;
  for (let y = 0; y < HH; y++) {
    const t = y / (HH - 1);
    const hw = Math.round((W / 2) * (1 - t * 0.62)), hd = Math.round((D / 2) * (1 - t * 0.55));
    const cx = W / 2, cz = D / 2;
    for (let x = cx - hw; x < cx + hw; x++) for (let z = cz - hd; z < cz + hd; z++) {
      const edge = x === cx - hw || x === cx + hw - 1 || z === cz - hd || z === cz + hd - 1;
      if (!edge && y !== HH - 1) continue;
      let c = jit(COP, x, y, z, 0.07);
      if (y === 0) c = 0x8a4a28;
      if (y === 1 && (x + z) % 3 === 0) c = 0x5a2e18; // rivets
      if (h3(x, y, z) % 23 === 0) c = 0x5a9a7a; // patina
      if (y > HH - 4) c = mixHex(c, 0x3a2a24, 0.35);
      g.set(x, y, z, c);
    }
  }
  // chimney pipe
  for (let y = HH; y < HH + PIPE; y++) for (let x = W / 2 - 4; x < W / 2 + 4; x++) for (let z = D / 2 - 4; z < D / 2 + 4; z++) {
    const edge = x === W / 2 - 4 || x === W / 2 + 3 || z === D / 2 - 4 || z === D / 2 + 3;
    if (!edge) continue;
    let c = (y - HH) % 8 === 0 ? 0x2a2426 : jit(0x3e3a3c, x, y, z, 0.08);
    g.set(x, y, z, c);
  }
  // a lucky horseshoe
  const hs = [[0, 0], [0, 1], [0, 2], [1, 3], [2, 3], [3, 3], [4, 2], [4, 1], [4, 0]];
  for (const [dx, dy] of hs) g.set(W / 2 - 2 + dx, 3 + dy, D - 1 - Math.floor(3 * 0.55) + 1, 0x8a8a92);
  const m = mesh(g, [W / 2, 0, D / 2]);
  const grp = new THREE.Group();
  grp.add(m);
  return grp;
}

// ---------------------------------------------------------------- bellows
/**
 * Leather bellows on a trestle, nozzle toward +x. setCompress(k) squeezes it (0..1).
 * Origin: floor below the nozzle hinge. Returns { group, setCompress, handle (Object3D at the handle grip), nozzle }.
 */
export function makeBellows() {
  const L = 14, Wd = 11;
  const group = new THREE.Group();
  const shape = (x) => { // half-width of the pear-shaped board at x (0 = hinge, L = back)
    const t = x / L;
    return Math.max(1.5, Math.round((Wd / 2) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5 + 0.12)));
  };
  const board = (top) => {
    const g = new VoxelGrid(L + 4, 2, Wd + 2);
    for (let x = 0; x < L; x++) {
      const hw = shape(x);
      for (let z = Math.round(Wd / 2 - hw) + 1; z < Math.round(Wd / 2 + hw) + 1; z++) g.set(x, 0, z, jit(top ? 0x9a6436 : 0x7a4a26, x, 0, z, 0.06));
    }
    // brass studs on the top board
    if (top) for (let x = 3; x < L; x += 3) { g.set(x, 1, Math.round(Wd / 2) + 1 - shape(x) + 1, 0xd8a84a); g.set(x, 1, Math.round(Wd / 2) + shape(x) - 1, 0xd8a84a); }
    return g;
  };
  const bottom = mesh(board(false), [0, 0, Wd / 2 + 1]);
  // leather wedge: taller toward the back
  const lg = new VoxelGrid(L, 8, Wd + 2);
  for (let x = 0; x < L; x++) {
    const hw = shape(x) - 0.3;
    const hgt = Math.max(1, Math.round(1 + (x / L) * 7));
    for (let y = 0; y < hgt; y++) {
      const pleat = y % 2 === 1;
      const inset = pleat ? 1 : 0;
      for (let z = Math.round(Wd / 2 - hw + inset) + 1; z < Math.round(Wd / 2 + hw - inset) + 1; z++) {
        lg.set(x, y, z, pleat ? 0x4a2814 : jit(0x6a3a1e, x, y, z, 0.08));
      }
    }
  }
  const leather = mesh(lg, [0, 0, Wd / 2 + 1]);
  const top = mesh(board(true), [0, 0, Wd / 2 + 1]);
  // handle at the back end of the top board
  const hg = new VoxelGrid(3, 7, 7);
  hg.box(1, 0, 3, 1, 6, 1, 0x7a4a26);
  hg.box(1, 6, 0, 1, 1, 7, 0x8a5a2e);
  const handle = mesh(hg, [1.5, 0, 3.5]);
  handle.position.set((L - 1.5) * V, V, 0);
  handle.rotation.z = 0.5;
  const topPivot = new THREE.Group();
  topPivot.add(top, handle);
  const grip = new THREE.Object3D();
  grip.position.set((L - 1.5) * V + Math.sin(-0.5) * 6 * V, 7 * V, 0);
  topPivot.add(grip);

  // nozzle pipe
  const ng = new VoxelGrid(7, 3, 3);
  ng.box(0, 0, 0, 7, 3, 3, (x) => (x === 6 ? 0x2a2426 : 0x4a4448));
  ng.box(0, 0, 0, 2, 3, 3, 0x6a5a40);
  const nozzle = mesh(ng, [7, 1.5, 1.5]);

  // trestle stand
  const sg = new VoxelGrid(L + 2, 6, Wd + 2);
  for (const sx of [2, L - 2]) {
    sg.box(sx, 0, 1, 1, 6, 1, 0x5a3a20); sg.box(sx, 0, Wd, 1, 6, 1, 0x5a3a20);
    sg.box(sx, 5, 1, 1, 1, Wd, 0x6a4424);
  }
  sg.box(2, 2, Math.round(Wd / 2), L - 3, 1, 1, 0x5a3a20);
  const stand = mesh(sg, [0, 0, (Wd + 2) / 2]);

  const body = new THREE.Group(); // positioned so the hinge is at the origin x
  body.position.y = 6 * V;
  bottom.position.set(0, 0, 0);
  leather.position.set(0, 2 * V, 0);
  topPivot.position.set(0, 2 * V, 0);
  body.add(bottom, leather, topPivot);
  stand.position.set(0, 0, 0);
  // flip so the nozzle (hinge at x=0) points toward +x: mirror by rotating 180° around y
  const flip = new THREE.Group();
  flip.rotation.y = Math.PI;
  flip.add(body, stand);
  nozzle.position.set(7 * V, 6 * V + 2.5 * V, 0);
  group.add(flip, nozzle);

  const setCompress = (k) => {
    const s = 1 - 0.62 * k;
    leather.scale.y = s;
    // top board rests on the leather wedge: rise = s * (7/L) per voxel of length
    topPivot.position.y = 2 * V + s * V;
    topPivot.rotation.z = Math.atan2(s * 7 * V, L * V);
  };
  setCompress(0);
  return { group, setCompress, grip, nozzleTip: new THREE.Vector3(7 * V, 8.5 * V, 0), length: L * V };
}

// ---------------------------------------------------------------- anvil & stump
/** Anvil on a tree stump. Origin: floor center. Returns { group, faceY, faceLen, faceX }. */
export function makeAnvil() {
  const group = new THREE.Group();
  // stump (4 voxels) with bark and growth rings
  const sg = new VoxelGrid(13, 4, 13);
  sg.cylinderY(6.5, 6.5, 6.2, 0, 3, (x, y, z) => {
    const r = Math.hypot(x + 0.5 - 6.5, z + 0.5 - 6.5);
    if (r > 5.2) return jit(h3(x, 0, z) % 3 ? 0x4a2e1c : 0x5a3a24, x, y, z, 0.1);
    return 0x6a4428;
  });
  sg.cylinderY(6.5, 6.5, 5.6, 3, 4, (x, y, z) => {
    const r = Math.hypot(x + 0.5 - 6.5, z + 0.5 - 6.5);
    return Math.round(r) % 2 ? 0xa8804e : 0xc09460;
  });
  for (const [x, z] of [[0, 6], [12, 7], [6, 0], [7, 12]]) sg.box(x, 0, z, 1, 1, 1, 0x4a2e1c);
  group.add(mesh(sg, [6.5, 0, 6.5]));
  // anvil body along x: horn toward -x, heel toward +x, polished face on top (5 voxels tall)
  const L = 20, ag = new VoxelGrid(L + 2, 5, 7);
  const IRON = 0x3e3c40, FACE = 0x8a8c94;
  ag.box(6, 0, 1, 9, 1, 5, IRON);
  ag.box(5, 0, 0, 2, 1, 7, IRON); ag.box(14, 0, 0, 2, 1, 7, IRON);
  ag.box(8, 1, 2, 5, 1, 3, IRON);
  ag.box(4, 2, 1, 15, 2, 5, (x, y, z) => jit(IRON, x, y, z, 0.05));
  ag.box(4, 4, 1, 15, 1, 5, (x, y, z) => jit(FACE, x, y, z, 0.03));
  ag.box(19, 3, 1, 2, 2, 5, IRON);
  ag.set(17, 4, 3, 0x1a1a1c); ag.set(15, 4, 3, 0x1a1a1c);
  for (let x = 0; x < 4; x++) { const r = 0.6 + x * 0.55; for (let y = 2; y < 5; y++) for (let z = 1; z < 6; z++) if (Math.abs(y - 3.5) <= r && Math.abs(z - 3) <= r + 0.2) ag.set(x, y, z, jit(IRON, x, y, z, 0.05)); }
  const anvil = mesh(ag, [L / 2 + 1, 0, 3.5]);
  anvil.position.y = 4 * V;
  group.add(anvil);
  return { group, faceY: 9 * V, faceLen: 15 * V, faceX: (11.5 - (L / 2 + 1)) * V };
}

/** Low wooden step the mole stands on at the anvil. */
export function makePlatform() {
  const g = new VoxelGrid(14, 3, 9);
  g.box(0, 0, 0, 14, 3, 9, (x, y, z) => (y === 2 ? (x % 5 === 0 ? 0x4a2c18 : jit(0x8a5a32, x, y, z, 0.06)) : jit(0x5a3a20, x, y, z, 0.06)));
  return mesh(g, [7, 0, 4.5]);
}

// ---------------------------------------------------------------- quench barrel
/** Barrel with iron hoops and an open top. Returns { group, waterY, radius }. */
export function makeBarrel(waterTex) {
  const R = 5.5, Hh = 10;
  const g = new VoxelGrid(12, Hh, 12);
  g.cylinderY(6, 6, R, 0, Hh, (x, y, z) => {
    const r = Math.hypot(x + 0.5 - 6, z + 0.5 - 6);
    if (r < R - 1.1 && y > 0) return -1;
    if (y === 2 || y === Hh - 3) return 0x3a3638;
    const a = Math.atan2(z + 0.5 - 6, x + 0.5 - 6);
    const stave = Math.floor((a + Math.PI) / (Math.PI * 2) * 14);
    return jit(stave % 2 ? 0x7a4a26 : 0x6a4020, x, y, z, 0.05);
  });
  const group = new THREE.Group();
  group.add(mesh(g, [6, 0, 6]));
  const water = new THREE.Mesh(new THREE.CircleGeometry((R - 1.1) * V, 20), new THREE.MeshLambertMaterial({ map: waterTex, emissive: 0x0a1a20 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = (Hh - 1.6) * V;
  group.add(water);
  return { group, water, waterY: water.position.y, radius: (R - 1) * V };
}

// ---------------------------------------------------------------- grindstone
export function makeGrindstone() {
  const group = new THREE.Group();
  const fg = new VoxelGrid(12, 12, 14);
  for (const z of [1, 11]) { fg.box(2, 0, z, 1, 10, 1, 0x5a3a20); fg.box(9, 0, z, 1, 10, 1, 0x5a3a20); fg.box(2, 9, z, 8, 1, 1, 0x6a4424); }
  fg.box(3, 1, 3, 6, 2, 8, (x, y, z) => (y === 2 && x > 3 && x < 8 && z > 3 && z < 10 ? 0x2a5a68 : 0x6a4424)); // trough
  group.add(mesh(fg, [6, 0, 7]));
  const wg = new VoxelGrid(13, 13, 3);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    const r = Math.hypot(x + 0.5 - 6.5, y + 0.5 - 6.5);
    if (r <= 6.3) for (let z = 0; z < 3; z++) wg.set(x, y, z, r < 1.2 ? 0x3a3436 : jit(h3(x, y, z) % 5 === 0 ? 0x9a8a6a : 0xb8a684, x, y, z, 0.05));
  }
  const wheel = mesh(wg, [6.5, 6.5, 1.5]);
  wheel.rotation.y = Math.PI / 2;
  const hub = new THREE.Group();
  hub.position.set(0, 9.5 * V, 0);
  hub.add(wheel);
  group.add(hub);
  const cg = new VoxelGrid(2, 5, 2);
  cg.box(0, 0, 0, 1, 5, 1, 0x3a3436); cg.box(0, 4, 0, 2, 1, 1, 0x7a4a26);
  const crank = mesh(cg, [0.5, 0, 0.5]);
  crank.position.set(0, 0, 7 * V);
  hub.add(crank);
  return { group, wheel, hub, contact: new THREE.Vector3(0, 9.5 * V + 6.5 * V, 0) };
}

// ---------------------------------------------------------------- racks, benches, decor
export function makeToolRack() {
  const g = new VoxelGrid(26, 16, 3);
  g.box(0, 12, 0, 26, 3, 1, (x, y, z) => jit(0x6a4424, x, y, z, 0.06));
  for (let x = 2; x < 26; x += 4) g.box(x, 12, 1, 1, 1, 2, 0x3a2a1c);
  const IRON = 0x3a383c;
  // tongs
  for (const [x, w] of [[2, 1], [6, 2]]) {
    g.box(x, 1, 2, 1, 11, 1, IRON); g.box(x + w, 1, 2, 1, 11, 1, IRON);
    g.box(x, 0, 2, w + 1, 1, 1, 0x2a2a2e);
  }
  // hammers
  g.box(11, 3, 2, 1, 9, 1, 0x8a5a32); g.box(9, 1, 2, 5, 2, 1, IRON);
  g.box(16, 4, 2, 1, 8, 1, 0x7a4a26); g.box(15, 2, 2, 3, 2, 1, 0x5a585e);
  // file & punch
  g.box(20, 3, 2, 1, 9, 1, 0x6a6a72); g.box(20, 9, 2, 1, 3, 1, 0x7a4a26);
  g.box(23, 6, 2, 1, 6, 1, 0x4a484c);
  return mesh(g, [13, 0, 0]);
}

/** Workbench along a wall with a vise, candle and a balance fulcrum. Returns { group, topY, fulcrumPos, candleMat }. */
export function makeWorkbench() {
  const group = new THREE.Group();
  const W = 28, D = 11, H = 10;
  const g = new VoxelGrid(W, H, D);
  g.box(0, H - 2, 0, W, 2, D, (x, y, z) => (y === H - 1 ? jit(0x9a6a3a, x, y, z, 0.07) : 0x6a4424));
  for (const x of [1, W - 3]) for (const z of [1, D - 3]) g.box(x, 0, z, 2, H - 2, 2, 0x5a3a20);
  g.box(1, 2, 1, W - 2, 1, D - 2, 0x5a3a20); // lower shelf
  // stuff on the lower shelf: coal sack & ingots
  g.box(3, 3, 3, 5, 4, 5, (x, y, z) => jit(0xb89a6a, x, y, z, 0.08));
  g.box(10, 3, 3, 4, 1, 2, 0x8a8f96); g.box(10, 4, 3, 4, 1, 2, 0xd9773f);
  group.add(mesh(g, [W / 2, 0, D / 2]));
  // vise
  const vg = new VoxelGrid(5, 5, 6);
  vg.box(0, 0, 0, 5, 2, 4, 0x3a383c); vg.box(0, 2, 0, 5, 3, 1, 0x4a484c); vg.box(0, 2, 3, 5, 3, 1, 0x4a484c); vg.box(2, 3, 4, 1, 1, 2, 0x2a2a2e);
  const vise = mesh(vg, [2.5, 0, 3]);
  vise.position.set((W / 2 - 4) * V, H * V, -1 * V);
  group.add(vise);
  // candle
  const cg = new VoxelGrid(3, 5, 3);
  cg.box(0, 0, 0, 3, 1, 3, 0x6a5a40); cg.box(1, 1, 1, 1, 3, 1, 0xf0e6c8);
  const candle = mesh(cg, [1.5, 0, 1.5]);
  candle.position.set(-(W / 2 - 3) * V, H * V, -2 * V);
  group.add(candle);
  const fg = new VoxelGrid(1, 2, 1);
  fg.set(0, 0, 0, 0xffd27a); fg.set(0, 1, 0, 0xfff0b0);
  const candleMat = glowMaterial();
  const flame = mesh(fg, [0.5, 0, 0.5], { material: candleMat, outline: false });
  flame.position.set(-(W / 2 - 3) * V, (H + 4) * V, -2 * V);
  group.add(flame);
  // balance fulcrum (wooden wedge with a steel edge)
  const fu = new VoxelGrid(7, 6, 5);
  for (let y = 0; y < 6; y++) { const hw = Math.max(0, 3 - Math.floor(y / 2)); fu.box(3 - hw, y, 0, hw * 2 + 1, 1, 5, y === 5 ? 0xb8c0c8 : jit(0x7a4a26, 0, y, 0, 0.05)); }
  const fulcrum = mesh(fu, [3.5, 0, 2.5]);
  fulcrum.position.set(2 * V, H * V, 1 * V);
  group.add(fulcrum);
  return { group, topY: H * V, fulcrum, fulcrumTop: new THREE.Vector3(2 * V, (H + 6) * V, 1 * V), candleMat, flame };
}

export function makeCoalBin() {
  const g = new VoxelGrid(12, 9, 9);
  g.box(0, 0, 0, 12, 6, 9, (x, y, z) => {
    const edge = x === 0 || x === 11 || z === 0 || z === 8 || y === 0;
    if (!edge) return -1;
    return y % 3 === 0 ? 0x4a2e1a : jit(0x6a4424, x, y, z, 0.06);
  });
  const rng = makeRng(5);
  for (let x = 1; x < 11; x++) for (let z = 1; z < 8; z++) {
    const hgt = 5 + Math.round(2.2 - Math.hypot(x - 5.5, z - 4) * 0.45 + rng.range(-0.4, 0.4));
    for (let y = 1; y < hgt; y++) g.set(x, y, z, rng.chance(0.15) ? 0x4a4650 : rng.pick([0x1e1a1c, 0x262224, 0x2e2a2c]));
  }
  // shovel
  g.box(9, 6, 2, 1, 3, 1, 0x7a4a26); g.box(8, 5, 1, 3, 2, 3, 0x4a484c);
  return mesh(g, [6, 0, 4.5]);
}

export function makeCrate() {
  const g = new VoxelGrid(10, 8, 10);
  g.box(0, 0, 0, 10, 8, 10, (x, y, z) => {
    const frame = (x === 0 || x === 9) && (y === 0 || y === 7) || (z === 0 || z === 9) && (y === 0 || y === 7) || (x === 0 || x === 9) && (z === 0 || z === 9);
    if (frame) return 0x5a3a20;
    return jit(y % 3 === 0 ? 0x7a5030 : 0x8a5a34, x, y, z, 0.06);
  });
  return mesh(g, [5, 0, 5]);
}

/** Wall shelf with jars, a pot of glowing blue mushrooms and an ingot. Returns { group, glowMat }. */
export function makeShelf() {
  const group = new THREE.Group();
  const g = new VoxelGrid(22, 10, 5);
  g.box(0, 3, 0, 22, 1, 5, (x, y, z) => jit(0x8a5a32, x, y, z, 0.06));
  g.box(2, 0, 0, 1, 3, 1, 0x4a2e1a); g.box(19, 0, 0, 1, 3, 1, 0x4a2e1a);
  // jars
  for (const [x, c, hgt] of [[1, 0xc8e0d0, 4], [4, 0xd8c8a0, 3], [12, 0x9ad0c0, 5]]) {
    g.box(x, 4, 1, 2, hgt, 2, c); g.box(x, 4 + hgt, 1, 2, 1, 2, 0x7a4a26);
    g.set(x, 5, 1, mixHex(c, 0x6a3a1a, 0.5));
  }
  g.box(15, 4, 1, 4, 1, 2, 0xd9773f); g.box(15, 5, 1, 4, 1, 2, 0xf2c23a);
  g.box(7, 4, 1, 4, 2, 3, 0xb8603a); // pot
  group.add(mesh(g, [11, 0, 0]));
  const mg = new VoxelGrid(4, 4, 3);
  mg.box(0, 0, 1, 1, 2, 1, 0xd8f0ff); mg.box(2, 0, 0, 1, 3, 1, 0xd8f0ff);
  mg.box(-1 + 1, 2, 0, 2, 1, 2, 0x5ac8ff); mg.box(1, 3, 0, 3, 1, 2, 0x7ad8ff);
  const glowMat = glowMaterial();
  const shrooms = mesh(mg, [2, 0, 1.5], { material: glowMat });
  shrooms.position.set(-2 * V, 6 * V, 2 * V);
  group.add(shrooms);
  return { group, glowMat };
}

/** Hanging oil lantern (emissive glass, no extra light). Returns { group, glassMat }. */
export function makeLantern(chain = 10) {
  const group = new THREE.Group();
  const g = new VoxelGrid(5, chain + 8, 5);
  g.box(2, 7, 2, 1, chain, 1, 0x2a2a2e);
  g.box(0, 0, 0, 5, 1, 5, 0x3a383c); g.box(1, 6, 1, 3, 1, 3, 0x3a383c); g.box(0, 5, 0, 5, 1, 5, 0x3a383c);
  for (const [x, z] of [[0, 0], [4, 0], [0, 4], [4, 4]]) g.box(x, 1, z, 1, 4, 1, 0x3a383c);
  group.add(mesh(g, [2.5, 0, 2.5]));
  const gg = new VoxelGrid(3, 4, 3);
  gg.box(0, 0, 0, 3, 4, 3, (x, y) => (y === 1 ? 0xffe8a0 : 0xffc060));
  const glassMat = glowMaterial();
  const glass = mesh(gg, [1.5, 0, 1.5], { material: glassMat, outline: false });
  glass.position.y = 1 * V;
  group.add(glass);
  return { group, glassMat };
}

const HERB_KINDS = [
  { stem: 0x7a8a4a, leaf: [0x9a7ad0, 0xb89ae8, 0x7a5ab0] }, // lavender
  { stem: 0x6a7a3a, leaf: [0xe0c040, 0xf0d860, 0xc8a030] }, // tansy
  { stem: 0x5a6a3a, leaf: [0x8aa86a, 0x7a9a5a, 0xa0b880] }, // sage
  { stem: 0x5a4a2a, leaf: [0xc8402a, 0xe0583a, 0xa8301e] }, // chilies
  { stem: 0x8a7a5a, leaf: [0xe8e0d0, 0xf6f0e4, 0xd0c8b0] }, // garlic
];

/** A dried-herb bundle hanging on a string. */
export function makeHerbBundle(kind = 0, string = 6, seed = 1) {
  const k = HERB_KINDS[kind % HERB_KINDS.length];
  const rng = makeRng(seed);
  const g = new VoxelGrid(7, string + 10, 5);
  g.box(3, 9, 2, 1, string + 1, 1, 0xd8c8a0);
  g.box(2, 8, 1, 3, 1, 3, 0xc8a070); // tie
  for (let y = 0; y < 8; y++) {
    const spread = Math.min(3, (8 - y) * 0.45 + 0.6);
    for (let x = 0; x < 7; x++) for (let z = 0; z < 5; z++) {
      const dx = x - 3, dz = z - 2;
      if (Math.abs(dx) > spread || Math.abs(dz) > spread * 0.7) continue;
      if (y > 5 && (dx !== 0 || dz !== 0)) { if (rng.chance(0.25)) g.set(x, y, z, k.stem); continue; }
      if (rng.chance(0.55)) g.set(x, y, z, y > 5 ? k.stem : rng.pick(k.leaf));
    }
  }
  return mesh(g, [3.5, string + 10, 2.5]);
}

/** A hanging vine strand. */
export function makeVine(len = 12, seed = 1) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(5, len, 3);
  let x = 2;
  for (let y = len - 1; y >= 0; y--) {
    if (rng.chance(0.25)) x = Math.max(1, Math.min(3, x + (rng.chance(0.5) ? 1 : -1)));
    g.set(x, y, 1, rng.pick([0x3a6024, 0x4a7a2a]));
    if (rng.chance(0.55)) g.set(x + (rng.chance(0.5) ? 1 : -1), y, 1, rng.pick([0x5a9a3a, 0x6aaa44, 0x4a8a32]));
    if (rng.chance(0.2)) g.set(x, y, rng.chance(0.5) ? 0 : 2, 0x5a9a3a);
    if (rng.chance(0.05)) g.set(x, y, 2, 0xf0d8e8);
  }
  return mesh(g, [2.5, len, 1.5]);
}

/** Dark wooden beam (box) in voxels: lenV along x. */
export function makeBeam(lenV, hV = 4, dV = 3, color = 0x4a2e1c) {
  const g = new VoxelGrid(lenV, hV, dV);
  g.box(0, 0, 0, lenV, hV, dV, (x, y, z) => {
    let c = jit(color, x, y, z, 0.07);
    if (y === hV - 1) c = shade(c, 1.12);
    if (x % 11 === 0 && y === 1) c = 0x2a2420;
    return c;
  });
  return mesh(g, [lenV / 2, hV / 2, dV / 2]);
}

/** Moss clumps that sit on top of beams and ledges. */
export function makeMossStrip(lenV, seed = 1) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(lenV, 2, 3);
  for (let x = 0; x < lenV; x++) {
    if (!rng.chance(0.45)) continue;
    g.set(x, 0, rng.int(0, 2), rng.pick([0x4a7a2a, 0x5a8a32, 0x3a6024]));
    if (rng.chance(0.3)) g.set(x, 1, 1, rng.pick([0x6a9a3a, 0x5a8a32]));
  }
  return mesh(g, [lenV / 2, 0, 1.5], { outline: false });
}

// ---------------------------------------------------------------- handheld
/** Smithing hammer held in the mole's paw: handle along -y from the grip, head across z. */
export function makeHammer() {
  const g = new VoxelGrid(3, 13, 7);
  g.box(1, 3, 3, 1, 10, 1, (x, y, z) => (y > 10 ? 0x5a3a20 : jit(0x9a6a3a, x, y, z, 0.05)));
  g.box(0, 0, 1, 3, 3, 5, (x, y, z) => (z === 1 || z === 5 ? 0x9aa0a8 : 0x4a484e));
  const m = mesh(g, [1.5, 11.5, 3.5]);
  m.rotation.x = Math.PI; // head ends up below the paw when the arm hangs
  const grp = new THREE.Group();
  grp.add(m);
  return grp;
}

/** Long tongs. Jaws at local -x, handles toward +x. */
export function makeTongs(len = 16) {
  const g = new VoxelGrid(len + 2, 3, 4);
  g.box(2, 1, 0, len, 1, 1, 0x3a383c);
  g.box(2, 1, 3, len, 1, 1, 0x3a383c);
  g.box(4, 1, 1, 1, 1, 2, 0x2a2a2e);
  g.box(0, 0, 0, 3, 3, 1, 0x2a2a2e); g.box(0, 0, 3, 3, 3, 1, 0x2a2a2e);
  return mesh(g, [0, 1.5, 2]);
}

/** Clay crucible. Returns { group, mat, melt, meltMat, chunks:[] }. */
export function makeCrucible(oreColor = 0xd9773f) {
  const group = new THREE.Group();
  const g = new VoxelGrid(9, 9, 9);
  for (let y = 0; y < 8; y++) {
    const r = 2.6 + Math.min(1.6, y * 0.35);
    g.cylinderY(4.5, 4.5, r, y, y + 1, (x, yy, z) => {
      const rr = Math.hypot(x + 0.5 - 4.5, z + 0.5 - 4.5);
      if (rr < r - 1.1 && yy > 0) return -1;
      return jit(yy === 7 ? 0x8a7a6a : 0x5a4a44, x, yy, z, 0.07);
    });
  }
  g.box(7, 6, 4, 2, 1, 1, 0x6a5a50); // spout
  const mat = hotMaterial();
  const body = mesh(g, [4.5, 0, 4.5], { material: mat });
  group.add(body);
  const meltMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const melt = new THREE.Mesh(new THREE.CylinderGeometry(3.1 * V, 2.6 * V, 0.6 * V, 12), meltMat);
  melt.position.y = 2 * V;
  melt.scale.set(0.6, 1, 0.6);
  group.add(melt);
  const chunks = [];
  const rng = makeRng(23);
  for (let i = 0; i < 5; i++) {
    const cg = new VoxelGrid(3, 2, 3);
    cg.box(0, 0, 0, 2 + rng.int(0, 1), 2, 2, (x, y, z) => ((x + y + z) % 3 === 0 ? oreColor : jit(0x6a5a4b, x, y, z, 0.1)));
    const c = mesh(cg, [1, 0, 1]);
    c.position.set((rng.range(-1.6, 1.6)) * V, (2 + (i % 2) * 1.6) * V, rng.range(-1.6, 1.6) * V);
    c.rotation.y = rng.range(0, 3);
    group.add(c);
    chunks.push(c);
  }
  return { group, mat, melt, meltMat, chunks };
}

/** Iron ingot mold with a fill that rises. Returns { group, fill, fillMat, cavityTop }. */
export function makeMold() {
  const group = new THREE.Group();
  const g = new VoxelGrid(10, 3, 6);
  g.box(0, 0, 0, 10, 3, 6, (x, y, z) => jit(0x3a383c, x, y, z, 0.06));
  for (let x = 2; x < 8; x++) for (let z = 1; z < 5; z++) { g.clear(x, 2, z); if (x > 2 && x < 7 && z > 1 && z < 4) g.clear(x, 1, z); }
  group.add(mesh(g, [5, 0, 3]));
  const fillMat = new THREE.MeshToonMaterial({ color: 0x8a8f96, emissive: 0xff8a2a });
  const fill = new THREE.Mesh(new THREE.BoxGeometry(6 * V, 2 * V, 4 * V), fillMat);
  fill.position.y = 1 * V;
  fill.scale.y = 0.001;
  fill.visible = false;
  group.add(fill);
  return { group, fill, fillMat, cavityTop: 3 * V };
}

/** A metal ingot (trapezoid bar). */
export function makeIngot(color) {
  const g = new VoxelGrid(7, 3, 4);
  g.box(0, 0, 0, 7, 2, 4, (x, y, z) => jit(color, x, y, z, 0.05));
  g.box(1, 2, 1, 5, 1, 2, (x, y, z) => shade(color, 1.15));
  const grp = new THREE.Group();
  const mat = hotMaterial();
  grp.add(mesh(g, [3.5, 0, 2], { material: mat }));
  grp.userData.mat = mat;
  return grp;
}

/** Small crystal cluster for infusions. */
export function makeCrystal(color, size = 1) {
  const g = new VoxelGrid(7, 9, 7);
  const hi = mixHex(color, 0xffffff, 0.45), lo = shade(color, 0.6);
  const spike = (x, z, h, lean) => { for (let y = 0; y < h; y++) { const r = y > h - 3 ? 0 : 1; for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) g.set(x + dx + Math.round(lean * y / h), y, z + dz, dx < 0 ? hi : dz > 0 ? lo : color); } };
  spike(3, 3, 8, 0); spike(1, 4, 5, -1); spike(5, 2, 5, 1);
  const mat = glowMaterial();
  const m = mesh(g, [3.5, 0, 3.5], { material: mat, scale: V * size });
  return { mesh: m, mat };
}

/** Faceted gem for the pommel socket. */
export function makeGem(color, s = 1) {
  const g = new VoxelGrid(3, 3, 3);
  g.box(0, 1, 0, 3, 1, 3, color); g.set(1, 0, 1, shade(color, 0.7)); g.set(1, 2, 1, mixHex(color, 0xffffff, 0.5));
  g.set(1, 1, 1, mixHex(color, 0xffffff, 0.3));
  return mesh(g, [1.5, 1.5, 1.5], { scale: V * s, kind: 'basic' });
}

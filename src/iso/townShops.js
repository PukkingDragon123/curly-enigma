// Deep Town's buildings: shop fronts set into the cave walls (with pixel-art signs),
// the grand Surface Express ticket booth, the brass-and-timber mine lift, and the
// player's round burrow door.
import * as THREE from 'three';
import { pixelTexture } from '../gfx/PixelArt.js';
import { VoxelGrid, vmesh, vmeshG, gmesh, jit, hash3, V16, V8, carve, shade, mixHex } from './vox.js';
import { signCanvas, ticketSignCanvas, paintingCanvas } from './pixel.js';
import { barrel, crate, sack } from './townWorld.js';
import { makeRng } from '../core/util.js';

const WOOD = 0x8a5a32, WOOD_D = 0x5a3a22, WOOD_L = 0xb07a4a, IRON = 0x34343c, GOLD = 0xf2c23a, BRASS = 0xc8a050, CREAM = 0xe8dcc0;

/** Textured sign plane (16 texels per unit) with a voxel backing board. */
export function signBoard(pc, ppu = 16, frame = WOOD_D) {
  const grp = new THREE.Group();
  const w = pc.w / ppu, h = pc.h / ppu;
  const mat = new THREE.MeshLambertMaterial({ map: pixelTexture(pc.commit()), transparent: true, alphaTest: 0.5 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  plane.position.z = 2.2 * V16;
  grp.add(plane);
  const g = new VoxelGrid(Math.round(w * 16) + 2, Math.round(h * 16) + 2, 2);
  g.box(0, 0, 0, g.w, g.h, 2, (x, y, z) => (z === 1 && (x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1) ? shade(frame, 1.15) : jit(frame, x >> 1, y >> 1, z, 3, 0.1)));
  grp.add(vmesh(g, { scale: V16, pivot: [g.w / 2, g.h / 2, 0] }));
  return grp;
}

// ---------------------------------------------------------------- generic facade
/**
 * A shop front 1 tile deep. Local space: x along the front (voxels at 1/8), z from the rock (0) to the front (8),
 * y up. cfg: {w, h, style, wall, trim, roof, roofColor, door:{u,w,h,color,round}, windows:[{u,y,w,h,bars}], awning}
 */
export function facade(cfg) {
  const WV = cfg.w * 8, H = cfg.h ?? 27, D = 13;
  const g = new VoxelGrid(WV, H + 8, D);
  const glow = new VoxelGrid(WV, H + 8, D);
  const seed = cfg.seed ?? 1;
  const wall = cfg.wall, trim = cfg.trim ?? WOOD_D;
  const pat = (x, y, z) => {
    switch (cfg.style) {
      case 'plank': { if (y % 3 === 0) return shade(wall, 0.72); const off = (Math.floor(y / 3) * 5) % 9; return (x + off) % 9 === 0 ? shade(wall, 0.8) : jit(wall, (x + off) / 9 | 0, y / 3 | 0, 0, seed, 0.1); }
      case 'board': return x % 3 === 0 ? shade(wall, 0.7) : jit(wall, x / 3 | 0, y >> 3, 0, seed, 0.08);
      case 'stone': { const row = Math.floor(y / 3), off = (row * 3) % 5; if (y % 3 === 0 || (x + off) % 5 === 0) return mixHex(wall, 0x2a2420, 0.45); return jit(wall, (x + off) / 5 | 0, row, 0, seed, 0.15); }
      case 'brick': { const row = Math.floor(y / 2), off = row % 2 ? 2 : 0; if (y % 2 === 1 && (x + off) % 4 === 3) return 0xb8a890; if ((x + off) % 4 === 3) return 0xa89880; return jit(wall, (x + off) >> 2, row, 0, seed, 0.12); }
      default: { // plaster with timber framing
        if (x % 10 === 0 || y === Math.round(H * 0.45)) return trim;
        if ((x % 10 === y % 10 || x % 10 === 10 - (y % 10)) && y < H * 0.45 && x % 20 < 10) return shade(trim, 1.1);
        return jit(wall, x, y, 0, seed, 0.04);
      }
    }
  };
  // body
  g.box(0, 0, 0, WV, H, 8, (x, y, z) => (z === 7 ? pat(x, y, z) : shade(wall, 0.7)));
  // foundation stones
  g.box(0, 0, 0, WV, 3, 9, (x, y, z) => ((x + (y % 2) * 2) % 5 === 0 || y === 2 ? 0x4a443e : jit(0x7a7470, (x + y * 2) / 5 | 0, y, 0, seed + 1, 0.14)));
  // posts & beams
  for (const x of [0, WV - 2]) g.box(x, 3, 7, 2, H - 3, 2, (xx, y) => jit(trim, xx, y >> 2, 0, seed + 2, 0.08));
  g.box(0, H - 2, 7, WV, 2, 2, (x, y) => jit(trim, x >> 2, y, 0, seed + 3, 0.08));
  // roof eave (shingles sloping back toward the rock)
  if (cfg.roof !== 'none') {
    const rc = cfg.roofColor ?? 0x4a5058;
    for (let k = 0; k < 8; k++) {
      const y = H + k;
      const zf = Math.min(D - 1, 12 - k);
      g.box(0, y, 0, WV, 1, zf + 1, (x, yy, z) => (z === zf && x % 3 === 0 ? shade(rc, 0.75) : jit((k + (x >> 2)) % 2 ? rc : shade(rc, 0.88), x >> 1, k, z >> 2, seed + 4, 0.06)));
    }
  }
  // door
  const dr = cfg.door;
  if (dr) {
    const dx0 = Math.round(dr.u * 8 - dr.w / 2), dh = dr.h ?? 14;
    const inDoor = (x, y) => {
      if (x < dx0 || x >= dx0 + dr.w || y < 3) return false;
      if (!dr.round) return y < 3 + dh;
      const r = dr.w / 2, cy = 3 + dh - r;
      return y < cy || (x + 0.5 - (dx0 + r)) ** 2 + (y - cy) ** 2 <= r * r;
    };
    carve(g, dx0, 3, 4, dr.w, dh + 1, 5, (x, y) => inDoor(x, y));
    for (let x = dx0; x < dx0 + dr.w; x++) for (let y = 3; y < 3 + dh; y++) if (inDoor(x, y)) g.set(x, y, 4, (x - dx0) % 3 === 0 ? shade(dr.color, 0.7) : jit(dr.color, (x - dx0) / 3 | 0, y >> 2, 0, seed + 5, 0.08));
    g.box(dx0 + dr.w - 3, 3 + Math.floor(dh * 0.45), 5, 1, 1, 1, BRASS);
    // frame
    for (let y = 3; y < 3 + dh + 2; y++) for (let x = dx0 - 1; x <= dx0 + dr.w; x++) if (!inDoor(x, y) && (inDoor(x - 1, y) || inDoor(x + 1, y) || inDoor(x, y - 1) || inDoor(x - 1, y - 1) || inDoor(x + 1, y - 1))) g.set(x, y, 8, jit(trim, x, y, 0, seed + 6, 0.06));
    g.box(dx0 - 1, 2, 8, dr.w + 2, 1, 2, 0x6a625c); // step
  }
  // windows (warm glow behind panes)
  for (const w of cfg.windows || []) {
    const x0 = Math.round(w.u * 8 - w.w / 2);
    carve(g, x0, w.y, 6, w.w, w.h, 2);
    glow.box(x0, w.y, 6, w.w, w.h, 1, (x, y) => (y > w.y + w.h * 0.6 ? 0xffd890 : 0xffb24a));
    const mx = x0 + Math.floor(w.w / 2), my = w.y + Math.floor(w.h / 2);
    for (let x = x0; x < x0 + w.w; x++) g.set(x, my, 7, cfg.frame ?? CREAM);
    for (let y = w.y; y < w.y + w.h; y++) g.set(mx, y, 7, cfg.frame ?? CREAM);
    if (w.bars) for (let x = x0 + 1; x < x0 + w.w; x += 2) for (let y = w.y; y < w.y + w.h; y++) g.set(x, y, 8, IRON);
    for (let x = x0 - 1; x <= x0 + w.w; x++) { g.set(x, w.y - 1, 8, cfg.frame ?? CREAM); g.set(x, w.y + w.h, 8, cfg.frame ?? CREAM); g.set(x, w.y - 1, 9, shade(cfg.frame ?? CREAM, 0.85)); }
    for (let y = w.y; y < w.y + w.h; y++) { g.set(x0 - 1, y, 8, cfg.frame ?? CREAM); g.set(x0 + w.w, y, 8, cfg.frame ?? CREAM); }
    if (w.box) for (let x = x0 - 1; x <= x0 + w.w; x++) { g.set(x, w.y - 2, 9, WOOD); g.set(x, w.y - 2, 10, WOOD); g.set(x, w.y - 1, 10, hash3(x, 0, 0, seed) < 0.5 ? 0x5aa84a : [0xf0a0c0, 0xf0e070, 0x9fd6ff][x % 3]); }
  }
  // awning: striped cloth sloping out over the front
  if (cfg.awning) {
    const [a, b] = cfg.awning;
    const top = H - 11;
    for (let k = 0; k < 4; k++) {
      const y = top - k, z = 8 + k;
      for (let x = 2; x < WV - 2; x++) g.set(x, y, z, (x >> 2) % 2 ? a : b);
    }
    for (let x = 2; x < WV - 2; x++) if (x % 4 !== 3) g.set(x, top - 4, 11, (x >> 2) % 2 ? a : b);
  }
  const grp = new THREE.Group();
  grp.add(vmeshG(g, { scale: V8, pivot: [0, 0, 0] }));
  grp.add(vmeshG(glow, { scale: V8, pivot: [0, 0, 0], kind: 'basic', outline: false }));
  return { obj: grp, H, WV };
}

// ---------------------------------------------------------------- per-shop dressing (1/16 props)
function lanternBracket() {
  const g = new VoxelGrid(6, 12, 8);
  g.box(2, 9, 0, 1, 1, 6, IRON); g.box(2, 6, 0, 1, 4, 1, IRON);
  g.box(1, 0, 3, 4, 1, 4, IRON); g.box(1, 7, 3, 4, 1, 4, IRON); g.box(2, 8, 4, 2, 1, 2, IRON);
  for (const [x, z] of [[1, 3], [4, 3], [1, 6], [4, 6]]) g.box(x, 1, z, 1, 6, 1, IRON);
  const gl = new VoxelGrid(2, 6, 2);
  gl.box(0, 0, 0, 2, 6, 2, (x, y) => (y > 3 ? 0xffd890 : 0xffb24a));
  const grp = new THREE.Group();
  grp.add(vmesh(g, { scale: V16, pivot: [3, 0, 0] }));
  const gm = gmesh(gl, { scale: V16, pivot: [1, 0, 1], outline: false });
  gm.position.set(0, V16, 4.5 * V16);
  grp.add(gm);
  return grp;
}

function grindstone() {
  const g = new VoxelGrid(14, 14, 10);
  g.box(1, 0, 2, 2, 8, 2, WOOD_D); g.box(11, 0, 2, 2, 8, 2, WOOD_D); g.box(1, 0, 6, 2, 8, 2, WOOD_D); g.box(11, 0, 6, 2, 8, 2, WOOD_D);
  g.box(0, 7, 4, 14, 1, 2, IRON);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) { const d = Math.hypot(x + 0.5 - 7, y + 0.5 - 7); if (d < 5.5) g.set(x, y, 5, d > 4.6 ? 0x6a625c : jit(0x9a948e, x, y, 0, 2, 0.08)); }
  return vmesh(g, { scale: V16, pivot: [7, 0, 5] });
}

function pickBarrel() {
  const grp = new THREE.Group();
  grp.add(barrel(3, 0x7a5030));
  const g = new VoxelGrid(12, 26, 12);
  for (const [x, z, lean] of [[4, 5, -1], [7, 6, 1], [6, 8, 0]]) {
    for (let y = 10; y < 22; y++) g.set(x + Math.round(lean * (y - 10) * 0.15), y, z, 0x8a5a32);
    const top = 22, tx = x + Math.round(lean * 12 * 0.15);
    for (let k = -3; k <= 3; k++) g.set(tx + k, top - Math.round(Math.abs(k) * 0.5), z, Math.abs(k) > 2 ? 0xc6cbd2 : 0x9aa0a8);
  }
  grp.add(vmesh(g, { scale: V16, pivot: [6, 0, 6] }));
  return grp;
}

function veggieCrate(seed, veg) {
  const grp = new THREE.Group();
  grp.add(crate(seed));
  const g = new VoxelGrid(12, 4, 12);
  for (let x = 1; x < 11; x++) for (let z = 1; z < 11; z++) {
    const h = hash3(x >> 1, z >> 1, seed, 4);
    g.set(x, 0, z, h < 0.5 ? veg[0] : veg[1]);
    if (h < 0.3) g.set(x, 1, z, veg[2] ?? veg[0]);
  }
  const m = vmesh(g, { scale: V16, pivot: [6, 0, 6] });
  m.position.y = 11 * V16;
  grp.add(m);
  return grp;
}

function chalkboard() {
  const grp = new THREE.Group();
  const g = new VoxelGrid(14, 18, 6);
  g.box(0, 0, 1, 2, 18, 2, WOOD); g.box(12, 0, 1, 2, 18, 2, WOOD); g.box(0, 6, 1, 14, 12, 1, WOOD_D);
  grp.add(vmesh(g, { scale: V16, pivot: [7, 0, 2] }));
  const pc = paintingCanvas('chalk');
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.42), new THREE.MeshLambertMaterial({ map: pixelTexture(pc.commit()) }));
  p.position.set(0, 12 * V16, 0.6 * V16);
  grp.add(p);
  grp.rotation.x = -0.12;
  return grp;
}

function mannequin() {
  const g = new VoxelGrid(14, 30, 12);
  g.box(5, 0, 4, 4, 1, 4, WOOD_D); g.box(6, 1, 5, 2, 10, 2, WOOD);
  g.ellipsoid(7, 16, 6, 4.5, 6, 3.5, (x, y, z) => jit(0x5a6a3a, x, y, z, 3, 0.06));
  g.box(3, 13, 3, 8, 1, 7, 0x6a4a2a); g.box(6, 13, 9, 2, 1, 1, BRASS);
  g.ellipsoid(7, 25, 6, 3.5, 3.2, 3.2, 0xd8c8a8);
  g.ellipsoid(7, 27, 6, 4.2, 2.6, 4.2, (x, y) => (y < 27 ? -1 : 0xd9a84a));
  g.box(5, 27, 9, 4, 2, 1, 0x4a4a52); g.box(6, 28, 10, 2, 1, 1, 0xfff0c0);
  g.box(3, 12, 0, 8, 9, 3, 0x8a5a2a); // backpack
  return vmesh(g, { scale: V16, pivot: [7, 0, 6] });
}

function scales() {
  const g = new VoxelGrid(22, 26, 12);
  g.box(2, 0, 2, 18, 9, 8, (x, y, z) => (y === 8 ? WOOD_L : jit(WOOD_D, x >> 1, y, z >> 1, 2, 0.08)));
  g.box(10, 9, 5, 2, 12, 2, BRASS);
  g.box(2, 20, 5, 18, 1, 2, GOLD);
  for (const x of [3, 18]) { g.box(x, 14, 6, 1, 6, 1, BRASS); g.ellipsoid(x + 0.5, 13, 6.5, 3, 1.2, 3, (xx, y) => (y < 13 ? GOLD : -1)); }
  g.box(16, 14, 5, 3, 1, 3, 0xf2c23a); g.box(17, 15, 6, 1, 1, 1, 0xffe08a);
  g.box(10, 21, 5, 2, 2, 2, GOLD);
  // stacked ingots
  for (let i = 0; i < 3; i++) g.box(4 + i * 3, 9, 3, 3, 1, 2, i % 2 ? 0xf2c23a : 0xd8a830);
  g.box(5, 10, 3, 3, 1, 2, 0xffd34a);
  return vmesh(g, { scale: V16, pivot: [11, 0, 6] });
}

function blueprintRolls() {
  const grp = new THREE.Group();
  grp.add(barrel(5, 0x5a4a3a));
  const g = new VoxelGrid(12, 26, 12);
  for (const [x, z, h, c] of [[4, 4, 20, 0xe8dcc0], [7, 5, 22, 0x6a9ad9], [5, 8, 18, 0xe8dcc0], [8, 8, 21, 0x5a8ac9]]) {
    g.box(x, 10, z, 2, h - 10, 2, c);
    g.set(x, h - 1, z, shade(c, 0.85));
  }
  grp.add(vmesh(g, { scale: V16, pivot: [6, 0, 6] }));
  return grp;
}

function easel() {
  const grp = new THREE.Group();
  const g = new VoxelGrid(16, 26, 10);
  for (let y = 0; y < 26; y++) { g.set(3 + Math.floor(y * 0.12), y, 3, WOOD); g.set(12 - Math.floor(y * 0.12), y, 3, WOOD); g.set(8, Math.min(25, y), 1 + Math.floor(y * 0.1), WOOD_D); }
  g.box(2, 9, 3, 12, 1, 3, WOOD_D);
  g.box(3, 10, 4, 10, 13, 1, (x, y) => ((x + y) % 5 === 0 ? 0xd8e8ff : 0x3a6ac9));
  for (let k = 0; k < 6; k++) { g.set(5 + k, 14 + Math.round(Math.sin(k) * 2), 5, 0xe8f0ff); }
  g.box(6, 18, 5, 4, 1, 1, 0xe8f0ff);
  grp.add(vmesh(g, { scale: V16, pivot: [8, 0, 5] }));
  return grp;
}

function smallChairTable() {
  const g = new VoxelGrid(30, 14, 16);
  // chair
  for (const [x, z] of [[1, 3], [8, 3], [1, 10], [8, 10]]) g.box(x, 0, z, 1, 6, 1, WOOD_D);
  g.box(1, 6, 3, 8, 1, 8, WOOD_L); g.box(1, 7, 3, 8, 7, 1, WOOD);
  // table
  g.cylinderY(21, 8, 5, 8, 9, WOOD_L); g.box(20, 0, 7, 2, 8, 2, WOOD_D);
  g.box(19, 9, 7, 2, 2, 2, 0xd96a6a); g.set(23, 9, 9, 0x6ab84a); g.set(23, 10, 9, 0x6ab84a);
  return vmesh(g, { scale: V16, pivot: [15, 0, 8] });
}

function strongbox() {
  const g = new VoxelGrid(12, 9, 9);
  g.box(0, 0, 0, 12, 8, 9, (x, y, z) => (y === 3 || x === 0 || x === 11 ? IRON : jit(0x5a3a2a, x >> 1, y, z, 2, 0.08)));
  g.box(0, 8, 1, 12, 1, 7, 0x6a4a3a);
  g.box(5, 4, 9, 2, 2, 1, GOLD);
  return vmesh(g, { scale: V16, pivot: [6, 0, 4.5] });
}

const SHOP_LOOK = {
  tools: { style: 'stone', wall: 0x7a7470, trim: 0x4a3020, roofColor: 0x46505a, door: { u: 2.5, w: 10, h: 15, color: 0x5a3a22 }, windows: [{ u: 0.95, y: 7, w: 8, h: 8, box: true }, { u: 4.05, y: 7, w: 8, h: 8 }], sign: { text: "GRUBB'S PICKS", icon: 'pick_iron', board: 0x5a3a22, trim: 0x9aa0a8 } },
  grocer: { style: 'plank', wall: 0x9a6a3a, trim: 0x5a3a22, roofColor: 0x6a4a2a, awning: [0x4a8a3a, 0xf0e8d0], door: { u: 2.5, w: 10, h: 13, color: 0x4a7a3a }, windows: [{ u: 1.0, y: 5, w: 9, h: 7, box: true }, { u: 4.0, y: 5, w: 9, h: 7, box: true }], sign: { text: 'NIBBLE & ROOT', icon: 'cave_carrot', board: 0x4a6a2a, trim: 0xe0b040 } },
  furniture: { style: 'plaster', wall: 0xe8dcc0, trim: 0x5a3a22, roofColor: 0xa84a3a, door: { u: 2.5, w: 10, h: 15, color: 0x3a6a9a, round: true }, windows: [{ u: 1.0, y: 6, w: 8, h: 8, box: true }, { u: 4.0, y: 6, w: 8, h: 8, box: true }], sign: { text: 'BURROW & BOARD', icon: 'chair_wood', board: 0x7a4a2a, trim: 0xe0b040 } },
  blueprints: { style: 'plank', wall: 0x3a4a6a, trim: 0x2a2a3a, roofColor: 0x2e2e40, frame: 0xd8c8a0, door: { u: 3.6, w: 10, h: 15, color: 0x8a2a2a }, windows: [{ u: 1.3, y: 6, w: 10, h: 10 }], sign: { text: 'INKWELL PLANS', icon: 'bp_longsword', board: 0x2a3a5a, trim: 0xd8c8a0 } },
  outfitter: { style: 'board', wall: 0x5a6a3a, trim: 0x3a2a1a, roofColor: 0x6a4a2a, door: { u: 2.5, w: 10, h: 15, color: 0x7a4a2a }, windows: [{ u: 1.0, y: 6, w: 8, h: 8 }, { u: 4.0, y: 6, w: 8, h: 8, box: true }], sign: { text: 'GEARWICK', icon: 'helmet_brass', board: 0x4a3a20, trim: 0xd9a84a } },
  assay: { style: 'stone', wall: 0x5a5a64, trim: 0x2e2e36, roofColor: 0x2e3038, frame: 0xd9a84a, door: { u: 2.5, w: 10, h: 15, color: 0x4a3a2a }, windows: [{ u: 1.0, y: 7, w: 8, h: 8, bars: true }, { u: 4.0, y: 7, w: 8, h: 8, bars: true }], sign: { text: "VEX'S ASSAY", icon: 'gold_ingot', board: 0x2e2e36, trim: 0xf2c23a } },
};

/**
 * Build a complete shop front for a shop id at local origin (rock face, left end).
 * Returns {obj, door:{u, z} (local, units), lights:[local], props:[{obj, local x,z} placed]}
 */
export function buildShop(id, w) {
  const look = SHOP_LOOK[id];
  const f = facade({ ...look, w, seed: id.length * 7 });
  const grp = new THREE.Group();
  grp.add(f.obj);
  const top = f.H * V8;
  // name board under the eave
  const s = look.sign;
  const pcw = Math.max(48, Math.min(76, 24 + s.text.length * 4));
  const board = signBoard(signCanvas({ w: pcw, h: 18, text: s.text, icon: s.icon, board: s.board, trim: s.trim }), 16, shade(s.board, 0.7));
  board.position.set(w / 2, top - 0.62, 1.02);
  grp.add(board);
  const lights = [];
  // lanterns either side of the door
  const du = look.door.u;
  for (const off of [-0.95, 0.95]) {
    const l = lanternBracket();
    l.position.set(du + off, 1.5, 1.0);
    grp.add(l);
    lights.push({ x: du + off, y: 1.68, z: 1.3 });
  }
  // dressing (props also become small round obstacles)
  const props = [];
  const add = (o, x, z, ry = 0) => { o.position.set(x, 0, z); o.rotation.y = ry; grp.add(o); props.push({ x, z, r: 0.3 }); return o; };
  if (id === 'tools') { add(grindstone(), 0.75, 1.55, 0.3); add(pickBarrel(), 4.35, 1.45); add(crate(2), 4.4, 2.15); }
  if (id === 'grocer') {
    add(veggieCrate(1, [0xf0a050, 0xe8904a, 0x6ab84a]), 0.7, 1.45); add(veggieCrate(2, [0xe0c8a0, 0xf0e0c8, 0xc8a878]), 1.45, 1.5);
    add(veggieCrate(3, [0x6ac8ff, 0xd8f6ff]), 4.35, 1.45); add(sack(), 3.7, 1.35); add(chalkboard(), 4.4, 2.2, -0.4);
  }
  if (id === 'furniture') { add(smallChairTable(), 0.95, 1.6); add(barrel(7, 0xa86a3a), 4.4, 1.45); }
  if (id === 'blueprints') { add(blueprintRolls(), 0.6, 1.45); add(easel(), 1.7, 1.55, 0.25); add(crate(4), 4.5, 1.45); }
  if (id === 'outfitter') { add(mannequin(), 0.8, 1.55, 0.3); add(crate(6), 4.3, 1.45); add(sack(0xa88a5a), 4.45, 2.15); }
  if (id === 'assay') { add(scales(), 0.95, 1.6); add(strongbox(), 4.3, 1.45); }
  return { obj: grp, door: { u: du, z: 1.0 }, lights, top, props };
}

// ---------------------------------------------------------------- the Surface Express booth
export function ticketBooth() {
  const W = 40, D = 24, H = 22;
  const g = new VoxelGrid(W, H + 12, D);
  const glow = new VoxelGrid(W, H + 12, D);
  const red = 0xa82a2a, redD = 0x7a1a1a;
  const lacquer = (x, y, z) => jit(y % 6 === 0 ? redD : red, x >> 2, y >> 1, z >> 2, 4, 0.06);
  g.box(0, 0, 0, W, 2, D, (x, y, z) => (y === 1 && (z === D - 1 || x === 0 || x === W - 1) ? GOLD : jit(0x6a625c, x >> 1, y, z >> 1, 2, 0.1)));
  // hollow walls (2 voxels thick)
  g.box(1, 2, 1, W - 2, H - 2, D - 2, lacquer);
  carve(g, 3, 2, 3, W - 6, H - 3, D - 6);
  // front window
  carve(g, 11, 8, D - 3, 18, 9, 3);
  g.box(10, 7, D - 3, 20, 1, 4, (x, y, z) => (z === D ? GOLD : WOOD_L)); // counter
  g.box(10, 17, D - 2, 20, 1, 2, GOLD);
  for (const x of [10, 29]) g.box(x, 8, D - 2, 1, 9, 2, GOLD);
  // back of the interior: dark velvet with a gold sun
  g.box(3, 2, 3, W - 6, H - 3, 1, 0x3a1a2a);
  for (let y = 9; y < 17; y++) for (let x = 15; x < 25; x++) if (Math.hypot(x + 0.5 - 20, y + 0.5 - 13) < 3.2) g.set(x, y, 4, 0xe0b040);
  // gold trims
  for (const y of [2, 12, H - 1]) for (let x = 1; x < W - 1; x++) { g.set(x, y, D - 1, GOLD); }
  // columns at the front corners
  for (const cx of [2, W - 3]) g.cylinderY(cx + 0.5, D - 1.5, 2.2, 2, H, (x, y) => (y % 5 === 0 ? GOLD : jit(0xf0e8d8, x, y, 0, 3, 0.04)));
  // roof: stepped red & gold with a scalloped edge
  for (let k = 0; k < 8; k++) {
    const y = H + k, inset = k * 2;
    g.box(inset - 1, y, inset - 1, W - inset * 2 + 2, 1, D - inset * 2 + 2, (x, yy, z) => (k % 3 === 0 ? GOLD : ((x + z) >> 2) % 2 ? red : 0xc03a32));
  }
  for (let x = 0; x < W; x += 3) g.set(x, H - 1, D, GOLD);
  g.box(W / 2 - 1, H + 8, D / 2 - 1, 2, 3, 2, GOLD);
  g.box(W / 2 - 2, H + 11, D / 2 - 2, 4, 1, 4, 0xffd34a);
  // velvet queue posts in front
  for (const x of [6, 34]) { g.box(x, 0, D - 1, 2, 1, 1, GOLD); }
  // warm lamps on the columns
  glow.box(1, 13, D - 3, 3, 3, 3, 0xffd890);
  glow.box(W - 4, 13, D - 3, 3, 3, 3, 0xffd890);
  const grp = new THREE.Group();
  grp.add(vmeshG(g, { scale: V8, pivot: [0, 0, 0] }));
  grp.add(vmeshG(glow, { scale: V8, pivot: [0, 0, 0], kind: 'basic' }));
  // the giant golden ticket on top
  const tpc = ticketSignCanvas();
  const tick = new THREE.Mesh(new THREE.PlaneGeometry(tpc.w / 14, tpc.h / 14), new THREE.MeshBasicMaterial({ map: pixelTexture(tpc.commit()), transparent: true, alphaTest: 0.5 }));
  tick.position.set(W * V8 / 2, (H + 9) * V8 + tpc.h / 28 + 0.1, D * V8 / 2 + 0.3);
  tick.userData.bob = true;
  grp.add(tick);
  // side posters of the beach
  for (const side of [-1, 1]) {
    const pc = paintingCanvas('beach');
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshLambertMaterial({ map: pixelTexture(pc.commit()) }));
    p.position.set(side < 0 ? 0.11 : W * V8 - 0.11, 1.15, D * V8 / 2);
    p.rotation.y = side * Math.PI / 2;
    grp.add(p);
  }
  return { obj: grp, ticket: tick, w: W * V8, d: D * V8, lights: [{ x: 0.3, y: 1.85, z: D * V8 - 0.1 }, { x: W * V8 - 0.3, y: 1.85, z: D * V8 - 0.1 }] };
}

/** Velvet rope stanchions to queue for the dream. */
export function velvetRope() {
  const g = new VoxelGrid(48, 12, 4);
  for (const x of [1, 23, 45]) { g.box(x, 0, 1, 2, 1, 2, GOLD); g.box(x, 1, 1, 1, 10, 1, GOLD); g.box(x, 11, 1, 2, 1, 1, 0xffd34a); }
  for (let x = 2; x < 46; x++) { if (x === 23 || x === 24) continue; const k = (x % 22) / 22; g.set(x, Math.round(9 - Math.sin(k * Math.PI) * 3), 1, 0xa82a3a); }
  return vmesh(g, { scale: V16, pivot: [24, 0, 2] });
}

// ---------------------------------------------------------------- the mine lift
export function mineLift() {
  const grp = new THREE.Group();
  const W = 32, D = 32, H = 60;
  const g = new VoxelGrid(W, H, D);
  const timber = (x, y, z) => jit(0x6a4a2a, x, y >> 2, z, 3, 0.1);
  // stone curb around the shaft (the hole is local voxels 8..24)
  for (let x = 6; x < 26; x++) for (let z = 6; z < 26; z++) {
    if (x >= 8 && x < 24 && z >= 8 && z < 24) continue;
    g.set(x, 0, z, jit((x + z) % 3 ? 0x7a7068 : 0x6a625a, x >> 1, 0, z >> 1, 2, 0.1));
  }
  // posts, beams, braces
  for (const [x, z] of [[1, 1], [W - 4, 1], [1, D - 4], [W - 4, D - 4]]) g.box(x, 0, z, 3, H - 4, 3, timber);
  for (const y of [26, H - 6]) { g.box(1, y, 1, W - 2, 2, 3, timber); g.box(1, y, D - 4, W - 2, 2, 3, timber); g.box(1, y, 1, 3, 2, D - 2, timber); g.box(W - 4, y, 1, 3, 2, D - 2, timber); }
  for (let k = 0; k < 22; k++) { g.set(3 + k, 4 + k, D - 3, 0x5a3a20); g.set(W - 4 - k, 4 + k, D - 3, 0x5a3a20); }
  // sheave wheel on top
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
    if (d < 7.5 && (d > 6 || Math.abs(x - 7.5) < 1 || Math.abs(y - 7.5) < 1 || d < 1.5)) g.set(8 + x, H - 16 + y, 15, d > 6 ? IRON : BRASS);
  }
  // little roof
  for (let k = 0; k < 4; k++) g.box(k, H - 4 + k, 0, W - k * 2, 1, D, (x, y, z) => ((x >> 2) % 2 ? 0x5a3a2a : 0x6a4a34));
  // pit walls going down into darkness
  const pit = new VoxelGrid(34, 48, 34);
  for (let y = 0; y < 48; y++) {
    const f = Math.max(0.03, 1 - y / 34);
    for (let x = 0; x < 34; x++) for (let z = 0; z < 34; z++) {
      if (x > 0 && z > 0 && x < 33 && z < 33) continue;
      pit.set(x, 47 - y, z, jit(shade(y % 9 === 0 ? 0x6a4a30 : 0x5a4a40, f), x >> 1, y, z >> 1, 5, 0.12));
    }
  }
  const pm = vmesh(pit, { scale: V16, pivot: [17, 48, 17] });
  pm.position.set(2, 0, 2);
  grp.add(pm);
  grp.add(vmeshG(g, { scale: V8, pivot: [0, 0, 0] }));
  // sign
  const sign = signBoard(signCanvas({ w: 40, h: 16, text: 'LIFT', icon: 'pick_copper', board: 0x4a3020, trim: 0xd9a84a }), 16, 0x3a2414);
  sign.position.set(2, 3.55, 3.95);
  grp.add(sign);
  // a lantern on the headframe
  const lan = lanternBracket();
  lan.position.set(0.3, 2.9, 3.6);
  lan.rotation.y = -Math.PI / 2;
  grp.add(lan);
  return { obj: grp, top: H * V8, light: { x: 0.0, y: 3.1, z: 3.9 } };
}

/** The brass cage that rides the shaft (local origin = cage floor center). */
export function liftCage() {
  const S = 30, H = 34;
  const g = new VoxelGrid(S, H, S);
  g.box(0, 0, 0, S, 2, S, (x, y, z) => ((x + z) % 4 === 0 ? 0x4a4a52 : 0x5a5a64));
  for (const [x, z] of [[0, 0], [S - 2, 0], [0, S - 2], [S - 2, S - 2]]) g.box(x, 0, z, 2, H, 2, BRASS);
  g.box(0, H - 3, 0, S, 3, S, (x, y, z) => (y === H - 1 ? 0x8a6a3a : BRASS));
  g.box(0, 2, 0, S, 1, S, BRASS);
  for (let k = 5; k < S - 3; k += 5) {
    for (let y = 2; y < H - 3; y++) { g.set(k, y, 0, 0xb08a40); g.set(0, y, k, 0xb08a40); g.set(S - 1, y, k, 0xb08a40); }
  }
  g.box(0, 16, 0, S, 1, 1, BRASS); g.box(0, 16, 0, 1, 1, S, BRASS); g.box(S - 1, 16, 0, 1, 1, S, BRASS);
  const grp = new THREE.Group();
  grp.add(vmesh(g, { scale: V16, pivot: [S / 2, 0, S / 2] }));
  // front gate (slides sideways)
  const gate = new VoxelGrid(S, H - 5, 1);
  for (let x = 2; x < S - 1; x += 5) gate.box(x, 0, 0, 1, H - 5, 1, 0xc8a050);
  gate.box(0, 0, 0, S, 1, 1, BRASS); gate.box(0, H - 6, 0, S, 1, 1, BRASS); gate.box(0, 14, 0, S, 1, 1, BRASS);
  const gm = vmesh(gate, { scale: V16, pivot: [S / 2, 0, 0.5] });
  gm.position.set(0, 2 * V16, (S / 2 - 0.5) * V16);
  grp.add(gm);
  // cable up into the dark + a little cage lamp
  const cable = new VoxelGrid(2, 90, 2);
  cable.box(0, 0, 0, 1, 90, 1, 0x4a4a52);
  const cm = vmesh(cable, { scale: V16, pivot: [0.5, 0, 0.5] });
  cm.position.y = H * V16;
  grp.add(cm);
  const lamp = new VoxelGrid(4, 4, 4);
  lamp.box(0, 0, 0, 4, 4, 4, 0xffd890);
  const lm = gmesh(lamp, { scale: V16, pivot: [2, 4, 2], outline: false });
  lm.position.y = (H - 3) * V16;
  grp.add(lm);
  return { obj: grp, gate: gm, size: S * V16, height: H * V16 };
}

/** Bramble's crank: a big spoked wheel on a timber stand, plus the bell. */
export function liftCrank() {
  const grp = new THREE.Group();
  const g = new VoxelGrid(14, 30, 10);
  g.box(1, 0, 1, 12, 2, 8, 0x5a3a22);
  g.box(2, 2, 4, 2, 14, 2, 0x6a4a2a); g.box(10, 2, 4, 2, 14, 2, 0x6a4a2a);
  // bell post
  g.box(12, 0, 7, 2, 30, 2, 0x6a4a2a); g.box(8, 28, 7, 6, 1, 2, 0x6a4a2a);
  g.ellipsoid(8.5, 23, 8, 2.2, 3, 2.2, (x, y) => (y > 22 ? GOLD : 0xd9a84a));
  grp.add(vmesh(g, { scale: V16, pivot: [7, 0, 5] }));
  const wheel = new VoxelGrid(18, 18, 2);
  for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
    const d = Math.hypot(x + 0.5 - 9, y + 0.5 - 9);
    if (d < 8.5 && (d > 7 || Math.abs(x - 8.5) < 1 || Math.abs(y - 8.5) < 1 || Math.abs(x - y) < 1 || Math.abs(x + y - 17) < 1 || d < 2)) wheel.set(x, y, 0, d > 7 ? 0x5a3a22 : BRASS);
  }
  wheel.box(15, 8, 1, 2, 2, 1, 0xd8a050);
  const wm = vmesh(wheel, { scale: V16, pivot: [9, 9, 1] });
  wm.position.set(0, 15 * V16, -0.05);
  wm.rotation.y = Math.PI / 2;
  grp.add(wm);
  return { obj: grp, wheel: wm, bell: { x: 0.12, y: 1.45, z: 0.18 } };
}

// ---------------------------------------------------------------- the player's burrow door
export function homeDoor() {
  const grp = new THREE.Group();
  const g = new VoxelGrid(30, 34, 10);
  const stone = 0x8a8078, wood = 0x9a6a3a;
  const cx = 15, base = 14, r = 10;
  for (let y = 0; y < 34; y++) for (let x = 0; x < 30; x++) {
    const dx = x + 0.5 - cx;
    const outer = y < base ? Math.abs(dx) <= r + 3 : dx * dx + (y - base) ** 2 <= (r + 3.5) ** 2;
    const inner = y < base ? Math.abs(dx) <= r : dx * dx + (y - base) ** 2 <= r * r;
    if (outer && !inner) for (let z = 0; z < 5; z++) g.set(x, y, z, jit(stone, (x + y * 3) >> 2, y >> 2, z, 6, 0.16));
    if (inner) {
      g.set(x, y, 1, (Math.round(dx + 20) % 4 === 0) ? shade(wood, 0.72) : jit(wood, Math.round(dx + 20) >> 2, y >> 3, 0, 2, 0.08));
      g.set(x, y, 2, wood);
    }
  }
  for (const y of [6, 17]) for (let x = cx - 8; x < cx + 2; x++) g.set(x, y, 3, IRON);
  g.box(cx + 5, 10, 3, 2, 2, 1, GOLD);
  g.ellipsoid(cx, 19, 3.2, 3, 3, 0.6, 0x3a2a1a);
  g.ellipsoid(cx, 19, 3.6, 2.2, 2.2, 0.5, 0xffd27a);
  g.box(cx - 6, 0, 5, 12, 1, 5, jit(0x6a625c, 0, 0, 0, 1, 0)); // step
  grp.add(vmeshG(g, { scale: V16, pivot: [15, 0, 0] }));
  // mailbox, doormat, potted glowcap, paw plaque
  const m = new VoxelGrid(40, 22, 20);
  m.box(2, 0, 10, 2, 14, 2, WOOD_D);
  m.box(0, 14, 7, 6, 5, 8, (x, y) => (y === 18 ? 0xc0402a : 0xd04a3a)); m.box(6, 15, 9, 1, 3, 1, 0xf2c23a);
  m.box(9, 0, 10, 12, 1, 7, (x, y, z) => ((x + z) % 4 < 2 ? 0x9a6a3a : 0xb08048));
  m.box(31, 0, 10, 6, 5, 6, 0xb8603a); m.box(30, 4, 9, 8, 1, 8, 0xc8704a);
  m.box(33, 5, 12, 1, 4, 1, 0xe8dcc0); m.box(35, 5, 13, 1, 3, 1, 0xe8dcc0);
  const mg = new VoxelGrid(40, 22, 20);
  mg.ellipsoid(33.5, 9, 12.5, 2.4, 1.6, 2.4, (x, y) => (y < 9 ? -1 : 0x6ac8ff));
  mg.ellipsoid(35.5, 8, 13.5, 1.6, 1.2, 1.6, (x, y) => (y < 8 ? -1 : 0x9fe0ff));
  const deco = new THREE.Group();
  deco.add(vmesh(m, { scale: V16, pivot: [20, 0, 0] }), gmesh(mg, { scale: V16, pivot: [20, 0, 0] }));
  grp.add(deco);
  return { obj: grp };
}

export { makeRng };

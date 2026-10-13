// Voxel props for the first-person kitchen. 1 voxel = PS world units (finer than characters,
// since everything here is seen up close).
import * as THREE from 'three';
import { VoxelGrid, voxelMesh } from '../gfx/Voxel.js';
import { hashStr, shade, mixHex, makeRng } from '../core/util.js';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';

export const PS = 1 / 40;

/** Deterministic per-voxel color jitter. */
export function jit(c, x, y, z, seed = 1, amt = 0.06) {
  const h = (hashStr(`${x},${y},${z},${seed}`) % 1000) / 1000;
  return shade(c, 1 + (h - 0.5) * 2 * amt);
}

export function vmesh(grid, pivot, opts = {}) {
  return voxelMesh(grid, { pivot, scale: opts.scale ?? PS, kind: opts.kind || 'toon', outline: opts.outline ?? true, shade: opts.shade, material: opts.material, matOpts: opts.matOpts });
}

/** Fill a ring (hollow cylinder slice) between rIn and rOut, centered at (cx, cz). rIn <= 0 → solid disc. */
export function ring(g, cx, cz, rOut, rIn, y0, y1, c) {
  for (let y = y0; y < y1; y++)
    for (let z = Math.floor(cz - rOut - 1); z <= Math.ceil(cz + rOut + 1); z++)
      for (let x = Math.floor(cx - rOut - 1); x <= Math.ceil(cx + rOut + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d <= rOut && d > rIn) {
          const col = typeof c === 'function' ? c(x, y, z, d, Math.atan2(z + 0.5 - cz, x + 0.5 - cx)) : c;
          if (col !== undefined && col !== -1) g.set(x, y, z, col);
        }
      }
}

// shiny metal: a light streak facing the key light (upper left, toward camera)
const metal = (base, seed) => (x, y, z, d, a) => {
  const k = Math.cos(a - 2.2);
  const c = k > 0.9 ? mixHex(base, 0xfff4e0, 0.35) : k > 0.6 ? shade(base, 1.12) : k < -0.6 ? shade(base, 0.82) : base;
  return jit(c, x, y, z, seed, 0.04);
};

// ---------------------------------------------------------------- work surfaces & tools
export function cuttingBoard() {
  const W = 48, D = 30;
  const g = new VoxelGrid(W, 3, D);
  g.rbox(0, 0, 0, W, 3, D, (x, y, z) => {
    let c = 0xd9a866;
    if ((z * 5 + Math.floor(x / 7)) % 9 === 0) c = 0xc99456;
    if ((x + z * 3) % 23 === 0) c = 0xe6b878;
    if (x === 0 || z === 0 || x === W - 1 || z === D - 1) c = 0xb98448;
    if (y < 2) c = shade(c, 0.85);
    return jit(c, x, y, z, 11, 0.04);
  }, 2);
  // handle hole at the right end
  for (let z = 12; z < 18; z++) for (let x = W - 6; x < W - 3; x++) for (let y = 0; y < 3; y++) g.clear(x, y, z);
  // knife marks & a beet stain
  const rng = makeRng(5);
  for (let i = 0; i < 14; i++) {
    const x = rng.int(4, W - 10), z = rng.int(3, D - 4);
    for (let k = 0; k < rng.int(2, 4); k++) if (g.filled(x, 2, z + k)) g.set(x, 2, z + k, 0xb07a44);
  }
  for (const [x, z] of [[8, 6], [9, 6], [8, 7], [10, 7], [9, 8]]) g.set(x, 2, z, 0xb0645a);
  return vmesh(g, [W / 2, 3, D / 2]); // origin at top center
}

/** Chef's knife along +z, edge down. Origin at the middle of the handle. */
export function knife() {
  const g = new VoxelGrid(4, 7, 40);
  // handle
  g.box(1, 1, 0, 2, 3, 12, (x, y, z) => jit((z + y) % 4 === 0 ? 0x4a2a18 : 0x5e3622, x, y, z, 3, 0.06));
  for (const z of [3, 8]) { g.set(1, 2, z, 0xe8c860); g.set(2, 2, z, 0xe8c860); }
  // bolster
  g.box(1, 0, 12, 2, 5, 2, 0x6e767e);
  // blade (1 voxel thick), tip rises toward the end
  for (let z = 14; z < 40; z++) {
    const bottom = z > 33 ? Math.round((z - 33) * 0.6) : 0;
    const top = z < 35 ? 4 : 4 - Math.round((z - 34) * 0.8);
    for (let y = bottom; y <= top; y++) {
      const c = y === bottom ? 0xf4f8fc : y === top ? 0x6c767e : y === bottom + 1 ? 0xd0d8e0 : (z + y * 3) % 11 === 0 ? 0xc8d0d8 : 0x98a2ac;
      g.set(1, y, z, c);
    }
  }
  return vmesh(g, [2, 2.5, 6]);
}

/** Wooden spoon along +z; bowl at the far end, facing up. Origin mid-handle. */
export function spoon() {
  const g = new VoxelGrid(7, 5, 30);
  g.box(2, 2, 0, 2, 1, 20, (x, y, z) => jit(0xc8905a, x, y, z, 7, 0.05));
  g.ellipsoid(3, 1.5, 24, 3.2, 1.8, 4.6, (x, y, z) => jit(0xb87c48, x, y, z, 8, 0.05));
  for (let z = 21; z < 28; z++) for (let x = 1; x < 6; x++) if (g.filled(x, 2, z) && g.filled(x - 1, 2, z) && g.filled(x + 1, 2, z) && g.filled(x, 2, z - 1) && g.filled(x, 2, z + 1)) g.set(x, 2, z, 0x8a5a30);
  return vmesh(g, [3.5, 2.5, 8]);
}

/** Slotted turner along +z. */
export function spatula() {
  const g = new VoxelGrid(11, 4, 28);
  g.box(4, 2, 0, 2, 2, 13, (x, y, z) => jit(0x6a4228, x, y, z, 9, 0.06));
  g.box(4, 1, 13, 2, 1, 4, 0x7a828a);
  g.box(0, 0, 17, 10, 1, 11, (x, y, z) => (z > 18 && z < 26 && (x === 3 || x === 6) ? -1 : jit(0xb8c0c8, x, y, z, 10, 0.04)));
  return vmesh(g, [5, 2, 6]);
}

/** Pouring jug: spout faces -x, handle on +x. Origin at the bottom center. */
export function jug() {
  const R = 7.5, H = 20;
  const g = new VoxelGrid(24, H + 2, 18);
  const cx = 12, cz = 9;
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const rOut = y < 2 ? 6 : t < 0.7 ? R - Math.abs(t - 0.4) * 2.5 : 5.6 + (t - 0.7) * 5;
    ring(g, cx, cz, rOut, y < 1 ? -1 : rOut - 1.2, y, y + 1, (x, yy, z, d, a) => {
      if (yy >= 13 && yy <= 14) return 0x4a78b8;
      if (yy === H - 1) return 0xd8c8a8;
      return metal(0xeadcc0, 21)(x, yy, z, d, a);
    });
  }
  // spout
  for (let y = H - 5; y < H; y++) for (let k = 0; k < 3; k++) {
    const x = Math.round(cx - 6.5 - k - (y - (H - 5)) * 0.3);
    g.set(x, y, cz, 0xeadcc0); g.set(x, y, cz - 1, 0xd8c8a8);
  }
  // handle
  for (let y = 5; y < H - 3; y++) {
    const off = y === 5 || y === H - 4 ? 0 : 3;
    g.set(cx + 7 + off, y, cz, 0xd8c8a8); g.set(cx + 7 + off, y, cz - 1, 0xd8c8a8);
  }
  for (let k = 0; k < 4; k++) { g.set(cx + 7 + k, 5, cz, 0xd8c8a8); g.set(cx + 7 + k, H - 4, cz, 0xd8c8a8); g.set(cx + 7 + k, 5, cz - 1, 0xd8c8a8); g.set(cx + 7 + k, H - 4, cz - 1, 0xd8c8a8); }
  const m = vmesh(g, [cx, 0, cz]);
  return m;
}

export function saltShaker() {
  const g = new VoxelGrid(9, 13, 9);
  ring(g, 4.5, 4.5, 3.6, -1, 0, 8, (x, y, z, d, a) => {
    if (d > 2.7) return Math.cos(a - 2.2) > 0.8 ? 0xffffff : 0xdfe8ee;
    return (x + y + z) % 3 === 0 ? 0xf6d8d8 : 0xf0e6e6;
  });
  ring(g, 4.5, 4.5, 3.8, -1, 8, 11, (x, y, z, d, a) => metal(0xb8c0c8, 33)(x, y, z, d, a));
  ring(g, 4.5, 4.5, 2.6, -1, 11, 12, 0xc8d0d8);
  for (const [x, z] of [[3, 3], [5, 3], [4, 5], [3, 6], [6, 5]]) g.set(x, 11, z, 0x3a3a40);
  return vmesh(g, [4.5, 0, 4.5]);
}

// ---------------------------------------------------------------- vessels
/** Copper stock pot. Origin at bottom center. userData.liquidY = inner liquid height. */
export function pot() {
  const H = 17, R = 13.5;
  const g = new VoxelGrid(36, H, 30);
  const cx = 18, cz = 15;
  const cop = metal(0x6a3a28, 4);
  ring(g, cx, cz, R - 1, -1, 0, 1, 0x6a3420);
  ring(g, cx, cz, R, R - 1.6, 1, H - 1, (x, y, z, d, a) => (y === 3 || y === 12 ? shade(cop(x, y, z, d, a), 0.86) : cop(x, y, z, d, a)));
  ring(g, cx, cz, R - 1.6, -1, 1, 2, 0x4a2414);
  ring(g, cx, cz, R + 0.6, R - 1.4, H - 1, H, (x, y, z, d, a) => metal(0xc8a050, 5)(x, y, z, d, a));
  // side handles
  for (const s of [-1, 1]) {
    const hx = s < 0 ? cx - R - 3 : cx + R + 1;
    for (let y = H - 6; y < H - 2; y++) for (let z = cz - 3; z < cz + 3; z++) {
      const edge = y === H - 6 || y === H - 3 || z === cz - 3 || z === cz + 2;
      if (edge) { g.set(hx, y, z, 0x5a5a62); g.set(hx + 1, y, z, 0x5a5a62); }
    }
  }
  const m = vmesh(g, [cx, 0, cz]);
  m.userData.liquidY = 12.5 * PS;
  m.userData.innerR = (R - 1.6) * PS;
  return m;
}

/** Cast-iron frying pan; handle points to +z. Origin at bottom center of the pan. */
export function pan() {
  const R = 12.5;
  const g = new VoxelGrid(28, 6, 46);
  const cx = 14, cz = 14;
  const iron = metal(0x3a3638, 6);
  ring(g, cx, cz, R - 0.8, -1, 0, 1, 0x2a2628);
  ring(g, cx, cz, R - 1.5, -1, 1, 2, (x, y, z) => jit(0x343034, x, y, z, 2, 0.08));
  ring(g, cx, cz, R, R - 1.5, 1, 4, iron);
  ring(g, cx, cz, R + 0.4, R - 1.2, 4, 5, (x, y, z, d, a) => shade(iron(x, y, z, d, a), 1.2));
  // handle
  for (let z = cz + 11; z < 46; z++) {
    const wood = z > cz + 16;
    for (let x = cx - 1; x <= cx; x++) for (let y = 2; y < 4; y++) g.set(x, y, z, wood ? jit((z % 5 === 0) ? 0x4e2e1a : 0x6a4228, x, y, z, 12, 0.05) : 0x2e2a2c);
  }
  g.set(cx - 1, 3, 43, 0x8a6a48); g.set(cx, 3, 43, 0x8a6a48);
  const m = vmesh(g, [cx, 0, cz]);
  m.userData.innerR = (R - 1.5) * PS;
  m.userData.floorY = 2 * PS;
  return m;
}

/** Ceramic mixing bowl, cream with a blue band. Origin at bottom center. */
export function bowl() {
  const H = 12;
  const g = new VoxelGrid(30, H + 1, 30);
  const cx = 15, cz = 15;
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const rOut = 7.5 + 6.8 * Math.sqrt(t);
    const rIn = y < 2 ? -1 : rOut - 1.5;
    ring(g, cx, cz, rOut, rIn, y, y + 1, (x, yy, z, d, a) => {
      if (d <= rOut - 1.3 && yy >= 2) return 0xf6ecd8;
      if (yy === H - 1) return 0x34588a;
      if (yy === 8 || yy === 9) return 0x4a78b8;
      return metal(0xeee0c4, 13)(x, yy, z, d, a);
    });
  }
  const m = vmesh(g, [cx, 0, cz]);
  m.userData.innerR = 12 * PS;
  m.userData.floorY = 2 * PS;
  return m;
}

/** Red glazed mug with a handle on +x. Origin at bottom center. */
export function mug() {
  const H = 13;
  const g = new VoxelGrid(18, H, 13);
  const cx = 6.5, cz = 6.5;
  ring(g, cx, cz, 5.6, -1, 0, 1, 0x8a3424);
  ring(g, cx, cz, 5.8, 4.4, 1, H, (x, y, z, d, a) => (y >= H - 2 ? 0xf0e2c8 : metal(0xc0503a, 17)(x, y, z, d, a)));
  ring(g, cx, cz, 4.4, -1, 1, 2, 0xe8d8bc);
  for (let y = 3; y < H - 2; y++) {
    const edge = y === 3 || y === H - 3;
    for (let x = 12; x < (edge ? 16 : 13); x++) { g.set(x, y, 6, 0xb04838); g.set(x, y, 7, 0xb04838); }
    if (!edge) { g.set(15, y, 6, 0xb04838); g.set(15, y, 7, 0xb04838); }
  }
  const m = vmesh(g, [cx, 0, cz]);
  m.userData.innerR = 4.4 * PS;
  m.userData.floorY = 2 * PS;
  m.userData.rimY = H * PS;
  return m;
}

/** Cream dinner plate with a dotted blue rim. Origin at the bottom center. */
export function plate() {
  const R = 13;
  const g = new VoxelGrid(28, 3, 28);
  const cx = 14, cz = 14;
  ring(g, cx, cz, R - 2.5, -1, 0, 1, 0xe2d4b8);
  ring(g, cx, cz, R, -1, 1, 2, (x, y, z, d, a) => (d > R - 2.2 ? ((Math.round(a * 8) % 2 === 0) ? 0x4a78b8 : 0xf4ead6) : jit(0xf6eedc, x, y, z, 2, 0.02)));
  ring(g, cx, cz, R, R - 2, 2, 3, (x, y, z, d, a) => metal(0xf4ead6, 3)(x, y, z, d, a));
  return vmesh(g, [cx, 0, cz]);
}

// ---------------------------------------------------------------- food bits
export function egg(cracked = false) {
  const g = new VoxelGrid(8, 10, 8);
  g.ellipsoid(4, 4.6, 4, 3.6, 4.6, 3.6, (x, y, z) => ((x * 7 + y * 3 + z * 5) % 11 === 0 ? 0xd8c8a0 : jit(0xf6ecd0, x, y, z, 4, 0.03)));
  if (cracked) for (let y = 3; y < 7; y++) { const x = (y % 2) + 3; g.set(x, y, 7, 0x8a7a5a); g.set(x + 1, y + 1, 7, 0x8a7a5a); }
  return vmesh(g, [4, 4.6, 4]);
}

/** Half an egg shell (bottom half), jagged rim. */
export function eggShell() {
  const g = new VoxelGrid(8, 6, 8);
  g.ellipsoid(4, 4.6, 4, 3.6, 4.6, 3.6, (x, y, z) => (y > 3 + ((x + z) % 2) ? -1 : jit(0xf6ecd0, x, y, z, 4, 0.03)));
  g.ellipsoid(4, 4.6, 4, 2.4, 3.6, 2.4, () => -1);
  for (let z = 1; z < 7; z++) for (let x = 1; x < 7; x++) for (let y = 1; y < 6; y++) if (Math.hypot(x + 0.5 - 4, z + 0.5 - 4) < 2.4 && y > 1) g.clear(x, y, z);
  return vmesh(g, [4, 0, 4]);
}

/** Cracked egg contents: white blob with a yolk. */
export function yolk(withWhite = true) {
  const g = new VoxelGrid(16, 3, 16);
  if (withWhite) g.ellipsoid(8, 0.5, 8, 7, 1, 6.4, (x, y, z) => jit(0xfaf6ec, x, y, z, 1, 0.02));
  g.ellipsoid(8.5, 1.2, 7.5, 3.2, 1.6, 3.2, (x, y, z) => ((x + z) % 5 === 0 ? 0xffe890 : 0xffc23a));
  return vmesh(g, [8, 0, 8]);
}

export function shellBit(seed) {
  const g = new VoxelGrid(3, 1, 3);
  const rng = makeRng(seed);
  g.set(1, 0, 1, 0xf6ecd0);
  for (const [x, z] of [[0, 1], [1, 0], [2, 1], [1, 2]]) if (rng.chance(0.6)) g.set(x, 0, z, rng.chance(0.5) ? 0xf6ecd0 : 0xe8dcc0);
  return vmesh(g, [1.5, 0, 1.5]);
}

export function dough(color = 0xf2e4c4) {
  const g = new VoxelGrid(18, 10, 18);
  g.ellipsoid(9, 4.5, 9, 8.2, 5, 8.2, (x, y, z) => ((x * 3 + y * 7 + z * 5) % 13 === 0 ? 0xfffaf0 : (x + y * 5 + z * 3) % 17 === 0 ? shade(color, 0.86) : jit(color, x, y, z, 9, 0.03)));
  return vmesh(g, [9, 0, 9]);
}

/** Flat round food (omelette / pancake). */
export function flatFood(color, r = 9) {
  const g = new VoxelGrid(r * 2 + 2, 3, r * 2 + 2);
  const c = r + 1;
  ring(g, c, c, r, -1, 0, 1, (x, y, z, d) => (d > r - 1.2 ? shade(color, 0.85) : jit(color, x, y, z, 6, 0.05)));
  ring(g, c, c, r - 1.4, -1, 1, 2, (x, y, z) => ((x * 5 + z * 3) % 7 === 0 ? shade(color, 1.1) : jit(color, x, y, z, 7, 0.05)));
  return vmesh(g, [c, 0, c]);
}

// ---------------------------------------------------------------- stove
/** Cast-iron stove top with two burners (left = pot, right = pan) and a brass rail at the front.
 *  The slab is a textured box (cheap); rims, prongs and glowing grates are small voxel meshes.
 *  Returns {group, burners: [{x, z}] (local), grates: [mesh], height} — origin at the top center. */
export function stoveTop(widthU, depthU) {
  const H = 4 * PS;
  const TW = 64, TH = Math.round((64 * depthU) / widthU);
  const pc = new PixelCanvas(TW, TH);
  const burners = [];
  const centers = [0.27, 0.73].map((fx) => [fx * TW, 0.48 * TH]);
  const holeR = (10.5 * PS / widthU) * TW;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    let c = (x * 3 + y * 7) % 19 === 0 ? 0x343032 : (x * 5 + y * 3) % 23 === 0 ? 0x262224 : 0x2c282a;
    if (x < 1 || y < 1 || x >= TW - 1 || y >= TH - 1) c = 0x3e3a3c;
    for (const [cx, cy] of centers) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < holeR) c = 0x141012;
    pc.set(x, y, c);
  }
  for (let x = 3; x < TW - 2; x += 5) { pc.set(x, 2, 0x5a5658); pc.set(x, TH - 3, 0x5a5658); }
  for (let y = 6; y < TH - 3; y += 5) { pc.set(2, y, 0x5a5658); pc.set(TW - 3, y, 0x5a5658); }
  const tex = pixelTexture(pc.commit());
  const side = new THREE.MeshLambertMaterial({ color: 0x2a2628 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(widthU, H, depthU), [side, side, new THREE.MeshLambertMaterial({ map: tex }), side, side, side]);
  slab.position.y = -H / 2;
  const group = new THREE.Group();
  group.add(slab);
  const grates = [];
  for (const [cx, cy] of centers) {
    const bx = (cx / TW - 0.5) * widthU, bz = (cy / TH - 0.5) * depthU;
    burners.push({ x: bx, z: bz });
    // raised rim + pan supports
    const g = new VoxelGrid(28, 2, 28);
    ring(g, 14, 14, 12.2, 10.4, 0, 1, (x, y, z, d, a) => metal(0x4a4648, 8)(x, y, z, d, a));
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      for (let r = 7; r < 11; r++) g.set(Math.round(14 + Math.cos(a) * r - 0.5), 1, Math.round(14 + Math.sin(a) * r - 0.5), 0x4a4648);
    }
    const rim = vmesh(g, [14, 0, 14]);
    rim.position.set(bx, 0, bz);
    group.add(rim);
    // glowing grate (unlit, tinted by flame strength)
    const gg = new VoxelGrid(22, 1, 22);
    ring(gg, 11, 11, 9.8, -1, 0, 1, (x, y, z, d, a) => {
      const spoke = Math.abs(Math.sin(a * 4)) < 0.25;
      const ringy = Math.abs(d - 6) < 0.8 || Math.abs(d - 3) < 0.7;
      return spoke || ringy || d > 9 ? 0xffb050 : 0x5a1a08;
    });
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x333333 });
    const m = vmesh(gg, [11, 1, 11], { material: mat, outline: false });
    m.position.set(bx, 0.004, bz);
    group.add(m);
    grates.push(m);
  }
  // brass towel rail at the front
  const rail = new THREE.Mesh(new THREE.BoxGeometry(widthU - 0.12, 0.028, 0.028), new THREE.MeshLambertMaterial({ color: 0xd8a840 }));
  rail.position.set(0, 0.03, depthU / 2 - 0.03);
  rail.layers.enable(1);
  group.add(rail);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), new THREE.MeshLambertMaterial({ color: 0x8a6a2a }));
    post.position.set(sx * (widthU / 2 - 0.08), 0.015, depthU / 2 - 0.03);
    group.add(post);
  }
  return { group, burners, grates, height: H };
}

/** One flame tongue (unlit). */
export function flameTongue() {
  const g = new VoxelGrid(3, 7, 3);
  for (let y = 0; y < 7; y++) {
    const r = y < 3 ? 1.5 : y < 5 ? 1.05 : 0.6;
    for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) {
      const d = Math.hypot(x + 0.5 - 1.5, z + 0.5 - 1.5);
      if (d > r) continue;
      const core = d < 0.8 && y < 4;
      g.set(x, y, z, core ? 0xfff8c8 : y < 2 ? 0xffd860 : y < 4 ? 0xffb030 : y < 6 ? 0xff8a20 : 0xf0602a);
    }
  }
  return vmesh(g, [1.5, 0, 1.5], { kind: 'basic', outline: false });
}

// ---------------------------------------------------------------- wall decor
export function shelf(lenU) {
  const L = Math.round(lenU / PS);
  const g = new VoxelGrid(L, 7, 9);
  g.box(0, 5, 0, L, 2, 9, (x, y, z) => jit((x % 13 === 0) ? 0x4e2e1a : 0x6a4228, x, y, z, 14, 0.06));
  g.box(0, 6, 8, L, 1, 1, 0x7a5032);
  for (const bx of [4, L - 6]) { g.box(bx, 0, 0, 2, 5, 2, 0x3a2414); g.box(bx, 4, 2, 2, 1, 4, 0x3a2414); g.set(bx, 3, 2, 0x3a2414); g.set(bx + 1, 3, 2, 0x3a2414); }
  return vmesh(g, [0, 7, 0]); // origin at the top-back-left
}

/** Glass jar with contents and a cloth or cork lid. */
export function jar(content, opts = {}) {
  const H = opts.h ?? 12, R = opts.r ?? 4.2;
  const g = new VoxelGrid(12, H + 4, 12);
  const cx = 6, cz = 6;
  const fill = Math.round(H * (opts.fill ?? 0.7));
  ring(g, cx, cz, R, -1, 0, H, (x, y, z, d, a) => {
    if (y < fill) {
      const c = typeof content === 'function' ? content(x, y, z) : content;
      return Math.cos(a - 2.2) > 0.85 ? mixHex(c, 0xffffff, 0.45) : jit(c, x, y, z, 15, 0.08);
    }
    return Math.cos(a - 2.2) > 0.8 ? 0xe8f4f8 : 0x9ab8c0;
  });
  if (opts.label) ring(g, cx, cz, R + 0.2, R - 0.8, 3, 7, (x, y, z, d, a) => (Math.cos(a - Math.PI / 2) > 0.3 ? 0xf0e2c0 : undefined));
  if (opts.lid === 'cork') ring(g, cx, cz, R - 1.4, -1, H, H + 2, 0xb08050);
  else {
    const cloth = opts.cloth ?? 0xc94a3a;
    ring(g, cx, cz, R + 0.9, -1, H, H + 1, (x, y, z) => ((x + z) % 2 ? cloth : 0xf0e6d8));
    ring(g, cx, cz, R - 0.5, -1, H + 1, H + 2, (x, y, z) => ((x + z) % 2 ? cloth : 0xf0e6d8));
    ring(g, cx, cz, R + 0.4, R - 0.6, H - 1, H, 0xd8b070);
  }
  return vmesh(g, [cx, 0, cz]);
}

export function bottle(color) {
  const g = new VoxelGrid(8, 18, 8);
  ring(g, 4, 4, 3.4, -1, 0, 10, (x, y, z, d, a) => (Math.cos(a - 2.2) > 0.8 ? mixHex(color, 0xffffff, 0.5) : jit(color, x, y, z, 16, 0.06)));
  ring(g, 4, 4, 2.4, -1, 10, 12, color);
  ring(g, 4, 4, 1.5, -1, 12, 16, shade(color, 1.1));
  ring(g, 4, 4, 1.2, -1, 16, 18, 0xb08050);
  ring(g, 4, 4, 3.5, 2.2, 4, 7, 0xf0e2c0);
  return vmesh(g, [4, 0, 4]);
}

/** Squat clay crock with a wooden lid. */
export function crock(color = 0x9a6a4a) {
  const g = new VoxelGrid(14, 13, 14);
  for (let y = 0; y < 10; y++) {
    const r = 5 + Math.sin((y / 9) * Math.PI) * 1.4;
    ring(g, 7, 7, r, -1, y, y + 1, (x, yy, z, d, a) => (yy === 6 ? shade(color, 0.8) : metal(color, 19)(x, yy, z, d, a)));
  }
  ring(g, 7, 7, 5.2, -1, 10, 11, 0x7a5032);
  ring(g, 7, 7, 1.2, -1, 11, 13, 0x5a3a22);
  return vmesh(g, [7, 0, 7]);
}

/** Bundle of dried herbs hanging upside down (origin at the tie, hangs toward -y). */
export function herbBundle(color = 0x6a8a3a, seed = 1) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(11, 18, 5);
  for (let i = 0; i < 9; i++) {
    const x0 = 5 + rng.int(-1, 1);
    const spread = rng.range(-0.45, 0.45);
    const len = rng.int(10, 16);
    for (let k = 0; k < len; k++) {
      const x = Math.round(x0 + spread * k), y = 15 - k;
      const c = k < 3 ? 0x8a6a3a : rng.chance(0.25) ? shade(color, 1.25) : rng.chance(0.3) ? shade(color, 0.8) : color;
      g.set(x, y, 2 + rng.int(-1, 1), c);
      if (k > 4 && rng.chance(0.45)) g.set(x + (rng.chance(0.5) ? 1 : -1), y, 2, shade(color, 1.1));
    }
  }
  g.box(4, 14, 1, 3, 2, 3, 0xd8b070);
  g.box(5, 16, 2, 1, 2, 1, 0xc8a060);
  return vmesh(g, [5.5, 18, 2.5]);
}

export function garlicBraid(n = 4) {
  const g = new VoxelGrid(9, 6 * n + 4, 8);
  g.box(4, 0, 4, 1, 6 * n + 4, 1, 0xc8a060);
  for (let i = 0; i < n; i++) {
    const cy = 6 * n - i * 6 - 1, cx = 4.5 + (i % 2 ? 1.2 : -1.2);
    g.ellipsoid(cx, cy, 4.5, 3.2, 3, 3.2, (x, y, z) => ((x + z) % 3 === 0 ? 0xe0d4c0 : (y === Math.round(cy + 2) ? 0xc8a0b0 : 0xf4eee0)));
    g.set(Math.round(cx - 0.5), Math.round(cy + 3), 4, 0xb8a070);
  }
  return vmesh(g, [4.5, 6 * n + 4, 4.5]);
}

/** Round window frame (wood ring + cross bars); origin at the center. */
export function windowFrame(rU) {
  const R = Math.round(rU / PS);
  const S = R * 2 + 6;
  const g = new VoxelGrid(S, S, 4);
  const c = S / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    if (d <= R + 2.6 && d > R - 0.4) for (let z = 0; z < 4; z++) g.set(x, y, z, jit(d > R + 1.5 ? 0x4a2c18 : 0x6a4228, x, y, z, 21, 0.06));
    else if (d <= R - 0.4 && (Math.abs(x + 0.5 - c) < 0.9 || Math.abs(y + 0.5 - c) < 0.9)) g.set(x, y, 1, 0x5a3a22);
  }
  // sill
  g.box(Math.round(c - R * 0.8), Math.round(c - R - 4), 0, Math.round(R * 1.6), 2, 4, 0x6a4228);
  return vmesh(g, [c, c, 2]);
}

export function vine(len = 20, seed = 3) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(7, len + 1, 3);
  let x = 3;
  for (let y = len; y >= 0; y--) {
    if (rng.chance(0.3)) x = Math.max(1, Math.min(5, x + (rng.chance(0.5) ? 1 : -1)));
    g.set(x, y, 1, 0x3a7a3a);
    if (rng.chance(0.4)) { g.set(x + (rng.chance(0.5) ? 1 : -1), y, 1, rng.chance(0.5) ? 0x5aa84a : 0x4a9a3a); }
  }
  return vmesh(g, [3.5, len + 1, 1.5]);
}

/** Copper ladle hanging from a hook (origin at the hook). */
export function ladle() {
  const g = new VoxelGrid(9, 26, 9);
  g.box(4, 8, 4, 1, 16, 1, 0xb4643a);
  g.box(3, 23, 4, 3, 1, 1, 0xb4643a); g.set(3, 24, 4, 0xb4643a); g.set(5, 24, 4, 0xb4643a); g.set(4, 25, 4, 0x5a5a62);
  g.ellipsoid(4.5, 4.5, 4.5, 4, 3.2, 4, (x, y, z) => (y > 5 ? -1 : jit(0xb4643a, x, y, z, 3, 0.08)));
  return vmesh(g, [4.5, 26, 4.5]);
}

export function hangingPan() {
  const g = new VoxelGrid(22, 34, 4);
  for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) {
    const d = Math.hypot(x + 0.5 - 11, y + 0.5 - 11);
    if (d <= 10) { g.set(x, y, 0, d > 8.6 ? 0x4a4648 : jit(0x2e2a2c, x, y, 0, 4, 0.08)); if (d > 8.6) g.set(x, y, 1, 0x3a3638); }
  }
  g.box(10, 21, 0, 2, 12, 1, 0x6a4228);
  g.box(10, 32, 0, 2, 2, 1, 0x5a5a62);
  return vmesh(g, [11, 34, 1]);
}

export function sack(color = 0xe8dcc0) {
  const g = new VoxelGrid(16, 18, 14);
  g.ellipsoid(8, 7, 7, 7, 7.5, 6, (x, y, z) => ((x + y * 2) % 7 === 0 ? shade(color, 0.88) : jit(color, x, y, z, 2, 0.05)));
  g.box(6, 13, 5, 4, 3, 4, shade(color, 0.9));
  g.box(5, 13, 4, 6, 1, 6, 0xb08a50);
  g.ellipsoid(8, 16.5, 7, 3, 1.4, 3, 0xf8f2e2);
  for (const [x, y] of [[6, 6], [7, 7], [8, 6], [9, 7], [10, 6]]) g.set(x, y, 13, 0x8a6a3a);
  return vmesh(g, [8, 0, 7]);
}

export function candle() {
  const g = new VoxelGrid(7, 12, 7);
  ring(g, 3.5, 3.5, 3.4, -1, 0, 2, 0xb8865a);
  ring(g, 3.5, 3.5, 1.8, -1, 2, 10, (x, y, z) => (y === 9 && x === 3 ? 0xfff4d8 : jit(0xf4ead0, x, y, z, 5, 0.03)));
  g.set(3, 10, 3, 0x2a1a18);
  return vmesh(g, [3.5, 0, 3.5]);
}

export function potPlant(color = 0x5aa84a, glow = false) {
  const g = new VoxelGrid(12, 16, 12);
  for (let y = 0; y < 6; y++) ring(g, 6, 6, 3.6 + y * 0.25, y === 0 ? -1 : 2.8, y, y + 1, (x, yy) => (yy === 5 ? 0xc8704a : 0xb8603a));
  ring(g, 6, 6, 3, -1, 4, 5, 0x4a3020);
  const rng = makeRng(glow ? 9 : 4);
  if (glow) {
    for (const [x, z, h] of [[6, 6, 6], [4, 7, 4], [8, 5, 5]]) {
      g.box(x, 5, z, 1, h, 1, 0xd8e8f0);
      ring(g, x + 0.5, z + 0.5, 2.3, -1, 5 + h, 6 + h, 0x5ab8ff);
      ring(g, x + 0.5, z + 0.5, 1.4, -1, 6 + h, 7 + h, 0x8fd8ff);
    }
  } else {
    for (let i = 0; i < 16; i++) {
      let x = 6, z = 6;
      const ang = rng.range(0, Math.PI * 2);
      for (let k = 0; k < rng.int(4, 9); k++) {
        x += Math.cos(ang) * 0.6; z += Math.sin(ang) * 0.6;
        g.set(Math.round(x), 5 + k, Math.round(z), k > 3 && rng.chance(0.5) ? shade(color, 1.2) : color);
      }
    }
  }
  return vmesh(g, [6, 0, 6]);
}

/** Wooden utensil crock with spoons sticking out. */
export function utensilCrock() {
  const g = new VoxelGrid(12, 26, 12);
  for (let y = 0; y < 11; y++) ring(g, 6, 6, 4.4, y === 0 ? -1 : 3.4, y, y + 1, (x, yy) => (yy === 3 || yy === 8 ? 0x4a78b8 : 0xe8dcc0));
  const sticks = [[5, 5, 0xc8905a, 22], [7, 6, 0x9a6a3a, 19], [6, 7, 0xb87c48, 24]];
  for (const [x, z, c, h] of sticks) { g.box(x, 4, z, 1, h - 4, 1, c); }
  g.ellipsoid(5.5, 22.5, 5.5, 1.6, 2.4, 1.2, 0xc8905a);
  g.box(6, 19, 5, 3, 1, 3, 0x9aa2aa);
  g.box(5, 23, 7, 3, 2, 1, 0xb87c48);
  return vmesh(g, [6, 0, 6]);
}

export function spiceRack() {
  const g = new VoxelGrid(34, 14, 6);
  g.box(0, 0, 0, 34, 2, 6, 0x6a4228);
  g.box(0, 0, 0, 34, 14, 1, 0x5a3a22);
  g.box(0, 12, 0, 34, 2, 6, 0x6a4228);
  const cols = [0xd94a3a, 0xe0b030, 0x6aa84a, 0x8a5a2a, 0xf0e6d8, 0xa05ad9, 0xf08a2a];
  for (let i = 0; i < 7; i++) {
    const x = 1 + i * 4.7;
    g.box(Math.round(x), 2, 2, 3, 6, 3, (xx, y, z) => (y > 6 ? 0xb8c0c8 : y > 3 ? cols[i] : 0xe8f0f4));
  }
  return vmesh(g, [17, 0, 0]);
}

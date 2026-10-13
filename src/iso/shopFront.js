// Deep Town's shop fronts at 1/16 voxels with real relief: overlapping clapboards,
// board-and-batten, bevelled stone blocks, brick, half-timbered plaster; shingled eaves,
// arched doors with iron straps, framed windows with sills, shutters and flower boxes,
// striped awnings on iron rods. Each shop is dressed with 1/32 props (grindstone, pick
// barrel, veggie crates, chalkboard, mannequin, assay scales...). Signs go to the atlas.
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, iron, stone, cloth, straw, line, ring, M32, G32, M16, G16, group, mulc, mixc, h3, sp3, S32 } from './kit.js';
import { hash2 } from './surface.js';
import { barrel, crate, sack, bucket, pottedFern } from './props.js';
import { wallLantern, flowerBox } from './props2.js';
import { signCanvas, paintingCanvas } from './pixel.js';
import { PixelCanvas } from '../gfx/PixelArt.js';
import { withView, viewForYaw } from './mesher.js';

const V = 16;

// ---------------------------------------------------------------- facade
/**
 * A shop front w tiles wide. Local space: x along the front, z from the rock (0) out to the front (1 unit), y up.
 * cfg: {w, style, wall, trim, roofColor, door:{u,w,h,color,round}, windows:[{u,y,w,h,bars,box}], awning:[a,b], frame}
 */
export function facade(cfg) {
  const W = cfg.w * V, H = 54, D = 28;
  const g = new VoxelGrid(W, H + 16, D);
  const glow = new VoxelGrid(W, H + 16, D);
  const seed = cfg.seed ?? 1;
  const wall = cfg.wall, trim = cfg.trim ?? C.woodD;
  const FZ = 16; // front plane of the wall body
  // pattern returns [color, relief(-1..+1)]
  const pat = (x, y) => {
    switch (cfg.style) {
      case 'plank': { // overlapping clapboards
        const row = Math.floor(y / 5), ly = y % 5, off = (row * 11) % 23;
        const seam = (x + off) % 23 === 0;
        const c = mulc(wall, 0.9 + hash2(Math.floor((x + off) / 23), row, seed) * 0.16);
        if (seam) return [mulc(wall, 0.62), -1];
        if (ly === 0) return [mulc(c, 0.7), 1]; // lower lip of each board
        if (ly === 4) return [mulc(c, 1.08), 0];
        return [Math.sin(x * 0.7 + row * 2) > 0.93 ? mulc(c, 0.9) : c, 0];
      }
      case 'board': { // board and batten
        const b = x % 8;
        if (b === 0 || b === 1) return [mulc(wall, 0.72 + hash2(x >> 3, 1, seed) * 0.1), 1];
        const c = mulc(wall, 0.88 + hash2(x >> 3, 2, seed) * 0.18);
        return [(y + (x >> 3) * 7) % 13 === 0 ? mulc(c, 0.86) : c, 0];
      }
      case 'stone': { // bevelled blocks
        const row = Math.floor(y / 7), off = (row % 2) * 6;
        const bx = Math.floor((x + off) / 12);
        const lx = (x + off) % 12, ly = y % 7;
        if (ly === 0 || lx === 0) return [mixc(wall, 0x2a2420, 0.5), -1];
        const c = mulc(wall, 0.84 + hash2(bx, row, seed) * 0.3);
        if (ly === 6 || lx === 1) return [mulc(c, 1.1), 0];
        if (ly === 1 || lx === 11) return [mulc(c, 0.86), 0];
        return [h3(x, y, 0, seed) < 0.015 ? mulc(c, 0.88) : c, 0];
      }
      case 'brick': {
        const row = Math.floor(y / 4), off = (row % 2) * 4;
        const lx = (x + off) % 8;
        if (y % 4 === 0 || lx === 0) return [0xb8a890, -1];
        const c = mulc(wall, 0.84 + hash2(Math.floor((x + off) / 8), row, seed) * 0.3);
        return [c, hash2(Math.floor((x + off) / 8), row, seed + 1) > 0.93 ? 1 : 0];
      }
      default: { // half-timbered plaster
        const mid = Math.round(H * 0.47);
        const px = x % 20;
        if (px < 2 || y === mid || y === mid + 1) return [mulc(trim, px < 1 ? 0.9 : 1), 1];
        if (y < mid && x % 40 < 20) { const t = (y / mid) * 18 + 1; if (Math.abs(px - t) < 1.2 || Math.abs(px - (19 - t)) < 1.2) return [mulc(trim, 1.06), 1]; }
        let c = mulc(wall, 0.995 * sp3(x >> 1, y >> 1, 0, seed, 0.04));
        if (h3(x, y, 1, seed) < 0.006) c = mulc(c, 0.85);
        return [c, 0];
      }
    }
  };
  // wall body
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const [c, r] = pat(x, y);
    const zf = FZ + (r > 0 ? 1 : r < 0 ? -1 : 0);
    for (let z = Math.max(0, zf - 4); z < zf; z++) g.set(x, y, z, z < zf - 1 ? mulc(c, 0.8) : c);
  }
  // foundation stones
  g.box(0, 0, 0, W, 6, FZ + 2, (x, y, z) => { const b = Math.floor((x + (y > 2 ? 5 : 0)) / 10); return (y === 3 || (x + (y > 2 ? 5 : 0)) % 10 === 0) ? 0x3e3832 : mulc(0x7a7470, 0.84 + hash2(b, y > 2 ? 1 : 0, seed) * 0.3); });
  // corner posts + top beam
  for (const x of [0, W - 4]) g.box(x, 6, FZ - 2, 4, H - 6, 4, beam(trim, 'y', seed + x));
  g.box(0, H - 4, FZ - 2, W, 4, 5, beam(trim, 'x', seed + 3));
  for (let x = 6; x < W - 4; x += 14) g.set(x, H - 2, FZ + 3, C.ironL);
  // roof eave: shingle rows stepping back toward the rock
  const rc = cfg.roofColor ?? 0x4a5058;
  for (let k = 0; k < 16; k++) {
    const y = H + k, zf = Math.min(D - 1, FZ + 8 - k);
    const off = (k % 2) * 3;
    for (let x = -0; x < W; x++) for (let z = 0; z <= zf; z++) {
      const tile = Math.floor((x + off) / 6);
      let c = mulc(rc, 0.86 + Math.floor(hash2(tile, k, seed + 4) * 3) * 0.08);
      if (z === zf && (x + off) % 6 === 0) c = mulc(rc, 0.62);
      if (z === zf) c = mulc(c, 0.92);
      g.set(x, y, z, c);
    }
  }
  // door
  const dr = cfg.door;
  let doorInfo = null;
  if (dr) {
    const dw = dr.w * 2, dh = (dr.h ?? 14) * 2;
    const dx0 = Math.round(dr.u * V - dw / 2), y0 = 6;
    const inDoor = (x, y) => {
      if (x < dx0 || x >= dx0 + dw || y < y0) return false;
      if (!dr.round) return y < y0 + dh;
      const r = dw / 2, cy = y0 + dh - r;
      return y < cy || (x + 0.5 - (dx0 + r)) ** 2 + (y - cy) ** 2 <= r * r;
    };
    for (let x = dx0 - 3; x < dx0 + dw + 3; x++) for (let y = y0; y < y0 + dh + 3; y++) {
      if (inDoor(x, y)) {
        for (let z = 6; z < FZ + 2; z++) g.clear(x, y, z);
        const pl = Math.floor((x - dx0) / 5);
        const c = (x - dx0) % 5 === 0 ? mulc(dr.color, 0.66) : mulc(dr.color, 0.88 + hash2(pl, 3, seed) * 0.16);
        g.set(x, y, 8, c); g.set(x, y, 7, mulc(dr.color, 0.7));
      } else if (inDoor(x - 1, y) || inDoor(x + 1, y) || inDoor(x, y - 1) || inDoor(x - 2, y) || inDoor(x + 2, y) || inDoor(x, y - 2) || inDoor(x - 1, y - 1) || inDoor(x + 1, y - 1)) {
        for (let z = FZ - 2; z < FZ + 2; z++) g.set(x, y, z, beam(trim, 'y', seed + 9)(x, y, z));
      }
    }
    // iron straps, hinges, knob, a small glowing window in the door
    for (const sy of [y0 + 6, y0 + dh - 10]) for (let x = dx0; x < dx0 + dw - 4; x++) if (inDoor(x, sy)) { g.set(x, sy, 9, C.iron); g.set(x, sy + 1, 9, x % 4 === 0 ? C.ironL : C.iron); }
    g.box(dx0 + dw - 5, y0 + Math.floor(dh * 0.42), 9, 2, 2, 2, C.brass);
    if (dr.window !== false) for (let x = dx0 + dw / 2 - 3; x < dx0 + dw / 2 + 3; x++) for (let y = y0 + dh - 9; y < y0 + dh - 4; y++) if (inDoor(x, y)) { g.clear(x, y, 8); g.clear(x, y, 7); glow.set(x, y, 7, y > y0 + dh - 7 ? 0xffd890 : 0xffb24a); if (x === dx0 + dw / 2 || y === y0 + dh - 7) g.set(x, y, 8, mulc(dr.color, 0.6)); }
    // step
    g.box(dx0 - 2, 5, FZ, dw + 4, 1, 5, (x, y, z) => mulc(0x7a726a, 0.975 * sp3(x, y, z, 2)));
    doorInfo = { u: (dx0 + dw / 2) / V };
  }
  // windows: frames, mullions, sills, shutters, flower boxes, bars
  const frame = cfg.frame ?? 0xe8dcc0;
  for (const w of cfg.windows || []) {
    const ww = w.w * 2, wh = w.h * 2, x0 = Math.round(w.u * V - ww / 2), y0 = w.y * 2;
    for (let x = x0; x < x0 + ww; x++) for (let y = y0; y < y0 + wh; y++) {
      for (let z = FZ - 4; z < FZ + 2; z++) g.clear(x, y, z);
      glow.set(x, y, FZ - 4, y > y0 + wh * 0.6 ? 0xffd890 : (x + y) % 9 === 0 ? 0xffe8b0 : 0xffb24a);
    }
    // shelves / bottles silhouettes inside
    for (let x = x0; x < x0 + ww; x++) { g.set(x, y0 + Math.floor(wh * 0.38), FZ - 3, 0x3a2414); if (hash2(x, 1, seed) < 0.4) g.set(x, y0 + Math.floor(wh * 0.38) + 1, FZ - 3, [0x6a3a2a, 0x2a4a6a, 0x4a6a2a][x % 3]); }
    const mx = x0 + Math.floor(ww / 2), my = y0 + Math.floor(wh / 2);
    for (let x = x0; x < x0 + ww; x++) g.set(x, my, FZ - 1, frame);
    for (let y = y0; y < y0 + wh; y++) g.set(mx, y, FZ - 1, frame);
    for (let x = x0 - 2; x < x0 + ww + 2; x++) { for (const y of [y0 - 1, y0 + wh]) g.set(x, y, FZ + 1, mulc(frame, 0.95)); g.set(x, y0 - 2, FZ + 2, mulc(frame, 0.82)); g.set(x, y0 - 2, FZ + 3, mulc(frame, 0.82)); }
    for (let y = y0 - 1; y <= y0 + wh; y++) { g.set(x0 - 1, y, FZ + 1, frame); g.set(x0 + ww, y, FZ + 1, frame); }
    if (w.bars) for (let x = x0 + 1; x < x0 + ww; x += 3) for (let y = y0; y < y0 + wh; y++) g.set(x, y, FZ + 1, C.iron);
    if (w.shutters !== false && !w.bars) {
      const sc = cfg.shutter ?? mulc(cfg.door?.color ?? 0x4a6a3a, 1.1);
      for (const sx of [x0 - 7, x0 + ww + 2]) g.box(sx, y0, FZ, 5, wh, 1, (x, y) => ((y - y0) % 3 === 0 ? mulc(sc, 0.72) : sc));
    }
    if (w.box) {
      g.box(x0 - 2, y0 - 6, FZ + 1, ww + 4, 4, 4, wood(C.woodL, { axis: 'x', across: 'y', pw: 99, seed: x0 }));
      const fl = [0xf0a0c0, 0xf0e070, 0x9fd6ff, 0xffffff, 0xe0402a];
      for (let x = x0 - 1; x < x0 + ww + 1; x++) for (let z = FZ + 2; z < FZ + 4; z++) {
        if (hash2(x, z, seed) < 0.8) g.set(x, y0 - 2 + (hash2(x, z, 5) < 0.3 ? 1 : 0), z, (x + z) % 3 ? 0x5aa84a : 0x4a8a3a);
        if (hash2(x, z, seed + 1) < 0.22) g.set(x, y0 - 1 + (hash2(x, z, 6) < 0.5 ? 1 : 0), z, fl[Math.floor(hash2(z, x, seed) * fl.length)]);
      }
    }
  }
  // awning on iron rods: striped cloth sloping out over the front, scalloped hem
  if (cfg.awning) {
    const [a, b] = cfg.awning;
    const top = H - 14;
    for (let k = 0; k < 9; k++) {
      const y = top - Math.round(k * 0.7), z = FZ + 1 + k;
      for (let x = 3; x < W - 3; x++) {
        const s = Math.floor((x - 3) / 6) % 2;
        g.set(x, y, z, mulc(s ? a : b, 0.98 * sp3(x, k, 0, seed) - k * 0.012));
      }
    }
    const yb = top - Math.round(8 * 0.7);
    for (let x = 3; x < W - 3; x++) { const sc = (x - 3) % 6; const s = Math.floor((x - 3) / 6) % 2; if (sc > 0 && sc < 5) g.set(x, yb - 1, FZ + 9, s ? a : b); if (sc > 1 && sc < 4) g.set(x, yb - 2, FZ + 9, s ? a : b); }
    for (const x of [4, W - 5]) line(g, [[x, top - 6, FZ], [x, yb, FZ + 9]], 0.5, C.iron);
  }
  const grp = group(M16(g, [0, 0, 0]), G16(glow, [0, 0, 0]));
  return { obj: grp, H: H / V, door: doorInfo, FZ: FZ / V };
}

// ---------------------------------------------------------------- per-shop dressing (1/32)
function grindstone() {
  const g = new VoxelGrid(30, 30, 20);
  const fr = beam(C.woodD, 'y', 2);
  for (const [x, z] of [[2, 3], [24, 3], [2, 14], [24, 14]]) g.box(x, 0, z, 4, 16, 3, fr);
  g.box(2, 14, 3, 26, 3, 14, wood(C.wood, { axis: 'x', across: 'z', pw: 4, seed: 3 }));
  g.box(0, 17, 9, 30, 2, 2, C.iron);
  for (let y = 0; y < 26; y++) for (let x = 0; x < 26; x++) {
    const d = Math.hypot(x + 0.5 - 13, y + 0.5 - 13);
    if (d < 11.5) for (const z of [8, 9, 10, 11]) g.set(x + 2, y + 6, z, d > 10 ? 0x5a524c : d < 2 ? C.ironL : mulc(0x9a948e, 0.97 * sp3(x, y, z, 2) - (Math.round(d) % 3 === 0 ? 0.06 : 0)));
  }
  g.box(28, 17, 9, 2, 6, 2, C.woodL); // crank handle
  // water trough underneath
  g.box(6, 0, 4, 18, 5, 12, (x, y, z) => (y === 4 && x > 6 && x < 23 && z > 4 && z < 15 ? 0x3a6a9a : mulc(C.woodD, sp3(x, y, z, 1))));
  return { obj: M32(g, [15, 0, 10]), shadow: { rx: 0.5, rz: 0.35, k: 0.6 }, r: 0.36 };
}

function pickBarrel() {
  const b = barrel(3, { color: 0x7a5030, fill: 'coal' });
  const g = new VoxelGrid(26, 56, 26);
  for (const [x, z, lx, lz] of [[9, 10, -0.2, -0.1], [15, 12, 0.18, -0.05], [12, 16, 0.02, 0.2]]) {
    line(g, [[x, 22, z], [x + lx * 30, 50, z + lz * 30]], 0.8, (xx, y, zz) => mulc(C.wood, sp3(xx, y, zz, 1)));
    const tx = x + lx * 30, tz = z + lz * 30;
    line(g, [[tx - 7, 47, tz], [tx, 52, tz], [tx + 7, 47, tz]], 1, (xx) => (Math.abs(xx - tx) > 5 ? 0xd6dbe2 : 0x9aa0a8));
  }
  return { obj: group(b.obj, M32(g, [13, 0, 13])), shadow: b.shadow, r: 0.36 };
}

function veggieCrate(seed, veg) {
  return crate(seed, { open: true, goods: veg, h: 16 });
}

function chalkboard(lines = ['FRESH', 'ROOTS']) {
  const g = new VoxelGrid(30, 44, 16);
  // A-frame
  line(g, [[3, 0, 2], [8, 42, 7]], 1, C.wood); line(g, [[27, 0, 2], [22, 42, 7]], 1, C.wood);
  line(g, [[3, 0, 13], [8, 42, 8]], 1, C.woodD); line(g, [[27, 0, 13], [22, 42, 8]], 1, C.woodD);
  // board on the front legs
  for (let y = 12; y < 40; y++) { const z = 2 + Math.round((y / 42) * 5); for (let x = 5 + Math.round(y * 0.12); x < 25 - Math.round(y * 0.12); x++) g.set(x, y, z, (y === 12 || y === 39 || x === 5 + Math.round(y * 0.12) || x === 24 - Math.round(y * 0.12)) ? C.woodL : 0x2a3a30); }
  // chalk scribbles
  for (let y = 33; y >= 16; y -= 4) for (let x = 9; x < 21; x++) if (hash2(x, y, lines.length) < 0.6) g.set(x, y, 1 + Math.round((y / 42) * 5), y > 28 ? 0xe8e8e0 : y > 20 ? 0xd8f0a0 : 0xf0c0a0);
  return { obj: M32(g, [15, 0, 8]), shadow: { rx: 0.4, rz: 0.25, k: 0.7 }, r: 0.25 };
}

function mannequin() {
  const g = new VoxelGrid(28, 62, 22);
  g.box(10, 0, 7, 8, 2, 8, C.woodD); g.box(13, 2, 10, 2, 20, 2, C.wood);
  g.ellipsoid(14, 32, 11, 9, 12, 7, cloth(0x5a6a3a, { seed: 3 }));
  g.box(5, 26, 4, 18, 2, 15, 0x6a4a2a); g.box(12, 26, 18, 4, 2, 1, C.brass); // belt + buckle
  for (let y = 28; y < 42; y += 4) g.set(14, y, 18, C.brass); // buttons
  g.ellipsoid(14, 50, 11, 7, 6.5, 6.5, 0xd8c8a8);
  g.ellipsoid(14, 54, 11, 8.5, 5, 8.5, (x, y) => (y < 54 ? -1 : 0xd9a84a));
  g.box(10, 54, 18, 8, 4, 2, 0x4a4a52); g.box(12, 55, 19, 4, 2, 1, 0xfff0c0);
  g.box(6, 24, 0, 16, 18, 5, cloth(0x8a5a2a, { seed: 4 })); g.box(8, 40, 1, 12, 3, 3, 0x6a4a2a); // backpack
  return { obj: M32(g, [14, 0, 11]), shadow: { rx: 0.3, rz: 0.3, k: 0.65 }, r: 0.28 };
}

function scales() {
  const g = new VoxelGrid(44, 52, 24);
  g.box(4, 0, 4, 36, 17, 16, (x, y, z) => (y === 16 ? C.woodL : wood(C.woodD, { axis: 'x', across: 'y', pw: 4, seed: 2 })(x, y, z)));
  g.box(20, 17, 11, 4, 24, 4, C.brass); g.box(4, 40, 11, 36, 2, 3, C.gold);
  for (const x of [7, 37]) { g.box(x, 28, 12, 1, 12, 1, C.brass); g.ellipsoid(x + 0.5, 26, 12.5, 6, 2.4, 6, (xx, y) => (y < 26 ? C.gold : -1)); }
  g.box(33, 28, 10, 6, 2, 6, C.gold); g.box(35, 30, 12, 2, 1, 2, 0xffe08a);
  g.box(20, 42, 10, 4, 4, 4, C.gold);
  for (let i = 0; i < 3; i++) g.box(7 + i * 6, 17, 6, 6, 2, 4, i % 2 ? C.gold : 0xd8a830);
  g.box(9, 19, 6, 6, 2, 4, 0xffd34a);
  return { obj: M32(g, [22, 0, 12]), shadow: { rx: 0.6, rz: 0.35, k: 0.6 }, r: 0.4 };
}

function blueprintRolls() {
  const b = barrel(5, { color: 0x5a4a3a, fill: null, lid: false });
  const g = new VoxelGrid(26, 50, 26);
  for (const [x, z, h, c] of [[8, 8, 40, 0xe8dcc0], [14, 10, 44, 0x6a9ad9], [10, 15, 36, 0xe8dcc0], [16, 16, 42, 0x5a8ac9], [12, 12, 46, 0xd8ccb0]]) {
    ring(g, x, z, 0, 2.2, 6, h, c);
    ring(g, x, z, 0, 1, h - 1, h, mulc(c, 0.7));
    g.set(Math.round(x), h - 6, Math.round(z + 2), 0xc0402a);
  }
  return { obj: group(b.obj, M32(g, [13, 0, 13])), shadow: b.shadow, r: 0.35 };
}

function easel() {
  const g = new VoxelGrid(34, 56, 20);
  line(g, [[6, 0, 6], [14, 54, 8]], 1, C.wood); line(g, [[28, 0, 6], [20, 54, 8]], 1, C.wood); line(g, [[17, 0, 18], [17, 50, 9]], 1, C.woodD);
  g.box(4, 18, 6, 26, 2, 5, C.woodD);
  g.box(6, 20, 9, 22, 26, 1, (x, y) => (x === 6 || x === 27 || y === 20 || y === 45 ? 0xd8e8ff : 0x3a6ac9));
  for (let k = 0; k < 14; k++) g.set(9 + k, 28 + Math.round(Math.sin(k * 0.6) * 4), 10, 0xe8f0ff);
  g.box(12, 38, 10, 10, 1, 1, 0xe8f0ff); g.box(16, 26, 10, 1, 14, 1, 0xe8f0ff);
  return { obj: M32(g, [17, 0, 10]), shadow: { rx: 0.4, rz: 0.3, k: 0.7 }, r: 0.25 };
}

function chairTable() {
  const g = new VoxelGrid(60, 30, 32);
  const leg = C.woodD;
  for (const [x, z] of [[2, 6], [17, 6], [2, 21], [17, 21]]) g.box(x, 0, z, 2, 12, 2, leg);
  g.box(2, 12, 6, 17, 2, 17, wood(C.woodL, { axis: 'x', across: 'z', pw: 4, seed: 2 }));
  g.box(2, 14, 6, 17, 14, 2, wood(C.wood, { axis: 'y', across: 'x', pw: 4, seed: 3 }));
  ring(g, 42, 16, 0, 10, 16, 18, wood(C.woodL, { axis: 'x', across: 'z', pw: 5, seed: 4 }));
  g.box(41, 0, 15, 3, 16, 3, C.woodD); g.box(36, 0, 15, 13, 2, 3, C.woodD); g.box(41, 0, 10, 3, 2, 13, C.woodD);
  g.box(38, 18, 14, 4, 4, 4, 0xd96a6a); g.box(39, 22, 15, 2, 1, 2, 0xd96a6a); // teapot
  g.box(46, 18, 18, 3, 3, 3, 0xf6f0e8); g.set(47, 21, 19, 0x8a5a3a);
  g.ellipsoid(44, 18.5, 11, 2.2, 1, 2.2, 0xe8c070); // a plate of cookies
  return { obj: M32(g, [30, 0, 16]), shadow: { rx: 0.85, rz: 0.45, k: 0.62 }, r: 0.45 };
}

function strongbox() {
  const g = new VoxelGrid(26, 20, 18);
  g.box(0, 0, 0, 26, 16, 18, (x, y, z) => (y === 6 || y === 7 || x < 2 || x > 23 ? C.iron : mulc(0x5a3a2a, 0.98 * sp3(x >> 1, y, z >> 1, 2))));
  g.box(0, 16, 1, 26, 3, 16, (x, y) => (y === 18 ? 0x7a5a3a : 0x6a4a3a));
  g.box(11, 9, 18, 4, 4, 1, C.gold); g.set(12, 10, 19, 0x2a1a10); g.set(13, 10, 19, 0x2a1a10);
  for (const x of [1, 24]) for (const y of [2, 12]) g.set(x, y, 18, C.ironL);
  return { obj: M32(g, [13, 0, 9]), shadow: { rx: 0.45, rz: 0.32, k: 0.6 }, r: 0.36 };
}

const SHOP_LOOK = {
  tools: { style: 'stone', wall: 0x7a7470, trim: 0x4a3020, roofColor: 0x46505a, door: { u: 2.5, w: 10, h: 15, color: 0x5a3a22 }, windows: [{ u: 0.95, y: 7, w: 8, h: 8, box: true }, { u: 4.05, y: 7, w: 8, h: 8 }], sign: { text: "GRUBB'S PICKS", icon: 'pick_iron', board: 0x5a3a22, trim: 0x9aa0a8 } },
  grocer: { style: 'plank', wall: 0x9a6a3a, trim: 0x5a3a22, roofColor: 0x6a4a2a, awning: [0x4a8a3a, 0xf0e8d0], door: { u: 2.5, w: 10, h: 13, color: 0x4a7a3a }, windows: [{ u: 1.0, y: 5, w: 9, h: 7, box: true }, { u: 4.0, y: 5, w: 9, h: 7, box: true }], sign: { text: 'NIBBLE & ROOT', icon: 'cave_carrot', board: 0x4a6a2a, trim: 0xe0b040 } },
  furniture: { style: 'plaster', wall: 0xe8dcc0, trim: 0x5a3a22, roofColor: 0xa84a3a, door: { u: 2.5, w: 10, h: 15, color: 0x3a6a9a, round: true }, windows: [{ u: 1.0, y: 6, w: 8, h: 8, box: true }, { u: 4.0, y: 6, w: 8, h: 8, box: true }], sign: { text: 'BURROW & BOARD', icon: 'chair_wood', board: 0x7a4a2a, trim: 0xe0b040 } },
  blueprints: { style: 'plank', wall: 0x3a4a6a, trim: 0x2a2a3a, roofColor: 0x2e2e40, frame: 0xd8c8a0, door: { u: 3.6, w: 10, h: 15, color: 0x8a2a2a }, windows: [{ u: 1.3, y: 6, w: 10, h: 10 }], sign: { text: 'INKWELL PLANS', icon: 'bp_longsword', board: 0x2a3a5a, trim: 0xd8c8a0 } },
  outfitter: { style: 'board', wall: 0x5a6a3a, trim: 0x3a2a1a, roofColor: 0x6a4a2a, door: { u: 2.5, w: 10, h: 15, color: 0x7a4a2a }, windows: [{ u: 1.0, y: 6, w: 8, h: 8 }, { u: 4.0, y: 6, w: 8, h: 8, box: true }], sign: { text: 'GEARWICK', icon: 'helmet_brass', board: 0x4a3a20, trim: 0xd9a84a } },
  assay: { style: 'brick', wall: 0x8a4a3a, trim: 0x2e2e36, roofColor: 0x2e3038, frame: 0xd9a84a, door: { u: 2.5, w: 10, h: 15, color: 0x4a3a2a }, windows: [{ u: 1.0, y: 7, w: 8, h: 8, bars: true }, { u: 4.0, y: 7, w: 8, h: 8, bars: true }], sign: { text: "VEX'S ASSAY", icon: 'gold_ingot', board: 0x2e2e36, trim: 0xf2c23a } },
};

/**
 * Build a complete shop front at local origin (rock face, left end).
 * Returns {obj, door:{u, z}, lights:[local], props:[{x,z,r}], signs:[{pc, w, h, anchor}], shadows:[{x,z,rx,rz,k}]}
 */
export function buildShop(id, w, yaw = 0) {
  return withView(viewForYaw(yaw), () => buildShopInner(id, w));
}

function buildShopInner(id, w) {
  const look = SHOP_LOOK[id];
  const f = facade({ ...look, w, seed: id.length * 7 });
  const grp = new THREE.Group();
  grp.add(f.obj);
  const top = f.H;
  // name board under the eave (drawn at 2x for crisp wood and full-size icons)
  const s = look.sign;
  const signs = [];
  const pcw = Math.max(48, Math.min(80, 26 + s.text.length * 4));
  const pc = signCanvas({ w: pcw, h: 20, scale: 2, text: s.text, icon: s.icon, board: s.board, trim: s.trim });
  const anchor = new THREE.Object3D();
  anchor.position.set(w / 2, top - 0.58, 1.12);
  grp.add(anchor);
  signs.push({ pc, w: pc.w / 32, h: pc.h / 32, anchor });
  // the board's backing plank + iron hooks
  const bk = new VoxelGrid(pc.w + 6, pc.h + 6, 3);
  bk.box(0, 0, 0, bk.w, bk.h, 3, (x, y, z) => (z === 2 && (x === 0 || y === 0 || x === bk.w - 1 || y === bk.h - 1) ? mulc(s.board, 1.2) : mulc(s.board, 0.67 * sp3(x >> 2, y, z, 2))));
  const bkm = M32(bk, [bk.w / 2, bk.h / 2, 3]);
  bkm.position.set(w / 2, top - 0.58, 1.1);
  grp.add(bkm);
  const lights = [];
  // lanterns either side of the door
  const du = look.door.u;
  for (const off of [-0.98, 0.98]) {
    const l = wallLantern(Math.round(off * 10) + id.length);
    l.obj.position.set(du + off, 1.18, 1.0);
    grp.add(l.obj);
    lights.push({ x: du + off, y: 1.18 + l.light.y, z: 1.0 + l.light.z });
  }
  // dressing (props also become small round obstacles)
  const props = [];
  const add = (r, x, z, ry = 0) => { r.obj.position.set(x, 0, z); r.obj.rotation.y = ry; grp.add(r.obj); props.push({ x, z, r: r.r ?? 0.3, shadow: r.shadow }); return r.obj; };
  if (id === 'tools') { add(grindstone(), 4.35, 1.6, -0.25); add(pickBarrel(), 0.75, 1.45); add(crate(2), 1.45, 1.4, 0.2); add(barrel(4, { fill: 'ore' }), 4.4, 2.25); }
  if (id === 'grocer') {
    add(veggieCrate(1, [0xf0a050, 0xe8904a, 0x6ab84a]), 0.7, 1.45); add(veggieCrate(2, [0xe0c8a0, 0xf0e0c8, 0xc8a878]), 1.45, 1.55, 0.15);
    add(veggieCrate(3, [0x6ac8ff, 0xd8f6ff, 0x5ad0e0]), 4.35, 1.45); add(sack({ open: true, fillColor: 0xe8dcc0, spill: true }), 3.7, 1.4); add(chalkboard(), 4.4, 2.3, -0.4);
  }
  if (id === 'furniture') { add(chairTable(), 0.95, 1.65); add(barrel(7, { color: 0xa86a3a }), 4.4, 1.45); add(pottedFern(3), 3.75, 1.35); }
  if (id === 'blueprints') { add(blueprintRolls(), 0.6, 1.45); add(easel(), 1.7, 1.6, 0.25); add(crate(4), 4.5, 1.45); }
  if (id === 'outfitter') { add(mannequin(), 0.8, 1.6, 0.3); add(crate(6), 4.3, 1.45); add(sack({ color: 0xa88a5a }), 4.45, 2.15); }
  if (id === 'assay') { add(scales(), 0.95, 1.6); add(strongbox(), 4.3, 1.45); add(bucket(false), 3.75, 1.3); }
  return { obj: grp, door: { u: du, z: 1.0 }, lights, top, props, signs };
}

export { SHOP_LOOK };

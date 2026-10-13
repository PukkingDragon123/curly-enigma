// Deep Town's cliff-side dressing at 1/32 voxels: the plank walkway along the upper
// ledge (brackets, posts, rope railing), round burrow doors and glowing windows carved
// into the rock, flower boxes, laundry lines, a pulley crane with a basket, chimney
// pipes, timber supports, wall lantern brackets and hanging shop signs.
// Local convention: x along the wall, z out of the wall (toward the camera side), y up.
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, iron, stone, cloth, line, sag, ring, M32, G32, group, mulc, mixc, h3, sp3, S32 } from './kit.js';
import { hash2 } from './surface.js';
import { makeRng } from '../core/util.js';

/** Plank walkway along a ledge: len units long, deck at y=0 (local), sticking out `out` units. */
export function walkway(len, out = 0.62, seed = 1) {
  const W = Math.round(len * 32), D = Math.round(out * 32);
  const g = new VoxelGrid(W, 34, D + 2);
  const deck = wood(0x8a6040, { axis: 'z', across: 'x', pw: 7, seed });
  // deck boards run across (z), with gaps
  g.box(0, 0, 0, W, 2, D, (x, y, z) => ((x % 7) === 6 ? -1 : deck(x, y, z)));
  // fascia beam along the front + brackets under it
  g.box(0, -0, D - 2, W, 2, 2, beam(C.woodD, 'x', seed + 1));
  for (let x = 4; x < W - 2; x += 40) {
    line(g, [[x + 1, 0, 1], [x + 1, 0, D - 2]], 1.2, C.woodD);
    // posts + rope railing
    g.box(x, 2, D - 3, 3, 26, 3, beam(C.wood, 'y', seed + x));
    g.box(x - 1, 27, D - 4, 5, 2, 5, C.woodD);
  }
  g.box(W - 3, 2, D - 3, 3, 26, 3, beam(C.wood, 'y', seed + 99));
  for (let x = 4; x < W - 2; x += 40) {
    const x2 = Math.min(W - 2, x + 40);
    for (const y of [25, 15]) line(g, sag([x + 1.5, y, D - 1.5], [x2 + 1.5 - (x2 === W - 2 ? 1 : 0), y, D - 1.5], 10, 2.5), 0.5, (xx, yy, zz) => ((xx + yy) % 3 ? C.rope : C.ropeD));
  }
  // underside brackets visible below the deck (struts back to the rock)
  const st = new VoxelGrid(W, 24, D + 2);
  for (let x = 4; x < W - 2; x += 40) line(st, [[x + 1.5, 23, D - 3], [x + 1.5, 6, 1], [x + 1.5, 0, 1]], 1.1, beam(C.woodD, 'y', x));
  const top = M32(g, [0, 0, 0]);
  const under = M32(st, [0, 24, 0]);
  return group(top, under);
}

const DOOR_COLS = [0x3a6a9a, 0x8a2a2a, 0x4a7a3a, 0xc8a050, 0x6a3a6a, 0x2a5a5a];
/** A round burrow door in a stone arch with hinges, knob, a lamp and a doormat. Origin: bottom-center, front at z≈0.2. */
export function burrowDoor(seed = 1, o = {}) {
  const g = new VoxelGrid(40, 42, 10);
  const col = o.color ?? DOOR_COLS[seed % DOOR_COLS.length];
  const cx = 20, r = 12, base = 14;
  const st = stone(0x8a8078, { seed: seed + 3 });
  for (let y = 0; y < 42; y++) for (let x = 0; x < 40; x++) {
    const dx = x + 0.5 - cx;
    const outer = y < base ? Math.abs(dx) <= r + 3.5 : dx * dx + (y - base) ** 2 <= (r + 3.5) ** 2;
    const inner = y < base ? Math.abs(dx) <= r : dx * dx + (y - base) ** 2 <= r * r;
    if (outer && !inner) {
      const a = Math.atan2(y - base, dx);
      const blk = Math.floor((a + Math.PI) / (Math.PI / 9));
      const seam = Math.abs(((a + Math.PI) / (Math.PI / 9)) % 1) < 0.12 && y >= base;
      for (let z = 0; z < 4; z++) g.set(x, y, z, seam ? 0x4a4038 : mulc(st(x, y, z), 0.92 + hash2(blk, 1, seed) * 0.16));
    }
    if (inner) {
      const pl = Math.floor((x + 1) / 5);
      g.set(x, y, 1, (x + 1) % 5 === 0 ? mulc(col, 0.66) : mulc(col, 0.9 + hash2(pl, 2, seed) * 0.16 - (y % 9 === 0 ? 0.05 : 0)));
      g.set(x, y, 0, mulc(col, 0.6));
    }
  }
  for (const y of [6, 19]) for (let x = cx - 10; x < cx + 2; x++) g.set(x, y, 2, x === cx - 10 ? C.ironL : C.iron);
  g.box(cx + 6, 11, 2, 2, 2, 1, C.brass); g.set(cx + 6, 12, 3, 0xffe08a);
  g.ellipsoid(cx, 21, 2.4, 3.2, 3.2, 0.6, 0x3a2a1a); // peephole frame
  g.box(cx - 8, 0, 4, 16, 1, 5, (x, y, z) => ((x + z) % 4 < 2 ? 0x9a6a3a : 0xb08048));
  const glass = new VoxelGrid(40, 42, 10);
  glass.ellipsoid(cx, 21, 2.9, 2.2, 2.2, 0.5, 0xffd27a);
  // a little lamp beside the door
  g.box(cx + 15, 22, 3, 1, 1, 4, C.iron); g.box(cx + 13, 14, 5, 5, 1, 5, C.iron); g.box(cx + 13, 22, 5, 5, 1, 5, C.iron);
  glass.box(cx + 14, 15, 6, 3, 7, 3, (x, y) => (y > 18 ? C.glowW : C.glowO));
  const obj = group(M32(g, [20, 0, 0]), G32(glass, [20, 0, 0]));
  return { obj, lights: [{ x: (cx + 15.5 - 20) * S32, y: 18.5 * S32, z: 7.5 * S32 }, { x: 0, y: 21 * S32, z: 3 * S32, weak: true }] };
}

/** A round window with a cross mullion, warm glow, shutters and a flower box. */
export function roundWindow(seed = 1, o = {}) {
  const g = new VoxelGrid(30, 28, 12);
  const glass = new VoxelGrid(30, 28, 12);
  const frame = o.frame ?? 0xe8dcc0;
  const cx = 15, cy = 15, r = 7;
  for (let y = 0; y < 28; y++) for (let x = 0; x < 30; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d <= r + 2 && d > r) { g.set(x, y, 1, mulc(frame, 0.97 * sp3(x, y, 0, seed))); g.set(x, y, 0, mulc(frame, 0.75)); }
    else if (d <= r) {
      if (Math.abs(x + 0.5 - cx) < 0.8 || Math.abs(y + 0.5 - cy) < 0.8) g.set(x, y, 1, frame);
      else glass.set(x, y, 0, y > cy + 2 ? 0xffe0a0 : (x + y) % 7 === 0 ? 0xfff0c0 : 0xffb850);
    }
  }
  // shutters
  const sc = DOOR_COLS[(seed + 2) % DOOR_COLS.length];
  for (const sx of [cx - r - 7, cx + r + 3]) g.box(sx, cy - 6, 1, 4, 13, 1, (x, y) => (y % 3 === 0 ? mulc(sc, 0.7) : sc));
  // flower box
  g.box(cx - 9, cy - 11, 1, 18, 3, 6, wood(C.woodL, { axis: 'x', across: 'y', pw: 99, seed }));
  const fl = [0xf0a0c0, 0xf0e070, 0x9fd6ff, 0xffffff, 0xe0402a];
  for (let x = cx - 8; x < cx + 9; x++) {
    if (hash2(x, seed, 1) < 0.85) g.set(x, cy - 8, 3 + (x % 2), x % 3 ? 0x5aa84a : 0x4a8a3a);
    if (hash2(x, seed, 2) < 0.4) g.set(x, cy - 7, 3 + ((x + 1) % 2), fl[Math.floor(hash2(x, seed, 3) * fl.length)]);
  }
  return { obj: group(M32(g, [15, 0, 0]), G32(glass, [15, 0, 0])), glow: { x: 0, y: cy * S32, z: 0.08 } };
}

const CLOTHES = [0xc94a3a, 0x3a6ac9, 0xe0b030, 0x5aa84a, 0xe8e0d0, 0x8a5aa8, 0x6a4a3a];
/** Laundry line between two hooks (span units) with shirts, socks and overalls. */
export function laundryLine(span = 2.4, seed = 1) {
  const W = Math.round(span * 32);
  const g = new VoxelGrid(W + 4, 30, 6);
  const rng = makeRng(seed);
  const pts = sag([2, 28, 3], [W + 1, 28, 3], 24, 4);
  line(g, pts, 0.5, 0xd8d0c0);
  g.box(0, 24, 0, 3, 6, 3, C.iron); g.box(W + 1, 24, 0, 3, 6, 3, C.iron);
  let x = 6;
  while (x < W - 6) {
    const t = x / W, y = Math.round(28 - Math.sin(t * Math.PI) * 4);
    const c = rng.pick(CLOTHES), kind = rng.int(0, 3);
    if (kind === 0) { // shirt
      g.box(x, y - 10, 2, 9, 9, 2, cloth(c, { seed: x })); g.box(x - 2, y - 4, 2, 13, 3, 2, cloth(c, { seed: x + 1 }));
      x += 13;
    } else if (kind === 1) { // sock
      g.box(x, y - 7, 2, 3, 7, 2, cloth(c, { stripe: 2, alt: 0xe8e0d0, seed: x })); g.box(x + 1, y - 9, 2, 3, 2, 2, cloth(c, { seed: x }));
      x += 6;
    } else if (kind === 2) { // overalls
      g.box(x, y - 13, 2, 10, 8, 2, cloth(0x3a6a9a, { seed: x })); g.box(x, y - 18, 2, 4, 6, 2, cloth(0x3a6a9a, { seed: x + 2 })); g.box(x + 6, y - 18, 2, 4, 6, 2, cloth(0x3a6a9a, { seed: x + 3 }));
      g.box(x + 1, y - 5, 2, 2, 5, 2, 0x3a6a9a); g.box(x + 7, y - 5, 2, 2, 5, 2, 0x3a6a9a); g.set(x + 2, y - 7, 4, C.brass); g.set(x + 7, y - 7, 4, C.brass);
      x += 14;
    } else { // towel
      g.box(x, y - 9, 2, 8, 9, 2, cloth(c, { stripe: 3, alt: 0xf0e8d8, seed: x }));
      x += 11;
    }
    g.set(x - 3, y, 4, 0xa87a48); // peg
  }
  return M32(g, [0, 28, 3]);
}

/** A wooden jib crane with a pulley, rope and a hanging basket (rope drops `drop` units). */
export function crane(drop = 1.6, seed = 1) {
  const n = Math.round(drop * 32);
  const g = new VoxelGrid(16, 40 + n, 58);
  const bm = beam(C.woodD, 'z', seed);
  g.box(6, n + 24, 0, 4, 4, 54, bm); // jib
  line(g, [[8, n + 2, 1], [8, n + 23, 34]], 1.2, beam(C.woodD, 'y', seed + 1)); // strut
  g.box(5, n + 22, 0, 6, 8, 3, C.iron); // wall plate
  // pulley wheel at the tip
  for (let y = 0; y < 12; y++) for (let z = 0; z < 12; z++) {
    const d = Math.hypot(y + 0.5 - 6, z + 0.5 - 6);
    if (d < 5.6) { g.set(7, n + 22 + y - 9, 44 + z, d > 4.4 ? C.iron : d < 1.4 ? C.ironL : C.woodL); g.set(8, n + 22 + y - 9, 44 + z, d > 4.4 ? C.iron : C.woodL); }
  }
  // rope down + basket
  line(g, [[8, n + 19, 50], [8, 12, 50]], 0.5, C.rope);
  line(g, [[8, n + 19, 39], [8, n + 24, 40]], 0.5, C.rope);
  ring(g, 8.5, 50.5, 0, 6, 0, 10, (x, y, z) => (y === 0 ? 0x8a6a3a : (x + y + z) % 2 ? 0xb08a50 : 0x8a6a3a));
  ring(g, 8.5, 50.5, 0, 5, 1, 10, -1);
  for (let k = 0; k < 6; k++) g.ellipsoid(6 + (k % 3) * 2.5, 9 + (k % 2), 48 + Math.floor(k / 3) * 4, 1.8, 1.6, 1.8, [0xe0c8a0, 0xf0a050, 0x8ac04a][k % 3]);
  line(g, [[3, 10, 50.5], [8.5, 15, 50.5], [14, 10, 50.5]], 0.5, C.ropeD);
  return M32(g, [8, n, 0]);
}

/** Iron chimney pipe poking out of the rock and bending up. Origin at the wall; returns smoke point. */
export function chimneyPipe(h = 0.8, seed = 1) {
  const n = Math.round(h * 32);
  const g = new VoxelGrid(12, n + 6, 16);
  const ir = iron(0x4a4a54, seed);
  g.box(3, 0, 0, 6, 6, 9, ir);
  g.box(3, 0, 8, 6, n, 6, (x, y, z) => (y % 10 === 0 ? 0x5c5c68 : ir(x, y, z)));
  g.box(2, n, 7, 8, 2, 8, 0x2e2e36);
  g.box(2, n + 2, 7, 8, 1, 8, -1);
  return { obj: M32(g, [6, 0, 0]), smoke: { x: 0, y: (n + 2) * S32, z: 11 * S32 } };
}

/** Timber support frame against the rock: two posts, a cap beam and diagonal braces with iron bands. */
export function timberFrame(w = 2.2, h = 3.4, seed = 1) {
  const W = Math.round(w * 32), H = Math.round(h * 32);
  const g = new VoxelGrid(W, H, 10);
  const post = beam(0x6a4a2e, 'y', seed);
  g.box(0, 0, 2, 6, H, 6, post); g.box(W - 6, 0, 2, 6, H, 6, post);
  g.box(0, H - 6, 1, W, 6, 8, beam(0x5e4028, 'x', seed + 1));
  line(g, [[6, H - 22, 5], [22, H - 6, 5]], 2, beam(0x6a4a2e, 'x', seed + 2));
  line(g, [[W - 6, H - 22, 5], [W - 22, H - 6, 5]], 2, beam(0x6a4a2e, 'x', seed + 3));
  for (const y of [8, H - 14]) for (const x of [0, W - 6]) g.box(x - 0, y, 1, 6, 2, 8, C.iron);
  for (const x of [2, W - 4]) for (const y of [9, H - 13]) g.set(x, y, 8, C.ironL);
  return M32(g, [W / 2, 0, 0]);
}

/** Iron wall bracket with a hanging lantern (light local point returned). */
export function wallLantern(seed = 1) {
  const g = new VoxelGrid(12, 30, 18);
  const ir = iron(C.iron, seed);
  g.box(4, 20, 0, 4, 6, 2, ir); // wall plate
  line(g, [[6, 24, 1], [6, 24, 12], [6, 22, 14]], 0.7, ir);
  line(g, [[6, 21, 1], [6, 23.5, 7]], 0.5, ir);
  g.box(6, 18, 13, 1, 4, 1, ir);
  g.box(2, 16, 9, 9, 2, 9, ir); g.box(3, 18, 10, 7, 1, 7, ir);
  for (const [x, z] of [[2, 9], [10, 9], [2, 17], [10, 17]]) g.box(x, 5, z, 1, 11, 1, ir);
  g.box(2, 4, 9, 9, 1, 9, ir); g.box(4, 2, 11, 5, 2, 5, ir);
  const glass = new VoxelGrid(12, 30, 18);
  glass.box(3, 5, 10, 7, 11, 7, (x, y) => (y > 11 ? C.glowW : C.glowO));
  glass.box(5, 8, 12, 3, 5, 3, C.glowY);
  return { obj: group(M32(g, [6, 0, 0]), G32(glass, [6, 0, 0])), light: { x: 0, y: 10 * S32, z: 13.5 * S32 } };
}

/** Wrought-iron bracket holding a hanging board (the board's art is a separate textured plane). */
export function signBracket(span = 0.8, seed = 1) {
  const W = Math.round(span * 32) + 6;
  const g = new VoxelGrid(6, 22, W);
  const ir = iron(C.iron, seed);
  g.box(1, 12, 0, 4, 8, 2, ir);
  line(g, [[3, 18, 1], [3, 18, W - 1]], 0.8, ir);
  line(g, [[3, 13, 1], [3, 15, 6], [3, 17.5, 11]], 0.6, ir);
  line(g, [[3, 17, 3], [3, 15, 3], [3, 14, 5]], 0.5, ir);
  for (const z of [4, W - 3]) line(g, [[3, 18, z], [3, 12, z]], 0.4, C.ironL);
  return M32(g, [3, 0, 0]);
}

/** A wooden flower box on brackets (for shop windows). */
export function flowerBox(w = 0.9, seed = 1) {
  const W = Math.round(w * 32);
  const g = new VoxelGrid(W, 14, 10);
  g.box(0, 0, 0, W, 5, 7, wood(C.woodL, { axis: 'x', across: 'y', pw: 99, seed }));
  g.box(1, 4, 1, W - 2, 1, 5, 0x3a2a1a);
  const fl = [0xf0a0c0, 0xf0e070, 0x9fd6ff, 0xffffff, 0xe0402a, 0xc890f0];
  for (let x = 1; x < W - 1; x++) for (let z = 1; z < 6; z++) {
    if (hash2(x, z, seed) < 0.55) g.set(x, 5 + (hash2(x, z, seed + 1) < 0.4 ? 1 : 0), z, (x + z) % 3 ? 0x5aa84a : 0x4a8a3a);
    if (hash2(x, z, seed + 2) < 0.12) g.set(x, 7, z, fl[Math.floor(hash2(z, x, seed) * fl.length)]);
  }
  return M32(g, [W / 2, 0, 0]);
}

/** A little golden arrow that bobs over a door to show the way (glowing, origin at its tip). */
export function markerArrow() {
  const g = new VoxelGrid(15, 18, 4);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 15; x++) if (Math.abs(x - 7) <= y) g.set(x, y, 1, Math.abs(x - 7) === y ? 0xd99a20 : y < 3 ? 0xfff6c0 : 0xffd84a);
  g.box(4, 8, 1, 7, 9, 1, (x, y) => (x === 4 || x === 10 ? 0xd99a20 : y > 13 ? 0xfff6c0 : 0xffd84a));
  g.box(5, 9, 2, 2, 6, 1, 0xfffbe0);
  return G32(g, [7.5, 0, 1.5], { outline: true });
}

/**
 * The mole's own burrow entrance (2 tiles wide, 1/32 voxels): a voussoir stone arch with a
 * carved keystone and moss on top, a plank door with strap hinges, brass knob, knocker and
 * a glowing peephole, a worn stone step, a woven doormat, a mailbox on a post (flag down),
 * a terracotta pot of glowcaps and a lantern on an iron bracket.
 * Origin: bottom-center at the wall line (z=0 sits 0.1 behind the rock face).
 * Returns { obj, lights:[{x,y,z,...}], pot:{x,z} } in local units.
 */
export function homeEntrance(seed = 7) {
  const W = 88, H = 80, D = 40, cx = 44;
  const g = new VoxelGrid(W, H, D);
  const glass = new VoxelGrid(W, H, D);
  const r = 20, base = 28, R = r + 8, Z0 = 3, ZF = 11;
  const st = stone(0x8e847a, { seed: seed + 3 });
  // jambs: coursed quoins (long/short), arch: 11 wedge voussoirs with mortar seams + keystone
  const NV = 11, kIdx = (NV - 1) / 2;
  for (let y = 0; y < base + R + 3; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - base;
    const ad = Math.abs(dx);
    let inStone = false, tint = 1, seam = false, zf = ZF;
    if (y < base) {
      const course = Math.floor(y / 7), long = (course + (dx < 0 ? 0 : 1)) % 2 === 0;
      if (ad > r && ad <= r + (long ? 8 : 6)) {
        inStone = true;
        seam = y % 7 === 0 || (ad > r + 5.5 && !long && false);
        tint = 0.9 + hash2(course, dx < 0 ? 1 : 2, seed) * 0.16;
        zf = ZF - (long ? 0 : 1);
      }
    } else {
      const d = Math.hypot(dx, dy);
      if (d > r && d <= R) {
        const a = Math.atan2(dy, dx); // 0..pi
        const f = (a / Math.PI) * NV;
        const blk = Math.min(NV - 1, Math.floor(f));
        const key = blk === kIdx;
        inStone = true;
        seam = Math.abs(f - Math.round(f)) * (d / R) < 0.07 && f > 0.3 && f < NV - 0.3;
        tint = key ? 1.08 : 0.88 + hash2(blk, 3, seed) * 0.18;
        zf = key ? ZF + 2 : ZF;
      } else if (Math.abs(dx) < 4.5 && d > R && d <= R + 3 && dy > 0) {
        // the keystone stands proud of the ring
        inStone = true; tint = 1.08; zf = ZF + 2;
      }
    }
    if (!inStone) continue;
    for (let z = Z0; z < zf; z++) {
      let c = seam ? 0x4a4038 : mulc(st(x, y, z), tint);
      // chipped arrises on the front edge
      if (z === zf - 1 && !seam && hash2(x, y, seed + 9) < 0.05) c = mulc(c, 0.8);
      g.set(x, y, z, c);
    }
  }
  // carved paw on the keystone
  for (const [px, py] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 2], [0, 3], [2, 2]]) g.set(cx + px, base + R - 1 + py, ZF + 2, 0x6a625a);
  // moss and a few grass tufts along the top of the arch, trailing roots off the sides
  for (let x = 0; x < W; x++) {
    let top = -1;
    for (let y = H - 1; y >= 0; y--) if (g.get(x, y, ZF - 1) >= 0 || g.get(x, y, ZF) >= 0) { top = y; break; }
    if (top < base) continue;
    for (let z = Z0; z < ZF + 2; z++) {
      if (g.get(x, top, z) < 0) continue;
      if (hash2(x, z, seed + 20) < 0.75) g.set(x, top + 1, z, hash2(x, z, seed + 21) < 0.5 ? C.moss : C.mossL);
      if (hash2(x, z, seed + 22) < 0.08) { g.set(x, top + 2, z, C.mossL); g.set(x, top + 3, z, 0x8aba54); }
    }
  }
  for (const [x0, len] of [[cx - R + 2, 9], [cx + R - 3, 6], [cx - 9, 4]]) {
    let yTop = base + R;
    for (let y = H - 1; y > 0; y--) if (g.get(x0, y, ZF - 1) >= 0) { yTop = y; break; }
    line(g, [[x0 + 0.5, yTop + 0.5, ZF + 0.5], [x0 + 1.5, yTop - len * 0.5, ZF + 1.5], [x0 + 0.5, yTop - len, ZF + 1]], 0.5, (xx, yy) => (yy % 3 ? 0x6a4a2a : 0x5a3e24));
  }
  // the door: vertical planks, dark reveal around the edge, two cross battens
  const plank = wood(0x6e8a5a, { axis: 'y', across: 'x', pw: 99, seed: seed + 4 });
  for (let y = 0; y < base + r; y++) for (let x = cx - r; x < cx + r; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - base;
    const d = y < base ? Math.abs(dx) : Math.hypot(dx, dy);
    if (d > r) continue;
    g.set(x, y, Z0, 0x1e1612);
    if (d > r - 1.2) { g.set(x, y, Z0 + 1, 0x2a1e16); continue; } // reveal
    const pl = Math.floor((x - (cx - r)) / 6);
    const seamX = (x - (cx - r)) % 6 === 0;
    let c = seamX ? 0x3e4a32 : mulc(plank(x, y, Z0 + 1), 0.92 + hash2(pl, 7, seed) * 0.14);
    if (!seamX && y < 2) c = mulc(c, 0.8); // weathered foot
    g.set(x, y, Z0 + 1, c);
    g.set(x, y, Z0 + 2, c);
  }
  for (const by of [7, 33]) for (let x = cx - r + 2; x < cx + r - 2; x++) {
    const dx = x + 0.5 - cx, dy = by + 0.5 - base;
    if (by >= base && Math.hypot(dx, dy) > r - 2) continue;
    g.set(x, by, Z0 + 3, 0x5a6e48); g.set(x, by + 1, Z0 + 3, 0x4e6040);
  }
  // strap hinges with rivets and curled ends
  for (const hy of [10, 30]) {
    for (let x = cx - r + 1; x < cx + 2; x++) { g.set(x, hy, Z0 + 4, C.iron); g.set(x, hy + 1, Z0 + 4, (x % 5 === 0) ? C.ironL : C.ironD); }
    for (const [dx, dy] of [[0, -1], [1, -1], [2, 0], [2, 1], [1, 2], [0, 2], [-1, 1]]) g.set(cx + 2 + dx, hy + dy, Z0 + 4, C.iron);
    g.box(cx - r - 1, hy - 1, Z0 + 3, 3, 4, 2, C.ironD); // pintle on the jamb
  }
  // knob with a backplate, a ring knocker, a brass house number plate
  g.box(cx + 12, 14, Z0 + 3, 3, 7, 1, 0x8a6a30);
  g.box(cx + 12, 17, Z0 + 4, 3, 3, 2, C.brass); g.set(cx + 13, 19, Z0 + 5, 0xffe8a0);
  for (const [dx, dy] of [[-1, 0], [1, 0], [-2, -1], [2, -1], [-2, -2], [2, -2], [-1, -3], [0, -3], [1, -3]]) g.set(cx + dx, 29 + dy, Z0 + 4, C.brass);
  g.box(cx - 1, 29, Z0 + 3, 3, 2, 2, 0x8a6a30);
  // peephole: a round iron-framed window, glowing from inside
  for (let y = 31; y < 46; y++) for (let x = cx - 7; x < cx + 8; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - 38.5);
    if (d <= 6.2 && d > 4.6) { g.set(x, y, Z0 + 3, C.iron); g.set(x, y, Z0 + 4, d > 5.6 ? C.ironD : C.ironL); }
    else if (d <= 4.6) {
      if (Math.abs(x + 0.5 - cx) < 0.6 || Math.abs(y + 0.5 - 38.5) < 0.6) g.set(x, y, Z0 + 3, C.ironD);
      else glass.set(x, y, Z0 + 2, y > 39 ? C.glowW : C.glowO);
    }
  }
  // worn stone step
  for (let x = cx - r - 4; x < cx + r + 4; x++) for (let z = Z0 + 2; z < 18; z++) {
    const worn = Math.abs(x + 0.5 - cx) < 12 && z > 8;
    const h = worn ? 3 : 4;
    for (let y = 0; y < h; y++) g.set(x, y, z, y === h - 1 ? mulc(0x8a827a, 0.92 + hash2(x >> 2, z >> 2, seed + 30) * 0.12) : 0x6a625c);
  }
  // woven doormat with a darker border and a fringe
  for (let x = cx - 15; x < cx + 15; x++) for (let z = 19; z < 31; z++) {
    const edge = x === cx - 15 || x === cx + 14 || z === 19 || z === 30;
    const band = Math.floor((z - 19) / 2) % 3;
    let c = edge ? 0x6a3a22 : [0xb0804a, 0x9a6a3a, 0xc8a060][band];
    if (!edge && (x + z) % 2) c = mulc(c, 0.9);
    if (!edge && Math.abs(z - 24.5) < 1 && Math.abs(x + 0.5 - cx) < 8) c = 0xd8c08a; // a pale stripe across the middle
    g.set(x, 0, z, c);
  }
  for (let z = 20; z < 30; z += 2) { g.set(cx - 16, 0, z, 0xc8a878); g.set(cx + 15, 0, z, 0xc8a878); }
  // mailbox on a post, flag down (no letters yet), a little paw sticker on the side
  const post = beam(C.woodD, 'y', seed + 40);
  g.box(7, 0, 22, 3, 30, 3, post);
  g.box(5, 29, 21, 7, 1, 5, C.woodD);
  const mc = 0xc0402a;
  for (let y = 30; y < 39; y++) for (let x = 3; x < 14; x++) for (let z = 17; z < 30; z++) {
    const dome = y >= 35 ? Math.hypot(x + 0.5 - 8.5, (y + 0.5 - 35) * 1.25) <= 5.5 : true;
    if (!dome) continue;
    let c = mc;
    if (z === 29) c = (y === 30 || x === 3 || x === 13) ? mulc(mc, 0.72) : mulc(mc, 1.05);
    else if (y >= 37) c = mulc(mc, 1.1);
    g.set(x, y, z, c);
  }
  g.box(6, 35, 30, 5, 1, 1, 0x1a1214); // slot
  g.box(8, 32, 30, 1, 1, 1, C.brass);
  for (const [dz, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 2], [2, 2], [0, 3], [1, 3]]) if (dz >= 0 || dy > 1) g.set(14, 32 + dy, 21 + dz, 0xf6f0e0);
  g.box(14, 33, 25, 1, 1, 7, C.iron); g.box(14, 32, 31, 1, 3, 2, 0xe03a2a); // flag, lowered
  // terracotta pot with glowcaps and a fern
  const pcx = 72, pcz = 22;
  for (let y = 0; y < 12; y++) for (let z = pcz - 7; z <= pcz + 7; z++) for (let x = pcx - 7; x <= pcx + 7; x++) {
    const rr = 4.6 + y * 0.18 + (y >= 10 ? 1 : 0);
    const d = Math.hypot(x + 0.5 - pcx, z + 0.5 - pcz);
    if (d > rr) continue;
    if (y === 11 && d < rr - 1.5) { g.set(x, y, z, hash2(x, z, seed + 50) < 0.3 ? 0x4a3422 : 0x3a2a1a); continue; }
    g.set(x, y, z, y >= 10 ? 0xc8704a : y === 4 ? 0xa85a38 : mulc(0xb8603a, 0.94 + hash2(x, y, seed + 51) * 0.1));
  }
  for (const [dx, dz, hgt, rr, col] of [[-1, -1, 9, 3.4, 0x6ac8ff], [2.5, 1.5, 6, 2.6, 0x9fe0ff], [-2.5, 2.5, 4, 2, 0x6ac8ff]]) {
    const sx = pcx + dx, sz = pcz + dz;
    g.box(Math.round(sx), 12, Math.round(sz), 1, hgt, 1, 0xe8dcc0);
    for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) {
      const d = Math.hypot(x, z);
      if (d > rr) continue;
      glass.set(Math.round(sx) + x, 12 + hgt, Math.round(sz) + z, (x + z) % 3 === 0 ? 0xd8faff : col);
      if (d < rr - 1) glass.set(Math.round(sx) + x, 13 + hgt, Math.round(sz) + z, col);
    }
  }
  for (let a = 0; a < 5; a++) {
    const ang = a * 1.25 + 0.4;
    line(g, [[pcx + 0.5, 12, pcz + 0.5], [pcx + 0.5 + Math.cos(ang) * 4, 16, pcz + 0.5 + Math.sin(ang) * 4], [pcx + 0.5 + Math.cos(ang) * 8, 14, pcz + 0.5 + Math.sin(ang) * 8]], 0.6, (xx, yy, zz, t) => (t > 0.6 ? 0x6ab84a : 0x4a8a3a));
  }
  // lantern on a curled iron bracket, to the right of the arch
  const lx = 79, ly = 44, lz = 14;
  g.box(lx - 2, 60, Z0, 5, 7, 2, C.iron);
  line(g, [[lx + 0.5, 64, Z0 + 1], [lx + 0.5, 64, lz + 0.5], [lx + 0.5, 61, lz + 2]], 0.7, C.iron);
  line(g, [[lx + 0.5, 61, Z0 + 1], [lx + 0.5, 63.5, Z0 + 6]], 0.5, C.iron);
  g.box(lx, 57, lz, 1, 4, 1, C.iron);
  g.box(lx - 4, 55, lz - 4, 9, 2, 9, C.iron); g.box(lx - 3, 57, lz - 3, 7, 1, 7, C.ironL);
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) g.box(lx + x, ly, lz + z, 1, 11, 1, C.iron);
  g.box(lx - 4, ly - 1, lz - 4, 9, 1, 9, C.iron); g.box(lx - 2, ly - 3, lz - 2, 5, 2, 5, C.ironD);
  glass.box(lx - 3, ly, lz - 3, 7, 11, 7, (x, y) => (y > ly + 6 ? C.glowW : C.glowO));
  glass.box(lx - 1, ly + 3, lz - 1, 3, 5, 3, C.glowY);
  const obj = group(M32(g, [cx, 0, 0]), G32(glass, [cx, 0, 0]));
  const u = (v) => v * S32;
  return {
    obj,
    lights: [
      { x: u(lx + 0.5 - cx), y: u(ly + 6), z: u(lz + 0.5), lantern: true },
      { x: 0, y: u(38), z: u(Z0 + 3), weak: true },
    ],
    pot: { x: u(pcx - cx), z: u(pcz) },
    mailbox: { x: u(8.5 - cx), z: u(23) },
  };
}

// Fixed dressing for the home burrow at 1/32 voxels: the round window into a glowing crystal
// pocket, tunnel mouths dug through the walls (a receding dark tube, rubble, a lantern on a
// hook), the timber portal of a tunnel through a front wall, the caved-in door to Deep Town,
// the heap under the hole the mole fell through, cobwebs, glowing bracket fungi, the low cut
// rims along the open front of the room and a few loose things (tools, broom, firewood).
// Wall-attached pieces use local axes: x along the wall, y up, z out of the wall into the room,
// with the origin on the wall face at floor level.
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, iron, stone, line, ring, sag, M32, G32, M16, G16, group, mulc, mixc, h3, sp3, S32, lowRes } from './kit.js';
import { hash2 } from './surface.js';
import { rubble } from './props.js';
import { makeRng } from '../core/util.js';

const v32 = (n) => n * S32;

// ---------------------------------------------------------------- crystal window
const CRYS = [[0x6ad8ff, 0xd8f8ff, 0x2a7ab0], [0xb07ae0, 0xe8c8ff, 0x6a3aa0], [0xff9ad0, 0xffe0f0, 0xb04a8a], [0x7bf08a, 0xd9ffd6, 0x2f9a52]];
/** Window radius and center height (1/32 voxels). The wall cuts the matching hole. */
export const WIN = { r: 13.5, cy: 43 };

/**
 * The round mole-sized window: a riveted wooden ring, a cross mullion, a sill with a candle and
 * a sprout, and behind the wall a small cave pocket full of glowing crystals.
 * `back` = wall thickness behind the face (voxels). Returns { obj, pocket, light }.
 */
export function crystalWindow(back = 12, seed = 3) {
  const { r, cy } = WIN;
  const R = r + 5;
  const g = new VoxelGrid(48, 80, 14);
  const gl = new VoxelGrid(48, 80, 14);
  const cx = 24, Z = 2; // grid z of the wall face
  const wd = 0x7a4e2c;
  for (let y = 0; y < 80; y++) for (let x = 0; x < 48; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > r && d <= R) {
      const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
      const seg = Math.floor((a + Math.PI) / (Math.PI / 6));
      const seam = Math.abs(((a + Math.PI) / (Math.PI / 6)) % 1) < 0.09;
      const c = seam ? mulc(wd, 0.6) : mulc(wd, 0.9 + hash2(seg, 1, seed) * 0.18);
      for (let z = Z - 2; z < Z + 3; z++) g.set(x, y, z, c);
      if (d > R - 1.2) g.set(x, y, Z + 3, mulc(wd, 0.75));
    }
  }
  // brass rivets around the ring
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    g.set(Math.floor(cx + Math.cos(a) * (r + 2.5)), Math.floor(cy + Math.sin(a) * (r + 2.5)), Z + 3, C.brass);
  }
  // cross mullion
  for (let k = -r; k <= r; k++) { g.set(Math.floor(cx + k), cy, Z, 0x5a3a22); g.set(cx, Math.floor(cy + k), Z, 0x5a3a22); }
  // sill: a board on two brackets, a candle stub, a sprout in a thimble pot
  g.box(cx - 16, cy - R - 4, Z, 32, 3, 9, wood(0x8a5a32, { axis: 'x', across: 'z', pw: 99, seed }));
  for (const bx of [cx - 12, cx + 11]) line(g, [[bx + 0.5, cy - R - 4, Z + 0.5], [bx + 0.5, cy - R - 10, Z + 0.5], [bx + 0.5, cy - R - 4, Z + 6.5]], 0.7, C.iron);
  const sy = cy - R - 1;
  ring(g, cx + 9, Z + 4.5, 0, 2.6, sy, sy + 1, 0xa8a8b0);
  g.box(cx + 8, sy + 1, Z + 4, 2, 5, 2, 0xf0e8d0);
  gl.set(cx + 8, sy + 6, Z + 4, 0xffd060); gl.set(cx + 8, sy + 7, Z + 4, 0xfff0a0);
  ring(g, cx - 9, Z + 4.5, 0, 2.6, sy, sy + 4, 0xb8603a);
  for (const [x, y, z, c] of [[cx - 9, sy + 4, Z + 4, 0x6ab84a], [cx - 10, sy + 5, Z + 4, 0x7ac85a], [cx - 8, sy + 5, Z + 5, 0x5aa84a], [cx - 9, sy + 6, Z + 4, 0x8ad86a]]) g.set(x, y, z, c);
  const obj = group(M32(g, [cx, 0, Z]), G32(gl, [cx, 0, Z]));

  // the pocket behind the wall (z < -back): kept shallow and low so it never shows over the wall top
  const PD = 22, rng = makeRng(seed);
  const p = new VoxelGrid(56, 64, PD + 2);
  const pg = new VoxelGrid(56, 64, PD + 2);
  const px = 28;
  // self-lit rock: violet-blue, brighter toward the glowing pool and the middle of the pocket
  const rock = (x, y, z) => {
    const glowK = 0.55 + 0.2 * Math.round(3 * Math.max(0, 1 - Math.hypot(x - 22, (y - 24) * 0.8, z - 14) / 30)); // stepped: big faces
    return mulc([0x4a4a82, 0x42427a, 0x52528e, 0x3a3a6a][Math.floor(h3(x >> 3, y >> 3, z >> 3, seed) * 4)], glowK);
  };
  // floor, back and sides of the pocket (grid z 0 = the far back)
  p.box(0, 14, 0, 56, 6, PD + 2, rock);
  p.box(0, 14, 0, 56, 50, 3, rock);
  p.box(0, 14, 0, 4, 50, PD + 2, rock);
  p.box(52, 14, 0, 4, 50, PD + 2, rock);
  // lumpy floor with a glowing pool and pebbles
  for (let z = 3; z < PD; z++) for (let x = 4; x < 52; x++) {
    if (h3(x >> 1, 0, z >> 1, seed + 1) < 0.25) p.set(x, 20, z, 0x5a5a92);
    if (Math.hypot(x + 0.5 - 20, (z + 0.5 - 12) * 1.4) < 7) { p.clear(x, 20, z); pg.set(x, 19, z, (x + z) % 5 ? 0x2a8ac0 : 0x6ad8ff); }
  }
  // crystal clusters from the floor and the back wall
  for (let k = 0; k < 9; k++) {
    const [c, hi] = CRYS[k % CRYS.length];
    const fromBack = k % 3 === 2;
    const x0 = 8 + rng() * 40, z0 = fromBack ? 3 : 4 + rng() * (PD - 8), y0 = fromBack ? 24 + rng() * 22 : 20;
    const h = fromBack ? 8 + rng() * 6 : 10 + rng() * 22, rr = 1.6 + rng() * 1.8;
    const lx = (rng() - 0.5) * 0.5, lz = fromBack ? 0.7 : (rng() - 0.5) * 0.4;
    for (let t = 0; t < h; t++) {
      const tip = t > h - rr * 1.6, w = tip ? rr * (h - t) / (rr * 1.6) : rr;
      const ox = x0 + lx * t, oy = fromBack ? y0 + (rng() - 0.5) * 0.2 : y0 + t, oz = z0 + (fromBack ? t * lz : lz * t);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > w) continue;
        pg.set(Math.round(ox + dx), Math.round(fromBack ? oy + dx * 0.2 : oy), Math.round(oz + dz), dx < 0 ? hi : c);
      }
    }
  }
  const pocket = group(G32(p, [px, 0, PD + 2]), G32(pg, [px, 0, PD + 2]));
  pocket.position.z = -back * S32;
  return { obj, pocket, light: { x: 0, y: v32(cy), z: 0.35 } };
}

// ---------------------------------------------------------------- tunnel mouths
/** Mouth size (1/32 voxels): half width, straight height, arch top. The wall cuts it with a ragged edge. */
export const MOUTH = { hw: 15, h0: 26, top: 42 };
export function inMouth(du, v, seed = 0) {
  const j = (hash2(Math.floor(du / 3), Math.floor(v / 3), seed + 7) - 0.5) * 2.4;
  const hw = MOUTH.hw + j;
  if (Math.abs(du) > hw) return false;
  if (v < MOUTH.h0) return true;
  const r = MOUTH.top - MOUTH.h0 + j * 0.6;
  return du * du + (v - MOUTH.h0) ** 2 <= r * r * (hw / MOUTH.hw);
}

/**
 * The dug tube behind a tunnel mouth (1/16 voxels), receding into the dark, with pick marks,
 * a pebbly floor and a root or two. Origin on the wall face at floor level; `back` = wall
 * thickness behind the face (1/32 voxels).
 */
export function tunnelTube(back = 12, seed = 1) {
  const W = 26, H = 26, L = 20;
  const g = new VoxelGrid(W, H, L);
  const cx = W / 2;
  const inside = (x, y) => {
    const du = (x + 0.5 - cx) * 2, v = y * 2;
    return Math.abs(du) <= MOUTH.hw + 2.5 && (v < MOUTH.h0 + 2 || du * du + (v - MOUTH.h0) ** 2 <= (MOUTH.top - MOUTH.h0 + 3) ** 2);
  };
  for (let z = 0; z < L; z++) {
    const k = 0.12 + 0.88 * (z / (L - 1)) ** 1.6; // far (z = 0) is nearly black
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (z > 0 && inside(x, y) && y > 0) continue;
      const pick = hash2(x, y + z * 31, seed) < 0.06;
      const base = y === 0 ? 0x5a4030 : [0x4a3424, 0x543c28, 0x3e2c1e][Math.floor(hash2(x >> 1, y >> 1, z + seed) * 3)];
      g.set(x, y, z, mulc(pick ? mulc(base, 0.7) : base, k));
    }
  }
  // pebbles on the floor and a root hanging from the roof of the tube
  for (let k = 0; k < 6; k++) {
    const x = Math.floor(cx - 5 + hash2(k, 1, seed) * 10), z = 4 + Math.floor(hash2(k, 2, seed) * (L - 5));
    g.set(x, 1, z, mulc(0x8a8078, 0.25 + 0.75 * z / L));
  }
  const rz = L - 6;
  for (let y = 17; y > 10; y--) g.set(Math.floor(cx + Math.sin(y) * 0.6), y, rz, mulc(0x6a4a2e, 0.8));
  // unlit: the dark must stay dark even next to the lantern (lit meshes get the lights baked in)
  const m = G16(g, [cx, 0, L], { outline: false });
  m.position.z = -back * S32;
  return m;
}

/** Rubble heaped either side of a mouth (local, on the floor in front of the wall). */
export function mouthRubble(seed = 1) {
  const a = lowRes(() => rubble(seed, 0.45, 0.32));
  const b = lowRes(() => rubble(seed + 5, 0.38, 0.28));
  a.obj.position.set(-0.62, 0, 0.16);
  b.obj.position.set(0.6, 0, 0.13);
  a.obj.scale.set(1, 0.8, 1);
  b.obj.scale.set(1, 0.7, 1);
  return group(a.obj, b.obj);
}

/** An iron hook driven into the wall with a small lantern (local; returns {obj, light}). */
export function lanternHook(seed = 1) {
  const g = new VoxelGrid(12, 34, 16);
  const gl = new VoxelGrid(12, 34, 16);
  const ir = iron(0x2e2e36, seed);
  g.box(4, 26, 0, 4, 4, 2, ir);
  line(g, [[6, 28, 1], [6, 28, 9], [6, 25, 10]], 0.6, ir);
  g.box(6, 22, 9, 1, 3, 1, ir);
  g.box(3, 20, 6, 7, 2, 7, ir); g.box(4, 22, 7, 5, 1, 5, C.ironL);
  for (const [x, z] of [[3, 6], [9, 6], [3, 12], [9, 12]]) g.box(x, 10, z, 1, 10, 1, ir);
  g.box(3, 9, 6, 7, 1, 7, ir); g.box(5, 7, 8, 3, 2, 3, C.ironD);
  gl.box(4, 10, 7, 5, 10, 5, (x, y) => (y > 15 ? C.glowW : C.glowO));
  gl.box(5, 12, 8, 3, 4, 3, C.glowY);
  return { obj: group(M32(g, [6, 0, 0]), G32(gl, [6, 0, 0])), light: { x: 0, y: v32(15), z: v32(9.5) } };
}

/**
 * A tunnel through an open (cut-away) front wall: a timber portal on the rim line with a hanging
 * lantern, rubble at its feet and a dark ramp running down under the edge of the floor.
 * Local: x along the rim, z out of the room (away from it), origin on the room's edge.
 */
export function portal(seed = 1) {
  const OY = 24; // grid rows below the floor (the ramp runs down out of the room)
  const g = new VoxelGrid(52, 52 + OY, 34);
  const gl = new VoxelGrid(52, 52 + OY, 34);
  const cx = 26;
  const post = beam(0x6a4428, 'y', seed);
  for (const x of [cx - 19, cx + 15]) g.box(x, OY - 6, 4, 4, 50, 4, post);
  g.box(cx - 22, OY + 44, 3, 44, 5, 6, beam(0x5a3a22, 'x', seed + 1));
  for (const x of [cx - 21, cx + 17]) g.box(x, OY + 41, 4, 4, 3, 4, C.iron);
  // lantern hanging from the lintel
  g.box(cx, OY + 38, 6, 1, 6, 1, C.iron);
  g.box(cx - 3, OY + 36, 4, 7, 2, 5, C.iron);
  for (const [x, z] of [[cx - 3, 4], [cx + 3, 4], [cx - 3, 8], [cx + 3, 8]]) g.box(x, OY + 27, z, 1, 9, 1, C.iron);
  g.box(cx - 3, OY + 26, 4, 7, 1, 5, C.iron);
  gl.box(cx - 2, OY + 27, 5, 5, 9, 3, (x, y) => (y > OY + 31 ? C.glowW : C.glowO));
  // the ramp: dark earth stepping down and away into the dark, with low side banks
  for (let z = 0; z < 20; z++) {
    const k = Math.max(0.05, 1 - z / 16);
    const y = OY - 1 - Math.floor(z * 0.9);
    if (y < 1) break;
    for (let x = cx - 18; x < cx + 18; x++) {
      const bank = x < cx - 14 || x >= cx + 14;
      const h = bank ? 6 : 1;
      for (let dy = 0; dy < h; dy++) g.set(x, y + dy, z, mulc(bank ? 0x3a281a : z % 5 === 0 ? 0x3a281a : 0x4a3424, k));
    }
  }
  const m = group(M32(g, [cx, OY, 0]), G32(gl, [cx, OY, 0]));
  const r = mouthRubble(seed);
  r.position.z = -0.2;
  m.add(r);
  return { obj: m, light: { x: 0, y: v32(31), z: v32(6.5) } };
}

// ---------------------------------------------------------------- the caved-in door
/** Rubble choking the door to Deep Town, a broken plank across it and dirt spilling onto the floor (local to the W wall). */
export function cavedDoor(seed = 4) {
  const grp = new THREE.Group();
  const a = lowRes(() => rubble(seed, 1.35, 0.7));
  a.obj.scale.set(1, 1.9, 1);
  a.obj.position.set(0, 0, 0.3);
  const b = lowRes(() => rubble(seed + 3, 0.9, 0.5));
  b.obj.scale.set(1, 2.6, 1);
  b.obj.position.set(0.15, 0, 0.12);
  grp.add(a.obj, b.obj);
  const g = new VoxelGrid(56, 60, 24);
  // two splintered planks across the arch, a sign scratched "CAVED IN"
  line(g, [[3, 18, 6], [52, 38, 8]], 1.6, (x, y, z) => mulc(0x7a5032, sp3(x, y, z, 2, 0.1, 0.12)));
  line(g, [[6, 44, 7], [48, 30, 9]], 1.4, (x, y, z) => mulc(0x6a4428, sp3(x, y, z, 3, 0.1, 0.12)));
  for (const [x, y] of [[5, 19], [50, 37], [8, 43], [46, 31]]) g.set(x, y, 10, C.ironL);
  // dirt fanning out across the floor
  for (let z = 6; z < 24; z++) for (let x = 2; x < 54; x++) {
    const d = Math.hypot((x - 28) / 26, (z - 6) / 18);
    if (d < 1 && hash2(x >> 1, z >> 1, seed) < 1.1 - d) g.set(x, 0, z, [0x5a3e2a, 0x4e3624, 0x684a32][Math.floor(hash2(x, z, seed) * 3)]);
  }
  grp.add(M32(g, [28, 0, 0]));
  return grp;
}

// ---------------------------------------------------------------- under the hole
/**
 * What came down with the mole: a heap of loose earth and clods, snapped ceiling boards with
 * nails, roots, a few green leaves and a petal from the surface. Floor-standing, centered.
 */
export function holeHeap(seed = 11) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(64, 14, 56);
  for (let z = 0; z < 56; z++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot((x + 0.5 - 32) / 30, (z + 0.5 - 28) / 25);
    if (d >= 1) continue;
    const h = Math.round((1 - d * d) * 6 + (hash2(x >> 2, z >> 2, seed) - 0.5) * 2);
    for (let y = 0; y < h; y++) g.set(x, y, z, [0x6a4a32, 0x5a3e2a, 0x7a5a3a, 0x4e3624][Math.floor(hash2(x >> 1, (z >> 1) + y * 17, seed) * 4)]);
  }
  for (let k = 0; k < 9; k++) g.ellipsoid(8 + rng() * 48, 4 + rng() * 3, 8 + rng() * 40, 1.6 + rng() * 2, 1.4, 1.6 + rng() * 2, [0x7a6e64, 0x5a3e2a, 0x8a8078][k % 3]);
  // snapped boards
  for (let k = 0; k < 3; k++) {
    const x0 = 10 + rng() * 40, z0 = 10 + rng() * 34, a = rng() * Math.PI, L = 18 + rng() * 14;
    const x1 = x0 + Math.cos(a) * L, z1 = z0 + Math.sin(a) * L;
    line(g, [[x0, 5 + k, z0], [x1, 2 + rng() * 6, z1]], 1.3, (x, y, z) => mulc(0x8a5a32, sp3(x, y, z, k, 0.12, 0.14)));
    g.set(Math.round(x1), Math.round(4 + k), Math.round(z1), 0xc8c8d0);
  }
  // a root torn from the ceiling and a few leaves from the surface
  line(g, [[12, 6, 44], [22, 9, 40], [30, 7, 46], [36, 10, 50]], 0.8, 0x6a4a2e);
  for (let k = 0; k < 7; k++) {
    const x = Math.round(6 + rng() * 52), z = Math.round(6 + rng() * 44), y = 6 + Math.round(rng() * 3);
    const c = k === 6 ? 0xf0a0c0 : k % 2 ? 0x6ab84a : 0x8ad86a;
    g.set(x, y, z, c); g.set(x + 1, y, z, c); g.set(x, y, z + 1, mulc(c, 0.85));
  }
  return M32(g, [32, 0, 28]);
}

// ---------------------------------------------------------------- small wall things
/** A dusty cobweb in a top corner, drawn flat on a wall face (local; origin at the corner top). */
export function cobweb(size = 22, seed = 1, mirror = false) {
  const g = new VoxelGrid(size + 2, size + 2, 2);
  const col = (k) => (k % 2 ? 0xd8d4cc : 0xb8b4ac);
  const put = (x, y, c) => g.set(mirror ? size - x : x, size - y, 1, c);
  for (let a = 0; a < 5; a++) {
    const ang = (a / 4) * (Math.PI / 2);
    for (let t = 0; t < size; t++) put(Math.round(Math.cos(ang) * t), Math.round(Math.sin(ang) * t), col(t));
  }
  for (const rr of [size * 0.35, size * 0.62, size * 0.9]) {
    for (let k = 0; k <= 40; k++) {
      const ang = (k / 40) * (Math.PI / 2);
      const sagK = 1 - Math.sin((k % 10) / 10 * Math.PI) * 0.12;
      put(Math.round(Math.cos(ang) * rr * sagK), Math.round(Math.sin(ang) * rr * sagK), col(k + seed));
    }
  }
  return M32(g, [mirror ? size + 1 : 0, size + 1, 1], { outline: false });
}

/** A stack of glowing bracket fungi growing out of a wall (local). Returns {obj, color}. */
export function bracketFungi(seed = 1, n = 3, hue = 0) {
  const pal = [[0x6ad8ff, 0xc8f4ff, 0x2a6a8a], [0x9aff7a, 0xe0ffd0, 0x3a7a3a], [0xffb86a, 0xfff0c0, 0x8a5a2a]][hue % 3];
  const g = new VoxelGrid(30, 40, 12);
  const gl = new VoxelGrid(30, 40, 12);
  for (let k = 0; k < n; k++) {
    const cx = 15 + (hash2(k, 1, seed) - 0.5) * 12, cy = 6 + k * 11 + hash2(k, 2, seed) * 3;
    const r = 4.5 + hash2(k, 3, seed) * 3.5;
    for (let z = 0; z < 10; z++) for (let x = 0; x < 30; x++) {
      const d = Math.hypot((x + 0.5 - cx) / r, z / (r * 0.8));
      if (d > 1) continue;
      gl.set(x, Math.round(cy), z, d > 0.82 ? pal[1] : (x + z) % 4 === 0 ? pal[1] : pal[0]);
      if (d < 0.7) gl.set(x, Math.round(cy) + 1, z, d > 0.5 ? pal[0] : pal[1]); // a domed cap
      g.set(x, Math.round(cy) - 1, z, d > 0.7 ? pal[2] : mulc(pal[2], 0.8));
    }
  }
  return { obj: group(M32(g, [15, 0, 0]), G32(gl, [15, 0, 0])), color: pal[0] };
}

// ---------------------------------------------------------------- loose things (stand on a floor tile)
/** A pickaxe and a shovel leaning on the wall (local: wall at z = 0, tile in front). */
export function toolsLeaning(seed = 1) {
  const g = new VoxelGrid(32, 44, 20);
  const handle = (x, y, z) => mulc(0x9a6a3a, sp3(x, y, z, seed, 0.1, 0.12));
  // shovel
  line(g, [[9, 2, 12], [7, 38, 2]], 0.9, handle);
  g.box(5, 38, 1, 5, 2, 2, 0x6a4428);
  for (let y = 0; y < 10; y++) for (let x = -3; x <= 3; x++) if (Math.abs(x) < 3.5 - (y < 3 ? (3 - y) * 0.6 : 0)) g.set(9 + x, 1 + y, 12 + Math.round(y * -0.25), y > 7 ? 0x6a6a74 : 0x8a8a94);
  // pickaxe
  line(g, [[22, 1, 12], [24, 33, 3]], 0.9, handle);
  line(g, [[16, 32, 4], [24, 35, 3], [31, 31, 5]], 1.1, (x, y) => (y > 34 ? 0xa8a8b4 : 0x7a7a86));
  return M32(g, [16, 0, 0]);
}

/** A twig broom leaning in a corner (local). */
export function broom(seed = 2) {
  const g = new VoxelGrid(16, 50, 16);
  line(g, [[8, 12, 10], [9, 48, 2]], 0.8, (x, y, z) => mulc(0x8a5a32, sp3(x, y, z, seed)));
  for (let y = 0; y < 13; y++) for (let x = 0; x < 16; x++) for (let z = 6; z < 16; z++) {
    const w = 2 + (12 - y) * 0.45;
    if (Math.abs(x + 0.5 - 8) < w && Math.abs(z + 0.5 - 11) < 2 && hash2(x, y * 13 + z, seed) < 0.72) g.set(x, y, z, hash2(z, x + y, seed) < 0.5 ? 0xc8a050 : 0xa8803a);
  }
  ring(g, 8, 11, 0, 2.6, 11, 13, 0xc94a3a);
  return M32(g, [8, 0, 0]);
}

/** A neat bundle of firewood tied with twine (floor, centered). */
export function firewood(seed = 3) {
  const g = new VoxelGrid(30, 20, 22);
  for (let k = 0; k < 9; k++) {
    const row = k < 4 ? 0 : k < 7 ? 1 : 2;
    const x = 4 + (k - (row === 0 ? 0 : row === 1 ? 4 : 7)) * 7 + row * 3.5, y = 3 + row * 6;
    for (let z = 2; z < 20; z++) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy > 9.5) continue;
      const end = z === 19 || z === 2;
      g.set(Math.round(x + dx), Math.round(y + dy), z, end ? (dx * dx + dy * dy < 4 ? 0xd8b080 : 0xb8885a) : mulc(0x5a3a22, 0.9 + hash2(k, z >> 2, seed) * 0.2));
    }
  }
  for (const z of [6, 15]) for (let x = 0; x < 30; x++) for (let y = 0; y < 20; y++) if (g.get(x, y, z) >= 0 && (g.get(x, y + 1, z) < 0 || g.get(x + 1, y, z) < 0)) g.set(x, y, z, 0xc8b890);
  return M32(g, [15, 0, 11]);
}

/** A crate of the last owner's letters and a stack of old books (floor, centered). */
export function letterCrate(seed = 5) {
  const g = new VoxelGrid(30, 26, 26);
  const wd = wood(0x8a5a32, { axis: 'x', across: 'y', pw: 6, seed });
  g.box(1, 0, 1, 20, 12, 18, wd);
  for (let z = 3; z < 17; z++) for (let y = 2; y < 12; y++) for (let x = 3; x < 19; x++) g.clear(x, y, z);
  for (let x = 3; x < 19; x++) for (let z = 3; z < 17; z++) if (hash2(x >> 1, z >> 1, seed) < 0.8) g.set(x, 10 + (hash2(x, z, seed) < 0.3 ? 1 : 0), z, hash2(x >> 2, z >> 2, seed + 1) < 0.5 ? 0xf0e8d0 : 0xe0d4b8);
  g.box(6, 11, 8, 6, 1, 4, 0xc94a3a);
  for (let b = 0; b < 4; b++) g.box(22, b * 3, 4 + (b % 2), 7, 3, 9 - (b % 2) * 2, [0x8a3a2a, 0x3a5a8a, 0x5a8a3a, 0xe0b040][b]);
  return M32(g, [15, 0, 13]);
}

// ---------------------------------------------------------------- the open front of the room
/**
 * The low cut-away rim along a front edge (len tiles), built along local x with its outer face
 * toward +z: packed earth in layers with stones, capped by a timber sill. gaps: [[t0, t1], ...]
 * in tiles where tunnels pass. Origin at the room edge, floor level.
 */
export function frontRim(len, gaps = [], seed = 1, endPost = true) {
  const RW = 10, RH = 11;
  const U = Math.round(len * 32) + (endPost ? RW : 0);
  const g = new VoxelGrid(U, RH + 9, RW);
  const st = stone(0x7a7068, { seed: seed + 2 });
  for (let x = 0; x < U; x++) {
    const t = x / 32;
    if (gaps.some(([a, b]) => t >= a && t < b)) continue;
    for (let y = 0; y < RH; y++) for (let z = 0; z < RW; z++) {
      let c;
      if (y >= RH - 3) c = mulc(0x6a4428, (y === RH - 1 ? 1.08 : 0.92) * (0.94 + Math.floor(hash2(Math.floor(x / 37), 1, seed) * 3) * 0.04) * sp3(x, y, z, seed, 0.06, 0.1));
      else {
        const strata = Math.floor((y + Math.sin(x * 0.11 + seed) * 1.5) / 3);
        c = [0x5a3e2a, 0x4e3624, 0x684a32][strata % 3];
        if (hash2(x >> 2, y >> 1, seed) < 0.06) c = st(x, y, z);
      }
      g.set(x, y, z, c);
    }
  }
  if (endPost) g.box(U - RW, 0, 0, RW, RH + 9, RW, (x, y, z) => (y >= RH + 7 ? 0x8a8078 : st(x, y, z)));
  return M32(g, [0, 0, 0]);
}

/** The last owner's oval braided rag rug, faded and a little frayed (floor, centered; w × d tiles). */
export function ragRug(w = 2.4, d = 1.6, seed = 6) {
  const W = Math.round(w * 32), D = Math.round(d * 32);
  const g = new VoxelGrid(W, 2, D);
  const cols = [0xb85a4a, 0xd8b070, 0x6a8a9a, 0x9a6a8a, 0xc88a4a, 0x7a9a5a];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const nx = (x + 0.5 - W / 2) / (W / 2), nz = (z + 0.5 - D / 2) / (D / 2);
    const r = Math.hypot(nx, nz);
    if (r > 1) continue;
    const ring = Math.floor(r * 9);
    const ang = Math.atan2(nz, nx);
    const twist = Math.floor((ang * 9 + ring * 2) * 1.5) % 2; // the braid's plaits
    let c = cols[(ring + seed) % cols.length];
    if (twist) c = mulc(c, 0.84);
    c = mixc(c, 0x9a8a74, 0.28); // faded
    if (hash2(x >> 1, z >> 1, seed) < 0.05) c = mulc(c, 0.85);
    if (r > 0.97 && hash2(x, z, seed + 1) < 0.5) continue; // frayed edge
    g.set(x, 0, z, c);
    if (r < 0.97 && (ring % 2 === 0) && twist === 0) g.set(x, 1, z, mulc(c, 1.04));
  }
  return M32(g, [W / 2, 0, D / 2]);
}

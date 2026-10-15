// Fixed pieces of the first-person burrow at 1/32-tile voxels (1/64 m): the round door to Deep Town
// (glowing when the way is open, choked with rubble until then), the crystal window with its
// glowing pocket behind the wall, tunnel mouths with timber frames and dark sloping tubes, corner
// posts, the build bench with its pegboard of tools, and the shaft above the hole in the roof.
// Wall-attached pieces use local axes: x along the wall, y up, z out of the wall into the room,
// origin on the wall face at floor level. Everything is in tile units (the room group is scaled).
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, iron, stone, line, ring, M32, G32, G16, group, mulc, mixc, h3, sp3, S32, lowRes } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';
import { rubble } from '../iso/props.js';
import { makeRng } from '../core/util.js';
import { T, MOUTH_HW, MOUTH_H, DOOR_HW, DOOR_H, FACE } from './units.js';

const V = 32 / T; // voxels per meter (1/32 tile)

// ---------------------------------------------------------------- shapes cut through the walls
/** Door opening (voxels, du from the centre, v up). */
export function inDoor(du, v) {
  const hw = DOOR_HW * V, top = DOOR_H * V, base = top - hw;
  if (Math.abs(du) > hw) return false;
  if (v < base) return true;
  return du * du + (v - base) ** 2 <= hw * hw;
}
/** Tunnel mouth (voxels), ragged. */
export function inMouth(du, v, seed = 0) {
  const j = (hash2(Math.floor(du / 3), Math.floor(v / 3), seed + 7) - 0.5) * 2.6;
  const hw = MOUTH_HW * V + j, top = MOUTH_H * V + j * 0.6, base = top - hw * 0.9;
  if (Math.abs(du) > hw || v < 0) return false;
  if (v < base) return true;
  return (du / hw) ** 2 + ((v - base) / (top - base)) ** 2 <= 1;
}
/** Round window (voxels). */
export const WINDOW = { r: 17, cy: 66 };

// ---------------------------------------------------------------- the door to Deep Town
/**
 * The round-topped door in a stone arch. open: the way to town is dug (warm light in its little
 * window); otherwise the arch is cracked, the leaf dark and rubble chokes it. Returns
 * { frame, leaf, hinge } — the leaf is separate so it can swing open.
 */
export function townDoor(open, seed = 4) {
  const hw = Math.round(DOOR_HW * V), top = Math.round(DOOR_H * V), base = top - hw;
  const R = hw + 7, GW = R * 2 + 2, GH = top + 9, Z = 6; // grid z of the wall face
  const g = new VoxelGrid(GW, GH, Z + 8);
  const cx = GW / 2;
  const st = stone(0x7a7470, { seed });
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const dx = x + 0.5 - cx;
    const outer = y < base ? Math.abs(dx) <= R : dx * dx + (y - base) ** 2 <= R * R;
    const inner = inDoor(dx, y);
    if (!outer || inner) continue;
    const a = Math.atan2(y - base, dx);
    const seam = y >= base ? Math.abs(((a / Math.PI) * 11) % 1) < 0.12 : (y % 12 === 0 || (Math.floor(y / 12) % 2 ? Math.abs(dx) > R - 0.5 : false));
    if (!open && y > base && hash2(x >> 2, y >> 2, 5) < 0.16) continue; // the cave-in cracked the arch
    const key = y >= base && Math.abs(dx) < 3 && y > top - 1;
    for (let z = Z - 3; z < Z + (key ? 7 : 5); z++) g.set(x, y, z, seam ? 0x4a4038 : open ? st(x, y, z) : mulc(st(x, y, z), 0.8));
  }
  // threshold step
  g.box(Math.round(cx - hw - 3), 0, Z - 3, hw * 2 + 6, 3, 12, st);
  const frame = M32(g, [cx, 0, Z]);
  // the leaf: planks with iron straps, a brass knob and a round window
  const L = new VoxelGrid(hw * 2, top, 4);
  const Lg = new VoxelGrid(hw * 2, top, 4);
  const wd0 = 0x8a5a32;
  for (let y = 0; y < top; y++) for (let x = 0; x < hw * 2; x++) {
    if (!inDoor(x + 0.5 - hw, y)) continue;
    const pl = Math.floor(x / 8);
    let c = x % 8 === 0 ? mulc(wd0, 0.66) : mulc(wd0, (0.88 + Math.floor(hash2(pl, 3, 7) * 3) * 0.07) * sp3(x, y, 0, 9, 0.08, 0.1));
    if (!open) c = mulc(c, 0.72);
    L.box(x, y, 0, 1, 1, 3, c);
  }
  for (const y of [12, 44]) for (let x = 2; x < hw * 2 - 2; x++) { L.set(x, y, 3, C.iron); L.set(x, y + 1, 3, x % 5 === 0 ? C.ironL : C.iron); }
  L.box(hw * 2 - 9, 33, 3, 3, 3, 1, C.brass);
  L.set(hw * 2 - 8, 34, 3, 0xffe08a);
  const wy = base + 4;
  L.ellipsoid(hw, wy, 2, 7, 7, 2, 0x3a2a1a);
  if (open) Lg.ellipsoid(hw, wy, 2.5, 5.2, 5.2, 1.2, (x, y) => (Math.abs(x + 0.5 - hw) < 0.8 || Math.abs(y + 0.5 - wy) < 0.8 ? -1 : y > wy ? 0xffe0a0 : 0xffc060));
  else L.ellipsoid(hw, wy, 2.5, 5.2, 5.2, 1.2, 0x1a1210);
  for (let k = -5; k <= 5; k++) { L.set(hw, wy + k, 3, 0x6a4a2a); L.set(hw + k, wy, 3, 0x6a4a2a); }
  const leaf = group(M32(L, [0, 0, 0]), G32(Lg, [0, 0, 0]));
  const hinge = new THREE.Group();
  hinge.add(leaf);
  hinge.position.set(-hw * S32, 0, -4 * S32); // recessed into the opening, hinged on its left
  return { frame, hinge, leaf };
}

/** Rubble choking the door, splintered planks across it and dirt fanning over the floor. */
export function doorRubble(seed = 4) {
  const grp = new THREE.Group();
  const a = lowRes(() => rubble(seed, 1.7, 0.9));
  a.obj.scale.set(1, 2.6, 1);
  a.obj.position.set(0, 0, 0.32);
  const b = lowRes(() => rubble(seed + 3, 1.1, 0.6));
  b.obj.scale.set(1, 3.6, 1);
  b.obj.position.set(0.12, 0, 0.1);
  const c = lowRes(() => rubble(seed + 7, 0.8, 0.5));
  c.obj.scale.set(1, 1.5, 1);
  c.obj.position.set(-0.45, 0, 0.55);
  grp.add(a.obj, b.obj, c.obj);
  const g = new VoxelGrid(70, 84, 30);
  line(g, [[4, 24, 8], [66, 50, 10]], 1.8, (x, y, z) => mulc(0x7a5032, sp3(x, y, z, 2, 0.1, 0.12)));
  line(g, [[7, 60, 9], [62, 40, 11]], 1.6, (x, y, z) => mulc(0x6a4428, sp3(x, y, z, 3, 0.1, 0.12)));
  for (const [x, y] of [[6, 25], [64, 49], [9, 59], [60, 41]]) g.set(x, y, 12, C.ironL);
  // "CAVED IN" scratched on the lower plank in chalky strokes
  for (let k = 0; k < 18; k++) g.set(18 + k * 2, 31 + Math.round(k * 0.42), 12, k % 3 ? 0xd8d0c0 : 0xb8b0a0);
  for (let z = 8; z < 30; z++) for (let x = 2; x < 68; x++) {
    const d = Math.hypot((x - 35) / 33, (z - 8) / 22);
    if (d < 1 && hash2(x >> 1, z >> 1, seed) < 1.1 - d) g.set(x, 0, z, [0x5a3e2a, 0x4e3624, 0x684a32][Math.floor(hash2(x, z, seed) * 3)]);
  }
  grp.add(M32(g, [35, 0, 0]));
  return grp;
}

// ---------------------------------------------------------------- the crystal window
const CRYS = [[0x6ad8ff, 0xd8f8ff], [0xb07ae0, 0xe8c8ff], [0xff9ad0, 0xffe0f0], [0x7bf08a, 0xd9ffd6]];
/**
 * The round window: a riveted wooden ring, cross mullion, a sill with a candle and a sprout, and
 * behind the wall a deep glowing crystal pocket you can look into from any angle.
 * Returns { obj, pocket }.
 */
export function crystalWindow(seed = 3) {
  const { r, cy } = WINDOW;
  const R = r + 6;
  const GW = R * 2 + 4, Z = 3;
  const g = new VoxelGrid(GW, cy + R + 4, Z + 12);
  const gl = new VoxelGrid(GW, cy + R + 4, Z + 12);
  const cx = GW / 2;
  const wd = 0x7a4e2c;
  for (let y = 0; y < cy + R + 4; y++) for (let x = 0; x < GW; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > r && d <= R) {
      const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
      const seg = Math.floor((a + Math.PI) / (Math.PI / 6));
      const seam = Math.abs(((a + Math.PI) / (Math.PI / 6)) % 1) < 0.09;
      const c = seam ? mulc(wd, 0.6) : mulc(wd, 0.9 + hash2(seg, 1, seed) * 0.18);
      for (let z = 0; z < Z + 3; z++) g.set(x, y, z, z < Z - 1 && d < r + 2 ? mulc(c, 0.7) : c); // the ring lines the hole too
      if (d > R - 1.2) g.set(x, y, Z + 3, mulc(wd, 0.75));
    }
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.set(Math.floor(cx + Math.cos(a) * (r + 3)), Math.floor(cy + Math.sin(a) * (r + 3)), Z + 3, C.brass);
  }
  for (let k = -r; k <= r; k++) { g.set(Math.floor(cx + k), cy, 1, 0x5a3a22); g.set(Math.floor(cx + k), cy - 1, 1, 0x4a2e1a); g.set(cx, Math.floor(cy + k), 1, 0x5a3a22); g.set(cx - 1, Math.floor(cy + k), 1, 0x4a2e1a); }
  // sill on two brackets, a candle stub and a sprout in a thimble pot
  const sy = cy - R - 4;
  g.box(Math.round(cx - 19), sy, Z, 38, 3, 11, wood(0x8a5a32, { axis: 'x', across: 'z', pw: 99, seed }));
  for (const bx of [cx - 14, cx + 13]) line(g, [[bx + 0.5, sy, Z + 0.5], [bx + 0.5, sy - 7, Z + 0.5], [bx + 0.5, sy, Z + 8.5]], 0.7, C.iron);
  ring(g, cx + 10, Z + 6, 0, 2.6, sy + 3, sy + 4, 0xa8a8b0);
  g.box(cx + 9, sy + 4, Z + 5, 2, 6, 2, 0xf0e8d0);
  gl.set(cx + 9, sy + 10, Z + 5, 0xffd060); gl.set(cx + 9, sy + 11, Z + 5, 0xfff0a0);
  ring(g, cx - 10, Z + 6, 0, 2.8, sy + 3, sy + 7, 0xb8603a);
  for (const [x, y, z, c] of [[cx - 10, sy + 7, Z + 5, 0x6ab84a], [cx - 11, sy + 8, Z + 5, 0x7ac85a], [cx - 9, sy + 8, Z + 6, 0x5aa84a], [cx - 10, sy + 9, Z + 5, 0x8ad86a], [cx - 11, sy + 10, Z + 6, 0x6ab84a]]) g.set(x, y, z, c);
  const obj = group(M32(g, [cx, 0, Z]), G32(gl, [cx, 0, Z]));

  // the pocket behind the wall: self-lit violet rock, a glowing pool, crystal clusters
  const PW = 80, PH = 84, PD = 56, y0 = cy - 44;
  const p = new VoxelGrid(PW, PH, PD);
  const pg = new VoxelGrid(PW, PH, PD);
  const rng = makeRng(seed);
  const rock = (x, y, z) => {
    const k = 0.5 + 0.22 * Math.round(3 * Math.max(0, 1 - Math.hypot(x - PW * 0.45, (y - 26) * 0.8, z - PD * 0.5) / 44));
    return mulc([0x4a4a82, 0x42427a, 0x52528e, 0x3a3a6a][Math.floor(h3(x >> 3, y >> 3, z >> 3, seed) * 4)], k);
  };
  const inside = (x, y, z) => {
    const nx = (x + 0.5 - PW / 2) / (PW / 2 - 3), ny = (y + 0.5 - PH * 0.52) / (PH * 0.48 - 3), nz = (z + 0.5 - PD * 0.55) / (PD * 0.55 - 2);
    return nx * nx + ny * ny * 1.1 + nz * nz * 0.8 + (h3(x >> 2, y >> 2, z >> 2, seed + 4) - 0.5) * 0.18 < 1;
  };
  for (let z = 0; z < PD; z++) for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    if (inside(x, y, z)) continue;
    // only a 2-voxel shell around the hollow
    if (inside(x + 2, y, z) || inside(x - 2, y, z) || inside(x, y + 2, z) || inside(x, y - 2, z) || inside(x, y, z + 2) || inside(x, y, z - 2)) p.set(x, y, z, rock(x, y, z));
  }
  // a glowing pool on the floor and crystal clusters
  for (let z = 4; z < PD - 2; z++) for (let x = 6; x < PW - 6; x++) {
    let fy = -1;
    for (let y = 2; y < PH / 2; y++) if (p.filled(x, y, z) && !p.filled(x, y + 1, z) && inside(x, y + 1, z)) { fy = y; break; }
    if (fy < 0) continue;
    if (Math.hypot(x + 0.5 - PW * 0.38, (z + 0.5 - PD * 0.42) * 1.3) < 10) pg.set(x, fy, z, (x + z) % 5 ? 0x2a8ac0 : 0x6ad8ff);
  }
  for (let k = 0; k < 13; k++) {
    const [c, hi] = CRYS[k % CRYS.length];
    const x0 = 10 + rng() * (PW - 20), z0 = 6 + rng() * (PD - 18);
    let fy = -1;
    for (let y = 2; y < PH - 2; y++) if (p.filled(Math.round(x0), y, Math.round(z0)) && inside(Math.round(x0), y + 1, Math.round(z0))) { fy = y; break; }
    if (fy < 0) continue;
    const h = 10 + rng() * 26, rr = 1.8 + rng() * 2.2;
    const lx = (rng() - 0.5) * 0.6, lz = (rng() - 0.5) * 0.5;
    for (let t = 0; t < h; t++) {
      const tip = t > h - rr * 1.6, w = tip ? rr * (h - t) / (rr * 1.6) : rr;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > w) continue;
        pg.set(Math.round(x0 + lx * t + dx), Math.round(fy + t), Math.round(z0 + lz * t + dz), dx < 0 ? hi : c);
      }
    }
  }
  // the pocket's mouth meets the window hole: z = PD is the back of the wall
  // seen only through the little window: half resolution is plenty
  const pocket = lowRes(() => group(G32(p, [PW / 2, 0, PD]), G32(pg, [PW / 2, 0, PD])));
  pocket.position.set(0, y0 * S32, -FACE * S32 + 2 * S32);
  return { obj, pocket };
}

// ---------------------------------------------------------------- tunnel mouths
/**
 * A dug tunnel leaving through a wall: a rough timber frame (two posts and a lintel), the dark tube
 * behind it sloping down into the rock, rubble at its feet and a lantern on a hook beside it.
 * Returns { obj, light } (light local, tile units).
 */
export function tunnelMouth(seed = 1) {
  const hw = Math.round(MOUTH_HW * V), top = Math.round(MOUTH_H * V);
  const grp = new THREE.Group();
  // frame
  const fw = hw * 2 + 22, g = new VoxelGrid(fw, top + 14, 10);
  const post = beam(0x6a4428, 'y', seed);
  const cx = fw / 2;
  for (const s of [-1, 1]) {
    const x0 = Math.round(cx + s * (hw + 5) - 4);
    for (let y = 0; y < top + 4; y++) {
      const lean = Math.round(s * -(y / (top + 4)) * 2); // leaning in a little
      g.box(x0 + lean, y, 2, 8, 1, 7, post);
    }
    g.box(x0 - 1, 0, 1, 10, 3, 9, stone(0x6e665e, { seed: seed + s }));
  }
  g.box(Math.round(cx - hw - 11), top + 4, 1, hw * 2 + 22, 9, 8, beam(0x5a3a22, 'x', seed + 1));
  for (const s of [-1, 1]) g.box(Math.round(cx + s * (hw + 5) - 2), top + 6, 9, 4, 4, 1, C.iron);
  // claw marks scratched into the lintel
  for (let k = 0; k < 3; k++) for (let y = 0; y < 5; y++) g.set(Math.round(cx - 6 + k * 3 + y * 0.4), top + 6 + y, 9, 0x3e2616);
  grp.add(M32(g, [cx, 0, 2]));
  // the tube (1/16-tile voxels), unlit: the dark stays dark next to the lantern
  const S = 2, TW = Math.round((hw + 6) * 2 / S), TH = Math.round((top + 6) / S), TL = 56;
  const t = new VoxelGrid(TW, TH + 8, TL);
  const tcx = TW / 2;
  const open = (x, y, z) => {
    const drop = Math.floor((TL - 1 - z) * 0.18); // the floor slopes down away from the room
    const du = (x + 0.5 - tcx) * S, v = (y + drop) * S;
    return inMouth(du * 0.97, v - 1, seed) && y + drop > 0;
  };
  for (let z = 0; z < TL; z++) {
    const k = 0.06 + 0.6 * Math.pow(z / (TL - 1), 2.2);
    for (let y = 0; y < TH + 8; y++) for (let x = 0; x < TW; x++) {
      if (open(x, y, z)) continue;
      // only the shell around the opening
      if (!open(x + 1, y, z) && !open(x - 1, y, z) && !open(x, y + 1, z) && !open(x, y - 1, z) && z > 0) continue;
      const pick = hash2(x, y + z * 31, seed) < 0.07;
      const floor = !open(x, y, z) && open(x, y + 1, z);
      const base = floor ? 0x5a4030 : [0x4a3424, 0x543c28, 0x3e2c1e][Math.floor(hash2(x >> 1, y >> 1, z + seed) * 3)];
      t.set(x, y, z, mulc(pick ? mulc(base, 0.7) : base, k));
    }
    // a back wall of black far away
    if (z === 0) for (let y = 0; y < TH + 8; y++) for (let x = 0; x < TW; x++) t.set(x, y, 0, 0x060403);
  }
  // pebbles, a dropped pick-handle and a root hanging in the tube
  for (let k = 0; k < 8; k++) {
    const z = 10 + Math.floor(hash2(k, 2, seed) * (TL - 12)), x = Math.floor(tcx - 4 + hash2(k, 1, seed) * 8);
    let y = 0;
    while (y < TH && !open(x, y + 1, z)) y++;
    t.set(x, y + 1, z, mulc(0x8a8078, 0.1 + 0.6 * (z / TL) ** 2));
  }
  const tube = G16(t, [tcx, 0, TL], { outline: false });
  tube.position.z = -(FACE - 1) * S32;
  grp.add(tube);
  // rubble either side
  const ra = lowRes(() => rubble(seed, 0.5, 0.36)), rb = lowRes(() => rubble(seed + 5, 0.42, 0.3));
  ra.obj.position.set(-(hw + 14) * S32, 0, 0.2); rb.obj.position.set((hw + 15) * S32, 0, 0.17);
  ra.obj.scale.set(1, 0.9, 1); rb.obj.scale.set(1, 0.8, 1);
  grp.add(ra.obj, rb.obj);
  // the lantern on its hook, right of the frame
  const lh = lanternOnHook(seed);
  lh.obj.position.set(MOUTH_LANTERN.x, MOUTH_LANTERN.y - lh.light.y, 0);
  grp.add(lh.obj);
  return { obj: grp, light: MOUTH_LANTERN };
}
/** Where a tunnel mouth's lantern glows (local to the mouth, tiles). */
export const MOUTH_LANTERN = { x: (Math.round(MOUTH_HW * V) + 22) / 32, y: 2.15, z: 12 / 32 };

/** An iron hook in the wall with a small lantern (local; returns { obj, light }). */
export function lanternOnHook(seed = 1) {
  const g = new VoxelGrid(14, 38, 18);
  const gl = new VoxelGrid(14, 38, 18);
  const ir = iron(0x2e2e36, seed);
  g.box(5, 30, 0, 4, 5, 2, ir);
  line(g, [[7, 32, 1], [7, 32, 11], [7, 29, 12]], 0.6, ir);
  g.box(7, 25, 11, 1, 4, 1, ir);
  g.box(3, 23, 8, 9, 2, 8, ir); g.box(4, 25, 9, 7, 1, 6, C.ironL);
  for (const [x, z] of [[3, 8], [11, 8], [3, 15], [11, 15]]) g.box(x, 11, z, 1, 12, 1, ir);
  g.box(3, 10, 8, 9, 1, 8, ir); g.box(5, 8, 10, 5, 2, 4, C.ironD);
  gl.box(4, 11, 9, 7, 12, 6, (x, y) => (y > 18 ? C.glowW : C.glowO));
  gl.box(6, 13, 11, 3, 5, 2, C.glowY);
  return { obj: group(M32(g, [7, 0, 0]), G32(gl, [7, 0, 0])), light: { x: 0, y: 17 * S32, z: 12 * S32 } };
}

// ---------------------------------------------------------------- structure
/** A square corner post from floor to ceiling with a stone footing and iron bands (h voxels). */
export function cornerPost(h, seed = 1) {
  const g = new VoxelGrid(16, h, 16);
  g.box(0, 0, 0, 16, h, 16, beam(0x4a2e1a, 'y', seed));
  for (const y of [26, 92]) g.box(0, y, 0, 16, 2, 16, (x, y2, z) => ((x + z) % 7 === 0 ? C.ironL : C.iron));
  g.box(0, 0, 0, 16, 11, 16, stone(0x7a7068, { seed }));
  g.box(0, 10, 0, 16, 1, 16, 0x8a8078);
  return M32(g, [8, 0, 8]);
}

/**
 * The build bench: a sturdy workbench with a vise, a shelf of planks, a pegboard of tools on the
 * wall (saw, hammer, square, plane, chisels), a pinned blueprint and a jar of nails. Local: back
 * against the wall at z = -0.5 tile, front toward +z; 2 tiles wide (x), 1 deep.
 */
export function buildBench(seed = 8) {
  const grp = new THREE.Group();
  const g = new VoxelGrid(64, 112, 32);
  const top = wood(0xa0703e, { axis: 'x', across: 'z', pw: 8, seed });
  const leg = beam(0x5a3a22, 'y', seed + 1);
  for (const [x, z] of [[2, 4], [57, 4], [2, 25], [57, 25]]) g.box(x, 0, z, 5, 26, 5, leg);
  g.box(2, 8, 4, 60, 2, 26, wood(0x7a5030, { axis: 'x', across: 'z', pw: 6, seed: seed + 2 })); // shelf
  // planks and a sack on the shelf
  for (let k = 0; k < 3; k++) g.box(6 + k, 10 + k * 2, 8 + k * 5, 38, 2, 4, wood(0xb07a4a, { axis: 'x', across: 'y', pw: 99, seed: seed + k }));
  g.ellipsoid(52, 14, 16, 6, 5, 7, (x, y, z) => mulc(C.burlap, sp3(x, y, z, 3, 0.1, 0.1)));
  g.box(0, 26, 2, 64, 4, 30, top); // thick top
  g.box(0, 30, 2, 64, 1, 2, mulc(0xa0703e, 0.8));
  // the vise on the right front corner
  g.box(50, 30, 26, 10, 6, 6, C.iron); g.box(52, 31, 32, 6, 4, 1, C.ironL);
  line(g, [[55, 33, 33], [55, 33, 38]], 0.7, C.ironL); g.box(51, 32, 38, 9, 1, 1, C.ironL);
  // sawdust and shavings on the top, a mallet and a pencil
  for (let k = 0; k < 18; k++) g.set(6 + Math.floor(hash2(k, 1, seed) * 40), 30, 6 + Math.floor(hash2(k, 2, seed) * 22), k % 3 ? 0xe8c890 : 0xd8b070);
  g.box(10, 30, 20, 9, 4, 4, 0x8a5a32); line(g, [[18, 32, 22], [28, 31, 25]], 0.7, 0xb07a4a);
  line(g, [[34, 30.5, 12], [42, 30.5, 9]], 0.5, 0xe0b040);
  // a jar of nails
  ring(g, 44, 18, 0, 3.4, 30, 38, (x, y, z) => (y > 36 ? 0xd8ecf0 : h3(x, y, z, 2) < 0.4 ? 0x9a9aa4 : 0x6a6a74));
  ring(g, 44, 18, 0, 3.8, 38, 39, 0xc84a3a);
  // pegboard on the wall
  g.box(0, 44, 0, 64, 62, 2, (x, y) => ((x % 5 === 2 && y % 5 === 2) ? 0x5a3a22 : mulc(0xb08a5a, 0.94 + Math.floor(hash2(x >> 4, 1, seed) * 3) * 0.04)));
  g.box(0, 44, 0, 64, 2, 3, 0x6a4428); g.box(0, 104, 0, 64, 2, 3, 0x6a4428); g.box(0, 44, 0, 2, 62, 3, 0x6a4428); g.box(62, 44, 0, 2, 62, 3, 0x6a4428);
  // tools on pegs: a saw, a hammer, a square, a plane on a shelf, chisels
  for (let x = 6; x < 26; x++) for (let y = 0; y < 9 - Math.floor((x - 6) * 0.25); y++) g.set(x, 82 + y, 3, (x + y) % 5 === 0 ? 0x8a8a94 : 0xb8b8c4);
  for (let x = 6; x < 26; x += 2) g.set(x, 81, 3, 0x6a6a74);
  g.box(26, 80, 3, 6, 12, 2, 0x8a5a32);
  line(g, [[38, 58, 3], [38, 80, 3]], 0.9, 0x9a6a3a); g.box(34, 80, 2, 9, 5, 4, 0x4a4a54); g.box(42, 81, 3, 2, 3, 2, 0x3a3a44);
  g.box(48, 64, 3, 2, 28, 1, 0xc8c8d0); g.box(48, 64, 3, 12, 2, 1, 0xc8c8d0); for (let y = 66; y < 92; y += 4) g.set(49, y, 4, 0x3a3a44);
  for (const [x, c] of [[8, 0xc84a3a], [12, 0x3a6ab0], [16, 0xe0b040]]) { g.box(x, 52, 3, 2, 10, 2, c); g.box(x, 62, 3, 2, 6, 1, 0xa8a8b4); }
  // a little shelf with a plane and a can of paint
  g.box(20, 60, 2, 22, 2, 7, 0x6a4428);
  g.box(22, 62, 3, 10, 4, 5, 0xa0703e); g.box(26, 66, 4, 2, 2, 2, 0x5a3a22);
  ring(g, 37, 5.5, 0, 3, 62, 68, (x, y) => (y === 67 ? 0x3a8ac0 : 0x8a8a94));
  // the blueprint pinned at the top right, curling at a corner
  const bp = (x, y) => ((x % 6 === 0 || y % 6 === 0) ? 0x6aa0e0 : 0x2a5aa8);
  g.box(46, 92, 2, 14, 10, 1, bp);
  for (let k = 0; k < 8; k++) g.set(48 + k, 96, 3, 0xe8f0ff);
  for (let k = 0; k < 5; k++) g.set(52, 93 + k, 3, 0xe8f0ff);
  g.set(59, 101, 3, 0x9ac0f0); g.set(46, 101, 3, 0xc8c8d0); g.set(59, 92, 3, 0xc8c8d0);
  grp.add(M32(g, [32, 0, 16]));
  return grp;
}

// ---------------------------------------------------------------- the hole in the roof
/**
 * Above the hole: an earth shaft running up out of sight with roots, and at its top the bright
 * daylight far above. Local: origin on the ceiling plane at the hole's centre (tile units).
 */
export function holeShaft(radius = 0.9, height = 6, seed = 11) {
  // the shaft wall: an open cylinder seen from inside, painted as pixel strata (cheap, ~40 triangles)
  const TW = 96, TH = Math.round(height * 16);
  const data = new Uint8Array(TW * TH * 4);
  for (let y = 0; y < TH; y++) {
    const k = y / TH;
    const lit = Math.round((0.2 + 1.0 * Math.pow(k, 2.4) + 0.22 * Math.max(0, 1 - y / 10)) * 6) / 6;
    for (let x = 0; x < TW; x++) {
      const strata = Math.floor((y + Math.sin(x * 0.26 + seed) * 2.2) / 5) % 3;
      let c = [0x5a3e2a, 0x4e3624, 0x684a32][strata];
      const h = hash2(x >> 1, y >> 1, seed);
      if (h < 0.035) c = 0x8a8078; else if (h > 0.97) c = 0x3a281a;
      if (k > 0.86 && hash2(x, y, seed + 1) < 0.35) c = 0x6aa04a; // grass roots up top
      if (Math.abs(((x + Math.sin(y * 0.2) * 3) % 24) - 12) < 0.6 && hash2(Math.floor(x / 24), y >> 4, seed + 2) < 0.3) c = 0x6a4a2e; // root threads
      const o = (y * TW + x) * 4, m = Math.min(1.3, lit);
      data[o] = Math.min(255, ((c >> 16) & 255) * m); data[o + 1] = Math.min(255, ((c >> 8) & 255) * m); data[o + 2] = Math.min(255, (c & 255) * m); data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, TW, TH, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.04, radius, height, 24, 1, true), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
  wall.position.y = height / 2;
  // roots dangling across the shaft
  const R = Math.round(radius * 16) + 2, H = TH;
  const g = new VoxelGrid(R * 2, H, R * 2);
  const rng = makeRng(seed);
  for (let k = 0; k < 7; k++) {
    const y0 = 6 + rng() * (H - 20), a = rng() * Math.PI * 2;
    const x0 = R + Math.cos(a) * (R - 2), z0 = R + Math.sin(a) * (R - 2);
    line(g, [[x0, y0, z0], [R + Math.cos(a) * 2, y0 - 5 - rng() * 6, R + Math.sin(a) * 2]], 0.6, mulc(0x6a4a2e, 0.4 + 0.8 * (y0 / H)));
  }
  const roots = G16(g, [R, 0, R], { outline: false });
  // the daylight disc far above
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.05, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
  disc.position.y = height - 0.1;
  return group(wall, roots, disc);
}

/** Snapped board ends hanging from the rim of the hole (local to the hole centre, tile units). */
export function brokenBoards(radius, seed = 5) {
  const grp = new THREE.Group();
  const rng = makeRng(seed);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + rng() * 0.6;
    const L = 10 + Math.floor(rng() * 14);
    const g = new VoxelGrid(10, L + 2, 4);
    for (let y = 0; y < L; y++) for (let x = 0; x < 10; x++) {
      if (y > L - 6 && hash2(x, y, k + seed) < (y - (L - 6)) / 6) continue; // splintered end
      g.set(x, y, 1, mulc(0x6e4a2c, (x === 0 || x === 9 ? 0.75 : 0.95) * sp3(x, y, 1, k, 0.12, 0.12)));
      g.set(x, y, 2, mulc(0x6e4a2c, 0.85));
    }
    const m = M32(g, [5, 0, 2]);
    // hinged at the rim, hanging down and inward
    const piv = new THREE.Group();
    piv.position.set(Math.cos(a) * radius * 0.96, 0, Math.sin(a) * radius * 0.96);
    piv.rotation.y = -a + Math.PI / 2;
    m.rotation.x = Math.PI + (0.45 + rng() * 0.6);
    piv.add(m);
    grp.add(piv);
  }
  // a few dangling roots
  for (let k = 0; k < 4; k++) {
    const a = rng() * Math.PI * 2, n = 16 + Math.floor(rng() * 20);
    const g = new VoxelGrid(10, n + 2, 10);
    let x = 5, z = 5;
    const pts = [];
    for (let y = n; y >= 0; y -= 3) { pts.push([x, y, z]); x = Math.max(2, Math.min(8, x + (rng() - 0.5) * 3)); z = Math.max(2, Math.min(8, z + (rng() - 0.5) * 3)); }
    line(g, pts, (t) => 1.3 * (1 - t) + 0.5, (xx, y, zz, t) => mixc(0x8a6a48, 0x3e2818, Math.round((1 - t) * 4) / 4));
    const m = M32(g, [5, n + 1, 5]);
    m.position.set(Math.cos(a) * radius * 1.05, 0, Math.sin(a) * radius * 1.05);
    grp.add(m);
  }
  return grp;
}

/** A root hanging from the ceiling or a wall top (origin at its top, len in tiles). */
export function hangingRoot(len, seed) {
  const n = Math.round(len * 32);
  const g = new VoxelGrid(18, n + 2, 18);
  let x = 9, z = 9;
  const pts = [];
  for (let y = n; y >= 0; y -= 3) { pts.push([x, y, z]); x = Math.max(3, Math.min(15, x + (hash2(y, 1, seed) - 0.5) * 3)); z = Math.max(3, Math.min(15, z + (hash2(y, 2, seed) - 0.5) * 3)); }
  line(g, pts, (t) => 1.6 * (1 - t) + 0.5, (xx, y, zz, t) => mixc(0x8a6a48, 0x3e2818, Math.round((1 - t) * 4) / 4));
  // a rootlet branching off
  const b = pts[Math.floor(pts.length / 3)];
  if (b) line(g, [b, [b[0] + 4, b[1] - 6, b[2] + 2]], 0.5, 0x6a4a2e);
  return M32(g, [9, n + 1, 9]);
}

export { S32 };

/**
 * Glowing bracket fungi growing out of a wall: chunky half-moon shelves stacked up a mossy patch,
 * lit tops and darker gills underneath (local, on the wall face). Returns { obj, color }.
 */
export function wallFungi(seed = 1, n = 3, hue = 0) {
  const pal = [[0x6ad8ff, 0xc8f4ff, 0x2a6a8a], [0x9aff7a, 0xe0ffd0, 0x3a7a3a], [0xffb86a, 0xfff0c0, 0x8a5a2a]][hue % 3];
  const g = new VoxelGrid(34, 48, 14);
  const gl = new VoxelGrid(34, 48, 14);
  // a patch of moss and rot on the wall where they grow
  for (let y = 0; y < 44; y++) for (let x = 2; x < 32; x++) {
    const d = Math.hypot((x - 17) / 15, (y - 20) / 22);
    if (d < 1 && hash2(x >> 1, y >> 1, seed) < 1.15 - d) g.set(x, y, 0, hash2(x, y, seed + 1) < 0.5 ? 0x355a26 : 0x4f7f34);
  }
  for (let k = 0; k < n; k++) {
    const cx = 17 + (hash2(k, 1, seed) - 0.5) * 12, cy = 7 + k * 13 + hash2(k, 2, seed) * 3;
    const r = 5 + hash2(k, 3, seed) * 4;
    for (let z = 1; z < 12; z++) for (let x = 0; x < 34; x++) {
      const d = Math.hypot((x + 0.5 - cx) / r, (z - 0.5) / (r * 0.85));
      if (d > 1) continue;
      const th = Math.round((1 - d) * 3.2); // thicker toward the wall
      const y0 = Math.round(cy);
      for (let t = 0; t <= th; t++) gl.set(x, y0 + t, z, t === th ? (d > 0.8 ? pal[1] : (x + z) % 4 === 0 ? pal[1] : pal[0]) : pal[0]);
      g.set(x, y0 - 1, z, (x + z) % 2 ? pal[2] : mulc(pal[2], 0.75)); // gills
    }
  }
  return { obj: group(M32(g, [17, 0, 0]), G32(gl, [17, 0, 0])), color: pal[0] };
}

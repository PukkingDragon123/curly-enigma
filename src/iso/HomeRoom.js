// The home burrow's shell. A floor painted per tile at 32 texels (relief + shine); two back walls
// built as 1/32 voxel reliefs in the chosen style inside a heavy timber frame (posts on stone
// footings, knee braces, a crown beam with beam ends, iron straps); the low cut rims along the
// open front with the earth slab under the floor; the round door to town (choked with rubble
// until the way out has been dug); the round window into a glowing crystal pocket; tunnel
// mouths dug through any wall; the Surface Express poster; a high ledge of jars, hanging roots,
// dried herbs, sconces, cobwebs and glowing bracket fungi. Static dressing is merged into a few
// draw calls with the fixed lights baked into its colors.
import * as THREE from 'three';
import { WALLS } from '../data/furniture.js';
import { pixelTexture } from '../gfx/PixelArt.js';
import { makeRng, hashStr } from '../core/util.js';
import { posterCanvas } from './pixel.js';
import { reliefMesh, ISO_BACK, viewForYaw, withView } from './mesher.js';
import { VoxelGrid, C, wood, beam, iron, stone, line, ring, M32, G32, group, mulc, mixc, h3, sp3 } from './kit.js';
import { hash2, noiseSampler } from './surface.js';
import { paintHomeFloor, repaintHomeTile, HTPX } from './homeFloor.js';
import { disposeTextures } from './surface.js';
import { bakeLighting } from './bake.js';
import { Batch, keepUnbatched } from './vox.js';
import { HOLE, WINDOW_SLOTS } from './homeLayout.js';
import { crystalWindow, WIN, inMouth, tunnelTube, mouthRubble, lanternHook, portal, cavedDoor, cobweb, bracketFungi, frontRim } from './homeDecor.js';
import { hangingLantern } from './props.js';

export const WALL_H = 3; // world units
const WV = 32; // wall voxels per unit
const FACE = 12; // wall thickness behind the nominal face (voxels)
export const RIM = 10 / 32; // depth of the cut rims along the open front
const PS = 77; // timber post spacing along a wall (voxels)
const WOOD0 = 0x5a3a22;

// ---------------------------------------------------------------- wall patterns
/** The timber frame shared by every wall style: [color, relief] or null where the infill shows. */
function frameVoxel(u, v, seed, phase) {
  const H = WALL_H * WV;
  const pu = (((u + phase) % PS) + PS) % PS;
  if (v >= H - 10) {
    // crown beam, with squared beam ends standing proud over each post
    if (pu < 9 && v >= H - 11) return [(pu === 0 || pu === 8 || v === H - 11) ? mulc(0x3e2616, 1) : mulc(0x6a4428, 0.95 + ((pu + v) % 3) * 0.04), 9];
    const lip = v === H - 10;
    const c = mulc(WOOD0, (0.9 + ((v + Math.floor(u / 53)) % 3) * 0.045) * sp3(u, v, 0, seed, 0.05, 0.1));
    return [lip ? mulc(WOOD0, 0.78) : c, lip ? 7 : 6];
  }
  if (pu < 9) {
    if (v < 8) return [mulc(0x7a7068, 0.9 + Math.floor(hash2(Math.floor((u + phase) / PS), 1, seed) * 3) * 0.06) * 1, 8]; // stone footing
    if (v === 20 || v === 21 || v === 62 || v === 63) return [pu === 4 && (v === 21 || v === 63) ? C.ironL : C.iron, 8]; // iron straps
    const edge = pu === 0 || pu === 8;
    return [edge ? mulc(WOOD0, 0.72) : mulc(WOOD0, 1.02 + (Math.floor(v / 9 + pu) % 3 === 0 ? -0.07 : 0)), edge ? 6 : 7];
  }
  // knee braces from each post up to the crown beam
  const dr = pu - 9, dl = PS - 1 - pu;
  for (const d of [dr, dl]) {
    if (d < 0 || d >= 24) continue;
    const tv = H - 11 - 24 + d;
    if (v >= tv - 2 && v <= tv + 2) return [v === tv + 2 ? mulc(WOOD0, 1.12) : v === tv - 2 ? mulc(WOOD0, 0.75) : WOOD0, 5];
  }
  return null;
}

/** [color, relief] for wall-space voxel (u along, v up) in style id. relief in voxels (+ = sticks out). */
function wallVoxel(style, u, v, seed, n, phase) {
  const w = WALLS[style] || WALLS.wall_dirt;
  const c = w.color;
  const H = WALL_H * WV;
  const fr = frameVoxel(u, v, seed, phase);
  if (fr) return fr;
  if (style !== 'wall_dirt' && v < 5) return [mulc(v === 4 ? mulc(WOOD0, 1.15) : mulc(WOOD0, 0.92), sp3(u, v, 1, seed, 0.06, 0.1)), v === 4 ? 3 : 2];
  const wains = style === 'wall_brick' || style === 'wall_paper';
  if (wains && v < 30) {
    if (v >= 27) return [mulc(WOOD0, v === 29 ? 1.25 : 1.05), v === 29 ? 3 : 2]; // chair rail
    const panel = Math.floor((u + 4) / 22), pl = (u + 4) % 22;
    if (pl < 2 || v < 7 || v > 24) return [mulc(WOOD0, 1.08), 1]; // frame
    return [mulc(WOOD0, 0.96 + hash2(panel, 1, seed) * 0.08), pl === 2 || v === 24 ? -1 : 0]; // recessed panel
  }
  switch (style) {
    case 'wall_plank': {
      const row = Math.floor(v / 8), lv = v % 8, off = (row * 37) % 70;
      const seam = (u + off) % 70 === 0;
      const pc = mulc(c, 0.86 + Math.floor(hash2(Math.floor((u + off) / 70), row, seed) * 4) * 0.06);
      if (seam) return [mulc(c, 0.55), -1];
      if (lv === 0) return [mulc(pc, 0.62), 2]; // overlapping lip
      if (lv === 1) return [mulc(pc, 0.8), 1];
      const grain = (lv + Math.floor(hash2(row, 7, seed) * 3)) % 3 === 0 && hash2(Math.floor(u / 11), row * 8 + lv, seed) < 0.6;
      if (((u + off) % 70 === 3 || (u + off) % 70 === 66) && lv === 4) return [0x8a8a90, 1]; // nail
      return [grain ? mulc(pc, 0.9) : pc, 0];
    }
    case 'wall_red': {
      const b = u % 12;
      if (b < 2) return [mulc(c, 0.7), 2]; // batten
      const bc = mulc(c, 0.9 + Math.floor(hash2(Math.floor(u / 12), 2, seed) * 3) * 0.05);
      if ((v + Math.floor(u / 12) * 13) % 31 === 0) return [mulc(bc, 0.8), 0];
      return [hash2(u, v >> 3, seed) < 0.04 ? mulc(bc, 1.12) : bc, 0];
    }
    case 'wall_stone': {
      const row = Math.floor(v / 12), off = (row % 2) * 11;
      const bx = Math.floor((u + off) / 22), lx = (u + off) % 22, ly = v % 12;
      if (ly === 0 || lx === 0) return [hash2(u >> 2, v >> 2, seed) < 0.18 && v < 40 ? 0x4f7a34 : mixc(c, 0x2a2420, 0.5), -2];
      const sc = mulc(c, 0.84 + Math.floor(hash2(bx, row, seed) * 5) * 0.06);
      const bev = Math.min(lx, 21 - lx, ly, 11 - ly);
      if (bev === 1) return [lx === 1 || ly === 11 ? mulc(sc, 1.12) : mulc(sc, 0.86), 0];
      return [mulc(sc, sp3(u, v, 2, seed, 0.08, 0.12)), 1 + (n(u, v) > 0.3 ? 1 : 0)];
    }
    case 'wall_brick': {
      const row = Math.floor((v - 30) / 7), off = (row % 2) * 8;
      const lx = (u + off) % 16, ly = (v - 30) % 7;
      if (ly === 0 || lx === 0) return [0xb8a890, -1];
      const bc = mulc(c, 0.84 + Math.floor(hash2(Math.floor((u + off) / 16), row, seed) * 5) * 0.06);
      return [ly === 6 ? mulc(bc, 1.1) : lx === 15 ? mulc(bc, 0.88) : mulc(bc, sp3(u, v, 3, seed, 0.06, 0.1)), 0];
    }
    case 'wall_paper': {
      let col = c;
      const fu = (u + (Math.floor(v / 14) % 2) * 7) % 14, fv = v % 14;
      if (fv >= 4 && fv <= 9 && fu >= 4 && fu <= 9) {
        const dx = Math.abs(fu - 6.5), dy = Math.abs(fv - 6.5);
        if (dx < 1 && dy < 1) col = 0xf0d890;
        else if (dx + dy < 3.2) col = 0xe8a0b0;
        else if (dx < 0.6 || dy < 0.6) col = 0x8ab07a;
      }
      if (u % 14 === 0 && v % 3 === 0) col = mulc(c, 0.92);
      return [col, 0];
    }
    default: {
      // packed earth over a fieldstone footing: wavy strata, embedded stones, roots, a damp band
      if (v < 13) {
        const row = v < 6 ? 0 : 1, off = row * 9;
        const bx = Math.floor((u + off) / 17), lx = (u + off) % 17, ly = row ? v - 6 : v;
        if (lx === 0 || ly === 0) return [0x3a2c22, 0];
        const sc = [0x7a7068, 0x6a625a, 0x8a8076, 0x5e564e][Math.floor(hash2(bx, row, seed) * 4)];
        const top = row ? ly >= 6 : ly >= 5;
        return [top ? mulc(sc, 1.1) : lx === 16 ? mulc(sc, 0.85) : sc, top ? 2 : 3];
      }
      const strata = Math.floor((v + Math.sin(u * 0.09 + seed) * 4 + n(u * 0.5, v) * 6) / 11);
      let col = mulc(c, 0.86 + (strata % 3) * 0.075);
      if (hash2(u >> 1, v >> 1, seed + 3) < 0.04) col = mulc(col, 0.84);
      // embedded stones (round, sticking out)
      const sx = Math.floor(u / 26), sy = Math.floor(v / 22);
      const sh = hash2(sx, sy, seed + 5);
      if (sh < 0.3) {
        const cx = sx * 26 + 5 + hash2(sx, sy, seed + 6) * 16, cy = sy * 22 + 4 + hash2(sx, sy, seed + 7) * 14;
        const r = 2.5 + hash2(sx, sy, seed + 8) * 4.5;
        const d = Math.hypot(u + 0.5 - cx, (v + 0.5 - cy) * 1.25);
        if (d < r) {
          const sc = [0x8a8078, 0x6e665e, 0x9a8c7c, 0x7a6e64][Math.floor(sh * 12) % 4];
          const lit = (cx - u) * 0.5 + (v - cy) * 0.7;
          return [mulc(sc, 0.92 + Math.max(-0.15, Math.min(0.2, lit * 0.06))), Math.round(2 + (1 - d / r) * 2)];
        }
      }
      // roots snaking down from under the crown beam
      const ru = Math.floor(u / 40);
      if (hash2(ru, 0, seed + 9) < 0.5) {
        const rx = ru * 40 + 8 + hash2(ru, 1, seed + 9) * 24 + Math.sin(v * 0.11 + ru) * 3 + Math.sin(v * 0.31 + ru * 2) * 1.2;
        const end = (H - 10) * (0.3 + hash2(ru, 2, seed + 9) * 0.45);
        const wdt = 1.3 + (v / H) * 1.3;
        if (v > H - 10 - end && Math.abs(u + 0.5 - rx) < wdt) return [mixc(0x6a4a2e, 0x3e2818, (u + 0.5 - rx + wdt) / (2 * wdt) * 0.6), 2];
      }
      if (v < 20) col = mixc(col, 0x2e241c, (20 - v) / 20 * 0.3);
      return [col, n(u, v) > 0.45 ? 1 : 0];
    }
  }
}

// ---------------------------------------------------------------- room
export class HomeRoom {
  constructor(parent) {
    this.parent = parent;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.wallMeshes = [];
    this.floor = null;
    this.toggles = []; // [{tile:{x,y}, obj}] loose things shown only while their tile is free
  }

  /**
   * opts: { tunnels: [{wall, t}], doorOpen: bool, hole: {x, z} }
   */
  build(W, D, wallId, floorMap, opts = {}) {
    this.W = W;
    this.D = D;
    this.opts = { tunnels: [], doorOpen: true, hole: HOLE, ...opts };
    this.door = { x: 0, z: D - 2 }; // door tile on the west wall
    this.tunnels = this.opts.tunnels;
    this.planLights();
    this.buildFloor(floorMap);
    this.buildSlab();
    this.setWall(wallId);
    // everything below is static dressing, merged at the end
    this.decor = new THREE.Group();
    this.buildDoor();
    this.buildWindow();
    this.buildPoster();
    this.buildDecor();
    this.buildTunnels();
    this.buildRims();
    this.mergeDecor();
  }

  /** Fixed lights: sconces, the crystal window, lanterns at tunnel mouths, the light shaft. */
  planLights() {
    const { W, D } = this;
    this.sconceSpots = [
      { x: Math.min(W - 1.5, 3.55), z: 0.06, rotY: 0 },
      { x: 0.06, z: Math.max(1.5, Math.min(D - 3.4, 4.2)), rotY: Math.PI / 2 },
    ];
    this.sconces = this.sconceSpots.map((s) => ({ x: s.x + (s.rotY ? 0.4 : 0), y: 2.34, z: s.z + (s.rotY ? 0 : 0.4) }));
    const wz = WINDOW_SLOTS[0] + 0.5;
    this.windowLight = { x: 0.4, y: WIN.cy / 32, z: wz };
    this.lanterns = [];
    for (const tn of this.tunnels) this.lanterns.push(this.mouthLantern(tn));
    // ceiling joists over every post of the two back walls, and a lantern hung from one of each
    this.joistsN = [];
    for (let u = 0; u <= W * WV; u += PS) this.joistsN.push((u + 4.5) / WV);
    this.joistsW = [];
    for (let a = 0; a + 41.5 < D * WV - 4; a += PS) this.joistsW.push((a + 41.5) / WV);
    const near = (list, v, ok) => list.filter(ok).sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0];
    const jn = near(this.joistsN, W - 2.6, (x) => x > 3.8 && x < W - 0.6);
    const jw = near(this.joistsW, D / 2, (z) => Math.abs(z - (WINDOW_SLOTS[0] + 0.5)) > 0.9 && z < D - 2.6 && z > 0.8);
    this.hanging = [];
    if (jn !== undefined) this.hanging.push({ x: jn, y: 2.36, z: 0.6, len: 0.2 });
    if (jw !== undefined) this.hanging.push({ x: 0.6, y: 2.36, z: jw, len: 0.2 });
    const hole = this.opts.hole;
    this.bakeLights = [
      ...this.hanging.map((l) => ({ x: l.x, y: l.y, z: l.z, color: 0xffb860, power: 0.8, radius: 3.0 })),
      ...this.sconces.map((l) => ({ ...l, color: 0xffb860, power: 0.9, radius: 3.6 })),
      { ...this.windowLight, color: 0x6ad8ff, power: 1.1, radius: 3.2 },
      ...this.lanterns.map((l) => ({ ...l, color: 0xffb050, power: 0.8, radius: 2.4 })),
      { x: hole.x, y: 1.2, z: hole.z, color: 0xfff0d0, power: 0.55, radius: 3.4 },
    ];
  }

  /** World transform of a wall spot: position on the wall face at floor level + yaw (local +z into the room). */
  wallPose(wall, t) {
    const { W, D } = this;
    if (wall === 'n') return { x: t, z: 0, yaw: 0 };
    if (wall === 'w') return { x: 0, z: t, yaw: Math.PI / 2 };
    if (wall === 's') return { x: t, z: D, yaw: Math.PI };
    return { x: W, z: t, yaw: -Math.PI / 2 };
  }

  mouthLantern(tn) {
    const p = this.wallPose(tn.wall, tn.t);
    if (tn.wall === 'n' || tn.wall === 'w') {
      // hook to the right of the mouth, lantern 0.3 out from the wall at y ≈ 1.25
      const lx = 0.6, lz = 0.3;
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      return { x: p.x + lx * c + lz * s, y: 1.25, z: p.z - lx * s + lz * c };
    }
    // front portals: lantern under the lintel, just outside the room
    return tn.wall === 's' ? { x: tn.t, y: 0.97, z: this.D + 0.2 } : { x: this.W + 0.2, y: 0.97, z: tn.t };
  }

  // floor ------------------------------------------------------------
  buildFloor(floorMap) {
    const { W, D } = this;
    const t0 = performance.now();
    this.floor = paintHomeFloor(W, D, floorMap);
    this.floorMs = performance.now() - t0;
    const t = this.floor.tex;
    const geo = new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2);
    // texel row 0 = z 0 (north): flip v so the data texture lines up
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const mat = new THREE.MeshPhongMaterial({ map: t.map, normalMap: t.normalMap, specularMap: t.specularMap, specular: 0x8a7e70, shininess: 22 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(W / 2, 0, D / 2);
    this.group.add(m);
    this.floorMesh = m;
  }

  paintTile(x, y, id) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.D) return;
    repaintHomeTile(this.floor.S, this.floor.tex, x, y, id);
  }

  /** Earth slab under the floor and rims, visible along the cut-away front edges (strata, stones, roots). */
  buildSlab() {
    const { W, D } = this;
    const H = 28; // voxels at 1/32
    const n = noiseSampler(9, 5, 2, 0.5, 2000, 200);
    const mk = (len, axis) => {
      const U = Math.round(len * WV);
      const depth = new Int16Array(U * H), col = new Uint32Array(U * H);
      for (let v = 0; v < H; v++) for (let u = 0; u < U; u++) {
        const k = 0.3 + 0.7 * (v / (H - 1));
        const strata = Math.floor((v + Math.sin(u * 0.07 + (axis === 'x' ? 0 : 3)) * 2 + n(u, v) * 3) / 6);
        let c = mulc([0x5a3e2a, 0x4e3624, 0x684a32, 0x3e2c1e][strata & 3], k);
        if (hash2(u >> 1, v >> 1, 9) < 0.05) c = mulc(0x8a8078, k);
        // roots poking out of the cut
        const ru = Math.floor(u / 47);
        if (hash2(ru, 3, 11) < 0.5 && Math.abs(u - ru * 47 - 20 - Math.sin(v * 0.4) * 2) < 1.2 && v > 6) c = mulc(0x6a4a2e, k + 0.1);
        depth[u + v * U] = 3 + (n(u, v) > 0.4 ? 1 : 0);
        col[u + v * U] = c;
      }
      return reliefMesh(depth, col, U, H, { scale: 1 / WV, view: axis === 'x' ? ISO_BACK : viewForYaw(Math.PI / 2) });
    };
    const front = mk(W + RIM, 'x');
    front.position.set(0, -H / WV, D + RIM - 3 / WV);
    this.group.add(front);
    const side = mk(D + RIM, 'z');
    side.rotation.y = Math.PI / 2;
    side.position.set(W + RIM - 3 / WV, -H / WV, D + RIM);
    this.group.add(side);
    // the rim strip's ground (under the rims, so gaps read as dug-out earth)
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a281a }));
    const g1 = g.clone(); g1.scale.set(W + RIM, 1, RIM); g1.position.set((W + RIM) / 2, -0.004, D + RIM / 2);
    const g2 = g.clone(); g2.scale.set(RIM, 1, D); g2.position.set(W + RIM / 2, -0.004, D / 2);
    this.group.add(g1, g2);
    this.slab = [front, side, g1, g2];
  }

  // walls ------------------------------------------------------------
  /** Is wall-space voxel (along from the NW corner, v up) inside an opening? */
  holeFn(isW) {
    const door = this.doorShape();
    const wc = (WINDOW_SLOTS[0] + 0.5) * WV;
    const mouths = this.tunnels.filter((t) => t.wall === (isW ? 'w' : 'n')).map((t) => ({ c: t.t * WV, seed: Math.floor(t.t * 7) }));
    return (along, v) => {
      if (isW && door(along, v)) return true;
      if (isW && Math.hypot(along + 0.5 - wc, v + 0.5 - WIN.cy) <= WIN.r) return true;
      for (const m of mouths) if (Math.abs(along + 0.5 - m.c) < 20 && inMouth(along + 0.5 - m.c, v, m.seed)) return true;
      return false;
    };
  }

  setWall(wallId) {
    this.wallId = wallId;
    for (const m of this.wallMeshes) { this.group.remove(m); m.geometry.dispose(); }
    this.wallMeshes = [];
    const { W, D } = this;
    const H = WALL_H * WV;
    const seed = hashStr(wallId) % 1000;
    const n = noiseSampler(6, seed + 1, 2, 0.5, 4000, 200);
    const build = (len, isW) => {
      const U = len * WV;
      const depth = new Int16Array(U * H), col = new Uint32Array(U * H);
      const hole = this.holeFn(isW);
      for (let v = 0; v < H; v++) for (let u = 0; u < U; u++) {
        const q = u + v * U;
        // the N wall runs west→east from the corner; the W wall runs south→north (u = 0 at the room's front)
        const along = isW ? U - 1 - u : u;
        if (hole(along, v)) { depth[q] = 0; continue; }
        const [c, rel] = wallVoxel(wallId, along, v, seed + (isW ? 17 : 0), n, isW ? 40 : 0);
        let cc = c;
        if (v < 6) cc = mulc(cc, 0.75 + v * 0.04); // contact shadow where the wall meets the floor
        depth[q] = Math.max(1, FACE + rel);
        col[q] = cc;
      }
      return { depth, col, U };
    };
    // north wall: along x, face toward +z
    const nw = build(W, false);
    const mN = reliefMesh(nw.depth, nw.col, nw.U, H, { scale: 1 / WV, view: ISO_BACK });
    mN.position.set(0, 0, -FACE / WV);
    // west wall: along z, face toward +x; local x runs from the room's front (z = D) to the corner
    const ww = build(D, true);
    const mW = reliefMesh(ww.depth, ww.col, ww.U, H, { scale: 1 / WV, view: viewForYaw(Math.PI / 2) });
    mW.rotation.y = Math.PI / 2;
    mW.position.set(-FACE / WV, 0, D);
    // corner post and earthy caps on the cut ends at the front
    const post = new VoxelGrid(18, H, 18);
    post.box(0, 0, 0, 18, H, 18, beam(0x4a2e1a, 'y', seed));
    for (const y of [20, 62]) post.box(0, y, 0, 18, 2, 18, C.iron);
    post.box(0, 0, 0, 18, 8, 18, stone(0x7a7068, { seed }));
    const pm = withView(ISO_BACK, () => M32(post, [9, 0, 9]));
    const earth = (x, y, z) => mulc(y % 9 < 2 ? 0x2e2016 : 0x3a281a, sp3(x, y, z, 2, 0.12, 0.18));
    const capW = new VoxelGrid(FACE + 10, H, 2);
    capW.box(0, 0, 0, FACE + 10, H, 2, earth);
    const em = withView(ISO_BACK, () => M32(capW, [0, 0, 0]));
    em.position.set(-FACE / WV - 1 / WV, 0, D);
    const capN = new VoxelGrid(2, H, FACE + 2);
    capN.box(0, 0, 0, 2, H, FACE + 2, earth);
    const em2 = withView(ISO_BACK, () => M32(capN, [0, 0, 0]));
    em2.position.set(W, 0, -FACE / WV - 1 / WV);
    for (const m of [mN, mW, pm, em, em2]) { this.group.add(m); this.wallMeshes.push(m); }
    // bake the fixed lights + a cozy falloff toward the dark top into the wall colors
    for (const m of [mN, mW]) {
      m.updateMatrixWorld(true);
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      bakeLighting(g, this.bakeLights || [], { ambient: (x, y, z, nx, ny, nz, out) => { const k = y > 2.0 ? Math.max(0.58, 1 - (y - 2.0) * 0.42) : 1; out[0] = k; out[1] = k * 0.97; out[2] = k * 0.95; } });
      m.geometry.setAttribute('color', g.getAttribute('color'));
      g.dispose();
    }
  }

  /** Door hole in west-wall voxel coords (along = from the corner). */
  doorShape() {
    const cz = (this.door.z + 0.5) * WV;
    const hw = 10.5, hTop = 27;
    return (along, v) => {
      const du = along + 0.5 - cz;
      if (Math.abs(du) > hw) return false;
      if (v < hTop - hw) return true;
      return du * du + (v - (hTop - hw)) ** 2 <= hw * hw;
    };
  }

  buildDoor() {
    const g = new VoxelGrid(46, 62, 12);
    const glow = new VoxelGrid(46, 62, 12);
    const wd0 = 0x8a5a32;
    const cx = 23, r = 21, base = 30;
    const st = stone(0x7a7470, { seed: 4 });
    const open = this.opts.doorOpen;
    for (let y = 0; y < 62; y++) for (let x = 0; x < 46; x++) {
      const dx = x + 0.5 - cx;
      const inArch = y < base ? Math.abs(dx) <= r + 2 : dx * dx + (y - base) ** 2 <= (r + 3) ** 2;
      const inDoor = y < base ? Math.abs(dx) <= r - 2 : dx * dx + (y - base) ** 2 <= (r - 2) ** 2;
      if (inArch && !inDoor) {
        const a = Math.atan2(y - base, dx);
        const seam = y >= base && Math.abs(((a / Math.PI) * 9) % 1) < 0.1;
        // the cave-in cracked the arch: a few stones missing, the rest darker
        if (!open && y > base && hash2(x >> 2, y >> 2, 5) < 0.18) continue;
        for (let z = 2; z < 8; z++) g.set(x, y, z, seam ? 0x4a4038 : open ? st(x, y, z) : mulc(st(x, y, z), 0.8));
      }
      if (inDoor) {
        const pl = Math.floor((x + 2) / 7);
        const c = (x + 2) % 7 === 0 ? mulc(wd0, 0.66) : mulc(wd0, 0.88 + Math.floor(hash2(pl, 3, 7) * 3) * 0.07);
        g.set(x, y, 3, open ? c : mulc(c, 0.7)); g.set(x, y, 4, open ? c : mulc(c, 0.7));
      }
    }
    // iron straps with rivets, hinges, a brass knob and a round window (lit only when the way is open)
    for (const y of [10, 34]) for (let x = 5; x < 26; x++) { g.set(x, y, 5, C.iron); g.set(x, y + 1, 5, x % 5 === 0 ? C.ironL : C.iron); }
    g.box(33, 22, 5, 3, 3, 2, C.brass); g.set(34, 23, 7, 0xffe08a);
    g.ellipsoid(cx, 41, 6, 6, 6, 1, 0x3a2a1a);
    if (open) glow.ellipsoid(cx, 41, 6.5, 4.4, 4.4, 0.8, (x, y) => (Math.abs(x + 0.5 - cx) < 0.8 || Math.abs(y + 0.5 - 41) < 0.8 ? -1 : y > 41 ? 0xffe0a0 : 0xffc060));
    else g.ellipsoid(cx, 41, 6.5, 4.4, 4.4, 0.8, 0x1a1210);
    for (let k = -4; k <= 4; k++) { g.set(cx, 41 + k, 7, 0x6a4a2a); g.set(cx + k, 41, 7, 0x6a4a2a); }
    g.box(0, 0, 7, 46, 2, 5, st); // step
    const m = withView(viewForYaw(Math.PI / 2), () => group(M32(g, [23, 0, 2]), G32(glow, [23, 0, 2])));
    m.rotation.y = Math.PI / 2; // face +x
    m.position.set(-0.1, 0, this.door.z + 0.5);
    this.decor.add(m);
    if (open) {
      const mat = new VoxelGrid(24, 1, 32);
      mat.box(0, 0, 0, 24, 1, 32, (x, y, z) => ((x + z) % 6 < 3 ? 0x9a6a3a : 0xb08048));
      for (let z = 0; z < 32; z += 2) { mat.set(0, 0, z, 0xd8b878); mat.set(23, 0, z, 0xd8b878); }
      const mm = M32(mat, [0, 0, 16]);
      mm.position.set(0.15, 0.0, this.door.z + 0.5);
      this.decor.add(mm);
    } else {
      const cv = withView(viewForYaw(Math.PI / 2), () => cavedDoor(4));
      cv.rotation.y = Math.PI / 2;
      cv.position.set(0, 0, this.door.z + 0.5);
      this.decor.add(cv);
    }
  }

  /** The round window into the crystal pocket (west wall). */
  buildWindow() {
    const wz = WINDOW_SLOTS[0] + 0.5;
    const cw = withView(viewForYaw(Math.PI / 2), () => crystalWindow(FACE, 3));
    const grp = group(cw.obj, cw.pocket);
    grp.rotation.y = Math.PI / 2;
    grp.position.set(0.02, 0, wz);
    this.decor.add(grp);
  }

  buildPoster() {
    const pc = posterCanvas();
    const tex = pixelTexture(pc.commit());
    const pw = pc.w / 30, ph = pc.h / 30;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
    const cx = 2, cy = 1.72;
    plane.position.set(cx, cy, 0.075);
    this.group.add(plane);
    this.posterPlane = plane;
    // chunky wooden frame with brass corners, two tacks
    const fw = Math.round(pw * 32) + 8, fh = Math.round(ph * 32) + 8;
    const g = new VoxelGrid(fw, fh, 3);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (x > 3 && x < fw - 4 && y > 3 && y < fh - 4) continue;
      g.set(x, y, 0, mulc(0x6a4226, sp3(x, y, 0, 3, 0.08, 0.1)));
      if (x < 2 || y < 2 || x >= fw - 2 || y >= fh - 2) g.set(x, y, 1, mulc(0x8a5a32, sp3(x, y, 1, 4, 0.08, 0.1)));
    }
    for (const [x, y] of [[1, 1], [fw - 3, 1], [1, fh - 3], [fw - 3, fh - 3]]) g.box(x, y, 1, 2, 2, 2, 0xd9a84a);
    const fm = withView(ISO_BACK, () => M32(g, [fw / 2, fh / 2, 0]));
    fm.position.set(cx, cy, 0.0);
    this.decor.add(fm);
    this.poster = { x0: 1, x1: 2, cx, cy };
  }

  /** Roots, dried herbs, a high ledge of jars and pots, sconces, cobwebs, fungi. */
  buildDecor() {
    const { W, D } = this;
    const rng = makeRng(W * 13 + D);
    const top = WALL_H - 10 / 32; // under the crown beam
    const add = (m) => { this.decor.add(m); return m; };
    // hanging roots (between the beam ends)
    const root = (len, seed) => {
      const n = Math.round(len * 32);
      const g = new VoxelGrid(18, n + 2, 6);
      let x = 9;
      const pts = [];
      for (let y = n; y >= 0; y -= 3) { pts.push([x, y, 3]); x = Math.max(3, Math.min(15, x + (hash2(y, 1, seed) - 0.5) * 3)); }
      line(g, pts, (t) => 1.6 * (1 - t) + 0.5, (xx, y, z, t) => mixc(0x8a6a48, 0x3e2818, Math.round((1 - t) * 4) / 4));
      return M32(g, [9, n + 1, 3]);
    };
    const posterSkip = (x) => x > 0.6 && x < 3.4;
    const mouthSkip = (wall, a) => this.tunnels.some((t) => t.wall === wall && Math.abs(t.t - a) < 0.8);
    for (let i = 0; i < Math.round(W * 0.6); i++) {
      const x = 0.6 + rng() * (W - 1.2);
      if (posterSkip(x) || mouthSkip('n', x)) continue;
      const len = 0.2 + rng() * 0.4;
      const m = withView(ISO_BACK, () => root(len, i + 1));
      m.position.set(x, top, 0.24 + rng() * 0.05);
      add(m);
    }
    for (let i = 0; i < Math.round(D * 0.5); i++) {
      const z = 0.6 + rng() * (D - 1.2);
      if (Math.abs(z - (this.door.z + 0.5)) < 1.2 || Math.abs(z - (WINDOW_SLOTS[0] + 0.5)) < 0.8 || mouthSkip('w', z)) continue;
      const len = 0.2 + rng() * 0.35;
      const m = withView(viewForYaw(Math.PI / 2), () => root(len, 40 + i));
      m.rotation.y = Math.PI / 2;
      m.position.set(0.24 + rng() * 0.05, top, z);
      add(m);
    }
    // a high ledge along the north wall with jars, pots, a candle and a book stack
    const ledgeLen = Math.max(2, W - 4.5);
    const L = Math.round(ledgeLen * 32);
    const lg = new VoxelGrid(L, 40, 14);
    const lglow = new VoxelGrid(L, 40, 14);
    const Y0 = 9; // the shelf board; brackets hang below it, jars stand on it
    lg.box(0, Y0, 0, L, 3, 12, wood(0x6a4226, { axis: 'x', across: 'z', pw: 99, seed: 9 }));
    for (let bx = 6; bx < L; bx += 38) line(lg, [[bx, Y0, 1], [bx, 1, 1], [bx, Y0, 9]], 0.9, C.iron);
    const jarCols = [0xd8a040, 0x8ab84a, 0xc84a3a, 0x9a6ad0, 0x6ac8e0, 0xe8e0c8];
    let x = 4;
    let k = 0;
    const B = Y0 + 3;
    while (x < L - 10) {
      const kind = Math.floor(hash2(k, 1, 21) * 5);
      if (kind === 0) { // glass jar with contents and a cloth lid
        const c = jarCols[k % jarCols.length];
        ring(lg, x + 4, 7, 0, 3.6, B, B + 10, (xx, y, z) => (y < B + 7 ? (h3(xx, y, z, k) < 0.15 ? mulc(c, 1.15) : c) : 0xd8ecf0));
        ring(lg, x + 4, 7, 0, 4.2, B + 10, B + 12, k % 2 ? 0xc84a3a : 0xe8dcc0);
        lg.set(x + 2, B + 6, 10, 0xffffff);
        x += 10;
      } else if (kind === 1) { // clay pot with a sprig
        ring(lg, x + 4, 7, 0, 4, B, B + 7, 0xb8603a); ring(lg, x + 4, 7, 0, 3, B + 7, B + 9, 0xc8704a); ring(lg, x + 4, 7, 0, 2.2, B + 8, B + 9, 0x3a2a1a);
        lg.set(x + 4, B + 10, 7, 0x5aa84a); lg.set(x + 5, B + 11, 7, 0x6ab84a); lg.set(x + 3, B + 11, 6, 0x4a8a3a);
        x += 10;
      } else if (kind === 2) { // books leaning
        for (let b = 0; b < 4; b++) lg.box(x + b * 2, B, 3, 2, 10 + (b % 2) * 2, 8, [0x8a3a2a, 0x3a5a8a, 0x5a8a3a, 0xe0b040][b]);
        x += 11;
      } else if (kind === 3) { // candle on a dish
        ring(lg, x + 3, 7, 0, 3, B, B + 1, 0xa8a8b0); lg.box(x + 2, B + 1, 6, 2, 6, 2, 0xf0e8d0);
        lglow.set(x + 2, B + 7, 6, 0xffd060); lglow.set(x + 2, B + 8, 6, 0xfff0a0);
        x += 9;
      } else { // a bowl of mushrooms
        ring(lg, x + 4, 7, 0, 4.5, B, B + 3, 0x8a6a48);
        for (let j = 0; j < 3; j++) lg.ellipsoid(x + 2 + j * 2, B + 4, 6 + (j % 2) * 2, 1.8, 1.2, 1.8, j % 2 ? 0xe0c8a0 : 0xc87a5a);
        x += 11;
      }
      x += 3 + Math.floor(hash2(k, 2, 22) * 6);
      k++;
    }
    const ledge = withView(ISO_BACK, () => group(M32(lg, [0, 0, 0]), G32(lglow, [0, 0, 0])));
    ledge.position.set(3.6, 2.36 - 9 / 32, 0.1);
    add(ledge);
    // dried herb bundles on a string along the west wall (north of the window)
    const herbs = new VoxelGrid(6, 4, 60);
    line(herbs, [[2, 3, 0], [2, 1, 30], [2, 3, 59]], 0.5, 0xc8b890);
    const hg = new THREE.Group();
    hg.add(withView(viewForYaw(Math.PI / 2), () => M32(herbs, [2, 3, 0])));
    const herbCols = [[0x6a8a3a, 0x8aa84a], [0x9a6aa8, 0x6a8a3a], [0xc8a040, 0x7a8a3a], [0xa84a3a, 0x6a7a3a]];
    for (let j = 0; j < 4; j++) {
      const b = new VoxelGrid(10, 24, 10);
      const [c1, c2] = herbCols[j];
      line(b, [[5, 15, 5], [5, 23, 5]], 0.6, 0x7a5a3a);
      for (let y = 0; y < 16; y++) for (let xx = 0; xx < 10; xx++) for (let z = 0; z < 10; z++) {
        const rr = Math.hypot(xx + 0.5 - 5, z + 0.5 - 5);
        if (rr < 1.4 + y * 0.22 && hash2(xx + y * 13, z, j) < 0.6) b.set(xx, y, z, hash2(z, xx + y * 7, j) < 0.5 ? c1 : c2);
      }
      ring(b, 5, 5, 0, 2.2, 15, 17, 0xc94a3a);
      const bm = withView(viewForYaw(Math.PI / 2), () => M32(b, [5, 24, 5]));
      bm.position.set(0, 0.06 - (j % 2) * 0.05, 0.22 + j * 0.42);
      hg.add(bm);
    }
    hg.position.set(0.3, 2.5, 0.25);
    add(hg);
    // two wall sconces
    for (const s of this.sconceSpots) {
      const sg = new VoxelGrid(14, 26, 18);
      const sgl = new VoxelGrid(14, 26, 18);
      const ir = iron(0x2e2e36, 2);
      sg.box(4, 14, 0, 6, 8, 2, ir);
      line(sg, [[7, 18, 1], [7, 18, 11], [7, 16, 13]], 0.8, ir);
      sg.box(2, 0, 7, 11, 2, 11, ir); sg.box(2, 15, 7, 11, 2, 11, ir); sg.box(4, 17, 9, 7, 1, 7, ir);
      for (const [xx, z] of [[2, 7], [12, 7], [2, 17], [12, 17]]) sg.box(xx, 2, z, 1, 13, 1, ir);
      sgl.box(3, 2, 8, 9, 13, 9, (xx, y) => (y > 9 ? 0xffd890 : 0xffb24a));
      sgl.box(6, 5, 11, 3, 5, 3, 0xfff2c0);
      const grp = withView(viewForYaw(s.rotY), () => group(M32(sg, [7, 0, 0]), G32(sgl, [7, 0, 0])));
      grp.position.set(s.x, 2.1, s.z);
      grp.rotation.y = s.rotY;
      add(grp);
    }
    // hanging lanterns (their chains run up out of sight)
    for (const [i, l] of this.hanging.entries()) {
      const hl = withView(ISO_BACK, () => hangingLantern(l.len, i + 3));
      hl.obj.position.set(l.x, l.y + 10 / 32 + l.len, l.z);
      add(hl.obj);
    }
    // strings of little lights sagging between joists, one on each back wall
    const gN = this.joistsN.filter((x) => x > 4.4);
    if (gN.length >= 2) this.lightString({ x: gN[gN.length - 2], z: 0.55 }, { x: gN[gN.length - 1], z: 0.55 }, 4);
    const gW = this.joistsW.filter((z) => z > WINDOW_SLOTS[0] + 1.2);
    if (gW.length >= 2) this.lightString({ x: 0.55, z: gW[0] }, { x: 0.55, z: gW[1] }, 9);
    // ceiling joists cut off at the open front: stubs over each post of both back walls
    for (const x of this.joistsN) this.joist(x, 'n');
    for (const z of this.joistsW) this.joist(z, 'w');
    // cobwebs in the top corners (an abandoned burrow, after all)
    const webN = withView(ISO_BACK, () => cobweb(24, 1));
    webN.position.set(0.3, top, 0.2);
    add(webN);
    const webW = withView(viewForYaw(Math.PI / 2), () => cobweb(20, 2, true));
    webW.rotation.y = Math.PI / 2;
    webW.position.set(0.2, top, 0.32);
    add(webW);
    const webE = withView(ISO_BACK, () => cobweb(18, 3, true));
    webE.position.set(W - 0.62, top, 0.2);
    add(webE);
    // glowing bracket fungi on the walls, low down where nothing hangs
    this.fungi = [];
    const fspots = [['n', W - 0.7, 0], ['w', D - 3.4, 1], ['n', 5.4, 2]];
    for (const [wall, a, hue] of fspots) {
      if (wall === 'n' && (a > W - 0.4 || mouthSkip('n', a))) continue;
      if (wall === 'w' && (a < 0.5 || mouthSkip('w', a) || Math.abs(a - (WINDOW_SLOTS[0] + 0.5)) < 0.8 || a > this.door.z - 0.3)) continue;
      const yaw = wall === 'n' ? 0 : Math.PI / 2;
      const f = withView(viewForYaw(yaw), () => bracketFungi(7 + hue, 3, hue));
      f.obj.rotation.y = yaw;
      if (wall === 'n') f.obj.position.set(a, 0.28, 0.16); else f.obj.position.set(0.16, 0.28, a);
      add(f.obj);
      const p = wall === 'n' ? { x: a, z: 0.4 } : { x: 0.4, z: a };
      this.fungi.push({ ...p, y: 0.5, color: f.color });
    }
  }

  /** A sagging string of small paper lanterns between two joist ends (voxel bulbs, a twine line). */
  lightString(a, b, seed) {
    const y = WALL_H - 9 / 32;
    const n = Math.max(5, Math.round(Math.hypot(b.x - a.x, b.z - a.z) * 3.2));
    const g = new VoxelGrid(4, 6, 4);
    const cols = [0xffd060, 0xff8a6a, 0x9ae07a, 0x8ac8ff, 0xffa0d0, 0xfff0b0];
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, y - Math.sin(t * Math.PI) * 0.32, a.z + (b.z - a.z) * t));
    }
    const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a1a12 }));
    this.decor.add(wire);
    for (let i = 1; i < n; i++) {
      const c = cols[(i + seed) % cols.length];
      const bg = new VoxelGrid(4, 6, 4);
      bg.box(0, 0, 0, 4, 4, 4, (x, yy, z) => (x === 0 || z === 0 ? mulc(c, 0.86) : c));
      bg.box(1, 4, 1, 2, 1, 2, 0x3a2a22);
      const m = G32(bg, [2, 6, 2]);
      m.position.copy(pts[i]);
      this.decor.add(m);
      if (i % 2) this.bakeLights.push({ x: pts[i].x, y: pts[i].y - 0.1, z: pts[i].z, color: c, power: 0.25, radius: 1.2 });
    }
    void g;
  }

  /** A joist stub coming out of the top of a back wall, cut off square with its end grain showing. */
  joist(a, wall) {
    const L = 26, g = new VoxelGrid(8, 8, L);
    g.box(0, 0, 0, 8, 8, L, (x, y, z) => {
      if (z === L - 1) return (Math.hypot(x - 3.5, y - 3.5) % 2.2 < 1) ? 0xb08a5a : 0x9a7448; // end grain rings
      const edge = x === 0 || x === 7 || y === 0;
      return edge ? mulc(0x4a2e1a, 1) : mulc(0x5e3c22, 0.94 + ((z >> 3) % 2) * 0.05);
    });
    for (const z of [6, L - 6]) g.set(7, 4, z, C.ironL);
    const yaw = wall === 'n' ? 0 : Math.PI / 2;
    const m = withView(viewForYaw(yaw), () => M32(g, [4, 8, 0]));
    m.rotation.y = yaw;
    if (wall === 'n') m.position.set(a, WALL_H, -0.05);
    else m.position.set(-0.05, WALL_H, a);
    this.decor.add(m);
  }

  /** Tunnel mouths dug through the walls. */
  buildTunnels() {
    for (const tn of this.tunnels) {
      const p = this.wallPose(tn.wall, tn.t);
      const seed = Math.floor(tn.t * 7) + tn.wall.charCodeAt(0);
      if (tn.wall === 'n' || tn.wall === 'w') {
        const grp = withView(viewForYaw(p.yaw), () => {
          const g = new THREE.Group();
          g.add(tunnelTube(FACE, seed));
          g.add(mouthRubble(seed));
          const lh = lanternHook(seed);
          lh.obj.position.set(0.6, 0.75, 0);
          g.add(lh.obj);
          return g;
        });
        grp.rotation.y = p.yaw;
        grp.position.set(p.x, 0, p.z);
        this.decor.add(grp);
      }
      // front tunnels are built with the rims
    }
  }

  /** The low cut rims along the open front (south and east) with portals where tunnels leave. */
  buildRims() {
    const { W, D } = this;
    const F = FACE / WV; // the rims also cap the cut ends of the two back walls
    const gapsS = this.tunnels.filter((t) => t.wall === 's').map((t) => [t.t - 0.62 + F, t.t + 0.62 + F]);
    const gapsE = this.tunnels.filter((t) => t.wall === 'e').map((t) => [D - t.t - 0.62, D - t.t + 0.62]);
    // south rim: along x from the west wall's back to past the east edge, outer face toward +z
    const s = withView(ISO_BACK, () => frontRim(W + F, gapsS, 3, true));
    s.position.set(-F, 0, D);
    this.decor.add(s);
    // east rim: local x runs north from z = D (after the turn), outer face toward +x
    const e = withView(viewForYaw(Math.PI / 2), () => frontRim(D + F, gapsE, 5, false));
    e.rotation.y = Math.PI / 2;
    e.position.set(W, 0, D);
    this.decor.add(e);
    for (const tn of this.tunnels) {
      if (tn.wall !== 's' && tn.wall !== 'e') continue;
      const yaw = tn.wall === 's' ? 0 : Math.PI / 2;
      const pt = withView(viewForYaw(yaw), () => portal(Math.floor(tn.t * 7)));
      pt.obj.rotation.y = yaw;
      if (tn.wall === 's') pt.obj.position.set(tn.t, 0, D);
      else pt.obj.position.set(W, 0, tn.t);
      this.decor.add(pt.obj);
    }
  }

  /** Merge the static dressing into a few meshes with the fixed lights baked in. */
  mergeDecor() {
    const batch = new Batch(64);
    this.decor.updateMatrixWorld(true);
    batch.add(this.decor);
    const lights = this.bakeLights;
    const amb = (x, y, z, nx, ny, nz, out) => { const k = y > 2.1 ? Math.max(0.62, 1 - (y - 2.1) * 0.4) : 1; out[0] = k; out[1] = k * 0.97; out[2] = k * 0.95; };
    this.decorMeshes = batch.build(this.group, ISO_BACK, { bake: (g) => bakeLighting(g, lights, { ambient: amb }) });
    keepUnbatched(this.decor, this.group);
  }

  dispose() {
    disposeTextures(this.floor?.tex);
  }
}

export { HTPX };

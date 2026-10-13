// The home burrow's shell: a floor slab painted per tile (FLOORS), two voxel back
// walls patterned from WALLS, cut-away front edges, the round door to town, the
// Surface Express poster, hanging roots, herbs and a ceiling lantern.
import * as THREE from 'three';
import { FLOORS, WALLS } from '../data/furniture.js';
import { PixelCanvas, pixelTexture, ramp } from '../gfx/PixelArt.js';
import { makeRng, hashStr, mixHex, shade } from '../core/util.js';
import { VoxelGrid, vmesh, gmesh, jit, hash3, V16, V8, carve } from './vox.js';
import { posterCanvas } from './pixel.js';

export const WALL_H = 3; // world units
const WV = 8; // wall voxels per unit
const TPX = 16; // floor texels per tile

// ---------------------------------------------------------------- floor painting
function px(pc, x, y, c) { pc.set(x, y, c); }

export function paintFloorTile(pc, tx, ty, id) {
  const f = FLOORS[id] || FLOORS.floor_dirt;
  const c = f.color;
  const R = ramp(c);
  const x0 = tx * TPX, y0 = ty * TPX;
  const rng = makeRng(tx * 92821 + ty * 1237 + hashStr(id));
  const pat = f.icon?.pat || 'dirt';
  const base = (x, y, amt = 0.06) => jit(c, x0 + x, y0 + y, 0, 5, amt);
  if (pat === 'plank') {
    // boards run along x, 4 px tall, staggered joints continuing across tiles
    for (let y = 0; y < TPX; y++) {
      const row = Math.floor((y0 + y) / 4);
      const off = (row * 7) % 16;
      for (let x = 0; x < TPX; x++) {
        const gx = x0 + x;
        let col = jit(c, Math.floor((gx + off) / 16), row, 0, 9, 0.1);
        if ((y0 + y) % 4 === 3) col = R[4];
        else if ((gx + off) % 16 === 0) col = R[4];
        else if (hash3(gx, y0 + y, 1, 4) < 0.08) col = shade(col, 0.9);
        else if ((y0 + y) % 4 === 0) col = mixHex(col, R[2], 0.3);
        px(pc, x0 + x, y0 + y, col);
      }
    }
    for (let y = 1; y < TPX; y += 4) { const row = Math.floor((y0 + y) / 4); const off = (row * 7) % 16; const nx = (16 - off + 1) % 16; if (nx < TPX) px(pc, x0 + nx, y0 + y, 0x3a3a40); }
  } else if (pat === 'stone') {
    pc.rect(x0, y0, TPX, TPX, R[4]);
    const stones = [[0, 0, 9, 7], [9, 0, 7, 9], [0, 7, 6, 9], [6, 9, 10, 7], [6, 7, 3, 2]];
    for (const [sx, sy, sw, sh] of stones) {
      const sc = jit(c, tx * 7 + sx, ty * 5 + sy, 0, 11, 0.14);
      for (let y = sy; y < sy + sh; y++) for (let x = sx; x < sx + sw; x++) {
        if (x === sx || y === sy) continue;
        let col = jit(sc, x0 + x, y0 + y, 0, 2, 0.05);
        if (y === sy + 1 || x === sx + 1) col = mixHex(col, R[2], 0.35);
        if (y === sy + sh - 1 || x === sx + sw - 1) col = mixHex(col, R[4], 0.3);
        px(pc, x0 + x, y0 + y, col);
      }
    }
    if (rng.chance(0.4)) for (let i = 0; i < 3; i++) px(pc, x0 + rng.int(1, 14), y0 + rng.int(1, 14), 0x5a7a3a);
  } else if (pat === 'moss') {
    for (let y = 0; y < TPX; y++) for (let x = 0; x < TPX; x++) {
      const h = hash3(x0 + x, y0 + y, 0, 21);
      px(pc, x0 + x, y0 + y, h < 0.12 ? R[4] : h > 0.86 ? R[2] : base(x, y, 0.1));
    }
    for (let i = 0; i < 5; i++) { const x = rng.int(1, 14), y = rng.int(2, 14); px(pc, x0 + x, y0 + y, R[1]); px(pc, x0 + x, y0 + y - 1, R[2]); }
    if (rng.chance(0.25)) { const x = rng.int(2, 13), y = rng.int(2, 13); px(pc, x0 + x, y0 + y, rng.pick([0xf0e070, 0xf0a0c0, 0xe8e8ff])); }
  } else if (pat === 'tile') {
    for (let y = 0; y < TPX; y++) for (let x = 0; x < TPX; x++) {
      const q = (x >> 3) + (y >> 3) * 2;
      let col = jit(c, tx * 4 + q, ty, 0, 31, 0.1);
      if (x % 8 === 7 || y % 8 === 7) col = mixHex(R[4], 0xd8c8b0, 0.35);
      else if (x % 8 === 0 || y % 8 === 0) col = mixHex(col, R[2], 0.3);
      px(pc, x0 + x, y0 + y, col);
    }
    if (c === FLOORS.floor_gold.color) for (let i = 0; i < 4; i++) { const x = rng.int(1, 13), y = rng.int(1, 13); px(pc, x0 + x, y0 + y, 0xfff8d0); px(pc, x0 + x + 1, y0 + y + 1, 0xfff0a0); }
  } else if (pat === 'checker') {
    for (let y = 0; y < TPX; y++) for (let x = 0; x < TPX; x++) {
      const dark = ((x >> 3) + (y >> 3)) % 2 === 1;
      let col = dark ? jit(0x3a3438, x0 + x, y0 + y, 0, 3, 0.04) : jit(c, x0 + x, y0 + y, 0, 3, 0.03);
      if (x % 8 === 0 && y % 8 === 0) col = shade(col, 0.9);
      px(pc, x0 + x, y0 + y, col);
    }
  } else if (pat === 'carpet') {
    for (let y = 0; y < TPX; y++) for (let x = 0; x < TPX; x++) {
      const d = Math.abs(((x0 + x) % 8) - 3.5) + Math.abs(((y0 + y) % 8) - 3.5);
      let col = base(x, y, 0.05);
      if (Math.round(d) === 3) col = mixHex(c, 0xe0b040, 0.35);
      else if (hash3(x0 + x, y0 + y, 0, 4) < 0.1) col = R[4];
      px(pc, x0 + x, y0 + y, col);
    }
  } else {
    // packed dirt: speckles, pebbles, little cracks
    for (let y = 0; y < TPX; y++) for (let x = 0; x < TPX; x++) {
      const h = hash3(x0 + x, y0 + y, 0, 13);
      px(pc, x0 + x, y0 + y, h < 0.1 ? R[4] : h > 0.92 ? R[2] : base(x, y, 0.08));
    }
    for (let i = 0; i < 2; i++) {
      if (!rng.chance(0.55)) continue;
      const x = rng.int(1, 13), y = rng.int(1, 14);
      px(pc, x0 + x, y0 + y, 0x8a8078); px(pc, x0 + x + 1, y0 + y, 0x6a625a); px(pc, x0 + x, y0 + y + 1, 0x4a3a2a);
    }
    if (rng.chance(0.3)) { let x = rng.int(2, 12), y = rng.int(2, 12); for (let k = 0; k < 4; k++) { px(pc, x0 + x, y0 + y, R[5]); x += rng.int(0, 1); y += 1; } }
  }
}

// ---------------------------------------------------------------- wall patterns
/** Color + relief for a wall voxel. u: along the wall (voxels), v: height (voxels). Returns [color, depth] depth: -1 recess, 0 flush, 1 protrude. */
function wallVoxel(style, u, v, seed, H) {
  const w = WALLS[style] || WALLS.wall_dirt;
  const c = w.color;
  const R = ramp(c);
  const wood = 0x5a3a22;
  const top = v >= H - 2;
  const fancyTrim = style !== 'wall_dirt';
  if (fancyTrim && top) return [jit(v === H - 1 ? shade(wood, 1.1) : wood, u >> 2, v, 0, seed, 0.06), 1];
  if (fancyTrim && v <= 1) return [jit(shade(wood, 0.9), u >> 2, v, 0, seed, 0.06), v === 1 ? 1 : 0];
  const wains = style === 'wall_brick' || style === 'wall_red' || style === 'wall_paper';
  if (wains && v <= 7) {
    if (v === 7) return [shade(wood, 1.15), 1]; // chair rail
    const plankU = Math.floor((u + (v > 4 ? 3 : 0)) / 6);
    if ((u + (v > 4 ? 3 : 0)) % 6 === 0) return [shade(wood, 0.75), -1];
    return [jit(shade(wood, 1.05), plankU, v > 4 ? 1 : 0, 0, seed + 3, 0.1), 0];
  }
  switch (style) {
    case 'wall_plank': {
      const row = Math.floor(v / 3);
      const off = (row * 5) % 12;
      if (v % 3 === 0) return [R[4], -1];
      if ((u + off) % 12 === 0) return [R[4], 0];
      return [jit(c, Math.floor((u + off) / 12), row, 0, seed, 0.12), 0];
    }
    case 'wall_red': {
      if (u % 3 === 0) return [shade(c, 0.62), -1];
      return [jit(c, Math.floor(u / 3), v >> 3, 0, seed, 0.08), 0];
    }
    case 'wall_stone': {
      const row = Math.floor(v / 3);
      const off = (row * 3) % 5;
      const bw = 5;
      if (v % 3 === 0 || (u + off) % bw === 0) return [mixHex(c, 0x2a2420, 0.4), -1];
      const sc = jit(c, Math.floor((u + off) / bw), row, 0, seed, 0.16);
      if (hash3(u, v, 2, seed) < 0.04) return [0x4a6a3a, 0];
      return [jit(sc, u, v, 0, seed + 1, 0.04), 0];
    }
    case 'wall_brick': {
      const row = Math.floor((v - 8) / 3);
      const off = row % 2 ? 3 : 0;
      if ((v - 8) % 3 === 2 || (u + off) % 6 === 5) return [0xb8a890, -1];
      return [jit(c, Math.floor((u + off) / 6), row, 0, seed, 0.13), 0];
    }
    case 'wall_paper': {
      let col = jit(c, u, v, 0, seed, 0.03);
      const fu = (u + (Math.floor(v / 6) % 2) * 3) % 6, fv = v % 6;
      if (fv >= 2 && fv <= 4 && fu >= 1 && fu <= 3) {
        if (fu === 2 && fv === 3) col = 0xf0d890;
        else if (fu === 2 || fv === 3) col = 0xe8a0b0;
      }
      if (u % 6 === 0 && v % 2 === 0) col = shade(c, 0.92);
      return [col, 0];
    }
    default: {
      // packed dirt with strata, pebbles and roots
      const strata = Math.floor((v + Math.sin(u * 0.35 + seed) * 1.6) / 5);
      let col = jit(shade(c, 0.9 + (strata % 3) * 0.07), u, v, 0, seed, 0.1);
      const h = hash3(u, v, 7, seed);
      if (h < 0.035) return [speckStone(u, v), 1];
      if (h > 0.97) col = R[4];
      return [col, 0];
    }
  }
}
function speckStone(u, v) { return [0x8a8078, 0x6a625a, 0x9a8a78][(u * 7 + v * 3) % 3]; }

// ---------------------------------------------------------------- room
export class HomeRoom {
  constructor(parent) {
    this.parent = parent;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.wallMesh = null;
    this.floorPC = null;
    this.floorTex = null;
  }

  build(W, D, wallId, floorMap) {
    this.W = W;
    this.D = D;
    this.door = { x: 0, z: D - 2 }; // door tile on the west wall
    this.buildFloor(floorMap);
    this.buildSlab();
    this.setWall(wallId);
    this.buildDoor();
    this.buildPoster();
    this.buildDecor();
  }

  // floor ------------------------------------------------------------
  buildFloor(floorMap) {
    const { W, D } = this;
    const pc = new PixelCanvas(W * TPX, D * TPX);
    this.floorPC = pc;
    this.floorMap = floorMap;
    for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) paintFloorTile(pc, x, y, floorMap[`${x},${y}`] || 'floor_dirt');
    this.shadeFloorEdges();
    this.floorTex = pixelTexture(pc.commit());
    const mat = new THREE.MeshLambertMaterial({ map: this.floorTex });
    const geo = new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(W / 2, 0, D / 2);
    this.group.add(m);
    this.floorMesh = m;
  }

  /** Darken a couple of texel rows along the back walls (contact shadow). */
  shadeFloorEdges() {
    const pc = this.floorPC;
    const { W, D } = this;
    for (let x = 0; x < W * TPX; x++) for (let k = 0; k < 3; k++) { const i = (k * W * TPX + x) * 4; const f = [0.55, 0.72, 0.86][k]; pc.d[i] *= f; pc.d[i + 1] *= f; pc.d[i + 2] *= f; }
    for (let y = 0; y < D * TPX; y++) for (let k = 0; k < 3; k++) { const i = (y * W * TPX + k) * 4; const f = [0.6, 0.76, 0.88][k]; pc.d[i] *= f; pc.d[i + 1] *= f; pc.d[i + 2] *= f; }
  }

  paintTile(x, y, id) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.D) return;
    paintFloorTile(this.floorPC, x, y, id);
    if (x <= 0 || y <= 0) this.reshadeTile(x, y);
    this.floorPC.commit();
    this.floorTex.needsUpdate = true;
  }

  reshadeTile(x, y) {
    const pc = this.floorPC;
    const Wp = this.W * TPX;
    for (let yy = y * TPX; yy < (y + 1) * TPX; yy++) for (let xx = x * TPX; xx < (x + 1) * TPX; xx++) {
      let f = 1;
      if (yy < 3) f *= [0.55, 0.72, 0.86][yy];
      if (xx < 3) f *= [0.6, 0.76, 0.88][xx];
      if (f === 1) continue;
      const i = (yy * Wp + xx) * 4;
      pc.d[i] *= f; pc.d[i + 1] *= f; pc.d[i + 2] *= f;
    }
  }

  /** Earth slab under the floor, visible along the cut-away front edges. */
  buildSlab() {
    const { W, D } = this;
    const depth = 7;
    const g = new VoxelGrid(W * WV + 1, depth, D * WV + 1);
    const dirt = 0x5a3e2a;
    for (let y = 0; y < depth; y++) {
      const fade = 0.35 + 0.65 * (y / (depth - 1));
      for (let x = 0; x < W * WV + 1; x++) {
        let col = jit(shade(dirt, fade), x, y, 0, 3, 0.12);
        if (hash3(x, y, 1, 4) < 0.05) col = shade(0x8a8078, fade);
        g.set(x, y, D * WV, col);
      }
      for (let z = 0; z < D * WV; z++) {
        let col = jit(shade(dirt, fade * 0.9), z, y, 1, 3, 0.12);
        if (hash3(z, y, 2, 4) < 0.05) col = shade(0x8a8078, fade);
        g.set(W * WV, y, z, col);
      }
    }
    // a lip of packed floor on top of the cut edge
    for (let x = 0; x <= W * WV; x++) g.set(x, depth - 1, D * WV, jit(0x7a5a3a, x, 0, 0, 8, 0.1));
    for (let z = 0; z < D * WV; z++) g.set(W * WV, depth - 1, z, jit(0x6a4a30, z, 0, 0, 8, 0.1));
    const m = vmesh(g, { scale: V8, pivot: [0, depth, 0] });
    m.position.set(0, -0.001, 0);
    this.group.add(m);
  }

  // walls ------------------------------------------------------------
  setWall(wallId) {
    this.wallId = wallId;
    if (this.wallMesh) {
      this.group.remove(this.wallMesh);
      this.wallMesh.geometry.dispose();
    }
    const { W, D } = this;
    const H = WALL_H * WV;
    const T = 3; // thickness incl. protrusion layer
    // grid coords: wall back at gx/gz = 0, face layer = 1, protrusions at 2
    const g = new VoxelGrid(W * WV + T, H, D * WV + T);
    const seed = hashStr(wallId) % 1000;
    const door = this.doorVox();
    const dirtTop = wallId === 'wall_dirt';
    // north wall (along x), face toward +z
    for (let u = 0; u < W * WV + 1; u++) {
      const gx = u + T - 1;
      const topJag = dirtTop ? Math.floor(hash3(u >> 1, 0, 0, seed) * 2) : 0;
      for (let v = 0; v < H - topJag; v++) {
        const [col, dep] = wallVoxel(wallId, u, v, seed, H);
        g.set(gx, v, 0, shade(col, 0.8));
        if (dep >= 0) g.set(gx, v, 1, col);
        if (dep > 0) g.set(gx, v, 2, shade(col, 1.06));
      }
    }
    // west wall (along z), face toward +x
    for (let u = 0; u < D * WV + 1; u++) {
      const gz = u + T - 1;
      const topJag = dirtTop ? Math.floor(hash3(u >> 1, 0, 1, seed) * 2) : 0;
      for (let v = 0; v < H - topJag; v++) {
        if (door(u, v)) continue;
        const [col, dep] = wallVoxel(wallId, u + 1000, v, seed, H);
        g.set(0, v, gz, shade(col, 0.8));
        if (dep >= 0) g.set(1, v, gz, col);
        if (dep > 0) g.set(2, v, gz, shade(col, 1.06));
      }
    }
    // corner post
    const post = wallId === 'wall_dirt' ? 0x4a3020 : 0x4a2e1a;
    for (let v = 0; v < H; v++) for (let a = 0; a < T; a++) for (let b = 0; b < T; b++) g.set(a, v, b, jit(post, a, v >> 1, b, 7, 0.08));
    // cut ends at the front: show the wall's earthy core
    for (let v = 0; v < H; v++) for (let a = 0; a < 2; a++) {
      g.set(a, v, D * WV + T - 1, jit(0x3a281a, a, v, 0, 2, 0.1));
      g.set(W * WV + T - 1, v, a, jit(0x3a281a, a, v, 1, 2, 0.1));
    }
    const m = vmesh(g, { scale: V8, pivot: [T - 1, 0, T - 1] });
    this.group.add(m);
    this.wallMesh = m;
  }

  /** Door hole in west-wall voxel coords. */
  doorVox() {
    const cz = (this.door.z + 0.5) * WV; // center along the wall in voxels (u)
    const hw = 5.2, hTop = 13;
    return (u, v) => {
      const du = u + 0.5 - cz;
      if (Math.abs(du) > hw) return false;
      if (v < hTop - hw) return true;
      return du * du + (v - (hTop - hw)) ** 2 <= hw * hw;
    };
  }

  buildDoor() {
    const g = new VoxelGrid(22, 30, 6);
    const wood = 0x8a5a32, dk = 0x5a3a20, stone = 0x7a7470, iron = 0x3a3a42;
    const cx = 11, r = 10, base = 14;
    // stone arch frame
    for (let y = 0; y < 30; y++) for (let x = 0; x < 22; x++) {
      const dx = x + 0.5 - cx;
      const inArch = y < base ? Math.abs(dx) <= r + 1 : dx * dx + (y - base) ** 2 <= (r + 1.5) ** 2;
      const inDoor = y < base ? Math.abs(dx) <= r - 1 : dx * dx + (y - base) ** 2 <= (r - 1) ** 2;
      if (inArch && !inDoor) for (let z = 1; z < 4; z++) g.set(x, y, z, jit(stone, (x + y) >> 1, y >> 1, z, 4, 0.14));
      if (inDoor) {
        // vertical planks
        const pl = Math.floor((x + 1) / 4);
        let col = (x + 1) % 4 === 0 ? shade(wood, 0.72) : jit(wood, pl, y >> 3, 0, 6, 0.08);
        g.set(x, y, 1, col);
        g.set(x, y, 2, col);
      }
    }
    // hinges
    for (const y of [5, 16]) for (let x = 3; x < 12; x++) g.set(x, y, 3, iron);
    // round window
    g.ellipsoid(cx, 19.5, 3.5, 3, 3, 0.6, 0x3a2a1a);
    g.ellipsoid(cx, 19.5, 3.5, 2.2, 2.2, 0.6, 0xffd27a);
    g.set(cx, 19, 3, 0x6a4a2a); g.set(cx - 1, 19, 3, 0x6a4a2a); g.set(cx, 20, 3, 0x6a4a2a); g.set(cx, 18, 3, 0x6a4a2a);
    // knob
    g.box(16, 10, 3, 2, 2, 1, 0xd9a84a);
    g.set(16, 11, 3, 0xffe08a);
    // step
    g.box(0, 0, 3, 22, 1, 3, jit(stone, 1, 0, 0, 2, 0.1));
    const m = vmesh(g, { scale: V16, pivot: [11, 0, 1] });
    m.rotation.y = Math.PI / 2; // face +x
    m.position.set(-0.12, 0, this.door.z + 0.5);
    this.group.add(m);
    // doormat
    const mat = new VoxelGrid(12, 1, 16);
    mat.box(0, 0, 0, 12, 1, 16, (x, y, z) => ((x + z) % 4 < 2 ? 0x9a6a3a : 0xb08048));
    for (let z = 0; z < 16; z += 2) { mat.set(0, 0, z, 0xd8b878); mat.set(11, 0, z, 0xd8b878); }
    const mm = vmesh(mat, { scale: V16 });
    mm.position.set(0.45, 0.0, this.door.z + 0.5);
    this.group.add(mm);
  }

  buildPoster() {
    const pc = posterCanvas();
    const tex = pixelTexture(pc.commit());
    const pw = pc.w / 30, ph = pc.h / 30;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
    const cx = 3, cy = 1.72;
    plane.position.set(cx, cy, 0.135);
    this.group.add(plane);
    // chunky wooden frame
    const fw = Math.round(pw * 16) + 4, fh = Math.round(ph * 16) + 4;
    const g = new VoxelGrid(fw, fh, 2);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (x > 1 && x < fw - 2 && y > 1 && y < fh - 2) continue;
      g.set(x, y, 0, jit(0x6a4226, x >> 1, y >> 1, 0, 3, 0.1));
      if (x === 0 || y === fh - 1 || x === fw - 1 || y === 0) g.set(x, y, 1, jit(0x8a5a32, x, y, 0, 4, 0.08));
    }
    g.set(1, fh - 2, 1, 0xd9a84a); g.set(fw - 2, fh - 2, 1, 0xd9a84a); g.set(1, 1, 1, 0xd9a84a); g.set(fw - 2, 1, 1, 0xd9a84a);
    const fm = vmesh(g, { scale: V16, pivot: [fw / 2, fh / 2, 0] });
    fm.position.set(cx, cy, 0.03);
    this.group.add(fm);
    this.poster = { x0: 2, x1: 3, cx, cy };
  }

  /** Roots, dried herbs, little wall details that never move. */
  buildDecor() {
    const { W, D } = this;
    const rng = makeRng(W * 13 + D);
    const roots = new THREE.Group();
    const root = (len, seed) => {
      const g = new VoxelGrid(7, len + 1, 3);
      let x = 3;
      for (let y = len; y >= 0; y--) {
        g.set(x, y, 1, jit(0x6a4a2a, x, y, 0, seed, 0.12));
        if (y > len - 3) g.set(x + 1, y, 1, 0x5a3a20);
        if (hash3(x, y, 0, seed) < 0.18) { const s = hash3(y, x, 1, seed) < 0.5 ? -1 : 1; g.set(x + s, y, 1, 0x7a5a3a); }
        if (hash3(y, 0, 2, seed) < 0.25) x = Math.max(1, Math.min(5, x + (hash3(y, 1, 3, seed) < 0.5 ? -1 : 1)));
      }
      g.set(x, 0, 1, 0x8a6a4a);
      return vmesh(g, { scale: V16, pivot: [3, len + 1, 1] });
    };
    const top = WALL_H - 0.02;
    const posterSkip = (x) => x > 1.5 && x < 4.5;
    for (let i = 0; i < Math.round(W * 0.6); i++) {
      const x = 0.6 + rng() * (W - 1.2);
      if (posterSkip(x)) continue;
      const m = root(rng.int(6, 16), i + 1);
      m.position.set(x, top, 0.2 + rng() * 0.08);
      roots.add(m);
    }
    for (let i = 0; i < Math.round(D * 0.5); i++) {
      const z = 0.6 + rng() * (D - 1.2);
      if (Math.abs(z - (this.door.z + 0.5)) < 1.2) continue;
      const m = root(rng.int(6, 14), 40 + i);
      m.rotation.y = Math.PI / 2;
      m.position.set(0.2 + rng() * 0.08, top, z);
      roots.add(m);
    }
    this.group.add(roots);
    // dried herb bundles on a string along the west wall
    const herbs = new VoxelGrid(4, 1, 52);
    for (let z = 0; z < 52; z++) herbs.set(1, 0, z, 0xc8b890);
    const hg = new THREE.Group();
    hg.add(Object.assign(vmesh(herbs, { scale: V16, pivot: [1, 0, 0] }), {}));
    const herbCols = [[0x6a8a3a, 0x8aa84a], [0x9a6aa8, 0x6a8a3a], [0xc8a040, 0x7a8a3a], [0xa84a3a, 0x6a7a3a]];
    for (let k = 0; k < 4; k++) {
      const b = new VoxelGrid(5, 11, 5);
      const [c1, c2] = herbCols[k];
      b.box(2, 7, 2, 1, 4, 1, 0x7a5a3a);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) {
        const rr = Math.hypot(x - 2, z - 2);
        if (rr < 1 + y * 0.22 && hash3(x, y, z, k) < 0.75) b.set(x, y, z, hash3(z, x, y, k) < 0.5 ? c1 : c2);
      }
      b.box(1, 7, 1, 3, 1, 3, 0xc94a3a);
      const bm = vmesh(b, { scale: V16, pivot: [2.5, 11, 2.5] });
      bm.position.set(0, 0, 0.35 + k * 0.85);
      hg.add(bm);
    }
    hg.position.set(0.18, 2.55, Math.max(1, D * 0.25));
    hg.rotation.y = 0;
    this.group.add(hg);
    // ceiling lantern hanging from the dark
    const lan = new VoxelGrid(9, 60, 9);
    for (let y = 14; y < 60; y++) if (y % 2 === 0) lan.set(4, y, 4, 0x3a3a42); else lan.set(4, y, 4, 0x5a5a62);
    lan.box(1, 1, 1, 7, 1, 7, 0x2a2a30);
    lan.box(2, 11, 2, 5, 2, 5, 0x2a2a30);
    lan.box(3, 13, 3, 3, 1, 3, 0x3a3a42);
    for (const [x, z] of [[1, 1], [7, 1], [1, 7], [7, 7]]) lan.box(x, 2, z, 1, 9, 1, 0x2a2a30);
    const lm = vmesh(lan, { scale: V16, pivot: [4.5, 0, 4.5] });
    const glass = new VoxelGrid(5, 9, 5);
    glass.box(0, 0, 0, 5, 9, 5, (x, y, z) => (y > 6 ? 0xffd890 : 0xffb24a));
    glass.box(1, 1, 1, 3, 4, 3, 0xfff0c0);
    const gm = gmesh(glass, { scale: V16, pivot: [2.5, 0, 2.5], outline: false });
    gm.position.y = 2 / 16;
    const lg = new THREE.Group();
    lg.add(lm, gm);
    const lx = Math.min(W - 2.5, W * 0.55), lz = Math.min(D - 2.5, D * 0.5);
    lg.position.set(lx, 2.35, lz);
    this.group.add(lg);
    this.lantern = { x: lx, y: 2.6, z: lz, obj: lg };
  }

  dispose() {
    if (this.floorTex) this.floorTex.dispose();
  }
}

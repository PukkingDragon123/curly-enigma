// The home burrow's shell: a floor painted per tile at 32 texels (relief + shine), two
// back walls built as 1/32 voxel reliefs in the chosen style (packed earth with strata,
// embedded stones and roots; overlapping planks; dressed stone; brick or wallpaper over
// a wood wainscot; red barn boards) framed by timber posts and a crown beam, cut-away
// front edges showing the earth, the round door to town, the Surface Express poster, a
// high ledge of jars and pots, hanging roots, dried herbs and two wall sconces.
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

export const WALL_H = 3; // world units
const WV = 32; // wall voxels per unit
const FACE = 12; // wall thickness behind the nominal face (voxels)

// ---------------------------------------------------------------- wall patterns
/** [color, relief] for wall-space voxel (u along, v up) in style id. relief in voxels (+ = sticks out). */
function wallVoxel(style, u, v, seed, n) {
  const w = WALLS[style] || WALLS.wall_dirt;
  const c = w.color;
  const H = WALL_H * WV;
  const wood0 = 0x5a3a22;
  // crown beam + baseboard (all styles)
  if (v >= H - 7) {
    const lip = v === H - 7;
    return [mulc(lip ? mulc(wood0, 1.12) : wood0, (0.92 + Math.floor(hash2(Math.floor(u / 40), v >> 2, seed) * 3) * 0.05) * sp3(u, v, 0, seed, 0.06, 0.1)), lip ? 5 : 3];
  }
  if (style !== 'wall_dirt' && v < 5) return [mulc(v === 4 ? mulc(wood0, 1.15) : mulc(wood0, 0.92), sp3(u, v, 1, seed, 0.06, 0.1)), v === 4 ? 3 : 2];
  // timber posts every ~3.6 units
  const pu = u % 115;
  if (pu < 7) {
    const edge = pu === 0 || pu === 6;
    return [edge ? mulc(wood0, 0.75) : mulc(wood0, 1.0 + (Math.floor(v / 23) % 2) * 0.04) * 1, edge ? 3 : 4];
  }
  const wains = style === 'wall_brick' || style === 'wall_paper';
  if (wains && v < 30) {
    if (v >= 27) return [mulc(wood0, v === 29 ? 1.25 : 1.05), v === 29 ? 3 : 2]; // chair rail
    const panel = Math.floor((u + 4) / 22), pl = (u + 4) % 22;
    if (pl < 2 || v < 7 || v > 24) return [mulc(wood0, 1.08), 1]; // frame
    return [mulc(wood0, 0.96 + hash2(panel, 1, seed) * 0.08), pl === 2 || v === 24 ? -1 : 0]; // recessed panel
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
      // packed earth: wavy strata, embedded stones, roots, pebbles, a damp band near the floor
      const strata = Math.floor((v + Math.sin(u * 0.09 + seed) * 4 + n(u * 0.5, v) * 6) / 11);
      let col = mulc(c, 0.86 + (strata % 3) * 0.075);
      if (hash2(u >> 1, v >> 1, seed + 3) < 0.05) col = mulc(col, 0.82);
      // embedded stones (round, sticking out)
      const sx = Math.floor(u / 26), sy = Math.floor(v / 22);
      const sh = hash2(sx, sy, seed + 5);
      if (sh < 0.32) {
        const cx = sx * 26 + 5 + hash2(sx, sy, seed + 6) * 16, cy = sy * 22 + 4 + hash2(sx, sy, seed + 7) * 14;
        const r = 2.5 + hash2(sx, sy, seed + 8) * 4.5;
        const d = Math.hypot(u + 0.5 - cx, (v + 0.5 - cy) * 1.25);
        if (d < r) {
          const sc = [0x8a8078, 0x6e665e, 0x9a8c7c, 0x7a6e64][Math.floor(sh * 12) % 4];
          const lit = (cx - u) * 0.5 + (v - cy) * 0.7;
          return [mulc(sc, 0.92 + Math.max(-0.15, Math.min(0.2, lit * 0.06))), Math.round(2 + (1 - d / r) * 2)];
        }
      }
      // roots snaking down from the top
      const ru = Math.floor(u / 40);
      if (hash2(ru, 0, seed + 9) < 0.55) {
        const rx = ru * 40 + 8 + hash2(ru, 1, seed + 9) * 24 + Math.sin(v * 0.11 + ru) * 3 + Math.sin(v * 0.31 + ru * 2) * 1.2;
        const end = H * (0.35 + hash2(ru, 2, seed + 9) * 0.5);
        const wdt = 1.4 + (v / H) * 1.4;
        if (v > H - end && Math.abs(u + 0.5 - rx) < wdt) return [mixc(0x6a4a2e, 0x3e2818, (u + 0.5 - rx + wdt) / (2 * wdt) * 0.6), 2];
      }
      if (v < 12) col = mixc(col, 0x2e241c, (12 - v) / 12 * 0.35);
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

  /** Earth slab under the floor, visible along the cut-away front edges (strata, stones, roots). */
  buildSlab() {
    const { W, D } = this;
    const H = 28; // voxels at 1/32
    const n = noiseSampler(9, 5, 2, 0.5, 2000, 200);
    const mk = (len, axis) => {
      const U = len * WV;
      const depth = new Int16Array(U * H), col = new Uint32Array(U * H);
      for (let v = 0; v < H; v++) for (let u = 0; u < U; u++) {
        const k = 0.3 + 0.7 * (v / (H - 1));
        const strata = Math.floor((v + Math.sin(u * 0.07 + (axis === 'x' ? 0 : 3)) * 2 + n(u, v) * 3) / 6);
        let c = mulc([0x5a3e2a, 0x4e3624, 0x684a32, 0x3e2c1e][strata & 3], k);
        if (hash2(u >> 1, v >> 1, 9) < 0.05) c = mulc(0x8a8078, k);
        if (v >= H - 2) c = mulc(0x7a5a3a, 0.92 + (v - H + 2) * 0.08);
        depth[u + v * U] = 3 + (n(u, v) > 0.4 ? 1 : 0) + (v >= H - 2 ? 1 : 0);
        col[u + v * U] = c;
      }
      return reliefMesh(depth, col, U, H, { scale: 1 / WV, view: axis === 'x' ? ISO_BACK : viewForYaw(Math.PI / 2) });
    };
    const front = mk(W, 'x');
    front.position.set(0, -H / WV, D - 3 / WV);
    this.group.add(front);
    const side = mk(D, 'z');
    side.rotation.y = Math.PI / 2;
    side.position.set(W - 3 / WV, -H / WV, D);
    this.group.add(side);
    this.slab = [front, side];
  }

  // walls ------------------------------------------------------------
  setWall(wallId) {
    this.wallId = wallId;
    for (const m of this.wallMeshes) { this.group.remove(m); m.geometry.dispose(); }
    this.wallMeshes = [];
    const { W, D } = this;
    const H = WALL_H * WV;
    const seed = hashStr(wallId) % 1000;
    const n = noiseSampler(6, seed + 1, 2, 0.5, 4000, 200);
    const door = this.doorShape();
    const build = (len, isW) => {
      const U = len * WV + (isW ? 0 : 0);
      const depth = new Int16Array(U * H), col = new Uint32Array(U * H);
      const dirt = wallId === 'wall_dirt';
      for (let v = 0; v < H; v++) for (let u = 0; u < U; u++) {
        const q = u + v * U;
        // the N wall runs west→east from the corner; the W wall runs south→north (u = 0 at the room's front)
        const along = isW ? len * WV - 1 - u : u;
        if (isW && door(along, v)) { depth[q] = 0; continue; }
        const jag = dirt && v >= H - 9 ? Math.floor(hash2(along >> 1, isW ? 1 : 0, seed) * 3) : 0;
        if (v >= H - jag) { depth[q] = 0; continue; }
        const [c, rel] = wallVoxel(wallId, along + (isW ? 1000 : 0), v, seed, n);
        let cc = c;
        // a soft contact shadow where the wall meets the floor + darker toward the top corners
        if (v < 6) cc = mulc(cc, 0.75 + v * 0.04);
        depth[q] = Math.max(1, FACE + rel);
        col[q] = cc;
      }
      return { depth, col, U };
    };
    // north wall: along x, face toward +z
    const nw = build(W, false);
    const mN = reliefMesh(nw.depth, nw.col, nw.U, H, { scale: 1 / WV, view: ISO_BACK });
    mN.position.set(0, 0, -FACE / WV + 0.0);
    // west wall: along z, face toward +x; local x runs from the room's front (z = D) to the corner
    const ww = build(D, true);
    const mW = reliefMesh(ww.depth, ww.col, ww.U, H, { scale: 1 / WV, view: viewForYaw(Math.PI / 2) });
    mW.rotation.y = Math.PI / 2;
    mW.position.set(-FACE / WV, 0, D);
    // corner post and earthy caps on the cut ends at the front
    const post = new VoxelGrid(16, H, 16);
    post.box(0, 0, 0, 16, H, 16, beam(0x4a2e1a, 'y', seed));
    for (const y of [12, H - 20]) post.box(0, y, 0, 16, 3, 16, C.iron);
    const pm = withView(ISO_BACK, () => M32(post, [8, 0, 8]));
    const earth = (x, y, z) => mulc(y % 9 < 2 ? 0x2e2016 : 0x3a281a, sp3(x, y, z, 2, 0.12, 0.18));
    const capW = new VoxelGrid(FACE + 2, H, 2);
    capW.box(0, 0, 0, FACE + 2, H, 2, earth);
    const em = withView(ISO_BACK, () => M32(capW, [0, 0, 0]));
    em.position.set(-FACE / WV - 1 / WV, 0, D);
    const capN = new VoxelGrid(2, H, FACE + 2);
    capN.box(0, 0, 0, 2, H, FACE + 2, earth);
    const em2 = withView(ISO_BACK, () => M32(capN, [0, 0, 0]));
    em2.position.set(W, 0, -FACE / WV - 1 / WV);
    for (const m of [mN, mW, pm, em, em2]) { this.group.add(m); this.wallMeshes.push(m); }
    // bake a little light falloff toward the top (cozy dark ceiling) into the wall colors
    for (const m of [mN, mW]) {
      m.updateMatrixWorld(true);
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      bakeLighting(g, this.bakeLights || [], { ambient: (x, y, z, nx, ny, nz, out) => { const k = y > 2.1 ? Math.max(0.62, 1 - (y - 2.1) * 0.42) : 1; out[0] = k; out[1] = k * 0.98; out[2] = k * 0.96; } });
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
    const wd0 = 0x8a5a32, dk = 0x5a3a20;
    const cx = 23, r = 21, base = 30;
    const st = stone(0x7a7470, { seed: 4 });
    for (let y = 0; y < 62; y++) for (let x = 0; x < 46; x++) {
      const dx = x + 0.5 - cx;
      const inArch = y < base ? Math.abs(dx) <= r + 2 : dx * dx + (y - base) ** 2 <= (r + 3) ** 2;
      const inDoor = y < base ? Math.abs(dx) <= r - 2 : dx * dx + (y - base) ** 2 <= (r - 2) ** 2;
      if (inArch && !inDoor) {
        const a = Math.atan2(y - base, dx);
        const seam = y >= base && Math.abs(((a / Math.PI) * 9) % 1) < 0.1;
        for (let z = 2; z < 8; z++) g.set(x, y, z, seam ? 0x4a4038 : st(x, y, z));
      }
      if (inDoor) {
        const pl = Math.floor((x + 2) / 7);
        const c = (x + 2) % 7 === 0 ? mulc(wd0, 0.66) : mulc(wd0, 0.88 + Math.floor(hash2(pl, 3, 7) * 3) * 0.07);
        g.set(x, y, 3, c); g.set(x, y, 4, c);
      }
    }
    // iron straps with rivets, hinges, a brass knob and a round glowing window
    for (const y of [10, 34]) for (let x = 5; x < 26; x++) { g.set(x, y, 5, C.iron); g.set(x, y + 1, 5, x % 5 === 0 ? C.ironL : C.iron); }
    g.box(33, 22, 5, 3, 3, 2, C.brass); g.set(34, 23, 7, 0xffe08a);
    g.ellipsoid(cx, 41, 6, 6, 6, 1, 0x3a2a1a);
    glow.ellipsoid(cx, 41, 6.5, 4.4, 4.4, 0.8, (x, y) => (Math.abs(x + 0.5 - cx) < 0.8 || Math.abs(y + 0.5 - 41) < 0.8 ? -1 : y > 41 ? 0xffe0a0 : 0xffc060));
    for (let k = -4; k <= 4; k++) { g.set(cx, 41 + k, 7, 0x6a4a2a); g.set(cx + k, 41, 7, 0x6a4a2a); }
    // step
    g.box(0, 0, 7, 46, 2, 5, st);
    const m = withView(viewForYaw(Math.PI / 2), () => group(M32(g, [23, 0, 2]), G32(glow, [23, 0, 2])));
    m.rotation.y = Math.PI / 2; // face +x
    m.position.set(-0.1, 0, this.door.z + 0.5);
    this.group.add(m);
    // doormat
    const mat = new VoxelGrid(24, 1, 32);
    mat.box(0, 0, 0, 24, 1, 32, (x, y, z) => ((x + z) % 6 < 3 ? 0x9a6a3a : 0xb08048));
    for (let z = 0; z < 32; z += 2) { mat.set(0, 0, z, 0xd8b878); mat.set(23, 0, z, 0xd8b878); }
    const mm = M32(mat, [0, 0, 16]);
    mm.position.set(0.15, 0.0, this.door.z + 0.5);
    this.group.add(mm);
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
    this.group.add(fm);
    this.poster = { x0: 1, x1: 2, cx, cy };
  }

  /** Roots, dried herbs, a high ledge of jars and pots, sconces: wall details that never move. */
  buildDecor() {
    const { W, D } = this;
    const rng = makeRng(W * 13 + D);
    const top = WALL_H - 0.02;
    // hanging roots
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
    for (let i = 0; i < Math.round(W * 0.7); i++) {
      const x = 0.6 + rng() * (W - 1.2);
      if (posterSkip(x)) continue;
      const len = 0.25 + rng() * 0.5;
      const m = withView(ISO_BACK, () => root(len, i + 1));
      m.position.set(x, top, 0.12 + rng() * 0.06);
      this.group.add(m);
    }
    for (let i = 0; i < Math.round(D * 0.6); i++) {
      const z = 0.6 + rng() * (D - 1.2);
      if (Math.abs(z - (this.door.z + 0.5)) < 1.2) continue;
      const len = 0.25 + rng() * 0.45;
      const m = withView(viewForYaw(Math.PI / 2), () => root(len, 40 + i));
      m.rotation.y = Math.PI / 2;
      m.position.set(0.12 + rng() * 0.06, top, z);
      this.group.add(m);
    }
    // a high ledge along the north wall with jars, pots, a candle and a book stack
    const ledgeLen = Math.max(2, W - 4.5);
    const L = Math.round(ledgeLen * 32);
    const lg = new VoxelGrid(L, 40, 12);
    const lglow = new VoxelGrid(L, 40, 12);
    const Y0 = 9; // the shelf board; brackets hang below it, jars stand on it
    lg.box(0, Y0, 0, L, 3, 10, wood(0x6a4226, { axis: 'x', across: 'z', pw: 99, seed: 9 }));
    for (let bx = 6; bx < L; bx += 38) line(lg, [[bx, Y0, 1], [bx, 1, 1], [bx, Y0, 8]], 0.9, C.iron);
    const jarCols = [0xd8a040, 0x8ab84a, 0xc84a3a, 0x9a6ad0, 0x6ac8e0, 0xe8e0c8];
    let x = 4;
    let k = 0;
    const B = Y0 + 3;
    while (x < L - 10) {
      const kind = Math.floor(hash2(k, 1, 21) * 5);
      if (kind === 0) { // glass jar with contents and a cloth lid
        const c = jarCols[k % jarCols.length];
        ring(lg, x + 4, 5, 0, 3.6, B, B + 10, (xx, y, z) => (y < B + 7 ? (h3(xx, y, z, k) < 0.15 ? mulc(c, 1.15) : c) : 0xd8ecf0));
        ring(lg, x + 4, 5, 0, 4.2, B + 10, B + 12, k % 2 ? 0xc84a3a : 0xe8dcc0);
        lg.set(x + 2, B + 6, 9, 0xffffff);
        x += 10;
      } else if (kind === 1) { // clay pot with a sprig
        ring(lg, x + 4, 5, 0, 4, B, B + 7, 0xb8603a); ring(lg, x + 4, 5, 0, 3, B + 7, B + 9, 0xc8704a); ring(lg, x + 4, 5, 0, 2.2, B + 8, B + 9, 0x3a2a1a);
        lg.set(x + 4, B + 10, 5, 0x5aa84a); lg.set(x + 5, B + 11, 5, 0x6ab84a); lg.set(x + 3, B + 11, 4, 0x4a8a3a);
        x += 10;
      } else if (kind === 2) { // books leaning
        for (let b = 0; b < 4; b++) lg.box(x + b * 2, B, 2, 2, 10 + (b % 2) * 2, 7, [0x8a3a2a, 0x3a5a8a, 0x5a8a3a, 0xe0b040][b]);
        x += 11;
      } else if (kind === 3) { // candle on a dish
        ring(lg, x + 3, 5, 0, 3, B, B + 1, 0xa8a8b0); lg.box(x + 2, B + 1, 4, 2, 6, 2, 0xf0e8d0);
        lglow.set(x + 2, B + 7, 4, 0xffd060); lglow.set(x + 2, B + 8, 4, 0xfff0a0);
        x += 9;
      } else { // a bowl of mushrooms
        ring(lg, x + 4, 5, 0, 4.5, B, B + 3, 0x8a6a48);
        for (let j = 0; j < 3; j++) lg.ellipsoid(x + 2 + j * 2, B + 4, 4 + (j % 2) * 2, 1.8, 1.2, 1.8, j % 2 ? 0xe0c8a0 : 0xc87a5a);
        x += 11;
      }
      x += 3 + Math.floor(hash2(k, 2, 22) * 6);
      k++;
    }
    const ledge = withView(ISO_BACK, () => group(M32(lg, [0, 0, 0]), G32(lglow, [0, 0, 0])));
    ledge.position.set(3.6, 2.42 - 9 / 32, 0.04);
    this.group.add(ledge);
    // dried herb bundles on a string along the west wall
    const herbs = new VoxelGrid(6, 4, 88);
    line(herbs, [[2, 3, 0], [2, 1, 44], [2, 3, 87]], 0.5, 0xc8b890);
    const hg = new THREE.Group();
    hg.add(withView(viewForYaw(Math.PI / 2), () => M32(herbs, [2, 3, 0])));
    const herbCols = [[0x6a8a3a, 0x8aa84a], [0x9a6aa8, 0x6a8a3a], [0xc8a040, 0x7a8a3a], [0xa84a3a, 0x6a7a3a], [0x5a8a5a, 0xc8d890]];
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
      bm.position.set(0, 0.06 - (j % 2) * 0.05, 0.25 + j * 0.62);
      hg.add(bm);
    }
    hg.position.set(0.2, 2.62, 0.75);
    this.group.add(hg);
    // two wall sconces
    this.sconces = [];
    const sconce = (wx, wz, rotY) => {
      const sg = new VoxelGrid(14, 26, 18);
      const sgl = new VoxelGrid(14, 26, 18);
      const ir = iron(0x2e2e36, 2);
      sg.box(4, 14, 0, 6, 8, 2, ir);
      line(sg, [[7, 18, 1], [7, 18, 11], [7, 16, 13]], 0.8, ir);
      sg.box(2, 0, 7, 11, 2, 11, ir); sg.box(2, 15, 7, 11, 2, 11, ir); sg.box(4, 17, 9, 7, 1, 7, ir);
      for (const [x, z] of [[2, 7], [12, 7], [2, 17], [12, 17]]) sg.box(x, 2, z, 1, 13, 1, ir);
      sgl.box(3, 2, 8, 9, 13, 9, (x, y) => (y > 9 ? 0xffd890 : 0xffb24a));
      sgl.box(6, 5, 11, 3, 5, 3, 0xfff2c0);
      const grp = withView(viewForYaw(rotY), () => group(M32(sg, [7, 0, 0]), G32(sgl, [7, 0, 0])));
      grp.position.set(wx, 2.1, wz);
      grp.rotation.y = rotY;
      this.group.add(grp);
      const fwd = rotY === 0 ? [0, 0.4] : [0.4, 0];
      this.sconces.push({ x: wx + fwd[0], y: 2.34, z: wz + fwd[1] });
    };
    sconce(Math.min(W - 1.5, 3.55), 0.06, 0);
    sconce(0.06, Math.max(1.5, Math.min(D - 3.4, 4.2)), Math.PI / 2);
  }

  dispose() {
    disposeTextures(this.floor?.tex);
  }
}

export { HTPX };

// Your bedroom's shell, up the steps from Old Star's house: four full walls of lime plaster in a
// timber frame over a painted wainscot, and a boarded ceiling (1/64 m voxel reliefs with every face
// meshed), the painted floor, corner posts, the round crystal window, the doorway down to the house
// in the north wall, old tunnel mouths, the Surface Express poster, its own little hearth with a
// fire in the south wall (where Old Star sits when you wake), a high ledge of jars, herbs, sconces,
// hanging lanterns, a string of paper lanterns and the build bench. Static dressing is merged into
// a few draw calls with the fixed lights baked into its colors. Built in tile units inside `room`
// (scaled to meters); merged meshes go to `world` (meters).
import * as THREE from 'three';
import { pixelTexture } from '../gfx/PixelArt.js';
import { hashStr } from '../core/util.js';
import { posterCanvas } from '../iso/pixel.js';
import { VoxelGrid, C, wood, iron, line, ring, M32, G32, group, mulc, h3 } from '../iso/kit.js';
import { hash2, noiseSampler, disposeTextures } from '../iso/surface.js';
import { paintHomeFloor, repaintHomeTile } from '../iso/homeFloor.js';
import { bakeLighting } from '../iso/bake.js';
import { Batch, keepUnbatched } from '../iso/vox.js';
import { WINDOW_SLOTS, POSTER_SLOTS, HEARTH_X, benchTiles } from '../iso/homeLayout.js';
import { bedroomHearth } from './houseProps.js';
import { hangingLantern } from '../iso/props.js';
import { meshReliefTex, reliefTexture } from './relief.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { wallVoxel, wallDetail, nearestPost, ceilVoxel } from './walls.js';
import { T, VPT, CEIL, WALL_V, FACE, MOUTH_HW, ARCH } from './units.js';
import { inMouth, WINDOW, MOUTH_LANTERN, crystalWindow, tunnelMouth, cornerPost, buildBench } from './props.js';
import { ShellBase, CT, texturedToon, mergeIndexed, packShellSurfaces } from './shellSurf.js';
import { unquantize, CSCALE } from './pack.js';


export class HomeShell extends ShellBase {

  /**
   * opts: { tunnels: [{wall, t}], surf: packed walls and ceiling (packShellSurfaces, from a build
   * worker) or null to build them here }
   */
  async build(W, D, wallId, floorMap, opts) {
    const t0 = performance.now();
    const steps = {};
    let busy = 0;
    const step = (name, fn) => { const a = performance.now(); fn(); steps[name] = Math.round(performance.now() - a); busy += steps[name]; };
    this.plan(W, D, opts);
    step('floor', () => this.buildFloor(floorMap));
    this.decor = new THREE.Group();
    this.room.add(this.decor);
    step('window', () => this.buildWindow());
    step('poster', () => this.buildPoster());
    step('dressing', () => this.buildDressing());
    step('hearth', () => this.buildHearth());
    step('tunnels', () => this.buildTunnels());
    step('merge', () => this.mergeDecor());
    // the walls and ceiling: packed from a build worker (opts.surf, a promise), or made here
    const surf = opts.surf ? await opts.surf.catch((e) => { console.warn('[home] your room\'s walls failed to build away, building them here', e); return null; }) : null;
    if (surf) step('walls', () => this.useSurfaces(wallId, surf));
    else {
      step('walls', () => this.setWall(wallId));
      step('ceiling', () => this.buildCeiling());
    }
    this.steps = steps;
    this.ms = busy;
    void t0;
  }


  /** Place an object on a wall (local x along the wall, z into the room). */
  onWall(obj, wall, a, y = 0, out = 0) {
    const p = this.wallPose(wall, a);
    obj.rotation.y = p.yaw;
    obj.position.set(p.x + Math.sin(p.yaw) * out, y, p.z + Math.cos(p.yaw) * out);
    return obj;
  }

  // ------------------------------------------------------------ floor
  buildFloor(floorMap) {
    const { W, D } = this;
    const t0 = performance.now();
    this.floor = paintHomeFloor(W, D, floorMap);
    this.floorMs = performance.now() - t0;
    const tex = this.floor.tex;
    for (const t of [tex.map, tex.normalMap]) { t.generateMipmaps = true; t.minFilter = THREE.NearestMipmapNearestFilter; t.needsUpdate = true; }
    const rects = [[0, 0, W, D]];
    const pos = [], uv = [], nor = [], idx = [];
    for (const [x0, z0, x1, z1] of rects) {
      if (x1 <= x0 || z1 <= z0) continue;
      const b = pos.length / 3;
      for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) { pos.push(x, 0, z); uv.push(x / W, 1 - z / D); nor.push(0, 1, 0); }
      idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.MeshPhongMaterial({ map: tex.map, normalMap: tex.normalMap, specularMap: tex.specularMap, specular: 0x8a7e70, shininess: 24 });
    const m = new THREE.Mesh(geo, mat);
    this.room.add(m);
    this.floorMesh = m;
  }

  paintTile(x, y, id) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.D) return;
    repaintHomeTile(this.floor.S, this.floor.tex, x, y, id);
  }


  /** Walls and ceiling from packed meshes (packShellSurfaces). */
  useSurfaces(wallId, surf) {
    this.wallId = wallId;
    for (const p of surf) {
      const mesh = unquantize(p.q, texturedToon(reliefTexture(p.tex.data, p.tex.w, p.tex.h), p.glow, CSCALE));
      mesh.layers.enable(LAYER_OUTLINE);
      mesh.userData.room = 'bedroom';
      this.world.add(mesh);
      if (p.name === 'walls') this.wallMesh = mesh; else this.ceilMesh = mesh;
    }
  }

  // ------------------------------------------------------------ window, poster
  buildWindow() {
    const cw = crystalWindow(3);
    const grp = group(cw.obj, cw.pocket);
    this.onWall(grp, 'w', WINDOW_SLOTS[0] + 0.5);
    this.decor.add(grp);
  }

  buildPoster() {
    const pc = posterCanvas();
    const tex = pixelTexture(pc.commit());
    const pw = pc.w / 34, ph = pc.h / 34;
    const cx = (POSTER_SLOTS[0] + POSTER_SLOTS[POSTER_SLOTS.length - 1] + 1) / 2, cy = 2.75;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshLambertMaterial({ map: tex }));
    plane.position.set(cx, cy, 0.075);
    this.room.add(plane);
    // chunky wooden frame with brass corners
    const fw = Math.round(pw * 32) + 8, fh = Math.round(ph * 32) + 8;
    const g = new VoxelGrid(fw, fh, 3);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (x > 3 && x < fw - 4 && y > 3 && y < fh - 4) continue;
      g.set(x, y, 0, mulc(0x6a4226, 1));
      if (x < 2 || y < 2 || x >= fw - 2 || y >= fh - 2) g.set(x, y, 1, mulc(0x8a5a32, 1));
    }
    for (const [x, y] of [[1, 1], [fw - 3, 1], [1, fh - 3], [fw - 3, fh - 3]]) g.box(x, y, 1, 2, 2, 2, 0xd9a84a);
    const fm = M32(g, [fw / 2, fh / 2, 0]);
    fm.position.set(cx, cy, 0.0);
    this.decor.add(fm);
    this.poster = { cx, cy, w: pw, h: ph };
  }

  // ------------------------------------------------------------ dressing
  buildDressing() {
    const { W, D } = this;
    const add = (m) => { this.decor.add(m); return m; };
    // corner posts
    for (const [x, z] of [[0, 0], [W, 0], [0, D], [W, D]]) {
      const p = cornerPost(WALL_V, x * 3 + z);
      p.position.set(x + (x ? -0.12 : 0.12), 0, z + (z ? -0.12 : 0.12));
      add(p);
    }
    // the high ledge along the north wall: jars, pots, books, candles, a bowl of mushrooms
    this.buildLedge(3.75, Math.max(5.2, W - 1.1), 3.65);
    // dried herbs on a string along the west wall
    this.buildHerbs();
    // sconces
    for (const s of this.sconces) add(this.onWall(sconce(), s.wall, s.a, s.y - 0.27, 0));
    // hanging lanterns from the joists
    for (const [i, l] of this.hanging.entries()) {
      const hl = hangingLantern(l.len, i + 3);
      hl.obj.position.set(l.x, l.top ?? CT - 0.34, l.z);
      add(hl.obj);
    }
    // strings of paper lanterns sagging between joists
    const J = this.joists;
    if (J.length >= 3) this.lightString({ x: J[1], z: D * 0.62 }, { x: J[2], z: D * 0.68 }, 9);
    else if (J.length >= 2) this.lightString({ x: J[0], z: D * 0.62 }, { x: J[1], z: D * 0.68 }, 9);
    // (no roots, cobwebs or fungi: it's a bedroom in a house now)
    this.fungi = [];
    // the build bench against the east wall
    const B = this.bench;
    const bb = buildBench(8);
    bb.rotation.y = -Math.PI / 2;
    bb.position.set(B.x + 0.5, 0, B.y + 1);
    add(bb);
  }

  /** The bedroom's hearth on the south wall: live flames, its light, where Old Star tends it. */
  buildHearth() {
    const { D } = this;
    const h = bedroomHearth(WALL_V, 107);
    this.onWall(h.obj, 's', HEARTH_X);
    // the flames stay live: keep them out of the merge, straight in the room
    for (const f of h.flames) f.userData.noBatch = true;
    this.decor.add(h.obj);
    this.room.updateMatrixWorld(true);
    const fire = new THREE.Vector3(h.fire.x, h.fire.y, h.fire.z).applyMatrix4(h.obj.matrixWorld);
    this.hearth = { x: HEARTH_X * T, z: D * T, fire, update: h.update, flames: h.flames, candles: h.candles.map((c) => new THREE.Vector3(c.x, c.y, c.z).applyMatrix4(h.obj.matrixWorld)) };
    // its collision (meters): the surround and the irons' stand
    this.hearthBoxes = [[HEARTH_X * T - 0.62, 0, D * T - 0.36, HEARTH_X * T + 0.62, CEIL, D * T], [HEARTH_X * T + 0.62, 0, D * T - 0.6, HEARTH_X * T + 0.78, 0.55, D * T - 0.36]];
  }

  buildLedge(x0, x1, y) {
    const L = Math.round((x1 - x0) * 32);
    const lg = new VoxelGrid(L, 40, 14);
    const lglow = new VoxelGrid(L, 40, 14);
    const Y0 = 9;
    lg.box(0, Y0, 0, L, 3, 12, wood(0x6a4226, { axis: 'x', across: 'z', pw: 99, seed: 9 }));
    for (let bx = 6; bx < L; bx += 38) line(lg, [[bx, Y0, 1], [bx, 1, 1], [bx, Y0, 9]], 0.9, C.iron);
    const jarCols = [0xd8a040, 0x8ab84a, 0xc84a3a, 0x9a6ad0, 0x6ac8e0, 0xe8e0c8];
    let x = 4, k = 0;
    const B = Y0 + 3;
    while (x < L - 10) {
      const kind = Math.floor(hash2(k, 1, 21) * 5);
      if (kind === 0) {
        const c = jarCols[k % jarCols.length];
        ring(lg, x + 4, 7, 0, 3.6, B, B + 10, (xx, yy, z) => (yy < B + 7 ? (h3(xx, yy, z, k) < 0.15 ? mulc(c, 1.15) : c) : 0xd8ecf0));
        ring(lg, x + 4, 7, 0, 4.2, B + 10, B + 12, k % 2 ? 0xc84a3a : 0xe8dcc0);
        lg.set(x + 2, B + 6, 10, 0xffffff);
        x += 10;
      } else if (kind === 1) {
        ring(lg, x + 4, 7, 0, 4, B, B + 7, 0xb8603a); ring(lg, x + 4, 7, 0, 3, B + 7, B + 9, 0xc8704a); ring(lg, x + 4, 7, 0, 2.2, B + 8, B + 9, 0x3a2a1a);
        lg.set(x + 4, B + 10, 7, 0x5aa84a); lg.set(x + 5, B + 11, 7, 0x6ab84a); lg.set(x + 3, B + 11, 6, 0x4a8a3a);
        x += 10;
      } else if (kind === 2) {
        for (let b = 0; b < 4; b++) lg.box(x + b * 2, B, 3, 2, 10 + (b % 2) * 2, 8, [0x8a3a2a, 0x3a5a8a, 0x5a8a3a, 0xe0b040][b]);
        x += 11;
      } else if (kind === 3) {
        ring(lg, x + 3, 7, 0, 3, B, B + 1, 0xa8a8b0); lg.box(x + 2, B + 1, 6, 2, 6, 2, 0xf0e8d0);
        lglow.set(x + 2, B + 7, 6, 0xffd060); lglow.set(x + 2, B + 8, 6, 0xfff0a0);
        x += 9;
      } else {
        ring(lg, x + 4, 7, 0, 4.5, B, B + 3, 0x8a6a48);
        for (let j = 0; j < 3; j++) lg.ellipsoid(x + 2 + j * 2, B + 4, 6 + (j % 2) * 2, 1.8, 1.2, 1.8, j % 2 ? 0xe0c8a0 : 0xc87a5a);
        x += 11;
      }
      x += 3 + Math.floor(hash2(k, 2, 22) * 6);
      k++;
    }
    const ledge = group(M32(lg, [0, 0, 0]), G32(lglow, [0, 0, 0]));
    ledge.position.set(x0, y - Y0 / 32, 0.1);
    this.decor.add(ledge);
  }

  buildHerbs() {
    const z0 = 0.3, z1 = Math.min(WINDOW_SLOTS[0] - 0.5, 1.9);
    const n = Math.round((z1 - z0) * 32);
    const herbs = new VoxelGrid(6, 6, n + 2);
    line(herbs, [[2, 4, 0], [2, 1, n / 2], [2, 4, n]], 0.5, 0xc8b890);
    const hg = new THREE.Group();
    hg.add(M32(herbs, [2, 4, 0]));
    const cols = [[0x6a8a3a, 0x8aa84a], [0x9a6aa8, 0x6a8a3a], [0xc8a040, 0x7a8a3a], [0xa84a3a, 0x6a7a3a]];
    const cnt = Math.max(2, Math.floor((z1 - z0) / 0.38));
    for (let j = 0; j < cnt; j++) {
      const b = new VoxelGrid(10, 24, 10);
      const [c1, c2] = cols[j % 4];
      line(b, [[5, 15, 5], [5, 23, 5]], 0.6, 0x7a5a3a);
      for (let y = 0; y < 16; y++) for (let xx = 0; xx < 10; xx++) for (let z = 0; z < 10; z++) {
        const rr = Math.hypot(xx + 0.5 - 5, z + 0.5 - 5);
        if (rr < 1.4 + y * 0.22 && hash2(xx + y * 13, z, j) < 0.6) b.set(xx, y, z, hash2(z, xx + y * 7, j) < 0.5 ? c1 : c2);
      }
      ring(b, 5, 5, 0, 2.2, 15, 17, 0xc94a3a);
      const bm = M32(b, [5, 24, 5]);
      const t = (j + 0.5) / cnt;
      bm.position.set(0, 0.08 - Math.sin(t * Math.PI) * 0.08, t * (z1 - z0));
      hg.add(bm);
    }
    hg.position.set(0.3, CT - 0.75, z0);
    this.decor.add(hg);
  }

  /** A sagging string of small paper lanterns between two joists (voxel bulbs on a twine line). */
  lightString(a, b, seed) {
    const y = CT - 0.36;
    const n = Math.max(6, Math.round(Math.hypot(b.x - a.x, b.z - a.z) * 3.4));
    const cols = [0xffd060, 0xff8a6a, 0x9ae07a, 0x8ac8ff, 0xffa0d0, 0xfff0b0];
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, y - Math.sin(t * Math.PI) * 0.62, a.z + (b.z - a.z) * t));
    }
    // the twine as thin voxel segments
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[i + 1];
      const len = p.distanceTo(q);
      const g = new VoxelGrid(2, 2, Math.max(1, Math.round(len * 32)));
      g.box(0, 0, 0, 2, 2, g.d, (x, yy, z) => (z % 3 === 0 ? 0x4a3422 : 0x2e2016));
      const m = M32(g, [1, 1, 0], { outline: false });
      m.position.copy(p);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), q.clone().sub(p).normalize());
      this.decor.add(m);
    }
    for (let i = 1; i < n; i++) {
      const c = cols[(i + seed) % cols.length];
      // a little round paper lantern: ribbed glowing paper, dark caps, a tassel
      const bg = new VoxelGrid(8, 13, 8);
      bg.ellipsoid(4, 6, 4, 3.6, 3.4, 3.6, (x, yy, z) => (yy % 2 === 0 ? mulc(c, 0.84) : (x + z) % 5 === 0 ? mulc(c, 1.08) : c));
      const cap = new VoxelGrid(8, 13, 8);
      cap.box(2, 9, 2, 4, 1, 4, 0x3a2a22); cap.box(3, 10, 3, 2, 2, 2, 0x2a1a12);
      cap.box(2, 2, 2, 4, 1, 4, 0x3a2a22); cap.box(3, 0, 3, 2, 2, 2, c === 0xfff0b0 ? 0xc94a3a : 0xd8b048);
      const m = group(G32(bg, [4, 12, 4]), M32(cap, [4, 12, 4]));
      m.position.copy(pts[i]);
      this.decor.add(m);
      if (i % 2) (this.extraBake ||= []).push({ x: pts[i].x * T, y: (pts[i].y - 0.15) * T, z: pts[i].z * T, color: c, power: 0.3, radius: 0.7 });
    }
    (this.strings ||= []).push(pts.map((p) => ({ x: p.x, y: p.y, z: p.z })));
  }

  // ------------------------------------------------------------ old tunnels
  buildTunnels() {
    for (const tn of this.tunnelInfo) {
      const tm = tunnelMouth(tn.seed);
      this.onWall(tm.obj, tn.wall, tn.t);
      this.decor.add(tm.obj);
    }
  }

  // ------------------------------------------------------------ merge
  mergeDecor() {
    this.room.updateMatrixWorld(true);
    const batch = new Batch(64);
    this.decor.updateMatrixWorld(true);
    batch.add(this.decor);
    const lights = this.bakeLightsM();
    const amb = this.ambientM();
    this.decorMeshes = batch.build(this.world, null, { bake: (g) => bakeLighting(g, lights, { ambient: amb, max: 2.2 }) });
    keepUnbatched(this.decor, this.world);
    this.room.remove(this.decor);
  }

  /** Every light in meters for the scene's light pool. */
  lightsM() {
    return this.lightsT.map((l) => ({ ...l, x: l.x * T, y: l.y * T, z: l.z * T }));
  }

  dispose() {
    disposeTextures(this.floor?.tex);
  }
}

/** A wall sconce: an iron cage holding a candle-lit glass box (local, on the wall face). */
function sconce() {
  const sg = new VoxelGrid(14, 26, 18);
  const sgl = new VoxelGrid(14, 26, 18);
  const ir = iron(0x2e2e36, 2);
  sg.box(4, 14, 0, 6, 8, 2, ir);
  line(sg, [[7, 18, 1], [7, 18, 11], [7, 16, 13]], 0.8, ir);
  sg.box(2, 0, 7, 11, 2, 11, ir); sg.box(2, 15, 7, 11, 2, 11, ir); sg.box(4, 17, 9, 7, 1, 7, ir);
  for (const [xx, z] of [[2, 7], [12, 7], [2, 17], [12, 17]]) sg.box(xx, 2, z, 1, 13, 1, ir);
  sgl.box(3, 2, 8, 9, 13, 9, (xx, y) => (y > 9 ? 0xffd890 : 0xffb24a));
  sgl.box(6, 5, 11, 3, 5, 3, 0xfff2c0);
  return group(M32(sg, [7, 0, 0]), G32(sgl, [7, 0, 0]));
}

export { mergeIndexed, CT, packShellSurfaces };

// The first-person burrow's shell: four full walls and a boarded ceiling (1/64 m voxel reliefs with
// every face meshed), the painted floor, corner posts, the door to town, the crystal window, tunnel
// mouths on any wall, the Surface Express poster, a high ledge of jars, herbs, sconces, hanging
// lanterns, strings of paper lanterns between the joists, roots, cobwebs, glowing bracket fungi,
// the build bench and the hole the mole fell through. Static dressing is merged into a few draw
// calls with the fixed lights baked into its colors. Built in tile units inside `room` (scaled to
// meters); merged meshes go to `world` (meters).
import * as THREE from 'three';
import { pixelTexture } from '../gfx/PixelArt.js';
import { makeRng, hashStr } from '../core/util.js';
import { posterCanvas } from '../iso/pixel.js';
import { VoxelGrid, C, wood, iron, line, ring, M32, G32, group, mulc, mixc, h3 } from '../iso/kit.js';
import { hash2, noiseSampler, disposeTextures } from '../iso/surface.js';
import { paintHomeFloor, repaintHomeTile } from '../iso/homeFloor.js';
import { bakeLighting } from '../iso/bake.js';
import { Batch, keepUnbatched } from '../iso/vox.js';
import { WINDOW_SLOTS, POSTER_SLOTS, liftTiles, benchTiles } from '../iso/homeLayout.js';
import { cobweb } from '../iso/homeDecor.js';
import { hangingLantern } from '../iso/props.js';
import { meshReliefTex, reliefTexture } from './relief.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { wallVoxel, wallDetail, nearestPost, ceilVoxel, PLATE } from './walls.js';
import { T, VPT, CEIL, WALL_V, FACE, MOUTH_HW, DOOR_HW } from './units.js';
import { inDoor, inMouth, WINDOW, MOUTH_LANTERN, townDoor, doorRubble, crystalWindow, tunnelMouth, cornerPost, buildBench, holeShaft, brokenBoards, hangingRoot, wallFungi } from './props.js';

const CT = CEIL / T; // ceiling height in tiles
const HOLE_R = 0.86; // tiles
const S32 = 1 / 32;

export class HomeShell {
  /** room: the tile-unit group (scaled by T); world: the meters scene. */
  constructor(room, world) {
    this.room = room;
    this.world = world;
    this.wallMesh = null;
    this.toDispose = [];
  }

  /** opts: { tunnels: [{wall, t}], doorOpen, hole: {x, z} } */
  build(W, D, wallId, floorMap, opts) {
    const t0 = performance.now();
    this.W = W;
    this.D = D;
    this.opts = opts;
    this.tunnels = opts.tunnels || [];
    this.hole = opts.hole;
    this.door = { z: D - 1.5 }; // door centre on the west wall (tiles)
    this.lift = liftTiles(W, D);
    this.bench = benchTiles(W, D);
    const steps = {};
    const step = (name, fn) => { const a = performance.now(); fn(); steps[name] = Math.round(performance.now() - a); };
    this.planJoists();
    this.planLights();
    step('floor', () => this.buildFloor(floorMap));
    step('walls', () => this.setWall(wallId));
    step('ceiling', () => this.buildCeiling());
    this.decor = new THREE.Group();
    this.room.add(this.decor);
    step('door', () => this.buildDoor());
    step('window', () => this.buildWindow());
    step('poster', () => this.buildPoster());
    step('dressing', () => this.buildDressing());
    step('tunnels', () => this.buildTunnels());
    step('hole', () => this.buildHole());
    step('merge', () => this.mergeDecor());
    this.steps = steps;
    this.ms = performance.now() - t0;
  }

  // ------------------------------------------------------------ planning
  /** Joists across the ceiling (x in tiles), clear of the hole and the lift's pulley opening. */
  planJoists() {
    const { W } = this, hx = this.hole.x, lx = this.lift.x + 1;
    const xs = [];
    for (let x = hx - 1.2; x > 0.7; x -= 2.4) xs.push(x);
    for (let x = hx + 1.2; x < W - 0.7; x += 2.4) xs.push(x);
    this.joists = xs.filter((x) => Math.abs(x - lx) > 0.8).sort((a, b) => a - b);
  }

  /** Fixed lights (meters): sconces, hanging lanterns, the window, tunnel lanterns, the hole. */
  planLights() {
    const { W, D } = this;
    const sy = 2.75;
    this.sconceSpots = [
      { wall: 'n', a: 3.55 }, { wall: 'w', a: Math.max(3.4, Math.min(D - 2.7, 4.3)) },
      { wall: 's', a: Math.round(W / 2) - 0.5 }, { wall: 'e', a: Math.min(D - 2.6, 4.9) },
    ];
    this.sconces = this.sconceSpots.map((s) => { const p = this.wallPoint(s.wall, s.a, 0.42); return { x: p.x, y: sy, z: p.z, wall: s.wall, a: s.a }; });
    const near = (v) => this.joists.slice().sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0];
    this.hanging = [];
    const j1 = near(W * 0.72), j2 = near(W * 0.28);
    if (j1 !== undefined) this.hanging.push({ x: j1, z: D * 0.32, len: 0.55 });
    if (j2 !== undefined && j2 !== j1) this.hanging.push({ x: j2, z: D * 0.7, len: 0.7 });
    this.windowLight = { x: 0.45, y: WINDOW.cy / 32, z: WINDOW_SLOTS[0] + 0.5 };
    this.lanterns = [];
    this.tunnelInfo = this.tunnels.map((tn) => {
      const p = this.wallPose(tn.wall, tn.t);
      const seed = Math.floor(tn.t * 7) + tn.wall.charCodeAt(0);
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw), L = MOUTH_LANTERN;
      const lantern = { x: p.x + L.x * c + L.z * s, y: L.y, z: p.z - L.x * s + L.z * c };
      this.lanterns.push(lantern);
      return { ...tn, pose: p, seed, lantern };
    });
    // every light in tiles; converted to meters when baked / handed to the scene
    this.lightsT = [
      ...this.sconces.map((l) => ({ ...l, kind: 'sconce', color: 0xffb860 })),
      ...this.hanging.map((l) => ({ x: l.x, y: CT - 0.35 - l.len - 0.3, z: l.z, kind: 'hanging', color: 0xffb060 })),
      { ...this.windowLight, kind: 'window', color: 0x6ad8ff },
      { x: this.hole.x, y: CT - 0.4, z: this.hole.z, kind: 'hole', color: 0xfff0d0 },
      ...this.lanterns.map((l) => ({ ...l, kind: 'lantern', color: 0xffb050 })),
    ];
    if (this.opts.doorOpen) this.lightsT.push({ x: 0.3, y: 2.4, z: this.door.z, kind: 'lantern', color: 0xffc070 });
  }

  /** Point on the floor plan in front of a wall at `a` tiles along it, `out` tiles into the room. */
  wallPoint(wall, a, out = 0) {
    const { W, D } = this;
    if (wall === 'n') return { x: a, z: out };
    if (wall === 's') return { x: a, z: D - out };
    if (wall === 'w') return { x: out, z: a };
    return { x: W - out, z: a };
  }

  /** Transform of a wall spot: position on the wall face (tiles) + yaw so local +z points into the room. */
  wallPose(wall, t) {
    const { W, D } = this;
    if (wall === 'n') return { x: t, z: 0, yaw: 0 };
    if (wall === 'w') return { x: 0, z: t, yaw: Math.PI / 2 };
    if (wall === 's') return { x: t, z: D, yaw: Math.PI };
    return { x: W, z: t, yaw: -Math.PI / 2 };
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
    // the floor minus the lift's pit
    const L = this.lift;
    const rects = [[0, 0, W, L.y], [0, L.y, L.x, D]];
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

  // ------------------------------------------------------------ walls
  /** Openings cut through a wall: [{ c (voxels along), hw (voxels), test(du, v) }]. */
  openings(wall) {
    const out = [];
    if (wall === 'w') {
      out.push({ c: this.door.z * VPT, hw: DOOR_HW * 64 + 8, test: (du, v) => inDoor(du, v) });
      const wc = (WINDOW_SLOTS[0] + 0.5) * VPT;
      out.push({ c: wc, hw: WINDOW.r + 7, test: (du, v) => Math.hypot(du, v + 0.5 - WINDOW.cy) <= WINDOW.r + 0.5 });
    }
    for (const tn of this.tunnelInfo) if (tn.wall === wall) out.push({ c: tn.t * VPT, hw: MOUTH_HW * 64 + 16, test: (du, v) => inMouth(du, v, tn.seed) });
    return out;
  }

  setWall(wallId) {
    this.wallId = wallId;
    if (this.wallMesh) { this.world.remove(this.wallMesh); this.wallMesh.geometry.dispose(); this.wallMesh.material.map?.dispose(); this.wallMesh.material.dispose(); this.wallMesh = null; }
    const { W, D } = this;
    const seed = hashStr(wallId) % 1000;
    const n = noiseSampler(6, seed + 1, 2, 0.5, 4000, 200);
    const H = WALL_V;
    const geos = [];
    const L = this.lift;
    const TW = Math.max(W, D) * VPT, TH = H * 4;
    const tex = new Uint8Array(TW * TH * 4);
    const bake = this.texelBaker();
    const walls = ['n', 'w', 's', 'e'];
    walls.forEach((wall, wi) => {
      const len = wall === 'n' || wall === 's' ? W : D;
      const U = len * VPT;
      const ops = this.openings(wall);
      // timber posts: under the joists on the long walls, evenly spaced on the short ones
      let posts;
      if (wall === 'n' || wall === 's') posts = this.joists.map((x) => x * VPT);
      else { const k = Math.max(1, Math.round(U / 80)); posts = Array.from({ length: k - 1 }, (_, i) => ((i + 1) * U) / k); }
      posts = posts.filter((p) => p > 16 && p < U - 16 && !ops.some((o) => Math.abs(p - o.c) < o.hw + 6));
      if (wall === 's') posts = posts.filter((p) => p < L.x * VPT - 8);
      if (wall === 'e') posts = posts.filter((p) => p < L.y * VPT - 8);
      const depth = new Int16Array(U * H);
      const ws = seed + wall.charCodeAt(0) * 3;
      const nrm = { n: [0, 0, 1], s: [0, 0, -1], w: [1, 0, 0], e: [-1, 0, 0] }[wall];
      for (let v = 0; v < H; v++) for (let u = 0; u < U; u++) {
        const q = u + v * U;
        const along = wall === 'n' || wall === 'e' ? u : U - 1 - u;
        let hole = false, nearHole = 99;
        for (const o of ops) {
          const du = along + 0.5 - o.c;
          if (Math.abs(du) > o.hw + 8) continue;
          if (o.test(du, v)) { hole = true; break; }
          nearHole = Math.min(nearHole, Math.abs(Math.abs(du) - (o.hw - 16)));
        }
        if (hole) { depth[q] = 0; continue; }
        const post = posts.length ? nearestPost(posts, along) : null;
        const [c, rel, kind] = wallVoxel(wallId, along, v, ws, n, post);
        let cc = wallDetail(wallId, along, v, c, ws, rel, kind);
        if (v < 7) cc = mulc(cc, 0.72 + v * 0.04); // contact shadow where the wall meets the floor
        if (nearHole < 5 && v < 72 && hash2(along >> 1, v >> 1, ws + 3) < 0.35) cc = mulc(cc, 0.78);
        depth[q] = Math.max(1, FACE + rel);
        // the texel, lit by the baked ambient and the fixed lamps (meters on the wall face)
        const a = along / 64, y = v / 64;
        const wx = wall === 'n' || wall === 's' ? a : wall === 'w' ? 0.02 : W * T - 0.02;
        const wz = wall === 'w' || wall === 'e' ? a : wall === 'n' ? 0.02 : D * T - 0.02;
        const k = bake(wx, y + 0.008, wz, nrm[0], nrm[1], nrm[2]);
        const o = ((v + wi * H) * TW + u) * 4;
        tex[o] = Math.min(255, ((cc >> 16) & 255) * k[0]); tex[o + 1] = Math.min(255, ((cc >> 8) & 255) * k[1]); tex[o + 2] = Math.min(255, (cc & 255) * k[2]); tex[o + 3] = 255;
      }
      const geo = meshReliefTex(depth, U, H, { scale: S32, texW: TW, vOff: wi * H, vTotal: TH });
      if (!geo) return;
      const m = new THREE.Matrix4();
      const rot = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[wall];
      const pos = { n: [0, 0, -FACE * S32], s: [W, 0, D + FACE * S32], w: [-FACE * S32, 0, D], e: [W + FACE * S32, 0, 0] }[wall];
      m.makeRotationY(rot).setPosition(...pos);
      geo.applyMatrix4(m);
      geos.push(geo);
    });
    const merged = mergeIndexed(geos);
    merged.applyMatrix4(new THREE.Matrix4().makeScale(T, T, T));
    const mesh = new THREE.Mesh(merged, voxelMaterial('toon', { map: reliefTexture(tex, TW, TH), unique: true }));
    mesh.layers.enable(LAYER_OUTLINE);
    this.world.add(mesh);
    this.wallMesh = mesh;
  }

  /**
   * Light for a texel of a wall or the ceiling (meters, face normal): the baked ambient times the
   * fixed lamps' soft glow, as an [r, g, b] multiplier.
   */
  texelBaker() {
    const amb = this.ambientM();
    const L = this.bakeLightsM().map((l) => { const c = new THREE.Color(l.color); return { ...l, r: c.r * l.power, g: c.g * l.power, b: c.b * l.power }; });
    const out = [1, 1, 1], a = [1, 1, 1];
    return (x, y, z, nx, ny, nz) => {
      amb(x, y, z, nx, ny, nz, a);
      let r = a[0], g = a[1], b = a[2];
      for (const l of L) {
        const dx = l.x - x, dy = l.y - y, dz = l.z - z;
        const d2 = dx * dx + dy * dy + dz * dz, r2 = l.radius * l.radius;
        if (d2 >= r2) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const w = ((dx * nx + dy * ny + dz * nz) / d) * 0.65 + 0.35;
        if (w <= 0) continue;
        const t = 1 - d2 / r2, f = t * t * w;
        r += l.r * f; g += l.g * f; b += l.b * f;
      }
      out[0] = Math.min(2.2, r); out[1] = Math.min(2.2, g); out[2] = Math.min(2.2, b);
      return out;
    };
  }

  // ------------------------------------------------------------ ceiling
  buildCeiling() {
    const { W, D } = this;
    const U = W * VPT, V = D * VPT, F = 8;
    const seed = 31;
    const depth = new Int16Array(U * V);
    const tex = new Uint8Array(U * V * 4);
    const bake = this.texelBaker();
    const jo = this.joists.map((x) => x * VPT);
    const hx = this.hole.x * VPT, hz = this.hole.z * VPT, hr = HOLE_R * VPT;
    const L = this.lift, lx = (L.x + 1) * VPT, lz = (L.y + 1) * VPT;
    for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
      const q = u + v * U;
      // the hole: ragged, with board ends snapping at different lengths
      const dh = Math.hypot(u + 0.5 - hx, v + 0.5 - hz);
      const rag = (hash2(Math.floor(v / 10), 7, 3) - 0.5) * 9 + (hash2(u >> 2, v >> 2, 5) - 0.5) * 3;
      if (dh < hr + rag) { depth[q] = 0; continue; }
      // the drum opening over the lift: a square with a timber trim
      const ax = Math.abs(u + 0.5 - lx), az = Math.abs(v + 0.5 - lz);
      let c, rel;
      if (ax < 15 && az < 15) { depth[q] = 0; continue; }
      if (ax < 20 && az < 20) { rel = 9; c = (ax > 18.5 || az > 18.5) ? 0x3e2616 : mulc(0x6a4428, 0.94 + ((u + v) % 3) * 0.03); }
      else {
        [c, rel] = ceilVoxel(u, v, seed, jo);
        if (dh < hr + 14 && rel < 3) c = mulc(mixc(c, 0x3a2a1a, 0.3), 0.9); // dirt round the hole
        const gr = hash2(Math.floor(u / 9), v, 41);
        if (gr < 0.16) c = mulc(c, 0.92); else if (gr > 0.92) c = mulc(c, 1.06);
      }
      depth[q] = F + rel;
      const k = bake(u / 64, CEIL - rel / 64 - 0.01, v / 64, 0, -1, 0);
      const o = q * 4;
      tex[o] = Math.min(255, ((c >> 16) & 255) * k[0]); tex[o + 1] = Math.min(255, ((c >> 8) & 255) * k[1]); tex[o + 2] = Math.min(255, (c & 255) * k[2]); tex[o + 3] = 255;
    }
    const geo = meshReliefTex(depth, U, V, { scale: S32, topShade: 0.9, bottomShade: 0.9 });
    // local z (out) → down; local y (v) → +z
    const m = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, CT + F * S32, 0);
    geo.applyMatrix4(m);
    geo.applyMatrix4(new THREE.Matrix4().makeScale(T, T, T));
    const mesh = new THREE.Mesh(geo, voxelMaterial('toon', { map: reliefTexture(tex, U, V), unique: true }));
    mesh.layers.enable(LAYER_OUTLINE);
    this.world.add(mesh);
    this.ceilMesh = mesh;
  }

  /** Lights for baking, in meters (softer than the live lights, which add flicker on top). */
  bakeLightsM() {
    const out = [];
    for (const l of this.lightsT) {
      const power = { sconce: 0.55, hanging: 0.45, window: 0.8, hole: 0.6, lantern: 0.5 }[l.kind] ?? 0.4;
      const radius = { sconce: 1.5, hanging: 1.6, window: 1.5, hole: 2.2, lantern: 1.2 }[l.kind] ?? 1.1;
      out.push({ x: l.x * T, y: l.y * T, z: l.z * T, color: l.color, power, radius });
    }
    for (const l of this.extraBake || []) out.push(l);
    return out;
  }

  /** Ambient for baking: the corners and the ceiling sink into a warm gloom. */
  ambientM() {
    const W = this.W * T, D = this.D * T;
    return (x, y, z, nx, ny, nz, out) => {
      let k = 0.86;
      if (y > 1.3) k *= Math.max(0.42, 1 - (y - 1.3) * 0.62);
      if (y < 0.3) k *= 0.8 + y * 0.66;
      const de = Math.min(x, z, W - x, D - z), dc = Math.min(Math.hypot(x, z), Math.hypot(W - x, z), Math.hypot(x, D - z), Math.hypot(W - x, D - z));
      if (dc < 0.9) k *= 0.7 + dc * 0.33;
      if (de < 0.4 && y > 1.4) k *= 0.85 + de * 0.37;
      out[0] = k; out[1] = k * 0.93; out[2] = k * 0.88;
    };
  }

  // ------------------------------------------------------------ door, window, poster
  buildDoor() {
    const open = !!this.opts.doorOpen;
    const d = townDoor(open, 4);
    this.onWall(d.frame, 'w', this.door.z);
    this.decor.add(d.frame);
    // the leaf swings: keep it out of the merge
    const holder = new THREE.Group();
    this.onWall(holder, 'w', this.door.z);
    holder.add(d.hinge);
    this.room.add(holder);
    this.doorLeaf = d.hinge;
    if (open) {
      // a woven mat in front of the door
      const mat = new VoxelGrid(30, 1, 40);
      mat.box(0, 0, 0, 30, 1, 40, (x, y, z) => ((x + z) % 6 < 3 ? 0x9a6a3a : 0xb08048));
      for (let z = 0; z < 40; z += 2) { mat.set(0, 0, z, 0xd8b878); mat.set(29, 0, z, 0xd8b878); }
      const mm = M32(mat, [15, 0, 20]);
      mm.position.set(0.55, 0.002, this.door.z);
      this.decor.add(mm);
    } else {
      const r = doorRubble(4);
      this.onWall(r, 'w', this.door.z);
      this.decor.add(r);
    }
  }

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
    const rng = makeRng(W * 13 + D);
    const add = (m) => { this.decor.add(m); return m; };
    const top = CT - PLATE / VPT;
    // corner posts
    for (const [x, z] of [[0, 0], [W, 0], [0, D], [W, D]]) {
      const p = cornerPost(WALL_V, x * 3 + z);
      p.position.set(x + (x ? -0.12 : 0.12), 0, z + (z ? -0.12 : 0.12));
      add(p);
    }
    // roots creeping down the walls from under the crown plates, avoiding openings
    const blocked = (wall, a) => this.tunnels.some((t) => t.wall === wall && Math.abs(t.t - a) < 1.1) || (wall === 'w' && (Math.abs(a - this.door.z) < 1.3 || Math.abs(a - (WINDOW_SLOTS[0] + 0.5)) < 0.9));
    for (const wall of ['n', 'w', 's', 'e']) {
      const len = wall === 'n' || wall === 's' ? W : D;
      for (let i = 0; i < Math.round(len * 0.55); i++) {
        const a = 0.6 + rng() * (len - 1.2);
        if (blocked(wall, a) || (wall === 'n' && a > 0.6 && a < 3.4)) continue;
        add(this.onWall(hangingRoot(0.3 + rng() * 0.6, i * 7 + wall.charCodeAt(0)), wall, a, top, 0.26));
      }
    }
    // roots poking down through the ceiling boards
    for (let i = 0; i < Math.round(W * D * 0.12); i++) {
      const x = 0.5 + rng() * (W - 1), z = 0.5 + rng() * (D - 1);
      if (Math.hypot(x - this.hole.x, z - this.hole.z) < 1.4 || this.joists.some((j) => Math.abs(j - x) < 0.3)) continue;
      if (x > this.lift.x - 0.3 && z > this.lift.y - 0.3) continue;
      const r = hangingRoot(0.15 + rng() * 0.45, 90 + i);
      r.position.set(x, CT, z);
      add(r);
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
      hl.obj.position.set(l.x, CT - 0.34, l.z);
      add(hl.obj);
    }
    // strings of paper lanterns sagging between joists
    const J = this.joists;
    if (J.length >= 2) this.lightString({ x: J[0], z: D * 0.24 }, { x: J[1], z: D * 0.3 }, 4);
    if (J.length >= 3) this.lightString({ x: J[1], z: D * 0.66 }, { x: J[2], z: D * 0.72 }, 9);
    else if (J.length >= 2) this.lightString({ x: J[0], z: D * 0.7 }, { x: J[1], z: D * 0.74 }, 9);
    // cobwebs in the top corners
    const web = (wall, a, mirror, seed) => add(this.onWall(cobweb(26, seed, mirror), wall, a, top, 0.05));
    web('n', 0.35, false, 1); web('w', D - 0.35, false, 2); web('s', 0.35, true, 3); web('e', 0.35, false, 4);
    web('n', W - 0.35, true, 5);
    // glowing bracket fungi low on the walls
    this.fungi = [];
    const fspots = [['s', 1.6, 0], ['w', D - 3.6, 1], ['e', 0.9, 2], ['n', W - 0.7, 1]];
    for (const [wall, a, hue] of fspots) {
      if (blocked(wall, a)) continue;
      const f = wallFungi(7 + hue, 3, hue);
      this.onWall(f.obj, wall, a, 0.2, 0.01);
      add(f.obj);
      const p = this.wallPoint(wall, a, 0.3);
      this.fungi.push({ x: p.x, y: 0.55, z: p.z, color: f.color });
    }
    // the build bench against the east wall
    const B = this.bench;
    const bb = buildBench(8);
    bb.rotation.y = -Math.PI / 2;
    bb.position.set(B.x + 0.5, 0, B.y + 1);
    add(bb);
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

  // ------------------------------------------------------------ tunnels and the hole
  buildTunnels() {
    for (const tn of this.tunnelInfo) {
      const tm = tunnelMouth(tn.seed);
      this.onWall(tm.obj, tn.wall, tn.t);
      this.decor.add(tm.obj);
    }
  }

  buildHole() {
    const H = this.hole;
    const shaft = holeShaft(HOLE_R + 0.06, 6.5, 11);
    shaft.position.set(H.x, CT + 8 * S32, H.z);
    this.decor.add(shaft);
    const bb = brokenBoards(HOLE_R, 5);
    bb.position.set(H.x, CT, H.z);
    this.decor.add(bb);
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

/** Merge indexed geometries with the same attributes (position, normal, color). */
function mergeIndexed(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.getAttribute('position').count; ni += g.index.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3);
  const hasUV = geos.every((g) => g.getAttribute('uv'));
  const UV = hasUV ? new Float32Array(nv * 2) : null;
  const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let ov = 0, oi = 0;
  for (const g of geos) {
    const n = g.getAttribute('position').count;
    P.set(g.getAttribute('position').array, ov * 3);
    N.set(g.getAttribute('normal').array, ov * 3);
    Cc.set(g.getAttribute('color').array, ov * 3);
    if (UV) UV.set(g.getAttribute('uv').array, ov * 2);
    const idx = g.index.array;
    for (let k = 0; k < idx.length; k++) I[oi + k] = idx[k] + ov;
    ov += n; oi += idx.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  if (UV) out.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  out.computeBoundingSphere();
  return out;
}

export { mergeIndexed, CT };

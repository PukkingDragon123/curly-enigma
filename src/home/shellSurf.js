// Your bedroom's walls and ceiling: 1/64 m voxel reliefs of lime plaster in a timber frame over a
// painted wainscot, and the boarded ceiling on its joists, with the room's fixed lamps baked into
// their texels. Split from shell.js so a build worker can make them (no DOM, no canvases here):
// packShellSurfaces(W, D, wallId) returns the two meshes packed; HomeShell (shell.js) builds on
// ShellBase for everything else in the room.
import * as THREE from 'three';
import { hashStr } from '../core/util.js';
import { mulc } from '../iso/kit.js';
import { hash2, noiseSampler } from '../iso/surface.js';
import { WINDOW_SLOTS, POSTER_SLOTS, HEARTH_X, benchTiles } from '../iso/homeLayout.js';
import { meshReliefTex, reliefTexture } from './relief.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { wallVoxel, wallDetail, nearestPost, ceilVoxel, isRockWall } from './walls.js';
import { n2 } from './surfaces.js';
import { T, VPT, CEIL, WALL_V, FACE, MOUTH_HW, ARCH } from './units.js';
import { inMouth, WINDOW, MOUTH_LANTERN } from './props.js';
import { quantize, qTransfer, unquantize, CSCALE } from './pack.js';

export const CT = CEIL / T; // ceiling height in tiles
export const S32 = 1 / 32;

export class ShellBase {
  /** room: the tile-unit group (scaled by T); world: the meters scene. */
  constructor(room, world) {
    this.room = room;
    this.world = world;
    this.wallMesh = null;
    this.toDispose = [];
  }

  /** Plan the room (no meshes yet): joists, lights. */
  plan(W, D, opts = {}) {
    this.W = W;
    this.D = D;
    this.opts = opts;
    this.tunnels = opts.tunnels || [];
    this.arch = { x: ARCH.x / T }; // the archway's centre on the north wall (tiles)
    this.bench = benchTiles(W, D);
    this.ledgeA = [3.6 * VPT, Math.max(5.2, W - 1.1) * VPT + 5]; // the high ledge on the north wall (voxels along)
    this.planJoists();
    this.planLights();
  }

  // ------------------------------------------------------------ planning
  /** Joists across the ceiling (x in tiles), evenly spaced and clear of the archway below. */
  planJoists() {
    const { W } = this;
    const xs = [];
    for (let x = 2.05; x < W - 0.7; x += 2.4) xs.push(x);
    this.joists = xs;
  }


  /** Fixed lights (tiles): sconces, hanging lanterns, the window, tunnel lanterns, the archway. */
  planLights() {
    const { W, D } = this;
    const sy = 2.75;
    this.sconceSpots = [
      { wall: 'n', a: 3.55 }, { wall: 'w', a: Math.max(3.4, Math.min(D - 2.7, 4.3)) },
      { wall: 's', a: 2.2 }, { wall: 'e', a: Math.min(D - 2.6, 4.9) },
    ];
    // a bigger room (grown, or an old save's) gets more: the far ends of the long walls
    if (W >= 12) this.sconceSpots.push({ wall: 'n', a: W - 2.4 }, { wall: 's', a: W - 2.2 });
    if (D >= 10) this.sconceSpots.push({ wall: 'w', a: D - 2.2 }, { wall: 'e', a: D - 1.6 });
    this.sconces = this.sconceSpots.map((s) => { const p = this.wallPoint(s.wall, s.a, 0.42); return { x: p.x, y: sy, z: p.z, wall: s.wall, a: s.a }; });
    const near = (v) => this.joists.slice().sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0];
    this.hanging = [];
    const j1 = near(W * 0.72), j2 = near(W * 0.28);
    if (j1 !== undefined) this.hanging.push({ x: j1, z: D * 0.32, len: 0.55 });
    if (j2 !== undefined && j2 !== j1) this.hanging.push({ x: j2, z: D * 0.7, len: 0.7 });
    if (W >= 12 || D >= 10) { const j3 = near(W * 0.55); if (j3 !== undefined) this.hanging.push({ x: j3, z: D * 0.86, len: 0.6 }); }
    if (W >= 14) { const j4 = near(W * 0.88); if (j4 !== undefined && j4 !== j1) this.hanging.push({ x: j4, z: D * 0.62, len: 0.65 }); }
    // an oil lamp on a chain from the patch in the roof, over the middle of the room
    // (the roof vaults up over the room: the chain is longer by that)
    const lx = Math.min(W - 2, 3.3), lz = Math.min(D - 2, 3.4), up = -this.roofDome(lx * VPT, lz * VPT) / VPT;
    this.hanging.push({ x: lx, z: lz, len: 0.7 + up, top: CT - 0.1 + up, big: true });
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
      ...this.hanging.map((l) => ({ x: l.x, y: (l.top ?? CT - 0.34) - 0.01 - l.len - 0.3, z: l.z, kind: l.big ? 'lamp' : 'hanging', color: 0xffb060 })),
      { ...this.windowLight, kind: 'window', color: 0x6ad8ff },
      ...this.lanterns.map((l) => ({ ...l, kind: 'lantern', color: 0xffb050 })),
      // firelight from the house coming up through the doorway
      { x: this.arch.x, y: 1.2, z: 0.35, kind: 'arch', color: 0xff9a50 },
      // the bedroom's own fire
      { x: HEARTH_X, y: 0.55, z: D - 0.75, kind: 'hearth', color: 0xff8a3a },
    ];
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

  // ------------------------------------------------------------ walls
  /** Openings cut through a wall: [{ c (voxels along), hw (voxels), test(du, v) }]. */
  openings(wall) {
    const out = [];
    if (wall === 'n') {
      const hw = ARCH.hw * 64, top = ARCH.h * 64, base = top - hw;
      out.push({ c: this.arch.x * VPT, hw: hw + 8, test: (du, v) => Math.abs(du) <= hw && (v < base || du * du + (v - base) ** 2 <= hw * hw) });
    }
    if (wall === 'w') {
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
      // (none in front of the Surface Express poster)
      if (wall === 'n') posts = posts.filter((p) => p < POSTER_SLOTS[0] * VPT - 8 || p > (POSTER_SLOTS[POSTER_SLOTS.length - 1] + 1) * VPT + 8);
      const depth = new Int16Array(U * H);
      const ws = seed + wall.charCodeAt(0) * 3;
      const nrm = { n: [0, 0, 1], s: [0, 0, -1], w: [1, 0, 0], e: [-1, 0, 0] }[wall];
      const ctx = isRockWall(wallId) ? { shape: 0, soot: 0, damp: 0 } : null;
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
        if (ctx) this.rockCtx(ctx, wall, along, v, U);
        const [c, rel, kind] = wallVoxel(wallId, along, v, ws, n, post, ctx);
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
    const mesh = new THREE.Mesh(merged, texturedToon(reliefTexture(tex, TW, TH)));
    mesh.layers.enable(LAYER_OUTLINE);
    this.world.add(mesh);
    this.wallMesh = mesh;
  }


  /**
   * The cave's rock round your nook isn't a box (into ctx, for walls.js): the roof leans in over head
   * height (carved back over the ledge on the north wall) and the corners are rounded (voxels out into
   * the room); soot over the hearth and above the sconces; the damp south-west corner, where the rock
   * weeps (0..1). a: voxels along the wall (x or z), v: up, U: the wall's length.
   */
  rockCtx(ctx, wall, a, v, U) {
    const H = WALL_V, ws = wall.charCodeAt(0);
    let s = 0;
    const c0 = H - 46 + 9 * n2(a / 46, 0.5, ws);
    if (v > c0) {
      const k = wall === 'n' && a > this.ledgeA[0] && a < this.ledgeA[1] ? 0.15 : 1;
      const t = (v - c0) / (H - c0);
      s += 32 * t ** 1.7 * k;
    }
    const e = Math.min(a, U - a);
    if (e < 34) s += 13 * (1 - e / 34) ** 2 * (0.75 + 0.25 * Math.min(1, v / 40));
    ctx.shape = s;
    // (meters)
    const am = a / 64, h = v / 64, D = this.D * T;
    const x = wall === 'n' || wall === 's' ? am : wall === 'w' ? 0 : this.W * T, z = wall === 'w' || wall === 'e' ? am : wall === 'n' ? 0 : D;
    let soot = 0;
    if (wall === 's' && h > 0.85) soot = Math.max(0, 1 - Math.abs(x - HEARTH_X * T) / (0.75 + (h - 0.85) * 0.5)) * Math.min(1, (h - 0.85) / 0.7) * 0.85;
    for (const sc of this.sconceSpots) {
      if (sc.wall !== wall || h < 1.42) continue;
      const d = Math.abs(am - sc.a * T), w = 0.06 + (h - 1.42) * 0.12;
      if (d < w) soot = Math.max(soot, (1 - d / w) * Math.max(0, 1 - (h - 1.42) / 0.75) * 0.7);
    }
    ctx.soot = soot;
    ctx.damp = Math.max(0, 1 - Math.hypot(x, z - D) / 1.5);
    return ctx;
  }

  /** How far the rock roof vaults up over the plane of the joists at (u, v) (1/64 m voxels, ≤ 0). */
  roofDome(u, v) {
    const U = this.W * VPT, V = this.D * VPT;
    const e = Math.min(u, v, U - u, V - v);
    const t = Math.max(0, Math.min(1, (e - 8) / 70));
    return -16 * t * t * (3 - 2 * t) * (0.8 + 0.2 * n2(u / 60, v / 60, 19));
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
    const U = W * VPT, V = D * VPT, F = 26;
    const seed = 31;
    const depth = new Int16Array(U * V);
    const tex = new Uint8Array(U * V * 4);
    const bake = this.texelBaker();
    const jo = this.joists.map((x) => x * VPT);
    // where the roof was patched long ago: a square of newer boards, nailed over (up in the vault)
    const px = Math.min(U - 60, 3.3 * VPT), pz = Math.min(V - 50, 3.4 * VPT), pr = Math.round(this.roofDome(px, pz)) + 3;
    const hx = HEARTH_X * VPT;
    for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
      const q = u + v * U;
      const dome = this.roofDome(u, v);
      let [c, rel] = ceilVoxel(u, v, seed, jo, true, dome);
      const gr = hash2(Math.floor(u / 9), v, 41);
      if (gr < 0.16) c = mulc(c, 0.92); else if (gr > 0.92) c = mulc(c, 1.06);
      const ax = Math.abs(u + 0.5 - px), az = Math.abs(v + 0.5 - pz);
      if (rel < 10 && ax < 30 && az < 26) { c = (az > 24 || ax > 28) ? 0x3e2616 : mulc(0x8a6440, 0.92 + ((v >> 3) % 2) * 0.06 + (hash2(u >> 3, v, 5) < 0.1 ? -0.08 : 0)); rel = pr; if ((ax > 25 || az > 21) && (u + v) % 7 === 0) c = 0x8a8a92; }
      // soot: up over the hearth, and over the oil lamp
      const sh = Math.hypot((u - hx) / 46, (V - v) / 40), sl = Math.hypot(u - px, v - pz) / 22;
      if (sh < 1 && rel < 10) c = mulc(c, 0.3 + sh * 0.7);
      else if (sl < 1 && rel < 10) c = mulc(c, 0.6 + sl * 0.4);
      depth[q] = Math.max(1, F + rel);
      const k = bake(u / 64, CEIL - rel / 64 - 0.01, v / 64, 0, -1, 0);
      const o = q * 4;
      tex[o] = Math.min(255, ((c >> 16) & 255) * k[0]); tex[o + 1] = Math.min(255, ((c >> 8) & 255) * k[1]); tex[o + 2] = Math.min(255, (c & 255) * k[2]); tex[o + 3] = 255;
    }
    const geo = meshReliefTex(depth, U, V, { scale: S32, topShade: 0.9, bottomShade: 0.9 });
    // local z (out) → down; local y (v) → +z
    const m = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, CT + F * S32, 0);
    geo.applyMatrix4(m);
    geo.applyMatrix4(new THREE.Matrix4().makeScale(T, T, T));
    const mesh = new THREE.Mesh(geo, texturedToon(reliefTexture(tex, U, V), 0.25));
    mesh.layers.enable(LAYER_OUTLINE);
    this.world.add(mesh);
    this.ceilMesh = mesh;
  }


  /** Lights for baking, in meters (softer than the live lights, which add flicker on top). */
  bakeLightsM() {
    const out = [];
    for (const l of this.lightsT) {
      const power = { sconce: 0.3, hanging: 0.3, lamp: 0.45, window: 0.8, arch: 0.45, lantern: 0.45, hearth: 0.6 }[l.kind] ?? 0.4;
      const radius = { sconce: 1.25, hanging: 1.4, lamp: 2.1, window: 1.5, arch: 1.4, lantern: 1.2, hearth: 2.6 }[l.kind] ?? 1.1;
      out.push({ x: l.x * T, y: l.y * T, z: l.z * T, color: l.color, power, radius });
    }
    for (const l of this.extraBake || []) out.push(l);
    return out;
  }

  /** Ambient for baking: the corners and the ceiling sink into a warm gloom. */
  ambientM() {
    const W = this.W * T, D = this.D * T;
    return (x, y, z, nx, ny, nz, out) => {
      let k = 0.64; // (a nook in a cave: dimmer than the old bedroom)
      if (y > 1.3) k *= Math.max(0.42, 1 - (y - 1.3) * 0.62);
      if (y < 0.3) k *= 0.8 + y * 0.66;
      const de = Math.min(x, z, W - x, D - z), dc = Math.min(Math.hypot(x, z), Math.hypot(W - x, z), Math.hypot(x, D - z), Math.hypot(W - x, D - z));
      if (dc < 0.9) k *= 0.7 + dc * 0.33;
      if (de < 0.4 && y > 1.4) k *= 0.85 + de * 0.37;
      out[0] = k * 0.74; out[1] = k * 0.84; out[2] = k; // (cold blue shade, as in the camp: the hearth and lanterns are the warm)
    };
  }
}

/**
 * A toon material showing a baked texture (and glowing a little with it: the bake reads in the
 * corners too). The maps are set after creation: voxelMaterial keys its cache on JSON of its
 * options, which would serialise a texture texel by texel.
 */
export function texturedToon(tex, glow = 0.12, cs = 1) {
  const m = voxelMaterial('toon', { unique: true });
  if (cs !== 1) m.color.setScalar(cs);
  m.map = tex;
  m.emissive.setHex(0xffffff);
  m.emissiveMap = tex;
  m.emissiveIntensity = glow;
  m.needsUpdate = true;
  return m;
}

/** Merge indexed geometries with the same attributes (position, normal, color). */
export function mergeIndexed(geos) {
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


/**
 * Your room's walls and ceiling built away from the scene (in a build worker): the two meshes
 * packed ([{ name, q, tex: { data, w, h }, glow }]), their buffers added to `transfer`.
 */
export function packShellSurfaces(W, D, wallId, transfer = []) {
  const room = new THREE.Group();
  room.scale.setScalar(T);
  const world = new THREE.Group();
  const sh = new ShellBase(room, world);
  sh.plan(W, D, { tunnels: [] });
  sh.setWall(wallId);
  sh.buildCeiling();
  const out = [];
  for (const [name, m] of [['walls', sh.wallMesh], ['ceiling', sh.ceilMesh]]) {
    if (!m) continue;
    const q = quantize(m.geometry);
    qTransfer(q, transfer);
    const data = m.material.map.image.data;
    transfer.push(data.buffer);
    out.push({ name, q, tex: { data, w: m.material.map.image.width, h: m.material.map.image.height }, glow: m.material.emissiveIntensity });
  }
  return out;
}

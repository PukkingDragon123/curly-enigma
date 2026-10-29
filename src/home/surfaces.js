// The house's walls, ceilings and floors (plan.js), built as 1/64 m reliefs and painted texels:
// warm lime plaster between dark oak timbers (posts, a wall plate along the top, knee braces, a
// lintel over every door) above a lower wall of panelling (sage-painted in the living room, dark
// oak in the hall, glazed tiles in the kitchen); the smithy is brick over a stone plinth, sooty
// toward the forge. Ceilings are boards on heavy joists (the living room's has the hole you fell
// through, boarded over); floors are oak and pine boards, terracotta tiles and flagstones, worn
// pale where feet go. The fixed lights of each room are baked into its texels (a light only lights
// its own room, unless it spills through a doorway), with soft corners and a darker ceiling.
// Also the collision boxes for every wall (with the doorways left open), the floor and ceilings.
import * as THREE from 'three';
import { meshReliefTex, reliefTexture } from './relief.js';
import { quantize, qTransfer, unquantize, CSCALE } from './pack.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { hash2 } from '../iso/surface.js';
import { mulc, mixc, sp3 } from '../iso/kit.js';
import { ROOMS, WALL, VPM, FY, sideInfo, openingsOf, roomAt } from './plan.js';
import { HOLE } from './units.js';

const S64 = 1 / VPM;
const FACE = 6; // relief depth behind each wall face (voxels)
const OAK = 0x4a2e1c, OAK_D = 0x33200f, OAK_L = 0x6a4428;
const GROUT = 0xb8ae9a;

// ---------------------------------------------------------------- noise
function hash(x, z, s) { return hash2(x, z, s); }
const sm = (t) => t * t * (3 - 2 * t);
/** Smooth value noise, -1..1. */
export function n2(x, z, s = 0) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = sm(x - xi), fz = sm(z - zi);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
  return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) * 2 - 1;
}

// ---------------------------------------------------------------- light baking
/**
 * A texel lighter for one room: ambient (soft dark corners, a dim ceiling) plus its lights.
 * lights: [{ x, y, z, color, power, radius, room, spill }]. Returns fn(x, y, z, nx, ny, nz) → [r, g, b].
 */
export function roomLighter(room, lights, ambient = 0.9) {
  const L = [];
  for (const l of lights) {
    if (l.room && l.room !== room.id && !(l.spill && l.spill.includes(room.id))) continue;
    const c = new THREE.Color(l.color ?? 0xffc070), p = l.power ?? 0.5, k = l.room && l.room !== room.id ? 0.45 : 1;
    L.push({ x: l.x, y: l.y, z: l.z, r: c.r * p * k, g: c.g * p * k, b: c.b * p * k, rad: l.radius ?? 2 });
  }
  const out = [1, 1, 1];
  const top = FY + room.h;
  return (x, y, z, nx, ny, nz) => {
    // ambient: dimmer up high, darker in the corners and right at the foot of the walls
    let k = ambient;
    const h = y - FY;
    if (h > 1.2) k *= Math.max(0.5, 1 - (h - 1.2) * 0.38);
    if (h < 0.25) k *= 0.82 + h * 0.72;
    const ex = Math.min(x - room.x0, room.x1 - x), ez = Math.min(z - room.z0, room.z1 - z);
    const de = Math.min(ex, ez);
    if (ex < 0.6 && ez < 0.6) k *= 0.72 + 0.28 * Math.min(1, Math.hypot(Math.max(0, ex), Math.max(0, ez)) / 0.6);
    if (de < 0.25 && ny > 0.5) k *= 0.8 + de * 0.8; // the floor along the skirting
    if (top - y < 0.3 && ny < -0.5) k *= 0.9;
    let r = k, g = k * 0.92, b = k * 0.84;
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      const dx = l.x - x, dy = l.y - y, dz = l.z - z;
      const d2 = dx * dx + dy * dy + dz * dz, r2 = l.rad * l.rad;
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2) || 1e-4;
      const w = ((dx * nx + dy * ny + dz * nz) / d) * 0.6 + 0.4;
      if (w <= 0) continue;
      const t = 1 - d2 / r2, f = t * t * w;
      r += l.r * f; g += l.g * f; b += l.b * f;
    }
    out[0] = Math.min(2.3, r); out[1] = Math.min(2.3, g); out[2] = Math.min(2.3, b);
    return out;
  };
}

// ---------------------------------------------------------------- wall painting
/** The texel painters' result (no array per texel): colour and relief. */
const TX = { c: 0, r: 0 };
const tx = (c, r) => { TX.c = c; TX.r = r; return TX; };

/** Wainscot height (voxels) and the posts' layout along one side. */
const WH = 46;

/**
 * Posts along a side (voxel positions along it): one at each corner, then about every 1.3 m, kept
 * clear of the openings. ops in voxels { c, hw }.
 */
function postsFor(U, ops) {
  const out = [4, U - 5];
  const n = Math.max(1, Math.round(U / (1.3 * VPM)));
  for (let i = 1; i < n; i++) {
    const p = Math.round((i * U) / n);
    if (ops.some((o) => Math.abs(p - o.c) < o.hw + 16)) continue;
    out.push(p);
  }
  return out.sort((a, b) => a - b);
}

/** The color and relief of a plaster wall texel (u along, v up, voxels). */
function plasterTexel(room, s, u, v, V, posts, ops, cracks) {
  const seed = s.seed;
  // ---- the lower wall
  if (v < 7) { // skirting
    const c = v === 6 ? mulc(OAK_L, 1.05) : mulc(OAK, 0.9 + (v % 3) * 0.04);
    return tx(mulc(c, sp3(u, v, 1, seed, 0.05, 0.1)), v === 6 ? 3 : 2);
  }
  if (v < WH) {
    if (v >= WH - 4) return tx(v === WH - 1 ? mulc(OAK_L, 1.1) : v === WH - 4 ? mulc(OAK, 0.75) : OAK, v === WH - 1 ? 5 : 4); // the cap rail
    if (room.wains === 'tile') {
      // glazed tiles, cream with a blue sprig here and there and a blue border row on top
      const tu = Math.floor(u / 10), tv = Math.floor((v - 7) / 10), lu = u % 10, lv = (v - 7) % 10;
      if (lu === 0 || lv === 0) return tx(GROUT, 0);
      const border = tv === 3;
      const h = hash2(tu, tv, seed + 4);
      let c = border ? 0x3a5e9a : h < 0.12 ? 0xdad2bc : 0xece2c8;
      if (!border && h > 0.82 && Math.abs(lu - 5) + Math.abs(lv - 5) < 3) c = (lu + lv) % 2 ? 0x4a6eaa : 0x6a8ec4;
      if (border && (lu + lv) % 4 === 0) c = 0x5a7eb8;
      if (lu === 1 || lv === 9) c = mulc(c, 1.06);
      return tx(c, 1);
    }
    const paint = room.wains === 'sage' ? 0x6e7e54 : 0x5a3a24;
    const pc = room.wains === 'sage' ? (x) => mulc(paint, x) : (x) => mulc(paint, x);
    const P = 30, pl = u % P;
    if (v < 11 || v > WH - 9 || pl < 4) { // rails and stiles
      const worn = room.wains === 'sage' && hash2(u >> 1, v >> 1, seed + 6) < 0.025 ? 0x8a6a48 : null; // chipped paint
      return tx(worn ?? pc(v === 10 || v === WH - 9 ? 1.12 : 1.0), 3);
    }
    if (pl === 4 || pl === P - 1 || v === 11 || v === WH - 10) return tx(pc(pl === 4 || v === WH - 10 ? 0.78 : 1.08), 2); // bevel
    return tx(mulc(pc(0.94 + hash2(Math.floor(u / P), 3, seed) * 0.08), sp3(u, v, 2, seed, 0.03, 0.08)), 1);
  }
  // ---- the frame
  if (v >= V - 13) { // the wall plate under the ceiling
    const lip = v === V - 13;
    const nail = !lip && (u * 7 + v) % 131 === 0;
    return tx(nail ? 0x8a8a92 : lip ? mulc(OAK, 0.72) : mulc(OAK, (0.92 + (Math.floor(u / 41) % 3) * 0.05) * sp3(u, v, 3, seed, 0.06, 0.1)), lip ? 6 : 7);
  }
  for (const o of ops) { // lintels over the doors
    if (o.kind === 'window' || o.kind === 'lift') continue;
    const top = o.top;
    if (v >= top && v < top + 11 && Math.abs(u + 0.5 - o.c) <= o.hw + 9) {
      const edge = v === top || v === top + 10;
      return tx(edge ? mulc(OAK, 0.75) : mulc(OAK, 1.02 * sp3(u, v, 4, seed, 0.05, 0.1)), edge ? 5 : 6);
    }
  }
  let near = 999, side = 1, pi = 0;
  for (let i = 0; i < posts.length; i++) { const d = u + 0.5 - posts[i]; if (Math.abs(d) < Math.abs(near)) { near = d; side = d < 0 ? -1 : 1; pi = i; } }
  const ad = Math.abs(near);
  if (ad <= 5) { // a post
    const edge = ad > 4;
    const check = hash2(pi, Math.floor(v / 21), seed + 3) < 0.1 && Math.abs(near - 0.5) < 1 ? 0.7 : 1;
    const grain = Math.floor(v / 11 + u) % 4 === 0 ? 0.93 : 1;
    return tx(edge ? mulc(OAK, 0.74) : mulc(OAK, 1.04 * grain * check), edge ? 5 : 6);
  }
  // knee braces up to the plate from posts that aren't at a corner
  if (pi > 0 && pi < posts.length - 1) {
    const d = ad - 6;
    if (d >= 0 && d < 30) {
      const tv = V - 13 - 30 + d;
      if (v >= tv - 3 && v <= tv + 3) return tx(v === tv + 3 ? mulc(OAK, 1.15) : v === tv - 3 ? mulc(OAK, 0.72) : OAK, 4);
    }
  }
  // ---- plaster
  const ck = cracks[u + v * s.U];
  if (ck === 2) return tx(mixc(0xa89884, 0x8a7a68, hash2(u >> 2, v >> 2, seed)), 0); // where it has come away: the stone behind
  let c = room.plaster ?? 0xdcc69c;
  const lo = n2(u / 40, v / 40, seed + 7) * 0.05 + n2(u / 12, v / 12, seed + 8) * 0.025;
  c = mulc(c, 0.97 + lo + (hash2(u, v, seed + 9) < 0.03 ? -0.04 : 0));
  // soot and age higher up; a damp stain low down here and there
  const up = (v - WH) / (V - WH);
  if (up > 0.65) c = mixc(c, 0x6a5440, (up - 0.65) * 0.35);
  if (ck === 1) c = mulc(c, 0.86);
  return tx(c, ck === 3 ? 2 : 1);
}

/** The smithy's walls: soot-dark brick over a plinth of dressed stone. */
function brickTexel(room, s, u, v, V, posts, ops, cracks, soot) {
  const seed = s.seed;
  if (v < 30) { // the plinth
    const row = v < 15 ? 0 : 1, off = row * 17;
    const lx = (u + off) % 34, ly = row ? v - 15 : v;
    if (lx === 0 || ly === 0) return tx(0x3e3630, 0);
    const bx = Math.floor((u + off) / 34);
    const sc = [0x7a7068, 0x6e665e, 0x86796c, 0x625a52][Math.floor(hash2(bx, row, seed) * 4)];
    const top = ly === 14;
    return tx(mulc(top ? mulc(sc, 1.1) : lx === 33 ? mulc(sc, 0.84) : sc, sp3(u, v, 5, seed, 0.1, 0.1)), top ? 3 : 2);
  }
  if (v >= V - 13) return plasterTexel(room, s, u, v, V, [], ops, cracks); // the plate
  for (const o of ops) {
    if (o.kind === 'window' || o.kind === 'lift') continue;
    if (v >= o.top && v < o.top + 11 && Math.abs(u + 0.5 - o.c) <= o.hw + 9) return plasterTexel(room, s, u, v, V, [], ops, cracks);
  }
  const row = Math.floor((v - 30) / 8), off = (row % 2) * 8;
  const lx = (u + off) % 16, ly = (v - 30) % 8;
  const k = soot(u, v);
  if (ly === 0 || lx === 0) return tx(mixc(0x6a5e52, 0x1e1814, k), 0);
  const h = hash2(Math.floor((u + off) / 16), row, seed);
  let bc = [0xa05a3c, 0x8e4c34, 0xae6a46, 0x824632, 0xa2603e][Math.floor(h * 5)];
  if (ly === 7) bc = mulc(bc, 1.1); else if (lx === 15) bc = mulc(bc, 0.86);
  bc = mixc(bc, 0x221a16, Math.min(0.85, k * (0.8 + hash2(u >> 2, row, seed + 2) * 0.4)));
  return tx(mulc(bc, sp3(u, v, 6, seed, 0.06, 0.1)), h > 0.93 ? 2 : 1);
}

/** Dressed stone walls (the glow garden, the larder): coursed blocks, deep mortar, moss low down, a damp sheen; lintels over the doors. */
function stoneTexel(room, s, u, v, V, ops) {
  const seed = s.seed;
  for (const o of ops) { // stone lintels and jambs round the openings
    if (o.kind === 'window') {
      const d = Math.hypot(u + 0.5 - o.c, v + 0.5 - o.cyv);
      if (d < o.rr + 9) { const a = Math.atan2(v + 0.5 - o.cyv, u + 0.5 - o.c), seg = Math.floor((a + Math.PI) / (Math.PI / 8)); return tx(mulc(seg % 2 ? 0x9a9080 : 0x8a8274, d < o.rr + 2 ? 0.8 : 1), 4); }
      continue;
    }
    if (o.kind === 'lift') continue;
    const du = Math.abs(u + 0.5 - o.c);
    if (du <= o.hw + 9 && v < o.top + 12) {
      if (o.kind === 'arch') { const base = o.top - o.hw, dv = v - base, d = Math.hypot(du, Math.max(0, dv)); if (d > o.hw && d < o.hw + 11) { const a = Math.atan2(Math.max(0, dv), u + 0.5 - o.c), seg = Math.floor(a / (Math.PI / 9)); return tx(mulc(seg % 2 ? 0xa09684 : 0x8e8676, d > o.hw + 9 ? 0.82 : 1), 5); } if (dv <= 0 && du > o.hw && du <= o.hw + 9) return tx(mulc(0x948a7c, (Math.floor(v / 14) % 2 ? 0.92 : 1)), 5); }
      else if (v >= o.top && v < o.top + 12) return tx(mulc(0x8a8070, v === o.top || v === o.top + 11 ? 0.78 : 1), 5);
      else if (du > o.hw && du <= o.hw + 9) return tx(mulc(0x948a7c, Math.floor(v / 14) % 2 ? 0.92 : 1), 5);
    }
  }
  if (v < 5) return tx(mulc(0x5a524a, 0.9), 3); // the plinth course
  const rh = 15, row = Math.floor((v - 5) / rh), lv = (v - 5) % rh;
  const off = (row * 19) % 40, bw = 28 + Math.floor(hash2(row, 3, seed) * 14);
  const bx = Math.floor((u + off) / bw), lu = (u + off) % bw;
  if (lv === 0 || lu === 0) {
    const moss = v < 50 && hash2(u >> 1, v >> 1, seed + 2) < 0.45 - v / 140;
    return tx(moss ? (hash2(u, v, seed) < 0.5 ? 0x4f7a34 : 0x3e6a2a) : room.cool ? 0x8a8478 : 0x3e3830, 0);
  }
  const base = room.cool ? [0xb8b0a2, 0xa8a092, 0xc0b8aa, 0xb0a898] : [0x8a7e6e, 0x7a7062, 0x948878, 0x82786a, 0x9a8e7c];
  let c = base[Math.floor(hash2(bx, row, seed) * base.length)];
  const bev = Math.min(lu, bw - 1 - lu, lv, rh - 1 - lv);
  if (bev === 1) c = mulc(c, lv === rh - 2 || lu === 1 ? 1.1 : 0.86);
  c = mulc(c, sp3(u, v, 2, seed, 0.1, 0.1) * (0.97 + n2(u / 14, v / 14, seed) * 0.05));
  if (!room.cool && v < 70 && hash2(u >> 2, v >> 2, seed + 4) < (70 - v) / 260) c = mixc(c, 0x5a8a3a, 0.5); // moss creeping up from the beds
  if (room.cool && hash2(u >> 3, v >> 3, seed + 5) < 0.04) c = mixc(c, 0x6a6a62, 0.4); // a damp patch
  return tx(c, 1 + (hash2(bx, row, seed + 1) < 0.35 ? 1 : 0) + (bev > 2 && n2(u / 6, v / 6, seed) > 0.4 ? 1 : 0));
}

/** Raw cave rock (the cliff either side of the terrace): bulging, cracked, glowing moss in the seams. */
function rockTexel(room, s, u, v, V) {
  const seed = s.seed;
  const h = n2(u / 34, v / 30, seed) * 0.6 + n2(u / 11, v / 13, seed + 1) * 0.3 + n2(u / 4, v / 4, seed + 2) * 0.1;
  const hs = n2(u / 34, v / 30, seed) * 0.7 + n2(u / 13, v / 15, seed + 1) * 0.3; // (the relief follows only the big bulges, in steps: far fewer faces)
  const rel = Math.max(0, 10 + Math.round(hs * 4) * 3);
  let c = mixc(0x3a3448, 0x5a5268, Math.max(0, Math.min(1, 0.5 + h * 0.8)));
  const crack = Math.abs(n2(u / 22, v / 40, seed + 5)) < 0.04;
  if (crack) { c = 0x1a1622; return tx(c, Math.max(0, rel - 6)); }
  if (Math.abs(n2(u / 22, v / 40, seed + 5)) < 0.08 && hash2(u, v, seed) < 0.5) c = hash2(u >> 1, v >> 1, seed + 6) < 0.5 ? 0x3ad0b0 : 0x2a8a8a; // glowing moss along the cracks
  else if (h > 0.25 && hash2(u >> 2, v >> 2, seed + 7) < 0.25) c = mixc(c, 0x6a5a82, 0.4);
  if (v < 40 && hash2(u >> 1, v >> 1, seed + 8) < (40 - v) / 90) c = mixc(c, 0x3a6a2a, 0.6);
  return tx(mulc(c, sp3(u, v, 3, seed, 0.12, 0.1)), rel);
}

/** Hairline cracks (1), patches where the plaster has fallen off (2) for one wall face. */
function crackMap(U, V, seed, n = 2) {
  const m = new Uint8Array(U * V);
  for (let k = 0; k < n; k++) {
    let x = 20 + hash2(k, 1, seed) * (U - 40), y = WH + 10 + hash2(k, 2, seed) * (V - WH - 30);
    let a = hash2(k, 3, seed) * Math.PI * 2;
    if (hash2(k, 8, seed) < 0.4) continue;
    const len = 12 + hash2(k, 4, seed) * 26;
    for (let i = 0; i < len; i++) {
      a += (hash2(k, i, seed + 5) - 0.5) * 1.1;
      x += Math.cos(a); y += Math.sin(a) * 0.8;
      const xi = Math.round(x), yi = Math.round(y);
      if (xi > 0 && yi > WH && xi < U && yi < V - 14) m[xi + yi * U] = 1;
    }
  }
  // a patch or two of bare stone where the plaster has come away
  for (let k = 0; k < 1; k++) {
    if (hash2(k, 9, seed) < 0.55) continue;
    const cx = 30 + hash2(k, 10, seed) * (U - 60), cy = WH + 14 + hash2(k, 11, seed) * (V - WH - 46);
    const rx = 5 + hash2(k, 12, seed) * 5, ry = 4 + hash2(k, 13, seed) * 3;
    for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
      if (x < 0 || y < 0 || x >= U || y >= V) continue;
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry) + (hash2(x >> 1, y >> 1, seed + k) - 0.5) * 0.35;
      if (d < 1) m[x + y * U] = 2;
      else if (d < 1.18 && m[x + y * U] !== 2) m[x + y * U] = 3; // the broken plaster lip
    }
  }
  return m;
}

// ---------------------------------------------------------------- the surfaces
export class HouseSurfaces {
  /** world: the meters scene. lights: the house's fixed lights (see roomLighter). opts.soot(x, y, z) → 0..1 */
  constructor(world, lights, opts = {}) {
    this.world = world;
    this.lights = lights;
    this.opts = opts;
    this.meshes = [];
    this.boxes = [];
    this.textures = [];
  }

  build(rooms = ROOMS) {
    const t0 = performance.now();
    for (const r of rooms) this.buildRoom(r);
    if (rooms === ROOMS) this.collide();
    this.ms = performance.now() - t0;
    return this;
  }

  /** One room's walls, ceiling and floor, lit by its own lights. */
  buildRoom(r) {
    const st = (this.steps ||= { walls: 0, ceilings: 0, floors: 0 });
    const time = (k, fn) => { const a = performance.now(); fn(); st[k] += Math.round(performance.now() - a); };
    const lit = roomLighter(r, this.lights);
    time('walls', () => this.buildWalls(r, lit));
    if (!r.open) time('ceilings', () => this.buildCeiling(r, lit));
    time('floors', () => this.buildFloor(r, lit));
    return this;
  }

  /**
   * The meshes packed for the scene: [{ name, room, q (quantized geometry with uv), tex: { data, w, h },
   * glow, outline, order }] and the transfer list.
   */
  pack(room, transfer) {
    const out = [];
    for (const m of this.meshes) {
      const q = quantize(m.geometry);
      qTransfer(q, transfer);
      const t = m.material.map;
      const data = t.image.data;
      transfer.push(data.buffer);
      out.push({ name: m.name, room, q, tex: { data, w: t.image.width, h: t.image.height }, glow: m.material.emissiveIntensity, outline: m.layers.isEnabled(LAYER_OUTLINE), order: m.renderOrder || 0 });
    }
    return out;
  }

  /**
   * A surface mesh: toon-lit like the props, with its baked light also glowing a little on its own
   * (emissive = the same texels), so the bake reads even where the live lights and the hemisphere
   * barely reach (ceilings, the corners).
   */
  mesh(geo, tex, glow = 0.2) {
    // (voxelMaterial keys its cache on JSON of the options: a texture in them would be serialised
    // texel by texel, so the maps go on after)
    const mat = voxelMaterial('toon', { unique: true });
    mat.map = tex;
    mat.emissive.setHex(0xffffff);
    mat.emissiveMap = tex;
    mat.emissiveIntensity = glow;
    mat.needsUpdate = true;
    const m = new THREE.Mesh(geo, mat);
    m.layers.enable(LAYER_OUTLINE);
    this.world.add(m);
    this.meshes.push(m);
    this.textures.push(tex);
    return m;
  }

  // ------------------------------------------------------------ walls
  buildWalls(r, lit) {
    const sides = r.open ? (r.walls || []) : ['n', 'e', 's', 'w'];
    if (!sides.length) return;
    const V = Math.round(r.h * VPM);
    const info = sides.map((side) => {
      const S = sideInfo(r, side);
      const U = Math.round((S.a1 - S.a0) * VPM) + FACE * 2;
      return { side, S, U };
    });
    const TW = Math.max(...info.map((i) => i.U)), TH = V * sides.length;
    const tex = new Uint8Array(TW * TH * 4);
    const geos = [];
    info.forEach(({ side, S, U }, wi) => {
      // along-coordinate u runs left→right as seen from inside the room
      const flip = side === 's' || side === 'w';
      const a0 = S.a0 - FACE / VPM;
      const alongM = (u) => (flip ? S.a1 + FACE / VPM - (u + 0.5) / VPM : a0 + (u + 0.5) / VPM);
      const toU = (m) => (flip ? (S.a1 + FACE / VPM - m) * VPM : (m - a0) * VPM);
      const ops = openingsOf(r, side).map((o) => ({ ...o, c: toU(o.c), hw: (o.w / 2) * VPM, top: Math.round(o.h * VPM), rr: (o.r ?? 0) * VPM, cyv: (o.cy ?? 0) * VPM }));
      const posts = postsFor(U, ops);
      const s = { seed: (r.id.charCodeAt(0) * 31 + side.charCodeAt(0) * 7) % 997, U };
      const cracks = r.wall === 'plaster' ? crackMap(U, V, s.seed, 3) : new Uint8Array(U * V);
      // world coordinates of each column (m), the texel lighter's inputs
      const WX = new Float32Array(U), WZ = new Float32Array(U);
      for (let u = 0; u < U; u++) { const a = alongM(u); WX[u] = S.fixed === 'z' ? a : S.at + S.nx * 0.02; WZ[u] = S.fixed === 'z' ? S.at + S.nz * 0.02 : a; }
      const sootF = this.opts.soot;
      const soot = r.wall === 'brick' && sootF ? (u, v) => sootF(WX[u], FY + v / VPM, WZ[u]) : () => 0;
      const depth = new Int16Array(U * V);
      for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
        const q = u + v * U;
        let hole = false;
        for (const o of ops) {
          const du = u + 0.5 - o.c;
          if (o.kind === 'window') { if (Math.hypot(du, v + 0.5 - o.cyv) <= o.rr) { hole = true; break; } continue; }
          if (Math.abs(du) > o.hw) continue;
          const roundTop = o.kind === 'arch' || o.kind === 'front';
          const base = roundTop ? o.top - o.hw : o.top;
          if (v < base || (roundTop && du * du + (v - base) ** 2 <= o.hw * o.hw)) { hole = true; break; }
        }
        if (hole) { depth[q] = 0; continue; }
        const style = (r.sideWall && r.sideWall[side]) || r.wall;
        const t = style === 'brick' ? brickTexel(r, s, u, v, V, posts, ops, cracks, soot) : style === 'stone' ? stoneTexel(r, s, u, v, V, ops) : style === 'rock' ? rockTexel(r, s, u, v, V) : plasterTexel(r, s, u, v, V, posts, ops, cracks);
        const c = t.c, rel = t.r;
        depth[q] = FACE + rel;
        // light the texel where it sits in the room
        const k = lit(WX[u], FY + v / VPM + 0.008, WZ[u], S.nx, 0, S.nz);
        const o4 = ((v + wi * V) * TW + u) * 4;
        tex[o4] = Math.min(255, ((c >> 16) & 255) * k[0]); tex[o4 + 1] = Math.min(255, ((c >> 8) & 255) * k[1]); tex[o4 + 2] = Math.min(255, (c & 255) * k[2]); tex[o4 + 3] = 255;
      }
      const geo = meshReliefTex(depth, U, V, { scale: S64, texW: TW, vOff: wi * V, vTotal: TH });
      if (!geo) return;
      // local: x = u along, y = up, z = out of the wall into the room; the face (relief FACE) sits on the room's edge
      const m = new THREE.Matrix4();
      const back = FACE / VPM;
      if (side === 'n') m.makeRotationY(0).setPosition(a0, FY, S.at - back);
      else if (side === 's') m.makeRotationY(Math.PI).setPosition(S.a1 + FACE / VPM, FY, S.at + back);
      else if (side === 'w') m.makeRotationY(Math.PI / 2).setPosition(S.at - back, FY, S.a1 + FACE / VPM);
      else m.makeRotationY(-Math.PI / 2).setPosition(S.at + back, FY, a0);
      geo.applyMatrix4(m);
      geos.push(geo);
    });
    const merged = mergeIndexed(geos);
    this.mesh(merged, reliefTexture(tex, TW, TH), 0.2).name = `walls:${r.id}`;
  }

  /** World point (m) on a side's face: along a (m), height y over the floor, out from the face. */
  wallPoint(S, a, y, out = 0) {
    return S.fixed === 'z' ? [a, FY + y, S.at + S.nz * out] : [S.at + S.nx * out, FY + y, a];
  }

  // ------------------------------------------------------------ ceilings
  buildCeiling(r, lit) {
    const U = Math.round((r.x1 - r.x0) * VPM), V = Math.round((r.z1 - r.z0) * VPM);
    const top = FY + r.h;
    const depth = new Int16Array(U * V);
    const tex = new Uint8Array(U * V * 4);
    // joists across the room's shorter way, about every 0.8 m
    const alongX = (r.x1 - r.x0) < (r.z1 - r.z0); // joists run along x (spaced in z)
    const L = alongX ? V : U, n = Math.max(2, Math.round(L / (0.8 * VPM)));
    const joists = [];
    for (let i = 1; i < n; i++) joists.push(Math.round((i * L) / n));
    const seed = r.id.charCodeAt(0) * 13;
    const board = { oak: 0x6a4a30, pine: 0x8a6a44, sooty: 0x4a3828, slab: 0x6e665c }[r.ceil] ?? 0x6a4a30;
    const hole = r.id === 'living' ? { u: (HOLE.x - r.x0) * VPM, v: (HOLE.z - r.z0) * VPM, rr: HOLE.r * VPM } : null;
    const sky = r.skylight ? { u: (r.skylight.x - r.x0) * VPM, v: (r.skylight.z - r.z0) * VPM, rr: r.skylight.r * VPM } : null;
    const slab = r.ceil === 'slab';
    for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
      const q = u + v * U;
      const along = alongX ? v : u, acr = alongX ? u : v;
      let c, rel = 0;
      let jd = 999;
      for (const j of joists) jd = Math.min(jd, Math.abs(along + 0.5 - j));
      if (jd <= 8) {
        const edge = jd > 7;
        c = edge ? mulc(OAK, 0.7) : mulc(OAK, (1.0 + (Math.floor(acr / 13) % 3 === 0 ? -0.06 : 0)) * sp3(u, v, 7, seed, 0.05, 0.1));
        rel = edge ? 9 : 10;
        if (!edge && (acr % 97 === 30) && jd < 2) c = 0x8a8a92; // a nail
      } else {
        // boards run along the joists' span direction (across them)
        const bw = 11, bi = Math.floor(acr / bw), li = acr % bw;
        const ends = Math.floor((along + bi * 37) / 150);
        c = mulc(board, 0.86 + Math.floor(hash2(bi, ends, seed) * 4) * 0.06);
        if (li === 0) c = mulc(board, 0.5);
        else if ((along + bi * 37) % 150 === 0) c = mulc(board, 0.6);
        else if (hash2(bi, along >> 3, seed + 1) < 0.08) c = mulc(c, 0.92);
      }
      // the hole you came through: boards nailed over it, a sagging tarp, roots poking through the gaps
      if (hole) {
        const du = u + 0.5 - hole.u, dv = v + 0.5 - hole.v, d = Math.hypot(du, dv) + (hash2(u >> 2, v >> 2, 3) - 0.5) * 6;
        if (d < hole.rr + 10) {
          if (d > hole.rr) { c = mixc(c, 0x2a1c12, 0.55); rel = Math.max(rel, 0); } // splintered, dirty edge
          const pb = Math.floor((du + 200) / 12), lp = (du + 200) % 12;
          if (d < hole.rr + 6 && Math.abs(dv) < hole.rr + 4) {
            if (lp < 1.2) { c = 0x0e0906; rel = 0; } // a gap between the patch boards
            else { c = mulc(0x9a7a50, 0.9 + hash2(pb, 1, 9) * 0.15); rel = 3; if (Math.abs(Math.abs(dv) - hole.rr + 2) < 1 && Math.abs(lp - 6) < 1) c = 0x9a9aa2; }
          }
        }
      }
      if (slab && jd > 8) { // stone slabs laid over the beams, a cold cellar's roof
        const sw = 44, sb = Math.floor(acr / sw), sl = acr % sw, ss = Math.floor((along + sb * 23) / 52), sa = (along + sb * 23) % 52;
        c = sl === 0 || sa === 0 ? 0x3a342e : mulc([0x6e665c, 0x625a52, 0x7a7266, 0x6a6258][Math.floor(hash2(sb, ss, seed) * 4)], sp3(u, v, 11, seed, 0.12, 0.1));
        if (hash2(u >> 3, v >> 3, seed + 9) < 0.05) c = mixc(c, 0xe8e4dc, 0.35); // a lick of whitewash
      }
      if (sky) { // the skylight: a round hole up the light well, its rim dressed in stone
        const d = Math.hypot(u + 0.5 - sky.u, v + 0.5 - sky.v);
        if (d < sky.rr) { depth[q] = 0; const o0 = q * 4; tex[o0] = tex[o0 + 1] = tex[o0 + 2] = 0; tex[o0 + 3] = 255; continue; }
        if (d < sky.rr + 10) { const a = Math.atan2(v + 0.5 - sky.v, u + 0.5 - sky.u), seg = Math.floor((a + Math.PI) / (Math.PI / 9)); c = mulc([0x8a8278, 0x7a7268, 0x948a7e][seg % 3], (d < sky.rr + 2 ? 0.85 : 1) * sp3(u, v, 13, seed, 0.1, 0.1)); rel = Math.max(rel, d < sky.rr + 3 ? 14 : 12); }
      }
      if (r.ceil === 'sooty') c = mixc(c, 0x1a1410, 0.25 + 0.2 * Math.max(0, 1 - Math.hypot(u / VPM - 2.4, v / VPM - 0.5) / 2.5));
      depth[q] = 4 + rel;
      const k = lit(r.x0 + (u + 0.5) / VPM, top - rel / VPM - 0.01, r.z0 + (v + 0.5) / VPM, 0, -1, 0);
      const o = q * 4, kb = 1.1; // (faces looking down get only the hemisphere's ground colour: lift them a little)
      tex[o] = Math.min(255, ((c >> 16) & 255) * k[0] * kb); tex[o + 1] = Math.min(255, ((c >> 8) & 255) * k[1] * kb); tex[o + 2] = Math.min(255, (c & 255) * k[2] * kb); tex[o + 3] = 255;
    }
    const geo = meshReliefTex(depth, U, V, { scale: S64, topShade: 0.9, bottomShade: 0.9 });
    // local z (out) → down; local y (v) → +z
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(r.x0, top + 4 / VPM, r.z0));
    this.mesh(geo, reliefTexture(tex, U, V), 0.42).name = `ceiling:${r.id}`;
  }

  // ------------------------------------------------------------ floors
  buildFloor(r, lit) {
    const U = Math.round((r.x1 - r.x0) * VPM), V = Math.round((r.z1 - r.z0) * VPM);
    const tex = new Uint8Array(U * V * 4);
    const seed = r.id.charCodeAt(1) * 7;
    for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
      const x = r.x0 + (u + 0.5) / VPM, z = r.z0 + (v + 0.5) / VPM;
      let c = floorTexel(r.floor, u, v, seed);
      // worn paler where feet go: the middle of the room and the doorways
      const wear = this.opts.wear ? this.opts.wear(x, z) : 0;
      if (wear > 0) c = mixc(c, mulc(c, 1.25), Math.min(0.5, wear));
      const soot = this.opts.soot ? this.opts.soot(x, FY, z) : 0;
      if (soot > 0) c = mixc(c, 0x1e1814, Math.min(0.6, soot * 0.7));
      const k = lit(x, FY + 0.01, z, 0, 1, 0);
      const o = ((V - 1 - v) * U + u) * 4;
      tex[o] = Math.min(255, ((c >> 16) & 255) * k[0]); tex[o + 1] = Math.min(255, ((c >> 8) & 255) * k[1]); tex[o + 2] = Math.min(255, (c & 255) * k[2]); tex[o + 3] = 255;
    }
    const geo = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2);
    geo.translate((r.x0 + r.x1) / 2, FY, (r.z0 + r.z1) / 2);
    const n = geo.getAttribute('position').count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    const m = this.mesh(geo, reliefTexture(tex, U, V), 0.12);
    m.name = `floor:${r.id}`;
    m.layers.disable(LAYER_OUTLINE);
    m.renderOrder = -1;
  }

  // ------------------------------------------------------------ collision (meters)
  collide() { this.boxes.push(...surfaceBoxes()); }

  dispose() {
    for (const m of this.meshes) { this.world.remove(m); m.geometry.dispose(); m.material.dispose(); }
    for (const t of this.textures) t.dispose();
  }
}

/** Packed surface meshes back into the scene (see HouseSurfaces.pack): returns the meshes. */
export function unpackSurfaces(list, world) {
  const out = [];
  for (const s of list) {
    const tex = reliefTexture(s.tex.data, s.tex.w, s.tex.h);
    const mat = voxelMaterial('toon', { unique: true });
    mat.map = tex;
    mat.emissive.setHex(0xffffff);
    mat.emissiveMap = tex;
    mat.emissiveIntensity = s.glow;
    mat.color.setScalar(CSCALE);
    mat.needsUpdate = true;
    const m = unquantize(s.q, mat);
    m.name = s.name;
    m.userData.room = s.room;
    if (s.outline) m.layers.enable(LAYER_OUTLINE);
    if (s.order) m.renderOrder = s.order;
    world.add(m);
    out.push(m);
  }
  return out;
}

/** Collision for every room's walls (with the doorways left open), the floor and the ceilings (meters). */
export function surfaceBoxes() {
  const boxes = [];
  {
    const B = (...b) => boxes.push(b);
    const xs = ROOMS.flatMap((r) => [r.x0, r.x1]), zs = ROOMS.filter((r) => r.z1 <= ROOMS[0].z1 + 0.01).flatMap((r) => [r.z0, r.z1]);
    const X0 = Math.min(...xs) - 1, X1 = Math.max(...xs) + 1, Z0 = Math.min(...zs) - 1;
    B(X0, FY - 1, Z0, X1, FY, ROOMS[0].z1 + 0.001); // the floor under the house
    for (const r of ROOMS) if (r.z1 > ROOMS[0].z1 + 0.01) B(r.x0 - 0.4, FY - 1, r.z0 - 0.4, r.x1 + 0.4, FY, r.z1 + 0.4); // and under rooms south of it
    for (const r of ROOMS) {
      const top = FY + r.h;
      if (!r.open) B(r.x0 - 0.3, top, r.z0 - 0.3, r.x1 + 0.3, top + 1, r.z1 + 0.3);
      for (const side of (r.open ? (r.walls || []) : ['n', 'e', 's', 'w'])) {
        const S = sideInfo(r, side);
        const ops = openingsOf(r, side).filter((o) => o.kind !== 'window').sort((a, b) => a.c - b.c);
        const shared = ROOMS.some((q) => q !== r && touches(q, S));
        // (outer walls are 0.4 m of rock; the south ones stop at your room's wall, z = 0)
        const t = shared ? WALL / 2 : side === 's' && S.at < 0 ? Math.min(0.4, -S.at) : 0.4;
        let a = S.a0 - (shared ? 0 : 0.4);
        const end = S.a1 + (shared ? 0 : 0.4);
        const box = (p, q, y0, y1) => {
          if (q - p < 1e-3) return;
          if (S.fixed === 'z') B(p, y0, S.nz > 0 ? S.at - t : S.at, q, y1, S.nz > 0 ? S.at : S.at + t);
          else B(S.nx > 0 ? S.at - t : S.at, y0, p, S.nx > 0 ? S.at : S.at + t, y1, q);
        };
        for (const o of ops) {
          box(a, o.c - o.w / 2, FY, top + 0.5);
          box(o.c - o.w / 2, o.c + o.w / 2, FY + o.h, top + 0.5); // over the doorway
          a = o.c + o.w / 2;
        }
        box(a, end, FY, top + 0.5);
      }
    }
  }
  return boxes;
}

/** Does room q have a wall right behind side S (a shared wall)? */
function touches(q, S) {
  if (S.fixed === 'z') {
    const zq = S.nz > 0 ? q.z1 : q.z0;
    return Math.abs(zq - (S.at - S.nz * WALL)) < 0.05 && q.x1 > S.a0 + 0.05 && q.x0 < S.a1 - 0.05;
  }
  const xq = S.nx > 0 ? q.x1 : q.x0;
  return Math.abs(xq - (S.at - S.nx * WALL)) < 0.05 && q.z1 > S.a0 + 0.05 && q.z0 < S.a1 - 0.05;
}

/** Floor texels: oak or pine boards, terracotta tiles, flagstones (u, v voxels, 1/64 m). */
function floorTexel(kind, u, v, seed) {
  if (kind === 'oak' || kind === 'pine') {
    const base = kind === 'oak' ? 0x7a5232 : 0x9a7046;
    const bw = kind === 'oak' ? 10 : 9;
    const bi = Math.floor(u / bw), li = u % bw;
    const off = Math.floor(hash2(bi, 0, seed) * 160);
    const len = kind === 'oak' ? 150 : 120;
    const seg = Math.floor((v + off) / len), lv = (v + off) % len;
    let c = mulc(base, 0.82 + Math.floor(hash2(bi, seg, seed) * 5) * 0.06);
    if (li === 0) return mulc(base, 0.42); // the gap between boards
    if (lv === 0) return mulc(base, 0.5);
    if (li === 1) c = mulc(c, 1.06);
    if ((lv === 3 || lv === len - 4) && (li === 3 || li === bw - 3)) return 0x3a2a20; // nails
    const grain = (li + Math.floor(hash2(bi, seg, seed + 1) * 4)) % 3 === 0 && hash2(Math.floor(v / 7), u, seed + 2) < 0.6;
    if (grain) c = mulc(c, 0.92);
    if (hash2(bi, seg, seed + 3) > 0.86 && Math.hypot(li - bw / 2, (lv % 40) - 20) < 1.5) c = mulc(base, 0.55); // a knot
    return c;
  }
  if (kind === 'terracotta') {
    const S = 13, tu = Math.floor(u / S), tv = Math.floor(v / S), lu = u % S, lv = v % S;
    if (lu === 0 || lv === 0) return 0x8a7a68;
    let c = [0xb8603a, 0xa8553a, 0xc06a40, 0x9e5034, 0xb46440][Math.floor(hash2(tu, tv, seed) * 5)];
    if (lu === 1 || lv === 1) c = mulc(c, 1.08);
    else if (lu === S - 1 || lv === S - 1) c = mulc(c, 0.9);
    return mulc(c, sp3(u, v, 8, seed, 0.08, 0.1));
  }
  if (kind === 'mossflag' || kind === 'terrace') {
    // old flags with moss and tiny glowcaps in the joints (the garden), or weathered slabs out on the cliff
    const rh = kind === 'terrace' ? 40 : 30, row = Math.floor(v / rh), off = Math.floor(hash2(row, 1, seed) * 40);
    const w = 26 + Math.floor(hash2(row, 2, seed) * 18);
    const bx = Math.floor((u + off) / w), lu = (u + off) % w, lv = v % rh;
    const joint = lu < 2 || lv < 2;
    if (joint) {
      const g = hash2(u, v, seed + 3);
      if (kind === 'mossflag') return g < 0.06 ? 0x8af0d0 : g < 0.5 ? 0x3e6a2a : 0x4f7a34;
      return g < 0.4 ? 0x2a2630 : 0x3a5a3a;
    }
    let c = kind === 'terrace' ? [0x6a6474, 0x5e5a68, 0x76707e, 0x645e6c][Math.floor(hash2(bx, row, seed) * 4)] : [0x7a7466, 0x6e685c, 0x847c6e, 0x726c60][Math.floor(hash2(bx, row, seed) * 4)];
    if (lu === 2 || lv === 2) c = mulc(c, 1.08);
    if (kind === 'mossflag' && hash2(u >> 2, v >> 2, seed + 4) < 0.12) c = mixc(c, 0x4f7a34, 0.45);
    return mulc(c, sp3(u, v, 9, seed, 0.12, 0.1) * (0.96 + n2(u / 9, v / 9, seed) * 0.05));
  }
  // flagstones: big irregular stones in staggered rows
  const rh = 34, row = Math.floor(v / rh), off = Math.floor(hash2(row, 1, seed) * 40);
  const w = 30 + Math.floor(hash2(row, 2, seed) * 16);
  const bx = Math.floor((u + off) / w), lu = (u + off) % w, lv = v % rh;
  const jag = hash2(bx, row, seed + 5) * 3;
  if (lu < 1.5 + jag * 0.3 || lv < 2) return 0x3a332c;
  let c = [0x7a7068, 0x6a6258, 0x847a6e, 0x726a62, 0x8a8072][Math.floor(hash2(bx, row, seed) * 5)];
  if (lu === 2 || lv === 2) c = mulc(c, 1.08);
  return mulc(c, sp3(u, v, 9, seed, 0.12, 0.1) * (0.96 + n2(u / 9, v / 9, seed) * 0.05));
}

/** Merge indexed geometries with position, normal, color (and uv). */
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

export { roomAt };

// Ingredients and dishes as chunky voxel sprites: the 16×16 item icon extruded into voxels.
// Also: per-ingredient colors (for chunks, particles, liquids) and slicing for the chop step.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VoxelGrid, voxelMesh, voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { meshVoxGreedy, hash3 } from '../bookends/vox.js';
import { iconCanvas } from '../gfx/PixelArt.js';
import { FIXED } from '../gfx/sprites16.js';
import { ITEMS } from '../data/items.js';
import { DISHES } from '../data/recipes.js';
import { mixHex, shade } from '../core/util.js';

const pixCache = new Map();
const luma = (c) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;

/** Icon pixels as a 16×16 array of hex colors (null = transparent). */
export function iconPixels(id) {
  if (pixCache.has(id)) return pixCache.get(id);
  const c = iconCanvas(id);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const W = c.width, H = c.height;
  const px = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    px.push(d[i + 3] > 128 ? (d[i] << 16) | (d[i + 1] << 8) | d[i + 2] : null);
  }
  // drop the dark 1px icon outline: the post pass already draws a crisp silhouette in 3D
  const trimmed = px.slice();
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : px[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = px[y * W + x];
    if (c === null || luma(c) > 0.24) continue;
    if (at(x - 1, y) === null || at(x + 1, y) === null || at(x, y - 1) === null || at(x, y + 1) === null) trimmed[y * W + x] = null;
  }
  const out = { W, H, px: trimmed, raw: px, res: Math.max(W, H) };
  pixCache.set(id, out);
  return out;
}

/** Chamfer distance (in pixels) from each opaque cell to the nearest transparent one. */
function insetMap(occ, W, H) {
  const d = new Float32Array(W * H);
  const INF = 1e4;
  for (let i = 0; i < W * H; i++) d[i] = occ[i] ? INF : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[x + y * W]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = x + y * W;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = x + y * W;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4);
  }
  return d;
}

/** Representative color of an item: its most common mid-tone pixel color. */
const ACCENTS = new Set(Object.values(FIXED));
export function mainColor(id) {
  const { px } = iconPixels(id);
  const pick = (skipAccents) => {
    const counts = new Map();
    for (const c of px) {
      if (c === null || (skipAccents && ACCENTS.has(c))) continue;
      const l = luma(c);
      if (l < 0.22 || l > 0.96) continue;
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    let best = null, bn = 0;
    for (const [c, n] of counts) if (n > bn) { bn = n; best = c; }
    return best;
  };
  return pick(true) ?? pick(false) ?? 0xc8a070;
}

/** Color of a dish (liquid / batter tint). */
export function dishColor(dishId) {
  return DISHES[dishId]?.icon?.c ?? 0x8a9a5a;
}

/**
 * A sprite description: opaque pixels, optionally rotated 90° so the long axis runs along x.
 * Returns {cells: [{x, z, c}], x0, x1, z0, z1} in icon pixel coords (x right, z down the icon).
 */
export function spriteCells(id, { horizontal = false } = {}) {
  const { W, H, px } = iconPixels(id);
  let cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = px[y * W + x];
    if (c !== null) cells.push({ x, z: y, c });
  }
  const bounds = (cs) => {
    let x0 = 99, x1 = -1, z0 = 99, z1 = -1;
    for (const q of cs) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    return { x0, x1, z0, z1 };
  };
  let b = bounds(cells);
  if (horizontal && (b.z1 - b.z0) > (b.x1 - b.x0) * 1.15) {
    // rotate 90° clockwise: (x, z) → (H-1-z, x)
    cells = cells.map((q) => ({ x: H - 1 - q.z, z: q.x, c: q.c }));
    b = bounds(cells);
  }
  return { cells, ...b, res: Math.max(W, H) };
}

/** World size of one icon pixel for a sprite, given a size designed for 16px icons. */
export function pxFor(sprite, px16) { return px16 * 16 / (sprite.res || 16); }

/**
 * Build a voxel slab from sprite cells (lying on its back, icon top = far side). The slab is
 * puffy: thickest in the middle of the shape and rounded off toward its outline, with the icon's
 * pixel art on top and darker, warmer sides. Sizes are given for 16px icons (px = world size of
 * one 16px-icon pixel, depth = thickness in those pixels) and scale to the icon's real resolution.
 * cols: [from, to) column filter. Returns a mesh with origin at the bottom center of the FULL sprite.
 */
export function slabMesh(sprite, { px = 0.035, depth = 2, cols = null, kind = 'toon', material = null } = {}) {
  const { cells, x0, x1, z0, z1 } = sprite;
  const res = sprite.res || 16;
  const k = res / 16;
  const pxe = px / k;
  const D = Math.max(1, Math.round(depth * k));
  const occ = new Uint8Array(res * res);
  for (const q of cells) occ[q.x + q.z * res] = 1;
  const inset = insetMap(occ, res, res);
  const g = new VoxelGrid(res, D, res);
  for (const q of cells) {
    if (cols && (q.x < cols[0] || q.x >= cols[1])) continue;
    const r = inset[q.x + q.z * res];
    const h = Math.max(1, Math.min(D, Math.round(D * Math.min(1, 0.45 + r / (2.2 * k)))));
    for (let y = 0; y < h; y++) g.set(q.x, y, q.z, y === h - 1 ? q.c : y === h - 2 ? shade(q.c, 0.9) : mixHex(shade(q.c, 0.72), 0x3a1a10, 0.12));
  }
  const cx = (x0 + x1 + 1) / 2, cz = (z0 + z1 + 1) / 2;
  return voxelMesh(g, { pivot: [cx, 0, cz], scale: pxe, kind, material, outline: true, greedy: true });
}

/**
 * An upright sprite (standing, facing +z): for dishes on the plate and held items. Puffy like the
 * slabs (thicker in the middle). Origin at the bottom center. Sizes as for slabMesh.
 */
export function standeeMesh(id, { px = 0.035, depth = 2, kind = 'toon', material = null } = {}) {
  const { W, H, px: pix } = iconPixels(id);
  const res = Math.max(W, H);
  const k = res / 16;
  const pxe = px / k;
  const D = Math.max(2, Math.round(depth * k));
  const occ = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) occ[i] = pix[i] === null ? 0 : 1;
  const inset = insetMap(occ, W, H);
  const g = new VoxelGrid(W, H, D * 2 + 1);
  let x0 = 1e9, x1 = -1, yb = 1e9;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = pix[y * W + x];
    if (c === null) continue;
    const vy = H - 1 - y;
    const r = inset[x + y * W];
    const h = Math.max(1, Math.min(D, Math.round(D * Math.min(1, 0.4 + r / (2.2 * k)))));
    for (let z = D - h; z <= D + h; z++) g.set(x, vy, z, z === D + h ? c : z === D - h ? shade(c, 0.8) : shade(c, 0.86));
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); yb = Math.min(yb, vy);
  }
  return voxelMesh(g, { pivot: [(x0 + x1 + 1) / 2, yb, D + 0.5], scale: pxe, kind, material, outline: true, greedy: true });
}

/** Which ingredients get chopped (solid things first). */
const NOT_CHOPPY = new Set(['salt_crystal', 'egg', 'flour', 'honey', 'rootbeer', 'butter']);
export function chopQueue(ings) {
  const solid = ings.filter((id) => !NOT_CHOPPY.has(id));
  const rest = ings.filter((id) => NOT_CHOPPY.has(id) && id !== 'salt_crystal');
  return solid.length ? solid : rest.length ? rest : ings.slice();
}

export function itemName(id) { return ITEMS[id]?.name || id; }

/**
 * Diced chunks for soups, salads and pans: every piece is its own little hand-cut voxel cube
 * (flesh, a strip of skin/peel, a lighter cut top, nibbled corners) at a random yaw and tilt,
 * all merged into one outlined mesh. `radius` is in units of `px` (the old chunk voxel size).
 */
export function chunkMesh(colors, n, radius, seed = 1, px = 0.03) {
  const fine = px * 0.4;
  let s = (seed * 9301 + 49297) % 233280;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const geos = [], placed = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i++) {
    let x = 0, z = 0;
    for (let t = 0; t < 8; t++) {   // spread the pieces out a little (a few tries, then accept)
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius * px;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      if (placed.every(([ox, oz]) => (ox - x) ** 2 + (oz - z) ** 2 > (px * 1.7) ** 2)) break;
    }
    placed.push([x, z]);
    const base = colors[i % colors.length];
    const w = 4 + ((rnd() * 3) | 0), d = 3 + ((rnd() * 3) | 0), h = 2 + ((rnd() * 2) | 0);
    const g = new VoxelGrid(w, h, d);
    const flesh = mixHex(base, 0xffffff, 0.1), skin = shade(base, 0.7), top = mixHex(base, 0xffffff, 0.28);
    const skinSide = (rnd() * 5) | 0;   // 0..3: one side keeps its peel, 4: all flesh
    for (let yy = 0; yy < h; yy++) for (let zz = 0; zz < d; zz++) for (let xx = 0; xx < w; xx++) {
      const ex = xx === 0 || xx === w - 1, ez = zz === 0 || zz === d - 1;
      if (ex && ez && (yy === h - 1 ? rnd() < 0.6 : rnd() < 0.15)) continue;   // nibbled corners
      const peel = (skinSide === 0 && xx === 0) || (skinSide === 1 && xx === w - 1) || (skinSide === 2 && zz === 0) || (skinSide === 3 && zz === d - 1);
      let c = peel ? skin : yy === h - 1 ? top : flesh;
      if (!peel && yy === h - 1 && (ex || ez)) c = mixHex(c, 0xffffff, 0.12);   // bright cut edge
      g.set(xx, yy, zz, shade(c, 1 + (hash3(xx, yy, zz, seed * 31 + i) - 0.5) * 0.14));
    }
    const geo = meshVoxGreedy(g, { scale: fine, pivot: [w / 2, h * 0.45, d / 2] });
    e.set((rnd() - 0.5) * 0.4, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4);
    m4.compose(p.set(x, 0, z), q.setFromEuler(e), one);
    geo.applyMatrix4(m4);
    geos.push(geo);
  }
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, voxelMaterial('toon'));
  mesh.layers.enable(LAYER_OUTLINE);
  return mesh;
}


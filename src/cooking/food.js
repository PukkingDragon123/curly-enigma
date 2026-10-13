// Ingredients and dishes as chunky voxel sprites: the 16×16 item icon extruded into voxels.
// Also: per-ingredient colors (for chunks, particles, liquids) and slicing for the chop step.
import * as THREE from 'three';
import { VoxelGrid, voxelMesh } from '../gfx/Voxel.js';
import { iconCanvas } from '../gfx/PixelArt.js';
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
  const out = { W, H, px: trimmed, raw: px };
  pixCache.set(id, out);
  return out;
}

/** Representative color of an item: average of its mid-tone pixels. */
export function mainColor(id) {
  const { px } = iconPixels(id);
  let r = 0, g = 0, b = 0, n = 0;
  for (const c of px) {
    if (c === null) continue;
    const l = luma(c);
    if (l < 0.22 || l > 0.95) continue;
    r += (c >> 16) & 255; g += (c >> 8) & 255; b += c & 255; n++;
  }
  if (!n) return 0xc8a070;
  return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
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
  return { cells, ...b };
}

/**
 * Build a flat voxel slab from sprite cells (lying on its back, icon top = far side).
 * cols: [from, to) column filter. Returns a mesh with origin at the bottom center of the FULL sprite.
 */
export function slabMesh(sprite, { px = 0.035, depth = 2, cols = null, kind = 'toon', material = null } = {}) {
  const { cells, x0, x1, z0, z1 } = sprite;
  const g = new VoxelGrid(16, depth, 16);
  for (const q of cells) {
    if (cols && (q.x < cols[0] || q.x >= cols[1])) continue;
    for (let y = 0; y < depth; y++) g.set(q.x, y, q.z, y === depth - 1 ? q.c : shade(q.c, 0.82));
  }
  const cx = (x0 + x1 + 1) / 2, cz = (z0 + z1 + 1) / 2;
  return voxelMesh(g, { pivot: [cx, 0, cz], scale: px, kind, material, outline: true });
}

/**
 * An upright sprite (standing, facing +z) — for dishes on the plate and held items.
 * Origin at the bottom center.
 */
export function standeeMesh(id, { px = 0.035, depth = 2, kind = 'toon', material = null } = {}) {
  const { W, H, px: pix } = iconPixels(id);
  const g = new VoxelGrid(W, H, depth);
  let x0 = 99, x1 = -1, yb = 99;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = pix[y * W + x];
    if (c === null) continue;
    const vy = H - 1 - y;
    for (let z = 0; z < depth; z++) g.set(x, vy, z, z === depth - 1 ? c : shade(c, 0.8));
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); yb = Math.min(yb, vy);
  }
  return voxelMesh(g, { pivot: [(x0 + x1 + 1) / 2, yb, depth / 2], scale: px, kind, material, outline: true });
}

/** Chunk colors for soups etc: a few shades of an item's color. */
export function chunkPalette(id) {
  const c = mainColor(id);
  return [c, shade(c, 0.85), mixHex(c, 0xffffff, 0.25)];
}

/** Which ingredients get chopped (solid things first). */
const NOT_CHOPPY = new Set(['salt_crystal', 'egg', 'flour', 'honey', 'rootbeer', 'butter']);
export function chopQueue(ings) {
  const solid = ings.filter((id) => !NOT_CHOPPY.has(id));
  const rest = ings.filter((id) => NOT_CHOPPY.has(id) && id !== 'salt_crystal');
  return solid.length ? solid : rest.length ? rest : ings.slice();
}

export function itemName(id) { return ITEMS[id]?.name || id; }

/** Mesh of little cube chunks (for soups, salads, pans). */
export function chunkMesh(colors, n, radius, seed = 1, px = 0.03) {
  const g = new VoxelGrid(32, 3, 32);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius;
    const x = Math.round(16 + Math.cos(a) * r), z = Math.round(16 + Math.sin(a) * r);
    const c = colors[i % colors.length];
    g.set(x, 0, z, c); g.set(x + 1, 0, z, shade(c, 0.9));
    if (rnd() < 0.6) g.set(x, 1, z, mixHex(c, 0xffffff, 0.15));
    if (rnd() < 0.5) g.set(x, 0, z + 1, shade(c, 0.85));
  }
  return voxelMesh(g, { pivot: [16.5, 0, 16.5], scale: px, kind: 'toon', outline: true });
}

export { THREE };

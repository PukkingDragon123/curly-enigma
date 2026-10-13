// Procedural pixel art: the raster canvas, color ramps, template rendering and the
// 32×32 item icon generator used across the UI (and, glow-encoded, in the mine).
//
// Icons are drawn by the modules in gfx/px/ (minerals, gear, flora, fauna, food, home).
// Every icon is a 32×32 PixelCanvas; emissive pixels are flagged on pc.glow so the mine
// can encode them in alpha (see mineIconCanvas) while the UI gets a soft halo instead.
import * as THREE from 'three';
import { T, FIXED } from './sprites16.js';
import { PixelCanvas } from './px/canvas.js';
import { mixHex, shade, hexToRgb, hashStr, hexCss } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { METALS, INFUSIONS } from '../data/weapons.js';
import { glowHalo } from './px/shade.js';
import { drawMineral } from './px/minerals.js';
import { drawGear, drawWeaponArt } from './px/gear.js';
import { drawFlora } from './px/flora.js';
import { drawFauna } from './px/fauna.js';
import { drawFood } from './px/food.js';
import { drawHome } from './px/home.js';

export { PixelCanvas };

/** Icon size in pixels. */
export const ICON = 32;

// ---------------------------------------------------------------- color ramps
/** Legacy 5-step ramp {1..5, o} (kept for the iso/home painters and 16px templates). */
export function ramp(c) {
  return {
    1: mixHex(c, 0xfffbe8, 0.55),
    2: mixHex(c, 0xfff0c8, 0.25),
    3: c,
    4: mixHex(shade(c, 0.7), 0x30205a, 0.18),
    5: mixHex(shade(c, 0.45), 0x1a0c30, 0.3),
    o: mixHex(shade(c, 0.22), 0x150a12, 0.6),
  };
}

// ---------------------------------------------------------------- templates
/**
 * Draw an ASCII template (any size). pal: {1..5,o} main ramp + accents {a..f} + overrides;
 * unknown characters fall back to the FIXED palette of sprites16.js.
 */
export function drawTemplate(pc, rows, pal, ox = 0, oy = 0, flipX = false) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      let c = pal[ch];
      if (c === undefined) c = FIXED[ch];
      if (c === undefined) continue;
      const xx = flipX ? row.length - 1 - x : x;
      pc.set(ox + xx, oy + y, c);
    }
  }
}

/** The legacy 16×16 templates (still available to anything that wants them). */
export const TEMPLATES16 = T;

// ---------------------------------------------------------------- icons
let specIds = null;
/** Item id for an icon spec object (specs in ITEMS are unique objects). */
function idOfSpec(spec) {
  if (!specIds) {
    specIds = new Map();
    for (const [id, it] of Object.entries(ITEMS)) if (it.icon) specIds.set(it.icon, id);
  }
  return specIds.get(spec) || null;
}

/**
 * Raw icon art (no UI halo): a 32×32 PixelCanvas with emissive pixels flagged on pc.glow.
 * id is optional (looked up from the spec when omitted).
 */
export function drawIconArt(spec, seed = 1, id = null) {
  const pc = new PixelCanvas(ICON);
  id = id || idOfSpec(spec);
  const ok = drawMineral(pc, spec, id, seed) || drawGear(pc, spec, id, seed) || drawFlora(pc, spec, id, seed) ||
    drawFauna(pc, spec, id, seed) || drawFood(pc, spec, id, seed) || drawHome(pc, spec, id, seed);
  if (!ok) unknown(pc);
  return pc;
}

function unknown(pc) {
  pc.rect(9, 9, 14, 14, 0xc84ac8);
  pc.rect(12, 12, 8, 8, 0x2a1a2a);
}

/** Soft glow around emissive pixels for the UI (parchment & dark panels). */
function finishUI(pc) {
  if (!pc.glow) return pc;
  let n = 0, r = 0, g = 0, b = 0;
  for (let i = 0; i < pc.glow.length; i++) if (pc.glow[i] > 0.3) {
    n++;
    r += pc.d[i * 4]; g += pc.d[i * 4 + 1]; b += pc.d[i * 4 + 2];
  }
  if (n < 3) return pc;
  const c = ((Math.min(255, r / n * 1.05) << 16) | (Math.min(255, g / n * 1.05) << 8) | Math.min(255, b / n * 1.05)) >>> 0;
  glowHalo(pc, mixHex(c, 0xffffff, 0.25), 70, 2);
  return pc;
}

/** Render an icon spec to a 32×32 PixelCanvas (UI version, with glow halos). */
export function drawIcon(spec, seed = 1) {
  return finishUI(drawIconArt(spec, seed));
}

/**
 * The same icon reduced to `size` px (default 16) for places that only have room for a
 * tiny one (sign boards, minimaps). Each block takes its most common opaque color, so
 * outlines and highlights survive better than with smoothing. Returns a PixelCanvas.
 */
export function drawIconSmall(spec, seed = 1, size = 16) {
  const src = drawIconArt(spec, seed);
  const k = ICON / size;
  const out = new PixelCanvas(size);
  for (let by = 0; by < size; by++) for (let bx = 0; bx < size; bx++) {
    const counts = new Map();
    let opaque = 0, glow = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const x = Math.floor(bx * k + i), y = Math.floor(by * k + j);
      if (src.alpha(x, y) < 128) continue;
      opaque++;
      const c = src.getHex(x, y);
      counts.set(c, (counts.get(c) || 0) + 1);
      glow = Math.max(glow, src.glowAt(x, y));
    }
    if (opaque * 2 < k * k) continue;
    let best = -1, bn = -1, bl = 9;
    for (const [c, n] of counts) {
      const l = (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
      // most frequent wins; ties go to the darker color so outlines hold
      if (n > bn || (n === bn && l < bl)) { best = c; bn = n; bl = l; }
    }
    out.set(bx, by, best);
    if (glow) out.emit(bx, by, glow);
  }
  return out;
}

// ---------------------------------------------------------------- weapons
/**
 * Diagonal weapon icon (handle bottom-left, tip top-right) on a canvas of any size
 * (art is authored at 32×32 and scaled by nearest neighbour for other sizes).
 */
export function drawWeapon(pc, type, metalColor, infusionColor) {
  if (pc.w === ICON && pc.h === ICON) { drawWeaponArt(pc, type, metalColor, infusionColor); return; }
  const tmp = new PixelCanvas(ICON);
  drawWeaponArt(tmp, type, metalColor, infusionColor);
  const kx = ICON / pc.w, ky = ICON / pc.h;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const sx = Math.min(ICON - 1, Math.floor((x + 0.5) * kx)), sy = Math.min(ICON - 1, Math.floor((y + 0.5) * ky));
    const a = tmp.alpha(sx, sy);
    if (a) pc.set(x, y, tmp.getHex(sx, sy), a);
  }
}

// ---------------------------------------------------------------- caches / public API
const urlCache = new Map();

/** Committed 32×32 canvas for an item icon. */
export function iconCanvas(id) {
  const it = ITEMS[id];
  const spec = it?.icon || { k: '?' };
  return finishUI(drawIconArt(spec, hashStr(id), id)).commit();
}

/** Data URL for an item icon (cached). */
export function iconURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const url = iconCanvas(id).toDataURL();
  urlCache.set(id, url);
  return url;
}

/** Data URL for an arbitrary icon spec under a cache key (e.g. 'ui:coin'). */
export function specURL(key, spec) {
  if (urlCache.has(key)) return urlCache.get(key);
  const url = drawIcon(spec, hashStr(key)).commit().toDataURL();
  urlCache.set(key, url);
  return url;
}

/** Icon for a forged weapon instance or type+metal. */
export function weaponIconURL(type, metal, infusion) {
  const key = `w:${type}:${metal}:${infusion || ''}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const pc = new PixelCanvas(ICON);
  drawWeapon(pc, type, METALS[metal]?.color ?? 0xa0a0a0, infusion ? INFUSIONS[infusion]?.color : null);
  const url = pc.commit().toDataURL();
  urlCache.set(key, url);
  return url;
}

/** THREE texture from a canvas with crisp pixel sampling. */
export function pixelTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export { hexCss, hexToRgb };

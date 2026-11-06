// Procedural pixel art: the raster canvas, color ramps, template rendering and the
// 64×64 item icon generator used across the UI (and, glow-encoded, in the mine).
//
// Icons are drawn by the modules in gfx/px/ (minerals, gear, flora, fauna, food, home) and the
// cooking / explosives icon modules. They are authored on a 32-unit design grid and rasterised
// natively at 2× (gfx/px/res.js), so every icon is a 64×64 PixelCanvas with 1px outlines and
// real-pixel detail; it shows crisp at 64 / 128 CSS px and at 32 CSS px on 2× screens. Drawers
// still authored on the old 32×32 grid (relics, loot, quest items, build blocks) are drawn at
// scale 1 and doubled. Emissive pixels are flagged on pc.glow so the mine can encode them in
// alpha while the UI gets a soft halo instead. drawIconSmall() reduces an icon for places that
// need fewer pixels (signs, minimaps, the 3D voxel stills and snacks).
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
import { drawCookIcon } from '../cooking/icons.js'; // cooking part: new ingredients + dishes ({ k: 'cook' })
import { drawRelic } from '../deep/ruins/relicArt.js'; // ruins part: relics ({ k: 'relic' })
import { drawQuestIcon } from './questIcons.js'; // quests part: quest items ({ k: 'quest' })
import { drawLootIcon } from '../deep/enemies/lootArt.js'; // creatures part: hides, fangs, eggs ({ k: 'loot' })
import { drawBuildIcon } from '../deep/build/art.js'; // building part: blocks, crafting stuff, axes/spades/shears ({ k: 'block' | 'btool' })
import { withScale } from './px/res.js';

export { PixelCanvas };

/** Icon size in pixels (the 32-unit design grid at 2×). */
export const ICON = 64;
/** Real pixels per design pixel. */
const UP = ICON / 32;

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

// drawers authored on the design grid (native ICON px) and on the old 32-px grid (doubled)
const NATIVE = [];
const LEGACY = [drawMineral, drawGear, drawFlora, drawFauna, drawFood, drawHome, drawCookIcon, (pc, spec) => drawRelic(pc, spec), (pc, spec) => drawLootIcon(pc, spec), (pc, spec) => drawQuestIcon(pc, spec), (pc, spec) => drawBuildIcon(pc, spec)];

/** Nearest-neighbour k× copy of a PixelCanvas (pixels and emissive layer). */
function upscale(src, k) {
  const out = new PixelCanvas(src.w * k, src.h * k);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const a = src.alpha(x, y);
    if (!a) continue;
    const c = src.getHex(x, y), g = src.glowAt(x, y);
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { out.put(x * k + i, y * k + j, c, a); if (g) out.emit(x * k + i, y * k + j, g); }
  }
  return out;
}

/**
 * Raw icon art (no UI halo): an ICON×ICON PixelCanvas with emissive pixels flagged on pc.glow.
 * id is optional (looked up from the spec when omitted).
 */
export function drawIconArt(spec, seed = 1, id = null) {
  const pc = new PixelCanvas(ICON);
  id = id || idOfSpec(spec);
  if (NATIVE.some((f) => f(pc, spec, id, seed))) return pc;
  const sm = new PixelCanvas(32);
  if (withScale(1, () => LEGACY.some((f) => f(sm, spec, id, seed)))) return upscale(sm, UP);
  unknown(pc);
  return pc;
}

function unknown(pc) {
  pc.rect(9 * UP, 9 * UP, 14 * UP, 14 * UP, 0xc84ac8);
  pc.rect(12 * UP, 12 * UP, 8 * UP, 8 * UP, 0x2a1a2a);
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
  glowHalo(pc, mixHex(c, 0xffffff, 0.25), 70, 2 * UP - 1);
  return pc;
}

/** Render an icon spec to an ICON×ICON PixelCanvas (UI version, with glow halos). */
export function drawIcon(spec, seed = 1) {
  return finishUI(drawIconArt(spec, seed));
}

/**
 * The same icon reduced to `size` px (default 16) for places that only have room for a
 * smaller one (sign boards, minimaps, voxel models). Returns a PixelCanvas.
 */
export function drawIconSmall(spec, seed = 1, size = 16, id = null) {
  return reduce(drawIconArt(spec, seed, id), size);
}

/**
 * Reduce a square PixelCanvas to `size` px: each block takes its most common opaque color
 * (ties go to the darker one), so outlines and highlights survive better than with smoothing.
 */
export function reduce(src, size) {
  if (src.w === size) return src;
  const k = src.w / size;
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
 * (art is drawn at ICON px; whole fractions are reduced block-wise, other sizes sampled).
 */
const WEAPON_NATIVE = false;
function weaponArt(type, metalColor, infusionColor) {
  if (WEAPON_NATIVE) { const pc = new PixelCanvas(ICON); drawWeaponArt(pc, type, metalColor, infusionColor); return pc; }
  const sm = new PixelCanvas(32);
  withScale(1, () => drawWeaponArt(sm, type, metalColor, infusionColor));
  return upscale(sm, UP);
}
export function drawWeapon(pc, type, metalColor, infusionColor) {
  const tmp = weaponArt(type, metalColor, infusionColor);
  if (pc.w === ICON && pc.h === ICON) { pc.blit(tmp); return; }
  if (pc.w === pc.h && ICON % pc.w === 0) { pc.blit(reduce(tmp, pc.w)); return; }
  const kx = ICON / pc.w, ky = ICON / pc.h;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const sx = Math.min(ICON - 1, Math.floor((x + 0.5) * kx)), sy = Math.min(ICON - 1, Math.floor((y + 0.5) * ky));
    const a = tmp.alpha(sx, sy);
    if (a) pc.set(x, y, tmp.getHex(sx, sy), a);
  }
}

// ---------------------------------------------------------------- caches / public API
const urlCache = new Map();
const urlKeys = new Map(); // icon URL → item id / weapon key (so a toast's icon can be shown in 3D: ui/itemVox.js)
/** The item id (or 'w:type:metal:infusion') an iconURL/weaponIconURL string was made for, or null. */
export function iconKeyOf(url) { return urlKeys.get(url) || null; }

/** Committed ICON×ICON canvas for an item icon (or reduced to `size` px for voxel models etc.). */
export function iconCanvas(id, size = ICON) {
  const it = ITEMS[id];
  const spec = it?.icon || { k: '?' };
  const pc = finishUI(drawIconArt(spec, hashStr(id), id));
  return (size === ICON ? pc : reduce(pc, size)).commit();
}

/** Data URL for an item icon (cached). */
export function iconURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const url = iconCanvas(id).toDataURL();
  urlCache.set(id, url);
  urlKeys.set(url, id);
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
  urlKeys.set(url, key);
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

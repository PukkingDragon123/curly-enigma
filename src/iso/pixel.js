// 2D pixel-art helpers for the iso scenes: a tiny bitmap font, glow / light-pool /
// shadow / sunbeam textures, shop sign boards and the paintings and posters.
import * as THREE from 'three';
import { PixelCanvas, pixelTexture, drawIcon, drawIconSmall, ramp } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { makeRng, mixHex, shade } from '../core/util.js';

// ---------------------------------------------------------------- 3x5 font
const G = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  ',': ['.', '.', '.', '#', '#'], '.': ['.', '.', '.', '.', '#'], "'": ['#', '#', '.', '.', '.'], ':': ['.', '#', '.', '#', '.'],
  '!': ['#', '#', '#', '.', '#'], '&': ['.#.', '#.#', '.#.', '#.#', '.##'], '-': ['...', '...', '###', '...', '...'],
  '?': ['##.', '..#', '.#.', '...', '.#.'], '/': ['..#', '..#', '.#.', '#..', '#..'], ' ': ['..', '..', '..', '..', '..'],
  '·': ['.', '.', '#', '.', '.'], '$': ['.##', '##.', '.#.', '.##', '##.'],
};

/** Pixels of a string in the 3x5 font: [[x, y], ...] with y down from the top, at a scale. */
export function textPixels(str, scale = 1) {
  const out = [];
  let cx = 0;
  for (const ch of str.toUpperCase()) {
    const g = G[ch] || G['?'];
    for (let r = 0; r < 5; r++) for (let k = 0; k < g[r].length; k++) if (g[r][k] === '#') for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) out.push([cx + k * scale + i, r * scale + j]);
    cx += (g[0].length + 1) * scale;
  }
  return out;
}

export function textWidth(str, scale = 1) {
  let w = 0;
  for (const ch of str.toUpperCase()) w += ((G[ch] || G['?'])[0].length + 1) * scale;
  return Math.max(0, w - scale);
}

/** Draw text with the 3x5 font. opts: {shadow: color, scale, outline: color} */
export function drawText(pc, str, x, y, color, opts = {}) {
  const s = opts.scale || 1;
  const put = (px, py, c) => { for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) pc.set(px + i, py + j, c); };
  const pass = (ox, oy, c) => {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = G[ch] || G['?'];
      for (let r = 0; r < 5; r++) for (let k = 0; k < g[r].length; k++) if (g[r][k] === '#') put(cx + k * s + ox, y + r * s + oy, c);
      cx += (g[0].length + 1) * s;
    }
  };
  if (opts.outline !== undefined) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) pass(ox, oy, opts.outline);
  if (opts.shadow !== undefined) pass(0, s, opts.shadow);
  pass(0, 0, color);
}

export function drawTextCentered(pc, str, cx, y, color, opts = {}) {
  drawText(pc, str, Math.round(cx - textWidth(str, opts.scale || 1) / 2), y, color, opts);
}

// ---------------------------------------------------------------- cached textures
const cache = new Map();
function cached(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const t = fn();
  t.userData.shared = true;
  cache.set(key, t);
  return t;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Round light pool for the floor: stepped, dithered falloff (white, tint with material color). */
export function poolTexture() {
  return cached('pool', () => {
    const n = 96;
    const pc = new PixelCanvas(n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = (x + 0.5 - n / 2) / (n / 2), dy = (y + 0.5 - n / 2) / (n / 2);
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r >= 1) continue;
        const v = Math.pow(1 - r, 1.6);
        const lv = Math.floor(v * 4 + BAYER[(y % 4) * 4 + (x % 4)] / 16) / 4;
        if (lv <= 0) continue;
        pc.set(x, y, 0xffffff, Math.round(lv * 255));
      }
    return pixelTexture(pc.commit());
  });
}

/** Small round glow for halo sprites. */
export function glowTexture() {
  return cached('glow', () => {
    const n = 16;
    const pc = new PixelCanvas(n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = (x + 0.5 - n / 2) / (n / 2), dy = (y + 0.5 - n / 2) / (n / 2);
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r >= 1) continue;
        const v = Math.pow(1 - r, 2);
        const lv = Math.floor(v * 3 + BAYER[(y % 4) * 4 + (x % 4)] / 16) / 3;
        if (lv > 0) pc.set(x, y, 0xffffff, Math.round(lv * 255));
      }
    return pixelTexture(pc.commit());
  });
}

/** Blob shadow under characters. */
export function shadowTexture() {
  return cached('shadow', () => {
    const pc = new PixelCanvas(16, 16);
    pc.ellipse(8, 8, 7.5, 7.5, 0x000000, 110);
    pc.ellipse(8, 8, 5.5, 5.5, 0x000000, 170);
    return pixelTexture(pc.commit());
  });
}

/** Vertical sunbeam: dithered soft edges and faint streaks. */
export function beamTexture() {
  return cached('beam', () => {
    // 32 texels per world unit on the 2 x 16 beam plane, so the dither stays fine
    const w = 64, h = 512;
    const pc = new PixelCanvas(w, h);
    const rng = makeRng(42);
    // soft vertical streaks (smoothly varying across x) for a god-ray look
    const knots = Array.from({ length: 10 }, () => rng.range(0.65, 1.2));
    const streak = (x) => { const f = (x / w) * (knots.length - 1), i = Math.floor(f), t = f - i; const a = knots[i], b = knots[Math.min(knots.length - 1, i + 1)]; return a + (b - a) * (t * t * (3 - 2 * t)); };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = Math.abs((x + 0.5) / w - 0.5) * 2;
        let v = Math.pow(Math.max(0, 1 - dx), 0.9) * streak(x);
        const fy = y / h;
        // fades out over the bottom ~3 units (so it doesn't wash over the booth behind the sun spot), brighter low
        const lowFade = Math.min(1, (1 - fy) * (16 / 3));
        v *= lowFade * lowFade * (0.55 + 0.45 * fy);
        v = Math.max(0, Math.min(1, v));
        const lv = Math.floor(v * 6 + BAYER[(y % 4) * 4 + (x % 4)] / 16) / 6;
        if (lv > 0) pc.set(x, y, 0xffffff, Math.round(lv * 255));
      }
    return pixelTexture(pc.commit());
  });
}

/** An item's icon as a PixelCanvas: full size (32 px), or a clean small version when size < 32. */
export function iconCanvasFor(id, size = 0) {
  const it = ITEMS[id];
  const spec = it?.icon || { k: '?' };
  if (size && size < 32 && drawIconSmall) return drawIconSmall(spec, 7, size);
  return drawIcon(spec, 7);
}

/** Texture from a PixelCanvas; caller owns it (disposed with its material). */
export function texFrom(pc) {
  return pixelTexture(pc.commit ? pc.commit() : pc);
}

// ---------------------------------------------------------------- shop signs
/** Blit src into dst at (dx,dy), scaled by an integer factor (or every other pixel when s = 0.5). */
export function blitScaled(dst, src, dx, dy, s = 1) {
  if (s === 1) { dst.blit(src, dx, dy); return; }
  if (s < 1) {
    const st = Math.round(1 / s);
    for (let y = 0; y < src.h; y += st) for (let x = 0; x < src.w; x += st) { const a = src.alpha(x, y); if (a) dst.set(dx + x / st, dy + y / st, src.getHex(x, y), a); }
    return;
  }
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const a = src.alpha(x, y);
    if (a) for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) dst.set(dx + x * s + i, dy + y * s + j, src.getHex(x, y), a);
  }
}

/**
 * A hanging/mounted shop sign: wooden board with a pixel icon and lettering.
 * opts: {w, h (in 16-per-unit pixels), scale (texel density multiplier, 2 = 32 per unit), text, icon (item id) | iconSpec, board, ink, trim}
 * Icons of any size (16 or 32 px) are fitted to a 16-unit square at the sign's scale.
 */
export function signCanvas(opts) {
  const k = opts.scale || 1;
  const w = (opts.w || 48) * k, h = (opts.h || 20) * k;
  const pc = new PixelCanvas(w, h);
  const board = opts.board ?? 0x8a5a32;
  const R = ramp(board);
  pc.rect(0, 0, w, h, R[4]);
  pc.rect(k, k, w - 2 * k, h - 2 * k, board);
  for (let y = 3 * k; y < h - k; y += 4 * k) pc.rect(k, y, w - 2 * k, Math.max(1, k >> 1), mixHex(board, R[4], 0.5)); // plank seams
  const rng = makeRng(w * 31 + h);
  // wood grain streaks along each plank
  for (let i = 0; i < w * h * 0.012; i++) { const x = rng.int(k, w - 4 * k), y = rng.int(k, h - 2 * k), len = rng.int(2, 6) * k; pc.rect(x, y, len, 1, rng.chance(0.5) ? R[2] : mixHex(board, R[4], 0.6)); }
  for (let i = 0; i < w * h * 0.04; i++) pc.set(rng.int(k, w - 2 * k), rng.int(k, h - 2 * k), rng.chance(0.5) ? R[2] : R[4]);
  const trim = opts.trim ?? 0xd9a84a;
  pc.rect(0, 0, w, k, trim); pc.rect(0, h - k, w, k, shade(trim, 0.7)); pc.rect(0, 0, k, h, shade(trim, 0.85)); pc.rect(w - k, 0, k, h, shade(trim, 0.7));
  for (const [x, y] of [[k, k], [w - 2 * k, k], [k, h - 2 * k], [w - 2 * k, h - 2 * k]]) { pc.rect(x, y, k, k, 0xe8d8b0); if (k > 1) pc.set(x + 1, y + 1, 0x8a7a5a); }
  let tx = 3 * k;
  if (opts.icon || opts.iconSpec) {
    const target = 16 * k;
    const ic = opts.iconSpec ? (target < 32 ? drawIconSmall(opts.iconSpec, 3, target) : drawIcon(opts.iconSpec, 3)) : iconCanvasFor(opts.icon, target < 32 ? target : 0);
    const sc = ic.w === target ? 1 : ic.w * 2 === target ? 2 : ic.w === target * 2 ? 0.5 : 1;
    const sz = Math.round(ic.w * sc);
    const iy = Math.round((h - sz) / 2);
    blitScaled(pc, ic, 2 * k, iy, sc);
    tx = 2 * k + sz + k;
  }
  if (opts.text) {
    const lines = opts.text.split('\n');
    const lh = 7 * k;
    const y0 = Math.round((h - lines.length * lh + k) / 2);
    lines.forEach((ln, i) => {
      const cx = opts.icon || opts.iconSpec ? tx + (w - tx - 2 * k) / 2 : w / 2;
      drawTextCentered(pc, ln, cx, y0 + i * lh, opts.ink ?? 0xfff0c8, { shadow: R[5], scale: k });
    });
  }
  return pc;
}

// ---------------------------------------------------------------- paintings & posters
function sky(pc, x0, y0, w, h, top = 0x5ab8f0, bot = 0xbfe6ff) {
  for (let y = 0; y < h; y++) {
    const c = mixHex(top, bot, y / Math.max(1, h - 1));
    for (let x = 0; x < w; x++) {
      const b = BAYER[(y % 4) * 4 + (x % 4)] / 16;
      const k = y / Math.max(1, h - 1);
      const band = Math.floor(k * 5 + b) / 5;
      pc.set(x0 + x, y0 + y, mixHex(top, bot, band) || c);
    }
  }
}

function sun(pc, cx, cy, r) {
  pc.disk(cx, cy, r + 2, 0xfff2a0, 120);
  pc.disk(cx, cy, r, 0xffd34a);
  pc.disk(cx - r * 0.3, cy - r * 0.3, r * 0.5, 0xfff2a0);
}

function cloud(pc, x, y, w) {
  pc.ellipse(x, y, w * 0.5, w * 0.22, 0xffffff);
  pc.ellipse(x - w * 0.18, y - w * 0.12, w * 0.22, w * 0.18, 0xffffff);
  pc.ellipse(x + w * 0.12, y - w * 0.16, w * 0.26, w * 0.2, 0xffffff);
  pc.rect(Math.round(x - w * 0.45), Math.round(y + w * 0.12), Math.round(w * 0.9), 1, 0xd8ecf8);
}

function beachScene(pc, x0, y0, w, h, opts = {}) {
  const horizon = Math.round(h * 0.55);
  sky(pc, x0, y0, w, horizon, 0x4aa8e8, 0xc8ecff);
  sun(pc, x0 + Math.round(w * 0.74), y0 + Math.round(horizon * 0.38), Math.max(3, Math.round(w * 0.1)));
  cloud(pc, x0 + w * 0.28, y0 + horizon * 0.3, Math.max(8, w * 0.3));
  // sea
  const seaH = Math.round(h * 0.17);
  for (let y = 0; y < seaH; y++) pc.rect(x0, y0 + horizon + y, w, 1, mixHex(0x2a7ad0, 0x3ac9d9, y / seaH));
  const rng = makeRng(w + h);
  for (let i = 0; i < w / 3; i++) pc.rect(x0 + rng.int(0, w - 4), y0 + horizon + rng.int(1, seaH - 1), rng.int(2, 4), 1, 0xd8f6ff);
  // sand
  const sandY = horizon + seaH;
  pc.rect(x0, y0 + sandY, w, h - sandY, 0xf0d890);
  for (let x = 0; x < w; x++) if (rng.chance(0.5)) pc.set(x0 + x, y0 + sandY, 0xf8f0d0);
  for (let i = 0; i < w; i++) pc.set(x0 + rng.int(0, w - 1), y0 + rng.int(sandY + 1, h - 1), 0xd8b870);
  if (opts.palm !== false) {
    // palm tree
    const px = x0 + Math.round(w * 0.16), base = y0 + h - 2;
    for (let y = 0; y < h * 0.48; y++) pc.set(px + Math.round(Math.sin(y * 0.12) * 1.5), base - y, y % 3 ? 0x9a6a3a : 0x7a4a2a);
    const ty = base - Math.round(h * 0.48), tx = px + Math.round(Math.sin(h * 0.48 * 0.12) * 1.5);
    for (const [dx, dy] of [[-1, 0.2], [1, 0.25], [-0.6, -0.4], [0.7, -0.35], [0, -0.6]]) {
      for (let k = 0; k < 7; k++) pc.set(tx + Math.round(dx * k), ty + Math.round(dy * k + k * k * 0.06), k % 2 ? 0x3a9a3a : 0x5ab84a);
    }
    pc.disk(tx, ty + 1, 1.2, 0x7a4a2a);
  }
  if (opts.umbrella) {
    const ux = x0 + Math.round(w * 0.62), uy = y0 + sandY - 3;
    pc.line(ux, uy, ux, uy + 9, 0xe8e0d0);
    for (let k = -5; k <= 5; k++) for (let j = 0; j <= 3 - Math.floor(Math.abs(k) / 2); j++) pc.set(ux + k, uy - j, (Math.floor((k + 5) / 2) % 2) ? 0xe0402a : 0xfff4e0);
  }
  if (opts.critters) {
    // a little mole on a towel and a chicken: the dream
    const mx = x0 + Math.round(w * 0.42), my = y0 + h - 5;
    pc.rect(mx - 4, my + 2, 10, 2, 0xe0402a); pc.rect(mx - 4, my + 2, 10, 1, 0xf8a090);
    pc.ellipse(mx, my, 2.6, 2, 0x3a2e2a); pc.set(mx + 2, my, 0xf0a0a8); pc.set(mx - 1, my - 1, 0x120c10);
    const cx = mx + 8, cy = my;
    pc.ellipse(cx, cy, 2, 1.8, 0xf6f0e4); pc.set(cx + 1, cy - 2, 0xe0302a); pc.set(cx + 2, cy - 1, 0xf0b030);
  }
}

/** The Surface Express poster on the home wall (always there). */
export function posterCanvas() {
  const w = 42, h = 58;
  const pc = new PixelCanvas(w, h);
  pc.rect(0, 0, w, h, 0xf3e2bf);
  // header
  pc.rect(0, 0, w, 15, 0xb8302a);
  pc.rect(0, 14, w, 1, 0x7a1a1a);
  drawTextCentered(pc, 'SURFACE', w / 2, 2, 0xffe08a, { shadow: 0x6a1010 });
  drawTextCentered(pc, 'EXPRESS', w / 2, 8, 0xffe08a, { shadow: 0x6a1010 });
  // the dream
  beachScene(pc, 2, 16, w - 4, 26, { umbrella: true, critters: true });
  pc.rect(2, 16, w - 4, 1, 0xd8c8a0);
  // footer
  drawTextCentered(pc, 'ONE WAY', w / 2, 44, 0x2a1a12);
  drawTextCentered(pc, '1,000,000 G', w / 2, 51, 0xb07a14, { shadow: 0x6a4a10 });
  // worn corners & a tack
  pc.set(0, 0, 0x8a7a5a); pc.set(w - 1, h - 1, 0x8a7a5a); pc.set(w - 1, 0, 0xc8b890);
  pc.set(Math.floor(w / 2), 1, 0xd0d0d8);
  const rng = makeRng(5);
  for (let i = 0; i < 40; i++) { const x = rng.int(0, w - 1), y = rng.int(42, h - 1); if (pc.getHex(x, y) === 0xf3e2bf) pc.set(x, y, 0xe8d2a2); }
  return pc;
}

export function paintingCanvas(kind) {
  if (kind === 'sun') {
    const pc = new PixelCanvas(20, 20);
    sky(pc, 0, 0, 20, 20, 0x5ab8f0, 0xd8f0ff);
    sun(pc, 10, 9, 5);
    pc.rect(0, 16, 20, 4, 0x5ab84a); pc.rect(0, 16, 20, 1, 0x8ad86a);
    return pc;
  }
  if (kind === 'beach') {
    const pc = new PixelCanvas(36, 18);
    beachScene(pc, 0, 0, 36, 18, { umbrella: true });
    return pc;
  }
  if (kind === 'window') {
    const pc = new PixelCanvas(32, 20);
    sky(pc, 0, 0, 32, 20, 0x6ac0f6, 0xe0f4ff);
    cloud(pc, 9, 6, 10); cloud(pc, 25, 11, 8);
    sun(pc, 25, 4, 2.5);
    pc.rect(0, 16, 32, 4, 0x6ab84a);
    for (let x = 0; x < 32; x += 3) pc.set(x, 15, 0x8ad86a);
    return pc;
  }
  if (kind === 'banner') {
    const pc = new PixelCanvas(12, 22);
    pc.rect(0, 0, 12, 22, 0x8a2a3a);
    for (let y = 18; y < 22; y++) for (let x = 0; x < 12; x++) if (Math.abs(x - 5.5) < (y - 17) * 1.4) pc.clear(x, y);
    pc.rect(1, 1, 10, 1, 0xe0b040); pc.rect(1, 1, 1, 16, 0xe0b040); pc.rect(10, 1, 1, 16, 0xe0b040);
    // crossed claws crest
    for (let k = 0; k < 6; k++) { pc.set(3 + k, 5 + k, 0xf0d890); pc.set(8 - k, 5 + k, 0xf0d890); }
    pc.disk(6, 8, 1.6, 0xf0d890);
    return pc;
  }
  if (kind === 'chalk') {
    const pc = new PixelCanvas(24, 14);
    pc.rect(0, 0, 24, 14, 0x2a3a30);
    drawText(pc, 'FRESH', 2, 2, 0xe8e8e0);
    drawText(pc, 'ROOTS', 2, 8, 0xd8f0a0);
    return pc;
  }
  return new PixelCanvas(8, 8);
}

/** The giant golden ticket sign over the Surface Express booth. */
export function ticketSignCanvas() {
  const w = 64, h = 26;
  const pc = new PixelCanvas(w, h);
  const gold = 0xf2c23a, dk = 0xb07a14, lt = 0xfff0a0;
  // ticket shape with notched ends
  pc.rect(2, 2, w - 4, h - 4, gold);
  for (const x of [2, w - 3]) for (let y = 8; y < h - 8; y++) pc.clear(x, y);
  for (let y = 9; y < h - 9; y++) { pc.clear(3, y); pc.clear(w - 4, y); }
  pc.rect(2, 2, w - 4, 1, lt); pc.rect(2, h - 3, w - 4, 1, dk);
  // perforation
  for (let y = 4; y < h - 4; y += 2) pc.set(48, y, dk);
  drawTextCentered(pc, 'SURFACE', 25, 5, 0x6a1a1a, { shadow: dk });
  drawTextCentered(pc, 'EXPRESS', 25, 12, 0x6a1a1a, { shadow: dk });
  drawTextCentered(pc, '1 WAY', 56, 7, 0x6a1a1a);
  sun(pc, 56, 17, 2.5);
  pc.outline(0x3a2210);
  return pc;
}

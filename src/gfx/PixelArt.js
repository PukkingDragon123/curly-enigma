// Procedural pixel art: a tiny raster canvas, color ramps, template rendering and
// the item icon generator used across the UI.
import * as THREE from 'three';
import { T, FIXED } from './sprites16.js';
import { mixHex, shade, hexToRgb, makeRng, hashStr, hexCss } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { METALS, WEAPON_TYPES, INFUSIONS } from '../data/weapons.js';

// ---------------------------------------------------------------- color ramps
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

// ---------------------------------------------------------------- raster canvas
export class PixelCanvas {
  constructor(w, h = w) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(w, h);
    this.d = this.img.data;
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (!this.inb(x, y)) return;
    const i = (y * this.w + x) * 4;
    if (a < 255 && this.d[i + 3] > 0) {
      const t = a / 255;
      this.d[i] = this.d[i] * (1 - t) + ((c >> 16) & 255) * t;
      this.d[i + 1] = this.d[i + 1] * (1 - t) + ((c >> 8) & 255) * t;
      this.d[i + 2] = this.d[i + 2] * (1 - t) + (c & 255) * t;
      this.d[i + 3] = Math.max(this.d[i + 3], a);
      return;
    }
    this.d[i] = (c >> 16) & 255;
    this.d[i + 1] = (c >> 8) & 255;
    this.d[i + 2] = c & 255;
    this.d[i + 3] = a;
  }
  alpha(x, y) {
    if (!this.inb(x, y)) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
  getHex(x, y) {
    const i = (y * this.w + x) * 4;
    return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2];
  }
  clear(x, y) {
    if (!this.inb(x, y)) return;
    this.d[(y * this.w + x) * 4 + 3] = 0;
  }
  rect(x, y, w, h, c, a = 255) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a);
  }
  disk(cx, cy, r, c, a = 255) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c, a);
  }
  ellipse(cx, cy, rx, ry, c, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.set(x, y, c, a);
  }
  line(x0, y0, x1, y1, c, a = 255) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  poly(pts, c, a = 255) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c, a);
    }
  }
  /** Shade every opaque pixel by position: brighter top-left, darker bottom-right. */
  shadeShape(r, bias = 0, x0 = 0, y0 = 0, x1 = this.w, y1 = this.h) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const span = Math.max(1, (x1 - x0 + y1 - y0) / 4);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        if (!this.alpha(x, y)) continue;
        const t = ((x - cx) + (y - cy)) / span + bias;
        const k = t < -1.3 ? 1 : t < -0.45 ? 2 : t < 0.55 ? 3 : t < 1.3 ? 4 : 5;
        this.set(x, y, r[k]);
      }
  }
  /** 1px outline around opaque pixels. */
  outline(c, diag = false) {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y) > 40) continue;
        const n = this.alpha(x - 1, y) > 40 || this.alpha(x + 1, y) > 40 || this.alpha(x, y - 1) > 40 || this.alpha(x, y + 1) > 40 ||
          (diag && (this.alpha(x - 1, y - 1) > 40 || this.alpha(x + 1, y + 1) > 40 || this.alpha(x + 1, y - 1) > 40 || this.alpha(x - 1, y + 1) > 40));
        if (n) add.push([x, y]);
      }
    for (const [x, y] of add) this.set(x, y, c);
  }
  /** Soft glow halo around opaque pixels. */
  halo(c, a = 70) {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y)) continue;
        let n = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (this.alpha(x + i, y + j) > 200) n++;
        if (n) add.push([x, y, Math.min(a, n * 14)]);
      }
    for (const [x, y, aa] of add) this.set(x, y, c, aa);
  }
  blit(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const a = src.alpha(x, y);
        if (a) this.set(x + dx, y + dy, src.getHex(x, y), a);
      }
  }
  commit() {
    this.ctx.putImageData(this.img, 0, 0);
    return this.canvas;
  }
}

// ---------------------------------------------------------------- templates
/**
 * Draw an ASCII template. pal: {1..5,o} main ramp + accents {a..f} + overrides.
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

function tpl(name, main, acc = {}, size = 16) {
  const pc = new PixelCanvas(size);
  const r = ramp(main);
  drawTemplate(pc, T[name], { ...r, ...acc });
  return pc;
}

// ---------------------------------------------------------------- procedural drawers
function oreChunk(pc, spec, seed) {
  const rng = makeRng(seed);
  const rock = ramp(spec.rock || 0x6a5a4a);
  const pts = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const rr = rng.range(5.2, 6.8);
    pts.push([8 + Math.cos(a) * rr, 8.6 + Math.sin(a) * rr * 0.86]);
  }
  pc.poly(pts, rock[3]);
  pc.shadeShape(rock, 0, 1, 1, 15, 15);
  const ore = spec.ore || [0xd9773f, 0xf2a35e, 0x9c4a24];
  const spots = 4 + rng.int(0, 2);
  for (let i = 0; i < spots; i++) {
    let x, y, tries = 0;
    do { x = rng.int(4, 11); y = rng.int(4, 11); tries++; } while (tries < 20 && (!pc.alpha(x, y) || !pc.alpha(x + 1, y + 1)));
    const w = rng.int(1, 2), h = rng.int(1, 2);
    pc.rect(x, y, w + 1, h + 1, ore[0]);
    pc.set(x, y, ore[1]);
    pc.set(x + w, y + h, ore[2]);
  }
  if (spec.star) { pc.set(10, 4, 0xffffff); pc.set(9, 4, 0xfff0a0); pc.set(11, 4, 0xfff0a0); pc.set(10, 3, 0xfff0a0); pc.set(10, 5, 0xfff0a0); }
  pc.outline(rock.o);
}

function crystalCluster(pc, spec, seed) {
  const [c, hi, lo] = spec.c;
  const rng = makeRng(seed);
  const spikes = [
    { x: 8, w: 4, h: 12, lean: 0 },
    { x: 4.5, w: 3, h: 7 + rng.int(0, 2), lean: -1.5 },
    { x: 11.5, w: 3, h: 6 + rng.int(0, 2), lean: 1.5 },
  ];
  const base = 14;
  for (const s of [spikes[1], spikes[2], spikes[0]]) {
    const top = base - s.h;
    const tipX = s.x + s.lean;
    const pts = [[s.x - s.w / 2, base], [s.x - s.w / 2 + s.lean * 0.6, top + 2], [tipX, top], [s.x + s.w / 2 + s.lean * 0.6, top + 2], [s.x + s.w / 2, base]];
    pc.poly(pts, c);
    for (let y = top; y < base; y++)
      for (let x = Math.floor(s.x - s.w / 2 - 2); x <= Math.ceil(s.x + s.w / 2 + 2); x++) {
        if (!pc.alpha(x, y)) continue;
        const centerX = s.x + s.lean * (1 - (y - top) / s.h) * 0.6;
        if (x < centerX - 0.5) pc.set(x, y, hi);
        else if (x > centerX + 0.6) pc.set(x, y, lo);
      }
    pc.line(Math.round(s.x - s.w / 2 + 1), base - 2, Math.round(tipX), top + 1, mixHex(hi, 0xffffff, 0.6));
  }
  pc.rect(3, 14, 10, 1, mixHex(lo, 0x000000, 0.4));
  if (spec.dark) { pc.set(7, 5, 0xc89aff); pc.set(9, 9, 0xc89aff); pc.set(5, 11, 0x9a6ad9); }
  pc.outline(mixHex(shade(lo, 0.3), 0x0a0510, 0.5));
  if (spec.glow) pc.halo(hi, 80);
  if (spec.zap) {
    const z = [[13, 2], [12, 4], [14, 5], [13, 7]];
    for (let i = 0; i < z.length - 1; i++) pc.line(z[i][0], z[i][1], z[i + 1][0], z[i + 1][1], 0xfff8a0);
    pc.set(2, 3, 0xfff8a0); pc.set(3, 4, 0xfff8a0); pc.set(2, 5, 0xfff8a0);
  }
  if (spec.float) { pc.set(2, 2, hi); pc.set(13, 1, hi); pc.set(1, 6, hi); }
}

function gem(pc, spec) {
  const [c, hi, lo] = spec.c;
  const cut = spec.cut || 'round';
  const ol = mixHex(shade(lo, 0.35), 0x0a0510, 0.5);
  if (cut === 'brilliant') {
    pc.poly([[4, 4], [12, 4], [15, 7], [8, 15], [1, 7]], c);
    for (let y = 4; y < 15; y++) for (let x = 0; x < 16; x++) {
      if (!pc.alpha(x, y)) continue;
      if (y < 7) pc.set(x, y, x < 8 ? hi : c);
      else pc.set(x, y, x < 8 - (y - 7) * 0.2 ? c : lo);
    }
    pc.line(1, 7, 15, 7, mixHex(hi, 0xffffff, 0.5));
    pc.line(5, 4, 4, 7, lo); pc.line(11, 4, 12, 7, lo); pc.line(8, 7, 8, 14, mixHex(c, lo, 0.5));
    pc.set(6, 5, 0xffffff);
  } else if (cut === 'square') {
    pc.poly([[4, 2], [12, 2], [14, 4], [14, 12], [12, 14], [4, 14], [2, 12], [2, 4]], lo);
    pc.poly([[5, 4], [11, 4], [12, 5], [12, 11], [11, 12], [5, 12], [4, 11], [4, 5]], c);
    pc.rect(6, 6, 4, 4, hi);
    pc.line(4, 2, 2, 4, hi); pc.line(5, 3, 11, 3, mixHex(c, hi, 0.5));
    pc.set(6, 6, 0xffffff);
  } else if (cut === 'blob') {
    pc.ellipse(8, 8.5, 6.3, 5.5, c);
    pc.ellipse(7.2, 7.6, 4, 3.4, mixHex(c, hi, 0.45));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (pc.alpha(x, y) && (x - 8) * 0.6 + (y - 8.5) > 3.6) pc.set(x, y, lo);
    pc.set(5, 5, 0xffffff); pc.set(6, 5, hi); pc.set(5, 6, hi);
    if (spec.bug) {
      pc.rect(7, 8, 3, 3, 0x2a1a10); pc.set(8, 7, 0x2a1a10);
      pc.set(6, 8, 0x2a1a10); pc.set(10, 8, 0x2a1a10); pc.set(6, 10, 0x2a1a10); pc.set(10, 10, 0x2a1a10);
      pc.set(8, 9, 0x6a4a20);
    }
  } else {
    const rx = cut === 'oval' ? 6.3 : 5.8, ry = cut === 'oval' ? 4.8 : 5.8;
    pc.ellipse(8, 8.5, rx, ry, c);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (!pc.alpha(x, y)) continue;
      const t = (x - 8) + (y - 8.5);
      if (t < -3.5) pc.set(x, y, hi);
      else if (t > 3) pc.set(x, y, lo);
    }
    pc.ellipse(8, 8.5, rx * 0.5, ry * 0.5, mixHex(c, hi, 0.5));
    pc.set(6, 6, 0xffffff); pc.set(7, 6, mixHex(hi, 0xffffff, 0.5));
  }
  pc.outline(ol);
  if (spec.glow) pc.halo(hi, 80);
}

function coal(pc) {
  pc.poly([[3, 6], [6, 3], [11, 3], [14, 7], [13, 12], [8, 14], [3, 12]], 0x2a2628);
  pc.shadeShape({ 1: 0x5a5660, 2: 0x3a3640, 3: 0x2a2628, 4: 0x1c1a1e, 5: 0x121014 }, 0, 2, 2, 15, 15);
  pc.set(6, 5, 0x9aa0b8); pc.set(7, 5, 0x6a7088); pc.set(10, 8, 0x8a90a8); pc.set(5, 9, 0x6a7088);
  pc.outline(0x0a080a);
}

function fossil(pc) {
  pc.ellipse(8, 8.5, 6.5, 5.8, 0xc8b08a);
  pc.shadeShape(ramp(0xc8b08a), 0, 1, 2, 15, 15);
  let a = 0, r = 0.6;
  for (let i = 0; i < 46; i++) {
    a += 0.42; r += 0.11;
    pc.set(8 + Math.cos(a) * r, 8.5 + Math.sin(a) * r * 0.9, 0x6a5038);
  }
  pc.set(7, 8, 0xf0e0c0); pc.set(6, 6, 0xf0e0c0);
  pc.outline(0x3a2a1a);
}

function shard(pc, spec) {
  const [c, hi, lo] = spec.c;
  pc.poly([[7, 1], [11, 6], [10, 14], [5, 15], [3, 9]], c);
  pc.poly([[7, 1], [8, 9], [5, 15], [3, 9]], lo);
  pc.line(7, 2, 8, 9, hi);
  pc.line(8, 9, 10, 13, hi);
  pc.set(7, 3, 0xffffff);
  pc.outline(0x050308);
}

// ---------------------------------------------------------------- weapons
/**
 * Diagonal weapon icon (handle bottom-left, tip top-right).
 */
export function drawWeapon(pc, type, metalColor, infusionColor) {
  const r = ramp(metalColor);
  const wood = { 1: 0xd8aa6a, 2: 0xb8864a, 3: 0x9a6a3a, 4: 0x6a4424, 5: 0x4a2c16 };
  const S = pc.w / 16;
  const P = (x, y) => [x * S, y * S];
  const diagBlade = (from, to, width) => {
    // blade along the diagonal from (from,from') to (to,to') with half-width
    for (let t = from; t <= to; t += 0.25) {
      const cx = t, cy = 15 - t;
      const w = typeof width === 'function' ? width((t - from) / (to - from)) : width;
      for (let k = -w; k <= w; k += 0.5) {
        const x = Math.round((cx + k * 0.7) * S), y = Math.round((cy + k * 0.7) * S);
        const side = k < -0.2 ? 2 : k > 0.3 ? 4 : 3;
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) pc.set(x + sx, y + sy, r[side]);
      }
    }
  };
  const handle = (from, to) => {
    for (let t = from; t <= to; t += 0.3) {
      const [x, y] = P(t, 15 - t);
      for (let sy = 0; sy < S * 1.6; sy++) for (let sx = 0; sx < S * 1.6; sx++) pc.set(x + sx, y + sy - S * 0.3, Math.round(t * 2) % 3 === 0 ? wood[4] : wood[3]);
    }
  };
  const guard = (t, len) => {
    for (let k = -len; k <= len; k += 0.3) {
      const x = (t - k * 0.7) * S, y = (15 - t - k * 0.7) * S;
      for (let sy = 0; sy < S * 1.4; sy++) for (let sx = 0; sx < S * 1.4; sx++) pc.set(x + sx, y + sy, k < 0 ? r[2] : r[4]);
    }
  };
  const pommel = (t) => { const [x, y] = P(t, 15 - t); pc.disk(x + S * 0.5, y + S * 0.5, S * 1.2, r[3]); pc.set(x, y, r[1]); };

  switch (type) {
    case 'dagger': handle(1.5, 5); guard(5.3, 2.2); diagBlade(5.8, 11.5, (u) => 1.1 * (1 - u * 0.75)); pommel(1.2); break;
    case 'shortsword': handle(1.5, 4.5); guard(4.8, 2.6); diagBlade(5.3, 12.5, (u) => (u < 0.8 ? 1.1 : 1.1 * (1 - (u - 0.8) * 4.5))); pommel(1.1); break;
    case 'longsword': handle(1, 4); guard(4.3, 3); diagBlade(4.8, 14, (u) => (u < 0.82 ? 1.0 : 1.0 * (1 - (u - 0.82) * 5.5))); pommel(0.7); break;
    case 'greatsword': handle(0.8, 4); guard(4.4, 3.6); diagBlade(5, 14.5, (u) => (u < 0.8 ? 1.6 : 1.6 * (1 - (u - 0.8) * 5))); pommel(0.6); break;
    case 'rapier': handle(1.2, 4); diagBlade(4.4, 14.5, (u) => 0.5 * (1 - u * 0.6)); {
      const [x, y] = P(4.5, 10.5); for (let a = 0; a < Math.PI * 2; a += 0.2) pc.set(x + Math.cos(a) * 2.4 * S, y + Math.sin(a) * 2.4 * S, r[2]);
    } pommel(1); break;
    case 'spear': handle(0.5, 10); diagBlade(10, 14.8, (u) => (u < 0.5 ? 0.6 + u * 1.6 : 1.4 * (1 - (u - 0.5) * 2))); break;
    case 'axe': handle(1, 12); {
      const [x, y] = P(9.2, 5.6);
      pc.poly([[x, y - 1 * S], [x + 4 * S, y - 3 * S], [x + 5.4 * S, y + 1.5 * S], [x + 3.4 * S, y + 4.4 * S], [x + 0.6 * S, y + 2.4 * S]], r[3]);
      pc.shadeShape(r, 0, Math.floor(x - 1), Math.floor(y - 4 * S), Math.ceil(x + 6 * S), Math.ceil(y + 5 * S));
      pc.line(x + 4 * S, y - 3 * S, x + 5.4 * S, y + 1.5 * S, r[1]);
    } break;
    case 'mace': handle(1, 10); {
      const [x, y] = P(11.5, 3.5);
      pc.disk(x, y, 3 * S, r[3]);
      pc.shadeShape(r, 0, Math.floor(x - 4 * S), Math.floor(y - 4 * S), Math.ceil(x + 4 * S), Math.ceil(y + 4 * S));
      for (const [dx, dy] of [[0, -3.8], [3.8, 0], [0, 3.8], [-3.8, 0], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8], [-2.8, -2.8]]) pc.set(x + dx * S, y + dy * S, r[1]);
    } break;
    case 'warhammer': handle(1, 11); {
      const [x, y] = P(10.5, 4.5);
      pc.poly([[x - 2 * S, y - 4 * S], [x + 1 * S, y - 5.5 * S], [x + 5.5 * S, y - 1 * S], [x + 4 * S, y + 2 * S]], r[3]);
      pc.shadeShape(r, 0, Math.floor(x - 3 * S), Math.floor(y - 6 * S), Math.ceil(x + 6 * S), Math.ceil(y + 3 * S));
    } break;
    case 'moleblade': handle(1, 5); guard(5.2, 2.8); {
      diagBlade(5.6, 9, 0.8);
      const [x, y] = P(11.3, 3.7);
      pc.ellipse(x, y, 3.4 * S, 3.4 * S, r[3]);
      pc.shadeShape(r, 0, Math.floor(x - 4 * S), Math.floor(y - 4 * S), Math.ceil(x + 4 * S), Math.ceil(y + 4 * S));
      pc.line(x - 1 * S, y + 1 * S, x + 1.6 * S, y - 1.6 * S, r[1]);
    } pommel(0.8); break;
    default: handle(1.5, 4.5); guard(4.8, 2.6); diagBlade(5.3, 12.5, 1); break;
  }
  pc.outline(r.o);
  if (infusionColor) pc.halo(infusionColor, 90);
}

// ---------------------------------------------------------------- furniture & building swatches
function furnIcon(pc, t, c) {
  const wood = 0x9a6a3a;
  const R = ramp(c || wood);
  const W = ramp(wood);
  const fill = (pts, col) => pc.poly(pts, col);
  switch (t) {
    case 'bed':
      fill([[2, 7], [14, 7], [14, 12], [2, 12]], W[3]);
      fill([[2, 5], [5, 5], [5, 8], [2, 8]], 0xf0e8d8);
      fill([[5, 6], [14, 6], [14, 9], [5, 9]], R[3]);
      pc.rect(5, 6, 9, 1, R[2]); pc.rect(1, 4, 1, 10, W[4]); pc.rect(14, 7, 1, 7, W[4]);
      break;
    case 'forge':
      pc.rect(2, 5, 12, 9, 0x6a6460); pc.rect(3, 6, 10, 3, 0x2a1a14); pc.rect(4, 7, 8, 2, 0xff7a2a); pc.rect(6, 7, 3, 1, 0xffd27a);
      pc.rect(5, 1, 3, 4, 0x5a5450); pc.rect(10, 10, 4, 3, 0x3a3a40); pc.rect(9, 9, 6, 1, 0x5a5a60);
      break;
    case 'stove':
      pc.rect(3, 4, 10, 10, 0x3a3a40); pc.rect(4, 8, 8, 4, 0x1a1a1e); pc.rect(5, 9, 6, 2, 0xff8a3a); pc.rect(3, 3, 10, 1, 0x5a5a60); pc.rect(11, 0, 2, 3, 0x2a2a30);
      break;
    case 'coop':
      fill([[2, 6], [8, 1], [14, 6]], 0xc94a3a); pc.rect(3, 6, 10, 8, W[3]); pc.rect(6, 9, 4, 5, 0x2a1a10); pc.rect(7, 10, 2, 2, 0xf0e8d8);
      break;
    case 'planter':
      pc.rect(2, 9, 12, 5, W[3]); pc.rect(3, 8, 10, 2, 0x4a3020); pc.rect(4, 4, 3, 4, 0xd9c8a8); pc.rect(3, 3, 5, 2, 0xc94a3a); pc.rect(9, 5, 3, 3, 0xd9c8a8); pc.rect(8, 4, 5, 2, 0x7fd0ff);
      break;
    case 'desk':
      pc.rect(1, 6, 14, 2, W[2]); pc.rect(2, 8, 2, 6, W[4]); pc.rect(12, 8, 2, 6, W[4]); pc.rect(5, 3, 5, 3, 0x8a3a2a); pc.rect(11, 3, 1, 3, 0xf0e8d8);
      break;
    case 'rack':
      pc.rect(1, 3, 14, 2, W[3]); pc.rect(1, 12, 14, 2, W[3]); pc.rect(1, 3, 2, 11, W[4]); pc.rect(13, 3, 2, 11, W[4]);
      pc.line(4, 11, 6, 5, 0xc6cbd2); pc.line(8, 11, 8, 5, 0xd9773f); pc.line(10, 11, 12, 5, 0xf2c23a);
      break;
    case 'gemcase':
      pc.rect(3, 8, 10, 6, W[3]); pc.rect(3, 3, 10, 5, 0xbfe6ff); pc.rect(4, 4, 8, 3, 0xe6f6ff); pc.rect(7, 5, 2, 2, 0xe02a3a);
      break;
    case 'glowlamp': case 'potglow':
      pc.rect(6, 9, 4, 5, t === 'potglow' ? 0xb8603a : 0xe0d8c0); pc.ellipse(8, 7, 5, 3, 0x7fd0ff); pc.set(6, 6, 0xe0f8ff); pc.halo(0x7fd0ff, 60);
      break;
    case 'lantern':
      pc.rect(7, 6, 2, 8, 0x3a3a40); pc.rect(5, 1, 6, 6, 0x3a3a40); pc.rect(6, 2, 4, 4, 0xffc070); pc.rect(5, 13, 6, 1, 0x3a3a40); pc.halo(0xffc070, 50);
      break;
    case 'jar':
      pc.rect(4, 4, 8, 10, 0xd8f0f0); pc.rect(4, 3, 8, 1, 0x8a6a4a); pc.rect(7, 8, 3, 3, 0xc8ff7a); pc.halo(0xc8ff7a, 50);
      break;
    case 'crystallamp':
      pc.rect(6, 11, 4, 3, 0x5a5a6a); fill([[8, 1], [12, 8], [8, 11], [4, 8]], 0xc89aff); pc.line(8, 2, 6, 8, 0xf0e0ff); pc.halo(0xe0a8ff, 60);
      break;
    case 'fireplace':
      pc.rect(1, 3, 14, 11, 0x7a7470); pc.rect(4, 7, 8, 7, 0x1a1214); pc.rect(5, 10, 6, 3, 0xff8a3a); pc.rect(7, 9, 2, 2, 0xffd27a); pc.rect(1, 3, 14, 1, 0x9a948e);
      break;
    case 'stool':
      pc.ellipse(8, 7, 5, 2, W[2]); pc.rect(4, 7, 8, 6, W[3]); pc.rect(4, 12, 8, 1, W[4]);
      break;
    case 'chair':
      pc.rect(4, 2, 2, 12, W[4]); pc.rect(4, 8, 9, 2, W[2]); pc.rect(11, 9, 2, 5, W[4]); pc.rect(4, 3, 2, 5, W[3]);
      break;
    case 'armchair':
      pc.rect(3, 3, 10, 7, 0x4a7a3a); pc.rect(2, 7, 12, 5, 0x5a8a4a); pc.rect(2, 7, 2, 6, 0x3a6a2a); pc.rect(12, 7, 2, 6, 0x3a6a2a); pc.rect(3, 12, 1, 2, W[4]); pc.rect(12, 12, 1, 2, W[4]);
      break;
    case 'sofa':
      pc.rect(1, 4, 14, 6, 0x7a4a2a); pc.rect(1, 8, 14, 4, 0x9a6a3a); pc.rect(1, 6, 2, 7, 0x5a3a1a); pc.rect(13, 6, 2, 7, 0x5a3a1a);
      break;
    case 'table':
      pc.ellipse(8, 6, 6, 2.5, W[2]); pc.rect(7, 7, 2, 6, W[4]); pc.rect(5, 13, 6, 1, W[4]);
      break;
    case 'longtable':
      pc.rect(1, 5, 14, 3, W[2]); pc.rect(2, 8, 2, 6, W[4]); pc.rect(12, 8, 2, 6, W[4]);
      break;
    case 'rug':
      pc.ellipse(8, 9, 7, 4, R[3]); pc.ellipse(8, 9, 5, 2.6, R[2]); pc.ellipse(8, 9, 2.5, 1.2, R[4]);
      break;
    case 'fern':
      pc.rect(5, 10, 6, 4, 0xb8603a); for (let i = 0; i < 5; i++) pc.line(8, 10, 2 + i * 3, 2 + (i % 2) * 2, 0x6aa84a);
      break;
    case 'bookshelf':
      pc.rect(2, 1, 12, 13, W[4]); pc.rect(3, 2, 10, 3, 0x2a1a10); pc.rect(3, 6, 10, 3, 0x2a1a10); pc.rect(3, 10, 10, 3, 0x2a1a10);
      [0xc94a3a, 0x3a7ac9, 0x5ab84a, 0xe0b040, 0x9a5ad9].forEach((cc, i) => { pc.rect(3 + i * 2, 2, 1, 3, cc); pc.rect(4 + i * 2, 6, 1, 3, cc); pc.rect(3 + i * 2, 10, 1, 3, cc); });
      break;
    case 'barrel':
      pc.ellipse(8, 8, 5, 6, W[3]); pc.rect(3, 4, 10, 1, 0x3a3a40); pc.rect(3, 11, 10, 1, 0x3a3a40); pc.ellipse(8, 3, 4, 1.5, W[2]);
      break;
    case 'crate':
      pc.rect(2, 3, 12, 11, W[2]); pc.rect(2, 3, 12, 1, W[1]); pc.line(2, 3, 13, 13, W[4]); pc.line(13, 3, 2, 13, W[4]); pc.rect(2, 8, 12, 1, W[4]);
      break;
    case 'clock':
      pc.rect(4, 1, 8, 13, W[4]); pc.disk(8, 5, 3, 0xf0e8d0); pc.line(8, 5, 8, 3, 0x1a1418); pc.line(8, 5, 10, 5, 0x1a1418); pc.rect(7, 9, 2, 4, 0xe0b040);
      break;
    case 'painting': case 'window':
      pc.rect(1, 2, 14, 11, 0xc8a050); pc.rect(2, 3, 12, 9, t === 'window' ? 0x8ad0ff : 0x5a9ad9);
      if (t === 'window') { pc.rect(7, 3, 1, 9, 0xc8a050); pc.rect(2, 7, 12, 1, 0xc8a050); pc.disk(11, 5, 1.5, 0xffffff); }
      else { pc.disk(8, 7, 2.5, R[3]); pc.rect(2, 10, 12, 2, c === 0x3ac9d9 ? 0xf0d890 : 0x5ab84a); }
      break;
    case 'banner':
      pc.rect(3, 1, 10, 1, W[4]); fill([[4, 2], [12, 2], [12, 13], [8, 10], [4, 13]], 0x8a2a3a); pc.rect(7, 4, 2, 4, 0xf0d890);
      break;
    case 'musicbox':
      pc.rect(3, 7, 10, 6, W[3]); pc.rect(3, 4, 10, 3, W[2]); pc.rect(7, 8, 2, 2, 0xe0b040); pc.set(12, 2, 0x1a1418); pc.set(13, 1, 0x1a1418); pc.set(12, 3, 0x1a1418);
      break;
    case 'plushie':
      pc.ellipse(6, 10, 4, 3, 0xe0a0b0); pc.ellipse(11, 7, 3, 3, 0xe0a0b0); pc.set(12, 6, 0x1a1418); pc.ellipse(4, 11, 2, 1.5, 0xd08090);
      break;
    case 'tank':
      pc.rect(1, 4, 14, 9, 0x7ad0ff); pc.rect(1, 4, 14, 1, 0xd8f0ff); pc.rect(1, 12, 14, 2, 0x3a3a40); pc.ellipse(6, 8, 2, 1, 0xf0d8d8); pc.ellipse(11, 10, 2, 1, 0xf0d8d8);
      break;
    case 'fountain':
      pc.ellipse(8, 11, 7, 3, 0x9a948e); pc.ellipse(8, 11, 5.5, 2, 0x5ab8e6); pc.rect(7, 3, 2, 8, 0x9a948e); pc.set(7, 2, 0xbfe6ff); pc.set(9, 2, 0xbfe6ff); pc.set(6, 4, 0xbfe6ff); pc.set(10, 4, 0xbfe6ff);
      break;
    case 'trophy':
      pc.rect(5, 12, 6, 2, 0x5a3a22); pc.rect(7, 9, 2, 3, 0xe0b040); pc.line(3, 9, 12, 2, 0xe0b040); pc.line(9, 2, 14, 6, 0xffd34a); pc.halo(0xffd34a, 40);
      break;
    case 'statue':
      pc.rect(4, 11, 8, 3, 0x9a948e); pc.ellipse(8, 7, 4, 4, 0xe8e4dc); pc.ellipse(8, 4, 3, 3, 0xf0ece4); pc.set(8, 5, 0xc8b8b8);
      break;
    default:
      pc.rect(3, 3, 10, 10, W[3]);
  }
  pc.outline(0x1a0f0b);
}

function swatch(pc, spec, wall) {
  const c = spec.c;
  const r = ramp(c);
  pc.rect(1, 1, 14, 14, c);
  const pat = spec.pat;
  if (pat === 'plank') for (let y = 1; y < 15; y += 4) { pc.rect(1, y, 14, 1, r[4]); pc.rect((y * 3) % 12 + 2, y + 1, 1, 3, r[4]); }
  else if (pat === 'stone' || pat === 'brick') {
    for (let y = 1; y < 15; y += 3) { pc.rect(1, y, 14, 1, r[4]); for (let x = (y % 2) * 3 + 1; x < 15; x += 6) pc.rect(x, y, 1, 3, r[4]); }
  } else if (pat === 'checker') { for (let y = 1; y < 15; y += 4) for (let x = 1; x < 15; x += 4) if (((x + y) / 4) % 2 < 1) pc.rect(x, y, 4, 4, 0x2a2a30); }
  else if (pat === 'tile') { for (let y = 1; y < 15; y += 5) pc.rect(1, y, 14, 1, r[4]); for (let x = 1; x < 15; x += 5) pc.rect(x, 1, 1, 14, r[4]); }
  else if (pat === 'moss') { const rng = makeRng(5); for (let i = 0; i < 30; i++) pc.set(rng.int(1, 14), rng.int(1, 14), rng.chance(0.5) ? r[2] : r[4]); }
  else if (pat === 'carpet') { pc.rect(3, 3, 10, 10, r[2]); pc.rect(5, 5, 6, 6, c); }
  else if (pat === 'paper') { for (let y = 3; y < 15; y += 5) for (let x = 3; x < 15; x += 5) { pc.set(x, y, 0xf0d890); pc.set(x + 1, y, 0xe0a0b0); } }
  else { const rng = makeRng(9); for (let i = 0; i < 26; i++) pc.set(rng.int(1, 14), rng.int(1, 14), rng.chance(0.5) ? r[2] : r[4]); }
  if (wall) { pc.rect(1, 1, 14, 2, r[2]); pc.rect(1, 13, 14, 2, r[5]); }
  pc.outline(0x1a0f0b);
}

const FOOD_TPL = {
  soup: 'bowl', stew: 'bowl', noodles: 'bowl', salad: 'bowl', risotto: 'plate', fish: 'plate', omelette: 'plate',
  cup: 'cup', skewer: 'skewer', parfait: 'parfait', wrap: 'plate', feast: 'plate', pancakes: 'pancakes', egg: 'plate',
  mush: 'bowl', bar: 'bar', flask: 'flask', pie: 'pie',
};

const PLANT_TPL = {
  carrot: ['carrot', 0xf0c8a0], glowcap: ['mushroom', 0x6ac8ff, { a: 0xd8f6ff }, true], fern: ['fern', 0xd8e0c8],
  whisper: ['tendrils', 0xa080c0], sap: ['droplet', 0xf0e0b0], pepper: ['carrot', 0xe0402a], sparkmoss: ['moss', 0x4a9ae0, { a: 0xfff07a }],
  bubble: ['bulb', 0xd0b8ff, { a: 0xffffff }], lily: ['flower', 0xd8f0ff, { a: 0x9fd6ff }, true], gloom: ['mushroom', 0x5a3a7a, { a: 0xb090d0 }],
  ashfern: ['fern', 0x9a948e], ember: ['flower', 0xff7a2a, { a: 0xffe066 }, true], truffle: ['lump', 0x5a3a2a, { a: 0x8a6a4a }],
  frost: ['flower', 0xbff6ff, { a: 0xffffff }], lotus: ['lotus', 0xff9ad0, { a: 0xffe066 }, true],
};
const CRITTER_TPL = { worm: ['worm', 0xe8a0a0, { a: 0xc87878 }], beetle: ['beetle', 0x3a3a5a, { a: 0xc8ff7a }], fish: ['fish', 0xf0d8d8], shrimp: ['shrimp', 0xff9a8a, { a: 0xffffff }] };
const DROP_TPL = {
  fluff: ['fluff', 0xd8ccc0], guano: ['pile', 0x6a5a3a, { a: 0xe8e0c0 }], shell: ['shell', 0x9a8a7a, { a: 0x6a5a4a }], slime: ['droplet', 0x8ae0a0],
  silk: ['spool', 0xeaf4ff], spark: ['pile', 0x4aa0e0, { a: 0xfff07a }], scale: ['scale', 0xff6a2a, { a: 0xffd27a }], wisp: ['bottle', 0x9a6ad9, { a: 0x6a3ab0 }],
};
const INGR_TPL = { flour: ['sack', 0xe8dcc0, { a: 0xb8a070 }], butter: ['block', 0xffe08a], mushroom: ['mushroom', 0xe0c8a0, { a: 0xf0e0c8 }], rootbeer: ['flask', 0x6a3a1a, { a: 0xe8d8b0 }], honey: ['jar', 0xf2a32c, { a: 0xffe08a }] };

/** Render an icon spec to a PixelCanvas (16×16 or larger for weapons). */
export function drawIcon(spec, seed = 1) {
  const pc = new PixelCanvas(16);
  switch (spec.k) {
    case 'ore': oreChunk(pc, spec, seed); break;
    case 'coal': coal(pc); break;
    case 'crystal': crystalCluster(pc, spec, seed); break;
    case 'gem': gem(pc, spec); break;
    case 'fossil': fossil(pc); break;
    case 'shard': shard(pc, spec); break;
    case 'ingot': {
      const r = ramp(spec.c[0]);
      drawTemplate(pc, T.ingot, { ...r, 1: spec.c[1], 5: spec.c[2] });
      if (spec.star) { pc.set(12, 4, 0xffffff); pc.set(12, 3, 0xfff0a0); pc.set(11, 4, 0xfff0a0); pc.set(13, 4, 0xfff0a0); }
      break;
    }
    case 'plant': {
      const [name, c, acc, glow] = PLANT_TPL[spec.t] || ['sprout', 0x6aa84a];
      drawTemplate(pc, T[name], { ...ramp(c), ...(acc || {}) });
      if (glow) pc.halo(c, 60);
      break;
    }
    case 'critter': { const [name, c, acc] = CRITTER_TPL[spec.t]; drawTemplate(pc, T[name], { ...ramp(c), ...(acc || {}) }); if (spec.t === 'beetle') pc.halo(0xc8ff7a, 50); break; }
    case 'drop': { const [name, c, acc] = DROP_TPL[spec.t]; drawTemplate(pc, T[name], { ...ramp(c), ...(acc || {}) }); if (spec.t === 'wisp' || spec.t === 'spark') pc.halo(c, 50); break; }
    case 'ingr': { const [name, c, acc] = INGR_TPL[spec.t]; drawTemplate(pc, T[name], { ...ramp(c), ...(acc || {}) }); break; }
    case 'egg': drawTemplate(pc, T.egg, { ...ramp(0xf0e0c0), a: 0xc8a878 }); break;
    case 'food': {
      const name = FOOD_TPL[spec.t] || 'bowl';
      const c = spec.c || 0xe0a060;
      const acc = name === 'bowl' ? { a: 0xe8e8f0 } : name === 'cup' ? { a: 0xe8e8f0 } : name === 'bar' ? { a: 0xc84a3a } : name === 'flask' ? { a: 0x8a6a3a } : name === 'pie' ? { a: 0xc8384a } : name === 'pancakes' ? { a: 0xf2a32c } : name === 'parfait' ? { a: 0xff9ad0 } : {};
      drawTemplate(pc, T[name], { ...ramp(c), ...acc });
      if (spec.t === 'noodles') { pc.line(4, 6, 11, 7, 0xf0d8a0); pc.line(5, 7, 12, 6, 0xf0d8a0); pc.line(12, 1, 7, 6, 0x9a6a3a); pc.line(13, 1, 8, 6, 0x9a6a3a); }
      if (spec.t === 'stew') { pc.set(5, 6, 0xf2a35e); pc.set(9, 7, 0xe8d8b0); pc.set(11, 6, 0x6aa84a); }
      if (spec.t === 'salad') { pc.set(4, 5, 0x8ac86a); pc.set(6, 4, 0x6aa84a); pc.set(10, 5, 0x8ac86a); pc.set(8, 4, 0xf2a35e); }
      if (spec.t === 'mush') { pc.set(12, 2, 0x1a1418); pc.set(13, 1, 0xa0a0a0); }
      if (spec.t === 'omelette') { pc.set(7, 6, 0xd94a3a); pc.set(10, 7, 0xd94a3a); }
      if (spec.t === 'feast') { pc.set(7, 4, 0xff9ad0); pc.set(8, 3, 0xffc8e8); pc.set(9, 4, 0xff9ad0); }
      break;
    }
    case 'tool': {
      const c = spec.c || 0x9aa0a8;
      if (spec.t === 'pick') drawTemplate(pc, T.pick, ramp(c));
      else if (spec.t === 'chisel') drawTemplate(pc, T.chisel, ramp(c));
      else if (spec.t === 'brush') drawTemplate(pc, T.brush, ramp(c));
      else if (spec.t === 'drill') drawTemplate(pc, T.drill, { ...ramp(c), a: mixHex(c, 0x2a1a10, 0.5) });
      else if (spec.t === 'xray') { drawTemplate(pc, T.xray, { ...ramp(0x8a8f96), a: c }); pc.halo(c, 40); }
      else if (spec.t === 'beam') drawTemplate(pc, T.beam, ramp(0x9a6a3a));
      else if (spec.t === 'stake') { drawTemplate(pc, T.stake, { ...ramp(0x7bf08a), a: 0x9dff9a }); pc.halo(0x9dff9a, 50); }
      break;
    }
    case 'equip': {
      const c = spec.c || 0x8a5a2a;
      const name = spec.t;
      const acc = name === 'gloves' ? { a: shade(c, 0.6) } : name === 'boots' ? { a: 0x3a2a1a } : name === 'bag' ? { a: shade(c, 0.6) } : name === 'suit' ? { a: 0x3a3a40 } : {};
      drawTemplate(pc, T[name], { ...ramp(c), ...acc });
      break;
    }
    case 'ticket': drawTemplate(pc, T.ticket, { ...ramp(0xf2c23a), a: 0xb07a14 }); pc.halo(0xffe08a, 50); break;
    case 'blueprint': {
      drawTemplate(pc, T.blueprint, { ...ramp(0x3a6ac9), a: 0x5a8ae0 });
      const wt = WEAPON_TYPES[spec.t];
      if (wt) {
        const w = new PixelCanvas(16);
        drawWeapon(w, spec.t, 0xffffff);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (w.alpha(x, y) > 200 && w.getHex(x, y) !== ramp(0xffffff).o) pc.set(x, y, 0xe8f0ff);
      } else {
        const sym = { bellows: [[5, 5, 6, 4], [7, 9, 2, 3]], hearth: [[4, 6, 8, 6], [6, 8, 4, 2]], room: [[3, 4, 10, 1], [3, 4, 1, 8], [12, 4, 1, 8], [3, 11, 10, 1]] }[spec.t] || [[5, 5, 6, 6]];
        for (const [x, y, w, h] of sym) pc.rect(x, y, w, h, 0xe8f0ff);
      }
      break;
    }
    case 'furn': furnIcon(pc, spec.t, spec.c); break;
    case 'floor': swatch(pc, spec, false); break;
    case 'wall': swatch(pc, spec, true); break;
    case 'coin': drawTemplate(pc, T.coin, { ...ramp(0xf2c23a), Y: 0xb07a14 }); break;
    case 'bolt': drawTemplate(pc, T.bolt, ramp(0xffd84a)); break;
    case 'book': drawTemplate(pc, T.book, { ...ramp(0x8a3a2a), a: 0xe0b040 }); break;
    case 'heart': drawTemplate(pc, T.heart, ramp(0xe0404a)); break;
    default: pc.rect(4, 4, 8, 8, 0xff00ff);
  }
  return pc;
}

// ---------------------------------------------------------------- caches / public API
const urlCache = new Map();

export function iconCanvas(id) {
  const it = ITEMS[id];
  const spec = it?.icon || { k: '?' };
  return drawIcon(spec, hashStr(id)).commit();
}

/** Data URL for an item icon (cached). */
export function iconURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const url = iconCanvas(id).toDataURL();
  urlCache.set(id, url);
  return url;
}

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
  const pc = new PixelCanvas(16);
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

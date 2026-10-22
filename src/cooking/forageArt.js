// Pixel art for the foraging minigame (src/ui/Forage.js): a 112×84 scene drawn pixel by pixel and
// shown scaled up with nearest-neighbour filtering. A cave backdrop over a cross-section of the
// soil (strata, pebbles, old roots, a worm), the plant drawn big (above ground in full colour, the
// part still underground seen through the soil), the mole's paw, crumbs, glow and the meters.
// Everything is generated from the plant's spec in src/cooking/forage.js.
import { PixelCanvas } from '../gfx/PixelArt.js';
import { mat, mix } from '../gfx/px/color.js';
import { vol, fill, hash2, vnoise } from '../gfx/px/shade.js';
import { M, ring, lineIn } from '../gfx/px/parts.js';

export const FW = 112, FH = 84, SOIL = 52, PX = 50; // frame size, soil line row, plant column

const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const abgr = (c) => (0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;
const shadeC = (c, k) => { const [r, g, b] = rgb(c); return (Math.min(255, r * k) << 16) | (Math.min(255, g * k) << 8) | Math.min(255, b * k); };

// ---------------------------------------------------------------- frame buffer
export class Frame {
  constructor(w = FW, h = FH) {
    this.w = w; this.h = h;
    this.img = new ImageData(w, h);
    this.u = new Uint32Array(this.img.data.buffer);
  }
  set(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.u[y * this.w + x] = abgr(c); }
  /** Blend colour c over (x, y) by a (0..1). */
  mix(x, y, c, a) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = y * this.w + x, o = this.u[i];
    const r0 = o & 255, g0 = (o >> 8) & 255, b0 = (o >> 16) & 255;
    const [r, g, b] = rgb(c);
    const k = Math.min(1, a);
    this.u[i] = (0xff000000 | (Math.round(b0 + (b - b0) * k) << 16) | (Math.round(g0 + (g - g0) * k) << 8) | Math.round(r0 + (r - r0) * k)) >>> 0;
  }
  /** Additive light (c scaled by a). */
  add(x, y, c, a) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = y * this.w + x, o = this.u[i];
    const [r, g, b] = rgb(c);
    const R = Math.min(255, (o & 255) + r * a), G = Math.min(255, ((o >> 8) & 255) + g * a), B = Math.min(255, ((o >> 16) & 255) + b * a);
    this.u[i] = (0xff000000 | (B << 16) | (G << 8) | R) >>> 0;
  }
  get(x, y) { const o = this.u[(y | 0) * this.w + (x | 0)]; return ((o & 255) << 16) | (o & 0xff00) | ((o >> 16) & 255); }
  copy(src) { this.u.set(src); }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); }
  /** Glow halo: soft additive disc. */
  halo(cx, cy, r, c, a) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d < 1) this.add(x, y, c, a * (1 - d) * (1 - d));
    }
  }
  flipY(y0 = 0, y1 = this.h) {
    for (let a = y0, b = y1 - 1; a < b; a++, b--) {
      const ra = this.u.slice(a * this.w, a * this.w + this.w);
      this.u.copyWithin(a * this.w, b * this.w, b * this.w + this.w);
      this.u.set(ra, b * this.w);
    }
  }
}

/** A sprite: packed pixels from a PixelCanvas (colour, alpha, glow). */
function toSprite(pc, extra = {}) {
  const n = pc.w * pc.h, col = new Int32Array(n).fill(-1), glow = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (pc.d[i * 4 + 3] < 128) continue;
    col[i] = (pc.d[i * 4] << 16) | (pc.d[i * 4 + 1] << 8) | pc.d[i * 4 + 2];
    if (pc.glow) glow[i] = pc.glow[i];
  }
  return { w: pc.w, h: pc.h, col, glow, ...extra };
}

/**
 * Draw a sprite into the frame. ox/oy: frame position of sprite (0,0). rows: [r0, r1) sprite rows.
 * fn(x, y, c, sx, sy) → colour (or -1 to skip) lets the caller tint (soil, heat, strain).
 */
export function blit(f, s, ox, oy, o = {}) {
  const r0 = o.r0 ?? 0, r1 = o.r1 ?? s.h;
  const fn = o.fn;
  for (let sy = r0; sy < r1; sy++) for (let sx = 0; sx < s.w; sx++) {
    let c = s.col[sy * s.w + sx];
    if (c < 0) continue;
    const x = ox + (o.flipX ? s.w - 1 - sx : sx), y = oy + sy;
    if (fn) { c = fn(x, y, c, sx, sy); if (c < 0) continue; }
    f.set(x, y, c);
  }
}

// ---------------------------------------------------------------- backdrops
const ROCK = [0x1e1820, 0x261e28, 0x2e2430, 0x382c3a, 0x443646];
const SOILC = [0x6a4a30, 0x5a3e28, 0x4c3422, 0x3e2a1c, 0x322216];

function rnd(seed) { let s = (seed * 9301 + 49297) % 233280; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

/** The cave behind the plant: rock plates, glow-worm specks, a dark vignette. */
function rockFace(f, seed, y0, y1, light = 0) {
  for (let y = y0; y < y1; y++) for (let x = 0; x < f.w; x++) {
    const n = vnoise(x * 0.11, y * 0.13, seed), m = vnoise(x * 0.32 + 9, y * 0.3, seed + 3);
    let k = Math.floor(n * 3.2 + m * 1.2 + light);
    // plate edges: where the coarse noise crosses a level, a dark crack with a lit lip above
    const e = Math.abs(((n * 7) % 1) - 0.5);
    if (e < 0.06) k = 0; else if (e < 0.1 && ((x + y) & 1)) k = Math.min(4, k + 1);
    f.set(x, y, ROCK[Math.max(0, Math.min(4, k))]);
  }
}

function glowSpecks(f, seed, y0, y1, n = 7) {
  const r = rnd(seed + 11);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * f.w), y = Math.floor(y0 + r() * (y1 - y0));
    const c = r() < 0.6 ? 0x7fe0ff : 0x9af08a;
    f.halo(x, y, 3.5, c, 0.18);
    f.set(x, y, mix(c, 0xffffff, 0.5));
  }
}

function vignette(f, k = 0.55) {
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const dx = (x + 0.5) / f.w - 0.5, dy = (y + 0.5) / f.h - 0.5;
    const d = Math.max(0, Math.hypot(dx * 1.1, dy * 1.25) - 0.3) * k * 2.2;
    if (d > 0) f.mix(x, y, 0x0a060a, Math.min(0.85, d));
  }
}

/** Soil cross-section from row y0 down: strata, pebbles, old roots, a worm. */
function soil(f, seed, y0, o = {}) {
  const r = rnd(seed + 5);
  for (let y = y0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const d = y - y0;
    const band = d / (f.h - y0) * 3.4 + (vnoise(x * 0.07, y * 0.3, seed + 7) - 0.5) * 0.9;
    let k = Math.max(0, Math.min(4, Math.floor(band + 0.6)));
    const g = hash2(x, y, seed);
    if (g < 0.08) k = Math.min(4, k + 1); else if (g > 0.93) k = Math.max(0, k - 1);
    f.set(x, y, SOILC[k]);
  }
  // pebbles
  for (let i = 0; i < (o.pebbles ?? 14); i++) {
    const cx = r() * f.w, cy = y0 + 4 + r() * (f.h - y0 - 4), rx = 1.2 + r() * 2.6, ry = 1 + r() * 1.6;
    if (Math.abs(cx - PX) < 9 && cy < y0 + 26) continue; // keep the plant's spot clear
    const base = [0x8a807a, 0x9a8a78, 0x7a7068, 0xa89a88][Math.floor(r() * 4)];
    const R = mat(base, { cont: 1.1 });
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v > 1) continue;
      f.set(x, y, u + v < -0.6 ? R[1] : u + v > 0.7 ? R[5] : R[3]);
    }
  }
  // old dry roots threading the soil
  for (let i = 0; i < 4; i++) {
    let x = r() * f.w, y = y0 + 2 + r() * 10;
    const dx = (r() - 0.5) * 1.6;
    for (let k = 0; k < 18 + r() * 14; k++) {
      if (Math.abs(x - PX) > 8) f.set(x, y, k % 3 ? 0x2a1a10 : 0x3a2616);
      x += dx + (r() - 0.5) * 0.8; y += 0.5 + r() * 0.5;
    }
  }
  // a worm curled in its burrow
  if (o.worm !== false) {
    const wx = PX < f.w / 2 ? f.w - 18 : 14, wy = f.h - 10;
    for (let x = -3; x <= 5; x++) for (let y = -2; y <= 2; y++) if ((x / 5) ** 2 + (y / 2.4) ** 2 < 1) f.set(wx + x, wy + y, 0x1e140c);
    for (let k = 0; k < 6; k++) f.set(wx - 2 + k, wy + Math.round(Math.sin(k * 1.2)), k === 5 ? 0xf0a8a8 : k % 2 ? 0xe08890 : 0xd07880);
  }
  // the surface line: a lit crust with moss tufts and grit
  for (let x = 0; x < f.w; x++) {
    f.set(x, y0, hash2(x, 0, seed) < 0.3 ? 0x8a6a48 : 0x7a5a3a);
    f.set(x, y0 + 1, 0x5a4028);
    const h = hash2(x, 1, seed + 2);
    if (o.moss !== false && h < 0.34 && Math.abs(x - PX) > 3) {
      const t = 1 + Math.floor(hash2(x, 2, seed) * 3);
      for (let k = 1; k <= t; k++) f.set(x, y0 - k, k === t ? 0x8ac85a : 0x4e8a3a);
    } else if (h > 0.9) f.set(x, y0 - 1, 0x9a8a78);
  }
}

/** Backdrop for a scene kind: 'floor' | 'wall' | 'nest' | 'bush'. Returns a Uint32Array. */
export function backdrop(kind, seed = 1) {
  const f = new Frame();
  if (kind === 'wall') {
    rockFace(f, seed, 0, FH, 1.2);
    glowSpecks(f, seed, 0, FH, 4);
  } else {
    rockFace(f, seed, 0, SOIL, 0);
    glowSpecks(f, seed, 2, SOIL - 14, kind === 'bush' ? 9 : 7);
    // a far stalactite or two
    const r = rnd(seed + 21);
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(8 + r() * (FW - 16)), L = 6 + Math.floor(r() * 9);
      if (Math.abs(x - PX) < 14) continue;
      for (let k = 0; k < L; k++) { const w = Math.max(0, Math.round((1 - k / L) * 2)); for (let d = -w; d <= w; d++) f.set(x + d, k, d < 0 ? ROCK[3] : ROCK[2]); }
    }
    soil(f, seed, SOIL, { worm: kind !== 'nest', moss: kind !== 'nest' });
  }
  vignette(f, kind === 'wall' ? 0.45 : 0.5);
  return f.u.slice();
}

// ---------------------------------------------------------------- plant sprites
const SW = 56, SH = 88, AY = 46; // plant sprite canvas and its soil row; stem column at SW / 2
const SX = SW / 2;

function leafM(w, h, x0, y0, x1, y1, wid, bend = 0) {
  const m = M(w, h);
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L;
  for (let i = 0; i <= 30; i++) {
    const t = i / 30, b = Math.sin(t * Math.PI) * bend;
    m.disk(x0 + dx * t + px * b, y0 + dy * t + py * b, Math.max(0.35, Math.sin(Math.pow(t, 0.8) * Math.PI) * wid));
  }
  return m;
}
function leafAt(pc, x0, y0, x1, y1, wid, R, bend = 0) {
  const m = leafM(pc.w, pc.h, x0, y0, x1, y1, wid, bend);
  ring(pc, m, R);
  vol(pc, m, R, { round: Math.max(1, wid * 0.8) });
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L;
  for (let i = 3; i < 27; i++) { const t = i / 30, b = Math.sin(t * Math.PI) * bend; const x = x0 + dx * t + px * b, y = y0 + dy * t + py * b; if (m.get(x, y)) pc.set(x, y, R[2]); }
  return m;
}

/** Hair roots spreading down from (x, y). */
function hairRoots(pc, x, y, n, len, c, seed) {
  const r = rnd(seed);
  for (let i = 0; i < n; i++) {
    let px = x + (r() - 0.5) * 3, py = y;
    const dir = (r() - 0.5) * 1.4;
    const L = len * (0.6 + r() * 0.5);
    for (let k = 0; k < L; k++) {
      pc.set(px, py, k < L * 0.4 ? c : shadeC(c, 0.85));
      px += dir * 0.6 + (r() - 0.5) * 0.7; py += 0.8 + r() * 0.3;
      if (k > 3 && r() < 0.12) { // a side hair
        let qx = px, qy = py; const sd = r() < 0.5 ? -1 : 1;
        for (let j = 0; j < 3 + r() * 3; j++) { qx += sd * 0.8; qy += 0.6; pc.set(qx, qy, shadeC(c, 0.8)); }
      }
    }
  }
}

function stemCol(pc, x, y0, y1, R, w = 1) {
  for (let y = y0; y <= y1; y++) for (let d = -w; d <= w; d++) pc.set(x + d, y, d < 0 ? R[2] : d > 0 ? R[4] : R[3]);
}

function capForm(pc, s) {
  const C = s.col;
  const ST = mat(C.stem, { cont: 1 }), CP = mat(C.cap, { cont: 1.05 });
  const shroom = (cx, by, h, r, main) => {
    const stem = M(SW, SH).poly([[cx - r * 0.22, by - h], [cx + r * 0.22, by - h], [cx + r * 0.3, by], [cx - r * 0.3, by]]);
    ring(pc, stem, ST); vol(pc, stem, ST, { mode: 'cyl', axis: Math.PI / 2 });
    const cy = by - h;
    const gills = M(SW, SH).ellipse(cx, cy + 0.5, r * 0.95, r * 0.3);
    const cap = M(SW, SH).ellipse(cx, cy - r * 0.08, r, r * 0.72).sub(M(SW, SH).rect(0, Math.round(cy + 0.5), SW, SH));
    ring(pc, gills.clone().union(cap), CP);
    gills.each((x, y) => { pc.set(x, y, (x % 2) ? C.gill : shadeC(C.gill, 0.8)); if (s.glow) pc.emit(x, y, 0.8); });
    vol(pc, cap, CP, { spec: 0.86, round: r * 0.6, emit: s.glow ? 0.6 : 0 });
    for (const [dx, dy] of [[-0.45, -0.35], [0.25, -0.5], [0.55, -0.1], [-0.1, -0.15], [0.05, -0.55]]) { pc.set(cx + dx * r, cy + dy * r, C.spot); if (s.glow) pc.emit(cx + dx * r, cy + dy * r, 1); }
    if (main && s.spores) for (let i = 0; i < 4; i++) pc.set(cx - r + i * r * 0.6, cy - r * 0.2, C.hi);
  };
  // mycelium threads + a little bulb under the soil
  const bulb = M(SW, SH).ellipse(SX, AY + 2, 3.2, 2.4);
  ring(pc, bulb, ST); vol(pc, bulb, ST, { round: 1.5 });
  hairRoots(pc, SX, AY + 3, 7, 9, 0xf0ece0, 3);
  shroom(SX + 9, AY + 1, 8, 4.4, false);
  shroom(SX - 1, AY + 1, 16, 9, true);
  shroom(SX - 9, AY + 1, 5, 3, false);
  return { gripY: AY - 6, rootEnd: AY + 12 };
}

function rootForm(pc, s) {
  const C = s.col;
  const R = mat(C.body, { cont: 1.1 }), LR = mat(C.leaf, { cont: 1.1 });
  // greens above the soil
  if (s.leaves === 'feather') {
    for (const [a, l, b] of [[-0.5, 26, 2], [-0.15, 30, -1.5], [0.2, 27, 1.5], [0.55, 22, -2], [-0.8, 18, 2]]) {
      const x1 = SX + Math.sin(a) * l, y1 = AY - 2 - Math.cos(a) * l;
      lineIn(pc, SX, AY - 2, x1, y1, LR[4]);
      for (let k = 0.25; k < 1; k += 0.12) {
        const x = SX + (x1 - SX) * k, y = AY - 2 + (y1 - AY + 2) * k, w = (1 - k) * 4 + 1;
        leafAt(pc, x, y, x - Math.cos(a) * w + b * 0.3, y - Math.sin(a) * w - 1, 0.9, LR, 0.4);
        leafAt(pc, x, y, x + Math.cos(a) * w + b * 0.3, y + Math.sin(a) * w - 1, 0.9, LR, -0.4);
      }
    }
  } else {
    for (const [a, l, b] of [[-0.35, 24, 2], [0, 28, -1], [0.32, 25, -2], [-0.7, 16, 1.5], [0.7, 15, -1.5]]) {
      leafAt(pc, SX, AY - 1, SX + Math.sin(a) * l, AY - 1 - Math.cos(a) * l, 2, LR, b);
    }
  }
  // the body underground
  let end = AY + s.depth;
  const body = M(SW, SH);
  if (s.body === 'taper') {
    for (let i = 0; i <= 40; i++) { const t = i / 40; body.disk(SX + Math.sin(t * 2.2) * 1.2, AY - 1 + t * (s.depth + 2), Math.max(0.5, 5.2 * Math.pow(1 - t, 0.8))); }
    end = AY + s.depth + 1;
  } else if (s.body === 'chili') {
    for (let i = 0; i <= 40; i++) { const t = i / 40; body.disk(SX + Math.sin(t * 3.2) * 3, AY - 1 + t * s.depth, Math.max(0.5, 3.8 * Math.pow(1 - t, 0.6))); }
  } else if (s.body === 'tuber') {
    body.ellipse(SX, AY + s.depth * 0.55, 11, 8.5).ellipse(SX - 6, AY + s.depth * 0.4, 6, 6).ellipse(SX + 7, AY + s.depth * 0.7, 6.5, 5.5);
    body.capsule(SX, AY - 1, SX, AY + 4, 1.4);
  } else {
    // bulb (garlic): round with a neck
    body.ellipse(SX, AY + s.depth * 0.6, 8, 7).poly([[SX - 2, AY - 1], [SX + 2, AY - 1], [SX + 3, AY + 4], [SX - 3, AY + 4]]);
  }
  ring(pc, body, R);
  vol(pc, body, R, { round: 4, spec: s.body === 'chili' ? 0.75 : 0.9, bounce: true, tex: s.body === 'tuber' ? (x, y) => (vnoise(x * 0.5, y * 0.5, 9) - 0.5) * 0.3 : undefined });
  if (s.body === 'taper') for (let y = AY + 3; y < AY + s.depth - 2; y += 4) lineIn(pc, SX - 3, y, SX + 2, y + 1, R[4], body);
  if (s.body === 'tuber') body.each((x, y) => { if (hash2(x, y, 31) < 0.05) pc.set(x, y, R[5]); });
  if (s.body === 'bulb') for (const dx of [-4, 0, 4]) lineIn(pc, SX + dx * 0.4, AY + 3, SX + dx, AY + s.depth * 0.6 + 6, R[4], body);
  const b = body.bounds();
  hairRoots(pc, SX, b.y1, s.body === 'tuber' ? 6 : 4, 8, 0xc8b088, 7);
  if (s.body !== 'taper') hairRoots(pc, SX + (b.x1 - SX) * 0.7, b.y1 - 3, 2, 6, 0xc8b088, 9);
  return { gripY: AY - 4, rootEnd: b.y1 + 8 };
}

function herbForm(pc, s) {
  const C = s.col, LR = mat(C.leaf, { cont: 1.15, sat: 0.9 }), SR = mat(C.stem);
  const n = s.fronds || 5;
  for (let i = 0; i < n; i++) {
    const a = -0.9 + (i / (n - 1)) * 1.8, L = (s.small ? 14 : 22) * (0.75 + 0.25 * Math.cos(a));
    let x = SX, y = AY - 1;
    const pts = [[x, y]];
    for (let k = 0; k < L; k++) { x += Math.sin(a + k * 0.03 * Math.sign(a)); y -= Math.cos(a) * 0.95; pts.push([x, y]); }
    for (let k = 0; k + 1 < pts.length; k++) lineIn(pc, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], SR[3]);
    for (let k = 3; k < pts.length - 1; k += 2) {
      const t = k / pts.length, l = s.small ? 1.6 : (1 - t) * 4.5 + 1.2;
      const [px, py] = pts[k];
      for (const sd of [-1, 1]) {
        const m = leafM(SW, SH, px, py, px + sd * l * Math.cos(a), py - l * 0.5 + sd * l * Math.sin(a), Math.max(0.6, l * 0.32), sd * 0.4);
        ring(pc, m, LR); vol(pc, m, LR, { round: 1 });
      }
    }
    pc.set(pts[pts.length - 1][0], pts[pts.length - 1][1], LR[1]);
  }
  // crown + a shallow tuft of roots
  const crown = M(SW, SH).ellipse(SX, AY, 3, 1.6);
  ring(pc, crown, SR); fill(pc, crown, SR[4]);
  hairRoots(pc, SX, AY + 1, 6, s.depth + 3, 0xb8a080, 13);
  return { gripY: s.small ? AY - 3 : AY - 5, rootEnd: AY + s.depth + 5 };
}

function flowerForm(pc, s) {
  const C = s.col, SR = mat(C.stem, { cont: 1.05 }), PR = mat(C.petal, { cont: 1.1 });
  const top = AY - 26;
  stemCol(pc, SX, top + 3, AY + 1, SR, 0);
  pc.set(SX + 1, top + 10, SR[2]);
  leafAt(pc, SX, AY - 8, SX - 10, AY - 14, 2.2, mat(s.lotus ? 0x3a6a3a : mix(C.stem, 0x4a9a3a, 0.5)), 1.5);
  leafAt(pc, SX, AY - 13, SX + 9, AY - 19, 2, mat(s.lotus ? 0x3a6a3a : mix(C.stem, 0x4a9a3a, 0.5)), -1.5);
  const n = s.petals || 6;
  for (let ringI = 0; ringI < (s.lotus ? 2 : 1); ringI++) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ringI * 0.4;
      const L = (s.lotus ? (ringI ? 6 : 9) : 8) * (0.85 + 0.15 * Math.sin(i * 2.3));
      const x1 = SX + Math.cos(a) * L, y1 = top + Math.sin(a) * L * 0.65 - (ringI ? 3 : 0);
      const m = leafM(SW, SH, SX, top - (ringI ? 2 : 0), x1, y1, s.glass ? 1.6 : 2.2, 0.3);
      ring(pc, m, PR);
      vol(pc, m, ringI ? mat(C.hi, { cont: 1 }) : PR, { round: 1.5, spec: s.glass ? 0.6 : 0.88, emit: s.glow ? 0.7 : 0 });
    }
  }
  const heart = M(SW, SH).disk(SX, top - 1, 2.2);
  fill(pc, heart, C.heart, s.glow ? 1 : 0);
  pc.set(SX - 1, top - 2, 0xffffff);
  if (s.hot) for (let i = 0; i < 6; i++) { const x = SX - 6 + i * 2.4, y = top - 8 - (i % 3) * 2; pc.set(x, y, i % 2 ? 0xffd040 : 0xff7a20); pc.emit(x, y, 1); }
  if (s.glass) for (const [dx, dy] of [[-5, -2], [4, -4], [6, 1]]) { pc.set(SX + dx, top + dy, 0xffffff); pc.emit(SX + dx, top + dy, 1); }
  hairRoots(pc, SX, AY + 1, 6, s.depth + 3, 0xd8c8a8, 17);
  return { gripY: AY - 6, rootEnd: AY + s.depth + 5 };
}

function bulbForm(pc, s) {
  const C = s.col, SR = mat(C.stem), BR = mat(C.bulb, { cont: 1.05 });
  stemCol(pc, SX, AY - 9, AY + 1, SR, 0);
  leafAt(pc, SX, AY - 2, SX - 9, AY - 6, 2, mat(0x6a9a5a), 1);
  leafAt(pc, SX, AY - 3, SX + 8, AY - 8, 2, mat(0x6a9a5a), -1);
  const bulb = M(SW, SH).ellipse(SX, AY - 17, 8, 8.5);
  ring(pc, bulb, BR);
  vol(pc, bulb, BR, { spec: 0.8, round: 5, emit: 0.4 });
  bulb.each((x, y) => { if (hash2(x, y, 5) < 0.06) pc.set(x, y, C.hi); });
  for (const [dx, dy] of [[-3, -4], [-4, -2]]) { pc.set(SX + dx, AY - 17 + dy, 0xffffff); pc.emit(SX + dx, AY - 17 + dy, 1); }
  hairRoots(pc, SX, AY + 1, 5, s.depth + 3, 0xc8d0b0, 19);
  return { gripY: AY - 5, rootEnd: AY + s.depth + 5 };
}

function hangForm(pc, s) {
  // drawn growing up out of the "soil"; the scene is flipped so it hangs from the ceiling
  const C = s.col;
  const r = rnd(23);
  const base = M(SW, SH).ellipse(SX, AY, 5, 2);
  ring(pc, base, mat(C.base)); fill(pc, base, C.base);
  const n = s.stretchy ? 3 : 8;
  for (let i = 0; i < n; i++) {
    const L = s.stretchy ? 26 + i * 3 : 18 + Math.floor(r() * 12), ph = r() * 6, x0 = SX + (r() - 0.5) * 6;
    for (let k = 0; k < L; k++) {
      const x = x0 + Math.sin(k * 0.45 + ph) * (k / L) * 3, y = AY - 1 - k;
      const tip = k > L - 3;
      pc.set(x, y, tip ? C.tip : (k & 1 ? C.strand : shadeC(C.strand, 0.85)));
      if (!s.stretchy && k < L - 4) pc.set(x + 1, y, shadeC(C.strand, 0.7));
      if (s.stretchy) { pc.set(x + 1, y, shadeC(C.strand, 0.75)); if (k % 5 === 2) { pc.set(x + 2, y, C.tip); pc.set(x - 1, y - 1, C.tip); } }
      if (tip && s.glow) pc.emit(x, y, 1);
    }
  }
  if (s.stretchy) { const sap = M(SW, SH).ellipse(SX + 2, AY - 30, 2.4, 3); ring(pc, sap, mat(C.sap)); vol(pc, sap, mat(C.sap), { spec: 0.8 }); }
  hairRoots(pc, SX, AY + 1, 5, s.depth + 2, 0x8a7a68, 29);
  return { gripY: AY - 13, rootEnd: AY + s.depth + 4 };
}

const FORMS = { cap: capForm, root: rootForm, herb: herbForm, flower: flowerForm, bulb: bulbForm, hang: hangForm };

/** The big plant sprite for a pull: { w, h, ax (stem column), ay (soil row), gripY, rootEnd, col, glow }. */
export function plantSprite(id, s) {
  const pc = new PixelCanvas(SW, SH);
  const g = (FORMS[s.form] || herbForm)(pc, s);
  // the topmost opaque row (for the snap: where the stem breaks)
  return toSprite(pc, { ax: SX, ay: AY, gripY: g.gripY, rootEnd: g.rootEnd, id });
}

// ---------------------------------------------------------------- other subjects
/** Moss mat on the wall: a lumpy blob mask (peel), coloured per column so it can lift away. */
export function mossSprite(s, seed = 3) {
  const w = 64, h = 40, pc = new PixelCanvas(w, h);
  const m = M(w, h);
  const r = rnd(seed);
  for (let i = 0; i < 16; i++) m.disk(8 + i * 3.1 + (r() - 0.5) * 2, 20 + Math.sin(i * 0.9) * 6 + (r() - 0.5) * 4, 7 + r() * 4);
  const R = mat(s.col.b, { cont: 1.1 });
  ring(pc, m, mat(s.col.a));
  vol(pc, m, R, { round: 4, tex: (x, y) => (hash2(x, y, seed) - 0.5) * 0.7 });
  m.each((x, y) => {
    const h2 = hash2(x, y, seed + 9);
    if (h2 < 0.05) { pc.set(x, y, s.col.spark); pc.emit(x, y, 1); } else if (h2 > 0.9) pc.set(x, y, s.col.a);
  });
  m.edge().each((x, y) => { if (y < 20 && hash2(x, y, 4) < 0.5) { pc.set(x, y, s.col.spark); pc.emit(x, y, 0.8); } });
  return toSprite(pc, { mask: m });
}

/** Underside of a peeled flap (darker, rooty). */
export function mossUnder(c, x, y) { return hash2(x, y, 77) < 0.3 ? 0x6a5a40 : c; }

/** Berry bush: leaves and twigs; berries are drawn live. Returns { sprite, spots: [{x, y}] }. */
export function bushSprite(s, n = 11, seed = 5) {
  const w = 80, h = 56, pc = new PixelCanvas(w, h);
  const r = rnd(seed);
  const LR = mat(s.col.leaf, { cont: 1.15 }), ST = mat(s.col.stem);
  // twigs from the base
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + i * 0.4, L = 16 + r() * 14;
    lineIn(pc, 40, 54, 40 + Math.sin(a) * L * 1.3, 54 - Math.cos(a) * L, i % 2 ? ST[3] : ST[4]);
  }
  // leaf clusters
  for (let i = 0; i < 34; i++) {
    const a = r() * Math.PI - Math.PI, d = 6 + r() * 22;
    const x = 40 + Math.cos(a) * d * 1.3, y = 40 + Math.sin(a) * d * 0.9;
    const la = r() * Math.PI * 2, l = 3 + r() * 2.5;
    const m = leafM(w, h, x, y, x + Math.cos(la) * l, y + Math.sin(la) * l, 1.4, (r() - 0.5) * 1.2);
    ring(pc, m, LR); vol(pc, m, LR, { round: 1 });
  }
  const spots = [];
  for (let t = 0; t < 200 && spots.length < n; t++) {
    const a = r() * Math.PI - Math.PI, d = 6 + r() * 20;
    const x = Math.round(40 + Math.cos(a) * d * 1.3), y = Math.round(40 + Math.sin(a) * d * 0.85);
    if (y > 50 || spots.some((p) => Math.hypot(p.x - x, p.y - y) < 6)) continue;
    spots.push({ x, y });
  }
  return { sprite: toSprite(pc), spots, w, h };
}

/** A round berry (3×3 + shine) at frame x, y. */
export function berry(f, x, y, c, ripe) {
  const R = mat(c, { cont: 1.15 });
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (Math.abs(i) + Math.abs(j) < 2 || ripe) f.set(x + i, y + j, i + j < 0 ? R[2] : i + j > 0 ? R[4] : R[3]);
  f.set(x - 2, y, R[6]); f.set(x + 2, y, R[6]); f.set(x, y - 2, R[6]); f.set(x, y + 2, R[6]);
  if (ripe) { f.set(x - 1, y - 2, R[6]); f.set(x + 1, y + 2, R[6]); f.set(x - 2, y - 1, R[6]); f.set(x + 2, y + 1, R[6]); }
  f.set(x - 1, y - 1, ripe ? 0xffe0e8 : 0xf0ffe0);
  f.set(x, y - 2, 0x4a3a20);
}

/** Truffle / grub buried: sprite drawn whole; soil cover is handled by the scene. */
export function buriedSprite(id, s) {
  const pc = new PixelCanvas(40, 28);
  if (id === 'grub') {
    const R = mat(s.col.body, { cont: 1.05, warm: 55 });
    const m = M(40, 28);
    for (let i = 0; i < 9; i++) { const a = Math.PI * (0.1 + i * 0.12); m.disk(20 + Math.cos(a) * 11, 18 - Math.sin(a) * 9, 4); }
    ring(pc, m, R); vol(pc, m, R, { round: 3, spec: 0.85 });
    for (let i = 1; i < 9; i++) { const a = Math.PI * (0.04 + i * 0.12); const x = 20 + Math.cos(a) * 11, y = 18 - Math.sin(a) * 9; lineIn(pc, x - Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, x + Math.cos(a) * 3.5, y - Math.sin(a) * 3.5, R[4], m); }
    const head = M(40, 28).disk(8.5, 15, 3.2);
    const HR = mat(s.col.head, { cont: 1.1 });
    ring(pc, head, HR); vol(pc, head, HR, { round: 1.5, spec: 0.8 });
    pc.set(6, 17, 0x2a1408); pc.set(7, 18, 0x2a1408);
  } else {
    const R = mat(s.col.body, { cont: 1.2 });
    const m = M(40, 28).ellipse(20, 15, 10, 8.5).ellipse(14, 12, 5, 5).ellipse(26, 18, 5, 4.5);
    ring(pc, m, mat(0x5a4a40)); vol(pc, m, R, { round: 5, tex: (x, y) => (hash2(x, y, 51) - 0.5) * 0.9 });
    m.each((x, y) => { if (hash2(x, y, 53) < 0.12) pc.set(x, y, s.col.hi); });
  }
  return toSprite(pc);
}

// The mole's paw: a broad pink digging paw with four big ivory claws, on a dark furry arm that
// comes in from the bottom right. OPEN reaches up, claws fanned; GRIP wraps the claws left round a
// stem at the hotspot. Painted as parts with a shared 1px dark outline.
const PAW = { o: 0x2a1418, P: 0xf6c0b8, p: 0xe89a96, q: 0xc47474, Q: 0xa85a60, C: 0xfff4e0, c: 0xe8dcc4, k: 0xa89878, f: 0x4a3a34, F: 0x6e5a4e, g: 0x2e2420 };

export function pawSprite(grip) {
  const N = 24, col = new Int32Array(N * N).fill(-1);
  const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < N && y < N) col[y * N + x] = c; };
  const ell = (cx, cy, rx, ry, fn) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v <= 1) put(x, y, fn(u, v));
    }
  };
  const skin = (u, v) => { const l = -u * 0.55 - v * 0.75; return l > 0.45 ? PAW.P : l > -0.25 ? PAW.p : l > -0.7 ? PAW.q : PAW.Q; };
  // the furry arm
  for (let t = 0; t <= 1; t += 0.02) {
    const x = (grip ? 16 : 14) + t * 12, y = (grip ? 14 : 12) + t * 12, r = 4.6 - t * 0.4;
    ell(x, y, r, r, (u, v) => { const h = hash2(Math.round(x + u * r), Math.round(y + v * r), 5); return u + v < -0.6 ? PAW.F : h < 0.15 ? PAW.F : u + v > 0.7 ? PAW.g : PAW.f; });
  }
  if (grip) {
    ell(14, 10, 5.4, 6.6, skin);
    for (let i = 0; i < 4; i++) ell(9.2, 5 + i * 3.1, 1.9, 1.5, (u, v) => (u + v < 0 ? PAW.P : PAW.p)); // knuckles
    for (let i = 0; i < 4; i++) {
      const y = 4.6 + i * 3.1, L = i === 0 || i === 3 ? 6 : 7;
      for (let k = 0; k < L; k++) { const x = 8 - k; put(x, y, PAW.C); if (k < L - 2) put(x, y + 1, PAW.k); }
      put(8 - L, y + 1, PAW.c); put(8 - L, y + 2, PAW.k); // the hooked tip
    }
  } else {
    ell(10, 10, 7.6, 5.4, skin);
    for (let i = 0; i < 4; i++) ell(4.6 + i * 3.6, 5.6, 1.8, 1.6, (u, v) => (u + v < 0 ? PAW.P : PAW.p));
    for (let i = 0; i < 4; i++) {
      const x0 = 4.3 + i * 3.6, L = i === 0 || i === 3 ? 4 : 5, lean = -0.35 + i * 0.12;
      for (let k = 0; k < L; k++) { const x = x0 + lean * k, y = 4 - k; put(x, y, PAW.C); if (k < L - 1) put(x + 1, y, PAW.k); }
    }
    put(9, 10, PAW.q); put(13, 9, PAW.q); put(7, 12, PAW.q); // pads
  }
  // one shared dark outline round the whole paw
  const out = col.slice();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (col[y * N + x] >= 0) continue;
    const nb = (xx, yy) => xx >= 0 && yy >= 0 && xx < N && yy < N && col[yy * N + xx] >= 0;
    if (nb(x - 1, y) || nb(x + 1, y) || nb(x, y - 1) || nb(x, y + 1)) out[y * N + x] = PAW.o;
  }
  return { w: N, h: N, col: out, glow: new Float32Array(N * N), hx: grip ? 4 : 5, hy: grip ? 9 : 1 };
}

/** Darken the soil round the underground part of a sprite (the pocket its roots sit in). */
const POCKET = new Uint8Array(FW * FH);
export function pocket(f, s, ox, oy, r0, soilY, r = 1) {
  POCKET.fill(0);
  for (let sy = r0; sy < s.h; sy++) for (let sx = 0; sx < s.w; sx++) {
    if (s.col[sy * s.w + sx] < 0) continue;
    const x = ox + sx, y = oy + sy;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const X = x + dx, Y = y + dy;
      if (Y <= soilY + 1 || X < 0 || Y < 0 || X >= FW || Y >= FH) continue;
      const k = Math.abs(dx) + Math.abs(dy) <= r ? 2 : 1;
      if (POCKET[Y * FW + X] < k) POCKET[Y * FW + X] = k;
    }
  }
  for (let i = 0; i < POCKET.length; i++) if (POCKET[i]) f.mix(i % FW, (i / FW) | 0, 0x1a100a, POCKET[i] === 2 ? 0.5 : 0.25);
}

// ---------------------------------------------------------------- meters (drawn into the frame)
/**
 * Vertical tension gauge at x: zones (soft grey, good green, strain amber, snap red), the needle at
 * v (0..vmax) and a strain fill. Pixel-crisp, outlined.
 */
export function gauge(f, x, y, h, v, o) {
  const vmax = o.vmax ?? 1.3;
  const toY = (t) => y + h - 1 - Math.round(Math.max(0, Math.min(1, t / vmax)) * (h - 2));
  f.rect(x - 1, y - 1, 9, h + 2, 0x120a0c);
  for (let j = 0; j < h; j++) {
    const t = ((h - 1 - j) / (h - 2)) * vmax;
    let c = t < o.band[0] ? 0x4a4048 : t <= o.band[1] ? 0x3a8a3a : t <= o.snap ? 0xb8862a : 0xa8302a;
    if (o.glow && t >= o.band[0] && t <= o.band[1]) c = mix(c, 0x9af07a, 0.4 + 0.2 * Math.sin(o.time * 8));
    for (let i = 0; i < 7; i++) f.set(x + i, y + j, i === 0 ? shadeC(c, 1.25) : i === 6 ? shadeC(c, 0.7) : c);
  }
  // band edges as bright ticks
  for (const t of [o.band[0], o.band[1]]) { const yy = toY(t); for (let i = -1; i < 8; i++) f.set(x + i, yy, 0xd8f0c0); }
  // the needle: a white wedge pointing at the tube from the left
  const ny = toY(v);
  for (let k = 0; k < 4; k++) for (let j = -k; j <= k; j++) f.set(x - 2 - k, ny + j, k === 3 ? 0x1a1014 : 0xffffff);
  for (let i = 0; i < 7; i++) f.set(x + i, ny, 0xffffff);
  // strain: a red fill climbing a thin side bar
  if (o.strain !== undefined) {
    f.rect(x + 8, y - 1, 3, h + 2, 0x120a0c);
    const sh = Math.round(Math.max(0, Math.min(1, o.strain)) * (h - 1));
    for (let j = 0; j < sh; j++) f.set(x + 9, y + h - 1 - j, j > h * 0.7 ? 0xff5a3a : 0xd8402a);
  }
}

/** Small horizontal meter (loosen / heat / lift) with a coloured fill and an optional target tick. */
export function hmeter(f, x, y, w, v, c, o = {}) {
  f.rect(x - 1, y - 1, w + 2, 5, 0x120a0c);
  f.rect(x, y, w, 3, 0x2a2026);
  const n = Math.round(Math.max(0, Math.min(1, v)) * w);
  for (let i = 0; i < n; i++) { f.set(x + i, y, shadeC(c, 1.3)); f.set(x + i, y + 1, c); f.set(x + i, y + 2, shadeC(c, 0.75)); }
  if (o.target !== undefined) { const tx = x + Math.round(o.target * w); for (let j = -2; j < 5; j++) f.set(tx, y + j - 1, 0xffffff); }
}

// ---------------------------------------------------------------- tiny icons beside the meters
export function iconRoots(f, x, y, c = 0xd8c8a8) {
  for (let j = 0; j < 5; j++) f.set(x + 2, y + j, 0x7a5a3a);
  for (const [i, j] of [[1, 3], [0, 4], [3, 3], [4, 4], [1, 5], [3, 5]]) f.set(x + i, y + j, c);
}
export function iconArrow(f, x, y, c = 0xffffff, down = false) {
  for (let k = 0; k < 3; k++) for (let j = -k; j <= k; j++) f.set(x + 2 + j, down ? y + 4 - k : y + k, c);
  for (let j = 3; j < 6; j++) f.set(x + 2, down ? y + 4 - j : y + j, c);
}
export function iconFlame(f, x, y) {
  for (const [i, j, c] of [[2, 0, 0xffd040], [1, 1, 0xffa020], [2, 1, 0xffe080], [3, 1, 0xff7a20], [1, 2, 0xff7a20], [2, 2, 0xfff0a0], [3, 2, 0xffa020], [1, 3, 0xd84a1a], [2, 3, 0xff7a20], [3, 3, 0xd84a1a]]) f.set(x + i, y + j, c);
}

export { shadeC, rnd };

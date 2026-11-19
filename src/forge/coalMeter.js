// The forge heat meter as a burning coal bed (wave 18): a wrought-iron fire basket stacked with
// coal on the thermometer's board. The fire climbs the stack with the heat (the glow front is the
// reading) and every lit lump shows the colour of that heat: black, dull red, cherry, orange,
// yellow, white. Lumps breathe and flicker, the cracks between them pulse brighter than the
// crusted faces, sparks rise off the front and the air above it shimmers (rows shift). The band to
// hit is a chalk bracket on the board with a brass pointer at it; a brass rider on the right rail
// marks the exact heat; the smith's painted swatches run up the right edge; the burn line is red
// chalk. Drawn into one small canvas at R fine pixels per art pixel (one art px = one --px), the
// static parts cached once, the coal re-coloured per frame from typed arrays (no DOM churn).
// Light from the top left (lamp) plus the coals' own glow on the iron.
import { glowHex } from './blackbody.js';

export const R = 2;
/** Layout in art pixels (see the header). The coal column is y0..y1 (0 °C at the bottom row). */
export const CB = { W: 34, H: 118, col: { x0: 9, x1: 24, y0: 14, y1: 101 }, railL: 7, railR: 25, straps: [44, 73] };

const pk = (c, a = 255) => ((a << 24) | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;
const unpk = (u) => ((u & 255) << 16) | (u & 0xff00) | ((u >> 16) & 255);
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const hsh = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mixC = (a, b, t) => {
  const s = 1 - t;
  return ((((a >> 16) & 255) * s + ((b >> 16) & 255) * t) << 16) | ((((a >> 8) & 255) * s + ((b >> 8) & 255) * t) << 8) | (((a & 255) * s + (b & 255) * t) | 0);
};
const mixU = (o, c, t) => pk(mixC(unpk(o), c, t));

// ramps (darkest first), hue-shifted: shadows lean purple/blue, lights warm
const COAL = [0x060509, 0x0e0b12, 0x18141c, 0x241e2a, 0x332b3a, 0x463c4e, 0x625668, 0x8c8094, 0xc4bccc];
const IRON = [0x07060a, 0x110e13, 0x1c181e, 0x2a242b, 0x3a333b, 0x4e4650, 0x6a6070, 0x8e8494, 0xb8b0be];
const BRASS = [0x2a1406, 0x4a2a0c, 0x704412, 0x9a6418, 0xc48a26, 0xe2b03e, 0xf6d468, 0xfff0b0, 0xffffff];
const ASH = [0x5a5050, 0x7a6e6a, 0x9c908a, 0xc0b4ac];
const INK = 0x120a08;
const CHALK = { work: [0xfff2b8, 0xd8c47a], melt: [0xfff2b8, 0xd8c47a], quench: [0xd8f2ff, 0x86bede], burn: [0xff9a80, 0xc8483a], max: [0xf4f0e8, 0xa8a49c] };
// the heat ramp (hue-shifted by hand, darkest first) and where each blackbody heat sits on it
const T0 = 470, NH = 16;
const HEATC = [0x1c0604, 0x2e0806, 0x4a0c08, 0x6c120a, 0x8e180c, 0xb02010, 0xcc3214, 0xe24a18, 0xf2681e, 0xfa8a26, 0xffa834, 0xffc24a, 0xffd96c, 0xffeb9a, 0xfff6cc, 0xffffff];
const HEAT = HEATC.map((c) => pk(c));
const HK = [[470, 0], [560, 2], [620, 3.5], [690, 5], [750, 6], [820, 7], [900, 8.2], [1000, 9.3], [1100, 10.6], [1200, 11.8], [1300, 13], [1450, 14.2], [1650, 15]];
const heatIdx = (T) => {
  if (T <= HK[0][0]) return 0;
  for (let i = 1; i < HK.length; i++) if (T <= HK[i][0]) { const a = HK[i - 1], b = HK[i]; return a[1] + (b[1] - a[1]) * (T - a[0]) / (b[0] - a[0]); }
  return NH - 1;
};
const COALP = COAL.map((c) => pk(c));

const tone = (ramp, k, x, y) => { const f = clamp(k, 0, 0.999) * (ramp.length - 1), i = f | 0; return ramp[Math.min(ramp.length - 1, i + (f - i > bay(x, y) ? 1 : 0))]; };

class Raster {
  constructor(w, h) { this.w = w; this.h = h; this.u = new Uint32Array(w * h); }
  set(x, y, c, a = 255) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.u[y * this.w + x] = pk(c, a); }
  a(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.u[y * this.w + x] >>> 24; }
  /** art px → R×R block */
  A(x, y, c) { for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) this.set(x * R + i, y * R + j, c); }
  outline(c, x0 = 0, y0 = 0, x1 = this.w - 1, y1 = this.h - 1) {
    const add = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (this.a(x, y)) continue;
      if (this.a(x - 1, y) || this.a(x + 1, y) || this.a(x, y - 1) || this.a(x, y + 1)) add.push(x, y);
    }
    for (let k = 0; k < add.length; k += 2) this.set(add[k], add[k + 1], c);
  }
}

let BASE = null;
/** The fire basket, grate and ash pan (fine px), plus the coal: per-pixel lump, facet shade, crack. */
function base() {
  if (BASE) return BASE;
  const W = CB.W * R, H = CB.H * R, c = CB.col, r = new Raster(W, H);
  const cx0 = c.x0 * R, cx1 = (c.x1 + 1) * R - 1, cy0 = c.y0 * R, cy1 = (c.y1 + 1) * R - 1;
  // ---- the ash pan: a shallow riveted iron dish, grey ash heaped in it, two splayed feet
  for (let y = 106; y <= 113; y++) for (let x = 3; x <= 30; x++) {
    const inset = y === 106 ? 0 : y >= 112 ? (y - 111) * 2 : 0;
    if (x < 3 + inset || x > 30 - inset) continue;
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const fx = x * R + i, fy = y * R + j;
      let k = y === 106 ? (j ? 0.55 : 0.85) : 0.42 - (y - 107) * 0.04 + (x < 6 ? 0.12 : x > 27 ? -0.12 : 0);
      if (y >= 107 && y <= 109 && x > 4 && x < 29) { // the ash heaped in it
        const hump = 108.6 - Math.sin((x - 4) / 24 * Math.PI) * 1.6 + (hsh(x, 3, 5) - 0.5);
        if (y + j / R >= hump) { r.set(fx, fy, tone(ASH, 0.35 + (hsh(fx, fy, 6) - 0.5) * 0.5 + (y === 107 ? 0.25 : 0), fx, fy)); continue; }
      }
      k += (hsh(fx >> 1, fy, 7) - 0.5) * 0.1;
      r.set(fx, fy, tone(IRON, k, fx, fy));
    }
  }
  for (const fx0 of [5 * R, 26 * R]) for (let fy = 114 * R; fy < 117 * R; fy++) for (let i = 0; i < R + 1; i++) r.set(fx0 + i + (fx0 < 20 ? -(fy - 114 * R) / 2 : (fy - 114 * R) / 2), fy, i === 0 ? IRON[5] : IRON[3]);
  for (const x of [4, 29]) { r.set(x * R, 107 * R, BRASS[6]); r.set(x * R + 1, 107 * R, BRASS[4]); r.set(x * R, 107 * R + 1, BRASS[3]); r.set(x * R + 1, 107 * R + 1, BRASS[1]); }
  // ---- the grate: three iron bars under the coal, gaps where embers fall
  for (let y = 102; y <= 104; y++) for (let fx = (c.railL) * R; fx < (c.railR + 2) * R; fx++) for (let j = 0; j < R; j++) {
    const fy = y * R + j;
    if (y === 103 && ((fx >> 2) & 1)) continue; // the slots
    const k = (y === 102 ? 0.55 : y === 103 ? 0.4 : 0.25) + (j === 0 ? 0.12 : 0) + (hsh(fx, fy, 9) - 0.5) * 0.1;
    r.set(fx, fy, tone(IRON, k, fx, fy));
  }
  // ---- the two rails: square wrought bars, lit on the left face, a twist every few rows
  for (const rx of [CB.railL, CB.railR]) for (let fy = 10 * R; fy < 105 * R; fy++) for (let i = 0; i < 2 * R; i++) {
    const fx = rx * R + i, tw = ((fy + (rx === CB.railL ? 0 : 3)) % 12) < 2;
    let k = [0.78, 0.62, 0.45, 0.28][i] + (tw ? (i < 2 ? -0.18 : 0.15) : 0) + (hsh(fx, fy >> 1, 11) - 0.5) * 0.1;
    if (rx === CB.railR) k -= 0.1;
    r.set(fx, fy, tone(IRON, k, fx, fy));
  }
  // finials: a scrolled knob on each rail's top
  for (const rx of [CB.railL, CB.railR]) {
    const X = rx * R + 2, Y = 9 * R;
    const pts = [[0, -4, 6], [-1, -3, 5], [1, -3, 4], [-2, -2, 6], [2, -2, 3], [-2, -1, 5], [2, -1, 2], [-1, 0, 4], [1, 0, 2], [0, 1, 3], [-1, -2, 7], [0, -2, 6], [1, -2, 4], [-1, -1, 5], [0, -1, 4], [1, -1, 3], [0, -3, 6]];
    for (const [dx, dy, k] of pts) r.set(X + dx, Y + dy, IRON[k]);
    r.set(X - 1, Y - 3, IRON[8]);
  }
  // the rolled rim along the top and the iron straps across the front (lit top, dark under)
  const band = (y, h) => { for (let fy = y * R; fy < (y + h) * R; fy++) for (let fx = (CB.railL - 1) * R; fx < (CB.railR + 3) * R; fx++) { const v = (fy - y * R) / (h * R - 1); const k = v < 0.26 ? 0.85 : v < 0.55 ? 0.58 : v < 0.8 ? 0.4 : 0.2; r.set(fx, fy, tone(IRON, k + (hsh(fx >> 1, fy, 13) - 0.5) * 0.12, fx, fy)); } };
  band(12, 2);
  for (const sy of CB.straps) band(sy, 2);
  // rivets where the straps cross the rails
  for (const sy of [12, ...CB.straps]) for (const rx of [CB.railL, CB.railR]) { const X = rx * R + 1, Y = sy * R + 1; r.set(X, Y, IRON[8]); r.set(X + 1, Y, IRON[6]); r.set(X, Y + 1, IRON[5]); r.set(X + 1, Y + 1, IRON[2]); }
  r.outline(INK);
  // ---- the coal: angular lumps (rotated octagonal Voronoi), flat facets lit from the top left
  const seeds = [];
  let s = 0;
  for (let gy = cy0 - 4; gy < cy1 + 8; gy += 8) for (let gx = cx0 - 5 + ((gy / 8) & 1) * 4; gx < cx1 + 8; gx += 9) {
    s++;
    seeds.push({ x: gx + (hsh(s, 1, 21) - 0.5) * 5, y: gy + (hsh(s, 2, 21) - 0.5) * 5, rot: hsh(s, 3, 21) * Math.PI, sc: 0.8 + hsh(s, 4, 21) * 0.45, fo: hsh(s, 5, 21) * 6.283, ph: hsh(s, 6, 21) * 6.283, w: 2 + hsh(s, 7, 21) * 4, fis: hsh(s, 8, 21) < 0.35 ? hsh(s, 9, 21) * 6.283 : null });
  }
  const dist = (sd, x, y) => {
    const dx = x - sd.x, dy = y - sd.y, cr = Math.cos(sd.rot), sr = Math.sin(sd.rot);
    const u = Math.abs(dx * cr + dy * sr), v = Math.abs(-dx * sr + dy * cr);
    return (Math.max(u, v) * 0.62 + (u + v) * 0.38) / sd.sc;
  };
  const idx = [], lump = [], shade = [], kind = [], hy = [];
  const LX = -0.62, LY = -0.72;
  for (let fy = cy0; fy <= cy1; fy++) for (let fx = cx0; fx <= cx1; fx++) {
    if (r.u[fy * W + fx] >>> 24) continue; // a strap in front
    let b1 = 1e9, b2 = 1e9, n1 = 0;
    for (let k = 0; k < seeds.length; k++) {
      const sd = seeds[k];
      if (Math.abs(sd.y - fy) > 16 || Math.abs(sd.x - fx) > 18) continue;
      const d = dist(sd, fx + 0.5, fy + 0.5);
      if (d < b1) { b2 = b1; b1 = d; n1 = k; } else if (d < b2) b2 = d;
    }
    const sd = seeds[n1], dx = fx + 0.5 - sd.x, dy = fy + 0.5 - sd.y;
    const rr = b1 / 5.2;
    let sh;
    if (rr < 0.42) sh = 0.62 + (hsh(n1, 7, 23) - 0.5) * 0.18; // the top face
    else {
      const a = Math.atan2(dy, dx) + sd.fo, f = Math.floor(((a % 6.283) + 6.283) % 6.283 / (6.283 / 5));
      const fa = (f + 0.5) * (6.283 / 5) - sd.fo;
      sh = 0.48 + 0.62 * (Math.cos(fa) * LX + Math.sin(fa) * LY);
    }
    let kd = b2 - b1 < 0.75 ? 1 : 0; // the crack between lumps
    if (!kd && sd.fis != null && rr > 0.2 && rr < 0.85 && Math.abs(-dx * Math.sin(sd.fis) + dy * Math.cos(sd.fis)) < 0.55) kd = 2; // a fissure across the lump
    idx.push(fy * W + fx); lump.push(n1); shade.push(clamp(sh, 0, 1)); kind.push(kd); hy.push(cy1 - fy);
  }
  BASE = {
    W, H, u: r.u, seeds,
    idx: Int32Array.from(idx), lump: Uint16Array.from(lump), shade: Float32Array.from(shade), kind: Uint8Array.from(kind), hy: Int16Array.from(hy),
    seedHy: Float32Array.from(seeds.map((sd) => cy1 - sd.y)), HC: cy1 - cy0 + 1,
  };
  return BASE;
}

/** Brass pointer (points right), 6×7 art px → a fine-px sprite. */
function pointerSprite() {
  const w = 6 * R, h = 7 * R, r = new Raster(w + 2, h + 2);
  for (let fy = 0; fy < h; fy++) for (let fx = 0; fx < w; fx++) {
    const v = (fy + 0.5) / h * 2 - 1, u = (fx + 0.5) / w;
    const half = u < 0.45 ? 0.42 : (1 - u) / 0.55 * 0.95;
    if (Math.abs(v) > half + (u < 0.45 ? 0 : 0.05)) continue;
    const k = (u < 0.45 ? 0.55 : v < -0.05 ? 0.82 : 0.4) + (fy < 2 && u < 0.45 ? 0.2 : 0);
    r.set(fx + 1, fy + 1, tone(BRASS, k, fx, fy));
  }
  r.outline(0x2a1406);
  r.set(2, R + 2, BRASS[8]); r.set(3, R + 2, BRASS[7]);
  return r;
}
/** The brass rider: a collar round the right rail with a tongue pointing left into the coal, 7×6 art px. */
function riderSprite() {
  const w = 7 * R, h = 6 * R, r = new Raster(w + 2, h + 2);
  for (let fy = 0; fy < h; fy++) for (let fx = 0; fx < w; fx++) {
    const v = Math.abs((fy + 0.5) / h * 2 - 1), u = (fx + 0.5) / w;
    if (u < 0.36 && v > u / 0.36 * 0.75) continue; // the tongue's point
    let k = fy < h * 0.3 ? 0.85 : fy < h * 0.62 ? 0.58 : 0.32;
    if (u >= 0.36 && (fx === Math.round(w * 0.36) || fx === w - 1)) k -= 0.25; // the collar's edges
    r.set(fx + 1, fy + 1, tone(BRASS, k, fx, fy));
  }
  r.outline(0x1e0e04);
  r.set(Math.round(w * 0.36) + 3, 3, BRASS[8]); r.set(Math.round(w * 0.36) + 4, 3, BRASS[7]);
  return r;
}

/**
 * The coal bed: new CoalBed(), .el (a canvas), setMax(maxT), setMarks(marks), render(T, dt, dir).
 * marks as Thermo.setMarks; dir: '' | 'up' | 'down' | 'ok'.
 */
export class CoalBed {
  constructor() {
    const B = base();
    this.B = B;
    this.el = document.createElement('canvas');
    this.el.className = 'fg-coal pix';
    this.el.width = B.W; this.el.height = B.H;
    this.ctx = this.el.getContext('2d');
    this.img = this.ctx.createImageData(B.W, B.H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.marks = new Uint32Array(B.W * B.H);
    this.lumpT = new Float32Array(B.seeds.length);
    this.row = new Uint32Array(B.W);
    this.parts = [];
    this.ptr = pointerSprite();
    this.rider = riderSprite();
    this.time = 0; this.maxT = 1500; this.list = []; this.target = null;
  }
  setMax(maxT) { this.maxT = maxT; this.drawMarks(); }
  setMarks(list) { this.list = list || []; this.target = this.list.find((m) => m.range) || null; this.drawMarks(); }
  /** Fine row (from the canvas top) of a temperature. */
  rowOf(T) { const c = CB.col, cy1 = (c.y1 + 1) * R - 1; return cy1 - clamp(T / this.maxT, 0, 1) * (this.B.HC - 1); }

  /** Chalk on the board (the band's bracket and hatching, the burn line in red chalk) and the painted swatches. */
  drawMarks() {
    const B = this.B, W = B.W, m = this.marks;
    m.fill(0);
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < B.H && !(B.u[y * W + x] >>> 24)) m[y * W + x] = pk(c); };
    const chalk = (x, y, kind, bright = true) => { const C = CHALK[kind] || CHALK.work; if (hsh(x, y, 31) < 0.18) return; put(x, y, bright && hsh(x, y, 32) > 0.3 ? C[0] : C[1]); };
    // the swatches: a column of painted dabs, each the colour of its heat, up the right edge
    const sx0 = 30 * R, c = CB.col, step = 6;
    for (let a = c.y1; a >= c.y0; a -= step) {
      const y0 = Math.max(c.y0, a - step + 2);
      const T = (c.y1 - (a + y0) / 2) / (c.y1 - c.y0) * this.maxT;
      const col = T > 480 ? glowHex(T) : 0x2e2830;
      for (let fy = y0 * R; fy < (a + 1) * R - 1; fy++) for (let fx = sx0; fx < sx0 + 3 * R; fx++) {
        if ((fx === sx0 || fx === sx0 + 3 * R - 1) && hsh(fx, fy, 33) < 0.4) continue; // the brush's ragged edge
        const lit = fx < sx0 + 2 && fy < y0 * R + 2 ? 0.35 : fx > sx0 + 3 * R - 2 || fy > (a + 1) * R - 3 ? -0.25 : 0;
        put(fx, fy, lit > 0 ? mixC(col, 0xffffff, lit) : mixC(col, 0x000000, -lit));
      }
    }
    // the marks (chalk on the board to the left of the basket; ticks on the right too)
    for (const mk of this.list) {
      if (mk.range) {
        const a = Math.round(this.rowOf(mk.range[1])), b = Math.round(this.rowOf(mk.range[0]));
        const tgt = mk === this.target;
        for (let fy = a; fy <= b; fy++) {
          chalk(6 * R, fy, mk.kind); chalk(6 * R + 1, fy, mk.kind, false);
          if (tgt) for (let fx = 1 * R; fx < 6 * R; fx++) if (((fx + fy) % 5) === 0) chalk(fx, fy, mk.kind, false); // hatching
          chalk(28 * R, fy, mk.kind, false);
        }
        for (const fy of [a, a + 1, b - 1, b]) {
          for (let fx = 3 * R; fx < 7 * R; fx++) chalk(fx, fy, mk.kind);
          for (let fx = 27 * R; fx < 29 * R + 1; fx++) chalk(fx, fy, mk.kind);
        }
      } else {
        const y = Math.round(this.rowOf(mk.at));
        for (let fx = 1 * R; fx < 7 * R; fx++) { chalk(fx, y, mk.kind); if (mk.kind === 'burn') chalk(fx, y + 1, mk.kind, false); }
        for (let fx = 27 * R; fx < 29 * R + 1; fx++) chalk(fx, y, mk.kind);
        if (mk.kind === 'burn') for (let k = -3; k <= 3; k++) { chalk(2 * R + 3 + k, y - 6 - k, mk.kind); chalk(2 * R + 3 + k, y - 6 + k, mk.kind); }
      }
    }
  }

  blit(spr, X, Y) {
    const B = this.B, W = B.W, buf = this.buf;
    for (let y = 0; y < spr.h; y++) {
      const fy = Y + y;
      if (fy < 0 || fy >= B.H) continue;
      for (let x = 0; x < spr.w; x++) { const c = spr.u[y * spr.w + x]; if (c >>> 24) { const fx = X + x; if (fx >= 0 && fx < W) buf[fy * W + fx] = c; } }
    }
  }

  /** Paint the bed at temperature T (the shown one), dt seconds since the last call. */
  render(T, dt = 1 / 60, dir = '') {
    const B = this.B, W = B.W, buf = this.buf, t = (this.time += dt);
    const c = CB.col, cy1 = (c.y1 + 1) * R - 1, cx0 = c.x0 * R, cx1 = (c.x1 + 1) * R - 1;
    // board + iron + chalk
    buf.set(B.u);
    const mk = this.marks;
    for (let i = 0; i < mk.length; i++) if (mk[i]) buf[i] = mk[i];
    // the fire's front (fine rows up from the bottom of the stack) and how incandescent it is
    const p = clamp(T / this.maxT, 0, 1), HC = B.HC, hF = p * HC;
    const L = clamp((T - 520) / 800, 0, 1);
    const lt = this.lumpT, sy = B.seedHy;
    for (let k = 0; k < lt.length; k++) {
      const s = B.seeds[k], y = sy[k];
      let Tl;
      if (y <= hF - 3) Tl = T * (1.05 - 0.1 * y / Math.max(1, hF));
      else if (y < hF + 7) Tl = 20 + (T * 0.95 - 20) * (hF + 7 - y) / 10;
      else Tl = 20;
      Tl *= 1 + 0.045 * Math.sin(t * s.w + s.ph) + 0.03 * Math.sin(t * (s.w * 2.7) + s.ph * 1.7);
      lt[k] = Tl;
    }
    const { idx, lump, shade, kind } = B;
    for (let n = 0; n < idx.length; n++) {
      const i = idx[n], l = lump[n], sh = shade[n], kd = kind[n], Tl = lt[l];
      const fx = i % W, fy = (i / W) | 0;
      // the lump's heat as a step on the ramp: faces shaded by their facet (the crust darker), the
      // cracks hotter and pulsing; capped so a white-hot bed still shows its lumps
      const base = Tl < T0 - 40 ? -9 : Math.min(NH - 2.6, heatIdx(Tl) + (Tl < T0 ? (Tl - T0) / 40 : 0));
      let f;
      if (kd) f = base + 1.6 + (Tl > 520 ? 1.2 * (0.5 + 0.5 * Math.sin(t * 3.2 + B.seeds[l].ph * 2 + (kd === 2 ? 1.5 : 0))) : 0);
      else f = base - 4.2 + sh * 4.4 + Math.min(1.2, base * 0.1);
      if (f < 0) {
        // cold coal: anthracite in the lamp light, a warm reflected glow when its neighbours burn
        let col = kd ? COALP[kd === 1 ? 0 : 1] : tone(COALP, sh * 0.82 + 0.06, fx, fy);
        if (!kd && sh > 0.86 && hsh(fx, fy, 41) > 0.82) col = COALP[8]; // a glint
        if (Tl > 380) { const g = clamp((Tl - 380) / 300, 0, 1); col = mixU(col, HEATC[kd ? 2 : 1], g * (kd ? 0.9 : 0.45)); }
        buf[i] = col;
        continue;
      }
      if (!kd && sh > 0.62 && Tl > 560 && Tl < 1150 && hsh(fx, fy, 43) < 0.045) { buf[i] = pk(ASH[(sh * 3.9) | 0]); continue; } // a fleck of white ash
      const fi = f | 0;
      buf[i] = HEAT[Math.min(NH - 1, fi + (f - fi > bay(fx, fy) ? 1 : 0))];
    }
    // the iron catches the glow: the rails' inner faces and the straps' undersides go warm
    if (T > 500) {
      for (let fy = c.y0 * R; fy <= cy1; fy++) {
        const y = cy1 - fy, Tl = y <= hF ? T * (1.05 - 0.1 * y / Math.max(1, hF)) : y < hF + 8 ? T * (hF + 8 - y) / 8 : 0;
        if (Tl < 520) continue;
        const g = clamp((Tl - 520) / 700, 0.15, 1), hc = HEATC[Math.min(NH - 1, Math.round(heatIdx(Tl)))];
        for (const fx of [CB.railL * R + 3, CB.railR * R]) { const j = fy * W + fx; buf[j] = mixU(buf[j], hc, 0.25 + g * 0.35); }
        for (const fx of [CB.railL * R + 2, CB.railR * R + 1]) { const j = fy * W + fx; buf[j] = mixU(buf[j], hc, 0.1 + g * 0.18); }
      }
      for (const s of CB.straps) {
        const fy = (s + 2) * R - 1, y = cy1 - fy;
        if (y > hF + 4) continue;
        const hc = HEATC[Math.min(NH - 1, Math.round(heatIdx(T)))];
        for (let fx = cx0; fx <= cx1; fx++) { const j = fy * W + fx; buf[j] = mixU(buf[j], hc, 0.5); buf[j - W] = mixU(buf[j - W], hc, 0.22); }
      }
    }
    // heat shimmer: the rows above the front waver sideways (the rails, the cold coal, the rim)
    if (L > 0.02) {
      const top = cy1 - hF, x0 = (CB.railL - 1) * R, x1 = (CB.railR + 3) * R, row = this.row;
      for (let fy = Math.max(0, Math.round(top - 34)); fy < Math.min(cy1, Math.round(top + 4)); fy++) {
        const fall = clamp(1 - Math.abs(fy - (top - 12)) / 22, 0, 1);
        const off = Math.round(Math.sin(t * 9 + fy * 0.5) * (0.6 + L * 1.6) * fall + Math.sin(t * 4.3 + fy * 0.21) * 0.6 * L * fall);
        if (!off) continue;
        const o = fy * W;
        for (let fx = x0; fx < x1; fx++) row[fx] = buf[o + fx];
        for (let fx = x0; fx < x1; fx++) { const sx = fx - off; buf[o + fx] = sx >= x0 && sx < x1 ? row[sx] : 0; }
      }
    }
    // sparks off the front (and a few embers through the grate into the pan)
    const front = cy1 - hF;
    if (L > 0.05 && Math.random() < dt * (4 + 34 * L * L)) this.parts.push({ x: cx0 + Math.random() * (cx1 - cx0), y: front + Math.random() * 4, vx: (Math.random() - 0.5) * 14, vy: -(30 + Math.random() * 50) * (0.6 + L), life: 0.5 + Math.random() * 0.9, t: 0, T: T + 120 });
    if (L > 0.1 && hF > HC * 0.08 && Math.random() < dt * 3 * L) this.parts.push({ x: cx0 + Math.random() * (cx1 - cx0), y: 104 * R, vx: (Math.random() - 0.5) * 8, vy: 10, g: 120, life: 0.7, t: 0, T: T });
    const dtp = Math.min(dt, 1 / 20);
    for (let n = this.parts.length - 1; n >= 0; n--) {
      const s = this.parts[n];
      s.t += dtp;
      if (s.t > s.life || s.y < 0) { this.parts.splice(n, 1); continue; }
      s.vy += (s.g || 0) * dtp; s.vx += Math.sin(t * 13 + n) * 30 * dtp; s.x += s.vx * dtp; s.y += s.vy * dtp;
      if (s.g && s.y > 110 * R) { s.y = 110 * R; s.vy = 0; s.vx = 0; }
      const a = s.t / s.life, f = heatIdx(s.T - a * 500), x = s.x | 0, y = s.y | 0;
      if (f <= 0 || x < 0 || x >= W) continue;
      const col = HEAT[Math.min(NH - 1, Math.round(f))];
      buf[y * W + x] = col;
      if (a < 0.3 && !s.g && y + 1 < B.H) buf[(y + 1) * W + x] = HEAT[Math.max(0, Math.round(f) - 3)];
    }
    // the brass rider at the exact heat, the brass pointer at the band (bobbing while you're off it)
    const ry = Math.round(this.rowOf(T));
    this.blit(this.rider, (CB.railR - 2) * R - 1, ry - (this.rider.h >> 1));
    if (this.target) {
      const tr = this.target.range, cy = Math.round((this.rowOf(tr[0]) + this.rowOf(tr[1])) / 2);
      const bob = dir === 'up' || dir === 'down' ? (Math.sin(t * 11) > 0 ? R : 0) : 0;
      this.blit(this.ptr, -1 + bob, cy - (this.ptr.h >> 1));
      if (dir === 'ok' && (t * 2.2) % 1 < 0.25) { const gx = 2 * R, gy = cy - 3; buf[gy * W + gx] = pk(0xffffff); buf[(gy + 1) * W + gx] = pk(0xfff0b0); buf[gy * W + gx + 1] = pk(0xfff0b0); }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}

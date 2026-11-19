// Pixel art for the stamina gauge (src/ui/Stamina.js), drawn at R fine pixels per art pixel (one
// art pixel = one --px on screen, like the rest of the HUD art):
//  - a stitched oxhide strap, a brass tube with a smoked-glass window riveted to it by three brass
//    clips (the quarter marks) and a capped, screwed right end
//  - on the left a knurled brass bezel holding a ruby heart (it beats when you're nearly out)
// The tube's window (GEO.ch) stays empty here: the stamina, the hunger and the injury are painted
// into it every frame. Light from the top left, tinted outlines, glints.
import { RAMP, INK, h2, vnoise, pebble, dtone, mixC, THREAD, THREAD_DK } from './hudArt.js';

export const R = 2;
/** Layout in art pixels. ch: the glass window (x0..x1, y0..y1 inclusive). */
export const GEO = { W: 92, H: 18, ch: { x0: 17, x1: 85, y0: 6, y1: 11 }, heart: { cx: 9, cy: 9 } };

// colours as 0xRRGGBB; the canvas buffer wants 0xAABBGGRR
export const pk = (c, a = 255) => ((a << 24) | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;

/** A fine-pixel raster over a Uint32Array (canvas byte order). */
export class Raster {
  constructor(w, h) { this.w = w; this.h = h; this.u = new Uint32Array(w * h); }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (a >= 255 || !(this.u[i] >>> 24)) { this.u[i] = pk(c, a); return; }
    const o = this.u[i], t = a / 255;
    const r = (o & 255) * (1 - t) + ((c >> 16) & 255) * t, g = ((o >> 8) & 255) * (1 - t) + ((c >> 8) & 255) * t, b = ((o >> 16) & 255) * (1 - t) + (c & 255) * t;
    this.u[i] = ((Math.max(o >>> 24, a) << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
  }
  a(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.u[y * this.w + x] >>> 24; }
  /** Art pixel → an R×R block. */
  A(x, y, c, a) { for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) this.set(x * R + i, y * R + j, c, a); }
  /** 1 fine px outline round what's drawn (inside the box). */
  outline(c, x0 = 0, y0 = 0, x1 = this.w - 1, y1 = this.h - 1) {
    const add = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (this.a(x, y) > 40) continue;
      if (this.a(x - 1, y) > 40 || this.a(x + 1, y) > 40 || this.a(x, y - 1) > 40 || this.a(x, y + 1) > 40) add.push(x, y);
    }
    for (let k = 0; k < add.length; k += 2) this.set(add[k], add[k + 1], c);
  }
}

const B = RAMP.brass, LE = RAMP.leather;
/** Blackened bronze (the tube's rails: dark, so the honey light in the glass shines). */
const BZ = [0x120a08, 0x1e140e, 0x2c1e14, 0x3e2a1a, 0x523822, 0x6a4a2c, 0x866038, 0xa87c4a];
const OX = [0x12040a, 0x200810, 0x320c14, 0x46121a];
const RUBY = [0x2a0408, 0x4e0810, 0x7a0e16, 0xa8161e, 0xd42a26, 0xf05a3e, 0xff9670, 0xffd8c0];
const RUBY_HOT = [0x4a0a0a, 0x7a1010, 0xa81a16, 0xd8301e, 0xff5a2e, 0xff8a4a, 0xffc080, 0xfff0d8];

/** The ruby heart's mask at a scale (fine px around the bezel centre); true inside. */
function heartMask(s) {
  const { cx, cy } = GEO.heart, X = cx * R, Y = cy * R;
  // two lobes and a point, built so the notch between the lobes survives at a dozen pixels
  return (fx, fy) => {
    const u = (fx + 0.5 - X) / s, v = (Y - (fy + 0.5)) / s + 0.12;
    if ((u + 0.5) ** 2 + (v - 0.38) ** 2 < 0.29 || (u - 0.5) ** 2 + (v - 0.38) ** 2 < 0.29) return true;
    return v <= 0.42 && v >= -1.05 && Math.abs(u) <= 1.02 * (v + 1.05) / 1.47;
  };
}

/** The bezel + heart into r (beat: swollen, hot). */
function drawMedal(r, beat = false) {
  const { cx, cy } = GEO.heart, X = cx * R, Y = cy * R;
  const ro = 8.9 * R;
  // knurled brass bezel: 10 teeth round the rim, a rolled lip, a sunken velvet bed
  for (let fy = 0; fy < 18 * R + 2; fy++) for (let fx = 0; fx < 18 * R + 2; fx++) {
    const dx = fx + 0.5 - X, dy = fy + 0.5 - Y, d = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    const tooth = Math.cos(th * 10) > 0.35 ? 0.9 : 0;
    if (d > ro - 1.2 + tooth) continue;
    const rin = 6.1 * R;
    if (d >= rin) {
      // the ring as a rolled tube: its normal leans out from the middle of the ring
      const m = (d - (rin + ro) / 2) / ((ro - rin) / 2), nx = (dx / d) * m, ny = (dy / d) * m, nz = Math.sqrt(Math.max(0, 1 - m * m));
      let k = 0.35 + 0.6 * Math.max(0, -0.55 * nx - 0.62 * ny + 0.55 * nz) + (tooth && d > ro - 1.6 ? -0.12 : 0) + (h2(fx, fy, 31) - 0.5) * 0.08;
      if (d > ro - 1.7 + tooth) k -= 0.25;
      r.set(fx, fy, dtone(B, k, fx, fy));
    } else {
      // velvet bed, sunk: its top-left wall in shadow, the bottom-right catching light
      const e = rin - d, w = e < 1.5 ? (dx + dy > 0 ? 0.6 : -0.4) : 0;
      const k = 0.35 + w * 0.5 + (vnoise(fx / 2, fy / 2, 7) - 0.5) * 0.3;
      r.set(fx, fy, dtone(OX, k, fx, fy));
    }
  }
  r.outline(INK, 0, 0, 18 * R + 2, 18 * R + 2);
  // rivets at the four diagonals (a lit dome, a dark foot)
  for (const a of [-2.36, -0.79, 0.79, 2.36]) {
    const px = Math.round(X + Math.cos(a) * 7.4 * R - 1), py = Math.round(Y + Math.sin(a) * 7.4 * R - 1);
    r.set(px, py, B[8]); r.set(px + 1, py, B[6]); r.set(px, py + 1, B[5]); r.set(px + 1, py + 1, B[2]);
  }
  // the heart: a cut ruby, lit top left, a facet line, a glint, a dark rim
  const s = (beat ? 6.3 : 5.7) * R / 2, inH = heartMask(s), P = beat ? RUBY_HOT : RUBY;
  const glowR = beat ? 7.6 * R : 0;
  for (let fy = 2; fy < 18 * R; fy++) for (let fx = 2; fx < 18 * R; fx++) {
    const dx = fx + 0.5 - X, dy = fy + 0.5 - Y;
    if (!inH(fx, fy)) {
      // a red glow in the bed round the beating heart
      if (glowR && Math.hypot(dx, dy) < 6 * R && (fx + fy) % 2 === 0) r.set(fx, fy, 0xff3a1a, 70);
      continue;
    }
    const edge = !inH(fx - 1, fy) || !inH(fx + 1, fy) || !inH(fx, fy - 1) || !inH(fx, fy + 1);
    if (edge) { r.set(fx, fy, P[0]); continue; }
    let k = 0.62 - (dx + dy) / (s * 3.2) + (dx - dy > 0 && Math.abs(dx + dy * 0.2) < 1 ? -0.12 : 0);
    if (!inH(fx - 2, fy) || !inH(fx, fy - 2)) k += 0.18; // the lit rim
    if (!inH(fx + 2, fy) || !inH(fx, fy + 2)) k -= 0.2;
    r.set(fx, fy, dtone(P, k, fx, fy));
  }
  // glints on the left lobe
  const gx = Math.round(X - s * 0.62), gy = Math.round(Y - s * 0.55);
  r.set(gx, gy, 0xffffff); r.set(gx + 1, gy, P[7]); r.set(gx, gy + 1, P[7]); r.set(gx + 3, gy - 1, P[6], 200);
}

let layers = null;
/** The static layers, made once: { base, beat } as Uint32Arrays of FW × FH fine pixels. */
export function gaugeLayers() {
  if (layers) return layers;
  const W = GEO.W * R, H = GEO.H * R, c = GEO.ch;
  const r = new Raster(W, H);
  // ---- the strap: pebbled oxhide with a burnished top edge, a darker bottom, running stitches
  for (let y = 1; y <= 16; y++) for (let x = 9; x <= 91; x++) {
    if (x === 91 && (y <= 2 || y >= 15)) continue; // rounded end
    if (x === 90 && (y === 1 || y === 16)) continue;
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const fx = x * R + i, fy = y * R + j;
      let k = 0.55 + pebble(fx, fy, 41, 2.2) * 0.35 + (y === 1 ? 0.25 : y === 2 ? 0.1 : y >= 15 ? -0.2 : 0);
      k += (vnoise(fx / 9, fy / 5, 43) - 0.5) * 0.18; // the hide's broad mottling
      r.set(fx, fy, dtone(LE, k, fx, fy));
    }
  }
  for (const y of [2.5, 15]) for (let fx = 18 * R; fx < 85 * R; fx++) {
    const k = fx % 6;
    const fy = Math.round(y * R);
    if (k < 3) r.set(fx, fy, k === 0 ? mixC(THREAD, 0xffffff, 0.3) : THREAD);
    else if (k === 3) r.set(fx, fy, THREAD_DK);
  }
  r.outline(INK);
  // ---- the brass tube round the window: rolled rails above and below, a soft shine along them
  for (let y = 4; y <= 13; y++) for (let x = 15; x <= 86; x++) {
    if (y >= c.y0 && y <= c.y1 && x >= c.x0 && x <= c.x1) continue;
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const fx = x * R + i, fy = y * R + j;
      const top = y < c.y0, row = top ? fy - 4 * R : 13 * R + R - 1 - fy; // 0 at the outer edge
      let k = top ? [0.3, 0.92, 0.7, 0.5][Math.min(3, row)] : [0.1, 0.3, 0.42, 0.36][Math.min(3, row)];
      if (x < c.x0 || x > c.x1) k = 0.3 + (x > c.x1 ? -0.1 : 0.15) + (fy < (c.y0 + 2) * R ? 0.25 : 0);
      k += (h2(fx >> 1, fy, 47) - 0.5) * 0.12 + (h2(fx >> 2, 0, 48) < 0.1 ? -0.15 : 0); // hammer-dark, pitted
      r.set(fx, fy, dtone(BZ, k, fx, fy));
    }
  }
  // the window's inner lip: a dark groove the glass sits in
  for (let fx = c.x0 * R - 1; fx <= (c.x1 + 1) * R; fx++) { r.set(fx, c.y0 * R - 1, BZ[0]); r.set(fx, (c.y1 + 1) * R, BZ[5]); }
  for (let fy = c.y0 * R - 1; fy <= (c.y1 + 1) * R; fy++) { r.set(c.x0 * R - 1, fy, BZ[0]); r.set((c.x1 + 1) * R, fy, BZ[4]); }
  // ---- smoked glass, empty: near black, a dull amber film at the bottom, faint swirls
  for (let fy = c.y0 * R; fy < (c.y1 + 1) * R; fy++) for (let fx = c.x0 * R; fx < (c.x1 + 1) * R; fx++) {
    const j = fy - c.y0 * R;
    let k = 0.35 + (j < 2 ? -0.25 : 0) + (j >= (c.y1 - c.y0 + 1) * R - 2 ? 0.18 : 0) + (vnoise(fx / 7, fy / 3, 53) - 0.5) * 0.25;
    r.set(fx, fy, dtone(EMPTY, k, fx, fy));
  }
  // ---- three brass clips at the quarters (rivet on each), the right end cap with its screw
  for (const q of [0.25, 0.5, 0.75]) {
    const x = Math.round(c.x0 + (c.x1 + 1 - c.x0) * q) - 1;
    for (const [y0, y1] of [[3, 5], [12, 14]]) {
      for (let y = y0; y <= y1; y++) for (let i = 0; i < 3; i++) {
        const k = (i === 0 ? 0.8 : i === 1 ? 0.6 : 0.3) + (y === y0 ? 0.1 : y === y1 ? -0.15 : 0);
        r.A(x + i, y, dtone(B, k, x + i, y));
      }
      r.set((x + 1) * R, (y0 + 1) * R, B[8]); r.set((x + 1) * R + 1, (y0 + 1) * R, B[6]);
      r.set((x + 1) * R, (y0 + 1) * R + 1, B[5]); r.set((x + 1) * R + 1, (y0 + 1) * R + 1, B[2]);
      for (let fy = y0 * R; fy < (y1 + 1) * R; fy++) { r.set(x * R - 1, fy, INK); r.set((x + 3) * R, fy, INK); }
      r.set(x * R, (y0 === 3 ? y0 : y1 + 1) * R - (y0 === 3 ? 1 : 0), INK);
    }
    for (let i = -1; i <= 3 * R; i++) { r.set(x * R + i, 3 * R - 1, INK); r.set(x * R + i, 15 * R, INK); }
  }
  for (let y = 3; y <= 14; y++) for (let x = 86; x <= 90; x++) {
    if (x === 90 && (y === 3 || y === 14)) continue;
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const fx = x * R + i, fy = y * R + j, u = (fx - 86 * R) / (5 * R), v = (fy - 3 * R) / (12 * R);
      const k = 0.85 - u * 0.55 - v * 0.35 + (x === 86 ? -0.25 : 0) + (h2(fx, fy >> 1, 59) - 0.5) * 0.08;
      r.set(fx, fy, dtone(B, k, fx, fy));
    }
  }
  for (let fy = 3 * R; fy < 15 * R; fy++) r.set(86 * R, fy, B[1]); // the seam
  // slotted screw (sunk), and the cap's outline
  { const sx = 87 * R + 1, sy = 7 * R; for (let j = -1; j <= 3; j++) for (let i = -1; i <= 3; i++) r.set(sx + i, sy + j, (i + j) > 2 ? B[6] : B[1]); for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) r.set(sx + i, sy + j, [B[7], B[6], B[4]][Math.min(2, (i + j) >> 1)]); r.set(sx, sy + 2, B[0]); r.set(sx + 1, sy + 1, B[0]); r.set(sx + 2, sy, B[0]); }
  for (let fy = 3 * R - 1; fy <= 15 * R; fy++) r.set(91 * R, fy, INK);
  for (let fx = 86 * R; fx < 91 * R; fx++) { r.set(fx, 3 * R - 1, INK); r.set(fx, 15 * R, INK); }
  for (let fx = 15 * R; fx < 86 * R; fx++) { r.set(fx, 4 * R - 1, INK); r.set(fx, 14 * R, INK); } // the tube's outline on the strap
  // ---- the bezel and the heart (over the strap's end)
  const base = new Raster(W, H); base.u.set(r.u);
  drawMedal(base, false);
  const beat = new Raster(W, H);
  drawMedal(beat, true);
  layers = { W, H, base: base.u, beat: beat.u };
  return layers;
}

/** The glass when empty (darkest first). */
const EMPTY = [0x0a0606, 0x140c0a, 0x1e140e, 0x2a1c12, 0x3a2814, 0x4e3616];

/** Fill ramps (darkest first): stamina (honey-gold, glowing), low stamina (ember red), hunger (biscuit), injury (cloth red). */
export const RAMPS = {
  stam: [0x5a1e08, 0x8a3610, 0xb85a18, 0xe08424, 0xf6a832, 0xffcc4e, 0xffe68a, 0xfff8d0],
  low: [0x3a0806, 0x6a1008, 0x9a2010, 0xc83a18, 0xe85a20, 0xff8a3a, 0xffb870, 0xffe0b0],
  hunger: [0x4a2408, 0x7a4212, 0xa8641e, 0xc8862c, 0xdca444, 0xeec06a, 0xf8dc9c],
  injury: [0x2a0406, 0x4e0a0e, 0x761218, 0x9c1c22, 0xc0302e, 0xdc5040, 0xf27a62, 0xffb0a0],
  thread: [0x8a7454, 0xc8b490, 0xf4e6c8],
};

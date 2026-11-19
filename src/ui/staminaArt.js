// Pixel art for the stamina gauge (src/ui/Stamina.js), drawn at R fine pixels per art pixel (one
// art pixel = one --px on screen, like the rest of the HUD art):
//  - a stitched oxhide strap, a brass tube with a smoked-glass window riveted to it by three brass
//    clips (the quarter marks) and a capped, screwed right end: the lamp's oil reservoir
//  - on the left a little brass oil lamp (wave 18; it replaced the ruby heart): a hammered font, a
//    knurled collar, a pierced burner gallery and a tulip glass chimney whose flame (drawn per frame
//    in Stamina.js) burns tall when rested, gutters when nearly out and flares with the heartbeat
// The tube's window (GEO.ch) stays empty here: the stamina, the hunger and the injury are painted
// into it every frame. Light from the top left, tinted outlines, glints.
import { RAMP, INK, h2, vnoise, pebble, dtone, mixC, THREAD, THREAD_DK } from './hudArt.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const R = 2;
/** Layout in art pixels. ch: the glass window (x0..x1, y0..y1 inclusive). */
const G0 = { W: 92, H: 18, ch: { x0: 17, x1: 85, y0: 6, y1: 11 } };
/** Rows of headroom above the strap for the lamp's chimney and flame. */
export const OY = 10;
export const GEO = { W: 92, H: 18 + OY, ch: { x0: 17, x1: 85, y0: 6 + OY, y1: 11 + OY }, lamp: { cx: 9, wick: 12, chim: { y0: 1, y1: 12 } } };

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
let layers = null;
/** The static layer, made once: { W, H, base } (a Uint32Array of W × H fine pixels). */
export function gaugeLayers() {
  if (layers) return layers;
  const W = G0.W * R, H = G0.H * R, c = G0.ch;
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
  // ---- shift it all down under the headroom, then the lamp over the strap's end
  const FH = GEO.H * R, base = new Raster(W, FH);
  base.u.set(r.u, OY * R * W);
  drawLamp(base);
  layers = { W, H: FH, base: base.u };
  return layers;
}

const GLASS = [0x2a3a40, 0x4a6670, 0x86aab0, 0xd8f0f0];
/**
 * The lamp (over the strap's left end): a squat hammered brass font with an engraved belt, a
 * knurled collar, the wick-turner's knob, a pierced burner gallery and a tulip glass chimney with a
 * brass crown. The chimney's inside stays clear (the flame and its glow are painted per frame).
 */
function drawLamp(r) {
  const cx = GEO.lamp.cx * R;
  // the font: a squat onion of brass, lit from the top left like a ball, hammer dimples
  const fy0 = (OY + 5) * R, fy1 = (OY + 16) * R, fcy = (OY + 10.8) * R, rx = 7.8 * R, ry = 5.6 * R;
  const q = (k) => Math.round(clamp(k, 0, 1) * (B.length - 1)) / (B.length - 1); // flat planes, no dither
  for (let fy = fy0; fy < fy1; fy++) for (let fx = 0; fx < 19 * R; fx++) {
    const u = (fx + 0.5 - cx) / rx, v = (fy + 0.5 - fcy) / ry;
    const d = Math.pow(Math.abs(u), 2.6) + Math.pow(Math.abs(v), 2.2);
    if (d > 1) continue;
    const nz = Math.sqrt(Math.max(0, 1 - u * u * 0.8 - v * v * 0.8));
    let k = 0.12 + 0.82 * Math.max(0, -0.55 * u - 0.62 * v + 0.56 * nz);
    // hammer facets: each little cell leans its own way
    const cxh = fx >> 2, cyh = fy >> 2;
    k += (h2(cxh, cyh, 61) - 0.5) * 0.16;
    if (Math.abs(fy + 0.5 - (fcy + 1.6 * R)) < 1) k = 0.1; // the engraved belt
    else if (Math.abs(fy + 0.5 - (fcy + 1.6 * R + 1.5)) < 0.6) k += 0.18; // its lit lower lip
    if (u > 0.55 && v > -0.2 && v < 0.5) k += 0.12 * (u - 0.55) * 4; // a warm rim light on the right (the oil's glow)
    r.set(fx, fy, dtone(B, q(k), fx, fy));
  }
  // its foot ring
  for (let fy = fy1 - R; fy < fy1 + R; fy++) for (let fx = cx - 6 * R; fx < cx + 6 * R; fx++) r.set(fx, fy, dtone(B, q(fy < fy1 ? 0.5 : 0.25) - (fx > cx + 3 * R ? 0.12 : 0), fx, fy));
  // the knurled collar on its shoulder, the burner gallery (pierced crown) above it
  for (let fy = (OY + 3) * R; fy < (OY + 5) * R + 1; fy++) for (let fx = cx - 5 * R; fx < cx + 5 * R; fx++) {
    const tooth = ((fx >> 1) & 1) === 0;
    const k = (fy < (OY + 4) * R ? 0.75 : 0.45) + (tooth ? 0.12 : -0.12) - (fx > cx + 2 * R ? 0.2 : 0);
    r.set(fx, fy, dtone(B, k, fx, fy));
  }
  for (let fy = (GEO.lamp.chim.y1) * R; fy < (OY + 3) * R; fy++) for (let fx = cx - 4 * R; fx < cx + 4 * R; fx++) {
    const hole = (fy === GEO.lamp.chim.y1 * R + 2 || fy === GEO.lamp.chim.y1 * R + 3) && ((fx - cx + 16) % 4) < 2;
    r.set(fx, fy, hole ? B[1] : dtone(B, 0.62 - (fx - cx) / (8 * R) * 0.5, fx, fy));
  }
  // the wick-turner's knob (right of the collar)
  for (let fy = (OY + 3) * R; fy < (OY + 5) * R; fy++) for (let fx = cx + 5 * R; fx < cx + 7 * R; fx++) r.set(fx, fy, dtone(B, fy < (OY + 4) * R ? 0.7 : 0.35, fx, fy));
  r.set(cx + 5 * R + 1, (OY + 3) * R, B[8]);
  // the tulip chimney: thin glass walls (a bright streak down the left, tinted right), a crown
  const ch = GEO.lamp.chim, top = ch.y0 * R, bot = ch.y1 * R;
  for (let fy = top; fy < bot; fy++) {
    const v = (fy - top) / (bot - top);
    const half = (2.4 + 2.6 * Math.sin(Math.min(1, v * 1.25) * Math.PI * 0.86) + (v > 0.85 ? -0.6 : 0)) * R;
    const xl = Math.round(cx - half), xr = Math.round(cx + half) - 1;
    for (let fx = xl + 2; fx < xr - 1; fx++) r.set(fx, fy, 0xa8d0d8, 34); // the glass's faint tint
    r.set(xl - 1, fy, INK, 150); r.set(xr + 1, fy, INK, 200);
    r.set(xl, fy, GLASS[3], v > 0.15 && v < 0.75 ? 230 : 150); r.set(xl + 1, fy, GLASS[2], 90);
    r.set(xr, fy, GLASS[1], 200); r.set(xr - 1, fy, GLASS[2], 60);
  }
  for (let fx = cx - 3 * R; fx < cx + 3 * R; fx++) for (let fy = top - R; fy < top + 1; fy++) r.set(fx, fy, dtone(B, fy < top ? 0.8 : 0.4, fx, fy)); // the crown
  for (let fx = cx - 3 * R - 1; fx <= cx + 3 * R; fx++) r.set(fx, top - R - 1, INK);
  r.set(cx - 3 * R - 1, top - R, INK); r.set(cx + 3 * R, top - R, INK); r.set(cx - 3 * R - 1, top, INK); r.set(cx + 3 * R, top, INK);
  r.outline(INK, 0, (OY + 2) * R, 19 * R + 2, GEO.H * R - 1);
  // rivets on the font's shoulder, a glint on its belly
  for (const dx of [-5, 4]) { const x = cx + dx * R, y = (OY + 7) * R; r.set(x, y, B[8]); r.set(x + 1, y, B[6]); r.set(x, y + 1, B[5]); r.set(x + 1, y + 1, B[2]); }
  r.set(cx - 4 * R, (OY + 9) * R, 0xffffff); r.set(cx - 4 * R + 1, (OY + 9) * R, B[7]); r.set(cx - 4 * R, (OY + 9) * R + 1, B[7]);
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

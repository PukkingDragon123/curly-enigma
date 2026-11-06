// High-detail pixel art for the corner HUD, drawn pixel by pixel at one art pixel = one --px:
//   pouch(open, S)  the coin pouch: tan suede, gathered neck with pleats, a twisted cord with beaded
//                   ends, a stitched patch with a brass coin (open: coins in the mouth)
//   goldTag         9-slice (3 3 3 8, 13 rows) paper label: fibres, deckled bottom, brass grommet, twine
//   ironTag         9-slice (2 4) riveted iron plaque (the lantern's energy readout)
//   brassPlate      9-slice (2 4) brushed brass plate with an engraved line (the radar's tag)
//   plaque          9-slice (5) dark walnut plaque with brass corner pins (depth & zone label)
//   paperTag / paperTagRed  9-slice (3) shop-style paper tags (the backpack's count / FULL)
//   gauge           the load gauge's brass tube (8×30)
//   twineV / chainV vertical tiles for the strings and chains things hang from
//   strip           9-slice (8) objective scroll: fibrous paper, deckled edges, curled rolled ends
//   wax             the scroll's wax seal with two silk ribbon tails
//   waxSmall        a 10×10 wax seal (the strip's stand-in portrait)
// installHudArt(node) publishes them as --h-* custom properties. Helpers (noise, tone ramps,
// rivets, screws, stitches) are shared with uiSprites.js and deepArt.js.
import { Px, art } from './uiArt.js';
import * as CA from './craftArt.js';

// ---------------------------------------------------------------- helpers
export const h2 = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise; P > 0 makes it tile with period P (in noise cells). */
export function vnoise(x, y, s = 0, P = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = (i) => (P > 0 ? ((i % P) + P) % P : i);
  const g = (i, j) => h2(w(i), w(j), s);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (g(xi, yi) * (1 - u) + g(xi + 1, yi) * u) * (1 - v) + (g(xi, yi + 1) * (1 - u) + g(xi + 1, yi + 1) * u) * v;
}
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const hex = (r, g, b) => (Math.max(0, Math.min(255, r | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, b | 0));
export const shadeC = (c, k) => { const [r, g, b] = rgb(c); return hex(r * k, g * k, b * k); };
export const mixC = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
/** A brightness 0..1 → one of a ramp's tones (pixel art reads better in steps). */
export const tone = (pal, k) => pal[Math.max(0, Math.min(pal.length - 1, Math.round(k * (pal.length - 1))))];
/** Ordered-dither a brightness onto a ramp (soft gradients without banding). */
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dtone = (pal, k, x, y) => {
  const f = Math.max(0, Math.min(1, k)) * (pal.length - 1);
  const i = Math.floor(f), t = f - i;
  return pal[Math.min(pal.length - 1, i + (t > (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0))];
};

/** Tone ramps, darkest first. */
export const RAMP = {
  brass: [0x241404, 0x3e260a, 0x5e3e12, 0x86601c, 0xb08028, 0xd4a23a, 0xecc45a, 0xf8e08e, 0xfff6cc],
  iron: [0x0e0d10, 0x1a191e, 0x28272e, 0x3a3842, 0x4e4c58, 0x66646f, 0x828090, 0xa8a6b4],
  tan: [0x2e1608, 0x46240e, 0x5e3416, 0x7a4620, 0x965a2a, 0xae6e36, 0xc48446, 0xd89c5a, 0xeab874],
  leather: [0x22120a, 0x341c0e, 0x482814, 0x5c341a, 0x704222, 0x86522c, 0x9c6438, 0xb47a48, 0xc89462],
  paper: [0x6e4a2a, 0x9a7446, 0xbc9a64, 0xd4b47e, 0xe2c896, 0xecd8aa, 0xf4e6c0, 0xfcf3dc],
  ox: [0x1c0806, 0x34100a, 0x4c1a10, 0x642418, 0x7c3020, 0x96402c, 0xb05a40, 0xc8785a],
  walnut: [0x140a04, 0x22120a, 0x301a0e, 0x402414, 0x52301a, 0x643c22, 0x784a2c, 0x8e5c38],
  wax: [0x2a0604, 0x4a0c08, 0x6e140e, 0x921e14, 0xb42c1e, 0xd0442c, 0xe86848, 0xffa080],
  moss: [0x0e1a0c, 0x18281a, 0x223822, 0x2e4a2a, 0x3c6236, 0x4c7a42, 0x62924e, 0x80ac64],
  gold: [0x3a2008, 0x6a420e, 0x9a6a16, 0xc8901e, 0xe8b232, 0xf8d050, 0xffe88a, 0xfff8d0],
  steel: [0x16181c, 0x262a30, 0x3a4048, 0x525a64, 0x6e7884, 0x8e98a4, 0xb4bcc6, 0xdee4ea],
  twine: [0x4a3018, 0x6e4c28, 0x94703e, 0xb8955e, 0xd8bb88, 0xeed8a8],
};
export const INK = 0x1a0e08;
export const THREAD = 0xead6a4, THREAD_DK = 0x3a2010;

/** Light from the top left, a little in front. */
const LX = -0.5, LY = -0.62, LZ = 0.6, LN = Math.hypot(LX, LY, LZ);
export const lambert = (nx, ny, nz) => Math.max(0, (nx * LX + ny * LY + nz * LZ) / LN);
/** Brightness of a dome at (u, v) in -1..1 (outside → -1). */
export const dome = (u, v, flat = 1) => {
  const r2 = u * u + v * v;
  if (r2 > 1) return -1;
  const nz = Math.sqrt(1 - r2) * flat;
  const n = Math.hypot(u, v, nz) || 1;
  return lambert(u / n, v / n, nz / n);
};

/** How much a pixel of a silhouette sits on its lit (top-left, +) or shaded (bottom-right, −) rim. */
export function rimLight(m, x, y, n = 2) {
  let l = 0, d = 0;
  for (let k = 1; k <= n; k++) {
    const w = (n - k + 1) / n;
    if (m.a(x - k, y) < 40 || m.a(x, y - k) < 40) l = Math.max(l, w);
    if (m.a(x + k, y) < 40 || m.a(x, y + k) < 40) d = Math.max(d, w);
  }
  return l - d;
}

/** Pebbled grain (≈ −0.5..0.5). */
export const pebble = (x, y, s = 0, sc = 1.7) => (vnoise(x / sc, y / sc, s) - 0.5) * 0.9 + (h2(x, y, s + 3) - 0.5) * 0.3;

/** Running stitches along a segment: thread dashes, a dark needle hole after each. */
export function stitch(p, x0, y0, x1, y1, on = 2, off = 1, c = THREAD, hole = THREAD_DK, phase = 0) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let t = 0; t <= n; t++) {
    const x = Math.round(x0 + (x1 - x0) * t / Math.max(1, n)), y = Math.round(y0 + (y1 - y0) * t / Math.max(1, n));
    const k = (t + phase) % (on + off);
    if (k < on) p.set(x, y, k === 0 ? mixC(c, 0xffffff, 0.35) : c);
    else if (hole !== null && k === on) p.set(x, y, hole);
  }
}

/** A domed rivet head, 2×2 (small) or 3×3, with a countersink shadow. */
export function rivet(p, x, y, big = false, pal = RAMP.brass) {
  if (!big) {
    p.set(x, y, pal[8]); p.set(x + 1, y, pal[5]);
    p.set(x, y + 1, pal[5]); p.set(x + 1, y + 1, pal[2]);
    return;
  }
  p.set(x, y, pal[4]); p.set(x + 1, y, pal[7]); p.set(x + 2, y, pal[4]);
  p.set(x, y + 1, pal[7]); p.set(x + 1, y + 1, pal[8]); p.set(x + 2, y + 1, pal[3]);
  p.set(x, y + 2, pal[3]); p.set(x + 1, y + 2, pal[3]); p.set(x + 2, y + 2, pal[1]);
}

/** A slotted screw head (3×3, top-left at x, y) sunk in a countersink. dir: 0 —, 1 |, 2 ╲, 3 ╱. */
export function screw(p, x, y, dir = 0, pal = RAMP.brass) {
  // the countersink: a dark ring, its lower-right wall catching the light
  for (let i = 0; i < 3; i++) {
    p.set(x + i, y - 1, pal[1]); p.set(x - 1, y + i, pal[1]);
    p.set(x + i, y + 3, pal[6]); p.set(x + 3, y + i, pal[5]);
  }
  const c = [[pal[6], pal[8], pal[6]], [pal[8], pal[7], pal[5]], [pal[5], pal[4], pal[3]]];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) p.set(x + i, y + j, c[j][i]);
  const slot = [[[0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2]], [[0, 0], [1, 1], [2, 2]], [[2, 0], [1, 1], [0, 2]]][dir & 3];
  for (const [i, j] of slot) p.set(x + i, y + j, pal[0]);
}

/** Fibrous paper brightness at (x, y): tiles with period (W, H) when given. */
export function paperK(x, y, s = 1, W = 0, H = 0) {
  const wx = W ? ((x % W) + W) % W : x, wy = H ? ((y % H) + H) % H : y;
  const nx = W ? W / 6 : 0, ny = H ? H / 6 : 0;
  let k = 0.66 + (vnoise(wx / 6, wy / 6, s, nx || 0) - 0.5) * 0.16;
  // fibres: short strokes, mostly lying along the sheet
  const f = vnoise(wx / 3.2, wy / 1.1, s + 5, 0);
  if (f > 0.74) k += 0.08;
  else if (f < 0.2) k -= 0.07;
  const sp = h2(wx, wy, s + 9);
  if (sp > 0.985) k -= 0.14; // a fleck of bark
  else if (sp < 0.03) k += 0.1;
  return k;
}

// ---------------------------------------------------------------- the coin pouch
/** Tan suede drawstring pouch, S×S (26 in the HUD, 22 in the backpack & shops). */
export function pouchArt(open = false, S = 26) {
  const f = S / 26, T = RAMP.tan, G = RAMP.gold, C = RAMP.twine;
  const p = new Px(S, S);
  const U = (x) => (x + 0.5) / f; // pixel → reference (26) coordinates
  const R = (v) => Math.round(v * f - 0.5);
  const cx = 13, cy = 17.6, rx = 10, ry = 7.5;
  const cordT = 10.1, cordB = 11.9;
  const top = (u) => 4.3 + (0.5 - 0.5 * Math.cos((u - cx) * 1.75 + 1.4)) * 1.15 - (open ? 1.0 : 0);
  const halfW = (v) => (v < cordT ? 4.3 + (cordT - v) * 0.66 : 4.6);
  const inBody = (u, v) => v > cordB - 0.4 && ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 <= 1;
  const inRuffle = (u, v) => v >= top(u) && v <= cordB && Math.abs(u - cx) <= halfW(v);
  // the open mouth: a dark hole with coins in it, behind the ruffle's front lip
  if (open) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (((U(x) - cx) / 7.2) ** 2 + ((U(y) - 4.2) / 2.0) ** 2 <= 1) p.set(x, y, T[0]);
    }
    for (const [ux, uy, r, s] of [[9.4, 3.0, 2.4, 1], [15.0, 2.2, 2.5, 2], [12.2, 3.9, 2.2, 3], [17.4, 3.8, 1.9, 4]]) {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const du = (U(x) - ux) / r, dv = (U(y) - uy) / (r * 0.8);
        const k = dome(du, dv, 0.7);
        if (k < 0) continue;
        p.set(x, y, du * du + dv * dv > 0.6 ? tone(G, 0.2 + k * 0.5) : tone(G, 0.4 + k * 0.6 + (h2(x, y, s) - 0.5) * 0.1));
      }
    }
    p.set(R(9), R(2.2), 0xffffff); p.set(R(14.6), R(1.4), 0xfffbe0);
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = U(x), v = U(y);
    const ruffle = inRuffle(u, v), body = inBody(u, v);
    if (!ruffle && !body) continue;
    let k;
    if (ruffle && v < cordB) {
      // gathered suede: pleats lit on their left flanks, the cone lit from the left
      const pl = Math.sin((u - cx) * 2.4 + 0.4);
      k = 0.56 + pl * 0.17 - (u - cx) / 7 * 0.16;
      const dt = v - top(u);
      if (dt < 0.9) k = 0.84 + pl * 0.06; // the turned lip
      else if (dt < 1.9) k -= 0.12; // its shadow
      if (v > cordT - 1.1) k -= 0.1; // squeezed under the cord
    } else {
      const nu = (u - cx) / rx, nv = (v - cy) / ry;
      const lit = dome(nu, nv, 0.85);
      k = 0.1 + lit * 0.84 + (lit > 0.97 ? 0.12 : 0);
      // the pleats fan out from the neck and die away down the belly
      const fan = Math.max(0, 1 - (v - cordB) / 4.5);
      k += Math.sin(Math.atan2(u - cx, v - 8) * 10) * 0.12 * fan;
      k += pebble(x, y, 7, 1.3) * 0.16;
      // wear: a paler scuff on the shoulder, an oiled patch low down
      if (vnoise(u / 3.5, v / 3.5, 11) > 0.7) k += 0.06;
      if (nv > 0.6) k -= 0.05;
    }
    p.set(x, y, tone(T, k));
  }
  // a darker patch sewn on the belly, its stitches, and a brass coin riveted through it
  const pcx = 13, pcy = 17.9;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const du = (U(x) - pcx) / 3.7, dv = (U(y) - pcy) / 3.5, r = Math.hypot(du, dv);
    if (r > 1) continue;
    let k = 0.38 + (du + dv < 0 ? 0.08 : -0.04) + pebble(x, y, 9, 1.2) * 0.12;
    if (r > 0.84) k = du + dv < -0.2 ? 0.58 : 0.2;
    p.set(x, y, tone(T, k));
  }
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2 + 0.39;
    const sx = Math.round(pcx * f - 0.5 + Math.cos(t) * 2.9 * f), sy = Math.round(pcy * f - 0.5 + Math.sin(t) * 2.75 * f);
    p.set(sx, sy, THREAD);
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const du = (U(x) - pcx) / 1.6, dv = (U(y) - pcy) / 1.6;
    const k = dome(du, dv, 0.5);
    if (k < 0) continue;
    p.set(x, y, du * du + dv * dv > 0.5 ? tone(G, 0.15 + k * 0.4) : tone(G, 0.45 + k * 0.6));
  }
  p.set(R(pcx - 0.6), R(pcy - 0.7), G[7]);
  // the cord: twisted, wrapped round the neck, knotted on the right with two beaded ends
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = U(x), v = U(y);
    if (v < cordT || v > cordB || Math.abs(u - cx) > 5.4) continue;
    const tw = (x + y) % 3;
    p.set(x, y, tw === 0 ? C[1] : tw === 1 ? (v < (cordT + cordB) / 2 ? C[5] : C[4]) : C[3]);
  }
  const kx = R(18.6), ky = R(cordT + 0.2);
  p.set(kx, ky, C[5]); p.set(kx + 1, ky, C[3]); p.set(kx, ky + 1, C[3]); p.set(kx + 1, ky + 1, C[1]);
  const end = (x0, y0, x1, y1, bead) => {
    p.line(x0, y0, x1, y1, C[4]);
    p.line(x0 + 1, y0, x1 + 1, y1, C[1]);
    p.set(x1, y1 + 1, bead[1]); p.set(x1 + 1, y1 + 1, bead[0]); p.set(x1, y1 + 2, bead[0]); p.set(x1 + 1, y1 + 2, bead[2]);
  };
  end(kx, ky + 2, R(21.4), R(14.4), [0xc23c2c, 0xff9a7a, 0x6a140c]);
  end(kx - 1, ky + 2, R(19.2), R(16.4), [G[4], G[7], G[1]]);
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- paper labels & plates (9-slices)
/** The pouch's gold tag: punched, twine-tied end on the left. Slices 3 3 3 8, 13 rows tall. */
function goldTag() {
  const W = 24, H = 13, P = RAMP.paper, MW = 13; // the middle tiles every 13 px
  const p = new Px(W, H);
  p.poly([[6, 1], [W - 1, 1], [W - 1, H - 1], [6, H - 1], [1, 7.5], [1, 5.5]], 0xffffff);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!p.a(x, y)) continue;
    const tx = x >= 8 && x < 8 + MW ? x - 8 : x;
    let k = paperK(tx, y, 4, x >= 8 && x < 8 + MW ? MW : 0) + 0.12;
    if (y >= H - 3) k -= 0.12 * (y - (H - 4));
    if (y === 1) k += 0.12;
    if (x >= W - 2) k -= 0.12;
    p.set(x, y, dtone(P, k, x, y));
  }
  // a deckled bottom edge
  for (let x = 6; x < W - 1; x++) {
    const tx = x >= 8 && x < 8 + MW ? x - 8 : x;
    if (h2(tx, 3, 5) > 0.55) p.set(x, H - 2, P[3]);
  }
  // brass grommet round the punched hole, the twine through it
  const B = RAMP.brass;
  p.set(3, 5, B[6]); p.set(4, 5, B[5]); p.set(5, 6, B[4]); p.set(3, 7, B[4]); p.set(4, 7, B[2]); p.set(2, 6, B[6]);
  p.set(3, 6, 0x1a0e08); p.set(4, 6, 0x2a1408);
  p.outline(P[0]);
  const C = RAMP.twine;
  p.set(0, 6, C[4]); p.set(1, 6, C[2]); p.set(2, 6, C[3]); p.set(0, 7, C[1]); p.set(1, 5, C[5]);
  return p;
}

/** A plate (9-slice: 2 rows top/bottom, 4 columns each side): ramp, brushed or grained. */
function plate(pal, { W = 16, H = 10, seed = 3, brushed = true, line = true } = {}) {
  const p = new Px(W, H);
  const MW = W - 8;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = x >= 4 && x < W - 4 ? (x - 4) % MW : x;
    let k = 0.52 + (brushed ? (h2(Math.floor(tx / 3), y, seed) - 0.5) * 0.14 + (h2(tx, y, seed + 1) - 0.5) * 0.06 : pebble(tx, y, seed) * 0.16);
    if (y === 0 || x === 0) k = 0.88;
    else if (y === H - 1 || x === W - 1) k = 0.14;
    else if (y === 1) k += 0.18;
    else if (y === H - 2) k -= 0.18;
    else if (x === 1) k += 0.12;
    else if (x === W - 2) k -= 0.14;
    p.set(x, y, tone(pal, k));
  }
  if (line) {
    // an engraved line round the face: dark groove, bright far wall; rivets at the ends
    for (let y = 2; y < H - 2; y++) { p.set(2, y, pal[1]); p.set(W - 3, y, pal[6]); }
    rivet(p, 1, Math.floor(H / 2) - 1, false, pal);
    rivet(p, W - 3, Math.floor(H / 2) - 1, false, pal);
  }
  // knock the corners off and outline
  p.clear(0, 0); p.clear(W - 1, 0); p.clear(0, H - 1); p.clear(W - 1, H - 1);
  return p;
}

/** Dark walnut plaque with brass pins in the corners and a lighter bevel. 9-slice 5 on 20. */
function plaque() {
  const S = 20, Wd = RAMP.walnut, B = RAMP.brass;
  const p = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const tx = x >= 5 && x < 15 ? 5 + ((x - 5) % 10) : x, ty = y >= 5 && y < 15 ? 5 + ((y - 5) % 10) : y;
    // grain runs along the plank
    let k = 0.42 + (vnoise(tx / 9, ty * 1.3, 21) - 0.5) * 0.3 + (h2(tx, ty, 22) - 0.5) * 0.08;
    if (Math.abs(Math.sin(ty * 1.7 + vnoise(tx / 5, ty / 2, 23) * 3)) < 0.12) k -= 0.12;
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (d === 0) k = 0.02;
    else if (d === 1) k = x + y < S ? 0.85 : 0.18;
    else if (d === 2) k += x + y < S ? 0.16 : -0.1;
    else if (d === 3) k -= 0.18;
    p.set(x, y, tone(Wd, k));
  }
  for (const [x, y] of [[2, 2], [S - 4, 2], [2, S - 4], [S - 4, S - 4]]) rivet(p, x, y, false, B);
  p.clear(0, 0); p.clear(S - 1, 0); p.clear(0, S - 1); p.clear(S - 1, S - 1);
  return p;
}

/** A shop-style paper tag (9-slice 3 on 14×12): fibres, a darker bottom, a folded corner. */
function paperTag(red = false) {
  const W = 14, H = 12;
  const pal = red ? RAMP.wax : RAMP.paper;
  const p = new Px(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = x >= 3 && x < W - 3 ? 3 + ((x - 3) % (W - 6)) : x, ty = y >= 3 && y < H - 3 ? 3 + ((y - 3) % (H - 6)) : y;
    let k = (red ? 0.62 : 0.78) + (paperK(tx, ty, red ? 8 : 6) - 0.66) * (red ? 0.8 : 1);
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d === 0) k = red ? 0.05 : 0.0;
    else if (d === 1) k += x + y < (W + H) / 2 ? 0.1 : -0.16;
    p.set(x, y, dtone(pal, k, x, y));
  }
  p.clear(0, 0); p.clear(W - 1, 0); p.clear(0, H - 1); p.clear(W - 1, H - 1);
  return p;
}

/** The load gauge: a brass tube with a glass window and engraved ticks (8×30; the bar sits at 2..5 × 3..26). */
function gauge() {
  const W = 8, H = 30, B = RAMP.brass;
  const p = new Px(W, H);
  // a hook ring on top
  p.set(3, 0, B[6]); p.set(4, 0, B[4]); p.set(2, 1, B[6]); p.set(5, 1, B[3]); p.set(3, 2, B[3]); p.set(4, 2, B[2]);
  for (let y = 3; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5 - W / 2) / (W / 2);
    let k = 0.15 + lambert(u, 0, Math.sqrt(1 - Math.min(1, u * u))) * 0.8;
    if (y === 3 || y === H - 1) k -= 0.2;
    if (y === 4) k += 0.15;
    p.set(x, y, tone(B, k));
  }
  // engraved ticks at quarters, the window cut out (the bar shows through it)
  for (const t of [0.25, 0.5, 0.75]) { const y = Math.round(5 + t * 21); p.set(0, y, B[1]); p.set(7, y, B[1]); p.set(0, y + 1, B[7]); }
  for (let y = 5; y < 27; y++) for (let x = 2; x < 6; x++) p.clear(x, y);
  for (let y = 5; y < 27; y++) { p.set(1, y, B[1]); p.set(6, y, B[6]); }
  p.hl(2, 5, 4, B[1]); p.hl(2, 5, 27, B[7]);
  rivet(p, 3, H - 2, false, B);
  p.outline(INK);
  return p;
}

/** Twisted twine, a vertical tile 2×4. */
function twineV() {
  const C = RAMP.twine, p = new Px(2, 4);
  const rows = [[C[4], C[2]], [C[3], C[1]], [C[2], C[4]], [C[1], C[3]]];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) p.set(x, y, rows[y][x]);
  return p;
}
/** A chain, vertical tile 3×8: a front link, then one seen edge-on. */
function chainV() {
  const I = RAMP.iron, p = new Px(3, 8);
  p.set(1, 0, I[6]); p.set(0, 1, I[6]); p.set(2, 1, I[3]); p.set(0, 2, I[5]); p.set(2, 2, I[2]); p.set(0, 3, I[4]); p.set(2, 3, I[2]); p.set(1, 4, I[3]);
  p.set(1, 1, I[0]); p.set(1, 2, I[0]); p.set(1, 3, I[0]);
  p.set(1, 5, I[7]); p.set(1, 6, I[5]); p.set(1, 7, I[3]);
  p.set(0, 6, I[1]); p.set(2, 6, I[1]);
  return p;
}

// ---------------------------------------------------------------- the objective scroll
/** 9-slice (8) on 48×32: the flat sheet tiles 32×16; rolled, curled ends left and right. */
function strip() {
  const W = 48, H = 32, P = RAMP.paper, MW = 32, MH = 16;
  const p = new Px(W, H);
  const edgeT = (x) => 2 + Math.round(vnoise(x / 3, 1, 31, MW / 3) * 2.2 - 0.3);
  const edgeB = (x) => H - 3 - Math.round(vnoise(x / 3, 2, 32, MW / 3) * 2.2 - 0.3);
  // the flat sheet: fibres and age spots, tiling 32×16
  for (let y = 0; y < H; y++) for (let x = 8; x < W - 8; x++) {
    const tx = x - 8, ty = ((y - 8) % MH + MH) % MH;
    const et = edgeT(tx), eb = edgeB(tx);
    if (y < et || y > eb) continue;
    let k = paperK(tx, ty, 2, MW, MH) + 0.06;
    const fox = vnoise(tx / 5, ty / 4, 33, 0);
    if (fox > 0.78) k -= (fox - 0.78) * 1.2;
    if (y === et) k = 0.24; // the deckle, burnt a little
    else if (y === et + 1) k -= 0.12;
    else if (y === eb) k = 0.12;
    else if (y === eb - 1) k -= 0.2;
    else if (y === eb - 2) k -= 0.06;
    p.set(x, y, dtone(P, k, x, y));
  }
  // rolled ends: a cylinder of rolled sheet, the spiral of the curl showing at its top
  for (const side of [0, 1]) {
    const x0 = side ? W - 8 : 0;
    for (let y = 2; y < H - 2; y++) for (let i = 0; i < 8; i++) {
      const x = x0 + i;
      const u = side ? (i - 0.5) / 7 : (6.5 - i) / 7; // 0 at the sheet .. 1 at the far side
      const s = (side ? i : 7 - i) / 7 * 2 - 1; // across the roll −1..1 (left to right in screen space for side 0)
      const sx = side ? (i + 0.5) / 8 * 2 - 1 : (i + 0.5) / 8 * 2 - 1;
      let k = 0.12 + lambert(sx, 0, Math.sqrt(Math.max(0, 1 - sx * sx))) * 0.86;
      k += (paperK(i, ((y - 8) % MH + MH) % MH, 7 + side, 0, MH) - 0.66) * 0.6;
      // the layers of the roll show as faint lines near its silhouette
      if (Math.abs(sx) > 0.72 && (y + i) % 5 === 0) k -= 0.1;
      void u; void s;
      p.set(x, y, dtone(P, k, x, y));
    }
    // where the sheet leaves the roll: a crease and its shadow
    const xs = side ? x0 : x0 + 7;
    for (let y = 3; y < H - 3; y++) p.set(xs, y, mixC(p.get(xs, y), P[1], 0.55));
    // the curl at the top: the rolled sheet seen end-on, a hollow core and the inner turn;
    // the bottom: the roll's rounded underside
    const cx = x0 + 4, cb = H - 3;
    const CAP = ['.oooooo.', 'ohhhhhlo', 'ohdkkkdo', 'ohldkdmo', 'omllllmo', '.oooooo.'];
    const cp = { o: P[0], h: P[7], l: P[5], m: P[3], d: P[1], k: 0x3a2412 };
    for (let j = 0; j < CAP.length; j++) for (let i = 0; i < 8; i++) {
      const ch = CAP[j][side ? 7 - i : i];
      if (ch === '.') { if (j === 0) p.clear(x0 + i, j); continue; }
      let c = cp[ch];
      if (side && ch === 'h') c = P[6];
      p.set(x0 + i, j, c);
    }
    for (let y = cb - 1; y < H; y++) for (let x = x0; x < x0 + 8; x++) {
      const du = (x + 0.5 - cx) / 4, dv = (y + 0.5 - cb) / 2.2;
      if (du * du + dv * dv > 1) { if (y > cb) p.clear(x, y); continue; }
      if (y >= cb) p.set(x, y, dv > 0.5 ? P[1] : du < -0.2 ? P[4] : P[2]);
    }
  }
  p.outline(P[0]);
  return p;
}

/** The scroll's wax seal: a red blob pressed with Old Star's star, two silk ribbon tails. 15×20. */
function waxSeal() {
  const W = 15, H = 20, Wx = RAMP.wax;
  const p = new Px(W, H);
  // ribbon tails (behind the wax), forked at the ends
  const ribbon = (x0, dir, c) => {
    for (let y = 6; y < H; y++) {
      const x = Math.round(x0 + (y - 6) * 0.22 * dir);
      for (let i = 0; i < 3; i++) {
        if (y >= H - 2 && i === 1) continue; // the fork
        if (y === H - 1 && i !== (dir > 0 ? 2 : 0)) continue;
        p.set(x + i, y, i === 0 ? c[2] : i === 1 ? c[1] : c[0]);
      }
    }
  };
  ribbon(3, -1, [0x1a3a5a, 0x2a5a8a, 0x5a8ac0]);
  ribbon(8, 1, [0x8a6a16, 0xd8a83a, 0xf8dc86]);
  sealBlob(p, 7.5, 6.8, 6.4, 3.6, 5);
  p.set(10, 13, Wx[3]); p.set(10, 14, Wx[2]); p.set(11, 13, Wx[2]);
  p.outline(0x2a0604);
  return p;
}

/**
 * A wax blob centred at (cx, cy): a wobbly rim lit at the top left, a face pressed in by a
 * seal (a dark crescent where its wall shades, a lit one opposite) with a raised star in it.
 */
function sealBlob(p, cx, cy, R, rf, starW) {
  const Wx = RAMP.wax;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = Math.atan2(dy, dx);
    const rr = R + Math.sin(a * 5 + 1) * 0.42 + Math.sin(a * 3) * 0.28;
    const d = Math.hypot(dx, dy);
    if (d > rr) continue;
    const lit = -(dx + dy) / (d * Math.SQRT2 || 1);
    let c;
    if (d > rf + 1) c = d > rr - 1 ? (lit > 0.3 ? Wx[6] : lit > -0.4 ? Wx[4] : Wx[2]) : lit > 0.5 ? Wx[5] : Wx[4];
    else if (d > rf) c = lit > 0 ? Wx[1] : Wx[6];
    else c = Wx[3];
    p.set(x, y, c);
  }
  const S5 = ['..x..', '.xxx.', 'xxxxx', '.xxx.', '.x.x.'], S3 = ['.x.', 'xxx', 'x.x'];
  const st = starW >= 5 ? S5 : S3, n = st.length;
  const ox = Math.round(cx - n / 2), oy = Math.round(cy - n / 2);
  const on = (i, j) => st[j]?.[i] === 'x';
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (!on(i, j)) continue;
    if (!on(i + 1, j + 1)) p.set(ox + i + 1, oy + j + 1, Wx[1]);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (on(i, j)) p.set(ox + i, oy + j, !on(i - 1, j) || !on(i, j - 1) ? Wx[7] : Wx[5]);
  const gx = Math.round(cx - R * 0.55), gy = Math.round(cy - R * 0.62);
  p.set(gx, gy, 0xffd8c0);
}

/** A small wax seal (10×10): the stand-in portrait for quests without a giver. */
function waxSmall() {
  const p = new Px(10, 10);
  sealBlob(p, 5, 5, 4.4, 2.3, 3);
  p.outline(0x2a0604);
  return p;
}

// ---------------------------------------------------------------- ui3: toast tags by kind
// Good news comes on a linen tag sewn with green thread, a warning on a tooled leather tag through an
// eyelet, bad news on a riveted brass plate on a chain. (The plain paper note stays for the rest.)
const wrap = (v, n) => ((v % n) + n) % n;
const LINEN = CA.TONES.linen, VEG = CA.TONES.veg, BR = CA.TONES.brass;
/** Linen weave brightness at (x, y) (periodic 20): threads over and under, slubs in a few of them. */
const weave = (x, y, M = 20) => {
  const fx = wrap(x, M), fy = wrap(y, M);
  let k = ((fx + fy) & 1) ? 0.07 : -0.05;
  if (fy & 1) k += (h2(fy, 0, 201) - 0.5) * 0.12; else k += (h2(fx, 1, 202) - 0.5) * 0.12;
  if (h2(fy >> 1, 3, 203) < 0.15 && fy & 1) k += 0.08; // a slub in the weft
  return k;
};
/** The linen tag (slice 5 on 30): a turned hem with a green running stitch, a frayed foot. */
function clothTag() {
  const s = 5, M = 20, W = 30, p = new Px(W, W);
  const G = [0x2e5a20, 0x4f8a34, 0x8ac85a];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const { u, d, tl, e } = CA.edgeOf(x, y, W, W), uu = wrap(u - s, M);
    if (Math.min(x, W - 1 - x) + Math.min(y, W - 1 - y) < 2) continue;
    if (e === 2 && d === 0 && h2(uu, 7, 204) < 0.5) continue; // the frayed foot
    let k = 0.62 + weave(x - s, y - s);
    if (d === 0) { p.set(x, y, e === 2 ? LINEN[3] : LINEN[0]); continue; }
    if (d === 1) k += tl ? 0.22 : -0.2;
    else if (d === 2) k += tl ? 0.06 : -0.12;
    else if (d === 3) k -= 0.14; // the hem's edge
    if (d === 4) { const st = wrap(uu, 4); if (st < 2) { p.set(x, y, st === 0 ? G[2] : G[1]); continue; } if (st === 2) k -= 0.2; }
    p.set(x, y, dtone(LINEN, k, x, y));
  }
  // loose threads hanging off the foot
  for (let i = 0; i < 4; i++) { const x = s + Math.floor(h2(i, 9, 205) * M); if (p.a(x, W - 1)) p.set(x, W - 1, LINEN[5]); }
  return p;
}
function linenTile() { const M = 20, p = new Px(M, M); for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) p.set(x, y, dtone(LINEN, 0.62 + weave(x, y), x, y)); return p; }

/** The tooled leather tag (slice 6 on 32): veg-tan hide, a burnished edge, a saddle stitch in a groove. */
function leatherTag() {
  const s = 6, M = 20, W = 32, p = new Px(W, W);
  const F = CA.leatherField(M, M, { seed: 211, cell: 3.2, dome: 0.035, valley: 0.08, wear: 0.26, base: 0.6 });
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const { u, d, tl } = CA.edgeOf(x, y, W, W), uu = wrap(u - s, M);
    if (Math.min(x, W - 1 - x) + Math.min(y, W - 1 - y) < 3) continue;
    let k = F.K[wrap(y - s, M) * M + wrap(x - s, M)];
    if (d === 0) { p.set(x, y, 0x2a160a); continue; }
    if (d === 1) k -= 0.3; // the dyed, burnished edge
    else if (d === 2) k += tl ? 0.18 : -0.08;
    else if (d === 3) k -= 0.2; // the stitching groove
    if (d === 3) { const st = wrap(uu, 4); if (st < 2) { p.set(x, y, st === 0 ? 0xfff0cc : 0xe8d0a0); continue; } if (st === 2) k -= 0.22; }
    else if (d === 4 && wrap(uu, 4) < 2) k -= 0.12;
    p.set(x, y, CA.quant(VEG, k, x, y, 0.3));
  }
  return p;
}
function vegTile() { const p = new Px(20, 20); CA.paintField(p, CA.leatherField(20, 20, { seed: 211, cell: 3.2, dome: 0.035, valley: 0.08, wear: 0.26, base: 0.6 }), VEG, 0, 0, 0.3); return p; }

/** The brass plate (slice 6 on 32): brushed, bevelled, an engraved line round it, a screw in each corner. */
function brassTag() {
  const s = 6, M = 20, W = 32, p = new Px(W, W);
  const F = CA.brassField(M, M, { seed: 221, base: 0.6 });
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const { d, tl } = CA.edgeOf(x, y, W, W);
    if (Math.min(x, W - 1 - x) + Math.min(y, W - 1 - y) < 2) continue;
    let k = F.K[wrap(y - s, M) * M + wrap(x - s, M)];
    if (d === 0) { p.set(x, y, BR[0]); continue; }
    if (d === 1) k += tl ? 0.3 : -0.3;
    else if (d === 2) k += tl ? 0.12 : -0.14;
    else if (d === 4) k = tl ? 0.18 : 0.82; // the engraved line: its shaded wall...
    else if (d === 5) k = tl ? 0.8 : 0.3; // ...and the lit one
    if (!tl && F.V[wrap(y - s, M) * M + wrap(x - s, M)] > 0.62 && d > 1) k -= 0.1; // tarnish low down
    p.set(x, y, CA.quant(BR, k, x, y, 0.35));
  }
  for (const [x, y, dir] of [[2, 2, 0], [W - 5, 2, 2], [2, W - 5, 3], [W - 5, W - 5, 1]]) screw(p, x, y, dir, RAMP.brass);
  for (const [x, y] of [[9, 1], [1, 12]]) { p.set(x, y, BR[9]); p.set(x + 1, y, BR[8]); }
  return p;
}
function brassTile() { const p = new Px(20, 20), F = CA.brassField(20, 20, { seed: 221, base: 0.6 }); for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) p.set(x, y, CA.quant(BR, F.K[y * 20 + x], x, y, 0.35)); return p; }

/** A forged nail head (3×2 at x, y) the tags hang from. */
function nail(p, x, y) {
  const I = RAMP.iron;
  p.set(x, y, I[6]); p.set(x + 1, y, I[7]); p.set(x + 2, y, I[4]);
  p.set(x, y + 1, I[4]); p.set(x + 1, y + 1, I[3]); p.set(x + 2, y + 1, I[1]);
}
/** The linen tag's hanger (9×12): a loop of green thread from a nail. */
function hangLoop() {
  const p = new Px(9, 12), G = [0x2e5a20, 0x4f8a34, 0x8ac85a];
  p.line(3, 3, 1, 11, G[1]); p.line(5, 3, 7, 11, G[0]); p.line(4, 3, 2, 10, G[2]);
  p.set(4, 2, G[1]); p.set(3, 2, G[2]);
  nail(p, 3, 0);
  p.outline(INK);
  return p;
}
/** The leather tag's hanger (11×14): twine from a nail, through a brass eyelet. */
function hangTwine() {
  const p = new Px(11, 14), C = RAMP.twine;
  for (let y = 2; y < 10; y++) { const o = Math.round((y - 2) * 0.28); p.set(4 - o, y, C[(y & 1) ? 4 : 2]); p.set(6 + o, y, C[(y & 1) ? 1 : 3]); }
  const B = RAMP.brass;
  for (const [x, y, c] of [[4, 9, 7], [5, 9, 8], [6, 9, 6], [3, 10, 7], [7, 10, 4], [3, 11, 6], [7, 11, 3], [4, 12, 4], [5, 12, 3], [6, 12, 2]]) p.set(x, y, B[c]);
  p.set(4, 10, 0x1a0e08); p.set(5, 10, C[3]); p.set(6, 10, 0x1a0e08); p.set(4, 11, 0x1a0e08); p.set(5, 11, C[2]); p.set(6, 11, 0x2a1408);
  nail(p, 4, 0);
  p.outline(INK);
  return p;
}
/** The brass plate's hanger (7×15): a hook, two iron links, a ring. */
function hangChain() {
  const p = new Px(7, 15), I = RAMP.iron;
  p.set(3, 0, I[6]); p.set(4, 0, I[4]); p.set(2, 1, I[6]); p.set(4, 1, I[2]); p.set(3, 2, I[5]);
  for (const [y0, side] of [[3, 0], [7, 1]]) {
    if (!side) { p.set(3, y0, I[7]); p.set(2, y0 + 1, I[6]); p.set(4, y0 + 1, I[3]); p.set(2, y0 + 2, I[5]); p.set(4, y0 + 2, I[2]); p.set(3, y0 + 3, I[3]); }
    else { p.set(3, y0, I[6]); p.set(3, y0 + 1, I[5]); p.set(3, y0 + 2, I[4]); p.set(3, y0 + 3, I[2]); }
  }
  for (const [x, y, c] of [[2, 11, 7], [3, 11, 6], [4, 11, 5], [1, 12, 6], [5, 12, 3], [2, 13, 4], [3, 13, 3], [4, 13, 2]]) p.set(x, y, I[c]);
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- ui3: the strip's seal cracking
/**
 * The scroll's seal breaking when a step is done, and a fresh one settling: 6 frames of 15×20 side by
 * side (whole, a hairline crack, split, the halves apart with a chip gone, a new blob squashed as it
 * lands, whole again).
 */
function waxCrack() {
  const W = 15, H = 20, N = 6, base = waxSeal(), Wx = RAMP.wax, p = new Px(W * N, H);
  const cx = 7.5, cy = 6.8;
  const inBlob = (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 7.4 && y < 14;
  const crack = [[12, 1], [10, 4], [9, 5], [8, 7], [6, 8], [5, 10], [3, 12]];
  const side = (x, y) => { // which side of the crack (by the nearest segment)
    let best = 1e9, sg = 0;
    for (let i = 0; i + 1 < crack.length; i++) {
      const [ax, ay] = crack[i], [bx, by] = crack[i + 1], dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
      if (d < best) { best = d; sg = dx * (y - ay) - dy * (x - ax); }
    }
    return sg > 0 ? 1 : -1;
  };
  const put = (f, x, y, c, a = 255) => { if (x >= 0 && y >= 0 && x < W && y < H) p.set(f * W + x, y, c, a); };
  for (let f = 0; f < N; f++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = base.a(x, y);
      if (!a) continue;
      const c = base.get(x, y);
      if (f === 0 || f === 5 || (!inBlob(x, y) && f !== 4)) { if (!inBlob(x, y) || f === 0 || f === 5) put(f, x, y, c, a); continue; }
      if (f === 4) { if (!inBlob(x, y)) put(f, x, y, c, a); continue; }
      const sd = side(x, y), sh = f === 1 ? 0 : f === 2 ? 1 : 2;
      put(f, x + (sd > 0 ? sh : -Math.floor(sh / 2)), y + (sd > 0 ? sh : 0), c, a);
    }
    if (f === 1) for (let i = 0; i + 1 < crack.length; i++) { // the hairline: a dark cut, its far lip lit
      const [ax, ay] = crack[i], [bx, by] = crack[i + 1], n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let t = 0; t <= n; t++) { const x = Math.round(ax + (bx - ax) * t / n), y = Math.round(ay + (by - ay) * t / n); if (inBlob(x, y)) { put(f, x, y, Wx[0]); if (inBlob(x + 1, y)) put(f, x + 1, y, Wx[6]); } }
    }
    if (f >= 2 && f <= 3) for (const [x, y] of [[12, 4], [13, 5], [13, 6]]) p.clear(f * W + x + (f - 1), y + (f - 1)); // a chip flew off
    if (f === 4) { // the new blob lands squashed (wider, flatter), then springs back
      const t = new Px(W, H);
      sealBlob(t, cx, cy, 6.4, 3.6, 5);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const sx = Math.round(cx - 0.5 + (x + 0.5 - cx) / 1.14), sy = Math.round(cy + 1.4 - 0.5 + (y + 0.5 - cy - 1.4) / 0.78);
        if (t.in(sx, sy) && t.a(sx, sy)) put(f, x, y, t.get(sx, sy));
      }
    }
  }
  // outline every frame's wax again
  for (let f = 1; f < 5; f++) {
    const q = new Px(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p.a(f * W + x, y)) q.set(x, y, p.get(f * W + x, y), p.a(f * W + x, y));
    q.outline(0x2a0604);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (q.a(x, y) && !p.a(f * W + x, y)) p.set(f * W + x, y, q.get(x, y));
  }
  return p;
}

// ---------------------------------------------------------------- registry
const H = (k, fn) => art('h:' + k, fn);
export const HART = {
  pouch: (open = false, S = 26) => H(`pouch${open ? 1 : 0}:${S}`, () => pouchArt(open, S)),
  goldTag: () => H('goldTag', goldTag),
  ironTag: () => H('ironTag', () => plate(RAMP.iron, { seed: 5, brushed: false })),
  brassPlate: () => H('brassPlate', () => plate(RAMP.brass, { seed: 7 })),
  plaque: () => H('plaque', plaque),
  paperTag: (red = false) => H('paperTag' + (red ? 1 : 0), () => paperTag(red)),
  gauge: () => H('gauge', gauge),
  twineV: () => H('twineV', twineV),
  chainV: () => H('chainV', chainV),
  strip: () => H('strip', strip),
  wax: () => H('wax', waxSeal),
  waxSmall: () => H('waxSmall', waxSmall),
  // ui3
  clothTag: () => H('clothTag', clothTag),
  linenT: () => H('linenT', linenTile),
  leatherTag: () => H('leatherTag', leatherTag),
  vegT: () => H('vegT', vegTile),
  brassTag: () => H('brassTag', brassTag),
  brassT: () => H('brassT', brassTile),
  hangLoop: () => H('hangLoop', hangLoop),
  hangTwine: () => H('hangTwine', hangTwine),
  hangChain: () => H('hangChain', hangChain),
  waxCrack: () => H('waxCrack', waxCrack),
};
/** (the ui3 pieces, for previews) */
export const HAX = { clothTag, linenTile, leatherTag, vegTile, brassTag, brassTile, hangLoop, hangTwine, hangChain, waxCrack };

/** Publish the HUD art as --h-* custom properties (once). */
let installed = false;
export function installHudArt(node = document.documentElement) {
  if (installed && node === document.documentElement) return;
  if (node === document.documentElement) installed = true;
  const u = (k, v) => node.style.setProperty('--h-' + k, `url("${v}")`);
  u('goldTag', HART.goldTag()); u('ironTag', HART.ironTag()); u('brassPlate', HART.brassPlate()); u('plaque', HART.plaque());
  u('paperTag', HART.paperTag(false)); u('paperTagRed', HART.paperTag(true)); u('gauge', HART.gauge());
  u('twineV', HART.twineV()); u('chainV', HART.chainV()); u('wax', HART.wax());
  // ui3: the toast tags by kind, and the strip's seal cracking
  u('clothTag', HART.clothTag()); u('linenT', HART.linenT()); u('leatherTag', HART.leatherTag()); u('vegT', HART.vegT());
  u('brassTag', HART.brassTag()); u('brassT', HART.brassT()); u('waxCrack', HART.waxCrack());
}

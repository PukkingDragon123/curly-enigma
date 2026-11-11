// The skill tree's brass-and-iron chrome, drawn pixel by pixel (1 art pixel = 1 canvas pixel; the
// panel parts are shown at --px, the board parts at the board's own scale --s):
//   panel         9-slice (12) the big frame: a riveted brass rail with a rope moulding, gear-tooth
//                 corner bosses, an inner iron lip
//   head          3-slice (14 | 32 | 14, 26 tall) the gold header bar: engraved scrollwork, beading
//   medal         the round emblem's milled gear ring (48×48, a 32×32 icon sits in its middle)
//   frame(st, t)  a node's frame (40×46): an arched gem housing on top, a bevelled frame round a
//                 recessed well; st: 'iron' | 'bronze' | 'ready' | 'owned' | 'barred'; t = line tint
//   gem(kind)     the gem in the housing (8×7): off | ready | owned | pending | barred
//   plate(n, lit) the rank plate under a node (17×7): n sockets, `lit` of them glowing
//   chainA/B, lock(lv)  the chains wrapped over a locked node and its padlock (lv engraved, or a keyhole)
//   tab(on)       a line tab's socket (36×36)
//   btn(kind, dn) 3-slice (6) brass button; ico(name) its 9×9 glyph; knob(hover) the close knob (15×15)
//   inset         9-slice (4) the dark points well; token the brass skill point (11×11)
//   orTag         the "OR" plate between two choices (13×7)
//   watermark     a big faint gear with a pick and hammer (120×120)
//   paintPipes(img, segs, joints) pipes on the board canvas (dim / lit / pending)
// installSkillChrome() publishes the fixed ones as --skc-* custom properties.
import { Px } from './px.js';
import { art, cssUrl } from './uiArt.js';
import { TONES, brassField, pnoise, hash, quant, edgeOf, edgeOfF, rivet, leatherTile } from './craftArt.js';

const B = TONES.brass; // 10 tones
const GOLD = [0x3a2004, 0x6a3c08, 0x9a600c, 0xc88a18, 0xe8b030, 0xf8cc4c, 0xffe07a, 0xfff0a8, 0xfff8d4, 0xfffdf0];
const IRON = [0x0e0d0f, 0x18171b, 0x232227, 0x2e2d33, 0x3a3940, 0x47464e, 0x56555e, 0x67666f, 0x7a7983, 0x908f98];
const BRONZE = [0x1a1008, 0x2a1a0c, 0x3a2612, 0x4c3218, 0x5e3e1e, 0x6e4a24, 0x7e582c, 0x8e6634, 0x9e743e, 0xae844a];
const RUST = [0x1a0a08, 0x2a100c, 0x3a1810, 0x4a2014, 0x5a2a18, 0x6a341e, 0x7a3e24, 0x8a4a2a, 0x9a5632, 0xa8623a];
const INK = 0x120a05;
const wrap = (v, n) => ((v % n) + n) % n;
const hexA = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mixC = (a, b, t) => { const A = hexA(a), Bb = hexA(b); return (Math.round(A[0] + (Bb[0] - A[0]) * t) << 16) | (Math.round(A[1] + (Bb[1] - A[1]) * t) << 8) | Math.round(A[2] + (Bb[2] - A[2]) * t); };
const tone = (pal, k) => pal[Math.max(0, Math.min(pal.length - 1, Math.round(k * (pal.length - 1))))];

// ---------------------------------------------------------------- a 3×5 pixel font (plates, padlocks)
const FONT = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'], L: ['#..', '#..', '#..', '#..', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  O: ['###', '#.#', '#.#', '#.#', '###'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
};
export function textW(s) { return s.length * 4 - 1; }
export function drawText(p, s, x, y, c, shadow = null) {
  for (const ch of String(s)) {
    const g = FONT[ch];
    if (g) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '#') { if (shadow !== null) p.set(x + i, y + j + 1, shadow); }
    if (g) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '#') p.set(x + i, y + j, c);
    x += 4;
  }
}

function panelFrame() {
  const s = 12, M = 32, W = s * 2 + M;
  const p = new Px(W, W), r = p.r;
  const F = brassField(M, M, { seed: 23, res: r });
  p.fine((X, Y, fx, fy) => {
    const x = Math.floor(X), y = Math.floor(Y);
    const { u, d, df, tl } = edgeOfF(X, Y, W, W, r);
    if (d >= s) return undefined;
    const cx = Math.min(x, W - 1 - x), cy = Math.min(y, W - 1 - y);
    if (cx + cy < 3) return undefined; // chamfered corners
    const uu = wrap(u - s, M), lit = tl ? 1 : -1;
    let k = F.k(X - s, Y - s);
    if (d === 0) return INK;
    if (d === 1) k += (r > 1 && df - d < 0.5 ? 0.42 : 0.34) * lit; // finer: a bright arris on the bevel
    else if (d === 2) k += 0.14 * lit;
    else if (d >= 3 && d <= 6) {
      // a rope moulding: twisted strands, each lit on its upper side (finer: half-pixel strands)
      const t = Math.floor(wrap(uu + (tl ? df : -df), 5));
      k = [0.18, 0.92, 0.74, 0.58, 0.4][t];
      if (d === 3) k += 0.06 * lit; else if (d === 6) k -= 0.08 * lit;
      if (F.v(X - s, Y - s) > 0.66 && t === 0) return 0x2a2410;
    } else if (d === 7) k -= 0.18 * lit;
    else if (d === 8) k += 0.06 * lit;
    else if (d === 9) return B[1];
    else if (d === 10) return IRON[3]; // the iron lip
    else if (d === 11) return IRON[1];
    if (!tl && F.v(X - s, Y - s) > 0.62) k -= 0.1; // tarnish on the lower/right rails
    return quant(B, k, fx, fy, 0.35);
  });
  // gear-tooth bosses in the corners (finer: shaded per fine pixel, so the teeth and the hub are crisp)
  for (const [cx, cy] of [[6, 6], [W - 7, 6], [6, W - 7], [W - 7, W - 7]]) {
    p.fine((X, Y) => {
      const x = X - cx, y = Y - cy, hc = 0.5 / r;
      const rr = Math.hypot(x + hc, y + hc), a = Math.atan2(y + hc, x + hc);
      const tooth = Math.cos(a * 8) > 0.2 ? 5.6 : 4.6;
      if (rr > tooth) return undefined;
      let k = 0.62 - (x + y) * 0.04;
      if (rr > tooth - (r > 1 ? 0.75 : 1)) k = 0.25;
      else if (r > 1 && rr > tooth - 1.25 && x + y < 0) k = 0.9; // the teeth's lit edge
      else if (rr < 2.2) k = 0.85 - (x + y) * 0.06;
      else if (rr < 3.1) k = 0.3;
      return tone(B, k);
    }, cx - 6, cy - 6, 13, 13);
    if (r > 1) { p.dot(cx - 1, cy - 1, B[9]); p.dot(cx - 0.5, cy - 1, B[8]); p.dot(cx + 0.5, cy + 0.5, B[3]); }
    else p.set(cx - 1, cy - 1, B[9]);
  }
  // rivets along the band, on the middle's period
  for (const v of [s + 8, s + 24]) for (const [x, y] of [[v, 8], [8, v], [v, W - 9], [W - 9, v]]) rivet(p, x + 0.5, y + 0.5, B, 1.3);
  return p;
}

// ---------------------------------------------------------------- the header bar (3-slice)
function headBar() {
  const L = 14, M = 32, W = L * 2 + M, H = 26;
  const p = new Px(W, H);
  const F = brassField(M, 32, { seed: 31, base: 0.66 });
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ux = wrap(x - L, M);
      const cx = Math.min(x, W - 1 - x);
      if (cx < 2 && (y < 2 - cx || y > H - 3 + cx)) continue;
      let k = F.K[(y % 32) * M + ux] * 0.9 + 0.12 - (y - 4) * 0.012;
      if (y === 0 || y === H - 1 || x === 0 || x === W - 1) { p.set(x, y, INK); continue; }
      if (y === 1) k = 0.98; else if (y === 2) k += 0.18;
      else if (y === H - 2) k = 0.12; else if (y === H - 3) k = 0.28;
      if (x === 1) k = 0.9; else if (x === W - 2) k = 0.3;
      // engraved double rule inset 4 from the edges, beading between the rules
      if (y === 4 || y === H - 5) k = 0.3; if (y === 5 || y === H - 4) k = Math.min(1, k + 0.2);
      if ((y === 6 || y === H - 7) && wrap(ux, 4) === 1) { k = 0.95; }
      if ((y === 7 || y === H - 6) && wrap(ux, 4) === 1) { k = 0.35; }
      // a running scroll engraved along the middle (period 32)
      if (y > 8 && y < H - 9) {
        const t = (ux / M) * Math.PI * 2;
        const cy = H / 2 + Math.sin(t) * 3.2;
        const d = Math.abs(y + 0.5 - cy);
        if (d < 0.75) k = 0.3;
        else if (d < 1.6 && y + 0.5 < cy) k += 0.16;
        // curls off the wave
        const c2x = wrap(ux - 8, 16), c2y = H / 2 + (wrap(ux - 8, 32) < 16 ? -2.2 : 2.2);
        const rr = Math.hypot(c2x - 8, (y + 0.5 - c2y) * 1.3);
        if (rr > 2.2 && rr < 3 && c2x > 5) k = 0.32;
      }
      p.set(x, y, quant(GOLD, Math.max(0, Math.min(1, k)), x, y, 0.3));
    }
  // end caps: rivets and a notch
  for (const x of [5, W - 6]) { rivet(p, x + 0.5, 7.5, B, 1.4); rivet(p, x + 0.5, H - 7.5, B, 1.4); }
  return p;
}

// ---------------------------------------------------------------- the round emblem's ring (48×48)
function medal() {
  const n = 48, p = new Px(n, n), c = n / 2;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const teeth = Math.cos(a * 14) > -0.1 ? 23.6 : 22;
      if (r > teeth) continue;
      const lit = -(dx + dy) / (r || 1) * 0.5; // top-left lit
      let k;
      if (r > teeth - 1) k = 0.18;
      else if (r > 21) k = 0.55 + lit * 0.35 + (Math.cos(a * 14) > 0.6 ? 0.1 : 0);
      else if (r > 20) k = 0.22;
      else if (r > 18.6) { // milled ring
        k = 0.62 + lit * 0.3 + (wrap(Math.floor((a + Math.PI) * 30), 2) ? 0.12 : -0.1);
      } else if (r > 17.6) k = 0.95 * (lit > 0 ? 1 : 0.5);
      else if (r > 16.8) k = 0.15;
      else {
        // the enamel well: deep night-blue leather, lit at the top
        const w = 0.5 - dy / 34 + (hash(x, y, 5) - 0.5) * 0.06;
        p.set(x, y, mixC(0x0c0a10, 0x3a2a24, Math.max(0, Math.min(1, w))));
        continue;
      }
      p.set(x, y, tone(GOLD, Math.max(0, Math.min(1, k))));
    }
  for (let i = 0; i < 4; i++) { const a = -Math.PI * 0.75 + i * Math.PI / 2; rivet(p, c + Math.cos(a) * 21.8, c + Math.sin(a) * 21.8, B, 1.2); }
  return p;
}

// ---------------------------------------------------------------- node frames (40×46)
export const NODE_W = 40, NODE_H = 46, FRAME_Y = 4; // the frame proper: 40×40 from y 4
const FR = {
  iron: { pal: IRON, well: [0x050506, 0x16151a], k: 0.5 },
  bronze: { pal: BRONZE, well: [0x0a0604, 0x2a1c12], k: 0.55 },
  ready: { pal: B, well: [0x120a04, 0x4a3018], k: 0.6 },
  owned: { pal: GOLD, well: [0x1e1006, 0x6a4418], k: 0.62 },
  barred: { pal: RUST, well: [0x0a0404, 0x241010], k: 0.45 },
};
function nodeFrame(st, tint) {
  const f = FR[st] || FR.bronze, pal = f.pal;
  const p = new Px(NODE_W, NODE_H);
  const x0 = 0, y0 = FRAME_Y, W = 40, H = 40;
  const tintC = tint ?? 0x6a4418;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      const cx = Math.min(x, W - 1 - x), cy = Math.min(y, H - 1 - y);
      if (cx + cy < 3) continue; // clipped corners
      const X = x0 + x, Y = y0 + y;
      if (d >= 4) {
        // the recessed well: dark at the rim, a soft light in the middle (line-tinted when lit)
        const dx = (x - 19.5) / 17, dy = (y - 17) / 17, r = Math.min(1, Math.hypot(dx, dy));
        let c = mixC(f.well[0], f.well[1], Math.pow(1 - r, 1.4));
        if (st === 'owned' || st === 'ready') c = mixC(c, tintC, (1 - r) * (st === 'owned' ? 0.45 : 0.22));
        if (y === 4 || x === 4) c = mixC(c, 0x000000, 0.65); // shadow under the lip
        else if (y === 5 || x === 5) c = mixC(c, 0x000000, 0.3);
        p.set(X, Y, c);
        continue;
      }
      const tl = (y <= x && y <= W - 1 - x && y < H - 1 - y) || (x < y && x <= H - 1 - y && x < W - 1 - x);
      const lit = tl ? 1 : -1;
      let k = f.k + (hash(x, y, 7) - 0.5) * 0.06;
      if (d === 0) { p.set(X, Y, INK); continue; }
      if (d === 1) k += 0.36 * lit;
      else if (d === 2) k += 0.06 * lit + (wrap(x + y, 3) === 0 ? 0.07 : 0);
      else if (d === 3) { p.set(X, Y, tone(pal, 0.1)); continue; }
      p.set(X, Y, tone(pal, Math.max(0, Math.min(1, k))));
    }
  // corner studs
  for (const [x, y] of [[2, 2], [36, 2], [2, 36], [36, 36]]) {
    p.set(x0 + x, y0 + y, tone(pal, 0.95)); p.set(x0 + x + 1, y0 + y + 1, tone(pal, 0.2));
  }
  // the gem housing: an arch on the top rail
  for (let y = 0; y < 9; y++)
    for (let x = 13; x < 27; x++) {
      const dx = x + 0.5 - 20, r = Math.hypot(dx / 7, (y + 0.5 - 7.5) / 7.5);
      if (y < 7.5 && r > 1) continue;
      if (y >= 8 && Math.abs(dx) > 6.5) continue;
      const inner = Math.hypot(dx / 4.6, (y + 0.5 - 6) / 4.2) <= 1;
      if (inner) { p.set(x, y, 0x0a0806); continue; }
      const edge = y < 7.5 ? r > 0.86 : Math.abs(dx) > 5.8;
      let k = f.k + 0.12 - (y / 9) * 0.2 + (dx < 0 ? 0.12 : -0.1);
      if (edge) { p.set(x, y, r > 0.95 || Math.abs(dx) > 6.2 ? INK : tone(pal, 0.25)); continue; }
      p.set(x, y, tone(pal, Math.max(0, Math.min(1, k))));
    }
  p.set(16, 2, tone(pal, 0.98));
  // a tab under the frame for the rank plate to sit on
  for (let y = 43; y < 46; y++) for (let x = 11; x < 29; x++) {
    if (y === 45 && (x === 11 || x === 28)) continue;
    p.set(x, y, y === 45 || x === 11 || x === 28 ? INK : tone(pal, 0.3 - (y - 43) * 0.08));
  }
  return p;
}

// ---------------------------------------------------------------- the gem (8×7)
const GEMS = {
  off: [0x0c0a0a, 0x1c1816, 0x2c2622, 0x3a3430, 0x4a423c],
  ready: [0x063018, 0x0e5a2a, 0x22a04a, 0x5ce07a, 0xc8ffd4],
  owned: [0x4a2a04, 0x9a600c, 0xf0b020, 0xffe070, 0xfffbe0],
  pending: [0x4a1c04, 0x9a3c0c, 0xf07a20, 0xffb860, 0xfff0d0],
  barred: [0x30060a, 0x6a0e16, 0xb02030, 0xe85a64, 0xffc0c0],
  open: [0x0a1430, 0x14285a, 0x2a4a90, 0x5a80c8, 0xc0d8ff],
};
function gemArt(kind) {
  const g = GEMS[kind] || GEMS.off, p = new Px(8, 7);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 8; x++) {
    const dx = (x + 0.5 - 4) / 3.6, dy = (y + 0.5 - 3.6) / 3.2, r = Math.hypot(dx, dy);
    if (r > 1) continue;
    let k = 0.55 - dx * 0.25 - dy * 0.3;
    if (r > 0.78) k -= 0.3;
    p.set(x, y, tone(g, Math.max(0, Math.min(1, k))));
  }
  p.set(2, 1, g[4]); p.set(3, 1, g[3]);
  p.set(5, 5, g[3]);
  return p;
}

// ---------------------------------------------------------------- the rank plate (17×7)
function plateArt(n, lit, kind = 'brass') {
  const pal = kind === 'gold' ? GOLD : kind === 'iron' ? IRON : B;
  const W = 17, H = 7, p = new Px(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { p.set(x, y, INK); continue; }
    let k = 0.62 - (y - 1) * 0.07 + (hash(x, y, 3) - 0.5) * 0.05;
    if (y === 1) k = 0.9; else if (y === H - 2) k = 0.3;
    p.set(x, y, tone(pal, k));
  }
  const gap = 4, w = n * gap - 1, x0 = Math.floor((W - w) / 2);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * gap, on = i < lit;
    const c = on ? [0xfff4c0, 0xffc838, 0xb87010] : [0x241a10, 0x0e0a06, 0x3a2a18];
    p.set(x, 2, c[0]); p.set(x + 1, 2, c[1]); p.set(x, 3, c[1]); p.set(x + 1, 3, c[2]);
    if (!on) { p.set(x, 2, 0x0a0604); p.set(x + 1, 3, tone(pal, 0.75)); }
  }
  return p;
}
/** The plate with text (e.g. "LV6") instead of pips. */
function plateText(txt, kind = 'iron') {
  const pal = kind === 'gold' ? GOLD : kind === 'iron' ? IRON : B;
  const W = 17, H = 7, p = new Px(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { p.set(x, y, INK); continue; }
    p.set(x, y, tone(pal, y === 1 ? 0.85 : y === H - 2 ? 0.25 : 0.5));
  }
  drawText(p, txt, Math.floor((W - textW(txt)) / 2), 1, kind === 'iron' ? 0xd8cfc0 : 0x2a1606);
  return p;
}

// ---------------------------------------------------------------- chains + padlock (40×46 overlays)
function chainLink(p, cx, cy, ang, edge) {
  // a forged oval link, seen face-on (a ring) or edge-on (a bar), along `ang`
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
    const u = x * ca + y * sa, v = -x * sa + y * ca;
    const px = Math.round(cx + x), py = Math.round(cy + y);
    if (edge) {
      if (Math.abs(u) > 3.4 || Math.abs(v) > 1.2) continue;
      const k = 0.6 - v * 0.25 + (Math.abs(u) > 2.6 ? -0.2 : 0);
      p.set(px, py, Math.abs(v) > 0.9 ? IRON[1] : tone(IRON, k + 0.15));
    } else {
      const r = Math.hypot(u / 3.6, v / 2.4);
      if (r > 1.12 || r < 0.5) continue;
      const k = 0.65 - (x + y) * 0.06;
      p.set(px, py, r > 1.0 || r < 0.6 ? IRON[1] : tone(IRON, k + 0.2));
    }
  }
}
function chainArt(dir) {
  const p = new Px(NODE_W, NODE_H);
  const ang = dir > 0 ? Math.atan2(36, 36) : Math.atan2(36, -36);
  const x0 = dir > 0 ? 1 : 38, y0 = FRAME_Y + 1;
  const len = Math.hypot(37, 37), step = 5.2;
  for (let i = 0, t = 1; t < len - 1; i++, t += step) {
    chainLink(p, x0 + Math.cos(ang) * t, y0 + Math.sin(ang) * t, ang, i % 2 === 1);
  }
  // rust spots and a highlight here and there
  for (let y = 0; y < NODE_H; y++) for (let x = 0; x < NODE_W; x++) {
    if (!p.a(x, y)) continue;
    const h = hash(x, y, dir > 0 ? 11 : 12);
    if (h < 0.08) p.set(x, y, RUST[5]); else if (h > 0.95) p.set(x, y, IRON[9]);
  }
  p.outline(0x050404);
  return p;
}
function lockArt(lv) {
  const W = 16, H = 18, p = new Px(W, H);
  // the shackle
  for (let y = 0; y < 9; y++) for (let x = 0; x < W; x++) {
    const r = Math.hypot((x + 0.5 - 8) / 5.2, (y + 0.5 - 7) / 6);
    const r2 = Math.hypot((x + 0.5 - 8) / 3.2, (y + 0.5 - 7) / 4);
    if (r <= 1 && (r2 > 1 || y > 6)) p.set(x, y, tone(IRON, 0.75 - (x - 3) * 0.05 - y * 0.02));
  }
  // the body: brass, riveted
  for (let y = 7; y < H; y++) for (let x = 1; x < W - 1; x++) {
    if ((x === 1 || x === W - 2) && (y === 7 || y === H - 1)) continue;
    let k = 0.62 - (x - 2) * 0.025 - (y - 8) * 0.025;
    if (y === 7) k = 0.95; else if (x === 1) k = 0.85; else if (x === W - 2) k = 0.3; else if (y === H - 1) k = 0.2;
    p.set(x, y, tone(B, k));
  }
  if (lv) {
    const t = String(lv);
    drawText(p, t, Math.floor((W - textW(t)) / 2), 10, 0x2a1606, B[8]);
  } else {
    p.set(7, 10, INK); p.set(8, 10, INK); p.set(7, 11, INK); p.set(8, 11, INK); p.set(7, 12, INK); p.set(7, 13, INK); p.set(8, 12, 0x3a2410);
  }
  p.set(3, 9, B[9]); p.set(12, 9, B[2]);
  p.outline(0x050404);
  return p;
}

// ---------------------------------------------------------------- tabs, buttons, wells, tokens
function tabArt(on) {
  const n = 36, p = new Px(n, n), pal = on ? GOLD : BRONZE;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.min(x, y, n - 1 - x, n - 1 - y), cc = Math.min(x, n - 1 - x) + Math.min(y, n - 1 - y);
    if (cc < 4) continue;
    if (d >= 3) { // the well
      const r = Math.hypot((x - 17.5) / 16, (y - 16) / 16);
      p.set(x, y, mixC(on ? 0x2a1608 : 0x0a0706, on ? 0x7a5020 : 0x241810, Math.max(0, 1 - r) ** 1.3));
      continue;
    }
    const tl = x + y < n - 1;
    if (d === 0) { p.set(x, y, INK); continue; }
    p.set(x, y, tone(pal, d === 1 ? (tl ? 0.92 : 0.35) : (tl ? 0.6 : 0.42)));
  }
  return p;
}
function btnArt(kind = 'brass', dn = false) {
  const W = 20, H = 14, p = new Px(W, H);
  const pal = kind === 'green' ? [0x061a0c, 0x0c2e16, 0x164a22, 0x22682e, 0x2e863c, 0x40a04c, 0x5cba62, 0x84d47e, 0xb4eaa8, 0xe4fadc]
    : kind === 'iron' ? IRON : B;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { p.set(x, y, INK); continue; }
    const ux = wrap(x - 6, 8);
    let k = 0.6 - (y - 2) * 0.03 + (pnoise(ux / 4, y * 1.2, 2, 64, 5) - 0.5) * 0.12;
    if (dn) k -= 0.12;
    if (!dn) {
      if (y === 1) k = 0.97; else if (x === 1) k = 0.84; else if (x === W - 2) k = 0.34; else if (y === H - 2) k = 0.1; else if (y === H - 3) k = 0.28;
    } else {
      if (y === 1) k = 0.18; else if (x === 1) k = 0.28; else if (y === H - 2) k = 0.5;
    }
    p.set(x, y, quant(pal, Math.max(0, Math.min(1, k)), x, y, 0.35));
  }
  if (!dn) for (const [x, y] of [[2, 2], [W - 3, 2], [2, H - 4], [W - 3, H - 4]]) p.set(x, y, pal[8]);
  return p;
}
const ICO = {
  undo: ['..#......', '.##......', '#######..', '.##....#.', '..#.....#', '........#', '.......#.', '...####..', '.........'],
  ok: ['.........', '........#', '.......##', '......##.', '#....##..', '##..##...', '.####....', '..##.....', '.........'],
  x: ['.........', '.##...##.', '..##.##..', '...###...', '...###...', '..##.##..', '.##...##.', '.........', '.........'],
};
function icoArt(name, c = 0x2a1606, hi = 0xfff0c0) {
  const rows = ICO[name], p = new Px(9, 10);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') { p.set(x, y + 1, hi); } }));
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') p.set(x, y, c); }));
  return p;
}
function knobArt(hover) {
  const n = 15, p = new Px(n, n), pal = hover ? GOLD : B;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - 7.5, dy = y + 0.5 - 7.5, r = Math.hypot(dx, dy);
    if (r > 7.4) continue;
    if (r > 6.5) { p.set(x, y, INK); continue; }
    let k = 0.62 - (dx + dy) * 0.045;
    if (r > 5.4) k = 0.5 - (dx + dy) * 0.08;
    p.set(x, y, tone(pal, Math.max(0, Math.min(1, k))));
  }
  // an engraved X
  for (let i = -2; i <= 2; i++) { p.set(7 + i, 7 + i, 0x2a1606); p.set(7 + i, 7 - i, 0x2a1606); p.set(8 + i, 7 + i, pal[8]); }
  return p;
}
function insetArt() {
  const W = 16, p = new Px(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y, W - 1 - x, W - 1 - y), tl = x + y < W - 1;
    if (d === 0 && (x === 0 || x === W - 1) && (y === 0 || y === W - 1)) continue;
    if (d === 0) { p.set(x, y, INK); continue; }
    if (d === 1) { p.set(x, y, tone(B, tl ? 0.85 : 0.35)); continue; }
    if (d === 2) { p.set(x, y, tone(B, tl ? 0.3 : 0.6)); continue; }
    if (d === 3) { p.set(x, y, 0x050302); continue; }
    p.set(x, y, mixC(0x0e0906, 0x1e140c, (y - 4) / 8));
  }
  return p;
}
function tokenArt(dim = false) {
  const n = 11, p = new Px(n, n), pal = dim ? IRON : GOLD;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - 5.5, dy = y + 0.5 - 5.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const R = Math.cos(a * 8) > 0 ? 5.4 : 4.6;
    if (r > R) continue;
    let k = 0.62 - (dx + dy) * 0.05;
    if (r > R - 0.9) k = 0.35;
    if (r < 2.3) k = 0.9 - (dx + dy) * 0.08;
    p.set(x, y, tone(pal, Math.max(0, Math.min(1, k))));
  }
  p.set(5, 4, dim ? IRON[2] : 0x6a3c08); p.set(5, 6, dim ? IRON[2] : 0x6a3c08); p.set(4, 5, dim ? IRON[2] : 0x6a3c08); p.set(6, 5, dim ? IRON[2] : 0x6a3c08);
  p.outline(INK);
  return p;
}
function orArt() {
  const W = 13, H = 7, p = new Px(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { p.set(x, y, INK); continue; }
    p.set(x, y, tone(RUST, y === 1 ? 0.8 : y === H - 2 ? 0.3 : 0.55));
  }
  drawText(p, 'OR', 3, 1, 0xffe0c0, 0x2a0a06);
  return p;
}

// ---------------------------------------------------------------- the watermark (120×120)
function watermark() {
  const n = 120, p = new Px(n, n), c = n / 2;
  const col = 0xe8c890;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    let al = 0;
    const teeth = Math.cos(a * 20) > 0 ? 58 : 53;
    if (r <= teeth && r > 50) al = 120;
    if (r <= 50 && r > 47) al = 60;
    if (r <= 44 && r > 40) al = 110;
    if (r <= 40 && r > 22) {
      // six spokes, the gaps between them open
      const s = Math.abs(((a + Math.PI) % (Math.PI / 3)) - Math.PI / 6);
      if (s * r < 5) al = 100;
      // an engraved ring of dots
      if (Math.abs(r - 34) < 1 && Math.floor((a + Math.PI) * 30) % 3 === 0) al = 140;
    }
    if (r <= 22 && r > 18) al = 120;
    if (al) p.set(x, y, col, al);
  }
  // crossed pick and hammer in the hub
  const bar = (x0, y0, x1, y1, w, al) => {
    const L = Math.hypot(x1 - x0, y1 - y0);
    for (let i = 0; i <= L * 2; i++) {
      const t = i / (L * 2), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      for (let j = -w; j <= w; j++) for (let k = -w; k <= w; k++) if (j * j + k * k <= w * w) p.set(Math.round(x + j), Math.round(y + k), col, al);
    }
  };
  bar(c - 26, c + 26, c + 22, c - 22, 1.5, 150);
  bar(c + 26, c + 26, c - 22, c - 22, 1.5, 150);
  for (let a = -2.4; a <= -0.75; a += 0.02) bar(c + 18 + Math.cos(a) * 20 - 14, c - 18 + Math.sin(a) * 20 + 14, c + 18 + Math.cos(a) * 20 - 14, c - 18 + Math.sin(a) * 20 + 14, 2, 170);
  for (let j = -7; j <= 7; j++) for (let k = -4; k <= 4; k++) { const u = (j + k) / Math.SQRT2, v = (j - k) / Math.SQRT2; p.set(Math.round(c - 22 + u), Math.round(c - 22 + v), col, 170); }
  return p;
}

// ---------------------------------------------------------------- pipes (on the board canvas)
const PIPE = {
  dim: [0x0c0806, 0x22180e, 0x3a2a18, 0x4e3a22, 0x60482c, 0x2a1c10],
  lit: [0x1a0e02, 0x8a5810, 0xe0a42a, 0xffd860, 0xfff2b8, 0x6a3c08],
  pend: [0x1a0802, 0x8a3a0c, 0xe07a24, 0xffb860, 0xffe8c4, 0x6a2a08],
};
/**
 * Paint pipes into an ImageData (art pixels). segs: [{x0, y0, x1, y1, kind, t?}] axis-aligned, kind
 * 'dim' | 'lit' | 'pend'; t (0..1) draws only that much of a segment (the light running along it).
 * joints: [{x, y, kind}] flanges at elbows and tees. Pipes are 5 wide: rim, light, body, shade, rim.
 */
export function paintPipes(img, segs, joints = []) {
  const W = img.width, H = img.height, d = img.data;
  const put = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4, t = a / 255;
    d[i] = d[i] * (1 - t) + ((c >> 16) & 255) * t; d[i + 1] = d[i + 1] * (1 - t) + ((c >> 8) & 255) * t; d[i + 2] = d[i + 2] * (1 - t) + (c & 255) * t;
    d[i + 3] = Math.max(d[i + 3], a);
  };
  const order = { dim: 0, pend: 1, lit: 2 };
  const list = [...segs].sort((a, b) => order[a.kind] - order[b.kind]);
  // glow under lit pipes first
  for (const s of list) {
    if (s.kind === 'dim') continue;
    const g = s.kind === 'lit' ? 0xffc040 : 0xff8a30;
    const [xa, xb] = [Math.min(s.x0, s.x1), Math.max(s.x0, s.x1)], [ya, yb] = [Math.min(s.y0, s.y1), Math.max(s.y0, s.y1)];
    for (let y = ya - 5; y <= yb + 5; y++) for (let x = xa - 5; x <= xb + 5; x++) {
      const dd = Math.max(xa - x, x - xb, ya - y, y - yb, 0) + (s.y0 === s.y1 ? Math.abs(y - s.y0) : Math.abs(x - s.x0));
      if (dd > 2 && dd < 6) put(x, y, g, Math.round(40 * (1 - (dd - 2) / 4)));
    }
  }
  for (const s of list) {
    const P = PIPE[s.kind] || PIPE.dim;
    const horiz = s.y0 === s.y1;
    const len = horiz ? Math.abs(s.x1 - s.x0) : Math.abs(s.y1 - s.y0);
    const dir = horiz ? Math.sign(s.x1 - s.x0) || 1 : Math.sign(s.y1 - s.y0) || 1;
    const n = Math.round(len * (s.t ?? 1));
    for (let i = 0; i <= n; i++) {
      const x = horiz ? s.x0 + i * dir : s.x0, y = horiz ? s.y0 : s.y0 + i * dir;
      const along = horiz ? x : y;
      const band = wrap(along, 12) === 0; // a coupling ring every 12
      for (let j = -2; j <= 2; j++) {
        const c = j === -2 || j === 2 ? P[0] : j === -1 ? (band ? P[4] : P[3]) : j === 0 ? (band ? P[3] : P[2]) : (band ? P[2] : P[5]);
        if (horiz) put(x, y + j, c); else put(x + j, y, c);
      }
      if (band) { if (horiz) { put(x, y - 3, P[0]); put(x, y + 3, P[0]); } else { put(x - 3, y, P[0]); put(x + 3, y, P[0]); } }
    }
  }
  for (const j of joints) {
    const P = PIPE[j.kind] || PIPE.dim;
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const e = Math.max(Math.abs(x), Math.abs(y));
      if (e === 3 && Math.abs(x) === 3 && Math.abs(y) === 3) continue;
      put(j.x + x, j.y + y, e === 3 ? P[0] : x + y < -1 ? P[4] : x + y > 1 ? P[5] : P[2]);
    }
    put(j.x, j.y, P[4]); put(j.x + 1, j.y + 1, P[0]);
  }
}

// ---------------------------------------------------------------- the panel's leather (64×64 tile)
const DARK_LEATHER = [0x0a0604, 0x0e0906, 0x120c08, 0x160f0a, 0x1a120c, 0x1e150e, 0x221810, 0x261b12, 0x2a1e14, 0x2e2216];

// ---------------------------------------------------------------- public
export const SKC = {
  panel: () => art('skc:panel', panelFrame),
  head: () => art('skc:head', headBar),
  medal: () => art('skc:medal', medal),
  frame: (st, tint) => art(`skc:fr:${st}:${tint ?? ''}`, () => nodeFrame(st, tint)),
  gem: (k) => art('skc:gem:' + k, () => gemArt(k)),
  plate: (n, lit, kind) => art(`skc:pl:${n}:${lit}:${kind}`, () => plateArt(n, lit, kind)),
  plateText: (t, kind) => art(`skc:plt:${t}:${kind}`, () => plateText(t, kind)),
  chainA: () => art('skc:chA', () => chainArt(1)),
  chainB: () => art('skc:chB', () => chainArt(-1)),
  lock: (lv) => art('skc:lock:' + (lv || 0), () => lockArt(lv)),
  tab: (on) => art('skc:tab:' + (on ? 1 : 0), () => tabArt(on)),
  btn: (k, dn) => art(`skc:btn:${k}:${dn ? 1 : 0}`, () => btnArt(k, dn), { detail: false, edges: false }),
  ico: (n, c, hi) => art(`skc:ico:${n}:${c ?? ''}:${hi ?? ''}`, () => icoArt(n, c, hi)),
  knob: (h) => art('skc:knob:' + (h ? 1 : 0), () => knobArt(h)),
  inset: () => art('skc:inset', insetArt),
  token: (dim) => art('skc:tok:' + (dim ? 1 : 0), () => tokenArt(dim)),
  orTag: () => art('skc:or', orArt),
  watermark: () => art('skc:wm', watermark),
  leather: () => art('skc:leather', () => leatherTile(64, 64, DARK_LEATHER, { seed: 47, cell: 3.2 })),
};
let installed = false;
/** Publish the fixed pieces as --skc-* custom properties on :root. */
export function installSkillChrome(root = document.documentElement) {
  if (installed) return;
  installed = true;
  const set = (k, u) => { if (u) root.style.setProperty('--skc-' + k, cssUrl(u)); };
  set('panel', SKC.panel()); set('head', SKC.head()); set('medal', SKC.medal()); set('leather', SKC.leather());
  set('wm', SKC.watermark()); set('inset', SKC.inset()); set('knob', SKC.knob(false)); set('knobH', SKC.knob(true));
  set('btn', SKC.btn('brass')); set('btnDn', SKC.btn('brass', true)); set('btnGo', SKC.btn('green')); set('btnGoDn', SKC.btn('green', true)); set('btnOff', SKC.btn('iron'));
  set('tab', SKC.tab(false)); set('tabOn', SKC.tab(true)); set('or', SKC.orTag()); set('tok', SKC.token(false)); set('tokDim', SKC.token(true));
  set('undo', SKC.ico('undo')); set('ok', SKC.ico('ok', 0x0a2a10, 0xd8ffd0)); set('chA', SKC.chainA()); set('chB', SKC.chainB());
}

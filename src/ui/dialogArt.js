// Pixel art for the dialogue box, the talk boards and the level plaque (drawn in code, published as
// CSS custom properties --dl-*). Light from the top-left, 1 art pixel = 1 canvas pixel, shown at --px.
//   installDialogArt()      once: sets every --dl-* on :root
//   DL.spark(i)             a 7×7 sparkle frame (0..2) for bursts
import { Px, PAL, INK, art, mixHex } from './uiArt.js';

const W = PAL.wood, B = PAL.brass;
const WD = { hi: 0xb07a46, lt: 0x8e5c32, base: 0x744826, dk: 0x56341a, dd: 0x3c2210, ol: 0x1e0f06 };

/**
 * The carved board round the dialogue (slice 9): a moulded oak frame, a carved groove, a brass
 * corner bracket with a rivet at each corner. The middle is left clear (CSS fills it).
 */
function boardFrame() {
  const n = 26, S = 9;
  const p = new Px(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.min(x, y, n - 1 - x, n - 1 - y);
    if (d >= S) continue;
    const tl = x + y < n - 1;
    const horiz = Math.min(y, n - 1 - y) <= Math.min(x, n - 1 - x); // on a top/bottom rail: grain runs along x
    const g = horiz ? x : y;
    let c = WD.base;
    if (d === 0) c = WD.ol;
    else if (d === 1) c = tl ? WD.hi : WD.dk;
    else if (d === 2) c = tl ? WD.lt : WD.base;
    else if (d === 4) c = tl ? WD.dd : WD.lt; // the carved groove
    else if (d === 5) c = tl ? WD.lt : WD.dd;
    else if (d === 7) c = tl ? WD.dk : WD.lt;
    else if (d === 8) c = WD.ol; // lip into the panel
    else if ((g * 5 + d * 3) % 9 === 0) c = WD.dk;
    else if ((g * 3 + d * 7) % 11 === 0) c = WD.lt;
    p.set(x, y, c);
  }
  // mitre lines in the corners
  for (let i = 1; i < S; i++) for (const [x, y] of [[i, i], [n - 1 - i, i], [i, n - 1 - i], [n - 1 - i, n - 1 - i]]) if (i !== 4 && i !== 5) p.set(x, y, WD.dd);
  // brass corner brackets (an L of brass over the corner, a boss in the bend)
  const bracket = (fx, fy) => {
    const at = (x, y) => [fx ? n - 1 - x : x, fy ? n - 1 - y : y];
    for (let y = 1; y <= 8; y++) for (let x = 1; x <= 8; x++) {
      const inL = x <= 4 || y <= 4;
      if (!inL) continue;
      const [px, py] = at(x, y);
      const edge = x === 1 || y === 1 || (x === 8 && y <= 4) || (y === 8 && x <= 4) || (x === 4 && y > 4) || (y === 4 && x > 4);
      let c = B.base;
      if (edge) c = B.dd;
      else if ((fx ? 0 : 1) + (fy ? 0 : 1) >= 1 && (x === 2 || y === 2)) c = !fx && !fy ? B.hi : B.lt;
      else if (x === 3 && y === 3) c = B.lt;
      p.set(px, py, c);
    }
    const [bx, by] = at(2.5, 2.5);
    p.set(bx, by, B.hi);
    const [rx, ry] = at(6, 2), [qx, qy] = at(2, 6);
    p.set(rx, ry, B.hi); p.set(qx, qy, B.hi);
  };
  bracket(false, false); bracket(true, false); bracket(false, true); bracket(true, true);
  p.outline(INK);
  return p;
}

/** The parchment sunk into the board (slice 6): a burnt rim, shadow under the frame's lip. */
function parchFrame() {
  const P = PAL.paper;
  const n = 18, S = 6;
  const p = new Px(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.min(x, y, n - 1 - x, n - 1 - y);
    let c = P.base;
    if (d === 0) c = P.edge;
    else if (d === 1) c = y < 2 || x < 2 ? 0x8a6038 : P.burn;
    else if (d === 2) c = y < 3 ? P.dk : (x + y) % 3 ? P.mid : P.dk;
    else if (d === 3) c = y < 4 ? P.mid : P.base;
    else if (d < S) c = (x * 7 + y * 5) % 13 === 0 ? P.mid : P.base;
    else c = P.base;
    p.set(x, y, c);
  }
  for (const [x, y] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]]) p.clear(x, y);
  return p;
}

/** The portrait's ornate frame (slice 6): brass bevels round a dark walnut moulding, bosses at the corners. */
function portraitFrame() {
  const n = 18, S = 6;
  const p = new Px(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.min(x, y, n - 1 - x, n - 1 - y);
    if (d >= S) continue;
    const tl = x + y < n - 1;
    let c;
    if (d === 0) c = B.ol;
    else if (d === 1) c = tl ? B.hi : B.dk;
    else if (d === 2) c = tl ? B.lt : B.base;
    else if (d === 3) c = tl ? 0x2a160c : 0x4a2a14;
    else if (d === 4) c = tl ? B.dk : B.hi;
    else c = 0x0c0608;
    // a beaded line on the brass
    if (d === 2 && (x + y) % 3 === 0) c = tl ? B.hi : B.lt;
    p.set(x, y, c);
  }
  const boss = (cx, cy) => { p.disk(cx, cy, 2.9, B.ol); p.disk(cx, cy, 2.3, B.dk); p.disk(cx - 0.4, cy - 0.4, 1.6, B.base); p.set(Math.floor(cx - 1), Math.floor(cy - 1), B.hi); p.set(Math.floor(cx), Math.floor(cy - 1), B.lt); };
  boss(3, 3); boss(n - 3, 3); boss(3, n - 3); boss(n - 3, n - 3);
  return p;
}

/**
 * The name plate: a red ribbon with gold trim whose ends fold back into swallowtails (3-slice:
 * 10 | 4 | 10, 16 rows).
 */
function ribbon(R = PAL.oxblood, trim = B) {
  const w = 24, h = 16;
  const p = new Px(w, h);
  // folded-back tails (behind, lower, darker)
  for (const side of [0, 1]) {
    for (let y = 4; y < 15; y++) for (let x = 0; x < 7; x++) {
      const notch = Math.abs(y - 9.5) < (6 - x) * 0.7 && x < 4; // the swallowtail cut
      if (notch) continue;
      const xx = side ? w - 1 - x : x;
      p.set(xx, y, y === 4 || y === 14 ? R.dd : x === 6 ? R.dd : R.dk);
    }
  }
  // the band
  for (let y = 1; y < 13; y++) for (let x = 3; x < w - 3; x++) {
    let c = R.base;
    if (y === 1) c = R.hi; else if (y === 2) c = trim.lt; else if (y === 3) c = R.lt;
    else if (y === 10) c = R.dk; else if (y === 11) c = trim.dk; else if (y === 12) c = R.dd;
    else if ((x * 3 + y) % 7 === 0) c = mixHex(R.base, R.lt, 0.5);
    p.set(x, y, c);
  }
  // the fold where the band meets the tail
  for (let y = 4; y < 13; y++) { p.set(3, y, R.dd); p.set(w - 4, y, R.dd); }
  p.outline(INK);
  return p;
}

/** A small brass arrow pointing down (the "carry on" mark): 11×9. */
function arrow() {
  const p = new Px(11, 9);
  p.poly([[1, 1], [10, 1], [5.5, 8]], B.base);
  p.hl(1, 9, 1, B.hi); p.hl(2, 8, 2, B.lt);
  p.line(5, 7, 9, 2, B.dk);
  p.set(4, 3, B.hi);
  p.outline(INK);
  return p;
}

/** A quill feather for "still writing" (12×12). */
function quill() {
  const p = new Px(13, 13);
  for (let i = 0; i < 9; i++) { p.set(3 + i, 9 - i, 0xf4eee0); p.set(4 + i, 9 - i, 0xd8d0c0); p.set(3 + i, 8 - i, i > 1 ? 0xffffff : 0xe8e0d0); }
  p.line(1, 11, 4, 8, 0x3a2a1a);
  p.set(1, 11, 0x111111);
  p.outline(INK);
  return p;
}

// ------------------------------------------------------------------ the level plaque
/** Carved wooden plaque (slice 7): bevelled oak, a groove, brass studs at the corners. */
function plaqueFrame() {
  const n = 20, S = 7;
  const p = new Px(n, n);
  p.rr(0, 0, n, n, 2, WD.base);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!p.a(x, y)) continue;
    const d = Math.min(x, y, n - 1 - x, n - 1 - y);
    const tl = x + y < n - 1;
    let c = (x * 5 + y * 3) % 7 === 0 ? WD.dk : WD.base;
    if (d === 1) c = tl ? WD.hi : WD.dk;
    else if (d === 3) c = tl ? WD.dd : WD.lt;
    else if (d === 4) c = tl ? WD.lt : WD.dd;
    else if (d >= S) c = (x + y * 2) % 5 === 0 ? 0x5e3a1e : 0x6a4222;
    p.set(x, y, c);
  }
  for (const [x, y] of [[2, 2], [n - 4, 2], [2, n - 4], [n - 4, n - 4]]) { p.set(x, y, B.hi); p.set(x + 1, y, B.base); p.set(x, y + 1, B.base); p.set(x + 1, y + 1, B.dd); }
  p.outline(INK);
  return p;
}

/** The XP tube's brass rim (slice 3, 10×10; the middle is the dark glass). */
function tubeFrame() {
  const n = 10;
  const p = new Px(n, n);
  p.rr(0, 0, n, n, 2, B.base);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!p.a(x, y)) continue;
    const d = Math.min(x, y, n - 1 - x, n - 1 - y);
    let c = B.base;
    if (d === 0) c = B.ol;
    else if (d === 1) c = y < n / 2 ? B.hi : B.dk;
    else if (d === 2) c = y < n / 2 ? B.lt : B.dd;
    else c = 0x1a0e0a;
    p.set(x, y, c);
  }
  return p;
}

/** The brass medallion ring an emblem sits in (n×n: 21 for the plaque's seal, 31 for the big one). */
function medalRing(n = 21) {
  const p = new Px(n, n);
  const c = n / 2, R = n / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    if (d > R - 0.1) continue;
    const ang = Math.atan2(y + 0.5 - c, x + 0.5 - c);
    const lit = Math.cos(ang + 2.36) > 0;
    if (d > R - 1) p.set(x, y, B.ol);
    else if (d > R - 2.1) p.set(x, y, lit ? B.hi : B.dk);
    else if (d > R - 3.1) p.set(x, y, (Math.round(ang * (n / 3.5)) & 1) ? B.lt : B.base); // milled edge
    else if (d > R - 3.8) p.set(x, y, B.dd);
  }
  return p;
}

/** A sparkle (7×7), three frames. */
function spark(i) {
  const p = new Px(7, 7);
  const Y = [0xffffff, 0xfff3c0, 0xf2c23a];
  if (i === 0) { p.set(3, 3, Y[0]); p.set(3, 2, Y[1]); p.set(3, 4, Y[1]); p.set(2, 3, Y[1]); p.set(4, 3, Y[1]); }
  else if (i === 1) { p.vl(3, 0, 6, Y[1]); p.hl(0, 6, 3, Y[1]); p.set(3, 3, Y[0]); p.set(2, 2, Y[2]); p.set(4, 4, Y[2]); p.set(4, 2, Y[2]); p.set(2, 4, Y[2]); }
  else { p.set(3, 0, Y[2]); p.set(3, 6, Y[2]); p.set(0, 3, Y[2]); p.set(6, 3, Y[2]); p.set(3, 3, Y[1]); }
  return p;
}

/** A tiny brass star for the plaque's level number (9×9). */
function star() {
  const p = new Px(9, 9);
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 1.9 : 4.3; pts.push([4.5 + Math.cos(a) * r, 4.6 + Math.sin(a) * r]); }
  p.poly(pts, B.lt);
  p.set(3, 3, B.hi); p.set(4, 2, B.hi);
  p.outline(B.ol);
  return p;
}

/** A little speech-bubble emote (13×13) that pops by the portrait when the speaker's face changes. */
function emote(kind) {
  const p = new Px(13, 13);
  p.rr(0, 0, 13, 10, 3, 0xfffaf0);
  p.poly([[2, 9], [6, 9], [1, 12.5]], 0xfffaf0);
  p.hl(2, 10, 8, 0xe8dcc4);
  const R = 0xc23c2c, Y = 0xe8a020, Bl = 0x3f7ec8, K = 0x2a1a12, G = 0x5a9a3a;
  if (kind === 'happy') { p.vl(7, 2, 6, K); p.hl(8, 9, 2, K); p.set(9, 3, K); p.rect(5, 6, 2, 2, K); p.set(5, 5, K); } // ♪
  else if (kind === 'laugh') { for (const [x, y] of [[3, 3], [6, 2], [9, 4], [4, 6], [8, 6]]) { p.set(x, y, Y); p.set(x + 1, y, 0xffe08a); } }
  else if (kind === 'surprised') { p.vl(6, 2, 5, R); p.vl(7, 2, 5, R); p.rect(6, 7, 2, 1, R); }
  else if (kind === 'thinking') { p.hl(5, 7, 2, Bl); p.set(8, 3, Bl); p.set(7, 4, Bl); p.set(6, 5, Bl); p.set(6, 7, Bl); p.set(4, 3, Bl); }
  else if (kind === 'worried') { p.disk(6.5, 5.5, 1.8, 0x7fc0f0); p.set(6, 2, 0x7fc0f0); p.set(6, 3, 0x7fc0f0); p.set(5, 5, 0xffffff); }
  else if (kind === 'stern' || kind === 'angry') { for (const [x, y] of [[4, 2], [8, 2], [4, 6], [8, 6]]) { p.set(x, y, R); } p.hl(5, 7, 3, R); p.hl(5, 7, 5, R); p.vl(5, 3, 5, R); p.vl(7, 3, 5, R); p.clear(6, 4); p.set(6, 4, 0xfffaf0); }
  else if (kind === 'proud' || kind === 'smug') { p.poly([[6.5, 1], [7.6, 3.6], [10.4, 3.8], [8.2, 5.6], [9, 8.4], [6.5, 6.8], [4, 8.4], [4.8, 5.6], [2.6, 3.8], [5.4, 3.6]], Y); p.set(6, 3, 0xfff3c0); }
  else if (kind === 'sad') { p.hl(4, 8, 6, Bl); p.set(3, 7, Bl); p.set(9, 7, Bl); p.set(5, 3, K); p.set(8, 3, K); }
  else if (kind === 'heart') { p.disk(5, 4, 1.6, R); p.disk(8, 4, 1.6, R); p.poly([[3.4, 4.6], [9.6, 4.6], [6.5, 8]], R); }
  else { p.hl(4, 4, 5, K); p.hl(6, 6, 5, K); p.hl(8, 8, 5, K); void G; }
  p.outline(INK);
  return p;
}

const ASSETS = {
  board: boardFrame,
  parch: parchFrame,
  pframe: portraitFrame,
  ribbon: () => ribbon(),
  ribbonGreen: () => ribbon({ hi: 0x9acb5a, lt: 0x6f9c3e, base: 0x3f6a2a, dk: 0x2e5020, dd: 0x1e3414 }),
  ribbonBlue: () => ribbon({ hi: 0x8eaad2, lt: 0x5a76a0, base: 0x3a5272, dk: 0x2a3c56, dd: 0x1a2638 }),
  arrow,
  quill,
  plaque: plaqueFrame,
  tube: tubeFrame,
  medal: () => medalRing(21),
  medalBig: () => medalRing(31),
  spark0: () => spark(0),
  spark1: () => spark(1),
  spark2: () => spark(2),
  star,
  emHappy: () => emote('happy'),
  emLaugh: () => emote('laugh'),
  emSurprised: () => emote('surprised'),
  emThinking: () => emote('thinking'),
  emWorried: () => emote('worried'),
  emStern: () => emote('stern'),
  emProud: () => emote('proud'),
  emSad: () => emote('sad'),
};

export const DL = Object.fromEntries(Object.keys(ASSETS).map((k) => [k, () => art('dl:' + k, ASSETS[k])]));
DL.spark = (i) => DL['spark' + (i % 3)]();

let installed = false;
export function installDialogArt(root = document.documentElement) {
  if (installed) return;
  installed = true;
  for (const k of Object.keys(ASSETS)) root.style.setProperty('--dl-' + k, `url("${DL[k]()}")`);
}

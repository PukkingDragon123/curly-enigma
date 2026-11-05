// Pixel art for the dialogue box, the talk boards and the level plaque (drawn in code, published as
// CSS custom properties --dl-*). Light from the top-left, 1 art pixel = 1 canvas pixel, shown at --px.
//   installDialogArt()      once: sets every --dl-* on :root
//   DL.spark(i)             a 7×7 sparkle frame (0..2) for bursts
import { Px, PAL, INK, art, mixHex } from './uiArt.js';
import * as CA from './craftArt.js';

const B = PAL.brass;

/**
 * The carved board round the dialogue (slice 9 on 50): an oak frame with a rounded lip, a carved
 * groove and a bevel down into the panel, grain running along each rail (on the middle's period, so
 * the rails tile), mitred corners, and an engraved brass bracket over each corner: an L with a boss
 * in the bend and a rivet at the end of each arm.
 */
function boardFrame() {
  const s = 9, M = 32, n = s * 2 + M, T = CA.TONES.oak, BR = CA.TONES.brass;
  const p = new Px(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const { u, d, tl } = CA.edgeOf(x, y, n, n);
    if (d >= s) continue;
    const uu = ((u - s) % M + M) % M, lit = tl ? 1 : -1;
    const wave = (CA.pnoise((uu * 4) / M, d * 0.5 + (tl ? 0 : 7), 4, 32, 61) - 0.5) * 3.4;
    const ring = (((d + wave) / 2.4) % 1 + 1) % 1;
    let k = 0.52 + (CA.pnoise((uu * 8) / M, d * 0.3, 8, 16, 62) - 0.5) * 0.22;
    if (ring < 0.26) k -= 0.18; else if (ring > 0.82) k += 0.05;
    if (CA.hash(uu >> 1, d * 5 + (tl ? 0 : 2), 63) < 0.06) k -= 0.12;
    if (d === 0) { p.set(x, y, T[0]); continue; }
    if (d === 1) k += 0.3 * lit;
    else if (d === 2) k += 0.14 * lit;
    else if (d === 4) k -= 0.26 * lit; // the carved groove
    else if (d === 5) k += 0.16 * lit;
    else if (d === 7) k -= 0.14 * lit; // the bevel down into the panel
    else if (d === 8) { p.set(x, y, T[0]); continue; }
    p.set(x, y, CA.quant(T, k, x, y, 0.3));
  }
  // mitres
  for (let i = 1; i < s - 1; i++) for (const [x, y] of [[i, i], [n - 1 - i, i], [i, n - 1 - i], [n - 1 - i, n - 1 - i]]) p.set(x, y, T[1]);
  // brass corner brackets: a flat L, bevelled, an engraved line following it, a boss and two rivets
  const bracket = (fx, fy) => {
    const at = (x, y) => [fx ? n - 1 - x : x, fy ? n - 1 - y : y];
    const corner = !fx && !fy ? 1 : fx && fy ? -1 : 0;
    // (it must stay inside the 9-px corner slice, outline included, or bits of it repeat along the rails)
    const L = (x, y) => (x >= 1 && x <= 4 && y >= 1 && y <= 7) || (y >= 1 && y <= 4 && x >= 1 && x <= 7);
    for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
      if (!L(x, y)) continue;
      const [px, py] = at(x, y);
      // which way this pixel's nearest outside faces decides its bevel: up/left lit, down/right dark
      const up = !L(x, y - 1) || !L(x - 1, y), dn = !L(x, y + 1) || !L(x + 1, y);
      const fUp = fy ? dn : up, fDn = fy ? up : dn; // flipped brackets keep the light from the top-left
      const lUp = fx ? (!L(x + 1, y) && !fy ? false : fUp) : fUp;
      let c = BR[5];
      if (lUp && !fDn) c = BR[corner > 0 ? 8 : 7];
      else if (fDn) c = BR[2];
      else if ((x === 2 && y >= 2 && y <= 6) || (y === 2 && x >= 2 && x <= 6)) c = BR[3]; // engraved line
      else if ((x === 3 && y >= 3 && y <= 6) || (y === 3 && x >= 3 && x <= 6)) c = BR[6];
      p.set(px, py, c);
    }
    const dot = (x, y) => { const [a, b] = at(x, y), [c2, d2] = at(x + 1, y + 1); p.set(a, b, BR[9]); p.set(c2, d2, BR[1]); const [e, f] = at(x + 1, y), [g, h] = at(x, y + 1); p.set(e, f, BR[5]); p.set(g, h, BR[5]); };
    dot(2, 2); dot(5, 2); dot(2, 5);
    // outline round the bracket
    for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) if (!L(x, y) && (L(x + 1, y) || L(x - 1, y) || L(x, y + 1) || L(x, y - 1))) { const [px, py] = at(x, y); if (px > 0 && py > 0 && px < n - 1 && py < n - 1) p.set(px, py, BR[0]); }
  };
  bracket(false, false); bracket(true, false); bracket(false, true); bracket(true, true);
  p.outline(INK);
  return p;
}

/** The parchment sunk into the board (slice 6 on 36): a gently deckled, scorched rim, fibres, foxing. */
function parchFrame() {
  return CA.parchFrame(false, { slice: 6, mid: 24, seed: 71, tear: 0.45, bites: false, burn: 1.6 });
}

/**
 * The portrait's ornate frame (slice 6 on 28): a brass bevel with a beaded row, a dark walnut
 * moulding, an inner brass slip, domed bosses at the corners.
 */
function portraitFrame() {
  const n = 28, S = 6, BR = CA.TONES.brass;
  const p = new Px(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const { u, d, tl } = CA.edgeOf(x, y, n, n);
    if (d >= S) continue;
    const lit = tl ? 1 : -1, uu = ((u - S) % 16 + 16) % 16;
    let c;
    if (d === 0) c = BR[0];
    else if (d === 1) c = CA.quant(BR, 0.66 + 0.26 * lit + (CA.hash(uu, 1, 66) - 0.5) * 0.08, x, y, 0.3);
    else if (d === 2) c = uu % 2 === 0 ? BR[tl ? 8 : 5] : BR[tl ? 4 : 2]; // the beading
    else if (d === 3) c = CA.quant(CA.TONES.woodDk, 0.4 - 0.18 * lit + (CA.pnoise(uu / 4, 0, 4, 2, 67) - 0.5) * 0.2, x, y, 0.3);
    else if (d === 4) c = BR[tl ? 3 : 7];
    else c = 0x0c0608;
    p.set(x, y, c);
  }
  const boss = (cx, cy) => { CA.rivet(p, cx, cy, BR, 2.1); };
  boss(3, 3); boss(n - 3, 3); boss(3, n - 3); boss(n - 3, n - 3);
  return p;
}

/**
 * The name plate: a satin ribbon with stitched gold trim whose ends fold back into swallowtails
 * (3-slice: 10 | 16 | 10, 16 rows; the middle tiles).
 */
function ribbon(R = PAL.oxblood) {
  const w = 36, h = 16, M = 16;
  const p = new Px(w, h);
  const TR = CA.TONES.brass;
  const band = [R.dd, R.dk, R.base, R.lt, R.hi];
  // the folded-back tails (behind, lower, darker), with a swallowtail notch
  for (const side of [0, 1]) {
    for (let y = 4; y < 15; y++) for (let x = 0; x < 8; x++) {
      if (Math.abs(y - 9.5) < (5 - x) * 0.9 && x < 5) continue;
      const xx = side ? w - 1 - x : x;
      let c = y === 4 || y === 14 ? R.dd : x >= 6 ? R.dd : (x + y) % 3 === 0 ? mixHex(R.dk, R.dd, 0.5) : R.dk;
      if (y === 5 && x < 6) c = mixHex(R.dk, R.base, 0.5);
      p.set(xx, y, c);
    }
  }
  // the band: satin sheen across its width, a twill weave on the middle's period, stitched trim
  for (let y = 1; y < 13; y++) for (let x = 3; x < w - 3; x++) {
    const ux = ((x - 10) % M + M) % M;
    let c;
    if (y === 1) c = R.hi;
    else if (y === 2) c = ux % 3 === 1 ? TR[9] : TR[7]; // gold trim, stitched
    else if (y === 3) c = TR[4];
    else if (y === 10) c = TR[3];
    else if (y === 11) c = ux % 3 === 1 ? TR[6] : TR[2];
    else if (y === 12) c = R.dd;
    else {
      const sheen = [0, 0, 0, 0, 3, 4, 3, 2, 2, 1][y]; // the satin catches the light high up
      let k = sheen;
      if (y > 6 && (ux + y) % 4 === 0) k = Math.max(0, k - 1); // the twill
      c = band[Math.min(band.length - 1, k)];
    }
    p.set(x, y, c);
  }
  // the fold where the band turns under into the tail
  for (let y = 4; y < 13; y++) { p.set(3, y, R.dd); p.set(w - 4, y, R.dd); p.set(4, y, mixHex(p.get(4, y), R.dd, 0.4)); p.set(w - 5, y, mixHex(p.get(w - 5, y), R.dd, 0.4)); }
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
/**
 * Carved wooden plaque (slice 7 on 30; the middle tiles, for `fill`): bevelled oak with its grain, a
 * routed groove, a brass stud in each corner.
 */
function plaqueFrame() {
  const n = 30, S = 7, M = 16, T = CA.TONES.oak;
  const p = new Px(n, n);
  const F = CA.woodField(M, M, { seed: 68, base: 0.5, knots: 0, wave: 3, spacing: 3.2, pores: 0, noise: 0.02 });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const cx = Math.min(x, n - 1 - x), cy = Math.min(y, n - 1 - y);
    if (cx + cy < 2) continue;
    const d = Math.min(cx, cy), tl = (cx === x && cx <= cy) || (cy === y && cy <= cx);
    let k = F.K[(((y - S) % M + M) % M) * M + (((x - S) % M + M) % M)];
    if (d === 0) { p.set(x, y, T[0]); continue; }
    if (d === 1) k += tl ? 0.28 : -0.22;
    else if (d === 2) k += tl ? 0.12 : -0.1;
    else if (d === 3) k += tl ? -0.26 : 0.16;
    else if (d === 4) k += tl ? 0.12 : -0.08;
    p.set(x, y, CA.quant(T, k, x, y, 0.3));
  }
  for (const [x, y] of [[3, 3], [n - 3, 3], [3, n - 3], [n - 3, n - 3]]) CA.rivet(p, x, y, CA.TONES.brass, 1.2);
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

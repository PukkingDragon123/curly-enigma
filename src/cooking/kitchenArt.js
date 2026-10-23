// Pixel sprites for the cooking scene's 2D interface (the pantry cupboard, the recipe box, the pot,
// the Cook! bell, the kitchen timer, the step stamps and the grade rosettes). Same rules as
// ui/uiArt.js: 1 art pixel = 1 canvas pixel, shown at an integer multiple of --px, light from the
// top-left. Every sprite is cached as a data URL (KART.*); installKitchenArt() publishes the ones
// the stylesheet uses as --a-ck-* custom properties.
import { Px, PAL, INK, art, mixHex } from '../ui/uiArt.js';

const W = PAL.wood, B = PAL.brass, P = PAL.paper;
const STRAW = { hi: 0xf6d898, lt: 0xe2b66a, base: 0xc8924a, dk: 0x9a6830, dd: 0x6a4420, ol: 0x3a2410 };
const COPPER = { hi: 0xffd2a0, lt: 0xf09a5a, base: 0xc86a34, dk: 0x8e4422, dd: 0x5a2814, ol: 0x2a1008 };
const IRON = { hi: 0x8a8a90, lt: 0x5e5e66, base: 0x46464e, dk: 0x2e2e34, dd: 0x1c1c22 };

// ---------------------------------------------------------------- pantry containers (30×30)
/** Wicker basket. layer 'back' = the handle and the dark inside, 'front' = the woven body. */
function basket(layer) {
  const p = new Px(30, 30);
  if (layer === 'back') {
    // handle arc behind the goods
    for (let a = 0; a <= 40; a++) {
      const t = (a / 40) * Math.PI;
      const x = 15 + Math.cos(t) * 11, y = 17 - Math.sin(t) * 13;
      p.set(Math.round(x), Math.round(y), STRAW.base);
      p.set(Math.round(x), Math.round(y) + 1, STRAW.dk);
      if (a % 5 === 0) p.set(Math.round(x), Math.round(y), STRAW.hi);
    }
    // the inside of the basket, seen over the front rim
    p.ellipse(15, 17.5, 13, 2.6, STRAW.dd);
    p.outline(STRAW.ol);
    return p;
  }
  // body: wider at the rim, rows 16..29
  for (let y = 16; y <= 29; y++) {
    const inset = Math.floor((y - 16) / 5);
    for (let x = 1 + inset; x <= 28 - inset; x++) {
      const row = y - 16;
      let c = ((x + (row >> 1) * 2) % 4 < 2) ? STRAW.lt : STRAW.base;
      if (row % 2 === 1 && (x + row) % 4 === 0) c = STRAW.dk;
      if (x - inset <= 2) c = mixHex(c, STRAW.hi, 0.35);
      if (28 - inset - x <= 1) c = mixHex(c, STRAW.dd, 0.4);
      p.set(x, y, c);
    }
  }
  // rolled rim with a twist
  for (let x = 1; x <= 28; x++) {
    p.set(x, 16, (x % 3 === 0) ? STRAW.dk : STRAW.hi);
    p.set(x, 17, (x % 3 === 1) ? STRAW.dk : STRAW.lt);
  }
  p.hl(4, 25, 29, STRAW.dd);
  p.outline(STRAW.ol);
  return p;
}

/** Little slatted crate (critters). */
function crate(layer) {
  const p = new Px(30, 30);
  if (layer === 'back') {
    // the back slat, seen over the front
    p.rect(2, 13, 26, 4, W.dk);
    p.hl(2, 27, 13, W.base);
    p.rect(3, 16, 24, 1, W.dd);
    p.outline(W.ol);
    return p;
  }
  p.rect(1, 17, 28, 12, W.base);
  // three slats with gaps
  for (const [y0, h] of [[17, 3], [21, 3], [25, 4]]) {
    p.hl(1, 28, y0, W.hi);
    for (let y = y0 + 1; y < y0 + h; y++) for (let x = 1; x <= 28; x++) p.set(x, y, (x * 7 + y * 3) % 11 === 0 ? W.dk : W.lt);
    p.hl(1, 28, y0 + h - 1, W.dk);
  }
  p.hl(1, 28, 20, W.dd); p.hl(1, 28, 24, W.dd);
  // corner posts and nails
  p.rect(1, 17, 3, 12, W.dk); p.vl(1, 17, 28, W.lt);
  p.rect(26, 17, 3, 12, W.dk); p.vl(28, 17, 28, W.dd);
  for (const [x, y] of [[2, 18], [27, 18], [2, 26], [27, 26]]) { p.set(x, y, B.lt); p.set(x, y + 1, B.dd); }
  p.outline(W.ol);
  return p;
}

/** Glass jar with a cork. 'back' = tinted glass and the lid, 'front' = shine and the label. */
function jar(layer) {
  const p = new Px(30, 30);
  const glass = 0xbfe0d8, glassDk = 0x5a8a84;
  if (layer === 'back') {
    p.rr(3, 5, 24, 25, 5, glass, 70);
    p.rect(8, 3, 14, 3, glassDk, 120);
    // cork
    p.rect(9, 0, 12, 4, 0xb88a56);
    p.hl(9, 20, 0, 0xd8aa76); p.hl(9, 20, 3, 0x8a6036);
    for (const x of [11, 15, 18]) p.set(x, 1, 0x8a6036);
    return p;
  }
  // glass edge
  const g = new Px(30, 30);
  g.rr(3, 5, 24, 25, 5, glass);
  const D = g.dist(2);
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
    const d = D(x, y);
    if (d === 1) p.set(x, y, x < 15 ? 0xe8fff8 : glassDk, 220);
  }
  // shine
  p.vl(6, 9, 22, 0xffffff, 170); p.vl(7, 9, 13, 0xffffff, 120);
  p.vl(23, 10, 24, 0xffffff, 60);
  // neck ring
  p.hl(8, 21, 5, glassDk, 200); p.hl(8, 21, 6, 0xe8fff8, 160);
  // paper label tied on
  p.rect(9, 22, 12, 5, P.base); p.hl(9, 20, 22, P.hi); p.hl(9, 20, 26, P.dk);
  p.hl(11, 18, 24, 0x8a6a4a);
  p.set(8, 22, 0xa8875a); p.set(21, 22, 0xa8875a);
  // cork outline over the lid
  p.box(8, 0, 14, 5, INK);
  p.clear(8, 0); p.clear(21, 0);
  const o = new Px(30, 30);
  o.rr(3, 5, 24, 25, 5, glass);
  o.outline(INK);
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) if (o.a(x, y) && o.get(x, y) === INK) p.set(x, y, INK);
  return p;
}

// ---------------------------------------------------------------- the pot (120×44)
export const POT_W = 120, POT_H = 44;
/** Copper stock pot. 'back' = the far rim and the broth (water when empty), 'front' = the body. */
function pot(layer, full = false) {
  const p = new Px(POT_W, POT_H);
  const cx = POT_W / 2 - 0.5, ry = 9, rx = 54, top = 12;
  if (layer === 'back') {
    p.ellipse(cx, top, rx, ry, COPPER.dk);
    p.ellipse(cx, top, rx - 2, ry - 1.6, COPPER.dd);
    const L = full ? { a: 0xe0a04a, b: 0xc8843a, c: 0xf2c46a, d: 0xa86a2a } : { a: 0x8ac0d0, b: 0x6aa0b8, c: 0xc8eef4, d: 0x4a7a94 };
    p.ellipse(cx, top + 1.5, rx - 4, ry - 2.8, L.b);
    p.each((x, y, c) => {
      if (c !== L.b) return undefined;
      if ((x * 5 + y * 13) % 17 === 0) return L.c;
      if (y < top) return L.a;
      if ((x + y * 3) % 11 === 0) return L.d;
      return undefined;
    });
    // far rim highlight
    for (let x = Math.ceil(cx - rx + 3); x <= Math.floor(cx + rx - 3); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const y = Math.round(top - Math.sqrt(Math.max(0, 1 - dx * dx)) * ry);
      p.set(x, y, COPPER.lt); p.set(x, y + 1, COPPER.base);
    }
    p.outline(COPPER.ol);
    return p;
  }
  // body: the front half of the rim downwards
  const body = new Px(POT_W, POT_H);
  for (let y = top; y < POT_H; y++) for (let x = 0; x < POT_W; x++) {
    const dx = (x + 0.5 - cx) / rx;
    if (Math.abs(dx) > 1) continue;
    const yr = top + Math.sqrt(1 - dx * dx) * ry; // rim front edge
    const yb = 37 + Math.sqrt(1 - dx * dx) * 5; // bottom edge
    if (y >= yr - 2.2 && y <= yb) body.set(x, y, COPPER.base);
  }
  body.each((x, y) => {
    const dx = (x + 0.5 - cx) / rx;
    const yr = top + Math.sqrt(Math.max(0, 1 - dx * dx)) * ry;
    if (y < yr + 0.6) return dx < -0.2 ? COPPER.hi : COPPER.lt; // the lip
    if (y < yr + 1.8) return COPPER.dk;
    // cylinder shading, light from the left
    if (dx < -0.88) return COPPER.dk;
    if (dx < -0.62) return COPPER.lt;
    if (dx < -0.48) return (y % 3 === 0) ? COPPER.hi : COPPER.lt;
    if (dx > 0.84) return COPPER.dd;
    if (dx > 0.58) return COPPER.dk;
    if ((x * 7 + y * 3) % 23 === 0) return COPPER.lt;
    return COPPER.base;
  });
  p.blit(body);
  // a band with rivets
  for (let x = 0; x < POT_W; x++) {
    const dx = (x + 0.5 - cx) / rx;
    if (Math.abs(dx) > 0.98) continue;
    const y = Math.round(top + Math.sqrt(1 - dx * dx) * ry + 8);
    if (!p.a(x, y)) continue;
    p.set(x, y, Math.abs(dx) > 0.7 ? COPPER.dd : COPPER.dk);
    p.set(x, y + 1, Math.abs(dx) > 0.7 ? COPPER.dk : COPPER.lt);
    if (x % 10 === 4 && Math.abs(dx) < 0.85) { p.set(x, y - 1, COPPER.hi); }
  }
  // handles
  for (const s of [-1, 1]) {
    const hx = s < 0 ? 0 : POT_W - 6;
    p.rect(hx, 20, 6, 3, IRON.base);
    p.hl(hx, hx + 5, 20, IRON.hi); p.hl(hx, hx + 5, 22, IRON.dd);
    p.rect(s < 0 ? hx : hx + 4, 18, 2, 7, IRON.dk);
  }
  p.outline(COPPER.ol);
  // the lip's top edge is open (the broth shows through): clear the outline above the lip
  for (let x = 0; x < POT_W; x++) {
    const dx = (x + 0.5 - cx) / rx;
    if (Math.abs(dx) > 0.97) continue;
    const yr = top + Math.sqrt(1 - dx * dx) * ry;
    const y = Math.floor(yr - 3.2);
    if (p.a(x, y) && p.get(x, y) === COPPER.ol) p.clear(x, y);
  }
  return p;
}

/** Iron trivet the pot stands on, with a glowing burner under it (128×10). */
function stove() {
  const p = new Px(128, 10);
  p.ellipse(64, 5, 56, 4.4, 0x1a0e08, 200);
  p.ellipse(64, 5, 42, 2.6, 0xff8a3a, 120);
  p.ellipse(64, 5, 24, 1.6, 0xffd27a, 150);
  for (let x = 12; x <= 116; x += 8) { p.vl(x, 3, 8, IRON.dk); p.set(x, 3, IRON.lt); }
  p.hl(10, 118, 8, IRON.base); p.hl(10, 118, 9, IRON.dd);
  return p;
}

/** A faint ring on the broth: an empty spot for one more ingredient (12×5). */
function slotRing() {
  const p = new Px(12, 5);
  for (let a = 0; a < 28; a++) {
    const t = (a / 28) * Math.PI * 2;
    if (a % 4 === 3) continue;
    p.set(Math.round(5.5 + Math.cos(t) * 5.4), Math.round(2 + Math.sin(t) * 2), 0xfff4d8, 190);
  }
  return p;
}

// ---------------------------------------------------------------- the Cook! bell (36×30)
function bell(down = false) {
  const p = new Px(36, 30);
  const oy = down ? 2 : 0;
  // wooden base
  p.rr(2, 22, 32, 8, 2, W.base);
  p.hl(3, 32, 22, W.hi); p.hl(3, 32, 23, W.lt);
  p.hl(3, 32, 28, W.dk); p.hl(3, 32, 29, W.dd);
  p.vl(33, 23, 28, W.dk);
  // dome
  const cx = 17.5, cy = 22;
  for (let y = 7 + oy; y <= 22; y++) for (let x = 3; x <= 32; x++) {
    const nx = (x + 0.5 - cx) / 13.5, ny = (y + 0.5 - cy) / (14.5 - oy);
    if (nx * nx + ny * ny > 1 || y > 21) continue;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const l = -nx * 0.55 - ny * 0.5 + nz * 0.6;
    let c = l > 0.95 ? B.hi : l > 0.65 ? B.lt : l > 0.3 ? B.base : l > 0 ? B.dk : B.dd;
    if (Math.hypot(nx + 0.38, ny + 0.55) < 0.16) c = 0xffffff;
    p.set(x, y, c);
  }
  // rim
  p.hl(4, 31, 21, B.dk); p.hl(5, 30, 20, B.lt);
  // plunger
  p.rect(16, 3 + oy * 1.5, 4, 5, B.dk);
  p.vl(16, 3 + oy * 1.5, 7 + oy, B.lt);
  p.rr(14, 1 + oy * 1.5, 8, 3, 1, B.base); p.hl(15, 20, 1 + oy * 1.5, B.hi);
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- kitchen timer (22×24)
/** k: 0..24 twenty-fourths of time left; low: red wedge. */
function timer(k, low = false) {
  const p = new Px(22, 24);
  const cx = 10.5, cy = 13.5, R = 9.8;
  const T = PAL.red;
  // feet and the knob
  p.rect(4, 22, 3, 2, IRON.dk); p.rect(15, 22, 3, 2, IRON.dk);
  p.rect(9, 0, 4, 3, B.base); p.hl(9, 12, 0, B.hi); p.vl(12, 1, 2, B.dk);
  p.rect(8, 2, 6, 2, B.dk); p.hl(8, 13, 2, B.lt);
  // tomato-red body
  p.disk(cx, cy, R, T.base);
  p.each((x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
    if (r > R) return undefined;
    const lit = -(dx + dy) / (r || 1);
    if (r > R - 1.2) return lit > 0.3 ? T.lt : lit < -0.3 ? T.dd : T.base;
    if (r > R - 2.4) return lit > 0 ? T.hi : T.dk;
    return undefined;
  });
  // cream face with the time left as a wedge
  const fr = R - 2.6;
  const frac = k / 24;
  const wedge = low ? { a: 0xff7a5a, b: 0xd84a2a } : { a: 0xf6d86a, b: 0xd8a83a };
  for (let y = 0; y < 24; y++) for (let x = 0; x < 22; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
    if (r > fr) continue;
    let ang = Math.atan2(dx, -dy) / (Math.PI * 2); // 0 at 12 o'clock, clockwise
    if (ang < 0) ang += 1;
    let c = r > fr - 1 ? P.mid : P.hi;
    if (ang < frac && r < fr - 0.6) c = r > fr - 1.6 ? wedge.b : wedge.a;
    p.set(x, y, c);
  }
  // ticks
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2;
    p.set(Math.round(cx - 0.5 + Math.sin(t) * (fr - 0.6)), Math.round(cy - 0.5 - Math.cos(t) * (fr - 0.6)), i % 3 === 0 ? INK : 0x8a6a4a);
  }
  // the hand points at the wedge's edge
  const ha = frac * Math.PI * 2;
  for (let s = 0; s <= fr - 1.4; s += 0.5) p.set(Math.round(cx - 0.5 + Math.sin(ha) * s), Math.round(cy - 0.5 - Math.cos(ha) * s), INK);
  p.disk(cx, cy, 1.2, B.dk); p.set(Math.floor(cx), Math.floor(cy), B.hi);
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- step stamps (9×9)
const STAMP = {
  star: ['....a....', '...aha...', 'aaaahaaaa', '.aahhhaa.', '..aaaaa..', '..aa.aa..', '.aa...aa.'],
  check: ['.......aa', '......aaa', 'aa...aaa.', 'aaa.aaa..', '.aaaaa...', '..aaa....', '...a.....'],
  dot: ['..aaa..', '.aahaa.', 'aahhhaa', 'aahhaaa', 'aaaaaaa', '.aaaaa.', '..aaa..'],
  cross: ['aa...aa', 'aaa.aaa', '.aaaaa.', '..aaa..', '.aaaaa.', 'aaa.aaa', 'aa...aa'],
};
const STAMP_COL = { star: [0xffd84a, 0xfff6b0], check: [0x6ac84a, 0xc8f08a], dot: [0x5aa0e0, 0xbfe6ff], cross: [0xe0503a, 0xffb0a0] };
function stamp(kind) {
  const rows = STAMP[kind];
  const w = rows[0].length;
  const p = new Px(w + 2, rows.length + 2);
  const [a, h] = STAMP_COL[kind];
  p.tpl(rows, { a, h }, 1, 1);
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- grade rosettes (26×36)
const ROS = {
  Perfect: PAL.amber, Great: PAL.green, Good: PAL.blue,
  Okay: { hi: 0xe8c08a, lt: 0xc8945a, base: 0xa0703a, dk: 0x7a4e22, dd: 0x4a2e12 },
  Burnt: { hi: 0x8a8078, lt: 0x6a625a, base: 0x4a4440, dk: 0x34302c, dd: 0x1e1c1a },
};
function rosette(grade, small = false) {
  const R = ROS[grade] || ROS.Good;
  if (small) return rosetteSmall(R);
  const p = new Px(26, 36);
  // tails with notched ends
  const tail = (x0, dir) => {
    for (let y = 18; y <= 34; y++) {
      const x = x0 + Math.round((y - 18) * 0.22 * dir);
      for (let i = 0; i < 6; i++) {
        if (y >= 32 && (i === 2 || i === 3) && y - 32 >= Math.abs(i - 2.5) - 0.5) continue;
        p.set(x + i, y, i === 0 ? R.lt : i === 5 ? R.dk : R.base);
      }
    }
  };
  tail(5, -1); tail(15, 1);
  // pleated ring
  const cx = 12.5, cy = 11.5;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 26; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const pleat = Math.sin(a * 9) > 0;
    if (r <= 11.4 + (pleat ? 0.6 : 0)) p.set(x, y, pleat ? R.lt : R.dk);
    if (r <= 7.6) {
      const lit = -(dx + dy) / (r || 1);
      p.set(x, y, r > 6.6 ? (lit > 0 ? R.hi : R.dd) : P.hi);
    }
  }
  // a little star in the middle
  p.tpl(['..a..', '.aaa.', 'aaaaa', '.a.a.'], { a: R.base }, 10, 9);
  p.outline(INK);
  return p;
}

/** The little rosette on a recipe card (16×22). */
function rosetteSmall(R) {
  const p = new Px(16, 22);
  for (const [x0, dir] of [[3, -1], [9, 1]]) {
    for (let y = 11; y <= 20; y++) {
      const x = x0 + Math.round((y - 11) * 0.2 * dir);
      for (let i = 0; i < 4; i++) {
        if (y >= 19 && (i === 1 || i === 2) && y === 20) continue;
        p.set(x + i, y, i === 0 ? R.lt : i === 3 ? R.dk : R.base);
      }
    }
  }
  const cx = 8, cy = 7.5;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
    const pleat = Math.sin(Math.atan2(dy, dx) * 7) > 0;
    if (r <= 6.9 + (pleat ? 0.5 : 0)) p.set(x, y, pleat ? R.lt : R.dk);
    if (r <= 4.3) p.set(x, y, r > 3.4 ? (dx + dy < 0 ? R.hi : R.dd) : P.hi);
  }
  p.set(7, 7, R.base); p.set(8, 7, R.base); p.set(7, 8, R.base); p.set(8, 8, R.base); p.set(7, 6, R.base); p.set(8, 9, R.base);
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- pointers, frames, tokens
/** Wooden arrow button for flipping recipe cards (points right; flip it in CSS): 12×16. */
function arrow() {
  const p = new Px(12, 16);
  p.poly([[1, 4], [6, 4], [6, 1], [11, 8], [6, 15], [6, 12], [1, 12]], W.lt);
  p.each((x, y) => (y <= 5 && x < 7 ? W.hi : y >= 11 || x + y > 17 ? W.dk : undefined));
  p.hl(2, 5, 5, W.hi);
  p.outline(INK);
  return p;
}

/** Brass pointer aiming left at a gauge tube: 8×7. */
function pointer() {
  const p = new Px(8, 7);
  p.poly([[0, 3.5], [4, 0], [8, 0], [8, 7], [4, 7]], B.base);
  p.each((x, y) => (y <= 2 ? B.lt : y >= 5 ? B.dk : undefined));
  p.set(3, 2, B.hi); p.set(4, 1, B.hi);
  p.outline(INK);
  return p;
}

/** Twine and a nail for hanging plaques: 24×10 (the twine ends at the bottom corners). */
function hanger() {
  const p = new Px(24, 10);
  p.line(2, 9, 11, 2, 0xd8bb88); p.line(3, 9, 12, 2, 0x7a5a36);
  p.line(21, 9, 12, 2, 0xd8bb88); p.line(20, 9, 11, 2, 0x7a5a36);
  p.rect(10, 0, 4, 3, IRON.lt); p.set(10, 0, IRON.hi); p.set(13, 2, IRON.dd);
  p.outline(0x2a1a10);
  return p;
}

/** Wooden spoon pointing down (the doneness marker): 9×20. */
function spoon() {
  const p = new Px(9, 20);
  p.rect(3, 0, 3, 11, W.lt); p.vl(3, 0, 10, W.hi); p.vl(5, 0, 10, W.dk);
  p.ellipse(4.5, 15, 4, 4.6, W.lt);
  p.each((x, y, c) => (y > 10 && x > 4 ? W.base : y > 16 ? W.dk : c));
  p.set(3, 13, W.hi); p.set(2, 14, W.hi);
  p.outline(INK);
  return p;
}

/** Brass-capped glass tube (vertical gauges): 9-slice, slice 5, hollow middle. 14×22. */
function tube() {
  const p = new Px(14, 22);
  const glass = 0xd8f0ec;
  // caps
  for (const y0 of [0, 17]) {
    p.rr(0, y0, 14, 5, 1, B.base);
    p.hl(1, 12, y0, B.hi); p.hl(1, 12, y0 + 1, B.lt); p.hl(1, 12, y0 + 4, B.dd); p.hl(1, 12, y0 + 3, B.dk);
    p.set(2, y0 + 2, B.hi); p.set(11, y0 + 2, B.dk);
  }
  // glass walls (sides): ink, glass edge, inner shadow
  for (let y = 5; y < 17; y++) {
    p.set(1, y, INK); p.set(2, y, glass); p.set(3, y, 0x9ac0bc); p.set(4, y, 0x2a1a12, 160);
    p.set(12, y, INK); p.set(11, y, 0x7aa09a); p.set(10, y, 0x5a7a76); p.set(9, y, 0x2a1a12, 120);
  }
  // hollow middle
  for (let y = 5; y < 17; y++) for (let x = 5; x <= 8; x++) p.clear(x, y);
  p.outline(INK);
  return p;
}

/** Brass bar frame (the doneness bar): 9-slice, slice 3, hollow. 10×10. */
function barFrame() {
  const p = new Px(10, 10);
  p.rect(0, 0, 10, 10, B.base);
  p.hl(0, 9, 0, B.hi); p.vl(0, 0, 9, B.lt); p.hl(0, 9, 9, B.dd); p.vl(9, 0, 9, B.dk);
  p.hl(1, 8, 1, B.lt); p.hl(1, 8, 8, B.dk);
  for (let y = 2; y <= 7; y++) for (let x = 2; x <= 7; x++) p.clear(x, y);
  p.hl(2, 7, 2, INK); p.hl(2, 7, 7, INK); p.vl(2, 2, 7, INK); p.vl(7, 2, 7, INK);
  for (let y = 3; y <= 6; y++) for (let x = 3; x <= 6; x++) p.clear(x, y);
  return p;
}

/** A round token for the kneading lane (L blue, R pink): 16×16. */
function noteToken(side) {
  const p = new Px(16, 16);
  const C = side === 'L' ? PAL.blue : { hi: 0xffd8e4, lt: 0xffb0c8, base: 0xe07a9a, dk: 0xb04a6a, dd: 0x7a2a46 };
  p.disk(8, 8, 7.4, C.lt);
  p.each((x, y) => {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 8, r = Math.hypot(dx, dy);
    const lit = -(dx + dy) / (r || 1);
    if (r > 6.2) return lit > 0.2 ? C.hi : lit < -0.3 ? C.dk : C.base;
    if (r > 5.2) return lit > 0 ? C.base : C.hi;
    return undefined;
  });
  p.outline(INK);
  return p;
}

/** Tiny icons for the cupboard tabs and the plaques (11×11). */
const MINI = {
  jar: ['..aaaaa..', '..bbbbb..', '.ccccccc.', 'cddcccccc', 'cdcceeecc', 'cdceeeeec', 'cccceeccc', 'ccccccccc', '.ccccccc.'],
  card: ['aaaaaaaaa', 'abbbbbbba', 'accccccca', 'abbbbbbba', 'acccccca.', 'abbbbbbba', 'acccca...', 'abbbbbbba', 'aaaaaaaaa'],
  door: ['..aaaaa..', '.abbbbba.', 'abbcbcbba', 'abbcbcbba', 'abbbbbbba', 'abbbbbdba', 'abbcbcbba', 'abbcbcbba', 'aaaaaaaaa'],
  stop: ['..aaaaa..', '.abbbbba.', 'abbbbbbba', 'abccbccba', 'abbcccbba', 'abccbccba', 'abbbbbbba', '.abbbbba.', '..aaaaa..'],
  pot: ['.........', '..aaaaa..', 'aabbbbbaa', '.accccca.', '.addddda.', '.addddda.', '.addddda.', '..ddddd..', '.........'],
  book: ['.aaaaaaa.', 'abbbbbbca', 'abddddbca', 'abbbbbbca', 'abddddbca', 'abbbbbbca', 'abbbbbbca', 'abbbbbbca', '.aaaaaaa.'],
};
const MINI_PAL = {
  jar: { a: 0xb88a56, b: 0x5a8a84, c: 0xbfe0d8, d: 0xffffff, e: 0xc8843a },
  card: { a: 0x6e4a2a, b: 0xfcf3dc, c: 0x7fa0d0 },
  door: { a: 0x3a2212, b: 0x8a5a32, c: 0x643e20, d: 0xf2c23a },
  stop: { a: 0x5a140c, b: 0xc23c2c, c: 0xfff4e8 },
  pot: { a: 0x8e4422, b: 0xf09a5a, c: 0xe0a04a, d: 0xc86a34 },
  book: { a: 0x3a0f0a, b: 0x8e3c2a, c: 0xf2e1b9, d: 0xdcae4e },
};
function mini(name) {
  const p = new Px(11, 11);
  p.tpl(MINI[name], MINI_PAL[name], 1, 1);
  p.outline(INK);
  return p;
}

/** Wooden step token frame (9-slice, slice 3): 10×10. on: polished brass. */
function token(on = false) {
  const R = on ? B : W;
  const p = new Px(10, 10);
  p.rr(0, 0, 10, 10, 2, R.base);
  p.hl(1, 8, 0, R.hi); p.vl(0, 1, 7, R.lt); p.hl(1, 8, 1, R.lt);
  p.hl(1, 8, 9, R.dd); p.hl(1, 8, 8, R.dk); p.vl(9, 1, 8, R.dk);
  p.outline(INK);
  return p;
}

/** Index card for the recipe box (9-slice, slice 5): lined paper with a red header rule. 16×16. */
function indexCard() {
  const p = new Px(16, 16);
  p.rect(1, 1, 14, 14, P.hi);
  p.hl(1, 14, 4, 0xe07a6a);
  for (const y of [8, 12]) for (let x = 1; x <= 14; x++) p.set(x, y, 0xb8cce0);
  p.hl(1, 14, 14, P.mid); p.vl(14, 1, 14, P.mid);
  p.outline(P.edge);
  p.clear(0, 0); p.clear(15, 0); p.clear(0, 15); p.clear(15, 15);
  return p;
}

/** Corner photo-mount for the dish portrait (brass, 6×6). */
function corner() {
  const p = new Px(6, 6);
  p.poly([[0, 0], [6, 0], [0, 6]], B.base);
  p.hl(0, 4, 0, B.hi); p.vl(0, 0, 4, B.lt);
  for (let i = 0; i < 6; i++) p.set(5 - i, i, B.dd);
  return p;
}

// ---------------------------------------------------------------- registry
export const KART = {
  basket: (l) => art('ck:basket:' + l, () => basket(l)),
  crate: (l) => art('ck:crate:' + l, () => crate(l)),
  jar: (l) => art('ck:jar:' + l, () => jar(l)),
  pot: (l, full = false) => art(`ck:pot:${l}:${full ? 1 : 0}`, () => pot(l, full)),
  stove: () => art('ck:stove', stove),
  slotRing: () => art('ck:slotRing', slotRing),
  bell: (down = false) => art('ck:bell' + (down ? 1 : 0), () => bell(down)),
  timer: (frac, low = false) => { const k = Math.max(0, Math.min(24, Math.round(frac * 24))); return art(`ck:timer:${k}:${low ? 1 : 0}`, () => timer(k, low)); },
  stamp: (kind) => art('ck:stamp:' + kind, () => stamp(kind)),
  rosette: (grade, small = false) => art(`ck:ros:${grade}:${small ? 1 : 0}`, () => rosette(grade, small)),
  arrow: () => art('ck:arrow', arrow),
  pointer: () => art('ck:pointer', pointer),
  hanger: () => art('ck:hanger', hanger),
  spoon: () => art('ck:spoon', spoon),
  tube: () => art('ck:tube', tube),
  barFrame: () => art('ck:barFrame', barFrame),
  note: (side) => art('ck:note:' + side, () => noteToken(side)),
  mini: (name) => art('ck:mini:' + name, () => mini(name)),
  token: (on = false) => art('ck:token' + (on ? 1 : 0), () => token(on)),
  indexCard: () => art('ck:indexCard', indexCard),
  corner: () => art('ck:corner', corner),
};

/** Step score → stamp kind (★ ≥ 90, ✓ ≥ 75, • ≥ 50, ✗ below). */
export const stampKind = (score) => (score >= 90 ? 'star' : score >= 75 ? 'check' : score >= 50 ? 'dot' : 'cross');

let installed = false;
/** Publish the sprites the cooking stylesheet uses as --a-ck-* custom properties. */
export function installKitchenArt(root = document.documentElement) {
  if (installed) return;
  installed = true;
  const map = {
    'ck-tube': KART.tube(), 'ck-bar': KART.barFrame(), 'ck-spoon': KART.spoon(), 'ck-noteL': KART.note('L'), 'ck-noteR': KART.note('R'),
    'ck-token': KART.token(false), 'ck-tokenOn': KART.token(true), 'ck-card': KART.indexCard(), 'ck-corner': KART.corner(),
    'ck-ring': KART.slotRing(), 'ck-stove': KART.stove(), 'ck-arrow': KART.arrow(), 'ck-pointer': KART.pointer(), 'ck-hanger': KART.hanger(),
  };
  for (const [k, v] of Object.entries(map)) if (v) root.style.setProperty('--a-' + k, `url("${v}")`);
}

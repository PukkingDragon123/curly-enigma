// Man-made things in the cross-section, hand-placed pixel by pixel: the lift cages, their headframes
// and cables, the town shaft's timber lining, old mine supports with their lamps, rails and carts,
// ladders. Woodcut style: flat 3-4 tone ramps lit from the top left, plum outlines on the shadow side.
import { INK, INK2, WOOD, IRON, LAMP, CREAM, hash } from './kit.js';

export const ID = { shaft: 60, cage: 61, support: 62, rail: 63, cart: 64, ladder: 65, lamp: 66, cable: 67, house: 70, furn: 71, root: 80, xtal: 81, fossil: 82, ice: 83, plant: 84, bone: 85, ruin: 86, ore: 87, liquid: 2 };

/** A plank or post: lit left/top, plum on the right/bottom, grain marks. */
export function beam(pc, x, y, w, h, R = WOOD, vertical = h > w) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let c = R[1];
    if (vertical) { if (i === 0) c = R[2]; else if (i === w - 1) c = INK; else if (hash(x + i, (y + j) >> 2, 3) < 0.18) c = R[0]; }
    else { if (j === 0) c = R[2]; else if (j === h - 1) c = INK; else if (hash((x + i) >> 2, y + j, 4) < 0.18) c = R[0]; }
    pc.p(x + i, y + j, c);
  }
  // a cream nick on the lit end
  if (vertical) pc.p(x, y, R[3]); else pc.p(x, y, R[3]);
}

/** An old mine support: two stout posts with footings, a heavy cap beam, long knee braces, a wedge; returns the lamp spot. */
export function support(pc, x, floorY, ceilY, w = 18) {
  const cur = pc.cur; pc.cur = ID.support;
  const top = Math.max(ceilY + 1, floorY - 24);
  const h = floorY - top;
  const l = x - (w >> 1), r = x + (w >> 1) - 3;
  beam(pc, l, top + 2, 4, h - 2, WOOD, true);
  beam(pc, r, top + 3, 4, h - 3, WOOD, true);
  beam(pc, l - 3, top - 1, w + 6, 4, WOOD, false);
  // knee braces from the posts up to the cap
  for (let k = 0; k < 6; k++) {
    pc.p(l + 4 + k, top + 8 - k, WOOD[2]); pc.p(l + 4 + k, top + 9 - k, INK);
    pc.p(r - 1 - k, top + 8 - k, WOOD[1]); pc.p(r - 1 - k, top + 9 - k, INK);
  }
  // footings: flat stones under the posts
  for (const fx of [l - 1, r - 1]) { pc.p(fx, floorY - 1, IRON[2]); for (let i = 1; i < 6; i++) pc.p(fx + i, floorY - 1, i === 5 ? INK : IRON[1]); }
  // iron straps and nails, a wedge over the cap
  pc.p(l + 1, top + 1, IRON[3]); pc.p(r + 2, top + 1, IRON[2]);
  for (let j = 0; j < 4; j++) { pc.p(l + 1, top + 12 + j, IRON[1]); pc.p(r + 1, top + 12 + j, IRON[0]); }
  pc.p(x - 2, top - 2, WOOD[2]); pc.p(x - 1, top - 2, WOOD[2]); pc.p(x, top - 2, WOOD[1]); pc.p(x + 1, top - 2, INK);
  pc.cur = cur;
  return { x: x + 2, y: top + 3 };
}

/** A small iron lamp hanging from a hook (the flame flickers in the animation). */
export function lamp(pc, x, y, lit = true) {
  const cur = pc.cur; pc.cur = ID.lamp;
  pc.p(x, y, IRON[1]); pc.p(x, y + 1, IRON[1]);
  pc.stamp(x - 1, y + 2, ['121', '3f3', '3f3', '010'], { 0: INK, 1: IRON[1], 2: IRON[2], 3: IRON[0], f: lit ? LAMP[2] : IRON[0] });
  pc.cur = cur;
}

/** Rails along a floor: sleepers and a single iron rail seen side-on. fy(x) → the floor's top. */
export function rails(pc, x0, x1, fy) {
  const cur = pc.cur; pc.cur = ID.rail;
  for (let x = x0; x <= x1; x++) {
    const y = fy(x);
    if (y == null) continue;
    pc.p(x, y - 1, (x - x0) % 5 < 3 ? WOOD[(x - x0) % 5 === 0 ? 2 : 1] : WOOD[0]);
    pc.p(x, y - 2, IRON[3]);
    pc.p(x, y - 3, (x & 3) === 0 ? IRON[1] : IRON[2]);
  }
  pc.cur = cur;
}

/** A mine cart with lumps of ore (lo: the ore's [dark, light] or null). */
export function cart(pc, x, y, ore) {
  const cur = pc.cur; pc.cur = ID.cart;
  const rows = [
    '.oo.oO.o.o.',
    '01222222220',
    '.122332221.',
    '.11222222..',
    '..1111110..',
    '..w0...w0..',
    '.wWw..wWw..',
    '..w....w...',
  ];
  pc.stamp(x - 5, y - 8, rows, { 0: INK, 1: IRON[1], 2: IRON[2], 3: IRON[3], w: INK2, W: IRON[2], o: ore ? ore[0] : WOOD[1], O: ore ? ore[1] : WOOD[3] });
  pc.cur = cur;
}

/** A wooden ladder between two heights. */
export function ladder(pc, x, y0, y1) {
  const cur = pc.cur; pc.cur = ID.ladder;
  for (let y = y0; y <= y1; y++) {
    pc.p(x, y, WOOD[2]); pc.p(x + 4, y, WOOD[1]); pc.p(x + 5, y, INK);
    if ((y - y0) % 4 === 2) { for (let i = 1; i < 4; i++) pc.p(x + i, y, WOOD[2]); for (let i = 1; i < 4; i++) pc.p(x + i, y + 1, WOOD[0]); }
  }
  pc.cur = cur;
}

/** The headframe wheel (sheave) of a lift: a hand-pixelled 9px wheel with spokes, on a beam. */
export function sheave(pc, x, y) {
  const cur = pc.cur; pc.cur = ID.cage;
  pc.stamp(x - 4, y - 4, [
    '..0111...',
    '.12.2.10.',
    '01.2.2.10',
    '12..3..20',
    '1.22322.0',
    '12..2..20',
    '.1.2.2.0.',
    '.002.20..',
    '...000...',
  ], { 0: INK, 1: IRON[2], 2: IRON[1], 3: IRON[3] });
  pc.cur = cur;
}

/**
 * A lift cage on its platform. open: unlocked (gate up, lamp lit); otherwise chained shut with a
 * padlock. Returns the lamp's spot.
 */
export function cage(pc, x, fy, open) {
  const cur = pc.cur; pc.cur = ID.cage;
  const B = open ? [0x5a3a1e, 0x9a6a2e, 0xd0a04a, 0xf2d488] : IRON;
  // platform
  for (let i = -8; i <= 8; i++) { pc.p(x + i, fy, i === -8 ? WOOD[2] : WOOD[1]); pc.p(x + i, fy + 1, INK); }
  pc.p(x - 7, fy - 1, IRON[1]); pc.p(x + 7, fy - 1, IRON[1]);
  // roof: a little hood and the hanger
  for (let i = -6; i <= 6; i++) pc.p(x + i, fy - 14, i < 0 ? B[2] : B[1]);
  for (let i = -5; i <= 5; i++) pc.p(x + i, fy - 15, i < -2 ? B[3] : B[2]);
  for (let i = -3; i <= 3; i++) pc.p(x + i, fy - 16, B[1]);
  pc.p(x - 6, fy - 13, INK); pc.p(x + 6, fy - 13, INK);
  pc.p(x, fy - 17, IRON[2]); pc.p(x, fy - 18, IRON[1]);
  // posts and bars
  for (let j = 1; j <= 13; j++) {
    const y = fy - j;
    pc.p(x - 6, y, B[2]); pc.p(x - 5, y, B[1]); pc.p(x + 5, y, B[1]); pc.p(x + 6, y, INK);
    for (let i = -4; i <= 4; i++) {
      if (open && j < 11 && i > -4 && i < 4) continue; // the gate is up: you can see in
      if (i % 2 === 0) pc.p(x + i, y, (i < 0 ? B[1] : B[0]));
    }
  }
  // the band at the middle
  for (let i = -5; i <= 5; i++) pc.p(x + i, fy - 7, i < 0 ? B[2] : B[1]);
  if (open) {
    // the raised gate's slats under the roof
    for (let i = -4; i <= 4; i++) { pc.p(x + i, fy - 12, (i & 1) ? B[0] : B[1]); pc.p(x + i, fy - 11, INK2); }
    pc.p(x - 3, fy - 2, WOOD[2]); pc.p(x - 2, fy - 2, WOOD[1]); pc.p(x - 3, fy - 3, WOOD[3]); // a crate inside
    pc.p(x - 2, fy - 3, WOOD[2]); pc.p(x - 1, fy - 2, INK);
  } else {
    // a chain across and a padlock
    for (let i = -5; i <= 5; i++) pc.p(x + i, fy - 7 + ((i + 5) % 2), (i & 1) ? IRON[3] : IRON[2]);
    pc.stamp(x - 2, fy - 7, ['.000.', '0...0', '01110', '02a20', '02220', '00000'], { 0: INK, 1: LAMP[2], 2: LAMP[1], a: INK });
  }
  // the bell on its bracket (left) and a lamp hook (right)
  pc.stamp(x - 10, fy - 13, ['000.', '.10.', '121.', '1220', '.0..'], { 0: INK, 1: LAMP[1], 2: LAMP[2] });
  pc.p(x + 7, fy - 12, WOOD[1]); pc.p(x + 8, fy - 12, WOOD[1]); pc.p(x + 8, fy - 11, IRON[1]);
  if (!open) pc.stamp(x + 7, fy - 10, ['121', '303', '010'], { 0: INK, 1: IRON[1], 2: IRON[2], 3: IRON[0] });
  pc.cur = cur;
  return { x: x + 8, y: fy - 9 };
}

/** A cable from y0 up to y1 (two strands, twisted). */
export function cable(pc, x, y0, y1, dim = false) {
  const cur = pc.cur; pc.cur = ID.cable;
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    pc.p(x, y, (y & 1) ? (dim ? IRON[1] : IRON[2]) : (dim ? IRON[0] : IRON[3]));
  }
  pc.cur = cur;
}

/**
 * The town shaft: a timber-lined slot down through the rock (cribbing every few px, two guide
 * rails, a cable), drawn over whatever is there. isRock(y) says whether the lining is in rock.
 */
export function shaft(pc, x, y0, y1, isRock, back) {
  const cur = pc.cur; pc.cur = ID.shaft;
  for (let y = y0; y < y1; y++) {
    const inRock = isRock(y);
    if (inRock) for (let i = -4; i <= 4; i++) pc.p(x + i, y, Math.abs(i) === 4 ? INK : (i < -1 ? back[1] : back[0]));
    // the cribbing: posts either side, a set of timbers every 14 px
    pc.p(x - 5, y, WOOD[1]); pc.p(x - 6, y, inRock ? WOOD[0] : INK); pc.p(x + 5, y, WOOD[0]); pc.p(x + 6, y, INK);
    const k = ((y % 14) + 14) % 14;
    if (k === 0) for (let i = -6; i <= 6; i++) pc.p(x + i, y, i === -6 ? WOOD[2] : WOOD[1]);
    if (k === 1) for (let i = -6; i <= 6; i++) pc.p(x + i, y, INK);
    if (k === 7 && inRock) { pc.p(x - 4, y, WOOD[0]); pc.p(x + 4, y + 1, WOOD[0]); }
    // guide rails and the cable
    pc.p(x - 3, y, k === 0 ? WOOD[1] : IRON[0]); pc.p(x + 3, y, k === 0 ? WOOD[1] : INK2);
    pc.p(x, y, (y & 1) ? IRON[1] : IRON[2]);
  }
  pc.cur = cur;
}

/** A tiny pennant sign hanging from a nail (wood board, no text). */
export function board(pc, x, y, w, c = WOOD) {
  const cur = pc.cur; pc.cur = ID.support;
  pc.p(x + (w >> 1), y - 2, IRON[2]);
  pc.p(x + 1, y - 1, IRON[1]); pc.p(x + w - 2, y - 1, IRON[1]);
  for (let i = 0; i < w; i++) for (let j = 0; j < 4; j++) pc.p(x + i, y + j, j === 0 ? c[2] : j === 3 || i === w - 1 ? INK : c[1]);
  pc.p(x + 1, y + 1, c[3]);
  pc.cur = cur;
}

export { CREAM };

// Pen-and-ink toolkit for the hand-drawn map: a hand-lettered pixel alphabet, wobbly lines and
// circles, watercolour washes that never quite sit inside their outlines, and the little doodles
// Old Star would scribble for landmarks (his workshop, lifts, burrows, ruins, Deep Town, lakes,
// nests), plus the compass rose, a scale bar and the player's arrow. Everything draws into a Px.
import { Px } from './uiArt.js';

export const INKC = { ink: 0x2e1a0e, ink2: 0x4a2c16, sepia: 0x6a4a2a, red: 0xa8321e, redLt: 0xd8604a, blue: 0x2a5a7a, pencil: 0x8a7e6a, green: 0x3d6a2a, gold: 0xb07a14 };
export const WASH = { warm: 0xf0b070, red: 0xe07a5a, blue: 0x8ab8d0, stone: 0xb0b4b8, green: 0x9ac078, gold: 0xf2c860, lava: 0xf08050, violet: 0xb8a0d8 };

// ---------------------------------------------------------------- hand lettering (3–5 × 5, leaning)
const G = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##.', '#...', '#.##', '#..#', '.##.'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['#', '#', '#', '#', '#'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '#.#', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '.#.', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['.#.', '#.#', '#.#', '#.#', '.#.'], 1: ['.#', '##', '.#', '.#', '.#'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.#.', '#..', '##.', '#.#', '.#.'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['.#.', '#.#', '.#.', '#.#', '.#.'],
  9: ['.#.', '#.#', '.##', '..#', '.#.'],
  ' ': ['..', '..', '..', '..', '..'], '.': ['.', '.', '.', '.', '#'], ',': ['.', '.', '.', '#', '#'], "'": ['#', '#', '.', '.', '.'],
  '-': ['..', '..', '##', '..', '..'], '?': ['##.', '..#', '.#.', '...', '.#.'], '!': ['#', '#', '#', '.', '#'], ':': ['.', '#', '.', '#', '.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'], '&': ['.#.', '#.#', '.#.', '#.#', '.##'], '(': ['.#', '#.', '#.', '#.', '.#'], ')': ['#.', '.#', '.#', '.#', '#.'],
  '+': ['...', '.#.', '###', '.#.', '...'],
};
const hash = (a, b = 0, c = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export { hash };

export function textW(s) {
  let w = 0;
  for (const ch of String(s).toUpperCase()) w += (G[ch] || G[' '])[0].length + 1;
  return Math.max(0, w - 1) + 1; // +1 for the lean
}
export const TEXT_H = 6;

/** Hand-lettered text, top-left at (x, y). Letters lean and bob a little, like real lettering. */
export function hand(p, s, x, y, color = INKC.ink, { seed = 1, alpha = 255, lean = true } = {}) {
  let cx = Math.round(x);
  const y0 = Math.round(y);
  let k = 0;
  for (const ch of String(s).toUpperCase()) {
    const g = G[ch] || G[' '];
    const bob = hash(seed, k, 3) < 0.22 ? -1 : 0;
    for (let r = 0; r < 5; r++) {
      const sh = lean && r < 2 ? 1 : 0;
      const row = g[r];
      for (let i = 0; i < row.length; i++) if (row[i] === '#') p.set(cx + i + sh, y0 + r + bob + 1, color, alpha);
    }
    cx += g[0].length + 1;
    k++;
  }
  return cx - Math.round(x);
}

/** Clear a soft patch of paper behind a label so it reads over the hatching. */
export function paperPatch(p, x, y, w, h, paper, alpha = 225) {
  for (let j = y - 1; j <= y + h; j++)
    for (let i = x - 2; i <= x + w + 1; i++) {
      const edge = j === y - 1 || j === y + h || i === x - 2 || i === x + w + 1;
      if (edge && hash(i, j, 77) < 0.5) continue;
      p.set(i, j, paper, edge ? alpha * 0.6 : alpha);
    }
}

// ---------------------------------------------------------------- wobbly strokes
/** A line that wavers by up to half a pixel, like a pen held by a paw. */
export function wline(p, x0, y0, x1, y1, color, { seed = 1, alpha = 255, amp = 0.6, dash = 0 } = {}) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 0.01) { p.set(Math.round(x0), Math.round(y0), color, alpha); return; }
  const nx = -dy / len, ny = dx / len;
  const n = Math.ceil(len * 1.6);
  const ph = hash(seed, 1) * 6.28, fq = 0.35 + hash(seed, 2) * 0.4;
  let lx = null, ly = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (dash && Math.floor(t * len / dash) % 2 === 1) { lx = null; continue; }
    const w = Math.sin(ph + t * len * fq) * amp * Math.sin(t * Math.PI);
    const x = Math.round(x0 + dx * t + nx * w), y = Math.round(y0 + dy * t + ny * w);
    if (x === lx && y === ly) continue;
    p.set(x, y, color, alpha);
    lx = x; ly = y;
  }
}

/** A hand-drawn circle: the radius drifts and the ends overshoot instead of closing. */
export function wcircle(p, cx, cy, r, color, { seed = 1, alpha = 255, ry = r, gap = 0.12, over = 0.18 } = {}) {
  const a0 = hash(seed, 9) * 6.28;
  const n = Math.max(16, Math.ceil(r * 7));
  const span = Math.PI * 2 * (1 - gap) + over * Math.PI * 2;
  let lx = null, ly = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + t * span;
    const k = 1 + Math.sin(a * 2 + seed) * 0.06 + (t > 0.9 ? (t - 0.9) * 0.6 : 0);
    const x = Math.round(cx + Math.cos(a) * r * k), y = Math.round(cy + Math.sin(a) * ry * k);
    if (x === lx && y === ly) continue;
    p.set(x, y, color, alpha);
    lx = x; ly = y;
  }
}

/** A watercolour wash, a little off its outline (the hand-tinted look). */
export function wash(p, fn, color, alpha = 120) {
  const o = new Px(p.w, p.h);
  fn(o);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) if (o.a(x, y)) p.set(x + 1, y + 1, color, alpha);
}

// ---------------------------------------------------------------- doodles (centred on cx, cy)
// Each returns the box it drew [x0, y0, x1, y1] so labels can stay clear of it.
const box = (cx, cy, w, h) => [Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(cx + w / 2), Math.round(cy + h / 2)];

export const DOODLE = {
  /** Old Star's workshop: a hump of hill with a round door, a chimney smoking, a star over it. */
  home(p, cx, cy, s = 1) {
    cx = Math.round(cx); cy = Math.round(cy);
    p.ellipse(cx + 1, cy + 3, 8, 5, WASH.warm, 120);
    for (let a = 0; a <= 28; a++) { const t = Math.PI + (a / 28) * Math.PI; p.set(Math.round(cx + Math.cos(t) * 8), Math.round(cy + 4 + Math.sin(t) * 7), INKC.ink); }
    p.hl(cx - 9, cx + 9, cy + 4, INKC.ink);
    wcircle(p, cx - 1, cy + 2, 2.4, INKC.ink, { seed: s + 1, gap: 0.5, over: 0 });
    p.vl(cx - 1, cy + 2, cy + 3, INKC.ink2);
    p.rect(cx + 3, cy - 4, 2, 4, INKC.ink); // chimney
    for (const [x, y] of [[cx + 4, cy - 6], [cx + 5, cy - 7], [cx + 4, cy - 8], [cx + 3, cy - 9], [cx + 4, cy - 10]]) p.set(x, y, INKC.pencil);
    // the star
    for (const [x, y] of [[cx - 5, cy - 7], [cx - 6, cy - 6], [cx - 4, cy - 6], [cx - 5, cy - 6], [cx - 5, cy - 5]]) p.set(x, y, INKC.red);
    return box(cx, cy - 1, 20, 18);
  },
  /** Old Star's practice dig: a pick and a shovel crossed. */
  dig(p, cx, cy, s = 1) {
    cx = Math.round(cx); cy = Math.round(cy);
    wline(p, cx - 5, cy + 5, cx + 4, cy - 4, INKC.ink2, { seed: s });
    wline(p, cx + 5, cy + 5, cx - 4, cy - 4, INKC.ink2, { seed: s + 3 });
    for (let a = -4; a <= 4; a++) p.set(cx + 4 + Math.round(a * 0.7), cy - 4 - Math.round(Math.abs(a) * 0.45) + (a < 0 ? 0 : 0), INKC.ink); // pick head
    p.rect(cx - 6, cy - 7, 3, 4, WASH.stone, 200); p.box(cx - 6, cy - 7, 3, 4, INKC.ink); // shovel blade
    return box(cx, cy, 14, 14);
  },
  /** A lift: a little cage on a rope under its wheel. */
  lift(p, cx, cy, s = 1) {
    cx = Math.round(cx); cy = Math.round(cy);
    p.rect(cx - 3, cy - 2, 7, 7, WASH.gold, 110);
    p.box(cx - 3, cy - 2, 7, 7, INKC.ink);
    p.vl(cx - 1, cy - 1, cy + 3, INKC.ink2); p.vl(cx + 1, cy - 1, cy + 3, INKC.ink2);
    p.vl(cx, cy - 6, cy - 3, INKC.ink2);
    wcircle(p, cx, cy - 7, 1.6, INKC.ink, { seed: s, gap: 0.05 });
    return box(cx, cy - 1, 9, 14);
  },
  /** Deep Town: little houses, a tower with a flag, lit windows. */
  town(p, cx, cy, s = 1) {
    cx = Math.round(cx); cy = Math.round(cy);
    const house = (x, y, w, h) => {
      p.rect(x, y - h, w, h, 0xf6e8c8, 230);
      p.poly([[x - 1, y - h + 0.5], [x + w / 2, y - h - w / 2 - 0.5], [x + w + 1, y - h + 0.5]], WASH.red, 200);
      p.box(x, y - h, w, h, INKC.ink);
      wline(p, x - 1, y - h, x + w / 2, y - h - w / 2, INKC.ink, { seed: s + x, amp: 0.2 });
      wline(p, x + w / 2, y - h - w / 2, x + w, y - h, INKC.ink, { seed: s + y, amp: 0.2 });
      p.set(x + Math.floor(w / 2), y - Math.ceil(h / 2), 0xf2c23a);
    };
    house(cx - 9, cy + 5, 5, 5);
    house(cx + 4, cy + 5, 6, 4);
    // the tower
    p.rect(cx - 3, cy - 6, 5, 11, 0xe8d8b8, 230); p.box(cx - 3, cy - 6, 5, 11, INKC.ink);
    p.set(cx - 1, cy - 3, 0xf2c23a); p.set(cx - 1, cy + 1, 0xf2c23a);
    p.vl(cx - 1, cy - 11, cy - 7, INKC.ink); p.poly([[cx, cy - 11], [cx + 4, cy - 10], [cx, cy - 8]], INKC.red);
    p.hl(cx - 11, cx + 11, cy + 5, INKC.ink2);
    return box(cx, cy - 2, 24, 18);
  },
  /** A mine shaft: a square with a cross. */
  shaft(p, cx, cy, s = 1) {
    cx = Math.round(cx); cy = Math.round(cy);
    p.box(cx - 3, cy - 3, 7, 7, INKC.ink); p.line(cx - 3, cy - 3, cx + 3, cy + 3, INKC.ink2); p.line(cx + 3, cy - 3, cx - 3, cy + 3, INKC.ink2);
    return box(cx, cy, 8, 8);
  },
  /** A burrow: a round door in a mound, and a sign for its trade. */
  burrow(p, cx, cy, s = 1, kind = 'trader') {
    cx = Math.round(cx); cy = Math.round(cy);
    p.ellipse(cx + 1, cy + 2, 6.5, 4.5, WASH.green, 110);
    for (let a = 0; a <= 20; a++) { const t = Math.PI + (a / 20) * Math.PI; p.set(Math.round(cx + Math.cos(t) * 6.5), Math.round(cy + 3 + Math.sin(t) * 5.5), INKC.ink); }
    p.hl(cx - 7, cx + 7, cy + 3, INKC.ink);
    p.disk(cx, cy + 1, 2.5, 0x7a4a24, 230); wcircle(p, cx, cy + 1, 2.6, INKC.ink, { seed: s, gap: 0.04 });
    p.set(cx + 1, cy + 1, 0xf2c23a);
    // the sign on a post
    p.vl(cx + 7, cy - 3, cy + 3, INKC.ink2);
    p.rect(cx + 5, cy - 7, 6, 4, 0xf6e8c8, 240); p.box(cx + 5, cy - 7, 6, 4, INKC.ink);
    if (kind === 'trader') { p.set(cx + 7, cy - 6, INKC.gold); p.set(cx + 8, cy - 6, INKC.gold); p.set(cx + 7, cy - 5, INKC.gold); p.set(cx + 8, cy - 5, INKC.gold); }
    else if (kind === 'herbalist') { p.set(cx + 7, cy - 5, INKC.green); p.set(cx + 8, cy - 6, INKC.green); p.set(cx + 9, cy - 6, 0x8ac85a); }
    else if (kind === 'raccoon') { p.hl(cx + 6, cx + 9, cy - 6, 0x2a2a2e); p.set(cx + 7, cy - 5, 0x8a8a92); p.set(cx + 8, cy - 5, 0x8a8a92); }
    else { p.vl(cx + 7, cy - 6, cy - 5, INKC.red); p.set(cx + 8, cy - 6, INKC.red); }
    return box(cx + 2, cy - 2, 18, 14);
  },
  /** Ruins: an arch with a broken column and rubble. */
  ruin(p, cx, cy, s = 1) {
    cx = Math.round(cx); cy = Math.round(cy);
    p.rect(cx - 6, cy - 4, 3, 9, WASH.stone, 140); p.rect(cx + 4, cy - 1, 3, 6, WASH.stone, 140);
    p.box(cx - 6, cy - 4, 3, 9, INKC.ink); p.box(cx + 4, cy - 1, 3, 6, INKC.ink);
    for (let a = 0; a <= 10; a++) { const t = Math.PI + (a / 10) * Math.PI * 0.62; p.set(Math.round(cx + Math.cos(t) * 5 + 0.5), Math.round(cy - 4 + Math.sin(t) * 4), INKC.ink); }
    p.set(cx + 4, cy - 2, INKC.ink); p.set(cx + 6, cy - 3, INKC.ink); // the broken top
    for (const [x, y] of [[cx - 2, cy + 4], [cx, cy + 5], [cx + 1, cy + 4], [cx + 8, cy + 5]]) p.set(x, y, INKC.ink2);
    p.hl(cx - 8, cx + 9, cy + 5, INKC.ink2);
    return box(cx, cy, 18, 14);
  },
  /** Water: three wavy strokes. */
  lake(p, cx, cy, s = 1) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let r = -1; r <= 1; r++) for (let i = -5; i <= 5; i++) p.set(cx + i, cy + r * 3 + Math.round(Math.sin(i * 1.1 + r) * 0.8), INKC.blue);
    return box(cx, cy, 12, 9);
  },
  /** Lava: a little flame. */
  lava(p, cx, cy, s = 1) {
    cx = Math.round(cx); cy = Math.round(cy);
    p.poly([[cx - 3, cy + 3], [cx - 2, cy - 1], [cx, cy - 5], [cx + 1, cy - 1], [cx + 3, cy - 3], [cx + 3, cy + 3]], WASH.lava, 230);
    p.poly([[cx - 1, cy + 3], [cx, cy], [cx + 1, cy + 3]], 0xf6d070, 255);
    wline(p, cx - 3, cy + 3, cx, cy - 5, INKC.red, { seed: s, amp: 0.3 }); wline(p, cx, cy - 5, cx + 3, cy + 3, INKC.red, { seed: s + 1, amp: 0.3 });
    return box(cx, cy, 8, 10);
  },
  /** A creature nest: a bowl of sticks with eggs, inked in red. */
  nest(p, cx, cy, s = 1) {
    cx = Math.round(cx); cy = Math.round(cy);
    p.disk(cx - 2, cy - 1, 1.6, 0xf2ead8); p.disk(cx + 1, cy - 2, 1.6, 0xf2ead8); p.disk(cx + 3, cy, 1.4, 0xf2ead8);
    for (let i = -5; i <= 5; i++) { p.set(cx + i, cy + 1 + Math.round(Math.abs(i) * -0.3 + 1.5), INKC.red); if (i % 2 === 0) p.set(cx + i, cy + 2, INKC.redLt); }
    wline(p, cx - 6, cy + 1, cx + 6, cy + 2, INKC.red, { seed: s, amp: 0.4 });
    wline(p, cx - 5, cy + 3, cx + 5, cy + 1, INKC.red, { seed: s + 4, amp: 0.4 });
    return box(cx, cy, 14, 8);
  },
  /** Gas: a spiral. */
  gas(p, cx, cy, s = 1) {
    for (let a = 0; a < 16; a++) { const t = a * 0.6, r = 0.6 + a * 0.28; p.set(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), 0x6a8a2a); }
    return box(cx, cy, 10, 10);
  },
  /** An ore find: the old miners' sign, two crossed picks, with a fleck of the ore's colour. */
  ore(p, cx, cy, s = 1, color = 0xd9773f) {
    cx = Math.round(cx); cy = Math.round(cy);
    p.line(cx - 3, cy + 3, cx + 2, cy - 2, INKC.ink2); p.line(cx + 3, cy + 3, cx - 2, cy - 2, INKC.ink2);
    p.set(cx - 3, cy - 1, INKC.ink); p.set(cx - 2, cy - 2, INKC.ink); p.set(cx - 1, cy - 3, INKC.ink);
    p.set(cx + 3, cy - 1, INKC.ink); p.set(cx + 2, cy - 2, INKC.ink); p.set(cx + 1, cy - 3, INKC.ink);
    p.set(cx, cy + 3, color); p.set(cx, cy + 4, color); p.set(cx - 1, cy + 4, color); p.set(cx + 1, cy + 4, color);
    return box(cx, cy, 8, 9);
  },
  /** A glow stake: a little green spark. */
  stake(p, cx, cy) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (const [x, y] of [[0, -2], [0, -1], [0, 1], [0, 2], [-2, 0], [-1, 0], [1, 0], [2, 0]]) p.set(cx + x, cy + y, INKC.green);
    p.set(cx, cy, 0x9dff9a);
    return box(cx, cy, 6, 6);
  },
  /** Nugget the hen. */
  nugget(p, cx, cy) {
    cx = Math.round(cx); cy = Math.round(cy);
    p.ellipse(cx, cy + 1, 3.4, 2.6, 0xf2e2b8, 255);
    p.disk(cx + 2, cy - 2, 1.8, 0xf2e2b8);
    p.set(cx + 2, cy - 4, INKC.red); p.set(cx + 3, cy - 4, INKC.red); p.set(cx + 4, cy - 2, INKC.gold); p.set(cx + 2, cy - 2, INKC.ink);
    p.set(cx - 4, cy - 1, 0xc8a070); p.set(cx - 4, cy, 0xc8a070);
    p.set(cx - 1, cy + 4, INKC.gold); p.set(cx + 1, cy + 4, INKC.gold);
    p.set(cx - 3, cy + 3, INKC.ink2); p.hl(cx - 2, cx + 2, cy + 4 - 0, INKC.ink2, 120);
    return box(cx, cy, 9, 9);
  },
};

/** The mole's arrow (red, outlined), pointing along (fx, fy) in map pixels. */
export function youArrow(p, cx, cy, fx, fy, alpha = 255) {
  const o = new Px(p.w, p.h);
  const rx = -fy, ry = fx;
  o.poly([[cx + fx * 6, cy + fy * 6], [cx - fx * 3.5 + rx * 4, cy - fy * 3.5 + ry * 4], [cx - fx * 1.5, cy - fy * 1.5], [cx - fx * 3.5 - rx * 4, cy - fy * 3.5 - ry * 4]], 0xc8302a);
  o.outline(INKC.ink);
  for (let y = Math.max(0, Math.floor(cy - 9)); y < Math.min(p.h, cy + 10); y++)
    for (let x = Math.max(0, Math.floor(cx - 9)); x < Math.min(p.w, cx + 10); x++) if (o.a(x, y)) p.set(x, y, o.get(x, y), alpha);
}

/** A red ink ring with a flag: "go here". pencil = a vague guess (dashed, graphite). */
export function questMark(p, cx, cy, { pencil = false, seed = 1, t = 0 } = {}) {
  cx = Math.round(cx); cy = Math.round(cy);
  if (pencil) {
    for (let a = 0; a < 40; a++) {
      if (a % 4 >= 2) continue;
      const ang = (a / 40) * Math.PI * 2;
      p.set(Math.round(cx + Math.cos(ang) * 9), Math.round(cy + Math.sin(ang) * 7), INKC.pencil);
    }
    hand(p, '?', cx - 1, cy - 4, INKC.pencil, { seed });
    return;
  }
  wcircle(p, cx, cy, 6 + Math.sin(t * 4) * 0.4, INKC.red, { seed, ry: 5 });
  wcircle(p, cx, cy, 7.5, INKC.redLt, { seed: seed + 5, ry: 6.2, alpha: 170 });
  p.vl(cx, cy - 12, cy - 1, INKC.ink);
  p.poly([[cx + 1, cy - 12], [cx + 6, cy - 10.5], [cx + 1, cy - 8.5]], INKC.red);
}

/** A compass rose: eight points, alternating ink and wash, N lettered on top. */
export function compass(p, cx, cy, r = 11) {
  wcircle(p, cx, cy, r * 0.62, INKC.ink2, { seed: 3, gap: 0.02, over: 0.04, alpha: 200 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
    const len = k % 2 ? r * 0.55 : r;
    const tip = [cx + Math.cos(a) * len, cy + Math.sin(a) * len];
    const l = [cx + Math.cos(a - 0.5) * 2.4, cy + Math.sin(a - 0.5) * 2.4], rr = [cx + Math.cos(a + 0.5) * 2.4, cy + Math.sin(a + 0.5) * 2.4];
    p.poly([[cx, cy], l, tip], k === 0 ? INKC.red : INKC.ink2);
    p.poly([[cx, cy], rr, tip], k === 0 ? WASH.red : 0xf2e2c0);
    wline(p, cx, cy, tip[0], tip[1], k === 0 ? INKC.red : INKC.ink, { amp: 0 });
  }
  p.set(Math.round(cx), Math.round(cy), INKC.ink);
  hand(p, 'N', cx - 1, cy - r - 8, INKC.red, { seed: 2, lean: false });
}

/** A scale bar: alternating blocks, "10 M" lettered under it. */
export function scaleBar(p, x, y, pxPerM, paper) {
  const steps = [5, 10, 20, 25, 50, 100];
  const m = steps.find((s) => s * pxPerM >= 24) || 100;
  const w = Math.round(m * pxPerM);
  paperPatch(p, x, y - 1, w + 2, 12, paper, 200);
  for (let i = 0; i < 4; i++) {
    const x0 = x + Math.round((w * i) / 4), x1 = x + Math.round((w * (i + 1)) / 4);
    if (i % 2 === 0) p.rect(x0, y, x1 - x0, 2, INKC.ink2);
  }
  p.box(x, y - 1, w + 1, 4, INKC.ink);
  hand(p, '0', x - 1, y + 3, INKC.ink2, { seed: 4 });
  const lab = `${m} M`;
  hand(p, lab, x + w - textW(lab) + 2, y + 3, INKC.ink2, { seed: 5 });
  return w;
}

// Pixel art for the forge's decorated interface (drawn in code, 1 art pixel = 1 canvas pixel,
// shown at the UI's --px scale): the chalkboard over the bench, the smith's ledger, the weapon
// blueprint, the coop schematic, the brass thermometer, rune medallions, gauges, rubber stamps,
// the guild certificate and its wax seal. Everything is cached through uiArt's art(); the frames
// and tiles are published on the forge layer as CSS custom properties (--fa-<key>).
import { Px, PAL, INK, art, mixHex, shade } from '../ui/uiArt.js';
import { SPR } from '../ui/uiSprites.js';
import { PixelCanvas } from '../gfx/PixelArt.js';
import { drawWeapon } from '../gfx/PixelArt.js';
import { METALS, INFUSIONS } from '../data/weapons.js';

const W = PAL.wood, B = PAL.brass, P = PAL.paper, L = PAL.leather;
const CHALK = 0xeef2e6;
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- tiles
/** Chalkboard slate: deep green-grey with old chalk smudges. 32×32 tile. */
function chalkTile() {
  const p = new Px(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const h = hash(x, y, 3);
    let c = h < 0.12 ? 0x2c3b33 : h > 0.93 ? 0x3c4c42 : 0x33433a;
    // wiped arcs of chalk dust
    const a = Math.sin((x + y * 0.4) * 0.35) + Math.sin((y - x * 0.3) * 0.22);
    if (a > 1.55 && hash(x, y, 9) > 0.35) c = mixHex(c, CHALK, 0.1);
    p.set(x, y, c);
  }
  return p;
}

/** Blueprint paper: Prussian blue with a fine grid and a heavier line every 8 px. 16×16 tile. */
function blueTile() {
  const p = new Px(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let c = hash(x, y, 5) < 0.1 ? 0x2a5c9c : 0x2d61a3;
    if (x % 4 === 0 || y % 4 === 0) c = 0x3a70b2;
    if (x % 8 === 0 || y % 8 === 0) c = 0x4a80c0;
    p.set(x, y, c);
  }
  return p;
}

/** Drafting paper: cream with a faint blue grid. 16×16 tile. */
function draftTile() {
  const p = new Px(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let c = hash(x, y, 7) < 0.12 ? 0xf0e4c6 : 0xf5ead0;
    if (x % 4 === 0 || y % 4 === 0) c = 0xe2e0cc;
    if (x % 8 === 0 || y % 8 === 0) c = 0xcfd6cc;
    p.set(x, y, c);
  }
  return p;
}

/** Cork board for pinning things to. 24×24 tile. */
function corkTile() {
  const p = new Px(24, 24);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const h = hash(x, y, 11);
    p.set(x, y, h < 0.18 ? 0x9a6a3e : h < 0.3 ? 0xc8945a : h > 0.9 ? 0x7a5230 : 0xb07c4a);
  }
  return p;
}

// ---------------------------------------------------------------- frames (9-slice)
/** Heavy oak frame round the chalkboard, brass nails. slice 8. */
function boardFrame() {
  const p = new Px(28, 28);
  p.rect(1, 1, 26, 26, W.base);
  for (let y = 1; y <= 26; y++) for (let x = 1; x <= 26; x++) {
    const d = Math.min(x - 1, y - 1, 26 - x, 26 - y);
    if (d >= 7) { p.clear(x, y); continue; }
    let c = W.base;
    const along = d === Math.min(y - 1, 26 - y) ? x : y;
    if (d === 0) c = x + y < 27 ? W.hi : W.dk;
    else if (d === 1) c = x + y < 27 ? W.lt : W.base;
    else if (d === 5) c = x + y < 27 ? W.dk : W.lt;
    else if (d === 6) c = W.dd;
    else if ((along * 5 + d * 3) % 9 === 0) c = W.dk;
    else if ((along * 3 + d) % 11 === 0) c = W.lt;
    p.set(x, y, c);
  }
  for (let i = 1; i <= 7; i++) { p.set(i, i, W.dd); p.set(27 - i, i, W.dd); p.set(i, 27 - i, W.dd); p.set(27 - i, 27 - i, W.dd); }
  for (const [x, y] of [[3, 3], [23, 3], [3, 23], [23, 23]]) { p.set(x, y, B.hi); p.set(x + 1, y, B.base); p.set(x, y + 1, B.base); p.set(x + 1, y + 1, B.dd); }
  p.outline(W.ol);
  for (let i = 8; i <= 19; i++) { p.set(i, 8, 0x1a2420); p.set(8, i, 0x1a2420); }
  return p;
}

/** Blueprint sheet edge: a white margin rule and torn corners. slice 6. */
function blueFrame() {
  const p = new Px(18, 18);
  p.rect(1, 1, 16, 16, 0x2d61a3);
  p.clear(1, 1); p.clear(16, 16);
  for (let i = 1; i <= 16; i++) { p.set(i, 1, 0x4a80c0); p.set(1, i, 0x4a80c0); p.set(i, 16, 0x24548e); p.set(16, i, 0x24548e); }
  for (let i = 3; i <= 14; i++) {
    p.set(i, 3, 0xdcecff); p.set(3, i, 0xdcecff); p.set(i, 14, 0xdcecff); p.set(14, i, 0xdcecff);
    if (i % 2) { p.set(i, 4, 0x8ab4e6); p.set(4, i, 0x8ab4e6); }
  }
  p.outline(0x0e2240);
  return p;
}

/** Drafting paper edge: a ruled ink margin. slice 6. */
function draftFrame() {
  const p = new Px(18, 18);
  p.rect(1, 1, 16, 16, 0xf5ead0);
  for (let i = 1; i <= 16; i++) { p.set(i, 16, 0xd8c8a0); p.set(16, i, 0xd8c8a0); }
  for (let i = 3; i <= 14; i++) { p.set(i, 3, 0x3a5a8a); p.set(3, i, 0x3a5a8a); p.set(i, 14, 0x3a5a8a); p.set(14, i, 0x3a5a8a); }
  for (let i = 4; i <= 13; i++) { p.set(i, 4, 0x9ab0cc, 150); p.set(4, i, 0x9ab0cc, 150); }
  p.outline(P.edge);
  return p;
}

/** A chalk rectangle (hand-drawn: doubled strokes, overshooting corners): plan picks on the blueprint. slice 3. */
function chalkBox(on = false) {
  const p = new Px(12, 12);
  const c = on ? 0xffffff : 0xcfe2f8, c2 = on ? 0xe8f2ff : 0x8ab4e6;
  if (on) p.rect(2, 2, 8, 8, 0xffffff, 46);
  for (let i = 1; i <= 10; i++) { p.set(i, 1, c); p.set(i, 10, c); p.set(1, i, c); p.set(10, i, c); }
  for (let i = 3; i <= 8; i++) if (i % 2) { p.set(i, 2, c2, 150); p.set(2, i, c2, 150); }
  p.set(0, 1, c); p.set(11, 10, c); p.set(1, 11, c); p.set(10, 0, c);
  return p;
}

/** Brass gauge housing: a recessed slot with rivets at the ends. slice 3. */
function gaugeFrame() {
  const p = new Px(11, 9);
  p.rr(1, 1, 9, 7, 1, B.base);
  p.hl(2, 8, 1, B.hi); p.vl(1, 2, 6, B.lt); p.hl(2, 8, 7, B.dk); p.vl(9, 2, 6, B.dk);
  p.rect(3, 3, 5, 3, 0x2a1810);
  p.hl(3, 7, 3, 0x140a06);
  p.outline(B.ol);
  return p;
}

/** Glass tube of the thermometer: dark glass, a bright highlight down the left. slice 3. */
function tubeFrame() {
  const p = new Px(9, 9);
  p.rect(1, 0, 7, 9, 0x2a2224);
  for (let y = 0; y < 9; y++) { p.set(0, y, 0x0e0a0a); p.set(8, y, 0x0e0a0a); p.set(1, y, 0x8a9aa0); p.set(2, y, 0xe8f6f8, 160); p.set(7, y, 0x4a5a60); }
  return p;
}

/** Leather clipboard round the work order (activity panel). slice 9. */
function clipFrame() {
  const p = new Px(28, 28);
  p.rr(1, 1, 26, 26, 3, L.base);
  const D = p.dist(3);
  p.each((x, y) => {
    const d = D(x, y);
    if (d === 1) return x + y < 27 ? L.lt : L.dk;
    if (d === 2) return x + y < 27 ? mixHex(L.base, L.lt, 0.5) : mixHex(L.base, L.dk, 0.4);
    return undefined;
  });
  for (let i = 4; i <= 23; i++) if (i % 3 !== 0) { p.set(i, 4, L.stitch); p.set(i, 23, L.stitch); p.set(4, i, L.stitch); p.set(23, i, L.stitch); }
  p.rect(7, 7, 14, 14, P.base);
  for (let i = 7; i <= 20; i++) { p.set(i, 7, P.hi); p.set(20, i, P.dk); p.set(i, 20, P.dk); }
  p.outline(L.ol);
  return p;
}

/** The guild certificate: parchment with a red and gold double rule and flourished corners. slice 11. */
function certFrame() {
  const p = new Px(32, 32);
  p.rect(1, 1, 30, 30, P.base);
  const R = PAL.red;
  for (let i = 1; i <= 30; i++) { p.set(i, 1, P.dk); p.set(1, i, P.dk); p.set(i, 30, P.burn); p.set(30, i, P.burn); }
  for (let i = 4; i <= 27; i++) {
    p.set(i, 4, R.dk); p.set(4, i, R.dk); p.set(i, 27, R.dk); p.set(27, i, R.dk);
    p.set(i, 6, B.dk); p.set(6, i, B.dk); p.set(i, 25, B.dk); p.set(25, i, B.dk);
    if (i % 2 === 0 && i > 6 && i < 25) { p.set(i, 5, B.lt); p.set(5, i, B.lt); p.set(i, 26, B.lt); p.set(26, i, B.lt); }
  }
  // corner flourishes: a little diamond and a curl in each corner
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const X = (x) => (fx ? 31 - x : x), Y = (y) => (fy ? 31 - y : y);
    p.set(X(8), Y(8), R.base); p.set(X(9), Y(8), R.lt); p.set(X(8), Y(9), R.lt); p.set(X(9), Y(9), R.dk);
    p.set(X(7), Y(9), B.base); p.set(X(9), Y(7), B.base); p.set(X(10), Y(8), B.dk); p.set(X(8), Y(10), B.dk);
    p.set(X(2), Y(2), P.burn); p.set(X(3), Y(2), P.mid);
  }
  p.outline(P.edge);
  return p;
}

/** A rubber stamp's inked border (worn, a few gaps). slice 4. color = ink. */
function stampFrame(color) {
  const p = new Px(16, 12);
  for (let x = 1; x <= 14; x++) {
    if (hash(x, 1, 4) > 0.1) p.set(x, 1, color);
    if (hash(x, 2, 4) > 0.3) p.set(x, 2, color);
    if (hash(x, 10, 4) > 0.1) p.set(x, 10, color);
    if (hash(x, 9, 4) > 0.3) p.set(x, 9, color);
  }
  for (let y = 1; y <= 10; y++) {
    if (hash(1, y, 6) > 0.1) p.set(1, y, color);
    if (hash(2, y, 6) > 0.3) p.set(2, y, color);
    if (hash(14, y, 6) > 0.1) p.set(14, y, color);
    if (hash(13, y, 6) > 0.3) p.set(13, y, color);
  }
  for (let x = 4; x <= 11; x++) if (hash(x, 4, 8) > 0.5) p.set(x, 3, color, 70);
  return p;
}

// ---------------------------------------------------------------- sprites
/** Little flame (heat ranges, the thermometer's burner). Two frames side by side (9×12 each). */
function flameStrip() {
  const p = new Px(18, 12);
  const one = (ox, lean) => {
    const pts = (y) => { const w = Math.max(0, Math.sin(((y + 1) / 12) * Math.PI * 0.95) * 4.2 - (y < 4 ? (4 - y) * 0.5 : 0)); return w; };
    for (let y = 0; y < 12; y++) {
      const w = pts(y), cx = ox + 4.5 + lean * (1 - y / 11) * (y < 6 ? 1 : 0.4);
      for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) {
        const d = Math.abs(x + 0.5 - cx) / Math.max(0.5, w);
        if (d > 1) continue;
        const c = d < 0.35 && y > 4 ? 0xfff6c0 : d < 0.7 && y > 2 ? 0xffb030 : 0xe0501a;
        p.set(x, y, c);
      }
    }
  };
  one(0, -0.8); one(9, 0.8);
  const q = new Px(18, 12);
  q.blit(p);
  q.outline(0x5a1a08);
  return q;
}

/** Glass bulb of the thermometer (14×14): transparent belly so the glow behind shows through. */
function bulbSprite() {
  const p = new Px(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8.5);
    if (d > 7.2) continue;
    if (d > 6.2) p.set(x, y, 0x0e0a0a);
    else if (d > 5.4) p.set(x, y, x + y < 15 ? 0xa8b8bc : 0x3a4448);
  }
  // the neck into the tube
  p.rect(5, 0, 6, 3, 0); for (let y = 0; y < 3; y++) { p.set(4, y, 0x0e0a0a); p.set(11, y, 0x0e0a0a); p.set(5, y, 0x8a9aa0); p.set(10, y, 0x3a4448); }
  for (let y = 0; y < 3; y++) for (let x = 6; x < 10; x++) p.clear(x, y);
  // highlights on the glass
  p.set(5, 6, 0xffffff); p.set(5, 7, 0xe8f6f8); p.set(6, 5, 0xe8f6f8); p.set(4, 8, 0xd8eef0, 180);
  return p;
}

/** Brass cap above the glass tube with a hanging ring. 14×9. */
function capSprite() {
  const p = new Px(14, 9);
  for (const [x, y] of [[6, 0], [7, 0], [5, 1], [8, 1], [5, 2], [9, 2], [5, 3], [9, 3], [6, 4], [8, 4]]) p.set(x, y, B.lt);
  p.rr(2, 4, 10, 5, 1, B.base); p.hl(3, 10, 4, B.hi); p.hl(2, 11, 8, B.dk); p.vl(11, 5, 7, B.dk); p.vl(2, 5, 7, B.lt);
  p.set(4, 6, B.dd); p.set(9, 6, B.dd);
  p.outline(B.ol);
  return p;
}

/** A nailed chalk tray / the chalk sticks along the bottom of the board. 30×6. */
function chalkSticks() {
  const p = new Px(30, 6);
  p.rect(2, 2, 9, 3, 0xf4f4ec); p.hl(2, 10, 2, 0xffffff); p.hl(2, 10, 4, 0xc8ccc0);
  p.rect(14, 3, 5, 2, 0xf0d8e0); p.hl(14, 18, 3, 0xfff0f4);
  p.rect(22, 2, 6, 3, 0x6a6e66); p.hl(22, 27, 2, 0x8a8e86); // the duster
  p.rect(22, 0, 6, 2, W.lt); p.hl(22, 27, 0, W.hi);
  p.outline(INK);
  return p;
}

/** Chalk doodles: 'anvil' (an anvil and a hammer), 'spark', 'hen', 'flame', 'arrow'. */
function doodle(kind) {
  const c = CHALK, d = 0xb8c4bc;
  if (kind === 'anvil') {
    const p = new Px(30, 22);
    // anvil: horn to the left, face, waist, foot
    p.line(2, 9, 8, 7, c); p.line(2, 9, 8, 10, c); p.hl(8, 24, 7, c); p.vl(24, 7, 11, c); p.line(8, 10, 10, 11, c); p.hl(10, 24, 11, c);
    p.vl(12, 12, 15, c); p.vl(21, 12, 15, c); p.line(12, 15, 9, 18, c); p.line(21, 15, 24, 18, c); p.hl(9, 24, 19, c);
    // hammer, raised over it
    p.rect(15, 0, 7, 3, c, 200); p.line(20, 3, 26, 6, d);
    // spark ticks
    for (const [x, y] of [[13, 4], [11, 5], [26, 1], [27, 3]]) p.set(x, y, c);
    return p;
  }
  if (kind === 'hen') {
    const p = new Px(18, 16);
    p.ellipse(9, 9, 6, 4.5, c);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 18; x++) if (((x + 0.5 - 9) / 5) ** 2 + ((y + 0.5 - 9) / 3.5) ** 2 <= 1) p.clear(x, y);
    p.disk(4, 4.5, 2.2, c); p.clear(4, 4); p.clear(3, 4); p.clear(4, 5); p.clear(3, 5);
    p.set(3, 4, c); p.set(1, 5, 0xf0b040); p.set(0, 5, 0xf0b040); p.set(4, 1, 0xe05a4a); p.set(5, 2, 0xe05a4a);
    p.line(13, 6, 16, 3, c); p.line(14, 8, 17, 5, c);
    p.vl(8, 13, 15, d); p.vl(10, 13, 15, d); p.hl(7, 9, 15, d); p.hl(10, 12, 15, d);
    return p;
  }
  if (kind === 'spark') {
    const p = new Px(9, 9);
    p.vl(4, 0, 8, c); p.hl(0, 8, 4, c); p.set(2, 2, d); p.set(6, 6, d); p.set(6, 2, d); p.set(2, 6, d);
    return p;
  }
  if (kind === 'arrow') {
    const p = new Px(10, 7);
    p.hl(0, 8, 3, 0x6a4a2a); p.line(6, 0, 9, 3, 0x6a4a2a); p.line(6, 6, 9, 3, 0x6a4a2a);
    return p;
  }
  const p = new Px(9, 12);
  p.line(4, 0, 1, 7, c); p.line(4, 0, 7, 7, c); p.line(1, 7, 4, 11, c); p.line(7, 7, 4, 11, c); p.line(4, 5, 3, 9, d);
  return p;
}

/** Rune medallion for the step tracker (17×17). state: 'off' | 'on' | 'done'. */
const RUNES = {
  heat: ['..a..', '.a.a.', 'a...a', '.a.a.', '..a..', '.aaa.'],
  hammer: ['aaaaa', 'aaaaa', '..a..', '..a..', '..a..', '..a..'],
  grind: ['.aaa.', 'a...a', 'a.a.a', 'a...a', '.aaa.', '..a..'],
  balance: ['..a..', 'aaaaa', 'a.a.a', 'a.a.a', '..a..', '.aaa.'],
  quench: ['..a..', '.a.a.', '.a.a.', 'a...a', 'a...a', '.aaa.'],
  infuse: ['..a..', '.aaa.', 'a.a.a', '..a..', '.a.a.', 'a...a'],
  result: ['a.a.a', '.aaa.', 'aaaaa', '.aaa.', 'a.a.a', '.....'],
  shape: ['a...a', '.a.a.', '..a..', '.a.a.', 'a...a', '.....'],
};
function medalSprite(glyph, state) {
  const p = new Px(17, 17);
  const on = state === 'on', done = state === 'done';
  const rim = on ? B : done ? { hi: 0xe8f0c0, lt: 0xb8c880, base: 0x8aa058, dk: 0x5a7034, dd: 0x34441c, ol: 0x1a2410 } : { hi: 0xb0a090, lt: 0x8a7a6a, base: 0x6a5a4c, dk: 0x4a3e34, dd: 0x2e2620, ol: 0x1a1410 };
  p.disk(8.5, 8.5, 7.6, rim.base);
  p.each((x, y) => {
    const d = Math.hypot(x + 0.5 - 8.5, y + 0.5 - 8.5);
    if (d > 6.6) return x + y < 16 ? rim.hi : rim.dk;
    if (d > 5.6) return x + y < 16 ? rim.dk : rim.lt;
    return on ? 0x3a1a0a : done ? 0x24300f : 0x2a221c;
  });
  const g = RUNES[glyph] || RUNES.result;
  const col = on ? 0xffd34a : done ? 0xc8f08a : 0x8a7a6a;
  for (let y = 0; y < g.length; y++) for (let x = 0; x < 5; x++) if (g[y][x] === 'a') p.set(6 + x, 5 + y, col);
  if (on) for (let y = 0; y < g.length; y++) for (let x = 0; x < 5; x++) if (g[y][x] === 'a' && y < 2) p.set(6 + x, 5 + y, 0xfff4b0);
  p.outline(rim.ol);
  return p;
}

/** Wax seal for the certificate (26×26) in a grade's color, with a ring pressed in. */
function bigSeal(hex) {
  const p = new Px(28, 28);
  const base = hex, lt = mixHex(hex, 0xffffff, 0.3), hi = mixHex(hex, 0xffffff, 0.6), dk = shade(hex, 0.62), dd = shade(hex, 0.4);
  // blobby outline: a disk with drips
  p.disk(14, 14, 11, base);
  for (let a = 0; a < 14; a++) { const ang = (a / 14) * Math.PI * 2 + 0.3; const r = 11.5 + hash(a, 1, 2) * 1.8; p.disk(14 + Math.cos(ang) * r * 0.9, 14 + Math.sin(ang) * r * 0.9, 1.6, base); }
  p.each((x, y) => {
    const t = (x - 14) / 11 + (y - 14) / 11;
    const d = Math.hypot(x + 0.5 - 14, y + 0.5 - 14);
    if (d > 7.6 && d < 8.8) return t < 0 ? dk : lt; // pressed ring
    if (t < -1.0) return hi;
    if (t < -0.45) return lt;
    if (t > 0.95) return dk;
    return undefined;
  });
  p.set(8, 7, 0xffffff); p.set(9, 6, hi);
  p.outline(dd);
  return p;
}

/** Two ribbon tails hanging under the seal (20×16). */
function ribbonSprite(hex = 0xc23c2c) {
  const p = new Px(22, 16);
  const lt = mixHex(hex, 0xffffff, 0.3), dk = shade(hex, 0.6);
  p.poly([[5, 0], [10, 0], [7, 15], [4, 12], [1, 14]], hex);
  p.poly([[12, 0], [17, 0], [21, 14], [18, 12], [15, 15]], hex);
  p.line(6, 1, 4, 11, lt); p.line(13, 1, 17, 12, dk);
  p.outline(shade(hex, 0.35));
  return p;
}

/** Round metal token for the blueprint (16×16) in a metal's color. */
function tokenSprite(hex) {
  const p = new Px(16, 16);
  const hi = mixHex(hex, 0xffffff, 0.55), lt = mixHex(hex, 0xffffff, 0.25), dk = shade(hex, 0.66), dd = shade(hex, 0.45);
  p.disk(8, 8, 7, hex);
  p.each((x, y) => {
    const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
    const t = (x - 8) + (y - 8);
    if (d > 6) return t < 0 ? hi : dd;
    if (d > 5) return t < 0 ? dk : lt;
    if (t < -6) return lt;
    if (t > 6) return dk;
    return undefined;
  });
  p.set(5, 5, 0xffffff);
  p.outline(INK);
  return p;
}

/** A strip of masking tape (corners of pinned sheets). 14×6. */
function tapeSprite() {
  const p = new Px(14, 6);
  p.rect(1, 0, 12, 6, 0xe8dcae, 220);
  for (let y = 0; y < 6; y++) { if (y % 2) { p.clear(0, y); p.clear(13, y); } else { p.set(0, y, 0xe8dcae, 200); p.set(13, y, 0xe8dcae, 200); } }
  p.hl(1, 12, 0, 0xf6eccc, 230); p.hl(1, 12, 5, 0xc8b88a, 220);
  return p;
}

/** A nail (for hanging things off the board). 5×5. */
function nailSprite() {
  const p = new Px(5, 5);
  p.disk(2.5, 2.5, 2, 0x8a8a90); p.set(1, 1, 0xd8d8e0); p.set(3, 3, 0x4a4a50);
  p.outline(INK);
  return p;
}

/** The coop on its chicken legs, drawn as a blueprint-ink schematic (60×74) with numbered spots. */
function coopSketch() {
  const p = new Px(60, 76);
  const ink = 0x2e4f86, wash = 0x7f9fcf, red = 0xc23c2c;
  // roof (shingles) with a ridge lantern
  p.line(9, 30, 30, 12, ink); p.line(30, 12, 51, 30, ink); p.hl(7, 53, 31, ink);
  for (let y = 16; y < 31; y += 4) { const half = (y - 12) * 21 / 18; p.hl(Math.round(30 - half) + 2, Math.round(30 + half) - 2, y, wash); }
  p.vl(30, 6, 11, ink); p.box(28, 2, 5, 5, ink); p.set(30, 4, 0xf2c23a); p.set(29, 1, ink); p.set(31, 1, ink); p.hl(29, 31, 0, ink);
  // chimney with the chute funnel
  p.box(41, 14, 5, 9, ink); p.line(38, 8, 41, 14, ink); p.line(49, 8, 46, 14, ink); p.hl(38, 49, 8, ink);
  // log walls
  p.box(12, 31, 37, 23, ink);
  for (let y = 36; y < 54; y += 5) for (let x = 13; x <= 47; x++) if ((x + y) % 3) p.set(x, y, wash, 150);
  for (const x of [10, 49]) for (let y = 33; y < 54; y += 4) { p.set(x, y, ink); p.set(x + 1, y, ink); p.set(x, y + 1, ink); }
  // shelves on the side wall
  p.hl(14, 22, 40, ink); p.hl(14, 22, 46, ink); p.line(14, 41, 16, 43, ink); p.line(22, 41, 20, 43, ink);
  for (const x of [15, 18, 21]) p.rect(x, 37, 2, 3, wash);
  // round window with the hen, the nest box under it
  p.disk(35, 39, 4.6, 0xf5ead0);
  for (let a = 0; a < 32; a++) p.set(Math.round(35 + Math.cos(a / 32 * 6.283) * 4.6 - 0.5), Math.round(39 + Math.sin(a / 32 * 6.283) * 4.6 - 0.5), ink);
  p.disk(35, 40.5, 2.2, 0xffffff); p.set(34, 37, red); p.set(35, 37, red); p.set(32, 40, 0xf0b040); p.set(34, 39, INK);
  p.box(30, 45, 11, 4, ink); for (let x = 31; x < 40; x += 2) p.set(x, 46, 0xd8b050);
  // door
  p.box(24, 44, 5, 10, ink); p.set(27, 49, ink);
  // the legs: thighs, knees bending back, three toes forward and a spur
  for (const hx of [22, 38]) {
    p.line(hx, 54, hx - 4, 62, ink); p.line(hx + 2, 54, hx - 2, 62, ink);
    p.line(hx - 4, 62, hx + 1, 70, ink); p.line(hx - 2, 62, hx + 3, 70, ink);
    for (const ang of [-0.9, -0.2, 0.5]) p.line(hx + 2, 70, Math.round(hx + 2 + Math.cos(ang) * 6), Math.round(70 + Math.sin(ang) * 3 + 3), ink);
    p.line(hx + 2, 70, hx - 3, 72, ink);
    for (let y = 63; y < 70; y += 2) p.set(hx, y, wash);
  }
  return p;
}

/** Numbered callout disc (9×9) for the coop schematic. */
function calloutSprite(n) {
  const p = new Px(9, 9);
  p.disk(4.5, 4.5, 4, 0xc23c2c);
  const G = { 1: ['.a.', 'aa.', '.a.', '.a.', 'aaa'], 2: ['aa.', '..a', '.a.', 'a..', 'aaa'], 3: ['aa.', '..a', '.a.', '..a', 'aa.'], 4: ['a.a', 'a.a', 'aaa', '..a', '..a'], 5: ['aaa', 'a..', 'aa.', '..a', 'aa.'] }[n] || ['aaa', 'a.a', 'a.a', 'a.a', 'aaa'];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (G[y][x] === 'a') p.set(3 + x, 2 + y, 0xfff4e0);
  p.outline(0x5a140c);
  return p;
}

/** Big blueprint drawing of a weapon: the icon traced in white chalk with a pale wash. */
function blueprintWeapon(type, metal) {
  const src = new PixelCanvas(32);
  drawWeapon(src, type, METALS[metal]?.color ?? 0xa0a0a0, null);
  const p = new Px(36, 36);
  const A = (x, y) => (x >= 0 && y >= 0 && x < 32 && y < 32 ? src.alpha(x, y) : 0);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (A(x, y) < 100) continue;
    const edge = A(x - 1, y) < 100 || A(x + 1, y) < 100 || A(x, y - 1) < 100 || A(x, y + 1) < 100;
    const lum = ((src.getHex(x, y) >> 8) & 255) / 255;
    p.set(x + 2, y + 2, edge ? 0xffffff : lum > 0.62 ? 0xbcd8f6 : 0x8ab4e6, edge ? 255 : 150);
  }
  // dimension line under the drawing
  for (let x = 4; x < 32; x += 2) p.set(x, 34, 0xcfe2f8);
  p.vl(3, 32, 35, 0xcfe2f8); p.vl(32, 32, 35, 0xcfe2f8);
  return p;
}

// ---------------------------------------------------------------- registry
const SPRITES = {
  chalkT: chalkTile, blueT: blueTile, draftT: draftTile, corkT: corkTile,
  board: boardFrame, blue: blueFrame, draft: draftFrame, chalkBox: () => chalkBox(false), chalkBoxOn: () => chalkBox(true),
  gauge: gaugeFrame, tube: tubeFrame, clip: clipFrame, cert: certFrame,
  stampRed: () => stampFrame(0xb8301e), stampBlue: () => stampFrame(0x2a5aa8), stampGreen: () => stampFrame(0x3a7a2a), stampInk: () => stampFrame(0x3a2414),
  flame: flameStrip, bulb: bulbSprite, cap: capSprite, sticks: chalkSticks, tape: tapeSprite, nail: nailSprite,
  dAnvil: () => doodle('anvil'), dHen: () => doodle('hen'), dSpark: () => doodle('spark'), dArrow: () => doodle('arrow'), dFlame: () => doodle('flame'),
  coop: coopSketch, ribbon: () => ribbonSprite(),
  tackRed: () => null, tackBlue: () => null, tackGold: () => null, tackGreen: () => null,
};
const TACKS = { tackRed: 0xc23c2c, tackBlue: 0x3f7ec8, tackGold: 0xe8b83a, tackGreen: 0x5a9a3a };

/** Data URL of a named forge sprite. */
export function fart(key) {
  if (TACKS[key]) return SPR.tack(TACKS[key]);
  return art('fa:' + key, SPRITES[key]);
}
export const medal = (glyph, state = 'off') => art(`fa:medal:${glyph}:${state}`, () => medalSprite(glyph, state));
export const seal = (hex) => art(`fa:seal:${hex}`, () => bigSeal(hex));
export const ribbon = (hex) => art(`fa:ribbon:${hex}`, () => ribbonSprite(hex));
export const token = (hex) => art(`fa:token:${hex}`, () => tokenSprite(hex));
export const callout = (n) => art(`fa:callout:${n}`, () => calloutSprite(n));
export const blueprintURL = (type, metal) => art(`fa:bp:${type}:${metal}`, () => blueprintWeapon(type, metal));
export const metalHex = (metal) => METALS[metal]?.color ?? 0xa0a0a0;
export const infusionHex = (id) => INFUSIONS[id]?.color ?? 0xffffff;

/** Publish the frames and tiles as --fa-<key> on an element (the forge layer). */
export function installForgeArt(elm) {
  for (const k of Object.keys(SPRITES)) {
    const u = fart(k);
    if (u) elm.style.setProperty('--fa-' + k, `url("${u}")`);
  }
}

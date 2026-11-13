// Pixel art for the forge's decorated interface (drawn in code in art pixels, shown at the UI's
// --px scale; uiArt's art() draws it at 2× resolution and the r > 1 passes add the finer detail): the chalkboard over the bench, the smith's ledger, the weapon
// blueprint, the brass thermometer, rune medallions, gauges, the riveted forge-plate buttons,
// the guild certificate and its wax seal. Everything is cached through uiArt's art(); the frames
// and tiles are published on the forge layer as CSS custom properties (--fa-<key>).
import { Px, PAL, INK, art, mixHex, shade, cssUrl } from '../ui/uiArt.js';
import { blob, lumpDist } from '../iso/organic.js';
import { TONES, rivet, glint, quant, pnoise } from '../ui/craftArt.js';
import { SPR } from '../ui/uiSprites.js';
import { PixelCanvas } from '../gfx/PixelArt.js';
import { drawWeapon } from '../gfx/PixelArt.js';
import { METALS, INFUSIONS } from '../data/weapons.js';
import { bart, BOOK_KEYS } from './forgeBookArt.js';

const W = PAL.wood, B = PAL.brass, P = PAL.paper, L = PAL.leather;
const CHALK = 0xeef2e6, BT = TONES.brass;
const wrap = (v, n) => ((v % n) + n) % n;
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Chalkboard slate: deep green-grey with old chalk smudges. 32×32 tile. (Finer: chalk dust and grit.) */
function chalkTile() {
  const p = new Px(32, 32), r = p.r;
  p.fine((X, Y, fx, fy) => {
    const x = Math.floor(X), y = Math.floor(Y);
    const h = hash(x, y, 3);
    let c = h < 0.12 ? 0x2c3b33 : h > 0.93 ? 0x3c4c42 : 0x33433a;
    // wiped arcs of chalk dust
    const a = Math.sin((X + Y * 0.4) * 0.35) + Math.sin((Y - X * 0.3) * 0.22);
    if (a > 1.55 && hash(x, y, 9) > 0.35) c = mixHex(c, CHALK, 0.1);
    if (r > 1) {
      const g = hash(fx, fy, 21);
      if (g < 0.045) c = mixHex(c, CHALK, a > 1.2 ? 0.22 : 0.12); // a grain of chalk dust
      else if (g > 0.97) c = mixHex(c, 0x141c18, 0.45); // a pit in the slate
      else if (a > 1.35 && wrap(fx + fy * 2, 7) === 0 && g < 0.4) c = mixHex(c, CHALK, 0.07); // the cloth's wipe lines
    }
    return c;
  });
  return p;
}

/** Blueprint paper: Prussian blue with a fine grid and a heavier line every 8 px. 16×16 tile. (Finer: hairline grid.) */
function blueTile() {
  const p = new Px(16, 16), r = p.r;
  p.fine((X, Y, fx, fy) => {
    const x = Math.floor(X), y = Math.floor(Y), sx = fx % r, sy = fy % r;
    let c = hash(r > 1 ? fx : x, r > 1 ? fy : y, 5) < 0.1 ? 0x2a5c9c : 0x2d61a3;
    if ((x % 4 === 0 && sx === 0) || (y % 4 === 0 && sy === 0)) c = 0x3a70b2;
    else if (r > 1 && (x % 4 === 0 || y % 4 === 0)) c = 0x3268a9; // the hairline's soft side
    if (x % 8 === 0 || y % 8 === 0) c = (x % 8 === 0 && sx === 0) || (y % 8 === 0 && sy === 0) ? 0x4a80c0 : 0x3e74b4;
    return c;
  });
  return p;
}

/** Drafting paper: cream with a faint blue grid. 16×16 tile. (Finer: hairline grid, paper tooth.) */
function draftTile() {
  const p = new Px(16, 16), r = p.r;
  p.fine((X, Y, fx, fy) => {
    const x = Math.floor(X), y = Math.floor(Y), sx = fx % r, sy = fy % r;
    let c = hash(r > 1 ? fx : x, r > 1 ? fy : y, 7) < 0.12 ? 0xf0e4c6 : 0xf5ead0;
    if ((x % 4 === 0 && sx === 0) || (y % 4 === 0 && sy === 0)) c = 0xe2e0cc;
    if ((x % 8 === 0 && sx === 0) || (y % 8 === 0 && sy === 0)) c = 0xcfd6cc;
    else if (r > 1 && (x % 8 === 0 || y % 8 === 0)) c = 0xe2e0cc;
    return c;
  });
  return p;
}

/** Cork board for pinning things to. 24×24 tile. (Finer: every granule lit on its upper left.) */
function corkTile() {
  const p = new Px(24, 24), r = p.r;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const h = hash(x, y, 11), c = h < 0.18 ? 0x9a6a3e : h < 0.3 ? 0xc8945a : h > 0.9 ? 0x7a5230 : 0xb07c4a;
    p.set(x, y, c);
    if (r > 1) {
      const g = hash(x, y, 12);
      if (g < 0.5) { p.dot(x, y, mixHex(c, 0xf0c890, 0.25)); p.dot(x + 0.5, y + 0.5, mixHex(c, 0x3a2410, 0.3)); }
      else if (g < 0.62) p.dot(x + 0.5, y, 0x5a3a1e);
    }
  }
  return p;
}

// ---------------------------------------------------------------- frames (9-slice)
/** Heavy oak frame round the chalkboard, brass nails. slice 8. (Finer: hairline grain, a knot, domed nails.) */
function boardFrame() {
  const p = new Px(28, 28), r = p.r;
  p.fine((X, Y, fx, fy) => {
    const x = Math.floor(X), y = Math.floor(Y);
    if (x < 1 || y < 1 || x > 26 || y > 26) return undefined;
    const d = Math.min(x - 1, y - 1, 26 - x, 26 - y);
    if (d >= 7) return undefined;
    let c = W.base;
    const horiz = d === Math.min(y - 1, 26 - y), along = horiz ? x : y;
    if (d === 0) c = x + y < 27 ? W.hi : W.dk;
    else if (d === 1) c = x + y < 27 ? W.lt : W.base;
    else if (d === 5) c = x + y < 27 ? W.dk : W.lt;
    else if (d === 6) c = W.dd;
    else if ((along * 5 + d * 3) % 9 === 0) c = W.dk;
    else if ((along * 3 + d) % 11 === 0) c = W.lt;
    if (r > 1 && d >= 1 && d <= 5) {
      // hairline grain running along the rail, waving a little; the middle repeats every 12
      const aF = horiz ? X : Y, dF = horiz ? (y - 1 < 26 - y ? Y - 1 : 27 - Y) : (x - 1 < 26 - x ? X - 1 : 27 - X);
      const u = wrap(aF - 8, 12), g = wrap(dF * 1.6 + Math.sin((u / 12) * Math.PI * 2 + d) * 0.35, 1);
      if (g < 0.18) c = mixHex(c, W.dd, 0.35);
      else if (g > 0.86 && d !== 5) c = mixHex(c, W.hi, 0.18);
    }
    return c;
  });
  for (let i = 1; i <= 7; i++) { p.set(i, i, W.dd); p.set(27 - i, i, W.dd); p.set(i, 27 - i, W.dd); p.set(27 - i, 27 - i, W.dd); }
  if (r > 1) {
    // the mitre joints catch a hairline of light; a knot in the bottom-left corner block
    for (const [ax, ay, bx, by] of [[1.5, 1, 7.5, 7], [26.5, 1, 20.5, 7], [1.5, 27, 7.5, 21], [26.5, 27, 20.5, 21]]) p.fline(ax, ay, bx, by, W.lt, 120);
    for (const [kx, ky] of [[4.5, 21.5]]) {
      p.fdisk(kx, ky, 1.3, W.dk); p.fdisk(kx - 0.1, ky - 0.1, 0.7, W.dd); p.dot(kx - 0.5, ky - 1.5, W.hi, 120);
    }
  }
  for (const [x, y] of [[3, 3], [23, 3], [3, 23], [23, 23]]) {
    if (r > 1) rivet(p, x + 1, y + 1, BT, 0.95);
    else { p.set(x, y, B.hi); p.set(x + 1, y, B.base); p.set(x, y + 1, B.base); p.set(x + 1, y + 1, B.dd); }
  }
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

/** Leather clipboard round the work order (activity panel). slice 9. (Finer: saddle stitches, pores.) */
function clipFrame() {
  const p = new Px(28, 28), r = p.r;
  p.rr(1, 1, 26, 26, 3, L.base);
  const D = p.dist(3);
  p.each((x, y) => {
    const d = D(x, y);
    if (d === 1) return x + y < 27 ? L.lt : L.dk;
    if (d === 2) return x + y < 27 ? mixHex(L.base, L.lt, 0.5) : mixHex(L.base, L.dk, 0.4);
    return undefined;
  });
  for (let i = 4; i <= 23; i++) if (i % 3 !== 0) {
    p.set(i, 4, L.stitch); p.set(i, 23, L.stitch); p.set(4, i, L.stitch); p.set(23, i, L.stitch);
    if (r > 1) {
      // each stitch a slanted twist: a lit end, a shaded end sunk into its hole, the hole beyond
      const first = i % 3 === 1, h = 0.5;
      for (const [x, y, v] of [[i, 4, 0], [i, 23, 0], [4, i, 1], [23, i, 1]]) {
        if (v) { p.dot(x + h, y + (first ? 0 : h), mixHex(L.stitch, 0xffffff, 0.35)); p.dot(x, y + (first ? h : 0), mixHex(L.stitch, L.dk, 0.35)); if (!first) p.dot(x + h, y + 2 * h, L.dd); }
        else { p.dot(x + (first ? 0 : h), y, mixHex(L.stitch, 0xffffff, 0.35)); p.dot(x + (first ? h : 0), y + h, mixHex(L.stitch, L.dk, 0.35)); if (!first) p.dot(x + 2 * h, y + h, L.dd); }
      }
    }
  }
  p.rect(7, 7, 14, 14, P.base);
  for (let i = 7; i <= 20; i++) { p.set(i, 7, P.hi); p.set(20, i, P.dk); p.set(i, 20, P.dk); }
  if (r > 1) { p.fline(7, 7.5, 20.5, 7.5, P.base); p.fline(7, 6.5, 20.5, 6.5, L.dd, 120); p.fline(6.5, 7, 6.5, 20.5, L.dd, 120); } // the sheet's lip, its shadow in the leather
  p.outline(L.ol);
  return p;
}

/** The guild certificate: parchment with a red and gold double rule and flourished corners. slice 11. */
function certFrame() {
  const p = new Px(32, 32), r = p.r;
  p.rect(1, 1, 30, 30, P.base);
  const R = PAL.red;
  for (let i = 1; i <= 30; i++) { p.set(i, 1, P.dk); p.set(1, i, P.dk); p.set(i, 30, P.burn); p.set(30, i, P.burn); }
  for (let i = 4; i <= 27; i++) {
    p.set(i, 4, R.dk); p.set(4, i, R.dk); p.set(i, 27, R.dk); p.set(27, i, R.dk);
    p.set(i, 6, B.dk); p.set(6, i, B.dk); p.set(i, 25, B.dk); p.set(25, i, B.dk);
    if (i % 2 === 0 && i > 6 && i < 25) { p.set(i, 5, B.lt); p.set(5, i, B.lt); p.set(i, 26, B.lt); p.set(26, i, B.lt); }
  }
  if (r > 1) {
    // engraved: each rule a dark hairline over a lighter one (constant along the edges: it stretches)
    const h = 0.5, e = 1 - 1 / r;
    for (const [a, b, c] of [[4, 27, R.base], [6, 25, B.base]]) {
      p.fline(a + h, a + h, b + e, a + h, c); p.fline(a + h, a + h, a + h, b + e, c);
      p.fline(a + h, b + h, b + e, b + h, c); p.fline(b + h, a + h, b + h, b + e, c);
    }
    p.fline(2, 1 + h, 30 + e, 1 + h, P.mid); p.fline(1 + h, 2, 1 + h, 30 + e, P.mid);
  }
  // corner flourishes: a little diamond and a curl in each corner
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const X = (x) => (fx ? 31 - x : x), Y = (y) => (fy ? 31 - y : y);
    p.set(X(8), Y(8), R.base); p.set(X(9), Y(8), R.lt); p.set(X(8), Y(9), R.lt); p.set(X(9), Y(9), R.dk);
    p.set(X(7), Y(9), B.base); p.set(X(9), Y(7), B.base); p.set(X(10), Y(8), B.dk); p.set(X(8), Y(10), B.dk);
    p.set(X(2), Y(2), P.burn); p.set(X(3), Y(2), P.mid);
    if (r > 1) {
      // finer: the diamond's facets and a pen curl off it
      const o = (v, f) => (f ? v + 0.5 : v);
      p.dot(o(X(8), fx), o(Y(8), fy), R.hi); p.dot(o(X(9), !fx), o(Y(9), !fy), R.dd);
      p.dot(o(X(10), !fx), o(Y(10), !fy), B.dk); p.dot(o(X(11), fx), o(Y(10), !fy), B.dk); p.dot(o(X(10), fx), o(Y(11), fy), B.dk);
    }
  }
  p.outline(P.edge);
  return p;
}

/**
 * A forge-plate button (9-slice, slice 5 · fill, 26×15): a blackened iron strap riveted round a
 * face of the plate's material, lit from the top left, a bright arris, a dark front lip and a
 * brass rivet in each corner. kind: brass (default) · blue (blued steel) · green (verdigris
 * copper) · ink (smoked oak). down: pressed in (the lip goes, the top falls into shade).
 */
const PLATE = {
  brass: TONES.brass,
  blue: [0x0e1622, 0x16243a, 0x1e3250, 0x2a4468, 0x34567e, 0x426a94, 0x5a84ac, 0x7aa0c4, 0x9cbcd8, 0xc4daec],
  green: [0x10241a, 0x183424, 0x22462e, 0x2c5838, 0x386a42, 0x467c4c, 0x5a9058, 0x74a46a, 0x96bc84, 0xbcd6a6],
  ink: TONES.oak,
};
const IRON = [0x0c0a0a, 0x16120f, 0x221c18, 0x2e2620, 0x3c322a, 0x4c4036, 0x605246, 0x786858];
function forgePlate(kind = 'brass', down = false) {
  const W = 26, H = 15, pal = PLATE[kind] || PLATE.brass, p = new Px(W, H), r = p.r;
  p.fine((X, Y, fx, fy) => {
    const x = Math.floor(X), y = Math.floor(Y), sub = Y - y;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return INK;
    // the iron strap: two pixels deep, hammer-dimpled, lit on its top/left lips
    if (x <= 2 || y <= 2 || x >= W - 3 || y >= H - 3) {
      let k = 0.5 + (hash(r > 1 ? fx : x, r > 1 ? fy : y, 41) - 0.5) * 0.25;
      if (y === 1 || x === 1) k = down ? 0.35 : 0.85;
      if (y === H - 2 || x === W - 2) k = 0.12;
      if (!down && y === H - 3 && x > 2 && x < W - 3) k = 0.05; // the strap's shadow over the lip
      return quant(IRON, k, fx, fy, 0.35);
    }
    // the face: hammered, brighter at the top, a soft hammer pattern
    let k = 0.64 - (y - 3) * 0.035 + (pnoise(X / 3.5, Y / 2.5, 8, 8, kind.length * 7) - 0.5) * 0.2 + (hash(r > 1 ? fx : x, r > 1 ? fy : y, 44) - 0.5) * 0.05;
    if (down) k -= 0.1;
    if (!down) {
      if (y === 3) k = r > 1 && sub ? 0.86 : 0.95; // the arris
      else if (x === 3) k += 0.14;
      else if (x === W - 4) k -= 0.14;
      else if (y === H - 4) k -= 0.2; // the front lip
    } else if (y === 3) k = 0.22;
    return quant(pal, k, fx, fy, 0.4);
  });
  for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) p.clear(x, y);
  // four brass rivets in the strap's corners; a glint on the face
  for (const [x, y] of [[1.6, 1.6], [W - 2.4, 1.6], [1.6, H - 2.4], [W - 2.4, H - 2.4]]) {
    if (r > 1) rivet(p, x + 0.4, y + 0.4, TONES.brass, 0.95);
    else { p.set(Math.round(x), Math.round(y), B.hi); p.set(Math.round(x) + 1, Math.round(y) + 1, B.dk); }
  }
  if (!down) glint(p, 5, 4, 0xffffff, mixHex(pal[pal.length - 1], 0xffffff, 0.5), 200);
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

/** Chalk doodles: 'anvil' (an anvil and a hammer), 'spark', 'flame', 'arrow'. */
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
  // a hammered medal: nearly round, a little out of true (its rims follow the same outline)
  const LD = lumpDist(8.5, 8.5, 7.6, 7.6, { lump: 0.06, seed: 11 });
  blob(p, 8.5, 8.5, 7.6, 7.6, rim.base, 255, { lump: 0.06, seed: 11 });
  p.each((x, y) => {
    const d = LD(x, y) * 7.6;
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
  // a lumpy puddle of wax with drips round its edge, the ring pressed in following its shape
  const LD = lumpDist(14, 14, 11, 10.6, { lump: 0.1, seed: 13 });
  blob(p, 14, 14, 11, 10.6, base, 255, { lump: 0.1, seed: 13 });
  for (let a = 0; a < 14; a++) { const ang = (a / 14) * Math.PI * 2 + 0.3; const r = 11.5 + hash(a, 1, 2) * 1.8; blob(p, 14 + Math.cos(ang) * r * 0.9, 14 + Math.sin(ang) * r * 0.9, 1.6, 1.4, base, 255, { lump: 0.2, seed: a }); }
  p.each((x, y) => {
    const t = (x - 14) / 11 + (y - 14) / 11;
    const d = LD(x, y) * 11;
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
  // a struck token, a little out of true (its rims follow the same outline)
  const LD = lumpDist(8, 8, 7, 7, { lump: 0.06, seed: 17 });
  blob(p, 8, 8, 7, 7, hex, 255, { lump: 0.06, seed: 17 });
  p.each((x, y) => {
    const d = LD(x, y) * 7;
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
  // a hand-forged nail head: a lopsided lump, lit top-left
  p.rect(1, 1, 3, 3, 0x8a8a90); p.hl(2, 3, 0, 0x8a8a90); p.vl(0, 2, 3, 0x8a8a90); p.set(4, 2, 0x6a6a70);
  p.set(1, 1, 0xd8d8e0); p.set(2, 0, 0xb8b8c0); p.set(3, 3, 0x4a4a50);
  p.outline(INK);
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

// ---------------------------------------------------------------- finer detail (r > 1)
// Passes run after a sprite is drawn when its raster is finer than the art grid: what a hand-
// pixeller adds when the canvas doubles. At 1× (?hires=0) none of them run.
const fineOnly = (fn, post) => (...a) => { const p = fn(...a); if (p && p.r > 1) post(p, ...a); return p; };
const fineDots = (p, pred, fn) => { for (let fy = 0; fy < p.fh; fy++) for (let fx = 0; fx < p.fw; fx++) if (pred(fx, fy)) fn(fx, fy); };
/** Dry chalk on slate: strokes lose a grain here and there, a little dust falls beside them. */
function chalkify(p, seed = 1, amt = 1) {
  const near = (fx, fy) => p.fa(fx - 1, fy) || p.fa(fx + 1, fy) || p.fa(fx, fy - 1) || p.fa(fx, fy + 1);
  const dust = [];
  fineDots(p, (fx, fy) => !p.fa(fx, fy) && near(fx, fy) && hash(fx, fy, seed + 3) < 0.07 * amt, (fx, fy) => dust.push([fx, fy, p.fget(...[[fx - 1, fy], [fx + 1, fy], [fx, fy - 1], [fx, fy + 1]].find(([x, y]) => p.fa(x, y)))]));
  fineDots(p, (fx, fy) => p.fa(fx, fy) && hash(fx, fy, seed) < 0.16 * amt, (fx, fy) => { const i = (fy * p.fw + fx) * 4; p.d[i + 3] = Math.round(p.d[i + 3] * 0.45); });
  for (const [fx, fy, c] of dust) p.fset(fx, fy, c, 70);
}
function bulbFine(p) {
  // the glass: a curved reflection high on the left, a small one low on the right, the neck's rim lit
  for (let a = 3.5; a < 4.4; a += 0.05) p.dot(8 + Math.cos(a) * 4.7, 8.5 + Math.sin(a) * 4.7, 0xffffff, 200);
  for (let a = 0.35; a < 0.75; a += 0.08) p.dot(8 + Math.cos(a) * 4.9, 8.5 + Math.sin(a) * 4.9, 0xd8eef0, 120);
  p.dot(5.5, 0.5, 0xd8e6ea); p.dot(10, 0.5, 0x5a6a70);
}
function nailFine(p) {
  const F = [[0xd8d8e0, 0xb8b8c0, 0x9a9aa2], [0xb8b8c0, 0x8a8a90, 0x6a6a70], [0x9a9aa2, 0x6a6a70, 0x4a4a50]];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) p.dot(1.5 + i * 0.5, 1.5 + j * 0.5, F[j][i]);
  p.dot(2, 1, 0xf0f0f6); p.dot(3.5, 3.5, 0x3a3a40);
}
function tapeFine(p) {
  // crêpe paper: fine ridges across the strip, the torn ends fraying
  fineDots(p, (fx, fy) => p.fa(fx, fy) && fx % 3 === 0, (fx, fy) => p.fset(fx, fy, 0xbcae80, 70));
  fineDots(p, (fx, fy) => p.fa(fx, fy) && (fx < 3 || fx >= p.fw - 3) && hash(fx, fy, 61) < 0.35, (fx, fy) => p.fclear(fx, fy));
}
function sticksFine(p) {
  // chalk grain on the sticks, felt fibres on the duster
  fineDots(p, (fx, fy) => p.fa(fx, fy) > 200 && hash(fx, fy, 71) < 0.18, (fx, fy) => { const c = p.fget(fx, fy); p.fset(fx, fy, mixHex(c, (c & 0xff) > 200 ? 0x9aa098 : 0x2a2a28, 0.3)); });
}
function medalFine(p, glyph, state) {
  if (state === 'off') { glint(p, 4.5, 3, 0xd8c8b8, 0xb0a090, 120); return; }
  glint(p, 4.5, 3, 0xffffff, state === 'on' ? 0xfff3c0 : 0xe8f0c0, 190);
  p.dot(13, 13.5, 0x2a1a0a, 110);
}
function sealFine(p, hex) {
  // the wax: air bubbles burst on its face, a gloss along its lit shoulder
  const dk = shade(hex, 0.55), lt = mixHex(hex, 0xffffff, 0.45);
  for (let i = 0; i < 9; i++) {
    const a = hash(i, 1, 81) * Math.PI * 2, d = 2 + hash(i, 2, 81) * 6, x = 14 + Math.cos(a) * d, y = 14 + Math.sin(a) * d;
    p.dot(x, y, dk, 170); p.dot(x + 0.5, y + 0.5, lt, 120);
  }
  for (let a = 3.6; a < 4.5; a += 0.04) p.dot(14 + Math.cos(a) * 9.8, 14 + Math.sin(a) * 9.4, 0xffffff, 110);
}
function ribbonFine(p, hex = 0xc23c2c) {
  // silk: a sheen down each tail, the weave catching light in the folds
  const lt = mixHex(hex, 0xffffff, 0.55);
  p.fline(6.5, 1, 4.5, 11, lt, 150); p.fline(13.5, 1, 17.5, 12, lt, 90);
  fineDots(p, (fx, fy) => p.fa(fx, fy) && (fx + fy) % 4 === 0 && hash(fx, fy, 91) < 0.5, (fx, fy) => p.fset(fx, fy, shade(hex, 0.75), 80));
}
function tokenFine(p, hex) {
  glint(p, 5, 4.5, 0xffffff, mixHex(hex, 0xffffff, 0.6), 190);
  for (let a = 0; a < Math.PI * 2; a += 0.09) p.dot(8 + Math.cos(a) * 3.6, 8 + Math.sin(a) * 3.6, Math.cos(a) + Math.sin(a) < 0 ? shade(hex, 0.6) : mixHex(hex, 0xffffff, 0.35), 90); // the die's ring
}
function flameFine(p) {
  // a white-hot heart flickering inside each tongue, a spark lifting off
  for (const ox of [0, 9]) { p.dot(ox + 4.5, 8, 0xffffff); p.dot(ox + 4.5, 9, 0xffffff, 200); p.dot(ox + 4, 9.5, 0xfffbe0, 180); }
  p.dot(2.5, 1, 0xffd060, 180); p.dot(15, 0.5, 0xffd060, 160);
}
function capFine(p) { glint(p, 4, 5, 0xfff8e0, B.hi, 180); p.fline(3, 7.5, 10.5, 7.5, B.dd, 90); }

// ---------------------------------------------------------------- registry
const SPRITES = {
  chalkT: chalkTile, blueT: blueTile, draftT: draftTile, corkT: corkTile,
  board: boardFrame, blue: blueFrame, draft: draftFrame, chalkBox: () => chalkBox(false), chalkBoxOn: () => chalkBox(true),
  gauge: gaugeFrame, tube: tubeFrame, clip: clipFrame, cert: certFrame,
  plate: () => forgePlate('brass'), plateDn: () => forgePlate('brass', true), plateBlue: () => forgePlate('blue'), plateBlueDn: () => forgePlate('blue', true),
  plateGreen: () => forgePlate('green'), plateGreenDn: () => forgePlate('green', true), plateInk: () => forgePlate('ink'), plateInkDn: () => forgePlate('ink', true),
  flame: fineOnly(flameStrip, flameFine), bulb: fineOnly(bulbSprite, bulbFine), cap: fineOnly(capSprite, capFine), sticks: fineOnly(chalkSticks, sticksFine), tape: fineOnly(tapeSprite, tapeFine), nail: fineOnly(nailSprite, nailFine),
  dAnvil: fineOnly(() => doodle('anvil'), (p) => chalkify(p, 3)), dSpark: fineOnly(() => doodle('spark'), (p) => chalkify(p, 5)), dArrow: () => doodle('arrow'), dFlame: fineOnly(() => doodle('flame'), (p) => chalkify(p, 7)),
  ribbon: fineOnly(() => ribbonSprite(), ribbonFine),
  tackRed: () => null, tackBlue: () => null, tackGold: () => null, tackGreen: () => null,
};
const TACKS = { tackRed: 0xc23c2c, tackBlue: 0x3f7ec8, tackGold: 0xe8b83a, tackGreen: 0x5a9a3a };

/** Data URL of a named forge sprite. */
export function fart(key) {
  if (TACKS[key]) return SPR.tack(TACKS[key]);
  return art('fa:' + key, SPRITES[key], FOPTS[key]);
}
// finishing-pass options (src/ui/pxFine.js): no material texture on what CSS stretches, the cork has its own
const FLAT = { detail: false, edges: false };
const FOPTS = { corkT: FLAT, plate: FLAT, plateDn: FLAT, plateBlue: FLAT, plateBlueDn: FLAT, plateGreen: FLAT, plateGreenDn: FLAT, plateInk: FLAT, plateInkDn: FLAT, chalkBox: FLAT, chalkBoxOn: FLAT, gauge: FLAT, tube: FLAT, cert: FLAT, blueT: FLAT, draftT: FLAT, chalkT: FLAT };
export const medal = (glyph, state = 'off') => art(`fa:medal:${glyph}:${state}`, fineOnly(() => medalSprite(glyph, state), (p) => medalFine(p, glyph, state)), { brown: 'brass' });
export const seal = (hex) => art(`fa:seal:${hex}`, fineOnly(() => bigSeal(hex), (p) => sealFine(p, hex)), { brown: 'wax' });
export const ribbon = (hex) => art(`fa:ribbon:${hex}`, fineOnly(() => ribbonSprite(hex), (p) => ribbonFine(p, hex)), { brown: 'none' });
export const token = (hex) => art(`fa:token:${hex}`, fineOnly(() => tokenSprite(hex), (p) => tokenFine(p, hex)), { brown: 'brass' });
export const blueprintURL = (type, metal) => art(`fa:bp:${type}:${metal}`, fineOnly(() => blueprintWeapon(type, metal), (p) => chalkify(p, 9, 0.7)), FLAT);
export const metalHex = (metal) => METALS[metal]?.color ?? 0xa0a0a0;
export const infusionHex = (id) => INFUSIONS[id]?.color ?? 0xffffff;

/** Publish the frames and tiles as --fa-<key> on an element (the forge layer), the grimoire art too. */
export function installForgeArt(elm) {
  for (const k of Object.keys(SPRITES)) {
    const u = fart(k);
    if (u) elm.style.setProperty('--fa-' + k, cssUrl(u));
  }
  for (const k of BOOK_KEYS) {
    const u = bart(k);
    if (u) elm.style.setProperty('--fa-' + k, cssUrl(u));
  }
}

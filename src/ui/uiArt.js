// Procedural pixel art for the interface chrome. Everything is drawn at 1 art pixel =
// 1 canvas pixel and shown at an integer CSS scale (--px) with image-rendering: pixelated.
//  - Frames are 9-slice images used through CSS `border-image` (exposed as --a-* custom props).
//  - Tiles are seamless textures used as backgrounds (paper, leather grain, canvas, wood).
//  - Light always comes from the top-left.
import { makeRng, mixHex, shade } from '../core/util.js';
import { Px } from './px.js';
import * as CA from './craftArt.js';

// ---------------------------------------------------------------- raster (src/ui/px.js)
export { Px };

// ---------------------------------------------------------------- palettes
export const INK = 0x24150d;
export const PAL = {
  paper: { hi: 0xfcf3dc, base: 0xf2e1b9, mid: 0xe7d0a2, dk: 0xd4b47e, burn: 0xb48c56, edge: 0x6e4a2a },
  leather: { hi: 0xa87444, lt: 0x8c5a32, base: 0x704628, dk: 0x56341b, dd: 0x3f2412, ol: 0x22130a, stitch: 0xe6c690, stitchDk: 0x2c180b },
  wood: { hi: 0xc08a52, lt: 0xa06c3c, base: 0x83552e, dk: 0x643e20, dd: 0x482b15, ol: 0x26160c },
  brass: { hi: 0xfff3c0, lt: 0xf7d97c, base: 0xdcae4e, dk: 0xa8772c, dd: 0x6e4a1a, ol: 0x3a2410 },
  slate: { hi: 0x58665f, base: 0x38443f, dk: 0x2a3330, dd: 0x1d2422 },
  canvas: { hi: 0xdcc69c, base: 0xcfb789, dk: 0xbca277, dd: 0x9c8258, thread: 0x7a5a36 },
  red: { hi: 0xff9a7a, lt: 0xe8604a, base: 0xc23c2c, dk: 0x8a2418, dd: 0x5a140c },
  green: { hi: 0xc8f08a, lt: 0x8ac85a, base: 0x5a9a3a, dk: 0x3a6a24, dd: 0x22421a },
  amber: { hi: 0xffe8a0, lt: 0xf6be4a, base: 0xd9901e, dk: 0x9a5c10, dd: 0x5e3608 },
  blue: { hi: 0xbfe6ff, lt: 0x7fc0f0, base: 0x3f7ec8, dk: 0x2a5490, dd: 0x18305a },
  purple: { hi: 0xe8c8ff, lt: 0xb58ae0, base: 0x8256b8, dk: 0x56347e, dd: 0x30184a },
  oxblood: { hi: 0xb05a40, lt: 0x8e3c2a, base: 0x74291c, dk: 0x561a12, dd: 0x3a0f0a, ol: 0x1c0806 },
  moss: { hi: 0x9acb5a, lt: 0x6f9c3e, base: 0x4f7a2c, dk: 0x36561f, dd: 0x223614 },
  stone: { hi: 0xa8a096, lt: 0x8a8278, base: 0x6e675f, dk: 0x544e48, dd: 0x3a3632, ol: 0x1c1a18 },
};

// ---------------------------------------------------------------- frames (9-slice)
/** Leather with a stitched seam and brass corner rivets. slice 10. */
function leatherFrame(R = PAL.leather, stitch = R.stitch, rivets = true) {
  const p = new Px(32, 32);
  p.rr(1, 1, 30, 30, 4, R.base);
  const D = p.dist(3);
  p.each((x, y) => {
    const d = D(x, y);
    if (d === 1) return x + y < 31 ? R.lt : R.dk;
    if (d === 2) return x + y < 31 ? mixHex(R.base, R.lt, 0.5) : mixHex(R.base, R.dk, 0.35);
    return undefined;
  });
  // groove + stitches at inset 5
  const s = 5, e = 26;
  for (let i = s; i <= e; i++) {
    const on = (i % 4) < 2;
    // top & bottom rows
    p.set(i, s - 1, R.dk);
    p.set(i, e + 1, R.dk);
    p.set(s - 1, i, R.dk);
    p.set(e + 1, i, R.dk);
    if (on) {
      p.set(i, s, stitch); p.set(i, s + 1, R.stitchDk ?? R.dd);
      p.set(i, e, stitch); p.set(i, e + 1, R.stitchDk ?? R.dd);
      p.set(s, i, stitch); p.set(s + 1, i, R.stitchDk ?? R.dd);
      p.set(e, i, stitch); p.set(e + 1, i, R.stitchDk ?? R.dd);
    }
  }
  if (rivets) {
    const B = PAL.brass;
    for (const [cx, cy] of [[4, 4], [27, 4], [4, 27], [27, 27]]) {
      p.rect(cx - 1, cy - 1, 3, 3, B.dk);
      p.set(cx - 1, cy - 1, B.hi); p.set(cx, cy - 1, B.lt); p.set(cx - 1, cy, B.lt); p.set(cx, cy, B.base);
      p.set(cx + 1, cy + 1, B.dd);
    }
  }
  p.outline(R.ol);
  return p;
}

/** Slate board in a thin wooden frame (prompts). slice 5. */
function slateFrame() {
  const S = PAL.slate, W = PAL.wood;
  const p = new Px(16, 16);
  p.rr(1, 1, 14, 14, 1, W.base);
  p.hl(2, 13, 1, W.hi); p.vl(1, 2, 13, W.lt); p.hl(2, 13, 14, W.dk); p.vl(14, 2, 13, W.dk);
  p.hl(2, 13, 2, W.lt); p.vl(2, 3, 12, W.base);
  p.rect(3, 3, 10, 10, S.base);
  p.hl(3, 12, 3, S.dk); p.vl(3, 3, 12, S.dk);
  p.set(4, 4, S.hi); p.set(11, 11, S.hi);
  p.outline(INK);
  return p;
}

/** Key cap for <kbd>: ivory top, darker front face. slice 2/2/3/2 (fill = top face). */
function keyFrame(down = false) {
  const p = new Px(10, 10);
  const top = 0xf4e9cc, hi = 0xfffbf0, side = 0xd8c69e, front = 0xae9068, frontDk = 0x86694a;
  p.rect(1, 1, 8, 8, top);
  if (!down) { p.hl(1, 8, 1, hi); p.vl(1, 1, 6, hi); }
  p.vl(8, 2, 6, side);
  p.hl(1, 8, 7, down ? top : front);
  p.hl(1, 8, 8, down ? front : frontDk);
  p.set(1, 1, top); p.set(8, 1, side);
  p.outline(INK);
  p.clear(0, 0); p.clear(9, 0); p.clear(0, 9); p.clear(9, 9);
  return p;
}

/** 3×3 edge used by .btn: ink outline with cut corners (slice 1). */
function cutEdge() {
  const p = new Px(3, 3);
  p.set(1, 0, INK); p.set(0, 1, INK); p.set(2, 1, INK); p.set(1, 2, INK);
  return p;
}

/** Sewn canvas pocket (item slots). slice 6. */
function pocketFrame(on = false) {
  const C = PAL.canvas, B = PAL.brass;
  const p = new Px(18, 18);
  const fill = on ? 0xe2cfa4 : C.dk;
  p.rr(1, 1, 16, 16, 2, fill);
  // hem along the opening
  p.hl(2, 15, 1, on ? 0xf4e6c4 : C.hi);
  p.hl(1, 16, 2, on ? 0xf0e0ba : C.base);
  p.hl(1, 16, 3, on ? B.dk : C.dd);
  p.hl(2, 15, 4, mixHex(fill, C.dd, 0.35));
  // stitches
  const th = on ? B.dk : C.thread;
  for (let i = 3; i <= 14; i++) {
    if (i % 3 !== 2) { p.set(2, i + 1, th); p.set(15, i + 1, th); }
    if (i % 3 !== 2) p.set(i, 15, th);
  }
  p.vl(16, 4, 15, mixHex(fill, C.dd, 0.55));
  p.hl(2, 15, 16, mixHex(fill, C.dd, 0.55));
  p.outline(on ? B.dd : C.dd);
  return p;
}

/** Leather tool loop on the belt. slice 5. */
function loopFrame(on = false) {
  const L = PAL.leather, B = PAL.brass;
  const p = new Px(16, 18);
  p.rr(1, 1, 14, 16, 3, on ? L.lt : L.dk);
  const D = p.dist(3);
  p.each((x, y) => {
    const d = D(x, y);
    if (d === 1) return x + y < 16 ? (on ? L.hi : L.base) : L.dd;
    return undefined;
  });
  p.rect(3, 3, 10, 12, on ? mixHex(L.base, L.lt, 0.5) : mixHex(L.dk, L.dd, 0.4));
  p.hl(3, 12, 3, on ? L.dk : L.dd);
  const st = on ? B.lt : L.stitch;
  for (let i = 3; i <= 14; i += 2) { p.set(2, i, st); p.set(13, i, st); }
  p.outline(on ? B.dd : L.ol);
  return p;
}

/** Hanging wooden sign (two planks, nails). slice 6. */
function signFrame() {
  const W = PAL.wood, B = PAL.brass;
  const p = new Px(20, 18);
  p.rr(1, 1, 18, 16, 2, W.base);
  p.hl(2, 17, 1, W.hi); p.hl(2, 17, 2, W.lt);
  p.hl(1, 18, 8, W.dd); p.hl(1, 18, 9, W.lt);
  p.hl(2, 17, 15, W.dk); p.hl(2, 17, 16, W.dd);
  p.vl(18, 2, 15, W.dk);
  for (const [x, y] of [[3, 4], [16, 4], [3, 12], [16, 12]]) { p.set(x, y, B.lt); p.set(x, y + 1, B.dd); }
  p.outline(W.ol);
  return p;
}

/** Carved wooden slider track. slice 4. */
function trackFrame() {
  const W = PAL.wood;
  const p = new Px(12, 8);
  p.rr(1, 1, 10, 6, 2, W.dd);
  p.hl(2, 9, 1, W.ol); p.hl(2, 9, 6, W.lt); p.hl(2, 9, 2, mixHex(W.dd, W.ol, 0.5));
  p.outline(W.lt);
  return p;
}

/** Twine-tied cloth wrap (weapons in the backpack). slice 6. */
function clothFrame() {
  const c = 0xd8ccb0, c2 = 0xc4b694, c3 = 0xa8987a;
  const p = new Px(18, 18);
  p.rr(1, 1, 16, 16, 2, c);
  for (let y = 2; y < 16; y++) for (let x = 2; x < 16; x++) if ((x + y) % 5 === 0) p.set(x, y, c2);
  p.hl(2, 15, 15, c3); p.vl(15, 2, 15, c3);
  p.outline(0x6a5a44);
  return p;
}

/** Paper label with a punched, twine-tied end (pouch gold tag). slice 3/3/3/8, fixed 13 rows tall. */
function goldTagFrame() {
  const P = PAL.paper;
  const p = new Px(20, 13);
  p.poly([[5, 1], [19, 1], [19, 12], [5, 12], [1, 7], [1, 6]], 0xf7ead0);
  p.hl(5, 18, 11, P.mid); p.vl(18, 2, 11, P.mid);
  p.outline(P.edge);
  // twine knotted through the tip
  p.set(0, 6, 0xd8bb88); p.set(1, 6, 0xa8875a); p.set(0, 7, 0x7a5a36); p.set(2, 6, 0x7a5a36);
  return p;
}

/** Leather belt strap (horizontal tile, 14 rows). */
function beltTile() {
  const L = PAL.leather;
  const p = new Px(16, 14);
  p.rect(0, 0, 16, 14, L.base);
  p.hl(0, 15, 0, L.ol); p.hl(0, 15, 13, L.ol);
  p.hl(0, 15, 1, L.lt); p.hl(0, 15, 12, L.dd); p.hl(0, 15, 11, L.dk);
  for (let x = 0; x < 16; x++) { if (x % 4 < 2) { p.set(x, 3, L.stitch); p.set(x, 10, L.stitch); } p.set(x, 4, x % 4 < 2 ? L.dk : L.base); }
  for (const [x, y] of [[3, 6], [9, 7], [13, 5], [6, 8], [1, 7]]) p.set(x, y, L.dk);
  for (const [x, y] of [[5, 6], [11, 8]]) p.set(x, y, L.lt);
  return p;
}

// ---------------------------------------------------------------- tiles
function canvasTile() {
  const C = PAL.canvas;
  const p = new Px(8, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      let c = C.base;
      if (x % 2 === 0 && y % 2 === 0) c = mixHex(C.base, C.hi, 0.7);
      else if (x % 2 === 1 && y % 2 === 1) c = mixHex(C.base, C.dk, 0.5);
      p.set(x, y, c);
    }
  p.set(5, 2, C.dk); p.set(6, 2, C.dk); p.set(1, 6, mixHex(C.base, C.dk, 0.8));
  return p;
}

/** Gutter shadow strip for book pages (dithered, darkest at the spine). */
function gutterTile(right = false) {
  const p = new Px(10, 4);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 10; x++) {
      const d = right ? x : 9 - x; // distance from spine
      const t = 1 - d / 10;
      const bay = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y][x % 4] / 16;
      if (t * t * 1.1 > bay) p.set(x, y, 0x6e4a2a, Math.round(40 + 70 * t));
    }
  return p;
}

/** Charcoal smudge for undiscovered sketches. */
function smudgeTile() {
  const p = new Px(16, 16);
  const r = makeRng(12);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 7;
    p.set(Math.round(8 + Math.cos(a) * d), Math.round(8 + Math.sin(a) * d * 0.8), 0x4a3a30, 60 + r.int(0, 50));
  }
  return p;
}

// ---------------------------------------------------------------- registry
const cache = new Map();
export function art(key, fn) {
  if (!cache.has(key)) {
    let url = '';
    try { url = fn().url(); } catch (e) { console.warn('uiArt', key, e); }
    cache.set(key, url);
  }
  return cache.get(key);
}

const OAK = CA.TONES.wood, GREEN = CA.TONES.moss;
const LEATHER = [0x22130a, 0x2e1a0c, 0x3f2412, 0x4c2c16, 0x56341b, 0x623c20, 0x704628, 0x7e5030, 0x8c5a32, 0x9a6638, 0xa87444];
const ASSETS = {
  // frames (9-slices; the slice each CSS rule uses is noted)
  parch: () => CA.parchFrame(false), // 8
  parchDog: () => CA.parchFrame(true), // 8
  leather: () => leatherFrame(), // 10
  wood: () => CA.woodFrame(OAK), // 7
  brass: () => CA.brassFrame(), // 8
  slate: () => slateFrame(), // 5 (stretched)
  note: () => CA.noteFrame(), // 5
  key: () => keyFrame(false), // 2 2 3 2 (stretched)
  cut: () => cutEdge(), // 1
  pocket: () => pocketFrame(false),
  pocketOn: () => pocketFrame(true),
  loop: () => loopFrame(false),
  loopOn: () => loopFrame(true),
  sketch: () => CA.sketchFrame(), // 4
  cover: () => CA.coverFrame(CA.TONES.oxblood), // 12
  journal: () => CA.coverFrame(GREEN, { seed: 29 }), // 12
  sign: () => signFrame(), // 6 (stretched)
  signT: () => CA.signBoard(OAK), // 6, tiles (repeat)
  ticket: () => CA.ticketFrame(), // 6
  track: () => trackFrame(),
  goldTag: () => goldTagFrame(),
  beltT: () => beltTile(),
  cloth: () => clothFrame(),
  // buttons (top 2, sides 3, bottom 3; repeat across, stretch down)
  btnGold: () => CA.buttonFrame('gold'),
  btnGoldDn: () => CA.buttonFrame('gold', true),
  btnAlt: () => CA.buttonFrame('alt'),
  btnAltDn: () => CA.buttonFrame('alt', true),
  btnDanger: () => CA.buttonFrame('danger'),
  btnDangerDn: () => CA.buttonFrame('danger', true),
  btnWood: () => CA.buttonFrame('wood'),
  btnWoodDn: () => CA.buttonFrame('wood', true),
  // small pieces
  waxSeal: () => CA.waxSeal(), // 26×30
  eyelet: () => CA.eyelet(), // 7×7
  grainA: () => CA.grainOverlay(16, 16), // translucent grain over a flat colour
  rubber: () => CA.rubberOverlay(16, 16),
  ribbonV: () => CA.silkRibbon(), // 6×12, repeats down
  // tiles at their historical sizes (other stylesheets size them so)
  paperT: () => CA.paperTile(32, 32, { seed: 3, fibres: 0.9 }),
  pageT: () => CA.paperTile(32, 32, { seed: 4, rule: 16, fibres: 0.8 }),
  leatherT: () => CA.leatherTile(24, 24, LEATHER, { seed: 31 }),
  coverT: () => CA.leatherTile(24, 24, CA.TONES.oxblood, { seed: 33 }),
  journalT: () => CA.leatherTile(24, 24, GREEN, { seed: 35 }),
  canvasT: () => canvasTile(),
  woodT: () => CA.woodTile(32, 16, { plank: 8, seed: 3 }),
  woodDkT: () => CA.woodTile(32, 20, { plank: 10, seed: 6, pal: CA.TONES.woodDk }),
  slateT: () => CA.slateTile(24, 24),
  // big tiles (less repetition) for the panels: paper 96, page 96 (ruled every 16), leather 64, planks 96 wide
  paperL: () => CA.paperTile(96, 96, { seed: 5, stains: 1 }),
  pageL: () => CA.paperTile(96, 96, { seed: 8, rule: 16, fibres: 0.9, stains: 1 }),
  noteT: () => CA.noteTile(32, 32),
  coverL: () => CA.leatherTile(64, 64, CA.TONES.oxblood, { seed: 37, cell: 3.4 }),
  journalL: () => CA.leatherTile(64, 64, GREEN, { seed: 39, cell: 3.4 }),
  woodL: () => CA.woodTile(96, 32, { plank: 8, seed: 11 }),
  woodDkL: () => CA.woodTile(96, 40, { plank: 10, seed: 12, pal: CA.TONES.woodDk }),
  gutterL: () => gutterTile(false),
  gutterR: () => gutterTile(true),
  smudge: () => smudgeTile(),
};

export function asset(key) { return ASSETS[key] ? art(key, ASSETS[key]) : ''; }

/** Publish every frame/tile as a CSS custom property (--a-<key>) on :root. */
export function installArt(root = document.documentElement) {
  for (const k of Object.keys(ASSETS)) {
    const u = asset(k);
    if (u) root.style.setProperty('--a-' + k, `url("${u}")`);
  }
}

export { mixHex, shade };

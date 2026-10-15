// Hand-built pixel sprites for the diegetic interface: backpack, book, coin pouch, lantern,
// charms, calendar, touch controls, assay scale... Each returns a cached data URL.
import { Px, PAL, INK, art, mixHex } from './uiArt.js';

const L = PAL.leather, B = PAL.brass, W = PAL.wood, P = PAL.paper;

// ---------------------------------------------------------------- tiny 3×5 pixel font (for baked labels)
const GLYPHS = {
  D: ['110', '101', '101', '101', '110'], A: ['010', '101', '111', '101', '101'], Y: ['101', '101', '010', '010', '010'],
  F: ['111', '100', '110', '100', '100'], U: ['101', '101', '101', '101', '111'], L: ['100', '100', '100', '100', '111'],
};
function word(p, txt, x, y, c) {
  for (const ch of txt) {
    const g = GLYPHS[ch];
    if (g) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1') p.set(x + i, y + j, c);
    x += 4;
  }
}

// ---------------------------------------------------------------- backpack (HUD access point)
/** fill: 0 empty · 1 some · 2 bulging · 3 full (overflowing). */
function packSprite(fill = 0) {
  const p = new Px(30, 32);
  const b = [0, 1, 1, 2][fill];
  const bx = 5 - b, bw = 20 + b * 2, by = 10, bh = 20;
  const cx = 15;
  // handle loop
  for (let y = 2; y <= 7; y++)
    for (let x = 9; x <= 20; x++) {
      const dx = (x + 0.5 - cx) / 5.2, dy = (y + 0.5 - 7) / 5;
      const r = dx * dx + dy * dy;
      if (r <= 1 && r >= 0.42 && y <= 7) p.set(x, y, y < 4 ? L.base : L.dk);
    }
  // items peeking out when stuffed
  if (fill >= 2) {
    p.poly([[8, 9], [11, 4], [13, 9]], 0x7fd0ff); p.set(10, 6, 0xd8f4ff); p.set(11, 5, 0xffffff); p.vl(12, 7, 8, 0x3f7ec8);
    p.disk(19.5, 7.5, 2.6, 0xd9773f); p.set(18, 6, 0xf2a35e); p.set(20, 8, 0x9c4a24); p.set(21, 7, 0x6e5a4b);
  }
  if (fill >= 3) {
    p.line(22, 2, 25, 9, W.lt); p.line(23, 2, 26, 9, W.dk);
    p.rect(20, 1, 6, 2, 0x9aa0a8); p.set(20, 3, 0x6a7078); p.set(25, 0, 0xd8dde6);
    p.disk(15, 7, 2.2, 0xf2c23a); p.set(14, 6, 0xfff0a0);
  }
  // side pockets
  for (const sx of [bx - 2, bx + bw - 2]) {
    p.rr(sx, 17, 4, 10, 1, L.dk);
    p.hl(sx, sx + 3, 18, L.base);
  }
  // body
  p.rr(bx, by, bw, bh, 5, L.base);
  for (let y = by; y < by + bh; y++)
    for (let x = bx; x < bx + bw; x++) {
      if (!p.a(x, y) || p.get(x, y) !== L.base) continue;
      const fx = x - bx, fy = y - by;
      if (fx <= 1) p.set(x, y, L.lt);
      else if (fx === 2 && fy > 3) p.set(x, y, mixHex(L.base, L.lt, 0.5));
      else if (fx >= bw - 3) p.set(x, y, L.dk);
      if (fy >= bh - 3 && p.get(x, y) !== L.lt) p.set(x, y, fy >= bh - 2 ? L.dd : L.dk);
    }
  // front pocket
  const px0 = cx - 6, py0 = 20;
  p.rr(px0, py0, 12, 8, 2, mixHex(L.base, L.dk, 0.45));
  p.hl(px0 + 1, px0 + 10, py0, L.lt);
  p.hl(px0 + 1, px0 + 10, py0 + 1, L.dd);
  for (let x = px0 + 1; x <= px0 + 10; x += 2) p.set(x, py0 + 6, L.stitch);
  for (let y = py0 + 2; y <= py0 + 6; y += 2) { p.set(px0 + 1, y, L.stitch); p.set(px0 + 10, y, L.stitch); }
  p.set(cx - 1, py0 + 2, B.lt); p.set(cx, py0 + 2, B.base); p.set(cx - 1, py0 + 3, B.dk); p.set(cx, py0 + 3, B.dd);
  // flap (top) — on its own layer so it can cast a shadow line onto the body
  const fy0 = fill >= 3 ? 7 : 8;
  const f = new Px(30, 32);
  f.rr(bx + 1, fy0, bw - 2, 9, 4, L.lt);
  f.ellipse(cx, fy0 + 8, bw / 2 - 2.5, 3.2, L.lt);
  f.each((x, y) => {
    if (!f.a(x, y - 1) || (x <= bx + 2 && y < fy0 + 6)) return L.hi;
    if (!f.a(x, y + 1)) return L.base;
    if (!f.a(x + 1, y)) return L.base;
    return undefined;
  });
  for (let x = 0; x < 30; x++) for (let y = 31; y >= 0; y--) if (f.a(x, y)) { if (p.a(x, y + 1)) p.set(x, y + 1, L.dd); break; }
  p.blit(f);
  // flap stitching
  for (let x = bx + 4; x <= bx + bw - 5; x += 2) p.set(x, fy0 + 2, L.stitch);
  // strap + buckle
  p.rect(cx - 1, fy0 + 7, 2, 9, L.dk);
  p.vl(cx - 1, fy0 + 7, fy0 + 15, L.base);
  const by0 = fy0 + 9;
  p.box(cx - 2, by0, 4, 4, B.dk);
  p.hl(cx - 2, cx + 1, by0, B.hi); p.vl(cx - 2, by0, by0 + 3, B.lt);
  p.set(cx + 1, by0 + 3, B.dd);
  if (fill >= 3) p.rect(cx - 1, fy0 + 14, 2, 2, L.lt);
  p.outline(L.ol);
  return p;
}

/** The Index Book peeking out of the backpack (upright, slight lean). */
function bookPeekSprite() {
  const R = PAL.oxblood;
  const s = new Px(11, 16);
  // pages block at the top
  s.rect(1, 1, 9, 3, P.base);
  s.hl(1, 9, 2, P.dk);
  // ribbon tip
  s.vl(7, 0, 2, 0xe0503a); s.set(7, 0, 0xff8a6a);
  // front cover
  s.rect(0, 3, 10, 13, R.base);
  s.vl(0, 3, 15, R.dk); s.vl(1, 3, 15, R.lt);
  s.hl(2, 9, 3, R.hi);
  s.vl(9, 4, 15, R.dk);
  s.hl(1, 9, 15, R.dd);
  // gold title plate and brass corners
  s.rect(4, 7, 4, 2, B.base); s.hl(4, 7, 7, B.lt); s.set(7, 8, B.dk);
  s.set(9, 3, B.lt); s.set(8, 3, B.base); s.set(9, 4, B.base);
  s.set(9, 15, B.dk); s.set(8, 15, B.base); s.set(9, 14, B.base);
  s.vl(10, 2, 14, P.dk);
  // lean: shift upper rows right
  const p = new Px(14, 18);
  for (let y = 0; y < 16; y++) {
    const off = Math.floor((15 - y) / 6);
    for (let x = 0; x < 11; x++) if (s.a(x, y)) p.set(x + off + 1, y + 1, s.get(x, y));
  }
  p.outline(R.ol);
  return p;
}

/** Small closed pause journal with a pencil tucked in its band (the menu). */
function journalIcon() {
  const G = { lt: 0x6a9a50, base: 0x46703a, dk: 0x2e4e28 };
  const p = new Px(16, 17);
  p.rect(1, 2, 10, 13, G.base);
  p.vl(1, 2, 14, G.dk); p.vl(2, 2, 14, G.lt); p.hl(3, 10, 2, G.lt);
  p.vl(11, 3, 14, P.base); p.vl(11, 2, 14, P.dk);
  p.vl(8, 2, 14, 0x2a1a12);
  p.rect(4, 6, 3, 2, B.lt); p.set(6, 7, B.dk);
  // pencil
  p.vl(13, 1, 2, 0xe8908a); p.vl(14, 1, 2, 0xc86a64);
  p.vl(13, 3, 11, 0xf6d26a); p.vl(14, 3, 11, 0xd9a83a);
  p.set(13, 12, 0xe8c8a0); p.set(14, 12, 0xc8a070); p.set(13, 13, 0x3a3a40);
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- coin pouch & coins
function pouchSprite(open = false) {
  const C = { hi: 0xe6b070, lt: 0xc98a4a, base: 0xa86a34, dk: 0x7a4a20, dd: 0x52300f };
  const p = new Px(22, 22);
  // coins peeking out when open
  if (open) {
    p.disk(8.5, 3.5, 2.6, B.base); p.set(7, 2, B.hi); p.set(8, 2, B.lt); p.set(10, 5, B.dk);
    p.disk(13.5, 2.8, 2.4, B.lt); p.set(12, 2, B.hi); p.set(15, 4, B.dk);
  }
  // ruffle above the tie
  for (let x = 5; x <= 16; x++) {
    const top = 4 + ((x * 3) % 4 === 0 ? 1 : 0) - (open ? 1 : 0);
    for (let y = top; y <= 8; y++) p.set(x, y, y === top ? C.hi : y < 7 ? C.lt : C.base);
  }
  // body
  p.ellipse(11, 14.5, 8.6, 6.8, C.base);
  p.each((x, y, c) => {
    if (y < 8) return undefined;
    const t = (x - 11) / 8.6 + (y - 14.5) / 6.8;
    if (t < -0.9) return C.hi;
    if (t < -0.35) return C.lt;
    if (t > 0.9) return C.dd;
    if (t > 0.45) return C.dk;
    return c;
  });
  // drawstring tie
  p.hl(6, 15, 8, C.dd); p.hl(6, 15, 9, C.dk);
  for (let x = 7; x <= 14; x += 2) p.set(x, 8, 0xe8d0a0);
  // cord ends + bead
  p.line(15, 9, 18, 13, 0xe8d0a0); p.set(19, 14, 0xc23c2c); p.set(18, 14, 0xe8604a);
  // stitched coin emblem
  p.disk(11, 15, 2.6, B.base); p.set(10, 14, B.hi); p.set(12, 16, B.dk); p.set(11, 15, B.dk);
  p.outline(INK);
  return p;
}

/** Spinning coin strip: 4 frames of 8×8 (face, three-quarter, edge, three-quarter). */
function coinStrip() {
  const p = new Px(32, 8);
  const draw = (ox, rx) => {
    if (rx < 1) { p.rect(ox + 3, 1, 2, 6, B.dk); p.vl(ox + 3, 1, 6, B.lt); p.set(ox + 3, 0, B.dd); p.set(ox + 4, 7, B.dd); return; }
    p.ellipse(ox + 4, 4, rx, 3.6, B.base);
    for (let y = 0; y < 8; y++) for (let x = ox; x < ox + 8; x++) {
      if (!p.a(x, y)) continue;
      const t = (x - ox - 4) / rx + (y - 4) / 3.6;
      p.set(x, y, t < -0.8 ? B.hi : t < -0.2 ? B.lt : t > 0.8 ? B.dk : B.base);
    }
    if (rx > 2.5) { p.set(ox + 4, 3, B.dk); p.set(ox + 4, 4, B.dk); p.set(ox + 3, 4, B.lt); }
  };
  draw(0, 3.6); draw(8, 2.4); draw(16, 0); draw(24, 2.4);
  const q = new Px(32, 8);
  q.blit(p);
  for (let f = 0; f < 4; f++) {
    // per-frame outline
    const fr = new Px(8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (p.a(f * 8 + x, y)) fr.set(x, y, p.get(f * 8 + x, y));
    fr.outline(B.dd);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (fr.a(x, y)) q.set(f * 8 + x, y, fr.get(x, y));
  }
  return q;
}

// ---------------------------------------------------------------- lantern (energy)
const IRON = { lt: 0x6a6870, base: 0x46444c, dk: 0x2e2c32 };
/** level 0..4: flame size. */
function lanternSprite(level = 4) {
  const p = new Px(14, 24);
  const cx = 7;
  // hook ring
  p.box(cx - 1, 0, 2, 1, B.base);
  p.set(cx - 2, 1, B.lt); p.set(cx + 1, 1, B.dk); p.set(cx - 2, 2, B.base); p.set(cx + 1, 2, B.dk);
  p.hl(cx - 1, cx, 3, B.dk);
  // cap
  p.hl(cx - 1, cx, 4, IRON.base);
  p.hl(cx - 3, cx + 2, 5, IRON.base); p.set(cx - 3, 5, IRON.lt);
  p.hl(cx - 4, cx + 3, 6, IRON.dk); p.set(cx - 4, 6, IRON.base);
  p.hl(cx - 5, cx + 4, 7, B.base); p.set(cx - 5, 7, B.lt); p.set(cx + 4, 7, B.dk);
  // glass chamber
  const lit = level / 4;
  const glass = mixHex(0x3a3024, 0xffd98a, 0.25 + lit * 0.6);
  const glassDk = mixHex(0x2a2218, 0xf2a84a, 0.2 + lit * 0.55);
  p.rect(cx - 4, 8, 8, 10, glass);
  for (let y = 8; y < 18; y++) { p.set(cx - 4, y, glassDk); p.set(cx + 3, y, glassDk); }
  p.vl(cx - 5, 8, 17, IRON.base); p.vl(cx + 4, 8, 17, IRON.dk);
  p.vl(cx - 3, 9, 12, mixHex(glass, 0xffffff, 0.55));
  // flame (hand-shaped per level): o outer, y yellow, w white core, r ember red, k wick
  const FL = [
    ['........', '........', '........', '........', '........', '........', '........', '...r....', '...kk...'],
    ['........', '........', '........', '........', '........', '....r...', '...rr...', '...or...', '...kk...'],
    ['........', '........', '........', '....o...', '...oo...', '...ooo..', '..ooyo..', '...oo...', '...kk...'],
    ['........', '........', '....o...', '...oo...', '...oyo..', '..oyyo..', '..oywo..', '...yy...', '...kk...'],
    ['....o...', '...oo...', '...oyo..', '..oyyo..', '..oywo..', '..oywwo.', '..oywwo.', '...yy...', '...kk...'],
  ][level];
  p.tpl(FL, { o: level <= 1 ? 0xff7a3a : 0xff9a3a, y: 0xffd34a, w: 0xfff6c0, r: 0xe0502a, k: IRON.dk }, cx - 4, 8);
  // base
  p.hl(cx - 5, cx + 4, 18, B.base); p.set(cx - 5, 18, B.lt); p.set(cx + 4, 18, B.dk);
  p.hl(cx - 4, cx + 3, 19, B.dk);
  p.hl(cx - 3, cx + 2, 20, IRON.dk);
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- buff charms
const CHARM_TPL = {
  glow: { rows: ['.aaaaa.', 'aAAaAAa', 'aaaaaaa', 'bbbbbbb', '..ccc..', '..ccc..', '..cCc..', '..ccc..'], pal: { a: 0x5aaaf0, A: 0xd8f4ff, b: 0x2a5ab0, c: 0xf0e2c0, C: 0xc8b48a } },
  warm: { rows: ['...g...', '..ggr..', '..rrr..', '.rRrr..', '.rrrr..', '..rrr..', '...rr..', '....r..', '.....r.'], pal: { g: 0x5a9a3a, r: 0xd9402a, R: 0xff9a7a } },
  cool: { rows: ['...a...', '.a.a.a.', '..aAa..', 'aaAAAaa', '..aAa..', '.a.a.a.', '...a...'], pal: { a: 0x9ae6ff, A: 0xffffff } },
  bouncy: { rows: ['..ppp..', '.pPPpp.', 'pPppppp', 'ppppppp', 'ppppppp', '.ppppp.', '..ppp..'], pal: { p: 0xb58ae0, P: 0xffffff } },
  zippy: { rows: ['...yy..', '..yy...', '.yy....', 'yyyyyy.', '...yy..', '..yy...', '.yy....', 'y......'], pal: { y: 0xffd84a } },
  lucky: { rows: ['.gg.gg.', 'gGgggGg', 'ggg.ggg', '...s...', 'ggg.ggg', 'gGgggGg', '.gg.gg.', '....s..', '.....s.'], pal: { g: 0x5aaa3a, G: 0xa8e06a, s: 0x3a6a24 } },
  sense: { rows: ['...v...', '..vVv..', '.vVvvv.', 'vvkkkvv', '.vvvvv.', '..vvv..', '...v...'], pal: { v: 0xa878e0, V: 0xe8d0ff, k: 0x2a1640 } },
  sturdy: { rows: ['sssssss', 'sSSsSSs', 'sSsssSs', 'ssssss.', '.sssss.', '..sss..', '...s...'], pal: { s: 0xc9a050, S: 0xf0d890 } },
};
function charmSprite(id) {
  const t = CHARM_TPL[id] || CHARM_TPL.lucky;
  const p = new Px(11, 15);
  // string ring
  p.set(5, 0, B.base); p.set(4, 1, B.lt); p.set(6, 1, B.dk); p.set(5, 2, B.dk);
  p.set(5, 3, 0xe8d0a0);
  p.tpl(t.rows, t.pal, 2, 4);
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- tear-off calendar page
function calendarSprite(torn = false) {
  const p = new Px(30, 34);
  const R = PAL.red;
  if (!torn) {
    // pad of pages underneath
    p.rect(2, 30, 26, 3, P.dk); p.hl(2, 27, 31, P.mid);
  }
  // page
  p.rect(1, 4, 28, 27, P.base);
  p.hl(1, 28, 30, P.dk);
  p.vl(28, 5, 30, P.mid);
  // red header band
  p.rect(1, 4, 28, 8, R.base);
  p.hl(1, 28, 4, R.lt); p.hl(1, 28, 11, R.dk);
  word(p, 'DAY', 10, 6, 0xfff0d8);
  if (torn) {
    for (let x = 1; x <= 28; x++) if ((x * 7) % 3 === 0) p.clear(x, 4);
  } else {
    // binding bar + rings
    p.rect(0, 2, 30, 3, IRON.base); p.hl(0, 29, 2, IRON.lt); p.hl(0, 29, 4, IRON.dk);
    for (const rx of [8, 21]) { p.vl(rx, 0, 6, B.lt); p.vl(rx + 1, 0, 6, B.dk); p.set(rx, 0, B.hi); }
  }
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- depth plumb-bob
function plumbSprite() {
  const p = new Px(8, 13);
  p.vl(3, 0, 3, 0xe8d0a0);
  p.hl(2, 4, 4, B.dk); p.set(2, 4, B.lt);
  p.poly([[1, 5], [7, 5], [4, 12]], B.base);
  p.vl(2, 5, 7, B.hi); p.vl(5, 6, 8, B.dk); p.set(4, 11, B.dk);
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- toast bits: tack & wax seals
function tackSprite(c = 0xc23c2c) {
  const p = new Px(8, 9);
  p.disk(4, 3.5, 3, c);
  p.set(3, 2, mixHex(c, 0xffffff, 0.6)); p.set(2, 3, mixHex(c, 0xffffff, 0.3));
  p.set(5, 5, mixHex(c, 0x000000, 0.4)); p.set(4, 5, mixHex(c, 0x000000, 0.25));
  p.vl(4, 7, 8, 0x8a8a90);
  p.outline(INK);
  return p;
}
const SEAL = { red: PAL.red, green: PAL.green, amber: PAL.amber, brown: { hi: 0xd8a070, lt: 0xb07a46, base: 0x83552e, dk: 0x5e3a1f, dd: 0x3a2412 }, blue: PAL.blue, purple: PAL.purple };
/** Wax seal (12×12). mark: 'ring' | 'x' | 'check' | 'star'. */
function sealSprite(color = 'red', mark = 'ring') {
  const R = SEAL[color] || SEAL.red;
  const p = new Px(13, 13);
  p.disk(6.5, 6.5, 5.2, R.base);
  for (const [x, y] of [[1, 4], [11, 7], [5, 0], [8, 12], [0, 8], [12, 4]]) p.set(x, y, R.base);
  p.each((x, y, c) => {
    const t = (x - 6.5) / 5 + (y - 6.5) / 5;
    if (t < -1.1) return R.hi;
    if (t < -0.5) return R.lt;
    if (t > 0.9) return R.dk;
    return c;
  });
  if (mark === 'ring') {
    for (let a = 0; a < 24; a++) {
      const x = Math.round(6 + Math.cos((a / 24) * Math.PI * 2) * 3), y = Math.round(6 + Math.sin((a / 24) * Math.PI * 2) * 3);
      p.set(x, y, a > 3 && a < 14 ? R.lt : R.dk);
    }
    p.set(6, 6, R.dk);
  } else if (mark === 'x') {
    for (let i = -2; i <= 2; i++) { p.set(6 + i, 6 + i, R.dd); p.set(6 + i, 6 - i, R.dd); p.set(7 + i, 6 + i, R.lt); }
  } else if (mark === 'check') {
    p.set(4, 6, R.hi); p.set(5, 7, R.hi); p.set(6, 8, R.hi); p.set(7, 7, R.hi); p.set(8, 6, R.hi); p.set(9, 5, R.hi); p.set(10, 4, R.hi);
    p.set(5, 8, R.dd); p.set(6, 9, R.dd); p.set(7, 8, R.dd); p.set(8, 7, R.dd);
  } else if (mark === 'star') {
    p.vl(6, 3, 9, R.hi); p.hl(3, 9, 6, R.hi); p.set(5, 5, R.hi); p.set(7, 7, R.hi); p.set(7, 5, R.hi); p.set(5, 7, R.hi);
  }
  p.set(3, 3, mixHex(R.hi, 0xffffff, 0.5));
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- touch controls
const STONE = PAL.stone;
function stickSprite() {
  const p = new Px(52, 52);
  const c = 25.5;
  p.disk(c, c, 25, STONE.base);
  p.each((x, y) => {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy);
    const lit = -(dx + dy) / (r || 1);
    let col = STONE.base;
    if (r > 22.5) col = lit > 0.35 ? STONE.hi : lit > -0.2 ? STONE.lt : STONE.dk;
    else if (r > 21.5) col = lit > 0 ? STONE.lt : STONE.dd;
    else if (r > 16.5) col = STONE.base;
    else if (r > 15.4) col = lit > 0 ? STONE.dd : STONE.lt;
    else col = r > 14.5 ? STONE.dd : STONE.dk;
    if ((x * 13 + y * 7) % 23 === 0 && r < 21) col = mixHex(col, STONE.dd, 0.5);
    if ((x * 5 + y * 11) % 29 === 0 && r < 21) col = mixHex(col, STONE.hi, 0.4);
    return col;
  });
  // carved arrows
  const arrow = (ax, ay, dx, dy) => {
    for (let i = 0; i < 4; i++) for (let j = -i; j <= i; j++) {
      const x = ax + dx * (3 - i) + (dy ? j : 0), y = ay + dy * (3 - i) + (dx ? j : 0);
      p.set(x, y, STONE.dd);
      p.set(x + 1, y + 1, STONE.lt);
    }
  };
  arrow(25, 2, 0, -1); arrow(25, 46, 0, 1); arrow(2, 25, -1, 0); arrow(46, 25, 1, 0);
  // moss tufts and a crack
  for (const [x, y] of [[8, 40], [9, 41], [10, 41], [7, 39], [11, 42], [41, 9], [42, 10], [12, 43], [6, 37], [44, 12]]) p.set(x, y, (x + y) % 2 ? PAL.moss.base : PAL.moss.lt);
  p.line(36, 39, 40, 35, STONE.dd); p.line(40, 35, 42, 36, STONE.dd);
  p.outline(STONE.ol);
  return p;
}
function knobSprite() {
  const p = new Px(24, 24);
  const c = 11.5, R = 10.5;
  p.disk(c, c, R, B.base);
  p.each((x, y) => {
    const nx = (x + 0.5 - c) / R, ny = (y + 0.5 - c) / R;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const l = -nx * 0.55 - ny * 0.65 + nz * 0.55;
    if (Math.hypot(nx + 0.35, ny + 0.4) < 0.22) return B.hi;
    if (l > 0.62) return B.lt;
    if (l > 0.25) return B.base;
    if (l > -0.1) return B.dk;
    return B.dd;
  });
  for (let a = 0; a < 32; a++) {
    const x = Math.round(c - 0.5 + Math.cos((a / 32) * Math.PI * 2) * 6), y = Math.round(c - 0.5 + Math.sin((a / 32) * Math.PI * 2) * 6);
    p.set(x, y, a > 4 && a < 20 ? B.lt : B.dk);
  }
  p.outline(B.ol);
  return p;
}
/** Round carved wooden button with a brass rim. */
function roundBtnSprite(down = false) {
  const p = new Px(30, 31);
  const c = 14.5, oy = down ? 1 : 0;
  // drop/depth
  if (!down) p.disk(c, c + 1.5, 13.5, W.dd);
  p.disk(c, c + oy, 13.5, B.dk);
  p.each((x, y) => {
    const dx = x + 0.5 - c, dy = y + 0.5 - c - oy, r = Math.hypot(dx, dy);
    if (r > 13.6) return undefined;
    const lit = -(dx + dy) / (r || 1);
    if (r > 12.4) return lit > 0.3 ? B.lt : lit > -0.3 ? B.base : B.dk;
    if (r > 11.4) return lit > 0 ? B.dd : B.base;
    // wooden face
    let col = down ? W.dk : W.base;
    if (r > 10) col = lit > 0 ? W.dd : (down ? W.base : W.lt);
    else if (lit > 0.55 && r > 7) col = down ? W.base : W.lt;
    if (Math.sin((y + Math.sin(x * 0.35) * 2) * 1.3) > 0.92 && r < 10) col = mixHex(col, W.dd, 0.45);
    return col;
  });
  p.outline(INK);
  return p;
}

const ICONS = {
  crouch: ['...aaa...', '...aaa...', '...aaa...', '.aaaaaaa.', '..aaaaa..', '...aaa...', '....a....', '.........', 'aaaaaaaaa'],
  jump: ['....a....', '...aaa...', '..aaaaa..', '.aaaaaaa.', '...aaa...', '...aaa...', '...aaa...', '.........', '.a.a.a.a.'],
  use: ['...a.a...', '..aa.aa.a', '..aa.aa.a', '..aa.aa.a', 'a.aaaaaaa', 'aaaaaaaaa', '.aaaaaaa.', '..aaaaa..', '...aaa...'],
  snack: ['......a..', '.....a...', '..aaaaa..', '.aAaaaaa.', 'aaaaaaaaa', 'aaaaaaaaa', '.aaaaaaa.', '..aaaaa..', '.........'],
  tool: ['.aaaaaa..', 'aa....aa.', '...aa..a.', '..a.aa...', '.a...aa..', 'a.....aa.', '.......a.', '.a....a..', '..aaaa...'],
  build: ['aaaa.....', 'aaaaa....', 'aaaa.a...', 'a....a...', '......a..', '.......a.', '........a', '.........', '.........'],
  talk: ['.aaaaaaa.', 'aaaaaaaaa', 'aa.a.a.aa', 'aaaaaaaaa', '.aaaaaaa.', '..aa.....', '.a.......', '.........', '.........'],
  rotate: ['..aaaa...', '.a....a..', 'a......a.', 'a.....aaa', 'a......a.', '.a.......', '..aaaa...', '.........', '.........'],
  done: ['.........', '........a', '.......aa', 'a.....aa.', 'aa...aa..', '.aa.aa...', '..aaa....', '...a.....', '.........'],
  back: ['...a.....', '..aa.....', '.aaaaaaa.', 'aaaaaaaaa', '.aaaaaaaa', '..aa...aa', '...a...aa', '.......aa', '.....aaa.'],
  menu: ['aaaaaaaaa', '.........', 'aaaaaaaaa', '.........', 'aaaaaaaaa', '.........', '.........', '.........', '.........'],
};
function iconSprite(name, color = 0xf6e8c8) {
  const p = new Px(11, 11);
  p.tpl(ICONS[name] || ICONS.use, { a: color, A: 0xffffff }, 1, 1);
  p.outline(0x2a1a10);
  return p;
}

/** Pointing paw for touch prompts ("tap"). */
function tapSprite() {
  const p = new Px(11, 13);
  p.tpl([
    '...aa....',
    '...aa....',
    '...aa....',
    '...aaaaa.',
    '.a.aaaaaa',
    '.aaaaaaaa',
    '.aaaaaaaa',
    '..aaaaaa.',
    '..aaaaaa.',
    '...aaaa..',
  ], { a: 0xf6dcc0 }, 1, 1);
  p.set(4, 1, 0xffffff); p.set(4, 2, 0xffffff);
  p.outline(INK);
  // ripple marks
  p.set(0, 1, 0xfff0c0); p.set(1, 0, 0xfff0c0); p.set(8, 0, 0xfff0c0); p.set(9, 1, 0xfff0c0);
  return p;
}

// ---------------------------------------------------------------- assay scale (3 tilt frames)
function scaleSprite(tilt = 0) {
  const p = new Px(64, 46);
  const cx = 32;
  // wooden base
  p.rr(16, 39, 32, 6, 2, W.base); p.hl(17, 46, 39, W.hi); p.hl(17, 46, 44, W.dd); p.hl(18, 45, 40, W.lt);
  // post
  p.rect(cx - 1, 9, 3, 30, B.base); p.vl(cx - 1, 9, 38, B.lt); p.vl(cx + 1, 9, 38, B.dk);
  p.rect(cx - 3, 36, 7, 3, B.dk); p.hl(cx - 3, cx + 3, 36, B.lt);
  // beam
  const dy = tilt * 3;
  p.line(6, 10 - dy, 58, 10 + dy, B.base); p.line(6, 11 - dy, 58, 11 + dy, B.dk); p.line(6, 9 - dy, 58, 9 + dy, B.lt);
  // finial
  p.disk(cx + 0.5, 7, 2.6, B.base); p.set(cx - 1, 6, B.hi); p.set(cx + 1, 8, B.dd);
  // pans with chains
  const pan = (px, py) => {
    p.line(px, py, px - 7, py + 17, 0x8a7a5a); p.line(px, py, px + 7, py + 17, 0x8a7a5a);
    p.ellipse(px, py + 19, 9, 2.6, B.base);
    p.hl(px - 8, px + 8, py + 18, B.lt); p.hl(px - 6, px + 6, py + 21, B.dk);
    p.disk(px, py, 1.2, B.dk);
  };
  pan(8, 10 - dy); pan(56, 10 + dy);
  p.outline(INK);
  return p;
}

/** Stamp handle (wood knob + brass collar) for the confirm stamps. */
function stampHandle() {
  const p = new Px(16, 14);
  p.disk(8, 4, 3.6, W.base); p.set(6, 2, W.hi); p.set(7, 2, W.lt); p.set(10, 6, W.dd);
  p.rect(6, 7, 4, 3, W.dk); p.vl(6, 7, 9, W.lt);
  p.rect(2, 10, 12, 3, B.base); p.hl(2, 13, 10, B.lt); p.hl(2, 13, 12, B.dk);
  p.outline(INK);
  return p;
}

/** Chain link strip (sign hangers). */
function chainSprite() {
  const p = new Px(4, 8);
  p.box(0, 0, 4, 4, 0x8a8a90); p.set(1, 1, 0x2a2a30);
  p.vl(1, 4, 7, 0x6a6a70); p.vl(2, 4, 7, 0xb0b0b8);
  return p;
}

/** Twine coil (tag strings). */
function twineSprite() {
  const p = new Px(6, 2);
  for (let x = 0; x < 6; x++) { p.set(x, 0, x % 3 === 0 ? 0xa8875a : 0xd8bb88); p.set(x, 1, x % 3 === 1 ? 0x7a5a36 : 0xb8955e); }
  return p;
}

/** Savings jar: glass jar whose coin level follows 0..1. */
function jarSprite(level = 0) {
  const p = new Px(22, 26);
  const glass = 0x9ec8c0, glassHi = 0xe8fff8, glassDk = 0x5a8a84;
  // lid
  p.rect(5, 1, 12, 3, B.base); p.hl(5, 16, 1, B.lt); p.hl(5, 16, 3, B.dk);
  p.rect(6, 4, 10, 1, glassDk);
  // body
  p.rr(2, 5, 18, 20, 4, glass);
  // coins inside
  const top = Math.round(23 - level * 16);
  for (let y = Math.max(7, top); y <= 23; y++)
    for (let x = 3; x <= 18; x++) {
      if (!p.a(x, y)) continue;
      const k = (x * 3 + y * 5) % 7;
      p.set(x, y, k === 0 ? B.hi : k < 3 ? B.lt : k < 5 ? B.base : B.dk);
    }
  if (level > 0 && top <= 23) for (let x = 4; x <= 17; x += 3) p.set(x, Math.max(7, top) - 1, B.base);
  // glass shading
  p.vl(4, 7, 21, glassHi); p.vl(5, 8, 12, glassHi);
  p.vl(18, 7, 22, glassDk);
  p.hl(5, 16, 24, glassDk);
  // paper label
  p.rect(6, 13, 10, 5, P.base); p.hl(6, 15, 17, P.dk);
  p.hl(8, 13, 15, 0x6e4a2a);
  p.outline(INK);
  return p;
}

/** Speech-bubble tail pointing left (its right column opens into the bubble). */
function sayTailSprite() {
  const p = new Px(7, 10);
  p.poly([[0, 5], [6, 1], [6, 9]], 0xfffaf0);
  p.outline(INK);
  for (let y = 2; y <= 8; y++) p.set(6, y, 0xfffaf0);
  return p;
}

// ---------------------------------------------------------------- belt ends
function buckleSprite() {
  const p = new Px(12, 20);
  // strap end under the buckle
  p.rect(0, 3, 12, 14, L.base); p.hl(0, 11, 3, L.lt); p.hl(0, 11, 16, L.dd);
  // brass frame
  p.rr(2, 0, 9, 20, 2, B.base);
  p.rect(5, 3, 3, 14, L.dk);
  p.vl(2, 1, 18, B.lt); p.hl(3, 9, 0, B.hi); p.vl(10, 1, 18, B.dk); p.hl(3, 9, 19, B.dd);
  p.vl(4, 3, 16, B.dk); p.vl(8, 3, 16, B.lt);
  // prong
  p.hl(5, 8, 9, B.lt); p.hl(5, 8, 10, B.dk);
  p.outline(INK);
  return p;
}
function beltTipSprite() {
  const p = new Px(10, 14);
  p.rr(0, 0, 9, 14, 4, L.base);
  p.rect(0, 0, 4, 14, L.base);
  p.hl(0, 6, 0, L.ol); p.hl(0, 6, 13, L.ol);
  p.hl(0, 6, 1, L.lt); p.hl(0, 6, 12, L.dd);
  for (const x of [2, 5]) { p.set(x, 6, L.dd); p.set(x, 7, L.dd); p.set(x + 1, 7, L.lt); }
  p.each((x, y, c) => (x === 8 || (x === 7 && (y < 2 || y > 11)) ? L.dk : c));
  p.outline(L.ol);
  return p;
}

// ---------------------------------------------------------------- registry
export const SPR = {
  pack: (fill = 0) => art('pack' + fill, () => packSprite(fill)),
  bookPeek: () => art('bookPeek', bookPeekSprite),
  journalIcon: () => art('journalIcon', journalIcon),
  pouch: (open = false) => art('pouch' + (open ? 1 : 0), () => pouchSprite(open)),
  coins: () => art('coins', coinStrip),
  coinMini: () => art('coinMini', () => {
    const p = new Px(6, 6);
    p.tpl(['.oooo.', 'ohllbo', 'olbbbo', 'obbbdo', 'obbddo', '.oooo.'], { o: B.dd, h: B.hi, l: B.lt, b: B.base, d: B.dk });
    return p;
  }),
  coin: () => art('coin1', () => { const s = coinStrip(), p = new Px(8, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (s.a(x, y)) p.set(x, y, s.get(x, y)); return p; }),
  lantern: (lvl) => art('lantern' + lvl, () => lanternSprite(lvl)),
  charm: (id) => art('charm:' + id, () => charmSprite(id)),
  calendar: (torn = false) => art('cal' + (torn ? 1 : 0), () => calendarSprite(torn)),
  plumb: () => art('plumb', plumbSprite),
  tack: (c) => art('tack' + (c || ''), () => tackSprite(c)),
  seal: (color = 'red', mark = 'ring') => art(`seal:${color}:${mark}`, () => sealSprite(color, mark)),
  stick: () => art('stick', stickSprite),
  knob: () => art('knob', knobSprite),
  rbtn: (down = false) => art('rbtn' + (down ? 1 : 0), () => roundBtnSprite(down)),
  icon: (name, color) => art(`ic:${name}:${color || ''}`, () => iconSprite(name, color)),
  tap: () => art('tap', tapSprite),
  scale: (tilt = 0) => art('scale' + tilt, () => scaleSprite(tilt)),
  stampHandle: () => art('stampHandle', stampHandle),
  chain: () => art('chain', chainSprite),
  twine: () => art('twine', twineSprite),
  buckle: () => art('buckle', buckleSprite),
  sayTail: () => art('sayTail', sayTailSprite),
  beltTip: () => art('beltTip', beltTipSprite),
  jar: (level = 0) => { const k = Math.round(Math.max(0, Math.min(1, level)) * 12); return art('jar' + k, () => jarSprite(k / 12)); },
};
export const CHARM_IDS = Object.keys(CHARM_TPL);

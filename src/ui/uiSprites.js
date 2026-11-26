// Hand-built pixel sprites for the diegetic interface: backpack, book, coin pouch, lantern,
// charms, calendar, touch controls, assay scale... Each returns a cached data URL.
// The HUD's pieces are shaded per pixel (pebbled leather, brass, fibrous paper, glass lit from
// inside) with the helpers in src/ui/hudArt.js; sizes match what other screens show them at.
import { Px, PAL, INK, art, mixHex } from './uiArt.js';
import { HS, CHARM_KINDS } from './hudSprites.js';
import { RAMP, tone, dtone, h2, vnoise, pebble, lambert, dome, rimLight, stitch, rivet, shadeC, mixC, paperK, pouchArt, THREAD } from './hudArt.js';

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

// ---------------------------------------------------------------- coin pouch & coins
/** The coin pouch at 22×22 (the HUD's own is 26×26: src/ui/hudArt.js). */
function pouchSprite(open = false) {
  return pouchArt(open, 22);
}

// ---------------------------------------------------------------- lantern (energy)
/**
 * level 0..4: flame size; flick 0..2: the flame's dance (0 upright, 1 bending left, 2 stretching up
 * and right; the glow inside the glass follows it). 16×28: a hook ring, a vented iron cap, a brass
 * band, glass lit from inside, brass and iron base.
 */
function lanternSprite(level = 4, flick = 0) {
  const IR = RAMP.iron, BR = RAMP.brass;
  const p = new Px(16, 28);
  const cx = 7.5;
  // hook ring
  for (let y = 0; y <= 4; y++) for (let x = 5; x <= 10; x++) {
    const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 2.2);
    if (r > 1.1 && r < 2.3) p.set(x, y, x + y < 9 ? IR[6] : x > 8 ? IR[2] : IR[4]);
  }
  p.set(7, 4, IR[4]); p.set(8, 4, IR[2]);
  // the cap: a dome with vent holes
  for (let y = 5; y <= 8; y++) {
    const w = [1.6, 3.6, 5, 6][y - 5];
    for (let x = 0; x < 16; x++) {
      const u = (x + 0.5 - cx) / w;
      if (Math.abs(u) > 1) continue;
      const k = 0.15 + lambert(u * 0.9, -0.35, Math.sqrt(Math.max(0.05, 1 - u * u * 0.8))) * 0.85;
      p.set(x, y, tone(IR, k));
    }
  }
  for (const x of [4, 7, 10]) { p.set(x, 7, IR[0]); p.set(x, 8, IR[5]); }
  // brass bands top and bottom of the chamber, with rivets
  const band = (y) => {
    for (let x = 1; x <= 14; x++) { const u = (x + 0.5 - cx) / 7; p.set(x, y, tone(BR, 0.25 + lambert(u, -0.2, Math.sqrt(1 - u * u * 0.9)) * 0.75)); }
    p.set(2, y, BR[8]); p.set(13, y, BR[2]);
  };
  band(9); band(22);
  // the chamber: iron posts, glass lit by the flame
  const lit = level / 4;
  const GL = [0x1e1812, 0x2e2418, 0x4a3820, 0x6e5028, 0x9a6c30, 0xc8903a, 0xe8b452, 0xf8d888, 0xfff2c8];
  for (let y = 10; y <= 21; y++) {
    for (const [x, k] of [[1, 0.7], [2, 0.45], [13, 0.3], [14, 0.15]]) p.set(x, y, tone(IR, k));
    for (let x = 3; x <= 12; x++) {
      const d = Math.hypot((x + 0.5 - 8 + (flick === 1 ? 0.8 : flick === 2 ? -0.5 : 0)) * 1.1, (y + 0.5 - 18.2 + (flick === 2 ? 0.8 : 0)) * 0.9);
      const g = lit * Math.max(0, 1 - d / (7.5 + (flick === 2 ? 0.6 : flick === 1 ? -0.4 : 0)));
      let k = 0.12 + lit * 0.22 + g * 0.66;
      if (y === 10) k -= 0.12; // shadow under the band
      if (x === 3 || x === 12) k -= 0.1;
      p.set(x, y, dtone(GL, k, x, y));
    }
  }
  // a reflection down the glass, a wire guard hoop
  for (let y = 11; y <= 16; y++) p.set(4, y, mixC(p.get(4, y), 0xffffff, 0.45));
  p.set(5, 11, mixC(p.get(5, 11), 0xffffff, 0.35)); p.set(5, 12, mixC(p.get(5, 12), 0xffffff, 0.25));
  for (let y = 12; y <= 19; y++) p.set(11, y, mixC(p.get(11, y), 0xffffff, 0.12));
  // the flame (hand-shaped per level): o outer, y yellow, w white core, r ember red, k wick
  const FL = [
    ['..r...', '..kk..'],
    ['..r...', '..rr..', '..kk..'],
    ['..o...', '.ooo..', '.oyo..', '..oo..', '..kk..'],
    ['..o...', '.oyo..', '.oyyo.', '.oywo.', '.oywo.', '..yy..', '..kk..'],
    ['..o...', '..oo..', '.oyo..', '.oyyo.', '.oywo.', 'oywwyo', 'oywwyo', '.oyyo.', '..kk..'],
  ][level];
  // the flame's dance: bending left, or stretching up and leaning right
  const FL1 = [
    ['..r...', '..kk..'],
    ['.r....', '.rr...', '..kk..'],
    ['.o....', 'ooo...', 'oyo...', '.ooo..', '..kk..'],
    ['.o....', 'oyo...', 'oyyo..', '.oywo.', '.oywo.', '..yy..', '..kk..'],
    ['.o....', '.oo...', 'oyo...', 'oyyo..', '.oywo.', 'oywwyo', 'oywwyo', '.oyyo.', '..kk..'],
  ][level];
  const FL2 = [
    ['...r..', '..kk..'],
    ['...r..', '..r...', '..rr..', '..kk..'],
    ['...o..', '..oo..', '.ooo..', '.oyo..', '..oo..', '..kk..'],
    ['...o..', '..oo..', '.oyo..', '.oyyo.', '.oywo.', '.oywo.', '..yy..', '..kk..'],
    ['...o..', '...o..', '..oo..', '.oyo..', '.oyyo.', '.oywo.', 'oywwyo', 'oywwyo', '.oyyo.', '..kk..'],
  ][level];
  const fl = flick === 1 ? FL1 : flick === 2 ? FL2 : FL;
  p.tpl(fl, { o: level <= 1 ? 0xff7a3a : 0xff9a3a, y: 0xffd34a, w: 0xfff6c0, r: 0xe0502a, k: IR[1] }, 5, 21 - fl.length);
  // the burner and the base
  p.hl(6, 9, 21, BR[3]); p.set(6, 21, BR[6]);
  for (let y = 23; y <= 25; y++) {
    const w = [6, 5.6, 6.5][y - 23];
    for (let x = 0; x < 16; x++) {
      const u = (x + 0.5 - cx) / w;
      if (Math.abs(u) > 1) continue;
      const pal = y === 25 ? BR : IR;
      p.set(x, y, tone(pal, 0.15 + lambert(u, 0.1, Math.sqrt(1 - u * u * 0.9)) * 0.8 + (y === 23 ? -0.1 : 0)));
    }
  }
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- toast bits: tack & wax seals
/** A domed push-pin head on a steel needle. 8×9. */
function tackSprite(c = 0xc23c2c) {
  const p = new Px(8, 9);
  const R = [shadeC(c, 0.35), shadeC(c, 0.55), shadeC(c, 0.78), c, mixC(c, 0xffffff, 0.3), mixC(c, 0xffffff, 0.6), 0xffffff];
  p.set(4, 7, 0x8e98a4); p.set(4, 8, 0x525a64); p.set(5, 7, 0x2a2a30);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const k = dome((x + 0.5 - 4) / 3.2, (y + 0.5 - 3.6) / 3.1, 0.75);
    if (k < 0) continue;
    p.set(x, y, tone(R, 0.05 + k * 0.92));
  }
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

/** Pointing paw for touch prompts ("tap"), in the mole's leather work glove (gfx/char/glove.js): the claw out of the cut fingertip, the dark gauntlet with its buckle. */
function tapSprite() {
  const p = new Px(11, 13);
  p.tpl([
    '...cc....',
    '...ba....',
    '...ba....',
    '...babbb.',
    '.b.baaaad',
    '.baaaaaad',
    '.bataatad',
    '..kkkkkk.',
    '..kgkkkk.',
    '...rrrr..',
  ], { a: 0x9e6a38, b: 0xc8945a, d: 0x684022, t: 0xe8d8b0, c: 0xf4ecd8, k: 0x3e2416, g: 0xe6be52, r: 0x623c24 }, 1, 1);
  p.set(4, 2, 0x84542c); p.set(4, 1, 0xd8ac74);
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

/** Savings jar: glass jar whose coin level follows 0..1. 22×26. */
function jarSprite(level = 0) {
  const G = RAMP.gold, BR = RAMP.brass, PP = RAMP.paper;
  const GLS = [0x23403c, 0x34605a, 0x4a8078, 0x6aa096, 0x8ec0b4, 0xb4dcd2, 0xe0fff6];
  const p = new Px(22, 26);
  // the lid: a brass screw cap with ridges
  for (let y = 1; y <= 3; y++) for (let x = 5; x <= 16; x++) {
    const u = (x + 0.5 - 11) / 6;
    let k = 0.2 + lambert(u, -0.2, Math.sqrt(Math.max(0, 1 - u * u * 0.9))) * 0.8;
    if (y === 2 && x % 2) k -= 0.25;
    if (y === 1) k += 0.15;
    p.set(x, y, tone(BR, k));
  }
  p.hl(6, 15, 4, GLS[1]);
  // the glass body
  const m = new Px(22, 26);
  m.rr(2, 5, 18, 20, 4, 1);
  for (let y = 5; y < 25; y++) for (let x = 2; x < 20; x++) {
    if (!m.a(x, y)) continue;
    const u = (x + 0.5 - 11) / 9;
    // glass is darkest where you look through it, bright where it turns away
    let k = 0.42 + Math.abs(u) * 0.32 - (u > 0 ? 0.18 : 0) + rimLight(m, x, y, 1) * 0.1;
    p.set(x, y, tone(GLS, k));
  }
  // the coins inside, stacked in rows, tinted by the glass
  const top = Math.round(23 - level * 16);
  if (level > 0) {
    for (let y = 23; y >= Math.max(7, top); y -= 2) {
      const off = (y >> 1) % 2 ? 1 : 0;
      for (let x = 3 + off; x <= 17; x += 3) {
        for (const [dx, dy, kk] of [[0, 0, 0.75], [1, 0, 0.6], [2, 0, 0.4], [0, 1, 0.45], [1, 1, 0.35], [2, 1, 0.22]]) {
          const X = x + dx, Y = y - 1 + dy;
          if (!m.a(X, Y) || Y < 6) continue;
          p.set(X, Y, mixC(tone(G, kk + (h2(X, Y, 61) - 0.5) * 0.12), GLS[4], 0.18));
        }
      }
    }
  }
  // reflections
  p.vl(4, 8, 21, GLS[6]); p.vl(5, 8, 12, GLS[5]); p.vl(17, 9, 20, GLS[4]);
  p.hl(6, 15, 24, GLS[1]);
  // a paper label
  for (let y = 13; y <= 17; y++) for (let x = 6; x <= 15; x++) p.set(x, y, tone(PP, paperK(x, y, 63) + (y === 17 ? -0.2 : 0.06)));
  p.hl(8, 13, 15, 0x6e4a2a); p.set(12, 15, PP[4]); p.hl(9, 11, 14, 0xb03222);
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
// (wave 20: the pieces the HUD shows are its hand-drawn maps, src/ui/hudSprites.js, wherever they appear)
const LEATHER_O = { brown: 'leather' }; // the finishing pass (src/ui/pxFine.js): their browns are leather
export const SPR = {
  pack: (fill = 0) => HS.pack(fill),
  bookPeek: () => HS.book(),
  journalIcon: () => HS.journal(),
  pouch: (open = false) => art('pouch' + (open ? 1 : 0), () => pouchSprite(open), LEATHER_O),
  coins: () => HS.coins(),
  coinMini: () => art('coinMini', () => {
    const p = new Px(6, 6);
    p.tpl(['.oooo.', 'ohllbo', 'olbbbo', 'obbbdo', 'obbddo', '.oooo.'], { o: B.dd, h: B.hi, l: B.lt, b: B.base, d: B.dk });
    return p;
  }),
  coin: () => HS.coin(),
  lantern: (lvl, flick = 0) => art('lantern' + lvl + (flick ? ':' + flick : ''), () => lanternSprite(lvl, flick)),
  charm: (id) => HS.charm(id),
  calendar: (torn = false) => HS.calendar(torn),
  plumb: () => HS.plumb(),
  tack: (c) => art('tack' + (c || ''), () => tackSprite(c)),
  seal: (color = 'red', mark = 'ring') => HS.seal(color, mark),
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
export const CHARM_IDS = CHARM_KINDS;

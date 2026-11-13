// Hand-built pixel sprites for the diegetic interface: backpack, book, coin pouch, lantern,
// charms, calendar, touch controls, assay scale... Each returns a cached data URL.
// The HUD's pieces are shaded per pixel (pebbled leather, brass, fibrous paper, glass lit from
// inside) with the helpers in src/ui/hudArt.js; sizes match what other screens show them at.
import { Px, PAL, INK, art, mixHex } from './uiArt.js';
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

// ---------------------------------------------------------------- backpack (HUD access point)
/** Paint a part's silhouette (any opaque pixels of m) in leather: lit rims, a cylinder across, pebbled grain. */
function leatherPart(p, m, base, seed, { round = 0.3, pal = RAMP.leather, rim = 0.24 } = {}) {
  let x0 = m.w, x1 = 0;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.a(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!m.a(x, y)) continue;
    const u = x1 > x0 ? ((x - x0) / (x1 - x0)) * 2 - 1 : 0;
    const k = base + rimLight(m, x, y, 2) * rim - u * round * 0.5 - (u * u) * round * 0.25 + pebble(x, y, seed, 1.3) * 0.13;
    p.set(x, y, tone(pal, k));
  }
}
/** Stitches running round a silhouette, `inset` pixels in from its edge. */
function stitchRound(p, m, inset = 2, c = THREAD, every = 3) {
  const D = m.dist(inset + 1);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.a(x, y) && D(x, y) === inset && (x + y * 2) % every !== every - 1) p.set(x, y, c);
}
/** fill: 0 empty · 1 some · 2 bulging · 3 full (overflowing). 30×32. */
function packSprite(fill = 0) {
  const LE = RAMP.leather, BR = RAMP.brass;
  const p = new Px(30, 32);
  const b = [0, 1, 1, 2][fill];
  const bx = 5 - b, bw = 20 + b * 2, by = 10, bh = 20, cx = 15;
  const mask = () => new Px(30, 32);
  // the carry handle, a rolled leather loop, on two brass D-rings
  const hm = mask();
  for (let y = 1; y <= 9; y++) for (let x = 8; x <= 22; x++) {
    const o = ((x + 0.5 - cx) / 5.8) ** 2 + ((y + 0.5 - 8) / 6.4) ** 2, i = ((x + 0.5 - cx) / 3.6) ** 2 + ((y + 0.5 - 8) / 4.3) ** 2;
    if (o <= 1 && i > 1 && y <= 8) hm.set(x, y, 1);
  }
  leatherPart(p, hm, 0.5, 3, { round: 0.2 });
  for (const dx of [10, 19]) { p.set(dx, 8, BR[7]); p.set(dx + 1, 8, BR[4]); p.set(dx, 9, BR[4]); p.set(dx + 1, 9, BR[2]); }
  // items peeking out when stuffed
  if (fill >= 2) {
    p.poly([[8, 9], [11, 3], [13, 9]], 0x5ab0f0); p.line(10, 6, 11, 4, 0xd8f4ff); p.set(11, 4, 0xffffff); p.vl(12, 6, 8, 0x2a5490); p.set(9, 8, 0x3f7ec8);
    for (let y = 4; y <= 9; y++) for (let x = 16; x <= 23; x++) {
      const k = dome((x + 0.5 - 19.6) / 3, (y + 0.5 - 7.6) / 2.8, 0.8);
      if (k >= 0) p.set(x, y, tone([0x3a2a20, 0x5a4234, 0x7a5a48, 0x9a7458, 0xd9773f, 0xf2a35e], k + (h2(x, y, 5) > 0.8 ? -0.3 : 0)));
    }
  }
  if (fill >= 3) {
    p.line(22, 3, 25, 10, 0xa06c3c); p.line(23, 3, 26, 10, 0x643e20);
    p.rect(20, 1, 7, 2, 0x8e98a4); p.hl(20, 26, 1, 0xdee4ea); p.set(20, 3, 0x525a64); p.set(26, 0, 0xdee4ea);
    for (let y = 4; y <= 9; y++) for (let x = 12; x <= 18; x++) {
      const k = dome((x + 0.5 - 15) / 2.6, (y + 0.5 - 7) / 2.3, 0.7);
      if (k >= 0) p.set(x, y, tone(RAMP.gold, 0.2 + k * 0.85));
    }
  }
  // side pockets
  for (const sx of [bx - 2, bx + bw - 2]) {
    const sm = mask();
    sm.rr(sx, 16, 4, 11, 1, 1);
    leatherPart(p, sm, 0.34, 7 + sx, { round: 0.3 });
    p.hl(sx, sx + 3, 18, LE[2]); p.hl(sx + 1, sx + 2, 17, LE[6]);
    p.set(sx + 1, 19, BR[6]); p.set(sx + 2, 19, BR[3]);
  }
  // the body: a stitched seam down each side and along the bottom
  const bm = mask();
  bm.rr(bx, by, bw, bh, 5, 1);
  leatherPart(p, bm, 0.46, 11, { round: 0.6 });
  for (let y = by + bh - 3; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) if (bm.a(x, y)) p.set(x, y, shadeC(p.get(x, y), 0.8));
  stitch(p, bx + 2, by + 7, bx + 2, by + bh - 5, 1, 1, mixC(THREAD, LE[4], 0.3), null);
  stitch(p, bx + bw - 3, by + 7, bx + bw - 3, by + bh - 5, 1, 1, mixC(THREAD, LE[2], 0.4), null);
  stitch(p, bx + 4, by + bh - 3, bx + bw - 5, by + bh - 3, 2, 1, mixC(THREAD, LE[2], 0.35), null);
  // the front pocket: a darker welt round it, stitched, a brass snap at its mouth
  const pm = mask();
  pm.rr(cx - 6, 20, 12, 8, 2, 1);
  leatherPart(p, pm, 0.58, 13, { round: 0.4, rim: 0.3 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 30; x++) {
    if (pm.a(x, y) || !p.a(x, y)) continue;
    if (pm.a(x + 1, y) || pm.a(x - 1, y) || pm.a(x, y + 1) || pm.a(x, y - 1)) p.set(x, y, LE[1]);
  }
  stitchRound(p, pm, 1, mixC(THREAD, LE[5], 0.15), 2);
  p.hl(cx - 4, cx + 3, 21, LE[7]);
  rivet(p, cx - 1, 22, false, BR);
  // the flap, on its own layer: a shadow line onto the body under it
  const fy0 = fill >= 3 ? 7 : 8;
  const flap = mask();
  flap.rr(bx + 1, fy0, bw - 2, 9, 4, 1);
  flap.ellipse(cx, fy0 + 8, bw / 2 - 2.5, 3.2, 1);
  for (let x = 0; x < 30; x++) for (let y = 31; y >= 0; y--) if (flap.a(x, y)) { if (p.a(x, y + 1)) p.set(x, y + 1, LE[1]); if (p.a(x, y + 2)) p.set(x, y + 2, shadeC(p.get(x, y + 2), 0.75)); break; }
  leatherPart(p, flap, 0.62, 19, { round: 0.5, rim: 0.3 });
  stitchRound(p, flap, 2, THREAD, 3);
  rivet(p, bx + 3, fy0 + 2, false, BR); rivet(p, bx + bw - 5, fy0 + 2, false, BR);
  // the strap down the middle, its buckle, the tongue's holes
  for (let y = fy0 + 6; y <= fy0 + 15; y++) {
    p.set(cx - 1, y, tone(LE, 0.62 + pebble(cx, y, 23) * 0.1)); p.set(cx, y, tone(LE, 0.44 + pebble(cx + 1, y, 23) * 0.1)); p.set(cx + 1, y, LE[1]);
  }
  p.set(cx - 1, fy0 + 15, LE[3]); p.set(cx, fy0 + 15, LE[2]);
  const qy = fy0 + 9;
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const edge = i === 0 || j === 0 || i === 4 || j === 4;
    if (!edge) continue;
    p.set(cx - 2 + i, qy + j, i === 0 || j === 0 ? (i + j < 2 ? BR[8] : BR[6]) : i === 4 && j === 4 ? BR[1] : BR[3]);
  }
  p.set(cx - 2, qy, BR[5]); p.vl(cx, qy, qy + 3, BR[7]); p.set(cx, qy + 4, BR[4]);
  p.set(cx, fy0 + 7, LE[0]);
  if (fill >= 3) p.rect(cx - 1, fy0 + 14, 2, 2, LE[6]);
  p.outline(0x180c06);
  return p;
}

/** The Index Book peeking out of the backpack (upright, slight lean). 14×18. */
function bookPeekSprite() {
  const OX = RAMP.ox, BR = RAMP.brass, PP = RAMP.paper;
  const s = new Px(11, 16);
  // the page block on top, page edges in fine lines
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 9; x++) s.set(x, y, (x + y) % 2 ? PP[6] : PP[4]);
  s.hl(1, 9, 1, PP[7]);
  // the cover: grained oxblood, a darker spine with two raised bands
  const m = new Px(11, 16);
  m.rect(0, 3, 10, 13, 1);
  for (let y = 3; y <= 15; y++) for (let x = 0; x <= 9; x++) {
    let k = 0.52 + rimLight(m, x, y, 1) * 0.22 + pebble(x, y, 31, 1.2) * 0.14;
    if (x <= 1) k -= 0.18;
    if (x <= 1 && (y === 5 || y === 13)) k += 0.35;
    s.set(x, y, tone(OX, k));
  }
  // a gilt rule round the board, the title plate, brass corners
  s.vl(3, 5, 13, OX[6]); s.hl(3, 8, 5, BR[5]); s.hl(3, 8, 13, BR[3]);
  s.rect(5, 8, 3, 2, BR[5]); s.hl(5, 7, 8, BR[7]); s.set(7, 9, BR[3]);
  s.set(9, 3, BR[7]); s.set(8, 3, BR[5]); s.set(9, 4, BR[4]);
  s.set(9, 15, BR[3]); s.set(8, 15, BR[5]); s.set(9, 14, BR[4]);
  s.vl(10, 2, 14, PP[3]);
  // the ribbon
  s.vl(7, 0, 2, 0xd0402a); s.set(7, 0, 0xff8a6a); s.set(6, 0, 0x8a2418);
  const p = new Px(14, 18);
  for (let y = 0; y < 16; y++) {
    const off = Math.floor((15 - y) / 6);
    for (let x = 0; x < 11; x++) if (s.a(x, y)) p.set(x + off + 1, y + 1, s.get(x, y));
  }
  p.outline(OX[0]);
  return p;
}

/** Small closed pause journal with a pencil tucked in its band (the menu). 16×17. */
function journalIcon() {
  const G = RAMP.moss, BR = RAMP.brass, PP = RAMP.paper;
  const p = new Px(16, 17);
  const m = new Px(16, 17);
  m.rect(1, 2, 10, 13, 1);
  for (let y = 2; y <= 14; y++) for (let x = 1; x <= 10; x++) {
    let k = 0.55 + rimLight(m, x, y, 1) * 0.2 + pebble(x, y, 37, 1.2) * 0.14;
    if (x <= 2) k -= 0.2;
    if (x <= 2 && (y === 4 || y === 12)) k += 0.3;
    p.set(x, y, tone(G, k));
  }
  // page edges on the right
  for (let y = 3; y <= 14; y++) p.set(11, y, y % 2 ? PP[6] : PP[4]);
  p.set(11, 2, PP[2]);
  // the elastic band, a brass label, a corner guard
  for (let y = 2; y <= 14; y++) p.set(8, y, y % 3 === 0 ? 0x3a2418 : 0x24140c);
  p.rect(4, 6, 3, 2, BR[5]); p.hl(4, 6, 6, BR[7]); p.set(6, 7, BR[3]);
  p.set(10, 2, BR[7]); p.set(9, 2, BR[5]); p.set(10, 3, BR[4]);
  // the pencil: eraser, ferrule, hex body, bare wood, lead
  p.vl(13, 1, 2, 0xf0a098); p.vl(14, 1, 2, 0xc86a64);
  p.set(13, 3, BR[7]); p.set(14, 3, BR[3]);
  for (let y = 4; y <= 11; y++) { p.set(13, y, 0xf6d26a); p.set(14, y, 0xc8922e); }
  p.set(13, 4, 0xffeaa0);
  p.set(13, 12, 0xe8c8a0); p.set(14, 12, 0xb08858); p.set(13, 13, 0x3a3a40);
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- coin pouch & coins
/** The coin pouch at 22×22 (the HUD's own is 26×26: src/ui/hudArt.js). */
function pouchSprite(open = false) {
  return pouchArt(open, 22);
}

/** Spinning coin strip: 4 frames of 8×8 (face, three-quarter, edge, three-quarter). */
function coinStrip() {
  const G = RAMP.gold;
  const q = new Px(32, 8);
  const frame = (f, rx) => {
    const p = new Px(8, 8);
    if (rx < 1) {
      // edge on: a milled rim
      for (let y = 1; y <= 6; y++) { p.set(3, y, y % 2 ? G[5] : G[4]); p.set(4, y, y % 2 ? G[2] : G[3]); }
      p.set(3, 0, G[6]); p.set(4, 7, G[1]);
    } else {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const du = (x + 0.5 - 4) / rx, dv = (y + 0.5 - 4) / 3.7, r = Math.hypot(du, dv);
        if (r > 1) continue;
        const lit = -(du + dv) / (r * Math.SQRT2 || 1);
        let k = 0.32 + dome(du, dv, 0.5) * 0.62;
        if (r > 0.74 && lit < 0) k -= 0.16; // the rim's lower edge
        p.set(x, y, tone(G, k));
      }
      // the stamp (a struck mark, lit on its lower lip), a glint
      if (rx > 2.5) { p.set(4, 3, G[2]); p.set(4, 4, G[2]); p.set(5, 4, G[6]); p.set(4, 5, G[6]); p.set(2, 2, G[7]); }
      else { p.vl(4, 3, 4, G[2]); p.set(4, 5, G[6]); p.set(3, 2, G[7]); }
    }
    p.outline(G[0]);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (p.a(x, y)) q.set(f * 8 + x, y, p.get(x, y));
  };
  frame(0, 3.6); frame(1, 2.3); frame(2, 0); frame(3, 2.3);
  return q;
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
/** A charm on a brass jump ring and a twist of twine; its body lit at the top-left rims, shaded at the bottom-right. 11×15. */
function charmSprite(id) {
  const t = CHARM_TPL[id] || CHARM_TPL.lucky;
  const BR = RAMP.brass, C = RAMP.twine;
  const p = new Px(11, 15);
  p.set(5, 0, BR[6]); p.set(4, 1, BR[7]); p.set(6, 1, BR[3]); p.set(5, 2, BR[2]);
  p.set(5, 3, C[4]);
  const body = new Px(11, 15);
  body.tpl(t.rows, t.pal, 2, 4);
  const plain = new Set(Object.entries(t.pal).filter(([k]) => k === k.toLowerCase()).map(([, v]) => v));
  for (let y = 0; y < 15; y++) for (let x = 0; x < 11; x++) {
    if (!body.a(x, y)) continue;
    let c = body.get(x, y);
    if (plain.has(c)) {
      const r = rimLight(body, x, y, 1);
      if (r > 0) c = mixC(c, 0xffffff, 0.32);
      else if (r < 0) c = shadeC(c, 0.66);
    }
    p.set(x, y, c);
  }
  // a glint
  for (let y = 4; y < 15; y++) { let done = false; for (let x = 0; x < 11; x++) if (body.a(x, y) && body.a(x + 1, y) && body.a(x, y + 1)) { p.set(x + 1, y + 1, 0xffffff); done = true; break; } if (done) break; }
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- tear-off calendar page
const RED = [0x2e0806, 0x4a0e0a, 0x6e1810, 0x922418, 0xb03222, 0xc8442e, 0xe0664a, 0xf4927a];
function calendarSprite(torn = false) {
  const PP = RAMP.paper, IR = RAMP.iron, BR = RAMP.brass;
  const p = new Px(30, 34);
  if (!torn) {
    // the pad of pages underneath, each a hair offset
    for (let y = 29; y <= 33; y++) for (let x = 2; x <= 27; x++) p.set(x, y, (y % 2 ? PP[3] : PP[5]));
    p.hl(3, 27, 33, PP[1]); p.vl(27, 29, 33, PP[2]);
  }
  // the page: fibrous paper, a little darker toward the bottom right
  for (let y = 4; y <= 30; y++) for (let x = 1; x <= 28; x++) {
    const k = paperK(x, y, 51) + 0.1 - (x + y) * 0.003;
    p.set(x, y, tone(PP, k));
  }
  p.hl(1, 28, 30, PP[2]); p.vl(28, 5, 30, PP[3]);
  // the red header: cloth-bound, an embossed DAY
  for (let y = 4; y <= 12; y++) for (let x = 1; x <= 28; x++) {
    let k = 0.62 + (vnoise(x / 2, y * 1.5, 53) - 0.5) * 0.14 + (h2(x, y, 54) - 0.5) * 0.06;
    if (y === 4) k = 0.9;
    else if (y === 5) k += 0.08;
    else if (y === 11) k -= 0.2;
    else if (y === 12) k = 0.1;
    p.set(x, y, tone(RED, k));
  }
  word(p, 'DAY', 11, 7, RED[1]);
  word(p, 'DAY', 10, 6, 0xfff0d8);
  // a ruled line under the header, the date's corner fold
  for (let x = 3; x <= 26; x += 2) p.set(x, 14, PP[3]);
  for (let y = 26; y <= 30; y++) for (let x = 24; x <= 28; x++) {
    if (x + y > 54) p.clear(x, y);
    else if (x + y === 54) p.set(x, y, PP[1]);
    else if (x + y >= 51 && x >= 25 && y >= 26) p.set(x, y, x + y === 51 ? PP[2] : PP[6]);
  }
  if (torn) {
    // the top edge, torn off along the perforation
    for (let x = 1; x <= 28; x++) {
      if (x % 3 === 0 || h2(x, 1, 55) > 0.6) p.clear(x, 4);
      if (x % 3 === 0 && h2(x, 2, 55) > 0.5) p.set(x, 5, RED[7]);
    }
  } else {
    // the iron binding bar with brass rivets, two rings through the page
    for (let x = 0; x <= 29; x++) { p.set(x, 1, IR[6]); p.set(x, 2, IR[4]); p.set(x, 3, IR[2]); }
    rivet(p, 2, 1, false, BR); rivet(p, 26, 1, false, BR);
    for (const rx of [8, 21]) {
      p.set(rx, 7, RED[0]); p.set(rx + 1, 7, RED[1]);
      p.vl(rx, 0, 6, BR[6]); p.vl(rx + 1, 0, 6, BR[3]); p.set(rx, 0, BR[8]); p.set(rx + 1, 6, BR[2]);
    }
  }
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- depth plumb-bob
/** A brass plumb-bob on twine: an eye, a knurled collar, a faceted bob with a steel tip. 11×19. */
function plumbSprite() {
  const BR = RAMP.brass, C = RAMP.twine, ST = RAMP.steel;
  const p = new Px(11, 19);
  for (let y = 0; y <= 4; y++) p.set(5, y, y % 2 ? C[2] : C[4]);
  p.set(5, 5, BR[7]); p.set(4, 6, BR[6]); p.set(6, 6, BR[3]); p.set(5, 7, BR[2]); p.set(5, 6, 0x1a0e08);
  for (let x = 3; x <= 7; x++) { p.set(x, 8, x % 2 ? BR[7] : BR[4]); p.set(x, 9, x % 2 ? BR[5] : BR[3]); }
  p.set(3, 8, BR[8]); p.set(7, 9, BR[2]);
  for (let y = 10; y <= 17; y++) {
    const hw = 4.6 - (y - 10) * 0.56;
    for (let x = 0; x < 11; x++) {
      const u = (x + 0.5 - 5.5) / Math.max(0.6, hw);
      if (Math.abs(u) > 1) continue;
      let k = u < -0.55 ? 0.92 : u < -0.15 ? 0.74 : u < 0.25 ? 0.54 : u < 0.6 ? 0.38 : 0.22;
      if (y === 11) k -= 0.25; // a turned groove
      p.set(x, y, tone(BR, k));
    }
  }
  p.set(2, 10, BR[8]); p.set(2, 12, BR[8]); p.set(3, 13, BR[8]);
  p.set(5, 17, ST[5]); p.set(5, 18, ST[3]);
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
const SEAL = { red: PAL.red, green: PAL.green, amber: PAL.amber, brown: { hi: 0xd8a070, lt: 0xb07a46, base: 0x83552e, dk: 0x5e3a1f, dd: 0x3a2412 }, blue: PAL.blue, purple: PAL.purple };
/** Wax seal (13×13): a blob with a wobbly edge, a raised rim, the face pressed with a mark. mark: 'ring' | 'x' | 'check' | 'star'. */
function sealSprite(color = 'red', mark = 'ring') {
  const S = SEAL[color] || SEAL.red;
  const R = [shadeC(S.dd, 0.7), S.dd, S.dk, S.base, S.lt, S.hi, mixC(S.hi, 0xffffff, 0.5)];
  const p = new Px(13, 13);
  const c = 6.5;
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    const a = Math.atan2(y + 0.5 - c, x + 0.5 - c);
    const rr = 5.6 + Math.sin(a * 5 + 0.7) * 0.5 + Math.sin(a * 3 + 2) * 0.3;
    const du = (x + 0.5 - c) / rr, dv = (y + 0.5 - c) / rr, r = Math.hypot(du, dv);
    if (r > 1) continue;
    let k;
    if (r > 0.7) k = 0.15 + dome(du, dv, 0.55) * 0.85;
    else if (r > 0.6) k = du + dv < 0 ? 0.2 : 0.7;
    else k = 0.5 - (du + dv) * 0.1;
    p.set(x, y, tone(R, k));
  }
  const dent = (pts) => {
    for (const [x, y] of pts) p.set(x, y, R[1]);
    for (const [x, y] of pts) if (!pts.some(([a, b]) => a === x + 1 && b === y + 1)) p.set(x + 1, y + 1, R[5]);
  };
  if (mark === 'ring') {
    const pts = [];
    for (let a = 0; a < 20; a++) pts.push([Math.round(6 + Math.cos((a / 20) * Math.PI * 2) * 2.6), Math.round(6 + Math.sin((a / 20) * Math.PI * 2) * 2.6)]);
    dent(pts); p.set(6, 6, R[1]);
  } else if (mark === 'x') {
    const pts = [];
    for (let i = -2; i <= 2; i++) { pts.push([6 + i, 6 + i]); pts.push([6 + i, 6 - i]); }
    dent(pts);
  } else if (mark === 'check') {
    dent([[3, 6], [4, 7], [5, 8], [6, 7], [7, 6], [8, 5], [9, 4]]);
  } else if (mark === 'star') {
    const pts = [];
    for (let i = 3; i <= 9; i++) { pts.push([6, i]); pts.push([i, 6]); }
    pts.push([5, 5], [7, 7], [7, 5], [5, 7]);
    dent(pts);
  }
  p.set(3, 3, R[6]); p.set(4, 2, R[5]);
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
const LEATHER_O = { brown: 'leather' }; // the finishing pass (src/ui/pxFine.js): their browns are leather
export const SPR = {
  pack: (fill = 0) => art('pack' + fill, () => packSprite(fill), LEATHER_O),
  bookPeek: () => art('bookPeek', bookPeekSprite, LEATHER_O),
  journalIcon: () => art('journalIcon', journalIcon, LEATHER_O),
  pouch: (open = false) => art('pouch' + (open ? 1 : 0), () => pouchSprite(open), LEATHER_O),
  coins: () => art('coins', coinStrip),
  coinMini: () => art('coinMini', () => {
    const p = new Px(6, 6);
    p.tpl(['.oooo.', 'ohllbo', 'olbbbo', 'obbbdo', 'obbddo', '.oooo.'], { o: B.dd, h: B.hi, l: B.lt, b: B.base, d: B.dk });
    return p;
  }),
  coin: () => art('coin1', () => { const s = coinStrip(), p = new Px(8, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (s.a(x, y)) p.set(x, y, s.get(x, y)); return p; }),
  lantern: (lvl, flick = 0) => art('lantern' + lvl + (flick ? ':' + flick : ''), () => lanternSprite(lvl, flick)),
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

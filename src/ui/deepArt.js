// Pixel art for the first-person HUD: the brass radar, crosshair reticles, the big dig button,
// tiny map glyphs (shared by the radar screen and the survey map) and the look card.
import { Px, PAL, INK, art, mixHex } from './uiArt.js';
import { RAMP, tone, h2, vnoise, pebble, lambert, dome, screw, shadeC, THREAD } from './hudArt.js';

const B = PAL.brass, W = PAL.wood, P = PAL.paper;
const IRON = { hi: 0x8a8890, lt: 0x6a6870, base: 0x46444c, dk: 0x2e2c32, dd: 0x1c1b20 };

/** Radar geometry (art px): the screen is a 36 px disc centered in a 54 px device. */
export const RADAR = { size: 54, screen: 36, off: 9, r: 18 };

// ---------------------------------------------------------------- radar device
/**
 * The scope's bezel (54×54, the 36 px screen shows through the middle): a turned brass ring, a
 * chamfered lip down to the glass, a satin dial band engraved every 10° (longer every 30°), a red
 * enamel lubber mark, four slotted screws, a convex rim and a knurled edge; a stitched leather
 * strap looped through two lugs at the top left, a knurled tuning knob on the right, and the
 * glass itself: an inner shadow under the rim, a crescent of glare and two glints.
 */
function radarRing() {
  const S = RADAR.size, c = S / 2, R = RADAR.r;
  const BR = RAMP.brass, LE = RAMP.leather;
  const p = new Px(S, S);
  const rIn = R + 0.5, rChamf = R + 1.5, rBand = R + 4.6, rRim = R + 6.6, rOut = R + 7.6;
  const polar = (x, y) => { const dx = x + 0.5 - c, dy = y + 0.5 - c; return [Math.hypot(dx, dy), Math.atan2(dy, dx), dx, dy]; };
  // ---- the strap: a stitched leather loop bulging into the top-left corner, behind the ring
  const a0 = -Math.PI * 0.89, a1 = -Math.PI * 0.61;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [d, a] = polar(x, y);
    if (a < a0 || a > a1) continue;
    const t = (a - a0) / (a1 - a0);
    const mid = rOut - 1.5 + Math.sin(Math.PI * t) * 6.2;
    const o = d - mid;
    if (Math.abs(o) > 2.4) continue;
    let k = 0.5 + pebble(x, y, 41, 1.2) * 0.18 + (vnoise(x / 4, y / 4, 42) - 0.5) * 0.2;
    if (o > 1.5) k = 0.82; // the outer edge faces the light
    else if (o > 0.8) k += 0.12;
    else if (o < -1.5) k = 0.12;
    p.set(x, y, tone(LE, k));
    // a row of stitches down the middle
    const s = Math.round(a * mid);
    if (Math.abs(o) < 0.5 && ((s % 3) + 3) % 3 !== 2) p.set(x, y, ((s % 3) + 3) % 3 === 0 ? 0xf4e2b4 : THREAD);
  }
  // the two lugs the strap runs through
  for (const t of [0.09, 0.91]) {
    const a = a0 + (a1 - a0) * t;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const [d, aa] = polar(x, y);
      const along = (aa - a) * d;
      if (Math.abs(along) > 1.8 || d < rOut - 1 || d > rOut + 2.6) continue;
      const k = 0.45 + (along < -0.6 ? 0.3 : along > 0.6 ? -0.25 : 0.1) + (d > rOut + 1.8 ? -0.15 : 0);
      p.set(x, y, tone(BR, k));
    }
  }
  // ---- the ring
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [d, a, dx, dy] = polar(x, y);
    if (d < rIn || d > rOut) continue;
    const lit = -(dx + dy) / (d * Math.SQRT2 || 1); // 1 top-left .. −1 bottom-right
    let k;
    if (d < rChamf) {
      k = 0.3 - lit * 0.26; // the chamfer faces the centre: lit at the bottom right
    } else if (d < rBand - 0.6) {
      k = 0.47 + lit * 0.08 + (h2(x, y, 44) - 0.5) * 0.04; // the satin dial band
      if (d < rChamf + 0.7) k -= 0.08;
    } else if (d < rBand + 0.4) {
      k = lit > 0.15 ? 0.3 : lit > -0.15 ? 0.45 : 0.66; // the step up to the rim
    } else if (d < rRim) {
      // the polished convex rim, a highlight running round its crown
      const inner = d < (rBand + rRim) / 2 + 0.2;
      k = inner ? 0.64 + lit * 0.3 : 0.52 + lit * 0.36;
      if (inner && lit > 0.8) k = 1;
    } else {
      // knurled edge: alternate ridges, brighter facing the light
      const n = Math.floor(((a + Math.PI) * d) / 2) % 2;
      k = 0.4 + lit * 0.22 + (n ? 0.1 : -0.12);
    }
    p.set(x, y, tone(BR, k));
  }
  // ---- engraved ticks every 10°, longer every 30°; screws on the diagonals; the red lubber mark
  const screws = [45, 135, 225, 315];
  const ticks = new Map();
  for (let deg = 10; deg < 360; deg += 10) {
    if (screws.some((s) => Math.abs(s - deg) < 8)) continue;
    const ang = ((deg - 90) * Math.PI) / 180;
    const major = deg % 30 === 0, card = deg % 90 === 0;
    const r0 = card ? rChamf + 0.3 : major ? rChamf + 1.1 : rBand - 1.3;
    for (let r = r0; r <= rBand - 0.8; r += 0.4) {
      const x = Math.round(c - 0.5 + Math.cos(ang) * r), y = Math.round(c - 0.5 + Math.sin(ang) * r);
      ticks.set(x + ',' + y, major);
    }
  }
  for (const [key, major] of ticks) {
    const [x, y] = key.split(',').map(Number);
    p.set(x, y, major ? BR[1] : BR[2]);
  }
  for (const [key, major] of ticks) {
    if (!major) continue;
    const [x, y] = key.split(',').map(Number);
    if (!ticks.has(x + 1 + ',' + (y + 1)) && !ticks.has(x + 1 + ',' + y)) p.set(x + 1, y + 1, BR[6]);
  }
  screws.forEach((deg, i) => {
    const ang = ((deg - 90) * Math.PI) / 180, r = (rChamf + rBand) / 2;
    screw(p, Math.round(c - 1.5 + Math.cos(ang) * r), Math.round(c - 1.5 + Math.sin(ang) * r), [2, 0, 3, 1][i], BR);
  });
  // the lubber mark: a red enamel triangle inlaid in the band at the top, pointing in
  const ty = Math.round(c - rBand + 0.2);
  const red = PAL.red;
  for (let j = 0; j < 4; j++) for (let i = -3 + j; i <= 3 - j; i++) {
    const x = Math.round(c - 0.5) + i, y = ty + j;
    p.set(x, y, j === 0 ? (i < 0 ? red.hi : red.lt) : i === 3 - j ? red.dk : red.base);
  }
  p.hl(Math.round(c - 0.5) - 4, Math.round(c - 0.5) + 4, ty - 1, BR[1]);
  p.set(Math.round(c - 0.5) - 2, ty, 0xffd0c0);
  // ---- the tuning knob (right), with its shadow on the ring
  const kx = c + 23.2, ky = c + 9.6, kr = 3.4;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const du = (x + 0.5 - kx - 0.8) / kr, dv = (y + 0.5 - ky - 0.9) / kr;
    if (du * du + dv * dv <= 1 && p.a(x, y)) p.set(x, y, shadeC(p.get(x, y), 0.55));
  }
  const IR = RAMP.iron;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const du = (x + 0.5 - kx) / kr, dv = (y + 0.5 - ky) / kr, r = Math.hypot(du, dv);
    if (r > 1) continue;
    let k;
    if (r > 0.66) { const n = Math.floor((Math.atan2(dv, du) + Math.PI) * 3.2) % 2; k = 0.18 + dome(du, dv, 0.6) * 0.6 + (n ? 0.14 : -0.1); }
    else k = 0.2 + dome(du / 0.66, dv / 0.66, 0.9) * 0.8;
    p.set(x, y, tone(IR, k));
  }
  p.set(Math.round(kx - 1.2), Math.round(ky - 1.3), IR[7]);
  p.outline(INK);
  // ---- the glass over the screen
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [d, a, dx, dy] = polar(x, y);
    if (d >= rIn) continue;
    const lit = -(dx + dy) / (d * Math.SQRT2 || 1);
    if (d > R - 1.4) p.set(x, y, 0x020806, Math.round(120 + 70 * Math.max(0, lit)));
    else if (d > R - 2.4 && lit > 0.3) p.set(x, y, 0x020806, 70);
    const ga = Math.abs(a + 2.2);
    if (d > R - 4.6 && d < R - 2.6 && ga < 0.42) p.set(x, y, 0xe8fff0, ga < 0.2 && d > R - 4.1 && d < R - 3.1 ? 110 : 55);
    if (d > R - 3.2 && d < R - 2.2 && a > 0.35 && a < 1.15) p.set(x, y, 0xd8ffe8, 38);
  }
  p.set(c - 8, c - 12, 0xffffff, 170); p.set(c - 7, c - 12, 0xffffff, 110); p.set(c - 8, c - 11, 0xffffff, 110);
  p.set(c - 11, c - 8, 0xffffff, 90);
  return p;
}

// ---------------------------------------------------------------- glyphs (radar + survey map)
export const GLYPH = {
  home: ['..o..', '.ooo.', 'ooooo', '.o.o.', '.ooo.'],
  town: ['o.o.o', 'ooooo', '.ooo.', '.o.o.', '.o.o.'],
  station: ['..o..', '.ooo.', '.ooo.', 'ooooo', '..o..'],
  stake: ['.o.', 'ooo', '.o.'],
  enemy: ['o.o', '.o.', 'o.o'],
  ore: ['oo', 'oo'],
  up: ['..o..', '.ooo.', 'ooooo'],
  down: ['ooooo', '.ooo.', '..o..'],
  you: ['..o..', '.ooo.', 'oo.oo', 'o...o'],
  ruin: ['ooooo', '.o.o.', '.o.o.', 'ooooo'], // ruins part: two pillars under a lintel (Ruins.radarMarkers)
  quest: ['..o..', '.ooo.', 'oo.oo', '.ooo.', '..o..'], // quests part: the tracked objective (a hollow diamond)
  // rim arrows, pointing outward in 8 directions (N, NE, E, SE, S, SW, W, NW)
  a0: ['..o..', '.ooo.', 'ooooo'],
  a1: ['oooo', '.ooo', '..oo', '...o'],
  a2: ['o..', 'oo.', 'ooo', 'oo.', 'o..'],
  a3: ['...o', '..oo', '.ooo', 'oooo'],
  a4: ['ooooo', '.ooo.', '..o..'],
  a5: ['o...', 'oo..', 'ooo.', 'oooo'],
  a6: ['..o', '.oo', 'ooo', '.oo', '..o'],
  a7: ['oooo', 'ooo.', 'oo..', 'o...'],
};

/** Plot a glyph into a Px centered on (cx, cy). */
export function plotGlyph(p, name, cx, cy, color, outline = null, a = 255) {
  const g = GLYPH[name];
  if (!g) return;
  const h = g.length, w = g[0].length;
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
  if (outline !== null) {
    for (let y = -1; y <= h; y++)
      for (let x = -1; x <= w; x++) {
        if (g[y]?.[x] === 'o') continue;
        let n = false;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g[y + oy]?.[x + ox] === 'o') n = true;
        if (n) p.set(x0 + x, y0 + y, outline, a);
      }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y][x] === 'o') p.set(x0 + x, y0 + y, color, a);
}

// ---------------------------------------------------------------- crosshair reticles (15×15)
function reticle(kind) {
  const p = new Px(15, 15);
  const c = 7;
  const pale = 0xf4ecd8, dk = 0x1a120c;
  if (kind === 'none') {
    p.set(c, c, pale);
    p.outline(dk, true);
    return p;
  }
  if (kind === 'rock') {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) for (let k = 3; k <= 5; k++) p.set(c + dx * k, c + dy * k, pale);
    p.set(c, c, pale);
  } else if (kind === 'ore') {
    const g = 0xffd76a;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      p.set(c + sx * 5, c + sy * 5, g); p.set(c + sx * 4, c + sy * 5, g); p.set(c + sx * 5, c + sy * 4, g);
      p.set(c + sx * 3, c + sy * 5, g); p.set(c + sx * 5, c + sy * 3, g);
    }
    p.set(c, c, 0xffffff); p.set(c, c - 1, g); p.set(c, c + 1, g); p.set(c - 1, c, g); p.set(c + 1, c, g);
  } else if (kind === 'enemy') {
    const r = 0xff5a3a;
    for (let k = 2; k <= 5; k++) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.set(c + sx * k, c + sy * k, r);
    p.set(c, c, 0xffd0c0);
  } else if (kind === 'use') {
    const u = 0x9ff0ff;
    for (let a = 0; a < 24; a++) p.set(Math.round(c + Math.cos((a / 24) * Math.PI * 2) * 4.2), Math.round(c + Math.sin((a / 24) * Math.PI * 2) * 4.2), u);
    p.set(c, c, 0xffffff);
  }
  p.outline(dk);
  return p;
}

// ---------------------------------------------------------------- touch: big dig button + icons
function bigButton(down = false) {
  const S = 40, c = S / 2 - 0.5, R = 18.5, oy = down ? 1 : 0;
  const p = new Px(S, S + 1);
  if (!down) p.disk(c + 0.5, c + 2, R, W.dd);
  for (let y = 0; y < S + 1; y++)
    for (let x = 0; x < S; x++) {
      const dx = x - c, dy = y - c - oy, r = Math.hypot(dx, dy);
      if (r > R) continue;
      const lit = -(dx + dy) / (r || 1);
      let col;
      if (r > R - 1.3) col = lit > 0.3 ? B.lt : lit > -0.3 ? B.base : B.dk;
      else if (r > R - 2.6) col = lit > 0 ? B.dd : B.base;
      else if (r > R - 4) col = lit > 0 ? 0x5a3a20 : down ? W.base : 0xb07a46;
      else {
        col = down ? 0x6a2a1c : 0x8a3424; // oxblood leather face
        if (lit > 0.6 && r > R - 9) col = down ? 0x7a3222 : 0xa8463a;
        if ((x * 7 + y * 3) % 11 === 0) col = mixHex(col, 0x2a0e08, 0.35);
      }
      p.set(x, y, col);
    }
  // stitched ring on the leather
  for (let a = 0; a < 40; a++) if (a % 2 === 0) p.set(Math.round(c + Math.cos((a / 40) * Math.PI * 2) * (R - 6)), Math.round(c + oy + Math.sin((a / 40) * Math.PI * 2) * (R - 6)), 0xe6c690);
  p.outline(INK);
  return p;
}
function pickGlyph() {
  const p = new Px(17, 17);
  p.tpl([
    '....aaaaa........',
    '..aaabbbbaa......',
    '.aab.....bbaa....',
    'ab.........ba....',
    'a...........ba...',
    '.......cc....a...',
    '......cc.........',
    '.....cc..........',
    '....cc...........',
    '...cc............',
    '..cc.............',
    '.cc..............',
  ], { a: 0xd8dde6, b: 0x8a92a0, c: 0xc98a4a }, 0, 2);
  p.outline(0x1a100a);
  return p;
}
function mouseCard() {
  const p = new Px(13, 17);
  p.rr(1, 1, 11, 15, 5, 0xf4ecd8);
  p.vl(6, 1, 6, 0x8a7a64); p.hl(1, 11, 7, 0x8a7a64);
  p.rect(2, 2, 4, 4, 0xffd76a);
  p.vl(10, 8, 13, 0xc8bca4); p.hl(4, 9, 14, 0xc8bca4);
  p.outline(INK);
  return p;
}
/** Survey map board clip (brass). */
function clip() {
  const p = new Px(26, 12);
  p.rr(2, 3, 22, 8, 2, B.base);
  p.hl(3, 22, 3, B.hi); p.hl(3, 22, 10, B.dk);
  p.rr(8, 0, 10, 6, 2, B.lt); p.rect(10, 1, 6, 3, B.dd);
  p.set(4, 6, B.dd); p.set(21, 6, B.dd);
  p.outline(INK);
  return p;
}
/** Compass rose for the survey map (north up, "N" on top). */
function compass() {
  const p = new Px(21, 26);
  const c = 10, cy = 15;
  p.poly([[c, cy - 9], [c + 3, cy], [c, cy + 1], [c - 3, cy]], 0xb8402c);
  p.poly([[c, cy + 9], [c + 3, cy], [c, cy - 1], [c - 3, cy]], 0x4a2c16);
  p.poly([[c - 9, cy], [c, cy - 2], [c + 1, cy], [c, cy + 2]], 0x6e4a2a);
  p.poly([[c + 9, cy], [c, cy + 2], [c - 1, cy], [c, cy - 2]], 0x6e4a2a);
  p.set(c, cy, 0xf2e1b9);
  // N
  for (let y = 0; y < 5; y++) { p.set(8, y, 0x4a2c16); p.set(12, y, 0x4a2c16); }
  p.set(9, 1, 0x4a2c16); p.set(10, 2, 0x4a2c16); p.set(11, 3, 0x4a2c16);
  return p;
}
/** Pixel ring for hold actions: 25×25, n of 24 segments lit. */
export function progressRing(p, frac, on = 0xffd76a, off = 0x2a1a10) {
  const c = 12, segs = 24, lit = Math.round(Math.max(0, Math.min(1, frac)) * segs);
  p.d.fill(0);
  // dark rims first (inside and outside), then the track: readable on bright and dark rock alike
  for (let k = 0; k < segs * 4; k++) {
    const a = (k / (segs * 4)) * Math.PI * 2;
    for (const rr of [9.2, 11.6]) p.set(Math.round(c + Math.cos(a) * rr), Math.round(c + Math.sin(a) * rr), 0x140c08, 150);
  }
  for (let s = 0; s < segs; s++) {
    for (let k = 0; k < 3; k++) {
      const a = ((s + k / 3) / segs) * Math.PI * 2 - Math.PI / 2;
      const x = Math.round(c + Math.cos(a) * 10.4), y = Math.round(c + Math.sin(a) * 10.4);
      p.set(x, y, s < lit ? on : off, s < lit ? 255 : 170);
    }
  }
  return p;
}

/** 5×3 triangle (up or down), for tags and buttons. */
function tri(dir, color) {
  const p = new Px(7, 5);
  plotGlyph(p, dir, 3.5, 2.5, color, null);
  return p;
}

/**
 * The radar's north fleur (9×12): a little brass fleur-de-lis riding the dial band, its middle
 * petal tipped in red enamel, a pin through its foot (Radar.js swings it on a damped spring).
 */
function northFleur() {
  const BR = RAMP.brass, red = PAL.red;
  const p = new Px(9, 12);
  const T = [
    '....r....',
    '...rRr...',
    '...rRr...',
    '.b.rbr.b.',
    'bBb.b.bBb',
    'bBbbBbbBb',
    '.bbbBbbb.',
    '..bbbbb..',
    '...bBb...',
    '..bbbbb..',
    '...bbb...',
    '....b....',
  ];
  const m = new Px(9, 12);
  m.tpl(T, { r: 1, R: 1, b: 1, B: 1 });
  for (let y = 0; y < 12; y++) for (let x = 0; x < 9; x++) {
    const ch = T[y][x];
    if (ch === '.') continue;
    const rim = (!m.a(x - 1, y) || !m.a(x, y - 1) ? 0.22 : 0) - (!m.a(x + 1, y) || !m.a(x, y + 1) ? 0.22 : 0);
    if (ch === 'r' || ch === 'R') p.set(x, y, ch === 'R' ? red.hi : rim > 0 ? red.lt : rim < 0 ? red.dk : red.base);
    else p.set(x, y, tone(BR, (ch === 'B' ? 0.82 : 0.55) + rim));
  }
  p.set(4, 9, 0x1a0e08); // the pin
  p.outline(0x1a0e08);
  return p;
}

export const DSPR = {
  north: () => art('radarNorth', northFleur),
  tri: (dir, color = 0x3a2006) => art(`tri:${dir}:${color}`, () => tri(dir, color)),
  radarRing: () => art('radarRing', radarRing),
  reticle: (kind) => art('ret:' + kind, () => reticle(kind)),
  bigBtn: (down = false) => art('bigBtn' + (down ? 1 : 0), () => bigButton(down)),
  pick: () => art('pickGlyph', pickGlyph),
  mouse: () => art('mouseCard', mouseCard),
  clip: () => art('mapClip', clip),
  compass: () => art('compass', compass),
};
export { IRON, P as PAPER };

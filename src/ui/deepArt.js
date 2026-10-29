// Pixel art for the first-person HUD: the brass radar, crosshair reticles, the big dig button,
// tiny map glyphs (shared by the radar screen and the survey map) and the look card.
import { Px, PAL, INK, art, mixHex } from './uiArt.js';

const B = PAL.brass, W = PAL.wood, P = PAL.paper;
const IRON = { hi: 0x8a8890, lt: 0x6a6870, base: 0x46444c, dk: 0x2e2c32, dd: 0x1c1b20 };

/** Radar geometry (art px): the screen is a 36 px disc centered in a 54 px device. */
export const RADAR = { size: 54, screen: 36, off: 9, r: 18 };

// ---------------------------------------------------------------- radar device
function radarRing() {
  const S = RADAR.size, c = S / 2, rIn = RADAR.r + 0.6, rOut = RADAR.r + 6.4;
  const p = new Px(S, S);
  // carrying strap loop (top-left, behind the ring)
  for (let a = 0; a < 40; a++) {
    const t = Math.PI * 1.05 + (a / 40) * Math.PI * 0.55;
    const x = Math.round(c + Math.cos(t) * 26.5), y = Math.round(c + Math.sin(t) * 26.5);
    p.set(x, y, PAL.leather.base); p.set(x + 1, y, PAL.leather.dk); p.set(x, y + 1, PAL.leather.lt);
  }
  // tuning knob (right side)
  p.disk(c + 23.5, c + 9.5, 3.4, IRON.base);
  for (let k = 0; k < 6; k++) p.set(Math.round(c + 23.5 + Math.cos(k) * 3), Math.round(c + 9.5 + Math.sin(k) * 3), IRON.dk);
  p.set(Math.round(c + 22.5), Math.round(c + 8.5), IRON.hi);
  // brass ring with a bevel lit from the top-left
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      if (d < rIn || d > rOut) continue;
      const lit = -(dx + dy) / (d || 1); // 1 = top-left
      const t = (d - rIn) / (rOut - rIn); // 0 inner .. 1 outer
      let col;
      if (t > 0.86) col = lit > 0.2 ? B.hi : lit > -0.35 ? B.lt : B.dk;
      else if (t < 0.18) col = lit > 0 ? B.dd : B.lt; // inner lip: shadowed at the top-left
      else col = lit > 0.55 ? B.lt : lit > -0.45 ? B.base : B.dk;
      p.set(x, y, col);
    }
  // engraved ticks every 30°, a red forward notch at the top
  for (let k = 1; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 - Math.PI / 2;
    for (const rr of [RADAR.r + 3, RADAR.r + 4]) p.set(Math.round(c - 0.5 + Math.cos(a) * rr), Math.round(c - 0.5 + Math.sin(a) * rr), B.dd);
  }
  const top = Math.round(c - RADAR.r - 5);
  p.poly([[c - 3, top], [c + 3, top], [c, top + 4]], PAL.red.base);
  p.set(c - 2, top, PAL.red.hi); p.set(c - 1, top, PAL.red.lt);
  // four screws
  for (const a of [0.785, 2.356, 3.927, 5.498]) {
    const x = Math.round(c - 1 + Math.cos(a) * (RADAR.r + 3.6)), y = Math.round(c - 1 + Math.sin(a) * (RADAR.r + 3.6));
    p.rect(x, y, 2, 2, B.dk); p.set(x, y, B.hi); p.set(x + 1, y + 1, B.dd); p.set(x + 1, y, B.dd);
  }
  p.outline(INK);
  // glass: soft inner shadow at the rim, a crescent of glare at the top-left
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      if (d >= rIn) continue;
      if (d > RADAR.r - 1.2) p.set(x, y, 0x020806, 150);
      const a = Math.atan2(dy, dx);
      if (d > RADAR.r - 4.2 && d < RADAR.r - 2.6 && a > -2.6 && a < -1.75) p.set(x, y, 0xe8fff0, 70);
    }
  p.set(c - 9, c - 11, 0xffffff, 120); p.set(c - 10, c - 9, 0xffffff, 90);
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

export const DSPR = {
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

// Procedural pixel textures for the kitchen (wall planks, counter top, window view, chalk doodles).
import * as THREE from 'three';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';
import { makeRng, shade, mixHex } from '../core/util.js';

function tex(pc, repeat) {
  const t = pixelTexture(pc.commit());
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Cozy red vertical planks with dark gaps, nails, grain and a little moss. 32 px per unit. */
export function wallPlanksTex(repeat = [1, 1]) {
  const W = 128, H = 96;
  const pc = new PixelCanvas(W, H);
  const rng = makeRng(41);
  const bases = [0x8c2f27, 0x7f2a23, 0x95352b, 0x86302a, 0x7a2721, 0x903128];
  for (let x0 = 0; x0 < W; x0 += 8) {
    const base = rng.pick(bases);
    const joint = rng.int(10, H - 10);
    for (let y = 0; y < H; y++) {
      for (let x = x0; x < x0 + 8; x++) {
        let c = base;
        const gx = x - x0;
        const streak = ((x * 7 + Math.floor(y / 5) * 3 + x0) % 11 === 0);
        if (streak) c = shade(base, 0.86);
        if ((x * 13 + y * 3) % 37 === 0) c = shade(base, 1.12);
        if (gx === 1) c = shade(base, 1.14);
        if (gx === 7) c = shade(base, 0.78);
        if (gx === 0) c = 0x3a1210;
        if (y === joint) c = 0x3a1210;
        if (y === joint + 1 && gx > 0) c = shade(base, 1.1);
        pc.set(x, y, c);
      }
    }
    // nails near joints
    pc.set(x0 + 3, joint - 2, 0x2a1a18); pc.set(x0 + 3, joint + 3, 0x2a1a18);
    // knots
    if (rng.chance(0.5)) {
      const ky = rng.int(4, H - 6), kx = x0 + rng.int(2, 5);
      pc.set(kx, ky, shade(base, 0.6)); pc.set(kx + 1, ky, shade(base, 0.7)); pc.set(kx, ky + 1, shade(base, 0.7));
    }
  }
  // soot / dirt smudges
  for (let i = 0; i < 40; i++) {
    const x = rng.int(0, W - 1), y = rng.int(0, H - 1);
    if (pc.getHex(x, y) !== 0x3a1210) pc.set(x, y, shade(pc.getHex(x, y), 0.82));
  }
  return tex(pc, repeat);
}

/** Honey-colored counter planks running along x, with seams, knots, stains and flour dust. */
export function counterTex(repeat = [1, 1]) {
  const W = 128, H = 64;
  const pc = new PixelCanvas(W, H);
  const rng = makeRng(77);
  const bases = [0xb57b45, 0xa86f3d, 0xbf854d, 0xae7542];
  for (let y0 = 0; y0 < H; y0 += 8) {
    const base = rng.pick(bases);
    const joint = rng.int(8, W - 8);
    for (let y = y0; y < y0 + 8; y++) {
      for (let x = 0; x < W; x++) {
        const gy = y - y0;
        let c = base;
        if ((x * 3 + y * 17) % 29 === 0 || ((x + gy * 9) % 23 === 0 && gy > 1 && gy < 6)) c = shade(base, 0.88);
        if (gy === 1) c = shade(base, 1.1);
        if (gy === 7) c = shade(base, 0.82);
        if (gy === 0) c = 0x5e3a1e;
        if (x === joint) c = 0x5e3a1e;
        pc.set(x, y, c);
      }
    }
  }
  // knife scratches, stains, flour dust
  for (let i = 0; i < 18; i++) {
    const x = rng.int(0, W - 6), y = rng.int(1, H - 2);
    for (let k = 0; k < rng.int(2, 5); k++) pc.set(x + k, y, shade(pc.getHex(x + k, y), 0.8));
  }
  for (let i = 0; i < 4; i++) {
    const cx = rng.int(6, W - 6), cy = rng.int(6, H - 6), r = rng.range(2, 4);
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
      const d = Math.hypot(x, y);
      if (d > r - 0.6 && d < r + 0.4) pc.set(cx + x, cy + y, shade(pc.getHex(cx + x, cy + y), 0.84));
    }
  }
  for (let i = 0; i < 60; i++) {
    const x = rng.int(0, W - 1), y = rng.int(0, H - 1);
    pc.set(x, y, mixHex(pc.getHex(x, y), 0xf2e6c8, 0.55));
  }
  return tex(pc, repeat);
}

/** Dark wooden beam texture (along x). */
export function beamTex(repeat = [1, 1]) {
  const W = 64, H = 8;
  const pc = new PixelCanvas(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = 0x4a2c18;
    if (y === 0) c = 0x6a4228;
    if (y === H - 1) c = 0x2e1a0e;
    if ((x * 5 + y * 11) % 17 === 0) c = 0x3c2414;
    pc.set(x, y, c);
  }
  return tex(pc, repeat);
}

/** The view through the round window: dark cave, glowing mushrooms, crystals and a few drips. */
export function caveViewTex() {
  const S = 48;
  const pc = new PixelCanvas(S, S);
  const rng = makeRng(9);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = y / S;
    let c = mixHex(0x10142a, 0x2a2246, t);
    if ((x * 7 + y * 13) % 31 === 0) c = shade(c, 1.25);
    pc.set(x, y, c);
  }
  // far cave wall silhouettes
  for (let x = 0; x < S; x++) {
    const h = 30 + Math.round(Math.sin(x * 0.35) * 3 + Math.sin(x * 0.9 + 1) * 2);
    for (let y = h; y < S; y++) pc.set(x, y, y === h ? 0x3a3060 : 0x1e1834);
  }
  // stalactites
  for (let i = 0; i < 6; i++) {
    const x = rng.int(2, S - 3), len = rng.int(4, 10);
    for (let y = 0; y < len; y++) for (let k = 0; k < Math.max(1, 3 - Math.floor(y / 3)); k++) pc.set(x + k - 1, y, 0x1a1630);
  }
  // glowing blue mushrooms
  const shroom = (x, y, s, c) => {
    for (let k = -s; k <= s; k++) pc.set(x + k, y, c);
    for (let k = -s + 1; k <= s - 1; k++) pc.set(x + k, y - 1, shade(c, 1.2));
    pc.set(x, y + 1, 0xbfd8e8); pc.set(x, y + 2, 0xbfd8e8);
    for (let k = -s - 1; k <= s + 1; k++) pc.set(x + k, y - 2, mixHex(pc.getHex(x + k, y - 2), c, 0.35));
  };
  shroom(10, 33, 2, 0x5ab8ff); shroom(16, 36, 1, 0x7fd0ff); shroom(36, 32, 3, 0x5ab8ff); shroom(42, 37, 1, 0x9fe0ff); shroom(27, 38, 1, 0x7fd0ff);
  // crystals
  const crystal = (x, y, h, c) => { for (let k = 0; k < h; k++) { pc.set(x, y - k, k === h - 1 ? 0xffffff : c); if (k < h - 2) pc.set(x + 1, y - k, shade(c, 0.8)); } };
  crystal(22, 37, 5, 0xc9a6ff); crystal(31, 39, 3, 0x9fd6ff); crystal(4, 39, 4, 0xc9a6ff);
  // glow motes
  for (let i = 0; i < 14; i++) pc.set(rng.int(1, S - 2), rng.int(8, 30), rng.pick([0x9fe0ff, 0xd8f0ff, 0xc9a6ff]));
  return tex(pc);
}

/** A tiny framed portrait of Nugget the chicken in her straw hat. */
export function nuggetPortraitTex() {
  const W = 24, H = 28;
  const pc = new PixelCanvas(W, H);
  pc.rect(0, 0, W, H, 0x6a4228);
  pc.rect(1, 1, W - 2, H - 2, 0xc8a050);
  pc.rect(3, 3, W - 6, H - 6, 0x7ab0c8);
  pc.rect(3, 17, W - 6, H - 20, 0x6aa04a);
  // chicken
  pc.ellipse(12, 16, 5, 4.2, 0xf6f0e4);
  pc.ellipse(12, 10.5, 3, 3, 0xf6f0e4);
  pc.set(10, 10, 0x1a1418); pc.set(14, 10, 0x1a1418);
  pc.rect(11, 12, 3, 1, 0xf0b030); pc.set(12, 13, 0xe0302a);
  // straw hat
  pc.rect(7, 7, 11, 1, 0xe8c870); pc.rect(9, 5, 7, 2, 0xe0c060); pc.rect(9, 6, 7, 1, 0xc94a3a);
  pc.rect(10, 20, 1, 2, 0xf0a030); pc.rect(14, 20, 1, 2, 0xf0a030);
  // heart
  pc.set(18, 5, 0xe0404a); pc.set(20, 5, 0xe0404a); pc.rect(18, 6, 3, 1, 0xe0404a); pc.set(19, 7, 0xe0404a);
  return tex(pc);
}

/** Chalkboard with a mole-made doodle menu. */
export function chalkboardTex() {
  const W = 48, H = 32;
  const pc = new PixelCanvas(W, H);
  pc.rect(0, 0, W, H, 0x5a3a22);
  pc.rect(2, 2, W - 4, H - 4, 0x2a4a3a);
  const rng = makeRng(3);
  for (let i = 0; i < 50; i++) pc.set(rng.int(2, W - 3), rng.int(2, H - 3), 0x325446);
  const chalk = 0xe8efe6;
  // "1,000,000" goal doodle: coin + arrow up to a sun
  pc.disk(10, 22, 4, 0xe8d070); pc.disk(10, 22, 2.5, 0xd8b850); pc.set(10, 22, chalk);
  for (let y = 9; y < 19; y++) pc.set(20, y, chalk);
  pc.set(19, 10, chalk); pc.set(21, 10, chalk); pc.set(18, 11, chalk); pc.set(22, 11, chalk);
  pc.disk(33, 11, 4, 0xf0d060);
  for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4; pc.set(Math.round(33 + Math.cos(ang) * 6.5), Math.round(11 + Math.sin(ang) * 6.5), 0xf0d060); }
  // little palm & wave line
  for (let x = 26; x < 44; x++) pc.set(x, 25 + Math.round(Math.sin(x * 0.8)), 0x9fd6ff);
  pc.rect(39, 15, 1, 9, 0xc8a070); pc.rect(36, 14, 7, 1, 0x7ac86a); pc.set(35, 15, 0x7ac86a); pc.set(43, 15, 0x7ac86a);
  // chalk tray
  pc.rect(2, H - 3, W - 4, 1, 0x3a2414); pc.rect(6, H - 4, 4, 1, chalk); pc.rect(30, H - 4, 3, 1, 0xf0a0b0);
  return tex(pc);
}

/** A small stretch of pixel liquid (top-down), with a rim shading ring and bubbles. */
export function liquidTex(color, opts = {}) {
  const S = 32;
  const pc = new PixelCanvas(S, S);
  const rng = makeRng(opts.seed || 5);
  const c = S / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
    if (d > 1) continue;
    let col = color;
    if (d > 0.82) col = shade(color, 0.72);
    else if (d > 0.66) col = shade(color, 0.86);
    // swirl streaks
    const ang = Math.atan2(y - c, x - c);
    const s = Math.sin(ang * 3 + d * 9);
    if (s > 0.86 && d < 0.8) col = mixHex(color, 0xffffff, 0.28);
    pc.set(x, y, col);
  }
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(0.1, 0.7) * c;
    const x = Math.round(c + Math.cos(a) * r), y = Math.round(c + Math.sin(a) * r);
    pc.set(x, y, mixHex(color, 0xffffff, 0.55));
    if (rng.chance(0.4)) pc.set(x + 1, y, mixHex(color, 0xffffff, 0.35));
  }
  if (opts.glow) for (let i = 0; i < 6; i++) pc.set(rng.int(6, 26), rng.int(6, 26), 0xffffff);
  return tex(pc);
}

/** Dashed guide line (vertical) for chopping. */
export function dashTex() {
  const pc = new PixelCanvas(2, 16);
  for (let y = 0; y < 16; y++) if (y % 4 < 2) { pc.set(0, y, 0xffffff); pc.set(1, y, 0xffffff); }
  return tex(pc);
}

/** Dithered flour dusting (white blob with ragged edges). */
export function flourTex() {
  const S = 32;
  const pc = new PixelCanvas(S, S);
  const rng = makeRng(17);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - 16, (y + 0.5 - 16) * 1.15) / 16 + (rng() - 0.5) * 0.25;
    if (d < 0.6 || (d < 0.95 && rng() < 1 - d)) pc.set(x, y, rng() < 0.2 ? 0xf0e6d0 : 0xfffaf0);
  }
  return tex(pc);
}

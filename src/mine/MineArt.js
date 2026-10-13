// Procedural pixel-art atlases for the mine: block textures, cracks, ore veins,
// plants, creatures and dropped items. Everything is drawn at 16×16 per tile.
import * as THREE from 'three';
import { PixelCanvas, ramp, iconCanvas, drawIcon } from '../gfx/PixelArt.js';
import { makeRng, hashStr, mixHex, shade } from '../core/util.js';
import { B, BLOCKS, ORES } from './blocks.js';
import { ITEMS } from '../data/items.js';
import { CREATURES } from '../data/creatures.js';
import { registerCreatureIcons } from '../ui/UI.js';

const T = 16;
const VARIANTS = 4;
// Emissive pixels are encoded with alpha in [128, 230): glow = (255 - a) / 127.
const GLOW_A = 140;

function noisy(pc, base, rng, amt = 0.1, dens = 1) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (rng() > dens) continue;
    pc.set(x, y, shade(base, 1 + (rng() - 0.5) * 2 * amt));
  }
}
function speck(pc, rng, n, colors, size = 1) {
  for (let i = 0; i < n; i++) {
    const x = rng.int(0, T - 1), y = rng.int(0, T - 1);
    const c = colors[rng.int(0, colors.length - 1)];
    pc.rect(x, y, size, size, c);
  }
}
function pebble(pc, rng, x, y, r, c) {
  const R = ramp(c);
  pc.disk(x, y, r, R[3]);
  pc.set(Math.floor(x - r * 0.4), Math.floor(y - r * 0.4), R[2]);
  pc.set(Math.floor(x + r * 0.3), Math.floor(y + r * 0.5), R[4]);
}
function crackLine(pc, rng, c, len = 6) {
  let x = rng.int(1, 14), y = rng.int(1, 14);
  for (let i = 0; i < len; i++) {
    pc.set(x, y, c);
    x += rng.int(-1, 1);
    y += rng.chance(0.7) ? 1 : 0;
    if (x < 0 || x > 15 || y > 15) break;
  }
}
function edgeShade(pc, f = 0.85) {
  // subtle bevel: lighter top-left edge, darker bottom-right, reads as a chunky block
  for (let i = 0; i < T; i++) {
    const a = pc.getHex(i, 0); pc.set(i, 0, shade(a, 1.12));
    const b = pc.getHex(0, i); pc.set(0, i, shade(b, 1.08));
    const c = pc.getHex(i, T - 1); pc.set(i, T - 1, shade(c, f));
    const d = pc.getHex(T - 1, i); pc.set(T - 1, i, shade(d, f * 1.05));
  }
}

const BLOCK_DRAW = {
  [B.DIRT](pc, rng) {
    pc.rect(0, 0, T, T, 0x6b4a32);
    noisy(pc, 0x6b4a32, rng, 0.12, 0.7);
    speck(pc, rng, 10, [0x5a3c28, 0x4e3422, 0x7e5a3e]);
    speck(pc, rng, 3, [0x8a6a4a, 0x9a7a5a]);
    if (rng.chance(0.6)) pebble(pc, rng, rng.range(3, 13), rng.range(3, 13), 1.2, 0x8a8480);
    if (rng.chance(0.4)) { const x = rng.int(2, 13); for (let y = rng.int(0, 6); y < rng.int(8, 15); y++) pc.set(x + (y % 3 === 0 ? 1 : 0), y, 0x4a3020); }
  },
  [B.LOAM](pc, rng) {
    pc.rect(0, 0, T, T, 0x54392a);
    noisy(pc, 0x54392a, rng, 0.1, 0.55);
    speck(pc, rng, 6, [0x46301f, 0x664632]);
    if (rng.chance(0.7)) { let x = rng.int(2, 13); for (let y = rng.int(0, 4); y < rng.int(9, 16); y++) { pc.set(x, y, 0x8a5c36); if (rng.chance(0.3)) x += rng.chance(0.5) ? 1 : -1; } }
    if (rng.chance(0.5)) pebble(pc, rng, rng.range(3, 13), rng.range(3, 13), 1.1, 0x8a8480);
  },
  [B.CLAY](pc, rng) {
    pc.rect(0, 0, T, T, 0xb06a3a);
    for (let y = 0; y < T; y++) {
      const band = Math.sin(y * 0.9 + rng() * 0.5) > 0.6;
      for (let x = 0; x < T; x++) if (band && rng.chance(0.85)) pc.set(x, y, 0xa05a30);
    }
    noisy(pc, 0xb06a3a, rng, 0.06, 0.35);
    speck(pc, rng, 4, [0xc8804a, 0x8a4a28]);
  },
  [B.SAND](pc, rng) {
    pc.rect(0, 0, T, T, 0xd8b878);
    speck(pc, rng, 40, [0xc8a868, 0xe8c888, 0xb89858, 0xf0d8a0]);
    for (let y = 3; y < T; y += 5) for (let x = 0; x < T; x++) if (Math.sin(x * 0.7 + y) > 0.3) pc.set(x, y, 0xc0a060);
  },
  [B.GRAVEL](pc, rng) {
    pc.rect(0, 0, T, T, 0x5a5450);
    for (let i = 0; i < 16; i++) pebble(pc, rng, rng.range(1, 15), rng.range(1, 15), rng.range(1, 2.2), rng.pick([0x8a8480, 0x9a948e, 0x7a746e, 0xa8a098]));
  },
  [B.STONE](pc, rng) {
    pc.rect(0, 0, T, T, 0x8a8480);
    noisy(pc, 0x8a8480, rng, 0.08, 0.6);
    for (let i = 0; i < 3; i++) pc.ellipse(rng.range(2, 14), rng.range(2, 14), rng.range(2, 4), rng.range(1.5, 3), rng.chance(0.5) ? 0x948e8a : 0x7e7874);
    crackLine(pc, rng, 0x625c58, 7);
    if (rng.chance(0.5)) crackLine(pc, rng, 0x6a6460, 4);
    speck(pc, rng, 3, [0xaaa4a0]);
  },
  [B.LIMESTONE](pc, rng) {
    pc.rect(0, 0, T, T, 0xc8bca0);
    for (let y = 2; y < T; y += 4) for (let x = 0; x < T; x++) if (rng.chance(0.8)) pc.set(x, y, 0xb4a88c);
    noisy(pc, 0xc8bca0, rng, 0.06, 0.4);
    speck(pc, rng, 3, [0xe0d4b8, 0xa89c80]);
  },
  [B.MUDSTONE](pc, rng) {
    pc.rect(0, 0, T, T, 0x7a6250);
    for (let y = 0; y < T; y++) if (y % 4 === rng.int(0, 1)) for (let x = 0; x < T; x++) pc.set(x, y, 0x6a5242);
    noisy(pc, 0x7a6250, rng, 0.08, 0.5);
    crackLine(pc, rng, 0x5a4434, 5);
  },
  [B.GRANITE](pc, rng) {
    pc.rect(0, 0, T, T, 0x9a8a88);
    speck(pc, rng, 26, [0x6a5a5a, 0x4a3e3e, 0xc8b8b8, 0xb89090, 0xe0d0d0]);
    speck(pc, rng, 6, [0x5a4a4a], 2);
    crackLine(pc, rng, 0x6a5a58, 6);
  },
  [B.CRYSTALROCK](pc, rng) {
    pc.rect(0, 0, T, T, 0x5a5a7a);
    noisy(pc, 0x5a5a7a, rng, 0.1, 0.6);
    for (let i = 0; i < 2; i++) { let x = rng.int(0, 15), y = 0; while (y < T) { pc.set(x, y, 0x7a6aa0); y++; x += rng.int(-1, 1); } }
    for (let i = 0; i < 5; i++) pc.set(rng.int(0, 15), rng.int(0, 15), 0xe0e0ff, rng.chance(0.5) ? GLOW_A + 40 : 255);
  },
  [B.BASALT](pc, rng) {
    pc.rect(0, 0, T, T, 0x3a3a40);
    const off = rng.int(0, 4);
    for (let x = off; x < T; x += 5) for (let y = 0; y < T; y++) pc.set(x, y, 0x2a2a30);
    for (let y = rng.int(3, 6); y < T; y += 7) for (let x = 0; x < T; x++) pc.set(x, y, 0x2a2a30);
    noisy(pc, 0x3a3a40, rng, 0.1, 0.4);
    speck(pc, rng, 4, [0x5a5a62]);
  },
  [B.OBSIDIAN](pc, rng) {
    pc.rect(0, 0, T, T, 0x1e1626);
    noisy(pc, 0x1e1626, rng, 0.15, 0.4);
    for (let i = 0; i < 3; i++) { const x0 = rng.int(0, 12), y0 = rng.int(0, 12); for (let k = 0; k < 4; k++) pc.set(x0 + k, y0 + k, k < 2 ? 0x6b5a8a : 0x3a2a4a); }
    pc.set(rng.int(2, 13), rng.int(2, 13), 0xc8b0ff);
  },
  [B.MAGMAROCK](pc, rng) {
    pc.rect(0, 0, T, T, 0x3a1a14);
    noisy(pc, 0x3a1a14, rng, 0.15, 0.6);
    for (let i = 0; i < 2; i++) {
      let x = rng.int(0, 15), y = rng.int(0, 4);
      while (y < T) { pc.set(x, y, rng.chance(0.3) ? 0xffb04a : 0xff5a1a, GLOW_A); y++; x += rng.int(-1, 1); x = Math.max(0, Math.min(15, x)); }
    }
  },
  [B.ASH](pc, rng) {
    pc.rect(0, 0, T, T, 0x6a6460);
    speck(pc, rng, 40, [0x5a5450, 0x7a746e, 0x8a8480, 0x4a4440]);
    if (rng.chance(0.4)) pc.set(rng.int(1, 14), rng.int(1, 14), 0xff7a2a, GLOW_A);
  },
  [B.PERMAFROST](pc, rng) {
    pc.rect(0, 0, T, T, 0x9ab8c8);
    noisy(pc, 0x9ab8c8, rng, 0.08, 0.6);
    for (let i = 0; i < 3; i++) { const x = rng.int(1, 14), y = rng.int(1, 14); pc.set(x, y, 0xffffff); pc.set(x + 1, y, 0xd8f0ff); pc.set(x, y + 1, 0xd8f0ff); }
    crackLine(pc, rng, 0x7a98a8, 6);
  },
  [B.ICE](pc, rng) {
    pc.rect(0, 0, T, T, 0x9ae0f0);
    for (let i = 0; i < 3; i++) { const x0 = rng.int(-4, 12); for (let k = 0; k < 8; k++) pc.set(x0 + k, 2 + k + i * 3, 0xe8fbff); }
    noisy(pc, 0x9ae0f0, rng, 0.05, 0.3);
    pc.set(rng.int(1, 14), rng.int(1, 14), 0xffffff);
  },
  [B.SNOW](pc, rng) {
    pc.rect(0, 0, T, T, 0xe8f4ff);
    speck(pc, rng, 30, [0xd8e8f8, 0xffffff, 0xc8dcf0]);
  },
  [B.CORE](pc, rng) {
    pc.rect(0, 0, T, T, 0x2a1a3a);
    noisy(pc, 0x2a1a3a, rng, 0.15, 0.7);
    for (let i = 0; i < 4; i++) pc.set(rng.int(0, 15), rng.int(0, 15), rng.pick([0xc89aff, 0xffe08a, 0xffffff]), GLOW_A);
    crackLine(pc, rng, 0x4a2a6a, 6);
  },
  [B.STARROCK](pc, rng) {
    pc.rect(0, 0, T, T, 0x1a1a3a);
    noisy(pc, 0x1a1a3a, rng, 0.2, 0.6);
    for (let i = 0; i < 7; i++) pc.set(rng.int(0, 15), rng.int(0, 15), rng.pick([0xffe08a, 0xffffff, 0xffc04a]), GLOW_A);
  },
  [B.VOIDROCK](pc, rng) {
    pc.rect(0, 0, T, T, 0x100818);
    for (let i = 0; i < 20; i++) { const a = i * 0.5, r = i * 0.35; pc.set(8 + Math.cos(a) * r, 8 + Math.sin(a) * r, 0x2a1440); }
    pc.set(rng.int(2, 13), rng.int(2, 13), 0x6a3ab0, GLOW_A);
  },
  [B.BEDROCK](pc, rng) {
    pc.rect(0, 0, T, T, 0x1a1618);
    for (let i = 0; i < 10; i++) pc.rect(rng.int(0, 14), rng.int(0, 14), 2, 2, rng.pick([0x2a2628, 0x0e0c0e, 0x241f22]));
  },
  [B.ROOTS](pc, rng) {
    pc.rect(0, 0, T, T, 0x4a3424);
    noisy(pc, 0x4a3424, rng, 0.1, 0.5);
    for (let i = 0; i < 3; i++) {
      let x = rng.int(0, 15), y = 0;
      const c = rng.pick([0x7a5030, 0x8a6038, 0x6a4428]);
      while (y < T) { pc.set(x, y, c); pc.set(x + 1, y, shade(c, 0.8)); y++; if (rng.chance(0.35)) x += rng.chance(0.5) ? 1 : -1; }
    }
  },
  [B.QUAKE](pc, rng) {
    pc.rect(0, 0, T, T, 0x8a4a3a);
    noisy(pc, 0x8a4a3a, rng, 0.1, 0.6);
    for (let i = 0; i < 3; i++) {
      let x = rng.int(0, 15), y = 0;
      while (y < T) { pc.set(x, y, 0x3a1a14); if (rng.chance(0.5)) pc.set(x + 1, y, 0xe0a070); y++; x += rng.chance(0.5) ? 1 : -1; }
    }
  },
  [B.RUBBLE](pc, rng) {
    pc.rect(0, 0, T, T, 0x4a4440);
    for (let i = 0; i < 9; i++) pebble(pc, rng, rng.range(1, 15), rng.range(1, 15), rng.range(1.5, 3), rng.pick([0x7a706a, 0x8a827c, 0x6a6058, 0x9a908a]));
  },
  [B.TIMBER](pc, rng) {
    pc.rect(0, 0, T, T, 0x8a5a32);
    for (let x = 0; x < T; x += 4) for (let y = 0; y < T; y++) pc.set(x, y, 0x6a4424);
    for (let y = 0; y < T; y++) for (let x = 1; x < T; x += 4) if (rng.chance(0.15)) pc.set(x + 1, y, 0x9a6a3a);
    pc.set(2, 3, 0x3a3a40); pc.set(2, 12, 0x3a3a40); pc.set(10, 3, 0x3a3a40); pc.set(10, 12, 0x3a3a40);
  },
  [B.GEODE](pc, rng) {
    pc.rect(0, 0, T, T, 0x7a6a8a);
    noisy(pc, 0x7a6a8a, rng, 0.1, 0.6);
    for (let i = 0; i < 4; i++) { const x = rng.int(1, 13), y = rng.int(1, 13); pc.set(x, y, 0xc89aff); pc.set(x + 1, y + 1, 0xe8d8ff); }
  },
};

/** Build the block atlas: [blockId][variant] → tile index. Also cracks (5 frames). */
export function buildBlockAtlas() {
  const cols = 16;
  const tiles = [];
  const index = {};
  for (const b of BLOCKS) {
    if (!b || b.id === B.AIR) continue;
    index[b.id] = [];
    for (let v = 0; v < VARIANTS; v++) {
      const pc = new PixelCanvas(T);
      const rng = makeRng(hashStr(b.name) + v * 977);
      (BLOCK_DRAW[b.id] || BLOCK_DRAW[B.STONE])(pc, rng);
      edgeShade(pc);
      index[b.id].push(tiles.length);
      tiles.push(pc);
    }
  }
  // crack overlays (transparent background)
  const crackStart = tiles.length;
  for (let s = 0; s < 5; s++) {
    const pc = new PixelCanvas(T);
    const rng = makeRng(4242);
    const lines = 1 + s * 2;
    for (let i = 0; i < lines; i++) {
      let x = 8 + rng.int(-2, 2), y = 8 + rng.int(-2, 2);
      const dx = rng.pick([-1, 1]), dy = rng.pick([-1, 1]);
      const len = 3 + s * 1.5 + rng.int(0, 2);
      for (let k = 0; k < len; k++) {
        pc.set(x, y, 0x120a0a, 230);
        if (s >= 3 && rng.chance(0.3)) pc.set(x + 1, y, 0x2a1a14, 200);
        x += rng.chance(0.6) ? dx : 0;
        y += rng.chance(0.6) ? dy : 0;
        if (x < 0 || x > 15 || y < 0 || y > 15) break;
      }
    }
    tiles.push(pc);
  }
  // highlight frame (selection) and glint
  const selIdx = tiles.length;
  const sel = new PixelCanvas(T);
  for (let i = 0; i < T; i++) { sel.set(i, 0, 0xffffff); sel.set(i, T - 1, 0xffffff); sel.set(0, i, 0xffffff); sel.set(T - 1, i, 0xffffff); }
  tiles.push(sel);

  const rows = Math.ceil(tiles.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * T;
  canvas.height = Math.max(1, nextPow2(rows * T));
  const ctx = canvas.getContext('2d');
  tiles.forEach((pc, i) => ctx.drawImage(pc.commit(), (i % cols) * T, Math.floor(i / cols) * T));
  const tex = makeTex(canvas);
  return { tex, canvas, index, crackStart, selIdx, cols, rows: canvas.height / T, uv: (i) => tileUV(i, cols, canvas.height / T) };
}

function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }
function tileUV(i, cols, rows) {
  const x = i % cols, y = Math.floor(i / cols);
  const e = 0.0005;
  return [x / cols + e, 1 - (y + 1) / rows + e, (x + 1) / cols - e, 1 - y / rows - e];
}
function makeTex(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  return tex;
}

// ---------------------------------------------------------------- ore veins (overlays)
const ORE_STYLE = {
  coal: { k: 'chunks', c: [0x2a2628, 0x6a7088, 0x121012] },
  copper_ore: { k: 'veins', c: [0xd9773f, 0xf6b27a, 0x8a3e1a] },
  tin_ore: { k: 'flakes', c: [0xbfc3c4, 0xf0f2f2, 0x6f7576] },
  salt_crystal: { k: 'cubes', c: [0xf3e0e0, 0xffffff, 0xc0a0a0] },
  fossil: { k: 'fossil' },
  quartz: { k: 'crystals', c: [0xf2f2f8, 0xffffff, 0xa8a8c0] },
  iron_ore: { k: 'veins', c: [0x9a6450, 0xc4876c, 0x5c3428] },
  amber: { k: 'gem', c: [0xf2a32c, 0xffe08a, 0xa85a10] },
  lumite: { k: 'crystals', c: [0x7bf08a, 0xd9ffd6, 0x2f9a52], glow: true },
  silver_ore: { k: 'veins', c: [0xd8dde6, 0xffffff, 0x8f97a6] },
  echo_crystal: { k: 'crystals', c: [0x9fd6ff, 0xeaf7ff, 0x4d86c9] },
  gravium: { k: 'crystals', c: [0xc9a6ff, 0xf3e8ff, 0x7a4fc9] },
  bioxide: { k: 'crystals', c: [0x6fe6ff, 0xe6fdff, 0x2c8fb8], glow: true },
  amethyst: { k: 'crystals', c: [0xa05ad9, 0xe8c8ff, 0x5a2a8a] },
  gold_ore: { k: 'nuggets', c: [0xf2c23a, 0xfff0a0, 0xb07a14] },
  ruby: { k: 'gem', c: [0xe02a3a, 0xff9aa2, 0x8a0a18] },
  magmaite: { k: 'crystals', c: [0xff6a1a, 0xffd27a, 0xa82a08], glow: true },
  emerald: { k: 'gem', c: [0x2ad96a, 0xb4ffcc, 0x0a7a3a] },
  frostite: { k: 'crystals', c: [0xbff6ff, 0xffffff, 0x5ab8d9], glow: true },
  sapphire: { k: 'gem', c: [0x2a5ae0, 0xa8c4ff, 0x0a1f8a] },
  mithril_ore: { k: 'veins', c: [0x9fe0e6, 0xeaffff, 0x4f9aa6] },
  moonsilver_ore: { k: 'nuggets', c: [0xe4e8ff, 0xffffff, 0x9aa2d9], glow: true },
  diamond: { k: 'gem', c: [0xd8f6ff, 0xffffff, 0x8ad0e6] },
  voidstone: { k: 'crystals', c: [0x2a1240, 0x9a6ad9, 0x0a0410] },
  adamant_ore: { k: 'veins', c: [0x4fd9a0, 0xc8ffe6, 0x1f7a58] },
  starmetal_ore: { k: 'nuggets', c: [0xffe08a, 0xffffff, 0xc9862a], glow: true },
  sunstone: { k: 'gem', c: [0xffcf3a, 0xfffbd0, 0xd9781a], glow: true },
  truffle: { k: 'truffle', c: [0x5a3a2a, 0x8a6a4a, 0x2a1a10] },
};

function drawOre(pc, style, rng, variant) {
  const [c, hi, lo] = style.c || [0xffffff, 0xffffff, 0x888888];
  const glowA = style.glow ? GLOW_A + 30 : 255;
  switch (style.k) {
    case 'veins': {
      for (let i = 0; i < 2; i++) {
        let x = rng.int(1, 14), y = rng.int(0, 3);
        while (y < 15) { pc.set(x, y, lo); if (rng.chance(0.6)) pc.set(x + 1, y, c); y++; x += rng.int(-1, 1); x = Math.max(1, Math.min(13, x)); }
      }
      for (let i = 0; i < 5; i++) { const x = rng.int(2, 12), y = rng.int(2, 12); pc.rect(x, y, 2, 2, c); pc.set(x, y, hi, glowA); pc.set(x + 1, y + 1, lo); }
      break;
    }
    case 'nuggets': {
      for (let i = 0; i < 4; i++) {
        const x = rng.int(2, 11), y = rng.int(2, 11), r = rng.range(1.3, 2.2);
        pc.disk(x + 0.5, y + 0.5, r, c, glowA);
        pc.set(x - 1, y - 1 + 1, hi, glowA);
        pc.set(x + 1, y + 1, lo);
      }
      break;
    }
    case 'flakes': {
      for (let i = 0; i < 9; i++) { const x = rng.int(1, 14), y = rng.int(1, 14); pc.set(x, y, c); pc.set(x + 1, y, rng.chance(0.5) ? hi : lo); }
      break;
    }
    case 'chunks': {
      for (let i = 0; i < 5; i++) { const x = rng.int(1, 12), y = rng.int(1, 12), w = rng.int(2, 3), h = rng.int(2, 3); pc.rect(x, y, w, h, c); pc.set(x, y, hi); pc.set(x + w - 1, y + h - 1, lo); }
      break;
    }
    case 'cubes': {
      for (let i = 0; i < 4; i++) { const x = rng.int(1, 12), y = rng.int(1, 12); pc.rect(x, y, 3, 3, c); pc.rect(x, y, 3, 1, hi); pc.rect(x + 2, y + 1, 1, 2, lo); }
      break;
    }
    case 'crystals': {
      const n = 3 + rng.int(0, 1);
      for (let i = 0; i < n; i++) {
        const bx = rng.int(3, 12), by = rng.int(6, 13), h = rng.int(4, 7);
        const lean = rng.pick([-1, 0, 1]);
        for (let k = 0; k < h; k++) {
          const x = bx + Math.round((lean * k) / 3), y = by - k;
          pc.set(x, y, k === h - 1 ? hi : c, glowA);
          pc.set(x + 1, y, k === h - 1 ? c : lo, glowA);
          if (k < h - 2) pc.set(x - 1, y, hi, glowA);
        }
      }
      break;
    }
    case 'gem': {
      const x = rng.int(5, 9), y = rng.int(5, 9);
      pc.ellipse(x + 1, y + 1, 3, 2.6, c, glowA);
      pc.ellipse(x + 0.6, y + 0.4, 1.6, 1.2, hi, glowA);
      pc.set(x + 2, y + 2, lo);
      pc.set(x - 1, y - 1, 0xffffff, glowA);
      if (variant) { const x2 = rng.int(2, 12), y2 = rng.int(2, 12); pc.rect(x2, y2, 2, 2, c, glowA); pc.set(x2, y2, hi, glowA); }
      break;
    }
    case 'fossil': {
      let a = 0, r = 0.5;
      const cx = 8 + rng.int(-2, 2), cy = 8 + rng.int(-2, 2);
      for (let i = 0; i < 40; i++) { a += 0.45; r += 0.12; pc.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, i % 3 === 0 ? 0x6a5038 : 0xe8d8b8); }
      break;
    }
    case 'truffle': {
      const x = rng.int(4, 9), y = rng.int(5, 9);
      pc.ellipse(x + 1.5, y + 1.5, 3, 2.5, c);
      for (let k = 0; k < 6; k++) pc.set(x + rng.int(-1, 3), y + rng.int(-1, 3), hi);
      pc.set(x + 3, y + 3, lo);
      break;
    }
    default:
      pc.rect(6, 6, 4, 4, c);
  }
}

export function buildSpriteAtlas() {
  // 32×32 grid of 16px tiles in a 512px canvas
  const cols = 32;
  const canvas = document.createElement('canvas');
  canvas.width = cols * T;
  canvas.height = 32 * T;
  const ctx = canvas.getContext('2d');
  let next = 0;
  const put = (pc) => { const i = next++; ctx.drawImage(pc.commit ? pc.commit() : pc, (i % cols) * T, Math.floor(i / cols) * T); return i; };
  const ore = {};
  for (const o of ORES) {
    if (!o) continue;
    const style = ORE_STYLE[o.item];
    if (!style) continue;
    ore[o.id] = [];
    for (let v = 0; v < 2; v++) {
      const pc = new PixelCanvas(T);
      drawOre(pc, style, makeRng(hashStr(o.item) + v * 31), v);
      ore[o.id].push(put(pc));
    }
  }
  const items = {};
  for (const id of Object.keys(ITEMS)) {
    const it = ITEMS[id];
    if (!['mineral', 'gem', 'plant', 'critter', 'drop', 'ingredient', 'food', 'consumable'].includes(it.cat)) continue;
    items[id] = put(iconCanvas(id));
  }
  const plants = {};
  for (const [name, fn] of Object.entries(PLANT_DRAW)) {
    plants[name] = [];
    for (let f = 0; f < 2; f++) { const pc = new PixelCanvas(T); fn(pc, makeRng(hashStr(name) + f * 7), f); plants[name].push(put(pc)); }
  }
  const critters = {};
  for (const [name, fn] of Object.entries(CRITTER_DRAW)) {
    critters[name] = [];
    for (let f = 0; f < 4; f++) { const pc = new PixelCanvas(T); fn(pc, f); critters[name].push(put(pc)); }
  }
  // misc sprites
  const misc = {};
  for (const [name, fn] of Object.entries(MISC_DRAW)) { const pc = new PixelCanvas(T); fn(pc); misc[name] = put(pc); }
  const tex = makeTex(canvas);
  const rows = 32;
  const uv = (i) => tileUV(i, cols, rows);
  // register creature icons for the index book / UI
  const critterURL = {};
  registerCreatureIcons((id) => {
    if (critterURL[id]) return critterURL[id];
    const fn = CRITTER_DRAW[id];
    if (!fn) return null;
    const pc = new PixelCanvas(T);
    fn(pc, 0);
    critterURL[id] = pc.commit().toDataURL();
    return critterURL[id];
  });
  return { tex, canvas, ore, items, plants, critters, misc, uv };
}

// ---------------------------------------------------------------- plants (in-world, growing)
const PLANT_DRAW = {
  glowcap(pc, rng, f) {
    const caps = [[5, 9, 3.2], [10, 11, 2.4], [12, 7, 1.8]];
    for (const [x, y, r] of caps) {
      pc.rect(x - 0.5, y, 2, 15 - y, 0xe8e0d0);
      pc.ellipse(x + 0.5, y, r + 1, r * 0.8, 0x4ab0ff, GLOW_A);
      pc.ellipse(x, y - 0.6, r * 0.5, r * 0.3, 0xd8f6ff, GLOW_A);
    }
    if (f) pc.set(3, 3, 0xbfe8ff, GLOW_A);
  },
  carrot(pc, rng) {
    for (let i = 0; i < 4; i++) pc.line(8, 13, 4 + i * 2.5, 4 + (i % 2) * 2, i % 2 ? 0x6aa84a : 0x8ac86a);
    pc.rect(6, 13, 4, 3, 0xf0c8a0);
    pc.set(6, 13, 0xf8e0c0);
  },
  fern(pc, rng) {
    for (let i = 0; i < 5; i++) { const a = -2.2 + i * 0.55; const x2 = 8 + Math.cos(a) * 7, y2 = 15 + Math.sin(a) * 9; pc.line(8, 15, x2, y2, 0xd8e0c8); pc.set(x2, y2, 0xf0f4e8); }
  },
  whisper(pc, rng, f) {
    for (let i = 0; i < 4; i++) { let x = 4 + i * 3, y = 0; while (y < 12 + (i % 2) * 3) { pc.set(x, y, i % 2 ? 0xa080c0 : 0xc0a0e0); y++; if (rng.chance(0.3)) x += f ? 1 : -1; } pc.set(x, y, 0xe8d8ff, GLOW_A + 60); }
  },
  vine(pc, rng) {
    let x = 8;
    for (let y = 0; y < 16; y++) { pc.set(x, y, 0x4a7a3a); if (y % 4 === 2) { pc.set(x + 1, y, 0x6aa84a); pc.set(x + 2, y, 0x6aa84a); } if (rng.chance(0.25)) x += rng.chance(0.5) ? 1 : -1; }
    pc.disk(x + 0.5, 13, 1.6, 0xf0e0b0);
    pc.disk(9, 6, 1.2, 0xf0e0b0);
  },
  pepper(pc) {
    pc.line(8, 15, 8, 8, 0x4a8a3a); pc.line(8, 10, 5, 7, 0x6aa84a); pc.line(8, 9, 11, 6, 0x6aa84a);
    pc.ellipse(6, 11, 1.5, 2.5, 0xe0402a); pc.ellipse(11, 10, 1.4, 2.2, 0xe0402a); pc.set(5, 10, 0xff8a6a);
  },
  sparkmoss(pc, rng, f) {
    for (let i = 0; i < 22; i++) pc.set(rng.int(1, 14), rng.int(6, 15), rng.pick([0x2a6ab0, 0x4a9ae0, 0x3a80c8]));
    for (let i = 0; i < 3; i++) pc.set(rng.int(2, 13), rng.int(4, 12), f ? 0xfff07a : 0xbff6ff, GLOW_A);
  },
  bubble(pc, rng, f) {
    pc.line(8, 15, 8, 10, 0x6aa84a);
    const y = f ? 6 : 7;
    for (let a = 0; a < Math.PI * 2; a += 0.3) pc.set(8 + Math.cos(a) * 4, y + Math.sin(a) * 4, 0xd0b8ff, 210);
    pc.set(6, y - 2, 0xffffff); pc.set(7, y - 3, 0xffffff);
  },
  lily(pc) {
    pc.line(8, 15, 8, 9, 0x6aa8a0);
    for (const [dx, dy] of [[-3, -1], [3, -1], [0, -4], [-2, -3], [2, -3]]) pc.line(8, 8, 8 + dx, 8 + dy, 0xd8f0ff, GLOW_A + 40);
    pc.set(8, 7, 0xffffff, GLOW_A);
  },
  gloom(pc) {
    pc.rect(6, 10, 2, 6, 0x8a7a9a); pc.ellipse(7, 9, 4, 2.5, 0x5a3a7a); pc.set(5, 8, 0xb090d0); pc.set(9, 8, 0xb090d0);
    pc.rect(11, 12, 1, 4, 0x8a7a9a); pc.ellipse(11.5, 11.5, 2, 1.4, 0x4a2a6a);
  },
  ashfern(pc) {
    for (let i = 0; i < 5; i++) { const a = -2.3 + i * 0.6; pc.line(8, 15, 8 + Math.cos(a) * 7, 15 + Math.sin(a) * 9, 0x9a948e); }
  },
  ember(pc, rng, f) {
    pc.line(8, 15, 8, 9, 0x3a2a1a);
    pc.disk(8, 7, 3, 0xff7a2a, GLOW_A);
    pc.disk(8, 6.5 - f * 0.5, 1.6, 0xffe066, GLOW_A);
    pc.set(6, 3 - f, 0xffb04a, GLOW_A); pc.set(10, 2 + f, 0xffb04a, GLOW_A);
  },
  frost(pc) {
    pc.line(8, 15, 8, 9, 0x8ab8c8);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) pc.line(8, 7, 8 + Math.cos(a) * 3.5, 7 + Math.sin(a) * 3.5, 0xbff6ff, GLOW_A + 50);
    pc.set(8, 7, 0xffffff);
  },
  lotus(pc, rng, f) {
    pc.rect(3, 13, 10, 2, 0x3a8a5a);
    for (const [dx, dy] of [[-4, -1], [4, -1], [-2, -4], [2, -4], [0, -5]]) pc.ellipse(8 + dx * 0.8, 10 + dy * 0.8, 2, 2.6, f ? 0xff9ad0 : 0xffb0dc, GLOW_A);
    pc.disk(8, 10, 1.4, 0xffe066, GLOW_A);
  },
  web(pc) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) pc.line(8, 8, 8 + Math.cos(a) * 8, 8 + Math.sin(a) * 8, 0xe8f0ff, 160);
    for (let r = 2; r < 8; r += 2.2) for (let a = 0; a < Math.PI * 2; a += 0.15) pc.set(8 + Math.cos(a) * r, 8 + Math.sin(a) * r, 0xe8f0ff, 120);
  },
};

// ---------------------------------------------------------------- creatures (4 frames each)
const CRITTER_DRAW = {
  earthworm(pc, f) {
    const ph = f * 0.8;
    for (let i = 0; i < 9; i++) { const x = 3 + i, y = 10 + Math.round(Math.sin(i * 0.8 + ph) * 1.5); pc.rect(x, y, 1, 2, i % 3 === 0 ? 0xc87878 : 0xe8a0a0); }
    pc.set(12, 9 + Math.round(Math.sin(8 * 0.8 + ph) * 1.5), 0xf0b8b8);
    pc.outline(0x4a1a1a);
  },
  dust_bunny(pc, f) {
    const y = f % 2 ? 1 : 0;
    pc.disk(8, 10 - y, 5, 0xc8bba8);
    for (let a = 0; a < Math.PI * 2; a += 0.5) pc.set(8 + Math.cos(a) * 5.6, 10 - y + Math.sin(a) * 5.6, 0xb8ab98);
    pc.set(6, 9 - y, 0x1a1418); pc.set(10, 9 - y, 0x1a1418); pc.set(6, 8 - y, 0xffffff);
    pc.set(8, 11 - y, 0xf08a9a);
    pc.outline(0x4a4038);
  },
  mole_cricket(pc, f) {
    pc.ellipse(8, 11, 5, 2.4, 0x8a6a4a); pc.ellipse(4, 10, 2.2, 2, 0x6a4a3a); pc.set(3, 9, 0x1a1418);
    for (let i = 0; i < 3; i++) pc.line(6 + i * 3, 13, 5 + i * 3 + (f % 2), 15, 0x5a3a2a);
    pc.line(3, 9, 0, 6 + (f % 2), 0x5a3a2a);
    pc.outline(0x2a1a10);
  },
  cave_bat(pc, f) {
    const flap = f % 2;
    pc.ellipse(8, 8, 2.5, 3, 0x5a4a6a);
    pc.poly(flap ? [[6, 7], [0, 3], [2, 9]] : [[6, 8], [0, 11], [3, 12]], 0x4a3a5a);
    pc.poly(flap ? [[10, 7], [16, 3], [14, 9]] : [[10, 8], [16, 11], [13, 12]], 0x4a3a5a);
    pc.set(7, 7, 0xff5a5a); pc.set(9, 7, 0xff5a5a); pc.set(7, 4, 0x4a3a5a); pc.set(9, 4, 0x4a3a5a);
    pc.outline(0x1a1020);
  },
  rock_crab(pc, f) {
    pc.ellipse(8, 11, 6, 4, 0x8a7a6a);
    pc.ellipse(7, 9.5, 3, 1.5, 0x9a8a7a);
    if (f >= 2) { pc.set(6, 8, 0x1a1418); pc.set(10, 8, 0x1a1418); pc.disk(2.5, 10, 1.6, 0xb08a6a); pc.disk(13.5, 10, 1.6, 0xb08a6a); }
    for (let i = 0; i < 3; i++) { pc.set(4 + i * 3, 15, 0x6a5a4a); }
    pc.outline(0x2a2018);
  },
  ore_slug(pc, f) {
    const s = f % 2;
    pc.ellipse(8 - s * 0.5, 12, 6 + s * 0.5, 2.6, 0x9ad0a0);
    pc.ellipse(7, 10.5, 3.5, 2, 0xc8f0c8);
    pc.set(4, 8, 0x5a8a5a); pc.set(3, 7, 0x1a1418); pc.set(6, 8, 0x5a8a5a); pc.set(6, 7, 0x1a1418);
    pc.set(8, 11, 0xffffff); pc.set(10, 12, 0xd8d8e8);
    pc.outline(0x2a4a2a);
  },
  glow_beetle(pc, f) {
    pc.ellipse(8, 8, 3, 3.5, 0x3a3a5a);
    pc.ellipse(8, 11, 2.6, 2.2, 0xc8ff7a, GLOW_A);
    pc.line(6, 5, 4, 2, 0x2a2a3a); pc.line(10, 5, 12, 2, 0x2a2a3a);
    if (f % 2) { pc.ellipse(4, 7, 2.5, 1.4, 0xd8e0ff, 150); pc.ellipse(12, 7, 2.5, 1.4, 0xd8e0ff, 150); }
    pc.outline(0x101020);
  },
  spark_mite(pc, f) {
    pc.disk(8, 9, 2, 0x7fe7ff, GLOW_A);
    pc.set(7, 8, 0xffffff, GLOW_A);
    for (let i = 0; i < 4; i++) { const a = f * 0.8 + i * 1.57; pc.set(8 + Math.cos(a) * 4, 9 + Math.sin(a) * 4, 0xfff8a0, GLOW_A); }
  },
  crystal_spider(pc, f) {
    pc.ellipse(8, 9, 2.6, 2.2, 0xbfe6ff);
    pc.ellipse(8, 12, 3, 2.4, 0x8ac8f0);
    for (let i = 0; i < 4; i++) { const y = 8 + i; const k = (f + i) % 2; pc.line(5, y, 1, y - 2 + k * 2 + i, 0x6a9ac8); pc.line(11, y, 15, y - 2 + k * 2 + i, 0x6a9ac8); }
    pc.set(7, 8, 0xff5a8a); pc.set(9, 8, 0xff5a8a);
    pc.line(8, 0, 8, 6, 0xe8f0ff);
    pc.outline(0x1a2a4a);
  },
  blind_fish(pc, f) {
    const w = f % 2;
    pc.ellipse(8, 8, 5, 2.6, 0xf0d8d8);
    pc.poly([[3, 8], [0, 5 + w], [0, 11 - w]], 0xe0c0c0);
    pc.set(11, 7, 0xd8b0b0); pc.set(12, 8, 0xc89a9a);
    pc.line(6, 6, 9, 5, 0xffffff);
    pc.outline(0x5a3a3a);
  },
  lava_newt(pc, f) {
    pc.ellipse(8, 11, 5, 2, 0xff6a2a);
    pc.ellipse(13, 10, 2, 1.6, 0xff8a3a);
    pc.line(3, 11, 0, 9 + (f % 2) * 2, 0xd9481a);
    pc.set(14, 9, 0x1a1418);
    pc.set(6, 13, 0xd9481a); pc.set(10, 13, 0xd9481a);
    for (let i = 0; i < 3; i++) pc.set(5 + i * 3, 10, 0xffd27a, GLOW_A);
    pc.outline(0x3a0a00);
  },
  ember_moth(pc, f) {
    const flap = f % 2;
    pc.ellipse(8, 8, 1.4, 3, 0x6a3a1a);
    pc.ellipse(4.5, 7 - flap, 3, flap ? 3.5 : 2, 0xffa84a, GLOW_A + 30);
    pc.ellipse(11.5, 7 - flap, 3, flap ? 3.5 : 2, 0xffa84a, GLOW_A + 30);
    pc.set(4, 7, 0xffe066, GLOW_A); pc.set(12, 7, 0xffe066, GLOW_A);
  },
  frost_shrimp(pc, f) {
    for (let i = 0; i < 6; i++) pc.disk(4 + i * 1.6, 9 + Math.sin(i * 0.6 + f) * 1, 1.8 - i * 0.1, i % 2 ? 0xff9a8a : 0xffb4a8);
    pc.line(3, 8, 0, 5 + (f % 2), 0xff9a8a); pc.set(3, 8, 0x1a1418);
    pc.set(6, 7, 0xffffff);
    pc.outline(0x5a2a2a);
  },
  gem_tortoise(pc, f) {
    pc.ellipse(8, 10, 6, 4, 0x6a8a5a);
    pc.ellipse(8, 9, 4, 2.5, 0x8aa86a);
    pc.disk(8, 8, 1.6, 0xe02a3a, GLOW_A + 50); pc.set(7, 7, 0xffffff);
    pc.ellipse(14, 11, 2, 1.6, 0xa0b880); pc.set(15, 10, 0x1a1418);
    pc.rect(4 + (f % 2), 13, 2, 2, 0xa0b880); pc.rect(10 - (f % 2), 13, 2, 2, 0xa0b880);
    pc.outline(0x1a2a10);
  },
  void_wisp(pc, f) {
    pc.disk(8, 7, 3.5, 0x9a6ad9, GLOW_A);
    pc.disk(8, 7, 2, 0xe0c8ff, GLOW_A);
    for (let i = 0; i < 4; i++) pc.set(6 + i, 11 + ((i + f) % 3), 0x6a3ab0, GLOW_A + 40);
    pc.set(7, 6, 0x1a0a2a); pc.set(9, 6, 0x1a0a2a);
  },
};

const MISC_DRAW = {
  beam(pc) {
    pc.rect(6, 0, 4, 16, 0x8a5a32); pc.rect(6, 0, 1, 16, 0xa87040); pc.rect(9, 0, 1, 16, 0x6a4424);
    pc.rect(2, 0, 12, 3, 0x9a6a3a); pc.rect(2, 0, 12, 1, 0xb88050); pc.set(4, 1, 0x3a3a40); pc.set(11, 1, 0x3a3a40);
    pc.outline(0x2a1a10);
  },
  stake(pc) {
    pc.rect(7, 6, 2, 10, 0x8a5a32); pc.rect(7, 6, 1, 10, 0xa87040);
    pc.disk(8, 4, 2.6, 0x7bf08a, GLOW_A); pc.set(7, 3, 0xffffff, GLOW_A);
    pc.outline(0x1a2a10);
  },
  bell(pc) {
    pc.rect(3, 0, 10, 2, 0x6a4424); pc.rect(7, 2, 2, 2, 0x3a3a40);
    pc.poly([[4, 13], [5, 6], [8, 4], [11, 6], [12, 13]], 0xe0b040); pc.rect(4, 12, 9, 2, 0xc89a30); pc.set(6, 7, 0xfff0a0); pc.disk(8, 14.5, 1.2, 0x8a6a20);
    pc.outline(0x2a1a08);
  },
  sign(pc) {
    pc.rect(2, 3, 12, 8, 0x9a6a3a); pc.rect(2, 3, 12, 1, 0xb88050); pc.rect(7, 11, 2, 5, 0x6a4424);
    pc.line(5, 6, 8, 9, 0xf0e0c0); pc.line(8, 9, 11, 6, 0xf0e0c0); pc.line(8, 4, 8, 9, 0xf0e0c0);
    pc.outline(0x2a1a10);
  },
  spark(pc) { pc.rect(7, 7, 2, 2, 0xffffff, GLOW_A); },
  glint(pc) { pc.set(8, 4, 0xffffff, GLOW_A); pc.set(8, 12, 0xffffff, GLOW_A); pc.set(4, 8, 0xffffff, GLOW_A); pc.set(12, 8, 0xffffff, GLOW_A); pc.rect(7, 7, 2, 2, 0xffffff, GLOW_A); pc.set(8, 6, 0xfffbe0, GLOW_A); pc.set(8, 9, 0xfffbe0, GLOW_A); pc.set(6, 8, 0xfffbe0, GLOW_A); pc.set(9, 8, 0xfffbe0, GLOW_A); },
  fire0(pc) { flame(pc, 0); },
  fire1(pc) { flame(pc, 1); },
  fire2(pc) { flame(pc, 2); },
  lift(pc) {
    pc.rect(1, 2, 14, 14, 0x3a2a1a); pc.rect(1, 2, 14, 1, 0xc89a40); pc.rect(1, 15, 14, 1, 0xc89a40);
    for (let x = 2; x < 15; x += 3) pc.rect(x, 3, 1, 12, 0xd8aa50);
    pc.rect(7, 0, 2, 2, 0x5a5a60);
  },
};
function flame(pc, f) {
  const rng = makeRng(77 + f);
  for (let y = 4; y < 16; y++) {
    const w = (16 - y) * 0.32 + rng.range(-0.5, 0.5);
    for (let x = Math.round(8 - w); x <= Math.round(8 + w); x++) {
      const t = (y - 4) / 12;
      const c = t < 0.35 ? 0xfff0a0 : t < 0.7 ? 0xffa030 : 0xe04a1a;
      pc.set(x + Math.round(Math.sin(y * 0.8 + f * 2) * 0.8), 19 - y - 4, c, GLOW_A);
    }
  }
}

export { GLOW_A, ORE_STYLE };

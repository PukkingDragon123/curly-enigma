// In-rock look of ore deposits: small pixel-art patterns (palette indices) that the
// generator stamps into the rock. Each ore family has its own natural habit.
import { ITEMS } from '../data/items.js';
import { makeRng, hashStr, mixHex, shade } from '../core/util.js';

const TARNISH = { copper_ore: 0x3f9a6a, iron_ore: 0xb0582a, silver_ore: 0x3a3a48, tin_ore: 0x6a7070, moonsilver_ore: 0x5a5e8a, gold_ore: 0x7a5a2a };

function paletteFor(item) {
  const it = ITEMS[item];
  const ic = it?.icon || {};
  const cols = ic.ore || ic.c || [0xaaaaaa, 0xffffff, 0x555555];
  const [mid, hi, lo] = cols;
  const pal = [0, shade(lo, 0.75), lo, mid, mixHex(mid, hi, 0.5), hi, 0xffffff, TARNISH[item] ?? mixHex(lo, 0x3a3030, 0.4), mixHex(TARNISH[item] ?? lo, 0x000000, 0.3), 0x1a1418, mixHex(mid, hi, 0.25), shade(mid, 1.25), mixHex(hi, 0xffffff, 0.6)];
  if (item === 'coal') pal.splice(1, 6, 0x0e0c10, 0x1a181e, 0x2a2830, 0x4a4856, 0x8a8aa0, 0xd8d8f0);
  if (item === 'fossil') pal.splice(1, 6, 0x8a7a5a, 0xb8a47a, 0xe0d0a8, 0xf0e4c4, 0xfff8e8, 0xffffff);
  if (item === 'truffle') pal.splice(1, 6, 0x1e1410, 0x2e2018, 0x4a3426, 0x6a4c36, 0x8a6a4a, 0xb08a60);
  const glow = new Array(16).fill(0);
  if (it?.glow || ic.glow || ic.zap || ic.star) { glow[4] = 0.55; glow[5] = 0.85; glow[6] = 1; glow[11] = 0.6; glow[12] = 1; }
  return { pal, glow };
}

function habit(item) {
  const ic = ITEMS[item]?.icon || {};
  if (item === 'coal') return 'seam';
  if (item === 'fossil') return 'fossil';
  if (item === 'truffle') return 'lump';
  if (ic.k === 'ore') return 'nuggets';
  if (ic.k === 'gem') return 'gem';
  return 'crystals';
}

/** { w, h, pal, glow, idx } for one deposit of `item` (seeded shape). */
export function oreBlob(item, seed) {
  const rng = makeRng((hashStr(item) ^ (seed * 2654435761)) >>> 0);
  const { pal, glow } = paletteFor(item);
  const kind = habit(item);
  const S = kind === 'fossil' ? 28 : kind === 'seam' ? 30 : kind === 'gem' ? 16 : kind === 'lump' ? 13 : 24;
  const w = S, h = kind === 'seam' ? 12 : S;
  const idx = new Uint8Array(w * h);
  const set = (x, y, v) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) idx[y * w + x] = v; };
  const get = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? idx[y * w + x] : 0);
  const blob = (cx, cy, rx, ry, lightDir = 1) => {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const l = -(dx + dy) * 0.7 * lightDir;
        set(x, y, d > 0.7 ? (l > 0.2 ? 3 : 2) : l > 0.45 ? 5 : l > 0.05 ? 4 : 3);
      }
  };
  if (kind === 'nuggets') {
    const n = rng.int(4, 7);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, r = rng() * 7;
      blob(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r * 0.8, rng.range(1.8, 3.6), rng.range(1.6, 3.2));
    }
    for (let k = 0; k < 6; k++) set(rng.int(5, w - 6), rng.int(5, h - 6), 6);
    // tarnish halo hugging the nuggets
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (get(x, y)) continue;
      const near = get(x - 1, y) > 1 || get(x + 1, y) > 1 || get(x, y - 1) > 1 || get(x, y + 1) > 1;
      if (near && rng() < 0.55) idx[y * w + x] = rng() < 0.7 ? 7 : 8;
    }
    if (item === 'starmetal_ore') for (let k = 0; k < 5; k++) { const x = rng.int(4, w - 5), y = rng.int(4, h - 5); set(x, y, 12); set(x + 1, y, 11); set(x - 1, y, 11); set(x, y + 1, 11); set(x, y - 1, 11); }
  } else if (kind === 'crystals') {
    const bx = w / 2 + rng.range(-2, 2), by = h * 0.72;
    const n = rng.int(3, 6);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + rng.range(-1.0, 1.0);
      const len = rng.range(7, 12), wid = rng.range(1.6, 2.8);
      const ux = Math.cos(a), uy = Math.sin(a);
      for (let t = 0; t <= len; t += 0.5) {
        const taper = t > len - 3 ? (len - t) / 3 : 1;
        const half = wid * taper;
        for (let s = -half; s <= half; s += 0.5) {
          const x = bx + ux * t - uy * s, y = by + uy * t + ux * s;
          const v = t > len - 1.5 ? 6 : s < -half * 0.3 ? 5 : s > half * 0.35 ? 2 : 4;
          set(x, y, v);
        }
      }
      set(bx + ux * len, by + uy * len, 12);
    }
    // a little matrix at the base
    for (let k = 0; k < 7; k++) set(bx + rng.range(-4, 4), by + rng.range(0, 3), rng() < 0.5 ? 9 : 1);
  } else if (kind === 'gem') {
    const cx = w / 2, cy = h / 2, r = rng.range(4.5, 5.8);
    const cut = ITEMS[item]?.icon?.cut || 'oval';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      let inside;
      if (cut === 'square') inside = Math.abs(dx) < r * 0.8 && Math.abs(dy) < r * 0.8 && Math.abs(dx) + Math.abs(dy) < r * 1.35;
      else if (cut === 'brilliant') inside = Math.abs(dx) + Math.abs(dy) * 1.2 < r * 1.05;
      else if (cut === 'blob') inside = (dx * dx) / (r * r) + (dy * dy) / (r * r * 0.7) < 1 + Math.sin(Math.atan2(dy, dx) * 3 + seed) * 0.12;
      else inside = (dx * dx) / (r * r) + (dy * dy) / (r * r * 0.72) < 1;
      if (!inside) continue;
      const f = (dx * 0.6 + dy) / r;
      let v = f < -0.5 ? 5 : f < -0.1 ? 4 : f < 0.4 ? 3 : 2;
      if ((Math.floor(dx + 50) + Math.floor(dy + 50)) % 4 === 0 && v > 2) v -= 1;
      idx[y * w + x] = v;
    }
    set(cx - r * 0.4, cy - r * 0.45, 6);
    set(cx - r * 0.3, cy - r * 0.5, 6);
    if (ITEMS[item]?.icon?.bug) { set(cx, cy, 9); set(cx + 1, cy, 9); set(cx, cy + 1, 9); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!idx[y * w + x] && (get(x - 1, y) > 1 || get(x + 1, y) > 1 || get(x, y + 1) > 1) && rng() < 0.6) idx[y * w + x] = 1;
  } else if (kind === 'seam') {
    for (let x = 0; x < w; x++) {
      const t = x / (w - 1);
      const th = Math.sin(t * Math.PI) * (h * 0.42) * (0.8 + 0.2 * Math.sin(x * 0.9 + seed));
      const cy = h / 2 + Math.sin(t * 3 + seed) * 1.2;
      for (let y = Math.floor(cy - th); y <= cy + th; y++) set(x, y, y < cy - th + 1.2 ? 4 : (x * 7 + y * 3) % 11 === 0 ? 6 : y > cy + th - 1.2 ? 1 : 2 + ((x + y) & 1));
    }
  } else if (kind === 'fossil') {
    const cx = w / 2, cy = h / 2;
    if (rng() < 0.5) {
      // ammonite spiral
      for (let t = 0; t < 22; t += 0.08) {
        const r = 1.2 + t * 0.52;
        const x = cx + Math.cos(t) * r, y = cy + Math.sin(t) * r * 0.9;
        set(x, y, 3 + ((t * 3) % 2 > 1 ? 1 : 0));
        set(x + 0.6, y, 2);
      }
      for (let t = 2; t < 22; t += 1.6) set(cx + Math.cos(t) * (1.2 + t * 0.52) * 0.8, cy + Math.sin(t) * (1.2 + t * 0.52) * 0.72, 5);
    } else {
      // little skeleton: spine, ribs, skull
      for (let x = 4; x < w - 6; x++) set(x, cy + Math.sin(x * 0.4) * 0.8, 4);
      for (let x = 7; x < w - 9; x += 3) for (let k = 1; k < 5; k++) { set(x + k * 0.3, cy - k, 3); set(x + k * 0.3, cy + k, 3); }
      blob(w - 5, cy - 1, 3.2, 2.6);
      set(w - 4, cy - 2, 9);
      for (let x = 1; x < 4; x++) set(x, cy + (x - 2) * 0.5, 2);
    }
  } else {
    blob(w / 2, h / 2, 4.6, 3.8);
    for (let k = 0; k < 6; k++) blob(w / 2 + rng.range(-4, 4), h / 2 + rng.range(-3, 3), 1.5, 1.4);
    for (let k = 0; k < 4; k++) set(rng.int(3, w - 4), rng.int(3, h - 4), 6);
  }
  return { w, h, pal, glow, idx };
}

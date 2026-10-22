// Voxel models (1/16 m) for the new harvestable cave plants, added to the mine's prop builders
// (src/deep/props/models.js BUILD) when Props.js loads: berry bushes, thyme tufts, tuber tops,
// cave garlic, glow moss, truffle mounds, grub loam and dino nests. Same contract as the other
// builders: (r, v, p) → { grid, pivot, sway?, light?, emit?, main }.
import { BUILD } from '../deep/props/models.js';
import { PGrid, hv, shade, mixc } from '../deep/props/grid.js';

const SOIL = [0x5a3c28, 0x4c3422, 0x6a4a30];
const soilC = (x, y, z) => SOIL[Math.floor(hv(x, y, z, 5) * 3)];

function mound(g, cx, cz, rx, ry, rz) {
  g.ell(cx, 0, cz, rx, ry, rz, (x, y, z) => (y >= ry - 1 && hv(x, y, z, 9) < 0.3 ? 0x7a5a3a : soilC(x, y, z)));
}

export const PLANT_BUILD = {
  cave_berry(r, v) {
    const g = new PGrid(18, 14, 18);
    // twiggy stems + leafy clumps + clusters of red berries (and a few green ones)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.5, R = r.range(3, 6), H = r.range(6, 10);
      g.line(9, 0, 9, 9 + Math.cos(a) * R, H, 9 + Math.sin(a) * R, 0x5a3a1c);
    }
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = r.range(1, 7), y = r.range(4, 11);
      const x = 9 + Math.cos(a) * d, z = 9 + Math.sin(a) * d;
      g.ell(x, y, z, 1.3, 0.9, 1.3, hv(x, y, z, 3) < 0.4 ? 0x4e8a3a : 0x3e7230);
    }
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2, d = r.range(3, 7.5), y = r.range(4, 10);
      const ripe = i < 9;
      const x = 9 + Math.cos(a) * d, z = 9 + Math.sin(a) * d;
      g.set(x, y, z, ripe ? (i % 3 ? 0xd02a40 : 0xa81830) : 0x9ac85a, ripe ? 1 : 0);
      if (ripe && i % 2) g.set(x, y - 1, z, 0xc02238, 1);
    }
    return { grid: g, pivot: [9, 0.5, 9], sway: 'up', main: [0.8, 0.2, 0.25] };
  },
  stone_thyme(r, v) {
    const g = new PGrid(12, 8, 12);
    g.ell(6, 0, 6, 3, 1, 3, 0x6a5a48);
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, d = r.range(0, 3.6), h = r.int(3, 7);
      const x = 6 + Math.cos(a) * d, z = 6 + Math.sin(a) * d;
      for (let y = 1; y <= h; y++) g.set(x + (y > 3 ? Math.cos(a) * 0.6 : 0), y, z + (y > 3 ? Math.sin(a) * 0.6 : 0), y === h ? 0xa8c088 : (y & 1 ? 0x86a06a : 0x6a8a52));
      if (h > 4) g.set(x, h - 1, z, 0xb8a0d0); // tiny lilac flowers
    }
    return { grid: g, pivot: [6, 0.5, 6], sway: 'up', main: [0.5, 0.62, 0.42] };
  },
  tunnel_tuber(r, v) {
    const g = new PGrid(16, 12, 16);
    mound(g, 8, 8, 5, 2, 5);
    // the knobbly top of the tuber peeking out of the soil
    g.ell(8.5, 1.5, 7.5, 2.4, 1.6, 2.2, (x, y, z) => (hv(x, y, z, 7) < 0.15 ? 0x7a5a38 : 0xb08a5a));
    // broad blade leaves
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r() * 0.6, L = r.range(5, 8), H = r.range(7, 11);
      g.line(8, 2, 8, 8 + Math.cos(a) * L * 0.6, H, 8 + Math.sin(a) * L * 0.6, (t) => (t > 0.8 ? 0x6ab84a : 0x4a8a3a), 0, 0.6);
    }
    return { grid: g, pivot: [8, 0.5, 8], sway: 'up', main: [0.6, 0.48, 0.32] };
  },
  cave_garlic(r, v) {
    const g = new PGrid(14, 13, 14);
    mound(g, 7, 7, 4, 1.5, 4);
    const n = v ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const x = 7 + (k - (n - 1) / 2) * 3.2, z = 7 + (k % 2) * 1.5;
      g.ell(x, 2, z, 1.8, 1.6, 1.8, (xx, y, zz) => (hv(xx, y, zz, 11) < 0.2 ? 0xd8c8d8 : 0xf0e8d8));
      for (let j = 0; j < 3; j++) g.line(x, 3, z, x + (j - 1) * 1.2, r.range(8, 12), z + (r() - 0.5) * 2, (t) => (t > 0.85 ? 0xa8d080 : 0x7aa85a));
    }
    return { grid: g, pivot: [7, 0.5, 7], sway: 'up', main: [0.92, 0.9, 0.85] };
  },
  glow_moss(r, v) {
    const g = new PGrid(16, 13, 5);
    for (let y = 0; y < 13; y++) for (let x = 0; x < 16; x++) {
      const d = ((x - 8) / 7.4) ** 2 + ((y - 6.5) / 5.6) ** 2;
      if (d > 1 || hv(x, y, v, 211) < d * 0.3) continue;
      const tip = hv(x, y, 213) < 0.1;
      g.set(x, y, 2, tip ? 0xb8ffb0 : hv(x >> 1, y >> 1, 212) < 0.5 ? 0x3a8a3a : 0x5ab84a, tip ? 3 : 1);
      g.set(x, y, 1, 0x2a4a22, 1); g.set(x, y, 0, 0x2a4a22);
      if (hv(x, y, 214) < 0.35 && d < 0.7) g.set(x, y, 3, 0x7ad86a, 2);
    }
    return { grid: g, pivot: [8, 6.5, 2], light: { c: [0.35, 0.9, 0.35], r: 2.2, at: [0, 0, 0.15] }, emit: { k: 'firefly', c: [0.6, 1, 0.55], at: [0, 0, 0.12], spread: 0.3 }, main: [0.35, 0.7, 0.3] };
  },
  truffle(r, v) {
    const g = new PGrid(12, 6, 12);
    mound(g, 6, 6, 4.2, 2.2, 4.2);
    // a dark knob breaking the surface and a few rootlets
    g.ell(6.5, 1.8, 5.5, 1.6, 1.2, 1.4, (x, y, z) => (hv(x, y, z, 21) < 0.3 ? 0x6a5048 : 0x3a2a24));
    for (let i = 0; i < 4; i++) g.line(6, 2, 6, 6 + (r() - 0.5) * 8, 1, 6 + (r() - 0.5) * 8, 0x3a2616);
    return { grid: g, pivot: [6, 0.5, 6], emit: { k: 'mote', c: [0.95, 0.85, 0.55], at: [0, 0.25, 0], spread: 0.12 }, main: [0.25, 0.18, 0.15] };
  },
  grub(r, v) {
    const g = new PGrid(12, 6, 12);
    mound(g, 6, 6, 4.4, 2, 4.4);
    // a pale grub half out of the loam, and a couple of holes
    for (let k = 0; k < 4; k++) g.set(5 + k, 2 + (k === 1 || k === 2 ? 1 : 0), 6, k === 3 ? 0xc8782a : (k & 1 ? 0xe0d0b0 : 0xf0e0c0));
    g.set(3, 2, 8, 0x1e140c); g.set(8, 2, 4, 0x1e140c);
    return { grid: g, pivot: [6, 0.5, 6], main: [0.45, 0.32, 0.22] };
  },
  dino_egg(r, v) {
    const g = new PGrid(20, 16, 20);
    // a big ring nest of twigs and ferns
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, R = r.range(5, 8.5), y = r.range(0, 3);
      const x = 10 + Math.cos(a) * R, z = 10 + Math.sin(a) * R;
      g.line(x, y, z, x + Math.cos(a + 1.6) * 2.5, y + r.range(0, 1), z + Math.sin(a + 1.6) * 2.5, hv(x, y, z, 31) < 0.5 ? 0x8a6a3a : 0x6a4a2a);
    }
    g.ell(10, 0, 10, 6, 1, 6, 0x5a4028);
    // the egg, speckled
    g.ell(10, 7, 10, 4.2, 6, 4.2, (x, y, z) => (hv(x, y, z, 33) < 0.1 ? 0x6a8a4a : hv(x, y, z, 34) < 0.06 ? 0x8a6a3a : y > 9 ? 0xeef2e0 : 0xd8e0c0));
    if (v) g.ell(14, 4, 7, 2.6, 3.6, 2.6, (x, y, z) => (hv(x, y, z, 35) < 0.1 ? 0x6a8a4a : 0xd8e0c0));
    return { grid: g, pivot: [10, 0.5, 10], main: [0.85, 0.88, 0.75] };
  },
};

Object.assign(BUILD, PLANT_BUILD);
export { shade, mixc };

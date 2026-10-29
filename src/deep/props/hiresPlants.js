// The commonest forage plants at 1/32 m (registered over the old 1/16 m builders by ./models.js):
// glowcaps, cave carrots, blind and ash ferns, gloomshrooms, pepperroots, emberblooms, frostblooms,
// crystal lilies and bubblebulbs. Same sizes, lights and particles as before, twice the detail.
// Contract as in ./models.js: (r, v, p) → { grid, pivot, scale, sway?, light?, emit?, main, ao? }.
import { PGrid, hv, shade } from './grid.js';

const S = 1 / 32;
const t = (R, k) => R[Math.max(0, Math.min(R.length - 1, Math.round(k)))];
const LEAF = [0x10301a, 0x184624, 0x225e2c, 0x2e7a36, 0x429a42, 0x62b852, 0x92d46c];
const SOIL = [0x24170e, 0x332214, 0x44301c, 0x563e26, 0x6a4e30];

/** A little mound of loose soil the plant comes out of. */
function mound(g, cx, cz, rx, ry) {
  g.ell(cx, 0, cz, rx, ry, rx, (x, y, z, dx, dy) => t(SOIL, 2.2 + dy * 1.2 - dx * 0.5 + (hv(x >> 1, y, z >> 1, 3) - 0.5) * 1.4));
}
/** A tapered stalk from (x0, y0, z0) to (x1, y1, z1); col(t) → colour. */
function stalk(g, x0, y0, z0, x1, y1, z1, w0, w1, col) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 2) + 1;
  for (let i = 0; i <= n; i++) {
    const k = i / n, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k, z = z0 + (z1 - z0) * k;
    const w = w0 + (w1 - w0) * k;
    if (w <= 0.6) { g.set(x, y, z, col(k)); continue; }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx * dx + dz * dz <= w * w * 0.6) g.set(x + dx, y, z + dz, col(k));
  }
}
/** A flat leaf blade from (x, y, z) heading (a, rising), length L, width W (voxels). */
function blade(g, x, y, z, a, rise, L, W, R, base = 2.4) {
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let u = 0; u <= L; u += 0.5) {
    const k = u / L, half = (W / 2) * Math.sin(Math.PI * Math.pow(k, 0.7));
    const px = x + ca * u, pz = z + sa * u, py = y + rise * u - k * k * L * 0.35;
    for (let v = -half; v <= half; v += 0.5) {
      const c = Math.abs(v) < 0.5 ? t(R, base - 0.8 + k) : t(R, base + k * 1.5 + (v > 0 ? 0.6 : -0.4));
      g.set(px - sa * v, py, pz + ca * v, c);
    }
  }
}
/** A domed (or umbrella) mushroom cap over (cx, y, cz), radius R, with gills, rim and spots. */
function cap(g, cx, y, cz, R, H, ramp, gill, o = {}) {
  for (let yy = 0; yy <= Math.ceil(H); yy++) {
    const h = yy / H, rr = R * Math.sqrt(Math.max(0, 1 - h * h)) * (yy === 0 ? 1.05 : 1);
    for (let z = Math.floor(cz - rr); z <= Math.ceil(cz + rr); z++) for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d > rr) continue;
      if (yy === 0 && d < rr - 1.2) { g.set(x, y, z, (Math.floor(Math.atan2(z - cz, x - cx) * 4) & 1) ? gill : shade(gill, 1.35), 1); continue; }
      const lit = ((cx - x) * 0.6 + (cz - z) * 0.3) / R;
      let k = 2.4 + h * 1.6 + lit * 1.2, gl = o.glow ?? 2;
      if (yy === 0) { k = 4.2; gl = Math.min(3, gl + 1); }
      if (o.spots && h > 0.2 && hv(x, y + yy, z, 13) < o.spots) { k = 6; gl = 3; }
      g.set(x, y + yy, z, t(ramp, k), gl);
    }
  }
}

export const HIRES_PLANTS = {
  glowcap(r, v) {
    const g = new PGrid(28, 26, 28);
    const BL = [0x0c1e44, 0x14306a, 0x1e4a94, 0x2c68c0, 0x4a8ee6, 0x86bcff, 0xd2e8ff];
    const ST = [0x8c9ca8, 0xaab8c4, 0xc6d4de, 0xe0eaf0];
    mound(g, 14, 14, 7, 1.6);
    stalk(g, 14, 0, 14, 14.5, 13, 14, 2.6, 2, (k) => t(ST, 1 + k * 2));
    for (let a = 0; a < 6.28; a += 0.5) g.set(14.5 + Math.cos(a) * 2.6, 9, 14 + Math.sin(a) * 2.6, t(ST, 3));
    cap(g, 14.5, 13, 14, 9.5, 6.5, BL, 0x12244a, { spots: 0.14 });
    // a baby beside it
    const bx = v ? 22 : 6, bz = v ? 8 : 20;
    stalk(g, bx, 0, bz, bx, 4, bz, 1, 1, () => t(ST, 2));
    cap(g, bx, 4, bz, 3.4, 2.4, BL, 0x12244a, { spots: 0.1 });
    return { grid: g, pivot: [14, 0.5, 14], scale: S, light: { c: [0.2, 0.5, 1.0], r: 2.6, at: [0, 0.45, 0] }, emit: { k: 'firefly', c: [0.38, 0.72, 1], at: [0, 0.55, 0] }, main: [0.25, 0.5, 1] };
  },
  cave_carrot(r, v) {
    const g = new PGrid(30, 36, 30);
    const OR = [0x6a2a08, 0x9a420e, 0xc85e18, 0xe87a26, 0xf89a3e, 0xffc070];
    mound(g, 15, 15, 8, 2.4);
    // the shoulder of the root shows above the soil, ringed with fine lines
    g.ell(15, 0, 15, 4.6, 4.4, 4.6, (x, y, z, dx, dy) => (dy < 0 ? -1 : t(OR, 2.6 - dx * 1.2 + dy * 0.8 + ((y % 3) === 1 ? -1 : 0))));
    // feathery tops
    const n = r.int(5, 7);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.5, R = r.range(6, 11), H = r.range(20, 30);
      const ex = 15 + Math.cos(a) * R, ez = 15 + Math.sin(a) * R;
      stalk(g, 15, 4, 15, ex, H - 7, ez, 1, 0.5, (k) => t(LEAF, 2 + k * 2));
      for (let k = 0.35; k < 1; k += 0.11) {
        const x = 15 + (ex - 15) * k, y = 4 + (H - 11) * k, z = 15 + (ez - 15) * k;
        for (const s of [-1, 1]) for (let q = 1; q <= 3 - k * 2; q++) g.set(x - Math.sin(a) * q * s, y + q * 0.4, z + Math.cos(a) * q * s, t(LEAF, 3 + k * 2 + (s > 0 ? 0.5 : -0.4)));
      }
    }
    return { grid: g, pivot: [15, 0.5, 15], scale: S, sway: 'up', main: [0.95, 0.55, 0.2] };
  },
  blindfern(r, v, p) {
    const ash = p === 'ash';
    const R = ash ? [0x1e1c1a, 0x2e2c2a, 0x44423e, 0x5e5c58, 0x7e7c76, 0xa29e96, 0xccc6ba] : [0x2a3a26, 0x3e5236, 0x587048, 0x768e60, 0x98ae80, 0xbcd0a2, 0xe2f0cc];
    const g = new PGrid(42, 26, 42);
    g.ell(21, 0.5, 21, 3, 2, 3, ash ? 0x2a2826 : 0x34442c);
    const n = r.int(6, 8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.4, L = r.range(14, 18), H = r.range(14, 21);
      const ca = Math.cos(a), sa = Math.sin(a);
      let px = 21, py = 1, pz = 21;
      const steps = Math.round(L * 1.6);
      for (let k = 1; k <= steps; k++) {
        const tt = k / steps, d = tt * L;
        const y = 1 + H * Math.sin(Math.min(1, tt * 1.15) * Math.PI * 0.62) - Math.max(0, tt - 0.7) * 11;
        const x = 21 + ca * d, z = 21 + sa * d;
        stalk(g, px, py, pz, x, y, z, 0.5, 0.5, () => t(R, 2 + tt * 2));
        if (tt > 0.15 && tt < 0.95 && k % 2 === 0) {
          const len = Math.max(1, Math.round((1 - tt) * 6 + 1));
          for (const s of [-1, 1]) for (let q = 1; q <= len; q++) g.set(x - sa * q * s, y - q * 0.25, z + ca * q * s, t(R, 3 + tt * 2 + (q === len ? 1 : 0) - (s > 0 ? 0.6 : 0)));
        }
        px = x; py = y; pz = z;
      }
    }
    return { grid: g, pivot: [21, 0.5, 21], scale: S, sway: 'up', ao: false, main: ash ? [0.5, 0.5, 0.48] : [0.8, 0.88, 0.75] };
  },
  gloomshroom(r, v) {
    const g = new PGrid(30, 28, 30);
    const PU = [0x1a0a2a, 0x2a1240, 0x3e1c5c, 0x562878, 0x7440a0, 0xa070cc, 0xd0aaf0];
    const STM = [0x2e2238, 0x403250, 0x584868];
    const caps = v ? 1 : 2;
    g.ell(15, 0, 15, 8, 1.3, 8, (x, y, z) => (hv(x >> 1, 0, z >> 1, 4) < 0.5 ? 0x24182e : 0x30223c));
    for (let i = 0; i < caps; i++) {
      const x = i ? 21 : 13, z = i ? 19 : 13, sh = i ? 10 : 16, R = i ? 5 : 7.5;
      stalk(g, x, 0, z, x + 1, sh, z, 1.6, 1.2, (k) => t(STM, 0.5 + k * 1.5));
      // an umbrella: a flat dome with a drooping frilled skirt
      cap(g, x + 1, sh, z, R, R * 0.5, PU, 0x1a0c26, { glow: 1, spots: 0.1 });
      for (let a = 0; a < 6.28; a += 0.22) g.set(x + 1 + Math.cos(a) * R, sh - 1 - ((a * 3) | 0) % 2, z + Math.sin(a) * R, t(PU, 4), 2);
    }
    return { grid: g, pivot: [15, 0.5, 15], scale: S, ao: false, light: { c: [0.45, 0.22, 0.7], r: 1.8, at: [0, 0.4, 0] }, emit: { k: 'spore', c: [0.6, 0.45, 0.85], at: [0, 0.5, 0] }, main: [0.4, 0.2, 0.55] };
  },
  pepperroot(r, v) {
    const g = new PGrid(30, 28, 30);
    const RED = [0x4a0a06, 0x7a140a, 0xa8200e, 0xd0341a, 0xf05a3a, 0xff9a80];
    mound(g, 15, 15, 7, 2);
    g.ell(15, 3, 15, 3.6, 4.4, 3.6, (x, y, z, dx, dy) => (dy < -0.3 ? -1 : t(RED, 2.4 - dx + dy)));
    stalk(g, 15, 6, 15, 15, 18, 15, 1.2, 0.8, (k) => t(LEAF, 2 + k));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + r() * 0.5, y = r.range(11, 18);
      blade(g, 15, y, 15, a, 0.35, r.range(8, 11), r.range(4, 5.5), LEAF, 2.6);
      if (i < 3) {
        // a pepper hanging under the leaf
        const px = 15 + Math.cos(a) * 6, pz = 15 + Math.sin(a) * 6;
        g.set(px, y + 1, pz, t(LEAF, 2)); g.set(px, y, pz, t(LEAF, 1.5));
        g.ell(px, y - 4, pz, 1.6, 3.4, 1.6, (x, yy, z, dx, dy) => t(RED, 3 - dx * 1.2 + dy * 0.6 + (dx < -0.3 && dy > 0 ? 1.4 : 0)), 0);
      }
    }
    return { grid: g, pivot: [15, 2.5, 15], scale: S, sway: 'up', main: [0.9, 0.2, 0.1] };
  },
  emberbloom(r, v) {
    const g = new PGrid(24, 30, 24);
    const EM = [0x5a1404, 0x8a2208, 0xc03e0c, 0xf06818, 0xffa030, 0xffd060, 0xfff2b0];
    const AS = [0x161210, 0x241c18, 0x342824, 0x46382e];
    stalk(g, 12, 0, 12, 12.5, 15, 12, 1.4, 1, (k) => t(AS, 1 + k * 2));
    blade(g, 12, 5, 12, 0.3, 0.3, 7, 3, AS, 1.6); blade(g, 12, 7, 12, 3.4, 0.3, 6, 3, AS, 1.6);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + v * 0.5, up = (i & 1) ? 7 : 5;
      for (let k = 0; k <= 1; k += 0.08) {
        const x = 12.5 + Math.cos(a) * 5 * k, y = 15 + up * k + Math.sin(k * 3) * 0.6, z = 12 + Math.sin(a) * 5 * k;
        const w = Math.sin(Math.PI * Math.min(1, k * 1.2)) * 1.2;
        for (let q = -Math.ceil(w); q <= Math.ceil(w); q++) g.set(x - Math.sin(a) * q, y, z + Math.cos(a) * q, t(EM, 2.5 + k * 3.5 - Math.abs(q) * 0.4), 3);
      }
    }
    g.ell(12.5, 16.5, 12, 1.6, 2, 1.6, EM[6], 3);
    return { grid: g, pivot: [12, 0.5, 12], scale: S, ao: false, light: { c: [1.1, 0.5, 0.15], r: 2.8, at: [0, 0.6, 0], lava: true }, emit: { k: 'ember', at: [0, 0.7, 0] }, main: [1, 0.55, 0.15] };
  },
  frostbloom(r, v) {
    const g = new PGrid(26, 24, 26);
    const FR = [0x2a4a66, 0x406c8e, 0x6a9cbc, 0x9ccae2, 0xcce8f6, 0xffffff];
    stalk(g, 13, 0, 13, 13, 14, 13, 1.2, 0.8, (k) => t(FR, 1 + k * 1.5));
    blade(g, 13, 4, 13, 0.6, 0.25, 7, 2.6, FR, 1.6); blade(g, 13, 6, 13, 3.8, 0.25, 6, 2.6, FR, 1.6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + v * 0.3;
      // spiky icy petals with a bright edge
      for (let k = 0; k <= 1; k += 0.07) {
        const x = 13 + Math.cos(a) * 7.5 * k, y = 15 + (i & 1) * 1.5 * k, z = 13 + Math.sin(a) * 7.5 * k;
        const w = (1 - k) * 1.6;
        for (let q = -Math.ceil(w); q <= Math.ceil(w); q++) g.set(x - Math.sin(a) * q, y, z + Math.cos(a) * q, Math.abs(q) >= w - 0.4 ? FR[5] : t(FR, 3 + k * 1.5), k > 0.7 ? 3 : 2);
      }
    }
    g.ell(13, 15.5, 13, 1.4, 1.4, 1.4, 0x80c8ff, 3);
    return { grid: g, pivot: [13, 0.5, 13], scale: S, ao: false, light: { c: [0.5, 0.8, 1.0], r: 2.2, at: [0, 0.5, 0] }, emit: { k: 'glint', c: [0.8, 0.95, 1], at: [0, 0.5, 0], spread: 0.18 }, main: [0.8, 0.94, 1] };
  },
  crystal_lily(r, v) {
    const g = new PGrid(24, 28, 24);
    const CR = [0x1c3a5a, 0x2e5e86, 0x4a8cb8, 0x78bce0, 0xb8e6ff, 0xffffff];
    const ST = [0x2e5446, 0x46705e, 0x62927c, 0x8ab8a2];
    stalk(g, 12, 0, 12, 12, 15, 12, 1.2, 0.8, (k) => t(ST, 0.5 + k * 2.5));
    blade(g, 12, 3, 12, 0.2, 0.4, 8, 3, ST, 1.6); blade(g, 12, 5, 12, 3.3, 0.4, 7, 3, ST, 1.6);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + v;
      // faceted petals cupping up
      for (let k = 0; k <= 1; k += 0.07) {
        const x = 12 + Math.cos(a) * 6 * k, y = 15 + k * 8, z = 12 + Math.sin(a) * 6 * k;
        const w = Math.sin(Math.PI * k) * 1.8;
        for (let q = -Math.ceil(w); q <= Math.ceil(w); q++) g.set(x - Math.sin(a) * q, y, z + Math.cos(a) * q, q < 0 ? t(CR, 4 + k) : t(CR, 2.6 + k * 2), k > 0.6 ? 3 : 2);
      }
    }
    g.box(11, 15, 11, 2, 3, 2, 0x60c8ff, 3);
    return { grid: g, pivot: [12, 0.5, 12], scale: S, sway: 'up', ao: false, light: { c: [0.5, 0.75, 1.0], r: 2.4, at: [0, 0.6, 0] }, emit: { k: 'glint', c: [0.7, 0.9, 1], at: [0, 0.6, 0], spread: 0.15 }, main: [0.7, 0.9, 1], chime: true };
  },
  bubblebulb(r, v) {
    const g = new PGrid(24, 30, 24);
    const BB = [0x1a4a4a, 0x2a6e6a, 0x3e948c, 0x5ab8ae, 0x86dcd2, 0xbafff4, 0xffffff];
    const ST = [0x2e4a26, 0x3e6232, 0x52803e, 0x6aa04e];
    stalk(g, 12, 0, 12, 12, 10, 12, 1.2, 1, (k) => t(ST, 0.5 + k * 2));
    blade(g, 12, 2, 12, 0.4, 0.15, 7, 3, ST, 1.4); blade(g, 12, 2, 12, 3.6, 0.15, 7, 3, ST, 1.4);
    // the bulb: a pale skin with a darker core showing through, a bright highlight
    g.ell(12, 17, 12, 7, 7.5, 7, (x, y, z, dx, dy, dz) => {
      const rr = dx * dx + dy * dy + dz * dz;
      if (rr < 0.7) return -1; // hollow (only the skin is meshed)
      return dx < -0.35 && dy > 0.3 ? BB[6] : t(BB, 2.6 + dy * 1.4 - dx * 0.8 + (hv(x >> 1, y >> 1, z >> 1, 7) < 0.1 ? 1.5 : 0));
    }, 1);
    for (const [x, y, z] of [[8, 21, 9], [9, 22, 9], [8, 22, 10]]) g.set(x, y, z, 0xffffff, 3);
    return { grid: g, pivot: [12, 0.5, 12], scale: S, sway: 'up', ao: false, emit: { k: 'bubble', c: [0.6, 0.95, 0.9], at: [0, 0.55, 0] }, main: [0.5, 0.86, 0.82] };
  },
};
HIRES_PLANTS.ashfern = (r, v) => HIRES_PLANTS.blindfern(r, v, 'ash');

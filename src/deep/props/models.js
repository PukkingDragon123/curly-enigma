// Pixel-art voxel models for the cave props (1/16 m voxels; the lanterns, glowing mushrooms, crates,
// barrels, rope coils and ore carts are the 1/32 m builders of ./hires.js). Each builder returns a PGrid plus
// how it hangs together: pivot (the anchor on the rock), sway mode, an optional light and particle
// emitter (local metres), and the colour it crumbles into.
//
// Mounts: 'floor' (pivot at the base, y up), 'ceil' (pivot at the top, hangs down), 'wall' (z = 0
// is the rock face, the model sticks out along +z).
import { PGrid, PU, meshPropSteps, rng32, hv, shade, mixc } from './grid.js';
import { LIFT_BUILD } from './lifts.js';
import { HIRES } from './hires.js';
import { HIRES_PLANTS } from './hiresPlants.js';

// ---------------------------------------------------------------- palettes
const WOOD = 0x8a5a32, WOOD_D = 0x5e3a1e, WOOD_L = 0xb07a44, WOOD_G = 0x7a6650;
const IRON = 0x5f646c, IRON_D = 0x3a3d42, IRON_L = 0x8e939a, RUST = 0x8a4a2a, RUST_L = 0xb0603a;
const ROPE = 0xc4a46a, ROPE_D = 0x96784a;
const BONE = 0xe6d8b4, BONE_S = 0xc8b48a, BONE_D = 0x8c7a58;

export const CRYSTAL_PAL = {
  violet: { c: 0xa86cff, hi: 0xe2c4ff, lo: 0x6438b8, tip: 0xffffff, g: 2, light: [0.6, 0.35, 1.0], base: 0x3a2e48 },
  cyan: { c: 0x48d4ff, hi: 0xc0f6ff, lo: 0x2480c0, tip: 0xffffff, g: 2, light: [0.3, 0.75, 1.0], base: 0x2e3a48 },
  pink: { c: 0xff62b4, hi: 0xffc8e4, lo: 0xa82a78, tip: 0xffffff, g: 2, light: [1.0, 0.4, 0.75], base: 0x48303e },
  ice: { c: 0xb4e8ff, hi: 0xf2fcff, lo: 0x5ea8dc, tip: 0xffffff, g: 1, light: [0.55, 0.8, 1.0], base: 0xe4f2fa },
  amber: { c: 0xffb040, hi: 0xffe4a0, lo: 0xc06a1a, tip: 0xfff4d0, g: 2, light: [1.0, 0.6, 0.2], base: 0x3a2a24 },
};

const lin = (hex) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)]; };
const srgbArr = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// ---------------------------------------------------------------- shared shapes
/** A tapered prism (crystal / shard / spike) along dir from (bx, by, bz); cross-section a diamond. */
function prism(g, bx, by, bz, len, w, lean, pal, o = {}) {
  const [lx, lz] = lean;
  const taper = o.taper ?? Math.max(2, w * 1.7);
  const dirY = o.down ? -1 : 1;
  for (let t = 0; t < len; t++) {
    const wt = Math.max(0, Math.min(w, (len - t) / taper * w));
    const cx = bx + lx * t, cz = bz + lz * t, y = by + t * dirY;
    const R = Math.max(0.5, wt);
    for (let dz = -Math.ceil(R); dz <= Math.ceil(R); dz++) for (let dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) {
      const m = o.square ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.abs(dx) + Math.abs(dz);
      if (m > R + 0.01) continue;
      const tip = t >= len - 2;
      const rel = (dx - dz) / (R + 0.5);
      let c = pal.c, gl = pal.g;
      if (tip) { c = pal.tip; gl = Math.min(3, pal.g + 1); }
      else if (rel > 0.45) c = pal.hi;
      else if (rel < -0.45) c = pal.lo;
      else if (m >= R - 0.5 && hv(Math.round(cx + dx), y, Math.round(cz + dz), 7) < 0.12) c = pal.hi;
      g.set(Math.round(cx + dx), y, Math.round(cz + dz), c, o.glow === false ? 0 : gl);
    }
  }
}

/** Rock / dirt bits around a base so a cluster grows out of the floor instead of standing on it. */
function rubble(g, cx, cy, cz, rx, ry, c0, c1, seed) {
  g.ell(cx, cy, cz, rx, ry, rx, (x, y, z) => (hv(x >> 1, y, z >> 1, seed) < 0.5 ? c0 : c1));
}

// ---------------------------------------------------------------- builders
// each: (r, v, p) → { grid, pivot, sway?, light?: {c, r, at}, emit?: {k, at, c?}, main }
export const BUILD = {
  // ---------- Rootsoil (the glowing mushroom clusters, 'mush', are in ./hires.js)
  shelf(r, v) {
    const pal = v === 2 ? { c: 0x4ad8c0, hi: 0xb8fff0, lo: 0x1e7a6a } : v === 1 ? { c: 0xffa040, hi: 0xffdc90, lo: 0xa85420 } : { c: 0xe8c070, hi: 0xfff0c0, lo: 0x9a7438 };
    const g = new PGrid(16, 16, 7);
    const n = r.int(2, 4);
    for (let i = 0; i < n; i++) {
      const cx = 8 + r.range(-3.5, 3.5), cy = 2 + i * r.range(3, 4.2), rx = r.range(2.5, 4.2), rz = Math.min(5.5, rx * r.range(0.9, 1.25));
      for (let z = 1; z <= Math.ceil(rz); z++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((z - 0.5) / rz) ** 2;
        if (d > 1) continue;
        const rim = d > 0.6;
        g.set(x, cy, z, pal.lo, 1);
        g.set(x, cy + 1, z, rim ? pal.hi : (hv(x, i, z, 5) < 0.3 ? pal.hi : pal.c), rim ? 3 : 2);
      }
    }
    return { grid: g, pivot: [8, 8, 1], light: v === 1 ? { c: [1.0, 0.55, 0.2], r: 2.6, at: [0, 0, 0.2] } : null, emit: { k: 'spore', c: lin(pal.hi), at: [0, 0, 0.2] }, main: srgbArr(pal.c) };
  },
  roots(r, v, L) {
    const g = new PGrid(18, L + 2, 18);
    const top = L + 1;
    const dirt = 0x5a3e28, dirtD = 0x4a3220;
    rubble(g, 9, top, 9, 4.2, 1.6, dirt, dirtD, 11);
    const n = r.int(4, 7);
    for (let i = 0; i < n; i++) {
      let x = 9 + r.range(-3, 3), z = 9 + r.range(-3, 3);
      const len = Math.round(L * r.range(0.45, 1));
      let vx = r.range(-0.25, 0.25), vz = r.range(-0.25, 0.25);
      const thick = i < 2;
      for (let k = 0; k < len; k++) {
        const y = top - 1 - k;
        vx += r.range(-0.12, 0.12); vz += r.range(-0.12, 0.12);
        vx = Math.max(-0.45, Math.min(0.45, vx)); vz = Math.max(-0.45, Math.min(0.45, vz));
        x = Math.max(1, Math.min(16, x + vx)); z = Math.max(1, Math.min(16, z + vz));
        const tip = k >= len - 2;
        const c = tip ? 0xb89a70 : ((y >> 2) & 1) ? 0x6b4a2e : 0x7d5a38;
        g.set(x, y, z, c);
        if (thick && k < len * 0.35) { g.set(x + 1, y, z, shade(c, 0.9)); g.set(x, y, z + 1, shade(c, 0.85)); }
        if (!tip && hv(i, k, v, 9) < 0.12) {
          const sx = hv(i, k, 1) < 0.5 ? 1 : -1, sz = hv(i, k, 2) < 0.5 ? 1 : -1;
          g.set(x + sx, y - 1, z, 0x9a7a52); g.set(x + sx * 2, y - 2, z + sz, 0xa88a60);
        }
      }
    }
    return { grid: g, pivot: [9, top, 9], sway: 'down', main: [0.42, 0.3, 0.2] };
  },
  vine(r, v, L) {
    const g = new PGrid(14, L + 2, 14);
    const top = L + 1;
    rubble(g, 7, top, 7, 3.2, 1.3, 0x4a5a2a, 0x3a4820, 13);
    const n = r.int(3, 5);
    const berry = v === 1 ? 0xff7ab0 : 0x7affd8;
    for (let i = 0; i < n; i++) {
      const x0 = 7 + r.range(-3.5, 3.5), z0 = 7 + r.range(-3.5, 3.5), len = Math.round(L * r.range(0.5, 1)), ph = r() * 6;
      for (let k = 0; k < len; k++) {
        const y = top - 1 - k;
        const x = x0 + Math.sin(k * 0.35 + ph) * 0.8, z = z0 + Math.cos(k * 0.3 + ph) * 0.6;
        g.set(x, y, z, 0x3e7a2a);
        if (k % 3 === 1) {
          const s = (k / 3) & 1 ? 1 : -1;
          g.set(x + s, y, z, 0x5aa83a); g.set(x + s, y - 1, z, 0x6ac04a);
          if (hv(i, k, v) < 0.25) g.set(x, y, z + s, 0x4a9030);
        }
        if (k > 3 && hv(i, k, v, 4) < 0.07) g.set(x - 1, y, z, berry, 3);
      }
      g.set(x0 + Math.sin(len * 0.35 + ph) * 0.8, top - len, z0 + Math.cos(len * 0.3 + ph) * 0.6, berry, 3);
    }
    return { grid: g, pivot: [7, top, 7], sway: 'down', emit: { k: 'firefly', c: lin(berry), at: [0, -L * PU * 0.6, 0] }, main: [0.3, 0.55, 0.22] };
  },

  // ---------- Clayworks
  fossil(r, v) {
    const g = new PGrid(18, 18, 4);
    const cx = 9, cy = 9;
    // a slab of pale stone the fossil sits in
    const slab = 0x9a8a72, slabD = 0x7e705c;
    if (v % 3 === 0) {
      // ammonite
      const R = r.range(6.2, 7.6);
      for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
        const dx = x - cx, dy = y - cy, rad = Math.hypot(dx, dy);
        if (rad > R) continue;
        const ang = Math.atan2(dy, dx);
        const b = 1.15, f = ((rad - ang * b) / (b * Math.PI * 2)) % 1, fr = f < 0 ? f + 1 : f;
        const groove = fr < 0.2;
        g.set(x, y, 1, groove ? BONE_D : (rad > R - 1.2 ? BONE_S : BONE));
        if (!groove && Math.floor((ang + Math.PI) * 4.2) % 2 === 0 && rad > 2.5) g.set(x, y, 2, rad > R - 1.5 ? BONE_S : BONE);
      }
    } else if (v % 3 === 1) {
      // fish skeleton
      const L0 = 2, L1 = 14;
      g.line(L0, cy, 1, L1, cy, 1, BONE);
      for (let x = L0 + 1; x <= L1; x += 2) g.set(x, cy, 2, BONE_S);
      for (let x = 5; x <= 11; x += 2) {
        const h = 4.5 - Math.abs(x - 8) * 0.45;
        g.line(x, cy + 1, 1, x - 1, cy + h, 1, BONE_S);
        g.line(x, cy - 1, 1, x - 1, cy - h, 1, BONE_S);
      }
      g.ell(15, cy, 1, 2.2, 2.6, 0.6, BONE); g.set(15, cy + 1, 2, BONE_D); g.set(16, cy - 1, 1, BONE_D);
      g.line(L0, cy, 1, 0, cy + 3, 1, BONE_S); g.line(L0, cy, 1, 0, cy - 3, 1, BONE_S); g.line(1, cy + 2, 1, 1, cy - 2, 1, BONE_D);
    } else {
      // trilobite
      for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
        const dx = (x - cx) / 5, dy = (y - cy) / 7.2;
        if (dx * dx + dy * dy > 1) continue;
        const head = y > cy + 3;
        const seg = !head && (y & 1);
        g.set(x, y, 1, head ? BONE_S : seg ? BONE_D : BONE);
        if (Math.abs(x - cx) <= 1) g.set(x, y, 2, seg ? BONE_S : BONE);
      }
      g.set(cx - 2, cy + 5, 2, BONE_D); g.set(cx + 2, cy + 5, 2, BONE_D);
    }
    // rough edge of the stone matrix around it
    for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
      if (g.has(x, y, 1)) continue;
      const rad = Math.hypot(x - cx, y - cy);
      if (rad < 8.4 + hv(x, y, 3) * 1.2 && hv(x, y, v, 4) < 0.55) g.set(x, y, 1, hv(x >> 1, y >> 1, 9) < 0.5 ? slab : slabD);
    }
    // set it in a block of stone that reaches a quarter metre back, so a ragged rock face never
    // leaves it hanging in the air
    const out = new PGrid(18, 18, 10);
    for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
      if (!g.has(x, y, 1)) continue;
      for (let z = 0; z < 7; z++) out.set(x, y, z, z < 5 ? slabD : slab);
      out.set(x, y, 7, g.color(x, y, 1));
      if (g.has(x, y, 2)) out.set(x, y, 8, g.color(x, y, 2));
    }
    return { grid: out, pivot: [9, 9, 7], main: srgbArr(BONE) };
  },
  bones(r, v) {
    if (v % 3 === 0) {
      // half-sunk ribcage of something big
      const g = new PGrid(22, 10, 14);
      g.line(1, 2, 7, 20, 3, 7, (t) => (Math.floor(t * 20) % 2 ? BONE : BONE_S), 0, 0.8);
      for (let x = 4; x <= 16; x += 2) {
        const R = 5 - Math.abs(x - 10) * 0.25, broken = hv(x, v, 1) < 0.3;
        for (let a = 0.12; a < Math.PI - 0.12; a += 0.07) {
          if (broken && a > 1.9) break;
          const y = 2 + Math.sin(a) * R * 1.05, z = 7 + Math.cos(a) * R * 1.1;
          g.set(x, y, z, a < 0.4 || a > 2.7 ? BONE_S : BONE);
        }
      }
      g.ell(20, 3, 7, 1.6, 1.6, 1.6, BONE_S);
      return { grid: g, pivot: [11, 2.5, 7], main: srgbArr(BONE) };
    }
    if (v % 3 === 1) {
      // a horned skull
      const g = new PGrid(18, 13, 16);
      g.ell(9, 5, 6, 4.6, 3.8, 4.2, (x, y) => (y < 3 ? BONE_S : BONE));
      g.ell(9, 3.6, 10.5, 2.8, 2.4, 3.6, BONE);
      for (const sx of [-1, 1]) {
        for (let z = 7; z <= 9; z++) for (let y = 5; y <= 6; y++) g.set(9 + sx * 2, y, z + 1, -1);
        g.set(9 + sx * 2, 5, 8, 0x2a2018); g.set(9 + sx * 2, 6, 8, 0x2a2018);
        g.line(9 + sx * 4, 7, 5, 9 + sx * 7, 10, 3, (t) => (t > 0.7 ? 0xd8c8a0 : BONE_S), 0, 0.9);
        g.line(9 + sx * 7, 10, 3, 9 + sx * 8, 12, 5, 0xf0e8d0);
      }
      g.set(8, 3, 14, 0x3a2e22); g.set(10, 3, 14, 0x3a2e22);
      for (let x = 7; x <= 11; x++) g.set(x, 1, 12 + (x & 1), 0xf4ecd8);
      return { grid: g, pivot: [9, 2, 8], main: srgbArr(BONE) };
    }
    // scattered long bones and vertebrae
    const g = new PGrid(20, 6, 20);
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI, L = r.range(5, 8), cx = 10 + r.range(-3, 3), cz = 10 + r.range(-3, 3);
      const x0 = cx - Math.cos(a) * L, z0 = cz - Math.sin(a) * L, x1 = cx + Math.cos(a) * L, z1 = cz + Math.sin(a) * L;
      g.line(x0, 1, z0, x1, 1, z1, BONE, 0, 0.6);
      g.ell(x0, 1.3, z0, 1.5, 1.4, 1.5, BONE_S); g.ell(x1, 1.3, z1, 1.4, 1.3, 1.4, BONE_S);
    }
    for (let k = 0; k < 4; k++) { const x = r.range(3, 17), z = r.range(3, 17); g.ell(x, 1, z, 1.2, 1, 1.2, BONE_S); g.set(x, 2, z, BONE); }
    return { grid: g, pivot: [10, 1.5, 10], main: srgbArr(BONE) };
  },
  urn(r, v) {
    const g = new PGrid(12, 14, 12);
    const c0 = v ? 0xa8603a : 0x8a6a4a, c1 = shade(c0, 0.75), band = v ? 0xe0b070 : 0x5a3a28;
    for (let y = 0; y < 12; y++) {
      const rr = y < 9 ? 3 + Math.sin((y / 9) * Math.PI) * 2.2 : 2.3 + (y - 9) * 0.4;
      g.cylY(6, 6, rr, y, y + 1, (x, yy, z) => (y === 6 || y === 7 ? band : hv(x, yy, z, 2) < 0.15 ? c1 : c0));
    }
    // broken lip and a crack
    for (let k = 0; k < 6; k++) g.set(6 + Math.cos(k) * 3, 11, 6 + Math.sin(k) * 3, -1);
    g.cylY(6, 6, 1.6, 9, 12, -1);
    return { grid: g, pivot: [6, 3, 6], main: srgbArr(c0) };
  },

  // ---------- Crystal Grotto / Frost Vault
  crystal(r, v, p) {
    const pal = CRYSTAL_PAL[p] || CRYSTAL_PAL.violet;
    const big = v % 2 === 0;
    const S = big ? 24 : 16, H = big ? 30 : 18;
    const g = new PGrid(S, H, S);
    const c = S / 2;
    rubble(g, c, 0, c, big ? 5.5 : 3.6, 1.8, pal.base, shade(pal.base, 0.8), 17);
    const n = big ? r.int(5, 8) : r.int(3, 5);
    for (let i = 0; i < n; i++) {
      const main = i === 0;
      const a = r() * Math.PI * 2, d = main ? r.range(0, 1) : r.range(2, big ? 6 : 4);
      const bx = c + Math.cos(a) * d, bz = c + Math.sin(a) * d;
      const len = main ? (big ? r.int(22, 28) : r.int(12, 16)) : Math.round((big ? r.range(7, 18) : r.range(5, 11)));
      const w = main ? (big ? r.range(2.6, 3.2) : r.range(1.6, 2.1)) : r.range(1, 2.2);
      const lean = main ? [r.range(-0.08, 0.08), r.range(-0.08, 0.08)] : [Math.cos(a) * r.range(0.12, 0.3), Math.sin(a) * r.range(0.12, 0.3)];
      prism(g, bx, 0, bz, Math.min(len, H - 1), w, lean, pal);
    }
    return { grid: g, pivot: [c, 0.5, c], light: { c: pal.light, r: big ? 4.6 : 3, at: [0, big ? 0.7 : 0.4, 0] }, emit: { k: 'glint', c: lin(pal.hi), at: [0, big ? 0.8 : 0.45, 0], spread: big ? 0.4 : 0.25 }, main: srgbArr(pal.c), chime: true };
  },
  crystalC(r, v, p) {
    const pal = CRYSTAL_PAL[p] || CRYSTAL_PAL.violet;
    const g = new PGrid(16, 18, 16);
    rubble(g, 8, 17, 8, 4, 1.6, pal.base, shade(pal.base, 0.8), 19);
    const n = r.int(3, 6);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = i ? r.range(1.5, 4.5) : 0;
      prism(g, 8 + Math.cos(a) * d, 16, 8 + Math.sin(a) * d, i ? r.int(4, 11) : r.int(11, 16), i ? r.range(1, 1.8) : r.range(1.6, 2.2), [Math.cos(a) * r.range(0, 0.25), Math.sin(a) * r.range(0, 0.25)], pal, { down: true });
    }
    return { grid: g, pivot: [8, 17.5, 8], light: { c: pal.light, r: 3, at: [0, -0.4, 0] }, emit: { k: 'glint', c: lin(pal.hi), at: [0, -0.45, 0], spread: 0.25 }, main: srgbArr(pal.c), chime: true };
  },
  glowthread(r, v, L) {
    const g = new PGrid(14, L + 3, 14);
    const top = L + 2;
    const bead = v % 2 ? 0x8cffa8 : 0x7ae8ff;
    g.ell(7, top, 7, 3.4, 1.2, 3.4, (x, y, z) => (hv(x, y, z, 21) < 0.3 ? 0x6a8a7a : 0x4a6a5a), 1);
    const n = r.int(6, 10);
    for (let i = 0; i < n; i++) {
      const x = 7 + r.range(-4.5, 4.5), z = 7 + r.range(-4.5, 4.5), len = r.int(Math.round(L * 0.35), L), step = r.int(2, 4);
      for (let k = 0; k < len; k++) {
        const y = top - 1 - k;
        g.set(x, y, z, k % step === step - 1 ? bead : 0xb8e0e0, k % step === step - 1 ? 3 : 1);
      }
      g.set(x, top - len, z, bead, 3); g.set(x, top - len - 1, z, bead, 3);
    }
    return { grid: g, pivot: [7, top, 7], sway: 'down', light: { c: v % 2 ? [0.4, 1.0, 0.55] : [0.35, 0.85, 1.0], r: 2.6, at: [0, -L * PU * 0.5, 0] }, emit: { k: 'firefly', c: lin(bead), at: [0, -L * PU * 0.6, 0] }, main: srgbArr(bead) };
  },

  // ---------- Magma Deep
  obsidian(r, v) {
    const g = new PGrid(18, 22, 18);
    const pal = { c: 0x1e1828, hi: 0x5a4a7e, lo: 0x100c16, tip: 0x9a88d0, g: 0 };
    rubble(g, 9, 0, 9, 4.5, 1.6, 0x2a2228, 0x1e1a20, 23);
    const n = r.int(3, 6);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = i ? r.range(1.5, 5) : 0;
      const len = i ? r.int(5, 13) : r.int(14, 20);
      prism(g, 9 + Math.cos(a) * d, 1, 9 + Math.sin(a) * d, len, i ? r.range(1, 1.8) : r.range(1.8, 2.4), [Math.cos(a) * r.range(0.1, 0.35), Math.sin(a) * r.range(0.1, 0.35)], pal, { glow: false, taper: 5 });
    }
    return { grid: g, pivot: [9, 1.5, 9], main: [0.12, 0.1, 0.16] };
  },
  vent(r, v) {
    const g = new PGrid(18, 10, 18);
    const crust = 0x3a2c28, crust2 = 0x4e3a30, hot = 0xff7a18, hotC = 0xffd060;
    for (let y = 0; y < 7; y++) {
      const R = 7.5 - y * 0.95 + (r() - 0.5) * 0.3;
      g.cylY(9, 9, R, y, y + 1, (x, yy, z) => (hv(x >> 1, yy, z >> 1, 31) < 0.5 ? crust : crust2));
    }
    g.cylY(9, 9, 2.2, 4, 8, -1);
    g.cylY(9, 9, 2.2, 4, 5, (x, y, z) => (Math.hypot(x - 9, z - 9) < 1.2 ? hotC : hot), 3);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + r() * 0.8;
      for (let t = 2.4; t < 7; t += 0.5) {
        const x = 9 + Math.cos(a) * t, z = 9 + Math.sin(a) * t;
        let y = 6;
        while (y > 0 && !g.has(x, y, z)) y--;
        if (g.has(x, y, z)) g.set(x, y, z, t < 4 ? hot : 0xd85010, 2);
      }
    }
    for (let k = 0; k < 6; k++) { const a = r() * 6.28, d = r.range(3, 6); let y = 6; const x = 9 + Math.cos(a) * d, z = 9 + Math.sin(a) * d; while (y > 0 && !g.has(x, y, z)) y--; g.set(x, y, z, 0xd8c040); }
    return { grid: g, pivot: [9, 0.5, 9], light: { c: [1.5, 0.5, 0.12], r: 4.2, at: [0, 0.4, 0], lava: true }, emit: { k: 'vent', at: [0, 0.3, 0] }, main: [0.25, 0.18, 0.15] };
  },
  charred(r, v) {
    const g = new PGrid(26, 9, 14);
    const ch0 = 0x2a221e, ch1 = 0x3a2e26, ember = 0xff6a18;
    const log = (x0, y0, z0, x1, y1, z1) => {
      g.line(x0, y0, z0, x1, y1, z1, (t, x, y, z) => (hv(Math.round(x) >> 1, 0, 0, 3) < 0.5 ? ch0 : ch1), 0, 1.3);
    };
    log(2, 1.3, 6, 23, 1.3, 7.5);
    for (let x = 3; x < 23; x++) if (hv(x, 1, v, 5) < 0.28) g.set(x, 2.6, 6 + (x - 2) * 0.07, ember, 2);
    if (v % 2 === 0) { log(6, 1.5, 11.5, 18, 5.5, 2.5); for (let k = 0; k < 4; k++) { const t = r(); g.set(6 + 12 * t, 2.8 + 4 * t, 11.5 - 9 * t, ember, 2); } }
    for (let k = 0; k < 4; k++) g.set(23 + (k & 1), 1 + (k >> 1), 7 + (k & 1), -1);
    return { grid: g, pivot: [13, 0.5, 7], emit: { k: 'smolder', at: [0, 0.18, 0], spread: 0.6 }, main: [0.12, 0.1, 0.09] };
  },

  // ---------- Frost Vault
  icicle(r, v, L) {
    const g = new PGrid(16, L + 2, 16);
    const top = L + 1;
    g.ell(8, top, 8, 4.6, 1.2, 4.6, (x, y, z) => (hv(x, y, z, 41) < 0.4 ? 0xe4f6ff : 0xc8ecfc), 1);
    const n = r.int(3, 7);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = i ? r.range(1.5, 5) : 0;
      const x = 8 + Math.cos(a) * d, z = 8 + Math.sin(a) * d;
      const len = i ? r.int(Math.max(3, L * 0.3 | 0), L) : L, w = i ? r.range(0.8, 1.8) : r.range(1.6, 2.4);
      for (let k = 0; k < len; k++) {
        const y = top - 1 - k, R = Math.max(0, w * (1 - k / len));
        const tip = k >= len - 2;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > R + 0.01) continue;
          g.set(x + dx, y, z + dz, tip ? 0xffffff : (dx - dz > 0 ? 0xeefaff : dx - dz < 0 ? 0x9cd4f0 : 0xc4ecff), tip ? 2 : 1);
        }
      }
    }
    return { grid: g, pivot: [8, top, 8], emit: { k: 'drip', at: [0, -L * PU * 0.9, 0], spread: 0.2 }, main: [0.75, 0.9, 1] };
  },
  frozen(r, v) {
    const out = BUILD.crystal(r, v, 'ice');
    const g = out.grid;
    // snow drifted around the foot
    const c = g.w / 2;
    g.ell(c, 0, c, c - 2, 2.4, c - 2, (x, y, z) => (g.has(x, y, z) ? -1 : (hv(x, y, z, 43) < 0.3 ? 0xdceef8 : 0xf4fbff)));
    out.light = { c: [0.5, 0.75, 1.0], r: 3, at: out.light.at };
    return out;
  },

  // ---------- The Core
  shard(r, v, hover) {
    const L = r.int(9, 15), W = r.range(2, 3);
    const g = new PGrid(9, L + 1, 9);
    const edge = v % 2 ? 0x6af0ff : 0xe070ff;
    for (let y = 0; y < L; y++) {
      const t = y / (L - 1), w = W * (1 - Math.abs(t - 0.42) / 0.58);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const m = Math.abs(dx) + Math.abs(dz);
        if (m > w + 0.01) continue;
        const rim = m >= w - 0.7 && (dx === 0 || dz === 0);
        const lit = dx - dz > 0;
        g.set(4 + dx, y, 4 + dz, rim ? edge : lit ? 0x4a2a6a : 0x22123a, rim ? 3 : 1);
      }
    }
    return { grid: g, pivot: [4, -hover, 4], bob: true, light: { c: v % 2 ? [0.3, 0.8, 1.2] : [0.9, 0.35, 1.2], r: 3.2, at: [0, (hover + L * 0.45) * PU, 0] }, emit: { k: 'mote', c: lin(edge), at: [0, (hover + L * 0.45) * PU, 0], spread: 0.25 }, main: srgbArr(edge) };
  },

  // ---------- old miners
  rail(r, v) {
    // a ballast bed (two voxels below the anchor, so a track laid over bumps never shows a gap),
    // sleepers, iron rails and their spikes
    const g = new PGrid(16, 6, 12);
    g.box(0, 0, 2, 16, 2, 8, (x, y, z) => (y === 1 && (z === 2 || z === 9) && hv(x >> 1, z, v, 2) < 0.5 ? -1 : hv(x >> 2, y, z >> 2, 1) < 0.5 ? 0x4a4440 : 0x5e5650));
    for (let x = 1; x < 16; x += 4) {
      const off = v === 1 && x === 9 ? 1 : 0;
      g.box(x, 2, 1 + off, 2, 2, 10, (xx, y, z) => (z === 1 + off || z === 10 + off ? WOOD_D : y === 2 ? 0x4e3420 : hv(xx, z >> 2, x, 3) < 0.5 ? 0x6a4a2e : 0x5c4028));
    }
    for (const z of [3, 8]) {
      const end = v === 1 && z === 8 ? 11 : 16;
      g.box(0, 4, z, end, 1, 1, (x) => (hv(x, z, v, 5) < 0.18 ? RUST : IRON_L));
      if (v === 1 && z === 8) { g.set(11, 5, 8, RUST); g.set(12, 5, 9, RUST_L); }
    }
    for (let x = 1; x < 16; x += 4) for (const z of [2, 4, 7, 9]) g.set(x, 4, z, IRON_D);
    return { grid: g, pivot: [8, 2, 6], main: [0.3, 0.22, 0.15] };
  },
  ladder(r, v, Hh) {
    const g = new PGrid(9, Hh, 5);
    const zAt = (y) => Math.round(3.4 - 3.4 * (y / (Hh - 1)));
    for (let y = 0; y < Hh; y++) { g.set(1, y, zAt(y), WOOD_D); g.set(7, y, zAt(y), WOOD_D); }
    for (let y = 3; y < Hh - 1; y += 4) {
      if (hv(y, v, Hh, 61) < 0.15) { g.set(2, y, zAt(y), WOOD_L); continue; }
      for (let x = 2; x <= 6; x++) g.set(x, y, zAt(y), (x & 1) ? WOOD_L : WOOD);
    }
    return { grid: g, pivot: [4.5, 0.5, 0], main: [0.4, 0.28, 0.16] };
  },
  post(r, v, Hp) {
    const g = new PGrid(8, Hp, 8);
    const bark = (x, y, z) => ((x + z) & 1 ? 0x6e4a2a : hv(x, y >> 2, z, 63) < 0.2 ? 0x4a3018 : 0x5a3a20);
    g.box(2, 0, 2, 3, Hp - 2, 3, bark);
    g.box(1, Hp - 2, 2, 6, 2, 4, (x, y) => (y === Hp - 1 ? WOOD : WOOD_D));
    g.set(4, Hp - 3, 5, IRON_L); g.set(1, 0, 3, 0x5a5048); g.set(5, 0, 1, 0x5a5048);
    if (v % 2) for (let y = 4; y < Hp - 4; y += 6) g.box(1, y, 1, 5, 1, 5, (x, yy, z) => (x === 1 || x === 5 || z === 1 || z === 5 ? ROPE_D : -1));
    return { grid: g, pivot: [3.5, 0.5, 3.5], main: [0.35, 0.24, 0.14] };
  },
  rope(r, v, L) {
    // a frayed rope off an iron ring bolt, ending in a loop
    const g = new PGrid(7, L + 3, 7);
    const top = L + 2;
    g.set(3, top, 3, IRON_D); g.set(3, top - 1, 3, IRON_D);
    g.set(2, top - 2, 3, IRON); g.set(4, top - 2, 3, IRON); g.set(3, top - 3, 3, IRON);
    for (let y = 5; y < top - 3; y++) g.set(3, y, 3, ((y >> 1) & 1) ? ROPE : ROPE_D);
    for (const [x, y] of [[3, 4], [2, 3], [2, 2], [2, 1], [3, 0], [4, 1], [4, 2], [4, 3]]) g.set(x, y, 3, (x + y) & 1 ? ROPE : ROPE_D);
    return { grid: g, pivot: [3.5, top + 1, 3.5], sway: 'down', main: [0.6, 0.5, 0.32] };
  },
  sign(r, v) {
    const g = new PGrid(17, 22, 6);
    g.box(2, 0, 2, 2, 20, 2, (x, y) => (y < 2 ? 0x4a3018 : (x + y) & 3 ? 0x6a4a2e : 0x5a3c22));
    const board = (x, y) => (y === 14 || y === 18 ? 0x7a5230 : hv(x >> 2, y, v, 71) < 0.5 ? 0xa87a48 : 0x9a6e40);
    for (let y = 14; y <= 18; y++) for (let x = 0; x <= 12; x++) g.set(x, y, 4, board(x, y));
    g.box(13, 15, 4, 1, 3, 1, board); g.set(14, 16, 4, 0x9a6e40);
    // painted letters (just suggestions of them) and nails
    for (let x = 2; x <= 10; x++) for (const y of [16, 17]) if (hv(x, y, v, 73) < 0.45 && x !== 6) g.set(x, y, 4, 0x3a2414);
    g.set(1, 16, 5, IRON_L); g.set(12, 16, 5, IRON_L);
    if (v % 2) for (let x = 0; x <= 13; x++) if (hv(x, 1, 75) < 0.3) g.set(x, 18, 4, -1); // weathered top edge
    return { grid: g, pivot: [3, 0.5, 3], main: [0.45, 0.32, 0.2] };
  },
  pick(r, v) {
    const g = new PGrid(16, 16, 5);
    g.line(7, 0, 2, 9, 12, 2, (t) => (t < 0.15 ? 0x5a3c22 : t > 0.85 ? WOOD_D : WOOD_L));
    g.line(3, 10, 2, 9, 13, 2, (t) => (hv(Math.round(t * 9), 0, 0, 91) < 0.25 ? RUST : IRON));
    g.line(9, 13, 2, 14, 10, 2, (t) => (hv(Math.round(t * 9), 1, 0, 91) < 0.25 ? RUST : IRON));
    g.set(2, 9, 2, IRON_L); g.set(15, 9, 2, IRON_L);
    g.box(8, 12, 1, 2, 2, 3, IRON_D);
    return { grid: g, pivot: [7.5, 2, 2.5], main: [0.4, 0.35, 0.3] };
  },

  // ---------- harvestable plants (item ids)
  glowcap(r, v) {
    const g = new PGrid(14, 13, 14);
    const cap = 0x3a8cff, hi = 0x9ccfff, gill = 0x2050a0;
    g.box(6, 0, 6, 2, 6, 2, (x, y) => (y < 1 ? 0xa8b8c4 : 0xd8e8f0));
    for (let y = 6; y <= 9; y++) for (let z = 1; z < 13; z++) for (let x = 1; x < 13; x++) {
      const dx = (x - 6.5) / 4.6, dy = (y - 6) / 3.2, dz = (z - 6.5) / 4.6;
      if (dx * dx + dy * dy + dz * dz > 1) continue;
      g.set(x, y, z, y === 6 ? gill : hv(x, y, z, 101 + v) < 0.18 ? hi : cap, y === 6 ? 1 : hv(x, y, z, 101 + v) < 0.18 ? 3 : 2);
    }
    // a baby beside it
    const bx = v ? 11 : 2, bz = v ? 3 : 10;
    g.box(bx, 0, bz, 1, 2, 1, 0xd8e8f0);
    g.ell(bx, 2.4, bz, 1.6, 0.9, 1.6, cap, 2);
    return { grid: g, pivot: [6.5, 0.5, 6.5], light: { c: [0.2, 0.5, 1.0], r: 2.6, at: [0, 0.4, 0] }, emit: { k: 'firefly', c: [0.38, 0.72, 1], at: [0, 0.5, 0] }, main: [0.25, 0.5, 1] };
  },
  cave_carrot(r, v) {
    const g = new PGrid(14, 15, 14);
    g.ell(7, 3, 7, 2.3, 3.4, 2.3, (x, y) => (y >= 5 ? 0xf8a040 : (y & 1 ? 0xe07a20 : 0xc86a1a)));
    const n = r.int(4, 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.5, R = r.range(3, 5.2), H = r.range(10, 13.5);
      const ex = 7 + Math.cos(a) * R, ez = 7 + Math.sin(a) * R;
      g.line(7, 6, 7, ex, H, ez, (t) => (t < 0.3 ? 0x3a7a2a : 0x4a9a32));
      for (let t = 0.45; t < 1; t += 0.18) {
        const x = 7 + (ex - 7) * t, y = 6 + (H - 6) * t, z = 7 + (ez - 7) * t;
        g.set(x + Math.sin(a), y, z - Math.cos(a), 0x6ac04a); g.set(x - Math.sin(a), y, z + Math.cos(a), 0x5ab83a);
      }
    }
    return { grid: g, pivot: [7, 5, 7], sway: 'up', main: [0.95, 0.55, 0.2] };
  },
  blindfern(r, v, p) {
    // pale (or ashen) fronds arching out of a dark crown, leaflets alternating along each
    const ash = p === 'ash';
    const stem = ash ? 0x5e5e5c : 0x8a9c7c, leafA = ash ? 0x8e8c88 : 0xd2e2c0, leafB = ash ? 0x6e6c6a : 0xa8c098, tip = ash ? 0xe0dcd2 : 0xf2fbe8;
    const g = new PGrid(20, 13, 20);
    g.ell(10, 0.5, 10, 1.6, 1.2, 1.6, ash ? 0x3a3836 : 0x4a5a40);
    const n = r.int(5, 7);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.5, L = r.range(6.5, 8.5), H = r.range(7, 11);
      const ca = Math.cos(a), sa = Math.sin(a);
      const steps = Math.round(L * 1.6);
      let px = 10, py = 1, pz = 10;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        // rises steeply, then arches over and droops at the tip
        const d = t * L, y = 1 + H * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62) - Math.max(0, t - 0.7) * 6;
        const x = 10 + ca * d, z = 10 + sa * d;
        g.line(px, py, pz, x, y, z, t > 0.9 ? tip : stem);
        if (t > 0.18 && t < 0.92 && k % 2 === 0) {
          const len = Math.max(1, Math.round((1 - t) * 3.2));
          const side = (k >> 1) & 1 ? 1 : -1;
          for (let q = 1; q <= len; q++) g.set(x - sa * q * side, y - (q > 1 ? 1 : 0), z + ca * q * side, (q + k) & 1 ? leafA : leafB);
          for (let q = 1; q <= len; q++) g.set(x + sa * q * side, y - (q > 1 ? 1 : 0), z - ca * q * side, (q + k + 1) & 1 ? leafA : leafB);
        }
        px = x; py = y; pz = z;
      }
    }
    return { grid: g, pivot: [10, 0.5, 10], sway: 'up', main: ash ? [0.5, 0.5, 0.48] : [0.8, 0.88, 0.75] };
  },
  whisperweed(r, v) {
    const g = new PGrid(14, 15, 14);
    g.ell(7, 14, 7, 3, 1.2, 3, 0x4a2e62, 1);
    const n = r.int(6, 8);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = r.range(0, 2.5), L = r.int(7, 13), ph = r() * 6;
      for (let k = 0; k < L; k++) {
        const x = 7 + Math.cos(a) * d + Math.sin(k * 0.6 + ph) * (k / L) * 2, z = 7 + Math.sin(a) * d + Math.cos(k * 0.6 + ph) * (k / L) * 2;
        g.set(x, 13 - k, z, k > L - 3 ? 0xe8c8ff : 0x9a70c8, k > L - 3 ? 3 : 1);
      }
    }
    return { grid: g, pivot: [7, 14.5, 7], sway: 'down', light: { c: [0.5, 0.32, 0.75], r: 1.8, at: [0, -0.4, 0] }, emit: { k: 'mote', c: [0.75, 0.55, 1], at: [0, -0.45, 0], spread: 0.2 }, main: [0.6, 0.45, 0.8] };
  },
  rubber_sap(r, v) {
    const g = new PGrid(12, 18, 12);
    g.ell(6, 17, 6, 3, 1.2, 3, 0x3a4820);
    for (let k = 0; k < 13; k++) {
      const x = 6 + Math.cos(k * 0.55) * 1.4, z = 6 + Math.sin(k * 0.55) * 1.4, y = 16 - k;
      g.set(x, y, z, k & 1 ? 0x2e5a2a : 0x3e7a34); g.set(x + 1, y, z, 0x2e5a2a);
      if (k % 4 === 2) { g.set(x + 2, y, z, 0x5aa040); g.set(x + 2, y - 1, z + 1, 0x4a9030); g.set(x - 1, y - 1, z - 1, 0x5aa040); }
    }
    g.ell(6.5, 2.4, 6, 2, 2.6, 2, (x, y) => (y > 3 ? 0xf8e0a0 : 0xe8c070), 1);
    g.set(5.5, 3.5, 4.5, 0xfff8e0, 2);
    return { grid: g, pivot: [6, 17.5, 6], sway: 'down', main: [0.9, 0.8, 0.5] };
  },
  pepperroot(r, v) {
    const g = new PGrid(14, 13, 14);
    g.ell(7, 2, 7, 2, 2.4, 2, 0xa8301a);
    g.line(7, 3, 7, 7, 9, 7, 0x3a7a2a);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + r() * 0.5, x = 7 + Math.cos(a) * 3.5, z = 7 + Math.sin(a) * 3.5, y = r.range(6, 10);
      g.line(7, y - 2, 7, x, y, z, 0x4a9a3a);
      g.set(x + Math.cos(a), y, z + Math.sin(a), 0x5ab84a);
      if (i < 3) {
        g.set(x, y - 1, z, 0x3a7a2a);
        for (let k = 2; k <= 4; k++) g.set(x, y - k, z, k === 2 ? 0xff7a5a : 0xe8301a);
      }
    }
    return { grid: g, pivot: [7, 2.5, 7], sway: 'up', main: [0.9, 0.2, 0.1] };
  },
  sparkmoss(r, v) {
    const g = new PGrid(14, 12, 5);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 14; x++) {
      const d = ((x - 7) / 6.2) ** 2 + ((y - 6) / 5) ** 2;
      if (d > 1 || hv(x, y, v, 111) < d * 0.35) continue;
      const spark = hv(x, y, 113) < 0.09;
      g.set(x, y, 2, spark ? 0xc8f4ff : hv(x >> 1, y >> 1, 112) < 0.5 ? 0x2a6aa0 : 0x3a8ad0, spark ? 3 : 1);
      g.set(x, y, 1, 0x1e4a70, 1); g.set(x, y, 0, 0x1e4a70, 1);
      if (hv(x, y, 114) < 0.3 && d < 0.7) g.set(x, y, 3, 0x4aa0e8, 2);
    }
    return { grid: g, pivot: [7, 6, 2], light: { c: [0.25, 0.7, 1.0], r: 2.2, at: [0, 0, 0.15] }, emit: { k: 'spark', c: [0.5, 0.9, 1], at: [0, 0, 0.12], spread: 0.3 }, main: [0.3, 0.6, 0.9] };
  },
  bubblebulb(r, v) {
    const g = new PGrid(12, 14, 12);
    g.line(6, 0, 6, 6, 5, 6, 0x5a7a4a);
    g.line(6, 1, 6, 9, 2, 7, 0x6a9a5a); g.line(6, 1, 6, 3, 2, 5, 0x6a9a5a);
    g.ell(6, 8.5, 6, 3.4, 3.6, 3.4, (x, y, z) => (y > 10 ? 0xb4fff4 : 0x7adcd4), 1);
    g.set(5, 11, 5, 0xffffff, 3); g.set(4, 10, 5, 0xffffff, 2);
    return { grid: g, pivot: [6, 0.5, 6], sway: 'up', emit: { k: 'bubble', c: [0.6, 0.95, 0.9], at: [0, 0.55, 0] }, main: [0.5, 0.86, 0.82] };
  },
  crystal_lily(r, v) {
    const g = new PGrid(12, 13, 12);
    g.line(6, 0, 6, 6, 7, 6, 0x8ac0a8);
    g.line(6, 1, 6, 9, 3, 6, 0x9ad0b8); g.line(6, 2, 6, 3, 4, 7, 0x9ad0b8);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + v;
      g.line(6, 7, 6, 6 + Math.cos(a) * 3.2, 11, 6 + Math.sin(a) * 3.2, (t) => (t > 0.7 ? 0xffffff : 0xb4ecff), 2);
      g.set(6 + Math.cos(a) * 2, 9, 6 + Math.sin(a) * 2, 0xd8f6ff, 2);
    }
    g.box(6, 7, 6, 1, 2, 1, 0x60c8ff, 3);
    return { grid: g, pivot: [6, 0.5, 6], sway: 'up', light: { c: [0.5, 0.75, 1.0], r: 2.4, at: [0, 0.6, 0] }, emit: { k: 'glint', c: [0.7, 0.9, 1], at: [0, 0.6, 0], spread: 0.15 }, main: [0.7, 0.9, 1], chime: true };
  },
  gloomshroom(r, v) {
    const g = new PGrid(14, 14, 14);
    const caps = v ? 1 : 2;
    for (let i = 0; i < caps; i++) {
      const x = i ? 10 : 6, z = i ? 9 : 6, sh = i ? 5 : 8, R = i ? 2.4 : 3.6;
      g.line(x, 0, z, x + 0.5, sh, z, 0x4a3a5a);
      for (let y = sh - 2; y <= sh + 2; y++) for (let zz = z - 4; zz <= z + 4; zz++) for (let xx = x - 4; xx <= x + 4; xx++) {
        const rr = Math.hypot(xx - x, zz - z), lim = R * (1 - Math.max(0, y - sh) / 3.2);
        if (rr > lim || (y < sh && rr < R - 1)) continue;
        g.set(xx, y, zz, hv(xx, y, zz, 121) < 0.12 ? 0xc8a0e8 : y < sh ? 0x3a1a52 : 0x5a2a7a, hv(xx, y, zz, 121) < 0.12 ? 2 : 1);
      }
    }
    return { grid: g, pivot: [7, 0.5, 7], light: { c: [0.45, 0.22, 0.7], r: 1.8, at: [0, 0.4, 0] }, emit: { k: 'spore', c: [0.6, 0.45, 0.85], at: [0, 0.5, 0] }, main: [0.4, 0.2, 0.55] };
  },
  emberbloom(r, v) {
    const g = new PGrid(12, 14, 12);
    g.line(6, 0, 6, 6, 7, 6, 0x3a2a20);
    g.line(6, 2, 6, 9, 4, 6, 0x6a2a1a); g.line(6, 3, 6, 3, 5, 7, 0x6a2a1a);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + v * 0.5;
      g.line(6, 7, 6, 6 + Math.cos(a) * 2.6, 10 + (i & 1) * 2, 6 + Math.sin(a) * 2.6, (t) => (t > 0.7 ? 0xfff0a0 : t > 0.35 ? 0xffc030 : 0xff6a10), 3);
    }
    g.box(6, 8, 6, 1, 3, 1, 0xfff4c0, 3);
    return { grid: g, pivot: [6, 0.5, 6], light: { c: [1.1, 0.5, 0.15], r: 2.8, at: [0, 0.6, 0], lava: true }, emit: { k: 'ember', at: [0, 0.7, 0] }, main: [1, 0.55, 0.15] };
  },
  frostbloom(r, v) {
    const g = new PGrid(12, 12, 12);
    g.line(6, 0, 6, 6, 7, 6, 0x9ab8c8);
    g.line(6, 2, 6, 9, 3, 7, 0xa8d8e8); g.line(6, 3, 6, 3, 4, 5, 0xa8d8e8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + v * 0.3;
      g.line(6, 8, 6, 6 + Math.cos(a) * 3.4, 8 + (i & 1), 6 + Math.sin(a) * 3.4, (t) => (t > 0.75 ? 0xffffff : 0xd0f2ff), 2);
    }
    g.box(6, 8, 6, 1, 2, 1, 0x80c8ff, 3);
    return { grid: g, pivot: [6, 0.5, 6], light: { c: [0.5, 0.8, 1.0], r: 2.2, at: [0, 0.5, 0] }, emit: { k: 'glint', c: [0.8, 0.95, 1], at: [0, 0.5, 0], spread: 0.18 }, main: [0.8, 0.94, 1] };
  },
  core_lotus(r, v) {
    const g = new PGrid(16, 9, 16);
    g.ell(8, 0, 8, 6.4, 0.6, 6.4, (x, y, z) => (Math.atan2(z - 8, x - 8) > 2.6 ? -1 : hv(x, y, z, 131) < 0.3 ? 0x4a2a5a : 0x3a2048));
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 6 : 8, R = ring ? 2.6 : 4.4, H = ring ? 6.5 : 4.5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.4;
        g.line(8, 1.5, 8, 8 + Math.cos(a) * R, H, 8 + Math.sin(a) * R, (t) => (t > 0.75 ? 0xffd8ee : ring ? 0xffb0dc : 0xff7ac0), 2, 0.6);
      }
    }
    g.box(7, 2, 7, 3, 2, 3, 0xffe060, 3);
    return { grid: g, pivot: [8, 0.5, 8], light: { c: [1.1, 0.5, 0.85], r: 3.2, at: [0, 0.3, 0] }, emit: { k: 'glint', c: [1, 0.65, 0.9], at: [0, 0.35, 0], spread: 0.25 }, main: [1, 0.55, 0.8] };
  },
};

// ashfern shares the fern builder
BUILD.ashfern = (r, v) => BUILD.blindfern(r, v, 'ash');
// the old miners' lifts (cage parts, bell, plaque, counterweight, room furniture, landings)
Object.assign(BUILD, LIFT_BUILD);
// the 1/32 m set: lanterns on supports, glowing mushrooms, crates, barrels, rope coils, ore carts,
// and the commonest forage plants (glowcaps, carrots, ferns, gloomshrooms, peppers, blooms, lilies)
Object.assign(BUILD, HIRES, HIRES_PLANTS);
// one-off models built from world data (a lift's skinned cage, its lamp): defineModel(key, fn)
const CUSTOM = new Map();
BUILD.custom = (r, v, p) => (CUSTOM.get(p)?.() || { grid: new PGrid(1, 1, 1), pivot: [0, 0, 0] });
export function defineModel(key, fn) { if (!CUSTOM.has(key)) CUSTOM.set(key, fn); }
export function forgetModel(key) { CUSTOM.delete(key); cache.delete('custom:0:' + key); }

// ---------------------------------------------------------------- cache
// glassy, faceted or stringy things: AO adds little there and costs a lot of vertices
const NO_AO = new Set(['crystal', 'crystalC', 'frozen', 'icicle', 'obsidian', 'glowthread', 'roots', 'vine', 'blindfern', 'ashfern', 'whisperweed', 'rope', 'ladder', 'lantern', 'lanternC', 'shard', 'cave_carrot',
  'urn', 'coil', 'fossil', 'charred', 'vent', 'core_lotus', 'gloomshroom', 'pepperroot', 'rubber_sap', 'rail',
  'plaque', 'bell', 'bellpost', 'railing', 'deck', 'gatepost', 'lanternP']);
const cache = new Map();
/** Meshed model for (type, variant, param), cached. */
export function getModel(type, v = 0, p = 0) {
  const m = cache.get(type + ':' + v + ':' + p);
  if (m) return m;
  const it = modelSteps(type, v, p);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
/** Build + mesh a model as a generator (yields a few times so it can be spread over frames). */
export function* modelSteps(type, v = 0, p = 0) {
  const key = type + ':' + v + ':' + p;
  let m = cache.get(key);
  if (m) return m;
  let ms = 0, t0 = performance.now();
  const r = rng32(((v + 1) * 7919) ^ (typeof p === 'number' ? p * 104729 : 0) ^ hashStr(type));
  const b = BUILD[type](r, v, p);
  ms += performance.now() - t0;
  yield 'grid';
  const it = meshPropSteps(b.grid, { pivot: b.pivot, sway: b.sway, ao: b.ao ?? !NO_AO.has(type), scale: b.scale });
  let res;
  for (;;) {
    t0 = performance.now();
    res = it.next();
    ms += performance.now() - t0;
    if (res.done) break;
    yield 'mesh';
  }
  m = cache.get(key); // someone else may have finished it meanwhile
  if (m) return m;
  // packed for the props buffer: normal + sway weight as bytes, sRGB colour + glow as bytes
  const mv = res.value, n = mv.nv;
  const nrm4 = new Int8Array(n * 4), col4 = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    nrm4[i * 4] = mv.nor[i * 3]; nrm4[i * 4 + 1] = mv.nor[i * 3 + 1]; nrm4[i * 4 + 2] = mv.nor[i * 3 + 2]; nrm4[i * 4 + 3] = Math.round(mv.sw[i] * 127);
    col4[i * 4] = mv.col[i * 3]; col4[i * 4 + 1] = mv.col[i * 3 + 1]; col4[i * 4 + 2] = mv.col[i * 3 + 2]; col4[i * 4 + 3] = Math.round(Math.min(1, mv.glw[i] / 1.2) * 255);
  }
  m = { ...mv, nrm4, col4, type, v, p, light: b.light || null, emit: b.emit || null, main: b.main || [0.5, 0.45, 0.4], bob: !!b.bob, chime: !!b.chime, ms };
  cache.set(key, m);
  return m;
}
export function modelCached(type, v = 0, p = 0) { return cache.has(type + ':' + v + ':' + p); }
export function modelStats() {
  let nv = 0, ms = 0;
  for (const m of cache.values()) { nv += m.nv; ms += m.ms; }
  return { models: cache.size, verts: nv, ms: Math.round(ms) };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

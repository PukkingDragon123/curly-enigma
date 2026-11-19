// Wave 17: the "diorama" finishing pass every cave plant goes through after it is modelled (and
// the same in the fine worker, so the twice-as-fine copy is built from the finished model):
//
//   - companions at its foot (dress): a lumpy moss cushion, a few small pebbles (mossy on top),
//     fallen petals or cap crumbs in the plant's own accent colour, root fibres and baby buttons,
//     so a plant grows out of a little scene instead of standing on bare rock like a stick
//   - dew: single bright beads sitting on the top of leaves and caps
//   - baked light (bakeLight): ambient occlusion from the 26 neighbours and five sky rays, put into
//     the voxel colours in four steps that also shift the hue: cool and bluer in the shadows, warm
//     and a touch yellower where the top of the plant sees the cave roof. Glowing voxels stay lit.
//
// The grids are plain { w, h, d, data } (data: 0xRRGGBB | high bits, x + w * (y + h * z)), so the
// same pass works on ./vox.js VG (glow in bits 24-25) and gfx/Voxel.js VoxelGrid (harvestVox.js).
import { VG, tone } from './vox.js';

const RGB = 0xffffff;
/** Marks a voxel the fine pass (./fine.js) leaves plain: moss cushions and pebbles (no leaf teeth or veins). */
export const PLAIN = 1 << 26;
const c8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Hue-shifted shade: k < 1 darkens toward a cool blue-violet, k > 1 lightens toward a warm cream. */
export function hshift(c, k) {
  let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  if (k < 1) { const s = 1 - k; r = r * k * (1 - s * 0.35); g = g * k * (1 - s * 0.12); b = b * k * (1 + s * 0.35) + s * 14; }
  else { const s = k - 1; r = r * k + s * 60; g = g * k + s * 34; b = b * (1 - s * 0.4); }
  return (c8(r) << 16) | (c8(g) << 8) | c8(b);
}

// the sky rays: straight up and four 45° diagonals
const RAYS = [[0, 1, 0], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]];
const AO_K = [1, 0.84, 0.7, 0.58];

/**
 * Bake ambient occlusion and a warm/cool hue shift into a grid's colours (in place).
 * o.glowOf(v) → glow level (keeps lit voxels lit), o.flat: no sky rays (wall patches),
 * o.warm: how much the sky-lit tops warm up (0..1).
 */
export function bakeLight(G, o = {}) {
  const { w, h, d, data } = G, wh = w * h;
  const glowOf = o.glowOf || (() => 0);
  const warm = o.warm ?? 1;
  const ground = o.ground ?? !o.flat;
  const filled = (x, y, z) => (y < 0 ? ground : x >= 0 && y >= 0 && z >= 0 && x < w && y < h && z < d && data[x + w * (y + h * z)] !== 0);
  const out = new Uint32Array(data.length);
  const H8 = Math.max(4, Math.min(9, Math.round(h * 0.4)));
  for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = x + w * (y + h * z), v = data[i];
    if (!v) continue;
    const up = !filled(x, y + 1, z);
    const open = up || !filled(x - 1, y, z) || !filled(x + 1, y, z) || !filled(x, y - 1, z) || !filled(x, y, z - 1) || !filled(x, y, z + 1);
    if (!open) { out[i] = v; continue; }
    // cover from above (the row over it, and a little from its own level), then how much of the roof it sees
    let n = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (filled(x + dx, y + 1, z + dz)) n += 1;
      if ((dx || dz) && filled(x + dx, y, z + dz)) n += 0.35;
    }
    let sky = 0;
    if (!o.flat) for (const [rx, ry, rz] of RAYS) for (let k = 2; k <= H8; k++) if (filled(x + rx * k, y + ry * k, z + rz * k)) { sky += k < 4 ? 1 : 0.75; break; }
    const occ = (n / 11.8) * 0.7 + (sky / 5) * 0.6;
    let lvl = occ < 0.2 ? 0 : occ < 0.36 ? 1 : occ < 0.52 ? 2 : 3;
    const gl = glowOf(v);
    if (gl >= 2) lvl = Math.min(lvl, 1); else if (gl === 1) lvl = Math.min(lvl, 2);
    let c = v & RGB;
    if (lvl) c = hshift(c, AO_K[lvl]);
    else if (up && sky === 0 && warm > 0 && !gl && y > 1) c = hshift(c, 1 + 0.07 * warm); // the sky-lit top
    out[i] = (v & ~RGB) | c;
  }
  data.set(out);
  return G;
}

/** A copy of a VG model padded so a ring of radius R (voxels) round its pivot fits (keeps everything else). */
export function padFor(m, R, up = 0) {
  const s = m.g, [px, py, pz] = m.pivot;
  const lx = Math.max(0, Math.ceil(R + 1 - px)), hx = Math.max(0, Math.ceil(px + R + 2 - s.w));
  const lz = Math.max(0, Math.ceil(R + 1 - pz)), hz = Math.max(0, Math.ceil(pz + R + 2 - s.d));
  if (!lx && !hx && !lz && !hz && !up) return m;
  const g = new VG(s.w + lx + hx, s.h + up, s.d + lz + hz);
  for (let z = 0; z < s.d; z++) for (let y = 0; y < s.h; y++) {
    const so = s.w * (y + s.h * z), go = lx + g.w * (y + g.h * (z + lz));
    for (let x = 0; x < s.w; x++) { const v = s.data[so + x]; if (v) g.data[go + x] = v; }
  }
  return { ...m, g, pivot: [px + lx, py, pz + lz] };
}

/** The plant's accent: its commonest glowing colour, else its brightest saturated one. */
export function accentOf(g) {
  const cnt = new Map();
  let best = -1, bs = -1;
  for (let i = 0; i < g.data.length; i += 3) {
    const v = g.data[i];
    if (!v) continue;
    const c = v & RGB, r = (c >> 16) & 255, gg = (c >> 8) & 255, b = c & 255;
    if ((v >> 24) & 3) cnt.set(c, (cnt.get(c) || 0) + 1);
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sc = (mx - mn) * 1.2 + mx;
    if (sc > bs) { bs = sc; best = c; }
  }
  let top = -1, tn = 0;
  for (const [c, n] of cnt) if (n > tn) { tn = n; top = c; }
  return { col: top >= 0 ? top : best, glow: top >= 0 };
}

/**
 * Companions at a plant's foot round (cx, cz) on the ground (y = 0), between radius rIn and R:
 * o = { moss: ramp, mossN, mossGlow (speck ramp), peb: ramp, pebN, bits: [colour, n, glow],
 * roots: ramp, rootN, buttons: [ramp, n, glow], stemR: ramp, sprouts: ramp, sproutN }.
 * Only fills empty voxels (the plant wins). Moss is two voxels thick so it reads as a cushion.
 */
export function groundBits(g, r, cx, cz, rIn, R, o) {
  // (the brushes below overwrite; here nothing may: the plant's own voxels win)
  const own = Object.prototype.hasOwnProperty.call(g, 'set'), keep = g.set;
  g.set = function (x, y, z, c, gl) {
    if (this.has(x, y, z)) return;
    keep.call(this, x, y, z, c, gl);
    if (this.plain) { x = Math.round(x); y = Math.round(y); z = Math.round(z); if (this.inb(x, y, z)) this.data[x + this.w * (y + this.h * z)] |= PLAIN; }
  };
  try { bits(g, r, cx, cz, rIn, R, o); } finally { if (own) g.set = keep; else delete g.set; g.plain = false; }
}
function bits(g, r, cx, cz, rIn, R, o) {
  const TAU = Math.PI * 2;
  const spot = (k = 1) => { const a = r() * TAU, d = rIn + Math.sqrt(r()) * (R - rIn) * k; return [cx + Math.cos(a) * d, cz + Math.sin(a) * d, a]; };
  // moss cushions: lumpy, banded, a lighter crown and sometimes glowing specks
  if (o.moss) {
    const M = o.moss, n = o.mossN ?? 3;
    g.plain = true;
    for (let i = 0; i < n; i++) {
      const [x, z] = i === 0 ? [cx + (r() - 0.5) * 2, cz + (r() - 0.5) * 2] : spot(0.8);
      const rx = (i === 0 ? 0.46 : 0.24 + r() * 0.18) * R, rz = rx * (0.7 + r() * 0.5), th = i === 0 ? 2 : 1 + (r() < 0.5 ? 1 : 0);
      g.patch(x, 0, z, rx, rz, () => tone(M, 2.4), 0, i * 11 + 3, 0.34, 1);
      if (th > 1) g.patch(x, 1, z, rx * 0.62, rz * 0.62, () => tone(M, 3.8), 0, i * 11 + 4, 0.3, 1);
      // tufts: single bright tips standing out of the cushion
      for (let q = 0; q < Math.round(rx * 0.8); q++) {
        const a = r() * TAU, dd = r() * rx * 0.8, X = x + Math.cos(a) * dd, Z = z + Math.sin(a) * dd;
        const y = th;
        if (!g.has(X, y, Z) && g.has(X, y - 1, Z)) g.set(X, y, Z, o.mossGlow && r() < 0.35 ? tone(o.mossGlow, 5) : tone(M, 5.4), o.mossGlow && r() < 0.35 ? 2 : 0);
      }
    }
  }
  g.plain = true;
  // pebbles: small lumpy stones, lit on top, dark at the foot, often with moss on their crowns
  if (o.peb) for (let i = 0; i < (o.pebN ?? 2); i++) {
    const [x, z] = spot(), rr = 1 + r() * 1.3, ry = 0.8 + r() * 0.8, P = o.peb, mossy = o.moss && r() < 0.5, tint = r() * 1.2 - 0.4;
    g.blob(x, ry * 0.55, z, rr, ry, rr * (0.8 + r() * 0.4), (dx, dy, dz) => (mossy && dy > 0.45 ? tone(o.moss, 3.4) : dy > 0.35 ? tone(P, 4.6 + tint + (dx < -0.2 ? 0.8 : 0)) : dy < -0.2 ? tone(P, 1.6 + tint) : tone(P, 3.2 + tint)), 0, i * 17 + 5, 0.3);
  }
  g.plain = false;
  // fallen petals, cap crumbs or spores in the plant's colour, lying on the ground or the moss
  if (o.bits) {
    const [col, n, gl] = o.bits;
    for (let i = 0; i < n; i++) {
      const [x, z, a] = spot(0.75);
      let y = 0;
      while (y < 3 && g.has(x, y, z)) y++;
      if (y >= 3) continue;
      g.add(x, y, z, col, 0); // (a flake lying flat: two voxels along its fall)
      if (r() < 0.7) g.add(x + Math.round(Math.cos(a)), y, z + Math.round(Math.sin(a)), hshift(col, 0.86), 0);
    }
  }
  // root fibres: thin brown strands running out from the foot, half sunk in the ground
  if (o.roots) for (let i = 0; i < (o.rootN ?? 2); i++) {
    const a = r() * TAU, L = R * (0.6 + r() * 0.4), bend = (r() - 0.5) * 1.2;
    for (let k = 1; k <= L; k++) {
      const t = k / L, aa = a + bend * t, X = cx + Math.cos(aa) * (rIn * 0.5 + k), Z = cz + Math.sin(aa) * (rIn * 0.5 + k);
      if ((k + i) % 4 === 3) continue; // dips under the ground
      g.add(X, 0, Z, tone(o.roots, 2.6 + (t > 0.7 ? 1 : 0) + (k & 1) * 0.4));
    }
  }
  // baby mushroom buttons
  if (o.buttons) {
    const [C, n, gl] = o.buttons, S = o.stemR || C;
    for (let i = 0; i < n; i++) {
      const [x, z] = spot(0.9), h = 1 + (r() < 0.5 ? 1 : 0);
      let y = 0;
      while (y < 3 && g.has(x, y, z)) y++;
      for (let k = 0; k < h; k++) g.add(x, y + k, z, tone(S, 4 + k * 0.6));
      const big = r() < 0.4;
      g.add(x, y + h, z, tone(C, 4.6), gl ? 2 : 0);
      if (big) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.add(x + dx, y + h, z + dz, tone(C, dx < 0 || dz < 0 ? 4.2 : 3.2), gl ? 1 : 0);
      if (big) g.add(x, y + h + 1, z, tone(C, 5.6), gl ? 2 : 0);
    }
  }
  // sprouts: tiny two-leaf seedlings
  if (o.sprouts) for (let i = 0; i < (o.sproutN ?? 2); i++) {
    const [x, z] = spot(0.95), Sx = o.sprouts;
    let y = 0;
    while (y < 3 && g.has(x, y, z)) y++;
    const h = 2 + (r() < 0.4 ? 1 : 0);
    for (let k = 0; k < h; k++) g.add(x, y + k, z, tone(Sx, 2.5 + k * 0.5));
    const ax = r() < 0.5;
    g.add(x + (ax ? 1 : 0), y + h, z + (ax ? 0 : 1), tone(Sx, 4.6));
    g.add(x - (ax ? 1 : 0), y + h, z - (ax ? 0 : 1), tone(Sx, 3.8));
  }
}

/** Dew: n bright beads on the top of leaves and caps (a voxel above a lit top, y ≥ y0). */
export function dew(g, r, n, y0 = 3, col = 0xeafcff) {
  for (let i = 0, tries = 0; i < n && tries < n * 40; tries++) {
    const x = Math.floor(r() * g.w), z = Math.floor(r() * g.d), y = y0 + Math.floor(r() * Math.max(1, g.h - y0 - 1));
    if (!g.has(x, y, z) || g.has(x, y + 1, z) || y + 1 >= g.h) continue;
    // only on a top that has neighbours (a leaf or cap surface, not a lone stem tip)
    if (!g.has(x + 1, y, z) && !g.has(x - 1, y, z) && !g.has(x, y, z + 1) && !g.has(x, y, z - 1)) continue;
    g.set(x, y + 1, z, col, 1);
    i++;
  }
}

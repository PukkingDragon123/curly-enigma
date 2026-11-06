// The cave plants as voxel models (./vox.js): grass tufts, ferns and their giant dino cousins,
// horsetails, clover, lichen, litter, pebbles, star moss, mushrooms of every kind (clusters,
// toadstools, ink caps, tall glowing stalks, buttons, puffballs, bracket shelves on the walls),
// bioluminescent flowers (bells, lantern orbs, stars, spikes), roots, vines, moss curtains,
// mycelium threads, rime, thorn scrub, stone roses, ash weeds and void tendrils.
//
// Every builder is (r, o) → { g, pivot, mode }: a VG modelled in voxels (one voxel is 1/48–1/64 m
// once placed, Vegetation picks it per plant), its root (pivot) and how it bends ('up' standing,
// 'down' hanging, 'out' from a wall, 'flat' lying, 'none' a wall patch). Colours come from small
// hue-shifted ramps (dark → light), banded so neighbouring voxels share a colour and pack into few
// boxes; the vegetation shader lights each face by its normal, so the ramps only paint material:
// darker at the root, paler at the tips, spots, rims, glowing bits (glow 1..3).
import { VG, tone, dir8, DIR8, boxify } from './vox.js';
import { rng, ph } from './paint.js';

// ---------------------------------------------------------------- ramps (dark → light)
export const RAMP = {
  grass: [0x0f2418, 0x173a20, 0x22562a, 0x2f7431, 0x4a963a, 0x76b84a, 0xaed866],
  moss: [0x0b261f, 0x123c28, 0x1a5833, 0x24763c, 0x379848, 0x5cbe5c, 0x9ce88a],
  pale: [0x262616, 0x3a3a22, 0x52522c, 0x6e6c36, 0x8e8a46, 0xb0a85c, 0xd0c880],
  dry: [0x2a1c12, 0x46301e, 0x664828, 0x886636, 0xaa8648, 0xc8a45e, 0xe4c680],
  fern: [0x0c2216, 0x143622, 0x1d4e2e, 0x296a38, 0x3e8a42, 0x60aa50, 0x92ca6a],
  dino: [0x0f240e, 0x183a15, 0x24561c, 0x347426, 0x4c9430, 0x70b23e, 0xa2ce56],
  clover: [0x0e2a19, 0x154023, 0x1e5a2c, 0x2a7636, 0x3c9442, 0x5ab452, 0x8cd470],
  root: [0x1c1009, 0x2c1a0e, 0x422816, 0x5c3a20, 0x784e2e, 0x986a42, 0xbc9268],
  dirt: [0x1e140c, 0x2c1e12, 0x3c2a1a, 0x4e3824, 0x60482e],
  vine: [0x0b2015, 0x12341c, 0x1b4c26, 0x266830, 0x38863a, 0x58a64a, 0x88c862],
  frost: [0x1a3246, 0x284a64, 0x3c6886, 0x588caa, 0x80b2ca, 0xb2d6e8, 0xe8f8ff],
  ash: [0x0a0808, 0x141010, 0x201a18, 0x2e2622, 0x3e322c, 0x52443c, 0x685850],
  ember: [0x581404, 0x882208, 0xbe3e0c, 0xee6818, 0xff9e2e, 0xffce5e, 0xfff0b0],
  void: [0x10061c, 0x1c0b32, 0x2c134e, 0x461e78, 0x6832a6, 0x9858d6, 0xd2a6ff],
  crystal: [0x0c1c32, 0x142e4c, 0x20466c, 0x326894, 0x5090ba, 0x84bede, 0xd0f0ff],
  stem: [0x3a3040, 0x544a5a, 0x726876, 0x928896, 0xb2aab2, 0xd0caca, 0xeeeae6],
  cyan: [0x082a32, 0x0d4650, 0x146c76, 0x209ca2, 0x48ccc8, 0x92eee2, 0xdcfff6],
  violet: [0x1c0c34, 0x301452, 0x4a2076, 0x6a329e, 0x9252ca, 0xbe88ee, 0xeed6ff],
  pink: [0x340c24, 0x521438, 0x782054, 0xa63278, 0xd2549c, 0xee8ec2, 0xffd6ea],
  amber: [0x381c06, 0x582e0a, 0x82460e, 0xae6418, 0xda8c28, 0xf2b64e, 0xffe29e],
  blue: [0x0a1c3e, 0x102e5c, 0x1a4682, 0x2864ae, 0x408cd6, 0x74b6f2, 0xc6e4ff],
  brownCap: [0x24140c, 0x3a2214, 0x56341e, 0x74482a, 0x94603a, 0xb67e52, 0xd8a476],
  red: [0x3a0a0a, 0x5c1010, 0x841a16, 0xae2a20, 0xd04030, 0xe8705a, 0xfff0e0],
  ink: [0x1c1a1e, 0x2e2a30, 0x48444a, 0x6a666c, 0x908c90, 0xbab6b4, 0xe4e0da],
  pebble: [0x26221e, 0x3a3530, 0x504a44, 0x68625a, 0x827b72, 0x9e968c, 0xbcb4a8],
  succ: [0x15241f, 0x213a32, 0x2e5246, 0x426c5e, 0x60907c, 0x8ab4a0, 0xc0d8c8],
  rust: [0x3a1e0e, 0x5e3014, 0x8a4a1c, 0xb46a28, 0xd28e3c, 0xeab25a, 0xfadc8a],
};
const R = RAMP;
const band = (t, n = 4) => Math.floor(Math.min(0.999, Math.max(0, t)) * n) / (n - 1); // 0..1 in n steps

// ---------------------------------------------------------------- grasses
/**
 * A tuft of blades out of one root. o: { h (tallest blade, voxels), rad (root spread), n, min
 * (shortest blade 0..1), lean, droop, stiff, wide (2-voxel blade bases), tone, glowTip (level),
 * seeds, seedCol, specks, speckCol, speckGlow, broken (share of dry snapped blades), wall (grows
 * out of a wall: +z) }.
 */
export function tuft(r, RR, o = {}) {
  const H = o.h ?? 16, rad = o.rad ?? 2, n = o.n ?? r.int(9, 13), mn = o.min ?? 0.45;
  const reach = Math.ceil(H * (o.lean ?? 0.42) + rad + 3);
  const W = reach * 2 + 2, g = new VG(W, H + 3, o.wall ? reach + 4 : W);
  const cx = reach, cz = o.wall ? 0 : reach;
  for (let i = 0; i < n; i++) {
    // heading: all round (on a wall: out of it and to the sides)
    const a = o.wall ? (r() * 0.9 + 0.05) * Math.PI : r() * Math.PI * 2;
    const [hx, hz] = dir8(a);
    const isDiag = !!(hx && hz), diag = isDiag ? 0.7071 : 1;
    const L = Math.round(H * (mn + r() * (1 - mn)));
    const x0 = cx + Math.round((r() - 0.5) * rad * 2), z0 = cz + (o.wall ? r.int(0, 1) : Math.round((r() - 0.5) * rad * 2));
    const lean = (o.stiff ? 0.12 : 0.18) + r() * (o.lean ?? 0.42) * (o.wall ? 1.4 : 1);
    const droop = o.stiff ? 0 : (o.droop ?? 0.25) * r();
    const base = 0.4 + r() * 1.6 + (o.tone ?? 0);
    const broken = o.broken && r() < o.broken;
    const end = broken ? Math.round(L * (0.5 + r() * 0.3)) : L;
    const wide = (o.wide ?? true) && !isDiag ? 1 : 0;
    let y = 0;
    for (let k = 0; k <= end; k++) {
      const t = k / Math.max(1, L);
      // rises steeply, then leans out (and droops at the tip)
      const s = lean * L * Math.pow(t, 1.6) * diag;
      y = Math.round(k * (1 - droop * t * 0.9));
      const x = x0 + hx * s, z = z0 + hz * s;
      let c = tone(RR, base + band(t, 4) * 3.3);
      let gl = o.glowTip && t > 0.82 ? o.glowTip : 0;
      if (broken && k >= end - 1) { c = tone(R.dry, 3 + (k === end ? 1 : 0)); gl = 0; }
      g.set(x, y, z, c, gl);
      // a flat blade: two voxels wide at its foot (across its heading)
      if (wide && t < 0.3) g.set(x - hz, y, z + hx, tone(RR, base - 0.6 + band(t, 4) * 3), 0);
    }
  }
  // seed stalks: thin straight stems with a head of grains (oats, wild rye)
  for (let i = 0; i < (o.seeds || 0); i++) {
    const [hx, hz] = dir8(r() * 6.28);
    const x0 = cx + Math.round((r() - 0.5) * rad), z0 = cz + Math.round((r() - 0.5) * rad), L = Math.round(H * (0.95 + r() * 0.15)), lean = 0.1 + r() * 0.15;
    for (let k = 0; k <= L; k++) {
      const t = k / L, s = lean * L * t * t, x = x0 + hx * s, z = z0 + hz * s;
      g.set(x, k, z, tone(RR, 2 + band(t, 3) * 2));
      if (t > 0.62 && k % 2 === 0) { const sd = (k >> 1) & 1 ? 1 : -1; g.set(x + (hz ? sd : 0), k, z + (hx ? sd : 0), tone(o.seedCol || R.dry, 4 + (k & 2 ? 1 : 0)), o.seedGlow || 0); }
    }
  }
  // little lights or blossoms caught among the blades
  for (let i = 0; i < (o.specks || 0); i++) {
    for (let tries = 0; tries < 12; tries++) {
      const x = r.int(1, W - 2), y = r.int(Math.round(H * 0.3), H), z = r.int(0, g.d - 1);
      if (!g.has(x, y, z)) continue;
      g.set(x, y, z, o.speckCol ? tone(o.speckCol, 5) : 0xfff4c8, o.speckGlow ?? 0);
      if (o.speckBig) g.add(x, y + 1, z, o.speckCol ? tone(o.speckCol, 6) : 0xfff4c8, o.speckGlow ?? 0);
      break;
    }
  }
  return { g, pivot: [cx, 0, cz], mode: o.wall ? 'out' : 'up' };
}

/** Ice blades: stiff, straight, with a few crystal spikes (2×2 at the foot) and sparkles. */
function frostGrass(r) {
  const m = tuft(r, R.frost, { h: 15, n: r.int(8, 11), stiff: true, wide: false, lean: 0.3, tone: 0.4, glowTip: 1 });
  const g = m.g, [cx, , cz] = m.pivot;
  for (let i = 0; i < r.int(2, 3); i++) {
    const [hx, hz] = dir8(r() * 6.28), L = r.int(6, 11), x0 = cx + r.int(-2, 2), z0 = cz + r.int(-2, 2);
    for (let k = 0; k <= L; k++) {
      const t = k / L, s = Math.floor(t * 2.5), w = t < 0.45 ? 2 : 1;
      for (let q = 0; q < w; q++) for (let p = 0; p < w; p++) g.set(x0 + hx * s + q, k, z0 + hz * s + p, q === 0 && p === 0 ? 0xffffff : tone(R.frost, 3.5 + band(t, 3) * 2.5), t > 0.6 ? 2 : 1);
    }
  }
  for (let i = 0; i < 6; i++) { const x = r.int(2, g.w - 3), y = r.int(4, 14), z = r.int(2, g.d - 3); g.paint(x, y, z, 0xffffff, 3); }
  return m;
}

/** Glassy crystal grass: straight angular blades two voxels across, bright edges, glowing tips. */
function crystalGrass(r) {
  const H = 15, W = 22, g = new VG(W, H + 2, W), c = 11;
  for (let i = 0; i < r.int(6, 9); i++) {
    const [hx, hz] = dir8(r() * 6.28), L = r.int(6, H), lean = 0.15 + r() * 0.35, x0 = c + r.int(-2, 2), z0 = c + r.int(-2, 2), d = r();
    for (let k = 0; k <= L; k++) {
      const t = k / L, s = Math.round(lean * k), x = x0 + hx * s, z = z0 + hz * s;
      const gl = t > 0.7 ? 3 : t > 0.35 ? 1 : 0;
      g.set(x, k, z, tone(R.crystal, 1.5 + d + band(t, 3) * 3), gl);
      if (t < 0.75) g.set(x + (hz ? 1 : 0), k, z + (hx ? 1 : 0), t > 0.2 ? tone(R.crystal, 6) : tone(R.crystal, 3), gl);
    }
  }
  for (let i = 0; i < 4; i++) g.paint(r.int(2, W - 3), r.int(3, H), r.int(2, W - 3), 0xffffff, 3);
  return { g, pivot: [c, 0, c], mode: 'up' };
}

// ---------------------------------------------------------------- ferns
/**
 * One frond into g from (x0, y0, z0): heading angle a (snapped to 8 ways), length L (voxels along
 * the rachis), starting tilt from the vertical, droop (extra tilt by the tip), widest pinna pw.
 * Pinnae alternate along the rachis, straight across it (or angled toward the tip on a diagonal
 * frond), drooping at their ends; o.lobed: serrated pinnae (the giant ferns), o.wall: may not
 * cross behind the wall (z < 0).
 */
function frond(r, g, x0, y0, z0, a, L, tilt0, droop, pw, RR, o = {}) {
  const [hx, hz] = dir8(a);
  const diag = !!(hx && hz);
  const k0 = diag ? 0.7071 : 1;
  let s = 0, y = y0, tilt = tilt0;
  let side = r() < 0.5 ? 1 : -1;
  const gap = o.gap ?? 2;
  const tn = o.tone ?? 0;
  let last = -9;
  for (let k = 0; k < L; k++) {
    const t = k / L;
    y += Math.cos(tilt);
    s += Math.sin(tilt) * k0;
    tilt = Math.min(Math.PI * 0.72, tilt + (droop / L) * 0.8 * (0.5 + t));
    const x = x0 + hx * s, z = z0 + hz * s, yy = Math.round(y);
    g.set(x, yy, z, tone(RR, 1.4 + band(t, 3) * 1.6 + tn));
    if (o.rw && t < 0.35) g.set(x + (hz ? 1 : 0), yy, z + (hx ? 1 : 0), tone(RR, 1.2 + tn));
    if (t < 0.08 || k - last < gap) continue;
    last = k;
    // a pinna, widest a third of the way up
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.98)), 0.7) * (1 - t * 0.25);
    const pl = Math.max(1, Math.round(pw * env * (0.85 + r() * 0.25)));
    let px, pz;
    if (diag) { px = side > 0 ? 0 : hx; pz = side > 0 ? hz : 0; } // angled toward the tip
    else { px = -hz * side; pz = hx * side; }
    const lit = side * (hx - hz) > 0 ? 0.55 : -0.35;
    for (let v = 1; v <= pl; v++) {
      const q = v / pl, dy = q > 0.66 && pl > 2 ? -1 : 0;
      const zz = z + pz * v;
      if (o.wall && zz < 0) break;
      const c = tone(RR, 1.9 + band(t, 3) * 1.6 + (q > 0.5 ? 0.8 : 0) + lit + tn);
      g.set(x + px * v, yy + dy, zz, c);
      if (o.lobed && v > 1 && v < pl - 1 && v % 3 === 1) g.add(x + px * v + (diag ? 0 : hx), yy + dy, zz + (diag ? 0 : hz), tone(RR, 2.6 + band(t, 3) * 1.8 + lit + tn));
    }
    side = -side;
  }
  return Math.round(y);
}

/** A rosette of fronds (floor) or a fan out of a wall. o: { n, len [min, max] (voxels), tilt, droop, pw, lobed, gap, wall, tone }. */
function fern(r, RR, o = {}) {
  const Lmax = o.len[1];
  const reach = Math.ceil(Lmax * 1.05) + 3;
  const wall = !!o.wall;
  const g = new VG(reach * 2 + 1, Math.ceil(Lmax * 0.95) + 4, wall ? reach + 2 : reach * 2 + 1);
  const cx = reach, cz = wall ? 0 : reach;
  const n = r.int(o.n[0], o.n[1]);
  const a0 = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = wall ? ((i + 0.5) / n) * Math.PI + (r() - 0.5) * 0.3 : a0 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const L = Math.round(o.len[0] + r() * (o.len[1] - o.len[0]));
    const tilt = o.tilt[0] + r() * (o.tilt[1] - o.tilt[0]);
    frond(r, g, cx, wall ? 1 + r.int(0, 2) : 0, cz + (wall ? 1 : 0), a, L, tilt, o.droop * (0.8 + r() * 0.4), o.pw, RR, o);
  }
  // the crown: a tight knot of fiddleheads and old stalk bases
  if (!wall) for (let i = 0; i < 4; i++) g.set(cx + (i & 1), 0, cz + (i >> 1), tone(RR, 1));
  if (!wall && o.fiddle) { g.set(cx, 2, cz, tone(RR, 4)); g.set(cx + 1, 3, cz, tone(RR, 4)); g.set(cx + 1, 4, cz, tone(RR, 5)); g.set(cx, 4, cz, tone(RR, 3)); }
  return { g, pivot: [cx, 0, cz], mode: wall ? 'out' : 'up' };
}

/** Horsetail reeds: jointed stems with dark node bands, whorls of needles, a spore cone on top. */
function horsetail(r) {
  const H = 50, g = new VG(25, H + 6, 25), c = 12;
  const n = r.int(2, 3);
  for (let i = 0; i < n; i++) {
    const x0 = c + (i - (n - 1) / 2) * 4 + r.int(-1, 1), z0 = c + r.int(-2, 2);
    const len = Math.round(H * (i === 0 ? 0.85 + r() * 0.15 : 0.5 + r() * 0.35));
    const seg = r.int(7, 9);
    const [lx, lz] = dir8(r() * 6.28), lean = r() * 0.06;
    const xa = (k) => x0 + lx * Math.round(lean * k), za = (k) => z0 + lz * Math.round(lean * k);
    for (let k = 0; k < len; k++) {
      const t = k / len, node = k % seg === 0 && k > 0;
      const col = node ? 0x2a2814 : tone(R.dino, 3 + band(t, 3) * 1.6 + (k % seg === 1 ? 0.8 : 0));
      g.set(xa(k), k, za(k), col);
      if (t < 0.15) g.set(xa(k) + 1, k, za(k), tone(R.dino, 2.4));
      // whorls of needles at the nodes, rising a little toward their tips
      if (node && t < 0.9) {
        const nl = Math.max(2, Math.round((1 - t) * 6 + 2));
        const rot = (k / seg) & 1;
        for (let q = 0; q < 8; q += rot ? 2 : 1) {
          if (!rot && q & 1) continue;
          const [dx, dz] = DIR8[(q + rot) & 7];
          for (let v = 1; v <= nl; v++) g.set(xa(k) + dx * v, k + (v > nl * 0.6 ? 1 : 0), za(k) + dz * v, tone(R.dino, 2.6 + (v / nl) * 2));
        }
      }
    }
    // the spore cone
    const tx = xa(len), tz = za(len);
    for (let k = 0; k < 4; k++) {
      const w = k < 3 ? 1 : 0;
      for (let q = -w; q <= w; q++) for (let p = -w; p <= w; p++) if (!(q && p)) g.set(tx + q, len + k, tz + p, tone(R.amber, 2.5 + (k & 1) + (q < 0 || p < 0 ? 0.8 : 0)));
    }
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

// ---------------------------------------------------------------- ground cover (lying flat)
/** Clover: trefoils of little leaflets with a pale chevron, raised on short stems; a few pompom flowers. */
function clover(r, o = {}) {
  const W = 19, g = new VG(W, 5, W), c = 9;
  const n = r.int(7, 10);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * 7, x = c + Math.cos(a) * d, z = c + Math.sin(a) * d, y = r() < 0.45 ? 2 : 1;
    const rot = r() * 6.28, base = 2.2 + r() * 1.4;
    for (let k = 0; k < y; k++) g.set(x, k, z, tone(R.clover, 1.5));
    for (let q = 0; q < 3; q++) {
      const la = rot + q * 2.094, lx = x + Math.cos(la) * 1.5, lz = z + Math.sin(la) * 1.5;
      g.patch(lx, y, lz, 1.25, 1.25, (dx, dz, X, Z, rim) => tone(R.clover, base + (rim ? -0.6 : 0.4) + (-dx - dz) * 0.4), 0, i * 3 + q, 0.15);
      g.set(x + Math.cos(la) * 1.2, y, z + Math.sin(la) * 1.2, tone(R.clover, base + 1.8)); // the chevron
    }
  }
  for (let i = 0; i < (o.flowers ?? r.int(1, 2)); i++) {
    const x = c + r.int(-5, 5), z = c + r.int(-5, 5);
    const fc = o.flowerRamp || (r() < 0.6 ? [0x8a7a86, 0xb8a8b4, 0xe2d8de, 0xfff6fa] : [0x7a3a5a, 0xb05a82, 0xe08ab0, 0xffc8e0]);
    for (let k = 0; k < 3; k++) g.set(x, k, z, tone(R.clover, 2));
    g.blob(x, 3.4, z, 1.1, 0.9, 1.1, (dx, dy) => fc[dy > 0 ? 3 : dx < 0 ? 2 : 1], o.flowerGlow || 0, i + 5, 0.1);
  }
  return { g, pivot: [c, 0, c], mode: 'flat' };
}

/** Lichen rosettes: lobed mats, pale crinkled rims, dark hearts, a few bright specks. */
function lichen(r, RR, o = {}) {
  const W = 19, g = new VG(W, 3, W), c = 9;
  for (let i = 0; i < r.int(3, 5); i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * 5, x = c + Math.cos(a) * d, z = c + Math.sin(a) * d, rad = 2 + r() * 2.2;
    g.patch(x, 0, z, rad, rad * (0.8 + r() * 0.4), (dx, dz, X, Z, rim) => (rim ? tone(RR, 4.6) : Math.hypot(dx, dz) < 0.45 ? tone(RR, 1.6) : tone(RR, 3)), 0, i * 7 + 1, 0.32);
    // crinkled lobes stand up a voxel round the rim
    for (let q = 0; q < 6; q++) { const la = q * 1.05 + r() * 0.4; g.set(x + Math.cos(la) * rad * 0.8, 1, z + Math.sin(la) * rad * 0.8, tone(RR, 5)); }
  }
  for (let i = 0; i < 6; i++) { const x = r.int(2, W - 3), z = r.int(2, W - 3); if (g.has(x, 0, z)) g.set(x, 1, z, o.speck ?? 0xe8fbff, o.glow ?? 2); }
  return { g, pivot: [c, 0, c], mode: 'flat' };
}

/** Fallen leaves curling at their tips and a twig. */
function litter(r) {
  const W = 21, g = new VG(W, 4, W), c = 10;
  const cols = [R.root, R.amber, R.dry, R.dino];
  const [tx, tz] = dir8(r() * 6.28);
  for (let k = -7; k <= 7; k++) g.set(c + tx * k * 0.75, 0, c + tz * k * 0.75, tone(R.root, 2 + ((k >> 1) & 1)));
  for (let i = 0; i < r.int(7, 10); i++) {
    const RR = cols[Math.floor(r() * cols.length)];
    const a = r() * 6.28, d = Math.sqrt(r()) * 6.5, [hx, hz] = dir8(r() * 6.28);
    g.leaf(c + Math.cos(a) * d, i & 1 ? 1 : 0, c + Math.sin(a) * d, hx, hz, r.int(3, 5), r.int(2, 3), 0, RR, 1.6 + r() * 1.5, 0, -0.35);
  }
  return { g, pivot: [c, 0, c], mode: 'flat' };
}

/** Pebbles and grit on a bare floor: small lumpy stones of a few shades. */
function pebbles(r, RR = R.pebble) {
  const W = 19, g = new VG(W, 5, W), c = 9;
  for (let i = 0; i < r.int(7, 11); i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * 7, rr = i < 3 ? 1.6 + r() * 1.1 : 0.8 + r() * 0.9;
    const base = 2 + r() * 2.2;
    g.blob(c + Math.cos(a) * d, rr * 0.55, c + Math.sin(a) * d, rr, rr * (0.6 + r() * 0.35), rr * (0.75 + r() * 0.3), (dx, dy) => tone(RR, base + (dy > 0.3 ? 0.8 : 0)), 0, i * 13 + 2, 0.28);
  }
  for (let i = 0; i < 9; i++) g.add(r.int(2, W - 3), 0, r.int(2, W - 3), tone(RR, r.int(1, 3))); // grit
  return { g, pivot: [c, 0, c], mode: 'flat' };
}

/** Star moss of the Core: a dark velvet mat with glowing star specks raised out of it. */
function starMoss(r) {
  const W = 19, g = new VG(W, 3, W), c = 9;
  for (let i = 0; i < 5; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * 4.5;
    g.patch(c + Math.cos(a) * d, 0, c + Math.sin(a) * d, 2.5 + r() * 2, 2.5 + r() * 2, (dx, dz, X, Z, rim) => tone(R.void, rim ? 2.4 : 1.4), 0, i * 5 + 3, 0.3);
  }
  for (let i = 0; i < 14; i++) {
    const x = r.int(2, W - 3), z = r.int(2, W - 3);
    if (!g.has(x, 0, z)) continue;
    const big = r() < 0.3;
    g.set(x, 1, z, big ? 0xffffff : tone(R.void, 6), 3);
    if (big) { g.set(x + 1, 0, z, tone(R.void, 5), 2); g.set(x, 0, z + 1, tone(R.void, 5), 2); }
  }
  return { g, pivot: [c, 0, c], mode: 'flat' };
}

// ---------------------------------------------------------------- fungus
/**
 * A mushroom into g at (x, 0, z): stem height sh, cap radius cr (voxels), shape. Bulb at the foot,
 * a ring under the big caps, gills under the rim, spots. o as fungus().
 */
function shroom(r, g, x, z, sh, cr, shape, CAP, STEM, o, d, seed) {
  const sw = cr >= 4 ? 2 : 1;
  const [lx, lz] = dir8(r() * 6.28), lean = (o.lean ?? 0.14) * r();
  const at = (k) => [x + lx * Math.round(lean * k), z + lz * Math.round(lean * k)];
  let tx = x, tz = z;
  for (let k = 0; k <= sh; k++) {
    const t = k / sh, [xx, zz] = at(k);
    tx = xx; tz = zz;
    const col = tone(STEM, 2.4 + band(t, 3) * 1.5 + d * 0.4);
    for (let q = 0; q < sw; q++) for (let p = 0; p < sw; p++) g.set(xx + q, k, zz + p, q === 0 && p === 0 ? tone(STEM, 3.4 + band(t, 3)) : col);
  }
  if (sw > 1) for (const [q, p] of [[-1, 0], [2, 0], [0, -1], [0, 2], [1, -1], [1, 2], [-1, 1], [2, 1]]) g.set(x + q, 0, z + p, tone(STEM, 2)); // the bulb
  if (cr >= 4) { const yr = Math.round(sh * 0.72), [rx, rz] = at(yr); for (const [q, p] of [[-1, 0], [2, 1], [0, 2], [1, -1]]) g.set(rx + q, yr, rz + p, tone(STEM, 4.5)); } // the ring
  const cx = tx + (sw - 1) / 2, cz = tz + (sw - 1) / 2;
  const capH = shape === 'cone' ? cr * 1.2 : shape === 'flat' ? Math.max(1.6, cr * 0.42) : cr * 0.95;
  const gl = o.glow ?? 2;
  const spots = o.spots ?? 0.1;
  g.cap(cx, sh + 1, cz, cr, capH, shape, (h, dd, X, Y, Z, rim) => {
    if (h > 0.2 && !rim && ph(X * 7 + Z, Y, seed) < spots) return o.spotCol ?? tone(CAP, 6);
    if (rim) return tone(CAP, 3.6 + (h > 0.5 ? 1 : 0));
    return tone(CAP, 2.5 + band(h, 3) * 1.8 + d * 0.5);
  }, (h, dd) => (gl ? (dd > 0.85 ? gl : gl - 1) : 0), seed, gl ? tone(CAP, 2) : tone(CAP, 1));
  if (o.spotGlow) for (let i = 0; i < 3; i++) g.paint(cx + r.int(-1, 1), sh + 1 + Math.ceil(capH) - 1, cz + r.int(-1, 1), o.spotCol ?? tone(CAP, 6), o.spotGlow);
}

/**
 * A cluster of mushrooms: one big one and a few small ones round it. o: { n, shape, glow, big
 * (× cap radius), spots, spotCol, spotGlow, tall (big stem height, voxels [min, max]), h (small
 * stems), cr (big cap radius [min, max]) }.
 */
export function fungus(r, CAP, STEM = R.stem, o = {}) {
  const n = o.n ?? r.int(3, 5);
  const crB = o.cr ?? [3.5, 4.8];
  const W = 25, g = new VG(W, (o.tall ? o.tall[1] : 10) + 12, W), c = 12;
  const ms = [];
  for (let i = 0; i < n; i++) {
    const big = i === 0;
    const a = r() * 6.28, dd = big ? r() * 1.5 : 3.5 + r() * 5.5;
    ms.push({
      x: Math.round(c + Math.cos(a) * dd), z: Math.round(c + Math.sin(a) * dd),
      sh: big ? r.int(...(o.tall || [6, 9])) : r.int(o.h?.[0] ?? 2, o.h?.[1] ?? 5),
      cr: (big ? crB[0] + r() * (crB[1] - crB[0]) : 1.6 + r() * 1.6) * (o.big ?? 1),
      shape: o.shape || r.pick(['dome', 'dome', 'cone', 'flat']), d: big ? 0.45 : r(),
    });
  }
  ms.forEach((m, i) => shroom(r, g, m.x, m.z, m.sh, m.cr, m.shape, CAP, STEM, o, m.d, 17 + i * 31 + (r() * 1000 | 0)));
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** Pale puffballs huddled on the ground, warty. */
function puffballs(r) {
  const W = 17, g = new VG(W, 8, W), c = 8;
  for (let i = 0; i < r.int(3, 5); i++) {
    const a = r() * 6.28, d = i ? 2.5 + r() * 3.5 : 0, rr = i ? 1.2 + r() * 1 : 2.2 + r() * 0.8;
    g.blob(c + Math.cos(a) * d, rr * 0.85, c + Math.sin(a) * d, rr, rr * 0.88, rr, (dx, dy, dz, X, Y, Z) => tone(R.stem, 3.4 + (dy > 0.35 ? 1 : 0) + (ph(X * 3 + Z, Y, 7) < 0.12 && dy > -0.2 ? 1.4 : 0)), (dx, dy) => (dy > 0.5 ? 1 : 0), i * 11 + 4, 0.18);
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** Bracket fungi on a wall: shelves standing out of the rock in a little stack, a few buttons. */
function bracket(r, CAP, o = {}) {
  const g = new VG(17, 14, 8), cx = 8;
  for (let i = 0; i < r.int(2, 4); i++) {
    const y = 1 + i * 3 + r.int(0, 1), x = cx + r.int(-4, 4), R0 = 2.4 + r() * 2.2 - i * 0.3, out = R0 * (0.75 + r() * 0.2);
    g.patch(x, y, 0, R0, out, (dx, dz, X, Z, rim) => (dz < 0 ? -1 : rim ? tone(CAP, 4.4) : tone(CAP, 2.6 + (dz > 0.5 ? 0.8 : 0))), (o.glow ?? 0), i * 9 + 2, 0.22, 1);
    g.patch(x, y - 1, 0, R0 * 0.8, out * 0.75, (dx, dz) => (dz < 0 ? -1 : tone(CAP, 1)), 0, i * 9 + 3, 0.2, 1); // the gills under it
  }
  return { g, pivot: [cx, 0, 0], mode: 'out' };
}

/** Little mushrooms growing out of a wall and curling up. */
function wallShrooms(r, CAP, o = {}) {
  const g = new VG(15, 14, 8), cx = 7;
  for (let i = 0; i < r.int(3, 5); i++) {
    const x = cx + r.int(-5, 5), y0 = r.int(0, 5), out = r.int(2, 4), up = r.int(2, 4);
    g.strand([x, y0, 0], [x, y0, out], [x, y0 + up, out], 1, 1, (t) => tone(R.stem, 2.5 + t * 1.5));
    g.cap(x, y0 + up + 1, out, 1.4 + r() * 0.9, 1.5, 'dome', (h, d, X, Y, Z, rim) => (rim ? tone(CAP, 4) : tone(CAP, 2.6 + h)), o.glow ?? 2, i * 5 + 1, tone(CAP, 1));
  }
  return { g, pivot: [cx, 0, 0], mode: 'out' };
}

// ---------------------------------------------------------------- flowers
/**
 * A bioluminescent flower on a slim stem: 'bell' (a drooping glowing bell), 'orb' (a lantern
 * bulb), 'star' (open petals round a bright heart) or 'spike' (a spire of little florets).
 */
function flower(r, PET, kind = 'bell', o = {}) {
  const H = o.h ?? 20, W = 17, g = new VG(W, H + 6, W), c = 8;
  const SR = o.stem || R.fern;
  for (let i = 0; i < r.int(2, 3); i++) {
    const [hx, hz] = dir8(r() * 6.28);
    g.leaf(c, i * 2, c, hx, hz, r.int(4, 6), 3, 0.45, SR, 1.6);
  }
  const [lx, lz] = dir8(r() * 6.28), lean = r() * 2.2;
  const top = [c + lx * Math.round(lean), H, c + lz * Math.round(lean)];
  if (kind === 'bell') {
    // the stem arches over and the bell hangs off its end
    const hx = top[0] + lx * 3, hz = top[2] + lz * 3;
    g.strand([c, 0, c], [c, H * 0.8, c], [top[0], top[1] + 1, top[2]], 1, 1, (t) => tone(SR, 2 + band(t, 3) * 2));
    g.line(top[0], top[1] + 1, top[2], hx, top[1], hz, tone(SR, 3.5));
    for (let yy = 0; yy < 5; yy++) {
      const rr = 0.6 + yy * 0.45 + (yy === 4 ? 0.4 : 0), y = top[1] - 1 - yy;
      g.patch(hx, y, hz, rr, rr, (dx, dz, X, Z, rim) => tone(PET, 3 + (1 - yy / 4) * 1.2 + (rim && yy === 4 ? 1.5 : 0) - (dx > 0.3 ? 0.6 : 0)), yy > 2 ? 3 : 2, 50 + yy, 0.12);
    }
    g.set(hx, top[1] - 6, hz, tone(PET, 6), 3); // the glowing heart
  } else {
    g.strand([c, 0, c], [c + (top[0] - c) * 0.3, H * 0.5, c + (top[2] - c) * 0.3], top, 1, 1, (t) => tone(SR, 2 + band(t, 3) * 2));
    const [x, y, z] = top;
    if (kind === 'orb') {
      g.blob(x, y + 2.4, z, 1.9, 2.3, 1.9, (dx, dy) => tone(PET, 4.2 + (dy > 0.4 ? 1 : 0) - (dx > 0.4 ? 0.8 : 0)), (dx, dy, dz) => (dx * dx + dy * dy + dz * dz < 0.4 ? 3 : 2), 71, 0.12);
      g.paint(x - 1, y + 4, z, 0xffffff, 3);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(x + dx, y + 1, z + dz, tone(SR, 3.5)); // bracts holding it
    } else if (kind === 'star') {
      for (let i = 0; i < 8; i += r() < 0.3 ? 1 : 2) {
        const [dx, dz] = DIR8[i];
        for (let v = 1; v <= 3; v++) g.set(x + dx * v, y + (v === 3 ? 1 : 0), z + dz * v, tone(PET, 3 + v * 0.7), v > 1 ? 3 : 2);
      }
      g.set(x, y, z, tone(PET, 6), 3); g.set(x, y + 1, z, tone(PET, 5), 3);
    } else {
      // spike: florets up the top third
      for (let k = 0; k < 7; k++) {
        const yy = y - 3 + k, sd = k & 1 ? 1 : -1, t = k / 6;
        g.set(x, yy, z, tone(SR, 3));
        g.set(x + (k % 4 < 2 ? sd : 0), yy, z + (k % 4 < 2 ? 0 : sd), tone(PET, 3 + t * 2.5), t > 0.5 ? 3 : 2);
      }
      g.set(x, y + 4, z, tone(PET, 6), 3);
    }
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

// ---------------------------------------------------------------- hanging things (root at the top)
/** Roots through the ceiling: a clod of earth, wandering strands with hairs and pale tips. */
function roots(r, o = {}) {
  const L = o.len, W = 17, g = new VG(W, L + 4, W), c = 8, top = L + 3;
  const todo = [];
  for (let i = 0; i < (o.n ?? r.int(3, 5)); i++) todo.push({ x: c + r.int(-3, 3), z: c + r.int(-3, 3), y: top - 2, len: Math.round(L * (i === 0 ? 0.85 + r() * 0.15 : 0.35 + r() * 0.6)), w: i < 2 ? 2 : 1, vx: (r() - 0.5) * 0.25, vz: (r() - 0.5) * 0.25, gen: 0 });
  while (todo.length) {
    const T = todo.pop();
    let { x, z, vx, vz } = T;
    for (let k = 0; k < T.len; k++) {
      vx = Math.max(-0.35, Math.min(0.35, vx + (r() - 0.5) * 0.12));
      vz = Math.max(-0.35, Math.min(0.35, vz + (r() - 0.5) * 0.12));
      x = Math.max(1, Math.min(W - 2, x + vx)); z = Math.max(1, Math.min(W - 2, z + vz));
      const y = T.y - k, t = k / T.len;
      const col = t > 0.9 ? tone(R.root, 5.5) : tone(R.root, 2.4 + band(t, 3) * 1.6);
      g.set(x, y, z, col);
      if (T.w > 1 && t < 0.45) g.set(x + 1, y, z, tone(R.root, 2));
      if (t > 0.15 && t < 0.9 && r() < 0.05) { const [hx, hz] = dir8(r() * 6.28), hl = r.int(1, 3); for (let q = 1; q <= hl; q++) g.set(x + hx * q, y - q, z + hz * q, tone(R.root, 4.5)); }
      if (T.gen < 2 && t > 0.1 && t < 0.6 && r() < 0.025) todo.push({ x, z, y, len: Math.round((T.len - k) * (0.4 + r() * 0.4)), w: 1, vx: vx + (r() - 0.5) * 0.6, vz: vz + (r() - 0.5) * 0.6, gen: T.gen + 1 });
    }
  }
  // the clod of earth they come out of
  g.blob(c, top - 0.5, c, 4.2, 1.6, 3.6, (dx, dy, dz, X, Y, Z) => tone(R.dirt, 2.4 + (dy > 0 ? 0.6 : -0.4) - (ph(X, Y * 3 + Z, 5) < 0.3 ? 1 : 0)), 0, 3, 0.3);
  return { g, pivot: [c, top + 1, c], mode: 'down' };
}

/** Hanging vines: a wandering stem with alternate leaves, curling tendrils, glowing berries. */
function vine(r, o = {}) {
  const L = o.len, W = 19, g = new VG(W, L + 4, W), c = 9, top = L + 3;
  const LR = o.leaf || R.vine;
  const n = o.n ?? r.int(1, 2);
  for (let i = 0; i < n; i++) {
    const x0 = c + (i ? r.int(-4, 4) : r.int(-1, 1)), z0 = c + (i ? r.int(-3, 3) : 0), p0 = r() * 6.28;
    const len = Math.round(L * (i ? 0.45 + r() * 0.35 : 0.85 + r() * 0.15));
    const ax = 1.5 + r() * 1.5, az = 1 + r() * 1.2;
    const xa = (k) => x0 + Math.sin(k * 0.08 + p0) * ax, za = (k) => z0 + Math.sin(k * 0.06 + p0 * 1.7) * az;
    for (let k = 0; k < len; k++) g.set(xa(k), top - 1 - k, za(k), tone(LR, 1.4 + band(k / len, 3)));
    let side = r() < 0.5 ? 1 : -1;
    for (let k = r.int(3, 5); k < len - 2; k += r.int(4, 6)) {
      const x = Math.round(xa(k)), y = top - 1 - k, z = Math.round(za(k)), t = k / len;
      const [hx, hz] = dir8((side > 0 ? 0 : Math.PI) + (r() - 0.5) * 1.6);
      g.leaf(x + hx, y, z + hz, hx, hz, Math.round((3 + r() * 2) * (1 - t * 0.3)), 2 + (r() < 0.5 ? 1 : 0), -0.25, LR, 1.8 + (side > 0 ? -0.3 : 0.4), o.leafGlow || 0, 0.2);
      if (r() < 0.15) { g.set(x - hx, y - 1, z - hz, tone(LR, 4)); g.set(x - hx * 2, y - 2, z - hz * 2, tone(LR, 4)); g.set(x - hx * 2, y - 3, z - hz, tone(LR, 3)); }
      if (o.berry && r() < (o.berryP ?? 0.3)) {
        const bx = x - hx, bz = z - hz;
        for (const [dx, dy, dz] of [[0, -1, 0], [1, -2, 0], [0, -2, 1], [0, -3, 0]]) g.set(bx + dx, y + dy, bz + dz, tone(o.berry, dy === -1 ? 6 : 4.5 + dx * 0.5), 3);
      }
      side = -side;
    }
    g.set(xa(len), top - 1 - len, za(len), tone(LR, 5)); // a bud at the tip
  }
  // the moss tuft it hangs from
  g.patch(c, top, c, 3.5, 2.6, (dx, dz, X, Z, rim) => tone(R.moss, rim ? 3 : 2), 0, 9, 0.3);
  return { g, pivot: [c, top + 1, c], mode: 'down' };
}

/** A curtain of moss off a ledge: a dense mat and ragged strands of uneven length. */
function mossDrape(r, o = {}) {
  const L = o.len, W = 23, g = new VG(W, L + 4, 9), top = L + 3;
  const RR = o.ramp || R.moss;
  for (let x = 2; x < W - 2; x++) {
    if (r() < 0.3) continue;
    const edge = Math.min(x - 2, W - 3 - x) / (W / 2);
    const len = Math.max(2, Math.round((L - 3) * Math.min(1, edge * 1.6 + 0.15) * (0.25 + r() * 0.75)));
    let z = 4 + r.int(-1, 1), xx = x;
    for (let k = 0; k < len; k++) {
      if (r() < 0.08) xx += r() < 0.5 ? -1 : 1;
      if (r() < 0.06) z += r() < 0.5 ? -1 : 1;
      const t = k / len;
      g.set(xx, top - 2 - k, z, tone(RR, 2.2 + band(t, 3) * 1.8 - (x & 1) * 0.5), o.glowTip && t > 0.85 ? o.glowTip : 0);
    }
  }
  g.patch(W / 2, top - 1, 4, W / 2 - 1.5, 3.2, (dx, dz, X, Z, rim) => tone(RR, rim ? 3.2 : 2.2), 0, 31, 0.2, 2);
  return { g, pivot: [W >> 1, top + 1, 4], mode: 'down' };
}

/** Mycelium threads: pale glowing filaments with beads and a drop at the end. */
function mycel(r, o = {}) {
  const L = o.len, W = 13, g = new VG(W, L + 3, W), c = 6, top = L + 2;
  const RR = o.ramp || R.violet;
  for (let i = 0; i < r.int(4, 6); i++) {
    const x0 = c + r.int(-4, 4), z0 = c + r.int(-4, 4), len = Math.round(L * (0.3 + r() * 0.7)), p0 = r() * 6;
    let lastBead = 0, x = x0;
    for (let k = 0; k < len; k++) {
      x = x0 + Math.sin(k * 0.1 + p0) * 1.2;
      g.set(x, top - 1 - k, z0, tone(RR, 4.4 + (k & 2 ? 0.6 : 0)), 1);
      if (k - lastBead > 6 && r() < 0.12) { lastBead = k; g.set(x, top - 1 - k, z0, 0xffffff, 3); g.set(x + 1, top - 1 - k, z0, tone(RR, 6), 3); }
    }
    g.set(x, top - 1 - len, z0, tone(RR, 6), 3); g.set(x, top - 2 - len, z0, 0xffffff, 3); // the drop
  }
  g.patch(c, top, c, 4, 4, (dx, dz, X, Z, rim) => tone(RR, rim ? 3 : 2), 1, 13, 0.3);
  return { g, pivot: [c, top + 1, c], mode: 'down' };
}

/** Frost fringe: a row of icicles off a rimed ledge, tapering from 2×2 to one voxel. */
function rime(r, o = {}) {
  const L = o.len, W = 21, g = new VG(W, L + 3, 7), top = L + 2;
  for (let i = 0; i < r.int(6, 9); i++) {
    const x = r.int(2, W - 4), z = r.int(2, 3), len = Math.round(L * (0.2 + r() * 0.8));
    for (let k = 0; k < len; k++) {
      const t = k / len, w = t < 0.4 && len > 5 ? 2 : 1;
      for (let q = 0; q < w; q++) for (let p = 0; p < w; p++) g.set(x + q, top - 1 - k, z + p, q + p === 0 ? 0xffffff : tone(R.frost, 4.2 + band(t, 3)), t > 0.85 ? 3 : 1);
    }
  }
  g.patch(W / 2, top, 3, W / 2 - 1, 2.6, (dx, dz, X, Z, rim) => tone(R.frost, rim ? 6 : 4.5), 1, 17, 0.2);
  return { g, pivot: [W >> 1, top + 1, 3], mode: 'down' };
}

/** Void tendrils hanging (or standing): curling glowing filaments ending in a little spiral. */
function tendrils(r, o = {}) {
  const L = o.len, W = 17, g = new VG(W, L + 8, W), c = 8;
  const hang = !!o.hang, top = L + 7;
  const Y = (k) => (hang ? top - 1 - k : k);
  for (let i = 0; i < r.int(3, 4); i++) {
    const x0 = c + r.int(-3, 3), z0 = c + r.int(-3, 3), len = Math.round(L * (0.45 + r() * 0.55)), p0 = r() * 6, amp = 1.5 + r() * 2;
    let x = x0, z = z0;
    for (let k = 0; k < len; k++) {
      const t = k / len;
      x = x0 + Math.sin(k * 0.1 + p0) * amp * t; z = z0 + Math.cos(k * 0.08 + p0) * amp * 0.6 * t;
      g.set(x, Y(k), z, tone(R.void, 2 + band(t, 3) * 3), t > 0.6 ? 2 : t > 0.3 ? 1 : 0);
      if (t < 0.25) g.set(x + 1, Y(k), z, tone(R.void, 1.5));
    }
    // the spiral at the end
    const dir = r() < 0.5 ? 1 : -1;
    for (let a = 0; a < 9; a += 0.4) {
      const rr = 2.6 * (1 - a / 9);
      g.set(x + dir * (Math.cos(a) * rr - rr), Y(len + Math.sin(a) * rr), z, tone(R.void, 5 + a / 9), a > 6 ? 3 : 2);
    }
  }
  return hang ? { g, pivot: [c, top + 1, c], mode: 'down' } : { g, pivot: [c, 0, c], mode: 'up' };
}

// ---------------------------------------------------------------- dry, hot and strange
/** Dead thorn scrub: forking grey twigs with thorns and a few shrivelled leaves. */
function thorn(r) {
  const W = 29, g = new VG(W, 20, W), c = 14;
  const TR = [0x1e1814, 0x2e2620, 0x40362e, 0x56493e, 0x6e5e50, 0x8c7a68];
  const grow = (x, y, z, a, up, len, d) => {
    const [hx, hz] = dir8(a), k0 = hx && hz ? 0.7071 : 1;
    const x1 = x + hx * len * Math.sqrt(1 - up * up) * k0, y1 = y + len * up, z1 = z + hz * len * Math.sqrt(1 - up * up) * k0;
    g.line(x, y, z, x1, y1, z1, (t) => tone(TR, 2.5 + band(t, 2)));
    for (let k = 2; k < len; k += 3) if (r() < 0.4) { const t = k / len; g.set(x + (x1 - x) * t + hz, y + (y1 - y) * t, z + (z1 - z) * t - hx, tone(TR, 4.5)); }
    if (d >= 2 || len < 3) { if (r() < 0.5) g.set(x1, y1 + 1, z1, tone(R.dry, 3)); return; }
    const k = r.int(2, 3);
    for (let i = 0; i < k; i++) grow(x1, y1, z1, a + (i - (k - 1) / 2) * (0.7 + r() * 0.6), Math.max(0.2, up - 0.1 - r() * 0.25), len * (0.55 + r() * 0.2), d + 1);
  };
  for (let i = 0; i < r.int(3, 4); i++) grow(c + r.int(-2, 2), 0, c + r.int(-2, 2), r() * 6.28, 0.75 + r() * 0.2, 6 + r() * 3, 0);
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** A stone rose: a tight rosette of fleshy dusty leaves with blushing tips round a bud. */
function stoneRose(r) {
  const W = 19, g = new VG(W, 9, W), c = 9;
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 8; i++) {
    const [hx, hz] = DIR8[(i + ring) & 7];
    if (ring && i & 1) continue;
    const L = ring ? 3 : 5 + r.int(0, 2), y = ring ? 2 : 0;
    for (let u = 0; u <= L; u++) {
      const t = u / L, w = u > 0 && u < L ? 1 : 0, yy = y + Math.round(t * t * (ring ? 3 : 2.4));
      const col = t > 0.8 ? tone(R.pink, 4 - (u === L ? 0 : 1)) : tone(R.succ, 2.2 + band(t, 3) * 2 - ring * 0.4);
      g.set(c + hx * u, yy, c + hz * u, col);
      g.set(c + hx * u, yy + 1, c + hz * u, col);
      if (w) g.set(c + hx * u - hz, yy, c + hz * u + hx, tone(R.succ, 2 + band(t, 3) * 1.5));
    }
  }
  g.blob(c, 3, c, 1.4, 1.8, 1.4, (dx, dy) => tone(R.succ, 4.5 + (dy > 0.3 ? 0.8 : 0)), 0, 41, 0.15);
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** Ash weed: jagged charcoal stems, ragged side leaves, glowing ember pods at the tips. */
function ashWeed(r) {
  const W = 23, g = new VG(W, 28, W), c = 11;
  for (let i = 0; i < r.int(2, 3); i++) {
    let x = c + r.int(-2, 2), y = 0, z = c + r.int(-2, 2);
    const len = 12 + r() * 12, segs = r.int(3, 5), [lx, lz] = dir8(r() * 6.28), lean = 0.1 + r() * 0.3;
    for (let k = 1; k <= segs; k++) {
      const t = k / segs;
      const nx = c + lx * lean * len * t + r.int(-1, 1), ny = Math.round(len * t), nz = c + lz * lean * len * t + r.int(-1, 1);
      g.line(x, y, z, nx, ny, nz, tone(R.ash, 3 + band(t, 3) * 2));
      if (k < segs && r() < 0.7) {
        const [hx, hz] = dir8(r() * 6.28), ll = r.int(2, 4);
        g.line(nx, ny, nz, nx + hx * ll, ny + Math.round(ll * 0.6), nz + hz * ll, tone(R.ash, 4));
        if (r() < 0.5) g.blob(nx + hx * ll, ny + ll * 0.6 + 1, nz + hz * ll, 0.9, 0.9, 0.9, (dx, dy) => tone(R.ember, 4 + (dy > 0 ? 1 : 0)), 2, k * 7 + i, 0.1);
      }
      x = nx; y = ny; z = nz;
    }
    g.blob(x, y + 1.6, z, 1.4, 1.8, 1.4, (dx, dy) => tone(R.ember, 4.2 + (dy > 0.3 ? 1.2 : 0) - (dx > 0.4 ? 0.6 : 0)), (dx, dy, dz) => (dx * dx + dy * dy + dz * dz < 0.4 ? 3 : 2), 60 + i, 0.15);
    g.set(x, y + 5, z, tone(R.ember, 6), 3); // a spark lifting off
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

// ---------------------------------------------------------------- wall patches
/** A flat patch builder turned to lie on a wall (x along the wall, y up, z out of the rock). */
function onWall(m) {
  const s = m.g, g = new VG(s.w, s.d, s.h);
  for (let z = 0; z < s.d; z++) for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const v = s.data[x + s.w * (y + s.h * z)];
    if (v) g.data[x + g.w * (z + g.h * y)] = v;
  }
  return { g, pivot: [m.pivot[0], m.pivot[2], 0], mode: 'none' };
}

// ---------------------------------------------------------------- the library
/** Model builders by name: (r) → { g, pivot, mode }. A name may take one variant painter per call. */
export const MODELS = {
  grass: (r) => tuft(r, R.grass, { h: 15, tone: -0.35, specks: r() < 0.4 ? 2 : 0 }),
  grassTall: (r) => tuft(r, R.grass, { h: 27, n: r.int(10, 13), min: 0.35, droop: 0.35, seeds: r.int(1, 2), seedCol: R.dry }),
  mossGrass: (r) => tuft(r, R.moss, { h: 14, glowTip: r() < 0.5 ? 1 : 0, specks: r.int(1, 3), speckCol: R.cyan, speckGlow: 3 }),
  paleGrass: (r) => tuft(r, R.pale, { h: 14, n: r.int(7, 10), min: 0.3, broken: 0.2 }),
  dryGrass: (r) => tuft(r, R.dry, { h: 15, n: r.int(8, 11), broken: 0.35, seeds: r.int(1, 2), droop: 0.35 }),
  frostGrass,
  crystalGrass,
  ashGrass: (r) => tuft(r, R.ash, { h: 12, n: r.int(6, 8), broken: 0.4, tone: 1, specks: 3, speckCol: R.ember, speckGlow: 3 }),
  voidGrass: (r) => tuft(r, R.void, { h: 14, n: r.int(7, 10), stiff: true, glowTip: 3, tone: 0.6 }),
  fungusGrass: (r) => tuft(r, R.stem, { h: 9, n: r.int(10, 14), wide: false, glowTip: 2, tone: -0.4, specks: 3, speckCol: r() < 0.5 ? R.violet : R.cyan, speckGlow: 3 }),
  fern: (r) => fern(r, R.fern, { n: [5, 7], len: [17, 27], tilt: [0.5, 0.8], droop: 0.95, pw: 5, fiddle: r() < 0.3 }),
  fernPale: (r) => fern(r, R.pale, { n: [4, 6], len: [13, 21], tilt: [0.55, 0.85], droop: 0.9, pw: 4 }),
  giantFern: (r) => fern(r, R.dino, { n: [6, 8], len: [36, 54], tilt: [0.32, 0.55], droop: 0.75, pw: 8, lobed: true, rw: true, gap: 3, tone: -0.3 }),
  horsetail,
  wallFern: (r) => fern(r, R.fern, { n: [3, 5], len: [12, 21], tilt: [0.6, 0.9], droop: 1.0, pw: 4, wall: true }),
  wallFernDino: (r) => fern(r, R.dino, { n: [3, 4], len: [24, 38], tilt: [0.55, 0.85], droop: 0.9, pw: 6, lobed: true, wall: true, gap: 3, tone: -0.3 }),
  clover: (r) => clover(r),
  cloverGlow: (r) => clover(r, { flowers: 3, flowerRamp: [0x1a6a72, 0x3ab0b4, 0x8ef0e6, 0xe8fffa], flowerGlow: 3 }),
  lichenFrost: (r) => lichen(r, R.frost),
  lichenRust: (r) => lichen(r, R.rust, { speck: 0xfff0b8, glow: 0 }),
  lichenCrystal: (r) => lichen(r, R.crystal, { speck: 0xe8fbff, glow: 3 }),
  litter,
  pebbles: (r) => pebbles(r),
  starMoss,
  fungusCyan: (r) => fungus(r, R.cyan),
  fungusViolet: (r) => fungus(r, R.violet, R.stem, { shape: r() < 0.5 ? 'cone' : undefined }),
  fungusPink: (r) => fungus(r, R.pink),
  fungusBlue: (r) => fungus(r, R.blue, R.stem, { shape: 'dome' }),
  fungusAmber: (r) => fungus(r, R.amber, R.stem, { shape: 'flat', glow: 1 }),
  fungusBrown: (r) => fungus(r, R.brownCap, R.stem, { glow: 0 }),
  puffballs,
  brownCap: (r) => fungus(r, R.brownCap, R.stem, { shape: 'flat', glow: 0, n: r.int(1, 3), big: 1.2, spots: 0.03, spotCol: 0xd8b48a }),
  toadstool: (r) => fungus(r, R.red, R.stem, { shape: 'dome', glow: 0, n: r.int(1, 3), big: 1.05, spots: 0.18, spotCol: 0xf4ece0 }),
  inkcap: (r) => fungus(r, R.ink, R.stem, { shape: 'cone', glow: 0, n: r.int(2, 4), tall: [10, 14], h: [4, 8], cr: [2.6, 3.4], spots: 0.04, spotCol: 0x14121a }),
  glowShroom: (r) => fungus(r, r() < 0.33 ? R.violet : r() < 0.5 ? R.cyan : R.blue, R.stem, { shape: r() < 0.5 ? 'dome' : 'cone', n: r.int(2, 3), tall: [17, 24], h: [7, 12], cr: [3.2, 4.2] }),
  mushTiny: (r) => (r() < 0.7 ? fungus(r, r() < 0.5 ? R.amber : R.cyan, R.stem, { n: r.int(5, 7), tall: [3, 4], h: [1, 3], cr: [1.8, 2.2], big: 0.9, shape: 'dome' }) : fungus(r, R.brownCap, R.stem, { n: r.int(5, 7), tall: [3, 4], h: [1, 3], cr: [1.8, 2.2], shape: 'dome', glow: 0, spots: 0.02 })),
  emberCap: (r) => fungus(r, R.ember, R.ash, { shape: r() < 0.5 ? 'flat' : 'dome', n: r.int(2, 4), glow: 2 }),
  frostCap: (r) => fungus(r, R.frost, R.frost, { shape: 'cone', n: r.int(2, 4), tall: [7, 10], glow: 1 }),
  flowerCyan: (r) => flower(r, R.cyan, r() < 0.5 ? 'bell' : 'orb'),
  flowerViolet: (r) => flower(r, R.violet, r() < 0.5 ? 'star' : 'spike'),
  flowerPink: (r) => flower(r, R.pink, r() < 0.5 ? 'bell' : 'star'),
  flowerEmber: (r) => flower(r, R.ember, r() < 0.5 ? 'orb' : 'spike', { stem: R.ash }),
  flowerFrost: (r) => (r() < 0.5 ? flower(r, R.frost, 'star', { stem: R.frost }) : flower(r, R.crystal, 'bell', { stem: R.frost })),
  thorn,
  stoneRose,
  ashWeed,
  voidTendril: (r) => tendrils(r, { len: 28 }),
  roots: (r) => roots(r, { len: 54 }),
  rootsShort: (r) => roots(r, { len: 24, n: r.int(4, 6) }),
  vine: (r) => vine(r, { len: 64 }),
  vineBerry: (r) => vine(r, { len: 62, berry: r() < 0.5 ? R.cyan : R.pink, n: 2 }),
  vineDino: (r) => vine(r, { len: 76, leaf: R.dino, n: 2 }),
  glowVine: (r) => vine(r, { len: 68, berry: R.amber, n: 2, berryP: 0.4 }), // cave vines hung with glow berries
  mossDrape: (r) => mossDrape(r, { len: 24, glowTip: 1 }),
  rootDrape: (r) => mossDrape(r, { len: 17, ramp: R.root }),
  mycel: (r) => mycel(r, { len: 40 }),
  mycelCyan: (r) => mycel(r, { len: 31, ramp: R.cyan }),
  rime: (r) => rime(r, { len: 17 }),
  voidHang: (r) => tendrils(r, { len: 30, hang: true }),
  wallGrass: (r) => tuft(r, R.grass, { h: 10, n: r.int(6, 8), wall: true, tone: -0.2 }),
  wallMoss: (r) => tuft(r, R.moss, { h: 9, n: r.int(6, 8), wall: true, glowTip: 1 }),
  wallPale: (r) => tuft(r, R.pale, { h: 9, n: r.int(5, 7), wall: true, broken: 0.25 }),
  wallFungus: (r) => bracket(r, R.amber, { glow: 2 }),
  wallMush: (r) => wallShrooms(r, r() < 0.5 ? R.amber : R.cyan, { glow: 2 }),
  wallBrown: (r) => bracket(r, R.brownCap, { glow: 0 }),
  wallLichenRust: (r) => onWall(lichen(r, R.rust, { speck: 0xfff0b8, glow: 0 })),
  wallLichenFrost: (r) => onWall(lichen(r, R.frost)),
  wallLichenCrystal: (r) => onWall(lichen(r, R.crystal, { speck: 0xe8fbff, glow: 3 })),
  wallStar: (r) => onWall(starMoss(r)),
};

// ---------------------------------------------------------------- protos (built once, cached)
const PROTOS = new Map(); // name → { list, want }
export const protoStats = { built: 0, ms: 0, boxes: 0 };
function buildOne(name, i) {
  const t0 = performance.now();
  let hsh = 9001 + i * 7919;
  for (let k = 0; k < name.length; k++) hsh = Math.imul(hsh ^ name.charCodeAt(k), 16777619);
  const m = MODELS[name](rng(hsh));
  const p = boxify(m.g, m.pivot, m.mode);
  p.name = name;
  protoStats.built++;
  protoStats.boxes += p.n;
  protoStats.ms += performance.now() - t0;
  return p;
}
/**
 * The variants of a model: [proto, …] (null when there's no such model). The first is built on
 * first use; the rest come one at a time from growProtos() (spare time in a frame), so meeting a
 * new kind costs one small model, not all its variants.
 */
export function protos(name, n = 2) {
  let e = PROTOS.get(name);
  if (e) return e.list;
  if (!MODELS[name]) return null;
  e = { list: [buildOne(name, 0)], want: n };
  PROTOS.set(name, e);
  return e.list;
}
/** Build one more variant of a model that wants more. Returns false when there's nothing to do. */
export function growProtos() {
  for (const [name, e] of PROTOS) if (e.list.length < e.want) { e.list.push(buildOne(name, e.list.length)); return true; }
  return false;
}
export { R as RAMPS };

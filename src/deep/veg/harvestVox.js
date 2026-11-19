// Voxel models for the wild larder (src/deep/veg/harvest.js): crystal-salt outcrops, wild
// honeycomb on the rock, ground nests with speckled eggs, berry bushes, puffball spore pods,
// bundles of fat edible roots, plus the home and town patches (glowcaps, a thyme tuft). Small
// things, so fine voxels (1/64 m: the size rule's class for mushrooms and plants). Each kind has a
// full model and the stub left after a harvest (a chipped base, an empty comb, an empty nest, a
// bare bush, a burst pod, cut root ends, little caps). Geometry only (shared, cached):
//   sourceGeo(kind, stub, seed) → { geo, h (m), r (m) }
import { VoxelGrid, meshGridGreedy } from '../../gfx/Voxel.js';
import { shade, mixHex } from '../../core/util.js';

export const HV = 1 / 64; // metres per voxel

const hh = (x, y, z, s = 1) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const jit = (c, x, y, z, s, a = 0.06) => shade(c, 1 + (hh(x, y, z, s) - 0.5) * 2 * a);

/** One salt crystal: a tilted pink-white prism with a lit facet and a darker foot. */
function crystal(g, x0, z0, h, w, lean, seed) {
  for (let y = 0; y < h; y++) {
    const t = y / h, ww = Math.max(1, Math.round(w * (t > 0.75 ? (1 - t) * 4 : 1)));
    const cx = x0 + lean * y, cz = z0 + lean * 0.4 * y;
    for (let dz = 0; dz < ww; dz++) for (let dx = 0; dx < ww; dx++) {
      const X = Math.round(cx + dx - ww / 2), Z = Math.round(cz + dz - ww / 2);
      const lit = dx === 0 || dz === ww - 1, edge = dx === ww - 1 || dz === 0;
      // rose salt: deeper pink at the foot, paling up the prism, a white lit facet and a mauve shadow side
      const t2 = y / h, base = t2 < 0.3 ? 0xc0808e : t2 < 0.65 ? 0xd498a4 : 0xe4b4bc;
      const c = y < 2 ? 0x8a5e68 : lit ? (t2 > 0.6 ? 0xf8e8ea : 0xeac4ca) : edge ? 0x9a6476 : (y + seed) % 5 === 0 ? 0xe8c8ce : base;
      g.set(X, y, Z, jit(c, X, y, Z, seed, 0.03));
    }
  }
}

function saltRock(stub, seed) {
  const g = new VoxelGrid(30, 30, 30), c = 15;
  // the rock it grows from: a lumpy grey-brown boss streaked pink
  g.ellipsoid(c, 2, c, 12, 5, 10, (x, y, z) => jit((x * 3 + z * 5 + y) % 9 === 0 ? 0xa88a88 : y > 4 ? 0x7a6e66 : 0x5e544e, x, y, z, seed, 0.08));
  const cl = stub ? [[c - 2, c, 4, 3, 0], [c + 4, c + 2, 3, 2, 0], [c - 6, c - 3, 3, 2, 0]] : [[c, c, 22, 5, 0.12], [c - 5, c + 3, 15, 4, -0.18], [c + 6, c - 2, 13, 4, 0.22], [c - 2, c - 6, 10, 3, -0.1], [c + 3, c + 6, 9, 3, 0.15], [c - 8, c - 2, 7, 2, -0.25]];
  cl.forEach(([x, z, h, w, l], i) => crystal(g, x, z, h + 3, w, l, seed + i));
  return { g, pivot: [c, 0, c] };
}

function honeycomb(stub, seed) {
  // a lobed comb on the rock face (built facing +z: the wall is behind, at z = 0)
  const g = new VoxelGrid(30, 30, 12), cx = 15;
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
    const t = y / 29, half = 13 * Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.7 * (0.75 + 0.25 * Math.sin(y * 0.4 + seed));
    if (Math.abs(x - cx) > half) continue;
    const depth = Math.round(3 + 6 * (1 - Math.abs(x - cx) / Math.max(1, half)) * Math.sin(t * Math.PI));
    for (let z = 0; z < depth; z++) {
      const face = z === depth - 1;
      // hexagon-ish cells: a lattice of wax walls and honey (or empty) holes on the face
      const hx = (x + (Math.floor(y / 3) % 2) * 1.5) % 3, wall = Math.floor(hx) === 0 || y % 3 === 0;
      let col = face ? (wall ? 0xf0c050 : stub ? 0x6a4a1a : (hh(x, y, 1, seed) < 0.15 ? 0xfff0a0 : 0xe89a1a)) : 0xc88a2a;
      if (face && !wall && !stub && hh(x, y, 2, seed) < 0.08) col = 0xffe070; // a glistening full cell
      g.set(x, y, z, jit(col, x, y, z, seed, 0.04));
    }
  }
  // a honey drip hanging from the bottom
  if (!stub) for (let y = 0; y < 5; y++) g.set(cx + 2, y, 5, y < 1 ? 0xffd040 : 0xe8a020);
  // a fat little cave bee resting on it
  if (!stub) { g.box(cx - 6, 18, 8, 3, 2, 2, 0x2a2014); g.set(cx - 5, 19, 10, 0xf0c040); g.set(cx - 4, 18, 10, 0xf0c040); g.set(cx - 6, 20, 9, 0xe8f0f8); g.set(cx - 4, 20, 9, 0xe8f0f8); }
  return { g, pivot: [cx, 0, 0] };
}

function eggNest(stub, seed) {
  const g = new VoxelGrid(30, 14, 30), c = 15;
  // a ring of woven twigs and moss
  for (let y = 0; y < 7; y++) for (let z = 0; z < 30; z++) for (let x = 0; x < 30; x++) {
    const d = Math.hypot(x - c, z - c), rOut = 13 - (y < 2 ? (2 - y) * 2 : 0) + (y > 4 ? -1 : 0), rIn = y < 2 ? -1 : 8 + y * 0.4;
    if (d > rOut || d <= rIn) continue;
    const a = Math.atan2(z - c, x - c), weave = Math.sin(a * 9 + y * 1.7) > 0.3;
    g.set(x, y, z, jit(y === 6 && hh(x, z, 3, seed) < 0.3 ? 0x5a8a3a : weave ? 0x8a6a3a : 0x6a4a24, x, y, z, seed, 0.08));
  }
  if (!stub) {
    // three speckled eggs
    [[c - 3, c - 2], [c + 3, c - 1], [c, c + 3]].forEach(([x, z], i) => g.ellipsoid(x, 6, z, 3.4, 4.2, 3.2, (X, Y, Z) => (hh(X, Y, Z, seed + i) < 0.12 ? 0x9a8a6a : (X + Y) % 7 === 0 ? 0xffffff : jit(0xf4ecd8, X, Y, Z, i, 0.03))));
  } else {
    // an eggshell bit and a feather left in it
    g.set(c, 3, c, 0xf4ecd8); g.set(c + 1, 3, c, 0xe8dcc0);
    for (let i = 0; i < 6; i++) g.set(c - 3 + i, 4, c + 2 + (i > 3 ? 1 : 0), i % 2 ? 0xd8d0c0 : 0xb8a890);
  }
  return { g, pivot: [c, 0, c] };
}

function berryBush(stub, seed) {
  const g = new VoxelGrid(34, 30, 34), c = 17;
  // woody stems up from the root, then lobes of leaves
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + seed; for (let y = 0; y < 14; y++) g.set(Math.round(c + Math.cos(a) * y * 0.35), y, Math.round(c + Math.sin(a) * y * 0.35), 0x5a3a1e); }
  const lobes = [[c, 16, c, 10], [c - 7, 12, c + 2, 7], [c + 7, 13, c - 1, 7], [c + 1, 12, c + 7, 7], [c - 1, 13, c - 7, 7]];
  for (const [x, y, z, r] of lobes) g.ellipsoid(x, y, z, r, r * 0.75, r, (X, Y, Z) => {
    if (hh(X, Y, Z, seed) < 0.16) return -1; // leafy, not a ball: holes between the leaves
    const lit = Y > y + r * 0.3 || X < x - r * 0.4;
    return jit(lit ? 0x5e8e36 : (X + Z) % 5 === 0 ? 0x2a4a1c : 0x3a6626, X, Y, Z, seed, 0.07);
  });
  if (!stub) {
    // clusters of glossy red berries on the outside, each with a highlight pixel
    for (let i = 0; i < 26; i++) {
      const L = lobes[i % lobes.length], a = hh(i, 1, 0, seed) * Math.PI * 2, b = (hh(i, 2, 0, seed) - 0.3) * 1.4;
      const X = Math.round(L[0] + Math.cos(a) * Math.cos(b) * L[3]), Y = Math.round(L[1] + Math.sin(b) * L[3] * 0.75), Z = Math.round(L[2] + Math.sin(a) * Math.cos(b) * L[3]);
      g.box(X, Y, Z, 2, 2, 2, 0xb01c30); g.set(X, Y + 1, Z, 0xf06a7a); g.set(X + 1, Y, Z + 1, 0x7a1020);
    }
  }
  return { g, pivot: [c, 0, c] };
}

function sporePod(stub, seed) {
  const g = new VoxelGrid(28, 30, 28), c = 14;
  g.ellipsoid(c, 2, c, 9, 3, 9, (x, y, z) => jit(0x5a8a3a, x, y, z, seed, 0.08)); // a mossy foot
  if (!stub) {
    // a fat puffball and two small ones, warty, glowing green at the split crown
    [[c, 11, c, 9, 9], [c - 8, 5, c + 4, 4, 4], [c + 7, 5, c - 5, 3.5, 3.5]].forEach(([x, y, z, r, ry], i) => g.ellipsoid(x, y, z, r, ry, r, (X, Y, Z) => {
      const top = Y > y + ry * 0.7 && i === 0;
      if (top && Math.abs(X - x) < 3 && Math.abs(Z - z) < 2) return 0xa8f0c0; // the split, full of glowing spores
      return jit(hh(X >> 1, Y >> 1, Z >> 1, seed) < 0.12 ? 0xe8dcf0 : Y > y ? 0xc8b8d8 : 0x9a88a8, X, Y, Z, seed + i, 0.05);
    }));
    for (let i = 0; i < 6; i++) g.set(c - 2 + (i % 3) * 2, 21 + Math.floor(i / 3) * 2, c + (i % 2), 0xc8ffd8); // a puff of spores leaving
  } else {
    // the burst skin, slumped open
    g.ellipsoid(c, 4, c, 8, 3, 8, (x, y, z) => (Math.hypot(x - c, z - c) < 5 && y > 3 ? -1 : jit(0x9a88a8, x, y, z, seed, 0.05)));
  }
  return { g, pivot: [c, 0, c] };
}

function rootBundle(stub, seed) {
  // fat orange-brown roots hanging from the ceiling (built hanging: y = top at the rock, down is -)
  const H = stub ? 8 : 34, g = new VoxelGrid(24, H + 2, 24), c = 12;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + seed * 0.3, len = stub ? 6 : 20 + Math.round(hh(k, 1, 0, seed) * 12);
    for (let i = 0; i < len; i++) {
      const t = i / len, r = Math.max(0.6, 2.6 * (1 - t) + (stub ? 0.6 : 0)), x = c + Math.cos(a) * (2 + t * 4), z = c + Math.sin(a) * (2 + t * 4), y = H - i;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dz * dz <= r * r) g.set(Math.round(x + dx), y, Math.round(z + dz), jit((i + k) % 4 === 0 ? 0xc8783a : dx < 0 ? 0xd8904a : 0xa85e2a, x + dx, y, z + dz, seed + k, 0.06));
      if (!stub && i % 5 === 3) g.set(Math.round(x + 2), y, Math.round(z), 0xe8c8a0); // a root hair
    }
    if (stub) g.set(Math.round(c + Math.cos(a) * 2), H - 6, Math.round(c + Math.sin(a) * 2), 0xf0d8b0); // the cut end, pale
  }
  return { g, pivot: [c, H + 1, c] };
}

function glowcaps(stub, seed) {
  const g = new VoxelGrid(30, 26, 30), c = 15;
  g.ellipsoid(c, 1, c, 11, 2, 9, (x, y, z) => jit(0x4a6a2a, x, y, z, seed, 0.1)); // a moss pad
  const caps = stub ? [[c - 2, c, 3, 3], [c + 4, c + 2, 2, 2]] : [[c, c, 14, 7], [c - 7, c + 3, 9, 5], [c + 7, c - 3, 10, 5], [c + 2, c + 7, 6, 3.5], [c - 5, c - 6, 7, 4]];
  caps.forEach(([x, z, h, r], i) => {
    for (let y = 1; y < h; y++) g.set(x, y, z, y > h - 3 ? 0xe8f0e0 : 0xc8d8c0); // the stalk
    if (!stub || r > 2.5) g.ellipsoid(x, h, z, r, r * 0.55, r, (X, Y, Z) => (Y < h - 1 ? -1 : (X + Z + Y) % 6 === 0 ? 0xcaffff : Y >= h + r * 0.35 ? 0x9ae8ff : jit(0x4ac0e8, X, Y, Z, seed + i, 0.05)));
  });
  return { g, pivot: [c, 0, c] };
}

function thymeTuft(stub, seed) {
  const g = new VoxelGrid(28, 24, 28), c = 14;
  g.ellipsoid(c, 1, c, 8, 2, 7, (x, y, z) => jit(0x6a5a4a, x, y, z, seed, 0.1));
  const n = stub ? 7 : 26;
  for (let k = 0; k < n; k++) {
    const a = hh(k, 1, 0, seed) * Math.PI * 2, lean = 0.15 + hh(k, 2, 0, seed) * 0.35, len = stub ? 3 : 10 + Math.round(hh(k, 3, 0, seed) * 10);
    for (let i = 0; i < len; i++) {
      const x = Math.round(c + Math.cos(a) * i * lean), z = Math.round(c + Math.sin(a) * i * lean);
      g.set(x, 2 + i, z, i % 3 === 0 ? 0x8ab060 : 0x5a7a3a);
      if (!stub && i > 3 && i % 2 === 0) g.set(x + 1, 2 + i, z, i > len - 3 ? 0xc8a0e0 : 0x7aa050); // little leaves; lilac flowers at the tips
    }
  }
  return { g, pivot: [c, 0, c] };
}

const BUILD = { salt: saltRock, comb: honeycomb, nest: eggNest, bush: berryBush, spores: sporePod, roots: rootBundle, glowcaps, thyme: thymeTuft };
const cache = new Map();

/** The geometry of a source (kind, stub?, seed 0..3): { geo, h, r } (shared; don't dispose). */
export function sourceGeo(kind, stub = false, seed = 0) {
  const key = kind + '|' + (stub ? 1 : 0) + '|' + (seed & 3);
  if (cache.has(key)) return cache.get(key);
  const b = (BUILD[kind] || saltRock)(stub, (seed & 3) + 1);
  const geo = meshGridGreedy(b.g, { scale: HV, pivot: b.pivot, shade: true });
  geo.computeBoundingSphere();
  geo.userData.shared = true;
  const out = { geo, h: b.g.h * HV, r: Math.max(b.g.w, b.g.d) * HV * 0.5 };
  cache.set(key, out);
  return out;
}

export const SOURCE_KINDS = Object.keys(BUILD);
export { mixHex };

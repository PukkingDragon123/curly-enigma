// The older things in Old Star's cave, at 1/64 m voxels (tile units, as caveProps.js): the carved
// arch of the old ones round the doorway up to your room and its worn steps, the sealed doorway in
// the ruins with its star keystone and a faint glow through a crack, broken fluted pillars and a
// fallen drum, a cracked mosaic in the floor, a flagstone dais; and the old mining gear: rails on
// sleepers with a buffer stop, a mine cart, a winch, pulley blocks on a beam, pit props; the heap
// of what came down with you. Floor pieces centred at their foot, front +z; wall pieces x along
// the wall, origin on the wall face at floor level, +z out.
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, iron, line, ring, sag, M32, G32, group, mulc, mixc, h3, sp3, S32 } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';

const T = (v) => v * S32;
const vm = (m) => Math.round(m * 64);

// ---------------------------------------------------------------- carved stone
const STONE = 0xa29884, STONE_D = 0x7c7466, STONE_L = 0xc2b8a4, GROUT = 0x564c42; // pale old limestone
/** Old dressed stone: big ashlar blocks, edges worn round, lichen and moss in the joints. */
function ashlar(bw = 18, bh = 11, seed = 1, base = STONE) {
  return (x, y, z) => {
    const row = Math.floor(y / bh), off = (row % 2) * Math.floor(bw / 2);
    const u = x + z;
    const bx = Math.floor((u + off) / bw);
    const ly = y - row * bh, lu = (u + off) - bx * bw;
    if (ly === 0 || lu === 0) return hash2(u >> 1, y >> 1, seed + 3) < 0.3 ? mixc(GROUT, 0x4f7f34, 0.6) : GROUT;
    const h = hash2(bx, row, seed);
    let c = [base, mulc(base, 0.9), mixc(base, 0x9a8a72, 0.5), mulc(base, 1.06), mixc(base, 0x7a7266, 0.5)][Math.floor(h * 5)];
    if (ly === 1 || lu === 1) c = mulc(c, 0.86); // worn round edges
    if (ly === bh - 1 || lu === bw - 1) c = mulc(c, 1.08);
    if (h3(x, y, z, seed) < 0.02) c = 0xc8c27a; // lichen
    return mulc(c, sp3(x, y, z, seed, 0.06, 0.1));
  };
}

/** A carved star (five points) of radius r at (cx, cy) on the face plane z, recessed into g. */
function carveStar(g, cx, cy, z, r, col, depth = 1) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const a = Math.atan2(dx, dy), d = Math.hypot(dx, dy);
    const k = Math.abs(((a / (Math.PI * 2)) * 5 % 1 + 1) % 1 - 0.5) * 2; // 0 at a point, 1 between
    const rr = r * (1 - k * 0.55);
    if (d <= rr) for (let dz = 0; dz < depth; dz++) g.set(x, y, z - dz, col);
  }
}

// ---------------------------------------------------------------- the arch up to your room
/**
 * The arch of the old ones round the doorway in the cave's cut face: two jambs, nine voussoirs
 * and a keystone with a carved star, worn, one stone cracked, moss along the foot. Wall piece
 * (x along the face, +z out into the cave), the opening hw × h voxels, its floor at oy.
 */
export function caveArch(hw = 24, h = 80, oy = 32, seed = 41) {
  const R = hw + 9, GW = R * 2 + 4, GH = oy + h + 14, D = 8;
  const g = new VoxelGrid(GW, GH, D);
  const cx = GW / 2, base = oy + h - hw;
  const st = ashlar(12, 10, seed);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const dx = x + 0.5 - cx, dy = y - base;
    const inOpen = (y >= oy && Math.abs(dx) < hw && (y < base || dx * dx + dy * dy < hw * hw)) || (y < oy && Math.abs(dx) < hw + 1);
    if (inOpen) continue;
    const outer = y < base ? Math.abs(dx) <= R : dx * dx + dy * dy <= R * R;
    if (!outer) continue;
    let c;
    if (y >= base) {
      // voussoirs: radial joints
      const a = Math.atan2(dy, dx);
      const seg = (a / Math.PI) * 11;
      const joint = Math.abs(seg - Math.round(seg)) < 0.09 || Math.abs(Math.hypot(dx, dy) - hw - 0.5) < 0.6;
      c = joint ? GROUT : mulc(mixc(STONE, STONE_L, hash2(Math.floor(seg), 4, seed) * 0.6), sp3(x, y, 0, seed, 0.08, 0.1));
    } else c = Math.abs(dx) > R - 1 ? mulc(STONE_D, 0.95) : st(x, y, 0);
    for (let z = 0; z < D - (y >= base ? 0 : 1); z++) g.set(x, y, z, z === D - 1 || z === D - 2 ? c : mulc(c, 0.8));
  }
  // the keystone stands proud, with a star cut into it
  const ky = base + hw + 4;
  g.box(Math.round(cx - 5), ky - 6, D - 2, 10, 13, 3, (x, y) => mulc(STONE_L, sp3(x, y, 0, seed + 2, 0.1, 0.08)));
  carveStar(g, cx, ky, D, 4.2, 0x5a5248, 1);
  // a crack down one jamb, moss at the foot
  for (let y = oy + 8; y < oy + 40; y++) g.set(Math.round(cx + hw + 4 + Math.sin(y * 0.4) * 1.5), y, D - 1, 0x2a2420);
  for (let x = 0; x < GW; x++) for (let y = 0; y < 10; y++) if (g.filled(x, y, D - 1) && h3(x, y, 1, seed) < 0.5 - y * 0.05) g.set(x, y, D - 1, [0x3f6a2c, 0x4f7f34, 0x2f5222][Math.floor(h3(x, y, 2, seed) * 3)]);
  return { obj: M32(g, [cx, 0, 0]) };
}

/**
 * Worn stone steps (n treads), each rh voxels high and td deep, w wide: dished in the middle where
 * sixty years of paws went up and down. The top step is at the back (−z); the foot at +z.
 */
export function wornSteps(w = 64, n = 3, rh = 11, td = 19, seed = 43) {
  const D = n * td, H = n * rh;
  const g = new VoxelGrid(w + 4, H + 2, D + 2);
  for (let i = 0; i < n; i++) {
    const top = (n - i) * rh, z0 = i * td; // i = 0 is the highest, at the back
    const st = ashlar(22, rh, seed + i, mixc(STONE, 0x8a7a68, 0.4));
    for (let x = 1; x < w + 3; x++) for (let z = z0; z < z0 + td + (i === n - 1 ? 1 : 0); z++) {
      const mid = 1 - Math.abs(x + 0.5 - (w + 4) / 2) / ((w + 4) / 2);
      const dish = Math.round(mid * mid * 2.2 * (0.6 + 0.4 * Math.sin((z - z0) / td * Math.PI)));
      const t = top - dish;
      for (let y = 0; y < t; y++) {
        let c = st(x, y, z);
        if (y === t - 1) c = mixc(c, 0xb8ae9c, mid * 0.6); // polished pale in the middle
        if (z === z0 + td - 1 && y === t - 1) c = mulc(c, 1.1); // the nosing
        g.set(x, y, z, c);
      }
    }
    // a chip off a corner
    g.clear(1, top - 1, z0 + td - 1); g.clear(2, top - 1, z0 + td - 1);
  }
  return { obj: M32(g, [(w + 4) / 2, 0, D]) };
}

// ---------------------------------------------------------------- the ruins
/**
 * The sealed doorway of the old ones: a tall arch with carved jambs (a column of stars, a mole
 * with a lamp), a keystone star, the opening walled up with fitted stones — and a crack in it with
 * a faint teal glow behind (`glow`: local tiles). Wall piece.
 */
export function sealedArch(seed = 45) {
  const hw = 30, h = 112, J = 14;
  const R = hw + J, GW = R * 2 + 6, GH = h + J + 10, D = 14;
  const g = new VoxelGrid(GW, GH, D), gl = new VoxelGrid(GW, GH, D);
  const cx = GW / 2, base = h - hw;
  const st = ashlar(16, 12, seed);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const dx = x + 0.5 - cx, dy = y - base;
    const outer = y < base ? Math.abs(dx) <= R : dx * dx + dy * dy <= R * R;
    if (!outer) continue;
    const opening = y < base ? Math.abs(dx) < hw : dx * dx + dy * dy < hw * hw;
    if (opening) {
      // fitted stones, set back
      const c = st(x + 7, y + 3, 0);
      for (let z = 0; z < 5; z++) g.set(x, y, z, mulc(c, 0.82));
      continue;
    }
    let c;
    if (y >= base) {
      const a = Math.atan2(dy, dx), seg = (a / Math.PI) * 13;
      c = Math.abs(seg - Math.round(seg)) < 0.08 || Math.abs(Math.hypot(dx, dy) - hw - 0.5) < 0.6 ? GROUT : mulc(mixc(STONE, STONE_L, hash2(Math.floor(seg), 5, seed) * 0.7), sp3(x, y, 0, seed, 0.08, 0.1));
    } else c = st(x, y, 0);
    for (let z = 0; z < D - 2; z++) g.set(x, y, z, c);
  }
  // jamb carvings: stars down the left, a mole with a lamp on the right (recessed)
  for (let k = 0; k < 4; k++) carveStar(g, cx - hw - J / 2, 14 + k * 20, D - 3, 4.6, 0x5a5248, 1);
  const mx = Math.round(cx + hw + J / 2);
  g.ellipsoid(mx, 40, D - 3, 4, 6, 1, 0x5a5248); g.ellipsoid(mx, 50, D - 3, 3.4, 3.4, 1, 0x5a5248); // body, head
  g.box(mx - 1, 54, D - 3, 3, 2, 1, 0x5a5248); g.ellipsoid(mx + 2, 56, D - 3, 1.6, 1.6, 1, 0x8a8a5a); // helmet lamp
  for (const [dx, dy] of [[4, 48], [5, 47], [-4, 46], [-5, 47]]) g.set(mx + dx, dy, D - 3, 0x5a5248); // claws up
  for (let y = 60; y < 66; y++) g.set(mx + 4 + ((y >> 1) % 2), y, D - 3, 0x8a8a5a); // rays from the lamp
  // the keystone
  const ky = base + hw + J / 2;
  g.box(Math.round(cx - 7), ky - 9, D - 4, 14, 18, 5, (x, y) => mulc(STONE_L, sp3(x, y, 0, seed + 4, 0.1, 0.08)));
  carveStar(g, cx, ky, D, 5.5, 0x4a4238, 2);
  // the crack in the blocking wall, and the glow behind it
  let x = cx - 6;
  for (let y = 8; y < base + 20; y++) {
    x += Math.round(Math.sin(y * 0.33 + seed) * 0.9);
    for (let z = 0; z < 5; z++) g.clear(x, y, z);
    if (y % 2 === 0) g.clear(x + 1, y, 4);
    gl.set(x, y, 0, y % 7 === 0 ? 0xc8fff0 : 0x5ad8c0);
  }
  // fallen stones and moss along the foot
  for (let k = 0; k < 6; k++) g.box(Math.round(cx - hw + hash2(k, 1, seed) * hw * 2), 0, D - 2, 4, 3 + (k % 2), 2, mulc(STONE_D, 0.95));
  for (let xx = 0; xx < GW; xx++) for (let y = 0; y < 14; y++) for (let z = 0; z < D; z++) if (g.filled(xx, y, z) && !g.filled(xx, y, z + 1) && h3(xx, y, z, seed) < 0.55 - y * 0.035) g.set(xx, y, z, [0x3f6a2c, 0x4f7f34, 0x2f5222, 0x5a8a3a][Math.floor(h3(xx, y, 3, seed) * 4)]);
  return { obj: group(M32(g, [cx, 0, 0]), G32(gl, [cx, 0, 0])), glow: { x: 0, y: T(base * 0.6), z: T(2) }, w: T(GW), h: T(GH) };
}

/** A fluted column on a square base; broken: snapped off at a slant (h voxels), with a capital when whole. */
export function pillar(h = 110, broken = true, seed = 47) {
  const R = 11, S = R * 2 + 12;
  const g = new VoxelGrid(S, h + 14, S);
  const c = S / 2;
  const tilt = (hash2(seed, 1, 2) - 0.5) * 0.6;
  g.box(c - R - 4, 0, c - R - 4, R * 2 + 8, 7, R * 2 + 8, ashlar(30, 7, seed, STONE_D));
  ring(g, c, c, 0, R + 2.5, 7, 10, STONE);
  for (let y = 10; y < h; y++) {
    const top = broken ? h - 12 + Math.round(Math.sin(seed) * 3) : h;
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c, dz = z + 0.5 - c, d = Math.hypot(dx, dz);
      const a = Math.atan2(dz, dx);
      const flute = Math.cos(a * 12) > 0.55 ? 1.2 : 0;
      if (d > R - flute) continue;
      if (broken && y > top + (dx * tilt + dz * 0.2) * 1.2 + hash2(x >> 1, z >> 1, seed) * 3) continue;
      let col = flute ? mulc(STONE, 0.86) : STONE;
      if (y % 22 === 0) col = GROUT; // drum joints
      if (h3(x, y, z, seed) < 0.025) col = 0xc8c27a;
      if (y < 24 && h3(x, y, z, seed + 1) < 0.4 - (y - 10) * 0.03) col = [0x3f6a2c, 0x4f7f34][Math.floor(h3(x, y, 1, seed) * 2)];
      g.set(x, y, z, mulc(col, sp3(x, y, z, seed, 0.06, 0.1)));
    }
  }
  if (!broken) { ring(g, c, c, 0, R + 3, h, h + 4, STONE_L); g.box(c - R - 5, h + 4, c - R - 5, R * 2 + 10, 6, R * 2 + 10, ashlar(40, 6, seed, STONE_L)); }
  return { obj: M32(g, [c, 0, c]), r: T(R + 5) * 0.5 };
}

/** A column drum fallen on its side (along x). */
export function fallenDrum(len = 46, seed = 49) {
  const R = 11;
  const g = new VoxelGrid(len, R * 2 + 2, R * 2 + 2);
  for (let x = 0; x < len; x++) for (let y = 0; y < R * 2 + 2; y++) for (let z = 0; z < R * 2 + 2; z++) {
    const dy = y + 0.5 - (R + 1), dz = z + 0.5 - (R + 1), d = Math.hypot(dy, dz);
    const a = Math.atan2(dz, dy);
    const flute = Math.cos(a * 12) > 0.55 ? 1.2 : 0;
    if (d > R - flute) continue;
    if ((x < 2 || x > len - 3) && hash2(y >> 1, z >> 1, seed + x) < 0.35) continue; // chipped ends
    g.set(x, y, z, x === 0 || x === len - 1 ? mulc(STONE_L, 0.95) : mulc(flute ? mulc(STONE, 0.86) : STONE, sp3(x, y, z, seed, 0.06, 0.1)));
  }
  return { obj: M32(g, [len / 2, 1, R + 1]), r: T(R) };
}

/**
 * A round mosaic set into the floor (radius r voxels): rings of little tiles round an eight-pointed
 * star in ochre, teal, rust and cream, cracked across, tiles missing, earth and a root through it.
 * A flat pixel texture on the floor (two triangles). Returns { obj }.
 */
export function mosaic(r = 60, seed = 51) {
  const S = r * 2 + 2, c = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const put = (x, z, col) => { const i = (z * S + x) * 4; img.data[i] = (col >> 16) & 255; img.data[i + 1] = (col >> 8) & 255; img.data[i + 2] = col & 255; img.data[i + 3] = 255; };
  const pal = { ochre: 0xc8963a, ochreD: 0x9a6e2a, teal: 0x3a8a8a, tealD: 0x2a6466, rust: 0xa84a2e, cream: 0xe0d4b4, dark: 0x3a3430, grout: 0x5a5248 };
  const crack = (x, z) => { const t = (x - c) * 0.42 - (z - c) * 0.9 + Math.sin(x * 0.25) * 3; return Math.abs(t) < 0.8; };
  const root = (x, z) => { const t = (z - (c - r)) / (r * 1.1); if (t < 0 || t > 1) return false; const rx = c + r * (0.3 - 0.45 * Math.sin(t * 2.6)) + Math.sin(t * 14) * 1.5; return Math.abs(x - rx) < 1.6 - t; };
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - c, dz = z + 0.5 - c, d = Math.hypot(dx, dz);
    if (d > r + (hash2(x >> 1, z >> 1, seed + 9) - 0.5) * 3) continue;
    const tile = Math.floor(x / 3) * 977 + Math.floor(z / 3);
    let col;
    if (x % 3 === 0 || z % 3 === 0) col = pal.grout;
    else {
      const a = Math.atan2(dz, dx);
      const k = Math.abs((((a / (Math.PI * 2)) * 8) % 1 + 1) % 1 - 0.5) * 2;
      const star = d < r * 0.42 * (1 - k * 0.6);
      if (d > r - 4) col = pal.dark;
      else if (d > r - 8) col = Math.floor(a * 12 / Math.PI) % 2 ? pal.teal : pal.tealD;
      else if (d > r - 11) col = pal.cream;
      else if (d > r * 0.62) col = Math.floor((a / Math.PI) * 16 + 32) % 4 === 0 ? pal.rust : pal.cream;
      else if (star) col = d < 5 ? pal.rust : k < 0.3 ? pal.ochre : pal.ochreD;
      else col = d > r * 0.55 ? pal.teal : pal.cream;
      col = mulc(col, 0.85 + hash2(tile, 1, seed) * 0.2);
    }
    const dirt = hash2(Math.floor(x / 9), Math.floor(z / 9), seed + 2) + (d / r) * 0.35;
    if (crack(x, z)) col = 0x1e1a18;
    else if (root(x, z)) col = mulc(0x5a3e24, 0.85 + hash2(x, z, 4) * 0.3);
    else if (hash2(tile, 3, seed) < 0.06 || dirt > 1.05) col = [0x5a3e2a, 0x4e3624, 0x684a32][Math.floor(hash2(x, z, seed) * 3)];
    else if (dirt > 0.92) col = mixc(col, 0x5a3e2a, 0.6);
    put(x, z, col);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(S * S32, S * S32).rotateX(-Math.PI / 2), mat);
  mesh.position.y = S32 * 0.5;
  mesh.userData.noBatch = true;
  return { obj: mesh };
}

/** A low flagstone dais (w × d m, h voxels) with a step up in front. */
export function dais(w = 2.4, d = 1.5, h = 14, seed = 53) {
  const W = vm(w), D = vm(d);
  const g = new VoxelGrid(W, h + 1, D + 14);
  const st = ashlar(20, h, seed, STONE_D);
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) for (let y = 0; y < h; y++) {
    let c = y === h - 1 ? (x % 18 === 0 || z % 18 === 0 ? GROUT : mulc(mixc(STONE, STONE_L, hash2(Math.floor(x / 18), Math.floor(z / 18), seed) * 0.6), sp3(x, y, z, seed, 0.08, 0.1))) : st(x, y, z);
    if ((x < 2 || x > W - 3 || z < 2) && y === h - 1 && hash2(x, z, seed) < 0.4) continue;
    g.set(x, y, z, c);
  }
  // the step
  g.box(Math.round(W * 0.3), 0, D, Math.round(W * 0.4), Math.round(h / 2), 12, ashlar(22, Math.round(h / 2), seed + 1, STONE));
  return { obj: M32(g, [W / 2, 0, D / 2]) };
}

// ---------------------------------------------------------------- mining gear
/** Rails on sleepers, len m along +x, with a buffer stop at the −x end. Returns { obj }. */
export function rails(len = 3.6, seed = 55) {
  const L = vm(len), G = 22; // gauge (voxels)
  const g = new VoxelGrid(L + 4, 24, 40);
  const cz = 20;
  for (let x = 4; x < L; x += 11) g.box(x, 0, cz - 15, 6, 3, 30, (xx, y, z) => mulc(wood(0x5a3e26, { axis: 'z', pw: 99, seed: x })(xx, y, z), sp3(xx, y, z, x, 0.15, 0.12)));
  for (const z of [cz - G / 2, cz + G / 2]) {
    g.box(0, 3, z - 1, L + 4, 3, 3, (x, y, zz) => (y === 5 ? (h3(x, y, zz, 3) < 0.4 ? 0x8a8a92 : 0x6a6a74) : h3(x, y, zz, 4) < 0.25 ? C.rust : 0x3e3a3c));
    for (let x = 6; x < L; x += 11) { g.set(x + 1, 3, z - 2, 0x55555e); g.set(x + 1, 3, z + 2, 0x55555e); } // spikes
  }
  // the buffer stop: a timber block on two posts, an iron plate
  g.box(0, 3, cz - 16, 7, 14, 32, beam(0x4a2e1a, 'z', seed));
  g.box(7, 7, cz - 10, 1, 7, 20, 0x55555e);
  for (const z of [cz - 13, cz + 12]) g.box(0, 0, z, 6, 18, 2, beam(0x3e2618, 'y', seed + 1));
  // gravel between the sleepers
  for (let x = 0; x < L; x += 2) for (let z = cz - 13; z < cz + 13; z += 2) if (hash2(x, z, seed) < 0.22) g.box(x, 0, z, 2, 1, 2, [0x5e5650, 0x726a62, 0x4a4440][Math.floor(hash2(z, x, seed) * 3)]);
  return { obj: M32(g, [0, 0, cz]) };
}

/** A rusty old mine cart (on the rails' gauge) heaped with ore, a pick across it. */
export function mineCart(seed = 57) {
  const g = new VoxelGrid(46, 40, 34);
  const cz = 17;
  const ir = (x, y, z) => (h3(x, y, z, seed) < 0.12 ? mixc(C.rust, 0x6a3a1a, h3(x, y, z, 2)) : h3(x, y, z, seed + 1) < 0.04 ? 0x6a6a74 : 0x46464e);
  // the tub, flaring out, banded and riveted
  for (let y = 8; y < 28; y++) {
    const f = Math.floor((y - 8) / 7);
    const x0 = 4 - f, x1 = 42 + f, z0 = cz - 12 - f, z1 = cz + 12 + f;
    for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
      const edge = x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1;
      if (!edge && y > 8) continue;
      let c = ir(x, y, z);
      if (y === 27 || y === 8) c = 0x5a5a64;
      if ((y - 8) % 7 === 3 && (x + z) % 6 === 0) c = 0x7a7a84;
      g.set(x, y, z, c);
    }
  }
  // ore heaped inside
  for (let x = 5; x < 41; x++) for (let z = cz - 11; z < cz + 11; z++) {
    const h = 26 + Math.round(3 * Math.sin(x * 0.2) * Math.cos(z * 0.25) + hash2(x >> 1, z >> 1, seed) * 3);
    for (let y = 20; y < h; y++) g.set(x, y, z, h3(x >> 1, y >> 1, z >> 1, 9) < 0.25 ? [0xd9773f, 0xf2a35e, 0x6e5a4b, 0x8a8078][Math.floor(h3(z, x, y, 4) * 4)] : mulc(0x5e564f, sp3(x, y, z, 2, 0.2, 0.15)));
  }
  // axles and spoked wheels on the rails' gauge
  for (const x of [11, 35]) {
    g.box(x - 1, 4, cz - 14, 3, 2, 28, 0x2e2e34);
    for (const z of [cz - 12, cz + 11]) for (let y = 0; y < 12; y++) for (let xx = x - 6; xx < x + 7; xx++) {
      const d = Math.hypot(xx + 0.5 - (x + 0.5), y + 0.5 - 5.5);
      if (d > 5.8) continue;
      const a = Math.atan2(y + 0.5 - 5.5, xx + 0.5 - (x + 0.5));
      const spoke = Math.abs(((a / Math.PI) * 3 + 6) % 1 - 0.5) > 0.38;
      if (d > 4.6 || d < 1.4 || spoke) g.box(xx, y, z, 1, 1, 2, d > 4.6 ? 0x3a3a42 : d < 1.4 ? 0x6a6a74 : 0x2e2e34);
    }
  }
  // a pick laid across the top
  line(g, [[8, 31, cz - 8], [38, 33, cz + 6]], 0.9, wood(0x8a5a32, { pw: 99 }));
  line(g, [[34, 29, cz + 10], [38, 33, cz + 6], [42, 31, cz + 1]], 1.1, 0x55555e);
  return { obj: M32(g, [23, 0, cz]), r: 0.4 };
}

/** A hand winch: an A-frame with a rope drum, a crank and a toothed wheel with its pawl. Rope up from the drum. */
export function winch(seed = 59) {
  const g = new VoxelGrid(56, 60, 40);
  const fr = beam(0x5a3a22, 'y', seed);
  for (const z of [4, 34]) {
    line(g, [[6, 0, z], [26, 44, z]], 1.6, fr); line(g, [[46, 0, z], [26, 44, z]], 1.6, fr);
    g.box(10, 14, z - 1, 32, 3, 3, beam(0x4e3220, 'x', seed + z));
  }
  g.box(4, 0, 2, 46, 3, 3, beam(0x4e3220, 'x', seed)); g.box(4, 0, 33, 46, 3, 3, beam(0x4e3220, 'x', seed + 1));
  // the drum, wound with rope
  for (let z = 7; z < 33; z++) for (let y = 0; y < 60; y++) for (let x = 0; x < 56; x++) {
    const d = Math.hypot(x + 0.5 - 26, y + 0.5 - 38);
    if (d > 7.5) continue;
    g.set(x, y, z, z < 9 || z > 30 ? (d > 6.5 ? 0x3a3a42 : 0x5a3a22) : d > 5 ? ((z + Math.floor(Math.atan2(y - 38, x - 26) * 2)) % 2 ? C.rope : C.ropeD) : 0x6a4428);
  }
  // axle, crank and handle
  g.box(25, 37, 0, 3, 3, 40, 0x2e2e34);
  line(g, [[26, 38, 1], [26, 26, 1]], 1.0, 0x3a3a42); line(g, [[26, 26, 1], [26, 26, -6]], 1.1, wood(0x8a5a32, { pw: 99 }));
  // the toothed wheel and its pawl
  for (let y = 0; y < 60; y++) for (let x = 0; x < 56; x++) {
    const d = Math.hypot(x + 0.5 - 26, y + 0.5 - 38), a = Math.atan2(y + 0.5 - 38, x + 0.5 - 26);
    const tooth = Math.cos(a * 14) > 0.2 ? 1.3 : 0;
    if (d < 9.5 + tooth && d > 2) g.box(x, y, 36, 1, 1, 2, d > 9 ? 0x55555e : 0x3e3e46);
  }
  line(g, [[34, 52, 37], [30, 47, 37]], 0.8, 0x2e2e34);
  // the rope leaving the drum, up toward the pulley
  line(g, [[26, 45, 20], [26, 60, 20]], 0.7, C.rope);
  return { obj: M32(g, [26, 0, 20]), ropeTop: { x: 0, y: T(60), z: 0 }, r: 0.4 };
}

/** An iron pulley block with a hook, a sheave inside (hangs from its top). */
export function pulley(seed = 61) {
  const g = new VoxelGrid(14, 26, 8);
  g.box(2, 6, 1, 10, 14, 6, (x, y, z) => (x === 2 || x === 11 ? (h3(x, y, z, seed) < 0.2 ? C.rust : 0x3a3a42) : -1));
  for (let y = 0; y < 26; y++) for (let x = 0; x < 14; x++) { const d = Math.hypot(x + 0.5 - 7, y + 0.5 - 13); if (d < 5) g.box(x, y, 2, 1, 1, 4, d > 4 ? 0x55555e : d < 1.2 ? 0x8a8a96 : 0x2e2e34); }
  g.box(5, 20, 3, 4, 3, 2, 0x3a3a42);
  line(g, [[7, 23, 4], [7, 25, 4], [9, 25, 4]], 0.6, 0x55555e); // the hook
  line(g, [[2.5, 13, 4], [2.5, 0, 4]], 0.5, C.rope); line(g, [[11.5, 13, 4], [11.5, 2, 4]], 0.5, C.ropeD);
  return M32(g, [7, 26, 4]);
}

/** A timber frame: two posts and a cap beam (pit props), w × h voxels. Wall piece (stands against it). */
export function pitFrame(w = 90, h = 110, seed = 63) {
  const g = new VoxelGrid(w + 8, h + 10, 12);
  const post = beam(0x6e4a2c, 'y', seed), capB = beam(0x7a5232, 'x', seed + 1);
  g.box(0, 0, 2, 8, h, 8, post); g.box(w, 0, 2, 8, h, 8, post);
  g.box(-2 + 2, h, 1, w + 8, 9, 10, capB);
  // wedges and iron dogs
  g.box(2, h - 4, 10, 4, 4, 2, 0x6a4428); g.box(w + 2, h - 4, 10, 4, 4, 2, 0x6a4428);
  for (const x of [3, w + 3]) { g.box(x, h + 2, 10, 2, 5, 1, 0x3a3a42); }
  return { obj: M32(g, [(w + 8) / 2, 0, 2]) };
}

// ---------------------------------------------------------------- what came down with you
/** Splintered roots, broken planks, clods and stones on the mound, a few coins and a gem glinting. Returns { obj, glints: [local tiles] }. */
export function fallDebris(seed = 65) {
  const S = 150;
  const g = new VoxelGrid(S, 40, S), gl = new VoxelGrid(S, 40, S);
  const c = S / 2;
  const glints = [];
  // clods and stones scattered
  for (let k = 0; k < 46; k++) {
    const a = hash2(k, 1, seed) * Math.PI * 2, d = Math.sqrt(hash2(k, 2, seed)) * (S / 2 - 8);
    const x = c + Math.cos(a) * d, z = c + Math.sin(a) * d;
    const r = 1.5 + hash2(k, 3, seed) * 3.5;
    const col = k % 3 ? [0x5a3e2a, 0x4e3624, 0x684a32][k % 3] : [0x7a7068, 0x6a625a, 0x8a8076][k % 3];
    g.ellipsoid(x, r * 0.5, z, r, r * 0.7, r, (xx, yy, zz) => mulc(col, sp3(xx, yy, zz, k, 0.2, 0.12)));
  }
  // roots torn out of the roof, splayed over the heap
  for (let k = 0; k < 5; k++) {
    const a = k * 1.3 + seed, L = 30 + k * 6;
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([c + Math.cos(a) * L * (t - 0.4), 2 + Math.sin(t * Math.PI) * 6, c + Math.sin(a) * L * (t - 0.4) + Math.sin(t * 7 + k) * 4]); }
    line(g, pts, (t) => 2.2 * (1 - t) + 0.6, (x, y, z, t) => mixc(0x6a4a2e, 0x3e2818, Math.round(t * 3) / 3));
  }
  // broken planks (a crate that came down too)
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 0.4, x = c + Math.cos(a) * 30, z = c + Math.sin(a) * 26;
    line(g, [[x - Math.cos(a + 1) * 14, 2, z - Math.sin(a + 1) * 14], [x + Math.cos(a + 1) * 14, 4 + k * 2, z + Math.sin(a + 1) * 14]], 1.6, (xx, yy, zz) => mulc(0x8a6040, sp3(xx, yy, zz, k, 0.15, 0.12)));
  }
  // a few coins and a gem, spilled from that strange chest
  for (let k = 0; k < 7; k++) {
    const a = hash2(k, 7, seed) * Math.PI * 2, d = 12 + hash2(k, 8, seed) * 40;
    const x = Math.round(c + Math.cos(a) * d), z = Math.round(c + Math.sin(a) * d);
    g.box(x - 1, 1, z - 1, 3, 1, 3, 0xd8a832); g.set(x, 2, z, 0xf2c23a);
    if (k < 3) glints.push({ x: T(x - c), y: T(3), z: T(z - c) });
  }
  const gx = c + 20, gz = c - 14;
  gl.ellipsoid(gx, 2.5, gz, 2.2, 2.4, 2.2, (x, y) => (y > 2 ? 0x9affe8 : 0x3ac8a8));
  glints.push({ x: T(gx - c), y: T(4), z: T(gz - c), gem: true });
  return { obj: group(M32(g, [c, 0, c]), G32(gl, [c, 0, c])), glints };
}

/** A little clump of moss with a sprig or two (sits on a rock or the floor). */
export function mossTuft(seed = 67) {
  const g = new VoxelGrid(16, 8, 16);
  for (let k = 0; k < 9; k++) {
    const x = 3 + hash2(k, 1, seed) * 10, z = 3 + hash2(k, 2, seed) * 10;
    g.ellipsoid(x, 1, z, 2.8, 1.6 + hash2(k, 3, seed), 2.8, (xx, yy, zz) => [0x3f6a2c, 0x4f7f34, 0x5a8a3a, 0x2f5222][Math.floor(h3(xx, yy, zz, k) * 4)]);
  }
  for (let k = 0; k < 3; k++) { const x = 4 + k * 4; line(g, [[x, 2, 8], [x + 1, 6, 8 + k - 1]], 0.5, 0x7ab04a); g.set(x + 1, 7, 8 + k - 1, k === 1 ? 0xf0e070 : 0x9ad06a); }
  return M32(g, [8, 0, 8]);
}

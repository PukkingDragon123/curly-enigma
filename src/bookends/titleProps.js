// Voxel props for the title screen's forge cave: the anvil on its stump, the stone forge with its
// hood and chimney, the bellows, the quench tub, the tool wall, a weapon rack, coal, ingots, a
// grindstone, and the smith's own tools (hammer, tongs, the glowing blade blank, goggles).
// Built at 1/32-unit voxels (S32) like the other bookend props. Glowing parts use the unlit
// 'basic' material with a unique copy so the scene can tint them (heat, flicker).
import * as THREE from 'three';
import { VoxelGrid, voxMesh, hash3 } from './vox.js';
import { cyl, bar, pj, pp, S32 } from './props.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { makeRng, shade, mixHex } from '../core/util.js';

const IRON = { dk: 0x24222a, base: 0x3c3a44, mid: 0x55535e, hi: 0x8a8896, face: 0xa4a2b0, glint: 0xd6d4e2 };
const WOOD = { dk: 0x4a2e18, base: 0x7a5030, mid: 0x8a5c36, hi: 0xa87444, end: 0xd8b07a };
const STONE = [0x6e6660, 0x7a7068, 0x645c56, 0x837a70];
const BRICK = [0x8a4a32, 0x9a5638, 0x7a4030, 0xa45e3e];
const SOOT = 0x2a2226;

function grp(...children) { const g = new THREE.Group(); for (const c of children) if (c) g.add(c); return g; }
const glowMat = () => voxelMaterial('basic', { unique: true });

// ------------------------------------------------------------------ anvil
/**
 * A London-pattern anvil on an iron-banded stump, long axis along x (horn toward +x).
 * opts.top: height of the striking face (units); the stump makes up the difference.
 * userData.face: local point on the middle of the striking face; userData.horn: tip of the horn.
 */
export function makeAnvil({ top = 0.6 } = {}) {
  const AH = 10; // anvil body height (voxels): feet 2, waist 2, body 2, face 3, +1
  const SH = Math.max(4, Math.round(top / S32) - AH);
  const N = 40, H = SH + AH + 2, D = 24;
  const g = new VoxelGrid(N, H, D);
  const cx = N / 2, cz = D / 2;
  // stump: end grain on top, bark and iron bands
  const SR = 9;
  const scx = cx - 3;
  g.cylinderY(scx, cz, SR, 0, SH, (x, y, z) => {
    const r = Math.hypot(x + 0.5 - scx, z + 0.5 - cz);
    if (y === SH - 1) return Math.round(r * 1.1) % 3 === 0 ? 0xb8905a : r > SR - 1.2 ? 0x5a3a20 : 0xd2a86c;
    if ((y === 2 || y === SH - 4) && r > SR - 0.9) return IRON.hi;
    if ((y === 3 || y === SH - 3) && r > SR - 0.9) return IRON.mid;
    const ang = Math.atan2(z + 0.5 - cz, x + 0.5 - scx);
    const furrow = Math.sin(ang * 9 + y * 0.15) > 0.6;
    return furrow ? 0x3a2414 : pj(0x6a4426, x, y, z, 3, 0.07, 2);
  });
  // roots flaring at the foot of the stump
  for (let a = 0; a < 6; a++) {
    const ang = a * 1.05 + 0.3;
    for (let r = SR - 1; r < SR + 3; r++) g.set(scx + Math.cos(ang) * r, 0, cz + Math.sin(ang) * r, 0x5a3a20);
  }
  const y0 = SH;
  const iron = (x, y, z) => pj(IRON.base, x, y, z, 5, 0.04, 2);
  g.box(10, y0, 6, 18, 2, 12, (x, y, z) => (y === y0 + 1 && (x === 10 || x === 27) ? IRON.mid : iron(x, y, z))); // feet
  g.box(13, y0 + 2, 8, 12, 2, 8, (x, y, z) => (z === 8 ? IRON.dk : iron(x, y, z))); // waist
  g.box(10, y0 + 4, 7, 19, 2, 10, (x, y, z) => iron(x, y, z)); // body
  g.box(6, y0 + 6, 7, 25, 3, 10, (x, y, z) => (y === y0 + 8 ? (x === 6 || z === 7 ? IRON.glint : IRON.face) : y === y0 + 6 ? IRON.dk : iron(x, y, z))); // face
  g.box(31, y0 + 6, 8, 3, 2, 8, (x, y, z) => (y === y0 + 7 ? IRON.hi : iron(x, y, z))); // step
  cyl(g, [33, y0 + 6.8, cz], [N - 1, y0 + 7.3, cz], 3.4, (t, ang, d) => (ang > 0.4 && ang < 2.6 ? IRON.hi : d > 0.8 ? IRON.dk : IRON.mid), 0.6); // horn
  g.box(3, y0 + 5, 8, 4, 4, 8, (x, y, z) => (y === y0 + 8 ? IRON.face : iron(x, y, z))); // heel
  for (const [x, z] of [[9, 11], [9, 12], [10, 11], [10, 12]]) g.set(x, y0 + 8, z, IRON.dk); // hardy hole
  g.set(13, y0 + 8, 14, IRON.dk);
  for (let i = 0; i < 8; i++) g.set(14 + (i * 5) % 14, y0 + 8, 9 + (i * 3) % 6, i % 2 ? IRON.glint : 0x7a7884); // hammer scars
  const m = voxMesh(g, { pivot: [cx, 0, cz], scale: S32 });
  const out = grp(m);
  out.userData.face = new THREE.Vector3((19 - cx) * S32, (y0 + 9) * S32, 0);
  out.userData.horn = new THREE.Vector3((N - 1 - cx) * S32, (y0 + 7) * S32, 0);
  out.userData.top = (y0 + 9) * S32;
  return out;
}

// ------------------------------------------------------------------ forge
/**
 * The stone forge: a waist-high hearth of cut stone with a firepot of coals, an arch, and a brick
 * hood narrowing into a chimney that climbs `chimney` units. Front faces +z.
 * Returns { group, coals (unlit mesh, tint it to flicker), fire (local point in the firepot),
 * mouth (front of the firepot), top (chimney top) }.
 */
export function makeForge({ chimney = 2.6, seed = 3 } = {}) {
  const rng = makeRng(seed);
  const W = 48, D = 34, HB = 24; // hearth 1.5 x 1.06, 0.75 high
  const HH = 40; // hood height above the hearth
  const CH = Math.round(chimney / S32);
  const g = new VoxelGrid(W + 2, HB + HH + CH + 2, D + 2);
  const k = new VoxelGrid(W + 2, HB + HH + 2, D + 2);
  const cx = (W + 2) / 2;
  // ---- hearth: courses of cut stone, darker mortar, a lip on top
  g.box(1, 0, 1, W, HB, D, (x, y, z) => {
    const course = Math.floor(y / 6);
    const off = course % 2 ? 4 : 0;
    const face = z === D || x === 1 || x === W;
    const u = face && z === D ? x : z;
    if (y % 6 === 5) return 0x3e3632; // mortar between courses
    if ((u + off) % 9 === 0) return 0x3e3632;
    const block = Math.floor((u + off) / 9) + course * 7;
    let c = pj(STONE[block % STONE.length], x, y, z, block, 0.05, 2);
    if (y > HB - 8) c = mixHex(c, SOOT, (y - (HB - 8)) / 14);
    if (hash3(x, y, z, 7) < 0.03) c = shade(c, 0.8);
    return c;
  });
  // the lip: a slab of dark stone overhanging by one voxel
  g.box(0, HB - 2, 0, W + 2, 2, D + 2, (x, y, z) => (y === HB - 1 ? pj(0x5a524e, x, y, z, 4, 0.06) : 0x403836));
  // ---- firepot: a dished hollow in the middle, filled with coals (glowing grid)
  const fx = cx, fz = D / 2 + 3, fr = 9;
  for (let y = HB - 4; y < HB; y++) for (let z = 1; z < D + 1; z++) for (let x = 1; x < W + 1; x++) {
    const d = Math.hypot(x + 0.5 - fx, (z + 0.5 - fz) * 1.15);
    if (d < fr - (HB - 1 - y) * 0.6) g.clear(x, y, z);
  }
  for (let z = 1; z < D + 1; z++) for (let x = 1; x < W + 1; x++) {
    const d = Math.hypot(x + 0.5 - fx, (z + 0.5 - fz) * 1.15);
    if (d > fr) continue;
    const top = HB - 3 + Math.round((1 - d / fr) * 3 + hash3(x, 0, z, 2) * 1.6);
    for (let y = HB - 4; y < top; y++) {
      const h = hash3(x, y, z, 11);
      const hot = 1 - d / fr;
      let c;
      if (h < 0.16) c = 0x2a1612;
      else if (hot > 0.55) c = h < 0.55 ? 0xfff0a0 : 0xffc048;
      else if (hot > 0.25) c = h < 0.5 ? 0xff9a2a : 0xffc048;
      else c = h < 0.5 ? 0xd8501a : 0x8a2a12;
      k.set(x, y, z, c);
    }
  }
  // ---- arch + hood: two pillars at the back corners, a brick hood narrowing upward
  const brick = (x, y, z, soot) => {
    const row = Math.floor(y / 3);
    const off = row % 2 ? 3 : 0;
    if (y % 3 === 2) return 0x4a3a34;
    if ((x + z + off) % 6 === 0) return 0x4a3a34;
    let c = pp(BRICK, Math.floor((x + z + off) / 6), row, 0, 9, 1);
    c = pj(c, x, y, z, 12, 0.05, 2);
    return soot ? mixHex(c, SOOT, soot) : c;
  };
  const yb = HB;
  // back wall of the fireplace up to the hood
  g.box(3, yb, 2, W - 4, 18, 5, (x, y, z) => brick(x, y, z, 0.35 + (y - yb) / 30));
  // side cheeks
  for (const x0 of [2, W - 5]) g.box(x0, yb, 2, 5, 18, 14, (x, y, z) => brick(x, y, z, 0.25));
  // hood: a frustum from the full width down to the flue
  const hy0 = yb + 18, hy1 = hy0 + HH - 18;
  for (let y = hy0; y < hy1; y++) {
    const t = (y - hy0) / (hy1 - hy0);
    const hw = (W / 2 - 1) * (1 - t) + 7 * t;
    const d0 = 2, d1 = Math.round((D - 4) * (1 - t) + 12 * t);
    for (let z = d0; z <= d1; z++) for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const edge = x <= Math.round(cx - hw) + 1 || x >= Math.round(cx + hw) - 1 || z >= d1 - 1;
      if (!edge && z > d0 + 1) continue; // hollow
      let c = brick(x, y, z, 0.3 + t * 0.4);
      if (y === hy0 || y === hy0 + 1) c = y === hy0 ? IRON.dk : IRON.mid; // iron band under the hood
      if (y === hy0 + 1 && (x % 6 === 0)) c = IRON.glint; // rivets
      g.set(x, y, z, c);
    }
  }
  // chimney: a square flue of soot-black brick up into the rock
  for (let y = hy1; y < hy1 + CH; y++) for (let z = 2; z <= 12; z++) for (let x = Math.round(cx - 7); x <= Math.round(cx + 7); x++) {
    const edge = x <= Math.round(cx - 7) + 1 || x >= Math.round(cx + 7) - 1 || z >= 11 || z <= 3;
    if (!edge) continue;
    const t = (y - hy1) / CH;
    g.set(x, y, z, brick(x, y, z, 0.55 + t * 0.4));
  }
  // a poker and a shovel hanging from the hood band
  for (let y = hy0 - 14; y < hy0; y++) { g.set(W - 2, y, D - 6, IRON.mid); }
  g.box(W - 3, hy0 - 16, D - 7, 3, 2, 3, IRON.hi);
  for (let y = hy0 - 12; y < hy0; y++) g.set(4, y, D - 6, WOOD.base);
  g.box(2, hy0 - 16, D - 7, 5, 4, 2, IRON.hi);
  // soot streaks on the hood front
  for (let i = 0; i < 6; i++) {
    const x = Math.round(cx + rng.range(-10, 10));
    for (let y = hy0 + 2; y < hy0 + 2 + rng.int(4, 10); y++) for (let z = 0; z < D + 2; z++) if (g.filled(x, y, z) && !g.filled(x, y, z + 1)) { g.set(x, y, z, SOOT); break; }
  }
  const piv = [cx, 0, (D + 2) / 2];
  const body = voxMesh(g, { pivot: piv, scale: S32 });
  const coals = voxMesh(k, { pivot: piv, scale: S32, kind: 'basic', outline: false, material: glowMat() });
  coals.userData.dynamic = true;
  const group = grp(body, coals);
  const toL = (x, y, z) => new THREE.Vector3((x - piv[0]) * S32, y * S32, (z - piv[2]) * S32);
  return { group, coals, fire: toL(fx, HB, fz), mouth: toL(fx, HB + 2, D), top: toL(cx, hy1 + CH, 7), hood: toL(cx, hy0, D - 4) };
}

// ------------------------------------------------------------------ bellows
/**
 * A big two-board leather bellows on a trestle, the nozzle pointing along -x (into the forge).
 * Returns { group, top (pivot of the upper board: rotate .rotation.z), leather (scale.y), nozzle }.
 */
export function makeBellows() {
  const L = 40, Wd = 22;
  const shape = (x) => { const t = x / L; return Math.max(2, Wd / 2 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62 + 0.25)); };
  const board = (thick, hi) => {
    const g = new VoxelGrid(L + 2, thick, Wd + 2);
    for (let x = 0; x < L; x++) {
      const hw = shape(x);
      for (let z = Math.round(Wd / 2 + 1 - hw); z <= Math.round(Wd / 2 + 1 + hw); z++) for (let y = 0; y < thick; y++) {
        const edge = Math.abs(z - (Wd / 2 + 1)) > hw - 1.2;
        let c = edge ? WOOD.dk : pj((x + (z >> 2)) % 7 === 0 ? WOOD.base : WOOD.mid, x, y, z, 4, 0.05);
        if (hi && y === thick - 1 && !edge) c = shade(c, 1.08);
        g.set(x, y, z, c);
      }
    }
    // brass studs along the rim
    for (let x = 4; x < L; x += 5) { const hw = shape(x) - 1.5; g.set(x, thick - 1, Math.round(Wd / 2 + 1 - hw), 0xd8b050); g.set(x, thick - 1, Math.round(Wd / 2 + 1 + hw), 0xd8b050); }
    return voxMesh(g, { pivot: [0, 0, Wd / 2 + 1], scale: S32 });
  };
  // leather folds (scaled vertically to pump)
  const lg = new VoxelGrid(L + 2, 8, Wd + 2);
  for (let x = 2; x < L - 1; x++) {
    const hw = shape(x) - 1;
    for (let y = 0; y < 8; y++) {
      const fold = y % 4 === 1 || y % 4 === 2 ? 0 : 1;
      for (let z = Math.round(Wd / 2 + 1 - hw - fold); z <= Math.round(Wd / 2 + 1 + hw + fold); z++) {
        const edge = Math.abs(z - (Wd / 2 + 1)) >= hw - 0.5 + fold;
        if (!edge && x > 3 && x < L - 3) continue;
        g8(lg, x, y, z, fold ? 0x6a3a1e : 0x4a2412);
      }
    }
  }
  function g8(gg, x, y, z, c) { gg.set(x, y, z, c); }
  const leather = voxMesh(lg, { pivot: [0, 0, Wd / 2 + 1], scale: S32 });
  const bottom = board(2, false);
  const topB = board(2, true);
  // nozzle: an iron cone along -x
  const ng = new VoxelGrid(16, 8, 8);
  cyl(ng, [15, 4, 4], [0, 4, 4], 3.4, (t, ang) => (ang > 0.5 && ang < 2.5 ? IRON.hi : IRON.mid), 1.2);
  const nozzle = voxMesh(ng, { pivot: [16, 4, 4], scale: S32 });
  // handle on the top board's tail
  const hg = new VoxelGrid(10, 4, 14);
  hg.box(0, 0, 2, 3, 3, 10, WOOD.base);
  hg.box(3, 1, 6, 6, 2, 2, WOOD.hi);
  const handle = voxMesh(hg, { pivot: [0, 0, 7], scale: S32 });
  // trestle legs
  const tg = new VoxelGrid(L + 2, 22, Wd + 2);
  for (const x of [6, L - 8]) for (const z of [3, Wd - 2]) tg.box(x, 0, z, 2, 21, 2, (xx, y) => (y % 6 === 0 ? WOOD.dk : WOOD.base));
  tg.box(5, 18, 2, L - 11, 2, Wd - 1, (x, y, z) => (z % 4 === 0 ? WOOD.dk : WOOD.mid));
  const trestle = voxMesh(tg, { pivot: [0, 0, Wd / 2 + 1], scale: S32 });

  const group = new THREE.Group();
  trestle.position.set(0, 0, 0);
  group.add(trestle);
  const base = new THREE.Group();
  base.position.set(0, 20 * S32, 0);
  group.add(base);
  bottom.position.set(0, 0, 0);
  base.add(bottom);
  leather.position.set(0, 2 * S32, 0);
  base.add(leather);
  const top = new THREE.Group(); // hinged at the nozzle end
  top.position.set(0, 10 * S32, 0);
  base.add(top);
  topB.position.set(0, 0, 0);
  top.add(topB);
  handle.position.set((L - 2) * S32, 2 * S32, 0);
  top.add(handle);
  nozzle.position.set(0, 5 * S32, 0);
  base.add(nozzle);
  return { group, top, leather, nozzle, len: L * S32 };
}

// ------------------------------------------------------------------ quench tub
/** Half an oak barrel with iron hoops, full of dark water, and a ladle on the rim. Returns { group, water (y) }. */
export function makeQuenchTub() {
  const R = 11, H = 17;
  const g = new VoxelGrid(R * 2 + 4, H + 8, R * 2 + 4);
  const c = R + 2;
  for (let y = 0; y < H; y++) {
    const bulge = R - 1.3 + Math.sin((y / H) * Math.PI) * 1.3;
    for (let z = 0; z < g.d; z++) for (let x = 0; x < g.w; x++) {
      const d = Math.hypot(x + 0.5 - c, z + 0.5 - c);
      if (d > bulge || (d < bulge - 2 && y > 1)) continue;
      const ang = Math.atan2(z + 0.5 - c, x + 0.5 - c);
      const stave = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 18);
      let col = stave % 2 ? WOOD.base : WOOD.mid;
      if (Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 18 * 4) % 4 === 0) col = WOOD.dk;
      if (y === 3 || y === 4 || y === H - 4 || y === H - 3) col = d > bulge - 1 ? (y % 2 ? IRON.mid : IRON.hi) : col;
      if (y === H - 1) col = d < bulge - 1 ? WOOD.end : WOOD.hi;
      g.set(x, y, z, pj(col, x, y, z, 2, 0.04));
    }
  }
  // water: dark, with a bright rim of light and a few ripples
  const wy = H - 4;
  const wg = new VoxelGrid(R * 2 + 4, 2, R * 2 + 4);
  for (let z = 0; z < g.d; z++) for (let x = 0; x < g.w; x++) {
    const d = Math.hypot(x + 0.5 - c, z + 0.5 - c);
    if (d > R - 2.6) continue;
    const ring = Math.abs(d - 5) < 0.5 || Math.abs(d - 8.5) < 0.5;
    wg.set(x, 0, z, ring ? 0x3a6a7a : d > R - 4 ? 0x2a4a5a : hash3(x, 0, z, 3) < 0.04 ? 0x6aa8b8 : 0x1e3a48);
  }
  // ladle hooked over the rim
  for (let y = H - 1; y < H + 6; y++) g.set(c + R - 2, y, c, WOOD.hi);
  for (let x = c + R - 6; x <= c + R - 2; x++) g.set(x, H + 6, c, WOOD.hi);
  g.ellipsoid(c + R - 7, H + 2, c, 2.5, 2, 2.5, IRON.mid);
  const body = voxMesh(g, { pivot: [c, 0, c], scale: S32 });
  const water = voxMesh(wg, { pivot: [c, 0, c], scale: S32, kind: 'basic', outline: false, material: glowMat() });
  water.position.y = wy * S32;
  return { group: grp(body, water), water, waterY: (wy + 1) * S32, r: (R - 2) * S32 };
}

// ------------------------------------------------------------------ tools
/** The smith's sledge: a heavy cross-peen hammer. Origin at the grip, handle along +y, head at the top (face toward +z). */
export function makeSmithHammer() {
  const g = new VoxelGrid(14, 34, 14);
  for (let y = 0; y < 28; y++) for (let x = 6; x < 8; x++) for (let z = 6; z < 8; z++) {
    let c = (y * 3 + x) % 7 === 0 ? WOOD.dk : x === 6 ? WOOD.hi : WOOD.base;
    if (y < 7) c = y % 2 ? 0x4a2a16 : 0x6a3a20; // leather grip
    g.set(x, y, z, c);
  }
  // head: a long block across z (face at +z, peen at -z)
  g.box(4, 26, 1, 6, 6, 12, (x, y, z) => {
    if (z === 12 || z === 1) return z === 12 ? IRON.face : IRON.hi; // striking face, peen edge
    if (y === 31) return IRON.hi;
    if (x === 4) return IRON.dk;
    return IRON.mid;
  });
  g.box(5, 27, 13, 4, 4, 1, IRON.glint);
  g.box(5, 28, 0, 4, 2, 1, IRON.hi);
  g.box(6, 32, 6, 2, 1, 2, 0x8a5a2a); // wedge
  const m = voxMesh(g, { pivot: [7, 1, 7], scale: S32 });
  const out = grp(m);
  out.userData.head = new THREE.Vector3(0, 29 * S32, 6.5 * S32);
  return out;
}

/** Long blacksmith tongs. Origin at the grip, jaws along +y. */
export function makeTongs() {
  const g = new VoxelGrid(10, 36, 6);
  for (let y = 0; y < 31; y++) {
    const spread = y < 21 ? 1.9 - y * 0.06 : 0.6;
    for (const s of [-1, 1]) {
      const x = Math.round(5 + s * spread);
      const c = y < 7 ? (y % 2 ? 0x4a2a16 : 0x6a3a20) : y % 5 === 0 ? IRON.hi : IRON.mid;
      g.set(x, y, 2, c); g.set(x, y, 3, y < 7 ? c : IRON.dk);
      if (s < 0) g.set(x - 1, y, 2, y < 7 ? c : IRON.hi);
    }
  }
  g.box(4, 20, 1, 3, 3, 4, (x, y) => (y === 22 ? IRON.glint : IRON.mid)); // rivet boss
  for (const s of [-1, 1]) for (let y = 30; y < 35; y++) { g.set(5 + s, y, 2, IRON.dk); g.set(5 + s, y, 3, IRON.base); } // jaws
  const out = grp(voxMesh(g, { pivot: [5, 1, 3], scale: S32 }));
  out.userData.jaw = new THREE.Vector3(0, 32 * S32, 0);
  return out;
}

/**
 * The work: a blade blank being drawn out. Unlit so it glows; set heat 0..1 with setHeat(k)
 * (black iron → dull red → orange → yellow-white). Origin at the tang end, blade along +y.
 */
export function makeBlade() {
  const g = new VoxelGrid(8, 26, 4);
  for (let y = 0; y < 25; y++) {
    const hw = y < 6 ? 1 : y > 20 ? Math.max(0, (25 - y) * 0.6) : 2.2;
    for (let x = Math.round(4 - hw); x <= Math.round(4 + hw); x++) for (let z = 1; z < 3; z++) {
      const edge = Math.abs(x - 4) >= hw - 0.6;
      g.set(x, y, z, edge ? 0xe8e8e8 : y < 6 ? 0x9a9a9a : 0xffffff);
    }
  }
  const mat = voxelMaterial('basic', { unique: true });
  const m = voxMesh(g, { pivot: [4, 0, 2], scale: S32, kind: 'basic', material: mat });
  const out = grp(m);
  const cold = new THREE.Color(0x3a3a42), red = new THREE.Color(0xb02a10), orange = new THREE.Color(0xff7a20), white = new THREE.Color(0xfff2c0);
  out.userData.setHeat = (k) => {
    k = Math.max(0, Math.min(1, k));
    if (k < 0.3) mat.color.copy(cold).lerp(red, k / 0.3);
    else if (k < 0.7) mat.color.copy(red).lerp(orange, (k - 0.3) / 0.4);
    else mat.color.copy(orange).lerp(white, (k - 0.7) / 0.3);
  };
  out.userData.setHeat(1);
  out.userData.tip = new THREE.Vector3(0, 24 * S32, 0);
  return out;
}

/** Brass smithing goggles to wear pushed up on the forehead: two round amber lenses on a strap. */
export function makeGoggles(headW = 0.75) {
  const span = Math.round(headW / S32) + 2;
  const g = new VoxelGrid(span + 2, 9, 12);
  const cx = (span + 2) / 2;
  // strap around the head (only the front arc is seen)
  for (let x = 0; x < span + 2; x++) for (let y = 3; y < 6; y++) {
    const u = (x + 0.5 - cx) / (span / 2);
    const z = Math.round(9 - u * u * 7);
    g.set(x, y, z, y === 3 ? 0x5a3a20 : 0x3a2414);
  }
  // two lenses with brass rims
  for (const s of [-1, 1]) {
    const lx = cx + s * 3.6;
    for (let y = 0; y < 9; y++) for (let x = Math.floor(lx - 4); x <= Math.ceil(lx + 4); x++) {
      const d = Math.hypot(x + 0.5 - lx, y + 0.5 - 4.5);
      if (d > 4.2) continue;
      for (let z = 9; z < 12; z++) {
        if (d > 3) g.set(x, y, z, z === 11 ? 0xf0c860 : 0xb0802a);
        else if (z === 11) g.set(x, y, z, d < 1.4 && y > 4 ? 0xffe8a0 : y > 5 ? 0xe89a3a : 0xc8642a);
        else g.set(x, y, z, 0x5a2a12);
      }
    }
  }
  const m = voxMesh(g, { pivot: [cx, 4.5, 9], scale: S32 });
  return grp(m);
}

// ------------------------------------------------------------------ wall pieces
/** The tool wall: a plank board with pegs, hung with tongs, hammers, files, a saw and horseshoes. Faces +z. */
export function makeToolBoard(seed = 9) {
  const rng = makeRng(seed);
  const W = 70, H = 40;
  const g = new VoxelGrid(W, H, 8);
  // planks (vertical boards) with two cross battens
  g.box(0, 0, 0, W, H, 2, (x, y, z) => {
    const plank = Math.floor(x / 10);
    if (x % 10 === 0) return WOOD.dk;
    let c = pj(plank % 2 ? WOOD.base : WOOD.mid, x, y, z, plank + 3, 0.05, 2);
    if (Math.abs(((x + Math.sin(y * 0.3 + plank) * 1.4) % 5) - 2.5) < 0.4) c = shade(c, 0.9);
    if (y === H - 1 || x === W - 1) c = WOOD.dk;
    return c;
  });
  for (const y of [6, H - 9]) g.box(1, y, 2, W - 2, 3, 1, (x) => (x % 12 === 3 ? IRON.hi : WOOD.hi));
  const peg = (x, y) => { g.box(x, y, 2, 2, 2, 3, WOOD.end); };
  // tongs (two pairs), hanging from pegs
  const tongs = (x, y, len) => {
    peg(x, y);
    for (let i = 0; i < len; i++) { const sp = i < len * 0.6 ? 1 + i * 0.05 : 1; g.set(Math.round(x - sp + 1), y - 2 - i, 3, IRON.mid); g.set(Math.round(x + sp), y - 2 - i, 3, i % 4 ? IRON.mid : IRON.hi); }
    g.set(x, y - 4, 3, IRON.glint);
  };
  tongs(8, H - 4, 26);
  tongs(15, H - 4, 22);
  // hammers: three sizes, head up, hanging by the head over two pegs
  const hammer = (x, y, len, hw) => {
    peg(x - 2, y); peg(x + 2, y);
    g.box(x - hw, y - 3, 3, hw * 2 + 1, 3, 3, (xx, yy) => (yy === y - 1 ? IRON.hi : IRON.mid));
    for (let i = 0; i < len; i++) g.set(x, y - 4 - i, 4, i > len - 5 ? 0x4a2a16 : WOOD.base);
  };
  hammer(26, H - 5, 20, 4);
  hammer(36, H - 5, 16, 3);
  hammer(44, H - 5, 13, 2);
  // a file and a rasp
  for (let i = 0; i < 18; i++) { g.set(52, H - 6 - i, 3, i < 5 ? WOOD.base : i % 2 ? IRON.hi : IRON.mid); g.set(53, H - 6 - i, 3, i < 5 ? WOOD.dk : IRON.mid); }
  peg(52, H - 4);
  // a saw
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4 + (i >> 2); j++) g.set(58 + j, H - 8 - i, 3, j === 0 ? IRON.hi : (i + j) % 2 ? IRON.mid : IRON.face);
  g.box(57, H - 8, 3, 7, 4, 2, WOOD.hi);
  peg(60, H - 4);
  // horseshoes on the lower batten
  for (let k = 0; k < 4; k++) {
    const hx = 10 + k * 12, hy = 14;
    for (let a = 0; a < Math.PI * 1.25; a += 0.12) {
      const x = Math.round(hx + Math.cos(a - Math.PI * 0.12) * 3.5), y = Math.round(hy + Math.sin(a - Math.PI * 0.12) * 4);
      g.set(x, y, 3, a < 0.6 ? IRON.hi : IRON.mid);
    }
    peg(hx, hy + 5);
  }
  // chalk tally of orders, and a scorched handprint
  for (let i = 0; i < 7; i++) for (let y = 2; y < 6; y++) g.set(54 + i * 2, y, 2, 0xe8e0d0);
  for (let y = 2; y < 6; y++) g.set(54 + 7 + Math.round((y - 2) * 1.5), y, 2, 0xe8e0d0);
  for (const [x, y] of [[30, 8], [31, 9], [32, 8], [29, 10], [33, 10], [31, 11], [30, 11], [32, 11], [31, 12], [28, 12], [34, 12]]) g.set(x, y, 2, 0x2a1a12);
  void rng;
  return voxMesh(g, { pivot: [W / 2, 0, 0], scale: S32 });
}

/** A standing weapon rack: two finished swords, an axe and a round shield leaning on it. Faces +z. */
export function makeWeaponRack() {
  const W = 40, H = 48;
  const g = new VoxelGrid(W, H, 16);
  // frame
  for (const x of [2, W - 4]) g.box(x, 0, 6, 2, H - 4, 3, (xx, y) => (y % 9 === 0 ? WOOD.dk : WOOD.base));
  g.box(1, H - 6, 6, W - 2, 3, 3, (x) => (x % 8 === 0 ? WOOD.dk : WOOD.mid));
  g.box(1, 6, 5, W - 2, 3, 5, (x) => (x % 8 === 0 ? WOOD.dk : WOOD.mid));
  for (let x = 5; x < W - 4; x += 6) g.box(x, 9, 6, 2, 2, 3, WOOD.end);
  // swords, point down into the lower rail, hilts up
  const sword = (x, len, guard, pommel) => {
    for (let y = 8; y < 8 + len; y++) { g.set(x, y, 10, y % 6 === 0 ? IRON.glint : IRON.face); g.set(x + 1, y, 10, IRON.hi); g.set(x - 1, y, 10, IRON.mid); }
    g.set(x, 7, 10, IRON.hi);
    const gy = 8 + len;
    g.box(x - 3, gy, 9, 7, 2, 3, guard);
    for (let y = gy + 2; y < gy + 8; y++) g.set(x, y, 10, y % 2 ? 0x5a2a16 : 0x3a1a0c);
    g.box(x - 1, gy + 8, 9, 3, 2, 3, pommel);
  };
  sword(10, 28, 0xe0b040, 0xf2c23a);
  sword(19, 24, IRON.hi, 0xc04a2a);
  // axe
  for (let y = 8; y < 44; y++) g.set(28, y, 10, y % 7 === 0 ? WOOD.dk : WOOD.hi);
  for (let y = 34; y < 44; y++) for (let x = 29; x < 29 + Math.round(3 + Math.sin(((y - 34) / 10) * Math.PI) * 4); x++) g.set(x, y, 10, x === 28 + Math.round(3 + Math.sin(((y - 34) / 10) * Math.PI) * 4) ? IRON.glint : IRON.mid);
  // round shield leaning at the foot
  const sg = new VoxelGrid(30, 30, 4);
  sg.ellipsoid(15, 15, 1.5, 14, 14, 1.6, (x, y, z) => {
    const d = Math.hypot(x + 0.5 - 15, y + 0.5 - 15);
    if (d > 12.6) return IRON.mid;
    if (d < 3.2) return d < 2 ? IRON.glint : IRON.hi;
    const plank = Math.floor((x + 1) / 5);
    return x % 5 === 0 ? WOOD.dk : plank % 2 ? 0x8a2a1e : 0xa83a26;
  });
  const shield = voxMesh(sg, { pivot: [15, 0, 2], scale: S32 });
  shield.position.set(-0.05, 0, 0.5);
  shield.rotation.set(-0.28, 0.2, 0.05);
  return grp(voxMesh(g, { pivot: [W / 2, 0, 8], scale: S32 }), shield);
}

/** A heap of coal with a shovel stuck in it. */
export function makeCoalPile(seed = 4) {
  const rng = makeRng(seed);
  const R = 18;
  const g = new VoxelGrid(R * 2 + 4, 18, R * 2 + 4);
  const c = R + 2;
  for (let i = 0; i < 70; i++) {
    const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng()) * R * 0.9;
    const x = c + Math.cos(a) * r, z = c + Math.sin(a) * r;
    const top = (1 - r / R) * 12;
    const y = rng.range(0, Math.max(1, top));
    const s = rng.range(1.6, 3.2);
    g.ellipsoid(x, y + s * 0.5, z, s, s * 0.8, s, (xx, yy, zz, dx, dy) => (dy > 0.4 ? (hash3(xx, yy, zz, 2) < 0.3 ? 0x5a5a66 : 0x3a3a44) : hash3(xx, yy, zz, 3) < 0.5 ? 0x1e1e24 : 0x2a2a32));
  }
  // shovel
  bar(g, [c + 4, 4, c - 2], [c + 14, 17, c - 6], 0.8, 0.8, () => WOOD.base);
  g.box(c + 1, 1, c - 3, 6, 6, 1, (x, y) => (y === 6 ? IRON.hi : IRON.mid));
  return voxMesh(g, { pivot: [c, 0, c], scale: S32 });
}

/** A neat stack of ingots: iron, copper and a couple of gold. */
export function makeIngots() {
  const g = new VoxelGrid(24, 12, 16);
  const ingot = (x, y, z, col, hi) => {
    g.box(x, y, z, 9, 3, 4, (xx, yy, zz) => (yy === y + 2 ? (xx === x || xx === x + 8 ? col : hi) : zz === z ? shade(col, 0.85) : col));
  };
  ingot(1, 0, 2, 0x6a6872, 0x9a98a6); ingot(12, 0, 2, 0x6a6872, 0x9a98a6);
  ingot(1, 0, 9, 0xb05a2a, 0xe08a4a); ingot(12, 0, 9, 0xb05a2a, 0xe08a4a);
  ingot(4, 3, 3, 0xd8a030, 0xffe08a); ingot(10, 3, 8, 0x6a6872, 0x9a98a6);
  ingot(7, 6, 5, 0xd8a030, 0xffe08a);
  return voxMesh(g, { pivot: [12, 0, 8], scale: S32 });
}

/** A grindstone: a sandstone wheel on a wooden frame with a crank. Returns { group, wheel } (spin wheel.rotation.x). */
export function makeGrindstone() {
  const fg = new VoxelGrid(30, 30, 22);
  for (const z of [3, 17]) {
    bar(fg, [6, 0, z], [15, 19, z], 1.2, 1.2, () => WOOD.base);
    bar(fg, [24, 0, z], [15, 19, z], 1.2, 1.2, () => WOOD.mid);
  }
  bar(fg, [5, 4, 3], [5, 4, 18], 1, 1, () => WOOD.dk);
  // axle + crank
  for (let z = 1; z < 21; z++) fg.set(15, 19, z, IRON.mid);
  fg.box(15, 13, 20, 1, 7, 1, IRON.mid);
  fg.box(15, 13, 21, 1, 1, 1, WOOD.hi);
  const frame = voxMesh(fg, { pivot: [15, 0, 11], scale: S32 });
  const wg = new VoxelGrid(26, 26, 6);
  for (let y = 0; y < 26; y++) for (let x = 0; x < 26; x++) {
    const d = Math.hypot(x + 0.5 - 13, y + 0.5 - 13);
    if (d > 12.5) continue;
    for (let z = 0; z < 6; z++) {
      let c = pj(0xb8a07a, x, y, z, 3, 0.05, 2);
      if (d > 11.4) c = 0x9a8460;
      if (z === 0 || z === 5) c = Math.round(d) % 3 === 0 ? 0xa48c68 : c;
      if (d < 2) c = IRON.mid;
      wg.set(x, y, z, c);
    }
  }
  const wheel = new THREE.Group();
  const wm = voxMesh(wg, { pivot: [13, 13, 3], scale: S32 });
  wm.rotation.y = Math.PI / 2;
  wheel.add(wm);
  wheel.position.set(0, 19.5 * S32, 0);
  wheel.userData.dynamic = true;
  return { group: grp(frame, wheel), wheel };
}

/** A hanging chain hoist hook from the ceiling. Origin at the top; hangs `len` units. */
export function makeHoist(len = 1.6) {
  const n = Math.round(len / S32);
  const g = new VoxelGrid(8, n + 10, 8);
  for (let y = 0; y < n; y++) {
    const link = Math.floor(y / 4) % 2;
    const ly = y % 4;
    if (link) { g.set(3, n + 8 - y, 4, ly === 0 || ly === 3 ? IRON.mid : IRON.hi); }
    else { if (ly === 0 || ly === 3) { g.set(3, n + 8 - y, 3, IRON.mid); g.set(3, n + 8 - y, 5, IRON.mid); } else { g.set(3, n + 8 - y, 3, IRON.hi); g.set(3, n + 8 - y, 5, IRON.dk); } }
  }
  // the hook
  for (let a = 0; a < Math.PI * 1.3; a += 0.15) g.set(Math.round(4 + Math.cos(a + Math.PI) * 2.5), Math.round(5 - Math.sin(a) * 3.5 + 0), 4, a < 0.5 ? IRON.hi : IRON.mid);
  for (let y = 5; y < 9; y++) g.set(4, y, 4, IRON.mid);
  return voxMesh(g, { pivot: [4, n + 9, 4], scale: S32 });
}

/** Cave timber: two posts and a cap beam (a mine support frame), `w` units wide, `h` tall. Faces +z. */
export function makeTimberFrame(w = 2.4, h = 2.6, seed = 2) {
  const W = Math.round(w / S32), H = Math.round(h / S32);
  const g = new VoxelGrid(W + 8, H + 6, 10);
  const wood = (x, y, z, along) => {
    const grain = Math.floor(along * 0.45 + z * 1.3) % 6 === 0;
    let c = grain ? WOOD.dk : pj(0x6a4426, x, y, z, seed, 0.07, 2);
    if (hash3(x >> 1, y >> 1, z >> 1, seed) < 0.03) c = 0x2e1c10;
    return c;
  };
  for (const x0 of [2, W + 1]) g.box(x0, 0, 2, 5, H, 6, (x, y, z) => wood(x, y, z, y));
  g.box(0, H, 1, W + 8, 6, 8, (x, y, z) => (y === H + 5 ? shade(wood(x, y, z, x), 1.1) : wood(x, y, z, x)));
  // iron brackets at the joints
  for (const x0 of [2, W + 1]) g.box(x0 - 1, H - 3, 7, 7, 3, 2, (x, y) => (y === H - 1 ? IRON.hi : IRON.mid));
  return voxMesh(g, { pivot: [(W + 8) / 2, 0, 5], scale: S32 });
}

export { IRON, WOOD };

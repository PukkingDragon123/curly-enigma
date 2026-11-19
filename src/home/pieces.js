// The Builder's Hammer's pieces (wave 16): the structural bits the mole hammers into its alcoves from
// timber, cobble and brick (data/furniture.js `piece: true`, `made`, `lv`, `blows`). Detailed 1/32
// voxel models in the furniture contract (src/iso/furniture32.js: centred on the footprint, front
// facing +z, back against z = 0), registered into BUILDERS32 so the home builds them like any
// furniture. Grain runs along each board, nails and straps catch the light, stone is laid in
// courses with mortar, and every piece gets a little wear (chips, moss, scuffs).
import { FURNITURE } from '../data/furniture.js';
import { BUILDERS32 } from '../iso/furniture32.js';
import { VoxelGrid, C, wood, beam, iron, stone, mulc, mixc, h3, M32 } from '../iso/kit.js';

const T = 32;
function fg(id, h) {
  const [w, d] = FURNITURE[id]?.size || [1, 1];
  return new VoxelGrid(w * T, h, d * T);
}
const M = (g) => M32(g, [g.w / 2, 0, g.d / 2]);
const NAIL = 0x9aa0a8, NAIL_HI = 0xd8dce4, STRAP = C.iron;
/** A round-headed nail (2×2 with a bright corner) on a face. axis: which face ('z' front, 'x' side, 'y' top). */
function nail(g, x, y, z, axis = 'z') {
  if (axis === 'z') { g.box(x, y, z, 2, 2, 1, NAIL); g.set(x, y + 1, z, NAIL_HI); }
  else if (axis === 'x') { g.box(x, y, z, 1, 2, 2, NAIL); g.set(x, y + 1, z, NAIL_HI); }
  else { g.box(x, y, z, 2, 1, 2, NAIL); g.set(x, y, z, NAIL_HI); }
}
/** Chip a few voxels off edges (wear), seeded. */
function wear(g, seed, n = 14) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(h3(i, 1, seed, 3) * g.w), y = Math.floor(h3(i, 2, seed, 5) * g.h), z = Math.floor(h3(i, 3, seed, 7) * g.d);
    if (g.get?.(x, y, z) && (x === 0 || z === 0 || x === g.w - 1 || z === g.d - 1)) g.clear(x, y, z);
  }
}
const PLANK = 0xa8743e, PLANK_D = 0x7a4e26;

// ---------------------------------------------------------------- timber
function post(id) {
  const g = fg(id, 124);
  g.box(8, 0, 8, 16, 5, 16, stone(C.stoneD, { seed: 3 })); // a flat footing stone
  g.box(11, 5, 11, 10, 112, 10, beam(0x6e4626, 'y', 4));
  for (const [x, z] of [[11, 11], [20, 11], [11, 20], [20, 20]]) g.box(x, 5, z, 1, 112, 1, (xx, y) => mulc(0x5a3a1e, y % 11 === 0 ? 0.85 : 1)); // chamfered arrises
  for (const y of [18, 96]) { g.box(10, y, 10, 12, 4, 12, iron(STRAP, y)); nail(g, 15, y + 1, 9); nail(g, 21, y + 1, 15, 'x'); }
  // the cap: a corbel bracket under the rock
  g.box(6, 113, 10, 20, 6, 12, beam(0x5a3a1e, 'x', 9));
  g.box(8, 109, 11, 4, 4, 10, beam(0x5a3a1e, 'x', 9)); g.box(20, 109, 11, 4, 4, 10, beam(0x5a3a1e, 'x', 9));
  g.box(4, 119, 9, 24, 3, 14, wood(PLANK_D, { axis: 'x', across: 'z', pw: 99, seed: 2 }));
  for (let i = 0; i < 9; i++) g.set(11 + (i % 3) * 4, 30 + i * 9, 21, mulc(0x6e4626, 0.7)); // adze marks
  return { obj: M(g) };
}

function crate(id) {
  const g = fg(id, 26);
  const side = wood(PLANK, { axis: 'x', across: 'y', pw: 6, seed: 5 });
  g.box(3, 0, 3, 26, 24, 26, side);
  for (let x = 5; x < 27; x++) for (let y = 2; y < 22; y++) for (let z = 5; z < 27; z++) g.clear(x, y, z); // hollow, light
  g.box(3, 23, 3, 26, 2, 26, wood(PLANK, { axis: 'z', across: 'x', pw: 6, seed: 7 })); // lid boards
  // the frame: dark corner battens and a diagonal brace on the front and side
  for (const [x, z] of [[2, 2], [26, 2], [2, 26], [26, 26]]) g.box(x, 0, z, 4, 26, 4, beam(PLANK_D, 'y', x + z));
  for (let i = 0; i < 20; i++) { g.box(5 + i, 2 + i, 28, 2, 2, 2, PLANK_D); g.box(28, 2 + i, 24 - i, 2, 2, 2, PLANK_D); }
  for (const [x, y] of [[4, 2], [26, 2], [4, 21], [26, 21], [14, 12]]) nail(g, x, y, 30);
  for (const [z, y] of [[4, 2], [26, 2], [4, 21], [26, 21]]) nail(g, 30, y, z, 'x');
  g.box(10, 25, 12, 12, 1, 8, 0xc8a878); g.box(14, 25, 8, 4, 1, 16, 0xc8a878); // a rope tie on the lid
  wear(g, 11);
  return { obj: M(g) };
}

function deck(id) {
  const g = fg(id, 6);
  // joists underneath, showing at the ends
  for (const z of [4, 30, 56]) g.box(0, 0, z, 64, 3, 4, beam(PLANK_D, 'x', z));
  // boards across, one plank (6 voxels) at a time, ends staggered, a nail row over each joist
  for (let x = 0; x < 64; x += 6) {
    const c = mulc(PLANK, 0.9 + h3(x, 0, 3) * 0.2);
    g.box(x, 3, 0, 6, 2, 64, wood(c, { axis: 'z', across: 'x', pw: 6, seed: x }));
    g.box(x, 3, 0, 1, 2, 64, mulc(c, 0.7)); // the seam
    for (const z of [5, 31, 57]) { g.set(x + 2, 5, z, NAIL); g.set(x + 3, 5, z + 1, NAIL_HI); }
  }
  g.box(0, 3, 0, 64, 2, 1, PLANK_D); g.box(0, 3, 63, 64, 2, 1, PLANK_D);
  return { obj: M(g) };
}

function panel(id) {
  const g = fg(id, 122);
  const z0 = 12;
  g.box(0, 0, z0 - 2, 5, 122, 12, beam(0x6e4626, 'y', 3)); g.box(27, 0, z0 - 2, 5, 122, 12, beam(0x6e4626, 'y', 5)); // posts
  // upright boards, slightly different lengths and tones
  for (let x = 5; x < 27; x += 6) {
    const top = 112 + Math.floor(h3(x, 1, 2) * 6), c = mulc(PLANK, 0.88 + h3(x, 0, 5) * 0.22);
    g.box(x, 2, z0, Math.min(6, 27 - x), top, 6, wood(c, { axis: 'y', across: 'x', pw: 6, seed: x }));
    g.box(x, 2, z0 + 5, 1, top, 1, mulc(c, 0.66));
  }
  for (const y of [16, 62, 104]) { g.box(0, y, z0 + 6, 32, 6, 4, beam(PLANK_D, 'x', y)); for (let x = 7; x < 27; x += 6) nail(g, x, y + 2, z0 + 10); }
  // a knot hole and a lantern hook
  g.box(15, 80, z0 + 5, 2, 2, 1, 0x2a1a0e); g.box(22, 92, z0 + 10, 2, 6, 2, STRAP); g.box(22, 92, z0 + 12, 2, 2, 3, STRAP);
  return { obj: M(g) };
}

function shelf(id) {
  const g = fg(id, 84);
  const up = beam(PLANK_D, 'y', 6);
  g.box(1, 0, 1, 4, 84, 14, up); g.box(27, 0, 1, 4, 84, 14, up);
  g.box(5, 2, 0, 22, 80, 2, wood(0x5a3a1e, { axis: 'y', across: 'x', pw: 6, seed: 3 })); // back boards
  for (const y of [4, 30, 56, 80]) { g.box(1, y, 1, 30, 3, 15, wood(PLANK, { axis: 'x', across: 'z', pw: 99, seed: y })); nail(g, 2, y + 1, 16); nail(g, 28, y + 1, 16); }
  // things on the shelves: jars of preserves, a pot, a coil of rope, a candle
  const jar = (x, y, c) => { g.box(x, y, 6, 5, 7, 5, (xx, yy, zz) => (yy === y + 6 ? 0xc8a878 : xx === x || zz === 6 ? mixc(c, 0xffffff, 0.35) : c)); g.box(x + 1, y + 7, 7, 3, 1, 3, 0x8a5a3a); };
  jar(7, 7, 0xc84a3a); jar(14, 7, 0xe0a030); jar(20, 33, 0x5a9a3a);
  g.box(7, 33, 5, 8, 8, 8, (x, y) => (y === 40 ? 0x5a4636 : y % 3 === 0 ? 0x8a4a2a : 0xa85a32)); // a clay pot
  for (let i = 0; i < 4; i++) g.box(8 + i, 59 + i * 2, 6, 10 - i * 2, 2, 8, 0xc8a878); // rope coil
  g.box(21, 59, 8, 3, 8, 3, 0xf0e6d0); g.set(22, 67, 9, 0xffc040); // a candle
  return { obj: M(g) };
}

// ---------------------------------------------------------------- stone
function stoneWall(id) {
  const g = fg(id, 122);
  g.box(0, 0, 6, 32, 6, 20, stone(C.stoneD, { seed: 8 })); // footing
  // cobbles in rough courses, each its own tone, mortar in between
  for (let y = 6; y < 118; y += 8) {
    const off = ((y / 8) % 2) * 5;
    for (let x = -off; x < 32; x += 10) {
      const w = 9 + Math.floor(h3(x, y, 4) * 3), c = mulc(C.stone, 0.82 + h3(x, y, 9) * 0.3);
      g.box(Math.max(0, x), y, 8, Math.min(w, 32 - Math.max(0, x)), 7, 16, (xx, yy, zz) => (zz === 23 || zz === 8 ? mulc(c, 1.08) : c) * 1);
      g.box(Math.max(0, x), y + 7, 9, Math.min(w, 32 - Math.max(0, x)), 1, 14, 0xb8ad98); // mortar bed
    }
  }
  g.box(0, 118, 7, 32, 4, 18, stone(C.stoneL, { seed: 2 })); // cap stones
  for (let i = 0; i < 22; i++) { const x = Math.floor(h3(i, 0, 3) * 32), y = Math.floor(h3(i, 1, 3) * 14); g.set(x, 6 + y, 24, h3(i, 2, 3) < 0.5 ? C.moss : C.mossL); }
  return { obj: M(g) };
}

function pillar(id) {
  const g = fg(id, 124);
  g.box(1, 0, 1, 30, 6, 30, stone(C.stoneD, { seed: 5 }));
  g.box(3, 6, 3, 26, 4, 26, stone(C.stone, { seed: 6 }));
  // the shaft: dressed blocks, every course offset, a fillet groove at each joint
  for (let y = 10; y < 108; y += 12) {
    const c = mulc(C.stoneL, 0.88 + h3(y, 0, 2) * 0.16);
    g.box(6, y, 6, 20, 11, 20, (x, yy, z) => mulc(c, (x === 6 || z === 25 ? 0.9 : 1) * (h3(x, yy, z, 4) > 0.94 ? 0.85 : 1)));
    g.box(6, y + 11, 6, 20, 1, 20, 0x9a9080);
  }
  // capital: a carved ring of leaves and a wide abacus
  g.box(4, 108, 4, 24, 5, 24, (x, y, z) => ((x + z) % 4 === 0 ? C.stoneD : C.stoneL));
  g.box(2, 113, 2, 28, 4, 28, stone(C.stone, { seed: 7 }));
  g.box(1, 117, 1, 30, 5, 30, stone(C.stoneL, { seed: 8 }));
  for (const [x, z] of [[6, 26], [25, 26], [6, 5], [25, 5]]) g.box(x, 20, z, 1, 3, 1, C.moss);
  return { obj: M(g) };
}

function brick(id) {
  const g = fg(id, 122);
  g.box(0, 0, 7, 32, 8, 18, stone(C.stoneD, { seed: 4 }));
  const BR = [0xa8482a, 0xb85434, 0x9a3e24, 0xc06040, 0x8a3a22];
  for (let y = 8; y < 118; y += 5) {
    const off = ((y - 8) / 5) % 2 ? 4 : 0;
    for (let x = -off; x < 32; x += 8) {
      const c = BR[Math.floor(h3(x + 99, y, 5) * BR.length)];
      const x0 = Math.max(0, x), w = Math.min(7, 32 - x0, x + 7 - x0);
      if (w > 0) g.box(x0, y, 8, w, 4, 16, (xx, yy, zz) => (zz === 23 && yy === y + 3 ? mulc(c, 1.12) : h3(xx, yy, zz, 6) > 0.95 ? mulc(c, 0.8) : c));
    }
    g.box(0, y + 4, 9, 32, 1, 14, 0xc8bca8);
  }
  g.box(0, 118, 7, 32, 4, 18, stone(C.stone, { seed: 9 }));
  wear(g, 5, 10);
  return { obj: M(g) };
}

// ---------------------------------------------------------------- furniture
function bench(id) {
  const g = fg(id, 26);
  const leg = beam(PLANK_D, 'y', 3);
  for (const x of [8, 50]) {
    // trestle: two splayed legs, a foot and a cross-tie
    for (let y = 0; y < 18; y++) { const s = Math.round((18 - y) * 0.25); g.box(x - s, y, 5, 4, 1, 4, leg); g.box(x - s, y, 23, 4, 1, 4, leg); }
    g.box(x - 5, 0, 3, 12, 2, 26, beam(PLANK_D, 'z', x));
    g.box(x - 1, 16, 4, 6, 3, 24, beam(PLANK_D, 'z', x + 1));
  }
  g.box(10, 8, 14, 44, 3, 4, beam(0x6e4626, 'x', 4)); // stretcher
  g.box(0, 19, 2, 64, 3, 28, wood(PLANK, { axis: 'x', across: 'z', pw: 7, seed: 6 })); // the seat boards
  for (const x of [9, 51]) for (const z of [5, 12, 19, 26]) g.set(x, 22, z, NAIL), g.set(x + 1, 22, z, NAIL_HI);
  return { obj: M(g), seats: [{ x: -0.25, z: 0.05, y: 0.36, yaw: 0 }, { x: 0.25, z: 0.05, y: 0.36, yaw: 0 }] };
}

function table(id) {
  const g = fg(id, 40);
  const leg = beam(PLANK_D, 'y', 5);
  for (const x of [9, 51]) {
    for (let y = 0; y < 34; y++) { const s = Math.round(Math.abs(17 - y) * 0.18); g.box(x - s, y, 6, 4, 1, 4, leg); g.box(x + s, y, 22, 4, 1, 4, leg); }
    g.box(x - 3, 0, 4, 10, 2, 24, beam(PLANK_D, 'z', x)); g.box(x - 1, 31, 3, 6, 3, 26, beam(PLANK_D, 'z', x + 2));
  }
  g.box(10, 12, 14, 44, 4, 4, beam(0x6e4626, 'x', 6));
  g.box(0, 34, 1, 64, 4, 30, wood(PLANK, { axis: 'x', across: 'z', pw: 6, seed: 8 }));
  g.box(0, 34, 1, 64, 1, 30, mulc(PLANK, 0.8));
  for (const x of [10, 52]) for (const z of [3, 9, 15, 21, 27]) g.set(x, 38, z, NAIL), g.set(x + 1, 38, z, NAIL_HI);
  // a candle stub and a scatter of crumbs
  g.box(30, 38, 14, 3, 5, 3, 0xf0e6d0); g.set(31, 43, 15, 0xffc040);
  return { obj: M(g) };
}

Object.assign(BUILDERS32, {
  hp_post: post, hp_crate: crate, hp_deck: deck, hp_panel: panel, hp_shelf: shelf,
  hp_stone: stoneWall, hp_pillar: pillar, hp_brick: brick, hp_bench: bench, hp_table: table,
});

/** Every hammer piece id, by the Building level that teaches it. */
export const PIECES = Object.keys(FURNITURE).filter((id) => FURNITURE[id].piece).sort((a, b) => (FURNITURE[a].lv || 1) - (FURNITURE[b].lv || 1));

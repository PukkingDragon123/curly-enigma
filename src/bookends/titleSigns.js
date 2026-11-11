// The title's trail signpost, in voxels: a weathered oak post set in a little cairn of mossy stones,
// a shingled gable cap (the birds like to sit on it), ivy climbing it, toadstools and a fern at its
// foot, and one arrow board per menu option. Each board hangs on a single nail between two rope
// lashings, so it can swing; its words are carved into the wood and painted (cream; gold on the
// first board), with a worn edge, grain, knots, an old split, lichen, moss along the top and a rust
// streak under the nail.
// Voxel sizes come from the size rule (src/gfx/voxRes.js): a board is furniture (voxelSizeFor(~1 m)
// = 1/32 m), refined once (refineGrid: worn, rounded edges) to the 1/64 m its carving needs (the
// letters are small detail: voxelSizeFor(0.11 m) = 1/64 m); nails, rope, ivy, toadstools and the
// cairn's stones are small things (1/64 m); the post and its cap are a prop the camera sees up close
// (1/32 m, as the guide asks for close props).
//
//   const P = makeSignpost(items, { face });   scene.add(P.group)   (face: the boards' turn on the post, radians)
//     items: [{ label, primary?, dir: 1 (points right) | -1 }]
//   P.boards[i]: { pivot (Object3D at the nail), box (local Box3, metres), label, dir, ... }
//   P.update(dt, camera, heightPx)   springs (the boards swing on their nails), light, glints, crumbs
//   P.setFocus(i | -1, nudge = true)   the board catches the light (and wobbles)
//   P.knock(i, k)         a sharp knock (pressed / chosen)
//   P.setLabel(i, text)   re-carve a board
//   P.perch               local point on the cap's ridge (for a bird)
//   P.materials           every material (for shader warm-up)
//   P.dispose()
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VoxelGrid, meshVoxGreedy, hash3, fshade, fmix } from './vox.js';
import { voxelSizeFor, refineGrid } from '../gfx/voxRes.js';
import { glyphRows, textWidth } from './pixfont.js';
import { forestToon } from './forestfx.js';
import { makeMushroomGeo, makeFernGeo, makeBoulderGeo } from './forest/flora.js';
import { Twinkles, Particles, SHAPE, makeGlow } from './fx.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { makeNoise2D, makeRng, clamp } from '../core/util.js';

// ------------------------------------------------------------------ palettes
/** Board woods: darkest, dark, base, light, sun-bleached. */
const WOODS = {
  oak: [0x4a2c18, 0x6a4226, 0x845638, 0xa2724a, 0xbcaa8c],
  pine: [0x4a2c12, 0x6a4220, 0x84572c, 0xa2733e, 0xbaa482],
  ash: [0x3c322a, 0x52463a, 0x685a4a, 0x847462, 0xaaa08c],
  walnut: [0x26160c, 0x3c2416, 0x50321e, 0x6a462c, 0x8e7a64],
};
const POST = [0x3a2e24, 0x4e4034, 0x645444, 0x7c6a56, 0x9a8a74];
const MOSS = [0x86a844, 0x6e9638, 0x5a8230, 0x486c28, 0x3a5a22];
const LICHEN = [0xc8c890, 0xa8b878, 0xd8d0a0];
const IVY = [0x3a6a2e, 0x2e5a28, 0x4a7a34, 0x24481e, 0x5a8a3c];
const IRON = [0x24202a, 0x403c48, 0x5e5a66, 0x9894a2];
const RUST = [0x7a4428, 0x8e5432, 0x6a3a22];
const ROPE = [0xd2ac6c, 0xb08a50, 0x86663a, 0x5e4626];
const PAINT = { cream: [0xf4ead0, 0xe8dcbc, 0xd6c8a4], gold: [0xffe680, 0xffd050, 0xe8aa34] };
const CARVE = 0x2a160a; // bare wood at the bottom of a chipped groove

const BOARD_VOX = voxelSizeFor(1.0); // furniture: 1/32 m
const CARVE_VOX = voxelSizeFor(0.11); // the letters: 1/64 m
const BK = Math.round(1 / BOARD_VOX), CK = Math.round(1 / CARVE_VOX); // voxels per metre
const REFINE = Math.max(0, Math.round(Math.log2(CK / BK))); // 2x steps from the board's voxel to the carving's
const PK = 32; // the post (a prop the camera sees up close)
const POST_W = 6; // post cross-section (post voxels): 0.19 m
const POST_H = 82; // post voxels above its foot (incl. 3 buried): 2.56 m

// ------------------------------------------------------------------ one arrow board
/**
 * Build a board's two meshes' geometries: the wood (with its carving, nail, moss) and the paint in
 * the letters. Local frame: the nail at the origin, the board's back face on z = 0, its face toward +z,
 * the arrow pointing +x (dir 1) or -x (dir -1). Returns { wood, paint, box, len, h, tip }.
 */
function buildBoard({ label, dir = 1, primary = false, seed = 1, wood = 'oak' }) {
  const ramp = WOODS[wood] || WOODS.oak;
  const S = CK / BK; // fine voxels per board voxel
  const tw = textWidth(label); // fine voxels
  const H = primary ? 18 : 16; // fine voxels tall
  const root = 18; // root end to the first letter (the nail sits over the post 8 in)
  const tipLen = H / 2;
  let L = root + tw + 5 + tipLen;
  L = Math.ceil(L / S) * S;
  const L32 = L / S, H32 = H / S, D32 = 2;
  const n1 = makeNoise2D(seed * 7 + 1), n2 = makeNoise2D(seed * 7 + 2);
  const rng = makeRng(seed * 13 + 5);
  // ---- the plank at the board's voxel: shape, grain, weathering, a knot
  const g = new VoxelGrid(L32, H32, D32);
  const mid = (H32 - 1) / 2;
  const tip32 = H32 / 2;
  const knot = { x: L32 - tip32 - rng.range(2, 4.5), y: rng() < 0.5 ? rng.range(0.8, 2) : rng.range(H32 - 2.5, H32 - 1.5) }; // (by the tip, off the words' middle rows)
  const streak = Array.from({ length: H32 }, () => rng.range(0, 100));
  for (let x = 0; x < L32; x++) for (let y = 0; y < H32; y++) {
    const j = L32 - 1 - x; // from the tip
    if (j < tip32 && Math.abs(y - mid) > j + 0.5) continue; // the arrow's point
    if (x < 2 && Math.abs(y - mid) < (2 - x) * 0.9) continue; // a swallowtail notch at the root
    for (let z = 0; z < D32; z++) {
      const v = n1(x * 0.07 + streak[y] * 0.01, y * 0.62) * 0.65 + n2(x * 0.23, y * 1.4 + z) * 0.3;
      let c = v > 0.38 ? ramp[3] : v > -0.12 ? ramp[2] : v > -0.5 ? ramp[1] : ramp[0];
      // long fibres: a dark line now and then along a row
      if (hash3(Math.floor((x + streak[y]) / 5), y, 0, seed) < 0.12 && hash3(x, y, z, seed + 1) < 0.7) c = ramp[1];
      // a knot: dark heart, a ring round it, the grain swirling past
      const kd = Math.hypot((x - knot.x) * 0.8, y - knot.y);
      if (kd < 0.7) c = ramp[0]; else if (kd < 1.4) c = fmix(ramp[1], ramp[2], 0.4); else if (kd < 2.2 && v > 0) c = ramp[3];
      // weather: the top bleached silver by the sun, the bottom darker with damp, the ends grey
      if (y === H32 - 1) c = fmix(c, ramp[4], 0.5);
      else if (y === 0) c = fshade(c, 0.86);
      if (x === 0 || j === 0) c = fmix(c, ramp[4], 0.3);
      g.set(x, y, z, c);
    }
  }
  refineGrid(g, REFINE);
  // ---- the fine grid: room for moss on top and the nail head / moss in front
  const W = g.w, Hf = H + 3, D = g.d + 1;
  const fz = g.d - 1; // the front face layer
  const wd = new VoxelGrid(W, Hf, D), pt = new VoxelGrid(W, Hf, D);
  const mx = (x) => (dir > 0 ? x : W - 1 - x);
  for (let z = 0; z < g.d; z++) for (let y = 0; y < g.h; y++) for (let x = 0; x < W; x++) {
    const v = g.data[x + W * (y + g.h * z)];
    if (v) wd.data[wd.idx(mx(x), y, z)] = v;
  }
  const solid = (x, y, z) => wd.filled(x, y, z);
  // ---- an old split running in from the tip (it stops short of the words)
  {
    const sy = Math.round(H / 2 + (rng() < 0.5 ? -1 : 1) * rng.range(1.5, 3.5));
    let y = sy;
    const x0 = W - 1 - Math.round(tipLen - Math.abs(sy - H / 2));
    const len = Math.min(Math.round(rng.range(7, 12)), x0 - (root + tw) - 1);
    for (let i = 0; i < len; i++) {
      const x = mx(x0 - i + 1);
      if (rng() < 0.25) y += rng() < 0.5 ? -1 : 1;
      for (const z of [fz, fz - 1]) if (solid(x, y, z)) wd.set(x, y, z, i < len * 0.6 ? CARVE : ramp[0]);
    }
  }
  // ---- the words, carved in and painted
  const tx0 = dir > 0 ? root : W - root - tw;
  const ty0 = Math.floor((H - 7) / 2) + (primary ? 0 : 0);
  const paint = primary ? PAINT.gold : PAINT.cream;
  const ink = new Set();
  let cx = tx0;
  for (const ch of label.toUpperCase()) {
    const rows = glyphRows(ch);
    for (let gy = 0; gy < rows.length; gy++) for (let gx = 0; gx < rows[gy].length; gx++) {
      if (rows[gy][gx] !== '#') continue;
      const x = cx + gx, y = ty0 + (rows.length - 1 - gy);
      ink.add(x + ',' + y);
      wd.clear(x, y, fz);
      wd.clear(x, y, fz - 1);
      // worn paint: a few chips show the bare groove
      if (hash3(x, y, 3, seed) < 0.07) wd.set(x, y, fz - 1, CARVE);
      else pt.set(x, y, fz - 1, hash3(x >> 1, y, 5, seed) < 0.3 ? paint[1] : hash3(x, y, 6, seed) < 0.12 ? paint[2] : paint[0]);
    }
    cx += rows[0].length + 1;
  }
  // the lips of the cuts: the lower lip catches the light, the upper one is a shade darker
  for (const k of ink) {
    const [x, y] = k.split(',').map(Number);
    if (!ink.has(x + ',' + (y - 1)) && solid(x, y - 1, fz)) wd.set(x, y - 1, fz, fshade(wd.get(x, y - 1, fz), 1.1));
    if (!ink.has(x + ',' + (y + 1)) && solid(x, y + 1, fz)) wd.set(x, y + 1, fz, fshade(wd.get(x, y + 1, fz), 0.84));
  }
  // the first board has a carved border line
  if (primary) {
    const x0 = dir > 0 ? 13 : tipLen + 3, x1 = dir > 0 ? W - tipLen - 3 : W - 14;
    for (let x = x0; x <= x1; x++) for (const y of [2, H - 3]) if (!ink.has(x + ',' + y) && solid(x, y, fz)) { wd.clear(x, y, fz); wd.set(x, y, fz - 1, fshade(ramp[0], 0.8)); }
    for (let y = 2; y <= H - 3; y++) for (const x of [x0, x1]) if (solid(x, y, fz)) { wd.clear(x, y, fz); wd.set(x, y, fz - 1, fshade(ramp[0], 0.8)); }
  }
  // ---- the nail (a square iron head proud of the face) and its rust streak; an old empty nail hole
  const nx = mx(8), ny = Math.floor(H / 2) - 1;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const x = nx + (dir > 0 ? dx : -dx), y = ny + dy;
    wd.set(x, y, fz + 1, dy === 1 && dx === 0 ? IRON[3] : dy === 1 ? IRON[2] : dx === 0 ? IRON[1] : IRON[0]);
  }
  for (let i = 1; i < 6; i++) for (let dx = 0; dx < 2; dx++) {
    const x = nx + (dir > 0 ? dx : -dx), y = ny - i;
    if (solid(x, y, fz) && hash3(x, y, 9, seed) < 1 - i * 0.16) wd.set(x, y, fz, RUST[(i + dx) % 3]);
  }
  { const hx = mx(W - tipLen - 6), hy = H - 5; if (solid(hx, hy, fz) && !ink.has(hx + ',' + hy)) { wd.set(hx, hy, fz, CARVE); wd.set(hx, hy - 1, fz, RUST[2]); } }
  // ---- moss along the top (thick by the post), lichen on the face, a little moss in the lower corner
  const mossAt = (x, y, z, c) => { if (!wd.filled(x, y, z) && wd.filled(x, y - 1, z)) wd.set(x, y, z, c); };
  const patches = [{ c: 6, w: 9 }, { c: rng.range(20, W - 20), w: rng.range(4, 8) }, { c: W - tipLen - rng.range(4, 9), w: 4 }];
  for (const p of patches) {
    const px = mx(Math.round(p.c));
    for (let dx = -Math.ceil(p.w); dx <= Math.ceil(p.w); dx++) {
      const x = px + dx;
      for (let z = 0; z <= fz; z++) {
        let top = -1;
        for (let y = H - 1; y >= 0; y--) if (wd.filled(x, y, z)) { top = y; break; }
        if (top < 0) continue;
        const e = Math.abs(dx) / p.w;
        if (hash3(x, z, 1, seed) < 0.85 - e * 0.5) mossAt(x, top + 1, z, MOSS[(hash3(x, z, 2, seed) * 3) | 0]);
        if (e < 0.5 && hash3(x, z, 3, seed) < 0.55) mossAt(x, top + 2, z, MOSS[(hash3(x, z, 4, seed) * 2) | 0]);
        if (e < 0.25 && hash3(x, z, 7, seed) < 0.3) mossAt(x, top + 3, z, MOSS[0]);
      }
      // a few strands hanging over the front edge
      if (hash3(x, 0, 8, seed) < 0.35 && wd.filled(x, H - 1, fz)) { wd.set(x, H - 1, fz + 1, MOSS[2]); if (hash3(x, 1, 8, seed) < 0.4) wd.set(x, H - 2, fz + 1, MOSS[3]); }
    }
  }
  // lichen in a few small rosettes, clear of the words (on the margins and the tip)
  const near = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (ink.has(x + dx + ',' + (y + dy))) return true; return false; };
  for (let i = 0, n = 0; i < 40 && n < 4; i++) {
    const x = rng.int(3, W - 4), y = rng.int(2, H - 3);
    if (near(x, y) || near(x + 1, y) || !solid(x, y, fz) || wd.get(x, y, fz) === CARVE) continue;
    n++;
    const c = LICHEN[rng.int(0, 2)];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]]) {
      if (hash3(x + dx, y + dy, 11, seed) < 0.3 || !solid(x + dx, y + dy, fz) || near(x + dx, y + dy)) continue;
      wd.set(x + dx, y + dy, fz, dx || dy ? fmix(c, ramp[2], 0.35) : c);
    }
  }
  for (let i = 0; i < 9; i++) { const x = mx(rng.int(1, 9)), y = rng.int(0, 3); if (solid(x, y, fz)) wd.set(x, y, fz + 1, MOSS[rng.int(1, 3)]); }
  // ---- meshes: the nail head's middle is the pivot (the board swings on it)
  const pivot = [nx + (dir > 0 ? 1 : 0), ny + 1, 0];
  const woodGeo = meshVoxGreedy(wd, { scale: 1 / CK, pivot });
  const paintGeo = meshVoxGreedy(pt, { scale: 1 / CK, pivot });
  const box = new THREE.Box3(new THREE.Vector3(-pivot[0] / CK, -pivot[1] / CK, 0), new THREE.Vector3((W - pivot[0]) / CK, (H - pivot[1]) / CK, D / CK));
  // the arrow's tip (local), for the glints
  const tip = new THREE.Vector3(((dir > 0 ? W - 1 : 0) - pivot[0]) / CK, (H / 2 - pivot[1]) / CK, (fz + 1) / CK);
  return { wood: woodGeo, paint: paintGeo, box, len: W / CK, h: H / CK, tip, textX: ((tx0 + tw / 2) - pivot[0]) / CK, textY: ((ty0 + 3.5) - pivot[1]) / CK };
}

// ------------------------------------------------------------------ the post
/** The post with its gable cap (post voxels, 1/32 m): local origin at its foot, centre of the post. */
function buildPost(seed = 3) {
  const rng = makeRng(seed);
  const n1 = makeNoise2D(seed + 21);
  const W = 18, D = 16, CAP = 9, H = POST_H + CAP;
  const g = new VoxelGrid(W, H, D);
  const cx = W / 2, cz = D / 2; // post spans cx-3..cx+2, cz-3..cz+2
  const x0 = cx - POST_W / 2, z0 = cz - POST_W / 2, x1 = x0 + POST_W - 1, z1 = z0 + POST_W - 1;
  const cracks = [{ x: x0 + 2, y0: 26, y1: 47, face: 'f' }, { x: x0 + 4, y0: 52, y1: 69, face: 'f' }, { z: z0 + 2, y0: 12, y1: 30, face: 'l' }];
  for (let y = 0; y < POST_H; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const ex = x === x0 || x === x1, ez = z === z0 || z === z1;
    if (ex && ez) continue; // chamfered corners
    const col = (x - x0) * 3 + (z - z0) * 5;
    const v = n1(col * 0.37, y * 0.07) * 0.7 + n1(col * 1.3 + 4, y * 0.31) * 0.3;
    let c = v > 0.35 ? POST[3] : v > -0.1 ? POST[2] : v > -0.45 ? POST[1] : POST[0];
    if (hash3(col, y >> 2, 0, seed) < 0.08) c = POST[4]; // silvered fibres
    for (const k of cracks) {
      if (y < k.y0 || y > k.y1) continue;
      if (k.face === 'f' && z === z1 && x === k.x + ((y >> 3) % 2)) c = POST[0];
      if (k.face === 'l' && x === x0 && z === k.z) c = POST[0];
    }
    // damp and moss low down (thicker on the shady north side), bark left on the corners near the foot
    const shade = z === z0 ? 1 : x === x0 ? 0.6 : 0.35;
    if (y < 14 && hash3(x, y, z, seed + 3) < (1 - y / 14) * shade) c = MOSS[(hash3(x, y, z, seed + 4) * 5) | 0];
    else if (y < 22 && (ex || ez) && hash3(x, y >> 1, z, seed + 5) < 0.35) c = 0x3a281a;
    if (hash3(x, y, z, seed + 6) < 0.025) c = LICHEN[(hash3(x, y, z, 7) * 3) | 0];
    if (y < 4) c = fshade(c, 0.8);
    g.set(x, y, z, c);
  }
  // a split top, weathered pale
  for (let z = z0 + 1; z < z1; z++) for (let x = x0 + 1; x < x1; x++) g.set(x, POST_H - 1, z, x === cx - 1 ? POST[0] : POST[4]);
  // the cap: a little gable of two shingled boards, ridge front to back, a ridge board on top
  const base = POST_H;
  const half = 7.5;
  for (let z = 1; z < D - 1; z++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx;
    if (Math.abs(dx) > half) continue;
    const hr = Math.round((half - Math.abs(dx)) * 0.62);
    const y = base + hr;
    const edgeZ = z === 1 || z === D - 2;
    const row = Math.floor((half - Math.abs(dx)) / 2);
    let c = (row + (z >> 2)) % 2 ? 0x5a4636 : 0x6e5844;
    if (hash3(x, y, z, seed + 8) < 0.12) c = 0x4a3a2c;
    if (edgeZ) c = fshade(c, 0.85);
    // moss on the shingles, in soft patches
    if (n1(x * 0.4 + 9, z * 0.4) > 0.15 && hash3(x, y, z, seed + 9) < 0.8) c = MOSS[(hash3(x, z, y, seed) * 4) | 0];
    g.set(x, y, z, c);
    if (Math.abs(dx) < half - 0.6) g.set(x, y - 1, z, 0x3a2c22); // the boards' thickness
    // the gable ends: dark planks under the roof, front and back
    if ((z === 2 || z === D - 3) && Math.abs(dx) < half - 1) for (let yy = base; yy < y - 1; yy++) g.set(x, yy, z, (x + yy) % 4 === 0 ? 0x3a2c22 : 0x4a3a2c);
  }
  for (let z = 0; z < D; z++) { g.set(cx - 1, base + 5, z, 0x7a6450); g.set(cx, base + 5, z, 0x6a5440); if (z % 3 === 0) g.set(cx - 1, base + 6, z, MOSS[1]); }
  void rng;
  const geo = meshVoxGreedy(g, { scale: 1 / PK, pivot: [cx, 3, cz] });
  return { geo, half: POST_W / 2 / PK, height: (POST_H - 3) / PK, perch: new THREE.Vector3(0, (base + 6 - 3) / PK, 0) };
}

/** Rope lashings round the post above and below each board (1/64 m), ivy on its lower half. */
function buildRopeAndIvy(boardsY, seed = 5) {
  const k = CK;
  const ps = (POST_W / PK) * k; // post width in fine voxels (12)
  const W = ps + 8, D = ps + 8, top = Math.ceil(Math.max(...boardsY.map((b) => b.y + b.h)) * k) + 6;
  const g = new VoxelGrid(W, top, D);
  const c0 = W / 2 - ps / 2, c1 = c0 + ps - 1; // the post's surface
  const ring = (y, tw = 3, knotSide = 1, tail = true) => {
    for (let t = 0; t < tw; t++) {
      const yy = y + t;
      for (let i = c0 - 1; i <= c1 + 1; i++) for (const [x, z] of [[i, c0 - 1], [i, c1 + 1], [c0 - 1, i], [c1 + 1, i]]) {
        const corner = (x === c0 - 1 || x === c1 + 1) && (z === c0 - 1 || z === c1 + 1);
        if (corner) continue;
        g.set(x, yy, z, ROPE[(x + z + yy * 2) % 4 < 2 ? (yy % 2 ? 0 : 1) : 2]);
      }
    }
    // the knot on the front, and its loose end hanging down
    const kx = knotSide > 0 ? c1 - 1 : c0 + 1, kz = c1 + 2;
    for (let dy = 0; dy < tw; dy++) for (let dx = 0; dx < 2; dx++) g.set(kx + dx * knotSide, y + dy, kz, ROPE[dy === tw - 1 ? 0 : 1]);
    if (tail) for (let i = 1; i < 6 + ((seed + y) % 4); i++) g.set(kx + knotSide * (i > 4 ? 2 : 1), y - i, kz, ROPE[i % 2 ? 1 : 3]);
  };
  for (const b of boardsY) {
    ring(Math.round((b.y + b.h + 0.012) * k), 3, b.dir, false);
    ring(Math.round((b.y - 0.012) * k) - 3, 2, -b.dir);
  }
  // ivy: a vine winding up the lower post with leaves (three-lobed) every few voxels
  const ivyTop = Math.min(top - 1, Math.round(((boardsY.length ? Math.min(...boardsY.map((b) => b.y)) : 1.2) - 0.08) * k));
  const rng = makeRng(seed);
  for (const ph of [0, 2.4]) {
    let a = ph;
    for (let y = 0; y < ivyTop; y++) {
      a += 0.045 + Math.sin(y * 0.11 + ph) * 0.02;
      // walk round the square post: a position on its perimeter, one voxel out
      const per = (ps + 2) * 4, p = ((a / (Math.PI * 2)) * per % per + per) % per, side = Math.floor(p / (ps + 2)), u = Math.floor(p % (ps + 2));
      const [x, z, ox, oz] = side === 0 ? [c0 - 1 + u, c1 + 1, 0, 1] : side === 1 ? [c1 + 1, c1 + 1 - u, 1, 0] : side === 2 ? [c1 + 1 - u, c0 - 1, 0, -1] : [c0 - 1, c0 - 1 + u, -1, 0];
      if (y > ivyTop * (ph ? 0.55 : 1)) break;
      g.set(x, y, z, y % 7 === 0 ? 0x5a4a2a : 0x4a5a2a);
      if (y % 4 === 1 && rng() < 0.85) {
        // a leaf, lying on the post's face and standing out a little
        const lx = x + ox, lz = z + oz, c = IVY[rng.int(0, 4)];
        const tx = oz !== 0 ? 1 : 0, tz = ox !== 0 ? 1 : 0; // along the face
        for (const [du, dv, dd] of [[0, 0, 0], [-1, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0], [-1, 1, 0], [1, 1, 0], [0, 0, 1], [0, 2, 0]]) {
          const xx = lx + du * tx + ox * dd, zz = lz + du * tz + oz * dd, yy = y + dv;
          if (!g.filled(xx, yy, zz)) g.set(xx, yy, zz, du === 0 && dv === 0 ? fshade(c, 0.8) : dv === 1 && du === 0 ? fshade(c, 1.15) : c);
        }
      }
    }
  }
  return meshVoxGreedy(g, { scale: 1 / k, pivot: [W / 2, 0, D / 2] });
}

/** The foot: a little cairn of mossy stones, toadstools, a fern (all small things: their voxel by size). */
function buildFoot(seed = 9) {
  const parts = [];
  const stone = (s, w, h, d, x, z, ry, moss = 0.75, tone = 0x8a8478) => {
    const k = Math.round(1 / voxelSizeFor(Math.max(w, h, d)));
    const geo = makeBoulderGeo(s, { w, h, d, k, moss, tone });
    geo.applyMatrix4(new THREE.Matrix4().makeRotationY(ry).setPosition(x, -0.03, z));
    parts.push(geo);
  };
  stone(seed + 1, 0.36, 0.22, 0.3, -0.22, 0.12, 0.4);
  stone(seed + 2, 0.3, 0.2, 0.26, 0.24, 0.16, 1.7, 0.6, 0x948c80);
  stone(seed + 3, 0.42, 0.26, 0.34, 0.02, -0.26, 2.6, 0.9);
  stone(seed + 4, 0.22, 0.14, 0.2, 0.3, -0.12, 0.9, 0.5, 0x7e786e);
  stone(seed + 5, 0.2, 0.12, 0.18, -0.3, -0.16, 2.1, 0.8);
  stone(seed + 6, 0.16, 0.1, 0.14, 0.12, 0.3, 0.3, 0.4, 0x9a9284);
  const stones = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const plants = [];
  const shroom = (s, kind, n, x, z, sc) => {
    const geo = makeMushroomGeo(s, { kind, n, k: Math.round(1 / voxelSizeFor(0.12)), scale: sc });
    geo.translate(x, 0, z);
    plants.push(geo);
  };
  shroom(seed + 11, 'agaric', 3, 0.33, 0.3, 1.05);
  shroom(seed + 12, 'brown', 4, -0.36, 0.22, 0.8);
  const fern = makeFernGeo(seed + 13, { r: 0.42, k: Math.round(1 / voxelSizeFor(0.8)) });
  fern.translate(-0.28, 0, -0.24);
  plants.push(fern);
  const merged = mergeGeometries(plants);
  for (const p of plants) p.dispose();
  return { stones, plants: merged };
}

// ------------------------------------------------------------------ the signpost
const WOOD_OF = ['walnut', 'pine', 'ash', 'oak'];
/**
 * Build the signpost. items: [{ label, primary, dir }] top to bottom. Returns the handle described
 * at the top of this file.
 */
export function makeSignpost(items, { face = 0 } = {}) {
  const group = new THREE.Group();
  group.name = 'signpost';
  const geos = [];
  const G = (g) => { geos.push(g); return g; };
  const mat = {
    post: forestToon({ dapple: true }),
    plant: forestToon({ dapple: true, swayLocal: 0.5, swayAmp: 0.04 }),
    wood: forestToon({ dapple: true, emissive: 0.08 }),
    woodLit: forestToon({ dapple: true, emissive: 0.5 }),
    paint: forestToon({ dapple: true, emissive: 0.45 }),
    paintLit: forestToon({ dapple: true, emissive: 1.4 }),
  };
  // the post leans a touch, as old posts do
  const lean = new THREE.Group();
  lean.rotation.set(-0.012, 0, 0.018);
  group.add(lean);
  const post = buildPost(7);
  const postMesh = new THREE.Mesh(G(post.geo), mat.post);
  postMesh.layers.enable(LAYER_OUTLINE);
  lean.add(postMesh);

  // the boards, top to bottom
  const GAP = 0.075;
  const boards = [];
  let y = post.height - 0.42;
  items.forEach((it, i) => {
    const h = (it.primary ? 18 : 16) / CK;
    y -= h / 2;
    const b = { i, label: it.label, dir: it.dir || (i % 2 ? -1 : 1), primary: !!it.primary, y, h, seed: 101 + i * 17, wood: it.wood || WOOD_OF[i % WOOD_OF.length] };
    b.pivot = new THREE.Group();
    b.pivot.name = 'board-' + i;
    b.rest = (i % 2 ? -1 : 1) * (0.018 + i * 0.006); // hung a little askew
    b.yaw = face + b.dir * (0.03 + (i % 2) * 0.015); // (face: turned back toward the viewer, so the words read square on)
    b.ang = b.rest; b.angV = 0; b.yawJ = 0; b.yawV = 0; b.pull = 0; b.lit = 0; b.ph = i * 1.9;
    b.pivot.position.set(0, y, post.half + 0.003);
    lean.add(b.pivot);
    boards.push(b);
    y -= h / 2 + GAP;
  });
  const carve = (b) => {
    if (b.woodMesh) { b.pivot.remove(b.woodMesh, b.paintMesh, b.glints.points, b.halo); b.woodMesh.geometry.dispose(); b.paintMesh.geometry.dispose(); b.glints.points.geometry.dispose(); b.glints.points.material.dispose(); }
    const geo = buildBoard({ label: b.label, dir: b.dir, primary: b.primary, seed: b.seed, wood: b.wood });
    b.woodMesh = new THREE.Mesh(geo.wood, mat.wood);
    b.woodMesh.layers.enable(LAYER_OUTLINE);
    b.paintMesh = new THREE.Mesh(geo.paint, mat.paint);
    b.paintMesh.layers.enable(LAYER_OUTLINE); // (in the outline mask too, so the cuts' walls don't outline every stroke)
    b.box = geo.box; b.len = geo.len; b.tip = geo.tip; b.textX = geo.textX; b.textY = geo.textY;
    // glints that run along the painted letters and the tip when the board catches the light
    const pts = [];
    for (let k = 0; k < 6; k++) pts.push({ pos: [geo.textX + (k - 2.5) * 0.11 * (geo.len / 1.1), geo.textY + (k % 2 ? 0.05 : -0.04), geo.box.max.z + 0.004], color: k % 2 ? 0xfff2c0 : 0xffffff, size: 2, shape: SHAPE.plus, big: 4, bigShape: SHAPE.plus, speed: 2.2 + k * 0.37, phase: k * 1.7, sharp: 8, amp: 1 });
    pts.push({ pos: [geo.tip.x, geo.tip.y, geo.tip.z], color: 0xfff6d0, size: 2, shape: SHAPE.plus, big: 5, bigShape: SHAPE.plus, speed: 1.6, phase: 0.4, sharp: 6, amp: 1 });
    b.glints = new Twinkles(pts, { additive: true, atten: false });
    b.glints.points.renderOrder = 9;
    // the warm light it catches spills round its edges (a halo of light cells behind it)
    if (!b.halo) {
      b.halo = makeGlow({ color: 0xffc870, size: 1, intensity: 0, falloff: 1.4, levels: 5, renderOrder: 6 });
      b.halo.material.depthTest = true;
    }
    b.halo.userData.glow.uSize.value.set(geo.len * 1.35, geo.h * 3.2);
    b.halo.position.set(geo.textX * 0.8, geo.textY, -0.06);
    b.pivot.add(b.woodMesh, b.paintMesh, b.glints.points, b.halo);
  };
  for (const b of boards) carve(b);

  const rope = new THREE.Mesh(G(buildRopeAndIvy(boards.map((b) => ({ y: b.y - b.h / 2, h: b.h, dir: b.dir })), 5)), mat.post);
  rope.position.set(0, 0, 0);
  rope.layers.enable(LAYER_OUTLINE);
  lean.add(rope);
  const foot = buildFoot(9);
  const stones = new THREE.Mesh(G(foot.stones), mat.post);
  stones.layers.enable(LAYER_OUTLINE);
  const plants = new THREE.Mesh(G(foot.plants), mat.plant);
  group.add(stones, plants);
  // a knock shakes loose a few crumbs of moss and wood dust (tiny voxels)
  const crumbs = new Particles({ max: 90, additive: false, atten: true, renderOrder: 6 });
  crumbs.points.frustumCulled = false;
  group.add(crumbs.points); // (positions in the signpost's own frame)
  const _w = new THREE.Vector3();

  let focus = -1, t = 0;
  const _e = new THREE.Euler();
  const handle = {
    group, boards, materials: Object.values(mat),
    perch: post.perch.clone(),
    get focused() { return focus; },
    setFocus(i, nudge = true) {
      if (i === focus) return;
      focus = i;
      const b = boards[i];
      if (b && nudge) { b.angV += (b.dir > 0 ? 1 : -1) * 1.3; b.yawV += 0.7; }
    },
    knock(i, k = 1) {
      const b = boards[i];
      if (!b) return;
      b.angV += (b.dir > 0 ? -1 : 1) * 3.2 * k;
      b.yawV -= 1.6 * k;
      b.pull = -0.012 * k;
      b.pivot.updateWorldMatrix(true, false);
      for (let n = 0; n < Math.round(14 * k); n++) {
        const u = Math.random();
        group.worldToLocal(_w.set(b.box.min.x + (b.box.max.x - b.box.min.x) * u, b.box.max.y - 0.01, 0.02 + Math.random() * 0.04).applyMatrix4(b.pivot.matrixWorld));
        const moss = Math.random() < 0.55;
        crumbs.spawn({ pos: [_w.x, _w.y, _w.z], vel: [(Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5], life: 0.9 + Math.random() * 0.6, color: moss ? [0x6e9638, 0x5a8230, 0x86a844][n % 3] : [0x8a6a46, 0xa8865a, 0x6a4a30][n % 3], size: 0.012 + Math.random() * 0.01, gravity: 4.5, drag: 1.2, spin: 6, shape: moss ? SHAPE.square : SHAPE.confetti });
      }
    },
    setLabel(i, text) { const b = boards[i]; if (!b || b.label === text) return; b.label = text; carve(b); },
    update(dt, camera, heightPx) {
      t += dt;
      const h = Math.min(dt, 1 / 20);
      if (camera) crumbs.setScaleFromCamera(camera, heightPx);
      crumbs.update(dt);
      for (const b of boards) {
        const on = b.i === focus;
        b.lit += ((on ? 1 : 0) - b.lit) * (1 - Math.exp(-h * (on ? 14 : 6)));
        // swinging on its nail: a damped spring round a breeze-stirred rest
        const breeze = Math.sin(t * 0.7 + b.ph) * 0.006 + Math.sin(t * 1.9 + b.ph * 2) * 0.003;
        const acc = -30 * (b.ang - b.rest - breeze) - 3.0 * b.angV;
        b.angV += acc * h; b.ang = clamp(b.ang + b.angV * h, -0.3, 0.3);
        const accY = -40 * b.yawJ - 4.0 * b.yawV;
        b.yawV += accY * h; b.yawJ = clamp(b.yawJ + b.yawV * h, -0.25, 0.25);
        b.pull += ((on ? 0.03 : 0) - b.pull) * (1 - Math.exp(-h * 10));
        b.pivot.position.z = post.half + 0.003 + Math.max(-0.01, b.pull);
        _e.set(0, b.yaw + b.yawJ, b.ang);
        b.pivot.quaternion.setFromEuler(_e);
        const lit = b.lit > 0.5;
        b.woodMesh.material = lit ? mat.woodLit : mat.wood;
        b.paintMesh.material = lit ? mat.paintLit : mat.paint;
        b.glints.update(dt, b.lit);
        b.glints.points.visible = b.lit > 0.02;
        b.halo.userData.glow.uIntensity.value = b.lit * (0.42 + Math.sin(t * 2.3 + b.ph) * 0.05);
        b.halo.visible = b.lit > 0.02;
      }
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const b of boards) { b.woodMesh.geometry.dispose(); b.paintMesh.geometry.dispose(); b.glints.points.geometry.dispose(); b.glints.points.material.dispose(); b.halo.material.dispose(); }
      crumbs.geo.dispose(); crumbs.mat.dispose();
    },
  };
  return handle;
}

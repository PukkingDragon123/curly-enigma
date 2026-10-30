// Nugget's walking coop: a little old Baba Yaga hut on two big scaly chicken legs, grey and
// weathered, half open (the front bay fell away, logs are missing, the roof has holes; Nugget's
// straw shelf shows inside). A log cabin on a timber sill, board-clad gables, a mossy shingle roof
// with a bare ridge log, a crooked brick chimney that puffs smoke, a round gable
// window Nugget the hen peeks out of, an arched plank door that swings open, a glowing side
// window and a hanging lantern, patches (planks, tin, sackcloth) and charms swinging under the
// eaves (a horseshoe, a bell, dried herbs, beads and a feather). Hi-res voxels (about 1 cm), one
// skinned mesh (+ the hen's, + a small unlit mesh for the glowing glass) riding on rig groups.
//
//   import { makeCoop } from '../gfx/char/coop.js';
//   const coop = makeCoop({ height: 1.0 });       // meters to the roof ridge when standing
//   scene.add(coop.root);
//   coop.update(dt, { speed, moving });           // speed in m/s along its facing; drives the gait
//   coop.face(yaw); coop.play('sit');             // 'idle' (walks by speed) | 'sit' | 'stuck' | 'carried'
//   coop.setDoor(1); coop.setNugget(true);
//
// Rig: { root, body, hut, legs, hen, door, chimney, height, vs, radius, state,
//        update(dt, { speed, moving, airborne }), play(state), face(yaw, instant), setDoor(k),
//        setNugget(on), setGlow(k), hop(), land(v), shake(k), layEgg(), peck(),
//        windowWorld(out), doorWorld(out), chimneyWorld(out), dispose() }
// Callbacks (optional): rig.onStep(side, strength), rig.onJingle(k), rig.onEgg(worldPos).
// legs[i] = { hip, knee, ankle, toes, side } (groups; i 0 = left, 1 = right).
// The coop faces +z (like the characters); root sits on the ground between the feet.
import * as THREE from 'three';
import { Vox, mix, dk, lt, h3, cached, PX, NX, PY, NY, PZ, NZ } from './vox.js';
import { SkinAssembler, charMaterial } from './skin.js';
import { makeChicken } from './chicken.js';

// ---------------------------------------------------------------- layout (voxels, body space)
// body origin: the middle of the sill's underside, where the legs attach
const WALL_Y0 = 5, LOGH = 6, COURSES = 6, WALL_Y1 = WALL_Y0 + LOGH * COURSES; // 41
const HX = 27, HZ = 21; // log wall core half extents (the logs' relief adds 1)
const RIDGE = 66; // roof underside at the ridge
const SLOPE = 0.857; // roof pitch (y per x)
const EAVE = 37; // roof half width
const RZ = 28; // roof half depth
const under = (u) => RIDGE - SLOPE * u;
const DOOR = { x0: -17, x1: -5, cx: -11, top: 25, r: 6 };
const WIN = { x: 0, y: 52, r: 6.5 }; // the round gable window
const SIDEWIN = { y0: 19, y1: 29, z0: -5, z1: 5 };
const CHIM = [13, 53, -9]; // chimney base on the roof (right slope, toward the back)
const CHIM_H = 32;
// legs: thigh (hip → hock) and shank (hock → ankle), the ankle sits ANK above the ground
const T = 17, S = 21, ANK = 3;
const HIP = { x: 12, y: 0.5, z: 2 };
const H0 = 35.5; // standing hip height
const FOOT_X = 13.5, FOOT_Z = 2.5;

// ---------------------------------------------------------------- palette
// old, sun-bleached and rain-greyed wood (the coop is decades old)
const LOG_HI = 0x9c9282, LOG_L = 0x857b6b, LOG_B = 0x6e6556, LOG_D = 0x554c40, LOG_SEAM = 0x2a221a;
const BOARD = 0x8a8170, BOARD_D = 0x655c4e;
const SHING = [0x5e564a, 0x6a6052, 0x4f483e, 0x645a4c, 0x574f44];
const MOSS = [0x36561f, 0x4f7a2c, 0x5f8a34, 0x7aa442, 0x9acb5a];
const PLAT = 0x5e3e24;
const TRIM = 0x8e8068, TRIM_D = 0x625642;
const PAINT_W = 0xc8c0ac, PAINT_R = 0x8a5a4a, PAINT_Y = 0xa89060, PAINT_B = 0x6a7a88, PAINT_G = 0x6a7a52; // faded, flaking paint
const INT = 0x1e140c;
const STRAW = [0xe8c860, 0xd0a840, 0xb88a30, 0xf6dc80];
const IRON = 0x3a3634, IRON_L = 0x6a625c;
const TIN = 0x8a6a52; // rusted
const LEG_B = 0xe39a2c, LEG_L = 0xf6c25a, LEG_D = 0xb06a1c, LEG_DD = 0x8a5418;
const CLAW = 0x3a2a20, CLAW_L = 0x6a5a4a;
const FEATH = 0xf2e8d6, FEATH_T = 0xd8c0a0;

// material ids
const M = { LOG: 1, BOARD: 2, ROOF: 3, MOSS: 4, PLAT: 5, TRIM: 6, INT: 7, FRAME: 8, SHUT: 9, PATCH: 10, TIN: 11, SACK: 12, STEP: 13, UNDER: 14 };

function vnoise(x, z, cell, seed) {
  const fx = x / cell, fz = z / cell;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = h3(ix, 0, iz, seed), b = h3(ix + 1, 0, iz, seed), c = h3(ix, 0, iz + 1, seed), d = h3(ix + 1, 0, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
const mossAt = (x, z) => {
  const u = Math.abs(x + 0.5);
  const n = vnoise(x, z, 8, 31) * 0.65 + vnoise(x, z, 3, 32) * 0.35;
  // shady left slope and the low rows near the eaves grow more
  return n + (x < 0 ? 0.08 : 0) + Math.max(0, u - 24) * 0.012 + (u < 4 ? 0.06 : 0);
};
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- the hut
function hutGeo(bake) {
  return cached(`coop-hut|${bake}`, () => hutVox().geometry(bake));
}
export function hutVox() {
  {
    const v = new Vox(-39, 39, -5, 80, -31, 40);
    // sill: a heavy timber frame the legs hang from
    v.box(-30, 0, -24, 30, WALL_Y0, 24, 0, M.PLAT);
    // log walls: a solid core plus one voxel of relief per log (the seam between logs stays sunk)
    v.box(-HX, WALL_Y0, -HZ, HX, WALL_Y1, HZ, 0, M.LOG);
    for (let i = 0; i < COURSES; i++) {
      const y0 = WALL_Y0 + i * LOGH, y1 = y0 + LOGH - 1;
      v.box(-HX, y0, HZ, HX, y1, HZ + 1, 0, M.LOG);
      v.box(-HX, y0, -HZ - 1, HX, y1, -HZ, 0, M.LOG);
      v.box(HX, y0, -HZ, HX + 1, y1, HZ, 0, M.LOG);
      v.box(-HX - 1, y0, -HZ, -HX, y1, HZ, 0, M.LOG);
      // the corners: logs cross and stick out (x-logs on even courses, z-logs on odd ones)
      const cy = y0 + 3;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (i % 2 === 0) {
          const cz = sz * (HZ - 2.5);
          const xa = sx > 0 ? HX : -HX - 4, xb = sx > 0 ? HX + 4 : -HX;
          v.fill(xa, xb - 1, y0, y0 + 5, cz - 4, cz + 4, (x, y, z) => (y - cy) ** 2 + (z - cz) ** 2 <= 3.1 * 3.1, 0, M.LOG);
          endGrain(v, sx > 0 ? HX + 3 : -HX - 4, cy, cz, 'x');
        } else {
          const cx = sx * (HX - 2.5);
          const za = sz > 0 ? HZ : -HZ - 4, zb = sz > 0 ? HZ + 4 : -HZ;
          v.fill(cx - 4, cx + 4, y0, y0 + 5, za, zb - 1, (x, y, z) => (y - cy) ** 2 + (x - cx) ** 2 <= 3.1 * 3.1, 0, M.LOG);
          endGrain(v, sz > 0 ? HZ + 3 : -HZ - 4, cy, cx, 'z');
        }
      }
    }
    // gables: board-clad triangles front and back, the attic filled between them
    v.fill(-HX - 1, HX + 1, WALL_Y1, RIDGE, -HZ, HZ - 1, (x, y, z) => Math.abs(x) <= (RIDGE - 1 - y) / SLOPE, 0, M.BOARD);
    // a batten across the foot of each gable
    v.box(-HX - 1, WALL_Y1, HZ - 1, HX + 1, WALL_Y1 + 2, HZ, 0, M.TRIM);
    v.box(-HX - 1, WALL_Y1, -HZ, HX + 1, WALL_Y1 + 2, -HZ + 1, 0, M.TRIM);

    // ---- old and open: the inside is hollow, the front half gone, logs missing here and there
    v.carve(-HX + 1, HX, WALL_Y0 + 1, RIDGE - 2, -HZ + 1, HZ - 1, (x, y) => y < WALL_Y1 || Math.abs(x + 0.5) <= (RIDGE - 3 - y) / SLOPE);
    // the front wall's right half fell away: a wide open bay over a straw shelf (Nugget's nest)
    v.carve(-3, HX + 2, WALL_Y0 + 9, WALL_Y1 + 2, HZ - 2, HZ + 3, (x, y) => y < WALL_Y1 - 1 || x < HX - 4 - (y - WALL_Y1));
    // missing logs: gaps in the side and back walls you can see through
    for (const [x0, x1, c, z0, z1] of [[HX - 1, HX + 3, 2, -12, 8], [HX - 1, HX + 3, 4, -16, -2], [-HX - 3, -HX + 1, 3, -6, 14], [-HX - 3, -HX + 1, 5, -18, -4], [-14, 6, 2, -HZ - 3, -HZ + 1], [2, 20, 4, -HZ - 3, -HZ + 1]]) {
      const y0 = WALL_Y0 + c * LOGH;
      v.carve(x0, x1, y0, y0 + LOGH, z0, z1, () => true);
    }
    // the floor inside: grey planks, a few gone; the nest shelf by the bay
    v.fill(-HX + 1, HX, WALL_Y0, WALL_Y0 + 1, -HZ + 1, HZ - 1, (x, y, z) => h3(x >> 2, 0, z, 41) > 0.12, 0, M.BOARD);
    v.box(-3, WALL_Y0 + 20, 2, HX, WALL_Y0 + 22, HZ - 1, 0, M.BOARD);
    for (let x = -3; x < HX; x++) for (let z = 2; z < HZ - 1; z++) { const r = h3(x, 9, z, 13); if (r < 0.8) v.set(x, WALL_Y0 + 22, z, STRAW[(r * 17 | 0) % 4]); if (r < 0.25) v.set(x, WALL_Y0 + 23, z, STRAW[(r * 31 | 0) % 4]); }
    // ---- the front: an arched door in a carved frame, the porch step
    v.fill(DOOR.x0 - 1, DOOR.x1 + 1, WALL_Y0, DOOR.top + DOOR.r + 2, 13, HZ - 1, () => true, 0, M.INT);
    const inDoor = (x, y) => x >= DOOR.x0 && x < DOOR.x1 && y >= WALL_Y0 && (y < DOOR.top || (x - DOOR.cx) ** 2 + (y - DOOR.top) ** 2 <= DOOR.r * DOOR.r);
    v.carve(DOOR.x0, DOOR.x1, WALL_Y0, DOOR.top + DOOR.r + 1, 15, HZ + 2, (x, y) => inDoor(x, y));
    // straw on the floor inside, and an egg in the nest
    for (let x = DOOR.x0; x < DOOR.x1; x++) for (let z = 15; z < HZ + 1; z++) {
      const r = h3(x, 5, z, 7);
      if (r < 0.7) v.set(x, WALL_Y0, z, STRAW[(r * 13 | 0) % 4]);
      if (r < 0.18 && z < 19) v.set(x, WALL_Y0 + 1, z, STRAW[(r * 29 | 0) % 4]);
    }
    v.ell(DOOR.x0 + 3, WALL_Y0 + 2.2, 16.5, 1.6, 2.1, 1.6, (x, y) => (y > WALL_Y0 + 2 ? 0xfff6e6 : 0xe8dcc8));
    // the frame: posts and an arch, carved notches, white paint dots
    v.box(DOOR.x0 - 2, WALL_Y0, HZ, DOOR.x0, DOOR.top, HZ + 3, 0, M.TRIM);
    v.box(DOOR.x1, WALL_Y0, HZ, DOOR.x1 + 2, DOOR.top, HZ + 3, 0, M.TRIM);
    v.fill(DOOR.x0 - 2, DOOR.x1 + 2, DOOR.top, DOOR.top + DOOR.r + 3, HZ, HZ + 2, (x, y) => {
      const d = Math.hypot(x - DOOR.cx, y - DOOR.top);
      return d >= DOOR.r && d < DOOR.r + 2.2;
    }, 0, M.TRIM);
    // porch step: a split log under the door
    v.fill(DOOR.x0 - 3, DOOR.x1 + 3, 0, 4, HZ + 2, HZ + 8, (x, y, z) => (y - 1.5) ** 2 + (z - (HZ + 4.5)) ** 2 <= 2.9 * 2.9 && y >= 0, 0, M.STEP);

    // ---- the round gable window (dark inside, where Nugget's head pokes out)
    v.fill(-10, 10, WIN.y - 10, WIN.y + 10, 3, HZ - 1, (x, y) => (x - WIN.x) ** 2 + (y - WIN.y) ** 2 <= 8.6 * 8.6, 0, M.INT);
    v.carve(-8, 8, WIN.y - 8, WIN.y + 8, 5, HZ + 3, (x, y) => (x - WIN.x) ** 2 + (y - WIN.y) ** 2 <= WIN.r * WIN.r);
    v.fill(-10, 10, WIN.y - 10, WIN.y + 10, HZ - 2, HZ + 1, (x, y) => {
      const d = Math.hypot(x - WIN.x, y - WIN.y);
      return d > WIN.r && d <= WIN.r + 2.6;
    }, 0, M.FRAME);
    // the sill under it with a flower pot
    v.box(-8, WIN.y - 10, HZ - 1, 8, WIN.y - 8, HZ + 4, 0, M.TRIM);
    v.box(4, WIN.y - 8, HZ, 8, WIN.y - 5, HZ + 3, 0xb0583a);
    v.box(4, WIN.y - 6, HZ, 8, WIN.y - 5, HZ + 3, 0xc86a48);
    v.set(5, WIN.y - 5, HZ + 1, 0x4f7a2c); v.set(6, WIN.y - 5, HZ + 2, 0x5a9a3a); v.set(6, WIN.y - 4, HZ + 1, 0x4f7a2c);
    v.set(6, WIN.y - 3, HZ + 1, PAINT_R); v.set(7, WIN.y - 3, HZ + 1, 0xe8604a); v.set(6, WIN.y - 2, HZ + 1, PAINT_R); v.set(5, WIN.y - 3, HZ + 1, 0xe8604a);
    v.set(6, WIN.y - 3, HZ + 2, PAINT_Y);
    // shutters, swung open
    for (const sx of [-1, 1]) {
      const xa = sx > 0 ? 9 : -16, xb = sx > 0 ? 16 : -9;
      v.box(xa, WIN.y - 9, HZ, xb, WIN.y - 1, HZ + 1, 0, M.SHUT);
    }

    // the round window is boarded up now (no face peering out of the gable): two crooked planks
    v.fill(-8, 8, WIN.y - 8, WIN.y + 8, HZ - 1, HZ + 1, (x, y) => (x - WIN.x) ** 2 + (y - WIN.y) ** 2 <= WIN.r * WIN.r, 0, M.BOARD);
    v.line(-8, WIN.y - 4, HZ + 1, 8, WIN.y + 2, HZ + 1, BOARD_D, 1.2);
    v.line(-7, WIN.y + 4, HZ + 1, 7, WIN.y + 6, HZ + 1, BOARD, 1.0);
    // ---- the side window (+x), warm light inside (the glass is a separate glowing mesh)
    v.box(HX - 6, SIDEWIN.y0 - 1, SIDEWIN.z0 - 1, HX, SIDEWIN.y1 + 1, SIDEWIN.z1 + 1, 0, M.INT);
    v.carve(HX - 3, HX + 2, SIDEWIN.y0, SIDEWIN.y1 - 1, SIDEWIN.z0, SIDEWIN.z1 - 1, () => true);
    v.fill(HX, HX + 2, SIDEWIN.y0 - 2, SIDEWIN.y1 + 1, SIDEWIN.z0 - 2, SIDEWIN.z1 + 1, (x, y, z) => y < SIDEWIN.y0 || y >= SIDEWIN.y1 || z < SIDEWIN.z0 || z >= SIDEWIN.z1, 0, M.FRAME);
    v.box(HX - 3, SIDEWIN.y0, -1, HX + 1, SIDEWIN.y1, 1, 0, M.FRAME);
    v.box(HX - 3, 23, SIDEWIN.z0, HX + 1, 25, SIDEWIN.z1, 0, M.FRAME);
    v.box(HX, SIDEWIN.y0 - 3, SIDEWIN.z0 - 3, HX + 4, SIDEWIN.y0 - 1, SIDEWIN.z1 + 3, 0, M.TRIM);
    for (const sz of [-1, 1]) {
      const za = sz > 0 ? SIDEWIN.z1 + 1 : SIDEWIN.z0 - 8, zb = sz > 0 ? SIDEWIN.z1 + 8 : SIDEWIN.z0 - 1;
      v.box(HX + 1, SIDEWIN.y0, za, HX + 2, SIDEWIN.y1, zb, 0, M.SHUT);
    }

    // ---- patches: planks on the left wall, a tin sheet on the back
    v.box(-HX - 2, 11, -13, -HX - 1, 23, -1, 0, M.PATCH);
    v.box(3, 9, -HZ - 2, 15, 19, -HZ - 1, 0, M.TIN);

    // ---- the roof: rows of shingles from the eaves up, a bump at each row's butt
    for (let x = -EAVE; x < EAVE; x++) {
      const u = Math.abs(x + 0.5);
      const yb = under(u);
      const rowF = (EAVE - u) / 5.2;
      const f = rowF - Math.floor(rowF);
      const bump = f < 0.28 ? 1 : 0;
      for (let z = -RZ; z < RZ; z++) {
        const y0 = Math.floor(yb), y1 = Math.floor(yb + 3.6 + bump);
        for (let y = y0; y <= y1; y++) v.setM(x, y, z, M.ROOF);
      }
    }
    // a sackcloth patch over a hole on the right slope
    for (let x = 10; x < 20; x++) for (let z = -15; z < -5; z++) {
      const top = v.topY(x, z);
      if (top > 0 && !(x === 10 && z === -15) && !(x === 19 && z === -6)) v.setM(x, top + 1, z, M.SACK);
    }
    // moss: clumps on top, drips over the eaves
    for (let x = -EAVE; x < EAVE; x++) for (let z = -RZ; z < RZ; z++) {
      const m = mossAt(x, z);
      if (m < 0.6) continue;
      const top = v.topY(x, z);
      if (!(top > 0) || v.m(x, top, z) === M.SACK) continue;
      v.setM(x, top, z, M.MOSS);
      if (m > 0.7) v.setM(x, top + 1, z, M.MOSS);
      const u = Math.abs(x + 0.5);
      if (u > EAVE - 1.5 && h3(x, 0, z, 5) < 0.5) {
        const len = 1 + (h3(x, 1, z, 6) * 4 | 0);
        const yb = Math.floor(under(u));
        for (let k = 1; k <= len; k++) v.setM(x, yb - k, z, M.MOSS);
      }
    }
    // the ridge log (bare: the carved rooster and its tail rotted off years ago)
    const ry = RIDGE + 4.6;
    v.fill(-4, 4, ry - 4, ry + 4, -RZ - 2, RZ + 1, (x, y) => x * x + (y - ry) ** 2 <= 3.2 * 3.2, (x, y) => (y > ry + 1.5 ? LOG_HI : y > ry - 0.5 ? LOG_L : LOG_B));
    // holes in the roof where shingles slid off (rafters left showing)
    for (const [cx, cz, r] of [[-18, 6, 6], [-8, -14, 4.5], [22, 12, 4]]) {
      v.carve(cx - r - 1, cx + r + 1, 0, RIDGE + 8, cz - r - 1, cz + r + 1, (x, y, z) => Math.hypot(x - cx, z - cz) < r * (0.75 + 0.5 * h3(x, 3, z, 51)) && y > under(Math.abs(x + 0.5)) - 1);
      for (let x = Math.floor(cx - r); x < cx + r; x += 4) { const yb = Math.floor(under(Math.abs(x + 0.5))); for (let z = Math.floor(cz - r); z < cz + r; z++) v.setM(x, yb, z, M.BOARD); }
    }
    // bargeboards: carved boards with scalloped edges along both gable ends
    for (const sz of [-1, 1]) {
      const za = sz > 0 ? RZ - 2 : -RZ, zb = sz > 0 ? RZ : -RZ + 2;
      for (let x = -EAVE; x < EAVE; x++) {
        const u = Math.abs(x + 0.5);
        const yb = under(u);
        const scal = ((x + 40) % 5 + 5) % 5;
        const y0 = Math.floor(yb - 3 + (scal === 0 || scal === 4 ? 1 : 0));
        for (let y = y0; y < Math.floor(yb) + 1; y++) for (let z = za; z < zb; z++) if (!v.has(x, y, z) || v.m(x, y, z) === M.ROOF) v.setM(x, y, z, M.TRIM);
        if (scal === 2 && u < EAVE - 2) v.set(x, y0 + 1, sz > 0 ? zb : za - 1, PAINT_W);
      }
    }
    // straw poking out from under the sill
    for (let x = -30; x < 30; x++) for (let z = -24; z < 24; z++) {
      const edge = Math.abs(x + 0.5) > 26 || Math.abs(z + 0.5) > 20;
      const r = h3(x, -1, z, 11);
      if (!edge || r > 0.09) continue;
      const len = 1 + (r * 40 | 0) % 3;
      for (let k = 1; k <= len; k++) v.set(x, -k, z, STRAW[(k + (r * 50 | 0)) % 4]);
    }
    // iron corner brackets on the sill
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx > 0 ? 29 : -30, z = sz > 0 ? 23 : -24;
      for (let k = 0; k < 5; k++) { v.set(x - sx * k, 2, z + sz, IRON); v.set(x + sx, 2, z - sz * k, IRON); }
      v.set(x + sx, 2, z + sz, IRON_L);
    }

    v.resolve({
      [M.LOG]: (x, y, z, e) => {
        const o = ((y - WALL_Y0) % LOGH + LOGH) % LOGH, c = Math.floor((y - WALL_Y0) / LOGH);
        const along = (e & (PX | NX)) ? z : x;
        let col = [LOG_D, LOG_B, LOG_B, LOG_L, LOG_HI, LOG_SEAM][o];
        if ((e & PY) && !(e & (PX | NX | PZ | NZ))) col = LOG_L;
        if ((e & NY) && !(e & (PX | NX | PZ | NZ))) col = LOG_SEAM;
        // grain streaks and knots
        if (o >= 1 && o <= 3) {
          const g = h3(along >> 2, c, o, 3);
          if (g < 0.22) col = dk(col, 0.1);
          if (h3(along >> 1, c, 9, 4) < 0.025 && o === 2) col = 0x4a2c16;
        }
        // weathering toward the sill
        if (y < WALL_Y0 + 6 && h3(x, y, z, 12) < 0.3) col = mix(col, 0x5a4a34, 0.3);
        return col;
      },
      [M.BOARD]: (x, y, z, e) => {
        const col = Math.floor((x + 40) / 4);
        if ((x + 40) % 4 === 0) return BOARD_D;
        let c = mix(BOARD, 0xae8458, h3(col, 0, z > 0 ? 1 : 0, 21) * 0.6);
        if (h3(col, y >> 2, 3, 22) < 0.15) c = dk(c, 0.08);
        if ((e & (PZ | NZ)) && (y === 50 || y === 60) && (x + 40) % 4 === 2) return IRON;
        if (e & NY) c = dk(c, 0.2);
        return c;
      },
      [M.ROOF]: (x, y, z, e) => {
        const u = Math.abs(x + 0.5);
        if ((e & NY) && !(e & PY)) return (x + 40) % 4 === 0 ? 0x2e2016 : 0x46301e; // the eaves' underside
        const rowF = (EAVE - u) / 5.2, r = Math.floor(rowF), f = rowF - r;
        const zz = z + 40 + (r & 1) * 2.5;
        const col = Math.floor(zz / 5);
        let c = SHING[(h3(col, r, x > 0 ? 1 : 0, 23) * SHING.length) | 0];
        if (zz - col * 5 < 1) c = dk(c, 0.3); // gap between shingles
        else if (f < 0.12 && (e & (PX | NX))) c = dk(c, 0.22); // the butt's shadow edge
        else if (f > 0.75) c = lt(c, 0.06);
        if (h3(x, y, z, 24) < 0.05) c = dk(c, 0.12);
        // lichen spots
        if (h3(x >> 1, r, z >> 1, 25) < 0.035) c = mix(c, 0xb8b878, 0.5);
        return c;
      },
      [M.MOSS]: (x, y, z, e) => {
        const n = h3(x, y, z, 26);
        let c = MOSS[1 + ((vnoise(x, z, 2.5, 33) * 3) | 0)];
        if (e & NY && !(e & PY)) c = MOSS[0];
        else if (n < 0.12) c = MOSS[4];
        else if (n > 0.9) c = MOSS[0];
        return c;
      },
      [M.PLAT]: (x, y, z, e) => {
        if (e & (PZ | NZ)) {
          // beam ends: rings
          const bx = Math.floor((x + 30) / 6), cx = -30 + bx * 6 + 3;
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - 2.5);
          return d > 2.6 ? 0x3e2814 : (Math.floor(d * 1.4) % 2 ? 0x8a6038 : 0x9e7244);
        }
        if ((x + 30) % 6 === 0 && (e & (PY | NY))) return 0x2e1c0e;
        let c = (e & NY) ? dk(PLAT, 0.25) : (e & PY) ? lt(PLAT, 0.08) : PLAT;
        if (y === 4 && (e & (PX | NX))) c = lt(c, 0.1);
        if (h3(x >> 2, y, z, 27) < 0.2) c = dk(c, 0.08);
        return c;
      },
      [M.TRIM]: (x, y, z, e) => {
        let c = TRIM;
        if (e & NY) c = TRIM_D;
        else if (e & PY) c = lt(TRIM, 0.12);
        if ((e & (PZ | NZ)) && ((x + y + 40) % 6 === 0)) c = dk(TRIM, 0.25); // carved notches
        if (h3(x, y, z, 28) < 0.08) c = dk(c, 0.08);
        return c;
      },
      [M.INT]: (x, y, z) => ((x + y + z) & 1 ? INT : 0x281a10),
      [M.FRAME]: (x, y, z, e) => {
        const a = Math.atan2(y - WIN.y, x - WIN.x);
        let c = 0x7a4a26;
        if (e & (PZ | PX)) c = Math.floor((a + 4) * 4) % 2 ? 0x9a6234 : 0x7a4a26;
        if (e & PY) c = lt(c, 0.1);
        return c;
      },
      [M.SHUT]: (x, y, z, e) => {
        const along = (e & (PX | NX)) ? z : x;
        // a carved heart in the middle of each shutter
        const sx = (e & (PX | NX)) ? (z > 0 ? SIDEWIN.z1 + 4.5 : SIDEWIN.z0 - 4.5) : (x > 0 ? 12.5 : -12.5);
        const sy = (e & (PX | NX)) ? (SIDEWIN.y0 + SIDEWIN.y1) / 2 : WIN.y - 5;
        const hx = Math.abs(along + 0.5 - sx), hy = y + 0.5 - sy;
        if (hy < 1.2 && hy > -1.8 && hx < 1.8 - (hy < 0 ? -hy * 0.9 : 0) && !(hy > 0.5 && hx < 0.4)) return 0x3a1a10;
        if (along % 3 === 0) return 0x7a2a1a;
        let c = 0xb8442c;
        if (h3(x, y, z, 29) < 0.12) c = LOG_B; // chipped paint
        if (e & PY) c = lt(c, 0.1);
        return c;
      },
      [M.PATCH]: (x, y, z) => {
        if ((y - 11) % 4 === 3) return 0x6a4a2c;
        if ((z === -12 || z === -2) && (y - 11) % 4 === 1) return IRON_L;
        return (Math.floor((y - 11) / 4) % 2) ? 0xc49a62 : 0xb08654;
      },
      [M.TIN]: (x, y, z) => {
        const edge = x === 3 || x === 14 || y === 9 || y === 18;
        if (edge && (x + y) % 3 === 0) return 0x4a4e54;
        if (x === 7 && y > 10 && y < 16) return 0x9a5a2a; // a rust streak
        return x % 2 ? TIN : 0xa7b4c2;
      },
      [M.SACK]: (x, y, z) => {
        const edge = x === 10 || x === 19 || z === -15 || z === -6;
        if (edge) return (x + z) & 1 ? 0x5a3a1a : 0xb89a60;
        if (Math.abs((x - 14.5) - (z + 10.5)) < 0.6 || Math.abs((x - 14.5) + (z + 10.5)) < 0.6) return 0x5a3a1a;
        return (x + z) & 1 ? 0xc8a870 : 0xb89a60;
      },
      [M.STEP]: (x, y, z, e) => {
        if (e & (PX | NX)) return Math.hypot(y - 1.5, z - (HZ + 4.5)) > 2 ? 0x5a3a20 : 0xc89a64;
        return (e & PY) ? LOG_L : LOG_B;
      },
    });
    return v;
  }
}

/** Round end grain on a log end voxel slab (literal colors). */
function endGrain(v, ex, cy, cc, axis) {
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
    const y = Math.floor(cy) + a, c = Math.floor(cc) + b;
    const d = Math.hypot(y + 0.5 - cy, c + 0.5 - cc);
    if (d > 3.1) continue;
    const col = d > 2.4 ? 0x5a3a20 : d < 0.8 ? 0xe8c890 : Math.floor(d * 1.6) % 2 ? 0xb88a54 : 0xd8b07a;
    if (axis === 'x') v.set(ex, y, c, col); else v.set(c, y, ex, col);
  }
}

// ---------------------------------------------------------------- moving parts
function doorGeo(bake) {
  return cached(`coop-door|${bake}`, () => {
    // hinge at x = 0, the door runs to x = 12; bottom at y = 0
    const w = DOOR.x1 - DOOR.x0, top = DOOR.top - WALL_Y0, r = DOOR.r;
    const v = new Vox(-1, w + 1, -1, top + r + 2, -2, 3);
    v.fill(0, w - 1, 0, top + r, -1, 0, (x, y) => y < top || (x - w / 2) ** 2 + (y - top) ** 2 <= r * r, (x, y) => {
      if (x % 3 === 0) return 0x5e3a1e;
      let c = (Math.floor(x / 3) % 2) ? 0x9a6a3c : 0x8a5c32;
      if (h3(x, y >> 2, 0, 41) < 0.18) c = dk(c, 0.1);
      return c;
    });
    // a Z brace
    v.box(1, 3, 1, w - 1, 5, 2, 0xb8844c);
    v.box(1, top - 3, 1, w - 1, top - 1, 2, 0xb8844c);
    v.line(2, 4.5, 1.5, w - 2, top - 2.5, 1.5, 0xa87644, 0.9);
    // iron strap hinges with nails
    for (const y of [2, top - 1]) {
      v.box(0, y, 2, 8, y + 1, 3, IRON);
      v.set(7, y, 2, IRON_L); v.set(2, y, 2, IRON_L);
    }
    // a ring pull
    const hx = w - 3, hy = Math.floor(top * 0.5);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, -1], [2, -1], [-1, -2], [2, -2], [0, -3], [1, -3]]) v.set(hx + dx - 0.5, hy + dy, 2, dy === 0 ? IRON_L : IRON);
    v.set(hx, hy + 1, 2, IRON);
    // a painted egg with a zigzag band
    const ex = w / 2, ey = top + 1.5;
    v.ell(ex, ey, 0.5, 2.3, 3, 0.9, (x, y) => (Math.abs(y - ey + 0.5 - ((x & 1) ? 0.6 : -0.6)) < 0.7 ? PAINT_R : PAINT_W));
    return v.geometry(bake);
  });
}

function chimneyGeo(bake) {
  return cached(`coop-chimney|${bake}`, () => {
    const v = new Vox(-8, 9, -9, CHIM_H + 5, -8, 9);
    const ax = (y) => (y < 9 ? 0 : y < 18 ? 1.5 : y < 26 ? 0 : -1);
    const az = (y) => (y < 14 ? 0 : 1);
    v.fill(-7, 8, -9, CHIM_H, -7, 8, (x, y, z) => Math.abs(x - 0.5 - ax(y)) <= 3.6 && Math.abs(z - 0.5 - az(y)) <= 3.6, 0, 1);
    // tin flashing where it meets the roof
    v.fill(-7, 8, -2, 0, -7, 8, (x, y, z) => Math.abs(x - 0.5) <= 5.2 && Math.abs(z - 0.5) <= 5.2, (x, y, z) => ((x + z) % 2 ? TIN : 0x6e747a));
    // a cap slab, sooty inside
    v.fill(-7, 8, CHIM_H, CHIM_H + 1, -7, 8, (x, y, z) => Math.abs(x - 0.5 + 1) <= 5.1 && Math.abs(z - 0.5 - 1) <= 5.1, (x, y) => (y === CHIM_H + 1 ? 0x8a8278 : 0x6e675f));
    v.carve(-7, 8, CHIM_H - 6, CHIM_H + 2, -7, 8, (x, y, z) => Math.abs(x - 0.5 + 1) <= 2.2 && Math.abs(z - 0.5 - 1) <= 2.2);
    v.fill(-7, 8, CHIM_H - 7, CHIM_H - 6, -7, 8, (x, y, z) => Math.abs(x - 0.5 + 1) <= 2.2 && Math.abs(z - 0.5 - 1) <= 2.2, 0x120c08);
    v.resolve({
      1: (x, y, z, e) => {
        const row = Math.floor((y + 9) / 3);
        if ((y + 9) % 3 === 0) return 0xb8a890; // mortar
        const along = (e & (PX | NX)) ? z : x;
        const k = Math.floor((along + 20 + (row & 1) * 2) / 4);
        if ((along + 20 + (row & 1) * 2) % 4 === 0) return 0xa89a82;
        const h = h3(k, row, (e & (PX | NX)) ? 1 : 2, 51);
        let c = h < 0.45 ? 0x9a4a32 : h < 0.75 ? 0x7a4a32 : h < 0.9 ? 0x6e675f : 0xb05a3a;
        if (e & PY) c = lt(c, 0.1);
        if (y > CHIM_H - 9) c = mix(c, 0x2a2420, clamp((y - (CHIM_H - 9)) / 10, 0, 0.75));
        return c;
      },
    });
    return v.geometry(bake);
  });
}

function puffGeo(bake) {
  return cached(`coop-puff|${bake}`, () => {
    const v = new Vox(-5, 5, -4, 5, -5, 5);
    const col = (x, y) => (y > 0 ? 0xe6e2da : y > -2 ? 0xcfc8be : 0xa8a098);
    v.ell(0, 0, 0, 3.2, 2.6, 3.2, col);
    v.ell(-1.8, 1.2, 0.6, 2, 2, 2, col);
    v.ell(1.6, 1.4, -0.8, 2.1, 1.9, 2, col);
    return v.geometry(bake);
  });
}

/** A charm hanging from a string (pivot at the top). kind: horseshoe | bell | herbs | beads | lantern. */
function charmGeo(kind, bake) {
  return cached(`coop-charm|${kind}|${bake}`, () => {
    const v = new Vox(-6, 6, -22, 2, -3, 3);
    const STRING = 0xd8c8a0;
    if (kind === 'horseshoe') {
      v.line(0, 0, 0, 0, -5, 0, STRING, 0.5);
      // an upside-down U (luck pours down on the door)
      v.fill(-5, 5, -14, -4, -1, 1, (x, y) => {
        const d = Math.hypot(x, y + 8);
        return (d >= 2.4 && d <= 4.4 && y >= -8.5) || (y < -8 && Math.abs(Math.abs(x) - 3.4) <= 1);
      }, (x, y) => (y > -6 ? 0xa8a4a0 : 0x8a8580));
      v.set(-4, -11, 0, 0x4a4440); v.set(3, -11, 0, 0x4a4440); v.set(-3, -6, 0, 0x4a4440); v.set(2, -6, 0, 0x4a4440);
    } else if (kind === 'bell') {
      v.line(0, 0, 0, 0, -3, 0, STRING, 0.5);
      v.fill(-4, 4, -10, -3, -4, 4, (x, y, z) => {
        const t = (-3 - y) / 6;
        const r = 1.2 + t * 2.4;
        return x * x + z * z <= r * r && t >= 0 && t <= 1;
      }, (x, y) => (y === -9 ? 0xa8772c : y > -6 ? 0xf7d97c : 0xdcae4e));
      v.set(0, -10, 0, 0x6e4a1a);
    } else if (kind === 'herbs') {
      v.line(0, 0, 0, 0, -3, 0, STRING, 0.5);
      v.box(-1, -5, -1, 1, -3, 1, PAINT_R);
      for (let k = -2; k <= 2; k++) {
        v.line(k * 0.4, -5, 0, k * 1.3, -14 + Math.abs(k), k % 2 ? 0.8 : -0.6, k % 2 ? 0x6a8a3a : 0x7a6a3a, 0.6);
        v.ell(k * 1.4, -14.5 + Math.abs(k), 0, 0.9, 1.6, 0.9, k % 2 ? 0x9a6ad0 : 0x5a8a3a);
      }
    } else if (kind === 'beads') {
      const cols = [PAINT_R, PAINT_Y, PAINT_B, PAINT_W, PAINT_G, PAINT_R];
      for (let k = 0; k < 6; k++) {
        v.line(0, -k * 2.2, 0, 0, -k * 2.2 - 1, 0, STRING, 0.4);
        v.ell(0, -k * 2.2 - 1.6, 0, 0.9, 0.9, 0.9, cols[k]);
      }
      // a feather at the end
      v.line(0, -14, 0, 0.6, -21, 0.4, 0xf2e8d6, 1.0);
      v.line(0.3, -18, 0, 0.8, -21.5, 0, 0x8a6a4a, 0.6);
      v.line(0, -14, 0, 0.4, -21, 0, 0x6a5a4a, 0.3);
    }
    return v.geometry(bake);
  });
}

function lanternGeo(bake) {
  return cached(`coop-lantern|${bake}`, () => {
    const v = new Vox(-4, 4, -17, 2, -4, 4);
    for (let k = 0; k < 4; k++) v.set(0, -k, 0, k % 2 ? IRON_L : IRON);
    v.box(-3, -6, -3, 3, -4, 3, IRON);
    v.box(-2, -4, -2, 2, -3, 2, IRON_L);
    for (const [x, z] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) v.box(x, -13, z, x + 1, -6, z + 1, IRON);
    v.box(-3, -15, -3, 3, -13, 3, IRON);
    v.set(-1, -16, -1, IRON_L);
    return v.geometry(bake);
  });
}

/** The glowing glass: the side window's pane and the lantern's flame box (unlit, no outline). */
function glowGeos() {
  return cached('coop-glow', () => {
    const pane = new Vox(0, 1, SIDEWIN.y0, SIDEWIN.y1, SIDEWIN.z0, SIDEWIN.z1);
    pane.fill(0, 0, SIDEWIN.y0, SIDEWIN.y1 - 1, SIDEWIN.z0, SIDEWIN.z1 - 1, () => true, (x, y, z) => {
      const d = Math.hypot((y - 23) / 6, z / 6);
      let c = mix(0xffe6a0, 0xd9802a, clamp(d, 0, 1));
      // a candle's silhouette on the sill inside
      if (Math.abs(z + 2.5) < 1 && y < SIDEWIN.y0 + 4) c = 0x6a3a1a;
      if (Math.abs(z + 2.5) < 1 && y === SIDEWIN.y0 + 4) c = 0xfff6d0;
      return c;
    });
    const flame = new Vox(-3, 3, -13, -6, -3, 3);
    flame.box(-2, -13, -2, 2, -6, 2, (x, y) => mix(0xfff2b0, 0xe8902a, clamp((-6 - y) / 7 + Math.abs(x + 0.5) * 0.15, 0, 1)));
    flame.box(-1, -11, -1, 1, -8, 1, 0xfffbe0);
    return { pane: pane.geometry(true), flame: flame.geometry(true) };
  });
}

function thighGeo(bake) {
  return cached(`coop-thigh|${bake}`, () => {
    const v = new Vox(-11, 11, -22, 8, -11, 11);
    // a feathered drumstick from the hip down to the hock
    v.fill(-10, 10, -T - 1, 6, -10, 10, (x, y, z) => {
      const t = clamp((5 - y) / (T + 4), 0, 1);
      let r = lerp(8.2, 3.6, t) + Math.sin(t * Math.PI) * 1.4 * (1 - t);
      if (y > 3) r *= Math.sqrt(Math.max(0, 1 - ((y - 3) / 3) ** 2));
      return x * x + z * z * 1.1 <= r * r;
    }, 0, 1);
    // a frill of feather tips round the hip
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2 + 0.2;
      const r0 = 6.5, r1 = 10;
      v.line(Math.cos(a) * r0, 2, Math.sin(a) * r0, Math.cos(a) * r1, -3 - (k % 3), Math.sin(a) * r1, 0, 1.1, 2);
    }
    // a second, shorter frill lower down
    for (let k = 0; k < 11; k++) {
      const a = k / 11 * Math.PI * 2;
      v.line(Math.cos(a) * 5, -7, Math.sin(a) * 5, Math.cos(a) * 7.2, -11 - (k % 2), Math.sin(a) * 7.2, 0, 0.95, 2);
    }
    v.resolve({
      1: (x, y, z, e) => {
        // overlapping scallops of feathers
        const r = Math.floor((y + 40) / 3);
        const a = Math.atan2(z, x);
        const col = Math.floor((a + 4) * 3.2 + (r & 1) * 0.5);
        const ly = (y + 40) - r * 3;
        let c = FEATH;
        if (ly < 1) c = dk(c, 0.13);
        else if (ly === 2 && (col & 1)) c = lt(c, 0.05);
        if (y < -T + 4) c = mix(c, FEATH_T, 0.5);
        if (e & NY) c = dk(c, 0.12);
        return c;
      },
      2: (x, y) => (y < -9 ? FEATH_T : y < -2 ? mix(FEATH, FEATH_T, 0.5) : FEATH),
    });
    return v.geometry(bake);
  });
}

function shinGeo(bake) {
  return cached(`coop-shin|${bake}`, () => {
    const v = new Vox(-6, 6, -S - 5, 5, -8, 7);
    v.ell(0, -0.5, -0.4, 4.1, 3.8, 4.2, 0, 2); // the hock
    v.fill(-5, 5, -S, 0, -5, 5, (x, y, z) => {
      const t = -y / S;
      const r = 3.4 - 0.7 * t;
      return x * x + z * z * 0.92 <= r * r;
    }, 0, 1);
    v.line(0, -9, -2.6, 0, -10.6, -6.6, 0, 1.05, 3); // spur
    v.ell(0, -S, 0.2, 3.3, 2.8, 3.5, 0, 2); // the ankle
    v.resolve({
      1: (x, y, z, e) => {
        if (e & PZ || (z > 1.5 && (e & (PX | NX)))) {
          // scutes down the front: plates with a light lip and a dark gap
          const k = ((y + 60) % 3);
          return k === 2 ? LEG_L : k === 0 ? LEG_DD : LEG_B;
        }
        if (e & NZ) return ((x + y) & 1) ? LEG_D : dk(LEG_D, 0.08);
        // small round scales on the sides
        const k = (y + 60 + ((z + 20) >> 1) * 2) % 3;
        return k === 0 ? LEG_D : (h3(x, y, z, 61) < 0.2 ? LEG_L : LEG_B);
      },
      2: (x, y, z, e) => ((e & PY) ? LEG_L : ((x + y + z) & 1) ? 0xd88a3a : LEG_D),
      3: (x, y, z) => (z < -5 ? CLAW : 0xd8c8a0),
    });
    return v.geometry(bake);
  });
}

function footGeo(bake) {
  return cached(`coop-foot|${bake}`, () => {
    const v = new Vox(-6, 6, -5, 3, -11, 6);
    v.ell(0, -1.2, 0.6, 3.6, 2.1, 3.9, 0, 1);
    v.line(0, -1.6, -1.5, 0, -2.2, -6, 0, 1.3, 1); // the back toe
    v.ell(0, -2, -3.8, 1.6, 1.4, 1.6, 0, 1);
    v.line(0, -2.2, -6, 0, -3.5, -8.4, 0, 0.8, 2);
    v.resolve({
      1: (x, y, z, e) => ((e & NY) ? LEG_DD : (e & PY) ? (((x + z) & 1) ? LEG_L : LEG_B) : ((y + z) & 1) ? LEG_B : LEG_D),
      2: (x, y) => (y > -3 ? CLAW_L : CLAW),
    });
    return v.geometry(bake);
  });
}

function toesGeo(bake) {
  return cached(`coop-toes|${bake}`, () => {
    const v = new Vox(-9, 9, -6, 3, -3, 19);
    for (const [a, len] of [[0, 12], [-0.52, 10], [0.52, 10]]) {
      const dx = Math.sin(a), dz = Math.cos(a);
      v.line(0, 0, 0, dx * len, -0.8, dz * len, 0, 1.45, 1);
      for (const k of [3.6, 7.2, 10.4]) if (k < len) v.ell(dx * k, -0.4 - k * 0.04, dz * k, 1.75, 1.6, 1.75, 0, 1);
      // a hooked claw
      const tx = dx * (len + 0.6), tz = dz * (len + 0.6);
      v.line(tx, -0.5, tz, dx * (len + 2.6), -2.4, dz * (len + 2.6), 0, 0.85, 2);
    }
    v.resolve({
      1: (x, y, z, e) => {
        if (e & NY) return LEG_DD;
        const d = Math.hypot(x, z);
        const k = Math.floor(d * 1.2) % 2;
        return (e & PY) ? (k ? LEG_L : LEG_B) : k ? LEG_B : LEG_D;
      },
      2: (x, y) => (y > -1.2 ? CLAW_L : CLAW),
    });
    return v.geometry(bake);
  });
}

// ---------------------------------------------------------------- the rig
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();

class CoopRig {
  constructor(o) {
    Object.assign(this, o);
    this.state = 'idle';
    this.t = Math.random() * 10;
    this.facing = 0; this.targetFacing = 0;
    this.phase = 0; this.amp = 0;
    this.w = { sit: 0, stuck: 0, carried: 0, air: 0 };
    this.doorT = 0; this.doorK = 0; this.doorV = 0;
    this.glowK = 1;
    this.squash = 0; this.squashV = 0;
    this.shakeT = 0;
    this.idleT = 2 + Math.random() * 3;
    this.act = null; // idle shuffle in progress
    this.peek = 0;
    this.smokeT = 0;
    this.eggT = -1;
    this.lastStance = [true, true];
    this.henOn = true;
    this.onStep = null; this.onJingle = null; this.onEgg = null;
  }

  play(state) {
    if (state === 'walk' || state === 'run') state = 'idle';
    if (this.state === state) return;
    this.state = state;
    this.stateT = 0;
    if (state === 'stuck') this.hen?.flap(0.6);
  }
  face(yaw, instant) { this.targetFacing = yaw; if (instant) this.facing = yaw; }
  /** Door: 0 shut … 1 wide open (it swings there with a little bounce). */
  setDoor(k) { this.doorT = clamp(k, 0, 1); }
  setNugget(on) { this.henOn = !!on; if (this.hen) this.hen.root.visible = this.henOn; }
  setGlow(k) { this.glowK = clamp(k, 0, 1.5); }
  /** A crouch before a hop (the scene does the actual jump). */
  hop() { this.squashV -= 40; this.hen?.flap(0.4); }
  /** Landing squash: v = fall speed (m/s). */
  land(v = 2) { this.squashV += -clamp(v, 0.5, 6) * 26; this.kickCharms(clamp(v / 3, 0.3, 1.4)); }
  /** A startled shiver (eggs, bumps, being fed). */
  shake(k = 1) { this.shakeT = Math.max(this.shakeT, 0.6 * k); this.kickCharms(k); }
  /** Squat, pop the door, lay an egg (rig.onEgg(worldPos) fires at the plop). Returns the duration. */
  layEgg() { this.eggT = 0; return 1.6; }
  peck() { this.hen?.peck(); }

  kickCharms(k) {
    for (const c of this.charms) { c.vx += (Math.random() - 0.3) * 6 * k; c.vz += (Math.random() - 0.5) * 7 * k; }
  }

  windowWorld(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.hut.localToWorld(out.set(12 * this.vs, (WALL_Y0 + 34) * this.vs, (HZ + 1) * this.vs)) } // where Nugget sits, in the open bay
  doorWorld(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.hut.localToWorld(out.set(DOOR.cx * this.vs, (WALL_Y0 + 3) * this.vs, (HZ + 6) * this.vs)); }
  chimneyWorld(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.chimney.localToWorld(out.set(0, (CHIM_H + 2) * this.vs, 0)); }

  /** 2-bone IK for one leg toward a foot target (root space, voxels). Knees bend backwards. */
  solve(leg, fx, fy, fz) {
    const vs = this.vs;
    _p.set(fx * vs, fy * vs, fz * vs).applyMatrix4(this._inv);
    const dx = _p.x / vs - leg.hx, dy = _p.y / vs - leg.hy, dz = _p.z / vs - leg.hz;
    const d = clamp(Math.hypot(dx, dy, dz), Math.abs(T - S) + 1, T + S - 0.2);
    const thD = Math.atan2(-dz, -dy);
    const a1 = Math.acos(clamp((T * T + d * d - S * S) / (2 * T * d), -1, 1));
    const a2 = Math.acos(clamp((T * T + S * S - d * d) / (2 * T * S), -1, 1));
    leg.ik.thigh = thD + a1;
    leg.ik.knee = -(Math.PI - a2);
    leg.ik.splay = Math.asin(clamp(dx / d, -0.6, 0.6));
  }

  update(dt, o = {}) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    this.stateT = (this.stateT || 0) + dt;
    const t = this.t, vs = this.vs, st = this.state;
    const speed = Math.max(0, o.speed || 0);
    const moving = o.moving ?? speed > 0.05;
    const air = !!o.airborne;
    // facing (smoothed)
    let df = this.targetFacing - this.facing;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    this.facing += df * Math.min(1, dt * 7);
    this.root.rotation.y = this.facing;
    const turn = clamp(df * 3, -1, 1);
    // pose weights
    const kw = Math.min(1, dt * 5);
    const W = this.w;
    W.sit += ((st === 'sit' ? 1 : 0) - W.sit) * kw * 0.7;
    W.stuck += ((st === 'stuck' ? 1 : 0) - W.stuck) * kw * 1.5;
    W.carried += ((st === 'carried' ? 1 : 0) - W.carried) * kw * 1.4;
    W.air += ((air && st === 'idle' ? 1 : 0) - W.air) * Math.min(1, dt * 10);
    // gait
    const walkWant = st === 'idle' && moving && !air ? clamp(speed / 0.35, 0, 1) : 0;
    this.amp += (walkWant - this.amp) * Math.min(1, dt * (walkWant > this.amp ? 8 : 5));
    const a = this.amp;
    const sp = Math.max(speed, 0.6);
    const freq = 1.5 + sp * 1.1;
    const duty = lerp(0.62, 0.45, clamp((sp - 1.6) / 2.4, 0, 1));
    if (a > 0.01) this.phase = (this.phase + freq * dt) % 1;
    const stepHalf = Math.min(19, (sp / vs) * duty / freq / 2);
    const lift = 5 + Math.min(6, sp * 1.8);
    // body
    const bob = a * (1 + sp * 0.75) * (0.5 + 0.5 * Math.cos(this.phase * Math.PI * 4));
    let H = H0 - bob;
    let pitch = a * (0.03 + 0.025 * sp);
    let roll = a * 0.07 * Math.sin(this.phase * Math.PI * 2) - turn * 0.06 * a;
    let yaw = a * 0.06 * Math.sin(this.phase * Math.PI * 2);
    // idle: breathing, shuffles
    const breathe = Math.sin(t * 2.1);
    H -= (1 - a) * (0.4 + breathe * 0.4);
    const feet = [{ x: -FOOT_X, y: ANK, z: FOOT_Z, toe: 0, pitch: 0 }, { x: FOOT_X, y: ANK, z: FOOT_Z, toe: 0, pitch: 0 }];
    for (let i = 0; i < 2; i++) {
      const f = feet[i];
      const p = (this.phase + i * 0.5) % 1;
      let fz, fy = 0, toe, fp;
      if (p < duty) {
        const s = p / duty;
        fz = stepHalf * (1 - 2 * s);
        toe = -0.12 * Math.sin(Math.PI * s);
        fp = 0;
        if (!this.lastStance[i] && a > 0.35) this.onStep?.(i ? 1 : -1, a);
        this.lastStance[i] = true;
      } else {
        const s = (p - duty) / (1 - duty);
        fz = -stepHalf + 2 * stepHalf * smooth(s);
        fy = lift * Math.sin(Math.PI * s);
        toe = 1.1 * Math.sin(Math.PI * Math.min(1, s * 1.3));
        fp = 0.5 * Math.sin(Math.PI * s) - 0.25 * Math.sin(Math.PI * s * 2);
        this.lastStance[i] = false;
      }
      f.z += a * fz; f.y += a * fy; f.toe = a * toe; f.pitch = a * fp;
      f.x *= 1 - a * 0.06;
    }
    // idle shuffles: little steps, scratching, ruffles, settling
    if (st === 'idle' && a < 0.05 && !air) {
      if (!this.act) {
        this.idleT -= dt;
        if (this.idleT <= 0) {
          const r = Math.random();
          const kind = r < 0.3 ? 'step' : r < 0.55 ? 'scratch' : r < 0.75 ? 'ruffle' : r < 0.9 ? 'settle' : 'look';
          this.act = { kind, t: 0, leg: Math.random() < 0.5 ? 0 : 1, dur: { step: 0.9, scratch: 1.5, ruffle: 0.8, settle: 1.6, look: 2.2 }[kind], dz: (Math.random() - 0.5) * 6 };
          this.idleT = 2.5 + Math.random() * 4;
          if (kind === 'scratch') this.hen?.peck();
          if (kind === 'ruffle') { this.shake(0.8); this.hen?.flap(0.35); }
        }
      }
    } else if (this.act && (a > 0.2 || st !== 'idle')) this.act = null;
    if (this.act) {
      const A = this.act;
      A.t += dt;
      const u = A.t / A.dur;
      const f = feet[A.leg], g = feet[1 - A.leg];
      if (A.kind === 'step') {
        // shift the weight, lift one foot and set it down a little elsewhere, then the other
        const s1 = clamp(u * 2, 0, 1), s2 = clamp(u * 2 - 1, 0, 1);
        f.y += Math.sin(Math.PI * s1) * 5; f.toe += Math.sin(Math.PI * s1) * 0.9; f.z += A.dz * smooth(s1) * (1 - s2);
        g.y += Math.sin(Math.PI * s2) * 4; g.toe += Math.sin(Math.PI * s2) * 0.8;
        roll += (A.leg ? 1 : -1) * 0.05 * Math.sin(Math.PI * u);
        if (Math.abs(u - 0.5) < dt / A.dur) this.onStep?.(A.leg ? 1 : -1, 0.4);
      } else if (A.kind === 'scratch') {
        // two quick backward rakes with one foot, leaning in to look
        const k = (u * 2) % 1;
        f.y += k < 0.35 ? Math.sin(k / 0.35 * Math.PI) * 4 : 0;
        f.z += k < 0.35 ? lerp(0, 7, k / 0.35) : lerp(7, -7, (k - 0.35) / 0.65);
        f.toe += k < 0.35 ? 0.5 : -0.25;
        pitch += 0.12 * Math.sin(Math.PI * u);
        roll += (A.leg ? -1 : 1) * 0.06 * Math.sin(Math.PI * u);
        if (k > 0.35 && k - 0.35 < dt * 2 / A.dur) this.onStep?.(A.leg ? 1 : -1, 0.25);
      } else if (A.kind === 'ruffle') {
        roll += Math.sin(t * 34) * 0.05 * (1 - u);
        H += Math.abs(Math.sin(t * 17)) * 1.2 * (1 - u);
      } else if (A.kind === 'settle') {
        H -= Math.sin(Math.PI * u) * 5;
        pitch -= Math.sin(Math.PI * u) * 0.04;
      } else if (A.kind === 'look') {
        yaw += Math.sin(Math.PI * u) * (A.leg ? 0.28 : -0.28);
        f.y += Math.max(0, Math.sin(u * Math.PI * 4)) * 2;
      }
      if (A.t >= A.dur) this.act = null;
    }
    // laying an egg: squat, door pops open, plop, door shuts, a proud shiver
    if (this.eggT >= 0) {
      this.eggT += dt;
      const u = this.eggT;
      H -= Math.sin(Math.PI * clamp(u / 1.2, 0, 1)) * 7;
      roll += Math.sin(t * 26) * 0.03 * (u < 0.7 ? 1 : 0);
      this.doorEgg = u > 0.35 && u < 1.3;
      if (u >= 0.75 && !this.eggPlop) { this.eggPlop = true; this.onEgg?.(this.doorWorld(new THREE.Vector3())); this.shake(0.7); }
      if (u > 1.6) { this.eggT = -1; this.eggPlop = false; this.doorEgg = false; }
    }
    // shiver
    if (this.shakeT > 0) { this.shakeT -= dt; roll += Math.sin(t * 40) * 0.04 * Math.min(1, this.shakeT * 3); }
    // airborne: legs tucked
    // stuck: flailing and wobbling, little hop attempts
    const sw = W.stuck;
    if (sw > 0.01) {
      H = lerp(H, H0 + 2 + Math.abs(Math.sin(t * 3.3)) * 5, sw);
      roll = lerp(roll, Math.sin(t * 6.5) * 0.2, sw);
      pitch = lerp(pitch, Math.sin(t * 4.7) * 0.1 - 0.05, sw);
      yaw = lerp(yaw, Math.sin(t * 3.1) * 0.15, sw);
      for (let i = 0; i < 2; i++) {
        const ph = t * 13 + i * Math.PI;
        const f = feet[i];
        f.z = lerp(f.z, 2 + 11 * Math.cos(ph), sw);
        f.y = lerp(f.y, ANK + 9 + 7 * Math.sin(ph), sw);
        f.toe = lerp(f.toe, 0.4 + 0.6 * Math.sin(t * 19 + i), sw);
        f.pitch = lerp(f.pitch, 0.5 * Math.sin(ph), sw);
      }
      if (st === 'stuck' && this.hen && this.hen.flapT <= 0 && Math.random() < dt * 2) this.hen.flap(0.5);
    }
    // squash & stretch (spring)
    this.squashV += (-this.squash * 180 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    H += this.squash;
    // sitting: the hut settles onto its folded legs
    H = lerp(H, 12 + breathe * 0.3, W.sit);
    pitch = lerp(pitch, -0.04, W.sit);
    roll = lerp(roll, Math.sin(t * 0.7) * 0.015, W.sit);
    // carried: level, a gentle sway
    H = lerp(H, H0, W.carried);
    pitch = lerp(pitch, -0.1 + Math.sin(t * 1.9) * 0.03, W.carried);
    roll = lerp(roll, Math.sin(t * 1.4) * 0.06, W.carried);
    this.body.position.set(0, H * vs, 0);
    this.body.rotation.set(pitch, yaw, roll);
    this.body.updateMatrix();
    this._inv.copy(this.body.matrix).invert();
    // breathing hut
    const br = 1 + breathe * 0.006 * (1 - a);
    this.hut.scale.set(1 + (br - 1) * 0.5, br, 1 + (br - 1) * 0.5);

    // legs
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i], f = feet[i];
      this.solve(leg, f.x, f.y, f.z);
      let th = leg.ik.thigh, kn = leg.ik.knee, spl = leg.ik.splay, toe = f.toe, fp = f.pitch;
      // tucked in the air
      th = lerp(th, -0.35 + i * 0.1, W.air); kn = lerp(kn, -1.25, W.air); toe = lerp(toe, 0.9, W.air); fp = lerp(fp, 0.7, W.air);
      // folded under (sitting)
      th = lerp(th, 1.25, W.sit); kn = lerp(kn, -2.62, W.sit); toe = lerp(toe, 0, W.sit); fp = lerp(fp, 0, W.sit); spl = lerp(spl, 0, W.sit);
      // dangling (carried)
      const dph = t * 2.3 + i * 2.1;
      th = lerp(th, 0.3 + Math.sin(dph) * 0.22, W.carried);
      kn = lerp(kn, -0.55 + Math.sin(dph + 1.1) * 0.25, W.carried);
      toe = lerp(toe, 1.05, W.carried); fp = lerp(fp, 0.6, W.carried); spl = lerp(spl, (i ? 1 : -1) * 0.08, W.carried);
      leg.hip.rotation.set(th, 0, spl);
      leg.knee.rotation.x = kn;
      leg.ankle.rotation.x = fp - (pitch + th + kn);
      leg.toes.rotation.x = toe;
    }

    // the door
    const doorWant = Math.max(this.doorT, this.doorEgg ? 1 : 0, sw > 0.5 ? 0.5 + 0.5 * Math.sin(t * 8.5) : 0);
    this.doorV += ((doorWant - this.doorK) * 120 - this.doorV * 11) * dt;
    this.doorK += this.doorV * dt;
    const rattle = a * 0.04 * Math.sin(this.phase * Math.PI * 4 + 0.7) * (1 - this.doorK);
    this.door.rotation.y = -1.75 * clamp(this.doorK, -0.05, 1.08) + rattle;
    // chimney wobble (lags the body's sway)
    this.chimWob = (this.chimWob || 0) + ((-roll * 1.6) - (this.chimWob || 0)) * Math.min(1, dt * 6);
    this.chimney.rotation.set(-pitch * 0.8 + Math.sin(t * 9) * 0.01 * a, 0, this.chimWob + Math.sin(this.phase * Math.PI * 4) * 0.025 * a);
    // charms: damped pendulums pushed by the hut's sway and speed
    let jingle = 0;
    for (const c of this.charms) {
      const tx = speed * 0.09 - pitch, tz = -roll;
      c.vx += ((tx - c.ax) * c.k - c.vx * 2.4) * dt;
      c.vz += ((tz - c.az) * c.k - c.vz * 2.4) * dt;
      if (a > 0.2) { c.vz += Math.sin(this.phase * Math.PI * 4 + c.ph) * dt * 9 * a; c.vx += Math.cos(this.phase * Math.PI * 4 + c.ph) * dt * 5 * a; }
      c.ax += c.vx * dt; c.az += c.vz * dt;
      c.ax = clamp(c.ax, -1.1, 1.1); c.az = clamp(c.az, -1.1, 1.1);
      c.g.rotation.set(c.ax, 0, c.az);
      if (c.bell) jingle = Math.abs(c.vz) + Math.abs(c.vx);
    }
    if (jingle > 1.6 && t - (this.jingleT || 0) > 0.35) { this.jingleT = t; this.onJingle?.(Math.min(1, jingle / 4)); }
    // smoke puffs drifting from the chimney (they trail behind when the hut runs)
    const smokeK = st === 'carried' ? 0.4 : lerp(1, 0.45, W.sit) * (sw > 0.5 ? 1.3 : 1);
    this.smokeT += dt * (0.8 + a * 0.6);
    const L = 2.4;
    for (let i = 0; i < this.puffs.length; i++) {
      const P = this.puffs[i];
      const u = ((this.smokeT + i * L / this.puffs.length) % L) / L;
      const grow = (0.35 + u * 1.25) * (u > 0.8 ? (1 - u) / 0.2 : u < 0.06 ? u / 0.06 : 1) * smokeK;
      P.position.set((CHIM[0] - 1 + Math.sin(u * 4 + i * 1.7) * 2.5 + this.chimWob * 10) * vs, (CHIM[1] + CHIM_H + 3 + u * 24) * vs, (CHIM[2] + 1 - u * (4 + speed * 9)) * vs);
      P.scale.setScalar(vs * Math.max(0.0001, grow));
    }
    // the glass glows and flickers
    if (this.glowMat) {
      const f = this.glowK * (0.88 + Math.sin(t * 11) * 0.05 + Math.sin(t * 27.3) * 0.04);
      this.glowMat.color.setRGB(f, f * 0.96, f * 0.9);
    }
    if (this.lantern) {
      const lc = this.lantern;
      lc.vz += ((-roll - lc.az) * 30 - lc.vz * 3) * dt + (a > 0.2 ? Math.sin(this.phase * Math.PI * 4) * dt * 6 * a : 0);
      lc.vx += ((speed * 0.08 - pitch - lc.ax) * 30 - lc.vx * 3) * dt;
      lc.ax += lc.vx * dt; lc.az += lc.vz * dt;
      lc.g.rotation.set(clamp(lc.ax, -0.9, 0.9), 0, clamp(lc.az, -0.9, 0.9));
    }
    // Nugget in the window: leans out when the hut stands still, ducks in when it runs
    if (this.hen) {
      const h = this.hen;
      const peekT = !this.henOn ? 0 : st === 'sit' ? -1 : st === 'stuck' ? 1.5 : st === 'carried' ? 2.5 : a > 0.6 ? -1.2 : 2.2;
      this.peek += (peekT - this.peek) * Math.min(1, dt * 4);
      h.root.position.set(h.root.position.x, this.henY * vs, (this.henZ + this.peek) * vs);
      h.play(st === 'sit' ? 'sit' : 'idle');
      if (st === 'idle' && a < 0.2 && Math.random() < dt * 0.15) h.peck();
      h.update(dt);
      if (st === 'carried') h.head.rotation.x -= 0.35; // looking up at whoever's carrying her
    }
    // the blob shadow shrinks when off the ground
    if (this.shadow) {
      const lifted = Math.max(W.carried, W.air * 0.6, sw * 0.3);
      this.shadow.scale.setScalar(1 - lifted * 0.45);
      this.shadow.material.opacity = 0.3 * (1 - lifted * 0.6);
    }
  }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose?.();
    this.skeleton?.dispose();
    this.hen?.dispose();
    this.glowMat?.dispose();
    if (this.shadow) { this.shadow.geometry.dispose(); this.shadow.material.dispose(); }
  }
}

/**
 * Build the coop. opts.height: meters from the ground to the roof ridge when standing (default
 * 1.0); opts.kind: 'toon' | 'lambert' | 'basic'; opts.hen: put Nugget in the window (default
 * true); opts.shadow: a soft blob shadow under the feet (default true).
 */
export function makeCoop(opts = {}) {
  const height = opts.height ?? 1.0;
  const vs = height / (H0 + RIDGE + 8.6);
  const kind = opts.kind || 'toon';
  const bake = kind === 'basic';
  const A = new SkinAssembler();
  const R = [vs, vs, vs], L = [-vs, vs, vs];
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x * vs, y * vs, z * vs);
    parent.add(g);
    return g;
  };
  const root = new THREE.Group();
  root.name = 'coop';
  const body = group(root, 0, H0, 0);
  body.matrixAutoUpdate = true;
  const hut = group(body);
  A.part(hut, hutGeo(bake), { scale: R });
  // the door on its hinge
  const door = group(hut, DOOR.x0, WALL_Y0, HZ + 0.5);
  A.part(door, doorGeo(bake), { scale: R });
  // the crooked chimney and its smoke
  const chimney = group(hut, CHIM[0], CHIM[1], CHIM[2]);
  A.part(chimney, chimneyGeo(bake), { scale: R });
  const pg = puffGeo(bake);
  const puffs = [0, 1, 2, 3].map(() => A.part(hut, pg, { scale: R }));
  // charms under the front eaves
  const charmAt = (x, kind) => {
    const u = Math.abs(x + 0.5);
    const g = group(hut, x + 0.5, Math.floor(under(u)) - 3, RZ - 1);
    A.part(g, charmGeo(kind, bake), { scale: R });
    return { g, ax: 0, az: 0, vx: 0, vz: 0, k: 26 + Math.random() * 10, ph: Math.random() * 6, bell: kind === 'bell' };
  };
  const charms = [charmAt(21, 'horseshoe'), charmAt(11, 'bell'), charmAt(-23, 'herbs'), charmAt(-13, 'beads')];
  // the lantern at the front-left corner
  const lg = group(hut, -HX - 3, WALL_Y1 - 3, HZ + 4);
  A.part(lg, lanternGeo(bake), { scale: R });
  // legs
  const legs = [-1, 1].map((side) => {
    const hip = group(body, side * HIP.x, HIP.y, HIP.z);
    A.part(hip, thighGeo(bake), { scale: side < 0 ? L : R });
    const knee = group(hip, 0, -T, 0);
    A.part(knee, shinGeo(bake), { scale: side < 0 ? L : R });
    const ankle = group(knee, 0, -S, 0);
    A.part(ankle, footGeo(bake), { scale: side < 0 ? L : R });
    const toes = group(ankle, 0, -1.6, 2.4);
    A.part(toes, toesGeo(bake), { scale: side < 0 ? L : R });
    return { hip, knee, ankle, toes, side, hx: side * HIP.x, hy: HIP.y, hz: HIP.z, ik: { thigh: 0, knee: 0, splay: 0 } };
  });
  const h = (H0 + RIDGE + 8.6) * vs;
  const skin = A.build(charMaterial(kind), new THREE.Sphere(new THREE.Vector3(0, h * 0.55, 0), h * 0.85));
  root.add(skin.main);
  const meshes = [skin.main];
  // the glowing glass (unlit, no outline)
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const gg = glowGeos();
  const pane = new THREE.Mesh(gg.pane, glowMat);
  pane.scale.setScalar(vs);
  pane.position.set((HX - 3) * vs, 0, 0);
  hut.add(pane);
  const flame = new THREE.Mesh(gg.flame, glowMat);
  flame.scale.setScalar(vs);
  lg.add(flame);
  // Nugget in the round window
  let hen = null;
  const henY = WALL_Y0 + 22.5, henZ = HZ - 7, henX = 12; // Nugget sits on her straw shelf in the open bay
  if (opts.hen !== false) {
    hen = makeChicken({ scale: vs * 32, kind });
    hen.root.position.set(henX * vs, henY * vs, henZ * vs);
    hut.add(hen.root);
  }
  // a soft blob shadow
  let shadow = null;
  if (opts.shadow !== false) {
    const sm = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
    shadow = new THREE.Mesh(new THREE.CircleGeometry(30 * vs, 20), sm);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1, 0.8, 1);
    shadow.position.y = 0.004;
    shadow.renderOrder = -1;
    root.add(shadow);
  }
  const rig = new CoopRig({
    root, body, hut, door, chimney, puffs, charms, legs, hen, henY, henZ, shadow, glowMat,
    lantern: { g: lg, ax: 0, az: 0, vx: 0, vz: 0 },
    vs, height: h, radius: 33 * vs, meshes, skeleton: skin.skeleton, _inv: new THREE.Matrix4(),
  });
  root.userData.rig = rig;
  rig.update(0);
  return rig;
}

export const COOP_DIMS = { T, S, H0, RIDGE, HX, HZ, EAVE, RZ };

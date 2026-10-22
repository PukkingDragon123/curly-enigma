// NPC burrows in the mine: homes and shops dug by the folk who live down here. Each kind is dressed
// as its own place in voxels (the big furniture you bump into) and lists the 3D props that bring it
// to life (src/deep/Traders.js places those, models in src/deep/traders/models.js):
//   trader     the Trading Post: plank wainscot and limewash, a long counter, shelves of goods along
//              the back wall, a display table, stacked crates, the sign over the door
//   herbalist  Herbalist's Hollow: earthen walls, a stone hearth with a cauldron under a brick hood,
//              raised mushroom beds, a work table, jar shelves, herbs drying on a ceiling beam
//   raccoon    Rocco's Storage: a junk hoard of crate stacks and tarp-covered piles, a counter made
//              of crates, weapons racks, a swinging lantern, the NO QUESTIONS sign, and a secret
//              back door (a crate stack on hinges) to his stash nook
//   outpost    the Deep Outpost: brick-lined walls with an iron band, flagstones, a plated counter,
//              heavy supply shelves, a cot, sandbags and a brazier
//
// Pure and deterministic (it runs in the chunk workers too). Plan feature:
// { kind: 'burrow', id, burrow: 'trader'|'herbalist'|'raccoon'|'outpost', x, y, z, yaw, rx, rz, h }
// (x, y, z) is the floor centre; yaw is the direction the door faces (0 = −z).
// Room space: u across (+u is on your right as you look out of the door), v toward the door (−v is
// the back wall), y up from the floor. roomToWorld/roomYaw convert; a prop's rot 0 faces the door.
import { M, VOX } from '../materials.js';
import { h3 } from '../noise.js';

const PAD = { raccoon: 3.0 }; // extra reach: Rocco's passage behind the back wall
const V = 1 / VOX;

export function burrowBB(f) {
  const r = Math.max(f.rx, f.rz) + 1.6 + (PAD[f.burrow] || 0);
  return [f.x - r, f.y - 0.6, f.z - r, f.x + r, f.y + f.h + 0.8, f.z + r];
}

/** Where the doorway is (meters, outside the door) for trails to aim at. */
export function burrowDoor(f) {
  const d = Math.max(f.rx, f.rz) + 1.0;
  return { x: f.x - Math.sin(f.yaw) * d, y: f.y, z: f.z - Math.cos(f.yaw) * d };
}

/** Room space (u, v) → world x, z (meters). */
export function roomToWorld(f, u, v) {
  const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
  return { x: f.x + u * cy - v * sy, z: f.z - u * sy - v * cy };
}
/** World x, z → room space { u, v }. */
export function worldToRoom(f, x, z) {
  const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw), xm = x - f.x, zm = z - f.z;
  return { u: xm * cy - zm * sy, v: -(xm * sy + zm * cy) };
}
/** The world rotation.y of something standing in the room turned by rot (0 = facing the door). */
export const roomYaw = (f, rot = 0) => f.yaw + Math.PI + rot;
/** The ceiling height above room point (u, v). */
export function ceilingAt(f, u, v) { return domeY(f, (u / f.rx) ** 2 + (v / f.rz) ** 2); }
const domeY = (f, e) => f.h * Math.sqrt(Math.max(0, 1 - e * 0.85));
/** Angle round the room: 0 at the back wall (−v), +π/2 at the +u wall, ±π at the door. */
const angleOf = (u, v) => Math.atan2(u, -v);
/** Room point at angle a, d meters in from the wall at height y (follows the dome as it curves in). */
export function wallPoint(f, a, d, y = 0) {
  const du = Math.sin(a), dv = -Math.cos(a);
  const R = 1 / Math.sqrt((du / f.rx) ** 2 + (dv / f.rz) ** 2);
  const em = Math.min(1, (1 - (Math.min(y, f.h * 0.98) / f.h) ** 2) / 0.85);
  const r = R * Math.sqrt(em) - d;
  return { u: du * r, v: dv * r };
}

// ---------------------------------------------------------------- layouts
const cache = new WeakMap();
/**
 * The dressing of a burrow (cached per feature): voxel pieces, carved passages, the props list,
 * where the keeper stands, its lights, and the special spots (the secret door and the stash).
 */
export function burrowLayout(f) {
  let L = cache.get(f);
  if (L) return L;
  L = { pieces: [], carve: [], props: [], lights: [], npc: { u: 0, v: -1.2, rot: 0 }, spots: {}, kind: f.burrow };
  const K = BUILD[f.burrow] || BUILD.trader;
  K(f, makeKit(f, L));
  for (const p of L.pieces) bounds(p);
  for (const p of L.carve) bounds(p);
  cache.set(f, L);
  return L;
}

function bounds(p) {
  if (p.k === 'box') { p.bu0 = p.u0; p.bu1 = p.u1; p.bv0 = p.v0; p.bv1 = p.v1; }
  else if (p.k === 'ell' || p.k === 'cyl') { p.bu0 = p.u - p.ru; p.bu1 = p.u + p.ru; p.bv0 = p.v - p.rv; p.bv1 = p.v + p.rv; }
  else { p.bu0 = -99; p.bu1 = 99; p.bv0 = -99; p.bv1 = 99; }
}

/** Pattern helpers for piece materials (local voxel coords i, j, k and sizes). */
const crateMat = (lu, lv, ly, p) => {
  const nu = Math.round((p.u1 - p.u0) * VOX), nv = Math.round((p.v1 - p.v0) * VOX), nk = Math.round((p.y1 - p.y0) * VOX);
  const i = Math.floor(lu * VOX), j = Math.floor(lv * VOX), k = Math.floor(ly * VOX);
  const eu = i <= 0 || i >= nu - 1, ev = j <= 0 || j >= nv - 1, ek = k <= 0 || k >= nk - 1;
  if (eu + ev + ek >= 2) return M.STAINED;
  // a diagonal brace across each side
  if (eu && Math.abs(j - (k * (nv - 1)) / Math.max(1, nk - 1)) < 0.9) return M.STAINED;
  if (ev && Math.abs(i - (k * (nu - 1)) / Math.max(1, nk - 1)) < 0.9) return M.STAINED;
  return M.CRATEWOOD;
};

function makeKit(f, L) {
  const P = L.pieces;
  const kit = {
    f, L,
    box(u0, u1, v0, v1, y0, y1, m) { P.push({ k: 'box', u0: Math.min(u0, u1), u1: Math.max(u0, u1), v0: Math.min(v0, v1), v1: Math.max(v0, v1), y0, y1, m }); return kit; },
    /** A box that may poke out of the room (it fills rock too, e.g. beams into the walls). */
    solid(u0, u1, v0, v1, y0, y1, m) { P.push({ k: 'box', u0: Math.min(u0, u1), u1: Math.max(u0, u1), v0: Math.min(v0, v1), v1: Math.max(v0, v1), y0, y1, m, out: true }); return kit; },
    ell(u, v, y, ru, rv, ry, m) { P.push({ k: 'ell', u, v, y, ru, rv, ry, m }); return kit; },
    cyl(u, v, r, y0, y1, m) { P.push({ k: 'cyl', u, v, ru: r, rv: r, y0, y1, m }); return kit; },
    /** Along the wall between angles a0..a1, d0..d1 meters in from it, heights y0..y1. */
    wall(a0, a1, d0, d1, y0, y1, m) { P.push({ k: 'wall', a0, a1, d0, d1, y0, y1, m }); return kit; },
    crate(u, v, y, w, d = w, hgt = w) { return kit.box(u - w / 2, u + w / 2, v - d / 2, v + d / 2, y, y + hgt, crateMat); },
    /** o.v is the model variant (stored as `variant`; v is the room coordinate). */
    prop(type, u, v, y = 0, rot = 0, o = {}) { const { v: variant = 0, ...rest } = o; L.props.push({ type, u, v, y, rot, variant, ...rest }); return kit; },
    /** A prop leaning on the wall at angle a, d in from it (facing into the room). */
    wallProp(type, a, d, y = 0, o = {}) { const p = wallPoint(f, a, d, y); const { v: variant = 0, ...rest } = o; L.props.push({ type, u: p.u, v: p.v, y, rot: a, wall: true, variant, ...rest }); return p; },
    light(u, v, y, c, r, o = {}) { L.lights.push({ u, v, y, c, r, ...o }); return kit; },
    /** Shelves along the wall: boards at ys, uprights at the ends (and every `bay` radians). */
    shelves(a0, a1, depth, ys, top, o = {}) {
      const board = o.board || M.FLOORBOARD, frame = o.frame || M.STAINED, bay = o.bay || 0.55;
      const T = 1.05 * V;
      kit.wall(a0, a1, 0, depth, 0, 0.125, frame); // plinth
      for (const y of ys) kit.wall(a0, a1, 0, depth, y, y + T, board);
      const n = Math.max(1, Math.round((a1 - a0) / bay));
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n, w = T / 2.4;
        kit.wall(a - w, a + w, 0, depth, 0, top, frame);
      }
      return kit;
    },
    /** Goods on a shelf board: props spaced along it, picked from `types` by a hash. */
    goods(a0, a1, d, y, types, seed, gap = 0.27) {
      const R = 1 / Math.sqrt((Math.sin((a0 + a1) / 2) / f.rx) ** 2 + (Math.cos((a0 + a1) / 2) / f.rz) ** 2);
      const n = Math.max(1, Math.floor(((a1 - a0) * R) / gap));
      for (let i = 0; i < n; i++) {
        const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
        const hh = h3(i, Math.round(y * 16), seed, 991);
        if (hh < 0.12) continue; // a gap here and there
        const t = types[Math.floor(h3(i, seed, Math.round(y * 16), 993) * types.length)];
        kit.wallProp(t, a, d, y, { v: Math.floor(hh * 7) });
      }
      return kit;
    },
  };
  return kit;
}

// a door frame's posts and lintel are added by the stamp; these are the rooms
const BUILD = {
  trader(f, k) {
    const { rx, rz } = f;
    const L = k.L;
    // the long counter: panelled front, a lighter top with a lip, a flap to walk round at +u
    k.box(-1.75, 1.05, -0.88, -0.46, 0, 0.5, (lu) => ((Math.floor(lu * VOX) % 7) === 0 ? M.FLOORBOARD : M.STAINED));
    k.box(-1.81, 1.11, -0.94, -0.4, 0.5, 0.5625, M.FLOORBOARD);
    k.box(-1.81, 1.11, -0.42, -0.4, 0.06, 0.12, M.FLOORBOARD); // kick rail
    // shelves along the back wall behind the keeper, a low unit on the +u wall
    k.shelves(-0.66, 0.66, 0.34, [0.44, 0.88, 1.32], 1.5);
    k.shelves(1.2, 1.78, 0.3, [0.42, 0.84], 1.0, { bay: 0.6 });
    // a display table on the +u side
    for (const [u, v] of [[1.72, -0.12], [2.32, -0.12], [1.72, 0.62], [2.32, 0.62]]) k.box(u, u + V, v, v + V, 0, 0.4, M.STAINED);
    k.box(1.68, 2.4, -0.16, 0.68, 0.4, 0.4625, M.FLOORBOARD);
    // stacked crates by the door on the −u side, sacks against them
    k.crate(-2.36, 0.72, 0, 0.56);
    k.crate(-1.98, 1.36, 0, 0.5);
    k.crate(-2.3, 0.78, 0.56, 0.44);
    k.crate(-1.72, 0.66, 0, 0.38);
    // props: the lamp, the goods, the counter, the walls
    k.prop('hanglamp', 0, -0.1, 'ceil');
    k.light(0, -0.1, f.h - 0.75, [1.08, 0.74, 0.4], 6.5, { lantern: true });
    const goods = ['jar', 'tin', 'sack', 'bottles', 'candles', 'lamp', 'jar', 'tin', 'pickhead', 'rope', 'oreb'];
    k.goods(-0.62, 0.62, 0.17, 0.5, ['sack', 'oreb', 'tin', 'rope', 'sack'], 1);
    k.goods(-0.62, 0.62, 0.17, 0.94, goods, 2);
    k.goods(-0.6, 0.6, 0.17, 1.38, ['jar', 'bottles', 'candles', 'lamp', 'jar'], 3);
    k.goods(1.24, 1.74, 0.15, 0.48, ['tin', 'jar', 'bottles', 'pickhead'], 4);
    k.goods(1.24, 1.74, 0.15, 0.9, ['candles', 'jar', 'tin', 'lamp'], 5);
    k.prop('scale', 0.62, -0.68, 0.5625, 0.1, { anim: 'scale' });
    k.prop('ledger', -0.95, -0.66, 0.5625, -0.2);
    k.prop('bell', -1.5, -0.62, 0.5625, 0);
    k.prop('coins', 0.18, -0.6, 0.5625, 0.4);
    k.prop('oreb', 1.85, 0.1, 0.4625, 0.3, { v: 1 });
    k.prop('gembox', 2.12, 0.42, 0.4625, -0.4);
    k.prop('oreb', 2.2, 0.06, 0.4625, 0.1, { v: 2 });
    k.prop('rug', -0.3, 0.32, 0, 0, { v: 0 });
    k.prop('barrel', 2.38, 1.3, 0, 0.3);
    k.prop('barrel', 1.9, 1.75, 0, 1.1, { v: 1 });
    k.prop('sacks', -1.62, 1.12, 0, 0.6);
    k.wallProp('chalkboard', -1.18, 0.02, 0.62, { v: 0 });
    k.wallProp('pickrack', -1.62, 0.02, 0.5);
    k.prop('lanternpost', -0.7, -0.62, 0.5625, 0);
    L.npc = { u: -0.38, v: -1.42, rot: 0 };
    L.spots.counter = { u: -0.38, v: -0.66 };
    L.sign = { text: 'TRADING POST', icon: 'scale' };
    L.dressing = { lining: 'plaster', floor: M.FLOORBOARD, beams: true, smooth: true };
    k.ceilBeams = true;
    void rx; void rz;
  },

  herbalist(f, k) {
    const L = k.L;
    // the hearth: a flagstone ring with the cauldron, a brick hood over it into the ceiling
    const hu = -1.42, hv = -0.32;
    k.cyl(hu, hv, 0.56, 0, 0.125, M.FLAGSTONE);
    k.cyl(hu, hv, 0.36, 0.0625, 0.125, M.COMPOST); // the ash pit
    for (let y = 1.42; y < f.h; y += V) {
      const t = (y - 1.42) / 0.9, r = Math.max(0.2, 0.52 - t * 0.34);
      L.pieces.push({ k: 'cyl', u: hu, v: hv, ru: r, rv: r, y0: y, y1: y + V, m: M.BRICK, out: true, hollow: Math.max(0, r - 0.08) });
    }
    // raised mushroom beds along the +u wall: plank rims, dark compost
    k.wall(0.98, 2.12, 0, 0.56, 0, 0.3125, (lu, lv, ly, p, d, a) => (d > 0.48 || ly > 0.25 || Math.abs(a - 1.55) < 0.025 ? M.FLOORBOARD : M.COMPOST));
    k.wall(0.98, 2.12, 0, 0.56, 0.25, 0.3125, (lu, lv, ly, p, d, a) => (d > 0.48 || Math.abs(a - 1.55) < 0.025 || a < 1.0 || a > 2.1 ? M.FLOORBOARD : 0));
    // the work table at the back, jar shelves behind it
    for (const [u, v] of [[-0.5, -1.46], [0.96, -1.46], [-0.5, -1.06], [0.96, -1.06]]) k.box(u, u + V, v, v + V, 0, 0.46, M.STAINED);
    k.box(-0.56, 1.02, -1.52, -1.0, 0.46, 0.525, M.STAINED);
    k.box(-0.5, 1.0, -1.48, -1.04, 0.12, 0.17, M.FLOORBOARD); // a low shelf
    k.shelves(-0.6, 0.6, 0.3, [0.52, 0.96, 1.36], 1.48, { board: M.STAINED, frame: M.STAINED });
    // a drawer cabinet of seeds on the −u wall by the door
    k.wall(-2.2, -1.75, 0, 0.36, 0, 0.78, (lu, lv, ly, p, d, a) => {
      const row = Math.floor(ly * VOX), col = Math.floor(a * 40);
      if (row % 4 === 0 || col % 5 === 0) return M.STAINED;
      return d > 0.3 && row % 4 === 2 && col % 5 === 2 ? M.PLASTER : M.FLOORBOARD;
    });
    // the drying beam across the ceiling (ends bedded in the walls)
    k.solid(-3.2, 3.2, 0.42, 0.42 + 2 * V, f.h * 0.72, f.h * 0.72 + 2 * V, M.TIMBER);
    k.solid(0.94, 0.94 + 2 * V, -3, 3, f.h * 0.72 + 2 * V, f.h * 0.72 + 4 * V, M.TIMBER);
    // props
    k.prop('cauldron', hu, hv, 0.125, 0.3, { anim: 'cauldron' });
    k.light(hu, hv, 0.5, [0.9, 0.46, 0.18], 4.0, { fire: true });
    k.prop('hanglamp', 0.5, 0.2, 'ceil', 0, { v: 1 });
    k.light(0.5, 0.2, f.h - 0.75, [1.0, 0.8, 0.5], 5.4, { lantern: true });
    k.light(2.3, -0.2, 0.55, [0.26, 0.5, 0.92], 3.2, { glow: true });
    for (let i = 0; i < 9; i++) {
      const u = -2.15 + i * 0.52 + (h3(i, 3, 5, 77) - 0.5) * 0.12;
      if (Math.abs(u - hu) < 0.4) continue;
      k.prop('herbs', u, 0.46, f.h * 0.72, 0, { hang: true, v: i % 4 });
    }
    for (let i = 0; i < 5; i++) if (i !== 3) k.prop('herbs', 0.94 + V, -1.62 + i * 0.52, f.h * 0.72 + 2 * V, Math.PI / 2, { hang: true, v: (i + 2) % 4 });
    // the beds: glowcaps and fat brown mushrooms
    for (let i = 0; i < 7; i++) {
      const a = 1.08 + i * 0.16, p = wallPoint(f, a, 0.27, 0.25);
      k.prop(i % 3 === 1 ? 'mushbed' : 'glowbed', p.u, p.v, 0.25, a, { v: i % 4 });
    }
    k.goods(-0.56, 0.56, 0.15, 0.58, ['jar', 'jar', 'potion', 'jar', 'herbjar'], 11, 0.22);
    k.goods(-0.56, 0.56, 0.15, 1.02, ['potion', 'herbjar', 'jar', 'potion'], 12, 0.22);
    k.goods(-0.5, 0.5, 0.15, 1.42, ['jar', 'skull', 'jar', 'candles'], 13, 0.24);
    k.prop('mortar', -0.1, -1.26, 0.525, 0.2);
    k.prop('herbpile', 0.42, -1.3, 0.525, -0.3);
    k.prop('book', 0.78, -1.2, 0.525, 0.5);
    k.prop('potion', -0.4, -1.16, 0.525, 0.2, { v: 3 });
    k.prop('basket', 1.4, 1.2, 0, 0.4);
    k.prop('pot', -1.2, 1.55, 0, 0, { v: 0 });
    k.prop('pot', -0.75, 1.82, 0, 0, { v: 1 });
    k.prop('pot', 1.05, 1.75, 0, 0, { v: 2 });
    k.prop('rug', 0.2, 0.45, 0, 0.1, { v: 1 });
    k.prop('stool', -0.85, -0.2, 0, 0.4);
    k.prop('logs', -2.3, 0.75, 0, 0.9);
    L.npc = { u: 0.22, v: -1.78, rot: 0 };
    L.spots.counter = { u: 0.22, v: -1.24 };
    L.sign = { text: 'HERBALIST', icon: 'leaf' };
    L.dressing = { lining: 'earth', floor: M.FLOORBOARD, beams: false, smooth: false };
  },

  raccoon(f, k) {
    const L = k.L, { rx, rz } = f;
    // the counter: three crates and a plank laid over them
    k.crate(-0.6, -1.02, 0, 0.56, 0.5, 0.56);
    k.crate(0.02, -1.0, 0, 0.6, 0.5, 0.56);
    k.crate(0.64, -1.03, 0, 0.56, 0.48, 0.56);
    k.box(-0.94, 0.98, -1.32, -0.7, 0.5625, 0.625, M.STAINED);
    // crate stacks round the walls, every one a little askew
    const stack = [
      [2.55, -0.95, 0, 0.6], [2.62, -0.25, 0, 0.56], [2.5, -0.6, 0.6, 0.5], [2.75, 0.45, 0, 0.5], [2.6, 0.42, 0.5, 0.42],
      [1.85, -1.85, 0, 0.56], [1.3, -2.25, 0, 0.5], [1.82, -1.85, 0.56, 0.46],
      [-1.95, 1.72, 0, 0.5], [-2.45, 1.2, 0, 0.56], [-2.4, 1.18, 0.56, 0.44],
      [2.15, 1.55, 0, 0.46], [-1.62, -2.0, 0, 0.5],
    ];
    for (const [u, v, y, s] of stack) k.crate(u, v, y, s, s * (0.9 + h3(Math.round(u * 9), Math.round(v * 9), 3, 5) * 0.2), s);
    // the tarp-covered hoard on the −u side: crates under an oilcloth heap
    k.crate(-2.45, -0.3, 0, 0.56);
    k.crate(-2.3, 0.35, 0, 0.5);
    k.crate(-2.4, 0.0, 0.5, 0.5);
    L.pieces.push({ k: 'ell', u: -2.35, v: 0.02, y: 0, ru: 0.82, rv: 0.92, ry: 1.12, m: M.TARP, tarp: true });
    // a second smaller heap at the back by the passage
    k.crate(-0.95, -2.4, 0, 0.5);
    L.pieces.push({ k: 'ell', u: -0.95, v: -2.32, y: 0, ru: 0.55, rv: 0.45, ry: 0.78, m: M.TARP, tarp: true });
    // the secret back door: a crate stack on hinges in the back wall at the +u side of the counter
    const sa = 0.5, sd = { du: Math.sin(sa), dv: -Math.cos(sa) };
    const R0 = 1 / Math.sqrt((sd.du / rx) ** 2 + (sd.dv / rz) ** 2);
    L.secret = { a: sa, du: sd.du, dv: sd.dv, r0: R0 - 0.12, r1: R0 + 0.18, w: 0.46, h: 1.3, len: 2.3, nook: 0.95 };
    const S = L.secret;
    S.door = { u: sd.du * (R0 - 0.1), v: sd.dv * (R0 - 0.1) };
    S.nookAt = { u: sd.du * (R0 + S.len), v: sd.dv * (R0 + S.len) };
    L.carve.push({ k: 'tunnel', ...S });
    // props
    k.prop('swinglamp', 0.1, 0.25, 'ceil', 0, { anim: 'swing' });
    k.light(0.1, 0.25, f.h - 1.0, [1.1, 0.72, 0.36], 5.8, { lantern: true, swing: true });
    k.prop('candle', 0.72, -0.98, 0.625, 0);
    k.light(0.72, -0.98, 0.78, [1.0, 0.62, 0.3], 2.4, { lantern: true });
    k.prop('noquestions', 0.02, -0.68, 1.78, 0, { hang: true });
    k.wallProp('weaponrack', 1.32, 0.02, 0.12, { v: 0 });
    k.wallProp('weaponrack', -1.98, 0.02, 0.12, { v: 1 });
    k.prop('weaponbarrel', 2.1, 0.78, 0, 0.6);
    k.prop('wheel', 2.62, 1.0, 0, -1.2);
    k.prop('gramophone', 2.55, -0.25, 0.56, -1.4);
    k.prop('painting', -1.7, 0.42, 0, 1.3);
    k.prop('mannequin', -1.72, -1.45, 0, 0.6);
    k.prop('chest', 1.25, -2.25, 0.5, 0.4, { v: 0 });
    k.prop('sacks', 2.0, -1.2, 0, -0.8);
    k.prop('coins', -0.45, -1.0, 0.625, 0.3, { v: 1 });
    k.prop('ledger', 0.25, -1.08, 0.625, -0.25, { v: 1 });
    k.prop('jewels', -0.75, -1.12, 0.625, 0.5);
    k.prop('coatrack', 2.35, -1.6, 0, 0.3);
    k.wallProp('fish', -0.34, 0.02, 1.2);
    k.prop('lostfound', -1.25, 1.6, 0, 0.4);
    k.prop('rug', 0.0, 0.25, 0, -0.25, { v: 2 });
    k.prop('cratedoor', S.door.u, S.door.v, 0, sa, { anim: 'secret' });
    // the stash nook behind it
    k.prop('stashchest', S.nookAt.u + sd.du * 0.35, S.nookAt.v + sd.dv * 0.35, 0, sa, { stash: true });
    k.prop('lantern', S.nookAt.u - sd.dv * 0.6, S.nookAt.v + sd.du * 0.6, 0.85, sa + Math.PI / 2);
    k.light(S.nookAt.u, S.nookAt.v, 0.9, [1.0, 0.66, 0.32], 2.6, { lantern: true, nook: true });
    k.prop('stuckpick', S.nookAt.u + sd.du * 0.62, S.nookAt.v + sd.dv * 0.62, 0.55, sa);
    L.npc = { u: 0.02, v: -1.72, rot: 0 };
    L.spots.counter = { u: 0.02, v: -1.0 };
    L.sign = { text: 'STORAGE', icon: 'key', sub: 'NO QUESTIONS' };
    L.dressing = { lining: 'rough', floor: M.FLOORBOARD, beams: false, smooth: false, worn: true };
  },

  outpost(f, k) {
    const L = k.L;
    // the plated counter
    k.box(-1.62, 0.55, -0.98, -0.56, 0, 0.56, (lu, lv, ly) => (ly < 0.0625 || Math.floor(lu * VOX) % 9 === 0 ? M.STAINED : M.IRONPLATE));
    k.box(-1.68, 0.61, -1.04, -0.5, 0.56, 0.625, M.STAINED);
    // heavy supply shelves on the +u wall
    k.shelves(0.92, 2.02, 0.4, [0.44, 0.88, 1.28], 1.42, { board: M.STAINED, frame: M.TIMBER, bay: 0.4 });
    // a cot on the −u wall
    k.wall(-2.12, -1.4, 0.02, 0.62, 0, 0.3, (lu, lv, ly, p, d, a) => (ly < 0.2 && d > 0.07 && d < 0.57 && a > -2.08 && a < -1.44 ? 0 : M.STAINED));
    // a map table near the back left
    for (const [u, v] of [[-2.0, -1.0], [-1.98, -0.55]]) k.box(u, u + 2 * V, v, v + 2 * V, 0, 0.5, M.TIMBER);
    // props
    k.prop('hanglamp', 0, 0, 'ceil', 0, { v: 2 });
    k.light(0, 0, f.h - 0.75, [1.0, 0.78, 0.5], 6.2, { lantern: true });
    k.prop('brazier', -1.5, 0.95, 0, 0, { anim: 'fire' });
    k.light(-1.5, 0.95, 0.75, [0.95, 0.45, 0.18], 4.2, { fire: true });
    k.prop('sandbags', -1.0, 2.15, 0, 0.15);
    k.prop('sandbags', 1.0, 2.15, 0, -0.15, { v: 1 });
    k.goods(0.96, 1.98, 0.2, 0.0, ['dyncrate', 'barrel', 'rope'], 21, 0.4);
    k.goods(0.96, 1.98, 0.2, 0.5, ['dyncrate', 'rope', 'tin', 'oilcan', 'stakes'], 22, 0.3);
    k.goods(0.96, 1.98, 0.2, 0.94, ['tin', 'lamp', 'rope', 'oilcan', 'tin'], 23, 0.28);
    k.goods(0.98, 1.96, 0.2, 1.34, ['stakes', 'tin', 'helmet', 'tin'], 24, 0.3);
    k.prop('blanket', ...uvOf(wallPoint(f, -1.76, 0.32, 0.3)), 0.2, -1.76, {});
    k.prop('maptable', -1.98, -0.78, 0.5, 0.4);
    k.wallProp('banner', 0, 0.03, 1.25);
    k.prop('ledger', -1.1, -0.74, 0.625, 0.2, { v: 2 });
    k.prop('dynamite', 0.15, -0.72, 0.625, -0.4);
    k.prop('lanternpost', -1.45, -0.72, 0.625, 0);
    k.wallProp('pickrack', -0.78, 0.03, 0.5);
    k.prop('stove', 0.9, -1.85, 0, -0.5);
    L.npc = { u: -0.55, v: -1.42, rot: 0 };
    L.spots.counter = { u: -0.55, v: -0.76 };
    L.sign = { text: 'DEEP OUTPOST', icon: 'pick' };
    L.dressing = { lining: 'brick', floor: M.FLAGSTONE, beams: true, smooth: false, iron: true };
    k.ceilBeams = true;
  },
};
const uvOf = (p) => [p.u, p.v];

// ---------------------------------------------------------------- the stamp
const LINING = {
  plaster: (ym) => (ym < 0.98 ? M.STAINED : ym < 1.04 ? M.FLOORBOARD : M.PLASTER),
  brick: (ym) => (ym < 1.22 ? M.BRICK : ym < 1.34 ? M.IRONPLATE : 0),
  earth: () => 0,
  rough: () => 0,
};

export function stampBurrow(f, vox, X0, Y0, Z0, CS) {
  const bb = f.bb || burrowBB(f);
  const lx0 = Math.max(0, Math.floor(bb[0] * VOX) - X0), lx1 = Math.min(CS, Math.ceil(bb[3] * VOX) - X0);
  const ly0 = Math.max(0, Math.floor(bb[1] * VOX) - Y0), ly1 = Math.min(CS, Math.ceil(bb[4] * VOX) - Y0);
  const lz0 = Math.max(0, Math.floor(bb[2] * VOX) - Z0), lz1 = Math.min(CS, Math.ceil(bb[5] * VOX) - Z0);
  if (lx0 >= lx1 || ly0 >= ly1 || lz0 >= lz1) return;
  const Ly = burrowLayout(f);
  const D = Ly.dressing || {};
  const lining = LINING[D.lining] || LINING.earth;
  const floorM = D.floor || M.FLOORBOARD;
  const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
  const { rx, rz, h } = f;
  const rmin = Math.min(rx, rz);
  const SHELL = 0.16;
  const E2 = (1 + SHELL / rmin) ** 2;
  // only the pieces this chunk can touch
  const cu = [], cv = [];
  const chx0 = (X0 + lx0) / VOX, chx1 = (X0 + lx1) / VOX, chz0 = (Z0 + lz0) / VOX, chz1 = (Z0 + lz1) / VOX;
  for (const [x, z] of [[chx0, chz0], [chx1, chz0], [chx0, chz1], [chx1, chz1]]) {
    const xm = x - f.x, zm = z - f.z;
    cu.push(xm * cy - zm * sy); cv.push(-(xm * sy + zm * cy));
  }
  const ru0 = Math.min(...cu), ru1 = Math.max(...cu), rv0 = Math.min(...cv), rv1 = Math.max(...cv);
  const pieces = Ly.pieces.filter((p) => !(p.bu1 < ru0 || p.bu0 > ru1 || p.bv1 < rv0 || p.bv0 > rv1));
  const sec = Ly.secret;
  const doorW = 0.7, doorH = 1.52, rough = !D.smooth;
  for (let z = lz0; z < lz1; z++) for (let y = ly0; y < ly1; y++) for (let x = lx0; x < lx1; x++) {
    const vx = X0 + x, vy = Y0 + y, vz = Z0 + z;
    const xm = (vx + 0.5) / VOX - f.x, ym = (vy + 0.5) / VOX - f.y, zm = (vz + 0.5) / VOX - f.z;
    const u = xm * cy - zm * sy, v = -(xm * sy + zm * cy);
    const vi = x + CS * (y + CS * z);
    const cur = vox[vi];
    if (cur === M.BEDROCK) continue;
    const e = (u / rx) ** 2 + (v / rz) ** 2;
    const bump = rough ? (h3(vx >> 1, vy >> 1, vz >> 1, 61) - 0.5) * 0.08 : 0;
    const top = domeY(f, e) + bump;
    let m = -1; // -1: leave as it is
    if (e < 1 && ym >= 0 && ym < top) {
      m = 0;
      // posts at the four quarters and a ring beam above them
      if (Math.abs(Math.abs(u) - rx * 0.62) < 0.1 && Math.abs(Math.abs(v) - rz * 0.62) < 0.1) m = M.TIMBER;
      else if (top - ym < 0.13 && Math.abs(e - 0.62 * 0.62 * 2) < 0.045) m = M.TIMBER;
      // built rooms: two beams across the ceiling
      else if (D.beams && top - ym < 0.16 && (Math.abs(u) < 0.07 || Math.abs(v) < 0.07)) m = M.TIMBER;
      for (const p of pieces) {
        const pm = pieceAt(p, f, u, v, ym, e);
        if (pm !== -1) m = pm;
      }
    } else if (e < 1.06 && ym < 0 && ym >= -V) {
      m = (D.worn && h3(vx >> 2, 3, vz >> 3, 87) < 0.18) ? M.STAINED : floorM; // the floor
    } else if (e < 1.0 && ym < -V && ym > -0.3 && !cur) {
      m = M.DIRT; // fill under the floor where a cave ran below
    } else if (e < E2 && ym >= -V && ym < top + SHELL && cur && cur !== M.TIMBER && cur !== M.LADDER && cur !== M.LANTERN) {
      // the walls: lined (plank wainscot and limewash, brick) or left as dug earth
      const lm = lining(ym);
      if (lm) m = lm;
      // beams bedded into the wall pass through the lining
      for (const p of pieces) if (p.out) { const pm = pieceAt(p, f, u, v, ym, e); if (pm !== -1) m = pm; }
    } else {
      for (const p of pieces) if (p.out) { const pm = pieceAt(p, f, u, v, ym, e); if (pm !== -1) m = pm; }
    }
    // the doorway through the wall, framed in timber (iron at the outpost)
    if (v > rz - 0.5 && v < rz + 1.0 && Math.abs(u) < doorW + 0.14 && ym >= -V && ym < doorH + 0.14) {
      const au = Math.abs(u);
      const inWall = Math.abs(v - rz * Math.sqrt(Math.max(0, 1 - (u / rx) ** 2)) - 0.02) < 0.12;
      if (au < doorW && ym >= 0 && ym < doorH) m = 0;
      else if (ym < 0) m = m === -1 ? floorM : m; // threshold
      else if (inWall && (au >= doorW || ym >= doorH)) m = D.iron ? (au >= doorW + 0.06 || ym >= doorH + 0.06 ? M.IRONPLATE : M.TIMBER) : M.TIMBER;
      if (au < doorW && ym >= -V && ym < 0 && v < rz + 0.4) m = M.STAINED; // a worn sill
    }
    // a porch outside the door: room for the sign hanging over it and a lamp
    if (v > rz + 0.12 && v < rz + 1.0 && Math.abs(u) < 1.05 && ym >= 0 && ym < 2.15 && !(Math.abs(u) < doorW && ym < doorH)) {
      const au = Math.abs(u), top = 2.15 - Math.max(0, au - 0.6) * 0.9;
      if (ym < top) m = (au > 0.92 && ym < 1.9 && Math.abs(v - rz - 0.55) < 0.07) ? M.TIMBER : 0;
      else if (ym < top + 0.07 && Math.abs(v - rz - 0.55) < 0.07) m = M.TIMBER;
    }
    if (v > rz + 0.12 && v < rz + 1.0 && Math.abs(u) < 1.05 && ym >= -V && ym < 0) m = m === -1 ? (D.floor === M.FLAGSTONE ? M.FLAGSTONE : M.STAINED) : m;
    // Rocco's passage: a crate-stack door in the back wall, a short tunnel, the stash nook
    if (sec) {
      const along = u * sec.du + v * sec.dv, side = u * -sec.dv + v * sec.du;
      const nookD = Math.hypot(u - sec.nookAt.u, v - sec.nookAt.v);
      if (along > sec.r0 - 0.4 && Math.abs(side) < sec.w + 0.2 && along < sec.r0 + sec.len + 0.2 && ym > -V - 0.01 && ym < sec.h + 0.1) {
        const inside = Math.abs(side) < sec.w && ym >= 0 && ym < sec.h - Math.max(0, Math.abs(side) - sec.w + 0.25) * 1.2;
        if (inside && along > sec.r0) {
          // the plug: crate wood (it swings open, see Traders.js), then the tunnel
          if (along < sec.r1) m = crateDoorMat(side + sec.w, ym, along - sec.r0);
          else m = (Math.abs(Math.abs(side) - sec.w + 0.06) < 0.05 && ym < sec.h - 0.3 && ((along * 10) | 0) % 9 === 0) ? M.TIMBER : 0;
        } else if (ym < 0 && along > sec.r1) m = M.FLOORBOARD;
      }
      if (nookD < sec.nook + 0.2 && ym > -V - 0.01 && ym < 1.5) {
        const r = nookD / sec.nook;
        const nTop = 1.35 * Math.sqrt(Math.max(0, 1 - r * r * 0.7)) + (h3(vx >> 1, vy >> 1, vz >> 1, 63) - 0.5) * 0.06;
        if (r < 1 && ym >= 0 && ym < nTop) m = 0;
        else if (r < 1.05 && ym < 0) m = M.FLOORBOARD;
      }
    }
    if (m !== -1) vox[vi] = m;
  }
}

/** The secret door's look: a stack of three crates (s across, y up, t through the wall). */
function crateDoorMat(s, y, t) {
  const i = Math.floor(s * VOX), k = Math.floor(y * VOX);
  void t;
  // three crates stacked: 0..0.5, 0.5..0.95, 0.95..1.3 high
  const rows = [[0, 8], [8, 15], [15, 21]];
  for (const [a, b] of rows) {
    if (k < a || k >= b) continue;
    const top = k === b - 1 || k === a, side = i <= 0 || i >= 14 || i === 7;
    if (top || side) return M.STAINED;
    if (Math.abs(((k - a) * 7) / Math.max(1, b - a - 1) - (i % 7)) < 0.8) return M.STAINED;
    return M.CRATEWOOD;
  }
  return M.CRATEWOOD;
}

/** Material of piece p at room point (u, v, ym) or -1 (not in it). */
function pieceAt(p, f, u, v, ym, e) {
  if (u < p.bu0 || u > p.bu1 || v < p.bv0 || v > p.bv1) return -1;
  if (p.k === 'box') {
    if (ym < p.y0 || ym >= p.y1 || u < p.u0 || u >= p.u1 || v < p.v0 || v >= p.v1) return -1;
    return typeof p.m === 'function' ? p.m(u - p.u0, v - p.v0, ym - p.y0, p) : p.m;
  }
  if (p.k === 'cyl') {
    if (ym < p.y0 || ym >= p.y1) return -1;
    const d = Math.hypot(u - p.u, v - p.v);
    if (d > p.ru || (p.hollow && d < p.hollow)) return -1;
    return typeof p.m === 'function' ? p.m(u - p.u, v - p.v, ym - p.y0, p) : p.m;
  }
  if (p.k === 'ell') {
    const du = (u - p.u) / p.ru, dv = (v - p.v) / p.rv, dy = (ym - p.y) / p.ry;
    let r = du * du + dv * dv + dy * dy;
    if (p.tarp) {
      // a draped heap: lumpy, sagging between the crates, folds round the hem
      const ang = Math.atan2(dv, du);
      r += Math.sin(ang * 5 + ym * 7) * 0.05 + (h3(Math.floor(u * 8), Math.floor(ym * 8), Math.floor(v * 8), 31) - 0.5) * 0.06;
      if (ym < 0.05) return -1;
      if (r > 1) return -1;
      if (r < 0.62) return -1; // hollow: whatever's under it stays
      return dy < 0.14 && h3(Math.floor(u * 12), 1, Math.floor(v * 12), 33) < 0.3 ? M.STAINED : M.TARP; // rope ties round the hem
    }
    if (r > 1) return -1;
    return typeof p.m === 'function' ? p.m(du, dv, dy, p) : p.m;
  }
  if (p.k === 'wall') {
    if (ym < p.y0 || ym >= p.y1) return -1;
    const a = angleOf(u, v);
    if (a < p.a0 || a > p.a1) return -1;
    // distance in from the wall at this height (the dome curves in as it rises)
    const s = Math.sqrt(e);
    if (s < 1e-4) return -1;
    const em = Math.min(1, (1 - (Math.min(ym, f.h * 0.98) / f.h) ** 2) / 0.85);
    const r = Math.hypot(u, v), R = (r / s) * Math.sqrt(em);
    const d = R - r;
    if (d < p.d0 - 0.08 || d >= p.d1) return -1;
    return typeof p.m === 'function' ? p.m(0, 0, ym - p.y0, p, d, a) : p.m;
  }
  return -1;
}

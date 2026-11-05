// The dungeons, natural (wave 5): nobody built these. They are grottos and dens hidden in the rock
// (plan.ruins with a sealed treasure grotto behind a wall of crystal, plan.rooms the plain lairs):
// rough rock walls that bulge and recede, domed roofs, flat silt floors, flowstone columns,
// breakdown heaps. Caves that run into one break through its walls (that's how you find one); a
// short natural crawl always joins its front to the nearest cave.
//
//   cell      Creature Den: a lair round a brood nest (the spawner: break it with your pick), two
//             lost miners' chests, cobwebs in the corners. Most have a treasure grotto sealed behind
//             a wall of crystal: a loose rock panel hides a crystal knob ('switch'), or four crystal
//             knobs in their niches ring in the order the marks over the seal show ('levers').
//             The plain ones (plan: f.plain) are just the den, the nest and the chests.
//   vault     Collapsed Grotto: a tall domed cavern on four flowstone columns, one side fallen in
//             under a broken chimney; the crystal seal and three pressure stones in the floor that
//             must all be weighed down at once ('plates'). Stone guardians wake.
//   fortress  Magma Hall (the Magma Deep and the Core): a long hall hung with flowstone draperies,
//             two side dens (nests, chests, a lava pool); a light crystal and three crystal mirrors
//             ('beams') or four crystal knobs ('levers') open its seal.
//   crypt     (no longer placed: the old flooded crypt's layout, kept for old saves' sake)
//
// Layout on the dungeon's local grid (./common.js: a forward, b right, y up from the floor; the front,
// where the crawl comes in, is at -a; the seal and the treasure grotto at +a). dungeonLayout(L)
// returns P for the puzzles and the site (door, room, chest, hoards, doorRunes, lintel, levers /
// switch / beam / plates, spawners, chests, webs, remains, spots) and the shapes dungeonVox() carves.
// Pure: runs in the chunk workers too.
import { M } from '../materials.js';
import { RM } from './mats.js';
import { h3, G, rng, pickSymbols, SYMBOLS, boxDist, glyphPix, natural, hyp } from './common.js';

const T = 8; // walls: one block
const DW = 8, DH = 14; // the sealed door: half width, height of the jambs (an arch of radius DW on top)

export const DUNGEON_NAMES = { cell: 'Creature Den', crypt: 'Flooded Grotto', vault: 'Collapsed Grotto', fortress: 'Magma Hall' };
export const DUNGEON_BLURB = {
  cell: 'cobwebs, old bones, and something stirring in a brood nest.',
  crypt: 'a stair of rock going down into black water.',
  vault: 'a tall domed cavern on flowstone columns. Part of the roof has come down.',
  fortress: 'hot air, flowstone draperies, and the glow of lava somewhere close.',
};
/** Lore carvings: which of the old ruin kinds' texts a dungeon's carvings read (src/data/lore.js). */
export const LORE_KIND = { cell: 'hall', crypt: 'well', vault: 'vault', fortress: 'shrine' };

/** What each dungeon's spawner breeds, by kind and zone. */
function spawnKinds(kind, zone, r) {
  if (kind === 'fortress') return zone >= 6 ? ['imp', 'ruin_wraith'] : ['imp'];
  if (kind === 'crypt') return zone >= 3 ? ['ruin_wraith', 'cave_slime'] : ['cave_slime'];
  if (zone <= 1) return [r() < 0.5 ? 'cave_spider' : 'cave_slime'];
  if (zone === 2) return [r.pick(['kobold', 'cave_spider', 'cave_slime'])];
  if (zone === 3) return [r.pick(['cave_spider', 'cave_slime', 'ruin_wraith'])];
  if (zone >= 5) return ['ruin_wraith', 'cave_slime'];
  return ['imp'];
}

const box = (a0, a1, y0, y1, b0, b1, o) => ({ a0, a1, y0, y1, b0, b1, ...o });
const inside = (S, a, y, b) => a >= S.a0 && a < S.a1 && y >= S.y0 && y < S.y1 && b >= S.b0 && b < S.b1;

// ------------------------------------------------------------------ layouts
export function dungeonLayout(L) {
  const kind = L.kind, r = rng(L.seed + 909);
  const P = { kind, plain: !!L.plain, spaces: [], holes: [], solids: [], keep: [], chests: [], spawners: [], webs: [], traps: [], remains: [], guards: [], skulls: [], spots: {}, looks: {} };
  P.theme = kind === 'crypt' ? 'brick' : kind === 'vault' ? 'star' : kind === 'fortress' ? 'deep' : 'cob';
  if (kind === 'crypt') crypt(L, P, r);
  else if (kind === 'vault') vault(L, P, r);
  else if (kind === 'fortress') fortress(L, P, r);
  else cell(L, P, r);
  // the crawl out to the cave (its length was found at plan time)
  const len = Math.max(8, Math.round(L.entry || 24));
  P.entry = { a: P.front, b: 0, y: 0, dir: [-1, 0], len, wob: (r() - 0.5) * 14, end: P.front - len };
  P.spots.entry = [P.front - Math.min(len - 4, 20), 0, 0];
  // the bounding box (local voxels): everything above plus the walls, the crawl and the strongroom
  let a0 = P.entry.end - 16, a1 = -1e9, y0 = 1e9, y1 = -1e9, b0 = -20, b1 = 20;
  for (const S of [...P.spaces, ...P.holes, ...P.solids]) { a1 = Math.max(a1, S.a1 + T); y0 = Math.min(y0, S.y0 - T); y1 = Math.max(y1, S.y1 + T); b0 = Math.min(b0, S.b0 - T); b1 = Math.max(b1, S.b1 + T); }
  // the rooms' rough walls recede up to 11 voxels, their domes rise over them
  for (const S of P.spaces) { a0 = Math.min(a0, S.a0 - 12); a1 = Math.max(a1, S.a1 + 12); b0 = Math.min(b0, S.b0 - 12); b1 = Math.max(b1, S.b1 + 12); y1 = Math.max(y1, S.y1 + Math.min(S.a1 - S.a0, S.b1 - S.b0) * 0.21 + 6); }
  if (P.room) { a1 = Math.max(a1, P.room.a1 + 6); y0 = Math.min(y0, P.room.y0 - 6); y1 = Math.max(y1, P.room.y1 + 6); b0 = Math.min(b0, P.room.b0 - 6); b1 = Math.max(b1, P.room.b1 + 6); }
  b0 = Math.min(b0, -Math.abs(P.entry.wob) - 22); b1 = Math.max(b1, Math.abs(P.entry.wob) + 22);
  y1 = Math.max(y1, 30);
  P.bb = [a0, a1, y0, y1, b0, b1];
  return P;
}

/** The sealed door in the +a wall at aW (its inner face), floor y0; the strongroom behind it. */
function sealed(L, P, r, aW, y0, size = 'small', S = P.main) {
  const D = { a0: aW, a1: aW + T, y0, y1: y0 + DH + DW, b0: -DW, b1: DW, wh: Math.max(-S.b0, S.b1) + T, ht: S.y1 - S.y0 + T };
  P.door = D; P.DW = DW; P.DH = DH;
  const big = size === 'big';
  const RA = big ? 44 : 34, RB = big ? 24 : 18, RH = big ? 34 : 28;
  P.room = { a0: aW + T, a1: aW + T + RA, y0, y1: y0 + RH, b0: -RB, b1: RB };
  const rm = P.room;
  P.hoards = big
    ? [{ a: rm.a1 - 9, b: -RB + 9, r: 8, h: 7 }, { a: rm.a1 - 8, b: RB - 9, r: 7, h: 6 }, { a: rm.a0 + 8, b: RB - 7, r: 5, h: 3 }]
    : [{ a: rm.a1 - 8, b: -RB + 8, r: 7, h: 6 }, { a: rm.a1 - 7, b: RB - 8, r: 6, h: 5 }];
  P.chest = { a: rm.a1 - 11, y: y0, b: 0, face: [-1, 0] };
  P.doorRunes = [];
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) P.doorRunes.push({ a: aW, y0: y0 + 2 + i * 5, y1: y0 + 5 + i * 5, b0: s < 0 ? -DW - 3 : DW + 1, b1: s < 0 ? -DW - 1 : DW + 3 });
  P.braziers = [{ a: aW - 7, b: -(DW + 9), y: y0 }, { a: aW - 7, b: DW + 9, y: y0 }];
  P.spots.door = [aW - 20, y0, 0];
  P.spots.room = [(rm.a0 + rm.a1) / 2 - 8, y0, 0];
  P.looks.door = [aW, y0 + 12, 0];
  P.looks.chest = [P.chest.a, y0 + 6, P.chest.b];
}

/** Four levers in niches of the side walls (wall faces at b = ±wb), at the given a's. */
function levers(L, P, r, wb, as, y0 = 0) {
  const syms = pickSymbols(r, 4);
  const spots = [[as[0], -1], [as[0], 1], [as[1], -1], [as[1], 1]];
  P.levers = spots.map(([a, s], i) => ({ a, b: s * (wb + 3), y: y0 + 14, face: [0, -s], glyph: syms[i], side: s }));
  for (const lv of P.levers) {
    P.holes.push(lv.side > 0 ? box(lv.a - 9, lv.a + 9, y0 + 5, y0 + 25, wb, wb + 3) : box(lv.a - 9, lv.a + 9, y0 + 5, y0 + 25, -wb - 3, -wb));
    P.keep.push(lv.side > 0 ? box(lv.a - 14, lv.a + 14, y0 - 2, y0 + 34, wb - 1, wb + 14) : box(lv.a - 14, lv.a + 14, y0 - 2, y0 + 34, -wb - 14, -wb + 1));
  }
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  P.order = order;
  P.lintel = order.map((i) => syms[i]);
  const lv = P.levers[0];
  P.spots.puzzle = [lv.a, y0, lv.b - lv.side * 20];
  P.looks.lever = [lv.a, y0 + 14, lv.b];
}

/** A hidden switch behind a cracked panel in a side wall (inner face at b = ±wb). */
function hiddenSwitch(L, P, r, wb, a, y0 = 0) {
  const side = r() < 0.5 ? -1 : 1;
  const face = side > 0 ? wb : -wb - 1; // the panel's inner face voxel row
  P.switch = { side, a, b: side * (wb + 8), y: y0 + 16, face: [0, -side], wallB: side * wb, probe: [] };
  for (const y of [y0 + 8, y0 + 14, y0 + 20]) for (const da of [-6, 0, 6]) P.switch.probe.push([a + da, y, face]);
  // the cracked panel (two voxels thick) and the niche behind it, its back wall forced solid
  P.solids.push(side > 0 ? box(a - 12, a + 12, y0 + 2, y0 + 26, wb, wb + 2, { m: RM.CRACKED }) : box(a - 12, a + 12, y0 + 2, y0 + 26, -wb - 2, -wb, { m: RM.CRACKED }));
  P.holes.push(side > 0 ? box(a - 10, a + 10, y0 + 4, y0 + 24, wb + 2, wb + 8) : box(a - 10, a + 10, y0 + 4, y0 + 24, -wb - 8, -wb - 2));
  P.solids.push(side > 0 ? box(a - 12, a + 12, y0 + 2, y0 + 26, wb + 8, wb + 12, { wall: true }) : box(a - 12, a + 12, y0 + 2, y0 + 26, -wb - 12, -wb - 8, { wall: true }));
  P.keep.push(side > 0 ? box(a - 16, a + 16, y0 - 2, y0 + 32, wb - 1, wb + 16) : box(a - 16, a + 16, y0 - 2, y0 + 32, -wb - 16, -wb + 1));
  P.lintel = [G.hammer, G.arrow];
  P.lintelFlip = side < 0;
  P.spots.puzzle = [a, y0, side * (wb - 14)];
  P.looks.switch = [a, y0 + 16, side * wb];
}

function spawner(P, a, b, y, kinds) {
  P.spawners.push({ a, b, y, kinds });
  P.solids.push(box(a - 4, a + 4, y, y + 8, b - 4, b + 4, { cage: true }));
  P.looks.spawner = [a, y + 4, b];
}

/** Cobwebs in the top corners of a space (each corner by chance). */
function cornerWebs(P, S, r, k = 0.65) {
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    if (r() > k) continue;
    P.webs.push({ a: sa < 0 ? S.a0 : S.a1, b: sb < 0 ? S.b0 : S.b1, y: S.y1, da: -sa, db: -sb, r: 0.4 + r() * 0.35 });
  }
}

// ---- the monster room
function cell(L, P, r) {
  const plain = P.plain;
  const A = plain ? (r() < 0.5 ? 3 : 4) : 4, Bh = r() < 0.5 ? 3 : 4, H = 32;
  const S = box(-A * 8, A * 8, 0, H, -Bh * 8, Bh * 8);
  P.spaces.push(S);
  P.main = S;
  P.front = S.a0 - T;
  // the way in: a ragged hole in the front wall
  P.holes.push(box(S.a0 - T, S.a0, 0, 24, -8, 8, { ragged: true }));
  spawner(P, 0, 0, 0, spawnKinds('cell', L.zone, r));
  // two chests against the side walls
  const ca = (r() < 0.5 ? -1 : 1) * 12;
  P.chests.push({ a: ca, y: 0, b: S.b0 + 4, face: [0, 1] });
  P.chests.push({ a: -ca + (r() < 0.5 ? 4 : -4), y: 0, b: S.b1 - 4, face: [0, -1] });
  cornerWebs(P, S, r, 0.8);
  P.webs.push({ a: S.a0 - 4, b: 0, y: 24, da: 1, db: 0, r: 0.5, flat: true }); // across the way in
  P.spots.mid = [S.a0 + 10, 0, 0];
  P.looks.mid = [S.a1, 14, 0];
  if (!plain) {
    P.remains.push({ a: S.a1 - 6, y: 0, b: (r() < 0.5 ? -1 : 1) * (S.b1 - 6) });
    sealed(L, P, r, S.a1, 0, 'small');
    if (L.puzzle === 'levers') levers(L, P, r, S.b1, [-16, 16]);
    else hiddenSwitch(L, P, r, S.b1, 10);
  }
}

// ---- the flooded crypt
function crypt(L, P, r) {
  const hall = box(-40, 24, 0, 32, -16, 16);
  P.spaces.push(hall);
  P.main = hall;
  P.front = hall.a0 - T;
  P.holes.push(box(hall.a0 - T, hall.a0, 0, 24, -8, 8, { ragged: true }));
  // tomb niches in both side walls, two rows (bones in them)
  for (let k = 0; k < 5; k++) {
    const a0 = -36 + k * 11;
    if (a0 + 7 > 16) break;
    for (const s of [-1, 1]) for (const [ya, yb] of [[3, 10], [15, 22]]) {
      if (s > 0 && k === 1 && ya === 3) continue; // the chest alcove
      P.holes.push(s > 0 ? box(a0, a0 + 7, ya, yb, 16, 22, { tomb: true }) : box(a0, a0 + 7, ya, yb, -22, -16, { tomb: true }));
      if (h3(k, ya, s, L.seed + 5) < 0.55) P.skulls.push({ a: a0 + 3.5, y: ya, b: s * 19, face: [0, -s] });
    }
  }
  // the chest alcove
  P.holes.push(box(-26, -14, 0, 14, 16, 24));
  P.chests.push({ a: -20, y: 0, b: 20, face: [0, -1] });
  spawner(P, -10, 0, 0, spawnKinds('crypt', L.zone, r));
  // the stair down (ten steps of a quarter block), the lower crypt full of water
  const WL = 26, DD = 40;
  const steps = [];
  for (let k = 0; k < 10; k++) {
    const st = box(24 + k * 6, 30 + k * 6, -4 * (k + 1), -4 * (k + 1) + 32, -12, 12, { fill: { m: M.WATER, top: -DD + WL } });
    steps.push(st);
    P.spaces.push(st);
  }
  const low = box(84, 132, -DD, -8, -20, 20, { fill: { m: M.WATER, top: -DD + WL } });
  P.spaces.push(low);
  P.lower = low;
  P.DD = DD; P.WL = WL;
  sealed(L, P, r, low.a1, -DD, 'small', low);
  // the drain wheel on the hall's wall at the top of the stair
  P.valve = { a: 16, y: 12, b: -16, face: [0, 1] };
  P.drain = { boxes: [{ a0: 24, a1: 84, b0: -12, b1: 12 }, { a0: 84, a1: 132, b0: -20, b1: 20 }], top: -DD + WL - 1, bottom: -DD, c: [108, -DD + WL, 0] };
  P.spots.puzzle = [6, 0, -4];
  P.looks.valve = [16, 12, -16];
  P.spots.door = [low.a1 - 20, -DD, 0];
  P.remains.push({ a: 18, y: 0, b: 11 });
  cornerWebs(P, hall, r, 0.75);
  P.webs.push({ a: -36 + 11 * 2 + 3.5, b: -16, y: 21, da: 0, db: 1, r: 0.3, flat: true, deco: true }); // over a tomb
  P.spots.mid = [-28, 0, 0];
  P.looks.mid = [24, 4, 0];
  P.looks.shaft = [60, -20, 0];
  P.looks.gallery = [108, -30, 0];
}

// ---- the collapsed Starfolk vault
function vault(L, P, r) {
  const S = box(-40, 40, 0, 48, -40, 40);
  P.spaces.push(S);
  P.main = S;
  P.front = S.a0 - T;
  P.holes.push(box(S.a0 - T, S.a0, 0, 24, -8, 8, { ragged: true }));
  // four flowstone columns (where a stalactite met its stalagmite)
  for (const pa of [-24, 24]) for (const pb of [-24, 24]) P.solids.push(box(pa - 10, pa + 10, -1, 64, pb - 10, pb + 10, { column: true, ca: pa, cb: pb, r: 4.2 }));
  // the corner that came down: a heap of blocks and a broken chimney over it
  const side = r() < 0.5 ? -1 : 1;
  P.collapse = { a: -26, b: side * 26, rad: 16 };
  P.holes.push(box(-40, -12, 48, 64, side > 0 ? 12 : -40, side > 0 ? 40 : -12, { chimney: true }));
  sealed(L, P, r, S.a1, 0, 'big');
  P.braziers = [{ a: 32, b: -18, y: 0 }, { a: 32, b: 18, y: 0 }];
  P.chests.push({ a: 32, y: 0, b: -side * 34, face: [0, side] });
  P.remains.push({ a: -30, y: 0, b: -side * 30 });
  P.guards.push({ kind: L.zone >= 3 ? 'crystal_golem' : 'golem', a: 10, b: 0 });
  if (L.zone >= 2) P.guards.push({ kind: 'golem', a: 18, b: side * -14 });
  if (L.puzzle === 'dials') {
    const target = pickSymbols(r, 3);
    P.target = target;
    const start = target.map((g) => SYMBOLS.indexOf(g));
    for (let i = 0; i < 3; i++) start[i] = (start[i] + 1 + Math.floor(r() * 5)) % 6;
    P.dials = [16, 0, -16].map((a, i) => ({ a: a + 0.5, b: 34, y: 8, face: [0, -1], start: start[i], link: i > 0 ? i - 1 : -1, glyphs: SYMBOLS }));
    P.altar = { a0: -24, a1: 24, b0: 30, y1: 8 };
    P.solids.push(box(-24, 24, 0, 8, 30, 40, { altar: true }));
    P.mural = { b: 40, glyphs: [16, 0, -16].map((a, i) => ({ a, g: target[i] })), y0: 18 };
    P.spots.puzzle = [0, 0, 6];
    P.looks.dials = [0, 12, 34];
    P.lintel = [G.eye, G.star, G.eye];
  } else {
    P.plates = [{ a: -16, b: -16 }, { a: -16, b: 16 }, { a: 18, b: 0 }].map((p) => ({ ...p, h: 6 }));
    P.spots.puzzle = [-28, 0, 0];
    P.looks.plates = [18, 0, 0];
    P.lintel = [G.weight, G.weight, G.weight];
  }
  cornerWebs(P, S, r, 0.5);
  P.spots.mid = [-32, 0, 0];
  P.looks.mid = [40, 16, 0];
}

// ---- the deep fortress
function fortress(L, P, r) {
  const hall = box(-48, 48, 0, 40, -24, 24);
  P.spaces.push(hall);
  P.main = hall;
  P.front = hall.a0 - T;
  P.holes.push(box(hall.a0 - T, hall.a0, 0, 24, -8, 8, { ragged: true }));
  // flowstone draperies down both walls
  for (const pa of [-30, 0, 30]) for (const s of [-1, 1]) P.solids.push(s > 0 ? box(pa - 10, pa + 10, -1, 56, 13, 34, { column: true, ca: pa, cb: 22, r: 4.4 }) : box(pa - 10, pa + 10, -1, 56, -34, -13, { column: true, ca: pa, cb: -22, r: 4.4 }));
  // two side rooms with spawners and chests; a lava pit behind bars in the second
  const ra = box(-32, -8, 0, 32, -56, -32), rb = box(4, 28, 0, 32, 32, 56);
  P.spaces.push(ra, rb);
  P.holes.push(box(-20, -12, 0, 24, -32, -24), box(12, 20, 0, 24, 24, 32));
  const kinds = spawnKinds('fortress', L.zone, r);
  spawner(P, -20, -44, 0, kinds);
  spawner(P, 20, 44, 0, kinds);
  P.chests.push({ a: -28, y: 0, b: -52, face: [0, 1] }, { a: 24, y: 0, b: 52, face: [0, -1] });
  P.lava = box(4, 12, -8, -2, 40, 56);
  P.holes.push(box(4, 12, -8, 0, 40, 56, { lava: true }));
  P.solids.push(box(3, 13, -11, -8, 39, 57, { m: M.BASALT })); // the pool's bed: nothing leaks
  const door = 48;
  sealed(L, P, r, door, 0, 'big');
  P.braziers = [{ a: 44, b: -18, y: 0 }, { a: 44, b: 18, y: 0 }];
  if (L.puzzle === 'levers') levers(L, P, r, 24, [-40, 40]);
  else {
    P.beam = {
      y: 12,
      src: { a: -44, b: -23, dir: [0, 1] },
      mirrors: [{ a: -44, b: 12 }, { a: 20, b: 12 }, { a: 20, b: -12 }],
      recv: { a: 42, b: -12 },
    };
    const path = [[0, 1], [1, 0], [0, -1], [1, 0]];
    P.beam.mirrors.forEach((m, i) => { m.sol = mirrorFor(path[i], path[i + 1]); m.start = (m.sol + 1 + Math.floor(r() * 3)) % 4; });
    P.lintel = [G.sun, G.eye];
    P.keep.push(box(-52, -36, -2, 26, -34, -20));
    P.spots.puzzle = [-30, 0, 0];
    P.looks.beams = [20, 12, 12];
  }
  P.remains.push({ a: -12, y: 0, b: -52 });
  cornerWebs(P, ra, r, 0.4);
  P.spots.mid = [-40, 0, 0];
  P.looks.mid = [48, 14, 0];
}

/** Mirror orientation k whose normal is the diagonal (cos, sin)(π/4 + kπ/2) that turns d_in into d_out. */
export function mirrorFor(din, dout) {
  const na = dout[0] - din[0], nb = dout[1] - din[1];
  const ang = Math.atan2(nb, na);
  return ((Math.round((ang - Math.PI / 4) / (Math.PI / 2)) % 4) + 4) % 4;
}

// ------------------------------------------------------------------ natural rock
// the zone's rock, where the dungeon has to put some back (a floor over a cave, a plug)
const ZROCK = [M.STONE, M.STONE, M.MUDSTONE, M.GRANITE, M.BASALT, M.PERMAFROST, M.CORE];
// flowstone (columns, draperies) by zone: [body, band]
const FLOW = [[M.LIMESTONE, M.MUDSTONE], [M.LIMESTONE, M.MUDSTONE], [M.LIMESTONE, M.SANDSTONE], [M.LIMESTONE, M.CRYSTALROCK], [M.BASALT, M.OBSIDIAN], [M.ICE, M.PERMAFROST], [M.STARROCK, M.VOIDROCK]];
const rockOr = (L, cur) => (natural(cur) ? -1 : ZROCK[L.zone] || M.STONE);
/** Flowstone: the body with a thin wavy growth band now and then. */
function flowMat(L, y, vx, vz) {
  const F = FLOW[L.zone] || FLOW[1];
  const band = (y + Math.floor(Math.sin(vx * 0.4) * 1.5 + Math.sin(vz * 0.33) * 1.5) + 64) % 11;
  return band === 0 ? F[1] : F[0];
}

// ------------------------------------------------------------------ the stamp
/** Material for local voxel (a, y, b), or -1 to leave what is there. */
export function dungeonVox(L, a, y, b, cur, vx, vy, vz) {
  const P = L.P;
  // 1. the crystal seal, its frame and the marks over it; 2. the treasure grotto behind it
  if (P.door) {
    const m = doorWall(L, P, a, y, b, cur);
    if (m !== -9) return m;
    const rd = boxDist(P.room, a, y, b);
    if (rd <= 4 && a >= P.door.a1 - 4) {
      const m2 = strongroom(L, P, a, y, b, rd, vx, vy, vz);
      if (m2 !== -9) return m2;
    }
  }
  // 3. what stands in the rooms: flowstone columns, the brood nest, the loose panel, plugs
  const sol = P.solids;
  for (let i = 0; i < sol.length; i++) {
    const S = sol[i];
    if (!inside(S, a, y, b)) continue;
    const m = solidVox(L, P, S, a, y, b, vx, vy, vz, cur);
    if (m !== -9) return m;
  }
  // 4. holes: the way in, niches, the lava pool, the broken chimney
  const ho = P.holes;
  for (let i = 0; i < ho.length; i++) {
    const H = ho[i];
    if (!inside(H, a, y, b)) continue;
    if (H.lava) return y < P.lava.y1 ? M.LAVA : 0;
    if (H.ragged && raggedKeep(L, H, a, y, b)) break;
    if (H.tomb && y === H.y0 && h3(a >> 1, y, b >> 1, L.seed + 41) < 0.22) return M.BONE; // bone dust
    if (H.chimney) { const m = chimney(L, P, a, y, b, cur); if (m >= 0) return m; continue; }
    return 0;
  }
  // 5. the rooms: rough walls that only ever recede, a domed roof, a flat floor
  const sp = P.spaces;
  for (let i = 0; i < sp.length; i++) {
    const S = sp[i];
    if (!envelope(L, P, S, a, y, b, vx, vy, vz)) continue;
    if (P.collapse && S === P.main) { const m = rubble(L, P, a, y, b, vx, vy, vz); if (m >= 0) return m; }
    if (S.fill && y < S.fill.top && inside(S, a, y, b)) return S.fill.m;
    return 0;
  }
  // 6. under the floors: rock (nothing stands over a hole), the pressure stones' pits
  for (let i = 0; i < sp.length; i++) {
    const S = sp[i];
    if (y >= S.y0 || y < S.y0 - 3 || a < S.a0 - 12 || a >= S.a1 + 12 || b < S.b0 - 12 || b >= S.b1 + 12) continue;
    if (y === S.y0 - 1 && P.plates) { const m = platePit(P, a, b); if (m >= 0) return m; }
    return rockOr(L, cur);
  }
  // 7. the crawl out to the cave
  const E = P.entry;
  if (a < E.a && a >= E.end - 2) return crawl(L, P, a, y, b, cur, vx, vy, vz);
  return -1;
}

/**
 * Is (a, y, b) open in space S? Inside its box, under a dome that rises over the middle; out past
 * the box the walls recede 2–11 voxels, ragged, curling over into the roof. Not past the wall the
 * seal is in, nor where something hangs on a wall (P.keep).
 */
function envelope(L, P, S, a, y, b, vx, vy, vz) {
  if (y < S.y0) return false;
  if (a < S.a0 - 11 || a >= S.a1 + 11 || b < S.b0 - 11 || b >= S.b1 + 11) return false;
  const ha = (S.a1 - S.a0) / 2, hb = (S.b1 - S.b0) / 2, H = S.y1 - S.y0, rise = Math.min(ha, hb) * 0.42;
  if (y >= S.y1 + rise + 4) return false;
  const da = a < S.a0 ? S.a0 - a : a >= S.a1 ? a - S.a1 + 1 : 0;
  const db = b < S.b0 ? S.b0 - b : b >= S.b1 ? b - S.b1 + 1 : 0;
  const n1 = vn(vx, vy, vz, 9, L.seed + 71), n2 = h3(vx >> 2, vy >> 2, vz >> 2, L.seed + 73);
  if (da || db) {
    // not round the seal and the marks over it (the rest of that wall may recede)
    if (P.door && S === P.main && a >= S.a1 && Math.abs(b + 0.5) < DW + 10 && y < S.y0 + DH + DW + 12) return false;
    const K = P.keep;
    for (let i = 0; i < K.length; i++) if (inside(K[i], a, y, b)) return false;
    const m = 2 + n1 * 8 + n2 * 1.5;
    const dh = Math.sqrt(da * da + db * db);
    if (dh >= m) return false;
    const q = dh / m;
    return y < S.y1 - q * q * H * 0.4 + (n2 - 0.5) * 3;
  }
  // inside: a dome over the box
  const u = (a + 0.5 - (S.a0 + S.a1) / 2) / ha, w = (b + 0.5 - (S.b0 + S.b1) / 2) / hb;
  return y < S.y1 + Math.max(0, 1 - u * u - w * w) * rise + (n1 - 0.5) * 4;
}

/** Keep some of a ragged hole's rim (the rock broke, it wasn't cut). */
function raggedKeep(L, H, a, y, b) {
  const edge = Math.min(b - H.b0, H.b1 - 1 - b, H.y1 - 1 - y);
  if (edge > 3) return false;
  return h3(a >> 2, y >> 2, b >> 2, L.seed + 51) < 0.45;
}

/** A solid's material at (a, y, b), or -9 when this voxel isn't part of it. */
function solidVox(L, P, S, a, y, b, vx, vy, vz, cur) {
  if (S.m) return S.m;
  if (S.cage) return nest(L, S, a, y, b, vx, vy, vz);
  if (S.column) {
    // flowstone: a waisted column, flared where it meets the floor and the roof, rippled, banded
    const dx = a + 0.5 - S.ca, db = b + 0.5 - S.cb, d = Math.sqrt(dx * dx + db * db);
    const foot = Math.max(0, 1 - y / 12), head = Math.max(0, (y - 34) / 26);
    const r = S.r * (0.85 + 0.18 * Math.sin(y * 0.45 + S.ca)) + foot * foot * 6 + head * head * 7 + (vn(vx, vy, vz, 4, L.seed + 93) - 0.5) * 2.4;
    return d < r ? flowMat(L, y, vx, vz) : -9;
  }
  if (S.altar) return rockOr(L, cur) < 0 ? cur : ZROCK[L.zone];
  if (S.bars) return -9;
  if (S.wall) return rockOr(L, cur) < 0 ? cur : ZROCK[L.zone];
  return -9;
}

/** The brood nest (the spawner, in its 8-voxel block): a lumpy hollow mound, holes to glow through. */
function nest(L, S, a, y, b, vx, vy, vz) {
  const i = a - S.a0, j = y - S.y0, k = b - S.b0;
  const dx = i - 3.5, dz = k - 3.5, r = Math.sqrt(dx * dx + dz * dz);
  const R = 4.2 - j * 0.34 + (h3(vx >> 1, vy, vz >> 1, L.seed + 83) - 0.5) * 0.8;
  if (r > R) return 0;
  if (r < R - 1.7 && j > 0 && j < 6) return 0;
  if (j > 1 && h3(vx, vy, vz, L.seed + 81) < 0.16) return 0;
  return RM.SPAWNER;
}

/** The seal's wall: the crystal seal (over bedrock), rough rock round it, the progress crystals, the marks. -9: not here. */
function doorWall(L, P, a, y, b, cur) {
  const D = P.door, cb = b + 0.5, ab = Math.abs(cb);
  if (a < D.a0 || a >= D.a1 || y < D.y0 - T || ab >= D.wh) return -9;
  const yy = y - D.y0;
  if (yy < 0) return rockOr(L, cur);
  const inDoor = ab < DW && (yy < DH || (yy - DH) ** 2 + cb * cb < DW * DW);
  if (inDoor) return a === D.a0 || a === D.a1 - 1 ? RM.WARD : M.BEDROCK;
  if (yy >= D.ht) return -9;
  if (a > D.a0 + 1) return -9;
  // round the seal: rock, the crystals that light as you get closer to opening it set in it
  const rr = Math.sqrt((yy - DH) * (yy - DH) + cb * cb);
  const jamb = ab >= DW && ab < DW + 4 && yy < DH;
  const arch = yy >= DH && rr >= DW && rr < DW + 3;
  if (jamb || arch) {
    if (a === D.a0) for (const r of P.doorRunes) if (y >= r.y0 && y < r.y1 && b >= r.b0 && b < r.b1) return RM.RUNEOFF;
    return rockOr(L, cur);
  }
  // the marks scratched in the rock over the seal (the puzzle's hint)
  if (P.lintel && a === D.a0) {
    const ly = yy - (DH + DW + 2), n = P.lintel.length, w = n * 8 - 1;
    if (ly >= 0 && ly <= 6 && ab < w / 2 + 1) {
      const xx = Math.floor(cb + w / 2), k = Math.floor(xx / 8), gx = xx - k * 8;
      if (k >= 0 && k < n && gx < 7) {
        const g = P.lintel[k];
        if (glyphPix(g, P.lintelFlip && g === G.arrow ? 6 - gx : gx, ly)) return RM.SCRATCH;
      }
      return rockOr(L, cur);
    }
  }
  return -9;
}

/**
 * The treasure grotto: a rounded hollow lined with crystal and geode rock, gold heaped on its
 * floor (the hoard you dig for gold); bedrock round it, so the only way in is through the seal.
 */
function strongroom(L, P, a, y, b, d, vx, vy, vz) {
  if (d > 4) return -9;
  if (d >= 2) return M.BEDROCK;
  const B = P.room;
  const lining = () => (h3(vx, vy, vz, L.seed + 3) < 0.28 ? M.CRYSTAL : M.GEODE);
  if (d === 1) {
    if (y < B.y0) return h3(vx, vy, vz, L.seed + 4) < 0.18 ? RM.HOARD : M.GEODE;
    return lining();
  }
  const ha = (B.a1 - B.a0) / 2, hb = (B.b1 - B.b0) / 2, H = B.y1 - B.y0;
  const u = (a + 0.5 - (B.a0 + B.a1) / 2) / ha, w = (b + 0.5 - (B.b0 + B.b1) / 2) / hb, v = (y + 0.5 - B.y0) / H;
  if (u * u * u * u + w * w * w * w + v * v * 0.9 > 1 + (h3(vx >> 1, vy >> 1, vz >> 1, L.seed + 6) - 0.5) * 0.12) return lining();
  for (const hd of P.hoards) {
    const dd = hyp((a + 0.5 - hd.a) / hd.r, (b + 0.5 - hd.b) / hd.r);
    const top = hd.h * (1 - dd * dd) + (h3(vx, 0, vz, L.seed + 5) - 0.5) * 2;
    if (dd < 1 && y - B.y0 < top) return RM.HOARD;
  }
  return 0;
}

/** The grotto's fallen side: a breakdown heap of boulders and grit under the chimney. */
function rubble(L, P, a, y, b, vx, vy, vz) {
  const C = P.collapse, d = Math.hypot((a + 0.5 - C.a) / C.rad, (b + 0.5 - C.b) / C.rad);
  if (d >= 1) return -1;
  const top = 26 * Math.pow(1 - d, 1.3) + (h3(a >> 2, 0, b >> 2, L.seed + 13) - 0.5) * 6;
  if (y >= top) return -1;
  const h = h3(vx >> 3, vy >> 2, vz >> 3, L.seed + 14);
  return h < 0.55 ? ZROCK[L.zone] : h < 0.8 ? FLOW[L.zone][0] : M.GRAVEL;
}

/** The broken chimney over the fallen corner: open where the heap was, rock round about. */
function chimney(L, P, a, y, b, cur) {
  const C = P.collapse, d = Math.hypot((a + 0.5 - C.a) / (C.rad * 0.8), (b + 0.5 - C.b) / (C.rad * 0.8));
  const lim = 1 - (y - 48) / 24 + (h3(a >> 2, y >> 2, b >> 2, L.seed + 15) - 0.5) * 0.4;
  if (d < lim) return 0;
  return -1;
}

/** A pressure stone's pit (one voxel under the stone), or -1. */
function platePit(P, a, b) {
  for (const p of P.plates || []) {
    const da = Math.abs(a + 0.5 - p.a), db = Math.abs(b + 0.5 - p.b);
    if (da < p.h && db < p.h) return 0;
  }
  return -1;
}

/** smooth value noise from the voxel hash (0..1), cell c voxels */
function vn(x, y, z, c, s) {
  const fx = x / c, fy = y / c, fz = z / c, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty), uz = tz * tz * (3 - 2 * tz);
  const k = (i, j, l) => h3(ix + i, iy + j, iz + l, s);
  const x00 = k(0, 0, 0) + (k(1, 0, 0) - k(0, 0, 0)) * ux, x10 = k(0, 1, 0) + (k(1, 1, 0) - k(0, 1, 0)) * ux;
  const x01 = k(0, 0, 1) + (k(1, 0, 1) - k(0, 0, 1)) * ux, x11 = k(0, 1, 1) + (k(1, 1, 1) - k(0, 1, 1)) * ux;
  const y0 = x00 + (x10 - x00) * uy, y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

/** The crawl from the dungeon's front out to the cave: rough, natural, a flat floor. */
function crawl(L, P, a, y, b, cur, vx, vy, vz) {
  if (!cur || cur === M.BEDROCK || (cur >= 43 && cur < 128) || cur === M.WATER || cur === M.LAVA) return -1;
  const E = P.entry, t = (E.a - a) / E.len;
  const bc = Math.sin(Math.min(1, t) * Math.PI) * E.wob;
  const hw = 10 + (vn(vx, vy, vz, 6, L.seed + 61) - 0.5) * 6;
  const ht = 19 + (vn(vx, vy, vz, 7, L.seed + 63) - 0.5) * 6;
  if (y < 0 + (vn(vx, 0, vz, 5, L.seed + 65) > 0.8 ? 1 : 0)) return -1;
  const db = (b + 0.5 - bc) / hw, dy = (y + 0.5 - ht * 0.5) / (ht * 0.5);
  if (db * db + dy * dy < 1) return 0;
  return -1;
}

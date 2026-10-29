// The dungeons: rare rooms hidden in the rock, Minecraft-like (they replace the old ones' ruins in
// plan.ruins). Built on a 0.5 m block grid (8 voxels a block; every block is one material, so the
// walls read as blocks): cobble and mossy cobble, stone bricks in courses with mortar between,
// the Starfolk's fitted stone, dark deep bricks. Caves that run into a dungeon break through its
// walls (that's how you find one); a short natural crawl always joins its front to the nearest cave.
//
//   cell      Monster Room: one cobble room, a monster spawner in the middle, two chests, cobwebs
//             in the corners. Most have a sealed strongroom behind the back wall: a hidden switch
//             (behind a cracked panel) or four levers in their niches, in the order the lintel shows.
//             The plain ones (plan: f.plain) are just the room, the spawner and the chests.
//   crypt     Flooded Crypt: a stone-brick hall lined with tomb niches, a spawner, a stair going down
//             into a lower crypt full of black water; the sealed door is down there. A drain wheel at
//             the top of the stair empties it (puzzle 'valve'). A dart trap by the way in.
//   vault     Collapsed Starfolk Vault: a tall antechamber of fitted stone on four pillars, one corner
//             fallen in; the seal door, and either three symbol drums on an altar under a mural
//             ('dials') or three pressure plates in the floor ('plates'). Stone guardians wake.
//   fortress  Deep Fortress (the Magma Deep and the Core): a long dark-brick hall on half pillars with
//             two side rooms (spawners, chests, a lava pit behind iron bars); a sun crystal and three
//             mirrors ('beams') or four levers open its door. A dart trap at the way in.
//
// Layout on the ruin's local grid (./common.js: a forward, b right, y up from the floor; the front,
// where the crawl comes in, is at -a; the sealed door and the strongroom at +a). dungeonLayout(L)
// returns P for the puzzles and the site (door, room, chest, hoards, doorRunes, lintel, levers /
// switch / dials / beam / plates / valve, spawners, chests, webs, traps, remains, spots) and the
// boxes dungeonVox() stamps. Pure: runs in the chunk workers too.
import { M } from '../materials.js';
import { RM } from './mats.js';
import { h3, G, rng, pickSymbols, SYMBOLS, boxDist, treasureVox, glyphPix } from './common.js';

const T = 8; // walls: one block
const DW = 8, DH = 14; // the sealed door: half width, height of the jambs (an arch of radius DW on top)

export const DUNGEON_NAMES = { cell: 'Monster Room', crypt: 'Flooded Crypt', vault: 'Starfolk Vault', fortress: 'Deep Fortress' };
export const DUNGEON_BLURB = {
  cell: 'mossy cobblestone, cobwebs, and something rattling in an iron cage.',
  crypt: 'tombs in the walls, and a stair going down into black water.',
  vault: 'the Starfolk built this, long ago. Part of the roof has come down.',
  fortress: 'dark bricks, hot air, and the smell of something burning.',
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
  const P = { kind, plain: !!L.plain, spaces: [], holes: [], solids: [], chests: [], spawners: [], webs: [], traps: [], remains: [], guards: [], skulls: [], spots: {}, looks: {} };
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
  for (const lv of P.levers) P.holes.push(lv.side > 0 ? box(lv.a - 9, lv.a + 9, y0 + 5, y0 + 25, wb, wb + 3) : box(lv.a - 9, lv.a + 9, y0 + 5, y0 + 25, -wb - 3, -wb));
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
  // a dart trap by the way in
  P.traps.push({ a: -30, b: 0, from: { a: -30, y: 10, b: 16 }, dir: [0, -1] });
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
  // four pillars
  for (const pa of [-24, 24]) for (const pb of [-24, 24]) P.solids.push(box(pa - 4, pa + 4, 0, 48, pb - 4, pb + 4, { pillar: true }));
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
  // half pillars along both walls
  for (const pa of [-30, 0, 30]) for (const s of [-1, 1]) P.solids.push(s > 0 ? box(pa - 4, pa + 4, 0, 40, 16, 24, { pillar: true }) : box(pa - 4, pa + 4, 0, 40, -24, -16, { pillar: true }));
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
  P.solids.push(box(3, 13, -11, -8, 39, 57, { m: RM.XBRICKA })); // the pit's bottom: nothing leaks
  P.solids.push(box(12, 13, 0, 11, 40, 56, { bars: true }), box(4, 13, 0, 11, 39, 40, { bars: true }));
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
    P.spots.puzzle = [-30, 0, 0];
    P.looks.beams = [20, 12, 12];
  }
  P.traps.push({ a: -38, b: 0, from: { a: -38, y: 10, b: 24 }, dir: [0, -1] });
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

// ------------------------------------------------------------------ materials of the themes
/** A theme's wall / floor / ceiling material. part: 0 wall, 1 floor, 2 ceiling; along: the wall's run. */
function themed(L, P, part, a, y, b, along, perp, yRel, hgt) {
  const s = L.seed, th = P.theme;
  const ba = a >> 3, by = y >> 3, bb = b >> 3;
  const hb = h3(ba, by, bb, s + 31);
  if (th === 'cob') {
    const moss = part === 1 ? 0.55 : part === 2 ? 0.18 : yRel < 8 ? 0.5 : 0.28;
    return hb < moss ? RM.DMOSSCOB : RM.DCOB;
  }
  if (th === 'star') {
    if (part === 1) {
      // checkered flagstones, a gold-edged mosaic path down the middle
      const ab = Math.abs(b + 0.5);
      if (ab < 12 && a < (P.door ? P.door.a0 : 1e9)) return ab >= 10 ? RM.MOS_G : ((a >> 2) + (b >> 2)) & 1 ? RM.MOS_K : RM.MOS_W;
      return (ba + bb) & 1 ? RM.RDARK : RM.FLAG;
    }
    if (part === 2) return hb < 0.06 ? RM.CRACKED : RM.RSTONE;
    if (yRel < 6) return RM.RDARK;
    if (yRel >= hgt - 3) return yRel === hgt - 3 ? RM.GILT : RM.RDARK;
    if (yRel >= hgt - 14 && yRel < hgt - 6) return RM.FRIEZE;
    return hb < 0.07 ? RM.CRACKED : hb < 0.12 ? RM.MARBLE : RM.RSTONE;
  }
  const deep = th === 'deep';
  const A1 = deep ? RM.XBRICKA : RM.DBRICKA, A2 = deep ? RM.XBRICKB : RM.DBRICKB, MO = deep ? RM.XMORTAR : RM.DMORTAR;
  if (part !== 0) {
    // floor / ceiling: a block a tile, mortar between
    if ((a & 7) === 0 || (b & 7) === 0) return MO;
    if (!deep && hb < 0.14 && part === 1) return RM.DMOSSBRICK;
    if (hb < 0.06) return deep ? A2 : RM.DCRACKBRICK;
    return hb < 0.55 ? A1 : A2;
  }
  // walls: courses of a quarter block, bricks a block long laid half over half
  if ((y & 3) === 3) return MO;
  const course = y >> 2, bi = (along + (course & 1) * 4) >> 3;
  const hk = h3(bi, course, perp >> 3, s + 37);
  if (!deep && hk < (yRel < 8 ? 0.22 : 0.08)) return RM.DMOSSBRICK;
  if (hk > 0.93) return deep ? A2 : RM.DCRACKBRICK;
  return hk < 0.55 ? A1 : A2;
}

// ------------------------------------------------------------------ the stamp
/** Material for local voxel (a, y, b), or -1 to leave what is there. */
export function dungeonVox(L, a, y, b, cur, vx, vy, vz) {
  const P = L.P;
  // 1. the sealed door, its frame and the lintel; 2. the strongroom behind it
  if (P.door) {
    const m = doorWall(L, P, a, y, b, cur);
    if (m !== -9) return m;
    const rd = boxDist(P.room, a, y, b);
    if (rd <= 4 && a >= P.door.a1 - 4) {
      const m2 = strongroom(L, P, a, y, b, rd, vx, vy, vz);
      if (m2 >= 0) return m2;
    }
  }
  // 3. things standing in the rooms (pillars, the spawner's cage, the altar, bars, panels)
  const sol = P.solids;
  for (let i = 0; i < sol.length; i++) {
    const S = sol[i];
    if (!inside(S, a, y, b)) continue;
    const m = solidVox(L, P, S, a, y, b, vx, vy, vz, cur);
    if (m >= 0) return m;
  }
  // 4. holes: the way in, niches, tombs, the lava pit, the broken chimney
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
  // 5. inside the rooms: air (or the crypt's water), the rubble of the vault's fallen corner
  const sp = P.spaces;
  for (let i = 0; i < sp.length; i++) {
    const S = sp[i];
    if (!inside(S, a, y, b)) continue;
    if (P.collapse) { const m = rubble(L, P, a, y, b); if (m >= 0) return m; }
    if (S.fill && y < S.fill.top) return S.fill.m;
    return 0;
  }
  // 6. the walls, floors and ceilings round them (caves that broke in stay open)
  for (let i = 0; i < sp.length; i++) {
    const S = sp[i];
    if (a < S.a0 - T || a >= S.a1 + T || y < S.y0 - T || y >= S.y1 + T || b < S.b0 - T || b >= S.b1 + T) continue;
    const part = y < S.y0 ? 1 : y >= S.y1 ? 2 : 0;
    if (part === 1 && y === S.y0 - 1 && (P.plates || P.traps.length)) { const m = platePit(P, a, b); if (m >= 0) return m; }
    if (part === 0 && cur === 0 && !S.fill && !(P.door && a >= P.door.a0 - 1)) return -1; // a cave broke through here
    if (part === 2 && cur === 0 && !S.fill) return -1;
    const endWall = a < S.a0 || a >= S.a1;
    const m = themed(L, P, part, a, y, b, endWall ? b : a, endWall ? a : b, y - S.y0, S.y1 - S.y0);
    // what's drawn on the walls: the mural, the dart trap's holes
    if (part === 0) { const d = wallArt(L, P, S, a, y, b); if (d >= 0) return d; }
    return m;
  }
  // 7. the crawl out to the cave
  const E = P.entry;
  if (a < E.a && a >= E.end - 2) return crawl(L, P, a, y, b, cur, vx, vy, vz);
  return -1;
}

/** Keep some blocks of a ragged hole's rim (the wall broke, it wasn't cut). */
function raggedKeep(L, H, a, y, b) {
  const edge = Math.min(b - H.b0, H.b1 - 1 - b, H.y1 - 1 - y);
  if (edge > 3) return false;
  return h3(a >> 2, y >> 2, b >> 2, L.seed + 51) < 0.45;
}

function solidVox(L, P, S, a, y, b, vx, vy, vz, cur) {
  if (S.m) return S.m;
  if (S.cage) {
    // the spawner's cage: a frame of iron bars round a hollow block
    const i = a - S.a0, j = y - S.y0, k = b - S.b0;
    const ei = i === 0 || i === 7, ej = j === 0 || j === 7, ek = k === 0 || k === 7;
    const n = (ei ? 1 : 0) + (ej ? 1 : 0) + (ek ? 1 : 0);
    if (n >= 2) return RM.SPAWNER;
    if (n === 1) {
      // bars on every face (upright on the sides, a cross on top), gaps to see the flame through
      if (ei) return k === 2 || k === 5 ? RM.SPAWNER : 0;
      if (ek) return i === 2 || i === 5 ? RM.SPAWNER : 0;
      return (i === 2 || i === 5) && (k === 2 || k === 5) ? RM.SPAWNER : 0;
    }
    return 0;
  }
  if (S.pillar) {
    const yr = y - S.y0, h = S.y1 - S.y0;
    if (P.theme === 'star') return yr < 4 || yr >= h - 4 ? RM.RDARK : (yr & 7) === 0 ? RM.GILT : RM.MARBLE;
    if (P.theme === 'deep') return yr < 3 || yr >= h - 3 || (yr & 7) === 7 ? RM.XMORTAR : (((yr >> 3) + (a >> 2)) & 1 ? RM.XBRICKA : RM.XBRICKB);
    return RM.DBRICKA;
  }
  if (S.altar) return y === S.y1 - 1 ? (b === S.b0 ? RM.GILT : RM.RDARK) : RM.RDARK;
  if (S.bars) {
    // iron bars: thin posts, a rail along the top
    if (y === S.y1 - 1 || y === S.y0) return RM.BARS;
    return ((a + b) & 1) === 0 ? RM.BARS : 0;
  }
  if (S.wall) return themed(L, P, 0, a, y, b, a, b, y, 32);
  return -1;
}

/** The sealed door's wall: the door (seal-stone over bedrock), its frame, runes and the lintel. -9: not here. */
function doorWall(L, P, a, y, b, cur) {
  const D = P.door, cb = b + 0.5, ab = Math.abs(cb);
  if (a < D.a0 || a >= D.a1 || y < D.y0 - T || ab >= D.wh) return -9;
  const yy = y - D.y0;
  if (yy < 0) return themed(L, P, 1, a, y, b, a, b, yy, 32);
  const inDoor = ab < DW && (yy < DH || (yy - DH) ** 2 + cb * cb < DW * DW);
  if (inDoor) return a === D.a0 || a === D.a1 - 1 ? RM.WARD : M.BEDROCK;
  if (yy >= D.ht) return -9;
  // behind the face the strongroom's wrap decides; the face is the theme's wall with the frame
  if (a > D.a0 + 1) return -9;
  // the frame: two voxels round the arch in the theme's trim, the progress runes in the jambs
  const rr = Math.sqrt((yy - DH) * (yy - DH) + cb * cb);
  const jamb = ab >= DW && ab < DW + 4 && yy < DH;
  const arch = yy >= DH && rr >= DW && rr < DW + 3;
  if (jamb || arch) {
    if (a === D.a0) for (const r of P.doorRunes) if (y >= r.y0 && y < r.y1 && b >= r.b0 && b < r.b1) return RM.RUNEOFF;
    if (arch && ab < 1.5) return RM.GILT; // keystone
    return P.theme === 'deep' ? RM.XMORTAR : RM.RDARK;
  }
  // the lintel with the puzzle's hint (gold signs on dark stone)
  if (P.lintel && a === D.a0) {
    const ly = yy - (DH + DW + 2), n = P.lintel.length, w = n * 8 - 1;
    if (ly >= -1 && ly <= 7 && ab < w / 2 + 2) {
      if (ly === -1 || ly === 7 || ab >= w / 2 + 1) return RM.RDARK;
      const xx = Math.floor(cb + w / 2), k = Math.floor(xx / 8), gx = xx - k * 8;
      if (k >= 0 && k < n && gx < 7) {
        const g = P.lintel[k];
        if (glyphPix(g, P.lintelFlip && g === G.arrow ? 6 - gx : gx, ly)) return RM.GILT;
      }
      return RM.FRIEZE;
    }
  }
  return -9;
}

/** The strongroom: the theme's stone lined with gold, the hoard heaps; bedrock round it. */
function strongroom(L, P, a, y, b, d, vx, vy, vz) {
  if (P.theme === 'star') return treasureVox(L, P.room, a, y, b, d, vx, vy, vz);
  if (d > 4) return -1;
  if (d >= 2) return M.BEDROCK;
  const B = P.room;
  if (d === 1) {
    if (y < B.y0) return ((a >> 3) + (b >> 3)) & 1 ? RM.GILT : themed(L, P, 1, a, y, b, a, b, -1, 32);
    if (y >= B.y1) return themed(L, P, 2, a, y, b, a, b, 0, 32);
    const yy = y - B.y0;
    if (yy === 6 || yy === 7) return RM.GILT; // a band of gold
    return themed(L, P, 0, a, y, b, a < B.a0 || a >= B.a1 ? b : a, a < B.a0 || a >= B.a1 ? a : b, yy, B.y1 - B.y0);
  }
  for (const hd of P.hoards) {
    const dd = Math.sqrt(((a + 0.5 - hd.a) / hd.r) ** 2 + ((b + 0.5 - hd.b) / hd.r) ** 2);
    const top = hd.h * (1 - dd * dd) + (h3(vx, 0, vz, L.seed + 5) - 0.5) * 2;
    if (dd < 1 && y - B.y0 < top) return RM.HOARD;
  }
  return 0;
}

/** The vault's fallen corner: a heap of fitted blocks, marble drums and grit. */
function rubble(L, P, a, y, b) {
  const C = P.collapse, d = Math.hypot((a + 0.5 - C.a) / C.rad, (b + 0.5 - C.b) / C.rad);
  if (d >= 1) return -1;
  const top = 26 * Math.pow(1 - d, 1.3) + (h3(a >> 2, 0, b >> 2, L.seed + 13) - 0.5) * 6;
  if (y >= top) return -1;
  const h = h3(a >> 3, y >> 3, b >> 3, L.seed + 14);
  return h < 0.25 ? RM.CRACKED : h < 0.35 ? RM.MARBLE : h < 0.45 ? M.GRAVEL : RM.RSTONE;
}

/** The broken chimney over the fallen corner: open where the heap was, rock round about. */
function chimney(L, P, a, y, b, cur) {
  const C = P.collapse, d = Math.hypot((a + 0.5 - C.a) / (C.rad * 0.8), (b + 0.5 - C.b) / (C.rad * 0.8));
  const lim = 1 - (y - 48) / 24 + (h3(a >> 2, y >> 2, b >> 2, L.seed + 15) - 0.5) * 0.4;
  if (d < lim) return 0;
  return -1;
}

/** A pressure plate's pit (one voxel under the slab) and its frame, or -1. */
function platePit(P, a, b) {
  for (const t of P.traps) if (Math.abs(a + 0.5 - t.a) < 3 && Math.abs(b + 0.5 - t.b) < 3) return 0; // a dart trap's plate
  for (const p of P.plates || []) {
    const da = Math.abs(a + 0.5 - p.a), db = Math.abs(b + 0.5 - p.b);
    if (da < p.h && db < p.h) return 0;
    if (da < p.h + 1 && db < p.h + 1) return RM.RDARK;
    if (da < p.h + 2 && db < p.h + 2) return RM.MOS_G;
  }
  return -1;
}

/** Pictures on the walls: the vault's mural over the altar, the dart trap's holes. -1: nothing. */
function wallArt(L, P, S, a, y, b) {
  if (P.mural && S === P.main && b === P.mural.b) {
    // three signs, two voxels a pixel, over the drums (read facing +b: right is -a)
    const py = y - P.mural.y0;
    if (py >= -2 && py < 16) {
      for (const gl of P.mural.glyphs) {
        const px = gl.a + 7 - a;
        if (px < -2 || px > 15) continue;
        if (py < 0 || py >= 14 || px < 0 || px >= 14) return RM.RDARK;
        return glyphPix(gl.g, Math.floor(px / 2), Math.floor(py / 2)) ? RM.GILT : RM.MOS_T;
      }
    }
  }
  for (const t of P.traps) {
    const f = t.from;
    if (Math.abs(a + 0.5 - f.a) < 4 && y >= f.y - 1 && y < f.y + 1 && b === (t.dir[1] < 0 ? f.b : f.b - 1)) {
      return Math.abs(a + 0.5 - f.a) < 2.5 && ((a + 0.5 - f.a + 2.5) | 0) % 2 === 0 ? 0 : (P.theme === 'deep' ? RM.XMORTAR : RM.DMORTAR);
    }
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

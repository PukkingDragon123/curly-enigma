// Old Star's house: the floor plan (meters, pure data). His home is dug into the rock beside a great
// glowing cavern, three worn steps down from your bedroom (the save's tile room, south of here):
//   the living room   the heart of it, straight down the steps: his fireplace, a round window on
//                     the glow garden, his armchair and the settee, bookshelves, the big rug
//   the kitchen       west, through a door: the cooking range (the cooking station), the pantry
//                     shelves, the sink and pump under its window, the dining table
//   the larder        down a step from the kitchen, south: cool stone, cheeses, barrels, jars
//   the smithy        north-west: the forge and its hood, bellows, anvil, quench trough, tool racks,
//                     and the box bed where he sleeps (warm from the forge)
//   the workshop      north of the smithy: his tinkering bench, the little railway, a loft of crates
//   the glow garden   north of the living room, under a skylight: Marigold's mushroom beds, a rill,
//                     her bench, and a hot spring bath in the corner
//   the terrace       out of the garden onto the cliff: the whole cavern below, a telescope
//   the hall          east: the cage lift down to the mine, the front door (the way to Deep Town),
//                     coats and boots, the Miners' Board, his old trunk, the coal cart, his dream wall
// Each room is a box (x0..x1, z0..z1) on the house floor; walls stand on the room's edges (rooms
// sit WALL apart, so a shared wall is WALL thick). Openings are cut by the side they're in: doors
// (shared by both rooms of a wall), round windows, the arch up to your room and the lift. The
// terrace is open (no walls or roof of its own: a balustrade and the cavern).
import { HALL, ARCH, SHAFT } from './units.js';

/** The house floor (m): the cave's old floor height, three steps below your room. */
export const FY = HALL.y;
/** Interior wall thickness (m). */
export const WALL = 0.2;
/** Voxels per meter for the house surfaces. */
export const VPM = 64;

/** The rooms: bounds (m), ceiling height above the floor (m), and their dressing. */
export const ROOMS = [
  { id: 'living', name: 'the living room', x0: -0.6, x1: 4.8, z0: -5.8, z1: HALL.z1, h: 2.3, wall: 'plaster', wains: 'sage', floor: 'oak', ceil: 'oak', plaster: 0xdcc69c },
  { id: 'kitchen', name: 'the kitchen', x0: -5.0, x1: -0.8, z0: -3.4, z1: HALL.z1, h: 2.2, wall: 'plaster', wains: 'tile', floor: 'terracotta', ceil: 'pine', plaster: 0xe2d0a6 },
  { id: 'smithy', name: 'the smithy', x0: -5.0, x1: -0.8, z0: -7.2, z1: -3.6, h: 2.45, wall: 'brick', wains: 'stone', floor: 'flag', ceil: 'sooty' },
  { id: 'hall', name: 'the hall', x0: 5.0, x1: SHAFT.x0, z0: -5.8, z1: HALL.z1, h: 2.2, wall: 'plaster', wains: 'oak', floor: 'pine', ceil: 'oak', plaster: 0xd2b88c },
  { id: 'garden', name: 'the glow garden', x0: -0.6, x1: 4.8, z0: -10.2, z1: -6.0, h: 3.5, wall: 'stone', floor: 'mossflag', ceil: 'oak', skylight: { x: 2.15, z: -8.1, r: 0.95 } },
  { id: 'terrace', name: 'the terrace', x0: -0.2, x1: 4.4, z0: -11.8, z1: -10.4, h: 4.6, open: true, walls: ['s', 'e', 'w'], wall: 'stone', sideWall: { e: 'rock', w: 'rock' }, floor: 'terrace' },
  { id: 'workshop', name: 'the workshop', x0: -5.0, x1: -0.8, z0: -10.2, z1: -7.4, h: 3.1, wall: 'plaster', wains: 'oak', floor: 'pine', ceil: 'pine', plaster: 0xd8c49a },
  { id: 'larder', name: 'the larder', x0: -5.0, x1: -1.4, z0: -0.11, z1: 2.7, h: 2.1, wall: 'stone', floor: 'flag', ceil: 'slab', cool: true },
];
export const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

/** Doorways between rooms (m): the wall they're in (x = for a wall along z, z = for one along x), centre, width, height. */
export const DOORS = [
  { id: 'kitchen', a: 'living', b: 'kitchen', x: -0.7, c: -1.75, w: 0.92, h: 1.44 },
  { id: 'smithy', a: 'living', b: 'smithy', x: -0.7, c: -4.75, w: 0.92, h: 1.44 },
  { id: 'back', a: 'kitchen', b: 'smithy', z: -3.5, c: -2.35, w: 0.92, h: 1.44 },
  { id: 'hall', a: 'living', b: 'hall', x: 4.9, c: -2.35, w: 1.0, h: 1.48 },
  { id: 'garden', a: 'living', b: 'garden', z: -5.9, c: 0.42, w: 0.9, h: 1.5 },
  { id: 'workshop', a: 'smithy', b: 'workshop', z: -7.3, c: -4.2, w: 0.86, h: 1.44 },
  { id: 'potting', a: 'workshop', b: 'garden', x: -0.7, c: -8.75, w: 0.86, h: 1.44 },
  { id: 'larder', a: 'kitchen', b: 'larder', z: -0.21, c: -2.0, w: 0.86, h: 1.4 },
  { id: 'terrace', a: 'garden', b: 'terrace', z: -10.3, c: 2.15, w: 1.9, h: 2.05, arch: true },
];

/** The front door to Deep Town, in the hall's north wall (m). */
export const FRONT_DOOR = { room: 'hall', side: 'n', c: 6.2, w: 0.74, h: 1.2 };

/** Round windows (m): room, side, centre along the wall, centre height over the floor, radius. */
export const WINDOWS = [
  { room: 'living', side: 'n', c: 3.65, cy: 0.98, r: 0.3 },
  { room: 'kitchen', side: 'w', c: -1.85, cy: 1.0, r: 0.3 },
  { room: 'hall', side: 'n', c: 7.22, cy: 0.98, r: 0.26 },
  { room: 'garden', side: 'n', c: 0.35, cy: 1.15, r: 0.36 },
  { room: 'garden', side: 'n', c: 3.95, cy: 1.15, r: 0.36 },
  { room: 'workshop', side: 'n', c: -2.9, cy: 1.35, r: 0.44 },
  { room: 'workshop', side: 'w', c: -8.8, cy: 1.0, r: 0.28 },
  { room: 'larder', side: 'w', c: 1.35, cy: 1.15, r: 0.22 },
];

/** Side of a room → the wall's line, which way it runs and which way it faces (into the room). */
export function sideInfo(r, side) {
  if (side === 'n') return { fixed: 'z', at: r.z0, a0: r.x0, a1: r.x1, nx: 0, nz: 1 };
  if (side === 's') return { fixed: 'z', at: r.z1, a0: r.x0, a1: r.x1, nx: 0, nz: -1 };
  if (side === 'w') return { fixed: 'x', at: r.x0, a0: r.z0, a1: r.z1, nx: 1, nz: 0 };
  return { fixed: 'x', at: r.x1, a0: r.z0, a1: r.z1, nx: -1, nz: 0 };
}

/**
 * The openings in one side of a room: [{ kind: 'door'|'arch'|'front'|'lift'|'window', c (m along),
 * w, h (m over the floor; windows: r, cy) }].
 */
export function openingsOf(r, side) {
  const S = sideInfo(r, side);
  const out = [];
  const near = (v, at) => Math.abs(v - at) < WALL;
  for (const d of DOORS) {
    if (d.a !== r.id && d.b !== r.id) continue;
    const kind = d.arch ? 'arch' : 'door';
    if (d.x !== undefined && S.fixed === 'x' && near(d.x, S.at)) out.push({ kind, id: d.id, c: d.c, w: d.w, h: d.h });
    if (d.z !== undefined && S.fixed === 'z' && near(d.z, S.at)) out.push({ kind, id: d.id, c: d.c, w: d.w, h: d.h });
  }
  if (r.id === 'living' && side === 's') out.push({ kind: 'arch', c: ARCH.x, w: ARCH.hw * 2, h: ARCH.h - FY });
  if (r.id === FRONT_DOOR.room && side === FRONT_DOOR.side) out.push({ kind: 'front', c: FRONT_DOOR.c, w: FRONT_DOOR.w, h: FRONT_DOOR.h });
  if (r.id === 'hall' && side === 'e') out.push({ kind: 'lift', c: (SHAFT.z0 + SHAFT.z1) / 2, w: SHAFT.z1 - SHAFT.z0, h: SHAFT.h });
  for (const w of WINDOWS) if (w.room === r.id && w.side === side) out.push({ kind: 'window', c: w.c, r: w.r, cy: w.cy, w: w.r * 2, h: w.cy + w.r });
  return out;
}

/** The room whose floor is at (x, z) (m), or null (walls, doorways and the rock between rooms). */
export function roomAt(x, z) {
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  return null;
}

/** In a doorway's gap through its wall (m)? */
export function doorAt(x, z) {
  for (const d of DOORS) {
    if (d.x !== undefined && Math.abs(x - d.x) <= WALL / 2 + 0.01 && Math.abs(z - d.c) <= d.w / 2) return d;
    if (d.z !== undefined && Math.abs(z - d.z) <= WALL / 2 + 0.01 && Math.abs(x - d.c) <= d.w / 2) return d;
  }
  return null;
}

/** The whole house's bounds (m), and the middle (for the cavern outside). */
export const BOUNDS = {
  x0: Math.min(...ROOMS.map((r) => r.x0)) - 0.4, x1: Math.max(...ROOMS.map((r) => r.x1)) + 1.6,
  z0: Math.min(...ROOMS.map((r) => r.z0)) - 0.4, z1: HALL.z1,
};
export const MID = { x: (BOUNDS.x0 + BOUNDS.x1) / 2, z: (BOUNDS.z0 + BOUNDS.z1) / 2 };

/** Is (x, z) out on the terrace (or its steps)? */
export function onTerrace(x, z) { const r = ROOM.terrace; return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; }

/**
 * The openings you can see one room from another through (for drawing only the rooms in view):
 * [{ a, b, box: [x0, y0, z0, x1, y1, z1] }]; b 'outside' for the cavern, 'bedroom' for your room.
 */
export function portals() {
  const out = [];
  const T2 = WALL / 2 + 0.02;
  for (const d of DOORS) {
    const h = FY + d.h, w = d.w / 2;
    if (d.x !== undefined) out.push({ a: d.a, b: d.b, box: [d.x - T2, FY, d.c - w, d.x + T2, h, d.c + w] });
    else out.push({ a: d.a, b: d.b, box: [d.c - w, FY, d.z - T2, d.c + w, h, d.z + T2] });
  }
  for (const w of WINDOWS) {
    const r = ROOM[w.room], S = sideInfo(r, w.side), y = FY + w.cy;
    const box = S.fixed === 'z' ? [w.c - w.r, y - w.r, S.at - 0.3, w.c + w.r, y + w.r, S.at + 0.3] : [S.at - 0.3, y - w.r, w.c - w.r, S.at + 0.3, y + w.r, w.c + w.r];
    // (a window may look into another room: the living room's into the garden, the garden's onto the terrace)
    const bx = S.fixed === 'z' ? w.c : S.at - S.nx * (WALL + 0.25), bz = S.fixed === 'z' ? S.at - S.nz * (WALL + 0.25) : w.c;
    const beyond = roomAt(bx, bz);
    out.push({ a: w.room, b: beyond ? beyond.id : 'outside', box });
    if (beyond?.open) out.push({ a: w.room, b: 'outside', box });
  }
  out.push({ a: 'living', b: 'bedroom', box: [ARCH.x - ARCH.hw, FY, HALL.z1 - 0.7, ARCH.x + ARCH.hw, ARCH.h, 0.05] });
  const t = ROOM.terrace;
  out.push({ a: 'terrace', b: 'outside', box: [t.x0 - 6, FY - 8, t.z0 - 30, t.x1 + 6, FY + 12, t.z1] });
  const g = ROOM.garden, sk = g.skylight;
  out.push({ a: 'garden', b: 'outside', box: [sk.x - sk.r, FY + g.h - 0.1, sk.z - sk.r, sk.x + sk.r, FY + g.h + 4, sk.z + sk.r] });
  return out;
}

// Old Star's house: the floor plan (meters, pure data). His home is dug into the rock beside a great
// glowing cavern, three worn steps down from your bedroom (the save's tile room, south of here):
//   the living room   the heart of it, straight down the steps: his fireplace between two round
//                     windows on the cavern, his armchair and the settee, bookshelves, the big rug
//   the kitchen       west, through a door: the cooking range (the cooking station), the pantry
//                     shelves, the sink and pump under its window, the dining table
//   the smithy        north-west: the forge and its hood, bellows, anvil, quench trough, tool racks,
//                     and the box bed where he sleeps (warm from the forge)
//   the hall          east: the cage lift down to the mine, the front door (the way to Deep Town),
//                     coats and boots, the Miners' Board, his old trunk, the coal cart, his dream wall
// Each room is a box (x0..x1, z0..z1) on the house floor; walls stand on the room's edges (rooms
// sit WALL apart, so a shared wall is WALL thick). Openings are cut by the side they're in: doors
// (shared by both rooms of a wall), round windows, the arch up to your room and the lift.
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
];
export const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

/** Doorways between rooms (m): the wall they're in (x = for a wall along z, z = for one along x), centre, width, height. */
export const DOORS = [
  { id: 'kitchen', a: 'living', b: 'kitchen', x: -0.7, c: -1.75, w: 0.92, h: 1.44 },
  { id: 'smithy', a: 'living', b: 'smithy', x: -0.7, c: -4.75, w: 0.92, h: 1.44 },
  { id: 'back', a: 'kitchen', b: 'smithy', z: -3.5, c: -2.35, w: 0.92, h: 1.44 },
  { id: 'hall', a: 'living', b: 'hall', x: 4.9, c: -2.35, w: 1.0, h: 1.48 },
];

/** The front door to Deep Town, in the hall's north wall (m). */
export const FRONT_DOOR = { room: 'hall', side: 'n', c: 6.2, w: 0.74, h: 1.2 };

/** Round windows on the cavern (m): room, side, centre along the wall, centre height over the floor, radius. */
export const WINDOWS = [
  { room: 'living', side: 'n', c: 0.55, cy: 0.98, r: 0.3 },
  { room: 'living', side: 'n', c: 3.65, cy: 0.98, r: 0.3 },
  { room: 'kitchen', side: 'w', c: -1.85, cy: 1.0, r: 0.3 },
  { room: 'smithy', side: 'n', c: -4.25, cy: 1.05, r: 0.3 },
  { room: 'hall', side: 'n', c: 7.22, cy: 0.98, r: 0.26 },
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
    if (d.x !== undefined && S.fixed === 'x' && near(d.x, S.at)) out.push({ kind: 'door', id: d.id, c: d.c, w: d.w, h: d.h });
    if (d.z !== undefined && S.fixed === 'z' && near(d.z, S.at)) out.push({ kind: 'door', id: d.id, c: d.c, w: d.w, h: d.h });
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

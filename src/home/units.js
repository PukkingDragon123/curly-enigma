// Units for home in first person. Home is one small, old cave: Old Star's hollow (his forge and
// anvil, the fire pit, his trunk, the lift, the old door to Deep Town, your bedroll on the floor)
// and, once they're dug out, the alcoves round it that are yours to furnish (src/home/nooks.js).
// Everything is on one floor (y = 0). The alcoves lie on the save's tile grid (0.5 m tiles, origin
// at the world's origin), built in tile units inside one group scaled to meters, so every iso model
// (1/32-tile voxels = 1/64 m) drops in unchanged; the hollow itself sits north of the grid (z < 0).
// Physics, lights, the camera and particles live in meters (docs/FPS.md).

/** Meters per tile. */
export const T = 0.5;
/** Wall/ceiling voxels per tile (1/64 m). */
export const VPT = 32;
/** Highest a wall piece may hang in an alcove (m): where the rock starts to vault over. */
export const CEIL = 2.0;
/** Ceiling height in wall voxels. */
export const WALL_V = Math.round((CEIL / T) * VPT);
/** Wall thickness behind the nominal face (voxels). */
export const FACE = 12;
/** Tile → meters and back. */
export const m = (tiles) => tiles * T;
export const tl = (meters) => meters / T;
/** Old tunnel mouths (from saves that dug out of the old burrow): half width and height (m). */
export const MOUTH_HW = 0.32;
export const MOUTH_H = 1.08;
/** The old passage's door to Deep Town (m). */
export const DOOR_HW = 0.36;
export const DOOR_H = 1.18;

/** The tile grid the alcoves are dug into (tiles): x 0..W, z 0..D. */
export const GRID = { W: 18, D: 10 };

// ---------------------------------------------------------------- Old Star's hollow (meters)
/** One relief voxel (m) for props built at 1/64 m. */
export const VX = 1 / 64;
/** The hollow: its rough bounds and the floor height (HALL keeps its old name). */
export const HALL = { x0: 2.2, x1: 8.1, z0: -4.4, z1: -0.55, y: 0, ceil: 1.95 };
/** (Old: the steps down from your room. One floor now: kept out of the way for old checks.) */
export const STEP_H = 0;
export const STEP_D = 0.3;
/** The way into your sleeping alcove from the hollow (m): the middle of its neck, half width, height. */
export const ARCH = { x: 4.5, hw: 0.45, h: 1.35 };
/** (Old: the stairs. None now: a box nobody stands in.) */
export const STAIRS = { x0: -99, x1: -98.5, z0: 99, z1: 99.5 };
/** The lift shaft in the east rock (m): its well, top and pit, and the height of its portal. */
export const SHAFT = { x0: 8.05, x1: 8.05 + 74 / 64, z0: -2.85, z1: -2.85 + 74 / 64, top: 3.7, pit: -2.9, h: 88 / 64 };
/** The old door to Deep Town in the north rock (m): centre x, its face (z), half width, height. */
export const FRONT = { x: 6.55, z: -4.3, hw: 0.37, h: 1.2 };
/** The hole you fell through, up in the roof (m). */
export const HOLE = { x: 4.65, z: -1.95, r: 0.4 };

/** Floor height (m) under (x, z): one floor everywhere. */
export function floorAt() { return 0; }

/** The curtain of sacking across the neck of your sleeping alcove, once it's dug (m; cloth: campCloth.js). */
export const ROOM_CURTAINS = {
  arch: { x: ARCH.x, z: -0.2, y: 1.22, hw: 0.4 },
};

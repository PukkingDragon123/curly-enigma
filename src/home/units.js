// Units for home in first person: your room (the old side chamber off Old Star's cave workshop) is
// laid out on the save's tile grid (furniture footprints, floors, wall slots) and built in tile
// units inside one group scaled to meters, so every iso model (1/32-tile voxels = 1/64 m) drops in
// unchanged; the cave north of it is fixed (meters below). Physics, lights, the camera and
// particles live in meters (docs/FPS.md).

/** Meters per tile: a 10×8-tile burrow is 5×4 m. */
export const T = 0.5;
/** Wall/ceiling voxels per tile (1/64 m). */
export const VPT = 32;
/** Underside of the ceiling boards (m). */
export const CEIL = 2.25;
/** Ceiling height in wall voxels. */
export const WALL_V = Math.round((CEIL / T) * VPT);
/** Wall thickness behind the nominal face (voxels). */
export const FACE = 12;
/** Tile → meters and back. */
export const m = (tiles) => tiles * T;
export const tl = (meters) => meters / T;
/** Old tunnel mouths in your room's walls (from saves that dug out): half width and height (m). */
export const MOUTH_HW = 0.32;
export const MOUTH_H = 1.08;
/** The old passage's door to Deep Town (m). */
export const DOOR_HW = 0.36;
export const DOOR_H = 1.18;

// ---------------------------------------------------------------- Old Star's cave workshop
// The cave lies north of your room (z < 0), down three worn stone steps through a carved arch of
// the old ones. Everything in meters. HALL keeps its old name: the cave's bounds and floor height.
/** One relief voxel (m) for props built at 1/64 m. */
export const VX = 1 / 64;
/** The cave: floor height, the box it fits in, and the top of its dome (m). */
export const HALL = { x0: -5.4, x1: 11.6, z0: -11.6, z1: -0.31, y: -0.5, ceil: 3.4 };
/** Height of one step down into the cave (m) and the depth of a tread. */
export const STEP_H = 0.5 / 3;
export const STEP_D = 0.3;
/** The archway in the room's north wall down into the cave (m): centre x, half width, height. */
export const ARCH = { x: 2.5, hw: 0.38, h: 1.26 };
/** The stairs from the arch down into the cave (m): two treads, three risers. */
export const STAIRS = { x0: 2.0, x1: 3.0, z0: HALL.z1 - 2 * STEP_D, z1: HALL.z1 };
/** The lift shaft in the cave's east wall (m): its well, top and pit, and the height of its portal. */
export const SHAFT = { x0: 9.5, x1: 9.5 + 74 / 64, z0: -4.95, z1: -4.95 + 74 / 64, top: 3.3, pit: -3.4, h: 88 / 64 };
/** The old passage to Deep Town in the cave's north wall (m): centre x, its mouth (z), half width, height. */
export const FRONT = { x: 3.25, z: -10.05, hw: 0.5, h: 1.2 };
/** The hole you fell through, in the cave roof (m). */
export const HOLE = { x: 4.35, z: -3.7, r: 0.62 };

/** Floor height (m) under (x, z): your room and the arch at 0, the steps, the cave below. */
export function floorAt(x, z) {
  if (z >= HALL.z1 - 1e-4) return 0;
  if (x >= STAIRS.x0 && x <= STAIRS.x1 && z >= STAIRS.z0) return -Math.ceil((HALL.z1 - z) / STEP_D - 1e-6) * STEP_H;
  return HALL.y;
}

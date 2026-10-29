// Units for home in first person: your room (the bedroom up the steps from Old Star's house) is
// laid out on the save's tile grid (furniture footprints, floors, wall slots) and built in tile
// units inside one group scaled to meters, so every iso model (1/32-tile voxels = 1/64 m) drops in
// unchanged; the house north of it is fixed (meters below). Physics, lights, the camera and
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

// ---------------------------------------------------------------- Old Star's house
// The house lies north of your room (z < 0), down three worn steps through the doorway in your
// north wall (its rooms: plan.js). Everything in meters. HALL keeps its old name: the bounds of the
// whole house and its floor height.
/** One relief voxel (m) for props built at 1/64 m. */
export const VX = 1 / 64;
/** The house: floor height, the box it fits in, and the top of its highest ceiling (m). */
export const HALL = { x0: -5.4, x1: 9.6, z0: -7.6, z1: -0.31, y: -0.5, ceil: 2.0 };
/** Height of one step down into the house (m) and the depth of a tread. */
export const STEP_H = 0.5 / 3;
export const STEP_D = 0.3;
/** The doorway in your room's north wall down into the house (m): centre x, half width, height. */
export const ARCH = { x: 2.5, hw: 0.38, h: 1.26 };
/** The stairs from the doorway down into the living room (m): two treads, three risers. */
export const STAIRS = { x0: 2.0, x1: 3.0, z0: HALL.z1 - 2 * STEP_D, z1: HALL.z1 };
/** The lift shaft behind the hall's east wall (m): its well, top and pit, and the height of its portal. */
export const SHAFT = { x0: 7.8, x1: 7.8 + 74 / 64, z0: -3.95, z1: -3.95 + 74 / 64, top: 3.3, pit: -3.4, h: 88 / 64 };
/** The front door to Deep Town in the hall's north wall (m): centre x, the wall (z), half width, height. */
export const FRONT = { x: 6.2, z: -5.8, hw: 0.37, h: 1.2 };
/** The hole you fell through, boarded over in the living room's ceiling (m). */
export const HOLE = { x: 3.7, z: -1.45, r: 0.42 };

/** Floor height (m) under (x, z): your room and the arch at 0, the steps, the cave below. */
export function floorAt(x, z) {
  if (z >= HALL.z1 - 1e-4) return 0;
  if (x >= STAIRS.x0 && x <= STAIRS.x1 && z >= STAIRS.z0) return -Math.ceil((HALL.z1 - z) / STEP_D - 1e-6) * STEP_H;
  return HALL.y;
}

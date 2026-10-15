// Units for the first-person burrow. The room is laid out on the save's tile grid (furniture
// footprints, floors, wall slots) and built in tile units inside one group scaled to meters, so
// every iso model (1/32-tile voxels = 1/64 m) drops in unchanged. Physics, lights, the camera and
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
/** Tunnel mouths cut through the walls: half width and height (m) — a doorway for a 0.86 m mole. */
export const MOUTH_HW = 0.32;
export const MOUTH_H = 1.08;
/** The burrow door to Deep Town (m). */
export const DOOR_HW = 0.36;
export const DOOR_H = 1.18;

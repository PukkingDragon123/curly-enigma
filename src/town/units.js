// Deep Town in first person: the town is modelled in "town units" (TU), the tile units of the
// old iso town, where an adult mole rig stands 1.375 TU tall. The whole town hangs under one
// root group scaled by M so that mole stands 0.86 m (docs/FPS.md); physics, the camera, lights,
// fog and the merged statics live in meters.
import * as THREE from 'three';

/** Meters per town unit. */
export const M = 0.86 / 1.375;
/** Town units per meter. */
export const IM = 1 / M;

/** TU → meters (Vector3, in place). */
export function toWorld(v, out = v) { return out.set(v.x * M, v.y * M, v.z * M); }
/** meters → TU (Vector3, in place). */
export function toTown(v, out = v) { return out.set(v.x * IM, v.y * IM, v.z * IM); }

export const _v = new THREE.Vector3();

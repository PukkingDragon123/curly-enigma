// The old miners' trails are gone (wave 4: no human works in the caves; burrows are reached by
// natural passages, gen/passages.js, and the old ones' ruins became dungeons). The generator no
// longer makes plan features of kind 'trail'; these few exports stay for code that still imports
// them (Vegetation's trodden floors, the quests' cave-in markers) and simply never finds a trail.

export const TRAIL_W = 1.3; // meters, wall to wall (as the trails were)
export const TRAIL_H = 1.6;

/** The bounding box of a trail segment (meters). */
export function trailBB(f) {
  const w = (f.w || TRAIL_W) / 2 + 0.5, h = (f.h || TRAIL_H) + 0.5;
  return [Math.min(f.a.x, f.b.x) - w, Math.min(f.a.y, f.b.y) - 0.5, Math.min(f.a.z, f.b.z) - w, Math.max(f.a.x, f.b.x) + w, Math.max(f.a.y, f.b.y) + h, Math.max(f.a.z, f.b.z) + w];
}

/** A trail segment's cave-in: there are none any more. */
export function trailCollapse() { return null; }

/** No lanterns along trails any more. */
export function trailLanterns() { return []; }

/** Nothing to stamp. */
export function stampTrail() {}

/** Loose stuff (gravel, sand, ash, snow, rubble) pours once disturbed. */
export { granM as looseM } from '../materials.js';

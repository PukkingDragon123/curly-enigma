// Character helpers for the bookend scenes (thin wrappers over gfx/characters.js).
import { makeCharacter, playerSpec, makeChicken } from '../gfx/characters.js';

const BRIMMED = new Set(['helmet', 'hardhat', 'cap']);

/**
 * Brimmed hats sit right over the eyes in characters.js, so at eye level only the black
 * pupils peek out from under the brim. Nudge the eyes (and remember the offset) down one
 * voxel so faces read. Local workaround; see the report for the suggested shared fix.
 */
export function fixEyes(rig) {
  if (!rig || !rig.spec || !BRIMMED.has(rig.spec.hat)) return rig;
  for (const e of rig.eyes) e.position.y -= rig.s;
  rig.eyeDrop = rig.s;
  return rig;
}

/** The player mole, faces fixed. */
export function makeMole(opts = {}) {
  return fixEyes(makeCharacter(playerSpec(), opts));
}

/** Any townsfolk, faces fixed. */
export function makeFolk(spec, opts = {}) {
  return fixEyes(makeCharacter(spec, opts));
}

export { makeChicken };

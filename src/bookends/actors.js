// Character helpers for the bookend scenes (thin wrappers over gfx/characters.js).
import { makeCharacter, playerSpec, makeChicken } from '../gfx/characters.js';

/** Faces used to need a nudge under brimmed hats; characters.js now seats hats higher. */
export function fixEyes(rig) {
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

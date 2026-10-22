// Character helpers for the bookend scenes (thin wrappers over gfx/characters.js).
import { makeCharacter, makeChicken } from '../gfx/characters.js';
import { makeHeroMole } from '../gfx/char/hero.js';

/** Faces used to need a nudge under brimmed hats; characters.js now seats hats higher. */
export function fixEyes(rig) {
  return rig;
}

/**
 * The player: the blacksmith hero, built at the classic player rig's size (1.375 units, so rig.s
 * is 1/16 like before). opts: { scale, kind, pack (default false), hammer (default true) }.
 */
export function makeMole(opts = {}) {
  return makeHeroMole({ height: 1.375 * (opts.scale ?? 1), kind: opts.kind, pack: opts.pack ?? false, hammer: opts.hammer ?? true });
}

/** Any townsfolk, faces fixed. */
export function makeFolk(spec, opts = {}) {
  return fixEyes(makeCharacter(spec, opts));
}

export { makeChicken };

// Forge pieces: small things you hammer out at the home forge (heat the metal, hammer it to shape,
// quench the hard ones: src/forge/parts.js) that become something else when done. Your first
// pickaxe (Old Star's first lesson) is one: the piece is made once, then handed over and equipped.
//
//   FORGE_PIECES[id] = { name, track, level, metal, ingots: { id: n }, extra: { id: n }, strikes,
//                        quench (bool: harden it in the bucket), kg, value, gives (item id), desc }

export const FORGE_PIECES = {
  // wave 16: the Builder's Hammer is made, not given: a copper head on a haft split from a log
  // (bonus: Old Star's timber, handed over the first time it's made)
  hammer_build: { name: 'Builder\'s Hammer', track: 'tool', level: 1, metal: 'copper', ingots: { copper_ingot: 1 }, extra: { blk_log: 1 }, strikes: 5, kg: 0.9, value: 12, gives: 'builder_hammer', bonus: { blk_planks: 8, blk_log: 2 }, desc: 'A copper head on a log-split haft. Pieces go up under it.' },
  pick_first: { name: 'Your First Pickaxe', track: 'tool', level: 1, metal: 'copper', ingots: { copper_ingot: 2 }, strikes: 6, kg: 1.4, value: 20, gives: 'pick_first', desc: 'Copper head, ash haft. Your own work.' },
};
/** A forge piece by id (or undefined). */
export const pieceOf = (id) => FORGE_PIECES[id];

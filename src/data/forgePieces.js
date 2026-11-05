// Forge pieces: small things you hammer out at the home forge (heat the metal, hammer it to shape,
// quench the hard ones: src/forge/parts.js) that become something else when done. Your first
// pickaxe (Old Star's first lesson) is one: the piece is made once, then handed over and equipped.
//
//   FORGE_PIECES[id] = { name, track, level, metal, ingots: { id: n }, extra: { id: n }, strikes,
//                        quench (bool: harden it in the bucket), kg, value, gives (item id), desc }

export const FORGE_PIECES = {
  pick_first: { name: 'Your First Pickaxe', track: 'tool', level: 1, metal: 'copper', ingots: { copper_ingot: 2 }, strikes: 6, kg: 1.4, value: 20, gives: 'pick_first', desc: 'A copper pick head on an ash haft, hammered out at Old Star\'s forge.' },
};
/** A forge piece by id (or undefined). */
export const pieceOf = (id) => FORGE_PIECES[id];

// Forge pieces: small things you hammer out at the home forge (heat the metal, hammer it to shape,
// quench the hard ones: src/forge/parts.js) that become something else when done. Your first
// pickaxe (Old Star's first lesson) is one: the piece is made once, then handed over and equipped.
//
//   FORGE_PIECES[id] = { name, track, level, metal, ingots: { id: n }, extra: { id: n }, strikes,
//                        quench (bool: harden it in the bucket), kg, value, gives (item id), desc,
//                        pick: true (a rung of the pick ladder: the forge board's Pick card) }
// Wave 21 (docs/DESIGN_PROGRESSION.md): every pick past the first is made here too, from the metal
// of the layer it opens, and the iron and steel ones round a warden's heart. A card on Old Star's
// board opens the bronze pattern (data/way.js patternOpen).

export const FORGE_PIECES = {
  // wave 16: the Builder's Hammer is made, not given: a copper head on a haft split from a log
  // (bonus: Old Star's timber, handed over the first time it's made)
  hammer_build: { name: 'Builder\'s Hammer', track: 'tool', level: 1, metal: 'copper', ingots: { copper_ingot: 1 }, extra: { blk_log: 1 }, strikes: 5, kg: 0.9, value: 12, gives: 'builder_hammer', bonus: { blk_planks: 8, blk_log: 2 }, desc: 'A copper head on a log-split haft. Pieces go up under it.' },
  pick_first: { name: 'Your First Pickaxe', track: 'tool', level: 1, metal: 'copper', ingots: { copper_ingot: 2 }, strikes: 6, kg: 1.4, value: 20, gives: 'pick_first', desc: 'Copper head, ash haft. Your own work.' },
  pick_copper: { name: 'Bronze Pickaxe', track: 'tool', level: 2, metal: 'bronze', ingots: { bronze_ingot: 2 }, strikes: 7, kg: 1.5, value: 80, gives: 'pick_copper', pick: true, desc: 'Copper and tin, harder than either.' },
  pick_iron: { name: 'Iron Pickaxe', track: 'tool', level: 3, metal: 'iron', ingots: { iron_ingot: 3 }, extra: { clay_heart: 1 }, strikes: 8, quench: true, kg: 1.7, value: 500, gives: 'pick_iron', pick: true, desc: 'Iron round the Clay Warden\'s heart.' },
  pick_steel: { name: 'Steel Pickaxe', track: 'tool', level: 4, metal: 'steel', ingots: { steel_ingot: 3 }, extra: { grotto_heart: 1 }, strikes: 9, quench: true, kg: 1.8, value: 2500, gives: 'pick_steel', pick: true, desc: 'Steel round the Grotto Warden\'s heart.' },
  pick_mithril: { name: 'Mithril Pickaxe', track: 'tool', level: 5, metal: 'mithril', ingots: { mithril_ingot: 3 }, strikes: 9, quench: true, kg: 1.2, value: 15000, gives: 'pick_mithril', pick: true, desc: 'Light as a spoon.' },
  pick_adamant: { name: 'Adamant Pickaxe', track: 'tool', level: 6, metal: 'adamant', ingots: { adamant_ingot: 3 }, strikes: 10, quench: true, kg: 2, value: 40000, gives: 'pick_adamant', pick: true, desc: 'Bites anything.' },
  pick_starmetal: { name: 'Starmetal Pickaxe', track: 'tool', level: 7, metal: 'starmetal', ingots: { starmetal_ingot: 3 }, strikes: 10, quench: true, kg: 1.6, value: 110000, gives: 'pick_starmetal', pick: true, desc: 'Core rock gives like wet clay.' },
};
/** A forge piece by id (or undefined). */
export const pieceOf = (id) => FORGE_PIECES[id];

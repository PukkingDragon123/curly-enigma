// Coop parts: the upgrades for Nugget's walking coop are things you make at the home forge
// (heat the metal, hammer it to shape, quench the hard ones: src/forge/parts.js) and then build
// onto the coop yourself (the coop side of the backpack: Install). Each part is the next level of
// one upgrade track (core/weight.js COOP_UP); install them in order. A part is a quality item (q
// = the forging score): a finer part works a little better (×0.9 at q 0 … ×1.1 at q 100 on its
// track's kg / speed / lay numbers).
//
//   COOP_PARTS[id] = { name, track, level, metal, ingots: { id: n }, extra: { id: n }, strikes,
//                      quench (bool: harden it in the bucket), kg (its weight), value, desc }
// They register into ITEMS as cat 'part' (icon { k: 'cooppart', t: track, metal }), and take
// pockets like anything else (they're heavy: carry them home or put them on the coop).

export const COOP_PARTS = {
  // shelves: brackets and racks bolted on the walls
  shelf_copper: { name: 'Copper Shelf Brackets', track: 'shelves', level: 1, metal: 'copper', ingots: { copper_ingot: 1 }, strikes: 6, kg: 0.8, value: 90, desc: 'Three more cubbies on the coop wall.' },
  shelf_bronze: { name: 'Bronze Shelf Brackets', track: 'shelves', level: 2, metal: 'bronze', ingots: { bronze_ingot: 2 }, strikes: 8, kg: 1.2, value: 300, desc: 'A second row of cubbies under the eaves.' },
  shelf_iron: { name: 'Iron Shelf Rack', track: 'shelves', level: 3, metal: 'iron', ingots: { iron_ingot: 3 }, strikes: 10, quench: true, kg: 2.2, value: 420, desc: 'A rack strapped round the back: six more cubbies.' },
  shelf_steel: { name: 'Steel Cargo Rack', track: 'shelves', level: 4, metal: 'steel', ingots: { steel_ingot: 3 }, strikes: 12, quench: true, kg: 2.6, value: 900, desc: 'A roof rack for the long digs: nine more cubbies.' },
  // legs: bands, shoes and braces for her big scaly legs
  legs_copper: { name: 'Copper Leg Bands', track: 'legs', level: 1, metal: 'copper', ingots: { copper_ingot: 2 }, strikes: 7, kg: 1.0, value: 120, desc: 'Bands round the knees: she carries more and steps livelier.' },
  legs_iron: { name: 'Iron-shod Talons', track: 'legs', level: 2, metal: 'iron', ingots: { iron_ingot: 3 }, strikes: 10, quench: true, kg: 2.0, value: 450, desc: 'Iron shoes on her toes: a sure grip under a heavy load.' },
  legs_steel: { name: 'Steel Leg Braces', track: 'legs', level: 3, metal: 'steel', ingots: { steel_ingot: 4 }, strikes: 12, quench: true, kg: 2.8, value: 1300, desc: 'Sprung braces from hip to hock: she hops ledges with a full coop.' },
  legs_mithril: { name: 'Mithril Spurs', track: 'legs', level: 4, metal: 'mithril', ingots: { mithril_ingot: 3 }, strikes: 14, quench: true, kg: 1.4, value: 6000, desc: 'Featherlight and unbendable. She could carry the forge.' },
  // nest box: a warmer, comfier nest
  nest_tin: { name: 'Tin Nest Box', track: 'nest', level: 1, metal: 'tin', ingots: { tin_ingot: 1 }, strikes: 5, kg: 0.6, value: 80, desc: 'A snug box for the window: she lays more often.' },
  nest_bronze: { name: 'Bronze Warming Pan', track: 'nest', level: 2, metal: 'bronze', ingots: { bronze_ingot: 2 }, strikes: 8, kg: 1.0, value: 320, desc: 'Warm straw all day long.' },
  nest_silver: { name: 'Silver Nest Bell', track: 'nest', level: 3, metal: 'silver', ingots: { silver_ingot: 2 }, strikes: 9, kg: 0.9, value: 800, desc: 'It rings softly. Hens love it. Nobody knows why.' },
  // the ore chute: what you dig rolls onto her shelves when your pack is full or too heavy
  chute_copper: { name: 'Copper Ore Chute', track: 'chute', level: 1, metal: 'copper', ingots: { copper_ingot: 3 }, strikes: 9, kg: 1.6, value: 260, desc: 'A funnel on her roof and a chute to the shelves: when your pack is full or too heavy, what you dig rolls straight onto her shelves (if she\'s within 7 m).' },
  // the roof lantern
  lamp_tin: { name: 'Tin Roof Lantern', track: 'lamp', level: 1, metal: 'tin', ingots: { tin_ingot: 1 }, strikes: 5, kg: 0.5, value: 90, desc: 'A lantern on her ridge lights the tunnel around her.' },
  lamp_lumite: { name: 'Lumite Roof Lantern', track: 'lamp', level: 2, metal: 'iron', ingots: { iron_ingot: 1 }, extra: { lumite: 2 }, strikes: 7, kg: 0.8, value: 520, desc: 'Lumite behind iron bars: a big green glow you can see down the tunnel.' },
};
/** The part that brings a track to `level` (or undefined). */
export function partFor(track, level) {
  for (const [id, p] of Object.entries(COOP_PARTS)) if (p.track === track && p.level === level) return id;
  return undefined;
}

/** Item entries for ITEMS (cat 'part'). */
export function partItems() {
  const out = {};
  for (const [id, p] of Object.entries(COOP_PARTS)) {
    out[id] = { name: p.name, cat: 'part', q: true, kg: p.kg, value: p.value, stack: 4, coopPart: true, icon: { k: 'cooppart', t: p.track, metal: p.metal, level: p.level }, desc: p.desc };
  }
  return out;
}

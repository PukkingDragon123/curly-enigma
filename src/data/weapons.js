// Forging data: metals, weapon types, grades, infusions and blueprints.
// The forge scene, the assay office and the index book all read from here.

/**
 * Metal working data. Temperatures in °C.
 * work:   forging range where hammer blows move metal cleanly
 * burn:   above this the grain coarsens and the steel "burns" (quality loss)
 * quench: window for hardening; null = metal does not harden by quenching
 * heat:   relative heating speed in the forge (soft metals heat faster)
 * flow:   how far a blow moves metal at ideal heat (soft metals move more)
 */
export const METALS = {
  copper: { name: 'Copper', ingot: 'copper_ingot', ore: 'copper_ore', work: [550, 880], burn: 1000, quench: null, heat: 1.25, flow: 1.25, color: 0xd9773f, hard: 0.35 },
  tin: { name: 'Tin', ingot: 'tin_ingot', ore: 'tin_ore', work: [120, 200], burn: 230, quench: null, heat: 1.6, flow: 1.6, color: 0xbfc3c4, hard: 0.1 },
  bronze: { name: 'Bronze', ingot: 'bronze_ingot', work: [600, 850], burn: 940, quench: null, heat: 1.15, flow: 1.1, color: 0xc98a3a, hard: 0.5 },
  iron: { name: 'Iron', ingot: 'iron_ingot', ore: 'iron_ore', work: [900, 1250], burn: 1350, quench: [760, 900], heat: 1.0, flow: 1.0, color: 0x8a8f96, hard: 0.6 },
  steel: { name: 'Steel', ingot: 'steel_ingot', work: [950, 1200], burn: 1280, quench: [770, 860], heat: 0.95, flow: 0.9, color: 0xa7b4c2, hard: 0.8 },
  silver: { name: 'Silver', ingot: 'silver_ingot', ore: 'silver_ore', work: [500, 760], burn: 860, quench: null, heat: 1.2, flow: 1.3, color: 0xd8dde6, hard: 0.4 },
  gold: { name: 'Gold', ingot: 'gold_ingot', ore: 'gold_ore', work: [600, 860], burn: 960, quench: null, heat: 1.2, flow: 1.4, color: 0xf2c23a, hard: 0.3 },
  mithril: { name: 'Mithril', ingot: 'mithril_ingot', ore: 'mithril_ore', work: [1100, 1400], burn: 1500, quench: [950, 1060], heat: 0.85, flow: 0.95, color: 0x9fe0e6, hard: 0.9 },
  moonsilver: { name: 'Moonsilver', ingot: 'moonsilver_ingot', ore: 'moonsilver_ore', work: [700, 960], burn: 1060, quench: [800, 890], heat: 1.05, flow: 1.15, color: 0xe4e8ff, hard: 0.75 },
  adamant: { name: 'Adamant', ingot: 'adamant_ingot', ore: 'adamant_ore', work: [1400, 1700], burn: 1820, quench: [1200, 1310], heat: 0.7, flow: 0.7, color: 0x4fd9a0, hard: 1.0 },
  starmetal: { name: 'Starmetal', ingot: 'starmetal_ingot', ore: 'starmetal_ore', work: [1550, 1850], burn: 1980, quench: [1300, 1420], heat: 0.65, flow: 0.8, color: 0xffe08a, hard: 1.0 },
};

/**
 * Smelting recipes (at the home forge). Ore + coal → ingots.
 * temp: crucible temperature band the bellows must hold.
 */
export const SMELTING = [
  { id: 'smelt_copper', out: 'copper_ingot', n: 1, inputs: { copper_ore: 2 }, coal: 1, temp: [1085, 1200] },
  { id: 'smelt_tin', out: 'tin_ingot', n: 1, inputs: { tin_ore: 2 }, coal: 1, temp: [232, 400] },
  { id: 'smelt_bronze', out: 'bronze_ingot', n: 2, inputs: { copper_ore: 3, tin_ore: 1 }, coal: 1, temp: [950, 1100] },
  { id: 'smelt_iron', out: 'iron_ingot', n: 1, inputs: { iron_ore: 2 }, coal: 1, temp: [1250, 1450] },
  { id: 'smelt_steel', out: 'steel_ingot', n: 1, inputs: { iron_ore: 2 }, coal: 3, temp: [1370, 1520] },
  { id: 'smelt_silver', out: 'silver_ingot', n: 1, inputs: { silver_ore: 2 }, coal: 1, temp: [962, 1100] },
  { id: 'smelt_gold', out: 'gold_ingot', n: 1, inputs: { gold_ore: 2 }, coal: 1, temp: [1064, 1200] },
  { id: 'smelt_mithril', out: 'mithril_ingot', n: 1, inputs: { mithril_ore: 2 }, coal: 2, temp: [1450, 1600], forge: 1 },
  { id: 'smelt_moonsilver', out: 'moonsilver_ingot', n: 1, inputs: { moonsilver_ore: 2 }, coal: 2, temp: [1100, 1250] },
  { id: 'smelt_adamant', out: 'adamant_ingot', n: 1, inputs: { adamant_ore: 2 }, coal: 3, temp: [1750, 1900], forge: 2 },
  { id: 'smelt_starmetal', out: 'starmetal_ingot', n: 1, inputs: { starmetal_ore: 2 }, coal: 3, temp: [1850, 1990], forge: 2 },
];

/** Maximum forge/crucible temperature by forge level (upgraded via blueprints). */
export const FORGE_MAX_TEMP = [1550, 1800, 2050];

/**
 * Weapon types. ingots = ingots consumed; mult = value multiplier;
 * balance = ideal balance point as a fraction of blade length measured from the guard
 * (0 = at the guard, 1 = at the tip). profile = target blade silhouette, half-widths
 * from guard (index 0) to tip, in "voxel" units 0..6; used by the forge's shaping step.
 */
export const WEAPON_TYPES = {
  dagger: { name: 'Dagger', ingots: 1, mult: 1.6, balance: 0.12, profile: [3, 3, 3, 2.5, 2, 1.2, 0.5] },
  shortsword: { name: 'Shortsword', ingots: 2, mult: 1.8, balance: 0.18, profile: [3, 3, 3, 3, 2.8, 2.6, 2.2, 1.6, 0.8] },
  axe: { name: 'Hand Axe', ingots: 2, mult: 1.9, balance: 0.7, profile: [1.5, 1.5, 1.5, 1.5, 2, 4, 5.5, 5.5, 4] },
  mace: { name: 'Mace', ingots: 3, mult: 2.0, balance: 0.78, profile: [1.5, 1.5, 1.5, 1.5, 1.5, 3, 4.5, 4.5, 3] },
  spear: { name: 'Spear', ingots: 2, mult: 2.1, balance: 0.42, profile: [1, 1, 1, 1, 1, 1, 1, 2.5, 3, 2, 0.8] },
  longsword: { name: 'Longsword', ingots: 3, mult: 2.3, balance: 0.16, profile: [3.2, 3.1, 3, 3, 2.9, 2.8, 2.7, 2.5, 2.2, 1.8, 1.2, 0.5] },
  warhammer: { name: 'Warhammer', ingots: 4, mult: 2.4, balance: 0.82, profile: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 5, 5, 5, 3] },
  rapier: { name: 'Rapier', ingots: 2, mult: 2.6, balance: 0.08, profile: [2, 1.8, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1, 1, 0.9, 0.7, 0.5, 0.3] },
  greatsword: { name: 'Greatsword', ingots: 5, mult: 2.7, balance: 0.22, profile: [4, 4, 3.9, 3.8, 3.7, 3.6, 3.5, 3.3, 3.1, 2.8, 2.4, 1.8, 1.1, 0.5] },
  moleblade: { name: 'Moleblade', ingots: 4, mult: 3.2, balance: 0.55, profile: [1.5, 1.5, 1.5, 1.5, 2, 4.5, 5.5, 6, 6, 5.5, 3.5] },
};

export const GRADES = [
  { g: 'S', min: 92, mult: 2.0, color: '#ffd34a', word: 'Legendary' },
  { g: 'A', min: 80, mult: 1.55, color: '#8af07a', word: 'Masterwork' },
  { g: 'B', min: 66, mult: 1.2, color: '#7ad0ff', word: 'Fine' },
  { g: 'C', min: 50, mult: 0.9, color: '#e6dcc8', word: 'Sturdy' },
  { g: 'D', min: 34, mult: 0.6, color: '#d9a06a', word: 'Crude' },
  { g: 'F', min: 0, mult: 0.35, color: '#d96a5a', word: 'Wobbly' },
];

export function gradeFor(score) {
  for (const g of GRADES) if (score >= g.min) return g;
  return GRADES[GRADES.length - 1];
}

/** Special minerals added during forging. */
export const INFUSIONS = {
  lumite: { name: 'Glowing', bonus: 0.25, color: 0x9dff9a },
  obsidian_shard: { name: 'Keen', bonus: 0.2, color: 0x6b5a8a },
  gravium: { name: 'Featherlight', bonus: 0.35, color: 0xc9a6ff, balanceAssist: true },
  bioxide: { name: 'Thunder', bonus: 0.4, color: 0x7fe7ff, needs: 'zap' },
  echo_crystal: { name: 'Singing', bonus: 0.45, color: 0x9fd6ff },
  magmaite: { name: 'Blazing', bonus: 0.5, color: 0xff7a2a, needs: 'heat' },
  frostite: { name: 'Frozen', bonus: 0.6, color: 0xbff6ff, needs: 'cold' },
  sunstone: { name: 'Radiant', bonus: 0.8, color: 0xffd34a, needs: 'heat' },
  voidstone: { name: 'Void', bonus: 0.9, color: 0x7a3fd0 },
};

/** Gems that can be socketed in the pommel. */
export const SOCKET_GEMS = ['quartz', 'amber', 'amber_bug', 'amethyst', 'ruby', 'emerald', 'sapphire', 'diamond'];

/**
 * Weapon value. w = { type, metal, matQ (0-100 ingot quality), score (0-100), infusion?, gem?, gemQ? }
 * Needs ITEMS for ingot/gem base values (passed in to avoid a circular import).
 */
export function weaponValue(w, ITEMS) {
  const metal = METALS[w.metal];
  const type = WEAPON_TYPES[w.type];
  if (!metal || !type) return 0;
  const ingotVal = ITEMS[metal.ingot].value;
  const base = ingotVal * type.ingots * (0.4 + 0.6 * (w.matQ ?? 100) / 100);
  let v = base * type.mult * gradeFor(w.score ?? 50).mult;
  if (w.infusion && INFUSIONS[w.infusion]) v *= 1 + INFUSIONS[w.infusion].bonus;
  if (w.gem && ITEMS[w.gem]) v += ITEMS[w.gem].value * 1.5 * (0.4 + 0.6 * (w.gemQ ?? 100) / 100);
  return Math.round(v);
}

export function weaponName(w) {
  const metal = METALS[w.metal]?.name || '?';
  const type = WEAPON_TYPES[w.type]?.name || 'Weapon';
  const grade = gradeFor(w.score ?? 50);
  const inf = w.infusion && INFUSIONS[w.infusion] ? INFUSIONS[w.infusion].name + ' ' : '';
  const pre = grade.g === 'S' || grade.g === 'A' || grade.g === 'F' ? grade.word + ' ' : '';
  return `${pre}${inf}${metal} ${type}`;
}

/**
 * Blueprints sold by Professor Talpa. kind: weapon | forge | room
 */
export const BLUEPRINTS = {
  bp_dagger: { name: 'Dagger Plans', kind: 'weapon', weapon: 'dagger', price: 0, value: 0, icon: { k: 'blueprint', t: 'dagger' }, desc: 'A short blade. Every smith\'s first.' },
  bp_shortsword: { name: 'Shortsword Plans', kind: 'weapon', weapon: 'shortsword', price: 350, value: 0, icon: { k: 'blueprint', t: 'shortsword' }, desc: 'Handy in a tunnel.' },
  bp_axe: { name: 'Hand Axe Plans', kind: 'weapon', weapon: 'axe', price: 900, value: 0, icon: { k: 'blueprint', t: 'axe' }, desc: 'Head-heavy. Chops roots and arguments.' },
  bp_mace: { name: 'Mace Plans', kind: 'weapon', weapon: 'mace', price: 2200, value: 0, icon: { k: 'blueprint', t: 'mace' }, desc: 'A lump of metal on a stick, made properly.' },
  bp_spear: { name: 'Spear Plans', kind: 'weapon', weapon: 'spear', price: 4500, value: 0, icon: { k: 'blueprint', t: 'spear' }, desc: 'Long reach, balanced in the middle.' },
  bp_longsword: { name: 'Longsword Plans', kind: 'weapon', weapon: 'longsword', price: 9000, value: 0, icon: { k: 'blueprint', t: 'longsword' }, desc: 'The knightly classic.' },
  bp_warhammer: { name: 'Warhammer Plans', kind: 'weapon', weapon: 'warhammer', price: 20000, value: 0, icon: { k: 'blueprint', t: 'warhammer' }, desc: 'For very determined smiths.' },
  bp_rapier: { name: 'Rapier Plans', kind: 'weapon', weapon: 'rapier', price: 38000, value: 0, icon: { k: 'blueprint', t: 'rapier' }, desc: 'Needle-thin and unforgiving to forge.' },
  bp_greatsword: { name: 'Greatsword Plans', kind: 'weapon', weapon: 'greatsword', price: 70000, value: 0, icon: { k: 'blueprint', t: 'greatsword' }, desc: 'Five ingots of pure ambition.' },
  bp_moleblade: { name: 'Moleblade Plans', kind: 'weapon', weapon: 'moleblade', price: 160000, value: 0, icon: { k: 'blueprint', t: 'moleblade' }, desc: 'Half sword, half shovel, the legendary weapon of the first mole-kings.' },
  bp_bellows: { name: 'Double Bellows', kind: 'forge', level: 1, price: 6000, value: 0, icon: { k: 'blueprint', t: 'bellows' }, desc: 'Forge reaches 1800°C. Needed to smelt mithril.' },
  bp_magma_hearth: { name: 'Magma Hearth', kind: 'forge', level: 2, price: 45000, value: 0, icon: { k: 'blueprint', t: 'hearth' }, desc: 'Forge reaches 2050°C. Needed for adamant and starmetal.' },
  bp_room1: { name: 'Burrow Extension I', kind: 'room', level: 1, price: 1500, value: 0, icon: { k: 'blueprint', t: 'room' }, desc: 'Dig your home out to 12×10.' },
  bp_room2: { name: 'Burrow Extension II', kind: 'room', level: 2, price: 9000, value: 0, icon: { k: 'blueprint', t: 'room' }, desc: 'Dig your home out to 14×12.' },
  bp_room3: { name: 'Burrow Extension III', kind: 'room', level: 3, price: 40000, value: 0, icon: { k: 'blueprint', t: 'room' }, desc: 'A palatial 16×14 burrow.' },
};

export const ROOM_SIZES = [[10, 8], [12, 10], [14, 12], [16, 14]];

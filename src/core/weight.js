// Weight: everything that takes a pocket weighs something (kg). Ore and ingots are heavy, gems,
// herbs and grubs hardly count. What the mole can carry comfortably comes from the bag (its
// `carry` in items.js), the Carry skills and a couple of food buffs. Past that it slows down:
//
//   load / carry   walk     run   jump   notes
//   ≤ 0.6          ×1       yes   ×1
//   0.6 … 1        ×1→0.9   yes   ×1     "a good haul"
//   1 … 1.5        ×0.9→0.6 no    ×0.8   heavy: walking costs energy
//   1.5 … 2        ×0.6→0.4 no    ×0.5   overloaded
//   ≥ 2            ×0.35    no    ×0.4   nothing more goes in: take it home
import { ITEMS } from '../data/items.js';
import { WEAPON_TYPES } from '../data/weapons.js';

const KG_BY_CAT = { mineral: 1.1, gem: 0.12, ingot: 1.0, plant: 0.08, critter: 0.25, drop: 0.3, ingredient: 0.15, food: 0.3, consumable: 0.5 };
/** Per item, where the category's guess is wrong. Items may also set `kg` in items.js. */
const KG = {
  coal: 0.7, salt_crystal: 0.5, fossil: 1.6, lumite: 0.5, echo_crystal: 0.4, gravium: 0.2, bioxide: 0.5, obsidian_shard: 0.6,
  gold_ore: 1.8, silver_ore: 1.4, iron_ore: 1.3, copper_ore: 1.2, tin_ore: 1.1, mithril_ore: 0.9, moonsilver_ore: 1.2,
  adamant_ore: 1.6, starmetal_ore: 1.5, magmaite: 1.0, frostite: 0.5, voidstone: 1.4, sunstone: 0.3,
  gold_ingot: 1.6, silver_ingot: 1.2, iron_ingot: 1.1, steel_ingot: 1.1, mithril_ingot: 0.7, adamant_ingot: 1.4,
  egg: 0.06, dino_egg: 1.2, drake_egg: 1.5, armor_plate: 1.8, troll_tusk: 1.0, tyrant_tooth: 0.8, dino_meat: 1.0, drake_meat: 0.8,
  dynamite: 0.35,
};

/** Kilograms of one unit of an item (0 for things that don't take pockets). */
export function kgOf(id) {
  const it = ITEMS[id];
  if (!it) return 0.3;
  if (typeof it.kg === 'number') return it.kg;
  return KG[id] ?? KG_BY_CAT[it.cat] ?? 0.3;
}
/** A forged weapon: a little for the hilt plus its ingots. */
export function weaponKg(w) { return 0.5 + (WEAPON_TYPES[w?.type]?.ingots ?? 2) * 0.75; }
/** A stack's weight (see core/inventory.js for stacks). */
export function stackKg(s) {
  if (!s) return 0;
  if (s.w) return weaponKg(s.w);
  const n = s.lots ? s.lots.length : s.n || 0;
  return kgOf(s.id) * n;
}
/** A container's weight. */
export function loadOf(slots) { let k = 0; for (const s of slots || []) if (s) k += stackKg(s); return k; }

// ---------------------------------------------------------------- the mole
/** What the mole carries comfortably (kg). */
export function carryOf(state) {
  const bag = state.equipped?.('bag');
  let kg = bag?.carry ?? 15;
  kg *= state.skill?.('carry') || 1; // Deep Pockets, Pack Mule, Herb Pouch
  kg += Math.floor((state.upEffect?.('bag') || 0) / 4) * 2;
  if (state.hasBuff?.('pack')) kg += 6; // a packed lunch: Packmule
  if (state.hasBuff?.('strong')) kg += 4;
  return Math.max(5, kg);
}

/** How heavy loads feel: { kg, carry, r, speed, jump, run, tier, max } (max: the most it can lift). */
export function loadState(kg, carry) {
  const r = kg / Math.max(1, carry);
  let speed, jump;
  if (r <= 0.6) { speed = 1; jump = 1; }
  else if (r <= 1) { speed = 1 - (r - 0.6) / 0.4 * 0.1; jump = 1; }
  else if (r <= 1.5) { speed = 0.9 - (r - 1) / 0.5 * 0.3; jump = 0.8; }
  else if (r <= 2) { speed = 0.6 - (r - 1.5) / 0.5 * 0.2; jump = 0.5; }
  else { speed = 0.35; jump = 0.4; }
  const tier = r < 0.6 ? 'light' : r <= 1 ? 'good' : r <= 1.5 ? 'heavy' : r < 2 ? 'over' : 'max';
  return { kg, carry, r, speed, jump, run: r <= 1, tier, max: carry * 2 };
}

/** The mole's load right now (the backpack, see inventory.bag). */
export function moleLoad(state, slots) { return loadState(loadOf(slots), carryOf(state)); }

/** Can the mole lift n more of this item? (the hard limit: twice what it carries comfortably) */
export function canLift(state, slots, id, n = 1) {
  const add = kgOf(id) * n;
  if (add <= 0) return true;
  return loadOf(slots) + add <= carryOf(state) * 2 + 1e-6;
}

export const TIER_LABEL = { light: 'Light', good: 'A good haul', heavy: 'Heavy', over: 'Overloaded', max: 'Can\'t lift more' };
export const TIER_COLOR = { light: '#8fd06a', good: '#d8c05a', heavy: '#ff9a3a', over: '#ff5a3a', max: '#ff3a4a' };

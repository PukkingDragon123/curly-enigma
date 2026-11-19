import { COOK_TECH } from './cookTech.js';

// The skill tree: six lines of craft the mole gets better at by doing them. Each line has XP
// and levels (levels give skill points), and a hand-inked tree of nodes that spend those points.
// Logic lives in core/skills.js, the book page in ui/SkillTree.js, the pixel art in ui/skillArt.js.
//
// Effects are read with state.skill(key):
//   'mult'   keys → a multiplier ≥ 1 (1 + the sum of the stamped nodes' values). Bigger is always
//                   better: where lower numbers are better (swing interval, damage taken) the reader
//                   divides by it. See SKILL_KEYS[key].how for exactly how each is applied.
//   'chance' keys → a probability 0..1 (0 until a node gives it).
//   'perk'   keys → 0 when not taken, 1 (or more, for a perk with a stronger follow-up) when taken.

/** XP needed to go from level L to L + 1. Lv 2 in about a minute of work, Lv 5 in ~15 min, Lv 10 a couple of hours. */
export function xpToNext(L) { return Math.round(25 * Math.pow(L, 1.75) + 15); }
export const MAX_LEVEL = 20;
/** Skill points a level-up to `L` gives (milestone levels give one extra). */
export function pointsForLevel(L) { return L % 5 === 0 ? 2 : 1; }
/** Line level each tier of a tree needs (bottom row first). */
export const TIER_LV = [1, 3, 6, 10, 15];
/** Point cost by tier unless a node says otherwise. */
export const TIER_COST = [1, 1, 2, 2, 3];

/** Total XP to reach level L (level 1 = 0). */
export function xpForLevel(L) {
  let t = 0;
  for (let i = 1; i < L; i++) t += xpToNext(i);
  return t;
}
/** { level, into, need, frac } for a total XP. */
export function levelInfo(xp) {
  let L = 1, rest = Math.max(0, xp || 0);
  while (L < MAX_LEVEL && rest >= xpToNext(L)) { rest -= xpToNext(L); L++; }
  const need = L >= MAX_LEVEL ? 0 : xpToNext(L);
  return { level: L, into: L >= MAX_LEVEL ? 0 : rest, need, frac: need ? rest / need : 1, max: L >= MAX_LEVEL };
}

// wax colours per line: hi, lt, base, dk, dd (light comes from the top left)
// a: where the branch grows on the root map (degrees, 0 = east, clockwise), filled in by layout.
export const SKILL_LINES = [
  { id: 'mining', name: 'Mining', glyph: 'pick', ink: '#6e4422', pal: [0xf0c890, 0xc08850, 0x93602e, 0x623c1a, 0x38200c],
    how: 'Swing at rock, free ore, find gems, blast.', star: 'Listen first. Then hit it.' },
  { id: 'smithing', name: 'Smithing', glyph: 'anvil', ink: '#8a2418', pal: [0xffa080, 0xe8604a, 0xc23c2c, 0x8a2418, 0x50120a],
    how: 'Smelt ingots, forge blades. Better grades teach more.', star: 'Mostly it\'s waiting for the heat.' },
  { id: 'cooking', name: 'Cooking', glyph: 'pot', ink: '#a04a14', pal: [0xffd09a, 0xf79a52, 0xd96e2a, 0x9a4416, 0x58220a],
    how: 'Cook dishes, forage what goes in them.', star: 'Eat. You look like a stick.' },
  { id: 'building', name: 'Building', glyph: 'hammer', ink: '#37506e', pal: [0xd0e0f4, 0x8eaad2, 0x5a76a0, 0x3a5272, 0x1e2c40],
    how: 'Hammer pieces into your burrow, put up blocks below.', star: 'Measure twice. Hammer once. Then hammer again.' },
  { id: 'survival', name: 'Survival', glyph: 'heart', ink: '#3a6a24', pal: [0xc8f08a, 0x8ac85a, 0x5a9a3a, 0x3a6a24, 0x1e3a12],
    how: 'Explore, take knocks, fight back, sleep it off.', star: 'Keep your guard up and your tail down.' },
  { id: 'taming', name: 'Taming', glyph: 'paw', ink: '#56347e', pal: [0xe8c8ff, 0xb58ae0, 0x8256b8, 0x56347e, 0x30184a],
    how: 'Win a wild raptor over, feed it, take it digging.', star: 'Slow paws, full pockets of jerky.' },
];
export const LINE = Object.fromEntries(SKILL_LINES.map((l) => [l.id, l]));
/** Lines that existed before wave 16 and where their XP went (core/skills.js fillSkills). */
export const OLD_LINES = { combat: 'survival', exploring: 'survival', foraging: 'cooking', trading: null };

const pct = (v) => `+${Math.round(v * 100)}%`;
const less = (v) => `−${Math.round((1 - 1 / (1 + v)) * 100)}%`;
const chance = (v) => `${Math.round(v * 100)}%`;
/**
 * Every effect key. kind: 'mult' (1 + sum) | 'chance' (0..0.95) | 'perk' (0/1+) | 'add' (a plain sum).
 * label: a short name. fmt(v): a node's value as a few words. how: what reads it and how.
 */
export const SKILL_KEYS = {
  // mining
  power: { kind: 'mult', label: 'pick power', fmt: pct, by: 'mine', how: 'pick power × skill (DigScene.bonus)' },
  rate: { kind: 'mult', label: 'swing speed', fmt: pct, by: 'mine', how: 'swing interval ÷ skill (faster swings)' },
  glint: { kind: 'mult', label: 'ore sense', fmt: pct, by: 'mine', how: 'range of the hidden-ore glint × skill' },
  clean: { kind: 'mult', label: 'scratches', fmt: less, by: 'mine', how: 'ore quality lost to scratches ÷ skill' },
  blast: { kind: 'mult', label: 'blast radius', fmt: pct, by: 'mine', how: 'explosive blast radius × skill (Explosives)' },
  toss: { kind: 'mult', label: 'throw range', fmt: pct, by: 'mine', how: 'charge throw speed × skill (State.mineBonus().toss)' },
  spare: { kind: 'chance', label: 'keep a stick', fmt: chance, by: 'mine', how: 'chance a thrown charge is not used up (State.mineBonus().spare)' },
  sticky: { kind: 'perk', label: 'sticky fuse', fmt: () => 'charges stick', by: 'mine', how: 'charges stick where they land (State.mineBonus().sticky)' },
  stamina: { kind: 'mult', label: 'work tires', fmt: less, by: 'mine', how: 'energy spent on work ÷ skill; not damage' },
  sell: { kind: 'mult', label: 'ore & gem value', fmt: pct, by: 'skills', how: 'ore and gem sale prices × skill (inside sellPrice)' },
  // smithing
  forge: { kind: 'mult', label: 'forging windows', fmt: pct, by: 'forge', how: 'the forge minigames\' good windows × skill' },
  craft: { kind: 'mult', label: 'blade value', fmt: pct, by: 'skills', how: 'value of each forged weapon × skill (state.addWeapon)' },
  gemset: { kind: 'mult', label: 'gem settings', fmt: pct, by: 'skills', how: 'value of forged weapons with a pommel gem × skill' },
  thrift: { kind: 'chance', label: 'bonus ingot', fmt: chance, by: 'skills', how: 'chance a smelt pours one more ingot (on act smelt)' },
  // cooking
  cook: { kind: 'mult', label: 'cooking windows', fmt: pct, by: 'cooking', how: 'cooking steps\' timing/target windows × skill' },
  helping: { kind: 'chance', label: 'extra portion', fmt: chance, by: 'skills', how: 'chance a cooked dish makes an extra portion (on act cook)' },
  hearty: { kind: 'mult', label: 'food energy', fmt: pct, by: 'eat', how: 'energy restored by eating × skill (game.eat)' },
  buff: { kind: 'mult', label: 'buff time', fmt: pct, by: 'skills', how: 'length of every buff × skill (state.addBuff)' },
  forage: { kind: 'mult', label: 'forage window', fmt: pct, by: 'forage', how: 'the forage pull window and quality × skill' },
  double: { kind: 'chance', label: 'double pull', fmt: chance, by: 'skills', how: 'chance a forage gives a second one (on act forage)' },
  sense: { kind: 'perk', label: 'plants twinkle', fmt: () => 'plants twinkle', by: 'forage', how: 'forageable plants twinkle from further away' },
  tech: { kind: 'perk', label: 'technique', fmt: () => 'new recipes', by: 'cooking', how: 'a cooking technique (data/cookTech.js): its recipes and steps open' },
  // building
  bspeed: { kind: 'mult', label: 'hammer speed', fmt: pct, by: 'build', how: 'fewer, quicker hammer blows per piece (home/hammer.js)' },
  salvage: { kind: 'chance', label: 'save materials', fmt: chance, by: 'build', how: 'chance a hammered piece costs no materials (home/build.js)' },
  nook: { kind: 'perk', label: 'new alcove', fmt: () => 'dig a new alcove', by: 'home', how: 'its alcove (node.nook) may be dug out at its chalk mark (home/nookDig.js)' },
  tavern: { kind: 'add', label: 'tavern taps', fmt: (v) => `+${v} tavern taps`, by: 'state', how: 'tavern levels on top of the old board\'s (state.tavernIncome)' },
  // survival
  vigor: { kind: 'add', label: 'max stamina', fmt: (v) => `+${v} max stamina`, by: 'skills', how: 'added to data.maxEnergy when stamped (taken off on respec)' },
  rest: { kind: 'add', label: 'rest refill', fmt: (v) => `+${v.toFixed(1)}/s resting`, by: 'mine', how: 'energy/s standing still (State.mineBonus().rest, explosives/perks.js)' },
  appetite: { kind: 'mult', label: 'hunger', fmt: (v) => `${less(v)} hunger`, by: 'vitals', how: 'hunger growth ÷ skill (core/vitals.js)' },
  mend: { kind: 'mult', label: 'mending', fmt: pct, by: 'vitals', how: 'injury mending × skill (core/vitals.js)' },
  pockets: { kind: 'add', label: 'bag pockets', fmt: (v) => `+${v} pockets`, by: 'state', how: 'added to state.bagCapacity()' },
  carry: { kind: 'mult', label: 'bag space', fmt: pct, by: 'skills', how: 'state.bagCapacity() × skill (rounded)' },
  lamp: { kind: 'mult', label: 'lamp reach', fmt: pct, by: 'skills', how: 'state.lightRadius() × skill' },
  hide: { kind: 'mult', label: 'damage taken', fmt: less, by: 'combat', how: 'damage taken (creatures, blasts) ÷ skill' },
  damage: { kind: 'mult', label: 'damage', fmt: pct, by: 'combat', how: 'damage dealt to creatures × skill' },
  block: { kind: 'mult', label: 'parry window', fmt: pct, by: 'combat', how: 'block/parry timing window × skill' },
  riposte: { kind: 'perk', label: 'riposte', fmt: () => 'perfect blocks stagger', by: 'combat', how: '1: a perfect block staggers the attacker' },
  hunger: { kind: 'perk', label: 'battle hunger', fmt: () => '+6 stamina a win', by: 'skills', how: 'every kill gives back 6 energy (on act kill)' },
  wind: { kind: 'perk', label: 'second wind', fmt: () => '+4 stamina a parry', by: 'skills', how: 'perfect blocks give back 4 energy (on act block)' },
  fall: { kind: 'mult', label: 'fall damage', fmt: less, by: 'mine', how: 'fall damage ÷ skill' },
  speed: { kind: 'mult', label: 'walk speed', fmt: pct, by: 'mine', how: 'walk and run speed × skill (first person)' },
  ink: { kind: 'mult', label: 'map ink', fmt: pct, by: 'map', how: 'the radius the map inks around you × skill' },
  sleeper: { kind: 'perk', label: 'light sleeper', fmt: () => 'wake up lucky', by: 'skills', how: 'each morning starts with the Lucky Nose buff' },
  pathfinder: { kind: 'perk', label: 'pathfinder', fmt: () => '+15 stamina in new caves', by: 'skills', how: 'the first step into a new zone or biome gives 15 energy' },
  // taming
  trust: { kind: 'mult', label: 'trust gained', fmt: pct, by: 'tame', how: 'trust a wild raptor gains × skill (deep/tame/stray.js addTrust)' },
  palbite: { kind: 'mult', label: 'pal\'s bite', fmt: pct, by: 'tame', how: 'your raptor\'s bite damage × skill (deep/tame/pal.js)' },
  palfind: { kind: 'mult', label: 'pal digs', fmt: pct, by: 'tame', how: 'your raptor digs out finds faster × skill (deep/tame/pal.js)' },
  // kept for old saves and readers (no node gives them now: they read neutral)
  haggle: { kind: 'mult', label: 'shop prices', fmt: less, by: 'skills', how: 'shop prices ÷ skill' },
  tips: { kind: 'chance', label: 'tips', fmt: chance, by: 'skills', how: 'chance a sale over 100g earns a 10% tip' },
  fence: { kind: 'mult', label: 'Rocco\'s prices', fmt: pct, by: 'traders', how: 'what Rocco pays for weapons × skill' },
  interest: { kind: 'perk', label: 'savings jar', fmt: () => 'interest', by: 'skills', how: 'each morning pays interest on your gold' },
};

/** One line saying what a node does ("+10% pick power · +20% ore sense"), or node.eff. */
export function nodeEffect(n) {
  if (n.eff) return n.eff;
  return Object.entries(n.fx).map(([k, v]) => {
    const d = SKILL_KEYS[k];
    if (!d) return '';
    const f = d.fmt(v);
    return d.kind === 'perk' || /[a-z]{3}/i.test(f.replace(/^[+−-]?\d+%?\s*/, '')) ? f : `${f} ${d.label}`;
  }).filter(Boolean).join(' · ');
}

// ------------------------------------------------------------------------------- the trees
// t: ring 0..4 (out from the heart of the map), s: order round the ring. req: ANY of these opens it.
// excl: nodes sharing a group are a choice: stamping one bars the others. lv: line level it needs
// (default TIER_LV[t]). Ids are kept from older saves where the skill is the same idea.
const N = (line, id, t, s, glyph, name, fx, o = {}) => ({ id, line, t, s, glyph, name, fx, req: [], cost: TIER_COST[t], ...o });

const CORE_NODES = [
  // ---- Mining (the old board's digging and blasting live here now)
  N('mining', 'm_paws', 0, 0, 'paw', 'Strong Paws', { power: 0.1 }),
  N('mining', 'm_swing', 1, 0, 'swing', 'Quick Swing', { rate: 0.1 }, { req: ['m_paws'] }),
  N('mining', 'm_steady', 1, 1, 'feather', 'Steady Paws', { clean: 0.2 }, { req: ['m_paws'] }),
  N('mining', 'm_fuse', 1, 2, 'bomb', 'Fuse Craft', { blast: 0.1 }, { req: ['m_paws'] }),
  N('mining', 'm_tunnel', 2, 0, 'bolt', 'Tunnel Rat', { stamina: 0.12 }, { req: ['m_swing'] }),
  N('mining', 'm_nose', 2, 1, 'nose', 'Ore Sense', { glint: 0.3 }, { req: ['m_steady'] }),
  N('mining', 'm_appraise', 2, 2, 'gem', 'Keen Appraisal', { sell: 0.08 }, { req: ['m_steady'] }),
  N('mining', 'm_throw', 2, 3, 'wind', 'Long Throw', { toss: 0.25 }, { req: ['m_fuse'] }),
  N('mining', 'm_brute', 3, 0, 'fist', 'Brute Force', { power: 0.2 }, { req: ['m_tunnel', 'm_swing'], excl: 'm_way' }),
  N('mining', 'm_finesse', 3, 1, 'gem', 'Featherpick', { clean: 0.35 }, { req: ['m_nose', 'm_appraise'], excl: 'm_way' }),
  N('mining', 'm_sticky', 3, 2, 'drop', 'Sticky Fuse', { sticky: 1, spare: 0.15 }, { req: ['m_throw'] }),
  N('mining', 'm_mother', 4, 0, 'crown', 'Motherlode', { power: 0.12, clean: 0.12, glint: 0.2 }, { req: ['m_brute', 'm_finesse'] }),
  N('mining', 'm_blast', 4, 1, 'bomb', 'Powder Monkey', { blast: 0.25 }, { req: ['m_sticky'] }),

  // ---- Smithing
  N('smithing', 's_bellows', 0, 0, 'flame', 'Bellows Arm', { forge: 0.08 }),
  N('smithing', 's_eye', 1, 0, 'eye', 'Smith\'s Eye', { forge: 0.1 }, { req: ['s_bellows'] }),
  N('smithing', 's_thrift', 1, 1, 'ingot', 'Thrifty Smelter', { thrift: 0.2 }, { req: ['s_bellows'] }),
  N('smithing', 's_finish', 2, 0, 'sword', 'Fine Finish', { craft: 0.1 }, { req: ['s_eye', 's_thrift'] }),
  N('smithing', 's_crucible', 2, 1, 'ingot', 'Hot Crucible', { thrift: 0.15 }, { req: ['s_thrift'] }),
  N('smithing', 's_master', 3, 0, 'anvil', 'Master Smith', { craft: 0.25 }, { req: ['s_finish'], excl: 's_way' }),
  N('smithing', 's_sure', 3, 1, 'hammer', 'Sure Hands', { forge: 0.25 }, { req: ['s_finish'], excl: 's_way' }),
  N('smithing', 's_jewel', 3, 2, 'gem', 'Gem Setter', { gemset: 0.25 }, { req: ['s_crucible'] }),
  N('smithing', 's_legend', 4, 0, 'crown', 'Red Star Stamp', { craft: 0.15, forge: 0.15 }, { req: ['s_master', 's_sure', 's_jewel'] }),

  // ---- Cooking (and the old Foraging); the techniques (data/cookTech.js) are added below
  N('cooking', 'c_nose', 0, 0, 'pot', 'Good Nose', { cook: 0.08 }),
  N('cooking', 'c_knife', 1, 0, 'knife', 'Quick Knife', { cook: 0.08 }, { req: ['c_nose'] }),
  N('cooking', 'g_eye', 1, 9, 'mushroom', 'Forager\'s Eye', { forage: 0.15, double: 0.1 }, { req: ['c_nose'] }),
  N('cooking', 'c_helping', 2, 0, 'bowl', 'Second Helping', { helping: 0.2 }, { req: ['c_knife'] }),
  N('cooking', 'c_hearty', 2, 9, 'heart', 'Hearty Portions', { hearty: 0.2, buff: 0.2 }, { req: ['c_knife', 'g_eye'] }),
  N('cooking', 'g_sense', 3, 9, 'eye', 'Mushroom Sense', { sense: 1, double: 0.15 }, { req: ['g_eye'] }),
  N('cooking', 'c_gourmet', 3, 0, 'star', 'Good Palate', { cook: 0.25 }, { req: ['c_helping', 'c_hearty'] }),
  N('cooking', 'c_chef', 4, 0, 'crown', 'Hazel\'s Rival', { cook: 0.15, helping: 0.1, buff: 0.2 }, { req: ['c_gourmet'] }),

  // ---- Building (the hammer; the alcoves and the tavern from the old board)
  N('building', 'b_mallet', 0, 0, 'hammer', 'Light Mallet', { bspeed: 0.2 }),
  N('building', 'b_store', 0, 1, 'bag', 'Storage Nook', { nook: 1 }, { nook: 'nook_store', eff: 'Dig out the storage nook' }),
  N('building', 'b_nails', 1, 0, 'bolt', 'Sure Nails', { bspeed: 0.2 }, { req: ['b_mallet'] }),
  N('building', 'b_work', 1, 1, 'anvil', 'Workshop Bay', { nook: 1 }, { req: ['b_store'], nook: 'nook_work', eff: 'Dig out the workshop bay' }),
  N('building', 'b_pantry', 1, 2, 'jar', 'Pantry Nook', { nook: 1 }, { req: ['b_store'], nook: 'nook_pantry', eff: 'Dig out the pantry' }),
  N('building', 'b_thrift', 2, 0, 'stack', 'Thrifty Builder', { salvage: 0.2 }, { req: ['b_nails'] }),
  N('building', 'b_taps', 2, 1, 'coin', 'Tavern Taps', { tavern: 3 }, { req: ['b_work', 'b_pantry'] }),
  N('building', 'b_carpenter', 3, 0, 'axe', 'Master Carpenter', { bspeed: 0.3 }, { req: ['b_thrift'] }),
  N('building', 'b_tavern', 3, 1, 'coin', 'Busy Tavern', { tavern: 3 }, { req: ['b_taps'] }),
  N('building', 'b_architect', 4, 0, 'crown', 'Burrow Architect', { bspeed: 0.25, salvage: 0.15, tavern: 3 }, { req: ['b_carpenter', 'b_tavern'] }),

  // ---- Survival (stamina, hunger, injury; the old Combat and Exploring)
  N('survival', 'v_lungs', 0, 0, 'wind', 'Deep Lungs', { vigor: 10 }),
  N('survival', 'v_rest', 1, 0, 'moon', 'Catnapper', { rest: 0.4 }, { req: ['v_lungs'] }),
  N('survival', 'f_hide', 1, 1, 'plate', 'Thick Hide', { hide: 0.15 }, { req: ['v_lungs'] }),
  N('survival', 'e_lamp', 1, 2, 'lamp', 'Bright Lamp', { lamp: 0.15 }, { req: ['v_lungs'] }),
  N('survival', 'v_belly', 2, 0, 'drumstick', 'Iron Belly', { appetite: 0.25 }, { req: ['v_rest'] }),
  N('survival', 'v_mend', 2, 1, 'leaf', 'Quick Mend', { mend: 0.5 }, { req: ['f_hide'] }),
  N('survival', 'm_pockets', 2, 2, 'bag', 'Deep Pockets', { pockets: 2 }, { req: ['f_hide', 'e_lamp'] }),
  N('survival', 'e_sure', 2, 3, 'boot', 'Sure Footed', { fall: 0.5, speed: 0.04 }, { req: ['e_lamp'] }),
  N('survival', 'v_stamina', 3, 0, 'heart', 'Bottomless', { vigor: 20 }, { req: ['v_belly'] }),
  N('survival', 'f_parry', 3, 1, 'shield', 'Parry Master', { block: 0.25, wind: 1 }, { req: ['v_mend', 'm_pockets'] }),
  N('survival', 'v_survivor', 4, 0, 'crown', 'Old Survivor', { vigor: 10, hide: 0.15, mend: 0.5, appetite: 0.2 }, { req: ['v_stamina', 'f_parry'] }),

  // ---- Taming
  N('taming', 'a_gentle', 0, 0, 'paw', 'Gentle Voice', { trust: 0.25 }),
  N('taming', 'a_treats', 1, 0, 'drumstick', 'Tasty Treats', { trust: 0.25 }, { req: ['a_gentle'] }),
  N('taming', 'a_bite', 1, 1, 'claws', 'Fierce Pal', { palbite: 0.25 }, { req: ['a_gentle'] }),
  N('taming', 'a_nose', 2, 0, 'nose', 'Truffle Pal', { palfind: 0.3 }, { req: ['a_treats'] }),
  N('taming', 'a_bond', 2, 1, 'heart', 'Smells Right', { trust: 0.4 }, { req: ['a_treats', 'a_bite'] }),
  N('taming', 'a_pack', 3, 0, 'claws', 'Pack Leader', { palbite: 0.35, palfind: 0.2 }, { req: ['a_nose', 'a_bond'] }),
  N('taming', 'a_master', 4, 0, 'crown', 'Pack Mole', { trust: 0.3, palbite: 0.2, palfind: 0.3 }, { req: ['a_pack'] }),
];

// Cooking techniques: one node each, rings and line levels by their order (the first two straight off).
const TECH_LV = [1, 1, 2, 2, 3, 3, 5, 5, 7, 7, 9, 9];
const techNodes = () => COOK_TECH.map((tk, i) => {
  const t = i < 2 ? 1 : i < 5 ? 2 : 3;
  const req = i < 2 ? ['c_nose'] : i < 5 ? COOK_TECH.slice(0, 2).map((x) => x.id) : COOK_TECH.slice(2, 5).map((x) => x.id);
  return { id: tk.id, line: 'cooking', t, s: 1 + i, glyph: 'spoon', icon: tk.icon, name: tk.name, fx: { tech: 1 }, eff: tk.desc, req, cost: 1, lv: TECH_LV[i] ?? 9, tech: true };
});

export const SKILL_NODES = [...CORE_NODES, ...techNodes()];
export const NODE = Object.fromEntries(SKILL_NODES.map((n) => [n.id, n]));
export const nodesOf = (line) => SKILL_NODES.filter((n) => n.line === line);
/** The line level a node needs. */
export const needLv = (n) => n.lv ?? TIER_LV[n.t] ?? 1;

// ------------------------------------------------------------------------------- XP rules
// act event → { line: xp } (capped per second for bursty types, XP_RATE) plus k.bonus(line, xp) for
// first-time finds (never capped). k.first(key) is true the first time a key is seen (it is saved).
const GRADE_XP = { S: 55, A: 38, B: 24, C: 14, D: 7, F: 3 };
const sq = (v) => Math.sqrt(Math.max(0, v || 0));
const TAME_XP = { meet: 6, calm: 10, feed: 8, offer: 6, sniff: 5, bond: 80, pet: 2, hatch: 40, stay: 0.5, follow: 0.5, reach: 0.5 };
export const XP_RULES = {
  dig: (e, k) => ({ mining: 0.3 + Math.min(0.5, (e.n || 1) * 0.015) }),
  ore: (e, k) => ({ mining: 6 + 2.2 * sq(k.value(e.id) / 10) * (0.5 + (e.q ?? 70) / 100) + (e.pristine ? 6 : 0) }),
  gem: (e, k) => ({ mining: 14 + 3 * sq(k.value(e.id) / 10) * (0.5 + (e.q ?? 70) / 100) }),
  blast: () => ({ mining: 3 }),
  smelt: (e, k) => ({ smithing: 12 + Math.min(20, k.value(k.ingotOf(e.id)) / 15) }),
  forge: (e) => {
    let g = e.grade;
    if (typeof g === 'object' && g) g = g.g;
    if (typeof g === 'number') g = g >= 92 ? 'S' : g >= 80 ? 'A' : g >= 66 ? 'B' : g >= 50 ? 'C' : g >= 34 ? 'D' : 'F';
    return { smithing: 30 + (GRADE_XP[g] ?? 12) };
  },
  part: (e) => ({ smithing: 20 + (GRADE_XP[e.grade] ?? 10) * 0.7 }), // a forge piece made at home (your first pick)
  cook: (e, k) => { if (e.dish != null && k.first('dish:' + e.dish)) k.bonus('cooking', 20); return { cooking: 18 + 0.32 * Math.max(0, Math.min(100, e.score ?? 60)) }; },
  forage: (e, k) => ({ cooking: 5 + 0.04 * (e.q ?? 70) + Math.min(6, k.value(e.id) / 10) }),
  // building: a piece hammered in at home (e.home, e.tiles) or a block put up below
  build: (e, k) => { if (e.home && e.id && k.first('piece:' + e.id)) k.bonus('building', 12); return { building: e.home ? 8 + 3 * (e.tiles || 1) + (e.lv || 1) * 2 : 1.2 }; },
  unbuild: () => ({ building: 0.3 }),
  nook: (e, k) => { k.bonus('building', 45); return null; },
  kill: (e, k) => ({ survival: k.killXp(e.kind) }),
  block: (e) => ({ survival: e.perfect ? 4 : 1.5 }),
  nest: (e, k) => { k.bonus('survival', 35); return null; },
  hurt: (e) => ({ survival: Math.min(4, 0.5 + (e.n || 0) * 0.12) }),
  explore: (e, k) => {
    if (e.zone != null && k.first('zone:' + e.zone)) k.bonus('survival', 40);
    if (e.biome != null && k.first('biome:' + e.biome)) k.bonus('survival', 30);
    return { survival: 1.2 };
  },
  reach: (e, k) => { if (e.place != null && k.first('place:' + e.place)) k.bonus('survival', 20); return null; },
  puzzle: (e, k) => { k.bonus('survival', e.id == null || k.first('puzzle:' + e.id) ? 60 : 10); return null; },
  sleep: () => ({ survival: 3 }),
  tame: (e, k) => { if (e.what === 'bond' && e.name && !k.first('bond:' + e.name)) return null; return { taming: TAME_XP[e.what] ?? 1 }; },
  lesson: (e) => {
    const s = String(e.step ?? '').toLowerCase();
    if (!s || s === 'skip') return null;
    const line = /mine|dig|ore|pick|gem|chisel|copper/.test(s) ? 'mining' : /forge|smelt|anvil|quench|blade/.test(s) ? 'smithing'
      : /cook|hearth|dish|stir|chop|forage/.test(s) ? 'cooking' : /build|hammer|decor/.test(s) ? 'building' : /tame|raptor|pet/.test(s) ? 'taming' : 'survival';
    return { [line]: 15 };
  },
};
/** Per-type XP caps for bursty events: up to `cap` banked, refilled at `rate` XP per second. */
export const XP_RATE = {
  dig: { cap: 4, rate: 1.0 }, explore: { cap: 8, rate: 2.5 }, block: { cap: 10, rate: 2 }, hurt: { cap: 6, rate: 1 },
  sleep: { cap: 3, rate: 0.01 }, blast: { cap: 9, rate: 0.5 }, build: { cap: 30, rate: 2 }, unbuild: { cap: 3, rate: 0.5 }, tame: { cap: 90, rate: 1.5 },
};

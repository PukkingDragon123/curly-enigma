// The skill tree: seven lines of craft the mole gets better at by doing them. Each line has XP
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
export const SKILL_LINES = [
  { id: 'mining', name: 'Mining', glyph: 'pick', ink: '#6e4422', pal: [0xf0c890, 0xc08850, 0x93602e, 0x623c1a, 0x38200c],
    how: 'Swing at rock, free ore, find gems, blast.', star: 'A good miner listens to the rock before he hits it.' },
  { id: 'smithing', name: 'Smithing', glyph: 'anvil', ink: '#8a2418', pal: [0xffa080, 0xe8604a, 0xc23c2c, 0x8a2418, 0x50120a],
    how: 'Smelt ingots, forge blades. Better grades teach more.', star: 'Heat, hammer, patience. Mostly patience.' },
  { id: 'cooking', name: 'Cooking', glyph: 'pot', ink: '#a04a14', pal: [0xffd09a, 0xf79a52, 0xd96e2a, 0x9a4416, 0x58220a],
    how: 'Cook dishes at the hearth. Good scores teach more.', star: 'An empty belly digs a short tunnel.' },
  { id: 'combat', name: 'Combat', glyph: 'sword', ink: '#37506e', pal: [0xd0e0f4, 0x8eaad2, 0x5a76a0, 0x3a5272, 0x1e2c40],
    how: 'Fight what lurks down there, block its blows.', star: 'Keep your guard up and your tail down.' },
  { id: 'exploring', name: 'Exploring', glyph: 'compass', ink: '#56347e', pal: [0xe8c8ff, 0xb58ae0, 0x8256b8, 0x56347e, 0x30184a],
    how: 'Ink new tunnels on your map, find places, solve old puzzles.', star: 'Every tunnel goes somewhere. Most of them down.' },
  { id: 'foraging', name: 'Foraging', glyph: 'mushroom', ink: '#3a6a24', pal: [0xc8f08a, 0x8ac85a, 0x5a9a3a, 0x3a6a24, 0x1e3a12],
    how: 'Pull mushrooms and roots, feed Nugget.', star: 'Gentle paws, full pockets. Nugget agrees.' },
  { id: 'trading', name: 'Trading', glyph: 'coin', ink: '#8a6010', pal: [0xfff0a8, 0xf6d462, 0xd8a832, 0x9a6e14, 0x56380a],
    how: 'Sell your finds and buy what you need. Big deals teach more.', star: 'A million gold is just a lot of small sales.' },
];
export const LINE = Object.fromEntries(SKILL_LINES.map((l) => [l.id, l]));

const pct = (v) => `+${Math.round(v * 100)}%`;
const less = (v) => `−${Math.round((1 - 1 / (1 + v)) * 100)}%`;
/**
 * Every effect key. kind: 'mult' | 'chance' | 'perk'. label: shown in the book. fmt(v) formats a
 * node's value. how: what reads it and how (also the docs for the other parts).
 * by: 'skills' = applied by the skills system itself (works with no other code); otherwise the part
 * that reads it.
 */
export const SKILL_KEYS = {
  power: { kind: 'mult', label: 'Pick power', fmt: pct, by: 'mine', how: 'pick power × skill (DigScene.strike, with the Miners\' Board bonus)' },
  rate: { kind: 'mult', label: 'Swing speed', fmt: pct, by: 'mine', how: 'swing interval ÷ skill (faster swings)' },
  glint: { kind: 'mult', label: 'Ore sense', fmt: pct, by: 'mine', how: 'range of the hidden-ore glint × skill' },
  clean: { kind: 'mult', label: 'Steady paws', fmt: (v) => `${less(v)} scratches`, by: 'mine', how: 'ore quality lost to scratches ÷ skill' },
  blast: { kind: 'mult', label: 'Blast radius', fmt: pct, by: 'mine', how: 'explosive blast radius × skill' },
  stamina: { kind: 'mult', label: 'Stamina', fmt: (v) => `${less(v)} energy`, by: 'mine', how: 'energy spent on work (pick blows, hammer strikes, swimming) ÷ skill; not damage' },
  carry: { kind: 'mult', label: 'Bag space', fmt: pct, by: 'skills', how: 'state.bagCapacity() × skill (rounded); the coop may use it too' },
  lamp: { kind: 'mult', label: 'Lamp reach', fmt: pct, by: 'skills', how: 'state.lightRadius() × skill' },
  hide: { kind: 'mult', label: 'Thick hide', fmt: (v) => `${less(v)} damage`, by: 'combat', how: 'damage taken (creatures, blasts) ÷ skill' },
  damage: { kind: 'mult', label: 'Damage', fmt: pct, by: 'combat', how: 'damage dealt to creatures × skill' },
  block: { kind: 'mult', label: 'Parry window', fmt: pct, by: 'combat', how: 'block/parry timing window × skill; damage that gets through a block ÷ skill' },
  riposte: { kind: 'perk', label: 'Riposte', fmt: () => 'perfect blocks stagger', by: 'combat', how: '1: a perfect block staggers the attacker (a free hit)' },
  hunger: { kind: 'perk', label: 'Battle hunger', fmt: () => '+6 energy per kill', by: 'skills', how: 'every kill gives back 6 energy (on act kill)' },
  wind: { kind: 'perk', label: 'Second wind', fmt: () => '+4 energy per perfect block', by: 'skills', how: 'perfect blocks give back 4 energy (on act block)' },
  fall: { kind: 'mult', label: 'Sure feet', fmt: (v) => `${less(v)} fall damage`, by: 'mine', how: 'fall damage ÷ skill' },
  speed: { kind: 'mult', label: 'Walk speed', fmt: pct, by: 'mine', how: 'walk and run speed × skill (first person)' },
  ink: { kind: 'mult', label: 'Map ink', fmt: pct, by: 'map', how: 'the radius the map inks around you as you walk × skill' },
  sleeper: { kind: 'perk', label: 'Light sleeper', fmt: () => 'wake up lucky', by: 'skills', how: 'each morning starts with the Lucky Nose buff (on the day event)' },
  pathfinder: { kind: 'perk', label: 'Pathfinder', fmt: () => '+15 energy in new caves', by: 'skills', how: 'the first step into a new zone or biome gives 15 energy (on act explore)' },
  forge: { kind: 'mult', label: 'Forging ease', fmt: pct, by: 'forge', how: 'the forge minigames\' good windows (heat, strike, quench) × skill' },
  craft: { kind: 'mult', label: 'Blade value', fmt: pct, by: 'skills', how: 'value of each forged weapon × skill (state.addWeapon, shown on the result card)' },
  gemset: { kind: 'mult', label: 'Gem settings', fmt: pct, by: 'skills', how: 'value of forged weapons with a pommel gem × skill (state.addWeapon)' },
  thrift: { kind: 'chance', label: 'Bonus ingot', fmt: (v) => `${Math.round(v * 100)}% chance`, by: 'skills', how: 'chance a smelt pours one more ingot (on act smelt)' },
  cook: { kind: 'mult', label: 'Cooking ease', fmt: pct, by: 'cooking', how: 'cooking steps\' timing/target windows × skill (kinder scores)' },
  helping: { kind: 'chance', label: 'Second helping', fmt: (v) => `${Math.round(v * 100)}% chance`, by: 'skills', how: 'chance a cooked dish makes an extra portion (on act cook)' },
  hearty: { kind: 'mult', label: 'Hearty food', fmt: pct, by: 'eat', how: 'energy restored by eating × skill (game.eat)' },
  buff: { kind: 'mult', label: 'Buff time', fmt: pct, by: 'skills', how: 'length of every buff × skill (state.addBuff)' },
  forage: { kind: 'mult', label: 'Foraging ease', fmt: pct, by: 'forage', how: 'the forage pull window × skill; quality of what you pull × skill (cap 100)' },
  double: { kind: 'chance', label: 'Double pull', fmt: (v) => `${Math.round(v * 100)}% chance`, by: 'skills', how: 'chance a forage gives a second one (on act forage)' },
  sense: { kind: 'perk', label: 'Mushroom sense', fmt: () => 'plants twinkle', by: 'forage', how: '1: forageable plants twinkle from further away (radar/glint)' },
  nugget: { kind: 'mult', label: 'Nugget\'s bond', fmt: pct, by: 'nugget', how: 'Nugget\'s hunger drains ÷ skill; her finds and patience × skill' },
  sell: { kind: 'mult', label: 'Ore & gem prices', fmt: pct, by: 'skills', how: 'ore and gem sale prices × skill (inside sellPrice, so every shown price matches)' },
  haggle: { kind: 'mult', label: 'Shop discount', fmt: (v) => `${less(v)} prices`, by: 'skills', how: 'shop prices ÷ skill (state.buy; show state.buyPrice(p))' },
  tips: { kind: 'chance', label: 'Tips', fmt: (v) => `${Math.round(v * 100)}% chance`, by: 'skills', how: 'chance a sale over 100g earns a 10% tip (on act sell)' },
  fence: { kind: 'mult', label: 'Rocco\'s prices', fmt: pct, by: 'traders', how: 'what Rocco pays for weapons × skill' },
  interest: { kind: 'perk', label: 'Savings jar', fmt: (v) => (v >= 2 ? '1.5% a day, up to 600g' : '1% a day, up to 250g'), by: 'skills', how: 'each morning pays interest on your gold (on the day event)' },
};

// ------------------------------------------------------------------------------- the trees
// t: tier 0..4 (bottom row first), s: slot 0..4 across. req: ANY of these unlocks the way.
// excl: nodes sharing a group are a choice: stamping one bars the others.
const N = (line, id, t, s, glyph, name, fx, desc, o = {}) => ({ id, line, t, s, glyph, name, fx, desc, req: [], cost: TIER_COST[t], ...o });

export const SKILL_NODES = [
  // ---- Mining
  N('mining', 'm_paws', 0, 2, 'paw', 'Strong Paws', { power: 0.1 }, 'Your pick bites deeper.'),
  N('mining', 'm_swing', 1, 1, 'swing', 'Quick Swing', { rate: 0.1 }, 'Shorter wind-up, quicker blows.', { req: ['m_paws'] }),
  N('mining', 'm_steady', 1, 3, 'feather', 'Steady Paws', { clean: 0.2 }, 'Fewer scratches when ore is near.', { req: ['m_paws'] }),
  N('mining', 'm_tunnel', 2, 0, 'bolt', 'Tunnel Rat', { stamina: 0.12 }, 'Digging all day barely tires you.', { req: ['m_swing'] }),
  N('mining', 'm_pockets', 2, 2, 'bag', 'Deep Pockets', { carry: 0.15 }, 'Sew extra pockets into the bag.', { req: ['m_swing', 'm_steady'] }),
  N('mining', 'm_nose', 2, 4, 'nose', 'Ore Sense', { glint: 0.3 }, 'Your star-nose twitches near hidden ore.', { req: ['m_steady'] }),
  N('mining', 'm_blast', 3, 0, 'bomb', 'Demolitionist', { blast: 0.2 }, 'Bigger booms from the same charge.', { req: ['m_tunnel'] }),
  N('mining', 'm_brute', 3, 1, 'fist', 'Brute Force', { power: 0.2 }, 'Hit it harder. It works.', { req: ['m_tunnel', 'm_pockets'], excl: 'm_way' }),
  N('mining', 'm_finesse', 3, 3, 'gem', 'Featherpick', { clean: 0.35 }, 'Free ore so gently it barely notices.', { req: ['m_pockets', 'm_nose'], excl: 'm_way' }),
  N('mining', 'm_rhythm', 4, 0, 'hourglass', 'Miner\'s Rhythm', { rate: 0.12, stamina: 0.08 }, 'Swing, breathe, swing. You could do this in your sleep.', { req: ['m_blast', 'm_brute'] }),
  N('mining', 'm_mother', 4, 2, 'crown', 'Motherlode', { power: 0.12, clean: 0.12, glint: 0.2 }, 'The rock gives up its treasure to you.', { req: ['m_brute', 'm_finesse'] }),
  N('mining', 'm_mule', 4, 4, 'bag', 'Pack Mule', { carry: 0.2 }, 'Haul home twice what a sensible mole would.', { req: ['m_finesse', 'm_nose'] }),

  // ---- Smithing
  N('smithing', 's_bellows', 0, 2, 'flame', 'Bellows Arm', { forge: 0.08 }, 'Steady coals: the sweet spots widen.'),
  N('smithing', 's_eye', 1, 1, 'eye', 'Smith\'s Eye', { forge: 0.1 }, 'Read the heat by its glow.', { req: ['s_bellows'] }),
  N('smithing', 's_thrift', 1, 3, 'ingot', 'Thrifty Smelter', { thrift: 0.2 }, 'Scrape the crucible clean: sometimes an extra ingot.', { req: ['s_bellows'] }),
  N('smithing', 's_arm', 2, 0, 'hammer', 'Iron Arm', { stamina: 0.1 }, 'Hammer strikes and pick blows tire you less.', { req: ['s_eye'] }),
  N('smithing', 's_finish', 2, 2, 'sword', 'Fine Finish', { craft: 0.1 }, 'A polish buyers pay extra for.', { req: ['s_eye', 's_thrift'] }),
  N('smithing', 's_crucible', 2, 4, 'ingot', 'Hot Crucible', { thrift: 0.15 }, 'Not a drop of metal wasted.', { req: ['s_thrift'] }),
  N('smithing', 's_quench', 3, 0, 'drop', 'Quench Master', { forge: 0.1, craft: 0.05 }, 'You know the hiss of a perfect temper.', { req: ['s_arm'] }),
  N('smithing', 's_master', 3, 1, 'anvil', 'Master Smith', { craft: 0.25 }, 'Your maker\'s mark is worth gold on its own.', { req: ['s_arm', 's_finish'], excl: 's_way' }),
  N('smithing', 's_sure', 3, 3, 'hammer', 'Sure Hands', { forge: 0.25 }, 'The metal goes where you tell it.', { req: ['s_finish', 's_crucible'], excl: 's_way' }),
  N('smithing', 's_jewel', 3, 4, 'gem', 'Gem Setter', { gemset: 0.25 }, 'Pommel gems set so well they sing.', { req: ['s_crucible'] }),
  N('smithing', 's_legend', 4, 2, 'crown', 'Legendary Smith', { craft: 0.15, forge: 0.15 }, 'Old Star would bow. He won\'t, but he would.', { req: ['s_master', 's_sure', 's_quench', 's_jewel'] }),

  // ---- Cooking
  N('cooking', 'c_nose', 0, 2, 'pot', 'Good Nose', { cook: 0.08 }, 'You smell when it\'s done.'),
  N('cooking', 'c_knife', 1, 1, 'knife', 'Quick Knife', { cook: 0.08 }, 'Chop, chop, never your claws.', { req: ['c_nose'] }),
  N('cooking', 'c_helping', 1, 3, 'bowl', 'Second Helping', { helping: 0.2 }, 'Somehow there\'s always a bit more in the pot.', { req: ['c_nose'] }),
  N('cooking', 'c_hearty', 2, 0, 'heart', 'Hearty Portions', { hearty: 0.2 }, 'Food fills you up more.', { req: ['c_knife'] }),
  N('cooking', 'c_instinct', 2, 2, 'spoon', 'Cook\'s Instinct', { cook: 0.15 }, 'Better scores without thinking about it.', { req: ['c_knife', 'c_helping'] }),
  N('cooking', 'c_simmer', 2, 4, 'clock', 'Slow Simmer', { buff: 0.3 }, 'Food buffs last longer.', { req: ['c_helping'] }),
  N('cooking', 'c_egg', 3, 0, 'egg', 'Iron Stomach', { hearty: 0.2 }, 'You could eat a rock. You have, once.', { req: ['c_hearty'] }),
  N('cooking', 'c_feast', 3, 1, 'bowl', 'Feast Maker', { helping: 0.2 }, 'Cook for one, feed a burrow.', { req: ['c_hearty', 'c_instinct'], excl: 'c_way' }),
  N('cooking', 'c_gourmet', 3, 3, 'star', 'Gourmet', { cook: 0.25 }, 'Every dish a little masterpiece.', { req: ['c_instinct', 'c_simmer'], excl: 'c_way' }),
  N('cooking', 'c_spice', 3, 4, 'sprout', 'Spice Rack', { buff: 0.25 }, 'A pinch of this, a pinch of that, it lasts all day.', { req: ['c_simmer'] }),
  N('cooking', 'c_chef', 4, 2, 'crown', 'Head Chef', { cook: 0.15, helping: 0.1, buff: 0.2 }, 'The hearth is yours now.', { req: ['c_feast', 'c_gourmet', 'c_egg', 'c_spice'] }),

  // ---- Combat
  N('combat', 'f_guard', 0, 2, 'shield', 'Guard Up', { block: 0.15 }, 'A wider window to block in.'),
  N('combat', 'f_claws', 1, 1, 'claws', 'Sharp Claws', { damage: 0.15 }, 'Hit back harder.', { req: ['f_guard'] }),
  N('combat', 'f_hide', 1, 3, 'plate', 'Thick Hide', { hide: 0.15 }, 'Bites and bumps hurt less.', { req: ['f_guard'] }),
  N('combat', 'f_hunger', 2, 0, 'drumstick', 'Battle Hunger', { hunger: 1 }, 'Every win gives you back some energy.', { req: ['f_claws'] }),
  N('combat', 'f_parry', 2, 2, 'sword', 'Parry Master', { block: 0.25 }, 'Your paws find the blow before it lands.', { req: ['f_claws', 'f_hide'] }),
  N('combat', 'f_wind', 2, 4, 'wind', 'Second Wind', { wind: 1 }, 'A perfect block gives you back your breath.', { req: ['f_hide'] }),
  N('combat', 'f_riposte', 3, 0, 'bolt', 'Riposte', { riposte: 1 }, 'A perfect block leaves them reeling.', { req: ['f_hunger', 'f_parry'] }),
  N('combat', 'f_berserk', 3, 1, 'axe', 'Berserker', { damage: 0.3 }, 'All claws, no fear.', { req: ['f_hunger', 'f_parry'], excl: 'f_way' }),
  N('combat', 'f_bulwark', 3, 3, 'plate', 'Bulwark', { hide: 0.3 }, 'Like hitting a boulder with fur on.', { req: ['f_parry', 'f_wind'], excl: 'f_way' }),
  N('combat', 'f_tough', 3, 4, 'fist', 'Tough as Roots', { stamina: 0.08, hide: 0.1 }, 'Grit, mostly.', { req: ['f_wind'] }),
  N('combat', 'f_champ', 4, 2, 'crown', 'Cave Champion', { damage: 0.15, hide: 0.15, block: 0.15 }, 'Things in the dark learn your smell and leave.', { req: ['f_berserk', 'f_bulwark', 'f_riposte', 'f_tough'] }),

  // ---- Exploring
  N('exploring', 'e_lamp', 0, 2, 'lamp', 'Bright Lamp', { lamp: 0.15 }, 'Trim the wick, polish the glass.'),
  N('exploring', 'e_ink', 1, 1, 'map', 'Cave Sense', { ink: 0.35 }, 'Your map inks wider as you walk.', { req: ['e_lamp'] }),
  N('exploring', 'e_feet', 1, 3, 'feather', 'Light Feet', { speed: 0.05 }, 'A spring in your step.', { req: ['e_lamp'] }),
  N('exploring', 'e_sleeper', 2, 0, 'moon', 'Light Sleeper', { sleeper: 1 }, 'Wake up with a Lucky Nose.', { req: ['e_ink'] }),
  N('exploring', 'e_sure', 2, 2, 'boot', 'Sure Footed', { fall: 0.5 }, 'Land like a cat. A heavy, furry cat.', { req: ['e_ink', 'e_feet'] }),
  N('exploring', 'e_path', 2, 4, 'compass', 'Pathfinder', { pathfinder: 1 }, 'New caves put fresh wind in you.', { req: ['e_feet'] }),
  N('exploring', 'e_breath', 3, 0, 'wind', 'Deep Breath', { stamina: 0.08 }, 'Slow breaths, long tunnels.', { req: ['e_sleeper'] }),
  N('exploring', 'e_carto', 3, 1, 'map', 'Cartographer', { ink: 0.5 }, 'You map a tunnel at a glance.', { req: ['e_sleeper', 'e_sure'], excl: 'e_way' }),
  N('exploring', 'e_glow', 3, 3, 'worm', 'Glow-worm Friend', { lamp: 0.3 }, 'The glow-worms follow your lamp.', { req: ['e_sure', 'e_path'], excl: 'e_way' }),
  N('exploring', 'e_star', 3, 4, 'star', 'Star Reader', { glint: 0.15 }, 'You spot a glint where others see rock.', { req: ['e_path'] }),
  N('exploring', 'e_deep', 4, 2, 'crown', 'Deep Walker', { lamp: 0.1, speed: 0.05, ink: 0.25, fall: 0.5 }, 'The deep is your home now.', { req: ['e_carto', 'e_glow', 'e_breath', 'e_star'] }),

  // ---- Foraging
  N('foraging', 'g_eye', 0, 2, 'mushroom', 'Forager\'s Eye', { forage: 0.1 }, 'Pulling and picking are kinder.'),
  N('foraging', 'g_gentle', 1, 1, 'leaf', 'Gentle Pull', { forage: 0.15 }, 'Roots come up whole.', { req: ['g_eye'] }),
  N('foraging', 'g_double', 1, 3, 'sprout', 'Green Paws', { double: 0.2 }, 'Sometimes there\'s a second one underneath.', { req: ['g_eye'] }),
  N('foraging', 'g_pouch', 2, 0, 'bag', 'Herb Pouch', { carry: 0.08 }, 'A little pouch for the little things.', { req: ['g_gentle'] }),
  N('foraging', 'g_nugget', 2, 2, 'hen', 'Nugget Whisperer', { nugget: 0.25 }, 'Nugget gets hungry slower and finds more.', { req: ['g_gentle', 'g_double'] }),
  N('foraging', 'g_sense', 2, 4, 'eye', 'Mushroom Sense', { sense: 1 }, 'Things worth pulling twinkle from afar.', { req: ['g_double'] }),
  N('foraging', 'g_hen', 3, 0, 'hen', 'Hen\'s Best Friend', { nugget: 0.25 }, 'Nugget would follow you into lava. Please don\'t.', { req: ['g_pouch', 'g_nugget'] }),
  N('foraging', 'g_bounty', 3, 1, 'sprout', 'Bountiful', { double: 0.15 }, 'The cave is generous to you.', { req: ['g_pouch', 'g_nugget'], excl: 'g_way' }),
  N('foraging', 'g_care', 3, 3, 'leaf', 'Careful Picker', { forage: 0.25 }, 'Not a bruise on them.', { req: ['g_nugget', 'g_sense'], excl: 'g_way' }),
  N('foraging', 'g_lore', 3, 4, 'potion', 'Herb Lore', { buff: 0.15, hearty: 0.1 }, 'You know which root does what.', { req: ['g_sense'] }),
  N('foraging', 'g_root', 4, 2, 'crown', 'Root Mother', { forage: 0.15, double: 0.1, nugget: 0.2 }, 'Mushrooms lean toward you as you pass.', { req: ['g_bounty', 'g_care', 'g_hen', 'g_lore'] }),

  // ---- Trading
  N('trading', 't_tongue', 0, 2, 'coin', 'Silver Tongue', { sell: 0.05 }, 'Ore and gems sell for more.'),
  N('trading', 't_haggle', 1, 1, 'tag', 'Haggler', { haggle: 0.07 }, 'Every price has a little give.', { req: ['t_tongue'] }),
  N('trading', 't_appraise', 1, 3, 'scale', 'Appraiser', { sell: 0.07 }, 'You know exactly what that gem is worth.', { req: ['t_tongue'] }),
  N('trading', 't_tips', 2, 0, 'stack', 'Regular Customer', { tips: 0.25 }, 'Traders tip you on big sales.', { req: ['t_haggle'] }),
  N('trading', 't_rocco', 2, 2, 'mask', 'Rocco\'s Pal', { fence: 0.15 }, 'Rocco pays more for your blades. No questions.', { req: ['t_haggle', 't_appraise'] }),
  N('trading', 't_jar', 2, 4, 'jar', 'Savings Jar', { interest: 1 }, 'Gold left in the jar grows overnight.', { req: ['t_appraise'] }),
  N('trading', 't_bulk', 3, 0, 'stack', 'Bulk Seller', { tips: 0.15 }, 'Sell by the cartload, get tipped by the cartload.', { req: ['t_tips'] }),
  N('trading', 't_shark', 3, 1, 'tag', 'Hard Bargain', { haggle: 0.1 }, 'Shopkeepers sigh when you walk in.', { req: ['t_tips', 't_rocco'], excl: 't_way' }),
  N('trading', 't_charm', 3, 3, 'gem', 'Charmer', { sell: 0.1 }, 'They pay more just to see you smile.', { req: ['t_rocco', 't_jar'], excl: 't_way' }),
  N('trading', 't_vault', 3, 4, 'jar', 'Iron Vault', { interest: 1 }, 'A bigger jar, better interest.', { req: ['t_jar'] }),
  N('trading', 't_magnate', 4, 2, 'crown', 'Gold Magnate', { sell: 0.08, haggle: 0.05 }, 'Gold sticks to your paws.', { req: ['t_shark', 't_charm', 't_bulk', 't_vault'] }),
];
export const NODE = Object.fromEntries(SKILL_NODES.map((n) => [n.id, n]));
export const nodesOf = (line) => SKILL_NODES.filter((n) => n.line === line);

// ------------------------------------------------------------------------------- XP rules
// act event → { line: xp } (capped per second for bursty types, XP_RATE) plus k.bonus(line, xp) for
// first-time finds (never capped). k.first(key) is true the first time a key is seen (it is saved).
const GRADE_XP = { S: 55, A: 38, B: 24, C: 14, D: 7, F: 3 };
const sq = (v) => Math.sqrt(Math.max(0, v || 0));
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
  cook: (e, k) => { if (e.dish != null && k.first('dish:' + e.dish)) k.bonus('cooking', 20); return { cooking: 18 + 0.32 * Math.max(0, Math.min(100, e.score ?? 60)) }; },
  kill: (e, k) => ({ combat: k.killXp(e.kind) }),
  block: (e) => ({ combat: e.perfect ? 4 : 1.5 }),
  nest: (e, k) => { k.bonus('combat', 35); return null; },
  hurt: (e) => ({ combat: Math.min(4, 0.5 + (e.n || 0) * 0.12) }),
  forage: (e, k) => ({ foraging: 8 + 0.06 * (e.q ?? 70) + Math.min(8, k.value(e.id) / 8) }),
  feed: () => ({ foraging: 4 }),
  explore: (e, k) => {
    if (e.zone != null && k.first('zone:' + e.zone)) k.bonus('exploring', 40);
    if (e.biome != null && k.first('biome:' + e.biome)) k.bonus('exploring', 30);
    return { exploring: 1.2 };
  },
  reach: (e, k) => { if (e.place != null && k.first('place:' + e.place)) k.bonus('exploring', 20); return null; },
  puzzle: (e, k) => { k.bonus('exploring', e.id == null || k.first('puzzle:' + e.id) ? 60 : 10); return null; },
  talk: (e, k) => { if (e.npc != null && k.first('npc:' + e.npc)) k.bonus('trading', 12); return { trading: 1 }; },
  sell: (e) => ({ trading: Math.min(60, 0.6 + sq((e.gold || 0) / 10)) }),
  buy: (e) => ({ trading: Math.min(25, 0.3 + 0.4 * sq((e.gold || 0) / 10)) }),
  sleep: () => ({ exploring: 3 }),
  lesson: (e) => {
    const s = String(e.step ?? '').toLowerCase();
    if (!s || s === 'skip') return null;
    const line = /mine|dig|ore|pick|gem|chisel|copper/.test(s) ? 'mining' : /forge|smelt|anvil|quench|hammer|blade/.test(s) ? 'smithing'
      : /cook|hearth|dish|stir|chop/.test(s) ? 'cooking' : /fight|block|parry|combat/.test(s) ? 'combat'
        : /forage|mushroom|pull|nugget|feed/.test(s) ? 'foraging' : /sell|buy|trade|shop/.test(s) ? 'trading' : 'exploring';
    return { [line]: 15 };
  },
};
/** Per-type XP caps for bursty events: up to `cap` banked, refilled at `rate` XP per second. */
export const XP_RATE = {
  dig: { cap: 4, rate: 1.0 }, explore: { cap: 8, rate: 2.5 }, block: { cap: 10, rate: 2 }, hurt: { cap: 6, rate: 1 },
  talk: { cap: 14, rate: 0.3 }, feed: { cap: 8, rate: 0.15 }, sleep: { cap: 3, rate: 0.01 }, blast: { cap: 9, rate: 0.5 },
};

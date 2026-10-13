// Cooking: dishes (food items) and the ingredient combos that make them.
// Recipes are never shown up front; players find them by experimenting at the stove.
//
// steps: the order of minigame steps in the cooking scene. Step kinds:
//   chop   — slice an ingredient along the guide marks
//   crack  — crack an egg on the bowl rim with the right force
//   stir   — circle the spoon to stir until the meter fills
//   season — shake salt; stop inside the target zone
//   fry    — flip at golden-brown (twice)
//   pour   — hold to pour, release at the line
//   knead  — alternate paws in rhythm
//   plate  — place the food neatly on the plate

export const BUFFS = {
  glow: { name: 'Glowing Whiskers', desc: 'Your lamp shines wider.', color: '#7fd0ff' },
  warm: { name: 'Toasty', desc: 'Heat and cold drain less energy.', color: '#ff9a4a' },
  cool: { name: 'Chill', desc: 'Volcanic heat drains less energy.', color: '#9ae6ff' },
  bouncy: { name: 'Bouncy', desc: 'Jump much higher.', color: '#d9a6ff' },
  zippy: { name: 'Zippy', desc: 'Move and dig faster.', color: '#fff07a' },
  lucky: { name: 'Lucky Nose', desc: 'Freed ores come out finer.', color: '#8af07a' },
  sense: { name: 'Ore Sense', desc: 'Hidden ores near you shimmer.', color: '#c9a6ff' },
  sturdy: { name: 'Sturdy', desc: 'Mining costs less energy.', color: '#e6c87a' },
};

export const DISHES = {
  glowcap_soup: { name: 'Glowcap Soup', energy: 30, buff: 'glow', value: 40, icon: { k: 'food', t: 'soup', c: 0x7fd0ff }, desc: 'Faintly luminous broth.' },
  carrot_stew: { name: 'Cave Carrot Stew', energy: 45, buff: 'sturdy', value: 55, icon: { k: 'food', t: 'stew', c: 0xf2a35e }, desc: 'Thick, sweet, filling.' },
  worm_noodles: { name: 'Worm Noodles', energy: 40, value: 45, icon: { k: 'food', t: 'noodles', c: 0xe0a0a0 }, desc: 'Slurpable. Do not think about it too hard.' },
  fern_salad: { name: 'Blindfern Salad', energy: 28, value: 30, icon: { k: 'food', t: 'salad', c: 0xd8e0c8 }, desc: 'Crunchy and pale.' },
  fried_fish: { name: 'Fried Cave Fish', energy: 55, value: 110, icon: { k: 'food', t: 'fish', c: 0xe0b060 }, desc: 'Golden and crisp.' },
  spicy_omelette: { name: 'Spicy Omelette', energy: 50, buff: 'warm', value: 70, icon: { k: 'food', t: 'omelette', c: 0xffd84a }, desc: 'Warms you right down to the claws.' },
  bubble_tea: { name: 'Bubble Root Tea', energy: 25, buff: 'bouncy', value: 80, icon: { k: 'food', t: 'cup', c: 0xc9a6ff }, desc: 'Fizzy, floaty, fun.' },
  zippy_skewer: { name: 'Zippy Skewer', energy: 40, buff: 'zippy', value: 90, icon: { k: 'food', t: 'skewer', c: 0x7fe7ff }, desc: 'Crackles as you chew.' },
  truffle_risotto: { name: 'Truffle Risotto', energy: 100, buff: 'lucky', value: 900, icon: { k: 'food', t: 'risotto', c: 0xf0e0b0 }, desc: 'Fancy. Very fancy.' },
  shrimp_skewer: { name: 'Frost Shrimp Skewers', energy: 70, buff: 'warm', value: 600, icon: { k: 'food', t: 'skewer', c: 0xff9a8a }, desc: 'Spicy-cold-crunchy.' },
  ember_curry: { name: 'Ember Curry', energy: 80, buff: 'cool', value: 300, icon: { k: 'food', t: 'stew', c: 0xd9582a }, desc: 'So hot that lava feels mild afterward.' },
  frost_parfait: { name: 'Frost Parfait', energy: 75, buff: 'warm', value: 420, icon: { k: 'food', t: 'parfait', c: 0xbff6ff }, desc: 'Layered, frosty, oddly warming.' },
  crystal_tea: { name: 'Crystal Tea', energy: 60, buff: 'sense', value: 260, icon: { k: 'food', t: 'cup', c: 0xeaf7ff }, desc: 'Rings faintly as you sip.' },
  sleepy_stew: { name: 'Sleepy Stew', energy: 140, value: 150, icon: { k: 'food', t: 'stew', c: 0x6a5a8a }, desc: 'Like a nap in a bowl.' },
  whisper_wrap: { name: 'Whisper Wrap', energy: 50, buff: 'sense', value: 140, icon: { k: 'food', t: 'wrap', c: 0xa0c080 }, desc: 'It whispers where the good rocks are.' },
  lotus_feast: { name: 'Core Lotus Feast', energy: 200, maxEnergy: 10, value: 5000, icon: { k: 'food', t: 'feast', c: 0xff9ad0 }, desc: 'Permanently raises your maximum energy.' },
  grub_pancakes: { name: 'Grub Pancakes', energy: 45, value: 60, icon: { k: 'food', t: 'pancakes', c: 0xe0b070 }, desc: 'Fluffy stack with deep honey.' },
  deviled_egg: { name: 'Deviled Egg', energy: 22, value: 30, icon: { k: 'food', t: 'egg', c: 0xffe08a }, desc: 'A simple snack from your hen.' },
  mystery_mush: { name: 'Mystery Mush', energy: 10, value: 1, icon: { k: 'food', t: 'mush', c: 0x8a9a5a }, desc: 'It is food. Technically.' },
};

/** ingredient id → count; order-insensitive. */
export const RECIPES = [
  { dish: 'glowcap_soup', ing: { glowcap: 1, salt_crystal: 1 }, steps: ['chop', 'stir', 'season'] },
  { dish: 'carrot_stew', ing: { cave_carrot: 1, mushroom: 1, salt_crystal: 1 }, steps: ['chop', 'chop', 'stir', 'season'] },
  { dish: 'worm_noodles', ing: { worm: 1, flour: 1 }, steps: ['knead', 'chop', 'stir'] },
  { dish: 'fern_salad', ing: { blindfern: 1, cave_carrot: 1 }, steps: ['chop', 'chop', 'plate'] },
  { dish: 'fried_fish', ing: { blind_fish: 1, butter: 1 }, steps: ['chop', 'fry', 'plate'] },
  { dish: 'spicy_omelette', ing: { egg: 1, pepperroot: 1 }, steps: ['crack', 'chop', 'fry'] },
  { dish: 'bubble_tea', ing: { bubblebulb: 1, rootbeer: 1 }, steps: ['chop', 'pour', 'stir'] },
  { dish: 'zippy_skewer', ing: { sparkmoss: 1, worm: 1 }, steps: ['chop', 'fry', 'plate'] },
  { dish: 'truffle_risotto', ing: { truffle: 1, butter: 1, mushroom: 1 }, steps: ['chop', 'stir', 'stir', 'season', 'plate'] },
  { dish: 'shrimp_skewer', ing: { frost_shrimp: 1, pepperroot: 1 }, steps: ['chop', 'fry', 'plate'] },
  { dish: 'ember_curry', ing: { emberbloom: 1, ashfern: 1, salt_crystal: 1 }, steps: ['chop', 'chop', 'stir', 'season'] },
  { dish: 'frost_parfait', ing: { frostbloom: 1, honey: 1, egg: 1 }, steps: ['crack', 'stir', 'pour', 'plate'] },
  { dish: 'crystal_tea', ing: { crystal_lily: 1, honey: 1 }, steps: ['chop', 'pour', 'stir'] },
  { dish: 'sleepy_stew', ing: { gloomshroom: 1, cave_carrot: 1, salt_crystal: 1 }, steps: ['chop', 'chop', 'stir', 'season'] },
  { dish: 'whisper_wrap', ing: { whisperweed: 1, flour: 1, egg: 1 }, steps: ['crack', 'knead', 'chop', 'plate'] },
  { dish: 'lotus_feast', ing: { core_lotus: 1, truffle: 1, honey: 1 }, steps: ['chop', 'chop', 'stir', 'season', 'plate'] },
  { dish: 'grub_pancakes', ing: { flour: 1, egg: 1, honey: 1 }, steps: ['crack', 'stir', 'fry'] },
  { dish: 'deviled_egg', ing: { egg: 1, salt_crystal: 1 }, steps: ['crack', 'season'] },
];

/** Find the recipe for a multiset of ingredients ({id: n}). Returns null for mystery mush. */
export function findRecipe(ings) {
  const keys = Object.keys(ings).filter((k) => ings[k] > 0).sort();
  for (const r of RECIPES) {
    const rk = Object.keys(r.ing).sort();
    if (rk.length !== keys.length) continue;
    let ok = true;
    for (let i = 0; i < rk.length; i++) {
      if (rk[i] !== keys[i] || r.ing[rk[i]] !== ings[keys[i]]) { ok = false; break; }
    }
    if (ok) return r;
  }
  return null;
}

/** Items that can go in the pot. */
export const COOKABLE_CATS = ['plant', 'critter', 'ingredient', 'mineral'];
export const COOKABLE_EXTRA = ['salt_crystal'];

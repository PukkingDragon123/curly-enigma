// Cooking: food buffs, the new cave ingredients, dishes (food items) and the ingredient combos
// that make them. Recipes are never shown up front; players find them by cooking (the Index Book
// and the pantry's recipe cards record them), helped by a sniff when a combo is one short.
//
// steps: the order of minigame steps in the cooking scene (src/cooking/steps/*):
//   chop    slice an ingredient along the guide marks        crack   crack an egg on the rim
//   stir    circle the spoon (whisk) until the meter fills    season  shake salt into the band
//   fry     flip at golden-brown, both sides                  pour    hold to pour, stop at the line
//   knead   alternate paws in rhythm                          plate   drop the food in the middle
//   simmer  keep the pot at a simmer with the heat knob       flip    toss it high, catch it in the pan
//   grate   stroke along the grater, stop before your knuckles roll    even out the dough with the pin
//   bake    pull it from the hearth oven at golden            mash    pound the lumps on the beat
//
// Dishes and foraged plants carry a quality (q, 0..100): a dish's quality is its cooking score
// (helped by the quality of what went in) and stretches how long its buff lasts.
import { cookIcon as I } from '../cooking/icons.js';

/**
 * Timed food buffs (state.addBuff(id, secs) / state.hasBuff(id)). `fx` says what the buff should do
 * (docs/REMAKE.md › Cooking: who reads which); `icon` is the item shown when the source is unknown.
 */
export const BUFFS = {
  zippy: { name: 'Zippy', desc: 'Faster swings and quicker paws.', fx: 'pick/weapon swing time ×0.8', color: '#fff07a', icon: 'sparkmoss' },
  strong: { name: 'Mighty', desc: 'Harder pick and weapon blows.', fx: 'blow power ×1.3', color: '#ff9a6a', icon: 'drake_jerky' },
  hearty: { name: 'Hearty', desc: 'Energy slowly comes back.', fx: '+0.6 energy/s (cooking/buffs.js)', color: '#ff8aa0', icon: 'mushroom_stew' },
  glow: { name: 'Glowing Whiskers', desc: 'Your lamp shines wider.', fx: 'lamp radius +2.5 m (State.lightRadius)', color: '#7fd0ff', icon: 'glowcap' },
  warm: { name: 'Toasty', desc: 'Cold bites far less.', fx: 'cold energy drain ×0.3', color: '#ff9a4a', icon: 'pepperroot' },
  cool: { name: 'Chill', desc: 'Heat bites far less.', fx: 'heat / lava energy drain ×0.4', color: '#9ae6ff', icon: 'frostbloom' },
  guard: { name: 'Iron Belly', desc: 'Your blocks soak up more.', fx: 'blocked damage ×0.5, parry window ×1.4', color: '#c8d0e0', icon: 'salted_fish' },
  lucky: { name: 'Lucky Nose', desc: 'Gems and ore come out finer.', fx: 'freed ore/gem quality +10, pristine chance ×1.5', color: '#8af07a', icon: 'truffle' },
  pack: { name: 'Packmule', desc: 'You carry more finds per trip.', fx: 'bag capacity +6', color: '#e6b87a', icon: 'tunnel_tuber' },
  sturdy: { name: 'Sturdy', desc: 'Mining costs less energy.', fx: 'mining energy ×0.6', color: '#e6c87a', icon: 'cave_carrot' },
  bouncy: { name: 'Bouncy', desc: 'Jump much higher.', fx: 'jump ×1.35', color: '#d9a6ff', icon: 'bubblebulb' },
  sense: { name: 'Ore Sense', desc: 'Hidden ores near you shimmer.', fx: 'glint hidden ore within 4 m', color: '#c9a6ff', icon: 'crystal_lily' },
};

/**
 * New cooking ingredients, merged into ITEMS by data/items.js. Foraged ones (cat plant, or
 * ingredient with q) come from the mine's harvestable props (src/deep/Props.js + src/ui/Forage.js).
 */
export const INGREDIENTS = {
  cave_berry: { name: 'Cave Berries', cat: 'plant', value: 14, food: 4, icon: I('berry'),
    desc: 'Sweet-tart red berries from the low bushes of the mossy grottos. Pick only the ripe ones.' },
  stone_thyme: { name: 'Stone Thyme', cat: 'plant', value: 16, icon: I('thyme'),
    desc: 'A tough little herb that grows in rock cracks. Smells like a warm kitchen.' },
  tunnel_tuber: { name: 'Tunnel Tuber', cat: 'plant', value: 10, food: 5, icon: I('tuber'),
    desc: 'A knobbly cave potato, buried deep. Dig around it before you heave.' },
  cave_garlic: { name: 'Cave Garlic', cat: 'plant', value: 14, icon: I('garlic'),
    desc: 'Pungent white bulbs. Twist them loose or the bulb tears.' },
  glow_moss: { name: 'Glow Moss', cat: 'plant', value: 18, icon: I('moss'),
    desc: 'A soft, faintly glowing moss mat. Peel it slowly in one piece.' },
  grub: { name: 'Fat Grubs', cat: 'ingredient', q: true, value: 9, icon: I('grub'),
    desc: 'Creamy cave grubs dug out of soft loam. Crunchy when fried. Do not think about it.' },
  dino_egg: { name: 'Dino Egg', cat: 'ingredient', q: true, value: 260, icon: I('dinoegg'),
    desc: 'A huge speckled egg from the Dino Caverns. Lift it gently: something big laid it.' },
  drake_meat: { name: 'Drake Meat', cat: 'ingredient', value: 70, price: 120, icon: I('drake'),
    desc: 'Lean dark meat from a rock drake. Tough as boots until it is cured.' },
};

// dish quality matters (q: score), so every dish is a quality item
const D = (o) => ({ q: true, ...o });

export const DISHES = {
  // ---------------------------------------------------------------- the classics
  glowcap_soup: D({ name: 'Glowcap Soup', energy: 30, buff: 'glow', secs: 300, value: 40, icon: { k: 'food', t: 'soup', c: 0x7fd0ff }, desc: 'Faintly luminous broth. Every miner\'s first recipe.' }),
  carrot_stew: D({ name: 'Cave Carrot Stew', energy: 45, buff: 'sturdy', secs: 360, value: 55, icon: { k: 'food', t: 'stew', c: 0xf2a35e }, desc: 'Thick, sweet, filling.' }),
  worm_noodles: D({ name: 'Worm Noodles', energy: 40, buff: 'zippy', secs: 200, value: 45, icon: { k: 'food', t: 'noodles', c: 0xe0a0a0 }, desc: 'Slurpable. Do not think about it too hard.' }),
  fern_salad: D({ name: 'Blindfern Salad', energy: 28, buff: 'sturdy', secs: 240, value: 30, icon: { k: 'food', t: 'salad', c: 0xd8e0c8 }, desc: 'Crunchy and pale, with grated carrot.' }),
  fried_fish: D({ name: 'Fried Cave Fish', energy: 55, buff: 'guard', secs: 300, value: 110, icon: { k: 'food', t: 'fish', c: 0xe0b060 }, desc: 'Golden and crisp.' }),
  spicy_omelette: D({ name: 'Spicy Omelette', energy: 50, buff: 'warm', secs: 360, value: 70, icon: { k: 'food', t: 'omelette', c: 0xffd84a }, desc: 'Warms you right down to the claws.' }),
  bubble_tea: D({ name: 'Bubble Root Tea', energy: 25, buff: 'bouncy', secs: 180, value: 80, icon: { k: 'food', t: 'cup', c: 0xc9a6ff }, desc: 'Fizzy, floaty, fun.' }),
  zippy_skewer: D({ name: 'Zippy Skewer', energy: 40, buff: 'zippy', secs: 300, value: 90, icon: { k: 'food', t: 'skewer', c: 0x7fe7ff }, desc: 'Crackles as you chew.' }),
  truffle_risotto: D({ name: 'Truffle Risotto', energy: 100, buff: 'lucky', secs: 480, value: 900, icon: { k: 'food', t: 'risotto', c: 0xf0e0b0 }, desc: 'Fancy. Very fancy. Shaved truffle on top.' }),
  shrimp_skewer: D({ name: 'Frost Shrimp Skewers', energy: 70, buff: 'warm', secs: 480, value: 600, icon: { k: 'food', t: 'skewer', c: 0xff9a8a }, desc: 'Spicy-cold-crunchy.' }),
  ember_curry: D({ name: 'Ember Curry', energy: 80, buff: 'cool', secs: 420, value: 300, icon: { k: 'food', t: 'stew', c: 0xd9582a }, desc: 'So hot that lava feels mild afterward.' }),
  frost_parfait: D({ name: 'Frost Parfait', energy: 75, buff: 'warm', secs: 420, value: 420, icon: { k: 'food', t: 'parfait', c: 0xbff6ff }, desc: 'Layered, frosty, oddly warming.' }),
  crystal_tea: D({ name: 'Crystal Tea', energy: 60, buff: 'sense', secs: 300, value: 260, icon: { k: 'food', t: 'cup', c: 0xeaf7ff }, desc: 'Rings faintly as you sip.' }),
  sleepy_stew: D({ name: 'Sleepy Stew', energy: 140, buff: 'hearty', secs: 480, value: 150, icon: { k: 'food', t: 'stew', c: 0x6a5a8a }, desc: 'Like a nap in a bowl.' }),
  whisper_wrap: D({ name: 'Whisper Wrap', energy: 50, buff: 'sense', secs: 360, value: 140, icon: { k: 'food', t: 'wrap', c: 0xa0c080 }, desc: 'It whispers where the good rocks are.' }),
  lotus_feast: D({ name: 'Core Lotus Feast', energy: 200, maxEnergy: 10, buff: 'strong', buff2: 'glow', secs: 600, value: 5000, icon: { k: 'food', t: 'feast', c: 0xff9ad0 }, desc: 'Permanently raises your maximum energy.' }),
  grub_pancakes: D({ name: 'Honey Pancakes', energy: 45, buff: 'hearty', secs: 240, value: 60, icon: { k: 'food', t: 'pancakes', c: 0xe0b070 }, desc: 'A fluffy stack, tossed high, drowned in deep honey.' }),
  deviled_egg: D({ name: 'Deviled Egg', energy: 22, value: 30, icon: { k: 'food', t: 'egg', c: 0xffe08a }, desc: 'A simple snack from your hen.' }),
  // ---------------------------------------------------------------- Old Star's cave cookery
  mushroom_stew: D({ name: 'Mushroom Stew', energy: 70, buff: 'hearty', secs: 420, value: 120, icon: I('mushstew', 0x9a6a3a), desc: 'Buttery mushrooms, cave garlic and thyme, simmered slow. Old Star\'s favourite.' }),
  truffle_omelette: D({ name: 'Cave-Truffle Omelette', energy: 80, buff: 'lucky', secs: 600, value: 700, icon: I('trufomelette', 0xffd860), desc: 'Folded soft, with truffle shaved over the top. Your nose will find gems.' }),
  root_pie: D({ name: 'Root-Vegetable Pie', energy: 110, buff: 'pack', secs: 600, value: 160, icon: I('rootpie', 0xd8a050), desc: 'Tuber and carrot under a golden crust. Sits in your belly like ballast.' }),
  fried_grubs: D({ name: 'Fried Grubs', energy: 45, buff: 'strong', secs: 360, value: 70, icon: I('friedgrubs', 0xe0b040), desc: 'Crunchy, salty, golden. Pure protein.' }),
  salted_fish: D({ name: 'Salted Cave Fish', energy: 50, buff: 'guard', secs: 480, value: 140, icon: I('saltfish', 0xe8d8c0), desc: 'Salt-cured and oven-dried. Keeps for weeks; so does the toughness.' }),
  jam_toast: D({ name: 'Berry Jam Toast', energy: 50, buff: 'zippy', secs: 360, value: 90, icon: I('jamtoast', 0xd8304a), desc: 'Warm toast, sweet butter and bubbling cave-berry jam. A sugar rush for your swing.' }),
  berry_jam: D({ name: 'Cave Berry Jam', energy: 25, buff: 'zippy', secs: 200, value: 60, icon: I('jam', 0xc82a48), desc: 'A little pot of jam. Spoon it straight from the jar.' }),
  herb_bread: D({ name: 'Stone-Thyme Bread', energy: 60, buff: 'hearty', secs: 360, value: 70, icon: I('bread', 0xd8a060), desc: 'A crusty loaf flecked with thyme. Tear, share, repeat.' }),
  dino_frittata: D({ name: 'Dino-Egg Frittata', energy: 130, buff: 'pack', buff2: 'strong', secs: 600, value: 950, icon: I('frittata', 0xf0c040), desc: 'One egg, one pan, enough for a whole mine crew.' }),
  drake_jerky: D({ name: 'Spiced Drake Jerky', energy: 55, buff: 'strong', secs: 720, value: 260, icon: I('jerky', 0x8a3a2a), desc: 'Pepper-rubbed, salt-cured, oven-dried. Chew it before a big swing.' }),
  glow_pesto: D({ name: 'Glow-Moss Pesto Noodles', energy: 65, buff: 'glow', buff2: 'sense', secs: 480, value: 180, icon: I('pesto', 0x7af07a), desc: 'Green noodles that glow faintly in the dark. Your whiskers will too.' }),
  garlic_mash: D({ name: 'Garlic Tuber Mash', energy: 75, buff: 'sturdy', secs: 480, value: 80, icon: I('mash', 0xf0e0b0), desc: 'Pounded smooth with butter and cave garlic.' }),
  thyme_tea: D({ name: 'Stone-Thyme Tea', energy: 30, buff: 'cool', secs: 300, value: 50, icon: I('tea', 0xc8b060), desc: 'Herby, honeyed, cooling.' }),
  fish_pie: D({ name: 'Stargazer Fish Pie', energy: 120, buff: 'guard', secs: 600, value: 300, icon: I('fishpie', 0xd8a050), desc: 'The fish heads poke out of the crust to look at the stars. Down here, at the ceiling.' }),
  mystery_mush: D({ name: 'Mystery Mush', energy: 10, value: 1, icon: { k: 'food', t: 'mush', c: 0x8a9a5a }, desc: 'It is food. Technically.' }),
};

/** ingredient id → count; order-insensitive. hint: a nudge the pantry can give (see closeRecipe). */
export const RECIPES = [
  { dish: 'glowcap_soup', ing: { glowcap: 1, salt_crystal: 1 }, steps: ['chop', 'simmer', 'season'] },
  { dish: 'carrot_stew', ing: { cave_carrot: 1, mushroom: 1, salt_crystal: 1 }, steps: ['chop', 'chop', 'simmer', 'season'] },
  { dish: 'worm_noodles', ing: { worm: 1, flour: 1 }, steps: ['knead', 'roll', 'chop', 'simmer'] },
  { dish: 'fern_salad', ing: { blindfern: 1, cave_carrot: 1 }, steps: ['chop', 'grate', 'plate'] },
  { dish: 'fried_fish', ing: { blind_fish: 1, butter: 1 }, steps: ['chop', 'fry', 'plate'] },
  { dish: 'spicy_omelette', ing: { egg: 1, pepperroot: 1 }, steps: ['crack', 'chop', 'stir', 'fry'] },
  { dish: 'bubble_tea', ing: { bubblebulb: 1, rootbeer: 1 }, steps: ['chop', 'pour', 'stir'] },
  { dish: 'zippy_skewer', ing: { sparkmoss: 1, worm: 1 }, steps: ['chop', 'fry', 'plate'] },
  { dish: 'truffle_risotto', ing: { truffle: 1, butter: 1, mushroom: 1 }, steps: ['chop', 'simmer', 'stir', 'grate', 'plate'] },
  { dish: 'shrimp_skewer', ing: { frost_shrimp: 1, pepperroot: 1 }, steps: ['chop', 'fry', 'plate'] },
  { dish: 'ember_curry', ing: { emberbloom: 1, ashfern: 1, salt_crystal: 1 }, steps: ['chop', 'chop', 'simmer', 'season'] },
  { dish: 'frost_parfait', ing: { frostbloom: 1, honey: 1, egg: 1 }, steps: ['crack', 'stir', 'pour', 'plate'] },
  { dish: 'crystal_tea', ing: { crystal_lily: 1, honey: 1 }, steps: ['chop', 'pour', 'stir'] },
  { dish: 'sleepy_stew', ing: { gloomshroom: 1, cave_carrot: 1, salt_crystal: 1 }, steps: ['chop', 'chop', 'simmer', 'season'] },
  { dish: 'whisper_wrap', ing: { whisperweed: 1, flour: 1, egg: 1 }, steps: ['crack', 'knead', 'roll', 'chop', 'plate'] },
  { dish: 'lotus_feast', ing: { core_lotus: 1, truffle: 1, honey: 1 }, steps: ['chop', 'grate', 'simmer', 'season', 'plate'] },
  { dish: 'grub_pancakes', ing: { flour: 1, egg: 1, honey: 1 }, steps: ['crack', 'stir', 'flip', 'plate'] },
  { dish: 'deviled_egg', ing: { egg: 1, salt_crystal: 1 }, steps: ['simmer', 'chop', 'season'] },
  { dish: 'mushroom_stew', ing: { mushroom: 1, cave_garlic: 1, stone_thyme: 1, butter: 1 }, steps: ['chop', 'chop', 'simmer', 'stir', 'season'] },
  { dish: 'truffle_omelette', ing: { egg: 1, truffle: 1, butter: 1 }, steps: ['crack', 'stir', 'flip', 'grate', 'plate'] },
  { dish: 'root_pie', ing: { flour: 1, butter: 1, tunnel_tuber: 1, cave_carrot: 1 }, steps: ['chop', 'chop', 'knead', 'roll', 'bake'] },
  { dish: 'fried_grubs', ing: { grub: 1, butter: 1, salt_crystal: 1 }, steps: ['fry', 'season', 'plate'] },
  { dish: 'salted_fish', ing: { blind_fish: 1, salt_crystal: 1 }, steps: ['chop', 'season', 'bake'] },
  { dish: 'jam_toast', ing: { flour: 1, cave_berry: 1, honey: 1, butter: 1 }, steps: ['simmer', 'knead', 'bake', 'plate'] },
  { dish: 'berry_jam', ing: { cave_berry: 1, honey: 1 }, steps: ['mash', 'simmer', 'pour'] },
  { dish: 'herb_bread', ing: { flour: 1, stone_thyme: 1, butter: 1 }, steps: ['chop', 'knead', 'bake'] },
  { dish: 'dino_frittata', ing: { dino_egg: 1, tunnel_tuber: 1, stone_thyme: 1 }, steps: ['crack', 'chop', 'stir', 'fry', 'bake'] },
  { dish: 'drake_jerky', ing: { drake_meat: 1, pepperroot: 1, salt_crystal: 1 }, steps: ['chop', 'season', 'bake'] },
  { dish: 'glow_pesto', ing: { glow_moss: 1, cave_garlic: 1, flour: 1 }, steps: ['grate', 'knead', 'roll', 'chop', 'simmer'] },
  { dish: 'garlic_mash', ing: { tunnel_tuber: 1, cave_garlic: 1, butter: 1 }, steps: ['chop', 'simmer', 'mash', 'season'] },
  { dish: 'thyme_tea', ing: { stone_thyme: 1, honey: 1 }, steps: ['chop', 'pour', 'stir'] },
  { dish: 'fish_pie', ing: { blind_fish: 1, flour: 1, butter: 1, tunnel_tuber: 1 }, steps: ['chop', 'chop', 'knead', 'roll', 'bake'] },
];

/** Old Star's cooking lesson: the dish, what he hands you if you have none, and its steps. */
export const LESSON = { dish: 'glowcap_soup', ing: { glowcap: 1, salt_crystal: 1 } };

/** Most ingredients a dish takes (the pantry tray). */
export const MAX_INGS = 4;

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

/**
 * A recipe the chosen ingredients are one short of (all of them are in it, one more is needed),
 * preferring undiscovered ones. known(dish) → bool. Returns { recipe, missing: id } or null.
 */
export function closeRecipe(ids, known = () => false) {
  if (!ids.length) return null;
  let best = null;
  for (const r of RECIPES) {
    const rk = Object.keys(r.ing);
    if (rk.length !== ids.length + 1) continue;
    if (!ids.every((id) => rk.includes(id))) continue;
    const missing = rk.find((id) => !ids.includes(id));
    const cand = { recipe: r, missing };
    if (!best || (known(best.recipe.dish) && !known(r.dish))) best = cand;
  }
  return best;
}

/** Items that can go in the pot. */
export const COOKABLE_CATS = ['plant', 'critter', 'ingredient'];
export const COOKABLE_EXTRA = ['salt_crystal', 'egg'];

/** What you get when nothing matches. */
export const MUSH = { dish: 'mystery_mush', steps: ['chop', 'stir'] };

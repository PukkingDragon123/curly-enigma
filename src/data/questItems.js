// Quest items: things you carry for somebody (a lost mitten, an old pick, a letter). Key items:
// they take no pocket and weigh nothing (state.data.owned), and the quests hand them out and take
// them back (src/core/quests.js `grant` / deliveries). Merged into ITEMS by data/items.js.
// Icons: { k: 'quest', t } drawn by src/gfx/questIcons.js. Pure data (items.js runs in workers).

const Q = (id, name, t, desc) => [id, { name, cat: 'key', quest: true, value: 0, icon: { k: 'quest', t }, desc }];

export const QUEST_ITEMS = Object.fromEntries([
  Q('ember_mitten', "Dilly's Mitten", 'mitten', 'One left mitten, ember-proof, slightly singed. Smells of lava and regret.'),
  Q('brass_weights', "Vex's Brass Weights", 'weights', 'A set of brass assay weights, polished by kobold paws. One is a pebble painted gold.'),
  Q('tuck_pick', "Tuck's Old Pick", 'oldpick', 'A Lantern & Pick Company pick with T.T. burnt into the handle. Still sharp. Still stubborn.'),
  Q('sun_hymn', 'Rubbing of the Sun Hymn', 'rubbing', 'Charcoal on paper, rubbed off a ruin wall: raised runes that make a little tune when you run a paw along them.'),
  Q('star_coin', 'Star-Stamped Coin', 'starcoin', 'A gold coin stamped with a little red star. Old Star stamps everything that\'s his.'),
  Q('rocco_purse', "Rocco's Purse", 'purse', 'A purse of star-stamped coins and a note in terrible handwriting. For Old Star. From a raccoon.'),
  Q('loam_letter', "Nana Loam's Letter", 'letter', 'A letter addressed "To my Fern, Up Top, where the clouds are". Sealed with wax and hope.'),
]);

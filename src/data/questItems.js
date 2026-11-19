// Quest items: things you carry for somebody (a lost mitten, an old pick, a letter). Key items:
// they take no pocket and weigh nothing (state.data.owned), and the quests hand them out and take
// them back (src/core/quests.js `grant` / deliveries). Merged into ITEMS by data/items.js.
// Icons: { k: 'quest', t } drawn by src/gfx/questIcons.js. Pure data (items.js runs in workers).

const Q = (id, name, t, desc) => [id, { name, cat: 'key', quest: true, value: 0, icon: { k: 'quest', t }, desc }];

export const QUEST_ITEMS = Object.fromEntries([
  Q('ember_mitten', "Dilly's Mitten", 'mitten', 'Left one. Singed. Smells of lava.'),
  Q('brass_weights', "Vex's Brass Weights", 'weights', 'One of them is a pebble painted gold.'),
  Q('tuck_pick', "Tuck's Old Pick", 'oldpick', 'T.T. burnt into the handle. Still sharp.'),
  Q('sun_hymn', 'Rubbing of the Sun Hymn', 'rubbing', 'Run a paw over the runes. It hums.'),
  Q('star_coin', 'Star-Stamped Coin', 'starcoin', 'Old Star stamps all his things.'),
  Q('rocco_purse', "Rocco's Purse", 'purse', 'Coins, and a note in awful handwriting.'),
  Q('loam_letter', "Nana Loam's Letter", 'letter', '"To my Fern, Up Top, where the clouds are."'),
]);

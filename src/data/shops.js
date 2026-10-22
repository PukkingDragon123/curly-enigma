// Shops of Deep Town. Each shop has a keeper (see gfx/characters.js species list),
// a stock list, and some idle lines the keeper says when you walk up.
// minZone: item appears once the lift has reached that zone (keeps the first visit readable).

export const SHOPS = {
  tools: {
    name: 'Grubb\'s Picks & Chisels',
    keeper: { name: 'Grubb', species: 'starnose', age: 'elder', fur: 0x4a3a34, outfit: 'apron', outfitColor: 0x7a5a3a, glasses: true, hat: 'none', voice: 210 },
    sign: 'pick',
    stock: [
      { id: 'chisel_basic' }, { id: 'brush_basic' }, { id: 'support_beam' }, { id: 'glow_stake' }, { id: 'dynamite' },
      { id: 'pick_copper' }, { id: 'pick_iron', minZone: 2 }, { id: 'pick_steel', minZone: 3 },
      { id: 'drill_steam', minZone: 3 }, { id: 'xray_lamp', minZone: 2 }, { id: 'chisel_fine', minZone: 3 },
      { id: 'brush_badger', minZone: 3 }, { id: 'pick_mithril', minZone: 4 }, { id: 'xray_prism', minZone: 5 },
      { id: 'drill_lumite', minZone: 5 }, { id: 'pick_adamant', minZone: 5 },
      // explosives: bigger charges once you've been deep enough to need them
      { id: 'dynamite_bundle', minZone: 3 }, { id: 'blasting_charge', minZone: 4 },
      { id: 'pick_starmetal', minZone: 6 },
    ],
    lines: [
      'A good pick is a mole\'s best friend. Second best is a chisel.',
      'Ore\'s worth more in one piece, kid. Don\'t go smashing it.',
      'Heard a ceiling creak? Get out from under it.',
      'Back in my day we dug with our claws. Uphill. Both ways.',
      'Dynamite? Light it, throw it, and then you run. In that order, kid.',
    ],
  },
  grocer: {
    name: 'Nibble & Root',
    keeper: { name: 'Hazel', species: 'hedgehog', age: 'adult', fur: 0x8a6a4a, outfit: 'apron', outfitColor: 0xd9d0b8, hat: 'bandana', hatColor: 0xc94a3a, voice: 420 },
    sign: 'food',
    stock: [
      { id: 'grub_bar' }, { id: 'tea_flask' }, { id: 'hearty_pie' }, { id: 'flour' }, { id: 'butter' },
      { id: 'mushroom' }, { id: 'rootbeer' }, { id: 'honey' }, { id: 'cave_carrot' }, { id: 'worm' },
    ],
    lines: [
      'You look peckish, dear. Peckish moles dig crooked tunnels.',
      'Glowcaps and a pinch of salt make a lovely soup. Just saying.',
      'Fresh eggs? You\'ve got a hen, haven\'t you!',
      'Some folk cook pepperroot before going somewhere hot. Clever folk.',
    ],
  },
  furniture: {
    name: 'Burrow & Board',
    keeper: { name: 'Pip', species: 'rabbit', age: 'adult', fur: 0xd9c8b0, outfit: 'overalls', outfitColor: 0x3a6a9a, hat: 'none', voice: 360 },
    sign: 'chair',
    stock: 'furniture',
    lines: [
      'A burrow isn\'t a home until it has a rug. That\'s science.',
      'Everything here is handmade! Mostly by me! Some by my cousins!',
      'Painted windows are our bestseller. Can\'t think why.',
    ],
  },
  blueprints: {
    name: 'Inkwell Plans',
    keeper: { name: 'Professor Talpa', species: 'molerat', age: 'elder', fur: 0xe8b0a8, outfit: 'vest', outfitColor: 0x3a3a5a, glasses: true, hat: 'none', voice: 260 },
    sign: 'scroll',
    stock: [
      { id: 'bp_shortsword' }, { id: 'bp_axe' }, { id: 'bp_mace', minZone: 2 }, { id: 'bp_room1' },
      { id: 'bp_spear', minZone: 2 }, { id: 'bp_bellows', minZone: 3 }, { id: 'bp_longsword', minZone: 3 },
      { id: 'bp_room2', minZone: 3 }, { id: 'bp_warhammer', minZone: 4 }, { id: 'bp_rapier', minZone: 4 },
      { id: 'bp_magma_hearth', minZone: 4 }, { id: 'bp_greatsword', minZone: 5 }, { id: 'bp_room3', minZone: 5 },
      { id: 'bp_moleblade', minZone: 6 },
    ],
    lines: [
      'A blade is a question. Balance is the answer.',
      'Steel quenched from the wrong heat cracks like old cheese.',
      'Hammer where it\'s thick, my dear. The plan tells you where.',
      'Gravium in a blade makes it practically balance itself. Fascinating stuff.',
    ],
  },
  outfitter: {
    name: 'Gearwick Outfitters',
    keeper: { name: 'Dilly', species: 'armadillo', age: 'adult', fur: 0xa08a7a, outfit: 'vest', outfitColor: 0x6a4a2a, hat: 'cap', hatColor: 0x3a5a3a, voice: 300 },
    sign: 'helmet',
    stock: [
      { id: 'bag_medium' }, { id: 'helmet_brass' }, { id: 'grip_boots' }, { id: 'rubber_gloves', minZone: 2 },
      { id: 'bag_large', minZone: 2 }, { id: 'heat_suit', minZone: 3 }, { id: 'helmet_lumite', minZone: 3 },
      { id: 'ember_mitts', minZone: 4 }, { id: 'bag_huge', minZone: 4 }, { id: 'thermal_suit', minZone: 4 },
      { id: 'spring_boots', minZone: 4 }, { id: 'frost_gauntlets', minZone: 5 }, { id: 'helmet_sun', minZone: 5 },
      { id: 'bag_bottomless', minZone: 5 },
    ],
    lines: [
      'Rubber gloves need rubber sap, and sap comes from vines. Vines hang in the clay.',
      'Going deep? Heat\'ll cook you without a suit.',
      'Bigger bag, bigger haul. Simple maths.',
      'Ember mitts take lava-newt scales. Don\'t ask how I line them.',
    ],
  },
  assay: {
    name: 'Old Vex\'s Assay Office',
    keeper: { name: 'Old Vex', species: 'badger', age: 'elder', fur: 0x3a3a3a, outfit: 'vest', outfitColor: 0x5a2a2a, glasses: true, hat: 'none', voice: 170 },
    sign: 'scale',
    stock: 'sell',
    lines: [
      'Quality, quality, quality. A chipped nugget is a sad nugget.',
      'Ingots fetch more than ore. Weapons fetch more than ingots. Do the maths.',
      'Pristine pieces get a premium. Brush them out, don\'t bash them out.',
      'I\'ve got a commission posted, if you\'re handy at the anvil.',
    ],
  },
  ticket: {
    name: 'Surface Express',
    keeper: { name: 'Mr. Fennimore', species: 'fox', age: 'adult', fur: 0xe0782a, outfit: 'suit', outfitColor: 0x6a1a2a, hat: 'tophat', hatColor: 0x1a1a1a, glasses: 'monocle', voice: 330 },
    sign: 'ticket',
    stock: [{ id: 'exit_ticket' }],
    lines: [
      'One ticket. One way. Sunshine guaranteed.',
      'The lift goes up only once, darling. Make it count.',
      'A million gold is a lot. But have you SEEN the sky?',
      'Pets ride free, of course.',
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// The folk in the mine's burrows (src/deep/Traders.js, panel in src/deep/traders/shop.js). Walk to
// their burrow and press E on them. `panel: 'burrow'` routes ui.openShop(id) to the burrow panel.
//   npc: the id quests use (talk/sell/buy acts) · burrow: plan.burrows kind · markup: × buy prices
//   stock: what they sell ({ id, price?, minZone? }; price defaults to the item's price, else its
//   value × 2.2) · buys: what they buy ({ cats, ids, mult, label }) · wanted: one of these pays
//   wantedMult today · height: metres · greet/lines/bought/sold/poor/bye: what they say
//   rocco: the raccoon's weapon offers ({ grade multipliers, craving, haggle }) and daily deals.
export const BURROW_SHOPS = ['trader', 'herbalist', 'rocco', 'outpost'];

Object.assign(SHOPS, {
  trader: {
    name: 'The Trading Post', panel: 'burrow', npc: 'trader', burrow: 'trader', sign: 'scale',
    keeper: { name: 'Barnaby Burr', species: 'mole', age: 'adult', body: 'chubby', fur: 0x55443c, eyes: 'happy', outfit: 'apron', outfitColor: 0x8a6a3a, shirt: 0x3a6a9a, rolled: true, hat: 'cap', hatColor: 0x8a2a2a, glasses: false, brows: 'bushy', dirt: 0.25, blush: true, belt: 1, boots: 0x4a2e1e, mood: 'happy', voice: 250, seed: 311 },
    title: 'General store', height: 0.8,
    markup: 1.0,
    stock: [
      { id: 'support_beam' }, { id: 'glow_stake' }, { id: 'dynamite' }, { id: 'grub_bar' }, { id: 'tea_flask' },
      { id: 'hearty_pie' }, { id: 'worm' }, { id: 'cave_carrot' }, { id: 'chisel_basic' }, { id: 'brush_basic' },
      { id: 'chicken_feed' }, { id: 'cave_seeds' }, { id: 'bag_medium' }, { id: 'bag_large', minZone: 2 }, { id: 'bag_huge', minZone: 4 },
      { id: 'lamp_glowcap' }, { id: 'crate' }, { id: 'barrel' }, { id: 'rug_round' }, { id: 'dynamite_bundle', minZone: 3 }, { id: 'drake_meat', minZone: 2 },
    ],
    buys: { cats: ['mineral', 'gem', 'ingot'], mult: 0.85, label: 'Ore & gems' },
    wanted: ['copper_ore', 'tin_ore', 'iron_ore', 'coal', 'silver_ore', 'quartz', 'amber', 'amethyst', 'gold_ore', 'lumite', 'ruby'], wantedMult: 1.4,
    greet: ['Welcome, welcome! Mind the step, and the other step.', 'A customer! Come in out of the dark.', 'Ah, the new digger! Old Star\'s apprentice, yes?', 'Back again! I saved you the good shelf.'],
    lines: [
      'Ore\'s worth a little less up here than in town. But town is a long walk, isn\'t it?',
      'Everything on these shelves came down the rails. Mostly in one piece.',
      'I buy ore and gems. Clean lumps fetch more. Pristine ones, more still.',
      'Beams! Stakes! Snacks! The three pillars of not dying down here.',
      'Bigger pack, bigger haul. A satchel has twice the pockets of that sack of yours.',
      'Feed for your hen, seeds for your hen. I don\'t judge.',
      'The rails go on to Deep Town. I used to ride them. Before the cart lost a wheel.',
      'Rocco? Down past the herbalist? Don\'t buy anything that ticks.',
    ],
    bought: ['Pleasure doing business!', 'Use it well!', 'Good choice, very good choice.', 'That one\'s a bestseller. Well, a seller.'],
    sold: ['Into the crate it goes!', 'Lovely lumps. Lovely.', 'I\'ll get a fair price in town for these. Fair-ish.'],
    poor: ['Bit short, are we? It happens to the best of us. Mostly to me.', 'No credit, I\'m afraid. I tried credit once.'],
    bye: ['Come back soon! Mind the dark.', 'Safe digging!', 'Off you go, then. Bring me shiny things.'],
  },
  herbalist: {
    name: 'Herbalist\'s Hollow', panel: 'burrow', npc: 'herbalist', burrow: 'herbalist', sign: 'leaf',
    keeper: { name: 'Granny Thistle', species: 'hedgehog', age: 'elder', body: 'normal', fur: 0xc8a47a, eyes: 'sleepy', outfit: 'dress', outfitColor: 0x4a6a3a, fabric: 'dots', hat: 'bandana', hatColor: 0x7a3a5a, glasses: true, brows: 'bushy', scarf: 0x8a5a2a, dirt: 0.3, blush: true, cane: false, mood: 'stern', voice: 380, seed: 512 },
    title: 'Herbs, brews and cuttings', height: 0.72,
    markup: 1.1,
    stock: [
      { id: 'glowcap', price: 30 }, { id: 'cave_carrot' }, { id: 'pepperroot', price: 45 }, { id: 'blindfern', price: 26 },
      { id: 'whisperweed', price: 95 }, { id: 'sparkmoss', price: 85, minZone: 2 }, { id: 'rubber_sap', price: 55, minZone: 2 },
      { id: 'crystal_lily', price: 220, minZone: 3 }, { id: 'gloomshroom', price: 110, minZone: 3 }, { id: 'frostbloom', price: 360, minZone: 5 },
      { id: 'stone_thyme', price: 40 }, { id: 'cave_garlic', price: 36 }, { id: 'tunnel_tuber', price: 26 },
      { id: 'cave_seeds' }, { id: 'honey' }, { id: 'mushroom' }, { id: 'flour' }, { id: 'butter' },
      { id: 'tea_flask' }, { id: 'bubble_tea', price: 180 }, { id: 'glowcap_soup', price: 95 }, { id: 'crystal_tea', price: 560, minZone: 3 },
    ],
    buys: { cats: ['plant', 'critter', 'drop'], mult: 1.0, catMult: { plant: 1.2 }, label: 'Herbs & critters' },
    wanted: ['glowcap', 'whisperweed', 'pepperroot', 'sparkmoss', 'gloomshroom', 'crystal_lily', 'rubber_sap', 'bubblebulb', 'ashfern', 'emberbloom'], wantedMult: 1.5,
    greet: ['Hmph. Wipe your paws.', 'Oh, it\'s you. Don\'t touch the purple ones.', 'In or out, dear. The draught bruises my basil.', 'You smell of rock dust. Sit. No, not there.'],
    lines: [
      'Mint, for the head. Pepperroot, for the cold. Patience, for everything else.',
      'Plant a glowcap in a planter and you\'ll have three by morning. Don\'t tell anyone I said.',
      'I pay well for herbs. I do NOT pay for squashed herbs.',
      'That cauldron has been simmering since before your grandmother dug her first hole.',
      'Whisperweed leans toward ore, they say. It leans toward gossip, I say.',
      'Old Star still owes me for a jar of salve. Tell him I remember.',
    ],
    bought: ['Water it. Talk to it. Not too much.', 'Mind you use it before it turns.', 'There. Now go away and be healthy.'],
    sold: ['Hm. These will do.', 'Fresh enough. Barely.', 'Into the drying rack with you.'],
    poor: ['Herbs cost money, dear. Money costs digging.', 'Come back when your pockets jingle.'],
    bye: ['Mind the purple ones on your way out.', 'Wrap up warm.', 'Off with you.'],
  },
  rocco: {
    name: 'Rocco\'s Storage', panel: 'burrow', npc: 'rocco', burrow: 'raccoon', sign: 'key',
    // built on the fox and repainted as a raccoon (src/deep/traders/rocco.js), in a long coat
    keeper: { name: 'Rocco', raccoon: true, voice: 190, species: 'fox', age: 'adult', body: 'chubby', fur: 0x8c888a, eyes: 'wide', eyeColor: 0x3a2a1a, outfit: 'shirt', outfitColor: 0x7a3030, fabric: 'stripe', hat: 'cap', hatColor: 0x3a3436, brows: 'angry', earring: 0xe8c050, dirt: 0.35, blush: false, mood: 'smug', seed: 4077, patches: 1, freckles: false, tuft: false, shirt: 0x8a3a3a, belt: 0, boots: 0x2e2420, rolled: false },
    title: 'No questions asked', height: 0.84,
    markup: 1.25,
    stock: [
      { id: 'amber_bug', price: 1400 }, { id: 'fossil', price: 190 }, { id: 'drake_meat', price: 150 }, { id: 'spider_silk', price: 210 }, { id: 'echo_crystal', price: 1050, minZone: 2 },
      { id: 'gravium', price: 960, minZone: 2 }, { id: 'truffle', price: 1150, minZone: 2 }, { id: 'wisp_essence', price: 2100, minZone: 3 },
      { id: 'bp_mace', price: 1800, minZone: 2 }, { id: 'bp_spear', price: 3600, minZone: 2 }, { id: 'bp_longsword', price: 7200, minZone: 3 }, { id: 'bp_rapier', price: 30000, minZone: 4 },
      { id: 'music_box', price: 2600 }, { id: 'painting_sun', price: 1100 }, { id: 'plushie', price: 220 }, { id: 'clock', price: 2200 },
      { id: 'xray_lamp', price: 5900, minZone: 2 }, { id: 'spring_boots', price: 26000, minZone: 4 },
    ],
    oddities: 7, // how many of the stock he has out today
    buys: { cats: ['gem'], weapons: true, mult: 0.9, label: 'Weapons & shinies' },
    grade: { S: 1.45, A: 1.3, B: 1.12, C: 0.95, D: 0.8, F: 0.6 },
    craving: 1.25, // today's favourite weapon type pays this much more
    haggle: { tries: 3, patience: 3, step: [0.06, 0.12], miss: 0.05 },
    greet: ['Psst. Hey. You. Yeah, you. Come in, close the... there\'s no door. Fine.', 'Welcome to Rocco\'s! Everything\'s legal. Probably.', 'Ah! My favourite customer. Don\'t tell the others.', 'Shh! ...Oh, it\'s you. Thought you were the herbalist.'],
    lines: [
      'I buy blades. Good ones, bad ones, ones with a little history. No questions.',
      'That painting? Genuine surface art. That\'s the SUN. Very rare. Very hot.',
      'The tarp? Don\'t worry about the tarp.',
      'A forged blade with a good grade? Rocco pays like a king. A small, nervous king.',
      'Everything here fell off a cart. Lots of carts. Unlucky carts.',
      'Those crates at the back aren\'t hiding anything. Definitely not a door.',
      'Haggle all you like. I love haggling. I\'m very bad at it. Ha. Ha.',
    ],
    bought: ['Pleasure! It was never here. You were never here.', 'Excellent taste. Questionable source. Excellent taste.', 'Mind the tag, it says "evidence". Typo.'],
    sold: ['Ooh. OOH. This one\'s going to a good home. A secret home.', 'Into the coat it goes.', 'Lovely. Nobody saw that.'],
    poor: ['No gold, no goods. That\'s the only rule. Well, the main rule.', 'Credit? Do I look like a bank? Don\'t answer that.'],
    bye: ['You didn\'t see me. I didn\'t see you.', 'Come back with more pointy things!', 'Use the front door. Not the... other one.'],
  },
  outpost: {
    name: 'The Deep Outpost', panel: 'burrow', npc: 'outpost', burrow: 'outpost', sign: 'pick',
    keeper: { name: 'Warden Brask', species: 'badger', age: 'adult', body: 'stocky', fur: 0x7a7a7c, eyes: 'bead', outfit: 'vest', outfitColor: 0x5a3a24, shirt: 0x6a7a4a, hat: 'helmet', hatColor: 0xd8a020, brows: 'angry', scarf: 0x8a2a2a, dirt: 0.7, blush: false, belt: 2, boots: 0x3a2a22, mood: 'stern', voice: 150, seed: 913 },
    title: 'Last stop for supplies', height: 0.82,
    markup: 1.6,
    stock: [
      { id: 'dynamite' }, { id: 'dynamite_bundle' }, { id: 'blasting_charge', minZone: 4 }, { id: 'support_beam' }, { id: 'glow_stake' },
      { id: 'grub_bar' }, { id: 'tea_flask' }, { id: 'hearty_pie' }, { id: 'spicy_omelette', price: 160 }, { id: 'ember_curry', price: 520 },
      { id: 'frost_parfait', price: 700, minZone: 5 }, { id: 'pepperroot', price: 45 }, { id: 'rubber_gloves' }, { id: 'heat_suit', minZone: 4 },
    ],
    buys: { cats: ['mineral', 'gem'], mult: 0.65, label: 'Ore & gems' },
    greet: ['Halt. ...Fine. You look harmless. Wipe your boots.', 'Another one, this deep? You\'re either brave or lost.', 'Supplies are dear down here. Hauling them\'s dearer.', 'Hm. Still breathing. Good. Keep it that way.'],
    lines: [
      'Everything down here costs more. Blame the stairs.',
      'Heat suits. Get one before the Magma Deep gets you.',
      'I\'ll take your ore. Not for much. Long way up with it.',
      'Dynamite: light, throw, run. If you mix up the order, it\'s on you.',
      'Saw a light down the east tunnel last night. Didn\'t go look. That\'s how you get old.',
      'This post has stood forty years. I\'ve stood it twelve. Mostly awake.',
    ],
    bought: ['Signed for. Don\'t lose it.', 'Supplies issued.', 'Use it wisely. Or at least quickly.'],
    sold: ['Logged. It goes up on the next haul.', 'Fine. Not much, mind.', 'It\'ll fetch more in town. Your feet, your choice.'],
    poor: ['No coin, no kit. Outpost rules.', 'Short. Come back richer.'],
    bye: ['Stay out of the lava.', 'Back before the lamps go out.', 'Dismissed.'],
  },
});

/** Ambient townsfolk chatter. Hints, gossip and nonsense, never instructions. */
export const TOWN_CHATTER = [
  'My cousin grabbed Bioxide bare-pawed. His fur stood up for a week!',
  'Whisperweed always leans toward something shiny.',
  'If the ceiling starts dribbling dust, RUN.',
  'I put a beam under my kitchen ceiling. Best decision of my life.',
  'Gravium floats, you know. Lost a whole nugget up a crack once.',
  'Echo crystals sing when you hit near them. Then they don\'t.',
  'Ore slugs! Ate my best silver vein. I could cry.',
  'Water plus lava equals obsidian. My grandma taught me that.',
  'They say the sun is warm and enormous. Sounds fake.',
  'A truffle smells like... like... oh, I can\'t describe it.',
  'Don\'t swing a drill near crystals. Trust me.',
  'Moonsilver goes dull if you leave it out. Like my husband.',
  'Have you tried brushing a dust bunny? It\'s adorable.',
  'Someone saved a million gold once. Never saw them again. Lucky!',
  'The deeper you go, the stranger it gets.',
  'X-ray lamps go right through rock. Just not through voidstone.',
  'Smelting with extra coal? Makes steel. Fancy!',
  'Nugget looks extra fluffy today.',
  'I heard you can see the whole sky at once up there. All of it!',
  'Mum says if I dig hard enough I can reach the surface. I\'m on day 4.',
];

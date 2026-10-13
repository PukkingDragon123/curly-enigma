// Shops of Deep Town. Each shop has a keeper (see gfx/characters.js species list),
// a stock list, and some idle lines the keeper says when you walk up.
// minZone: item appears once the lift has reached that zone (keeps the first visit readable).

export const SHOPS = {
  tools: {
    name: 'Grubb\'s Picks & Chisels',
    keeper: { name: 'Grubb', species: 'starnose', age: 'elder', fur: 0x4a3a34, outfit: 'apron', outfitColor: 0x7a5a3a, glasses: true, hat: 'none', voice: 210 },
    sign: 'pick',
    stock: [
      { id: 'chisel_basic' }, { id: 'brush_basic' }, { id: 'support_beam' }, { id: 'glow_stake' },
      { id: 'pick_copper' }, { id: 'pick_iron', minZone: 2 }, { id: 'pick_steel', minZone: 3 },
      { id: 'drill_steam', minZone: 3 }, { id: 'xray_lamp', minZone: 2 }, { id: 'chisel_fine', minZone: 3 },
      { id: 'brush_badger', minZone: 3 }, { id: 'pick_mithril', minZone: 4 }, { id: 'xray_prism', minZone: 5 },
      { id: 'drill_lumite', minZone: 5 }, { id: 'pick_adamant', minZone: 5 },
    ],
    lines: [
      'A good pick is a mole\'s best friend. Second best is a chisel.',
      'Ore\'s worth more in one piece, kid. Don\'t go smashing it.',
      'Heard a ceiling creak? Get out from under it.',
      'Back in my day we dug with our claws. Uphill. Both ways.',
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

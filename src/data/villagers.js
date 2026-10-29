// Deep Town's people, by name: who they are, where they sit, what they talk about, which tales
// they know. The townsfolk in src/town/folk.js are built from seeds; a villager with a `seed` is
// that townsperson (they get this name). Shop keepers are listed by their shop id (`keeper`), which
// is also their npc id in quests and `act { type: 'talk', npc }` (docs/REMAKE.md).
//
// VILLAGERS[npc] = { name, seed | keeper, look (the overrides folk.js builds them with, for portraits),
//   title, where, ink, about,
//   wait: [lines said while you work on their request], thanks: [lines after it's done],
//   tales: [lore ids they tell, in order (src/data/lore.js)] }
// Quest data (src/data/sideQuests.js) uses these ids as `giver` / `from` / `deliver.to`.

export const VILLAGERS = {
  // ------------------------------------------------------------ on the plaza benches
  tuck: {
    name: 'Grandpa Tuck', look: { species: 'mole', age: 'elder', cane: true }, seed: 101, title: 'retired miner', where: 'The north bench on the plaza', ink: '#6a4a2a',
    about: 'Dug for the Lantern & Pick Company when he was a pup. Remembers everything, in the wrong order.',
    wait: ['Take your time, take your time. The rock\'s not going anywhere. Well. It is, slowly.', 'In my day we did that with a spoon.'],
    thanks: ['That takes me back. Mind you, most things do.', 'You\'ve a digger\'s paws. I can tell from here.'],
    tales: ['m_company', 'os_astor'],
  },
  mabel: {
    name: 'Granny Mabel', look: { species: 'mole', age: 'elder', glasses: true, outfit: 'dress' }, seed: 102, title: 'baker, festival-keeper', where: 'The north bench on the plaza', ink: '#a04a5a',
    about: 'Tuck\'s wife. Runs the Sunbeam Festival, and everyone\'s business.',
    wait: ['The festival won\'t bake itself, dear. Well, the pies will, if you put them in.', 'Off you go! And wear a scarf, it\'s draughty in the deep.'],
    thanks: ['Oh, you lovely thing.', 'There. Now we\'re getting somewhere.'],
    tales: ['t_sunbeam', 'u_coop'],
  },
  burdock: {
    name: 'Old Burdock', look: { species: 'hedgehog', age: 'elder', cane: true }, seed: 103, title: 'lift-crank, retired', where: 'The west bench on the plaza', ink: '#5a5a3a',
    about: 'Cranked the town lift for fifty-one years. Taught Bramble. Regrets it daily.',
    wait: ['Well? The bells won\'t ring themselves.', 'Hmph.'],
    thanks: ['Not bad. Not good. Not bad.', 'Hmph. Thank you. Don\'t tell anyone I said that.'],
    tales: ['t_lift', 't_council'],
  },
  snorri: {
    name: 'Snorri', look: { species: 'badger', age: 'adult', body: 'chubby', hat: 'beanie' }, seed: 104, title: 'night watchman', where: 'Asleep on the east bench', ink: '#4a4a6a',
    about: 'Watches the town all night. Sleeps all day. Nobody has ever seen him do both at once.',
    wait: ['Zzz... strong... tea... zzz.', 'Mmf. Is it night yet?'],
    thanks: ['I am AWAKE. I can hear colours.', 'Zzz. Thank you. Zzz.'],
    tales: ['cr_trolls'],
  },
  hollis: {
    name: 'Old Hollis', look: { species: 'mole', age: 'elder', cane: true, glasses: true, outfit: 'vest', outfitColor: 0x6a4a3a, hat: 'cap', hatColor: 0x5a4a3a, brows: 'bushy' }, seed: 108, title: 'the town\'s oldest', where: 'The bench by the boarded tunnel', ink: '#7a3a2a',
    about: 'Sits by the old Shaft Seven tunnel and watches it. He was in it, once, the night it fell.',
    wait: ['Go on, youngster. The past keeps.', 'I\'ll be here. I\'m always here.'],
    thanks: ['You\'ve done an old mole a kindness.', 'Forty years I\'ve waited to hear that.'],
    tales: ['u_chest', 'k_tunnel'],
  },
  // ------------------------------------------------------------ the market and the plaza
  morel: {
    name: 'Morel', look: { age: 'adult', outfit: 'apron', outfitColor: 0xd9d0b8, hat: 'none', hatColor: 0x3a6ac9, species: 'hedgehog' }, seed: 170, title: 'mushroom seller', where: 'The mushroom stall, west of the fountain', ink: '#5a7a3a',
    about: 'Sells glowcaps, swears by them, and has never once been seen eating one.',
    wait: ['One of everything, mind. Everything!', 'The deep grows things nobody\'s named yet.'],
    thanks: ['Ooh. Ooh! Look at that one.', 'A proper sampler. I\'ll put it in the window.'],
    tales: ['cr_hollow'],
  },
  finn: {
    name: 'Finnick', look: { age: 'adult', outfit: 'apron', outfitColor: 0x8ab0d0, hat: 'bandana', hatColor: 0x3a6ac9, species: 'frog' }, seed: 171, title: 'fishmonger', where: 'The fish stall, east of the fountain', ink: '#3a6a8a',
    about: 'Sells blind fish. Says they don\'t mind. Says it a lot.',
    wait: ['Cold ones, mind. Frost shrimp go off if you look at them.', 'Still wiggling, that\'s what I want.'],
    thanks: ['Fresh! Frosty! Wonderful!', 'That\'s a week\'s stock, that is.'],
    tales: ['cr_fish'],
  },
  garnet: {
    name: 'Garnet', look: { age: 'adult', outfit: 'apron', outfitColor: 0xc8a0d8, hat: 'none', hatColor: 0x3a6ac9, species: 'molerat' }, seed: 172, title: 'gem seller', where: 'The gem stall on the plaza', ink: '#8a2a4a',
    about: 'Polishes every stone with her own paws. Prices them with her heart, which is greedy.',
    wait: ['Red, blue and green. Like a sunset, I\'m told.', 'Polished or not, I\'ll take them.'],
    thanks: ['Oh, they\'ll make a necklace fit for the Council.', 'Look at that fire in the ruby!'],
    tales: ['cr_drakes'],
  },
  lark: {
    name: 'Lark', look: { species: 'golden', age: 'adult', hat: 'cap', hatColor: 0xc94a3a, outfit: 'vest', outfitColor: 0x6a3a6a, scarf: 0xe0b030 }, seed: 105, title: 'busker', where: 'By the fountain, with a lute', ink: '#6a3a6a',
    about: 'A golden mole who sings songs about the sun. Has never seen it. Sings them anyway.',
    wait: ['♪ ...and the strings went twang... ♪', 'A song is a long way down without a tune.'],
    thanks: ['♪ Oh, that\'s the one! ♪', 'Listen, listen, LISTEN to that.'],
    tales: ['cr_wraiths'],
  },
  puddle: {
    name: 'Puddle', look: { species: 'frog', age: 'adult', hat: 'bandana', hatColor: 0x3a6ac9, outfit: 'vest', outfitColor: 0x7a5a3a }, seed: 106, title: 'fisher', where: 'Fishing in the fountain', ink: '#3a7a5a',
    about: 'Fishes in the town fountain. There are no fish in the town fountain. That\'s the point, he says.',
    wait: ['Patience. Patience is bait for the mind.', 'Shh. You\'ll scare the nothing.'],
    thanks: ['A bite! Of a kind.', 'Now that\'s a catch.'],
    tales: ['t_fountain'],
  },
  bristle: {
    name: 'Bristle', look: { species: 'shrew', age: 'adult', outfit: 'apron', outfitColor: 0xd9d0b8, hat: 'bandana', hatColor: 0xc94a3a }, seed: 107, title: 'street sweeper', where: 'Sweeping the west promenade', ink: '#7a5a3a',
    about: 'Sweeps the west promenade from end to end and back again. Knows every crumb by name.',
    wait: ['Fluffy ones. The dust bunnies. Not real bunnies, I\'m not a monster.', 'Sweep, sweep.'],
    thanks: ['Lovely and fluffy.', 'You\'re tidier than you look.'],
    tales: ['cr_kobolds'],
  },
  digby: {
    name: 'Digby', look: { species: 'mole', age: 'adult', backpack: true, hat: 'hardhat', hatColor: 0xe0b030, outfit: 'overalls', dirt: 0.95, body: 'tall' }, seed: 110, title: 'ore hauler', where: 'Hauling ore to the lift', ink: '#8a6a2a',
    about: 'Hauls ore from the pile to the lift, all day, every day. Loves it. Won\'t say why.',
    wait: ['The furnace eats coal like I eat lunch.', 'Careful down there. The old workings bite.'],
    thanks: ['That\'ll keep the lift going a month.', 'You\'re all right, you are.'],
    tales: ['cr_nibbler'],
  },
  nubs: {
    name: 'Nubs', look: { species: 'starnose', age: 'adult', backpack: true, hat: 'hardhat', hatColor: 0xe0b030, outfit: 'overalls', dirt: 0.95, body: 'stocky' }, seed: 111, title: 'ore hauler, star-nose', where: 'Hauling ore to the lift', ink: '#a04a6a',
    about: 'A young star-nosed mole. Feels the rock with all twenty-two fingers. Asks a lot of questions.',
    wait: ['Have you seen it yet? The idol? With the nose?', 'My nose itches when I think about the old halls.'],
    thanks: ['It\'s got MY nose! Look! Look!', 'I knew it. I KNEW it.'],
    tales: ['s_noses'],
  },
  // ------------------------------------------------------------ families and neighbours
  primrose: {
    name: 'Mrs. Primrose', look: { species: 'mole', age: 'adult', outfit: 'dress', outfitColor: 0xb8a070, hat: 'bow', hatColor: 0xc94a3a }, seed: 120, title: 'mother of twins', where: 'Strolling the plaza with Bean and Sprout', ink: '#a06a3a',
    about: 'Has twins, Bean and Sprout, and no time. Has very strong opinions about eggs.',
    wait: ['Fresh ones, please. The twins can tell.', 'Bean! Put that down! Not you, dear.'],
    thanks: ['Breakfast is saved!', 'You\'re a treasure.'],
    tales: [],
  },
  tilly: {
    name: 'Tilly', look: { age: 'kid', species: 'mole' }, seed: 130, title: 'kid, ringleader', where: 'Playing tag in the south-east of the plaza', ink: '#c24a3a',
    about: 'Runs the plaza\'s gang of three. Dares everyone to do everything.',
    wait: ['You\'re not SCARED, are you?', 'Double dare. Triple dare.'],
    thanks: ['WHOA. You actually did it!', 'You\'re in the gang now. Honorary.'],
    tales: ['k_tunnel'],
  },
  hops: {
    name: 'Hops', look: { age: 'kid', species: 'rabbit' }, seed: 131, title: 'kid, beetle collector', where: 'Playing tag in the south-east of the plaza', ink: '#3a8a6a',
    about: 'Collects beetles. Names them all. Has never lost one. Says so, anyway.',
    wait: ['The glowing ones! With the green bottoms!', 'Don\'t squish them!'],
    thanks: ['I\'ll call this one Nugget Two.', 'They\'re so GLOWY.'],
    tales: [],
  },
  twitch: {
    name: 'Twitch', look: { age: 'kid', species: 'starnose' }, seed: 132, title: 'kid, star-nose', where: 'Playing tag in the south-east of the plaza', ink: '#a04a8a',
    about: 'A very small star-nosed mole who has never seen a chicken. Desperately wants to.',
    wait: ['Is she here? Is she here? Is the hen here?', 'Do hens have noses? Do they?'],
    thanks: ['SHE CLUCKED AT ME.', 'Best day. Best day ever.'],
    tales: [],
  },
  clem: { name: 'Clem', look: { age: 'adult' }, seed: 140, title: 'gossip', where: 'Chatting by the grocer', ink: '#6a5a4a', about: 'Knows everything about everyone, and half of it is true.', wait: [], thanks: [], tales: [] },
  dottie: { name: 'Dottie', look: { age: 'adult' }, seed: 141, title: 'gossip', where: 'Chatting by the grocer', ink: '#8a5a6a', about: 'Clem\'s best friend and fiercest rival in gossip.', wait: [], thanks: [], tales: [] },
  rue: { name: 'Rue', look: { age: 'adult' }, seed: 142, title: 'gossip', where: 'Chatting on the plaza\'s south side', ink: '#5a6a4a', about: 'Asks questions and doesn\'t wait for answers.', wait: [], thanks: [], tales: [] },
  sorrel: { name: 'Great-Aunt Sorrel', look: { age: 'elder' }, seed: 143, title: 'gossip, elder', where: 'Chatting on the plaza\'s south side', ink: '#6a4a5a', about: 'Remembers the Long Rumble. Mentions it hourly.', wait: [], thanks: [], tales: [] },
  barley: { name: 'Barley', look: { age: 'adult' }, seed: 144, title: 'neighbour', where: 'Chatting in the back lanes', ink: '#7a6a3a', about: 'Bakes on Tuesdays. Talks every day.', wait: [], thanks: [], tales: [] },
  cob: { name: 'Cob', look: { age: 'adult' }, seed: 145, title: 'neighbour', where: 'Chatting in the back lanes', ink: '#5a4a3a', about: 'Barley\'s neighbour. Agrees with everything, eventually.', wait: [], thanks: [], tales: [] },
  wren: { name: 'Wren', look: { age: 'adult', species: 'vole' }, seed: 150, title: 'window shopper', where: 'Outside the shops on the west wall', ink: '#6a6a3a', about: 'Has looked at every hat in Gearwick\'s window. Has bought none.', wait: [], thanks: [], tales: [] },
  marl: { name: 'Marl', look: { age: 'adult', species: 'molerat' }, seed: 151, title: 'window shopper', where: 'Outside Grubb\'s', ink: '#5a5a6a', about: 'Wants a better pick. Wants it cheaper.', wait: [], thanks: [], tales: [] },
  bess: {
    name: 'Bess Prickle', look: { age: 'adult', species: 'hedgehog' }, seed: 190, title: 'neighbour', where: 'On her doorstep in the back lanes (south-west)', ink: '#8a4a3a',
    about: 'Looks after her husband Albert, who is always poorly, and her doorstep, which is always clean.',
    wait: ['Proper soup, mind. Albert can tell the difference.', 'Achoo. That was Albert. From indoors.'],
    thanks: ['Albert says thank you. He says it very weakly.', 'Bless you. Not a sneeze. I mean it.'],
    tales: [],
  },
  loam: {
    name: 'Nana Loam', look: { age: 'elder', species: 'mole' }, seed: 191, title: 'neighbour, elder', where: 'On her doorstep in the back lanes (south)', ink: '#6a4a6a',
    about: 'Her granddaughter took the Surface Express forty years ago. She still writes to her.',
    wait: ['Mr. Fennimore will know what to do with it.', 'Go on, dear. Mind it doesn\'t get crumpled.'],
    thanks: ['Up it goes. Up and up.', 'She\'ll read it in the sunshine.'],
    tales: ['t_letters'],
  },
  clover: {
    name: 'Clover', look: { age: 'adult', species: 'rabbit' }, seed: 192, title: 'neighbour, gardener', where: 'On her doorstep in the back lanes (south-east)', ink: '#4a8a4a',
    about: 'Grows glowing begonias on her doorstep. Better than Hazel\'s. Says so.',
    wait: ['Go and look at Hazel\'s. Then come back and tell me.', 'Mine glow. Hers... shimmer. Barely.'],
    thanks: ['Ha! I knew it.', 'Well. Well, well.'],
    tales: ['cr_glow'],
  },
  // ------------------------------------------------------------ the keepers (npc id = shop id)
  tools: { name: 'Grubb', keeper: 'tools', title: 'picks & chisels', where: 'Grubb\'s Picks & Chisels, north wall', ink: '#7a3a1a', about: 'An old star-nose who sells the best picks in the deep and says so. Gruff. Fair.', wait: ['Well? Hammer\'s getting cold.'], thanks: ['Hrm. Good work.'], tales: [] },
  grocer: { name: 'Hazel', keeper: 'grocer', title: 'grocer', where: 'Nibble & Root, west wall', ink: '#3d6a2a', about: 'Runs the grocery. Knows what\'s ripe, what\'s rotten, and who paints their begonias.', wait: ['Fresh, mind. Fresh!'], thanks: ['Lovely! Into the basket.'], tales: [] },
  furniture: { name: 'Pip', keeper: 'furniture', title: 'carpenter', where: 'Burrow & Board, west wall', ink: '#3a6a9a', about: 'Makes chairs, beds and excuses. The chairs are very good.', wait: ['Measure twice, dig once!'], thanks: ['Ooh, that\'ll do nicely.'], tales: [] },
  blueprints: { name: 'Professor Talpa', keeper: 'blueprints', title: 'scholar of the Old Ones', where: 'Inkwell Plans, west wall', ink: '#3a3a6a', about: 'Draws plans for a living and studies the ruins for love. Has a theory about noses.', wait: ['Copy every line. Every line!'], thanks: ['Fascinating. Fas-cin-a-ting.'], tales: [] },
  outfitter: { name: 'Dilly', keeper: 'outfitter', title: 'outfitter', where: 'Gearwick Outfitters, west wall', ink: '#6a4a2a', about: 'Sells hats, mitts and suits, and loses mittens. Offers pies as rewards.', wait: ['Have you looked near the lava? Everything ends up near the lava.'], thanks: ['My mitten! My MITTEN!'], tales: ['cr_spiders'] },
  assay: { name: 'Old Vex', keeper: 'assay', title: 'assayer', where: 'Old Vex\'s Assay Office, north wall', ink: '#5a2a2a', about: 'Weighs what you bring and pays what it\'s worth. Her family\'s scale has never lied.', wait: ['Weights don\'t walk. Kobolds do.'], thanks: ['Hm. Correct. That\'s my highest praise.'], tales: ['t_assay'] },
  ticket: { name: 'Mr. Fennimore', keeper: 'ticket', title: 'Surface Express', where: 'The ticket booth, under the sunbeam', ink: '#6a1a2a', about: 'Sells the only tickets up. One way. A million gold. Calls everyone "darling".', wait: ['Darling, the sun waits for no one. Well, it waits for everyone. It\'s very patient.'], thanks: ['Darling! Marvellous!'], tales: [] },
  lift: { name: 'Bramble', look: { name: 'Bramble', species: 'vole', age: 'elder', body: 'stocky', fur: 0x8a6a4a, outfit: 'overalls', outfitColor: 0x7a5a3a, hat: 'cap', hatColor: 0x3a5a3a, eyes: 'happy', brows: 'bushy', dirt: 0.6, seed: 31, blush: true }, keeper: 'lift', title: 'lift operator', where: 'At the crank of the town lift', ink: '#3a5a3a', about: 'Runs the town lift. Hums while cranking. Has never dropped anyone. Twice.', wait: ['She squeaks, you know. Like a mouse in a boot.'], thanks: ['Smooth as butter now!'], tales: [] },
};

/** Town npc id for a townsfolk seed (src/town/folk.js `make(seed, ...)`). */
export const SEED_NPC = Object.fromEntries(Object.entries(VILLAGERS).filter(([, v]) => v.seed).map(([k, v]) => [v.seed, k]));

/** Is this npc one of Deep Town's (a townsperson or a keeper)? */
export const isTownNpc = (npc) => !!VILLAGERS[npc];

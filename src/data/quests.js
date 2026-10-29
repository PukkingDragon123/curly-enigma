// Quests: Old Star's lessons, his follow-ups, and requests from the folk in their burrows.
// The engine is src/core/quests.js; it only listens to `act` events (docs/REMAKE.md).
//
// QUESTS[id] = {
//   title, giver (NPCS key), kind: 'main' | 'story' | 'request',
//   intro  (the giver's words when it starts, html) · outro (when it's done)
//   steps: [{ id, text (the objective line, short), hint (the book),
//     on: matcher | [matchers]   act matchers: { type, field: value | [values] | (v, act) => bool }
//     need: (state) => bool      only count matching acts while this holds
//     n, sum: 'field', unique: 'field'   count n matching acts (or sum a field, or unique values)
//     check: (state) => bool     done as soon as this holds (checked on every change)
//     count: (state) => number   progress from the state (done at n)
//     deliver: { to: npc, items: { id: n } }   hand the items over by talking to them
//     lesson: 'name' | [names]   (lessons) a { type: 'lesson', step } act; later steps skip ahead
//     where: { place | burrow | ruin | zone }   a mark for the map }],
//   reward: { gold, items: { id: n }, sp, lore: [ids], recipe: [dish ids], rep: n | { npc: n } },
//   next: [ids], requires: [ids], when: (state) => bool (offered/started only while it holds),
//   auto: true (starts once `requires` are done) · from: npc (offered when you talk to them)
//   ask: true (Deep Town folk: offered in their dialog, Accept / Not now) · gives: { id: n } on start
//   urgent: true (a story beat: offered first, even while the giver has other work under way) }
// Kinds: 'main' (the million), 'story' (Old Star's follow-ups), 'request' (the burrow folk),
// 'village' (Deep Town's folk and keepers), 'lore' (the Old Ones, Old Star's past).
// Side quests (village, lore, more requests) live in ./sideQuests.js; the folk in ./villagers.js.
// Text may use {trader} {herbalist} {rocco} {outpost} for the folk's names (see npcName).
import { SHOPS } from './shops.js';
import { VILLAGERS } from './villagers.js';
import { SIDE_QUESTS, BURROW_QUESTS } from './sideQuests.js';

export const ZONE_DEPTHS = [0, 25, 55, 90, 130, 170, 210]; // zone n spans [n-1]..[n] (Generator.js)
export const ZONE_NAMES = [null, 'Rootsoil', 'Clayworks', 'Crystal Grotto', 'Magma Deep', 'Frost Vault', 'The Core'];

/** The folk who hand out work. ink: their color on the quest page and the map. */
export const NPCS = {
  oldstar: { name: 'Old Star', short: 'Old Star', where: 'His house above the mine', ink: '#8a3a1a', mood: 'calm' },
  trader: { name: 'the trader', short: 'Trader', where: 'The Trading Post', burrow: 'trader', ink: '#7a5a14' },
  herbalist: { name: 'the herbalist', short: 'Herbalist', where: "Herbalist's Hollow", burrow: 'herbalist', ink: '#3d6a2a' },
  rocco: { name: 'Rocco', short: 'Rocco', where: "Rocco's Storage", burrow: 'raccoon', ink: '#4a4a6a' },
  outpost: { name: 'the outpost warden', short: 'Warden', where: 'The Deep Outpost', burrow: 'outpost', ink: '#8a4a2a' },
};
// Deep Town's folk and keepers (src/data/villagers.js): npc id = villager id (keepers: their shop id)
for (const [id, v] of Object.entries(VILLAGERS)) NPCS[id] ||= { name: v.name, short: v.name.replace(/^(Old|Granny|Grandpa|Great-Aunt|Nana|Mrs\.|Mr\.|Professor) /, ''), where: v.where, ink: v.ink, town: true, keeper: v.keeper || null, title: v.title };
/** Ids the other parts may use for the same folk. */
export const NPC_ALIAS = { raccoon: 'rocco', star: 'oldstar', old_star: 'oldstar', starmole: 'oldstar', post: 'trader', herbs: 'herbalist', warden: 'outpost',
  grubb: 'tools', hazel: 'grocer', pip: 'furniture', talpa: 'blueprints', dilly: 'outfitter', vex: 'assay', fennimore: 'ticket', bramble: 'lift' };

/** The display name of an npc, from the shop data when the characters part has named them. */
export function npcName(id) {
  const k = NPC_ALIAS[id] || id;
  const shop = SHOPS[k] || SHOPS[NPCS[k]?.burrow] || null;
  return shop?.keeper?.name || NPCS[k]?.name || k;
}
/** The name at the start of a line ("The trader", "Rocco"). */
export const npcTitle = (id) => { const n = npcName(id); return n.charAt(0).toUpperCase() + n.slice(1); };
export const fillNames = (s) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (NPCS[k] || NPC_ALIAS[k] ? npcName(k) : m));

// ---------------------------------------------------------------- helpers for the data below
const has = (st, id, n = 1) => st.count(id) >= n;
const gemKnown = (st) => Object.keys(st.data.index || {}).some((k) => k.startsWith('gem:'));
const liftsFound = (st) => (st.data.deep?.lifts || []).filter((l) => /^L\d\d$/.test(l.id)).length;
const deepest = (st) => st.data.deepest || 0;
const anyOf = (...v) => v;
const gradeAtLeast = (g) => (w) => !!w && 'SABCDF'.indexOf(w.grade || 'F') <= 'SABCDF'.indexOf(g);
const startsWith = (p) => (v) => typeof v === 'string' && v.startsWith(p);
const ZONE_LINES = [null, null,
  ['Below the roots it turns to clay. Sticky, stubborn stuff. Iron lives in it. So do slugs. Don\'t lick either.', 'Clay on your boots. Wipe them before you come in.'],
  ['Further down, the walls start to sing. Crystal: pretty, sharp, and some of it bites with lightning. Wear gloves.', 'Hear them humming? Don\'t hum back. They take it personally.'],
  ['Below the crystal it gets warm. Then hot. Then you\'re standing on a stove. Gold down there, and rubies. Bring a suit.', 'Your whiskers are singed. Suits you.'],
  ['Then, for no reason anyone has ever explained to me, it\'s freezing. Diamonds. Mithril. Frostbite.', 'Frost Vault. I lost a boot there. If you see it, it\'s the left one. Probably.'],
  ['And at the bottom, the Core. I went once. I came back. That\'s all I\'ll say about it.', 'You came back too. We should start a club. Small club.'],
];
const ZONE_REWARD = [null, null, { gold: 120, sp: 1 }, { gold: 320, sp: 1 }, { gold: 900, sp: 2 }, { gold: 2200, sp: 2 }, { gold: 5000, sp: 3 }];

function deeper(n) {
  const name = ZONE_NAMES[n], top = ZONE_DEPTHS[n - 1];
  return {
    title: `Deeper: ${name}`, giver: 'oldstar', kind: 'story', auto: true,
    requires: n === 2 ? ['lessons'] : [`os_deeper${n - 1}`],
    intro: ZONE_LINES[n][0], outro: ZONE_LINES[n][1],
    steps: [{ id: 'reach', text: `Reach the ${name} (${top} m down)`, hint: `Dig down, ride a lift, or follow the caves below ${top} m.`, on: { type: 'explore', zone: n }, check: (st) => deepest(st) >= top + 1, where: { zone: n } }],
    reward: ZONE_REWARD[n],
  };
}

// ---------------------------------------------------------------- the quests
export const QUESTS = {
  // ======================================================== the lessons (the tutorial chain)
  lessons: {
    title: "Old Star's Lessons", giver: 'oldstar', kind: 'main',
    intro: 'You fell through my roof, slept a whole day in my spare bed and ate my last grub bar. Fine. I\'ll teach you to dig, forge and cook, and we\'ll both earn our way out of this hole.',
    outro: 'That\'s all I know, more or less. The rest is a million gold and a great deal of digging. Off you go.',
    steps: [
      { id: 'wake', text: 'Get up and meet Old Star', hint: 'The old star-nosed mole poking at the bedroom fire. He\'s been waiting for you to wake up.', lesson: 'wake', on: { type: 'talk', npc: 'oldstar' } },
      { id: 'lift', text: 'Ride the cage lift down to his dig', hint: 'The cage lift in his hall. "Mind the gate," he says. He always says.', lesson: ['lift', 'dig'], on: [{ type: 'reach', place: 'dig' }, { type: 'reach', place: 'lift:L0' }], where: { place: 'dig' } },
      { id: 'rock', text: 'Dig through the rock', hint: 'Swing at the wall. Rock is patient. Be less patient.', lesson: 'mine_rock', where: { place: 'dig' } },
      { id: 'ore', text: 'Dig round the copper till it breaks free', hint: 'Never hit the ore. Dig the earth round it and it comes away on its own, wrapped in its rock.', lesson: 'mine_ore', on: { type: 'ore', id: 'copper_ore' }, where: { place: 'dig' } },
      { id: 'clean', text: 'Chip the clump clean and bag it', hint: 'Turn it in your paws. Chisel along the ore, brush the dust off.', lesson: 'mine_clean', where: { place: 'dig' } },
      { id: 'gem', text: 'Dig into the little geode for its gem', hint: 'The wall that winks at you. Gently: gems crack if you shout.', lesson: 'mine_gem', where: { place: 'dig' } },
      { id: 'ladder', text: 'Put up a ladder and climb out', hint: 'Claws cost puff. Ladders cost nothing.', lesson: 'mine_ladder', where: { place: 'dig' } },
      { id: 'map', text: "Fetch Old Star's map off the ledge", hint: 'Forty years of scribbles. Don\'t drop it.', lesson: 'mine_map', where: { place: 'dig' } },
      { id: 'block', text: 'Block the rock-nibbler, then see it off', hint: 'Hold block as it lunges, then hit back while it\'s dazed.', lesson: 'mine_block', where: { place: 'dig' } },
      { id: 'up', text: 'Ride back up with Old Star', hint: 'The lift at the end of his crawl goes home.', lesson: 'mine_done', where: { place: 'home' } },
      { id: 'copper', text: 'Bring the copper home to Old Star', hint: 'He\'ll want to see it before it goes in the fire. He likes to sniff it.', lesson: 'copper_home', on: [{ type: 'reach', place: 'home' }, { type: 'talk', npc: 'oldstar' }], need: (st) => has(st, 'copper_ore'), where: { place: 'home' } },
      { id: 'smelt', text: 'Smelt the copper into an ingot', hint: 'Ore in the crucible, pump the bellows, pour when it glows.', lesson: 'forge_smelt', on: { type: 'smelt' }, where: { place: 'home' } },
      { id: 'forge', text: 'Forge your first blade', hint: 'Heat, hammer, quench. Don\'t hit your thumb; he only has the one bandage.', lesson: 'forge_done', on: { type: 'forge' }, where: { place: 'home' } },
      { id: 'cook', text: 'Cook a meal at his hearth', hint: 'A miner who doesn\'t eat is called a skeleton.', lesson: 'cook_done', on: { type: 'cook' }, where: { place: 'home' } },
    ],
    reward: { gold: 100, sp: 2, items: { glow_stake: 3 } },
    next: ['million'],
  },

  million: {
    title: 'Earn the Million', giver: 'oldstar', kind: 'main',
    intro: 'A seat on the Surface Express costs a million gold. Two seats cost two, but I\'m not greedy. Get yours first.',
    outro: 'Sunshine. Write me a postcard. A big one.',
    steps: [
      { id: 'save', text: 'Save up 1,000,000 gold', hint: 'Ore, gems, blades and dinners. Sell the lot. Then dig more.', count: (st) => st.gold, n: 1000000, gold: true },
      { id: 'ticket', text: 'Buy your ticket at the Surface Express', hint: 'The ticket office in Deep Town. Mr. Fennimore will call you "darling".', on: { type: 'buy', id: 'exit_ticket' }, check: (st) => st.owns('exit_ticket'), where: { place: 'town' } },
    ],
  },

  // ======================================================== Old Star's follow-ups
  os_town: {
    title: 'Down to Deep Town', giver: 'oldstar', kind: 'story', auto: true, requires: ['lessons'],
    intro: 'There\'s a town down there. Shops, an assay office that pays fair, and the ticket office for the Surface Express. Follow the old rail tunnel past the Trading Post, or dig toward the noise.',
    outro: 'Deep Town! Don\'t let the outfitter sell you a hat. He\'ll try.',
    steps: [{ id: 'town', text: 'Find Deep Town', hint: 'Fifteen meters down and a good walk east. The radar knows.', on: { type: 'reach', place: 'town' }, check: (st) => !!st.flag('escaped'), where: { place: 'town' } }],
    reward: { gold: 150, sp: 1 },
  },
  os_neighbours: {
    title: 'The Neighbours', giver: 'oldstar', kind: 'story', auto: true, requires: ['lessons'],
    intro: 'We\'re not the only ones down here. There\'s a Trading Post along the old rail tunnel, and an herbalist who smells of mint and grudges. Say hello. Politely.',
    outro: 'Made friends? Good. Friends buy ore.',
    steps: [
      { id: 'post', text: 'Visit the Trading Post', hint: 'Out of the mine lift and along the rails.', on: [{ type: 'talk', npc: 'trader' }, { type: 'reach', place: 'burrow:trader' }], where: { burrow: 'trader' } },
      { id: 'herbs', text: "Visit the Herbalist's Hollow", hint: 'Follow your nose. Mint. And grudges.', on: [{ type: 'talk', npc: 'herbalist' }, { type: 'reach', place: 'burrow:herbalist' }], where: { burrow: 'herbalist' } },
    ],
    reward: { gold: 80, sp: 1 },
  },
  os_gem: {
    title: 'First Sparkle', giver: 'oldstar', kind: 'story', auto: true, requires: ['lessons'],
    intro: 'Gems hide in hollow pockets. You\'ll see one glint through the rock, then a whole nest of them. Dig gently. Gems are like me: they crack if you shout.',
    outro: 'Hold it up to the lamp. See? Worth every blister.',
    steps: [{ id: 'gem', text: 'Find a gem', hint: 'Watch the walls for a glint that isn\'t copper-coloured.', on: { type: 'gem' }, check: gemKnown }],
    reward: { gold: 60, sp: 1 },
  },
  os_rocco: {
    title: 'A Raccoon of Business', giver: 'oldstar', kind: 'story', auto: true, requires: ['lessons'],
    intro: 'A raccoon called Rocco keeps a storage burrow down in the Clayworks. Buys blades, no questions asked. Ask no questions back, and count your fingers after.',
    outro: 'Still got all your fingers? Then it went well.',
    steps: [
      { id: 'find', text: "Find Rocco's storage burrow", hint: 'Down in the Clayworks, past the herbalist. The rail tunnel goes most of the way.', on: [{ type: 'talk', npc: 'rocco' }, { type: 'reach', place: 'burrow:raccoon' }], where: { burrow: 'raccoon' } },
      { id: 'sell', text: 'Sell Rocco a weapon', hint: 'Any blade. He isn\'t fussy. He says.', on: { type: 'sell', to: 'rocco' }, where: { burrow: 'raccoon' } },
    ],
    reward: { gold: 100, sp: 1 },
  },
  os_deeper2: deeper(2),
  os_deeper3: deeper(3),
  os_deeper4: deeper(4),
  os_deeper5: deeper(5),
  os_deeper6: deeper(6),
  os_lifts: {
    title: 'The Old Lifts', giver: 'oldstar', kind: 'story', auto: true, requires: ['lessons'],
    intro: 'The old miners left lifts all through the rock when the workings closed. Find three and you\'ll never walk home again. Walking is overrated.',
    outro: 'Three lifts. You can ride home from anywhere now. Don\'t get lazy.',
    steps: [{ id: 'lifts', text: 'Find 3 old lifts', hint: 'Dig toward the faint "? lift" signals on your radar.', count: liftsFound, n: 3 }],
    reward: { sp: 1, items: { glow_stake: 5 } },
  },
  os_pristine: {
    title: 'Not a Scratch', giver: 'oldstar', kind: 'story', auto: true, requires: ['lessons'],
    intro: 'Bring up an ore that\'s never been struck. Pristine. It sells for twice the price and I\'ll stop calling you Hammerpaws.',
    outro: 'Not a scratch on it. All right. You\'re not Hammerpaws. Yet.',
    steps: [{ id: 'clean', text: 'Bag a pristine ore', hint: 'Dig round it, never at it. Chisel and brush it clean before you bag it.', on: { type: 'ore', pristine: true }, check: (st) => (st.data.stats?.pristine || 0) > 0 }],
    reward: { gold: 80, sp: 1 },
  },
  os_blade: {
    title: 'A Blade Worth Selling', giver: 'oldstar', kind: 'story', auto: true, requires: ['lessons'],
    intro: 'Wobbly blades sell for wobbly money. Forge me a fine one: grade B or better. Even heat, even blows, a clean quench.',
    outro: 'Now that\'s a blade. I\'d sell it. I\'d also keep it. Hard choice.',
    steps: [{ id: 'fine', text: 'Forge a weapon of grade B or better', hint: 'Work it inside its heat. Strike where it\'s thick. Quench at the right glow.', on: { type: 'forge', grade: anyOf('S', 'A', 'B') }, where: { place: 'home' } }],
    reward: { gold: 150, sp: 1 },
  },
  os_cook: {
    title: 'Three Square Meals', giver: 'oldstar', kind: 'story', auto: true, requires: ['lessons'],
    intro: 'You can\'t dig on an empty stomach. Well, you can. Once. Learn three proper dishes.',
    outro: 'Three dishes! I\'ll have the second one. And the third.',
    steps: [{ id: 'dishes', text: 'Cook 3 different dishes', hint: 'Try what\'s in the larder. Mushrooms go with nearly everything.', on: { type: 'cook' }, unique: 'dish', n: 3, where: { place: 'home' } }],
    reward: { gold: 90, sp: 1 },
  },
  os_nugget: {
    title: 'Mind the Hen', giver: 'oldstar', kind: 'story', auto: true, requires: ['lessons'],
    intro: 'Your hen follows whoever feeds her. Feed her and she\'ll find you things. Starve her and she\'ll find someone else.',
    outro: 'She likes you. Hens are a good judge. Except of worms.',
    steps: [{ id: 'feed', text: 'Feed Nugget', hint: 'Seeds, grubs, the odd worm. She isn\'t picky.', on: { type: 'feed' } }],
    reward: { gold: 40, sp: 1 },
  },
  os_dynamite: {
    title: 'Stand Well Back', giver: 'oldstar', kind: 'story', auto: true, requires: ['os_town'],
    intro: 'Grubb in town sells dynamite. It opens rock in a hurry and ore in a mess. Throw it, then step away. Further than that.',
    outro: 'Still got your eyebrows? Excellent. Most people don\'t, the first time.',
    steps: [{ id: 'blast', text: 'Blast some rock with dynamite', hint: 'Grubb\'s Tools, in Deep Town. Light, throw, run.', on: { type: 'blast' } }],
    reward: { gold: 120, sp: 1 },
  },
  os_ruin: {
    title: 'Older Than Me', giver: 'oldstar', kind: 'story', auto: true, requires: ['os_deeper2'],
    intro: 'Down there are halls of fitted stone, older than the mine and older than me, which is saying something. Find one. Mind the floor. Mind the walls. Mind everything.',
    outro: 'Whoever built those knew rock better than I do. I\'ll never admit that again.',
    steps: [
      { id: 'find', text: 'Find an old ruin', hint: 'Carved stone, broken pillars. They show up as you dig.', on: { type: 'reach', place: startsWith('ruin:') }, where: { ruin: 'nearest' } },
      { id: 'solve', text: "Solve the ruin's puzzle", hint: 'Levers, plates, dials. Poke everything. Gently.', on: { type: 'puzzle' }, where: { ruin: 'nearest' } },
    ],
    reward: { gold: 250, sp: 2 },
  },
  os_tenth: {
    title: 'A Tenth of the Way', giver: 'oldstar', kind: 'story', auto: true, requires: ['lessons'],
    intro: 'A hundred thousand gold. A tenth of a ticket. When you get there, treat yourself to something small. A biscuit.',
    outro: 'A hundred thousand! I had that once. For about an hour.',
    steps: [{ id: 'save', text: 'Have 100,000 gold', hint: 'Pristine ore and fine blades. Sell to whoever pays most.', count: (st) => st.gold, n: 100000, gold: true }],
    reward: { sp: 2 },
  },

  // ======================================================== the Trading Post
  tr_copper: {
    title: 'Copper for the Post', giver: 'trader', kind: 'request', from: 'trader',
    intro: 'Copper. Eight lumps. The Post runs on copper the way you run on grubs. Clean ones, if you please, I can tell.',
    outro: 'Eight. Lovely. Counted twice.',
    steps: [{ id: 'bring', text: 'Bring 8 copper ore to {trader}', hint: 'Rootsoil is full of it. Clean lumps fetch more, but any will do.', deliver: { to: 'trader', items: { copper_ore: 8 } }, where: { burrow: 'trader' } }],
    reward: { gold: 240, sp: 1 },
  },
  tr_coal: {
    title: 'Keep the Lamps Lit', giver: 'trader', kind: 'request', from: 'trader', requires: ['tr_copper'],
    intro: 'Lamps eat coal and I\'m out. Twelve lumps and I\'ll throw in a bundle of glow stakes. Fair\'s fair.',
    outro: 'Lamps lit. You\'re a good sort. Don\'t let it get around.',
    steps: [{ id: 'bring', text: 'Bring 12 coal to {trader}', hint: 'Black seams in the Rootsoil. Messy stuff.', deliver: { to: 'trader', items: { coal: 12 } }, where: { burrow: 'trader' } }],
    reward: { gold: 200, sp: 1, items: { glow_stake: 4 } },
  },
  tr_sand: {
    title: 'Sand in My Boots', giver: 'trader', kind: 'request', from: 'trader', requires: ['tr_copper'],
    intro: 'There\'s a sandstone hollow somewhere below. Warm, dry, and the floor pours out from under you. Walk a good stretch of it for me. I sell maps. Well. I\'d like to.',
    outro: 'Sandstone Hollows, mapped. I\'ll charge double for the sandy bits.',
    steps: [{ id: 'walk', text: 'Explore the Sandstone Hollows', hint: 'Warm, dusty caves with sand floors. Walk around in them.', on: { type: 'explore', biome: 'dry' }, sum: 'n', n: 120 }],
    reward: { gold: 300, sp: 1 },
  },
  tr_iron: {
    title: 'An Iron Order', giver: 'trader', kind: 'request', from: 'trader', requires: ['tr_coal'],
    intro: 'Someone in town wants iron and doesn\'t want to dig for it. Six lumps. I take a cut. You take a bigger cut. Everyone\'s happy.',
    outro: 'Six. Heavy, aren\'t they? That\'s how you know it\'s iron.',
    steps: [{ id: 'bring', text: 'Bring 6 iron ore to {trader}', hint: 'Iron lives in the Clayworks.', deliver: { to: 'trader', items: { iron_ore: 6 } }, where: { burrow: 'trader' } }],
    reward: { gold: 520, sp: 1 },
  },
  tr_bronze: {
    title: 'The Bronze Age', giver: 'trader', kind: 'request', from: 'trader', requires: ['tr_iron'],
    intro: 'Bronze bars. Three. Copper and tin, melted together. You have a forge, I have a buyer. Let\'s not keep him waiting; he hums when he waits.',
    outro: 'Lovely bars. He\'s stopped humming. Thank you.',
    steps: [{ id: 'bring', text: 'Bring 3 bronze ingots to {trader}', hint: 'Smelt copper and tin together at the forge.', deliver: { to: 'trader', items: { bronze_ingot: 3 } }, where: { burrow: 'trader' } }],
    reward: { gold: 760, sp: 1 },
  },

  // ======================================================== the herbalist
  hb_glowcap: {
    title: 'Glowcaps, Gently', giver: 'herbalist', kind: 'request', from: 'herbalist',
    intro: 'Five glowcaps. Picked, not torn. If you pull them up by the stem I will know, and I will tell everyone.',
    outro: 'Hm. Picked properly. Well. Don\'t expect me to say thank you. Thank you.',
    steps: [{ id: 'bring', text: 'Bring 5 glowcaps to {herbalist}', hint: 'Little blue mushrooms that glow. Rootsoil, Clayworks, Crystal Grotto.', deliver: { to: 'herbalist', items: { glowcap: 5 } }, where: { burrow: 'herbalist' } }],
    reward: { gold: 150, sp: 1 },
  },
  hb_hollow: {
    title: 'The Mushroom Hollow', giver: 'herbalist', kind: 'request', from: 'herbalist', requires: ['hb_glowcap'],
    intro: 'Somewhere down there the mushrooms grow taller than you. I have a theory about why. Go and stand in it and tell me if you feel tall.',
    outro: 'You don\'t look taller. The theory needs work.',
    steps: [{ id: 'walk', text: 'Explore the Mushroom Hollow', hint: 'Soft mycelium floors and giant glowcaps. Walk around in it.', on: { type: 'explore', biome: 'fungus' }, sum: 'n', n: 120 }],
    reward: { gold: 220, sp: 1 },
  },
  hb_soup: {
    title: 'Soup for a Sniffle', giver: 'herbalist', kind: 'request', from: 'herbalist', requires: ['hb_glowcap'],
    intro: 'I have a cold. Herbalists do not get colds, so I am told. Cook me a glowcap soup and we\'ll never speak of this.',
    outro: '*sniff* Adequate. More than adequate. Go away before I hug you.',
    steps: [{ id: 'bring', text: 'Bring a glowcap soup to {herbalist}', hint: 'Glowcaps, a pot, a hearth. Old Star\'s hearth will do.', deliver: { to: 'herbalist', items: { glowcap_soup: 1 } }, where: { burrow: 'herbalist' } }],
    reward: { gold: 180, sp: 1 },
  },
  hb_nest: {
    title: 'The Nest Under the Roots', giver: 'herbalist', kind: 'request', from: 'herbalist', requires: ['hb_hollow'],
    intro: 'Something has built a nest in the dark and now it eats my seedlings. Clear it out. Bring a stick. A big stick.',
    outro: 'Gone? Good. My seedlings send their regards. They\'re very small regards.',
    steps: [{ id: 'clear', text: 'Clear out a creature nest', hint: 'Nests show as danger rings on the radar. Block, then strike.', on: { type: 'nest' }, where: { danger: 'nest' } }],
    reward: { gold: 420, sp: 2 },
  },
  hb_lily: {
    title: 'Crystal Lilies', giver: 'herbalist', kind: 'request', from: 'herbalist', requires: ['hb_soup'],
    intro: 'Crystal lilies grow where the walls sing. Three, please, petals unbroken. They\'re for a tincture. Never mind what kind.',
    outro: 'Unbroken. You have gentle paws for a miner.',
    steps: [{ id: 'bring', text: 'Bring 3 crystal lilies to {herbalist}', hint: 'In the Crystal Grotto, among the singing walls.', deliver: { to: 'herbalist', items: { crystal_lily: 3 } }, where: { burrow: 'herbalist' } }],
    reward: { gold: 640, sp: 1 },
  },

  // ======================================================== Rocco the raccoon
  rc_first: {
    title: 'No Questions Asked', giver: 'rocco', kind: 'request', from: 'rocco',
    intro: 'Ah! A smith! I buy blades. For collectors. Very quiet collectors. Bring me a blade, don\'t tell me where it\'s been, and I won\'t tell you where it\'s going.',
    outro: 'Pleasure doing business. This never happened. Come again.',
    steps: [{ id: 'sell', text: 'Sell Rocco any weapon', hint: 'Forge one at Old Star\'s, bring it here.', on: { type: 'sell', to: 'rocco' }, where: { burrow: 'raccoon' } }],
    reward: { gold: 60, sp: 1 },
  },
  rc_dagger: {
    title: 'Something Small and Quiet', giver: 'rocco', kind: 'request', from: 'rocco', requires: ['rc_first'],
    intro: 'A client wants something that fits in a sleeve. A dagger, grade C or better. Don\'t ask which sleeve. Don\'t ask whose.',
    outro: 'Perfect. Slips right in. Into the collection, I mean. Obviously.',
    steps: [{ id: 'sell', text: 'Sell Rocco a dagger, grade C or better', hint: 'Daggers take one ingot. Even blows.', on: { type: 'sell', to: 'rocco', weapon: (w, a) => (w?.type || a.id) === 'dagger' && gradeAtLeast('C')(w) }, where: { burrow: 'raccoon' } }],
    reward: { gold: 180, sp: 1 },
  },
  rc_shiny: {
    title: 'Shiny Things, Discreetly', giver: 'rocco', kind: 'request', from: 'rocco', requires: ['rc_first'],
    intro: 'Amber. Three. And one amethyst, for my... aunt. She\'s a raccoon too. Very respectable. Wears a mask, but then we all do.',
    outro: 'My aunt thanks you. She\'s very real.',
    steps: [{ id: 'bring', text: 'Bring Rocco 3 amber and an amethyst', hint: 'Amber in the Rootsoil and Clayworks, amethyst lower down.', deliver: { to: 'rocco', items: { amber: 3, amethyst: 1 } }, where: { burrow: 'raccoon' } }],
    reward: { gold: 520, sp: 1 },
  },
  rc_vault: {
    title: 'A Little Errand', giver: 'rocco', kind: 'request', from: 'rocco', requires: ['rc_dagger'],
    intro: 'There\'s an old vault down there with a door that won\'t open for me. Doors don\'t like me. I can\'t think why. You, they might like.',
    outro: 'Open? Wonderful! I\'ll just... have a look round. Alone. You go on home.',
    steps: [{ id: 'solve', text: 'Solve a puzzle in an old ruin', hint: 'Old halls of fitted stone. Levers, plates, dials.', on: { type: 'puzzle' }, where: { ruin: 'nearest' } }],
    reward: { gold: 640, sp: 2 },
  },
  rc_golem: {
    title: 'Pest Control', giver: 'rocco', kind: 'request', from: 'rocco', requires: ['rc_shiny'],
    intro: 'A big rock fellow keeps sitting on my delivery route. Ask him nicely to move. With a hammer.',
    outro: 'Route\'s clear! The deliveries are perfectly legal, by the way. You didn\'t ask. Good.',
    steps: [{ id: 'golem', text: 'Defeat a rubble golem', hint: 'Golems hit hard and slow. Block, then hit back.', on: { type: 'kill', kind: anyOf('rubble_golem', 'crystal_golem') } }],
    reward: { gold: 850, sp: 2 },
  },
  rc_masterwork: {
    title: 'The Big Order', giver: 'rocco', kind: 'request', from: 'rocco', requires: ['rc_vault', 'rc_golem'],
    intro: 'My best client wants a masterwork. A long blade, grade A at least. He pays in gold, not in fingers. Big order. Big money. Big secret.',
    outro: 'Magnificent. I may cry. I won\'t, raccoons don\'t, but I may.',
    steps: [{ id: 'sell', text: 'Sell Rocco a long blade, grade A or better', hint: 'A longsword or a greatsword. Good metal, perfect heat.', on: { type: 'sell', to: 'rocco', weapon: (w, a) => ['longsword', 'greatsword', 'moleblade'].includes(w?.type || a.id) && gradeAtLeast('A')(w) }, where: { burrow: 'raccoon' } }],
    reward: { gold: 2600, sp: 3 },
  },

  // ======================================================== the deep outpost
  op_ember: {
    title: 'Warm Hands', giver: 'outpost', kind: 'request', from: 'outpost',
    intro: 'Cold down here at night, if you can believe it, with the lava and all. Four ember scales and I can make a stove that doesn\'t smoke.',
    outro: 'Toasty. You\'re welcome by my stove any time.',
    steps: [{ id: 'bring', text: 'Bring 4 ember scales to the outpost', hint: 'Ember moths and lava newts drop them in the Magma Deep.', deliver: { to: 'outpost', items: { ember_scale: 4 } }, where: { burrow: 'outpost' } }],
    reward: { gold: 1500, sp: 1 },
  },
  op_frost: {
    title: 'Cold Feet', giver: 'outpost', kind: 'request', from: 'outpost', requires: ['op_ember'],
    intro: 'Frostblooms. Two. Grow on the ice below. Don\'t ask what for. All right: it\'s tea. Very strong tea.',
    outro: 'Tea\'s on. Strong enough to stand a pick in.',
    steps: [{ id: 'bring', text: 'Bring 2 frostblooms to the outpost', hint: 'Pale flowers on the ice of the Frost Vault.', deliver: { to: 'outpost', items: { frostbloom: 2 } }, where: { burrow: 'outpost' } }],
    reward: { gold: 2400, sp: 2 },
  },
};

Object.assign(QUESTS, BURROW_QUESTS, SIDE_QUESTS);

/** Order on the quest page and for offers: main, Old Star's, the burrow folk, the village, lore. */
const KIND_RANK = { main: 0, story: 1, request: 2, village: 3, lore: 4 };
export const QUEST_ORDER = Object.keys(QUESTS).map((id, i) => [id, i]).sort((a, b) => (KIND_RANK[QUESTS[a[0]].kind] ?? 5) - (KIND_RANK[QUESTS[b[0]].kind] ?? 5) || a[1] - b[1]).map((e) => e[0]);

/** The book's groups: the main story, the village (and the burrow folk), lore. */
export const QUEST_GROUPS = [
  { id: 'main', label: 'The Way Up', sub: 'Old Star and the million', kinds: ['main', 'story'] },
  { id: 'village', label: 'Deep Town & Neighbours', sub: 'Favours for the folk', kinds: ['village', 'request'] },
  { id: 'lore', label: 'Lore', sub: 'Old stories, older stones', kinds: ['lore'] },
];
export const groupOf = (kind) => (QUEST_GROUPS.find((g) => g.kinds.includes(kind)) || QUEST_GROUPS[1]).id;

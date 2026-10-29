// Side quests: Deep Town's folk and keepers (kind 'village'), the lore chains (kind 'lore': the
// Old Ones with Professor Talpa, Old Star's lost million with Old Hollis) and a few more requests
// for the burrow folk. Merged into QUESTS by src/data/quests.js; the format is documented there.
//
// Village quests are offered in a dialog (`ask`: talk to the giver, read what they want, Accept or
// Not now). The giver has a gold "!" over their head while they have work, a "?" while it's under
// way (gold when you can hand it in). Extra step fields used here (src/core/quests.js):
//   talk: npc            done by talking to them        look: 'lake' | 'sunbeam' | ...  done by
//   grant: { id: n }     items handed over on the step   taking a good look at one (gaze, or the
//   say: { by, text }    a line when the step is done    thing's own E: the well, the sunbeam...)
//   choose: { to, prompt, options: [{ id, label, sub, say, reward, flag }] }  a choice in their dialog
//   deliver: { to, items, weapon: { type, metal, grade }, any: { cat, n } }   hand things over
// Quest fields: gives (items when you accept), when(state) (offered only while it holds), rep in the
// reward (friendship with the giver; village quests give 1 by default).
const ZONE_DEPTHS = [0, 25, 55, 90, 130, 170, 210]; // zone n spans [n-1]..[n] (Generator.js, data/quests.js)

const deepest = (st) => st.data.deepest || 0;
const reached = (n) => (st) => deepest(st) >= ZONE_DEPTHS[n - 1] + 1;
const onDay = (n) => (st) => (st.data.day || 1) >= n;
const liftsFound = (st) => (st.data.deep?.lifts || []).filter((l) => /^L\d\d$/.test(l.id)).length;
const gradeAtLeast = (g) => (v) => !!v && 'SABCDF'.indexOf(v) >= 0 && 'SABCDF'.indexOf(v) <= 'SABCDF'.indexOf(g);
/** Nugget walks with you: her coop is close (the mine) or she's at your heels (town). */
export function nuggetNear(game, d = 6) {
  const sc = game?.scene;
  if (!sc) return false;
  if (sc.nugget?.near) return sc.nugget.near(d);
  if (sc.nugget?.pos && sc.player) return Math.hypot(sc.nugget.pos.x - sc.player.x, sc.nugget.pos.z - sc.player.z) < d * 1.6;
  return false;
}

const V = (o) => ({ kind: 'village', ask: true, ...o, giver: o.giver || o.from });

export const SIDE_QUESTS = {
  // ================================================================== Hazel, the grocer
  v_hazel_shrooms: V({
    title: 'Fresh From the Deep', from: 'grocer',
    intro: 'The cellar\'s bare, dear. Six glowcaps and three cave berries and I can open on time. Fresh ones! I can tell a stale berry from across the plaza.',
    outro: 'Oh, lovely and plump. Into the basket. Here, for your trouble, and take a jar of jam, you look peaky.',
    steps: [
      { id: 'bring', text: 'Bring Hazel 6 glowcaps and 3 cave berries', hint: 'Glowcaps glow blue on cave floors; berries grow in bushes in the Rootsoil and Clayworks. Pick, don\'t yank.', deliver: { to: 'grocer', items: { glowcap: 6, cave_berry: 3 } } },
    ],
    reward: { gold: 260, items: { berry_jam: 1 } },
  }),
  v_hazel_truffle: V({
    title: 'The Truffle Hunt', from: 'grocer', requires: ['v_hazel_shrooms'], when: reached(2),
    intro: 'Truffles! They grow under truffle mounds where the old roots go deep. Take your hen: hens have noses for it, my granny swore. Two truffles, and I\'ll teach you my risotto.',
    outro: 'Smell that. SMELL it. That\'s the smell of a very good week. Here\'s the recipe, written small so nobody else can read it.',
    steps: [
      { id: 'hunt', text: 'Dig up 2 truffles with Nugget beside you', hint: 'Truffle mounds are humps of dark earth. Keep Nugget close (within a few steps) while you dig.', on: { type: 'forage', id: 'truffle' }, need: (st, g) => nuggetNear(g, 7), n: 2, where: { biome: 'any' } },
      { id: 'bring', text: 'Bring Hazel 2 truffles', hint: 'Nibble & Root, on the west wall of Deep Town.', deliver: { to: 'grocer', items: { truffle: 2 } } },
    ],
    reward: { gold: 600, recipe: ['truffle_risotto'], lore: ['cr_hollow'] },
  }),

  // ================================================================== Grubb, picks & chisels
  v_grubb_iron: V({
    title: 'Grubb\'s Grindstone', from: 'tools',
    intro: 'My grindstone\'s axle cracked. Iron. Four bars of it, smelted proper, no slag. Do that and I\'ll give you the fine chisel off my wall. It\'s been waiting for paws like yours.',
    outro: 'Good iron. Rings true. Here: the fine chisel. Don\'t use it to open tins.',
    steps: [
      { id: 'bring', text: 'Bring Grubb 4 iron ingots', hint: 'Iron ore lives in the Clayworks; smelt it at Old Star\'s forge.', deliver: { to: 'tools', items: { iron_ingot: 4 } } },
    ],
    reward: { gold: 300, items: { chisel_fine: 1 } },
  }),
  v_grubb_axe: V({
    title: 'For the Window', from: 'tools', requires: ['v_grubb_iron'],
    intro: 'Customers look at my window and see picks. Boring. I want an axe in it. Bronze, grade B or better, so it catches the lamp. Forge it, bring it, and the hand-axe plans are yours. Well. They\'re already yours, if you can forge one. I\'ll pay, then.',
    outro: 'Look at the edge on that. I\'ll put a little card under it. "Not for sale." Then sell it.',
    steps: [
      { id: 'forge', text: 'Forge a bronze axe, grade B or better', hint: 'Hand axe plans (Inkwell Plans) and bronze ingots (copper + tin). Even heat, firm blows.', on: { type: 'forge', weapon: 'axe', metal: 'bronze', grade: gradeAtLeast('B') }, where: { place: 'home' } },
      { id: 'bring', text: 'Bring the bronze axe to Grubb', hint: 'Grubb\'s Picks & Chisels, north wall of Deep Town.', deliver: { to: 'tools', weapon: { type: 'axe', metal: 'bronze', grade: 'B' } } },
    ],
    reward: { gold: 1400, sp: 1, items: { bp_mace: 1 } },
  }),
  v_grubb_fuse: V({
    title: 'Long Fuse, Short Temper', from: 'tools', requires: ['os_dynamite'],
    intro: 'New fuses. Twice as long. Customers say they\'re too long. Customers are wrong. Blast three bits of rock with them and come and tell me how much time you had.',
    outro: 'Plenty of time, you say? Hah! Told them. Here: a bundle on the house. Use them somewhere I can\'t hear.',
    steps: [
      { id: 'blast', text: 'Blast rock with dynamite 3 times', hint: 'Light it, throw it, walk away. Not run. Walk. With dignity.', on: { type: 'blast' }, n: 3 },
      { id: 'tell', text: 'Tell Grubb how the fuses did', hint: 'He\'s at his counter on the north wall.', talk: 'tools' },
    ],
    reward: { gold: 350, items: { dynamite_bundle: 2 } },
  }),

  // ================================================================== Old Vex, the assay office
  v_vex_pristine: V({
    title: 'An Assayer\'s Eye', from: 'assay',
    intro: 'Anyone can dig ore. Few can dig it without bruising it. Bag three pristine finds, any kind, and bring me one to look at. If you can do it, I\'ll lend you my badger brush. Lend.',
    outro: 'Not a scratch. Hm. Keep the brush. Lending is paperwork.',
    steps: [
      { id: 'dig', text: 'Bag 3 pristine ores', hint: 'Dig round the ore, never at it; chisel it clean and brush the dust off before you bag it.', on: { type: 'ore', pristine: true }, n: 3 },
      { id: 'show', text: 'Show Old Vex your work', hint: 'Her assay office is on the north wall of Deep Town, by the waterfall.', talk: 'assay' },
    ],
    reward: { gold: 500, items: { brush_badger: 1 }, lore: ['t_assay'] },
  }),
  v_vex_weights: V({
    title: 'Weights and Measures', from: 'assay', requires: ['v_vex_pristine'], when: reached(2),
    intro: 'Kobolds have been at my brass weights. They came in the night and left a heap of shiny pebbles on my counter. Payment, they think. See off a band of them and get my weights back.',
    outro: 'Seven weights. I had eight. Hm. ...No, eight: one was in my pocket. Correct. That\'s my highest praise.',
    steps: [
      { id: 'kobolds', text: 'Defeat 3 kobolds', hint: 'Kobold bands carry lanterns in the Rootsoil, Clayworks and Crystal Grotto. Block their jabs, then strike.', on: { type: 'kill', kind: 'kobold' }, n: 3, grant: { brass_weights: 1 }, say: { text: 'One of them drops a clinking bag: <b>Vex\'s brass weights</b>.' } },
      { id: 'bring', text: 'Bring the weights back to Old Vex', hint: 'The assay office in Deep Town.', deliver: { to: 'assay', items: { brass_weights: 1 } } },
    ],
    reward: { gold: 1200, sp: 1, lore: ['cr_kobolds'] },
  }),

  // ================================================================== Pip, the carpenter
  v_pip_chair: V({
    title: 'A Chair for Granny', from: 'furniture',
    intro: 'Granny Mabel sat on her rocking chair and it said "crack" and so did she. I\'ll build her a new one: four beast hides for the seat, two iron ingots for the runners. Then you can tell her yourself; she likes you.',
    outro: 'There! Rocks like a cradle, holds like a vice. Here: I made a spare. Don\'t tell Mabel hers was the second one.',
    steps: [
      { id: 'bring', text: 'Bring Pip 4 beast hides and 2 iron ingots', hint: 'Hides come from big beasts in the deep (cave trolls, shellbacks). Iron ingots from the forge.', deliver: { to: 'furniture', items: { beast_hide: 4, iron_ingot: 2 } } },
      { id: 'tell', text: 'Tell Granny Mabel her chair is ready', hint: 'She sits on the north bench of the plaza with Grandpa Tuck.', talk: 'mabel', say: { by: 'mabel', text: 'A new chair? For ME? Oh, I shall rock in it until I\'m dizzy.' } },
    ],
    reward: { gold: 400, items: { armchair: 1 } },
  }),
  v_pip_lamp: V({
    title: 'Light for the Lanes', from: 'furniture', requires: ['v_pip_chair'], when: reached(3),
    intro: 'The back lanes are dark as a boot. I\'ve designed a crystal lamp, but I need three glow moss for the shade and two echo crystals to make it hum. The lanes will glow and sing. Mostly glow.',
    outro: 'Listen... it hums! Faintly! Here, have the first one off the bench.',
    steps: [
      { id: 'bring', text: 'Bring Pip 3 glow moss and 2 echo crystals', hint: 'Glow moss peels off cave walls; echo crystals sing in the Crystal Grotto (careful with drills).', deliver: { to: 'furniture', items: { glow_moss: 3, echo_crystal: 2 } } },
    ],
    reward: { gold: 900, items: { crystal_lamp: 1 } },
  }),

  // ================================================================== Dilly, the outfitter
  v_dilly_mitten: V({
    title: 'The Lost Mitten', from: 'outfitter', when: reached(3),
    intro: 'You\'ve seen my notice. One left mitten, ember-proof. I dropped it in the Magma Deep, by a lava pool, while I was... testing it. Find it! Reward: a pie. A whole pie.',
    outro: 'MY MITTEN. Oh, it\'s barely singed. Here\'s your pie. And some gold, because the pie is small.',
    steps: [
      { id: 'look', text: 'Find a lava pool in the Magma Deep and look around it', hint: 'Lava glows on the radar as a red ring. Stand at a safe distance and take a good look (keep your eyes on it a moment).', look: 'lava', grant: { ember_mitten: 1 }, say: { text: 'Something singed sits on a ledge by the lava: <b>Dilly\'s mitten</b>!' } },
      { id: 'bring', text: 'Bring Dilly her mitten', hint: 'Gearwick Outfitters, on the west wall of Deep Town.', deliver: { to: 'outfitter', items: { ember_mitten: 1 } } },
    ],
    reward: { gold: 900, items: { hearty_pie: 1 } },
  }),
  v_dilly_silk: V({
    title: 'Silk Scarves', from: 'outfitter',
    intro: 'Scarves are in. Spider silk scarves are very in. Six bundles of silk, and I\'ll pay you more than the spiders ever would.',
    outro: 'Soft as smoke! The Council will want three.',
    steps: [
      { id: 'bring', text: 'Bring Dilly 6 spider silk', hint: 'Cave spiders spin it in the Rootsoil and lower down. Their webs stick; so do they.', deliver: { to: 'outfitter', items: { spider_silk: 6 } } },
    ],
    reward: { gold: 700, lore: ['cr_spiders'] },
  }),

  // ================================================================== Mr. Fennimore, the Surface Express
  v_fenn_sun: V({
    title: 'Postcard From Up There', from: 'ticket',
    intro: 'Darling, nobody in this town believes the sun is real. It\'s bad for business. Go and stand in the sunbeam, really feel it, and then tell three of the old-timers on the plaza how warm it was.',
    outro: 'Three converts! Marvellous. Have a little something for your trouble, and a story.',
    steps: [
      { id: 'bask', text: 'Stand in the sunbeam by the ticket booth', hint: 'The patch of grass in the light, in front of the Surface Express. Stand in it (E).', look: 'sunbeam' },
      { id: 'tell', text: 'Tell 3 townsfolk about the warm sun', hint: 'Grandpa Tuck, Granny Mabel and Old Burdock sit on the plaza benches; Old Hollis by the old tunnel; Lark and Puddle by the fountain.', on: { type: 'talk', npc: ['tuck', 'mabel', 'burdock', 'hollis', 'lark', 'puddle', 'snorri'] }, unique: 'npc', n: 3,
        heard: ['Warm, you say? Like a stove? Well I never.', 'The SUN? Pull the other one. ...Was it nice, though?', 'Fennimore put you up to this. ...Warm, really?', 'Huh. I always thought it\'d be cold. Big and cold.', 'Zzz... warm... sounds nice... zzz.'] },
    ],
    reward: { gold: 300, lore: ['u_sun'] },
  }),
  lo_fenn_line: V({
    title: 'The Fennimore Line', from: 'ticket', kind: 'lore', requires: ['v_fenn_sun'], when: reached(2),
    intro: 'My grandfather Augustus built the Express up the old stair. The miners kept a journal of those days; the pages went down with the miners the Rumble swallowed. Find a few and read them. You\'ll see what a scoundrel he was. Lovely man.',
    outro: '"He has never said a true word in his life." Ha! That\'s Grandfather. Take this, darling, and keep the pages.',
    steps: [
      { id: 'read', text: 'Read 3 pages of Hobb\'s journal', hint: 'The miners lost in the Rumble lie in the old dungeons, a page or two in every satchel: E on their remains.', on: { type: 'lore', src: 'journal' }, unique: 'id', n: 3, where: { sight: 'cavein' } },
      { id: 'tell', text: 'Tell Mr. Fennimore what you read', hint: 'The ticket booth under the sunbeam.', talk: 'ticket' },
    ],
    reward: { gold: 900, sp: 1, lore: ['t_express'] },
  }),

  // ================================================================== Bramble, the lift
  v_bramble_grease: V({
    title: 'A Squeaky Cage', from: 'lift',
    intro: 'Hear that? Squeak. Squeeeak. She\'s a good old cage, but she squeaks like a mouse in a boot. Slime gel is the best grease there is. Three blobs.',
    outro: 'Smooth as butter now! Listen to that: nothing! Lovely nothing.',
    steps: [
      { id: 'bring', text: 'Bring Bramble 3 slime gel', hint: 'Cave slimes drop it when they pop. Bigger slimes split first.', deliver: { to: 'lift', items: { slime_gel: 3 } } },
    ],
    reward: { gold: 350 },
  }),
  v_bramble_layers: V({
    title: 'All Stations', from: 'lift', requires: ['v_bramble_grease'],
    intro: 'The town shaft runs down through every layer, with a station at the top of each. Ride her down and have a proper walk in three different layers. Then come back and tell me she didn\'t squeak once.',
    outro: 'Three layers and not a squeak! Burdock will be furious. Here, an old cage lamp: hang it on your hen\'s roof.',
    steps: [
      { id: 'walk', text: 'Walk in 3 different layers of the mine', hint: 'Ride the town lift to its stations, or dig down. Rootsoil counts.', on: { type: 'explore' }, unique: 'zone', n: 3 },
      { id: 'tell', text: 'Tell Bramble how the ride went', hint: 'At the crank of the town lift.', talk: 'lift' },
    ],
    reward: { gold: 800, sp: 1, items: { lamp_tin: 1 }, lore: ['t_lift'] },
  }),

  // ================================================================== Grandpa Tuck
  v_tuck_signs: V({
    title: 'The Company Signs', from: 'tuck', requires: ['os_lifts'],
    intro: 'The Company put a name board up at every lift station. Painted them myself, some of them. Go and read three for me, would you? I want to know if my spelling held up.',
    outro: '"Clayworkes." Hm. That one was Pell. Thank you, youngster. Here, an old miner\'s wage.',
    steps: [
      { id: 'read', text: 'Read 3 lift station signs', hint: 'Every lift station has its name board on the wall by the car. E to read.', on: { type: 'look', at: 'signpost' }, n: 3, where: { sight: 'signpost' } },
    ],
    reward: { gold: 400 },
  }),
  v_tuck_pick: V({
    title: 'Tuck\'s Old Pick', from: 'tuck', requires: ['v_tuck_signs'],
    intro: 'Lost my old pick the day of the Long Rumble. Lent it to a lad who never came back up. T.T. on the handle. If you find a lost miner down there, have a look at his pick for me.',
    outro: 'T.T. Tobias Tuck. Well I never. Sixty years! Keep it on your wall, youngster. It\'s done its digging.',
    steps: [
      { id: 'find', text: 'Search a lost miner\'s remains', hint: 'Miners lost in the Long Rumble lie in the old dungeons, their picks still by them. E on the remains.', on: { type: 'look', at: 'cavein' }, grant: { tuck_pick: 1 }, where: { sight: 'cavein' }, say: { text: 'By the bones, a snapped pick: <b>T.T.</b> burnt into the handle.' } },
      { id: 'bring', text: 'Show Grandpa Tuck his old pick', hint: 'The north bench on the plaza.', deliver: { to: 'tuck', items: { tuck_pick: 1 } } },
    ],
    reward: { gold: 600, items: { trophy_pick: 1 } },
  }),

  // ================================================================== Granny Mabel: the Sunbeam Festival
  v_mabel_pie: V({
    title: 'The Sunbeam Festival: Pies', from: 'mabel',
    intro: 'Once a year the sun shines straight down the crack and the whole town comes out. There must be pies. Cook me a root-vegetable pie, dear, a good one, and we\'ll start the festival table.',
    outro: 'Golden on top! That\'s the first pie on the table. Now, about the lanterns...',
    steps: [
      { id: 'cook', text: 'Cook a Root-Vegetable Pie', hint: 'Old Star\'s hearth (or any stove): tunnel tubers, cave carrots, flour, butter. Bake till golden.', on: { type: 'cook', dish: 'root_pie' }, where: { place: 'home' } },
      { id: 'bring', text: 'Bring the pie to Granny Mabel', hint: 'The north bench on the plaza.', deliver: { to: 'mabel', items: { root_pie: 1 } } },
    ],
    reward: { gold: 450 },
  }),
  v_mabel_lanterns: V({
    title: 'The Sunbeam Festival: Lanterns', from: 'mabel', requires: ['v_mabel_pie'],
    intro: 'Lanterns, dear! We hang them all round the plaza. Four glow moss for the shades and four glowcaps for the wicks. The old way.',
    outro: 'The plaza will glow like the inside of a pie. Here, a lantern post for your own door.',
    steps: [
      { id: 'bring', text: 'Bring Granny Mabel 4 glow moss and 4 glowcaps', hint: 'Glow moss peels off walls; glowcaps grow on cave floors.', deliver: { to: 'mabel', items: { glow_moss: 4, glowcap: 4 } } },
    ],
    reward: { gold: 600, items: { lantern_post: 1 } },
  }),
  v_mabel_hymn: V({
    title: 'The Sunbeam Festival: The Sun Hymn', from: 'mabel', requires: ['v_mabel_lanterns'],
    intro: 'Last thing: the music. Lark wants to sing the old Sun Hymn, but nobody remembers it. It\'s carved in the ruins, they say, in bumpy letters. Take a rubbing of any old carving to Lark, and then come and stand in the sun with us.',
    outro: 'Look at them all, eyes shut, faces up. Best festival in forty years. Thank you, dear. Here, from all of us.',
    steps: [
      { id: 'rub', text: 'Read a carving in an old ruin', hint: 'The old dungeons are rooms of fitted stone hidden in the rock. E on a carved frieze or rune wall reads it.', on: { type: 'lore', src: 'carving' }, grant: { sun_hymn: 1 }, where: { ruin: 'nearest' }, say: { text: 'You rub charcoal over the raised runes: <b>a rubbing of the Sun Hymn</b>.' } },
      { id: 'lark', text: 'Bring the rubbing to Lark', hint: 'Lark busks by the fountain.', deliver: { to: 'lark', items: { sun_hymn: 1 } }, say: { by: 'lark', text: '♪ It goes up at the end! Like a question! ♪ Oh, it\'s PERFECT.' } },
      { id: 'sun', text: 'Join the festival: stand in the sunbeam', hint: 'The sunlit patch in front of the ticket booth. E to stand in it.', look: 'sunbeam' },
    ],
    reward: { gold: 1500, sp: 1, items: { painting_sun: 1 }, lore: ['t_festival'] },
  }),

  // ================================================================== Lark, Puddle, Bristle
  v_lark_strings: V({
    title: 'New Strings', from: 'lark', requires: ['v_mabel_pie'],
    intro: '♪ Twang. ♪ That was my last string, and Mabel wants music for the festival. Spider silk makes the sweetest strings, if you can get it off the spider. Four bundles, and I\'ll write you into a song.',
    outro: '♪ ...and the mole with the hen went down, down, down... ♪ It needs work. You\'re in it, though!',
    steps: [{ id: 'bring', text: 'Bring Lark 4 spider silk', hint: 'Cave spiders spin it. Their webs are on the floors of their caves.', deliver: { to: 'lark', items: { spider_silk: 4 } } }],
    reward: { gold: 350, lore: ['cr_wraiths'] },
  }),
  v_puddle_bait: V({
    title: 'Fat Bait', from: 'puddle',
    intro: 'There are no fish in this fountain. I know. But if there were, they\'d want fat grubs. Four of them. A mole has to be ready.',
    outro: 'Lovely and wriggly. Now I\'m ready. For nothing! Here, a little something.',
    steps: [{ id: 'bring', text: 'Bring Puddle 4 fat grubs', hint: 'Dig them out of grub loam (soft dark soil) in the upper layers.', deliver: { to: 'puddle', items: { fat_grub: 4 } } }],
    reward: { gold: 300 },
  }),
  v_puddle_lake: V({
    title: 'The One That Got Away', from: 'puddle', requires: ['v_puddle_bait'],
    intro: 'Down in the deep there\'s a lake so still you can see the roof in it, upside down. I saw it once, when I was a tadpole. Go and look at one for me, a good long look, and tell me if it\'s still there.',
    outro: 'Still there. Still still. Good. Some things should stay where they are.',
    steps: [
      { id: 'look', text: 'Take a good look at an underground lake', hint: 'Lakes show as blue on the radar. Stand by the water and keep your eyes on it a moment.', look: 'lake' },
      { id: 'tell', text: 'Tell Puddle about the lake', hint: 'Fishing in the fountain.', talk: 'puddle' },
    ],
    reward: { gold: 500, lore: ['cr_fish'] },
  }),
  v_bristle_dust: V({
    title: 'Dust Bunnies', from: 'bristle', when: onDay(3),
    intro: 'The fluffy ones. Dust fluff. It makes the best broom heads; it picks up everything. Six handfuls, please. Gently. They\'re shy.',
    outro: 'Fluffy! A new broom by supper. You\'re tidier than you look.',
    steps: [{ id: 'bring', text: 'Bring Bristle 6 dust fluff', hint: 'Dust bunnies drift about the upper tunnels. Brush them, gently.', deliver: { to: 'bristle', items: { dust_fluff: 6 } } }],
    reward: { gold: 250 },
  }),

  // ================================================================== Digby and Nubs, the ore haulers
  v_digby_coal: V({
    title: 'Shift Swap', from: 'digby',
    intro: 'The lift furnace eats coal like I eat lunch, and I\'ve eaten lunch. Fifteen lumps and I\'ll owe you a shift.',
    outro: 'Fifteen! That\'s a month of going up and down. I\'ll never use my legs again.',
    steps: [{ id: 'bring', text: 'Bring Digby 15 coal', hint: 'Black seams in the Rootsoil.', deliver: { to: 'digby', items: { coal: 15 } } }],
    reward: { gold: 450 },
  }),
  v_digby_lair: V({
    title: 'The Old Workings', from: 'digby', requires: ['v_digby_coal'], when: reached(2),
    intro: 'Something\'s nested in the old Company workings. We hear it scratching through the lift shaft at night. Find a lair and clear it out. Bring a big stick. Bring two.',
    outro: 'Quiet as a cave last night. First good sleep in a month. Here, from the haulers.',
    steps: [{ id: 'clear', text: 'Clear out a creature lair', hint: 'Lairs and nests show as red rings on the radar. Block, then strike.', on: { type: 'nest' }, where: { danger: 'nest' } }],
    reward: { gold: 1000, sp: 1, lore: ['cr_nibbler'] },
  }),
  v_nubs_idol: V({
    title: 'A Nose Like Mine', from: 'nubs', kind: 'lore',
    intro: 'They say the old ones in the ruins had noses like mine. Star-noses! There\'s an idol in the shrines, with a nose. I just want to see it. Could you... could you find one?',
    outro: 'It\'s got MY nose! Twenty-two fingers! I knew it. I KNEW it.',
    steps: [
      { id: 'find', text: 'Find a Star-Nose Idol in a ruin', hint: 'It waits in the sealed strongroom of a monster room in the Rootsoil. Find the hidden switch to get in.', on: { type: 'relic', id: 'relic_idol' }, check: (st) => st.count('relic_idol') > 0, where: { ruin: 'nearest' } },
      { id: 'show', text: 'Show the idol to Nubs', hint: 'Nubs hauls ore from the pile to the town lift.', talk: 'nubs', need: (st) => st.count('relic_idol') > 0 },
    ],
    reward: { gold: 600, lore: ['s_noses'] },
  }),

  // ================================================================== families and neighbours
  v_primrose_eggs: V({
    title: 'Breakfast for Twins', from: 'primrose', when: onDay(2),
    intro: 'The twins will only eat eggs from a hen they\'ve SEEN. Yours, they\'ve seen. Four eggs, please, fresh from Nugget\'s nest box.',
    outro: 'Bean, Sprout: eggs! From the hen! ...They\'ve gone very quiet. That\'s a good sign. Here, Bean made you this, and Sprout found a nest box for Nugget.',
    steps: [{ id: 'bring', text: 'Bring Mrs. Primrose 4 eggs', hint: 'Keep Nugget fed and she lays eggs onto her shelf in the coop.', deliver: { to: 'primrose', items: { egg: 4 } } }],
    reward: { gold: 300, items: { plushie: 1, nest_tin: 1 } },
  }),
  v_kids_dare: V({
    title: 'The Dare', from: 'tilly',
    intro: 'We DARE you to peer into the old Shaft Seven tunnel, where the ghost lives. And then look down the well, where the OTHER ghost lives. Double dare!',
    outro: 'You DID it! You\'re in the gang. Honorary. Here, it\'s my best pebble.',
    steps: [
      { id: 'tunnel', text: 'Peer into the old tunnel by the plaza', hint: 'The boarded-up tunnel on the north wall, by Old Hollis\'s bench.', look: 'tunnel' },
      { id: 'well', text: 'Look down the old well', hint: 'The stone well in town. E to peer in.', look: 'well' },
    ],
    reward: { gold: 50, items: { quartz: 1 }, lore: ['k_tunnel'] },
  }),
  v_kids_beetles: V({
    title: 'Beetle Jar', from: 'hops', when: onDay(2),
    intro: 'I want the GLOWY ones. Glow beetles! Three! For my jar! I\'ll name them after you!',
    outro: 'This one\'s you, this one\'s you, and this one\'s also you. Here, I made you a jar too!',
    steps: [{ id: 'bring', text: 'Bring Hops 3 glow beetles', hint: 'Glow beetles crawl on cave walls and floors. Catch them gently (E).', deliver: { to: 'hops', items: { glow_beetle: 3 } } }],
    reward: { gold: 120, items: { beetle_jar: 1 } },
  }),
  v_kids_hen: V({
    title: 'Show and Tell', from: 'twitch',
    intro: 'Is it true you have a HEN? A real one? With FEATHERS? Bring her here. Please. I\'ve never seen a hen. Please please please.',
    outro: 'SHE CLUCKED AT ME. Best day. Best day ever.',
    steps: [{ id: 'show', text: 'Walk Nugget over to Twitch', hint: 'Nugget follows you in town if she\'s fed. Bring her close and talk to Twitch.', talk: 'twitch', need: (st, g) => nuggetNear(g, 3) }],
    reward: { gold: 100, items: { chicken_feed: 3 } },
  }),
  v_snorri_tea: V({
    title: 'A Strong Cup', from: 'snorri', when: onDay(2),
    intro: 'Zzz... mm? Is it night? No? Then... tea. Stone-thyme tea. Strong enough to stand a pick in. Zzz.',
    outro: 'I am AWAKE. I can hear colours. Sit down, I\'ll tell you about the trolls.',
    steps: [{ id: 'bring', text: 'Bring Snorri a Stone-Thyme Tea', hint: 'Cook it at a hearth: stone thyme grows on rocky ledges in the upper layers.', deliver: { to: 'snorri', items: { thyme_tea: 1 } } }],
    reward: { gold: 300, lore: ['cr_trolls'] },
  }),
  v_burdock_bells: V({
    title: 'Burdock\'s Bells', from: 'burdock', requires: ['os_lifts'],
    intro: 'Three old lifts, Old Star says, and you think you know the mine. Hmph. There are dozens. Find five, ring their bells, and then we\'ll talk.',
    outro: 'Five bells. Hmph. ...Not bad. Not good. Not bad.',
    steps: [{ id: 'lifts', text: 'Find 5 old lifts', hint: 'Dig toward the faint "? lift" signals on your radar and ring their bells.', count: liftsFound, n: 5 }],
    reward: { gold: 1500, sp: 1, lore: ['t_council'] },
  }),
  v_clover_begonias: V({
    title: 'The Begonia Feud', from: 'clover', when: onDay(3),
    intro: 'My begonias glow brighter than Hazel\'s. Everybody knows it. Hazel doesn\'t know it. Go and ask her about her begonias, then come back and tell me I\'m right.',
    outro: 'Well. That\'s settled, then.',
    steps: [
      { id: 'hazel', text: 'Ask Hazel about her begonias', hint: 'Nibble & Root, the grocery on the west wall.', talk: 'grocer', say: { by: 'grocer', text: 'Clover\'s begonias? Hers are PAINTED, dear. Glowcap juice. I\'ve seen her at it with a brush.' } },
      {
        id: 'verdict', text: 'Tell Clover what you think', hint: 'On her doorstep in the back lanes, south-east.',
        choose: {
          to: 'clover', prompt: 'Well? Whose begonias glow brighter?',
          options: [
            { id: 'clover', label: 'Yours, obviously', sub: 'Keep the peace on this doorstep', say: 'Ha! I KNEW it. Here, have a jar of jam. Don\'t tell Hazel where it came from.', reward: { gold: 200, items: { berry_jam: 1 } } },
            { id: 'hazel', label: 'Hazel\'s, honestly', sub: 'The truth, plainly', say: 'Hmph. Honest, aren\'t you. Well. Honesty\'s worth something, I suppose. Not much.', reward: { gold: 100, rep: { grocer: 2 } } },
            { id: 'paint', label: '"Hazel says you paint them"', sub: 'The begonia secret', say: '...She KNOWS? Oh, the cheek. Fine. FINE. Here: never, ever tell anyone.', reward: { gold: 400 }, flag: 'begoniaSecret' },
          ],
        },
      },
    ],
    reward: { lore: ['cr_glow'] },
  }),
  v_garnet_gems: V({
    title: 'A Necklace of Colours', from: 'garnet', when: reached(3),
    intro: 'The Council wants a necklace for the festival. Red, blue and green, like a sunset, I\'m told. A ruby, a sapphire and an emerald. I\'ll pay above my own prices, which is saying something.',
    outro: 'Look at the fire in that ruby! The Council will faint. I may faint.',
    steps: [{ id: 'bring', text: 'Bring Garnet a ruby, a sapphire and an emerald', hint: 'Gems sit in geodes deeper down: rubies in the Magma Deep, sapphires and emeralds in the Crystal Grotto and below.', deliver: { to: 'garnet', items: { ruby: 1, sapphire: 1, emerald: 1 } } }],
    reward: { gold: 3200, sp: 1, lore: ['cr_drakes'] },
  }),
  v_morel_sampler: V({
    title: 'One of Everything', from: 'morel', when: onDay(2),
    intro: 'I sell what grows on the Hollow\'s doorstep. But the deep grows things nobody\'s named! Pick six different kinds of plant and I\'ll make a sampler for the window.',
    outro: 'Ooh. Ooh! A proper sampler. People will come from all over. Well, from the back lanes.',
    steps: [{ id: 'pick', text: 'Forage 6 different kinds of plant', hint: 'Glowcaps, berries, thyme, tubers, garlic, ferns, moss... anything with roots counts.', on: { type: 'forage' }, unique: 'id', n: 6 }],
    reward: { gold: 650, lore: ['cr_hollow'] },
  }),
  v_finn_shrimp: V({
    title: 'Frost Shrimp on Ice', from: 'finn', when: reached(5),
    intro: 'Frost shrimp! From the Frost Vault! The Council\'s been asking. Three, still frosty. They go off if you look at them, so don\'t look at them.',
    outro: 'Frosty! Fresh! The Council will be insufferable. Here, double the usual.',
    steps: [{ id: 'bring', text: 'Bring Finnick 3 frost shrimp', hint: 'They scuttle on the ice of the Frost Vault. Bring something warm to eat.', deliver: { to: 'finn', items: { frost_shrimp: 3 } } }],
    reward: { gold: 4200, sp: 1 },
  }),
  v_loam_letter: V({
    title: 'A Letter for Up Top', from: 'loam', when: onDay(3), gives: { loam_letter: 1 },
    intro: 'My granddaughter Fern took the Express forty years ago. I write to her twice a year. Would you take my letter to Mr. Fennimore? My knees don\'t do the plaza any more.',
    outro: 'Up it goes. Up and up. She\'ll read it in the sunshine. Thank you, dear.',
    steps: [
      { id: 'post', text: 'Give Nana Loam\'s letter to Mr. Fennimore', hint: 'The ticket booth under the sunbeam.', deliver: { to: 'ticket', items: { loam_letter: 1 } }, say: { by: 'ticket', text: 'A letter for the mailbag? Darling, of course. Twice a year, up it goes with the cleaning crew.' } },
      { id: 'tell', text: 'Tell Nana Loam it\'s in the mailbag', hint: 'Her doorstep in the back lanes, south.', talk: 'loam' },
    ],
    reward: { gold: 200, lore: ['t_letters'] },
  }),
  v_bess_soup: V({
    title: 'Soup for Albert', from: 'bess', when: onDay(2),
    intro: 'My Albert\'s poorly again. Glowcap soup, made properly, mind: a good, careful pot, not one of those slapdash ones. He can tell.',
    outro: 'He says it\'s the best soup he\'s ever had. He says that every time. This time I believe him.',
    steps: [
      { id: 'cook', text: 'Cook a careful Glowcap Soup (score 70+)', hint: 'Chop evenly, simmer gently, season to taste. A score of 70 or better.', on: { type: 'cook', dish: 'glowcap_soup', score: (v) => (v ?? 0) >= 70 }, where: { place: 'home' } },
      { id: 'bring', text: 'Bring Bess a Glowcap Soup', hint: 'Her doorstep in the back lanes, south-west.', deliver: { to: 'bess', items: { glowcap_soup: 1 } } },
    ],
    reward: { gold: 350 },
  }),

  // ================================================================== Professor Talpa: the Old Ones
  lo_talpa_carvings: V({
    title: 'Rubbings of the Old Ones', from: 'blueprints', kind: 'lore',
    intro: 'The ruins are carved with raised runes nobody can read. I have a theory. Read the carvings in two different ruins, with your paws, mind, not your eyes, and tell me what they say.',
    outro: '"We came down from the cold with our noses to the stone"? Fas-cin-a-ting. They wrote for TOUCH. They wrote for noses! Here: my notes, and a fee.',
    steps: [
      { id: 'read', text: 'Read the carvings in 2 different ruins', hint: 'The old dungeons are rooms of fitted stone hidden in the rock. E on a carved frieze or a rune wall. The walls by the sealed door are carved.', on: { type: 'lore', src: 'carving' }, unique: 'ruin', n: 2, where: { ruin: 'nearest' } },
      { id: 'tell', text: 'Tell Professor Talpa what they say', hint: 'Inkwell Plans, on the west wall of Deep Town.', talk: 'blueprints' },
    ],
    reward: { gold: 700, sp: 1, lore: ['s_read'] },
  }),
  lo_talpa_relic: V({
    title: 'A Relic for the Archive', from: 'blueprints', kind: 'lore', requires: ['lo_talpa_carvings'],
    intro: 'Every sealed ruin hides a treasure room, and every treasure room a relic. Bring me one, any one, for the archive. I\'ll pay you twice what Old Vex would, and write a label.',
    outro: 'Into the cabinet it goes, with a label in my best hand. And the fee, as promised. Twice. I counted.',
    steps: [
      { id: 'bring', text: 'Bring Professor Talpa any relic', hint: 'Solve a ruin\'s puzzle to open its treasure room; the relic is in the chest.', deliver: { to: 'blueprints', any: { cat: 'relic', n: 1 } }, where: { ruin: 'nearest' } },
    ],
    reward: { gold: 2400, sp: 1, lore: ['cr_golems'] },
  }),
  lo_talpa_shrine: V({
    title: 'The Star Shrine', from: 'blueprints', kind: 'lore', requires: ['lo_talpa_relic'],
    intro: 'The shrines have idols, and the idols have eyes that are said to light up. Wake one. Solve a Starfolk vault\'s puzzle, see its eyes open, and come and tell me what its face looked like. I need to be sure.',
    outro: 'A star nose. Of course. OF COURSE. The Old Ones never left. Look at Grubb! Look at young Nubs! They had GRANDCHILDREN.',
    steps: [
      { id: 'wake', text: 'Wake the eyes of a Starfolk vault', hint: 'Starfolk vaults are tall halls on marble pillars (Crystal Grotto and deeper). Their puzzles are symbol drums; the deep fortresses\' are light beams.', on: { type: 'puzzle', kind: ['dials', 'beams'] }, where: { ruin: 'vault' } },
      { id: 'tell', text: 'Tell Professor Talpa about the idol\'s face', hint: 'Inkwell Plans in Deep Town.', talk: 'blueprints' },
    ],
    reward: { gold: 3000, sp: 2, lore: ['s_kin'] },
  }),
  lo_talpa_key: V({
    title: 'The Key With No Lock', from: 'blueprints', kind: 'lore', requires: ['lo_talpa_shrine'], when: reached(5),
    intro: 'The carvings speak of a Sky Door, shut against the Long Cold, and a key given to the deepest vault. The Star Key. If it exists, it\'s in the Frost Vault. Find it. Then we must decide what to do with it.',
    outro: 'There. Whatever we do with it, we know now. The Old Ones meant to come back. Thank you.',
    steps: [
      { id: 'find', text: 'Find the Star Key in a sealed vault', hint: 'A sealed vault in the Frost Vault layer. Its treasure room holds the key.', on: { type: 'relic', id: 'relic_key' }, check: (st) => st.count('relic_key') > 0, where: { ruin: 'vault' } },
      {
        id: 'decide', text: 'Decide with Professor Talpa what to do with the key', hint: 'Inkwell Plans in Deep Town.',
        choose: {
          to: 'blueprints', prompt: 'The Star Key. It opens the Sky Door, wherever that is. What do we do with it?',
          options: [
            { id: 'archive', label: 'Keep it safe in your archive', sub: 'Talpa pays for it, and it stays in Deep Town', say: 'Under glass, with a label and a lock of its own. And a great deal of gold for you.', reward: { gold: 15000 }, take: { relic_key: 1 } },
            { id: 'keep', label: 'I\'ll keep it', sub: 'It\'s going up with me, one day', say: 'Then take it up with you, when you go. Maybe the door\'s up there. Maybe it\'s waiting.', reward: { sp: 2 } },
          ],
        },
      },
    ],
    reward: { lore: ['s_return'] },
  }),
  lo_talpa_survey: V({
    title: 'Survey of the Deep Garden', from: 'blueprints', kind: 'lore', requires: ['lo_talpa_carvings'], when: reached(2),
    intro: 'Below the Clayworks there are caverns so big they have weather. Ferns! Bones! Beasts! I\'m drawing a survey and I need someone to walk it. A good long walk. Mind the teeth.',
    outro: 'Look at this! A whole new sheet. I shall call it the Deep Garden, and you shall have the first copy, and a fee.',
    steps: [{ id: 'walk', text: 'Walk the dino caverns', hint: 'Huge caves with ferns and giant bones. Walk around in them; the raptors bite.', on: { type: 'explore', biome: 'dino' }, sum: 'n', n: 150, where: { biome: 'dino' } }],
    reward: { gold: 1800, sp: 1, items: { bp_spear: 1 }, lore: ['cr_garden'] },
  }),

  // ================================================================== Old Hollis: the million that went down Shaft Seven
  lo_hollis_shaft7: V({
    title: 'Shaft Seven', from: 'hollis', kind: 'lore', requires: ['os_town'],
    intro: 'You came out of Shaft Seven like a cork from a bottle, youngster. Forty years nothing\'s come out of there. The night it fell, it took a million gold and nearly your Old Star. Ask him about it. He won\'t tell you. Ask anyway.',
    outro: 'So now you know. He dug me out with his paws, that night. Me and two others. Then he went home and never came back. I\'ve been sitting by this tunnel ever since, waiting to thank him.',
    steps: [
      { id: 'ask', text: 'Ask Old Star about Shaft Seven', hint: 'At home, in his house above the mine. Talk to him (E).', talk: 'oldstar', say: { by: 'oldstar', text: 'Hollis talks too much. ...It was a million. Near enough. It went down a crack. That\'s all. Mind the fire.', mood: 'worried' } },
      { id: 'read', text: 'Read 2 pages of the old foreman\'s journal', hint: 'Pages are in the satchels of the miners lost in the old dungeons (E on the remains).', on: { type: 'lore', src: 'journal' }, unique: 'id', n: 2, where: { sight: 'cavein' } },
      { id: 'back', text: 'Go back to Old Hollis', hint: 'His bench by the boarded tunnel in Deep Town.', talk: 'hollis' },
    ],
    reward: { gold: 800, sp: 1, lore: ['os_shaft7', 'os_stamp'] },
  }),
  lo_hollis_cart: V({
    title: 'The Million Cart', from: 'hollis', kind: 'lore', requires: ['lo_hollis_shaft7'], when: (st) => !!st.data.traders?.met?.rocco || reached(2)(st),
    intro: 'That cart went down somewhere. Gold doesn\'t vanish, youngster: somebody finds it. And who down here always has money and never has a job? Go and see that raccoon. Look behind his crates.',
    outro: 'Well. Well, well.',
    steps: [
      { id: 'ask', text: 'Talk to Rocco', hint: 'Rocco\'s Storage, in the Clayworks.', talk: 'rocco', where: { burrow: 'raccoon' } },
      { id: 'search', text: 'Find what Rocco hides behind his crates', hint: 'A stack of crates in his back wall has tell-tale hinges. E, and E again.', on: { type: 'puzzle', id: 'rocco_door' }, check: (st) => !!st.data.traders?.secret, grant: { star_coin: 1 }, where: { burrow: 'raccoon' }, say: { text: 'In the stash nook, among the coins, one is stamped with a little red star: <b>a star-stamped coin</b>.' } },
      {
        id: 'verdict', text: 'Show the coin to Old Hollis', hint: 'His bench by the boarded tunnel in Deep Town.',
        choose: {
          to: 'hollis', prompt: 'That\'s his stamp. That\'s Astor\'s star. Rocco\'s family found the cart. ...What do we tell Old Star?',
          options: [
            { id: 'tell', label: 'Tell Old Star the truth', sub: 'And have a word with Rocco', say: 'Good. He deserves to know. And that raccoon deserves a talking-to. Go and give him one.', flag: 'starToldRocco', reward: { sp: 1 } },
            { id: 'quiet', label: 'Let sleeping gold lie', sub: 'Old Star has made his peace', say: 'Maybe you\'re right. Keep the coin, youngster. It\'s a lucky one. It came back.', flag: 'starQuiet', reward: { gold: 2500 } },
          ],
        },
      },
    ],
    reward: { lore: ['os_million'] },
  }),
};

/** Burrow folk's extra requests (offered on talk like the others in data/quests.js). */
export const BURROW_QUESTS = {
  rc_amends: {
    title: 'Rocco Makes Amends', giver: 'rocco', kind: 'request', from: 'rocco', urgent: true, requires: ['lo_hollis_cart'], when: (st) => !!st.flag('starToldRocco'), gives: { rocco_purse: 1 },
    intro: 'Fine! FINE. Grandpa found a cart in the deep, full of gold with little stars on. He... spent most of it. On this burrow. Here. It\'s what\'s left. Take it to the old star-nose. Tell him... tell him sorry. Don\'t tell him I cried. Raccoons don\'t cry.',
    outro: 'He laughed? He LAUGHED? ...Good. That\'s good.',
    steps: [{ id: 'bring', text: 'Bring Rocco\'s purse to Old Star', hint: 'At home, in his house above the mine.', deliver: { to: 'oldstar', items: { rocco_purse: 1 } }, say: { by: 'oldstar', text: 'Star-stamped. Every one. Forty years. ...Ha! A raccoon! I\'ll put it on the mantel. Not for spending. For remembering.', mood: 'laugh' } }],
    reward: { sp: 2, items: { music_box: 1 }, lore: ['os_sorry'] },
  },
  tr_gems: {
    title: 'A Gem Case for the Post', giver: 'trader', kind: 'request', from: 'trader', requires: ['tr_bronze'],
    intro: 'Folk want to see sparkle when they walk in. Two amethysts and two amber for the display case, if you please. I\'ll pay you a sparkle\'s worth.',
    outro: 'Look at them catch the lamp! The Post looks like a palace.',
    steps: [{ id: 'bring', text: 'Bring {trader} 2 amethysts and 2 amber', hint: 'Amber in the Rootsoil and Clayworks, amethyst a little lower.', deliver: { to: 'trader', items: { amethyst: 2, amber: 2 } }, where: { burrow: 'trader' } }],
    reward: { gold: 900, sp: 1 },
  },
  hb_garlic: {
    title: 'Garlic for the Pot', giver: 'herbalist', kind: 'request', from: 'herbalist', requires: ['hb_glowcap'],
    intro: 'Cave garlic. Four bulbs. For a tincture. And for supper. Mostly supper.',
    outro: 'Pungent. Excellent. Go away now, you smell of garlic.',
    steps: [{ id: 'bring', text: 'Bring {herbalist} 4 cave garlic', hint: 'Cave garlic pushes up through loam in the upper layers.', deliver: { to: 'herbalist', items: { cave_garlic: 4 } }, where: { burrow: 'herbalist' } }],
    reward: { gold: 260, sp: 1 },
  },
};

// Master item table. Every item the player can hold lives here.
//
// cat:      mineral | gem | ingot | plant | critter | drop | ingredient | food |
//           tool | equip | furniture | floor | wallpaper | blueprint | consumable | key
// value:    base sell price at 100% quality (gold)
// price:    shop buy price (if sold)
// q:        true → carries a quality % (minerals, gems, ingots)
// icon:     spec consumed by gfx/PixelArt.js drawIcon()

export const ITEMS = {
  // ───────────── Minerals (raw ore & special stones) ─────────────
  coal: { name: 'Coal', cat: 'mineral', value: 6, q: true, icon: { k: 'coal' },
    desc: 'Black, crumbly and happy to burn. Smelting fuel. Keep it away from open flame.' },
  copper_ore: { name: 'Copper Ore', cat: 'mineral', value: 15, q: true, metal: 'copper', icon: { k: 'ore', rock: 0x6e5a4b, ore: [0xd9773f, 0xf2a35e, 0x9c4a24] },
    desc: 'Rust-orange specks in plain rock. Soft and friendly. Smelts into copper.' },
  tin_ore: { name: 'Tin Ore', cat: 'mineral', value: 19, q: true, metal: 'tin', icon: { k: 'ore', rock: 0x655b52, ore: [0xbfc3c4, 0xe8ecec, 0x7f8586] },
    desc: 'Dull silver flakes. Useless alone, wonderful with copper.' },
  salt_crystal: { name: 'Rock Salt', cat: 'mineral', value: 8, q: true, icon: { k: 'crystal', c: [0xf3e6e6, 0xffffff, 0xc9b4b4] },
    desc: 'Pinkish salt cubes. Seasons any stew. Dissolves if water touches it.' },
  fossil: { name: 'Fossil', cat: 'mineral', value: 80, q: true, icon: { k: 'fossil' },
    desc: 'Something old, curled up in stone. Brittle: a pick will wreck it, a brush will not.' },
  iron_ore: { name: 'Iron Ore', cat: 'mineral', value: 38, q: true, metal: 'iron', icon: { k: 'ore', rock: 0x5b4f4a, ore: [0x9a6450, 0xc4876c, 0x5c3428] },
    desc: 'Heavy, red-brown and reliable. The backbone of every smithy.' },
  lumite: { name: 'Lumite', cat: 'mineral', value: 110, q: true, glow: 0x9dff9a, icon: { k: 'crystal', c: [0x7bf08a, 0xd9ffd6, 0x2f9a52], glow: true },
    desc: 'Glows green in the dark. Flashes brightly when struck.' },
  silver_ore: { name: 'Silver Ore', cat: 'mineral', value: 120, q: true, metal: 'silver', icon: { k: 'ore', rock: 0x4d4a55, ore: [0xd8dde6, 0xffffff, 0x8f97a6] },
    desc: 'Bright threads in dark rock. Shines even by candlelight.' },
  echo_crystal: { name: 'Echo Crystal', cat: 'mineral', value: 450, q: true, icon: { k: 'crystal', c: [0x9fd6ff, 0xeaf7ff, 0x4d86c9] },
    desc: 'Hums when nearby rock is struck. Heavy blows nearby will shatter it. Chisels are quiet enough.' },
  gravium: { name: 'Gravium', cat: 'mineral', value: 400, q: true, icon: { k: 'crystal', c: [0xc9a6ff, 0xf3e8ff, 0x7a4fc9], float: true },
    desc: 'Falls up. Once free of its rock it drifts toward the ceiling, so grab it fast.' },
  bioxide: { name: 'Bioxide', cat: 'mineral', value: 700, q: true, glow: 0x7fe7ff, icon: { k: 'crystal', c: [0x6fe6ff, 0xe6fdff, 0x2c8fb8], zap: true },
    desc: 'Explosive and electric. Bare paws get zapped. Strike it hard and it blows. Rubber gloves recommended.' },
  gold_ore: { name: 'Gold Ore', cat: 'mineral', value: 560, q: true, metal: 'gold', icon: { k: 'ore', rock: 0x4a3c34, ore: [0xf2c23a, 0xfff0a0, 0xb07a14] },
    desc: 'Fat yellow nuggets. Every mole in town has dreamed of this.' },
  magmaite: { name: 'Magmaite', cat: 'mineral', value: 1200, q: true, glow: 0xff7a2a, icon: { k: 'crystal', c: [0xff6a1a, 0xffd27a, 0xa82a08], glow: true },
    desc: 'Still molten inside. Sets plants and coal alight, boils water, burns bare paws.' },
  obsidian_shard: { name: 'Obsidian Shard', cat: 'mineral', value: 160, q: true, icon: { k: 'shard', c: [0x2a2238, 0x6b5a8a, 0x0e0a14] },
    desc: 'Volcanic glass, sharper than any blade you can forge. Forms where lava meets water.' },
  frostite: { name: 'Frostite', cat: 'mineral', value: 2600, q: true, glow: 0xaef4ff, icon: { k: 'crystal', c: [0xbff6ff, 0xffffff, 0x5ab8d9] },
    desc: 'So cold it freezes water solid on contact. Numbs unprotected paws.' },
  mithril_ore: { name: 'Mithril Ore', cat: 'mineral', value: 2300, q: true, metal: 'mithril', icon: { k: 'ore', rock: 0x3c4352, ore: [0x9fe0e6, 0xeaffff, 0x4f9aa6] },
    desc: 'Light as a feather, tough as a grudge.' },
  moonsilver_ore: { name: 'Moonsilver Ore', cat: 'mineral', value: 3000, q: true, metal: 'moonsilver', icon: { k: 'ore', rock: 0x2f3044, ore: [0xe4e8ff, 0xffffff, 0x9aa2d9] },
    desc: 'Pale and soft. Air tarnishes it, so once it is exposed, dig it out quickly.' },
  voidstone: { name: 'Voidstone', cat: 'mineral', value: 13000, q: true, icon: { k: 'crystal', c: [0x2a1240, 0x7a3fd0, 0x0a0410], dark: true },
    desc: 'Drinks the light around it. Invisible to X-ray.' },
  adamant_ore: { name: 'Adamant Ore', cat: 'mineral', value: 8500, q: true, metal: 'adamant', icon: { k: 'ore', rock: 0x2b2a2e, ore: [0x4fd9a0, 0xc8ffe6, 0x1f7a58] },
    desc: 'Only the finest pick will bite it.' },
  starmetal_ore: { name: 'Starmetal Ore', cat: 'mineral', value: 11500, q: true, metal: 'starmetal', glow: 0xffe7b0, icon: { k: 'ore', rock: 0x1d1b2a, ore: [0xffe08a, 0xffffff, 0xc9862a], star: true },
    desc: 'A meteorite buried deep. It pulls loose metal toward itself.' },
  sunstone: { name: 'Sunstone', cat: 'mineral', value: 18000, q: true, glow: 0xffd34a, icon: { k: 'gem', c: [0xffcf3a, 0xfffbd0, 0xd9781a], cut: 'round', glow: true },
    desc: 'A piece of sunlight trapped underground. Hot to the touch.' },

  // ───────────── Gems ─────────────
  quartz: { name: 'Quartz', cat: 'gem', value: 35, q: true, icon: { k: 'crystal', c: [0xf2f2f8, 0xffffff, 0xb4b4c8] },
    desc: 'Clear six-sided spikes. Common, but pretty.' },
  amber: { name: 'Amber', cat: 'gem', value: 150, q: true, icon: { k: 'gem', c: [0xf2a32c, 0xffe08a, 0xa85a10], cut: 'blob' },
    desc: 'Old tree sap turned to stone. Sometimes something is stuck inside.' },
  amber_bug: { name: 'Amber with Beetle', cat: 'gem', value: 640, q: true, icon: { k: 'gem', c: [0xf2a32c, 0xffe08a, 0xa85a10], cut: 'blob', bug: true },
    desc: 'A tiny beetle frozen mid-step. Collectors pay a fortune.' },
  amethyst: { name: 'Amethyst', cat: 'gem', value: 320, q: true, icon: { k: 'crystal', c: [0xa05ad9, 0xe8c8ff, 0x5a2a8a] },
    desc: 'Violet points that grow in hollow geodes.' },
  ruby: { name: 'Ruby', cat: 'gem', value: 1700, q: true, icon: { k: 'gem', c: [0xe02a3a, 0xff9aa2, 0x8a0a18], cut: 'oval' },
    desc: 'Deep red, born in the heat.' },
  emerald: { name: 'Emerald', cat: 'gem', value: 2600, q: true, icon: { k: 'gem', c: [0x2ad96a, 0xb4ffcc, 0x0a7a3a], cut: 'square' },
    desc: 'Green as a surface meadow. Probably.' },
  sapphire: { name: 'Sapphire', cat: 'gem', value: 3300, q: true, icon: { k: 'gem', c: [0x2a5ae0, 0xa8c4ff, 0x0a1f8a], cut: 'oval' },
    desc: 'A drop of deep, cold blue.' },
  diamond: { name: 'Diamond', cat: 'gem', value: 9500, q: true, icon: { k: 'gem', c: [0xd8f6ff, 0xffffff, 0x8ad0e6], cut: 'brilliant' },
    desc: 'No tool can chip it. Its rock is another matter.' },

  // ───────────── Ingots ─────────────
  copper_ingot: { name: 'Copper Ingot', cat: 'ingot', value: 40, q: true, metal: 'copper', icon: { k: 'ingot', c: [0xd9773f, 0xf6b27a, 0x8a3e1a] }, desc: 'Soft, warm, easy to shape.' },
  tin_ingot: { name: 'Tin Ingot', cat: 'ingot', value: 50, q: true, metal: 'tin', icon: { k: 'ingot', c: [0xbfc3c4, 0xf0f2f2, 0x6f7576] }, desc: 'Too soft for blades. Perfect for bronze.' },
  bronze_ingot: { name: 'Bronze Ingot', cat: 'ingot', value: 130, q: true, metal: 'bronze', icon: { k: 'ingot', c: [0xc98a3a, 0xf0c47a, 0x7a4a14] }, desc: 'Copper and tin, better together.' },
  iron_ingot: { name: 'Iron Ingot', cat: 'ingot', value: 100, q: true, metal: 'iron', icon: { k: 'ingot', c: [0x8a8f96, 0xc6cbd2, 0x4a4e54] }, desc: 'Honest grey iron.' },
  steel_ingot: { name: 'Steel Ingot', cat: 'ingot', value: 240, q: true, metal: 'steel', icon: { k: 'ingot', c: [0xa7b4c2, 0xe6eef6, 0x56606c] }, desc: 'Iron that ate its coal. Hard and springy.' },
  silver_ingot: { name: 'Silver Ingot', cat: 'ingot', value: 320, q: true, metal: 'silver', icon: { k: 'ingot', c: [0xd8dde6, 0xffffff, 0x8a92a0] }, desc: 'Bright and noble.' },
  gold_ingot: { name: 'Gold Ingot', cat: 'ingot', value: 1500, q: true, metal: 'gold', icon: { k: 'ingot', c: [0xf2c23a, 0xfff0a0, 0xa8700a] }, desc: 'Heavy, soft and very shiny.' },
  mithril_ingot: { name: 'Mithril Ingot', cat: 'ingot', value: 6000, q: true, metal: 'mithril', icon: { k: 'ingot', c: [0x9fe0e6, 0xf0ffff, 0x4a8f9a] }, desc: 'Weighs almost nothing.' },
  moonsilver_ingot: { name: 'Moonsilver Ingot', cat: 'ingot', value: 7800, q: true, metal: 'moonsilver', icon: { k: 'ingot', c: [0xe4e8ff, 0xffffff, 0x8a92d0] }, desc: 'Glows faintly, like a moon nobody down here has seen.' },
  adamant_ingot: { name: 'Adamant Ingot', cat: 'ingot', value: 22000, q: true, metal: 'adamant', icon: { k: 'ingot', c: [0x4fd9a0, 0xd0ffe8, 0x1a6a4a] }, desc: 'Practically unbreakable.' },
  starmetal_ingot: { name: 'Starmetal Ingot', cat: 'ingot', value: 30000, q: true, metal: 'starmetal', icon: { k: 'ingot', c: [0xffe08a, 0xffffff, 0xb0701a], star: true }, desc: 'Fell from the sky ages ago and stayed hot ever since.' },

  // ───────────── Plants ─────────────
  cave_carrot: { name: 'Cave Carrot', cat: 'plant', value: 8, price: 14, icon: { k: 'plant', t: 'carrot' }, food: 6,
    desc: 'Pale, crunchy and sweet. Grows where roots break through.' },
  glowcap: { name: 'Glowcap', cat: 'plant', value: 12, icon: { k: 'plant', t: 'glowcap' }, food: 5,
    desc: 'A soft blue-glowing mushroom. Eating it makes your whiskers shine.' },
  blindfern: { name: 'Blindfern', cat: 'plant', value: 10, icon: { k: 'plant', t: 'fern' }, food: 4,
    desc: 'A colorless fern that has never seen the sun. Crisp in salads.' },
  whisperweed: { name: 'Whisperweed', cat: 'plant', value: 40, icon: { k: 'plant', t: 'whisper' },
    desc: 'Its tendrils lean toward hidden ore. Murmurs when you get close.' },
  rubber_sap: { name: 'Rubber Sap', cat: 'plant', value: 22, icon: { k: 'plant', t: 'sap' },
    desc: 'Stretchy sap tapped from rubber vines. Outfitters make insulated gloves from it.' },
  pepperroot: { name: 'Pepperroot', cat: 'plant', value: 18, icon: { k: 'plant', t: 'pepper' }, food: 3,
    desc: 'A fiery little root. Warms you from the inside.' },
  sparkmoss: { name: 'Sparkmoss', cat: 'plant', value: 35, icon: { k: 'plant', t: 'sparkmoss' },
    desc: 'Crackling blue moss that grows near Bioxide. Tingles on the tongue.' },
  bubblebulb: { name: 'Bubblebulb', cat: 'plant', value: 40, icon: { k: 'plant', t: 'bubble' },
    desc: 'A bulb full of floaty gas. Makes you feel light.' },
  crystal_lily: { name: 'Crystal Lily', cat: 'plant', value: 90, icon: { k: 'plant', t: 'lily' },
    desc: 'Petals like glass. They ring when touched.' },
  gloomshroom: { name: 'Gloomshroom', cat: 'plant', value: 45, icon: { k: 'plant', t: 'gloom' },
    desc: 'Puffs sleepy spores when disturbed. Surprisingly restful in a stew.' },
  ashfern: { name: 'Ashfern', cat: 'plant', value: 60, icon: { k: 'plant', t: 'ashfern' },
    desc: 'A grey fern that thrives in volcanic heat.' },
  emberbloom: { name: 'Emberbloom', cat: 'plant', value: 85, icon: { k: 'plant', t: 'ember' },
    desc: 'A flower that is literally on fire. Handle with mitts.' },
  truffle: { name: 'Truffle', cat: 'plant', value: 500, icon: { k: 'plant', t: 'truffle' },
    desc: 'Buried treasure for the nose. Look for a drifting scent.' },
  frostbloom: { name: 'Frostbloom', cat: 'plant', value: 150, icon: { k: 'plant', t: 'frost' },
    desc: 'An icy blossom. Cold enough to keep a pie chilled.' },
  core_lotus: { name: 'Core Lotus', cat: 'plant', value: 2200, icon: { k: 'plant', t: 'lotus' },
    desc: 'Blooms only near the planet\'s heart. Legendary in mole cooking.' },

  // ───────────── Critters (caught alive) & drops ─────────────
  worm: { name: 'Earthworm', cat: 'critter', value: 6, price: 10, hen: 0.3, stack: 16, icon: { k: 'critter', t: 'worm' },
    desc: 'Wriggly, protein-rich, a mole classic. Chickens love them too.' },
  glow_beetle: { name: 'Glow Beetle', cat: 'critter', value: 35, icon: { k: 'critter', t: 'beetle' },
    desc: 'A beetle with a lantern for a bottom. Lovely in a jar.' },
  blind_fish: { name: 'Blind Cave Fish', cat: 'critter', value: 45, icon: { k: 'critter', t: 'fish' },
    desc: 'Pale, eyeless and delicious fried.' },
  frost_shrimp: { name: 'Frost Shrimp', cat: 'critter', value: 260, icon: { k: 'critter', t: 'shrimp' },
    desc: 'Crunchy and cold.' },
  dust_fluff: { name: 'Dust Fluff', cat: 'drop', value: 15, icon: { k: 'drop', t: 'fluff' }, desc: 'Brushed off a happy dust bunny. Soft.' },
  bat_guano: { name: 'Bat Guano', cat: 'drop', value: 12, icon: { k: 'drop', t: 'guano' }, desc: 'Gardeners swear by it. You would rather not.' },
  crab_shell: { name: 'Crab Shell', cat: 'drop', value: 40, icon: { k: 'drop', t: 'shell' }, desc: 'Left behind by a rock crab in a hurry.' },
  slug_slime: { name: 'Slug Slime', cat: 'drop', value: 30, icon: { k: 'drop', t: 'slime' }, desc: 'Shiny, slippery and full of metal flecks.' },
  spider_silk: { name: 'Spider Silk', cat: 'drop', value: 80, icon: { k: 'drop', t: 'silk' }, desc: 'Fine crystal-spider thread.' },
  spark_dust: { name: 'Spark Dust', cat: 'drop', value: 60, icon: { k: 'drop', t: 'spark' }, desc: 'Static-charged dust shed by spark mites.' },
  ember_scale: { name: 'Ember Scale', cat: 'drop', value: 220, icon: { k: 'drop', t: 'scale' }, desc: 'A still-warm scale from a lava newt.' },
  wisp_essence: { name: 'Wisp Essence', cat: 'drop', value: 900, icon: { k: 'drop', t: 'wisp' }, desc: 'A captured flicker of something that eats light.' },
  // creature loot (src/deep/enemies/loot.js; icons: enemies/lootArt.js). tags: what other parts may use them for
  kobold_trinket: { name: 'Kobold Trinket', cat: 'drop', value: 90, icon: { k: 'loot', t: 'trinket' }, tags: ['trinket'], desc: 'A carved bone charm on a string. Every kobold carries one for luck. Traders love them.' },
  beast_hide: { name: 'Thick Hide', cat: 'drop', value: 70, icon: { k: 'loot', t: 'hide', c: 0x8a7a52 }, tags: ['hide', 'forge'], lootCol: 0xb89a6a, desc: 'Tough, warty hide. Wraps a fine grip on a forged blade.' },
  troll_tusk: { name: 'Troll Tusk', cat: 'drop', value: 380, icon: { k: 'loot', t: 'tusk' }, tags: ['trophy', 'forge'], lootCol: 0xf0e4c8, desc: 'Yellowed, chipped and very heavy. Carvers and smiths both pay well.' },
  spider_fang: { name: 'Spider Fang', cat: 'drop', value: 140, icon: { k: 'loot', t: 'fang', c: 0x8ae05a }, tags: ['venom', 'forge'], lootCol: 0xa0e070, desc: 'Still beaded with venom. Set into a blade, it bites back.' },
  slime_gel: { name: 'Slime Gel', cat: 'drop', value: 28, icon: { k: 'loot', t: 'gel', c: 0x6ad07a }, tags: ['jelly', 'cook'], lootCol: 0x7ae08a, desc: 'A wobbly scoop of cave slime. Sets any broth, cleans any rust.' },
  wraith_ash: { name: 'Wraith Ash', cat: 'drop', value: 720, icon: { k: 'loot', t: 'ash', c: 0x8affe0 }, tags: ['magic', 'forge'], lootCol: 0x9affe0, desc: 'Cold grey ash that glows in the dark. What is left of a wraith, and still a little angry.' },
  drake_scale: { name: 'Drake Scale', cat: 'drop', value: 650, icon: { k: 'loot', t: 'scale', c: 0xc0562a }, tags: ['heat', 'forge'], lootCol: 0xff8a4a, desc: 'A palm-sized scale that shrugs off fire. Smiths quench with it for luck.' },
  raptor_claw: { name: 'Raptor Claw', cat: 'drop', value: 160, icon: { k: 'loot', t: 'claw' }, tags: ['trophy', 'forge'], lootCol: 0xf0e4cc, desc: 'The sickle claw of a cave raptor. Wickedly sharp.' },
  tyrant_tooth: { name: 'Tyrant Tooth', cat: 'drop', value: 1800, icon: { k: 'loot', t: 'tooth' }, tags: ['trophy', 'forge'], lootCol: 0xfff4e0, desc: 'A serrated tooth as long as your arm. Proof you met the king of the dino caverns and walked away.' },
  armor_plate: { name: 'Shellback Plate', cat: 'drop', value: 300, icon: { k: 'loot', t: 'plate', c: 0x8e7048 }, tags: ['armor', 'forge'], lootCol: 0xd4b47c, desc: 'A bony plate from a shellback. Light, hard, and lovely on a shield.' },
  ptero_feather: { name: 'Pterosaur Feather', cat: 'drop', value: 110, icon: { k: 'loot', t: 'feather', c: 0xd8703a }, tags: ['feather'], lootCol: 0xe09060, desc: 'A long rust-red quill. Fletchers and hat-makers in town go wild for these.' },
  dino_meat: { name: 'Dino Steak', cat: 'ingredient', value: 45, icon: { k: 'loot', t: 'meat' }, tags: ['meat', 'cook'], lootCol: 0xc8463a, desc: 'A thick, marbled cut. Sears beautifully over a hot hearth.' },
  drake_egg: { name: 'Drake Egg', cat: 'ingredient', value: 1500, icon: { k: 'loot', t: 'egg', c: 0x8a2e1a }, tags: ['egg', 'cook', 'heat'], lootCol: 0xe0703a, desc: 'Hot to the touch, and heavy. Cook it, sell it, or think very hard about it.' },

  // ───────────── Nugget's food (hen: how much it fills her, 0..1; inventory part) ─────────────
  chicken_feed: { name: 'Chicken Feed', cat: 'feed', value: 3, price: 6, hen: 0.5, stack: 24, icon: { k: 'hen', t: 'feed' },
    desc: 'Cracked corn and grit in a little sack. Nugget\'s favourite, and she will tell you so.' },
  cave_seeds: { name: 'Cave Seeds', cat: 'feed', value: 4, price: 8, hen: 0.3, stack: 24, icon: { k: 'hen', t: 'seeds' },
    desc: 'A twist of paper full of seeds shaken from cave grasses. A hen can live on these. Just about.' },
  fat_grub: { name: 'Fat Grub', cat: 'critter', value: 9, hen: 0.45, stack: 16, icon: { k: 'hen', t: 'grub' },
    desc: 'A plump grub dug out of rotten roots. Moles shudder. Hens swoon.' },

  // ───────────── Basic ingredients (shop) ─────────────
  flour: { name: 'Root Flour', cat: 'ingredient', value: 4, price: 8, icon: { k: 'ingr', t: 'flour' }, desc: 'Ground from dried roots.' },
  butter: { name: 'Butter', cat: 'ingredient', value: 6, price: 12, icon: { k: 'ingr', t: 'butter' }, desc: 'Imported from the surface at great expense. Allegedly.' },
  mushroom: { name: 'Button Mushroom', cat: 'ingredient', value: 4, price: 7, icon: { k: 'ingr', t: 'mushroom' }, desc: 'Plain and dependable.' },
  rootbeer: { name: 'Root Beer', cat: 'ingredient', value: 6, price: 11, icon: { k: 'ingr', t: 'rootbeer' }, desc: 'Fizzy. Brewed from actual roots.' },
  honey: { name: 'Deep Honey', cat: 'ingredient', value: 12, price: 22, icon: { k: 'ingr', t: 'honey' }, desc: 'From blind cave bees.' },
  egg: { name: 'Fresh Egg', cat: 'ingredient', value: 10, icon: { k: 'egg' }, desc: 'Laid by your chicken. Still warm.' },
  grub_bar: { name: 'Grub Bar', cat: 'food', value: 8, price: 18, energy: 15, icon: { k: 'food', t: 'bar' }, desc: 'Pressed grubs and oats. Tastes like effort.' },
  tea_flask: { name: 'Mushroom Tea', cat: 'food', value: 12, price: 30, energy: 25, icon: { k: 'food', t: 'flask' }, desc: 'Earthy and warming.' },
  hearty_pie: { name: 'Hearty Pie', cat: 'food', value: 40, price: 95, energy: 60, icon: { k: 'food', t: 'pie' }, desc: 'Hazel\'s famous pie. Worth every coin.' },

  // ───────────── Tools ─────────────
  pick_rusty: { name: 'Rusty Pickaxe', cat: 'tool', slot: 'pick', tier: 1, power: 1.0, rate: 0.36, value: 5, icon: { k: 'tool', t: 'pick', c: 0x8a6a52 },
    desc: 'Your old pick. Bites dirt and soft stone.' },
  pick_copper: { name: 'Copper Pickaxe', cat: 'tool', slot: 'pick', tier: 2, power: 1.5, rate: 0.33, price: 260, value: 80, icon: { k: 'tool', t: 'pick', c: 0xd9773f },
    desc: 'Breaks granite and crystal rock.' },
  pick_iron: { name: 'Iron Pickaxe', cat: 'tool', slot: 'pick', tier: 3, power: 2.2, rate: 0.31, price: 1800, value: 500, icon: { k: 'tool', t: 'pick', c: 0x9aa0a8 },
    desc: 'Cracks basalt.' },
  pick_steel: { name: 'Steel Pickaxe', cat: 'tool', slot: 'pick', tier: 4, power: 3.2, rate: 0.29, price: 9500, value: 2500, icon: { k: 'tool', t: 'pick', c: 0xc6d2de },
    desc: 'Cuts obsidian and permafrost.' },
  pick_mithril: { name: 'Mithril Pickaxe', cat: 'tool', slot: 'pick', tier: 5, power: 4.6, rate: 0.26, price: 52000, value: 15000, icon: { k: 'tool', t: 'pick', c: 0x9fe0e6 },
    desc: 'Light and vicious. Digs core rock.' },
  pick_adamant: { name: 'Adamant Pickaxe', cat: 'tool', slot: 'pick', tier: 6, power: 6.5, rate: 0.24, price: 165000, value: 40000, icon: { k: 'tool', t: 'pick', c: 0x4fd9a0 },
    desc: 'Nothing is too hard. Not even adamant.' },
  pick_starmetal: { name: 'Starmetal Pickaxe', cat: 'tool', slot: 'pick', tier: 7, power: 9.2, rate: 0.21, price: 420000, needs: { starmetal_ingot: 2 }, value: 110000, icon: { k: 'tool', t: 'pick', c: 0xffd27a },
    desc: 'Forged from a fallen star. Goes through core rock like it remembers the way.' },
  chisel_basic: { name: 'Chisel', cat: 'tool', slot: 'chisel', power: 0.55, rate: 0.2, price: 120, value: 30, icon: { k: 'tool', t: 'chisel', c: 0xa0a6ae },
    desc: 'Slow, quiet, precise. Chips rock away from ore without hurting it.' },
  chisel_fine: { name: 'Fine Chisel', cat: 'tool', slot: 'chisel', power: 1.1, rate: 0.16, price: 7000, value: 1500, icon: { k: 'tool', t: 'chisel', c: 0x9fe0e6 },
    desc: 'Twice the bite, still whisper-quiet.' },
  brush_basic: { name: 'Soft Brush', cat: 'tool', slot: 'brush', power: 1, rate: 0.12, price: 60, value: 15, icon: { k: 'tool', t: 'brush', c: 0xc9a06a },
    desc: 'Sweeps loose grit off exposed finds. Gentle enough for living things.' },
  brush_badger: { name: 'Badger Brush', cat: 'tool', slot: 'brush', power: 2, rate: 0.09, price: 3500, value: 800, icon: { k: 'tool', t: 'brush', c: 0x6a6a6a },
    desc: 'Synthetic badger hair. Vex insists no badgers were harmed.' },
  drill_steam: { name: 'Steam Drill', cat: 'tool', slot: 'drill', power: 3.4, heatRate: 0.34, price: 14000, value: 3000, icon: { k: 'tool', t: 'drill', c: 0xb08a3a },
    desc: 'Chews through rock. Overheats and shakes everything nearby, ore included.' },
  drill_lumite: { name: 'Lumite Drill', cat: 'tool', slot: 'drill', power: 6, heatRate: 0.2, price: 90000, value: 20000, icon: { k: 'tool', t: 'drill', c: 0x7bf08a },
    desc: 'Cooler, quieter, terrifyingly fast.' },
  xray_lamp: { name: 'X-Ray Lamp', cat: 'tool', slot: 'xray', radius: 5, price: 6500, value: 1500, icon: { k: 'tool', t: 'xray', c: 0x7fe7ff },
    desc: 'Shines through rock and reveals what hides inside.' },
  xray_prism: { name: 'Prism Lamp', cat: 'tool', slot: 'xray', radius: 8.5, price: 60000, value: 14000, icon: { k: 'tool', t: 'xray', c: 0xe0a8ff },
    desc: 'A wider, deeper gaze.' },
  support_beam: { name: 'Support Beam', cat: 'consumable', price: 25, value: 5, icon: { k: 'tool', t: 'beam' },
    desc: 'A sturdy wooden prop. Place it under a ceiling you want to keep there.' },
  glow_stake: { name: 'Glow Stake', cat: 'consumable', price: 15, value: 3, icon: { k: 'tool', t: 'stake' },
    desc: 'A lumite-tipped stake. Lights up a spot for good.' },
  // explosives: the dynamite slot throws the one with the biggest blast (src/deep/Explosives.js).
  // blast = crater radius (m), power = how hard it hits (ore chips, creatures), fuse = seconds,
  // toss = throw speed (m/s). Icons: src/deep/explosives/icon.js (drawn for spec t 'dynamite').
  dynamite: { name: 'Dynamite', cat: 'consumable', blast: 0.9, power: 1, fuse: 2.2, toss: 7.5, price: 45, value: 10, icon: { k: 'tool', t: 'dynamite', n: 1 },
    desc: 'A stick of mining dynamite. Light it, throw it, step back. Clears a good bite of rock at once.' },
  dynamite_bundle: { name: 'Dynamite Bundle', cat: 'consumable', blast: 1.5, power: 1.25, fuse: 2.6, toss: 6.3, price: 180, value: 40, icon: { k: 'tool', t: 'dynamite', n: 3 },
    desc: 'Three sticks and a shared fuse. Opens a whole room. Do not hold it.' },
  blasting_charge: { name: 'Blasting Charge', cat: 'consumable', blast: 2.2, power: 1.6, fuse: 3, toss: 4.4, price: 650, value: 150, icon: { k: 'tool', t: 'dynamite', n: 0, charge: true },
    desc: 'A heavy canister for the deep rock. It beeps faster and faster. Then it really does not.' },

  // ───────────── Equipment ─────────────
  helmet_basic: { name: 'Miner\'s Cap', cat: 'equip', slot: 'helmet', light: 5.5, value: 5, icon: { k: 'equip', t: 'helmet', c: 0xc9a23a }, desc: 'A candle on a hat.' },
  helmet_brass: { name: 'Brass Lamp Helmet', cat: 'equip', slot: 'helmet', light: 7.5, price: 900, value: 200, icon: { k: 'equip', t: 'helmet', c: 0xd9a84a }, desc: 'A proper oil lamp. Brighter, steadier.' },
  helmet_lumite: { name: 'Lumite Helmet', cat: 'equip', slot: 'helmet', light: 10, price: 12000, value: 3000, icon: { k: 'equip', t: 'helmet', c: 0x7bf08a }, desc: 'A lumite crystal set in steel.' },
  helmet_sun: { name: 'Sunstone Crown', cat: 'equip', slot: 'helmet', light: 13.5, price: 120000, value: 30000, icon: { k: 'equip', t: 'helmet', c: 0xffd34a }, desc: 'Like wearing a tiny sun.' },
  rubber_gloves: { name: 'Rubber Gloves', cat: 'equip', slot: 'gloves', protect: ['zap'], price: 900, needs: { rubber_sap: 5 }, value: 300, icon: { k: 'equip', t: 'gloves', c: 0xe0c03a },
    desc: 'Insulated. Bioxide and sparkmoss can\'t zap you through these.' },
  ember_mitts: { name: 'Ember Mitts', cat: 'equip', slot: 'gloves', protect: ['zap', 'heat'], price: 16000, needs: { ember_scale: 4 }, value: 4000, icon: { k: 'equip', t: 'gloves', c: 0xd9582a },
    desc: 'Ember-scale lining. Hold Magmaite, Sunstone and Emberbloom without a burn.' },
  frost_gauntlets: { name: 'Frostguard Gauntlets', cat: 'equip', slot: 'gloves', protect: ['zap', 'heat', 'cold'], price: 70000, needs: { frost_shrimp: 3, spider_silk: 4 }, value: 18000, icon: { k: 'equip', t: 'gloves', c: 0x7ad0f0 },
    desc: 'Nothing burns, shocks or numbs these paws.' },
  heat_suit: { name: 'Heat Suit', cat: 'equip', slot: 'suit', protect: ['heat'], price: 15000, value: 4000, icon: { k: 'equip', t: 'suit', c: 0xb8b0a0 }, desc: 'Reflective padding. Volcanic heat stops draining your energy.' },
  thermal_suit: { name: 'Thermal Suit', cat: 'equip', slot: 'suit', protect: ['heat', 'cold'], price: 80000, value: 20000, icon: { k: 'equip', t: 'suit', c: 0x6a8ad9 }, desc: 'Handles fire and frost alike.' },
  grip_boots: { name: 'Grip Boots', cat: 'equip', slot: 'boots', grip: 1, climb: 1.4, price: 1500, value: 400, icon: { k: 'equip', t: 'boots', c: 0x6a4a2a }, desc: 'Studded soles. Faster climbing, no slipping on ice.' },
  spring_boots: { name: 'Spring Boots', cat: 'equip', slot: 'boots', grip: 1, climb: 1.6, jump: 1.35, price: 30000, value: 8000, icon: { k: 'equip', t: 'boots', c: 0x3a8ad9 }, desc: 'Gravium-sprung soles. Boing.' },
  // backpacks: slots = pockets in the inventory grid (rows of 6, core/inventory.js); cap = the old
  // "finds per trip" (bagCapacity(), kept until the mine counts pockets instead)
  bag_small: { name: 'Burlap Sack', cat: 'equip', slot: 'bag', slots: 6, cap: 14, value: 2, icon: { k: 'equip', t: 'bag', c: 0xb8996a }, desc: 'Six pockets. Room for a few finds and a snack.' },
  bag_medium: { name: 'Leather Satchel', cat: 'equip', slot: 'bag', slots: 12, cap: 22, price: 700, value: 150, icon: { k: 'equip', t: 'bag', c: 0x8a5a2a }, desc: 'Twelve pockets: two rows, stitched tight.' },
  bag_large: { name: 'Miner\'s Pack', cat: 'equip', slot: 'bag', slots: 18, cap: 34, price: 5000, value: 1200, icon: { k: 'equip', t: 'bag', c: 0x5a6a3a }, desc: 'Eighteen pockets and a frame that sits right on the shoulders.' },
  bag_huge: { name: 'Expedition Pack', cat: 'equip', slot: 'bag', slots: 24, cap: 50, price: 30000, value: 7000, icon: { k: 'equip', t: 'bag', c: 0x3a5a8a }, desc: 'Twenty-four pockets for the long digs.' },
  bag_bottomless: { name: 'Bottomless Bag', cat: 'equip', slot: 'bag', slots: 36, cap: 90, price: 150000, value: 35000, icon: { k: 'equip', t: 'bag', c: 0x6a2a8a }, desc: 'Thirty-six pockets. Do not look inside.' },

  // ───────────── Key items ─────────────
  exit_ticket: { name: 'Surface Ticket', cat: 'key', value: 0, price: 1000000, icon: { k: 'ticket' },
    desc: 'ONE WAY · DEEP TOWN → THE SURFACE. Admit one mole (and one chicken).' },
};

// Floors & wallpapers & furniture are defined in furniture.js and merged in.
import { FURNITURE, FLOORS, WALLS } from './furniture.js';
import { BLUEPRINTS } from './weapons.js';
import { DISHES, INGREDIENTS } from './recipes.js';
import { RELIC_ITEMS } from '../deep/ruins/relics.js'; // ruins part: relics found in the ruins' treasure rooms

for (const [id, f] of Object.entries(FURNITURE)) ITEMS[id] = { cat: 'furniture', ...f };
for (const [id, f] of Object.entries(FLOORS)) ITEMS[id] = { cat: 'floor', ...f };
for (const [id, f] of Object.entries(WALLS)) ITEMS[id] = { cat: 'wallpaper', ...f };
for (const [id, b] of Object.entries(BLUEPRINTS)) ITEMS[id] = { cat: 'blueprint', ...b };
for (const [id, d] of Object.entries(DISHES)) ITEMS[id] = { cat: 'food', ...d };
// cooking part: the new cave ingredients; foraged plants carry a quality (how well they were pulled)
for (const [id, d] of Object.entries(INGREDIENTS)) ITEMS[id] = { ...d };
for (const [id, d] of Object.entries(RELIC_ITEMS)) ITEMS[id] = { ...d };
for (const it of Object.values(ITEMS)) if (it.cat === 'plant') it.q = true;

for (const [id, it] of Object.entries(ITEMS)) it.id = id;

export function item(id) {
  return ITEMS[id];
}

// Progression: the upgrade board's Keen Appraisal raises what ore and gems sell for. State keeps
// this in step with the upgrade level (setFindBonus), so every price shown matches what's paid.
let FIND_BONUS = 1;
export function setFindBonus(k) { FIND_BONUS = k > 0 ? k : 1; }

/** Sell price for an item at a quality (0-100) with pristine bonus. */
export function sellPrice(id, q = 100, pristine = false) {
  const it = ITEMS[id];
  if (!it) return 0;
  const base = it.value || 0;
  const qq = it.q ? 0.25 + 0.75 * Math.max(0, Math.min(100, q)) / 100 : 1;
  const find = it.cat === 'mineral' || it.cat === 'gem' ? FIND_BONUS : 1;
  return Math.max(1, Math.round(base * qq * (pristine ? 1.25 : 1) * find));
}

/**
 * The pick tier hard rock (MAT hp > 3.5) needs, by zone: obsidian in the Magma Deep wants iron,
 * the Frost Vault steel, the Core mithril. pickForTier(t) → the cheapest pick of that tier.
 */
export const HARD_ROCK_TIER = [0, 0, 0, 0, 3, 4, 5];
export function pickForTier(t) {
  return Object.values(ITEMS).filter((it) => it.slot === 'pick' && (it.tier || 1) >= t).sort((a, b) => (a.tier || 1) - (b.tier || 1))[0] || null;
}

export const CAT_LABEL = {
  mineral: 'Mineral', gem: 'Gem', ingot: 'Ingot', plant: 'Plant', critter: 'Critter', drop: 'Creature Drop',
  ingredient: 'Ingredient', food: 'Food', tool: 'Tool', equip: 'Equipment', furniture: 'Furniture',
  floor: 'Flooring', wallpaper: 'Wall Style', blueprint: 'Blueprint', consumable: 'Supply', key: 'Key Item', feed: 'Hen Feed', relic: 'Relic',
};

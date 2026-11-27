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
    desc: 'Smelting fuel. Gets under your claws.' },
  copper_ore: { name: 'Copper Ore', cat: 'mineral', value: 15, q: true, metal: 'copper', icon: { k: 'ore', rock: 0x6e5a4b, ore: [0xd9773f, 0xf2a35e, 0x9c4a24] },
    desc: 'Soft and forgiving. Smelts to copper.' },
  tin_ore: { name: 'Tin Ore', cat: 'mineral', value: 19, q: true, metal: 'tin', icon: { k: 'ore', rock: 0x655b52, ore: [0xbfc3c4, 0xe8ecec, 0x7f8586] },
    desc: 'Useless alone. Good with copper.' },
  salt_crystal: { name: 'Rock Salt', cat: 'mineral', value: 8, q: true, icon: { k: 'crystal', c: [0xf3e6e6, 0xffffff, 0xc9b4b4] },
    desc: 'Keep it dry or it\'s gone.' },
  fossil: { name: 'Fossil', cat: 'mineral', value: 80, q: true, icon: { k: 'fossil' },
    desc: 'Brush it out. A pick\'ll wreck it.' },
  iron_ore: { name: 'Iron Ore', cat: 'mineral', value: 38, q: true, metal: 'iron', icon: { k: 'ore', rock: 0x5b4f4a, ore: [0x9a6450, 0xc4876c, 0x5c3428] },
    desc: 'Heavy and dull. Pays the rent.' },
  lumite: { name: 'Lumite', cat: 'mineral', value: 110, q: true, glow: 0x9dff9a, icon: { k: 'crystal', c: [0x7bf08a, 0xd9ffd6, 0x2f9a52], glow: true },
    desc: 'Glows green. Flashes when you hit it.' },
  silver_ore: { name: 'Silver Ore', cat: 'mineral', value: 120, q: true, metal: 'silver', icon: { k: 'ore', rock: 0x4d4a55, ore: [0xd8dde6, 0xffffff, 0x8f97a6] },
    desc: 'Shines even by candle.' },
  echo_crystal: { name: 'Echo Crystal', cat: 'mineral', value: 450, q: true, icon: { k: 'crystal', c: [0x9fd6ff, 0xeaf7ff, 0x4d86c9] },
    desc: 'Loud blows shatter it. Use the chisel.' },
  gravium: { name: 'Gravium', cat: 'mineral', value: 400, q: true, icon: { k: 'crystal', c: [0xc9a6ff, 0xf3e8ff, 0x7a4fc9], float: true },
    desc: 'Falls up. Grab it quick.' },
  bioxide: { name: 'Bioxide', cat: 'mineral', value: 700, q: true, glow: 0x7fe7ff, icon: { k: 'crystal', c: [0x6fe6ff, 0xe6fdff, 0x2c8fb8], zap: true },
    desc: 'Zaps bare paws. Hit it hard, it blows.' },
  gold_ore: { name: 'Gold Ore', cat: 'mineral', value: 560, q: true, metal: 'gold', icon: { k: 'ore', rock: 0x4a3c34, ore: [0xf2c23a, 0xfff0a0, 0xb07a14] },
    desc: 'Why half the town has a bad back.' },
  magmaite: { name: 'Magmaite', cat: 'mineral', value: 1200, q: true, glow: 0xff7a2a, icon: { k: 'crystal', c: [0xff6a1a, 0xffd27a, 0xa82a08], glow: true },
    desc: 'Still molten. Lights coal. Mitts on.' },
  obsidian_shard: { name: 'Obsidian Shard', cat: 'mineral', value: 160, q: true, icon: { k: 'shard', c: [0x2a2238, 0x6b5a8a, 0x0e0a14] },
    desc: 'Sharper than anything you\'ll forge.' },
  frostite: { name: 'Frostite', cat: 'mineral', value: 2600, q: true, glow: 0xaef4ff, icon: { k: 'crystal', c: [0xbff6ff, 0xffffff, 0x5ab8d9] },
    desc: 'Freezes water. Numbs bare paws.' },
  mithril_ore: { name: 'Mithril Ore', cat: 'mineral', value: 2300, q: true, metal: 'mithril', icon: { k: 'ore', rock: 0x3c4352, ore: [0x9fe0e6, 0xeaffff, 0x4f9aa6] },
    desc: 'Light as a feather, tough as a grudge.' },
  moonsilver_ore: { name: 'Moonsilver Ore', cat: 'mineral', value: 3000, q: true, metal: 'moonsilver', icon: { k: 'ore', rock: 0x2f3044, ore: [0xe4e8ff, 0xffffff, 0x9aa2d9] },
    desc: 'Tarnishes in air. Dig it out fast.' },
  voidstone: { name: 'Voidstone', cat: 'mineral', value: 13000, q: true, icon: { k: 'crystal', c: [0x2a1240, 0x7a3fd0, 0x0a0410], dark: true },
    desc: 'Eats lamplight. The x-ray can\'t see it.' },
  adamant_ore: { name: 'Adamant Ore', cat: 'mineral', value: 8500, q: true, metal: 'adamant', icon: { k: 'ore', rock: 0x2b2a2e, ore: [0x4fd9a0, 0xc8ffe6, 0x1f7a58] },
    desc: 'Only the best pick bites it.' },
  starmetal_ore: { name: 'Starmetal Ore', cat: 'mineral', value: 11500, q: true, metal: 'starmetal', glow: 0xffe7b0, icon: { k: 'ore', rock: 0x1d1b2a, ore: [0xffe08a, 0xffffff, 0xc9862a], star: true },
    desc: 'Fell from the sky. Tugs at loose nails.' },
  sunstone: { name: 'Sunstone', cat: 'mineral', value: 18000, q: true, glow: 0xffd34a, icon: { k: 'gem', c: [0xffcf3a, 0xfffbd0, 0xd9781a], cut: 'round', glow: true },
    desc: 'Too hot to hold bare-pawed.' },

  // ───────────── Gems ─────────────
  quartz: { name: 'Quartz', cat: 'gem', value: 35, q: true, icon: { k: 'crystal', c: [0xf2f2f8, 0xffffff, 0xb4b4c8] },
    desc: 'Common. Still pretty.' },
  amber: { name: 'Amber', cat: 'gem', value: 150, q: true, icon: { k: 'gem', c: [0xf2a32c, 0xffe08a, 0xa85a10], cut: 'blob' },
    desc: 'Old sap. Check for bugs.' },
  amber_bug: { name: 'Amber with Beetle', cat: 'gem', value: 640, q: true, icon: { k: 'gem', c: [0xf2a32c, 0xffe08a, 0xa85a10], cut: 'blob', bug: true },
    desc: 'Beetle inside. Collectors go silly for it.' },
  amethyst: { name: 'Amethyst', cat: 'gem', value: 320, q: true, icon: { k: 'crystal', c: [0xa05ad9, 0xe8c8ff, 0x5a2a8a] },
    desc: 'Grows inside geodes.' },
  ruby: { name: 'Ruby', cat: 'gem', value: 1700, q: true, icon: { k: 'gem', c: [0xe02a3a, 0xff9aa2, 0x8a0a18], cut: 'oval' },
    desc: '' },
  emerald: { name: 'Emerald', cat: 'gem', value: 2600, q: true, icon: { k: 'gem', c: [0x2ad96a, 0xb4ffcc, 0x0a7a3a], cut: 'square' },
    desc: 'Green like grass, supposedly.' },
  sapphire: { name: 'Sapphire', cat: 'gem', value: 3300, q: true, icon: { k: 'gem', c: [0x2a5ae0, 0xa8c4ff, 0x0a1f8a], cut: 'oval' },
    desc: '' },
  diamond: { name: 'Diamond', cat: 'gem', value: 9500, q: true, icon: { k: 'gem', c: [0xd8f6ff, 0xffffff, 0x8ad0e6], cut: 'brilliant' },
    desc: 'Won\'t chip. Its rock will.' },

  // ───────────── Ingots ─────────────
  copper_ingot: { name: 'Copper Ingot', cat: 'ingot', value: 40, q: true, metal: 'copper', icon: { k: 'ingot', c: [0xd9773f, 0xf6b27a, 0x8a3e1a] }, desc: 'Bends before it breaks.' },
  tin_ingot: { name: 'Tin Ingot', cat: 'ingot', value: 50, q: true, metal: 'tin', icon: { k: 'ingot', c: [0xbfc3c4, 0xf0f2f2, 0x6f7576] }, desc: 'Too soft for blades. Mix it.' },
  bronze_ingot: { name: 'Bronze Ingot', cat: 'ingot', value: 130, q: true, metal: 'bronze', icon: { k: 'ingot', c: [0xc98a3a, 0xf0c47a, 0x7a4a14] }, desc: 'Copper, stiffened with tin.' },
  iron_ingot: { name: 'Iron Ingot', cat: 'ingot', value: 100, q: true, metal: 'iron', icon: { k: 'ingot', c: [0x8a8f96, 0xc6cbd2, 0x4a4e54] }, desc: 'Honest grey iron.' },
  steel_ingot: { name: 'Steel Ingot', cat: 'ingot', value: 240, q: true, metal: 'steel', icon: { k: 'ingot', c: [0xa7b4c2, 0xe6eef6, 0x56606c] }, desc: 'Iron that ate its coal.' },
  silver_ingot: { name: 'Silver Ingot', cat: 'ingot', value: 320, q: true, metal: 'silver', icon: { k: 'ingot', c: [0xd8dde6, 0xffffff, 0x8a92a0] }, desc: '' },
  gold_ingot: { name: 'Gold Ingot', cat: 'ingot', value: 1500, q: true, metal: 'gold', icon: { k: 'ingot', c: [0xf2c23a, 0xfff0a0, 0xa8700a] }, desc: 'Soft, heavy. Folk stare.' },
  mithril_ingot: { name: 'Mithril Ingot', cat: 'ingot', value: 6000, q: true, metal: 'mithril', icon: { k: 'ingot', c: [0x9fe0e6, 0xf0ffff, 0x4a8f9a] }, desc: 'Weighs almost nothing.' },
  moonsilver_ingot: { name: 'Moonsilver Ingot', cat: 'ingot', value: 7800, q: true, metal: 'moonsilver', icon: { k: 'ingot', c: [0xe4e8ff, 0xffffff, 0x8a92d0] }, desc: 'Glows a bit. Like a moon, they say.' },
  adamant_ingot: { name: 'Adamant Ingot', cat: 'ingot', value: 22000, q: true, metal: 'adamant', icon: { k: 'ingot', c: [0x4fd9a0, 0xd0ffe8, 0x1a6a4a] }, desc: 'Good luck denting it.' },
  starmetal_ingot: { name: 'Starmetal Ingot', cat: 'ingot', value: 30000, q: true, metal: 'starmetal', icon: { k: 'ingot', c: [0xffe08a, 0xffffff, 0xb0701a], star: true }, desc: 'Still warm. Has been for ages.' },

  // ───────────── Plants ─────────────
  cave_carrot: { name: 'Cave Carrot', cat: 'plant', value: 8, price: 14, icon: { k: 'plant', t: 'carrot' }, food: 6,
    desc: 'Pale and sweet. Grows where roots poke in.' },
  glowcap: { name: 'Glowcap', cat: 'plant', value: 12, icon: { k: 'plant', t: 'glowcap' }, food: 5,
    desc: 'Makes your whiskers glow a bit.' },
  blindfern: { name: 'Blindfern', cat: 'plant', value: 10, icon: { k: 'plant', t: 'fern' }, food: 4,
    desc: 'Never seen the sun. Crisp raw.' },
  whisperweed: { name: 'Whisperweed', cat: 'plant', value: 40, icon: { k: 'plant', t: 'whisper' },
    desc: 'Leans toward ore. Mutters near it.' },
  rubber_sap: { name: 'Rubber Sap', cat: 'plant', value: 22, icon: { k: 'plant', t: 'sap' },
    desc: 'Stretchy. Gloves get made of it.' },
  pepperroot: { name: 'Pepperroot', cat: 'plant', value: 18, icon: { k: 'plant', t: 'pepper' }, food: 3,
    desc: 'Hot. Warms you right through.' },
  sparkmoss: { name: 'Sparkmoss', cat: 'plant', value: 35, icon: { k: 'plant', t: 'sparkmoss' },
    desc: 'Grows by bioxide. Fizzes on the tongue.' },
  bubblebulb: { name: 'Bubblebulb', cat: 'plant', value: 40, icon: { k: 'plant', t: 'bubble' },
    desc: 'Full of floaty gas. You\'ll feel light.' },
  crystal_lily: { name: 'Crystal Lily', cat: 'plant', value: 90, icon: { k: 'plant', t: 'lily' },
    desc: 'Rings if you flick it.' },
  gloomshroom: { name: 'Gloomshroom', cat: 'plant', value: 45, icon: { k: 'plant', t: 'gloom' },
    desc: 'Sleepy spores. Nice in a stew.' },
  ashfern: { name: 'Ashfern', cat: 'plant', value: 60, icon: { k: 'plant', t: 'ashfern' },
    desc: 'Likes it hot.' },
  emberbloom: { name: 'Emberbloom', cat: 'plant', value: 85, icon: { k: 'plant', t: 'ember' },
    desc: 'On fire. Use mitts.' },
  truffle: { name: 'Truffle', cat: 'plant', value: 500, icon: { k: 'plant', t: 'truffle' },
    desc: 'Follow your nose.' },
  frostbloom: { name: 'Frostbloom', cat: 'plant', value: 150, icon: { k: 'plant', t: 'frost' },
    desc: 'Keeps a pie cold.' },
  core_lotus: { name: 'Core Lotus', cat: 'plant', value: 2200, icon: { k: 'plant', t: 'lotus' },
    desc: 'Only blooms near the core.' },

  // ───────────── Critters (caught alive) & drops ─────────────
  worm: { name: 'Earthworm', cat: 'critter', value: 6, price: 10, stack: 16, icon: { k: 'critter', t: 'worm' },
    desc: 'A mole classic.' },
  glow_beetle: { name: 'Glow Beetle', cat: 'critter', value: 35, icon: { k: 'critter', t: 'beetle' },
    desc: 'Lamp on its bum. Lovely in a jar.' },
  blind_fish: { name: 'Blind Cave Fish', cat: 'critter', value: 45, icon: { k: 'critter', t: 'fish' },
    desc: 'No eyes. Fry it.' },
  frost_shrimp: { name: 'Frost Shrimp', cat: 'critter', value: 260, icon: { k: 'critter', t: 'shrimp' },
    desc: 'Crunchy and cold.' },
  dust_fluff: { name: 'Dust Fluff', cat: 'drop', value: 15, icon: { k: 'drop', t: 'fluff' }, desc: 'Soft. Off a dust bunny.' },
  bat_guano: { name: 'Bat Guano', cat: 'drop', value: 12, icon: { k: 'drop', t: 'guano' }, desc: 'Gardeners swear by it. You\'d rather not.' },
  crab_shell: { name: 'Crab Shell', cat: 'drop', value: 40, icon: { k: 'drop', t: 'shell' }, desc: 'A rock crab left in a hurry.' },
  slug_slime: { name: 'Slug Slime', cat: 'drop', value: 30, icon: { k: 'drop', t: 'slime' }, desc: 'Slippery. Full of metal flecks.' },
  spider_silk: { name: 'Spider Silk', cat: 'drop', value: 80, icon: { k: 'drop', t: 'silk' }, desc: '' },
  spark_dust: { name: 'Spark Dust', cat: 'drop', value: 60, icon: { k: 'drop', t: 'spark' }, desc: 'Stings a bit. From spark mites.' },
  ember_scale: { name: 'Ember Scale', cat: 'drop', value: 220, icon: { k: 'drop', t: 'scale' }, desc: 'Still warm. Off a lava newt.' },
  wisp_essence: { name: 'Wisp Essence', cat: 'drop', value: 900, icon: { k: 'drop', t: 'wisp' }, desc: 'Eats light. Keep the lid on.' },
  // creature loot (src/deep/enemies/loot.js; icons: enemies/lootArt.js). tags: what other parts may use them for
  // the wardens' hearts (data/way.js): each goes into the next pick
  clay_heart: { name: 'Clay Warden\'s Heart', cat: 'drop', value: 0, icon: { k: 'loot', t: 'gem', c: 0xd4561e }, lootCol: 0xf28e2e, tags: ['forge'], desc: 'Warm, and it ticks. Old Star says it goes in an iron pick.' },
  grotto_heart: { name: 'Grotto Warden\'s Heart', cat: 'drop', value: 0, icon: { k: 'loot', t: 'gem', c: 0x5ea6b8 }, lootCol: 0xa6dcd8, tags: ['forge'], desc: 'Hums when you hold it. It goes in a steel pick.' },
  kobold_trinket: { name: 'Kobold Trinket', cat: 'drop', value: 90, icon: { k: 'loot', t: 'trinket' }, tags: ['trinket'], desc: 'Bone luck charm. Traders love these.' },
  beast_hide: { name: 'Thick Hide', cat: 'drop', value: 70, icon: { k: 'loot', t: 'hide', c: 0x8a7a52 }, tags: ['hide', 'forge'], lootCol: 0xb89a6a, desc: 'Warty. Makes a good grip.' },
  troll_tusk: { name: 'Troll Tusk', cat: 'drop', value: 380, icon: { k: 'loot', t: 'tusk' }, tags: ['trophy', 'forge'], lootCol: 0xf0e4c8, desc: 'Heavy. Smiths and carvers both want it.' },
  spider_fang: { name: 'Spider Fang', cat: 'drop', value: 140, icon: { k: 'loot', t: 'fang', c: 0x8ae05a }, tags: ['venom', 'forge'], lootCol: 0xa0e070, desc: 'Still venomous. Set it in a blade.' },
  slime_gel: { name: 'Slime Gel', cat: 'drop', value: 28, icon: { k: 'loot', t: 'gel', c: 0x6ad07a }, tags: ['jelly', 'cook'], lootCol: 0x7ae08a, desc: 'Sets a broth. Lifts rust.' },
  wraith_ash: { name: 'Wraith Ash', cat: 'drop', value: 720, icon: { k: 'loot', t: 'ash', c: 0x8affe0 }, tags: ['magic', 'forge'], lootCol: 0x9affe0, desc: 'Glows. Still a bit angry.' },
  drake_scale: { name: 'Drake Scale', cat: 'drop', value: 650, icon: { k: 'loot', t: 'scale', c: 0xc0562a }, tags: ['heat', 'forge'], lootCol: 0xff8a4a, desc: 'Shrugs off fire. Smiths quench with it.' },
  raptor_claw: { name: 'Raptor Claw', cat: 'drop', value: 160, icon: { k: 'loot', t: 'claw' }, tags: ['trophy', 'forge'], lootCol: 0xf0e4cc, desc: 'Sickle-sharp. Mind your fingers.' },
  tyrant_tooth: { name: 'Tyrant Tooth', cat: 'drop', value: 1800, icon: { k: 'loot', t: 'tooth' }, tags: ['trophy', 'forge'], lootCol: 0xfff4e0, desc: 'Long as your arm. And you walked away.' },
  armor_plate: { name: 'Shellback Plate', cat: 'drop', value: 300, icon: { k: 'loot', t: 'plate', c: 0x8e7048 }, tags: ['armor', 'forge'], lootCol: 0xd4b47c, desc: 'Light, hard bone. Good on a shield.' },
  ptero_feather: { name: 'Pterosaur Feather', cat: 'drop', value: 110, icon: { k: 'loot', t: 'feather', c: 0xd8703a }, tags: ['feather'], lootCol: 0xe09060, desc: 'Hatters in town fight over these.' },
  dino_meat: { name: 'Dino Steak', cat: 'ingredient', value: 45, icon: { k: 'loot', t: 'meat' }, tags: ['meat', 'cook'], lootCol: 0xc8463a, desc: 'Thick and marbled. Sear it hot.' },
  drake_egg: { name: 'Drake Egg', cat: 'ingredient', value: 1500, icon: { k: 'loot', t: 'egg', c: 0x8a2e1a }, tags: ['egg', 'cook', 'heat'], lootCol: 0xe0703a, desc: 'Hot and heavy. Think about it.' },

  // ───────────── Basic ingredients (shop) ─────────────
  flour: { name: 'Root Flour', cat: 'ingredient', value: 4, price: 8, icon: { k: 'ingr', t: 'flour' }, desc: 'Ground roots.' },
  butter: { name: 'Butter', cat: 'ingredient', value: 6, price: 12, icon: { k: 'ingr', t: 'butter' }, desc: 'From the surface. Allegedly.' },
  mushroom: { name: 'Button Mushroom', cat: 'ingredient', value: 4, price: 7, icon: { k: 'ingr', t: 'mushroom' }, desc: '' },
  rootbeer: { name: 'Root Beer', cat: 'ingredient', value: 6, price: 11, icon: { k: 'ingr', t: 'rootbeer' }, desc: 'Brewed from actual roots.' },
  honey: { name: 'Deep Honey', cat: 'ingredient', value: 12, price: 22, icon: { k: 'ingr', t: 'honey' }, desc: 'From blind cave bees.' },
  egg: { name: 'Fresh Egg', cat: 'ingredient', value: 10, price: 16, icon: { k: 'egg' }, desc: 'Still warm.' },
  grub_bar: { name: 'Grub Bar', cat: 'food', value: 8, price: 18, energy: 15, icon: { k: 'food', t: 'bar' }, desc: 'Pressed grubs. Tastes like effort.' },
  tea_flask: { name: 'Mushroom Tea', cat: 'food', value: 12, price: 30, energy: 25, icon: { k: 'food', t: 'flask' }, desc: '' },
  hearty_pie: { name: 'Hearty Pie', cat: 'food', value: 40, price: 95, energy: 60, icon: { k: 'food', t: 'pie' }, desc: 'Hazel\'s. Worth it.' },

  // ───────────── Tools ─────────────
  pick_first: { name: 'Your First Pickaxe', cat: 'tool', slot: 'pick', tier: 1, power: 1.1, rate: 0.34, value: 20, icon: { k: 'tool', t: 'pick', c: 0xc87840 }, desc: 'You made this. It shows.' },
  pick_rusty: { name: 'Rusty Pickaxe', cat: 'tool', slot: 'pick', tier: 1, power: 1.0, rate: 0.36, value: 5, icon: { k: 'tool', t: 'pick', c: 0x8a6a52 },
    desc: 'Your old pick. Dirt and soft stone.' },
  pick_copper: { name: 'Bronze Pickaxe', cat: 'tool', slot: 'pick', tier: 2, power: 1.5, rate: 0.33, price: 260, value: 80, icon: { k: 'tool', t: 'pick', c: 0xc98a3a },
    desc: 'Bites iron and lumite.' },
  pick_iron: { name: 'Iron Pickaxe', cat: 'tool', slot: 'pick', tier: 3, power: 2.2, rate: 0.31, price: 1800, value: 500, icon: { k: 'tool', t: 'pick', c: 0x9aa0a8 },
    desc: 'Granite, crystal rock, silver.' },
  pick_steel: { name: 'Steel Pickaxe', cat: 'tool', slot: 'pick', tier: 4, power: 3.2, rate: 0.29, price: 9500, value: 2500, icon: { k: 'tool', t: 'pick', c: 0xc6d2de },
    desc: 'Basalt, gold, rubies, the cold rock.' },
  pick_mithril: { name: 'Mithril Pickaxe', cat: 'tool', slot: 'pick', tier: 5, power: 4.6, rate: 0.26, price: 52000, value: 15000, icon: { k: 'tool', t: 'pick', c: 0x9fe0e6 },
    desc: 'Light. Digs the Core\'s rock.' },
  pick_adamant: { name: 'Adamant Pickaxe', cat: 'tool', slot: 'pick', tier: 6, power: 6.5, rate: 0.24, price: 165000, value: 40000, icon: { k: 'tool', t: 'pick', c: 0x4fd9a0 },
    desc: 'Bites adamant. Bites anything.' },
  pick_starmetal: { name: 'Starmetal Pickaxe', cat: 'tool', slot: 'pick', tier: 7, power: 9.2, rate: 0.21, price: 420000, needs: { starmetal_ingot: 2 }, value: 110000, icon: { k: 'tool', t: 'pick', c: 0xffd27a },
    desc: 'Core rock gives like wet clay.' },
  chisel_basic: { name: 'Chisel', cat: 'tool', slot: 'chisel', power: 0.55, rate: 0.2, price: 120, value: 30, icon: { k: 'tool', t: 'chisel', c: 0xa0a6ae },
    desc: 'Slow and quiet. Frees ore clean.' },
  chisel_fine: { name: 'Fine Chisel', cat: 'tool', slot: 'chisel', power: 1.1, rate: 0.16, price: 7000, value: 1500, icon: { k: 'tool', t: 'chisel', c: 0x9fe0e6 },
    desc: 'Twice the bite. Still quiet.' },
  brush_basic: { name: 'Soft Brush', cat: 'tool', slot: 'brush', power: 1, rate: 0.12, price: 60, value: 15, icon: { k: 'tool', t: 'brush', c: 0xc9a06a },
    desc: 'Sweeps grit off finds. Gentle.' },
  brush_badger: { name: 'Badger Brush', cat: 'tool', slot: 'brush', power: 2, rate: 0.09, price: 3500, value: 800, icon: { k: 'tool', t: 'brush', c: 0x6a6a6a },
    desc: 'Vex swears no badgers were harmed.' },
  drill_steam: { name: 'Steam Drill', cat: 'tool', slot: 'drill', power: 3.4, heatRate: 0.34, price: 14000, value: 3000, icon: { k: 'tool', t: 'drill', c: 0xb08a3a },
    desc: 'Fast. Overheats. Shakes the ore too.' },
  drill_lumite: { name: 'Lumite Drill', cat: 'tool', slot: 'drill', power: 6, heatRate: 0.2, price: 90000, value: 20000, icon: { k: 'tool', t: 'drill', c: 0x7bf08a },
    desc: 'Runs cool. Scary fast.' },
  xray_lamp: { name: 'X-Ray Lamp', cat: 'tool', slot: 'xray', radius: 5, price: 6500, value: 1500, icon: { k: 'tool', t: 'xray', c: 0x7fe7ff },
    desc: 'Shows what\'s in the rock.' },
  xray_prism: { name: 'Prism Lamp', cat: 'tool', slot: 'xray', radius: 8.5, price: 60000, value: 14000, icon: { k: 'tool', t: 'xray', c: 0xe0a8ff },
    desc: 'Wider. Deeper.' },
  support_beam: { name: 'Support Beam', cat: 'consumable', price: 25, value: 5, icon: { k: 'tool', t: 'beam' },
    desc: 'Prop it under a roof you like.' },
  glow_stake: { name: 'Glow Stake', cat: 'consumable', price: 15, value: 3, icon: { k: 'tool', t: 'stake' },
    desc: 'Lights a spot for good.' },
  // explosives: the dynamite slot throws the one with the biggest blast (src/deep/Explosives.js).
  // blast = crater radius (m), power = how hard it hits (ore chips, creatures), fuse = seconds,
  // toss = throw speed (m/s). Icons: src/deep/explosives/icon.js (drawn for spec t 'dynamite').
  dynamite: { name: 'Dynamite', cat: 'consumable', blast: 0.9, power: 1, fuse: 2.2, toss: 7.5, price: 45, value: 10, icon: { k: 'tool', t: 'dynamite', n: 1 },
    desc: 'Clears rock. Throw it, then back off.' },
  dynamite_bundle: { name: 'Dynamite Bundle', cat: 'consumable', blast: 1.5, power: 1.25, fuse: 2.6, toss: 6.3, price: 180, value: 40, icon: { k: 'tool', t: 'dynamite', n: 3 },
    desc: 'Three sticks, one fuse. Don\'t hold it.' },
  blasting_charge: { name: 'Blasting Charge', cat: 'consumable', blast: 2.2, power: 1.6, fuse: 3, toss: 4.4, price: 650, value: 150, icon: { k: 'tool', t: 'dynamite', n: 0, charge: true },
    desc: 'Beeps faster and faster. Then it doesn\'t.' },

  // ───────────── Equipment ─────────────
  helmet_basic: { name: 'Miner\'s Cap', cat: 'equip', slot: 'helmet', light: 5.5, value: 5, icon: { k: 'equip', t: 'helmet', c: 0xc9a23a }, desc: 'A candle on a hat.' },
  helmet_brass: { name: 'Brass Lamp Helmet', cat: 'equip', slot: 'helmet', light: 7.5, price: 900, value: 200, icon: { k: 'equip', t: 'helmet', c: 0xd9a84a }, desc: 'Proper oil lamp. Steadier.' },
  helmet_lumite: { name: 'Lumite Helmet', cat: 'equip', slot: 'helmet', light: 10, price: 12000, value: 3000, icon: { k: 'equip', t: 'helmet', c: 0x7bf08a }, desc: 'Lumite set in steel.' },
  helmet_sun: { name: 'Sunstone Crown', cat: 'equip', slot: 'helmet', light: 13.5, price: 120000, value: 30000, icon: { k: 'equip', t: 'helmet', c: 0xffd34a }, desc: 'Like wearing the sun.' },
  rubber_gloves: { name: 'Rubber Gloves', cat: 'equip', slot: 'gloves', protect: ['zap'], price: 900, needs: { rubber_sap: 5 }, value: 300, icon: { k: 'equip', t: 'gloves', c: 0xe0c03a },
    desc: 'Bioxide and sparkmoss can\'t zap you.' },
  ember_mitts: { name: 'Ember Mitts', cat: 'equip', slot: 'gloves', protect: ['zap', 'heat'], price: 16000, needs: { ember_scale: 4 }, value: 4000, icon: { k: 'equip', t: 'gloves', c: 0xd9582a },
    desc: 'Hold magmaite and sunstone. No burns.' },
  frost_gauntlets: { name: 'Frostguard Gauntlets', cat: 'equip', slot: 'gloves', protect: ['zap', 'heat', 'cold'], price: 70000, needs: { frost_shrimp: 3, spider_silk: 4 }, value: 18000, icon: { k: 'equip', t: 'gloves', c: 0x7ad0f0 },
    desc: 'Zap-proof. Fine in fire or frost.' },
  heat_suit: { name: 'Heat Suit', cat: 'equip', slot: 'suit', protect: ['heat'], price: 15000, value: 4000, icon: { k: 'equip', t: 'suit', c: 0xb8b0a0 }, desc: 'Volcanic heat stops wearing you down.' },
  thermal_suit: { name: 'Thermal Suit', cat: 'equip', slot: 'suit', protect: ['heat', 'cold'], price: 80000, value: 20000, icon: { k: 'equip', t: 'suit', c: 0x6a8ad9 }, desc: 'Fire or frost, either way.' },
  grip_boots: { name: 'Grip Boots', cat: 'equip', slot: 'boots', grip: 1, climb: 1.4, price: 1500, value: 400, icon: { k: 'equip', t: 'boots', c: 0x6a4a2a }, desc: 'Studded. Climbs fast, won\'t slip.' },
  spring_boots: { name: 'Spring Boots', cat: 'equip', slot: 'boots', grip: 1, climb: 1.6, jump: 1.35, price: 30000, value: 8000, icon: { k: 'equip', t: 'boots', c: 0x3a8ad9 }, desc: 'Gravium soles. Boing.' },
  // backpacks: slots = pockets in the inventory grid (rows of 6, core/inventory.js); cap = the old
  // "finds per trip" (bagCapacity(), kept until the mine counts pockets instead)
  bag_small: { name: 'Burlap Sack', cat: 'equip', slot: 'bag', slots: 9, cap: 14, carry: 15, value: 2, icon: { k: 'equip', t: 'bag', c: 0xb8996a }, desc: 'Rope strap. About 15 kg before your knees go.' },
  bag_medium: { name: 'Leather Satchel', cat: 'equip', slot: 'bag', slots: 18, cap: 22, carry: 24, price: 700, value: 150, icon: { k: 'equip', t: 'bag', c: 0x8a5a2a }, desc: 'Padded straps. About 24 kg.' },
  bag_large: { name: 'Miner\'s Pack', cat: 'equip', slot: 'bag', slots: 27, cap: 34, carry: 36, price: 5000, value: 1200, icon: { k: 'equip', t: 'bag', c: 0x5a6a3a }, desc: 'Sits right on the shoulders. About 36 kg.' },
  bag_huge: { name: 'Expedition Pack', cat: 'equip', slot: 'bag', slots: 36, cap: 50, carry: 52, price: 30000, value: 7000, icon: { k: 'equip', t: 'bag', c: 0x3a5a8a }, desc: 'Hip belt, for long digs. About 52 kg.' },
  bag_bottomless: { name: 'Bottomless Bag', cat: 'equip', slot: 'bag', slots: 45, cap: 90, carry: 80, price: 150000, value: 35000, icon: { k: 'equip', t: 'bag', c: 0x6a2a8a }, desc: 'About 80 kg. Don\'t look inside.' },

  // ───────────── Key items ─────────────
  exit_ticket: { name: 'Surface Ticket', cat: 'key', value: 0, price: 1000000, icon: { k: 'ticket' },
    desc: 'ONE WAY · DEEP TOWN → THE SURFACE. Admit one mole.' },
};

// Floors & wallpapers & furniture are defined in furniture.js and merged in.
import { FURNITURE, FLOORS, WALLS } from './furniture.js';
import { BLUEPRINTS } from './weapons.js';
import { DISHES, INGREDIENTS } from './recipes.js';
import { RELIC_ITEMS } from '../deep/ruins/relics.js'; // ruins part: relics found in the ruins' treasure rooms
import { QUEST_ITEMS } from './questItems.js'; // quests part: things carried for somebody (key items)
import { BUILD_ITEMS } from './buildItems.js'; // building part: blocks, crafting stuff, axes, spades, shears

for (const [id, f] of Object.entries(FURNITURE)) ITEMS[id] = { cat: 'furniture', ...f };
for (const [id, f] of Object.entries(FLOORS)) ITEMS[id] = { cat: 'floor', ...f };
for (const [id, f] of Object.entries(WALLS)) ITEMS[id] = { cat: 'wallpaper', ...f };
for (const [id, b] of Object.entries(BLUEPRINTS)) ITEMS[id] = { cat: 'blueprint', ...b };
for (const [id, d] of Object.entries(DISHES)) ITEMS[id] = { cat: 'food', ...d };
// cooking part: the new cave ingredients; foraged plants carry a quality (how well they were pulled)
for (const [id, d] of Object.entries(INGREDIENTS)) ITEMS[id] = { ...d };
for (const [id, d] of Object.entries(RELIC_ITEMS)) ITEMS[id] = { ...d };
for (const [id, d] of Object.entries(QUEST_ITEMS)) ITEMS[id] = { ...d };
for (const [id, d] of Object.entries(BUILD_ITEMS)) ITEMS[id] = { ...d };
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
 * The pick tier hard rock (MAT hp > 3.5) needs, by zone (wave 21, data/way.js): the Crystal Grotto's
 * granite wants iron, the Magma Deep and the Frost Vault steel, the Core mithril.
 * pickForTier(t) → the cheapest pick of that tier.
 */
export const HARD_ROCK_TIER = [0, 0, 0, 3, 4, 4, 5];
export function pickForTier(t) {
  return Object.values(ITEMS).filter((it) => it.slot === 'pick' && (it.tier || 1) >= t).sort((a, b) => (a.tier || 1) - (b.tier || 1))[0] || null;
}

export const CAT_LABEL = {
  mineral: 'Mineral', gem: 'Gem', ingot: 'Ingot', plant: 'Plant', critter: 'Critter', drop: 'Creature Drop',
  ingredient: 'Ingredient', food: 'Food', tool: 'Tool', equip: 'Equipment', furniture: 'Furniture',
  floor: 'Flooring', wallpaper: 'Wall Style', blueprint: 'Blueprint', consumable: 'Supply', key: 'Key Item', relic: 'Relic', block: 'Building Block', craft: 'Crafting Stuff',
};

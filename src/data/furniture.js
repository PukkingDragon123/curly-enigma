// Home furniture, floors and wall styles.
// size: footprint [w, d] in tiles. kind drives behavior in the home scene:
//   bed | forge | stove | coop | planter | desk | display | light | seat | table | rug | decor | wall
// light: color of the light the item emits (hex) | undefined
// onWall: hangs on the back wall (placed on wall tiles)

export const FURNITURE = {
  // functional
  bed_straw: { name: 'Straw Bed', kind: 'bed', size: [1, 2], price: 0, value: 10, rest: 0, icon: { k: 'furn', t: 'bed', c: 0xd9b45a }, desc: 'Lumpy, but it\'s yours. Sleep to start a new day.' },
  bed_cozy: { name: 'Cozy Quilt Bed', kind: 'bed', size: [1, 2], price: 1400, value: 300, rest: 1, icon: { k: 'furn', t: 'bed', c: 0xd96a6a }, desc: 'A patchwork quilt. Wake up Sturdy.' },
  bed_royal: { name: 'Four-Poster Bed', kind: 'bed', size: [2, 2], price: 26000, value: 6000, rest: 2, icon: { k: 'furn', t: 'bed', c: 0x6a5ad9 }, desc: 'Velvet curtains. Wake up Sturdy and Lucky.' },
  forge: { name: 'Home Forge', kind: 'forge', size: [2, 2], price: 0, value: 0, light: 0xff7a2a, icon: { k: 'furn', t: 'forge' }, desc: 'Coal hearth, anvil and quench barrel. Smelt ore and forge weapons here.' },
  stove: { name: 'Iron Stove', kind: 'stove', size: [1, 1], price: 0, value: 0, light: 0xff9a4a, icon: { k: 'furn', t: 'stove' }, desc: 'Cook strange plants into stranger meals.' },
  coop: { name: 'Chicken Coop', kind: 'coop', size: [1, 1], price: 0, value: 0, icon: { k: 'furn', t: 'coop' }, desc: 'Nugget\'s nest. Fresh eggs most mornings.' },
  planter: { name: 'Mushroom Planter', kind: 'planter', size: [1, 1], price: 800, value: 200, icon: { k: 'furn', t: 'planter' }, desc: 'Plant something you found below; it grows more by morning.' },
  index_desk: { name: 'Writing Desk', kind: 'desk', size: [1, 1], price: 600, value: 150, icon: { k: 'furn', t: 'desk' }, desc: 'Where you write up your Index Book.' },
  weapon_rack: { name: 'Weapon Rack', kind: 'display', size: [2, 1], price: 1500, value: 400, icon: { k: 'furn', t: 'rack' }, desc: 'Shows off your three finest weapons.' },
  gem_case: { name: 'Gem Display', kind: 'display', size: [1, 1], price: 4000, value: 1000, light: 0xe0a8ff, icon: { k: 'furn', t: 'gemcase' }, desc: 'Your best gem under glass.' },

  // lights
  lamp_glowcap: { name: 'Glowcap Lamp', kind: 'light', size: [1, 1], price: 150, value: 40, light: 0x7fd0ff, icon: { k: 'furn', t: 'glowlamp' }, desc: 'A mushroom that never stops glowing.' },
  lantern_post: { name: 'Lantern Post', kind: 'light', size: [1, 1], price: 350, value: 90, light: 0xffc070, icon: { k: 'furn', t: 'lantern' }, desc: 'Warm oil light on a post.' },
  beetle_jar: { name: 'Beetle Jar', kind: 'light', size: [1, 1], price: 120, needs: { glow_beetle: 1 }, value: 80, light: 0xc8ff7a, icon: { k: 'furn', t: 'jar' }, desc: 'A happy glow beetle in a roomy jar.' },
  crystal_lamp: { name: 'Crystal Lamp', kind: 'light', size: [1, 1], price: 9000, value: 2500, light: 0xe0a8ff, icon: { k: 'furn', t: 'crystallamp' }, desc: 'Amethyst light, cut to sparkle.' },
  fireplace: { name: 'Stone Fireplace', kind: 'light', size: [2, 1], price: 3500, value: 900, light: 0xff8a3a, onWall: true, icon: { k: 'furn', t: 'fireplace' }, desc: 'Crackling, cozy, very mole.' },

  // seats & tables
  stool: { name: 'Stump Stool', kind: 'seat', size: [1, 1], price: 60, value: 15, icon: { k: 'furn', t: 'stool' }, desc: 'A tree stump that fell down a hole.' },
  chair_wood: { name: 'Wooden Chair', kind: 'seat', size: [1, 1], price: 120, value: 30, icon: { k: 'furn', t: 'chair' }, desc: 'Four legs. Mostly level.' },
  armchair: { name: 'Mossy Armchair', kind: 'seat', size: [1, 1], price: 900, value: 220, icon: { k: 'furn', t: 'armchair' }, desc: 'Upholstered in living moss.' },
  sofa: { name: 'Root Sofa', kind: 'seat', size: [2, 1], price: 2400, value: 600, icon: { k: 'furn', t: 'sofa' }, desc: 'Grown, not built.' },
  table_small: { name: 'Round Table', kind: 'table', size: [1, 1], price: 200, value: 50, icon: { k: 'furn', t: 'table' }, desc: 'For tea and plotting.' },
  table_long: { name: 'Long Table', kind: 'table', size: [2, 1], price: 650, value: 160, icon: { k: 'furn', t: 'longtable' }, desc: 'Seats a whole mole family.' },

  // decor
  rug_round: { name: 'Round Rug', kind: 'rug', size: [1, 1], price: 180, value: 45, icon: { k: 'furn', t: 'rug', c: 0xc9583a }, desc: 'Woven from root fibers.' },
  rug_long: { name: 'Runner Rug', kind: 'rug', size: [2, 1], price: 320, value: 80, icon: { k: 'furn', t: 'rug', c: 0x3a7ac9 }, desc: 'A long woven runner.' },
  rug_fancy: { name: 'Fancy Carpet', kind: 'rug', size: [2, 2], price: 2500, value: 600, icon: { k: 'furn', t: 'rug', c: 0x8a3ac9 }, desc: 'Gold tassels and everything.' },
  plant_fern: { name: 'Potted Fern', kind: 'decor', size: [1, 1], price: 90, value: 20, icon: { k: 'furn', t: 'fern' }, desc: 'Somehow thriving without sun.' },
  plant_glowcap: { name: 'Potted Glowcaps', kind: 'light', size: [1, 1], price: 140, value: 35, light: 0x7fd0ff, icon: { k: 'furn', t: 'potglow' }, desc: 'A little blue garden.' },
  bookshelf: { name: 'Bookshelf', kind: 'decor', size: [1, 1], price: 700, value: 180, onWall: true, icon: { k: 'furn', t: 'bookshelf' }, desc: 'Mostly books about the surface.' },
  barrel: { name: 'Barrel', kind: 'decor', size: [1, 1], price: 80, value: 20, icon: { k: 'furn', t: 'barrel' }, desc: 'Smells faintly of root beer.' },
  crate: { name: 'Crate', kind: 'decor', size: [1, 1], price: 50, value: 10, icon: { k: 'furn', t: 'crate' }, desc: 'Stamped "FRAGILE — SURFACE GOODS".' },
  clock: { name: 'Grandfather Clock', kind: 'decor', size: [1, 1], price: 2600, value: 650, onWall: true, icon: { k: 'furn', t: 'clock' }, desc: 'Tick. Tock. Days pass down here too.' },
  painting_sun: { name: 'Painting: "The Sun"', kind: 'wall', size: [1, 1], price: 1200, value: 300, onWall: true, icon: { k: 'furn', t: 'painting', c: 0xffd34a }, desc: 'A yellow circle. Moles find it deeply moving.' },
  painting_beach: { name: 'Painting: "The Beach"', kind: 'wall', size: [2, 1], price: 5000, value: 1200, onWall: true, icon: { k: 'furn', t: 'painting', c: 0x3ac9d9 }, desc: 'Someday.' },
  fake_window: { name: 'Painted Window', kind: 'wall', size: [2, 1], price: 8000, value: 2000, onWall: true, light: 0xbfe6ff, icon: { k: 'furn', t: 'window' }, desc: 'A sky, painted so well it almost glows.' },
  banner: { name: 'Mole Banner', kind: 'wall', size: [1, 1], price: 400, value: 100, onWall: true, icon: { k: 'furn', t: 'banner' }, desc: 'The crossed-claws crest of Deep Town.' },
  music_box: { name: 'Music Box', kind: 'decor', size: [1, 1], price: 3000, value: 800, icon: { k: 'furn', t: 'musicbox' }, desc: 'Plays a tune nobody remembers learning.' },
  plushie: { name: 'Worm Plushie', kind: 'decor', size: [1, 1], price: 250, value: 60, icon: { k: 'furn', t: 'plushie' }, desc: 'Squishy. Nugget keeps pecking it.' },
  fish_tank: { name: 'Fish Tank', kind: 'decor', size: [2, 1], price: 6000, needs: { blind_fish: 2 }, value: 1500, light: 0x7ad0ff, icon: { k: 'furn', t: 'tank' }, desc: 'Two blind fish, very content.' },
  fountain: { name: 'Little Fountain', kind: 'decor', size: [2, 2], price: 15000, value: 4000, icon: { k: 'furn', t: 'fountain' }, desc: 'Trickles soothingly.' },
  trophy_pick: { name: 'Golden Pick Trophy', kind: 'decor', size: [1, 1], price: 50000, value: 12000, light: 0xffd34a, icon: { k: 'furn', t: 'trophy' }, desc: 'Awarded to yourself, by yourself.' },
  statue_mole: { name: 'Mole Statue', kind: 'decor', size: [2, 2], price: 120000, value: 30000, icon: { k: 'furn', t: 'statue' }, desc: 'You, in marble, heroically squinting.' },
};

export const FLOORS = {
  floor_dirt: { name: 'Packed Dirt', price: 0, value: 0, color: 0x6b4a32, icon: { k: 'floor', c: 0x6b4a32 }, desc: 'Classic.' },
  floor_plank: { name: 'Plank Floor', price: 400, value: 0, color: 0x9a6a3a, icon: { k: 'floor', c: 0x9a6a3a, pat: 'plank' }, desc: 'Warm boards.' },
  floor_stone: { name: 'Flagstones', price: 600, value: 0, color: 0x7a7470, icon: { k: 'floor', c: 0x7a7470, pat: 'stone' }, desc: 'Cool underfoot.' },
  floor_moss: { name: 'Moss Carpet', price: 900, value: 0, color: 0x4a7a3a, icon: { k: 'floor', c: 0x4a7a3a, pat: 'moss' }, desc: 'Soft and alive.' },
  floor_tile: { name: 'Clay Tiles', price: 2000, value: 0, color: 0xb8603a, icon: { k: 'floor', c: 0xb8603a, pat: 'tile' }, desc: 'Fired terracotta.' },
  floor_checker: { name: 'Checker Tiles', price: 3500, value: 0, color: 0xe6dcc8, icon: { k: 'floor', c: 0xe6dcc8, pat: 'checker' }, desc: 'Very fancy.' },
  floor_carpet: { name: 'Velvet Carpet', price: 5000, value: 0, color: 0x8a2a3a, icon: { k: 'floor', c: 0x8a2a3a, pat: 'carpet' }, desc: 'Deep red pile.' },
  floor_gold: { name: 'Gold Leaf Floor', price: 75000, value: 0, color: 0xe0b040, icon: { k: 'floor', c: 0xe0b040, pat: 'tile' }, desc: 'Absolutely unnecessary.' },
};

export const WALLS = {
  wall_dirt: { name: 'Dirt Walls', price: 0, value: 0, color: 0x5a3e2a, icon: { k: 'wall', c: 0x5a3e2a }, desc: 'Roots and all.' },
  wall_plank: { name: 'Plank Walls', price: 800, value: 0, color: 0x8a5a32, icon: { k: 'wall', c: 0x8a5a32, pat: 'plank' }, desc: 'Cozy cabin vibes.' },
  wall_stone: { name: 'Stone Walls', price: 1200, value: 0, color: 0x6a6460, icon: { k: 'wall', c: 0x6a6460, pat: 'stone' }, desc: 'Solid.' },
  wall_brick: { name: 'Red Brick', price: 1500, value: 0, color: 0x9a3a2a, icon: { k: 'wall', c: 0x9a3a2a, pat: 'brick' }, desc: 'Like a surface bakery.' },
  wall_red: { name: 'Red Barn Boards', price: 3000, value: 0, color: 0x8a2420, icon: { k: 'wall', c: 0x8a2420, pat: 'plank' }, desc: 'Painted a cheerful red.' },
  wall_paper: { name: 'Flower Wallpaper', price: 6000, value: 0, color: 0x5a7a6a, icon: { k: 'wall', c: 0x5a7a6a, pat: 'paper' }, desc: 'Flowers you\'ve only heard about.' },
};

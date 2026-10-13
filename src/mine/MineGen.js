// Procedural generation of a mine zone: layered materials, worm tunnels and caverns,
// ore veins, geodes, water and lava pockets, plants, creatures and the lift stations.
import { makeRng, makeNoise2D, clamp } from '../core/util.js';
import { B, BLOCKS, ORES, ORE_ID, ORE_SPAWN, isSolid, isGranular } from './blocks.js';
import { MineWorld, F } from './MineWorld.js';
import { ITEMS } from '../data/items.js';
import { settleFluids } from './Fluids.js';

const ZONE_GEN = {
  1: {
    W: 64, H: 92, tunnel: 0.045, cavern: 0.3, water: 3, lava: 0, pools: 4,
    material(x, y, t, n) {
      const a = n.a.fbm(x * 0.08, y * 0.08, 3), b = n.b.fbm(x * 0.12, y * 0.12, 2), c = n.c(x * 0.05, y * 0.16);
      if (t < 0.1) return b > 0.18 ? B.ROOTS : B.LOAM;
      if (a > 0.24) return B.CLAY;
      if (b > 0.3) return B.SAND;
      if (b < -0.34) return B.GRAVEL;
      if (c * 0.8 + t * 0.85 > 0.72) return a < -0.15 ? B.LIMESTONE : B.STONE;
      if (n.d(x * 0.22, y * 0.22) > 0.36 && t < 0.45) return B.ROOTS;
      return B.DIRT;
    },
  },
  2: {
    W: 64, H: 96, tunnel: 0.045, cavern: 0.29, water: 7, lava: 0, pools: 7, quake: 0.47,
    material(x, y, t, n) {
      const a = n.a.fbm(x * 0.07, y * 0.09, 3), b = n.b.fbm(x * 0.12, y * 0.12, 2), c = n.c(x * 0.04, y * 0.22);
      if (t < 0.06) return B.DIRT;
      if (n.d(x * 0.15, y * 0.15) > 0.44) return B.QUAKE;
      if (c > 0.16) return B.MUDSTONE;
      if (a > 0.3) return B.STONE;
      if (b > 0.34) return B.SAND;
      if (b < -0.36) return B.GRAVEL;
      return B.CLAY;
    },
  },
  3: {
    W: 64, H: 100, tunnel: 0.05, cavern: 0.27, water: 5, lava: 0, pools: 6, geodes: 5,
    material(x, y, t, n) {
      const a = n.a.fbm(x * 0.07, y * 0.07, 3), b = n.b.fbm(x * 0.1, y * 0.1, 2);
      if (t < 0.05) return B.MUDSTONE;
      if (n.d(x * 0.15, y * 0.15) > 0.45) return B.QUAKE;
      if (a > 0.12) return B.CRYSTALROCK;
      if (b < -0.3) return B.STONE;
      return B.GRANITE;
    },
  },
  4: {
    W: 64, H: 100, tunnel: 0.05, cavern: 0.27, water: 3, lava: 9, pools: 6,
    material(x, y, t, n) {
      const a = n.a.fbm(x * 0.07, y * 0.08, 3), b = n.b.fbm(x * 0.11, y * 0.11, 2);
      if (t < 0.05) return B.GRANITE;
      if (b > 0.36) return B.OBSIDIAN;
      if (b < -0.36) return B.ASH;
      if (a > 0.22) return B.MAGMAROCK;
      return B.BASALT;
    },
  },
  5: {
    W: 64, H: 100, tunnel: 0.05, cavern: 0.28, water: 7, lava: 0, pools: 8,
    material(x, y, t, n) {
      const a = n.a.fbm(x * 0.07, y * 0.08, 3), b = n.b.fbm(x * 0.11, y * 0.11, 2), c = n.c(x * 0.05, y * 0.05);
      if (t < 0.05) return B.BASALT;
      if (a > 0.22) return B.ICE;
      if (b < -0.34) return B.SNOW;
      if (c > 0.32) return B.GRANITE;
      return B.PERMAFROST;
    },
  },
  6: {
    W: 64, H: 104, tunnel: 0.052, cavern: 0.26, water: 2, lava: 7, pools: 6,
    material(x, y, t, n) {
      const a = n.a.fbm(x * 0.07, y * 0.08, 3), b = n.b.fbm(x * 0.1, y * 0.1, 2), c = n.c(x * 0.06, y * 0.06);
      if (t < 0.05) return B.PERMAFROST;
      if (b > 0.38) return B.VOIDROCK;
      if (a > 0.22) return B.STARROCK;
      if (c < -0.36) return B.MAGMAROCK;
      return B.CORE;
    },
  },
};

const PLANT_TABLE = {
  1: { floor: [['glowcap', 4], ['carrot', 5], ['fern', 3]], ceil: [['whisper', 1]], wall: [['glowcap', 2], ['fern', 1]], density: 0.09 },
  2: { floor: [['glowcap', 3], ['pepper', 3], ['carrot', 2], ['fern', 2]], ceil: [['vine', 4], ['whisper', 2]], wall: [['glowcap', 2]], density: 0.09 },
  3: { floor: [['bubble', 3], ['gloom', 2], ['glowcap', 2], ['lily', 0.8]], ceil: [['whisper', 1.5], ['vine', 1]], wall: [['glowcap', 1]], density: 0.08 },
  4: { floor: [['ashfern', 4], ['ember', 2.5], ['pepper', 2], ['gloom', 1]], ceil: [], wall: [['ashfern', 1]], density: 0.07 },
  5: { floor: [['frost', 3], ['gloom', 1.5], ['glowcap', 1.5]], ceil: [['whisper', 1]], wall: [['glowcap', 1]], density: 0.07 },
  6: { floor: [['lotus', 0.7], ['ember', 2], ['frost', 1.5], ['lily', 1.5]], ceil: [['whisper', 1]], wall: [['lily', 0.5]], density: 0.06 },
};

const CREATURE_TABLE = {
  1: [['earthworm', 10], ['dust_bunny', 5], ['mole_cricket', 4]],
  2: [['earthworm', 6], ['cave_bat', 5], ['rock_crab', 4], ['ore_slug', 4], ['glow_beetle', 4], ['dust_bunny', 2], ['blind_fish', 3]],
  3: [['cave_bat', 4], ['rock_crab', 3], ['ore_slug', 4], ['glow_beetle', 4], ['spark_mite', 6], ['crystal_spider', 4], ['blind_fish', 3], ['dust_bunny', 2]],
  4: [['lava_newt', 5], ['ember_moth', 5], ['rock_crab', 4], ['ore_slug', 3], ['gem_tortoise', 1], ['cave_bat', 3]],
  5: [['frost_shrimp', 5], ['blind_fish', 3], ['ore_slug', 3], ['gem_tortoise', 1], ['void_wisp', 2], ['cave_bat', 2]],
  6: [['void_wisp', 4], ['gem_tortoise', 1], ['ember_moth', 3], ['ore_slug', 3], ['lava_newt', 2]],
};

export const STATION_EVERY = 12;

export function generateMine(zone, seed) {
  const cfg = ZONE_GEN[zone] || ZONE_GEN[1];
  const W = cfg.W, H = cfg.H;
  const w = new MineWorld(zone, W, H);
  const rng = makeRng(seed);
  const n = {
    a: makeNoise2D(seed + 11), b: makeNoise2D(seed + 22), c: makeNoise2D(seed + 33), d: makeNoise2D(seed + 44),
    cave: makeNoise2D(seed + 55), cav2: makeNoise2D(seed + 66),
  };
  const sx = w.shaftX;

  // 1. materials
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = w.idx(x, y);
      const m = cfg.material(x, y, y / H, n);
      w.block[i] = m;
      w.back[i] = isGranular(m) ? B.DIRT : m;
      w.variant[i] = (x * 7 + y * 13 + ((x * y) % 5)) & 3;
    }
  // 2. caves: ridged worm tunnels + blobby caverns
  for (let y = 6; y < H - 3; y++)
    for (let x = 2; x < W - 2; x++) {
      const t = Math.abs(n.cave.fbm(x * 0.055, y * 0.085, 3));
      const c = n.cav2.fbm(x * 0.045, y * 0.06, 3) + (y / H) * 0.04;
      if (t < cfg.tunnel || c > cfg.cavern) w.block[w.idx(x, y)] = B.AIR;
    }
  // 3. geodes
  for (let g = 0; g < (cfg.geodes || 0); g++) {
    const cx = rng.int(6, W - 7), cy = rng.int(12, H - 8), rx = rng.range(2.4, 3.6), ry = rng.range(2, 3);
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        if (!w.inb(x, y)) continue;
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        const i = w.idx(x, y);
        if (d < 0.55) w.block[i] = B.AIR;
        else if (d < 1.35) {
          w.block[i] = B.GEODE;
          w.back[i] = B.GEODE;
          if (d < 0.95 && rng.chance(0.55)) { w.ore[i] = ORE_ID[rng.chance(0.6) ? 'amethyst' : 'quartz']; w.oreQ[i] = rng.range(80, 100); }
        }
      }
  }
  // 4. ore veins
  const spawn = ORE_SPAWN[zone] || [];
  const values = spawn.map(([id]) => ITEMS[id].value).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)] || 0;
  for (const [item, weight, vein] of spawn) {
    const oid = ORE_ID[item];
    if (!oid) continue;
    const count = Math.round((weight * W * H) / 1000);
    const deep = ITEMS[item].value > median;
    for (let k = 0; k < count; k++) {
      let x = rng.int(2, W - 3);
      let y = deep ? rng.int(Math.floor(H * 0.25), H - 4) : rng.int(6, H - 4);
      const size = vein + rng.int(0, vein);
      for (let s = 0; s < size; s++) {
        if (w.inb(x, y) && x > 0 && x < W - 1 && y > 4 && y < H - 2) {
          const i = w.idx(x, y);
          const blk = w.block[i];
          const okBlock = isSolid(blk) && !isGranular(blk) && blk !== B.BEDROCK && blk !== B.TIMBER;
          const truffleOk = item !== 'truffle' || blk === B.DIRT || blk === B.LOAM || blk === B.CLAY;
          if (okBlock && truffleOk && !w.ore[i]) {
            w.ore[i] = oid;
            w.oreQ[i] = clamp(84 + (rng() + rng() + rng() - 1.5) * 14, 55, 100);
          }
        }
        x += rng.int(-1, 1);
        y += rng.int(-1, 1);
      }
    }
  }
  // 5. fluid pockets (sealed) and pools (in caves)
  const pocket = (type, count) => {
    for (let k = 0; k < count; k++) {
      const cx = rng.int(4, W - 5), cy = rng.int(12, H - 6);
      const r = rng.range(1.4, 2.6);
      for (let y = Math.floor(cy - r); y <= cy + r; y++)
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          if (!w.inb(x, y) || x < 2 || x > W - 3) continue;
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          const i = w.idx(x, y);
          w.block[i] = B.AIR;
          w.ore[i] = 0;
          w.fluid[i] = 1;
          w.ftype[i] = type;
        }
    }
  };
  pocket(1, cfg.water);
  pocket(2, cfg.lava);
  // pools: drop fluid onto some cave floors
  for (let k = 0; k < (cfg.pools || 0) * 6; k++) {
    const x = rng.int(3, W - 4), y = rng.int(10, H - 5);
    const i = w.idx(x, y);
    if (w.block[i] === B.AIR && isSolid(w.block[w.idx(x, y + 1)])) {
      w.fluid[i] = 1;
      w.ftype[i] = cfg.lava && rng.chance(0.55) ? 2 : 1;
    }
  }

  // 6. borders, arrival room, lift stations
  for (let y = 0; y < H; y++) { w.block[w.idx(0, y)] = B.BEDROCK; w.block[w.idx(W - 1, y)] = B.BEDROCK; }
  for (let x = 0; x < W; x++) { w.block[w.idx(x, 0)] = B.BEDROCK; w.block[w.idx(x, H - 1)] = B.BEDROCK; w.block[w.idx(x, H - 2)] = rng.chance(0.6) ? B.BEDROCK : w.block[w.idx(x, H - 2)]; }
  const carve = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (w.inb(x, y)) { const i = w.idx(x, y); w.block[i] = B.AIR; w.ore[i] = 0; w.fluid[i] = 0; w.ftype[i] = 0; }
  };
  carve(sx - 5, 1, sx + 5, 3);
  for (let x = sx - 5; x <= sx + 5; x++) {
    const i = w.idx(x, 4);
    if (!isSolid(w.block[i]) || isGranular(w.block[i])) w.block[i] = zone === 1 ? B.DIRT : w.back[i];
  }
  for (let x = sx - 1; x <= sx + 1; x++) w.block[w.idx(x, 4)] = B.TIMBER;
  w.stations = [];
  for (let sy = 3; sy < H - 3; sy += STATION_EVERY) {
    w.stations.push(sy);
    if (sy > 3) {
      carve(sx - 1, sy - 1, sx + 1, sy);
      for (let x = sx - 1; x <= sx + 1; x++) w.block[w.idx(x, sy + 1)] = B.TIMBER;
    }
  }
  // bottom station sits just above the floor
  const bottom = H - 4;
  if (w.stations[w.stations.length - 1] !== bottom) {
    w.stations.push(bottom);
    carve(sx - 2, bottom - 1, sx + 2, bottom);
    for (let x = sx - 2; x <= sx + 2; x++) w.block[w.idx(x, bottom + 1)] = B.TIMBER;
  }
  w.spawn = { x: sx + 2.5, y: 3 };

  // 7. hp, stable ceilings
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = w.idx(x, y);
      w.hp[i] = w.maxHp(x, y);
      if (isSolid(w.block[i]) && y + 1 < H && !isSolid(w.block[w.idx(x, y + 1)])) w.flags[i] |= F.STABLE;
      // natural granular overhangs would collapse instantly; make them stone-like rubble anchors
      if (isGranular(w.block[i]) && y + 1 < H && !isSolid(w.block[w.idx(x, y + 1)])) {
        w.block[i] = zone >= 4 ? B.BASALT : zone === 3 ? B.GRANITE : B.STONE;
        w.hp[i] = w.maxHp(x, y);
        w.flags[i] |= F.STABLE;
      }
    }
  // 8. settle fluids so pools rest naturally
  settleFluids(w, 260);
  // frozen pools in the frost vault
  if (zone === 5) {
    for (let i = 0; i < W * H; i++) if (w.fluid[i] > 0.5 && w.ftype[i] === 1 && rng.chance(0.35)) { w.block[i] = B.ICE; w.fluid[i] = 0; w.ftype[i] = 0; w.hp[i] = BLOCKS[B.ICE].hp; }
  }

  // 9. plants
  const plants = [];
  const pt = PLANT_TABLE[zone];
  const pickW = (list) => {
    const tot = list.reduce((s, [, wgt]) => s + wgt, 0);
    let r = rng() * tot;
    for (const [id, wgt] of list) { r -= wgt; if (r <= 0) return id; }
    return list[0][0];
  };
  const occupied = new Set();
  for (let y = 5; y < H - 2; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = w.idx(x, y);
      if (w.block[i] !== B.AIR || w.fluid[i] > 0.1) continue;
      if (Math.abs(x - sx) <= 1 && w.stations.some((s) => Math.abs(s - y) <= 1)) continue;
      let side = null, list = null;
      if (isSolid(w.get(x, y + 1)) && pt.floor.length) { side = 'floor'; list = pt.floor; }
      else if (isSolid(w.get(x, y - 1)) && pt.ceil.length && rng.chance(0.5)) { side = 'ceil'; list = pt.ceil; }
      else if ((isSolid(w.get(x - 1, y)) || isSolid(w.get(x + 1, y))) && pt.wall.length && rng.chance(0.4)) { side = isSolid(w.get(x - 1, y)) ? 'wallL' : 'wallR'; list = pt.wall; }
      if (!side || !rng.chance(pt.density)) continue;
      plants.push({ type: pickW(list), x, y, side });
      occupied.add(i);
    }
  // sparkmoss hugs exposed bioxide
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = w.idx(x, y);
      if (w.ore[i] !== ORE_ID.bioxide) continue;
      for (const [dx, dy, side] of [[1, 0, 'wallL'], [-1, 0, 'wallR'], [0, -1, 'floor']]) {
        const j = w.idx(x + dx, y + dy);
        if (w.block[j] === B.AIR && !occupied.has(j) && rng.chance(0.75)) { plants.push({ type: 'sparkmoss', x: x + dx, y: y + dy, side }); occupied.add(j); }
      }
    }

  // 10. creatures
  const creatures = [];
  const airCells = [], dirtCells = [], waterCells = [], lavaCells = [], floorCells = [], ceilCells = [];
  for (let y = 6; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      const i = w.idx(x, y);
      const b = w.block[i];
      if (b === B.AIR) {
        if (w.fluid[i] > 0.6) (w.ftype[i] === 2 ? lavaCells : waterCells).push([x, y]);
        else {
          airCells.push([x, y]);
          if (isSolid(w.get(x, y + 1))) floorCells.push([x, y]);
          if (isSolid(w.get(x, y - 1))) ceilCells.push([x, y]);
        }
      } else if (b === B.DIRT || b === B.LOAM || b === B.CLAY) dirtCells.push([x, y]);
    }
  const bioxideCells = [];
  for (let i = 0; i < W * H; i++) if (w.ore[i] === ORE_ID.bioxide) bioxideCells.push([i % W, Math.floor(i / W)]);
  for (const [type, count] of CREATURE_TABLE[zone] || []) {
    for (let k = 0; k < count; k++) {
      let pool = floorCells;
      if (type === 'earthworm') pool = dirtCells;
      else if (type === 'cave_bat' || type === 'crystal_spider') pool = ceilCells;
      else if (type === 'blind_fish' || type === 'frost_shrimp') pool = waterCells;
      else if (type === 'lava_newt') pool = lavaCells.length ? lavaCells : floorCells;
      else if (type === 'glow_beetle' || type === 'ember_moth' || type === 'void_wisp') pool = airCells;
      else if (type === 'spark_mite') pool = bioxideCells.length ? bioxideCells : airCells;
      if (!pool.length) continue;
      const [x, y] = pool[rng.int(0, pool.length - 1)];
      if (Math.abs(x - sx) < 6 && y < 8) continue;
      creatures.push({ type, x: x + 0.5, y: y + 0.5 });
    }
  }
  return { world: w, plants, creatures };
}

export { ZONE_GEN };

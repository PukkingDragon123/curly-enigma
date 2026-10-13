// Procedural generation of a mine zone. Builds a cheap plan — layered cell materials,
// smooth cave/warp noise fields, ore deposits, geodes, fluid pockets, cave decorations,
// lift stations — then lets ChunkGen turn it into pixels on demand.
import { makeRng, makeNoise2D, clamp } from '../core/util.js';
import { B, BLOCKS, ORES, ORE_ID, ORE_SPAWN, isSolid, isGranular } from './blocks.js';
import { MineWorld, F } from './MineWorld.js';
import { ITEMS } from '../data/items.js';
import { settleFluids } from './Fluids.js';
import { M, ORE_BASE, setOrePalette, tn } from './micro.js';
import { ChunkGen, NODE, makeDeposit } from './MicroGen.js';
import { oreBlob } from './MineSprites.js';

const ZONE_GEN = {
  1: {
    W: 64, H: 92, tunnel: 0.045, cavern: 0.3, water: 3, lava: 0, pools: 4, growth: { cover: 0.42 }, roots: 0.35, spikes: 0.12,
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
    W: 64, H: 96, tunnel: 0.045, cavern: 0.29, water: 7, lava: 0, pools: 7, quake: 0.47, growth: { cover: 0.48 }, roots: 0.25, spikes: 0.2,
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
    W: 64, H: 100, tunnel: 0.05, cavern: 0.27, water: 5, lava: 0, pools: 6, geodes: 5, growth: { cover: 0.55 }, spikes: 0.3, crystals: 0.25,
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
    W: 64, H: 100, tunnel: 0.05, cavern: 0.27, water: 3, lava: 9, pools: 6, growth: { cover: 0.5 }, spikes: 0.25,
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
    W: 64, H: 100, tunnel: 0.05, cavern: 0.28, water: 7, lava: 0, pools: 8, growth: { cover: 0.36 }, spikes: 0.35, crystals: 0.15,
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
    W: 64, H: 104, tunnel: 0.052, cavern: 0.26, water: 2, lava: 7, pools: 6, growth: { cover: 0.55 }, spikes: 0.25, crystals: 0.2,
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

// ---------------------------------------------------------------- shared plan helpers
/** Smooth warp fields so material borders wander instead of following cell edges. */
export function warpFields(w, seed, amp = 15) {
  const NW = Math.floor(w.MW / NODE) + 1, NH = Math.floor(w.MH / NODE) + 1;
  const WX = new Float32Array(NW * NH), WY = new Float32Array(NW * NH);
  const nx = makeNoise2D(seed + 801), ny = makeNoise2D(seed + 802);
  for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) {
    const x = (i * NODE) / M, y = (j * NODE) / M;
    WX[j * NW + i] = nx.fbm(x * 0.35, y * 0.35, 2) * amp * 2.2;
    WY[j * NW + i] = ny.fbm(x * 0.35, y * 0.35, 2) * amp * 2.2;
  }
  return { WX, WY, NW, NH };
}

/** Register ore palettes once: each ore type shares one 15-color palette (from its seed-1 art). */
let palettesReady = false;
const TYPE_PAL = [];
export function ensureOrePalettes() {
  if (palettesReady) return;
  palettesReady = true;
  for (const o of ORES) {
    if (!o) continue;
    const b = oreBlob(o.item, 1);
    TYPE_PAL[o.id] = b;
    setOrePalette(o.id, b.pal, b.glow);
  }
}

/** Map a deposit's own palette indices onto its ore type's shared palette (nearest color, same glow/stain kind). */
function paletteMap(oreId, blob) {
  const T = TYPE_PAL[oreId];
  const map = new Uint8Array(16);
  if (!T || T === blob) { for (let k = 0; k < 16; k++) map[k] = k; return map; }
  const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  for (let k = 1; k < blob.pal.length && k < 16; k++) {
    const a = rgb(blob.pal[k]);
    let best = 1, bd = Infinity;
    for (let j = 1; j < T.pal.length && j < 16; j++) {
      const b = rgb(T.pal[j]);
      let d = (a[0] - b[0]) ** 2 * 0.3 + (a[1] - b[1]) ** 2 * 0.59 + (a[2] - b[2]) ** 2 * 0.11;
      if (!!(blob.glow[k] > 0.05) !== !!(T.glow[j] > 0.05)) d += 20000;
      if (!!(blob.stain && blob.stain[k]) !== !!(T.stain && T.stain[j])) d += 30000;
      if (d < bd) { bd = d; best = j; }
    }
    map[k] = best;
  }
  return map;
}

/** Plant a deposit pattern centered on pixel (px, py). */
export function planDeposit(w, plan, oreId, px, py, q, seed) {
  const o = ORES[oreId];
  const blob = oreBlob(o.item, (seed % 7) + 1);
  const d = makeDeposit(oreId, o.item, blob, Math.round(px - blob.w / 2), Math.round(py - blob.h / 2), q);
  d.map = paletteMap(oreId, blob);
  d.stain = blob.stain || null;
  w.addDeposit(d);
  plan.features.push({ kind: 'deposit', dep: d, x0: d.x0, y0: d.y0, x1: d.x0 + d.w, y1: d.y0 + d.h });
  return d;
}

/**
 * Pointy cave decorations made of pixels: stalactites / stalagmites (only fill air).
 * facets: shade it like a crystal shard (lit face, ridge, shadow face, glinting tip).
 */
export function spikeFeature(px, py, len, base, dir, mat, facets = false) {
  const x0 = Math.floor(px - base), x1 = Math.ceil(px + base) + 1;
  const y0 = dir > 0 ? Math.floor(py - 6) : Math.floor(py - len), y1 = dir > 0 ? Math.ceil(py + len) : Math.ceil(py + 6);
  const at = (x, y) => (dir > 0 ? (y - (py - 6)) / (len + 6) : ((py + 6) - y) / (len + 6));
  const halfAt = (t) => base * (1 - t) * (1 - t * 0.25) + 0.4;
  const offAt = (x, t) => x + 0.5 - px - Math.sin(t * 5 + px) * 0.6;
  const f = {
    kind: 'fill', mat, x0, y0, x1, y1,
    test(x, y, cur) {
      if (cur) return false;
      const t = at(x, y);
      if (t < 0 || t > 1) return false;
      return Math.abs(offAt(x, t)) <= halfAt(t);
    },
  };
  if (facets) {
    f.det = (x, y) => {
      const t = at(x, y), half = halfAt(t), off = offAt(x, t);
      if (t > 0.86) return 15;
      if (off > half - 0.9) return 13;
      if (off < 0.9 - half) return 12;
      if (Math.abs(off) < 0.55) return t > 0.45 ? 15 : 12;
      return off < 0 ? 11 : 14;
    };
  }
  return f;
}

/** A hanging root strand (thin wiggly line of root pixels, fills air only). */
export function rootFeature(px, py, len, seed) {
  return {
    kind: 'fill', mat: B.ROOTS, x0: Math.floor(px - 8), x1: Math.ceil(px + 9), y0: Math.floor(py - 4), y1: Math.ceil(py + len),
    test(x, y, cur) {
      if (cur) return false;
      const t = (y - py) / len;
      if (t < -0.2 || t > 1) return false;
      const cx = px + Math.sin(y * 0.18 + seed) * 2.5 * Math.max(0, t) + Math.sin(y * 0.5 + seed * 2) * 0.6;
      const w = t > 0.85 ? 0.4 : 0.9;
      if (Math.abs(x + 0.5 - cx) <= w) return true;
      // little side rootlets
      return t > 0.2 && t < 0.8 && (Math.floor(y + seed) % 9 === 0) && Math.abs(x + 0.5 - cx - 2) <= 1.2;
    },
  };
}

// ---------------------------------------------------------------- zone generation
export function generateMine(zone, seed) {
  ensureOrePalettes();
  const cfg = ZONE_GEN[zone] || ZONE_GEN[1];
  const W = cfg.W, H = cfg.H;
  const w = new MineWorld(zone, W, H);
  const rng = makeRng(seed);
  const n = {
    a: makeNoise2D(seed + 11), b: makeNoise2D(seed + 22), c: makeNoise2D(seed + 33), d: makeNoise2D(seed + 44),
    cave: makeNoise2D(seed + 55), cav2: makeNoise2D(seed + 66),
  };
  const sx = w.shaftX;

  // 1. cell materials
  const cellMat = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = w.idx(x, y);
      const m = cfg.material(x, y, y / H, n);
      cellMat[i] = m;
      w.back[i] = isGranular(m) ? B.DIRT : m;
      w.variant[i] = (x * 7 + y * 13 + ((x * y) % 5)) & 3;
    }
  // granular overhangs would pour out at once: anchor them as stone in the plan
  // (the pixel warp still leaves a few loose grains that trickle when disturbed)

  // 2. smooth cave fields sampled every NODE pixels
  const { WX, WY, NW, NH } = warpFields(w, seed);
  const T = new Float32Array(NW * NH), C = new Float32Array(NW * NH);
  for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) {
    const x = (i * NODE) / M, y = (j * NODE) / M;
    T[j * NW + i] = n.cave.fbm(x * 0.055, y * 0.085, 3);
    C[j * NW + i] = n.cav2.fbm(x * 0.045, y * 0.06, 3) + (y / H) * 0.04;
  }
  const plan = {
    seed, cellMat, mode: 'caves', T, C, WX, WY, tunnel: cfg.tunnel, cavern: cfg.cavern,
    region: { x0: 2, y0: 6, x1: W - 2, y1: H - 3 }, features: [], growth: cfg.growth,
  };
  const gen = new ChunkGen(w, plan);
  w.gen = gen;

  // approximate cell occupancy from the fields (exact once the chunk is generated)
  const cellAirFrac = (x, y) => {
    let air = 0, tot = 0;
    for (let yy = 0; yy <= M; yy += NODE) for (let xx = 0; xx <= M; xx += NODE) { tot++; if (gen.planAir(x * M + xx, y * M + yy)) air++; }
    return air / tot;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = w.idx(x, y);
      w.block[i] = cellAirFrac(x, y) >= 0.5 ? B.AIR : cellMat[i];
    }

  const carveCells = (x0, y0, x1, y1, round = 0) => {
    plan.features.push({
      kind: 'carve', x0: x0 * M, y0: y0 * M, x1: (x1 + 1) * M, y1: (y1 + 1) * M,
      test: round ? (x, y) => {
        const dx = Math.max(0, Math.max(x0 * M + round - x, x - ((x1 + 1) * M - round))), dy = Math.max(0, Math.max(y0 * M + round - y, y - ((y1 + 1) * M - round)));
        return dx * dx + dy * dy <= round * round;
      } : () => true,
    });
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (w.inb(x, y)) { const i = w.idx(x, y); w.block[i] = B.AIR; w.ore[i] = 0; w.fluid[i] = 0; w.ftype[i] = 0; }
  };
  const fillCells = (x0, y0, x1, y1, mat, opts = {}) => {
    plan.features.push({ kind: 'fill', mat, x0: x0 * M + (opts.dx0 || 0), y0: y0 * M + (opts.dy0 || 0), x1: (x1 + 1) * M - (opts.dx1 || 0), y1: (y1 + 1) * M - (opts.dy1 || 0), test: opts.test || (() => true), back: opts.back });
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (w.inb(x, y)) w.block[w.idx(x, y)] = mat;
  };

  // 3. geodes: crystal-lined hollow eggs
  for (let g = 0; g < (cfg.geodes || 0); g++) {
    const cx = rng.int(6, W - 7) + 0.5, cy = rng.int(12, H - 8) + 0.5, rx = rng.range(2.4, 3.6), ry = rng.range(2, 3);
    const pcx = cx * M, pcy = cy * M, prx = rx * M, pry = ry * M;
    const gs = rng.int(1, 9999);
    const shape = (x, y) => {
      const dx = (x + 0.5 - pcx) / prx, dy = (y + 0.5 - pcy) / pry;
      return Math.sqrt(dx * dx + dy * dy) + (tn(x, y, 8, gs) - 0.5) * 0.08;
    };
    // crystal teeth of uneven lengths: where pixel (x, y) sits on its tooth
    const toothAt = (x, y) => {
      const ang = Math.atan2((y + 0.5 - pcy) / pry, (x + 0.5 - pcx) / prx) * 11 + gs;
      const u = ang / Math.PI, k = Math.floor(u);
      const h = (((((k % 22) + 22) * 2654435761 + gs * 97) >>> 0) % 1000) / 1000;
      const L = 0.06 + h * h * 0.3;
      return { f: u - k, inner: 0.82 - L * Math.pow(Math.abs(Math.sin(ang)), 1.6) };
    };
    // hollow it out first, then line it: rind + crystal teeth pointing inward
    plan.features.push({ kind: 'carve', x0: Math.floor(pcx - prx), x1: Math.ceil(pcx + prx), y0: Math.floor(pcy - pry), y1: Math.ceil(pcy + pry), test: (x, y) => shape(x, y) < 0.82 });
    plan.features.push({
      kind: 'fill', mat: B.GEODE, x0: Math.floor(pcx - prx - 4), x1: Math.ceil(pcx + prx + 4), y0: Math.floor(pcy - pry - 4), y1: Math.ceil(pcy + pry + 4),
      test(x, y) {
        const d = shape(x, y);
        if (d > 1.12) return false;
        if (d > 0.82) return B.GEODE;
        return d > 0.5 && d > toothAt(x, y).inner ? B.CRYSTALROCK : false;
      },
      det(x, y, m) {
        if (m !== B.CRYSTALROCK) return -1;
        // faceted teeth: lit face, bright ridge, shadow face, dark outline on the shadow side
        const d = shape(x, y), { f, inner } = toothAt(x, y);
        if (d - inner < 0.014) return f < 0.5 ? 12 : 13;
        if (Math.abs(f - 0.5) < 0.035) return d - inner < 0.06 ? 15 : 12;
        return f < 0.5 ? 11 : 14;
      },
    });
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (!w.inb(x, y)) continue;
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d < 0.4) w.block[w.idx(x, y)] = B.AIR;
      else if (d < 1.2) w.block[w.idx(x, y)] = B.GEODE;
    }
    // a couple of gem deposits in the rind
    for (let k = 0; k < 3; k++) {
      const a = rng() * Math.PI * 2;
      const oid = ORE_ID[rng.chance(0.6) ? 'amethyst' : 'quartz'];
      planDeposit(w, plan, oid, pcx + Math.cos(a) * prx * 0.78, pcy + Math.sin(a) * pry * 0.78, rng.range(80, 100), rng.int(1, 1e6));
    }
  }

  // 4. ore deposits along veins
  const spawn = ORE_SPAWN[zone] || [];
  const values = spawn.map(([id]) => ITEMS[id].value).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)] || 0;
  for (const [item, weight, vein] of spawn) {
    const oid = ORE_ID[item];
    if (!oid) continue;
    const count = Math.max(1, Math.round((weight * W * H) / 2800));
    const deep = ITEMS[item].value > median;
    for (let k = 0; k < count; k++) {
      let x = rng.int(2, W - 3);
      let y = deep ? rng.int(Math.floor(H * 0.25), H - 4) : rng.int(6, H - 4);
      const size = vein + rng.int(0, vein);
      for (let s = 0; s < size; s++) {
        if (w.inb(x, y) && x > 1 && x < W - 2 && y > 4 && y < H - 3) {
          const i = w.idx(x, y);
          const blk = cellMat[i];
          const okBlock = isSolid(w.block[i]) && !isGranular(blk) && blk !== B.BEDROCK && blk !== B.TIMBER;
          const truffleOk = item !== 'truffle' || blk === B.DIRT || blk === B.LOAM || blk === B.CLAY;
          if (okBlock && truffleOk && !w.ore[i]) {
            w.ore[i] = oid;
            const q = clamp(84 + (rng() + rng() + rng() - 1.5) * 14, 55, 100);
            w.oreQ[i] = q;
            planDeposit(w, plan, oid, (x + 0.5) * M + rng.range(-6, 6), (y + 0.5) * M + rng.range(-6, 6), q, rng.int(1, 1e6));
          }
        }
        x += rng.int(-1, 1);
        y += rng.int(-1, 1);
      }
    }
  }

  // 5. sealed fluid pockets and pools
  const pocket = (type, count) => {
    for (let k = 0; k < count; k++) {
      const cx = rng.int(4, W - 5), cy = rng.int(12, H - 6);
      const r = rng.range(1.4, 2.6);
      const pcx = (cx + 0.5) * M, pcy = (cy + 0.5) * M, pr = r * M, ps = rng.int(1, 9999);
      plan.features.push({ kind: 'carve', x0: Math.floor(pcx - pr - 2), x1: Math.ceil(pcx + pr + 2), y0: Math.floor(pcy - pr - 2), y1: Math.ceil(pcy + pr + 2),
        test: (x, y) => Math.hypot(x + 0.5 - pcx, y + 0.5 - pcy) < pr * (0.92 + tn(x, y, 8, ps) * 0.16) });
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
  for (let k = 0; k < (cfg.pools || 0) * 6; k++) {
    const x = rng.int(3, W - 4), y = rng.int(10, H - 5);
    const i = w.idx(x, y);
    if (w.block[i] === B.AIR && isSolid(w.block[w.idx(x, y + 1)])) {
      w.fluid[i] = 1;
      w.ftype[i] = cfg.lava && rng.chance(0.55) ? 2 : 1;
    }
  }

  // 6. cave decorations: stalactites, stalagmites, hanging roots, crystal clusters
  for (let y = 7; y < H - 4; y++)
    for (let x = 3; x < W - 3; x++) {
      const i = w.idx(x, y);
      if (w.block[i] !== B.AIR || w.fluid[i] > 0) continue;
      const above = w.block[w.idx(x, y - 1)], below = w.block[w.idx(x, y + 1)];
      const deep = !isSolid(w.block[w.idx(x, y + 1)]) && !isSolid(w.block[w.idx(x, y + 2)]);
      if (isSolid(above) && !isGranular(above) && deep && rng.chance(cfg.spikes || 0)) {
        plan.features.push(spikeFeature((x + rng.range(0.25, 0.75)) * M, y * M, rng.range(14, 38), rng.range(4, 8), 1, above));
      } else if (isSolid(above) && cfg.roots && (above === B.DIRT || above === B.LOAM || above === B.ROOTS || above === B.CLAY) && rng.chance(cfg.roots)) {
        plan.features.push(rootFeature((x + rng.range(0.2, 0.8)) * M, y * M, rng.range(14, 40), rng.int(1, 99)));
      }
      if (isSolid(below) && !isGranular(below) && !isSolid(above) && rng.chance((cfg.spikes || 0) * 0.6)) {
        plan.features.push(spikeFeature((x + rng.range(0.25, 0.75)) * M, (y + 1) * M, rng.range(10, 28), rng.range(4, 9), -1, below));
      }
      if (cfg.crystals && isSolid(below) && rng.chance(cfg.crystals * 0.25)) {
        const bx = (x + rng.range(0.2, 0.8)) * M, by = (y + 1) * M;
        for (let k = 0; k < 3; k++) {
          plan.features.push(spikeFeature(bx + rng.range(-5, 5), by + 2, rng.range(8, 18), rng.range(2, 3.5), -1, B.CRYSTALROCK, true));
        }
      }
    }

  // 7. borders, arrival room, lift stations
  const bseed = rng.int(1, 9999);
  const edge = (x, y) => 10 + tn(x, y, 16, bseed) * 18;
  // four tight strips (a whole-world box would be tested for every pixel of every chunk)
  plan.features.push({ kind: 'fill', mat: B.BEDROCK, back: B.BEDROCK, x0: 0, y0: 0, x1: M + 12, y1: w.MH, test: (x, y) => x < M + edge(x, y) - 24 });
  plan.features.push({ kind: 'fill', mat: B.BEDROCK, back: B.BEDROCK, x0: w.MW - M - 12, y0: 0, x1: w.MW, y1: w.MH, test: (x, y) => x >= w.MW - M - edge(x, y) + 24 });
  plan.features.push({ kind: 'fill', mat: B.BEDROCK, back: B.BEDROCK, x0: 0, y0: 0, x1: w.MW, y1: M / 2, test: () => true });
  plan.features.push({ kind: 'fill', mat: B.BEDROCK, back: B.BEDROCK, x0: 0, y0: w.MH - M - 12, x1: w.MW, y1: w.MH, test: (x, y) => y >= w.MH - M - edge(x, y) + 24 });
  for (let y = 0; y < H; y++) { w.block[w.idx(0, y)] = B.BEDROCK; w.block[w.idx(W - 1, y)] = B.BEDROCK; }
  for (let x = 0; x < W; x++) { w.block[w.idx(x, 0)] = B.BEDROCK; w.block[w.idx(x, H - 1)] = B.BEDROCK; }
  carveCells(sx - 5, 1, sx + 5, 3, 10);
  for (let x = sx - 5; x <= sx + 5; x++) {
    const i = w.idx(x, 4);
    if (!isSolid(w.block[i]) || isGranular(w.block[i])) { w.block[i] = zone === 1 ? B.DIRT : w.back[i]; cellMat[i] = w.block[i]; }
  }
  plan.features.push({ kind: 'fill', mat: zone === 1 ? B.DIRT : B.STONE, x0: (sx - 5) * M, x1: (sx + 6) * M, y0: 4 * M, y1: 5 * M, test: (x, y, cur) => !cur || isGranular(cur) });
  fillCells(sx - 1, 4, sx + 1, 4, B.TIMBER, { dy1: 18 });
  w.stations = [];
  for (let sy = 3; sy < H - 3; sy += STATION_EVERY) {
    w.stations.push(sy);
    if (sy > 3) {
      carveCells(sx - 1, sy - 1, sx + 1, sy, 6);
      fillCells(sx - 1, sy + 1, sx + 1, sy + 1, B.TIMBER, { dy1: 18 });
    }
  }
  const bottom = H - 4;
  if (w.stations[w.stations.length - 1] !== bottom) {
    w.stations.push(bottom);
    carveCells(sx - 2, bottom - 1, sx + 2, bottom, 6);
    fillCells(sx - 2, bottom + 1, sx + 2, bottom + 1, B.TIMBER, { dy1: 18 });
  }
  w.spawn = { x: sx + 2.5, y: 3 };

  // 8. stable ceilings, fluids
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = w.idx(x, y);
      if (isSolid(w.block[i]) && y + 1 < H && !isSolid(w.block[w.idx(x, y + 1)])) w.flags[i] |= F.STABLE;
    }
  settleFluids(w, 260);
  if (zone === 5) {
    for (let i = 0; i < W * H; i++) if (w.fluid[i] > 0.5 && w.ftype[i] === 1 && rng.chance(0.35)) {
      const x = i % W, y = Math.floor(i / W);
      fillCells(x, y, x, y, B.ICE, { test: (xx, yy, cur) => !cur });
      w.fluid[i] = 0; w.ftype[i] = 0;
    }
  }

  const { plants, creatures } = populate(w, zone, rng, sx);
  return { world: w, plants, creatures, gen };
}

/** Plants and creatures from the cell-level plan. */
export function populate(w, zone, rng, sx = w.shaftX) {
  const W = w.W, H = w.H;
  const plants = [];
  const pt = PLANT_TABLE[zone] || PLANT_TABLE[1];
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
  // sparkmoss hugs bioxide deposits
  for (const d of w.deposits) {
    if (ORES[d.oreId].item !== 'bioxide') continue;
    const x = Math.floor((d.x0 + d.w / 2) / M), y = Math.floor((d.y0 + d.h / 2) / M);
    for (const [dx, dy, side] of [[1, 0, 'wallL'], [-1, 0, 'wallR'], [0, -1, 'floor']]) {
      if (!w.inb(x + dx, y + dy)) continue;
      const j = w.idx(x + dx, y + dy);
      if (w.block[j] === B.AIR && !occupied.has(j) && rng.chance(0.75)) { plants.push({ type: 'sparkmoss', x: x + dx, y: y + dy, side }); occupied.add(j); }
    }
  }

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
  const bioxideCells = w.deposits.filter((d) => ORES[d.oreId].item === 'bioxide').map((d) => [Math.floor((d.x0 + d.w / 2) / M), Math.floor((d.y0 + d.h / 2) / M)]);
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
  return { plants, creatures };
}

export { ZONE_GEN };

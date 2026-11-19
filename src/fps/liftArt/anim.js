// What moves in the cross-section, drawn each frame over the painted slabs: drips that swell, fall and
// splash, lamps that flicker, spores drifting up from the glowcaps, the town cage riding its shaft,
// water and lava surfaces, falls, embers, snow, rare glints on known ore, the creatures you've
// recorded walking and flying (the ones you haven't: a silhouette and two eyes), chimney smoke,
// clouds, the core's pulse and the mole with his lamp ("you are here").
import { clamp } from '../../core/util.js';
import { CREATURES } from '../../data/creatures.js';
import { Art, INK, INK2, CREAM, LAMP, WATER, LAVA, hash, mix, mul, css } from './kit.js';
import { cage } from './props.js';

// ------------------------------------------------------------------ small canvas helpers
const pxl = (ctx, x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
const glowCache = new Map();
/** A banded pixel glow: two flat rings (lamplight is flat in a woodcut), drawn 'lighter'. */
function glowSprite(c, r) {
  const key = c + ':' + r;
  if (glowCache.has(key)) return glowCache.get(key);
  const n = r * 2 + 1, a = new Art(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x - r, (y - r) * 1.15) / (r + 0.5) + (hash(x, y, 5) - 0.5) * 0.06;
    if (d >= 1) continue;
    a.p(x, y, mul(c, d < 0.45 ? 0.5 : 0.24));
  }
  const cv = a.commit();
  glowCache.set(key, cv);
  return cv;
}
export function drawGlow(ctx, x, y, c, r, k) {
  if (k <= 0.02) return;
  r = Math.max(2, Math.round(r));
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(k, 0, 1);
  ctx.drawImage(glowSprite(c, r), Math.round(x - r), Math.round(y - r));
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ creatures
const MOVE = {
  earthworm: 'worm', dust_bunny: 'hop', mole_cricket: 'walk', cave_bat: 'fly', rock_crab: 'walk', ore_slug: 'slug', glow_beetle: 'fly',
  spark_mite: 'swarm', crystal_spider: 'hang', blind_fish: 'swim', lava_newt: 'lava', ember_moth: 'fly', frost_shrimp: 'swim', gem_tortoise: 'walk',
  void_wisp: 'float', pebble_mimic: 'still', spore_puffer: 'hop', shade_bat: 'fly', rubble_golem: 'walk', gloom_wisp: 'float', crystal_wyrm: 'walk',
  ember_imp: 'walk', crystal_golem: 'walk', kobold: 'walk', cave_troll: 'walk', cave_spider: 'hang', cave_slime: 'hop', ruin_wraith: 'float',
  cave_drake: 'walk', raptor: 'walk', tyrant: 'walk', shellback: 'walk', pterosaur: 'fly',
};
// tiny sprites facing right: 1 body, 2 light, 3 dark, e eye, k bright eye, w white, y yellow
const SPR = {
  bat: [['3.......3', '33.1.1.33', '.3311133.', '...1k1...', '....1....'], ['...1.1...', '..31113..', '.3311133.', '33.1k1.33', '3.......3']],
  crab: [['2.......2', '13.....31', '.1.e.e.1.', '.3222223.', '3.3.3.3.3'], ['.2.....2.', '.13...31.', '.1.e.e.1.', '.3222223.', '.3.3.3.3.']],
  cricket: [['.....33.', '..1111e.', '.122221.', '3.3..3.3'], ['....3..3', '..1111e.', '.122221.', '.3.3.3..']],
  bunny: [['..2.2.', '..1.1.', '.2222e', '211111', '.1111.'], ['...2.2', '..1.1.', '.2222e', '211111', '1....1']],
  spider: [['3.....3', '.3.1.3.', '3.111.3', '.3k1k3.', '3.....3']],
  spiderBig: [['3.......3', '.3..1..3.', '3.31113.3', '.3111113.', '3.1k1k1.3', '.3.....3.']],
  tortoise: [['..22222...', '.2211122..', '2211111221', '.33333331e', '.1.1..1.1.']],
  golem: [['..2222..', '.21e1e1.', '.211111.', '22333322', '21.11.12', '2..11..2', '..1..1..', '.22..22.']],
  troll: [['...222...', '..21e12..', '..2111w..', '.2211122.', '21.111.12', '1..111..1', '...1.1...', '..33.33..']],
  humanoid: [['.y..', '222.', '1e1.', '111.', '3113', '.11.', '1..1']],
  imp: [['3..3', '2222', '1k1k', '1111', '.11.', '1..1']],
  wraith: [['.222.', '22222', '2k2k2', '22222', '12121', '1.1.1', '.1..1']],
  raptor: [['........222', '.......2e22', '.......11..', '3.....111..', '.31111111..', '..33111.1..', '....1..1...', '....3..33..'], ['........222', '.......2e22', '.......11..', '......111..', '331111111..', '..33111.1..', '....1.1....', '...33.3....']],
  tyrant: [['.........2222.', '........22e222', '........2wwww.', '.......1112...', '3.....11111...', '.3311111111...', '...3311111.1..', '.....11..1....', '.....1...1....', '....33..33....']],
  shellback: [['...2.2.2.2..', '..22222222..', '.2233333322.', '3.11111111e1', '..1.1..1.1..']],
  drake: [['....2.......', '...22.....22', '..2221...2e2', '.3211111111.', '3..11111.1..', '...1.1..1...', '..33.3..33..']],
  ptero: [['2...........2', '22.........22', '.222.111.222.', '...221e122...', '.......2.....'], ['.............', '.....111.....', '..222.1e2222.', '.22.......22.', '2...........2']],
  newt: [['......2.', '31111e1.', '.1..1...']],
  moth: [['2...2', '22122', '.2k2.', '2.1.2'], ['.....', '22122', '22k22', '..1..']],
  shrimp: [['.1...', '..122e', '3.1111', '.3.3.3']],
  mimic: [['..2222.', '.21e1e2', '3111111']],
  puffer: [['.2.2.', '21112', '1e1e1', '21112', '.2.2.']],
  beetle: [['.33.', '1e11', '2222', '.22.']],
  worm: [['..1111.', '.122221', '1.....e']],
  slug: [['....2.2', '...2112.', '.122221.', '1111111.']],
  slime: [['..222..', '.21112.', '21e1e12', '1111111']],
  fish: [['..222..', '3.21112e', '33111111', '3.1111..']],
  wisp: [['.2.', '2k2', '.1.', '1.1']],
  mite: [['1.1', '.k.', '1.1']],
};
const SPRITE_OF = {
  cave_bat: 'bat', shade_bat: 'bat', rock_crab: 'crab', mole_cricket: 'cricket', dust_bunny: 'bunny', crystal_spider: 'spider', cave_spider: 'spiderBig',
  gem_tortoise: 'tortoise', rubble_golem: 'golem', crystal_golem: 'golem', cave_troll: 'troll', kobold: 'humanoid', ember_imp: 'imp', ruin_wraith: 'wraith',
  raptor: 'raptor', tyrant: 'tyrant', shellback: 'shellback', cave_drake: 'drake', pterosaur: 'ptero', lava_newt: 'newt', ember_moth: 'moth',
  frost_shrimp: 'shrimp', pebble_mimic: 'mimic', spore_puffer: 'puffer', glow_beetle: 'beetle', earthworm: 'worm', ore_slug: 'slug', cave_slime: 'slime',
  blind_fish: 'fish', void_wisp: 'wisp', gloom_wisp: 'wisp', spark_mite: 'mite', crystal_wyrm: 'drake',
};
const frameCache = new Map();
/** A creature's frames, facing right and left: its colour as a hue-shifted 3-tone ramp, a plum outline; or a plum silhouette with eyes (unknown). */
function critterFrames(id, known) {
  const key = id + (known ? '' : ':?');
  if (frameCache.has(key)) return frameCache.get(key);
  const c0 = CREATURES[id]?.color ?? 0xa08870;
  const pal = known
    ? { 1: c0, 2: mix(mix(c0, CREAM, 0.38), 0xffe0a0, 0.15), 3: mix(mul(c0, 0.55), 0x3a1a4a, 0.3), e: CREAM, k: LAMP[3], w: CREAM, y: LAMP[2] }
    : { 1: INK2, 2: 0x4a2c40, 3: INK, e: 0xe8c878, k: 0xe8c878, w: INK2, y: INK2 };
  const rows0 = SPR[SPRITE_OF[id]];
  const frames = [];
  if (rows0) for (const rows of rows0) {
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const pair = [false, true].map((flip) => {
      const a = new Art(w + 2, h + 2);
      for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
        if (rows[j][i] === '.') continue;
        const x = flip ? w - 1 - i : i;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!a.a(x + 1 + dx, j + 1 + dy)) a.p(x + 1 + dx, j + 1 + dy, INK);
      }
      for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
        const ch = rows[j][i];
        if (ch === '.') continue;
        a.p((flip ? w - 1 - i : i) + 1, j + 1, pal[ch] ?? pal[1]);
      }
      return a.commit();
    });
    frames.push(pair);
  }
  frameCache.set(key, frames);
  return frames;
}

/** Where a layer's life goes (known creatures roam; up to three unknown ones lurk; plants by the walls). */
export function placeLife(L, R, rng) {
  const { W } = L;
  const anim = R.anim, floorTop = R.floorTop;
  const known = L.finds.crit.filter((c) => c.e), unknown = L.finds.crit.filter((c) => !c.e);
  const x0 = 24, x1 = W - 16;
  const water = R.pools.find((p) => p.kind === 2), lava = R.pools.find((p) => p.kind === 3);
  const list = known.map((c) => ({ c, known: true })).concat(unknown.slice(0, 3).map((c) => ({ c, known: false })));
  list.forEach(({ c, known: kn }, k) => {
    const mv = MOVE[c.id] || 'walk';
    const o = { id: c.id, known: kn, mv, x: clamp(Math.round(x0 + ((k + 0.5) / list.length) * (x1 - x0) + rng.range(-10, 10)), 20, W - 12), frames: critterFrames(c.id, kn), ph: rng(), sp: 0.5 + rng() * 0.7, range: rng.range(8, 22) };
    if (mv === 'swim' && water) { o.x = (water.x0 + water.x1) / 2; o.range = (water.x1 - water.x0) / 2 - 6; o.y = water.level + 4; }
    if (mv === 'lava' && lava) { o.x = (lava.x0 + lava.x1) / 2; o.range = (lava.x1 - lava.x0) / 2 - 6; o.y = lava.level; }
    if (!kn) o.range = rng.range(0, 4); // lurkers barely move
    anim.critters.push(o);
  });
  const kp = L.finds.plants.filter((p) => p.e);
  kp.forEach((p, k) => {
    for (let t = 0; t < 12; t++) {
      const x = clamp(Math.round(30 + ((k + 0.5) / kp.length) * (W - 50) + rng.range(-14, 14)), 22, W - 10);
      if (R.pools.some((q) => x >= q.x0 - 2 && x <= q.x1 + 2) || Math.abs(floorTop[x] - floorTop[x + 2]) > 1) continue;
      anim.plants.push({ id: p.id, x, ph: rng() });
      break;
    }
  });
}

// ------------------------------------------------------------------ per frame: a layer
export function drawLayerAnim(ctx, sec, t, oy) {
  const A = sec.art.anim, W = sec.W, z = sec.z, R = sec.art;
  const P = (x, y, c, w, h) => pxl(ctx, x, y + oy, c, w, h);
  // liquid surfaces: a moving glint on water, a churn on lava
  const liq = A.liquid;
  for (let i = 0; i < liq.length; i += 3) {
    const x = liq[i], y = liq[i + 1], v = liq[i + 2];
    const s = Math.sin(x * 0.42 - t * (v === 3 ? 2.6 : 1.6)) + Math.sin(x * 0.13 + t * 1.1);
    if (v === 3) { if (s > 1.25) P(x, y - 1, css(LAVA[3])); else if (s < -1.1) P(x, y, css(LAVA[1])); }
    else if (s > 1.3) P(x, y, css(CREAM));
    else if (s < -1.4) P(x, y, css(WATER[2]));
  }
  // lava: crust plates drifting, a bubble now and then
  if (z === 4) for (let i = 0; i < liq.length; i += 3 * 11) {
    const x0 = liq[i], y = liq[i + 1];
    const x = x0 + ((t * 2 + hash(x0, 1, 3) * 20) % 10) - 5;
    P(x, y + 1, css(INK2), 3, 1); P(x + 1, y, css(LAVA[0]), 2, 1);
    const ph = (t * 0.7 + hash(x0, 2, 3) * 5) % 5;
    if (ph < 0.3) { P(x0 + 4, y - 1, css(LAVA[4]), 2, 1); P(x0 + 3, y, css(LAVA[3]), 4, 1); }
  }
  // falls: a lava fall, a seep of water
  for (const f of A.falls) {
    const lava = f.kind === 'lava';
    for (let y = f.y0; y < f.y1; y++) {
      const k = ((y * 0.5 - t * (lava ? 10 : 16)) % 4 + 4) % 4;
      if (lava) { P(f.x - 1, y, k < 1 ? css(LAVA[4]) : css(LAVA[3])); P(f.x, y, k < 2 ? css(LAVA[3]) : css(LAVA[2])); P(f.x + 1, y, css(LAVA[1])); }
      else if (k < 1.4) P(f.x, y, css(WATER[3]));
    }
    for (let k = 0; k < 3; k++) { const a = t * 3 + k * 2.1; P(f.x + Math.sin(a) * 3, f.y1 - 1 - Math.abs(Math.cos(a)) * 2, lava ? css(LAVA[4]) : css(CREAM)); }
    if (lava) drawGlow(ctx, f.x, (f.y0 + f.y1) / 2 + oy, LAVA[2], 10, 0.35 + 0.08 * Math.sin(t * 5));
  }
  // glows: lamps, glowcaps, crystals (few, earned)
  for (const g of A.glows) drawGlow(ctx, g.x, g.y + oy, g.c, g.r * 1.6, g.f * (0.65 + 0.35 * Math.sin(t * 1.8 + (g.pulse || 0) * 6.28)));
  // rare glints on known ore and crystal
  for (const g of A.glints) {
    const k = (t * 0.16 + g.ph * 7) % 2.4;
    if (k > 0.14) continue;
    const r = 1, c = css(mix(g.c, CREAM, 0.5));
    P(g.x, g.y, css(CREAM));
    for (let i = 1; i <= r; i++) { P(g.x - i, g.y, c); P(g.x + i, g.y, c); P(g.x, g.y - i, c); P(g.x, g.y + i, c); }
  }
  // drips: swell at the tip, fall, splash
  for (const d of A.drips) {
    const per = 2.6 / d.sp, tt = (t + d.ph * per) % per;
    const fall = R.floorTop[clamp(d.x, 0, W - 1)] - d.y;
    const tf = Math.sqrt(Math.max(1, fall) / 60);
    const c = d.ice ? css(CREAM) : css(WATER[3]);
    if (tt < 0.7) { if (tt > 0.25) P(d.x, d.y, c); }
    else if (tt < 0.7 + tf) { const y = d.y + 60 * (tt - 0.7) * (tt - 0.7); P(d.x, y, c, 1, 2); }
    else if (tt < 0.7 + tf + 0.22) { const y = d.y + fall, k = (tt - 0.7 - tf) / 0.22; P(d.x - 1 - k * 2, y - 1 - (k < 0.5 ? 1 : 0), c); P(d.x + 1 + k * 2, y - 1 - (k < 0.5 ? 1 : 0), c); }
  }
  // spores drifting up from the glowcaps
  for (const s of A.spores) for (let k = 0; k < 4; k++) {
    const per = 5 + k, tt = ((t + k * 1.3 + s.x * 0.01) % per) / per;
    const x = s.x + Math.sin(tt * 6 + k) * 3 + tt * 4, y = s.y - tt * 26;
    if (tt < 0.85) P(x, y, tt < 0.5 ? '#c8f0e0' : '#7ab8b0');
  }
  // embers over the lava, snow from the cracks
  if (z === 4) for (let i = 0; i < W / 28; i++) {
    const h1 = hash(i, 4, 91), h2 = hash(i, 4, 92), per = 3 + h2 * 3, k = ((t / per) + h1) % 1;
    const x0 = Math.round(h1 * W), x = x0 + Math.sin(t * 2 + i) * 2, y = R.floorTop[clamp(x0, 0, W - 1)] - 2 - k * 40;
    if (k < 0.9) P(x, y, k < 0.4 ? css(LAVA[4]) : k < 0.7 ? css(LAVA[3]) : css(LAVA[1]));
  }
  if (z === 5) for (let i = 0; i < W / 16; i++) {
    const h1 = hash(i, 5, 91), h2 = hash(i, 5, 92), per = 8 + h2 * 6, k = ((t / per) + h1) % 1;
    const x0 = Math.round(h1 * W), top = R.ceilBot[clamp(x0, 0, W - 1)], bot = R.floorTop[clamp(x0, 0, W - 1)];
    P(x0 + Math.sin(t * 0.9 + i) * 3, top + k * (bot - top), h2 > 0.7 ? css(CREAM) : '#b8c8d0');
  }
  // the Core's floating rocks
  for (const f of A.floaters) {
    const y = f.y + Math.round(Math.sin(t * 0.7 + f.ph * 6.28) * 2);
    for (let j = 0; j < f.w * 2; j++) for (let i = -f.w * 2 + j; i <= f.w * 2 - j; i++) P(f.x + i, y + j, j === 0 ? (i < 0 ? '#8a6aa8' : '#5e3e7a') : i === f.w * 2 - j ? css(INK) : j === 1 ? '#4a2a6a' : '#2e1a44');
  }
  // the old mine's lamps and the lift cages' lamps flicker
  for (const l of A.lamps) lampFlame(ctx, l.x, l.y + oy - 2, t, l.x);
  for (const s of A.cages) if (s.open) { lampFlame(ctx, s.lx, s.ly + oy + 1, t, s.lx); }
  // plants and creatures
  for (const p of A.plants) drawPlant(ctx, p, R.floorTop[clamp(p.x, 0, W - 1)] + oy, R.ceilBot[clamp(p.x, 0, W - 1)] + oy, t);
  for (const c of A.critters) drawCritter(ctx, c, sec, t, oy);
}

/** A lamp's flame: two pixels that flicker, a small banded glow. */
function lampFlame(ctx, x, y, t, seed) {
  const f = 0.75 + 0.25 * Math.sin(t * 11 + seed) * Math.sin(t * 7.3 + seed * 2);
  pxl(ctx, x, y, f > 0.85 ? css(LAMP[3]) : css(LAMP[2]));
  drawGlow(ctx, x, y, LAMP[2], 9, 0.32 * f);
}

const PL = {
  cave_carrot: ['..g.g', '.g2g.', '..o..', '..o..'], glowcap: ['.hh.', 'hmmd', '.s..', '.s..'], blindfern: ['f.f.f', '.fff.', 'f.f.f', '..f..'],
  whisperweed: ['v.v.v', 'v.v.v', '.vvv.', '..v..'], pepperroot: ['.r.r', 'rRrR', '.gg.', '..g.'], sparkmoss: ['.c..c', 'gggg.', 'g22gg'],
  bubblebulb: ['.b.', 'bwb', 'bbb', '.g.'], crystal_lily: ['.w.', 'c.c', '.c.', '.g.'], gloomshroom: ['.pp.', 'pPPp', '.s..', '.s..'],
  ashfern: ['a.a.a', '.aaa.', 'a.a.a', '..a..'], emberbloom: ['.e.', 'eEe', '.g.', '.g.'], truffle: ['.tt.', 'tTtt'], frostbloom: ['.w.', 'iwi', '.i.', '.g.'],
  core_lotus: ['p.w.p', 'ppwpp', '.ppp.', '..g..'],
};
const PLC = { g: 0x6e943a, 2: 0xa8b45a, o: 0xe0803a, h: 0xd4f4e4, m: 0x6ec8d0, d: 0x1e3a5a, s: 0xc4b498, f: 0xb4c09a, v: 0x9a86b8, r: 0xc8402a, R: 0xec7a50, c: 0xc8f0e0, b: 0x6ec8c0, w: CREAM, p: 0x8a5ab0, P: 0x5a3a7a, a: 0x8a8480, e: 0xec7c2a, E: LAMP[3], t: 0x6a4a30, T: 0x8a6a48, i: 0x9cc8dc };
function drawPlant(ctx, p, fy, cy, t) {
  const rows = PL[p.id];
  if (!rows) return;
  const sw = Math.round(Math.sin(t * 1.3 + p.ph * 6.28) * 0.7);
  const h = rows.length, w = rows[0].length;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ch = rows[j][i];
    if (ch === '.') continue;
    const x = p.x - (w >> 1) + i + (j < h - 2 ? sw : 0), y = fy - h + j;
    pxl(ctx, x + 1, y, css(INK)); // a shadow edge on the right
    pxl(ctx, x, y, css(PLC[ch] ?? 0x6e943a));
  }
  if (p.id === 'glowcap' || p.id === 'crystal_lily' || p.id === 'emberbloom' || p.id === 'core_lotus') drawGlow(ctx, p.x, fy - h + 1, p.id === 'emberbloom' ? LAVA[2] : p.id === 'core_lotus' ? 0xc8a8e8 : 0x6ec8d0, 5, 0.25 + 0.1 * Math.sin(t * 2 + p.ph * 6));
  void cy;
}

function drawCritter(ctx, c, sec, t, oy) {
  const W = sec.W, R = sec.art;
  const fT = (x) => R.floorTop[clamp(Math.round(x), 0, W - 1)] + oy;
  const cB = (x) => R.ceilBot[clamp(Math.round(x), 0, W - 1)] + oy;
  const ph = t * c.sp * 0.22 + c.ph * 6.28;
  const dir = Math.cos(ph) >= 0 ? 0 : 1;
  const x = clamp(c.x + Math.sin(ph) * c.range, 4, W - 6);
  const frames = c.frames;
  if (!frames.length) return;
  const fr = frames[Math.floor(t * (c.mv === 'fly' ? 6 : 3) + c.ph * 10) % frames.length][dir];
  const w = fr.width, h = fr.height;
  let X = x - w / 2, Y;
  if (!c.known) {
    // a lurker: a silhouette in a dark spot, eyes that blink (the eyes are in the sprite)
    Y = fT(c.x) - h + 1;
    X = c.x - w / 2 + Math.round(Math.sin(t * 0.3 + c.ph * 6) * c.range);
    ctx.drawImage(fr, Math.round(X), Math.round(Y));
    if (((t * 0.5 + c.ph * 5) % 4) < 0.15) pxl(ctx, X + 1, Y + 1, css(INK2), w - 2, 3); // blink: the eyes go dark
    return;
  }
  if (c.mv === 'fly') {
    const top = cB(x) + 6, bot = fT(x) - 10;
    Y = top + (bot - top) * (0.3 + 0.25 * Math.sin(t * 0.8 + c.ph * 6)) + Math.sin(t * 5 + c.ph) * 1.5;
  } else if (c.mv === 'hang') {
    const top = cB(c.x), drop = 10 + Math.sin(t * 0.7 + c.ph * 6) * 6;
    X = c.x - w / 2;
    for (let y = top; y < top + drop; y++) pxl(ctx, c.x, y, '#c8bcb0');
    Y = top + drop;
  } else if (c.mv === 'swim') Y = c.y + oy - h / 2 + Math.sin(t * 2 + c.ph * 6);
  else if (c.mv === 'lava') Y = c.y + oy - h + 2 + (Math.sin(t * 0.9 + c.ph * 6) > 0.4 ? 3 : 0);
  else if (c.mv === 'hop') Y = fT(x) - h + 1 - Math.round(Math.abs(Math.sin(t * 3 + c.ph * 6)) * 4);
  else if (c.mv === 'float') Y = (fT(c.x) + cB(c.x)) / 2 + Math.sin(t * 1.3 + c.ph * 6) * 6;
  else if (c.mv === 'swarm') { for (let k = 0; k < 5; k++) { const a = t * 3 + k * 1.25; ctx.drawImage(fr, Math.round(c.x + Math.cos(a) * 5), Math.round(fT(c.x) - 10 + Math.sin(a * 1.4) * 3)); } return; }
  else if (c.mv === 'still') { X = c.x - w / 2; Y = fT(c.x) - h + 1; }
  else Y = fT(x) - h + 1 - (Math.floor(t * 4 + c.ph * 9) % 2);
  ctx.drawImage(fr, Math.round(X), Math.round(Y));
}

// ------------------------------------------------------------------ the town cage
let cageCv = null;
export function cageSprite() {
  if (cageCv) return cageCv;
  const a = new Art(24, 22);
  cage(a, 11, 20, true);
  cageCv = a.commit();
  return cageCv;
}

// ------------------------------------------------------------------ per frame: the top
const cloudCache = new Map();
function cloudSprite(w, seed) {
  const key = w + ':' + seed;
  if (cloudCache.has(key)) return cloudCache.get(key);
  const W = w * 2 + 6, H = 9, a = new Art(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = (i - W / 2) / (w + 2), v = (j - 6) / 4.5;
    const lump2 = Math.sin(i * 0.7 + seed) * 0.12 + Math.sin(i * 0.31 + seed * 2) * 0.1;
    if (u * u + (v < 0 ? v * v * (1 + lump2 * 3) : v * v * 4) > 1) continue;
    a.p(i, j, j >= 7 ? 0xb8a8a4 : j < 3 && u < 0.2 ? CREAM : 0xe8d8c4);
  }
  for (let i = 0; i < W; i++) if ((i % 4) === 1 && a.a(i, 5)) a.p(i, 5, 0xd2c2b0); // a carved line through it
  const cv = a.commit();
  cloudCache.set(key, cv);
  return cv;
}
export function drawSky(ctx, sec, t, oyBack) {
  const W = sec.W;
  for (const c of sec.art.anim.clouds) {
    const cv = cloudSprite(Math.round(c.w), c.seed);
    const x = ((c.x + t * c.sp) % (W + cv.width * 2)) - cv.width;
    ctx.drawImage(cv, Math.round(x), Math.round(c.y + oyBack));
  }
}
export function drawTopAnim(ctx, sec, t, oy) {
  const A = sec.art.anim;
  const P = (x, y, c, w, h) => pxl(ctx, x, y + oy, c, w, h);
  // the hearth fire
  for (const f of A.fires) {
    for (let i = -(f.w >> 1); i <= f.w >> 1; i++) {
      const hgt = 2 + Math.round((Math.sin(t * 9 + i * 1.7) + Math.sin(t * 13 + i)) * 0.9 + 1.5) - (Math.abs(i) > 2 ? 1 : 0);
      for (let j = 0; j < hgt; j++) P(f.x + i, f.y - j, j === hgt - 1 ? css(LAMP[1]) : j > hgt / 2 ? css(LAMP[2]) : css(LAMP[3]));
    }
    drawGlow(ctx, f.x, f.y + oy - 3, LAMP[2], 12, 0.4 + 0.1 * Math.sin(t * 10));
    for (let k = 0; k < 2; k++) { const tt = (t * 0.8 + k / 2) % 1; P(f.x + Math.sin(k * 3 + t * 2) * 2, f.y - 4 - tt * 8, tt < 0.6 ? css(LAMP[3]) : css(LAMP[1])); }
  }
  // chimney smoke: carved puffs that rise, lean and thin out
  for (const s of A.smoke) for (let k = 0; k < 4; k++) {
    const tt = (t * (s.big ? 0.16 : 0.22) + k / 4 + (s.ph || 0)) % 1;
    const x = s.x + tt * 10 + Math.sin(tt * 5 + t * 0.6) * 1.5, y = s.y - tt * (s.big ? 30 : 18);
    const r = 1 + Math.round(tt * (s.big ? 3 : 2));
    if (tt > 0.85) continue;
    ctx.globalAlpha = 0.85 - tt * 0.6;
    P(x - r, y - r + 1, '#cfc4c0', r * 2, r * 2 - 1); P(x - r + 1, y - r, '#e8ded4', r * 2 - 2, 1); P(x - r + 1, y + r - 1, '#a89aa0', r * 2 - 1, 1);
    ctx.globalAlpha = 1;
  }
  // windows breathe, the string of lamps twinkles, lamps flicker
  for (const w of A.windows) if (Math.sin(t * 0.9 + w.ph * 20) > 0.6) P(w.x, w.y, css(LAMP[3]));
  for (const l of A.lights) {
    const on = Math.sin(t * 1.7 + l.blink * 30) > -0.7;
    P(l.x, l.y, on ? css(LAMP[3]) : css(LAMP[1]));
    if (on) drawGlow(ctx, l.x, l.y + oy, LAMP[2], 3, 0.35);
  }
  for (const l of A.lamps) lampFlame(ctx, l.x, l.y + oy - 2, t, l.x);
}

// ------------------------------------------------------------------ per frame: the core
export function drawCoreAnim(ctx, sec, t, oy) {
  const W = sec.W, H = sec.H;
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
  drawGlow(ctx, W / 2, oy + H + 6, 0xc488b8, 40, 0.12 + pulse * 0.12);
  for (let i = 0; i < W / 14; i++) {
    const h1 = hash(i, 7, 1), h2 = hash(i, 8, 1), k = ((t / (4 + h2 * 3)) + h1) % 1;
    const x = W / 2 + (h1 - 0.5) * W * 0.7 * (1 - k * 0.3) + Math.sin(t * 2 + i) * 2, y = oy + H - k * (H - 26);
    if (k < 0.85) pxl(ctx, x, y, k < 0.4 ? css(CREAM) : k < 0.7 ? '#ecc4c4' : '#8a52a0');
  }
}

/** The mole with his lamp: "you are here". */
export function drawMole(ctx, x, fy, t) {
  const b = Math.round(Math.abs(Math.sin(t * 3)) * 1);
  const y = fy - 9 - b;
  drawGlow(ctx, x + 6, y + 1, LAMP[2], 8, 0.4 + 0.08 * Math.sin(t * 9));
  const rows = ['...yy...', '..0000..', '.033330.', '03311220', '031e1pp0', '03311220', '.033330.', '..0..0..', '.00..00.'];
  const pal = { y: css(LAMP[3]), 0: css(INK), 3: '#4a3446', 1: '#6a5266', 2: '#8a7088', e: css(CREAM), p: '#e89aa8' };
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) { const ch = rows[j][i]; if (ch !== '.') pxl(ctx, x - 3 + i, y + j, pal[ch]); }
}

// What moves in the cross-section, drawn each frame over the painted sections, pixel by pixel (no
// glows, no soft light): water and lava surfaces swapping between their two hand-drawn frames, drips
// that swell, fall and splash, lamp flames flickering between two colours, spores drifting up from the
// glowcaps, the lava fall, floating rocks bobbing, a rare glint on known ore, the creatures you've
// recorded walking and flying (the ones you haven't: a plum silhouette with two eyes), the hearth
// fire, chimney smoke, clouds, the town's window lights and string of lamps, the town cage riding its
// shaft, and the mole with his lamp ("you are here").
import { clamp } from '../../core/util.js';
import { CREATURES } from '../../data/creatures.js';
import { Art, PAL, INK, CREAM, hash, css, palFor } from './kit.js';
import { WATER_TOP, LAVA_TOP, SPR } from './tiles.js';

const pxl = (ctx, x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
const sprCache = new Map();
/** A pixel map as a small canvas (cached). */
function sprite(key, rows, pal, flip = false) {
  const k = key + (flip ? ':f' : '');
  if (sprCache.has(k)) return sprCache.get(k);
  const a = new Art(Math.max(...rows.map((r) => r.length)), rows.length);
  a.stamp(0, 0, rows, pal, 4, flip);
  const cv = a.commit();
  sprCache.set(k, cv);
  return cv;
}

// ------------------------------------------------------------------ creatures (hand-made sprites, recoloured)
const MOVE = {
  earthworm: 'worm', dust_bunny: 'hop', mole_cricket: 'walk', cave_bat: 'fly', rock_crab: 'walk', ore_slug: 'walk', glow_beetle: 'fly',
  spark_mite: 'swarm', crystal_spider: 'hang', blind_fish: 'swim', lava_newt: 'lava', ember_moth: 'fly', frost_shrimp: 'swim', gem_tortoise: 'walk',
  void_wisp: 'float', pebble_mimic: 'still', spore_puffer: 'hop', shade_bat: 'fly', rubble_golem: 'walk', gloom_wisp: 'float', crystal_wyrm: 'walk',
  ember_imp: 'walk', crystal_golem: 'walk', kobold: 'walk', cave_troll: 'walk', cave_spider: 'hang', cave_slime: 'hop', ruin_wraith: 'float',
  cave_drake: 'walk', raptor: 'walk', tyrant: 'walk', shellback: 'walk', pterosaur: 'fly',
};
// facing right: 1 body, 2 light, 3 dark, e eye, w white, y yellow
const CRIT = {
  bat: [['3.......3', '33.1.1.33', '.3311133.', '...1e1...', '....1....'], ['...1.1...', '..31113..', '.3311133.', '33.1e1.33', '3.......3']],
  crab: [['2.......2', '13.....31', '.1.e.e.1.', '.3222223.', '3.3.3.3.3'], ['.2.....2.', '.13...31.', '.1.e.e.1.', '.3222223.', '.3.3.3.3.']],
  cricket: [['.....33.', '..1111e.', '.122221.', '3.3..3.3'], ['....3..3', '..1111e.', '.122221.', '.3.3.3..']],
  bunny: [['..2.2.', '..1.1.', '.2222e', '211111', '.1111.'], ['...2.2', '..1.1.', '.2222e', '211111', '1....1']],
  spider: [['3.....3', '.3.1.3.', '3.111.3', '.3e1e3.', '3.....3']],
  spiderBig: [['3.......3', '.3..1..3.', '3.31113.3', '.3111113.', '3.1e1e1.3', '.3.....3.']],
  tortoise: [['..22222...', '.2211122..', '2211111221', '.33333331e', '.1.1..1.1.']],
  golem: [['..2222..', '.21e1e1.', '.211111.', '22333322', '21.11.12', '2..11..2', '..1..1..', '.22..22.']],
  troll: [['...222...', '..21e12..', '..2111w..', '.2211122.', '21.111.12', '1..111..1', '...1.1...', '..33.33..']],
  humanoid: [['.y..', '222.', '1e1.', '111.', '3113', '.11.', '1..1']],
  imp: [['3..3', '2222', '1e1e', '1111', '.11.', '1..1']],
  wraith: [['.222.', '22222', '2e2e2', '22222', '12121', '1.1.1', '.1..1']],
  raptor: [['........222', '.......2e22', '.......11..', '3.....111..', '.31111111..', '..33111.1..', '....1..1...', '....3..33..'], ['........222', '.......2e22', '.......11..', '......111..', '331111111..', '..33111.1..', '....1.1....', '...33.3....']],
  tyrant: [['.........2222.', '........22e222', '........2wwww.', '.......1112...', '3.....11111...', '.3311111111...', '...3311111.1..', '.....11..1....', '.....1...1....', '....33..33....']],
  shellback: [['...2.2.2.2..', '..22222222..', '.2233333322.', '3.11111111e1', '..1.1..1.1..']],
  drake: [['....2.......', '...22.....22', '..2221...2e2', '.3211111111.', '3..11111.1..', '...1.1..1...', '..33.3..33..']],
  ptero: [['2...........2', '22.........22', '.222.111.222.', '...221e122...', '.......2.....'], ['.............', '.....111.....', '..222.1e2222.', '.22.......22.', '2...........2']],
  newt: [['......2.', '31111e1.', '.1..1...']],
  moth: [['2...2', '22122', '.2e2.', '2.1.2'], ['.....', '22122', '22e22', '..1..']],
  shrimp: [['.1....', '..122e', '3.1111', '.3.3.3']],
  mimic: [['..2222.', '.21e1e2', '3111111']],
  puffer: [['.2.2.', '21112', '1e1e1', '21112', '.2.2.']],
  beetle: [['.33.', '1e11', '2222', '.22.']],
  worm: [['..1111.', '.122221', '1.....e'], ['.1111..', '1222211', 'e.....1']],
  slug: [['....2.2.', '...2112.', '.122221.', '1111111.']],
  slime: [['..222..', '.21112.', '21e1e12', '1111111']],
  fish: [['..222...', '3.21112e', '33111111', '3.1111..']],
  wisp: [['.2.', '2e2', '.1.', '1.1']],
  mite: [['1.1', '.e.', '1.1']],
};
const CRIT_OF = {
  cave_bat: 'bat', shade_bat: 'bat', rock_crab: 'crab', mole_cricket: 'cricket', dust_bunny: 'bunny', crystal_spider: 'spider', cave_spider: 'spiderBig',
  gem_tortoise: 'tortoise', rubble_golem: 'golem', crystal_golem: 'golem', cave_troll: 'troll', kobold: 'humanoid', ember_imp: 'imp', ruin_wraith: 'wraith',
  raptor: 'raptor', tyrant: 'tyrant', shellback: 'shellback', cave_drake: 'drake', pterosaur: 'ptero', lava_newt: 'newt', ember_moth: 'moth',
  frost_shrimp: 'shrimp', pebble_mimic: 'mimic', spore_puffer: 'puffer', glow_beetle: 'beetle', earthworm: 'worm', ore_slug: 'slug', cave_slime: 'slime',
  blind_fish: 'fish', void_wisp: 'wisp', gloom_wisp: 'wisp', spark_mite: 'mite', crystal_wyrm: 'drake',
};
const mixc = (a, b, t) => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t), g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t), bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return ((r << 16) | (g << 8) | bl) >>> 0;
};
const frameCache = new Map();
/** A creature's frames, facing right and left: its own colour in three steps and a plum outline, or (unknown) a silhouette with eyes. */
function critterFrames(id, known) {
  const key = id + (known ? '' : ':?');
  if (frameCache.has(key)) return frameCache.get(key);
  const c0 = CREATURES[id]?.color ?? 0xa08870;
  const pal = known ? { 1: c0, 2: mixc(c0, CREAM, 0.4), 3: mixc(c0, INK, 0.5), e: CREAM, w: CREAM, y: PAL.Y } : { 1: PAL.K, 2: 0x4a2c40, 3: INK, e: PAL.Y, w: PAL.K, y: PAL.K };
  const frames = [];
  for (const rows of CRIT[CRIT_OF[id]] || []) {
    const pair = [false, true].map((flip) => {
      const h = rows.length, w = Math.max(...rows.map((r) => r.length));
      const a = new Art(w + 2, h + 2);
      for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
        if (rows[j][i] === '.') continue;
        const x = flip ? w - 1 - i : i;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!a.a(x + 1 + dx, j + 1 + dy)) a.p(x + 1 + dx, j + 1 + dy, INK);
      }
      for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) { const ch = rows[j][i]; if (ch !== '.') a.p((flip ? w - 1 - i : i) + 1, j + 1, pal[ch] ?? pal[1]); }
      return a.commit();
    });
    frames.push(pair);
  }
  frameCache.set(key, frames);
  return frames;
}

/** Where a layer's life goes: known creatures roam the floor (or fly, swim, hang), up to three unknown ones lurk, known plants grow by the walls. */
export function placeLife(L, R, rng) {
  const { W } = L;
  const anim = R.anim;
  const known = L.finds.crit.filter((c) => c.e), unknown = L.finds.crit.filter((c) => !c.e);
  const list = known.map((c) => ({ c, kn: true })).concat(unknown.slice(0, 3).map((c) => ({ c, kn: false })));
  const span = (kind) => { const l = anim.liquid.filter((q) => q.kind === kind && q.y >= 88); return l.length ? { x0: Math.min(...l.map((q) => q.x)), x1: Math.max(...l.map((q) => q.x)) + 8, y: l[0].y } : null; };
  const ws = span('water'), ls = span('lava');
  const x0 = 20, x1 = Math.min(W - 12, 300);
  list.forEach(({ c, kn }, k) => {
    const mv = MOVE[c.id] || 'walk';
    const o = { id: c.id, known: kn, mv, x: clamp(Math.round(x0 + ((k + 0.5) / list.length) * (x1 - x0) + rng.range(-8, 8)), 16, W - 12), frames: critterFrames(c.id, kn), ph: rng(), sp: 0.5 + rng() * 0.6, range: kn ? rng.range(8, 20) : 0 };
    if (mv === 'swim' && ws) { o.x = (ws.x0 + ws.x1) / 2; o.range = Math.max(2, (ws.x1 - ws.x0) / 2 - 6); o.y = ws.y + 4; }
    if (mv === 'lava' && ls) { o.x = (ls.x0 + ls.x1) / 2; o.range = Math.max(2, (ls.x1 - ls.x0) / 2 - 6); o.y = ls.y; }
    anim.critters.push(o);
  });
  L.finds.plants.filter((p) => p.e).forEach((p, k, all) => {
    const x = clamp(Math.round(28 + ((k + 0.5) / all.length) * (Math.min(W, 300) - 50) + rng.range(-10, 10)), 20, W - 10);
    if (R.floorTop[x] !== R.floorTop[x + 3] || anim.liquid.some((q) => x >= q.x - 3 && x <= q.x + 10)) return;
    anim.plants.push({ id: p.id, x, ph: rng() });
  });
}

const PLANT = {
  cave_carrot: ['..G.G', '.GgG.', '..o..', '..o..'], glowcap: ['.bb.', 'bxxX', '.C..', '.C..'], blindfern: ['e.e.e', '.eEe.', 'e.E.e', '..E..'],
  whisperweed: ['v.v.v', 'V.v.V', '.VvV.', '..u..'], pepperroot: ['.r.r', 'rRrR', '.GG.', '..G.'], sparkmoss: ['.x..x', 'GGGG.', 'GhgGG'],
  bubblebulb: ['.b.', 'bcb', 'bBb', '.G.'], crystal_lily: ['.c.', 'b.b', '.b.', '.G.'], gloomshroom: ['.VV.', 'VuuV', '.C..', '.C..'],
  ashfern: ['S.S.S', '.SsS.', 'S.S.S', '..S..'], emberbloom: ['.p.', 'pYp', '.G.', '.G.'], truffle: ['.mm.', 'mAmm'], frostbloom: ['.c.', 'bcb', '.b.', '.G.'],
  core_lotus: ['V.c.V', 'VVcVV', '.VVV.', '..G..'],
};

// ------------------------------------------------------------------ per frame: a layer
export function drawLayerAnim(ctx, sec, t, oy) {
  const A = sec.art.anim, W = sec.W, R = sec.art;
  const P = (x, y, c, w, h) => pxl(ctx, x, y + oy, c, w, h);
  const pal = palFor(sec.z);
  // water and lava: their surfaces swap between two hand-drawn frames, cell by cell, out of step
  for (const q of A.liquid) {
    if (!(Math.floor(t * 1.6 + q.x * 0.07) & 1)) continue;
    const f = (q.kind === 'lava' ? LAVA_TOP : WATER_TOP)[1];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 8; i++) P(q.x + i, q.y + j, css(pal[f[j][i]]));
  }
  for (const q of A.liquid) if (q.kind === 'lava' && ((t * 0.5 + hash(q.x, 1, 3) * 7) % 3.5) < 0.25) { P(q.x + 3, q.y - 1, css(PAL.y), 2, 1); P(q.x + 2, q.y, css(PAL.Y), 4, 1); }
  // the lava fall: its pixels run down
  for (const f of A.falls) {
    for (let y = f.y0 + 2; y < f.y1; y++) {
      const k = ((((y - t * 14) % 4) + 4) % 4) | 0;
      P(f.x, y, css([PAL.y, PAL.Y, PAL.p, PAL.Y][k])); P(f.x + 1, y, css([PAL.Y, PAL.p, PAL.p, PAL.P][k])); P(f.x + 2, y, css(PAL.P));
    }
    const s = Math.floor(t * 6) % 3;
    P(f.x - 1 + s, f.y1 - 2, css(PAL.y)); P(f.x + 3 - s, f.y1 - 1, css(PAL.Y));
  }
  // drips: swell at the tip, fall, splash
  for (const d of A.drips) {
    const per = 2.8 / d.sp, tt = (t + d.ph * per) % per;
    const fall = R.floorTop[clamp(d.x, 0, W - 1)] - d.y;
    if (fall < 4) continue;
    const tf = Math.sqrt(fall / 60);
    const c = d.ice ? css(CREAM) : css(PAL.b);
    if (tt < 0.8) { if (tt > 0.35) P(d.x, d.y, c); }
    else if (tt < 0.8 + tf) P(d.x, d.y + 60 * (tt - 0.8) * (tt - 0.8), c, 1, 2);
    else if (tt < 0.8 + tf + 0.2) { const y = d.y + fall - 1, k = tt - 0.8 - tf < 0.1 ? 1 : 2; P(d.x - k, y - (k === 1 ? 1 : 0), c); P(d.x + k, y - (k === 1 ? 1 : 0), c); }
  }
  // spores drifting up from the glowcaps
  for (const s of A.spores) for (let k = 0; k < 3; k++) {
    const per = 5 + k * 1.5, tt = ((t + k * 1.7 + s.x * 0.03) % per) / per;
    if (tt < 0.8) P(s.x + Math.round(Math.sin(tt * 6 + k) * 2 + tt * 3), s.y - tt * 22, css(tt < 0.4 ? PAL.b : PAL.x));
  }
  for (const f of A.floaters) ctx.drawImage(sprite('floater' + sec.z, SPR.floater, pal), f.x - 4, Math.round(f.y + oy + Math.sin(t * 0.8 + f.ph * 6.28) * 1.5));
  // a rare glint on known ore and crystal
  for (const g of A.glints) {
    const k = (t * 0.15 + g.ph * 7) % 2.6;
    if (k > 0.12) continue;
    P(g.x, g.y, css(CREAM));
    if (k > 0.03 && k < 0.09) { P(g.x - 1, g.y, css(PAL.y)); P(g.x + 1, g.y, css(PAL.y)); P(g.x, g.y - 1, css(PAL.y)); P(g.x, g.y + 1, css(PAL.y)); }
  }
  for (const l of A.lamps) flame(ctx, l.x, l.y + oy, t);
  for (const s of A.cages) if (s.open) flame(ctx, s.lx, s.ly + oy, t);
  for (const p of A.plants) {
    const rows = PLANT[p.id];
    if (!rows) continue;
    ctx.drawImage(sprite('pl:' + p.id, rows, PAL), p.x - 2, R.floorTop[clamp(p.x, 0, W - 1)] + oy - rows.length);
  }
  for (const c of A.critters) critter(ctx, c, sec, t, oy);
}

function flame(ctx, x, y, t) {
  const f = Math.sin(t * 9 + x) * Math.sin(t * 5.3 + x * 2);
  pxl(ctx, x, y, css(f > 0.3 ? PAL.y : f < -0.5 ? PAL.o : PAL.Y));
}

function critter(ctx, c, sec, t, oy) {
  const W = sec.W, R = sec.art;
  if (!c.frames.length) return;
  const fT = (x) => R.floorTop[clamp(Math.round(x), 0, W - 1)] + oy;
  const cB = (x) => R.ceilBot[clamp(Math.round(x), 0, W - 1)] + oy;
  const ph = t * c.sp * 0.22 + c.ph * 6.28;
  const dir = Math.cos(ph) >= 0 ? 0 : 1;
  const x = clamp(c.x + Math.sin(ph) * c.range, 4, W - 6);
  const fr = c.frames[Math.floor(t * (c.mv === 'fly' ? 6 : 3) + c.ph * 10) % c.frames.length][dir];
  const w = fr.width, h = fr.height;
  let X = x - w / 2, Y;
  if (!c.known) {
    X = c.x - w / 2; Y = fT(c.x) - h + 1;
    ctx.drawImage(fr, Math.round(X), Math.round(Y));
    if (((t * 0.4 + c.ph * 5) % 4) < 0.15) pxl(ctx, X + 1, Y + 1, css(PAL.K), w - 2, Math.min(3, h - 2));
    return;
  }
  if (c.mv === 'fly') { const top = cB(x) + 5, bot = fT(x) - 12; Y = top + Math.round((bot - top) * (0.35 + 0.25 * Math.sin(t * 0.8 + c.ph * 6))); }
  else if (c.mv === 'hang') { const top = cB(c.x), drop = 8 + Math.round(Math.sin(t * 0.7 + c.ph * 6) * 4); X = c.x - w / 2; for (let y = top; y < top + drop; y++) pxl(ctx, c.x, y, css(PAL.C)); Y = top + drop; }
  else if (c.mv === 'swim' && c.y != null) Y = c.y + oy - h / 2 + 2;
  else if (c.mv === 'lava' && c.y != null) Y = c.y + oy - h + 2 + (Math.sin(t * 0.9 + c.ph * 6) > 0.4 ? 2 : 0);
  else if (c.mv === 'hop') Y = fT(x) - h + 1 - (Math.sin(t * 3 + c.ph * 6) > 0.5 ? 2 : 0);
  else if (c.mv === 'float') Y = (fT(c.x) + cB(c.x)) / 2 + Math.round(Math.sin(t * 1.1 + c.ph * 6) * 3);
  else if (c.mv === 'swarm') { for (let k = 0; k < 4; k++) { const a = t * 2.5 + k * 1.6; ctx.drawImage(fr, Math.round(c.x + Math.cos(a) * 4), Math.round(fT(c.x) - 10 + Math.sin(a * 1.3) * 2)); } return; }
  else if (c.mv === 'still') { X = c.x - w / 2; Y = fT(c.x) - h + 1; }
  else Y = fT(x) - h + 1;
  ctx.drawImage(fr, Math.round(X), Math.round(Y));
}

/** The town cage that rides the shaft. */
export function cageSprite() { return sprite('cage', SPR.cageOpen, palFor(1)); }

// ------------------------------------------------------------------ per frame: the top
export function drawSky(ctx, sec, t, oyBack) {
  const W = sec.W;
  for (const c of sec.art.anim.clouds) {
    const cv = sprite(c.big ? 'cloud' : 'cloud2', c.big ? SPR.cloud : SPR.cloud2, PAL);
    const x = ((c.x + t * c.sp) % (W + cv.width * 2)) - cv.width;
    ctx.drawImage(cv, Math.round(x), Math.round(c.y + oyBack));
  }
}
export function drawTopAnim(ctx, sec, t, oy) {
  const A = sec.art.anim;
  const fi = Math.floor(t * 7) % 3;
  for (const f of A.fires) ctx.drawImage(sprite('fire' + fi, SPR.fire[fi], PAL), f.x, f.y + oy - 1);
  for (const s of A.smoke) for (let k = 0; k < 3; k++) {
    const tt = (t * (s.big ? 0.14 : 0.2) + k / 3) % 1;
    if (tt > 0.8) continue;
    const big = tt > 0.35 ? 1 : 0;
    ctx.drawImage(sprite('puff' + big, SPR.puff[big], PAL), Math.round(s.x + tt * 9 - 2), Math.round(s.y + oy - tt * (s.big ? 26 : 16)));
  }
  for (const w of A.windows) if (Math.sin(t * 0.8 + w.x * 1.3) > 0.7) pxl(ctx, w.x, w.y + oy, css(PAL.y));
  for (const l of A.lights) pxl(ctx, l.x, l.y + oy, css(Math.sin(t * 1.5 + l.ph) > -0.6 ? PAL.y : PAL.o));
  for (const l of A.lamps) flame(ctx, l.x, l.y + oy, t);
}

// ------------------------------------------------------------------ per frame: the core
export function drawCoreAnim(ctx, sec, t, oy) {
  const A = sec.art.anim, W = sec.W, H = sec.H;
  for (const f of A.floaters) ctx.drawImage(sprite('floater6', SPR.floater, palFor(6)), f.x - 4, Math.round(f.y + oy + Math.sin(t * 0.7 + f.ph * 6.28) * 1.5));
  for (let i = 0; i < 6; i++) {
    const k = ((t / (4 + i * 0.7)) + i * 0.17) % 1;
    if (k > 0.7) continue;
    pxl(ctx, W / 2 - 14 + i * 5 + Math.round(Math.sin(t + i)), oy + H - 12 - k * 34, css(k < 0.35 ? CREAM : PAL.v));
  }
}

/** The mole with his lamp: "you are here". */
export function drawMole(ctx, x, fy, t) {
  const y = fy - 9 - (Math.sin(t * 3) > 0.3 ? 1 : 0);
  const rows = ['...yy...', '..0000..', '.033330.', '03311220', '031e1pp0', '03311220', '.033330.', '..0..0..', '.00..00.'];
  const pal = { y: css(PAL.Y), 0: css(INK), 3: '#4a3446', 1: '#6a5266', 2: '#8a7088', e: css(CREAM), p: '#e89aa8' };
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) { const ch = rows[j][i]; if (ch !== '.') pxl(ctx, x - 3 + i, y + j, pal[ch]); }
  flame(ctx, x + 1, y, t);
}

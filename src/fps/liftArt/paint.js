// Puts the cross-section together from the hand-made tiles and sprites (tiles.js) by the hand-composed
// maps (maps.js): each cell gets its tile (rock, back wall, water, lava, ice), rock that meets the open
// gets its hand-drawn lit or shadowed edge, then the sprites the map calls for are stamped in, the
// town shaft, the lift cages at their spots, and the survey staff with the depths. The sketch of a
// layer you haven't reached is the same picture recoloured: inks to sepia, darks to pencil, the rest to
// paper, the open hatched and the water lined.
import { Art, PAL, RAMPS, palFor, rampPal, hash, digits, lum, INK, CREAM, PAPER, PAPER2, PENCIL, PENCIL2, SEPIA, SEPIA2 } from './kit.js';
import { ROCK, EDGE_TOP, EDGE_SNOW, EDGE_BOTTOM, EDGE_LEFT, EDGE_RIGHT, CONTACT, BACK, WATER_TOP, WATER, WATER_LENS, LAVA_TOP, LAVA, ICE_TOP, ICE, ORE, STAR, HATCH, HATCH2, LINES, SPR } from './tiles.js';
import { LAYER_MAPS, TOP_MAP, CORE_MAP, SHAFT_COL } from './maps.js';

export const T = 8;
export const LAYER_H = 14 * T, TOP_H = 14 * T, CORE_H = 8 * T, GROUND = 4 * T;
export const SHAFT_X = SHAFT_COL * T + 4;
/** Zone n spans [n-1]..[n] metres down. Mirrors ZONE_DEPTHS in deep/Generator.js (where the lifts are). */
export const LIFT_ZONE_DEPTHS = [0, 25, 55, 90, 130, 170, 210];
const MAIN_ROW = 11; // the row of a layer's hollow that its floor-walkers and lifts stand in
const STAFF_C = [0xe4cc98, 0xa8402c];

const ROCK_A = new Set('#oRfbasMYG='), ROCK_B = new Set('%O');
const kindOf = (ch) => (ch == null ? 'A' : ROCK_A.has(ch) ? 'A' : ROCK_B.has(ch) ? 'B' : ch === '~' ? 'water' : ch === '^' ? 'lava' : ch === '*' ? 'ice' : ch === ' ' ? 'sky' : 'air');
const solid = (k) => k === 'A' || k === 'B';
const open = (k) => k === 'air' || k === 'water' || k === 'lava';

/** Stamp a tile at a cell, skipping see-through pixels and any listed in skip ("x,y"). */
function tile(pc, cx, cy, rows, pal, role, skip) {
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const ch = rows[j][i];
    if (ch === '.' || (skip && skip.has(i + ',' + j))) continue;
    const c = pal[ch];
    if (c != null) pc.p(cx * T + i, cy * T + j, c, role);
  }
}
const pick = (list, c, r, s) => {
  const h = hash(c, r, s);
  if (h < 0.7) return list[0];
  if (h < 0.8) return list[1];
  return list[2 + Math.floor(((h - 0.8) / 0.2) * (list.length - 2))] || list[0];
};

/**
 * The tiles of a map: back wall everywhere (so rounded corners and see-through sprite pixels show it),
 * rock with its edges and band contacts, liquids. Returns the cell kinds for what's stamped next.
 */
function paintCells(pc, map, z, cols, opts = {}) {
  const rows = map.length;
  const at = (c, r) => (r < 0 ? (opts.openTop ? 'air' : 'A') : r >= rows ? 'A' : c < 0 || c >= cols ? kindOf(map[r][Math.max(0, Math.min(cols - 1, c))]) : kindOf(map[r][c]));
  const zt = Math.max(1, Math.min(6, z));
  const PA = palFor(z, 'A'), PB = palFor(z, 'B');
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = at(c, r);
    if (k === 'sky' || map[r][c] === '=') continue;
    // the back wall (what the open shows)
    let B = BACK.plain;
    if (opts.back) B = opts.back(c, r, map[r][c]) || B;
    else if (solid(at(c, r - 1))) B = BACK.shadow;
    else if (solid(at(c, r + 1)) && hash(c, r, 7) < 0.3) B = BACK.far;
    else if (hash(c, r, 8) < 0.12) B = BACK.seep;
    tile(pc, c, r, B, PA, 1);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = at(c, r), ch = map[r][c];
    if (solid(k)) {
      const P = k === 'B' ? PB : PA;
      const up = at(c, r - 1), dn = at(c, r + 1), lf = at(c - 1, r), rt = at(c + 1, r);
      const skip = new Set();
      if (up === 'air' && lf === 'air') ['0,0', '1,0', '0,1'].forEach((q) => skip.add(q));
      if (up === 'air' && rt === 'air') ['7,0', '6,0', '7,1'].forEach((q) => skip.add(q));
      if (open(dn) && lf === 'air') ['0,7', '0,6', '1,7'].forEach((q) => skip.add(q));
      if (open(dn) && open(rt)) ['7,7', '7,6', '6,7'].forEach((q) => skip.add(q));
      tile(pc, c, r, ch === '=' ? SPR.grass : pick(ROCK[zt], c, r, z * 7 + (k === 'B' ? 3 : 0)), P, 3, skip);
      // a band of one rock lying on the other: the contact line along its top
      if (solid(up) && up !== k && ch !== '=') {
        const v = CONTACT[Math.floor(hash(c, r, 5) * CONTACT.length)];
        const U = (k === 'B' ? PA : PB)[2];
        tile(pc, c, r, v, { ...P, U }, 5);
      }
      // where it meets the open: lit top and left, shadowed underside and right side, ink lines
      if (up === 'air' && ch !== '=') tile(pc, c, r, z === 5 ? EDGE_SNOW[(c + r) % 2] : EDGE_TOP[Math.floor(hash(c, r, 9) * 3)], P, 5, skip);
      if (lf === 'air') for (let j = 0; j < 8; j++) if (!skip.has('0,' + j)) pc.p(c * T, r * T + j, P[EDGE_LEFT[j]], 5);
      if (open(rt)) for (let j = 0; j < 8; j++) { if (!skip.has('6,' + j)) pc.p(c * T + 6, r * T + j, P[EDGE_RIGHT[j][0]], 5); if (!skip.has('7,' + j)) pc.p(c * T + 7, r * T + j, P[EDGE_RIGHT[j][1]], 5); }
      if (open(dn)) { const e = EDGE_BOTTOM[Math.floor(hash(c, r, 4) * 3)]; for (let i = 0; i < 8; i++) { if (!skip.has(i + ',6')) pc.p(c * T + i, r * T + 6, P[e[0][i]], 5); if (!skip.has(i + ',7')) pc.p(c * T + i, r * T + 7, P[e[1][i]], 5); } }
      // the corners we rounded off: an ink nick on the shadow side
      if (skip.has('7,0')) pc.p(c * T + 6, r * T + 1, P[0], 5);
      if (skip.has('0,7')) pc.p(c * T + 1, r * T + 6, P[0], 5);
      if (skip.has('7,7')) pc.p(c * T + 6, r * T + 6, P[0], 5);
    } else if (k === 'water' || k === 'lava' || k === 'ice') {
      const up = at(c, r - 1);
      const t = k === 'water' ? (up === 'air' ? WATER_TOP[0] : solid(up) ? WATER_LENS : WATER)
        : k === 'lava' ? (up === 'air' ? LAVA_TOP[0] : solid(up) ? LAVA_TOP[1] : LAVA)
          : (up === 'air' ? ICE_TOP : ICE);
      tile(pc, c, r, t, PA, 2);
      if (solid(at(c + 1, r)) && k !== 'ice') for (let j = 0; j < 8; j++) pc.p(c * T + 7, r * T + j, PA[0], 2);
    }
  }
  return at;
}

/** The floor's top and the ceiling's underside of the hollow at each x (for the walkers, drips and lifts). */
function floorLines(map, W, at, row = MAIN_ROW) {
  const floorTop = new Int16Array(W), ceilBot = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const c = x >> 3;
    if (at(c, row) !== 'air') { floorTop[x] = x ? floorTop[x - 1] : (row + 1) * T; ceilBot[x] = x ? ceilBot[x - 1] : row * T; continue; }
    let f = row; while (f < map.length && at(c, f) === 'air') f++;
    let u = row; while (u > 0 && at(c, u - 1) === 'air') u--;
    floorTop[x] = f * T; ceilBot[x] = u * T;
  }
  return { floorTop, ceilBot };
}

/** A lift's cable: two strands up from y0 to y1, an ink line on its shade side. */
function cable(pc, x, y0, y1, P) {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { pc.p(x, y, (y & 1) ? PAL.I : PAL.i); pc.p(x + 1, y, P ? P[0] : INK); }
}

/**
 * Paint a layer. L: { z, W, stops [{ id, ax, open }], ores [{ id, col, known }] }. Roles on the pixels:
 * 1 back wall, 2 liquid, 3 rock, 4 things, 5 the rock's edges and band contacts (the sketch's lines).
 * Returns { art, anim, floorTop, ceilBot, liquids }.
 */
export function paintLayer(L) {
  const { z, W } = L;
  const map = LAYER_MAPS[z];
  const cols = Math.min(map[0].length, Math.ceil(W / T));
  const H = LAYER_H;
  const pc = new Art(W, H);
  const PA = palFor(z, 'A'), PB = palFor(z, 'B'), R = RAMPS[z];
  const at = paintCells(pc, map, z, cols);
  const anim = { drips: [], lamps: [], spores: [], falls: [], floaters: [], glints: [], liquid: [], critters: [], plants: [], cages: [], bridges: [] };
  const known = (L.ores || []).filter((o) => o.known), ores = L.ores || [];
  const xtal = rampPal(R.xtal || R.A), xtal2 = rampPal(R.xtal2 || R.xtal || R.A);
  const spots = [];
  // ---- what's in the rock and on the open tiles
  for (let r = 0; r < map.length; r++) for (let c = 0; c < cols; c++) {
    const ch = map[r][c], x = c * T, y = r * T;
    const P = kindOf(ch) === 'B' ? PB : PA;
    switch (ch) {
      case 'o': case 'O': {
        const o = ores.length ? ores[Math.floor(hash(c, r, 21) * ores.length)] : null;
        const kn = o && o.known;
        tile(pc, c, r, ORE[(c + r) % 2], { ...P, 8: kn ? o.col[0] : P[3], 9: kn ? o.col[1] : P[4] }, 4);
        if (kn) anim.glints.push({ x: x + 3, y: y + 2, ph: hash(c, r, 22) });
        break;
      }
      case 's': tile(pc, c, r, STAR, P, 4); anim.glints.push({ x: x + 3, y: y + 2, ph: hash(c, r, 23) }); break;
      case 'R': tile(pc, c, r, r % 2 ? SPR.root2 : SPR.root, P, 4); break;
      case 'f': if (z === 2 || z === 5) pc.stamp(x - 4, y + 2, SPR.fish, P, 4, (c & 1) === 1); else pc.stamp(x, y, SPR.ammonite, P, 4); break;
      case 'b': pc.stamp(x, y, SPR.bone, P, 4); break;
      case 'a': pc.stamp(x, y, SPR.amber, P, 4); anim.glints.push({ x: x + 3, y: y + 2, ph: 0.4 }); break;
      case 'G': pc.stamp(x, y + 2, SPR.geode, P, 4); anim.glints.push({ x: x + 6, y: y + 6, ph: 0.7 }); break;
      case 'M': pc.stamp(x, y, SPR.mammoth, P, 4); break;
      case 'Y': pc.stamp(x - 12, y, SPR.ribs, P, 4); break;
      case 'v': pc.stamp(x, y, SPR.stalactite, PA, 4); anim.drips.push({ x: x + 3, y: y + 8, ph: hash(c, r, 1), sp: 0.5 + hash(c, r, 2) * 0.5, ice: z === 5 }); break;
      case 'u': pc.stamp(x, y, SPR.stalagmite, PA, 4); break;
      case 'h': pc.stamp(x, y, SPR.rootHang, PA, 4); anim.drips.push({ x: x + 1, y: y + 13, ph: hash(c, r, 1), sp: 0.4 + hash(c, r, 2) * 0.4 }); break;
      case 'w': pc.stamp(x, y, SPR.vine, PA, 4); break;
      case 'i': pc.stamp(x, y, SPR.icicles, PA, 4); anim.drips.push({ x: x + 1, y: y + 7, ph: hash(c, r, 1), sp: 0.35, ice: true }); break;
      case 'X': pc.stamp(x, y, SPR.crystalHang, (c & 1) ? xtal2 : xtal, 4); anim.glints.push({ x: x + 3, y: y + 5, ph: hash(c, r, 3) }); break;
      case 'Z': tile(pc, c, r, SPR.frozenFall, PA, 4); break;
      case 'H': tile(pc, c, r, SPR.ladder, PA, 4); break;
      case 'l': pc.stamp(x + 1, y, SPR.lamp, PA, 4); anim.lamps.push({ x: x + 3, y: y + 3 }); break;
      case 'm': pc.stamp(x, y, SPR.redcaps, PA, 4, (c & 1) === 1); break;
      case 'g': pc.stamp(x, y, SPR.glowcaps, PA, 4); anim.spores.push({ x: x + 4, y: y + 1 }); break;
      case 'x': pc.stamp(x - 4, y + 8 - SPR.crystal.length, SPR.crystal, (c & 1) ? xtal2 : xtal, 4, (c & 2) === 2); anim.glints.push({ x: x + 3, y: y - 3, ph: hash(c, r, 4) }); break;
      case 'F': anim.falls.push({ x: x + 3, y0: y }); pc.stamp(x + 1, y, ['.yYp.', 'kpPPk'], PA, 4); break;
      case 'q': anim.floaters.push({ x: x + 4, y: y + 2, ph: hash(c, r, 6) }); break;
      case 'A': pc.stamp(x, y + 8 - SPR.arch.length, SPR.arch, PA, 4); break;
      case 'L': spots.push({ x: x + 4, c, r }); break;
      default: break;
    }
  }
  // the old mine's timbers, rails, carts, bridges (after the open dressing, over it)
  for (let r = 0; r < map.length; r++) for (let c = 0; c < cols; c++) {
    const ch = map[r][c], x = c * T, y = r * T;
    if (ch === 'r' || ch === 'c' || ch === 'T') pc.stamp(x, y + 5, SPR.rail, PA, 4);
    if (ch === 'T') pc.stamp(x - 4, y + 8 - SPR.support.length, SPR.support, PA, 4);
    if (ch === 'c') { const o = known[0]; pc.stamp(x - 4, y - 2 - 3, SPR.cart, { ...PA, 8: o ? o.col[0] : PAL.t, 9: o ? o.col[1] : PAL.S }, 4); }
    if (ch === 'B') { tile(pc, c, r + 1, SPR.bridge, PA, 4); anim.bridges.push(c); }
  }
  // ---- the town shaft down column 22
  for (let r = 0; r < map.length; r++) tile(pc, SHAFT_COL, r, solid(at(SHAFT_COL, r)) ? SPR.shaftRock : SPR.shaftAir, PA, 4);
  const lines = floorLines(map, W, at);
  for (const c of anim.bridges) for (let x = c * T; x < c * T + T; x++) lines.floorTop[x] = (MAIN_ROW + 1) * T;
  // ---- liquids' surfaces (they ripple in the animation)
  for (let r = 0; r < map.length; r++) for (let c = 0; c < cols; c++) {
    const k = at(c, r);
    if ((k === 'water' || k === 'lava') && at(c, r - 1) === 'air' && !anim.bridges.includes(c)) anim.liquid.push({ x: c * T, y: r * T, kind: k });
  }
  for (const f of anim.falls) f.y1 = lines.floorTop[f.x];

  // ---- lifts: each found lift stands at one of the layer's spots (the shaft's stations at the shaft)
  const free = spots.filter((s) => s.x < W - 10);
  const placeAt = (s, x) => {
    const fy = lines.floorTop[x], cy = lines.ceilBot[x];
    s.x = x; s.fy = fy;
    cable(pc, x - 1, fy - 16, cy, PA);
    for (let y = cy - 1; y >= 0; y--) if (solid(at(x >> 3, y >> 3))) { pc.p(x - 1, y, PA[0], 4); pc.p(x, y, (y & 1) ? PAL.j : PAL.I, 4); } else break;
    if (fy - cy > 28) pc.stamp(x - 4, cy, SPR.sheave, PA, 4);
    pc.stamp(x - 8, fy - 16, s.open ? SPR.cageOpen : SPR.cageLocked, PA, 4);
    pc.stamp(x - 12, fy - 13, SPR.bell, PA, 4);
    anim.cages.push({ id: s.id, open: s.open, lx: x + 6, ly: fy - 9 });
  };
  const stops = (L.stops || []).slice().sort((a, b) => a.ax - b.ax);
  for (const s of stops) {
    if (/^s\d/.test(s.id)) { placeAt(s, SHAFT_X + 12); continue; }
    let best = null;
    for (const sp of free) if (!sp.used && (!best || Math.abs(sp.x - s.ax) < Math.abs(best.x - s.ax))) best = sp;
    if (best) { best.used = true; placeAt(s, best.x); } else placeAt(s, Math.max(14, Math.min(W - 14, s.ax)));
  }
  staff(pc, z, H);
  return { art: pc, anim, floorTop: lines.floorTop, ceilBot: lines.ceilBot };
}

/** The survey staff down the left edge: painted 5 m bands, a tick each metre, the depth every 10 m. */
function staff(pc, z, H) {
  const d0 = LIFT_ZONE_DEPTHS[z - 1], d1 = LIFT_ZONE_DEPTHS[z];
  const yOf = (d) => Math.round(((d - d0) / (d1 - d0)) * H);
  for (let y = 0; y < H; y++) {
    const d = d0 + (y / H) * (d1 - d0);
    pc.p(1, y, INK); pc.p(2, y, STAFF_C[Math.floor(d / 5) & 1]); pc.p(3, y, STAFF_C[Math.floor(d / 5) & 1]); pc.p(4, y, INK);
  }
  for (let d = Math.ceil(d0); d < d1; d++) { const y = yOf(d); if (d % 5 === 0) { pc.p(5, y, INK); pc.p(6, y, INK); } }
  for (let d = Math.ceil(d0 / 10) * 10; d < d1; d += 10) {
    if ((d - d0 < 5 && d !== d0) || d1 - d < 5) continue;
    const y = Math.max(1, Math.min(H - 7, yOf(d) - 2)), w = String(d).length * 4 - 1;
    for (let j = -1; j <= 5; j++) for (let i = -1; i <= w; i++) pc.p(7 + i, y + j, j === 5 || i === w ? INK : PAL.K);
    digits(pc, 7, y, d, CREAM);
  }
}

/** The top: the sky (its own canvas, for a little parallax), the meadow, the burrow, the passage, Deep Town. */
export function paintTop(T0) {
  const { W, M, town } = T0;
  const cols = Math.min(TOP_MAP[0].length, Math.ceil(W / T));
  const H = TOP_H;
  const pc = new Art(W, H);
  const P = palFor(0, 'A');
  const anim = { smoke: [], windows: [], fires: [], clouds: [], lights: [], lamps: [] };
  // ---- the sky: flat bands with hand-cut teeth where they meet, a lopsided sun, hills, far pines
  const sky = new Art(W, H + M * 2);
  const BANDS = [PAL.T, PAL.U, PAL.L, PAL.M, PAL.Q, PAL.J];
  const TEETH = '..X...XX..X.....X....XXX..X.....';
  const gy = M + GROUND;
  const bandH = Math.ceil(gy / BANDS.length);
  for (let y = 0; y < H + M * 2; y++) for (let x = 0; x < W; x++) {
    let b = Math.min(BANDS.length - 1, Math.floor(y / bandH));
    if (b < BANDS.length - 1 && y % bandH === bandH - 1 && TEETH[(x + b * 7) % TEETH.length] === 'X') b++;
    sky.p(x, y, BANDS[b], 1);
  }
  sky.stamp(Math.round(W * 0.78), M + 6, ['...ccc...', '.cccccyy.', '.ccccccyy', 'cccccccyy', 'ccccccyy.', '.cyyyyyy.', '...yyy...'], PAL, 1);
  for (let x = 0; x < W; x += 32) sky.stamp(x, gy - 7, SPR.hills, PAL, 1);
  for (let k = 0; k < Math.max(3, W / 90); k++) anim.clouds.push({ x: (k * 97) % W, y: 3 + ((k * 5) % 3) * 6, sp: 1.2 + (k % 3) * 0.6, big: k % 2 === 0 });
  // ---- the ground: tiles by the map; the burrow's planks and the town's dressed stone behind them
  const isTown = (c) => c >= 14;
  const at = paintCells(pc, TOP_MAP, 0, cols, {
    openTop: true,
    back: (c, r, ch) => (ch === '.' && r >= 9 ? SPR.planks : ch === ',' && r >= 10 ? SPR.stoneWall : ch === ',' || ch === '.' || ch === ':' ? (solid(kindOf(TOP_MAP[r - 1]?.[c])) ? BACK.shadow : BACK.plain) : null),
  });
  void isTown;
  // the meadow: the old oak with its roots, the pines, the chimney pot smoking
  pc.stamp(4, GROUND - SPR.oak.length + 2, SPR.oak, P, 4);
  for (const [x, w] of [[12, 3], [18, 4], [14, 2]]) for (let j = 0; j < 14 + w * 3; j++) { const xx = x + Math.round(Math.sin(j * 0.35 + w) * 1.2); pc.p(xx, GROUND + 4 + j, PAL.A, 4); pc.p(xx + 1, GROUND + 4 + j, PAL.m, 4); }
  for (const x of [W - 70, W - 54, W - 30, W - 14, 236]) if (x > 200) pc.stamp(x, GROUND - SPR.pine.length + 2, SPR.pine, P, 4);
  // ---- HOME: Old Star's burrow (hand-placed, left to right)
  const fy = 13 * T; // the burrow's and the town's floor
  const hx = 17;
  for (let y = GROUND - 2; y < fy - 15; y += 8) pc.stamp(hx + 4, y, SPR.chimney, P, 4);
  pc.stamp(hx + 4, GROUND - 6, SPR.chimneyPot, P, 4);
  anim.smoke.push({ x: hx + 7, y: GROUND - 8, big: true });
  pc.stamp(hx, fy - SPR.hearth.length, SPR.hearth, P, 4);
  anim.fires.push({ x: hx + 5, y: fy - 7 });
  // the beam across under the roof, its posts
  for (let x = 17; x < 95; x++) { pc.p(x, 72, PAL.w, 4); pc.p(x, 73, (x % 9) ? PAL.W : PAL.d, 4); pc.p(x, 74, INK, 4); }
  for (const x of [91]) for (let y = 75; y < fy; y++) { pc.p(x, y, PAL.w, 4); pc.p(x + 1, y, PAL.W, 4); pc.p(x + 2, y, INK, 4); }
  pc.stamp(36, fy - SPR.anvil.length, SPR.anvil, P, 4);
  pc.stamp(40, 75, SPR.herbs, P, 4); pc.stamp(46, 75, SPR.herbs2, P, 4); pc.stamp(52, 75, SPR.herbs, P, 4);
  pc.stamp(76, 75, SPR.lamp, P, 4); anim.lamps.push({ x: 78, y: 78 });
  pc.stamp(64, 80, SPR.shelf, P, 4);
  pc.stamp(64, fy - SPR.bed.length, SPR.bed, P, 4);
  pc.stamp(84, fy - SPR.door.length, SPR.door, P, 4);
  // the burrow's own lift: a cage on the planks, its shaft and cable going down
  const lx = 55;
  for (let y = 75; y < fy - 16; y++) pc.p(lx, y, (y & 1) ? PAL.I : PAL.i, 4);
  pc.stamp(lx - 8, fy - 16, SPR.cageOpen, P, 4);
  anim.lamps.push({ x: lx + 6, y: fy - 9 });
  for (let y = fy + 1; y < H; y++) for (let i = -4; i <= 3; i++) pc.p(lx + i, y, i === -4 ? PAL.W : i === 3 ? INK : i === 0 ? ((y & 1) ? PAL.I : PAL.i) : P[5], 4);
  // Nugget the hen, in the passage
  pc.stamp(98, fy - SPR.hen.length, SPR.hen, P, 4);
  // ---- DEEP TOWN
  pc.stamp(118, fy - SPR.houseA.length, SPR.houseA, P, 4);
  pc.stamp(142, fy - SPR.houseB.length, SPR.houseB, P, 4);
  pc.stamp(160, fy - 15, SPR.board, P, 4);
  pc.stamp(194, fy - SPR.houseA.length, SPR.houseA, P, 4, true);
  pc.stamp(218, fy - SPR.houseB.length, SPR.houseB, P, 4, true);
  for (const [x, y] of [[123, 92], [131, 92], [123, 96], [131, 96], [148, 94], [156, 94], [200, 92], [208, 92], [224, 94], [232, 94]]) anim.windows.push({ x, y });
  anim.smoke.push({ x: 209, y: 79 }, { x: 133, y: 79 });
  // a walkway along the back wall with a shack on it, a ladder down
  for (let x = 120; x < 164; x++) { pc.p(x, 74, PAL.w, 4); pc.p(x, 75, (x % 5) ? PAL.W : PAL.d, 4); pc.p(x, 76, INK, 4); if (x % 6 === 0) for (let j = 1; j < 4; j++) pc.p(x, 74 - j, PAL.W, 4); }
  for (let x = 120; x < 164; x++) if (x % 6) pc.p(x, 71, PAL.d, 4);
  for (const x of [126, 146]) for (let j = 0; j < 5; j++) { pc.p(x + j, 77 + j, PAL.W, 4); pc.p(x + j, 78 + j, INK, 4); }
  pc.stamp(127, 74 - SPR.shack.length, SPR.shack, P, 4);
  anim.windows.push({ x: 130, y: 68 }, { x: 137, y: 68 });
  for (let y = 75; y < fy; y++) { pc.p(162, y, PAL.w, 4); pc.p(166, y, PAL.W, 4); pc.p(167, y, INK, 4); if (y % 3 === 0) for (let i = 163; i < 166; i++) pc.p(i, y, PAL.w, 4); }
  // the town lift's headframe over the shaft
  pc.stamp(SHAFT_X - 12, fy - SPR.headframe.length, SPR.headframe, P, 4);
  for (let y = fy; y < H; y++) for (let i = -4; i <= 3; i++) pc.p(SHAFT_X + i, y, i === -4 ? PAL.w : i === 3 ? INK : i === 0 ? ((y & 1) ? PAL.I : PAL.i) : P[5], 4);
  // one string of lamps across the cavern
  for (let x = 122; x < Math.min(W - 6, 240); x++) {
    const t = (x - 122) / 118, y = Math.round(60 + Math.sin(t * Math.PI) * 6);
    if (at(x >> 3, y >> 3) !== 'air') continue;
    pc.p(x, y, INK, 4);
    if ((x - 122) % 8 === 4) { pc.p(x, y + 1, PAL.O, 4); anim.lights.push({ x, y: y + 2, ph: (x * 7) % 10 }); }
  }
  // the town's corner of the sheet is pencil until you've reached it
  const townX0 = 14 * T - 4;
  return { back: sky.commit(), art: pc, anim, homeStop: { x: lx, fy }, townStop: { x: SHAFT_X + 22, fy }, townTag: { x: SHAFT_X, y: fy - SPR.headframe.length - 2 }, townX0, homeR: { x0: 16, x1: 96 }, townR: { x0: 112, x1: 248 }, town, shx: SHAFT_X };
}

/** The Core's heart under everything: its chamber, the heart in flat carved bands, floating rocks. */
export function paintCore(C) {
  const { W } = C;
  const cols = Math.min(CORE_MAP[0].length, Math.ceil(W / T));
  const pc = new Art(W, CORE_H);
  const at = paintCells(pc, CORE_MAP, 6, cols);
  void at;
  const P = palFor(6, 'A');
  const hx = Math.round(W / 2 - SPR.heart[0].length / 2);
  pc.stamp(hx, CORE_H - SPR.heart.length, SPR.heart, P, 4);
  const anim = { floaters: [] };
  for (let r = 0; r < CORE_MAP.length; r++) for (let c = 0; c < cols; c++) if (CORE_MAP[r][c] === 'q') anim.floaters.push({ x: c * T + 4, y: r * T + 2, ph: hash(c, r, 6) });
  return { art: pc, anim };
}

/**
 * The sketch: the same picture recoloured on paper. The outlines of the shapes become the line (sepia
 * where the drawing is inked, pencil where it isn't yet), marks inside the rock a light pencil touch,
 * everything else the paper; the open is hatched, water lined. o: { z, ink (0..1: how far across it's inked), faint,
 * region(x, y) → only there (the rest left clear) }.
 */
export function sketchOf(src, o = {}) {
  const { w: W, h: H } = src;
  const out = new Art(W, H);
  const R = RAMPS[o.z ?? 1];
  const inkSet = new Set([PAL.k, PAL.K, R.A[0], R.B[0]]);
  const darkSet = new Set([R.A[1], R.B[1], R.back[0]]);
  const inkX = Math.round(W * (o.ink ?? 0.5));
  const WOB = [0, 1, 2, 2, 1, 0, -1, -2, -2, -1]; // the inked part's ragged right edge, row by row
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (o.region && !o.region(x, y)) continue;
    const k = y * W + x, role = src.role[k];
    if (!src.d[k * 4 + 3]) continue;
    const c = (src.d[k * 4] << 16) | (src.d[k * 4 + 1] << 8) | src.d[k * 4 + 2];
    const inked = x < inkX + WOB[(y >> 2) % WOB.length] * 3 && !o.faint;
    const LINE = inked ? SEPIA : PENCIL, SOFT = inked ? SEPIA2 : PENCIL2;
    let out1 = PAPER;
    if (role === 1) {
      const pat = c === R.back[0] ? HATCH2 : HATCH;
      if (pat[y & 7][x & 7] === '1') out1 = o.faint ? PENCIL2 : SOFT;
    } else if (role === 2) {
      if (LINES[y & 7][x & 7] === '1') out1 = o.faint ? PENCIL2 : PENCIL;
    } else if (role === 5) {
      if (inkSet.has(c)) out1 = LINE; // the shapes: where rock meets the open, where one band meets the next
      else if (darkSet.has(c)) out1 = o.faint ? PAPER2 : PENCIL2;
    } else if (role === 3) {
      if (inkSet.has(c)) out1 = o.faint ? PAPER2 : PENCIL2; // marks in the rock: a light pencil touch
    } else {
      const l = lum(c);
      if (l < 0.2) out1 = LINE;
      else if (l < 0.4) out1 = o.faint ? PAPER2 : PENCIL2;
    }
    out.p(x, y, out1, role);
  }
  return out;
}
export { INK, CREAM };

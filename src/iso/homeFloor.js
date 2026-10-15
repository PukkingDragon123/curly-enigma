// The burrow floor at 32 texels per tile, painted per tile from the FLOORS table with
// real relief (normal map) and shine (specular): packed dirt with pebbles, roots and
// scuffs; wide planks with grain, knots, nails and gaps; flagstones; a moss carpet with
// tiny flowers; terracotta tiles; bevelled checker tiles; a woven velvet carpet; gold leaf.
// Patterns use absolute texel coordinates, so neighbouring tiles of one kind join up.
import { Surf, dirt, setts, cobbles, planks, pebble, worm, moss, finish, toTextures, updateTextures, hash2, mul, mix } from './surface.js';
import { FLOORS } from '../data/furniture.js';
import { hashStr } from '../core/util.js';

export const HTPX = 32;

/** Paint one tile (x, y) of the surf with floor id. */
export function paintHomeTile(S, tx, ty, id) {
  const T = HTPX;
  const x0 = tx * T, y0 = ty * T, x1 = x0 + T, y1 = y0 + T;
  const reg = { x0, y0, x1, y1, inside: () => true };
  const f = FLOORS[id] || FLOORS.floor_dirt;
  const seed = hashStr(id) % 997;
  const pat = f.icon?.pat || 'dirt';
  // clear the tile's relief and shine first
  for (let y = y0; y < y1; y++) { S.ht.fill(0, x0 + y * S.w, x1 + y * S.w); S.wet.fill(0, x0 + y * S.w, x1 + y * S.w); }
  if (pat === 'plank') {
    planks(S, reg, { axis: 'x', bw: 8, minL: 44, maxL: 110, color: f.color, seed: 5, worn: true, owner: 5 });
  } else if (pat === 'stone') {
    cobbles(S, { x0, y0, x1, y1, inside: (cx, cy) => cx >= x0 - 4 && cx < x1 + 4 && cy >= y0 - 4 && cy < y1 + 4 }, { cell: 15, gap: 2, palette: [0x8a8078, 0x7a7470, 0x9a8e84, 0x6e6862, 0x847a70], mortar: 0x3e3832, seed: 7, jitter: 0.75, moss: 0.42, bevel: 3.2, height: 2.4, owner: 4 });
    // the stone cobbles' own cells cross tile edges: repaint only this tile (cobbles() wrote all of it)
  } else if (pat === 'moss') {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = x + y * S.w;
      const h = hash2(x >> 1, y >> 1, 21), h2 = hash2(x, y, 22);
      let c = h < 0.3 ? 0x3a6a2c : h < 0.7 ? 0x4a7a36 : h < 0.92 ? 0x5e9040 : 0x2c5222;
      if (h2 > 0.985) c = [0xf0e070, 0xf0a0c0, 0xe8e8ff, 0xc8a0f0][Math.floor(hash2(y, x, 23) * 4)];
      S.c[i] = c;
      S.ht[i] = 0.6 + hash2(x >> 1, y >> 1, 24) * 1.1;
      S.wet[i] = 30;
    }
    // clover leaves and a mushroom or two
    for (let k = 0; k < 4; k++) {
      const cx = x0 + 4 + Math.floor(hash2(tx, ty, 30 + k) * (T - 8)), cy = y0 + 4 + Math.floor(hash2(ty, tx, 40 + k) * (T - 8));
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [0, 0]]) S.put(cx + dx, cy + dy, 0x7ab84a, 1.8);
    }
    if (hash2(tx, ty, 50) < 0.25) { const cx = x0 + 8 + Math.floor(hash2(tx, ty, 51) * 16), cy = y0 + 8 + Math.floor(hash2(tx, ty, 52) * 16); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [2, 1]]) S.put(cx + dx, cy + dy, dx > 0 ? 0xe8d8c8 : 0xc87a5a, 2.2); }
  } else if (pat === 'tile') {
    const gold = id === 'floor_gold';
    const pal = gold ? [0xe0b040, 0xd8a838, 0xf0c050, 0xc89830] : [0xb8603a, 0xa85634, 0xc46c42, 0x9a4e30, 0xb06440];
    setts(S, { x0, y0, x1, y1, inside: (cx, cy) => cx >= x0 && cx < x1 && cy >= y0 && cy < y1 }, { axis: 'x', rowH: 16, minL: 16, maxL: 16, gap: 2, palette: pal, mortar: gold ? 0x8a6a28 : 0xd8c8b0, seed: 11 + (gold ? 1 : 0), bevel: 2, height: 1.6, owner: 6 });
    if (gold) for (let k = 0; k < 6; k++) { const x = x0 + Math.floor(hash2(tx, ty, 60 + k) * T), y = y0 + Math.floor(hash2(ty, tx, 70 + k) * T); S.put(x, y, 0xfff8d0); S.put(x + 1, y, 0xfff0a0); S.put(x, y + 1, 0xfff0a0); }
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) S.wet[x + y * S.w] = gold ? 160 : 40;
  } else if (pat === 'checker') {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = x + y * S.w;
      const cx = x & 15, cy = y & 15;
      const dark = ((x >> 4) + (y >> 4)) % 2 === 1;
      const base = dark ? 0x3a3438 : f.color;
      let c = mul(base, 0.97 + hash2(x >> 4, y >> 4, 81) * 0.06);
      const edge = Math.min(cx, cy, 15 - cx, 15 - cy);
      let h = 1.4;
      if (edge === 0) { c = mul(base, 0.6); h = 0; } else if (edge === 1) { c = cx === 1 || cy === 1 ? mul(c, 1.12) : mul(c, 0.86); h = 0.8; }
      if (hash2(x, y, 82) < 0.015) c = mul(c, dark ? 1.4 : 0.92);
      S.c[i] = c;
      S.ht[i] = h;
      S.wet[i] = 70;
    }
  } else if (pat === 'carpet') {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = x + y * S.w;
      const lx = x & 15, ly = y & 15;
      const d = Math.abs(lx - 7.5) + Math.abs(ly - 7.5);
      let c = mul(f.color, 0.96 + (((x + y) & 1) ? 0.04 : 0));
      if (Math.round(d) === 6) c = mix(f.color, 0xe0b040, 0.55);
      else if (Math.round(d) === 3) c = mix(f.color, 0xf0d0a0, 0.25);
      else if (d < 1.5) c = 0xe0b040;
      if (lx === 0 || ly === 0) c = mul(f.color, 0.78);
      if (hash2(x, y, 91) < 0.03) c = mul(c, 0.9);
      S.c[i] = c;
      S.ht[i] = 0.9 + ((x ^ y) & 1) * 0.25;
    }
  } else {
    // packed dirt: two browns, speckles, a pebble or two, a root crossing, scuffs
    dirt(S, reg, { colors: [0x7a5538, 0x6b4a32, 0x5a3e2a], seed: 13 });
    for (let k = 0; k < 3; k++) {
      if (hash2(tx, ty, 100 + k) < 0.45) continue;
      const cx = x0 + 3 + hash2(tx, ty, 110 + k) * (T - 6), cy = y0 + 3 + hash2(ty, tx, 120 + k) * (T - 6);
      pebble(S, cx, cy, 1.6 + hash2(tx, ty, 130 + k) * 1.8, 1.2 + hash2(ty, tx, 140 + k) * 1.2, [0x8a8078, 0x6e6056, 0x9a8a78][k]);
    }
    if (hash2(tx, ty, 150) < 0.22) worm(S, x0 + hash2(tx, ty, 151) * T, y0 + 2, Math.PI / 2 + (hash2(tx, ty, 152) - 0.5), 18 + hash2(tx, ty, 153) * 20, { width: 2, color: 0x5a3e26, height: 1.2, seed: tx * 31 + ty, taper: true, wander: 0.4 });
    if (hash2(tx, ty, 160) < 0.3) worm(S, x0 + hash2(tx, ty, 161) * T, y0 + hash2(tx, ty, 162) * T, hash2(tx, ty, 163) * 6.28, 10 + hash2(tx, ty, 164) * 12, { width: 1.4, dark: 0.66, height: -0.5, seed: tx * 7 + ty * 3, wander: 0.9 });
    roomFeatures(S, tx, ty);
  }
  // the stone painter writes whole cells: clip anything outside the tile back (re-painted by neighbours)
  void seed;
}

/**
 * Things that belong to this burrow rather than to a tile: moss creeping out from the damp back
 * walls, a path worn smooth from the old door into the room, and earth scattered around the spot
 * under the hole in the ceiling. Dirt tiles only; positions are in room tiles.
 */
function roomFeatures(S, tx, ty) {
  const T = HTPX, W = S.w / T, D = S.h / T;
  const x0 = tx * T, y0 = ty * T;
  // the worn path: door (west wall, near the front) → middle of the room
  const ax = 0.3, az = D - 1.5, bx = W * 0.42, bz = D * 0.42;
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
  for (let y = y0; y < y0 + T; y++) for (let x = x0; x < x0 + T; x++) {
    const px = (x + 0.5) / T, pz = (y + 0.5) / T, i = x + y * S.w;
    // path
    const k = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L2));
    const dp = Math.hypot(px - (ax + vx * k), pz - (az + vz * k)) + (hash2(x >> 2, y >> 2, 171) - 0.5) * 0.18;
    if (dp < 0.42) {
      S.c[i] = mul(mix(S.c[i], 0x86603e, 0.35), 1.04);
      S.ht[i] *= 0.4;
      S.wet[i] = Math.max(S.wet[i], 40);
    }
    // moss near the back walls (damp), in patches
    const dw = Math.min(px, pz);
    if (dw < 0.55) {
      const m = hash2(x >> 3, y >> 3, 172) + (0.55 - dw) * 1.1 - 0.95 + (hash2(x >> 1, y >> 1, 173) - 0.5) * 0.25;
      if (m > 0) {
        const h = hash2(x, y, 174);
        S.c[i] = h < 0.3 ? 0x3a6a2c : h < 0.75 ? 0x4a7a36 : h < 0.95 ? 0x5e9040 : 0x7ab84a;
        S.ht[i] = 0.8 + hash2(x >> 1, y >> 1, 175) * 0.9;
        S.wet[i] = 30;
      }
    }
  }
}

/** Paint a whole room floor. floorMap: {"x,y": id}. Returns {S, tex}. */
export function paintHomeFloor(W, D, floorMap) {
  const S = new Surf(W * HTPX, D * HTPX, HTPX);
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) paintHomeTile(S, x, y, floorMap[`${x},${y}`] || 'floor_dirt');
  shadeHomeEdges(S, 0, 0, S.w, S.h);
  finish(S, { ao: 0.12, rake: 0.08 });
  const tex = toTextures(S, { normal: 0.6, baseSpec: 0.03, topSpec: 8 });
  return { S, tex };
}

/** Contact shadow along the two back walls + extra darkness in the back corner. */
export function shadeHomeEdges(S, x0, y0, x1, y1) {
  const T = HTPX;
  for (let y = Math.max(0, y0); y < Math.min(S.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(S.w, x1); x++) {
    const dn = y / T, dw = x / T;
    const m = Math.min(dn, dw);
    if (m > 0.6) continue;
    const k = 0.55 + (m / 0.6) * 0.45 + (((x ^ y) & 1) ? 0.02 : 0);
    const i = x + y * S.w;
    S.c[i] = mul(S.c[i], Math.min(1, k));
  }
}

/** Repaint one tile in place and re-upload the textures. */
export function repaintHomeTile(S, tex, tx, ty, id) {
  const T = HTPX;
  paintHomeTile(S, tx, ty, id);
  shadeHomeEdges(S, tx * T, ty * T, (tx + 1) * T, (ty + 1) * T);
  updateTextures(S, tex, tx * T, ty * T, (tx + 1) * T, (ty + 1) * T);
}

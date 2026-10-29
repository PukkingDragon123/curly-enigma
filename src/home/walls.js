// Your nook's walls and ceiling as 1/64 m voxel reliefs, seen from inside in first person.
// The first style (still called wall_dirt in the save) is the cave's own rock, lumpy and layered,
// cracked, rooty up top and mossy at the foot, held up by old grey pit props and a grey crown
// beam, like the rest of Old Star's camp; the styles you buy get the heavy timber frame (posts on
// stone footings, iron straps, knee braces, a crown plate with beam ends) round their infill. The
// ceiling is the rock between old grey joists (the bought styles keep a deck of boards).
import { WALLS } from '../data/furniture.js';
import { hash2 } from '../iso/surface.js';
import { mulc, mixc, sp3 } from '../iso/kit.js';
import { WALL_V } from './units.js';
import { n2 } from './surfaces.js';

const WOOD0 = 0x5a3a22;
export const PLATE = 12; // crown plate height (voxels)
export const POST_W = 9; // post width (voxels)

/**
 * The timber frame shared by every style: [color, relief] or null where the infill shows.
 * post: { d: distance from the nearest post centre (voxels), i: its index, side: -1|1 } or null.
 */
function frameVoxel(u, v, seed, post) {
  const H = WALL_V;
  if (v >= H - PLATE) {
    // crown plate, with squared beam ends standing proud over each post
    if (post && post.d <= 5 && v >= H - PLATE - 1) return [(post.d === 5 || v === H - PLATE - 1) ? 0x3e2616 : mulc(0x6a4428, 0.95 + ((u + v) % 3) * 0.04), 10, 'endgrain'];
    const lip = v === H - PLATE;
    const c = mulc(WOOD0, (0.9 + ((v + Math.floor(u / 53)) % 3) * 0.045) * sp3(u, v, 0, seed, 0.05, 0.1));
    if (!lip && (u + v * 7) % 97 === 0) return [0x8a8a92, 8, 'iron']; // a nail head
    return [lip ? mulc(WOOD0, 0.78) : c, lip ? 7 : 6, 'woodx'];
  }
  if (post && post.d <= (POST_W - 1) / 2) {
    const pu = Math.round(post.d * post.side + (POST_W - 1) / 2);
    if (v < 11) return [mulc(0x7a7068, (0.9 + Math.floor(hash2(post.i, 1, seed) * 3) * 0.06) * (v === 10 ? 1.12 : 1) * sp3(u, v, 9, seed, 0.12, 0.1)), v === 10 ? 9 : 10, 'stone']; // stone footing
    if (v === 26 || v === 27 || v === 92 || v === 93) return [pu === 4 && (v === 27 || v === 93) ? 0x5c5c68 : 0x3a3a44, 9, 'iron']; // iron straps
    const edge = pu === 0 || pu === POST_W - 1;
    const grain = Math.floor(v / 9 + pu) % 3 === 0 ? -0.07 : 0;
    const check = hash2(post.i, Math.floor(v / 23), seed + 3) < 0.12 && pu === 3 ? 0.7 : 1; // a drying check in the timber
    return [edge ? mulc(WOOD0, 0.72) : mulc(WOOD0, (1.02 + grain) * check), edge ? 7 : 8, 'woody'];
  }
  // knee braces from each post up to the crown plate
  if (post) {
    const d = post.d - (POST_W - 1) / 2 - 1;
    if (d >= 0 && d < 28) {
      const tv = H - PLATE - 28 + d;
      if (v >= tv - 2 && v <= tv + 2) return [v === tv + 2 ? mulc(WOOD0, 1.12) : v === tv - 2 ? mulc(WOOD0, 0.75) : WOOD0, 6, 'woodd'];
    }
  }
  return null;
}

const ROCK = [0x5a5550, 0x4c4844, 0x635e57, 0x433f3c, 0x58524a, 0x4e4a45];
const GREYW = 0x5e574e; // old timber gone grey

/** The cave's rock round your nook, propped by old grey timbers: [color, relief, kind]. */
function rockWallVoxel(u, v, seed, post) {
  const H = WALL_V;
  if (post && post.d <= 4) { // a pit prop: a grey post on a flat stone
    const pu = Math.round(post.d * post.side + 4);
    if (v < 8) return [mulc(0x6a6258, v === 7 ? 1.1 : 0.95), 9, 'stone'];
    const edge = pu === 0 || pu === 8;
    return [edge ? mulc(GREYW, 0.7) : mulc(GREYW, Math.floor(v / 11 + pu) % 3 === 0 ? 0.92 : 1.02), edge ? 7 : 8, 'woody'];
  }
  if (v >= H - 9) return [v === H - 9 ? mulc(GREYW, 0.72) : mulc(GREYW, 0.94 + ((v + (u >> 5)) % 3) * 0.04), v === H - 9 ? 6 : 7, 'woodx']; // the crown beam
  // the rock: lumps, layers, cracks; roots near the top, moss and earth at the foot
  const lump = n2(u / 21, v / 21, seed + 3) * 0.7 + n2(u / 7, v / 7, seed + 4) * 0.3;
  let rel = Math.max(0, Math.round(4 + lump * 5));
  const band = Math.floor((v + 7 * n2(u / 45, 1.5, seed + 5)) / 13);
  let c = ROCK[((band % ROCK.length) + ROCK.length) % ROCK.length];
  const b = hash2(u >> 2, v >> 2, seed + 6);
  c = mulc(c, b < 0.2 ? 0.88 : b > 0.85 ? 1.1 : 1);
  const crack = Math.abs(n2(u / 11, v / 11, seed + 7));
  if (crack < 0.05) { c = 0x2a2420; rel = Math.max(0, rel - 3); }
  if (v < 18 && hash2(u >> 2, v >> 2, seed + 8) < 0.3) c = v < 9 ? 0x4a3a2a : 0x4a5a30; // earth, moss
  if (v > H - 34 && (u * 7 + seed) % 41 < 2 && hash2(u, v >> 3, seed + 9) < 0.7) { c = 0x3e2c1e; rel += 1; } // root hairs
  if (v > 60 && v < H - 30 && hash2(u >> 3, v >> 3, seed + 10) < 0.02) c = 0x7ae0c8; // a speck of glow-moss
  return [c, rel, 'rock'];
}

/** [color, relief] for wall voxel (u along, v up) in style id. relief in voxels (+ = sticks out). */
export function wallVoxel(style, u, v, seed, n, post) {
  if (style === 'wall_dirt' || !WALLS[style]) return rockWallVoxel(u, v, seed, post);
  const w = WALLS[style] || WALLS.wall_dirt;
  const c = w.color;
  const H = WALL_V;
  const fr = frameVoxel(u, v, seed, post);
  if (fr) return fr;
  if (v < 6) return [mulc(v === 5 ? mulc(WOOD0, 1.15) : mulc(WOOD0, 0.92), sp3(u, v, 1, seed, 0.06, 0.1)), v === 5 ? 3 : 2];
  const wains = style === 'wall_brick' || style === 'wall_paper' || style === 'wall_dirt' || !WALLS[style];
  if (wains && v < 42) {
    if (v >= 38) return [mulc(WOOD0, v === 41 ? 1.25 : 1.05), v === 41 ? 4 : 3]; // chair rail
    const paint = style === 'wall_dirt' || !WALLS[style] ? 0x5a6a78 : WOOD0; // the bedroom's panels are painted a faded blue
    const panel = Math.floor((u + 4) / 26), pl = (u + 4) % 26;
    if (pl < 2 || v < 9 || v > 34) return [mulc(paint, 1.08), 2]; // frame
    if (paint !== WOOD0 && hash2(u >> 1, v >> 1, seed + 6) < 0.02) return [0x8a6a48, 1]; // chipped paint
    return [mulc(paint, 0.96 + hash2(panel, 1, seed) * 0.08), pl === 2 || v === 34 ? 0 : 1]; // recessed panel
  }
  switch (style) {
    case 'wall_plank': {
      const row = Math.floor(v / 9), lv = v % 9, off = (row * 37) % 80;
      const seam = (u + off) % 80 === 0;
      const pc = mulc(c, 0.86 + Math.floor(hash2(Math.floor((u + off) / 80), row, seed) * 4) * 0.06);
      if (seam) return [mulc(c, 0.55), 0];
      if (lv === 0) return [mulc(pc, 0.62), 3]; // overlapping lip
      if (lv === 1) return [mulc(pc, 0.8), 2];
      const grain = (lv + Math.floor(hash2(row, 7, seed) * 3)) % 3 === 0 && hash2(Math.floor(u / 11), row * 8 + lv, seed) < 0.6;
      if (((u + off) % 80 === 3 || (u + off) % 80 === 76) && lv === 5) return [0x8a8a90, 2]; // nail
      const knot = hash2(Math.floor((u + off) / 80), row, seed + 4) > 0.8 && Math.hypot(((u + off) % 80) - 40, lv - 5) < 1.6;
      return [knot ? mulc(pc, 0.6) : grain ? mulc(pc, 0.9) : pc, 1];
    }
    case 'wall_red': {
      const b = u % 14;
      if (b < 2) return [mulc(c, 0.7), 3]; // batten
      const bc = mulc(c, 0.9 + Math.floor(hash2(Math.floor(u / 14), 2, seed) * 3) * 0.05);
      if ((v + Math.floor(u / 14) * 13) % 37 === 0) return [mulc(bc, 0.8), 1];
      // paint wearing off low down, showing grey wood
      if (v < 30 && hash2(u >> 1, v >> 1, seed + 2) < (30 - v) / 90) return [0x8a7a68, 1];
      return [hash2(u, v >> 3, seed) < 0.04 ? mulc(bc, 1.12) : bc, 1];
    }
    case 'wall_stone': {
      const row = Math.floor(v / 13), off = (row % 2) * 12;
      const bx = Math.floor((u + off) / 24), lx = (u + off) % 24, ly = v % 13;
      if (ly === 0 || lx === 0) return [hash2(u >> 2, v >> 2, seed) < 0.18 && v < 50 ? 0x4f7a34 : mixc(c, 0x2a2420, 0.5), -1];
      const sc = mulc(c, 0.84 + Math.floor(hash2(bx, row, seed) * 5) * 0.06);
      const bev = Math.min(lx, 23 - lx, ly, 12 - ly);
      if (bev === 1) return [lx === 1 || ly === 12 ? mulc(sc, 1.12) : mulc(sc, 0.86), 1];
      return [mulc(sc, sp3(u, v, 2, seed, 0.08, 0.12)), 2 + (n(u, v) > 0.3 ? 1 : 0) + (hash2(bx, row, seed + 1) < 0.3 ? 1 : 0)];
    }
    case 'wall_brick': {
      const row = Math.floor((v - 42) / 8), off = (row % 2) * 9;
      const lx = (u + off) % 18, ly = (v - 42) % 8;
      if (ly === 0 || lx === 0) return [0xb8a890, 0];
      const bc = mulc(c, 0.84 + Math.floor(hash2(Math.floor((u + off) / 18), row, seed) * 5) * 0.06);
      return [ly === 7 ? mulc(bc, 1.1) : lx === 17 ? mulc(bc, 0.88) : mulc(bc, sp3(u, v, 3, seed, 0.06, 0.1)), 1];
    }
    case 'wall_paper': {
      let col = c;
      const fu = (u + (Math.floor(v / 16) % 2) * 8) % 16, fv = v % 16;
      if (fv >= 4 && fv <= 11 && fu >= 4 && fu <= 11) {
        const dx = Math.abs(fu - 7.5), dy = Math.abs(fv - 7.5);
        if (dx < 1 && dy < 1) col = 0xf0d890;
        else if (dx + dy < 3.6) col = 0xe8a0b0;
        else if (dx < 0.6 || dy < 0.6) col = 0x8ab07a;
      }
      if (u % 16 === 0 && v % 3 === 0) col = mulc(c, 0.92);
      // a peeling corner of paper here and there
      if (hash2(u >> 4, v >> 4, seed + 5) < 0.04 && (u & 15) + (v & 15) < 8) return [0xd8ccb0, 2];
      return [col, 0];
    }
    default: {
      // lime plaster over the earth: warm cream, trowelled, a little smoky up toward the plate
      let col = mulc(0xdcc6a0, 0.97 + n2(u / 40, v / 40, seed + 7) * 0.05 + n2(u / 12, v / 12, seed + 8) * 0.025);
      const up = (v - 42) / (H - PLATE - 42);
      if (up > 0.7) col = mixc(col, 0x6a5440, (up - 0.7) * 0.3);
      // here and there it has come away, showing the stones behind
      const sx = Math.floor(u / 90), sy = Math.floor(v / 60);
      if (hash2(sx, sy, seed + 5) < 0.12) {
        const cx = sx * 90 + 20 + hash2(sx, sy, seed + 6) * 50, cy = sy * 60 + 15 + hash2(sx, sy, seed + 7) * 30;
        const d = Math.hypot((u + 0.5 - cx) / 9, (v + 0.5 - cy) / 6) + (hash2(u >> 1, v >> 1, seed) - 0.5) * 0.3;
        if (d < 1) return [mixc(0x8a7a66, 0x6a5a4c, hash2(u >> 2, v >> 2, seed)), 0];
        if (d < 1.15) return [mulc(col, 0.82), 2];
      }
      void n;
      return [col, 1];
    }
  }
}

/**
 * Fine per-texel detail painted into the wall texture only (no geometry): wood grain on the
 * timbers, speckle on stone and iron, and in packed earth pebbles, root hairs, worm holes and the
 * old owner's claw scrapes. Returns the new sRGB colour.
 */
export function wallDetail(style, u, v, c, seed, rel, kind) {
  if (kind === 'rock') return c;
  const h = hash2(u, v, seed + 21);
  if (kind === 'woody' || kind === 'woodx' || kind === 'woodd' || kind === 'endgrain') {
    // grain streaks along the timber
    const along = kind === 'woody' ? v : u, across = kind === 'woody' ? u : v;
    const streak = hash2(across, Math.floor(along / 7), seed + 23);
    let k = 0.97 + h * 0.06;
    if (streak < 0.18) k *= 0.88; else if (streak > 0.9) k *= 1.08;
    if (kind === 'endgrain' && (u + v) % 3 === 0) k *= 0.9;
    return mulc(c, k);
  }
  if (kind === 'stone') { const sp = hash2(u >> 1, v, seed + 37); return mulc(c, sp < 0.1 ? 0.86 : sp > 0.93 ? 1.1 : 1); }
  if (kind === 'iron') return h > 0.92 ? mixc(c, 0x8a4a2a, 0.4) : c;
  let k = 0.985 + h * 0.03;
  if (style === 'wall_dirt' || !WALLS[style]) {
    // trowel smears: short horizontal dabs a shade lighter or darker
    const sm = hash2(Math.floor((u + v * 5) / 13), v >> 1, seed + 30);
    if (sm < 0.14) k *= 0.96; else if (sm > 0.9) k *= 1.03;
    return mulc(c, k);
  } else if (style === 'wall_plank' || style === 'wall_red') {
    if (hash2(Math.floor(u / 9), v, seed + 29) < 0.14) k *= 0.92;
  } else if (style === 'wall_stone' || style === 'wall_brick') {
    const sp = hash2(u >> 1, v >> 1, seed + 36);
    if (sp < 0.05) k *= 0.86; else if (sp > 0.97) k *= 1.1;
  }
  return mulc(c, k);
}

/** Nearest post to u: { d, i, side } (posts = sorted centre positions in voxels). */
export function nearestPost(posts, u) {
  let best = null;
  for (let i = 0; i < posts.length; i++) {
    const d = u + 0.5 - posts[i];
    const ad = Math.abs(d);
    if (!best || ad < best.d) best = { d: ad, i, side: d < 0 ? -1 : 1 };
  }
  if (best) best.d = Math.floor(best.d);
  return best;
}

/**
 * The ceiling deck seen from below: [color, relief] at (u along x, v along z) in voxels.
 * joists: joist centre u positions. Boards run along x, 10 voxels wide; joists run along z.
 */
export function ceilVoxel(u, v, seed, joists, rock = true) {
  // joists: 10 voxels wide, standing 11 voxels below the boards (old grey timbers under the rock)
  for (let i = 0; i < joists.length; i++) {
    const d = u + 0.5 - joists[i];
    if (Math.abs(d) < 5) {
      const edge = Math.abs(d) > 4;
      const g = Math.floor(v / 13 + i * 3) % 4 === 0 ? 0.93 : 1;
      if (v % 61 === 30 && Math.abs(d) < 1) return [0x3a3a44, 12]; // an iron dog spike
      if (rock) return [edge ? 0x34302a : mulc(GREYW, g), edge ? 10 : 11];
      return [edge ? mulc(0x3e2616, 1) : mulc(0x5e3c22, g * sp3(u, v, 7, seed, 0.06, 0.08)), edge ? 10 : 11];
    }
  }
  if (rock) {
    // the cave's roof: lumpy dark rock, cracks, roots poking through
    const lump = n2(u / 19, v / 19, seed + 13) * 0.7 + n2(u / 6, v / 6, seed + 14) * 0.3;
    let c = mulc(ROCK[Math.floor(hash2(u >> 3, v >> 3, seed + 15) * ROCK.length)], 0.82);
    if (Math.abs(n2(u / 10, v / 10, seed + 16)) < 0.05) c = 0x241e1a;
    if ((u * 5 + v * 3) % 53 < 2 && hash2(u >> 2, v >> 2, seed + 17) < 0.5) c = 0x3e2c1e;
    return [c, Math.max(0, Math.round(3 + lump * 4))];
  }
  const row = Math.floor(v / 10), lv = v % 10;
  const off = (row * 53) % 140;
  const bi = Math.floor((u + off) / 140);
  const bh = hash2(bi, row, seed);
  const base = mulc(0x6e4a2c, 0.82 + Math.floor(bh * 4) * 0.06);
  if (lv === 0) return hash2(u >> 3, row, seed + 1) < 0.25 ? [0x1a120c, 0] : [mulc(base, 0.55), 1]; // gaps between boards (dark)
  if ((u + off) % 140 === 0) return [mulc(base, 0.5), 1];
  const grain = (lv + Math.floor(bh * 5)) % 3 === 0 && hash2(Math.floor(u / 9), row * 10 + lv, seed) < 0.65;
  const stain = hash2(u >> 4, v >> 4, seed + 2) < 0.06 ? 0.82 : 1; // water stains
  return [mulc(grain ? mulc(base, 0.9) : base, stain), lv === 1 || lv === 9 ? 1 : 2];
}

// The burrow's walls and ceiling as 1/64 m voxel reliefs, seen from inside in first person.
// Every wall gets the same heavy timber frame (posts on stone footings, iron straps, knee braces,
// a crown plate with beam ends) around an infill in the chosen wall style; the ceiling is a deck of
// boards on joists with the ragged hole the mole fell through and the lift's pulley opening.
import { WALLS } from '../data/furniture.js';
import { hash2 } from '../iso/surface.js';
import { mulc, mixc, sp3 } from '../iso/kit.js';
import { WALL_V } from './units.js';

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

/** [color, relief] for wall voxel (u along, v up) in style id. relief in voxels (+ = sticks out). */
export function wallVoxel(style, u, v, seed, n, post) {
  const w = WALLS[style] || WALLS.wall_dirt;
  const c = w.color;
  const H = WALL_V;
  const fr = frameVoxel(u, v, seed, post);
  if (fr) return fr;
  if (style !== 'wall_dirt' && v < 6) return [mulc(v === 5 ? mulc(WOOD0, 1.15) : mulc(WOOD0, 0.92), sp3(u, v, 1, seed, 0.06, 0.1)), v === 5 ? 3 : 2];
  const wains = style === 'wall_brick' || style === 'wall_paper';
  if (wains && v < 42) {
    if (v >= 38) return [mulc(WOOD0, v === 41 ? 1.25 : 1.05), v === 41 ? 4 : 3]; // chair rail
    const panel = Math.floor((u + 4) / 26), pl = (u + 4) % 26;
    if (pl < 2 || v < 9 || v > 34) return [mulc(WOOD0, 1.08), 2]; // frame
    return [mulc(WOOD0, 0.96 + hash2(panel, 1, seed) * 0.08), pl === 2 || v === 34 ? 0 : 1]; // recessed panel
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
      // packed earth over a fieldstone footing: wavy strata, embedded stones, roots, flecks, a damp band
      if (v < 15) {
        const row = v < 7 ? 0 : 1, off = row * 9;
        const bx = Math.floor((u + off) / 19), lx = (u + off) % 19, ly = row ? v - 7 : v;
        if (lx === 0 || ly === 0) return [0x3a2c22, 0];
        const sc = [0x7a7068, 0x6a625a, 0x8a8076, 0x5e564e][Math.floor(hash2(bx, row, seed) * 4)];
        const top = row ? ly >= 7 : ly >= 6;
        return [top ? mulc(sc, 1.1) : lx === 18 ? mulc(sc, 0.85) : mulc(sc, sp3(u, v, 4, seed, 0.1, 0.1)), top ? 2 : 3];
      }
      const strata = Math.floor((v + Math.sin(u * 0.08 + seed) * 5 + n(u * 0.5, v) * 7) / 12);
      let col = mulc(c, 0.86 + (strata % 3) * 0.075);
      if (hash2(u >> 1, v >> 1, seed + 3) < 0.04) col = mulc(col, 0.84);
      // fieldstones bedded in the earth: flat-faced, a dark crevice round each one
      const sx = Math.floor(u / 30), sy = Math.floor(v / 26);
      const sh = hash2(sx, sy, seed + 5);
      if (sh < 0.26) {
        const cx = sx * 30 + 7 + hash2(sx, sy, seed + 6) * 16, cy = sy * 26 + 6 + hash2(sx, sy, seed + 7) * 14;
        const r = 2.5 + hash2(sx, sy, seed + 8) * 3.5;
        const d = Math.hypot(u + 0.5 - cx, (v + 0.5 - cy) * 1.3);
        if (d < r) {
          const sc = [0x8a8078, 0x6e665e, 0x9a8c7c, 0x7a6e64][Math.floor(sh * 12) % 4];
          const lit = (cx - u) * 0.4 + (v - cy) * 0.6;
          return [mulc(sc, 0.9 + Math.max(-0.12, Math.min(0.18, lit * 0.07))), d < r * 0.55 ? 2 : 1];
        }
        if (d < r + 1.2) return [mixc(c, 0x1e1610, 0.55), 0];
      }
      // roots snaking down from under the crown plate
      const ru = Math.floor(u / 44);
      if (hash2(ru, 0, seed + 9) < 0.5) {
        const rx = ru * 44 + 9 + hash2(ru, 1, seed + 9) * 26 + Math.sin(v * 0.1 + ru) * 3.5 + Math.sin(v * 0.29 + ru * 2) * 1.3;
        const end = (H - PLATE) * (0.25 + hash2(ru, 2, seed + 9) * 0.4);
        const wdt = 1.2 + (v / H) * 1.5;
        if (v > H - PLATE - end && Math.abs(u + 0.5 - rx) < wdt) return [mixc(0x6a4a2e, 0x3e2818, (u + 0.5 - rx + wdt) / (2 * wdt) * 0.6), 3];
      }
      // mineral flecks catching the light
      const fl = hash2(u, v, seed + 11);
      if (fl > 0.9997) return [0xb89a5a, 1];
      if (v < 26) col = mixc(col, 0x2e241c, (26 - v) / 26 * 0.3);
      return [col, n(u, v) > 0.62 ? 1 : 0];
    }
  }
}

/**
 * Fine per-texel detail painted into the wall texture only (no geometry): wood grain on the
 * timbers, speckle on stone and iron, and in packed earth pebbles, root hairs, worm holes and the
 * old owner's claw scrapes. Returns the new sRGB colour.
 */
export function wallDetail(style, u, v, c, seed, rel, kind) {
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
    if (sm < 0.14) k *= 0.93; else if (sm > 0.9) k *= 1.06;
    // little pebbles on a jittered grid: round, lit from above
    const px = Math.floor(u / 15), py = Math.floor(v / 13);
    if (hash2(px, py, seed + 31) < 0.3) {
      const cx = px * 15 + 3 + hash2(px, py, seed + 32) * 9, cy = py * 13 + 3 + hash2(px, py, seed + 33) * 7;
      const r = 1.1 + hash2(px, py, seed + 34) * 1.3;
      const dx = u + 0.5 - cx, dy = v + 0.5 - cy, d = Math.hypot(dx, dy * 1.2);
      if (d < r) {
        const base = [0x8a8078, 0x9a8c7c, 0x6e665e, 0x7a5a42][Math.floor(hash2(px, py, seed + 35) * 4)];
        return mulc(base, dy > r * 0.3 ? 1.12 : dy < -r * 0.3 ? 0.78 : 0.95);
      }
      if (d < r + 0.9 && dy < 0) return mulc(c, 0.8); // the pebble's shadow below it
    }
    // root hairs: thin wavy dark lines running down
    const wu = u + Math.sin(v * 0.21 + u * 0.05) * 3;
    const rh = Math.floor(wu / 23);
    if (hash2(rh, Math.floor(v / 40), seed + 25) < 0.2 && Math.abs((wu % 23) - 11) < 0.55) return mulc(c, 0.76);
    // claw scrapes: little groups of three diagonal strokes
    const cx = Math.floor(u / 52), cy = Math.floor(v / 46);
    if (hash2(cx, cy, seed + 26) < 0.3) {
      const lu = u - cx * 52 - 14 - hash2(cx, cy, seed + 27) * 20, lv = v - cy * 46 - 10 - hash2(cx, cy, seed + 28) * 20;
      if (lv >= 0 && lv < 14) { const off = lu - lv * 0.35; if (off >= 0 && off < 9 && Math.round(off) % 3 === 0) return mulc(c, off % 3 < 0.5 ? 0.72 : 0.8); }
    }
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
export function ceilVoxel(u, v, seed, joists) {
  // joists: 10 voxels wide, standing 11 voxels below the boards
  for (let i = 0; i < joists.length; i++) {
    const d = u + 0.5 - joists[i];
    if (Math.abs(d) < 5) {
      const edge = Math.abs(d) > 4;
      const g = Math.floor(v / 13 + i * 3) % 4 === 0 ? 0.93 : 1;
      if (v % 61 === 30 && Math.abs(d) < 1) return [0x3a3a44, 12]; // an iron dog spike
      return [edge ? mulc(0x3e2616, 1) : mulc(0x5e3c22, g * sp3(u, v, 7, seed, 0.06, 0.08)), edge ? 10 : 11];
    }
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

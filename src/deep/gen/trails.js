// Old trails: tunnels the old miners dug by hand between the lifts, the burrows and the town. A
// flat, trodden floor, a rounded roof, walls with pick marks, timber frames every few steps,
// sleepers of an old cart track, a lantern now and then, and ladder shafts where the way drops.
// Here and there the roof has come down (a plug of rubble and a snapped cap beam to dig through,
// only where the trail ran through solid rock); where the way crosses open cave, a chasm or
// water, the old miners laid a plank deck on timber stringers (Ruins.js adds the hand ropes, the
// signposts, the rails, carts and lost tools).
//
// Pure and deterministic (it runs in the chunk workers too). A trail is a chain of plan features,
// one straight segment each: { kind: 'trail', a: {x,y,z}, b: {x,y,z}, w, h, seed, ladder?, rails? }.
import { M, VOX, MAT } from '../materials.js';
import { h3 } from '../noise.js';

export const TRAIL_W = 1.3; // meters, wall to wall
export const TRAIL_H = 1.6; // floor to the top of the arch
const FRAME = 1.7; // meters between timber frames

/** The bounding box of a segment (meters). */
export function trailBB(f) {
  const w = (f.w || TRAIL_W) / 2 + 0.5, h = (f.h || TRAIL_H) + 0.5;
  return [Math.min(f.a.x, f.b.x) - w, Math.min(f.a.y, f.b.y) - 0.5, Math.min(f.a.z, f.b.z) - w, Math.max(f.a.x, f.b.x) + w, Math.max(f.a.y, f.b.y) + h, Math.max(f.a.z, f.b.z) + w];
}

/** Lantern spots along a segment (meters), for the plan's lights. */
export function trailLanterns(f) {
  if (f.ladder) return [];
  const dx = f.b.x - f.a.x, dz = f.b.z - f.a.z, len = Math.hypot(dx, dz);
  const out = [];
  for (let s = FRAME * 3; s < len - 0.5; s += FRAME * 5) {
    if (h3(Math.round(s * 10), f.seed, 7, 91) < 0.35) continue; // some have gone out
    const t = s / len;
    out.push({ x: f.a.x + dx * t, y: f.a.y + (f.b.y - f.a.y) * t + (f.h || TRAIL_H) - 0.42, z: f.a.z + dz * t });
  }
  return out;
}

/** The cave-in on a segment, if it has one: { s, hl } (metres along it, half length). */
export function trailCollapse(f) {
  if (f.ladder) return null;
  const len = Math.hypot(f.b.x - f.a.x, f.b.z - f.a.z);
  if (len < 4.2 || h3(f.seed, 3, 1, 77) > 0.18) return null;
  return { s: len * (0.3 + h3(f.seed, 5, 2, 78) * 0.4), hl: 0.45 + h3(f.seed, 6, 3, 79) * 0.45 };
}

const NATURAL = (m) => m > 0 && m < 40 && m !== M.TIMBER && m !== M.BOARDS && m !== M.BURROW && m !== M.LANTERN && m !== M.BRICK && m !== M.DOOR && m !== M.LADDER && m !== M.BEDROCK;
const FLUIDM = (m) => m === M.WATER || m === M.LAVA;
/** Loose stuff (gravel, sand, ash, snow, rubble) pours once disturbed: packed hard round a tunnel. */
export const looseM = (m) => !!(MAT[m] && MAT[m].gran);

/** Carve one segment into a chunk (vox: Uint8Array CS³, chunk origin X0/Y0/Z0 in voxels). */
export function stampTrail(f, vox, X0, Y0, Z0, CS) {
  const bb = f.bb || trailBB(f);
  const lx0 = Math.max(0, Math.floor(bb[0] * VOX) - X0), lx1 = Math.min(CS, Math.ceil(bb[3] * VOX) - X0);
  const ly0 = Math.max(0, Math.floor(bb[1] * VOX) - Y0), ly1 = Math.min(CS, Math.ceil(bb[4] * VOX) - Y0);
  const lz0 = Math.max(0, Math.floor(bb[2] * VOX) - Z0), lz1 = Math.min(CS, Math.ceil(bb[5] * VOX) - Z0);
  if (lx0 >= lx1 || ly0 >= ly1 || lz0 >= lz1) return;
  if (f.ladder) { ladderShaft(f, vox, X0, Y0, Z0, CS, lx0, lx1, ly0, ly1, lz0, lz1); return; }
  const w = f.w || TRAIL_W, h = f.h || TRAIL_H, hw = w / 2, r = hw * 0.85;
  const dx = f.b.x - f.a.x, dz = f.b.z - f.a.z, dy = f.b.y - f.a.y;
  const len = Math.hypot(dx, dz) || 1e-6;
  const ux = dx / len, uz = dz / len; // along
  const lan = trailLanterns(f);
  const col = trailCollapse(f);
  for (let z = lz0; z < lz1; z++) for (let y = ly0; y < ly1; y++) for (let x = lx0; x < lx1; x++) {
    const vx = X0 + x, vy = Y0 + y, vz = Z0 + z;
    const xm = (vx + 0.5) / VOX, ym = (vy + 0.5) / VOX, zm = (vz + 0.5) / VOX;
    const px = xm - f.a.x, pz = zm - f.a.z;
    const s = px * ux + pz * uz; // distance along
    if (s < -hw || s > len + hw) continue;
    const t = Math.max(0, Math.min(1, s / len));
    const lat = px * -uz + pz * ux; // sideways
    const fy = f.a.y + dy * t; // floor height here
    const up = ym - fy;
    // pick-marked walls: the width wobbles a little, chunk-free (hashed on a 12 cm grid)
    const wob = (h3(Math.floor(s * 8), Math.floor(up * 8), f.seed, 17) - 0.5) * 0.09;
    const al = Math.abs(lat), wl = hw + wob;
    const inside = up >= 0 && up < h && al < wl && (up < h - r || (al - (wl - r)) ** 2 + (up - (h - r)) ** 2 < r * r);
    // round the ends where segments meet, so a chain of them is one smooth tunnel
    const endOk = (s >= 0 && s <= len) || Math.hypot(s < 0 ? s : s - len, lat) < hw;
    const vi = x + CS * (y + CS * z);
    const cur = vox[vi];
    if (cur === M.BEDROCK || cur === M.BURROW || cur === M.LANTERN || cur >= 96) continue;
    if (inside && endOk) {
      // a cave-in: the roof came down here (only where the trail ran through solid rock)
      if (col && NATURAL(cur)) {
        const ds = Math.abs(s - col.s) / col.hl + (h3(vx >> 1, vy >> 1, vz >> 1, f.seed + 3) - 0.5) * 0.35;
        const top = h * (1.25 - ds * ds * 0.55);
        if (ds < 1.5 && up < top) {
          // a snapped cap beam lies slantwise through the heap
          const beam = Math.abs(up - (0.35 + (s - col.s) * 0.45)) < 0.07 && Math.abs(lat - (s - col.s) * 0.5) < 0.42 && al < wl - 0.05;
          vox[vi] = beam ? M.TIMBER : h3(vx >> 2, vy >> 2, vz >> 2, f.seed + 4) < 0.22 ? cur : M.RUBBLE;
          continue;
        }
      }
      vox[vi] = 0;
      // timber frames: posts against the walls and a cap beam under the arch
      const fs = ((s % FRAME) + FRAME) % FRAME;
      if (fs < 0.13 && s > 0.3 && s < len - 0.3) {
        if (al > wl - 0.14 && up < h - r + 0.25) vox[vi] = M.TIMBER;
        else if (up > h - r + 0.1 && up < h - r + 0.24) vox[vi] = M.TIMBER;
      }
      // the old cart track: sleepers across the floor
      if (f.rails && up < 1 / VOX && al < 0.42 && ((s % 0.5) + 0.5) % 0.5 < 0.13) vox[vi] = M.TIMBER;
      // a lantern hanging under a cap beam
      for (const L of lan) if (Math.abs(xm - L.x) < 0.07 && Math.abs(zm - L.z) < 0.07 && ym > L.y - 0.07 && ym < L.y + 0.1) vox[vi] = M.LANTERN;
    } else if (up >= -1 / VOX && up < 0 && al < wl - 0.02 && endOk) {
      if (cur && !FLUIDM(cur)) {
        // a trodden floor: packed earth, gravel in the wetter stretches
        if (cur !== M.TIMBER && cur < 40) vox[vi] = h3(vx >> 2, vy, vz >> 2, f.seed) < 0.3 ? M.GRAVEL : M.DIRT;
      } else if (s > 0.05 && s < len - 0.05 || cur === 0) {
        // nothing underfoot (open cave, a chasm, water): a plank deck on timber stringers
        const stringer = al > wl - 0.17;
        const plank = ((s * 8) % 1 + 1) % 1 < 0.78;
        if (stringer || plank) vox[vi] = stringer ? M.TIMBER : M.BOARDS;
      }
    } else if (up >= -2 / VOX && up < -1 / VOX && al > wl - 0.17 && al < wl - 0.02 && endOk && (!cur || FLUIDM(cur))) {
      vox[vi] = M.TIMBER; // the stringers are two voxels deep
    } else if (looseM(cur) && up >= -0.12 && up < h + 0.4 && al < wl + 0.4 && s > -hw - 0.4 && s < len + hw + 0.4) {
      // the walls and roof round the tunnel hold their shape: loose stuff packed into earth
      vox[vi] = M.DIRT;
    }
  }
}

// a square shaft straight down with a ladder on one wall and a plank landing at the bottom
function ladderShaft(f, vox, X0, Y0, Z0, CS, lx0, lx1, ly0, ly1, lz0, lz1) {
  const top = Math.max(f.a.y, f.b.y), bot = Math.min(f.a.y, f.b.y);
  const cx = f.a.x, cz = f.a.z, hs = 0.6;
  for (let z = lz0; z < lz1; z++) for (let y = ly0; y < ly1; y++) for (let x = lx0; x < lx1; x++) {
    const xm = (X0 + x + 0.5) / VOX, ym = (Y0 + y + 0.5) / VOX, zm = (Z0 + z + 0.5) / VOX;
    const ax = xm - cx, az = zm - cz;
    if (Math.abs(ax) > hs + 0.4 || Math.abs(az) > hs + 0.4 || ym < bot - 0.1 || ym > top + TRAIL_H + 0.4) continue;
    const vi = x + CS * (y + CS * z);
    const cur = vox[vi];
    if (Math.abs(ax) > hs || Math.abs(az) > hs || ym < bot || ym > top + TRAIL_H) { if (looseM(cur)) vox[vi] = M.DIRT; continue; }
    if (cur === M.BEDROCK || cur === M.BURROW) continue;
    // the ladder: two rails and rungs against the -z wall, from the bottom to the top lip
    const onWall = az < -hs + 0.12;
    const rail = Math.abs(Math.abs(ax) - 0.2) < 0.04;
    const rung = Math.abs(ax) < 0.2 && ((ym - bot) * 4 % 1) < 0.25;
    if (onWall && ym < top + 0.2 && (rail || rung)) vox[vi] = M.LADDER;
    else if (onWall && ym < top + 0.2) vox[vi] = cur || M.DIRT;
    else vox[vi] = 0;
  }
}

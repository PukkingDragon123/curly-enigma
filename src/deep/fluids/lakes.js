// Lakes that hold their water (plan time, see Generator.makePlan → settleLakes).
//
// A lake is an ellipsoid pocket stamped into the rock, filled up to a level. Cave ways and caverns
// often cross its shell below that level, and the water would stand there as a wall facing open
// air. So a lake gets a watertight shell (`f.shell`: clay, limestone or ice for water, obsidian for
// lava) that the stamp lays wherever the natural caves are open just outside it, below the
// waterline: tunnels end in a wet clay wall you can dig into (and get flooded), while caves that
// meet the air dome above the water open onto the lake. Rooms, trails and burrows carved after the
// lake can't be sealed that way, so where one of them crosses the shell the level drops to just
// under it (water finds its own level). Pure and cheap; the same in the workers and the main thread.
import { M } from '../materials.js';

const STEP_Y = 0.2; // m between rings
const STEP_A = 0.45; // m between samples round a ring

/** Is (x, y, z) inside an air-carving feature (other than lakes)? Conservative for odd shapes. */
function carved(g, x, y, z) {
  const b = g.bb;
  if (!b || x < b[0] || y < b[1] || z < b[2] || x > b[3] || y > b[4] || z > b[5]) return false;
  switch (g.kind) {
    case 'sphere': {
      if (g.m !== 0) return false;
      const dx = (x - g.x) / g.r, dy = (y - g.y) / (g.ry || g.r), dz = (z - g.z) / g.r;
      return dx * dx + dy * dy + dz * dz < 1.05;
    }
    case 'box': case 'mouth':
      return (g.m === 0 || g.kind === 'mouth') && x > g.x0 && x < g.x1 && y > g.y0 && y < g.y1 && z > g.z0 && z < g.z1;
    case 'trail': {
      const dx = g.b.x - g.a.x, dz = g.b.z - g.a.z, len = Math.hypot(dx, dz) || 1e-6;
      const px = x - g.a.x, pz = z - g.a.z, s = (px * dx + pz * dz) / len;
      const hw = (g.w || 1.3) / 2 + 0.15;
      if (s < -hw || s > len + hw) return false;
      const lat = Math.abs((px * -dz + pz * dx) / len);
      const fy = g.a.y + (g.b.y - g.a.y) * Math.max(0, Math.min(1, s / len));
      if (g.ladder) return Math.hypot(px, pz) < 1 && y > Math.min(g.a.y, g.b.y) - 0.2 && y < Math.max(g.a.y, g.b.y) + 2;
      return lat < hw && y > fy - 0.15 && y < fy + (g.h || 1.6) + 0.1;
    }
    case 'lake': case 'cage': return false;
    default: return true; // ruins, burrows, geodes, the shaft, the gate, the prologue: their box
  }
}

/** The water level (m) a lake can hold: its nominal top, or just under the lowest carved room. */
export function lakeLevel(plan, f) {
  const nominal = f.y - f.r * 0.12, ry = f.r * 0.55;
  const bb = f.bb || [f.x - f.r - 1, f.y - ry - 1, f.z - f.r - 1, f.x + f.r + 1, f.y + ry + 1, f.z + f.r + 1];
  const others = plan.features.filter((g) => g !== f && g.kind !== 'lake' && g.bb && g.bb[0] < bb[3] && g.bb[3] > bb[0] && g.bb[1] < bb[4] && g.bb[4] > bb[1] && g.bb[2] < bb[5] && g.bb[5] > bb[2]);
  for (let y = f.y - ry + 0.12; y < nominal + 0.05; y += STEP_Y) {
    const dy = (y - f.y) / ry;
    const k = 1 - dy * dy;
    if (k <= 0) continue;
    // a ring round the outside of the shell (d² < 1.32, jittered by ±5%)
    const rr = f.r * Math.sqrt(k) * 1.17 + 0.1;
    const n = Math.max(10, Math.ceil((Math.PI * 2 * rr) / STEP_A));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = f.x + Math.cos(a) * rr, z = f.z + Math.sin(a) * rr;
      if (others.some((g) => carved(g, x, y, z))) return Math.min(nominal, y - 0.35);
    }
    // and straight down through the floor
    if (y < f.y - ry + 0.15 && others.some((g) => carved(g, f.x, f.y - ry - 0.1, f.z))) return f.y - ry;
  }
  return nominal;
}

/** The rock a lake's shell is made of, by the stratum it sits in. */
function shellOf(f, zone) {
  if (f.fluid === M.LAVA) return M.OBSIDIAN;
  return zone >= 5 ? M.ICE : zone === 3 ? M.LIMESTONE : M.CLAY;
}

/**
 * Give every lake of the plan its level (`f.wl`, meters: the stamp fills fluid below it) and its
 * shell material (`f.shell`: laid in open cave just outside the pocket, below the waterline).
 */
export function settleLakes(plan, zoneAt) {
  if (!plan.features.some((f) => f.kind === 'lake')) return;
  if (!plan.features.every((f) => f.bb)) return; // needs the features' boxes
  for (const f of plan.features) {
    if (f.kind !== 'lake' || f.wl !== undefined) continue;
    f.wl = lakeLevel(plan, f);
    f.shell = shellOf(f, zoneAt ? zoneAt(-f.y) : 1);
  }
}

/** The voxel layer holding a lake's top (as the stamp fills it: cells whose centre is under wl). */
export function lakeTop(f, VOX) {
  const wl = f.wl ?? f.y - f.r * 0.12;
  return Math.ceil(wl * VOX - 0.5) - 1;
}

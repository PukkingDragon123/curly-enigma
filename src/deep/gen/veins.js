// Ore veins: how the ore lies in the rock (plan time, then stamped chunk by chunk).
//
// Every ore area of a zone is a vein system now, not a blob: a main vein tens of metres long, one
// to three branches splitting off it, and nuggets (the ore deposits the mining code knows: little
// round bodies of ore that come free whole) strung along them, with a rich pocket of bigger
// nuggets where a branch splits off and at its end; gem veins may end in a geode. The vein itself
// is a ribbon of vein rock (materials.js: quartz, gossan, malachite, coal shale, crystal, lumen,
// ember, marl, kimberlite, rime), pinching and swelling, that shows where a cave cuts it: follow
// the coloured band along the wall and dig where it leads.
//   seam   follows the strata: it keeps to one bedding plane of the zone's layered rock (the same
//          banding the rock's materials follow), wandering slowly, its ribbon lying flat
//   fault  fills a steep crack: a plane dipping 55–85°, the vein running along it and wandering up
//          and down in it, its ribbon spanning down the dip
// Veins are placed where they meet caves (a few candidate places are scored by how much of the
// vein runs near open cave), so most of them show somewhere. Pure and deterministic.
import { M } from '../materials.js';
import { ORE_ID, ORE_SPAWN } from '../../data/ores.js';
import { h3 } from '../noise.js';

/** The vein rock an ore sits in. */
export const VEIN_OF = {
  coal: M.VEIN_COAL, copper_ore: M.VEIN_MALACHITE, tin_ore: M.VEIN_QUARTZ, salt_crystal: M.VEIN_QUARTZ, fossil: M.VEIN_MARL,
  quartz: M.VEIN_QUARTZ, iron_ore: M.VEIN_GOSSAN, amber: M.VEIN_MARL, lumite: M.VEIN_GLOW, silver_ore: M.VEIN_QUARTZ,
  echo_crystal: M.VEIN_AMETHYST, gravium: M.VEIN_AMETHYST, bioxide: M.VEIN_GLOW, amethyst: M.VEIN_AMETHYST, gold_ore: M.VEIN_QUARTZ,
  ruby: M.VEIN_EMBER, magmaite: M.VEIN_EMBER, emerald: M.VEIN_MALACHITE, frostite: M.VEIN_FROST, sapphire: M.VEIN_FROST,
  mithril_ore: M.VEIN_QUARTZ, moonsilver_ore: M.VEIN_QUARTZ, diamond: M.VEIN_KIMBER, voidstone: M.VEIN_AMETHYST,
  adamant_ore: M.VEIN_KIMBER, starmetal_ore: M.VEIN_EMBER, sunstone: M.VEIN_EMBER, truffle: M.VEIN_MARL,
};
const SEAM = new Set(['coal', 'salt_crystal', 'fossil', 'amber', 'truffle', 'iron_ore']);
export const GEMS = new Set(['quartz', 'amethyst', 'echo_crystal', 'ruby', 'emerald', 'sapphire', 'diamond', 'sunstone', 'voidstone', 'frostite']);
const RARE = new Set(['diamond', 'sunstone', 'voidstone']);

const STEP = 0.9; // m between path points
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** The strata band at a point, as the generator's coarse field has it. */
const bandAt = (plan, x, y, z) => -y + plan.noise[3].fbm(x / 9, y / 9, z / 9, 2) * 3.2;
/** The height near y0 where the band is B (a few Newton steps: d band / dy ≈ -1). */
function onBand(plan, x, z, B, y0) {
  let y = y0;
  for (let i = 0; i < 4; i++) y += bandAt(plan, x, y, z) - B;
  return y;
}

/**
 * Trace a vein path from (x, y, z) heading a (radians, in plan): [{x, y, z}] every STEP metres.
 * seam: keeps to band B; fault: in the plane (strike a, dip vector dv), wandering down-dip.
 */
function trace(plan, kind, x, y, z, a, len, rng, B, dv) {
  const pts = [{ x, y, z }];
  const n = Math.max(2, Math.round(len / STEP));
  let ang = a, tau = 0;
  const w1 = rng.range(0.15, 0.4), ph = rng() * 6.283, amp = rng.range(0.4, 1.4), slope = rng.range(-0.25, 0.25);
  const sx = Math.cos(a), sz = Math.sin(a);
  let px = x, py = y, pz = z;
  for (let i = 1; i <= n; i++) {
    if (kind === 'seam') {
      ang += (rng() - 0.5) * 0.35;
      px += Math.cos(ang) * STEP; pz += Math.sin(ang) * STEP;
      py = onBand(plan, px, pz, B, py);
    } else {
      // along the strike, wandering down and up the dip in the plane
      const s = i * STEP;
      tau = Math.sin(s * w1 / 2 + ph) * amp + s * slope;
      px = x + sx * s + dv[0] * tau; py = y + dv[1] * tau; pz = z + sz * s + dv[2] * tau;
    }
    pts.push({ x: px, y: py, z: pz });
  }
  return pts;
}

/** Segments of a ribbon along pts: width axis b (seam: level, across; fault: the dip), normal n. */
function ribbon(pts, kind, dv, t, w, s0, seed, list) {
  let acc = s0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const A = pts[i], B = pts[i + 1];
    let ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
    const len = Math.hypot(ux, uy, uz) || 1e-3;
    ux /= len; uy /= len; uz /= len;
    let bx, by, bz;
    if (kind === 'seam') { const l = Math.hypot(uz, ux) || 1; bx = -uz / l; by = 0; bz = ux / l; }
    else { bx = dv[0]; by = dv[1]; bz = dv[2]; }
    // n = u × b
    let nx = uy * bz - uz * by, ny = uz * bx - ux * bz, nz = ux * by - uy * bx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    // b re-made square to u and n
    bx = ny * uz - nz * uy; by = nz * ux - nx * uz; bz = nx * uy - ny * ux;
    const pad = Math.max(t * 1.8, w * 1.2) + 0.1;
    list.push({
      ax: A.x, ay: A.y, az: A.z, ux, uy, uz, len, bx, by, bz, nx, ny, nz, t, w, s0: acc, seed,
      x0: Math.min(A.x, B.x) - pad, y0: Math.min(A.y, B.y) - pad, z0: Math.min(A.z, B.z) - pad,
      x1: Math.max(A.x, B.x) + pad, y1: Math.max(A.y, B.y) + pad, z1: Math.max(A.z, B.z) + pad,
    });
    acc += len;
  }
  return acc;
}

/**
 * Plan the veins of every zone: pushes ore areas ({ vein: true }, their deposits strung along the
 * veins) into plan.areas, the vein ribbons into plan.veins and gem-vein geodes into plan.geodes /
 * plan.features. density: caveDensity (to find walls), zoneDepths: ZONE_DEPTHS, near: { x, z, r,
 * zone, n } (the first n veins of that zone start near there: the first ores by the burrow).
 */
export function planVeins(plan, rng, density, zoneDepths, near) {
  plan.veins = [];
  for (let zone = 1; zone <= 6; zone++) {
    const spawn = ORE_SPAWN[zone] || [];
    if (!spawn.length) continue;
    const total = spawn.reduce((s, e) => s + e[1], 0);
    const count = zone === 1 ? 18 : 14;
    for (let k = 0; k < count; k++) {
      let r = rng() * total, ent = spawn[0];
      for (const e of spawn) { r -= e[1]; if (r <= 0) { ent = e; break; } }
      const item = ent[0], size = ent[2] || 2;
      if (ORE_ID[item] === undefined) { rng(); continue; }
      const d0 = zoneDepths[zone - 1] + 3, d1 = zoneDepths[zone] - 3;
      const kind = SEAM.has(item) ? 'seam' : (rng() < 0.7 ? 'fault' : 'seam');
      const len = (5 + size * 3.2 + rng() * 6) * (RARE.has(item) ? 0.6 : 1);
      // a few candidate places; keep the one whose vein runs nearest the caves
      let best = null, bs = -1;
      const tries = 3;
      for (let c = 0; c < tries; c++) {
        let x = rng.range(-72, 72), z = rng.range(-72, 72), y = -rng.range(d0, d1);
        if (near && zone === near.zone && k < near.n) { x = near.x + rng.range(-near.r, near.r); z = near.z + rng.range(-near.r, near.r); y = -rng.range(Math.max(d0, 3.5), Math.min(d1, 16)); }
        const a = rng() * 6.283;
        const dip = rng.range(0.95, 1.48), da = a + Math.PI / 2;
        const dv = [Math.cos(da) * Math.cos(dip), -Math.sin(dip), Math.sin(da) * Math.cos(dip)];
        const B = Math.round(bandAt(plan, x, y, z) / 2.6) * 2.6;
        if (kind === 'seam') y = onBand(plan, x, z, B, y);
        // start the trace half a vein back so the start point is its middle
        const sx = x - Math.cos(a) * len / 2, sz = z - Math.sin(a) * len / 2;
        const sy = kind === 'seam' ? onBand(plan, sx, sz, B, y) : y;
        const pts = trace(plan, kind, sx, sy, sz, a, len, rng, B, dv);
        let score = 0;
        for (let i = 1; i < pts.length; i += 3) {
          const q = pts[i], dd = density(plan, q.x, q.y, q.z);
          if (dd > -0.3 && dd < 0.06) score += 1; // within a few metres of a wall, or crossing it
          else if (dd >= 0.06) score += 0.3; // through open cave (the bits in the air are lost)
        }
        if (q0(pts, -y)) score -= 99;
        if (score > bs) { bs = score; best = { pts, kind, a, dv, B, x, y, z }; }
      }
      if (!best) continue;
      addVein(plan, rng, best, item, zone, size);
    }
  }
}
// a vein must stay inside its zone and under the soil
function q0(pts, depth0) {
  void depth0;
  for (const p of pts) if (-p.y < 3 || Math.abs(p.x) > 92 || Math.abs(p.z) > 92) return true;
  return false;
}

function addVein(plan, rng, V, item, zone, size) {
  const oreId = ORE_ID[item];
  const m = VEIN_OF[item] || M.VEIN_QUARTZ;
  const coal = item === 'coal';
  const t = V.kind === 'seam' ? (coal ? rng.range(0.1, 0.2) : rng.range(0.06, 0.13)) : rng.range(0.045, 0.1);
  const w = V.kind === 'seam' ? rng.range(0.45, 0.95) : rng.range(0.3, 0.75);
  const seed = rng.int(1, 1e6);
  const segs = [];
  const area = { id: plan.areas.length, item, oreId, x: 0, y: 0, z: 0, r: 1, zone, deposits: [], vein: true, kind: V.kind, m };
  const rare = RARE.has(item);
  const nugget = (p, rmul = 1, spread = 1) => {
    // somewhere in the ribbon round p
    const s = segs.length ? segs[Math.min(segs.length - 1, p.seg)] : null;
    let x = p.x, y = p.y, z = p.z;
    if (s) {
      const ob = (rng() - 0.5) * 1.2 * w * spread, on = (rng() - 0.5) * 1.4 * t;
      x += s.bx * ob + s.nx * on; y += s.by * ob + s.ny * on; z += s.bz * ob + s.nz * on;
    }
    const r = rng.range(0.11, 0.23) * rmul * (coal ? 1.3 : 1) * (rare ? 0.8 : 1);
    area.deposits.push({ x, y, z, r, q: clamp(84 + (rng() + rng() + rng() - 1.5) * 14, 50, 100), seed: rng.int(1, 1e6) });
  };
  // the main vein
  let s0 = ribbon(V.pts, V.kind, V.dv, t, w, 0, seed, segs);
  const string = (pts, segBase, gap0, gap1) => {
    let next = rng.range(0, gap1);
    for (let i = 0; i + 1 < pts.length; i++) {
      next -= STEP;
      if (next <= 0) { nugget({ ...pts[i], seg: segBase + i }); next = rng.range(gap0, gap1); }
    }
  };
  const g0 = rare ? 2.6 : 1.4, g1 = rare ? 4.4 : 3;
  string(V.pts, 0, g0, g1);
  const mid = area.deposits[(area.deposits.length / 2) | 0] || V.pts[(V.pts.length / 2) | 0];
  area.x = mid.x; area.y = mid.y; area.z = mid.z;
  // branches: splitting off at an angle, a rich pocket where they split and at their ends
  const nb = 1 + (rng() < 0.6 ? 1 : 0) + (rng() < 0.25 ? 1 : 0);
  const geodeEnd = GEMS.has(item) && rng() < 0.45;
  for (let b = 0; b < nb; b++) {
    const i0 = rng.int(1, Math.max(1, V.pts.length - 2));
    const P = V.pts[i0];
    const turn = (rng() < 0.5 ? -1 : 1) * rng.range(0.5, 1.2);
    const len = rng.range(0.3, 0.6) * V.pts.length * STEP;
    let dv = V.dv;
    if (V.kind === 'fault') { const da = V.a + turn + Math.PI / 2, dip = rng.range(0.95, 1.48); dv = [Math.cos(da) * Math.cos(dip), -Math.sin(dip), Math.sin(da) * Math.cos(dip)]; }
    const pts = trace(plan, V.kind, P.x, P.y, P.z, V.a + turn, len, rng, V.B, dv);
    if (q0(pts, 0)) continue;
    const base = segs.length;
    s0 = ribbon(pts, V.kind, dv, t * 0.8, w * 0.75, s0, seed + b + 1, segs);
    string(pts, base, g0 * 1.2, g1 * 1.3);
    // the pocket where it splits off
    for (let k = 0; k < (rare ? 1 : 2 + rng.int(0, 2)); k++) nugget({ x: P.x + rng.range(-0.3, 0.3), y: P.y + rng.range(-0.2, 0.2), z: P.z + rng.range(-0.3, 0.3), seg: Math.min(segs.length - 1, i0) }, 1.25, 0.6);
    const E = pts[pts.length - 1];
    if (geodeEnd && b === 0) {
      // a gem vein runs into a geode: a hollow stone egg lined with crystals
      const gr = rng.range(0.6, 1.0);
      const gx = E.x, gy = E.y, gz = E.z;
      const ga = { id: plan.areas.length + 1, item, oreId, x: gx, y: gy, z: gz, r: gr + 0.4, zone, deposits: [], geode: true };
      for (let i = 0; i < rng.int(3, 5); i++) {
        const a = rng() * Math.PI * 2, bb = (rng() - 0.6) * Math.PI * 0.8;
        ga.deposits.push({ x: gx + Math.cos(a) * Math.cos(bb) * gr * 0.72, y: gy + Math.sin(bb) * gr * 0.72, z: gz + Math.sin(a) * Math.cos(bb) * gr * 0.72, r: rng.range(0.1, 0.17), q: clamp(88 + (rng() + rng() - 1) * 12, 60, 100), seed: rng.int(1, 1e6) });
      }
      area.geodeArea = ga;
      plan.geodes.push({ x: gx, y: gy, z: gz, r: gr, item, zone });
      plan.features.push({ kind: 'geode', x: gx, y: gy, z: gz, r: gr });
    } else {
      for (let k = 0; k < (rare ? 1 : 1 + rng.int(0, 2)); k++) nugget({ x: E.x + rng.range(-0.25, 0.25), y: E.y + rng.range(-0.2, 0.2), z: E.z + rng.range(-0.25, 0.25), seg: segs.length - 1 }, 1.3, 0.5);
    }
  }
  let R = 0;
  for (const d of area.deposits) R = Math.max(R, Math.hypot(d.x - area.x, d.y - area.y, d.z - area.z) + d.r);
  area.r = R + 0.5;
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (const s of segs) { x0 = Math.min(x0, s.x0); y0 = Math.min(y0, s.y0); z0 = Math.min(z0, s.z0); x1 = Math.max(x1, s.x1); y1 = Math.max(y1, s.y1); z1 = Math.max(z1, s.z1); }
  plan.areas.push(area);
  if (area.geodeArea) { area.geodeArea.id = plan.areas.length; plan.areas.push(area.geodeArea); delete area.geodeArea; }
  plan.veins.push({ m, item, area: area.id, segs, bb: [x0, y0, z0, x1, y1, z1], seed });
}

/** Stamp the vein rock into a chunk (host[m]: rock a vein may replace). */
export function stampVeins(list, vox, X0, Y0, Z0, CS, VOX, host) {
  if (!list || !list.length) return;
  const cx0 = X0 / VOX, cy0 = Y0 / VOX, cz0 = Z0 / VOX, cm = CS / VOX;
  for (const vn of list) {
    const B = vn.bb;
    if (B[3] < cx0 || B[0] > cx0 + cm || B[4] < cy0 || B[1] > cy0 + cm || B[5] < cz0 || B[2] > cz0 + cm) continue;
    for (const s of vn.segs) {
      if (s.x1 < cx0 || s.x0 > cx0 + cm || s.y1 < cy0 || s.y0 > cy0 + cm || s.z1 < cz0 || s.z0 > cz0 + cm) continue;
      const lx0 = Math.max(0, Math.floor(s.x0 * VOX) - X0), lx1 = Math.min(CS, Math.ceil(s.x1 * VOX) - X0);
      const ly0 = Math.max(0, Math.floor(s.y0 * VOX) - Y0), ly1 = Math.min(CS, Math.ceil(s.y1 * VOX) - Y0);
      const lz0 = Math.max(0, Math.floor(s.z0 * VOX) - Z0), lz1 = Math.min(CS, Math.ceil(s.z1 * VOX) - Z0);
      for (let z = lz0; z < lz1; z++) for (let y = ly0; y < ly1; y++) for (let x = lx0; x < lx1; x++) {
        const vi = x + CS * (y + CS * z), cur = vox[vi];
        if (!host[cur]) continue;
        const vx = X0 + x, vy = Y0 + y, vz = Z0 + z;
        const qx = (vx + 0.5) / VOX - s.ax, qy = (vy + 0.5) / VOX - s.ay, qz = (vz + 0.5) / VOX - s.az;
        let u = qx * s.ux + qy * s.uy + qz * s.uz;
        u = u < 0 ? 0 : u > s.len ? s.len : u;
        const dx = qx - s.ux * u, dy = qy - s.uy * u, dz = qz - s.uz * u;
        // pinch and swell along it (a smooth hash noise on the distance along the vein)
        const sa = (s.s0 + u) * 0.8, i0 = Math.floor(sa), f = sa - i0, sm = f * f * (3 - 2 * f);
        const sw = h3(i0, 0, 1, s.seed) * (1 - sm) + h3(i0 + 1, 0, 1, s.seed) * sm;
        const tl = s.t * (0.35 + sw * 1.3), wl = s.w * (0.6 + sw * 0.7);
        const j = (h3(vx, vy, vz, s.seed) - 0.5) * 0.04;
        if (Math.abs(dx * s.nx + dy * s.ny + dz * s.nz) < tl + j && Math.abs(dx * s.bx + dy * s.by + dz * s.bz) < wl + j * 3) vox[vi] = vn.m;
      }
    }
  }
}

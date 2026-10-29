// The underground, generated chunk by chunk from a cheap plan: zone strata, spaghetti tunnels and
// caverns, an old half-collapsed passage from the burrow toward Deep Town, the town gate, lift
// stations, ore areas, lakes and nests (danger zones), crystals, stalactites, roots and moss.
// Units: voxels (1/8 m) unless a name ends in M (meters). y is up; depth = -y.
import { makeNoise3D, h3, h3i } from './noise.js';
import { M, VOX, VK, ORE_BASE } from './materials.js';
import { ORE_ID, ORE_SPAWN } from '../data/ores.js';
import { makeRng, clamp } from '../core/util.js';
import { stampPrologue, PROLOGUE_BB, prologueLayout, prologueInside } from './gen/prologue.js';
import { stampTrail, trailBB, trailLanterns, TRAIL_W, TRAIL_H } from './gen/trails.js';
import { stampBurrow, burrowBB, burrowDoor } from './gen/burrows.js';
import { stampRuin, ruinBB, ruinDoor } from './gen/ruins.js';
import { settleLakes } from './fluids/lakes.js';

export const CS = 32; // chunk size (voxels)
export const BOUNDS = { x0: -96, x1: 96, z0: -96, z1: 96, y0: -216, y1: 8 }; // meters
export const ZONE_DEPTHS = [0, 25, 55, 90, 130, 170, 210]; // zone n spans ZONE_DEPTHS[n-1]..[n]

export function zoneAt(depthM) {
  for (let z = 1; z < ZONE_DEPTHS.length; z++) if (depthM < ZONE_DEPTHS[z]) return z;
  return 6;
}

// primary / secondary strata and pocket materials per zone
const ZMAT = [
  null,
  { a: M.DIRT, b: M.LOAM, c: M.CLAY, d: M.STONE, pocket: M.GRAVEL },
  { a: M.CLAY, b: M.MUDSTONE, c: M.LIMESTONE, d: M.STONE, pocket: M.GRAVEL },
  { a: M.GRANITE, b: M.CRYSTALROCK, c: M.STONE, d: M.LIMESTONE, pocket: M.SAND },
  { a: M.BASALT, b: M.MAGMAROCK, c: M.OBSIDIAN, d: M.BASALT, pocket: M.ASH },
  { a: M.PERMAFROST, b: M.ICE, c: M.STONE, d: M.PERMAFROST, pocket: M.SNOW },
  { a: M.CORE, b: M.STARROCK, c: M.VOIDROCK, d: M.CORE, pocket: M.ASH },
];

/** Build the plan (deterministic for a seed). opts: { W, D, tunnels: [{wall, t}] } */
export function makePlan(seed, opts = {}) {
  const rng = makeRng(seed);
  const W = opts.W || 10, D = opts.D || 8;
  const plan = {
    seed, W, D,
    noise: [makeNoise3D(seed), makeNoise3D(seed + 11), makeNoise3D(seed + 23), makeNoise3D(seed + 37)],
    house: { x0: 0, x1: W, z0: 0, z1: D, y0: 0, y1: 3 },
    town: { x: 30, y: -15, z: -24, r: 5.5 },
    shaft: { x: 38.5, z: -24.5 },
    stations: [],
    lifts: [], // old lifts all over the mine: find one and you can ride it home
    areas: [], // ore areas
    dangers: [], // lakes, nests, gas
    lights: [], // fixed light sources (lanterns, lava) in meters
    features: [], // carve/fill shapes in meters: {kind, ...aabb}
    mouths: [],
    burrows: [], // NPC homes and shops you walk to (gen/burrows.js, Traders.js)
    ruins: [], // old ruins with puzzles (gen/ruins.js, Ruins.js)
    trails: [], // old dug tunnels joining lifts, burrows and the town (gen/trails.js)
    geodes: [], // hidden gem pockets
  };
  // lift stations at the top of each zone below the town
  for (let n = 0; n <= 5; n++) {
    const y = n === 0 ? plan.town.y - 1 : -ZONE_DEPTHS[n] - 2;
    plan.stations.push({ n, x: plan.shaft.x + 2.6, y, z: plan.shaft.z, zone: n === 0 ? 1 : n + 1 });
  }

  // the old passage: from just outside the burrow's north-east corner toward the town gate
  const start = { x: W + 2.2, y: 0.4, z: -2.2 };
  const end = { x: plan.town.x - 4.5, y: plan.town.y - 2.6, z: plan.town.z + 3.2 };
  const pts = [];
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({
      x: start.x + (end.x - start.x) * t + Math.sin(t * 7.1 + seed) * 3.2 * Math.sin(t * Math.PI),
      y: start.y + (end.y - start.y) * (t * t * (3 - 2 * t)) + Math.sin(t * 11 + seed * 0.3) * 0.6 * Math.sin(t * Math.PI),
      z: start.z + (end.z - start.z) * t + Math.cos(t * 5.3 + seed) * 3 * Math.sin(t * Math.PI),
    });
  }
  // carve pockets along it, leaving rock plugs to dig through (fewer plugs near the start)
  let plug = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const segPlug = i > 2 && (i % 5 === 3 || rng.chance(0.12));
    if (segPlug) { plug++; continue; }
    for (let k = 0; k < 3; k++) {
      const t = k / 3;
      const r = rng.range(1.0, 1.5);
      plan.features.push({ kind: 'sphere', x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + r * 0.35, z: a.z + (b.z - a.z) * t, r, ry: r * 0.8, m: 0 });
    }
    if (i % 4 === 0) plan.lights.push({ x: b.x, y: b.y + 1.0, z: b.z, c: [1.0, 0.72, 0.38], r: 5, lantern: true });
  }
  plan.path = pts;
  plan.plugs = plug;

  // the town gate cavern: a big hall with a boarded gate (warm light behind it)
  const T = plan.town;
  plan.features.push({ kind: 'sphere', x: T.x - 2.5, y: T.y + 0.8, z: T.z + 2, r: T.r, ry: T.r * 0.62, m: 0 });
  plan.features.push({ kind: 'gate', x: T.x + 1.6, y: T.y, z: T.z - 1.2 });
  plan.lights.push({ x: T.x + 1.2, y: T.y + 1.4, z: T.z - 1.0, c: [1.4, 0.95, 0.5], r: 9 });
  plan.lights.push({ x: T.x - 5, y: T.y + 2.2, z: T.z + 3, c: [1.0, 0.7, 0.35], r: 6, lantern: true });
  // lift shaft + stations
  plan.features.push({ kind: 'shaft', x: plan.shaft.x, z: plan.shaft.z, y0: -208, y1: T.y + 2 });
  for (const s of plan.stations) {
    plan.features.push({ kind: 'box', x0: s.x - 1.8, x1: s.x + 1.8, y0: s.y, y1: s.y + 2.2, z0: s.z - 1.6, z1: s.z + 1.6, m: 0, timber: true });
    plan.lights.push({ x: s.x, y: s.y + 1.7, z: s.z, c: [1.0, 0.7, 0.36], r: 5, lantern: true });
  }

  // lifts: the mine entrance under the burrow, three buried in every zone, the town shaft stops
  const LIFT_NAMES = [null, ['Root Cellar', 'Wormwood', 'Old Hollow'], ['Clay Pit', 'Potter\'s Drop', 'Redbank'], ['Glimmer Gallery', 'Prism Well', 'Geode Hall'],
    ['Cinder Stair', 'Ember Pit', 'Ashfall'], ['Rime Gate', 'Icicle Run', 'Coldheart'], ['Starfall', 'Void Steps', 'Heartstone']];
  const addLift = (id, name, x, y, z, zone, room = true) => {
    const L = { id, name, x, y, z, zone, depth: Math.round(-y) };
    plan.lifts.push(L);
    if (room) {
      plan.features.push({ kind: 'box', x0: x - 1.5, x1: x + 1.5, y0: y, y1: y + 2.3, z0: z - 1.5, z1: z + 1.5, m: 0, timber: true });
      plan.features.push({ kind: 'cage', x, y, z });
      plan.lights.push({ x: x + 0.9, y: y + 1.7, z: z + 0.9, c: [1.0, 0.72, 0.38], r: 5.5, lantern: true, lift: id });
    }
    return L;
  };
  const L0 = addLift('L0', 'Mine entrance', W / 2, -7, D / 2 - 4, 1);
  // Old Star's dig: where the mole lands after the fall, a crawl away from the mine entrance
  plan.prologue = { x: L0.x + 6, y: L0.y - 1.5, z: L0.z - 6 };
  plan.features.push({ kind: 'prologue', ...plan.prologue, to: { x: L0.x + 1.4, y: L0.y, z: L0.z - 1.4 }, lift: { x: L0.x, y: L0.y, z: L0.z } });
  for (let zone = 1; zone <= 6; zone++) {
    for (let k = 0; k < 3; k++) {
      let x = 0, z = 0, y = 0;
      for (let tries = 0; tries < 20; tries++) {
        x = rng.range(-62, 62); z = rng.range(-62, 62);
        y = -rng.range(ZONE_DEPTHS[zone - 1] + 4, ZONE_DEPTHS[zone] - 4);
        if (Math.hypot(x - plan.town.x, z - plan.town.z) > 12 && Math.hypot(x - W / 2, z - D / 2) > 10) break;
      }
      addLift(`L${zone}${k}`, LIFT_NAMES[zone][k], x, y, z, zone);
    }
  }
  for (const st of plan.stations) addLift('s' + st.n, st.n === 0 ? 'Below Deep Town' : `Shaft stop ${st.n}`, st.x, st.y, st.z, st.zone, false);

  // ore areas: per zone, clusters of one ore type (what the radar shows)
  for (let zone = 1; zone <= 6; zone++) {
    const spawn = ORE_SPAWN[zone] || [];
    const total = spawn.reduce((s, e) => s + e[1], 0);
    const count = zone === 1 ? 34 : 28;
    for (let k = 0; k < count; k++) {
      let r = rng() * total, item = spawn[0][0];
      for (const [id, w] of spawn) { r -= w; if (r <= 0) { item = id; break; } }
      const d0 = ZONE_DEPTHS[zone - 1] + 2, d1 = ZONE_DEPTHS[zone] - 2;
      let x = rng.range(-70, 70), z = rng.range(-70, 70);
      // the first ores are close to the burrow
      if (zone === 1 && k < 8) { x = W / 2 + rng.range(-14, 14); z = D / 2 + rng.range(-14, 14); }
      const y = -rng.range(d0, d1);
      const rad = rng.range(2.5, 5);
      const area = { id: plan.areas.length, item, oreId: ORE_ID[item], x, y, z, r: rad, zone, deposits: [] };
      const n = Math.round(rng.range(5, 12) * (item === 'diamond' || item === 'sunstone' || item === 'voidstone' ? 0.5 : 1));
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, b = (rng() - 0.5) * Math.PI, dd = Math.sqrt(rng()) * rad;
        area.deposits.push({
          x: x + Math.cos(a) * Math.cos(b) * dd, y: y + Math.sin(b) * dd * 0.6, z: z + Math.sin(a) * Math.cos(b) * dd,
          r: rng.range(0.14, 0.32), q: clamp(84 + (rng() + rng() + rng() - 1.5) * 14, 50, 100), seed: rng.int(1, 1e6),
        });
      }
      plan.areas.push(area);
    }
  }

  // danger zones: lakes, lava, nests, gas
  const addLake = (kind, zone, n) => {
    for (let k = 0; k < n; k++) {
      const x = rng.range(-70, 70), z = rng.range(-70, 70), y = -rng.range(ZONE_DEPTHS[zone - 1] + 4, ZONE_DEPTHS[zone] - 4), r = rng.range(3.5, 7);
      plan.dangers.push({ kind, x, y, z, r, zone });
      plan.features.push({ kind: 'lake', x, y, z, r, fluid: kind === 'lava' ? M.LAVA : M.WATER });
      if (kind === 'lava') plan.lights.push({ x, y: y - r * 0.2, z, c: [1.6, 0.55, 0.16], r: r * 2.2, lava: true });
    }
  };
  addLake('water', 1, 3); addLake('water', 2, 5); addLake('water', 3, 4); addLake('water', 5, 4);
  addLake('lava', 4, 7); addLake('lava', 6, 4); addLake('lava', 3, 1);
  for (let zone = 1; zone <= 6; zone++) {
    for (let k = 0; k < 3 + zone; k++) {
      const x = rng.range(-70, 70), z = rng.range(-70, 70), y = -rng.range(ZONE_DEPTHS[zone - 1] + 3, ZONE_DEPTHS[zone] - 3);
      if (Math.hypot(x - W / 2, z - D / 2) < 14 && zone === 1) continue; // keep the burrow safe
      plan.dangers.push({ kind: 'nest', x, y, z, r: rng.range(3, 5), zone });
      plan.features.push({ kind: 'sphere', x, y, z, r: rng.range(3, 4.5), ry: 2.2, m: 0 });
    }
    if (zone >= 2 && zone <= 4) for (let k = 0; k < 2; k++) {
      const x = rng.range(-70, 70), z = rng.range(-70, 70), y = -rng.range(ZONE_DEPTHS[zone - 1] + 3, ZONE_DEPTHS[zone] - 3);
      plan.dangers.push({ kind: 'gas', x, y, z, r: rng.range(3, 5), zone });
    }
  }
  addPlaces(plan, rng, L0);
  // burrows stamp last, so the trails ending in them don't cut through their furniture
  plan.features.sort((a, b) => (a.kind === 'burrow') - (b.kind === 'burrow'));
  for (const f of plan.features) aabbOf(f);
  // lakes get a watertight shell and hold water only below rooms carved into them (fluids/lakes.js)
  settleLakes(plan, zoneAt);
  return plan;
}

// ---------------------------------------------------------------- burrows, ruins, geodes, trails
const far = (plan, x, y, z, d) => plan.lifts.every((L) => Math.hypot(L.x - x, L.y - y, L.z - z) > d) && plan.burrows.every((b) => Math.hypot(b.x - x, b.y - y, b.z - z) > d) && plan.ruins.every((r) => Math.hypot(r.x - x, r.y - y, r.z - z) > d);

function addPlaces(plan, rng, L0) {
  const T = plan.town, pro = plan.prologue;
  // NPC burrows (the folk who live down here): near the trails, at a few depths
  const burrow = (id, kind, name, x, y, z, yaw, zone, size = 1) => {
    const b = { id, kind, name, x, y, z, yaw, zone };
    plan.burrows.push(b);
    plan.features.push({ kind: 'burrow', id, burrow: kind, x, y, z, yaw, rx: 3.1 * size, rz: 2.6 * size, h: 2.4 * size });
    return b;
  };
  const jit = () => rng.range(-2.5, 2.5);
  const trader = burrow('trader', 'trader', 'Trading Post', L0.x - 16 + jit(), L0.y - 2.5, L0.z + 13 + jit(), Math.PI * 0.25, 1, 1.1);
  const herb = burrow('herbalist', 'herbalist', "Herbalist's Hollow", L0.x + 25 + jit(), -21, L0.z + 18 + jit(), -Math.PI * 0.6, 1);
  const rocco = burrow('raccoon', 'raccoon', "Rocco's Storage", -26 + jit(), -38, -28 + jit(), Math.PI * 0.8, 2, 1.15);
  const outpost = burrow('outpost', 'outpost', 'Deep Outpost', -18 + jit(), -98, 38 + jit(), Math.PI, 4, 1.1);
  // ruins: one near the top, two in each zone below
  const KINDS = ['hall', 'shrine', 'vault', 'well'];
  for (let zone = 1; zone <= 6; zone++) {
    const n = zone === 1 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      let x = 0, y = 0, z = 0;
      for (let tries = 0; tries < 30; tries++) {
        x = rng.range(-70, 70); z = rng.range(-70, 70);
        y = -rng.range(ZONE_DEPTHS[zone - 1] + 6, ZONE_DEPTHS[zone] - 6);
        if (far(plan, x, y, z, 16) && Math.hypot(x - T.x, z - T.z) > 16 && Math.hypot(x - pro.x, y - pro.y, z - pro.z) > 18) break;
      }
      const r = rng.range(4, 6.2);
      const ruin = { id: `R${zone}${k}`, kind: KINDS[(zone + k) % KINDS.length], x, y, z, yaw: rng.range(0, Math.PI * 2), r, zone, seed: rng.int(1, 1e6) };
      plan.ruins.push(ruin);
      plan.features.push({ kind: 'ruin', id: ruin.id, ruin: ruin.kind, x, y, z, yaw: ruin.yaw, r, h: rng.range(3.4, 4.6), seed: ruin.seed });
    }
  }
  // geodes: hidden hollow gem pockets in solid rock (ore glints show through)
  const GEMS = [null, ['quartz', 'amber'], ['amber', 'amethyst', 'quartz'], ['amethyst', 'echo_crystal'], ['ruby', 'emerald'], ['sapphire', 'emerald', 'diamond'], ['diamond', 'sunstone', 'voidstone']];
  for (let zone = 1; zone <= 6; zone++) {
    for (let k = 0; k < 9; k++) {
      const item = GEMS[zone][rng.int(0, GEMS[zone].length - 1)];
      if (ORE_ID[item] === undefined) continue;
      const x = rng.range(-72, 72), z = rng.range(-72, 72), y = -rng.range(ZONE_DEPTHS[zone - 1] + 3, ZONE_DEPTHS[zone] - 3);
      if (zone === 1 && Math.hypot(x - L0.x, z - L0.z) < 8) continue;
      const r = rng.range(0.55, 1.05);
      const area = { id: plan.areas.length, item, oreId: ORE_ID[item], x, y, z, r: r + 0.4, zone, deposits: [], geode: true };
      const n = Math.round(rng.range(3, 6));
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, b = (rng() - 0.6) * Math.PI * 0.8;
        area.deposits.push({ x: x + Math.cos(a) * Math.cos(b) * r * 0.72, y: y + Math.sin(b) * r * 0.72, z: z + Math.sin(a) * Math.cos(b) * r * 0.72, r: rng.range(0.1, 0.17), q: clamp(88 + (rng() + rng() - 1) * 12, 60, 100), seed: rng.int(1, 1e6) });
      }
      plan.areas.push(area);
      plan.geodes.push({ x, y, z, r, item, zone });
      plan.features.push({ kind: 'geode', x, y, z, r });
    }
  }
  // trails: old dug tunnels you can walk between places
  const liftOut = (L) => ({ p: { x: L.x, y: L.y, z: L.z + 1.0 }, d: [0, 1] }); // the cages open to +z
  const burrowOut = (b) => { const f = plan.features.find((q) => q.kind === 'burrow' && q.id === b.id); const dd = burrowDoor(f); const l = Math.hypot(dd.x - b.x, dd.z - b.z) || 1; return { p: { x: b.x, y: b.y, z: b.z }, d: [(dd.x - b.x) / l, (dd.z - b.z) / l], skip: Math.max(f.rx, f.rz) }; };
  const nearestLift = (b, zone) => plan.lifts.filter((L) => L.id[0] === 'L' && L.id !== 'L0' && (zone ? L.zone === zone : true)).sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z))[0];
  const townIn = { p: { x: T.x - 4.2, y: T.y - 0.4, z: T.z + 4.5 }, d: [-0.7, 0.7] };
  addTrail(plan, rng, 'home-trader', liftOut(L0), burrowOut(trader), { rails: true });
  addTrail(plan, rng, 'trader-town', burrowOut(trader), townIn, { rails: true });
  addTrail(plan, rng, 'home-herbalist', liftOut(L0), burrowOut(herb), {});
  addTrail(plan, rng, 'herbalist-rocco', burrowOut(herb), burrowOut(rocco), { rails: true });
  const l2 = nearestLift(rocco, 2); if (l2) addTrail(plan, rng, 'rocco-' + l2.id, burrowOut(rocco), liftOut(l2), {});
  const l4 = nearestLift(outpost, 4); if (l4) addTrail(plan, rng, 'outpost-' + l4.id, burrowOut(outpost), liftOut(l4), { rails: true });
  const s3 = plan.lifts.find((L) => L.id === 's3'); if (s3) addTrail(plan, rng, 'outpost-s3', burrowOut(outpost), { p: { x: s3.x, y: s3.y, z: s3.z }, d: [1, 0] }, {});
  // most ruins have an old trail out to the nearest lift of their zone (its own rng, so the rest
  // of the world stays as it was)
  const rr = makeRng(plan.seed + 7777);
  for (const r of plan.ruins) {
    if (rr() > 0.65) continue;
    const f = plan.features.find((q) => q.kind === 'ruin' && q.id === r.id);
    const L = nearestLift(r, r.zone);
    if (!f || !L || Math.hypot(L.x - r.x, L.z - r.z) > 70) continue;
    const door = ruinDoor(aabbOf(f));
    const l = Math.hypot(door.dx, door.dz) || 1;
    addTrail(plan, rr, 'ruin-' + r.id, { p: { x: door.x, y: door.y, z: door.z }, d: [door.dx / l, door.dz / l] }, liftOut(L), { rails: rr() < 0.3 });
  }
}

/** An old trail from place A to place B: out of A's door, gentle slopes, a ladder shaft where it drops. */
function addTrail(plan, rng, id, A, B, opts) {
  const seed = rng.int(1, 1e6);
  const out = (P, k) => ({ x: P.p.x + P.d[0] * k, y: P.p.y, z: P.p.z + P.d[1] * k });
  const a1 = out(A, (A.skip || 0) + 2.6), b1 = out(B, (B.skip || 0) + 2.6);
  const segs = [{ a: { ...A.p }, b: a1 }];
  let from = a1, to = b1, endShaft = 0;
  const H = Math.hypot(to.x - from.x, to.z - from.z), dy = to.y - from.y, maxDrop = H * 0.32;
  if (Math.abs(dy) > maxDrop + 0.4) {
    const need = Math.abs(dy) - maxDrop;
    if (dy < 0) { const s = { x: from.x, y: from.y - need, z: from.z }; segs.push({ a: from, b: s, ladder: true }); from = s; }
    else { endShaft = need; to = { x: to.x, y: to.y - need, z: to.z }; }
  }
  const len = Math.hypot(to.x - from.x, to.z - from.z), n = Math.max(1, Math.round(len / 5.5));
  const nx = -(to.z - from.z) / (len || 1), nz = (to.x - from.x) / (len || 1);
  let prev = from;
  for (let i = 1; i <= n; i++) {
    const t = i / n, side = i < n ? Math.sin(t * Math.PI) * rng.range(-2.6, 2.6) : 0;
    const p = { x: from.x + (to.x - from.x) * t + nx * side, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t + nz * side };
    segs.push({ a: prev, b: p });
    prev = p;
  }
  if (endShaft) segs.push({ a: b1, b: to, ladder: true });
  segs.push({ a: b1, b: { ...B.p } });
  const pts = [A.p];
  for (const sg of segs) {
    const f = { kind: 'trail', a: sg.a, b: sg.b, ladder: !!sg.ladder, rails: !!opts.rails, w: TRAIL_W, h: TRAIL_H, seed: seed + pts.length, trail: id };
    plan.features.push(f);
    pts.push(sg.b);
    for (const L of trailLanterns(f)) plan.lights.push({ x: L.x, y: L.y, z: L.z, c: [1.0, 0.7, 0.36], r: 4.5, lantern: true, trail: id });
  }
  plan.trails.push({ id, pts });
}

function aabbOf(f) {
  const pad = 0.5;
  if (f.kind === 'sphere') { f.bb = [f.x - f.r - pad, f.y - (f.ry || f.r) - pad, f.z - f.r - pad, f.x + f.r + pad, f.y + (f.ry || f.r) + pad, f.z + f.r + pad]; }
  else if (f.kind === 'lake') { f.bb = [f.x - f.r - 1, f.y - f.r * 0.6 - 1, f.z - f.r - 1, f.x + f.r + 1, f.y + f.r * 0.5 + 1, f.z + f.r + 1]; }
  else if (f.kind === 'box') { f.bb = [f.x0 - pad, f.y0 - pad, f.z0 - pad, f.x1 + pad, f.y1 + pad, f.z1 + pad]; }
  else if (f.kind === 'gate') { f.bb = [f.x - 3, f.y - 1, f.z - 3, f.x + 3, f.y + 4, f.z + 3]; }
  else if (f.kind === 'shaft') { f.bb = [f.x - 1.4, f.y0, f.z - 1.4, f.x + 1.4, f.y1, f.z + 1.4]; }
  else if (f.kind === 'mouth') { f.bb = [f.x0 - pad, f.y0 - pad, f.z0 - pad, f.x1 + pad, f.y1 + pad, f.z1 + pad]; }
  else if (f.kind === 'prologue') { f.bb = [f.x - PROLOGUE_BB, f.y - 2, f.z - PROLOGUE_BB, f.x + PROLOGUE_BB, f.y + 4, f.z + PROLOGUE_BB]; }
  else if (f.kind === 'cage') { f.bb = [f.x - 1.6, f.y - 0.3, f.z - 1.6, f.x + 1.6, f.y + 7, f.z + 1.6]; }
  else if (f.kind === 'trail') { f.bb = trailBB(f); }
  else if (f.kind === 'burrow') { f.bb = burrowBB(f); }
  else if (f.kind === 'ruin') { f.bb = ruinBB(f); }
  else if (f.kind === 'geode') { f.bb = [f.x - f.r - 0.2, f.y - f.r - 0.2, f.z - f.r - 0.2, f.x + f.r + 0.2, f.y + f.r + 0.2, f.z + f.r + 0.2]; }
  return f;
}

/** A tunnel mouth dug out of the burrow wall (meters): the small alcove the mole starts in. */
export function mouthBox(plan, wall, t) {
  const { W, D } = plan;
  const hw = 0.6, h = 1.35, depth = 1.1;
  if (wall === 'n') return { x0: t - hw, x1: t + hw, z0: -depth - 0.45, z1: -0.45, y0: 0, y1: h, dir: [0, 0, -1] };
  if (wall === 's') return { x0: t - hw, x1: t + hw, z0: D + 0.45, z1: D + 0.45 + depth, y0: 0, y1: h, dir: [0, 0, 1] };
  if (wall === 'w') return { x0: -0.45 - depth, x1: -0.45, z0: t - hw, z1: t + hw, y0: 0, y1: h, dir: [-1, 0, 0] };
  return { x0: W + 0.45, x1: W + 0.45 + depth, z0: t - hw, z1: t + hw, y0: 0, y1: h, dir: [1, 0, 0] };
}

export function addMouth(plan, wall, t) {
  const b = mouthBox(plan, wall, t);
  const f = aabbOf({ kind: 'mouth', wall, t, ...b });
  plan.features.push(f);
  plan.mouths.push(f);
  plan.lights.push({ x: (b.x0 + b.x1) / 2 - b.dir[0] * 0.5, y: 1.0, z: (b.z0 + b.z1) / 2 - b.dir[2] * 0.5, c: [1.2, 0.8, 0.45], r: 4, mouth: true });
  return f;
}

// ---------------------------------------------------------------- chunk generation
const S = 4; // coarse sample stride (voxels)
// materials the dressing may cover or grow from (not timber, bricks, lanterns or ores)
const NATURAL = new Uint8Array(256);
for (const m of [M.DIRT, M.LOAM, M.CLAY, M.STONE, M.MUDSTONE, M.LIMESTONE, M.GRANITE, M.CRYSTALROCK, M.BASALT, M.OBSIDIAN, M.MAGMAROCK, M.PERMAFROST, M.ICE, M.CORE, M.STARROCK, M.VOIDROCK, M.ROOTS, M.GRAVEL, M.SAND, M.SNOW, M.ASH, M.SANDSTONE, M.MYCEL, M.MOSS]) NATURAL[m] = 1;
const SH = Math.round(Math.log2(VOX / 4)); // voxel → quarter-meter cell shift (spike spacing)
const NS = CS / S + 1; // 9 samples per axis

/**
 * Open space where the result is > 0 (meters): spaghetti tunnels where two noise fields are both
 * near zero, and caverns (rare near the top, bigger deeper). The ground near the surface stays solid.
 */
export function caveDensity(p, x, y, z) {
  const depth = -y;
  if (depth < 2.5) return -1;
  const [n0, n1, n2, n3] = p.noise;
  // cave ways: long winding tunnels where two noises are both near zero, 1–2 m across
  const a = n0.n(x * 0.085, y * 0.11, z * 0.085), b = n1.n(x * 0.085 + 31.7, y * 0.11, z * 0.085 - 12.3);
  let d = (0.0036 - (a * a + b * b)) * 40;
  // crawlways: tighter and twistier, often low enough that you crouch through
  if (depth > 4) {
    const c = n2.n(x * 0.13 + 7.1, y * 0.17, z * 0.13 + 3.3), e = n3.n(x * 0.13 - 5.2, y * 0.17 + 9.9, z * 0.13);
    d = Math.max(d, (0.0028 * Math.min(1, (depth - 4) / 2) - (c * c + e * e)) * 40);
  }
  // caverns: big chambers, larger and more common with depth, held up by stone pillars
  let cav = n2.fbm(x / 24, y / 15, z / 24, 3) - (depth < 8 ? 0.7 : depth < 25 ? 0.44 : 0.36);
  if (cav > -0.1) cav -= Math.max(0, n3.n(x / 2.4 + 17.5, y / 12, z / 2.4 - 23.5) - 0.38) * 2.4;
  d = Math.max(d, cav);
  // halls: huge open caverns below 18 m, tens of meters across, stood on pillars; dinosaur
  // country (a few wide regions between 26 and 135 m) is almost all hall
  if (depth > 18) {
    let hall = n3.fbm(x / 52 + 3.1, y / 26, z / 52 - 7.7, 2) - 0.4 + Math.min(0.06, (depth - 18) * 0.004);
    const dino = dinoAt(p, x, y, z);
    if (dino > 0) hall += dino * 0.34;
    if (hall > -0.15) hall -= Math.max(0, n3.n(x / 3.2 + 41.5, y / 16, z / 3.2 - 5.5) - 0.42) * 2.4;
    d = Math.max(d, hall);
  }
  // ravines: tall narrow cracks running for tens of meters
  if (depth > 6) {
    const r = Math.abs(n3.n(x / 34 + 50.5, 0.37, z / 34 - 50.5));
    if (r < 0.05) {
      const q = n1.n(x / 80 + 9.1, 2.7, z / 80 - 4.4);
      if (q > 0) {
        const t = (y + 9 + q * 60) / (3 + q * 14);
        if (t > -1 && t < 1) d = Math.max(d, (0.026 * Math.min(1, q * 6) * (1 - t * t) - r) * 6);
      }
    }
  }
  return d;
}

/** How much of dinosaur country a point is in (0..1): wide regions between 26 and 135 m down. */
export function dinoAt(p, x, y, z) {
  const depth = -y;
  if (depth < 26 || depth > 135) return 0;
  const n = p.noise[0].n(x / 85 + 13.7, 0.73, z / 85 - 6.1);
  const fade = Math.min(1, (depth - 26) / 8, (135 - depth) / 8);
  return Math.max(0, Math.min(1, (n - 0.35) / 0.1)) * fade;
}

/**
 * Biomes (zones 1–3, and dinosaur country): 0 plain, 1 mossy grotto, 2 sandstone hollows,
 * 3 mushroom hollow, 4 dino caverns.
 * Big regions from slow noise; they change materials and dressing, never the cave shapes.
 */
export const BIOMES = [
  null,
  { id: 'moss', name: 'Mossy Grotto', desc: 'glow moss on every stone and vines hanging from the roof', tint: [0.0, 0.035, 0.012], fog: [0.0, 0.008, 0.004] },
  { id: 'dry', name: 'Sandstone Hollows', desc: 'warm and dusty; sand floors pour away under your paws', tint: [0.04, 0.022, 0.0], fog: [0.012, 0.006, 0.0] },
  { id: 'fungus', name: 'Mushroom Hollow', desc: 'glowcaps taller than a mole, soft mycelium underfoot', tint: [0.012, 0.0, 0.04], fog: [0.004, 0.0, 0.012] },
  { id: 'dino', name: 'Dino Caverns', desc: 'huge warm halls of ferns and ancient bones, and something big breathing in the dark', tint: [0.03, 0.035, 0.0], fog: [0.01, 0.012, 0.002] },
];
export function biomeAt(p, x, y, z) {
  const depth = -y;
  if (dinoAt(p, x, y, z) > 0.5) return 4;
  if (depth < 3 || depth > ZONE_DEPTHS[3]) return 0;
  const b = p.noise[3].n(x / 40 + 7.3, y / 50 + 1.9, z / 40 - 3.1);
  if (b > 0.24) return 1;
  if (b < -0.26) return 2;
  if (p.noise[0].n(x / 46 - 11.5, y / 50 + 4.4, z / 46 + 5.2) > 0.27) return 3;
  return 0;
}

/** trilinear sample of a coarse NS³ field at cell o with fractions fx, fy, fz */
function tri(f, o, fx, fy, fz) {
  const c00 = f[o] + (f[o + 1] - f[o]) * fx, c10 = f[o + NS] + (f[o + NS + 1] - f[o + NS]) * fx;
  const o2 = o + NS * NS;
  const c01 = f[o2] + (f[o2 + 1] - f[o2]) * fx, c11 = f[o2 + NS] + (f[o2 + NS + 1] - f[o2 + NS]) * fx;
  const c0 = c00 + (c10 - c00) * fy, c1 = c01 + (c11 - c01) * fy;
  return c0 + (c1 - c0) * fz;
}

export class ChunkGen {
  constructor(plan) {
    this.plan = plan;
    this.dens = new Float32Array(NS * NS * NS);
    this.band = new Float32Array(NS * NS * NS);
    this.pock = new Float32Array(NS * NS * NS);
    // two noises whose zero sets cross in thin tubes: roots hanging down through the topsoil
    this.ra = new Float32Array(NS * NS * NS);
    this.rb = new Float32Array(NS * NS * NS);
    this.bio = new Uint8Array(NS * NS * NS); // biome per sample
    this.patch = new Float32Array(NS * NS * NS); // moss / sand / mycelium patches
    this.lump = new Float32Array(NS * NS * NS); // half-meter lumps on every cave surface
  }

  /**
   * Fill vox (Uint8Array CS³, index x + CS*(y + CS*z)) for chunk (cx, cy, cz).
   * Returns the ore deposits that reach into this chunk: [{id, oreId, item, x, y, z, r, q, seed}].
   */
  generate(cx, cy, cz, vox) {
    const deps = [];
    const p = this.plan, [n0, n1, n2, n3] = p.noise;
    const X0 = cx * CS, Y0 = cy * CS, Z0 = cz * CS;
    const B = BOUNDS;
    // coarse fields
    for (let k = 0; k < NS; k++) for (let j = 0; j < NS; j++) for (let i = 0; i < NS; i++) {
      const x = (X0 + i * S) / VOX, y = (Y0 + j * S) / VOX, z = (Z0 + k * S) / VOX;
      const depth = -y;
      const d = caveDensity(p, x, y, z);
      const o = i + NS * (j + NS * k);
      this.dens[o] = d;
      this.band[o] = depth + n3.fbm(x / 9, y / 9, z / 9, 2) * 3.2;
      this.pock[o] = n1.fbm(x / 6 + 100, y / 6, z / 6, 2);
      if (depth < 7) { this.ra[o] = n2.n(x / 1.1, y / 3.2, z / 1.1); this.rb[o] = n0.n(x / 1.1 + 40, y / 3.2, z / 1.1 - 40); } else { this.ra[o] = 1; this.rb[o] = 1; }
      this.bio[o] = biomeAt(p, x, y, z);
      this.patch[o] = n0.n(x / 1.6 + 3.3, y / 1.6, z / 1.6 - 7.7);
      this.lump[o] = n1.n(x / 0.7 - 21.1, y / 0.7 + 5.5, z / 0.7 + 13.9) * 0.035;
    }
    const hx = p.house;
    for (let lz = 0; lz < CS; lz++) {
      const kz = lz / S | 0, fz = (lz % S) / S;
      for (let ly = 0; ly < CS; ly++) {
        const jy = ly / S | 0, fy = (ly % S) / S;
        for (let lx = 0; lx < CS; lx++) {
          const ix = lx / S | 0, fx = (lx % S) / S;
          const o = ix + NS * (jy + NS * kz);
          const vx = X0 + lx, vy = Y0 + ly, vz = Z0 + lz;
          const xm = vx / VOX, ym = vy / VOX, zm = vz / VOX;
          const vi = lx + CS * (ly + CS * lz);
          // world shell
          if (xm < B.x0 + 1 || xm > B.x1 - 1 || zm < B.z0 + 1 || zm > B.z1 - 1 || ym < B.y0 + 1) { vox[vi] = M.BEDROCK; continue; }
          if (ym > B.y1 - 0.5) { vox[vi] = M.BEDROCK; continue; }
          // lumpy, not speckled: smooth half-meter lumps and a hair of per-voxel grain (together
          // under isSolid's 0.05 margin)
          const dens = tri(this.dens, o, fx, fy, fz) + tri(this.lump, o, fx, fy, fz) + (h3(vx, vy, vz, p.seed) - 0.5) * 0.012;
          if (dens > 0) { vox[vi] = 0; continue; }
          const band = tri(this.band, o, fx, fy, fz);
          const zone = zoneAt(Math.max(0, band));
          const zm2 = ZMAT[zone];
          const layer = Math.floor(band / 2.6);
          let m = (layer & 3) === 0 ? zm2.b : (layer & 3) === 2 ? zm2.c : zm2.a;
          if (zone === 1 && band > 14) m = (layer & 1) ? M.STONE : M.CLAY;
          if (tri(this.pock, o, fx, fy, fz) > 0.34) m = zm2.pocket;
          const bio = this.bio[o];
          if (bio === 2 && (m === M.DIRT || m === M.LOAM || m === M.CLAY || m === M.MUDSTONE)) m = M.SANDSTONE;
          else if (zone === 1 && band < 4 && bio !== 2) {
            const t = 0.055 * (1 - Math.max(0, band) / 4);
            if (Math.abs(tri(this.ra, o, fx, fy, fz)) < t && Math.abs(tri(this.rb, o, fx, fy, fz)) < t) m = M.ROOTS;
          }
          vox[vi] = m;
        }
      }
    }
    // the burrow: solid planked walls (the house itself lives in the iso scene)
    this.fillBox(vox, X0, Y0, Z0, hx.x0 - 0.45, hx.y0 - 0.5, hx.z0 - 0.45, hx.x1 + 0.45, hx.y1 + 0.6, hx.z1 + 0.45, M.BURROW);
    // features
    const cx0 = X0 / VOX, cy0 = Y0 / VOX, cz0 = Z0 / VOX, cx1 = (X0 + CS) / VOX, cy1 = (Y0 + CS) / VOX, cz1 = (Z0 + CS) / VOX;
    for (const f of p.features) {
      const bb = f.bb;
      if (bb[3] < cx0 || bb[0] > cx1 || bb[4] < cy0 || bb[1] > cy1 || bb[5] < cz0 || bb[2] > cz1) continue;
      this.stamp(f, vox, X0, Y0, Z0);
    }
    // no lone voxels floating in the air
    this.unspeck(vox);
    // decorations need to know where the air is
    this.decorate(vox, X0, Y0, Z0);
    // ore deposits last (inside rock only)
    for (const a of p.areas) {
      if (a.x + a.r + 1 < cx0 || a.x - a.r - 1 > cx1 || a.y + a.r < cy0 - 1 || a.y - a.r > cy1 + 1 || a.z + a.r + 1 < cz0 || a.z - a.r - 1 > cz1) continue;
      a.deposits.forEach((d, i) => { if (this.stampDeposit(d, a, vox, X0, Y0, Z0)) deps.push({ id: `a${a.id}_${i}`, oreId: a.oreId, item: a.item, ...d }); });
    }
    // scattered common ore everywhere
    for (const sd of this.scatter(cx, cy, cz)) if (this.stampDeposit(sd, sd, vox, X0, Y0, Z0)) deps.push(sd);
    return deps;
  }

  /** The common ore scattered through this chunk (about one deposit per 20 m³ of rock). */
  scatter(cx, cy, cz) {
    const p = this.plan, CM = CS / VOX;
    const cx0 = cx * CM, cy0 = cy * CM, cz0 = cz * CM;
    const zone = zoneAt(Math.max(0, -(cy0 + CM / 2)));
    const spawn = ORE_SPAWN[zone] || [];
    const hc = h3i(cx, cy, cz, p.seed + 5);
    const per = (CM * CM * CM) / 20; // expected deposits in this chunk
    const n = Math.floor(per) + (((hc >>> 8) % 1000) / 1000 < per - Math.floor(per) ? 1 : 0);
    const out = [];
    for (let k = 0; k < n && spawn.length; k++) {
      const e = spawn[(hc >>> (4 + k * 3)) % Math.min(3, spawn.length)];
      out.push({ id: `s${cx}_${cy}_${cz}_${k}`, oreId: ORE_ID[e[0]], item: e[0], x: cx0 + h3(cx, cy, cz, k + 1) * CM, y: cy0 + h3(cx, cy, cz, k + 9) * CM, z: cz0 + h3(cx, cy, cz, k + 17) * CM, r: 0.14 + h3(cx, cy, cz, k + 3) * 0.14, q: 70 + h3(cx, cy, cz, k + 5) * 25, seed: hc + k });
    }
    return out;
  }

  /** Deposits reaching into a chunk without generating it (for chunks that are solid rock). */
  depositsFor(cx, cy, cz) {
    const p = this.plan, CM = CS / VOX;
    const cx0 = cx * CM, cy0 = cy * CM, cz0 = cz * CM, cx1 = cx0 + CM, cy1 = cy0 + CM, cz1 = cz0 + CM;
    const out = [];
    for (const a of p.areas) {
      if (a.x + a.r + 1 < cx0 || a.x - a.r - 1 > cx1 || a.y + a.r < cy0 - 1 || a.y - a.r > cy1 + 1 || a.z + a.r + 1 < cz0 || a.z - a.r - 1 > cz1) continue;
      a.deposits.forEach((d, i) => {
        if (d.x + d.r < cx0 || d.x - d.r > cx1 || d.y + d.r < cy0 || d.y - d.r > cy1 || d.z + d.r < cz0 || d.z - d.r > cz1) return;
        out.push({ id: `a${a.id}_${i}`, oreId: a.oreId, item: a.item, ...d });
      });
    }
    for (const sd of this.scatter(cx, cy, cz)) out.push(sd);
    return out;
  }

  /**
   * True when the chunk is rock all the way through: no cave reaches into it and no feature
   * touches it. Such chunks are never generated or meshed until something digs into them.
   */
  isSolid(cx, cy, cz) {
    const p = this.plan, CM = CS / VOX;
    const cx0 = cx * CM, cy0 = cy * CM, cz0 = cz * CM, cx1 = cx0 + CM, cy1 = cy0 + CM, cz1 = cz0 + CM;
    const hx = p.house;
    if (cx1 > hx.x0 - 1 && cx0 < hx.x1 + 1 && cy1 > hx.y0 - 1 && cy0 < hx.y1 + 1 && cz1 > hx.z0 - 1 && cz0 < hx.z1 + 1) return false;
    // a margin around the chunk too: its outer voxels are the walls of any cave next door
    const mg = 0.35;
    for (const f of p.features) {
      const bb = f.bb;
      if (bb[3] < cx0 - mg || bb[0] > cx1 + mg || bb[4] < cy0 - mg || bb[1] > cy1 + mg || bb[5] < cz0 - mg || bb[2] > cz1 + mg) continue;
      return false;
    }
    const X0 = cx * CS, Y0 = cy * CS, Z0 = cz * CS;
    for (let k = -1; k <= NS; k++) for (let j = -1; j <= NS; j++) for (let i = -1; i <= NS; i++) {
      const x = (X0 + i * S) / VOX, y = (Y0 + j * S) / VOX, z = (Z0 + k * S) / VOX;
      if (caveDensity(p, x, y, z) > -0.05) return false;
    }
    return true;
  }

  fillBox(vox, X0, Y0, Z0, x0, y0, z0, x1, y1, z1, m) {
    const a = this.clip(x0, y0, z0, x1, y1, z1, X0, Y0, Z0);
    if (!a) return;
    for (let z = a[2]; z < a[5]; z++) for (let y = a[1]; y < a[4]; y++) for (let x = a[0]; x < a[3]; x++) vox[x + CS * (y + CS * z)] = m;
  }

  /** meters AABB → local voxel range [x0,y0,z0,x1,y1,z1) or null */
  clip(x0, y0, z0, x1, y1, z1, X0, Y0, Z0) {
    const lx0 = Math.max(0, Math.floor(x0 * VOX) - X0), ly0 = Math.max(0, Math.floor(y0 * VOX) - Y0), lz0 = Math.max(0, Math.floor(z0 * VOX) - Z0);
    const lx1 = Math.min(CS, Math.ceil(x1 * VOX) - X0), ly1 = Math.min(CS, Math.ceil(y1 * VOX) - Y0), lz1 = Math.min(CS, Math.ceil(z1 * VOX) - Z0);
    if (lx0 >= lx1 || ly0 >= ly1 || lz0 >= lz1) return null;
    return [lx0, ly0, lz0, lx1, ly1, lz1];
  }

  stamp(f, vox, X0, Y0, Z0) {
    if (f.kind === 'prologue') { stampPrologue(f, vox, X0, Y0, Z0, CS); return; }
    if (f.kind === 'trail') { stampTrail(f, vox, X0, Y0, Z0, CS); return; }
    if (f.kind === 'burrow') { stampBurrow(f, vox, X0, Y0, Z0, CS); return; }
    if (f.kind === 'ruin') { stampRuin(f, vox, X0, Y0, Z0, CS); return; }
    const p = this.plan, bb = f.bb;
    const a = this.clip(bb[0], bb[1], bb[2], bb[3], bb[4], bb[5], X0, Y0, Z0);
    if (!a) return;
    for (let z = a[2]; z < a[5]; z++) for (let y = a[1]; y < a[4]; y++) for (let x = a[0]; x < a[3]; x++) {
      const vx = X0 + x, vy = Y0 + y, vz = Z0 + z;
      const xm = (vx + 0.5) / VOX, ym = (vy + 0.5) / VOX, zm = (vz + 0.5) / VOX;
      const vi = x + CS * (y + CS * z);
      const cur = vox[vi];
      if (cur === M.BEDROCK && f.kind !== 'mouth') continue;
      if (f.kind === 'sphere') {
        const dx = (xm - f.x) / f.r, dy = (ym - f.y) / (f.ry || f.r), dz = (zm - f.z) / f.r;
        const d2 = dx * dx + dy * dy + dz * dz + (h3(vx, vy, vz, 3) - 0.5) * 0.12;
        if (d2 < 1 && cur !== M.BURROW) vox[vi] = f.m;
      } else if (f.kind === 'lake') {
        const dx = (xm - f.x) / f.r, dy = (ym - f.y) / (f.r * 0.55), dz = (zm - f.z) / f.r;
        const d2 = dx * dx + dy * dy + dz * dz + (h3(vx, vy, vz, 4) - 0.5) * 0.1;
        if (d2 < 1 && cur !== M.BURROW) vox[vi] = ym < (f.wl ?? f.y - f.r * 0.12) ? f.fluid : 0;
        else if (d2 < 1.25 && f.fluid === M.LAVA && cur && cur < 40) vox[vi] = h3(vx, vy, vz, 5) < 0.5 ? M.MAGMAROCK : M.OBSIDIAN;
        else if (d2 < 1.32 && f.shell && cur === 0 && ym < (f.wl ?? f.y - f.r * 0.12) + 0.2) vox[vi] = f.shell; // seal caves below the waterline
      } else if (f.kind === 'box' || f.kind === 'mouth') {
        if (xm < f.x0 || xm > f.x1 || ym < f.y0 || ym > f.y1 || zm < f.z0 || zm > f.z1) {
          // the back of the burrow wall at the end of a mouth: a planked door in a timber frame
          if (f.kind === 'mouth' && cur === M.BURROW) {
            const lat = f.dir[0] ? zm : xm, l0 = f.dir[0] ? f.z0 : f.x0, l1 = f.dir[0] ? f.z1 : f.x1;
            const ax = f.dir[0] ? xm : zm;
            const end = f.dir[0] ? (f.dir[0] < 0 ? f.x1 : f.x0) : (f.dir[2] < 0 ? f.z1 : f.z0);
            if (Math.abs(ax - end) < 0.13 && lat > l0 - 0.13 && lat < l1 + 0.13 && ym >= f.y0 && ym < f.y1 + 0.13) {
              const edge = lat < l0 + 0.02 || lat > l1 - 0.02 || ym > f.y1 - 0.02;
              vox[vi] = edge ? M.TIMBER : M.DOOR;
            }
            continue;
          }
          // timber frames around station rooms
          if (f.timber && cur && cur !== M.BURROW) {
            const onEdgeX = xm < f.x0 + 0.01 || xm > f.x1 - 0.01;
            const post = (Math.abs(xm - f.x0) < 0.25 || Math.abs(xm - f.x1) < 0.25) && (Math.abs(zm - f.z0) < 0.25 || Math.abs(zm - f.z1) < 0.25);
            const beam = ym > f.y1 && ym < f.y1 + 0.25;
            if (post || (beam && !onEdgeX)) vox[vi] = M.TIMBER;
          }
          continue;
        }
        if (f.kind === 'mouth') {
          // frame the mouth with warm planks on the burrow side
          vox[vi] = 0;
        } else vox[vi] = f.m;
      } else if (f.kind === 'shaft') {
        const d = Math.hypot(xm - f.x, zm - f.z);
        if (d < 1.1) vox[vi] = 0;
        else if (d < 1.35 && (Math.abs(ym * 2 % 3) < 0.25 || Math.abs(xm - f.x) < 0.15 || Math.abs(zm - f.z) < 0.15)) vox[vi] = M.TIMBER;
      } else if (f.kind === 'cage') {
        // an old lift: plank floor, a timber cage with a roof, the shaft going up through the rock
        const dx = xm - f.x, dz = zm - f.z, dy = ym - f.y;
        const ax = Math.abs(dx), az = Math.abs(dz);
        if (dy < 0 && dy > -0.13 && ax < 1.5 && az < 1.5) vox[vi] = M.BOARDS;
        else if (dy >= 0 && dy < 2.05 && ax < 0.7 && az < 0.7) {
          const post = ax > 0.56 && az > 0.56;
          const rail = (ax > 0.58 || az > 0.58) && (Math.abs(dy - 0.55) < 0.07 || dy > 1.9) && !(dz > 0.58 && dy < 1.9);
          const roof = dy > 1.92;
          vox[vi] = post || rail || roof ? (roof && ax < 0.5 && az < 0.5 ? M.BOARDS : M.TIMBER) : 0;
        } else if (dy >= 2.05 && dy < 6.5 && ax < 0.62 && az < 0.62) {
          // the shaft: open, with timber rings every so often and the cable
          vox[vi] = (ax > 0.5 || az > 0.5) && Math.abs((dy * 2) % 2 - 1) < 0.1 ? M.TIMBER : ax < 0.07 && az < 0.07 ? M.TIMBER : 0;
        } else if (dy >= 0.9 && dy < 1.15 && Math.abs(dx - 0.95) < 0.09 && Math.abs(dz - 0.95) < 0.09) vox[vi] = M.LANTERN;
      } else if (f.kind === 'geode') {
        // a hollow stone egg: a hard shell, a lining of crystal spikes, air inside
        const d = Math.hypot(xm - f.x, ym - f.y, zm - f.z) / f.r + (h3(vx, vy, vz, 29) - 0.5) * 0.08;
        if (d < 0.6) vox[vi] = h3(vx, vy, vz, 31) < 0.06 && d > 0.48 ? M.CRYSTAL : 0;
        else if (d < 0.8) vox[vi] = h3(vx >> 1, vy >> 1, vz >> 1, 33) < 0.3 + (d - 0.6) * 2 ? M.CRYSTAL : 0;
        else if (d < 1) vox[vi] = M.GEODE;
      } else if (f.kind === 'gate') {
        // brick arch with a boarded gate in it; lanterns either side
        const dx = xm - f.x, dz = zm - f.z, dy = ym - f.y;
        const along = dx * 0.6 + dz * 0.8, across = -dx * 0.8 + dz * 0.6; // gate faces south-west, toward the hall
        if (Math.abs(across) < 0.4 && Math.abs(along) < 2.4 && dy > -0.2 && dy < 3.2) {
          const inner = Math.abs(along) < 1.3 && dy < 2.4;
          vox[vi] = inner ? (Math.abs(across) < 0.12 ? M.BOARDS : 0) : M.BRICK;
          if (inner && Math.abs(across) < 0.12 && (Math.floor(along * 8) % 6 === 0)) vox[vi] = M.TIMBER;
        } else if (Math.abs(across - 0.55) < 0.15 && Math.abs(Math.abs(along) - 1.9) < 0.16 && Math.abs(dy - 1.8) < 0.16) vox[vi] = M.LANTERN;
      }
    }
  }

  /** Moss on floors, crystals and stalactites, glowing bits (only inside this chunk). */
  decorate(vox, X0, Y0, Z0) {
    const p = this.plan, seed = p.seed;
    const P = this.patch;
    const C2 = CS * CS;
    // Old Star's dig is dressed by the story (src/deep/Prologue.js): no moss, vines or spikes there
    if (this.pro === undefined) this.pro = p.features.find((f) => f.kind === 'prologue') || null;
    const pf = this.pro, pbb = pf && pf.bb;
    const PL = pbb && !(pbb[3] < X0 / VOX || pbb[0] > (X0 + CS) / VOX || pbb[4] < Y0 / VOX || pbb[1] > (Y0 + CS) / VOX || pbb[5] < Z0 / VOX || pbb[2] > (Z0 + CS) / VOX) ? prologueLayout(pf) : null;
    for (let z = 0; z < CS; z++) for (let y = 1; y < CS - 1; y++) for (let x = 0; x < CS; x++) {
      const vi = x + CS * y + C2 * z;
      const m = vox[vi];
      if (!NATURAL[m]) continue;
      const airUp = vox[vi + CS] === 0, airDown = vox[vi - CS] === 0;
      const inX = x > 0 && x < CS - 1, inZ = z > 0 && z < CS - 1;
      const airSide = inX && inZ && (vox[vi - 1] === 0 || vox[vi + 1] === 0 || vox[vi - C2] === 0 || vox[vi + C2] === 0);
      if (!airUp && !airDown && !airSide) continue;
      const vx = X0 + x, vy = Y0 + y, vz = Z0 + z;
      if (PL && prologueInside(PL, (vx + 0.5) / VOX, (vy + 0.5) / VOX, (vz + 0.5) / VOX, 0.5)) continue;
      const depth = -vy / VOX;
      const zone = zoneAt(depth);
      const o = (x >> 2) + NS * ((y >> 2) + NS * (z >> 2));
      const bio = this.bio[o];
      const pt = tri(P, o, (x & 3) / 4, (y & 3) / 4, (z & 3) / 4);
      const h = h3(vx, vy, vz, seed + 41);
      if (airUp) {
        // floors: moss patches, sand, mycelium
        if (bio === 1) { if (pt > -0.45 && m !== M.CRYSTALROCK) vox[vi] = M.MOSS; }
        else if (bio === 2) { if (pt > -0.35) { vox[vi] = M.SAND; if (NATURAL[vox[vi - CS]]) vox[vi - CS] = M.SAND; } }
        else if (bio === 3) { if (pt > -0.25) vox[vi] = M.MYCEL; }
        else if (bio === 4) { if (pt > 0.05 && m !== M.CRYSTALROCK) vox[vi] = M.MOSS; }
        else if (zone <= 3 && pt > 0.22 && h < 0.85 && m !== M.CRYSTALROCK) vox[vi] = M.MOSS;
        // mushrooms: a few giants per meter-cell anchor (the small stuff, the ferns, grass and
        // glowcap buttons, are drawn as painted cards by Vegetation.js now: no blocky voxel plants)
        if (bio === 3) {
          const cx = Math.floor(vx / VOX), cz = Math.floor(vz / VOX);
          if (h3(cx, cz, 2, seed + 63) < 0.5 && (vx - cx * VOX) === Math.floor(h3(cx, cz, 0, seed + 61) * VOX) && (vz - cz * VOX) === Math.floor(h3(cx, cz, 1, seed + 61) * VOX)) this.mushroom(vox, x, y + 1, z, h3(cx, cz, 3, seed + 67));
        } else if (bio === 4) {
          // dinosaur country: now and then the bones of something huge
          const cx = Math.floor(vx / VOX), cz = Math.floor(vz / VOX);
          if (h3(cx, cz, 5, seed + 71) < 0.07 && (vx - cx * VOX) === Math.floor(h3(cx, cz, 0, seed + 73) * VOX) && (vz - cz * VOX) === Math.floor(h3(cx, cz, 1, seed + 73) * VOX)) this.ribs(vox, x, y + 1, z, h3(cx, cz, 3, seed + 75));
        }
        // crystal spikes on cave floors (grotto, frost, core); stalagmites in the upper zones
        if ((zone === 3 || zone === 5 || zone === 6) && h3(vx >> SH, vy, vz >> SH, seed + 43) < 0.012) this.spike(vox, x, y + 1, z, 1, M.CRYSTAL, (4 + (h * 60 | 0) % 6) * VK);
        else if (zone <= 2 && bio !== 3 && h3(vx >> SH, vy, vz >> SH, seed + 45) < 0.006) this.spike(vox, x, y + 1, z, 1, bio === 2 ? M.SANDSTONE : zone === 1 ? M.STONE : M.LIMESTONE, (3 + (h * 70 | 0) % 5) * VK);
      } else if (airDown) {
        // ceilings: stalactites and crystals (hanging vines and roots are Vegetation.js cards)
        const h2 = h3(vx, vy, vz, seed + 47);
        if (bio === 1 && pt > -0.3) vox[vi] = M.MOSS;
        else if ((bio === 4 || (zone === 1 && depth < 12 && bio !== 2)) && pt > 0.1 && (m === M.DIRT || m === M.LOAM || m === M.CLAY)) vox[vi] = M.ROOTS; // rooty roofs the roots hang from
        if (zone >= 2 && h3(vx >> SH, vy, vz >> SH, seed + 49) < 0.01) this.spike(vox, x, y - 1, z, -1, zone >= 5 ? M.ICE : m, (3 + (h2 * 50 | 0) % 6) * VK);
        else if (zone === 3 && h2 < 0.004 / (VK * VK)) this.spike(vox, x, y - 1, z, -1, M.CRYSTAL, 3 * VK);
      } else if (bio === 1 && pt > 0.05) vox[vi] = M.MOSS; // mossy walls in the grotto
    }
  }

  /** Clear voxels with air on all six sides (inside the chunk; natural materials only). */
  unspeck(vox) {
    const C2 = CS * CS;
    for (let z = 1; z < CS - 1; z++) for (let y = 1; y < CS - 1; y++) for (let x = 1; x < CS - 1; x++) {
      const vi = x + CS * y + C2 * z;
      if (!NATURAL[vox[vi]]) continue;
      if (vox[vi - 1] || vox[vi + 1] || vox[vi - CS] || vox[vi + CS] || vox[vi - C2] || vox[vi + C2]) continue;
      vox[vi] = 0;
    }
  }

  /** Ribs of something enormous: bone arches sticking out of the floor (only where they fit). */
  ribs(vox, x, y, z, k) {
    const C2 = CS * CS, R = Math.round((0.35 + k * 0.4) * VOX), n = 3 + ((k * 7) | 0) % 3, gap = 4;
    const along = k > 0.5;
    const len = (n - 1) * gap;
    if ((along ? x + len : x) >= CS - 1 || (along ? z : z + len) >= CS - 1 || x - R < 1 || z - R < 1 || x + R >= CS - 1 || z + R >= CS - 1 || y + R + 1 >= CS) return;
    for (let i = 0; i < n; i++) {
      const ox = along ? x + i * gap : x, oz = along ? z : z + i * gap;
      const r = R * (1 - Math.abs(i - (n - 1) / 2) / n * 0.6);
      for (let a = 0; a <= 40; a++) {
        const t = a / 40 * Math.PI, c = Math.cos(t) * r, h = Math.sin(t) * r * 1.15;
        const xx = along ? ox : ox + Math.round(c), zz = along ? oz + Math.round(c) : oz, yy = y + Math.round(h);
        for (const dt of [0, 1]) { const vi = xx + CS * (yy + dt) + C2 * zz; if (xx >= 0 && xx < CS && zz >= 0 && zz < CS && yy + dt < CS && vox[vi] === 0) vox[vi] = M.BONE; }
      }
    }
  }

  /** A giant glowcap: a pale stem and a domed glowing cap, only where it fits in this chunk. */
  mushroom(vox, x, y, z, k) {
    const sh = Math.round((0.4 + k * 0.8) * VOX), R = Math.round((0.24 + k * 0.34) * VOX), sr = k > 0.5 ? 2 : 1;
    if (x - R < 0 || x + R >= CS || z - R < 0 || z + R >= CS || y + sh + 4 >= CS) return;
    for (let i = 0; i < sh + 4; i++) if (vox[x + CS * (y + i + CS * z)] !== 0) return; // needs head room
    const put = (xx, yy, zz, m) => { const vi = xx + CS * (yy + CS * zz); if (vox[vi] === 0) vox[vi] = m; };
    for (let i = 0; i < sh; i++) {
      const lean = Math.round(Math.sin(i / sh * 1.6) * k * 2); // a slight curve
      for (let dz = -sr; dz <= sr; dz++) for (let dx = -sr; dx <= sr; dx++) if (dx * dx + dz * dz <= sr * sr + 0.5) put(x + dx + lean, y + i, z + dz, M.STEM);
    }
    const top = y + sh, lean = Math.round(Math.sin(1.6) * k * 2);
    for (let l = 0; l < 4; l++) {
      const r = R * Math.sqrt(1 - (l / 4.2) ** 2) - (l === 0 ? 0 : 0.5);
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        const xx = x + dx + lean;
        if (xx < 0 || xx >= CS) continue;
        // the underside is gills (stem-coloured) inside the rim
        put(xx, top + l, z + dz, l === 0 && d2 < (r - 1.5) * (r - 1.5) ? M.STEM : M.GLOWCAP);
      }
    }
  }

  spike(vox, x, y, z, dir, m, len) {
    for (let i = 0; i < len; i++) {
      const yy = y + dir * i;
      if (yy < 0 || yy >= CS) return;
      // a cone: thick at the root, a single voxel at the tip
      const r = Math.round((1 - i / len) * VK * 1.4);
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= CS || zz >= CS) continue;
        if (dx * dx + dz * dz > r * r + 0.5) continue;
        const vi = xx + CS * (yy + CS * zz);
        if (vox[vi] === 0) vox[vi] = m;
      }
    }
  }

  stampDeposit(d, area, vox, X0, Y0, Z0) {
    if (!area.oreId) return false;
    const a = this.clip(d.x - d.r - 0.2, d.y - d.r - 0.2, d.z - d.r - 0.2, d.x + d.r + 0.2, d.y + d.r + 0.2, d.z + d.r + 0.2, X0, Y0, Z0);
    if (!a) return false;
    const mo = ORE_BASE + area.oreId;
    let n = 0;
    for (let z = a[2]; z < a[5]; z++) for (let y = a[1]; y < a[4]; y++) for (let x = a[0]; x < a[3]; x++) {
      const vx = X0 + x, vy = Y0 + y, vz = Z0 + z;
      const dx = (vx + 0.5) / VOX - d.x, dy = (vy + 0.5) / VOX - d.y, dz = (vz + 0.5) / VOX - d.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) / d.r + (h3(vx, vy, vz, d.seed) - 0.5) * 0.5;
      if (dist > 1) continue;
      const vi = x + CS * (y + CS * z);
      const cur = vox[vi];
      if (!cur || cur >= 40 || cur === M.BEDROCK || cur === M.BURROW || cur === M.TIMBER || cur === M.BRICK) continue;
      vox[vi] = mo;
      n++;
    }
    return n > 0;
  }
}

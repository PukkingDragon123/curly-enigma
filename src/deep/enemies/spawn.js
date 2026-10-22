// Who lives where. Spreads creatures by zone, biome and cave shape, with a difficulty curve by
// depth, and keeps the counts capped (only the mole's surroundings are simulated):
//
//   wanderers  out of sight around the mole, every few seconds: a pick from the zone's table
//              (bands of kobolds, slimes, spiders, trolls, drakes, wraiths… and the older folk),
//              in groups whose size grows with depth
//   lairs      plan.dangers nests: a guaranteed group the first time you come near (kobold camps,
//              spider lairs with webs and an egg sac, troll dens with a sleeper, drake roosts on a
//              hoard with eggs, wraith haunts)
//   ruins      plan.ruins (when the ruins part adds them): wraiths drift among the old stones
//   dinos      the dino caverns (biome 4 once the generator has it; until then big deep caverns):
//              raptor packs, shellback herds with young and a nest, pterosaur flocks under tall
//              roofs, and now and then a cave tyrant in the biggest halls
//   critters   the harmless ones (critters.js), fish in lakes
import { zoneAt, ZONE_DEPTHS, biomeAt, BIOMES, caveDensity } from '../Generator.js';
import { M } from '../materials.js';
import { clamp, rand } from '../../core/util.js';
import { airAbove, fluidAt } from './physics.js';
import { Group } from './beast.js';

// wanderer tables: [kind, weight, minDepth?] (kinds are species keys; 'bats' = a roost)
const WANDER = {
  1: [['mimic', 3], ['puffer', 2], ['kobold', 2.2, 8], ['cave_slime', 2], ['cave_spider', 0.6, 14]],
  2: [['mimic', 1.4], ['puffer', 1.4], ['bats', 1.6], ['golem', 0.8], ['wisp', 0.8], ['crystal_golem', 0.3], ['kobold', 2.6], ['cave_slime', 1.6], ['cave_spider', 1.6], ['cave_troll', 0.5, 40]],
  3: [['wyrm', 1.6], ['wisp', 1.2], ['bats', 1.2], ['golem', 0.8], ['crystal_golem', 0.7], ['kobold', 1.2], ['cave_spider', 1.8], ['cave_slime', 1.2], ['cave_troll', 1.3], ['ruin_wraith', 0.5, 70]],
  4: [['imp', 3], ['golem', 0.9], ['bats', 0.9], ['crystal_golem', 0.6], ['cave_drake', 1.5], ['cave_troll', 0.9], ['cave_slime', 1], ['cave_spider', 0.8]],
  5: [['wyrm', 1.4], ['wisp', 1.3], ['golem', 1.2], ['crystal_golem', 0.7], ['cave_troll', 2], ['cave_drake', 1.2], ['ruin_wraith', 1.4], ['cave_slime', 0.9]],
  6: [['imp', 1.8], ['wisp', 1.6], ['wyrm', 1.4], ['crystal_golem', 0.7], ['cave_drake', 2], ['ruin_wraith', 2.4], ['cave_slime', 0.9], ['cave_troll', 0.8]],
};
// the dino caverns
const DINO = [['raptor', 3], ['shellback', 3], ['pterosaur', 1.6], ['tyrant', 0.55], ['cave_slime', 0.5]];
// how many come together: [min, max] at the top of the zone; +1 max in its deeper half
const PACK = { kobold: [2, 3], cave_slime: [1, 2], raptor: [3, 4], shellback: [2, 3], pterosaur: [2, 2], ruin_wraith: [1, 1], cave_spider: [1, 1] };
// lairs (plan nests) per zone: a group, or a lair recipe
const LAIRS = {
  1: [['mimic', 'mimic', 'puffer'], ['@kobold_camp'], ['cave_slime', 'cave_slime', 'cave_slime'], ['puffer', 'mimic']],
  2: [['golem', 'mimic', 'mimic'], ['bats'], ['@kobold_camp'], ['@spider_lair'], ['@troll_den'], ['crystal_golem'], ['puffer', 'puffer', 'mimic']],
  3: [['wyrm', 'bats'], ['crystal_golem', 'wisp'], ['@spider_lair'], ['@troll_den'], ['cave_slime', 'cave_slime', 'cave_slime'], ['@kobold_camp']],
  4: [['imp', 'imp', 'imp'], ['@drake_roost'], ['crystal_golem', 'imp'], ['@troll_den'], ['golem', 'imp', 'imp']],
  5: [['@troll_den'], ['@drake_roost'], ['ruin_wraith', 'ruin_wraith'], ['crystal_golem', 'wisp'], ['wyrm', 'wisp']],
  6: [['@drake_roost'], ['ruin_wraith', 'ruin_wraith', 'ruin_wraith'], ['crystal_golem', 'wisp'], ['wyrm', 'imp', 'imp']],
};
// harmless critters (enemies/critters.js): what lives where, and how many at once
const CRITTERS = {
  1: [['earthworm', 3], ['dust_bunny', 2]],
  2: [['earthworm', 1.5], ['dust_bunny', 1.5], ['glow_beetle', 2], ['rock_crab', 1.2], ['ore_slug', 1.2]],
  3: [['glow_beetle', 2], ['crystal_spider', 2.2], ['rock_crab', 1], ['ore_slug', 1], ['dust_bunny', 1]],
  4: [['gem_tortoise', 1.5], ['rock_crab', 1], ['ore_slug', 1]],
  5: [['gem_tortoise', 1], ['void_wisp', 1.6], ['ore_slug', 1]],
  6: [['gem_tortoise', 1], ['void_wisp', 2]],
};
const CRITTER_CAP = [0, 4, 5, 5, 4, 4, 4];
const DIRTY = new Set([M.DIRT, M.LOAM, M.CLAY, M.MOSS, M.ROOTS, M.MUDSTONE]);
// groups of wanderers at once, how long into a trip before the first, how often
const WANDER_CAP = [0, 2, 3, 3, 3, 4, 4];
const GRACE = [0, 75, 25, 15, 10, 10, 10];
// at most this many of the big ones around at once
const UNIQUE = { crystal_golem: 1, cave_troll: 2, cave_drake: 1, tyrant: 1 };
const PACK_CAP = { raptor: 1, kobold: 2, ruin_wraith: 1 };

const pick = (table) => {
  let r = Math.random() * table.reduce((s, e) => s + e[1], 0);
  for (const e of table) { r -= e[1]; if (r <= 0) return e; }
  return table[0];
};

export { CRITTERS, CRITTER_CAP, DIRTY };

export class Spawner {
  constructor(mgr) {
    this.mgr = mgr;
    this.spawnT = 8;
    this.nestT = 0;
    this.critterT = 2;
    this.lairsDone = new Set();
    this.lairRetry = new Map();
    this.ruinsDone = new Set();
    this.lakesDone = new Set();
    this.dinoCache = new Map();
    this.hasDinoBiome = !!(BIOMES[4] && /dino/i.test(BIOMES[4].id + BIOMES[4].name));
    this.stats = { spawned: 0, failed: 0, dino: 0 };
  }

  /** Depth within the mine as a smooth difficulty level: 1.0 at the top of zone 1 … 6.99 at the bottom. */
  level(y) {
    const d = Math.max(0, -y), z = zoneAt(d);
    const a = ZONE_DEPTHS[z - 1], b = ZONE_DEPTHS[z] ?? a + 40;
    return z + clamp((d - a) / (b - a), 0, 0.99);
  }

  /** Is (x, y, z) in a dino cavern? (biome 4, or until the generator has it: a big deep cavern) */
  isDino(x, y, z) {
    const plan = this.mgr.plan;
    if (this.hasDinoBiome) return biomeAt(plan, x, y, z) === 4;
    const depth = -y;
    if (depth < 30) return false;
    const k = Math.floor(x / 6) + ',' + Math.floor(y / 4) + ',' + Math.floor(z / 6);
    let v = this.dinoCache.get(k);
    if (v === undefined) { v = this.roomyD(x, y, z, 4.2, 5.5) >= 4; this.dinoCache.set(k, v); }
    return v;
  }
  /** roomy() from the generator's cave shapes (works where no chunk is loaded yet; ignores digging). */
  roomyD(x, y, z, ceil = 3, r = 5) {
    const plan = this.mgr.plan;
    const open = (px, py, pz) => caveDensity(plan, px, py, pz) > 0;
    for (let h = 0.4; h <= ceil; h += 0.45) if (!open(x, y + h, z)) return 0;
    let n = 0;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      let ok = true;
      for (let d = 0.6; d <= r && ok; d += 0.6) ok = open(x + c * d, y + 0.9, z + s * d);
      if (ok) n++;
    }
    return n;
  }
  /** How many of 8 horizontal directions are open for `r` meters, given a ceiling of at least `ceil`. */
  roomy(x, y, z, ceil = 3, r = 5) {
    const w = this.mgr.world;
    if (airAbove(w, x, y + 0.3, z, ceil + 0.5) < ceil) return 0;
    let n = 0;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      if (!w.raycast(x, y + 0.9, z, Math.cos(a), 0, Math.sin(a), r)) n++;
    }
    return n;
  }

  tick(dt) {
    const m = this.mgr;
    if (!m.autoSpawn) return;
    this.lairs(dt);
    this.ruins();
    this.critters(dt);
    this.wanderers(dt);
  }

  // ---------------------------------------------------------------- lairs
  lairs(dt) {
    const m = this.mgr, pl = m.pl;
    this.nestT -= dt;
    if (this.nestT > 0) return;
    this.nestT = 0.6;
    (m.plan.dangers || []).forEach((n, i) => {
      if (n.kind !== 'nest' || this.lairsDone.has(i)) return;
      const d = Math.hypot(n.x - pl.pos.x, (n.y - pl.pos.y) * 1.4, n.z - pl.pos.z);
      if (d > 21 || !m.loaded(n.x, n.y, n.z)) return;
      this.lairsDone.add(i);
      const zone = n.zone || zoneAt(-n.y);
      const sets = LAIRS[zone] || LAIRS[1];
      const set = sets[i % sets.length];
      const out = set[0][0] === '@' ? this.lair(set[0].slice(1), n, zone) : m.spawnGroup(set, n.x, n.y, n.z, zone, { nest: n, r: Math.max(1, n.r * 0.7) });
      if (out.length) this.register(n, 'lair' + i, set[0][0] === '@' ? set[0].slice(1) : set[0], zone, out);
      // nobody fit (the rock around may still be streaming in): try again in a moment, a few times
      if (!out.length) { const k = (this.lairRetry.get(i) || 0) + 1; this.lairRetry.set(i, k); if (k < 10) this.lairsDone.delete(i); }
    });
  }

  /** Lair recipes. */
  lair(kind, n, zone) {
    const m = this.mgr;
    const r = Math.max(1, n.r * 0.7);
    switch (kind) {
      case 'kobold_camp': {
        const k = 3 + (this.level(n.y) % 1 > 0.5 ? 1 : 0);
        return this.pack('kobold', n.x, n.y, n.z, zone, k, { r, camp: true, nest: n });
      }
      case 'spider_lair': {
        const out = this.pack('cave_spider', n.x, n.y, n.z, zone, zone >= 3 ? 2 : 1, { r, nest: n, hidden: false });
        if (out.length) out[0].constructor.lair?.(m, out[0], n);
        return out;
      }
      case 'troll_den': return m.spawnGroup(['cave_troll'], n.x, n.y, n.z, zone, { nest: n, r, asleep: true });
      case 'drake_roost': {
        const out = m.spawnGroup(['cave_drake'], n.x, n.y, n.z, zone, { nest: n, r, asleep: Math.random() < 0.75 });
        if (out.length) out[0].constructor.roost?.(m, out[0]);
        return out;
      }
    }
    return [];
  }

  // ---------------------------------------------------------------- ruins (wraiths)
  ruins() {
    const m = this.mgr, pl = m.pl;
    for (const R of m.plan.ruins || []) {
      if (this.ruinsDone.has(R.id)) continue;
      const d = Math.hypot(R.x - pl.pos.x, (R.y - pl.pos.y) * 1.4, R.z - pl.pos.z);
      if (d > 24 || !m.loaded(R.x, R.y, R.z)) continue;
      this.ruinsDone.add(R.id);
      const zone = R.zone || zoneAt(-R.y);
      const n = zone >= 4 ? 2 : 1 + (Math.random() < 0.5 ? 1 : 0);
      this.pack('ruin_wraith', R.x, R.y + 0.5, R.z, zone, n, { r: Math.max(2, (R.r || 4) * 0.6), haunt: R, hidden: false });
    }
  }

  // ---------------------------------------------------------------- wanderers
  wanderers(dt) {
    const m = this.mgr, pl = m.pl;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const zone = m.zone;
    const lv = this.level(pl.pos.y);
    this.spawnT = zone === 1 ? rand(22, 40) : rand(6, 12) * (1.15 - (lv - zone) * 0.3);
    if (m.time < (GRACE[zone] ?? 10) || m.safe) return;
    if (zone === 1) {
      const W = m.owner?.W ?? 10, D = m.owner?.D ?? 8;
      if (Math.hypot(pl.pos.x - W / 2, pl.pos.z - D / 2) < 16 || pl.pos.y > -3) return; // the first steps stay peaceful
    }
    const groups = new Set();
    for (const e of m.list) if (e.alive && !e.nest && !e.passive && !e.info.grazer) groups.add(e.group || e);
    const dino = this.isDino(pl.pos.x, pl.pos.y, pl.pos.z);
    const cap = (WANDER_CAP[zone] ?? 2) + (dino ? 1 : 0);
    if (groups.size >= cap || m.alive() >= m.maxAlive - 1) return;
    let [kind, , minD] = pick(dino ? DINO : WANDER[zone] || WANDER[1]);
    if (minD && -pl.pos.y < minD) kind = (WANDER[zone] || WANDER[1])[0][0];
    if (UNIQUE[kind] && m.list.filter((e) => e.alive && (e.kind === kind || e.key === kind)).length >= UNIQUE[kind]) kind = dino ? 'raptor' : (WANDER[zone] || WANDER[1])[0][0];
    // one hunting pack at a time (two in the deepest zones)
    if (PACK_CAP[kind] && [...groups].filter((g) => g.kind === kind).length >= PACK_CAP[kind] + (zone >= 5 ? 1 : 0)) kind = dino ? 'shellback' : (WANDER[zone] || WANDER[1])[0][0];
    const S = m.species(kind);
    const big = S?.info?.space?.[1] > 2;
    const spot = m.findSpot(kind, pl.pos.x, pl.pos.y, pl.pos.z, big ? 10 : 7, big ? 20 : 17, { tries: 24, ray: true });
    if (!spot) { this.spawnT = 1.2; this.stats.failed++; return; }
    if (kind === 'tyrant' && this.roomy(spot.x, spot.y, spot.z, 4.5, 6) < 5) kind = 'raptor';
    if (kind === 'pterosaur' && airAbove(m.world, spot.x, spot.y + 0.3, spot.z, 6) < 4.5) kind = 'shellback';
    this.stats.spawned++;
    if (dino) this.stats.dino++;
    if (spot.mat === M.MOSS && zone <= 3 && kind === 'mimic' && Math.random() < 0.5) kind = 'puffer';
    const pk = PACK[kind];
    if (pk) {
      const n = Math.round(rand(pk[0], pk[1] + (lv % 1 > 0.5 ? 1 : 0) + 0.49));
      this.pack(kind, spot.x, spot.y + 0.1, spot.z, zone, n, { spot, nestChance: dino ? 0.5 : 0 });
    } else m.spawnGroup([kind], spot.x, spot.y + 0.1, spot.z, zone, { spot, asleep: S?.info?.sleepy > 0.5 && Math.random() < S.info.sleepy * 0.6 });
  }

  /**
   * A social group: n of `kind` around (x, y, z) sharing a Group (pack / herd / flock / band),
   * maybe with a nest of eggs they guard and (herds) a few young.
   */
  pack(kind, x, y, z, zone, n, o = {}) {
    const m = this.mgr, S = m.species(kind);
    const kinds = Array(Math.max(1, n)).fill(kind);
    const type = S?.info?.social || 'band';
    const g = type !== 'solo' ? m.eco.addGroup(new Group(kind, type, { x, y, z })) : null;
    let nest = o.nest || null;
    // a clutch of eggs to guard
    if (!nest && o.nestChance && Math.random() < o.nestChance && S?.nestStyle) {
      const f = m.floorAt(x + rand(-1.5, 1.5), y + 0.5, z + rand(-1.5, 1.5), 0.8, 2, 1);
      if (f && !m.inView(f.x, f.y + 0.2, f.z)) nest = m.eco.addNest({ x: f.x, y: f.y, z: f.z, kind, ...S.nestStyle(zone) });
    }
    const out = m.spawnGroup(kinds, x, y, z, zone, { ...o, nest, group: g, r: o.r ?? 2.2 });
    if (g && out.length) {
      if (o.camp) out[0].chief = true;
      g.chief = out[0];
      // herds bring their young
      if (S?.info?.young && out.length) {
        const kids = Math.random() < 0.7 ? 1 + (Math.random() < 0.4 ? 1 : 0) : 0;
        for (let i = 0; i < kids; i++) m.spawnGroup([kind], out[0].pos.x, out[0].pos.y, out[0].pos.z, zone, { group: g, r: 2, baby: true, hidden: false });
      }
    }
    if (nest && nest.eggs) { for (const e of out) e.nest = nest; if (!o.nest) this.register(nest, `nest:${kind}:${Math.round(nest.x)},${Math.round(nest.z)}`, kind + '_nest', zone, out); }
    return out;
  }

  /** A lair or nest and its guardians: when the mole has beaten them all, act { type: 'nest' }. */
  register(nest, id, kind, zone, members) {
    if (!this.nestInfo) this.nestInfo = new Map();
    const rec = this.nestInfo.get(nest) || { id, kind, zone, members: [], done: false };
    rec.members.push(...members);
    this.nestInfo.set(nest, rec);
  }
  /** A creature died: was it the last guardian of its lair? */
  guardDown(e) {
    const rec = e.nest && this.nestInfo?.get(e.nest);
    if (!rec || rec.done) return;
    if (rec.members.some((c) => c.alive)) return;
    rec.done = true;
    this.mgr.state?.emit?.('act', { type: 'nest', id: rec.id, kind: rec.kind, zone: rec.zone });
  }

  // ---------------------------------------------------------------- critters
  critters(dt) {
    const m = this.mgr, pl = m.pl;
    // a few fish (frost shrimp in the Frost Vault) in every lake you come near
    (m.plan.dangers || []).forEach((n, i) => {
      if (n.kind !== 'water' || this.lakesDone.has(i)) return;
      if (Math.hypot(n.x - pl.pos.x, (n.y - pl.pos.y) * 1.4, n.z - pl.pos.z) > 22 || !m.loaded(n.x, n.y, n.z)) return;
      this.lakesDone.add(i);
      const zone = n.zone || zoneAt(-n.y);
      if (zone < 2) return; // blind fish live from the Clayworks down
      const count = 2 + (Math.random() < 0.5 ? 1 : 0);
      const Fish = m.species('cave_fish');
      for (let k = 0, made = 0; k < 30 && made < count; k++) {
        const x = n.x + rand(-0.7, 0.7) * n.r, z = n.z + rand(-0.7, 0.7) * n.r, y = n.y - rand(0.2, 0.45) * n.r;
        if (fluidAt(m.world, x, y, z) !== 1 || fluidAt(m.world, x, y + 0.15, z) !== 1) continue;
        m.add(new Fish(m, { x, y, z, zone, shrimp: zone >= 5 && made < 2, nest: n }));
        made++;
      }
    });
    this.critterT -= dt;
    if (this.critterT > 0) return;
    this.critterT = rand(3, 7);
    const zone = m.zone;
    if (m.safe || m.critters() >= (CRITTER_CAP[zone] ?? 4)) return;
    const [kind] = pick(CRITTERS[zone] || CRITTERS[1]);
    const worm = kind === 'earthworm';
    const spot = m.findSpot(kind, pl.pos.x, pl.pos.y, pl.pos.z, worm ? 3 : 6, 15, { tries: 16, ray: true, hidden: !worm });
    if (!spot) { this.critterT = 1; return; }
    const S = m.species(kind);
    if (worm) {
      // poke out of a dirt wall next to the spot (or out of the dirt floor)
      let a = null;
      for (let k = 0; k < 6 && !a; k++) {
        const ang = Math.random() * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
        const h = m.world.raycast(spot.x, spot.y + rand(0.15, 0.6), spot.z, dx, 0, dz, 1.6);
        if (h && DIRTY.has(h.m)) a = { x: h.x, y: h.y, z: h.z, normal: [h.nx, h.ny, h.nz] };
      }
      if (!a && DIRTY.has(spot.top ?? spot.mat)) a = { x: spot.x, y: spot.y, z: spot.z, normal: [0, 1, 0] };
      if (!a) return;
      m.add(new S(m, { ...a, zone }));
      return;
    }
    const y = S.info.flying ? spot.y + rand(0.9, 1.4) : spot.y + 0.01;
    m.add(new S(m, { x: spot.x, y, z: spot.z, zone, mat: spot.mat, emerge: S.info.flying }));
  }

  info() { return { ...this.stats, lairs: this.lairsDone.size, ruins: this.ruinsDone.size, dinoBiome: this.hasDinoBiome }; }
}

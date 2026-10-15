// Fantasy creatures of the underground (see docs/DEEP.md, "Optional systems"). Spawns them in
// nests and as sparse wanderers out of sight around the mole, runs their brains and bodies, their
// projectiles and hazards (ember blobs, slam shockwaves, spore clouds), and turns pick blows into
// knockback, hit flashes and finally a burst of tumbling voxel chunks and a little loot.
//
// Species live in ./enemies/: rock.js (Pebble Mimic, Rubble Golem), wisp.js (Gloom Wisp),
// imp.js (Ember Imp), wyrm.js (Crystal Wyrmling), puffer.js (Spore Puffer), bats.js (Shade Bats).
import * as THREE from 'three';
import { makeObjectMaterial } from './TerrainMaterial.js';
import { zoneAt, CS } from './Generator.js';
import { VOX, M, MAT } from './materials.js';
import { OPAQUE } from './Mesher.js';
import { ITEMS } from '../data/items.js';
import { ORE_SPAWN } from '../data/ores.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { clamp, rand } from '../core/util.js';
import { VB, VS, rgb } from './enemies/vox.js';
import { boxHits, clearLine, airAbove, fluidAt, solidAt } from './enemies/physics.js';
import { spores, sparkle, puff } from './enemies/fx.js';
import { Mimic, Golem } from './enemies/rock.js';
import { Wisp } from './enemies/wisp.js';
import { Imp } from './enemies/imp.js';
import { Wyrm } from './enemies/wyrm.js';
import { Puffer } from './enemies/puffer.js';
import { Bat, Swarm } from './enemies/bats.js';
import { CRITTER_SPECIES, CaveFish } from './enemies/critters.js';
import { enemyIconURL } from './enemies/icons.js';
import * as UIM from '../ui/UI.js';
import { critterIconURL } from '../gfx/critters32.js';

const SPECIES = { mimic: Mimic, golem: Golem, wisp: Wisp, imp: Imp, wyrm: Wyrm, puffer: Puffer, bat: Bat, ...CRITTER_SPECIES };
const MAX_ALIVE = 10;
// creature toughness tracks the pick you'd expect at that depth; damage scales with depth
const ZONE_POWER = [1, 1, 1.4, 2.1, 2.8, 3.6, 4.8];
const DMG = [1, 1, 1.25, 1.55, 1.9, 2.3, 2.7];
// wanderers: how many groups at once, how long into a trip before the first, how often
const WANDER_CAP = [0, 1, 2, 2, 3, 3, 3];
const GRACE = [0, 75, 25, 15, 10, 10, 10];
const WANDER = {
  1: [['mimic', 3], ['puffer', 2]],
  2: [['mimic', 2], ['puffer', 2], ['bats', 2], ['golem', 1], ['wisp', 1]],
  3: [['wyrm', 2], ['wisp', 2], ['bats', 2], ['golem', 1.5], ['puffer', 1]],
  4: [['imp', 4], ['golem', 1.5], ['bats', 1.5]],
  5: [['wyrm', 2], ['wisp', 2], ['golem', 2]],
  6: [['imp', 2], ['wisp', 2], ['wyrm', 2], ['golem', 1]],
};
const NESTS = {
  1: [['mimic', 'mimic', 'puffer'], ['puffer', 'mimic']],
  2: [['golem', 'mimic', 'mimic'], ['bats'], ['puffer', 'puffer', 'mimic']],
  3: [['wyrm', 'bats'], ['golem', 'wisp'], ['wisp', 'wisp', 'puffer']],
  4: [['imp', 'imp', 'imp'], ['golem', 'imp', 'imp'], ['bats', 'imp']],
  5: [['wyrm', 'wisp'], ['golem', 'wisp'], ['golem', 'golem']],
  6: [['wyrm', 'imp', 'imp'], ['wisp', 'wisp', 'golem']],
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
const INTRO = {
  pebble_mimic: 'That rock just blinked! A <b>Pebble Mimic</b>. Give it a whack with your pick.',
  rubble_golem: 'The wall stood up! A <b>Rubble Golem</b>. Jump over its shockwave.',
  gloom_wisp: 'A <b>Gloom Wisp</b> is eating the light. Keep your lamp on it!',
  ember_imp: 'An <b>Ember Imp</b>! Watch out for its bouncing embers.',
  crystal_wyrm: 'A <b>Crystal Wyrmling</b>! When it coils back, sidestep the lunge.',
  spore_puffer: 'A <b>Spore Puffer</b>. Back away when it swells up!',
  shade_bat: '<b>Shade Bats</b>! They swoop at your lamp. One whack each.',
};
// sounds that honour { vol } (others are only played when the creature is close)
const VOL = new Set(['hit', 'break', 'thud', 'clunk', 'land', 'debris', 'explode', 'zap', 'clang', 'bellows', 'splash']);
const LOOT_COL = { ember_scale: 0xff7a2a, wisp_essence: 0xc89aff, bat_guano: 0x7a6a50, glowcap: 0x9affc0, slug_slime: 0x9ad0a0, spark_dust: 0x7fe7ff, spider_silk: 0xe0f0ff };

const _r = new THREE.Vector3();

// Index Book / discovery-card portraits for the new species (the old critters keep their 2D art)
try { UIM.registerCreatureIcons?.((id) => enemyIconURL(id) || critterIconURL(id)); } catch (e) { /* the book falls back to its own icon */ }

export class Enemies {
  constructor(ctx) {
    this.ctx = ctx;
    this.world = ctx.world;
    this.fx = ctx.fx;
    this.bodies = ctx.bodies;
    this.audio = ctx.audio;
    this.state = ctx.state;
    this.ui = ctx.ui;
    this.plan = ctx.plan || ctx.world.plan;
    this.owner = ctx.owner;
    this.U = ctx.U;
    this.root = new THREE.Group();
    this.root.name = 'enemies';
    (ctx.scene3 || ctx.scene).add(this.root);
    this.list = [];
    this.shots = [];
    this.hazards = [];
    this.events = [];
    this.geos = new Map();
    this.shotMat = makeObjectMaterial(this.U, { emissive: 1.0 });
    this.time = 0;
    this.spawnT = 8;
    this.nestT = 0;
    this.nestsDone = new Set();
    this.seenKinds = new Set();
    this.invuln = 0;
    this.sneezeT = 0;
    this.toastT = {};
    this.pl = ctx.player;
    this.eye = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.pc = new THREE.Vector3();
    this.zone = 1;
    this.safe = false;
    this.perf = 0;
    this.dt = 1 / 60;
    this.autoSpawn = true; // tests switch this off and use debugSpawn
    this.queue = []; // events raised outside update (pick blows) go out with the next frame
    this.critterT = 2;
    this.lakesDone = new Set();
    this.stats = { spawned: 0, failed: 0, killed: 0 };
  }

  // ------------------------------------------------------------------ shared resources
  geo(key, build) {
    let g = this.geos.get(key);
    if (!g) { g = build(); this.geos.set(key, g); }
    return g;
  }
  material(opts = {}) {
    const m = makeObjectMaterial(this.U, opts);
    m.userData.e0 = opts.emissive || 0;
    return m;
  }
  dustCol(p) {
    const m = this.world.voxelAt(Math.floor(p.x * VOX), Math.floor(p.y * VOX) - 1, Math.floor(p.z * VOX));
    const d = MAT[m];
    if (!d || d.fluid || !d.tones) return [0.5, 0.42, 0.34];
    const [r, g, b] = rgb(d.tones[1]);
    return [r / 255, g / 255, b / 255];
  }
  hpScale(zone) {
    const pick = this.state.equipped?.('pick');
    const p = (pick?.power || 1) * (this.state.hasBuff?.('strong') ? 1.3 : 1);
    return clamp(ZONE_POWER[zone] || 1, p * 0.8, p * 1.3);
  }

  // ------------------------------------------------------------------ frame
  update(dt, o = {}) {
    this.events.length = 0;
    if (this.queue.length) { this.events.push(...this.queue); this.queue.length = 0; }
    const pl = o.player || this.pl;
    if (!pl) return this.events;
    const t0 = performance.now();
    dt = Math.min(dt, 1 / 20);
    this.dt = dt;
    this.pl = pl;
    if (o.eye) this.eye.copy(o.eye); else pl.eye(this.eye);
    if (o.forward) this.fwd.copy(o.forward); else pl.forward(this.fwd);
    this.pc.set(pl.pos.x, pl.pos.y + 0.45, pl.pos.z);
    this.zone = zoneAt(Math.max(0, -pl.pos.y));
    this.safe = this.safeAt(pl.pos.x, pl.pos.y, pl.pos.z);
    this.busy = !!o.busy;
    if (this.busy) return this.events;
    this.time += dt;
    this.invuln -= dt;
    this.sneezeT -= dt;
    this.spawner(dt);
    for (const e of this.list) {
      if (!e.alive) continue;
      const px = e.pos.x, py = e.pos.y, pz = e.pos.z;
      e.update(dt);
      // creatures never wander into the burrow, the town or a lift station
      if (this.excluded(e.pos.x, e.pos.y, e.pos.z, 0.5) && !this.excluded(px, py, pz, 0.5)) { e.pos.set(px, py, pz); e.vel.x *= -0.5; e.vel.z *= -0.5; }
      // lava burns all but the fire folk
      if (e.inFluid === 2 && !e.info.lavaProof && e.alive) {
        e.hp -= dt * 3;
        if (Math.random() < dt * 20) this.fx.ember(e.pos.x, e.pos.y + 0.2, e.pos.z);
        if (Math.random() < dt * 4) this.sound('sizzle', {}, e.dist);
        if (e.hp <= 0) this.kill(e, { x: 0, y: 1, z: 0 });
      }
      if (e.alive && e.awake && e.sees && e.dist < 8 && !e.passive) this.seen(e);
    }
    this.updateShots(dt);
    this.updateHazards(dt);
    this.sweep();
    this.perf = performance.now() - t0;
    return this.events;
  }

  /** Drop the defeated and the far away. */
  sweep() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      let gone = !e.alive;
      if (!gone) {
        const far = e.dist > 30 || (!e.awake && e.dist > 25);
        const vx = Math.floor(e.pos.x * VOX), vy = Math.floor(e.pos.y * VOX), vz = Math.floor(e.pos.z * VOX);
        const unloaded = !this.world.chunk(Math.floor(vx / CS), Math.floor(vy / CS), Math.floor(vz / CS));
        gone = far || unloaded || e.pos.y < -230;
      }
      if (gone) { e.dispose(); this.list.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------------ spawning
  /** Inside the burrow (and its tunnel mouths), the town or a lift station: no creatures. */
  excluded(x, y, z, pad = 0) {
    const W = this.owner?.W ?? this.plan.W ?? 10, D = this.owner?.D ?? this.plan.D ?? 8;
    if (x > -2.6 - pad && x < W + 2.6 + pad && z > -2.6 - pad && z < D + 2.6 + pad && y > -1.2 && y < 4) return true;
    const T = this.plan.town;
    if (T && Math.hypot(x - T.x, y - T.y, z - T.z) < T.r + 6 + pad) return true;
    for (const s of this.plan.stations || []) if (Math.hypot(x - s.x, y - s.y, z - s.z) < 5 + pad) return true;
    return false;
  }
  /** Places where creatures leave the mole alone. */
  safeAt(x, y, z) {
    const W = this.owner?.W ?? this.plan.W ?? 10, D = this.owner?.D ?? this.plan.D ?? 8;
    if (x > -1.8 && x < W + 1.8 && z > -1.8 && z < D + 1.8 && y > -0.6 && y < 3.2) return true;
    const T = this.plan.town;
    if (T && Math.hypot(x - T.x, y - T.y, z - T.z) < T.r + 3) return true;
    for (const s of this.plan.stations || []) if (Math.hypot(x - s.x, y - s.y, z - s.z) < 3) return true;
    return false;
  }
  loaded(x, y, z) {
    const ch = this.world.chunk(Math.floor(x * VOX / CS), Math.floor(y * VOX / CS), Math.floor(z * VOX / CS));
    return !!(ch && (ch.mesh || ch.wasMeshed));
  }
  /** Could the mole see this point right now (in front, in range, nothing between)? */
  inView(x, y, z) {
    const e = this.eye, f = this.fwd;
    const dx = x - e.x, dy = y - e.y, dz = z - e.z, d = Math.hypot(dx, dy, dz);
    if (d > 23) return false;
    if (d < 3) return true;
    if ((dx * f.x + dy * f.y + dz * f.z) / d < 0.35) return false;
    return clearLine(this.world, e.x, e.y, e.z, x, y + 0.3, z);
  }
  /** A floor spot (air with rock below and `clear` meters of headroom) under (x, ~y, z). */
  floorAt(x, y, z, clear = 0.6, down = 5, up = 3) {
    const w = this.world;
    const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
    const need = Math.ceil(clear * VOX);
    let air = 0;
    for (let vy = Math.floor((y + up) * VOX), end = Math.floor((y - down) * VOX); vy >= end; vy--) {
      const m = w.voxelAt(vx, vy, vz);
      if (OPAQUE[m]) {
        if (air >= need) {
          // moss is only a skin: creatures are made of the rock underneath
          const under = m === M.MOSS ? w.voxelAt(vx, vy - 1, vz) : m;
          return { x: (vx + 0.5) / VOX, y: (vy + 1) / VOX, z: (vz + 0.5) / VOX, mat: OPAQUE[under] && under !== M.MOSS ? under : M.DIRT, top: m };
        }
        air = 0;
      }
      else if (MAT[m]?.fluid) air = -99;
      else air++;
    }
    return null;
  }
  /** Find a free spot for a species near (cx, cy, cz) between rMin and rMax meters. */
  findSpot(kind, cx, cy, cz, rMin, rMax, { hidden = true, tries = 10, ray = false } = {}) {
    const S = SPECIES[kind === 'bats' ? 'bat' : kind];
    const golem = kind === 'golem';
    const clear = golem ? 1.2 : kind === 'bats' ? 1.8 : S?.info.flying ? 1.6 : 0.7;
    const hw = golem ? 0.32 : 0.2;
    for (let i = 0; i < tries; i++) {
      let x, z, y = cy;
      if (ray && i % 2 === 0) {
        // follow open space: a ray from the eye out into the cave, away from where the mole looks
        const f = this.fwd, e = this.eye;
        let dx = rand(-1, 1), dy = rand(-0.1, 0.05), dz = rand(-1, 1);
        if (dx * f.x + dz * f.z > 0) { dx = -dx; dz = -dz; }
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
        const hit = this.world.raycast(e.x, e.y, e.z, dx, dy, dz, rMax);
        const far = hit ? hit.dist : rMax;
        const near = Math.max(4.5, rMin * 0.6); // behind the mole, a little closer is fine
        if (far < near + 0.5) continue;
        const t = rand(near, far - 0.4);
        x = e.x + dx * t; y = e.y + dy * t; z = e.z + dz * t;
      } else {
        const a = Math.random() * Math.PI * 2, d = rand(rMin, rMax);
        x = cx + Math.cos(a) * d; z = cz + Math.sin(a) * d;
      }
      const f = this.floorAt(x, y, z, clear, 6, ray && i % 2 === 0 ? 1 : 4);
      if (!f) continue;
      if (!this.loaded(f.x, f.y, f.z) || this.excluded(f.x, f.y, f.z, 2)) continue;
      if (boxHits(this.world, f.x - hw, f.y + 0.26, f.z - hw, f.x + hw, f.y + clear, f.z + hw)) continue; // bumps underfoot are fine
      if (hidden && this.inView(f.x, f.y + 0.4, f.z)) continue;
      if (Math.hypot(f.x - this.pc.x, f.z - this.pc.z) < 2.5) continue;
      return f;
    }
    return null;
  }

  spawner(dt) {
    if (!this.autoSpawn) return;
    const pl = this.pl, plan = this.plan;
    // nests: a guaranteed group the first time you come near one
    this.nestT -= dt;
    if (this.nestT <= 0) {
      this.nestT = 0.6;
      (plan.dangers || []).forEach((n, i) => {
        if (n.kind !== 'nest' || this.nestsDone.has(i)) return;
        const d = Math.hypot(n.x - pl.pos.x, (n.y - pl.pos.y) * 1.4, n.z - pl.pos.z);
        if (d > 21 || !this.loaded(n.x, n.y, n.z)) return;
        this.nestsDone.add(i);
        const zone = n.zone || zoneAt(-n.y);
        const sets = NESTS[zone] || NESTS[1];
        this.spawnGroup(sets[i % sets.length], n.x, n.y, n.z, zone, { nest: n, r: Math.max(1, n.r * 0.7) });
      });
    }
    this.critterSpawner(dt);
    // wanderers, out of sight
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const zone = this.zone;
    this.spawnT = zone === 1 ? rand(25, 45) : rand(6, 13);
    if (this.time < (GRACE[zone] ?? 10) || this.safe) return;
    if (zone === 1) {
      const W = this.owner?.W ?? 10, D = this.owner?.D ?? 8;
      if (Math.hypot(pl.pos.x - W / 2, pl.pos.z - D / 2) < 16 || pl.pos.y > -3) return; // the first steps stay peaceful
    }
    const groups = new Set();
    for (const e of this.list) if (e.alive && !e.nest && !e.passive) groups.add(e.group || e);
    if (groups.size >= (WANDER_CAP[zone] ?? 2) || this.alive() >= MAX_ALIVE - 1) return;
    const table = WANDER[zone] || WANDER[1];
    let r = Math.random() * table.reduce((s, e) => s + e[1], 0), kind = table[0][0];
    for (const [k, w] of table) { r -= w; if (r <= 0) { kind = k; break; } }
    const spot = this.findSpot(kind, pl.pos.x, pl.pos.y, pl.pos.z, 7, 17, { tries: 24, ray: true });
    if (!spot) { this.spawnT = 1.2; this.stats.failed++; return; }
    this.stats.spawned++;
    if (spot.mat === M.MOSS && zone <= 3 && kind !== 'puffer' && Math.random() < 0.5) kind = 'puffer';
    this.spawnGroup([kind], spot.x, spot.y + 0.1, spot.z, zone, { spot });
  }

  alive() { let n = 0; for (const e of this.list) if (e.alive && !e.passive) n++; return n; }
  critters() { let n = 0; for (const e of this.list) if (e.alive && e.passive && !e.nest) n++; return n; }

  /** Spawn a set of creatures around a point. kinds: species keys ('bats' = a swarm). */
  spawnGroup(kinds, x, y, z, zone, { nest = null, r = 2, spot = null, hidden = !nest } = {}) {
    const out = [];
    kinds.forEach((kind, i) => {
      if (this.alive() >= MAX_ALIVE + 2) return;
      const s = i === 0 && spot ? spot : this.findSpot(kind, x, y, z, 0, r + 1.5, { hidden, tries: 14 });
      if (!s) return;
      if (kind === 'bats') { out.push(...this.spawnBats(s, zone, nest)); return; }
      const S = SPECIES[kind];
      const fy = S.info.flying ? s.y + rand(0.9, 1.3) : s.y + 0.01;
      const e = new S(this, { x: s.x, y: fy, z: s.z, zone, mat: s.mat, nest, emerge: S.info.flying || kind === 'imp' });
      this.add(e);
      out.push(e);
    });
    return out;
  }

  spawnBats(s, zone, nest) {
    const ceil = airAbove(this.world, s.x, s.y + 0.3, s.z, 4.5);
    if (ceil < 1.2) return [];
    const top = s.y + 0.3 + ceil;
    const sw = new Swarm({ x: s.x, y: top - 0.14, z: s.z });
    const n = zone >= 3 ? 4 + (Math.random() < 0.5 ? 1 : 0) : 3 + (Math.random() < 0.5 ? 1 : 0);
    const out = [];
    for (let i = 0; i < n && this.alive() < MAX_ALIVE + 2; i++) {
      const hx = s.x + rand(-0.45, 0.45), hz = s.z + rand(-0.45, 0.45);
      const c = airAbove(this.world, hx, top - 0.5, hz, 1.5);
      if (c >= 1.5) continue;
      const e = new Bat(this, { x: hx, y: top - 0.5 + c - 0.13, z: hz, zone, swarm: sw, group: sw, nest });
      this.add(e);
      out.push(e);
    }
    return out;
  }

  add(e) {
    this.root.add(e.root);
    e.updateSpheres();
    e.place();
    this.list.push(e);
    return e;
  }

  /** Debug / tests: spawn one creature (or 'bats') right at a point. */
  debugSpawn(kind, x, y, z, opts = {}) {
    const zone = opts.zone ?? zoneAt(Math.max(0, -y));
    const f = this.floorAt(x, y, z, 0.4, 3, 1) || { x, y, z, mat: M.STONE };
    if (kind === 'bats') return this.spawnBats({ x: f.x, y: f.y, z: f.z }, zone, null);
    const S = SPECIES[kind];
    if (!S) return null;
    const e = new S(this, { ...opts, x, y: S.info.flying || opts.raw ? y : f.y + 0.01, z, zone, mat: opts.mat ?? f.mat });
    if (opts.awake) { e.awake = true; }
    return this.add(e);
  }

  // ------------------------------------------------------------------ the mole and the creatures
  /** A creature hurts the mole (returns false while invulnerable / safe). */
  hurtPlayer(src, base, push, kind) {
    if (this.safe || this.invuln > 0) return false;
    const zone = src.zone || this.zone;
    let n = base * (DMG[zone] || 1);
    if ((kind === 'fire' || src.info?.fire) && this.state.protects?.('heat')) n *= 0.5;
    n = Math.max(1, Math.round(n));
    this.invuln = 0.6;
    this.events.push({ damage: n, kind: kind || 'enemy', push: push || [0, 0, 0] });
    return true;
  }

  say(key, html, tone = 'warn', cd = 8) {
    const t = this.toastT[key];
    if (t !== undefined && this.time - t < cd) return;
    this.toastT[key] = this.time;
    this.events.push({ say: html, key: 'enemy_' + key, tone, cd });
  }

  sound(name, opts = {}, dist = 0) {
    const k = clamp(1.3 - dist / 13, 0, 1);
    if (k <= 0.05) return;
    if (VOL.has(name)) { this.audio?.play(name, { ...opts, vol: (opts.vol ?? 1) * k }); return; }
    if (k < 0.45) return;
    this.audio?.play(name, opts);
  }

  /** A creature notices the mole: a little "!" pops over its head. */
  alert(e) {
    this.sound('emote', { kind: 'alert' }, e.dist);
    const o = this.owner;
    if (!o?.toScreen || !this.ui?.floatText) return;
    const p = o.toScreen(_r.set(e.center.x, e.center.y + e.hitR * e.size + 0.2, e.center.z));
    if (p.visible === false) return;
    this.ui.floatText('!', p.x, p.y, '#ffd84a', 1.4);
  }

  /** First good look at a species: index entry + an intro toast the very first time. */
  seen(e) {
    const id = e.info.id;
    if (this.seenKinds.has(id)) return;
    this.seenKinds.add(id);
    const fresh = this.state.discover?.('critter', id);
    if (fresh && INTRO[id]) this.say('intro_' + id, INTRO[id], 'warn', 9999);
  }

  // ------------------------------------------------------------------ pick vs creature
  hitTest(eye, dir, reach) {
    let best = null, bt = reach;
    for (const e of this.list) {
      if (!e.alive || e.emerge < 0.3) continue;
      for (const s of e.spheres) {
        if (s.r <= 0) continue;
        const r = s.r + 0.07;
        const ox = s.x - eye.x, oy = s.y - eye.y, oz = s.z - eye.z;
        const t = ox * dir.x + oy * dir.y + oz * dir.z;
        if (t < -r) continue;
        const d2 = ox * ox + oy * oy + oz * oz - t * t;
        if (d2 > r * r) continue;
        const t0 = Math.max(0, t - Math.sqrt(r * r - d2));
        if (t0 <= bt) { bt = t0; best = e; }
      }
    }
    if (best) best.lastHit.set(eye.x + dir.x * bt, eye.y + dir.y * bt, eye.z + dir.z * bt);
    return best;
  }

  damage(e, power, dir) {
    if (!e || !e.alive) return;
    const p = e.lastHit;
    if (e.passive) {
      this.fx.dust(p.x, p.y, p.z, 3, this.dustCol(e.pos), 0.04);
      sparkle(this.fx, p.x, p.y, p.z, 3, [1, 1, 0.85], 1, 2, 0.015, 0.3);
      this.sound('hit', { snd: e.info.snd || 'flesh', vol: 0.5 });
      e.takeHit(power, dir);
      return;
    }
    const c = this.dustCol(e.pos);
    this.fx.sparks(p.x, p.y, p.z, 7, [1, 0.92, 0.7], [-dir.x, -dir.y, -dir.z], 2.6);
    sparkle(this.fx, p.x, p.y, p.z, 4, [1, 1, 0.85], 1.5, 3, 0.018, 0.35);
    this.fx.dust(p.x, p.y, p.z, 3, c, 0.05);
    this.sound('hit', { snd: e.info.snd || 'flesh', vol: 0.9 });
    this.sound('squish', { vol: 0.5 });
    e.takeHit(power, dir);
  }

  /** Defeat: voxel chunks, sparkles, loot. */
  kill(e, dir) {
    if (!e.alive) return;
    e.alive = false;
    e.flash = 1;
    this.stats.killed++;
    this.debris(e, dir || { x: 0, y: 0, z: 0 });
    if (e.deathFx) e.deathFx();
    const c = e.center;
    sparkle(this.fx, c.x, c.y, c.z, 14, [1, 0.95, 0.75], 2.8, 3, 0.022, 0.8);
    puff(this.fx, c.x, c.y, c.z, 8, this.dustCol(e.pos), 0.2 * e.size, 0.4, 0.07, 0.5);
    this.sound('pristine', {}, e.dist);
    this.sound('break', { snd: e.info.snd === 'crystal' ? 'crystal' : e.info.snd === 'stone' ? 'stone' : 'dirt', vol: 0.7 }, e.dist);
    this.loot(e);
  }

  /** Burst a creature into chunks made of its own voxels. */
  debris(e, dir) {
    e.root.updateMatrixWorld(true);
    const pts = [];
    const extra = e.tails || [];
    const visit = (o) => {
      if (!o.isMesh || !o.visible || o.scale.y < 0.05) return;
      const ud = o.geometry.userData;
      if (!ud?.vox) return;
      const [px, py, pz] = ud.pivot;
      const me = o.matrixWorld.elements;
      for (const v of ud.vox) {
        const lx = (v.x + 0.5 - px) * VS, ly = (v.y + 0.5 - py) * VS, lz = (v.z + 0.5 - pz) * VS;
        pts.push(me[0] * lx + me[4] * ly + me[8] * lz + me[12], me[1] * lx + me[5] * ly + me[9] * lz + me[13], me[2] * lx + me[6] * ly + me[10] * lz + me[14], v.c);
      }
    };
    e.root.traverse(visit);
    for (const t of extra) { t.updateMatrixWorld(true); visit(t); }
    const n = pts.length / 4;
    if (!n) return;
    // big creatures crumble into coarser blocks (2×2×2 model voxels): cheaper and chunkier
    const step = n > 700 ? 2 * VS : VS;
    const cells = new Map();
    for (let i = 0; i < pts.length; i += 4) {
      const ix = Math.round(pts[i] / step), iy = Math.round(pts[i + 1] / step), iz = Math.round(pts[i + 2] / step);
      const k = ((ix + 4096) * 8192 + (iy + 4096)) * 8192 + (iz + 4096);
      if (!cells.has(k)) cells.set(k, [ix, iy, iz, pts[i + 3]]);
    }
    const list = [...cells.values()], m = list.length;
    const K = clamp(Math.round(m / 45), 2, e.kind === 'rubble_golem' ? 10 : 6);
    const seeds = [];
    for (let k = 0; k < K; k++) seeds.push(list[Math.floor(Math.random() * m)]);
    const groups = seeds.map(() => []);
    for (const v of list) {
      let bk = 0, bd = 1e9;
      for (let k = 0; k < K; k++) { const s = seeds[k]; const d = (v[0] - s[0]) ** 2 + (v[1] - s[1]) ** 2 + (v[2] - s[2]) ** 2; if (d < bd) { bd = d; bk = k; } }
      groups[bk].push(v);
    }
    const c = e.center, glow = e.kind === 'crystal_wyrm' || e.kind === 'ember_imp' || e.kind === 'gloom_wisp';
    const scale = step * VOX;
    for (const g of groups) {
      if (g.length < 3) continue;
      let mx = 0, my = 0, mz = 0;
      for (const v of g) { mx += v[0]; my += v[1]; mz += v[2]; }
      mx /= g.length; my /= g.length; mz /= g.length;
      // shift onto the Bodies lattice so the chunk spawns exactly where those voxels were
      const bx = mx * scale - mx - 0.5, by = my * scale - my - 0.5, bz = mz * scale - mz - 0.5;
      const vox = g.map((v) => ({ x: v[0] + bx, y: v[1] + by, z: v[2] + bz, c: v[3] }));
      let ox = mx * step - c.x, oy = my * step - c.y, oz = mz * step - c.z;
      const ol = Math.hypot(ox, oy, oz) || 1;
      ox /= ol; oy /= ol; oz /= ol;
      const sp = rand(1.6, 3.2);
      this.bodies.spawn(vox, {
        vel: [ox * sp + dir.x * 2, Math.abs(oy) * sp + rand(1.5, 3), oz * sp + dir.z * 2],
        scale, glow, life: rand(1.3, 2.4), bounce: 0.45,
        spin: [rand(-12, 12), rand(-12, 12), rand(-12, 12)],
      });
    }
  }

  loot(e) {
    const z = e.zone, ch = Math.random();
    const ore = (n) => { const l = (ORE_SPAWN[z] || ORE_SPAWN[1]).slice(0, n); let r = Math.random() * l.reduce((s, x) => s + x[1], 0); for (const [id, w] of l) { r -= w; if (r <= 0) return id; } return l[0][0]; };
    let id = null;
    switch (e.kind) {
      case 'pebble_mimic': if (ch < 0.55) id = ore(3); break;
      case 'rubble_golem': id = ore(3); if (Math.random() < 0.3) this.dropItem(e, ore(4), 0.3); break;
      case 'gloom_wisp': if (ch < 0.18) id = 'wisp_essence'; break;
      case 'ember_imp': if (ch < 0.45) id = 'ember_scale'; break;
      case 'crystal_wyrm': if (ch < 0.65) id = z >= 6 ? (Math.random() < 0.12 ? 'diamond' : 'amethyst') : z === 5 ? (Math.random() < 0.18 ? 'sapphire' : 'quartz') : (Math.random() < 0.5 ? 'amethyst' : 'quartz'); break;
      case 'spore_puffer': if (ch < 0.6) id = 'glowcap'; break;
      case 'shade_bat': if (ch < 0.3) id = 'bat_guano'; break;
    }
    if (id) this.dropItem(e, id, 0);
  }

  /** Loot pops out as a little glowing gem and flies into the backpack (same path as ore). */
  dropItem(e, id, delay = 0) {
    const it = ITEMS[id];
    if (!it) return;
    const q = it.q ? Math.round(rand(60, 92)) : undefined;
    const col = LOOT_COL[id] ?? it.icon?.ore?.[0] ?? it.icon?.c?.[0] ?? (typeof it.glow === 'number' ? it.glow : 0xffe08a);
    const g = this.geo('loot|' + id, () => {
      const v = new VB(id.length);
      const [r, gg, b] = rgb(col);
      const lt = ((Math.min(255, r + 70) << 16) | (Math.min(255, gg + 70) << 8) | Math.min(255, b + 70)) >>> 0;
      const dk = (((r * 0.6) << 16) | ((gg * 0.6) << 8) | (b * 0.6)) >>> 0;
      v.ell(0, 0, 0, 2.2, 2.6, 2.2, (x, y, z, nx, ny) => (ny > 0.45 ? lt : ny < -0.4 ? dk : col));
      v.set(-1, 2, 1, 0xffffff);
      return v.list();
    });
    const c = e.center, s = VS * VOX * 1.2;
    // shift onto the Bodies lattice so the gem's center lands on the creature's
    let mx = 0, my = 0, mz = 0;
    for (const v of g) { mx += v.x; my += v.y; mz += v.z; }
    mx /= g.length; my /= g.length; mz /= g.length;
    const bx = c.x * VOX - mx - 0.5, by = (c.y + 0.1) * VOX - my - 0.5, bz = c.z * VOX - mz - 0.5;
    const vox = g.map((v) => ({ x: v.x + bx, y: v.y + by, z: v.z + bz, c: v.c }));
    const b = this.bodies.spawn(vox, { vel: [rand(-0.8, 0.8), 3.4, rand(-0.8, 0.8)], scale: s, glow: true, pickup: { id, q, p: false, delay: 0.75 + delay } });
    if (!b) this.events.push({ loot: { id, q, p: false } });
    sparkle(this.fx, c.x, c.y, c.z, 6, [1, 0.95, 0.6], 1.5, 1, 0.02, 0.6);
  }

  // ------------------------------------------------------------------ critters
  critterSpawner(dt) {
    const pl = this.pl;
    // a few fish (frost shrimp in the Frost Vault) in every lake you come near
    (this.plan.dangers || []).forEach((n, i) => {
      if (n.kind !== 'water' || this.lakesDone.has(i)) return;
      if (Math.hypot(n.x - pl.pos.x, (n.y - pl.pos.y) * 1.4, n.z - pl.pos.z) > 22 || !this.loaded(n.x, n.y, n.z)) return;
      this.lakesDone.add(i);
      const zone = n.zone || zoneAt(-n.y);
      if (zone < 2) return; // blind fish live from the Clayworks down
      const count = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let k = 0, made = 0; k < 30 && made < count; k++) {
        const x = n.x + rand(-0.7, 0.7) * n.r, z = n.z + rand(-0.7, 0.7) * n.r, y = n.y - rand(0.2, 0.45) * n.r;
        if (fluidAt(this.world, x, y, z) !== 1 || fluidAt(this.world, x, y + 0.15, z) !== 1) continue;
        this.add(new CaveFish(this, { x, y, z, zone, shrimp: zone >= 5 && made < 2, nest: n }));
        made++;
      }
    });
    this.critterT -= dt;
    if (this.critterT > 0) return;
    this.critterT = rand(3, 7);
    const zone = this.zone;
    if (this.safe || this.critters() >= (CRITTER_CAP[zone] ?? 4)) return;
    const table = CRITTERS[zone] || CRITTERS[1];
    let r = Math.random() * table.reduce((s, e) => s + e[1], 0), kind = table[0][0];
    for (const [k, w] of table) { r -= w; if (r <= 0) { kind = k; break; } }
    const worm = kind === 'earthworm';
    const spot = this.findSpot(kind, pl.pos.x, pl.pos.y, pl.pos.z, worm ? 3 : 6, 15, { tries: 16, ray: true, hidden: !worm });
    if (!spot) { this.critterT = 1; return; }
    const S = SPECIES[kind];
    if (worm) {
      // poke out of a dirt wall next to the spot (or out of the dirt floor)
      let a = null;
      for (let k = 0; k < 6 && !a; k++) {
        const ang = Math.random() * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
        const h = this.world.raycast(spot.x, spot.y + rand(0.15, 0.6), spot.z, dx, 0, dz, 1.6);
        if (h && DIRTY.has(h.m)) a = { x: h.x, y: h.y, z: h.z, normal: [h.nx, h.ny, h.nz] };
      }
      if (!a && DIRTY.has(spot.top ?? spot.mat)) a = { x: spot.x, y: spot.y, z: spot.z, normal: [0, 1, 0] };
      if (!a) return;
      this.add(new S(this, { ...a, zone }));
      return;
    }
    const y = S.info.flying ? spot.y + rand(0.9, 1.4) : spot.y + 0.01;
    this.add(new S(this, { x: spot.x, y, z: spot.z, zone, mat: spot.mat, emerge: S.info.flying }));
  }

  /** The critter the mole is pointing at (filter picks which ones count). */
  pickCritter(eye, dir, reach, filter) {
    let best = null, bt = reach;
    for (const e of this.list) {
      if (!e.alive || !e.passive || !filter(e)) continue;
      const s = e.spheres[0];
      if (s.r <= 0) continue;
      const r = s.r + 0.12;
      const ox = s.x - eye.x, oy = s.y - eye.y, oz = s.z - eye.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < -r) continue;
      const d2 = ox * ox + oy * oy + oz * oz - t * t;
      if (d2 > r * r) continue;
      const t0 = Math.max(0, t - Math.sqrt(r * r - d2));
      if (t0 <= bt) { bt = t0; best = e; }
    }
    return best;
  }

  /** Something to grab or net under the crosshair? → { label, kind: 'use' } or null. */
  catchTest(eye, dir, reach = 2.3) {
    const e = this.pickCritter(eye, dir, reach + 0.3, (c) => (c.info.catch === 'grab' || c.info.catch === 'net') && c.canGrab());
    if (!e) return null;
    return { label: `${e.info.catch === 'net' ? 'Net' : 'Grab'} ${e.info.name}`, kind: 'use' };
  }

  /** E / use: grab or net the critter under the crosshair. Returns events like update's. */
  catch(eye, dir, reach = 2.3) {
    const e = this.pickCritter(eye, dir, reach + 0.3, (c) => (c.info.catch === 'grab' || c.info.catch === 'net') && c.canGrab());
    if (!e) return [];
    // fish are slippery: a quick fish may wriggle free once
    if (e.info.catch === 'net' && Math.random() < 0.25 && !e.slipped) {
      e.slipped = true; e.scared = 2; e.sqv += 8;
      this.fx.splash?.(e.pos.x, e.pos.y + 0.1, e.pos.z, 0.5);
      this.sound('splash', { vol: 0.5 });
      return [{ say: `The ${e.info.name} slipped away! Try again.`, key: 'enemy_slip', tone: 'warn', cd: 3 }];
    }
    if (e.info.catch === 'net') this.sound('splash', { vol: 0.6 });
    return this.caught(e, e.info.drop);
  }

  /** The brush is being used: dust bunnies purr, gem tortoises get their shells cleaned. */
  brushAt(eye, dir, reach = 2.3) {
    // called at the brush's stroke rate, not every frame: brushing time is the time between strokes
    const now = this.time, dt = this.brushLast === undefined ? 0.12 : clamp(now - this.brushLast, 0, 0.2);
    this.brushLast = now;
    const e = this.pickCritter(eye, dir, reach + 0.2, (c) => c.info.catch === 'brush' && c.brush);
    return e ? e.brush(dt || 0.12) || [] : [];
  }

  /** The x-ray lamp is on: void wisps caught in the beam slowly give up. */
  xrayAt(eye, dir, reach = 8) {
    const out = [];
    for (const e of this.list) {
      if (!e.alive || !e.xray) continue;
      const dx = e.pos.x - eye.x, dy = e.pos.y - eye.y, dz = e.pos.z - eye.z, d = Math.hypot(dx, dy, dz) || 1;
      if (d > Math.max(reach, 3) || (dx * dir.x + dy * dir.y + dz * dir.z) / d < 0.9) continue;
      out.push(...(e.xray(this.dt) || []));
    }
    return out;
  }

  /** A critter is caught: it hops into the backpack. */
  caught(e, id, say) {
    e.alive = false;
    const c = e.center;
    sparkle(this.fx, c.x, c.y, c.z, 12, [1, 0.95, 0.7], 1.6, 1, 0.022, 0.7);
    puff(this.fx, c.x, c.y, c.z, 4, this.dustCol(e.pos), 0.08, 0.3, 0.05, 0.4);
    this.sound('squeak', { pitch: 1.3 });
    this.state.discover?.('critter', e.info.id);
    const ev = [{ loot: { id, q: ITEMS[id]?.q ? Math.round(rand(70, 95)) : undefined, p: false } }];
    if (say) ev.push({ say, key: 'enemy_catch_' + e.info.id, tone: 'good', cd: 20 });
    return ev;
  }

  /** A critter leaves something behind (brushing, a tap of the pick). pickup = pop a gem that flies into the bag. */
  gift(e, id, say, pickup = false) {
    this.state.discover?.('critter', e.info.id);
    if (pickup) {
      this.dropItem(e, id, 0);
      if (say) this.queue.push({ say, key: 'enemy_gift_' + e.info.id, tone: 'good', cd: 20 });
      return [];
    }
    const ev = [{ loot: { id, q: ITEMS[id]?.q ? Math.round(rand(70, 95)) : undefined, p: false } }];
    if (say) ev.push({ say, key: 'enemy_gift_' + e.info.id, tone: 'good', cd: 20 });
    return ev;
  }

  // ------------------------------------------------------------------ projectiles and hazards
  addShot(o) {
    const mesh = new THREE.Mesh(o.geo, this.shotMat);
    mesh.layers.enable(LAYER_OUTLINE);
    mesh.position.set(o.x, o.y, o.z);
    this.root.add(mesh);
    this.shots.push({ pos: mesh.position, vel: new THREE.Vector3(...o.v), g: o.g ?? 9, t: 0, life: 3, bounces: 0, sq: 0, mesh, dmg: o.dmg, zone: o.zone, info: { fire: true }, ember: o.ember, hot: o.hot, light: o.light });
  }

  updateShots(dt) {
    const w = this.world;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i], p = s.pos, v = s.vel, r = 0.07;
      s.t += dt;
      v.y -= s.g * dt;
      let bounced = false;
      const nx = p.x + v.x * dt;
      if (solidAt(w, nx + Math.sign(v.x) * r, p.y, p.z)) { v.x *= -0.55; v.y *= 0.9; v.z *= 0.85; bounced = true; } else p.x = nx;
      const nz = p.z + v.z * dt;
      if (solidAt(w, p.x, p.y, nz + Math.sign(v.z) * r)) { v.z *= -0.55; v.y *= 0.9; v.x *= 0.85; bounced = true; } else p.z = nz;
      const ny = p.y + v.y * dt;
      if (solidAt(w, p.x, ny + Math.sign(v.y) * r, p.z)) { if (v.y < 0) { v.y = -v.y * 0.62; v.x *= 0.8; v.z *= 0.8; } else v.y *= -0.3; bounced = true; } else p.y = ny;
      const dist = Math.hypot(p.x - this.eye.x, p.y - this.eye.y, p.z - this.eye.z);
      if (bounced && Math.abs(v.y) + Math.hypot(v.x, v.z) > 1) {
        s.bounces++;
        s.sq = 1;
        this.fx.sparks(p.x, p.y, p.z, 6, s.hot, [0, 1, 0], 2.2);
        this.sound('sizzle', {}, dist);
        this.sound('thud', { vol: 0.15 }, dist);
      }
      // trail
      if (Math.random() < 0.7) this.fx.spawn({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.3, vy: 0.3, vz: (Math.random() - 0.5) * 0.3, life: 0.4, size: 0.03, grow: -0.05, color: s.ember, glow: true, drag: 1 });
      if (Math.random() < 0.25) this.fx.ember(p.x, p.y, p.z);
      s.sq = Math.max(0, s.sq - dt * 6);
      s.mesh.scale.set(1 + s.sq * 0.5, 1 - s.sq * 0.45, 1 + s.sq * 0.5);
      s.mesh.rotation.x += dt * 9; s.mesh.rotation.y += dt * 6;
      let done = false;
      // hits the mole?
      const gap = Math.hypot(p.x - this.pl.pos.x, p.y - clamp(p.y, this.pl.pos.y + 0.1, this.pl.pos.y + 0.78), p.z - this.pl.pos.z) - 0.27;
      if (gap < 0) {
        const sp = Math.hypot(v.x, v.z) || 1;
        if (this.hurtPlayer(s, s.dmg, [v.x / sp * 2.5, 1.8, v.z / sp * 2.5], 'fire')) {
          this.say('ember', 'Ouch, hot! Ember blobs <b>bounce</b> — keep moving.', 'bad', 40);
          this.sound('ignite', {});
        }
        this.fx.sparks(p.x, p.y, p.z, 16, s.hot, [0, 1, 0], 3.5);
        done = true;
      }
      const fl = fluidAt(w, p.x, p.y, p.z);
      if (fl === 1) { puff(this.fx, p.x, p.y + 0.1, p.z, 6, [0.85, 0.85, 0.9], 0.08, 0.8, 0.07, 0.6); this.sound('steam', {}, dist); done = true; }
      if (fl === 2 || s.t > s.life || (s.bounces >= 3 && Math.hypot(v.x, v.y, v.z) < 2.2)) done = true;
      if (done) {
        this.fx.sparks(p.x, p.y, p.z, 10, s.hot, [0, 1, 0], 2.5);
        puff(this.fx, p.x, p.y, p.z, 3, [0.22, 0.2, 0.2], 0.05, 0.6, 0.05, 0.45);
        if (gap >= 0) this.sound('sizzle', {}, dist);
        s.mesh.removeFromParent();
        this.shots.splice(i, 1);
      }
    }
  }

  addHazard(h) { h.t = 0; h.zone = h.zone || h.src?.zone || this.zone; this.hazards.push(h); }

  updateHazards(dt) {
    const pl = this.pl;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.t += dt;
      if (h.kind === 'ring') {
        // the shockwave rolls outward along the floor: jump over it!
        h.r += h.speed * dt;
        if (!h.hit) {
          const d = Math.hypot(pl.pos.x - h.x, pl.pos.z - h.z);
          if (Math.abs(d - h.r) < 0.42 && pl.grounded && Math.abs(pl.pos.y - h.y) < 0.6) {
            h.hit = true;
            const ux = (pl.pos.x - h.x) / (d || 1), uz = (pl.pos.z - h.z) / (d || 1);
            if (this.hurtPlayer(h, h.dmg * (d < 1.2 ? 1 : 0.7), [ux * 3.5, 3.4, uz * 3.5], 'quake')) this.say('quake', 'The shockwave knocked you over! <b>Jump</b> over it next time.', 'bad', 60);
          }
        }
        if (h.r > h.rMax) this.hazards.splice(i, 1);
      } else if (h.kind === 'spores') {
        const k = 1 - h.t / h.life;
        if (Math.random() < dt * 22 * k) spores(this.fx, h.x + rand(-1, 1) * h.r * 0.6, h.y + rand(-0.2, 0.6), h.z + rand(-1, 1) * h.r * 0.6, 1, h.color, 0.3, 0.2);
        const d = Math.hypot(this.pc.x - h.x, (this.pc.y - h.y) * 1.3, this.pc.z - h.z);
        if (d < h.r * (0.6 + 0.4 * k)) {
          h.acc = (h.acc || 0) + dt;
          if (h.acc > 0.55) {
            h.acc = 0;
            if (this.hurtPlayer(h, h.sting, [0, 0, 0], 'spores')) {
              if (this.sneezeT <= 0) { this.sneezeT = 2.5; this.audio?.play('sneeze'); }
              this.say('spores', 'Achoo! The <b>spores</b> sting. Get out of the cloud!', 'bad', 45);
            }
          }
        }
        if (h.t > h.life) this.hazards.splice(i, 1);
      } else this.hazards.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ HUD + lights
  radarMarkers(pos) {
    const out = [];
    for (const e of this.list) {
      if (!e.alive || !e.awake || e.passive) continue;
      if (Math.hypot(e.pos.x - pos.x, (e.pos.y - pos.y) * 1.5, e.pos.z - pos.z) > 20) continue;
      out.push({ kind: 'enemy', x: e.center.x, y: e.center.y, z: e.center.z, label: e.info.name, color: e.info.color });
    }
    return out;
  }

  lights(eye) {
    const c = [];
    for (const e of this.list) {
      if (!e.alive) continue;
      const l = e.light();
      if (!l) continue;
      const d = Math.hypot(l.x - eye.x, l.y - eye.y, l.z - eye.z);
      if (d < 18) c.push([d, l]);
    }
    for (const s of this.shots) {
      const d = s.pos.distanceTo(eye);
      if (d < 16) c.push([d - 1, { x: s.pos.x, y: s.pos.y, z: s.pos.z, c: s.light, r: 2.6 }]);
    }
    c.sort((a, b) => a[0] - b[0]);
    return c.slice(0, 3).map((x) => x[1]);
  }

  dispose() {
    for (const e of this.list) e.dispose();
    this.list.length = 0;
    for (const s of this.shots) s.mesh.removeFromParent();
    this.shots.length = 0;
    this.hazards.length = 0;
    this.root.removeFromParent();
    for (const g of this.geos.values()) for (const v of Object.values(g)) {
      if (v?.isBufferGeometry) v.dispose();
      else if (Array.isArray(v)) for (const x of v) if (x?.isBufferGeometry) x.dispose();
    }
    this.geos.clear();
    this.shotMat.dispose();
  }
}

export { SPECIES };

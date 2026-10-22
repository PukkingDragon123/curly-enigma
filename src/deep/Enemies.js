// Creatures of the underground (see docs/DEEP.md, "Optional systems", and docs/REMAKE.md): spawns
// them by zone, biome and cave (enemies/spawn.js), runs their brains and bodies, their projectiles
// and hazards, the ecosystem around the mole (enemies/eco.js: carcasses, nests, grazing, hunting,
// noise), and the fight (enemies/combat.js: telegraphs, blocking and parries, combos, hit-stop).
//
// Species live in ./enemies/ (registry: species.js). The older folk: rock.js (Pebble Mimic, Rubble
// Golem), golem.js (Crystal Golem: beaten only by mining the crystal off its back), wisp.js, imp.js,
// wyrm.js, puffer.js, bats.js, critters.js. The ecosystem's beasts (beast.js brain + rig.js legs):
// kobold.js, troll.js, spider.js, wraith.js, slime.js, drake.js, and the dinosaurs in dinos.js.
//
// API (DigScene): update(dt, { player, eye, forward, time, busy, lamp, blocking, blockT }) → events
//   { damage, kind, push, blocked?, parried? } · { energy } · { say, key, tone, cd } · { loot } ·
//   { shake } · { hitStop }
// hitTest(eye, dir, reach) · damage(e, power, dir) → { hitStop, shake, kick, tag, combo } ·
// blast(x, y, z, r, power) · noise(x, y, z, r, kind) · radarMarkers(pos) · lights(eye) ·
// catchTest / catch / brushAt / xrayAt · threat() · dispose() · debug (enemies/debug.js).
//
// Hit spheres may carry a `part` (and `idx`, `prio`): hitTest() reports the part the pick would hit
// as enemy.hitPart / hitIdx / hitLabel, and damage() hands blows to a species' pickHit() when it has
// one.
import * as THREE from 'three';
import { zoneAt, CS } from './Generator.js';
import { VOX, M, MAT } from './materials.js';
import { OPAQUE } from './Mesher.js';
import { ITEMS } from '../data/items.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { clamp, rand } from '../core/util.js';
import { VB, VS, rgb } from './enemies/vox.js';
import { boxHits, clearLine, airAbove, fluidAt, solidAt } from './enemies/physics.js';
import { spores, sparkle, puff } from './enemies/fx.js';
import { creatureMaterial } from './enemies/material.js';
import { defineSounds, VOL } from './enemies/sfx.js';
import { Combat } from './enemies/combat.js';
import { Eco } from './enemies/eco.js';
import { Spawner } from './enemies/spawn.js';
import { lootFor } from './enemies/loot.js';
import { makeDebug } from './enemies/debug.js';
import { SPECIES } from './enemies/species.js';
import { Swarm, Bat } from './enemies/bats.js';
import { Webs } from './enemies/spider.js';
import { enemyIconURL } from './enemies/icons.js';
import * as UIM from '../ui/UI.js';
import { critterIconURL } from '../gfx/critters32.js';

// creature toughness tracks the pick you'd expect at that depth; damage scales with depth
const ZONE_POWER = [1, 1, 1.4, 2.1, 2.8, 3.6, 4.8];
const DMG = [1, 1, 1.25, 1.55, 1.9, 2.3, 2.7];
const MAX_ALIVE = 13;
const INTRO = {
  pebble_mimic: 'That rock just blinked! A <b>Pebble Mimic</b>. Give it a whack with your pick.',
  rubble_golem: 'The wall stood up! A <b>Rubble Golem</b>. Jump over its shockwave, then hit its <b>glowing seam</b>.',
  crystal_golem: 'A <b>Crystal Golem</b>! Its rock hide is too tough for a pick. Get behind it and <b>mine the crystal</b> off its back.',
  gloom_wisp: 'A <b>Gloom Wisp</b> is eating the light. Keep your lamp on it!',
  ember_imp: 'An <b>Ember Imp</b>! Watch out for its bouncing embers.',
  crystal_wyrm: 'A <b>Crystal Wyrmling</b>! When it coils back, sidestep the lunge.',
  spore_puffer: 'A <b>Spore Puffer</b>. Back away when it swells up!',
  shade_bat: '<b>Shade Bats</b>! They swoop at your lamp. One whack each.',
  kobold: '<b>Kobold miners</b>! Raise your guard (<b>F</b> or right mouse) when one winds up, and strike back.',
  cave_troll: 'A <b>Cave Troll</b>. Block its swipes, but when it glows <b>red</b>, get out of the way!',
  cave_spider: 'A <b>Giant Cave Spider</b>. Its webs slow you down: cut them with your pick.',
  ruin_wraith: 'A <b>Wraith</b>! It hates light: keep your lamp on it.',
  cave_slime: 'A <b>Cave Slime</b>. Hit it hard and it splits!',
  cave_drake: 'A <b>Cave Drake</b>! When its chest glows, get out of the fire.',
  raptor: '<b>Raptors</b> hunt in packs. Keep them in front of you and block the leaps.',
  tyrant: 'A <b>Cave Tyrant</b>... Its bite is too heavy to block. <b>Dodge</b>, then strike.',
  shellback: 'A herd of <b>Shellbacks</b>. Peaceful grazers, unless you threaten their young.',
  pterosaur: '<b>Pterosaurs</b> wheel under the roof. They dive at small things like you.',
};
const LOOT_COL = { ember_scale: 0xff7a2a, wisp_essence: 0xc89aff, bat_guano: 0x7a6a50, glowcap: 0x9affc0, slug_slime: 0x9ad0a0, spark_dust: 0x7fe7ff, spider_silk: 0xe0f0ff };

const _r = new THREE.Vector3(), _p = new THREE.Vector3();
const R = (a, b) => a + Math.random() * (b - a);

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
    this.shotMat = creatureMaterial(this.U, { emissive: 1.0 });
    this.time = 0;
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
    this.perf = 0; this.perfAvg = 0;
    this.dt = 1 / 60;
    this.autoSpawn = true; // tests switch this off and use debug.spawn
    this.queue = []; // events raised outside update (pick blows) go out with the next frame
    this.stats = { spawned: 0, failed: 0, killed: 0 };
    this.inUpdate = false;
    this.hint = { tough: 0, toughT: -99, crystal: 0, floatT: -99 };
    this.maxAlive = MAX_ALIVE;
    this.tokens = new Set();
    this.lampOn = true;
    this.stepNoiseT = 0;
    this.blocking = false;
    defineSounds(this.audio);
    this.combat = new Combat(this);
    this.eco = new Eco(this);
    this.spawner = new Spawner(this);
    this.webs = new Webs(this);
    this.webbed = 0; // seconds the mole is stuck in web
    this.debug = makeDebug(this);
  }

  // ------------------------------------------------------------------ shared resources
  species(key) { return SPECIES[key === 'bats' ? 'bat' : key]; }
  geo(key, build) {
    let g = this.geos.get(key);
    if (!g) { g = build(); this.geos.set(key, g); }
    return g;
  }
  material(opts = {}) {
    const m = creatureMaterial(this.U, opts);
    m.userData.e0 = opts.emissive || 0;
    if (opts.rimK !== undefined) m.userData.rimK = opts.rimK;
    return m;
  }
  dustCol(p) {
    const m = this.world.voxelAt(Math.floor(p.x * VOX), Math.floor(p.y * VOX) - 1, Math.floor(p.z * VOX));
    const d = MAT[m];
    if (!d || d.fluid || !d.tones) return [0.5, 0.42, 0.34];
    const [r, g, b] = rgb(d.tones[1]);
    return [r / 255, g / 255, b / 255];
  }
  /** Toughness: tracks the pick you'd expect at that depth (and the one you have). */
  hpScale(zone) {
    const pick = this.state.equipped?.('pick');
    const p = (pick?.power || 1) * (this.state.hasBuff?.('strong') ? 1.3 : 1);
    return clamp(ZONE_POWER[zone] || 1, p * 0.8, p * 1.3);
  }
  near(e, r) { return (e.dist ?? 99) < r; }

  // ------------------------------------------------------------------ frame
  update(dt, o = {}) {
    this.events.length = 0;
    if (this.queue.length) { this.events.push(...this.queue); this.queue.length = 0; }
    const pl = o.player || this.pl;
    if (!pl) return this.events;
    const t0 = performance.now();
    dt = Math.min(dt, 1 / 20);
    this.dt = dt;
    this.inUpdate = true;
    this.pl = pl;
    if (o.eye) this.eye.copy(o.eye); else pl.eye(this.eye);
    if (o.forward) this.fwd.copy(o.forward); else pl.forward(this.fwd);
    this.pc.set(pl.pos.x, pl.pos.y + 0.45, pl.pos.z);
    this.zone = zoneAt(Math.max(0, -pl.pos.y));
    this.safe = !!this.peace || this.safeAt(pl.pos.x, pl.pos.y, pl.pos.z);
    this.busy = !!o.busy;
    if (typeof o.lamp === 'number') this.lampOn = o.lamp > 1.5;
    if (this.busy) { this.inUpdate = false; return this.events; }
    this.time += dt;
    this.invuln -= dt;
    this.sneezeT -= dt;
    this.combat.frame(dt, o, this.events);
    this.blocking = this.combat.blocking;
    // the mole's footsteps carry when it runs
    this.stepNoiseT -= dt;
    if (pl.grounded && pl.speed > 3.3 && !pl.crouched && this.stepNoiseT <= 0) { this.stepNoiseT = 0.5; this.noise(pl.pos.x, pl.pos.y + 0.3, pl.pos.z, 5.5, 'steps'); }
    this.spawner.tick(dt);
    // stuck in web: the mole can barely move
    if (this.webbed > 0) {
      this.webbed -= dt;
      const k = Math.exp(-dt * 10);
      pl.vel.x *= k; pl.vel.z *= k;
      if (pl.vel.y > 0) pl.vel.y *= Math.exp(-dt * 8);
      if (Math.random() < dt * 8) this.fx.spawn({ x: pl.pos.x + rand(-0.3, 0.3), y: pl.pos.y + rand(0.1, 0.8), z: pl.pos.z + rand(-0.3, 0.3), vx: 0, vy: -0.1, vz: 0, life: 0.8, size: 0.015, color: [0.92, 0.95, 1], alpha: 0.7, drag: 2 });
    }
    for (const e of this.list) {
      if (!e.alive) continue;
      const px = e.pos.x, py = e.pos.y, pz = e.pos.z;
      // far away and out of sight: think at a lower rate (cheap on phones)
      if (e.dist > 18 && !e.awake && (e.skipT = (e.skipT || 0) + dt) < 0.12) continue;
      const edt = e.skipT > 0 && e.dist > 18 && !e.awake ? Math.min(0.12, e.skipT) : dt;
      e.skipT = 0;
      e.update(edt);
      // creatures never wander into the burrow, the town, a lift station or a trader's burrow
      if (this.excluded(e.pos.x, e.pos.y, e.pos.z, 0.5) && !this.excluded(px, py, pz, 0.5)) { e.pos.set(px, py, pz); e.vel.x *= -0.5; e.vel.z *= -0.5; }
      // lava burns all but the fire folk
      if (e.inFluid === 2 && !e.info.lavaProof && !e.lavaProof && e.alive) {
        e.hp -= dt * 3;
        if (Math.random() < dt * 20) this.fx.ember(e.pos.x, e.pos.y + 0.2, e.pos.z);
        if (Math.random() < dt * 4) this.sound('sizzle', {}, e.dist);
        if (e.hp <= 0) this.kill(e, { x: 0, y: 1, z: 0 });
      }
      if (e.alive && e.awake && e.sees && e.dist < 8 && !e.passive) this.seen(e);
    }
    this.updateShots(dt);
    this.updateHazards(dt);
    this.eco.update(dt);
    this.webs?.update?.(dt);
    this.sweep();
    this.perf = performance.now() - t0;
    this.perfAvg += (this.perf - this.perfAvg) * 0.05;
    this.inUpdate = false;
    return this.events;
  }

  /** Drop the defeated and the far away. */
  sweep() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      let gone = !e.alive;
      if (!gone) {
        const far = e.dist > (e.info.keepFar ?? 30) || (!e.awake && e.dist > 25);
        const vx = Math.floor(e.pos.x * VOX), vy = Math.floor(e.pos.y * VOX), vz = Math.floor(e.pos.z * VOX);
        const unloaded = !this.world.chunk(Math.floor(vx / CS), Math.floor(vy / CS), Math.floor(vz / CS));
        gone = far || unloaded || e.pos.y < -230;
      }
      if (gone) { this.tokens.delete(e); e.alive = false; e.dispose(); this.list.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------------ places
  /** Inside the burrow (and its tunnel mouths), the town, a lift station or a trader's burrow: no creatures. */
  excluded(x, y, z, pad = 0) {
    const W = this.owner?.W ?? this.plan.W ?? 10, D = this.owner?.D ?? this.plan.D ?? 8;
    if (x > -2.6 - pad && x < W + 2.6 + pad && z > -2.6 - pad && z < D + 2.6 + pad && y > -1.2 && y < 4) return true;
    const T = this.plan.town;
    if (T && Math.hypot(x - T.x, y - T.y, z - T.z) < T.r + 6 + pad) return true;
    for (const s of this.plan.stations || []) if (Math.hypot(x - s.x, y - s.y, z - s.z) < 5 + pad) return true;
    for (const b of this.plan.burrows || []) if (Math.hypot(x - b.x, (y - b.y) * 1.5, z - b.z) < (b.r || 4) + 2 + pad) return true;
    for (const l of this.plan.lifts || []) if (Math.hypot(x - l.x, (y - l.y) * 1.5, z - l.z) < 3 + pad) return true;
    return false;
  }
  /** Places where creatures leave the mole alone. */
  safeAt(x, y, z) {
    const W = this.owner?.W ?? this.plan.W ?? 10, D = this.owner?.D ?? this.plan.D ?? 8;
    if (x > -1.8 && x < W + 1.8 && z > -1.8 && z < D + 1.8 && y > -0.6 && y < 3.2) return true;
    const T = this.plan.town;
    if (T && Math.hypot(x - T.x, y - T.y, z - T.z) < T.r + 3) return true;
    for (const s of this.plan.stations || []) if (Math.hypot(x - s.x, y - s.y, z - s.z) < 3) return true;
    for (const b of this.plan.burrows || []) if (Math.hypot(x - b.x, (y - b.y) * 1.5, z - b.z) < (b.r || 4)) return true;
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
  /** Room a species needs: [half width, headroom] (m). */
  space(kind) {
    const S = this.species(kind);
    if (S?.info?.space) return S.info.space;
    if (kind === 'crystal_golem') return [0.48, 2.3];
    if (kind === 'golem') return [0.32, 1.2];
    if (kind === 'bats') return [0.2, 1.8];
    return [0.2, S?.info.flying ? 1.6 : 0.7];
  }
  /** Find a free spot for a species near (cx, cy, cz) between rMin and rMax meters. */
  findSpot(kind, cx, cy, cz, rMin, rMax, { hidden = true, tries = 10, ray = false, roomy = 1 } = {}) {
    const [hw0, clear0] = this.space(kind);
    const clear = clear0 * roomy, hw = hw0 * roomy;
    const bump = hw > 0.4 ? 0.42 : 0.26; // a big walker can stand on a rougher floor
    const stride = hw > 0.4 ? 3 : hw > 0.24 ? 2 : 1;
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
      // cheap checks first: streamed in, not a safe place, not on top of the mole
      if (!this.loaded(x, y, z) || this.excluded(x, y, z, 2) || Math.hypot(x - this.pc.x, z - this.pc.z) < 2.5) continue;
      const f = this.floorAt(x, y, z, clear, 6, ray && i % 2 === 0 ? 1 : 4);
      if (!f) continue;
      if (hidden && this.inView(f.x, f.y + 0.4, f.z)) continue;
      if (boxHits(this.world, f.x - hw, f.y + bump, f.z - hw, f.x + hw, f.y + clear, f.z + hw, stride)) continue; // bumps underfoot are fine
      return f;
    }
    return null;
  }

  alive() { let n = 0; for (const e of this.list) if (e.alive && !e.passive) n++; return n; }
  critters() { let n = 0; for (const e of this.list) if (e.alive && e.passive && !e.nest) n++; return n; }

  /** Spawn a set of creatures around a point. kinds: species keys ('bats' = a roost). */
  spawnGroup(kinds, x, y, z, zone, { nest = null, r = 2, spot = null, hidden = !nest, group = null, asleep = false, baby = false, haunt = null, ...extra } = {}) {
    const out = [];
    kinds.forEach((kind, i) => {
      if (this.alive() >= this.maxAlive + 2) return;
      const big = kind === 'crystal_golem';
      // a big guardian needs a roomy spot: look harder, then settle for a little less headroom
      let s = i === 0 && spot ? spot : this.findSpot(kind, x, y, z, 0, r + (big ? 2.5 : 1.5), { hidden, tries: big ? 40 : 14 })
        || (big ? this.findSpot(kind, x, y, z, 0, r + 2.5, { hidden, tries: 30, roomy: 0.85 }) : null);
      if (!s && big && nest) { kind = 'golem'; s = this.findSpot(kind, x, y, z, 0, r + 1.5, { hidden, tries: 14 }); } // no room: a smaller guardian
      if (!s) return;
      if (kind === 'bats') { out.push(...this.spawnBats(s, zone, nest)); return; }
      const S = this.species(kind);
      if (!S) return;
      const fy = S.info.flying ? s.y + (S.info.hover ?? rand(0.9, 1.3)) : s.y + 0.01;
      const e = new S(this, { ...extra, x: s.x, y: fy, z: s.z, zone, mat: s.mat, nest, group, asleep, baby, haunt, level: this.spawner.level(s.y), emerge: (S.info.flying && !S.info.noEmerge) || kind === 'imp' });
      e.key = kind;
      if (group && !e.group) group.add(e); else if (group && !group.members.includes(e)) group.add(e);
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
    for (let i = 0; i < n && this.alive() < this.maxAlive + 2; i++) {
      const hx = s.x + rand(-0.45, 0.45), hz = s.z + rand(-0.45, 0.45);
      const c = airAbove(this.world, hx, top - 0.5, hz, 1.5);
      if (c >= 1.5) continue;
      const e = new Bat(this, { x: hx, y: top - 0.5 + c - 0.13, z: hz, zone, swarm: sw, group: sw, nest });
      e.key = 'bat';
      this.add(e);
      out.push(e);
    }
    return out;
  }

  add(e) {
    this.root.add(e.root);
    e.updateSpheres();
    e.place();
    e.onAdd?.();
    this.list.push(e);
    this.stats.spawned++;
    return e;
  }

  /** Debug / tests: spawn one creature (or 'bats') right at a point. */
  debugSpawn(kind, x, y, z, opts = {}) {
    const zone = opts.zone ?? zoneAt(Math.max(0, -y));
    const f = this.floorAt(x, y, z, 0.4, 3, 1) || { x, y, z, mat: M.STONE };
    if (kind === 'bats') return this.spawnBats({ x: f.x, y: f.y, z: f.z }, zone, null);
    const S = this.species(kind);
    if (!S) return null;
    const e = new S(this, { ...opts, x, y: S.info.flying || opts.raw ? y : f.y + 0.01, z, zone, mat: opts.mat ?? f.mat, level: this.spawner.level(y) });
    e.key = kind;
    if (opts.awake) { e.awake = true; }
    this.add(e);
    e.place(); e.updateSpheres();
    return e;
  }

  // ------------------------------------------------------------------ the mole and the creatures
  /** Damage scale by depth (smooth through a zone). */
  dmgScale(zone, y) {
    const lv = y !== undefined ? this.spawner.level(y) : zone;
    const z = clamp(Math.floor(lv), 1, 6), f = lv - z;
    return (DMG[z] || 1) + ((DMG[Math.min(6, z + 1)] || DMG[z]) - (DMG[z] || 1)) * f * 0.6;
  }
  /**
   * A creature's blow lands on the mole (through the guard, see combat.js). Returns true when it
   * really got through (not blocked), false while invulnerable / safe / blocked.
   * o: { heavy, unblockable, noParry, from }
   */
  hurtPlayer(src, base, push, kind, o = {}) {
    if (this.safe || this.invuln > 0) return false;
    let n = base * this.dmgScale(src.zone || this.zone, src.pos?.y);
    if ((kind === 'fire' || src.info?.fire) && this.state.protects?.('heat')) n *= 0.5;
    n = Math.max(1, Math.round(n));
    this.invuln = 0.5;
    const ev = this.combat.incoming(src, n, push || [0, 0, 0], kind || 'enemy', o);
    if (ev.parried) this.invuln = 0.3;
    return !ev.blocked;
  }
  queueEv(ev) { (this.inUpdate ? this.events : this.queue).push(ev); }

  say(key, html, tone = 'warn', cd = 8) {
    const t = this.toastT[key];
    if (t !== undefined && this.time - t < cd) return;
    this.toastT[key] = this.time;
    // raised outside update (a pick blow, a blast): goes out with the next frame's events
    this.queueEv({ say: html, key: 'enemy_' + key, tone, cd });
  }

  /** A heavy creature shakes the ground: { shake } event, weaker with distance. */
  shake(src, a) {
    const k = clamp(1.2 - (src.dist ?? 0) / 8, 0, 1) * a;
    if (k > 0.05) this.queueEv({ shake: k });
  }

  /** A little word at a screen point over a world position. */
  floatAt(text, p, color = '#fff', size = 1) {
    const o = this.owner;
    if (!o?.toScreen || !this.ui?.floatText) return;
    const s = o.toScreen(_r.set(p.x, p.y, p.z));
    if (s.visible === false) return;
    this.ui.floatText(text, s.x, s.y, color, size);
  }

  /** The pick bounced off a hide it can't hurt (crystal golems): say what to do instead. */
  pickHint(e, p) {
    const h = this.hint;
    h.tough++;
    if (this.time - h.floatT > 0.7) { h.floatT = this.time; this.floatAt('too tough!', p, '#ffc89a', 0.9); }
    if (h.tough === 1) this.say('tough', 'Clang! Its rock hide is <b>too tough</b>. Get behind it and mine the <b>glowing crystal</b> on its back.', 'warn', 9999);
    else if (h.tough % 4 === 0 && this.time - h.toughT > 40) { h.toughT = this.time; this.say('tough2', 'Your pick just bounces off. <b>Circle around</b> (it turns slowly) and hit the <b>crystal</b>!', 'warn', 40); }
  }

  /** First crystal chipped off a golem: you're doing it right. */
  crystalHint() {
    if (this.hint.crystal++) return;
    this.say('crystal', 'The crystal cracks! Keep mining it — every shard that breaks off staggers the golem.', 'good', 9999);
  }

  /** A sound from a creature: quieter with distance, panned toward where it is. */
  sound(name, opts = {}, dist = 0, at = null) {
    const k = clamp(1.3 - dist / 13, 0, 1);
    if (k <= 0.05) return;
    let pan;
    if (at) {
      const dx = at.x - this.eye.x, dz = at.z - this.eye.z, l = Math.hypot(dx, dz) || 1;
      // right of the view: (-cos yaw…) = forward × up
      const rx = -this.fwd.z, rz = this.fwd.x, rl = Math.hypot(rx, rz) || 1;
      pan = clamp((dx * rx + dz * rz) / (l * rl), -1, 1) * 0.6 * clamp(l / 2, 0, 1);
    }
    if (VOL.has(name)) { this.audio?.play(name, { ...opts, vol: (opts.vol ?? 1) * k, pan }); return; }
    if (k < 0.45) return;
    this.audio?.play(name, opts);
  }

  /** A creature notices the mole: a little "!" pops over its head. */
  alert(e) {
    this.sound('emote', { kind: 'alert' }, e.dist);
    const o = this.owner;
    if (!o?.toScreen || !this.ui?.floatText) return;
    const p = o.toScreen(e.headPos ? e.headPos(_r).add(_p.set(0, 0.15, 0)) : _r.set(e.center.x, e.center.y + e.hitR * e.size + 0.2, e.center.z));
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

  /** Something made a sound (running, digging, a fight, a roar, a blast): creatures in range hear it. */
  noise(x, y, z, r = 6, kind = 'noise') {
    const n = { x, y, z, r, kind, t: this.time };
    this.eco.noises.push(n);
    for (const e of this.list) {
      if (!e.alive || e.passive) continue;
      const d = Math.hypot(e.pos.x - x, (e.pos.y - y) * 1.3, e.pos.z - z);
      if (d > r * (e.info.hear ?? 1)) continue;
      if (e.hear) e.hear(n, d);
      else if (r >= 10) e.wake?.(true);
    }
  }

  /** The hostile thing nearest the mole that is after it (for music / UI): { kind, dist } or null. */
  threat() {
    let best = null;
    for (const e of this.list) if (e.alive && !e.passive && (e.mode === 'fight' || (e.awake && e.dist < 8)) && (!best || e.dist < best.dist)) best = e;
    return best ? { kind: best.kind, dist: best.dist } : null;
  }

  // ------------------------------------------------------------------ attack tokens
  tokenMax() { return 1 + (this.zone >= 3 ? 1 : 0) + (this.zone >= 5 ? 1 : 0); }
  tokenFree(e) {
    if (this.tokens.has(e)) return true;
    for (const t of this.tokens) if (!t.alive || !t.atk) this.tokens.delete(t);
    return this.tokens.size < this.tokenMax();
  }
  takeToken(e) { if (!this.tokenFree(e)) return false; this.tokens.add(e); return true; }
  releaseToken(e) { this.tokens.delete(e); }

  // ------------------------------------------------------------------ pick vs creature
  /**
   * The creature the pick would hit before `reach`, or null. Also sets on it: lastHit (the point),
   * hitPart ('body' or a weak point such as 'crystal' / 'core'), hitIdx (which one), hitLabel (a
   * crosshair hint or ''), aimT (when it was last aimed at).
   */
  hitTest(eye, dir, reach) {
    let best = null, bt = reach, bs = null, braw = 0;
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
        if (t0 > reach) continue;
        const tk = t0 - (s.prio || 0); // weak points win near-ties with the hide around them
        if (tk <= bt) { bt = tk; best = e; bs = s; braw = t0; }
      }
    }
    // a web in the way takes the blow instead
    const web = this.webs?.hitTest?.(eye, dir, best ? braw : reach);
    if (web) return web;
    if (best) {
      best.lastHit.set(eye.x + dir.x * braw, eye.y + dir.y * braw, eye.z + dir.z * braw);
      best.hitPart = bs.part || 'body';
      best.hitIdx = bs.idx ?? -1;
      best.hitWeak = bs.weak || 0;
      best.hitLabel = best.partLabel ? best.partLabel(best.hitPart) : '';
      best.aimT = this.time;
    }
    return best;
  }

  /**
   * A pick blow on a creature (from DigScene.strike). Returns the blow's feel for the scene:
   * { hitStop (s), shake (0..1), kick (camera kick scale), tag: null | 'finisher' | 'crit', combo }.
   */
  damage(e, power, dir) {
    if (!e || !e.alive) return null;
    if (e.isWeb) return e.cut(power, dir);
    const blow = this.combat.playerHit(e, power);
    const p = e.lastHit;
    this.noise(p.x, p.y, p.z, 5, 'fight');
    if (e.pickHit) { e.lastHitT = this.time; e.lastHitBy = 'player'; e.pickHit(blow.power, dir, e.hitPart, e.hitIdx, blow); if (blow.tag) this.combat.flourish(e, blow, p); return this.feel(blow); }
    if (e.passive) {
      this.fx.dust(p.x, p.y, p.z, 3, this.dustCol(e.pos), 0.04);
      sparkle(this.fx, p.x, p.y, p.z, 3, [1, 1, 0.85], 1, 2, 0.015, 0.3);
      this.sound('hit', { snd: e.info.snd || 'flesh', vol: 0.5 });
      e.takeHit(power, dir);
      return { hitStop: 0.02, shake: 0.03, kick: 0.6, tag: null, combo: 0 };
    }
    if (e.hitWeak) {
      // a weak spot (a rubble golem's glowing seam): a harder blow, a bright ring
      blow.power *= e.hitWeak;
      const g = e.G?.core || [1, 0.9, 0.6];
      sparkle(this.fx, p.x, p.y, p.z, 12, g, 2.6, 3, 0.022, 0.6);
      this.sound('crystal_ring', { pitch: 1.4, vol: 0.7 });
      if (this.time - this.hint.floatT > 0.7) { this.hint.floatT = this.time; this.floatAt('weak spot!', p, '#ffe08a', 0.9); }
    }
    const c = e.hitCol || this.dustCol(e.pos);
    this.fx.sparks(p.x, p.y, p.z, 7, [1, 0.92, 0.7], [-dir.x, -dir.y, -dir.z], 2.6);
    sparkle(this.fx, p.x, p.y, p.z, 4, [1, 1, 0.85], 1.5, 3, 0.018, 0.35);
    this.fx.dust(p.x, p.y, p.z, 3, c, 0.05);
    if (e.info.flesh) for (let i = 0; i < 5; i++) this.fx.spawn({ x: p.x, y: p.y, z: p.z, vx: -dir.x * 1.5 + R(-1, 1), vy: R(0.5, 2), vz: -dir.z * 1.5 + R(-1, 1), life: R(0.3, 0.6), size: R(0.012, 0.022), color: c, drag: 0.8, grav: 8, bounce: 0.3, fade: false });
    this.sound('hit', { snd: e.info.snd || 'flesh', vol: 0.9 });
    this.combat.flourish(e, blow, p);
    e.takeHit(blow.power, dir, { kb: blow.kb });
    return this.feel(blow);
  }
  feel(b) { return { hitStop: b.hitStop, shake: b.shake, kick: 1 + (b.tag ? 0.8 : 0) + (b.combo === 2 ? 0.2 : 0), tag: b.tag, combo: b.combo }; }

  /** Defeat: a flesh creature keels over (a carcass); the rest burst into voxel chunks. Loot. */
  kill(e, dir, by) {
    if (!e.alive) return;
    e.alive = false;
    e.flash = 1;
    this.stats.killed++;
    this.tokens.delete(e);
    if (e.atk) e.atk = null;
    const byPlayer = by === undefined ? (this.time - e.lastHitT < 8 && (e.lastHitBy === 'player' || e.lastHitBy === 'blast')) : (by === 'player' || by === 'blast');
    if (byPlayer && !e.passive) {
      this.state.emit?.('act', { type: 'kill', kind: e.kind });
      this.state.discover?.('critter', e.kind);
    }
    const c = e.center;
    if (e.info.flesh && !e.passive) {
      // a few bits fly, the body stays
      puff(this.fx, c.x, c.y, c.z, 6, e.hitCol || this.dustCol(e.pos), 0.2 * e.size, 0.4, 0.07, 0.5);
      sparkle(this.fx, c.x, c.y, c.z, 8, [1, 0.95, 0.75], 2.2, 3, 0.02, 0.6);
      this.eco.addCarcass(e);
    } else {
      this.debris(e, dir || { x: 0, y: 0, z: 0 });
      sparkle(this.fx, c.x, c.y, c.z, 14, [1, 0.95, 0.75], 2.8, 3, 0.022, 0.8);
      puff(this.fx, c.x, c.y, c.z, 8, this.dustCol(e.pos), 0.2 * e.size, 0.4, 0.07, 0.5);
    }
    if (e.deathFx) e.deathFx();
    this.sound('pristine', {}, e.dist);
    this.sound('break', { snd: e.info.snd === 'crystal' ? 'crystal' : e.info.snd === 'stone' ? 'stone' : 'dirt', vol: 0.7 }, e.dist);
    if (byPlayer) { this.loot(e); this.spawner.guardDown(e); }
    if (e.group?.members) for (const m of e.group.members) if (m !== e && m.alive && m.hear) m.hear({ x: c.x, y: c.y, z: c.z, r: 8, kind: 'death', t: this.time }, 1);
  }

  /** World positions (and colors) of a mesh's voxels: [x, y, z, c, …]. */
  voxPoints(o, vox, pts = []) {
    const ud = o.geometry.userData;
    const [px, py, pz] = ud.pivot || [0, 0, 0];
    const vs = ud.vs || VS;
    const me = o.matrixWorld.elements;
    for (const v of vox) {
      const lx = (v.x + 0.5 - px) * vs, ly = (v.y + 0.5 - py) * vs, lz = (v.z + 0.5 - pz) * vs;
      pts.push(me[0] * lx + me[4] * ly + me[8] * lz + me[12], me[1] * lx + me[5] * ly + me[9] * lz + me[13], me[2] * lx + me[6] * ly + me[10] * lz + me[14], v.c);
    }
    return pts;
  }

  /** Burst a creature into chunks made of its own voxels. */
  debris(e, dir) {
    e.root.updateMatrixWorld(true);
    const pts = [];
    const extra = e.tails || [];
    let vs = VS;
    const visit = (o) => {
      if (!o.isMesh || !o.visible || o.scale.y < 0.05) return;
      const ud = o.geometry.userData;
      if (!ud?.vox) return;
      vs = Math.max(vs, ud.vs || VS);
      this.voxPoints(o, ud.vox, pts);
    };
    e.root.traverse(visit);
    for (const t of extra) { t.updateMatrixWorld(true); visit(t); }
    const n = pts.length / 4;
    if (!n) return;
    const big = e.kind === 'crystal_golem' || e.size > 1.6;
    // big creatures crumble into coarser blocks (2×2×2 model voxels): cheaper and chunkier
    const step = (n > 700 ? 2 : 1) * vs * Math.max(1, e.size || 1);
    const glow = !!e.info.glowBits || e.kind === 'crystal_wyrm' || e.kind === 'ember_imp' || e.kind === 'gloom_wisp';
    this.burst(pts, step, big ? 16 : e.kind === 'rubble_golem' ? 10 : 6, {
      center: e.center, dir, glow,
      // a crystal golem slumps into a heap of tumbling rubble; the others burst
      speed: big ? [0.5, 1.6] : [1.6, 3.2], up: big ? [0.6, 2] : [1.5, 3], life: big ? [2, 3.2] : [1.3, 2.4],
    });
  }

  /** A carcass's last scraps crumble away (eco.js). */
  chunkRoot(root, center) {
    root.updateMatrixWorld(true);
    const pts = [];
    let vs = VS;
    root.traverse((o) => { if (o.isMesh && o.geometry.userData?.vox) { vs = Math.max(vs, o.geometry.userData.vs || VS); this.voxPoints(o, o.geometry.userData.vox, pts); } });
    if (pts.length) this.burst(pts, vs * 2.5, 5, { center, speed: [0.3, 1], up: [0.3, 1], life: [1, 1.8] });
  }

  /** Throw some of a creature's voxels off as tumbling chunks, right where they were. */
  chunk(mesh, vox, o = {}) {
    if (!vox.length) return;
    mesh.updateMatrixWorld(true);
    const pts = this.voxPoints(mesh, vox);
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < pts.length; i += 4) { mx += pts[i]; my += pts[i + 1]; mz += pts[i + 2]; }
    const n = pts.length / 4;
    const step = o.step || (mesh.geometry.userData.vs || VS) * mesh.matrixWorld.getMaxScaleOnAxis(); // voxel spacing in the world
    this.burst(pts, step, o.K || 1, { center: { x: mx / n, y: my / n, z: mz / n }, dir: { x: 0, y: 0, z: 0 }, ...o });
  }

  /**
   * World points → Bodies chunks: binned on a `step` grid, split into up to K pieces flying out from
   * o.center (o.speed [min, max], o.up, o.vel base velocity, o.glow, o.life, o.bounce).
   */
  burst(pts, step, K, o) {
    const cells = new Map();
    for (let i = 0; i < pts.length; i += 4) {
      const ix = Math.round(pts[i] / step), iy = Math.round(pts[i + 1] / step), iz = Math.round(pts[i + 2] / step);
      const k = ((ix + 4096) * 8192 + (iy + 4096)) * 8192 + (iz + 4096);
      if (!cells.has(k)) cells.set(k, [ix, iy, iz, pts[i + 3]]);
    }
    const list = [...cells.values()], m = list.length;
    if (!m) return;
    K = clamp(Math.round(m / 45), Math.min(2, K), K);
    const seeds = [];
    for (let k = 0; k < K; k++) seeds.push(list[Math.floor(Math.random() * m)]);
    const groups = seeds.map(() => []);
    for (const v of list) {
      let bk = 0, bd = 1e9;
      for (let k = 0; k < K; k++) { const s = seeds[k]; const d = (v[0] - s[0]) ** 2 + (v[1] - s[1]) ** 2 + (v[2] - s[2]) ** 2; if (d < bd) { bd = d; bk = k; } }
      groups[bk].push(v);
    }
    const c = o.center, dir = o.dir || { x: 0, y: 0, z: 0 }, base = o.vel || [0, 0, 0];
    const span = (v, d) => (v === undefined ? d : typeof v === 'number' ? [v, v] : v);
    const [s0, s1] = span(o.speed, [1.6, 3.2]), [u0, u1] = span(o.up, [1.5, 3]), [l0, l1] = span(o.life, [1.3, 2.4]);
    const scale = step * VOX;
    for (const g of groups) {
      if (g.length < (K > 1 ? 3 : 1)) continue;
      let mx = 0, my = 0, mz = 0;
      for (const v of g) { mx += v[0]; my += v[1]; mz += v[2]; }
      mx /= g.length; my /= g.length; mz /= g.length;
      // shift onto the Bodies lattice so the chunk spawns exactly where those voxels were
      const bx = mx * scale - mx - 0.5, by = my * scale - my - 0.5, bz = mz * scale - mz - 0.5;
      const vox = g.map((v) => ({ x: v[0] + bx, y: v[1] + by, z: v[2] + bz, c: v[3] }));
      let ox = mx * step - c.x, oy = my * step - c.y, oz = mz * step - c.z;
      const ol = Math.hypot(ox, oy, oz) || 1;
      ox /= ol; oy /= ol; oz /= ol;
      const sp = rand(s0, s1);
      this.bodies.spawn(vox, {
        vel: [base[0] + ox * sp + dir.x * 2, base[1] + Math.abs(oy) * sp + rand(u0, u1), base[2] + oz * sp + dir.z * 2],
        scale, glow: !!o.glow, life: rand(l0, l1), bounce: o.bounce ?? 0.45,
        spin: [rand(-12, 12), rand(-12, 12), rand(-12, 12)],
      });
    }
  }

  loot(e) {
    lootFor(e).forEach((id, i) => this.dropItem(e, id, i * 0.18, e.kind === 'crystal_golem' ? 1.5 : 0.8, e.kind === 'crystal_golem' ? e.lootAt : null, e.kind === 'crystal_golem' ? 4.6 : 3.4));
  }

  /** Loot pops out as a little glowing gem and flies into the backpack (same path as ore). */
  dropItem(e, id, delay = 0, spread = 0.8, at = null, up = 3.4) {
    const it = ITEMS[id];
    if (!it) return;
    const q = it.q ? Math.round(rand(60, 92)) : undefined;
    const col = LOOT_COL[id] ?? it.lootCol ?? it.icon?.ore?.[0] ?? it.icon?.c?.[0] ?? (typeof it.glow === 'number' ? it.glow : 0xffe08a);
    const g = this.geo('loot|' + id, () => {
      const v = new VB(id.length);
      const [r, gg, b] = rgb(col);
      const lt = ((Math.min(255, r + 70) << 16) | (Math.min(255, gg + 70) << 8) | Math.min(255, b + 70)) >>> 0;
      const dk = (((r * 0.6) << 16) | ((gg * 0.6) << 8) | (b * 0.6)) >>> 0;
      v.ell(0, 0, 0, 2.2, 2.6, 2.2, (x, y, z, nx, ny) => (ny > 0.45 ? lt : ny < -0.4 ? dk : col));
      v.set(-1, 2, 1, 0xffffff);
      return v.list();
    });
    const c = at || e.center, s = VS * VOX * 1.2;
    // shift onto the Bodies lattice so the gem's center lands on the creature's
    let mx = 0, my = 0, mz = 0;
    for (const v of g) { mx += v.x; my += v.y; mz += v.z; }
    mx /= g.length; my /= g.length; mz /= g.length;
    const bx = c.x * VOX - mx - 0.5, by = (c.y + 0.1) * VOX - my - 0.5, bz = c.z * VOX - mz - 0.5;
    const vox = g.map((v) => ({ x: v.x + bx, y: v.y + by, z: v.z + bz, c: v.c }));
    const b = this.bodies.spawn(vox, { vel: [rand(-spread, spread), up + rand(0, spread * 0.4), rand(-spread, spread)], scale: s, glow: true, pickup: { id, q, p: false, delay: 0.75 + delay } });
    if (!b) this.queueEv({ loot: { id, q, p: false } });
    sparkle(this.fx, c.x, c.y, c.z, 6, [1, 0.95, 0.6], 1.5, 1, 0.02, 0.6);
  }

  // ------------------------------------------------------------------ explosions
  /**
   * An explosion at (x, y, z) with radius r: creatures are hurt and thrown by distance (rock in the
   * way shields them). Critters only get a fright. Crystal golems lose crystal (blastHit). Everything
   * for a long way around hears it.
   */
  blast(x, y, z, r, power = 1) {
    const R2 = r * 1.6;
    for (const e of this.list) {
      if (!e.alive) continue;
      const c = e.center;
      const dx = c.x - x, dy = c.y - y, dz = c.z - z, d = Math.hypot(dx, dy, dz);
      const gap = Math.max(0, d - e.hitR * e.size);
      if (gap > R2) continue;
      let k = clamp(1 - gap / R2, 0, 1);
      if (d > 0.6 && !clearLine(this.world, x, y, z, c.x, c.y, c.z)) k *= 0.35;
      if (k < 0.03) continue;
      const l = d || 1;
      const dir = { x: dx / l, y: Math.max(0.35, dy / l), z: dz / l };
      if (e.asleep) e.wakeUp?.(true);
      e.wake?.(true);
      if (e.blastHit) { e.lastHitT = this.time; e.lastHitBy = 'blast'; e.blastHit(k, power, dir, x, y, z, r); continue; }
      const kb = 7 * k * power / (e.mass || 1);
      e.vel.x += dir.x * kb; e.vel.y += (e.info.flying ? dir.y : Math.max(dir.y, 0.5)) * kb; e.vel.z += dir.z * kb;
      e.sqv -= 6 * k; e.shiver = Math.max(e.shiver, 0.8 * k);
      if (e.passive) { e.scared = 4; e.flash = 0.6; continue; }
      if (k > 0.4) e.stun?.(0.8 * k + 0.4, 'dazed');
      e.takeHit(e.maxHp * 1.5 * k * power, { x: dir.x * 0.5, y: dir.y * 0.5, z: dir.z * 0.5 }, { by: 'blast' });
    }
    this.noise(x, y, z, 26 * Math.max(0.6, power), 'blast');
    this.webs?.blast?.(x, y, z, r);
  }

  // ------------------------------------------------------------------ critters, carcasses, eggs
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

  /** Something to grab, net, harvest or take under the crosshair? → { label, kind: 'use' } or null. */
  catchTest(eye, dir, reach = 2.3) {
    const e = this.pickCritter(eye, dir, reach + 0.3, (c) => (c.info.catch === 'grab' || c.info.catch === 'net') && c.canGrab());
    if (e) return { label: `${e.info.catch === 'net' ? 'Net' : 'Grab'} ${e.info.name}`, kind: 'use' };
    const egg = this.eco.eggAt(eye, dir, reach);
    if (egg) return { label: `Take ${ITEMS[egg.nest.item]?.name || 'egg'}`, kind: 'use' };
    const c = this.eco.harvestAt(eye, dir, reach);
    if (c) return { label: `Harvest ${c.name}`, kind: 'use' };
    return null;
  }

  /** E / use: grab or net the critter under the crosshair, take an egg, harvest a carcass. */
  catch(eye, dir, reach = 2.3) {
    const e = this.pickCritter(eye, dir, reach + 0.3, (c) => (c.info.catch === 'grab' || c.info.catch === 'net') && c.canGrab());
    if (!e) {
      const egg = this.eco.eggAt(eye, dir, reach);
      if (egg) {
        const id = this.eco.takeEgg(egg);
        const ev = [{ loot: { id, q: ITEMS[id]?.q ? Math.round(rand(72, 96)) : undefined, p: false } }];
        if (egg.nest.guards !== undefined) ev.push({ say: `You took a <b>${ITEMS[id]?.name || 'egg'}</b>. Its parents won't be happy...`, key: 'enemy_egg', tone: 'warn', cd: 60 });
        return ev;
      }
      const c = this.eco.harvestAt(eye, dir, reach);
      if (c) {
        c.harvested = true;
        c.meat = Math.max(0.05, c.meat - 0.45);
        this.sound('chomp', { vol: 0.6 });
        this.fx.dust(c.center.x, c.center.y, c.center.z, 5, [0.55, 0.3, 0.25], 0.15);
        return c.harvest.filter((id) => ITEMS[id]).map((id) => ({ loot: { id, q: ITEMS[id]?.q ? Math.round(rand(65, 95)) : undefined, p: false } }));
      }
      return [];
    }
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
  /**
   * A thrown thing: o = { x, y, z, v: [vx, vy, vz], g, geo, dmg, zone, src, ember, hot, light, mat,
   * kind ('fire' | 'rock' | 'web' | 'acid'), bounces (max), onHit(shot), life, r }.
   */
  addShot(o) {
    const mesh = new THREE.Mesh(o.geo, o.mat || this.shotMat);
    mesh.layers.enable(LAYER_OUTLINE);
    mesh.position.set(o.x, o.y, o.z);
    this.root.add(mesh);
    this.shots.push({
      pos: mesh.position, vel: new THREE.Vector3(...o.v), g: o.g ?? 9, t: 0, life: o.life ?? 3, bounces: 0, maxB: o.bounces ?? 3, sq: 0, mesh, dmg: o.dmg, zone: o.zone,
      src: o.src, kind: o.kind || 'fire', info: { fire: (o.kind || 'fire') === 'fire' }, ember: o.ember, hot: o.hot, light: o.light, onHit: o.onHit, trail: o.trail, r: o.r ?? 0.07, spin: o.spin ?? 1,
    });
  }

  updateShots(dt) {
    const w = this.world;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i], p = s.pos, v = s.vel, r = s.r;
      const fire = s.kind === 'fire';
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
        if (fire) { this.fx.sparks(p.x, p.y, p.z, 6, s.hot, [0, 1, 0], 2.2); this.sound('sizzle', {}, dist); }
        this.sound('thud', { vol: 0.15 }, dist);
      }
      // trail
      if (fire) {
        if (Math.random() < 0.7) this.fx.spawn({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.3, vy: 0.3, vz: (Math.random() - 0.5) * 0.3, life: 0.4, size: 0.03, grow: -0.05, color: s.ember, glow: true, drag: 1 });
        if (Math.random() < 0.25) this.fx.ember(p.x, p.y, p.z);
      } else if (s.trail && Math.random() < 0.6) this.fx.spawn({ x: p.x, y: p.y, z: p.z, life: 0.35, size: 0.02, color: s.trail, alpha: 0.7, drag: 1 });
      s.sq = Math.max(0, s.sq - dt * 6);
      s.mesh.scale.set(1 + s.sq * 0.5, 1 - s.sq * 0.45, 1 + s.sq * 0.5);
      s.mesh.rotation.x += dt * 9 * s.spin; s.mesh.rotation.y += dt * 6 * s.spin;
      let done = false;
      // hits the mole?
      const gap = Math.hypot(p.x - this.pl.pos.x, p.y - clamp(p.y, this.pl.pos.y + 0.1, this.pl.pos.y + 0.78), p.z - this.pl.pos.z) - 0.27;
      if (gap < 0) {
        const sp = Math.hypot(v.x, v.z) || 1;
        const from = [p.x - v.x / sp, p.y, p.z - v.z / sp];
        if (s.onHit) s.onHit(s, from);
        else if (this.hurtPlayer(s.src || s, s.dmg, [v.x / sp * 2.5, 1.8, v.z / sp * 2.5], s.kind, { from })) {
          if (fire) { this.say('ember', 'Ouch, hot! Ember blobs <b>bounce</b> — keep moving.', 'bad', 40); this.sound('ignite', {}); }
        }
        if (fire) this.fx.sparks(p.x, p.y, p.z, 16, s.hot, [0, 1, 0], 3.5);
        done = true;
      }
      const fl = fluidAt(w, p.x, p.y, p.z);
      if (fl === 1 && fire) { puff(this.fx, p.x, p.y + 0.1, p.z, 6, [0.85, 0.85, 0.9], 0.08, 0.8, 0.07, 0.6); this.sound('steam', {}, dist); done = true; }
      if (fl === 2 || s.t > s.life || (s.bounces >= s.maxB && Math.hypot(v.x, v.y, v.z) < 2.2) || (s.maxB === 0 && bounced)) done = true;
      if (done) {
        if (fire) {
          this.fx.sparks(p.x, p.y, p.z, 10, s.hot, [0, 1, 0], 2.5);
          puff(this.fx, p.x, p.y, p.z, 3, [0.22, 0.2, 0.2], 0.05, 0.6, 0.05, 0.45);
          if (gap >= 0) this.sound('sizzle', {}, dist);
        } else if (gap >= 0) s.onLand?.(s);
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
            if (this.hurtPlayer(h.src || h, h.dmg * (d < 1.2 ? 1 : 0.7), [ux * 3.5, 3.4, uz * 3.5], 'quake')) this.say('quake', 'The shockwave knocked you over! <b>Jump</b> over it next time.', 'bad', 60);
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
            if (this.hurtPlayer(h.src || h, h.sting, [0, 0, 0], 'spores')) {
              if (this.sneezeT <= 0) { this.sneezeT = 2.5; this.audio?.play('sneeze'); }
              this.say('spores', 'Achoo! The <b>spores</b> sting. Get out of the cloud!', 'bad', 45);
            }
          }
        }
        if (h.t > h.life) this.hazards.splice(i, 1);
      } else if (h.update) {
        if (h.update(h, dt, this) === false) this.hazards.splice(i, 1);
      } else this.hazards.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ HUD + lights
  radarMarkers(pos) {
    const out = [];
    for (const e of this.list) {
      if (!e.alive || !e.awake || e.passive || e.asleep) continue;
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
      if (!s.light) continue;
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
    this.eco.dispose();
    this.webs?.dispose?.();
    this.root.removeFromParent();
    for (const g of this.geos.values()) {
      if (g?.isBufferGeometry) { g.dispose(); continue; }
      if (!g || typeof g !== 'object') continue;
      for (const v of Object.values(g)) {
        if (v?.isBufferGeometry) v.dispose();
        else if (Array.isArray(v)) for (const x of v) { if (x?.isBufferGeometry) x.dispose(); else if (x?.geo?.isBufferGeometry) x.geo.dispose(); }
      }
    }
    this.geos.clear();
    this.shotMat.dispose();
  }
}

export { SPECIES };

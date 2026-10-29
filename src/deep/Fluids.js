// Water and lava in the underground (see docs/DEEP.md, "Optional systems"). This file ties the parts
// together and handles the mole and the bits in the water; the parts live in src/deep/fluids/:
//   sim.js       the flow (cellular automaton with levels in eighths, lakes as reservoirs, pools that
//                level out, films that soak away, lava that cools; saved per world)
//   water.js     the surface material (refraction over a copy of the scene, depth tint and fog,
//                foam, caustics through the water, reflections, glints, waterfalls; lava) + the copy
//   caustics.js  the water height map round the mole and the terrain patch that lights caustics
//                under water and wavering light on the walls above it
//   fx.js        particles and sounds: falls, spray, foam, drips from wet ceilings, bubbles, steam
//   lakes.js     lake levels and watertight shells at plan time (Generator)
//
// The mole in water: buoyancy springs it up to ride the waves (with a little overshoot), currents
// carry it along (and wading through shallow water slows it: FPSPlayer.flow / .wade), splashes and
// rings on the way in, a wake of rings and foam while swimming, bubbles from the snout under water,
// and under water the fog turns murky blue-green and every sound goes muffled. Rock chunks that fall
// in splash and sink; light finds (and bodies marked to float) bob on the surface and drift.
import * as THREE from 'three';
import { VOX, M } from './materials.js';
import { OPAQUE } from './Mesher.js';
import { fluidUniforms } from './TerrainMaterial.js';
import { ITEMS } from '../data/items.js';
import { FlowSim } from './fluids/sim.js';
import { makeWaterMaterial, WaterGrab, waterUniforms } from './fluids/water.js';
import { WaterMap, patchTerrain } from './fluids/caustics.js';
import { fxMethods, WATER_C } from './fluids/fx.js';

const UW_FOG = new THREE.Color(0.01, 0.05, 0.075);
const FLOATS = new Set(['food', 'plant', 'ingredient', 'feed', 'critter', 'drop', 'consumable']);
const WOODEN = new Set([M.TIMBER, M.BOARDS, M.LADDER, M.ROOTS, M.STEM, M.GLOWCAP, M.DOOR]);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const chance = (p) => Math.random() < p;
const rnd = (a, b) => a + Math.random() * (b - a);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class Fluids {
  constructor(ctx) {
    this.ctx = ctx;
    this.w = ctx.world;
    this.U = waterUniforms(fluidUniforms(ctx.U));
    this.fx = ctx.fx;
    this.audio = ctx.audio;
    this.bodies = ctx.bodies;
    this.t = 0;
    this.events = [];
    this.crumbs = [];
    this.imps = []; // falling water landing (foam in the shader)
    this.splashes = []; // splash points (foam rings, short-lived)
    this.jig = { x: 0, y: -9999, z: 0, h: 0, v: 0 };
    this.pIn = false; this.wakeT = 0; this.bubT = 0; this.wadeT = 0;
    this.uw = null; this.uwK = 0;
    this.loops = {};
    this.cur = { x: 0, y: 0, z: 0 };
    this.prof = { sim: 0, fx: 0, map: 0, all: 0 };
    this.splashY = 0;
    this.lifeAt = (x, z, tR) => (this.fluidAt(x, this.splashY - 0.05, z) ? tR + 0.03 : tR + 0.7);
    const plan = ctx.plan || this.w.plan;
    // the water look: the height map (caustics, flow), then the flow itself
    this.wmap = new WaterMap(this.U, this.w);
    this.sim = new FlowSim(this.w, plan, { touched: (ch) => this.wmap.touch(ch) });
    this.wmap.mdOf = (ch) => { const i = this.sim.slotOf.get(ch.key); return i === undefined ? null : this.sim.slots[i].md; };
    this.lakes = this.sim.lakes;
    // our surface material swapped into the terrain view; the terrain's own shader gets the water light
    this.grab = new WaterGrab();
    const tv = ctx.owner?.terrain;
    this.mat = null;
    this.oldMat = null;
    if (tv) {
      const old = tv.fluidMat;
      this.mat = tv.fluidMat = makeWaterMaterial(this.U, this.grab);
      for (const ch of this.w.chunks.values()) if (ch.fluidMesh) ch.fluidMesh.material = this.mat;
      this.oldMat = old !== this.mat ? old : null; // kept for before/after checks (debug.look('old'))
      this.U.wLook.value.w = patchTerrain(tv.mat, this.U) ? 1 : 0;
      // phones and the low settings: no reflections
      const q = ctx.owner?.game?.engine?.fx;
      this.U.wLook.value.z = q === 'low' || q === 'off' ? 0 : 1;
      if (q === 'off') this.wmap.off = true; // no caustics either
    }
    this.debug = {
      /** 'new' | 'old': the fluid surface material, for before/after comparisons */
      look: (k) => {
        const m = k === 'old' && this.oldMat ? this.oldMat : this.mat;
        if (tv && m) { tv.fluidMat = m; for (const ch of this.w.chunks.values()) if (ch.fluidMesh) ch.fluidMesh.material = m; }
        this.wmap.off = k === 'old';
        this.wmap.dirty = true; this.wmap.t = 0;
        return k;
      },
      /** pour fluid m (default water) into a ball of radius r (m) at (x, y, z); returns voxels filled */
      pour: (x, y, z, r = 0.3, m = M.WATER) => {
        let n = 0;
        const R = Math.ceil(r * VOX), cx = Math.floor(x * VOX), cy = Math.floor(y * VOX), cz = Math.floor(z * VOX);
        for (let dz = -R; dz <= R; dz++) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy + dz * dz <= R * R) n += this.sim.add(cx + dx, cy + dy, cz + dz, m, 8) ? 1 : 0;
        return n;
      },
      /** a spring at (x, y, z) pouring `rate` eighths a step (rate 0 removes the springs there) */
      spring: (x, y, z, rate = 8, m = M.WATER) => {
        const vx = Math.floor(x * VOX), vy = Math.floor(y * VOX), vz = Math.floor(z * VOX);
        this.sim.springs = this.sim.springs.filter((s) => s.vx !== vx || s.vy !== vy || s.vz !== vz);
        if (rate > 0) this.sim.springs.push({ vx, vy, vz, m, rate });
        return this.sim.springs.length;
      },
      sim: this.sim,
      stats: () => ({ prof: { ...this.prof }, simProf: { ...this.sim.prof }, ...this.sim.stats, cells: this.sim.cells, active: this.sim.active, lakes: this.sim.lakes.filter((L) => L.drained > 0).map((L) => ({ id: L.id, top: (L.top + 1) / VOX, drained: Math.round(L.drained), sink: L.sink })) }),
    };
  }

  /** Part-filled cells the flow is keeping (for stats). */
  get cells() { return this.sim.cells; }
  get stats() { return this.sim.stats; }
  get act() { return { size: this.sim.active }; }
  vox(vx, vy, vz) { return this.sim.vox(vx, vy, vz); }
  surfaceAt(x, y, z) { return this.sim.surfaceAt(x, y, z); }

  // ------------------------------------------------------------------ edits from the game
  onVoxel(vx, vy, vz, old, m) {
    if (this.sim.self) return;
    this.sim.onVoxel(vx, vy, vz, old, m);
    if (!m && OPAQUE[old]) this.crumb(vx, vy, vz);
  }

  // ------------------------------------------------------------------ per frame
  update(dt, { player, eye, time }) {
    this.t = time;
    dt = Math.min(dt, 0.1);
    const p = player.pos;
    const t0 = performance.now();
    this.sim.update(dt, p.x * VOX, p.y * VOX, p.z * VOX);
    const t1 = performance.now();
    this.runEvents();
    this.swim(dt, player, eye);
    this.bodyFx(dt);
    this.flowFx(dt, eye);
    this.impacts(dt, eye);
    this.ambient(dt, eye);
    this.crumbFx(dt);
    this.spring(dt);
    this.lakeUniforms(eye);
    const t2 = performance.now();
    this.wmap.update(dt, eye, time);
    const t3 = performance.now();
    this.sounds(dt, eye, player);
    this.underwater(dt, player, eye);
    // frame cost (ms, smoothed): the flow, the effects, the water map
    const P = this.prof, k = 0.1;
    P.sim += (t1 - t0 - P.sim) * k; P.fx += (t2 - t1 - P.fx) * k; P.map += (t3 - t2 - P.map) * k; P.all += (performance.now() - t0 - P.all) * k;
  }

  later(dt, fn) { this.events.push({ t: this.t + dt, fn }); }
  runEvents() {
    if (!this.events.length) return;
    const ev = this.events;
    this.events = [];
    for (const e of ev) if (e.t <= this.t) e.fn(); else this.events.push(e);
  }

  // ------------------------------------------------------------------ ripples and wobble
  /** A ripple ring at (x, y, z); k ≈ 0.1 (a drip) .. 1.5 (a cannonball); k < 0 starts as a bulge. */
  ripple(x, y, z, k) {
    const R = this.U.fRip.value, K = this.U.fRipK.value;
    let best = 0, bs = Infinity;
    for (let i = 0; i < 8; i++) {
      const age = this.t - R[i].w;
      const s = age > 4.5 || age < 0 ? -1 : Math.abs(K[i]) * Math.exp(-age * 1.5);
      if (s < bs) { bs = s; best = i; }
    }
    R[best].set(x, y, z, this.t);
    K[best] = k;
  }
  /** Set the jelly wobble going around (x, y, z). */
  kick(x, y, z, a) {
    const J = this.jig;
    if (Math.abs(J.h) < a * 0.6 || Math.hypot(J.x - x, J.z - z) < 2.5) { J.x = x; J.y = y; J.z = z; }
    J.v -= a * 14;
  }
  spring(dt) {
    const J = this.jig;
    const n = Math.ceil(dt / (1 / 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) { J.v += (-90 * J.h - 2.6 * J.v) * h; J.h += J.v * h; }
    if (Math.abs(J.h) < 1e-4 && Math.abs(J.v) < 1e-3) { J.h = 0; J.v = 0; }
    this.U.fJig.value.set(J.x, J.y, J.z, J.h);
  }
  /** The surface offset at a point: the shader's fsurf() in JS (so the mole bobs on the waves). */
  waveAt(x, y, z, lava, amp = 1) {
    const t = this.t, s = lava ? 0.4 : 1;
    const p1 = (x * 0.8 + z * 0.6) * 2.4 + t * 1.4 * s, p2 = (x * -0.45 + z * 0.89) * 3.6 - t * 1.9 * s, p3 = (x * 0.96 - z * 0.28) * 6.1 + t * 3.1;
    let h = amp * (0.011 * Math.sin(p1) + 0.007 * Math.sin(p2) + (lava ? 0 : 0.0035 * Math.sin(p3)));
    const R = this.U.fRip.value, K = this.U.fRipK.value;
    const spd = lava ? 0.5 : 1.3, kk = lava ? 8 : 14, damp = lava ? 1 : 1.6;
    for (let i = 0; i < 8; i++) {
      const k = K[i];
      if (!k) continue;
      const r = R[i], age = t - r.w;
      if (age < 0 || age > 4.5 || Math.abs(y - r.y) > 0.7) continue;
      const d = Math.hypot(x - r.x, z - r.z), front = age * spd + 0.12;
      if (d > front + 0.3) continue;
      const env = Math.exp(-age * damp) * (1 - sstep(front - 0.15, front + 0.3, d)) / (1 + d * 2.2);
      h += -0.075 * k * amp * env * Math.cos(kk * d - kk * spd * 0.9 * age);
    }
    const J = this.jig;
    if (J.h && Math.abs(y - J.y) < 0.7) {
      const qx = x - J.x, qz = z - J.z;
      h += J.h * amp * Math.exp(-(qx * qx + qz * qz) * 0.15) * Math.sin(qx * 3.3 + 0.7) * Math.sin(qz * 2.9 + 1.3);
    }
    return h;
  }

  lakeUniforms(eye) {
    const LK = this.U.fLake.value, LD = this.U.fLakeDrop.value;
    LD[0] = LD[1] = 0;
    let j = 0;
    const list = this.lakes.filter((L) => L.debt > 0 && L.cells && L.cells.length).sort((a, b) => Math.hypot(a.x - eye.x, a.z - eye.z) - Math.hypot(b.x - eye.x, b.z - eye.z));
    for (const L of list) {
      if (j >= 2) break;
      LK[j].set(L.x, (L.top + 1) / VOX, L.z, L.r);
      LD[j] = Math.min(1, L.debt / (L.cells.length * 4)) / VOX;
      j++;
    }
  }

  // ------------------------------------------------------------------ the mole in fluid
  swim(dt, pl, eye) {
    const p = pl.pos, fx = this.fx;
    const inF = pl.inWater || pl.inLava;
    const lava = !pl.inWater && pl.inLava;
    const feet = this.fluidAt(p.x, p.y + 0.03, p.z);
    const sy = inF ? this.surfaceAt(p.x, p.y + (lava ? 0.1 : 0.45), p.z) : feet === 1 ? this.surfaceAt(p.x, p.y + 0.03, p.z) : null;
    // wading: shallow water drags at the legs (FPSPlayer reads .wade); currents carry you (.flow)
    pl.wade = !pl.inWater && feet === 1 && sy !== null ? clamp((sy - p.y - 0.03) / 0.38, 0, 1) : 0;
    const cur = this.cur;
    if (!pl.flow) pl.flow = new THREE.Vector3();
    if ((pl.inWater || pl.wade > 0) && this.sim.flowAt(p.x, p.y + (pl.inWater ? 0.45 : 0.03), p.z, cur)) {
      const k = pl.inWater ? 1.7 : 0.9, sp = Math.hypot(cur.x, cur.z) * k, lim = sp > 1.4 ? 1.4 / sp : 1;
      pl.flow.x += (cur.x * k * lim - pl.flow.x) * Math.min(1, dt * 3);
      pl.flow.z += (cur.z * k * lim - pl.flow.z) * Math.min(1, dt * 3);
      if (pl.inWater && cur.y < 0) pl.vel.y += cur.y * 5 * dt; // falling water pushes you under
    } else pl.flow.multiplyScalar(Math.max(0, 1 - dt * 4));
    if (inF && !this.pIn) {
      // the splash on the way in
      const y = sy ?? p.y + 0.45;
      const spd = Math.max(0, -pl.vel.y);
      const k = clamp(0.35 + spd / 5, 0.35, 1.6);
      this.ripple(p.x, y, p.z, lava ? k * 0.6 : k);
      this.kick(p.x, y, p.z, (lava ? 0.012 : 0.03) * k);
      this.splashY = y;
      if (!lava) {
        fx.crown(p.x, y, p.z, k, WATER_C, this.lifeAt);
        this.splashes.push({ x: p.x, y, z: p.z, k: Math.min(1, 0.5 + k * 0.4) });
        if (spd < 2) this.audio?.play('splash', { vol: 0.35 + k * 0.3 });
        for (let i = 0; i < 6 * k; i++) fx.bubble(p.x + rnd(-0.2, 0.2), y - rnd(0.1, 0.5), p.z + rnd(-0.2, 0.2), rnd(0.3, 0.7));
      } else {
        for (let i = 0; i < 8; i++) fx.lavaBlob(p.x, y + 0.03, p.z, rnd(-1.2, 1.2), rnd(1.5, 3.5), rnd(-1.2, 1.2), 0.025);
        for (let i = 0; i < 5; i++) fx.steam(p.x + rnd(-0.3, 0.3), y + 0.05, p.z + rnd(-0.3, 0.3), 1, [0.5, 0.42, 0.4]);
        this.audio?.play('sizzle');
      }
    }
    this.pIn = inF;
    // wading: each step splashes a little and rings the water
    if (pl.wade > 0.08 && pl.speed > 0.5 && sy !== null) {
      this.wadeT -= dt * pl.speed;
      if (this.wadeT <= 0) {
        this.wadeT = 0.85;
        this.ripple(p.x, sy, p.z, 0.18 + pl.wade * 0.2);
        this.splashY = sy;
        for (let i = 0; i < 3 + pl.wade * 4; i++) { const vy = rnd(0.6, 1.4), a = Math.random() * 6.283, s = rnd(0.2, 0.6); fx.droplet(p.x + Math.cos(a) * 0.15, sy + 0.01, p.z + Math.sin(a) * 0.15, Math.cos(a) * s + pl.vel.x * 0.3, vy, Math.sin(a) * s + pl.vel.z * 0.3, (2 * vy) / 9.8 + 0.03); }
        for (let i = 0; i < 3; i++) { const a = Math.random() * 6.283; fx.foam(p.x + Math.cos(a) * 0.2, sy + 0.01, p.z + Math.sin(a) * 0.2, Math.cos(a) * 0.3, Math.sin(a) * 0.3); }
        this.audio?.play('swim', { vol: 0.25 + pl.wade * 0.3 });
      }
    }
    if (!inF) { this.wakeT = 0; return; }
    const moving = pl.speed > 0.4;
    // wake rings and foam behind the swimming mole; small ones while floating still
    this.wakeT -= dt;
    if (this.wakeT <= 0 && sy !== null) {
      this.wakeT = moving ? 0.3 : 1.1;
      this.ripple(p.x, sy, p.z, lava ? 0.25 : moving ? 0.32 : 0.14);
      if (!lava) {
        for (let i = 0; i < (moving ? 6 : 2); i++) { const a = Math.random() * 6.283, s = rnd(0.2, 0.6); fx.foam(p.x + Math.cos(a) * 0.2, sy + 0.01, p.z + Math.sin(a) * 0.2, Math.cos(a) * s, Math.sin(a) * s); }
        if (moving && !pl.headUnder) {
          this.audio?.play('swim', { vol: 0.6 });
          this.splashY = sy;
          this.splashes.push({ x: p.x, y: sy, z: p.z, k: 0.3 });
          for (let i = 0; i < 3; i++) { const vy = rnd(0.8, 1.6), tR = (2 * vy) / 9.8; fx.droplet(p.x + rnd(-0.2, 0.2), sy + 0.02, p.z + rnd(-0.2, 0.2), rnd(-0.5, 0.5) + pl.vel.x * 0.3, vy, rnd(-0.5, 0.5) + pl.vel.z * 0.3, tR + 0.03); }
        }
      } else if (chance(0.5)) fx.lavaBlob(p.x, sy + 0.02, p.z, rnd(-0.6, 0.6), rnd(1, 2), rnd(-0.6, 0.6), 0.02);
    }
    // float: buoyancy springs the mole up to ride the waves (with a little overshoot); looking down
    // while swimming (or holding crouch) dives
    if (pl.inWater && sy !== null) {
      const h = sy + this.waveAt(p.x, sy, p.z, false) + Math.sin(this.t * 1.9) * 0.018;
      const target = h - 0.5;
      const diving = (pl.pitch < -0.45 && moving) || pl.diving;
      if (!diving && !(pl.grounded && target < p.y + 0.04)) {
        const err = clamp(target - p.y, -0.4, 0.5);
        pl.vel.y += (err * 28 - pl.vel.y * 2 + 2.7) * dt;
      }
    }
    // bubbles from the snout under water
    if (pl.headUnder) {
      this.bubT -= dt;
      if (this.bubT <= 0) {
        this.bubT = rnd(0.25, 0.8);
        const f = pl.forward();
        const top = this.surfaceAt(eye.x, eye.y, eye.z) ?? eye.y + 0.5;
        const life = this.riseTime(Math.max(0.05, top - eye.y + 0.1));
        for (let i = 0; i < 1 + (Math.random() * 3 | 0); i++) fx.bubble(eye.x + f.x * 0.2 + rnd(-0.03, 0.03), eye.y - 0.06, eye.z + f.z * 0.2 + rnd(-0.03, 0.03), life * rnd(0.9, 1.1));
        if (chance(0.5)) this.audio?.play('bubble', { vol: 0.5 });
      }
    }
  }

  /** Rock chunks and finds that fall in: a splash, then rocks sink, light things bob and drift. */
  bodyFx(dt) {
    const list = this.bodies?.list;
    if (!list || !list.length) return;
    const cur = this.cur;
    for (const b of list) {
      if (!b.pos || !b.vel) continue;
      if (b.pickup && b.t > (b.pickup.delay ?? 0.7) && b.t !== 5) { b._fl = 0; continue; } // flying to the bag
      const inF = this.fluidAt(b.pos.x, b.pos.y, b.pos.z) ? this.sim.vox(Math.floor(b.pos.x * VOX), Math.floor(b.pos.y * VOX), Math.floor(b.pos.z * VOX)) : 0;
      if (inF && !b._fl) {
        const sy = this.surfaceAt(b.pos.x, b.pos.y, b.pos.z) ?? b.pos.y;
        const sp = b.vel.length();
        const k = clamp(0.2 + (b.n || 8) / 300 + sp / 10, 0.2, 1.2);
        this.ripple(b.pos.x, sy, b.pos.z, inF === M.LAVA ? k * 0.6 : k);
        this.kick(b.pos.x, sy, b.pos.z, 0.012 * k);
        this.splashY = sy;
        if (inF === M.WATER) {
          this.fx.crown(b.pos.x, sy, b.pos.z, k * 0.7, WATER_C, this.lifeAt);
          this.splashes.push({ x: b.pos.x, y: sy, z: b.pos.z, k: k * 0.7 });
          this.audio?.play('splash', { vol: 0.3 + k * 0.4 });
        } else {
          for (let i = 0; i < 4 + 4 * k; i++) this.fx.lavaBlob(b.pos.x, sy + 0.02, b.pos.z, rnd(-1, 1), rnd(1.2, 3), rnd(-1, 1), 0.022);
          for (let i = 0; i < 4; i++) this.fx.steam(b.pos.x, sy + 0.05, b.pos.z, 0.8, [0.5, 0.42, 0.4]);
          this.audio?.play('sizzle');
        }
      }
      if (inF) {
        const lava = inF === M.LAVA;
        const floats = !lava && (b.float || WOODEN.has(b.mat) || (b.pickup && FLOATS.has(ITEMS[b.pickup.id]?.cat)));
        if (floats) {
          // bob at the surface (Bodies pulls down at 14 m/s²: we hold it up and spring it level)
          const sy = this.surfaceAt(b.pos.x, b.pos.y, b.pos.z) ?? b.pos.y;
          const target = sy + this.waveAt(b.pos.x, sy, b.pos.z, false) - b.r * 0.35;
          b.vel.y += ((target - b.pos.y) * 30 - b.vel.y * 5 + 14) * dt;
          b.vel.x *= Math.max(0, 1 - 1.5 * dt); b.vel.z *= Math.max(0, 1 - 1.5 * dt);
          if (b.spin) b.spin.multiplyScalar(Math.max(0, 1 - 3 * dt));
          if (!b.pickup) b.t = Math.min(b.t, Math.max(0, (b.life ?? 2) - 0.5)); // driftwood stays a while
        } else {
          b.vel.multiplyScalar(Math.max(0, 1 - (lava ? 5 : 3.2) * dt));
          b.vel.y += (lava ? 12 : 9.5) * dt;
          if (b.spin) b.spin.multiplyScalar(Math.max(0, 1 - 2 * dt));
          if (!lava && chance(dt * 6)) this.fx.bubble(b.pos.x, b.pos.y, b.pos.z, rnd(0.2, 0.5));
          if (lava && chance(dt * 6)) this.fx.ember(b.pos.x, b.pos.y + 0.05, b.pos.z);
        }
        // the current carries it along
        if (!lava && this.sim.flowAt(b.pos.x, b.pos.y, b.pos.z, cur)) { b.vel.x += (cur.x * 1.6 - b.vel.x) * Math.min(1, dt * 2); b.vel.z += (cur.z * 1.6 - b.vel.z) * Math.min(1, dt * 2); }
      }
      b._fl = inF;
    }
  }

  // ------------------------------------------------------------------ sound
  sounds(dt, eye, pl) {
    const A = this.audio;
    if (!A?.loop) return;
    this.sndT = (this.sndT || 0) - dt;
    if (this.sndT > 0) return;
    this.sndT = 0.25;
    // running water: falling streams near the ear, and how much is on the move
    let flow = 0;
    const F = this.sim.falls;
    for (let j = 0; j < F.length; j += 4) if (F[j + 3] === M.WATER && Math.abs(F[j] - eye.x) + Math.abs(F[j + 1] - eye.y) + Math.abs(F[j + 2] - eye.z) < 10) flow++;
    const act = Math.min(1, this.sim.active / 400);
    let wv = clamp(flow / 16 + act * 0.45, 0, 1) * 0.6;
    if (pl?.headUnder) wv = Math.max(wv, 0.25); // under water: the murmur all round
    // lava close by (a lake's surface or a flow)
    let ld = 99;
    for (const L of this.lakes) if (L.fluid === M.LAVA && !L.dry) ld = Math.min(ld, Math.max(0, Math.hypot(L.x - eye.x, L.z - eye.z) - L.r) + Math.abs((L.top + 1) / VOX - eye.y) * 0.5);
    const S = this.sim.spots;
    for (let j = 0; j < S.length; j += 3) ld = Math.min(ld, Math.hypot(S[j] - eye.x, S[j + 1] - eye.y, S[j + 2] - eye.z));
    const lv = clamp(1 - ld / 9, 0, 1) * 0.45;
    for (const [name, vol] of [['water', wv], ['lava', lv]]) {
      const h = this.loops[name];
      if (vol > 0.02 && !h) this.loops[name] = A.loop(name, { vol });
      else if (h && vol <= 0.02) { h.stop(0.6); this.loops[name] = null; }
      else if (h) h.set({ vol });
    }
  }

  /** Muffle every sound (a low-pass on the master bus) by k (0 = clear, 1 = deep under water). */
  muffle(k) {
    const A = this.audio, ctx = A?.ctx;
    if (!ctx || !A.master || !A.comp) return;
    if (!this.lp) {
      if (k < 0.01) return;
      this.lp = ctx.createBiquadFilter();
      this.lp.type = 'lowpass';
      this.lp.Q.value = 0.8;
      this.lp.frequency.value = 18000;
    }
    const f = 18000 * Math.pow(420 / 18000, clamp(k, 0, 1));
    if (k >= 0.01 && !this.lpOn) {
      try { A.master.disconnect(A.comp); } catch (e) { /* already apart */ }
      A.master.connect(this.lp);
      this.lp.connect(A.comp);
      this.lpOn = true;
    }
    if (this.lpOn) this.lp.frequency.setTargetAtTime(f, ctx.currentTime, 0.06);
    if (k < 0.01 && this.lpOn) {
      try { A.master.disconnect(this.lp); this.lp.disconnect(); } catch (e) { /* noop */ }
      A.master.connect(A.comp);
      this.lpOn = false;
    }
  }

  /** Head under water: the fog turns murky blue-green, sounds go muffled (both restored on surfacing). */
  underwater(dt, pl, eye) {
    const U = this.U;
    const want = pl.headUnder ? 1 : 0;
    this.uwK += (want - this.uwK) * Math.min(1, dt * 8);
    this.muffle(this.uwK > 0.02 ? this.uwK : 0);
    if (this.uwK > 0.002) {
      const s = this.uw || (this.uw = { col: U.fogCol.value.clone(), dist: U.fogDist.value, setCol: new THREE.Color(-1, -1, -1), setDist: -1 });
      // somebody else changed the fog meanwhile (a new zone): that's the colour to come back to
      if (s.setDist >= 0 && !U.fogCol.value.equals(s.setCol)) s.col.copy(U.fogCol.value);
      if (s.setDist >= 0 && U.fogDist.value !== s.setDist) s.dist = U.fogDist.value;
      U.fogCol.value.copy(s.col).lerp(UW_FOG, this.uwK);
      U.fogDist.value = s.dist + (5.5 - s.dist) * this.uwK;
      s.setCol.copy(U.fogCol.value); s.setDist = U.fogDist.value;
      // specks drifting in the murk, catching the lamp
      if (pl.headUnder && chance(dt * 10)) {
        const f = pl.forward(), d = rnd(0.4, 2.2);
        this.fx.bubble(eye.x + f.x * d + rnd(-0.5, 0.5), eye.y + f.y * d + rnd(-0.4, 0.3), eye.z + f.z * d + rnd(-0.5, 0.5), rnd(0.6, 1.4), [0.55, 0.75, 0.7]);
      }
    } else if (this.uw) this.restoreFog();
  }
  restoreFog() {
    const s = this.uw, U = this.U;
    if (!s) return;
    if (U.fogCol.value.equals(s.setCol)) U.fogCol.value.copy(s.col);
    if (U.fogDist.value === s.setDist) U.fogDist.value = s.dist;
    this.uw = null;
    this.uwK = 0;
  }

  // ------------------------------------------------------------------ light
  /** Up to 3 lights for the nearest lava surfaces (lake shores and flows), pulsing. */
  lights(eye) {
    const out = [];
    const t = this.t;
    for (const L of this.lakes) {
      if (L.fluid !== M.LAVA || L.dry) continue;
      const sy = (L.top + 1) / VOX;
      const dx = eye.x - L.x, dz = eye.z - L.z, d = Math.hypot(dx, dz) || 1;
      const k = d > L.r * 0.8 ? (L.r * 0.8) / d : 1;
      const x = L.x + dx * k, z = L.z + dz * k;
      const dist = Math.hypot(x - eye.x, sy - eye.y, z - eye.z);
      if (dist > 16) continue;
      const p = 0.82 + 0.13 * Math.sin(t * 2.1 + L.id) + 0.05 * Math.sin(t * 6.7 + L.id * 3);
      out.push({ x, y: sy + 0.5, z, c: [1.5 * p, 0.5 * p, 0.12 * p], r: 5.5, d: dist });
    }
    // flowing lava: a light for each of the two nearest spots (a few meters apart)
    const S = this.sim.spots, spots = [];
    for (let j = 0; j < S.length; j += 3) {
      const x = S[j], y = S[j + 1], z = S[j + 2], d = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
      if (d > 14 || spots.some((s) => Math.abs(s.x - x) + Math.abs(s.z - z) < 2.5)) continue;
      spots.push({ x, y, z, d });
    }
    spots.sort((a, b) => a.d - b.d);
    for (const s of spots.slice(0, 2)) {
      const p = 0.8 + 0.15 * Math.sin(t * 2.6 + s.x) + 0.05 * Math.sin(t * 9.1 + s.z);
      out.push({ x: s.x, y: s.y + 0.3, z: s.z, c: [1.3 * p, 0.42 * p, 0.1 * p], r: 3.5, d: s.d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, 3);
  }

  dispose() {
    for (const h of Object.values(this.loops)) h?.stop(0.3);
    this.loops = {};
    this.restoreFog();
    this.muffle(0);
    const U = this.U;
    U.fRipK.value.fill(0);
    U.fLakeDrop.value.fill(0);
    U.fJig.value.set(0, -9999, 0, 0);
    this.sim.dispose();
    this.grab.dispose();
    this.wmap.dispose();
    this.oldMat?.dispose();
    this.events = [];
  }
}

Object.assign(Fluids.prototype, fxMethods);

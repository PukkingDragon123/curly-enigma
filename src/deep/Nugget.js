// Nugget and her walking coop in the mine. The coop (a little hut on chicken legs, Nugget peeking
// from its window) follows the mole along the way it walked (a breadcrumb trail, cutting corners
// where it can), hops small ledges, and keeps a step behind.
//  - Hunger: Nugget gets hungry as you dig (data.coop.food, core/inventory.js). Fed, she follows
//    and now and then lays an egg (onto the coop's shelves, or out of the door when they're full).
//    Hungry, the coop sits down and sulks and won't follow until fed.
//  - Stuck: a ledge too tall to hop, a crawlway too low, deep water, a pit: the coop flails and
//    Nugget calls for you. Carry it: E picks it up (held in front of you, you walk slower), E puts it
//    down again.
//  - E on the coop: feed her (when she's hungry or peckish and you carry hen food), pick her up
//    (stuck or sulking), else open the coop's shelves next to your backpack.
//
// Contract with DigScene (like Props): target(eye, dir, reach) → null | { label, kind: 'use' };
// use(eye, dir, reach) → null | events (DigScene.events); update(dt); carrying (bool, the mole walks
// ×0.7); coopNear() (the backpack shows the coop side by side); radarMarkers(); lights(eye);
// dispose(). Test hooks: nugget.debug.* (see the bottom).
import * as THREE from 'three';
import { makeCoop } from '../gfx/char/coop.js';
import { CoopGear } from '../gfx/char/coopGear.js';
import * as W from '../core/weight.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { VOX, MAT } from './materials.js';
import { ITEMS } from '../data/items.js';
import * as Inv from '../core/inventory.js';

const R = 0.2; // collision half-width (the legs and sill; the roof overhang may brush walls)
const HB = 0.6; // collision height (the small coop)
const GRAV = 12;
const HOP = 0.46; // highest ledge she hops up
const FOLLOW = 1.5; // how far behind she keeps
const COOP_H = 0.62; // ridge height (m): a small old coop
const REACH_NEAR = 2.3; // backpack + coop side by side within this
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _box = new THREE.Box3();
const _ray = new THREE.Ray();

const STUCK_SAY = {
  ledge: 'is stuck at a ledge too tall for her legs!',
  crawl: 'can\'t squeeze into that low crawlway!',
  water: 'is floundering in deep water!',
  pit: 'fell in a pit and can\'t hop out!',
};

export class Nugget {
  /** ctx: { scene3, world, player, audio, fx, owner } (owner: the DigScene) */
  constructor(ctx) {
    this.c = ctx;
    this.st = ctx.owner?.state || ctx.state;
    this.ui = ctx.owner?.game?.ui || ctx.ui;
    this.coop = makeCoop({ height: COOP_H, kind: 'toon' });
    this.gear = new CoopGear(this.coop); // the parts built onto her coop, and her cargo
    this.root = this.coop.root;
    this.hen = this.coop.hen;
    ctx.scene3.add(this.root);
    // she's lit by real lights (the terrain shades itself): the helmet lamp and the cave's glow
    this.amb = new THREE.AmbientLight(0xffffff, 0.6);
    this.lamp = new THREE.PointLight(0xffd8a8, 3, 9, 1.4);
    ctx.scene3.add(this.amb, this.lamp);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.mode = 'follow'; // follow | sulk | stuck | carried
    this.stuckKind = null;
    this.carrying = false;
    this.trail = [];
    this.lastTrail = new THREE.Vector3(1e9, 0, 0);
    this.blockedT = 0;
    this.progress = { t: 0, x: 0, z: 0 };
    this.callT = 2;
    this.cluckT = 3;
    this.retryT = 0;
    this.lostT = 0;
    this.panelOpen = false;
    this.facing = 0;
    this.coop.onStep = (side, k) => this.step(k);
    this.coop.onJingle = (k) => { if (this.near(6)) ctx.audio.tone?.({ f: 2093 * (0.97 + Math.random() * 0.06), type: 'sine', dur: 0.25, vol: 0.025 * k, reverb: 0.3 }); };
    this.coop.onEgg = (p) => this.eggOut(p);
    Inv.coopSlots(this.st);
    this.placeNear(ctx.player.pos, 1.3);
    this.facing = ctx.player.yaw + Math.PI;
    this.coop.face(this.facing, true);
    if (Inv.henMood(this.st) === 'hungry') this.setMode('sulk');
    this.debug = this.makeDebug();
  }

  // ------------------------------------------------------------------ world queries
  solid(x, y, z) { return this.c.world.solidAt(x, y, z); }
  hits(x, y, z, h = HB) {
    for (const oy of [0.04, h * 0.4, h * 0.75, h]) for (const ox of [-R, 0, R]) for (const oz of [-R, 0, R]) if (this.solid(x + ox, y + oy, z + oz)) return true;
    return false;
  }
  fluidDepth(x, y, z) {
    const w = this.c.world;
    let d = 0;
    for (let k = 0; k < 10; k++) {
      const m = w.matAt(x, y + k * 0.08 + 0.02, z);
      if (!(MAT[m]?.fluid)) break;
      d += 0.08;
    }
    return d;
  }
  ground(x, y, z) { return this.solid(x, y - 0.06, z) || this.solid(x + R * 0.7, y - 0.06, z) || this.solid(x - R * 0.7, y - 0.06, z) || this.solid(x, y - 0.06, z + R * 0.7) || this.solid(x, y - 0.06, z - R * 0.7); }

  /** Put her on free ground near p (behind the mole if possible). */
  placeNear(p, dist) {
    const pl = this.c.player;
    const back = Math.atan2(Math.sin(pl.yaw), Math.cos(pl.yaw));
    for (const dd of [dist, dist * 0.7, dist * 1.4, 0.6]) for (let i = 0; i < 16; i++) {
      const a = back + (i % 2 ? 1 : -1) * Math.floor((i + 1) / 2) * 0.45;
      const x = p.x + Math.sin(a) * dd, z = p.z + Math.cos(a) * dd;
      for (let dy = 0.7; dy >= -0.9; dy -= 1 / VOX) {
        const y = p.y + dy;
        if (!this.hits(x, y, z) && this.ground(x, y, z)) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.trail.length = 0; return true; }
      }
    }
    this.pos.copy(p);
    this.trail.length = 0;
    return false;
  }

  near(d = REACH_NEAR) {
    const p = this.c.player.pos;
    return Math.hypot(this.pos.x - p.x, (this.pos.y - p.y) * 0.7, this.pos.z - p.z) < d;
  }
  /** For the backpack: show the coop's shelves next to the pockets. */
  coopNear() { return this.carrying || this.near(REACH_NEAR); }
  inView() {
    const cam = this.c.owner.camera;
    _v.copy(this.pos).setY(this.pos.y + 0.4).project(cam);
    return _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
  }

  setMode(m, kind = null) {
    if (this.mode === m && this.stuckKind === kind) return;
    const prev = this.mode;
    this.mode = m;
    this.stuckKind = kind;
    this.blockedT = 0;
    this.coop.play(m === 'sulk' ? 'sit' : m === 'stuck' ? 'stuck' : m === 'carried' ? 'carried' : 'idle');
    if (m === 'stuck' && prev !== 'stuck') {
      this.c.audio.play('bawk', { pitch: 1.1 });
      const name = this.st.data.chicken?.name || 'Nugget';
      this.c.owner.say?.('nugstuck', `<b>${name}</b> ${STUCK_SAY[kind] || 'is stuck!'} Go back and carry her (<b>E</b>).`, 'warn', 20);
      this.callT = 2.5;
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const pl = this.c.player, o = this.c.owner, st = this.st;
    dt = Math.min(dt, 0.1);
    // lights follow the helmet lamp and the zone's ambient glow
    const eye = pl.eye(_w);
    this.lamp.position.copy(eye);
    if (o.U?.ambient) this.amb.color.copy(o.U.ambient.value).multiplyScalar(5);
    // hunger: she gets hungry while she's along on a dig (not while you carry her about)
    // the Nugget skill line: she gets hungry slower, lays and finds more (skills part)
    const sk = st.skill?.('nugget') || 1;
    const fed = Inv.tickHen(st, dt, { rate: (this.mode === 'carried' ? 1 / 1500 : 1 / 720) / sk, lay: this.mode === 'follow', layK: sk });
    if (fed === 'egg') this.coop.layEgg();
    if (this.mode === 'follow' && this.grounded) this.scratch(dt, sk);
    const mood = Inv.henMood(st);
    if (mood === 'hungry' && this.mode === 'follow') {
      this.setMode('sulk');
      const name = st.data.chicken?.name || 'Nugget';
      o.say?.('nughungry', `<b>${name}</b> is hungry and sits down in a sulk. Feed her (<b>E</b>): chicken feed, worms, grubs or seeds.`, 'warn', 30);
      this.c.audio.play('cluck', { pitch: 0.8, n: 2 });
    } else if (mood !== 'hungry' && this.mode === 'sulk') this.setMode('follow');
    if (mood === 'peckish' && !this.saidPeckish) { this.saidPeckish = true; o.say?.('nugpeck', `${st.data.chicken?.name || 'Nugget'} is getting peckish.`, 'warn', 60); }
    if (mood !== 'peckish' && mood !== 'hungry') this.saidPeckish = false;
    // breadcrumbs where the mole walks
    if ((pl.grounded || pl.inWater) && pl.pos.distanceTo(this.lastTrail) > 0.28) {
      this.lastTrail.copy(pl.pos);
      this.trail.push({ x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, low: !!pl.crouched, swim: !!pl.inWater, climb: !!pl.climbing });
      if (this.trail.length > 240) this.trail.splice(0, this.trail.length - 240);
    }

    // what's built on, and how loaded she is (legs, hop, the cargo on the racks)
    this.dressT = (this.dressT || 0) - dt;
    if (this.dressT <= 0) {
      this.dressT = 0.4;
      this.load = Inv.coopLoad(st);
      this.legs = W.coopLegs(st);
      this.gear.set(W.coopLevels(st), this.load.r);
      this.lampLv = W.coopUp(st, 'lamp').light;
    }
    if (this.mode === 'carried') this.updateCarried(dt);
    else this.updateWalk(dt);

    // calling for help
    if (this.mode === 'stuck' || this.mode === 'sulk') {
      this.callT -= dt;
      if (this.callT <= 0) {
        const far = this.pos.distanceTo(pl.pos);
        this.callT = this.mode === 'stuck' ? 3 + Math.random() * 2 : 7 + Math.random() * 5;
        const vol = Math.max(0.15, 1 - far / 30);
        if (this.mode === 'stuck') this.c.audio.play('bawk', { pitch: 1 + Math.random() * 0.2, vol });
        else this.c.audio.play('cluck', { pitch: 0.75, n: 2, vol });
        if (this.mode === 'stuck' && far > 12) o.say?.('nugfar', `You hear ${st.data.chicken?.name || 'Nugget'} squawking somewhere behind you.`, 'warn', 25);
      }
    } else {
      this.cluckT -= dt;
      if (this.cluckT <= 0) { this.cluckT = 6 + Math.random() * 10; if (this.near(5)) this.c.audio.play('cluck', { vol: 0.3, pitch: mood === 'happy' ? 1.1 : 1 }); }
    }
    this.coop.setDoor(this.panelOpen ? 1 : 0);
    this.coop.update(dt, this.anim || { speed: 0 });
  }

  updateWalk(dt) {
    const pl = this.c.player, p = this.pos, v = this.vel;
    const follow = this.mode === 'follow';
    // where to go: along the trail toward the mole, a step behind
    let tx = p.x, tz = p.z, ty = p.y, speed = 0;
    if (follow) {
      // drop breadcrumbs she's passed, and skip ahead where the way is clear
      while (this.trail.length && Math.hypot(this.trail[0].x - p.x, this.trail[0].z - p.z) < 0.3 && Math.abs(this.trail[0].y - p.y) < 0.6) this.trail.shift();
      for (let k = 0; k < 3 && this.trail.length > 1; k++) {
        if (this.clearTo(this.trail[1])) this.trail.shift(); else break;
      }
      const dPl = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
      const direct = dPl < 3.2 && Math.abs(pl.pos.y - p.y) < 0.5 && this.clearTo(pl.pos);
      let left = 0; // trail length still to walk
      if (this.trail.length) {
        let qx = p.x, qz = p.z;
        for (const t of this.trail) { left += Math.hypot(t.x - qx, t.z - qz); qx = t.x; qz = t.z; }
      }
      if (direct) { this.trail.length = 0; left = dPl; tx = pl.pos.x; tz = pl.pos.z; ty = pl.pos.y; }
      else if (this.trail.length) { tx = this.trail[0].x; tz = this.trail[0].z; ty = this.trail[0].y; }
      else { tx = pl.pos.x; tz = pl.pos.z; ty = pl.pos.y; left = dPl; }
      if (left > FOLLOW) speed = (left > 5 ? 3.9 : left > 2.6 ? 3 : 1.9) * (this.legs?.speed ?? 1) * (1 - (1 - (this.load?.speed ?? 1)) * 0.7);
      // the next step is a crawlway or deep water: she can't go there
      const nx = this.trail[0];
      if (nx && left > FOLLOW && Math.hypot(nx.x - p.x, nx.z - p.z) < 0.9) {
        if (nx.swim && this.fluidDepth(nx.x, nx.y - 0.3, nx.z) > 0.45) this.blockedT += dt * 2;
        if (nx.low && this.hits(nx.x, nx.y, nx.z)) this.blockedT += dt * 2;
      }
    }
    const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
    if (dist < 0.08) speed = 0;
    const ux = dist > 1e-4 ? dx / dist : 0, uz = dist > 1e-4 ? dz / dist : 0;
    const ax = this.grounded ? 14 : 4;
    v.x += THREE.MathUtils.clamp(ux * speed - v.x, -ax * dt, ax * dt);
    v.z += THREE.MathUtils.clamp(uz * speed - v.z, -ax * dt, ax * dt);
    // water: she floats, legs paddling
    const depth = this.fluidDepth(p.x, p.y, p.z);
    if (depth > 0.3) { v.y += (Math.min(depth, 0.6) * 30 - GRAV) * dt; v.y *= 1 - dt * 3; v.x *= 1 - dt * 2; v.z *= 1 - dt * 2; }
    else v.y -= GRAV * dt;
    if (!this.grounded && v.y < -3.5) v.y = -3.5; // a hen in the window flapping slows the drop
    // move per axis; a blocked step hops up if there's headroom
    let blocked = false;
    const nx = p.x + v.x * dt;
    if (this.hits(nx, p.y, p.z)) { blocked = true; v.x = 0; } else p.x = nx;
    const nz = p.z + v.z * dt;
    if (this.hits(p.x, p.y, nz)) { blocked = true; v.z = 0; } else p.z = nz;
    const ny = p.y + v.y * dt;
    const wasAir = !this.grounded, fall = -v.y;
    if (this.hits(p.x, ny, p.z)) {
      if (v.y < 0) {
        this.grounded = true;
        p.y = Math.ceil(ny * VOX) / VOX - 0.0001;
        for (let k = 0; k < 4 && this.hits(p.x, p.y, p.z); k++) p.y += 1 / VOX;
        if (wasAir && fall > 2) { this.coop.land(fall); this.c.audio.play('thud', { vol: Math.min(0.6, fall / 8) }); this.c.fx?.dust?.(p.x, p.y + 0.03, p.z, 6, [0.5, 0.42, 0.34], 0.15); }
      }
      v.y = 0;
    } else { p.y = ny; this.grounded = false; }
    if (blocked && this.grounded && speed > 0) {
      const hop = (this.legs?.hop ?? HOP) - ((this.load?.r ?? 0) > 1 ? 0.08 : 0);
      if (!this.hits(p.x + ux * 0.18, p.y + hop, p.z + uz * 0.18)) { v.y = 3.7 * Math.sqrt(hop / HOP); this.grounded = false; this.coop.hop(); this.c.audio.play('cluck', { vol: 0.25, n: 1 }); }
      else this.blockedT += dt;
    }
    // no progress for a while: she's stuck (what's in the way decides how)
    const pr = this.progress;
    pr.t += dt;
    if (pr.t > 1.2) {
      const moved = Math.hypot(p.x - pr.x, p.z - pr.z);
      if (speed > 0 && moved < 0.12) this.blockedT += 1.2;
      else if (moved > 0.3) this.blockedT = Math.max(0, this.blockedT - 1.2);
      pr.t = 0; pr.x = p.x; pr.z = p.z;
    }
    if (follow && this.blockedT > 2.4) this.setMode('stuck', this.whyStuck(tx, ty, tz, depth));
    if (follow && depth > 0.45) this.setMode('stuck', 'water');
    // stuck: try again now and then (a ramp dug, the water drained)
    if (this.mode === 'stuck') {
      this.retryT += dt;
      if (this.retryT > 5 && depth < 0.3) { this.retryT = 0; this.mode = 'follow'; this.blockedT = 1.2; this.coop.play('idle'); }
    } else this.retryT = 0;
    // following but lost (far, out of sight, not stuck): pop back to the mole's heels
    const far = Math.hypot(pl.pos.x - p.x, pl.pos.y - p.y, pl.pos.z - p.z);
    if (follow && (far > 22 || p.y < pl.pos.y - 12) && !this.inView()) {
      this.lostT += dt;
      if (this.lostT > 2) { this.placeNear(pl.pos, 1.3); this.lostT = 0; this.blockedT = 0; }
    } else this.lostT = 0;
    // pose
    const sp = Math.hypot(v.x, v.z);
    if (sp > 0.2) this.facing = Math.atan2(v.x, v.z);
    else if (this.mode === 'follow' && far < 6) this.facing = Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z);
    this.coop.face(this.facing);
    this.anim = { speed: sp, moving: sp > 0.2, airborne: !this.grounded && depth < 0.3 };
    this.root.position.copy(p);
  }

  /** Can she walk straight to q? (clear all the way, ground under her feet, no big drop) */
  clearTo(q) {
    const p = this.pos;
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (Math.abs(q.y - p.y) > 0.35) return false;
    const n = Math.ceil(d / 0.25);
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = p.x + dx * t, z = p.z + dz * t, y = p.y + (q.y - p.y) * t;
      if (this.hits(x, y + 0.05, z)) return false;
      if (!this.solid(x, y - 0.1, z) && !this.solid(x, y - 0.4, z)) return false;
    }
    return true;
  }

  whyStuck(tx, ty, tz, depth) {
    const p = this.pos, pl = this.c.player;
    if (depth > 0.3) return 'water';
    const ux = tx - p.x, uz = tz - p.z, l = Math.hypot(ux, uz) || 1;
    const fx = p.x + (ux / l) * 0.3, fz = p.z + (uz / l) * 0.3;
    // feet clear, head blocked: a crawlway
    if (!this.hits(fx, p.y, fz, 0.35) && this.hits(fx, p.y, fz)) return 'crawl';
    // walled in all round: a pit
    let walls = 0;
    for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; if (this.hits(p.x + Math.sin(ang) * 0.3, p.y + 0.1, p.z + Math.cos(ang) * 0.3, 0.3)) walls++; }
    if (walls >= 6 && pl.pos.y > p.y + 0.6) return 'pit';
    return 'ledge';
  }

  // ------------------------------------------------------------------ carrying
  updateCarried(dt) {
    const pl = this.c.player, o = this.c.owner;
    this.pos.copy(pl.pos);
    this.vel.set(0, 0, 0);
    const vm = o.vm;
    const t = o.time || 0;
    const bob = pl.grounded ? Math.sin(pl.bobT * 2 || t * 6) * 0.02 * Math.min(1, pl.speed / 2.5) : 0;
    if (vm?.scene) {
      if (this.root.parent !== vm.scene) { vm.scene.add(this.root); this.root.traverse((m) => { if (m.isMesh) m.frustumCulled = false; }); }
      this.root.position.set(Math.sin(t * 1.3) * 0.01, -0.84 + bob, -1.02);
      this.root.rotation.set(-0.08, 0, Math.sin(t * 1.7) * 0.02);
      this.coop.face(0, true);
    } else {
      const f = pl.forward(_v).setY(0).normalize();
      this.root.position.set(pl.pos.x + f.x * 0.75, pl.pos.y + 0.05 + bob, pl.pos.z + f.z * 0.75);
      this.coop.face(pl.yaw, true);
    }
    if (this.coop.shadow) this.coop.shadow.visible = false;
    this.anim = { speed: 0, moving: false };
  }

  pickUp() {
    if (this.carrying) return false;
    this.carrying = true;
    this.setMode('carried');
    this.c.audio.play('cluck', { pitch: 1.2, n: 3 });
    this.c.audio.play('creak');
    this.coop.shake(1);
    this.c.owner.vm?.setTool?.('none');
    this.trail.length = 0;
    return true;
  }

  /** Put the coop down in front of the mole (or beside). */
  putDown() {
    if (!this.carrying) return false;
    const pl = this.c.player;
    const f = pl.forward(_v).setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const base = Math.atan2(f.x, f.z);
    let spot = null;
    outer: for (const d of [0.9, 0.7, 1.15]) for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
      const a = base + da, x = pl.pos.x + Math.sin(a) * d, z = pl.pos.z + Math.cos(a) * d;
      for (let dy = 0.5; dy >= -0.6; dy -= 1 / VOX) {
        const y = pl.pos.y + dy;
        if (!this.hits(x, y, z) && this.ground(x, y, z)) { spot = { x, y, z }; break outer; }
      }
    }
    if (!spot) { this.c.audio.play('ui_error'); return false; }
    // back into the world
    this.c.scene3.add(this.root);
    this.root.rotation.set(0, 0, 0);
    this.root.traverse((m) => { if (m.isMesh) m.frustumCulled = true; });
    if (this.coop.shadow) this.coop.shadow.visible = true;
    this.pos.set(spot.x, spot.y, spot.z);
    this.root.position.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.carrying = false;
    this.facing = Math.atan2(pl.pos.x - spot.x, pl.pos.z - spot.z);
    this.coop.face(this.facing, true);
    this.coop.land(2.5);
    this.c.audio.play('thud', { vol: 0.4 });
    this.c.audio.play('cluck', { n: 2 });
    this.c.fx?.dust?.(spot.x, spot.y + 0.03, spot.z, 8, [0.5, 0.42, 0.34], 0.2);
    this.trail.length = 0;
    this.lastTrail.set(1e9, 0, 0);
    this.progress = { t: 0, x: spot.x, z: spot.z };
    this.setMode(Inv.henMood(this.st) === 'hungry' ? 'sulk' : 'follow');
    this.c.owner.updateHotbar?.();
    return true;
  }

  // ------------------------------------------------------------------ eggs, feeding, steps
  eggOut(p) {
    const st = this.st, name = st.data.chicken?.name || 'Nugget';
    this.c.audio.play('cluck', { n: 4, pitch: 1.2 });
    this.c.audio.play('bloop');
    st.learn?.('eggs');
    if (Inv.eggToCoop(st)) {
      this.c.owner.say?.('nugegg', `<b>${name}</b> laid an egg! It's on the coop's shelf.`, 'good', 8);
      return;
    }
    // shelves full: it rolls out of the door onto the floor
    const b = this.c.owner.bodies;
    if (b && p) {
      const vx = Math.floor(p.x * VOX), vy = Math.floor(p.y * VOX), vz = Math.floor(p.z * VOX);
      const vox = [[0, 0, 0, 0xf6ead4], [0, 1, 0, 0xfff6e6], [1, 0, 0, 0xe8dcc8], [0, 0, 1, 0xe8dcc8], [1, 1, 0, 0xfff6e6], [0, 1, 1, 0xf6ead4], [1, 0, 1, 0xe0d2bc], [1, 1, 1, 0xf6ead4]].map(([x, y, z, c]) => ({ x: vx + x, y: vy + y, z: vz + z, c }));
      const f = this.c.player.pos;
      const dx = f.x - p.x, dz = f.z - p.z, l = Math.hypot(dx, dz) || 1;
      b.spawn(vox, { vel: [dx / l * 1.2, 1.6, dz / l * 1.2], scale: 0.42, pickup: { id: 'egg', q: 100, delay: 0.6 } });
      this.c.owner.say?.('nugegg', `<b>${name}</b> laid an egg! The shelves are full, so it rolled out of the door.`, 'good', 8);
    }
  }

  /**
   * Now and then she scratches something up: grubs and seeds (her own snacks, onto the shelves) and,
   * with the Miners' Board's Nugget's Nose, a little ore for your bag. Faster with the Nugget skills.
   */
  scratch(dt, sk) {
    const st = this.st, d = st.data.coop;
    d.snackT = (d.snackT ?? 150) - dt * sk;
    const nose = st.upEffect?.('nugget') || 0;
    if (nose > 0) d.oreT = (d.oreT ?? 150 / (0.5 + nose * 0.5)) - dt * sk;
    const name = st.data.chicken?.name || 'Nugget';
    if (d.snackT <= 0) {
      d.snackT = 140 + Math.random() * 120;
      const id = Math.random() < 0.55 ? 'fat_grub' : 'cave_seeds';
      this.coop.peck(); this.coop.shake(0.4);
      this.c.audio.play('cluck', { n: 3, pitch: 1.15 });
      this.c.fx?.dust?.(this.pos.x, this.pos.y + 0.03, this.pos.z, 6, [0.5, 0.42, 0.34], 0.15);
      if (Inv.findToCoop(st, id, id === 'cave_seeds' ? 2 : 1)) this.c.owner.say?.('nugfind', `${name} scratched up ${id === 'fat_grub' ? 'a fat grub' : 'some seeds'} and tucked it on her shelf.`, 'good', 30);
      else d.food = Math.min(1, (d.food ?? 0) + 0.15); // no room: she eats it on the spot
    }
    if (nose > 0 && d.oreT <= 0) {
      d.oreT = 150 / (0.5 + nose * 0.5) * (0.8 + Math.random() * 0.4);
      // an ore of the rock round here (the nearest deposits), else copper, tin or coal
      const p = this.pos;
      const near = this.c.world.depositsNear?.(p.x, p.y, p.z, 8) || [];
      const pick = near.length ? near[Math.floor(Math.random() * near.length)].item : ['copper_ore', 'tin_ore', 'coal'][Math.floor(Math.random() * 3)];
      if (!ITEMS[pick]) return;
      const q = Math.round(55 + Math.random() * 35 * Math.min(1.4, sk));
      this.coop.peck(); this.coop.shake(0.6);
      this.c.audio.play('pickup', { pitch: 1.3 });
      if (st.canAdd(pick, 1)) { st.addItem(pick, ITEMS[pick].q ? { q } : {}); this.c.owner.say?.('nugore', `${name} scratched up a bit of <b>${ITEMS[pick].name}</b> for your bag!`, 'good', 20); }
      else if (Inv.findToCoop(st, pick, 1, q)) this.c.owner.say?.('nugore', `${name} scratched up a bit of <b>${ITEMS[pick].name}</b>. Your bag's full, so it's on her shelf.`, 'good', 20);
    }
  }

  /** Called by the backpack after Nugget was fed from the coop panel. */
  fed(id, r) {
    this.coop.shake(0.9);
    this.hen?.flap(0.5);
    this.c.audio.play('cluck', { n: 3, pitch: 1.2 });
    const p = this.coop.windowWorld(_v);
    for (let k = 0; k < 6; k++) this.c.fx?.glints?.(p.x, p.y, p.z, [1, 0.9, 0.4]);
    if (r?.mood && r.mood !== 'hungry' && this.mode === 'sulk') this.setMode('follow');
  }
  feed(id = null) {
    const r = Inv.feedHen(this.st, id, 'bag');
    if (!r.ok) return r;
    this.fed(r.id, r);
    this.c.audio.play('eat');
    return r;
  }
  step(k) {
    if (!this.near(9)) return;
    const a = this.c.audio;
    a.tone?.({ f: 120 + Math.random() * 30, f2: 70, type: 'triangle', dur: 0.06, vol: 0.05 * (0.5 + k) });
    a.noise?.({ color: 'brown', filter: 'lowpass', f: 500, dur: 0.05, vol: 0.05 * k });
  }
  coopOpened() { this.panelOpen = true; this.c.audio.play('door'); }
  coopClosed() { if (this.panelOpen) this.c.audio.play('door'); this.panelOpen = false; }
  coopTouched(what, r) {
    this.coop.shake(what === 'install' ? 0.8 : 0.35);
    this.dressT = 0; // re-dress now
    if (what === 'install') {
      this.c.audio.play('cluck', { n: 3, pitch: 1.2 });
      const p = this.pos;
      this.c.fx?.sparks?.(p.x, p.y + 0.5, p.z, 10, [1, 0.8, 0.45], [0, 1, 0], 2.5);
    }
  }

  // ------------------------------------------------------------------ interaction (DigScene)
  /** The coop under the crosshair within reach? */
  aimed(eye, dir, reach) {
    if (this.carrying) return true;
    const p = this.pos;
    _box.min.set(p.x - 0.36, p.y - 0.03, p.z - 0.36);
    _box.max.set(p.x + 0.36, p.y + COOP_H + 0.08, p.z + 0.36);
    _ray.origin.copy(eye); _ray.direction.copy(dir);
    const hit = _ray.intersectBox(_box, _v);
    return !!hit && hit.distanceTo(eye) <= Math.max(reach, 1.2) + 0.4;
  }
  hasHenFood() { return this.st.inventory((it) => it && it.hen > 0).length > 0; }

  target(eye, dir, reach) {
    const name = this.st.data.chicken?.name || 'Nugget';
    if (this.carrying) return { label: `Put ${name} down`, kind: 'use' };
    if (!this.aimed(eye, dir, reach)) return null;
    const mood = Inv.henMood(this.st);
    if (this.mode === 'stuck') return { label: `Carry ${name}`, kind: 'use' };
    if ((mood === 'hungry' || mood === 'peckish') && this.hasHenFood()) return { label: `Feed ${name}`, kind: 'use' };
    if (mood === 'hungry') return { label: `Carry ${name}`, kind: 'use' };
    return { label: `Open ${name}'s coop`, kind: 'use' };
  }

  use(eye, dir, reach) {
    const name = this.st.data.chicken?.name || 'Nugget';
    if (this.carrying) {
      if (this.putDown()) return [];
      return [{ say: `No room to put ${name} down here.`, key: 'nugroom', tone: 'warn', cd: 2 }];
    }
    if (!this.aimed(eye, dir, reach)) return null;
    const mood = Inv.henMood(this.st);
    if (this.mode === 'stuck') { this.pickUp(); return [{ say: `You heave ${name}'s coop up. <b>E</b> puts it down.`, key: 'nugcarry', tone: 'good', cd: 30 }]; }
    if ((mood === 'hungry' || mood === 'peckish') && this.hasHenFood()) {
      const r = this.feed();
      if (r.ok) return [{ say: `${name} gobbles up the ${ITEMS[r.id]?.name.toLowerCase() || 'food'} and clucks happily.`, key: 'nugfed', tone: 'good', cd: 2 }];
      return [{ say: r.reason, key: 'nugfed', tone: 'warn', cd: 2 }];
    }
    if (mood === 'hungry') { this.pickUp(); return [{ say: `${name} is too hungry to walk. You carry her; find her some food.`, key: 'nugcarry', tone: 'warn', cd: 20 }]; }
    this.c.owner.game?.ui?.openInventory?.();
    return [];
  }

  /**
   * The backpack is full: a find goes onto the coop's shelves instead, if she's close by (or
   * carried) and there's room. p: a pickup { id, q, p }. Returns true when it went in.
   */
  takeFind(p, range = 4.5) {
    const it = ITEMS[p?.id];
    if (!it || !(this.carrying || this.near(range)) || this.mode === 'stuck') return false;
    if (Inv.coopRoomKg(this.st, p.id) < 1) return false; // her legs can't take more
    const units = it.q ? [{ uid: Math.random().toString(36).slice(2, 10), id: p.id, q: Math.round(p.q ?? 100), p: !!p.p }] : 1;
    const left = Inv.putIn(Inv.coopSlots(this.st), p.id, units);
    if (Array.isArray(left) ? left.length : left > 0) return false;
    this.st.emit('items', { id: p.id, n: 0, coop: true });
    this.coop.shake(0.4);
    this.c.audio.play('cluck', { n: 1, pitch: 1.2 });
    return true;
  }

  /** Could she take one of these right now (close enough, room on the shelves and in her legs)? */
  canTake(id, range = 4.5) {
    if (!ITEMS[id] || !(this.carrying || this.near(range)) || this.mode === 'stuck') return false;
    return Inv.roomFor(Inv.coopSlots(this.st), id) > 0 && Inv.coopRoomKg(this.st, id) > 0;
  }

  /** A radar marker while she's out of sight (kind 'nugget'). */
  radarMarkers() {
    if (this.carrying) return [];
    const p = this.pos;
    return [{ kind: 'nugget', x: p.x, y: p.y, z: p.z, label: this.mode === 'stuck' ? 'Nugget (stuck!)' : 'Nugget', color: this.mode === 'stuck' ? '#ff6a3a' : '#f2c23a' }];
  }
  /** Her coop's warm windows light the rock a little. */
  lights() {
    if (this.carrying) return [];
    const p = this.pos;
    const out = [{ x: p.x, y: p.y + 0.45, z: p.z, c: [1, 0.72, 0.35], r: 1.6 }];
    // the roof lantern (a coop part): warm, or the lumite's big green glow
    if (this.lampLv) out.push({ x: p.x, y: p.y + COOP_H + 0.1, z: p.z, c: this.lampLv >= 2 ? [0.55, 1, 0.6] : [1, 0.8, 0.45], r: this.lampLv >= 2 ? 6.5 : 4.2 });
    return out;
  }

  // ------------------------------------------------------------------ test hooks
  makeDebug() {
    return {
      state: () => ({ mode: this.mode, stuck: this.stuckKind, carrying: this.carrying, food: +(this.st.data.coop?.food ?? 0).toFixed(3), mood: Inv.henMood(this.st), pos: this.pos.toArray().map((v) => +v.toFixed(2)), trail: this.trail.length, near: this.coopNear(), shelves: Inv.coopSlots(this.st).map((s) => (s ? `${s.id}×${Inv.stackN(s)}` : null)) }),
      feed: (id) => this.feed(id),
      hunger: (food) => { this.st.data.coop.food = food; return Inv.henMood(this.st); },
      stuck: (kind = 'ledge') => { this.setMode('stuck', kind); return this.mode; },
      carry: () => { if (this.mode !== 'stuck') this.setMode('stuck', 'ledge'); return this.pickUp(); },
      /** Build a part onto the coop (gives it first): returns installPart's result. */
      install: (id, q = 80) => { this.st.addItem(id, { q, spill: true }); const r = Inv.installPart(this.st, id); this.coopTouched('install', r); return r; },
      load: () => { const L = Inv.coopLoad(this.st); return { kg: +L.kg.toFixed(2), carry: L.carry, r: +L.r.toFixed(3), levels: W.coopLevels(this.st), gear: this.gear.meshes.length }; },
      put: () => this.putDown(),
      egg: () => { this.coop.layEgg(); return true; },
      teleport: (x, y, z) => { this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.trail.length = 0; this.root.position.copy(this.pos); },
      here: (d = 1.3) => this.placeNear(this.c.player.pos, d),
      open: () => { this.c.owner.game?.ui?.openInventory?.(); return true; },
      aim: () => { const pl = this.c.player; const e = pl.eye(), f = pl.forward(); return { aimed: this.aimed(e, f, 2.2), eye: e.toArray().map((v) => +v.toFixed(2)), f: f.toArray().map((v) => +v.toFixed(2)), pos: this.pos.toArray().map((v) => +v.toFixed(2)), mode: this.mode }; },
      coop: this.coop,
    };
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.c.scene3.remove(this.amb, this.lamp);
    this.gear.dispose();
    this.coop.dispose();
    this.lamp.dispose?.();
  }
}
void LAYER_OUTLINE;

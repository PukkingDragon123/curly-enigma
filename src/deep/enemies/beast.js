// Beast: the shared brain of the ecosystem's creatures (kobolds, trolls, spiders, drakes, slimes,
// raptors, tyrants, shellbacks, pterosaurs). Species extend it with a body (build/animate) and a
// list of attacks; the brain does the rest:
//
//   modes   sleep · idle · roam (around home, sometimes a long walk to another cave) · follow (the
//           herd / pack) · graze (moss, mushrooms, ferns) · hunt (prey creatures) · eat (a carcass)
//           · fight (the mole) · flee (predators, blasts, a lost fight) · investigate (a noise)
//   senses  sight (line of sight, wider in front, shorter when the mole crouches, longer when its
//           lamp shines on them), hearing (Enemies.noise: running, digging, fights, roars, blasts),
//           light (light-shy species flinch from the lamp)
//   attacks static attacks = [{ id, range: [min, max], arc, tell (s), heavy, dur, hitAt, rec,
//           cd: [a, b], w (weight), when(e, d), start(A), tick(A, dt), go(A), hit(A) → done? }]
//           run as tell (rim glow, the glint, a sound) → go (the blow; hit() deals it) → rec. Only
//           a few creatures may swing at the mole at once (Enemies attack tokens); the others
//           circle on their pack slot, so every blow stays readable and blockable.
//
// info (on top of base.js): tier (size class: prey < predator), diet ('graze' | 'hunt' |
// 'scavenge' | 'omni' | 'none'), social ('solo' | 'pack' | 'herd' | 'flock' | 'band'),
// aggro ('hostile' | 'territorial' | 'defensive' | 'timid'), sleepy (0..1), sight, hear, walk,
// run, turn (rad/s), accel, keep (circling distance), lightShy, agile (jumps), flesh (leaves a
// carcass), territory (m).
import * as THREE from 'three';
import { Enemy, TAU, wrapA, smooth } from './base.js';
import { clearLine, solidAt, boxHits } from './physics.js';
import { clamp, rand } from '../../core/util.js';

const _v = new THREE.Vector3(), _u = new THREE.Vector3();
const ZZZ = [0.85, 0.9, 1];

export class Beast extends Enemy {
  constructor(mgr, o) {
    super(mgr, o);
    this.mode = 'idle'; this.modeT = 0;
    this.foe = null; this.prey = null; this.meal = null; this.food = null; this.fleeFrom = null;
    this.goal = new THREE.Vector3().copy(this.pos);
    this.decT = Math.random() * 0.3;
    this.atk = null;
    this.lost = 0;
    this.stuckT = 0; this.detour = 0; this.detourT = 0;
    this.airT = 0;
    this.lookAt = new THREE.Vector3(this.pos.x, this.pos.y + 0.5, this.pos.z + 1);
    this.sleepT = 0; this.zT = rand(0.5, 2);
    this.noticed = false;
    this.startN = 1;
    this.restK = 0; // 0 standing … 1 lying down (sleep / rest)
    this.headDown = 0; // grazing, eating, sniffing
    this.asleep = !!o.asleep;
    if (this.asleep) { this.restK = 1; this.setMode('sleep'); }
    else if (o.awake) this.awake = true;
    this.resume = 'move';
  }

  get I() { return this.info; }
  setMode(m) { if (this.mode !== m) { this.mode = m; this.modeT = 0; } if (this.state !== 'move' && !this.atk && this.stunT <= 0) this.setState('move'); }

  // ------------------------------------------------------------------ frame
  think(dt) {
    this.airT = this.grounded ? 0 : this.airT + dt;
    this.headDown = Math.max(0, this.headDown - dt * 3);
    if (this.asleep) { this.sleeping(dt); return; }
    this.restK = Math.max(0, this.restK - dt * 1.6);
    if (this.atk) { this.runAttack(dt); return; }
    this.decT -= dt;
    if (this.decT <= 0) { this.decT = rand(0.22, 0.38); this.decide(); }
    this.modeT += dt;
    this.behave(dt);
    this.lightShy(dt);
  }

  // ------------------------------------------------------------------ deciding
  decide() {
    const m = this.mgr, I = this.I;
    if (this.nest && this.mode !== 'fight') this.guardNest();
    const th = this.threat();
    if (th) { this.fleeFrom = th; if (this.mode !== 'flee') { this.setMode('flee'); this.onFlee?.(); this.alertGroup(null); } return; }
    if (this.mode === 'flee' && this.modeT < 2.5) return;
    if (this.wantsFight()) {
      if (this.mode !== 'fight') { this.setMode('fight'); this.foe = 'player'; this.engage(); }
      return;
    }
    if (this.mode === 'fight') { this.foe = null; this.setMode('idle'); this.lost = 0; this.onCalm?.(); }
    if (this.mode === 'investigate' && this.modeT < 4) return;
    const hungry = this.hunger > 0.45;
    if (hungry && (I.diet === 'hunt' || I.diet === 'omni')) {
      const p = (this.prey?.alive && this.mode === 'hunt' && this.modeT < 14) ? this.prey : m.eco.findPrey(this);
      if (p) { this.prey = p; this.setMode('hunt'); return; }
    }
    if (this.hunger > 0.3 && I.diet !== 'graze' && I.diet !== 'none') {
      const c = this.meal && !this.meal.gone && this.meal.meat > 0 ? this.meal : m.eco.findCarcass(this);
      if (c) { this.meal = c; this.setMode('eat'); return; }
    }
    if (this.hunger > 0.3 && (I.diet === 'graze' || I.diet === 'omni')) {
      if (this.mode === 'graze' && this.food && this.modeT < 20) return;
      const f = m.eco.findFood(this);
      if (f) { this.food = f; this.setMode('graze'); return; }
    }
    if (this.mode === 'graze' || this.mode === 'eat') { if (this.modeT < 12 && this.hunger > 0.05) return; }
    // full and nothing going on: a nap (sleepy species), stay with the group, or wander
    if (this.hunger < 0.2 && Math.random() < (I.sleepy ?? 0) * 0.04 && this.dist > 7 && !this.groupBusy()) { this.fallAsleep(); return; }
    const g = this.group;
    if (g && g.leader && g.leader !== this && this.pos.distanceTo(g.leader.pos) > (g.spread ?? 3)) { this.setMode('follow'); return; }
    if (this.mode === 'roam' && this.modeT < 9 && this.pos.distanceTo(this.goal) > 0.6) return;
    if (this.mode === 'idle' && this.modeT < rand(1.5, 4)) return;
    if (Math.random() < 0.55) { this.pickRoam(); this.setMode('roam'); } else this.setMode('idle');
  }

  /** Something to run from: { x, z, k } or null. */
  threat() {
    const m = this.mgr, I = this.I;
    if (this.scare > 0 && this.scareAt) return this.scareAt;
    // a hungry bigger hunter close by
    for (const c of m.list) {
      if (!c.alive || c === this || c.passive || !c.info.tier || c.kind === this.kind) continue;
      if ((c.info.diet !== 'hunt' && c.info.diet !== 'omni') || c.info.tier <= (I.tier ?? 1)) continue;
      const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
      if (d < (c.mode === 'hunt' && c.prey === this ? 11 : 5)) return { x: c.pos.x, z: c.pos.z, k: 1 };
    }
    const hurt = m.time - this.lastHitT < 8 && this.lastHitBy === 'player';
    if (I.aggro === 'timid' && !m.safe && ((this.dist < (I.flee ?? 5) && this.sees) || hurt)) return { x: m.pc.x, z: m.pc.z, k: 1 };
    // a broken band runs (most of its friends are down) — and anything nearly dead
    const g = this.group;
    if (I.morale && g && g.size >= 2 && (g.alive() / g.size < 0.5 || !g.leader?.alive || g.chief?.alive === false) && (this.mode === 'fight' || this.mode === 'flee')) return { x: m.pc.x, z: m.pc.z, k: 1 };
    if (this.hp < this.maxHp * (I.fleeHp ?? 0) && hurt) return { x: m.pc.x, z: m.pc.z, k: 1 };
    return null;
  }

  /** Does it want to fight the mole right now? */
  wantsFight() {
    const m = this.mgr, I = this.I;
    if (m.safe || m.pl.dead) return false;
    const hurt = m.time - this.lastHitT < 14 && this.lastHitBy === 'player';
    if (hurt && this.dist < 24) return this.track();
    if (this.mode === 'fight') return this.track();
    if (this.group?.foe === 'player' && m.time - this.group.alertT < 20 && this.dist < 20) return true;
    if (I.aggro === 'timid') return false;
    if (I.aggro === 'defensive') return (this.nest && this.dist < 5) || (this.dist < 1.8 && this.sees);
    const sees = this.notices();
    if (!sees) return false;
    if (I.aggro === 'territorial') return this.pos.distanceTo(this.home) < (I.territory ?? 9) + 2 && this.dist < (I.territory ?? 9);
    return true;
  }
  /** Keeps track of the mole while fighting (gives up after a while out of sight or too far). */
  track() {
    if (this.dist > (this.I.sight ?? 16) + 8) return false;
    if (this.sees || this.dist < 3) { this.lost = 0; return true; }
    this.lost += 0.3;
    return this.lost < (this.I.patience ?? 8);
  }
  /** Sight check: in front, in range, not hidden; crouching halves it, a lamp in its face doubles it. */
  notices() {
    if (!this.sees) return this.dist < 1.2;
    const m = this.mgr, I = this.I;
    let r = I.sight ?? 12;
    const a = Math.abs(wrapA(Math.atan2(this.pdx, this.pdz) - this.yaw));
    if (a > 1.2) r *= 0.45;
    if (m.pl.crouched) r *= 0.55;
    if (m.pl.speed > 3.2) r *= 1.25;
    if (m.lampOn && a < 1.3) r *= 1.35;
    return this.dist < r;
  }
  /** First contact with the mole: an alert, the group joins in. */
  engage() {
    this.lost = 0;
    if (!this.noticed) { this.noticed = true; this.wake(); this.onNotice?.(); }
    this.alertGroup('player');
  }
  alertGroup(foe) {
    const g = this.group;
    if (!g) return;
    if (foe) { g.foe = foe; g.alertT = this.mgr.time; }
    for (const c of g.members) if (c !== this && c.alive && c.asleep) c.wakeUp?.(true);
  }
  groupBusy() { const g = this.group; return !!(g && g.members.some((c) => c.alive && (c.mode === 'fight' || c.mode === 'hunt' || c.mode === 'flee'))); }

  /** Hears a noise (Enemies.noise): asleep → may wake; idle → turn and look, or come and see. */
  hear(n, d) {
    if (!this.alive) return;
    const loud = n.r / Math.max(0.5, d);
    if (this.asleep) { if (loud > (this.I.deep ?? 1.4) || Math.random() < loud * 0.25) this.wakeUp(true); return; }
    if (n.kind === 'blast' && (this.I.tier ?? 1) < 4 && this.I.aggro !== 'hostile') { this.scare = 4; this.scareAt = { x: n.x, z: n.z, k: 1 }; return; }
    if (this.mode === 'fight' || this.mode === 'flee' || this.atk) return;
    this.alarm = n;
    this.lookAt.set(n.x, n.y, n.z);
    if (this.I.aggro === 'hostile' || this.I.aggro === 'territorial' || n.kind === 'blast') { this.goal.set(n.x, n.y, n.z); this.setMode('investigate'); }
  }

  // ------------------------------------------------------------------ doing
  behave(dt) {
    const I = this.I, m = this.mgr;
    switch (this.mode) {
      case 'fight': this.fight(dt); break;
      case 'hunt': {
        const p = this.prey;
        if (!p || !p.alive) { this.prey = null; this.setMode('idle'); break; }
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if (d > 18) { this.prey = null; this.setMode('idle'); break; }
        this.lookAt.copy(p.center);
        if (this.atkCd <= 0) { const a = this.pickAttack(d, p); if (a) { this.startAttack(a, p); break; } }
        this.walkTo(p.pos.x, p.pos.z, I.run, dt, 0.6);
        break;
      }
      case 'eat': {
        const c = this.meal;
        if (!c || c.gone || c.meat <= 0 || this.hunger <= 0.02) { this.meal = null; this.setMode('idle'); if (this.hunger < 0.15 && Math.random() < (I.sleepy ?? 0)) this.fallAsleep(); break; }
        const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
        this.lookAt.set(c.pos.x, c.pos.y, c.pos.z);
        if (d > (c.r + this.hw * this.size + 0.25)) { this.walkTo(c.pos.x, c.pos.z, I.walk * 1.3, dt, c.r + this.hw * this.size); break; }
        this.push(0, 0, 8, dt);
        this.face(c.pos.x, c.pos.z, I.turn ?? 4, dt);
        this.headDown = 1;
        m.eco.bite(this, c, dt);
        break;
      }
      case 'graze': {
        const f = this.food;
        if (!f) { this.setMode('idle'); break; }
        const d = Math.hypot(f.x - this.pos.x, f.z - this.pos.z);
        this.lookAt.set(f.x, f.y, f.z);
        if (d > 0.35 + this.hw * this.size) { if (this.walkTo(f.x, f.z, I.walk, dt, 0.3 + this.hw * this.size) === 'stuck') { this.food = null; this.setMode('idle'); } break; }
        this.push(0, 0, 8, dt);
        this.headDown = 1;
        m.eco.graze(this, f, dt);
        if (this.hunger <= 0.03) { this.food = null; this.setMode('idle'); }
        break;
      }
      case 'flee': {
        const t = this.fleeFrom;
        if (!t) { this.setMode('idle'); break; }
        const dx = this.pos.x - t.x, dz = this.pos.z - t.z, d = Math.hypot(dx, dz) || 1;
        if (d > 16 && this.modeT > 3) { this.setMode('idle'); this.fleeFrom = null; break; }
        this.walkTo(this.pos.x + dx / d * 4, this.pos.z + dz / d * 4, I.run * 1.05, dt, 0.1);
        break;
      }
      case 'investigate': {
        const n = this.goal;
        if (this.walkTo(n.x, n.z, I.walk * 1.2, dt, 1.2) === true || this.modeT > 7) { this.headDown = 0.6; if (this.modeT > 5) this.setMode('idle'); }
        break;
      }
      case 'follow': {
        const g = this.group, L = g?.leader;
        if (!L || L === this) { this.setMode('idle'); break; }
        const a = this.slotAngle(L.yaw + Math.PI, g.spread ?? 3);
        const r = (g.spread ?? 3) * 0.6;
        const tx = L.pos.x + Math.sin(a) * r, tz = L.pos.z + Math.cos(a) * r;
        const far = Math.hypot(tx - this.pos.x, tz - this.pos.z);
        if (this.walkTo(tx, tz, far > 4 ? I.run * 0.8 : I.walk, dt, 0.5) === true) this.setMode('idle');
        break;
      }
      case 'roam': {
        if (this.walkTo(this.goal.x, this.goal.z, I.walk, dt, 0.5) !== false) this.setMode('idle');
        break;
      }
      case 'sleep': case 'rest': case 'idle': default: {
        this.push(0, 0, 6, dt);
        if (Math.random() < dt * 0.3) this.lookAt.set(this.pos.x + rand(-3, 3), this.pos.y + rand(0, 1), this.pos.z + rand(-3, 3));
        break;
      }
    }
    if (this.mode !== 'fight' && this.mode !== 'hunt') this.hunger = Math.min(1, this.hunger + dt * (this.I.metabolism ?? 0.004));
  }

  /** Fighting the mole: keep a slot around it, swing when an attack fits and a token is free. */
  fight(dt) {
    const m = this.mgr, I = this.I, pc = m.pc;
    this.lookAt.copy(m.eye);
    const d = this.hd;
    if (this.atkCd <= 0 && (this.sees || d < 2.5)) {
      const a = this.pickAttack(d, 'player');
      if (a && m.takeToken(this, a)) { this.startAttack(a, 'player'); return; }
    }
    // circle at a slot around the mole (packs spread out and flank), or come in close
    const g = this.group;
    const ready = this.atkCd <= 0.4 && m.tokenFree(this);
    const keep = ready ? (I.close ?? 1.4) : (I.keep ?? 2.6) + (g ? 0.4 : 0);
    let tx = pc.x, tz = pc.z;
    if (g && g.alive() > 1) {
      const base = Math.atan2(g.cx - pc.x, g.cz - pc.z) + m.time * 0.12 * (g.dir || 1);
      const a = this.slotAngle(base, 1.15);
      tx = pc.x + Math.sin(a) * keep; tz = pc.z + Math.cos(a) * keep;
    } else if (d < keep) {
      // too close while not swinging: back off a little, strafe
      const [dx, dz] = this.dirToPlayer();
      const s = this.strafe ?? (this.strafe = Math.random() < 0.5 ? 1 : -1);
      tx = this.pos.x - dx * 0.6 - dz * s * 0.8; tz = this.pos.z - dz * 0.6 + dx * s * 0.8;
    }
    const far = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    const sp = far > 4 ? I.run : far > 1.2 ? (I.walk + I.run) * 0.5 : I.walk * 0.7;
    if (far > 0.35) this.walkTo(tx, tz, sp, dt, 0.3, d < 4 ? [pc.x, pc.z] : null);
    else { this.push(0, 0, 6, dt); this.facePlayer(I.turn ?? 4, dt); }
    if (Math.random() < dt * 0.25) this.onTaunt?.();
  }

  /** Spread around a center: this member's angle (pack slots). */
  slotAngle(base, spread) {
    const g = this.group;
    if (!g) return base;
    const live = g.members.filter((c) => c.alive);
    const i = Math.max(0, live.indexOf(this)), n = live.length;
    return base + (i - (n - 1) / 2) * spread;
  }

  /**
   * Walk toward (x, z): turn first (big bodies turn slowly), then go; steps around things it bumps
   * into. faceAt: keep facing this point instead (strafing). Returns true when there, 'stuck' when
   * it has been stuck a long time, else false.
   */
  walkTo(x, z, speed, dt, stopAt = 0.3, faceAt = null) {
    const I = this.I;
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < stopAt) { this.push(0, 0, I.accel ?? 6, dt); if (faceAt) this.face(faceAt[0], faceAt[1], I.turn ?? 4, dt); return true; }
    let ang = Math.atan2(dx, dz);
    if (this.detourT > 0) { this.detourT -= dt; ang += this.detour; }
    const turn = I.turn ?? 4;
    let mx = Math.sin(ang), mz = Math.cos(ang), k = 1;
    if (faceAt) {
      this.face(faceAt[0], faceAt[1], turn, dt);
    } else {
      const off = Math.abs(wrapA(ang - this.yaw));
      this.yaw = wrapA(this.yaw + clamp(wrapA(ang - this.yaw), -turn * dt, turn * dt));
      k = off < 0.5 ? 1 : off < 1.3 ? 0.45 : 0.08;
      if (I.strafeless !== false && off < 1.3) { mx = Math.sin(this.yaw); mz = Math.cos(this.yaw); }
    }
    const s = Math.min(speed, d * 2.5 + 0.3) * k;
    this.push(mx * s, mz * s, I.accel ?? 6, dt);
    // stuck? slide around it, hop over it (agile ones), or give up on that goal
    const real = Math.hypot(this.vel.x, this.vel.z);
    if (this.ev.bumped && real < s * 0.4 && s > 0.2) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 0.35 && this.detourT <= 0) {
      if (I.agile && this.grounded && Math.random() < 0.6) { this.vel.y = I.jump ?? 4.2; this.vel.x += mx * 1.2; this.vel.z += mz * 1.2; this.sqv += 6; }
      else { this.detour = (Math.random() < 0.5 ? 1 : -1) * rand(0.8, 1.5); this.detourT = rand(0.5, 1); }
      if (this.stuckT > 2.5) { this.stuckT = 0; return 'stuck'; }
    }
    return false;
  }

  /** A spot to wander to: near home, or now and then a long walk along open space. */
  pickRoam() {
    const m = this.mgr, w = this.w;
    const far = Math.random() < (this.I.wander ?? 0.15) && !this.nest;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * TAU, d = far ? rand(8, 18) : rand(2, (this.I.territory ?? 8) * 0.6);
      const cx = far ? this.pos.x : this.home.x, cz = far ? this.pos.z : this.home.z;
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
      const h = (this.h || 0.5) * this.size;
      if (!clearLine(w, this.pos.x, this.pos.y + h * 0.6, this.pos.z, x, this.pos.y + h * 0.6, z)) continue;
      const f = m.floorAt(x, this.pos.y + 0.5, z, Math.min(1.5, h), 3, 1.5);
      if (!f || m.excluded(f.x, f.y, f.z, 1)) continue;
      this.goal.set(f.x, f.y, f.z);
      if (far) this.home.copy(this.goal);
      if (this.group?.leader === this) this.group.home.copy(this.goal);
      return;
    }
    this.goal.copy(this.home);
  }

  /** Near its nest: anything that comes close is an intruder. */
  guardNest() {
    const n = this.nest;
    if (!n.eggs || !this.mgr.near(this, 18)) return;
    const d = Math.hypot(this.mgr.pc.x - n.x, this.mgr.pc.z - n.z);
    if (d < (n.r ?? 2) + 2.5 && this.sees && !this.mgr.safe) { this.lastHitT = this.mgr.time; this.lastHitBy = 'player'; }
  }

  /** Light-shy creatures flinch from the lamp in their face. */
  lightShy(dt) {
    if (!this.I.lightShy || this.atk) return;
    if (this.litBy(this.I.lightShy, 0.94)) {
      this.litT = (this.litT || 0) + dt;
      if (this.litT > 0.4 && this.stunT <= 0 && this.atkCd < 1.2) { this.litT = -2.5; this.onLit?.(); }
    } else this.litT = Math.max(0, (this.litT || 0) - dt);
  }

  // ------------------------------------------------------------------ sleep
  fallAsleep() {
    this.asleep = true; this.awake = false; this.noticed = false;
    this.setMode('sleep');
    this.sleepT = 0;
  }
  wakeUp(startled) {
    if (!this.asleep) return;
    this.asleep = false;
    this.setMode('idle');
    this.decT = 0;
    this.shiver = 0.6;
    this.sqv += 5;
    this.onWake?.(startled);
    if (startled) this.alertGroup(null);
  }
  sleeping(dt) {
    const m = this.mgr, I = this.I;
    this.push(0, 0, 8, dt);
    this.restK = Math.min(1, this.restK + dt * 1.2);
    this.sleepT += dt;
    this.hunger = Math.min(1, this.hunger + dt * 0.002);
    // little z's drifting up
    this.zT -= dt;
    if (this.zT <= 0 && m.near(this, 14)) {
      this.zT = rand(0.9, 1.6);
      const p = this.headPos(_v);
      for (let i = 0; i < 3; i++) this.fx.spawn({ x: p.x + i * 0.04, y: p.y + 0.08 + i * 0.05, z: p.z, vx: 0.08, vy: 0.22, vz: 0, life: 1.4, size: 0.02 + i * 0.006, color: ZZZ, alpha: 0.75, drag: 0.6 });
      if (I.snore) this.sound(I.snore, { vol: 0.6, pitch: I.snorePitch || 1 });
    }
    // waking: the mole walks right up (crouching sneaks closer), shines a lamp in its face, or it got hungry
    if ((this.decT -= dt) > 0) return;
    this.decT = 0.3;
    const r = (I.wakeR ?? 2.6) * (m.pl.crouched ? 0.5 : 1) * (m.pl.speed > 3.2 ? 1.8 : 1);
    if (!m.safe && this.dist < r && (this.sees || this.dist < 1.2)) { this.wakeUp(true); return; }
    if (!m.safe && this.litBy(4.5, 0.95) && Math.random() < 0.35) { this.wakeUp(true); return; }
    if (this.hunger > 0.75 && this.sleepT > 20) this.wakeUp(false);
  }

  // ------------------------------------------------------------------ attacks
  pickAttack(d, target) {
    const list = this.constructor.attacks;
    if (!list) return null;
    let tot = 0;
    const ok = [];
    const tgt = target === 'player' ? this.mgr.pc : target.center;
    const ang = Math.abs(wrapA(Math.atan2(tgt.x - this.pos.x, tgt.z - this.pos.z) - this.yaw));
    for (const a of list) {
      if (d < a.range[0] || d > a.range[1]) continue;
      if (ang > (a.arc ?? 1)) continue;
      if (target !== 'player' && a.noPrey) continue;
      if (a.when && !a.when(this, d, target)) continue;
      ok.push(a); tot += a.w ?? 1;
    }
    if (!ok.length) return null;
    let r = Math.random() * tot;
    for (const a of ok) { r -= a.w ?? 1; if (r <= 0) return a; }
    return ok[0];
  }
  startAttack(a, target) {
    this.atk = { a, t: 0, phase: 'tell', target, hit: false, data: {} };
    this.setState('atk');
    a.start?.call(this, this.atk);
    if (a.sound) this.sound(a.sound[0], a.sound[1] || {});
  }
  runAttack(dt) {
    const A = this.atk, a = A.a;
    if (A.target !== 'player' && (!A.target || !A.target.alive)) { this.endAttack(); return; }
    A.t += dt;
    a.tick?.call(this, A, dt);
    if (!this.atk) return;
    if (A.phase === 'tell') {
      this.tell(A.t / a.tell, a.heavy);
      if (a.track !== false) this.faceTarget(A, a.turn ?? (this.I.turn ?? 4) * 0.8, dt);
      if (!this.info.flying && a.root !== false) this.push(0, 0, 8, dt);
      if (A.t >= a.tell) { A.phase = 'go'; A.t = 0; a.go?.call(this, A); }
    } else if (A.phase === 'go') {
      if (!A.hit && A.t >= (a.hitAt ?? 0) && a.hit) { if (a.hit.call(this, A)) A.hit = true; }
      if (A.t >= a.dur) { A.phase = 'rec'; A.t = 0; a.done?.call(this, A); }
    } else {
      if (!this.info.flying && a.root !== false) this.push(0, 0, 6, dt);
      if (A.t >= a.rec) this.endAttack();
    }
  }
  endAttack(cancel = false) {
    const A = this.atk;
    if (!A) return;
    this.atk = null;
    this.mgr.releaseToken(this);
    this.atkCd = rand(...(A.a.cd || [1.2, 2.2])) * (this.group ? 1.2 : 1);
    if (this.state === 'atk') this.setState('move');
    if (cancel) A.a.cancel?.call(this, A);
  }
  onStun() { this.endAttack(true); this.restK = 0; }
  faceTarget(A, rate, dt) {
    const t = A.target === 'player' ? this.mgr.pc : A.target.pos;
    return this.face(t.x, t.z, rate, dt);
  }
  /** World point of the attack's target. */
  targetPos(A, out = _u) { return A.target === 'player' ? out.copy(this.mgr.pc) : out.copy(A.target.center); }

  /**
   * A melee blow from world point `at` with reach r. Hurts the mole (through blocking) or the prey
   * creature. o: { dmg, push (m/s), up, kind, heavy, unblockable, prey (fraction of prey hp) }.
   */
  strikeAt(A, at, r, o = {}) {
    const m = this.mgr;
    if (A.target === 'player') {
      if (this.gapToPlayer(at.x, at.y, at.z, r) >= 0) return false;
      const [dx, dz] = this.dirToPlayer();
      const p = o.push ?? 3;
      this.hurtPlayer(o.dmg ?? this.info.dmg, [dx * p, o.up ?? 1.6, dz * p], o.kind || this.kind, { heavy: o.heavy, unblockable: o.unblockable, from: [this.pos.x, 0, this.pos.z] });
      return true;
    }
    const t = A.target;
    if (!t?.alive) return true;
    const d = Math.hypot(at.x - t.center.x, at.y - t.center.y, at.z - t.center.z);
    if (d > r + t.hitR * t.size + 0.15) return false;
    const l = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) || 1;
    const k = clamp((o.prey ?? 0.3) * (this.I.tier ?? 2) / (t.info.tier ?? 1), 0.12, 0.8);
    t.takeHit(t.maxHp * k, { x: (t.pos.x - this.pos.x) / l, y: 0.3, z: (t.pos.z - this.pos.z) / l }, { by: this, kb: 0.8 });
    this.fx.dust(t.center.x, t.center.y, t.center.z, 4, m.dustCol(t.pos), 0.1);
    this.sound('chomp', { vol: 0.8 });
    if (!t.alive) { this.meal = m.eco.carcassOf(t); this.prey = null; }
    return true;
  }

  /** A point `fwd` m in front of the body's center (`up` m higher): where a bite or a swing lands. */
  reachPoint(fwd = 0.3, up = 0, out = _v) {
    const r = this.hitR * this.size;
    return out.set(this.center.x + Math.sin(this.yaw) * (r + fwd), this.center.y + up, this.center.z + Math.cos(this.yaw) * (r + fwd));
  }

  /** Ate well: less hungry. */
  fed(k) { this.hunger = Math.max(0, this.hunger - k); }

  headPos(out) {
    if (this.headObj) { this.headObj.updateWorldMatrix(true, false); return this.headObj.localToWorld(out.set(0, this.headTop || 0, this.headFwd || 0)); }
    return super.headPos(out);
  }
}

/** Packs, herds, flocks and bands: members, a leader, an alarm, a home. */
export class Group {
  constructor(kind, type, home) {
    this.kind = kind; this.type = type;
    this.members = [];
    this.home = new THREE.Vector3().copy(home);
    this.foe = null; this.alertT = -99;
    this.size = 0;
    this.spread = type === 'herd' ? 3.2 : type === 'pack' ? 2.6 : 2;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.cx = home.x; this.cz = home.z;
  }
  add(e) { this.members.push(e); e.group = this; this.size = this.members.length; return e; }
  get leader() { for (const c of this.members) if (c.alive && !c.baby) return c; return null; }
  alive() { let n = 0; for (const c of this.members) if (c.alive) n++; return n; }
  /** Once per frame (Enemies): the group's center. */
  tick() {
    let n = 0, x = 0, z = 0;
    for (const c of this.members) if (c.alive) { n++; x += c.pos.x; z += c.pos.z; }
    if (n) { this.cx = x / n; this.cz = z / n; }
  }
}

export { boxHits, solidAt, smooth };

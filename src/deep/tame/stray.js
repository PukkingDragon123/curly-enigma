// A lone raptor in the dino caverns: young, separated from its pack, a fresh set of claw marks
// down its flank and a limp. Wild, wary and hungry. It doesn't fight you; it backs off, hisses,
// and watches. Win it over and it's yours (tame/index.js does the bond and the naming).
//
// How it reads you (every frame):
//   fear     rises when you come closer than it likes (its comfort radius shrinks as it trusts
//            you, and halves while you crouch), faster when you run at it, when your pick swings
//            near it, at loud noises (digging, fights, blasts), a little with the lamp in its eyes;
//            it falls while you keep your distance, and fast while you stay crouched and still
//   calm     builds while you crouch, still, within a few metres: the first time it settles it
//            coos (act tame calm, a little trust)
//   trust    persistent (state.data.tame.stray.trust, 0..100): meals add to it, a pick blow takes
//            a lot away; at 100 it bonds
//
// What it does (plan): idle (limps about its spot, licks its scratches) · watch (wary, facing you)
// · back (backs off with a hiss) · near (creeps up to sniff at you, crouched only) · food → sniff →
// eat (a meal you tossed: E on it, tame/index.js) · paw (sniffs your empty paw) · full (two meals
// and it's had enough for now: a coo, a rest, then it wanders off) · leave · bolt (hit or terrified:
// it runs and won't come back this trip) · bond.
import * as THREE from 'three';
import { Raptor } from '../enemies/dinos.js';
import { TameRaptor } from './body.js';
import { RAPTOR_FOOD } from './food.js';
import { clearLine } from '../enemies/physics.js';
import { clamp, rand } from '../../core/util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const TURNS = [0, 0.5, -0.5, 1, -1, 1.5, -1.5]; // straight back, else turned aside (radians)

export class Stray extends TameRaptor {
  static info = { ...Raptor.info, name: 'Lone Raptor', aggro: 'timid', social: 'solo', diet: 'none', morale: false, sleepy: 0, keepFar: 40, flee: 0 };
  static attacks = [];

  /** o: as TameRaptor, plus rec (the persistent record: state.data.tame.stray) and tame (the manager). */
  constructor(mgr, o) {
    super(mgr, { ...o, marks: 'wound', size: o.size ?? 0.8 });
    this.passive = true; // not a foe: no attack tokens, no radar mark, no music
    this.rec = o.rec;
    this.T = o.tame;
    this.fear = 0.45;
    this.calm = 0;
    this.plan = 'idle'; this.planT = 0;
    this.meals = 0;
    this.food = null;
    this.calmed = false;
    this.pawed = 0;
    this.hits = 0;
    this.heardT = mgr.time;
    this.spot = this.pos.clone();
    this.decT = 0;
    this.goalSet = false;
    this.lickT = rand(4, 9);
  }

  get trust() { return this.rec.trust || 0; }
  /** Two meals in one visit is plenty (unless that one's the meal that wins it over). */
  full() { return this.meals >= 2 && this.trust < 100; }
  addTrust(n) { this.rec.trust = clamp((this.rec.trust || 0) + n, 0, 100); }
  setPlan(p) { if (this.plan !== p) { this.plan = p; this.planT = 0; this.goalSet = false; } }
  act(what, extra = {}) { this.mgr.queueEv({ act: { type: 'tame', what, ...extra } }); }

  // ------------------------------------------------------------------ being hit
  /** Your pick (Enemies.damage → pickHit): it yelps, bolts, and trusts you a good deal less. */
  pickHit(power, dir) {
    this.hits++;
    if (this.T?.naming?.s === this && !this.T.naming.started) this.T.naming = null; // not like this
    this.flinch(dir, 2.6);
    this.addTrust(-25);
    this.fear = 1;
    this.act('hurt');
    this.setPlan(this.hits >= 2 || this.trust < 10 ? 'bolt' : 'back');
  }
  /** Anything else's blow: never down for good, it runs. */
  takeHit(power, dir, o = {}) {
    if (!this.alive) return;
    this.hp = Math.max(1, this.hp - power * 0.3);
    this.flinch(dir, 2);
    this.fear = 1;
    this.setPlan('back');
    void o;
  }
  flinch(dir, kb) {
    this.flash = 1; this.shiver = 0.6; this.sqv -= 7;
    this.vel.x += (dir?.x || 0) * kb; this.vel.z += (dir?.z || 0) * kb; this.vel.y += 1.2;
    this.yelp();
  }
  wake() { this.awake = true; }
  stun() {}

  // ------------------------------------------------------------------ offers (tame/index.js)
  /** A piece of food landed near it (Tossed). */
  offered(food) {
    if (this.plan === 'bolt' || this.plan === 'bond' || this.plan === 'leave') return false;
    if (this.full()) { this.lookAt.copy(food.pos); this.sniff(2); return false; } // had enough for now: it sniffs and leaves it
    this.food = food;
    if (this.plan !== 'eat' && this.plan !== 'sniffFood') this.setPlan('food');
    return true;
  }
  /** You held out an empty paw. */
  paw() {
    if (this.plan === 'bolt' || this.plan === 'bond' || this.plan === 'leave' || this.plan === 'eat') return false;
    if (this.fear > 0.6) { this.hiss(); this.fear = Math.min(1, this.fear + 0.15); return true; }
    this.setPlan('paw');
    return true;
  }

  // ------------------------------------------------------------------ the brain
  think(dt) {
    const m = this.mgr, pl = m.pl;
    this.airT = this.grounded ? 0 : this.airT + dt;
    this.headDown = Math.max(0, this.headDown - dt * 3);
    this.restK = Math.max(0, this.restK - dt * 1.6);
    this.planT += dt;
    const d = this.hd, tk = clamp(this.trust / 100, 0, 1);
    const crouched = !!pl.crouched, still = (pl.speed || 0) < 0.6;
    // ---- what it makes of you
    let fear = this.fear;
    for (const n of m.eco.noises) {
      if (n.t <= this.heardT) continue;
      const dn = Math.hypot(n.x - this.pos.x, n.y - this.pos.y, n.z - this.pos.z), R = n.r * 1.2;
      if (dn < R) fear += (n.kind === 'blast' ? 1 : n.kind === 'fight' || n.kind === 'death' ? 0.45 : n.kind === 'dig' ? 0.1 : 0.22) * (1 - dn / R) * (1 - tk * 0.6);
    }
    this.heardT = m.time;
    if (this.scare > 0 || this.scared > 0) { fear = 1; this.scared = 0; }
    const comfort = Math.max(0.9, (5.2 - tk * 3.8) * (crouched ? 0.5 : 1));
    const closing = d > 0.01 ? (this.pdx * -(pl.vel?.x || 0) + this.pdz * -(pl.vel?.z || 0)) / d : 0; // > 0: coming at it
    if (d < comfort && this.plan !== 'eat' && this.plan !== 'near' && this.plan !== 'paw' && this.plan !== 'bond') fear += dt * (crouched ? 0.16 : 0.7) * (1 + Math.max(0, closing) * 0.7) * (1 - tk * 0.5);
    else fear -= dt * (crouched ? 0.32 : 0.16) * (0.6 + tk);
    if ((pl.speed || 0) > 3.2 && d < 7) fear += dt * 0.5;
    if (!crouched && this.litBy(5, 0.96)) fear += dt * 0.05;
    const sw = m.owner?.swing;
    if (sw && !sw.hit && d < 2.8) fear += dt * 1.4;
    // calm: you, crouched and still, nearby
    if (crouched && still && d < 4.8 && fear < 0.65) this.calm = Math.min(1, this.calm + dt * 0.24);
    else if (!crouched && !still) this.calm = Math.max(0, this.calm - dt * 0.06);
    fear -= this.calm * dt * 0.3;
    this.fear = fear = clamp(fear, 0, 1);
    if (!this.calmed && this.calm > 0.6 && fear < 0.35) this.settle();
    this.teach(dt, d, crouched);
    // ---- what it does
    switch (this.plan) {
      case 'back': this.doBack(dt); break;
      case 'bolt': this.doBolt(dt); break;
      case 'food': case 'sniffFood': case 'eat': this.doFood(dt); break;
      case 'ate': this.doAte(dt); break;
      case 'paw': this.doPaw(dt); break;
      case 'near': this.doNear(dt, crouched); break;
      case 'full': this.doFull(dt); break;
      case 'leave': this.doLeave(dt); break;
      case 'bond': this.doBond(dt); break;
      case 'lick': this.doLick(dt); break;
      default: this.doIdle(dt, crouched, comfort);
    }
    this.want.limp = Math.max(this.want.limp || 0, 0.8); // the hurt leg
  }

  /**
   * Level ground r m off along (ux, uz), turned aside if it must (turns: radians to try): the
   * way there walkable at about its own height (no drop, no ledge it couldn't come back up), or
   * null. A wary raptor gives ground there; it never backs off a cliff.
   */
  footing(ux, uz, r, turns = TURNS) {
    const m = this.mgr, y = this.pos.y, h = 0.5 * this.size;
    for (const a of turns) {
      const c = Math.cos(a), s = Math.sin(a), dx = ux * c - uz * s, dz = ux * s + uz * c;
      let f = null;
      for (let k = 1; k <= 3; k++) {
        f = m.floorAt(this.pos.x + dx * r * k / 3, y + 0.5, this.pos.z + dz * r * k / 3, 0.9, 1.1, 1);
        if (!f || Math.abs(f.y - y) > 0.45) { f = null; break; }
      }
      if (f && clearLine(m.world, this.pos.x, y + h, this.pos.z, f.x, f.y + h, f.z)) return f;
    }
    return null;
  }

  /**
   * (wave 12: shown, not told) the first times you meet it, a few words over its head: how to come
   * near (crouch, keep still) while it's wary, then what to do once it settles (settle()).
   */
  teach(dt, d, crouched) {
    const m = this.mgr, st = m.state;
    if (!st?.flag || st.flag('tipStray') || this.calmed || this.plan === 'bolt') return;
    this.tipT = (this.tipT ?? 1.5) - dt;
    if (this.tipT > 0 || crouched || d > 8 || d < 1) return;
    this.tipT = 10;
    m.floatAt?.('Crouch. Keep still.', this.headPos(_v).add(_w.set(0, 0.35, 0)), '#cfe6ff', 0.9, 'meh');
  }

  /** The first time it settles down near you. */
  settle() {
    if (this.mgr.state?.flag && !this.mgr.state.flag('tipStray')) {
      this.mgr.state.flag('tipStray', true);
      this.mgr.floatAt?.('Now offer food', this.headPos(_v).add(_w.set(0, 0.35, 0)), '#9af07a', 0.9, 'good');
    }
    this.calmed = true;
    this.addTrust(8);
    this.coo();
    this.act('calm');
  }

  doIdle(dt, crouched, comfort) {
    const m = this.mgr, d = this.hd, tk = this.trust / 100;
    if (this.fear > 0.82) { this.hiss(); this.setPlan('back'); return; }
    if (this.food && !this.food.gone && this.fear < 0.75) { this.setPlan('food'); return; }
    if (this.fear > 0.42) {
      // wary: stand its ground, watch you, give a little ground if you crowd it
      this.feel(this.fear > 0.65 ? 'scared' : 'wary');
      this.lookAt.copy(m.eye);
      const [dx, dz] = this.dirToPlayer();
      if (d < comfort * 0.75 && this.footing(-dx, -dz, 0.8, [0])) this.walkTo(this.pos.x - dx * 1.2, this.pos.z - dz * 1.2, this.I.walk * 0.6, dt, 0.2, [m.pc.x, m.pc.z]);
      else { this.push(0, 0, 6, dt); this.facePlayer(3, dt); }
      if (this.fear > 0.65 && d < comfort && Math.random() < dt * 0.6) this.hiss();
      return;
    }
    // curious: head tilts, sniffs at you (smells the food in your pack)
    this.feel('curious', { wag: 0.15 + tk * 0.6, perk: 0.3 + tk * 0.3 });
    if (d < 9) { this.lookAt.copy(m.eye); if (Math.random() < dt * 0.35) this.sniff(2); }
    const hasFood = !!this.T?.foodFor?.();
    if (crouched && d > 1.6 && d < 7 && this.fear < 0.25 && (hasFood || tk > 0.35)) { this.setPlan('near'); return; }
    if (d < 6) { this.push(0, 0, 6, dt); this.facePlayer(2.5, dt); return; }
    // nobody close: limp about its spot, lick its scratches now and then
    if ((this.lickT -= dt) <= 0) { this.lickT = rand(6, 12); this.setPlan('lick'); return; }
    if (!this.goalSet || this.planT > 7) {
      this.goalSet = true; this.planT = 0;
      const a = Math.random() * Math.PI * 2, r = rand(0.8, 2.6);
      const f = m.floorAt(this.spot.x + Math.cos(a) * r, this.spot.y + 0.5, this.spot.z + Math.sin(a) * r, 0.9, 1.5, 0.8);
      this.goal.set(f ? f.x : this.pos.x, f ? f.y : this.pos.y, f ? f.z : this.pos.z);
    }
    if (this.walkTo(this.goal.x, this.goal.z, this.I.walk * 0.5, dt, 0.3) !== false) this.push(0, 0, 6, dt);
  }

  doLick(dt) {
    // turn the head to the scratched flank, then down to lick it
    this.feel('rest');
    this.push(0, 0, 6, dt);
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    if (this.planT < 0.4) this.lookAt.set(this.pos.x + c * 0.4 - s * 0.05, this.pos.y + 0.3, this.pos.z - s * 0.4 - c * 0.05);
    else { this.headDown = 1; if (Math.random() < dt * 2) this.voice('raptor_sniff', { n: 2, vol: 0.5 }, 0.6); }
    if (this.planT > 2.2 || this.hd < 3.5) this.setPlan('idle');
  }

  doBack(dt) {
    const m = this.mgr;
    this.feel('scared');
    this.lookAt.copy(m.eye);
    if (!this.goalSet) {
      this.goalSet = true;
      const [dx, dz] = this.dirToPlayer();
      const f = this.footing(-dx, -dz, rand(2.6, 3.8));
      this.goal.set(f ? f.x : this.pos.x, this.pos.y, f ? f.z : this.pos.z); // (no ground to give: it stands its ground)
      this.hiss();
    }
    const r = this.walkTo(this.goal.x, this.goal.z, this.I.run * 0.7, dt, 0.4);
    if (r === true) this.facePlayer(4, dt);
    if ((r === true && this.planT > 0.8) || r === 'stuck' || this.planT > 2.2) { this.setPlan('idle'); this.facePlayer(4, dt); }
  }

  doBolt(dt) {
    const m = this.mgr;
    this.feel('scared', { angry: 0 });
    const [dx, dz] = this.dirToPlayer();
    if (this.walkTo(this.pos.x - dx * 4, this.pos.z - dz * 4, this.I.run * 1.05, dt, 0.1) === 'stuck') { this.detour = (Math.random() < 0.5 ? 1 : -1) * 1.4; this.detourT = 0.8; }
    if (this.planT > 0.3 && Math.random() < dt * 0.8) this.voice('raptor_yelp', {}, 1.2);
    this.T?.gone?.(this, 'bolt');
    void m;
  }

  doFood(dt) {
    const m = this.mgr, f = this.food, tk = this.trust / 100;
    if (!f || f.gone) { this.food = null; this.setPlan('idle'); return; }
    const p = f.center(_v);
    this.lookAt.copy(p);
    if (!f.landed) { this.feel('curious'); this.push(0, 0, 6, dt); this.face(p.x, p.z, 4, dt); return; }
    const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    const reach = 0.36 * this.size + 0.12;
    if (this.plan === 'food') {
      // too frightened to come for it yet: eye it
      if (this.fear > 0.7) { this.feel('wary'); this.push(0, 0, 6, dt); this.face(p.x, p.z, 3, dt); if (this.planT > 12) this.setPlan('idle'); return; }
      this.feel('curious', { wag: 0.3 + tk * 0.5 });
      if (Math.random() < dt * 1.5) this.sniff(2);
      if (d > reach) {
        const r = this.walkTo(p.x, p.z, this.I.walk * (0.75 + tk * 0.5), dt, reach * 0.9);
        if (r === 'stuck' || this.planT > 10) { this.setPlan('idle'); }
        return;
      }
      this.setPlan('sniffFood');
      return;
    }
    this.push(0, 0, 8, dt);
    this.face(p.x, p.z, 5, dt);
    this.headDown = 1;
    if (this.plan === 'sniffFood') {
      this.feel('curious', { tilt: 0.3, sniff: 1 });
      this.sniff(3);
      if (this.planT > 0.8) { this.setPlan('eat'); this.chirp(1, 1.2); }
      return;
    }
    // eat: bite by bite (a nervous one keeps looking up at you)
    this.feel('eat', { wag: 0.35 + tk * 0.65 });
    if (this.fear > 0.5 && Math.sin(this.planT * 3) > 0.6) { this.headDown = 0; this.lookAt.copy(m.eye); }
    this.biteT = (this.biteT ?? 0) - dt;
    if (this.biteT <= 0) {
      this.biteT = 0.42;
      this.jawOpen = 1;
      this.sound('chomp', { vol: 0.7 });
      f.bite(0.22);
      if (f.gone) this.ate(f.id);
    }
  }

  /** A meal finished: trust, a happy wiggle, and maybe it's had enough for now. */
  ate(id) {
    const v = (RAPTOR_FOOD[id]?.trust || 15) * (this.meals ? 0.9 : 1);
    this.food = null;
    this.meals++;
    this.rec.meals = (this.rec.meals || 0) + 1;
    if (!this.calmed) this.settle();
    this.addTrust(v);
    this.act('feed', { item: id, trust: Math.round(this.trust) });
    this.fear = Math.max(0, this.fear - 0.35);
    this.calm = Math.min(1, this.calm + 0.3);
    this.setPlan('ate');
  }
  doAte(dt) {
    const m = this.mgr, tk = this.trust / 100;
    this.feel('happy', { wag: 0.6 + tk * 0.4 });
    this.lookAt.copy(m.eye);
    this.push(0, 0, 6, dt);
    this.facePlayer(4, dt);
    if (this.planT > 0.2 && this.planT < 0.3) { this.chirp(tk > 0.5 ? 3 : 2); if (tk > 0.4) this.hop(1.8); }
    if (tk > 0.6 && this.planT > 0.8 && this.planT < 0.9) this.trill();
    if (this.planT > 1.6) {
      if (this.trust >= 100) { this.setPlan('bond'); this.T?.bonding?.(this); return; }
      this.setPlan(this.meals >= 2 ? 'full' : 'idle');
    }
  }

  doPaw(dt) {
    const m = this.mgr, pl = m.pl, tk = this.trust / 100;
    const [dx, dz] = this.dirToPlayer();
    const tx = pl.pos.x - dx * 0.75, tz = pl.pos.z - dz * 0.75;
    this.lookAt.copy(m.eye);
    if (this.planT < 5 && Math.hypot(tx - this.pos.x, tz - this.pos.z) > 0.25 && this.hd > 0.9) {
      this.feel('curious', { wag: 0.2 + tk * 0.5 });
      this.walkTo(tx, tz, this.I.walk * 0.6, dt, 0.2);
      if (this.fear > 0.7) this.setPlan('back');
      return;
    }
    // nose out to your paw: sniff, sniff
    this.push(0, 0, 8, dt);
    this.facePlayer(5, dt);
    this.feel('curious', { tilt: 0.6, sniff: 1, wag: 0.25 + tk * 0.6 });
    this.sniff(3);
    if (!this.pawT) this.pawT = 0;
    this.pawT += dt;
    if (this.pawT > 1.3) {
      this.pawT = 0;
      if (this.pawed < 2) { this.addTrust(this.pawed ? 2 : 4); this.pawed++; }
      if (tk > 0.5) { this.coo(); this.hop(1.4); }
      this.act('paw');
      this.setPlan('idle');
    }
  }

  doNear(dt, crouched) {
    // creep up to sniff at you while you stay down
    const m = this.mgr, tk = this.trust / 100;
    this.feel('curious', { wag: 0.2 + tk * 0.5, tilt: 0.8 });
    this.lookAt.copy(m.eye);
    if (!crouched || this.fear > 0.5 || this.planT > 8) { this.setPlan('idle'); return; }
    if (this.hd > 1.35 + (1 - tk) * 0.6) { this.walkTo(m.pc.x, m.pc.z, this.I.walk * 0.45, dt, 0.3); return; }
    this.push(0, 0, 8, dt);
    this.facePlayer(4, dt);
    this.sniff(2);
    if (this.planT > 3) this.setPlan('idle');
  }

  doFull(dt) {
    // licks its snout, coos, settles for a moment, then wanders off for now
    const m = this.mgr;
    this.feel('rest', { wag: 0.25, happy: 0.5 });
    this.push(0, 0, 6, dt);
    if (this.planT < 1.4) { this.lookAt.copy(m.eye); if (this.planT > 0.3 && this.planT < 0.4) this.coo(); }
    else if (this.planT < 4.5) this.restK = Math.min(0.48, this.restK + dt * 3.2);
    else this.setPlan('leave');
  }

  doLeave(dt) {
    const m = this.mgr;
    this.feel('calm', { wag: 0.2 });
    if (!this.goalSet) {
      this.goalSet = true;
      const [dx, dz] = this.dirToPlayer();
      this.goal.set(this.pos.x - dx * 14 + rand(-3, 3), this.pos.y, this.pos.z - dz * 14 + rand(-3, 3));
      this.chirp(1, 0.9);
    }
    const r = this.walkTo(this.goal.x, this.goal.z, this.I.walk * 0.9, dt, 0.6);
    if (r === 'stuck') { this.detour = (Math.random() < 0.5 ? 1 : -1) * 1.2; this.detourT = 1; }
    this.T?.gone?.(this, 'leave');
    void m;
  }

  doBond(dt) {
    // it's decided: up close, wagging, hopping, trilling
    const m = this.mgr;
    this.feel('happy', { wag: 1, tilt: 0.5 });
    this.lookAt.copy(m.eye);
    if (this.hd > 1.0) this.walkTo(m.pc.x, m.pc.z, this.I.walk, dt, 0.95);
    else { this.push(0, 0, 8, dt); this.facePlayer(5, dt); }
    if (Math.random() < dt * 1.4) this.hop(1.6);
    if (Math.random() < dt * 0.9) this.chirp(2 + (Math.random() < 0.5 ? 1 : 0));
    if (this.planT > 0.4 && this.planT < 0.5) { this.trill(); this.glow(10); }
  }
}

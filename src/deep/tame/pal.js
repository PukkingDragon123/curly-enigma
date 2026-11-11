// Your raptor in the mine: it trots at your heel, keeps out of your swing, joins your fights, sniffs
// out ore now and then, and never, ever bites you. It isn't one of Enemies' creatures (the pick
// can't hit it, blasts don't throw it, nothing sweeps it away): tame/index.js runs it.
//
//   follow   a slot behind you and to one side (the side with more room), out of the cone in
//            front of you where the pick swings. When it can't see you it follows your trail (the
//            spots you walked: tame/index.js keeps them); left far behind, stuck, or in lava, it
//            catches up out of sight (it comes trotting round the corner). Settles down when you
//            stand still a while.
//   fight    a creature that's after you (or after it) within reach: it circles to the far side,
//            darts in for a bite (a fraction of what your pick does: DANGER stays your problem),
//            hops back. A bite during a wind-up may knock it off balance. Some foes turn on it.
//            Not the Cave Tyrant or a crystal golem: it barks at those from beside you.
//   retreat  hurt below 40%: tail tucked, whimpering, it runs behind you and licks its wounds until
//            it's well again (it never dies).
//   stay     E on it: it sits where it is and waits (E again: it comes). It still defends itself.
//   sniff    now and then, when all is calm: it stops, sniffs the air, trots to the rock where hidden
//            ore lies close under the surface and scratches at it (dust, pebbles, a glint of the ore).
import * as THREE from 'three';
import { Raptor } from '../enemies/dinos.js';
import { clearLine, boxHits } from '../enemies/physics.js';
import { pebbles, sparkle } from '../enemies/fx.js';
import { MAT, ORE_BASE } from '../materials.js';
import { TameRaptor } from './body.js';
import { clamp, rand } from '../../core/util.js';

const _v = new THREE.Vector3();
const col01 = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

export class Pal extends TameRaptor {
  static info = { ...Raptor.info, name: 'Raptor', aggro: 'timid', social: 'solo', diet: 'none', morale: false, sleepy: 0, keepFar: 1e9, run: 4.6 };
  static attacks = [
    { id: 'snap', range: [0, 1.3], arc: 0.75, tell: 0.26, dur: 0.26, hitAt: 0.06, rec: 0.45, cd: [1.6, 2.5], w: 1,
      start() { this.voice('bark', { pitch: 1.35, n: 1 }, 0.4); },
      go(A) { const t = A.target; const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1; this.vel.x += dx / l * 2.6; this.vel.z += dz / l * 2.6; this.sound('chomp', {}); },
      hit(A) { return this.biteFoe(A); } },
  ];

  /** o: as TameRaptor, plus rec (its state.data.tame.raptors entry) and tame (the manager). */
  constructor(mgr, o) {
    super(mgr, { ...o, marks: 'scar', collar: true, size: o.size ?? 0.88 });
    this.rec = o.rec;
    this.T = o.tame;
    this.name = o.rec?.name || 'Raptor';
    this.mode = 'follow'; this.modeT = 0;
    this.staying = false;
    this.stayAt = this.pos.clone();
    this.foe = null;
    this.side = Math.random() < 0.5 ? 1 : -1; this.sideT = 0;
    this.sniffT = rand(25, 45);
    this.dig = null;
    this.stuck2 = 0;
    this.stillT = 0;
    this.catchT = -99;
    this.crumbI = -1;
    this.decT = 0;
    this.stats = { bites: 0, hits: 0, finds: 0, catchups: 0, retreats: 0 };
  }

  setMode(m) { if (this.mode !== m) { this.mode = m; this.modeT = 0; this.goalSet = false; } if (this.state !== 'move' && !this.atk) this.setState('move'); }

  // ------------------------------------------------------------------ hurt, never down
  takeHit(power, dir, o = {}) {
    if (!this.alive) return;
    this.hp = Math.max(1, this.hp - power);
    this.flash = 1; this.shiver = 0.6; this.sqv -= 7;
    const kb = 2 * (o.kb ?? 1) / this.mass;
    this.vel.x += (dir?.x || 0) * kb; this.vel.z += (dir?.z || 0) * kb; this.vel.y += 1;
    this.lastHitT = this.mgr.time; this.lastHitBy = o.by || null;
    this.stats.hits++;
    this.yelp();
    if (this.atk) this.endAttack(true);
    if (o.by && typeof o.by === 'object' && o.by.alive && !o.by.tame) this.foe = o.by;
    if (this.hp < this.maxHp * 0.4 && this.mode !== 'retreat') { this.stats.retreats++; this.setMode('retreat'); this.whimper(); }
  }
  pickHit() {}
  stun() {}
  wake() { this.awake = true; }

  /** E on it: stay here, or come along. */
  toggleStay() {
    this.staying = !this.staying;
    if (this.staying) { this.stayAt.copy(this.pos); this.setMode('stay'); this.chirp(1, 0.9); }
    else { this.setMode('follow'); this.chirp(2, 1.15); this.hop(1.8); }
    return this.staying;
  }

  // ------------------------------------------------------------------ the brain
  think(dt) {
    const m = this.mgr;
    this.airT = this.grounded ? 0 : this.airT + dt;
    this.headDown = Math.max(0, this.headDown - dt * 3);
    this.modeT += dt;
    // well again little by little; faster when nothing's after it
    const calm = !this.foe?.alive;
    if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * (this.mode === 'retreat' ? (calm ? 0.7 : 0.3) : calm ? 0.25 : 0.05));
    if (this.goHome) { this.doHome(dt); return; }
    if (this.atk) { this.restK = Math.max(0, this.restK - dt * 3); this.feel('alert'); this.runAttack(dt); return; }
    if ((this.decT -= dt) <= 0) { this.decT = 0.25; this.decide(); }
    switch (this.mode) {
      case 'fight': this.doFight(dt); break;
      case 'retreat': this.doRetreat(dt); break;
      case 'stay': this.doStay(dt); break;
      case 'sniff': this.doSniff(dt); break;
      case 'dig': this.doDig(dt); break;
      default: this.doFollow(dt);
    }
    if (this.mode !== 'stay' && this.mode !== 'follow') this.restK = Math.max(0, this.restK - dt * 2);
    // fell into lava (or something just as bad): out of there
    if (this.inFluid === 2) this.T?.catchUp?.(this, true);
    void m;
  }

  decide() {
    if (this.mode === 'retreat') { if (this.hp >= this.maxHp * 0.85) { this.shakeOff(); this.setMode(this.staying ? 'stay' : 'follow'); } return; }
    const f = this.pickFoe();
    if (f) { if (this.foe !== f || this.mode !== 'fight') { this.foe = f; this.setMode('fight'); this.voice('bark', { pitch: 1.3, n: 2 }, 1.5); } return; }
    this.foe = null;
    if (this.mode === 'fight') this.setMode(this.staying ? 'stay' : 'follow');
    if (this.mode === 'sniff' || this.mode === 'dig') return;
    if (this.staying) { this.setMode('stay'); return; }
    if (this.mode !== 'follow') this.setMode('follow');
  }

  /** Who to bite: a creature after you (or after it), awake, close, and reachable. */
  pickFoe() {
    const m = this.mgr, pc = m.pc;
    let best = null, bs = 1e9;
    const keep = this.foe;
    for (const e of m.list) {
      if (!e.alive || e.passive || e.tame || e.isWeb || e.asleep || (e.emerge ?? 1) < 0.6) continue;
      if (e.pickHit || (e.info?.tier ?? 1) >= 5) continue; // golems' crystals, the tyrant: not for a raptor's teeth
      const onMe = e.atk?.target === this || e.prey === this || (e === keep && m.time - (this.lastHitT || -99) < 4);
      const onYou = e.mode === 'fight' || e.atk?.target === 'player' || (!e.decide && e.awake && e.dist < 7);
      if (!onMe && !onYou) continue;
      if (this.staying && !onMe) continue;
      const dp = Math.hypot(e.pos.x - pc.x, e.pos.z - pc.z), dm = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (dp > 9 || dm > 13 || Math.abs(e.pos.y - this.pos.y) > 1.6) continue;
      if (e.info?.flying && e.center.y - e.pos.y > 1.2) continue;
      const s = dp + dm * 0.5 - (onMe ? 2 : 0) - (e.atk?.target === 'player' ? 3 : 0) - (e === keep ? 1.5 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  /** A bite: a fraction of a pick blow (the mole still does the real work). Counts as your kill. */
  biteFoe(A) {
    const m = this.mgr, t = A.target;
    if (!t?.alive) return true;
    const at = this.reachPoint(0.22, 0.05);
    const d = Math.hypot(at.x - t.center.x, (at.y - t.center.y) * 0.7, at.z - t.center.z);
    if (d > 0.34 + (t.hitR || 0.3) * (t.size || 1) + 0.12) return false;
    const pick = m.state?.equipped?.('pick');
    const dmg = Math.min(t.maxHp * 0.16, (pick?.power || 1) * 0.6);
    const l = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) || 1;
    const dir = { x: (t.pos.x - this.pos.x) / l * 0.6, y: 0.2, z: (t.pos.z - this.pos.z) / l * 0.6 };
    const winding = t.atk && t.atk.phase === 'tell';
    t.takeHit(dmg, dir, { by: 'player', kb: 0.5 });
    this.stats.bites++;
    this.rec.bites = (this.rec.bites || 0) + 1;
    const c = t.center;
    m.fx.dust(c.x, c.y, c.z, 3, t.hitCol || m.dustCol(t.pos), 0.06);
    sparkle(m.fx, c.x, c.y, c.z, 4, [1, 0.95, 0.8], 1.4, 3, 0.014, 0.3);
    m.noise(c.x, c.y, c.z, 4, 'fight');
    if (t.alive) {
      // it bit them: some turn on it for a moment (the mole gets a breather, not a free win)
      if (t.decide && Math.random() < 0.35) { t.threatBy = this; t.threatT = m.time - 3; }
      if (winding && Math.random() < 0.3) t.stun?.(0.4, 'stagger');
    } else { this.chirp(3, 1.2); this.hop(1.6); }
    return true;
  }

  // ------------------------------------------------------------------ modes
  doFollow(dt) {
    const m = this.mgr, pl = m.pl, P = pl.pos;
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw); // where you look
    const rx = -fz, rz = fx;                               // your right
    // which side has room (re-checked now and then)
    if ((this.sideT -= dt) <= 0) {
      this.sideT = 2.5;
      const room = (s) => { const h = m.world.raycast(P.x, P.y + 0.5, P.z, rx * s, 0, rz * s, 1.4); return h ? h.dist : 1.4; };
      const a = room(this.side), b = room(-this.side);
      if (b > a + 0.4) this.side = -this.side;
    }
    const toX = this.pos.x - P.x, toZ = this.pos.z - P.z, dP = Math.hypot(toX, toZ) || 1;
    const inFront = (toX * fx + toZ * fz) / dP > 0.35 && dP < 2.8;
    let sx = P.x - fx * 1.45 + rx * this.side * 0.85, sz = P.z - fz * 1.45 + rz * this.side * 0.85;
    // out of the swing: step aside first
    if (inFront) { sx = P.x + rx * this.side * 1.7 - fx * 0.3; sz = P.z + rz * this.side * 1.7 - fz * 0.3; }
    // a slot inside the rock: straight behind you will do
    if (!this.fits(sx, P.y, sz)) { sx = P.x - fx * 1.4; sz = P.z - fz * 1.4; if (!this.fits(sx, P.y, sz)) { sx = P.x - fx * 0.9; sz = P.z - fz * 0.9; } }
    const dist = this.hd;
    // can't see you: follow your trail
    let tx = sx, tz = sz, trail = false;
    if (dist > 2.2 && !this.sees) {
      const c = this.T?.trail?.(this);
      if (c) { tx = c.x; tz = c.z; trail = true; }
    }
    const far = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    const moving = (pl.speed || 0) > 0.5;
    this.stillT = moving ? 0 : this.stillT + dt;
    this.lookAt.copy(dist < 3 && !moving ? m.eye : _v.set(this.pos.x + fx * 3, this.pos.y + 0.5, this.pos.z + fz * 3));
    if (far > 0.35 || inFront) {
      this.restK = Math.max(0, this.restK - dt * 3);
      const sp = inFront ? this.I.run * 0.8 : dist > 5 || trail ? this.I.run : clamp(far * 1.8, this.I.walk * 0.6, this.I.run * 0.85);
      const r = this.walkTo(tx, tz, sp, dt, 0.3, inFront ? [P.x + fx * 3, P.z + fz * 3] : null);
      this.feel(dist > 4 ? 'calm' : 'happy', { wag: 0.45, happy: 0, perk: 0.3 });
      if (r === 'stuck') this.stuck2 += 2.5;
    } else {
      this.push(0, 0, 6, dt);
      this.face(P.x + fx * 4, P.z + fz * 4, 2.5, dt);
      this.feel(this.stillT > 9 ? 'rest' : 'calm', { wag: 0.25 });
      // you've been at that wall a while: it settles down beside you
      if (this.stillT > 9) this.restK = Math.min(0.46, this.restK + dt * 1.5);
      if (Math.random() < dt * 0.05) this.chirp(1, 0.95);
    }
    // stuck or left behind: catch up out of sight
    const real = Math.hypot(this.vel.x, this.vel.z);
    if (far > 1.2 && real < 0.4) this.stuck2 += dt; else this.stuck2 = Math.max(0, this.stuck2 - dt * 2);
    if (dist > 16 || this.stuck2 > 3 || (Math.abs(this.pos.y - P.y) > 2.4 && dist > 3 && this.modeT > 2)) this.T?.catchUp?.(this);
    // now and then: a sniff for ore
    if ((this.sniffT -= dt) <= 0) { this.sniffT = rand(40, 75); this.trySniff(); }
  }

  /** Room for its body at (x, y, z)? */
  fits(x, y, z) {
    const m = this.mgr, f = m.floorAt(x, y + 0.6, z, 0.75 * this.size, 1.4, 0.8);
    if (!f || Math.abs(f.y - y) > 1) return false;
    const hw = this.hw * this.size;
    return !boxHits(m.world, f.x - hw, f.y + 0.28, f.z - hw, f.x + hw, f.y + this.h * this.size, f.z + hw, 2);
  }

  doFight(dt) {
    const m = this.mgr, e = this.foe;
    if (!e || !e.alive) { this.foe = null; this.setMode('follow'); return; }
    this.lookAt.copy(e.center);
    this.feel('alert');
    const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    const gap = d - (e.hitR || 0.3) * (e.size || 1);
    // dodge a blow coming its way
    if (e.atk?.target === this && e.atk.phase === 'tell' && !this.dodged) { this.dodged = true; if (Math.random() < 0.55) { const s = Math.random() < 0.5 ? 1 : -1; this.vel.x += -dz / d * s * 3.2; this.vel.z += dx / d * s * 3.2; this.vel.y = 2; this.sqv += 4; } }
    if (!e.atk) this.dodged = false;
    if (this.atkCd <= 0) {
      const a = this.pickAttack(gap + 0.4, e);
      if (a) { this.startAttack(a, e); return; }
    }
    // the far side of it from you (flanking), close when ready, a little back while it waits
    const pc = m.pc;
    const away = Math.atan2(e.pos.x - pc.x, e.pos.z - pc.z);
    const ready = this.atkCd < 0.35;
    const ang = away + (this.side * 0.9);
    const r = (e.hitR || 0.3) * (e.size || 1) + (ready ? 0.55 : 1.5);
    const tx = e.pos.x + Math.sin(ang) * r, tz = e.pos.z + Math.cos(ang) * r;
    const far = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    if (far > 0.3) this.walkTo(tx, tz, far > 2 ? this.I.run : this.I.walk * 1.4, dt, 0.25, gap < 2.5 ? [e.pos.x, e.pos.z] : null);
    else { this.push(0, 0, 6, dt); this.face(e.pos.x, e.pos.z, 6, dt); }
    if (Math.random() < dt * 0.3) this.voice('bark', { pitch: 1.3, n: 2 }, 1.2);
    if (this.hd > 14) { this.foe = null; this.setMode('follow'); }
  }

  doRetreat(dt) {
    const m = this.mgr, pl = m.pl, P = pl.pos;
    this.feel('hurt');
    this.lookAt.copy(m.eye);
    // behind you, away from whatever hurt it
    let ax = -Math.sin(pl.yaw), az = -Math.cos(pl.yaw);
    const f = this.foe?.alive ? this.foe : null;
    if (f) { const dx = P.x - f.pos.x, dz = P.z - f.pos.z, l = Math.hypot(dx, dz) || 1; ax = -dx / l; az = -dz / l; }
    let tx = P.x - ax * 2.4, tz = P.z - az * 2.4;
    if (!this.fits(tx, P.y, tz)) { tx = P.x - ax * 1.3; tz = P.z - az * 1.3; }
    const far = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    if (far > 0.4) this.walkTo(tx, tz, this.I.run * 0.85, dt, 0.3);
    else {
      this.push(0, 0, 6, dt);
      // licks its scratches
      if (Math.sin(this.modeT * 1.3) > 0.3) this.headDown = 1;
    }
    if (Math.random() < dt * 0.35) this.whimper();
    if (this.hd > 16) this.T?.catchUp?.(this);
  }

  /** A new raptor took its place at your side: it trots off home (it waits there for you). */
  doHome(dt) {
    const m = this.mgr;
    this.feel('calm', { wag: 0.3 });
    if (!this.goalSet) {
      this.goalSet = true;
      const [dx, dz] = this.dirToPlayer();
      this.goal.set(this.pos.x - dx * 14, this.pos.y, this.pos.z - dz * 14);
      this.chirp(2, 0.9);
    }
    if (this.walkTo(this.goal.x, this.goal.z, this.I.walk * 1.2, dt, 0.6) === 'stuck') { this.detour = 1.2; this.detourT = 1; }
    void m;
  }

  /** Well again: a shake from nose to tail. */
  shakeOff() {
    this.shiver = 1; this.sqv += 6;
    this.fx.dust(this.center.x, this.center.y, this.center.z, 6, this.mgr.dustCol(this.pos), 0.2);
    this.chirp(2, 1.1);
  }

  doStay(dt) {
    const m = this.mgr;
    const far = Math.hypot(this.stayAt.x - this.pos.x, this.stayAt.z - this.pos.z);
    this.lookAt.copy(m.eye);
    if (far > 0.5) { this.walkTo(this.stayAt.x, this.stayAt.z, this.I.walk, dt, 0.4); this.feel('calm'); return; }
    this.push(0, 0, 6, dt);
    if (this.hd < 12) this.facePlayer(1.5, dt);
    // sits down to wait, head up, watching you; a call now and then when you're far
    this.restK = Math.min(0.46, this.restK + dt * 1.5);
    this.feel('rest', { wag: this.hd < 3 ? 0.5 : 0.12, perk: 0.3 });
    if (this.hd > 8 && Math.random() < dt * 0.06) this.chirp(2, 0.9);
  }

  // ------------------------------------------------------------------ ore
  /** Hidden ore close under the rock near it? Then go and scratch at it. */
  trySniff() {
    const m = this.mgr, w = m.world;
    if (this.staying || m.threat?.()) return false;
    const eye = _v.set(this.pos.x, this.pos.y + 0.5 * this.size, this.pos.z);
    let best = null;
    for (const d of w.depositsNear(eye.x, eye.y, eye.z, 6)) {
      const s = w.depState(d);
      if (s.taken || s.seen) continue;
      const dx = d.x - eye.x, dy = d.y - eye.y, dz = d.z - eye.z, l = Math.hypot(dx, dy, dz) || 1;
      if (Math.abs(dy) > 1.6) continue;
      const h = w.raycast(eye.x, eye.y, eye.z, dx / l, dy / l, dz / l, l);
      if (!h || l - h.dist > d.r + 0.6) continue; // too much rock between
      // stand in front of that bit of rock
      const sx = h.x + h.nx * 0.42, sz = h.z + h.nz * 0.42;
      const f = m.floorAt(sx, this.pos.y + 0.6, sz, 0.7, 1.6, 1);
      if (!f || !clearLine(w, eye.x, eye.y, eye.z, f.x, f.y + 0.4, f.z)) continue;
      if (!best || h.dist < best.dist) best = { d, x: f.x, y: f.y, z: f.z, at: { x: h.x, y: h.y, z: h.z }, dist: h.dist };
    }
    if (!best) return false;
    this.dig = best;
    this.setMode('sniff');
    return true;
  }
  /** Stops, lifts its nose, sniffs the air, turns toward the rock. */
  doSniff(dt) {
    const g = this.dig;
    if (!g || this.pickFoe()) { this.setMode('follow'); return; }
    this.push(0, 0, 8, dt);
    this.feel('curious', { tilt: 0.8, sniff: 1, perk: 0.6, wag: 0.4 });
    this.lookAt.set(g.at.x, g.at.y, g.at.z);
    this.face(g.at.x, g.at.z, 3, dt);
    this.sniff(3);
    if (this.modeT > 1.1) { this.chirp(2, 1.25); this.setMode('dig'); }
  }
  /** Trots over and scratches at the rock: dust, pebbles, and a glint of what's inside. */
  doDig(dt) {
    const m = this.mgr, g = this.dig;
    if (!g || m.world.depState(g.d).taken) { this.dig = null; this.setMode('follow'); return; }
    const far = Math.hypot(g.x - this.pos.x, g.z - this.pos.z);
    this.lookAt.set(g.at.x, g.at.y, g.at.z);
    if (far > 0.3 && this.modeT < 6) { this.feel('happy', { happy: 0.3 }); if (this.walkTo(g.x, g.z, this.I.run * 0.7, dt, 0.25) === 'stuck') this.modeT = 6; return; }
    if (this.modeT > 6 && far > 0.6) { this.dig = null; this.setMode('follow'); return; }
    this.push(0, 0, 8, dt);
    this.face(g.at.x, g.at.z, 5, dt);
    this.digT = (this.digT || 0) + dt;
    // paw, paw, paw at the rock, nose down
    this.feel('eat', { wag: 1, crouch: 0.4 + 0.3 * Math.sin(this.digT * 18) });
    this.headDown = Math.sin(this.digT * 9) > -0.2 ? 1 : 0;
    if ((this.scrT = (this.scrT || 0) - dt) <= 0) {
      this.scrT = 0.22;
      const a = g.at, c = m.dustCol({ x: a.x, y: a.y + 0.1, z: a.z });
      m.fx.dust(a.x, a.y, a.z, 2, c, 0.05);
      pebbles(m.fx, a.x, a.y, a.z, 2, c.map((k) => k * 0.8), 0.06, 1);
      if (Math.random() < 0.55) this.voice('raptor_scratch', {}, 0.38);
      // a glint of the ore through the scratches
      const ore = MAT[ORE_BASE + g.d.oreId];
      if (ore?.accent !== undefined && Math.random() < 0.6) m.fx.twinkle?.(a.x + rand(-0.06, 0.06), a.y + rand(-0.06, 0.06), a.z + rand(-0.06, 0.06), col01(ore.accent), 0.01);
    }
    if (this.digT > 3.6) {
      this.digT = 0;
      this.stats.finds++;
      this.rec.finds = (this.rec.finds || 0) + 1;
      m.queueEv({ act: { type: 'tame', what: 'sniff', item: g.d.item } });
      this.chirp(3, 1.2);
      this.hop(1.5);
      this.found = { x: g.at.x, y: g.at.y, z: g.at.z, item: g.d.item, t: m.time };
      this.dig = null;
      this.setMode('follow');
    }
    // you stepped right in where it's digging: it hops aside
    const P = m.pl.pos;
    if (this.digT > 0.8 && Math.hypot(P.x - g.x, P.z - g.z) < 0.4) { this.dig = null; this.digT = 0; this.hop(1.4); this.setMode('follow'); }
  }
}

// Combat between the mole and the creatures.
//
// Their attacks → incoming(): every blow a creature lands goes through here. While the mole holds
// a guard (DigScene passes { blocking, blockT } to enemies.update; blockT = seconds since the guard
// went up) a blow from in front (within ~70° of where the mole looks) is blocked:
//   blocked   damage cut to a quarter (heavy blows: ~60%), half the shove, costs energy
//             → { damage, kind, push, blocked: true } + { energy } (DigScene: act block, perfect false)
//   parried   guard raised in the last PARRY seconds before the blow lands: no damage, the attacker
//             is thrown off balance (a short recoil, a brief opening); with the Riposte perk
//             (state.skill('riposte')) it staggers (stun 'parried') and stays open to a heavy counter
//             → { damage: 0, kind, push, blocked: true, parried: true } (DigScene: act block, perfect true)
// Heavy blows (red tell: troll smash, tyrant bite, golem slam, shellback tail club…) can't be
// parried and mostly get through a guard; ground shockwaves, spores, webs and drains can't be blocked.
// Holding the guard drains a little energy ({ energy } events, in half-point steps).
//
// The mole's blows → playerHit(): combos (hits within COMBO_WIN on the same creature count up; the
// third is a finisher), counters (a hit on an open creature after a parry is a crit), poise (enough
// blows stagger it and interrupt its wind-up), hit-stop (the creature freezes a few frames and the
// world should too: the returned { hitStop }), knockback scaled by all of it.
import * as THREE from 'three';
import { clamp, rand } from '../../core/util.js';
import { sparkle } from './fx.js';

export const PARRY = 0.2; // perfect-block window (s), widened by the 'block' skill
const COMBO_WIN = 1.05;
const GUARD_COS = Math.cos(1.22); // ±70° around the view
const HOLD_DRAIN = 0.9; // energy per second while the guard is up
// kinds of harm a guard can't stop
const UNBLOCKABLE = new Set(['quake', 'spores', 'web', 'drain_touch', 'acid', 'burn_ground']);
// can be blocked, but not parried (thrown things)
const NOPARRY = new Set(['fire', 'rock', 'acid_spit']);
const HEAVY = new Set([]);

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Combat {
  constructor(mgr) {
    this.mgr = mgr;
    this.blocking = false;
    this.blockT = 0;
    this.forced = null; // tests: { on, t0 }
    this.drain = 0;
    this.combo = { n: 0, t: -9, e: null };
    this.stats = { blocked: 0, parried: 0, hits: 0, crits: 0, finishers: 0, staggers: 0 };
    this.lastBlock = -9;
    this.log = []; // the last blows (tests)
  }

  /** A 'mult' skill (≥ 1). */
  skill(k) { const v = this.mgr.state?.skill?.(k); return typeof v === 'number' && v > 0 ? v : 1; }
  /** A perk: 0 (not taken), 1, or 2 (its follow-up). */
  perk(k) { const v = this.mgr.state?.skill?.(k); return typeof v === 'number' ? v : 0; }

  /** Once per frame, from Enemies.update. */
  frame(dt, o, events) {
    const f = this.forced;
    if (f) { this.blocking = !!f.on; this.blockT = f.on ? this.mgr.time - f.t0 : 0; } // tests
    else if (o.blocking !== undefined) { this.blocking = !!o.blocking; this.blockT = o.blockT ?? (this.blocking ? this.blockT + dt : 0); }
    else { this.blocking = false; this.blockT = 0; }
    if (this.blocking && !this.mgr.safe) {
      this.drain += dt * HOLD_DRAIN / this.skill('stamina');
      if (this.drain >= 0.5) { events.push({ energy: this.drain }); this.drain = 0; }
    }
  }

  /** Where the guard meets a blow from `src` (world point a little in front of the eye). */
  guardPoint(dx, dz, out = _a) {
    const e = this.mgr.eye, f = this.mgr.fwd;
    const l = Math.hypot(dx, dz) || 1;
    return out.set(e.x + f.x * 0.32 + dx / l * 0.12, e.y - 0.1 + f.y * 0.2, e.z + f.z * 0.32 + dz / l * 0.12);
  }

  /**
   * A creature's blow reaches the mole. Returns the event (already pushed) or null.
   * o: { heavy, unblockable, noParry, from: [x, y, z] (where it comes from; default the creature) }
   */
  incoming(src, n, push, kind, o = {}) {
    const m = this.mgr;
    const fromX = o.from ? o.from[0] : src.center?.x ?? src.pos?.x ?? m.eye.x;
    const fromZ = o.from ? o.from[2] : src.center?.z ?? src.pos?.z ?? m.eye.z;
    const heavy = o.heavy ?? HEAVY.has(kind);
    const rec = { t: +m.time.toFixed(2), kind, n, blockT: +this.blockT.toFixed(3), blocking: this.blocking };
    this.log.push(rec); if (this.log.length > 12) this.log.shift();
    const blockable = !o.unblockable && !UNBLOCKABLE.has(kind);
    let dx = fromX - m.eye.x, dz = fromZ - m.eye.z;
    const d = Math.hypot(dx, dz) || 1;
    const f = m.fwd, fl = Math.hypot(f.x, f.z) || 1;
    const facing = (dx * f.x + dz * f.z) / (d * fl);
    if (!(this.blocking && blockable && (facing > GUARD_COS || d < 0.25))) {
      const ev = { damage: n, kind, push };
      m.events.push(ev);
      return ev;
    }
    const sk = this.skill('block');
    const perfect = this.blockT <= PARRY * Math.min(1.6, sk) && !heavy && !o.noParry && !NOPARRY.has(kind);
    const g = this.guardPoint(dx, dz);
    const ev = { damage: 0, kind, push: [push[0] * 0.5, Math.min(push[1], 1.5) * 0.5, push[2] * 0.5], blocked: true };
    if (perfect) {
      ev.parried = true;
      ev.push = [push[0] * 0.15, 0, push[2] * 0.15];
      this.stats.parried++;
      // the attacker is thrown off balance; with the Riposte perk it reels, open to a heavy counter
      const ripo = this.perk('riposte');
      if (src.stun && src.alive) {
        if (ripo) { src.stun((src.info?.parryStun ?? 1.3) * (ripo > 1 ? 1.25 : 1), 'parried'); src.openT = 1.7; }
        else { src.stun(0.45, 'recoil'); src.openT = 0.6; }
        src.flashGold = 1;
        const l = Math.hypot(src.pos.x - m.pl.pos.x, src.pos.z - m.pl.pos.z) || 1;
        src.vel.x += (src.pos.x - m.pl.pos.x) / l * 2.2 / (src.mass || 1);
        src.vel.z += (src.pos.z - m.pl.pos.z) / l * 2.2 / (src.mass || 1);
      }
      m.audio?.play('parry', {});
      m.audio?.play('perfect', { vol: 0.5 });
      this.burst(g, 1.6, true);
      m.queueEv({ hitStop: 0.11 }); m.queueEv({ shake: 0.35 });
      m.owner?.vm?.guardHit?.(1.2, true);
      m.floatAt('PARRY!', g, '#ffe27a', 1.2);
      if (this.stats.parried === 1) m.say('parry1', this.perk('riposte') ? 'Perfect block! It\'s <b>reeling</b>: hit it now for a heavy counter.' : 'Perfect block! Strike back <b>right away</b> for a heavy counter.', 'good', 9999);
    } else {
      const k = heavy ? 0.6 : 0.25;
      ev.damage = Math.max(heavy ? 1 : 0, Math.round(n * k / sk));
      if (heavy) ev.push = [push[0] * 0.8, Math.min(push[1], 2) * 0.6, push[2] * 0.8];
      this.stats.blocked++;
      m.events.push({ energy: Math.round(n * (heavy ? 0.5 : 0.3) / sk * 10) / 10 });
      m.audio?.play('block', { heavy });
      this.burst(g, heavy ? 1.2 : 0.8, false);
      m.queueEv({ hitStop: heavy ? 0.07 : 0.045 }); m.queueEv({ shake: heavy ? 0.4 : 0.18 });
      m.owner?.vm?.guardHit?.(heavy ? 1.1 : 0.7, false);
      if (heavy && this.mgr.time - this.lastBlock > 0.5) m.say('heavyblock', 'That one was too <b>heavy</b> to block. When it glows <b>red</b>, get out of the way!', 'warn', 120);
    }
    this.lastBlock = m.time;
    // (DigScene turns blocked / parried events into act { type: 'block', perfect })
    m.events.push(ev);
    return ev;
  }

  /** Sparks where the guard took the blow. */
  burst(p, k, gold) {
    const fx = this.mgr.fx;
    fx.sparks(p.x, p.y, p.z, Math.round(10 * k), gold ? [1, 0.9, 0.45] : [1, 0.75, 0.4], [0, 0.6, 0], 3 * k);
    if (gold) {
      sparkle(fx, p.x, p.y, p.z, 14, [1, 0.95, 0.6], 2.6, 2, 0.02, 0.5);
      fx.spawn({ x: p.x, y: p.y, z: p.z, life: 0.16, size: 0.16, grow: 0.9, color: [1, 0.95, 0.75], glow: true, drag: 0 });
    } else fx.spawn({ x: p.x, y: p.y, z: p.z, life: 0.1, size: 0.08, grow: 0.5, color: [1, 0.8, 0.5], glow: true, drag: 0 });
  }

  /** The instant before a blow lands: a glint at the attacker's eye. */
  glint(e) {
    if (!this.mgr.near(e, 14)) return;
    const p = e.headPos(_b);
    const c = e.tellHeavy ? [1, 0.35, 0.2] : [1, 0.95, 0.7];
    this.mgr.fx.spawn({ x: p.x, y: p.y, z: p.z, life: 0.2, size: 0.05, grow: 0.25, color: c, glow: true, drag: 0 });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4;
      this.mgr.fx.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4, vz: 0, life: 0.14, size: 0.016, color: c, glow: true, drag: 6 });
    }
    this.mgr.sound(e.tellHeavy ? 'tell_heavy' : 'tell', {}, e.dist, e.center);
  }

  /**
   * The mole's pick lands on a creature. Mutates nothing but the creature; returns the blow:
   * { power (after combo/crit), tag: null | 'finisher' | 'crit', kb, hitStop, shake, combo }.
   */
  playerHit(e, power) {
    const m = this.mgr, c = this.combo, now = m.time;
    if (c.e === e && now - c.t < COMBO_WIN) c.n++; else c.n = 1;
    c.e = e; c.t = now;
    let mult = this.skill('damage'), tag = null, kb = 1;
    if (e.openT > 0 && !e.passive) { mult *= 2.5; tag = 'crit'; kb = 2.2; e.openT = 0; this.stats.crits++; }
    else if (c.n >= 3 && !e.passive) { mult *= 1.55; tag = 'finisher'; kb = 1.9; c.n = 0; this.stats.finishers++; }
    this.stats.hits++;
    const big = clamp((e.mass || 1) / 4, 0, 1);
    const blow = {
      power: power * mult, tag, kb, combo: tag === 'finisher' ? 3 : c.n,
      hitStop: tag === 'crit' ? 0.13 : tag === 'finisher' ? 0.1 : 0.055 + 0.02 * big,
      shake: tag ? 0.32 : 0.1 + 0.08 * big,
    };
    // poise: enough blows (or one heavy one) stagger it
    if (!e.passive && e.alive) {
      e.poise -= tag ? 99 : clamp(power / Math.max(0.5, m.hpScale(e.zone)), 0.5, 2);
      e.poiseT = 0;
      if (e.poise <= 0) {
        e.poise = e.maxPoise;
        e.stun(tag === 'crit' ? 1.3 : tag === 'finisher' ? 1 : 0.6, 'stagger');
        this.stats.staggers++;
      }
      e.freezeT = Math.max(e.freezeT, blow.hitStop * (e.info.noStun ? 0.5 : 1));
    }
    return blow;
  }

  /** Float text and sound for a blow's tag. */
  flourish(e, blow, p) {
    const m = this.mgr;
    if (blow.tag === 'crit') {
      m.floatAt('CRIT!', p, '#ffd84a', 1.4);
      sparkle(m.fx, p.x, p.y, p.z, 18, [1, 0.85, 0.35], 3.2, 3, 0.024, 0.7);
      m.audio?.play('smash', { vol: 1 });
      m.audio?.play('perfect', { vol: 0.6 });
    } else if (blow.tag === 'finisher') {
      m.floatAt('SMASH!', p, '#ffb070', 1.2);
      sparkle(m.fx, p.x, p.y, p.z, 10, [1, 0.7, 0.4], 2.6, 3, 0.02, 0.5);
      m.audio?.play('smash', { vol: 0.8 });
    } else if (blow.combo === 2) m.floatAt('×2', p, '#fff0c8', 0.8);
    m.audio?.play('thwack', { vol: 0.8, pitch: blow.combo === 2 ? 1.15 : rand(0.9, 1.05) });
  }
}

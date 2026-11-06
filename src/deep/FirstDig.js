// The mining lesson, in the real mine (lesson stage 'mine', until the copper is home: flag
// 'prologue'). Old Star saw you off at the cage; down here nothing is scripted. The HUD for digging
// comes in (belt, pick button, pack, radar, guard), one line says what to find, and the copper in
// his old dig (src/deep/gen/prologue.js: a grotto a short crawl east of the cage, its seams real
// deposits) glints with gold motes (src/home/tutorFx.js; an arrow at the screen edge while it's off
// screen). Each control is taught the moment it's first needed, by a small prompt:
//   dig       facing rock within reach                 → hold the left button / the pick button
//   pick up   a clump of ore broke out and lies nearby  → E / the hand
//   bag it    a clump in paw                            → chip the rock off (the chisel), then E
//   guard     something comes at you                    → the right button or F / the shield
// With copper in the pack the line says "ride home", the cage glints, and E at its bell rides
// straight home (home { from: 'lift' }: Old Star takes the lump; lessons.js). Riding the cage with
// no copper opens the usual lift panel.
// Acts: lesson { step: 'mine_ore' } (copper bagged), lesson { step: 'mine_done' } (riding home).
// DigScene hooks (as the other modules): update(dt, ctx) → events · use(eye, dir, reach) → events |
// null · dispose(). Test hooks: scene.firstDig.debug.{ on(), step(), copper(), ride() } and
// scene.debug.giveTutorialCopper().
import * as THREE from 'three';
import { prologueLayout } from './gen/prologue.js';
import { ITEMS } from '../data/items.js';
import { TUT } from '../ui/Onboard.js';
import { Glint } from '../home/tutorFx.js';

const _v = new THREE.Vector3();

export class FirstDig {
  constructor(ctx) {
    this.c = ctx;
    this.st = ctx.state;
    this.owner = ctx.owner;
    this.w = ctx.world;
    this.ui = ctx.ui;
    this.fx = ctx.fx;
    const st = this.st;
    this.on = st.data.oldstar?.lesson === 'mine' && !st.flag('prologue');
    this.debug = {
      on: () => this.on, step: () => this.step, copper: () => this.giveCopper(), ride: () => this.rideHome(),
      /** Stand a step in front of copper seam i, facing it (screenshots). */
      view: (i = 0, d = 1.0) => { const s = this.L?.seams?.[i]; if (!s) return false; const x = s.x + s.nx * d, z = s.z + s.nz * d; this.owner.debug?.teleport?.(x, s.fy + 0.03, z, Math.atan2(s.nx, s.nz), -0.2); return [x, s.fy, z]; },
      prompt: () => this.hFor || null,
    };
    if (this.owner?.debug) this.owner.debug.giveTutorialCopper = () => this.giveCopper();
    if (!this.on) return;
    const feat = ctx.plan?.features?.find((f) => f.kind === 'prologue');
    this.L = feat ? prologueLayout(feat) : null;
    this.lift = ctx.plan?.lifts?.find((l) => l.id === 'L0') || null;
    this.t = 0;
    this.copper0 = st.count('copper_ore');
    this.blocks0 = st.data.stats?.blocks || 0;
    this.step = this.copper0 > 0 ? 'home' : 'find';
    this.h = null;
    this.hFor = null;
    this.glint = null;
    this.markH = null;
    this.started = false;
    // the scene's own first-visit hints would say the same things again
    if (this.owner?.flags) { this.owner.flags.hintRadar = true; this.owner.flags.firstOre = true; }
  }

  get ob() { return this.ui?.onboard || null; }

  /** The copper seam to show: the nearest one still in the wall (null when all are dug). */
  seamTarget(eye) {
    const L = this.L;
    if (!L) return null;
    let best = null, bd = 1e9;
    L.seams.forEach((s, i) => {
      if (this.w.depositState?.get?.('acu0_' + i)?.taken) return;
      const d = Math.hypot(s.x - eye.x, (s.y - eye.y) * 1.5, s.z - eye.z);
      if (d < bd) { bd = d; best = s; }
    });
    return best ? _v.set(best.x + (best.nx || 0) * 0.12, best.y, best.z + (best.nz || 0) * 0.12).clone() : null;
  }

  /** A copper clump lying about (or null). */
  clumpTarget() {
    const cl = this.owner.clumps;
    if (!cl?.list) return null;
    for (const c of cl.list) if (c.state === 'world' && c.item === 'copper_ore') return c;
    for (const c of cl.list) if (c.state === 'world') return c;
    return null;
  }

  cagePos() { const l = this.lift; return l ? new THREE.Vector3(l.x, l.y + 1.1, l.z) : null; }

  /** What glints (and what the edge arrow points at). */
  aim(what, pos, label) {
    if (this.aimWhat === what) return;
    this.aimWhat = what;
    this.glint?.remove();
    this.markH?.remove();
    this.glint = pos ? new Glint(this.fx, pos, { r: what === 'cage' ? 0.32 : 0.16, rate: what === 'cage' ? 0.09 : 0.07 }) : null;
    this.markH = pos ? this.ob?.mark(pos, { edgeOnly: true, near: what === 'clump' ? null : 6, label }) : null;
  }

  /** One prompt at a time: `key` names what it's for, so it isn't shown twice in a row. */
  prompt(key, id, opts) {
    if (this.hFor === key && this.h && !this.h.settled) return this.h;
    this.h?.close?.();
    this.hFor = key;
    this.h = this.ob?.teach(id, opts) || null;
    return this.h;
  }

  unprompt(key) { if (this.hFor === key && this.h && !this.h.done) this.h.close(); if (this.hFor === key) { this.h = null; this.hFor = null; } }

  update(dt, { player, eye, busy }) {
    if (!this.on || this.leaving) return null;
    this.t += dt;
    const ob = this.ob, st = this.st, owner = this.owner, inp = owner.game.input;
    if (!this.started && this.t > 0.4) {
      this.started = true;
      this.ui.setTutorialLevel?.(TUT.GUARD);
      if (this.step === 'find') ob?.caption?.('The mine', 'Seven metres under the camp', 3.2);
    }
    if (!this.started) return null;
    this.glint?.update(dt);
    const cl = owner.clumps;
    if (this.step === 'find') {
      if (this.t > 1.4 && !ob?.goalHtml) ob?.goal('Find <b>copper ore</b>: orange specks in the rock');
      // what glints: a clump lying about, else the nearest seam
      const lying = this.clumpTarget();
      if (lying) this.aim('clump', () => lying.state === 'world' ? lying.pos : null, '');
      else this.aim('seam', () => this.seamTarget(owner.player.eye()), 'Copper');
      if (st.count('copper_ore') > this.copper0) { this.toHome(); return [{ act: { type: 'lesson', step: 'mine_ore' } }]; }
      if ((busy && !cl?.held) || this.t < 2.2) return null;
      // the prompts, most urgent first
      const threat = owner.enemies?.threat?.();
      if (threat && !this.guarded && threat.dist < 6) {
        this.prompt('guard', 'guard', { done: () => inp.isDown?.('KeyF') || !!inp.mouse?.buttons?.[2], min: 0.3, onDone: () => { this.guarded = true; } });
      } else if (cl?.held) {
        this.prompt('bag', 'use', { title: 'Bag it', subPc: 'Dig at it to chip the rock off (<kbd>2</kbd>: the chisel), then <kbd>E</kbd>', subT: 'Dig at it to chip the rock off, then tap the hand', done: () => !cl.held });
      } else if (lying && lying.pos && Math.hypot(lying.pos.x - player.pos.x, lying.pos.z - player.pos.z) < 2.6) {
        this.prompt('pickup', 'pickup', { done: () => !!cl.held });
      } else if (!this.dug) {
        const tg = owner.target;
        if (this.hFor !== 'dig' && tg && tg.dist < 2.2) {
          this.blocks0 = st.data.stats?.blocks || 0;
          this.prompt('dig', 'dig', { progress: () => ((st.data.stats?.blocks || 0) - this.blocks0) / 3, onDone: () => { this.dug = true; } });
        }
      } else if (this.hFor && this.hFor !== 'dig') this.unprompt(this.hFor);
    } else if (this.step === 'home') {
      if (this.t - (this.homeT || 0) > 1.3 && !ob?.goalHtml) ob?.goal('Ride <b>the cage</b> home to Old Star');
      this.aim('cage', () => this.cagePos(), 'The cage');
      const L = owner.liftNear?.();
      if (L && L.id === 'L0') this.prompt('ride', 'use', { title: 'Ride home', subPc: 'Ring the bell: <kbd>E</kbd>', subT: 'Tap the hand to ring the bell', done: () => !!this.leaving });
      else this.unprompt('ride');
    }
    return null;
  }

  /** Copper's in the pack: tick the line off, and point at the cage. */
  toHome() {
    this.step = 'home';
    this.homeT = this.t;
    this.h?.close?.();
    this.h = null;
    this.hFor = null;
    this.ob?.goalDone();
    this.owner.game.audio.play('success', { vol: 0.4 });
  }

  /** E at the cage's bell with the copper: straight home. */
  use() {
    if (!this.on || this.step !== 'home' || this.leaving) return null;
    const L = this.owner.liftNear?.();
    if (!L || L.id !== 'L0') return null;
    this.rideHome();
    return [{ act: { type: 'lesson', step: 'mine_done' } }];
  }

  rideHome() {
    if (this.leaving) return false;
    this.leaving = true;
    this.h?.close?.();
    this.glint?.remove();
    this.markH?.remove();
    const a = this.owner.game.audio;
    a.play('bell', { vol: 0.7 });
    this.owner.shake?.(0.15);
    this.ob?.goal(null);
    this.owner.rideLift?.('home');
    return true;
  }

  /** Test hook: copper in the pack, as if dug and bagged. */
  giveCopper() {
    const st = this.st;
    if (ITEMS.copper_ore) st.addItem('copper_ore', { q: 80, spill: true });
    if (this.on && this.step === 'find') this.toHome();
    return st.count('copper_ore');
  }

  dispose() {
    this.h?.close?.();
    this.glint?.remove();
    this.markH?.remove();
  }
}

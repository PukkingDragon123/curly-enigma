// The mining lesson, in the real mine (lesson stage 'mine', until the copper is home: flag
// 'prologue'). Old Star saw you off at the cage; down here nothing is scripted and nothing is on
// screen (wave 18: no cards, no objective line): what you've been given so far (your pick on the belt,
// his satchel; no radar, no map yet: those come once you've been down), and the copper in his old dig
// (src/deep/gen/prologue.js: a grotto a short crawl east of the cage, its seams real deposits) glints
// with gold motes (src/home/tutorFx.js). A control is named the moment it's first needed by a few
// voxel words floating in the world where you're looking (teachWord), not a card:
//   dig       facing rock within reach                 → "hold left click"
//   bag it    a clump in paw                            → the chisel's key, then "E to bag it"
//   guard     something comes at you                    → "right click to block" (it unlocks then:
//             ui.unlock('guard'))
// With copper in the pack the cage glints ("ring the bell" floats by it), and E at its bell rides
// straight home (home { from: 'lift' }: Old Star takes the lump; lessons.js). Riding the cage with
// no copper opens the usual lift panel.
// Teaching by showing (wave 12), a few floating words at most: the first time you come up to the
// copper, the rock round it is struck as if by an unseen pick (cracks spread, chips fly: "Dig round
// the ore") and pale glints mark where to hit; the lump comes free ("It's free!"); in paw, the chisel
// is lit on the belt and the clump's rock glints where it wants chipping; clean, "Bag it".
// Acts: lesson { step: 'mine_ore' } (copper bagged), lesson { step: 'mine_done' } (riding home).
// DigScene hooks (as the other modules): update(dt, ctx) → events · use(eye, dir, reach) → events |
// null · dispose(). Test hooks: scene.firstDig.debug.{ on(), step(), copper(), ride() } and
// scene.debug.giveTutorialCopper().
import * as THREE from 'three';
import { prologueLayout, prologueInside } from './gen/prologue.js';
import { ITEMS } from '../data/items.js';
import { Glint, teachWord } from '../home/tutorFx.js';
import { hotbarOf } from '../core/hotbar.js';
import { AIR, ROCK, SOFT } from './clumps/grid.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
/** How often a cue's words float up again while it isn't done (s), and how many times at most. */
const CUE_EVERY = 7, CUE_MAX = 3;

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
      demo: () => ({ on: !!this.demo, done: !!this.demoDone, n: this.demo?.n ?? 0 }),
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
    // nothing is put down in the crawl or in front of the seams while you're learning (props are
    // placed per chunk, later)
    const props = this.owner?.props;
    if (props && typeof props.blocked === 'function' && this.L) {
      const orig = props.blocked, L = this.L;
      props.blocked = function (x, y, z, pad = 0.3) { return prologueInside(L, x, y, z, pad) || orig.call(this, x, y, z, pad); };
      this.unpatch = () => { props.blocked = orig; };
    }
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
  aim(what, pos) {
    if (this.aimWhat === what) return;
    this.aimWhat = what;
    this.glint?.remove();
    this.markH?.remove();
    this.glint = pos ? new Glint(this.fx, pos, { r: what === 'cage' ? 0.32 : 0.16, rate: what === 'cage' ? 0.09 : 0.07 }) : null;
    this.markH = null; // (wave 18: no arrow on screen: the glint, and the words when it matters)
  }

  /**
   * One cue at a time (wave 18: in-world words, no card): `key` names what it's for. opts: { word,
   * at() → world point (default: just ahead of your eyes), done() → bool, onDone(), progress() → 0..1 }.
   * The words float up where you're looking, again now and then (a few times) until it's done.
   */
  prompt(key, id, opts) {
    if (this.hFor === key && this.h && !this.h.settled) return this.h;
    this.h?.close?.();
    this.hFor = key;
    const h = { id, key, opts, t: CUE_EVERY - 0.4, n: 0, done: false, settled: false };
    h.close = () => { h.settled = true; };
    h.complete = () => { if (h.done) return; h.done = true; h.settled = true; try { opts.onDone?.(); } catch (e) { /* noop */ } };
    this.h = h;
    return h;
  }

  unprompt(key) { if (this.hFor === key && this.h && !this.h.done) this.h.close(); if (this.hFor === key) { this.h = null; this.hFor = null; } }

  /** Just ahead of your eyes, a little low (where a cue's words float up). */
  ahead(d = 1.1, dy = -0.12) {
    const cam = this.owner.camera, e = this.owner.player.eye();
    cam?.getWorldDirection?.(_d);
    return new THREE.Vector3(e.x + _d.x * d, e.y + _d.y * d + dy, e.z + _d.z * d);
  }

  /** The cue's life: done yet? else float its words now and then. */
  tickCue(dt) {
    const h = this.h;
    if (!h || h.settled) return;
    const o = h.opts;
    let done = false;
    try { done = !!o.done?.() || (o.progress && o.progress() >= 1); } catch (e) { done = true; }
    if (done) { h.complete(); return; }
    h.t += dt;
    if (h.t < CUE_EVERY || h.n >= CUE_MAX || !o.word) return;
    h.t = 0;
    h.n++;
    let p = null;
    try { p = o.at?.() || null; } catch (e) { p = null; }
    teachWord(this.owner.game, o.word, p || this.ahead(), { life: 2.6, size: 0.6 });
  }

  update(dt, ctx) {
    if (!this.on || this.leaving) return null;
    const r = this.step0(dt, ctx);
    this.tickCue(dt);
    return r;
  }

  step0(dt, { player, eye, busy }) {
    this.t += dt;
    const ob = this.ob, st = this.st, owner = this.owner, inp = owner.game.input;
    if (!this.started && this.t > 0.4) {
      this.started = true;
      // (you have your pick: a game picked up here from before the unlocks gets what it needs)
      this.ui.unlock?.(['look', 'move', 'use', 'belt', 'dig'], { quiet: true });
    }
    if (!this.started) return null;
    this.glint?.update(dt);
    const cl = owner.clumps;
    if (this.step === 'find') {
      // (the copper named once, in the world, the first time it's in sight)
      if (!this.named && this.t > 1.4) { const sp = this.seamTarget(owner.player.eye()); if (sp && sp.distanceTo(owner.player.eye()) < 7) { this.named = true; teachWord(owner.game, 'Copper', sp.add(new THREE.Vector3(0, 0.58, 0)), { kind: 'gold', life: 2.6, size: 0.6 }); } }
      // what glints: a clump lying about, else the nearest seam
      const lying = this.clumpTarget();
      if (lying) this.aim('clump', () => (lying.state === 'world' ? lying.pos : null));
      else this.aim('seam', () => this.seamTarget(owner.player.eye()));
      if (st.count('copper_ore') > this.copper0) { this.toHome(); return [{ act: { type: 'lesson', step: 'mine_ore' } }]; }
      this.showDig(dt, lying);
      if (cl?.held) this.showChip(dt, cl.held);
      if ((busy && !cl?.held) || this.t < 2.2) return null;
      // the prompts, most urgent first
      const threat = owner.enemies?.threat?.();
      if (threat && !this.guarded && threat.dist < 6) {
        this.ui.unlock?.('guard');
        this.prompt('guard', 'guard', { word: 'Right click to block', done: () => inp.isDown?.('KeyF') || !!inp.mouse?.buttons?.[2], onDone: () => { this.guarded = true; } });
      } else if (cl?.held) {
        // in paw: the chisel first (lit on the belt), then chip (the rock glints: showChip), then bag it
        const c = cl.held, clean = (c.g?.clean ?? 0) >= 0.8 || this.chipped > 14, touch = document.documentElement.classList.contains('is-touch');
        if (!clean && owner.slotName !== 'chisel' && !this.hadChisel) {
          const k = hotbarOf(st).indexOf('chisel') + 1;
          // (on a phone the line sits low, clear of the clump's tag; the ring goes on the chisel's own slot)
          const slot = k > 0 ? document.querySelectorAll('#ui .belt .loop')[k - 1] : null;
          void slot; void touch;
          this.prompt('chisel', 'tool', { word: k > 0 ? `${k} for the chisel` : 'Wheel to the chisel', done: () => owner.slotName === 'chisel', onDone: () => { this.hadChisel = true; } });
        } else if (clean) this.prompt('bag', 'use', { word: 'E to bag it', done: () => !cl.held });
        else if (this.hFor === 'chisel' && this.h?.done) { this.h = null; this.hFor = null; }
      } else if (!this.dug) {
        const tg = owner.target;
        if (this.hFor !== 'dig' && tg && tg.dist < 2.2) {
          this.blocks0 = st.data.stats?.blocks || 0;
          this.prompt('dig', 'dig', { word: 'Hold left click', at: () => this.ahead(0.9, -0.05), progress: () => ((st.data.stats?.blocks || 0) - this.blocks0) / 3, onDone: () => { this.dug = true; } });
        }
      } else if (this.hFor && this.hFor !== 'dig') this.unprompt(this.hFor);
    } else if (this.step === 'home') {
      this.aim('cage', () => this.cagePos());
      const L = owner.liftNear?.();
      if (L && L.id === 'L0') this.prompt('ride', 'use', { word: 'E to ring the bell', at: () => this.cagePos(), done: () => !!this.leaving });
      else this.unprompt('ride');
    }
    return null;
  }

  /**
   * The first time you come up to the copper: the rock round the seam takes three blows as if from
   * an unseen pick (cracks spread from each, chips fly), and "Dig round the ore" floats up. Until
   * your first dig, pale glints mark those spots. When the lump comes free: "It's free!".
   */
  showDig(dt, lying) {
    const owner = this.owner, fx = this.fx;
    if (lying && !this.freed) {
      this.freed = true;
      // (a lump already lying there when you came down isn't news)
      if (this.demo || this.demoDone || this.dug) {
        teachWord(owner.game, 'It\'s free!', lying.pos.clone().add(new THREE.Vector3(0, 0.25, 0)), { kind: 'good', life: 1.8 });
        owner.game.audio.play('good', { vol: 0.3 });
      }
      this.endDemo();
      return;
    }
    if (lying || this.freed) return;
    const eye = owner.player.eye();
    const s = this.seamNear(eye);
    if (!s) return;
    const d = Math.hypot(s.x - eye.x, s.z - eye.z);
    if (!this.demo && !this.demoDone && d < 4.2) this.startDemo(s);
    const D = this.demo;
    if (D) {
      D.t += dt;
      while (D.n < D.spots.length && D.t > 0.35 + D.n * 0.5) this.demoBlow(D, D.n++);
      if (D.n === 2 && !D.said) { D.said = true; teachWord(owner.game, 'Dig round the ore', new THREE.Vector3(s.x + s.nx * 0.15, s.y + 0.32, s.z + s.nz * 0.15), { life: 3 }); }
      if (D.t > 6) this.endDemo();
    }
    // pale glints on the spots to hit, until you've dug a bit
    if (this.demoDone && !this.dug && this.spots) {
      this.tapT = (this.tapT ?? 0) - dt;
      if (this.tapT <= 0) { this.tapT = 0.45; const p = this.spots[(Math.random() * this.spots.length) | 0]; fx.glints?.(p.x, p.y, p.z, [0.85, 0.92, 1]); }
    }
  }

  /** The seam the lesson shows (as seamTarget, the record). */
  seamNear(eye) {
    const L = this.L;
    if (!L) return null;
    let best = null, bd = 1e9;
    L.seams.forEach((s, i) => {
      if (this.w.depositState?.get?.('acu0_' + i)?.taken) return;
      const d = Math.hypot(s.x - eye.x, s.y - eye.y, s.z - eye.z);
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  }

  startDemo(s) {
    // the face's axis (cracks lie on axis faces) and the spots round the ore: either side and below
    const ax = Math.abs(s.nx || 0) > Math.abs(s.nz || 0);
    const n = ax ? [Math.sign(s.nx), 0, 0] : [0, 0, Math.sign(s.nz)];
    const tx = ax ? 0 : 1, tz = ax ? 1 : 0, r = Math.max(0.2, (s.r || 0.15) + 0.12);
    const base = new THREE.Vector3(s.x + n[0] * 0.07, s.y, s.z + n[2] * 0.07);
    const spots = [[tx * r, 0, tz * r], [-tx * r, 0.04, -tz * r], [0, -r * 0.9, 0]].map(([a, b, c]) => base.clone().add(new THREE.Vector3(a, b, c)));
    this.demo = { t: 0, n: 0, s, nrm: n, spots, said: false };
    this.spots = spots;
  }

  demoBlow(D, i) {
    const owner = this.owner, fx = this.fx, p = D.spots[i], n = D.nrm;
    owner.cracks?.hit(-71 - i, [p.x, p.y, p.z], n, 0.75, null);
    fx.chips?.(p.x + n[0] * 0.03, p.y, p.z + n[2] * 0.03, 9, [0.46, 0.4, 0.34], [n[0] * 0.8, 0.4, n[2] * 0.8]);
    fx.dust?.(p.x + n[0] * 0.05, p.y, p.z + n[2] * 0.05, 3, [0.5, 0.44, 0.38], 0.05);
    const a = owner.game.audio;
    a.play('hit', { snd: 'stone', vol: 0.45 });
    if (i === 2) a.play('debris', { vol: 0.3 });
  }

  endDemo() {
    if (!this.demo) return;
    for (let i = 0; i < 3; i++) this.owner.cracks?.clear(-71 - i);
    this.demo = null;
    this.demoDone = true;
  }

  /**
   * A clump in paw: with the chisel out, pale glints over its rock where it touches air (where to
   * chip), and the first chips that come off are counted (then: "Bag it").
   */
  showChip(dt, c) {
    const g = c.g, cl = this.owner.clumps;
    if (!g?.kind || !cl?.cellWorld) return;
    const cnt = this.lastRock;
    let rock = 0;
    if ((this.rockT = (this.rockT ?? 0) - dt) <= 0) {
      this.rockT = 0.3;
      for (let i = 0; i < g.kind.length; i++) if (g.kind[i] === ROCK || g.kind[i] === SOFT) rock++;
      if (cnt != null && rock < cnt) this.chipped = (this.chipped || 0) + 1;
      this.lastRock = rock;
      if (this.owner.slotName !== 'chisel' || g.clean >= 0.8) return;
      // a random bit of rock on the outside
      const N = g.n, K = g.kind;
      for (let k = 0; k < 60; k++) {
        const i = (Math.random() * K.length) | 0;
        if (K[i] !== ROCK && K[i] !== SOFT) continue;
        const x = i % N, y = ((i / N) | 0) % N, z = (i / (N * N)) | 0;
        if (x < 1 || y < 1 || z < 1 || x >= N - 1 || y >= N - 1 || z >= N - 1) continue;
        if (K[i + 1] !== AIR && K[i - 1] !== AIR && K[i + N] !== AIR && K[i - N] !== AIR && K[i + N * N] !== AIR && K[i - N * N] !== AIR) continue;
        const p = cl.cellWorld(c, i, new THREE.Vector3());
        this.fx.twinkle?.(p.x, p.y, p.z, [0.86, 0.92, 1], 0.006);
        break;
      }
    }
  }

  /** Copper's in the pack: tick the line off, and point at the cage. */
  toHome() {
    this.step = 'home';
    this.homeT = this.t;
    this.h?.close?.();
    this.h = null;
    this.hFor = null;
    this.owner.game.audio.play('success', { vol: 0.4 });
    // (a few words where you're looking: home with it)
    teachWord(this.owner.game, 'Take it home', this.ahead(1.2, 0.05), { kind: 'good', life: 2.6, size: 0.65 });
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
    this.endDemo();
    this.unpatch?.();
    this.h?.close?.();
    this.glint?.remove();
    this.markH?.remove();
  }
}

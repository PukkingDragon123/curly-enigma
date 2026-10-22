// Foraging minigame: pressing E on a cave plant opens this overlay with the plant drawn big in
// pixel art, and you work it out of the ground by hand (src/cooking/forage.js says how):
//   pull  grip and drag up (ceiling plants: down) with the tension needle in the green band;
//         wiggle sideways to loosen the roots first; too hard strains the stem until it snaps
//   peel  grip a moss mat's edge and drag it sideways, slow and steady (sparkmoss zaps)
//   pick  tap the ripe berries, leave the green ones
//   dig   scrub the soil off (wiggle), then ease it out (a grub wriggles against you)
//   lift  raise an egg slowly and lean against its wobble
// Mouse (also with the pointer locked: the paw is the cursor), touch, or keys (Space/E grip,
// W/S or ↑/↓ pull, A/D or ←/→ wiggle). Esc lets go and leaves the plant where it is.
//
//   const r = await openForage(game, { id: 'glowcap', protects: { heat, cold, zap } });
//   r → { cancel } | { id, q, p, n, snapped, torn, damage, kind, say, word }
//
// Test hook: window.__forage = { open(id, opts), sim(id, script, opts), active }. sim() runs the
// simulation headless with a scripted input ('good' | 'yank' | 'soft' | fn(t, sim) → input) and
// returns the result; with an overlay open, __forage.active.drive(script, seconds) plays it there.
import { el, clamp } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';
import { FORAGE, TECH_WORD, PULL_TIP, forageSpec } from '../cooking/forage.js';
import {
  FW, FH, SOIL, PX, Frame, blit, backdrop, plantSprite, mossSprite, bushSprite, berry, buriedSprite, pawSprite,
  gauge, hmeter, iconRoots, iconArrow, iconFlame, shadeC, rnd, pocket,
} from '../cooking/forageArt.js';

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const bushOrigin = (b) => [Math.round(PX - b.w / 2 + 6), SOIL - b.h + 4];
const skillK = (state) => Math.max(1, (typeof state?.skill === 'function' && state.skill('forage')) || 1);

// ================================================================ simulations
class Sim {
  constructor(id, spec, o = {}) {
    this.id = id;
    this.s = spec;
    this.o = o;
    this.t = 0;
    this.ev = [];
    this.done = null; // the result once finished
    this.r = rnd(o.seed ?? 7);
    this.k = o.skill || 1; // forage skill: kinder bands
  }
  emit(type, d = {}) { this.ev.push({ type, ...d }); }
  finish(r) { if (!this.done) { this.done = { id: this.id, n: 1, burns: this.burns || 0, zaps: this.zaps || 0, spores: this.spores || 0, t: Math.round(this.t * 10) / 10, ...r }; this.emit(r.snapped || r.broke ? 'snap' : 'pop'); } }
}

/** Grip + tension + wiggle: the core of pull and dig. */
class PullSim extends Sim {
  constructor(id, spec, o) {
    super(id, spec, o);
    const [lo, hi] = spec.band;
    const w = (hi - lo) * (this.k - 1) * 0.5;
    this.lo = Math.max(0.05, lo - w * 0.5); this.hi = hi + w * 0.5; this.snapAt = (spec.snap || hi + 0.3) + w * 0.5;
    this.prog = 0; this.loose = 0; this.strain = 0; this.peak = 0; this.pv = 0;
    this.ext = 0; this.dir = 0; this.wig = 0;
    this.heat = 0; this.burns = 0; this.numb = 0; this.lock = 0;
    this.spores = 0; this.sporeCd = 0;
    this.creakT = 0;
    this.par = spec.hold * 2.4 + 3.5;
    this.wasGrip = false;
  }
  bandAt() { return [this.lo, this.hi]; }
  update(dt, inp) {
    if (this.done) return;
    const s = this.s;
    this.t += dt;
    this.lock = Math.max(0, this.lock - dt);
    const grip = inp.grip && this.lock <= 0;
    if (grip && !this.wasGrip) this.emit('grip');
    if (!grip && this.wasGrip) this.emit('release');
    this.wasGrip = grip;
    const want = grip ? clamp(inp.pull, 0, 1.45) : 0;
    const prev = this.pv;
    this.pv = damp(this.pv, want, grip ? 16 : 9, dt);
    // wiggling: each swing back the other way loosens the roots
    if (grip) this.track(clamp(inp.wx, -1, 1));
    else { this.dir = 0; this.ext = 0; this.turn = 0; this.wx = damp(this.wx || 0, 0, 8, dt); }
    this.wig = Math.max(0, this.wig - dt * 3);
    // the pull
    const [lo, hi] = this.bandAt();
    const pv = this.pv;
    if (pv >= lo) {
      const into = clamp((pv - lo) / Math.max(0.05, hi - lo), 0, 1.5);
      const rate = (0.4 + 0.7 * into) * (0.4 + 0.9 * this.loose) / s.hold;
      this.prog += rate * dt * (s.float ? 1.25 : 1);
    } else if (!grip) this.prog = Math.max(0, this.prog - dt * 0.04);
    if (s.float && grip && pv > 0.03) this.prog += dt * 0.06;
    // strain: above the band the stem stretches thin, past the snap point it tears fast
    if (pv > hi) this.strain += dt * ((pv - hi) / Math.max(0.05, this.snapAt - hi)) * (s.glass ? 1.9 : 1.15);
    if (pv > this.snapAt) this.strain += dt * (s.glass ? 3.4 : 2.4);
    if (pv <= hi) this.strain = Math.max(0, this.strain - dt * 0.55);
    this.peak = Math.max(this.peak, this.strain);
    if (this.strain > 0.35) {
      this.creakT -= dt;
      if (this.creakT <= 0) { this.creakT = 0.32 - this.strain * 0.2; this.emit('creak', { k: this.strain }); }
    }
    // yanks puff spores (gloomshroom)
    this.sporeCd = Math.max(0, this.sporeCd - dt);
    if (s.spores && grip && (pv - prev) / Math.max(dt, 1e-3) > 2.6 && this.sporeCd <= 0) { this.spores++; this.sporeCd = 0.8; this.emit('spore'); }
    // fire and frost
    const hot = (s.hot && !this.o.protects?.heat) || (s.cold && !this.o.protects?.cold);
    if (hot) {
      if (grip) this.heat += dt * (s.hot ? 0.24 : 0.18); else this.heat = Math.max(0, this.heat - dt * 0.35);
      if (this.heat >= 1) {
        this.heat = 0.3; this.lock = 0.9;
        if (s.hot) { this.burns++; this.emit('burn'); } else { this.numb++; this.emit('numb'); }
      }
    }
    if (this.strain >= 1) {
      const q = clamp(Math.round(26 + this.prog * 26 - this.burns * 5), 8, 52);
      this.finish({ q, p: false, snapped: true, word: s.form === 'cap' ? 'The stem snapped! Only the cap came away.' : 'Snap! The top tore off.' });
      return;
    }
    if (this.prog >= 1) this.popOut();
  }
  /** Sideways swings: each turn back the other way is one wiggle, as big as the swing. */
  track(wx) {
    this.wx = wx;
    if (!this.dir) { this.dir = wx >= (this.ext || 0) ? 1 : -1; this.ext = wx; this.turn = wx; return; }
    if (this.dir > 0) {
      if (wx > this.ext) this.ext = wx;
      else if (wx < this.ext - 0.12) { this.wiggle(this.ext - this.turn); this.turn = this.ext; this.ext = wx; this.dir = -1; }
    } else {
      if (wx < this.ext) this.ext = wx;
      else if (wx > this.ext + 0.12) { this.wiggle(this.turn - this.ext); this.turn = this.ext; this.ext = wx; this.dir = 1; }
    }
  }
  wiggle(amp) {
    if (amp < 0.22) return;
    const g = (this.s.twist ? 0.12 : 0.09) * this.k * Math.min(1.6, amp);
    this.loose = Math.min(1, this.loose + g * (1 - this.loose * 0.35));
    this.wig = 1;
    this.emit('wiggle', { amp });
  }
  popOut() {
    const s = this.s;
    const need = s.needLoose ?? 0.4;
    const short = Math.max(0, need - this.loose) / Math.max(0.1, need);
    const torn = short > 0.18;
    let q = 100;
    q -= short * 40;
    q -= Math.max(0, this.peak - 0.3) * 34;
    q -= this.spores * 7 + this.burns * 12 + this.numb * 7;
    q -= Math.max(0, this.t - this.par) * 1.6;
    q = clamp(Math.round(q), 12, 100);
    const p = !torn && this.peak < 0.5 && q >= 88;
    const word = p ? 'Whole, roots and all!' : torn ? 'Out, but the roots tore.' : this.peak > 0.6 ? 'Out, a bit bruised.' : q >= 75 ? 'Nice and clean.' : 'Out it comes.';
    this.finish({ q, p, torn, word, loose: this.loose });
  }
  result() { return this.done; }
}

/** Dig: scrub the cover away, then a gentle pull (wriggle: the good band sways). */
class DigSim extends PullSim {
  constructor(id, spec, o) {
    super(id, { needLoose: 0.85, hold: spec.hold || 1, ...spec }, o);
    this.cover = 1; this.phase = 'dig'; this.scrubs = 0;
  }
  bandAt() {
    if (!this.s.wriggle) return [this.lo, this.hi];
    const sw = Math.sin(this.t * 2.1) * 0.16 + Math.sin(this.t * 3.7) * 0.05;
    return [this.lo + sw, this.hi + sw];
  }
  wiggle(amp) {
    if (amp < 0.2) return;
    if (this.phase === 'dig') {
      this.cover = Math.max(0, this.cover - 0.1 * this.k * Math.min(1.6, amp));
      this.scrubs++;
      this.wig = 1;
      this.emit('wiggle', { amp, dig: true });
      if (this.cover <= 0.12) { this.phase = 'pull'; this.loose = 1; this.emit('exposed'); }
      return;
    }
    super.wiggle(amp);
  }
  update(dt, inp) {
    if (this.done) return;
    if (this.phase === 'dig') {
      this.t += dt;
      const grip = inp.grip;
      if (grip && !this.wasGrip) this.emit('grip');
      this.wasGrip = grip;
      if (grip) this.track(clamp(inp.wx, -1, 1));
      else { this.dir = 0; this.ext = 0; this.turn = 0; }
      this.wig = Math.max(0, this.wig - dt * 3);
      // pulling on it while still buried just strains it
      if (grip && inp.pull > (this.s.snap || 0.8)) { this.strain += dt * 0.8; this.peak = Math.max(this.peak, this.strain); }
      else this.strain = Math.max(0, this.strain - dt * 0.5);
      if (this.strain >= 1) this.finish({ q: 18, p: false, snapped: true, word: this.s.fragile ? 'It crumbled in the soil!' : 'Squished it. Oops.' });
      return;
    }
    super.update(dt, inp);
  }
  popOut() {
    super.popOut();
    if (this.done) {
      const d = this.done;
      d.q = clamp(Math.round(d.q - Math.max(0, this.scrubs - 14) * 0.8), 12, 100);
      d.word = d.p ? (this.id === 'grub' ? 'Got it, wriggling and whole!' : 'A perfect, whole truffle!') : d.word;
    }
  }
}

/** Peel a mat off the wall, right to left. */
class PeelSim extends Sim {
  constructor(id, spec, o) {
    super(id, spec, o);
    this.p = 0; this.v = 0; this.tear = 0; this.rips = 0; this.zaps = 0;
    this.zapT = 2 + this.r() * 1.2; this.warn = 0; this.lock = 0; this.wasGrip = false;
    this.kv = 0;
  }
  update(dt, inp) {
    if (this.done) return;
    const s = this.s;
    this.t += dt;
    this.lock = Math.max(0, this.lock - dt);
    const grip = inp.grip && this.lock <= 0;
    if (grip && !this.wasGrip) this.emit('grip');
    this.wasGrip = grip;
    // speed: leftward drag (fraction of the scene width per second)
    const v = grip ? Math.max(0, -inp.vx) : 0;
    this.v = damp(this.v, v, 10, dt);
    const [lo, hi] = s.speed;
    const hi2 = hi * (1 + (this.k - 1) * 0.5);
    if (grip && this.v >= lo * 0.6) this.p += Math.min(this.v, hi2 * 1.2) * dt * 0.9;
    if (grip && this.v > hi2) {
      this.tear += dt * (this.v - hi2) * 6;
      if (this.tear >= 1) { this.tear = 0; this.rips++; this.emit('tear'); }
    } else this.tear = Math.max(0, this.tear - dt * 0.8);
    // sparkmoss: a crackle, then a zap
    if (s.zap && !this.o.protects?.zap) {
      if (this.warn > 0) {
        this.warn -= dt;
        if (this.warn <= 0) {
          this.emit('zapflash');
          if (grip) { this.zaps++; this.lock = 0.8; this.emit('zap'); }
          this.zapT = 1.6 + this.r() * 1.6;
        }
      } else {
        this.zapT -= dt;
        if (this.zapT <= 0) { this.warn = 0.75; this.emit('crackle'); }
      }
    }
    if (this.p >= 1) {
      let q = 100 - this.rips * 15 - this.zaps * 10 - Math.max(0, this.t - 7) * 1.5;
      q = clamp(Math.round(q), 12, 100);
      const p = this.rips === 0 && this.zaps === 0 && q >= 88;
      this.finish({ q, p, word: p ? 'One whole, unbroken mat!' : this.rips ? `Peeled, in ${this.rips + 1} pieces.` : 'Peeled off.' });
    }
  }
}

/** Pick the ripe berries. */
class PickSim extends Sim {
  constructor(id, spec, o) {
    super(id, spec, o);
    this.limit = 10;
    this.berries = [];
    this.picked = 0; this.squashed = 0;
    this.spots = o.spots || [];
    const n = this.spots.length;
    const ripeN = Math.max(4, Math.round(n * 0.6));
    const order = this.spots.map((_, i) => i).sort(() => this.r() - 0.5);
    this.spots.forEach((sp, i) => this.berries.push({ x: sp.x, y: sp.y, ripe: order.indexOf(i) < ripeN, state: 'on', t: 0 }));
    this.ripeN = this.berries.filter((b) => b.ripe).length;
  }
  tap(x, y) {
    if (this.done) return;
    let best = null, bd = 5.5;
    for (const b of this.berries) { if (b.state !== 'on') continue; const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
    if (!best) { this.emit('miss', { x, y }); return; }
    best.t = 0;
    if (best.ripe) { best.state = 'picked'; this.picked++; this.emit('pick', { x: best.x, y: best.y, n: this.picked }); }
    else { best.state = 'squashed'; this.squashed++; this.emit('squash', { x: best.x, y: best.y }); }
    if (this.picked >= this.ripeN) this.end();
  }
  update(dt, inp) {
    if (this.done) return;
    this.t += dt;
    for (const b of this.berries) b.t += dt;
    if (inp.tap) this.tap(inp.px, inp.py);
    if (this.t >= this.limit) this.end();
  }
  end() {
    const frac = this.picked / Math.max(1, this.ripeN);
    let q = 100 * frac - this.squashed * 14 + (frac >= 1 ? Math.max(0, (this.limit - this.t) * 1.5) : 0);
    q = clamp(Math.round(q), this.picked ? 12 : 0, 100);
    if (!this.picked) { this.finish({ q: 0, n: 0, empty: true, word: 'Nothing picked...' }); return; }
    const n = this.picked >= 6 ? 2 : 1;
    const p = frac >= 1 && this.squashed === 0 && q >= 90;
    this.finish({ q, p, n, word: p ? 'Every ripe berry, not one squashed!' : this.squashed ? `${this.picked} picked, ${this.squashed} squashed.` : `${this.picked} of ${this.ripeN} ripe ones.` });
  }
}

/** Lift an egg slowly, leaning against its wobble. */
class LiftSim extends Sim {
  constructor(id, spec, o) {
    super(id, spec, o);
    this.h = 0; this.tilt = 0; this.tv = 0; this.drift = 0; this.driftT = 0; this.cracks = 0; this.peakTilt = 0;
    this.holdT = 0; this.wasGrip = false; this.lock = 0;
  }
  update(dt, inp) {
    if (this.done) return;
    this.t += dt;
    this.lock = Math.max(0, this.lock - dt);
    const grip = inp.grip && this.lock <= 0;
    if (grip && !this.wasGrip) this.emit('grip');
    this.wasGrip = grip;
    const target = grip ? clamp(inp.pull, 0, 1.2) : 0;
    const prevH = this.h;
    this.h = damp(this.h, target, grip ? 3.2 : 6, dt);
    const speed = Math.abs(this.h - prevH) / Math.max(dt, 1e-3);
    // the wobble: random drift, grows with height and with jerky lifting; leaning (wx) fights it
    this.driftT -= dt;
    if (this.driftT <= 0) { this.driftT = 0.6 + this.r() * 0.7; this.drift = (this.r() - 0.5) * 1.3; }
    const unstable = 0.5 + this.h * 1.3 + Math.max(0, speed - 0.45) * 4;
    this.tv += (this.drift * unstable * 1.6 + this.tilt * unstable * 2.2 - clamp(inp.wx, -1, 1) * 3.6) * dt;
    this.tv *= Math.exp(-1.6 * dt);
    if (this.h < 0.04) { this.tv *= 0.5; this.tilt *= Math.exp(-4 * dt); }
    this.tilt += this.tv * dt;
    this.peakTilt = Math.max(this.peakTilt, Math.abs(this.tilt) * Math.min(1, this.h * 3));
    if (Math.abs(this.tilt) > 1 && this.h > 0.08) {
      this.cracks++;
      this.emit('crack', { side: Math.sign(this.tilt) });
      this.tilt = 0; this.tv = 0; this.h = 0; this.lock = 0.7;
      if (this.cracks >= 3) { this.finish({ q: 15, p: false, broke: true, snapped: true, word: 'Cracked... it will still cook.' }); return; }
    }
    if (this.h > 0.92 && Math.abs(this.tilt) < 0.6) {
      this.holdT += dt;
      if (this.holdT > 0.8) {
        let q = 100 - this.cracks * 24 - Math.max(0, this.peakTilt - 0.55) * 40 - Math.max(0, this.t - 8) * 1.5;
        q = clamp(Math.round(q), 12, 100);
        const p = this.cracks === 0 && q >= 88;
        this.finish({ q, p, word: p ? 'Not a scratch on it!' : this.cracks ? 'Got it. A hairline crack or two.' : 'Lifted out safely.' });
      }
    } else this.holdT = 0;
  }
}

const SIMS = { pull: PullSim, dig: DigSim, peel: PeelSim, pick: PickSim, lift: LiftSim };
export function makeSim(id, spec = forageSpec(id), o = {}) { return new (SIMS[spec.tech] || PullSim)(id, spec, o); }

// ================================================================ scripted input (tests)
/** Script → input function for headless runs: 'good' plays it well, 'yank' too hard, 'soft' too gently. */
export function scriptInput(kind, sim) {
  if (typeof kind === 'function') return kind;
  const s = sim.s;
  if (s.tech === 'pick') {
    return (t) => {
      const b = sim.berries.find((x) => x.state === 'on' && (kind === 'good' ? x.ripe : !x.ripe || x.ripe));
      const tap = b && Math.floor(t * 4) !== Math.floor((t - 1 / 30) * 4);
      return { tap: !!tap, px: b?.x ?? 0, py: b?.y ?? 0, grip: false };
    };
  }
  if (s.tech === 'peel') {
    const v = kind === 'yank' ? -s.speed[1] * 3 : kind === 'soft' ? -s.speed[0] * 0.3 : -(s.speed[0] + s.speed[1]) / 2;
    return () => ({ grip: !(sim.warn > 0), vx: v, wx: 0, pull: 0 });
  }
  if (s.tech === 'lift') {
    return (t) => ({ grip: true, pull: kind === 'yank' ? 1.2 : Math.min(1.05, t * 0.3), wx: kind === 'good' ? clamp(sim.tilt * 1.2 + sim.tv * 0.6, -1, 1) : 0 });
  }
  if (kind === 'rush') return () => { const [lo, hi] = sim.bandAt(); return { grip: true, pull: (lo + hi) / 2, wx: 0, vx: s.speed ? -(s.speed[0] + s.speed[1]) / 2 : 0 }; };
  // pull / dig: wiggle first (good), then a pull in the band
  return (t) => {
    const [lo, hi] = sim.bandAt();
    const mid = (lo + hi) / 2;
    const loosening = kind === 'good' && (sim.loose < (s.needLoose ?? 0.4) + 0.12 || sim.phase === 'dig');
    const pull = kind === 'yank' ? (s.snap || 1) + 0.3 : kind === 'soft' ? lo * 0.6 : loosening ? lo * 0.5 : mid;
    return { grip: true, pull, wx: loosening ? Math.sin(t * 9) * 0.8 : 0 };
  };
}

/** Run a forage headless (no DOM). Returns the result. */
export function simulate(id, script = 'good', o = {}) {
  const spec = forageSpec(id);
  if (spec.tech === 'pick' && !o.spots) { const b = bushSprite(spec, spec.berries || 11, o.seed ?? 7); const [bx, by] = bushOrigin(b); o = { ...o, spots: b.spots.map((p) => ({ x: p.x + bx, y: p.y + by })) }; }
  const sim = makeSim(id, spec, o);
  const fn = scriptInput(script, sim);
  const dt = 1 / 30;
  let t = 0;
  while (!sim.done && t < (o.max ?? 30)) { sim.update(dt, { grip: false, pull: 0, wx: 0, vx: 0, ...fn(t, sim) }); t += dt; }
  return sim.done || { cancel: true, timeout: true };
}

// ================================================================ the overlay
const CSS = /* css */`
.modal-back > .panel.sheet.fg-panel { width: auto; display: flex; flex-direction: column; align-items: center; gap: calc(var(--px) * 2); padding: calc(var(--px) * 1) calc(var(--px) * 2) calc(var(--px) * 2); animation: fgIn .35s cubic-bezier(.2,1.5,.4,1); }
@keyframes fgIn { from { transform: translateY(calc(var(--px) * 30)) rotate(-2deg) scale(.92); opacity: 0; } }
.panel.fg-panel > .close { display: none; }
.fg-head { display: flex; align-items: center; gap: calc(var(--px) * 3); width: 100%; }
.fg-head img { width: var(--icon-s); height: var(--icon-s); image-rendering: pixelated; }
.fg-name { font-family: var(--font-head, var(--font-display)); font-size: 1.5em; line-height: 1; color: var(--sepia, #5a3a20); }
.fg-verb { margin-left: auto; font-family: var(--font-display); font-size: 1.45em; line-height: 1; color: #fff4d0; padding: 0 calc(var(--px) * 3) calc(var(--px) * .5);
  background: #a8402a; box-shadow: 0 0 0 var(--px) #4a1a10, inset 0 calc(var(--px) * -1) 0 #6a2414; transform: rotate(-3deg); animation: fgVerb .9s ease-in-out infinite alternate; }
@keyframes fgVerb { to { transform: rotate(2deg) scale(1.06); } }
.fg-stage { position: relative; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab;
  box-shadow: 0 0 0 var(--px) #1a0e08, 0 0 0 calc(var(--px) * 3) #6a4428, 0 0 0 calc(var(--px) * 4) #2a160c; margin: calc(var(--px) * 3) 0 calc(var(--px) * 2); }
.fg-stage.gripping { cursor: grabbing; }
.fg-stage canvas { display: block; image-rendering: pixelated; image-rendering: crisp-edges; }
.fg-fx { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.fg-pop { position: absolute; transform: translate(-50%, -50%); font-family: var(--font-display); font-size: calc(var(--px) * 9); white-space: nowrap; color: #fff;
  text-shadow: 0 var(--px) 0 #000, var(--px) 0 0 #000, calc(var(--px) * -1) 0 0 #000, 0 calc(var(--px) * -1) 0 #000, 0 calc(var(--px) * 2) 0 rgba(0,0,0,.5); animation: fgPop .9s ease-out forwards; }
@keyframes fgPop { 0% { transform: translate(-50%, -50%) scale(.4); } 20% { transform: translate(-50%, -70%) scale(1.25); } 100% { transform: translate(-50%, -160%) scale(1); opacity: 0; } }
.fg-hint { max-width: calc(var(--px) * 160); text-align: center; font-size: .9em; line-height: 1.3; color: var(--ink, #3a2414); min-height: 2.6em; }
.fg-hint b { color: #a8402a; }
.fg-keys { font-size: .7em; color: var(--ink-soft, #7a5a3a); text-align: center; }
.fg-keys b { color: #a8402a; }
.fg-keys kbd { font-size: .9em; }
.fg-result { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); min-width: 56%; padding: calc(var(--px) * 4) calc(var(--px) * 6); text-align: center;
  background: #f4e4c0; color: #3a2414; box-shadow: 0 0 0 var(--px) #000, inset 0 0 0 var(--px) #c8a870, 0 calc(var(--px) * 3) 0 rgba(0,0,0,.4); animation: fgRes .45s cubic-bezier(.2,1.7,.4,1); }
@keyframes fgRes { from { transform: translate(-50%, -50%) scale(.3) rotate(-6deg); opacity: 0; } }
.fg-result img { width: var(--icon); height: var(--icon); image-rendering: pixelated; display: block; margin: 0 auto; animation: fgSpin .6s cubic-bezier(.2,1.7,.4,1); }
@keyframes fgSpin { from { transform: scale(0) rotate(-90deg); } }
.fg-result .q { font-family: var(--font-display); font-size: 1.9em; line-height: 1; }
.fg-result .w { font-size: .85em; margin-top: var(--px); }
.fg-result .stars { letter-spacing: .1em; color: #d89a10; font-size: 1.1em; }
.fg-result .stars i { font-style: normal; color: #c8b090; }
.fg-result .stamp { position: absolute; right: calc(var(--px) * -6); top: calc(var(--px) * -5); transform: rotate(10deg); font-family: var(--font-display); font-size: 1.1em; color: #fff;
  background: #3a8a3a; padding: 0 calc(var(--px) * 2); box-shadow: 0 0 0 var(--px) #1a3a12; animation: fgStamp .4s cubic-bezier(.2,1.6,.4,1) .3s both; }
.fg-result .stamp.bad { background: #a8302a; box-shadow: 0 0 0 var(--px) #3a1010; }
@keyframes fgStamp { from { transform: rotate(10deg) scale(3); opacity: 0; } }
@media (max-height: 500px) { .fg-hint { min-height: 0; font-size: .78em; } .fg-keys { display: none; } .fg-name { font-size: 1.2em; } .fg-verb { font-size: 1.15em; } }
`;
let styled = false;
function ensureCss() { if (!styled) { styled = true; document.head.append(el('style', { id: 'fg-styles' }, CSS)); } }

const isTouch = () => document.documentElement.classList.contains('is-touch');

class ForageView {
  constructor(game, id, opts) {
    ensureCss();
    this.game = game;
    this.audio = game.audio;
    this.id = id;
    this.spec = forageSpec(id);
    const s = this.spec;
    this.opts = opts;
    this.seed = opts.seed ?? ((id.length * 977 + Math.floor(Math.random() * 1000)) | 0);
    this.kind = s.tech === 'peel' ? 'wall' : s.tech === 'lift' ? 'nest' : s.tech === 'pick' ? 'bush' : 'floor';
    this.flip = s.form === 'hang';
    this.bg = backdrop(this.kind, this.seed);
    this.frame = new Frame();
    this.parts = [];
    this.shake = 0;
    this.time = 0;
    this.endT = -1;
    this.paw = { x: PX + 16, y: SOIL - 18, open: pawSprite(false), grip: pawSprite(true) };
    if (s.tech === 'pull') this.plant = plantSprite(id, s);
    if (s.tech === 'peel') this.moss = mossSprite(s, this.seed);
    if (s.tech === 'dig') this.buried = buriedSprite(id, s);
    let spots;
    if (s.tech === 'pick') {
      this.bush = bushSprite(s, s.berries || 11, this.seed);
      [this.bushX, this.bushY] = bushOrigin(this.bush);
      spots = this.bush.spots.map((p) => ({ x: p.x + this.bushX, y: p.y + this.bushY }));
    }
    this.sim = makeSim(id, s, { protects: opts.protects, skill: skillK(game.state), seed: this.seed, spots });
    this.inp = { grip: false, pull: 0, wx: 0, vx: 0, px: this.paw.x, py: this.paw.y, tap: false };
    this.keys = new Set();
    this.build();
  }

  // ------------------------------------------------------------ DOM
  build() {
    const s = this.spec, it = ITEMS[this.id];
    const word = s.twist ? TECH_WORD.twist : TECH_WORD[s.tech] || 'PULL!';
    this.cv = el('canvas', { width: FW, height: FH });
    this.ctx = this.cv.getContext('2d');
    this.fx = el('div', { class: 'fg-fx' });
    this.stage = el('div', { class: 'fg-stage' }, [this.cv, this.fx]);
    const touch = isTouch();
    const how = {
      pull: touch ? 'Hold on the plant and <b>drag ' + (this.flip ? 'down' : 'up') + '</b>' : '<kbd>Hold</kbd> mouse and drag ' + (this.flip ? 'down' : 'up') + ' · or <kbd>Space</kbd> + <kbd>W</kbd>/<kbd>S</kbd>',
      dig: touch ? 'Scrub <b>side to side</b>, then drag up' : '<kbd>Hold</kbd> and scrub sideways, then drag up · or <kbd>Space</kbd> + <kbd>A</kbd>/<kbd>D</kbd>, <kbd>W</kbd>',
      peel: touch ? 'Hold and <b>drag left</b>, slowly' : '<kbd>Hold</kbd> and drag left slowly · or hold <kbd>A</kbd>',
      pick: touch ? '<b>Tap</b> the ripe berries' : '<kbd>Click</kbd> the ripe berries · or arrows + <kbd>Space</kbd>',
      lift: touch ? 'Hold, <b>drag up</b> slowly, lean left/right against the wobble' : '<kbd>Hold</kbd> and drag up slowly · lean with left/right · or <kbd>W</kbd> <kbd>A</kbd>/<kbd>D</kbd>',
    }[s.tech];
    this.hintEl = el('div', { class: 'fg-hint', html: s.tip || PULL_TIP });
    this.body = el('div', { class: 'fg-wrap' }, [
      el('div', { class: 'fg-head' }, [el('img', { src: iconURL(this.id), alt: '' }), el('span', { class: 'fg-name' }, it?.name || this.id), el('span', { class: 'fg-verb' }, word)]),
      this.stage,
      this.hintEl,
      el('div', { class: 'fg-keys', html: how + (touch ? '' : ' · <kbd>Esc</kbd> leave it') }),
    ]);
    this.body.style.display = 'contents';
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const vw = window.innerWidth, vh = window.innerHeight;
    const kMax = Math.min((vw - 72) / FW, (vh - (vh < 500 ? 104 : 196)) / FH);
    let k = Math.floor(kMax * dpr) / dpr;
    if (k >= 3) k = Math.floor(kMax);
    k = Math.max(1.5, k);
    this.scale = k;
    this.cv.style.width = `${FW * k}px`;
    this.cv.style.height = `${FH * k}px`;
  }

  // ------------------------------------------------------------ input
  attach(handle) {
    const st = this.stage;
    this.locked = () => !!document.pointerLockElement;
    const toFrame = (e) => {
      const r = this.cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * FW, y: (e.clientY - r.top) / r.height * FH };
    };
    const down = (e) => {
      if (this.sim.done) { this.skip = true; return; }
      if (!this.locked() && !st.contains(e.target)) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      this.game.audio.init?.();
      this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, lx: 0, ly: 0, lockd: this.locked() };
      if (!this.locked()) { const p = toFrame(e); this.inp.px = p.x; this.inp.py = p.y; this.paw.x = p.x; this.paw.y = p.y; }
      this.inp.tap = true;
      st.classList.add('gripping');
      try { if (!this.locked() && e.pointerId !== undefined) st.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    };
    const move = (e) => {
      if (this.locked()) {
        const mx = e.movementX || 0, my = e.movementY || 0;
        const k = FW / (this.cv.getBoundingClientRect().width || 1);
        this.inp.px = clamp(this.inp.px + mx * k * 1.4, 0, FW - 1);
        this.inp.py = clamp(this.inp.py + my * k * 1.4, 0, FH - 1);
        if (this.pointer) { this.pointer.lx += mx; this.pointer.ly += my; }
        this.lastMove = { dx: mx, dy: my, t: performance.now() };
        return;
      }
      if (this.pointer && e.pointerId !== this.pointer.id && e.pointerType !== 'mouse') return;
      const p = toFrame(e);
      if (this.pointer) { this.pointer.x = e.clientX; this.pointer.y = e.clientY; }
      if (!this.pointer || this.spec.tech === 'pick') { this.inp.px = p.x; this.inp.py = p.y; }
    };
    const up = (e) => {
      if (!this.pointer) return;
      if (e.pointerId !== undefined && this.pointer.id !== undefined && e.pointerId !== this.pointer.id && !this.locked()) return;
      this.pointer = null;
      st.classList.remove('gripping');
    };
    const kd = (e) => {
      if (e.repeat) return;
      if (this.sim.done && ['Space', 'Enter', 'KeyE'].includes(e.code)) { this.skip = true; return; }
      this.keys.add(e.code);
      if (['Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'Enter'].includes(e.code)) e.preventDefault();
      if (this.spec.tech === 'pick' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE')) this.inp.tap = true;
    };
    const ku = (e) => this.keys.delete(e.code);
    const blur = () => { this.keys.clear(); this.pointer = null; };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    this.detach = () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', this.onResize);
    };
    this.handle = handle;
  }

  /** Pointer + keys → the sim's input for this frame. */
  readInput(dt) {
    const inp = this.inp;
    const k = this.keys;
    const s = this.spec;
    const p = this.pointer;
    const r = this.cv.getBoundingClientRect();
    const H = r.height || FH * this.scale, W = r.width || FW * this.scale;
    const kGrip = k.has('Space') || k.has('KeyE') || k.has('Enter');
    const up = k.has('KeyW') || k.has('ArrowUp'), dn = k.has('KeyS') || k.has('ArrowDown');
    const lf = k.has('KeyA') || k.has('ArrowLeft'), rt = k.has('KeyD') || k.has('ArrowRight');
    let grip = !!p, pull = 0, wx = 0, vx = 0;
    if (p) {
      const dx = p.lockd ? p.lx * 1.4 : p.x - p.ox, dy = p.lockd ? p.ly * 1.4 : p.y - p.oy;
      pull = clamp((this.flip ? dy : -dy) / (H * 0.42), 0, 1.45);
      wx = clamp(dx / (W * 0.16), -1, 1);
      const mx = dx - (this.prevDx ?? dx);
      this.prevDx = dx;
      vx = (mx / W) / Math.max(dt, 1e-3);
    } else this.prevDx = undefined;
    // keyboard
    if (s.tech === 'pick') {
      const sp = 40 * dt;
      if (up) inp.py -= sp; if (dn) inp.py += sp; if (lf) inp.px -= sp; if (rt) inp.px += sp;
      inp.px = clamp(inp.px, 0, FW - 1); inp.py = clamp(inp.py, 0, FH - 1);
    } else if (kGrip || (s.tech === 'peel' && lf)) {
      grip = true;
      this.kPull = clamp((this.kPull || 0) + ((up ? 0.85 : 0) - (dn ? 1.3 : 0)) * dt, 0, 1.45);
      if (!up && !dn && s.tech === 'lift') this.kPull = clamp(this.kPull, 0, 1.2);
      pull = Math.max(pull, this.kPull);
      wx = lf ? -0.9 : rt ? 0.9 : wx;
      if (s.tech === 'peel') { this.kv = lf ? Math.min(0.9, (this.kv || 0) + dt * 0.9) : Math.max(0, (this.kv || 0) - dt * 2.5); vx = -this.kv; }
    } else { this.kPull = Math.max(0, (this.kPull || 0) - dt * 2); this.kv = 0; }
    // pointer-locked peel: speed from the last mouse movement
    if (p && p.lockd && s.tech === 'peel') {
      const lm = this.lastMove;
      vx = lm && performance.now() - lm.t < 80 ? (lm.dx * 1.4 / W) / Math.max(dt, 1 / 120) : 0;
      this.lastMove = null;
    }
    inp.grip = grip; inp.pull = pull; inp.wx = wx; inp.vx = vx;
    return inp;
  }

  // ------------------------------------------------------------ frame
  tick(dt, scripted = null) {
    this.time += dt;
    const inp = scripted ? { px: this.inp.px, py: this.inp.py, ...scripted } : this.readInput(dt);
    if (scripted && scripted.px !== undefined) { this.inp.px = scripted.px; this.inp.py = scripted.py; }
    this.sim.update(dt, inp);
    this.inp.tap = false;
    for (const e of this.sim.ev) this.onEvent(e);
    this.sim.ev.length = 0;
    this.updateParts(dt);
    this.shake = Math.max(0, this.shake - dt * 5);
    if (this.sim.done && this.endT < 0) { this.endT = 0; this.showResult(); }
    if (this.endT >= 0) this.endT += dt;
    if (this.card && !this.card.isConnected && this.endT >= this.cardAt && !this.closed) this.fx.append(this.card);
    this.draw();
  }

  // ------------------------------------------------------------ sounds + particles per event
  onEvent(e) {
    const a = this.audio, s = this.spec;
    const base = this.stemPoint();
    switch (e.type) {
      case 'grip': a.play('brush', { vol: 0.35 }); break;
      case 'wiggle': {
        a.noise({ color: 'brown', filter: 'lowpass', f: 380 + Math.random() * 160, dur: 0.12, vol: 0.12 + e.amp * 0.08 });
        if (e.dig) a.play('dig', { vol: 0.25 });
        this.crumbs(base.x + (Math.random() - 0.5) * 8, SOIL - 1, 4 + Math.round(e.amp * 4), e.dig ? 1.3 : 1);
        break;
      }
      case 'creak': a.tone({ f: 90 + e.k * 200, f2: 70 + e.k * 140, type: 'sawtooth', dur: 0.14, vol: 0.05 + e.k * 0.05, filter: 'lowpass', ff: 900 }); this.shake = Math.max(this.shake, 0.25 + e.k * 0.4); break;
      case 'spore': {
        a.play('sneeze', { vol: 0.5 });
        for (let i = 0; i < 26; i++) this.part(base.x + (Math.random() - 0.5) * 12, base.y - 20 - Math.random() * 8, (Math.random() - 0.5) * 30, -10 - Math.random() * 20, 0xc8a0e8, 1.2 + Math.random(), -6, true);
        this.float('Achoo!', '#c8a0e8');
        break;
      }
      case 'burn': a.play('sizzle'); a.play('hurt', { vol: 0.5 }); this.float('Ow! Hot!', '#ff9a4a'); this.shake = 1; this.burnFx(); break;
      case 'numb': a.play('freeze', { vol: 0.6 }); this.float('Brr! Numb paws', '#bff6ff'); this.shake = 0.6; break;
      case 'crackle': a.play('buzz', { vol: 0.4 }); break;
      case 'zapflash': a.play('zap', { vol: 0.6 }); for (let i = 0; i < 14; i++) this.part(30 + Math.random() * 50, 20 + Math.random() * 40, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0xc8f4ff, 0.3, 0, true); break;
      case 'zap': a.play('hurt', { vol: 0.5 }); this.float('ZAP!', '#7fe7ff'); this.shake = 1; break;
      case 'tear': a.noise({ color: 'white', filter: 'bandpass', f: 1800, q: 1.4, dur: 0.18, vol: 0.18 }); this.float('Rip!', '#ff9a8a'); this.shake = 0.5; this.crumbs(this.peelEdge(), 40, 6, 1, s.col.b); break;
      case 'pick': a.play('pickup', { pitch: 1 + e.n * 0.06 }); a.play('click', { vol: 0.4 }); this.flyBerry(e.x, e.y); break;
      case 'squash': a.play('bloop', { pitch: 0.7 }); a.noise({ color: 'pink', filter: 'lowpass', f: 600, dur: 0.12, vol: 0.15 }); this.float('Not ripe!', '#9ac85a'); for (let i = 0; i < 8; i++) this.part(e.x, e.y, (Math.random() - 0.5) * 40, -Math.random() * 30, 0x9ac85a, 0.5, 60); break;
      case 'miss': break;
      case 'crack': a.play('crack', { vol: 0.6 }); a.play('oops', { vol: 0.5 }); this.float('Crack!', '#ff9a8a'); this.shake = 1; break;
      case 'exposed': a.play('ding', { vol: 0.5 }); this.float(this.id === 'grub' ? 'There it is!' : 'Uncovered!', '#ffe066'); break;
      case 'pop': this.popFx(); break;
      case 'snap': this.snapFx(); break;
    }
  }

  stemPoint() { return { x: PX, y: SOIL }; }
  peelEdge() { return Math.round(28 + 64 * (1 - (this.sim.p || 0))); }

  part(x, y, vx, vy, c, life = 0.8, g = 140, glow = false) { if (this.parts.length < 260) this.parts.push({ x, y, vx, vy, c, life, t: 0, g, glow }); }
  crumbs(x, y, n, k = 1, c = null) {
    for (let i = 0; i < n; i++) {
      const col = c ?? [0x6a4a30, 0x5a3e28, 0x8a6a48, 0x4c3422][Math.floor(Math.random() * 4)];
      this.part(x + (Math.random() - 0.5) * 4, y - Math.random() * 2, (Math.random() - 0.5) * 50 * k, -20 - Math.random() * 45 * k, col, 0.5 + Math.random() * 0.5);
    }
  }
  updateParts(dt) {
    for (const p of this.parts) { p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.glow && p.y > FH + 2) p.t = p.life; }
    this.parts = this.parts.filter((p) => p.t < p.life);
  }
  float(text, color) {
    const n = el('div', { class: 'fg-pop', style: { left: `${30 + Math.random() * 40}%`, top: `${30 + Math.random() * 15}%`, color } }, text);
    this.fx.append(n);
    setTimeout(() => n.remove(), 950);
  }
  burnFx() { for (let i = 0; i < 18; i++) this.part(this.paw.x + (Math.random() - 0.5) * 10, this.paw.y, (Math.random() - 0.5) * 20, -20 - Math.random() * 30, Math.random() < 0.5 ? 0xffa030 : 0x6a6060, 0.8, -10, true); }
  flyBerry(x, y) { this.part(x, y, (8 - x) * 1.6, -60, this.spec.ripe, 0.55, 220); for (let i = 0; i < 4; i++) this.part(x, y, (Math.random() - 0.5) * 30, -Math.random() * 30, 0xffe0e8, 0.3, 60, true); }
  popFx() {
    const s = this.spec, a = this.audio;
    a.play('bloop', { pitch: 1.2 });
    a.tone({ f: 380, f2: 980, type: 'square', dur: 0.12, vol: 0.08 });
    a.play('pickup', { pitch: 1.1 });
    if (this.sim.done?.p) { a.play('perfect', { vol: 0.6 }); a.play('sparkle', { vol: 0.5 }); }
    this.shake = 0.8;
    if (s.tech === 'pull' || s.tech === 'dig') {
      this.crumbs(PX, SOIL, 26, 1.6);
      for (let i = 0; i < 10; i++) this.part(PX + (Math.random() - 0.5) * 6, SOIL - 2, (Math.random() - 0.5) * 70, -40 - Math.random() * 60, 0xfff4c0, 0.6, 80, true);
    }
    this.float(this.sim.done?.p ? 'POP! Perfect!' : 'POP!', this.sim.done?.p ? '#ffe066' : '#fff4d8');
  }
  snapFx() {
    const a = this.audio;
    a.play('crack', { vol: 0.7 }); a.play('oops', { vol: 0.6 });
    this.shake = 1;
    this.crumbs(PX, SOIL - 4, 10, 1.2, this.spec.col?.stem ?? 0x8a9c7c);
    this.float(this.spec.tech === 'lift' ? 'Crack...' : 'SNAP!', '#ff9a8a');
  }

  // ------------------------------------------------------------ drawing
  draw() {
    const f = this.frame;
    f.copy(this.bg);
    const s = this.spec;
    if (s.tech === 'pull') this.drawPull(f);
    else if (s.tech === 'dig') this.drawDig(f);
    else if (s.tech === 'peel') this.drawPeel(f);
    else if (s.tech === 'pick') this.drawPick(f);
    else if (s.tech === 'lift') this.drawLift(f);
    if (this.flip) f.flipY();
    for (const p of this.parts) {
      const a = 1 - p.t / p.life;
      const y = this.flip && !p.ui ? FH - 1 - p.y : p.y;
      if (p.glow) f.add(p.x, y, p.c, a); else f.set(p.x, y, p.c);
    }
    this.drawMeters(f);
    this.ctx.putImageData(f.img, 0, 0);
    const sh = this.shake;
    this.cv.style.transform = sh > 0.01 ? `translate(${((Math.random() - 0.5) * sh * 4).toFixed(1)}px, ${((Math.random() - 0.5) * sh * 4).toFixed(1)}px)` : '';
  }

  drawPaw(f, x, y, grip, flipY = false) {
    const sp = grip ? this.paw.grip : this.paw.open;
    blit(f, sp, Math.round(x - sp.hx), Math.round(y - sp.hy), flipY ? { fn: undefined } : {});
  }

  /** The pull scene: soil cracks, mound, the plant (rising, stretching), roots in the soil, the paw. */
  drawPull(f) {
    const sim = this.sim, s = this.spec, sp = this.plant;
    const done = sim.done;
    const endT = this.endT;
    // soil cracks spreading from the stem as the roots loosen
    this.drawCracks(f, sim.loose);
    // how far the plant has come up, and how far the stem stretches
    let lift = Math.round(sim.prog * Math.min(6, s.depth * 0.35));
    let stretch = Math.round(sim.pv * (s.stretchy ? 9 : 3.5) + sim.strain * 2);
    let topLift = 0;
    let snapRow = -1;
    if (done && !done.snapped) {
      const k = Math.min(1, endT / 0.45);
      const up = (1 - (1 - k) * (1 - k)) * (sp.rootEnd - sp.ay + 4) + (k >= 1 ? Math.sin(endT * 5) * 1.5 : 0);
      lift = Math.round(lift + up);
      stretch = Math.round(stretch * (1 - k));
    } else if (done && done.snapped) {
      snapRow = sp.ay - 3;
      topLift = Math.round(Math.min(1, endT / 0.5) * 50);
    }
    const ox = PX - sp.ax, oyBase = SOIL - sp.ay - lift;
    const torn = done?.torn ? sp.ay + Math.round((sp.rootEnd - sp.ay) * clamp(sim.loose / (s.needLoose || 0.4), 0.2, 0.8)) : sp.rootEnd + 99;
    const heat = sim.heat || 0;
    const strainC = sim.strain;
    const glow = s.glow;
    if (glow) f.halo(PX, SOIL - 18 - lift - stretch, 22, glow, 0.22 + 0.06 * Math.sin(this.time * 3));
    const tint = (x, y, c, sx, sy) => {
      if (sy >= torn && done) return -1;
      let col = c;
      if (sy < sp.ay - 1 && strainC > 0.3) col = shadeC(col, 1 + (strainC - 0.3) * 0.5 * (0.6 + 0.4 * Math.sin(this.time * 30)));
      if (heat > 0.4 && sy < sp.ay) col = shadeC(col, 1 + (heat - 0.4) * 0.6);
      if (y >= SOIL + 1) return shadeC(mixc(col, 0x4c3422, 0.18), 0.82); // in its pocket under the soil
      return col;
    };
    // torn roots stay behind in the soil
    if (done?.torn) blit(f, sp, ox, SOIL - sp.ay, { r0: torn, r1: sp.h, fn: (x, y, c) => (y > SOIL ? shadeC(mixc(c, 0x3a2616, 0.35), 0.7) : -1) });
    // below the stretch line (the rooted part), in a dark pocket that widens as the roots loosen
    if (!done || done.snapped) pocket(f, sp, ox, oyBase, sp.ay - 1, SOIL, 1 + Math.round(sim.loose * 1.4));
    blit(f, sp, ox, oyBase, { r0: sp.ay - 1, r1: sp.h, fn: tint });
    // the stretched stem: repeat the row just above the soil line
    const rowY = sp.ay - 2;
    for (let k = 0; k < stretch; k++) {
      for (let sx = 0; sx < sp.w; sx++) {
        const c = sp.col[rowY * sp.w + sx];
        if (c < 0) continue;
        const thin = stretch > 4 && (sx === sp.ax - 2 || sx === sp.ax + 2) && k > 1;
        if (thin) continue;
        f.set(ox + sx, oyBase + sp.ay - 1 - k - 1, tint(ox + sx, oyBase + sp.ay - 2 - k, c, sx, rowY));
      }
    }
    // the top part
    const r1 = snapRow >= 0 ? snapRow : sp.ay - 1;
    blit(f, sp, ox + (snapRow >= 0 ? Math.round(Math.sin(endT * 9) * 3) : 0), oyBase - stretch - topLift, { r0: 0, r1, fn: tint });
    // the soil heaves up round the stem while you pull
    const heave = Math.round(clamp(sim.pv - sim.lo * 0.6, 0, 1) * 2 + sim.loose * 1.2);
    for (let d = -6; d <= 6; d++) {
      const h = Math.round(heave * (1 - Math.abs(d) / 7));
      for (let k = 1; k <= h; k++) f.set(PX + d, SOIL - k, k === h ? 0x8a6a48 : 0x6a4a30);
    }
    if (done && !done.snapped) {
      // the hole it came out of
      for (let d = -3; d <= 3; d++) for (let k = 0; k < 3 - Math.abs(d) * 0.5; k++) f.set(PX + d, SOIL + 1 + k, 0x1e140c);
    }
    // the paw
    const gy = SOIL - (SOIL - (sp.gripY - sp.ay + SOIL)) - lift - stretch;
    const gripping = !!this.sim.wasGrip && !done;
    if (gripping || (done && !done.snapped && endT < 0.6)) {
      this.drawPaw(f, PX - 1 + Math.round((sim.wx || 0) * 2), gy, true);
      // leaves and caps above the fist stay in front of it: the paw only hides the stem it grips
      const cut = Math.max(0, sp.gripY - 5);
      if (cut > 0) blit(f, sp, ox, oyBase - stretch - topLift, { r0: 0, r1: Math.min(cut, r1), fn: tint });
    }
    else this.drawPaw(f, PX + 14, SOIL - 22 + Math.round(Math.sin(this.time * 2) * 1.5), false);
  }

  drawCracks(f, loose) {
    if (!this.cracks) {
      const r = rnd(this.seed + 41);
      this.cracks = [];
      for (let i = 0; i < 9; i++) {
        const pts = [];
        let x = PX + (r() - 0.5) * 4, y = SOIL + 1, a = (i / 9) * Math.PI + (r() - 0.5) * 0.3;
        for (let k = 0; k < 14; k++) { pts.push([x, y]); x += Math.cos(a) * 1.2; y += Math.abs(Math.sin(a)) * 1.1 + 0.15; a += (r() - 0.5) * 0.6; }
        this.cracks.push(pts);
      }
    }
    const n = Math.round(loose * 14);
    for (const pts of this.cracks) for (let k = 0; k < Math.min(n, pts.length); k++) f.set(pts[k][0], pts[k][1], k < 3 ? 0x1e140c : 0x2a1c12);
  }

  drawDig(f) {
    const sim = this.sim, s = this.spec, sp = this.buried;
    const done = sim.done;
    const depth = 10;
    let lift = sim.phase === 'pull' ? Math.round(sim.prog * 4 + sim.pv * 2) : 0;
    if (done && !done.snapped) lift += Math.round(Math.min(1, this.endT / 0.45) * 34);
    const ox = PX - sp.w / 2, oy = SOIL + depth - lift;
    const wr = s.wriggle && !done ? Math.round(Math.sin(this.time * 9) * 1) : 0;
    // the item (seen through the soil until uncovered)
    const cover = sim.cover;
    blit(f, sp, ox + wr, oy - sp.h / 2, {
      fn: (x, y, c) => {
        if (done?.snapped) return shadeC(mixc(c, 0x3a2a1c, 0.5), 0.6);
        if (y >= SOIL + 1 && cover > 0.12) return shadeC(mixc(c, 0x4c3422, 0.35 + cover * 0.35), 0.75);
        return c;
      },
    });
    // the loose soil still on top of it: a mound that shrinks as you scrub
    const mh = Math.round(cover * 9);
    for (let d = -14; d <= 14; d++) {
      const h = Math.round(mh * Math.cos((d / 15) * Math.PI / 2));
      for (let k = 0; k < h; k++) f.set(PX + d, SOIL - k, (k === h - 1) ? 0x8a6a48 : ((d + k) % 3 ? 0x6a4a30 : 0x5a3e28));
    }
    // a scent wisp for the truffle
    if (this.id === 'truffle' && !done) for (let i = 0; i < 3; i++) { const t = (this.time * 0.7 + i / 3) % 1; f.add(PX - 6 + i * 6 + Math.sin(t * 9 + i) * 2, SOIL - 4 - t * 24, 0xe8d8a0, 0.6 * (1 - t)); }
    if (sim.phase === 'pull' || done) this.drawPaw(f, PX + 4, SOIL + depth - lift - 6, sim.wasGrip || (done && !done.snapped));
    else this.drawPaw(f, PX + Math.round((sim.wx || 0) * 12), SOIL - mh - 4, !!sim.wasGrip);
  }

  drawPeel(f) {
    const sim = this.sim, s = this.spec, sp = this.moss;
    const ox = 24, oy = 22;
    const edge = Math.round(sp.w * (1 - Math.min(1, sim.p)));
    const done = sim.done;
    const glow = s.glow;
    if (glow) f.halo(ox + sp.w / 2, oy + sp.h / 2, 30, glow, 0.15);
    const warn = sim.warn > 0;
    // still on the wall: columns left of the edge
    blit(f, sp, ox, oy, {
      fn: (x, y, c, sx) => {
        if (sx >= edge) return -1;
        if (warn && ((sx + y + Math.floor(this.time * 20)) % 5 === 0)) return 0xe0fbff;
        return c;
      },
    });
    // the peeled flap: folded back, showing its underside, hanging down from the edge
    const flapW = sp.w - edge;
    const lift = done ? Math.min(1, this.endT / 0.5) * 40 : 0;
    for (let sx = edge; sx < sp.w; sx++) {
      const k = sx - edge;
      const fold = Math.min(k, 10);
      for (let sy = 0; sy < sp.h; sy++) {
        const c = sp.col[sy * sp.w + sx];
        if (c < 0) continue;
        const x = ox + edge + Math.round(fold * 0.6) - Math.round(lift * 0.3);
        const y = oy + sy + Math.round(k * 0.55) - Math.round(lift);
        f.set(x + Math.round(k * 0.4), y, k > 2 ? shadeC(mixc(c, s.col.under, 0.6), 0.8) : shadeC(c, 0.7));
      }
    }
    // the bare rock behind shows a damp stain where the mat was
    if (!done) {
      const rough = Math.round(sim.tear * 4);
      for (let j = 0; j < sp.h; j++) if (sp.col[j * sp.w + Math.max(0, edge - 1)] >= 0) for (let d = 0; d <= rough; d++) f.set(ox + edge - d, oy + j + Math.round(Math.sin(j + this.time * 20) * d * 0.3), 0x1e161a);
    }
    void flapW;
    const pawY = oy + sp.h / 2 + Math.round(Math.sin(this.time * 2) * 1);
    if (!done) this.drawPaw(f, ox + edge + 6, pawY, !!sim.wasGrip);
  }

  drawPick(f) {
    const sim = this.sim, s = this.spec, b = this.bush;
    blit(f, b.sprite, this.bushX, this.bushY);
    for (const br of sim.berries) {
      if (br.state === 'on') berry(f, br.x, br.y + Math.round(Math.sin(this.time * 2 + br.x) * 0.4), br.ripe ? s.ripe : s.unripe, br.ripe);
      else if (br.state === 'squashed') { f.set(br.x, br.y, 0x6a9a3a); f.set(br.x - 1, br.y + 1, 0x5a8a2a); f.set(br.x + 1, br.y + 1, 0x7aaa4a); }
    }
    // the basket counter in the corner
    const bx = 4, by = FH - 14;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 9; y++) {
      const edge = y === 0 || x === 0 || x === 15 || y === 8;
      f.set(bx + x, by + y, edge ? 0x5a3a1c : ((x + y * 2) % 4 < 2 ? 0xb07a44 : 0x8a5a30));
    }
    for (let i = 0; i < sim.picked; i++) berry(f, bx + 3 + (i % 5) * 2.5, by + 2 + Math.floor(i / 5) * 2, s.ripe, true);
    // the timer as a candle-like bar along the bottom
    const left = 1 - sim.t / sim.limit;
    hmeter(f, 24, FH - 6, FW - 30, left, left < 0.25 ? 0xd8402a : 0xd8a040);
    this.drawPaw(f, this.inp.px, this.inp.py, false);
  }

  drawLift(f) {
    const sim = this.sim, s = this.spec;
    const done = sim.done;
    const nestY = SOIL + 2;
    // nest: a ring of twigs, back half
    const twig = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) f.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); };
    const r = rnd(this.seed + 3);
    for (let i = 0; i < 16; i++) { const x = PX - 22 + r() * 40; twig(x, nestY - 3 - r() * 3, x + 6 + r() * 6, nestY - 5 + r() * 4, r() < 0.5 ? 0x8a6a3a : 0x6a4a2a); }
    // the egg: drawn live (it tilts)
    let h = sim.h, tilt = sim.tilt * 0.55;
    if (done && !done.broke) h = sim.h + Math.min(1, this.endT / 0.5) * 0.4;
    const ey = nestY - 15 - Math.round(h * 26);
    const R = { a: 10.5, b: 14 };
    const c = Math.cos(tilt), sn = Math.sin(tilt);
    for (let y = -16; y <= 16; y++) for (let x = -14; x <= 14; x++) {
      const u = x * c + y * sn, v = -x * sn + y * c;
      const k = (u / R.a) ** 2 * (1 + v / R.b * 0.25) + (v / R.b) ** 2;
      if (k > 1) continue;
      const lit = (-u * 0.6 - v * 0.7) / 14 + (1 - k) * 0.5;
      let col = lit > 0.55 ? 0xf4f8e8 : lit > 0.25 ? s.col.shell : lit > -0.1 ? 0xb8c0a0 : 0x8a9478;
      if (k > 0.86) col = 0x5a6048;
      if (hash01(x * 3 + 7, y * 5 + 3) < 0.06 && k < 0.85) col = s.col.spot;
      if (sim.cracks && Math.abs(u - v * 0.3) < 0.6 && v > -4 * sim.cracks && v < 2) col = 0x3a3a2a;
      f.set(PX + x, ey + y, col);
    }
    // front twigs of the nest
    for (let i = 0; i < 12; i++) { const x = PX - 20 + r() * 38; twig(x, nestY - 1 + r() * 2, x + 5 + r() * 7, nestY + 1 + r() * 2, r() < 0.5 ? 0xa07a44 : 0x7a5a30); }
    // two paws cupping it
    if (sim.wasGrip || (done && !done.broke)) {
      this.drawPaw(f, PX + 12, ey + 10, true);
      const sp = this.paw.grip;
      blit(f, sp, Math.round(PX - 12 - sp.w + sp.hx), Math.round(ey + 10 - sp.hy), { flipX: true });
    } else this.drawPaw(f, PX + 16, nestY - 20, false);
  }

  drawMeters(f) {
    const sim = this.sim, s = this.spec;
    const time = this.time;
    if (s.tech === 'pull' || (s.tech === 'dig' && sim.phase === 'pull')) {
      const [lo, hi] = sim.bandAt();
      const inBand = sim.pv >= lo && sim.pv <= hi;
      gauge(f, FW - 14, 10, 50, sim.pv, { band: [lo, hi], snap: sim.snapAt, vmax: 1.45, strain: sim.strain, glow: inBand, time });
      iconArrow(f, FW - 13, 2, inBand ? 0x9af07a : 0xffffff, this.flip);
      // loosen meter with the target tick
      if (s.tech === 'pull') {
        iconRoots(f, 3, FH - 9);
        hmeter(f, 10, FH - 7, 30, sim.loose, sim.loose >= (s.needLoose ?? 0.4) ? 0x6ac04a : 0xc8a050, { target: s.needLoose ?? 0.4 });
      }
      // progress: a thin bar under the gauge
      hmeter(f, FW - 16, 64, 12, sim.prog, 0xffd040);
      if ((s.hot || s.cold) && sim.heat > 0) { iconFlame(f, 44, FH - 9); hmeter(f, 50, FH - 7, 22, sim.heat, s.cold ? 0x9ae6ff : 0xff7a2a); }
    } else if (s.tech === 'dig') {
      iconRoots(f, 3, FH - 9, 0x8a6a48);
      hmeter(f, 10, FH - 7, 34, 1 - sim.cover, 0xc8a050, { target: 0.88 });
    } else if (s.tech === 'peel') {
      const [lo, hi] = s.speed;
      const v = Math.min(1.4, sim.v / (hi * 1.6));
      gauge(f, FW - 14, 10, 50, v, { band: [lo / (hi * 1.6), hi / (hi * 1.6)], snap: 0.8, vmax: 1, strain: sim.tear, glow: v >= lo / (hi * 1.6) && v <= hi / (hi * 1.6), time });
      hmeter(f, 6, FH - 7, 40, sim.p, 0x6ac04a);
    } else if (s.tech === 'lift') {
      hmeter(f, 6, FH - 7, 40, sim.h, 0xffd040, { target: 0.92 });
      // balance: a little spirit level
      const bx = FW - 40, by = FH - 8;
      f.rect(bx - 1, by - 1, 34, 5, 0x120a0c);
      f.rect(bx, by, 32, 3, 0x3a5a2a);
      f.rect(bx + 12, by, 8, 3, 0x5a8a3a);
      const px = bx + 16 + Math.round(clamp(sim.tilt, -1, 1) * 15);
      f.rect(px - 1, by, 3, 3, Math.abs(sim.tilt) > 0.7 ? 0xff5a3a : 0xf0f8e0);
    }
  }

  // ------------------------------------------------------------ result
  showResult() {
    const r = this.sim.done;
    const it = ITEMS[this.id];
    const stars = r.empty ? 0 : Math.max(1, Math.min(5, Math.round(r.q / 20)));
    const q = r.empty ? '—' : `${r.q}%`;
    const card = el('div', { class: 'fg-result' }, [
      el('img', { src: iconURL(this.id), alt: '' }),
      el('div', { class: 'q', style: { color: r.p ? '#b07a14' : r.q >= 70 ? '#3a7a2a' : r.q >= 40 ? '#3a6a9a' : '#a83a2a' } }, (r.n > 1 ? `×${r.n} ` : '') + q),
      el('div', { class: 'stars', html: '★'.repeat(stars) + `<i>${'★'.repeat(5 - stars)}</i>` }),
      el('div', { class: 'w' }, r.word || ''),
      r.p ? el('span', { class: 'stamp' }, 'PRISTINE') : r.snapped || r.empty ? el('span', { class: 'stamp bad' }, r.empty ? 'EMPTY' : 'BROKEN') : null,
    ]);
    this.card = card;
    this.cardAt = r.snapped ? 0.45 : 0.52;
    this.hintEl.innerHTML = `<b>${it?.name || this.id}</b> · ${r.word || ''}`;
  }
}

function mixc(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
function hash01(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }

// ================================================================ public API
let active = null;

/**
 * Open the foraging minigame for item `id`. opts: { protects: { heat, cold, zap }, seed, auto }.
 * Resolves with { cancel: true } (Esc / closed) or the result (see the header).
 */
export function openForage(game, id, opts = {}) {
  if (active) return Promise.resolve({ cancel: true, busy: true });
  const view = new ForageView(game, id, opts);
  const wasLocked = !!document.pointerLockElement;
  return new Promise((resolve) => {
    let finished = false;
    let raf = 0;
    const end = (res) => {
      if (finished) return;
      finished = true;
      view.closed = true;
      cancelAnimationFrame(raf);
      view.detach?.();
      if (active === api) active = null;
      if (!handle.closed) { handle.onClose = null; handle.close(); }
      resolve(res);
    };
    const handle = game.ui.openPanel({
      body: view.body, className: 'fg-panel', closable: true, noBack: true,
      onClose: () => end(view.sim.done ? { ...view.sim.done } : { cancel: true }),
    });
    // keep the mouse captured in first person (the paw is the cursor) so mining carries on after
    if (wasLocked && !isTouch()) setTimeout(() => game.input.lockPointer?.(), 0);
    view.attach(handle);
    let last = performance.now();
    const loop = (now) => {
      if (finished) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (!view.driving) view.tick(dt, view.keepInput || null);
      if (view.sim.done && ((!view.hold && view.endT > (view.sim.done.snapped ? 1.8 : 1.6)) || (view.skip && view.endT > 0.5))) end({ ...view.sim.done });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const api = {
      view, sim: view.sim, id,
      close: () => end({ cancel: true }),
      /** Close now and hand over the result (tests: headless frames are slow). */
      finish: () => end(view.sim.done ? { ...view.sim.done } : { cancel: true }),
      /** Play a script through the real view for `secs` (tests): fixed 30 fps steps, no rAF needed. */
      drive(script = 'good', secs = 8, after = 1.7) {
        view.driving = true;
        const fn = scriptInput(script, view.sim);
        const dt = 1 / 30;
        let t = 0;
        while (t < secs && !(view.sim.done && view.endT > after)) { view.tick(dt, { grip: false, pull: 0, wx: 0, vx: 0, ...fn(t, view.sim) }); t += dt; }
        if (view.sim.done && view.endT <= 1.5) view.hold = true; // keep the result up for a screenshot (closes on a tap)
        if (!view.sim.done) view.keepInput = { ...fn(t, view.sim), wx: view.sim.wx ?? 0 }; else view.keepInput = null;
        view.driving = false;
        return view.sim.done;
      },
      /** Step a fixed input (tests): e.g. step({ grip: true, pull: 0.4 }, 1). */
      step(input, secs = 0.5) {
        view.driving = true;
        for (let t = 0; t < secs; t += 1 / 30) view.tick(1 / 30, { grip: false, pull: 0, wx: 0, vx: 0, ...input });
        view.driving = false;
        view.keepInput = view.sim.done ? null : { grip: false, pull: 0, wx: 0, vx: 0, ...input };
        return view.sim;
      },
    };
    active = api;
  });
}

if (typeof window !== 'undefined') {
  window.__forage = {
    get active() { return active; },
    open: (id, opts) => openForage(window.__game, id, opts),
    sim: simulate,
    specs: FORAGE,
  };
}

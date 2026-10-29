// The gathering minigames' rules, without any drawing (they also run headless, in node): each sim
// takes one input per frame and emits events the 3D stage turns into dirt, roots, sounds and pops.
//
//   pull  grip the stem and drag up (ceiling plants: down). The tension (pv) must sit in the good
//         band [lo, hi]: below it nothing moves, above it the stem strains, past `snap` it tears.
//         Wiggling left/right (wx swings) loosens the roots first; pull before they're loose and
//         they tear. Delicate plants (caps, glass) also strain on jerky pulls: slow and steady.
//   dig    scrub the soil off (wiggle), then ease it out like a pull (a grub sways the band).
//   peel   a mat on the wall: grip its edge and drag it off, slow and steady (sparkmoss zaps
//          unless you let go when it crackles).
//   pick   a berry bush, a timing game: a ring closes on one berry at a time; tap as it touches a
//          ripe berry, leave the green ones alone.
//   lift   an egg in a nest: raise it slowly and lean against its wobble.
//
// Input per frame: { grip, pull (0..1.45), wx (-1..1 sideways), vx (peel speed, screen widths/s,
// negative = along the peel), tap (pressed this frame) }. Result (sim.done): { id, q, p, n, t,
// snapped?, torn?, burns, zaps, spores, word } — the same shape Props.harvest has always taken.
import { FORAGE, forageSpec } from '../../cooking/forage.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Sim {
  constructor(id, spec, o = {}) {
    this.id = id;
    this.s = spec;
    this.o = o;
    this.t = 0;
    this.ev = [];
    this.done = null;
    this.r = rng(o.seed ?? 7);
    this.k = o.skill || 1; // forage skill: kinder bands
    this.burns = 0; this.zaps = 0; this.spores = 0; this.numb = 0;
  }
  emit(type, d = {}) { this.ev.push({ type, ...d }); }
  finish(r) {
    if (this.done) return;
    this.done = { id: this.id, n: 1, burns: this.burns, zaps: this.zaps, spores: this.spores, t: Math.round(this.t * 10) / 10, ...r };
    this.emit(r.snapped || r.broke ? 'snap' : 'pop');
  }
  /** Force the result (tests, debug.gather(id, { score })). */
  force(q) {
    if (this.done) return;
    q = clamp(Math.round(q), 0, 100);
    if (q < 30) this.finish({ q, p: false, snapped: true, word: 'Snap! It tore.' });
    else this.finish({ q, p: q >= 92, word: q >= 92 ? 'Whole, roots and all!' : q >= 75 ? 'Nice and clean.' : 'Out it comes.' });
  }
}

/** Grip + tension + wiggle: the core of pull and dig. */
export class PullSim extends Sim {
  constructor(id, spec, o) {
    super(id, spec, o);
    const [lo, hi] = spec.band;
    const w = (hi - lo) * (this.k - 1) * 0.5;
    this.lo = Math.max(0.05, lo - w * 0.5); this.hi = hi + w * 0.5; this.snapAt = (spec.snap || hi + 0.3) + w * 0.5;
    this.prog = 0; this.loose = 0; this.strain = 0; this.peak = 0; this.pv = 0; this.jerk = 0;
    this.ext = 0; this.dir = 0; this.wig = 0; this.wx = 0; this.turn = 0;
    this.heat = 0; this.lock = 0;
    this.sporeCd = 0;
    this.creakT = 0;
    this.par = spec.hold * 2.4 + 3.5;
    this.wasGrip = false;
    this.inBand = false;
    this.goodT = 0; // seconds spent in the band (the stage sparkles)
    // roots come free one by one as the plant rises: each at its own progress mark
    this.nRoots = spec.roots ?? 5;
    this.rootAt = [];
    for (let i = 0; i < this.nRoots; i++) this.rootAt.push(0.1 + 0.8 * ((i + 0.35 + this.r() * 0.3) / this.nRoots));
    this.rootsOut = 0;
    this.crackN = 0;
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
    this.jerk = damp(this.jerk, Math.abs(this.pv - prev) / Math.max(dt, 1e-3), 12, dt);
    // wiggling: each swing back the other way loosens the roots
    if (grip) this.track(clamp(inp.wx, -1, 1));
    else { this.dir = 0; this.ext = 0; this.turn = 0; this.wx = damp(this.wx, 0, 8, dt); }
    this.wig = Math.max(0, this.wig - dt * 3);
    // the pull
    const [lo, hi] = this.bandAt();
    const pv = this.pv;
    const was = this.inBand;
    this.inBand = grip && pv >= lo && pv <= hi;
    if (this.inBand && !was) this.emit('band');
    if (this.inBand) this.goodT += dt;
    if (pv >= lo) {
      const into = clamp((pv - lo) / Math.max(0.05, hi - lo), 0, 1.5);
      const rate = (0.4 + 0.7 * into) * (0.4 + 0.9 * this.loose) / s.hold;
      this.prog += rate * dt * (s.float ? 1.25 : 1);
    } else if (!grip) this.prog = Math.max(0, this.prog - dt * 0.04);
    if (s.float && grip && pv > 0.03) this.prog += dt * 0.06;
    // roots let go one by one (ripping if the soil isn't loose yet)
    while (this.rootsOut < this.nRoots && this.prog >= this.rootAt[this.rootsOut]) {
      const need = s.needLoose ?? 0.4;
      this.emit('root', { i: this.rootsOut, rip: this.loose < need * 0.8 });
      this.rootsOut++;
    }
    // strain: above the band the stem stretches thin, past the snap point it tears fast
    if (pv > hi) this.strain += dt * ((pv - hi) / Math.max(0.05, this.snapAt - hi)) * (s.glass ? 1.9 : 1.15);
    if (pv > this.snapAt) this.strain += dt * (s.glass ? 3.4 : 2.4);
    // delicate stems also hate jerky pulls: a slow, steady hand
    if (s.delicate && grip && this.jerk > 1.5) this.strain += dt * (this.jerk - 1.5) * 0.32;
    if (pv <= hi && !(s.delicate && this.jerk > 1.5)) this.strain = Math.max(0, this.strain - dt * 0.55);
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
    } else if (wx < this.ext) this.ext = wx;
    else if (wx > this.ext + 0.12) { this.wiggle(this.turn - this.ext); this.turn = this.ext; this.ext = wx; this.dir = 1; }
  }
  wiggle(amp) {
    if (amp < 0.22) return;
    const g = (this.s.twist ? 0.12 : 0.09) * this.k * Math.min(1.6, amp);
    this.loose = Math.min(1, this.loose + g * (1 - this.loose * 0.35));
    this.wig = 1;
    this.emit('wiggle', { amp });
    const n = Math.floor(this.loose * 4 + 1e-6);
    if (n > this.crackN) { this.crackN = n; this.emit('crack', { n }); }
    if (this.loose >= (this.s.needLoose ?? 0.4) && !this.looseSaid) { this.looseSaid = true; this.emit('loose'); }
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
}

/** Dig: scrub the cover away, then a gentle pull (wriggle: the good band sways). */
export class DigSim extends PullSim {
  constructor(id, spec, o) {
    super(id, { needLoose: 0.85, hold: spec.hold || 1, roots: 0, ...spec }, o);
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
    const d = this.done;
    if (!d) return;
    d.q = clamp(Math.round(d.q - Math.max(0, this.scrubs - 14) * 0.8), 12, 100);
    d.word = d.p ? (this.id === 'grub' ? 'Got it, wriggling and whole!' : 'A perfect, whole truffle!') : d.word;
  }
}

/** Peel a mat off the wall, edge first. */
export class PeelSim extends Sim {
  constructor(id, spec, o) {
    super(id, spec, o);
    this.p = 0; this.v = 0; this.tear = 0; this.rips = 0;
    this.zapT = 2 + this.r() * 1.2; this.warn = 0; this.lock = 0; this.wasGrip = false;
  }
  update(dt, inp) {
    if (this.done) return;
    const s = this.s;
    this.t += dt;
    this.lock = Math.max(0, this.lock - dt);
    const grip = inp.grip && this.lock <= 0;
    if (grip && !this.wasGrip) this.emit('grip');
    if (!grip && this.wasGrip) this.emit('release');
    this.wasGrip = grip;
    // speed along the peel (fraction of the screen width per second)
    const v = grip ? Math.max(0, -inp.vx) : 0;
    this.v = damp(this.v, v, 10, dt);
    const [lo, hi] = s.speed;
    const hi2 = hi * (1 + (this.k - 1) * 0.5);
    this.inBand = grip && this.v >= lo * 0.6 && this.v <= hi2;
    if (grip && this.v >= lo * 0.6) this.p += Math.min(this.v, hi2 * 1.2) * dt * 0.9;
    if (grip && this.v > hi2) {
      this.tear += dt * (this.v - hi2) * 6;
      if (this.tear >= 1) { this.tear = 0; this.rips++; this.emit('tear', { at: this.p }); }
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

/**
 * Pick: a timing game. A ring closes on one berry at a time (`beat`); tap when it touches a ripe
 * (red) berry: perfect within PERFECT s of the touch, good within GOOD s; earlier or later squashes
 * it. Green berries come up too: leave them (a tap squashes them).
 */
const PERFECT = 0.085, GOOD = 0.19;
export class PickSim extends Sim {
  constructor(id, spec, o) {
    super(id, spec, o);
    const n = o.berries ?? spec.berries ?? 11;
    this.berries = [];
    const ripeN = Math.max(5, Math.round(n * 0.62));
    const order = [...Array(n).keys()].sort(() => this.r() - 0.5);
    for (let i = 0; i < n; i++) this.berries.push({ ripe: order.indexOf(i) < ripeN, state: 'on', t: 0 });
    this.ripeN = this.berries.filter((b) => b.ripe).length;
    // the running order: every ripe berry once, with 2-3 green decoys mixed in (never first)
    const ripe = this.berries.map((b, i) => (b.ripe ? i : -1)).filter((i) => i >= 0).sort(() => this.r() - 0.5);
    const green = this.berries.map((b, i) => (b.ripe ? -1 : i)).filter((i) => i >= 0).sort(() => this.r() - 0.5).slice(0, Math.min(2, Math.round(n * 0.25)));
    const seq = [...ripe];
    for (const g of green) seq.splice(1 + Math.floor(this.r() * (seq.length - 1)), 0, g);
    this.seq = seq;
    this.si = -1;
    this.beat = null; // { i, ripe, u (0..1 = ring closing, 1 = touching), dur, t, pressed }
    this.gap = 0.55; // a breath before the first ring
    this.picked = 0; this.perfect = 0; this.squashed = 0; this.missed = 0; this.left = 0; this.streak = 0;
    this.score = 0;
  }
  next() {
    this.si++;
    if (this.si >= this.seq.length) { this.end(); return; }
    const i = this.seq[this.si];
    // the rings speed up a little as you go; skill slows them
    const dur = (0.98 - Math.min(0.28, this.si * 0.035)) * (1 + (this.k - 1) * 0.5);
    this.beat = { i, ripe: this.berries[i].ripe, dur, t: 0, u: 0, pressed: false };
    this.emit('beat', { i, ripe: this.beat.ripe });
  }
  update(dt, inp) {
    if (this.done) return;
    this.t += dt;
    for (const b of this.berries) b.t += dt;
    if (!this.beat) {
      this.gap -= dt;
      if (this.gap <= 0) this.next();
      return;
    }
    const B = this.beat;
    B.t += dt;
    B.u = B.t / B.dur;
    const err = B.t - B.dur; // seconds from the touch (negative = early)
    if (inp.tap && !B.pressed) {
      B.pressed = true;
      const br = this.berries[B.i];
      br.t = 0;
      if (!B.ripe) { br.state = 'squashed'; this.squashed++; this.streak = 0; this.emit('squash', { i: B.i, ripe: false }); }
      else if (Math.abs(err) <= GOOD) {
        const perfect = Math.abs(err) <= PERFECT * (1 + (this.k - 1) * 0.5);
        br.state = 'picked'; this.picked++; this.streak++;
        if (perfect) this.perfect++;
        this.score += perfect ? 1 : 0.82;
        this.emit('pick', { i: B.i, perfect, n: this.picked, streak: this.streak });
      } else { br.state = 'squashed'; this.squashed++; this.streak = 0; this.emit('squash', { i: B.i, ripe: true, early: err < 0 }); }
      this.beat = null; this.gap = 0.24;
      return;
    }
    if (err > GOOD + 0.05) {
      // the ring passed: a ripe berry was missed (it stays on the bush), a green one was rightly left
      if (B.ripe) { this.missed++; this.streak = 0; this.emit('miss', { i: B.i }); } else { this.left++; this.emit('leave', { i: B.i }); }
      this.beat = null; this.gap = 0.22;
    }
  }
  end() {
    const frac = this.score / Math.max(1, this.ripeN);
    let q = 100 * frac - this.squashed * 11 + (this.left ? 4 : 0);
    q = clamp(Math.round(q), this.picked ? 12 : 0, 100);
    if (!this.picked) { this.finish({ q: 0, n: 0, empty: true, word: 'Nothing picked...' }); return; }
    const n = this.picked >= 6 ? 2 : 1;
    const p = this.picked === this.ripeN && this.squashed === 0 && this.perfect * 2 >= this.ripeN && q >= 90;
    this.finish({ q, p, n, perfect: this.perfect, word: p ? 'Every ripe berry, not one squashed!' : this.squashed ? `${this.picked} picked, ${this.squashed} squashed.` : `${this.picked} of ${this.ripeN} ripe ones.` });
  }
  force(q) {
    if (this.done) return;
    this.picked = Math.max(1, Math.round(this.ripeN * q / 100));
    this.finish({ q: clamp(Math.round(q), 0, 100), p: q >= 92, n: this.picked >= 6 ? 2 : 1, word: q >= 92 ? 'Every ripe berry, not one squashed!' : `${this.picked} of ${this.ripeN} ripe ones.` });
  }
}

/** Lift an egg slowly, leaning against its wobble. */
export class LiftSim extends Sim {
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
      this.emit('crack', { side: Math.sign(this.tilt), n: this.cracks });
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
/** Script → input fn for headless runs: 'good' plays it well, 'rush' skips the loosening, 'yank' too hard, 'soft' too gently. */
export function scriptInput(kind, sim) {
  if (typeof kind === 'function') return kind;
  const s = sim.s;
  if (s.tech === 'pick') {
    return () => {
      const B = sim.beat;
      if (!B || B.pressed) return { tap: false };
      if (kind === 'soft') return { tap: false };
      if (kind === 'yank') return { tap: B.u > 0.45 };
      if (!B.ripe && kind === 'good') return { tap: false };
      return { tap: B.t >= B.dur - 0.02 };
    };
  }
  if (s.tech === 'peel') {
    const v = kind === 'yank' ? -s.speed[1] * 3 : kind === 'soft' ? -s.speed[0] * 0.3 : -(s.speed[0] + s.speed[1]) / 2;
    return () => ({ grip: !(sim.warn > 0), vx: v, wx: 0, pull: 0 });
  }
  if (s.tech === 'lift') {
    return (t) => ({ grip: true, pull: kind === 'yank' ? 1.2 : Math.min(1.05, t * 0.3), wx: kind === 'good' ? clamp(sim.tilt * 1.2 + sim.tv * 0.6, -1, 1) : 0 });
  }
  if (kind === 'rush') return () => { const [lo, hi] = sim.bandAt(); return { grip: true, pull: (lo + hi) / 2, wx: 0, vx: 0 }; };
  // pull / dig: wiggle first (good), then a steady pull in the band
  return (t) => {
    const [lo, hi] = sim.bandAt();
    const mid = (lo + hi) / 2;
    const loosening = kind === 'good' && (sim.loose < (s.needLoose ?? 0.4) + 0.12 || sim.phase === 'dig');
    if (!loosening && s.delicate) sim.goodRamp = Math.min(1, (sim.goodRamp || 0) + 1 / 30 / 0.9);
    const ramp = s.delicate ? sim.goodRamp || 0 : 1;
    const pull = kind === 'yank' ? (s.snap || 1) + 0.3 : kind === 'soft' ? lo * 0.6 : loosening ? lo * 0.5 : lo * 0.5 + (mid - lo * 0.5) * ramp;
    return { grip: true, pull, wx: loosening ? Math.sin(t * 9) * 0.8 : 0 };
  };
}

/** Run a gather headless (no DOM, also in node). Returns the result. */
export function simulate(id, script = 'good', o = {}) {
  const spec = forageSpec(id);
  const sim = makeSim(id, spec, o);
  const fn = scriptInput(script, sim);
  const dt = 1 / 30;
  let t = 0;
  while (!sim.done && t < (o.max ?? 30)) { sim.update(dt, { grip: false, pull: 0, wx: 0, vx: 0, tap: false, ...fn(t, sim) }); t += dt; }
  return sim.done || { cancel: true, timeout: true };
}

export { FORAGE, forageSpec };

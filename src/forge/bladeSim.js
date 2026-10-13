// Forging physics, kept free of three.js so it can be tuned and tested in Node.
//  - BladeSim: the billet as columns of half-widths (one per profile entry), per-column
//    temperatures, hammer strikes that push material toward the tip, stress/burn,
//    shape accuracy, grinding and the balance point.
//  - CrucibleSim: smelting temperature dynamics driven by the bellows.
//  - quenchResult(): grading a plunge temperature.
import { METALS, WEAPON_TYPES, FORGE_MAX_TEMP } from '../data/weapons.js';

export const AMBIENT = 22;
export const MIN_W = 0.25; // thinnest a column can be hammered
export const BLOW = 1.8; // half-width moved by a full-power blow at ideal heat (× metal flow)
const TIP = [0.36, 0.27, 0.18, 0.1]; // share of displaced metal pushed 1..4 columns toward the tip
const GUARD = [0.09]; // share pushed back toward the guard
const TOL = 0.1; // per-column slack before a deviation counts as error
export const HAFTED = new Set(['axe', 'mace', 'warhammer', 'spear']);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Temperature the banked coal fire settles at without the bellows, for a metal. */
export function fireIdleFor(metal, maxT) {
  return Math.min(maxT, clamp(metal.work[1] - 40, 160, 950));
}

export class BladeSim {
  constructor(type, metal, forgeLevel = 0) {
    this.type = type;
    this.metal = metal;
    this.def = WEAPON_TYPES[type];
    this.m = METALS[metal];
    this.maxT = FORGE_MAX_TEMP[forgeLevel] ?? FORGE_MAX_TEMP[0];
    this.target = this.def.profile.slice();
    this.N = this.target.length;
    this.maxLen = this.N + 3;
    this.targetSum = this.target.reduce((a, b) => a + b, 0);
    // a thick, short bar holding ~115% of the planned material
    const area = this.targetSum * 1.15;
    let L = Math.max(3, Math.round(this.N * 0.7));
    while (area / L > 5.6 && L < this.N) L++;
    this.w = new Array(L).fill(area / L);
    this.T = new Array(L).fill(AMBIENT);
    this.cracks = new Array(L).fill(0);
    this.stress = 0; // from cold blows (percentage points off the temper score)
    this.burnt = 0; // from overheating (percentage points)
    this.strikes = 0;
    this.workStrikes = 0;
    this.coldStrikes = 0;
    this.burnStrikes = 0;
    this.heats = 0;
    this.lost = 0; // material lost to scale
  }

  get length() {
    let n = this.w.length;
    while (n > 1 && this.w[n - 1] < 0.12) n--;
    return n;
  }

  area() { return this.w.reduce((a, b) => a + b, 0); }

  meanT() {
    let s = 0, n = 0;
    for (let i = 0; i < this.w.length; i++) if (this.w[i] > 0.05) { s += this.T[i]; n++; }
    return n ? s / n : AMBIENT;
  }

  maxTemp() { return Math.max(...this.T); }

  /** 0..1 similarity between the shaped columns and the plan. */
  accuracy() {
    const n = Math.max(this.w.length, this.N);
    let e = 0;
    for (let i = 0; i < n; i++) e += Math.max(0, Math.abs((this.w[i] || 0) - (this.target[i] || 0)) - TOL);
    return clamp(1 - e / this.targetSum, 0, 1);
  }

  /** Per-column match state for the outline: -1 too thin, 0 good, 1 too thick. */
  match(i) {
    const d = (this.w[i] || 0) - (this.target[i] || 0);
    return d > 0.3 ? 1 : d < -0.3 ? -1 : 0;
  }

  // ---------------------------------------------------------------- heat
  /** Advance temperatures. inFire: billet sits in the coals; air 0..1 from the bellows. */
  heatStep(dt, inFire, air) {
    const m = this.m;
    const idle = fireIdleFor(m, this.maxT);
    const fireT = idle + (this.maxT - idle) * air;
    let burning = 0;
    for (let i = 0; i < this.w.length; i++) {
      const w = this.w[i];
      const thin = 0.55 + 1.4 / (w + 0.5);
      let T = this.T[i];
      if (inFire) {
        const k = (0.08 + 0.11 * air) * m.heat * (0.7 + 0.3 * thin);
        T += (fireT - T) * k * dt;
        T = Math.min(T, this.maxT);
      } else {
        T -= (T - AMBIENT) * 0.035 * thin * dt;
      }
      this.T[i] = T;
      if (T > m.burn && w > 0.05) burning = Math.max(burning, T - m.burn);
    }
    if (burning > 0 && inFire) this.burnt += dt * 3 * Math.min(2, burning / 100 + 0.3);
    return burning;
  }

  /** Classify a temperature for this metal. */
  zone(T) {
    const [w0, w1] = this.m.work;
    if (T > this.m.burn) return 'burn';
    if (T > w1) return 'hot';
    if (T >= w0) return 'work';
    return 'cold';
  }

  // ---------------------------------------------------------------- hammer
  /**
   * Strike column i with power 0..1. Returns an event describing what happened.
   * rnd: random source (Math.random by default) for crack rolls.
   */
  strike(i, power, rnd = Math.random) {
    if (i < 0 || i >= this.w.length) return null;
    const m = this.m;
    const T = this.T[i];
    const [w0, w1] = m.work;
    const kind = this.zone(T);
    let f;
    if (kind === 'cold') f = 0.12 * clamp(1 - (w0 - T) / 300, 0, 1);
    else if (kind === 'burn') f = 1.25;
    else if (kind === 'hot') f = 1.2;
    else f = 0.8 + 0.4 * (T - w0) / (w1 - w0);
    const before = this.accuracy();
    let a = BLOW * power * m.flow * f;
    a = Math.max(0, Math.min(a, this.w[i] - MIN_W));
    this.w[i] -= a;
    const loss = kind === 'burn' ? 0.08 : kind === 'hot' ? 0.05 : 0.03;
    const moved = a * (1 - loss);
    this.lost += a - moved;
    let spill = 0;
    const grown = [];
    for (let k = 0; k < GUARD.length; k++) {
      const j = i - 1 - k;
      if (j >= 0) this.w[j] += moved * GUARD[k];
      else spill += moved * GUARD[k];
    }
    for (let k = 0; k < TIP.length; k++) {
      const j = this._ensure(i + 1 + k, T, grown);
      this.w[j] += moved * TIP[k] + (k === 0 ? spill : 0);
    }
    // working metal warms it a touch
    this.T[i] += a * 6;
    this.strikes++;
    const ev = { i, kind, power, moved: a, T, crack: false, stress: 0, burn: 0, grown, before, after: 0 };
    if (kind === 'cold') {
      this.coldStrikes++;
      const cold = clamp((w0 - T) / 250, 0.25, 1);
      ev.stress = power * cold * 7;
      this.stress += ev.stress;
      if (power > 0.3 && this.cracks[i] < 3 && rnd() < power * cold * 0.9) {
        this.cracks[i]++;
        this.stress += 3;
        ev.crack = true;
      }
    } else if (kind === 'burn') {
      this.burnStrikes++;
      ev.burn = power * 4 + (T - m.burn) / 60;
      this.burnt += ev.burn;
    } else {
      this.workStrikes++;
    }
    ev.after = this.accuracy();
    return ev;
  }

  _ensure(j, T, grown) {
    if (j < this.w.length) return j;
    if (j >= this.maxLen) return this.w.length - 1;
    while (this.w.length <= j) {
      this.w.push(0);
      this.T.push(T);
      this.cracks.push(0);
      grown.push(this.w.length - 1);
    }
    return j;
  }

  /** A trip back to the fire flakes off a little scale. */
  scaleInFire() {
    this.heats++;
    let lost = 0;
    for (let i = 0; i < this.w.length; i++) {
      const d = Math.min(this.w[i] * 0.012, Math.max(0, this.w[i] - 0.05));
      this.w[i] -= d;
      lost += d;
    }
    this.lost += lost;
    return lost;
  }

  /** 0..1 temper: stress from cold blows and burning both weaken the steel. */
  temperScore() {
    return clamp(1 - (this.stress + this.burnt) / 60, 0, 1);
  }

  /**
   * Finishing pass on the grindstone: trims overflow past the tip and shaves columns that
   * stand proud of the plan. Limited budget, so hammering still decides the shape.
   * Returns {before, after, removed}.
   */
  grind() {
    const before = this.accuracy();
    let budget = this.targetSum * 0.05;
    let removed = 0;
    for (let i = this.w.length - 1; i >= this.N && budget > 0; i--) {
      const take = Math.min(this.w[i], budget, 0.9);
      this.w[i] -= take; budget -= take; removed += take;
    }
    const over = [];
    for (let i = 0; i < Math.min(this.N, this.w.length); i++) {
      const d = this.w[i] - this.target[i] - TOL * 0.5;
      if (d > 0) over.push([d, i]);
    }
    over.sort((a, b) => b[0] - a[0]);
    for (const [d, i] of over) {
      if (budget <= 0) break;
      const take = Math.min(d, budget, 0.45);
      this.w[i] -= take; budget -= take; removed += take;
    }
    while (this.w.length > 1 && this.w[this.w.length - 1] < 0.06) { this.w.pop(); this.T.pop(); this.cracks.pop(); }
    return { before, after: this.accuracy(), removed };
  }

  // ---------------------------------------------------------------- balance
  /** Hilt fittings as point masses [{m, x}] in column units (guard at x = 0, tip toward +x). */
  fittings() {
    const Mt = 2 * this.targetSum;
    if (HAFTED.has(this.type)) {
      const haft = this.type === 'spear' ? 4.2 : 3.2;
      return { parts: [{ m: 0.1 * Mt, x: -haft / 2 }, { m: 0.02 * Mt, x: -(haft + 0.3) }], pommelX: -(haft + 0.45), grip: haft };
    }
    const grip = this.type === 'greatsword' || this.type === 'longsword' ? 3.2 : this.type === 'dagger' ? 1.8 : 2.4;
    return { parts: [{ m: 0.08 * Mt, x: -0.35 }, { m: 0.07 * Mt, x: -grip / 2 }, { m: 0.03 * Mt, x: -(grip + 0.4) }], pommelX: -(grip + 0.55), grip };
  }

  /** Balance point for an adjustable weight W at the pommel ('pommel') or past the head ('head'). */
  balanceAt(W, mode = 'pommel') {
    let M = 0, Mx = 0;
    for (let i = 0; i < this.w.length; i++) { const mm = 2 * this.w[i]; M += mm; Mx += mm * (i + 0.5); }
    const fit = this.fittings();
    for (const p of fit.parts) { M += p.m; Mx += p.m * p.x; }
    const L = this.length;
    if (W > 0) {
      const x = mode === 'head' ? L + 0.45 : fit.pommelX;
      M += W; Mx += W * x;
    }
    const xc = Mx / M;
    return { xc, frac: xc / L, L };
  }

  /** Pick the weight kind/range so the target is reachable; returns {mode, Wmax, Wneed}. */
  balanceSetup(rnd = Math.random) {
    const target = this.def.balance;
    const L = this.length;
    const b0 = this.balanceAt(0);
    const mode = b0.frac > target ? 'pommel' : 'head';
    // solve (Mx + W x)/(M + W) = Xt for W
    let M = 0, Mx = 0;
    for (let i = 0; i < this.w.length; i++) { const mm = 2 * this.w[i]; M += mm; Mx += mm * (i + 0.5); }
    const fit = this.fittings();
    for (const p of fit.parts) { M += p.m; Mx += p.m * p.x; }
    const Xt = target * L;
    const x = mode === 'head' ? L + 0.45 : fit.pommelX;
    const Wneed = Math.max(0, (Xt * M - Mx) / (x - Xt));
    const Wmax = Math.max(Wneed * (1.45 + rnd() * 0.6), 0.25 * this.targetSum);
    return { mode, Wmax, Wneed, target };
  }

  /** Grams shown for a weight (scaled by the ingots that went in). */
  grams(W) {
    return Math.round((W / (2 * this.targetSum)) * this.def.ingots * 180);
  }
}

/** 0..1 balance score from the distance to the target (gravium widens tolerance). */
export function balanceScore(frac, target, assist = false) {
  const tol = assist ? 0.15 : 0.045;
  const d = Math.abs(frac - target);
  if (d <= tol) return 1 - 0.25 * (d / tol);
  return Math.max(0, 0.75 * (1 - (d - tol) / (tol * 1.5)));
}

export function balanceTolerance(assist) { return assist ? 0.15 : 0.045; }

/** Grade a quench from the plunge temperature. */
export function quenchResult(metal, T) {
  const [q0, q1] = metal.quench;
  const mid = (q0 + q1) / 2, half = (q1 - q0) / 2;
  if (T >= q0 && T <= q1) return { kind: 'good', crack: false, score: 1 - 0.15 * Math.abs(T - mid) / half };
  if (T > q1) {
    const d = T - q1;
    const crack = d > 45;
    return { kind: 'hot', crack, score: Math.max(0.05, 0.8 - d / 140 - (crack ? 0.15 : 0)) };
  }
  const d = q0 - T;
  return { kind: 'cold', crack: false, score: Math.max(0.05, 0.75 - d / 180) };
}

/** Smelting crucible: the bellows' air drives the temperature, which decays toward ambient. */
export class CrucibleSim {
  constructor(recipe, forgeLevel = 0) {
    this.recipe = recipe;
    this.band = recipe.temp;
    this.maxT = FORGE_MAX_TEMP[forgeLevel] ?? FORGE_MAX_TEMP[0];
    this.R = 450 * (this.maxT / 1550);
    this.D = 0.22;
    this.T = 300;
    this.required = 6;
    this.limit = 15;
    this.time = 0;
    this.inBand = 0;
    this.impurity = 0;
    this.overheat = false;
    this.started = false;
  }
  get slagT() { return this.band[1] + 150; }
  step(dt, air) {
    this.T += (air * this.R - (this.T - 25) * this.D) * dt;
    this.T = clamp(this.T, 25, this.maxT);
    this.overheat = this.T > this.slagT;
    if (!this.started) return;
    this.time += dt;
    if (this.T >= this.band[0] && this.T <= this.band[1]) this.inBand += dt;
    if (this.overheat) this.impurity += dt * 0.12;
  }
  get progress() { return clamp(this.inBand / this.required, 0, 1); }
  get accuracy() { return clamp(this.inBand / this.required - this.impurity, 0, 1); }
  get done() { return this.inBand >= this.required || this.time >= this.limit; }
  get inBandNow() { return this.T >= this.band[0] && this.T <= this.band[1]; }
}

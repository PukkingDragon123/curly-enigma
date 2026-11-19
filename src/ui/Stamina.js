// The stamina gauge (replaces the energy lantern): a little brass oil lamp on a brass-and-leather
// tube, PEAK-style (wave 18: the lamp replaced the ruby heart).
//  - stamina is the lamp's honey-gold oil in the glass, sloshing at its edge, a shine running through it;
//    the flame in the lamp's chimney burns tall when rested, shrinks and gutters (red, smoking) as
//    the oil runs low and flares with each heartbeat;
//    a drain leaves a pale ghost that drains after it (and shakes the bar), a refill springs up
//    with sparkles; nearly out it turns ember-red, the ruby heart beats and the screen edges darken
//  - afflictions eat the bar from the right: hunger (a bitten biscuit, crumbs on the rail) and
//    injury (a linen bandage wound round the tube, blood seeping through); their length is what
//    stamina can't fill (State.energyCap)
//  - at 0 underground: blackout(cb) closes the eyes (a dithered vignette and eyelids), cb takes
//    the mole home, and the eyes blink open in the next scene
// It rides on the tool belt when the belt is up (between the held tool's name and the strap), at
// the bottom middle otherwise; it tucks away a moment after it's full and nothing's happening.
// Rules: src/core/vitals.js. Art: src/ui/staminaArt.js.
import { el, clamp } from '../core/util.js';
import { GEO, R, RAMPS, pk, gaugeLayers } from './staminaArt.js';
import './stamina.css';

const LOW = 0.25; // of the full bar: ember colour, heartbeat
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const P = Object.fromEntries(Object.entries(RAMPS).map(([k, v]) => [k, v.map((c) => pk(c))]));
const WHITE = pk(0xffffff), CREAM = pk(0xfff2c8), INKP = pk(0x1a0e08);
/** The interface's pixel size (CSS px per art px). */
const cssPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
const hsh = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** A ramp tone by brightness, ordered-dithered. */
const dith = (ramp, k, x, y) => { const f = clamp(k, 0, 1) * (ramp.length - 1), i = f | 0; return ramp[Math.min(ramp.length - 1, i + (f - i > bay(x, y) ? 1 : 0))]; };
/** Blend a packed colour over a packed pixel. */
const mix = (o, c, t) => {
  const s = 1 - t;
  return ((255 << 24) | ((((o >> 16) & 255) * s + ((c >> 16) & 255) * t) << 16) | ((((o >> 8) & 255) * s + ((c >> 8) & 255) * t) << 8) | ((o & 255) * s + (c & 255) * t)) >>> 0;
};

const LINEN = [0x2e2018, 0x5a4636, 0x8a7458, 0xb4a07c, 0xd4c4a0, 0xece0c4].map((c) => pk(c));
const BLOOD = [0x3a0a0a, 0x5e1210, 0x861c16, 0xa8281e].map((c) => pk(c));
const FLAME = { core: pk(0xfffbe6), yel: pk(0xffe070), org: pk(0xffa232), red: pk(0xe85a1e), dred: pk(0xa8301a), blue: pk(0x5a86ff), blueD: pk(0x2a3aa0) };
const FLAME_LOW = { core: pk(0xffe8a0), yel: pk(0xffb848), org: pk(0xf07a28), red: pk(0xc8401a), dred: pk(0x7a2010), blue: pk(0x4a64d8), blueD: pk(0x22308a) };

export class StaminaBar {
  constructor(hud) {
    this.hud = hud;
    this.game = hud.game;
    const L = gaugeLayers();
    this.L = L;
    this.cv = el('canvas', { class: 'stam-cv pix', width: L.W, height: L.H });
    this.ctx = this.cv.getContext('2d');
    this.img = this.ctx.createImageData(L.W, L.H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.bar = el('div', { class: 'stam', 'data-solid': '', role: 'meter', 'aria-label': 'Stamina' }, [this.cv]);
    this.dock = el('div', { class: 'stam-dock free' }, [this.bar]);
    hud.ui.hud.append(this.dock);
    this.veil = new Veil(hud.ui);
    // shown values (fractions of the full bar) and their springs
    const v = this.read();
    this.s = v.s; this.sv = 0; this.ghost = v.s; this.ghostT = 0;
    this.hu = v.h; this.huv = 0; this.inj = v.i; this.injv = 0;
    this.t = 0; this.showT = 0; this.shown = false;
    this.slosh = 0; this.shake = 0; this.shakeV = 0; this.squash = 0; this.squashV = 0;
    this.flashI = 0; this.flashH = 0; this.gainT = 0;
    this.beatT = 0; this.beatPh = 0; this.env = 0;
    this.parts = [];
    this.px = cssPx();
    addEventListener('resize', () => { this.px = cssPx(); });
    this.render(0);
  }

  read() {
    const d = this.game.state.data, m = Math.max(1, d.maxEnergy);
    return { s: clamp(d.energy / m, 0, 1), h: clamp((d.hunger || 0) / m, 0, 1), i: clamp((d.injury || 0) / m, 0, 1) };
  }

  /** With the tool belt up: ride on it; without: bottom middle. */
  setMode(mode) {
    this.mode = mode;
    const belt = this.hud.ui.belt;
    const dockIn = mode !== 'none' && belt?.el && belt.strap && !belt.el.hidden;
    if (dockIn && this.dock.parentNode !== belt.el) { belt.el.insertBefore(this.dock, belt.strap); this.dock.className = 'stam-dock docked'; }
    else if (!dockIn && this.dock.parentNode !== this.hud.ui.hud) { this.hud.ui.hud.append(this.dock); this.dock.className = 'stam-dock free'; }
    if (mode === 'none') this.show(false);
  }
  /** Bring the bar up for a while (t seconds). */
  peek(t = 2.4) { this.showT = Math.max(this.showT, t); }
  show(on) {
    if (on === this.shown) return;
    this.shown = on;
    this.dock.classList.toggle('show', on);
  }

  /** state 'energy' events: { delta, injury, fed, mend }. */
  onEnergy(e = {}) {
    const d = e.delta || 0;
    if (e.injury) {
      this.flashI = 1; this.kick(4 + Math.min(6, e.injury)); this.peek(3);
      const x = this.edgeX(1 - this.hu - this.inj);
      for (let k = 0; k < 6; k++) this.parts.push({ k: 'drop', x: x + Math.random() * 10, y: (GEO.ch.y0 * R) + Math.random() * 6, vx: (Math.random() - 0.3) * 30, vy: -20 - Math.random() * 30, life: 0.6 });
    } else if (d < -2.5) { this.kick(Math.min(5, -d * 0.4)); this.peek(2.5); }
    if (e.fed) {
      this.squashV -= 9; this.gainT = 0.8; this.flashH = 0.6; this.peek(3.2);
      this.game.audio?.play?.('sparkle', { vol: 0.18, pitch: 1.3 });
      const hx = this.edgeX(1 - this.hu);
      for (let k = 0; k < 10; k++) this.parts.push({ k: 'crumb', x: hx + Math.random() * 12 - 2, y: GEO.ch.y0 * R + Math.random() * 10, vx: -10 + Math.random() * 30, vy: -25 - Math.random() * 25, life: 0.7 + Math.random() * 0.3 });
    }
    if (e.mend) { this.peek(2.5); const ix = this.edgeX(1 - this.hu - this.inj); for (let k = 0; k < 5; k++) this.star(ix + Math.random() * Math.max(6, this.inj * 130), 0.3 + Math.random() * 0.3); }
  }
  kick(a) { this.shakeV += (Math.random() < 0.5 ? -1 : 1) * a * 18; this.slosh = Math.min(3, this.slosh + a * 0.4); }
  /** A sparkle at fine x (in the glass, random height). */
  star(x, delay = 0) { this.parts.push({ k: 'star', x, y: GEO.ch.y0 * R + 1 + Math.random() * ((GEO.ch.y1 - GEO.ch.y0 + 1) * R - 2), life: 0.45, t: -delay }); }
  /** Fine x of a fraction of the bar. */
  edgeX(f) { const c = GEO.ch; return c.x0 * R + f * (c.x1 - c.x0 + 1) * R; }

  /** The eyes close (cb when black), then open once the next scene is in. */
  blackout(cb) { this.veil.blackout(this.game, cb); this.kick(6); }

  update(dt) {
    const st = this.game.state, ui = this.hud.ui;
    this.t += dt;
    this.dockT = (this.dockT || 0) - dt;
    if (this.dockT <= 0) { this.dockT = 0.25; this.setMode(ui.hudMode); } // (the belt comes and goes)
    const v = this.read();
    // stamina: a drop snaps down and leaves a ghost; a rise springs up (a little overshoot)
    if (v.s < this.s - 0.0005) {
      if (this.ghostT <= 0 || this.ghost < this.s) this.ghost = Math.max(this.ghost, this.s);
      this.ghostT = 0.45; this.s = v.s; this.sv = Math.min(0, this.sv);
    }
    const rising = v.s >= this.s;
    // the springs, in small steps (slow frames can't blow them up): a rise (a little overshoot),
    // the afflictions' lengths, the shake (x) and the squash (y)
    for (let rem = dt; rem > 1e-4; rem -= 1 / 60) {
      const h = Math.min(rem, 1 / 60);
      if (rising) { this.sv += (v.s - this.s) * 260 * h; this.sv *= Math.exp(-16 * h); this.s += this.sv * h; }
      this.huv += (v.h - this.hu) * 300 * h; this.huv *= Math.exp(-18 * h); this.hu += this.huv * h;
      this.injv += (v.i - this.inj) * 300 * h; this.injv *= Math.exp(-18 * h); this.inj += this.injv * h;
      this.shakeV += (-this.shake * 900 - this.shakeV * 22) * h; this.shake += this.shakeV * h;
      this.squashV += (-this.squash * 700 - this.squashV * 18) * h; this.squash += this.squashV * h;
    }
    if (rising) {
      if (Math.abs(v.s - this.s) < 0.0005 && Math.abs(this.sv) < 0.01) { this.s = v.s; this.sv = 0; }
      if (this.sv > 0.05 && Math.random() < dt * 30) this.star(this.edgeX(this.s) - 2 - Math.random() * 8);
    }
    if (this.ghostT > 0) this.ghostT -= dt;
    else this.ghost += (this.s - this.ghost) * (1 - Math.exp(-dt * 7)) - 0.05 * dt;
    if (this.ghost < this.s) this.ghost = this.s;
    this.slosh *= Math.exp(-dt * 2.2);
    this.flashI = Math.max(0, this.flashI - dt * 3); this.flashH = Math.max(0, this.flashH - dt * 2); this.gainT = Math.max(0, this.gainT - dt);
    // the heart: lub-dub, quicker the emptier
    const low = st.data.energy / Math.max(1, st.data.maxEnergy);
    const beating = (low < LOW && ui.hudMode !== 'none') || this.veil.on;
    if (beating) {
      const period = this.veil.on ? 1.1 : 0.5 + clamp(low / LOW, 0, 1) * 0.55;
      this.beatT += dt;
      if (this.beatT >= period) {
        this.beatT = 0;
        if (low < 0.15 || this.veil.on) { this.game.audio?.play?.('thud', { vol: 0.1, pitch: 0.5 }); setTimeout(() => this.game.audio?.play?.('thud', { vol: 0.06, pitch: 0.45 }), 190); }
      }
      const b = this.beatT;
      this.env = Math.exp(-b * 14) + 0.6 * (b > 0.19 ? Math.exp(-(b - 0.19) * 14) : 0);
    } else { this.env = 0; this.beatT = 0.4; }
    // the screen's edges darken when nearly out (and pulse with the heart)
    this.veil.low = ui.hudMode === 'none' ? 0 : clamp((0.2 - low) / 0.17, 0, 1) * (0.85 + 0.15 * this.env);
    this.veil.update(dt);
    // shown: while not full, for a moment after anything happens, always when low
    if (this.showT > 0) this.showT -= dt;
    const want = ui.hudMode !== 'none' && (this.showT > 0 || low < LOW || v.s < st.energyCap / Math.max(1, st.data.maxEnergy) - 0.01 || Math.abs(this.ghost - this.s) > 0.002);
    if (want) this.restT = 2.2;
    else this.restT = (this.restT || 0) - dt;
    this.show(want || this.restT > 0);
    if (!this.shown && !this.dock.classList.contains('show')) return;
    // the canvas moves by whole art pixels (crisp), squashes, thumps with the heart
    const px = this.px;
    const sx = Math.round(this.shake) * px / 2, sq = clamp(this.squash * 0.35, -0.16, 0.16), beat = this.env * 0.045;
    this.cv.style.transform = `translate(${sx}px, 0) scale(${(1 - sq * 0.6 + beat).toFixed(3)}, ${(1 + sq + beat).toFixed(3)})`;
    this.render(dt);
  }

  /** A bandage pixel: wound turns (a lit edge, the overlap's shadow), weave, the blood seeping out from its middle. */
  linen(i, j, eI, CH, x, y) {
    const CW = (GEO.ch.x1 - GEO.ch.x0 + 1) * R, ri = CW - 1 - i;
    const q = (((ri + j * 0.9) % 8) + 8) % 8;
    let k = q < 1.6 ? 0.12 : q < 3 ? 0.92 : 0.6 - (q - 3) * 0.04 + (((i + j) & 1) ? 0.05 : -0.05) + ((((i >> 1) + j) % 3) === 0 ? -0.06 : 0);
    k += j < 0 ? 0.08 : j >= CH ? -0.2 : (j < 2 ? 0.06 : j > CH - 3 ? -0.1 : 0);
    if (i - eI < 1) k = 0.1; // the frayed leading edge
    else if (i - eI < 2 && hsh(i, j, 81) < 0.5) k = 0.3;
    let col = dith(LINEN, k, x, y);
    // the blood: a blot round the bandage's middle that spreads with the wound
    const span = Math.max(1, CW * this.inj), mid = eI + span * 0.5;
    const dx = (i - mid) / Math.max(4, span * 0.42), dy = (j - CH * 0.5) / (CH * 0.9 + 2);
    const d = dx * dx + dy * dy * 1.6 + (hsh(i >> 1, j >> 1, 83) - 0.5) * 0.45 + (hsh(i >> 2, j >> 2, 84) - 0.5) * 0.3;
    const rr = clamp(0.06 + this.inj * 0.9, 0.06, 0.55);
    if (d < rr) col = dith(BLOOD, 0.85 - d / rr * 0.9 + (q < 1 ? -0.25 : 0), x, y);
    else if (d < rr + 0.18 && bay(x, y) > 0.5) col = BLOOD[2];
    return this.flashI > 0 ? mix(col, WHITE, this.flashI * 0.7) : col;
  }

  /** The lamp's flame in its chimney: height with the oil, swaying, guttering when low, flaring on a beat. */
  flame(buf, W, t, fdt) {
    const LM = GEO.lamp, cx = LM.cx * R, wick = LM.wick * R + R, top = LM.chim.y0 * R + 1;
    const low = this.s < LOW, lid = this.veil.on ? this.veil.lid : 0;
    let h = (2.4 + 7.2 * Math.sqrt(this.s)) * R * (1 + this.env * 0.45) * (1 - lid * 0.9);
    h *= 1 + 0.07 * Math.sin(t * 17) + 0.05 * Math.sin(t * 29 + 1) + (low ? 0.18 * Math.sin(t * 41) * Math.sin(t * 7) : 0);
    h = Math.min(h, wick - top);
    const sway = (Math.sin(t * 5.3) * 0.8 + Math.sin(t * 13.1) * 0.45) * (low ? 1.8 : 1);
    const w = 0.9 + h * 0.3, C = low || this.env > 0.5 ? FLAME_LOW : FLAME;
    // a warm glow filling the chimney (behind the flame)
    const ga = Math.round(clamp(30 + h * 3 + this.env * 60, 0, 120));
    for (let fy = top; fy <= wick; fy++) for (let fx = cx - 4 * R; fx < cx + 4 * R; fx++) {
      const i = fy * W + fx;
      if ((buf[i] >>> 24) > 100) continue;
      const dd = Math.hypot((fx + 0.5 - cx) / 3, (fy - (wick - h * 0.45)) / 5);
      if (dd < 2.6 && bay(fx, fy) < 0.75) buf[i] = pk(dd < 1.4 ? 0xffb040 : 0xc86020, Math.round(ga * (1 - dd / 3)));
    }
    if (h < 1) return;
    for (let fy = Math.floor(wick - h); fy <= wick; fy++) {
      const v = (wick - fy) / h;
      const half = w * (v < 0.28 ? 0.55 + 0.45 * Math.sqrt(v / 0.28) : Math.pow(Math.max(0, 1 - (v - 0.28) / 0.72), 0.85));
      const xc = cx + sway * v * v;
      for (let fx = Math.floor(xc - half - 1); fx <= Math.ceil(xc + half); fx++) {
        const e = Math.abs(fx + 0.5 - xc) / Math.max(0.5, half);
        if (e > 1) continue;
        const i = fy * W + fx;
        let c;
        if (v < 0.1 && e > 0.55) c = e > 0.85 ? C.blueD : C.blue; // blue at the wick
        else if (e < 0.42 && v < 0.62) c = C.core;
        else if (e < 0.7 && v < 0.85) c = C.yel;
        else if (e < 0.9) c = C.org;
        else c = v > 0.7 ? C.dred : C.red;
        buf[i] = c;
      }
    }
    // the wick (a charred stub)
    buf[(wick + 1) * W + cx] = INKP; buf[(wick + 1) * W + cx - 1] = pk(0x3a2418);
    // smoke when guttering
    if (low && Math.random() < fdt * 6) this.parts.push({ k: 'smoke', x: cx + (Math.random() - 0.5) * 3, y: top - 3, vx: (Math.random() - 0.5) * 6, vy: -8 - Math.random() * 8, life: 1.2 });
  }

  render(fdt) {
    const L = this.L, W = L.W, buf = this.buf, c = GEO.ch, t = this.t;
    buf.set(L.base);
    const x0 = c.x0 * R, y0 = c.y0 * R, CW = (c.x1 - c.x0 + 1) * R, CH = (c.y1 - c.y0 + 1) * R;
    const lowK = clamp((LOW - this.s) / LOW, 0, 1);
    const ramp = lowK > 0 && (this.env > 0.3 || lowK > 0.85) ? P.low : P.stam;
    const sW = this.s * CW, gW = this.ghost * CW;
    const injX = CW * (1 - this.hu - this.inj), hunX = CW * (1 - this.hu);
    const wob = 0.6 + this.slosh;
    const shine = ((t * 0.45) % 1.7 - 0.35) * CW;
    for (let j = 0; j < CH; j++) {
      const y = y0 + j, row = y * W;
      // the liquid's edge sloshes; the biscuit's edge is bitten; the cloth's edge is torn
      const eS = sW + (sW > 1 ? wob * Math.sin(t * 9 + j * 0.55) + 0.5 * Math.sin(t * 3.1 + j * 1.3) : 0);
      const bite = (cy) => { const d = j - cy; return d * d < 12.25 ? Math.sqrt(12.25 - d * d) : 0; };
      const eH = hunX + Math.max(bite(CH * 0.28), bite(CH * 0.8)) * Math.min(1, this.hu * 30);
      const eI = injX + (hsh(j >> 1, 3, 77) < 0.5 ? 1 : 0) + (j % 3 === 0 ? 1 : 0);
      const vk = [0.92, 0.82, 0.72, 0.66, 0.62, 0.58, 0.54, 0.5, 0.44, 0.38, 0.3, 0.2][Math.min(11, Math.round(j * 11 / (CH - 1)))];
      for (let i = 0; i < CW; i++) {
        const x = x0 + i, idx = row + x;
        if (i >= eH) { // hunger: a biscuit (docking holes, crumbs), a dark crust where it was bitten
          const n = hsh(i, j, 92), ri = CW - 1 - i, hr = (ri % 8 + 8) % 8, hy = (((ri >> 3) & 1) ? 0.72 : 0.3) * CH;
          let k = 0.62 + (vk - 0.55) * 0.55 + (n > 0.9 ? 0.25 : n < 0.08 ? -0.3 : 0) + (hsh(i >> 2, j >> 2, 93) - 0.5) * 0.12;
          const hx = hr - 3.5, hj = j - hy + 0.5;
          if (hx * hx + hj * hj < 1.6) k = 0.12; // a docking hole
          else if (hx * hx + hj * hj < 3.2 && hx + hj > 0) k += 0.22; // its lit far rim
          if (i - eH < 1) k = 0.05; else if (i - eH < 2.2) k = 0.28;
          buf[idx] = dith(P.hunger, k + this.flashH * 0.5, x, y);
          continue;
        }
        if (i >= eI) { // injury: a linen bandage wound round the tube, blood seeping through
          buf[idx] = this.linen(i, j, eI, CH, x, y);
          continue;
        }
        if (i < eS) { // stamina: honey light, swirling, a shine running through, bubbles
          let k = vk + 0.06 * Math.sin(i * 0.21 - t * 2.4 + j * 0.7) + 0.04 * Math.sin(i * 0.07 + t * 1.3);
          const sd = i - shine + j * 0.7;
          if (sd > -3 && sd < 2) k += 0.22;
          if (i > eS - 1.5) k += 0.25; // the lit meniscus
          if (this.gainT > 0) k += this.gainT * 0.25;
          buf[idx] = dith(ramp, k, x, y);
        } else if (i < gW) { // what was just spent: a pale ghost draining after (a shimmer runs through it)
          const sh = ((i - ((t * 60) | 0)) & 15) < 2 ? 0.15 : 0;
          buf[idx] = mix(buf[idx], CREAM, (this.ghostT > 0 ? 0.55 : 0.38) + sh + (j < 2 ? 0.1 : 0));
        }
        // the cap line where afflictions start (a thin dark seam)
      }
      if (this.hu > 0.004) { const bx = x0 + Math.floor(eH) - 1; if (bx >= x0 + eS) buf[row + bx] = INKP; }
      if (this.inj > 0.004 && this.hu > 0.004) buf[row + x0 + Math.min(CW - 1, Math.floor(hunX) - 1)] = INKP;
    }
    // the bandage wraps over the rails too (bulging past the tube), crumbs lie on the bottom rail
    if (this.inj > 0.004) {
      const i0 = Math.max(0, Math.floor(injX)), i1 = Math.min(CW, Math.ceil(hunX));
      for (let j = -5; j < CH + 5; j++) {
        if (j >= 0 && j < CH) continue;
        const y = y0 + j, row = y * W;
        for (let i = i0; i < i1; i++) {
          const ii = i - (j < 0 ? -j - 1 : j - CH) * 0.5; // (the wrap's edge leans with the turns)
          if (ii < injX) continue;
          buf[row + x0 + i] = j === -5 || j === CH + 4 ? INKP : this.linen(i, j, injX, CH, x0 + i, y);
        }
      }
    }
    if (this.hu > 0.004) for (let i = Math.floor(hunX) - 3; i < CW; i++) {
      const n = hsh(i, 5, 97);
      if (n < 0.62) continue;
      const y = y0 + CH + (n > 0.9 ? 1 : 0), k = n > 0.85 ? 4 : 2;
      if (i >= 0) buf[y * W + x0 + i] = P.hunger[k];
    }
    this.flame(buf, W, t, fdt);
    // bubbles rising through the honey
    for (let b = 0; b < 7; b++) {
      const bx = (hsh(b, 1, 5) * CW + t * (6 + b * 2)) % Math.max(1, sW - 3), by = CH - 2 - ((t * (3 + b) + hsh(b, 2, 5) * CH) % (CH - 3));
      if (sW > 6) { const i = (y0 + (by | 0)) * W + x0 + (bx | 0); buf[i] = mix(buf[i], WHITE, 0.6); }
    }
    // the glass over it all: a highlight streak along the top, a darker bottom, a corner glint
    for (let i = 0; i < CW; i++) {
      const x = x0 + i;
      if ((i % 23) < 15) buf[y0 * W + x] = mix(buf[y0 * W + x], WHITE, 0.4);
      if ((i % 23) < 9 && i % 23 > 1) buf[(y0 + 1) * W + x] = mix(buf[(y0 + 1) * W + x], WHITE, 0.16);
      buf[(y0 + CH - 1) * W + x] = mix(buf[(y0 + CH - 1) * W + x], INKP, 0.3);
    }
    for (let k = 0; k < 3; k++) { const i = (y0 + 2 + k) * W + x0 + 3 + k; buf[i] = mix(buf[i], WHITE, 0.45); }
    // particles: sparkles (little crosses), crumbs and drops
    const dtp = Math.min(fdt, 1 / 20);
    for (let n = this.parts.length - 1; n >= 0; n--) {
      const p = this.parts[n];
      p.t = (p.t || 0) + dtp;
      if (p.t < 0) continue;
      if (p.t > p.life) { this.parts.splice(n, 1); continue; }
      if (p.k === 'star') {
        const a = p.t / p.life, r = a < 0.5 ? Math.round(a * 6) : Math.round((1 - a) * 6);
        const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < L.H) buf[(y | 0) * W + (x | 0)] = c; };
        put(p.x, p.y, WHITE);
        for (let k = 1; k <= r; k++) { const cc = k === r ? P.stam[6] : P.stam[7]; put(p.x - k, p.y, cc); put(p.x + k, p.y, cc); put(p.x, p.y - k, cc); put(p.x, p.y + k, cc); }
      } else if (p.k === 'smoke') {
        p.x += (p.vx + Math.sin(p.t * 5 + p.y) * 4) * dtp; p.y += p.vy * dtp;
        const fx = p.x | 0, fy = p.y | 0;
        if (fy >= 0 && fx >= 0 && fx < W) buf[fy * W + fx] = pk(p.t / p.life < 0.5 ? 0x8a8078 : 0x5a5250, Math.round(200 * (1 - p.t / p.life)));
      } else {
        p.vy += 140 * dtp; p.x += p.vx * dtp; p.y += p.vy * dtp;
        const fy = Math.min(y0 + CH - 1, p.y), fx = clamp(p.x, x0, x0 + CW - 1);
        const c2 = p.k === 'crumb' ? P.hunger[5 - ((p.x | 0) & 1) * 2] : P.injury[4];
        buf[(fy | 0) * W + (fx | 0)] = c2;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}

/**
 * The screen's edges: a dithered pixel vignette (cells of 3 --px) that darkens when nearly out,
 * and the eyelids of a blackout. Under the HUD while it's a vignette, over everything once the
 * eyes close.
 */
class Veil {
  constructor(ui) {
    this.ui = ui;
    this.cv = el('canvas', { class: 'stam-veil pix' });
    this.ctx = this.cv.getContext('2d');
    ui.root.insertBefore(this.cv, ui.hud);
    this.low = 0; this.lid = 0; this.dark = 0; this.on = false; this.phase = null; this.drawn = -1;
  }
  blackout(game, cb) {
    if (this.on) { cb?.(); return; }
    this.on = true; this.phase = 'close'; this.pt = 0; this.cb = cb; this.game = game; this.from = game.scene;
    this.cv.classList.add('black');
  }
  update(dt) {
    if (this.on) {
      this.pt += dt;
      const g = this.game;
      if (this.phase === 'close') {
        const k = clamp(this.pt / 1.25, 0, 1);
        // the lids droop, flutter once, then shut
        this.lid = clamp(k * k * 1.05 + 0.1 * Math.sin(this.pt * 10) * (1 - k), 0, 1);
        this.dark = Math.max(this.dark, k * k * 0.85); // the edges go first, the middle with the lids
        if (k >= 1) { this.phase = 'dark'; this.pt = 0; const cb = this.cb; this.cb = null; try { cb?.(); } catch (e) { console.error(e); } }
      } else if (this.phase === 'dark') {
        this.lid = 1; this.dark = 1;
        const ready = g.scene !== this.from && !g.transitioning;
        if ((ready && this.pt > 0.5) || this.pt > 60) { this.phase = 'open'; this.pt = 0; }
      } else {
        // a slow blink open: half, shut, wide
        const t = this.pt;
        this.lid = t < 0.35 ? 1 - 0.55 * (t / 0.35) : t < 0.5 ? 0.45 + 0.45 * ((t - 0.35) / 0.15) : clamp(0.9 * (1 - (t - 0.5) / 0.45) ** 2, 0, 1);
        this.dark = clamp(1 - t / 1.4, 0, 1);
        if (t > 1.4) { this.on = false; this.phase = null; this.lid = 0; this.dark = 0; this.cv.classList.remove('black'); }
      }
    }
    const a = Math.max(this.low * 0.8, this.dark);
    const key = Math.round(a * 60) * 1000 + Math.round(this.lid * 120);
    if (key === this.drawn) return;
    this.drawn = key;
    this.draw(a, this.lid);
  }
  draw(a, lid) {
    const cv = this.cv;
    if (a <= 0.01 && lid <= 0.01) { cv.style.display = 'none'; return; }
    cv.style.display = '';
    const px = cssPx();
    const cell = px * 3, W = Math.ceil(innerWidth / cell), H = Math.ceil(innerHeight / cell);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; this.img = this.ctx.createImageData(W, H); this.u = new Uint32Array(this.img.data.buffer); }
    const u = this.u, ink = pk(0x080304), rim = pk(0x2a0c0a), r0 = 1.05 - a * 0.85;
    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H * 2 - 1;
      for (let x = 0; x < W; x++) {
        const uu = (x + 0.5) / W * 2 - 1;
        // the eyelids: an almond gap, open widest in the middle, pinching shut from the corners
        const o = 1 - lid, gap = o * 1.3 * (1 - 0.55 * uu * uu) + o * o * o * o;
        const top = -gap, bot = gap;
        if (v < top || v > bot) { u[y * W + x] = lid < 0.97 && ((v < top && v > top - 2 / H) || (v > bot && v < bot + 2 / H)) ? rim : ink; continue; } // (a warm rim on the lids' edges till they meet)
        // the vignette: a rounded-rectangle falloff, dithered in four steps
        const e = Math.pow(Math.pow(Math.abs(uu), 2.6) + Math.pow(Math.abs(v), 2.6), 1 / 2.6);
        const d = clamp((e - r0) / 0.6, 0, 1) * Math.min(1, a * 1.4);
        const q = Math.floor(d * 3 + bay(x, y));
        u[y * W + x] = q <= 0 ? 0 : pk(0x080304, q >= 3 ? 255 : q === 2 ? 170 : 90);
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}

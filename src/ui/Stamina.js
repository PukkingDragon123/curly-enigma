// The stamina gauge (replaces the energy lantern), wave 19 in the house style ("Lamplight Woodcut"):
// a carved walnut stave with a trough gouged along it, iron staples at the quarters, and on its left
// end a forged-iron and oak medallion holding the mole's own face, live in 3D (src/ui/staminaFace.js:
// the hero's real voxel head, wearing the helmet he has on). Flat tones and hatching; no gloss, no glow.
//  - stamina is the amber in the trough (flat tones, the low rows hatched, a cut cream edge that
//    sloshes a little); a drain leaves a pale hatched ghost that drains after it (and shakes the
//    stave), a refill springs up; nearly out the amber turns ember-red and thumps with the heart and
//    the screen edges darken (hatched)
//  - afflictions eat the trough from the right: hunger (a bitten biscuit, crumbs on the rail) and
//    injury (a linen bandage wound round the stave, blood soaking through); their length is what
//    stamina can't fill (State.energyCap)
//  - the face reacts to it all: content and blinking when fine, looking down with its tongue out and
//    the tummy rumbling when hungry, a bandage and winces when hurt, droopy lids, sweat and panting
//    when tired, lids fluttering and stars circling near a blackout; a flinch when hit, a happy chew
//    when eating, a grin on a level up
//  - at 0 underground: blackout(cb) closes the eyes (a hatched vignette and eyelids), cb takes the
//    mole home, and the eyes blink open in the next scene
// It rides on the tool belt when the belt is up (between the held tool's name and the strap), at
// the bottom middle otherwise; it tucks away a moment after it's full and nothing's happening.
// Rules: src/core/vitals.js. Art: src/ui/staminaArt.js.
import { el, clamp } from '../core/util.js';
import { GEO, PAL, pk, gaugeLayers, hatchP } from './staminaArt.js';
import { MoleFace } from './staminaFace.js';
import './stamina.css';

const LOW = 0.25; // of the full bar: ember colour, heartbeat
const P = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, Array.isArray(v) ? v.map((c) => pk(c)) : pk(v)]));
const INKP = P.ink, CREAM = P.cream;
/** The interface's pixel size (CSS px per art px). */
const cssPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
/** Fine pixels per art pixel: one per CSS pixel, so nothing is ever smeared. */
const resOf = (px) => clamp(Math.round(px), 2, 4);
const hsh = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** Blend a packed colour over a packed pixel. */
const mix = (o, c, t) => {
  const s = 1 - t;
  return ((255 << 24) | ((((o >> 16) & 255) * s + ((c >> 16) & 255) * t) << 16) | ((((o >> 8) & 255) * s + ((c >> 8) & 255) * t) << 8) | ((o & 255) * s + (c & 255) * t)) >>> 0;
};

export class StaminaBar {
  constructor(hud) {
    this.hud = hud;
    this.game = hud.game;
    this.px = cssPx();
    this.cv = el('canvas', { class: 'stam-cv pix' });
    this.ctx = this.cv.getContext('2d');
    this.face = new MoleFace(this.game);
    this.setRes(resOf(this.px));
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
    this.beatT = 0; this.env = 0;
    this.parts = [];
    addEventListener('resize', () => { this.px = cssPx(); this.setRes(resOf(this.px)); });
    // the face's reactions and its helmet
    const st = this.game.state;
    st.on?.('skill', (e) => { if (e?.type === 'level' && this.hud.ui.hudMode !== 'none') { this.face.react('level'); this.peek(2.6); } });
    st.on?.('equip', (e) => { if (e?.slot === 'helmet') this.face.setHelmet(e.id || null); });
    st.on?.('load', () => this.face.setHelmet(st.data.equip?.helmet || null));
    this.render(0);
  }

  /** (Re)size the canvas for R fine pixels per art pixel. */
  setRes(R) {
    if (R === this.R) return;
    this.R = R;
    this.L = gaugeLayers(R);
    this.cv.width = this.L.W; this.cv.height = this.L.H;
    this.img = this.ctx.createImageData(this.L.W, this.L.H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.face.setBox(GEO.face.w, GEO.face.h, R);
    this.parts = [];
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
    const d = e.delta || 0, R = this.R;
    if (e.injury) {
      this.flashI = 1; this.kick(4 + Math.min(6, e.injury)); this.peek(3);
      this.face.react('hit');
      const x = this.edgeX(1 - this.hu - this.inj);
      for (let k = 0; k < 6; k++) this.parts.push({ k: 'drop', x: x + Math.random() * 4 * R, y: GEO.ch.y0 * R + Math.random() * 3 * R, vx: (Math.random() - 0.3) * 15 * R, vy: (-10 - Math.random() * 15) * R, life: 0.6 });
    } else if (d < -2.5) { this.kick(Math.min(5, -d * 0.4)); this.peek(2.5); }
    if (e.fed) {
      this.squashV -= 9; this.gainT = 0.8; this.flashH = 0.6; this.peek(3.2);
      this.face.react('eat');
      const hx = this.edgeX(1 - this.hu);
      for (let k = 0; k < 8; k++) this.parts.push({ k: 'crumb', x: hx + (Math.random() * 6 - 1) * R, y: GEO.ch.y0 * R + Math.random() * 5 * R, vx: (-5 + Math.random() * 15) * R, vy: (-12 - Math.random() * 12) * R, life: 0.7 + Math.random() * 0.3 });
    }
    if (e.mend) this.peek(2.5);
  }
  kick(a) { this.shakeV += (Math.random() < 0.5 ? -1 : 1) * a * 18; this.slosh = Math.min(3, this.slosh + a * 0.4); }
  /** Fine x of a fraction of the bar. */
  edgeX(f) { const c = GEO.ch; return c.x0 * this.R + f * (c.x1 - c.x0 + 1) * this.R; }

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
    if (rising && Math.abs(v.s - this.s) < 0.0005 && Math.abs(this.sv) < 0.01) { this.s = v.s; this.sv = 0; }
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
    const visible = this.shown || this.dock.classList.contains('show');
    // the face: its timers always run, pictures only while it's on screen
    const changed = this.face.tick(dt, { s: this.s, h: this.hu, i: this.inj, out: this.veil.on ? Math.max(0.05, this.veil.lid) : 0 }, visible && ui.hudMode !== 'none');
    if (this.face.chew) { this.face.chew = false; this.crumbs(); }
    if (!visible) return;
    void changed;
    // the canvas moves by whole art pixels (crisp), squashes, thumps with the heart
    const px = this.px;
    const sx = Math.round(this.shake) * px / 2, sq = clamp(this.squash * 0.35, -0.16, 0.16), beat = this.env * 0.04;
    this.cv.style.transform = `translate(${sx}px, 0) scale(${(1 - sq * 0.6 + beat).toFixed(3)}, ${(1 + sq + beat).toFixed(3)})`;
    this.render(dt);
  }

  /** A few crumbs off the mouth (a chomp). */
  crumbs() {
    const f = this.face, R = this.R;
    const x = GEO.face.x * R + f.mouth.x + f.bob.x, y = GEO.face.y * R + f.mouth.y + f.bob.y;
    for (let k = 0; k < 2; k++) this.parts.push({ k: 'crumb', x: x + (Math.random() * 3 - 1) * R, y, vx: (Math.random() * 10 - 2) * R, vy: (-6 - Math.random() * 6) * R, life: 0.55 });
  }

  /** A bandage pixel: wound turns slanting round the stave (a shadow line, a lit edge), the blood soaking from its middle. */
  linen(i, j, eI, CH, P) {
    const R = this.R, CW = (GEO.ch.x1 - GEO.ch.x0 + 1) * R, ri = CW - 1 - i;
    const span = 3 * R, q = (((ri + j * 0.8) % span) + span) % span;
    let col = q < 1 ? P.linen[0] : q < 1 + Math.max(1, R >> 1) ? P.linen[4] : j >= CH - R ? (((i + j) % hatchP(R)) === 0 ? P.linen[1] : P.linen[2]) : P.linen[3];
    if (j < 0 || j >= CH) col = q < 1 ? P.linen[0] : j < 0 ? P.linen[3] : P.linen[2];
    if (i - eI < 1) col = INKP; // the frayed leading edge
    else if (i - eI < 2 && hsh(i, j, 81) < 0.5) col = P.linen[1];
    // the blood: a flat blot round the bandage's middle, spreading with the wound
    const w = Math.max(1, CW * this.inj), mid = eI + w * 0.5;
    const dx = (i - mid) / Math.max(2 * R, w * 0.42), dy = (j - CH * 0.5) / (CH * 0.9 + 2);
    const d = dx * dx + dy * dy * 1.6 + (hsh(i / R | 0, j / R | 0, 83) - 0.5) * 0.35;
    const rr = clamp(0.06 + this.inj * 0.9, 0.06, 0.55);
    if (d < rr * 0.55) col = P.blood[0];
    else if (d < rr) col = q < 1 ? P.blood[0] : P.blood[1];
    else if (d < rr + 0.12 && (i + j) % hatchP(R) === 0) col = P.blood[2];
    return this.flashI > 0.5 ? CREAM : col;
  }

  render(fdt) {
    const L = this.L, W = L.W, R = this.R, buf = this.buf, c = GEO.ch, t = this.t, HP = hatchP(R);
    buf.set(L.base);
    const x0 = c.x0 * R, y0 = c.y0 * R, CW = (c.x1 - c.x0 + 1) * R, CH = (c.y1 - c.y0 + 1) * R;
    const lowK = clamp((LOW - this.s) / LOW, 0, 1);
    let A = lowK > 0 ? P.low : P.stam;
    // on a heartbeat the ember goes a tone up (flat, no glow)
    const up = (lowK > 0 && this.env > 0.45) || this.gainT > 0.4 ? 1 : 0;
    const tone = (k) => A[clamp(k + up, 0, 4)];
    const sW = this.s * CW, gW = this.ghost * CW;
    const injX = CW * (1 - this.hu - this.inj), hunX = CW * (1 - this.hu);
    const wob = 0.6 + this.slosh;
    for (let j = 0; j < CH; j++) {
      const y = y0 + j, row = y * W, ja = j / R; // ja: the art row
      // the amber's edge sloshes (whole fine pixels); the biscuit's edge is bitten; the cloth's is torn
      const eS = sW > 1 ? Math.round(sW + wob * Math.sin(t * 8 + ja * 1.1) * R * 0.35 + 0.4 * R * Math.sin(t * 3.1 + ja * 2.2) * 0.3) : sW;
      const bite = (cy) => { const d = ja - cy, rr = 1.7; return d * d < rr * rr ? Math.sqrt(rr * rr - d * d) * R : 0; };
      const eH = hunX + Math.max(bite(1.9), bite(5.6)) * Math.min(1, this.hu * 30);
      const eI = injX + (hsh(ja | 0, 3, 77) < 0.5 ? 1 : 0);
      for (let i = 0; i < CW; i++) {
        const x = x0 + i, idx = row + x;
        if (i >= eH) { // hunger: a biscuit, flat tones, docking holes in rows, the underside hatched
          const ri = CW - 1 - i, ia = Math.floor(ri / R), hr = ((ia % 5) + 5) % 5, hrow = ((ia / 5) | 0) & 1 ? 4.5 : 2;
          let k = ja < 1 ? 3 : ja > 5 ? (((i + j) % HP) === 0 ? 0 : 1) : 2;
          if (hr === 2 && Math.abs(ja - hrow) < 0.5) k = 0; // a docking hole
          else if (hr === 2 && ja - hrow >= 0.5 && ja - hrow < 1) k = 4; // its lit lower lip
          if (i - eH < 1) k = -1; else if (i - eH < R) k = 1;
          buf[idx] = k < 0 ? INKP : this.flashH > 0.3 && k > 0 ? P.hunger[4] : P.hunger[k];
          continue;
        }
        if (i >= eI) { buf[idx] = this.linen(i, j, eI, CH, P); continue; }
        if (i < eS) { // stamina: amber, lit top row, flat middle, hatched low rows, a cut cream edge
          let k = ja < 1 ? 3 : ja < 4 ? 2 : (((i + j) % HP) === 0 ? 0 : 1);
          if (j === 0 && ((i / (2 * R)) | 0) % 6 !== 3) k = 4;
          // the flow: a few long strokes drifting along (texture, not shine)
          if (ja >= 1 && ja < 4 && j % R === (R >> 1) && hsh(((i + t * 7 * R) / (6 * R)) | 0, ja | 0, 13) > 0.78) k = 3;
          if (i >= eS - Math.max(1, R >> 1) - (this.gainT > 0 ? R : 0)) k = 4;
          buf[idx] = tone(k);
        } else if (i < gW) { // what was just spent: pale cream hatching that drains after
          const dense = this.ghostT > 0 ? 2 : HP;
          if ((i - j + 999 * HP) % dense === 0 || j === 0) buf[idx] = mix(buf[idx], CREAM, this.ghostT > 0 ? 0.85 : 0.6);
        }
      }
      if (this.hu > 0.004) { const bx = x0 + Math.floor(eH) - 1; if (bx >= x0 + eS) buf[row + bx] = INKP; }
      if (this.inj > 0.004 && this.hu > 0.004) buf[row + x0 + Math.min(CW - 1, Math.floor(hunX) - 1)] = INKP;
    }
    // the bandage wraps over the rails too (bulging past the trough), its edges inked
    if (this.inj > 0.004) {
      const i0 = Math.max(0, Math.floor(injX)), i1 = Math.min(CW, Math.ceil(hunX)), bulge = 2 * R;
      for (let j = -bulge; j < CH + bulge; j++) {
        if (j >= 0 && j < CH) continue;
        const y = y0 + j, row = y * W;
        for (let i = i0; i < i1; i++) {
          const ii = i - (j < 0 ? -j - 1 : j - CH) * 0.5; // (the wrap's edge leans with the turns)
          if (ii < injX) continue;
          buf[row + x0 + i] = j === -bulge || j === CH + bulge - 1 || i === i1 - 1 ? INKP : this.linen(i, j, injX, CH, P);
        }
      }
    }
    // crumbs on the lower rail under the biscuit
    if (this.hu > 0.004) for (let ia = Math.floor(hunX / R) - 2; ia < CW / R; ia++) {
      const n = hsh(ia, 5, 97);
      if (n < 0.6 || ia < 0) continue;
      const yy = (c.y1 + 1 + (n > 0.88 ? 1 : 0)) * R + 1, k = n > 0.8 ? 4 : 2;
      for (let a = 0; a < Math.max(1, R >> 1); a++) for (let b = 0; b < Math.max(1, R >> 1); b++) buf[(yy + b) * W + x0 + ia * R + a] = P.hunger[k];
    }
    this.drawFace();
    // the tummy rumbling: cut marks shaking beside the medallion
    const rb = this.face.rumble;
    if (rb > 0.05) {
      const jit = Math.round(Math.sin(t * 40) * rb * R * 0.5);
      for (let m = 0; m < 2; m++) {
        const ax = 34.4 + m * 1.6, h = 2.6 - m * 0.6;
        for (let k = -h; k <= h; k += 1 / R) {
          const fx = Math.round((ax + 0.55 * (1 - (k / h) ** 2)) * R) + jit, fy = Math.round((27.5 + k) * R);
          for (let w = 0; w < Math.max(1, R >> 1); w++) buf[fy * W + fx + w] = CREAM;
        }
      }
    }
    // particles: crumbs and drops (little squares)
    const dtp = Math.min(fdt, 1 / 20), sz = Math.max(1, R >> 1);
    for (let n = this.parts.length - 1; n >= 0; n--) {
      const p = this.parts[n];
      p.t = (p.t || 0) + dtp;
      if (p.t > p.life) { this.parts.splice(n, 1); continue; }
      p.vy += 70 * R * dtp; p.x += p.vx * dtp; p.y += p.vy * dtp;
      const fx = clamp(p.x | 0, 0, W - sz), fy = clamp(p.y | 0, 0, L.H - sz);
      const c2 = p.k === 'crumb' ? P.hunger[((p.x / R) | 0) & 1 ? 4 : 2] : P.blood[2];
      for (let a = 0; a < sz; a++) for (let b = 0; b < sz; b++) buf[(fy + b) * W + fx + a] = c2;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  /** The face in its medallion: a hatched shadow on the recess, the picture, the rim's lower half over it. */
  drawFace() {
    const L = this.L, W = L.W, H = L.H, R = this.R, buf = this.buf, f = this.face, pic = f.pic;
    if (pic) {
      const ox = GEO.face.x * R + f.bob.x, oy = GEO.face.y * R + f.bob.y, pw = pic.w, ph = pic.h, HP = hatchP(R);
      const sd = R; // the shadow's offset (down and right)
      for (let y = 0; y < ph; y++) {
        const fy = oy + y + sd;
        if (fy < 0 || fy >= H) continue;
        for (let x = 0; x < pw; x++) {
          if (pic.a[y * pw + x] < 255) continue;
          const fx = ox + x + sd;
          if (fx < 0 || fx >= W || !L.rec[fy * W + fx]) continue;
          if ((fx + fy) % HP < 2) buf[fy * W + fx] = P.recess[0];
        }
      }
      for (let y = 0; y < ph; y++) {
        const fy = oy + y;
        if (fy < 0 || fy >= H) continue;
        for (let x = 0; x < pw; x++) {
          const a = pic.a[y * pw + x];
          if (!a) continue;
          const fx = ox + x;
          if (fx < 0 || fx >= W) continue;
          const i = fy * W + fx;
          if (!L.clip[i]) continue;
          buf[i] = a === 255 ? pic.u[y * pw + x] : mix(buf[i], pic.u[y * pw + x], a / 255);
        }
      }
    }
    const fr = L.front;
    for (let i = 0; i < fr.length; i++) if (fr[i]) buf[i] = fr[i];
  }
}

/**
 * The screen's edges: a hatched pixel vignette (cells of 3 --px) that darkens when nearly out, and
 * the eyelids of a blackout. Under the HUD while it's a vignette, over everything once the eyes close.
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
    const u = this.u, ink = pk(0x0c0410), rim = pk(0x2e0e0e), r0 = 1.05 - a * 0.85;
    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H * 2 - 1;
      for (let x = 0; x < W; x++) {
        const uu = (x + 0.5) / W * 2 - 1;
        // the eyelids: an almond gap, open widest in the middle, pinching shut from the corners
        const o = 1 - lid, gap = o * 1.3 * (1 - 0.55 * uu * uu) + o * o * o * o;
        const top = -gap, bot = gap;
        if (v < top || v > bot) { u[y * W + x] = lid < 0.97 && ((v < top && v > top - 2 / H) || (v > bot && v < bot + 2 / H)) ? rim : ink; continue; } // (a warm rim on the lids' edges till they meet)
        // the vignette: a rounded-rectangle falloff cut in three hatched bands, their edges hand-wavy
        const e = Math.pow(Math.pow(Math.abs(uu), 2.6) + Math.pow(Math.abs(v), 2.6), 1 / 2.6) + 0.025 * Math.sin(x * 0.7 + y * 0.3) * Math.sin(y * 0.5);
        const d = clamp((e - r0) / 0.6, 0, 1) * Math.min(1, a * 1.4);
        const q = Math.floor(d * 3.2);
        u[y * W + x] = q <= 0 ? 0 : q >= 3 ? ink : q === 2 ? ((x + y) % 2 === 0 ? ink : pk(0x0c0410, 120)) : (x + y) % 3 === 0 ? pk(0x0c0410, 210) : 0;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}

// The stamina gauge (replaces the energy lantern), wave 19, hand-drawn: a carved walnut stave with a
// trough cut along it, iron staples, and on its left end a forged-iron medallion holding the mole's own
// face, live in 3D (src/ui/staminaFace.js: the hero's real voxel head in flat colours, wearing the
// helmet he has on). All the 2D is hand-made pixel maps (src/ui/staminaArt.js) placed and tiled at one
// canvas pixel per art pixel, scaled up whole in CSS; no gloss, no glow, no noise.
//  - stamina is the amber in the trough (three flat tones, a lit dash drifting along, a cut edge
//    that sloshes); a drain leaves pale hatching that drains after it (and shakes the stave), a
//    refill springs up; nearly out the amber turns ember-red and thumps with the heart and the
//    screen edges darken (hatched)
//  - afflictions eat the trough from the right: hunger (a bitten biscuit) and injury (a linen
//    bandage wound round the stave, blood soaking through); their length is what
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
import { GEO, TONE, FILL, EDGE, GHOST, BISCUIT, BITE, BANDAGE, BLOOD, RUMBLE, pk, gaugeLayers } from './staminaArt.js';
import { MoleFace } from './staminaFace.js';
import './stamina.css';

const LOW = 0.25; // of the full bar: ember colour, heartbeat
/** The interface's pixel size (CSS px per art px). */
const cssPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;

export class StaminaBar {
  constructor(hud) {
    this.hud = hud;
    this.game = hud.game;
    this.px = cssPx();
    this.L = gaugeLayers();
    this.cv = el('canvas', { class: 'stam-cv pix', width: this.L.W, height: this.L.H });
    this.ctx = this.cv.getContext('2d');
    this.img = this.ctx.createImageData(this.L.W, this.L.H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.face = new MoleFace(this.game);
    this.face.setBox(GEO.face.w, GEO.face.h, 1);
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
    addEventListener('resize', () => { this.px = cssPx(); });
    // the face's reactions and its helmet
    const st = this.game.state;
    st.on?.('skill', (e) => { if (e?.type === 'level' && this.hud.ui.hudMode !== 'none') { this.face.react('level'); this.peek(2.6); } });
    st.on?.('equip', (e) => { if (e?.slot === 'helmet') this.face.setHelmet(e.id || null); });
    st.on?.('load', () => this.face.setHelmet(st.data.equip?.helmet || null));
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
    const d = e.delta || 0, c = GEO.ch;
    if (e.injury) {
      this.flashI = 1; this.kick(4 + Math.min(6, e.injury)); this.peek(3);
      this.face.react('hit');
      const x = this.edgeX(1 - this.hu - this.inj);
      for (let k = 0; k < 4; k++) this.parts.push({ k: 'drop', x: x + Math.random() * 4, y: c.y0 + Math.random() * 3, vx: (Math.random() - 0.3) * 14, vy: -8 - Math.random() * 10, life: 0.6 });
    } else if (d < -2.5) { this.kick(Math.min(5, -d * 0.4)); this.peek(2.5); }
    if (e.fed) {
      this.squashV -= 9; this.gainT = 0.8; this.flashH = 0.6; this.peek(3.2);
      this.face.react('eat');
      const hx = this.edgeX(1 - this.hu);
      for (let k = 0; k < 6; k++) this.parts.push({ k: 'crumb', x: hx + Math.random() * 6 - 1, y: c.y0 + Math.random() * 4, vx: -5 + Math.random() * 14, vy: -10 - Math.random() * 10, life: 0.7 + Math.random() * 0.3 });
    }
    if (e.mend) this.peek(2.5);
  }
  kick(a) { this.shakeV += (Math.random() < 0.5 ? -1 : 1) * a * 18; this.slosh = Math.min(3, this.slosh + a * 0.4); }
  /** Art x of a fraction of the bar. */
  edgeX(f) { const c = GEO.ch; return c.x0 + f * (c.x1 - c.x0 + 1); }

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
    this.face.tick(dt, { s: this.s, h: this.hu, i: this.inj, out: this.veil.on ? Math.max(0.05, this.veil.lid) : 0 }, visible && ui.hudMode !== 'none');
    if (this.face.chew) { this.face.chew = false; this.crumbs(); }
    if (!visible) return;
    // the canvas moves by whole art pixels (crisp), squashes, thumps with the heart
    const px = this.px;
    const sx = Math.round(this.shake / 2) * px, sq = clamp(this.squash * 0.35, -0.16, 0.16), beat = this.env * 0.04;
    this.cv.style.transform = `translate(${sx}px, 0) scale(${(1 - sq * 0.6 + beat).toFixed(3)}, ${(1 + sq + beat).toFixed(3)})`;
    this.render(dt);
  }

  /** A few crumbs off the mouth (a chomp). */
  crumbs() {
    const f = this.face;
    const x = GEO.face.x + f.mouth.x + f.bob.x, y = GEO.face.y + f.mouth.y + f.bob.y;
    for (let k = 0; k < 2; k++) this.parts.push({ k: 'crumb', x: x + Math.random() * 3 - 1, y, vx: Math.random() * 10 - 2, vy: -5 - Math.random() * 5, life: 0.55 });
  }

  /**
   * Paint the trough: the base art, then the fills tiled in (amber with its cut edge, the pale
   * hatching of what was just spent, the biscuit, the bandage and its blood), the face, the rim over
   * it, the rumble marks and the crumbs. Every pixel comes from the hand-made maps.
   */
  render(fdt) {
    const L = this.L, W = L.W, buf = this.buf, c = GEO.ch, t = this.t, T = TONE;
    buf.set(L.base);
    const x0 = c.x0, y0 = c.y0, CW = c.x1 - c.x0 + 1, CH = c.y1 - c.y0 + 1;
    const low = this.s < LOW;
    const A = low ? T.ember : T.amber;
    // on a heartbeat the ember goes up a tone (a recolour, no glow)
    const up = (low && this.env > 0.45) || this.gainT > 0.4;
    const tone = (ch) => A[up ? (ch === 'c' ? 'b' : 'a') : ch];
    const sW = Math.round(this.s * CW), gW = Math.round(this.ghost * CW);
    const hunX = Math.round(CW * (1 - this.hu)), injX = Math.min(hunX, Math.round(CW * (1 - this.hu - this.inj)));
    const frame = this.slosh > 0.25 || this.sv > 0.02 ? Math.floor(t * 9) % 3 : Math.floor(t * 1.5) % 2 ? 0 : 1;
    const drift = Math.floor(t * 5);
    for (let j = 0; j < CH; j++) {
      const row = (y0 + j) * W;
      const eS = sW > 1 ? sW - EDGE[frame][j] : sW;
      for (let i = 0; i < Math.min(injX, CW); i++) {
        const idx = row + x0 + i;
        if (i < eS) {
          let ch = FILL.rows[j];
          if (j === 1 && (i + drift) % FILL.period < FILL.dash) ch = 'a';
          buf[idx] = i >= eS - 1 - (this.gainT > 0 ? 1 : 0) ? (j < 2 ? T.e : A.a) : tone(ch);
        } else if (i < gW) {
          if (GHOST[j][i & 3] === 'e' && (this.ghostT > 0 || (i & 1) === 0)) buf[idx] = T.e;
        }
      }
      // hunger: the biscuit, tiled from its right end so it doesn't crawl, bitten at its front
      for (let i = hunX; i < CW; i++) {
        const ch = BISCUIT[j][(CW - 1 - i) % BISCUIT[0].length];
        buf[row + x0 + i] = this.flashH > 0.3 ? T.g : T[ch];
      }
      if (this.hu > 0.004) for (let b = 0; b < 3; b++) {
        const ch = BITE[j][b], i = hunX - 1 + b;
        if (ch !== '.' && i >= 0 && i < CW) buf[row + x0 + i] = T[ch];
      }
    }
    // injury: the bandage wound round the stave (over its rails too), its frayed front, the blood
    if (injX < hunX) {
      const S = GEO.stave;
      for (let r = 0; r < BANDAGE.length; r++) {
        const row = (S.y + r) * W;
        for (let i = injX; i < hunX; i++) {
          let ch = BANDAGE[r][(x0 + i) % 5];
          if (i === injX && r > 0 && r < 11) ch = r % 4 === 2 ? 'o' : 'K';
          if (i === hunX - 1 && this.hu > 0.004) ch = 'K';
          buf[row + x0 + i] = this.flashI > 0.5 && ch !== 'K' ? T.n : T[ch];
        }
      }
      const blot = BLOOD[this.inj < 0.06 ? 0 : this.inj < 0.14 ? 1 : 2], bw = blot[0].length;
      if (hunX - injX >= bw + 2) {
        const bx = x0 + Math.round((injX + hunX - bw) / 2), by = y0 + Math.round((CH - blot.length) / 2);
        blot.forEach((rw, j) => { for (let i = 0; i < bw; i++) if (rw[i] !== '.') buf[(by + j) * W + bx + i] = T[rw[i]]; });
      }
    }
    this.drawFace();
    // the tummy rumbling: two cut marks shaking beside the medallion
    if (this.face.rumble > 0.1) {
      const jit = Math.round(Math.sin(t * 40) * this.face.rumble);
      for (const mx of [30, 33]) RUMBLE.forEach((rw, j) => { for (let i = 0; i < 2; i++) if (rw[i] === 'e') buf[(GEO.stave.y - 6 + j) * W + mx + i + jit] = T.e; });
    }
    // crumbs and drops: single pixels, falling
    const dtp = Math.min(fdt, 1 / 20);
    for (let n = this.parts.length - 1; n >= 0; n--) {
      const p = this.parts[n];
      p.t = (p.t || 0) + dtp;
      if (p.t > p.life) { this.parts.splice(n, 1); continue; }
      p.vy += 60 * dtp; p.x += p.vx * dtp; p.y += p.vy * dtp;
      const fx = clamp(p.x | 0, 0, W - 1), fy = clamp(p.y | 0, 0, L.H - 1);
      buf[fy * W + fx] = p.k === 'crumb' ? ((fx & 1) ? T.g : T.f) : T.x;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  /** The face in its medallion: its shadow dims the lamplit patch, then the picture, then the rim over it. */
  drawFace() {
    const L = this.L, W = L.W, H = L.H, buf = this.buf, f = this.face, pic = f.pic;
    if (pic) {
      const ox = GEO.face.x + f.bob.x, oy = GEO.face.y + f.bob.y, pw = pic.w, ph = pic.h, dim = pk(0x2e1b33), lit = pk(0x4a2b4a);
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        if (pic.a[y * pw + x] < 255) continue;
        const fx = ox + x + 1, fy = oy + y + 1, i = fy * W + fx;
        if (fx >= 0 && fy >= 0 && fx < W && fy < H && L.rec[i] && buf[i] === lit) buf[i] = dim;
      }
      for (let y = 0; y < ph; y++) {
        const fy = oy + y;
        if (fy < 0 || fy >= H) continue;
        for (let x = 0; x < pw; x++) {
          const fx = ox + x, i = fy * W + fx;
          if (fx < 0 || fx >= W || !pic.a[y * pw + x] || !L.clip[i]) continue;
          buf[i] = pic.u[y * pw + x];
        }
      }
    }
    const fr = L.front;
    for (let i = 0; i < fr.length; i++) if (fr[i]) buf[i] = fr[i];
  }
}

/** The vignette's hatch tiles (sparse, then dense), drawn by hand. */
const VEIL = [
  ['K...', '....', '..K.', '....'],
  ['K..K', '.K..', '..K.', 'K..K'],
];

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
    const u = this.u, ink = pk(0x1e1424), rim = pk(0x2e1b33), r0 = 1.05 - a * 0.85;
    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H * 2 - 1;
      for (let x = 0; x < W; x++) {
        const uu = (x + 0.5) / W * 2 - 1;
        // the eyelids: an almond gap, open widest in the middle, pinching shut from the corners
        const o = 1 - lid, gap = o * 1.3 * (1 - 0.55 * uu * uu) + o * o * o * o;
        const top = -gap, bot = gap;
        if (v < top || v > bot) { u[y * W + x] = lid < 0.97 && ((v < top && v > top - 2 / H) || (v > bot && v < bot + 2 / H)) ? rim : ink; continue; } // (a warm rim on the lids' edges till they meet)
        // the vignette: a rounded-rectangle falloff cut in three bands, each a small hatch tile
        const e = Math.pow(Math.pow(Math.abs(uu), 2.6) + Math.pow(Math.abs(v), 2.6), 1 / 2.6);
        const d = clamp((e - r0) / 0.6, 0, 1) * Math.min(1, a * 1.4);
        const q = Math.floor(d * 3.2);
        u[y * W + x] = q <= 0 ? 0 : q >= 3 || VEIL[q - 1][y % 4][x % 4] === 'K' ? ink : 0;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}

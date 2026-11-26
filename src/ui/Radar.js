// The radar: a brass hand-held scope with a green phosphor screen, top-left in first person.
// Forward is always up. It draws the explored map around you, sweeps, and lights up markers:
// home, the town (an arrow on the rim when it is out of range), ore, danger zones, creatures,
// lift stations and glow stakes. Markers well above or below you show as ▲ / ▼.
// Click / tap it (or press M) for the layers below (the underground's layer scene).
import { el } from '../core/util.js';
import { Px } from './uiArt.js';
import { nearest } from './palette.js';
const SNAP = new Map();
/** A marker's own colour, snapped to the master palette (cached). */
const snapC = (c) => { if (!SNAP.has(c)) SNAP.set(c, parseInt(nearest('#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6)).hex.slice(1), 16)); return SNAP.get(c); };
import { RADAR, plotGlyph } from './deepArt.js';
import { HS } from './hudSprites.js'; // (wave 20: the bezel, glass, fleur and arrows are hand-drawn maps)
import { hex as P } from './hudPix.js';

export const CELL = { unknown: 0, open: 1, water: 2, lava: 3, rock: 4 };
const TAU = Math.PI * 2;

// (wave 20: every screen colour is a master-palette colour, src/ui/palette.js, through the HUD legend)
export const MARK_COLOR = {
  home: P('H'), town: P('G'), station: P('g'), stake: P('F'), enemy: P('h'), danger: P('r'), ore: P('G'), quest: P('Y'),
};
const SCR = { unknown: P('K'), open: P('v'), water: P('z'), lava: P('w'), rock: P('M'), openEdge: P('f'), waterEdge: P('a'), lavaEdge: P('H'), lavaHot: P('h'), ring: P('V'), sweep: P('F'), sweepTail: P('V'), ink: P('K'), you: P('C') };
export const LEVEL_GAP = 3; // meters above/below before a marker shows ▲ / ▼

/**
 * Sampler over the provider's explored grid: (worldX, worldZ) → cell value.
 * Cells are row-major (index = iz * size + ix). The grid's corner is explored.ox / explored.oz if
 * given, otherwise the grid is centered on the player snapped to whole cells.
 */
export function gridSampler(data) {
  const ex = data && data.explored;
  if (!ex || !ex.data || !ex.size) return () => 0;
  const { size } = ex;
  const cell = ex.cell || 1;
  const ox = ex.ox ?? (Math.floor(data.x / cell) - Math.floor(size / 2)) * cell;
  const oz = ex.oz ?? (Math.floor(data.z / cell) - Math.floor(size / 2)) * cell;
  const d = ex.data;
  return (wx, wz) => {
    const ix = Math.floor((wx - ox) / cell), iz = Math.floor((wz - oz) / cell);
    if (ix < 0 || iz < 0 || ix >= size || iz >= size) return 0;
    return d[iz * size + ix] || 0;
  };
}

const angDiff = (a, b) => { let d = (a - b) % TAU; if (d < 0) d += TAU; return d; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export class Radar {
  constructor(ui) {
    this.ui = ui;
    this.provider = null;
    this.opts = {};
    this.data = null;
    this.pollT = 0;
    this.sweep = 0;
    this.heading = 0;
    this.time = 0;
    this.errLogged = false;
    this.screen = new Px(RADAR.screen, RADAR.screen);
    this.screen.c.className = 'pix radar-screen';
    this.tag = el('span', { class: 'radar-tag', hidden: true });
    this.el = el('button', {
      class: 'radar', hidden: true, title: 'Radar · M or tap: the layers below', 'aria-label': 'Radar: open the layers below',
      onclick: () => ui.openSurvey(),
    }, [this.screen.c, el('img', { class: 'pix radar-glass', src: HS.radarGlass(), alt: '' }), el('img', { class: 'pix radar-ring', src: HS.radarRing(), alt: '' }), this.tag]);
    // the north fleur: rides the dial band, swung toward north on a damped spring (it overshoots
    // and wobbles when you turn fast, trembles a little while you walk, and jumps when tapped)
    this.north = el('img', { class: 'pix radar-north', src: HS.fleur(), alt: '' }); // (also the depth plaque's crest: --d-fleur, hudSprites)
    this.el.append(this.north);
    this.nAng = 0;
    this.nVel = 0;
    this.el.addEventListener('pointerdown', () => { this.nVel += (Math.random() < 0.5 ? -1 : 1) * 7; });
    ui.hud.append(this.el);
  }

  /** provider() → { x, y, z, heading, range, explored, markers }. opts.heading: () => yaw, read every frame. */
  set(provider, opts = {}) {
    this.provider = typeof provider === 'function' ? provider : null;
    this.opts = opts || {};
    this.data = null;
    this.pollT = 1;
    this.el.hidden = !this.provider;
    if (!this.provider) this.tag.hidden = true;
  }

  poll(args) {
    if (!this.provider) return null;
    try {
      return this.provider(args);
    } catch (e) {
      if (!this.errLogged) { this.errLogged = true; console.warn('radar provider failed', e); }
      return null;
    }
  }

  update(dt) {
    if (!this.provider || this.ui.hudMode !== 'deep' || this.ui.isPanelOpen()) return;
    this.time += dt;
    this.pollT += dt;
    if (this.pollT >= 0.1 || !this.data) {
      this.pollT = 0;
      const d = this.poll();
      // the tracked objective (quests part: src/ui/QuestMarks.js)
      const q = d && this.ui.questMarks?.radarMark?.();
      if (q) d.markers = [...(d.markers || []), q];
      if (d) { this.data = d; this.updateTag(); }
    }
    if (!this.data) return;
    let h = this.data.heading || 0;
    if (typeof this.opts.heading === 'function') {
      try { h = this.opts.heading(); } catch (e) { /* keep provider heading */ }
      this.heading = h;
    } else {
      // the provider runs at 10 Hz: glide toward its heading so turning stays smooth
      let d = (h - this.heading) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      this.heading += d * Math.min(1, dt * 14);
    }
    this.sweep = (this.sweep + dt * 2.2) % TAU;
    this.swingNorth(dt);
    this.draw();
  }

  /** North sits at the heading's angle (clockwise from the lubber mark); the fleur chases it on a spring. */
  swingNorth(dt) {
    const d = this.data;
    let diff = (this.heading - this.nAng) % TAU;
    if (diff > Math.PI) diff -= TAU;
    if (diff < -Math.PI) diff += TAU;
    const step = Math.min(0.05, dt);
    this.nVel += diff * 90 * step;
    this.nVel *= Math.exp(-5.5 * step);
    // a tremble while walking (the scope bobs in your paw)
    if (d && this._lx !== undefined && Math.hypot(d.x - this._lx, d.z - this._lz) > 0.02) this.nVel += (Math.random() - 0.5) * 0.9;
    if (d) { this._lx = d.x; this._lz = d.z; }
    this.nAng += this.nVel * step;
    const deg = ((this.nAng * 180) / Math.PI).toFixed(2);
    if (deg !== this._nDeg) { this._nDeg = deg; this.north.style.transform = `rotate(${deg}deg) translateY(calc(var(--px) * -22))`; }
  }

  /** "Town 230 m" under the radar while the town is beyond the rim. */
  updateTag() {
    const d = this.data;
    const town = (d.markers || []).find((m) => m.kind === 'town');
    if (!town) { this.tag.hidden = true; return; }
    const dist = Math.hypot(town.x - d.x, town.z - d.z);
    const far = dist > (d.range || 24) * 0.92;
    this.tag.hidden = !far;
    const dy = Math.round((town.y ?? d.y) - d.y);
    if (!far) return;
    const sig = `${town.label}|${Math.round(dist)}|${dy}`;
    if (sig === this._tagSig) return;
    this._tagSig = sig;
    this.tag.innerHTML = '';
    this.tag.append(`${town.label || 'Town'} ${Math.round(dist)} m`);
    if (Math.abs(dy) > LEVEL_GAP) this.tag.append(el('img', { class: 'pix', src: HS.tri(dy < 0 ? 'down' : 'up'), alt: dy < 0 ? 'down' : 'up' }), `${Math.abs(dy)}`);
  }

  draw() {
    const d = this.data, p = this.screen, N = RADAR.screen, R = RADAR.r;
    const range = d.range || 24, mpp = range / R;
    const h = this.heading, ch = Math.cos(h), sh = Math.sin(h);
    const sample = gridSampler(d);
    const buf = p.d;
    buf.fill(0);
    const lavaHot = Math.sin(this.time * 5) > 0.3;
    const col = (v) => (v === 1 ? SCR.open : v === 2 ? SCR.water : v === 3 ? (lavaHot ? SCR.lavaHot : SCR.lava) : v === 4 ? SCR.rock : SCR.unknown);
    const edge = (v) => (v === 1 ? SCR.openEdge : v === 2 ? SCR.waterEdge : v === 3 ? SCR.lavaEdge : 0);
    const world = (u, v) => [d.x + (u * ch + v * sh) * mpp, d.z + (-u * sh + v * ch) * mpp];
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const u = i + 0.5 - R, v = j + 0.5 - R, r = Math.hypot(u, v);
        if (r > R) continue;
        const [wx, wz] = world(u, v);
        const val = sample(wx, wz);
        let c = col(val);
        if (val === 1 || val === 2 || val === 3) {
          // outline tunnels where they meet rock or the unknown
          let n = false;
          for (const [ou, ov] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const [ax, az] = world(u + ou, v + ov);
            const nv = sample(ax, az);
            if (nv !== val && (nv === 0 || nv === 4)) { n = true; break; }
          }
          if (n) c = edge(val);
        }
        // the range ring and the cross, dotted in by hand-style dashes over the dark only
        const dark = val === 0 || val === 4;
        if (dark && (Math.abs(r - R / 2) < 0.5 ? (i + j) % 3 !== 0 : (Math.abs(u) < 0.5 || Math.abs(v) < 0.5) && (i + j) % 2 === 0)) c = SCR.ring;
        // the sweep: a lime arm and a dithered tail (flat palette tones, no blending)
        const a = Math.atan2(u, -v);
        const ad = angDiff(this.sweep, a);
        if (ad < 0.07) c = SCR.sweep;
        else if (ad < 1.2 && dark) {
          const g = (1 - ad / 1.2) ** 2;
          if (g > BAYER[(j & 3) * 4 + (i & 3)]) c = SCR.sweepTail;
        }
        p.set(i, j, c);
      }

    // markers
    const marks = d.markers || [];
    const toScreen = (m) => {
      const dx = m.x - d.x, dz = m.z - d.z;
      return [(dx * ch - dz * sh) / mpp, (dx * sh + dz * ch) / mpp];
    };
    // danger zones first (they sit under everything else)
    for (const m of marks) {
      if (m.kind !== 'danger') continue;
      const [u, v] = toScreen(m);
      const rr = (m.r || 4) / mpp;
      if (Math.hypot(u, v) - rr > R) continue;
      const pulse = 0.55 + Math.sin(this.time * 6) * 0.35;
      const color = m.color != null ? snapC(m.color) : MARK_COLOR.danger;
      for (let j = Math.floor(R + v - rr - 1); j <= R + v + rr + 1; j++)
        for (let i = Math.floor(R + u - rr - 1); i <= R + u + rr + 1; i++) {
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          const pu = i + 0.5 - R, pv = j + 0.5 - R;
          if (Math.hypot(pu, pv) > R) continue;
          const dd = Math.hypot(pu - u, pv - v);
          if (dd > rr) continue;
          if (dd > rr - 1) { if (pulse > 0.4 || (i + j) & 1) p.set(i, j, color); }
          else if (((i + j) & 3) === 0 && pulse > 0.5) p.set(i, j, color);
        }
    }
    for (const m of marks) {
      if (m.kind === 'danger') continue;
      const [u, v] = toScreen(m);
      const dist = Math.hypot(u, v);
      const color = m.color != null ? snapC(m.color) : MARK_COLOR[m.kind] ?? SCR.you;
      if (dist > R - 2.5) {
        if (m.kind === 'town' || m.kind === 'home' || (m.kind === 'quest' && Math.sin(this.time * 5) > -0.4)) this.rimArrow(u / dist, v / dist, color);
        continue;
      }
      const c = color;
      const cx = R + u, cy = R + v;
      const dy = (m.y ?? d.y) - d.y;
      if (m.kind === 'enemy' && Math.sin(this.time * 14) < -0.2) continue;
      if (m.kind === 'quest' && Math.sin(this.time * 5) < -0.5) continue;
      if (Math.abs(dy) > LEVEL_GAP && m.kind !== 'home' && m.kind !== 'town' && m.kind !== 'quest') { plotGlyph(p, dy > 0 ? 'up' : 'down', cx, cy, c, SCR.ink); continue; }
      const glyph = m.kind === 'ore' ? 'ore' : m.kind === 'enemy' ? 'enemy' : m.kind === 'stake' ? 'stake' : m.kind;
      plotGlyph(p, glyph, cx, cy, c, SCR.ink);
      if (Math.abs(dy) > LEVEL_GAP) plotGlyph(p, dy > 0 ? 'up' : 'down', cx + 4, cy - 2, c, SCR.ink);
    }
    // you, always pointing up
    plotGlyph(p, 'you', R, R + 0.5, SCR.you, SCR.ink);
    p.ctx.putImageData(p.img, 0, 0);
  }

  /** A little arrow on the rim pointing toward something out of range (8 directions, crisp). */
  rimArrow(ux, uy, color) {
    const R = RADAR.r;
    const sector = ((Math.round(Math.atan2(ux, -uy) / (Math.PI / 4)) % 8) + 8) % 8;
    plotGlyph(this.screen, 'a' + sector, R + ux * (R - 3.6), R + uy * (R - 3.6), color, SCR.ink);
  }
}

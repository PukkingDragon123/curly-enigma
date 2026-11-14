// Forge DOM widgets layered in game.ui.world, drawn as decorated objects (pixel art from
// forgeArt.js and workArt.js, styles in forge.css): the brass thermometer with its glass bulb and
// burner flame, the work HUD (wave 14: the steps as a trail of pictures, a meter or two, the action
// plates with the next one glowing, a few floating words of cue), the rune-ring strike gauge, the
// guild certificate for results and the touch screen's big action button (how a blow went is told
// in the world: ForgeScene.pop answers with voxel words, sparks and smoke).
import { el, clamp } from '../core/util.js';
import { gaugeGradient, glowCss, glowHex, glowAmount } from './blackbody.js';
import { Px, art, INK } from '../ui/uiArt.js';
import { DSPR } from '../ui/deepArt.js';
import { fart, seal, ribbon, installForgeArt } from './forgeArt.js';
import { bart, inkStepURL, heatChartURL } from './forgeBookArt.js';
import { wart } from './workArt.js';
import { KART } from '../cooking/kitchenArt.js';
import { floatIn, ghost, bits } from '../ui/floatType.js';
import CSS from './forge.css?inline';

let styleRefs = 0;
/** Inject the forge's stylesheet (ref-counted; the returned function removes it). */
export function injectStyles() {
  let s = document.getElementById('forge-styles');
  if (!s) {
    s = document.createElement('style');
    s.id = 'forge-styles';
    s.textContent = CSS;
    document.head.append(s);
  }
  styleRefs++;
  return () => {
    styleRefs--;
    if (styleRefs <= 0) { s.remove(); styleRefs = 0; }
  };
}

/**
 * A title with an illuminated initial: the first letter set in a gilt box (src/forge/forgeBookArt.js
 * initial) as the scribes did. Returns children for el(); blue: the azure ground.
 */
export function illum(text, blue = false) {
  const m = String(text).match(/^([^A-Za-z0-9]*)([A-Za-z0-9])([\s\S]*)$/);
  if (!m) return text;
  return [m[1] || null, el('span', { class: 'fg-initial' + (blue ? ' blue' : '') }, m[2]), m[3]];
}

/** Publish the forge art (--fa-*) on the layer the forge's DOM lives in. */
export function decorateLayer(layer) { installForgeArt(layer); return layer; }

/** A brass gauge (decorated bar); returns { el, fill, set(v, cls) }. cls: '' | 'warm' | 'bad' | 'cool'. */
export function bar(cls = '') {
  const fill = el('i', { class: cls });
  const node = el('div', { class: 'fg-bar' }, [el('span', { class: 'fg-bar-in' }, [fill, el('u')])]);
  let last = -1, lastCls = cls;
  return {
    el: node,
    fill,
    set(v, c) {
      const p = Math.round(clamp(v, 0, 1) * 1000) / 10;
      if (p !== last) { fill.style.width = p + '%'; last = p; }
      if (c !== undefined && c !== lastCls) { fill.className = c; lastCls = c; }
    },
  };
}

/** Set text only when it changed (cheap per-frame updates). */
export function setText(node, text) {
  if (node._t !== text) { node._t = text; node.textContent = text; }
}
export function setHtml(node, html) {
  if (node._h !== html) { node._h = html; node.innerHTML = html; }
}

/**
 * The brass thermometer: a glass tube on an enamel scale with painted zones (the band to hit glows
 * and a gold pointer bounces beside it; the burn line is red), a glass bulb that glows with the
 * metal's color and a burner flame that grows with the heat. Its head plate shows the metal (an
 * ingot), its foot the number and which way to go (wave 14: no words on it).
 * API: setTitle(iconURL), setMarks, set(T, dt), setMax, remove.
 */
export class Thermo {
  constructor(parent, maxT) {
    this.maxT = maxT;
    this.scale = el('div', { class: 'fg-tube-scale' });
    this.fill = el('div', { class: 'fg-tube-fill' });
    this.needle = el('div', { class: 'fg-needle' });
    this.tube = el('div', { class: 'fg-tube' }, [this.scale, this.fill]);
    this.zones = el('div', { class: 'fg-zones' });
    this.glowDot = el('i');
    this.bulb = el('div', { class: 'fg-bulb' }, [this.glowDot, el('img', { class: 'pix', src: fart('bulb'), alt: '' })]);
    this.flame = el('div', { class: 'fg-flame' });
    this.num = el('span');
    this.dir = el('img', { class: 'pix fg-dir', src: wart.pointer(), alt: '' });
    this.read = el('div', { class: 'fg-read' }, [this.num, this.dir]);
    this.icon = el('img', { class: 'pix', alt: '' });
    this.title = el('div', { class: 'fg-thermo-title' }, [this.icon]);
    // the smith's own colour chart, painted beside the glass: what each heat looks like in the coals
    this.chart = el('img', { class: 'pix fg-chart', alt: '' });
    this.col = el('div', { class: 'fg-tm-col' }, [el('img', { class: 'pix fg-tm-cap', src: fart('cap'), alt: '' }), el('div', { class: 'fg-tm-glass' }, [this.zones, this.tube, this.needle, this.chart]), this.bulb, this.flame]);
    const cap = (c) => el('i', { class: 'fg-cap ' + c });
    this.el = el('div', { class: 'fg-thermo', 'data-solid': '' }, [this.title, this.col, this.read, cap('tl'), cap('tr'), cap('bl'), cap('br')]);
    this.marks = [];
    parent.append(this.el);
    this.setMax(maxT);
    this.shown = 20;
    this.lastZone = null;
    this.target = null;
  }
  setMax(maxT) {
    this.maxT = maxT;
    const g = gaugeGradient(maxT, '#4a3c36');
    this.fill.style.backgroundImage = g;
    if (this.chart) this.chart.src = heatChartURL(maxT);
  }
  pct(t) { return clamp(t / this.maxT, 0, 1) * 100; }
  /** The head plate's picture (an item still: the metal's ingot). */
  setTitle(icon) { if (icon && this.icon.src !== icon) this.icon.src = icon; this.title.hidden = !icon; }
  /** marks: [{kind:'work'|'quench'|'melt', range:[a,b]} | {kind:'burn'|'max', at}]; the first range is the one to hit. */
  setMarks(marks) {
    for (const m of this.marks) m.remove();
    this.marks = [];
    this.ranges = [];
    this.target = null;
    for (const m of marks) {
      let node;
      if (m.range) {
        const b = this.pct(m.range[0]), t = this.pct(m.range[1]);
        const first = !this.target;
        node = el('div', { class: 'fg-band ' + m.kind + (first ? ' target' : ''), style: { bottom: b + '%', height: Math.max(0.6, t - b) + '%' } },
          first ? [el('img', { class: 'pix fg-bandptr', src: wart.pointer(), alt: '' })] : []);
        if (first) this.target = m.range;
        this.ranges.push(m);
      } else {
        node = el('div', { class: 'fg-line ' + m.kind, style: { bottom: this.pct(m.at) + '%' } });
      }
      this.zones.append(node);
      this.marks.push(node);
    }
  }
  set(t, dt = 1 / 60) {
    this.shown += (t - this.shown) * Math.min(1, dt * 14);
    const p = this.pct(this.shown);
    this.fill.style.height = p.toFixed(2) + '%';
    this.fill.style.backgroundSize = `100% ${(10000 / Math.max(0.5, p)).toFixed(1)}%`;
    this.needle.style.bottom = p.toFixed(2) + '%';
    setText(this.num, Math.round(t) + '°');
    this.num.style.color = t > 450 ? glowCss(Math.min(t, 1400)) : '#fbf1dc';
    // the bulb glows with the metal, the burner flame grows with it
    const g = glowAmount(t);
    this.glowDot.style.background = g > 0 ? glowCss(Math.max(t, 600)) : '#5a4a44';
    this.glowDot.style.opacity = (0.55 + Math.min(0.45, g * 0.4)).toFixed(2);
    this.flame.style.setProperty('--k', (0.45 + Math.min(1, t / Math.max(600, this.maxT * 0.75)) * 0.75).toFixed(2));
    // light the painted zone the needle sits in; the foot says which way to go (up · in · down)
    let zone = null;
    for (const m of this.ranges || []) if (t >= m.range[0] && t <= m.range[1]) zone = m.kind;
    if (zone !== this.lastZone) { this.lastZone = zone; this.el.dataset.zone = zone || ''; }
    const tg = this.target, d = !tg ? '' : t < tg[0] ? 'up' : t > tg[1] ? 'down' : 'ok';
    if (d !== this.el.dataset.dir) { this.el.dataset.dir = d; this.dir.src = d === 'ok' ? KART.stamp('check') : wart.pointer(); }
  }
  remove() { this.el.remove(); }
}

// ---------------------------------------------------------------- the work HUD (wave 14)
const isTouch = () => document.documentElement.classList.contains('is-touch');

/**
 * One clear step at a time, in pictures (wave 14: the work page of words is gone):
 *  - the trail: the steps as big pictures standing on a plank across the top (the ore, the fire,
 *    the anvil... the ingot or the weapon at its end); the one in hand is bigger, glows and bobs
 *    under a bouncing gold pointer, done ones get a green check and the plank's link turns gold
 *  - meters under the plank: a picture, a brass gauge and a number for what matters right now
 *  - the action plates (bottom right): a glyph, one word and the key; the one to press next glows,
 *    with the pointer bouncing over it
 *  - a cue: 2–4 boxless floating words arriving near what they are about
 * steps: [{ id, icon, tip }]. API: set(active, done), meter(key, o | null), actions(list), next(id),
 * cue(text | null, at), update(), poll(input), remove().
 */
export class WorkHud {
  constructor(parent, steps = []) {
    this.parent = parent;
    this.row = el('div', { class: 'fg-trow' });
    this.metersEl = el('div', { class: 'fg-tmeters' });
    this.trail = el('div', { class: 'fg-trail', 'data-solid': '' }, [el('div', { class: 'fg-tshelf' }, [this.row, el('i', { class: 'fg-tplank' })]), this.metersEl]);
    this.actEl = el('div', { class: 'fg-actions', 'data-solid': '' });
    this.cueText = el('div', { class: 'ft fg-cuet' });
    this.cuePtr = el('img', { class: 'pix fg-cueptr', src: wart.pointer(), alt: '' });
    this.cueEl = el('div', { class: 'fg-cue', hidden: true }, [this.cueText, this.cuePtr]);
    parent.append(this.trail, this.actEl, this.cueEl);
    this.items = new Map();
    this.meters = new Map();
    this.btns = new Map();
    this.keys = {};
    this.active = null;
    this.nextId = null;
    this.setSteps(steps);
  }

  setSteps(steps) {
    this.row.innerHTML = '';
    this.items.clear();
    steps.forEach((s, i) => {
      if (i) this.row.append(el('i', { class: 'fg-tlink', 'data-to': s.id }));
      const n = el('span', { class: 'fg-ts', title: s.tip || '' }, [
        el('img', { class: 'pix fg-tic', src: s.icon, alt: s.tip || '' }),
        el('img', { class: 'pix fg-tok', src: KART.stamp('check'), alt: '' }),
      ]);
      this.items.set(s.id, n);
      this.row.append(n);
    });
  }

  /** The step in hand (an id) and the ones done. */
  set(active, done = []) {
    const ids = [...this.items.keys()], ai = ids.indexOf(active);
    let i = 0;
    for (const [id, n] of this.items) {
      const st = id === active ? 'on' : done.includes(id) || (ai >= 0 && i < ai) ? 'done' : 'off';
      if (n._st !== st) {
        // a step done throws a burst of gold voxel bits off its picture; the next one pops up big
        if (st === 'done' && n._st === 'on') bits(n, { from: 'rect', n: 16, colors: ['#fff4c0', '#ffd34a', '#ff9a3a'], rise: 30, spread: 26 });
        n.className = 'fg-ts ' + st;
        if (st === 'on' && n._seen) n.classList.add('pop');
        n._st = st;
        n._seen = true;
      }
      const link = n.previousElementSibling;
      if (link?.classList.contains('fg-tlink')) link.classList.toggle('lit', st !== 'off');
      i++;
    }
    this.active = active;
  }

  /** A meter under the trail: o = { icon, v (0..1), text, cls } or null to take it away. */
  meter(key, o) {
    let m = this.meters.get(key);
    if (!o) { if (m) { m.el.remove(); this.meters.delete(key); } return; }
    if (!m) {
      const b = bar(o.cls || '');
      const ic = el('img', { class: 'pix', src: o.icon, alt: '' });
      const val = el('b');
      m = { el: el('div', { class: 'fg-tm ' + key }, [ic, b.el, val]), bar: b, val, ic };
      this.meters.set(key, m);
      this.metersEl.append(m.el);
    }
    if (o.icon && m.ic.src !== o.icon) m.ic.src = o.icon;
    if (o.v !== undefined) m.bar.set(o.v, o.cls);
    if (o.text !== undefined) setText(m.val, o.text);
    m.el.classList.toggle('warn', !!o.warn);
  }

  /** The plates: [{ id, glyph | icon, label (one word), keyLabel, key: [codes], fn, alt }]. */
  actions(list) {
    this.actEl.innerHTML = '';
    this.btns.clear();
    this.keys = {};
    const touch = isTouch();
    for (const a of list) {
      const b = el('button', {
        class: 'fg-act' + (a.alt ? ' alt' : ''), title: a.tip || a.label || '',
        onclick: (e) => { e.currentTarget.classList.remove('press'); void e.currentTarget.offsetWidth; e.currentTarget.classList.add('press'); a.fn(); },
      }, [
        el('img', { class: 'pix fg-aic', src: a.icon || wart.glyph(a.glyph || 'flame'), alt: '' }),
        a.label ? el('span', {}, a.label) : null,
        a.keyLabel && !touch ? el('kbd', {}, a.keyLabel) : null,
        el('img', { class: 'pix fg-aptr', src: wart.pointer(), alt: '' }),
      ]);
      this.actEl.append(b);
      this.btns.set(a.id || a.label, b);
      if (a.key) for (const k of [].concat(a.key)) this.keys[k] = a.fn;
    }
    if (this.nextId) this.next(this.nextId, true);
  }

  /** Make one plate glow with the pointer over it (null: none). */
  next(id, force = false) {
    if (id === this.nextId && !force) return;
    this.nextId = id;
    for (const [k, b] of this.btns) b.classList.toggle('next', k === id);
  }

  /** The key bindings of the plates (call once a frame; busy: ignore them). */
  poll(inp, busy = false) {
    if (busy) return;
    for (const [k, fn] of Object.entries(this.keys)) if (inp.pressed(k)) { inp.consume(k); fn(); return; }
  }

  /**
   * A cue of 2–4 floating words: at = a plate id ('act:anvil'), an element, a function → {x, y}
   * (screen px, called every update) or null (bottom middle). text null: it scatters away.
   */
  cue(text, at = null) {
    if (this.muted) text = null; // (Old Star's lesson says it himself)
    if (text === this.cueT && at === this.cueAt) return;
    const changed = text !== this.cueT;
    this.cueT = text;
    this.cueAt = at;
    clearTimeout(this._hideT);
    if (!text) {
      // the words scatter into voxel bits where they are, then the cue goes
      if (!this.cueEl.hidden && this.cueText.textContent) ghost(this.cueText);
      this.cueText.innerHTML = '';
      this.cueEl.classList.add('off');
      this._hideT = setTimeout(() => { if (!this.cueT) this.cueEl.hidden = true; }, 900);
      return;
    }
    if (changed) {
      if (!this.cueEl.hidden && this.cueText.textContent) ghost(this.cueText);
      floatIn(this.cueText, text, { stagger: 0.018, max: 0.3 });
    }
    this.cueEl.classList.remove('off');
    this.cueEl.hidden = false;
    this.place();
  }

  place() {
    const at = this.cueAt;
    let x = innerWidth / 2, y = innerHeight * 0.72, mode = 'free';
    if (typeof at === 'string' && at.startsWith('act:')) {
      const b = this.btns.get(at.slice(4));
      if (b) { const r = b.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top - 6; mode = 'act'; }
    } else if (at instanceof Element) {
      const r = at.getBoundingClientRect(); x = r.left + r.width / 2; y = r.bottom + 6; mode = 'below';
    } else if (typeof at === 'function') {
      const p = at();
      if (p) { x = p.x; y = p.y; mode = 'pt'; }
    }
    // never over the trail: a point too close under it gets its words below, the pointer looking up
    const h = this.cueEl.offsetHeight || 80;
    const tb = this.trail.hidden ? 0 : this.trail.getBoundingClientRect().bottom;
    if (mode === 'pt' && y - h < tb + 6) { y += 26; mode = 'below'; }
    if (this.cueEl.dataset.mode !== mode) this.cueEl.dataset.mode = mode;
    // keep the words on screen (they are centred over the point)
    const w = this.cueText.offsetWidth || 120;
    x = clamp(x, w / 2 + 8, innerWidth - w / 2 - 8);
    y = clamp(y, mode === 'below' ? tb + 4 : h + 4, innerHeight - (mode === 'below' ? h + 4 : 8));
    this.cueEl.style.left = Math.round(x) + 'px';
    this.cueEl.style.top = Math.round(y) + 'px';
  }

  /** Once a frame: the cue follows what it points at. */
  update() { if (!this.cueEl.hidden && this.cueAt) this.place(); }

  hideTrail(on = true) { this.trail.hidden = on; }

  remove() { clearTimeout(this._hideT); this.trail.remove(); this.actEl.remove(); this.cueEl.remove(); }
}

// ---------------------------------------------------------------- the rune ring (strike gauge)
const RING = 36; // canvas size (art px)
const RUNE_N = 12;
const A0 = Math.PI * 0.75, SPAN = Math.PI * 1.5; // from the bottom-left, clockwise round to the bottom-right
const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

/**
 * A ring of carved rune stones round a little anvil: it lights up stone by stone as the
 * hammer goes up, with an optional painted zone (good) and gold band (perfect). show(x, y, v,
 * label) at a screen point, zone([a, b], [p0, p1]) or zone(null), flash('good' | 'perfect' |
 * 'bad'), hide().
 */
export class StrikeMeter {
  constructor(parent) {
    this.cv = el('canvas', { class: 'pix', width: RING, height: RING });
    this.ctx = this.cv.getContext('2d');
    this.img = this.ctx.createImageData(RING, RING);
    this.label = el('span');
    this.el = el('div', { class: 'fg-meter', hidden: true }, [this.cv, this.label]);
    parent.append(this.el);
    this.z = null; this.pz = null;
    this.flashT = 0; this.flashKind = null;
    this.v = 0;
    this.t = 0;
  }
  zone(z, perfect = null) { this.z = z; this.pz = perfect; this.draw(); }
  flash(kind) { this.flashKind = kind; this.flashT = 1; this.el.dataset.flash = kind; clearTimeout(this._ft); this._ft = setTimeout(() => { this.el.dataset.flash = ''; }, 420); }
  show(x, y, v, label = '') {
    this.el.hidden = false;
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
    this.v = clamp(v, 0, 1);
    this.t += 1;
    setText(this.label, label);
    this.draw();
  }
  hide() { this.el.hidden = true; }
  draw() {
    const d = this.img.data, c = RING / 2, v = this.v;
    d.fill(0);
    const put = (x, y, h, a = 255) => { const i = (y * RING + x) * 4; const [r, g, b] = rgb(h); d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; };
    const flash = this.flashT > 0 ? this.flashKind : null;
    for (let y = 0; y < RING; y++) for (let x = 0; x < RING; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy);
      if (r > 16.6 || r < 8.4) continue;
      let ang = Math.atan2(dy, dx) - A0;
      while (ang < 0) ang += Math.PI * 2;
      const f = ang / SPAN;
      if (f > 1) { // the gap at the bottom: a brass clasp
        if (r > 10 && r < 15 && Math.abs(dx) < 2.5) put(x, y, r > 13.5 ? 0x6e4a1a : 0xdcae4e);
        continue;
      }
      if (r > 15.6 || r < 9.4) { put(x, y, INK); continue; } // outline
      const stone = Math.floor(f * RUNE_N), sf = f * RUNE_N - stone;
      if (sf < 0.07 || sf > 0.95) { put(x, y, 0x1a100a); continue; } // gaps between stones
      const lit = f <= v;
      const inZ = this.z && f >= this.z[0] && f <= this.z[1];
      const inP = this.pz && f >= this.pz[0] && f <= this.pz[1];
      let col;
      if (lit) {
        col = f > 0.85 ? 0xfff2b0 : f > 0.55 ? 0xffc04a : 0xff7a2a;
        if (inP) col = 0xfff6c0; else if (inZ) col = 0xd8ffa0;
      } else {
        col = inP ? 0x8a6a1a : inZ ? 0x3a5a2a : 0x4a3a32;
      }
      if (flash === 'good' || flash === 'perfect') col = flash === 'perfect' ? 0xfff6c0 : 0xb8ff8a;
      else if (flash === 'bad') col = 0xff5a3a;
      // bevel: light on the outer top-left rim, dark inside
      if (r > 14.4 && dx + dy < 0) col = mix(col, 0xffffff, 0.25);
      else if (r < 10.6) col = mix(col, 0x000000, 0.35);
      // a carved rune dot in each stone
      if (Math.abs(sf - 0.5) < 0.12 && Math.abs(r - 12.5) < 0.9) col = lit ? 0xffffff : mix(col, 0x000000, 0.4);
      put(x, y, col);
    }
    // the little anvil in the middle (it jumps when the gauge is full)
    const up = v >= 0.99 ? -1 : 0;
    const anv = ['..aaaaaa..', 'aaaaaaaaa.', '.aaaaaaa..', '...aaa....', '..aaaaa...'];
    for (let j = 0; j < anv.length; j++) for (let i = 0; i < anv[j].length; i++) if (anv[j][i] === 'a') put(13 + i, 16 + j + up, j === 0 ? 0xb8b8c0 : j < 2 ? 0x8a8a92 : 0x5a5a62);
    this.ctx.putImageData(this.img, 0, 0);
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - 0.25);
  }
}
const mix = (a, b, t) => {
  const A = rgb(a), Bc = rgb(b);
  return (Math.round(A[0] + (Bc[0] - A[0]) * t) << 16) | (Math.round(A[1] + (Bc[1] - A[1]) * t) << 8) | Math.round(A[2] + (Bc[2] - A[2]) * t);
};

// ---------------------------------------------------------------- the guild certificate (results)
/**
 * A framed certificate with a wax seal for the grade (wave 14: the name, the worth and the grade
 * lead; how each step went is its picture and a number; no words besides).
 * o: { title, grade: {g, word, color}, value (html), rows: [{icon, v, tip}], buttons: [{label, glyph, key, alt, fn}] }
 * Returns the element (hidden until shown).
 */
export function certificate(o) {
  const g = o.grade;
  const hex = parseInt(String(g.color).replace('#', ''), 16) || 0xc23c2c;
  const rows = el('div', { class: 'fg-cmeds' });
  (o.rows || []).forEach((r, i) => {
    const v = clamp(r.v, 0, 1);
    rows.append(el('span', { class: 'fg-cmed ' + (v > 0.85 ? 'good' : v > 0.6 ? 'warm' : 'bad'), title: r.tip || '', style: `--d:${(0.5 + i * 0.08).toFixed(2)}s` }, [
      el('img', { class: 'pix', src: r.icon, alt: r.tip || '' }), el('b', {}, Math.round(v * 100) + '%'),
    ]));
  });
  const btns = el('div', { class: 'fg-cert-btns' });
  for (const b of o.buttons || []) {
    btns.append(el('button', { class: 'fg-stampbtn' + (b.alt ? ' alt' : ''), onclick: (e) => { e.currentTarget.classList.add('thud'); b.fn(); } }, [
      b.glyph ? el('img', { class: 'pix fg-bic', src: wart.glyph(b.glyph), alt: '' }) : null, b.label, b.key && !isTouch() ? el('kbd', {}, b.key) : null,
    ]));
  }
  return el('div', { class: 'fg-cert interactive', 'data-solid': '', hidden: true }, [
    el('div', { class: 'fg-cert-seal', style: `--gc:${g.color}` }, [
      el('img', { class: 'pix fg-ribbon', src: ribbon(0xc23c2c), alt: '' }),
      el('img', { class: 'pix fg-wax', src: seal(hex), alt: '' }),
      el('b', {}, g.g),
      el('small', {}, g.word),
    ]),
    el('h2', {}, o.title),
    o.value ? el('div', { class: 'fg-value', html: o.value }) : null,
    rows,
    o.extra || null,
    btns,
    el('img', { class: 'pix fg-guildseal', src: bart('forgeSeal'), alt: '' }),
    el('img', { class: 'pix fg-certink', src: inkStepURL('result'), alt: '' }),
  ]);
}

/**
 * Body for game.ui.confirm(): a short bold title, then the details pushed below the
 * dialog's close button (which sits over the top-right corner of the text).
 */
export function confirmText(title, body) {
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  return `<b>${esc(title)}</b><span style="display:block;margin-top:calc(var(--px) * 4)">${esc(body)}</span>`;
}

// ---------------------------------------------------------------- touch: the big action button
const GLYPHS = {
  pump: () => {
    // bellows: two boards and a pleated leather wedge, a nozzle to the right
    const p = new Px(17, 17);
    p.tpl([
      '.................',
      '..aaaaaaa........',
      '.abbbbbbbaa......',
      '.bccccccccbaa....',
      '..dededededdbb...',
      '..edededededdcbb.',
      '..dededededdbbffg',
      '..edededededdcbb.',
      '..dededededdbb...',
      '.bccccccccbaa....',
      '.abbbbbbbaa......',
      '..aaaaaaa........',
    ], { a: 0x5a3420, b: 0xa06c3c, c: 0xc08a52, d: 0x6a3c22, e: 0x8a5432, f: 0x6a6870, g: 0x2a2426 }, 0, 2);
    p.outline(INK);
    return p;
  },
  strike: () => {
    // a cross-peen hammer, head up-left, handle to the bottom right
    const p = new Px(17, 17);
    p.tpl([
      '...aa............',
      '..abba...........',
      '.abccba..........',
      'abccccba.........',
      '.bcccccbd........',
      '..bccccbdd.......',
      '...bcccb.dd......',
      '....bbb...dd.....',
      '...........dd....',
      '............dd...',
      '.............dd..',
      '..............ee.',
      '...............e.',
    ], { a: 0xf0f2f6, b: 0x8a8890, c: 0x5a5860, d: 0xc08a52, e: 0x6a3a20 }, 0, 1);
    p.outline(INK);
    return p;
  },
};

/**
 * A big round button for touch screens: holding it holds mouse button 0 (pump the bellows,
 * raise the hammer), letting go releases it. set(kind | null, label).
 */
export class TouchAction {
  constructor(parent, input) {
    this.inp = input;
    this.face = el('img', { class: 'face', src: DSPR.bigBtn(false), alt: '' });
    this.icon = el('img', { class: 'ic', src: '', alt: '' });
    this.label = el('span');
    this.el = el('button', { class: 'fg-tbtn', 'aria-label': 'Action (hold)' }, [this.face, this.icon, this.label]);
    parent.append(this.el);
    this.id = null;
    this.kind = null;
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (this.id !== null) return;
      this.id = e.pointerId;
      try { this.el.setPointerCapture(this.id); } catch (err) { /* noop */ }
      this.el.classList.add('down');
      this.face.src = DSPR.bigBtn(true);
      this.inp.mouse.buttons[0] = true;
      this.inp.mouse.pressed[0] = true;
    };
    const up = (e) => {
      if (e.pointerId !== this.id) return;
      e.stopPropagation();
      this.release();
    };
    this.el.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) this.el.addEventListener(ev, up);
    this.el.addEventListener('click', (e) => e.preventDefault());
    // Input clears button 0 on ANY pointerup: another finger lifting must not end the hold
    this.onWinUp = (e) => { if (this.id !== null && e.pointerId !== this.id) { this.inp.mouse.buttons[0] = true; this.inp.mouse.released[0] = false; } };
    window.addEventListener('pointerup', this.onWinUp);
  }

  release() {
    if (this.id === null) return;
    this.id = null;
    this.el.classList.remove('down');
    this.face.src = DSPR.bigBtn(false);
    this.inp.mouse.buttons[0] = false;
    this.inp.mouse.released[0] = true;
  }

  set(kind, label = '') {
    if (kind === this.kind) return;
    this.kind = kind;
    if (!kind) this.release();
    this.el.classList.toggle('on', !!kind);
    if (kind) this.icon.src = art('fg-glyph-' + kind, GLYPHS[kind]);
    this.label.textContent = label;
  }

  remove() {
    this.release();
    window.removeEventListener('pointerup', this.onWinUp);
    this.el.remove();
  }
}

export { glowHex };

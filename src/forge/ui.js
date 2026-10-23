// Forge DOM widgets layered in game.ui.world, drawn as decorated objects (pixel art from
// forgeArt.js, styles in forge.css): the brass thermometer with its glass bulb and burner flame,
// the rune-ring strike gauge, rune medallions for the steps, brass gauges for the stats, the
// guild certificate for results, floating words and the touch screen's big action button.
import { el, clamp } from '../core/util.js';
import { gaugeGradient, glowCss, glowHex, glowAmount, heatWord } from './blackbody.js';
import { Px, art, INK } from '../ui/uiArt.js';
import { DSPR } from '../ui/deepArt.js';
import { fart, medal, seal, ribbon, installForgeArt } from './forgeArt.js';
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
 * The brass thermometer: a glass tube on an enamel scale with painted zones (work, quench,
 * melt bands; burn and max lines), a glass bulb that glows with the metal's color and a
 * burner flame that grows with the heat. API: setTitle, setMarks, set(T, dt), setMax, remove.
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
    this.word = el('small');
    this.read = el('div', { class: 'fg-read' }, [this.num, this.word]);
    this.title = el('div', { class: 'fg-thermo-title' }, 'Heat');
    this.col = el('div', { class: 'fg-tm-col' }, [el('img', { class: 'pix fg-tm-cap', src: fart('cap'), alt: '' }), el('div', { class: 'fg-tm-glass' }, [this.zones, this.tube, this.needle]), this.bulb, this.flame]);
    this.el = el('div', { class: 'fg-thermo' }, [this.title, this.col, this.read]);
    this.marks = [];
    parent.append(this.el);
    this.setMax(maxT);
    this.shown = 20;
    this.lastZone = null;
  }
  setMax(maxT) {
    this.maxT = maxT;
    const g = gaugeGradient(maxT, '#4a3c36');
    this.fill.style.backgroundImage = g;
  }
  pct(t) { return clamp(t / this.maxT, 0, 1) * 100; }
  setTitle(t) { setText(this.title, t); }
  /** marks: [{kind:'work'|'quench'|'melt', range:[a,b], label} | {kind:'burn'|'max', at, label}] */
  setMarks(marks) {
    for (const m of this.marks) m.remove();
    this.marks = [];
    this.ranges = [];
    for (const m of marks) {
      let node;
      if (m.range) {
        const b = this.pct(m.range[0]), t = this.pct(m.range[1]);
        node = el('div', { class: 'fg-band ' + m.kind, style: { bottom: b + '%', height: Math.max(0.6, t - b) + '%' } },
          [el('span', { class: 'fg-tag' }, m.label)]);
        this.ranges.push(m);
      } else {
        const p = this.pct(m.at);
        node = el('div', { class: 'fg-line ' + m.kind, style: { bottom: p + '%' } }, [el('span', { class: 'fg-tag' }, m.label)]);
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
    setText(this.num, Math.round(t) + '°C');
    setText(this.word, heatWord(t));
    this.num.style.color = t > 450 ? glowCss(Math.min(t, 1400)) : '#fbf1dc';
    // the bulb glows with the metal, the burner flame grows with it
    const g = glowAmount(t);
    this.glowDot.style.background = g > 0 ? glowCss(Math.max(t, 600)) : '#5a4a44';
    this.glowDot.style.opacity = (0.55 + Math.min(0.45, g * 0.4)).toFixed(2);
    this.flame.style.setProperty('--k', (0.45 + Math.min(1, t / Math.max(600, this.maxT * 0.75)) * 0.75).toFixed(2));
    // light the painted zone the needle sits in
    let zone = null;
    for (const m of this.ranges || []) if (t >= m.range[0] && t <= m.range[1]) zone = m.kind;
    if (zone !== this.lastZone) { this.lastZone = zone; this.el.dataset.zone = zone || ''; }
  }
  remove() { this.el.remove(); }
}

/** Rune medallions for the steps: [{id, label}] (id picks the rune: heat, hammer, grind, balance, quench, infuse, result, shape). */
export class Steps {
  constructor(parent, steps) {
    this.el = el('div', { class: 'fg-steps' });
    this.items = new Map();
    for (const s of steps) {
      const img = el('img', { class: 'pix', src: medal(s.id, 'off'), alt: '' });
      const n = el('span', { class: 'fg-step' }, [img, el('small', {}, s.label)]);
      n._img = img; n._id = s.id; n._st = 'off';
      this.items.set(s.id, n);
      this.el.append(n);
    }
    parent.append(this.el);
  }
  set(active, done = []) {
    for (const [id, n] of this.items) {
      const st = active.includes(id) ? 'on' : done.includes(id) ? 'done' : 'off';
      if (n._st === st) continue;
      n._st = st;
      n.className = 'fg-step ' + st;
      n._img.src = medal(n._id, st);
    }
  }
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
 * A framed certificate with a wax seal for the grade.
 * o: { kicker, title, grade: {g, word, color}, value (html, optional), note (html), rows: [{label, v, extra}], buttons: [{label, key, alt, fn}] }
 * Returns the element (hidden until shown).
 */
export function certificate(o) {
  const g = o.grade;
  const hex = parseInt(String(g.color).replace('#', ''), 16) || 0xc23c2c;
  const rows = el('div', { class: 'fg-break' });
  for (const r of o.rows || []) {
    const b = bar(r.v > 0.85 ? '' : r.v > 0.6 ? 'warm' : 'bad');
    b.set(r.v);
    rows.append(el('span', {}, r.label), b.el, el('b', {}, Math.round(r.v * 100) + '%' + (r.extra || '')));
  }
  const btns = el('div', { class: 'fg-cert-btns' });
  for (const b of o.buttons || []) {
    btns.append(el('button', { class: 'fg-stampbtn' + (b.alt ? ' alt' : ''), onclick: b.fn }, [b.label, b.key ? el('kbd', {}, b.key) : null]));
  }
  return el('div', { class: 'fg-cert interactive', hidden: true }, [
    el('div', { class: 'fg-cert-seal', style: `--gc:${g.color}` }, [
      el('img', { class: 'pix fg-ribbon', src: ribbon(0xc23c2c), alt: '' }),
      el('img', { class: 'pix fg-wax', src: seal(hex), alt: '' }),
      el('b', {}, g.g),
      el('small', {}, g.word),
    ]),
    el('div', { class: 'fg-kicker' }, o.kicker || ''),
    el('h2', {}, o.title),
    o.value ? el('div', { class: 'fg-value', html: o.value }) : null,
    o.note ? el('div', { class: 'fg-note', html: o.note }) : null,
    rows,
    o.extra || null,
    btns,
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

/** Big pop-up word at a screen point. */
export function popWord(parent, text, x, y, color = '#fff', size = 1) {
  const n = el('div', { class: 'fg-float', style: { left: x + 'px', top: y + 'px', color, fontSize: size * 1.6 + 'em' } }, text);
  parent.append(n);
  setTimeout(() => n.remove(), 1350);
  return n;
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

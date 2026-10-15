// Forge DOM widgets layered in game.ui.world: thermometer gauge, side panel, bars, strike meter,
// action buttons and the result card. Styles are injected once with an fg- prefix and reuse
// the shared theme variables (parchment, wood, gold, pixel fonts).
import { el, clamp } from '../core/util.js';
import { gaugeGradient, glowCss, heatWord } from './blackbody.js';
import { Px, art, INK } from '../ui/uiArt.js';
import { DSPR } from '../ui/deepArt.js';

const CSS = `
.fg-layer { position: absolute; inset: 0; pointer-events: none; font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0; }
.fg-nolig { font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0; }
.fg-side { position: absolute; left: calc(var(--px) * 4); top: calc(var(--px) * 58); width: calc(var(--px) * 104); padding: calc(var(--px) * 5) calc(var(--px) * 5) calc(var(--px) * 4); gap: calc(var(--px) * 2); }
.fg-side.act { top: calc(var(--px) * 8); width: calc(var(--px) * 84); padding: calc(var(--px) * 4) calc(var(--px) * 4) calc(var(--px) * 3); }
.fg-side.act h2 { font-size: 1.45em; }
.fg-side.wide { width: min(calc(100vw - var(--px) * 64), calc(var(--px) * 176)); max-height: calc(100vh - var(--px) * 66); }
.fg-side.plan { width: min(calc(100vw - var(--px) * 64), calc(var(--px) * 212)); max-height: calc(100vh - var(--px) * 66); }
.fg-side h2 { margin: 0 0 var(--px); font-size: 1.7em; }
.fg-side .sub { margin: 0 0 calc(var(--px) * 2); font-size: .78em; }
.fg-kicker { font-size: .62em; letter-spacing: .14em; text-transform: uppercase; color: var(--wood-2); font-weight: 700; }
.fg-big { display: grid; grid-template-columns: var(--icon) 1fr auto; gap: calc(var(--px) * 3); align-items: center; text-align: left; width: 100%; padding: calc(var(--px) * 2) calc(var(--px) * 3); }
.fg-big img { width: var(--icon); height: var(--icon); }
.fg-big b { display: block; font-size: 1.05em; line-height: 1.1; }
.fg-big small { display: block; font-weight: 500; font-size: .7em; color: var(--ink-soft); line-height: 1.25; }
.fg-big kbd { font-size: .7em; }
.fg-col { display: flex; flex-direction: column; gap: calc(var(--px) * 2); min-height: 0; }
.fg-row { display: flex; gap: calc(var(--px) * 2); align-items: center; }
.fg-stat { display: grid; grid-template-columns: 1fr auto; gap: var(--px) calc(var(--px) * 2); align-items: center; font-size: .78em; }
.fg-stat b { font-variant-numeric: tabular-nums; }
.fg-bar { height: calc(var(--px) * 4); background: #2a1a12; border: var(--px) solid var(--wood-dk); position: relative; overflow: hidden; grid-column: 1 / -1; }
.fg-bar > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--energy); box-shadow: inset 0 calc(var(--px) * -1) 0 rgba(0,0,0,.25); }
.fg-bar > i.warm { background: linear-gradient(90deg, #c8401a, #ffb03a); }
.fg-bar > i.bad { background: var(--danger); }
.fg-bar > i.cool { background: var(--cool); }
.fg-bar > s { position: absolute; top: 0; bottom: 0; width: var(--px); background: #fff8; }
.fg-steps { display: flex; flex-wrap: wrap; gap: var(--px); margin: var(--px) 0 calc(var(--px) * 2); }
.fg-step { font-size: .62em; padding: 0 calc(var(--px) * 1.5); border: var(--px) solid var(--parch-3); color: var(--ink-soft); background: var(--parch-2); line-height: 1.6; }
.fg-step.on { background: var(--gold); color: var(--ink); border-color: var(--wood-dk); font-weight: 700; }
.fg-step.done { background: #c8d8a0; color: #2a4a1a; border-color: #7a9a5a; }
.fg-note { font-size: .72em; color: var(--ink-soft); line-height: 1.3; }
.fg-note b { color: var(--ink); }
.fg-warn { color: #a83a1a; font-weight: 700; }
.fg-good { color: #2a7a2a; font-weight: 700; }
.fg-actions { position: absolute; right: calc(var(--px) * 4); bottom: calc(var(--px) * 5 + env(safe-area-inset-bottom, 0px)); display: flex; gap: calc(var(--px) * 3); align-items: flex-end; flex-wrap: wrap; justify-content: flex-end; max-width: 70vw; }
.fg-actions .btn kbd { margin-left: calc(var(--px) * 1.5); margin-right: 0; font-size: .75em; }
.fg-thermo { position: absolute; right: calc(var(--px) * 4); top: calc(var(--px) * 46); width: calc(var(--px) * 46); display: flex; flex-direction: column; align-items: flex-end; gap: calc(var(--px) * 2);
  background: rgba(20, 12, 10, .82); border: var(--px) solid #000; box-shadow: inset 0 0 0 var(--px) var(--wood); padding: calc(var(--px) * 3); }
.fg-thermo-title { font-size: .6em; letter-spacing: .14em; color: var(--parch-3); text-transform: uppercase; align-self: center; }
.fg-tube { position: relative; width: calc(var(--px) * 8); height: calc(var(--px) * 92); margin-right: calc(var(--px) * 6); background: #1a1210; border: var(--px) solid #000; box-shadow: 0 0 0 var(--px) #5a4030; }
.fg-tube-scale { position: absolute; inset: 0; opacity: .28; }
.fg-tube-fill { position: absolute; left: 0; right: 0; bottom: 0; background-position: bottom; background-repeat: no-repeat; }
.fg-band { position: absolute; left: calc(var(--px) * -3); right: calc(var(--px) * -3); border: var(--px) solid; pointer-events: none; }
.fg-band.work { border-color: #8af07a; background: rgba(138, 240, 122, .16); }
.fg-band.quench { border-color: #7ad0ff; background: rgba(122, 208, 255, .2); }
.fg-band.melt { border-color: #8af07a; background: rgba(138, 240, 122, .2); }
.fg-line { position: absolute; left: calc(var(--px) * -3); right: calc(var(--px) * -3); height: var(--px); }
.fg-line.burn { background: #ff5a3a; box-shadow: 0 0 0 var(--px) rgba(255, 90, 58, .3); }
.fg-line.max { background: #fff; opacity: .5; }
.fg-tag { position: absolute; right: calc(100% + var(--px) * 5); transform: translateY(50%); font-size: .55em; white-space: nowrap; text-shadow: 0 var(--px) 0 #000; line-height: 1; }
.fg-needle { position: absolute; left: calc(100% + var(--px) * 2); width: 0; height: 0; transform: translateY(50%); border-top: calc(var(--px) * 3) solid transparent; border-bottom: calc(var(--px) * 3) solid transparent; border-right: calc(var(--px) * 4) solid #fff; filter: drop-shadow(0 var(--px) 0 #000); }
.fg-read { align-self: stretch; text-align: center; font-family: var(--font-display); font-size: 1.9em; line-height: .9; color: var(--text-light); text-shadow: 0 var(--px) 0 #000; font-variant-numeric: tabular-nums; }
.fg-read small { display: block; font-family: var(--font); font-size: .34em; letter-spacing: .08em; color: var(--parch-3); margin-top: var(--px); }
.fg-meter { position: absolute; width: calc(var(--px) * 6); height: calc(var(--px) * 30); background: #1a1210; border: var(--px) solid #000; box-shadow: 0 0 0 var(--px) var(--wood); transform: translate(calc(var(--px) * 10), -50%); }
.fg-meter > i { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(to top, #c8401a, #ffb03a 60%, #fff0b0); }
.fg-meter > b { position: absolute; left: calc(var(--px) * -2); right: calc(var(--px) * -2); height: var(--px); background: #fff; opacity: .6; }
.fg-meter > span { position: absolute; left: calc(100% + var(--px) * 2); bottom: 0; font-size: .55em; white-space: nowrap; text-shadow: 0 var(--px) 0 #000; }
.fg-chipline { display: flex; flex-wrap: wrap; gap: calc(var(--px) * 1.5); }
.fg-pick { position: relative; display: grid; grid-template-columns: var(--icon-s) 1fr; gap: calc(var(--px) * 2); align-items: center; padding: var(--px) calc(var(--px) * 2); background: var(--parch-2); border: var(--px) solid var(--parch-3); cursor: pointer; font: inherit; color: var(--ink); text-align: left; font-size: .78em; line-height: 1.15; }
.fg-pick img { width: var(--icon-s); height: var(--icon-s); }
.fg-pick:hover { border-color: var(--wood); background: #fff4d0; }
.fg-pick.on { border-color: var(--gold-dk); background: #fff1c0; box-shadow: inset 0 0 0 var(--px) var(--gold); }
.fg-pick[disabled] { opacity: .5; cursor: not-allowed; filter: grayscale(.6); }
.fg-pick small { display: block; color: var(--ink-soft); font-size: .85em; }
.fg-pick .why { color: #a83a1a; }
.fg-grid2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--px) * 64), 1fr)); gap: calc(var(--px) * 1.5); }
.fg-section { font-size: .7em; letter-spacing: .12em; text-transform: uppercase; color: var(--wood); font-weight: 700; margin: calc(var(--px) * 2) 0 var(--px); }
.fg-recipe { display: grid; grid-template-columns: var(--icon) 1fr auto; gap: calc(var(--px) * 3); align-items: center; padding: calc(var(--px) * 1.5) calc(var(--px) * 2); background: var(--parch-2); border: var(--px) solid var(--parch-3); }
.fg-recipe.locked { opacity: .62; }
.fg-recipe img { width: var(--icon); height: var(--icon); }
.fg-recipe .name { font-weight: 700; }
.fg-recipe .ins { font-size: .72em; color: var(--ink-soft); display: flex; flex-wrap: wrap; gap: 0 calc(var(--px) * 3); align-items: center; }
.fg-recipe .ins img { width: var(--icon-s); height: var(--icon-s); vertical-align: middle; margin: calc(var(--px) * -2) 0; }
.fg-recipe .ins .miss { color: #b0301a; font-weight: 700; }
.fg-recipe .why { font-size: .7em; color: #a83a1a; }
.fg-recipe .btns { display: flex; flex-direction: column; gap: var(--px); align-items: stretch; }
.fg-recipe .btn { font-size: .78em; padding: var(--px) calc(var(--px) * 3); }
.fg-result { position: absolute; right: calc(var(--px) * 6); top: min(calc(var(--px) * 100), calc(100% - var(--px) * 116)); width: calc(var(--px) * 112); padding: calc(var(--px) * 6); animation: pop .25s cubic-bezier(.2,1.5,.4,1); }
.fg-stamp { position: absolute; right: calc(var(--px) * 5); top: calc(var(--px) * -10); width: calc(var(--px) * 30); height: calc(var(--px) * 30); display: grid; place-items: center; font-family: var(--font-display); font-size: 3.4em; line-height: 1;
  background: #2a1a12; border: calc(var(--px) * 1.5) solid currentColor; box-shadow: 0 0 0 var(--px) #000, 0 calc(var(--px) * 2) 0 rgba(0,0,0,.4); transform: rotate(8deg); animation: stamp .45s cubic-bezier(.3,1.8,.5,1) both .35s; }
@keyframes stamp { from { transform: rotate(-20deg) scale(2.4); opacity: 0; } }
.fg-stamp small { position: absolute; bottom: calc(var(--px) * -6); font-family: var(--font); font-size: .17em; letter-spacing: .1em; white-space: nowrap; text-transform: uppercase; color: currentColor; text-shadow: 0 var(--px) 0 #000; }
.fg-value { font-family: var(--font-display); font-size: 2.2em; color: var(--gold-dk); line-height: 1; display: flex; align-items: center; gap: calc(var(--px) * 2); }
.fg-value img { width: var(--icon-s); height: var(--icon-s); }
.fg-break { display: grid; grid-template-columns: auto 1fr auto; gap: var(--px) calc(var(--px) * 2); align-items: center; font-size: .75em; margin: calc(var(--px) * 2) 0; }
.fg-break .fg-bar { grid-column: auto; height: calc(var(--px) * 3); }
.fg-float { position: absolute; transform: translate(-50%, -50%); font-family: var(--font-display); font-size: 1.6em; white-space: nowrap; pointer-events: none; text-shadow: 0 var(--px) 0 #000, var(--px) 0 0 #000, calc(var(--px) * -1) 0 0 #000, 0 calc(var(--px) * -1) 0 #000; animation: fgFloat 1.3s ease-out forwards; }
@keyframes fgFloat { 0% { transform: translate(-50%, -30%) scale(.6); opacity: 0; } 15% { transform: translate(-50%, -50%) scale(1.15); opacity: 1; } 30% { transform: translate(-50%, -55%) scale(1); } 100% { transform: translate(-50%, -140%); opacity: 0; } }
.fg-ring { position: absolute; border: calc(var(--px) * 1.5) solid; border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; box-shadow: 0 0 0 var(--px) #000; }
.fg-tip { position: absolute; transform: translate(-50%, -100%); font-size: .7em; white-space: nowrap; text-shadow: 0 var(--px) 0 #000; color: var(--text-light); pointer-events: none; }
.fg-ruler { position: absolute; height: calc(var(--px) * 7); transform: translateY(-50%); pointer-events: none; }
.fg-ruler .track { position: absolute; left: 0; right: 0; top: 50%; height: var(--px); background: #f3e2bf; box-shadow: 0 var(--px) 0 #000; }
.fg-ruler .zone { position: absolute; top: 0; bottom: 0; background: rgba(138, 240, 122, .35); border: var(--px) solid #8af07a; }
.fg-ruler .mark { position: absolute; top: calc(var(--px) * -4); width: 0; height: 0; transform: translateX(-50%); border-left: calc(var(--px) * 3) solid transparent; border-right: calc(var(--px) * 3) solid transparent; border-top: calc(var(--px) * 5) solid #ffd34a; filter: drop-shadow(0 var(--px) 0 #000); }
.fg-ruler .lab { position: absolute; top: calc(100% + var(--px) * 2); transform: translateX(-50%); font-size: .55em; white-space: nowrap; text-shadow: 0 var(--px) 0 #000; }
.fg-slider { width: 100%; accent-color: var(--wood); }
.fg-big-hint { position: absolute; left: 50%; bottom: calc(var(--px) * 18); transform: translateX(-50%); font-family: var(--font-display); font-size: 1.6em; color: var(--text-light); text-shadow: 0 var(--px) 0 #000, 0 calc(var(--px) * 2) 0 rgba(0,0,0,.5); pointer-events: none; white-space: nowrap; }
@media (max-width: 700px) { .fg-thermo { top: auto; bottom: calc(var(--px) * 30); } .fg-tube { height: calc(var(--px) * 60); } }
.fg-tbtn { display: none; position: absolute; left: calc(env(safe-area-inset-left, 0px) + var(--px) * 6); bottom: calc(env(safe-area-inset-bottom, 0px) + var(--px) * 8); width: calc(var(--px) * 40); height: calc(var(--px) * 41); padding: 0; border: 0; background: none; pointer-events: auto; touch-action: none; -webkit-user-select: none; user-select: none; }
html.is-touch .fg-tbtn.on { display: block; }
.fg-tbtn::before { content: ''; position: absolute; inset: calc(var(--px) * -4); }
.fg-tbtn img { position: absolute; image-rendering: pixelated; pointer-events: none; }
.fg-tbtn .face { inset: 0; width: 100%; height: 100%; }
.fg-tbtn .ic { left: calc(var(--px) * 11.5); top: calc(var(--px) * 10.5); width: calc(var(--px) * 17); height: calc(var(--px) * 17); }
.fg-tbtn.down .ic { transform: translateY(var(--px)); }
.fg-tbtn span { position: absolute; left: 50%; top: calc(100% + var(--px)); transform: translateX(-50%); font-size: .62em; color: var(--text-light); text-shadow: 0 var(--px) 0 #000; white-space: nowrap; pointer-events: none; }
`;

let styleRefs = 0;
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

/** A small horizontal bar; returns { el, set(v, cls) }. */
export function bar(cls = '') {
  const fill = el('i', { class: cls });
  const node = el('div', { class: 'fg-bar' }, [fill]);
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

/** Vertical thermometer with bands/lines (work, quench, melt, burn, max). */
export class Thermo {
  constructor(parent, maxT) {
    this.maxT = maxT;
    this.scale = el('div', { class: 'fg-tube-scale' });
    this.fill = el('div', { class: 'fg-tube-fill' });
    this.needle = el('div', { class: 'fg-needle' });
    this.tube = el('div', { class: 'fg-tube' }, [this.scale, this.fill, this.needle]);
    this.num = el('span');
    this.word = el('small');
    this.read = el('div', { class: 'fg-read' }, [this.num, this.word]);
    this.title = el('div', { class: 'fg-thermo-title' }, 'Heat');
    this.el = el('div', { class: 'fg-thermo' }, [this.title, this.tube, this.read]);
    this.marks = [];
    parent.append(this.el);
    this.setMax(maxT);
    this.shown = 20;
  }
  setMax(maxT) {
    this.maxT = maxT;
    const g = gaugeGradient(maxT);
    this.scale.style.background = g;
    this.fill.style.backgroundImage = g;
  }
  pct(t) { return clamp(t / this.maxT, 0, 1) * 100; }
  setTitle(t) { setText(this.title, t); }
  /** marks: [{kind:'work'|'quench'|'melt', range:[a,b], label} | {kind:'burn'|'max', at, label}] */
  setMarks(marks) {
    for (const m of this.marks) m.remove();
    this.marks = [];
    for (const m of marks) {
      let node;
      if (m.range) {
        const b = this.pct(m.range[0]), t = this.pct(m.range[1]);
        node = el('div', { class: 'fg-band ' + m.kind, style: { bottom: b + '%', height: Math.max(0.6, t - b) + '%' } },
          [el('span', { class: 'fg-tag', style: { bottom: '50%', color: m.kind === 'quench' ? '#9adcff' : '#a8f49a' } }, m.label)]);
      } else {
        const p = this.pct(m.at);
        node = el('div', { class: 'fg-line ' + m.kind, style: { bottom: p + '%' } },
          [el('span', { class: 'fg-tag', style: { bottom: '0', color: m.kind === 'burn' ? '#ff8a6a' : '#e8dcc8' } }, m.label)]);
      }
      this.tube.append(node);
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
  }
  remove() { this.el.remove(); }
}

/** Step chips: [{id, label}] */
export class Steps {
  constructor(parent, steps) {
    this.el = el('div', { class: 'fg-steps' });
    this.items = new Map();
    for (const s of steps) {
      const n = el('span', { class: 'fg-step' }, s.label);
      this.items.set(s.id, n);
      this.el.append(n);
    }
    parent.append(this.el);
  }
  set(active, done = []) {
    for (const [id, n] of this.items) {
      const cls = 'fg-step' + (active.includes(id) ? ' on' : done.includes(id) ? ' done' : '');
      if (n.className !== cls) n.className = cls;
    }
  }
}

/** Hold-to-charge strike meter that follows a screen point. */
export class StrikeMeter {
  constructor(parent) {
    this.fill = el('i');
    this.sweet = el('b', { style: { bottom: '88%' } });
    this.label = el('span');
    this.el = el('div', { class: 'fg-meter', hidden: true }, [this.fill, this.sweet, this.label]);
    parent.append(this.el);
  }
  show(x, y, v, label = '') {
    this.el.hidden = false;
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
    this.fill.style.height = (clamp(v, 0, 1) * 100).toFixed(1) + '%';
    setText(this.label, label);
  }
  hide() { this.el.hidden = true; }
}

/** Big pop-up word at a screen point. */
/**
 * Body for game.ui.confirm(): a short bold title, then the details pushed below the
 * dialog's close button (which sits over the top-right corner of the text).
 */
export function confirmText(title, body) {
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  return `<b>${esc(title)}</b><span style="display:block;margin-top:calc(var(--px) * 4)">${esc(body)}</span>`;
}

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

// The skill tree as a root map (wave 16): an old parchment map of the burrow's roots, pinned on
// the earth. From the knotted heart in the middle six great roots run out to the six lines
// (Mining, Smithing, Cooking, Building, Survival, Taming), each a wax seal with its emblem and
// level; from there the root branches out ring by ring to every skill, a knot in the root with a
// crisp 32×32 icon (ui/skillIcons.js). Roots you've grown down are lit in the line's colour; the
// next ones you can learn glow. Drag to pan, wheel / pinch / the brass knobs to zoom.
// Hover (or tap) a knot: a little parchment tag with its 2–4 word name and one line of what it
// does; Learn (or click a glowing knot twice) spends the points: the knot pops, sparks fly and
// the light runs down the root to it. Minimal text: names live in the tag, never on the map.
//
//   renderMap(host, game, { line, standalone }) → { el, dispose(), select(id), stamp(id), line(id),
//     layout(), escape(), zoom(z), selected, pos(id) }
import { el, makeRng, hashStr, makeNoise2D } from '../core/util.js';
import { SKILL_LINES, LINE, NODE, SKILL_NODES, nodeEffect, needLv } from '../data/skills.js';
import { canUnlock, unlock, lineInfo } from '../core/skills.js';
import { skillIconURL, lineIconURL, techIconId, ICON_IDS } from './skillIcons.js';
import { tokenURL } from './skillArt.js';
import { DL, installDialogArt } from './dialogArt.js';
import './skillmap.css';
import { MAPS, mapPx, kitPx } from './handKit.js';

const isTouch = () => document.documentElement.classList.contains('is-touch');
const W = 760, CX = W / 2, CY = W / 2;
const RING = [122, 176, 228, 280, 332];
const HUB_R = 34, GAP = 45, NODE_S = 40, HUB_S = 52;
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ------------------------------------------------------------------ layout (positions in map pixels)
let LAYOUT = null;
export function mapLayout() {
  if (LAYOUT && LAYOUT.n === SKILL_NODES.length) return LAYOUT;
  const tiers = {};
  for (const n of SKILL_NODES) ((tiers[n.line] ||= [[], [], [], [], []])[n.t]).push(n);
  const wt = SKILL_LINES.map((l) => Math.max(...tiers[l.id].map((row, t) => row.length * GAP / RING[t])) + 0.12);
  const k = Math.min(1, (Math.PI * 2) / wt.reduce((a, b) => a + b, 0));
  const pos = {}, hubs = {}, lines = {};
  let a = -Math.PI / 2 - wt[0] * k * 0.5 - wt[5] * k * 0.5; // mining up top-left, taming on its left
  SKILL_LINES.forEach((l, i) => {
    const w = wt[i] * k, c = a + w / 2;
    lines[l.id] = { a0: a, a1: a + w, c };
    hubs[l.id] = { x: CX + Math.cos(c) * HUB_R, y: CY + Math.sin(c) * HUB_R, a: c };
    tiers[l.id].forEach((row, t) => {
      row.sort((p, q) => p.s - q.s);
      const step = (GAP / RING[t]) * Math.min(1, k * 1.05);
      row.forEach((n, j) => {
        const r = makeRng(hashStr(n.id));
        const ang = c + (j - (row.length - 1) / 2) * step + (r() - 0.5) * 0.03;
        const rad = RING[t] + (r() - 0.5) * 10 + (row.length > 3 && j % 2 ? 9 : 0);
        pos[n.id] = { x: CX + Math.cos(ang) * rad, y: CY + Math.sin(ang) * rad, a: ang };
      });
    });
    a += w;
  });
  LAYOUT = { pos, hubs, lines, n: SKILL_NODES.length };
  return LAYOUT;
}

// ------------------------------------------------------------------ a tiny pixel buffer
class Buf {
  constructor(w, h) { this.w = w; this.h = h; this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h; this.g = this.c.getContext('2d'); this.img = this.g.createImageData(w, h); this.d = this.img.data; }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4, d = this.d;
    if (a >= 255 || !d[i + 3]) { d[i] = c >> 16 & 255; d[i + 1] = c >> 8 & 255; d[i + 2] = c & 255; d[i + 3] = Math.max(a, d[i + 3]); return; }
    const t = a / 255;
    d[i] += ((c >> 16 & 255) - d[i]) * t; d[i + 1] += ((c >> 8 & 255) - d[i + 1]) * t; d[i + 2] += ((c & 255) - d[i + 2]) * t;
  }
  get(x, y) { const i = ((y | 0) * this.w + (x | 0)) * 4; return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2]; }
  a(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[((y | 0) * this.w + (x | 0)) * 4 + 3]; }
  clear() { this.d.fill(0); }
  flush() { this.g.putImageData(this.img, 0, 0); return this.c; }
}
const mix = (a, b, t) => {
  const r = (a >> 16 & 255) + ((b >> 16 & 255) - (a >> 16 & 255)) * t, g = (a >> 8 & 255) + ((b >> 8 & 255) - (a >> 8 & 255)) * t, bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
const shade = (c, k) => mix(c, k > 0 ? 0xffffff : 0x000000, Math.abs(k));
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');

// ------------------------------------------------------------------ the parchment map (drawn once)
const PARCH = [0xf6e8c4, 0xeedcb0, 0xe4cd9c, 0xd6bb86, 0xc4a46e, 0xa8875a];
const BURN = [0xb8945e, 0x86552e, 0x3a2318, 0x1e1424]; // master palette: tan, woodMid, bark, ink
const INKC = 0x5e3a22;
let MAP_URL = null;
function mapURL() {
  if (MAP_URL) return MAP_URL;
  // wave 20: the sheet is the hand-drawn paper (src/ui/handMaps2.js) laid edge to edge, its rim torn
  // along a hand-cut wobble and scorched in three flat bands; latitudes dotted in faded ink
  const b = new Buf(W, W);
  const sheet = [[kitPx('paperA'), kitPx('paperB', null, 'h')], [kitPx('paperB', null, 'v'), kitPx('paperA', null, 'hv')]];
  const WOB = '0112100121100012', T = 32;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const dx = Math.abs(x - CX), dy = Math.abs(y - CY), along = dx > dy ? y : x;
    const edge = W / 2 - 6 - Math.max(dx, dy) - (dx + dy > W * 0.86 ? (dx + dy - W * 0.86) : 0) - +WOB[(along >> 3) & 15] * 2;
    if (edge < 0) continue;
    const t = sheet[(y / T | 0) & 1][(x / T | 0) & 1];
    let c = t.get(x % T, y % T);
    const dr = Math.hypot(x - CX, y - CY);
    for (const R of RING) if (Math.abs(dr - R - 22) < 0.6 && ((Math.atan2(y - CY, x - CX) * R) | 0) % 6 < 3) c = INKC;
    // the sheet was folded in thirds: a sand crease with its lit side, broken where the fold wore through
    for (const f of [W / 3 | 0, (W * 2) / 3 | 0]) { if (x === f && (y >> 4) % 5) c = 0xdcbf8a; else if (x === f + 1 && (y >> 4) % 5) c = 0xfff0d2; if (y === f && (x >> 4) % 6) c = 0xdcbf8a; else if (y === f + 1 && (x >> 4) % 6) c = 0xfff0d2; }
    if (edge < 12) c = edge < 2 ? BURN[3] : edge < 4 ? BURN[1] : edge < 7 ? BURN[0] : 0xdcbf8a;
    b.set(x, y, c);
  }
  // a compass rose, bottom right: eight inked points and a red-ink north
  const rx = W - 92, ry = W - 92;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2, len = k % 2 ? 14 : 30, wd = k % 2 ? 3 : 5;
    for (let t = 0; t <= len; t++) { const w = wd * (1 - t / len); for (let s = -w; s <= w; s++) { const px = rx + Math.cos(a) * t - Math.sin(a) * s, py = ry + Math.sin(a) * t + Math.cos(a) * s; b.set(px, py, k === 0 ? (s < 0 ? 0x9a2c2a : 0x5e1824) : s < 0 ? 0xf2dcae : INKC); } }
  }
  for (let t = 0; t < 360; t += 2) { const a = (t * Math.PI) / 180; b.set(rx + Math.cos(a) * 19, ry + Math.sin(a) * 19, INKC, 160); }
  MAP_URL = b.flush().toDataURL();
  return MAP_URL;
}

// ------------------------------------------------------------------ roots (redrawn as they light)
const BARK = { out: 0x24160a, body: [0x5e3e22, 0x6e4a2a, 0x80583a], hi: 0x9a7448 };
function curvePts(x0, y0, x1, y1, seed, bend = 0.22) {
  const r = makeRng(seed), dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L, off = (r() - 0.5) * 2 * bend * L;
  const mx = (x0 + x1) / 2 + nx * off, my = (y0 + y1) / 2 + ny * off;
  const n = Math.max(4, Math.ceil(L / 0.8)), pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; pts.push([u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * y0 + 2 * u * t * my + t * t * y1, t]); }
  return pts;
}
/** One root: pts (from curvePts), widths w0 → w1, look: 'dark' | 'warm' | lit palette, prog 0..1 (how far the light has run). */
function stampRoot(b, pts, w0, w1, pass, look, seed, prog = 1) {
  const r = makeRng(seed);
  const pal = look.pal;
  for (let i = 0; i < pts.length; i++) {
    const [x, y, t] = pts[i];
    const w = (w0 + (w1 - w0) * t) * (1 + Math.sin(t * 17 + seed) * 0.08);
    const rad = w / 2;
    const lit = pal && t <= prog;
    if (pass === 0) { for (let yy = -rad - 1; yy <= rad + 1; yy++) for (let xx = -rad - 1; xx <= rad + 1; xx++) if (xx * xx + yy * yy <= (rad + 1.1) ** 2) b.set(x + xx, y + yy, lit ? shade(pal[4], -0.2) : BARK.out); }
    else if (pass === 1) {
      const ring = i % 7 === 0;
      for (let yy = -rad; yy <= rad; yy++) for (let xx = -rad; xx <= rad; xx++) {
        if (xx * xx + yy * yy > rad * rad + 0.3) continue;
        const k = (-xx - yy) / (rad * 1.6 + 0.01); // lit from the top left
        let c;
        if (lit) c = k > 0.35 ? pal[1] : k > -0.25 ? pal[2] : pal[3];
        else if (look.warm) c = k > 0.35 ? 0x9a6a3a : k > -0.25 ? 0x7a5230 : 0x5a3a20;
        else c = k > 0.35 ? BARK.body[2] : k > -0.25 ? BARK.body[1] : BARK.body[0];
        if (ring && Math.abs(xx) + Math.abs(yy) < rad) c = shade(c, -0.12);
        b.set(x + xx, y + yy, c);
      }
    } else {
      // the shine along the top, gold motes in a lit root
      if (rad >= 1.4) b.set(x - rad * 0.45, y - rad * 0.45, lit ? pal[0] : look.warm ? 0xc89a5a : BARK.hi);
      if (lit && r() < 0.06) b.set(x + (r() - 0.5) * rad, y + (r() - 0.5) * rad, 0xfff4c0);
    }
  }
}
function rootlets(b, pts, seed, lit) {
  const r = makeRng(seed + 3);
  for (let k = 0; k < Math.floor(pts.length / 26); k++) {
    const i = 4 + Math.floor(r() * (pts.length - 8)), p = pts[i], q = pts[Math.min(pts.length - 1, i + 2)];
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]) + (r() < 0.5 ? 1 : -1) * (0.7 + r() * 0.5), len = 4 + r() * 7;
    for (let t = 0; t < len; t++) { const x = p[0] + Math.cos(a) * t + Math.sin(t * 0.8) * 0.6, y = p[1] + Math.sin(a) * t; b.set(x, y, t > len - 2 ? 0x8a6a48 : lit ? lit[3] : 0x4a3018, 230); }
  }
}

// ------------------------------------------------------------------ knot frames (per line × state)
const frames = new Map();
const hx = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
/** wave 20: the knots are hand-drawn maps (src/ui/handMaps6.js), recoloured per state and line. */
function knotColors(line, kind) {
  const L = line.pal || [];
  if (kind === 'done') return { L: 'Y', W: 'G', w: 'b', n: 'C', C: hx(L[1] ?? 0xe0a040), c: hx(L[2] ?? 0xc07020), s: hx(L[3] ?? 0x804010), t: hx(L[3] ?? 0x804010), a: hx(L[2] ?? 0xc07020) };
  if (kind === 'ready') return { L: 'Y', W: 'G', w: 'b', n: 'C', a: 'c' };
  if (kind === 'open') return { n: 'B', a: 'c' };
  if (kind === 'barred') return { L: '4', W: '3', w: '2', n: '1', C: '3', c: '2', s: '1', t: '1', a: '2' };
  return { L: 'W', W: 'w', w: 'B', n: 'B', C: 'W', c: 'w', s: 'B', t: 'B', a: 'B' }; // locked: the sawn end of a root, growth rings showing
}
function frameURL(line, kind, size = NODE_S) {
  const key = line.id + kind + size;
  if (!frames.has(key)) frames.set(key, mapPx(MAPS[size > 44 ? 'knot52' : 'knot40'], knotColors(line, kind)).url());
  return frames.get(key);
}

// ------------------------------------------------------------------ the map
export function renderMap(host, game, opts = {}) {
  const st = game.state, au = game.audio, ui = game.ui;
  installDialogArt();
  const S = () => st.data.skills;
  const L = mapLayout();
  const iconId = (n) => (ICON_IDS.includes(n.id) || !n.tech ? n.id : techIconId(n.icon));

  const look = (id) => {
    if (S().nodes[id]) return { k: 'done' };
    const c = canUnlock(st, id);
    if (c.ok) return { k: 'ready', c };
    if (c.code === 'barred') return { k: 'barred', c };
    if (c.code === 'path' || c.code === 'none') return { k: 'locked', c };
    return { k: 'open', c };
  };

  // ---------------- skeleton
  const world = el('div', { class: 'skm-world', style: { width: W + 'px', height: W + 'px' } });
  const mapImg = el('img', { class: 'skm-map', src: mapURL(), alt: '', draggable: 'false' });
  const roots = new Buf(W, W);
  roots.c.className = 'skm-roots';
  const fxLayer = el('div', { class: 'skm-fx' });
  world.append(mapImg, roots.c);
  const nodeEls = {};
  for (const n of SKILL_NODES) {
    const p = L.pos[n.id];
    const b = el('button', { class: 'skm-node', 'data-id': n.id, 'aria-label': n.name, style: { left: (p.x - NODE_S / 2) + 'px', top: (p.y - NODE_S / 2) + 'px' } }, [
      el('img', { class: 'skm-frame', alt: '', draggable: 'false' }), el('img', { class: 'skm-ic', alt: '', draggable: 'false' }),
    ]);
    nodeEls[n.id] = b;
    world.append(b);
  }
  const hubEls = {};
  for (const l of SKILL_LINES) {
    const h = L.hubs[l.id], c = L.lines[l.id].c, R = 66;
    const x = CX + Math.cos(c) * R, y = CY + Math.sin(c) * R;
    h.ox = x; h.oy = y;
    const lv = el('b', { class: 'skm-lv' });
    const xp = el('i', { class: 'skm-xp' }, [el('i')]);
    const b = el('button', { class: 'skm-hub', 'data-line': l.id, 'aria-label': l.name, style: { left: (x - HUB_S / 2) + 'px', top: (y - HUB_S / 2) + 'px', '--lc': l.ink, '--l1': hex(l.pal[1]), '--l2': hex(l.pal[2]) } }, [
      el('img', { class: 'skm-frame', src: frameURL(l, 'done', HUB_S), alt: '', draggable: 'false' }), el('img', { class: 'skm-ic', src: lineIconURL(l.id), alt: '', draggable: 'false' }), lv, xp,
    ]);
    hubEls[l.id] = { b, lv, xp };
    world.append(b);
  }
  const heartPts = el('b', { class: 'skm-heart-n' });
  const heart = el('div', { class: 'skm-heart', style: { left: (CX - 26) + 'px', top: (CY - 26) + 'px' } }, [el('img', { class: 'pix', src: tokenURL(), alt: '' }), heartPts]);
  world.append(heart, fxLayer);

  const view = el('div', { class: 'skm-view' }, [world]);
  const ptsN = el('b');
  const pts = el('div', { class: 'skm-pts', title: 'Skill points' }, [el('img', { class: 'pix', src: tokenURL(), alt: '' }), ptsN]);
  const knob = (cls, label, fn) => el('button', { class: 'skm-knob ' + cls, 'aria-label': label, title: label, onclick: (e) => { e.stopPropagation(); fn(); } }, [el('i')]);
  const knobs = el('div', { class: 'skm-knobs' }, [knob('in', 'Zoom in', () => zoomBy(1.5)), knob('out', 'Zoom out', () => zoomBy(1 / 1.5)), knob('fit', 'Whole map', () => fitAll())]);
  const strip = el('div', { class: 'skm-strip' });
  for (const l of SKILL_LINES) strip.append(el('button', { class: 'skm-seal', 'data-line': l.id, title: l.name, style: { '--lc': l.ink }, onclick: (e) => { e.stopPropagation(); goLine(l.id); } }, [el('img', { class: 'pix', src: lineIconURL(l.id), alt: '' }), el('i')]));
  const tipName = el('b'), tipFx = el('span'), tipNeed = el('small'), tipBtn = el('button', { class: 'skm-learn', onclick: (e) => { e.stopPropagation(); if (sel) stamp(sel); } }, [el('img', { class: 'pix', src: tokenURL(), alt: '' }), el('span', {}, 'Learn')]);
  const tip = el('div', { class: 'skm-tip', hidden: true }, [tipName, tipFx, tipNeed, tipBtn]);
  const root = el('div', { class: 'skm' + (opts.standalone ? ' solo' : '') }, [view, pts, strip, knobs, tip]);
  host.append(root);

  // ---------------- drawing the roots
  const edges = [];
  for (const l of SKILL_LINES) edges.push({ from: [CX, CY], to: [L.hubs[l.id].ox, L.hubs[l.id].oy], w0: 11, w1: 8, line: l, a: 'heart', b: 'hub:' + l.id, seed: hashStr(l.id) });
  for (const n of SKILL_NODES) {
    const p = L.pos[n.id];
    const reqs = n.req.length ? (n.tech ? n.req.slice(0, 1) : n.req) : ['hub:' + n.line];
    reqs.forEach((rq, i) => {
      const q = rq.startsWith('hub:') ? { x: L.hubs[n.line].ox, y: L.hubs[n.line].oy } : L.pos[rq];
      if (!q) return;
      const w = Math.max(2.6, 7 - n.t * 1.1);
      edges.push({ from: [q.x, q.y], to: [p.x, p.y], w0: (i ? 0.55 : 1) * (w + 1.2), w1: (i ? 0.55 : 1) * w, line: LINE[n.line], a: rq, b: n.id, seed: hashStr(n.id + rq), thin: i > 0 });
    });
  }
  for (const e of edges) { e.pts = curvePts(e.from[0], e.from[1], e.to[0], e.to[1], e.seed, e.a === 'heart' ? 0.08 : 0.2); }
  const isOn = (k) => k === 'heart' || k.startsWith('hub:') || !!S().nodes[k];
  const flow = new Map(); // edge → progress 0..1 while the light runs down it
  const drawRoots = () => {
    roots.clear();
    const looks = edges.map((e) => {
      const lit = isOn(e.a) && isOn(e.b);
      const fl = flow.has(e);
      const warm = fl || (!lit && isOn(e.a) && !!NODE[e.b] && look(e.b).k === 'ready');
      return { pal: lit || fl ? e.line.pal : null, warm, prog: fl ? flow.get(e) : 1 };
    });
    for (let pass = 0; pass < 3; pass++) edges.forEach((e, i) => {
      stampRoot(roots, e.pts, e.w0, e.w1, pass, looks[i], e.seed, looks[i].prog);
      if (pass === 2 && !e.thin) rootlets(roots, e.pts, e.seed, looks[i].pal);
    });
    // the heart: a gnarled knot where the roots meet
    for (let y = -24; y <= 24; y++) for (let x = -24; x <= 24; x++) {
      const d = Math.hypot(x, y), a = Math.atan2(y, x), R = 21 + Math.sin(a * 6) * 2.2 + Math.sin(a * 11) * 1;
      if (d > R + 1) continue;
      const k = (-x - y) / (d + 0.01);
      roots.set(CX + x, CY + y, d > R ? BARK.out : (((a * 5 + d * 0.4) | 0) % 2 ? (k > 0.3 ? 0x8a6038 : 0x6a4426) : (k > 0.3 ? 0x7a5432 : 0x56381e)));
    }
    roots.flush();
  };

  // ---------------- state → DOM
  let sel = null;
  const refresh = () => {
    for (const n of SKILL_NODES) {
      const k = look(n.id).k, b = nodeEls[n.id];
      if (b.dataset.k !== k) {
        b.dataset.k = k;
        b.firstChild.src = frameURL(LINE[n.line], k);
        b.lastChild.src = skillIconURL(iconId(n), k === 'done' || k === 'ready' ? 'lit' : k === 'barred' ? 'gray' : 'dim');
      }
      b.classList.toggle('sel', sel === n.id);
    }
    hubsNow();
    const p = S().points || 0;
    ptsN.textContent = String(p);
    heartPts.textContent = String(p);
    pts.classList.toggle('none', !p);
    drawRoots();
    if (sel) showTip(sel, false, false);
  };
  /** The six hubs: level, XP tube, a glint when something there can be learned. */
  const hubsNow = () => {
    for (const l of SKILL_LINES) {
      const info = lineInfo(st, l.id), h = hubEls[l.id];
      h.lv.textContent = String(info.level);
      h.xp.firstChild.style.width = (info.frac * 100).toFixed(1) + '%';
      const ready = SKILL_NODES.some((n) => n.line === l.id && look(n.id).k === 'ready');
      h.b.classList.toggle('ready', ready);
      strip.querySelector(`[data-line="${l.id}"]`)?.classList.toggle('ready', ready);
      const sl = strip.querySelector(`[data-line="${l.id}"] i`);
      if (sl) sl.textContent = String(info.level);
    }
  };

  // ---------------- pan & zoom
  let z = 1, tx = 0, ty = 0, anim = 0;
  const vw = () => view.clientWidth || 600, vh = () => view.clientHeight || 400;
  const zMin = () => Math.max(0.35, Math.min(vw() / (W - 30), vh() / (W - 30)) * 0.98);
  const zMax = () => (isTouch() ? 2.5 : 3);
  const clampT = () => {
    const m = 40, sw = W * z, sh = W * z;
    tx = sw + m * 2 <= vw() ? (vw() - sw) / 2 : Math.min(m, Math.max(vw() - sw - m, tx));
    ty = sh + m * 2 <= vh() ? (vh() - sh) / 2 : Math.min(m, Math.max(vh() - sh - m, ty));
  };
  const apply = () => { clampT(); world.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px) scale(${z})`; root.style.setProperty('--z', z); if (sel) placeTip(sel); };
  const zoomAt = (nz, sx, sy) => {
    nz = Math.max(zMin(), Math.min(zMax(), nz));
    const wx = (sx - tx) / z, wy = (sy - ty) / z;
    z = nz; tx = sx - wx * z; ty = sy - wy * z;
    apply();
  };
  const zoomBy = (f) => { au.play('sk_pick'); tween(Math.max(zMin(), Math.min(zMax(), snapZ(z * f))), (vw() / 2 - tx) / z, (vh() / 2 - ty) / z); };
  const snapZ = (v) => (v >= 0.95 ? Math.round(v * 2) / 2 : v);
  /** Glide to zoom nz centred on map point (wx, wy). */
  const tween = (nz, wx, wy, dur = 260) => {
    cancelAnimationFrame(anim);
    const z0 = z, x0 = (vw() / 2 - tx) / z, y0 = (vh() / 2 - ty) / z, t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      z = z0 + (nz - z0) * e;
      const cx = x0 + (wx - x0) * e, cy = y0 + (wy - y0) * e;
      tx = vw() / 2 - cx * z; ty = vh() / 2 - cy * z;
      apply();
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  const fitAll = () => { au.play('sk_pick'); tween(zMin(), CX, CY); };
  const goLine = (id) => {
    const l = LINE[id];
    if (!l) return;
    S().view = id;
    const c = L.lines[id].c, R = (RING[1] + RING[2]) / 2;
    au.play('page', { vol: 0.5 });
    tween(Math.max(zMin(), Math.min(zMax(), isTouch() ? 1.5 : 1.5)), CX + Math.cos(c) * R, CY + Math.sin(c) * R, 320);
  };

  // pointers: drag pans, two fingers pinch; a tap (no drag) on a knot picks it
  const ptrs = new Map();
  let drag = null, moved = false, pinch = null;
  view.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { view.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    cancelAnimationFrame(anim);
    if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY, tx, ty }; moved = false; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z }; moved = true; }
  });
  view.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) { if (!isTouch()) hoverAt(e); return; }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = view.getBoundingClientRect();
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      zoomAt(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / (pinch.d || 1), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    } else if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (moved) { tx = drag.tx + dx; ty = drag.ty + dy; apply(); view.classList.add('drag'); }
    }
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) {
      view.classList.remove('drag');
      if (!moved && e.type === 'pointerup') {
        const t = document.elementFromPoint(e.clientX, e.clientY);
        const nb = t?.closest?.('.skm-node'), hb = t?.closest?.('.skm-hub');
        if (nb) tapNode(nb.dataset.id);
        else if (hb) goLine(hb.dataset.line);
        else if (sel) select(null);
      }
      drag = null;
    }
  };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = view.getBoundingClientRect();
    zoomAt(z * Math.pow(1.0015, -e.deltaY), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  let hoverId = null;
  const hoverAt = (e) => {
    const nb = e.target?.closest?.('.skm-node');
    const id = nb ? nb.dataset.id : null;
    if (id === hoverId) return;
    hoverId = id;
    if (id) { au.play('sk_pick', { vol: 0.5 }); if (!sel || sel === id) showTip(id); else showTip(id, true); }
    else if (sel) showTip(sel); else hideTip();
  };
  view.addEventListener('pointerleave', () => { hoverId = null; if (sel) showTip(sel); else hideTip(); });

  // ---------------- the tag
  const showTip = (id, peek = false, anim = true) => {
    const n = NODE[id];
    if (!n) return hideTip();
    const lk = look(id), l = LINE[n.line];
    tip.hidden = false;
    tip.dataset.k = lk.k;
    tip.style.setProperty('--lc', l.ink);
    tipName.textContent = n.name;
    tipFx.textContent = nodeEffect(n);
    let need = '';
    if (lk.k === 'done') need = 'Learned';
    else if (lk.k === 'barred') need = lk.c.reason;
    else if (lk.k === 'locked') need = 'After ' + n.req.map((r) => NODE[r]?.name).filter(Boolean).slice(0, 2).join(' or ');
    else if (lk.c?.code === 'level') need = `${l.name} Lv ${needLv(n)}`;
    else if (lk.c?.code === 'points') need = `${n.cost} points`;
    tipNeed.textContent = need;
    tipNeed.hidden = !need;
    tipBtn.hidden = lk.k !== 'ready' || peek;
    tipBtn.lastChild.textContent = n.cost > 1 ? `Learn · ${n.cost}` : 'Learn';
    if (anim) { tip.classList.remove('in'); void tip.offsetWidth; tip.classList.add('in'); }
    placeTip(id);
  };
  const placeTip = (id) => {
    const p = L.pos[id];
    if (!p || tip.hidden) return;
    const sx = p.x * z + tx, sy = p.y * z + ty, h = tip.offsetHeight || 60, w = tip.offsetWidth || 160;
    const above = sy - (NODE_S / 2) * z - h - 6 > 4;
    tip.style.left = Math.round(Math.max(4, Math.min(vw() - w - 4, sx - w / 2))) + 'px';
    tip.style.top = Math.round(above ? sy - (NODE_S / 2) * z - h - 6 : sy + (NODE_S / 2) * z + 6) + 'px';
  };
  const hideTip = () => { tip.hidden = true; };
  const select = (id) => {
    sel = id;
    for (const b of Object.values(nodeEls)) b.classList.toggle('sel', b.dataset.id === id);
    if (id) showTip(id); else hideTip();
  };
  const tapNode = (id) => {
    const k = look(id).k;
    if (sel === id && k === 'ready') { stamp(id); return; }
    au.play(k === 'ready' ? 'sk_pick' : 'ui_click', { vol: 0.6 });
    const b = nodeEls[id];
    b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge');
    select(id);
  };

  // ---------------- learning one: the knot pops, sparks fly, the light runs down the root
  const stamp = (id) => {
    const r = unlock(st, id);
    const b = nodeEls[id];
    if (!r.ok) { au.play('ui_error'); b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); return false; }
    au.play('sk_stamp');
    setTimeout(() => au.play('sparkle', { vol: 0.7 }), 120);
    const n = NODE[id], p = L.pos[id];
    const run = edges.filter((e) => e.b === id && isOn(e.a));
    for (const e of run) flow.set(e, 0);
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 380);
      for (const e of run) flow.set(e, t);
      drawRoots();
      if (t < 1) requestAnimationFrame(step); else { for (const e of run) flow.delete(e); refresh(); }
    };
    requestAnimationFrame(step);
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4, d = 22 + Math.random() * 20;
      const s = el('img', { class: 'pix skm-spark', src: DL.spark(i % 3), alt: '', style: { left: (p.x - 3.5) + 'px', top: (p.y - 3.5) + 'px', '--dx': (Math.cos(a) * d).toFixed(1) + 'px', '--dy': (Math.sin(a) * d).toFixed(1) + 'px', animationDelay: (Math.random() * 0.08).toFixed(2) + 's' } });
      fxLayer.append(s);
      setTimeout(() => s.remove(), 700);
    }
    const ring = el('i', { class: 'skm-ring', style: { left: (p.x - 30) + 'px', top: (p.y - 30) + 'px', '--lc': hex(LINE[n.line].pal[1]) } });
    fxLayer.append(ring);
    setTimeout(() => ring.remove(), 600);
    pts.classList.remove('bump'); void pts.offsetWidth; pts.classList.add('bump');
    refresh();
    select(id);
    return true;
  };

  // ---------------- start: the line with something to learn (or the asked one), else the whole map
  const firstLine = LINE[opts.line] ? opts.line : LINE[S().view] ? S().view : (SKILL_LINES.find((l) => SKILL_NODES.some((n) => n.line === l.id && look(n.id).k === 'ready')) || null)?.id;
  refresh();
  const start = () => {
    if (!view.clientWidth) { requestAnimationFrame(start); return; }
    z = Math.max(zMin(), 1);
    tx = vw() / 2 - CX * z; ty = vh() / 2 - CY * z;
    apply();
    if (firstLine) { const c = L.lines[firstLine].c, R = RING[1]; tween(Math.max(zMin(), isTouch() ? 1.25 : 1.5), CX + Math.cos(c) * R, CY + Math.sin(c) * R, 420); }
  };
  requestAnimationFrame(start);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => apply()) : null;
  ro?.observe(view);
  let hubT = 0;
  const offSkill = st.on('skill', (e) => {
    if (e.type !== 'xp') { refresh(); return; }
    const now = performance.now(); // XP trickles in all the time: just the tubes, now and then
    if (now - hubT > 400) { hubT = now; hubsNow(); }
  });
  if (S()) S().opened = st.data.playTime || 0;
  ui.skillNudge?.clear?.();

  return {
    el: root,
    get selected() { return sel; },
    select, stamp, line: goLine, layout: () => apply(), zoom: (v) => tween(v, (vw() / 2 - tx) / z, (vh() / 2 - ty) / z, 1), pos: (id) => L.pos[id],
    pick: (id) => select(id), confirm: () => (sel ? stamp(sel) : false),
    escape() { if (sel) { select(null); return true; } return false; },
    dispose() { cancelAnimationFrame(anim); ro?.disconnect(); offSkill?.(); root.remove(); },
  };
}

// The Builder's Hammer's paw-side (wave 16): how you pick a piece and how it goes up.
//
// HammerUI: no top-down panel any more. While the hammer is held, a compact quick strip sits over
// the belt (the piece in the paw big in a brass frame, its neighbours either side, the timber it
// takes underneath: have / need). The wheel (or the touch "tool" button) steps along it. Hold Q
// (or tap the hammer's belt loop again on a phone) for the radial wheel: an iron-banded oak wheel
// round the crosshair, the pieces on its rim and three category knobs in its hub (pieces you build,
// furniture from storage, floors); flick the mouse toward one and let go of Q (or click / tap it).
// Pieces the Building level hasn't taught yet sit on the rim padlocked with their level.
//
// hammerIn(build, rec, piece): the blows. The piece rises from a frame of planks in a few quick
// strikes (fewer and quicker with Building skills and levels): each strike swings the paw's hammer,
// knocks out splinters, nail glints and dust, and steps the piece up; the last one pops it home.
import { el, makeRng, hashStr } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { itemVox } from '../ui/itemVox.js';
import { ITEMS } from '../data/items.js';
import { FURNITURE, FLOORS } from '../data/furniture.js';
import { T } from './units.js';
import './hammer.css';

const isTouch = () => document.documentElement.classList.contains('is-touch');
export const CATS = [
  { id: 'piece', name: 'Build', icon: 'builder_hammer' },
  { id: 'furniture', name: 'Furniture', icon: 'chair_wood' },
  { id: 'floor', name: 'Floors', icon: 'floor_plank' },
];
const nameOf = (id) => (FURNITURE[id] || FLOORS[id])?.name || ITEMS[id]?.name || id;
const iconOf = (id) => { try { return itemVox.src(id); } catch (e) { return iconURL(id); } };

// ------------------------------------------------------------------ the wheel's plate (pixel art)
let PLATE = null;
function plateURL() {
  if (PLATE) return PLATE;
  const n = 120, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), d = img.data, r = makeRng(hashStr('hammer-wheel'));
  const set = (x, y, col, a = 255) => { const i = (y * n + x) * 4; d[i] = col >> 16 & 255; d[i + 1] = col >> 8 & 255; d[i + 2] = col & 255; d[i + 3] = a; };
  const C0 = 60, R1 = 58, R0 = 36, H = 22;
  const planks = [0x8a5a32, 0x7a4e2a, 0x946238, 0x845430];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - C0, dy = y + 0.5 - C0, dd = Math.hypot(dx, dy), a = Math.atan2(dy, dx), k = (-dx - dy) / (dd + 0.01);
    if (dd > R1 + 1) continue;
    let col;
    if (dd > R1 - 0.6) col = 0x150b06;
    else if (dd > R1 - 4) col = k > 0.35 ? 0xf8dc86 : k < -0.35 ? 0x7a5018 : 0xcc9a34; // brass tyre
    else if (dd > R0) {
      // oak wedges with grain running round, dark seams between them
      const w = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8), wa = ((a + Math.PI) / (Math.PI * 2)) * 8 - w;
      col = planks[w % 4];
      if (wa < 0.04) col = 0x3a2010;
      else if (((dd * 1.7 + w * 3) | 0) % 5 === 0) col = col - 0x0a0604;
      if (dd < R0 + 2) col = 0x4a2c14;
      if (k > 0.5 && dd > R1 - 6) col += 0x101008;
    } else if (dd > H) col = (((a * 6) | 0) % 2 ? 0x2e2620 : 0x3a302a) + (k > 0.4 ? 0x0c0a08 : 0); // the iron ring
    else if (dd > H - 1.2) col = 0x150b06;
    else col = k > 0.3 ? 0x5a4636 : 0x3e3026; // the hub
    set(x, y, col);
  }
  // rivets on the tyre and the iron ring
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + 0.2, x = Math.round(C0 + Math.cos(a) * (R1 - 2)), y = Math.round(C0 + Math.sin(a) * (R1 - 2)); set(x, y, 0xfff4c8); set(x + 1, y + 1, 0x5a3a10); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.4, x = Math.round(C0 + Math.cos(a) * (R0 - 6)), y = Math.round(C0 + Math.sin(a) * (R0 - 6)); set(x, y, 0xb8b0a8); set(x + 1, y + 1, 0x141010); }
  void r;
  g.putImageData(img, 0, 0);
  PLATE = c.toDataURL();
  return PLATE;
}

// ------------------------------------------------------------------ the strip + the wheel
export class HammerUI {
  constructor(build) {
    this.b = build;
    this.game = build.game;
    const hud = this.game.ui.hud;
    this.left = el('div', { class: 'hm-side l' });
    this.cur = el('div', { class: 'hm-cur' });
    this.right = el('div', { class: 'hm-side r' });
    this.name = el('b', { class: 'hm-name' });
    this.cost = el('div', { class: 'hm-cost' });
    this.catBtn = el('button', { class: 'hm-cat', title: 'Category', onclick: (e) => { e.stopPropagation(); build.nextTab(); } }, [el('img', { class: 'pix', alt: '' })]);
    const keys = isTouch() ? null : el('div', { class: 'hm-keys', title: 'Hold Q: the wheel · R: turn · F: take down', html: '<kbd>Q</kbd>' });
    this.strip = el('div', { class: 'hm-strip' }, [el('div', { class: 'hm-info' }, [this.name, this.cost]), el('div', { class: 'hm-row' }, [this.catBtn, this.left, this.cur, this.right, keys].filter(Boolean))]);
    this.strip.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.wheel = el('div', { class: 'hm-wheel', hidden: true }, [el('img', { class: 'hm-plate', src: plateURL(), alt: '' })]);
    this.wheel.addEventListener('pointerdown', (e) => e.stopPropagation());
    hud.append(this.strip, this.wheel);
    this.flick = { x: 0, y: 0 };
    this.render();
  }

  dispose() { this.strip.remove(); this.wheel.remove(); }

  slotEl(e, cls = '') {
    const b = this.b;
    const s = el('button', { class: 'hm-slot ' + cls + (e.locked ? ' locked' : '') + (e.short ? ' short' : ''), title: nameOf(e.id), onclick: (ev) => { ev.stopPropagation(); if (!e.locked) b.pickIndex(e.i); } }, [
      el('img', { class: 'pix', src: iconOf(e.id), alt: '' }),
    ]);
    if (e.locked) s.append(el('i', { class: 'hm-lock' }, 'Lv ' + e.lv));
    else if (e.n !== null && e.n !== undefined) s.append(el('i', { class: 'hm-n' }, '×' + e.n));
    return s;
  }

  /** The strip: the piece in the paw and two either side. */
  render() {
    const b = this.b, list = b.entries(), i = b.selIdx;
    const cat = CATS.find((c) => c.id === b.tab) || CATS[0];
    this.catBtn.firstChild.src = iconOf(cat.icon);
    this.catBtn.title = cat.name;
    this.left.innerHTML = ''; this.right.innerHTML = ''; this.cur.innerHTML = '';
    if (!list.length) {
      this.name.textContent = b.tab === 'furniture' ? 'Storage is empty' : 'Nothing yet';
      this.cost.innerHTML = '';
      return;
    }
    const at = (k) => list[((i + k) % list.length + list.length) % list.length];
    if (list.length > 2) for (const k of [-2, -1]) if (list.length > -k * 2 - 1 || k === -1) this.left.append(this.slotEl(at(k), 'far' + -k));
    const e = at(0);
    const big = this.slotEl(e, 'big');
    this.cur.append(big);
    big.classList.remove('bump'); void big.offsetWidth; big.classList.add('bump');
    if (list.length > 1) for (const k of [1, 2]) if (list.length > k * 2 - 1 || k === 1) this.right.append(this.slotEl(at(k), 'far' + k));
    this.name.textContent = nameOf(e.id);
    // the timber it takes: just the material icons (dim + red when you're short; the slot's ×N says how many)
    this.cost.innerHTML = '';
    if (!e.locked && e.made) for (const [id, n] of Object.entries(e.made)) {
      const have = this.game.state.count(id);
      this.cost.append(el('span', { class: 'hm-mat' + (have < n ? ' short' : ''), title: `${n} ${nameOf(id)}` }, [el('img', { class: 'pix', src: iconOf(id), alt: '' })]));
    }
    if (!this.wheel.hidden) this.renderWheel();
  }

  /** A wordless "no" (short of timber, can't go there): the strip shakes, the cost icons blink. */
  shake() {
    this.strip.classList.remove('nope'); void this.strip.offsetWidth; this.strip.classList.add('nope');
  }
  flash() { this.shake(); }

  // ---------------- the radial wheel
  get open() { return !this.wheel.hidden; }
  openWheel() {
    if (this.open) return;
    this.wheel.hidden = false;
    this.strip.classList.add('away');
    this.flick = { x: 0, y: 0 };
    this.hot = this.b.selIdx;
    this.renderWheel();
    this.wheel.classList.remove('in'); void this.wheel.offsetWidth; this.wheel.classList.add('in');
    this.game.audio.play('ui_open', { vol: 0.5 });
  }
  closeWheel(pick = true) {
    if (!this.open) return;
    this.wheel.hidden = true;
    this.strip.classList.remove('away');
    if (pick && this.hot !== null && this.hot !== undefined && this.hot !== this.b.selIdx) this.b.pickIndex(this.hot);
    this.game.audio.play('ui_close', { vol: 0.4 });
  }
  toggleWheel() { if (this.open) this.closeWheel(); else this.openWheel(); }

  renderWheel() {
    const b = this.b, list = b.entries();
    for (const n of [...this.wheel.querySelectorAll('.hm-slot, .hm-wcat, .hm-wname')]) n.remove();
    const N = Math.max(list.length, 1);
    list.forEach((e, k) => {
      const a = (k / N) * Math.PI * 2 - Math.PI / 2;
      const s = this.slotEl(e, 'w' + (k === this.hot ? ' hot' : '') + (k === b.selIdx ? ' on' : ''));
      s.style.left = `calc(50% + ${Math.cos(a).toFixed(3)} * var(--wr) - var(--ws) / 2)`;
      s.style.top = `calc(50% + ${Math.sin(a).toFixed(3)} * var(--wr) - var(--ws) / 2)`;
      s.onclick = (ev) => { ev.stopPropagation(); if (e.locked) { this.game.audio.play('ui_error', { vol: 0.4 }); return; } this.hot = k; this.closeWheel(); };
      s.onpointerenter = () => { if (!e.locked) { this.hot = k; this.markHot(); } };
      this.wheel.append(s);
    });
    CATS.forEach((c, k) => {
      const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
      const btn = el('button', { class: 'hm-wcat' + (b.tab === c.id ? ' on' : ''), title: c.name, onclick: (ev) => { ev.stopPropagation(); b.setTab(c.id); this.hot = b.selIdx; this.renderWheel(); } }, [el('img', { class: 'pix', src: iconOf(c.icon), alt: '' })]);
      btn.style.left = `calc(50% + ${Math.cos(a).toFixed(3)} * var(--wc) - var(--wcs) / 2)`;
      btn.style.top = `calc(50% + ${Math.sin(a).toFixed(3)} * var(--wc) - var(--wcs) / 2)`;
      this.wheel.append(btn);
    });
    const e = list[this.hot];
    this.wheel.append(el('b', { class: 'hm-wname' }, e ? nameOf(e.id) : ''));
  }
  markHot() {
    const list = this.b.entries();
    this.wheel.querySelectorAll('.hm-slot').forEach((s, k) => s.classList.toggle('hot', k === this.hot));
    const nm = this.wheel.querySelector('.hm-wname');
    if (nm) nm.textContent = list[this.hot] ? nameOf(list[this.hot].id) : '';
  }
  /** Mouse flicks while the pointer is locked steer the wheel's pick (dx, dy in CSS px). */
  steer(dx, dy) {
    if (!this.open || (!dx && !dy)) return;
    const f = this.flick;
    f.x = (f.x + dx) * 0.92; f.y = (f.y + dy) * 0.92;
    const L = Math.hypot(f.x, f.y);
    if (L < 18) return;
    if (L > 80) { f.x *= 80 / L; f.y *= 80 / L; }
    const list = this.b.entries(), N = list.length;
    if (!N) return;
    let a = Math.atan2(f.y, f.x) + Math.PI / 2;
    if (a < 0) a += Math.PI * 2;
    let k = Math.round((a / (Math.PI * 2)) * N) % N;
    if (list[k]?.locked) return;
    if (k !== this.hot) { this.hot = k; this.markHot(); this.game.audio.play('ui_click', { vol: 0.25, pitch: 1.4 }); }
  }
}

// ------------------------------------------------------------------ the blows
const WOODY = [0.66, 0.46, 0.26], STONY = [0.62, 0.6, 0.56], BRICKY = [0.68, 0.34, 0.22], NAILS = [0.78, 0.8, 0.84];
/** How many strikes and how quick, from the piece, the Building skills and the Building level. */
export function blowPlan(state, id, kind = 'new') {
  const f = FURNITURE[id] || {};
  const sp = state.skill?.('bspeed') || 1, lv = state.skillLevel?.('building') || 1;
  let n = kind === 'move' ? 1 : f.blows || (kind === 'new' ? 2 : 3);
  n = Math.max(1, Math.round(n / sp) - (lv >= 10 ? 2 : lv >= 5 ? 1 : 0));
  const gap = Math.max(0.07, (0.17 / Math.sqrt(sp)) * (1 - Math.min(0.3, (lv - 1) * 0.02)));
  return { n, gap };
}

export async function hammerIn(build, rec, { kind = 'new' } = {}) {
  const s = build.s, st = build.game.state, au = build.game.audio, o = rec?.obj;
  if (!o) return;
  const id = rec.p.id, { n, gap } = blowPlan(st, id, kind);
  const mats = Object.keys(FURNITURE[id]?.made || {});
  const col = mats.some((m) => /brick/.test(m)) ? BRICKY : mats.some((m) => /cobble|stone/.test(m)) ? STONY : WOODY;
  const stoneish = col !== WOODY;
  const cx = rec.cx * T, cz = rec.cz * T, rx = rec.fw * T / 2, rz = rec.fd * T / 2, top = Math.max(0.12, rec.bbox.max.y);
  const step = (k) => 0.22 + 0.78 * k;
  build.job = { rec };
  o.scale.set(1, step(0), 1);
  for (let i = 1; i <= n; i++) {
    if (build.gone) return;
    s.rig.vm?.swing?.('hammer', gap);
    au.play('whoosh', { vol: 0.08, pitch: 1.5 });
    await s.tween(gap * 0.5, () => {});
    // the strike lands
    s.rig.vm?.impact?.('hammer', 0.55);
    s.rig.shake?.(0.05);
    au.play('hit', { snd: stoneish ? 'stone' : 'wood', vol: 0.55, pitch: 0.9 + i * 0.06 });
    if (!stoneish) au.play('clang', { pitch: 2.4 + Math.random() * 0.4, vol: 0.12 });
    else au.play('chisel', { vol: 0.3 });
    const y = top * step(i / n);
    try {
      s.fx.chips(cx + (Math.random() - 0.5) * rx, y, cz + (Math.random() - 0.5) * rz, 5, col, [0, 0.4, 0]);
      if (!stoneish) s.fx.chips(cx, y, cz, 2, NAILS, [0, 0.6, 0]);
      s.fx.dust(cx, 0.04, cz, 5, [0.6, 0.5, 0.38], Math.max(rx, rz) * 0.8);
      if (i === n) s.fx.glints(cx, y, cz, [1, 0.95, 0.7]);
    } catch (e) { /* no particles here */ }
    const from = step((i - 1) / n), to = step(i / n);
    await s.tween(gap * 0.5, (t) => {
      const e = 1 - Math.pow(1 - t, 3), sy = from + (to - from) * e + Math.sin(t * Math.PI) * 0.06;
      o.scale.set(1 + Math.sin(t * Math.PI) * 0.05, sy, 1 + Math.sin(t * Math.PI) * 0.05);
    });
  }
  o.scale.set(1, 1, 1);
  build.job = null;
  build.pop(rec);
}

/** Knocking a piece down: a couple of quick strikes' worth of bits where it stood. */
export function knockDown(build, p, rec) {
  const s = build.s, au = build.game.audio;
  s.rig.vm?.swing?.('hammer', 0.14);
  setTimeout(() => s.rig.vm?.impact?.('hammer', 0.6), 70);
  au.play('hit', { snd: 'wood', vol: 0.6 });
  au.play('remove');
  if (!rec) return;
  const cx = rec.cx * T, cz = rec.cz * T, top = Math.max(0.1, rec.bbox.max.y);
  try { for (let k = 0; k < 3; k++) s.fx.chips(cx, top * (0.3 + k * 0.3), cz, 6, WOODY, [0, 0.3, 0]); s.fx.dust(cx, 0.05, cz, 10, [0.55, 0.45, 0.34], 0.2); } catch (e) { /* noop */ }
}

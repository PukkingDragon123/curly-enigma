// Slot grids and the drag & drop engine for the backpack, the coop and the trunk.
//
// Pointer events cover mouse, pen and touch alike:
//   drag a stack            move it (merge into the same item, swap with another, fill a gap)
//   right-click / long-press  take half the stack into your paw (then tap or click a slot to put
//                           it down; right-click a slot puts down one; dragging on carries it)
//   click / tap             pick it (the paper tag with details and actions)
//   double-click / double-tap / shift-click   send the stack to the other open container
//   drop on the toss pit    throw it away; drop on Nugget's bowl to feed her
// Slots are <button class="inv-slot" data-c="bag" data-i="3">. Nothing changes until a drop
// lands (Inv.transfer moves the units in one go), so nothing can be lost mid-drag.
import { el } from '../core/util.js';
import { iconURL, weaponIconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { gradeFor } from '../data/weapons.js';
import * as Inv from '../core/inventory.js';
import { qColor, pips } from './common.js';

/** Icon URL for a stack. */
export function stackIcon(s) {
  if (!s) return '';
  if (s.w) return weaponIconURL(s.w.type, s.w.metal, s.w.infusion);
  return iconURL(s.id);
}
/** Display name for a stack. */
export function stackName(s) { return !s ? '' : s.w ? s.w.name : ITEMS[s.id]?.name || s.id; }

/**
 * Build one slot button. opts: { c (container key), i, locked (sewn shut), lockLabel, hide (units
 * held in the paw from this slot), sel }.
 */
export function slotEl(s, o = {}) {
  const b = el('button', { class: 'inv-slot ' + (o.frame || '') + (o.locked ? ' sewn' : '') + (s ? '' : ' empty') + (o.sel ? ' on' : ''), 'data-c': o.c, 'data-i': String(o.i), type: 'button', tabindex: o.locked ? -1 : 0 });
  if (o.locked) {
    b.disabled = true;
    b.setAttribute('aria-label', 'A pocket sewn shut' + (o.lockLabel ? ` (${o.lockLabel})` : ''));
    if (o.lockLabel) b.append(el('span', { class: 'inv-lock' }, o.lockLabel));
    return b;
  }
  if (!s) { b.setAttribute('aria-label', 'Empty'); return b; }
  const n = Inv.stackN(s) - (o.hide || 0);
  if (n <= 0) { b.classList.add('empty', 'ghosted'); b.setAttribute('aria-label', 'Empty'); return b; }
  const img = el('img', { class: 'pix', src: stackIcon(s), alt: '', draggable: 'false' });
  b.append(img);
  if (s.w) {
    const g = gradeFor(s.w.score);
    b.append(el('span', { class: 'grade', style: { color: g.color } }, s.w.grade));
  } else if (s.lots) {
    const q = Inv.stackQ(s);
    b.append(pips(q, Inv.stackPristine(s)));
    b.style.setProperty('--qc', qColor(q));
    b.classList.add('q');
  }
  if (n > 1) b.append(el('span', { class: 'n' }, String(n)));
  if (o.hide) b.classList.add('ghosted');
  b.setAttribute('aria-label', `${stackName(s)}${n > 1 ? ' ×' + n : ''}${s.lots ? `, quality ${Inv.stackQ(s)}%` : ''}`);
  return b;
}

/** A little bounce on a slot (after a drop). */
export function bounce(node, cls = 'pop') {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

const LONG_MS = 430;

/**
 * The drag & drop engine. ctx:
 *   root                the element slots live in (events are delegated)
 *   slots(c)            → the slot array of container c ('bag' | 'coop' | 'trunk')
 *   cap(c)              → how many slots of c can be used (Infinity = grows)
 *   other(c)            → the container a quick-move sends to (or null)
 *   move(c, i, d, j, k) → do the transfer (returns units moved)
 *   toss(c, i, k), feed(c, i)      drop targets ([data-drop="toss" | "feed"])
 *   select(c, i, node)  a click / tap
 *   hover(c, i, node, e) | hover(null)   mouse hover (tooltips)
 *   changed()           re-render
 *   sfx(name)           'lift' | 'drop' | 'merge' | 'swap' | 'split' | 'nope' | 'one'
 */
export class SlotDnD {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = ctx.root;
    this.drag = null; // a press that may become a drag
    this.hand = null; // { c, i, k } units held in the paw (still in their slot until dropped)
    this.ghost = el('div', { class: 'inv-ghost', hidden: true, 'aria-hidden': 'true' }, [el('img', { class: 'pix', alt: '' }), el('span', { class: 'n' })]);
    document.body.append(this.ghost);
    this.lastTap = { t: 0, key: '' };
    this.on = [];
    const add = (t, type, fn, o) => { t.addEventListener(type, fn, o); this.on.push(() => t.removeEventListener(type, fn, o)); };
    add(this.root, 'pointerdown', (e) => this.down(e));
    add(window, 'pointermove', (e) => this.move(e), { passive: false });
    add(window, 'pointerup', (e) => this.up(e));
    add(window, 'pointercancel', (e) => this.cancelPress(e));
    add(this.root, 'contextmenu', (e) => e.preventDefault());
    add(this.root, 'pointerover', (e) => this.over(e));
    add(this.root, 'pointerleave', () => ctx.hover?.(null));
    add(this.root, 'keydown', (e) => this.key(e));
  }

  slotOf(node) {
    const b = node?.closest?.('.inv-slot');
    if (!b || !this.root.contains(b) || b.disabled) return null;
    return { c: b.dataset.c, i: +b.dataset.i, node: b };
  }
  stack(c, i) { return this.ctx.slots(c)?.[i] || null; }
  /** Units of slot (c, i) held in the paw (they still sit in the slot until dropped). */
  heldFrom(c, i) { return this.hand && this.hand.c === c && this.hand.i === i ? this.hand.k : 0; }

  down(e) {
    if (e.button > 2 || (e.pointerType === 'mouse' && e.button === 1)) return;
    this.ctx.hover?.(null);
    const s = this.slotOf(e.target);
    const dropT = e.target.closest?.('[data-drop]');
    // with something in the paw, a click or tap puts it down
    if (this.hand) {
      e.preventDefault();
      if (s) {
        const k = e.button === 2 ? 1 : this.hand.k;
        this.place(s.c, s.i, k, s.node);
      } else if (dropT) this.dropOnTarget(dropT, this.hand.c, this.hand.i, this.hand.k);
      else if (!e.target.closest('.inv-ghost')) this.cancelHand();
      return;
    }
    if (!s) return;
    const st = this.stack(s.c, s.i);
    if (!st) return;
    e.preventDefault();
    const n = Inv.stackN(st);
    this.drag = { ...s, pid: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, k: e.button === 2 ? Math.ceil(n / 2) : n, right: e.button === 2, touch: e.pointerType !== 'mouse', started: false, long: false, shift: e.shiftKey };
    if (this.drag.touch && n > 1) {
      this.drag.longT = setTimeout(() => {
        const d = this.drag;
        if (!d || d.started) return;
        d.long = true;
        d.k = Math.ceil(n / 2);
        this.ctx.sfx?.('split');
        bounce(d.node, 'squish');
        navigator.vibrate?.(12);
      }, LONG_MS);
    }
  }

  move(e) {
    const d = this.drag;
    if (this.hand && !d) { this.showGhost(e.clientX, e.clientY); this.highlight(e.clientX, e.clientY); return; }
    if (!d || e.pointerId !== d.pid) return;
    d.x = e.clientX; d.y = e.clientY;
    const dist = Math.hypot(d.x - d.x0, d.y - d.y0);
    if (!d.started && dist > (d.touch ? 9 : 5)) {
      clearTimeout(d.longT);
      d.started = true;
      this.hand = { c: d.c, i: d.i, k: d.k, dragging: true };
      this.ctx.hover?.(null);
      this.ctx.sfx?.('lift');
      this.ctx.changed();
      this.ghostFor(this.stack(d.c, d.i), d.k);
    }
    if (d.started) {
      e.preventDefault();
      this.showGhost(d.x, d.y, (d.x - (d.px ?? d.x)));
      d.px = d.x;
      this.highlight(d.x, d.y);
    }
  }

  up(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    clearTimeout(d.longT);
    this.drag = null;
    if (d.started) {
      // a drag ends where the pointer is
      const tgt = document.elementFromPoint(e.clientX, e.clientY);
      const s = this.slotOf(tgt);
      const dropT = tgt?.closest?.('[data-drop]');
      const h = this.hand;
      this.hand = null;
      this.clearHighlight();
      if (s && h) { this.hand = h; this.place(s.c, s.i, h.k, s.node); this.hand = null; }
      else if (dropT && h) this.dropOnTarget(dropT, h.c, h.i, h.k);
      else { this.ctx.sfx?.('nope'); this.flyBack(h); }
      this.hideGhost();
      this.ctx.changed();
      return;
    }
    // no drag: a click / tap / long-press / right-click
    if (d.long || d.right) {
      // half the stack into the paw
      this.hand = { c: d.c, i: d.i, k: d.k };
      this.ghostFor(this.stack(d.c, d.i), d.k);
      this.showGhost(e.clientX, e.clientY);
      if (d.right) this.ctx.sfx?.('split');
      this.ctx.changed();
      return;
    }
    const key = d.c + ':' + d.i;
    const now = performance.now();
    if ((now - this.lastTap.t < 330 && this.lastTap.key === key) || d.shift) {
      this.lastTap = { t: 0, key: '' };
      this.quick(d.c, d.i);
      return;
    }
    this.lastTap = { t: now, key };
    this.ctx.select?.(d.c, d.i, d.node);
  }

  cancelPress(e) {
    const d = this.drag;
    if (!d || (e && e.pointerId !== d.pid)) return;
    clearTimeout(d.longT);
    this.drag = null;
    if (d.started) { this.flyBack(this.hand); this.hand = null; this.hideGhost(); this.clearHighlight(); this.ctx.changed(); }
  }

  /** Put k units from the paw on slot (c, i). */
  place(c, i, k, node) {
    const h = this.hand;
    if (!h) return;
    const src = this.stack(h.c, h.i);
    const dst = this.stack(c, i);
    if (!src) { this.cancelHand(); return; }
    if (h.c === c && h.i === i) { this.cancelHand(); return; }
    const whole = h.k >= Inv.stackN(src) && k >= h.k;
    const kind = !dst ? 'drop' : Inv.sameKind(src, dst) ? 'merge' : 'swap';
    if (kind === 'swap' && !whole) { this.ctx.sfx?.('nope'); bounce(node, 'shake'); return; }
    const moved = this.ctx.move(h.c, h.i, c, i, k);
    if (moved <= 0) { this.ctx.sfx?.('nope'); bounce(node, 'shake'); return; }
    this.ctx.sfx?.(k === 1 && h.k > 1 ? 'one' : kind);
    h.k -= moved;
    if (h.k <= 0 || kind === 'swap' || !this.stack(h.c, h.i)) { this.hand = null; this.hideGhost(); }
    else this.ghostFor(this.stack(h.c, h.i), h.k);
    this.ctx.changed();
    bounce(this.root.querySelector(`.inv-slot[data-c="${c}"][data-i="${i}"]`));
  }

  dropOnTarget(t, c, i, k) {
    const what = t.dataset.drop;
    this.hand = null;
    this.hideGhost();
    if (what === 'toss') this.ctx.toss?.(c, i, k, t);
    else if (what === 'feed') this.ctx.feed?.(c, i, t);
    else if (what === 'side') {
      const d = t.dataset.c;
      const moved = this.ctx.move(c, i, d, -1, k);
      this.ctx.sfx?.(moved > 0 ? 'drop' : 'nope');
    }
    this.clearHighlight();
    this.ctx.changed();
  }

  /** Double-click / shift-click: send the whole stack to the other container. */
  quick(c, i) {
    const to = this.ctx.other?.(c);
    if (!to) { const s = this.slotOf(this.root.querySelector(`.inv-slot[data-c="${c}"][data-i="${i}"]`)); if (s) this.ctx.select?.(c, i, s.node); return; }
    const st = this.stack(c, i);
    if (!st) return;
    const moved = this.ctx.move(c, i, to, -1, Infinity);
    this.ctx.sfx?.(moved > 0 ? 'drop' : 'nope');
    this.ctx.changed();
    if (moved > 0) {
      const last = [...this.root.querySelectorAll(`.inv-slot[data-c="${to}"]`)].find((n) => !n.classList.contains('empty') && n.querySelector('img')?.src === stackIcon(st));
      bounce(last);
    }
  }

  cancelHand() {
    if (!this.hand) return false;
    this.flyBack(this.hand);
    this.hand = null;
    this.hideGhost();
    this.clearHighlight();
    this.ctx.changed();
    return true;
  }

  key(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const s = this.slotOf(e.target);
    if (!s) return;
    e.preventDefault();
    if (this.hand) this.place(s.c, s.i, this.hand.k, s.node);
    else if (e.shiftKey) this.quick(s.c, s.i);
    else this.ctx.select?.(s.c, s.i, s.node);
  }

  over(e) {
    if (this.drag || this.hand || e.pointerType !== 'mouse') return;
    const s = this.slotOf(e.target);
    if (s && this.stack(s.c, s.i)) this.ctx.hover?.(s.c, s.i, s.node, e);
    else this.ctx.hover?.(null);
  }

  // ---- the floating stack in the paw
  ghostFor(s, k) {
    if (!s) return;
    const [img, n] = this.ghost.children;
    img.src = stackIcon(s);
    n.textContent = k > 1 ? String(k) : '';
    this.ghost.hidden = false;
    this.ghost.classList.toggle('touch', !!this.drag?.touch);
    bounce(this.ghost, 'grab');
  }
  showGhost(x, y, vx = 0) {
    if (this.ghost.hidden) return;
    const tilt = Math.max(-14, Math.min(14, vx * 0.8));
    this.ghost.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) rotate(${tilt.toFixed(1)}deg)`;
  }
  hideGhost() { this.ghost.hidden = true; }
  flyBack(h) {
    if (!h) return;
    const node = this.root.querySelector(`.inv-slot[data-c="${h.c}"][data-i="${h.i}"]`);
    bounce(node);
  }
  highlight(x, y) {
    this.ghost.hidden = this.ghost.hidden || false;
    const prevVis = this.ghost.style.visibility;
    this.ghost.style.visibility = 'hidden';
    const t = document.elementFromPoint(x, y);
    this.ghost.style.visibility = prevVis;
    const node = t?.closest?.('.inv-slot:not([disabled]), [data-drop]');
    if (node === this.hot) return;
    this.hot?.classList.remove('over');
    this.hot = node && this.root.contains(node) ? node : null;
    this.hot?.classList.add('over');
  }
  clearHighlight() { this.hot?.classList.remove('over'); this.hot = null; }

  destroy() {
    clearTimeout(this.drag?.longT);
    for (const off of this.on) off();
    this.ghost.remove();
  }
}

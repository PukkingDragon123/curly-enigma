// Slots and the drag & drop engine for the backpack, its belt row, the trunk and the chests
// (Minecraft-like). Pointer events cover mouse, pen and touch alike:
//   mouse   click a stack: it's in your paw (its tag opens); click a slot: put it all down (merge,
//           fill, or swap: the other stack is in your paw then); right-click: half into the paw,
//           or one put down; drag: carry it there; shift-click: to the belt / back into the pack
//           (or to the trunk when it's open); hover + 1–9: swap with that belt slot; drag or click
//           it outside the pack: dropped out
//   touch   tap: pick it (the tag with details and actions); long-press (or press and drag): carry
//           it; double-tap: the quick move
// Something that won't go where you put it springs back and the slot shakes red.
// Slots are <button class="inv-slot" data-c="bag" data-i="3">. Nothing changes until a drop lands
// (core/inventory.js transfer moves the units in one go), so nothing can be lost mid-drag.
import { el } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { gradeFor } from '../data/weapons.js';
import * as Inv from '../core/inventory.js';
import { KIND_ICON, KIND_LABEL } from '../core/hotbar.js';
import { itemVox } from './itemVox.js';
import { qColor, pips } from './common.js';

/** Icon URL for a stack (a belt tool: its sample item). */
export function stackIcon(s) {
  if (!s) return '';
  if (s.tool) return itemVox.src(KIND_ICON[s.tool] || 'pick_rusty');
  return itemVox.stack(s); // in 3D, as voxels (itemVox.js): the flat icon until its still is made
}
/** Display name for a stack. */
export function stackName(s) { return !s ? '' : s.tool ? KIND_LABEL[s.tool] || s.tool : s.w ? s.w.name : ITEMS[s.id]?.name || s.id; }

/**
 * Build one slot button. opts: { c (container key), i, frame ('pocket' | 'loop' | 'trunk'),
 * locked (sewn shut), lockLabel, hide (units held in the paw from this slot), sel, key (a number
 * on a belt slot), refIcon(kind) (a belt tool's icon), refOff(kind) (that tool isn't owned) }.
 */
export function slotEl(s, o = {}) {
  const b = el('button', { class: 'inv-slot ' + (o.frame || '') + (o.locked ? ' sewn' : '') + (s ? '' : ' empty') + (o.sel ? ' on' : ''), 'data-c': o.c, 'data-i': String(o.i), type: 'button', tabindex: o.locked ? -1 : 0 });
  if (o.key) b.append(el('i', { class: 'k' }, o.key));
  if (o.locked) {
    b.disabled = true;
    b.setAttribute('aria-label', 'A pocket sewn shut' + (o.lockLabel ? ` (${o.lockLabel})` : ''));
    if (o.lockLabel) b.append(el('span', { class: 'inv-lock' }, o.lockLabel));
    return b;
  }
  if (!s) { b.setAttribute('aria-label', o.key ? `Belt ${o.key}: empty` : 'Empty'); return b; }
  if (s.tool) {
    // a tool from the rack hung on the belt (a reference: the tool itself stays on the rack)
    const ghosted = (o.hide || 0) > 0;
    b.classList.add('ref');
    if (ghosted) b.classList.add('ghosted');
    if (o.refOff?.(s.tool)) b.classList.add('off');
    b.append(el('img', { class: 'pix', src: o.refIcon?.(s.tool) || stackIcon(s), alt: '', draggable: 'false' }));
    b.setAttribute('aria-label', (o.key ? `Belt ${o.key}: ` : '') + stackName(s));
    return b;
  }
  const n = Inv.stackN(s) - (o.hide || 0);
  if (n <= 0) { b.classList.add('empty', 'ghosted'); b.setAttribute('aria-label', 'Empty'); return b; }
  const img = el('img', { class: 'pix', src: stackIcon(s), alt: '', draggable: 'false' });
  b.append(img);
  if (s.w) {
    const g = gradeFor(s.w.score);
    b.classList.add('blade');
    b.append(el('span', { class: 'grade', style: { color: g.color } }, s.w.grade));
  } else if (s.lots) {
    const q = Inv.stackQ(s);
    b.append(pips(q, Inv.stackPristine(s)));
    b.style.setProperty('--qc', qColor(q));
    b.classList.add('q');
  }
  if (n > 1) b.append(el('span', { class: 'n' }, String(n)));
  if (o.hide) b.classList.add('ghosted');
  b.setAttribute('aria-label', `${o.key ? `Belt ${o.key}: ` : ''}${stackName(s)}${n > 1 ? ' ×' + n : ''}${s.lots ? `, quality ${Inv.stackQ(s)}%` : ''}`);
  return b;
}

/** A little bounce on a slot (after a drop). */
export function bounce(node, cls = 'pop') {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

const LONG_MS = 380;

/**
 * The drag & drop engine. ctx:
 *   root                the element slots live in (events are delegated)
 *   slots(c)            → the slot array of container c
 *   cap(c)              → how many slots of c can be used (Infinity = grows)
 *   other(c)            → the container a quick move sends to (or null)
 *   move(c, i, d, j, k) → do the transfer (returns units moved)
 *   quick(c, i)         optional: the quick move itself (returns units moved)
 *   outside(c, i, k)    optional: dropped outside the root (else it springs back)
 *   numKey(c, i, n)     optional: 1–9 pressed over a slot
 *   toss(c, i, k)       the drop target [data-drop="toss"]
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
    this.hoverSlot = null;
    this.on = [];
    const add = (t, type, fn, o) => { t.addEventListener(type, fn, o); this.on.push(() => t.removeEventListener(type, fn, o)); };
    add(this.root, 'pointerdown', (e) => this.down(e));
    add(window, 'pointerdown', (e) => this.downOutside(e), true);
    add(window, 'pointermove', (e) => this.move(e), { passive: false });
    add(window, 'pointerup', (e) => this.up(e));
    add(window, 'pointercancel', (e) => this.cancelPress(e));
    add(this.root, 'contextmenu', (e) => e.preventDefault());
    add(this.root, 'pointerover', (e) => this.over(e));
    add(this.root, 'pointerleave', () => { this.hoverSlot = null; ctx.hover?.(null); });
    add(this.root, 'keydown', (e) => this.key(e));
    add(window, 'keydown', (e) => this.digit(e), true);
  }

  slotOf(node) {
    const b = node?.closest?.('.inv-slot');
    if (!b || !this.root.contains(b) || b.disabled) return null;
    return { c: b.dataset.c, i: +b.dataset.i, node: b };
  }
  stack(c, i) { return this.ctx.slots(c)?.[i] || null; }
  nodeOf(c, i) { return this.root.querySelector(`.inv-slot[data-c="${c}"][data-i="${i}"]`); }
  /** Units of slot (c, i) held in the paw (they still sit in the slot until dropped). */
  heldFrom(c, i) { return this.hand && this.hand.c === c && this.hand.i === i ? this.hand.k : 0; }
  /** "No": the slot shakes red, what you hold springs back. */
  nope(node) { this.ctx.sfx?.('nope'); bounce(node, 'shake'); if (this.ghost && !this.ghost.hidden) bounce(this.ghost, 'nope'); }

  down(e) {
    if (e.button > 2 || (e.pointerType === 'mouse' && e.button === 1)) return;
    this.ctx.hover?.(null);
    const s = this.slotOf(e.target);
    const dropT = e.target.closest?.('[data-drop]');
    // with something in the paw, a click or tap puts it down
    if (this.hand) {
      if (s) {
        e.preventDefault();
        if (s.c === this.hand.c && s.i === this.hand.i && e.button !== 2) { this.cancelHand(); return; }
        this.place(s.c, s.i, e.button === 2 ? 1 : this.hand.k, s.node, true);
      } else if (dropT) { e.preventDefault(); this.dropOnTarget(dropT, this.hand.c, this.hand.i, this.hand.k); }
      else if (!e.target.closest('.inv-ghost')) this.cancelHand();
      return;
    }
    if (!s) return;
    const st = this.stack(s.c, s.i);
    if (!st) return;
    e.preventDefault();
    const n = Inv.stackN(st);
    this.drag = { ...s, pid: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, k: e.button === 2 ? Math.ceil(n / 2) : n, right: e.button === 2, touch: e.pointerType !== 'mouse', started: false, long: false, shift: e.shiftKey };
    if (this.drag.touch) {
      // a long press lifts the whole stack (then drag it, or tap where it goes)
      this.drag.longT = setTimeout(() => {
        const d = this.drag;
        if (!d || d.started) return;
        d.long = true;
        this.ctx.sfx?.('lift');
        bounce(d.node, 'squish');
        navigator.vibrate?.(12);
      }, LONG_MS);
    }
  }
  /** A click outside the pack with something in the paw: it drops out (the backdrop doesn't close). */
  downOutside(e) {
    if (!this.hand || this.drag || e.target !== this.root.closest('.modal-back')) return;
    e.stopPropagation();
    e.preventDefault();
    const h = this.hand;
    this.hand = null;
    this.hideGhost();
    this.clearHighlight();
    if (this.ctx.outside) this.ctx.outside(h.c, h.i, h.k);
    else this.flyBack(h);
    this.ctx.changed();
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
      this.ghost.style.visibility = 'hidden';
      const tgt = document.elementFromPoint(e.clientX, e.clientY);
      this.ghost.style.visibility = '';
      const s = this.slotOf(tgt);
      const dropT = tgt?.closest?.('[data-drop]');
      const inside = tgt && this.root.contains(tgt);
      const h = this.hand;
      this.clearHighlight();
      if (s && h) { if (s.c === h.c && s.i === h.i) { this.hand = null; this.flyBack(h); } else this.place(s.c, s.i, h.k, s.node, false); this.hand = null; }
      else if (dropT && h) this.dropOnTarget(dropT, h.c, h.i, h.k);
      else if (!inside && h && this.ctx.outside) { this.hand = null; this.ctx.outside(h.c, h.i, h.k); }
      else { this.hand = null; this.flyBack(h); }
      this.hand = null;
      this.hideGhost();
      this.ctx.changed();
      return;
    }
    // no drag: a click / tap / long-press / right-click
    if (d.long || d.right || (!d.touch && !d.shift)) {
      // into the paw: the whole stack (a click, a long press) or half of it (right-click)
      this.hand = { c: d.c, i: d.i, k: d.k };
      this.ghostFor(this.stack(d.c, d.i), d.k);
      this.showGhost(e.clientX, e.clientY);
      this.ctx.sfx?.(d.right ? 'split' : 'lift');
      if (!d.touch && !d.right) this.ctx.select?.(d.c, d.i, d.node, true);
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

  /** Put k units from the paw on slot (c, i). click: a Minecraft click (a swapped stack stays in the paw). */
  place(c, i, k, node, click = false) {
    const h = this.hand;
    if (!h) return;
    const src = this.stack(h.c, h.i);
    const dst = this.stack(c, i);
    if (!src) { this.cancelHand(); return; }
    if (h.c === c && h.i === i) { this.cancelHand(); return; }
    const whole = h.k >= Inv.stackN(src) && k >= h.k;
    const kind = !dst || dst.tool ? 'drop' : Inv.sameKind(src, dst) ? 'merge' : 'swap';
    if (kind === 'swap' && !whole) { this.nope(node); return; }
    const moved = this.ctx.move(h.c, h.i, c, i, k);
    if (moved <= 0) { this.nope(node); return; }
    this.ctx.sfx?.(k === 1 && h.k > 1 ? 'one' : kind);
    h.k -= moved;
    const left = this.stack(h.c, h.i);
    if (kind === 'swap' && click && left) {
      // what was there is in your paw now (it waits in the slot yours came from)
      this.hand = { c: h.c, i: h.i, k: Inv.stackN(left) };
      this.ghostFor(left, this.hand.k);
    } else if (h.k <= 0 || kind === 'swap' || !left) { this.hand = null; this.hideGhost(); }
    else this.ghostFor(left, h.k);
    this.ctx.changed();
    bounce(this.nodeOf(c, i));
  }

  dropOnTarget(t, c, i, k) {
    const what = t.dataset.drop;
    this.hand = null;
    this.hideGhost();
    if (what === 'toss') this.ctx.toss?.(c, i, k, t);
    else if (what === 'side') {
      const d = t.dataset.c;
      const moved = this.ctx.move(c, i, d, -1, k);
      this.ctx.sfx?.(moved > 0 ? 'drop' : 'nope');
    }
    this.clearHighlight();
    this.ctx.changed();
  }

  /** Shift-click / double-tap: the quick move (belt ↔ pack, or to the other open container). */
  quick(c, i) {
    const st = this.stack(c, i);
    if (!st) return;
    let moved = 0;
    if (this.ctx.quick) moved = this.ctx.quick(c, i);
    else {
      const to = this.ctx.other?.(c);
      if (!to) { this.ctx.select?.(c, i, this.nodeOf(c, i)); return; }
      moved = this.ctx.move(c, i, to, -1, Infinity);
    }
    if (moved > 0) this.ctx.sfx?.('drop'); else this.nope(this.nodeOf(c, i));
    this.ctx.changed();
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
    if (this.hand) this.place(s.c, s.i, this.hand.k, s.node, true);
    else if (e.shiftKey) this.quick(s.c, s.i);
    else this.ctx.select?.(s.c, s.i, s.node);
  }
  /** 1–9 over a slot: swap it with that belt slot (Minecraft). */
  digit(e) {
    const m = /^Digit([1-9])$/.exec(e.code || '');
    if (!m || !this.ctx.numKey || !this.root.isConnected) return;
    const s = this.hoverSlot && this.hoverSlot.node.isConnected ? this.hoverSlot : this.slotOf(document.activeElement);
    if (!s || this.hand || this.drag) return;
    e.preventDefault();
    e.stopPropagation();
    this.ctx.numKey(s.c, s.i, +m[1]);
  }

  over(e) {
    const s = this.slotOf(e.target);
    this.hoverSlot = s;
    if (this.drag || this.hand || e.pointerType !== 'mouse') return;
    if (s && this.stack(s.c, s.i)) this.ctx.hover?.(s.c, s.i, s.node, e);
    else this.ctx.hover?.(null);
  }

  // ---- the floating stack in the paw
  ghostFor(s, k, quiet = false) {
    if (!s) return;
    const [img, n] = this.ghost.children;
    img.src = stackIcon(s);
    n.textContent = k > 1 ? String(k) : '';
    this.ghost.hidden = false;
    this.ghost.classList.toggle('touch', !!this.drag?.touch);
    this.ghost.classList.toggle('blade', !!s.w);
    this.ctx.held?.(true);
    if (!quiet) bounce(this.ghost, 'grab');
  }
  showGhost(x, y, vx = 0) {
    this.lastPt = { x, y };
    if (this.ghost.hidden) return;
    const tilt = Math.max(-14, Math.min(14, vx * 0.8));
    this.ghost.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) rotate(${tilt.toFixed(1)}deg)`;
  }
  hideGhost() { this.ghost.hidden = true; this.ctx.held?.(false); }
  flyBack(h) {
    if (!h) return;
    bounce(this.nodeOf(h.c, h.i));
  }
  highlight(x, y) {
    this.lastPt = { x, y };
    const prevVis = this.ghost.style.visibility;
    this.ghost.style.visibility = 'hidden';
    const t = document.elementFromPoint(x, y);
    this.ghost.style.visibility = prevVis;
    const node = t?.closest?.('.inv-slot:not([disabled]), [data-drop]');
    const out = !!this.hand && !!t && !this.root.contains(t) && !!this.ctx.outside;
    this.ghost.classList.toggle('out', out);
    if (node === this.hot) return;
    this.hot?.classList.remove('over');
    this.hot = node && this.root.contains(node) ? node : null;
    this.hot?.classList.add('over');
  }
  clearHighlight() {
    this.hot?.classList.remove('over');
    this.hot = null;
    this.ghost.classList.remove('out');
  }

  destroy() {
    clearTimeout(this.drag?.longT);
    for (const off of this.on) off();
    this.ghost.remove();
  }
}

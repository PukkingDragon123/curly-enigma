// What makes the Wave 9 books feel like books (shared by the Book, the Index Book, the skill tree's
// binding, the Miners' Board, the survey and the pause chronicle; art in src/ui/tomeArt.js, looks in
// src/ui/tome.css):
//  - TSFX: recorded-sample sounds (book_open/close, page, latch, brush, the skill stamp, hover)
//  - bindCover(cover): iron corner pieces and two clasps on a book's cover
//  - curlTurn(turn, dir, single): the turning page as nested strips that bend as it goes over
//  - dropCap(h, field): an illuminated initial on a heading's first letter
//  - inkIn(node, o): ink that writes itself in, a quill riding along the line
//  - margins(page, seed, o): marginalia (a doodle where the page has room, a stain, a browned edge)
//  - ribbonTabs(tabs): silk ribbon bookmarks for chapter tabs (the tab's --tc colour)
import { el, hashStr } from '../core/util.js';
import { installTomeArt, ensureTomeArt, doodleURL, DOODLE_KINDS, ribbonURL, sealURL, cssUrl, tart } from './tomeArt.js';
import './tome.css';

installTomeArt();
export { ensureTomeArt, sealURL, cssUrl, tart };

const live = (a) => a && a.ctx && a.ctx.state === 'running' && typeof a.sample === 'function';
const smp = (a, ids, o) => { try { if (live(a)) a.sample(ids, o); } catch (e) { /* no sound */ } };
let lastInk = 0, lastHover = 0;
/** The books' sounds: recordings only (src/audio/sfx via the audio system). */
export const TSFX = {
  open(a) { smp(a, 'book_open', { vol: 0.5 }); smp(a, ['latch1', 'latch2'], { vol: 0.2, pitch: 1.3, delay: 0.1 }); },
  close(a) { smp(a, 'book_close', { vol: 0.42 }); },
  turn(a) { a?.play?.('page'); },
  tab(a) { smp(a, ['page2', 'page3'], { vol: 0.2, pitch: 1.5, jit: 0.06 }); },
  ink(a) { const t = performance.now(); if (t - lastInk < 140) return; lastInk = t; smp(a, ['brush1', 'brush2', 'brush3'], { vol: 0.16, pitch: 1.35, jit: 0.08 }); },
  seal(a) { a?.play?.('sk_stamp'); },
  hover(a) { const t = performance.now(); if (t - lastHover < 70) return; lastHover = t; a?.play?.('ui_hover'); },
  clasp(a) { smp(a, ['latch1', 'latch2'], { vol: 0.28 }); },
  tick(a) { smp(a, ['tick1', 'tick2'], { vol: 0.2, pitch: 1.2 }); },
};

/** Iron corner pieces and two clasps on a book cover (idempotent). */
export function bindCover(cover, { clasps = true } = {}) {
  if (!cover || cover.querySelector(':scope > .tm-corner')) return cover;
  ensureTomeArt();
  for (let i = 0; i < 4; i++) cover.append(el('i', { class: 'tm-corner c' + i, 'aria-hidden': 'true' }));
  if (clasps) for (const k of ['a', 'b']) cover.append(el('i', { class: 'tm-clasp ' + k, 'aria-hidden': 'true' }));
  return cover;
}

/**
 * The turning page bends as it goes over: nested strips, each hinged on the one before, curl the
 * free edge ahead of the sheet as it lifts and behind it as it falls (tome.css animates them).
 */
export function curlTurn(turn, { n = 6 } = {}) {
  if (!turn) return turn;
  turn.classList.add('tm-curl');
  if (!turn.querySelector(':scope > .tm-seg')) {
    let host = turn;
    for (let k = 0; k < n; k++) {
      const s = vars(el('span', { class: 'tm-seg' }), { '--k': k, '--n': n }); // (a span: book.css styles the turn's <i> as its shade)
      host.append(s);
      host = s;
    }
  }
  const w = turn.getBoundingClientRect().width || turn.parentElement?.getBoundingClientRect().width / 2 || 0;
  turn.style.setProperty('--sw', (w / n).toFixed(2) + 'px');
  return turn;
}

/** Set CSS custom properties on a node (el()'s style object can't: Object.assign skips them). */
export function vars(node, o) { if (node) for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) node.style.setProperty(k, String(v)); return node; }

const FIELD_OK = new Set(['blue', 'red', 'green', 'purple', 'gold']);
/** An illuminated initial: the first letter (or digit) of a heading set in a gilt, filigreed square. */
export function dropCap(h, field = 'blue') {
  if (!h || h.querySelector('.tm-cap')) return h;
  ensureTomeArt();
  const walk = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const m = /[A-Za-z0-9]/.exec(n.data);
    if (!m) continue;
    const before = n.data.slice(0, m.index), ch = m[0], after = n.data.slice(m.index + 1);
    const cap = el('span', { class: 'tm-cap', 'data-f': FIELD_OK.has(field) ? field : 'blue' }, ch);
    const frag = document.createDocumentFragment();
    if (before) frag.append(before);
    frag.append(cap);
    if (after) frag.append(after);
    n.replaceWith(frag);
    h.classList.add('tm-capped');
    break;
  }
  return h;
}

/**
 * Ink that writes itself in: the node is revealed left to right (a wet, darker edge), a quill rides
 * along the line, the nib scratches. o: { audio, delay (ms), dur (ms), quill (true), host }.
 */
export function inkIn(node, o = {}) {
  if (!node || !node.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dur = o.dur ?? 760, delay = o.delay ?? 0;
  node.style.setProperty('--tm-d', dur + 'ms');
  node.style.setProperty('--tm-delay', delay + 'ms');
  node.classList.remove('tm-ink'); void node.offsetWidth; node.classList.add('tm-ink');
  const done = () => { node.classList.remove('tm-ink'); node.style.removeProperty('--tm-d'); node.style.removeProperty('--tm-delay'); };
  setTimeout(done, dur + delay + 80);
  if (o.audio) { setTimeout(() => TSFX.ink(o.audio), delay); if (dur > 500) setTimeout(() => TSFX.ink(o.audio), delay + dur * 0.55); }
  if (o.quill === false) return;
  const host = o.host || node.closest('.tm-inkhost, .ib-page, .bk-spread, .tm-host') || node.parentElement;
  if (!host || !host.animate) return;
  requestAnimationFrame(() => {
    const hr = host.getBoundingClientRect(), r = node.getBoundingClientRect();
    if (!r.width || !hr.width) return;
    const q = el('i', { class: 'tm-quill', 'aria-hidden': 'true' });
    host.append(q);
    const x0 = r.left - hr.left + host.scrollLeft, y0 = r.top - hr.top + host.scrollTop + r.height * 0.5;
    const w = Math.min(r.width, node.scrollWidth || r.width), qh = q.getBoundingClientRect().height || 40;
    const k = [];
    const N = 9;
    for (let i = 0; i <= N; i++) {
      const t = i / N, bob = (i % 2 ? -1 : 1) * Math.min(6, r.height * 0.18);
      k.push({ transform: `translate(${(x0 + w * t).toFixed(1)}px, ${(y0 - qh + bob).toFixed(1)}px) rotate(${i % 2 ? -4 : 3}deg)`, opacity: i === 0 || i === N ? 0.0 : 1, offset: t });
    }
    const a = q.animate(k, { duration: dur, delay, easing: 'linear', fill: 'both' });
    a.onfinish = () => q.remove();
    setTimeout(() => q.remove(), dur + delay + 400);
  });
}

/** A hover wiggle that also ticks (rows, sketches, seals): adds the class for one swing. */
export function wiggle(node, audio) {
  if (!node || node._tmW) return;
  node._tmW = true;
  node.classList.add('tm-wig');
  if (audio) TSFX.hover(audio);
  setTimeout(() => { node.classList.remove('tm-wig'); node._tmW = false; }, 460);
}
/** Wiggle children matching sel on pointerenter (delegated; once per element). */
export function wiggleOn(root, sel, audio) {
  if (!root || root._tmWig) return;
  root._tmWig = true;
  root.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.(sel);
    if (!t || !root.contains(t) || (e.relatedTarget && t.contains(e.relatedTarget))) return;
    wiggle(t, audio);
  });
}

/**
 * Marginalia for a page: a doodle where there's room (after the list, or in the page's empty
 * corner), a stain in a place picked by the seed. o: { kinds, list (put the doodle at the end of
 * this scroller), corner ('br' | 'bl'), stain (true) }.
 */
export function margins(page, seed = 'page', o = {}) {
  if (!page) return;
  ensureTomeArt();
  const h = typeof seed === 'number' ? seed : hashStr(String(seed));
  const kinds = o.kinds || DOODLE_KINDS;
  const kind = kinds[h % kinds.length];
  for (const d of page.querySelectorAll(':scope .tm-doodle.tm-auto')) d.remove();
  page.style.setProperty('--st-x', ((h >> 3) % 70) + 15 + '%');
  page.style.setProperty('--st-y', ((h >> 9) % 60) + 25 + '%');
  page.classList.toggle('tm-stain2', ((h >> 5) & 1) === 1);
  if (o.doodle === false) return;
  const d = el('i', { class: `tm-doodle tm-auto tm-d-${kind}`, 'aria-hidden': 'true', title: '' });
  d.style.setProperty('--d', cssUrl(doodleURL(kind)));
  if (o.list) {
    d.classList.add('tm-inlist');
    o.list.append(d);
    // (only where the list has room for it: a doodle half under the fold reads as a glitch)
    // (one that would peek half out from under the fold is left out; one wholly below it waits there)
    requestAnimationFrame(() => {
      if (!d.isConnected) return;
      const lr = o.list.getBoundingClientRect(), dr = d.getBoundingClientRect();
      if (dr.height && dr.top < lr.bottom - 1 && dr.bottom > lr.bottom + 1) d.hidden = true;
    });
    return d;
  }
  d.classList.add('tm-corner-' + (o.corner || 'br'));
  page.append(d);
  // the doodle only stays where the page has room for it (it never sits under the writing)
  requestAnimationFrame(() => {
    if (!d.isConnected) return;
    const dr = d.getBoundingClientRect();
    if (!dr.height) return;
    for (const c of page.children) {
      if (c === d || c.classList.contains('tm-doodle') || c.classList.contains('tm-quill') || getComputedStyle(c).position === 'absolute') continue;
      const cr = c.getBoundingClientRect();
      if (cr.height && cr.bottom > dr.top + 2 && cr.top < dr.bottom && cr.right > dr.left && cr.left < dr.right) { d.hidden = true; return; }
    }
  });
  return d;
}

/** Silk ribbon bookmarks for chapter tabs: each tab's --tc colour as a ribbon (9-slice art). */
export function ribbonTabs(tabs, colors) {
  if (!tabs) return;
  ensureTomeArt();
  [...tabs.children].forEach((b, i) => {
    const c = (colors && colors[i]) || b.style.getPropertyValue('--tc') || '#8a3a1a';
    const hex = c.trim().startsWith('#') ? c.trim() : '#8a3a1a';
    b.style.setProperty('--rib', cssUrl(ribbonURL(hex)));
    b.style.setProperty('--ribv', cssUrl(ribbonURL(hex, true)));
    b.classList.add('tm-rib');
  });
}

/** A wax seal (colour, size, sigil) as a CSS <image>. */
export const sealCss = (hex, size = 14, sigil = 'star') => cssUrl(sealURL(hex, size, sigil));

/** Roman numerals for figures and chapter numbers. */
export function roman(n) {
  const M = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  n = Math.max(1, Math.min(39, n | 0));
  for (const [v, r] of M) while (n >= v) { s += r; n -= v; }
  return s;
}

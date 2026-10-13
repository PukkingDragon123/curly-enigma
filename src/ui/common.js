// Small helpers shared by the interface modules.
import { el, formatGoldFull } from '../core/util.js';

export function qColor(q) {
  return q >= 90 ? '#2a9a3a' : q >= 70 ? '#5a8a2a' : q >= 45 ? '#b07a14' : '#c0402a';
}

/** Five quality pips (filled by quality), colored like qColor. */
export function pips(q, pristine = false) {
  const n = Math.max(1, Math.min(5, Math.round(q / 20)));
  const wrap = el('span', { class: 'pips', title: `Quality ${q}%`, style: { '--qc': qColor(q) } });
  wrap.style.setProperty('--qc', qColor(q));
  for (let i = 0; i < 5; i++) wrap.append(el('i', { class: i < n ? 'on' : '' }));
  if (pristine) wrap.append(el('b', { class: 'pristine', title: 'Pristine' }));
  return wrap;
}

export const gold = (n) => formatGoldFull(n);

/** Stagger helper for settle-in animations. */
export function stagger(nodes, step = 14, max = 420) {
  nodes.forEach((n, i) => n.style.setProperty('--d', Math.min(max, i * step) + 'ms'));
}

/** Pointer swipe detector (touch & pen): calls fn(dir) with -1 (swipe left) or +1 (swipe right). */
export function onSwipe(node, fn, { min = 46 } = {}) {
  let sx = 0, sy = 0, id = null, t0 = 0;
  node.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; id = e.pointerId; sx = e.clientX; sy = e.clientY; t0 = performance.now(); });
  node.addEventListener('pointerup', (e) => {
    if (e.pointerId !== id) return;
    id = null;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > min && Math.abs(dx) > Math.abs(dy) * 1.4 && performance.now() - t0 < 700) fn(dx < 0 ? -1 : 1);
  });
  node.addEventListener('pointercancel', () => { id = null; });
}

/** Element.append that skips null/false children (native append prints "null"). */
export function put(node, ...kids) {
  node.append(...kids.filter((k) => k !== null && k !== undefined && k !== false));
  return node;
}

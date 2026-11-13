// Boxless floating text (wave 9): words with no paper, plate or panel behind them, floating in the
// world. Crisp pixel letters with a strong dark outline (they read on any background, on a phone
// too); each letter its own little body that arrives with motion (rises out of a white-hot glint,
// overshoots, settles; some catch a sparkle), and that leaves by scattering into tiny voxel bits and
// embers. Shared by the cutscene talk (Convo.js: lines, the speaker's name, the answers), the hint
// line (Tutor.js), toasts and discovery notices (UI.js), the crosshair's target name
// (Crosshair.js), the held item's name (Belt.js), prompts, the control hints (Onboard.js) and
// the town's speech (UI.bubble). Styles: floatText.css (.ft and friends).
//
//   letterize(host, html)          → { cells, flat }   the markup stays (<b> <i> <em> <big> <small>
//        <span class="ft-wv"> .gold-txt, <br>, images, key caps); every letter of its text becomes a
//        span.ft-c (in a span.ft-w per word, so a word never breaks); cells[i] is the span for
//        flat[i] (null for a space). Images and key caps arrive as one "letter" each.
//   typeFloat(host, html, o)       → { done, finish(), stop() }   as talkType.typeText (same options:
//        voice, mood, audio, face, speed, delay, sound, onDone): the letters arrive one by one in the
//        speaker's voice, with a breath at the end of a sentence or a clause
//   floatIn(host, html, o)         → { cells, flat }   every letter arrives in one quick sweep
//        (o: { delay, stagger, max (s for the whole sweep) })
//   arrive(cells, i0, i1, o)       letters i0 … i1-1 arrive (a typing loop of your own)
//   leave(node, o)                 node's letters scatter into voxel bits (o.remove: then it goes)
//   ghost(node, o)                 a copy of node, where it is, scatters (node is free for the next
//        words at once); o.after: the copy goes after node in the page (default before)
//   bits(node | rect, o)           a burst of tiny voxel bits / embers from a node's letters (or a rect)
//        o: { n, colors: ['#hex', ...], rise, spread, life }
import { voiceBlip, breathAfter } from './talkType.js';
import './floatText.css';

const ATOM = new Set(['KBD', 'IMG', 'CANVAS', 'SVG', 'svg', 'PICTURE', 'VIDEO']);
const SPACE = /\s/;
const r2 = (v) => Math.round(v * 100) / 100;

/** Every letter of host's text in its own span (see above). */
export function letterize(host, html) {
  if (html !== undefined) host.innerHTML = html == null ? '' : String(html);
  const cells = [], all = [];
  let flat = '';
  let k = 0;
  const cell = (span) => {
    span.style.cssText += `--k:${k};--r:${r2(Math.random() * 2 - 1)};--q:${r2(Math.random())}`;
    if (Math.random() < 0.09) span.classList.add('gl');
    all.push(span);
    k++;
    return span;
  };
  const walk = (n) => {
    for (const ch of [...n.childNodes]) {
      if (ch.nodeType === 3) {
        const t = ch.textContent;
        if (!t) continue;
        const frag = document.createDocumentFragment();
        for (const part of t.split(/(\s+)/)) {
          if (!part) continue;
          if (SPACE.test(part[0])) {
            frag.append(document.createTextNode(part));
            for (const c of part) { cells.push(null); flat += c; }
            continue;
          }
          const w = document.createElement('span');
          w.className = 'ft-w';
          for (const c of part) {
            const s = document.createElement('span');
            s.className = 'ft-c';
            s.textContent = c;
            w.append(cell(s));
            cells.push(s);
            flat += c;
          }
          frag.append(w);
        }
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1) {
        if (ATOM.has(ch.tagName)) {
          ch.classList.add('ft-c', 'ft-atom');
          cell(ch);
          cells.push(ch);
          flat += '□';
        } else if (ch.tagName !== 'BR') walk(ch);
      }
    }
  };
  walk(host);
  host.classList.add('ft');
  // the leave sweeps left to right across the whole line in a fixed time, however long it is
  const n = Math.max(1, k - 1);
  all.forEach((c, i) => c.style.setProperty('--o', `${r2((i / n) * 0.24)}s`));
  return { cells, flat };
}

/** Letters i0 … i1-1 of letterize()'s cells arrive (with a little stagger when there are several at once). */
export function arrive(cells, i0, i1, o = {}) {
  const stagger = o.stagger ?? 0.012, max = o.max ?? 0.45, base = o.delay ?? 0;
  let j = 0;
  for (let i = i0; i < i1; i++) {
    const c = cells[i];
    if (!c || c.classList.contains('on')) continue;
    c.style.setProperty('--d', `${r2(base + Math.min(max, j * stagger))}s`);
    c.classList.add('on');
    j++;
  }
}

/** All the letters arrive in one sweep. */
export function floatIn(host, html, o = {}) {
  const L = letterize(host, html);
  arrive(L.cells, 0, L.cells.length, { stagger: o.stagger ?? 0.022, max: o.max ?? 0.6, delay: o.delay ?? 0 });
  return L;
}

/** Letters typed one by one in a voice (talkType.typeText's timing, the letters arriving as they come). */
export function typeFloat(host, html, o = {}) {
  const { cells, flat } = letterize(host, html);
  const total = flat.length;
  const speed = o.speed || 46;
  const face = o.face || null;
  let n = 0, shown = 0, pause = 0, delay = o.delay ?? 0.1, blip = 0, raf = 0, timer = 0, last = performance.now(), born = last, talking = false;
  const ctl = { done: total === 0, stop, finish, cells, flat };
  const show = (k) => { if (k > shown) { arrive(cells, shown, k, { stagger: 0.008, max: 0.3 }); shown = k; } };
  function finish() {
    if (ctl.done && !raf && !timer) return;
    show(total);
    ctl.done = true;
    if (talking) face?.talk(false);
    talking = false;
    stop();
    o.onDone?.();
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; if (timer) clearInterval(timer); timer = 0; }
  // (the wall clock, driven by frames and by a timer as well: slow or starved frames type more at once)
  const step = () => {
    const now = performance.now();
    if (!host.isConnected && now - born > 2000) { stop(); return; }
    const dt = Math.min(2.5, Math.max(0, (now - last) / 1000));
    last = now;
    let left = dt;
    for (let guard = 0; left > 0 && !ctl.done && guard < 64; guard++) {
      if (delay > 0) { const u = Math.min(delay, left); delay -= u; left -= u; continue; }
      if (pause > 0) { const u = Math.min(pause, left); pause -= u; left -= u; if (pause <= 0) { face?.talk(true); talking = true; } continue; }
      const before = Math.floor(n);
      const want = Math.min(total, n + left * speed);
      let k = Math.floor(want);
      left = 0;
      n = want;
      if (k !== before) {
        for (let i = before; i < k; i++) {
          const p = breathAfter(flat[i], flat[i + 1]);
          if (p && i + 1 < total) { left = (want - (i + 1)) / speed; k = i + 1; n = k; pause = p; face?.talk(false); talking = false; break; }
        }
        show(k);
        if (!talking && pause <= 0) { face?.talk(true); talking = true; }
        blip -= k - before;
        if (blip <= 0 && o.audio && flat[k - 1] !== ' ' && o.sound !== false) { blip = 3; voiceBlip(o.audio, o.voice, o.mood); }
      }
      if (n >= total) { finish(); return; }
    }
  };
  const onFrame = () => { raf = 0; step(); if (!ctl.done && (raf || timer)) raf = requestAnimationFrame(onFrame); };
  if (total) {
    raf = requestAnimationFrame(onFrame);
    timer = setInterval(() => { if (!ctl.done) step(); }, 60);
  } else o.onDone?.();
  return ctl;
}

// ------------------------------------------------------------------ leaving
let fx = null;
/** The layer the bits fly in (over everything, never in the way). */
function fxLayer() {
  if (fx?.isConnected) return fx;
  fx = document.createElement('div');
  fx.className = 'ft-fx';
  fx.setAttribute('aria-hidden', 'true');
  document.body.append(fx);
  return fx;
}

const EMBER = ['#fff0c0', '#ffd27a', '#ff9a3a', '#e8602a'];
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A burst of tiny voxel bits from a node's letters (a sample of them) or from a rect
 * ({ left, top, width, height }). o: { n, colors, rise (px up), spread (px), life (s), from: 'letters' | 'rect' }.
 */
export function bits(src, o = {}) {
  if (!src || reduced() || document.hidden) return;
  let rects = [];
  if (src.getBoundingClientRect) {
    const cs = [...src.querySelectorAll?.('.ft-c.on') || []];
    if (cs.length && o.from !== 'rect') {
      const want = Math.min(cs.length, o.sample ?? 18);
      for (let i = 0; i < want; i++) rects.push(cs[Math.floor(((i + Math.random()) / want) * cs.length)].getBoundingClientRect());
    } else rects = [src.getBoundingClientRect()];
  } else rects = [src];
  rects = rects.filter((r) => r && r.width > 0 && r.bottom > -40 && r.top < innerHeight + 40);
  if (!rects.length) return;
  const layer = fxLayer();
  const colors = o.colors || EMBER;
  const n = Math.min(44, o.n ?? Math.max(8, Math.round(rects.length * 1.7)));
  const life = o.life ?? 0.75, rise = o.rise ?? 26, spread = o.spread ?? 22;
  const pxv = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const r = rects[i % rects.length];
    const b = document.createElement('i');
    const big = Math.random() < 0.5;
    const c = colors[Math.floor(Math.random() * colors.length)];
    const x = r.left + Math.random() * r.width, y = r.top + r.height * (0.25 + Math.random() * 0.5);
    const dx = (Math.random() * 2 - 1) * spread, dy = -rise * (0.4 + Math.random()) + (Math.random() < 0.3 ? rise * 0.9 : 0);
    const t = life * (0.6 + Math.random() * 0.6);
    b.className = 'ft-bit' + (big ? ' big' : '') + (Math.random() < 0.35 ? ' ember' : '');
    b.style.cssText = `left:${Math.round(x / pxv) * pxv}px;top:${Math.round(y / pxv) * pxv}px;--c:${c};--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;--g:${(rise * 0.5 + Math.random() * rise * 0.6).toFixed(1)}px;--t:${t.toFixed(2)}s;--sd:${(Math.random() * (o.delay ?? 0.18)).toFixed(2)}s;--rot:${Math.round((Math.random() * 2 - 1) * 200)}deg`;
    frag.append(b);
  }
  const batch = document.createElement('div');
  batch.className = 'ft-batch';
  batch.append(frag);
  layer.append(batch);
  setTimeout(() => batch.remove(), (life * 1.3 + 0.4) * 1000);
}

/** node's letters scatter into voxel bits. o: { remove, ms, bits: false, colors, n } */
export function leave(node, o = {}) {
  if (!node) return;
  if (node._ftLeaving) return;
  node._ftLeaving = true;
  node.classList.add('ft-out');
  if (o.bits !== false && node.isConnected) bits(node, o);
  if (o.remove) setTimeout(() => node.remove(), o.ms ?? 950);
}

/** A copy of node, where it is now, scatters; the node itself can take the next words at once. */
export function ghost(node, o = {}) {
  if (!node?.isConnected || !node.parentNode || !node.querySelector('.ft-c.on')) return null;
  const g = node.cloneNode(true);
  const cs = getComputedStyle(node);
  if (cs.position === 'static' || cs.position === 'relative') {
    g.style.position = 'absolute';
    g.style.left = node.offsetLeft + 'px';
    g.style.top = node.offsetTop + 'px';
    g.style.width = node.offsetWidth + 'px';
    g.style.margin = '0';
  }
  g.classList.add('ft-ghost');
  for (const c of o.cls || []) g.classList.add(c);
  for (const a of ['id', 'role', 'aria-live', 'title', 'tabindex']) g.removeAttribute(a);
  g.setAttribute('aria-hidden', 'true');
  g.style.pointerEvents = 'none';
  g.querySelectorAll('button, [tabindex]').forEach((b) => { b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); });
  node.parentNode.insertBefore(g, o.after ? node.nextSibling : node);
  // a burst of ghosts (lines skipped fast): only the last few stay
  const sibs = [...node.parentNode.children].filter((e) => e !== g && e.classList.contains('ft-ghost'));
  while (sibs.length > (o.keep ?? 2)) sibs.shift().remove();
  leave(g, { ...o, remove: true });
  return g;
}

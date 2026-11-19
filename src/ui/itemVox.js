// Items as real 3D models in the UI (wave 19). Every item is drawn from its in-game model where the game
// has one (plants, ore, dishes, tools, furniture, blocks, forged weapons: ./itemModels.js) or a voxel
// model of its own (./itemBuild.js), in a 3/4 view under a warm lamp with real shadows and a soft
// floor shadow (./itemRaster.js). One renderer for all of them, off the main thread (./itemWorker.js;
// on the page in idle time if workers fail), each picture made once and kept.
//
//   itemVox.src(id, size?) → string        what an <img> shows: the still once it's made; until then
//                                           the flat icon, tagged so the still replaces it by itself.
//                                           size: CSS px it's shown at (default 64)
//   itemVox.weapon(type, metal, inf, size?) the same for a forged weapon
//   itemVox.stack(s, size?)                 the same for an inventory stack ({ id } or { w })
//   itemVox.fromIcon(url, size?)            the same for a flat iconURL()/weaponIconURL() string
//   itemVox.keyOf(url) → key | null         the item key a picture shows
//   itemVox.img(what, cls, { turn, pop, size }) an <img> of it; turn: sways while on the page;
//                                           pop: one quick "picked up" turn
//   itemVox.spin(el, key, size?) → { canvas, dispose }  a slow whole turn (the backpack's tag)
//   itemVox.turn(img, key) → { dispose }    sway an <img> that's on the page (hover, the paw)
//   itemVox.warm(keys, size?, pri?)         make pictures ahead of time
//   itemVox.prewarm(state)                  the whole pack, at slot and icon sizes, in idle time
//   itemVox.itemPx(kind) → px               the CSS size an item shows at: 'slot' | 'belt' | 'icon'
//   data-vox="key" on an icon (or its box): hovering it, or the button it sits in, sways it (mouse)
//
// Pictures are queued by priority (what's on screen first, then the pack ahead of time) and made one
// or two at a time. Anything that can't be made keeps its flat icon.
import { VB, FINE } from '../deep/enemies/vox.js';
import { drawIconSmall, iconURL, weaponIconURL, iconKeyOf, drawWeapon, PixelCanvas, ICON } from '../gfx/PixelArt.js';
import { hashStr } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { METALS, INFUSIONS } from '../data/weapons.js';
import { ROCK_N, SPIN_N, POP_N } from './itemRender.js';
import ItemWorker from './itemWorker.js?worker&inline';
import './itemVox.css';

const TAG = 'data:image/png;vox='; // a tagged flat icon: data:image/png;vox=<key>~<size>;base64,…
const DEBUG = { made: 0, real: 0, flat: 0, failed: 0, frames: 0, swaps: 0, workerMs: 0, mainMs: 0, maxMainMs: 0, mode: 'idle', err: '', firstMs: 0, queuedMax: 0 };
const dpr = () => Math.max(1, Math.min(2, Math.round((window.devicePixelRatio || 1) * 4) / 4));
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const idle = (fn, timeout = 200) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout }) : setTimeout(() => fn({ timeRemaining: () => 8, didTimeout: true }), 30));

// ------------------------------------------------------------------ keys
/** Key of a forged weapon's model (dots: the key rides in a data URL's MIME parameter). */
const wkey = (type, metal, inf) => `w.${type}.${metal}.${inf || ''}`;
const fromPixelArtKey = (k) => (k.startsWith('w:') ? 'w.' + k.slice(2).split(':').join('.') : k);
const flatOf = (key) => {
  if (key.startsWith('w.')) { const [, t, m, i] = key.split('.'); return weaponIconURL(t, m, i || undefined); }
  return iconURL(key);
};
const isKey = (k) => typeof k === 'string' && (!!ITEMS[k] || k.startsWith('w.'));

// ------------------------------------------------------------------ the picture store
const stills = new Map(); // `${key}~${px}` → url | null (null: can't be made)
const urlInfo = new Map(); // url → { key, px }
const frames = new Map(); // `${kind}:${key}~${px}` → { urls: [], want: Set } (the last few)
const sizeKey = (key, px) => key + '~' + px;
const pxOf = (css) => Math.max(16, Math.min(320, Math.round((css || 64) * dpr())));

// ------------------------------------------------------------------ jobs
// { k (job key), key, px, kind, i, pri, at }; pri: 0 on screen now, 1 soon, 2 ahead of time
const jobs = new Map();
let inflight = 0;
function enqueue(key, px, kind = 'still', i = 0, pri = 0) {
  const k = `${kind}:${sizeKey(key, px)}:${i}`;
  const j = jobs.get(k);
  if (j) { if (pri < j.pri) j.pri = pri; return; }
  jobs.set(k, { k, key, px, kind, i, pri, at: performance.now() });
  DEBUG.queuedMax = Math.max(DEBUG.queuedMax, jobs.size);
  pump();
}
function nextJob() {
  let best = null;
  for (const j of jobs.values()) {
    if (j.sent) continue;
    if (!best || j.pri < best.pri || (j.pri === best.pri && j.at < best.at)) best = j;
  }
  return best;
}
/** A job's picture is made (url | null): file it, swap waiting images, run the next. */
function done(j, url, real) {
  jobs.delete(j.k);
  if (j.kind === 'still') {
    const sk = sizeKey(j.key, j.px);
    stills.set(sk, url);
    if (url) { urlInfo.set(url, { key: j.key, px: j.px }); DEBUG.made++; if (real) DEBUG.real++; else DEBUG.flat++; }
    else DEBUG.failed++;
    swapSoon();
  } else {
    const fk = `${j.kind}:${sizeKey(j.key, j.px)}`;
    let f = frames.get(fk);
    if (!f && url) { f = { urls: [], n: j.kind === 'spin' ? SPIN_N : j.kind === 'pop' ? POP_N : ROCK_N }; frames.set(fk, f); }
    if (f && url) { f.urls[j.i] = url; urlInfo.set(url, { key: j.key, px: j.px }); DEBUG.frames++; }
  }
}

// ---- the worker
let worker = null, wState = 'none', wSeq = 1, wTimer = 0;
const wJobs = new Map(); // seq → job
function startWorker() {
  if (wState !== 'none') return;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') { wState = 'off'; return; }
  try { worker = new ItemWorker(); } catch (e) { wState = 'off'; DEBUG.err = 'worker: ' + (e?.message || e); return; }
  wState = 'starting';
  const t0 = performance.now();
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.hello) { wState = 'on'; DEBUG.firstMs = performance.now() - t0; pump(); return; }
    const j = wJobs.get(m.id);
    if (!j) return;
    wJobs.delete(m.id);
    inflight--;
    clearTimeout(wTimer);
    DEBUG.workerMs += performance.now() - j.sentAt;
    if (m.ms) { DEBUG.renderMs = (DEBUG.renderMs || 0) + m.ms[0]; DEBUG.encMs = (DEBUG.encMs || 0) + m.ms[1]; }
    let url = null;
    if (m.ok && m.blob) url = URL.createObjectURL(m.blob);
    else if (m.ok && m.px) url = encode(new ImageData(new Uint8ClampedArray(m.px), j.px, j.px));
    else if (m.err) DEBUG.err = m.err;
    done(j, url, m.real);
    pump();
  };
  worker.onerror = (e) => { DEBUG.err = 'worker: ' + (e?.message || 'error'); dropWorker(); };
  // a worker that never says hello (or goes quiet) is let go: the page draws instead
  wTimer = setTimeout(() => { if (wState !== 'on') dropWorker(); }, 30000);
}
function dropWorker() {
  try { worker?.terminate(); } catch (e) { /* gone */ }
  worker = null; wState = 'off';
  for (const j of wJobs.values()) { j.sent = false; inflight--; }
  wJobs.clear();
  inflight = Math.max(0, inflight);
  pump();
}

// ---- the main-thread fallback (idle time)
let mainRender = null, mainLoading = false, idleQueued = false;
function loadMain() {
  if (mainRender || mainLoading) return;
  mainLoading = true;
  import('./itemRender.js').then((m) => { mainRender = m.renderFrame; mainLoading = false; pump(); }).catch((e) => { DEBUG.err = 'main: ' + (e?.message || e); mainLoading = false; });
}
let scratch = null;
function encode(img) {
  if (!scratch) scratch = document.createElement('canvas');
  scratch.width = img.width; scratch.height = img.height;
  scratch.getContext('2d', { willReadFrequently: true }).putImageData(img, 0, 0);
  return scratch.toDataURL();
}
function renderHere(j) {
  const t0 = performance.now();
  let out = null;
  try { out = mainRender(j.key, j.px, j.kind, j.i); } catch (e) { DEBUG.err = String(e?.message || e); }
  const url = out ? encode(out.img) : null;
  const ms = performance.now() - t0;
  DEBUG.mainMs += ms; DEBUG.maxMainMs = Math.max(DEBUG.maxMainMs, ms);
  done(j, url, out?.real);
}

function pump() {
  if (!jobs.size) { DEBUG.mode = wState === 'on' ? 'worker' : 'idle'; return; }
  startWorker();
  if (wState === 'on') {
    DEBUG.mode = 'worker';
    while (inflight < 2) {
      const j = nextJob();
      if (!j) break;
      j.sent = true; j.sentAt = performance.now();
      const id = wSeq++;
      wJobs.set(id, j);
      inflight++;
      worker.postMessage({ id, key: j.key, size: j.px, kind: j.kind, i: j.i });
      // a job that takes forever means the worker is stuck: the page takes over
      clearTimeout(wTimer);
      wTimer = setTimeout(() => { if (wJobs.size) dropWorker(); }, 20000);
    }
    return;
  }
  if (wState === 'starting') return;
  DEBUG.mode = 'main';
  loadMain();
  if (!mainRender || idleQueued) return;
  idleQueued = true;
  idle((deadline) => {
    idleQueued = false;
    const t0 = performance.now();
    const budget = deadline?.didTimeout ? 6 : Math.max(4, Math.min(12, deadline?.timeRemaining?.() ?? 6));
    let n = 0;
    while (jobs.size && (!n || performance.now() - t0 < budget)) {
      const j = nextJob();
      if (!j) break;
      renderHere(j);
      n++;
    }
    pump();
  });
}

// ------------------------------------------------------------------ swapping tagged images
let swapT = 0;
function swapSoon() { if (!swapT) swapT = requestAnimationFrame(() => { swapT = 0; swapTagged(); }); }
function parseTag(s) {
  if (!s || !s.startsWith(TAG)) return null;
  const e = s.indexOf(';', TAG.length);
  const body = s.slice(TAG.length, e), t = body.lastIndexOf('~');
  return t > 0 ? { key: body.slice(0, t), px: +body.slice(t + 1) } : { key: body, px: pxOf(64) };
}
/** Every tagged flat icon on the page whose still is ready shows the still now (with a little settle). */
function swapTagged() {
  for (const img of document.querySelectorAll(`img[src^="${TAG}"]`)) {
    const t = parseTag(img.getAttribute('src'));
    const u = t && stills.get(sizeKey(t.key, t.px));
    if (u) { img.src = u; DEBUG.swaps++; img.classList.remove('vox-in'); void img.offsetWidth; img.classList.add('vox-in'); }
    else if (u === null) img.src = flatOf(t.key);
  }
}

/** What an <img> should show for a key at css px: the still, or the flat icon tagged so the still replaces it. */
let hoverOn = false;
function srcOf(key, css = 64, pri = 0) {
  if (!hoverOn) { hoverOn = true; document.addEventListener('pointerover', onHover, { passive: true }); }
  const px = pxOf(css);
  const u = stills.get(sizeKey(key, px));
  if (u) return u;
  const flat = flatOf(key);
  if (u === null || !flat.startsWith('data:image/png;base64,')) return flat;
  enqueue(key, px, 'still', 0, pri);
  return TAG + key + '~' + px + ';' + flat.slice(15);
}
/** The key and pixel size of what an <img> shows (a still, a frame or a tagged icon). */
function infoOf(img) {
  const s = img?.getAttribute?.('src');
  return (s && (urlInfo.get(s) || parseTag(s))) || null;
}

// ------------------------------------------------------------------ frames: sway, spin, pop
function framesOf(kind, key, px, n, pri = 0) {
  const fk = `${kind}:${sizeKey(key, px)}`;
  let f = frames.get(fk);
  if (!f) {
    f = { urls: new Array(n), n };
    frames.set(fk, f);
    // keep the last few sets (a set of 48 small PNGs is a few hundred KB)
    while (frames.size > 8) {
      const [k0, f0] = frames.entries().next().value;
      frames.delete(k0);
      for (const u of f0.urls) if (u && u.startsWith('blob:')) { urlInfo.delete(u); URL.revokeObjectURL(u); }
    }
  }
  // ask for the frames not made yet, in order (one live set at a time: drop other sways still queued)
  for (const j of jobs.values()) if (!j.sent && j.kind === kind && kind !== 'spin' && (j.key !== key || j.px !== px)) jobs.delete(j.k);
  for (let i = 0; i < n; i++) if (!f.urls[i]) enqueue(key, px, kind, i, pri);
  return f;
}
/** Step an <img> through frames at fps while alive(); falls back to the still between frames. */
function runFrames(img, f, fps, alive, loop = true, onEnd) {
  let raf = 0, last = -1, on = true;
  const t0 = performance.now();
  const tick = (now) => {
    if (!on) return;
    const ms = now - t0;
    if (!alive(ms)) { on = false; onEnd?.(); return; }
    let i = Math.floor((ms / 1000) * fps);
    if (!loop && i >= f.n) { on = false; onEnd?.(); return; }
    i %= f.n;
    raf = requestAnimationFrame(tick);
    if (i !== last) { last = i; const u = f.urls[i]; if (u) img.src = u; }
  };
  raf = requestAnimationFrame(tick);
  return { dispose() { on = false; cancelAnimationFrame(raf); } };
}
/** Sway an <img> in place (hover, the stack in the paw); back to its still when disposed. */
function turnImg(img, key) {
  if (reduced() || !img || !key) return null;
  const info = infoOf(img);
  const px = info?.px || pxOf(img.getBoundingClientRect().width || 64);
  const still = stills.get(sizeKey(key, px));
  if (!still) return null;
  const f = framesOf('rock', key, px, ROCK_N, 0);
  f.urls[0] ||= still;
  const h = runFrames(img, f, 12, (ms) => img.isConnected || ms < 600);
  return { dispose() { h.dispose(); if (img.isConnected) img.src = stills.get(sizeKey(key, px)) || img.src; } };
}
/** The stack in the paw: lifted off its floor (no floor shadow), swaying; the still while frames come. */
function holdImg(img, key) {
  if (!img || !key) return null;
  const px = infoOf(img)?.px || pxOf(img.getBoundingClientRect().width || 64);
  const f = framesOf('held', key, px, ROCK_N, 0);
  if (f.urls[0]) img.src = f.urls[0];
  if (reduced()) return { dispose() {} };
  const h = runFrames(img, f, 12, () => img.isConnected);
  return { dispose: () => h.dispose() };
}
function popImg(img, key) {
  if (reduced() || !key || !img) return;
  const px = infoOf(img)?.px || pxOf(64);
  const f = framesOf('pop', key, px, POP_N, 1);
  // play it once enough of it is there (it lands on the still)
  let tries = 0;
  const go = () => {
    if (!img.isConnected) return;
    const ready = f.urls.filter(Boolean).length;
    if (ready < f.n && tries++ < 20) { setTimeout(go, 60); return; }
    if (ready < f.n * 0.7) return;
    runFrames(img, f, POP_N / 0.62, () => img.isConnected, false, () => { const u = stills.get(sizeKey(key, px)); if (u && img.isConnected) img.src = u; });
  };
  setTimeout(go, 120);
}

// hovering an icon with data-vox (or its box, or a button holding one) sways its item
let hovered = null;
function onHover(e) {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const t = e.target instanceof Element ? e.target : null;
  const box = t && (t.closest('[data-vox]') || t.closest('button, [role="button"], li')?.querySelector('[data-vox]'));
  if (box === hovered?.box) return;
  hovered?.h?.dispose();
  hovered = null;
  if (!box || box.closest('.ghosted, .sewn')) return;
  const img = box.tagName === 'IMG' ? box : box.querySelector('img');
  if (img) hovered = { box, h: turnImg(img, box.dataset.vox) };
  // a pocket's stack may be picked up next: have its in-the-paw frames ready
  if (img && box.closest('.inv-slot')) { const info = infoOf(img); if (info) for (let i = 0; i < ROCK_N; i += 6) enqueue(box.dataset.vox, info.px, 'held', i, 1); }
}

// ------------------------------------------------------------------ sizes
const probes = {};
let probeW = 0, probeH = 0;
const VAR = { slot: '--inv-item', belt: '--belt-item', icon: '--icon', tag: '--tag-item', rack: '--rack-item', snack: '--snack-item', tip: '--tip-item' };
/** The CSS px an item shows at in a kind of place (read from the stylesheet, cached per window size). */
function itemPx(kind = 'icon') {
  if (probeW !== window.innerWidth || probeH !== window.innerHeight) { probeW = window.innerWidth; probeH = window.innerHeight; for (const k in probes) delete probes[k]; }
  if (probes[kind]) return probes[kind];
  const d = document.createElement('div');
  d.style.cssText = `position:absolute;left:-9999px;top:0;height:1px;visibility:hidden;width:var(${VAR[kind] || '--icon'}, 64px)`;
  (document.getElementById('ui') || document.body).append(d);
  const w = d.getBoundingClientRect().width || 64;
  d.remove();
  return (probes[kind] = Math.round(w));
}

// ------------------------------------------------------------------ the old extrusion (the kitchen's ingredients)
/** The flat icon grown into voxels: { pos, col, idx } in icon pixels (cooking/ingVox.js). */
function extrude(key) {
  try {
    let pc;
    if (key.startsWith('w.')) { const [, type, metal, inf] = key.split('.'); pc = new PixelCanvas(ICON); drawWeapon(pc, type, METALS[metal]?.color ?? 0xa0a0a0, inf ? INFUSIONS[inf]?.color : null); }
    else { if (!ITEMS[key]) return null; pc = drawIconSmall(ITEMS[key].icon || { k: '?' }, hashStr(key), ICON, key); }
    const d = pc.d, W = pc.w, H = pc.h;
    const dist = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) dist[i] = d[i * 4 + 3] > 100 ? 99 : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : dist[y * W + x]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (dist[i]) dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4); }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (dist[i]) dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4); }
    const L = [], vb = { list: () => L, v: { size: 0 } };
    const hx = W / 2, hy = H / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!dist[i]) continue;
      const k = i * 4, c = (d[k] << 16) | (d[k + 1] << 8) | d[k + 2];
      const t = dist[i] < 1.5 ? 0 : Math.min(11, Math.round(Math.sqrt(dist[i] * 4.6)) - 1);
      const wall = ((Math.round(((c >> 16) & 255) * 0.8) << 16) | (Math.round(((c >> 8) & 255) * 0.8) << 8) | Math.round((c & 255) * 0.8));
      for (let z = -t; z <= t; z++) L.push({ x: x - hx, y: hy - 1 - y, z, c: z === t || z === -t || dist[i] < 1.5 ? c : wall });
    }
    if (!L.length) return null;
    const geo = (VB.prototype.geoLo || VB.prototype.geo).call(vb, 0, 0, 0, FINE);
    const P = geo.attributes.position.array, C = geo.attributes.color.array, I = geo.index.array;
    const pos = new Float32Array(P.length);
    for (let i = 0; i < P.length; i += 3) { pos[i] = P[i] / FINE; pos[i + 1] = P[i + 1] / FINE; pos[i + 2] = P[i + 2] / FINE - 0.5; }
    const out = { pos, col: Float32Array.from(C), idx: Uint32Array.from(I) };
    geo.dispose();
    return out;
  } catch (e) { return null; }
}

// ------------------------------------------------------------------ the API
let prewarmed = 0;
export const itemVox = {
  /** Start the picture maker (and, given the game, make the pack's pictures ahead of time). */
  init(game) { startWorker(); if (game?.state) this.prewarm(game.state); },
  ready() { return true; },
  wkey,
  /** What an <img> shows for an item: its 3D still, or (until that's made) its flat icon. */
  src(id, size) { return srcOf(id, size); },
  weapon(type, metal, infusion, size) { return srcOf(wkey(type, metal, infusion), size); },
  stack(s, size) { return !s ? '' : s.w ? srcOf(wkey(s.w.type, s.w.metal, s.w.infusion), size) : srcOf(s.id, size); },
  /** A flat iconURL()/weaponIconURL() string → the 3D version; anything else comes back as it was. */
  fromIcon(url, size) { const k = this.keyOf(url); return k ? srcOf(k, size ?? (urlInfo.get(url)?.px ? urlInfo.get(url).px / dpr() : undefined)) : url; },
  /** The key an icon string stands for (item id / weapon key), or null. */
  keyOf(url) {
    if (typeof url !== 'string') return null;
    if (url.startsWith(TAG)) return parseTag(url)?.key || null;
    const info = urlInfo.get(url);
    if (info) return info.key;
    const k = iconKeyOf(url);
    return k ? fromPixelArtKey(k) : null;
  },
  /** The stack key (item id or weapon key) of an inventory stack. */
  stackKey(s) { return !s || s.tool ? null : s.w ? wkey(s.w.type, s.w.metal, s.w.infusion) : s.id || null; },
  /** Make pictures ahead of time (a shop's stock as it opens…). */
  warm(keys, size = 64, pri = 1) { const px = pxOf(size); for (const k of keys) if (isKey(k) && !stills.has(sizeKey(k, px))) enqueue(k, px, 'still', 0, pri); },
  /** The whole pack (and the belt), at the slot, belt and icon sizes, ahead of time. */
  prewarm(state) {
    const now = performance.now();
    if (now - prewarmed < 4000) return;
    prewarmed = now;
    idle(() => {
      const slots = state?.data?.inv?.slots || [];
      const keys = [], belt = [];
      slots.forEach((s, i) => { const k = this.stackKey(s); if (k && isKey(k)) { keys.push(k); if (i < 9) belt.push(k); } });
      try { for (const s of state?.data?.stash?.slots || []) { const k = this.stackKey(s); if (k && isKey(k)) keys.push(k); } } catch (e) { /* fine */ }
      // the belt's first (it's on screen), then the pockets, then icon size for shops and toasts
      this.warm(belt, itemPx('belt'), 1);
      this.warm([...new Set(keys)], itemPx('slot'), 2);
      this.warm([...new Set(keys)], itemPx('icon'), 3);
    }, 1500);
  },
  itemPx,
  /**
   * An <img> of an item: what is an item id, a weapon key (wkey) or a flat icon URL (anything else
   * gets a plain <img> of it). opts.turn: it sways while on the page; opts.pop: one quick "picked
   * up" turn as it appears; opts.size: the CSS px it shows at.
   */
  img(what, cls = 'pix', { turn = false, pop = false, alt = '', size } = {}) {
    const key = isKey(what) ? what : this.keyOf(what);
    const img = document.createElement('img');
    img.className = cls;
    img.alt = alt;
    img.draggable = false;
    img.src = key ? srcOf(key, size) : what;
    if (!key) return img;
    img.dataset.vox = key;
    if (turn) {
      // starts swaying once its still is in (and keeps at it while it's on the page)
      let n = 0;
      const go = () => { if (!img.isConnected && n > 3) return; n++; if (stills.get(sizeKey(key, pxOf(size)))) { turnImg(img, key); return; } setTimeout(go, 250); };
      setTimeout(go, 60);
    } else if (pop) popImg(img, key);
    return img;
  },
  turn(img, key) { return turnImg(img, key || this.keyOf(img?.getAttribute?.('src'))); },
  /** The stack in the paw: lifted, no floor shadow, swaying (returns { dispose }). */
  hold(img, key) { return holdImg(img, key || this.keyOf(img?.getAttribute?.('src'))); },
  pop(img, key) { popImg(img, key || this.keyOf(img?.getAttribute?.('src'))); },
  /** A still right now if it's made (url), else null (and it's on its way). */
  url(id, size) { const px = pxOf(size); const u = stills.get(sizeKey(id, px)); if (u === undefined) enqueue(id, px); return u || null; },
  /** A whole slow turn in el (key: id or wkey): { canvas (an <img>), dispose } or null. */
  spin(el, key, size = 128) {
    if (reduced() || !isKey(key)) return null;
    const px = pxOf(size);
    const img = document.createElement('img');
    img.className = 'vox-spin pix';
    img.alt = '';
    img.draggable = false;
    img.src = srcOf(key, size);
    el.append(img);
    const f = framesOf('spin', key, px, SPIN_N, 1);
    const h = runFrames(img, f, 14, (ms) => img.isConnected || ms < 600);
    return { canvas: img, dispose() { h.dispose(); img.remove(); } };
  },
  /** Numbers for the curious (and the perf check); reset: start counting again. */
  stats(reset = false) {
    const out = { ...DEBUG, stills: stills.size, queued: jobs.size, inflight, worker: wState, frameSets: frames.size };
    if (reset) for (const k in DEBUG) if (typeof DEBUG[k] === 'number') DEBUG[k] = 0;
    return out;
  },
  /** Which source each made still came from (for checks): key → 'real' | 'flat'. */
  _build: extrude,
};

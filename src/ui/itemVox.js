// Item pictures in the UI. Wave 20: every item icon is rendered from the item's real 3D model (the
// one the mole holds, src/fps/viewmodel/held.js) and made to look hand-drawn 2D (src/ui/iconRender.js:
// 24×24, palette-snapped, outlined), shown at 24 × --px. It's registered as gfx/PixelArt.js's icon
// provider, so iconURL / weaponIconURL everywhere (slots, hotbar, shops, pantry, forge, toasts,
// tooltips, rewards, pickup flies, recipes) hand out the rendered icon. They're alive: on hover the
// model turns ±20° with a wobble for a few frames, a stack lifted into the paw bounces and one dropped
// in a slot squashes (re-rendered frames, so the pixels stay crisp; one live render at a time).
// Skills, buffs and other abstract things keep their hand-drawn icons.
//
//   itemVox.src(id) → string                the icon (data URL)
//   itemVox.weapon(type, metal, inf)        the same for a forged weapon
//   itemVox.stack(s)                        the same for an inventory stack ({ id } or { w })
//   itemVox.fromIcon(url)                   (kept for callers: the URL as it was)
//   itemVox.keyOf(url) → key | null         the item key an icon stands for
//   itemVox.img(what, cls, { pop })         an <img> of it; pop: a little hop as it appears
//   itemVox.itemPx(kind) → px               the CSS size an item shows at: 'slot' | 'belt' | 'icon'...
//   itemVox._build                          the icon grown into voxels (the kitchen's ingredients,
//                                           cooking/ingVox.js)
// (Its old names stay so every caller keeps working: spin, turn, hold, warm, prewarm do nothing now.)
import { VB, FINE } from '../deep/enemies/vox.js';
import { drawIconSmall, iconURL, weaponIconURL, iconKeyOf, drawWeapon, PixelCanvas, ICON, setIconProvider, peekFlatURL } from '../gfx/PixelArt.js';
import * as IR from './iconRender.js';
import { hashStr } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { METALS, INFUSIONS } from '../data/weapons.js';
import './itemVox.css';

const wkey = (type, metal, inf) => `w.${type}.${metal}.${inf || ''}`;
const fromPixelArtKey = (k) => (k.startsWith('w:') ? 'w.' + k.slice(2).split(':').join('.') : k);
const isKey = (k) => typeof k === 'string' && (!!ITEMS[k] || k.startsWith('w.'));
/** The icon of an item key (item id or weapon key). */
function flatOf(key) {
  if (key.startsWith('w.')) { const [, t, m, i] = key.split('.'); return weaponIconURL(t, m, i || undefined); }
  return iconURL(key);
}

// ------------------------------------------------------------------ the rendered icons
const toIR = (k) => (k.startsWith('w:') ? 'w.' + k.slice(2).split(':').join('.') : k);
const toPA = (k) => (k.startsWith('w.') ? 'w:' + k.slice(2).split('.').join(':') : k);
const standIn = new Set(); // keys whose flat icon was handed out while the render waited
setIconProvider({
  get: (k) => { const u = IR.iconURL(toIR(k)); if (!u && !standIn.has(k)) standIn.add(k); return u; },
  keyOf: (u) => { const k = IR.keyOfURL(u); return k ? toPA(k) : null; },
});
// a flat icon handed out while its render waited (over the frame's budget) is swapped once it lands
IR.onIcon((key, url) => {
  const pk = toPA(key);
  if (!standIn.delete(pk) || typeof document === 'undefined') return;
  const flat = peekFlatURL(pk);
  if (!flat) return;
  for (const img of document.querySelectorAll('img')) if (img.getAttribute('src') === flat) img.src = url;
});

// ------------------------------------------------------------------ alive: hover turn, lift bounce, drop squash
// One live render at a time: the model re-rendered a few frames (yaw, pitch, squash over t in 0..1).
const LIVE = {
  hover: { dur: 0.9, f: (t) => [0.35 * Math.sin(t * Math.PI * 2) * (1 - t * 0.4), 0.07 * Math.sin(t * Math.PI * 4), 0] },
  lift: { dur: 0.34, f: (t) => [0.12 * Math.sin(t * Math.PI), 0, t < 0.35 ? -0.7 * Math.sin((t / 0.35) * Math.PI) : 0.35 * Math.sin(((t - 0.35) / 0.65) * Math.PI) * (1 - t)] },
  squash: { dur: 0.36, f: (t) => [0, 0, t < 0.3 ? 0.85 * Math.sin((t / 0.3) * Math.PI / 2) : 0.85 * Math.cos(((t - 0.3) / 0.7) * Math.PI * 1.5) * (1 - t) ** 1.2] },
};
let live = null;
function stopLive() {
  if (!live) return;
  cancelAnimationFrame(live.raf);
  live.img.src = live.base;
  live.img.classList.remove('vox-live');
  live = null;
}
function startLive(img, key, kind = 'hover', host = null) {
  if (!img || !key || !IR.hasIcon(key)) return;
  if (live && live.img === img && live.kind === kind) return;
  stopLive();
  const base = img.src;
  if (IR.keyOfURL(base) !== key) return; // (a frame of something else is showing)
  const L = LIVE[kind];
  live = { img, key, kind, host, base, t0: performance.now(), last: 0, raf: 0 };
  img.classList.add('vox-live');
  const tick = (now) => {
    if (!live || live.img !== img) return;
    const t = (now - live.t0) / 1000 / L.dur;
    if (t >= 1 || !img.isConnected) { stopLive(); return; }
    if (now - live.last > 40) {
      live.last = now;
      const [y, p, sq] = L.f(t);
      const cv = IR.renderFrame(key, y, p, sq);
      if (!cv) { stopLive(); return; }
      img.src = cv.toDataURL();
    }
    live.raf = requestAnimationFrame(tick);
  };
  live.raf = requestAnimationFrame(tick);
}
const keyOfImg = (img) => {
  if (!img) return null;
  const k = IR.keyOfURL(img.src) || (live?.img === img ? live.key : null);
  return k;
};
const imgIn = (host) => (!host ? null : host.tagName === 'IMG' ? host : host.querySelector('img'));
if (typeof document !== 'undefined') {
  const HOST = 'img, button, .slot, .sh-item, .inv-slot, .li, .chip, .bp-loop, [data-vox]';
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const host = e.target.closest?.(HOST);
    if (live?.kind === 'hover' && live.host && host !== live.host && !live.host.contains(e.target)) stopLive();
    const img = imgIn(host), key = keyOfImg(img);
    if (key && !(live && live.img === img)) startLive(img, key, 'hover', host);
  }, true);
  // the backpack's drag & drop (ui/invGrid.js): the ghost in the paw bounces up, a slot it lands in squashes
  document.addEventListener('animationstart', (e) => {
    const n = e.target;
    if (e.animationName === 'slotPop') { const img = imgIn(n); startLive(img, keyOfImg(img), 'squash'); }
    else if (e.animationName === 'grab' && n.tagName === 'IMG') startLive(n, keyOfImg(n), 'lift'); // (.inv-ghost.grab img)
  }, true);
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
export const itemVox = {
  init(game) {
    if (this._warm) return;
    this._warm = true;
    // what the mole carries first (the belt, the pack), then everything, at idle
    try { IR.prewarm((game?.state?.inventory?.() || []).map((s) => s.id).filter(Boolean), true); } catch { /* fine */ }
    IR.prewarm();
  },
  ready() { return true; },
  wkey,
  src(id) { return isKey(id) ? flatOf(id) : ''; },
  weapon(type, metal, infusion) { return weaponIconURL(type, metal, infusion); },
  stack(s) { return !s ? '' : s.w ? weaponIconURL(s.w.type, s.w.metal, s.w.infusion) : isKey(s.id) ? iconURL(s.id) : ''; },
  fromIcon(url) { return url; },
  keyOf(url) {
    if (typeof url !== 'string') return null;
    const k = iconKeyOf(url);
    return k ? fromPixelArtKey(k) : null;
  },
  stackKey(s) { return !s || s.tool ? null : s.w ? wkey(s.w.type, s.w.metal, s.w.infusion) : s.id || null; },
  warm() {},
  prewarm() {},
  itemPx,
  /** An <img> of an item (id, weapon key or icon URL); pop: a little hop as it appears. */
  img(what, cls = 'pix', { pop = false, turn = false, alt = '' } = {}) {
    const key = isKey(what) ? what : this.keyOf(what);
    const img = document.createElement('img');
    img.className = cls + (pop || turn ? ' vox-pop' : '');
    img.alt = alt;
    img.draggable = false;
    img.src = key ? flatOf(key) : what;
    return img;
  },
  turn() { return null; },
  hold() { return null; },
  pop(img) { if (!img) return; img.classList.remove('vox-pop'); void img.offsetWidth; img.classList.add('vox-pop'); },
  /** Play a live move on an icon <img>: 'hover' (turn), 'lift' (bounce), 'squash'. */
  live(img, kind = 'hover') { startLive(img, keyOfImg(img), kind); },
  icons: IR,
  url(id) { return isKey(id) ? flatOf(id) : null; },
  spin() { return null; },
  stats() { return { mode: 'render24', ...IR.stats() }; },
  _build: extrude,
};

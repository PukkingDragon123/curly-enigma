// Item pictures in the UI (wave 19): the hand-drawn 2D pixel-art icons (gfx/PixelArt.js). The item's
// real 3D model is what the mole holds in first person (src/fps/viewmodel/held.js); the slots, the
// shops, the pantry, the forge, toasts and tooltips show the icon.
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
import { drawIconSmall, iconURL, weaponIconURL, iconKeyOf, drawWeapon, PixelCanvas, ICON } from '../gfx/PixelArt.js';
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
  init() {},
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
  url(id) { return isKey(id) ? flatOf(id) : null; },
  spin() { return null; },
  stats() { return { mode: '2d' }; },
  _build: extrude,
};

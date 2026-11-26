// Item icons rendered from the item's real 3D model, made to look hand-drawn 2D (wave 20).
//
// One shared offscreen renderer (a small CPU rasterizer: no second WebGL context, no GPU readback
// stalls) draws the model the mole holds (src/ui/itemModels.js itemMesh: the gathering plants, the
// clump's ore, the kitchen's dishes, the paws' tools, blocks, furniture, forged weapons and the
// voxel builds of itemBuild.js) in an orthographic 3/4 view into a 24×24 icon:
//   1. 4×4 supersampled raster, flat warm key light from the top left, a plum fill, no bloom
//   2. coverage → solid pixels (thin hafts kept), colours averaged, then snapped to the master
//      palette (src/ui/palette.js), at most 7 colours an icon, lone speckles merged into their cluster
//   3. a 1px dark-plum outline (a lighter, tinted one on the lit top-left edges), selective inner
//      lines where a near part overlaps a far one, and 1–2 hand-placed cream glints
// Icons are cached in one atlas (built at idle in slices, and on first use within a per-frame
// budget; past it the flat icon stands in and is swapped as soon as the render lands).
//
//   iconURL(key) → data URL | null           key: item id or 'w.<type>.<metal>.<infusion>'
//   iconCanvas(key) → 24×24 canvas | null
//   renderFrame(key, yawOff, pitchOff, sq) → canvas   a live frame (hover turn), not cached
//   keyOfURL(url) → key | null               which item a rendered icon URL shows
//   prewarm(keys?)                           queue keys (default: every item) for the idle builder
//   atlas() → { canvas, cells: Map(key → index) }   the sheet (ICON_PX cells, 16 a row)
//   stats() → { cached, queued, ms }
import { itemMesh } from './itemModels.js';
import { PALETTE, snapIndex, palDist, palL, rampOf, ramp, nearest, OUTLINE, HIGHLIGHT, step } from './palette.js';
import { ITEMS } from '../data/items.js';
import { WEAPON_TYPES } from '../data/weapons.js';

export const ICON_PX = 24;
const SS = 4, W = ICON_PX * SS, INNER = ICON_PX - 2; // a 1px outline margin each side
const N = ICON_PX * ICON_PX;
const idxOf = (hex) => snapIndex(...nearest(hex).rgb);
const INK = idxOf(OUTLINE), CREAM = idxOf(HIGHLIGHT), PLUM_MID = idxOf('#4a2b4a');
const DARK2 = PALETTE.map((p) => idxOf(step(p.hex, -2)));
const LIGHT2 = PALETTE.map((p) => idxOf(step(p.hex, 2)));
const LIT_EDGE = PALETTE.map((p) => {
  // the lit-side outline: the darkest tone of the colour's own ramp (a tinted line), never too light
  const r = ramp(rampOf(p.hex).name);
  for (const h of r) { const i = idxOf(h); if (i !== INK && palL(i) < 0.4) return i; }
  return PLUM_MID;
});
const SHINY = new Set(['mineral', 'gem', 'tool', 'ingot', 'equip', 'relic', 'consumable']);

// ------------------------------------------------------------------ models (LRU)
const meshes = new Map();
function meshOf(key) {
  if (meshes.has(key)) { const m = meshes.get(key); meshes.delete(key); meshes.set(key, m); return m; }
  let r = null;
  try { r = itemMesh(key); } catch (e) { console.warn('iconRender', key, e); }
  const m = r?.M ? { M: r.M, pose: r.pose, real: r.real, fit: null } : null;
  meshes.set(key, m);
  if (meshes.size > 24) meshes.delete(meshes.keys().next().value);
  return m;
}

// ------------------------------------------------------------------ projection
let PX = new Float32Array(0), PY = new Float32Array(0), PZ = new Float32Array(0), VC = new Float32Array(0);
const KEY = norm([-0.55, 0.78, 0.5]), FILL = norm([0.7, -0.35, 0.45]);
const KEY_COL = [1.0, 0.9, 0.76], FILL_COL = [0.36, 0.2, 0.42];
function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }
const enc = (c) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** Project and light every vertex (screen x right, y down, depth toward the eye). */
function project(M, yaw, pitch) {
  const n = M.P.length / 3;
  if (PX.length < n) { PX = new Float32Array(n); PY = new Float32Array(n); PZ = new Float32Array(n); VC = new Float32Array(n * 3); }
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const P = M.P, Nn = M.N, C = M.C, G = M.G;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1] - 0.4, z = P[i * 3 + 2];
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    PX[i] = x1; PY[i] = -(y * cp - z1 * sp); PZ[i] = y * sp + z1 * cp;
    const nx = Nn[i * 3], ny = Nn[i * 3 + 1], nz = Nn[i * 3 + 2];
    const nx1 = nx * cy - nz * sy, nz1 = nx * sy + nz * cy;
    const vx = nx1, vy = ny * cp - nz1 * sp, vz = ny * sp + nz1 * cp;
    const k = Math.max(0, vx * KEY[0] + vy * KEY[1] + vz * KEY[2]);
    const f = Math.max(0, vx * FILL[0] + vy * FILL[1] + vz * FILL[2]);
    // flat key in three steps (woodcut planes, not a gradient)
    const kq = k > 0.72 ? 1 : k > 0.38 ? 0.7 : k > 0.08 ? 0.46 : 0.3;
    const g = Math.min(1, G[i] || 0);
    for (let c = 0; c < 3; c++) {
      const a = C[i * 3 + c];
      const lit = a * (0.16 + 0.95 * kq * KEY_COL[c]) + a * FILL_COL[c] * 0.55 * f + FILL_COL[c] * 0.025;
      VC[i * 3 + c] = enc(Math.min(1, lit * (1 - g) + Math.min(1, a * 1.12) * g));
    }
  }
  return n;
}

/** The view's scale and centre: the model and its hover turns fit the 22 px inside. */
function fitOf(m) {
  if (m.fit) return m.fit;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const d of [-0.36, 0, 0.36]) {
    const n = project(m.M, m.pose.yaw + d, m.pose.pitch);
    for (let i = 0; i < n; i++) { if (PX[i] < x0) x0 = PX[i]; if (PX[i] > x1) x1 = PX[i]; if (PY[i] < y0) y0 = PY[i]; if (PY[i] > y1) y1 = PY[i]; }
  }
  const s = (INNER * SS) / Math.max(x1 - x0, y1 - y0, 1e-4);
  return (m.fit = { s, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
}

// ------------------------------------------------------------------ raster
const ZB = new Float32Array(W * W), CB = new Float32Array(W * W * 3);
function raster(m, yaw, pitch, sq = 0) {
  const { M } = m, fit = fitOf(m);
  project(M, yaw, pitch);
  ZB.fill(-1e9);
  // squash (sq > 0: wider and shorter, anchored on the foot) / stretch (sq < 0)
  const sx = fit.s * (1 + sq * 0.22), sy = fit.s * (1 - sq * 0.22), foot = (INNER * SS) / 2;
  const n = M.P.length / 3;
  const X = new Float32Array(n), Y = new Float32Array(n);
  for (let i = 0; i < n; i++) { X[i] = (PX[i] - fit.cx) * sx + W / 2; Y[i] = (PY[i] - fit.cy) * fit.s; Y[i] = foot - (foot - Y[i]) * (sy / fit.s) + W / 2; }
  const I = M.I;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ax = X[a], ay = Y[a], bx = X[b], by = Y[b], cx = X[c], cy = Y[c];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-6) continue;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(W - 1, Math.ceil(Math.max(ay, by, cy)));
    if (minX > maxX || minY > maxY) continue;
    const inv = 1 / area, za = PZ[a], zb = PZ[b], zc = PZ[c];
    for (let py = minY; py <= maxY; py++) {
      const fy = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const fx = px + 0.5;
        const w0 = ((bx - fx) * (cy - fy) - (by - fy) * (cx - fx)) * inv;
        const w1 = ((cx - fx) * (ay - fy) - (cy - fy) * (ax - fx)) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * za + w1 * zb + w2 * zc, o = py * W + px;
        if (z <= ZB[o]) continue;
        ZB[o] = z;
        CB[o * 3] = w0 * VC[a * 3] + w1 * VC[b * 3] + w2 * VC[c * 3];
        CB[o * 3 + 1] = w0 * VC[a * 3 + 1] + w1 * VC[b * 3 + 1] + w2 * VC[c * 3 + 1];
        CB[o * 3 + 2] = w0 * VC[a * 3 + 2] + w1 * VC[b * 3 + 2] + w2 * VC[c * 3 + 2];
      }
    }
  }
}

// ------------------------------------------------------------------ to pixel art
/** The supersampled frame → a palette-indexed 24×24 sprite (-1 = clear). */
function toSprite(key) {
  const cnt = new Uint8Array(N), idx = new Int16Array(N).fill(-1), dep = new Float32Array(N);
  const r = new Float32Array(N), g = new Float32Array(N), b = new Float32Array(N);
  for (let y = 0; y < ICON_PX; y++) for (let x = 0; x < ICON_PX; x++) {
    let n = 0, R = 0, G = 0, B = 0, Z = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const o = (y * SS + j) * W + x * SS + i;
      if (ZB[o] < -1e8) continue;
      n++; R += CB[o * 3]; G += CB[o * 3 + 1]; B += CB[o * 3 + 2]; Z += ZB[o];
    }
    const k = y * ICON_PX + x;
    cnt[k] = n;
    if (n) { r[k] = R / n; g[k] = G / n; b[k] = B / n; dep[k] = Z / n; }
  }
  const T = SS * SS;
  const at = (x, y) => (x < 0 || y < 0 || x >= ICON_PX || y >= ICON_PX ? -1 : y * ICON_PX + x);
  const solid = new Uint8Array(N);
  for (let k = 0; k < N; k++) solid[k] = cnt[k] >= T * 0.4 ? 1 : 0;
  // thin parts (a haft, a stem): a part-covered pixel that bridges two solid ones stays
  for (let y = 0; y < ICON_PX; y++) for (let x = 0; x < ICON_PX; x++) {
    const k = y * ICON_PX + x;
    if (solid[k] || cnt[k] < T * 0.12) continue;
    const s = (dx, dy) => { const q = at(x + dx, y + dy); return q >= 0 && solid[q]; };
    if ((s(-1, 0) && s(1, 0)) || (s(0, -1) && s(0, 1)) || (s(-1, -1) && s(1, 1)) || (s(1, -1) && s(-1, 1))) solid[k] = 2;
  }
  for (let k = 0; k < N; k++) if (solid[k]) idx[k] = snapIndex(Math.round(r[k]), Math.round(g[k]), Math.round(b[k]));
  // at most 7 colours: the least used merge into their nearest kept neighbour colour
  const use = new Map();
  for (let k = 0; k < N; k++) if (idx[k] >= 0) use.set(idx[k], (use.get(idx[k]) || 0) + 1);
  const merge = new Map();
  while (use.size > 7) {
    let lo = -1, ln = 1e9;
    for (const [c, n] of use) if (n < ln) { ln = n; lo = c; }
    use.delete(lo);
    let best = -1, bd = 1e9;
    for (const c of use.keys()) { const d = palDist(lo, c); if (d < bd) { bd = d; best = c; } }
    merge.set(lo, best);
    use.set(best, use.get(best) + ln);
  }
  if (merge.size) for (let k = 0; k < N; k++) { let c = idx[k]; while (merge.has(c)) c = merge.get(c); idx[k] = c; }
  // clean clusters: a pixel takes the colour most of its 8 neighbours share when that colour is
  // the same material a tone away (noise in a plank, a clod), or when it's a lone speckle
  const out = Int16Array.from(idx);
  const nc = new Int16Array(8), nn = new Uint8Array(8);
  for (let y = 0; y < ICON_PX; y++) for (let x = 0; x < ICON_PX; x++) {
    const k = y * ICON_PX + x, c = idx[k];
    if (c < 0) continue;
    let m = 0, same4 = 0, all4 = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const q = at(x + dx, y + dy);
      if (q < 0 || idx[q] < 0) continue;
      const cq = idx[q];
      if (!dx || !dy) { all4++; if (cq === c) same4++; }
      let j = 0;
      while (j < m && nc[j] !== cq) j++;
      if (j === m) { nc[m] = cq; nn[m++] = 0; }
      nn[j]++;
    }
    let bc = -1, bn = 0;
    for (let j = 0; j < m; j++) if (nc[j] !== c && nn[j] > bn) { bn = nn[j]; bc = nc[j]; }
    if (bc < 0) continue;
    if ((bn >= 5 && palDist(c, bc) < 0.02) || (all4 >= 3 && same4 === 0 && bn >= 3)) out[k] = bc;
  }
  // inner lines: where a near part overlaps a far one, the far side gets a dark line (bottom-right)
  for (let y = 0; y < ICON_PX; y++) for (let x = 0; x < ICON_PX; x++) {
    const k = y * ICON_PX + x;
    if (out[k] < 0) continue;
    for (const [dx, dy] of [[-1, 0], [0, -1]]) {
      const q = at(x + dx, y + dy);
      if (q >= 0 && out[q] >= 0 && dep[q] - dep[k] > 0.16 && solid[q] === 1) { const c = out[k]; out[k] = DARK2[c] === c ? INK : DARK2[c]; break; }
    }
  }
  // the outline: dark plum; on the lit top-left edges, a lighter line tinted from the colour inside
  const fin = Int16Array.from(out);
  for (let y = 0; y < ICON_PX; y++) for (let x = 0; x < ICON_PX; x++) {
    const k = y * ICON_PX + x;
    if (out[k] >= 0) continue;
    const f = (dx, dy) => { const q = at(x + dx, y + dy); return q >= 0 && out[q] >= 0 ? q : -1; };
    const R = f(1, 0), D = f(0, 1), L = f(-1, 0), U = f(0, -1);
    if (R < 0 && D < 0 && L < 0 && U < 0) continue;
    const lit = (R >= 0 || D >= 0) && L < 0 && U < 0 && y + x < ICON_PX + 4;
    fin[k] = lit ? LIT_EDGE[out[R >= 0 ? R : D]] : INK;
  }
  // 1–2 glints, placed where a hand would: the lightest plane, toward the top left, inside the form
  let best = -1, bs = -1e9;
  for (let y = 1; y < ICON_PX - 1; y++) for (let x = 1; x < ICON_PX - 1; x++) {
    const k = y * ICON_PX + x, c = out[k];
    if (c < 0 || out[k - 1] < 0 || out[k - ICON_PX] < 0 || out[k + 1] < 0 || out[k + ICON_PX] < 0) continue;
    const s = palL(c) * 10 - (x + y) * 0.12;
    if (s > bs) { bs = s; best = k; }
  }
  if (best >= 0) {
    const c = out[best], hi = palL(c) > 0.55 ? CREAM : LIGHT2[c];
    if (hi !== c) {
      fin[best] = hi;
      const it = ITEMS[key];
      const shiny = key.startsWith('w.') || SHINY.has(it?.cat);
      const h = (key.length * 7 + key.charCodeAt(0)) & 1;
      const nx = best + (h ? 1 : ICON_PX);
      if (shiny && out[nx] === c) fin[nx] = hi;
    }
  }
  return fin;
}

const CTX = { willReadFrequently: true }; // CPU-backed: putImageData / toDataURL without a GPU round trip
function spriteCanvas(spr, cv) {
  cv ||= document.createElement('canvas');
  cv.width = cv.height = ICON_PX;
  const cx = cv.getContext('2d', CTX);
  const im = cx.createImageData(ICON_PX, ICON_PX), d = im.data;
  for (let k = 0; k < N; k++) {
    const c = spr[k];
    if (c < 0) continue;
    const p = PALETTE[c].rgb;
    d[k * 4] = p[0]; d[k * 4 + 1] = p[1]; d[k * 4 + 2] = p[2]; d[k * 4 + 3] = 255;
  }
  cx.putImageData(im, 0, 0);
  return cv;
}

// ------------------------------------------------------------------ the atlas
export const _prof = { n: 0, mesh: 0, raster: 0, sprite: 0, canvas: 0 };
const COLS = 16;
const cells = new Map(); // key → { i, url, canvas } | null (no model)
const urlKey = new Map();
let sheet = null, msTotal = 0;
function sheetPut(i, cv) {
  const rows = Math.ceil((i + 1) / COLS);
  if (!sheet) { sheet = document.createElement('canvas'); sheet.width = COLS * ICON_PX; sheet.height = 0; }
  if (sheet.height < rows * ICON_PX) {
    const old = sheet;
    sheet = document.createElement('canvas');
    sheet.width = COLS * ICON_PX; sheet.height = Math.max(rows, Math.ceil(old.height / ICON_PX) * 2, 4) * ICON_PX;
    if (old.height) sheet.getContext('2d', CTX).drawImage(old, 0, 0);
  }
  sheet.getContext('2d', CTX).drawImage(cv, (i % COLS) * ICON_PX, Math.floor(i / COLS) * ICON_PX);
}

const validKey = (key) => typeof key === 'string' && (key.startsWith('w.') ? !!WEAPON_TYPES[key.split('.')[1]] : !!ITEMS[key]);

function build(key) {
  const t0 = performance.now();
  _prof.n++;
  const m = meshOf(key);
  let cell = null;
  if (m) {
    let t = performance.now();
    _prof.mesh += t - t0;
    raster(m, m.pose.yaw, m.pose.pitch);
    _prof.raster += performance.now() - t; t = performance.now();
    const cv = spriteCanvas(toSprite(key));
    _prof.sprite += performance.now() - t; t = performance.now();
    const i = cells.size;
    sheetPut(i, cv);
    cell = { i, canvas: cv, url: cv.toDataURL() };
    _prof.canvas += performance.now() - t;
    urlKey.set(cell.url, key);
  }
  cells.set(key, cell);
  queue.delete(key);
  soonQ.delete(key);
  urgentKeys.delete(key);
  if (!urgentKeys.size) urgent = false;
  msTotal += performance.now() - t0;
  if (cell) for (const fn of listeners) fn(key, cell.url);
  return cell;
}

// a per-frame budget for renders asked for synchronously (a panel opening with 40 new items)
let frameMs = 0, frameReset = false;
const BUDGET = 14;
function spend(ms) {
  frameMs += ms;
  if (!frameReset) { frameReset = true; requestAnimationFrame(() => { frameMs = 0; frameReset = false; }); }
}

/** The icon's data URL, rendering it now if the frame's budget allows (else null: it's queued). */
export function iconURL(key, { force = false } = {}) {
  if (cells.has(key)) return cells.get(key)?.url ?? null;
  if (!validKey(key)) return null;
  if (!force && frameMs > BUDGET) { soon(key); return null; }
  const t0 = performance.now();
  const c = build(key);
  spend(performance.now() - t0);
  return c?.url ?? null;
}
export function iconCanvas(key) { iconURL(key, { force: true }); return cells.get(key)?.canvas ?? null; }
export const keyOfURL = (url) => urlKey.get(url) || null;
export const hasIcon = (key) => !!cells.get(key);

const live = document.createElement('canvas');
/** A live frame (not cached): the model turned by yawOff / pitchOff (radians), squashed by sq. */
export function renderFrame(key, yawOff = 0, pitchOff = 0, sq = 0) {
  const m = meshOf(key);
  if (!m) return null;
  let t = performance.now();
  raster(m, m.pose.yaw + yawOff, m.pose.pitch + pitchOff, sq);
  _prof.raster += performance.now() - t; t = performance.now();
  const spr = toSprite(key);
  _prof.sprite += performance.now() - t; t = performance.now();
  const cv = spriteCanvas(spr, live);
  _prof.canvas += performance.now() - t;
  return cv;
}

// ------------------------------------------------------------------ the next frames (icons a panel is showing)
const soonQ = new Set();
let soonOn = false;
function soon(key) {
  soonQ.add(key);
  if (soonOn) return;
  soonOn = true;
  requestAnimationFrame(function pumpSoon() {
    const t0 = performance.now();
    for (const k of soonQ) {
      soonQ.delete(k);
      if (!cells.has(k)) build(k);
      if (performance.now() - t0 > 8) break;
    }
    spend(performance.now() - t0);
    if (soonQ.size) requestAnimationFrame(pumpSoon); else soonOn = false;
  });
}

// ------------------------------------------------------------------ the idle builder
const queue = new Set();
const listeners = new Set();
/** fn(key, url) whenever an icon lands in the atlas. Returns an unsubscribe. */
export function onIcon(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let idleOn = false, urgent = false;
const urgentKeys = new Set();
const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(() => fn({ timeRemaining: () => 8, didTimeout: true }), 60);
function pump(dl) {
  idleOn = false;
  // background icons wait while a scene loads (game.loadingScene / transitioning): idle time only
  if (!urgent && typeof window !== 'undefined' && (window.__game?.transitioning || window.__game?.loading)) { idleOn = true; setTimeout(() => ric(pump), 1500); return; }
  const t0 = performance.now();
  for (const key of queue) {
    if (cells.has(key)) { queue.delete(key); continue; }
    build(key);
    if (performance.now() - t0 > 10 || (dl.timeRemaining() < 3 && !dl.didTimeout)) break;
  }
  if (queue.size) { idleOn = true; ric(pump, urgent ? { timeout: 300 } : {}); } else urgent = false;
}
/** Queue icons for the idle builder (front: ahead of the rest). Default: every item and blade. */
export function prewarm(keys, front = false) {
  if (!keys) {
    keys = Object.keys(ITEMS);
    for (const t of Object.keys(WEAPON_TYPES)) keys.push(`w.${t}.iron.`);
  }
  keys = keys.filter((k) => !cells.has(k) && validKey(k));
  if (front && keys.length) { const rest = [...queue]; queue.clear(); for (const k of keys) queue.add(k); for (const k of rest) queue.add(k); for (const k of keys) urgentKeys.add(k); urgent = true; }
  else for (const k of keys) queue.add(k);
  if (!idleOn && queue.size) { idleOn = true; ric(pump, urgent ? { timeout: 300 } : {}); }
}

export function atlas() {
  const map = new Map();
  for (const [k, c] of cells) if (c) map.set(k, c.i);
  return { canvas: sheet, cells: map, size: ICON_PX, cols: COLS };
}
export function stats() { return { cached: [...cells.values()].filter(Boolean).length, missing: [...cells.values()].filter((c) => !c).length, queued: queue.size, soon: soonQ.size, ms: Math.round(msTotal) }; }

// Items as 3D voxel art for the UI. An item's 64×64 pixel icon (or a forged weapon's) is extruded into
// a voxel model (one voxel per icon pixel), shaped by what it is (paper stays a sheet, a blade stays
// thin, an ore lump is a lump), meshed with the creatures' mesher (baked face shading and corner AO),
// and drawn into a 128 px still by a tiny software rasterizer (an orthographic view of ~10-20k
// triangles is a few ms on the CPU: no GPU round trip, no stall, nothing borrowed from the renderer,
// and it works before the game has one).
//
//   itemVox.src(id) → string             what an <img> should show: the 3D still once it's made, until
//                                         then the flat icon, tagged so the still replaces it by itself
//   itemVox.weapon(type, metal, inf)      the same for a forged weapon
//   itemVox.stack(s)                      the same for an inventory stack ({ id } or { w })
//   itemVox.fromIcon(url)                 the same for a flat iconURL()/weaponIconURL() string
//   itemVox.img(what, cls, { turn, pop })  an <img> of it (what: id, wkey or flat icon URL); turn: keeps
//                                         turning while on the page; pop: one quick "picked up" turn
//   itemVox.spin(el, key) → { dispose }   a canvas in el turning the model (the backpack's item tag)
//   itemVox.url(id) → data URL | null     the still right now (built on the spot if need be)
//   data-vox="key" on an icon (or its box): hovering it, or the button it sits in, turns it (mouse)
//
// Stills are made lazily: requests queue up and are built in idle time a few at a time (never more
// than a few ms in one go), then every tagged <img> on the page is swapped to its still. Anything that
// fails leaves the flat icon in place.
import { VB, FINE } from '../deep/enemies/vox.js';
import { drawIconSmall, iconURL, weaponIconURL, iconKeyOf, drawWeapon, PixelCanvas, ICON } from '../gfx/PixelArt.js';
import { hashStr } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { METALS, INFUSIONS } from '../data/weapons.js';
import './itemVox.css';

const RES = 128; // still size (each voxel face ≈ 2×2 px: 1:1 at --icon on 2× screens, halves cleanly)
const HALF = 32; // the frame's half-height in voxels (a whole 64-px icon fits; larger shapes are fitted)
const LINE = 2; // the outline's width in still pixels (one icon pixel: it survives the halving)
const POSE = { yaw: -0.55, pitch: 0.38 }; // a still: turned a little toward you, seen a little from above
const OUTLINE = [26, 14, 8]; // the game's pixel-art outline brown
const TURN_N = 48, TURN_FPS = 14; // a turn: 48 frames (each drawn once, then replayed) ≈ 3.4 s a lap
const TAG = 'data:image/png;vox='; // a tagged flat icon: data:image/png;vox=<key>;base64,…
const DEBUG = { built: 0, failed: 0, buildMs: 0, drawMs: 0, encMs: 0, mainMs: 0, maxSliceMs: 0, slices: 0, swaps: 0, frames: 0, err: '' };

const stills = new Map(); // key → data URL | null (null: can't be made, keep the flat icon)
const queue = [], queued = new Set();
let scheduled = false;

const idle = (fn, timeout = 120) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout }) : setTimeout(() => fn({ timeRemaining: () => 8, didTimeout: true }), 16));
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ keys and sources
/** Key of a forged weapon's model (dots: the key rides in a data URL's MIME parameter). */
const wkey = (type, metal, inf) => `w.${type}.${metal}.${inf || ''}`;
const fromPixelArtKey = (k) => (k.startsWith('w:') ? 'w.' + k.slice(2).split(':').join('.') : k);
const flatOf = (key) => {
  if (key.startsWith('w.')) { const [, t, m, i] = key.split('.'); return weaponIconURL(t, m, i || undefined); }
  return iconURL(key);
};
/** The icon's pixels: RGBA, W×H (the raw art, as iconCanvas() draws it before its UI glow). */
function pixelsOf(key) {
  if (key.startsWith('w.')) {
    const [, type, metal, inf] = key.split('.');
    const pc = new PixelCanvas(ICON);
    drawWeapon(pc, type, METALS[metal]?.color ?? 0xa0a0a0, inf ? INFUSIONS[inf]?.color : null);
    return { d: pc.d, W: pc.w, H: pc.h };
  }
  if (!ITEMS[key]) return null;
  const pc = drawIconSmall(ITEMS[key].icon || { k: '?' }, hashStr(key), ICON, key); // the raw 64-px art: one voxel a pixel
  return { d: pc.d, W: pc.w, H: pc.h };
}

// ------------------------------------------------------------------ shapes
// half-thickness (voxels either side of the middle) from a pixel's distance in from the silhouette
// (64-px icons: the outline pixel stays one voxel, the bodies a little thicker than the 32-px models were)
const SHAPES = {
  paper: { t: (d) => (d < 2.5 ? 0 : 1), yaw: -0.42, pitch: 0.3 }, // a sheet (a card's thickness): plans, letters, tickets, swatches
  coin: { t: (d) => (d < 1.5 ? 0 : d < 3.5 ? 1 : d < 6 ? 2 : 3) }, // a disc with a rim
  slab: { t: (d) => (d < 1.5 ? 1 : d < 3 ? 3 : 4) }, // ingots: flat faces, square edges
  blade: { t: (d) => (d < 1.5 ? 0 : d < 3 ? 1 : d < 5 ? 2 : 3) }, // edges stay thin: blades, picks, chisels, sticks
  round: { t: (d) => (d < 1.5 ? 0 : Math.min(11, Math.round(Math.sqrt(d * 4.6)) - 1)) }, // the default: a soft rounded body
  chunky: { t: (d) => (d < 1.5 ? 0 : Math.min(15, Math.round(Math.sqrt(d * 7.4)) - 1)) }, // ore, gems, minerals: lumps
};
function shapeOf(key) {
  if (key.startsWith('w.')) return 'blade';
  const c = ITEMS[key]?.cat;
  if (c === 'blueprint' || c === 'floor' || c === 'wallpaper' || /ticket|note|map|letter|paper|card|hymn|page|scroll|feather|leaf|recipe/.test(key)) return 'paper';
  if (/coin|disc|medal|token|badge/.test(key)) return 'coin';
  if (c === 'ingot') return 'slab';
  if (c === 'mineral' || c === 'gem') return 'chunky';
  if (/pick|chisel|brush|sword|dagger|knife|blade|spear|shears|spade|axe|stick|fang|tusk|key/.test(key)) return 'blade';
  return 'round';
}
const shade = (c, k) => ((Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k));

/** The view: turned by yaw about the upright, then tipped by pitch toward you (x right, y up, z out). */
const view = (yaw, pitch) => ({ cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch) });
/** How far (in voxels) the model's corners reach from the frame's middle at each of these poses. */
function reachAt(cols, n, poses) {
  let r = 1;
  for (const p of poses) {
    const { cy, sy, cp, sp } = view(p.yaw, p.pitch);
    for (let i = 0; i < n; i++) {
      const o = i * 3, t = cols[o + 2] + 0.5;
      for (let c = 0; c < 8; c++) {
        const x = cols[o] + (c & 1), y = cols[o + 1] + ((c >> 1) & 1), z = c & 4 ? t : -t;
        const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y2 = y * cp - z1 * sp;
        const a = Math.max(Math.abs(x1), Math.abs(y2));
        if (a > r) r = a;
      }
    }
  }
  return r;
}

/**
 * How far the model reaches at any angle of a turn (yaw all round, pitch within p0..p1): a corner at
 * (x, y, z) sweeps a circle of radius hypot(x, z) about the upright, so this bound needs one pass.
 */
function reachTurn(cols, n, p0, p1) {
  let r = 1;
  const c0 = Math.cos(p0), s0 = Math.abs(Math.sin(p0)), c1 = Math.cos(p1), s1 = Math.abs(Math.sin(p1));
  for (let i = 0; i < n; i++) {
    const o = i * 3, t = cols[o + 2] + 0.5;
    for (let c = 0; c < 4; c++) {
      const x = cols[o] + (c & 1), y = Math.abs(cols[o + 1] + ((c >> 1) & 1));
      const h = Math.hypot(x, t);
      const a = Math.max(h, y * c0 + h * s0, y * c1 + h * s1);
      if (a > r) r = a;
    }
  }
  return r;
}

/** The voxel model of an icon: { pos, col, idx, fit (its still's), fitTurn (any turned angle), pose }, or null. */
function buildModel(key) {
  const t0 = performance.now();
  try {
    const px = pixelsOf(key);
    if (!px) return null;
    const { d, W, H } = px;
    // chamfer distance in from the silhouette (two passes)
    const dist = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) dist[i] = d[i * 4 + 3] > 100 ? 99 : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : dist[y * W + x]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4);
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4);
    }
    const shape = SHAPES[shapeOf(key)];
    // the voxels straight into the mesher's list (a 64-px icon is ~20-40k voxels: no Map on the way)
    const L = [];
    const vb = { list: () => L, v: { size: 0 } };
    const hx = W / 2, hy = H / 2;
    const cols = new Float32Array(W * H * 3); // each pixel's column: left, bottom, half-thickness
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!dist[i]) continue;
      const k = i * 4;
      const c = (d[k] << 16) | (d[k + 1] << 8) | d[k + 2];
      const t = Math.max(0, shape.t(dist[i]));
      // the faces keep the art's colour; the walls between layers are a shade darker (reads as depth)
      const wall = shade(c, 0.8);
      for (let z = -t; z <= t; z++) L.push({ x: x - hx, y: hy - 1 - y, z, c: z === t || z === -t || dist[i] < 1.5 ? c : wall });
      cols[n * 3] = x - hx; cols[n * 3 + 1] = hy - 1 - y; cols[n * 3 + 2] = t;
      n++;
    }
    if (!n) return null;
    const geo = VB.prototype.geo.call(vb, 0, 0, 0, FINE);
    // keep the arrays (in voxels, the layers centred on z = 0), not the geometry
    const P = geo.attributes.position.array, C = geo.attributes.color.array, I = geo.index.array;
    const pos = new Float32Array(P.length);
    for (let i = 0; i < P.length; i += 3) { pos[i] = P[i] / FINE; pos[i + 1] = P[i + 1] / FINE; pos[i + 2] = P[i + 2] / FINE - 0.5; }
    const model = { pos, col: Float32Array.from(C), idx: Uint32Array.from(I) };
    geo.dispose();
    // fitted to the frame (a voxel to spare for the outline): the still as posed, a turn at any angle
    const pose = { yaw: shape.yaw ?? POSE.yaw, pitch: shape.pitch ?? POSE.pitch };
    const room = HALF - 0.75;
    model.pose = pose;
    model.fit = Math.min(1, room / reachAt(cols, n, [pose]));
    model.fitTurn = Math.min(model.fit, room / reachTurn(cols, n, pose.pitch - 0.12, pose.pitch));
    return model;
  } catch (e) {
    DEBUG.err = String(e?.message || e);
    return null;
  } finally {
    DEBUG.buildMs += performance.now() - t0;
  }
}

// ------------------------------------------------------------------ drawing (a small z-buffered rasterizer)
// The mesh's colours are linear with the face shading and AO baked in (as the GPU would get them); the
// pixels are interpolated in linear light and written as sRGB, like an unlit material would show them.
const SRGB = new Uint8Array(4096);
for (let i = 0; i < 4096; i++) { const c = i / 4095; SRGB[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)); }
const zbuf = new Float32Array(RES * RES);
let SX = new Float32Array(4096), SY = new Float32Array(4096), SZ = new Float32Array(4096);

/**
 * Draw a model as job poses it ({ yaw, pitch, fit, s (scale), dy (lift, in half-frames) }) into a new
 * RES×RES ImageData, with a dark outline round its silhouette.
 */
function draw(m, job) {
  const t0 = performance.now();
  const { pos, col, idx } = m;
  const nv = pos.length / 3;
  if (SX.length < nv) { SX = new Float32Array(nv * 2); SY = new Float32Array(nv * 2); SZ = new Float32Array(nv * 2); }
  const { cy, sy, cp, sp } = view(job.yaw, job.pitch);
  const k = ((job.fit ?? m.fit) * (job.s ?? 1)) / HALF; // voxels → half-frames
  const half = RES / 2, lift = (job.dy || 0) * half;
  for (let i = 0, o = 0; i < nv; i++, o += 3) {
    const x = pos[o] * k, y = pos[o + 1] * k, z = pos[o + 2] * k;
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    SX[i] = half + x1 * half;
    SY[i] = half - (y * cp - z1 * sp) * half - lift;
    SZ[i] = y * sp + z1 * cp; // toward the viewer
  }
  const img = new ImageData(RES, RES), o8 = img.data;
  zbuf.fill(-1e9);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = SX[a], ay = SY[a], bx = SX[b], by = SY[b], cx = SX[c], cy2 = SY[c];
    const area = (bx - ax) * (cy2 - ay) - (by - ay) * (cx - ax);
    if (area >= -1e-9) continue; // a back face (counter-clockwise faces the viewer; y runs down here)
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(RES - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy2))), y1 = Math.min(RES - 1, Math.ceil(Math.max(ay, by, cy2)));
    if (x0 > x1 || y0 > y1) continue;
    const inv = 1 / area;
    const za = SZ[a], zb = SZ[b], zc = SZ[c];
    const ra = col[a * 3], ga = col[a * 3 + 1], ba = col[a * 3 + 2];
    const rb = col[b * 3], gb = col[b * 3 + 1], bb = col[b * 3 + 2];
    const rc = col[c * 3], gc = col[c * 3 + 1], bc = col[c * 3 + 2];
    for (let py = y0; py <= y1; py++) {
      const qy = py + 0.5;
      for (let px = x0; px <= x1; px++) {
        const qx = px + 0.5;
        const wa = ((cx - bx) * (qy - by) - (cy2 - by) * (qx - bx)) * inv;
        if (wa < 0) continue;
        const wb = ((ax - cx) * (qy - cy2) - (ay - cy2) * (qx - cx)) * inv;
        if (wb < 0) continue;
        const wc = 1 - wa - wb;
        if (wc < 0) continue;
        const z = wa * za + wb * zb + wc * zc, p = py * RES + px;
        if (z <= zbuf[p]) continue;
        zbuf[p] = z;
        const q = p * 4;
        o8[q] = SRGB[Math.min(4095, ((wa * ra + wb * rb + wc * rc) * 4095) | 0)];
        o8[q + 1] = SRGB[Math.min(4095, ((wa * ga + wb * gb + wc * gc) * 4095) | 0)];
        o8[q + 2] = SRGB[Math.min(4095, ((wa * ba + wb * bb + wc * bc) * 4095) | 0)];
        o8[q + 3] = 255;
      }
    }
  }
  // the outline: an icon pixel of brown round the silhouette (like the rest of the game's pixel art)
  for (let pass = 0; pass < LINE; pass++) {
    const on = (p) => o8[p * 4 + 3] === 255 && (pass === 0 ? zbuf[p] > -1e9 : true);
    const add = [];
    for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
      const p = y * RES + x;
      if (o8[p * 4 + 3]) continue;
      if ((x > 0 && on(p - 1)) || (x < RES - 1 && on(p + 1)) || (y > 0 && on(p - RES)) || (y < RES - 1 && on(p + RES))) add.push(p);
    }
    for (const p of add) { o8[p * 4] = OUTLINE[0]; o8[p * 4 + 1] = OUTLINE[1]; o8[p * 4 + 2] = OUTLINE[2]; o8[p * 4 + 3] = 255; }
  }
  DEBUG.drawMs += performance.now() - t0;
  return img;
}
let scratch = null;
const urlOfImage = (img) => {
  const t0 = performance.now();
  // (a CPU-side canvas: encoding never waits on the GPU, which may be busy drawing the world)
  if (!scratch) { scratch = document.createElement('canvas'); scratch.width = scratch.height = RES; }
  scratch.getContext('2d', { willReadFrequently: true }).putImageData(img, 0, 0);
  const u = scratch.toDataURL();
  DEBUG.encMs += performance.now() - t0;
  return u;
};
/** The still of a key, made now (data URL, or null if it can't be). */
function makeStill(key) {
  try {
    const m = buildModel(key);
    const u = m ? urlOfImage(draw(m, m.pose)) : null;
    if (u) DEBUG.built++; else DEBUG.failed++;
    return u;
  } catch (e) {
    DEBUG.err = String(e?.message || e);
    DEBUG.failed++;
    return null;
  }
}

// ------------------------------------------------------------------ the still queue
function want(key) {
  if (stills.has(key) || queued.has(key)) return;
  queued.add(key);
  queue.push(key);
  schedule();
}
function schedule() {
  if (scheduled || !queue.length) return;
  scheduled = true;
  idle(pump);
}
/** Make stills for as long as the idle time allows (at least one), then swap the waiting <img>s. */
function pump(deadline) {
  scheduled = false;
  const t0 = performance.now();
  const budget = deadline?.didTimeout ? 4 : Math.max(4, Math.min(10, deadline?.timeRemaining?.() ?? 6));
  let made = 0;
  while (queue.length && (!made || performance.now() - t0 < budget)) {
    const key = queue.shift();
    queued.delete(key);
    if (stills.has(key)) continue;
    stills.set(key, makeStill(key));
    made++;
  }
  if (made) swapTagged();
  const ms = performance.now() - t0;
  DEBUG.mainMs += ms; DEBUG.slices++;
  if (ms > DEBUG.maxSliceMs) DEBUG.maxSliceMs = ms;
  schedule();
}
/** Every tagged flat icon on the page whose still is ready shows the still now. */
function swapTagged() {
  for (const img of document.querySelectorAll(`img[src^="${TAG}"]`)) {
    const s = img.getAttribute('src');
    const u = stills.get(s.slice(TAG.length, s.indexOf(';', TAG.length)));
    if (u) { img.src = u; DEBUG.swaps++; }
  }
}

/** What an <img> should show for a key: the still, or the flat icon tagged so the still replaces it. */
let hoverOn = false;
function srcOf(key) {
  if (!hoverOn) { hoverOn = true; document.addEventListener('pointerover', onHover, { passive: true }); }
  const u = stills.get(key);
  if (u) return u;
  const flat = flatOf(key);
  if (u === null || !flat.startsWith('data:image/png;base64,')) return flat;
  want(key);
  return TAG + key + ';' + flat.slice(15);
}

// ------------------------------------------------------------------ turning
// A turn draws each of its frames the first time it's shown, then replays them.
class Turn {
  constructor(key, frames, jobAt) {
    this.n = frames; this.jobAt = jobAt;
    this.frames = new Array(frames);
    this.urls = new Array(frames);
    this.m = buildModel(key);
  }
  /** Frame i (ImageData), drawn now if it hasn't been. */
  get(i) {
    if (!this.frames[i] && this.m) { this.frames[i] = draw(this.m, this.jobAt(i, this.m)); DEBUG.frames++; }
    return this.frames[i] || null;
  }
  url(i) {
    if (!this.urls[i]) { const f = this.get(i); if (f) this.urls[i] = urlOfImage(f); }
    return this.urls[i] || null;
  }
}
const spinPose = (i, p) => {
  const a = (i / TURN_N) * Math.PI * 2;
  return { yaw: p.yaw + a, pitch: p.pitch - 0.06 + Math.sin(a) * 0.06 };
};
const turns = new Map(); // key → Turn (the last few share their frames between spins)
function turnOf(key) {
  let t = turns.get(key);
  if (!t) {
    t = new Turn(key, TURN_N, (i, m) => ({ ...spinPose(i, m.pose), fit: m.fitTurn }));
    if (!t.m) return null;
    turns.set(key, t);
    while (turns.size > 8) turns.delete(turns.keys().next().value);
  }
  return t;
}
/** Run a turn: show(i) at TURN_FPS while alive(ms) holds; returns { dispose }. */
function runTurn(show, alive) {
  let raf = 0, last = -1, on = true;
  const t0 = performance.now();
  const tick = (now) => {
    if (!on) return;
    if (!alive(now - t0)) { on = false; return; }
    raf = requestAnimationFrame(tick);
    const i = Math.floor(((now - t0) / 1000) * TURN_FPS) % TURN_N;
    if (i !== last) { last = i; show(i); }
  };
  raf = requestAnimationFrame(tick);
  return { dispose() { on = false; cancelAnimationFrame(raf); } };
}

/** An <img> turning in place (its src steps through the turn's frames); stops when it leaves the page. */
function turnImg(img, key) {
  if (reduced()) return null;
  const turn = turnOf(key);
  if (!turn) return null;
  let moved = false;
  const h = runTurn((i) => { const u = turn.url(i); if (u) { img.src = u; moved = true; } }, (ms) => img.isConnected || ms < 600);
  return { dispose() { h.dispose(); if (moved) img.src = srcOf(key); } };
}

// the pick-up flourish: one quick turn that lands on the still's pose, with a little hop
const POP_N = 14, POP_MS = 620;
const pops = new Map();
const popJob = (i, m) => {
  const t = i / (POP_N - 1), e = 1 - (1 - t) ** 3;
  return { yaw: m.pose.yaw - (1 - e) * Math.PI * 2, pitch: m.pose.pitch, fit: m.fitTurn + (m.fit - m.fitTurn) * e, s: 0.75 + 0.25 * e + Math.sin(t * Math.PI) * 0.08, dy: Math.sin(t * Math.PI) * 0.12 };
};
function popImg(img, key) {
  if (reduced() || !key) return;
  idle(() => {
    if (!img.isConnected) return;
    let turn = pops.get(key);
    if (!turn) { turn = new Turn(key, POP_N, popJob); if (!turn.m) return; pops.set(key, turn); while (pops.size > 12) pops.delete(pops.keys().next().value); }
    const t0 = performance.now();
    let last = -1;
    const tick = () => {
      if (!img.isConnected) return;
      const ms = performance.now() - t0;
      if (ms >= POP_MS) { img.src = srcOf(key); return; } // lands on the still
      const i = Math.min(POP_N - 1, Math.floor((ms / POP_MS) * POP_N));
      if (i !== last) { last = i; const u = turn.url(i); if (u) img.src = u; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, 250);
}

// hovering an icon with data-vox (or its box, or a button holding one) turns its item
let hovered = null;
function onHover(e) {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const t = e.target instanceof Element ? e.target : null;
  const box = t && (t.closest('[data-vox]') || t.closest('button, [role="button"], li')?.querySelector('[data-vox]'));
  if (box === hovered?.box) return;
  hovered?.h?.dispose();
  hovered = null;
  if (!box) return;
  const img = box.tagName === 'IMG' ? box : box.querySelector('img');
  if (img) hovered = { box, h: turnImg(img, box.dataset.vox) };
}

// ------------------------------------------------------------------ the API
export const itemVox = {
  /** (Kept for callers that lend the renderer: the stills are drawn on the CPU and need none.) */
  init() { schedule(); },
  ready() { return true; },
  /** Key of a forged weapon's model (for spin/img/data-vox). */
  wkey,
  /** What an <img> should show for an item: its 3D still, or (until that's made) its flat icon. */
  src(id) { return srcOf(id); },
  /** The same for a forged weapon. */
  weapon(type, metal, infusion) { return srcOf(wkey(type, metal, infusion)); },
  /** The same for a stack ({ id } or { w: weapon }). */
  stack(s) { return !s ? '' : s.w ? srcOf(wkey(s.w.type, s.w.metal, s.w.infusion)) : srcOf(s.id); },
  /** A flat iconURL()/weaponIconURL() string → the 3D version; anything else comes back as it was. */
  fromIcon(url) { const k = this.keyOf(url); return k ? srcOf(k) : url; },
  /** The key an icon string stands for (item id / weapon key), or null. */
  keyOf(url) {
    if (typeof url !== 'string') return null;
    if (url.startsWith(TAG)) return url.slice(TAG.length, url.indexOf(';', TAG.length));
    const k = iconKeyOf(url);
    if (k) return fromPixelArtKey(k);
    if (url.startsWith('data:image/png;base64,')) for (const [kk, u] of stills) if (u === url) return kk;
    return null;
  },
  /** Make stills ahead of time (a shop's stock as it opens…). */
  warm(keys) { for (const k of keys) if (k) want(k); },
  /**
   * An <img> of an item: what is an item id, a weapon key (wkey) or a flat icon URL (anything else
   * gets a plain <img> of it). opts.turn: it keeps turning while it's on the page; opts.pop: one
   * quick "picked up" turn as it appears.
   */
  img(what, cls = 'pix', { turn = false, pop = false, alt = '' } = {}) {
    const key = typeof what === 'string' && (ITEMS[what] || what.startsWith('w.')) ? what : this.keyOf(what);
    const img = document.createElement('img');
    img.className = cls;
    img.alt = alt;
    img.draggable = false;
    img.src = key ? srcOf(key) : what;
    if (!key) return img;
    if (turn) requestAnimationFrame(() => requestAnimationFrame(() => { if (img.isConnected) turnImg(img, key); }));
    else if (pop) popImg(img, key);
    return img;
  },
  /** Turn an <img> that's already on the page (returns { dispose } or null). */
  turn(img, key) { return turnImg(img, key); },
  /** One quick "picked up" turn on an <img> (it lands on the still). */
  pop(img, key) { popImg(img, key || this.keyOf(img?.getAttribute?.('src'))); },
  /** A still right now: made on the spot if it isn't yet (data URL), or null. */
  url(id) {
    if (!stills.has(id)) { queued.delete(id); stills.set(id, makeStill(id)); }
    return stills.get(id);
  },
  /** A canvas in el with the model turning (key: id or wkey); { canvas, dispose } or null. */
  spin(el, key) {
    if (reduced()) return null;
    const turn = turnOf(key);
    if (!turn) return null;
    const cv = document.createElement('canvas');
    cv.width = cv.height = RES;
    cv.className = 'vox-spin pix';
    el.append(cv);
    const ctx = cv.getContext('2d');
    ctx.putImageData(turn.get(0), 0, 0); // (frame 0 is the still's angle: no blank moment)
    const h = runTurn((i) => { const f = turn.get(i); if (f) ctx.putImageData(f, 0, 0); }, (ms) => cv.isConnected || ms < 600);
    return { canvas: cv, dispose() { h.dispose(); cv.remove(); } };
  },
  /** Numbers for the curious (and the perf check); reset: start counting again. */
  stats(reset = false) {
    const out = { ...DEBUG, stills: stills.size, queued: queue.length, turns: turns.size, pops: pops.size };
    if (reset) for (const k in DEBUG) DEBUG[k] = typeof DEBUG[k] === 'number' ? 0 : '';
    return out;
  },
  _build: buildModel,
};

// Items as 3D voxel art for the UI. An item's 32×32 pixel icon (or a forged weapon's) is extruded into
// a voxel model, shaped by what it is (paper stays a sheet, a blade stays thin, an ore lump is a lump),
// meshed with the creatures' mesher (baked face shading and corner AO) and rendered with the game's own
// renderer into a small target (no extra GL context; one art pixel ≈ a 2×2 block of the 64 px still).
//
//   itemVox.src(id) → string             what an <img> should show: the 3D still once it's made, until
//                                         then the flat icon, tagged so the still replaces it by itself
//   itemVox.weapon(type, metal, inf)      the same for a forged weapon
//   itemVox.fromIcon(url)                 the same for a flat iconURL()/weaponIconURL() string (toasts)
//   itemVox.img(key, cls, { turn, pop })  an <img> of it; turn: keeps turning while on the page;
//                                         pop: one quick "picked up" turn when it appears
//   itemVox.spin(el, key) → { dispose }   a canvas in el turning the model (the backpack's item tag)
//   itemVox.url(id) → data URL | null     the still right now (built on the spot if need be)
//   data-vox="key" on an icon's box: hovering it (or the button it sits in) turns it (mouse only)
//
// Stills are built lazily: requests queue up, are meshed in idle time a few at a time, rendered as
// one atlas and read back asynchronously (no GPU stall), then every tagged <img> on the page is
// swapped to its still. Anything that can't be done (no renderer, no icon, a lost context) leaves
// the flat icon in place.
import * as THREE from 'three';
import { VB, FINE } from '../deep/enemies/vox.js';
import { drawIconArt, iconURL, weaponIconURL, iconKeyOf, drawWeapon, PixelCanvas } from '../gfx/PixelArt.js';
import { hashStr } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { METALS, INFUSIONS } from '../data/weapons.js';
import './itemVox.css';

const RES = 64; // still size (each voxel face ≈ 2×2 px: crisp at --icon, and halves cleanly to --icon-s)
const COLS = 8, ROWS = 4, BATCH = COLS * ROWS; // the atlas a batch of stills is drawn into
const HALF = 16; // camera half-height in voxels (a whole 32-px icon fits; larger shapes are fitted)
const POSE = { yaw: -0.55, pitch: 0.38 }; // a still: turned a little toward you, seen a little from above
const OUTLINE = [26, 14, 8]; // the game's pixel-art outline brown
const TURN_N = 48, TURN_FPS = 14; // a turn: 48 frames (cached after the first lap) ≈ 3.4 s
const TAG = 'data:image/png;vox='; // a tagged flat icon: data:image/png;vox=<key>;base64,…
const DEBUG = { built: 0, failed: 0, buildMs: 0, mainMs: 0, batches: 0, jobs: 0, readMs: 0, swaps: 0, err: '' };

let R = null;
const stills = new Map(); // key → data URL | null (null: can't be made, keep the flat icon)
const queue = [], queued = new Set();
let scene = null, cam = null, mat = null, rtAtlas = null, rtLive = null, holder = null, mesh = null, EMPTY = null;
let pumping = false, scheduled = false, dead = false;

const renderer = () => {
  if (!R && !dead) R = window.__game?.engine?.renderer || null; // (whoever asks first, the game's lent it by then)
  return dead ? null : R;
};
const idle = (fn, timeout = 200) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout }) : setTimeout(() => fn({ timeRemaining: () => 8, didTimeout: true }), 16));
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ keys and sources
/** Key of a forged weapon's model (dots: the key rides in a data URL's MIME parameter). */
const wkey = (type, metal, inf) => `w.${type}.${metal}.${inf || ''}`;
const flatOf = (key) => {
  if (key.startsWith('w.')) { const [, t, m, i] = key.split('.'); return weaponIconURL(t, m, i || undefined); }
  return iconURL(key);
};
/** The icon's pixels: RGBA, W×H. */
function pixelsOf(key) {
  if (key.startsWith('w.')) {
    const [, type, metal, inf] = key.split('.');
    const pc = new PixelCanvas(32);
    drawWeapon(pc, type, METALS[metal]?.color ?? 0xa0a0a0, inf ? INFUSIONS[inf]?.color : null);
    return { d: pc.d, W: pc.w, H: pc.h };
  }
  if (!ITEMS[key]) return null;
  // the raw art, as iconCanvas() draws it before its UI glow (reading a canvas back would cost more)
  const pc = drawIconArt(ITEMS[key].icon || { k: '?' }, hashStr(key), key);
  return { d: pc.d, W: pc.w, H: pc.h };
}

// ------------------------------------------------------------------ shapes
// half-thickness (voxels either side of the middle) from a pixel's distance in from the silhouette
const SHAPES = {
  paper: { t: () => 0, yaw: -0.42, pitch: 0.3 }, // a sheet: plans, letters, tickets, swatches
  coin: { t: (d) => (d >= 2 ? 1 : 0) }, // a disc with a rim
  slab: { t: (d) => (d < 1.5 ? 1 : 2) }, // ingots, bricks of stuff: flat faces, square edges
  blade: { t: (d) => (d < 1.5 ? 0 : 1) }, // edges stay one voxel: blades, picks, chisels, sticks
  round: { t: (d) => Math.min(5, Math.round(Math.sqrt(d * 2.2)) - 1) }, // the default: a soft rounded body
  chunky: { t: (d) => Math.min(7, Math.round(Math.sqrt(d * 3.6)) - 1) }, // ore, gems, minerals: lumps
};
function shapeOf(key) {
  if (key.startsWith('w.')) return 'blade';
  const it = ITEMS[key] || {};
  const c = it.cat;
  if (c === 'blueprint' || c === 'floor' || c === 'wallpaper' || /ticket|note|map|letter|paper|card|hymn|page|scroll|feather|leaf|recipe/.test(key)) return 'paper';
  if (/coin|disc|medal|token|badge/.test(key)) return 'coin';
  if (c === 'ingot') return 'slab';
  if (c === 'mineral' || c === 'gem') return 'chunky';
  if (/pick|chisel|brush|sword|dagger|knife|blade|spear|shears|spade|axe|stick|fang|tusk|key/.test(key)) return 'blade';
  return 'round';
}
const shade = (c, k) => ((Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k));

/** The voxel model of an icon: { geo, fit, pose }, or null. */
function buildModel(key) {
  const t0 = performance.now();
  try {
    const px = pixelsOf(key);
    if (!px) return null;
    const { d, W, H } = px;
    const solid = (x, y) => d[(y * W + x) * 4 + 3] > 100;
    // chamfer distance in from the silhouette (two passes)
    const dist = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) dist[y * W + x] = solid(x, y) ? 99 : 0;
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
    const vb = new VB(7);
    const hx = W / 2, hy = H / 2;
    let reach = 0, n = 0;
    const p = 0.44, cp = Math.cos(p), sp = Math.sin(p); // the steepest pitch a turn reaches
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!dist[i]) continue;
      const k = i * 4;
      const c = (d[k] << 16) | (d[k + 1] << 8) | d[k + 2];
      const t = Math.max(0, shape.t(dist[i]));
      // the faces keep the art's colour; the walls between layers are a shade darker (reads as depth)
      for (let z = -t; z <= t; z++) vb.set(x - hx, hy - 1 - y, z, z === t || z === -t || dist[i] < 1.5 ? c : shade(c, 0.8));
      n++;
      // how far it can reach from the middle at any yaw (and at the turn's pitch): fitted to the frame
      const ax = Math.max(Math.abs(x - hx), Math.abs(x + 1 - hx)), ay = Math.max(Math.abs(hy - y), Math.abs(hy - 1 - y));
      const rxz = Math.hypot(ax, t + 0.5);
      reach = Math.max(reach, rxz, ay * cp + rxz * sp);
    }
    if (!n) return null;
    const geo = vb.geo(0, 0, 0, FINE);
    geo.deleteAttribute('normal'); // (unlit: the shading's baked into the colours)
    geo.computeBoundingSphere();
    return { geo, fit: Math.min(1, (HALF - 1) / Math.max(1, reach)), pose: { yaw: shape.yaw ?? POSE.yaw, pitch: shape.pitch ?? POSE.pitch } };
  } catch (e) {
    DEBUG.err = String(e?.message || e);
    return null;
  } finally {
    DEBUG.buildMs += performance.now() - t0;
  }
}
// ------------------------------------------------------------------ drawing
function setup() {
  if (scene) return;
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  cam.position.set(0, 0, 4);
  mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  EMPTY = new THREE.BufferGeometry();
  mesh = new THREE.Mesh(EMPTY, mat);
  mesh.frustumCulled = false;
  holder = new THREE.Group();
  holder.add(mesh);
  scene.add(holder);
  const opt = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false };
  rtAtlas = new THREE.WebGLRenderTarget(RES * COLS, RES * ROWS, opt);
  rtLive = new THREE.WebGLRenderTarget(RES, RES, opt);
  rtAtlas.texture.colorSpace = rtLive.texture.colorSpace = THREE.SRGBColorSpace;
}

/**
 * Draw models into tiles of a target: jobs [{ m, yaw, pitch, s, dy }] go left to right, bottom to top.
 * The renderer's state (target, clear colour, auto-clear, stats) is put back as it was.
 */
function drawTiles(rt, jobs) {
  setup();
  const prev = R.getRenderTarget(), auto = R.autoClear;
  const cc = R.getClearColor(new THREE.Color()), ca = R.getClearAlpha();
  const info = R.info.render, saved = { calls: info.calls, triangles: info.triangles, points: info.points, lines: info.lines };
  try {
    R.autoClear = false;
    rt.viewport.set(0, 0, rt.width, rt.height);
    R.setRenderTarget(rt);
    R.setClearColor(0x000000, 0);
    R.clear(true, true, false);
    jobs.forEach((j, i) => {
      rt.viewport.set((i % COLS) * RES, Math.floor(i / COLS) * RES, RES, RES);
      R.setRenderTarget(rt);
      const k = (j.m.fit * (j.s ?? 1)) / (FINE * HALF); // voxels → camera units
      mesh.geometry = j.m.geo;
      mesh.scale.setScalar(k);
      mesh.position.set(0, 0, -0.5 * FINE * k); // (the voxel layers sit at z ∈ [-t, t+1])
      holder.rotation.set(j.pitch, j.yaw, 0, 'YXZ');
      holder.position.set(0, j.dy || 0, 0);
      R.render(scene, cam);
    });
  } finally {
    mesh.geometry = EMPTY;
    R.setRenderTarget(prev);
    R.autoClear = auto;
    R.setClearColor(cc, ca);
    Object.assign(info, saved);
  }
}
/** Read a target's lower-left w×h back; async (a fence, no stall) where the renderer can. */
function readBack(rt, w, h) {
  const buf = new Uint8Array(w * h * 4);
  if (R.readRenderTargetPixelsAsync) return R.readRenderTargetPixelsAsync(rt, 0, 0, w, h, buf).then(() => buf);
  R.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  return Promise.resolve(buf);
}
/** Tile i of a read-back atlas (w px wide) as ImageData, flipped upright, with a dark outline round it. */
function tileImage(buf, w, i, img = new ImageData(RES, RES)) {
  const tx = (i % COLS) * RES, ty = Math.floor(i / COLS) * RES;
  const o = img.data;
  for (let y = 0; y < RES; y++) {
    const src = ((ty + RES - 1 - y) * w + tx) * 4;
    o.set(buf.subarray(src, src + RES * 4), y * RES * 4);
  }
  // the outline: one pixel of brown round the silhouette (like the rest of the game's pixel art)
  const a = new Uint8Array(RES * RES);
  for (let p = 0; p < RES * RES; p++) a[p] = o[p * 4 + 3] > 40 ? 1 : 0;
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
    const p = y * RES + x;
    if (a[p]) { o[p * 4 + 3] = 255; continue; }
    if ((x > 0 && a[p - 1]) || (x < RES - 1 && a[p + 1]) || (y > 0 && a[p - RES]) || (y < RES - 1 && a[p + RES])) {
      o[p * 4] = OUTLINE[0]; o[p * 4 + 1] = OUTLINE[1]; o[p * 4 + 2] = OUTLINE[2]; o[p * 4 + 3] = 255;
    } else o[p * 4 + 3] = 0;
  }
  return img;
}
let scratch = null;
const urlOfImage = (img) => {
  if (!scratch) { scratch = document.createElement('canvas'); scratch.width = scratch.height = RES; }
  scratch.getContext('2d').putImageData(img, 0, 0);
  return scratch.toDataURL();
};
const fail = () => { dead = true; R = null; };

// ------------------------------------------------------------------ the still queue
function want(key) {
  if (stills.has(key) || queued.has(key) || dead) return;
  queued.add(key);
  queue.push(key);
  schedule();
}
function schedule() {
  if (scheduled || pumping || !queue.length) return;
  scheduled = true;
  idle(pump);
}
/** One batch: mesh what the idle time allows, draw them as one atlas, read it back, swap the <img>s. */
function pump(deadline) {
  scheduled = false;
  if (pumping || !queue.length) return;
  if (!renderer()) { if (!dead) setTimeout(schedule, 500); return; }
  pumping = true;
  const t0 = performance.now();
  const budget = deadline?.didTimeout ? 4 : Math.max(4, Math.min(12, deadline?.timeRemaining?.() ?? 8));
  const jobs = [];
  while (queue.length && jobs.length < BATCH && (performance.now() - t0 < budget || !jobs.length)) {
    const key = queue.shift();
    queued.delete(key);
    if (stills.has(key)) continue;
    const m = buildModel(key);
    if (!m) { stills.set(key, null); DEBUG.failed++; continue; }
    jobs.push({ key, m, ...m.pose });
  }
  if (!jobs.length) { pumping = false; schedule(); return; }
  const w = Math.min(jobs.length, COLS) * RES, h = Math.ceil(jobs.length / COLS) * RES;
  let read;
  try {
    setup();
    drawTiles(rtAtlas, jobs);
    read = readBack(rtAtlas, w, h);
  } catch (e) { read = Promise.reject(e); }
  const tr = performance.now();
  DEBUG.mainMs += tr - t0;
  DEBUG.batches++;
  DEBUG.jobs += jobs.length;
  read.then((buf) => {
    DEBUG.readMs += performance.now() - tr;
    // turn the tiles into stills a few at a time (encoding a PNG isn't free), swapping as they're ready
    let i = 0;
    const step = () => {
      const s0 = performance.now();
      while (i < jobs.length && performance.now() - s0 < 5) {
        const j = jobs[i];
        try { stills.set(j.key, urlOfImage(tileImage(buf, w, i))); DEBUG.built++; } catch (e) { stills.set(j.key, null); DEBUG.failed++; }
        i++;
      }
      swapTagged();
      DEBUG.mainMs += performance.now() - s0;
      if (i < jobs.length) { idle(step, 100); return; }
      done();
    };
    step();
  }).catch((e) => { DEBUG.err = String(e?.message || e); for (const j of jobs) stills.set(j.key, null); fail(); done(); });
  function done() {
    for (const j of jobs) j.m.geo.dispose();
    pumping = false;
    schedule();
  }
}
/** Every tagged flat icon on the page whose still is ready shows the still now. */
function swapTagged() {
  for (const img of document.querySelectorAll(`img[src^="${TAG}"]`)) {
    const s = img.getAttribute('src');
    const key = s.slice(TAG.length, s.indexOf(';', TAG.length));
    const u = stills.get(key);
    if (u) { img.src = u; DEBUG.swaps++; }
  }
}

/** What an <img> should show for a key: the still, or the flat icon tagged so the still replaces it. */
function srcOf(key) {
  const u = stills.get(key);
  if (u) return u;
  const flat = flatOf(key);
  if (u === null || dead || !flat.startsWith('data:image/png;base64,')) return flat;
  want(key);
  return TAG + key + ';' + flat.slice(15);
}

// ------------------------------------------------------------------ turning
// A turn renders each of its frames once (async), then plays them from the cache.
class Turn {
  constructor(key, frames, poseAt) {
    this.key = key; this.n = frames; this.poseAt = poseAt;
    this.frames = new Array(frames);
    this.busy = false;
    this.m = buildModel(key);
  }
  drop() { this.m?.geo.dispose(); this.m = null; }
  /** Frame i now, or null (asked for: cb(img) when it comes). */
  get(i, cb) {
    if (this.frames[i]) return this.frames[i];
    if (this.busy || !this.m || !renderer()) return null;
    this.busy = true;
    let read;
    try {
      setup();
      drawTiles(rtLive, [{ m: this.m, ...this.poseAt(i, this.m.pose) }]);
      read = readBack(rtLive, RES, RES);
    } catch (e) { read = Promise.reject(e); }
    read.then((buf) => { this.busy = false; this.frames[i] = tileImage(buf, RES, 0); cb?.(this.frames[i]); }).catch(() => { this.busy = false; this.m = null; });
    return null;
  }
}
const spinPose = (i, p) => {
  const a = (i / TURN_N) * Math.PI * 2;
  return { yaw: p.yaw + a, pitch: p.pitch - 0.08 + Math.sin(a) * 0.1 };
};
const turns = new Map(); // key → Turn (the last few spins share their frames)
function turnOf(key) {
  let t = turns.get(key);
  if (!t || !t.m) {
    t = new Turn(key, TURN_N, spinPose);
    if (!t.m) return null;
    turns.set(key, t);
    while (turns.size > 6) { const k0 = turns.keys().next().value; turns.get(k0).drop(); turns.delete(k0); }
  }
  return t;
}
/** Run a turn: draw(imageData, i) at TURN_FPS while alive() holds; returns { dispose }. */
function runTurn(turn, draw, alive) {
  let raf = 0, last = -1, on = true;
  const t0 = performance.now();
  const tick = (now) => {
    if (!on) return;
    if (!alive(now - t0)) { on = false; return; }
    raf = requestAnimationFrame(tick);
    const i = Math.floor(((now - t0) / 1000) * TURN_FPS) % TURN_N;
    if (i === last) return;
    const f = turn.get(i, (img) => { if (on && i === Math.floor(((performance.now() - t0) / 1000) * TURN_FPS) % TURN_N) { last = i; draw(img, i); } });
    if (f) { last = i; draw(f, i); }
  };
  raf = requestAnimationFrame(tick);
  return { dispose() { on = false; cancelAnimationFrame(raf); } };
}

/** An <img> turning in place (its src cycles through the turn's frames); stops when it leaves the page. */
function turnImg(img, key, { hover = false } = {}) {
  if (reduced() || !renderer()) return null;
  const turn = turnOf(key);
  if (!turn) return null;
  const urls = turn.urls || (turn.urls = new Array(TURN_N));
  const rest = () => srcOf(key);
  let born = false;
  const h = runTurn(turn, (f, i) => { img.src = urls[i] || (urls[i] = urlOfImage(f)); born = true; }, (ms) => img.isConnected || ms < 600);
  return { dispose() { h.dispose(); if (born) img.src = rest(); } };
}

// the pick-up flourish: one quick turn that lands on the still's pose, with a little hop
const POP_N = 14, POP_MS = 620;
const pops = new Map();
const popPose = (i, p) => {
  const t = i / (POP_N - 1), e = 1 - (1 - t) ** 3;
  return { yaw: p.yaw - (1 - e) * Math.PI * 2, pitch: p.pitch, s: 0.72 + 0.28 * e + Math.sin(t * Math.PI) * 0.12, dy: Math.sin(t * Math.PI) * 0.16 };
};
function popImg(img, key) {
  if (reduced() || !renderer()) return;
  idle(() => {
    if (!img.isConnected) return;
    let turn = pops.get(key);
    if (!turn || !turn.m) { turn = new Turn(key, POP_N, popPose); if (!turn.m) return; pops.set(key, turn); while (pops.size > 10) { const k0 = pops.keys().next().value; pops.get(k0).drop(); pops.delete(k0); } }
    const urls = turn.urls || (turn.urls = new Array(POP_N));
    const t0 = performance.now();
    let last = -1;
    const tick = () => {
      if (!img.isConnected) return;
      const i = Math.min(POP_N - 1, Math.floor(((performance.now() - t0) / POP_MS) * POP_N));
      if (i !== last) {
        const f = turn.get(i, (fr) => { if (i === last && img.isConnected && i < POP_N - 1) img.src = urls[i] || (urls[i] = urlOfImage(fr)); });
        if (f) img.src = urls[i] || (urls[i] = urlOfImage(f));
        last = i;
      }
      if (performance.now() - t0 < POP_MS + 60) requestAnimationFrame(tick);
      else img.src = srcOf(key); // lands on the still (or the flat icon if it isn't made yet)
    };
    requestAnimationFrame(tick);
  }, 300);
}

// hovering an icon box with data-vox (or a button holding one) turns its item
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
  init(game) {
    if (!R && !dead) R = game?.engine?.renderer || null;
    if (!this._hover) { this._hover = true; document.addEventListener('pointerover', onHover, { passive: true }); }
    schedule();
  },
  ready() { return !!renderer(); },
  /** Key of a forged weapon's model (for spin/img). */
  wkey,
  /** What an <img> should show for an item: its 3D still, or (until that's made) its flat icon. */
  src(id) { return srcOf(id); },
  /** The same for a forged weapon. */
  weapon(type, metal, infusion) { return srcOf(wkey(type, metal, infusion)); },
  /** The same for a stack ({ id } or { w: weapon }). */
  stack(s) { return !s ? '' : s.w ? srcOf(wkey(s.w.type, s.w.metal, s.w.infusion)) : srcOf(s.id); },
  /** A flat iconURL()/weaponIconURL() string → the 3D version; anything else comes back as it was. */
  fromIcon(url, game) {
    if (game) this.init(game);
    const k = typeof url === 'string' ? iconKeyOf(url) : null;
    if (!k) return url;
    return srcOf(k.startsWith('w:') ? 'w.' + k.slice(2).split(':').join('.') : k);
  },
  /** The key an icon string stands for (item id / weapon key), or null. */
  keyOf(url) {
    if (typeof url !== 'string') return null;
    if (url.startsWith(TAG)) return url.slice(TAG.length, url.indexOf(';', TAG.length));
    const k = iconKeyOf(url);
    if (k) return k.startsWith('w:') ? 'w.' + k.slice(2).split(':').join('.') : k;
    if (url.startsWith('data:image/png;base64,')) for (const [kk, u] of stills) if (u === url) return kk;
    return null;
  },
  /** Queue stills ahead of time (a shop's stock as it opens…). */
  warm(keys) { for (const k of keys) if (k) want(k); },
  /**
   * An <img> of an item: what is an item id, a weapon key (wkey) or a flat icon URL (anything else
   * gets a plain <img> of it). opts.turn: it keeps turning while it's on the page; opts.pop: one
   * quick "picked up" turn as it appears; opts.game: lends the renderer if nobody has yet.
   */
  img(what, cls = 'pix', { turn = false, pop = false, alt = '', game = null } = {}) {
    if (game) this.init(game);
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
  /** A still right now: built on the spot if it isn't yet (data URL), or null. */
  url(id) {
    if (stills.has(id)) return stills.get(id);
    if (!renderer()) return null;
    const m = buildModel(id);
    let u = null;
    if (m) {
      try {
        setup();
        drawTiles(rtLive, [{ m, ...m.pose }]);
        const buf = new Uint8Array(RES * RES * 4);
        R.readRenderTargetPixels(rtLive, 0, 0, RES, RES, buf);
        u = urlOfImage(tileImage(buf, RES, 0));
      } catch (e) { u = null; }
      m.geo.dispose();
    }
    stills.set(id, u);
    return u;
  },
  /** A canvas in el with the model turning (key: id or wkey); { canvas, dispose } or null. */
  spin(el, key) {
    if (reduced() || !renderer()) return null;
    const turn = turnOf(key);
    if (!turn) return null;
    const cv = document.createElement('canvas');
    cv.width = cv.height = RES;
    cv.className = 'vox-spin pix';
    el.append(cv);
    const ctx = cv.getContext('2d');
    const h = runTurn(turn, (f) => ctx.putImageData(f, 0, 0), (ms) => cv.isConnected || ms < 600);
    return { canvas: cv, dispose() { h.dispose(); cv.remove(); } };
  },
  /** Numbers for the curious (and the perf check). */
  _build: buildModel, _pixels: pixelsOf,
  stats() { return { ...DEBUG, stills: stills.size, queued: queue.length, turns: turns.size, pops: pops.size }; },
};

// Live 3D portraits: the game's real character rigs (Old Star, the hero mole, Deep Town folk and
// keepers, the burrow traders, Rocco, Nugget the hen) rendered head-and-shoulders into tiny offscreen
// render targets on the game's own WebGLRenderer (no extra GL contexts), read back asynchronously
// and composed over a painted pixel backdrop with a dark outline, at the UI's pixel grid (one canvas
// pixel = one --px art pixel). Three-point light per backdrop (key, cool fill, a warm rim), idle
// breathing and blinks from the rig, mouth flaps while text types, a head tilt and an expression per
// line, eyes on the viewer. Rigs are cached per character; only visible portraits render (~24 fps).
//
//   import { portrait3d } from '../gfx/portrait3d.js';
//   portrait3d.init(game)                        // once (the Tutor does it): the renderer to borrow
//   const h = portrait3d.mount(el, who, { mood, w, h, backdrop, fps })
//   h.set(mood, { hold, tilt })  // the face for a line: calm happy stern proud worried laugh, or any
//                                // rig expression (surprised sad angry smug thinking sleepy ...)
//   h.talk(on)                   // true: the mouth flaps until talk(false); a number: for that long
//   h.nudge(k)                   // a little bob of the head (a new line, a sale)
//   h.dispose()                  // also happens by itself a few seconds after el leaves the page
//   h.canvas, h.who, h.ready (Promise), h.disposed
//   portrait3d.warm(who)         // build a rig ahead of time (idle time), so the first line is instant
//   portrait3d.still(who, { mood, w, h }) → Promise<canvas>, portrait3d.stillURL(who, mood) (cached)
//   portrait3d.cast(who)         // { key, name, voice, backdrop, mood } or null: who that is
//   portrait3d.stats()           // { live, rendered, studios, ms } for perf checks
// who: 'oldstar' | 'hero' | 'nugget' | 'rocco' | a shop id (tools grocer furniture blueprints outfitter
//   assay ticket trader herbalist outpost) | a name ('Old Star', 'Granny Thistle', 'Grubb', a Deep
//   Town folk's name while you're in town) | { spec, backdrop, voice } | a character spec object.
// el: a <canvas> to draw into, or any element (a canvas is made inside it, class "p3d").
import * as THREE from 'three';
import { makeCharacter, makeChicken } from './characters.js';
import { SHOPS } from '../data/shops.js';
import { KEEPER_MOODS } from '../town/moods.js';
import { randomSpec } from './char/spec.js';

// Deep Town's villagers by id and name (quests & lore data), when that file is there
const VILLAGERS = Object.values(import.meta.glob('../data/villagers.js', { eager: true }))[0]?.VILLAGERS || {};

let game = null;
let renderer = null;
const handles = new Set();
const studios = new Map(); // key → [Studio]
const MAX_STUDIOS = 10;
const SS = 2; // supersampling of the 3D render (folded down to the art grid by fold())
/**
 * Live portraits: canvas pixels per art pixel. One canvas pixel per CSS pixel (--px: 2, 3 or 4), so
 * the face is drawn as finely as the page shows it, at a whole-number scale (crisp, never smeared).
 */
function liveDensity() {
  let px = 3;
  try { px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3; } catch (e) { /* no DOM */ }
  return Math.max(1, Math.min(4, Math.round(px)));
}
let raf = 0, lastT = 0, rr = 0;
const perf = { rendered: 0, ms: 0, frames: 0, composeMs: 0, composed: 0 };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Color();

function getRenderer() {
  if (renderer) return renderer;
  const g = game || (typeof window !== 'undefined' ? window.__game : null);
  return g?.engine?.renderer || null;
}

// ------------------------------------------------------------------ the cast
/** The town keepers' grown-up extras (mirrors TownScene's KEEPER_LOOKS, so they look the same). */
const KEEPER_LOOKS = {
  tools: { belt: 2, shirt: 0x9a3a32, rolled: true, boots: 0x4a2e1e, brows: 'bushy', dirt: 0.5 },
  grocer: { shirt: 0x6a8ab0, rolled: true, belt: 0, boots: false },
  furniture: { shirt: 0xd8ccb0, belt: 0, boots: 0x6a4a2a, rolled: true },
  blueprints: { belt: 0, boots: 0x3a2a22 },
  outfitter: { belt: 1, boots: 0x7a5232 },
  assay: { belt: 0, boots: 0x3a2a22, brows: 'bushy' },
  ticket: { belt: 0, boots: 0x1e1618 },
  lift: { shirt: 0xb84a3a, rolled: true, belt: 2, boots: 0x5a3a24 },
};
const SHOP_BACKDROP = { trader: 'trader', herbalist: 'herb', rocco: 'storage', outpost: 'outpost', assay: 'assay', ticket: 'ticket' };

/** Voices: base pitch, wave and colour of the blips (Tutor / talk boards play them). */
const CAST = {
  oldstar: {
    key: 'oldstar', name: 'Old Star', backdrop: 'forge', mood: 'neutral', voice: { f: 205, type: 'square', q: 1.6, mumble: true },
    build: async () => {
      const m = await import('./char/starmole.js');
      const r = m.makeStarMole({ height: 1 });
      r.setPick?.(false);
      r.setLamp?.(0.7);
      return r;
    },
  },
  hero: {
    key: 'hero', name: 'You', backdrop: 'cave', mood: 'neutral', voice: { f: 240, type: 'square', q: 1.4 },
    build: async () => {
      const m = await import('./char/hero.js');
      const r = m.makeHeroMole({ height: 1, pack: true, hammer: true, goggles: 'up' });
      return r;
    },
  },
  nugget: {
    key: 'nugget', name: 'Nugget', backdrop: 'coop', mood: 'neutral', hen: true, voice: { f: 620, type: 'triangle', q: 2.2, cluck: true },
    build: () => makeChicken({ kind: 'toon' }),
  },
  rocco: {
    key: 'rocco', name: 'Rocco', backdrop: 'storage', mood: 'smug', voice: { f: 190, type: 'sawtooth', q: 2.4, vib: 9 },
    build: async () => {
      const m = await import('../deep/traders/rocco.js');
      return m.makeRocco();
    },
  },
};
const ALIAS = {
  oldstar: 'oldstar', 'old star': 'oldstar', star: 'oldstar', 'old_star': 'oldstar',
  hero: 'hero', player: 'hero', you: 'hero', me: 'hero', mole: 'hero',
  nugget: 'nugget', hen: 'nugget', chicken: 'nugget', coop: 'nugget',
  rocco: 'rocco', raccoon: 'rocco',
};

function keeperCast(id) {
  const shop = SHOPS[id];
  if (!shop?.keeper) return null;
  if (id === 'rocco' || shop.keeper.raccoon) return CAST.rocco;
  const k = shop.keeper;
  const burrow = shop.panel === 'burrow';
  const spec = burrow ? k : { seed: 9, eyes: 'bead', dirt: 0.2, blush: true, ...KEEPER_LOOKS[id], ...k, hat: k.hat || 'none', glasses: k.glasses || false };
  const mood = burrow ? (k.mood || 'neutral') : (KEEPER_MOODS[id]?.mood || 'happy');
  return {
    key: 'shop:' + id, name: k.name, backdrop: SHOP_BACKDROP[id] || 'shop', mood,
    voice: { f: k.voice || 300, type: k.voice > 340 ? 'triangle' : 'square', q: 1.5 },
    build: () => makeCharacter(spec, { kind: 'toon' }),
  };
}

function specCast(spec, o = {}) {
  let h = 0;
  const s = JSON.stringify(spec);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const age = spec.age;
  const f = o.voice?.f || spec.voice || { baby: 560, kid: 470, adult: 320, elder: 240 }[age] || 320;
  return {
    key: 'spec:' + h, name: o.name || spec.name || '', backdrop: o.backdrop || 'town', mood: spec.mood || 'neutral',
    voice: { f, type: f > 360 ? 'triangle' : 'square', q: 1.5, ...(o.voice || {}) },
    build: () => makeCharacter(spec, { kind: 'toon' }),
  };
}

/** Who that is: a cast entry ({ key, name, voice, backdrop, mood, build }) or null. */
export function castOf(who) {
  if (!who) return null;
  if (typeof who === 'object') {
    if (who.build && who.key) return who;
    if (who.who) { const c = castOf(who.who); return c && who.backdrop ? { ...c, backdrop: who.backdrop } : c; }
    const spec = who.spec || who;
    if (!spec.species && !spec.seed) return null;
    return specCast(spec, who.spec ? who : {});
  }
  const s = String(who).trim();
  const k = s.toLowerCase();
  if (ALIAS[k]) return CAST[ALIAS[k]];
  if (SHOPS[k]) return keeperCast(k);
  for (const [id, sh] of Object.entries(SHOPS)) if (sh.keeper?.name && sh.keeper.name.toLowerCase() === k) return keeperCast(id);
  // a villager (by id or name): the keepers are their shops, the rest built from their seed and look
  const vid = VILLAGERS[k] ? k : Object.keys(VILLAGERS).find((id) => VILLAGERS[id]?.name?.toLowerCase() === k);
  const v = vid && VILLAGERS[vid];
  if (v) {
    if (v.keeper && SHOPS[v.keeper] && !(v.look && v.look.species)) return keeperCast(v.keeper);
    const spec = v.seed ? randomSpec(v.seed, v.look || {}) : v.look?.species ? v.look : null;
    if (spec) return specCast(spec, { name: v.name, backdrop: 'town' });
  }
  // Deep Town folk by name (while the town is loaded)
  const g = game || (typeof window !== 'undefined' ? window.__game : null);
  const list = g?.scene?.folk?.list;
  if (Array.isArray(list)) {
    const f = list.find((n) => n?.name && n.name.toLowerCase() === k);
    if (f?.spec) return specCast(f.spec, { name: f.name, voice: f.a?.voice ? { f: f.a.voice } : undefined });
  }
  return null;
}

// ------------------------------------------------------------------ backdrops (painted, pixel art)
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mixc = (a, b, t) => { const A = rgb(a), B = rgb(b); return ((A[0] + (B[0] - A[0]) * t) << 16) | ((A[1] + (B[1] - A[1]) * t) << 8) | (A[2] + (B[2] - A[2]) * t); };
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

class Ras {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c, a = 1) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.d;
    if (a >= 1) { d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255; return; }
    d[i] += (((c >> 16) & 255) - d[i]) * a; d[i + 1] += (((c >> 8) & 255) - d[i + 1]) * a; d[i + 2] += ((c & 255) - d[i + 2]) * a; d[i + 3] = 255;
  }
  get(x, y) { const i = (y * this.w + x) * 4, d = this.d; return (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; }
  rect(x, y, w, h, c, a) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a); }
  /** vertical gradient, dithered into bands */
  vgrad(c0, c1, bands = 6) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const t = y / Math.max(1, this.h - 1);
      const q = Math.min(bands, Math.floor(t * bands + bay(x, y)));
      this.set(x, y, mixc(c0, c1, q / bands));
    }
  }
  /** a soft light pool (dithered bands toward c) */
  glow(cx, cy, r, c, k = 0.5, bands = 4) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.1) / r;
      if (d >= 1) continue;
      const v = (1 - d) * (1 - d);
      const q = Math.floor(v * bands + bay(x, y)) / bands;
      if (q > 0) this.set(x, y, c, Math.min(1, q * k));
    }
  }
  disk(cx, cy, r, c, a) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c, a); }
  line(x0, y0, x1, y1, c, a) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c, a);
  }
  speckle(p, c, a, r) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (r() < p) this.set(x, y, c, a); }
  vignette(k = 0.35) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const dx = (x + 0.5) / this.w - 0.5, dy = (y + 0.5) / this.h - 0.5;
      const d = Math.max(0, Math.hypot(dx * 1.1, dy) - 0.32) / 0.4;
      const q = Math.floor(Math.min(1, d) * 3 + bay(x, y)) / 3;
      if (q > 0) this.set(x, y, 0x06030a, q * k);
    }
  }
}

/** Planks, shelves of jars and boxes (shop backs). */
function shelves(R, r, y0, wood, items = 7) {
  const W = R.w;
  R.rect(0, y0, W, 2, wood[2]);
  R.rect(0, y0 + 2, W, 1, wood[0]);
  for (let x = 0; x < W; x += 3 + ((r() * 3) | 0)) {
    const w = 2 + ((r() * 3) | 0), h = 3 + ((r() * 5) | 0);
    const c = [0x6a8a5a, 0x8a4a3a, 0xb08a48, 0x4a6a8a, 0x7a5a7a, 0xa87a4a, 0x5a7a6a][(r() * 7) | 0];
    R.rect(x, y0 - h, w, h, mixc(c, wood[0], 0.35));
    R.set(x, y0 - h, mixc(c, 0xffffff, 0.2));
    if (r() < 0.5) R.rect(x, y0 - h - 1, w, 1, mixc(wood[2], 0x000000, 0.2));
    if (--items < -20) break;
  }
}

const PAINT = {
  forge(R, r) {
    const W = R.w, H = R.h;
    R.vgrad(0x1a1014, 0x2c1a14, 7);
    R.speckle(0.07, 0x120a0c, 0.6, r);
    // brick arch of the forge at the right, lit from below
    for (let y = Math.floor(H * 0.18); y < H; y++) {
      const row = Math.floor(y / 3), off = (row & 1) * 3;
      for (let x = Math.floor(W * 0.7); x < W; x++) {
        const fade = (x - W * 0.7) / (W * 0.3);
        if (fade + bay(x, y) * 0.5 < 0.45) continue;
        const mortar = y % 3 === 0 || (x + off) % 6 === 0;
        R.set(x, y, mortar ? 0x241210 : ((x + off) / 6 + row) % 3 < 1 ? 0x5e2c1c : 0x4c2418);
      }
    }
    R.glow(W * 0.92, H * 1.02, W * 0.95, 0xe0702a, 0.6, 5);
    R.glow(W * 0.98, H * 0.95, W * 0.4, 0xffb050, 0.45, 3);
    // a rail of tools top-left: tongs and a hammer
    R.rect(1, Math.round(H * 0.12), Math.round(W * 0.42), 1, 0x3a2a24);
    const ry = Math.round(H * 0.12);
    const tx = Math.round(W * 0.1);
    R.line(tx, ry, tx - 1, ry + 9, 0x2a1c1e); R.line(tx + 1, ry, tx + 2, ry + 9, 0x2a1c1e);
    const hx = Math.round(W * 0.3);
    R.rect(hx, ry, 1, 9, 0x3a261c); R.rect(hx - 2, ry + 8, 5, 3, 0x2a2228); R.set(hx - 2, ry + 8, 0x4a3e44);
    R.vignette(0.45);
  },
  cave(R, r) {
    const W = R.w, H = R.h;
    R.vgrad(0x120e1c, 0x221a2a, 7);
    // strata
    for (let i = 0; i < 5; i++) {
      const y0 = r() * H, s = (r() - 0.5) * 0.5;
      for (let x = 0; x < W; x++) { const y = Math.round(y0 + x * s + Math.sin(x * 0.3 + i) * 1.2); if ((x + i) % 5 !== 0) R.set(x, y, 0x0c0814, 0.5); }
    }
    R.speckle(0.05, 0x2e2638, 0.6, r);
    R.glow(W * 0.12, H * 0.08, W * 0.75, 0x7a5228, 0.4, 4); // a lamp somewhere up the tunnel
    R.glow(W * 0.9, H * 0.9, W * 0.5, 0x5a3a5a, 0.2, 3);
    // roots from the roof
    for (let i = 0; i < 3; i++) { let x = r() * W, y = 0; for (let k = 0; k < H * 0.3; k++) { R.set(x, y, 0x1a1210); x += (r() - 0.5) * 1.2; y += 1; } }
    R.vignette(0.4);
  },
  town(R, r) {
    const W = R.w, H = R.h;
    R.vgrad(0x161a2a, 0x2a2230, 7);
    // far houses: dark blocks with warm windows
    for (let x = 0; x < W;) {
      const w = 6 + ((r() * 7) | 0), h = Math.round(H * (0.28 + r() * 0.22));
      R.rect(x, H - h, w, h, 0x1a1622);
      R.rect(x, H - h, w, 1, 0x2e2638);
      for (let k = 0; k < 2; k++) if (r() < 0.7) { const wx = x + 1 + ((r() * (w - 3)) | 0), wy = H - h + 2 + ((r() * (h - 5)) | 0); R.rect(wx, wy, 2, 2, 0xe8b050); R.set(wx, wy, 0xffe090); }
      x += w + 1;
    }
    R.glow(W * 0.15, H * 0.1, W * 0.7, 0xffb060, 0.3, 4);
    R.vignette(0.4);
  },
  shop(R, r, o = {}) {
    const W = R.w, H = R.h;
    const wood = o.wood || [0x7a4e2c, 0x553220, 0x3c2214];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const b = Math.floor(x / 6);
      R.set(x, y, x % 6 === 0 ? 0x2a180e : b % 2 ? wood[1] : mixc(wood[1], wood[2], 0.35));
    }
    R.speckle(0.06, wood[2], 0.5, r);
    shelves(R, r, Math.round(H * 0.36), wood);
    shelves(R, r, Math.round(H * 0.8), wood);
    if (o.tint) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) R.set(x, y, o.tint, 0.22);
    R.glow(W * 0.12, H * 0.02, W * 0.8, o.lamp || 0xffc070, 0.38, 4);
    R.vignette(0.45);
  },
  assay(R, r) { PAINT.shop(R, r, { wood: [0x4a5a3c, 0x2e3a2a, 0x1e2a1e], lamp: 0xffd890 }); },
  ticket(R, r) { PAINT.shop(R, r, { wood: [0x3a5a5a, 0x22383a, 0x162628], lamp: 0xffe0a0, tint: 0x1a2a2a }); },
  trader(R, r) {
    const W = R.w, H = R.h;
    R.vgrad(0x7a6c5a, 0x5a4e40, 6);
    R.speckle(0.06, 0x4a4034, 0.5, r);
    for (let i = 0; i < 3; i++) { let x = r() * W, y = r() * H * 0.5; for (let k = 0; k < 6; k++) { R.set(x, y, 0x463c30); x += r() < 0.5 ? 1 : 0; y += 1; } }
    const wy = Math.round(H * 0.6);
    for (let y = wy; y < H; y++) for (let x = 0; x < W; x++) R.set(x, y, x % 5 === 0 ? 0x2a180e : y === wy ? 0x8a5a32 : 0x5a3a20);
    R.rect(0, Math.round(H * 0.18), W, 2, 0x4a2e18);
    R.glow(W * 0.88, H * 0.05, W * 0.7, 0xffc070, 0.35, 4);
    R.vignette(0.5);
  },
  herb(R, r) {
    const W = R.w, H = R.h;
    R.vgrad(0x182014, 0x283420, 7);
    R.speckle(0.06, 0x101808, 0.6, r);
    R.glow(W * 0.05, H * 1.0, W * 0.8, 0xc88a3a, 0.4, 4);
    R.rect(0, 2, W, 2, 0x3a2a1a);
    for (let x = 2; x < W; x += 5 + ((r() * 3) | 0)) {
      const n = 6 + ((r() * 6) | 0), g = [0x4a6a2a, 0x6a8a3a, 0x7a6a2a, 0x8a4a5a][(r() * 4) | 0];
      R.line(x, 4, x, 6, 0xb8a070);
      for (let k = 0; k < n; k++) { R.set(x + Math.round((r() - 0.5) * 3), 6 + k, g); }
    }
    for (let i = 0; i < 7; i++) { const x = r() * W * 0.5, y = H - 1 - r() * H * 0.25; R.set(x, y, 0x6af0d0); R.set(x, y - 1, 0x2a8a7a); }
    R.vignette(0.45);
  },
  storage(R, r) {
    const W = R.w, H = R.h;
    R.vgrad(0x18141c, 0x2a2026, 7);
    // crate stacks
    for (let x = -4; x < W;) {
      const s = 9 + ((r() * 6) | 0), h = 1 + ((r() * 3) | 0);
      for (let k = 0; k < h; k++) {
        const y = H - (k + 1) * s;
        R.rect(x, y, s, s, 0x30241c);
        for (let j = y + 3; j < y + s; j += 3) R.rect(x, j, s, 1, 0x261c16);
        R.rect(x, y, s, 1, 0x4a3828); R.rect(x, y, 1, s, 0x3a2c20);
        R.line(x, y + s - 1, x + s - 1, y, 0x3e2e22);
      }
      x += s + 1;
    }
    R.glow(W * 0.85, H * 0.12, W * 0.75, 0xffa040, 0.4, 4);
    R.glow(W * 0.1, H * 0.5, W * 0.6, 0x6a3a8a, 0.25, 3);
    R.vignette(0.5);
  },
  outpost(R, r) {
    const W = R.w, H = R.h;
    for (let y = 0; y < H; y++) {
      const row = Math.floor(y / 3), off = (row & 1) * 3;
      for (let x = 0; x < W; x++) R.set(x, y, y % 3 === 0 || (x + off) % 6 === 0 ? 0x1e100c : ((x + off) / 6 + row) % 4 < 1 ? 0x4a2a20 : 0x3c2018);
    }
    R.rect(0, Math.round(H * 0.3), W, 2, 0x5a5a62); // iron band
    R.rect(0, Math.round(H * 0.3), W, 1, 0x8a8a94);
    // the banner, right
    const bx = Math.round(W * 0.74), bw = Math.round(W * 0.2);
    R.rect(bx, 0, bw, Math.round(H * 0.55), 0x7a2222);
    R.rect(bx, 0, 1, Math.round(H * 0.55), 0xd8a020); R.rect(bx + bw - 1, 0, 1, Math.round(H * 0.55), 0xd8a020);
    R.rect(bx + Math.round(bw / 2) - 1, Math.round(H * 0.2), 3, 3, 0xd8a020);
    R.glow(W * 0.08, H * 1.0, W * 0.8, 0xff7a30, 0.5, 4);
    R.vignette(0.45);
  },
  coop(R, r) {
    const W = R.w, H = R.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) R.set(x, y, [0x6a4022, 0x86562e, 0x86562e, 0xa06c3c, 0xb8834c, 0x3a2010][y % 6]);
    R.speckle(0.05, 0x4a2a14, 0.5, r);
    const cx = W / 2, cy = H * 0.56, rad = Math.min(W, H) * 0.46;
    R.disk(cx, cy, rad + 1.5, 0x5a3418);
    for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; R.set(cx + Math.cos(t) * (rad + 0.5) - 0.5, cy + Math.sin(t) * (rad + 0.5) - 0.5, a % 2 ? 0x9a6234 : 0x7a4a26); }
    R.disk(cx, cy, rad - 0.5, 0x1e140c);
    R.glow(cx, cy + rad * 0.6, rad * 1.2, 0x5a3a1a, 0.5, 3);
    for (let i = 0; i < 18; i++) { const x = cx + (r() - 0.5) * rad * 1.6, y = cy + rad * (0.55 + r() * 0.35); if (Math.hypot(x - cx, y - cy) < rad - 1) R.line(x, y, x + (r() - 0.5) * 4, y - 1 - r() * 2, r() < 0.5 ? 0xd8b058 : 0xb8903a); }
    R.glow(W * 0.15, 0, W * 0.6, 0xffd080, 0.25, 3);
  },
};

/** Motes drawn over the backdrop each frame: [color, count, kind]. */
const MOTES = {
  forge: { c: [0xffd070, 0xff8a2a, 0xffb040], n: 7, kind: 'rise', from: [0.75, 1] },
  cave: { c: [0xffe0a0, 0xe0b878], n: 6, kind: 'twinkle' },
  town: { c: [0xffe08a, 0xffc060], n: 5, kind: 'twinkle' },
  shop: { c: [0xfff0c0, 0xe8d0a0], n: 4, kind: 'drift' },
  assay: { c: [0xfff0c0], n: 3, kind: 'drift' },
  ticket: { c: [0xfff0c0], n: 3, kind: 'drift' },
  trader: { c: [0xfff4d0], n: 4, kind: 'drift' },
  herb: { c: [0xb0f080, 0x80e0c0], n: 6, kind: 'rise', from: [0.2, 1] },
  storage: { c: [0xc8b8a8, 0xa89888], n: 5, kind: 'drift' },
  outpost: { c: [0xffb040, 0xff7a2a], n: 6, kind: 'rise', from: [0.1, 1] },
  coop: { c: [0xf0d890, 0xd8b058], n: 3, kind: 'drift' },
};

/** Lights per backdrop: hemisphere sky/ground, key, cool fill, warm rim, outline ink. */
const LIGHTS = {
  // (fills are a soft, nearly neutral lavender and rims are lamplight: the old saturated blue fills
  // and cyan rims turned every face in the interface blue, the hero's most of all)
  forge: { sky: 0xffe8d0, ground: 0x3a2018, hemi: 1.0, key: 0xfff0dc, keyI: 1.7, fill: 0xb4a8c8, fillI: 0.3, rim: 0xff8a3a, rimI: 3.0, ink: 0x120808 },
  cave: { sky: 0xf6ece0, ground: 0x2a2024, hemi: 1.05, key: 0xfff4e8, keyI: 1.65, fill: 0xb0a4c4, fillI: 0.3, rim: 0xffb070, rimI: 2.2, ink: 0x0c0808 },
  town: { sky: 0xfff0e0, ground: 0x2a2030, hemi: 1.05, key: 0xfff0dc, keyI: 1.6, fill: 0xb4a8c8, fillI: 0.3, rim: 0xffb060, rimI: 2.4, ink: 0x0e0a14 },
  shop: { sky: 0xfff0e0, ground: 0x3a2418, hemi: 1.1, key: 0xfff2dc, keyI: 1.6, fill: 0xb8acc8, fillI: 0.28, rim: 0xffc070, rimI: 2.4, ink: 0x140a06 },
  trader: { sky: 0xfff4e4, ground: 0x3a2a1a, hemi: 1.15, key: 0xfff4e0, keyI: 1.6, fill: 0xb8acc8, fillI: 0.28, rim: 0xffc070, rimI: 2.2, ink: 0x140c06 },
  herb: { sky: 0xf0ffe0, ground: 0x203018, hemi: 1.05, key: 0xfff4dc, keyI: 1.6, fill: 0x70c0a0, fillI: 0.4, rim: 0xd8f080, rimI: 2.4, ink: 0x080e06 },
  storage: { sky: 0xf6eee8, ground: 0x281a24, hemi: 1.0, key: 0xfff0dc, keyI: 1.6, fill: 0xb8a0d0, fillI: 0.32, rim: 0xffa040, rimI: 2.6, ink: 0x0e080e },
  outpost: { sky: 0xffe8d8, ground: 0x30140c, hemi: 1.0, key: 0xfff0dc, keyI: 1.6, fill: 0xb4a8c8, fillI: 0.28, rim: 0xff7a40, rimI: 2.8, ink: 0x120604 },
  coop: { sky: 0xfff4e0, ground: 0x3a2412, hemi: 1.15, key: 0xfff4e4, keyI: 1.5, fill: 0xb8acc8, fillI: 0.25, rim: 0xffd080, rimI: 2.2, ink: 0x1a0c06 },
};
LIGHTS.assay = { ...LIGHTS.shop, rim: 0xffe0a0 };
LIGHTS.ticket = { ...LIGHTS.shop, rim: 0xffe6b0 };

const bgCache = new Map();
function backdrop(kind, W, H) {
  const k = `${kind}|${W}x${H}`;
  if (bgCache.has(k)) return bgCache.get(k);
  const R = new Ras(W, H);
  let seed = 7;
  for (const ch of kind) seed = seed * 31 + ch.charCodeAt(0);
  (PAINT[kind] || PAINT.cave)(R, rng(seed));
  bgCache.set(k, R.d);
  return R.d;
}

// ------------------------------------------------------------------ studios (a rig in its own little scene)
class Studio {
  constructor(cast, rig) {
    this.cast = cast;
    this.rig = rig;
    this.hen = !!cast.hen || !rig.anchors;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(20, 1, 0.01, 60);
    this.scene.add(this.cam);
    // where they look: a point by the camera, a little toward the words (3/4 faces read best)
    this.gaze = new THREE.Object3D();
    this.cam.add(this.gaze);
    this.lights = null;
    this.setLights(cast.backdrop);
    this.scene.add(rig.root);
    this.busy = false;
    this.used = performance.now();
    rig.play?.('idle');
    if (rig.face) rig.face(0, true);
    for (let i = 0; i < 8; i++) rig.update(1 / 30);
    rig.root.updateMatrixWorld(true);
    this.frameIt();
    // aim before anyone looks at the camera (else the first frames turn the head toward the origin)
    this.aim(1, 1, new THREE.Vector3(), new THREE.Vector3(0.24, 0.05, 1).normalize());
    rig.lookAt?.(this.gaze);
  }

  /** Let the head settle on where it looks now (a mount shows the face at rest, no swing in). */
  settle() {
    const r = this.rig;
    for (let i = 0; i < 3; i++) r.update(0.4);
  }

  setLights(kind) {
    if (this.lightKind === kind) return;
    this.lightKind = kind;
    const L = LIGHTS[kind] || LIGHTS.cave;
    if (this.lights) for (const l of this.lights) { this.scene.remove(l); l.dispose?.(); }
    const hemi = new THREE.HemisphereLight(L.sky, L.ground, L.hemi);
    const key = new THREE.DirectionalLight(L.key, L.keyI); key.position.set(-1.4, 1.6, 2.0);
    const fill = new THREE.DirectionalLight(L.fill, L.fillI); fill.position.set(2.0, 0.2, 0.8);
    const rim = new THREE.DirectionalLight(L.rim, L.rimI); rim.position.set(1.6, 1.3, -1.8);
    const rim2 = new THREE.DirectionalLight(L.rim, L.rimI * 0.45); rim2.position.set(-1.8, 0.6, -1.4);
    this.lights = [hemi, key, fill, rim, rim2];
    for (const l of this.lights) this.scene.add(l);
    this.ink = L.ink;
  }

  /** Head-and-shoulders: from just over the head (or hat) down to the chest. */
  frameIt() {
    const r = this.rig;
    if (this.hen) {
      const box = new THREE.Box3().setFromObject(r.root);
      const top = box.max.y, h = box.max.y - box.min.y;
      r.head?.getWorldPosition(_v);
      this.span = h * 0.72;
      this.top = top + h * 0.04;
      this.center = new THREE.Vector3(0, this.top - this.span / 2, (_v.z || 0) * 0.5);
      this.headRest = (r.head ? r.head.getWorldPosition(new THREE.Vector3()) : this.center.clone());
      return;
    }
    const a = r.anchors;
    const top = r.neck.localToWorld(_v.copy(a.headTop)).y;
    const neckY = r.neck.getWorldPosition(_v2).y;
    const headSpan = Math.max(top - neckY, a.headH * 1.05);
    this.span = headSpan / (this.cast.frame ?? 0.74);
    this.top = top + this.span * 0.06;
    this.center = new THREE.Vector3(0, this.top - this.span / 2, r.neck.getWorldPosition(_v2).z * 0.6);
    this.headRest = r.neck.getWorldPosition(new THREE.Vector3());
  }

  aim(W, H, follow, dir) {
    const cam = this.cam;
    cam.aspect = W / H;
    const span = this.span * Math.max(1, (H / W) * 0.92);
    const dist = (span * 0.5) / Math.tan((cam.fov * Math.PI) / 360);
    const c = _v.copy(this.center).add(follow);
    cam.position.copy(c).addScaledVector(dir, dist);
    cam.lookAt(c);
    cam.near = dist * 0.3; cam.far = dist * 4;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  dispose() {
    this.scene.remove(this.rig.root);
    try { this.rig.dispose?.(); } catch (e) { /* already gone */ }
    for (const l of this.lights || []) l.dispose?.();
  }
}

const building = new Map(); // key → Promise<rig> (one build at a time per key)
async function acquire(cast) {
  const list = studios.get(cast.key) || [];
  const free = list.find((s) => !s.busy);
  if (free) { free.busy = true; free.used = performance.now(); return free; }
  let rig;
  if (!list.length && building.has(cast.key)) {
    await building.get(cast.key);
    return acquire(cast);
  }
  const p = Promise.resolve().then(() => cast.build());
  if (!list.length) building.set(cast.key, p);
  try { rig = await p; } finally { building.delete(cast.key); }
  if (!rig) throw new Error('portrait3d: no rig for ' + cast.key);
  const s = new Studio(cast, rig);
  s.busy = true;
  const l2 = studios.get(cast.key) || [];
  l2.push(s);
  studios.set(cast.key, l2);
  trim();
  return s;
}
function release(s) { if (s) { s.busy = false; s.used = performance.now(); } }
function trim() {
  const all = [...studios.values()].flat();
  if (all.length <= MAX_STUDIOS) return;
  const free = all.filter((s) => !s.busy).sort((a, b) => a.used - b.used);
  for (const s of free.slice(0, all.length - MAX_STUDIOS)) {
    const l = studios.get(s.cast.key);
    l.splice(l.indexOf(s), 1);
    if (!l.length) studios.delete(s.cast.key);
    s.dispose();
  }
}

// ------------------------------------------------------------------ handles
const HEN_MOOD = { happy: 'happy', laugh: 'happy', joy: 'happy', proud: 'happy', smug: 'happy', worried: 'sad', sad: 'sad', hungry: 'sad', stern: 'cross', angry: 'cross', surprised: 'surprised', surprise: 'surprised' };
const TILT = { calm: 0.04, neutral: 0.04, happy: 0.1, laugh: 0.05, proud: -0.06, smug: -0.08, stern: -0.03, worried: 0.14, sad: 0.12, surprised: 0, thinking: 0.16, angry: -0.02 };
const PITCH = { proud: -0.1, smug: -0.08, worried: 0.06, sad: 0.12, stern: 0.05, thinking: -0.06, laugh: -0.08 };

class Handle {
  constructor(el, cast, o) {
    this.cast = cast;
    this.who = cast?.key || null;
    this.W = Math.max(8, Math.round(o.w || o.size || 48));
    this.H = Math.max(8, Math.round(o.h || o.size || o.w || 48));
    this.fps = o.fps || 24;
    this.kind = o.backdrop || cast?.backdrop || 'cave';
    if (el && el.tagName === 'CANVAS') { this.canvas = el; this.own = false; } else {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'p3d pix';
      this.own = true;
      el?.append(this.canvas);
    }
    // live portraits draw at twice the art grid (D): the face keeps its features (a 40-pixel face
    // smeared them into blobs); the box on the page stays W × H art pixels, the backdrop keeps the
    // art grid. Stills (toasts, the strip) stay at 1.
    this.D = Math.max(1, Math.round(o.density ?? (el ? liveDensity() : 1)));
    this.CW = this.W * this.D;
    this.CH = this.H * this.D;
    this.canvas.width = this.CW;
    this.canvas.height = this.CH;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(this.CW, this.CH);
    this.ss = o.ss ?? SS; // supersampling: rendered at ss× and folded down to the grid
    this.px = new Uint8Array(this.CW * this.CH * this.ss * this.ss * 4);
    this.small = new Uint8Array(this.CW * this.CH * 4);
    this.bg = upscale(backdrop(this.kind, this.W, this.H), this.W, this.H, this.D);
    this.mood = o.mood || cast?.mood || 'calm';
    this.acc = 1;
    this.t = Math.random() * 10;
    this.tilt = 0; this.tiltTo = TILT[this.mood] ?? 0.04; this.pitch = 0; this.bob = 0;
    this.follow = new THREE.Vector3();
    this.dir = new THREE.Vector3(o.side === 'left' ? -0.24 : 0.24, 0.05, 1).normalize();
    this.talkOn = false; this.talkT = 0;
    this.gazeSide = o.side === 'left' ? -1 : 1; this.gazeX = this.gazeSide; this.gazeT = 0;
    this.offT = 0;
    this.disposed = false;
    this.studio = null;
    this.motes = this.makeMotes();
    // the backdrop right away (with the last picture of them, if there is one: a line after a
    // pause shows the face at once), the live character as soon as the rig is ready
    this.compose(null);
    const last = cast && lastPics.get(`${cast.key}|${this.CW}x${this.CH}|${this.kind}`);
    if (last) { this.img.data.set(last); this.ctx.putImageData(this.img, 0, 0); }
    // a face never seen at this size yet: its first picture is read back at once (a one-off wait for
    // the GPU, ~a frame), so it's never just a backdrop; later pictures go through the async path
    this.firstPic = !last;
    this.ready = cast ? acquire(cast).then(async (s) => {
      if (this.disposed) { release(s); return null; }
      s.setLights(this.kind);
      // compile its shaders off the frame where the browser can (KHR_parallel_shader_compile), for
      // a render target like ours (the programs differ from the screen's), so the first picture never hitches
      const R = getRenderer();
      if (R?.compileAsync && !s.compiled) {
        s.compiled = true;
        this.rt ||= makeRT(this.CW * this.ss, this.CH * this.ss);
        const prev = R.getRenderTarget();
        let p = null;
        try { R.setRenderTarget(this.rt); p = R.compileAsync(s.scene, s.cam); } catch (e) { p = null; } finally { R.setRenderTarget(prev); }
        if (p) await p.catch(() => {});
        if (this.disposed) { release(s); return null; }
      }
      this.studio = s;
      s.aim(this.W, this.H, this.follow, this.dir);
      const dist = s.cam.position.distanceTo(s.center);
      s.gaze.position.set(this.gazeX * dist * 0.13, 0, 0);
      s.rig.lookAt?.(s.gaze);
      s.settle();
      if (s.rig.shifty) s.rig.shifty(1);
      this.applyMood(true);
      if (!s.hen && (this.talkOn || this.talkT > 0)) s.rig.talk?.(this.talkOn ? true : this.talkT);
      this.acc = 1;
      // the first picture now, not on some later frame (frames can be slow or throttled)
      if (this.canvas.isConnected && !this.pending) { try { this.render(); } catch (e) { console.warn('[portrait3d] render', e); this.pending = false; } }
      return this;
    }).catch((e) => { console.warn('[portrait3d]', e); return null; }) : Promise.resolve(null);
  }

  makeMotes() {
    const M = MOTES[this.kind];
    if (!M) return [];
    const r = rng(this.W * 7 + this.H);
    return Array.from({ length: M.n }, () => ({ x: r() * this.W, y: r() * this.H, p: r() * 10, s: 0.5 + r(), c: M.c[(r() * M.c.length) | 0] }));
  }

  /** The face for a line (tutor moods or rig expressions). */
  set(mood, o = {}) {
    if (mood) this.mood = mood;
    this.tiltTo = (o.tilt ?? TILT[this.mood] ?? 0.05) * (Math.random() < 0.5 ? -1 : 1);
    this.bob = 1;
    this.applyMood(false, o.hold);
    return this;
  }

  applyMood(first, hold) {
    const s = this.studio;
    if (!s) return;
    const r = s.rig;
    if (s.hen) {
      const m = HEN_MOOD[this.mood] || 'ok';
      this.henMood = m;
      if (!first && (m === 'happy' || m === 'surprised')) r.flap?.(m === 'surprised' ? 0.5 : 0.35);
      return;
    }
    if (typeof r.setExpression === 'function') {
      try {
        if (hold) r.setExpression(this.mood, { hold, body: true });
        else r.setExpression(this.mood, { body: !first });
      } catch (e) { /* older rigs */ }
    }
    if (!first) r.blink?.();
    if (this.cast?.key === 'oldstar' && !first) r.sniff?.(0.6);
  }

  talk(on = 1.5) {
    if (on === true) { this.talkOn = true; this.talkT = 0; } else if (on === false || on == null) { this.talkOn = false; this.talkT = 0; } else { this.talkT = +on || 0; }
    const r = this.studio?.rig;
    if (r && !this.studio.hen) r.talk?.(on === true ? true : on === false || on == null ? false : +on);
    return this;
  }

  nudge(k = 1) { this.bob = Math.max(this.bob, k); return this; }

  get visible() {
    const c = this.canvas;
    if (!c.isConnected) return false;
    if (c.checkVisibility) return c.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    return c.offsetParent !== null;
  }

  tick(dt) {
    if (this.disposed) return false;
    if (!this.canvas.isConnected) {
      this.offT += dt;
      if (this.offT > 4) this.dispose();
      return false;
    }
    this.offT = 0;
    this.acc += dt;
    // full rate while talking or reacting, half rate while just breathing and blinking
    const fps = this.talkOn || this.talkT > 0 || this.bob > 0 ? this.fps : Math.min(this.fps, 12);
    if (this.acc < 1 / fps || this.pending) return false;
    if (!this.visible) { this.acc = Math.min(this.acc, 0.5); return false; }
    return true;
  }

  /** Animate, render, read back. */
  render() {
    const dt = Math.min(0.25, this.acc);
    this.acc = 0;
    this.t += dt;
    const s = this.studio;
    if (!s) { this.compose(null); return; }
    const R = getRenderer();
    if (!R) return;
    const r = s.rig;
    if (this.talkT > 0) this.talkT = Math.max(0, this.talkT - dt);
    const talking = this.talkOn || this.talkT > 0;
    // the gaze: toward the words, a glance at you when a line starts, now and then a look away
    this.gazeT -= dt;
    if (this.bob > 0.8) this.gazeT = 1.4;
    if (this.gazeT < -6 - (this.t % 3)) this.gazeT = 1.2;
    const gx = this.gazeT > 0 ? 0 : this.gazeSide;
    this.gazeX += (gx - this.gazeX) * (1 - Math.exp(-dt * 4));
    const dist = s.cam.position.distanceTo(s.center);
    s.gaze.position.set(this.gazeX * dist * 0.13, -0.05 * dist * Math.max(0, this.pitch), 0);
    r.update(dt);
    // the extras: a head tilt per line, a little bob when a line starts, a nod while talking
    const k = 1 - Math.exp(-dt * 5);
    this.tilt += (this.tiltTo - this.tilt) * k;
    this.pitch += ((PITCH[this.mood] || 0) - this.pitch) * k;
    this.bob = Math.max(0, this.bob - dt * 2.2);
    const bobK = Math.sin(this.bob * Math.PI) * this.bob;
    const nod = talking ? Math.sin(this.t * 9.5) * 0.035 + Math.sin(this.t * 3.7) * 0.025 : 0;
    if (s.hen) {
      const h = r.head;
      if (h) {
        h.rotation.y = h.rotation.y * 0.35 + 0.28;
        h.rotation.z += this.tilt * 1.6;
        if (this.henMood === 'sad') h.rotation.x += 0.35;
        if (talking) h.rotation.x += Math.max(0, Math.sin(this.t * 22)) * 0.25;
        h.rotation.x -= bobK * 0.2;
      }
      if (this.henMood === 'happy' && Math.random() < dt * 0.25) r.flap?.(0.3);
    } else if (r.neck) {
      r.neck.rotation.z += this.tilt;
      r.neck.rotation.x += this.pitch + nod - bobK * 0.12;
    }
    // the camera follows the head a little (jumps and laughs stay in the frame)
    r.root.updateMatrixWorld(true);
    const head = s.hen ? (r.head ? r.head.getWorldPosition(_v2) : _v2.copy(s.headRest)) : r.neck.getWorldPosition(_v2);
    head.sub(s.headRest).multiplyScalar(0.55);
    head.x = 0;
    this.follow.lerp(head, 1 - Math.exp(-dt * 6));
    s.aim(this.W, this.H, this.follow, this.dir);

    // render into our target, then read it back without stalling the GPU
    const t0 = performance.now();
    const RW = this.CW * this.ss, RH = this.CH * this.ss;
    this.rt ||= makeRT(RW, RH);
    const info = R.info.render, saved = { calls: info.calls, triangles: info.triangles, points: info.points, lines: info.lines };
    const prev = R.getRenderTarget();
    R.getClearColor(_c);
    const prevA = R.getClearAlpha();
    R.setRenderTarget(this.rt);
    R.setClearColor(0x000000, 0);
    R.clear(true, true, false);
    R.render(s.scene, s.cam);
    // read it back while our target is still bound: through a pixel buffer and a fence (no GPU
    // stall), unbinding the buffer at once so nobody else's readPixels trips over it
    const gl = R.getContext();
    let async = !syncRead && !this.firstPic && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    if (async) {
      try { this.readAsync(gl, RW, RH); } catch (e) { syncRead = true; async = false; this.pending = false; console.warn('[portrait3d] async read failed, going sync', e); }
    }
    if (!async) {
      R.readRenderTargetPixels(this.rt, 0, 0, RW, RH, this.px);
      this.firstPic = false;
      this.compose(this.px);
    }
    R.setRenderTarget(prev);
    R.setClearColor(_c, prevA);
    Object.assign(info, saved);
    perf.rendered++;
    perf.ms += performance.now() - t0;
  }

  /** readPixels into this handle's pixel buffer, then poll a fence and copy it out when the GPU is done. */
  readAsync(gl, RW, RH) {
    if (!this.pbo) {
      this.pbo = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.px.byteLength, gl.STREAM_READ);
    } else gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.readPixels(0, 0, RW, RH, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    this.pending = true;
    this.gl = gl;
    const t0 = performance.now();
    const poll = () => {
      if (this.disposed) { gl.deleteSync(sync); this.pending = false; return; }
      const st = gl.clientWaitSync(sync, 0, 0);
      if (st === gl.TIMEOUT_EXPIRED) { setTimeout(poll, performance.now() - t0 > 200 ? 16 : 4); return; }
      gl.deleteSync(sync);
      this.pending = false;
      if (st === gl.WAIT_FAILED) return;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.px);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this.compose(this.px);
    };
    setTimeout(poll, 4);
  }

  /** Backdrop + motes + the character (flipped rows) + a dark outline round it. */
  compose(px) {
    const tc = performance.now();
    this.composeInner(px);
    if (px) {
      perf.composeMs += performance.now() - tc; perf.composed++;
      if (this.cast && !this.keptPic) { this.keptPic = true; lastPics.set(`${this.cast.key}|${this.CW}x${this.CH}|${this.kind}`, this.img.data); }
    }
  }

  composeInner(px) {
    const W = this.W, H = this.H, D = this.D, CW = this.CW, CH = this.CH, out = this.img.data;
    out.set(this.bg);
    // motes
    const M = MOTES[this.kind];
    if (M) {
      const t = this.t;
      for (const m of this.motes) {
        let x, y, a;
        if (M.kind === 'rise') {
          const span = H + 6, ph = ((t * 6 * m.s + m.p * 13) % span);
          y = H + 2 - ph; x = (M.from ? M.from[0] * W : m.x) + Math.sin(t * 1.3 + m.p) * 3 + (m.x - W / 2) * 0.3;
          a = Math.min(1, ph / 10) * (1 - ph / span);
        } else if (M.kind === 'twinkle') {
          x = m.x; y = m.y; a = Math.max(0, Math.sin(t * (1.2 + m.s) + m.p)) ** 2;
        } else {
          x = (m.x + t * 1.5 * m.s) % W; y = m.y + Math.sin(t * 0.8 + m.p) * 2; a = 0.4 + 0.4 * Math.sin(t * 1.7 + m.p);
        }
        const xi = x | 0, yi = y | 0;
        if (xi < 0 || yi < 0 || xi >= W || yi >= H || a <= 0.05) continue;
        const c = m.c;
        for (let dy = 0; dy < D; dy++) for (let dx = 0; dx < D; dx++) {
          const i = ((yi * D + dy) * CW + xi * D + dx) * 4;
          out[i] += (((c >> 16) & 255) - out[i]) * a; out[i + 1] += (((c >> 8) & 255) - out[i + 1]) * a; out[i + 2] += ((c & 255) - out[i + 2]) * a;
        }
      }
    }
    if (px) {
      const sm = fold(px, this.small, CW, CH, this.ss);
      const ink = this.studio?.ink ?? 0x100808, ir = (ink >> 16) & 255, ig = (ink >> 8) & 255, ib = ink & 255;
      const A = (x, y) => (x < 0 || y < 0 || x >= CW || y >= CH ? 0 : sm[(y * CW + x) * 4 + 3]);
      // a warm rim of light where the silhouette meets the backdrop on the far side from the key light
      const rim = (LIGHTS[this.kind] || LIGHTS.cave).rim, rr = (rim >> 16) & 255, rg = (rim >> 8) & 255, rb = rim & 255;
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
        const di = (y * CW + x) * 4;
        if (sm[di + 3]) {
          let r = LIFT[sm[di]], g = LIFT[sm[di + 1]], b = LIFT[sm[di + 2]];
          const edge = !A(x + 1, y) ? 0.5 : !A(x + 1, y - 1) || !A(x, y - 1) ? 0.3 : 0;
          if (edge) { r += (rr - r) * edge; g += (rg - g) * edge; b += (rb - b) * edge; }
          out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = 255;
          continue;
        }
        if (A(x - 1, y) || A(x + 1, y) || A(x, y - 1) || A(x, y + 1)) { out[di] = ir; out[di + 1] = ig; out[di + 2] = ib; }
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    handles.delete(this);
    release(this.studio);
    this.studio?.rig?.talk?.(false);
    this.studio = null;
    this.rt?.dispose();
    this.rt = null;
    if (this.pbo && this.gl) { try { this.gl.deleteBuffer(this.pbo); } catch (e) { /* context gone */ } }
    this.pbo = null;
    if (this.own) this.canvas.remove();
  }
}
let syncRead = false;
const lastPics = new Map(); // `${who}|${W}x${H}|${backdrop}` → the last composed picture (shared buffer)
/** A gentle lift of the darks and a touch more punch (the game's post grade does this for the world). */
const LIFT = new Uint8ClampedArray(256).map((_, v) => Math.round(255 * Math.min(1, Math.pow(v / 255, 0.86) * 1.05)));

/**
 * Fold an ss× render (bottom-up rows) down to the art grid (top-down): each block keeps its most
 * common colour (near-equal colours count together), so edges stay crisp and voxel dirt doesn't
 * turn to noise; a block is see-through when most of it is.
 */
function fold(px, out, W, H, ss) {
  const RW = W * ss, RH = H * ss, n = ss * ss;
  const r = new Int16Array(n), g = new Int16Array(n), b = new Int16Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let k = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const si = ((RH - 1 - (y * ss + j)) * RW + x * ss + i) * 4;
      if (px[si + 3] > 24) { r[k] = px[si]; g[k] = px[si + 1]; b[k] = px[si + 2]; k++; }
    }
    const di = (y * W + x) * 4;
    if (k * 2 < n || k === 0) { out[di + 3] = 0; continue; }
    let best = 0, bestN = -1;
    for (let a = 0; a < k; a++) {
      let c = 0;
      for (let q = 0; q < k; q++) if (Math.abs(r[a] - r[q]) + Math.abs(g[a] - g[q]) + Math.abs(b[a] - b[q]) < 40) c++;
      // ties go to the darker one (lines and eyes win over highlights)
      if (c > bestN || (c === bestN && r[a] + g[a] + b[a] < r[best] + g[best] + b[best])) { bestN = c; best = a; }
    }
    out[di] = r[best]; out[di + 1] = g[best]; out[di + 2] = b[best]; out[di + 3] = 255;
  }
  return out;
}

/** A backdrop painted at the art grid, blown up D× (each art pixel a D×D block). */
function upscale(src, W, H, D) {
  if (D === 1) return src;
  const out = new Uint8ClampedArray(W * D * H * D * 4);
  for (let y = 0; y < H * D; y++) for (let x = 0; x < W * D; x++) {
    const si = (((y / D) | 0) * W + ((x / D) | 0)) * 4, di = (y * W * D + x) * 4;
    out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3];
  }
  return out;
}

function makeRT(W, H) {
  const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  return rt;
}

function loop(now) {
  raf = 0;
  if (!handles.size) return;
  raf = requestAnimationFrame(loop);
  frame(now);
}
/** A timer keeps portraits alive when animation frames are throttled or starved (headless, busy tabs). */
let clock = 0;
function startClock() {
  if (clock) return;
  clock = setInterval(() => {
    if (!handles.size) { clearInterval(clock); clock = 0; return; }
    const now = performance.now();
    if (now - lastT > 200) frame(now);
  }, 100);
}
function frame(now) {
  const dt = Math.min(0.25, Math.max(0, (now - (lastT || now)) / 1000));
  lastT = now;
  perf.frames++;
  const due = [];
  for (const h of handles) if (h.tick(dt)) due.push(h);
  // at most two portraits a frame (round robin), so a crowd of them never spikes a frame
  if (due.length > 2) { rr = (rr + 1) % due.length; due.push(...due.splice(0, rr)); }
  for (const h of due.slice(0, 2)) { try { h.render(); } catch (e) { console.warn('[portrait3d] render', e); h.pending = false; } }
}

// ------------------------------------------------------------------ API
export const portrait3d = {
  init(g) {
    if (g?.isWebGLRenderer) renderer = g; else { game = g; renderer = g?.engine?.renderer || renderer; }
    return this;
  },
  cast: castOf,
  mount(el, who, o = {}) {
    const cast = castOf(who);
    const h = new Handle(el, cast, o);
    handles.add(h);
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); }
    startClock();
    return h;
  },
  /** Build a character's rig ahead of time (no render). */
  warm(who) {
    const cast = castOf(who);
    if (!cast || studios.has(cast.key) || building.has(cast.key)) return Promise.resolve();
    return acquire(cast).then((s) => release(s)).catch(() => {});
  },
  /** One still picture (a canvas) of who wearing mood. */
  async still(who, o = {}) {
    const cast = castOf(who);
    const W = o.w || o.size || 48, H = o.h || o.size || W;
    // a live portrait of them is up: borrow its rig for one picture instead of building another
    const list = cast ? studios.get(cast.key) || [] : [];
    const borrow = list.length && !list.some((s) => !s.busy) ? list[0] : null;
    const h = new Handle(null, borrow ? null : cast, { ...o, w: W, h: H, backdrop: o.backdrop || cast?.backdrop });
    if (borrow) { h.cast = cast; h.studio = borrow; } else await h.ready;
    if (h.studio) {
      if (!borrow) {
        h.set(o.mood || cast.mood, { tilt: 0.05 });
        h.studio.rig.blinkT = 99;
        for (let i = 0; i < 10; i++) { h.acc = 1 / 20; h.t += 0.05; h.studio.rig.update(0.05); }
      }
      const was = syncRead;
      syncRead = true;
      try { h.acc = 0.05; h.render(); } finally { syncRead = was; }
    }
    const c = h.canvas;
    if (borrow) { h.studio = null; h.disposed = true; h.rt?.dispose(); } else h.dispose();
    return c;
  },
  /** Cached data URL of a still ('' until it has been made once; makes it in the background). */
  stillURL(who, mood = 'calm', size = 40) {
    const k = `${castOf(who)?.key}|${mood}|${size}`;
    if (stills.has(k)) return stills.get(k);
    stills.set(k, '');
    if (getRenderer()) this.still(who, { mood, size }).then((c) => stills.set(k, c.toDataURL())).catch(() => {});
    return '';
  },
  stats() {
    return { live: handles.size, visible: [...handles].filter((h) => h.visible).length, studios: [...studios.values()].flat().length, rendered: perf.rendered, ms: +perf.ms.toFixed(2), frames: perf.frames, composed: perf.composed, composeMs: +perf.composeMs.toFixed(2) };
  },
  handles() { return [...handles]; },
  /** Render every visible portrait now, reading back at once (tests and screenshots). */
  flush() {
    const was = syncRead;
    syncRead = true;
    try { for (const h of handles) { if (!h.visible || !h.studio) continue; h.acc = Math.max(h.acc, 1 / h.fps); h.render(); } } finally { syncRead = was; }
    return [...handles].filter((h) => h.studio).length;
  },
};
const stills = new Map();
export default portrait3d;

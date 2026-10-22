// The save stones: three stones on a rock ledge, one per save slot. An empty slot is a rough,
// mossy stone ("A new adventure"). A used slot's stone turns into a cut gem as the save
// progresses: cracks first leak coloured light, then facets break through the rock a patch at a
// time, the crust falls away, and at 100% it is a flawless cut gem with a halo. Slot 1 is a
// round ruby, slot 2 a step-cut emerald, slot 3 an oval sapphire.
// Each stone is drawn per pixel into its own small canvas (crisp at any integer scale), with
// animated sparkles. Smashing a save: a hammer swings down, the stone cracks and bursts into
// chunks that bounce on the ledge, and the rubble settles back into a rough stone.
//
//   const view = makeSaveStones(parent, { audio, slots: () => state.listSlots(),
//     onPick(i, slot), onDelete(i) → Promise<bool> (confirm), afterDelete(i), onBack() });
//   view.open() / view.close() / view.refresh() / view.setFake(i, pct) / view.destroy()
import { el, clamp, mixHex, shade, formatGoldFull } from '../core/util.js';
import { formatPlayTime } from '../core/saves.js';

export const GEMS = [
  { name: 'Ruby', cut: 'round', ramp: [0x2a040c, 0x5a0a1a, 0x900e24, 0xc81c32, 0xf04652, 0xff9a9e, 0xffe4e4], fire: 0xffd060 },
  { name: 'Emerald', cut: 'step', ramp: [0x04200f, 0x0a4022, 0x116a36, 0x1c9a4e, 0x3ccc74, 0x9af0ba, 0xe4fff0], fire: 0xfff0a0 },
  { name: 'Sapphire', cut: 'oval', ramp: [0x060f2c, 0x0c2260, 0x16409c, 0x2468d0, 0x4a98ff, 0xa8d4ff, 0xeaf6ff], fire: 0xc8a0ff },
];
const ROCK = [0x231c1c, 0x352c2a, 0x4a403c, 0x5e5450, 0x766a64, 0x8e827a];
const MOSS = [0x2e4a24, 0x48702e, 0x6a983a];
const LINE = 0x120a0c;

const W = 72, H = 80; // canvas (art px)
const CX = 36, CY = 50; // stone centre
const RX = 25, RY = 21; // rough stone radii
const FLOOR = 71; // where stones rest

const C32 = (hex, a = 255) => (((a & 255) << 24) | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >>> 16) & 0xff)) >>> 0;
const hash = (x, y, s) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
function vnoise(x, y, s) { // smooth value noise
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ------------------------------------------------------------------ gem cuts
// facet(u, v) → { id, tilt (0 flat .. 1 steep), dir (angle of the facet's slope) } or null outside.
const TAU = Math.PI * 2;
function brilliant(u, v) {
  const r = Math.hypot(u, v);
  if (r > 1) return null;
  const oct = Math.max(Math.abs(u), Math.abs(v), (Math.abs(u) + Math.abs(v)) / Math.SQRT2);
  if (oct < 0.44) return { id: 0, tilt: 0, dir: 0 };
  const th = Math.atan2(v, u);
  const s8 = Math.floor(((th + TAU) % TAU) / (TAU / 8) + 0.5) % 8; // sector centred on a table edge
  const phi = (((th + TAU) % TAU) / (TAU / 8) + 0.5) % 1 * 2 - 1; // -1..1 inside the sector
  if (r < 0.74) {
    const star = r < 0.44 + 0.3 * (1 - Math.abs(phi));
    if (star) return { id: 1 + s8, tilt: 0.35, dir: s8 * (TAU / 8) };
    const side = phi < 0 ? 0 : 1;
    return { id: 9 + s8 * 2 + side, tilt: 0.55, dir: s8 * (TAU / 8) + (side ? 0.2 : -0.2) };
  }
  const s16 = Math.floor(((th + TAU) % TAU) / (TAU / 16));
  const f = (((th + TAU) % TAU) / (TAU / 16)) % 1;
  const lower = (r - 0.74) / 0.26 > (s16 % 2 ? f : 1 - f);
  return { id: 25 + s16 * 2 + (lower ? 1 : 0), tilt: 0.85, dir: (s16 + 0.5) * (TAU / 16) };
}
function stepCut(u, v) {
  const a = 0.74, b = 1.0;
  const X = Math.abs(u) / a, Y = Math.abs(v) / b, Dg = (X + Y) / 1.55;
  const L = Math.max(X, Y, Dg);
  if (L > 1) return null;
  const ring = L < 0.52 ? 0 : L < 0.68 ? 1 : L < 0.84 ? 2 : 3;
  if (ring === 0) return { id: 0, tilt: 0, dir: 0 };
  const side = L === X ? (u < 0 ? 0 : 1) : L === Y ? (v < 0 ? 2 : 3) : 4 + (u < 0 ? 0 : 1) + (v < 0 ? 0 : 2);
  const dirs = [Math.PI, 0, -Math.PI / 2, Math.PI / 2, -Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.75, Math.PI * 0.25];
  return { id: ring * 10 + side, tilt: 0.2 + ring * 0.22, dir: dirs[side] };
}
const CUTS = {
  round: (u, v) => brilliant(u, v),
  oval: (u, v) => brilliant(u / 0.8, v),
  step: (u, v) => stepCut(u, v),
};
const GEM_R = { round: [18, 18], oval: [15, 19], step: [16, 19] }; // radii in px (x, y)

// ------------------------------------------------------------------ the stone picture
/**
 * Render a stone into buf (W*H Uint32). o: { k (0..1 completion, -1 = empty), gem (GEMS entry),
 * seed, t (time), hover (0..1), lift (px) }
 */
function drawStone(buf, o) {
  buf.fill(0);
  const k = o.k;
  const gem = o.gem;
  const seed = o.seed;
  const used = k >= 0;
  const kk = used ? clamp(k, 0, 1) : 0;
  const cut = CUTS[gem.cut];
  const [gr, gry] = GEM_R[gem.cut];
  const lift = Math.round(o.lift || 0);
  const cy = CY - lift;
  // rock silhouette: a lumpy ellipse, flat on the bottom
  const rr = (x, y) => {
    const dx = x - CX, dy = y - cy;
    const th = Math.atan2(dy, dx);
    const R = 1 + 0.07 * Math.sin(3 * th + seed) + 0.05 * Math.sin(5 * th + seed * 2.1) + 0.04 * Math.sin(8 * th + seed * 0.7);
    return Math.hypot(dx / (RX * R), dy / (RY * R));
  };
  const crust = Math.pow(1 - kk, 0.75); // how much rock is left outside the gem
  const gemShape = (x, y) => cut((x - CX) / gr, (y - cy) / gry);
  const reveal = new Map(); // facet id → order
  const facetOrder = (id) => { let r = reveal.get(id); if (r === undefined) { r = hash(id, 7, seed); reveal.set(id, r); } return r; };
  const thr = kk * 1.22 - 0.1; // reveal threshold
  const sun = [-0.62, -0.78]; // light from the top left
  const px = new Array(W * H);
  const tag = new Uint8Array(W * H); // 1 rock, 2 gem, 3 crack
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (y > FLOOR - lift) continue;
    const f = used ? gemShape(x + 0.5, y + 0.5) : null;
    const r0 = rr(x + 0.5, y + 0.5);
    const inRock0 = r0 <= 1 && y <= FLOOR - lift;
    let isGem = false, isRock = false;
    if (f) {
      // the cut opens from the table outward, a facet at a time, with ragged edges
      const ru = Math.hypot((x + 0.5 - CX) / gr, (y + 0.5 - cy) / gry);
      const rv = 0.5 * ru + 0.32 * facetOrder(f.id) + 0.18 * vnoise(x * 0.3, y * 0.3, seed);
      if (rv < thr) isGem = true;
      else { isRock = true; if (rv < thr + 0.07 && kk > 0.01) tag[i] = 3; }
    } else if (inRock0) {
      // rock outside the gem: a crust that thins as the save progresses
      if (!used) isRock = true;
      else {
        const gd = Math.max(0, gemDist(cut, (x + 0.5 - CX) / gr, (y + 0.5 - cy) / gry)) * gr;
        const n = vnoise(x * 0.3, y * 0.3, seed + 3);
        if (gd < (RX - gr + 3) * crust * (0.55 + 0.6 * n) + (crust > 0.02 ? 0.8 : 0)) isRock = true;
      }
    }
    if (isGem) {
      tag[i] = 2;
      // facet colour: lit by the slope toward the light, a little random per facet
      const lit = f.tilt === 0 ? 0.62 : 0.5 + 0.5 * f.tilt * (Math.cos(f.dir) * sun[0] + Math.sin(f.dir) * sun[1]);
      let b = lit + (hash(f.id, 3, seed) - 0.5) * 0.24;
      if (f.tilt === 0) b += (0.5 - ((y - (cy - gry)) / (gry * 2))) * 0.25; // table: brighter at the top
      const ramp = gem.ramp;
      const idx = clamp(Math.round(b * (ramp.length - 2)), 0, ramp.length - 2);
      px[i] = ramp[idx];
      tagFacet[i] = f.id + 1;
    } else if (isRock) {
      if (tag[i] !== 3) tag[i] = 1;
      // a dome lit from the top left, ordered-dithered into the rock ramp
      const dx = (x + 0.5 - CX) / RX, dy = (y + 0.5 - cy) / RY;
      const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
      let b = 0.5 + (-dx * 0.62 - dy * 0.78) * 0.45 + nz * 0.25 + (vnoise(x * 0.35, y * 0.35, seed + 9) - 0.5) * 0.35;
      if (hash(x >> 1, y >> 1, seed) < 0.06) b -= 0.18; // pits
      const idx = clamp(Math.floor(b * (ROCK.length - 1) + bayer(x, y) - 0.5), 0, ROCK.length - 1);
      let c = ROCK[idx];
      if (!used && dy < -0.45 && vnoise(x * 0.4, y * 0.5, seed + 5) > 0.55) c = MOSS[clamp(Math.floor((1 + dy) * 3 + bayer(x, y)), 0, 2)];
      if (used && hash(x, y, seed + 11) < 0.012 * (1 + kk * 4)) c = gem.ramp[4]; // mineral flecks
      px[i] = c;
    }
  }
  // cracks: dark, leaking the gem's light
  for (let i = 0; i < W * H; i++) {
    if (tag[i] !== 3) continue;
    const x = i % W, y = (i / W) | 0;
    px[i] = (x + y) % 3 === 0 ? gem.ramp[5] : (x + y) % 3 === 1 ? gem.ramp[3] : 0x140c10;
  }
  // facet edges: a light line on the upper-left side of each facet, dark on the lower-right
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (tag[i] !== 2) continue;
    const id = tagFacet[i];
    if (tagFacet[i - 1] && tagFacet[i - 1] !== id) px[i] = shade(px[i], 1.18);
    else if (tagFacet[i - W] && tagFacet[i - W] !== id) px[i] = shade(px[i], 1.22);
    else if (tagFacet[i + 1] && tagFacet[i + 1] !== id) px[i] = shade(px[i], 0.78);
    else if (tagFacet[i + W] && tagFacet[i + W] !== id) px[i] = shade(px[i], 0.72);
  }
  // specular: a white glint on the table's upper left, brighter as the gem comes out
  if (used && kk > 0.25) {
    const hx = Math.round(CX - gr * 0.28), hy = Math.round(cy - gry * 0.34);
    for (const [dx, dy, c] of [[0, 0, 0xffffff], [1, 0, gem.ramp[6]], [0, 1, gem.ramp[6]], [-1, 0, gem.ramp[5]], [2, 1, gem.ramp[5]]]) {
      const i = (hy + dy) * W + hx + dx;
      if (tag[i] === 2) px[i] = c;
    }
  }
  // pack + outline
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (px[i] !== undefined) { buf[i] = C32(px[i]); out[i] = 1; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (out[i]) continue;
    if ((x > 0 && out[i - 1]) || (x < W - 1 && out[i + 1]) || (y > 0 && out[i - W]) || (y < H - 1 && out[i + W])) buf[i] = C32(LINE);
  }
  tagFacet.fill(0);
  return { tag };
}
const tagFacet = new Uint16Array(W * H);
/** Rough distance outside a gem cut's outline (normalized units; 0 inside). */
function gemDist(cut, u, v) {
  // march outward along the ray to the outline
  const r = Math.hypot(u, v);
  if (r < 1e-6) return 0;
  let lo = 0, hi = 2;
  for (let s = 0; s < 10; s++) { const m = (lo + hi) / 2; if (cut((u / r) * m, (v / r) * m)) lo = m; else hi = m; }
  return Math.max(0, r - lo);
}

// ------------------------------------------------------------------ the ledge
function drawLedge(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const b = new Uint32Array(img.data.buffer);
  const top = (x) => 6 + Math.round(Math.sin(x * 0.11) * 1.2 + Math.sin(x * 0.037 + 2) * 1.6 + (hash(x >> 3, 1, 4) - 0.5) * 1.5);
  const edgeL = 10, edgeR = w - 10;
  for (let x = 0; x < w; x++) {
    const t = top(x);
    // tapered ends
    const endK = Math.min(1, Math.min(x - 0, w - 1 - x) / 14);
    const bottom = Math.round(h - 1 - (1 - endK) * (h - t - 4) * 0.9);
    for (let y = t; y <= bottom; y++) {
      let col;
      if (y === t) col = 0xa48e78; // lit lip
      else if (y < t + 4) col = mixHex(0x7a6a5a, 0xc8783a, 0.25 * (1 - (y - t) / 4)); // top, warm from the forge
      else {
        const band = Math.floor((y - t + Math.sin(x * 0.05) * 2) / 5);
        const base = [0x4a403a, 0x423834, 0x52463e, 0x3a322e][(band % 4 + 4) % 4];
        let b2 = 0.85 + (vnoise(x * 0.12, y * 0.2, 3) - 0.5) * 0.5 - (y - t) / (h * 2.2);
        if ((y - t + Math.round(Math.sin(x * 0.05) * 2)) % 5 === 0) b2 -= 0.2;
        col = shade(base, clamp(b2 + (bayer(x, y) - 0.5) * 0.12, 0.3, 1.3));
        if (hash(x >> 1, y >> 1, 9) < 0.03) col = 0x6a5e54;
        if (y > bottom - 2) col = shade(col, 0.6);
      }
      if (x < edgeL || x > edgeR) col = shade(col, 0.9);
      b[y * w + x] = C32(col);
    }
    // moss and drips on the front lip
    if (hash(x >> 2, 3, 5) < 0.25) { b[(t + 1) * w + x] = C32(MOSS[1]); if (hash(x, 4, 6) < 0.4) b[(t + 2) * w + x] = C32(MOSS[0]); }
  }
  // outline
  const o = new Uint32Array(b);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (o[i]) continue;
    if ((x > 0 && o[i - 1]) || (x < w - 1 && o[i + 1]) || (y > 0 && o[i - w]) || (y < h - 1 && o[i + w])) b[i] = C32(LINE);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** The smashing hammer (pixel sprite), handle pointing down-right from the head. */
const HAMMER = (() => {
  const w = 28, h = 12;
  const p = new Uint32Array(w * h);
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) p[y * w + x] = C32(c); };
  for (let x = 9; x < w; x++) { set(x, 5, x % 5 === 0 ? 0x5a3a20 : 0xa87444); set(x, 6, 0x7a5030); }
  for (let x = w - 6; x < w; x++) { set(x, 5, 0x5a2a16); set(x, 6, 0x3a1a0c); }
  for (let y = 0; y < 12; y++) for (let x = 0; x < 9; x++) {
    const edge = x === 0 || y === 0 || y === 11 || x === 8;
    set(x, y, edge ? 0x24222a : y < 3 ? 0xb4b0bc : x < 2 ? 0xd6d4e2 : 0x6a6672);
  }
  return { w, h, p, px: 4, py: 11.5 }; // pivot: bottom of the striking face
})();

function blitRot(buf, spr, ax, ay, cx, cy, ang) {
  const co = Math.cos(ang), si = Math.sin(ang);
  const R = Math.hypot(spr.w, spr.h) + 2;
  for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(H, Math.ceil(cy + R)); y++) {
    for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(W, Math.ceil(cx + R)); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = Math.floor(co * dx + si * dy + ax), v = Math.floor(-si * dx + co * dy + ay);
      if (u < 0 || v < 0 || u >= spr.w || v >= spr.h) continue;
      const c = spr.p[v * spr.w + u];
      if (c >>> 24) buf[y * W + x] = c;
    }
  }
}

// ------------------------------------------------------------------ styles
const CSS = /* css */`
.st-view { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; pointer-events: none;
  transform: translateY(110%); transition: transform .55s cubic-bezier(.2,1.25,.4,1); padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--px) * 3); }
.st-view.on { transform: none; }
.st-view.out { transition: transform .35s cubic-bezier(.5,0,.8,.4); }
.st-head { position: fixed; left: 0; right: 0; top: calc(var(--px) * 8 + env(safe-area-inset-top, 0px)); font-family: var(--font-display); font-size: calc(var(--px) * 16); color: #ffe8c8;
  letter-spacing: .02em; text-align: center; line-height: 1; opacity: 0; transform: translateY(calc(var(--px) * -6)); transition: opacity .35s, transform .45s cubic-bezier(.2,1.3,.4,1); }
.st-view.on .st-head { opacity: 1; transform: none; transition-delay: .15s; }
@media (max-aspect-ratio: 5/4) { .st-head { top: calc(var(--px) * 36 + env(safe-area-inset-top, 0px)); } }
.st-head small { display: block; font-family: var(--font); font-size: calc(var(--px) * 5.4); color: #e8c8a8; opacity: .9; margin-top: calc(var(--px) * 1.5); letter-spacing: .04em; }
.st-shelf { position: relative; }
.st-ledge { position: absolute; left: 0; right: 0; image-rendering: pixelated; image-rendering: crisp-edges; pointer-events: none; }
.st-row { position: relative; display: flex; justify-content: center; align-items: flex-end; }
.st-slot { position: relative; display: flex; flex-direction: column; align-items: center; pointer-events: auto; }
.st-stone { position: relative; display: block; image-rendering: pixelated; image-rendering: crisp-edges; pointer-events: none; }
#ui .st-main, .st-main { position: absolute; left: 12%; right: 12%; top: 30%; bottom: 0; background: transparent; border: 0; padding: 0; margin: 0; cursor: pointer;
  pointer-events: auto; touch-action: manipulation; outline: none; color: transparent; font: inherit; }
#ui .st-main:focus-visible, #ui .st-del:focus-visible { outline: none; }
.st-main:focus-visible + .st-ring, .st-slot.hot .st-ring { opacity: 1; }
.st-ring { position: absolute; left: 50%; bottom: calc(var(--sp) * 3); width: calc(var(--sp) * 46); height: calc(var(--sp) * 10); transform: translateX(-50%);
  border-radius: 50%; box-shadow: 0 0 0 var(--sp) rgba(242,194,58,.0); background: radial-gradient(closest-side, rgba(255,214,120,.38), rgba(255,170,60,0)); opacity: 0; transition: opacity .15s; pointer-events: none; }
.st-plaque { margin-top: calc(var(--sp) * 1); min-width: calc(var(--sp) * 56); text-align: center; color: #fbeedc; line-height: 1.15; pointer-events: none; padding: 0 calc(var(--px) * 1); }
.st-plaque b { display: block; font-family: var(--font-display); font-weight: 400; font-size: calc(var(--px) * 12); line-height: .95; }
.st-plaque .st-name { font-size: calc(var(--px) * 5.4); letter-spacing: .08em; text-transform: uppercase; opacity: .85; }
.st-plaque .st-meta { display: block; font-size: calc(var(--px) * 5.4); opacity: .9; white-space: nowrap; }
.st-plaque .st-name, .st-plaque .st-new { display: block; }
.st-plaque .st-new { font-size: calc(var(--px) * 5.4); opacity: .85; font-style: italic; }
.st-slot.used .st-plaque b { color: var(--gc); text-shadow: 0 0 calc(var(--px) * 3) rgba(0,0,0,.4); }
.st-last { position: absolute; top: calc(var(--sp) * 16); left: 50%; transform: translateX(-50%); font-size: calc(var(--px) * 5.4); color: #ffd890; white-space: nowrap;
  pointer-events: none; animation: stBob 1.6s ease-in-out infinite; }
@keyframes stBob { 50% { transform: translate(-50%, calc(var(--px) * -1.5)); } }
#ui .st-del, .st-del { position: absolute; top: calc(var(--sp) * 22); right: calc(var(--sp) * 4); width: calc(var(--sp) * 14); height: calc(var(--sp) * 14); min-width: 30px; min-height: 30px;
  padding: 0; margin: 0; border: 0; background: transparent; cursor: pointer; pointer-events: auto; opacity: 0; transition: opacity .15s, transform .15s; outline: none; }
.st-del img { width: 100%; height: 100%; image-rendering: pixelated; display: block; }
.st-slot.hot .st-del, .st-del:focus-visible, .is-touch .st-del { opacity: .9; }
.st-del:hover, .st-del:focus-visible { opacity: 1; transform: rotate(-14deg) scale(1.1); }
.st-del:focus-visible { filter: drop-shadow(0 0 var(--px) #f2c23a) drop-shadow(0 0 var(--px) #f2c23a); }
.st-slot.busy .st-del, .st-slot.busy .st-main { pointer-events: none; }
.st-row.shake { animation: stShake .3s linear; }
@keyframes stShake { 0%, 100% { transform: none; } 20% { transform: translate(calc(var(--px) * -2), var(--px)); } 40% { transform: translate(calc(var(--px) * 2), 0); } 60% { transform: translate(calc(var(--px) * -1), calc(var(--px) * -1)); } 80% { transform: translate(var(--px), 0); } }
`;
let cssRefs = 0, cssEl = null;
function useCss() {
  if (!cssRefs++) { cssEl = document.createElement('style'); cssEl.id = 'stones-css'; cssEl.textContent = CSS; document.head.append(cssEl); }
  return () => { if (!--cssRefs && cssEl) { cssEl.remove(); cssEl = null; } };
}

/** A tiny hammer icon (16x16) for the delete buttons. */
function hammerIcon() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(16, 16);
  const b = new Uint32Array(img.data.buffer);
  const set = (x, y, col) => { b[y * 16 + x] = C32(col); };
  for (let i = 0; i < 10; i++) { set(4 + i, 11 - Math.round(i * 0.7), 0x2a1408); set(4 + i, 12 - Math.round(i * 0.7), i % 3 ? 0xa87444 : 0x7a5030); }
  const head = [[9, 1], [10, 1], [11, 1], [12, 2], [13, 3], [14, 4], [8, 2], [9, 2], [10, 2], [11, 2], [12, 3], [13, 4], [9, 3], [10, 3], [11, 3], [12, 4], [10, 4], [11, 4], [11, 5]];
  for (const [x, y] of head) set(x, y, y < 3 ? 0xd6d4e2 : 0x6a6672);
  // outline
  const o = new Uint32Array(b);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = y * 16 + x;
    if (o[i]) continue;
    if ((x > 0 && o[i - 1]) || (x < 15 && o[i + 1]) || (y > 0 && o[i - 16]) || (y < 15 && o[i + 16])) b[i] = C32(0xfff0d0, 230);
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

// ------------------------------------------------------------------ the view
export function makeSaveStones(parent, opts) {
  const unstyle = useCss();
  const audio = opts.audio;
  const play = (n, o) => audio?.play?.(n, o);
  const head = el('div', { class: 'st-head bk-outline' }, ['Save Stones', el('small', {}, 'Pick a stone to dig in')]);
  const ledge = el('canvas', { class: 'st-ledge', 'aria-hidden': 'true' });
  const row = el('div', { class: 'st-row', role: 'group', 'aria-label': 'Save slots' });
  const shelf = el('div', { class: 'st-shelf' }, [ledge, row]);
  const view = el('div', { class: 'st-view', 'aria-hidden': 'true' }, [head, shelf]);
  parent.append(view);
  const hammerURL = hammerIcon();

  const stones = [0, 1, 2].map((i) => {
    const canvas = el('canvas', { class: 'st-stone', width: W, height: H, 'aria-hidden': 'true' });
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const buf = new Uint32Array(img.data.buffer);
    const main = el('button', { class: 'st-main', type: 'button' });
    const ring = el('i', { class: 'st-ring' });
    const del = el('button', { class: 'st-del', type: 'button', 'aria-label': `Smash save stone ${i + 1}`, title: 'Smash this save' }, [el('img', { src: hammerURL, alt: '' })]);
    const plaque = el('div', { class: 'st-plaque bk-outline' });
    const last = el('div', { class: 'st-last bk-outline', hidden: true }, '▾ last played');
    const slotEl = el('div', { class: 'st-slot' }, [canvas, main, ring, del, plaque, last]);
    slotEl.style.setProperty('--gc', '#' + GEMS[i].ramp[4].toString(16).padStart(6, '0'));
    row.append(slotEl);
    const s = { i, canvas, ctx, img, buf, main, del, plaque, last, slotEl, info: null, k: -1, fake: null, hover: 0, lift: 0, liftV: 0, t: Math.random() * 10, sparkles: [], smash: null, dirty: true, base: new Uint32Array(W * H), lastKey: '' };
    const enter = () => { s.hot = true; slotEl.classList.add('hot'); play('ui_hover'); if (s.k >= 0) play('sparkle', { vol: 0.5 }); s.liftV -= 26; };
    const leave = () => { s.hot = false; slotEl.classList.remove('hot'); };
    main.addEventListener('pointerenter', enter);
    main.addEventListener('pointerleave', leave);
    main.addEventListener('focus', enter);
    main.addEventListener('blur', leave);
    del.addEventListener('pointerenter', () => { slotEl.classList.add('hot'); });
    main.addEventListener('click', () => pick(s));
    del.addEventListener('click', (e) => { e.stopPropagation(); smash(s); });
    main.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { stones[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3].main.focus(); e.preventDefault(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && s.info?.used) { smash(s); e.preventDefault(); }
    });
    return s;
  });

  let busy = false;
  let isOpen = false;
  function pick(s) {
    if (busy || s.smash || !isOpen) return;
    busy = true;
    s.liftV += 60;
    if (s.info?.used) { play('pickup_gem'); flash(s); }
    else play('place');
    setTimeout(() => { busy = false; opts.onPick?.(s.i, s.info); }, 160);
  }
  function flash(s) { s.flashT = 0.35; }
  async function smash(s) {
    if (busy || s.smash || !s.info?.used) return;
    busy = true;
    const ok = await (opts.onDelete ? opts.onDelete(s.i, s.info) : Promise.resolve(true));
    busy = false;
    if (!ok) { s.main.focus({ preventScroll: true }); return; }
    s.slotEl.classList.add('busy');
    s.smash = { t: 0, phase: 'swing', chunks: null, cracks: [] };
  }

  // ---- sizing: the stones at an integer number of device pixels per art pixel
  let P = 3, dpr = 1;
  function layout() {
    dpr = window.devicePixelRatio || 1;
    const vw = window.innerWidth, vh = window.innerHeight;
    const avail = Math.min(vw - 24, 980) * dpr;
    const availH = vh * dpr * (vw > vh ? 0.5 : 0.36);
    P = Math.max(2, Math.min(7, Math.floor(avail / (3 * W + 8)), Math.floor(availH / H)));
    const cssW = (W * P) / dpr, cssH = (H * P) / dpr;
    const sp = P / dpr;
    view.style.setProperty('--sp', `${sp}px`);
    for (const s of stones) {
      s.canvas.style.width = `${cssW}px`;
      s.canvas.style.height = `${cssH}px`;
      s.slotEl.style.width = `${cssW + sp * 2}px`;
    }
    // the ledge under the stones: its top lines up with where they rest
    const lw = Math.round((3 * W + 40)), lh = 30;
    ledge.width = lw; ledge.height = lh;
    const lc = drawLedge(lw, lh);
    ledge.getContext('2d').drawImage(lc, 0, 0);
    ledge.style.width = `${(lw * P) / dpr}px`;
    ledge.style.height = `${(lh * P) / dpr}px`;
    ledge.style.left = '50%';
    ledge.style.marginLeft = `${(-lw * P) / dpr / 2}px`;
    ledge.style.top = `${((FLOOR - 5) * P) / dpr}px`;
    for (const s of stones) s.dirty = true;
  }
  const onResize = () => layout();
  window.addEventListener('resize', onResize);

  function refresh() {
    const list = opts.slots();
    const latest = list.filter((x) => x.used).sort((a, b) => (b.saved || 0) - (a.saved || 0))[0];
    for (const s of stones) {
      const info = list[s.i] || { i: s.i, used: false };
      s.info = info;
      const pct = s.fake ?? (info.used ? info.completion : -1);
      s.k = pct >= 0 ? pct / 100 : -1;
      s.slotEl.classList.toggle('used', !!info.used);
      const g = GEMS[s.i];
      s.plaque.innerHTML = '';
      if (info.used || s.fake != null) {
        s.plaque.append(
          el('span', { class: 'st-name' }, `Slot ${s.i + 1} · ${g.name}`),
          el('b', {}, `${Math.round(pct)}%`),
          el('span', { class: 'st-meta' }, info.used ? `${formatGoldFull(info.gold)} g · Day ${info.day}` : '—'),
          el('span', { class: 'st-meta' }, info.used ? formatPlayTime(info.playTime) + ' played' : ''),
        );
        s.main.setAttribute('aria-label', info.used ? `Continue save ${s.i + 1}: ${Math.round(pct)}% done, ${info.gold} gold, day ${info.day}, ${formatPlayTime(info.playTime)} played` : `Save ${s.i + 1}`);
      } else {
        s.plaque.append(el('span', { class: 'st-name' }, `Slot ${s.i + 1}`), el('b', {}, 'Empty'), el('span', { class: 'st-new' }, 'A new adventure'));
        s.main.setAttribute('aria-label', `Start a new adventure in save ${s.i + 1}`);
      }
      s.del.hidden = !info.used;
      s.last.hidden = !(latest && latest.i === s.i && list.filter((x) => x.used).length > 1);
      s.dirty = true;
      // sparkles: more the further along
      s.sparkles = [];
      const n = s.k < 0 ? 0 : Math.round(1 + s.k * 6);
      for (let j = 0; j < n; j++) s.sparkles.push({ ph: Math.random() * 6, sp: 0.6 + Math.random() * 0.8, x: 0, y: 0 });
    }
  }

  // ---- animation
  let raf = 0, lastT = performance.now(), alive = true;
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (isOpen || view.classList.contains('out')) step(dt);
  }
  function step(dt) {
    for (const s of stones) {
      s.t += dt;
      // bob spring
      const want = s.hot ? 2 : 0;
      s.liftV += ((want - s.lift) * 160 - s.liftV * 12) * dt;
      s.lift += s.liftV * dt;
      if (s.flashT) s.flashT = Math.max(0, s.flashT - dt);
      const key = `${s.k}|${Math.round(s.lift)}`;
      if (s.smash) { stepSmash(s, dt); continue; }
      if (s.dirty || key !== s.lastKey) {
        s.lastKey = key;
        s.dirty = false;
        drawStone(s.base, { k: s.k, gem: GEMS[s.i], seed: 11 + s.i * 7, lift: s.lift });
      }
      s.buf.set(s.base);
      decorate(s);
      s.ctx.putImageData(s.img, 0, 0);
    }
  }
  /** Shadow, sparkles, halo and the pick flash over the stone. */
  function decorate(s) {
    const b = s.buf;
    // contact shadow on the ledge
    for (let x = CX - 22; x <= CX + 22; x++) for (let y = FLOOR - 1; y <= FLOOR + 2; y++) {
      const d = ((x - CX) / 22) ** 2 + ((y - FLOOR - 0.5) / 2.2) ** 2;
      const i = y * W + x;
      if (d < 1 && !(b[i] >>> 24)) b[i] = C32(0x0a0608, bayer(x, y) < 0.6 - d * 0.4 ? 150 : 0);
    }
    if (s.k < 0) return;
    const g = GEMS[s.i];
    const lift = Math.round(s.lift);
    // a finished gem glows, with slow-turning rays of light
    if (s.k >= 1) {
      const R0 = 30 + Math.sin(s.t * 2) * 1.5;
      const cy = CY - lift;
      for (let y = 0; y < FLOOR; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (b[i] >>> 24) continue;
        const dx = x + 0.5 - CX, dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy * 1.05) / R0;
        if (d > 1.25) continue;
        const ray = Math.pow(Math.abs(Math.cos(Math.atan2(dy, dx) * 3 + s.t * 0.5)), 14) * (1.25 - d);
        const glow = Math.max(0, 1 - d) ** 2 * 0.8;
        const v = Math.max(glow, ray * 0.8);
        if (bayer(x, y) < v) b[i] = C32(ray * 0.8 > glow ? g.ramp[6] : g.ramp[4], ray * 0.8 > glow ? 190 : 120);
      }
    }
    // twinkling 4-point sparkles on the revealed gem
    for (const sp of s.sparkles) {
      const w = Math.sin(s.t * sp.sp * 2 + sp.ph);
      if (w < 0.2) { sp.x = 0; continue; }
      if (!sp.x) {
        // land on a gem pixel
        for (let tries = 0; tries < 30; tries++) {
          const x = Math.round(CX + (Math.random() - 0.5) * 34), y = Math.round(CY - lift + (Math.random() - 0.5) * 34);
          const c = b[y * W + x];
          if (c >>> 24) { const r = c & 255, gg = (c >> 8) & 255, bb = (c >> 16) & 255; if (Math.max(r, gg, bb) - Math.min(r, gg, bb) > 60) { sp.x = x; sp.y = y; break; } }
        }
        if (!sp.x) continue;
      }
      const size = w > 0.9 ? 3 : w > 0.6 ? 2 : 1;
      const col = C32(w > 0.85 ? 0xffffff : g.ramp[6]);
      b[sp.y * W + sp.x] = col;
      for (let k = 1; k <= size; k++) {
        for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) {
          const x = sp.x + dx, y = sp.y + dy;
          if (x >= 0 && y >= 0 && x < W && y < H) b[y * W + x] = k === size ? C32(g.ramp[5]) : col;
        }
      }
    }
    // pick flash: the gem lights up
    if (s.flashT > 0) {
      const a = s.flashT / 0.35;
      for (let i = 0; i < W * H; i++) if ((b[i] >>> 24) && bayer(i % W, (i / W) | 0) < a * 0.7) b[i] = C32(0xffffff);
    }
  }

  // ---- smash: swing, crack, burst, settle, re-form
  function stepSmash(s, dt) {
    const m = s.smash;
    m.t += dt;
    const b = s.buf;
    const T_HIT = 0.32, T_BURST = 0.62, T_SETTLE = 1.5, T_DONE = 2.3;
    if (m.t < T_BURST) {
      b.set(s.base);
      // cracks grow from the impact point once hit
      if (m.t >= T_HIT) {
        if (!m.hit) {
          m.hit = true;
          play('clang', { pitch: 0.8, vol: 0.6 }); play('crack'); play('thud', { vol: 0.5 });
          row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
          // crack paths
          for (let c = 0; c < 6; c++) {
            const pts = [[CX + 4, CY - 16]];
            let a = Math.PI / 2 + (c - 2.5) * 0.45, x = CX + 4, y = CY - 16;
            for (let j = 0; j < 30; j++) { a += (Math.random() - 0.5) * 0.7; x += Math.cos(a); y += Math.sin(a); pts.push([Math.round(x), Math.round(y)]); }
            m.cracks.push(pts);
          }
        }
        const grow = clamp((m.t - T_HIT) / (T_BURST - T_HIT), 0, 1);
        for (const pts of m.cracks) for (let j = 0; j < pts.length * grow; j++) {
          const [x, y] = pts[j];
          const i = y * W + x;
          if (x >= 0 && y >= 0 && x < W && y < H && (s.base[i] >>> 24)) b[i] = C32(j % 4 === 0 ? 0xfff0d0 : 0x0a0606);
        }
        if (m.t < T_HIT + 0.08) for (let i = 0; i < W * H; i++) if ((b[i] >>> 24) && bayer(i % W, (i / W) | 0) < 0.5) b[i] = C32(0xffffff);
      }
      // the hammer: swung on its haft from the upper right, the head arcing down onto the stone
      const k = clamp(m.t / T_HIT, 0, 1);
      let ang;
      if (m.t < T_HIT) ang = k < 0.25 ? 1.3 + Math.sin((k / 0.25) * Math.PI) * 0.15 : 1.3 * (1 - ((k - 0.25) / 0.75) ** 2);
      else { const r = m.t - T_HIT; ang = r < 0.12 ? Math.sin((r / 0.12) * Math.PI) * 0.2 : (r - 0.12) * 6; }
      if (ang < 1.8) blitRot(b, HAMMER, 26, 5.5, CX + 26, CY - 23, ang);
    } else {
      if (!m.chunks) {
        play('break', { snd: 'stone' }); play('collapse', { vol: 0.4 }); play('sparkle');
        m.chunks = shatter(s.base);
        opts.afterDelete?.(s.i);
      }
      b.fill(0);
      for (const c of m.chunks) {
        if (!c.rest) {
          c.vy += 220 * dt;
          c.x += c.vx * dt; c.y += c.vy * dt;
          if (c.y + c.bottom > FLOOR) {
            c.y = FLOOR - c.bottom;
            if (Math.abs(c.vy) > 25) { c.vy *= -0.32; c.vx *= 0.6; if (Math.random() < 0.3) play('debris', { vol: 0.6 }); }
            else { c.vy = 0; c.vx *= 0.8; if (Math.abs(c.vx) < 3) c.rest = true; }
          }
          if (c.x < 2 || c.x > W - 2) c.vx *= -0.5;
        }
        for (const p of c.pix) {
          const x = Math.round(c.x + p[0]), y = Math.round(c.y + p[1]);
          if (x >= 0 && y >= 0 && x < W && y < H) b[y * W + x] = p[2];
        }
      }
      // the rubble pulls itself back together into a rough stone
      if (m.t > T_SETTLE) {
        if (!m.reformed) { m.reformed = new Uint32Array(W * H); drawStone(m.reformed, { k: -1, gem: GEMS[s.i], seed: 11 + s.i * 7 + 100 }); play('thud', { vol: 0.25 }); }
        const k = clamp((m.t - T_SETTLE) / (T_DONE - T_SETTLE), 0, 1);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const rise = (FLOOR - y) / 40;
          if (m.reformed[i] >>> 24 && bayer(x, y) * 0.6 + rise * 0.5 < k * 1.15) b[i] = m.reformed[i];
          else if (k > 0.6 && !(m.reformed[i] >>> 24) && bayer(x, y) < (k - 0.6) * 2.5) b[i] = 0;
        }
      }
      if (m.t > T_DONE) {
        s.smash = null;
        s.slotEl.classList.remove('busy');
        s.fake = null;
        refresh();
        s.main.focus({ preventScroll: true });
      }
    }
    decorate(s);
    s.ctx.putImageData(s.img, 0, 0);
  }

  /** Break the stone picture into chunks with velocities. */
  function shatter(src) {
    const seeds = [];
    for (let j = 0; j < 14; j++) seeds.push([CX + (Math.random() - 0.5) * 44, CY + (Math.random() - 0.5) * 36]);
    const groups = seeds.map(() => []);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = src[y * W + x];
      if (!(c >>> 24)) continue;
      let best = 0, bd = 1e9;
      for (let j = 0; j < seeds.length; j++) { const d = (x - seeds[j][0]) ** 2 + (y - seeds[j][1]) ** 2; if (d < bd) { bd = d; best = j; } }
      groups[best].push([x, y, c]);
    }
    return groups.filter((g) => g.length).map((g) => {
      const mx = g.reduce((a, p) => a + p[0], 0) / g.length, my = g.reduce((a, p) => a + p[1], 0) / g.length;
      const pix = g.map(([x, y, c]) => [x - mx, y - my, c]);
      const bottom = Math.max(...pix.map((p) => p[1]));
      const dx = mx - CX, dy = my - (CY - 10);
      const l = Math.hypot(dx, dy) || 1;
      return { pix, x: mx, y: my, bottom, vx: (dx / l) * (30 + Math.random() * 50), vy: (dy / l) * 30 - 70 - Math.random() * 60, rest: false };
    });
  }

  layout();
  refresh();
  raf = requestAnimationFrame(frame);

  return {
    el: view, stones,
    get open() { return isOpen; },
    show() {
      refresh();
      isOpen = true;
      view.classList.remove('out');
      view.classList.add('on');
      view.removeAttribute('aria-hidden');
      for (const s of stones) { s.main.tabIndex = 0; s.del.tabIndex = 0; }
      const list = stones.map((s) => s.info);
      const latest = list.filter((x) => x.used).sort((a, b) => (b.saved || 0) - (a.saved || 0))[0];
      const first = latest ? stones[latest.i] : stones.find((s) => !s.info.used) || stones[0];
      setTimeout(() => { if (isOpen) first.main.focus({ preventScroll: true }); }, 380);
      play('rumble_hit', { vol: 0.3 });
    },
    hide() {
      isOpen = false;
      view.classList.remove('on');
      view.classList.add('out');
      view.setAttribute('aria-hidden', 'true');
      for (const s of stones) { s.main.tabIndex = -1; s.del.tabIndex = -1; s.hot = false; s.slotEl.classList.remove('hot'); }
      setTimeout(() => view.classList.remove('out'), 400);
    },
    refresh,
    /** Debug: pretend slot i is at pct% (null to clear). */
    setFake(i, pct) { stones[i].fake = pct == null ? null : clamp(pct, 0, 100); refresh(); step(0); },
    /** Debug: run the animation by hand. */
    step(dt = 1 / 60, n = 1) { for (let j = 0; j < n; j++) step(dt); },
    smash(i) { const s = stones[i]; if (!s.info?.used && s.fake == null) return false; s.slotEl.classList.add('busy'); s.smash = { t: 0, phase: 'swing', chunks: null, cracks: [] }; return true; },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      view.remove();
      unstyle();
    },
  };
}

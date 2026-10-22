// Hanging-sign menus. Every button is a carved wooden sign in pixel art, hanging on two chains
// (or ropes) from a wrought-iron wall bracket, a beam, or the top of the screen. The signs are
// real 2D physics: verlet chain links that only pull (they go slack and snap taut), a rigid
// four-point sign body (so it carries angular momentum), springy mount hooks, sign-on-sign bumps,
// and a breeze from a fast cursor or finger. Hovering nudges a sign, pressing yanks it (it
// squashes, swings and the chains rattle), dragging swings it around. Sounds: chain clinks, wood
// creaks and knocks.
//
// Everything is drawn into one low-res canvas (1 canvas pixel = --px CSS px) by a small software
// rasteriser, so rotated signs stay hard-edged pixel art (nearest neighbour, no smoothing). Real
// <button>s ride along on top of each sign (transparent, rotated with it) for the mouse, touch,
// keyboard focus and screen readers; the canvas draws the focus ring.
//
//   import { makeSignMenu } from '../ui/signs.js';
//   const menu = makeSignMenu(container, [
//     { label: 'Continue', primary: true, onClick: () => ... },
//     { label: 'Settings', onClick: () => ... },
//     { label: 'Paused', header: true },            // a sign that is not a button
//   ], { audio: game.audio, mount: 'bracket', layer: someFullScreenEl });
//
// container: where the signs hang. A placeholder box is added to it (sized to the signs, so it
//   takes part in the container's layout); the signs hang from its top edge.
// opts:
//   audio        AudioSys for sounds (optional)
//   layer        full-screen element to draw in (default: the #ui root); must not be transformed
//   mount        'bracket' (iron wall bracket from the layer's left edge) | 'beam' (a wooden beam
//                hung from above) | 'ceiling' (chains up off the top of the screen) | 'hooks'
//   hanger       'chain' | 'rope'
//   columns      signs side by side (1 = one stack; items.length = a row)
//   width        board width in art pixels (default: fits the longest label, same for a column)
//   scale        letter scale (2 = 10x14 art px letters)
//   gap          chain length between stacked signs (art px); top: chain length below the mount
//   drop         entrance: the signs drop in from above (default true)
//   label        aria-label of the menu (default 'Menu')
//   autofocus    focus the first button (default: not on touch screens)
//   breeze       ambient draught strength 0..1 (default 0.25)
//   onEscape     called on Escape inside the menu
// Returns { el, layer, buttons, items, signs, focus(i), yank(i), setLabel(i, text),
//   setDisabled(i, on), raise(on), relayout(), step(dt), destroy() }.
import { el, shade, mixHex, clamp } from '../core/util.js';

// ------------------------------------------------------------------ colours
/** 0xRRGGBB (+ alpha) → little-endian ImageData word (0xAABBGGRR). */
const C32 = (hex, a = 255) => (((a & 255) << 24) | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >>> 16) & 0xff)) >>> 0;

const TONES = {
  oak: { base: 0x9a6a3e, light: 0xbc8a54, dark: 0x6e4626, grain: 0x82562f, seam: 0x4a2c16, line: 0x2a160c, carve: 0x3c2111, carveLo: 0x26130a, lip: 0xd9aa6c, knot: 0x5a361c },
  walnut: { base: 0x6e462a, light: 0x8a5c3a, dark: 0x4a2c18, grain: 0x5a3820, seam: 0x321a0c, line: 0x1c0d06, carve: 0x261309, carveLo: 0x170a04, lip: 0xae7c4c, knot: 0x3a2010 },
  pine: { base: 0xb88a52, light: 0xd8aa6c, dark: 0x8a6034, grain: 0xa07440, seam: 0x5a3a1c, line: 0x2e1a0c, carve: 0x4a2c14, carveLo: 0x2e1a0a, lip: 0xf0cc90, knot: 0x7a5028 },
  red: { base: 0x9a3626, light: 0xbc4a34, dark: 0x6a2216, grain: 0x84301f, seam: 0x4a160c, line: 0x240a06, carve: 0x3a0e08, carveLo: 0x220604, lip: 0xe07a5a, knot: 0x5a1a10 },
  ash: { base: 0x6a6460, light: 0x847e78, dark: 0x4a4542, grain: 0x5c5652, seam: 0x343130, line: 0x1a1818, carve: 0x2e2a28, carveLo: 0x1e1c1a, lip: 0x9a948e, knot: 0x403c3a },
};
const IRON = { line: 0x16121a, dark: 0x3a3640, mid: 0x6a6672, hi: 0xb4b0bc, glint: 0xeeeaf4 };
const ROPE = { line: 0x2e1c0c, dark: 0x6e4e26, mid: 0xa47a42, hi: 0xd8b070 };
const EMBER = [0xfffbe0, 0xfff0a0, 0xffd870, 0xffb648, 0xff9636, 0xf47426, 0xe0561c, 0xc8401a];
const GOLD = [0xfff6c8, 0xffe48a, 0xf6cc50, 0xe8b23c, 0xd89c2c, 0xc08420, 0xa86c18];

// ------------------------------------------------------------------ font: 5x7 caps
const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'], H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'], J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'], L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'], R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'], X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'], Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], 1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], 3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['#...#', '#...#', '#...#', '#####', '....#', '....#', '....#'], 5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'], 7: ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], 9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'], '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '!': ['#', '#', '#', '#', '#', '.', '#'], '.': ['.', '.', '.', '.', '.', '.', '#'], ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  "'": ['#', '#', '.', '.', '.', '.', '.'], '-': ['....', '....', '....', '####', '....', '....', '....'], ':': ['.', '#', '.', '.', '.', '#', '.'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'], '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'], ' ': ['...', '...', '...', '...', '...', '...', '...'],
};
const glyph = (ch) => G[ch] || G[ch.toUpperCase()] || G[' '];
function textMask(str, scale) {
  const s = String(str).toUpperCase();
  let w = 0;
  for (const ch of s) w += (glyph(ch)[0].length + 1) * scale;
  w = Math.max(0, w - scale);
  const h = 7 * scale;
  const m = new Uint8Array(Math.max(1, w * h));
  let x0 = 0;
  for (const ch of s) {
    const g = glyph(ch);
    for (let y = 0; y < 7; y++) for (let x = 0; x < g[y].length; x++) {
      if (g[y][x] !== '#') continue;
      for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) m[(y * scale + b) * w + x0 + x * scale + a] = 1;
    }
    x0 += (g[0].length + 1) * scale;
  }
  return { w, h, m };
}

// ------------------------------------------------------------------ sprites
class Spr {
  constructor(w, h) { this.w = w; this.h = h; this.p = new Uint32Array(w * h); }
  set(x, y, hex, a = 255) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = C32(hex, a); }
  has(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h && (this.p[y * this.w + x] >>> 24) > 0; }
}
const hash = (x, y, s) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const RING_H = 5; // eye-bolt loops above the board
const PAD_Y = 6;
const PAD_X = 11;

/** Board size for a label at a letter scale. */
export function signSize(label, scale = 2, extra = 0) {
  const t = textMask(label, scale);
  return { w: Math.max(56, t.w + PAD_X * 2 + 2 + extra), bh: t.h + PAD_Y * 2 + 2 };
}

/**
 * Draw one sign. o: { label, w, scale, tone, look: 'idle'|'hot'|'press'|'off', paint: 'carve'|'gold',
 * header, below (rings under the board for the next sign), ringX }.
 */
function drawSign(o) {
  const T = TONES[o.tone] || TONES.oak;
  const scale = o.scale || 2;
  const t = textMask(o.label, scale);
  const W = o.w;
  const bh = t.h + PAD_Y * 2 + 2;
  const below = o.below ? 4 : 0;
  const H = RING_H + bh + below;
  const s = new Spr(W, H);
  const y0 = RING_H, y1 = RING_H + bh - 1;
  const notch = o.header ? 4 : 0;
  const seed = (o.seed || 1) * 7 + o.label.length;
  const inside = (x, y) => {
    if (y < y0 || y > y1 || x < 0 || x >= W) return false;
    const dy = Math.min(y - y0, y1 - y);
    const dx = Math.min(x, W - 1 - x);
    if (notch) { // banner ends: a notch cut into each end
      const mid = (y0 + y1) / 2;
      if (dx < notch - Math.abs(y - mid) * (notch / ((y1 - y0) / 2)) * 0.9) return false;
    }
    return !(dx + dy < 2); // cut corners
  };
  const off = o.look === 'off';
  const tone = (c) => (off ? mixHex(c, 0x5a5550, 0.55) : o.look === 'press' ? shade(c, 0.86) : c);
  // ---- planks
  const planks = bh >= 22 ? 2 : 1;
  const ph = (bh - 2) / planks;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (edge) { s.set(x, y, T.line); continue; }
    const py = y - y0 - 1;
    const pi = Math.min(planks - 1, Math.floor(py / ph));
    const inP = py - pi * ph;
    let c = pi % 2 ? shade(T.base, 0.95) : T.base;
    // wavy grain lines
    const wave = Math.sin(x * 0.21 + pi * 2.3 + seed) * 1.6 + Math.sin(x * 0.07 + seed * 0.3) * 1.2;
    if (Math.abs(((inP + wave + 40) % 4.2) - 2.1) < 0.45) c = T.grain;
    if (hash(x >> 2, y, seed) < 0.05) c = shade(c, 1.07);
    // knots
    const kx = ((seed * 37 + pi * 53) % (W - 30)) + 15, ky = pi * ph + ph / 2;
    const kd = Math.hypot((x - kx) / 2.6, (py - ky) / 1.4);
    if (kd < 1) c = T.knot; else if (kd < 1.7) c = shade(T.grain, 0.92);
    // plank seam
    if (pi > 0 && Math.abs(inP) < 0.5) c = T.seam;
    // bevel
    if (!inside(x, y - 2) || !inside(x - 2, y)) c = mixHex(c, T.light, 0.6);
    else if (!inside(x, y + 2) || !inside(x + 2, y)) c = mixHex(c, T.dark, 0.6);
    s.set(x, y, tone(c));
  }
  // ---- iron corner straps with rivets (and banner ends get none)
  if (!o.header) {
    for (const [cx, sx] of [[2, 1], [W - 3, -1]]) for (const [cy, sy] of [[y0 + 2, 1], [y1 - 2, -1]]) {
      for (let k = 0; k < 6; k++) { s.set(cx + sx * k, cy, tone(k === 5 ? IRON.dark : IRON.mid)); s.set(cx, cy + sy * k, tone(k === 5 ? IRON.dark : IRON.mid)); }
      for (let k = 0; k < 5; k++) { s.set(cx + sx * k, cy + sy, tone(IRON.dark)); s.set(cx + sx, cy + sy * k, tone(IRON.dark)); }
      s.set(cx, cy, tone(IRON.hi));
      s.set(cx + sx * 3, cy, tone(IRON.glint));
    }
  }
  // ---- text
  const tx = Math.round((W - t.w) / 2), ty = y0 + 1 + PAD_Y;
  const at = (x, y) => x >= 0 && y >= 0 && x < t.w && y < t.h && t.m[y * t.w + x] === 1;
  const paint = o.look === 'hot' ? 'ember' : (o.paint === 'gold' && !off ? 'gold' : 'carve');
  // scorch / shadow halo first (outside the strokes)
  for (let y = -2; y < t.h + 2; y++) for (let x = -2; x < t.w + 2; x++) {
    if (at(x, y)) continue;
    const X = tx + x, Y = ty + y;
    if (!s.has(X, Y)) continue;
    const near = at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1);
    if (paint === 'carve') {
      // the lit lip below/right of a groove
      if (at(x, y - 1) || at(x - 1, y)) s.set(X, Y, tone(mixHex(T.base, T.lip, 0.65)));
    } else if (paint === 'gold') {
      if (near) s.set(X, Y, 0x2a1406);
      else if (at(x - 1, y - 1)) s.set(X, Y, 0x2a1406);
    } else if (near) s.set(X, Y, mixHex(T.dark, 0x5a1608, 0.55)); // heat-scorched rim
    else if (at(x - 1, y - 1) || at(x + 1, y + 1) || at(x + 1, y - 1) || at(x - 1, y + 1)) s.set(X, Y, mixHex(T.base, 0x8a2a10, 0.45));
  }
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    if (!at(x, y)) continue;
    let c;
    if (paint === 'carve') {
      c = !at(x, y - 1) || !at(x - 1, y) ? T.carveLo : T.carve;
      if (!at(x, y + 1) && at(x, y - 1)) c = mixHex(T.carve, T.dark, 0.4);
      c = tone(c);
    } else {
      const ramp = paint === 'gold' ? GOLD : EMBER;
      c = ramp[Math.min(ramp.length - 1, Math.floor((y / t.h) * ramp.length))];
      if (!at(x, y - 1)) c = ramp[0];
      if (!at(x + 1, y) && paint === 'gold') c = shade(c, 0.88);
    }
    s.set(tx + x, ty + y, c);
  }
  // ---- eye bolts on top (and loops underneath for a sign hanging below)
  const ring = (rx, top) => {
    const rows = top ? ['.##.', '#..#', '#..#', '#..#', '.##.'] : ['.##.', '#..#', '.##.'];
    const oy = top ? 0 : y1;
    rows.forEach((r, j) => { for (let i = 0; i < 4; i++) if (r[i] === '#') s.set(rx - 2 + i, oy + j, j === 0 || i === 0 ? IRON.hi : j === rows.length - 1 ? IRON.dark : IRON.mid); });
    // bolt plate on the board
    const py = top ? y0 + 1 : y1 - 1;
    for (let i = -2; i <= 1; i++) s.set(rx + i, py, i === -2 ? IRON.hi : IRON.dark);
    s.set(rx, py, IRON.glint);
  };
  for (const rx of o.ringX) { ring(rx, true); if (o.below) ring(rx, false); }
  return s;
}

/** Chain links and rope pieces, drawn along the link (long axis = y). */
function linkSprites(hanger) {
  if (hanger === 'rope') {
    const a = new Spr(3, 5), b = new Spr(3, 5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
      const tw = (x + y) % 3;
      a.set(x, y, x === 0 ? ROPE.hi : x === 2 ? ROPE.dark : tw === 0 ? ROPE.dark : ROPE.mid);
      b.set(x, y, x === 0 ? ROPE.hi : x === 2 ? ROPE.dark : tw === 1 ? ROPE.dark : ROPE.mid);
    }
    return [a, b];
  }
  const face = new Spr(4, 6), edge = new Spr(2, 6);
  ['.##.', '#..#', '#..#', '#..#', '#..#', '.##.'].forEach((r, y) => { for (let x = 0; x < 4; x++) if (r[x] === '#') face.set(x, y, x === 0 || y === 0 ? IRON.hi : x === 3 || y === 5 ? IRON.dark : IRON.mid); });
  for (let y = 0; y < 6; y++) { edge.set(0, y, y === 1 ? IRON.glint : IRON.hi); edge.set(1, y, IRON.dark); }
  return [face, edge];
}

// ------------------------------------------------------------------ rasteriser
/**
 * Draw sprite `spr` into the frame so sprite point (ax, ay) lands on (cx, cy), rotated by ang
 * (radians, clockwise on screen) and scaled by (sx, sy). solid: draw only the silhouette in that
 * colour (outlines, shadows); onlyEmpty: don't cover what is already there.
 */
function blit(F, spr, ax, ay, cx, cy, ang, sx = 1, sy = 1, solid = 0, onlyEmpty = false) {
  const { w: W, h: H, buf } = F;
  const co = Math.cos(ang), si = Math.sin(ang);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of [[-ax, -ay], [spr.w - ax, -ay], [-ax, spr.h - ay], [spr.w - ax, spr.h - ay]]) {
    const X = cx + co * u * sx - si * v * sy, Y = cy + si * u * sx + co * v * sy;
    if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
  }
  const ix0 = Math.max(0, Math.floor(x0)), ix1 = Math.min(W - 1, Math.ceil(x1));
  const iy0 = Math.max(0, Math.floor(y0)), iy1 = Math.min(H - 1, Math.ceil(y1));
  const sp = spr.p, sw = spr.w, sh = spr.h;
  const isx = 1 / sx, isy = 1 / sy;
  for (let y = iy0; y <= iy1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = ix0; x <= ix1; x++) {
      const dx = x + 0.5 - cx;
      const u = Math.floor((co * dx + si * dy) * isx + ax);
      const v = Math.floor((-si * dx + co * dy) * isy + ay);
      if (u < 0 || v < 0 || u >= sw || v >= sh) continue;
      const c = sp[v * sw + u];
      if (!(c >>> 24)) continue;
      const i = y * W + x;
      if (onlyEmpty && buf[i] >>> 24) continue;
      buf[i] = solid || c;
    }
  }
}

// ------------------------------------------------------------------ physics
const GRAV = 560; // art px / s²
const STEP = 1 / 120;
const ITERS = 10;

class World {
  constructor() {
    this.x = []; this.y = []; this.ox = []; this.oy = []; this.im = []; this.fx = []; this.fy = []; this.drag = [];
    this.links = []; // [a, b, rest, rope]
  }
  add(x, y, im, drag = 0.8) {
    const i = this.x.length;
    this.x.push(x); this.y.push(y); this.ox.push(x); this.oy.push(y); this.im.push(im); this.fx.push(0); this.fy.push(0); this.drag.push(drag);
    return i;
  }
  link(a, b, rest, rope = false) {
    if (rest == null) rest = Math.hypot(this.x[b] - this.x[a], this.y[b] - this.y[a]);
    const l = { a, b, rest, rope, taut: true };
    this.links.push(l);
    return l;
  }
  vel(i) { return [(this.x[i] - this.ox[i]) / STEP, (this.y[i] - this.oy[i]) / STEP]; }
  kick(i, vx, vy) { this.ox[i] -= vx * STEP; this.oy[i] -= vy * STEP; }
  move(i, dx, dy) { this.x[i] += dx; this.y[i] += dy; this.ox[i] += dx; this.oy[i] += dy; }
}

// ------------------------------------------------------------------ sounds
function sfx(audio) {
  const ok = () => audio && audio.ctx && audio.ctx.state === 'running';
  const R = (a, b) => a + Math.random() * (b - a);
  const last = {};
  const gate = (k, gap) => { const now = performance.now(); if (last[k] && now - last[k] < gap) return false; last[k] = now; return true; };
  return {
    clink(v = 1, pan = 0) {
      if (!ok() || !gate('clink', 45)) return;
      const f = R(2300, 3600);
      audio.tone({ f, type: 'square', dur: 0.025, vol: 0.022 * v, filter: 'bandpass', ff: f * 1.4, q: 6, pan });
      audio.tone({ f: f * 2.71, type: 'sine', dur: 0.09, vol: 0.016 * v, reverb: 0.25, pan });
      if (v > 0.6) audio.tone({ f: f * 0.62, type: 'sine', dur: 0.06, vol: 0.012 * v, delay: 0.03, pan });
    },
    rattle(v = 1, pan = 0) {
      if (!ok()) return;
      for (let i = 0; i < 4; i++) {
        const f = R(2000, 3800);
        audio.tone({ f, type: 'square', dur: 0.02, vol: 0.018 * v, filter: 'bandpass', ff: f * 1.3, q: 5, delay: i * R(0.03, 0.06), pan });
      }
      last.clink = performance.now();
    },
    creak(v = 1, pan = 0) {
      if (!ok() || !gate('creak', 380)) return;
      const f = R(95, 150);
      audio.tone({ f, f2: f * R(0.7, 1.3), type: 'sawtooth', dur: R(0.18, 0.32), a: 0.04, vol: 0.035 * v, filter: 'bandpass', ff: R(420, 700), q: 7, vib: R(14, 26), vibRate: R(18, 30), pan });
      audio.noise({ color: 'brown', filter: 'lowpass', f: 260, dur: 0.2, a: 0.05, vol: 0.05 * v, pan });
    },
    knock(v = 1, pan = 0) {
      if (!ok() || !gate('knock', 70)) return;
      const f = R(190, 260);
      audio.tone({ f, f2: f * 0.7, type: 'triangle', dur: 0.07, vol: 0.12 * v, pan });
      audio.noise({ filter: 'bandpass', f: R(800, 1200), q: 1.4, dur: 0.035, vol: 0.08 * v, pan });
    },
    whoosh(v = 1) {
      if (!ok() || !gate('whoosh', 250)) return;
      audio.noise({ color: 'pink', filter: 'bandpass', f: 600, f2: 1600, q: 0.9, dur: 0.18, a: 0.05, vol: 0.06 * v });
    },
  };
}

// ------------------------------------------------------------------ styles
const CSS = /* css */`
.sg-slot { position: relative; pointer-events: none; flex: none; }
.sg-layer { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
.sg-layer canvas { position: absolute; left: 0; top: 0; image-rendering: pixelated; image-rendering: crisp-edges; pointer-events: none; }
.sg-layer.sg-gone { visibility: hidden; }
.sg-nav { position: absolute; inset: 0; pointer-events: none; }
#ui .sg-btn, .sg-btn { position: absolute; left: 0; top: 0; margin: 0; padding: 0; border: 0; background: transparent; color: transparent;
  pointer-events: auto; cursor: pointer; transform-origin: 0 0; touch-action: none; -webkit-tap-highlight-color: transparent;
  font: inherit; outline: none; }
#ui .sg-btn:focus-visible, .sg-btn:focus-visible { outline: none; }
.sg-btn[disabled] { cursor: default; }
.sg-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
`;
let cssRefs = 0, cssEl = null;
function useCss() {
  if (!cssRefs++) {
    cssEl = document.createElement('style');
    cssEl.id = 'signs-css';
    cssEl.textContent = CSS;
    document.head.append(cssEl);
  }
  let done = false;
  return () => { if (done) return; done = true; if (!--cssRefs && cssEl) { cssEl.remove(); cssEl = null; } };
}

const cssPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
const isTouch = () => document.documentElement.classList.contains('is-touch') || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ the menu
export function makeSignMenu(container, itemsIn, opts = {}) {
  const items = itemsIn.filter((it) => it && !it.hidden).map((it) => ({ ...it }));
  const sounds = sfx(opts.audio);
  const hanger = opts.hanger || 'chain';
  const mount = opts.mount || 'bracket';
  const scale = opts.scale || 2;
  const gap = opts.gap ?? 7;
  const topLen = opts.top ?? (mount === 'ceiling' ? 0 : 12);
  const cols = Math.max(1, Math.min(items.length, opts.columns || 1));
  const colGap = opts.colGap ?? 10;
  const breeze = opts.breeze ?? 0.25;
  const calm = reduced();
  const unstyle = useCss();

  const layerHost = opts.layer || container.closest('#ui') || document.body;
  const layer = el('div', { class: 'sg-layer' + (opts.className ? ' ' + opts.className : '') });
  const canvas = el('canvas', { 'aria-hidden': 'true' });
  const nav = el('nav', { class: 'sg-nav', 'aria-label': opts.label || 'Menu' });
  layer.append(canvas, nav);
  layerHost.append(layer);
  const slot = el('div', { class: 'sg-slot', 'aria-hidden': 'true' });
  container.append(slot);
  const ctx = canvas.getContext('2d');
  const linkSpr = linkSprites(hanger);

  // ---- columns and sizes (art px)
  const colOf = items.map((_, i) => (cols === 1 ? 0 : i % cols));
  const rowOf = items.map((_, i) => (cols === 1 ? i : Math.floor(i / cols)));
  const sizes = items.map((it) => signSize(it.label, it.scale || scale, it.header ? 10 : 0));
  const colW = [];
  for (let c = 0; c < cols; c++) colW[c] = opts.width || Math.max(...sizes.filter((_, i) => colOf[i] === c).map((s) => s.w));
  const signs = items.map((it, i) => {
    const w = it.header ? Math.max(colW[colOf[i]] + 10, sizes[i].w) : (opts.width || colW[colOf[i]]);
    const inset = Math.max(9, Math.round(w * 0.16));
    return { i, it, w, bh: sizes[i].bh, h: RING_H + sizes[i].bh, ringX: [inset, w - 1 - inset], col: colOf[i], row: rowOf[i], below: false, sq: 0, sqv: 0, hot: 0, ang: 0, angV: 0, lastAng: 0 };
  });
  for (const s of signs) s.below = signs.some((o) => o.col === s.col && o.row === s.row + 1);
  const colX = [];
  let totalW = 0;
  for (let c = 0; c < cols; c++) { colX[c] = totalW; totalW += Math.max(colW[c], ...signs.filter((s) => s.col === c).map((s) => s.w)) + (c < cols - 1 ? colGap : 0); }
  const colH = (c) => {
    let h = topLen;
    for (const s of signs) if (s.col === c) h += s.h + (s.row > 0 ? gap : 0);
    return h;
  };
  const totalH = Math.max(...Array.from({ length: cols }, (_, c) => colH(c))) + (mount === 'bracket' ? 4 : mount === 'beam' ? 7 : 0) + 3;

  // ---- sprites per sign and look
  const looks = ['idle', 'hot', 'press', 'off'];
  function buildSprites(s) {
    s.spr = {};
    for (const look of looks) s.spr[look] = drawSign({ label: s.it.label, w: s.w, scale: s.it.scale || scale, tone: s.it.tone || (s.it.header ? 'walnut' : s.it.danger ? 'red' : 'oak'), look, paint: s.it.header || s.it.primary ? 'gold' : 'carve', header: s.it.header, below: s.below, ringX: s.ringX, seed: s.i + 1 });
  }
  signs.forEach(buildSprites);

  // ---- DOM buttons (real, accessible)
  const buttons = signs.map((s) => {
    if (s.it.header) {
      const h = el('h2', { class: 'sg-sr' }, s.it.label);
      nav.append(h);
      return null;
    }
    const b = el('button', { class: 'sg-btn', type: 'button', 'aria-label': s.it.aria || s.it.label, title: s.it.title || '' }, [el('span', { class: 'sg-sr' }, s.it.label)]);
    if (s.it.disabled) b.disabled = true;
    s.btn = b;
    nav.append(b);
    return b;
  });
  const btnList = buttons.filter(Boolean);

  // ---- layout → world
  let unit = 1, dpr = 1, FW = 0, FH = 0, frame = null, img = null;
  let W = null;
  let anchorOff = { x: 0, y: 0 };
  let lastOff = { x: 0, y: 0 };
  let curSlot = { x: 0, y: 0 };
  let mountSpr = null, mountAt = { x: 0, y: 0 };
  let slotArt = { x: 0, y: 0 };
  let raised = 0, raiseFrom = 0, raiseTo = 0, raiseT = 1, raiseDur = 0.5, raiseKind = 'out';
  const anchors = []; // { p: particle, hx, hy (rest) }

  function measure() {
    dpr = window.devicePixelRatio || 1;
    const dev = Math.max(1, Math.round(cssPx() * dpr * (opts.unitScale || 1)));
    unit = dev / dpr;
    slot.style.width = `${Math.ceil(totalW * unit)}px`;
    slot.style.height = `${Math.ceil(totalH * unit)}px`;
    const lr = layerHost.getBoundingClientRect();
    FW = Math.max(1, Math.ceil(lr.width / unit));
    FH = Math.max(1, Math.ceil(lr.height / unit));
    canvas.width = FW;
    canvas.height = FH;
    canvas.style.width = `${FW * unit}px`;
    canvas.style.height = `${FH * unit}px`;
    img = ctx.createImageData(FW, FH);
    frame = { w: FW, h: FH, buf: new Uint32Array(img.data.buffer) };
  }
  function slotPos() {
    const lr = layerHost.getBoundingClientRect(), sr = slot.getBoundingClientRect();
    return { x: (sr.left - lr.left) / unit, y: (sr.top - lr.top) / unit };
  }

  // Sign frame: particle p0 sits at sprite pixel (ringX[0], 1) (top of the left eye bolt), p1 at
  // (ringX[1], 1); p2/p3 at the same x, s.h + 1 below (the loops under the board, where the next
  // sign's chains hook on). Local coords: origin p0, x along p0→p1, y down.
  function build(dropIn) {
    measure();
    slotArt = slotPos();
    W = new World();
    anchors.length = 0;
    const mountY = mount === 'bracket' ? 2 : mount === 'beam' ? 5 : mount === 'hooks' ? 1 : -3;
    const ox = Math.round(slotArt.x), oy = Math.round(slotArt.y);
    for (let c = 0; c < cols; c++) {
      let prevBottom = null; // [bL, bR] particles of the sign above
      let y = mount === 'ceiling' ? mountY : oy + mountY; // where the next chains start
      const cs = signs.filter((s) => s.col === c).sort((a, b) => a.row - b.row);
      for (const s of cs) {
        const sx = ox + colX[c] + Math.round(((colW[c] || s.w) - s.w) / 2);
        const top = prevBottom ? y + gap : (mount === 'ceiling' ? oy + topLen : y + topLen); // sprite row 0
        const froms = prevBottom ? null : s.ringX.map((rx) => {
          const x = sx + rx;
          const hp = W.add(x, y, 0);
          const pinned = mount === 'ceiling';
          const ap = pinned ? hp : W.add(x, y, 1 / 3, 16);
          anchors.push({ h: hp, p: ap, x, y, k: pinned ? 0 : 1 });
          return ap;
        });
        const pL = W.add(sx + s.ringX[0], top + 1, 1, 0.75), pR = W.add(sx + s.ringX[1], top + 1, 1, 0.75);
        const bR = W.add(sx + s.ringX[1], top + s.h + 1, 1, 0.75), bL = W.add(sx + s.ringX[0], top + s.h + 1, 1, 0.75);
        s.p = [pL, pR, bR, bL];
        for (const [a, b] of [[pL, pR], [bL, bR], [pL, bL], [pR, bR], [pL, bR], [pR, bL]]) W.link(a, b);
        s.chains = [];
        s.p.slice(0, 2).forEach((to, k) => {
          const from = prevBottom ? prevBottom[k] : froms[k];
          const fx = W.x[from], fy = W.y[from], tx = W.x[to], ty = W.y[to];
          const L = Math.max(2, Math.hypot(tx - fx, ty - fy));
          const n = Math.max(1, Math.round(L / (hanger === 'rope' ? 4 : 4.6)));
          const chain = [from];
          for (let j = 1; j < n; j++) chain.push(W.add(fx + (tx - fx) * (j / n), fy + (ty - fy) * (j / n), 6, 2.4));
          chain.push(to);
          for (let j = 0; j < chain.length - 1; j++) W.link(chain[j], chain[j + 1], L / n, true);
          s.chains.push(chain);
        });
        prevBottom = [bL, bR];
        y = top + s.h + 1;
      }
    }
    mountSpr = makeMount();
    lastOff = { x: 0, y: 0 };
    anchorOff = { x: 0, y: 0 };
    if (dropIn) {
      raised = -(slotArt.y + totalH + 24);
      setRaise(0, 'in', 0.5);
      for (let i = 0; i < W.x.length; i++) if (W.im[i] > 0) W.move(i, 0, raised);
      anchorOff.y = lastOff.y = raised;
      for (const s of signs) push(s, Math.random(), 0.7, (Math.random() - 0.5) * 50, 0);
    }
  }

  // ---- mount sprites
  function makeMount() {
    if (!anchors.length || mount === 'ceiling') return null;
    const xs = anchors.map((a) => a.x);
    const ay = anchors[0].y;
    if (mount === 'bracket') {
      const end = Math.max(...xs) + 9;
      const w = end + 4, h = 34;
      const s = new Spr(w, h);
      const by = 3; // bar row
      const iron = (x, y, c) => s.set(x, y, c);
      // wall plate
      for (let y = 0; y < 30; y++) for (let x = 0; x < 5; x++) iron(x, y, x === 4 || y === 0 || y === 29 ? IRON.line : x === 3 ? IRON.dark : y === 1 ? IRON.hi : IRON.mid);
      for (const y of [4, 25]) { iron(1, y, IRON.glint); iron(2, y, IRON.dark); }
      // bar
      for (let x = 4; x < end; x++) { iron(x, by - 1, IRON.line); iron(x, by, x % 9 === 0 ? IRON.glint : IRON.hi); iron(x, by + 1, IRON.mid); iron(x, by + 2, IRON.line); }
      // scroll curl at the end
      const cx = end, cy = by + 3;
      for (let a = 0; a < Math.PI * 3.2; a += 0.08) {
        const r = 3.6 - a * 0.33;
        if (r < 0.6) break;
        const x = Math.round(cx + Math.sin(a) * r), y = Math.round(cy - Math.cos(a) * r);
        iron(x, y, a < 1.4 ? IRON.hi : IRON.mid);
      }
      // diagonal brace and a C-scroll between brace and bar
      const bx1 = Math.round(Math.min(end - 10, 6 + (end - 6) * 0.58));
      for (let t = 0; t <= 1; t += 1 / (bx1 * 1.5)) {
        const x = Math.round(4 + (bx1 - 4) * t), y = Math.round(26 + (by + 2 - 26) * t);
        iron(x, y, IRON.mid); iron(x, y + 1, IRON.line); iron(x, y - 1, IRON.hi);
      }
      const sc = (ccx, ccy, r0) => { for (let a = 0; a < Math.PI * 2.6; a += 0.07) { const r = r0 - a * (r0 / 9); if (r < 0.8) break; s.set(Math.round(ccx + Math.cos(a) * r), Math.round(ccy + Math.sin(a) * r), IRON.mid); } };
      sc(11, by + 8, 4.6);
      sc(Math.round(bx1 * 0.55), by + 6, 3.4);
      mountAt = { x: 0, y: ay - by };
      return s;
    }
    if (mount === 'beam') {
      const x0 = Math.min(...xs) - 10, x1 = Math.max(...xs) + 10;
      const w = x1 - x0 + 1, h = 7;
      const s = new Spr(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const edge = y === 0 || y === h - 1 || x === 0 || x === w - 1;
        let c = edge ? TONES.walnut.line : y === 1 ? TONES.walnut.light : y === h - 2 ? TONES.walnut.dark : TONES.walnut.base;
        if (!edge && Math.abs(((y + Math.sin(x * 0.2) * 1.4 + 9) % 3.4) - 1.7) < 0.35) c = TONES.walnut.grain;
        s.set(x, y, c);
      }
      for (const ex of [3, w - 4]) { s.set(ex, 2, IRON.hi); s.set(ex, 3, IRON.dark); }
      mountAt = { x: x0, y: ay - 3 };
      return s;
    }
    return null;
  }

  // ---- raise / drop
  function setRaise(to, kind, dur) {
    raiseFrom = raised; raiseTo = to; raiseT = 0; raiseKind = kind; raiseDur = dur;
  }
  const easeInBack = (t) => t * t * (2.2 * t - 1.2);

  // ---- interaction state
  const ptr = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, t: 0, inside: false };
  let grab = null; // { s, u, v, x, y, moved, t0, id }
  let focusSign = -1;
  let hoverSign = -1;
  let sleepT = 0;
  let breezeT = 2;
  let alive = true;

  const local = (s, X, Y) => {
    const [a, b] = s.p;
    const ang = Math.atan2(W.y[b] - W.y[a], W.x[b] - W.x[a]);
    const co = Math.cos(ang), si = Math.sin(ang);
    const dx = X - W.x[a], dy = Y - W.y[a];
    const lx = co * dx + si * dy, ly = -si * dx + co * dy;
    return { u: lx / (s.ringX[1] - s.ringX[0]), v: ly / s.h, lx, ly };
  };
  const weights = (u, v) => {
    const uu = clamp(u, -0.25, 1.25), vv = clamp(v, 0, 1);
    const w = [(1 - uu) * (1 - vv), uu * (1 - vv), uu * vv, (1 - uu) * vv];
    return w.map((x) => Math.max(0, x));
  };
  const pointAt = (s, u, v) => {
    const [a, b, c, d] = s.p;
    const w = weights(u, v);
    const ps = [a, b, c, d];
    let x = 0, y = 0, t = 0;
    for (let k = 0; k < 4; k++) { x += W.x[ps[k]] * w[k]; y += W.y[ps[k]] * w[k]; t += w[k]; }
    return { x: x / t, y: y / t };
  };
  function push(s, u, v, vx, vy) {
    const w = weights(u, v);
    for (let k = 0; k < 4; k++) W.kick(s.p[k], vx * w[k] * 2, vy * w[k] * 2);
    sleepT = 0;
  }
  const toArt = (e) => {
    const lr = layerHost.getBoundingClientRect();
    return { x: (e.clientX - lr.left) / unit, y: (e.clientY - lr.top) / unit };
  };
  const panOf = (s) => clamp(((W.x[s.p[0]] / FW) - 0.5) * 1.4, -0.8, 0.8);

  function hitSign(X, Y) {
    for (let k = signs.length - 1; k >= 0; k--) {
      const s = signs[k];
      if (s.it.header || !s.btn) continue;
      const { lx, ly } = local(s, X, Y);
      if (lx >= -s.ringX[0] && lx < s.w - s.ringX[0] && ly >= RING_H - 1 && ly <= RING_H + s.bh - 2) return s;
    }
    return null;
  }

  function activate(s, how) {
    if (!s || s.it.disabled || s.it.header) return;
    yank(s.i, how === 'key' ? 0.5 : 0.3);
    const fn = s.it.onClick;
    if (fn) setTimeout(() => { if (alive) fn(s.it, api); }, opts.delay ?? 110);
  }

  function yank(i, u = 0.5) {
    const s = signs[i];
    if (!s || !W) return;
    const side = u < 0.5 ? -1 : 1;
    push(s, u, 0.8, side * 70 + (Math.random() - 0.5) * 40, 260);
    push(s, 1 - u, 0.1, -side * 30, -140);
    s.sqv += calm ? 4 : 11;
    sounds.rattle(1, panOf(s));
    sounds.creak(0.8, panOf(s));
  }

  // pointer handlers on buttons
  btnList.forEach((b) => {
    const s = signs.find((x) => x.btn === b);
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || s.it.disabled) return;
      opts.audio?.init?.();
      const p = toArt(e);
      const { u, v } = local(s, p.x, p.y);
      grab = { s, u, v, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: 0, t0: performance.now(), id: e.pointerId };
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
      push(s, u, v, 0, 120);
      s.sqv += calm ? 2 : 6;
      sounds.clink(0.8, panOf(s));
      e.preventDefault();
    });
    b.addEventListener('pointermove', (e) => {
      if (!grab || grab.id !== e.pointerId) return;
      const p = toArt(e);
      grab.moved = Math.max(grab.moved, Math.hypot(p.x - grab.sx, p.y - grab.sy) * unit);
      grab.x = p.x; grab.y = p.y;
    });
    const end = (e, cancel) => {
      if (!grab || grab.id !== e.pointerId) return;
      const g = grab;
      grab = null;
      try { b.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
      if (!cancel && g.moved < 14 && performance.now() - g.t0 < 900) activate(g.s, 'ptr');
      else if (g.moved >= 14) sounds.creak(0.7, panOf(g.s));
    };
    b.addEventListener('pointerup', (e) => end(e, false));
    b.addEventListener('pointercancel', (e) => end(e, true));
    b.addEventListener('click', (e) => { if (e.detail === 0) activate(s, 'key'); }); // keyboard / assistive tech
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      hoverSign = s.i;
      const p = toArt(e);
      const { u, v } = local(s, p.x, p.y);
      const dir = Math.sign(ptr.vx) || (u < 0.5 ? 1 : -1);
      push(s, u, v, dir * clamp(Math.abs(ptr.vx) * 0.05, 28, 90), 10);
      sounds.clink(0.45, panOf(s));
      opts.audio?.play?.('ui_hover');
    });
    b.addEventListener('pointerleave', () => { if (hoverSign === s.i) hoverSign = -1; });
    b.addEventListener('focus', () => {
      focusSign = s.i;
      if (!grab) { push(s, 0.15, 0.5, 26, 0); sounds.clink(0.35, panOf(s)); }
      opts.onFocus?.(s.it, s.i);
    });
    b.addEventListener('blur', () => { if (focusSign === s.i) focusSign = -1; });
  });
  nav.addEventListener('keydown', (e) => {
    const i = btnList.indexOf(document.activeElement);
    const k = e.key;
    const next = (d) => {
      const enabled = btnList.filter((b) => !b.disabled);
      const j = enabled.indexOf(btnList[i]);
      const b = enabled[(j + d + enabled.length) % enabled.length];
      b?.focus();
    };
    if (k === 'ArrowDown' || (k === 'ArrowRight' && cols > 1)) { next(1); e.preventDefault(); }
    else if (k === 'ArrowUp' || (k === 'ArrowLeft' && cols > 1)) { next(-1); e.preventDefault(); }
    else if (k === 'Home') { btnList.find((b) => !b.disabled)?.focus(); e.preventDefault(); }
    else if (k === 'End') { [...btnList].reverse().find((b) => !b.disabled)?.focus(); e.preventDefault(); }
    else if (k === 'Escape' && opts.onEscape) { opts.onEscape(); e.preventDefault(); e.stopPropagation(); }
  });

  // breeze: a fast cursor or finger pushes the air around it
  const onMove = (e) => {
    if (!W) return;
    const p = toArt(e);
    const now = performance.now();
    const dt = Math.max(0.008, (now - ptr.t) / 1000);
    if (now - ptr.t > 120) { ptr.x = p.x; ptr.y = p.y; ptr.t = now; ptr.vx = ptr.vy = 0; return; }
    const vx = (p.x - ptr.x) / dt, vy = (p.y - ptr.y) / dt;
    ptr.vx = ptr.vx * 0.5 + vx * 0.5; ptr.vy = ptr.vy * 0.5 + vy * 0.5;
    const sp = Math.hypot(ptr.vx, ptr.vy);
    if (sp > 260 && !grab) {
      const R = 26;
      let hit = 0;
      for (let i = 0; i < W.x.length; i++) {
        if (W.im[i] <= 0) continue;
        // distance to the segment the pointer swept
        const ax = ptr.x, ay = ptr.y, bx = p.x, by = p.y;
        const l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
        const t = clamp(((W.x[i] - ax) * (bx - ax) + (W.y[i] - ay) * (by - ay)) / l2, 0, 1);
        const d = Math.hypot(W.x[i] - (ax + (bx - ax) * t), W.y[i] - (ay + (by - ay) * t));
        if (d > R) continue;
        const k = (1 - d / R) * Math.min(1, (sp - 260) / 900) * (calm ? 0.3 : 1);
        W.kick(i, ptr.vx * 0.14 * k, ptr.vy * 0.07 * k);
        hit++;
      }
      if (hit > 6) { sleepT = 0; if (sp > 900) sounds.whoosh(Math.min(1, sp / 2400)); }
    }
    ptr.x = p.x; ptr.y = p.y; ptr.t = now;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  // ---- simulation
  function stepPhys(h) {
    const n = W.x.length;
    // anchors follow the slot (CSS layout / animations) and the raise tween
    anchorOff.x = curSlot.x - slotArt.x;
    anchorOff.y = (mount === 'ceiling' ? 0 : curSlot.y - slotArt.y) + raised;
    if (carry) {
      // dropping in: the signs ride down with the mount, then swing when it stops
      const dx = anchorOff.x - lastOff.x, dy = anchorOff.y - lastOff.y;
      if (dx || dy) for (let i = 0; i < n; i++) if (W.im[i] > 0) W.move(i, dx, dy);
    }
    lastOff.x = anchorOff.x; lastOff.y = anchorOff.y;
    for (const a of anchors) {
      W.x[a.h] = a.x + anchorOff.x; W.y[a.h] = a.y + anchorOff.y;
      W.ox[a.h] = W.x[a.h]; W.oy[a.h] = W.y[a.h];
      if (a.k === 0) { W.x[a.p] = W.x[a.h]; W.y[a.p] = W.y[a.h]; W.ox[a.p] = W.x[a.p]; W.oy[a.p] = W.y[a.p]; }
      else {
        // a stiff spring holds the hook to the mount
        W.fx[a.p] += (W.x[a.h] - W.x[a.p]) * 2600;
        W.fy[a.p] += (W.y[a.h] - W.y[a.p]) * 2600;
      }
    }
    // grabbed sign: spring the grab point toward the pointer
    if (grab) {
      const s = grab.s;
      const q = pointAt(s, grab.u, grab.v);
      const dx = clamp(grab.x - q.x, -40, 40), dy = clamp(grab.y - q.y, -40, 40);
      const w = weights(grab.u, grab.v);
      for (let k = 0; k < 4; k++) { W.fx[s.p[k]] += dx * 160 * w[k]; W.fy[s.p[k]] += dy * 160 * w[k]; }
      sleepT = 0;
    }
    for (let i = 0; i < n; i++) {
      if (W.im[i] <= 0) continue;
      const damp = Math.exp(-W.drag[i] * h);
      const vx = (W.x[i] - W.ox[i]) * damp, vy = (W.y[i] - W.oy[i]) * damp;
      W.ox[i] = W.x[i]; W.oy[i] = W.y[i];
      W.x[i] += vx + W.fx[i] * W.im[i] * h * h;
      W.y[i] += vy + (GRAV + W.fy[i] * W.im[i]) * h * h;
      W.fx[i] = 0; W.fy[i] = 0;
    }
    for (let it = 0; it < ITERS; it++) {
      for (const l of W.links) {
        const { a, b } = l;
        const dx = W.x[b] - W.x[a], dy = W.y[b] - W.y[a];
        const d = Math.hypot(dx, dy) || 1e-6;
        if (l.rope && d <= l.rest) continue;
        const wa = W.im[a], wb = W.im[b], ws = wa + wb;
        if (ws <= 0) continue;
        const diff = (d - l.rest) / (d * ws);
        W.x[a] += dx * diff * wa; W.y[a] += dy * diff * wa;
        W.x[b] -= dx * diff * wb; W.y[b] -= dy * diff * wb;
      }
      if (it % 3 === 2) collide();
    }
  }

  // corner-in-board contacts between signs
  const frameOf = (s) => {
    const [a, b] = s.p;
    const ang = Math.atan2(W.y[b] - W.y[a], W.x[b] - W.x[a]);
    return { x: W.x[a], y: W.y[a], co: Math.cos(ang), si: Math.sin(ang) };
  };
  const boardRect = (s) => [-s.ringX[0], RING_H - 1, s.w - s.ringX[0], RING_H + s.bh - 2];
  function collide() {
    for (let i = 0; i < signs.length; i++) for (let j = 0; j < signs.length; j++) {
      if (i === j) continue;
      const A = signs[i], B = signs[j];
      const fa = frameOf(A), fb = frameOf(B);
      const [x0, y0, x1, y1] = boardRect(A);
      const [bx0, by0, bx1, by1] = boardRect(B);
      for (const [lx0, ly0] of [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]]) {
        const cx = fb.x + fb.co * lx0 - fb.si * ly0, cy = fb.y + fb.si * lx0 + fb.co * ly0;
        const dx = cx - fa.x, dy = cy - fa.y;
        const lx = fa.co * dx + fa.si * dy, ly = -fa.si * dx + fa.co * dy;
        if (lx <= x0 || lx >= x1 || ly <= y0 || ly >= y1) continue;
        const pen = [lx - x0, x1 - lx, ly - y0, y1 - ly];
        let m = 0;
        for (let k = 1; k < 4; k++) if (pen[k] < pen[m]) m = k;
        const nlx = m === 0 ? -1 : m === 1 ? 1 : 0, nly = m === 2 ? -1 : m === 3 ? 1 : 0;
        const nx = fa.co * nlx - fa.si * nly, ny = fa.si * nlx + fa.co * nly;
        const d = pen[m] * 0.5;
        const ub = local(B, cx, cy), ua = local(A, cx, cy);
        const wb = weights(ub.u, ub.v), wa = weights(ua.u, ua.v);
        let rv = 0;
        for (let k = 0; k < 4; k++) {
          const pb = B.p[k], pa = A.p[k];
          W.x[pb] += nx * d * wb[k] * 1.6; W.y[pb] += ny * d * wb[k] * 1.6;
          W.x[pa] -= nx * d * wa[k] * 1.6; W.y[pa] -= ny * d * wa[k] * 1.6;
          rv += Math.abs((W.x[pb] - W.ox[pb]) - (W.x[pa] - W.ox[pa])) + Math.abs((W.y[pb] - W.oy[pb]) - (W.y[pa] - W.oy[pa]));
        }
        const speed = rv / STEP / 4;
        if (speed > 40 && visible) { sounds.knock(Math.min(1, speed / 260), panOf(A)); B.sqv += Math.min(4, speed / 80); }
      }
    }
  }

  // ---- render
  function render(t) {
    const F = frame;
    F.buf.fill(0);
    const shadow = C32(0x0a0408, 96);
    // mount
    if (mountSpr) blit(F, mountSpr, 0, 0, Math.round(mountAt.x + anchorOff.x), Math.round(mountAt.y + anchorOff.y), 0);
    // shadows first (chains and boards, offset down-right)
    const drawChains = (solid, ox, oy) => {
      for (const s of signs) for (const ch of s.chains) for (let j = 0; j < ch.length - 1; j++) {
        const a = ch[j], b = ch[j + 1];
        const x0 = W.x[a], y0 = W.y[a], x1 = W.x[b], y1 = W.y[b];
        const ang = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2;
        const spr = linkSpr[j % 2];
        const len = Math.max(2, Math.hypot(x1 - x0, y1 - y0));
        blit(F, spr, spr.w / 2, spr.h / 2, (x0 + x1) / 2 + ox, (y0 + y1) / 2 + oy, ang, 1, Math.max(0.7, Math.min(1.3, (len + 1.2) / spr.h)), solid, !!solid);
      }
    };
    const pose = (s) => {
      const [a, b] = s.p;
      const ax = W.x[a], ay = W.y[a], bx = W.x[b], by = W.y[b];
      const ang = Math.atan2(by - ay, bx - ax);
      return { x: ax, y: ay, ang };
    };
    const sq = (s) => [1 + s.sq * 0.07, 1 - s.sq * 0.1];
    drawChains(shadow, 2, 2);
    for (const s of signs) {
      const p = pose(s);
      const [sx, sy] = sq(s);
      blit(F, s.spr.idle, s.ringX[0], 1, p.x + 2, p.y + 3, p.ang, sx, sy, shadow, true);
    }
    drawChains(0, 0, 0);
    for (const s of signs) {
      const p = pose(s);
      const [sx, sy] = sq(s);
      const off = s.it.disabled;
      const look = off ? 'off' : grab && grab.s === s ? 'press' : s.hot > 0.5 ? 'hot' : 'idle';
      if (s.i === focusSign && !off) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 6);
        const ring = C32(mixHex(0xf2c23a, 0xfff4c0, pulse));
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) blit(F, s.spr.idle, s.ringX[0], 1, p.x + dx, p.y + dy, p.ang, sx, sy, ring);
      }
      blit(F, s.spr[look], s.ringX[0], 1, p.x, p.y, p.ang, sx, sy);
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---- loop
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  let tAll = 0;
  let visible = true;
  let carry = false;
  function tick(now) {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    if (!layer.isConnected || !slot.isConnected) { api.destroy(); return; }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    advance(dt);
  }
  function advance(dt) {
    tAll += dt;
    curSlot = slotPos();
    // raise tween ('in' falls faster and faster and stops dead: the signs carry on and swing)
    carry = false;
    if (raiseT < 1) {
      raiseT = Math.min(1, raiseT + dt / raiseDur);
      const e = raiseKind === 'in' ? raiseT * raiseT : easeInBack(raiseT);
      raised = raiseFrom + (raiseTo - raiseFrom) * e;
      carry = raiseKind === 'in';
      sleepT = 0;
      if (raiseT >= 1 && raiseKind === 'in') {
        const v = (2 * Math.abs(raiseTo - raiseFrom) / raiseDur) * 0.42;
        for (let i = 0; i < W.x.length; i++) if (W.im[i] > 0) W.kick(i, 0, Math.min(v, 150));
        sounds.rattle(0.9);
      }
      if (raiseT >= 1 && raiseKind === 'out') { layer.classList.add('sg-gone'); visible = false; }
    }
    // ambient draughts
    if (breeze > 0 && visible) {
      breezeT -= dt;
      if (breezeT < 0) {
        breezeT = 2.5 + Math.random() * 4;
        const dir = Math.random() < 0.5 ? -1 : 1;
        for (const s of signs) push(s, Math.random(), 0.6, dir * breeze * (14 + Math.random() * 18), 0);
      }
    }
    // squash spring and hover heat
    for (const s of signs) {
      s.sqv += (-s.sq * 260 - s.sqv * 16) * dt;
      s.sq += s.sqv * dt;
      const want = (hoverSign === s.i || focusSign === s.i || (grab && grab.s === s)) && !s.it.disabled ? 1 : 0;
      s.hot += (want - s.hot) * Math.min(1, dt * 14);
    }
    if (sleepT < 4 || grab || raiseT < 1) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 8) { stepPhys(STEP); acc -= STEP; steps++; }
      if (steps === 8) acc = 0;
      // swing sounds, energy check
      let energy = 0;
      for (const s of signs) {
        const [a, b] = s.p;
        const ang = Math.atan2(W.y[b] - W.y[a], W.x[b] - W.x[a]);
        const av = (ang - s.lastAng) / Math.max(dt, 1e-3);
        if (Math.sign(av) !== Math.sign(s.angV) && Math.abs(s.angV) > 1.6 && visible) sounds.creak(Math.min(1, Math.abs(s.angV) / 5), panOf(s));
        s.angV = av;
        s.lastAng = ang;
        s.ang = ang;
        energy += Math.abs(av);
        for (const k of s.p) { const v = W.vel(k); energy += Math.hypot(v[0], v[1]) * 0.01; }
      }
      // chains snapping taut clink
      for (const l of W.links) {
        if (!l.rope) continue;
        const d = Math.hypot(W.x[l.b] - W.x[l.a], W.y[l.b] - W.y[l.a]);
        const taut = d >= l.rest * 0.995;
        if (taut && !l.taut && visible) sounds.clink(0.5);
        l.taut = taut || (l.taut && d > l.rest * 0.9);
      }
      sleepT = energy < 0.05 ? sleepT + dt : 0;
    }
    if (visible) {
      render(tAll);
      placeButtons();
    }
  }
  function placeButtons() {
    for (const s of signs) {
      if (!s.btn) continue;
      const [a, b] = s.p;
      const ang = Math.atan2(W.y[b] - W.y[a], W.x[b] - W.x[a]);
      const co = Math.cos(ang), si = Math.sin(ang);
      // board top-left in world
      const lx = -s.ringX[0], ly = RING_H - 1;
      const X = W.x[a] + co * lx - si * ly, Y = W.y[a] + si * lx + co * ly;
      s.btn.style.width = `${s.w * unit}px`;
      s.btn.style.height = `${s.bh * unit}px`;
      s.btn.style.transform = `translate(${(X * unit).toFixed(1)}px, ${(Y * unit).toFixed(1)}px) rotate(${ang.toFixed(4)}rad)`;
    }
  }

  // ---- resize
  let resizeT = 0;
  const onResize = () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (alive) { build(false); render(tAll); placeButtons(); } }, 60);
  };
  window.addEventListener('resize', onResize);

  const api = {
    el: slot, layer, nav, canvas, buttons, items, signs,
    focus(i = 0) { const b = btnList[i] || btnList[0]; b?.focus({ preventScroll: true }); },
    yank(i, u) { yank(i, u); },
    setLabel(i, label) { const s = signs[i]; if (!s) return; s.it.label = label; buildSprites(s); if (s.btn) { s.btn.setAttribute('aria-label', label); s.btn.firstChild.textContent = label; } },
    setDisabled(i, on) { const s = signs[i]; if (!s) return; s.it.disabled = !!on; if (s.btn) s.btn.disabled = !!on; },
    /** raise(true): yank the whole menu up off the screen; raise(false): drop it back in. */
    raise(on) {
      if (on) {
        setRaise(-(slotPos().y + totalH + 30), 'out', 0.42);
        sounds.rattle(0.8);
        for (const b of btnList) b.tabIndex = -1;
        nav.setAttribute('aria-hidden', 'true');
      } else {
        layer.classList.remove('sg-gone');
        visible = true;
        setRaise(0, 'in', 0.5);
        for (const b of btnList) b.tabIndex = 0;
        nav.removeAttribute('aria-hidden');
      }
      sleepT = 0;
    },
    get raised() { return raiseTo !== 0; },
    /** Internals for tests. */
    get state() { return { raised, raiseT, raiseTo, anchorOff: { ...anchorOff }, slotArt: { ...slotArt }, curSlot: { ...curSlot }, unit, sleepT, p0: signs.map((s) => [W.x[s.p[0]], W.y[s.p[0]]]), anchors: anchors.map((a) => [W.x[a.p], W.y[a.p]]) }; },
    relayout() { build(false); },
    /** Advance the simulation by hand (tests / headless). */
    step(dt = 1 / 60, n = 1) { for (let k = 0; k < n; k++) advance(dt); },
    /** Total motion (tests): ~0 when every sign has settled. */
    energy() { let e = 0; for (const s of signs) for (const k of s.p) { const v = W.vel(k); e += Math.hypot(v[0], v[1]); } return e; },
    destroy() {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(resizeT);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', onResize);
      layer.remove();
      slot.remove();
      unstyle();
    },
  };

  build(opts.drop !== false);
  advance(0);
  raf = requestAnimationFrame(tick);
  if (opts.autofocus ?? !isTouch()) setTimeout(() => { if (alive) api.focus(0); }, 30);
  return api;
}

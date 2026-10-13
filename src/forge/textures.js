// Flat pixel-art surfaces for the forge room at 32 texels per world unit (matching the 1/32
// voxel props): rough stone masonry with a sooty brick chimney breast, red planks over a stone
// wainscot with a chalkboard, plank floor with a flagstone apron, a postcard, water and a rug.
import * as THREE from 'three';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';
import { makeRng, mixHex, shade } from '../core/util.js';

export const TPU = 32; // texels per world unit

function tex(pc) {
  const t = pixelTexture(pc.commit());
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

const PLANK_REDS = [0x7a2a24, 0x6e2620, 0x84302a, 0x742822, 0x68241e];
const MOSS = [0x4a7a2a, 0x5a8a32, 0x3a6024, 0x6a9a3a];
const STONE = [0x8a7a68, 0x7a6c5c, 0x94846e, 0x6e6254, 0x847460, 0x7e7262, 0x8e8070, 0x766656];

/**
 * Irregular coursed rubble masonry in the rect [x0,y0,x1,y1): stones of mixed sizes (some spanning
 * two courses), rounded corners, a lit top-left bevel, a shadowed bottom-right, speckled faces and
 * recessed mortar with a highlight where light catches the joint's lower lip.
 */
function masonry(pc, rng, x0, y0, x1, y1, { mortar = 0x2a221e, pal = STONE, moss = 0 } = {}) {
  const W = x1 - x0, H = y1 - y0;
  const owner = new Int32Array(W * H).fill(-1);
  const stones = [];
  // lay courses; now and then a tall stone claims the course below too
  let y = 0;
  const courseH = [];
  while (y < H) { const h = Math.min(H - y, rng.int(7, 12)); courseH.push([y, h]); y += h; }
  courseH.forEach(([cy, ch], ci) => {
    let x = -rng.int(0, 10);
    while (x < W) {
      const w = rng.chance(0.15) ? rng.int(5, 8) : rng.int(10, 22);
      const tall = ci + 1 < courseH.length && rng.chance(0.12) && w > 12;
      const h = tall ? ch + courseH[ci + 1][1] : ch;
      const id = stones.length;
      stones.push({ x, y: cy, w, h, base: rng.pick(pal), tone: rng.range(0.9, 1.1), seed: rng.int(1, 1e6) });
      for (let yy = cy; yy < Math.min(H, cy + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) if (owner[xx + yy * W] < 0 || tall) owner[xx + yy * W] = id;
      x += w;
    }
  });
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const id = owner[xx + yy * W];
    const st = stones[id];
    const ex = xx - st.x, ey = yy - st.y;
    const r = 2.2; // corner rounding
    const dxe = Math.min(ex, st.w - 2 - ex), dye = Math.min(ey, st.h - 2 - ey);
    let c;
    if (ex >= st.w - 1 || ey >= st.h - 1 || dxe < 0 || dye < 0) c = mortar;
    else if (dxe < r && dye < r && Math.hypot(r - dxe, r - dye) > r) c = mortar;
    else {
      c = shade(st.base, st.tone);
      // face texture: speckle and soft mottling
      const h = ((xx * 73856093) ^ (yy * 19349663) ^ st.seed) >>> 0;
      const m = (h % 1000) / 1000;
      if (m < 0.08) c = shade(c, 0.88); else if (m > 0.95) c = shade(c, 1.1);
      if (((xx >> 2) + (yy >> 2) + st.seed) % 7 === 0 && m < 0.5) c = shade(c, 0.95);
      // bevel: lit top-left, shadowed bottom-right
      if (ey === 0 || ex === 0) c = shade(c, 1.16);
      else if (ey === 1 && ex > 1) c = shade(c, 1.06);
      if (ey === st.h - 2 || ex === st.w - 2) c = shade(c, 0.74);
      else if (ey === st.h - 3) c = shade(c, 0.9);
    }
    // the mortar's lower lip catches a little light
    if (c === mortar && yy > 0 && owner[xx + (yy - 1) * W] === id && ey === st.h - 1) c = shade(mortar, 1.25);
    pc.set(x0 + xx, y0 + yy, c);
  }
  if (moss) for (const st of stones) {
    if (!rng.chance(moss)) continue;
    for (let k = 1; k < st.w - 2; k++) if (rng.chance(0.55)) { pc.set(x0 + st.x + k, y0 + st.y, rng.pick(MOSS)); if (rng.chance(0.3)) pc.set(x0 + st.x + k, y0 + st.y + 1, rng.pick(MOSS)); }
  }
}

/** Vertical red planks between rows y0..y1 (texels). */
function plankWall(pc, rng, y0, y1, plankW = 12) {
  for (let x = 0; x < pc.w; x += plankW) {
    const base = rng.pick(PLANK_REDS);
    const joint = rng.int(y0 + 10, y1 - 10);
    for (let px = x; px < Math.min(pc.w, x + plankW); px++) {
      for (let y = y0; y < y1; y++) {
        let c = base;
        const gx = px - x;
        if (gx === 0) c = 0x3a1410; // seam
        else if (gx === 1) c = shade(base, 1.16); // lit edge
        else if (gx === plankW - 1) c = shade(base, 0.8);
        else {
          // grain: long wavy lines
          const w = Math.sin((y * 0.11) + gx * 1.7 + x) + Math.sin(y * 0.031 + gx);
          if (w > 1.55) c = shade(base, 0.86); else if (w < -1.7) c = shade(base, 1.07);
        }
        if (y === joint) c = 0x3a1410;
        else if (y === joint + 1 && gx > 0) c = shade(base, 1.1);
        pc.set(px, y, c);
      }
    }
    // knots and nails
    if (rng.chance(0.55)) {
      const kx = x + 3 + rng.int(0, plankW - 7), ky = rng.int(y0 + 6, y1 - 8);
      pc.ellipse(kx + 1, ky + 1, 2.2, 1.6, shade(base, 0.62));
      pc.set(kx + 1, ky + 1, shade(base, 0.45));
    }
    for (const ny of [y0 + 5, joint - 4, joint + 5, y1 - 6]) { pc.set(x + 3, ny, 0x2a1a18); pc.set(x + plankW - 4, ny, 0x2a1a18); pc.set(x + 3, ny - 1, 0x6a5a58); }
  }
}

function mossEdge(pc, rng, y0, dir, amount = 1) {
  for (let x = 0; x < pc.w; x++) {
    if (!rng.chance(0.5 * amount)) continue;
    const len = rng.int(1, 4 + Math.round(3 * amount));
    for (let k = 0; k < len; k++) pc.set(x, y0 + dir * k, rng.pick(MOSS));
    if (rng.chance(0.08)) pc.set(x, y0 + dir * len, 0xd8e0a0); // a tiny flower
  }
}

function grime(pc, rng, n, color, alpha = 60, rmax = 7) {
  for (let i = 0; i < n; i++) {
    const cx = rng.int(0, pc.w), cy = rng.int(0, pc.h), r = rng.range(2, rmax);
    pc.ellipse(cx, cy, r * 1.3, r, color, alpha);
  }
}

/**
 * Back wall texture. widthU/heightU in world units; brick = [x0,x1] in world units from the
 * wall's left edge for the chimney breast.
 */
export function backWallTexture(widthU, heightU, brick, seed = 3) {
  const rng = makeRng(seed);
  const pc = new PixelCanvas(Math.round(widthU * TPU), Math.round(heightU * TPU));
  masonry(pc, rng, 0, 0, pc.w, pc.h, { moss: 0.04 });
  // chimney breast: firebricks, blackened toward the middle and up the flue, scorched low down
  const bx0 = Math.round(brick[0] * TPU), bx1 = Math.round(brick[1] * TPU);
  const BR = [0x8a3a2c, 0x7a3226, 0x9a4232, 0x6e2c22, 0x84382a, 0x92402e];
  const cx = (bx0 + bx1) / 2;
  for (let y = 0; y < pc.h; y++) {
    const row = Math.floor(y / 5);
    const off = (row % 2) * 6;
    for (let x = bx0; x < bx1; x++) {
      const u = x - bx0 + off;
      let c;
      if (y % 5 === 4 || u % 12 === 11) c = 0x2a1c18;
      else {
        const cell = Math.floor(u / 12) * 31 + row * 7;
        c = BR[((cell * 2654435761) >>> 0) % BR.length];
        if (y % 5 === 0) c = shade(c, 1.1);
        else if (y % 5 === 3) c = shade(c, 0.88);
        if (u % 12 === 0) c = shade(c, 1.06);
      }
      const soot = Math.max(0, 1 - Math.abs(x - cx) / ((bx1 - bx0) * 0.55)) * Math.min(1, (pc.h - y) / (pc.h * 0.6));
      c = mixHex(c, 0x161010, Math.min(0.85, soot * 0.75));
      pc.set(x, y, c);
    }
  }
  for (let y = 0; y < pc.h; y++) { pc.set(bx0, y, 0x1e120e); pc.set(bx0 + 1, y, 0x3a2620); pc.set(bx1 - 1, y, 0x1e120e); pc.set(bx1 - 2, y, 0x3a2620); }
  // soot streaks licking up the stone either side of the breast
  for (let i = 0; i < 26; i++) {
    const x = rng.chance(0.5) ? bx0 - rng.int(1, 18) : bx1 + rng.int(0, 18);
    const len = rng.int(10, 60);
    const y0 = pc.h - rng.int(30, 90);
    for (let k = 0; k < len; k++) pc.set(x, y0 - k, 0x1e1614, Math.round(110 * (1 - k / len)));
  }
  mossEdge(pc, rng, 0, 1, 1.2);
  mossEdge(pc, rng, pc.h - 1, -1, 0.5);
  grime(pc, rng, 30, 0x1a0e0a, 40);
  return tex(pc);
}

/** Left/right wall: red planks over a stone wainscot, optionally with a chalkboard. */
export function sideWallTexture(widthU, heightU, board, seed = 7) {
  const rng = makeRng(seed);
  const pc = new PixelCanvas(Math.round(widthU * TPU), Math.round(heightU * TPU));
  const wain = Math.round(0.55 * TPU);
  const top = pc.h - wain;
  plankWall(pc, rng, 0, top);
  masonry(pc, rng, 0, top + 3, pc.w, pc.h, { moss: 0.06 });
  // chair rail
  for (let x = 0; x < pc.w; x++) { pc.set(x, top, 0xa06a3c); pc.set(x, top + 1, 0x7a4a26); pc.set(x, top + 2, 0x2a1a10); }
  mossEdge(pc, rng, 0, 1, 1);
  grime(pc, rng, 16, 0x1a0e0a, 40);
  if (board) drawChalkboard(pc, rng, Math.round(board[0] * TPU), Math.round(board[1] * TPU), Math.round(board[2] * TPU), Math.round(board[3] * TPU));
  return tex(pc);
}

function drawChalkboard(pc, rng, x0, y0, w, h) {
  // frame
  pc.rect(x0 - 4, y0 - 4, w + 8, h + 8, 0x6a4424);
  pc.rect(x0 - 4, y0 - 4, w + 8, 1, 0x9a6a3a);
  pc.rect(x0 - 4, y0 - 4, 1, h + 8, 0x8a5a34);
  pc.rect(x0 - 4, y0 + h + 3, w + 8, 1, 0x3a2412);
  pc.rect(x0 + w + 3, y0 - 4, 1, h + 8, 0x3a2412);
  for (const [x, y] of [[x0 - 2, y0 - 2], [x0 + w + 1, y0 - 2], [x0 - 2, y0 + h + 1], [x0 + w + 1, y0 + h + 1]]) pc.set(x, y, 0xc8a050);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) pc.set(x, y, rng.chance(0.07) ? 0x26342c : rng.chance(0.03) ? 0x2c3c34 : 0x1e2a24);
  // old smudged erasures
  for (let i = 0; i < 5; i++) pc.ellipse(x0 + rng.int(6, w - 6), y0 + rng.int(4, h - 4), rng.range(4, 9), rng.range(2, 4), 0x2e3c34, 90);
  const chalk = 0xd8e0d4, faint = 0x6a7a70, red = 0xe08a7a;
  // a sword sketch with dimension marks
  const sx = x0 + 6, sy = y0 + Math.round(h * 0.55);
  pc.line(sx, sy, sx + 8, sy, chalk); pc.line(sx, sy - 1, sx + 8, sy - 1, chalk); // grip
  pc.line(sx + 9, sy - 6, sx + 9, sy + 5, chalk); pc.line(sx + 10, sy - 6, sx + 10, sy + 5, chalk); // guard
  pc.line(sx + 11, sy - 3, sx + w - 22, sy - 3, chalk);
  pc.line(sx + 11, sy + 2, sx + w - 22, sy + 2, chalk);
  pc.line(sx + w - 22, sy - 3, sx + w - 14, sy, chalk);
  pc.line(sx + w - 22, sy + 2, sx + w - 14, sy, chalk);
  pc.line(sx + 13, sy, sx + w - 26, sy, faint); // fuller
  pc.disk(sx - 2, sy - 0.5, 2, chalk); // pommel
  for (let x = sx + 11; x < sx + w - 16; x += 4) pc.set(x, sy + 8, faint);
  pc.line(sx + 11, sy + 6, sx + 11, sy + 10, faint); pc.line(sx + w - 15, sy + 6, sx + w - 15, sy + 10, faint);
  // balance point arrow
  pc.line(sx + 18, sy + 14, sx + 18, sy + 10, red); pc.set(sx + 17, sy + 11, red); pc.set(sx + 19, sy + 11, red);
  // thermometer doodle with a heat band
  const tx = x0 + w - 10;
  pc.rect(tx, y0 + 4, 2, Math.round(h * 0.42), chalk);
  pc.disk(tx + 1, y0 + 6 + Math.round(h * 0.42), 3, chalk);
  pc.rect(tx + 3, y0 + 10, 3, 5, 0xe0b060);
  for (let i = 0; i < 6; i++) pc.set(tx + 4, y0 + 6 + i * 4, faint);
  // tally marks: blades forged
  for (let i = 0; i < 9; i++) pc.line(x0 + 6 + i * 3 + (i > 4 ? 3 : 0), y0 + 4, x0 + 6 + i * 3 + (i > 4 ? 3 : 0), y0 + 10, chalk);
  pc.line(x0 + 4, y0 + 10, x0 + 21, y0 + 4, chalk);
  // a tiny sun and palm: the dream
  const px = x0 + Math.round(w * 0.5), py = y0 + h - 7;
  pc.disk(px + 13, y0 + 8, 3, 0xf0d870);
  for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; pc.set(Math.round(px + 13 + Math.cos(t) * 5.5), Math.round(y0 + 8 + Math.sin(t) * 5.5), 0xf0d870); }
  pc.line(px, py, px + 2, py - 11, chalk); pc.line(px + 1, py, px + 3, py - 11, chalk);
  pc.line(px - 5, py - 13, px + 2, py - 11, 0x9ad890); pc.line(px + 2, py - 11, px + 9, py - 13, 0x9ad890); pc.line(px + 2, py - 11, px - 2, py - 7, 0x9ad890); pc.line(px + 2, py - 11, px + 7, py - 7, 0x9ad890);
  for (let x = px - 9; x < px + 14; x++) pc.set(x, py + 2 + Math.round(Math.sin(x * 0.7)), 0x9fd6ff);
  // chalk dust on the ledge
  pc.rect(x0 - 2, y0 + h + 1, w + 4, 2, 0x5a3a20);
  pc.rect(x0, y0 + h, w, 1, 0x9a9a90);
  pc.rect(x0 + 8, y0 + h - 1, 4, 1, 0xf0f0e8); pc.rect(x0 + 30, y0 + h - 1, 3, 1, 0xf0b0b8);
}

/** Plank floor with a flagstone apron in front of the hearth. apron: [x0,z0,x1,z1] in world units from the floor's corner. */
export function floorTexture(widthU, depthU, apron, seed = 11) {
  const rng = makeRng(seed);
  const W = Math.round(widthU * TPU), H = Math.round(depthU * TPU);
  const pc = new PixelCanvas(W, H);
  const TONES = [0x5a3a24, 0x553620, 0x60402a, 0x4e321e, 0x5c3c22, 0x583822];
  const PW = 10, PL = 58;
  for (let y = 0; y < H; y++) {
    const row = Math.floor(y / PW);
    const off = (row * 37) % PL;
    for (let x = 0; x < W; x++) {
      const seg = Math.floor((x + off) / PL);
      const base = TONES[(row * 3 + seg * 7) % TONES.length];
      let c = base;
      const gy = y % PW;
      if (gy === 0) c = 0x22140c;
      else if (gy === 1) c = shade(base, 1.12);
      else if (gy === PW - 1) c = shade(base, 0.86);
      else {
        const w = Math.sin(x * 0.09 + gy * 1.3 + row * 2.1) + Math.sin(x * 0.023 + row);
        if (w > 1.6) c = shade(base, 0.85);
      }
      if ((x + off) % PL === 0) c = 0x22140c;
      pc.set(x, y, c);
    }
    // nails at the plank ends
    for (let x = 0; x < W; x += PL) { const nx = x + ((row * 37) % PL) + 3; if (y % PW === 3 || y % PW === 7) pc.set(nx, y, 0x2a2420); }
  }
  // flagstones (fire-safe ground in front of the hearth)
  if (apron) {
    const ax0 = Math.round(apron[0] * TPU), az0 = Math.round(apron[1] * TPU), ax1 = Math.round(apron[2] * TPU), az1 = Math.round(apron[3] * TPU);
    masonry(pc, rng, ax0, az0, ax1, az1, { mortar: 0x2a2422, pal: [0x6e665e, 0x625a54, 0x7a7068, 0x5a524c, 0x686058] });
    // scorch marks & ash near the hearth
    grime(pc, rng, 14, 0x1a1412, 70, 9);
    for (let i = 0; i < 60; i++) pc.set(ax0 + rng.int(0, ax1 - ax0), az0 + rng.int(0, Math.round((az1 - az0) * 0.5)), rng.chance(0.5) ? 0x8a8480 : 0x3a3230);
  }
  grime(pc, rng, 30, 0x1e120c, 45);
  // metal filings near the anvil, moss in the cracks, a few coal crumbs
  for (let i = 0; i < 90; i++) pc.set(rng.int(0, W - 1), rng.int(0, H - 1), rng.pick([0x8a8a90, 0x4a7a2a, 0x3a3436, 0x1e1a1c]));
  return tex(pc);
}

/** A little beach postcard (the dream): sky, sun, sea, sand, a palm and a red towel. */
export function postcardTexture() {
  const pc = new PixelCanvas(28, 20);
  pc.rect(0, 0, 28, 20, 0xf0e6d0);
  pc.rect(0, 0, 28, 1, 0xfff8e8);
  pc.rect(2, 2, 24, 10, 0x6ac8f0);
  pc.rect(2, 2, 24, 2, 0x8ad8ff);
  pc.disk(20, 5.5, 2.6, 0xffe066);
  pc.disk(20, 5.5, 1.4, 0xfff4b0);
  pc.ellipse(8, 4, 4, 1.2, 0xffffff); pc.ellipse(10, 3.5, 2.5, 1, 0xffffff);
  pc.rect(2, 10, 24, 3, 0x2a8ad0);
  pc.rect(2, 10, 24, 1, 0x5ab0e8);
  for (let x = 3; x < 26; x += 4) pc.set(x, 11, 0x9ad8ff);
  pc.rect(2, 13, 24, 4, 0xf0d890);
  pc.rect(2, 13, 24, 1, 0xfff0f0);
  pc.line(8, 15, 10, 6, 0x8a5a2a); pc.line(9, 15, 11, 6, 0x6a4a1a);
  pc.line(5, 5, 10, 6, 0x3aa84a); pc.line(10, 6, 14, 7, 0x3aa84a); pc.line(10, 6, 7, 9, 0x3aa84a); pc.line(10, 6, 13, 9, 0x2a8a3a);
  pc.rect(17, 15, 5, 2, 0xe0402a); pc.rect(17, 15, 5, 1, 0xff7a5a); // a red towel
  pc.set(23, 16, 0xff8ad0); // a shell
  pc.rect(2, 17, 24, 2, 0xe8dcc0);
  for (let x = 3; x < 25; x += 2) pc.set(x, 18, 0xb8a888); // "wish you were here" scribble
  return tex(pc);
}

/** Water ripple texture; call draw(t, energy) to animate. Fire glints dance on it. */
export class WaterTexture {
  constructor(size = 40) {
    this.pc = new PixelCanvas(size, size);
    this.texture = pixelTexture(this.pc.canvas);
    this.size = size;
    this.rings = [];
    this.draw(0, 0);
  }
  splash(strength = 1) {
    this.rings.push({ t: 0, s: strength });
  }
  draw(time, energy = 0) {
    const pc = this.pc, n = this.size, c = (n - 1) / 2;
    const k = 20 / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = x - c, dy = y - c;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > c + 0.5) { pc.set(x, y, 0x10262c); continue; }
      const rk = r * k;
      let v = Math.sin(rk * 1.3 - time * 2.2) * 0.5 + Math.sin(x * k * 0.7 + time * 1.3) * 0.25 + Math.sin(y * k * 0.9 - time) * 0.25;
      for (const ring of this.rings) { const d = Math.abs(rk - ring.t * 9); if (d < 1.2) v += (1.2 - d) * ring.s * 1.5; }
      v += energy * Math.sin(rk * 2.5 - time * 9) * 0.6;
      let col = v > 0.72 ? 0x9ad8e0 : v > 0.3 ? 0x3a7a88 : v > -0.4 ? 0x2a5a68 : 0x1e4652;
      // the hearth's glow reflected on the upper-left of the surface
      const glint = Math.sin(x * 1.7 + time * 3) * Math.sin(y * 1.3 - time * 2.4);
      if (dx < -2 && dy < 2 && glint > 0.82 && v > 0) col = mixHex(col, 0xffa050, 0.75);
      if (r > c - 1.2) col = shade(col, 0.72); // darker rim against the staves
      pc.set(x, y, col);
    }
    for (const ring of this.rings) ring.t += 0.08;
    this.rings = this.rings.filter((rr) => rr.t < 1.3);
    pc.commit();
    this.texture.needsUpdate = true;
  }
}

/** A worn woven rug: warm stripes, a diamond border and frayed ends. */
export function rugTexture(wU = 1.8, dU = 1.1, seed = 21) {
  const rng = makeRng(seed);
  const W = Math.round(wU * TPU), H = Math.round(dU * TPU);
  const pc = new PixelCanvas(W, H);
  const C = [0x8a2a24, 0xb8642a, 0x6a3a5a, 0xd8a85a, 0x4a2a20, 0x3a5a6a];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ex = Math.min(x, W - 1 - x), ey = Math.min(y, H - 1 - y);
    let c;
    if (ex < 2) c = rng.chance(0.55) && (y % 2 === 0) ? 0xd8c8a0 : -1; // fringe
    else if (ex < 5 || ey < 3) c = C[4];
    else if (ex < 7 || ey < 5) c = C[3];
    else if (ex < 8 || ey < 6) c = C[4];
    else {
      const band = Math.floor((x - 8) / 8) % 4;
      c = [C[0], C[1], C[0], C[2]][band];
      const dx = Math.abs(((x - 8) % 16) - 7.5), dy = Math.abs((y % 16) - 7.5);
      if (dx + dy < 4) c = C[3];
      if (dx + dy < 2) c = C[5];
      if ((x + y) % 2 === 0 && dx + dy > 6.5 && dx + dy < 7.5) c = C[4];
    }
    if (c < 0) continue;
    if (rng.chance(0.06)) c = shade(c, 0.82);
    pc.set(x, y, c);
  }
  grime(pc, rng, 8, 0x1e120c, 50);
  return tex(pc);
}

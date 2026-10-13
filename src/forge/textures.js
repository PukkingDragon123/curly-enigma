// Flat pixel-art surfaces for the forge room (16 texels per world unit, like the voxels):
// red plank walls with a brick chimney breast, plank floor with a stone hearth apron,
// a chalkboard and a little beach postcard.
import * as THREE from 'three';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';
import { makeRng, mixHex, shade } from '../core/util.js';

export const TPU = 16; // texels per world unit

function tex(pc) {
  const t = pixelTexture(pc.commit());
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

const PLANK_REDS = [0x7a2a24, 0x6e2620, 0x84302a, 0x742822, 0x68241e];
const MOSS = [0x4a7a2a, 0x5a8a32, 0x3a6024, 0x6a9a3a];

/** Vertical red planks over a dark wainscot. x0/x1 in texels to skip (e.g. under bricks). */
function plankWall(pc, rng, { wainscot = 15, plankW = 6 } = {}) {
  const H = pc.h;
  for (let x = 0; x < pc.w; x += plankW) {
    const base = rng.pick(PLANK_REDS);
    for (let px = x; px < Math.min(pc.w, x + plankW); px++) {
      for (let y = 0; y < H - wainscot; y++) {
        let c = base;
        if (px === x) c = 0x3a1410; // seam
        else if (px === x + 1) c = shade(base, 1.18); // lit edge
        else if (px === x + plankW - 1) c = shade(base, 0.82);
        pc.set(px, y, c);
      }
    }
    // grain streaks and knots
    for (let k = 0; k < 7; k++) {
      const gx = x + 2 + rng.int(0, plankW - 3);
      const gy = rng.int(0, H - wainscot - 6);
      const len = rng.int(3, 9);
      for (let y = gy; y < Math.min(H - wainscot, gy + len); y++) pc.set(gx, y, shade(base, 0.86));
    }
    if (rng.chance(0.5)) {
      const kx = x + 2 + rng.int(0, plankW - 4), ky = rng.int(4, H - wainscot - 6);
      pc.set(kx, ky, 0x4a1a14); pc.set(kx + 1, ky, 0x5a201a); pc.set(kx, ky + 1, 0x5a201a);
    }
    // nails at the rails
    pc.set(x + 2, 3, 0x2a1a18); pc.set(x + 2, H - wainscot - 3, 0x2a1a18);
  }
  // wainscot: dark horizontal boards
  const top = H - wainscot;
  for (let y = top; y < H; y++) {
    const row = Math.floor((y - top) / 4);
    for (let x = 0; x < pc.w; x++) {
      const tone = [0x4a2e1e, 0x442a1a, 0x503220][(row + Math.floor(x / 23)) % 3];
      let c = tone;
      if ((y - top) % 4 === 0) c = 0x24140c;
      if ((x + row * 9) % 23 === 0) c = 0x24140c;
      pc.set(x, y, c);
    }
  }
  // chair rail
  for (let x = 0; x < pc.w; x++) { pc.set(x, top - 2, 0x8a5a34); pc.set(x, top - 1, 0x5a3a20); pc.set(x, top, 0x2a1a10); }
}

function mossEdge(pc, rng, y0, dir, amount = 1) {
  for (let x = 0; x < pc.w; x++) {
    if (!rng.chance(0.55 * amount)) continue;
    const len = rng.int(1, 3 + Math.round(2 * amount));
    for (let k = 0; k < len; k++) pc.set(x, y0 + dir * k, rng.pick(MOSS));
  }
}

function grime(pc, rng, n, color, alpha = 60) {
  for (let i = 0; i < n; i++) {
    const cx = rng.int(0, pc.w), cy = rng.int(0, pc.h), r = rng.range(1.5, 4);
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
  plankWall(pc, rng);
  // chimney breast bricks
  const bx0 = Math.round(brick[0] * TPU), bx1 = Math.round(brick[1] * TPU);
  const BR = [0x8a3a2c, 0x7a3226, 0x9a4232, 0x6e2c22, 0x84382a];
  for (let y = 0; y < pc.h; y++) {
    const row = Math.floor(y / 4);
    const off = (row % 2) * 4;
    for (let x = bx0; x < bx1; x++) {
      const u = x - bx0 + off;
      let c;
      if (y % 4 === 3 || u % 8 === 0) c = 0x2a1c18;
      else {
        const cell = Math.floor(u / 8) * 31 + row * 7;
        c = BR[(cell * 2654435761 >>> 0) % BR.length];
        if (y % 4 === 0) c = shade(c, 1.12);
      }
      // soot: darker toward the middle and above the fire
      const cx = (bx0 + bx1) / 2;
      const soot = Math.max(0, 1 - Math.abs(x - cx) / ((bx1 - bx0) * 0.5)) * Math.min(1, (pc.h - y) / (pc.h * 0.55));
      c = mixHex(c, 0x1a1210, soot * 0.55);
      pc.set(x, y, c);
    }
  }
  // breast edges
  for (let y = 0; y < pc.h; y++) { pc.set(bx0, y, 0x24140e); pc.set(bx1 - 1, y, 0x24140e); }
  mossEdge(pc, rng, 0, 1, 1.2);
  mossEdge(pc, rng, pc.h - 16, -1, 0.5);
  grime(pc, rng, 18, 0x1a0e0a, 40);
  return tex(pc);
}

/** Left wall with a chalkboard full of smithing doodles. */
export function sideWallTexture(widthU, heightU, board, seed = 7) {
  const rng = makeRng(seed);
  const pc = new PixelCanvas(Math.round(widthU * TPU), Math.round(heightU * TPU));
  plankWall(pc, rng);
  mossEdge(pc, rng, 0, 1, 1);
  grime(pc, rng, 10, 0x1a0e0a, 40);
  if (board) drawChalkboard(pc, rng, Math.round(board[0] * TPU), Math.round(board[1] * TPU), Math.round(board[2] * TPU), Math.round(board[3] * TPU));
  return tex(pc);
}

function drawChalkboard(pc, rng, x0, y0, w, h) {
  pc.rect(x0 - 2, y0 - 2, w + 4, h + 4, 0x6a4424);
  pc.rect(x0 - 2, y0 - 2, w + 4, 1, 0x8a5a34);
  pc.rect(x0 - 2, y0 + h + 1, w + 4, 1, 0x3a2412);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) pc.set(x, y, rng.chance(0.08) ? 0x26342c : 0x1e2a24);
  const chalk = 0xd8e0d4, faint = 0x6a7a70;
  // a sword sketch with dimension marks
  const sx = x0 + 3, sy = y0 + Math.round(h * 0.55);
  pc.line(sx, sy, sx + 4, sy, chalk); // grip
  pc.line(sx + 5, sy - 3, sx + 5, sy + 3, chalk); // guard
  pc.line(sx + 6, sy - 1, sx + w - 10, sy - 1, chalk);
  pc.line(sx + 6, sy + 1, sx + w - 10, sy + 1, chalk);
  pc.line(sx + w - 10, sy - 1, sx + w - 7, sy, chalk);
  pc.line(sx + w - 10, sy + 1, sx + w - 7, sy, chalk);
  pc.set(sx - 1, sy, chalk);
  for (let x = sx + 6; x < sx + w - 8; x += 3) pc.set(x, sy + 4, faint);
  // thermometer doodle + tally marks
  const tx = x0 + w - 5;
  pc.rect(tx, y0 + 2, 1, Math.round(h * 0.4), chalk);
  pc.disk(tx + 0.5, y0 + 3 + Math.round(h * 0.4), 1.4, chalk);
  for (let i = 0; i < 4; i++) pc.set(tx + 2, y0 + 3 + i * 2, faint);
  for (let i = 0; i < 6; i++) pc.line(x0 + 3 + i * 2, y0 + 2, x0 + 3 + i * 2, y0 + 5, chalk);
  pc.line(x0 + 2, y0 + 5, x0 + 13, y0 + 2, chalk);
  // a tiny sun and palm, the dream
  const px = x0 + Math.round(w * 0.5), py = y0 + h - 4;
  pc.disk(px + 6, y0 + 4, 1.5, chalk);
  pc.line(px, py, px + 1, py - 5, chalk);
  pc.line(px - 2, py - 6, px + 1, py - 5, chalk);
  pc.line(px + 1, py - 5, px + 4, py - 6, chalk);
  pc.line(px - 4, py + 1, px + 6, py + 1, faint);
  // chalk dust on the ledge
  pc.rect(x0, y0 + h, w, 1, 0x9a9a90);
  pc.set(x0 + 4, y0 + h, 0xf0f0e8); pc.set(x0 + 5, y0 + h, 0xf0f0e8);
}

/** Plank floor with a flagstone apron in front of the hearth. apron: [x0,z0,x1,z1] in world units from the floor's corner. */
export function floorTexture(widthU, depthU, apron, seed = 11) {
  const rng = makeRng(seed);
  const W = Math.round(widthU * TPU), H = Math.round(depthU * TPU);
  const pc = new PixelCanvas(W, H);
  const TONES = [0x5a3a24, 0x553620, 0x60402a, 0x4e321e, 0x5c3c22];
  for (let y = 0; y < H; y++) {
    const row = Math.floor(y / 5);
    const off = (row * 37) % 29;
    for (let x = 0; x < W; x++) {
      const seg = Math.floor((x + off) / 29);
      let c = TONES[(row * 3 + seg * 7) % TONES.length];
      if (y % 5 === 0) c = 0x22140c;
      else if (y % 5 === 1) c = shade(c, 1.12);
      if ((x + off) % 29 === 0) c = 0x22140c;
      pc.set(x, y, c);
    }
  }
  // grain
  for (let i = 0; i < W * H / 40; i++) {
    const x = rng.int(0, W - 1), y = rng.int(0, H - 1);
    if (y % 5 > 1) pc.set(x, y, shade(pc.getHex(x, y), 0.85));
  }
  // nails
  for (let y = 2; y < H; y += 5) for (let x = 3; x < W; x += 29) { pc.set(x + ((y * 37) % 29), y, 0x2a2420); }
  // flagstones
  if (apron) {
    const ax0 = Math.round(apron[0] * TPU), az0 = Math.round(apron[1] * TPU), ax1 = Math.round(apron[2] * TPU), az1 = Math.round(apron[3] * TPU);
    const ST = [0x6e665e, 0x625a54, 0x7a7068, 0x5a524c];
    for (let y = az0; y < az1; y++) for (let x = ax0; x < ax1; x++) {
      const r = Math.floor((y - az0) / 7), off = (r % 2) * 5;
      const u = x - ax0 + off;
      let c = (y - az0) % 7 === 0 || u % 10 === 0 ? 0x2a2422 : ST[(Math.floor(u / 10) * 13 + r * 5) % ST.length];
      if ((y - az0) % 7 === 1 && u % 10 !== 0) c = shade(c, 1.1);
      pc.set(x, y, c);
    }
    // soot and ash near the hearth
    grime(pc, rng, 8, 0x1a1412, 70);
  }
  grime(pc, rng, 20, 0x1e120c, 45);
  // metal filings near the anvil and scattered moss in cracks
  for (let i = 0; i < 40; i++) pc.set(rng.int(0, W - 1), rng.int(0, H - 1), rng.pick([0x8a8a90, 0x4a7a2a, 0x3a3436]));
  return tex(pc);
}

/** A little beach postcard (the dream): sky, sun, sea, sand and a palm. */
export function postcardTexture() {
  const pc = new PixelCanvas(14, 10);
  pc.rect(0, 0, 14, 10, 0xf0e6d0);
  pc.rect(1, 1, 12, 5, 0x6ac8f0);
  pc.rect(1, 1, 12, 1, 0x8ad8ff);
  pc.disk(10, 2.5, 1.5, 0xffe066);
  pc.rect(1, 5, 12, 2, 0x2a8ad0);
  pc.rect(1, 5, 12, 1, 0x5ab0e8);
  pc.rect(1, 7, 12, 2, 0xf0d890);
  pc.line(4, 7, 5, 3, 0x8a5a2a);
  pc.line(2, 3, 5, 3, 0x3aa84a); pc.line(5, 3, 7, 4, 0x3aa84a); pc.set(3, 4, 0x3aa84a); pc.set(6, 2, 0x3aa84a);
  pc.set(9, 8, 0xe0402a); pc.set(10, 8, 0xe0402a); // a red towel
  return tex(pc);
}

/** Water ripple texture; call draw(t, energy) to animate. */
export class WaterTexture {
  constructor(size = 20) {
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
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = x - c, dy = y - c;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > c + 0.5) { pc.set(x, y, 0x10262c); continue; }
      let v = Math.sin(r * 1.3 - time * 2.2) * 0.5 + Math.sin(x * 0.7 + time * 1.3) * 0.25 + Math.sin(y * 0.9 - time) * 0.25;
      for (const ring of this.rings) { const d = Math.abs(r - ring.t * 9); if (d < 1.2) v += (1.2 - d) * ring.s * 1.5; }
      v += energy * Math.sin(r * 2.5 - time * 9) * 0.6;
      const col = v > 0.7 ? 0x9ad8e0 : v > 0.25 ? 0x3a7a88 : v > -0.4 ? 0x2a5a68 : 0x1e4652;
      pc.set(x, y, col);
    }
    for (const ring of this.rings) ring.t += 0.08;
    this.rings = this.rings.filter((rr) => rr.t < 1.3);
    pc.commit();
    this.texture.needsUpdate = true;
  }
}

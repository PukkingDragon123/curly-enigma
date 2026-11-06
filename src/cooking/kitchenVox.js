// Voxel builds for the kitchen's walls and wall pieces (no flat quads, discs or cylinders):
// Old Star's cave rock as a 1/16 relief with recessed cracks and a hole for the round window,
// the hand-made tile band as 1/32 tiles standing proud of their grout, the view through the
// window as a little voxel diorama, the sun painting and the chalkboard as framed voxel plates,
// the stovepipe and the brass burner knobs. Sizes follow the voxel rule (gfx/voxRes.js):
// walls 1/16, furniture 1/32, small things finer.
import * as THREE from 'three';
import { VoxelGrid, voxelMaterial } from '../gfx/Voxel.js';
import { meshRelief, voxMesh, hash3, fshade, fmix } from '../bookends/vox.js';
import { readPixels, voxelPlate } from '../gfx/voxPlate.js';
import { caveWallTex, tilesTex, caveViewTex, sunPaintingTex, chalkboardTex, flourTex } from './tex.js';

const disposeTex = (t) => { t.dispose(); return t; };

/**
 * The back wall: rock plates (the colours of caveWallTex) whose cracks sink two voxels into the
 * wall and whose lips bevel down to them, so the light rakes over real relief. Plate faces sit at
 * z = wallZ (props on the wall stay in front); `holes` = [{x, y, r}] are cut right through.
 */
export function rockWall({ x0, x1, y0, y1, wallZ, holes = [] }) {
  const VS = 1 / 16;
  const W = Math.round((x1 - x0) / VS), D = Math.round((y1 - y0) / VS);
  const tex = caveWallTex();
  const pix = readPixels(tex);
  disposeTex(tex);
  const crack = new Uint8Array(W * D), col = new Uint32Array(W * D);
  for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
    // two texels per voxel; a crack anywhere in the 2x2 block makes the voxel a crack
    const tx = (2 * i) % pix.w, ty = pix.h - 1 - ((2 * k) % pix.h);
    let cr = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) if (pix.get((tx + a) % pix.w, Math.max(0, ty - b)) === 0x2a2020) cr = 1;
    crack[i + W * k] = cr;
    col[i + W * k] = cr ? 0x2a2020 : pix.get(tx, ty);
  }
  // chamfer distance to the nearest crack (0, 1, 2+) → crack, lip, plate
  const dist = new Uint8Array(W * D).fill(9);
  for (let q = 0; q < W * D; q++) if (crack[q]) dist[q] = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
      const q = i + W * k;
      let d = dist[q];
      if (i > 0) d = Math.min(d, dist[q - 1] + 1);
      if (k > 0) d = Math.min(d, dist[q - W] + 1);
      dist[q] = d;
    }
    for (let k = D - 1; k >= 0; k--) for (let i = W - 1; i >= 0; i--) {
      const q = i + W * k;
      let d = dist[q];
      if (i < W - 1) d = Math.min(d, dist[q + 1] + 1);
      if (k < D - 1) d = Math.min(d, dist[q + W] + 1);
      dist[q] = d;
    }
  }
  const HMAX = 4;
  const h = new Uint16Array(W * D), top = new Uint32Array(W * D);
  for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
    const q = i + W * k;
    const x = x0 + (i + 0.5) * VS, y = y0 + (k + 0.5) * VS;
    if (holes.some((o) => Math.hypot(x - o.x, y - o.y) < o.r)) continue;
    const c = col[q];
    const g = (c >> 8) & 255, r = (c >> 16) & 255;
    const moss = g > r + 8;
    const plate = 3 + (hash3(c & 0xffff, 1, 2, 7) < 0.45 ? 1 : 0); // each plate colour a step proud or not
    let lv = dist[q] === 0 ? 1 : dist[q] === 1 ? 2 : plate;
    if (moss && dist[q] > 0) lv = Math.min(HMAX, lv + (hash3(i, k, 3, 5) < 0.3 ? 1 : 0)); // moss tufts
    let cc = c;
    if (dist[q] === 1) {
      // the lip: lit if its crack lies below / right (light from the top left)
      const below = k > 0 && dist[q - W] === 0, right = i < W - 1 && dist[q + 1] === 0;
      cc = fshade(c, below || right ? 1.12 : 0.86);
    }
    h[q] = lv;
    top[q] = cc;
  }
  const geo = meshRelief({
    W, D, h, top, side: (q, level, dir) => fshade(top[q] || 0x2a2020, dir === 3 ? 1.05 : dir === 2 ? 0.7 : 0.82),
    U: [VS, 0, 0], V: [0, VS, 0], N: [0, 0, VS], origin: [x0, y0, wallZ - HMAX * VS],
  });
  const m = new THREE.Mesh(geo, voxelMaterial('lambert'));
  m.name = 'cave-wall';
  return m;
}

/** The tile band behind the counter: 1/32 tiles two voxels proud, their grout one. */
export function tileBand({ w, h, wallZ, sootX }) {
  const VS = 1 / 32;
  const tex = tilesTex(w, h, sootX);
  const pix = readPixels(tex);
  disposeTex(tex);
  const W = pix.w, D = pix.h;
  const hh = new Uint16Array(W * D), top = new Uint32Array(W * D);
  const T = 6;
  for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
    const row = D - 1 - k;
    const c = pix.get(i, row);
    const grout = i % (T + 1) === T || row % (T + 1) === T;
    const chip = c === 0x6a5a4a;
    hh[i + W * k] = grout || chip ? 1 : 2;
    top[i + W * k] = c;
  }
  const geo = meshRelief({
    W, D, h: hh, top, side: (q, level, dir) => fshade(top[q], dir === 3 ? 1.08 : 0.78),
    U: [VS, 0, 0], V: [0, VS, 0], N: [0, 0, VS], origin: [-w / 2, 0, wallZ - 0.01],
  });
  const m = new THREE.Mesh(geo, voxelMaterial('lambert'));
  m.name = 'tiles';
  return m;
}

/**
 * The view through the round window: a voxel diorama set into the rock (sky at the back, the far
 * cave wall and stalactites in the middle, glowing mushrooms and crystals in front). Unlit, so it
 * glows like the view it was. Origin at the centre of its back; radius r (m).
 */
export function windowView(r) {
  const tex = caveViewTex();
  const pix = readPixels(tex);
  disposeTex(tex);
  const S = pix.w, c0 = S / 2;
  const isSky = (x, y) => y < 30 && pix.get(x, y) !== 0x1a1630;
  return voxelPlate(pix, {
    scale: (2 * r) / S, kind: 'basic', outline: false,
    depth: (x, y, c) => {
      if (Math.hypot(x + 0.5 - c0, y + 0.5 - c0) > c0) return 0;
      if (c === 0x1a1630) return 3; // stalactites hang in front of the sky
      if (c === 0x3a3060 || c === 0x1e1834) return 4; // the far wall
      const b = ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
      if (b > 420) return isSky(x, y) ? 2 : 6; // glowing caps, crystals, motes
      return isSky(x, y) ? 1 : 4;
    },
    color: (x, y, c, z, d) => (z < d - 1 ? fshade(c, 0.7) : c),
  });
}

/** Old Star's little sun painting: a gilt frame, the sky, and the sun and hills laid on thick. */
export function sunPainting(w) {
  const tex = sunPaintingTex();
  const pix = readPixels(tex);
  disposeTex(tex);
  const W = pix.w, H = pix.h;
  return voxelPlate(pix, {
    scale: w / W,
    depth: (x, y, c) => {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (e === 0) return 3; // the wooden moulding
      if (e <= 2) return e === 1 ? 4 : 3; // the gilt bead
      if (c === 0xffd860 || c === 0xffe890) return 2; // the sun, laid on thick
      if (c === 0x8ac060) return 2;
      return 1;
    },
    color: (x, y, c, z, d) => {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (e <= 2 && z === d - 1) return fshade(c, (x < W / 2 && y < H / 2) || y < 2 ? 1.12 : 0.88);
      return z < d - 1 ? fshade(c, 0.8) : fshade(c, 0.97 + hash3(x, y, z, 4) * 0.06);
    },
  });
}

/** The chalkboard: a wooden frame three voxels proud, the slate, and a chalk tray with sticks. */
export function chalkboard(w) {
  const tex = chalkboardTex();
  const pix = readPixels(tex);
  disposeTex(tex);
  const W = pix.w, H = pix.h;
  return voxelPlate(pix, {
    scale: w / W,
    depth: (x, y, c) => {
      if (y >= H - 4 && y < H - 2 && x >= 2 && x < W - 2) return y === H - 3 ? 5 : c === 0x2a4a3a || c === 0x325446 ? 1 : 5; // tray + chalk
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (e < 2) return e === 0 ? 2 : 3;
      return 1;
    },
    color: (x, y, c, z, d) => {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (e < 2) return fshade(c, (y < 2 || x < 2 ? 1.1 : 0.86) * (0.94 + hash3(x >> 2, y, 1, 9) * 0.12)); // grain
      return z < d - 1 ? fshade(c, 0.75) : c;
    },
  });
}

/** The stovepipe (1/32): riveted joints, two clamp bands, a lit streak and soot. Origin at its centre. */
export function stovepipe(r, len, bandYs = []) {
  const VS = 1 / 32;
  const R = r / VS, H = Math.round(len / VS), S = Math.ceil(2 * (R + 1)) + 1;
  const c = S / 2;
  const g = new VoxelGrid(S, H, S);
  const IRON = 0x2a2628, BAND = 0x4a4648;
  const lit = (a) => Math.cos(a - 2.3);
  const bands = bandYs.map((y) => Math.round(y / VS + H / 2));
  for (let y = 0; y < H; y++) {
    const band = bands.some((b) => y >= b - 1 && y <= b);
    const joint = y % 13 === 0;
    const rr = band ? R + 0.6 : joint ? R + 0.35 : R;
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c, dz = z + 0.5 - c, d = Math.hypot(dx, dz);
      if (d > rr) continue;
      if (d < rr - 1.6) { g.set(x, y, z, 0x141012); continue; } // soot-black inside (only the ends show it)
      const a = Math.atan2(dz, dx), L = lit(a);
      let col = band ? BAND : IRON;
      if (L > 0.85) col = fmix(col, 0xb0a8a0, band ? 0.35 : 0.22);
      else if (L > 0.5) col = fshade(col, 1.25);
      else if (L < -0.5) col = fshade(col, 0.7);
      if ((band || joint) && Math.round(a * 6 / Math.PI) % 3 === 0 && y % 2 === 0) col = 0x8a8478; // rivets
      if (!band && y < 10) col = fmix(col, 0x4a3a5a, (10 - y) / 22); // heat tint near the stove
      col = fshade(col, 0.95 + hash3(x, y, z, 31) * 0.1);
      g.set(x, y, z, col);
    }
  }
  const m = voxMesh(g, { scale: VS, pivot: [c, H / 2, c], kind: 'lambert' });
  m.name = 'stovepipe';
  return m;
}

/** A knurled brass burner knob facing +z with a pointer line (1/80). Origin at its centre. */
export function burnerKnob() {
  const VS = 1 / 80;
  const g = new VoxelGrid(9, 9, 4);
  const BR = 0xd8a840;
  for (let z = 0; z < 4; z++) for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const dx = x + 0.5 - 4.5, dy = y + 0.5 - 4.5, d = Math.hypot(dx, dy);
    const R = z === 0 ? 4.5 : z === 3 ? 3.4 : 4.1;
    if (d > R) continue;
    let c = z === 0 ? 0x8a6a24 : BR;
    const a = Math.atan2(dy, dx);
    if (z > 0 && z < 3 && d > R - 1 && Math.round(a * 8 / Math.PI) % 2 === 0) c = 0xa8802c; // knurling
    if (z === 3) c = dx < 0 && dy > 0 ? 0xf8d878 : d > 2.6 ? 0xb88c30 : BR;
    if (z === 3 && Math.abs(dx) < 0.6 && dy > 0) c = 0x4a3410; // the pointer
    g.set(x, y, z, c);
  }
  const m = voxMesh(g, { scale: VS, pivot: [4.5, 4.5, 2], kind: 'lambert' });
  m.name = 'knob';
  return m;
}

/**
 * A dusting of flour on the board (w × d m): one thin layer of flour voxels (one per texel of the
 * ragged flour pattern) with the odd clump two high, lying flat. Origin at its centre, on the board.
 */
export function flourDust(w, d) {
  const tex = flourTex();
  const pix = readPixels(tex);
  disposeTex(tex);
  const m = voxelPlate(pix, {
    scale: 1 / 32, kind: 'basic', outline: false,
    depth: (x, y, c) => (hash3(x, y, 2, 41) < 0.07 ? 2 : 1),
  });
  m.rotation.x = -Math.PI / 2;
  m.scale.set((w / pix.w) * 32, (d / pix.h) * 32, 0.13); // flour voxels are flat: ~4 mm a layer
  m.name = 'flour';
  return m;
}

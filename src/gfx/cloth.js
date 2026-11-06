// Real cloth: Verlet mass-spring sheets (structural, shear and bend links), pinned where they hang
// from (a rod, a peg, a pole, a nail), pushed by gravity and a draught, shoved aside by upright
// cylinders (the mole, Old Star, townsfolk) walking through them and stirred by the air they push
// in front of them, and draped over boxes (a tarp over a crate, a quilt over a cot). Many sheets
// share one ClothSet: one mesh, one draw call, one texture atlas; sheets far from the camera or
// out of view sleep, sheets nobody is near step at a lower rate, and on phones every sheet has
// fewer particles (clothRes).
//
//   const set = new ClothSet({ wind: (t, x, z) => [wx, wz] })    // the draught (m/s², set space)
//   set.add(new Cloth({ w: 0.8, h: 1.1, nx: 12, ny: 16, tex, pins: 'top' }).place(x, y, z, yaw))
//   scene.add(set.build())                                       // after the last add
//   set.update(dt, colliders, time, camera)                      // colliders: [{ x, z, r, y0, y1 }]
//
// A sheet hangs in its local x-y plane (x right, y down from the pins, facing +z) or, with
// layout 'flat', lies in its local x-z plane (x right, z toward +z; for tarps and rugs). Its local
// frame is a position and a turn about y in the set's space (meters).
import * as THREE from 'three';

const G = -9.8;

/** A coarse-pointer device (phone, tablet): fewer particles per sheet. */
export const CLOTH_LOW = typeof matchMedia !== 'undefined' && (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
/** Particles along a side of a sheet for this device (n on desktop, about 60% of it on phones). */
export function clothRes(n) { return CLOTH_LOW ? Math.max(3, Math.round(n * 0.6)) : n; }

// ---------------------------------------------------------------- textures (pixel art, nearest filtered)
function canvasTex(w, h, paint) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const x = cv.getContext('2d');
  const img = x.createImageData(w, h);
  paint(img.data, w, h);
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const lcg = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

/** A sacking texture: coarse weave, stains, darns, a frayed hem (pixel art, nearest filtered). */
export function sackingTexture({ w = 48, h = 64, base = [154, 128, 88], seed = 7, holes = true } = {}) {
  return canvasTex(w, h, (D) => {
    const rnd = lcg(seed);
    const stains = Array.from({ length: 4 }, () => ({ x: rnd() * w, y: rnd() * h, r: 4 + rnd() * 9, k: 0.7 + rnd() * 0.2 }));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const weave = ((i + (j >> 1)) % 2 === 0 ? 1.06 : 0.92) * ((j + (i >> 1)) % 3 === 0 ? 0.95 : 1);
      let k = weave * (0.9 + rnd() * 0.16);
      for (const st of stains) { const d = Math.hypot(i - st.x, j - st.y); if (d < st.r) k *= st.k + (1 - st.k) * (d / st.r); }
      if (j > h - 4) k *= 0.75 - (j - (h - 4)) * 0.08; // the hem, grubby
      if (j < 3) k *= 0.8; // folded over the rod
      let [r, g, b] = base.map((c) => c * k);
      // a darned patch
      if (i > w * 0.55 && i < w * 0.8 && j > h * 0.4 && j < h * 0.58) { r = r * 0.8 + 20; g = g * 0.78 + 12; b = b * 0.85; if ((i + j) % 4 === 0) { r *= 0.6; g *= 0.6; b *= 0.6; } }
      const p = (j * w + i) * 4;
      D[p] = r; D[p + 1] = g; D[p + 2] = b;
      // frayed: holes at the hem and a moth hole or two
      const moth = holes && (Math.hypot(i - w * 0.3, j - h * 0.3) < 1.6 || Math.hypot(i - w * 0.7, j - h * 0.75) < 1.2);
      D[p + 3] = (j >= h - 2 && rnd() < 0.45) || moth ? 0 : 255;
    }
  });
}

/**
 * Washing on the line (pixel art with cut-outs, nearest filtered): 'shirt' (hung by the shoulders,
 * sleeves down, a patched elbow), 'johns' (long johns by the waistband, two legs, patched knee),
 * 'towel' (striped ends, a frayed hem). Returns { tex, w, h } (w × h: the texture's pixels).
 */
export function laundryTexture(kind = 'shirt', seed = 3) {
  const S = { shirt: [32, 40, [84, 100, 118]], johns: [28, 48, [150, 138, 116]], towel: [24, 30, [160, 150, 128]] }[kind] || [24, 30, [150, 140, 120]];
  const [w, h, base] = S;
  const tex = canvasTex(w, h, (D) => {
    const rnd = lcg(seed);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let on = true, k = ((i + j) % 2 ? 1.04 : 0.96) * (0.92 + rnd() * 0.12);
      let [r, g, b] = base;
      if (kind === 'shirt') {
        const sleeve = i < 6 || i >= w - 6;
        if (sleeve && j > 24) on = false; // the sleeves end
        if (!sleeve && j > h - 3 && (i % 3 === 0)) on = false; // a ragged hem
        if (j < 3 && i > 12 && i < 20) on = false; // the collar's neck
        if (j >= 3 && j < 5 && i > 11 && i < 21) k *= 0.8; // the collar
        if (i === 16 && j > 4 && j % 6 === 0) { r = 230; g = 226; b = 214; k = 1; } // buttons
        if (Math.abs(i - 15) < 1 && j > 4) k *= 0.86; // the placket
        if (sleeve) k *= 0.9;
        if (i >= w - 6 && j > 12 && j < 20) { r = 140; g = 112; b = 84; } // a patched elbow
      } else if (kind === 'johns') {
        if (j > 18 && i > 12 && i < 16) on = false; // between the legs
        if (j > 18 && (i === 12 || i === 16)) k *= 0.85;
        if (j < 4) k *= 0.82; // the waistband
        if (j > h - 4) k *= (i % 2 ? 0.8 : 0.95); // ribbed cuffs
        if (j > 30 && j < 37 && i > 2 && i < 9) { r = 120; g = 140; b = 110; } // a patched knee
        if (i === 14 && j > 5 && j < 16 && j % 4 === 0) { r = 90; g = 70; b = 50; k = 1; } // flap buttons
        k *= 1 - Math.max(0, j - 30) * 0.008; // grubby toward the feet
      } else {
        if (j < 5 || (j > h - 8 && j < h - 3)) { const st = (j % 3 === 0); r = st ? 150 : 170; g = st ? 58 : 70; b = st ? 48 : 60; }
        if (j >= h - 2 && i % 2) on = false; // the fringe
      }
      const p = (j * w + i) * 4;
      D[p] = r * k; D[p + 1] = g * k; D[p + 2] = b * k;
      D[p + 3] = on ? 255 : 0;
    }
  });
  return { tex, w, h };
}

/**
 * Woven and sewn things, all pixel art: kind
 *  'curtain'  plain weave with a hem and a deep fold shadow every few threads ({ base, trim })
 *  'quilt'    patchwork squares with stitched seams ({ seed })
 *  'tarp'     oiled canvas, patched, grommets along the top
 *  'apron'    scorched leather with a pocket and neck strap cut-outs
 *  'banner'   a hanging banner: a field, a border, an emblem ('star' | 'gem' | 'cup' | 'pick' | 'none') and a swallowtail
 *  'pennant'  a triangular flag (the cut-out does the shape)
 *  'tapestry' a woven hanging: borders, a mountain-and-sun picture, a fringe
 *  'rag'      a torn scrap of canvas
 */
export function clothTexture(kind, o = {}) {
  const seed = o.seed ?? 5;
  const base = o.base ?? [150, 60, 48], trim = o.trim ?? [214, 170, 80];
  const W = { curtain: 24, quilt: 32, tarp: 40, apron: 24, banner: 24, pennant: 24, tapestry: 40, rag: 20 }[kind] || 24;
  const H = { curtain: 48, quilt: 24, tarp: 40, apron: 32, banner: 48, pennant: 16, tapestry: 32, rag: 24 }[kind] || 32;
  const w = o.w ?? W, h = o.h ?? H;
  return canvasTex(w, h, (D) => {
    const rnd = lcg(seed);
    const pat = Array.from({ length: 16 }, () => rnd());
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let [r, g, b] = base, on = true;
      let k = ((i + j) % 2 ? 1.03 : 0.97) * (0.94 + rnd() * 0.08);
      const u = i / (w - 1), v = j / (h - 1);
      if (kind === 'curtain') {
        if (i % 6 === 0) k *= 0.82; // the folds the light catches
        if (j < 3) { [r, g, b] = trim; k *= 0.9; } // the casing over the rod
        if (j > h - 4) [r, g, b] = trim; // the hem
        if (j === h - 1 && i % 3 === 0) on = false;
      } else if (kind === 'quilt') {
        const cx = Math.floor(i / 8), cy = Math.floor(j / 8);
        const pal = [[170, 70, 56], [196, 160, 96], [84, 110, 132], [120, 140, 84], [176, 120, 140], [150, 110, 70]];
        [r, g, b] = pal[Math.floor(pat[(cx * 3 + cy * 5) % 16] * pal.length)];
        if (i % 8 === 0 || j % 8 === 0) { r *= 0.7; g *= 0.7; b *= 0.7; } // seams
        if ((i % 8 === 4) && (j % 2 === 0)) k *= 0.9; // quilting stitches
        if (pat[(cx + cy * 7) % 16] > 0.82 && (i + j) % 3 === 0) k *= 0.85; // a darn
      } else if (kind === 'tarp') {
        [r, g, b] = o.base ?? [112, 104, 74];
        if (Math.floor(i / 10 + pat[j >> 3] * 2) % 3 === 0) k *= 0.93; // the canvas panels
        if (i % 10 === 0) k *= 0.8; // seams
        if (i > w * 0.6 && i < w * 0.85 && j > h * 0.2 && j < h * 0.45) { r = 96; g = 74; b = 52; if (i === Math.ceil(w * 0.6) || j === Math.ceil(h * 0.2)) k *= 0.7; } // a patch
        if (j < 3 && i % 8 === 4) { r = 70; g = 66; b = 60; } // grommets
        if (j === 0 && (i < 2 || i > w - 3)) on = false;
        k *= 1 - v * 0.12 + Math.sin(i * 0.7 + j * 0.3) * 0.02;
      } else if (kind === 'apron') {
        [r, g, b] = o.base ?? [110, 70, 40];
        const neck = j < h * 0.3 && Math.abs(u - 0.5) > 0.22 + (1 - j / (h * 0.3)) * 0.2;
        if (neck) on = false;
        if (j < h * 0.3 && Math.abs(u - 0.5) > 0.2 && Math.abs(u - 0.5) < 0.26) { r = 70; g = 46; b = 28; on = true; } // the strap
        if (j > h * 0.55 && j < h * 0.75 && Math.abs(u - 0.5) < 0.22) { k *= 0.86; if (j === Math.ceil(h * 0.55)) k *= 0.7; } // the pocket
        if (pat[(i >> 2) % 16] > 0.75 && j > h * 0.4 && (i * 7 + j * 3) % 11 === 0) { r = 40; g = 30; b = 24; } // scorch marks
        if (i === 0 || i === w - 1 || j === h - 1) k *= 0.8;
      } else if (kind === 'banner') {
        const bd = 2;
        if (i < bd || i >= w - bd || j < bd + 1) [r, g, b] = trim;
        const tail = v > 0.82 && Math.abs(u - 0.5) < (v - 0.82) / 0.18 * 0.5; // swallowtail
        if (tail) on = false;
        else if (v > 0.8 && !(i < bd || i >= w - bd)) { if (Math.abs(u - 0.5) < (v - 0.8) / 0.2 * 0.5 + 0.08) [r, g, b] = trim; }
        const ex = (u - 0.5) * w, ey = (v - 0.42) * h;
        const em = o.emblem ?? 'star';
        if (em === 'star') { const a = Math.atan2(ey, ex), rr = Math.hypot(ex, ey), lim = 5.5 * (0.55 + 0.45 * Math.abs(Math.cos(a * 2.5))); if (rr < lim) [r, g, b] = trim; }
        else if (em === 'gem') { if (Math.abs(ex) + Math.abs(ey) * 0.7 < 5) [r, g, b] = (ex + ey < 0 ? [190, 240, 255] : trim); }
        else if (em === 'cup') { if ((ey > -4 && ey < 2 && Math.abs(ex) < 4 - (ey + 4) * 0.2) || (ey >= 2 && ey < 5 && Math.abs(ex) < 1) || (ey >= 5 && ey < 6 && Math.abs(ex) < 3)) [r, g, b] = trim; }
        else if (em === 'pick') { if ((Math.abs(ey + 3 - Math.abs(ex) * 0.4) < 1 && Math.abs(ex) < 5) || (Math.abs(ex) < 0.8 && ey > -3 && ey < 6)) [r, g, b] = trim; }
      } else if (kind === 'pennant') {
        if (v < 0.5 - u * 0.5 || v > 0.5 + u * 0.5) on = false;
        if (u < 0.12) [r, g, b] = trim;
      } else if (kind === 'tapestry') {
        const bd = 3;
        if (i < bd || i >= w - bd || j < bd || j >= h - bd - 2) { [r, g, b] = trim; if ((i + j) % 4 === 0) k *= 0.8; }
        else {
          const sky = v < 0.55;
          [r, g, b] = sky ? [70, 84, 120] : [80, 96, 60];
          const mx = Math.abs(u - 0.45) * 2, peak = 0.32 + mx * 0.5;
          if (v > peak && v < 0.62) [r, g, b] = v < peak + 0.06 ? [220, 220, 230] : [110, 100, 110];
          if (Math.hypot(u - 0.78, v - 0.25) < 0.1) [r, g, b] = [240, 196, 80];
          if (!sky && (i + j * 3) % 7 === 0) k *= 0.85;
        }
        if (j >= h - 2 && i % 2) on = false; // the fringe
        if (j >= h - 2) [r, g, b] = trim;
      } else if (kind === 'rag') {
        [r, g, b] = o.base ?? [140, 126, 96];
        const torn = v > 0.55 + Math.sin(i * 1.7) * 0.15 + pat[i % 16] * 0.2 || (u > 0.75 && v > 0.3 + pat[j % 16] * 0.4);
        if (torn) on = false;
        if (i % 5 === 0) k *= 0.9;
      }
      const p = (j * w + i) * 4;
      D[p] = Math.min(255, r * k); D[p + 1] = Math.min(255, g * k); D[p + 2] = Math.min(255, b * k);
      D[p + 3] = on ? 255 : 0;
    }
  });
}

// ---------------------------------------------------------------- one sheet
export class Cloth {
  /**
   * w × h m, nx × ny particles. pins: 'top' (the whole top row), 'left' (the left column: a flag on
   * a pole), 'corners' (the two top corners), or an array of [i, j]. layout: 'hang' (in the x-y
   * plane, y down from the pins) | 'flat' (in the x-z plane at y = 0). boxes: local [x0, y0, z0,
   * x1, y1, z1] it drapes over; floor: a local y it can't fall through. damping (per second), iters
   * (constraint passes), slack (links longer than the layout: sags), color (tint), tex (a
   * CanvasTexture; its canvas goes into the set's atlas). Particle counts are cut on phones.
   */
  constructor({ w = 0.8, h = 1.1, nx = 12, ny = 16, tex = null, color = 0xffffff, pins = 'top', iters = 6, damping = 1.6, slack = 1.0, layout = 'hang', boxes = null, floor = null, gust = 1, stiff = 0.25 } = {}) {
    const nx0 = nx, ny0 = ny;
    nx = clothRes(nx); ny = clothRes(ny);
    this.w = w; this.h = h; this.nx = nx; this.ny = ny; this.iters = iters; this.damping = damping;
    this.tex = tex; this.color = new THREE.Color(color);
    this.layout = layout; this.boxes = boxes || []; this.floor = floor; this.gust = gust; this.stiff = stiff;
    const n = nx * ny;
    this.p = new Float32Array(n * 3); // positions (local m)
    this.o = new Float32Array(n * 3); // previous positions
    this.inv = new Float32Array(n).fill(1); // 0 = pinned
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      this.p[k] = (i / (nx - 1)) * w;
      if (layout === 'flat') { this.p[k + 1] = 0; this.p[k + 2] = (j / (ny - 1)) * h; }
      else { this.p[k + 1] = -(j / (ny - 1)) * h; this.p[k + 2] = 0; }
    }
    this.o.set(this.p);
    const pinList = pins === 'top' ? Array.from({ length: nx }, (_, i) => [i, 0])
      : pins === 'left' ? Array.from({ length: ny }, (_, j) => [0, j])
        : pins === 'corners' ? [[0, 0], [nx - 1, 0]]
          : (pins || []).map(([i, j]) => [Math.min(nx - 1, Math.round(i * (nx - 1) / Math.max(1, nx0 - 1))), Math.min(ny - 1, Math.round(j * (ny - 1) / Math.max(1, ny0 - 1)))]); // (given for the full-size sheet)
    for (const [i, j] of pinList) this.inv[j * nx + i] = 0;
    this.home = this.p.slice(); // where pinned particles stay
    // how free each particle is (0 at a pin, 1 at the far edge): the draught moves the free edge most
    this.free = new Float32Array(n);
    let maxD = 1;
    const dist = (k) => { let d = 1e9; for (const [i, j] of pinList) d = Math.min(d, Math.hypot((k % nx) - i, Math.floor(k / nx) - j)); return pinList.length ? d : 1; };
    for (let k = 0; k < n; k++) { this.free[k] = dist(k); maxD = Math.max(maxD, this.free[k]); }
    for (let k = 0; k < n; k++) this.free[k] = Math.min(1, this.free[k] / maxD);
    // links: [a, b, rest]
    const L = [];
    const link = (a, b) => { const dx = this.p[a * 3] - this.p[b * 3], dy = this.p[a * 3 + 1] - this.p[b * 3 + 1], dz = this.p[a * 3 + 2] - this.p[b * 3 + 2]; L.push(a, b, Math.hypot(dx, dy, dz) * slack); };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * nx + i;
      if (i + 1 < nx) link(a, a + 1);
      if (j + 1 < ny) link(a, a + nx);
      if (i + 1 < nx && j + 1 < ny) { link(a, a + nx + 1); link(a + 1, a + nx); }
      if (i + 2 < nx) link(a, a + 2);
      if (j + 2 < ny) link(a, a + nx * 2);
    }
    this.links = new Float32Array(L);
    this.acc = 0;
    this.fx = 0; this.fy = 0; this.fz = 0; this.yaw = 0; this.c = 1; this.s = 0;
    this.awake = true;
    this.skip = 0;
  }

  /** Put the sheet's frame (its top-left corner: the first pin) at (x, y, z) of the set, turned yaw about y. */
  place(x, y, z, yaw = 0) {
    this.fx = x; this.fy = y; this.fz = z; this.yaw = yaw;
    this.c = Math.cos(yaw); this.s = Math.sin(yaw);
    // the sheet's middle and reach, for culling (set space)
    const mx = this.w / 2, my = this.layout === 'flat' ? 0 : -this.h / 2, mz = this.layout === 'flat' ? this.h / 2 : 0;
    this.cx = x + mx * this.c + mz * this.s; this.cy = y + my; this.cz = z - mx * this.s + mz * this.c;
    this.rad = Math.hypot(this.w, this.h) * 0.6 + 0.1;
    return this;
  }
  /** (old name) */
  placeCorner(x, y, z, yaw = 0) { return this.place(x, y, z, yaw); }

  /** Move the pinned particles (e.g. a rod that sways). fn(i, j, out[3]) sets local positions. */
  movePins(fn) {
    const out = [0, 0, 0];
    for (let k = 0; k < this.inv.length; k++) {
      if (this.inv[k]) continue;
      out[0] = this.home[k * 3]; out[1] = this.home[k * 3 + 1]; out[2] = this.home[k * 3 + 2];
      fn(k % this.nx, Math.floor(k / this.nx), out);
      this.p[k * 3] = out[0]; this.p[k * 3 + 1] = out[1]; this.p[k * 3 + 2] = out[2];
    }
  }

  /**
   * Step the sim by dt at `step` s a substep (at most 0.1 s of catch-up). cols: upright cylinders in
   * the SET's space { x, z, r, y0, y1, vx, vz } (vx, vz: how fast it moves: the air it pushes);
   * wind(t, x, z) → [wx, wz] m/s² in the set's space.
   */
  sim(dt, cols, time, wind, step = 1 / 90, iters = this.iters) {
    this.acc = Math.min(this.acc + dt, 0.1);
    if (this.acc < step) return false;
    // colliders and the draught into the sheet's local frame
    const c = this.c, s = this.s, lc = this._lc || (this._lc = []);
    lc.length = 0;
    for (const q of cols) {
      const dx = q.x - this.fx, dz = q.z - this.fz;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      // (only the ones that can reach it)
      if (Math.abs(lx - this.w / 2) > this.w / 2 + q.r + 0.6 || (this.layout === 'flat' ? Math.abs(lz - this.h / 2) > this.h / 2 + q.r + 0.6 : Math.abs(lz) > q.r + 0.8)) continue;
      const vx = q.vx || 0, vz = q.vz || 0;
      lc.push({ x: lx, z: lz, r: q.r, y0: q.y0 - this.fy, y1: q.y1 - this.fy, vx: vx * c - vz * s, vz: vx * s + vz * c });
    }
    while (this.acc >= step) {
      this.acc -= step;
      time += step;
      let wx = 0, wz = 0;
      if (wind) { const w = wind(time, this.cx, this.cz); wx = w[0] * c - w[1] * s; wz = w[0] * s + w[1] * c; }
      this.integrate(step, wx * this.gust, wz * this.gust, time, lc);
      for (let it = 0; it < iters; it++) this.relax();
      this.collide(lc);
    }
    return true;
  }

  integrate(dt, wx, wz, time, lc) {
    const p = this.p, o = this.o, inv = this.inv, n = inv.length, free = this.free;
    const keep = Math.max(0, 1 - this.damping * dt);
    const dt2 = dt * dt;
    const flat = this.layout === 'flat';
    for (let k = 0; k < n; k++) {
      if (!inv[k]) continue;
      const i = k * 3;
      const x = p[i], y = p[i + 1], z = p[i + 2];
      // the draught flutters: stronger at the free edge, a little noise per particle
      const f = free[k];
      const gust = (0.6 + 0.4 * Math.sin(time * 2.3 + k * 0.37) * Math.sin(time * 0.9 + (k % this.nx) * 0.5)) * f;
      let ax = wx * gust, az = wz * gust, ay = G;
      // a flat sheet in a draught lifts a little at its free edge
      if (flat) ay += Math.abs(wx + wz) * 0.15 * gust;
      p[i] = x + (x - o[i]) * keep + ax * dt2;
      p[i + 1] = y + (y - o[i + 1]) * keep + ay * dt2;
      p[i + 2] = z + (z - o[i + 2]) * keep + az * dt2;
      o[i] = x; o[i + 1] = y; o[i + 2] = z;
    }
    // the air a walker pushes ahead and drags behind: particles close to a moving collider follow it a little
    for (const q of lc) {
      const sp = Math.hypot(q.vx, q.vz);
      if (sp < 0.15) continue;
      const R = q.r + 0.35;
      for (let k = 0; k < n; k++) {
        if (!inv[k]) continue;
        const i = k * 3;
        const y = p[i + 1];
        if (y < q.y0 - 0.1 || y > q.y1 + 0.1) continue;
        const dx = p[i] - q.x, dz = p[i + 2] - q.z, d = Math.hypot(dx, dz);
        if (d > R) continue;
        const f = (1 - d / R) * 0.5 * dt;
        p[i] += q.vx * f; p[i + 2] += q.vz * f;
      }
    }
  }

  relax() {
    const p = this.p, inv = this.inv, L = this.links, soft = this.stiff;
    for (let l = 0; l < L.length; l += 3) {
      const a = L[l] * 3, b = L[l + 1] * 3, rest = L[l + 2];
      const wa = inv[L[l]], wb = inv[L[l + 1]];
      if (!wa && !wb) continue;
      const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      // stretch is stiff, squash is soft (cloth bunches up, it doesn't push)
      const diff = d > rest ? (d - rest) / d : ((d - rest) / d) * soft;
      const s = diff / (wa + wb);
      p[a] += dx * s * wa; p[a + 1] += dy * s * wa; p[a + 2] += dz * s * wa;
      p[b] -= dx * s * wb; p[b + 1] -= dy * s * wb; p[b + 2] -= dz * s * wb;
    }
  }

  collide(cols) {
    const p = this.p, o = this.o, inv = this.inv, n = inv.length;
    const B = this.boxes, fl = this.floor;
    for (let k = 0; k < n; k++) {
      if (!inv[k]) continue;
      const i = k * 3;
      for (const c of cols) {
        const y = p[i + 1];
        if (y < c.y0 || y > c.y1) continue;
        const dx = p[i] - c.x, dz = p[i + 2] - c.z;
        const d2 = dx * dx + dz * dz, r = c.r;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 1e-4;
        // pushed out to the cylinder's side (and dragged along a little: friction)
        const nx = d > 1e-3 ? dx / d : 0, nz = d > 1e-3 ? dz / d : 1;
        p[i] = c.x + nx * r;
        p[i + 2] = c.z + nz * r;
        o[i] = o[i] * 0.6 + p[i] * 0.4;
        o[i + 2] = o[i + 2] * 0.6 + p[i + 2] * 0.4;
      }
      // boxes it drapes over: out along the shallowest side, with friction on top
      for (let b = 0; b < B.length; b++) {
        const q = B[b];
        const x = p[i], y = p[i + 1], z = p[i + 2];
        if (x <= q[0] || x >= q[3] || y <= q[1] || y >= q[4] || z <= q[2] || z >= q[5]) continue;
        const e = [x - q[0], q[3] - x, y - q[1], q[4] - y, z - q[2], q[5] - z];
        let m = 3;
        for (let a = 0; a < 6; a++) if (a !== 2 && e[a] < e[m]) m = a; // (never pushed down through it)
        if (m === 0) p[i] = q[0]; else if (m === 1) p[i] = q[3];
        else if (m === 3) { p[i + 1] = q[4]; o[i] = o[i] * 0.3 + p[i] * 0.7; o[i + 2] = o[i + 2] * 0.3 + p[i + 2] * 0.7; }
        else if (m === 4) p[i + 2] = q[2]; else p[i + 2] = q[5];
      }
      if (fl !== null && p[i + 1] < fl) { p[i + 1] = fl; o[i] = o[i] * 0.5 + p[i] * 0.5; o[i + 2] = o[i + 2] * 0.5 + p[i + 2] * 0.5; o[i + 1] = fl; }
    }
  }

  /** Has it come to rest? (largest move in the last substep, m) */
  motion() {
    let m = 0;
    const p = this.p, o = this.o;
    for (let i = 0; i < p.length; i++) { const d = Math.abs(p[i] - o[i]); if (d > m) m = d; }
    return m;
  }
}

// ---------------------------------------------------------------- many sheets, one mesh
const _sph = new THREE.Sphere();
const _fr = new THREE.Frustum();
const _pm = new THREE.Matrix4();

export class ClothSet {
  /**
   * wind(t, x, z) → [wx, wz] (m/s², set space): the draught. material(atlasTexture) → a material
   * (default: a lit, double-sided standard material with vertex tints and alpha cut-outs).
   * far: sheets further than this from the camera sleep (m). near: a collider this close (m) wakes
   * a sheet to full rate.
   */
  constructor({ wind = null, material = null, far = 10, near = 1.4, name = 'cloth' } = {}) {
    this.list = [];
    this.wind = wind;
    this.makeMat = material;
    this.far = far; this.near = near;
    this.name = name;
    this.mesh = null;
    this.prev = [];
    this.frame = 0;
    this.stats = { awake: 0, steps: 0, sheets: 0, verts: 0 };
  }

  add(c) { this.list.push(c); return c; }

  /** Pack the sheets into one mesh (and their textures into one atlas); settle them. Returns the mesh. */
  build() {
    const L = this.list;
    // the atlas: shelf-pack every sheet's canvas (1 px apart), white where a sheet has none
    const canvases = [];
    const rects = L.map((c) => {
      const cv = c.tex?.image || null;
      let e = canvases.find((q) => q.cv === cv);
      if (!e) { e = { cv, w: cv ? cv.width : 4, h: cv ? cv.height : 4 }; canvases.push(e); }
      return e;
    });
    const order = [...canvases].sort((a, b) => b.h - a.h);
    let AW = 128;
    const area = canvases.reduce((s, e) => s + (e.w + 2) * (e.h + 2), 0);
    while (AW * AW < area * 1.5) AW *= 2;
    let x = 1, y = 1, rowH = 0;
    for (const e of order) {
      if (x + e.w + 1 > AW) { x = 1; y += rowH + 2; rowH = 0; }
      e.x = x; e.y = y; x += e.w + 2; rowH = Math.max(rowH, e.h);
    }
    let AH = 16;
    while (AH < y + rowH + 2) AH *= 2;
    let tex = null;
    if (typeof document !== 'undefined') {
      const cv = document.createElement('canvas');
      cv.width = AW; cv.height = AH;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      for (const e of canvases) {
        if (e.cv) { g.drawImage(e.cv, e.x, e.y); g.drawImage(e.cv, 0, 0, e.w, 1, e.x, e.y - 1, e.w, 1); g.drawImage(e.cv, 0, e.h - 1, e.w, 1, e.x, e.y + e.h, e.w, 1); }
        else { g.fillStyle = '#fff'; g.fillRect(e.x - 1, e.y - 1, e.w + 2, e.h + 2); }
      }
      tex = new THREE.CanvasTexture(cv);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    for (const c of L) c.tex?.dispose?.();
    // one geometry: each sheet's particles are its vertices
    let nv = 0, ni = 0;
    for (const c of L) { c.v0 = nv; nv += c.nx * c.ny; ni += (c.nx - 1) * (c.ny - 1) * 6; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let q = 0;
    L.forEach((c, n) => {
      const e = rects[n];
      for (let j = 0; j < c.ny; j++) for (let i = 0; i < c.nx; i++) {
        const v = c.v0 + j * c.nx + i;
        // (texture: top row of the canvas at the pins)
        const px = e.x + (i / (c.nx - 1)) * e.w, py = e.y + (j / (c.ny - 1)) * e.h;
        uv[v * 2] = px / AW; uv[v * 2 + 1] = 1 - py / AH;
        col[v * 3] = c.color.r; col[v * 3 + 1] = c.color.g; col[v * 3 + 2] = c.color.b;
      }
      for (let j = 0; j < c.ny - 1; j++) for (let i = 0; i < c.nx - 1; i++) {
        const a = c.v0 + j * c.nx + i, b = a + c.nx, cc = b + 1, d = a + 1;
        idx[q++] = a; idx[q++] = b; idx[q++] = d;
        idx[q++] = b; idx[q++] = cc; idx[q++] = d;
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = geo;
    this.tex = tex;
    const mat = this.makeMat ? this.makeMat(tex) : new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0, alphaTest: 0.5 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = this.name;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    // (the camera it was last drawn with: for culling when the scene doesn't hand one over)
    this.mesh.onBeforeRender = (r, sc, cam) => { if (cam?.isPerspectiveCamera) this.lastCam = cam; };
    // let them settle before anyone sees them
    for (let i = 0; i < 75; i++) for (const c of L) c.sim(1 / 30, [], i / 30, this.wind, 1 / 30, 3);
    for (const c of L) { c.acc = 0; this.write(c); }
    this.stats.sheets = L.length; this.stats.verts = nv;
    return this.mesh;
  }

  /** A sheet's particles into the mesh (set space) with its normals. */
  write(c) {
    const P = this.geo.attributes.position.array, N = this.geo.attributes.normal.array;
    const p = c.p, nx = c.nx, ny = c.ny, cs = c.c, sn = c.s;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, a = k * 3, v = (c.v0 + k) * 3;
      const x = p[a], y = p[a + 1], z = p[a + 2];
      P[v] = c.fx + x * cs + z * sn; P[v + 1] = c.fy + y; P[v + 2] = c.fz - x * sn + z * cs;
      // the normal from the neighbours (cross of down × right: +z on a sheet hanging flat)
      const r = (i < nx - 1 ? k + 1 : k) * 3, l = (i > 0 ? k - 1 : k) * 3, dn = (j < ny - 1 ? k + nx : k) * 3, up = (j > 0 ? k - nx : k) * 3;
      const ux = p[r] - p[l], uy = p[r + 1] - p[l + 1], uz = p[r + 2] - p[l + 2];
      const vx = p[dn] - p[up], vy = p[dn + 1] - p[up + 1], vz = p[dn + 2] - p[up + 2];
      let mx = vy * uz - vz * uy, my = vz * ux - vx * uz, mz = vx * uy - vy * ux;
      const m = Math.hypot(mx, my, mz) || 1;
      mx /= m; my /= m; mz /= m;
      N[v] = mx * cs + mz * sn; N[v + 1] = my; N[v + 2] = -mx * sn + mz * cs;
    }
  }

  /**
   * One frame. colliders: [{ x, z, r, y0, y1 }] in the set's space (their speed is worked out here,
   * by index, from the last frame); camera: for sleeping what's far off or out of view.
   */
  update(dt, colliders = [], time = 0, camera = null) {
    if (!this.mesh || !dt) return;
    camera = camera || this.lastCam || null;
    this.frame++;
    // collider speeds (the air they push)
    const cols = colliders.map((c, i) => {
      const pv = this.prev[i];
      const vx = pv ? (c.x - pv.x) / dt : 0, vz = pv ? (c.z - pv.z) / dt : 0;
      const ok = Math.abs(vx) < 8 && Math.abs(vz) < 8; // (a teleport isn't a gust)
      return { ...c, vx: ok ? vx : 0, vz: ok ? vz : 0 };
    });
    this.prev = colliders.map((c) => ({ x: c.x, z: c.z }));
    // the camera in the set's space (the set may hang under a scaled root), its view for culling
    let cam = null;
    const parentM = this.mesh.parent ? this.mesh.parent.matrixWorld : null;
    if (camera) {
      _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _fr.setFromProjectionMatrix(_pm);
      cam = (this._cp || (this._cp = new THREE.Vector3())).setFromMatrixPosition(camera.matrixWorld);
      if (parentM) cam.applyMatrix4((this._ip || (this._ip = new THREE.Matrix4())).copy(parentM).invert());
    }
    const sc = parentM ? Math.hypot(parentM.elements[0], parentM.elements[1], parentM.elements[2]) : 1;
    let any = false, awake = 0, steps = 0;
    for (const c of this.list) {
      let near = false;
      for (const q of cols) if (Math.hypot(q.x - c.cx, q.z - c.cz) < c.rad + this.near && q.y1 > c.cy - c.rad && q.y0 < c.cy + c.rad) { near = true; break; }
      if (cam && !near) {
        const d = Math.hypot(cam.x - c.cx, cam.y - c.cy, cam.z - c.cz);
        if (d > this.far) { c.awake = false; continue; } // asleep: hangs as it last was
        _sph.center.set(c.cx, c.cy, c.cz);
        if (parentM) _sph.center.applyMatrix4(parentM);
        _sph.radius = c.rad * sc;
        if (!_fr.intersectsSphere(_sph)) { c.awake = false; continue; }
        // nobody near: a lazy rate (every other frame, coarse steps)
        if (d > this.far * 0.5 && (this.frame + c.v0) % 2) { c.acc = Math.min(0.1, c.acc + dt); continue; }
      }
      // someone close: full rate; else coarse steps and fewer passes (it only sways in the draught)
      const moved = near ? c.sim(dt, cols, time, this.wind, 1 / 90, c.iters) : c.sim(dt, cols, time, this.wind, 1 / 40, Math.max(2, c.iters >> 1));
      c.awake = true;
      awake++;
      if (moved) { this.write(c); any = true; steps++; }
    }
    if (any) { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true; }
    this.stats.awake = awake; this.stats.steps = steps;
  }

  dispose() {
    this.mesh?.parent?.remove(this.mesh);
    this.geo?.dispose();
    this.tex?.dispose();
    this.mesh?.material.dispose();
  }
}

// The hi-res near copy of a creature model (wave 12, "super high resolution"): the voxels as
// modelled, refined k× (to ~1/96 m on desktop, ~1/72 m on phones) and given real surface detail at
// that size by the skin style the model was built under (./vox.js HI.style, set by Enemies.geo):
//
//   scale    overlapping scale rows (grooves cut between them, a lit upper rim on each), belly
//            scutes across the underside, keratin striations along quills, crests and feathers
//   stone    cracked plates (a jittered-cell crack network cut into the surface), strata grooves on
//            the flanks, mica flecks and dark inclusions; crystal parts get flat facets at random
//            tilts with bright edges instead of cracks
//   hide     wrinkles and warts (a soft crack network painted darker, little raised bumps)
//   fur      strands: tufts standing out of the surface in rows, darker partings between them
//   chitin   segment grooves, pitted plates and glossy highlights on the top
//   smooth   just finer (slime, wisps, wraiths)
//
// Pure (no DOM): runs in ./hiWorker.js, or on the main thread when workers are unavailable. Eyes,
// teeth, claws and other white or near-black bits are never cut or recoloured, only refined.
import { meshGrid } from './vox.js';

const F = 0x1000000;
const hash = (x, y, z, s) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(s | 0, 144269)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const mulc = (c, f) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f)), g = Math.min(255, Math.round(((c >> 8) & 255) * f)), b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
};
const mixc = (a, b, t) => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t), g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t), bb = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bb);
};
/** [lum 0..1, saturation 0..1] of an sRGB colour. */
const ls = (c) => {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return [0.3 * r + 0.59 * g + 0.11 * b, mx > 0 ? (mx - mn) / mx : 0];
};

/**
 * list: Int32Array [x, y, z, colour] × n (model voxels), pivot [px, py, pz] in model voxels, vs (m
 * per model voxel), k (refinement), style, seed. Returns { pos, nor, col, idx } typed arrays.
 */
export function buildHi({ list, pivot, vs, k, style, seed = 1 }) {
  const n = list.length >> 2;
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let i = 0; i < n; i++) {
    const x = list[i * 4], y = list[i * 4 + 1], z = list[i * 4 + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  // ---- the coarse model, padded by one cell (colour + 1; 0 = air), its hollow insides filled
  const SX = x1 - x0 + 3, SY = y1 - y0 + 3, SZ = z1 - z0 + 3, SXY = SX * SY, NC = SXY * SZ;
  const cg = new Int32Array(NC);
  for (let i = 0; i < n; i++) cg[(list[i * 4] - x0 + 1) + SX * (list[i * 4 + 1] - y0 + 1) + SXY * (list[i * 4 + 2] - z0 + 1)] = (list[i * 4 + 3] & 0xffffff) + 1;
  {
    // flood the outside air from the border; air it never reaches is a hollowed-out inside
    const out = new Uint8Array(NC), q = new Int32Array(NC);
    let qh = 0, qt = 0;
    for (let z = 0; z < SZ; z++) for (let y = 0; y < SY; y++) for (let x = 0; x < SX; x++) {
      if (x && y && z && x < SX - 1 && y < SY - 1 && z < SZ - 1) continue;
      const i = x + SX * y + SXY * z;
      if (!cg[i] && !out[i]) { out[i] = 1; q[qt++] = i; }
    }
    while (qh < qt) {
      const i = q[qh++], x = i % SX, y = ((i / SX) | 0) % SY, z = (i / SXY) | 0;
      if (x > 0 && !cg[i - 1] && !out[i - 1]) { out[i - 1] = 1; q[qt++] = i - 1; }
      if (x < SX - 1 && !cg[i + 1] && !out[i + 1]) { out[i + 1] = 1; q[qt++] = i + 1; }
      if (y > 0 && !cg[i - SX] && !out[i - SX]) { out[i - SX] = 1; q[qt++] = i - SX; }
      if (y < SY - 1 && !cg[i + SX] && !out[i + SX]) { out[i + SX] = 1; q[qt++] = i + SX; }
      if (z > 0 && !cg[i - SXY] && !out[i - SXY]) { out[i - SXY] = 1; q[qt++] = i - SXY; }
      if (z < SZ - 1 && !cg[i + SXY] && !out[i + SXY]) { out[i + SXY] = 1; q[qt++] = i + SXY; }
    }
    for (let i = 0; i < NC; i++) if (!cg[i] && !out[i]) cg[i] = 0x302a26 + 1;
  }
  const nb = new Uint8Array(NC);
  for (let z = 1; z < SZ - 1; z++) for (let y = 1; y < SY - 1; y++) for (let x = 1; x < SX - 1; x++) {
    const i = x + SX * y + SXY * z;
    if (cg[i]) nb[i] = (cg[i + 1] ? 1 : 0) + (cg[i - 1] ? 1 : 0) + (cg[i + SX] ? 1 : 0) + (cg[i - SX] ? 1 : 0) + (cg[i + SXY] ? 1 : 0) + (cg[i - SXY] ? 1 : 0);
  }
  const cat = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ ? 0 : cg[x + SX * y + SXY * z]);

  // ---- the fine grid (one empty cell of border for the mesher), smoothed as ./vox.js refine()
  const FW = SX * k, FH = SY * k, FD = SZ * k;
  const W = FW + 2, H = FH + 2, D = FD + 2, WH = W * H;
  const g = new Uint32Array(WH * D);
  for (let fz = 0; fz < FD; fz++) for (let fy = 0; fy < FH; fy++) {
    const cy = (fy + 0.5) / k - 0.5, cz = (fz + 0.5) / k - 0.5;
    const iy = Math.floor(cy), iz = Math.floor(cz), ty = cy - iy, tz = cz - iz;
    const rowC = SX * Math.floor(fy / k) + SXY * Math.floor(fz / k);
    let o = 1 + W * (fy + 1) + WH * (fz + 1);
    for (let fx = 0; fx < FW; fx++, o++) {
      const cx = (fx + 0.5) / k - 0.5, ix = Math.floor(cx), tx = cx - ix;
      const cell = Math.floor(fx / k) + rowC;
      const own = cg[cell];
      let occ = 0, best = 0, bw = -1;
      for (let c = 0; c < 8; c++) {
        const dx = c & 1, dy = (c >> 1) & 1, dz = c >> 2;
        const v = cat(ix + dx, iy + dy, iz + dz);
        if (!v) continue;
        const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz);
        occ += w;
        if (w > bw) { bw = w; best = v; }
      }
      let fill;
      if (own) fill = occ >= (nb[cell] <= 3 ? 0.4 : 0.3) || nb[cell] === 0;
      else fill = occ >= 0.62;
      if (fill) g[o] = (((own || best) - 1) | F) >>> 0;
    }
  }

  // ---- surface detail
  if (style && style !== 'smooth' && n >= 40) detail(g, W, H, D, k, style, seed, (fx, fy, fz) => nb[Math.floor((fx - 1) / k) + SX * Math.floor((fy - 1) / k) + SXY * Math.floor((fz - 1) / k)]);

  // ---- mesh: fine cell (1, 1, 1) of g is model fine voxel ((x0 - 1) k, …)
  const s = vs / k;
  const geo = meshGrid(g, W - 2, H - 2, D - 2, s, pivot[0] * k - (x0 - 1) * k + 1, pivot[1] * k - (y0 - 1) * k + 1, pivot[2] * k - (z0 - 1) * k + 1);
  return { pos: geo.attributes.position.array, nor: geo.attributes.normal.array, col: geo.attributes.color.array, idx: geo.index.array };
}

// 26-neighbourhood offsets (for normals)
const N26 = [];
for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) N26.push([dx, dy, dz]);

function detail(g, W, H, D, k, style, seed, thinAt) {
  const WH = W * H;
  const off26 = N26.map(([dx, dy, dz]) => dx + W * dy + WH * dz);
  const carve = [], paint = [], bump = [];
  const sw = Math.max(3, k + 1), sh = Math.max(2, k - 1);
  const cell = Math.max(4, Math.round(k * 2.2)); // crack-plate size (fine voxels)
  for (let z = 2; z < D - 2; z++) for (let y = 2; y < H - 2; y++) {
    let i = 2 + W * y + WH * z;
    for (let x = 2; x < W - 2; x++, i++) {
      const v = g[i];
      if (!v) continue;
      if (g[i + 1] && g[i - 1] && g[i + W] && g[i - W] && g[i + WH] && g[i - WH]) continue; // inside
      const c = v & 0xffffff;
      const [lum, sat] = ls(c);
      if ((lum > 0.8 && sat < 0.22) || lum < 0.07) continue; // eyes, teeth, claws: as they are
      // outward normal: the open cells round it
      let nx = 0, ny = 0, nz = 0;
      for (let j = 0; j < 26; j++) if (!g[i + off26[j]]) { nx += N26[j][0]; ny += N26[j][1]; nz += N26[j][2]; }
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 0.5) continue;
      nx /= nl; ny /= nl; nz /= nl;
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      // the face it shows most: tangent coordinates (u, v) and the step outward
      let u, w, out;
      if (ay >= ax && ay >= az) { u = x; w = z; out = ny > 0 ? W : -W; }
      else if (ax >= az) { u = z; w = y; out = nx > 0 ? 1 : -1; }
      else { u = x; w = y; out = nz > 0 ? WH : -WH; }
      const thin = thinAt(x, y, z) <= 2;
      const h0 = hash(x, y, z, seed);
      if (style === 'scale') {
        if (thin) { if ((y + (x >> 1)) % 3 === 0) paint.push(i, mulc(c, 0.84)); continue; } // quills, crest, feathers: barbs
        if (ny < -0.5) { // belly scutes: plates across the underside
          if (((z % (sh + 2)) + sh + 2) % (sh + 2) === 0) carve.push(i, out);
          else if (((z % (sh + 2)) + sh + 2) % (sh + 2) === sh + 1) paint.push(i, mulc(c, 1.08));
          continue;
        }
        const row = Math.floor(w / sh), lv = w - row * sh;
        const uu = u + (row & 1) * (sw >> 1), col = Math.floor(uu / sw), lu = uu - col * sw;
        const tone = hash(col, row, out, seed + 9); // each scale its own shade
        if (lv === 0 && !(lu === sw >> 1 && h0 < 0.5)) carve.push(i, out); // the groove under each scale row (the tip overlaps it)
        else if (lu === 0 && lv < sh - 1) carve.push(i, out); // and between the scales of a row
        else if (lv === sh - 1 && lu > 0) paint.push(i, mulc(c, 1.12 + tone * 0.06)); // the lit upper rim
        else paint.push(i, mulc(c, 0.9 + tone * 0.14));
      } else if (style === 'stone') {
        const crystal = sat > 0.35 && lum > 0.3;
        if (crystal) {
          // facets: one flat tone per facet (normal bucket × the coarse cell it is in), bright edges
          const open = (!g[i + 1] ? 1 : 0) + (!g[i - 1] ? 1 : 0) + (!g[i + W] ? 1 : 0) + (!g[i - W] ? 1 : 0) + (!g[i + WH] ? 1 : 0) + (!g[i - WH] ? 1 : 0);
          if (open >= 2) { paint.push(i, mixc(c, 0xffffff, 0.35)); continue; }
          const b = (Math.round(nx * 2) + 3) + 7 * (Math.round(ny * 2) + 3) + 49 * (Math.round(nz * 2) + 3);
          const f = hash(b, Math.floor(x / (k * 3)), Math.floor(y / (k * 3)) + 31 * Math.floor(z / (k * 3)), seed + 5);
          paint.push(i, f < 0.3 ? mulc(c, 0.78) : f < 0.6 ? c : f < 0.85 ? mixc(c, 0xffffff, 0.18) : mixc(c, 0xffffff, 0.4));
          continue;
        }
        if (thin) { if (h0 < 0.08) paint.push(i, mulc(c, 1.25)); continue; }
        const cr = crack(x, y, z, cell, seed);
        if (cr < 0.55) { carve.push(i, out); continue; }
        if (ay < 0.6 && (((y + Math.floor(hash(x >> 3, 0, z >> 3, seed) * 3)) % (cell + 2)) === 0)) { carve.push(i, out); continue; } // strata
        if (cr < 1.1) paint.push(i, mulc(c, 0.86)); // weathered plate edges
        else if (h0 < 0.025) paint.push(i, mixc(c, 0xfff6e0, 0.45)); // mica
        else if (h0 < 0.045) paint.push(i, mulc(c, 0.6)); // dark inclusions
        else if (ny > 0.6 && h0 > 0.93) paint.push(i, mulc(c, 1.12));
      } else if (style === 'hide') {
        if (thin) continue;
        const cr = crack(x, y, z, cell + 1, seed);
        if (cr < 0.5) paint.push(i, mulc(c, 0.8)); // wrinkles
        else if (h0 < 0.018 && !g[i + out]) bump.push(i + out, mulc(c, 0.9)); // warts
        else if (h0 > 0.97) paint.push(i, mulc(c, 1.12));
      } else if (style === 'fur') {
        if (thin) continue;
        const st = ((u * 3 + w * 2) % 7 + 7) % 7;
        if (st === 0 && h0 > 0.35 && !g[i + out]) bump.push(i + out, mulc(c, 1.12)); // tufts
        else if (st === 3) paint.push(i, mulc(c, 0.85)); // partings
      } else if (style === 'chitin') {
        if (thin) { if (y % 2 === 0) paint.push(i, mulc(c, 0.85)); continue; }
        const seg = Math.max(4, k + 2);
        if (((z % seg) + seg) % seg === 0 && ay > 0.3) carve.push(i, out); // segment joints
        else if (ny > 0.55 && h0 < 0.08) paint.push(i, mixc(c, 0xffffff, 0.3)); // gloss
        else if (h0 > 0.96) carve.push(i, out); // pits
      }
    }
  }
  for (let j = 0; j < paint.length; j += 2) if (g[paint[j]]) g[paint[j]] = ((paint[j + 1] & 0xffffff) | F) >>> 0;
  for (let j = 0; j < carve.length; j += 2) {
    const i = carve[j], o = carve[j + 1];
    // only where there is something under it (a groove, not a hole), and the floor of it darker
    const under = i - o;
    if (!g[under]) continue;
    g[i] = 0;
    g[under] = ((mulc(g[under] & 0xffffff, 0.74) & 0xffffff) | F) >>> 0;
  }
  for (let j = 0; j < bump.length; j += 2) if (!g[bump[j]]) g[bump[j]] = ((bump[j + 1] & 0xffffff) | F) >>> 0;
}

/** Distance (fine voxels) to the nearest crack of a jittered-cell network (F2 − F1 / 2). */
function crack(x, y, z, cs, seed) {
  const cx = Math.floor(x / cs), cy = Math.floor(y / cs), cz = Math.floor(z / cs);
  let d1 = 1e9, d2 = 1e9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const X = cx + a, Y = cy + b, Z = cz + c;
    const px = (X + hash(X, Y, Z, seed + 1)) * cs, py = (Y + hash(X, Y, Z, seed + 2)) * cs, pz = (Z + hash(X, Y, Z, seed + 3)) * cs;
    const d = Math.hypot(px - x, py - y, pz - z);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return (d2 - d1) / 2;
}

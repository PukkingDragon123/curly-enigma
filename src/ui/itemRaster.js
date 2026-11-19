// A small software renderer for item stills (src/ui/itemVox.js): a voxel mesh lit like a toy under
// the house lamp ("Lamplight Woodcut", docs/DEV_GUIDE.md): a warm key light from the top left (and a
// little in front) with real self-shadows, a cool plum fill so nothing falls to black, a thin warm rim
// on the far edge, a soft plum shadow cast on the floor it rests on (an under-shadow where it touches,
// a longer one thrown down-right), carved inner lines where one part stands in front of another, and a
// 1px plum outline that breaks on the lit side. No gloss, no bloom: glowing voxels just get brighter.
//
//   rasterItem(M, job) → ImageData (job.size × job.size)
//     M    { P, N, C, G, I, vox } positions (model units: x/z centred, resting on y = 0), unit face
//          normals, linear colours (AO baked in), glow 0..1+ (or null), triangle indices, and the size
//          of one voxel in model units (for the carved lines)
//     job  { size, yaw, pitch, k (px per unit), ox, oy (screen px of the model origin), lift (units
//          the model floats above its floor), ground (cast the floor shadow), rimK }
//   fitItem(M, poses, size, o) → { k, ox, oy }   the scale and placement that fit every pose
//
// One renderer for every item, on the CPU: no GPU round trip, nothing borrowed from the game's
// renderer, a still costs a few ms. Callers cache what it makes.

// ------------------------------------------------------------------ the look
const LIN = (h) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return [f((h >> 16) & 255), f((h >> 8) & 255), f(h & 255)]; };
export const LOOK = {
  key: [1.0, 0.8, 0.56].map((v) => v * 1.32), // the lamp: warm, from the top left, a little in front
  fill: LIN(0x6a5288).map((v) => v * 1.05), // plum bounce from the right and below
  amb: LIN(0x4a3a52).map((v) => v * 0.55),
  rim: LIN(0xffd9a0), // a warm thin edge on the far side
  line: 0x2a1626, // outline: deep plum, never black
  lineLit: 0x5a3428, // the outline on the lit side (broken: warmer, lighter)
  shadow: [42, 22, 46], // floor shadow (plum)
};
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const KEY = norm3([-0.56, 0.68, 0.48]); // view space: x right, y up, z toward the viewer
const FILL = norm3([0.7, -0.25, 0.65]);
const DROP = norm3([-0.2, 0.93, -0.3]); // the light the floor shadow is cast by (it falls down-right)

const SRGB = new Uint8Array(4096);
for (let i = 0; i < 4096; i++) { const c = i / 4095; SRGB[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)); }
const toS = (v) => SRGB[v <= 0 ? 0 : v >= 1 ? 4095 : (v * 4095) | 0];

// ------------------------------------------------------------------ scratch buffers (one renderer)
let cap = 0, ZB, TB, BR, BG, BB, BW;
let vcap = 0, SX, SY, SZ, VX, VY, VZ;
let tcap = 0, TNX, TNY, TNZ;
function grow(n, nv, nt) {
  if (n > cap) { cap = n; ZB = new Float32Array(n); TB = new Int32Array(n); BR = new Float32Array(n); BG = new Float32Array(n); BB = new Float32Array(n); BW = new Float32Array(n); }
  if (nv > vcap) { vcap = nv; SX = new Float32Array(nv); SY = new Float32Array(nv); SZ = new Float32Array(nv); VX = new Float32Array(nv); VY = new Float32Array(nv); VZ = new Float32Array(nv); }
  if (nt > tcap) { tcap = nt; TNX = new Float32Array(nt); TNY = new Float32Array(nt); TNZ = new Float32Array(nt); }
}

/** The view rotation: yaw about the upright, then pitch (looking down at it). */
function rot(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // x' = x cy + z sy ; z1 = -x sy + z cy ; y' = y cp - z1 sp ; z' = y sp + z1 cp
  return { cy, sy, cp, sp };
}
const rx = (R, x, y, z) => x * R.cy + z * R.sy;
const ry = (R, x, y, z) => y * R.cp - (-x * R.sy + z * R.cy) * R.sp;
const rz = (R, x, y, z) => y * R.sp + (-x * R.sy + z * R.cy) * R.cp;

// ------------------------------------------------------------------ shadow maps
const SM = 160;
let SMAP = new Float32Array(SM * SM);
/** A depth map seen from direction L (view space): the depth toward the light of the nearest surface. */
function shadowMap(nv, I, nt, L, out) {
  // light basis: U, V across the beam, L along it
  const up = Math.abs(L[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let U = [up[1] * L[2] - up[2] * L[1], up[2] * L[0] - up[0] * L[2], up[0] * L[1] - up[1] * L[0]];
  U = norm3(U);
  const V = [L[1] * U[2] - L[2] * U[1], L[2] * U[0] - L[0] * U[2], L[0] * U[1] - L[1] * U[0]];
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  const LU = new Float32Array(nv), LV = new Float32Array(nv), LD = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    const x = VX[i], y = VY[i], z = VZ[i];
    const u = x * U[0] + y * U[1] + z * U[2], v = x * V[0] + y * V[1] + z * V[2];
    LU[i] = u; LV[i] = v; LD[i] = x * L[0] + y * L[1] + z * L[2];
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  const pad = 0.04 * Math.max(u1 - u0, v1 - v0) + 1e-4;
  u0 -= pad; v0 -= pad; u1 += pad; v1 += pad;
  const s = (SM - 1) / Math.max(u1 - u0, v1 - v0);
  const D = out || new Float32Array(SM * SM);
  D.fill(-1e9);
  for (let i = 0; i < nv; i++) { LU[i] = (LU[i] - u0) * s; LV[i] = (LV[i] - v0) * s; }
  for (let t = 0; t < nt * 3; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ax = LU[a], ay = LV[a], bx = LU[b], by = LV[b], cx = LU[c], cy = LV[c];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) continue;
    const inv = 1 / area;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(SM - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(SM - 1, Math.ceil(Math.max(ay, by, cy)));
    const da = LD[a], db = LD[b], dc = LD[c];
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const qx = px + 0.5, qy = py + 0.5;
      let wa = ((cx - bx) * (qy - by) - (cy - by) * (qx - bx)) * inv;
      let wb = ((ax - cx) * (qy - cy) - (ay - cy) * (qx - cx)) * inv;
      const wc = 1 - wa - wb;
      // both windings (the light sees back faces too); a hair of slack so seams don't leak
      if (wa < -0.02 || wb < -0.02 || wc < -0.02) continue;
      const d = wa * da + wb * db + wc * dc, p = py * SM + px;
      if (d > D[p]) D[p] = d;
    }
  }
  return { D, U, V, L, u0, v0, s };
}
/** Fraction of light reaching view-space point p from map S (PCF over a (2r+1)² block). */
function lit(S, x, y, z, bias, r = 1) {
  const u = ((x * S.U[0] + y * S.U[1] + z * S.U[2]) - S.u0) * S.s, v = ((x * S.V[0] + y * S.V[1] + z * S.V[2]) - S.v0) * S.s;
  const d = x * S.L[0] + y * S.L[1] + z * S.L[2] + bias;
  const iu = Math.floor(u), iv = Math.floor(v);
  let n = 0, k = 0;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const X = iu + i, Y = iv + j;
    n++;
    if (X < 0 || Y < 0 || X >= SM || Y >= SM) { k++; continue; }
    if (S.D[Y * SM + X] <= d) k++;
  }
  return k / n;
}

// ------------------------------------------------------------------ fitting
/** Screen bounds (in model units, relative to the origin) of a pose, its floor shadow included. */
function boundsAt(M, yaw, pitch, lift = 0, withShadow = true) {
  const R = rot(yaw, pitch), P = M.P, n = P.length / 3;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  // the floor shadow: each point dropped to the floor along DROP (in the model's frame)
  const Dm = toModel(R, DROP);
  const step = Math.max(1, Math.floor(n / 6000)); // (a sample is plenty for big meshes)
  for (let i = 0; i < n; i += step) {
    const x = P[i * 3], y = P[i * 3 + 1] + lift, z = P[i * 3 + 2];
    const sx = rx(R, x, y, z), sy = ry(R, x, y, z);
    if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    if (withShadow && Dm[1] > 0.2) {
      const t = y / Dm[1];
      const gx = x - Dm[0] * t, gz = z - Dm[2] * t;
      const qx = rx(R, gx, 0, gz), qy = ry(R, gx, 0, gz);
      // (count the shadow's reach only partly: a little of it may tuck under the slot's edge)
      const ax = sx + (qx - sx) * 0.8, ay = sy + (qy - sy) * 0.8;
      if (ax < x0) x0 = ax; if (ax > x1) x1 = ax; if (ay < y0) y0 = ay; if (ay > y1) y1 = ay;
    }
  }
  return { x0, x1, y0, y1 };
}
/** A view-space direction in the model's frame (inverse of rot). */
function toModel(R, d) {
  // inverse pitch: y = y' cp + z' sp ; z1 = -y' sp + z' cp ; inverse yaw: x = x' cy - z1 sy ; z = x' sy + z1 cy
  const y = d[1] * R.cp + d[2] * R.sp, z1 = -d[1] * R.sp + d[2] * R.cp;
  return [d[0] * R.cy - z1 * R.sy, y, d[0] * R.sy + z1 * R.cy];
}
/**
 * Scale and placement that fit every pose in poses ([{yaw, pitch, lift}]) into size px, leaving
 * o.pad px round the edge (the outline needs one). Centred on the union of the poses' bounds.
 */
export function fitItem(M, poses, size, o = {}) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of poses) {
    const b = boundsAt(M, p.yaw, p.pitch, p.lift || 0, o.shadow !== false);
    x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1);
  }
  const pad = o.pad ?? 2;
  const room = size - pad * 2;
  const k = Math.min(room / Math.max(1e-6, x1 - x0), room / Math.max(1e-6, y1 - y0)) * (o.fill ?? 1);
  return { k, ox: size / 2 - ((x0 + x1) / 2) * k, oy: size / 2 + ((y0 + y1) / 2) * k };
}

// ------------------------------------------------------------------ drawing
/** Draw M as job poses it into a new ImageData (see the header). */
export function rasterItem(M, job) {
  const S = job.size | 0, N2 = S * S;
  const P = M.P, Nn = M.N, C = M.C, G = M.G, I = M.I;
  const nv = P.length / 3, nt = I.length / 3;
  grow(N2, nv, nt);
  const R = rot(job.yaw, job.pitch), k = job.k, ox = job.ox, oy = job.oy, lift = job.lift || 0;
  // view space (model units) and screen space
  for (let i = 0, o = 0; i < nv; i++, o += 3) {
    const x = P[o], y = P[o + 1] + lift, z = P[o + 2];
    const vx = rx(R, x, y, z), vy = ry(R, x, y, z), vz = rz(R, x, y, z);
    VX[i] = vx; VY[i] = vy; VZ[i] = vz;
    SX[i] = ox + vx * k; SY[i] = oy - vy * k; SZ[i] = vz;
  }
  // face normals in view space (voxel faces are flat: the first vertex's normal serves)
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3] * 3;
    const x = Nn[a], y = Nn[a + 1], z = Nn[a + 2];
    TNX[t] = rx(R, x, y, z); TNY[t] = ry(R, x, y, z); TNZ[t] = rz(R, x, y, z);
  }
  ZB.fill(-1e9, 0, N2); TB.fill(-1, 0, N2);
  // ---- the z-buffered pass: colour (AO baked) and glow per pixel
  for (let t = 0; t < nt; t++) {
    if (TNZ[t] <= 0.0005) continue; // facing away
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const ax = SX[a], ay = SY[a], bx = SX[b], by = SY[b], cx = SX[c], cy = SY[c];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) continue;
    const inv = 1 / area;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by, cy)));
    if (x0 > x1 || y0 > y1) continue;
    const za = SZ[a], zb = SZ[b], zc = SZ[c];
    const a3 = a * 3, b3 = b * 3, c3 = c * 3;
    const ga = G ? G[a] : 0, gb = G ? G[b] : 0, gc = G ? G[c] : 0;
    for (let py = y0; py <= y1; py++) {
      const qy = py + 0.5;
      for (let px = x0; px <= x1; px++) {
        const qx = px + 0.5;
        const wa = ((cx - bx) * (qy - by) - (cy - by) * (qx - bx)) * inv;
        if (wa < 0) continue;
        const wb = ((ax - cx) * (qy - cy) - (ay - cy) * (qx - cx)) * inv;
        if (wb < 0) continue;
        const wc = 1 - wa - wb;
        if (wc < 0) continue;
        const z = wa * za + wb * zb + wc * zc, p = py * S + px;
        if (z <= ZB[p]) continue;
        ZB[p] = z; TB[p] = t;
        BR[p] = wa * C[a3] + wb * C[b3] + wc * C[c3];
        BG[p] = wa * C[a3 + 1] + wb * C[b3 + 1] + wc * C[c3 + 1];
        BB[p] = wa * C[a3 + 2] + wb * C[b3 + 2] + wc * C[c3 + 2];
        BW[p] = wa * ga + wb * gb + wc * gc;
      }
    }
  }
  // ---- shadows: the key light's (on the model) and the drop light's (on the floor)
  const vox = M.vox || 0.03;
  const keyMap = shadowMap(nv, I, nt, KEY, SMAP);
  const bias = vox * 0.9 + 1.5 / keyMap.s;
  const img = new ImageData(S, S), o8 = img.data;
  const L = LOOK;
  const rimK = job.rimK ?? 0.42;
  for (let p = 0; p < N2; p++) {
    const t = TB[p];
    if (t < 0) continue;
    const px = p % S, py = (p / S) | 0;
    const vx = (px + 0.5 - ox) / k, vy = (oy - (py + 0.5)) / k, vz = ZB[p];
    const nx = TNX[t], ny = TNY[t], nz = TNZ[t];
    let kd = nx * KEY[0] + ny * KEY[1] + nz * KEY[2];
    if (kd > 0) {
      // nudge the sample off the face before testing it (no acne on flat faces)
      const sh = lit(keyMap, vx + nx * vox * 0.5, vy + ny * vox * 0.5, vz + nz * vox * 0.5, bias, 1);
      kd *= sh < 0.34 ? 0.12 : sh < 0.75 ? 0.55 : 1; // stepped: lit, half, shaded (woodcut tones)
    } else kd = 0;
    // three steps of key light per face, not a smooth ramp
    kd = kd > 0.72 ? 1 : kd > 0.4 ? 0.68 : kd > 0.12 ? 0.38 : kd > 0 ? 0.12 : 0;
    const fd = Math.max(0, nx * FILL[0] + ny * FILL[1] + nz * FILL[2]) * 0.6 + 0.4;
    const lr = L.amb[0] + L.key[0] * kd + L.fill[0] * fd, lg = L.amb[1] + L.key[1] * kd + L.fill[1] * fd, lb = L.amb[2] + L.key[2] * kd + L.fill[2] * fd;
    const gw = BW[p];
    let r = BR[p] * (lr + gw * 1.6), g = BG[p] * (lg + gw * 1.6), b = BB[p] * (lb + gw * 1.6);
    // rim: the far (right) edge of the silhouette catches a thin warm line
    if (rimK > 0 && px < S - 1 && (TB[p + 1] < 0 || ZB[p + 1] < vz - vox * 3) && nx > -0.3) {
      r += L.rim[0] * rimK * 0.5; g += L.rim[1] * rimK * 0.5; b += L.rim[2] * rimK * 0.5;
      r = r * (1 - rimK * 0.3) + BR[p] * L.rim[0] * rimK * 0.3; g = g * (1 - rimK * 0.3) + BG[p] * L.rim[1] * rimK * 0.3; b = b * (1 - rimK * 0.3) + BB[p] * L.rim[2] * rimK * 0.3;
    }
    const q = p * 4;
    o8[q] = toS(r); o8[q + 1] = toS(g); o8[q + 2] = toS(b); o8[q + 3] = 255;
  }
  // ---- carved lines: where a part stands well in front of what's behind it, the far side darkens
  const gap = vox * 2.2;
  const darken = (q, f) => { o8[q] = (o8[q] * f + 0x2a * (1 - f) * 0.5) | 0; o8[q + 1] = (o8[q + 1] * f + 0x16 * (1 - f) * 0.5) | 0; o8[q + 2] = (o8[q + 2] * f + 0x26 * (1 - f) * 0.5) | 0; };
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const p = py * S + px;
    if (TB[p] < 0) continue;
    const z = ZB[p];
    const l = px > 0 ? p - 1 : -1, u = py > 0 ? p - S : -1, r = px < S - 1 ? p + 1 : -1, d = py < S - 1 ? p + S : -1;
    if ((l >= 0 && TB[l] >= 0 && ZB[l] - z > gap) || (u >= 0 && TB[u] >= 0 && ZB[u] - z > gap) || (r >= 0 && TB[r] >= 0 && ZB[r] - z > gap) || (d >= 0 && TB[d] >= 0 && ZB[d] - z > gap)) darken(p * 4, 0.55);
  }
  // ---- the floor shadow (behind everything: only where the model isn't)
  if (job.ground !== false) {
    const dropMap = shadowMap(nv, I, nt, DROP, null);
    // the floor plane y = 0 (model) in view space: normal n_g, through the origin
    const ng = [rx(R, 0, 1, 0), ry(R, 0, 1, 0), rz(R, 0, 1, 0)];
    if (ng[2] > 0.08) {
      const SH = L.shadow;
      const dbias = 1.2 / dropMap.s;
      for (let p = 0; p < N2; p++) {
        if (TB[p] >= 0) continue;
        const px = p % S, py = (p / S) | 0;
        const vx = (px + 0.5 - ox) / k, vy = (oy - (py + 0.5)) / k;
        const vz = -(ng[0] * vx + ng[1] * vy) / ng[2];
        const near = lit(dropMap, vx, vy, vz, dbias, 1);
        if (near > 0.97) {
          const far = lit(dropMap, vx, vy, vz, dbias, 3);
          if (far > 0.9) continue;
          const q = p * 4;
          o8[q] = SH[0]; o8[q + 1] = SH[1]; o8[q + 2] = SH[2]; o8[q + 3] = 34; // penumbra
          continue;
        }
        const q = p * 4;
        o8[q] = SH[0]; o8[q + 1] = SH[1]; o8[q + 2] = SH[2]; o8[q + 3] = near < 0.4 ? 96 : 66;
      }
    }
  }
  // ---- the outline: 1px of plum round the silhouette, lighter and broken where the lamp hits
  const line = L.line, lineLit = L.lineLit;
  const add = [];
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const p = py * S + px;
    if (TB[p] >= 0) continue;
    const R1 = px < S - 1 && TB[p + 1] >= 0, D1 = py < S - 1 && TB[p + S] >= 0, L1 = px > 0 && TB[p - 1] >= 0, U1 = py > 0 && TB[p - S] >= 0;
    if (!(R1 || D1 || L1 || U1)) continue;
    // the lit side: the model lies to the right of / below this pixel and nothing on the shaded side
    const litSide = (R1 || D1) && !L1 && !U1;
    if (litSide && ((px + py) % 3 === 0)) continue; // broken
    add.push(p, litSide ? 1 : 0);
  }
  for (let i = 0; i < add.length; i += 2) {
    const q = add[i] * 4, c = add[i + 1] ? lineLit : line;
    o8[q] = (c >> 16) & 255; o8[q + 1] = (c >> 8) & 255; o8[q + 2] = c & 255; o8[q + 3] = 255;
  }
  return img;
}

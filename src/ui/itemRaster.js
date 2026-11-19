// The item renderer (src/ui/itemVox.js): a voxel model drawn as a small pixel sprite, so the 3D items
// sit in the hand-drawn UI as pixel art, not as smooth renders ("HAND-DRAWN FIRST", docs/DEV_GUIDE.md):
//   - a low resolution (24-32 px a side), shown at a whole multiple with nearest-neighbour scaling
//   - flat, clean light: one warm key from the top left (lit / turned / shaded faces, the key's own
//     shadows stepped, never smooth), a plum fill so shadow is plum, never black; no rim, no gloss,
//     no bloom (a glowing voxel is just a lighter colour)
//   - drawn 4x over and boiled down: each sprite pixel takes the average of what it covers, then the
//     sprite is reduced to a few colours (its palette, kept for its sway frames so they don't flicker),
//     which leaves clean clusters instead of the models' fine speckle
//   - a 1px outline (plum; a warm brown along the lit top-left), a dark line where a part stands in
//     front of another, and one flat plum shadow on the floor under it
//
//   rasterItem(M, job) → { img: ImageData, pal }
//     M    { P, N, C, G, I, vox } positions (model units: x/z centred, resting on y = 0), face normals,
//          linear colours, glow (or null), triangle indices, one voxel's size in model units
//     job  { size, yaw, pitch, k (sprite px per unit), ox, oy (sprite px of the origin), lift, ground,
//          pal (a palette to reuse: the still's, for its frames) }
//   fitItem(M, poses, size, o) → { k, ox, oy }

const LIN = (h) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return [f((h >> 16) & 255), f((h >> 8) & 255), f(h & 255)]; };
export const LOOK = {
  key: [1.0, 0.84, 0.62].map((v) => v * 1.18), // the lamp
  fill: LIN(0x6c5480).map((v) => v * 0.95), // plum
  line: [42, 22, 38], // outline: deep plum
  lineLit: [74, 42, 30], // along the lit top-left: a warm dark brown
  shadow: [46, 24, 48, 92], // the floor shadow: plum, one tone
};
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const KEY = norm3([-0.56, 0.68, 0.48]); // view space: x right, y up, z toward the viewer
const FILL = norm3([0.6, -0.2, 0.7]);
const DROP = norm3([-0.18, 0.94, -0.28]); // what the floor shadow is cast by (it falls a little down-right)
const SS = 4; // drawn this many times over, then boiled down

const SRGB = new Uint8Array(4096);
for (let i = 0; i < 4096; i++) { const c = i / 4095; SRGB[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)); }
const toS = (v) => SRGB[v <= 0 ? 0 : v >= 1 ? 4095 : (v * 4095) | 0];

// ------------------------------------------------------------------ scratch (one renderer)
let cap = 0, ZB, TB, LR, LG, LB;
let vcap = 0, SX, SY, SZ, VX, VY, VZ;
let tcap = 0, TNX, TNY, TNZ;
function grow(n, nv, nt) {
  if (n > cap) { cap = n; ZB = new Float32Array(n); TB = new Int32Array(n); LR = new Float32Array(n); LG = new Float32Array(n); LB = new Float32Array(n); }
  if (nv > vcap) { vcap = nv; SX = new Float32Array(nv); SY = new Float32Array(nv); SZ = new Float32Array(nv); VX = new Float32Array(nv); VY = new Float32Array(nv); VZ = new Float32Array(nv); }
  if (nt > tcap) { tcap = nt; TNX = new Float32Array(nt); TNY = new Float32Array(nt); TNZ = new Float32Array(nt); }
}
function rot(yaw, pitch) { return { cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch) }; }
const rx = (R, x, y, z) => x * R.cy + z * R.sy;
const ry = (R, x, y, z) => y * R.cp - (-x * R.sy + z * R.cy) * R.sp;
const rz = (R, x, y, z) => y * R.sp + (-x * R.sy + z * R.cy) * R.cp;
function toModel(R, d) {
  const y = d[1] * R.cp + d[2] * R.sp, z1 = -d[1] * R.sp + d[2] * R.cp;
  return [d[0] * R.cy - z1 * R.sy, y, d[0] * R.sy + z1 * R.cy];
}

// ------------------------------------------------------------------ shadow maps
const SM = 128;
const SMAP = new Float32Array(SM * SM), DMAP = new Float32Array(SM * SM);
function shadowMap(nv, I, nt, L, D) {
  const up = Math.abs(L[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const U = norm3([up[1] * L[2] - up[2] * L[1], up[2] * L[0] - up[0] * L[2], up[0] * L[1] - up[1] * L[0]]);
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
      const wa = ((cx - bx) * (qy - by) - (cy - by) * (qx - bx)) * inv;
      const wb = ((ax - cx) * (qy - cy) - (ay - cy) * (qx - cx)) * inv;
      const wc = 1 - wa - wb;
      if (wa < -0.02 || wb < -0.02 || wc < -0.02) continue;
      const d = wa * da + wb * db + wc * dc, p = py * SM + px;
      if (d > D[p]) D[p] = d;
    }
  }
  return { D, U, V, L, u0, v0, s };
}
function lit(S, x, y, z, bias) {
  const u = ((x * S.U[0] + y * S.U[1] + z * S.U[2]) - S.u0) * S.s, v = ((x * S.V[0] + y * S.V[1] + z * S.V[2]) - S.v0) * S.s;
  const d = x * S.L[0] + y * S.L[1] + z * S.L[2] + bias;
  const iu = Math.floor(u), iv = Math.floor(v);
  let k = 0;
  for (let j = 0; j <= 1; j++) for (let i = 0; i <= 1; i++) {
    const X = iu + i, Y = iv + j;
    if (X < 0 || Y < 0 || X >= SM || Y >= SM || S.D[Y * SM + X] <= d) k++;
  }
  return k / 4;
}

// ------------------------------------------------------------------ fitting
function boundsAt(M, yaw, pitch, lift = 0, withShadow = true) {
  const R = rot(yaw, pitch), P = M.P, n = P.length / 3;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const Dm = toModel(R, DROP);
  const step = Math.max(1, Math.floor(n / 6000));
  for (let i = 0; i < n; i += step) {
    const x = P[i * 3], y = P[i * 3 + 1] + lift, z = P[i * 3 + 2];
    const sx = rx(R, x, y, z), sy = ry(R, x, y, z);
    if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    if (withShadow && Dm[1] > 0.2) {
      const t = y / Dm[1], gx = x - Dm[0] * t, gz = z - Dm[2] * t;
      const qx = rx(R, gx, 0, gz), qy = ry(R, gx, 0, gz);
      const ax = sx + (qx - sx) * 0.5, ay = sy + (qy - sy) * 0.5;
      if (ax < x0) x0 = ax; if (ax > x1) x1 = ax; if (ay < y0) y0 = ay; if (ay > y1) y1 = ay;
    }
  }
  return { x0, x1, y0, y1 };
}
/** Scale and placement fitting every pose into size px with pad px to spare (the outline's). */
export function fitItem(M, poses, size, o = {}) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of poses) {
    const b = boundsAt(M, p.yaw, p.pitch, p.lift || 0, o.shadow !== false);
    x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1);
  }
  const pad = o.pad ?? 1;
  const room = size - pad * 2;
  const k = Math.min(room / Math.max(1e-6, x1 - x0), room / Math.max(1e-6, y1 - y0));
  // whole pixels for the origin: the sprite doesn't creep between frames
  return { k, ox: Math.round(size / 2 - ((x0 + x1) / 2) * k), oy: Math.round(size / 2 + ((y0 + y1) / 2) * k) };
}

// ------------------------------------------------------------------ the palette
/** Median cut: up to n colours ([r, g, b] 0..255) for a list of colours. */
function medianCut(cols, n) {
  if (!cols.length) return [];
  let boxes = [cols];
  while (boxes.length < n) {
    let bi = -1, bestR = -1, ax = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let a = 0; a < 3; a++) {
        let lo = 255, hi = 0;
        for (const c of b) { if (c[a] < lo) lo = c[a]; if (c[a] > hi) hi = c[a]; }
        const r = (hi - lo) * (a === 1 ? 1.2 : 1);
        if (r > bestR) { bestR = r; bi = i; ax = a; }
      }
    });
    if (bi < 0 || bestR < 10) break;
    const b = boxes[bi].sort((p, q) => p[ax] - q[ax]);
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map((b) => { const s = [0, 0, 0]; for (const c of b) { s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; } return s.map((v) => Math.round(v / b.length)); });
}
const near = (pal, r, g, b) => { let bi = 0, bd = 1e9; for (let i = 0; i < pal.length; i++) { const p = pal[i], d = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.5 + (p[2] - b) ** 2 * 0.2; if (d < bd) { bd = d; bi = i; } } return pal[bi]; };

// ------------------------------------------------------------------ drawing
/** Draw M as job poses it: { img: ImageData (job.size²), pal (the colours it used) }. */
export function rasterItem(M, job) {
  const S = job.size | 0, H = S * SS, N2 = H * H;
  const P = M.P, Nn = M.N, C = M.C, G = M.G, I = M.I;
  const nv = P.length / 3, nt = I.length / 3;
  grow(N2, nv, nt);
  const R = rot(job.yaw, job.pitch), k = job.k * SS, ox = job.ox * SS, oy = job.oy * SS, lift = job.lift || 0;
  for (let i = 0, o = 0; i < nv; i++, o += 3) {
    const x = P[o], y = P[o + 1] + lift, z = P[o + 2];
    const vx = rx(R, x, y, z), vy = ry(R, x, y, z), vz = rz(R, x, y, z);
    VX[i] = vx; VY[i] = vy; VZ[i] = vz;
    SX[i] = ox + vx * k; SY[i] = oy - vy * k; SZ[i] = vz;
  }
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3] * 3, x = Nn[a], y = Nn[a + 1], z = Nn[a + 2];
    TNX[t] = rx(R, x, y, z); TNY[t] = ry(R, x, y, z); TNZ[t] = rz(R, x, y, z);
  }
  ZB.fill(-1e9, 0, N2); TB.fill(-1, 0, N2);
  // ---- the z-buffered pass (4x over): base colour and glow, lit below
  for (let t = 0; t < nt; t++) {
    if (TNZ[t] <= 0.0005) continue;
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const ax = SX[a], ay = SY[a], bx = SX[b], by = SY[b], cx = SX[c], cy = SY[c];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) continue;
    const inv = 1 / area;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(H - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    if (x0 > x1 || y0 > y1) continue;
    const za = SZ[a], zb = SZ[b], zc = SZ[c], a3 = a * 3, b3 = b * 3, c3 = c * 3;
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
        const z = wa * za + wb * zb + wc * zc, p = py * H + px;
        if (z <= ZB[p]) continue;
        ZB[p] = z; TB[p] = t;
        // (glow rides in the colour's spare: lifted toward its own light colour below)
        LR[p] = wa * C[a3] + wb * C[b3] + wc * C[c3];
        LG[p] = wa * C[a3 + 1] + wb * C[b3 + 1] + wc * C[c3 + 1];
        LB[p] = (wa * C[a3 + 2] + wb * C[b3 + 2] + wc * C[c3 + 2]) + Math.floor((wa * ga + wb * gb + wc * gc) * 4) * 8;
      }
    }
  }
  // ---- flat light: key (lit / turned / shaded, its own shadows stepped) + plum fill
  const vox = M.vox || 0.03;
  const keyMap = shadowMap(nv, I, nt, KEY, SMAP);
  const bias = vox * 0.9 + 1.5 / keyMap.s;
  const L = LOOK;
  for (let p = 0; p < N2; p++) {
    const t = TB[p];
    if (t < 0) continue;
    const px = p % H, py = (p / H) | 0;
    const vx = (px + 0.5 - ox) / k, vy = (oy - (py + 0.5)) / k, vz = ZB[p];
    const nx = TNX[t], ny = TNY[t], nz = TNZ[t];
    let kd = nx * KEY[0] + ny * KEY[1] + nz * KEY[2];
    if (kd > 0.05) kd *= lit(keyMap, vx + nx * vox * 0.5, vy + ny * vox * 0.5, vz + nz * vox * 0.5, bias) < 0.5 ? 0 : 1;
    kd = kd > 0.66 ? 1 : kd > 0.3 ? 0.62 : kd > 0.05 ? 0.3 : 0;
    const fd = 0.55 + 0.45 * Math.max(0, nx * FILL[0] + ny * FILL[1] + nz * FILL[2]);
    let gl = Math.floor(LB[p] / 8);
    let bb = LB[p] - gl * 8;
    const g4 = gl / 4;
    const lr = L.key[0] * kd + L.fill[0] * fd + g4 * 0.9, lg = L.key[1] * kd + L.fill[1] * fd + g4 * 0.9, lb = L.key[2] * kd + L.fill[2] * fd + g4 * 0.9;
    LR[p] *= lr; LG[p] *= lg; LB[p] = bb * lb;
  }
  // ---- boil down to the sprite: coverage, average colour, nearest depth
  const n2 = S * S;
  const cov = new Uint8Array(n2), sr = new Float32Array(n2), sg = new Float32Array(n2), sb = new Float32Array(n2), sz = new Float32Array(n2).fill(-1e9);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let n = 0, r = 0, g = 0, b = 0, z = -1e9;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const p = (y * SS + j) * H + x * SS + i;
      if (TB[p] < 0) continue;
      n++; r += LR[p]; g += LG[p]; b += LB[p];
      if (ZB[p] > z) z = ZB[p];
    }
    const q = y * S + x;
    cov[q] = n;
    if (n) { sr[q] = r / n; sg[q] = g / n; sb[q] = b / n; sz[q] = z; }
  }
  const on = new Uint8Array(n2);
  const need = Math.ceil(SS * SS * 0.38);
  for (let q = 0; q < n2; q++) on[q] = cov[q] >= need ? 1 : 0;
  // a lone pixel or a one-pixel spur reads as dirt: keep only pixels with a neighbour
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const q = y * S + x;
    if (!on[q]) continue;
    const nb = (x > 0 && on[q - 1]) + (x < S - 1 && on[q + 1]) + (y > 0 && on[q - S]) + (y < S - 1 && on[q + S]);
    if (nb === 0) on[q] = 0;
  }
  // ---- a few colours (the still's palette carries to its frames)
  const out = new ImageData(S, S), o8 = out.data;
  const rgbs = [];
  for (let q = 0; q < n2; q++) if (on[q]) rgbs.push([toS(sr[q]), toS(sg[q]), toS(sb[q])]);
  const pal = job.pal && job.pal.length ? job.pal : medianCut(rgbs.slice(), job.colors ?? 6);
  for (let q = 0; q < n2; q++) {
    if (!on[q]) continue;
    const c = near(pal, toS(sr[q]), toS(sg[q]), toS(sb[q]));
    o8[q * 4] = c[0]; o8[q * 4 + 1] = c[1]; o8[q * 4 + 2] = c[2]; o8[q * 4 + 3] = 255;
  }
  // ---- tidy the clusters: a pixel unlike all four neighbours takes the colour most of them share
  const same = (a, b) => o8[a] === o8[b] && o8[a + 1] === o8[b + 1] && o8[a + 2] === o8[b + 2];
  for (let pass = 0; pass < 2; pass++) {
    const fix = [];
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      const q = y * S + x;
      if (!on[q]) continue;
      const nb = [q - 1, q + 1, q - S, q + S].filter((n) => on[n]);
      if (nb.length < 3 || nb.some((n) => same(n * 4, q * 4))) continue;
      let best = -1, bc = 0;
      for (const n of nb) { let c = 0; for (const m of nb) if (same(n * 4, m * 4)) c++; if (c > bc) { bc = c; best = n; } }
      if (bc >= 2) fix.push(q, best);
    }
    for (let i = 0; i < fix.length; i += 2) { const a = fix[i] * 4, b = fix[i + 1] * 4; o8[a] = o8[b]; o8[a + 1] = o8[b + 1]; o8[a + 2] = o8[b + 2]; }
  }
  // ---- the dark line where a part stands well in front of what's behind it
  const gap = Math.max(vox * 4, 0.12);
  const dark = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const q = y * S + x;
    if (!on[q]) continue;
    const z = sz[q];
    if ((x > 0 && on[q - 1] && sz[q - 1] - z > gap) || (y > 0 && on[q - S] && sz[q - S] - z > gap) || (x < S - 1 && on[q + 1] && sz[q + 1] - z > gap) || (y < S - 1 && on[q + S] && sz[q + S] - z > gap)) dark.push(q);
  }
  for (const q of dark) {
    // the darkest palette colour near it (stays in the sprite's palette)
    const r = o8[q * 4], g = o8[q * 4 + 1], b = o8[q * 4 + 2];
    let best = null, bd = 1e9;
    for (const c of pal) { const lum = c[0] * 0.3 + c[1] * 0.5 + c[2] * 0.2, l0 = r * 0.3 + g * 0.5 + b * 0.2; if (lum >= l0 - 8) continue; const d = (c[0] - r * 0.6) ** 2 + (c[1] - g * 0.6) ** 2 + (c[2] - b * 0.6) ** 2; if (d < bd) { bd = d; best = c; } }
    const c = best || L.line;
    o8[q * 4] = c[0]; o8[q * 4 + 1] = c[1]; o8[q * 4 + 2] = c[2];
  }
  // ---- the floor shadow: one flat plum tone (drawn first under the outline)
  if (job.ground !== false) {
    const ng = [rx(R, 0, 1, 0), ry(R, 0, 1, 0), rz(R, 0, 1, 0)];
    if (ng[2] > 0.08) {
      const dropMap = shadowMap(nv, I, nt, DROP, DMAP);
      const dbias = 1.2 / dropMap.s;
      const ks = job.k;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const q = y * S + x;
        if (on[q]) continue;
        const vx = (x + 0.5 - job.ox) / ks, vy = (job.oy - (y + 0.5)) / ks;
        const vz = -(ng[0] * vx + ng[1] * vy) / ng[2];
        if (lit(dropMap, vx, vy, vz, dbias) > 0.5) continue;
        const sh = L.shadow;
        o8[q * 4] = sh[0]; o8[q * 4 + 1] = sh[1]; o8[q * 4 + 2] = sh[2]; o8[q * 4 + 3] = sh[3];
      }
    }
  }
  // ---- the outline: 1px plum round the silhouette, warm brown along the lit top-left
  const add = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const q = y * S + x;
    if (on[q]) continue;
    const r1 = x < S - 1 && on[q + 1], d1 = y < S - 1 && on[q + S], l1 = x > 0 && on[q - 1], u1 = y > 0 && on[q - S];
    if (!(r1 || d1 || l1 || u1)) continue;
    add.push(q, (r1 || d1) && !l1 && !u1 ? 1 : 0);
  }
  for (let i = 0; i < add.length; i += 2) {
    const q = add[i] * 4, c = add[i + 1] ? L.lineLit : L.line;
    o8[q] = c[0]; o8[q + 1] = c[1]; o8[q + 2] = c[2]; o8[q + 3] = 255;
  }
  return { img: out, pal };
}

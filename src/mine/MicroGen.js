// On-demand pixel generation for mine chunks. MineGen builds a cheap world "plan" (cell
// materials, smooth noise fields sampled every 8 px, feature lists); this turns one
// 256×256 chunk of that plan into pixels the first time something needs it.
import { B } from './blocks.js';
import { M, CPX, ORE_BASE, STAIN_BASE, D_CRUST, D_GROWTH, MAT, GRAN, texel, tn, ih } from './micro.js';
import { UNGEN } from './MineWorld.js';

export const NODE = 8; // pixel spacing of the plan's noise-field nodes
const PAD = 3; // generated margin around the chunk (for surface flags)
const SZ = CPX + PAD * 2;
// no moss on these
const NOGROW = new Uint8Array(256);
for (const m of [B.CRYSTALROCK, B.ICE, B.MAGMAROCK, B.BOARDS, B.OBSIDIAN]) NOGROW[m] = 1;

export class ChunkGen {
  /**
   * plan: { seed, cellMat: Uint8Array(W*H), mode: 'caves'|'mask', T, C, A, WX, WY (node fields),
   *         tunnel, cavern, region: {x0,y0,x1,y1} (cells where caves may open), features: [], growth }
   */
  constructor(world, plan) {
    this.w = world;
    this.p = plan;
    this.NW = Math.floor(world.MW / NODE) + 1;
    this.NH = Math.floor(world.MH / NODE) + 1;
    this.tm = new Uint8Array(SZ * SZ);
    this.td = new Uint8Array(SZ * SZ);
    this.tb = new Uint8Array(SZ * SZ);
    this.seedOf = new Uint32Array(256);
    for (let m = 0; m < 256; m++) this.seedOf[m] = (ih(m, plan.seed, 5) & 0xffff) + 1;
    this.texel = (m, x, y) => texel(m, x, y, this.seedOf[m]);
    this.count = 0;
  }

  /** Is pixel (x, y) open in the plan (before features)? Used by feature placement. */
  planAir(x, y) {
    const p = this.p, NW = this.NW;
    const fx = x / NODE, fy = y / NODE;
    const i = Math.max(0, Math.min(NW - 2, Math.floor(fx))), j = Math.max(0, Math.min(this.NH - 2, Math.floor(fy)));
    const tx = fx - i, ty = fy - j, k = j * NW + i;
    const lerp2 = (F) => { const a = F[k] + (F[k + 1] - F[k]) * tx, b = F[k + NW] + (F[k + NW + 1] - F[k + NW]) * tx; return a + (b - a) * ty; };
    const cx = x / M, cy = y / M, R = p.region;
    if (cx < R.x0 || cx >= R.x1 || cy < R.y0 || cy >= R.y1) return false;
    if (p.mode === 'mask') return lerp2(p.A) > 0.5;
    return Math.abs(lerp2(p.T)) < p.tunnel || lerp2(p.C) > p.cavern;
  }

  chunk(cx, cy) {
    const w = this.w, p = this.p;
    const gi = cy * w.CW + cx;
    if (w.genDone[gi]) return;
    w.genDone[gi] = 1;
    this.count++;
    const X0 = cx * CPX - PAD, Y0 = cy * CPX - PAD;
    const tm = this.tm, td = this.td, tb = this.tb;
    const MW = w.MW, MH = w.MH, W = w.W, H = w.H;
    const NW = this.NW;
    const cellMat = p.cellMat;
    const R = p.region;
    const rx0 = R.x0 * M, rx1 = R.x1 * M, ry0 = R.y0 * M, ry1 = R.y1 * M;
    const seedOf = this.seedOf;
    const s1 = p.seed + 101, s2 = p.seed + 202;
    const mask = p.mode === 'mask';
    const T = p.T, C = p.C, A = p.A, WX = p.WX, WY = p.WY;
    const tunnel = p.tunnel, cavern = p.cavern;

    // ---- base pass: warped cell materials, textures, caves. Noise fields are interpolated
    // down the row once per 8-px node segment, then across it per pixel.
    for (let ly = 0; ly < SZ; ly++) {
      const y = Y0 + ly;
      const row = ly * SZ;
      if (y < 0 || y >= MH) { for (let lx = 0; lx < SZ; lx++) { tm[row + lx] = B.BEDROCK; td[row + lx] = 3; tb[row + lx] = B.BEDROCK; } continue; }
      const fy = y / NODE;
      const j = Math.min(this.NH - 2, Math.floor(fy)), ty = fy - j;
      const inRows = y >= ry0 && y < ry1;
      let lx = 0;
      while (lx < SZ) {
        const x0 = X0 + lx;
        if (x0 < 0 || x0 >= MW) { const o = row + lx; tm[o] = B.BEDROCK; td[o] = 3; tb[o] = B.BEDROCK; lx++; continue; }
        const i = Math.min(NW - 2, Math.floor(x0 / NODE));
        const k = j * NW + i;
        const segEnd = Math.min(SZ, (i + 1) * NODE - X0, MW - X0);
        const wxL = WX[k] + (WX[k + NW] - WX[k]) * ty, wxR = WX[k + 1] + (WX[k + NW + 1] - WX[k + 1]) * ty;
        const wyL = WY[k] + (WY[k + NW] - WY[k]) * ty, wyR = WY[k + 1] + (WY[k + NW + 1] - WY[k + 1]) * ty;
        let fL, fR, gL = 0, gR = 0;
        if (mask) { fL = A[k] + (A[k + NW] - A[k]) * ty; fR = A[k + 1] + (A[k + NW + 1] - A[k + 1]) * ty; }
        else {
          fL = T[k] + (T[k + NW] - T[k]) * ty; fR = T[k + 1] + (T[k + NW + 1] - T[k + 1]) * ty;
          gL = C[k] + (C[k + NW] - C[k]) * ty; gR = C[k + 1] + (C[k + NW + 1] - C[k + 1]) * ty;
        }
        const xs = i * NODE;
        for (; lx < segEnd; lx++) {
          const x = X0 + lx;
          const o = row + lx;
          const tx = (x - xs) / NODE;
          let ccx = ((x + wxL + (wxR - wxL) * tx) / M) | 0, ccy = ((y + wyL + (wyR - wyL) * tx) / M) | 0;
          if (ccx < 0) ccx = 0; else if (ccx >= W) ccx = W - 1;
          if (ccy < 0) ccy = 0; else if (ccy >= H) ccy = H - 1;
          const m = cellMat[ccy * W + ccx];
          tb[o] = m;
          td[o] = texel(m, x, y, seedOf[m]);
          let air = false;
          if (inRows && x >= rx0 && x < rx1) {
            const f = fL + (fR - fL) * tx;
            if (mask) air = f + (tn(x, y, 4, s1) - 0.5) * 0.16 > 0.5;
            else {
              const g = gL + (gR - gL) * tx;
              air = Math.abs(f) + (tn(x, y, 4, s1) - 0.5) * 0.012 < tunnel || g + (tn(x, y, 4, s2) - 0.5) * 0.024 > cavern;
            }
          }
          tm[o] = air ? 0 : m;
        }
      }
    }

    // ---- features (carves, fills, geodes, ore deposits) clipped to this padded rect
    const bx0 = X0, by0 = Y0, bx1 = X0 + SZ, by1 = Y0 + SZ;
    for (const f of p.features) {
      if (f.x1 <= bx0 || f.x0 >= bx1 || f.y1 <= by0 || f.y0 >= by1) continue;
      const xa = Math.max(bx0, f.x0, 0), xb = Math.min(bx1, f.x1, MW), ya = Math.max(by0, f.y0, 0), yb = Math.min(by1, f.y1, MH);
      if (f.kind === 'deposit') { this.stampDeposit(f.dep, xa, ya, xb, yb, X0, Y0); continue; }
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const o = (y - Y0) * SZ + (x - X0);
        if (f.kind === 'carve') { if (f.test(x, y)) tm[o] = 0; }
        else if (f.kind === 'fill') {
          const r = f.test(x, y, tm[o]);
          if (r) {
            const m = r === true ? f.mat : r, d = f.det ? f.det(x, y, m) : -1;
            tm[o] = m; tb[o] = f.back ?? tb[o]; td[o] = d >= 0 ? d : texel(m, x, y, seedOf[m]);
          }
        }
      }
    }

    // ---- surface flags: weathered crust near old cave air, growth on floors
    const g = p.growth;
    const gs = p.seed + 77;
    for (let ly = PAD; ly < PAD + CPX; ly++)
      for (let lx = PAD; lx < PAD + CPX; lx++) {
        const o = ly * SZ + lx;
        const m = tm[o];
        if (!m || m >= ORE_BASE || m === B.BEDROCK || m === B.TIMBER) continue;
        const near1 = !tm[o - 1] || !tm[o + 1] || !tm[o - SZ] || !tm[o + SZ];
        const near2 = near1 || !tm[o - 2] || !tm[o + 2] || !tm[o - SZ * 2] || !tm[o + SZ * 2] || !tm[o - SZ - 1] || !tm[o - SZ + 1] || !tm[o + SZ - 1] || !tm[o + SZ + 1];
        if (near2) td[o] |= D_CRUST;
        if (g && !GRAN[m] && !NOGROW[m]) {
          const x = X0 + lx, y = Y0 + ly;
          const up1 = !tm[o - SZ], up2 = !tm[o - SZ * 2], up3 = !tm[o - SZ * 3];
          if (up1 || (up2 && tn(x, y, 8, gs) > 0.45) || (up3 && tn(x, y, 6, gs + 1) > 0.72)) {
            if (tn(x, y, 32, gs + 2) * 0.7 + tn(x, y, 8, gs + 3) * 0.3 > g.cover) td[o] |= D_GROWTH;
          }
        }
      }

    // ---- copy into the world, update cell coverage
    const pm = w.pm, pd = w.pd, pb = w.pb;
    const xs = cx * CPX, ys = cy * CPX;
    const xe = Math.min(MW, xs + CPX), ye = Math.min(MH, ys + CPX);
    for (let y = ys; y < ye; y++) {
      const src = (y - Y0) * SZ + (xs - X0);
      const dst = y * MW + xs;
      const n = xe - xs;
      pm.set(tm.subarray(src, src + n), dst);
      pd.set(td.subarray(src, src + n), dst);
      pb.set(tb.subarray(src, src + n), dst);
    }
    for (let c = Math.floor(ys / M); c < Math.ceil(ye / M); c++)
      for (let r = Math.floor(xs / M); r < Math.ceil(xe / M); r++) {
        let n = 0;
        for (let y = c * M; y < (c + 1) * M; y++) { const base = y * MW + r * M; for (let x = 0; x < M; x++) if (pm[base + x]) n++; }
        const i = c * W + r;
        w.cover[i] = n;
        const wasSolid = w.block[i] !== B.AIR;
        const solidNow = n >= (M * M) / 2;
        if (solidNow && !wasSolid) { w.block[i] = cellMat[i] || B.STONE; w.fluid[i] = 0; w.ftype[i] = 0; }
        else if (!solidNow && wasSolid && w.block[i] !== B.BEDROCK) w.block[i] = B.AIR;
      }
    // neighbors' aprons now see real pixels instead of placeholders
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < w.CW && ny < w.CH) w.pxDirty.add(ny * w.CW + nx);
    }
    w.lightDirty = true;
    if (this.onChunk) this.onChunk(cx, cy);
  }

  stampDeposit(d, xa, ya, xb, yb, X0, Y0) {
    const tm = this.tm, td = this.td;
    const mOre = ORE_BASE + d.oreId, mStain = STAIN_BASE + d.oreId;
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      const lx = x - d.x0, ly = y - d.y0;
      if (lx < 0 || ly < 0 || lx >= d.w || ly >= d.h) continue;
      const v = d.idx[ly * d.w + lx];
      if (!v) continue;
      const o = (y - Y0) * SZ + (x - X0);
      const host = tm[o];
      if (!host || GRAN[host] || host === B.BEDROCK || host === B.TIMBER || host >= ORE_BASE || host === UNGEN) continue;
      const hi = ly * d.w + lx;
      if (!d.hostSet[hi]) { d.hostSet[hi] = 1; d.host[hi] = host; d.hostDet[hi] = td[o]; if (!(d.stain && d.stain[v])) d.stamped++; }
      tm[o] = d.stain && d.stain[v] ? mStain : mOre;
      td[o] = d.map ? d.map[v] : v;
    }
  }

  /**
   * Generate missing chunks overlapping a pixel rect (the view plus a margin), nearest to
   * its center first, until the time budget (ms) runs out. Far chunks stay as plan only.
   */
  pump(px0, py0, px1, py1, budget = 3) {
    const w = this.w;
    const c0 = Math.max(0, Math.floor(px0 / CPX)), c1 = Math.min(w.CW - 1, Math.floor(px1 / CPX));
    const r0 = Math.max(0, Math.floor(py0 / CPX)), r1 = Math.min(w.CH - 1, Math.floor(py1 / CPX));
    const mx = (px0 + px1) / 2 / CPX, my = (py0 + py1) / 2 / CPX;
    let best = null, bd = Infinity;
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      if (w.genDone[cy * w.CW + cx]) continue;
      const d = (cx + 0.5 - mx) ** 2 + (cy + 0.5 - my) ** 2;
      if (d < bd) { bd = d; best = [cx, cy]; }
    }
    if (!best) return 0;
    const t0 = performance.now();
    this.chunk(best[0], best[1]);
    let n = 1;
    while (performance.now() - t0 < budget) {
      let nb = null, nd = Infinity;
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        if (w.genDone[cy * w.CW + cx]) continue;
        const d = (cx + 0.5 - mx) ** 2 + (cy + 0.5 - my) ** 2;
        if (d < nd) { nd = d; nb = [cx, cy]; }
      }
      if (!nb) break;
      this.chunk(nb[0], nb[1]);
      n++;
    }
    return n;
  }
}

/** Ore deposit record for a pattern placed with its top-left at pixel (x0, y0). */
export function makeDeposit(oreId, item, blob, x0, y0, q) {
  const n = blob.w * blob.h;
  let total = 0;
  for (let i = 0; i < n; i++) if (blob.idx[i]) total++;
  return {
    id: -1, oreId, item, x0, y0, w: blob.w, h: blob.h, idx: blob.idx,
    host: new Uint8Array(n), hostDet: new Uint8Array(n), hostSet: new Uint8Array(n),
    total, stamped: 0, removed: 0, q, q0: q, revealed: false, seen: false, loosen: 0, chipped: 0, done: false,
  };
}

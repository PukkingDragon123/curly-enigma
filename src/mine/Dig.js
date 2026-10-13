// Pixel-level rock destruction. Rock breaks along Voronoi fracture pieces (blocky granite,
// platy mudstone, columnar basalt, crumbly dirt...): strikes crack a piece first, then it
// pops out as a physical chunk. Chisels chip single pixels, brushes sweep loose grit,
// drills grind, blasts shatter.
import { B } from './blocks.js';
import { M, MAT, ORE_BASE, GRAN, D_CRACK, D_CRUST, D_SHADE, D_SCORCH, pieceId, pixelColor, tn } from './micro.js';
import { UNGEN } from './MineWorld.js';

const UNBREAKABLE = new Uint8Array(256);
UNBREAKABLE[B.BEDROCK] = 1; UNBREAKABLE[B.TIMBER] = 1; UNBREAKABLE[UNGEN] = 1;

export class Digger {
  constructor(world) {
    this.w = world;
    this.damage = new Map(); // piece key → accumulated damage
    this.removed = []; // pixel indices removed since last drain (for islands/sand)
  }

  /** Pixels of the fracture piece containing (x, y) (same material + same Voronoi cell). */
  piece(x, y, max = 1400) {
    const w = this.w, MW = w.MW, pm = w.pm;
    const m = w.pmat(x, y);
    if (!m || m >= ORE_BASE || UNBREAKABLE[m]) return null;
    const id = pieceId(m, x, y);
    const out = [];
    const seen = new Set();
    const stack = [y * MW + x];
    seen.add(stack[0]);
    let minx = x, maxx = x, miny = y, maxy = y;
    const lim = Math.max(MAT[m].sx, MAT[m].sy) * 3;
    while (stack.length && out.length < max) {
      const p = stack.pop();
      out.push(p);
      const px = p % MW, py = (p / MW) | 0;
      if (px < minx) minx = px; if (px > maxx) maxx = px;
      if (py < miny) miny = py; if (py > maxy) maxy = py;
      for (let k = 0; k < 4; k++) {
        const nx = px + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = py + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= MW || ny >= w.MH) continue;
        if (Math.abs(nx - x) > lim || Math.abs(ny - y) > lim) continue;
        const q = ny * MW + nx;
        if (seen.has(q) || pm[q] !== m) continue;
        seen.add(q);
        if (pieceId(m, nx, ny) !== id) continue;
        stack.push(q);
      }
    }
    return { m, key: id * 64 + m, px: out, minx, maxx, miny, maxy, set: new Set(out) };
  }

  /** HP of a piece: tougher materials and bigger pieces take more. */
  pieceHp(pc) {
    const mt = MAT[pc.m];
    return mt.hp * Math.pow(pc.px.length / (M * M), 0.85) * 2.2 + 0.05;
  }

  /** Mark the border pixels of a piece as cracked (the break line shows before it pops). */
  crack(pc, frac) {
    const w = this.w, MW = w.MW, pd = w.pd, pm = w.pm;
    const inPiece = (q) => pm[q] === pc.m && pc.set.has(q);
    for (const p of pc.px) {
      const x = p % MW;
      const edge = !inPiece(p - 1) || !inPiece(p + 1) || !inPiece(p - MW) || !inPiece(p + MW);
      if (edge) {
        // cracks grow in from the edges as damage builds
        if (frac > 0.6 || ((x * 7 + ((p / MW) | 0) * 3) % 3) < frac * 5) pd[p] |= D_CRACK;
        w.touchPx(x, (p / MW) | 0);
      }
    }
  }

  /** Remove a list of pixel indices; returns [{x, y, c}] (colors for debris). */
  take(list) {
    const w = this.w, MW = w.MW;
    const out = [];
    for (const p of list) {
      const x = p % MW, y = (p / MW) | 0;
      const m = w.pm[p];
      if (!m || UNBREAKABLE[m]) continue;
      out.push({ x, y, c: pixelColor(m, w.pd[p]), m });
      w.clearPx(x, y);
      this.removed.push(p);
    }
    return out;
  }

  /** Solid, breakable rock pixels (not ore) nearest to (x, y) within r, sorted by distance. */
  nearest(x, y, r, filter) {
    const w = this.w;
    const out = [];
    for (let yy = Math.floor(y - r); yy <= y + r; yy++)
      for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        const m = w.pmat(xx, yy);
        if (!m || m >= ORE_BASE || UNBREAKABLE[m]) continue;
        const d = (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2;
        if (d > r * r) continue;
        if (filter && !filter(m, xx, yy)) continue;
        out.push([d, yy * w.MW + xx]);
      }
    out.sort((a, b) => a[0] - b[0]);
    return out.map((e) => e[1]);
  }

  /**
   * A pickaxe strike at pixel (x, y). power ~1, tier = pick tier. Returns
   * { chunks: [[{x,y,c}]] broken pieces, chips: [{x,y,c}], hard: bool, mats: Set }.
   */
  strike(x, y, power, tier, R = 15 * Math.sqrt(Math.max(0.5, power))) {
    const w = this.w;
    const res = { chunks: [], chips: [], hard: false, mats: new Set(), cracked: 0 };
    const cand = new Map();
    for (let yy = Math.floor(y - R); yy <= y + R; yy += 2)
      for (let xx = Math.floor(x - R); xx <= x + R; xx += 2) {
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
        if (d > R) continue;
        const m = w.pmat(xx, yy);
        if (!m || m >= ORE_BASE) continue;
        if (UNBREAKABLE[m] || MAT[m].tier > tier) { if (d < 4) res.hard = true; continue; }
        if (GRAN[m]) continue;
        const k = pieceId(m, xx, yy) * 64 + m;
        const f = Math.pow(1 - d / R, 0.5);
        const c = cand.get(k);
        if (!c || c.f < f) cand.set(k, { x: xx, y: yy, f, m });
      }
    // loose material just pours out of the way
    const loose = this.nearest(x, y, R * 0.75, (m) => GRAN[m] === 1);
    if (loose.length) { res.chips.push(...this.take(loose.slice(0, Math.round(380 * power)))); res.loose = true; }
    for (const [k, c] of cand) {
      const pc = this.piece(c.x, c.y);
      if (!pc) continue;
      res.mats.add(pc.m);
      const dmg = (this.damage.get(k) || 0) + power * c.f;
      const hp = this.pieceHp(pc);
      if (dmg >= hp) {
        this.damage.delete(k);
        res.chunks.push(this.take(pc.px));
      } else {
        this.damage.set(k, dmg);
        this.crack(pc, dmg / hp);
        res.cracked++;
      }
    }
    // a few chips always fly from the impact point
    const chipN = Math.max(1, Math.round(3 * power / Math.sqrt(Math.max(0.5, MAT[w.pmat(Math.floor(x), Math.floor(y))]?.hp || 1))));
    res.chips.push(...this.take(this.nearest(x, y, 3.2, (m) => MAT[m].tier <= tier).slice(0, chipN)));
    return res;
  }

  /** Chisel tap: chips a few pixels right at the tip. Never breaks ore pixels. */
  chisel(x, y, power, tier) {
    const near = this.nearest(x, y, 3.6, (m) => MAT[m].tier <= tier);
    if (!near.length) return { chips: [], hard: this.w.psolid(Math.floor(x), Math.floor(y)) };
    const m0 = this.w.pm[near[0]];
    const k = Math.max(1, Math.min(14, Math.round((9 * power) / Math.sqrt(MAT[m0].hp || 1))));
    return { chips: this.take(near.slice(0, k)), hard: false };
  }

  /** Brush stroke: cleans crust, sweeps loose grit and soft soil. Returns removed pixels. */
  brush(x, y, power) {
    const w = this.w;
    let cleaned = 0;
    for (let yy = Math.floor(y - 5); yy <= y + 5; yy++)
      for (let xx = Math.floor(x - 5); xx <= x + 5; xx++) {
        if ((xx - x) ** 2 + (yy - y) ** 2 > 25) continue;
        if (!w.pinb(xx, yy)) continue;
        const p = yy * w.MW + xx;
        if (w.pm[p] && (w.pd[p] & D_CRUST) && Math.random() < 0.5) { w.pd[p] &= ~D_CRUST; w.touchPx(xx, yy); cleaned++; }
      }
    const soft = (m) => GRAN[m] === 1 || m === B.DIRT || m === B.LOAM || m === B.ASH || m === B.SNOW;
    const k = Math.max(1, Math.round(3 * power));
    return { chips: this.take(this.nearest(x, y, 4.5, soft).slice(0, k)), cleaned };
  }

  /** Drill grind for dt seconds at (x, y). Returns removed rock pixels and ore pixels hit. */
  drill(x, y, power, tier, dt) {
    const w = this.w;
    this.drillAcc = (this.drillAcc || 0) + dt * 210 * power;
    const out = { chips: [], ore: [], hard: false };
    const near = this.nearest(x, y, 6.5, (m) => MAT[m].tier <= tier);
    while (this.drillAcc > 0 && near.length) {
      const p = near.shift();
      const m = w.pm[p];
      this.drillAcc -= Math.pow(MAT[m].hp || 1, 0.7);
      out.chips.push(...this.take([p]));
    }
    if (!near.length) this.drillAcc = Math.min(this.drillAcc, 2);
    // ore pixels under the bit get shredded
    for (let yy = Math.floor(y - 3); yy <= y + 3; yy++) for (let xx = Math.floor(x - 3); xx <= x + 3; xx++) {
      const m = w.pmat(xx, yy);
      if (m >= ORE_BASE && m !== UNGEN && (xx - x) ** 2 + (yy - y) ** 2 < 9 && Math.random() < dt * 14) out.ore.push([xx, yy]);
    }
    const c = w.pmat(Math.floor(x), Math.floor(y));
    if (c && !out.chips.length && (UNBREAKABLE[c] || MAT[c].tier > tier)) out.hard = true;
    return out;
  }

  /** Blast: removes rock within R pixels (ragged edge), scorches the rim. Returns pieces for debris. */
  blast(x, y, R, maxHp = 14) {
    const w = this.w;
    const pieces = new Map();
    const ore = [];
    const s = (x * 31 + y * 17) | 0;
    for (let yy = Math.floor(y - R - 6); yy <= y + R + 6; yy++)
      for (let xx = Math.floor(x - R - 6); xx <= x + R + 6; xx++) {
        if (!w.pinb(xx, yy)) continue;
        const p = yy * w.MW + xx;
        const m = w.pm[p];
        if (!m || UNBREAKABLE[m]) continue;
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
        const edge = R * (0.78 + tn(xx, yy, 8, s) * 0.36);
        if (d > edge) {
          if (d < edge + 5 && m < ORE_BASE) { w.pd[p] |= D_SCORCH; w.touchPx(xx, yy); }
          continue;
        }
        if (m >= ORE_BASE) { ore.push([xx, yy]); continue; }
        if ((MAT[m].hp || 0) > maxHp) continue;
        const k = ((xx / 12) | 0) + ((yy / 12) | 0) * 4096;
        let l = pieces.get(k);
        if (!l) pieces.set(k, (l = []));
        l.push(p);
      }
    const chunks = [];
    for (const l of pieces.values()) chunks.push(this.take(l));
    return { chunks, ore };
  }

  /** Remove up to n ore pixels of a deposit nearest (x, y) (chipping damage). */
  chipOre(dep, x, y, n) {
    const w = this.w;
    const cand = [];
    const mOre = ORE_BASE + dep.oreId;
    for (let yy = dep.y0; yy < dep.y0 + dep.h; yy++) for (let xx = dep.x0; xx < dep.x0 + dep.w; xx++) {
      if (w.pmat(xx, yy) !== mOre) continue;
      const li = (yy - dep.y0) * dep.w + (xx - dep.x0);
      if (!dep.idx[li]) continue;
      cand.push([(xx - x) ** 2 + (yy - y) ** 2, xx, yy]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (let i = 0; i < Math.min(n, cand.length); i++) {
      const [, xx, yy] = cand[i];
      out.push({ x: xx, y: yy, c: pixelColor(mOre, w.pd[yy * w.MW + xx]), m: mOre });
      w.clearPx(xx, yy);
      this.removed.push(yy * w.MW + xx);
      dep.removed++;
    }
    return out;
  }

  /** How exposed a deposit is: fraction of its rim pixels touching open air. */
  exposure(dep) {
    const w = this.w;
    const mOre = ORE_BASE + dep.oreId;
    let rim = 0, open = 0, left = 0;
    for (let yy = dep.y0; yy < dep.y0 + dep.h; yy++) for (let xx = dep.x0; xx < dep.x0 + dep.w; xx++) {
      if (w.pmat(xx, yy) !== mOre) continue;
      if (!dep.idx[(yy - dep.y0) * dep.w + (xx - dep.x0)]) continue;
      left++;
      let edge = false, air = false;
      for (let k = 0; k < 4; k++) {
        const nx = xx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = yy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        const nm = w.pmat(nx, ny);
        if (nm === mOre && dep.idx[(ny - dep.y0) * dep.w + (nx - dep.x0)] && nx >= dep.x0 && ny >= dep.y0 && nx < dep.x0 + dep.w && ny < dep.y0 + dep.h) continue;
        edge = true;
        if (!nm) air = true;
      }
      if (edge) { rim++; if (air) open++; }
    }
    dep.left = left;
    return rim ? open / rim : 0;
  }

  /** Lift every remaining ore pixel of a deposit out of the rock. Returns the pixels. */
  extract(dep) {
    const w = this.w;
    const mOre = ORE_BASE + dep.oreId;
    const out = [];
    for (let yy = dep.y0; yy < dep.y0 + dep.h; yy++) for (let xx = dep.x0; xx < dep.x0 + dep.w; xx++) {
      if (w.pmat(xx, yy) !== mOre) continue;
      if (!dep.idx[(yy - dep.y0) * dep.w + (xx - dep.x0)]) continue;
      out.push({ x: xx, y: yy, c: pixelColor(mOre, w.pd[yy * w.MW + xx]), m: mOre });
      w.clearPx(xx, yy);
      this.removed.push(yy * w.MW + xx);
    }
    dep.done = true;
    return out;
  }

  drain() { const r = this.removed; this.removed = []; return r; }
}

export { UNBREAKABLE, D_SHADE };

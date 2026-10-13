// Storage for one mine zone. Two layers:
//  - the cell grid (W×H): cell material summary, fluids, fire, stress, flags — what lighting,
//    fluids, creatures and cave-in logic reason about;
//  - the pixel layer (M×M pixels per cell): the actual rock you chip away. Cells derive their
//    material from how many of their pixels are still solid.
import { B, BLOCKS, ORES, isSolid } from './blocks.js';
import { M, CPX, APRON, ORE_BASE, D_SHADE, MAT, GRAN } from './micro.js';

export const F = {
  REVEALED: 1, // (legacy) ore known to the player
  STABLE: 2, // natural ceiling: does not cave in on its own
  MINED: 4, // opened by the player
  BEAM: 8, // support beam in this (air) cell
  STAKE: 16, // glow stake in this (air) cell
  WEB: 32, // spider web (slows movement)
  ELECTRIC: 64, // electrified water
  SEEN: 128, // discovered in the index already handled
};

export const CHUNK = 16; // cells per light/view chunk (legacy unit used by the scene)
export const UNGEN = 255; // pixel material of not-yet-generated chunks (acts as solid anchor)
const HALF = (M * M) / 2;

export class MineWorld {
  constructor(zone, W, H) {
    this.zone = zone;
    this.W = W;
    this.H = H;
    const n = W * H;
    this.block = new Uint8Array(n);
    this.back = new Uint8Array(n); // original material, used for the back wall
    this.variant = new Uint8Array(n);
    this.hp = new Float32Array(n);
    this.ore = new Uint8Array(n); // planned ore type per cell (deposits are the real thing)
    this.oreQ = new Float32Array(n);
    this.flags = new Uint8Array(n);
    this.fluid = new Float32Array(n);
    this.ftype = new Uint8Array(n); // 1 water, 2 lava
    this.fire = new Float32Array(n);
    this.stress = new Float32Array(n);
    this.dirty = new Set();
    this.lightDirty = true;
    this.changeListeners = [];
    this.stations = []; // lift bell rows
    this.shaftX = Math.floor(W / 2);
    this.spawn = { x: this.shaftX + 2.5, y: 3 };

    // ---- pixel layer
    this.MW = W * M;
    this.MH = H * M;
    const np = this.MW * this.MH;
    this.pm = new Uint8Array(np).fill(UNGEN); // material (0 = air)
    this.pd = new Uint8Array(np); // detail: shade + surface flags
    this.pb = new Uint8Array(np); // original material (back wall)
    this.cover = new Uint16Array(n); // solid pixels per cell
    this.CW = Math.ceil(this.MW / CPX);
    this.CH = Math.ceil(this.MH / CPX);
    this.genDone = new Uint8Array(this.CW * this.CH);
    this.pxDirty = new Set(); // render chunk ids needing a refresh
    this.deposits = [];
    this.depCells = new Map(); // cell index → [deposit]
    this.gen = null; // chunk generator (set by MineGen)
  }

  idx(x, y) { return y * this.W + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }

  get(x, y) {
    if (!this.inb(x, y)) return B.BEDROCK;
    return this.block[y * this.W + x];
  }
  solid(x, y) {
    if (!this.inb(x, y)) return true;
    return isSolid(this.block[y * this.W + x]);
  }
  blocks(x, y) { return this.solid(x, y); }
  open(x, y) { return !this.solid(x, y); }
  hasFlag(x, y, f) { return this.inb(x, y) && (this.flags[y * this.W + x] & f) !== 0; }
  setFlag(x, y, f, on = true) {
    if (!this.inb(x, y)) return;
    const i = y * this.W + x;
    if (on) this.flags[i] |= f; else this.flags[i] &= ~f;
  }

  maxHp(x, y) {
    const b = BLOCKS[this.block[this.idx(x, y)]];
    return b && b.hp ? b.hp : 0;
  }

  exposed(x, y) {
    return this.open(x - 1, y) || this.open(x + 1, y) || this.open(x, y - 1) || this.open(x, y + 1);
  }

  markDirty(x, y) {
    this.lightDirty = true;
    // the pixel renderer refreshes the chunk under this cell
    const cx = Math.floor((x * M) / CPX), cy = Math.floor((y * M) / CPX);
    if (cx >= 0 && cy >= 0 && cx < this.CW && cy < this.CH) this.pxDirty.add(cy * this.CW + cx);
  }

  onChange(fn) { this.changeListeners.push(fn); }

  depthMeters(y, zoneDef) {
    const [a, b] = zoneDef.depth;
    return a + (y / this.H) * (b - a);
  }

  // ================================================================ pixels
  pinb(x, y) { return x >= 0 && y >= 0 && x < this.MW && y < this.MH; }
  /** Pixel material at (x, y); outside the world reads as bedrock. */
  pmat(x, y) {
    if (x < 0 || y < 0 || x >= this.MW || y >= this.MH) return B.BEDROCK;
    return this.pm[y * this.MW + x];
  }
  psolid(x, y) {
    if (x < 0 || y < 0 || x >= this.MW || y >= this.MH) return true;
    return this.pm[y * this.MW + x] !== 0;
  }
  /** Solid at a point in cell units (y down). */
  solidPt(x, y) { return this.psolid(Math.floor(x * M), Math.floor(y * M)); }
  /** Material at a point in cell units. */
  matPt(x, y) { return this.pmat(Math.floor(x * M), Math.floor(y * M)); }

  /** Make sure the chunk holding pixel (x, y) exists. */
  ensurePx(x, y) {
    const cx = Math.floor(x / CPX), cy = Math.floor(y / CPX);
    if (cx < 0 || cy < 0 || cx >= this.CW || cy >= this.CH) return;
    if (!this.genDone[cy * this.CW + cx] && this.gen) this.gen.chunk(cx, cy);
  }
  /** Generate every chunk overlapping a cell rectangle (inclusive). */
  ensureCells(x0, y0, x1, y1) {
    const c0 = Math.max(0, Math.floor((x0 * M) / CPX)), c1 = Math.min(this.CW - 1, Math.floor(((x1 + 1) * M - 1) / CPX));
    const r0 = Math.max(0, Math.floor((y0 * M) / CPX)), r1 = Math.min(this.CH - 1, Math.floor(((y1 + 1) * M - 1) / CPX));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) if (!this.genDone[cy * this.CW + cx] && this.gen) this.gen.chunk(cx, cy);
  }

  /** Mark the render chunk(s) around a pixel dirty (neighbors too when inside the apron). */
  touchPx(x, y) {
    const cx = Math.floor(x / CPX), cy = Math.floor(y / CPX);
    const lx = x - cx * CPX, ly = y - cy * CPX;
    const CW = this.CW;
    this.pxDirty.add(cy * CW + cx);
    const l = lx < APRON + 1, r = lx >= CPX - APRON - 1, u = ly < APRON + 1, d = ly >= CPX - APRON - 1;
    if (l && cx > 0) this.pxDirty.add(cy * CW + cx - 1);
    if (r && cx < CW - 1) this.pxDirty.add(cy * CW + cx + 1);
    if (u && cy > 0) this.pxDirty.add((cy - 1) * CW + cx);
    if (d && cy < this.CH - 1) this.pxDirty.add((cy + 1) * CW + cx);
    if (l && u && cx > 0 && cy > 0) this.pxDirty.add((cy - 1) * CW + cx - 1);
    if (r && u && cx < CW - 1 && cy > 0) this.pxDirty.add((cy - 1) * CW + cx + 1);
    if (l && d && cx > 0 && cy < this.CH - 1) this.pxDirty.add((cy + 1) * CW + cx - 1);
    if (r && d && cx < CW - 1 && cy < this.CH - 1) this.pxDirty.add((cy + 1) * CW + cx + 1);
  }

  /** Remove a solid pixel. Returns its old material (0 if it was already air). */
  clearPx(x, y) {
    if (x < 0 || y < 0 || x >= this.MW || y >= this.MH) return 0;
    const p = y * this.MW + x;
    const m = this.pm[p];
    if (!m || m === UNGEN) return 0;
    this.pm[p] = 0;
    this.pd[p] &= D_SHADE;
    this.touchPx(x, y);
    this.coverDelta(x, y, -1, 0);
    return m;
  }
  /** Fill an air pixel with material m (detail d). */
  fillPx(x, y, m, d) {
    if (x < 0 || y < 0 || x >= this.MW || y >= this.MH) return false;
    const p = y * this.MW + x;
    if (this.pm[p]) return false;
    this.pm[p] = m;
    this.pd[p] = d;
    this.touchPx(x, y);
    this.coverDelta(x, y, 1, m);
    return true;
  }
  /** Move a pixel (falling sand). Both endpoints must be valid; dst must be air. */
  movePx(x0, y0, x1, y1) {
    const W = this.MW, a = y0 * W + x0, b = y1 * W + x1;
    const m = this.pm[a];
    this.pm[b] = m; this.pd[b] = this.pd[a];
    this.pm[a] = 0; this.pd[a] &= D_SHADE;
    this.touchPx(x0, y0);
    this.touchPx(x1, y1);
    if ((x0 >> 5) !== (x1 >> 5) || (y0 >> 5) !== (y1 >> 5)) { this.coverDelta(x0, y0, -1, 0); this.coverDelta(x1, y1, 1, m); }
  }

  coverDelta(x, y, d, m) {
    const cx = (x / M) | 0, cy = (y / M) | 0;
    const i = cy * this.W + cx;
    const before = this.cover[i];
    const after = before + d;
    this.cover[i] = after;
    if (before >= HALF && after < HALF) this.setCellBlock(cx, cy, B.AIR);
    else if (before < HALF && after >= HALF) this.setCellBlock(cx, cy, m >= ORE_BASE ? this.back[i] || B.STONE : m);
  }

  /** Cell-level material change derived from pixels (fires change listeners). */
  setCellBlock(x, y, id) {
    const i = this.idx(x, y);
    const was = this.block[i];
    if (was === id) return;
    this.block[i] = id;
    this.stress[i] = 0;
    if (isSolid(id)) { this.fluid[i] = 0; this.ftype[i] = 0; }
    this.lightDirty = true;
    for (const fn of this.changeListeners) fn(x, y, was, id);
  }

  /**
   * Legacy whole-cell edit (reactions like lava+water → obsidian, freezing water): fills the
   * cell's air pixels with id, or clears every pixel when id is AIR.
   */
  setBlock(x, y, id) {
    if (!this.inb(x, y)) return;
    this.ensureCells(x, y, x, y);
    const x0 = x * M, y0 = y * M;
    if (!isSolid(id)) {
      for (let yy = y0; yy < y0 + M; yy++) for (let xx = x0; xx < x0 + M; xx++) {
        const m = this.pm[yy * this.MW + xx];
        if (m && m < ORE_BASE && m !== B.BEDROCK) this.clearPx(xx, yy);
      }
      this.setCellBlock(x, y, B.AIR);
      return;
    }
    const tex = this.gen ? this.gen.texel : null;
    for (let yy = y0; yy < y0 + M; yy++) for (let xx = x0; xx < x0 + M; xx++) this.fillPx(xx, yy, id, tex ? tex(id, xx, yy) : 4);
    this.setCellBlock(x, y, id);
  }

  // ================================================================ ore deposits
  addDeposit(dep) {
    dep.id = this.deposits.length;
    this.deposits.push(dep);
    const c0 = Math.floor(dep.x0 / M), c1 = Math.floor((dep.x0 + dep.w - 1) / M);
    const r0 = Math.floor(dep.y0 / M), r1 = Math.floor((dep.y0 + dep.h - 1) / M);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      if (!this.inb(cx, cy)) continue;
      const k = cy * this.W + cx;
      let l = this.depCells.get(k);
      if (!l) this.depCells.set(k, (l = []));
      l.push(dep);
    }
    return dep;
  }
  /** The deposit owning ore pixel (x, y), if any. */
  depositAt(x, y) {
    const m = this.pmat(x, y);
    if (m < ORE_BASE || m === UNGEN) return null;
    const l = this.depCells.get(((y / M) | 0) * this.W + ((x / M) | 0));
    if (!l) return null;
    for (const d of l) {
      if (d.done) continue;
      const lx = x - d.x0, ly = y - d.y0;
      if (lx >= 0 && ly >= 0 && lx < d.w && ly < d.h && d.idx[ly * d.w + lx]) return d;
    }
    return null;
  }
  /** Deposits whose box overlaps a cell-unit circle. */
  depositsNear(x, y, r) {
    const out = new Set();
    for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++)
      for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
        const l = this.depCells.get(cy * this.W + cx);
        if (l) for (const d of l) if (!d.done) out.add(d);
      }
    return [...out];
  }

  isGranularPx(x, y) { return GRAN[this.pmat(x, y)] === 1; }
  matInfo(x, y) { return MAT[this.pmat(x, y)]; }
}

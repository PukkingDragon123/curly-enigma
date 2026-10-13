// Grid storage for one mine zone: blocks, embedded ores, fluids, fire, stress and flags.
import { B, BLOCKS, ORES, isSolid } from './blocks.js';

export const F = {
  REVEALED: 1, // ore known to the player (exposed once, X-rayed or brushed)
  STABLE: 2, // natural ceiling: does not cave in on its own
  MINED: 4, // opened by the player
  BEAM: 8, // support beam in this (air) cell
  STAKE: 16, // glow stake in this (air) cell
  WEB: 32, // spider web (slows movement)
  ELECTRIC: 64, // electrified water
  SEEN: 128, // discovered in the index already handled
};

export const CHUNK = 16;

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
    this.ore = new Uint8Array(n);
    this.oreQ = new Float32Array(n);
    this.flags = new Uint8Array(n);
    this.fluid = new Float32Array(n);
    this.ftype = new Uint8Array(n); // 1 water, 2 lava
    this.fire = new Float32Array(n);
    this.stress = new Float32Array(n);
    this.dirty = new Set(); // dirty chunk keys
    this.lightDirty = true;
    this.changeListeners = [];
    this.stations = []; // lift bell rows
    this.shaftX = Math.floor(W / 2);
    this.spawn = { x: this.shaftX + 2.5, y: 3 };
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
  /** Solid for movement (beams/webs are not solid). */
  blocks(x, y) { return this.solid(x, y); }
  open(x, y) { return !this.solid(x, y); }
  hasFlag(x, y, f) { return this.inb(x, y) && (this.flags[y * this.W + x] & f) !== 0; }
  setFlag(x, y, f, on = true) {
    if (!this.inb(x, y)) return;
    const i = y * this.W + x;
    if (on) this.flags[i] |= f; else this.flags[i] &= ~f;
  }

  maxHp(x, y) {
    const i = this.idx(x, y);
    const b = BLOCKS[this.block[i]];
    if (!b || !b.hp) return 0;
    const o = this.ore[i] ? ORES[this.ore[i]] : null;
    return b.hp * (o ? o.hardMul : 1);
  }

  exposed(x, y) {
    return this.open(x - 1, y) || this.open(x + 1, y) || this.open(x, y - 1) || this.open(x, y + 1);
  }

  oreVisible(x, y) {
    const i = this.idx(x, y);
    if (!this.ore[i]) return false;
    return (this.flags[i] & F.REVEALED) !== 0 || this.exposed(x, y);
  }

  markDirty(x, y) {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    this.dirty.add(cx + ',' + cy);
    const lx = x - cx * CHUNK, ly = y - cy * CHUNK;
    if (lx === 0) this.dirty.add(cx - 1 + ',' + cy);
    if (lx === CHUNK - 1) this.dirty.add(cx + 1 + ',' + cy);
    if (ly === 0) this.dirty.add(cx + ',' + (cy - 1));
    if (ly === CHUNK - 1) this.dirty.add(cx + ',' + (cy + 1));
    this.lightDirty = true;
  }

  setBlock(x, y, id, { keepOre = false } = {}) {
    if (!this.inb(x, y)) return;
    const i = this.idx(x, y);
    const was = this.block[i];
    this.block[i] = id;
    if (!keepOre && !isSolid(id)) { this.ore[i] = 0; this.oreQ[i] = 0; }
    this.hp[i] = BLOCKS[id] && BLOCKS[id].hp ? this.maxHp(x, y) : 0;
    this.stress[i] = 0;
    if (isSolid(id)) { this.fluid[i] = 0; this.ftype[i] = 0; }
    this.markDirty(x, y);
    for (const fn of this.changeListeners) fn(x, y, was, id);
  }

  onChange(fn) { this.changeListeners.push(fn); }

  depthMeters(y, zoneDef) {
    const [a, b] = zoneDef.depth;
    return a + (y / this.H) * (b - a);
  }
}

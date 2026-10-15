// The underground voxel world: lazily generated 32³ chunks around the player, voxel queries in
// voxels or meters, a DDA raycast, ore deposits, and the record of everything the player dug
// (saved compactly so regenerated chunks come back exactly as left).
import { ChunkGen, CS, makePlan, addMouth, BOUNDS } from './Generator.js';
import { VOX, M, MAT, ORE_BASE } from './materials.js';
import { OPAQUE } from './Mesher.js';

const WORLD_KEY = 'moleforge.world.v1';
const key3 = (cx, cy, cz) => ((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512);
const CB = Math.log2(CS);

export class Chunk {
  constructor(cx, cy, cz) {
    this.cx = cx; this.cy = cy; this.cz = cz;
    this.key = key3(cx, cy, cz);
    this.vox = new Uint8Array(CS * CS * CS);
    this.deps = [];
    this.dirty = true;
    this.mesh = null;
    this.fluidMesh = null;
  }
}

export class DeepWorld {
  /** opts: { seed, W, D, tunnels: [{wall, t}] } */
  constructor(opts) {
    this.seed = opts.seed;
    this.plan = makePlan(opts.seed, opts);
    for (const t of opts.tunnels || []) addMouth(this.plan, t.wall, t.t);
    this.gen = new ChunkGen(this.plan);
    this.chunks = new Map();
    this.edits = new Map(); // chunk key → Map(voxel index → material)
    this.depositState = new Map(); // deposit id → { taken, hits, q }
    this.onChange = null; // (chunk) → void
    this.genCount = 0;
    this.loadEdits();
  }

  // ------------------------------------------------------------ chunks
  chunk(cx, cy, cz) { return this.chunks.get(key3(cx, cy, cz)); }

  /** Generate (or return) a chunk; applies saved edits. */
  ensure(cx, cy, cz) {
    const k = key3(cx, cy, cz);
    let ch = this.chunks.get(k);
    if (ch) return ch;
    ch = new Chunk(cx, cy, cz);
    ch.deps = this.gen.generate(cx, cy, cz, ch.vox);
    const ed = this.edits.get(k);
    if (ed) for (const [i, m] of ed) ch.vox[i] = m;
    // taken deposits stay gone even if their voxels weren't all recorded
    this.chunks.set(k, ch);
    this.genCount++;
    // neighbours' faces against this chunk may change now
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const n = this.chunks.get(key3(cx + dx, cy + dy, cz + dz));
      if (n) n.dirty = true;
    }
    return ch;
  }

  unload(ch) {
    this.chunks.delete(ch.key);
    if (this.onUnload) this.onUnload(ch);
  }

  inBounds(vx, vy, vz) {
    const B = BOUNDS;
    return vx >= B.x0 * VOX && vx < B.x1 * VOX && vy >= B.y0 * VOX && vy < B.y1 * VOX && vz >= B.z0 * VOX && vz < B.z1 * VOX;
  }

  /** Material at a voxel. Unloaded chunks read as solid stone (never as air). */
  voxelAt(vx, vy, vz) {
    const ch = this.chunks.get(key3(vx >> CB, vy >> CB, vz >> CB));
    if (!ch) return M.STONE;
    return ch.vox[(vx & (CS - 1)) + CS * ((vy & (CS - 1)) + CS * (vz & (CS - 1)))];
  }

  /** Material at a point in meters (generates the chunk if needed). */
  matAt(x, y, z) {
    const vx = Math.floor(x * VOX), vy = Math.floor(y * VOX), vz = Math.floor(z * VOX);
    const ch = this.ensure(vx >> CB, vy >> CB, vz >> CB);
    return ch.vox[(vx & (CS - 1)) + CS * ((vy & (CS - 1)) + CS * (vz & (CS - 1)))];
  }
  solidAt(x, y, z) { return OPAQUE[this.matAt(x, y, z)] === 1; }

  /** Change one voxel (voxel coords). Records the edit and dirties meshes. */
  setVoxel(vx, vy, vz, m) {
    const cx = vx >> CB, cy = vy >> CB, cz = vz >> CB;
    const ch = this.ensure(cx, cy, cz);
    const lx = vx & (CS - 1), ly = vy & (CS - 1), lz = vz & (CS - 1);
    const i = lx + CS * (ly + CS * lz);
    const old = ch.vox[i];
    if (old === m) return old;
    ch.vox[i] = m;
    ch.dirty = true;
    let ed = this.edits.get(ch.key);
    if (!ed) this.edits.set(ch.key, (ed = new Map()));
    ed.set(i, m);
    this.editsDirty = true;
    // neighbours whose faces or AO read this voxel
    if (lx === 0) this.dirtyChunk(cx - 1, cy, cz); else if (lx === CS - 1) this.dirtyChunk(cx + 1, cy, cz);
    if (ly === 0) this.dirtyChunk(cx, cy - 1, cz); else if (ly === CS - 1) this.dirtyChunk(cx, cy + 1, cz);
    if (lz === 0) this.dirtyChunk(cx, cy, cz - 1); else if (lz === CS - 1) this.dirtyChunk(cx, cy, cz + 1);
    if (this.onChange) this.onChange(vx, vy, vz, old, m);
    return old;
  }
  dirtyChunk(cx, cy, cz) { const n = this.chunks.get(key3(cx, cy, cz)); if (n) n.dirty = true; }

  // ------------------------------------------------------------ queries
  /**
   * DDA through voxels from origin (meters) along dir (normalized) up to maxDist meters.
   * Returns { vx, vy, vz, m, nx, ny, nz, dist, x, y, z } for the first voxel where test(m) is true.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, test = (m) => OPAQUE[m] === 1) {
    let vx = Math.floor(ox * VOX), vy = Math.floor(oy * VOX), vz = Math.floor(oz * VOX);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1 / (dx * VOX || 1e-9)), tdy = Math.abs(1 / (dy * VOX || 1e-9)), tdz = Math.abs(1 / (dz * VOX || 1e-9));
    const fx = ox * VOX - vx, fy = oy * VOX - vy, fz = oz * VOX - vz;
    let tx = (dx > 0 ? 1 - fx : fx) * tdx, ty = (dy > 0 ? 1 - fy : fy) * tdy, tz = (dz > 0 ? 1 - fz : fz) * tdz;
    let nx = 0, ny = 0, nz = 0, t = 0;
    const tmax = maxDist;
    for (let i = 0; i < 2000; i++) {
      const m = this.voxelAt(vx, vy, vz);
      if (i > 0 && test(m)) return { vx, vy, vz, m, nx, ny, nz, dist: t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t };
      if (tx < ty && tx < tz) { t = tx; tx += tdx; vx += sx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { t = ty; ty += tdy; vy += sy; nx = 0; ny = -sy; nz = 0; }
      else { t = tz; tz += tdz; vz += sz; nx = 0; ny = 0; nz = -sz; }
      if (t > tmax) return null;
    }
    return null;
  }

  /** The deposit (if any) that owns an ore voxel. */
  depositAt(vx, vy, vz) {
    const ch = this.chunks.get(key3(vx >> CB, vy >> CB, vz >> CB));
    if (!ch) return null;
    const x = (vx + 0.5) / VOX, y = (vy + 0.5) / VOX, z = (vz + 0.5) / VOX;
    let best = null, bd = 1e9;
    for (const d of ch.deps) {
      const dd = Math.hypot(x - d.x, y - d.y, z - d.z) - d.r;
      if (dd < bd) { bd = dd; best = d; }
    }
    return best && bd < 0.35 ? best : null;
  }

  /** Deposits within r meters of a point (only loaded chunks). */
  depositsNear(x, y, z, r) {
    const out = new Set();
    const c0 = Math.floor((x - r) * VOX) >> CB, c1 = Math.floor((x + r) * VOX) >> CB;
    const e0 = Math.floor((y - r) * VOX) >> CB, e1 = Math.floor((y + r) * VOX) >> CB;
    const f0 = Math.floor((z - r) * VOX) >> CB, f1 = Math.floor((z + r) * VOX) >> CB;
    for (let cz = f0; cz <= f1; cz++) for (let cy = e0; cy <= e1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const ch = this.chunks.get(key3(cx, cy, cz));
      if (!ch) continue;
      for (const d of ch.deps) if (Math.hypot(d.x - x, d.y - y, d.z - z) < r + d.r) out.add(d);
    }
    return [...out];
  }

  depState(d) {
    let s = this.depositState.get(d.id);
    if (!s) this.depositState.set(d.id, (s = { taken: false, hits: 0, q: d.q, brushed: 0, seen: false }));
    return s;
  }

  // ------------------------------------------------------------ persistence
  loadEdits() {
    try {
      const raw = localStorage.getItem(WORLD_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.seed !== this.seed) return;
      for (const [k, list] of Object.entries(d.edits || {})) {
        const m = new Map();
        if (d.v === 2) {
          // runs: [gap from the previous run's end, length, material] × n
          let at = 0;
          for (let i = 0; i < list.length; i += 3) { at += list[i]; for (let j = 0; j < list[i + 1]; j++) m.set(at + j, list[i + 2]); at += list[i + 1]; }
        } else for (let i = 0; i < list.length; i += 2) m.set(list[i], list[i + 1]);
        this.edits.set(+k, m);
      }
      for (const [id, s] of Object.entries(d.deps || {})) this.depositState.set(id, s);
    } catch (e) { console.warn('world load failed', e); }
  }

  saveEdits() {
    if (!this.editsDirty) return;
    const edits = {};
    // run-length encoded per chunk (dug tunnels are long runs of air along x)
    for (const [k, m] of this.edits) {
      const idx = [...m.keys()].sort((a, b) => a - b);
      // flowing fluid keeps partial levels only in memory: shallow films save as air, so a reload
      // never turns a thin puddle into a full voxel of water
      const lv = this.fluidChunks?.get(k);
      const val = lv ? (i) => { const v = m.get(i); return v && MAT[v]?.fluid && lv[i] && lv[i] < 4 ? 0 : v; } : (i) => m.get(i);
      const list = [];
      let end = 0;
      for (let i = 0; i < idx.length;) {
        const start = idx[i], mat = val(start);
        let n = 1;
        while (i + n < idx.length && idx[i + n] === start + n && val(idx[i + n]) === mat) n++;
        list.push(start - end, n, mat);
        end = start + n;
        i += n;
      }
      edits[k] = list;
    }
    const deps = {};
    for (const [id, s] of this.depositState) if (s.taken || s.hits) deps[id] = s;
    try { localStorage.setItem(WORLD_KEY, JSON.stringify({ v: 2, seed: this.seed, edits, deps })); this.editsDirty = false; } catch (e) { console.warn('world save failed', e); }
  }

  static wipe() { try { localStorage.removeItem(WORLD_KEY); } catch (e) { /* noop */ } }
}

export { key3, CB, MAT, ORE_BASE };

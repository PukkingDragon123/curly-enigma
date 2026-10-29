// The flow: a cellular automaton on the voxel grid (1/16 m) with fluid levels in eighths.
//
// Lakes sit still until something opens them. Then water pours out and runs: down first (two
// cells a step through open air, so a fall reads as one ribbon), into part-filled cells below, on
// the way it was already running (streams keep their momentum), and sideways, levelling out with
// lower neighbours. Pools settle flat and fall asleep (nothing is queued once every cell is within
// an eighth of its neighbours). Thin films soak into porous floors (dirt, sand, gravel, moss) in a
// few seconds and dry off stone in half a minute; anything deeper stays as a puddle. Lava moves on
// every other step, thick and slow, and cools to rock; water meeting lava boils off into steam and
// leaves obsidian behind.
//
// Lakes are reservoirs: what flows out of a lake is taken from its top layer, which sinks smoothly
// (in the shader, fLake/fLakeDrop) and is removed once spent. A lake gives at most LAKE_RATE eighths
// a step (a gush, not a flood) and MAX_DRAIN voxels in all; past that the rest of the water above
// the opening drains away into the rock (the surface keeps sinking, nothing more pours out), so a
// lake never ends up as a wall of water facing open air.
//
// Work is budgeted in time per frame and only cells within SIM_R of the mole move; the rest sleep
// until it comes back. Everything is typed arrays per chunk ("slot"): levels (shared with the
// mesher as world.fluidChunks), momentum, the step of the last change, queue flags. Air ↔ fluid
// changes are written straight into the chunk and the world's edits (they never change the rock
// mesh); anything that makes rock goes through world.setVoxel. Part-filled levels are saved under
// `moleforge.fluids.v1` (per world seed) so a reload brings pools back exactly.
import { VOX, M, MAT } from '../materials.js';
import { OPAQUE, FLUID, meshChunkFluid } from '../Mesher.js';
import { CS } from '../Generator.js';
import { lakeTop } from './lakes.js';

const CB = Math.log2(CS), CM = CS - 1;
const LB = 3 * CB, LM = (1 << LB) - 1; // a cell key is slot << LB | chunk-local index
const N3 = CS * CS * CS;
export const RATE = 20; // flow steps per second
const LAVA_EVERY = 2; // lava moves on every 2nd step
const BUDGET_MS = 2.2; // flow work per frame
const REMESH_MS = 2.5; // fluid surface rebuilds per frame
const REMESH_GAP = 0.15; // s between rebuilds of one chunk's fluid surface
export const SIM_R = 24; // meters: flows farther from the mole sleep
const MAX_DRAIN = 48000 * (VOX / 16) ** 3; // voxels a lake gives before the rest sinks away
const LAKE_RATE = 512; // eighths a lake may give per step
const SINK_RATE = 5; // voxel layers per second a spent lake sinks by
const LAKE_MS = 1.5; // removing a spent lake layer, per frame
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SAVE_KEY = 'moleforge.fluids.v1';
const Q = 1, Z = 2, V = 4, P = 8; // cell flags: queued, asleep, visited (levelling), a levelling seed
const LEVEL_MAX = 8192; // cells a levelling pass may take

// floors a thin film soaks into
const POROUS = new Uint8Array(256);
for (const m of [M.DIRT, M.LOAM, M.SAND, M.GRAVEL, M.MOSS, M.MYCEL, M.ASH, M.SNOW, M.ROOTS, M.RUBBLE, M.FERN, M.VINES, M.CLAY]) if (m !== undefined) POROUS[m] = 1;

export const ckey = (cx, cy, cz) => ((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512); // = World's key3
const hashK = (k) => { const s = Math.sin(k * 0.000123 + (k % 977) * 12.9898) * 43758.5453; return s - Math.floor(s); };

/** A growable queue of cell keys. */
class Queue {
  constructor() { this.a = new Int32Array(4096); this.n = 0; this.h = 0; }
  push(k) {
    if (this.n === this.a.length) { const b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = k;
  }
  get size() { return this.n - this.h; }
  clear() { this.n = 0; this.h = 0; }
}

export class FlowSim {
  /** hooks: { touched(ch) } (a chunk's fluid changed: for the water map) */
  constructor(world, plan, hooks = {}) {
    this.w = world;
    this.hooks = hooks;
    this.slots = []; // { cx, cy, cz, ck, ch, lv, md, tm, q, n, qn }
    this.slotOf = new Map();
    this.freeSlots = [];
    this.cl = new Map(); // chunk key → level array (for the mesher)
    world.fluidChunks = this.cl;
    this.A = new Queue(); // this step's cells
    this.B = new Queue(); // woken for the next step
    this.sleepers = [];
    this.seeds = []; // resting cells on a sloping pool surface (levelled a pool at a time)
    this.springs = []; // { vx, vy, vz, m, rate }: cells that keep pouring (debug and set pieces)
    this.levelT = 0;
    this.pend = new Set(); // chunks waiting for a fluid surface rebuild
    this.tick = 0; // steps so far
    this.acc = 0;
    this.lc = null;
    this.self = false;
    this.mix = false; this.seenL = false; this.seenW = false; this.lavaNear = false; this.waterNear = false;
    this.lavaCells = 0; this.waterCells = 0;
    // what happened in the last step, for the effects: falls/lands (x, y, z, m), foams (vx, vy, vz), steams (x, y, z)
    this.falls = []; this.lands = []; this.foams = []; this.steams = []; this.drains = [];
    this.spots = []; // lava surfaces near the mole (for lights)
    this.stats = { ms: 0, maxMs: 0, steps: 0, cells: 0, edits: 0, last: 0, remesh: 0 };
    this.prof = { run: 0, lvl: 0, mesh: 0, rest: 0, peak: 0 };
    this.sweepS = 0; this.periodT = 0; this.gcT = 10; this.saveT = 20;
    this.dirtySave = false;
    this.lakes = plan.features.filter((f) => f.kind === 'lake').map((f, id) => {
      const top0 = lakeTop(f, VOX);
      return {
        id, f, fluid: f.fluid, x: f.x, y: f.y, z: f.z, r: f.r, top0, top: top0,
        vy0: Math.floor((f.y - f.r * 0.56) * VOX) - 1,
        vx0: Math.floor((f.x - f.r * 1.05) * VOX), vx1: Math.ceil((f.x + f.r * 1.05) * VOX),
        vz0: Math.floor((f.z - f.r * 1.05) * VOX), vz1: Math.ceil((f.z + f.r * 1.05) * VOX),
        debt: 0, cells: null, drained: 0, dry: top0 < Math.floor((f.y - f.r * 0.56) * VOX), give: LAKE_RATE, low: 1e9, sink: false, rm: -1,
      };
    });
    this.load();
  }

  /** Part-filled cells the flow is keeping (for stats). */
  get cells() { let n = 0; for (const S of this.slots) if (S) n += S.n; return n; }
  /** Cells waiting for a step. */
  get active() { return this.A.size + this.B.size; }

  // ------------------------------------------------------------------ voxel access (world coords)
  vox(vx, vy, vz) {
    const cx = vx >> CB, cy = vy >> CB, cz = vz >> CB;
    let ch = this.lc;
    if (!ch || ch.cx !== cx || ch.cy !== cy || ch.cz !== cz) {
      ch = this.w.chunk(cx, cy, cz);
      if (!ch) return -1;
      this.lc = ch;
    }
    if (!ch.vox) return M.STONE; // solid rock all through (a virtual chunk)
    return ch.vox[(vx & CM) + CS * ((vy & CM) + CS * (vz & CM))];
  }
  /** Stored level at a voxel (0 = untouched: full if it's fluid). */
  lvAt(vx, vy, vz) {
    const s = this.slotOf.get(ckey(vx >> CB, vy >> CB, vz >> CB));
    const a = s === undefined ? null : this.slots[s].lv;
    return a ? a[(vx & CM) + CS * ((vy & CM) + CS * (vz & CM))] : 0;
  }
  /** A stream's running direction at a voxel (0 = none, 1..4 = +x, -x, +z, -z). */
  mdAt(vx, vy, vz) {
    const s = this.slotOf.get(ckey(vx >> CB, vy >> CB, vz >> CB));
    const a = s === undefined ? null : this.slots[s].md;
    return a ? a[(vx & CM) + CS * ((vy & CM) + CS * (vz & CM))] : 0;
  }
  /** Level 1..8 of fluid at a voxel (0 when it isn't fluid). */
  levelAt(vx, vy, vz) {
    const m = this.vox(vx, vy, vz);
    if (!FLUID[m]) return 0;
    return this.lvAt(vx, vy, vz) || 8;
  }

  // ------------------------------------------------------------------ cells (keys)
  slotAt(cx, cy, cz) {
    const ck = ckey(cx, cy, cz);
    let s = this.slotOf.get(ck);
    if (s === undefined) {
      s = this.freeSlots.length ? this.freeSlots.pop() : this.slots.length;
      this.slots[s] = { cx, cy, cz, ck, ch: this.w.chunk(cx, cy, cz) || null, lv: null, md: null, tm: null, q: new Uint8Array(N3), n: 0, qn: 0 };
      this.slotOf.set(ck, s);
    }
    return s;
  }
  key(vx, vy, vz) { return (this.slotAt(vx >> CB, vy >> CB, vz >> CB) << LB) | ((vx & CM) + CS * ((vy & CM) + CS * (vz & CM))); }
  /** The cell next to key k. */
  nb(k, dx, dy, dz) {
    const li = k & LM;
    const lx = (li & CM) + dx, ly = ((li >> CB) & CM) + dy, lz = (li >> (2 * CB)) + dz;
    if (lx >= 0 && lx < CS && ly >= 0 && ly < CS && lz >= 0 && lz < CS) return k - li + lx + CS * (ly + CS * lz);
    const S = this.slots[k >> LB];
    return this.key(S.cx * CS + lx, S.cy * CS + ly, S.cz * CS + lz);
  }
  /** Material at key k (-1 when its chunk isn't loaded). */
  mk(k) { const ch = this.slots[k >> LB].ch; return ch ? (ch.vox ? ch.vox[k & LM] : M.STONE) : -1; }
  /** Level at key k: 1..8 (untouched fluid counts as full). */
  lk(k) { const a = this.slots[k >> LB].lv; return (a && a[k & LM]) || 8; }
  kx(k) { return this.slots[k >> LB].cx * CS + (k & CM); }
  ky(k) { return this.slots[k >> LB].cy * CS + ((k >> CB) & CM); }
  kz(k) { return this.slots[k >> LB].cz * CS + ((k >> (2 * CB)) & CM); }
  arrays(S) {
    if (!S.lv) {
      S.lv = new Uint8Array(N3); S.md = new Uint8Array(N3); S.tm = new Uint16Array(N3);
      this.cl.set(S.ck, S.lv);
    }
  }
  lvSet(k, l) {
    const S = this.slots[k >> LB], li = k & LM;
    if (!S.lv) this.arrays(S);
    if (!S.lv[li]) S.n++;
    S.lv[li] = l;
    S.tm[li] = this.tick;
    this.dirtySave = true;
  }
  lvDel(k) {
    const S = this.slots[k >> LB], li = k & LM;
    if (S.lv && S.lv[li]) { S.lv[li] = 0; S.md[li] = 0; S.n--; this.dirtySave = true; }
  }
  /** Queue a cell for the next step (once). */
  push(k) {
    const S = this.slots[k >> LB], li = k & LM, f = S.q[li];
    if (f & Q) return;
    if (!f) S.qn++;
    S.q[li] = f | Q;
    this.B.push(k);
  }
  /** A cell changed: it and the cells that may pour into it (or that it may pour into) get a turn. */
  wake(k) {
    this.push(k); this.push(this.nb(k, 0, 1, 0)); this.push(this.nb(k, 1, 0, 0)); this.push(this.nb(k, -1, 0, 0)); this.push(this.nb(k, 0, 0, 1)); this.push(this.nb(k, 0, 0, -1));
  }
  /** Air ↔ fluid: write the voxel and the edit (saved like any other), rebuild only the fluid. */
  setF(k, m) {
    const w = this.w, S = this.slots[k >> LB], ch = S.ch, i = k & LM;
    if (!ch || !ch.vox || ch.vox[i] === m) return;
    ch.vox[i] = m;
    let ed = w.edits.get(ch.key);
    if (!ed) w.edits.set(ch.key, (ed = new Map()));
    ed.set(i, m);
    w.editsDirty = true;
    this.touch(k);
    this.stats.edits++;
  }
  /** Anything that changes rock goes through the world (full remesh, onChange). */
  setV(vx, vy, vz, m) {
    this.self = true;
    this.w.setVoxel(vx, vy, vz, m);
    this.self = false;
    this.lc = null;
    this.stats.edits++;
    const S = this.slots[this.slotOf.get(ckey(vx >> CB, vy >> CB, vz >> CB))];
    if (S) S.ch = this.w.chunk(S.cx, S.cy, S.cz) || null; // a virtual chunk may have become real
  }
  /** A fluid surface changed: its chunk (and neighbours whose corners read it) need a rebuild. */
  touch(k) {
    const S = this.slots[k >> LB], w = this.w, q = this.pend;
    if (S.ch) q.add(S.ch);
    const li = k & LM, lx = li & CM, ly = (li >> CB) & CM, lz = li >> (2 * CB);
    if (lx && ly && lz && lx < CM && ly < CM && lz < CM) return;
    const ex = lx === 0 ? -1 : lx === CM ? 1 : 0, ey = ly === 0 ? -1 : ly === CM ? 1 : 0, ez = lz === 0 ? -1 : lz === CM ? 1 : 0;
    let n;
    if (ex && (n = w.chunk(S.cx + ex, S.cy, S.cz))) q.add(n);
    if (ey && (n = w.chunk(S.cx, S.cy + ey, S.cz))) q.add(n);
    if (ez && (n = w.chunk(S.cx, S.cy, S.cz + ez))) q.add(n);
    if (ex && ez && (n = w.chunk(S.cx + ex, S.cy, S.cz + ez))) q.add(n);
  }
  /**
   * Rebuild the fluid surfaces of changed chunks: within the frame's time, and each chunk at most
   * every REMESH_GAP seconds (a pool under a waterfall changes every step; nobody sees 20 Hz there).
   */
  flushRemesh() {
    const t0 = performance.now(), now = this.time;
    for (const ch of this.pend) {
      if (this.w.chunk(ch.cx, ch.cy, ch.cz) !== ch) { this.pend.delete(ch); continue; } // gone
      if (now - (ch.fluidT || 0) < REMESH_GAP) continue;
      this.pend.delete(ch);
      this.hooks.touched?.(ch);
      if (ch.dirty) continue; // the terrain rebuilds it anyway
      ch.fluidT = now;
      const fm = ch.fluidMesh;
      const geo = fm ? meshChunkFluid(this.w, ch) : null;
      if (geo) { const old = fm.geometry; fm.geometry = geo; old.dispose(); } else ch.dirty = true; // first or last fluid: full rebuild
      this.stats.remesh++;
      if (performance.now() - t0 > REMESH_MS) break;
    }
  }
  /** Fluid m at level l (0 = none) into cell k whose current material is cur. */
  put(k, m, l, cur) {
    if (l <= 0) {
      this.lvDel(k);
      if (cur !== 0) { if (FLUID[cur]) this.setF(k, 0); else this.setV(this.kx(k), this.ky(k), this.kz(k), 0); }
      return;
    }
    this.lvSet(k, l);
    if (cur === m) this.touch(k);
    else if (!cur) this.setF(k, m);
    else this.setV(this.kx(k), this.ky(k), this.kz(k), m);
  }

  // ------------------------------------------------------------------ lakes (finite reservoirs)
  lakeAt(vx, vy, vz, m) {
    for (const L of this.lakes) {
      if (L.fluid !== m || vy > L.top || vy < L.vy0 || vx < L.vx0 || vx > L.vx1 || vz < L.vz0 || vz > L.vz1) continue;
      const dx = ((vx + 0.5) / VOX - L.x) / L.r, dy = ((vy + 0.5) / VOX - L.y) / (L.r * 0.55), dz = ((vz + 0.5) / VOX - L.z) / L.r;
      if (dx * dx + dy * dy + dz * dz < 1.08) return L;
    }
    return null;
  }
  /** Collect the cells of a lake's top layer (skipping layers drained in an earlier visit). */
  scanTop(L) {
    for (let tries = 0; tries < 24; tries++) {
      const list = [];
      let unloaded = false;
      const dy = ((L.top + 0.5) / VOX - L.y) / (L.r * 0.55);
      // only the square round this layer's circle
      const rr = Math.sqrt(Math.max(0, 1.08 - dy * dy)) * L.r;
      const x0 = Math.max(L.vx0, Math.floor((L.x - rr) * VOX)), x1 = Math.min(L.vx1, Math.ceil((L.x + rr) * VOX));
      const z0 = Math.max(L.vz0, Math.floor((L.z - rr) * VOX)), z1 = Math.min(L.vz1, Math.ceil((L.z + rr) * VOX));
      for (let vz = z0; vz <= z1; vz++) for (let vx = x0; vx <= x1; vx++) {
        const dx = ((vx + 0.5) / VOX - L.x) / L.r, dz = ((vz + 0.5) / VOX - L.z) / L.r;
        if (dx * dx + dy * dy + dz * dz >= 1.08) continue;
        const m = this.vox(vx, L.top, vz);
        if (m < 0) unloaded = true;
        else if (m === L.fluid && !this.lvAt(vx, L.top, vz)) list.push(vx, vz);
      }
      // (part of the layer may not be loaded yet: use what is, look again in a while)
      if (list.length) { L.cells = list; L.partial = unloaded; L.scanT = this.time + 2; return; }
      if (unloaded) { L.cells = null; L.scanT = this.time + 1; return; } // can't tell yet
      L.top--; // this layer is already gone (drained on an earlier visit)
      if (L.top < L.vy0) break;
    }
    L.dry = true;
    L.cells = [];
  }
  /** The lake gave `a` eighths (from a cell at layer vy): its top layer sinks; a spent layer goes. */
  drain(L, a, vy) {
    if (!L.cells && this.time >= (L.scanT || 0)) this.scanTop(L);
    if (L.dry) return;
    L.debt += a;
    L.give -= a;
    L.drained += a / 8;
    if (vy < L.low) L.low = vy;
    if (L.drained >= MAX_DRAIN && !L.sink) { L.sink = true; this.drains.push(L); }
    this.layer(L);
  }
  /**
   * Once the lake has given (or sunk) a whole layer's worth, its top layer goes: a few thousand
   * cells a frame (lakeWork), while the shader holds that layer sunk by a full voxel.
   */
  layer(L) {
    if (!L.cells || L.rm >= 0) return;
    // (a layer only partly loaded waits: the rest of it must go down with it)
    if (L.debt >= (L.cells.length / 2) * 8 && !L.partial) L.rm = 0;
  }
  lakeWork(t0) {
    for (const L of this.lakes) {
      if (!(L.rm >= 0)) continue;
      const C = L.cells;
      if (!C) { L.rm = -1; continue; }
      let i = L.rm;
      for (; i < C.length; i += 2) {
        const vx = C[i], vz = C[i + 1];
        if (this.vox(vx, L.top, vz) === L.fluid && !this.lvAt(vx, L.top, vz)) this.setF(this.key(vx, L.top, vz), 0);
        if ((i & 255) === 0 && performance.now() - t0 > LAKE_MS) break;
      }
      L.rm = i;
      if (i < C.length) return; // more next frame
      L.rm = -1;
      L.debt = Math.max(0, L.debt - (C.length / 2) * 8);
      L.top--;
      L.cells = null;
      this.scanTop(L);
      this.drains.push(L);
      return;
    }
  }
  /** A spent lake sinks below its opening, then rests (it can be opened again lower down). */
  sinkLakes(dt) {
    for (const L of this.lakes) {
      if (!L.sink || L.dry) continue;
      if (!L.cells) { if (this.time < (L.scanT || 0)) continue; this.scanTop(L); if (!L.cells) continue; }
      if (L.top < L.low) { L.sink = false; L.drained = 0; L.low = 1e9; continue; }
      if (L.rm >= 0) continue; // still clearing the last layer
      L.debt = Math.min(L.debt + (L.cells.length / 2) * 8 * SINK_RATE * dt, (L.cells.length / 2) * 8);
      this.layer(L);
    }
  }

  // ------------------------------------------------------------------ the flow
  /** Advance the flow (fixed rate, time-budgeted). p*: the mole in voxels. */
  update(dt, px, py, pz) {
    const t0 = performance.now();
    this.lc = null;
    this.time = (this.time || 0) + dt;
    this.acc = Math.min(this.acc + dt * RATE, 3);
    for (const S of this.slots) if (S) S.ch = this.w.chunk(S.cx, S.cy, S.cz) || null; // chunks come and go
    this.sinkLakes(dt);
    this.lakeWork(t0);
    let work = 0;
    while (this.acc >= 1 && (this.A.size || this.B.size || this.springs.length)) {
      if (!this.A.size) {
        // a new step: the cells woken in the last one
        const t = this.A; this.A = this.B; this.B = t; this.B.clear();
        this.tick = (this.tick + 1) & 0xffff;
        this.stepStart();
      }
      work += this.run(px, py, pz, t0);
      if (this.A.size) break; // out of time: carry on next frame
      this.acc -= 1;
    }
    if (!this.A.size && !this.B.size && !this.springs.length) this.acc = 0;
    const ms = performance.now() - t0;
    const S = this.stats;
    if (work) { S.ms = S.ms * 0.9 + ms * 0.1; S.maxMs = Math.max(S.maxMs * 0.995, ms); S.last = ms; S.cells = S.cells * 0.9 + work * 0.1; }
    const t1 = performance.now();
    this.levelT -= dt;
    if (this.levelT <= 0 && this.seeds.length) { this.levelT = 0.3; this.levelPools(); }
    const t2 = performance.now();
    this.flushRemesh();
    const t3 = performance.now();
    this.periodic(dt, px, py, pz);
    const t4 = performance.now();
    // frame cost by part (ms, smoothed; peaks decay slowly)
    const P = this.prof, k = 0.1;
    P.run += (t1 - t0 - P.run) * k; P.lvl += (t2 - t1 - P.lvl) * k; P.mesh += (t3 - t2 - P.mesh) * k; P.rest += (t4 - t3 - P.rest) * k;
    P.peak = Math.max(P.peak * 0.99, t4 - t0);
  }
  stepStart() {
    this.stats.steps++;
    this.falls.length = 0; this.lands.length = 0;
    for (const L of this.lakes) L.give = LAKE_RATE;
    // springs keep pouring (eighths per step) into their cell while there's room
    for (const sp of this.springs) this.add(sp.vx, sp.vy, sp.vz, sp.m, sp.rate);
  }
  /** Take cells off this step's queue until it's empty or the frame's time is up. */
  run(px, py, pz, t0) {
    const A = this.A, a = A.a, R = SIM_R * VOX;
    const lavaStep = this.tick % LAVA_EVERY === 0;
    let n = 0, i = 0;
    while (A.h < A.n) {
      const k = a[A.h++];
      const S = this.slots[k >> LB];
      if (!S) continue;
      const li = k & LM;
      let f = S.q[li];
      f &= ~Q;
      S.q[li] = f;
      if (!f) S.qn--;
      const vx = S.cx * CS + (li & CM), vy = S.cy * CS + ((li >> CB) & CM), vz = S.cz * CS + (li >> (2 * CB));
      if (Math.abs(vx - px) > R || Math.abs(vz - pz) > R || Math.abs(vy - py) > R || !S.ch || !S.ch.vox) { this.doze(k, S, li); continue; }
      n += this.cell(k, S, li, vx, vy, vz, lavaStep);
      if ((++i & 15) === 0 && performance.now() - t0 > BUDGET_MS) break;
    }
    if (A.h >= A.n) A.clear();
    return n;
  }
  doze(k, S, li) {
    const f = S.q[li];
    if (f & Z) return;
    if (!f) S.qn++;
    S.q[li] = f | Z;
    this.sleepers.push(k);
  }

  /** One cell's turn. Returns the work done (0 for cells that were just skipped). */
  cell(k, S, li, vx, vy, vz, lavaOK) {
    const ch = S.ch;
    const m = ch.vox[li];
    if (!FLUID[m]) { if (S.lv && S.lv[li]) this.lvDel(k); return 0; }
    const lava = m === M.LAVA;
    if (!this.mix) {
      if (lava) this.seenL = true; else this.seenW = true;
      if ((this.seenL || this.lavaNear) && (this.seenW || this.waterNear)) this.mix = true;
    }
    if (lava && !lavaOK) { this.push(k); return 0; }
    let l = S.lv ? S.lv[li] : 0, L = null;
    if (!l) {
      l = 8;
      L = this.lakeAt(vx, vy, vz, m);
      if (L) {
        if (L.dry || L.sink) return 1; // a spent lake stays put while it sinks
        if (L.give <= 0) { this.push(k); return 1; } // it has given enough this step
      }
    }
    if (this.mix && this.react(k, vx, vy, vz, m, L)) return 1;
    // 1. down: through open air two cells a step
    const kb = this.nb(k, 0, -1, 0);
    const bm = this.mk(kb);
    if (bm === 0) {
      let to = kb;
      const k2 = this.nb(kb, 0, -1, 0);
      if (this.mk(k2) === 0) to = k2;
      this.put(to, m, l, 0);
      if (L) this.drain(L, l, vy); else this.put(k, m, 0, m);
      this.wake(k); this.push(to);
      this.fallFx(vx, vy, vz, m, to === k2);
      return 1;
    }
    let moved = 0;
    if (bm === m) {
      const lb = this.lk(kb);
      if (lb < 8) {
        const t = Math.min(8 - lb, l);
        this.put(kb, m, lb + t, m);
        l -= t; moved += t;
        this.push(kb);
      }
    }
    // 2. over the edge: an open cell beside us with part-filled water under it takes what makes
    //    the two surfaces even (water levels across layers, not just within one)
    if (l > 0 && bm !== 0) {
      for (let j = 0; j < 4 && l > 0; j++) {
        const d = D4[j];
        const nk = this.nb(k, d[0], 0, d[1]);
        if (this.mk(nk) !== 0) continue;
        const nb = this.nb(nk, 0, -1, 0);
        if (this.mk(nb) !== m) continue;
        const lb = this.lk(nb);
        if (lb >= 8 || l + 8 - lb < 2) continue;
        const t = Math.min(l, 8 - lb, (l + 8 - lb) >> 1);
        if (t < 1) continue;
        this.put(nb, m, lb + t, m);
        this.push(nb);
        l -= t; moved += t;
      }
      if (l <= 0) {
        if (L) this.drain(L, moved, vy); else this.put(k, m, 0, m);
        this.wake(k);
        return 1;
      }
    }
    const md = S.md;
    // 3. a stream keeps running the way it was going (water only: lava has no hurry)
    if (l > 1 && bm !== 0 && !lava && md && md[li]) {
      const dir = md[li], d = D4[dir - 1];
      const nk = this.nb(k, d[0], 0, d[1]);
      const nm = this.mk(nk);
      const ln = nm === 0 ? 0 : nm === m ? this.lk(nk) : 99;
      // a running stream moves on even a step downhill (it stops at a wall or when level)
      if (ln < l) {
        const t = (l - ln + 1) >> 1;
        this.put(nk, m, ln + t, nm);
        this.slots[nk >> LB].md[nk & LM] = dir;
        this.push(nk);
        l -= t; moved += t;
      } else md[li] = 0;
    }
    // 4. sideways, levelling out, from cells resting on something
    if (l > 1 && bm !== 0) {
      let n = 0, total = l;
      const r0 = (Math.random() * 4) | 0;
      for (let j = 0; j < 4; j++) {
        const di = (j + r0) & 3, d = D4[di];
        const nk = this.nb(k, d[0], 0, d[1]);
        const nm = this.mk(nk);
        let ln;
        if (nm === 0) ln = 0;
        else if (nm === m) ln = this.lk(nk);
        else continue;
        if (ln < l - 1) { CX[n] = vx + d[0]; CZ[n] = vz + d[1]; CL[n] = ln; CM_[n] = nm; CK[n] = nk; CD[n] = di + 1; n++; total += ln; }
      }
      if (n) {
        // water levels out (share and share alike, remainder handed round); lava only oozes
        let share = 0, cnt = n;
        for (let it = 0; it < 4; it++) {
          share = Math.floor(total / (cnt + 1));
          let dropped = false;
          for (let j = 0; j < n; j++) if (CL[j] > share) { total -= CL[j]; CL[j] = -1 - CL[j]; cnt--; dropped = true; }
          if (!dropped) break;
        }
        if (lava && share < 2) {
          // too thin to spread evenly: ooze into one neighbour, keeping blobs at least 2 deep
          for (let j = 0; j < n; j++) {
            if (CL[j] < 0) continue;
            const t = (l - CL[j]) >> 1;
            if (CL[j] + t >= 2 && l - t >= 2) {
              this.put(CK[j], m, CL[j] + t, CM_[j]);
              this.push(CK[j]);
              l -= t; moved += t;
            }
            break;
          }
        } else if (cnt > 0) {
          let rem = total - share * (cnt + 1);
          let keep = share;
          if (rem > 0) { keep++; rem--; }
          for (let j = 0; j < n; j++) {
            if (CL[j] < 0) continue;
            let nl = share;
            if (rem > 0) { nl++; rem--; }
            const g = nl - CL[j];
            if (g <= 0) continue;
            this.put(CK[j], m, nl, CM_[j]);
            if (!lava && g >= 2) this.slots[CK[j] >> LB].md[CK[j] & LM] = CD[j];
            this.push(CK[j]);
            moved += g;
            if (g >= 3 && this.foams.length < 90 && Math.random() < 0.15) this.foams.push(CX[j], vy, CZ[j]);
          }
          l = keep + rem; // whatever couldn't be handed out stays
        }
      }
    }
    if (!moved) {
      // at rest, but a step off its neighbours: a pool still sloping. Levelled as a whole later.
      if (!L && !lava && S.lv && S.lv[li] >= 2 && !(S.q[li] & P) && this.slopes(k, m, S.lv[li])) { S.q[li] |= P; if (!(S.q[li] & ~P)) S.qn++; this.seeds.push(k); }
      return 1;
    }
    if (L) this.drain(L, moved, vy); // the lake gives; this cell stays full
    else this.put(k, m, l, m);
    this.wake(k);
    return 1;
  }

  /** Is this resting top cell a step (one eighth) off a neighbour in its layer? */
  slopes(k, m, l) {
    if (this.mk(this.nb(k, 0, 1, 0)) === m) return false; // not on top
    for (let j = 0; j < 4; j++) {
      const d = D4[j], nk = this.nb(k, d[0], 0, d[1]);
      if (this.mk(nk) !== m) continue;
      const ln = this.lk(nk);
      if (ln !== l) return true;
    }
    return false;
  }

  /**
   * Pools level out at once: the connected top cells of a layer (flowing water only, not untouched
   * lake water) share their water evenly, so a pool rests flat instead of as a mound one eighth
   * steeper per cell. Edge cells beside open air then get a turn (to spread or spill over).
   */
  levelPools() {
    const seeds = this.seeds, t0 = performance.now();
    let i = 0;
    for (; i < seeds.length && performance.now() - t0 < 1.2; i++) {
      const k = seeds[i];
      const S = this.slots[k >> LB];
      if (!S) continue;
      const li = k & LM;
      if (S.q[li] & P) { S.q[li] &= ~P; if (!S.q[li]) S.qn--; } else continue; // levelled with an earlier seed's pool
      if (!S.ch || !S.ch.vox || !S.lv || !S.lv[li]) continue;
      const m = S.ch.vox[li];
      if (m === M.WATER) this.levelFrom(k, m);
    }
    this.seeds = i < seeds.length ? seeds.slice(i) : [];
  }
  levelFrom(seed, m) {
    const list = LIST, stack = STACK;
    let n = 0, sp = 0, T = 0, lo = 99, hi = 0, big = false;
    const mark = (k) => { const S = this.slots[k >> LB], li = k & LM; if (!S.q[li]) S.qn++; S.q[li] |= V; };
    stack[sp++] = seed; mark(seed);
    while (sp) {
      const k = stack[--sp];
      const S = this.slots[k >> LB], li = k & LM;
      // top cells of flowing water only, not the thin films round a pool
      if (!S.lv || S.lv[li] < 2 || this.mk(this.nb(k, 0, 1, 0)) === m) continue;
      if (n >= LEVEL_MAX) { big = true; break; }
      const l = S.lv[li];
      list[n++] = k; T += l;
      if (l < lo) lo = l; if (l > hi) hi = l;
      for (let j = 0; j < 4; j++) {
        const d = D4[j], nk = this.nb(k, d[0], 0, d[1]);
        const NS = this.slots[nk >> LB], ni = nk & LM;
        if (NS.q[ni] & V) continue;
        if (this.mk(nk) !== m) continue;
        if (sp >= STACK.length) { big = true; break; }
        stack[sp++] = nk; mark(nk);
      }
      if (big) break;
    }
    // unmark everything we touched (the list, and whatever is left on the stack)
    const unmark = (k) => { const S = this.slots[k >> LB], li = k & LM; if (S.q[li] & (V | P)) { S.q[li] &= ~(V | P); if (!S.q[li]) S.qn--; } };
    let changed = false;
    const st = this.stats;
    st.lvl = (st.lvl || 0) + 1; if (big) st.lvlBig = (st.lvlBig || 0) + 1; if (T < n) st.lvlThin = (st.lvlThin || 0) + 1;
    if (!big && n > 1 && hi - lo >= 1 && T >= n) {
      const base = Math.floor(T / n), r = T - base * n;
      for (let i = 0; i < n; i++) {
        const k = list[i];
        const nl = Math.min(8, base + (Math.floor(((i + 1) * r) / n) - Math.floor((i * r) / n)));
        const S = this.slots[k >> LB], li = k & LM;
        if (S.lv[li] === nl) continue;
        this.put(k, m, nl, m);
        changed = true;
        // edges beside open air spread or spill on
        for (let j = 0; j < 4; j++) { const d = D4[j], nk = this.nb(k, d[0], 0, d[1]); if (this.mk(nk) === 0) { this.push(k); break; } }
      }
    }
    for (let i = 0; i < n; i++) unmark(list[i]);
    while (sp) unmark(stack[--sp]);
    return changed || n > 64;
  }

  /** Water and lava touching: the lava sets into rock, the water boils off as steam. */
  react(k, vx, vy, vz, m, L) {
    const o = m === M.WATER ? M.LAVA : M.WATER;
    for (const d of D6) {
      const nk = this.nb(k, d[0], d[1], d[2]);
      if (this.mk(nk) !== o) continue;
      const nx = vx + d[0], ny = vy + d[1], nz = vz + d[2];
      const selfLava = m === M.LAVA;
      const lk = selfLava ? k : nk, wk = selfLava ? nk : k;
      const lx = selfLava ? vx : nx, ly = selfLava ? vy : ny, lz = selfLava ? vz : nz;
      const wx = selfLava ? nx : vx, wy = selfLava ? ny : vy, wz = selfLava ? nz : vz;
      const ll = this.lk(lk);
      this.lvDel(lk);
      this.setV(lx, ly, lz, ll >= 6 ? M.OBSIDIAN : M.BASALT);
      const WS = this.slots[wk >> LB], wl = WS.lv ? WS.lv[wk & LM] : 0;
      const WL = !wl ? (selfLava ? this.lakeAt(wx, wy, wz, M.WATER) : L) : null;
      if (WL && !WL.dry) this.drain(WL, 3, wy);
      else this.put(wk, M.WATER, (wl || 8) - 3, M.WATER);
      this.wake(lk); this.wake(wk);
      if (this.steams.length < 90) this.steams.push((lx + wx + 1) / (2 * VOX), (ly + wy + 1) / (2 * VOX), (lz + wz + 1) / (2 * VOX));
      return true;
    }
    return false;
  }

  fallFx(vx, vy, vz, m, two) {
    const x = (vx + 0.5) / VOX, y = vy / VOX, z = (vz + 0.5) / VOX;
    if (this.falls.length < 160) this.falls.push(x, y, z, m);
    const d = two ? 3 : 2;
    if (this.vox(vx, vy - d, vz) !== 0 && this.lands.length < 80) this.lands.push(x, (vy - d + 1) / VOX, z, m);
  }

  // ------------------------------------------------------------------ settling, sleeping, memory
  /** Films soak away or dry, still lava cools into rock: one slot per call. */
  sweep(px, py, pz) {
    const n = this.slots.length;
    if (!n) return;
    for (let tries = 0; tries < n; tries++) {
      const s = this.sweepS = (this.sweepS + 1) % n;
      const S = this.slots[s];
      if (!S || !S.lv || !S.n || !S.ch || !S.ch.vox) continue;
      const R = SIM_R * VOX;
      if (Math.abs(S.cx * CS + 16 - px) > R + 16 || Math.abs(S.cz * CS + 16 - pz) > R + 16 || Math.abs(S.cy * CS + 16 - py) > R + 16) continue;
      this.sweepSlot(s, S);
      return;
    }
  }
  sweepSlot(s, S) {
    const v = S.ch.vox, lv = S.lv, tm = S.tm, q = S.q, base = s << LB;
    let lavaN = 0, waterN = 0;
    for (let li = 0; li < N3; li++) {
      const l = lv[li];
      if (!l) continue;
      const m = v[li];
      if (!FLUID[m]) { this.lvDel(base | li); continue; }
      if (q[li] & Q) continue;
      const age = ((this.tick - tm[li]) & 0xffff) / RATE;
      const k = base | li;
      if (m === M.LAVA) {
        lavaN++;
        if (age > (l >= 8 ? 14 : 7) + hashK(k) * 5) {
          const vx = this.kx(k), vy = this.ky(k), vz = this.kz(k);
          this.lvDel(k);
          this.setV(vx, vy, vz, l >= 6 ? M.MAGMAROCK : M.BASALT);
          this.wake(k);
          if (this.steams.length < 90 && Math.random() < 0.3) this.steams.push((vx + 0.5) / VOX, (vy + 1) / VOX, (vz + 0.5) / VOX);
        } else if (this.spots.length < 64) this.spots.push((this.kx(k) + 0.5) / VOX, (this.ky(k) + 1) / VOX, (this.kz(k) + 0.5) / VOX);
      } else {
        waterN++;
        if (l > 2) continue;
        // the floor under it: soaks into dirt, sand, moss; dries slowly off stone
        const below = (li >> CB & CM) ? v[li - CS] : this.vox(this.kx(k), this.ky(k) - 1, this.kz(k));
        const porous = POROUS[below] === 1;
        const wait = porous ? 5 + hashK(k) * 4 : l === 1 ? 28 + hashK(k) * 12 : 1e9;
        if (age > wait) { this.put(k, m, l - 1, m); this.wake(k); }
      }
    }
    this.lavaCells = lavaN; this.waterCells = waterN;
  }

  /** Every second: sleepers near the mole again wake; now and then forget empty slots, save. */
  periodic(dt, px, py, pz) {
    this.sweepT = (this.sweepT || 0) - dt;
    if (this.sweepT <= 0) { this.sweepT = 0.1; this.sweep(px, py, pz); }
    this.periodT -= dt;
    if (this.periodT > 0) return;
    this.periodT = 1;
    this.spots.length = 0;
    if (this.sleepers.length) {
      const R = SIM_R * VOX * 0.9, keep = [];
      for (const k of this.sleepers) {
        const S = this.slots[k >> LB];
        if (!S) continue;
        const li = k & LM;
        if (!(S.q[li] & Z)) continue;
        S.ch = this.w.chunk(S.cx, S.cy, S.cz) || null;
        if (S.ch && S.ch.vox && Math.abs(this.kx(k) - px) < R && Math.abs(this.kz(k) - pz) < R && Math.abs(this.ky(k) - py) < R) {
          S.q[li] &= ~Z;
          if (!S.q[li]) S.qn--;
          this.push(k);
        } else keep.push(k);
      }
      this.sleepers = keep;
    }
    for (const L of this.lakes) if (L.partial && L.cells && this.time >= L.scanT && !(L.rm >= 0)) { L.cells = null; this.scanTop(L); this.layer(L); }
    // water and lava both around? then flows check for each other
    let lava = false, water = false;
    const x = px / VOX, y = py / VOX, z = pz / VOX;
    for (const L of this.lakes) {
      if (Math.abs(L.x - x) > L.r + 40 || Math.abs(L.z - z) > L.r + 40 || Math.abs(L.y - y) > L.r + 30) continue;
      if (L.fluid === M.LAVA) lava = true; else water = true;
    }
    this.lavaNear = lava; this.waterNear = water;
    this.mix = (lava || this.lavaCells > 0 || this.seenL) && (water || this.waterCells > 0 || this.seenW);
    this.seenL = this.seenW = false;
    this.gcT -= 1;
    if (this.gcT <= 0) { this.gcT = 10; this.gc(); }
    this.saveT -= 1;
    if (this.saveT <= 0) { this.saveT = 20; this.save(); }
  }
  /** Forget slots of chunks the flow has left (no levels, nothing queued or asleep). */
  gc() {
    for (let s = 0; s < this.slots.length; s++) {
      const S = this.slots[s];
      if (!S || S.n > 0 || S.qn > 0) continue;
      if (this.saved) delete this.saved[S.ck];
      this.slotOf.delete(S.ck);
      this.cl.delete(S.ck);
      this.slots[s] = null;
      this.freeSlots.push(s);
    }
  }

  // ------------------------------------------------------------------ edits from the game
  onVoxel(vx, vy, vz, old, m) {
    if (this.self) return;
    this.lc = null;
    const fo = FLUID[old], fm = FLUID[m];
    if (fo || fm) {
      const k = this.key(vx, vy, vz);
      this.slots[k >> LB].ch = this.w.chunk(vx >> CB, vy >> CB, vz >> CB) || null;
      if (fo && !fm) this.lvDel(k);
      if (fm) this.push(k);
      this.hooks.touched?.(this.slots[k >> LB].ch);
    }
    if (!OPAQUE[m]) {
      // opened up: fluid above or beside may pour in (nothing flows up)
      const w = this.w;
      for (const [dx, dy, dz] of OPEN) if (FLUID[w.voxelAt(vx + dx, vy + dy, vz + dz)]) { const k = this.key(vx + dx, vy + dy, vz + dz); this.slots[k >> LB].ch = w.chunk((vx + dx) >> CB, (vy + dy) >> CB, (vz + dz) >> CB) || null; this.push(k); }
    }
  }
  /** Pour fluid into a cell from outside the flow (a bucket, a spring): returns what fit. */
  add(vx, vy, vz, m, l) {
    this.lc = null;
    const cur = this.vox(vx, vy, vz);
    if (cur < 0 || (cur && cur !== m)) return 0;
    const k = this.key(vx, vy, vz);
    this.slots[k >> LB].ch = this.w.chunk(vx >> CB, vy >> CB, vz >> CB) || null;
    const have = cur === m ? this.lk(k) : 0, t = Math.min(8 - have, l);
    if (t <= 0) return 0;
    this.put(k, m, have + t, cur);
    this.wake(k);
    return t;
  }

  // ------------------------------------------------------------------ reading the water
  /** Top of the fluid column through (x, y, z) in meters, or null when that point is dry. */
  surfaceAt(x, y, z) {
    const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
    let vy = Math.floor(y * VOX);
    const m = this.vox(vx, vy, vz);
    if (!FLUID[m]) return null;
    for (let i = 0; i < 48 && this.vox(vx, vy + 1, vz) === m; i++) vy++;
    const l = this.lvAt(vx, vy, vz);
    if (l) return (vy + l / 8) / VOX;
    const L = this.lakeAt(vx, vy, vz, m);
    return (vy + 1 - (L && L.top === vy && L.cells && L.cells.length ? L.debt / (L.cells.length * 4) : 0)) / VOX;
  }
  /**
   * How the fluid at (x, y, z) is moving (m/s, roughly): downhill toward lower neighbours, along a
   * stream's momentum, down where it falls. Writes into out = {x, y, z}; returns false when dry.
   */
  flowAt(x, y, z, out) {
    const vx = Math.floor(x * VOX), vy = Math.floor(y * VOX), vz = Math.floor(z * VOX);
    out.x = out.y = out.z = 0;
    let sx = 0, sz = 0, n = 0, fall = 0, mo = 0;
    for (let dz = -2; dz <= 2; dz += 2) for (let dx = -2; dx <= 2; dx += 2) {
      const cx = vx + dx, cz = vz + dz;
      const m = this.vox(cx, vy, cz);
      if (!FLUID[m]) continue;
      n++;
      const l = this.levelAt(cx, vy, cz);
      const lx0 = this.side(cx - 1, vy, cz, m, l), lx1 = this.side(cx + 1, vy, cz, m, l);
      const lz0 = this.side(cx, vy, cz - 1, m, l), lz1 = this.side(cx, vy, cz + 1, m, l);
      sx += (lx0 - lx1) / 2; sz += (lz0 - lz1) / 2;
      if (this.vox(cx, vy - 1, cz) === 0) fall++;
      const s = this.slotOf.get(ckey(cx >> CB, vy >> CB, cz >> CB));
      const S = s === undefined ? null : this.slots[s];
      const d = S && S.md ? S.md[(cx & CM) + CS * ((vy & CM) + CS * (cz & CM))] : 0;
      if (d) { const D = D4[d - 1]; out.x += D[0] * 0.5; out.z += D[1] * 0.5; mo++; }
    }
    if (!n) return false;
    out.x = (out.x + sx * 0.4) / n; out.z = (out.z + sz * 0.4) / n; out.y = -fall / n * 1.5;
    return true;
  }
  side(x, y, z, m, l) { const c = this.vox(x, y, z); return c === m ? this.levelAt(x, y, z) : c === 0 ? 0 : l; }

  // ------------------------------------------------------------------ persistence
  /** Part-filled levels of this world, saved by chunk (full cells need nothing: 0 reads as full). */
  save() {
    if (!this.dirtySave) return;
    const out = {};
    for (const S of this.slots) {
      if (!S || !S.lv || !S.n || !S.ch || !S.ch.vox) continue;
      const v = S.ch.vox, lv = S.lv, list = [];
      let last = 0;
      for (let i = 0; i < N3; i++) {
        const l = lv[i];
        if (!l || l >= 8 || !FLUID[v[i]]) continue;
        list.push(i - last, l);
        last = i;
      }
      if (list.length) out[S.ck] = list;
    }
    // keep chunks we didn't load this time
    for (const [k, list] of Object.entries(this.saved || {})) if (!(k in out) && !this.slotOf.has(+k)) out[k] = list;
    try {
      const json = JSON.stringify({ v: 1, seed: this.w.seed, c: out });
      // a flood that big isn't worth the room (the world's edits keep the water; levels read full)
      if (json.length > 900000) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, json);
      this.dirtySave = false; this.saved = out;
    } catch (e) { /* storage full or blocked: levels stay in memory */ }
  }
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { d = null; }
    if (!d || d.seed !== this.w.seed || !d.c) return;
    this.saved = d.c;
    for (const [k, list] of Object.entries(d.c)) {
      const ck = +k;
      const cz = Math.floor(ck % 1024) - 512, cy = Math.floor(ck / 1024) % 1024 - 512, cx = Math.floor(ck / 1048576) - 512;
      const s = this.slotAt(cx, cy, cz), S = this.slots[s];
      this.arrays(S);
      let at = 0;
      for (let i = 0; i < list.length; i += 2) { at += list[i]; if (!S.lv[at]) S.n++; S.lv[at] = list[i + 1]; }
      const ch = this.w.chunk(cx, cy, cz);
      if (ch && ch.vox) ch.dirty = true; // meshed before we were here: again, with the levels
    }
  }

  dispose() {
    this.save();
    if (this.w.fluidChunks === this.cl) this.w.fluidChunks = null;
    this.A.clear(); this.B.clear(); this.sleepers = []; this.pend.clear();
  }
}

const OPEN = [[0, 1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]];
const LIST = new Int32Array(LEVEL_MAX + 8), STACK = new Int32Array(LEVEL_MAX * 4 + 16);
// scratch for a cell's sideways candidates
const CX = new Int32Array(4), CZ = new Int32Array(4), CL = new Int32Array(4), CM_ = new Int32Array(4), CK = new Int32Array(4), CD = new Int32Array(4);
export { MAT };

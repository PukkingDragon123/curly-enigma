// Flowing water and lava in the underground (see docs/DEEP.md, "Optional systems").
//
// Lakes sit still until digging opens them. Then a cellular automaton with fluid levels (1..8
// eighths of a voxel) pours the fluid out: down first, then on in the way it was running, then
// sideways, levelling out. Lakes are finite reservoirs: what flows out of a lake is taken from its
// top layer, which sinks smoothly (in the shader) and is removed once spent, until the lake has
// given its share. Lava moves slowly, thickly, and cools to rock; water meeting lava boils off into
// steam and leaves obsidian. Only flows near the mole move; the rest sleep until it comes back.
// Levels are shared with the mesher as world.fluidChunks (chunk key → Uint8Array, 0 = untouched).
//
// Around the mole: damped-spring ripple rings (U.fRip), a jelly wobble after big splashes (U.fJig),
// splash crowns whose droplets bounce on rock, a floating bob while swimming, drips falling from
// lake ceilings, bubbles, waterfalls with spray, lava bloops and spits, steam, crumbs trickling from
// freshly dug ceilings, an underwater tint, and lava light.
import * as THREE from 'three';
import { VOX, M, MAT } from './materials.js';
import { OPAQUE, FLUID, meshChunkFluid } from './Mesher.js';
import { CS } from './Generator.js';
import { fluidUniforms } from './TerrainMaterial.js';

const CB = Math.log2(CS), CMASK = CS - 1;
const LB = 3 * CB, LMASK = (1 << LB) - 1; // a cell key is slot << LB | chunk-local index
const HZ = 10; // flow ticks per second
const SUB = 2; // water substeps per tick
const LAVA_EVERY = 2; // lava moves on every 2nd tick (thick and slow)
const BUDGET = 400; // cells per substep; the rest wait their turn
const REMESH = 3; // chunks per frame whose fluid surface gets rebuilt after level changes
const SIM_R = 24; // meters: flows farther from the mole sleep until it comes back
const MAX_DRAIN = 16000; // voxels a lake may lose (keeps the saved edits small)
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const WATER_C = [0.62, 0.84, 1];
const UW_FOG = new THREE.Color(0.01, 0.05, 0.075);

const ckey = (cx, cy, cz) => ((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512); // = World's key3
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const chance = (p) => Math.random() < p;
const rnd = (a, b) => a + Math.random() * (b - a);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const col01 = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const hashK = (k) => { const s = Math.sin(k * 0.000123 + (k % 977) * 12.9898) * 43758.5453; return s - Math.floor(s); };

export class Fluids {
  constructor(ctx) {
    this.ctx = ctx;
    this.w = ctx.world;
    this.U = fluidUniforms(ctx.U);
    this.fx = ctx.fx;
    this.audio = ctx.audio;
    this.bodies = ctx.bodies;
    // cells are small integer keys: chunks the flow touches get a slot with a dense level array
    this.slots = []; // { cx, cy, cz, ck, ch, lv: Uint8Array | null, n }
    this.slotOf = new Map(); // chunk key → slot
    this.freeSlots = [];
    this.cl = new Map(); // chunk key → level array, for the mesher
    this.w.fluidChunks = this.cl;
    this.mt = new Map(); // key → time of the last level change, for every part-filled cell
    this.mo = new Map(); // key → 1..4: the way the water was going (streams keep running)
    this.act = new Set(); // cells to look at, in order (a queue)
    this.nxt = this.act; // where woken cells go (a buffer during a substep)
    this.spare = new Set();
    this.sleep = new Set(); // far from the mole (or unloaded): frozen until it comes back
    this.pend = new Set(); // chunks waiting for a fluid rebuild after level changes
    this.t = 0;
    this.acc = 0;
    this.tickN = 0;
    this.lc = null; // last chunk looked up by vox()
    this.self = false; // our own edits don't wake us
    this.events = [];
    this.crumbs = [];
    this.falls = []; this.lands = []; this.steams = []; this.foams = [];
    this.lavaSpots = []; this.spotAcc = [];
    this.jig = { x: 0, y: -9999, z: 0, h: 0, v: 0 };
    this.pIn = false; this.wakeT = 0; this.bubT = 0;
    this.uw = null; this.uwK = 0;
    this.loops = {};
    this.periodT = 0; this.sweepT = 0; this.sweepIt = null; this.gcT = 10;
    this.mix = false; this.lavaCells = 0; this.waterCells = 0;
    this.stats = { ticks: 0, ms: 0, maxMs: 0, cells: 0, edits: 0 };
    this.splashY = 0;
    this.lifeAt = (x, z, tR) => (FLUID[this.w.voxelAt(Math.floor(x * VOX), Math.floor((this.splashY - 0.05) * VOX), Math.floor(z * VOX))] ? tR + 0.03 : tR + 0.7);
    const plan = ctx.plan || this.w.plan;
    this.lakes = plan.features.filter((f) => f.kind === 'lake').map((f, id) => {
      const top0 = Math.ceil((f.y - f.r * 0.12) * VOX - 0.5) - 1;
      return {
        id, fluid: f.fluid, x: f.x, y: f.y, z: f.z, r: f.r, top0, top: top0,
        vy0: Math.floor((f.y - f.r * 0.56) * VOX) - 1,
        vx0: Math.floor((f.x - f.r * 1.05) * VOX), vx1: Math.ceil((f.x + f.r * 1.05) * VOX),
        vz0: Math.floor((f.z - f.r * 1.05) * VOX), vz1: Math.ceil((f.z + f.r * 1.05) * VOX),
        debt: 0, cells: null, drained: 0, dry: false,
      };
    });
  }

  /** Part-filled cells the flow is tracking (for stats). */
  get cells() { return this.mt.size; }

  // ------------------------------------------------------------------ voxel access (world coords)
  vox(vx, vy, vz) {
    const cx = vx >> CB, cy = vy >> CB, cz = vz >> CB;
    let ch = this.lc;
    if (!ch || ch.cx !== cx || ch.cy !== cy || ch.cz !== cz) {
      ch = this.w.chunk(cx, cy, cz);
      if (!ch) return -1;
      this.lc = ch;
    }
    return ch.vox[(vx & CMASK) + CS * ((vy & CMASK) + CS * (vz & CMASK))];
  }
  /** Stored level at a voxel (0 = untouched: full if it's fluid). */
  lvAt(vx, vy, vz) {
    const s = this.slotOf.get(ckey(vx >> CB, vy >> CB, vz >> CB));
    const a = s === undefined ? null : this.slots[s].lv;
    return a ? a[(vx & CMASK) + CS * ((vy & CMASK) + CS * (vz & CMASK))] : 0;
  }

  // ------------------------------------------------------------------ cells (keys)
  slotAt(cx, cy, cz) {
    const ck = ckey(cx, cy, cz);
    let s = this.slotOf.get(ck);
    if (s === undefined) {
      s = this.freeSlots.length ? this.freeSlots.pop() : this.slots.length;
      this.slots[s] = { cx, cy, cz, ck, ch: this.w.chunk(cx, cy, cz) || null, lv: null, n: 0 };
      this.slotOf.set(ck, s);
    }
    return s;
  }
  key(vx, vy, vz) { return (this.slotAt(vx >> CB, vy >> CB, vz >> CB) << LB) | ((vx & CMASK) + CS * ((vy & CMASK) + CS * (vz & CMASK))); }
  /** The cell next to key k. */
  nb(k, dx, dy, dz) {
    const li = k & LMASK;
    const lx = (li & CMASK) + dx, ly = ((li >> CB) & CMASK) + dy, lz = (li >> (2 * CB)) + dz;
    if (lx >= 0 && lx < CS && ly >= 0 && ly < CS && lz >= 0 && lz < CS) return k - li + lx + CS * (ly + CS * lz);
    const S = this.slots[k >> LB];
    return this.key(S.cx * CS + lx, S.cy * CS + ly, S.cz * CS + lz);
  }
  /** Material at key k (-1 when its chunk isn't loaded). */
  mk(k) { const ch = this.slots[k >> LB].ch; return ch ? ch.vox[k & LMASK] : -1; }
  /** Level at key k: 1..8 (untouched fluid counts as full). */
  lk(k) { const a = this.slots[k >> LB].lv; return (a && a[k & LMASK]) || 8; }
  kx(k) { return this.slots[k >> LB].cx * CS + (k & CMASK); }
  ky(k) { return this.slots[k >> LB].cy * CS + ((k >> CB) & CMASK); }
  kz(k) { return this.slots[k >> LB].cz * CS + ((k >> (2 * CB)) & CMASK); }
  lvSet(k, l) {
    const S = this.slots[k >> LB], li = k & LMASK;
    if (!S.lv) { S.lv = new Uint8Array(CS * CS * CS); this.cl.set(S.ck, S.lv); }
    if (!S.lv[li]) S.n++;
    S.lv[li] = l;
    this.mt.set(k, this.t);
  }
  lvDel(k) {
    const S = this.slots[k >> LB], li = k & LMASK;
    this.mt.delete(k); this.mo.delete(k);
    if (S.lv && S.lv[li]) { S.lv[li] = 0; S.n--; }
  }
  /**
   * Air ↔ fluid: the rock mesh can't change, so skip the world's full remesh: write the voxel,
   * record the edit (saved like any other) and queue a fluid-only rebuild.
   */
  setF(k, m) {
    const w = this.w, S = this.slots[k >> LB], ch = S.ch, i = k & LMASK;
    if (!ch || ch.vox[i] === m) return;
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
  }
  /**
   * A level changed inside existing fluid: its chunk (and neighbours whose corners read it) need a
   * new fluid surface. Queued and rebuilt a few per frame, fluid only (the rock mesh can't change).
   */
  touch(k) {
    const S = this.slots[k >> LB], w = this.w, q = this.pend;
    if (S.ch) q.add(S.ch);
    const li = k & LMASK, lx = li & CMASK, ly = (li >> CB) & CMASK, lz = li >> (2 * CB);
    if (lx && ly && lz && lx < CMASK && ly < CMASK && lz < CMASK) return;
    const ex = lx === 0 ? -1 : lx === CMASK ? 1 : 0, ey = ly === 0 ? -1 : ly === CMASK ? 1 : 0, ez = lz === 0 ? -1 : lz === CMASK ? 1 : 0;
    let n;
    if (ex && (n = w.chunk(S.cx + ex, S.cy, S.cz))) q.add(n);
    if (ey && (n = w.chunk(S.cx, S.cy + ey, S.cz))) q.add(n);
    if (ez && (n = w.chunk(S.cx, S.cy, S.cz + ez))) q.add(n);
    if (ex && ez && (n = w.chunk(S.cx + ex, S.cy, S.cz + ez))) q.add(n);
  }
  flushRemesh() {
    let n = 0;
    for (const ch of this.pend) {
      this.pend.delete(ch);
      if (ch.dirty || this.w.chunk(ch.cx, ch.cy, ch.cz) !== ch) continue; // the terrain rebuilds it anyway / gone
      const fm = ch.fluidMesh;
      const geo = fm ? meshChunkFluid(this.w, ch) : null;
      if (geo) { const old = fm.geometry; fm.geometry = geo; old.dispose(); } else ch.dirty = true; // first or last fluid: full rebuild
      if (++n >= REMESH) break;
    }
  }
  /** Fluid m at level l (0 = air) in cell k whose current material is cur. */
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
  /** A cell gave fluid away (or changed kind): it and the cells that may pour into it get a turn. */
  wake(k) {
    const n = this.nxt;
    n.add(k); n.add(this.nb(k, 0, 1, 0)); n.add(this.nb(k, 1, 0, 0)); n.add(this.nb(k, -1, 0, 0)); n.add(this.nb(k, 0, 0, 1)); n.add(this.nb(k, 0, 0, -1));
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
    for (let tries = 0; tries < 16; tries++) {
      const list = [];
      let unloaded = false;
      const dy = ((L.top + 0.5) / VOX - L.y) / (L.r * 0.55);
      for (let vz = L.vz0; vz <= L.vz1; vz++) for (let vx = L.vx0; vx <= L.vx1; vx++) {
        const dx = ((vx + 0.5) / VOX - L.x) / L.r, dz = ((vz + 0.5) / VOX - L.z) / L.r;
        if (dx * dx + dy * dy + dz * dz >= 1.08) continue;
        const m = this.vox(vx, L.top, vz);
        if (m < 0) unloaded = true;
        else if (m === L.fluid && !this.lvAt(vx, L.top, vz)) list.push(vx, vz);
      }
      if (list.length) { L.cells = list; return; }
      if (unloaded) { L.cells = null; return; } // can't tell yet: try again once it's loaded
      L.top--; // this layer is already gone (drained on an earlier visit)
      if (L.top < L.vy0) break;
    }
    L.dry = true;
    L.cells = [];
  }
  /** The lake gave `a` eighths: its top layer sinks; a spent layer is removed in one go. */
  drain(L, a) {
    if (!L.cells) this.scanTop(L);
    if (L.dry) return;
    L.debt += a;
    if (!L.cells) return;
    const vol = (L.cells.length / 2) * 8;
    if (L.debt < vol) return;
    for (let i = 0; i < L.cells.length; i += 2) {
      const vx = L.cells[i], vz = L.cells[i + 1];
      if (this.vox(vx, L.top, vz) === L.fluid && !this.lvAt(vx, L.top, vz)) { this.setV(vx, L.top, vz, 0); L.drained++; }
    }
    L.debt = Math.max(0, L.debt - vol);
    L.top--;
    L.cells = null;
    if (L.drained >= MAX_DRAIN) { L.dry = true; L.debt = 0; L.cells = []; } else this.scanTop(L);
    if (this.audio) this.audio.play('trickle', { vol: 0.5 });
  }

  // ------------------------------------------------------------------ the flow
  tick(px, py, pz) {
    this.tickN++;
    const lavaTick = this.tickN % LAVA_EVERY === 0;
    this.falls.length = 0;
    this.lands.length = 0;
    // chunks come and go: refresh what each slot points at
    for (const S of this.slots) if (S) S.ch = this.w.chunk(S.cx, S.cy, S.cz) || null;
    const R = SIM_R * VOX;
    let cells = 0;
    const act = this.act;
    for (let s = 0; s < SUB; s++) {
      // a queue: take cells from the front until the budget is spent (the rest wait their turn);
      // cells woken meanwhile join the back after this substep
      const next = (this.nxt = this.spare);
      next.clear();
      let budget = BUDGET;
      for (const k of act) {
        if (budget <= 0) break;
        act.delete(k);
        const S = this.slots[k >> LB];
        const vx = S.cx * CS + (k & CMASK), vy = S.cy * CS + ((k >> CB) & CMASK), vz = S.cz * CS + ((k >> (2 * CB)) & CMASK);
        if (Math.abs(vx - px) > R || Math.abs(vz - pz) > R || Math.abs(vy - py) > R) { this.sleep.add(k); continue; }
        budget -= this.cell(k, S, vx, vy, vz, lavaTick && s === 0);
      }
      cells += BUDGET - budget;
      for (const k of next) act.add(k);
    }
    this.nxt = act;
    this.stats.cells = cells;
  }

  /** One cell's turn. Returns the work done (0 for cells that were just skipped). */
  cell(k, S, vx, vy, vz, lavaOK) {
    const ch = S.ch, li = k & LMASK;
    if (!ch) { this.sleep.add(k); return 0; }
    const m = ch.vox[li];
    if (!FLUID[m]) { if (S.lv && S.lv[li]) this.lvDel(k); return 0; }
    const lava = m === M.LAVA;
    if (!this.mix) {
      // the first flow of one kind near the other kind turns contact checks on right away
      if (lava) this.seenL = true; else this.seenW = true;
      if ((this.seenL || this.lavaNear) && (this.seenW || this.waterNear)) this.mix = true;
    }
    if (lava && !lavaOK) { this.nxt.add(k); return 0; }
    let l = S.lv ? S.lv[li] : 0, L = null;
    if (!l) {
      l = 8;
      L = this.lakeAt(vx, vy, vz, m);
      if (L && L.dry) return 1; // a spent lake stays put
    }
    if (this.mix && this.react(k, vx, vy, vz, m, L)) return 1;
    // 1. down
    const kb = this.nb(k, 0, -1, 0);
    const bm = this.mk(kb);
    if (bm === 0) {
      this.put(kb, m, l, 0);
      if (L) this.drain(L, l); else this.put(k, m, 0, m);
      this.wake(k); this.nxt.add(kb);
      this.fallFx(vx, vy, vz, m);
      return 1;
    }
    let moved = 0;
    if (bm === m) {
      const lb = this.lk(kb);
      if (lb < 8) {
        const t = Math.min(8 - lb, l);
        this.put(kb, m, lb + t, m);
        l -= t; moved += t;
        this.nxt.add(kb);
      }
    }
    // 2. a stream keeps running the way it was going (water only: lava has no hurry)
    if (l > 1 && bm !== 0 && !lava) {
      const md = this.mo.get(k);
      if (md) {
        const d = D4[md - 1];
        const nk = this.nb(k, d[0], 0, d[1]);
        const nm = this.mk(nk);
        const ln = nm === 0 ? 0 : nm === m ? this.lk(nk) : 99;
        if (ln < l) {
          const t = (l - ln + 1) >> 1;
          this.put(nk, m, ln + t, nm);
          this.mo.set(nk, md);
          this.nxt.add(nk);
          l -= t; moved += t;
        } else this.mo.delete(k);
      }
    }
    // 3. sideways, levelling out, from cells resting on something
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
        if (ln < l - 1) { CX[n] = vx + d[0]; CZ[n] = vz + d[1]; CL[n] = ln; CM[n] = nm; CK[n] = nk; CD[n] = di + 1; n++; total += ln; }
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
              this.put(CK[j], m, CL[j] + t, CM[j]);
              this.nxt.add(CK[j]);
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
            this.put(CK[j], m, nl, CM[j]);
            if (!lava && g >= 2) this.mo.set(CK[j], CD[j]);
            this.nxt.add(CK[j]);
            moved += g;
            if (g >= 3 && chance(0.15)) this.foams.push(CX[j], vy, CZ[j]);
          }
          l = keep + rem; // whatever couldn't be handed out stays
        }
      }
    }
    if (!moved) return 1;
    if (L) this.drain(L, moved); // the lake gives; this cell stays full
    else this.put(k, m, l, m);
    this.wake(k);
    return 1;
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
      const WS = this.slots[wk >> LB], wl = WS.lv ? WS.lv[wk & LMASK] : 0;
      const WL = !wl ? (selfLava ? this.lakeAt(wx, wy, wz, M.WATER) : L) : null;
      if (WL && !WL.dry) this.drain(WL, 3);
      else this.put(wk, M.WATER, (wl || 8) - 3, M.WATER);
      this.wake(lk); this.wake(wk);
      this.steams.push((lx + wx + 1) / (2 * VOX), (ly + wy + 1) / (2 * VOX), (lz + wz + 1) / (2 * VOX));
      return true;
    }
    return false;
  }

  fallFx(vx, vy, vz, m) {
    const x = (vx + 0.5) / VOX, y = vy / VOX, z = (vz + 0.5) / VOX;
    if (this.falls.length < 120) this.falls.push(x, y, z, m);
    const b2 = this.vox(vx, vy - 2, vz);
    if (b2 !== 0 && this.lands.length < 60) this.lands.push(x, (vy - 1) / VOX, z, m);
  }

  /** Films soak away, still lava cools into rock, far cells doze; a slice of the work per call. */
  sweep() {
    if (!this.sweepIt) this.sweepIt = this.mt.entries();
    const P = this.ctx.player.pos;
    const px = P.x * VOX, py = P.y * VOX, pz = P.z * VOX, R = SIM_R * VOX;
    for (let i = 0; i < 500; i++) {
      const it = this.sweepIt.next();
      if (it.done) {
        this.sweepIt = null;
        this.lavaSpots = this.spotAcc.sort((a, b) => a.d - b.d).slice(0, 2);
        this.spotAcc = [];
        this.lavaCells = this.lavaN || 0; this.waterCells = this.waterN || 0;
        this.lavaN = 0; this.waterN = 0;
        return;
      }
      const [k, t0] = it.value;
      const S = this.slots[k >> LB];
      if (!S || !S.ch) continue;
      const vx = this.kx(k), vy = this.ky(k), vz = this.kz(k);
      if (Math.abs(vx - px) > R || Math.abs(vz - pz) > R || Math.abs(vy - py) > R) continue;
      const m = S.ch.vox[k & LMASK];
      if (!FLUID[m]) { this.lvDel(k); continue; }
      const l = this.lk(k);
      const age = this.t - t0;
      if (m === M.LAVA) {
        this.lavaN = (this.lavaN || 0) + 1;
        const d = Math.hypot(vx - px, vy - py, vz - pz) / VOX;
        if (d < 14 && this.spotAcc.length < 64 && !this.spotAcc.some((s) => Math.abs(s.x - vx / VOX) + Math.abs(s.z - vz / VOX) < 2.5)) this.spotAcc.push({ x: (vx + 0.5) / VOX, y: (vy + 1) / VOX, z: (vz + 0.5) / VOX, d });
        if (age > (l >= 8 ? 14 : 7) + hashK(k) * 5 && !this.act.has(k)) {
          this.lvDel(k);
          this.setV(vx, vy, vz, l >= 6 ? M.MAGMAROCK : M.BASALT);
          this.wake(k);
          if (d < 10 && chance(0.3)) this.fx.steam((vx + 0.5) / VOX, (vy + 1) / VOX, (vz + 0.5) / VOX, 0.6, [0.5, 0.45, 0.45]);
        }
      } else {
        this.waterN = (this.waterN || 0) + 1;
        if (l <= 2 && age > 7 + hashK(k) * 6 && !this.act.has(k)) {
          this.put(k, m, l - 1, m);
          this.wake(k);
        }
      }
    }
  }

  /** Forget slots of chunks the flow has left (nothing stored, nothing queued). */
  gc() {
    const used = new Set();
    for (const k of this.act) used.add(k >> LB);
    for (const k of this.sleep) used.add(k >> LB);
    for (const k of this.mt.keys()) used.add(k >> LB);
    for (const k of this.mo.keys()) used.add(k >> LB);
    this.sweepIt = null;
    for (let s = 0; s < this.slots.length; s++) {
      const S = this.slots[s];
      if (!S || used.has(s) || S.n > 0) continue;
      this.slotOf.delete(S.ck);
      this.cl.delete(S.ck);
      this.slots[s] = null;
      this.freeSlots.push(s);
    }
  }

  // ------------------------------------------------------------------ edits from the game
  onVoxel(vx, vy, vz, old, m) {
    if (this.self) return;
    const fo = FLUID[old], fm = FLUID[m];
    if (fo || fm) {
      const k = this.key(vx, vy, vz);
      if (fo && !fm) this.lvDel(k);
      if (fm) this.act.add(k);
    }
    if (!OPAQUE[m]) {
      // opened up: fluid above or beside may pour in (nothing flows up)
      const w = this.w;
      if (FLUID[w.voxelAt(vx, vy + 1, vz)]) this.act.add(this.key(vx, vy + 1, vz));
      if (FLUID[w.voxelAt(vx, vy, vz + 1)]) this.act.add(this.key(vx, vy, vz + 1));
      if (FLUID[w.voxelAt(vx, vy, vz - 1)]) this.act.add(this.key(vx, vy, vz - 1));
      if (FLUID[w.voxelAt(vx + 1, vy, vz)]) this.act.add(this.key(vx + 1, vy, vz));
      if (FLUID[w.voxelAt(vx - 1, vy, vz)]) this.act.add(this.key(vx - 1, vy, vz));
    }
    if (!m && OPAQUE[old]) this.crumb(vx, vy, vz);
  }

  /** A freshly opened ceiling sheds a trickle of grains. */
  crumb(vx, vy, vz) {
    if (this.crumbs.length >= 10) return;
    const a = this.w.voxelAt(vx, vy + 1, vz);
    const mat = MAT[a];
    if (!OPAQUE[a] || !mat || a === M.BEDROCK || !mat.tones) return;
    if (!chance(mat.gran ? 0.4 : mat.snd === 'dirt' || mat.snd === 'sand' ? 0.12 : 0.05)) return;
    const x = (vx + 0.5) / VOX, y = (vy + 1) / VOX - 0.006, z = (vz + 0.5) / VOX;
    const P = this.ctx.player.pos;
    if (Math.abs(P.x - x) + Math.abs(P.z - z) > 8) return;
    for (const c of this.crumbs) if (Math.abs(c.x - x) + Math.abs(c.y - y) + Math.abs(c.z - z) < 0.35) return;
    this.crumbs.push({ x, y, z, t: 0, life: mat.gran ? rnd(1.2, 2.6) : rnd(0.5, 1.2), rate: mat.gran ? 26 : 10, col: col01(mat.tones[chance(0.5) ? 1 : 2]), col2: col01(mat.tones[3]) });
  }

  // ------------------------------------------------------------------ per frame
  update(dt, { player, eye, time }) {
    this.t = time;
    this.lc = null;
    dt = Math.min(dt, 0.1);
    const p = player.pos;
    // the flow, at a fixed rate
    this.acc += dt;
    let n = 0;
    while (this.acc >= 1 / HZ && n < 2) {
      this.acc -= 1 / HZ; n++;
      if (!this.act.size) continue;
      const t0 = performance.now();
      this.tick(p.x * VOX, p.y * VOX, p.z * VOX);
      const ms = performance.now() - t0;
      const S = this.stats;
      S.ticks++; S.ms = S.ms * 0.95 + ms * 0.05; S.maxMs = Math.max(S.maxMs * 0.995, ms); S.last = ms;
      this.lc = null;
    }
    if (this.acc > 1 / HZ) this.acc = 0;
    if (this.pend.size) this.flushRemesh();
    this.periodic(dt, p);
    this.runEvents();
    this.playerFx(dt, player, eye);
    this.bodyFx(dt);
    this.flowFx(dt, eye);
    this.ambient(dt, eye);
    this.crumbFx(dt);
    this.spring(dt);
    this.lakeUniforms(eye);
    this.sounds(dt, eye);
    this.underwater(dt, player);
  }

  periodic(dt, p) {
    this.sweepT -= dt;
    if (this.sweepT <= 0) { this.sweepT = 0.25; this.sweep(); }
    this.periodT -= dt;
    if (this.periodT > 0) return;
    this.periodT = 1;
    // sleeping cells near the mole again wake up
    if (this.sleep.size) {
      const px = p.x * VOX, py = p.y * VOX, pz = p.z * VOX, R = SIM_R * VOX * 0.9;
      for (const k of this.sleep) {
        if (!this.slots[k >> LB]) { this.sleep.delete(k); continue; }
        if (Math.abs(this.kx(k) - px) < R && Math.abs(this.kz(k) - pz) < R && Math.abs(this.ky(k) - py) < R) { this.sleep.delete(k); this.act.add(k); }
      }
    }
    this.gcT -= 1;
    if (this.gcT <= 0) { this.gcT = 10; this.gc(); }
    // water and lava both around? then flows check for each other
    let lava = false, water = false;
    for (const L of this.lakes) {
      if (Math.abs(L.x - p.x) > L.r + 40 || Math.abs(L.z - p.z) > L.r + 40 || Math.abs(L.y - p.y) > L.r + 30) continue;
      if (L.fluid === M.LAVA) lava = true; else water = true;
    }
    this.lavaNear = lava; this.waterNear = water;
    this.mix = (lava || this.lavaCells > 0 || this.seenL) && (water || this.waterCells > 0 || this.seenW);
    this.seenL = this.seenW = false;
  }

  later(dt, fn) { this.events.push({ t: this.t + dt, fn }); }
  runEvents() {
    if (!this.events.length) return;
    const ev = this.events;
    this.events = [];
    for (const e of ev) if (e.t <= this.t) e.fn(); else this.events.push(e);
  }

  // ------------------------------------------------------------------ ripples and wobble
  /** A ripple ring at (x, y, z); k ≈ 0.1 (a drip) .. 1.5 (a cannonball); k < 0 starts as a bulge. */
  ripple(x, y, z, k) {
    const R = this.U.fRip.value, K = this.U.fRipK.value;
    let best = 0, bs = Infinity;
    for (let i = 0; i < 8; i++) {
      const age = this.t - R[i].w;
      const s = age > 4.5 || age < 0 ? -1 : Math.abs(K[i]) * Math.exp(-age * 1.5);
      if (s < bs) { bs = s; best = i; }
    }
    R[best].set(x, y, z, this.t);
    K[best] = k;
  }
  /** Set the jelly wobble going around (x, y, z). */
  kick(x, y, z, a) {
    const J = this.jig;
    if (Math.abs(J.h) < a * 0.6 || Math.hypot(J.x - x, J.z - z) < 2.5) { J.x = x; J.y = y; J.z = z; }
    J.v -= a * 14;
  }
  spring(dt) {
    const J = this.jig;
    const n = Math.ceil(dt / (1 / 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) { J.v += (-90 * J.h - 2.6 * J.v) * h; J.h += J.v * h; }
    if (Math.abs(J.h) < 1e-4 && Math.abs(J.v) < 1e-3) { J.h = 0; J.v = 0; }
    this.U.fJig.value.set(J.x, J.y, J.z, J.h);
  }
  /** The surface offset at a point: the shader's fsurf() in JS (so the mole bobs on the waves). */
  waveAt(x, y, z, lava, amp = 1) {
    const t = this.t, s = lava ? 0.4 : 1;
    const p1 = (x * 0.8 + z * 0.6) * 2.4 + t * 1.4 * s, p2 = (x * -0.45 + z * 0.89) * 3.6 - t * 1.9 * s, p3 = (x * 0.96 - z * 0.28) * 6.1 + t * 3.1;
    let h = amp * (0.011 * Math.sin(p1) + 0.007 * Math.sin(p2) + (lava ? 0 : 0.0035 * Math.sin(p3)));
    const R = this.U.fRip.value, K = this.U.fRipK.value;
    const spd = lava ? 0.5 : 1.3, kk = lava ? 8 : 14, damp = lava ? 1 : 1.6;
    for (let i = 0; i < 8; i++) {
      const k = K[i];
      if (!k) continue;
      const r = R[i], age = t - r.w;
      if (age < 0 || age > 4.5 || Math.abs(y - r.y) > 0.7) continue;
      const d = Math.hypot(x - r.x, z - r.z), front = age * spd + 0.12;
      if (d > front + 0.3) continue;
      const env = Math.exp(-age * damp) * (1 - sstep(front - 0.15, front + 0.3, d)) / (1 + d * 2.2);
      h += -0.075 * k * amp * env * Math.cos(kk * d - kk * spd * 0.9 * age);
    }
    const J = this.jig;
    if (J.h && Math.abs(y - J.y) < 0.7) {
      const qx = x - J.x, qz = z - J.z;
      h += J.h * amp * Math.exp(-(qx * qx + qz * qz) * 0.15) * Math.sin(qx * 3.3 + 0.7) * Math.sin(qz * 2.9 + 1.3);
    }
    return h;
  }
  /** Top of the fluid column through (x, y, z) in meters, or null when that point is dry. */
  surfaceAt(x, y, z) {
    const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
    let vy = Math.floor(y * VOX);
    const m = this.vox(vx, vy, vz);
    if (!FLUID[m]) return null;
    for (let i = 0; i < 40 && this.vox(vx, vy + 1, vz) === m; i++) vy++;
    const l = this.lvAt(vx, vy, vz);
    if (l) return (vy + l / 8) / VOX;
    const L = this.lakeAt(vx, vy, vz, m);
    return (vy + 1 - (L && L.top === vy && L.cells && L.cells.length ? L.debt / (L.cells.length * 4) : 0)) / VOX;
  }

  lakeUniforms(eye) {
    const LK = this.U.fLake.value, LD = this.U.fLakeDrop.value;
    LD[0] = LD[1] = 0;
    let j = 0;
    const list = this.lakes.filter((L) => L.debt > 0 && L.cells && L.cells.length).sort((a, b) => Math.hypot(a.x - eye.x, a.z - eye.z) - Math.hypot(b.x - eye.x, b.z - eye.z));
    for (const L of list) {
      if (j >= 2) break;
      LK[j].set(L.x, (L.top + 1) / VOX, L.z, L.r);
      LD[j] = Math.min(1, L.debt / (L.cells.length * 4)) / VOX;
      j++;
    }
  }

  // ------------------------------------------------------------------ the mole in fluid
  playerFx(dt, pl, eye) {
    const p = pl.pos, fx = this.fx;
    const inF = pl.inWater || pl.inLava;
    const lava = !pl.inWater && pl.inLava;
    const sy = inF ? this.surfaceAt(p.x, p.y + (lava ? 0.1 : 0.45), p.z) : null;
    if (inF && !this.pIn) {
      const y = sy ?? p.y + 0.45;
      const sp = Math.max(0, -pl.vel.y);
      const k = clamp(0.35 + sp / 5, 0.35, 1.6);
      this.ripple(p.x, y, p.z, lava ? k * 0.6 : k);
      this.kick(p.x, y, p.z, (lava ? 0.012 : 0.03) * k);
      this.splashY = y;
      if (!lava) {
        fx.crown(p.x, y, p.z, k, WATER_C, this.lifeAt);
        if (sp < 2) this.audio?.play('splash', { vol: 0.35 + k * 0.3 });
        for (let i = 0; i < 6 * k; i++) fx.bubble(p.x + rnd(-0.2, 0.2), y - rnd(0.1, 0.5), p.z + rnd(-0.2, 0.2), rnd(0.3, 0.7));
      } else {
        for (let i = 0; i < 8; i++) fx.lavaBlob(p.x, y + 0.03, p.z, rnd(-1.2, 1.2), rnd(1.5, 3.5), rnd(-1.2, 1.2), 0.025);
        for (let i = 0; i < 5; i++) fx.steam(p.x + rnd(-0.3, 0.3), y + 0.05, p.z + rnd(-0.3, 0.3), 1, [0.5, 0.42, 0.4]);
        this.audio?.play('sizzle');
      }
    }
    this.pIn = inF;
    if (!inF) { this.wakeT = 0; return; }
    const moving = pl.speed > 0.4;
    // wake rings and foam behind the swimming mole; small ones while floating still
    this.wakeT -= dt;
    if (this.wakeT <= 0 && sy !== null) {
      this.wakeT = moving ? 0.3 : 1.1;
      this.ripple(p.x, sy, p.z, lava ? 0.25 : moving ? 0.32 : 0.14);
      if (!lava) {
        for (let i = 0; i < (moving ? 6 : 2); i++) { const a = Math.random() * 6.283, s = rnd(0.2, 0.6); fx.foam(p.x + Math.cos(a) * 0.2, sy + 0.01, p.z + Math.sin(a) * 0.2, Math.cos(a) * s, Math.sin(a) * s); }
        if (moving) {
          this.audio?.play('swim', { vol: 0.6 });
          this.splashY = sy;
          for (let i = 0; i < 3; i++) { const vy = rnd(0.8, 1.6), tR = (2 * vy) / 9.8; fx.droplet(p.x + rnd(-0.2, 0.2), sy + 0.02, p.z + rnd(-0.2, 0.2), rnd(-0.5, 0.5) + pl.vel.x * 0.3, vy, rnd(-0.5, 0.5) + pl.vel.z * 0.3, tR + 0.03); }
        }
      } else if (chance(0.5)) fx.lavaBlob(p.x, sy + 0.02, p.z, rnd(-0.6, 0.6), rnd(1, 2), rnd(-0.6, 0.6), 0.02);
    }
    // float: buoyancy springs the mole up to ride the waves (with a little overshoot); looking down
    // while swimming dives
    if (pl.inWater && sy !== null) {
      const h = sy + this.waveAt(p.x, sy, p.z, false) + Math.sin(this.t * 1.9) * 0.018;
      const target = h - 0.5;
      const diving = pl.pitch < -0.45 && moving;
      if (!diving && !(pl.grounded && target < p.y + 0.04)) {
        const err = clamp(target - p.y, -0.4, 0.5);
        pl.vel.y += (err * 28 - pl.vel.y * 2 + 2.7) * dt;
      }
    }
    // bubbles from the snout under water
    if (pl.headUnder) {
      this.bubT -= dt;
      if (this.bubT <= 0) {
        this.bubT = rnd(0.25, 0.8);
        const f = pl.forward();
        const top = this.surfaceAt(eye.x, eye.y, eye.z) ?? eye.y + 0.5;
        const life = this.riseTime(Math.max(0.05, top - eye.y + 0.1));
        for (let i = 0; i < 1 + (Math.random() * 3 | 0); i++) fx.bubble(eye.x + f.x * 0.2 + rnd(-0.03, 0.03), eye.y - 0.06, eye.z + f.z * 0.2 + rnd(-0.03, 0.03), life * rnd(0.9, 1.1));
        if (chance(0.5)) this.audio?.play('bubble', { vol: 0.5 });
      }
    }
  }

  /** Rock chunks and pickups that fall in: splash, then sink slowly (lava: nearly float). */
  bodyFx(dt) {
    const list = this.bodies?.list;
    if (!list || !list.length) return;
    for (const b of list) {
      if (!b.pos || !b.vel) continue;
      if (b.pickup && b.t > (b.pickup.delay ?? 0.7)) continue; // flying to the bag
      const m = this.vox(Math.floor(b.pos.x * VOX), Math.floor(b.pos.y * VOX), Math.floor(b.pos.z * VOX));
      const inF = m > 0 && FLUID[m] ? m : 0;
      if (inF && !b._fl) {
        const sy = this.surfaceAt(b.pos.x, b.pos.y, b.pos.z) ?? b.pos.y;
        const sp = b.vel.length();
        const k = clamp(0.2 + (b.n || 8) / 300 + sp / 10, 0.2, 1.2);
        this.ripple(b.pos.x, sy, b.pos.z, inF === M.LAVA ? k * 0.6 : k);
        this.kick(b.pos.x, sy, b.pos.z, 0.012 * k);
        this.splashY = sy;
        if (inF === M.WATER) {
          this.fx.crown(b.pos.x, sy, b.pos.z, k * 0.7, WATER_C, this.lifeAt);
          this.audio?.play('splash', { vol: 0.3 + k * 0.4 });
        } else {
          for (let i = 0; i < 4 + 4 * k; i++) this.fx.lavaBlob(b.pos.x, sy + 0.02, b.pos.z, rnd(-1, 1), rnd(1.2, 3), rnd(-1, 1), 0.022);
          for (let i = 0; i < 4; i++) this.fx.steam(b.pos.x, sy + 0.05, b.pos.z, 0.8, [0.5, 0.42, 0.4]);
          this.audio?.play('sizzle');
        }
      }
      if (inF) {
        const lava = inF === M.LAVA;
        b.vel.multiplyScalar(Math.max(0, 1 - (lava ? 5 : 3.2) * dt));
        b.vel.y += (lava ? 12 : 9.5) * dt;
        if (b.spin) b.spin.multiplyScalar(Math.max(0, 1 - 2 * dt));
        if (!lava && chance(dt * 6)) this.fx.bubble(b.pos.x, b.pos.y, b.pos.z, rnd(0.2, 0.5));
        if (lava && chance(dt * 6)) this.fx.ember(b.pos.x, b.pos.y + 0.05, b.pos.z);
      }
      b._fl = inF;
    }
  }

  // ------------------------------------------------------------------ flow and ambient effects
  flowFx(dt, eye) {
    const fx = this.fx;
    const near = (x, y, z, r) => Math.abs(x - eye.x) < r && Math.abs(z - eye.z) < r && Math.abs(y - eye.y) < r;
    // falling streams: droplets streaking down, spray where they land
    const F = this.falls;
    if (F.length) {
      // a curtain of droplets streaking down the falling stream
      const n = Math.min(F.length / 4, Math.ceil(dt * 600));
      for (let i = 0; i < n; i++) {
        const j = ((Math.random() * F.length) / 4 | 0) * 4;
        const x = F[j], y = F[j + 1], z = F[j + 2], lava = F[j + 3] === M.LAVA;
        if (!near(x, y, z, 14)) continue;
        if (lava) { if (chance(0.3)) fx.ember(x, y, z); continue; }
        fx.droplet(x + rnd(-0.08, 0.08), y + rnd(-0.1, 0.12), z + rnd(-0.08, 0.08), rnd(-0.12, 0.12), rnd(-2.6, -1.2), rnd(-0.12, 0.12), rnd(0.12, 0.28), chance(0.3) ? [0.9, 0.97, 1] : [0.62, 0.84, 1], 0.012);
      }
    }
    const Ls = this.lands;
    this.landT = (this.landT || 0) - dt;
    if (Ls.length) {
      for (let i = 0; i < Math.min(3, Ls.length / 4); i++) {
        const j = ((Math.random() * Ls.length) / 4 | 0) * 4;
        const x = Ls[j], y = Ls[j + 1], z = Ls[j + 2], lava = Ls[j + 3] === M.LAVA;
        if (!near(x, y, z, 12)) continue;
        if (lava) { if (chance(dt * 8)) fx.steam(x, y + 0.05, z, 0.6, [0.5, 0.42, 0.4]); continue; }
        if (chance(dt * 30)) fx.mist(x, y + 0.04, z);
        if (chance(dt * 25)) { const vy = rnd(0.6, 1.4); fx.droplet(x, y + 0.03, z, rnd(-0.6, 0.6), vy, rnd(-0.6, 0.6), (2 * vy) / 9.8 + 0.4); }
        if (this.landT <= 0) { this.landT = 0.45; this.ripple(x, y + 0.06, z, 0.35); if (chance(0.5)) this.audio?.play('trickle', { vol: 0.5 }); }
      }
    }
    // foam riding fast flows
    const Fo = this.foams;
    for (let j = 0; j + 2 < Fo.length && j < 30; j += 3) {
      const x = (Fo[j] + 0.5) / VOX, y = (Fo[j + 1] + 0.7) / VOX, z = (Fo[j + 2] + 0.5) / VOX;
      if (near(x, y, z, 10)) fx.foam(x, y, z, rnd(-0.3, 0.3), rnd(-0.3, 0.3));
    }
    Fo.length = 0;
    // water meeting lava: hissing steam
    const S = this.steams;
    for (let j = 0; j + 2 < S.length && j < 30; j += 3) {
      const x = S[j], y = S[j + 1], z = S[j + 2];
      if (!near(x, y, z, 16)) continue;
      for (let i = 0; i < 4; i++) fx.steam(x, y, z, 1.4);
      if (chance(0.5)) fx.sparks(x, y, z, 2, [1, 0.6, 0.2], [0, 1, 0], 1.5);
      this.audio?.play(chance(0.5) ? 'steam' : 'sizzle');
    }
    S.length = 0;
  }

  /** A random open-surface point of a lake near the eye, or null. */
  lakePoint(L, eye, maxD) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * maxD;
      let x = eye.x + Math.cos(a) * rr, z = eye.z + Math.sin(a) * rr;
      const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
      if (d > L.r * 0.95) { x = L.x + (dx / d) * L.r * 0.95 * Math.random(); z = L.z + (dz / d) * L.r * 0.95 * Math.random(); }
      const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
      if (this.vox(vx, L.top, vz) !== L.fluid || this.vox(vx, L.top + 1, vz) !== 0) continue;
      return [x, z];
    }
    return null;
  }
  riseTime(d) {
    let y = 0, v = 0.15, t = 0;
    const h = 1 / 60;
    while (y < d && t < 3) { v += 1.4 * h; v *= 1 - 1.2 * h; y += v * h; t += h; }
    return t;
  }

  ambient(dt, eye) {
    const fx = this.fx;
    for (const L of this.lakes) {
      const hd = Math.hypot(L.x - eye.x, L.z - eye.z) - L.r;
      if (hd > 12) continue;
      if (!L.cells && !L.dry && (this.scanT = (this.scanT || 0) - 1) < 0) { this.scanT = 30; this.scanTop(L); } // find its real top
      const sy = (L.top + 1) / VOX;
      if (Math.abs(sy - eye.y) > 9) continue;
      const near = clamp(1 - hd / 12, 0.25, 1);
      if (L.fluid === M.WATER) {
        if (chance(dt * 1.8 * near)) this.drip(L, eye, sy);
        if (chance(dt * 2.5 * near)) this.bubbleUp(L, eye, sy);
      } else {
        if (chance(dt * 6 * near)) { const q = this.lakePoint(L, eye, 8); if (q) fx.steam(q[0], sy + 0.05, q[1], 1, chance(0.5) ? [0.55, 0.45, 0.42] : [0.38, 0.32, 0.3]); }
        if (chance(dt * 1.2 * near)) this.bloop(L, eye, sy);
        if (chance(dt * 0.45 * near)) this.spit(L, eye, sy);
        if (chance(dt * 4 * near)) { const q = this.lakePoint(L, eye, 8); if (q) fx.ember(q[0], sy + 0.03, q[1]); }
      }
    }
  }

  drip(L, eye, sy) {
    const q = this.lakePoint(L, eye, 9);
    if (!q) return;
    const [x, z] = q;
    const hit = this.w.raycast(x, sy + 0.05, z, 0, 1, 0, 7);
    if (!hit) return;
    const cy = hit.y - 0.004, h = cy - sy;
    if (h < 0.4) return;
    const form = rnd(0.5, 1), fx = this.fx;
    fx.dripForm(x, cy - 0.004, z, form, [0.55, 0.78, 1]);
    const tf = Math.sqrt((2 * h) / 9.8) * 0.96;
    this.later(form, () => fx.drip(x, cy - 0.01, z, tf, [0.6, 0.82, 1]));
    this.later(form + tf, () => {
      this.ripple(x, sy, z, 0.22);
      for (let i = 0; i < 3; i++) { const vy = rnd(0.7, 1.4); fx.droplet(x, sy + 0.01, z, rnd(-0.25, 0.25), vy, rnd(-0.25, 0.25), (2 * vy) / 9.8 + 0.02, WATER_C, 0.009); }
      const d = Math.hypot(x - eye.x, sy - eye.y, z - eye.z);
      if (d < 9) this.audio?.play('drip', { vol: clamp(1.2 - d / 8, 0.15, 1) });
    });
  }

  bubbleUp(L, eye, sy) {
    const q = this.lakePoint(L, eye, 7);
    if (!q) return;
    const [x, z] = q;
    const d = rnd(0.25, 1.2);
    if (this.vox(Math.floor(x * VOX), Math.floor((sy - d) * VOX), Math.floor(z * VOX)) !== M.WATER) return;
    const life = this.riseTime(d);
    const fx = this.fx;
    for (let i = 0; i < (chance(0.3) ? 3 : 1); i++) fx.bubble(x + rnd(-0.03, 0.03), sy - d - i * 0.04, z + rnd(-0.03, 0.03), life + i * 0.05);
    this.later(life, () => {
      fx.foam(x, sy + 0.01, z, rnd(-0.2, 0.2), rnd(-0.2, 0.2));
      fx.glints(x, sy + 0.02, z, [0.8, 0.95, 1]);
      if (Math.hypot(x - eye.x, z - eye.z) < 5) this.audio?.play('bubble', { vol: 0.4 });
    });
  }

  bloop(L, eye, sy) {
    const q = this.lakePoint(L, eye, 9);
    if (!q) return;
    const [x, z] = q;
    this.ripple(x, sy, z, -0.6); // a dome swells...
    this.later(rnd(0.4, 0.6), () => { // ...and pops
      this.ripple(x, sy, z, 0.4);
      for (let i = 0; i < 3 + (Math.random() * 4 | 0); i++) this.fx.lavaBlob(x, sy + 0.03, z, rnd(-0.6, 0.6), rnd(1.2, 2.6), rnd(-0.6, 0.6), 0.02);
      this.fx.steam(x, sy + 0.06, z, 1, [0.5, 0.42, 0.4]);
      const d = Math.hypot(x - eye.x, sy - eye.y, z - eye.z);
      if (d < 10) this.audio?.play('bloop', { vol: clamp(1.1 - d / 9, 0.15, 1) });
    });
  }

  spit(L, eye, sy) {
    const q = this.lakePoint(L, eye, 8);
    if (!q) return;
    const [x, z] = q;
    const a = Math.random() * 6.283, s = rnd(0.6, 1.6), vy = rnd(3, 4.6);
    const vx = Math.cos(a) * s, vz = Math.sin(a) * s;
    this.fx.lavaBlob(x, sy + 0.04, z, vx, vy, vz, 0.042);
    for (let i = 0; i < 3; i++) this.fx.lavaBlob(x, sy + 0.04, z, vx * rnd(0.6, 1.3), vy * rnd(0.5, 0.9), vz * rnd(0.6, 1.3), 0.02);
    this.ripple(x, sy, z, 0.5);
    // a trail of sparks along the arc
    for (let i = 1; i <= 5; i++) {
      const t = i * 0.08;
      this.later(t, () => this.fx.glints(x + vx * t, sy + vy * t - 4.5 * t * t, z + vz * t, [1, 0.6, 0.2]));
    }
    const d = Math.hypot(x - eye.x, sy - eye.y, z - eye.z);
    if (d < 10) this.audio?.play('bloop', { vol: clamp(1.2 - d / 9, 0.2, 1) });
  }

  crumbFx(dt) {
    const C = this.crumbs;
    if (!C.length) return;
    let j = 0;
    for (const c of C) {
      c.t += dt;
      if (c.t >= c.life) continue;
      C[j++] = c;
      const n = c.rate * dt * (1 - c.t / c.life) * (c.t < 0.15 ? 2 : 1);
      const cnt = Math.floor(n) + (chance(n % 1) ? 1 : 0);
      for (let i = 0; i < cnt; i++) this.fx.grain(c.x, c.y, c.z, chance(0.7) ? c.col : c.col2);
    }
    C.length = j;
  }

  sounds(dt, eye) {
    const A = this.audio;
    if (!A?.loop) return;
    this.sndT = (this.sndT || 0) - dt;
    if (this.sndT > 0) return;
    this.sndT = 0.25;
    // flowing water: count active water cells near the ear
    let flow = 0;
    const F = this.falls;
    for (let j = 0; j < F.length; j += 4) if (F[j + 3] === M.WATER && Math.abs(F[j] - eye.x) + Math.abs(F[j + 1] - eye.y) + Math.abs(F[j + 2] - eye.z) < 10) flow++;
    const act = Math.min(1, this.act.size / 300);
    const wv = clamp(flow / 20 + act * 0.5, 0, 1) * 0.6;
    // lava close by (a lake's surface or a flow)
    let ld = 99;
    for (const L of this.lakes) if (L.fluid === M.LAVA) ld = Math.min(ld, Math.max(0, Math.hypot(L.x - eye.x, L.z - eye.z) - L.r) + Math.abs((L.top + 1) / VOX - eye.y) * 0.5);
    for (const s of this.lavaSpots) ld = Math.min(ld, Math.hypot(s.x - eye.x, s.y - eye.y, s.z - eye.z));
    const lv = clamp(1 - ld / 9, 0, 1) * 0.45;
    for (const [name, vol] of [['water', wv], ['lava', lv]]) {
      const h = this.loops[name];
      if (vol > 0.02 && !h) this.loops[name] = A.loop(name, { vol });
      else if (h && vol <= 0.02) { h.stop(0.6); this.loops[name] = null; }
      else if (h) h.set({ vol });
    }
  }

  /** Head under water: the fog turns murky blue-green (restored on surfacing). */
  underwater(dt, pl) {
    const U = this.U;
    const want = pl.headUnder ? 1 : 0;
    this.uwK += (want - this.uwK) * Math.min(1, dt * 8);
    if (this.uwK > 0.002) {
      const s = this.uw || (this.uw = { col: U.fogCol.value.clone(), dist: U.fogDist.value, setCol: new THREE.Color(-1, -1, -1), setDist: -1 });
      // somebody else changed the fog meanwhile (a new zone): that's the colour to come back to
      if (s.setDist >= 0 && !U.fogCol.value.equals(s.setCol)) s.col.copy(U.fogCol.value);
      if (s.setDist >= 0 && U.fogDist.value !== s.setDist) s.dist = U.fogDist.value;
      U.fogCol.value.copy(s.col).lerp(UW_FOG, this.uwK);
      U.fogDist.value = s.dist + (5.5 - s.dist) * this.uwK;
      s.setCol.copy(U.fogCol.value); s.setDist = U.fogDist.value;
    } else if (this.uw) this.restoreFog();
  }
  restoreFog() {
    const s = this.uw, U = this.U;
    if (!s) return;
    if (U.fogCol.value.equals(s.setCol)) U.fogCol.value.copy(s.col);
    if (U.fogDist.value === s.setDist) U.fogDist.value = s.dist;
    this.uw = null;
    this.uwK = 0;
  }

  // ------------------------------------------------------------------ light
  /** Up to 3 lights for the nearest lava surfaces (lake shores and flows), pulsing. */
  lights(eye) {
    const out = [];
    const t = this.t;
    for (const L of this.lakes) {
      if (L.fluid !== M.LAVA) continue;
      const sy = (L.top + 1) / VOX;
      const dx = eye.x - L.x, dz = eye.z - L.z, d = Math.hypot(dx, dz) || 1;
      const k = d > L.r * 0.8 ? (L.r * 0.8) / d : 1;
      const x = L.x + dx * k, z = L.z + dz * k;
      const dist = Math.hypot(x - eye.x, sy - eye.y, z - eye.z);
      if (dist > 16) continue;
      const p = 0.82 + 0.13 * Math.sin(t * 2.1 + L.id) + 0.05 * Math.sin(t * 6.7 + L.id * 3);
      out.push({ x, y: sy + 0.5, z, c: [1.5 * p, 0.5 * p, 0.12 * p], r: 5.5, d: dist });
    }
    for (const s of this.lavaSpots) {
      const p = 0.8 + 0.15 * Math.sin(t * 2.6 + s.x) + 0.05 * Math.sin(t * 9.1 + s.z);
      out.push({ x: s.x, y: s.y + 0.3, z: s.z, c: [1.3 * p, 0.42 * p, 0.1 * p], r: 3.5, d: Math.hypot(s.x - eye.x, s.y - eye.y, s.z - eye.z) });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, 3);
  }

  dispose() {
    for (const h of Object.values(this.loops)) h?.stop(0.3);
    this.loops = {};
    this.restoreFog();
    const U = this.U;
    U.fRipK.value.fill(0);
    U.fLakeDrop.value.fill(0);
    U.fJig.value.set(0, -9999, 0, 0);
    if (this.w.fluidChunks === this.cl) this.w.fluidChunks = null;
    this.act.clear(); this.sleep.clear(); this.pend.clear();
    this.events = [];
  }
}

// scratch for a cell's sideways candidates
const CX = new Int32Array(4), CZ = new Int32Array(4), CL = new Int32Array(4), CM = new Int32Array(4), CK = new Int32Array(4), CD = new Int32Array(4);

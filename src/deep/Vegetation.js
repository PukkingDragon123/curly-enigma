// Cave vegetation for the first-person underground: grass, ferns, clover, glowing fungus,
// bioluminescent flowers, hanging roots and vines, dry tufts and thorn scrub, frost grass and
// lichen, ash weeds, dino-cavern giant ferns and horsetails, void tendrils — hand-painted pixel
// sprites (./veg/sprites.js, painted in code into one atlas) on alpha-tested cards.
//
// Placement is deterministic per chunk from the world seed (./veg/flora.js: what grows by zone,
// biome and the material underfoot, in patches from a noise field; never on the player's own
// diggings, in the burrow, lift rooms, NPC homes or Old Star's dig, and thin on trodden trails).
// Chunks near the mole are planted within a small per-frame budget and dropped when far. Every
// card of every plant lives in ONE instanced mesh (one draw call): each chunk rents a range of it.
// The shader (./veg/material.js) sways them in the cave's breath, pushes them aside where the
// mole and Nugget walk, thins small plants out with distance and lights them like the rock.
// Digging the ground under a plant (or filling the space it grows in) takes it away.
//
// API (DigScene): new Vegetation(ctx) · update(dt, { player, eye, time, busy }) → [] ·
// lights(eye) → ≤ 2 faint glows of luminous patches · onVoxel(vx, vy, vz, old, m) (chained into
// world.onChange by itself; calling it directly as well is harmless) · dispose() · info() ·
// debug: { info(), near(x, y, z, r), atlas(on), rebuild(), budget(ms) }.
import * as THREE from 'three';
import { CS, zoneAt, biomeAt } from './Generator.js';
import { VOX } from './materials.js';
import { OPAQUE } from './Mesher.js';
import { h3, h3i } from './noise.js';
import { key3, CB } from './World.js';
import { prologueLayout, prologueInside } from './gen/prologue.js';
import { TRAIL_W } from './gen/trails.js';
import { vegetationAtlas } from './veg/sprites.js';
import { KINDS, floraOf, FERT, ROCK, layPlant } from './veg/flora.js';
import { makeVegMaterial, PUSHERS } from './veg/material.js';
import { rng } from './veg/paint.js';

const CM = CS / VOX; // chunk size in metres
const R_BUILD = 15; // plant chunks whose centre is this close to the eye (m)
const R_DROP = 19;
const STEP = 3; // floor / ceiling placement grid (voxels)
const WSTEP = 4; // wall placement grid (voxels)
const M1 = CS - 1;
const vkey = (vx, vy, vz) => ((vx + 4096) * 8192 + (vy + 4096)) * 8192 + (vz + 4096);
const EMPTY = [];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function pickW(list, h) {
  let tot = 0;
  for (const e of list) tot += e[1];
  let r = h * tot;
  for (const e of list) { r -= e[1]; if (r <= 0) return e[0]; }
  return list[list.length - 1][0];
}

// ---------------------------------------------------------------- staging (one chunk's cards)
class Stage {
  constructor() { this.n = 0; this.cap = 0; this.grow(512); }
  grow(c) {
    const o = this.cap ? this : null;
    const cp = (T, k, old) => { const a = new T(c * k); if (old) a.set(old.subarray(0, this.n * k)); return a; };
    this.base = cp(Float32Array, 3, o?.base); this.side = cp(Float32Array, 3, o?.side); this.up = cp(Float32Array, 3, o?.up);
    this.uv = cp(Uint16Array, 4, o?.uv); this.a = cp(Uint8Array, 4, o?.a); this.b = cp(Uint8Array, 4, o?.b); this.c = cp(Uint8Array, 4, o?.c);
    this.cap = c;
  }
  reset() { this.n = 0; }
  /** The constants of the plant whose cards come next. */
  begin(glow, sway, rank, tr, tg, tb, flutter) {
    const b8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    this.pg = b8(glow / 2); this.ps = b8(sway / 0.25); this.pr = b8(rank);
    this.pt0 = b8(tr / 2); this.pt1 = b8(tg / 2); this.pt2 = b8(tb / 2); this.pf = b8(flutter); this.pgu = b8(this.gust);
  }
  /** One card: base (root edge centre), side (full width), up (root → tip), uv rect, bend + ao at root / tip. */
  quad(bx, by, bz, sx, sy, sz, ux, uy, uz, u0, vb, u1, vt, b0, b1, ao0, ao1) {
    if (this.n >= this.cap) this.grow(this.cap * 2);
    const i = this.n++, i3 = i * 3, i4 = i * 4;
    const B = this.base, S = this.side, U = this.up, V = this.uv, A = this.a, Bb = this.b, C = this.c;
    B[i3] = bx; B[i3 + 1] = by; B[i3 + 2] = bz;
    S[i3] = sx; S[i3 + 1] = sy; S[i3 + 2] = sz;
    U[i3] = ux; U[i3 + 1] = uy; U[i3 + 2] = uz;
    V[i4] = Math.round(u0 * 65535); V[i4 + 1] = Math.round(vb * 65535); V[i4 + 2] = Math.round(u1 * 65535); V[i4 + 3] = Math.round(vt * 65535);
    A[i4] = Math.round(b0 * 255); A[i4 + 1] = Math.round(b1 * 255); A[i4 + 2] = this.pgu; A[i4 + 3] = this.pf;
    Bb[i4] = this.pt0; Bb[i4 + 1] = this.pt1; Bb[i4 + 2] = this.pt2; Bb[i4 + 3] = this.pr;
    C[i4] = Math.round(ao0 * 255); C[i4 + 1] = Math.round(ao1 * 255); C[i4 + 2] = this.pg; C[i4 + 3] = this.ps;
  }
  /** A compact copy of the staged cards (the chunk keeps it to move or edit its range). */
  take() {
    const n = this.n;
    return { n, base: this.base.slice(0, n * 3), side: this.side.slice(0, n * 3), up: this.up.slice(0, n * 3), uv: this.uv.slice(0, n * 4), a: this.a.slice(0, n * 4), b: this.b.slice(0, n * 4), c: this.c.slice(0, n * 4) };
  }
}

// ---------------------------------------------------------------- the instanced buffer
const ATTRS = [['iBase', 3, Float32Array, false, 'base'], ['iSide', 3, Float32Array, false, 'side'], ['iUp', 3, Float32Array, false, 'up'], ['iUV', 4, Uint16Array, true, 'uv'], ['iA', 4, Uint8Array, true, 'a'], ['iB', 4, Uint8Array, true, 'b'], ['iC', 4, Uint8Array, true, 'c']];
/** One instanced quad mesh; chunks rent contiguous instance ranges (first fit, coalescing). */
class Pool {
  constructor(mat, parent) {
    this.mat = mat; this.parent = parent;
    this.cap = 0; this.high = 0; this.free = []; this.live = new Set(); this.liveN = 0;
    this.mesh = null; this.geo = null;
    this.resize(1 << 14);
  }
  resize(cap) {
    const old = this.geo;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    for (const [name, k, T, norm] of ATTRS) {
      const a = new T(cap * k);
      const o = old?.attributes[name];
      if (o) a.set(o.array);
      const at = new THREE.InstancedBufferAttribute(a, k, norm);
      at.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, at);
    }
    g.instanceCount = this.high;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    if (!this.mesh) {
      this.mesh = new THREE.Mesh(g, this.mat);
      this.mesh.frustumCulled = false;
      this.mesh.matrixAutoUpdate = false;
      this.mesh.name = 'cave-vegetation';
      this.parent.add(this.mesh);
    } else this.mesh.geometry = g;
    old?.dispose();
    this.give(this.cap, cap - this.cap);
    this.cap = cap;
    this.geo = g;
  }
  give(s, n) {
    if (n <= 0) return;
    const L = this.free;
    let i = 0;
    while (i < L.length && L[i][0] < s) i++;
    L.splice(i, 0, [s, n]);
    if (i + 1 < L.length && s + n === L[i + 1][0]) { L[i][1] += L[i + 1][1]; L.splice(i + 1, 1); }
    if (i > 0 && L[i - 1][0] + L[i - 1][1] === s) { L[i - 1][1] += L[i][1]; L.splice(i, 1); }
  }
  take(n) {
    const L = this.free;
    for (let i = 0; i < L.length; i++) {
      const r = L[i];
      if (r[1] < n) continue;
      const s = r[0];
      r[0] += n; r[1] -= n;
      if (!r[1]) L.splice(i, 1);
      return s;
    }
    return -1;
  }
  alloc(n) {
    for (;;) {
      const s = this.take(n);
      if (s >= 0) {
        const slot = { s, n };
        this.live.add(slot);
        this.liveN += n;
        if (s + n > this.high) { this.high = s + n; this.geo.instanceCount = this.high; }
        return slot;
      }
      this.resize(Math.max(this.cap * 2, this.cap + n * 2));
    }
  }
  mark(name, s, n) {
    const at = this.geo.attributes[name];
    at.addUpdateRange(s * at.itemSize, n * at.itemSize);
    at.needsUpdate = true;
  }
  write(slot, d) {
    const A = this.geo.attributes;
    for (const [name, k, , , key] of ATTRS) { A[name].array.set(d[key], slot.s * k); this.mark(name, slot.s, d.n); }
  }
  /** Hide cards (zero length: the shader drops them). */
  hide(s, n) {
    this.geo.attributes.iUp.array.fill(0, s * 3, (s + n) * 3);
    this.mark('iUp', s, n);
  }
  release(slot) {
    if (!this.live.delete(slot)) return;
    this.liveN -= slot.n;
    this.hide(slot.s, slot.n);
    this.give(slot.s, slot.n);
    if (slot.s + slot.n >= this.high) {
      this.high = 0;
      for (const l of this.live) this.high = Math.max(this.high, l.s + l.n);
      this.geo.instanceCount = this.high;
    }
  }
  /** The highest live slot when the drawn range is mostly holes and a hole below could take it. */
  topIfSparse() {
    if (this.high < 4096 || this.high < this.liveN * 1.3) return null;
    let top = null;
    for (const l of this.live) if (!top || l.s > top.s) top = l;
    for (const f of this.free) if (f[0] < top.s && f[1] >= top.n) return top;
    return null;
  }
  dispose() { this.parent.remove(this.mesh); this.geo.dispose(); }
}

// ---------------------------------------------------------------- vegetation
export class Vegetation {
  constructor(ctx) {
    this.ctx = ctx;
    this.w = ctx.world;
    this.plan = ctx.plan || ctx.world.plan;
    this.fx = ctx.fx;
    this.audio = ctx.audio;
    this.owner = ctx.owner;
    this.seed = (this.plan.seed | 0) || 1;
    this.atlas = vegetationAtlas();
    this.mat = makeVegMaterial(ctx.U, this.atlas.tex);
    this.U = this.mat.uniforms;
    this.pool = new Pool(this.mat, ctx.scene3 || ctx.scene);
    this.stage = new Stage();
    this.built = new Map(); // chunk key → rec { key, ch, x, y, z, slot, d (cards), plants, at (voxel key → plants), light }
    this.queue = [];
    this.qi = 0;
    this.scanT = 0;
    this.scanJob = null;
    this.time = 0;
    this.age = 0;
    this.budget = 1.3; // ms of planting per frame in play
    this.trail = [];
    this.trailT = 0;
    this.rustleT = 0;
    this.burstT = 0;
    this.stats = { chunks: 0, plants: 0, cards: 0, ms: 0, worst: 0, buildMs: 0, maxBuild: 0, built: 0 };
    this.outLights = [0, 1].map(() => ({ x: 0, y: 0, z: 0, c: [0, 0, 0], r: 1 }));
    this.noise = this.plan.noise;
    this.blockers = this.makeBlockers();
    this.trails = (this.plan.features || []).filter((f) => f.kind === 'trail' && !f.ladder && f.bb);
    const pf = (this.plan.features || []).find((f) => f.kind === 'prologue');
    this.pro = pf ? { bb: pf.bb, L: prologueLayout(pf) } : null;
    this.debug = {
      info: () => this.info(),
      near: (x, y, z, r = 3) => this.near(x, y, z, r),
      atlas: (on = true) => this.showAtlas(on),
      rebuild: () => { for (const rec of [...this.built.values()]) this.drop(rec); this.scanT = 0; this.scanJob = null; },
      budget: (ms) => { this.budget = ms; },
      kinds: () => { const o = {}; for (const rec of this.built.values()) for (const p of rec.plants) if (!p.gone) o[p.kind] = (o[p.kind] || 0) + 1; return o; },
      /** Re-plant every built chunk n times: { avg, max } ms per chunk (the planting cost). */
      bench: (n = 3) => {
        const recs = [...this.built.values()];
        let tot = 0, max = 0, k = 0;
        for (let i = 0; i < n; i++) for (const rec of recs) { this.drop(rec); const t = performance.now(); this.build(rec.ch); const d = performance.now() - t; tot += d; k++; if (d > max) max = d; }
        return { chunks: recs.length, avg: +(tot / Math.max(1, k)).toFixed(3), max: +max.toFixed(2) };
      },
    };
    // while the scene loads: plant what is round the spawn point so the first frame is green
    const pl = ctx.player;
    if (pl?.pos) {
      const t0 = performance.now();
      const e = { x: pl.pos.x, y: pl.pos.y + 0.7, z: pl.pos.z };
      const it = this.scanSteps(e);
      while (!it.next().done && performance.now() - t0 < 30);
      while (this.qi < this.queue.length && performance.now() - t0 < 70) this.buildNext();
    }
  }

  // ------------------------------------------------------------ places nothing grows
  makeBlockers() {
    const P = this.plan, out = [];
    const W = this.owner?.W ?? P.W ?? 10, D = this.owner?.D ?? P.D ?? 8;
    out.push([-0.8, -0.8, -0.8, W + 0.8, 3.8, D + 0.8]);
    for (const m of P.mouths || []) { const b = m.bb || [m.x0, m.y0, m.z0, m.x1, m.y1, m.z1]; out.push([b[0] - 0.3, b[1] - 0.3, b[2] - 0.3, b[3] + 0.3, b[4] + 0.3, b[5] + 0.3]); }
    if (P.shaft && P.town) out.push([P.shaft.x - 2, -260, P.shaft.z - 2, P.shaft.x + 2, P.town.y + 4, P.shaft.z + 2]);
    for (const s of P.stations || []) out.push([s.x - 2.1, s.y - 0.6, s.z - 1.9, s.x + 2.1, s.y + 2.8, s.z + 1.9]);
    if (P.town) { const T = P.town; out.push([T.x + 1.6 - 3.8, T.y - 1.2, T.z - 1.2 - 3.8, T.x + 1.6 + 3.8, T.y + 4.2, T.z - 1.2 + 3.8]); }
    for (const L of P.lifts || []) if (L.id[0] === 'L') out.push([L.x - 1.9, L.y - 0.6, L.z - 1.9, L.x + 1.9, L.y + 7, L.z + 3.4]);
    for (const f of P.features || []) if (f.kind === 'burrow' && f.bb) out.push(f.bb);
    return out;
  }
  blockersIn(x0, y0, z0, x1, y1, z1) {
    const out = [];
    for (const b of this.blockers) if (b[3] > x0 && b[0] < x1 && b[4] > y0 && b[1] < y1 && b[5] > z0 && b[2] < z1) out.push(b);
    return out;
  }

  // ------------------------------------------------------------ planting one chunk
  /** The flora at a spot (cached per 1 m cell of the chunk being planted). */
  floraAt(c, lx, ly, lz) {
    const i = (lx >> 4) + 2 * ((ly >> 4) + 2 * (lz >> 4));
    let F = c.fl[i];
    if (!F) {
      const x = (c.X0 + (lx & ~15) + 8) / VOX, y = (c.Y0 + (ly & ~15) + 8) / VOX, z = (c.Z0 + (lz & ~15) + 8) / VOX;
      let bio = 0;
      try { bio = biomeAt(this.plan, x, y, z) || 0; } catch (e) { bio = 0; }
      F = c.fl[i] = floraOf(zoneAt(-y), bio, -y);
    }
    return F;
  }
  /** Patches: meadows and bare ground from two noise octaves (0..1). */
  patch(x, y, z, k = 0) {
    const N = this.noise;
    const a = N[1].n(x * 0.55 + 71.3, y * 0.55 - 4.1, z * 0.55 - 13.7);
    const b = N[2].n(x / 7 + 3.3, y / 7, z / 7 - 8.8);
    const v = a * 0.6 + b * 0.55 + k;
    return Math.max(0, Math.min(1, (v + 0.35) / 0.7));
  }
  /** Inside a trail's trodden corridor (0 = middle of the path, 1 = clear of it). */
  trodden(c, x, y, z) {
    let best = 1;
    for (const f of c.trails) {
      const dx = f.b.x - f.a.x, dz = f.b.z - f.a.z, len = Math.hypot(dx, dz) || 1e-6;
      const px = x - f.a.x, pz = z - f.a.z, s = (px * dx + pz * dz) / len;
      if (s < -0.5 || s > len + 0.5) continue;
      const t = Math.max(0, Math.min(1, s / len)), fy = f.a.y + (f.b.y - f.a.y) * t;
      if (y < fy - 0.3 || y > fy + (f.h || 1.6) + 0.3) continue;
      const lat = Math.abs((px * -dz + pz * dx) / len), hw = (f.w || TRAIL_W) / 2;
      best = Math.min(best, Math.max(0, Math.min(1, (lat - hw * 0.45) / (hw * 0.55))));
    }
    return best;
  }
  blockedAt(c, x, y, z) {
    for (const b of c.blk) if (x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]) return true;
    if (c.pro && prologueInside(this.pro.L, x, y, z, 0.4)) return true;
    return false;
  }

  /** Plant a chunk: fills the staging buffer and rec.plants. */
  place(rec) {
    const ch = rec.ch, w = this.w, S = this.seed;
    if (!ch.vox) return;
    const vox = ch.vox;
    const X0 = ch.cx * CS, Y0 = ch.cy * CS, Z0 = ch.cz * CS;
    // nothing but rock: nothing to grow on
    let open = false;
    for (let i = 0; i < vox.length && !open; i += 7) if (vox[i] === 0) open = true;
    if (!open) return;
    const ed = w.edits.get(ch.key);
    const inside = (lx, ly, lz) => lx >= 0 && ly >= 0 && lz >= 0 && lx < CS && ly < CS && lz < CS;
    const at = (lx, ly, lz) => (inside(lx, ly, lz) ? vox[lx + CS * (ly + CS * lz)] : w.voxelAt(X0 + lx, Y0 + ly, Z0 + lz));
    // the player's own diggings stay bare
    const fresh = (lx, ly, lz) => {
      if (inside(lx, ly, lz)) return !ed || !ed.has(lx + CS * (ly + CS * lz));
      const vx = X0 + lx, vy = Y0 + ly, vz = Z0 + lz;
      const e2 = w.edits.get(key3(vx >> CB, vy >> CB, vz >> CB));
      return !e2 || !e2.has((vx & M1) + CS * ((vy & M1) + CS * (vz & M1)));
    };
    const x0 = X0 / VOX, y0 = Y0 / VOX, z0 = Z0 / VOX;
    const c = {
      X0, Y0, Z0, fl: new Array(8), at, fresh,
      blk: this.blockersIn(x0 - 1.5, y0 - 1.5, z0 - 1.5, x0 + CM + 1.5, y0 + CM + 1.5, z0 + CM + 1.5),
      pro: !!(this.pro && this.pro.bb[3] > x0 && this.pro.bb[0] < x0 + CM && this.pro.bb[4] > y0 && this.pro.bb[1] < y0 + CM && this.pro.bb[5] > z0 && this.pro.bb[2] < z0 + CM),
      trails: this.trails.filter((f) => f.bb[3] > x0 - 0.5 && f.bb[0] < x0 + CM + 0.5 && f.bb[4] > y0 - 0.5 && f.bb[1] < y0 + CM + 0.5 && f.bb[5] > z0 - 0.5 && f.bb[2] < z0 + CM + 0.5),
      big: [],
    };
    const solid = (lx, ly, lz) => OPAQUE[at(lx, ly, lz)] === 1;
    // floors and ceilings: columns on a 3-voxel world grid, each nudged within its cell
    const sx = ((STEP - (X0 % STEP)) % STEP), sz = ((STEP - (Z0 % STEP)) % STEP);
    for (let lz = sz; lz < CS; lz += STEP) for (let lx = sx; lx < CS; lx += STEP) {
      const gx = X0 + lx, gz = Z0 + lz;
      const jx = Math.min(M1, lx + Math.floor(h3(gx, 7, gz, S + 3) * STEP)), jz = Math.min(M1, lz + Math.floor(h3(gx, 9, gz, S + 5) * STEP));
      let below = at(jx, -1, jz);
      for (let ly = 0; ly < CS; ly++) {
        const m = vox[jx + CS * (ly + CS * jz)];
        if (m === 0) {
          if (FERT[below] > 0) this.tryFloor(rec, c, jx, ly, jz, below);
          const above = ly < M1 ? vox[jx + CS * (ly + 1 + CS * jz)] : at(jx, CS, jz);
          if (FERT[above] > 0) this.tryCeil(rec, c, jx, ly, jz, above);
        }
        below = m;
      }
    }
    // walls: air voxels on a coarser grid, next to fertile rock
    const wx = ((WSTEP - (X0 % WSTEP)) % WSTEP), wz = ((WSTEP - (Z0 % WSTEP)) % WSTEP), wy = ((WSTEP - (Y0 % WSTEP)) % WSTEP);
    for (let lz = wz; lz < CS; lz += WSTEP) for (let ly = wy + 1; ly < CS - 1; ly += WSTEP) for (let lx = wx; lx < CS; lx += WSTEP) {
      if (vox[lx + CS * (ly + CS * lz)] !== 0) continue;
      const F = this.floraAt(c, lx, ly, lz);
      if (!F.w || !F.wall.length) continue;
      const gx = X0 + lx, gy = Y0 + ly, gz = Z0 + lz;
      const h = h3(gx, gy, gz, S + 41);
      if (h > F.w) continue;
      // standing on a floor or under a roof is not a wall
      if (solid(lx, ly - 1, lz) || solid(lx, ly + 1, lz)) continue;
      const d0 = Math.floor(h3(gx, gy, gz, S + 43) * 4);
      for (let k = 0; k < 4; k++) {
        const [dx, dz] = DIRS[(d0 + k) & 3];
        const m = at(lx + dx, ly, lz + dz);
        if (!FERT[m]) continue;
        if (solid(lx - dx, ly, lz - dz)) break; // needs room in front
        this.tryWall(rec, c, F, lx, ly, lz, dx, dz, m, h / F.w);
        break;
      }
    }
  }

  /** A plant record + its cards (P: the layPlant spec); k1, k2: the voxels it needs as they are. */
  plant(rec, P, k1, k2, gust) {
    const st = this.stage, q0 = st.n;
    st.gust = gust;
    const res = layPlant(st, P, this._out || (this._out = { rad: 0, h: 0 }));
    const K = P.K;
    const p = { q0, nq: st.n - q0, x: P.x, y: P.y, z: P.z, kind: P.kind, col: P.spr.col, gone: false, rad: res.rad, h: res.h, hang: !!K.hang };
    rec.plants.push(p);
    for (const k of [k1, k2]) { const a = rec.at.get(k); if (a) a.push(p); else rec.at.set(k, [p]); }
    if (K.light) {
      const L = rec.glow || (rec.glow = { x: 0, y: 0, z: 0, c: [0, 0, 0], n: 0 });
      L.x += P.x; L.y += P.y + (K.hang ? -res.h * 0.5 : res.h * 0.5); L.z += P.z;
      L.c[0] += K.light[0]; L.c[1] += K.light[1]; L.c[2] += K.light[2]; L.n++;
    }
    return p;
  }

  tryFloor(rec, c, lx, ly, lz, sup) {
    const S = this.seed, F = this.floraAt(c, lx, ly, lz);
    if (!F.floor.length) return;
    const vx = c.X0 + lx, vy = c.Y0 + ly, vz = c.Z0 + lz;
    const h = h3(vx, vy, vz, S + 11);
    const fert = F.rock && ROCK[sup] ? Math.max(FERT[sup], F.rock) : FERT[sup]; // moss creeps over the rock in lush places
    if (h >= F.f * fert) return; // the best this spot could do
    const x = (vx + 0.5) / VOX, y = vy / VOX, z = (vz + 0.5) / VOX;
    const dens = fert * this.patch(x, y, z, F.bio === 1 || F.bio === 3 ? 0.25 : 0) * this.trodden(c, x, y, z);
    if (h >= F.f * dens) return;
    if (!c.fresh(lx, ly, lz) || !c.fresh(lx, ly - 1, lz)) return;
    // kinds come in little clumps: most picks share a hash over a 0.75 m cell
    const hc = h3(Math.floor(x / 0.75), Math.floor(y / 0.75), Math.floor(z / 0.75), S + 21);
    const kind = pickW(F.floor, h3(vx, vy, vz, S + 13) < 0.6 ? hc : h3(vx, vy, vz, S + 17));
    const K = KINDS[kind];
    if (!K) return;
    if (this.blockedAt(c, x, y, z)) return;
    // room to stand in
    const at = c.at;
    const hv = Math.ceil(((K.h ?? 0.3) + (K.big ? 0.6 : 0)) * VOX);
    if (at(lx, ly + 1, lz) !== 0 || at(lx, ly + Math.min(hv, 2 * VOX), lz) !== 0 || at(lx, ly + (hv >> 1), lz) !== 0) return;
    if (K.lay === 'flat') {
      // only where the ground is level for a hand's breadth round about
      for (let k = 0; k < 4; k++) { const dx = DIRS[k][0] * 2, dz = DIRS[k][1] * 2; if (at(lx + dx, ly, lz + dz) !== 0 || at(lx + dx, ly - 1, lz + dz) === 0) return; }
    }
    if (K.lay === 'rosette') {
      const rr = Math.round((K.r ?? 0.4) * VOX * 0.5), up = Math.round(K.len[0] * VOX * 0.45);
      for (let k = 0; k < 4; k++) if (at(lx + DIRS[k][0] * rr, ly + up, lz + DIRS[k][1] * rr) !== 0) return;
      if (K.big) {
        if (h3(vx >> 4, vy >> 4, vz >> 4, S + 31) > 0.5) return;
        for (const o of c.big) if ((o[0] - x) ** 2 + (o[1] - z) ** 2 < 1.6 * 1.6 && Math.abs(o[2] - y) < 1) return;
        c.big.push([x, z, y]);
      }
    }
    const spr = this.atlas.get(K.spr);
    if (!spr) return;
    const r = rng(h3i(vx, vy, vz, S + 23));
    const jx = (r() - 0.5) * 0.9 / VOX, jz = (r() - 0.5) * 0.9 / VOX;
    this.plant(rec, { K, kind, spr: spr[Math.floor(r() * spr.length)], r, x: x + jx, y: y - 0.008, z: z + jz, yaw: r() * Math.PI * 2 },
      vkey(vx, vy - 1, vz), vkey(vx, vy, vz), this.gustOf(x, z));
  }

  tryCeil(rec, c, lx, ly, lz, sup) {
    const S = this.seed, F = this.floraAt(c, lx, ly, lz);
    if (!F.c || !F.ceil.length) return;
    const vx = c.X0 + lx, vy = c.Y0 + ly, vz = c.Z0 + lz;
    const h = h3(vx, vy, vz, S + 51);
    const fert = Math.max(0.35, FERT[sup]);
    if (h >= F.c * fert) return;
    const x = (vx + 0.5) / VOX, y = (vy + 1) / VOX, z = (vz + 0.5) / VOX;
    const dens = fert * this.patch(x, y, z, 0.15) * (c.trails.length ? 0.4 + 0.6 * this.trodden(c, x, y - 1, z) : 1);
    if (h >= F.c * dens) return;
    if (!c.fresh(lx, ly, lz) || !c.fresh(lx, ly + 1, lz)) return;
    const kind = pickW(F.ceil, h3(vx, vy, vz, S + 53));
    const K = KINDS[kind];
    if (!K) return;
    if (this.blockedAt(c, x, y - 0.3, z)) return;
    // how far it may hang: leave headroom over the floor
    let free = 0;
    while (free < 2.4 * VOX && c.at(lx, ly - free, lz) === 0) free++;
    // in low passages they stop about eye height (the mole walks through, they part), in halls lower
    const fm = free / VOX, room = fm - Math.max(0.42, Math.min(0.8, fm * 0.45));
    if (room < K.len[0] * 0.75) return;
    const spr = this.atlas.get(K.spr);
    if (!spr) return;
    const r = rng(h3i(vx, vy, vz, S + 57));
    this.plant(rec, { K, kind, spr: spr[Math.floor(r() * spr.length)], r, x: x + (r() - 0.5) * 0.9 / VOX, y: y + 0.01, z: z + (r() - 0.5) * 0.9 / VOX, yaw: r() * Math.PI * 2, room },
      vkey(vx, vy + 1, vz), vkey(vx, vy, vz), this.gustOf(x, z));
  }

  tryWall(rec, c, F, lx, ly, lz, dx, dz, m, hk) {
    const S = this.seed;
    const vx = c.X0 + lx, vy = c.Y0 + ly, vz = c.Z0 + lz;
    // the face of the rock (metres) and its outward normal
    const x = (vx + 0.5 + dx * 0.5) / VOX, y = (vy + 0.5) / VOX, z = (vz + 0.5 + dz * 0.5) / VOX;
    if (hk > FERT[m] * this.patch(x, y, z, F.bio === 1 ? 0.3 : 0)) return;
    if (!c.fresh(lx, ly, lz) || !c.fresh(lx + dx, ly, lz + dz)) return;
    const kind = pickW(F.wall, h3(vx, vy, vz, S + 61));
    const K = KINDS[kind];
    if (!K) return;
    if (this.blockedAt(c, x - dx * 0.2, y, z - dz * 0.2)) return;
    if (K.lay === 'decal') {
      // a flat patch wants a flat bit of wall
      const tx = -dz, tz = dx;
      for (const [t, u] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        if (OPAQUE[c.at(lx + dx + tx * t, ly + u, lz + dz + tz * t)] !== 1 || c.at(lx + tx * t, ly + u, lz + tz * t) !== 0) return;
      }
    } else {
      // growing out and up needs a little open space
      if (c.at(lx - dx, ly + 2, lz - dz) !== 0 || c.at(lx, ly + 3, lz) !== 0) return;
    }
    const spr = this.atlas.get(K.spr);
    if (!spr) return;
    const r = rng(h3i(vx, vy, vz, S + 67));
    this.plant(rec, { K, kind, spr: spr[Math.floor(r() * spr.length)], r, x, y: y + (r() - 0.5) * 0.04, z, yaw: 0, nx: -dx, nz: -dz },
      vkey(vx + dx, vy, vz + dz), vkey(vx, vy, vz), this.gustOf(x, z));
  }

  /** Gusts roll through the caves: the phase a plant at (x, z) feels them in (0..1). */
  gustOf(x, z) { const v = (x * 0.8 + z * 0.6) * 0.21; return v - Math.floor(v); }

  // ------------------------------------------------------------ chunks → buffer
  build(ch) {
    const t0 = performance.now();
    const rec = { key: ch.key, ch, x: (ch.cx + 0.5) * CM, y: (ch.cy + 0.5) * CM, z: (ch.cz + 0.5) * CM, slot: null, d: null, plants: [], at: new Map(), glow: null };
    this.built.set(ch.key, rec);
    this.stage.reset();
    try { this.place(rec); } catch (e) {
      if (!this.warned) { this.warned = true; console.warn('vegetation: planting failed', e); }
      rec.plants.length = 0; rec.at.clear(); this.stage.reset();
    }
    if (this.stage.n) {
      rec.d = this.stage.take();
      rec.slot = this.pool.alloc(rec.d.n);
      this.pool.write(rec.slot, rec.d);
    }
    if (rec.glow) { const L = rec.glow, n = L.n; L.x /= n; L.y /= n; L.z /= n; L.c = L.c.map((v) => v / n); }
    const ms = performance.now() - t0;
    this.stats.buildMs += ms;
    this.stats.built++;
    if (ms > this.stats.maxBuild) this.stats.maxBuild = ms;
    return rec;
  }
  drop(rec) {
    if (rec.slot) this.pool.release(rec.slot);
    rec.slot = null;
    this.built.delete(rec.key);
  }
  /** Move a chunk's cards down into a hole (keeps the drawn range dense). */
  move(rec) {
    if (!rec.slot || !rec.d) return;
    const old = rec.slot;
    this.pool.live.delete(old); this.pool.liveN -= old.n; // take it out first so the hole below is found
    this.pool.give(old.s, old.n);
    const s = this.pool.alloc(rec.d.n);
    if (s.s === old.s) { rec.slot = s; return; }
    this.pool.write(s, rec.d);
    // hide what is left of the old range (the new one may overlap its start)
    const from = Math.max(old.s, s.s + s.n);
    if (from < old.s + old.n) this.pool.hide(from, old.s + old.n - from);
    rec.slot = s;
    let hi = 0;
    for (const l of this.pool.live) hi = Math.max(hi, l.s + l.n);
    this.pool.high = hi; this.pool.geo.instanceCount = hi;
  }

  neighborsLoaded(ch) {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const n = this.w.chunk(ch.cx + dx, ch.cy + dy, ch.cz + dz);
      if (!n || n.pending) return false;
    }
    return true;
  }
  ring() {
    if (this._ring) return this._ring;
    const R = Math.ceil(R_BUILD / CM) + 1, out = [];
    for (let dz = -R; dz <= R; dz++) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dy * 1.3, dz) * CM; // a little flatter: floors and roofs near the mole first
      if (d < R_BUILD + CM) out.push([d, dx, dy, dz]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return (this._ring = out);
  }
  /** Rescan (spread over frames): drop far / regenerated chunks, queue near unplanted ones nearest first. */
  *scanSteps(eye) {
    const ex = eye.x, ey = eye.y, ez = eye.z;
    const ecx = Math.floor(ex / CM), ecy = Math.floor(ey / CM), ecz = Math.floor(ez / CM);
    const w = this.w;
    let n = 0;
    for (const rec of [...this.built.values()]) {
      if (Math.hypot(rec.x - ex, rec.y - ey, rec.z - ez) > R_DROP || w.chunks.get(rec.key) !== rec.ch) this.drop(rec);
      if ((++n & 63) === 0) yield;
    }
    const q = [];
    for (const [, dx, dy, dz] of this.ring()) {
      const ch = w.chunk(ecx + dx, ecy + dy, ecz + dz);
      if (ch && !ch.pending && !ch.virtual && ch.vox && !this.built.has(ch.key)) q.push(ch);
      if ((++n & 255) === 0) yield;
    }
    this.queue = q;
    this.qi = 0;
  }
  buildNext() {
    const ch = this.queue[this.qi++];
    if (!ch || ch.pending || !ch.vox || this.built.has(ch.key) || this.w.chunks.get(ch.key) !== ch) return;
    if (!this.neighborsLoaded(ch)) return;
    this.build(ch);
  }
  stream(eye, budget) {
    const t0 = performance.now();
    if (!this.scanJob && this.scanT <= 0) { this.scanT = 0.45; this.scanJob = this.scanSteps(eye); }
    if (this.scanJob) {
      let r;
      do r = this.scanJob.next(); while (!r.done && performance.now() - t0 < budget * 0.4);
      if (r.done) this.scanJob = null;
    }
    while (this.qi < this.queue.length && performance.now() - t0 < budget) this.buildNext();
    if (performance.now() - t0 < budget) {
      const top = this.pool.topIfSparse();
      if (top) for (const rec of this.built.values()) if (rec.slot === top) { this.move(rec); break; }
    }
  }

  // ------------------------------------------------------------ digging
  /** world.onChange: a plant whose ground is dug away (or whose space is filled) goes. */
  onVoxel(vx, vy, vz, old, m) {
    if (this.inHook === false && !this.leadWired) this.leadWired = true; // DigScene calls us itself
    if ((OPAQUE[old] === 1) === (OPAQUE[m] === 1)) return;
    const k = vkey(vx, vy, vz);
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (const [dx, dy, dz] of [[0, 0, 0], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
      const ck = key3((vx + dx) >> CB, (vy + dy) >> CB, (vz + dz) >> CB);
      if (seen.has(ck)) continue;
      seen.add(ck);
      const rec = this.built.get(ck);
      const list = rec?.at.get(k);
      if (!list) continue;
      for (const p of list) this.remove(rec, p, true);
      rec.at.delete(k);
    }
  }
  remove(rec, p, burst) {
    if (p.gone) return;
    p.gone = true;
    if (rec.slot && rec.d) {
      rec.d.up.fill(0, p.q0 * 3, (p.q0 + p.nq) * 3);
      this.pool.hide(rec.slot.s + p.q0, p.nq);
    }
    if (!burst || !this.fx) return;
    // a puff of torn leaves (a few per frame at most)
    if (this.burstT > this.time) return;
    this.burstT = this.time + 0.05;
    const col = p.col, R = Math.random;
    for (let i = 0; i < 6; i++) {
      const a = R() * Math.PI * 2, sp = 0.4 + R() * 0.8;
      this.fx.spawn({ x: p.x, y: p.y + (p.hang ? -0.1 : 0.06), z: p.z, vx: Math.cos(a) * sp, vy: 0.6 + R() * 0.9, vz: Math.sin(a) * sp, life: 0.5 + R() * 0.5, size: 0.012 + R() * 0.008, color: col, alpha: 1, drag: 1.6, grav: 5, fade: false });
    }
  }
  /** Chain into world.onChange (DigScene wires props + fluids there; we add ourselves after them). */
  hook() {
    const w = this.w;
    if (this.leadWired || w.onChange === this.hookFn) return;
    const prev = w.onChange;
    this.prevHook = prev;
    this.hookFn = (vx, vy, vz, old, m) => {
      if (prev) { this.inHook = false; prev(vx, vy, vz, old, m); this.inHook = true; }
      if (!this.leadWired) this.onVoxel(vx, vy, vz, old, m);
    };
    this.inHook = true;
    w.onChange = this.hookFn;
  }

  // ------------------------------------------------------------ per frame
  update(dt, o = {}) {
    const t0 = performance.now();
    this.time = o.time ?? this.time + dt;
    this.age += dt;
    this.hook();
    const pl = o.player || this.ctx.player;
    const eye = o.eye || pl?.eye?.();
    if (!eye) return EMPTY;
    const t = this.time, U = this.U;
    // the cave's breath: a slow draught that wanders and swells
    const wa = t * 0.045 + Math.sin(t * 0.11) * 0.9;
    U.uWind.value.set(Math.cos(wa), Math.sin(wa), 0.55 + 0.45 * Math.sin(t * 0.27) * Math.sin(t * 0.083 + 1.3), 0.85);
    // who brushes through: the mole now, where it just was (plants spring back), Nugget
    const P = U.uPush.value, K = U.uPushK.value;
    if (pl?.pos) {
      P[0].set(pl.pos.x, pl.pos.y, pl.pos.z, pl.crouched ? 0.3 : 0.34); K[0] = 1;
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.11;
        this.trail.unshift({ x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, t });
        if (this.trail.length > 3) this.trail.length = 3;
      }
      for (let i = 0; i < 2; i++) {
        const q = this.trail[i + 1];
        if (!q) { K[i + 1] = 0; continue; }
        const moved = Math.hypot(q.x - pl.pos.x, q.z - pl.pos.z);
        P[i + 1].set(q.x, q.y, q.z, 0.32);
        K[i + 1] = moved > 0.05 ? Math.max(0, 0.55 - (t - q.t) * 1.4) : 0;
      }
    }
    const ng = this.owner?.nugget;
    if (ng?.pos && PUSHERS > 3) { P[3].set(ng.pos.x, ng.pos.y, ng.pos.z, 0.24); K[3] = 1; } else K[3] = 0;
    // small plants thin out sooner on the simpler shader settings (phones)
    const fx = this.owner?.game?.engine?.fx || 'high';
    if (fx !== this.fxLevel) { this.fxLevel = fx; U.uLod.value.set(...(fx === 'high' ? [9.5, 17] : fx === 'low' ? [6.5, 12] : [4.5, 8.5])); }
    // planting
    this.scanT -= dt;
    this.stream(eye, this.age < 2.5 ? 4 : this.budget);
    // a soft rustle when walking through tall stuff
    this.rustleT -= dt;
    if (this.rustleT <= 0 && pl?.pos && (pl.speed || 0) > 0.7 && pl.grounded) {
      this.rustleT = 0.16;
      if (this.brushing(pl.pos)) {
        this.rustleT = 0.32 + Math.random() * 0.2;
        this.audio?.noise?.({ color: 'pink', filter: 'bandpass', f: 2600 + Math.random() * 1600, f2: 1400, q: 0.8, dur: 0.18, a: 0.03, vol: 0.05 });
      }
    }
    const ms = performance.now() - t0, st = this.stats;
    st.ms = st.ms * 0.92 + ms * 0.08;
    if (this.age > 3) st.worst = Math.max(st.worst, ms);
    return EMPTY;
  }

  /** Is the mole wading through grass or ferns right now? */
  brushing(pos) {
    const rec = this.built.get(key3(Math.floor(pos.x * VOX) >> CB, Math.floor((pos.y + 0.05) * VOX) >> CB, Math.floor(pos.z * VOX) >> CB));
    if (!rec) return false;
    for (const p of rec.plants) {
      if (p.gone || p.hang || p.h < 0.12) continue;
      if (Math.abs(p.y - pos.y) < 0.3 && (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 < (p.rad * 0.7 + 0.15) ** 2) return true;
    }
    return false;
  }

  /** Up to 2 faint glows: the nearest luminous patches (fungus, flowers, glowing vines). */
  lights(eye) {
    let a = null, b = null, da = 1e9, db = 1e9;
    for (const rec of this.built.values()) {
      const L = rec.glow;
      if (!L || L.n < 2) continue;
      const d = Math.hypot(L.x - eye.x, L.y - eye.y, L.z - eye.z);
      if (d > 11) continue;
      if (d < da) { b = a; db = da; a = rec; da = d; } else if (d < db) { b = rec; db = d; }
    }
    const out = [];
    for (const [rec, d] of [[a, da], [b, db]]) {
      if (!rec) continue;
      const L = rec.glow, o = this.outLights[out.length];
      const k = Math.min(1, (11 - d) / 3) * Math.min(1, 0.35 + L.n * 0.08) * 0.42;
      o.x = L.x; o.y = L.y; o.z = L.z; o.r = 2.4 + Math.min(1.8, L.n * 0.15);
      o.c[0] = L.c[0] * k; o.c[1] = L.c[1] * k; o.c[2] = L.c[2] * k;
      out.push(o);
    }
    return out;
  }

  // ------------------------------------------------------------ debug / teardown
  near(x, y, z, r) {
    const out = [];
    for (const rec of this.built.values()) {
      if (Math.hypot(rec.x - x, rec.y - y, rec.z - z) > r + CM) continue;
      for (const p of rec.plants) if (!p.gone && Math.hypot(p.x - x, p.y - y, p.z - z) < r) out.push({ kind: p.kind, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) });
    }
    return out;
  }
  info() {
    let plants = 0, cards = 0;
    for (const rec of this.built.values()) { for (const p of rec.plants) if (!p.gone) { plants++; cards += p.nq; } }
    const s = this.stats;
    return { chunks: this.built.size, plants, cards, drawn: this.pool.high, cap: this.pool.cap, msAvg: +s.ms.toFixed(3), msWorst: +s.worst.toFixed(2), built: s.built, buildMsAvg: s.built ? +(s.buildMs / s.built).toFixed(3) : 0, buildMsMax: +s.maxBuild.toFixed(2), atlasMs: +(this.atlas.ms || 0).toFixed(1), queue: this.queue.length - this.qi };
  }
  showAtlas(on) {
    document.getElementById('veg-atlas')?.remove();
    if (!on) return null;
    const img = document.createElement('img');
    img.id = 'veg-atlas';
    img.src = this.atlas.dataURL(1);
    img.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;image-rendering:pixelated;width:' + (typeof on === 'number' ? on : 1) * 1024 + 'px;background:#1a1418';
    document.body.appendChild(img);
    return img.src.length;
  }
  dispose() {
    if (this.w.onChange === this.hookFn) this.w.onChange = this.prevHook || null;
    this.pool.dispose();
    this.mat.dispose();
    this.built.clear();
    document.getElementById('veg-atlas')?.remove();
  }
}

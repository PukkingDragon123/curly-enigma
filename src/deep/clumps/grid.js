// The hi-res voxel model of an ore clump: an ore core shaped by its kind (metal nuggets and veins,
// crystal points, a faceted gem, a coal seam, an ammonite, salt cubes, a warty truffle) inside a
// matrix of the host rock (strata, grains, pebbles, ore flecks) under an outer crust of dirt, with
// freshly broken fracture faces, one of which cuts through the edge of the ore so it glints.
//
// Deterministic from a spec, so a saved clump regenerates and replays its cuts. Cells are
// kind (AIR / SOFT crust / ROCK matrix / ORE) + palette index + ore damage (0..3).
// Ops: raycast, pick bites, chisel nibbles, brush sweeps, drill, detaching loose bits, cleanliness.
import { MAT, ORE_BASE } from '../materials.js';
import { ITEMS } from '../../data/items.js';
import { makeNoise3D, h3 } from '../noise.js';
import { makeRng, mixHex } from '../../core/util.js';

export const AIR = 0, SOFT = 1, ROCK = 2, ORE = 3;
// palette slots: 5 crust (tones 0-3, accent), 5 rock, 5 pebble, 5 ore (dark, main, main2, light,
// glint), then flecks of ore in the rock, and scratch / gouge tints for damaged ore
export const P_CRUST = 0, P_ROCK = 5, P_PEB = 10, P_ORE = 15, P_FLECK = 20, P_SCRATCH = 21, P_GOUGE = 22, P_N = 23;

const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** What the ore core looks like for an item. */
export function shapeOf(item) {
  if (item === 'coal') return 'coal';
  if (item === 'fossil') return 'fossil';
  if (item === 'salt_crystal') return 'salt';
  if (item === 'truffle') return 'truffle';
  const ic = ITEMS[item]?.icon || {};
  if (ic.k === 'gem') return 'gem';
  if (ic.k === 'crystal' || ic.k === 'shard') return 'crystal';
  return 'nugget';
}

/** [dark, main, main2, light, glint] sRGB hex for an item's ore. */
export function oreColors(item, oreId) {
  const ic = ITEMS[item]?.icon || {};
  let c = ic.ore || ic.c;
  if (item === 'coal') c = [0x34343e, 0x5c5c70, 0x16161c];
  else if (item === 'fossil') c = [0xd8c49a, 0xf6ead0, 0x8a7052];
  else if (item === 'truffle') c = [0x4e3826, 0x8e6c4e, 0x24170c];
  if (!c) { const t = MAT[ORE_BASE + oreId]?.tones; c = t ? [t[1], t[3], t[0]] : [0x888888, 0xcccccc, 0x444444]; }
  const main = c[0], light = c[1] ?? c[0], dark = c[2] ?? c[0];
  return [dark, main, mixHex(main, light, 0.3), light, mixHex(light, 0xffffff, 0.55)];
}

export class ClumpGrid {
  constructor(n) {
    this.n = n;
    const N3 = n * n * n;
    this.kind = new Uint8Array(N3);
    this.col = new Uint8Array(N3);
    this.dmg = new Uint8Array(N3);
    this.pal = new Array(P_N).fill(0x808080);
    this.ore = null; // Int32Array of ore cell indices
    this.oreFaces = 0; // ore faces that don't touch other ore (the surface to clean)
    this.clean = 0;
    this.version = 0;
    this._mark = new Uint32Array(N3);
    this._gen = 0;
    this._queue = new Int32Array(N3);
  }
  idx(x, y, z) { return x + this.n * (y + this.n * z); }
  inb(x, y, z) { const n = this.n; return x >= 0 && y >= 0 && z >= 0 && x < n && y < n && z < n; }
  at(x, y, z) { return this.inb(x, y, z) ? this.kind[x + this.n * (y + this.n * z)] : AIR; }
  /** Is any of the 6 neighbours air (or outside)? */
  exposed(x, y, z) {
    for (const d of N6) if (this.at(x + d[0], y + d[1], z + d[2]) === AIR) return true;
    return false;
  }

  /** An ore cell on the outside of the ore (next to rock, crust or air). */
  oreSkin(x, y, z) {
    for (const d of N6) if (this.at(x + d[0], y + d[1], z + d[2]) !== ORE) return true;
    return false;
  }

  /** Recount how much of the ore's surface is out in the air (0..1). */
  updateClean() {
    const n = this.n, K = this.kind, ore = this.ore;
    let ex = 0;
    if (!ore || !this.oreFaces) { this.clean = 1; return 1; }
    for (let j = 0; j < ore.length; j++) {
      const i = ore[j];
      const x = i % n, y = ((i / n) | 0) % n, z = (i / (n * n)) | 0;
      for (const d of N6) {
        const k = this.at(x + d[0], y + d[1], z + d[2]);
        if (k === AIR) ex++;
      }
    }
    this.clean = ex / this.oreFaces;
    return this.clean;
  }

  /** Index the ore cells and count the ore surface (once, after generation). */
  indexOre() {
    const n = this.n, K = this.kind, list = [];
    let faces = 0;
    for (let i = 0; i < K.length; i++) {
      if (K[i] !== ORE) continue;
      list.push(i);
      const x = i % n, y = ((i / n) | 0) % n, z = (i / (n * n)) | 0;
      for (const d of N6) if (this.at(x + d[0], y + d[1], z + d[2]) !== ORE) faces++;
    }
    this.ore = Int32Array.from(list);
    this.oreFaces = faces;
    this.updateClean();
  }

  /**
   * DDA through the grid. o, d: ray origin / unit direction in grid coords (1 = one cell).
   * Returns { x, y, z, i, k, nx, ny, nz, t } of the first solid cell, or null.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT = 1e9) {
    const n = this.n;
    // clip to the grid box
    let t0 = 0, t1 = maxT;
    const o = [ox, oy, oz], d = [dx, dy, dz];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < 0 || o[a] > n) return null; continue; }
      let ta = (0 - o[a]) / d[a], tb = (n - o[a]) / d[a];
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
    let t = t0 + 1e-6;
    let x = Math.floor(ox + dx * t), y = Math.floor(oy + dy * t), z = Math.floor(oz + dz * t);
    x = Math.min(n - 1, Math.max(0, x)); y = Math.min(n - 1, Math.max(0, y)); z = Math.min(n - 1, Math.max(0, z));
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1 / (dx || 1e-9)), tdy = Math.abs(1 / (dy || 1e-9)), tdz = Math.abs(1 / (dz || 1e-9));
    let tx = ((dx > 0 ? x + 1 : x) - ox) / (dx || 1e-9), ty = ((dy > 0 ? y + 1 : y) - oy) / (dy || 1e-9), tz = ((dz > 0 ? z + 1 : z) - oz) / (dz || 1e-9);
    if (!isFinite(tx) || tx < t) tx = dx ? tx : 1e9;
    if (!isFinite(ty) || ty < t) ty = dy ? ty : 1e9;
    if (!isFinite(tz) || tz < t) tz = dz ? tz : 1e9;
    // entry face normal
    let nx = 0, ny = 0, nz = 0;
    {
      const ex = ox + dx * t0, ey = oy + dy * t0, ez = oz + dz * t0;
      const ax = Math.min(Math.abs(ex), Math.abs(ex - n)), ay = Math.min(Math.abs(ey), Math.abs(ey - n)), az = Math.min(Math.abs(ez), Math.abs(ez - n));
      if (ax <= ay && ax <= az) nx = -sx; else if (ay <= az) ny = -sy; else nz = -sz;
    }
    for (let s = 0; s < n * 3 + 3; s++) {
      if (x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n) return null;
      const i = x + n * (y + n * z);
      const k = this.kind[i];
      if (k) return { x, y, z, i, k, nx, ny, nz, t };
      if (tx < ty && tx < tz) { t = tx; tx += tdx; x += sx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { t = ty; ty += tdy; y += sy; nx = 0; ny = -sy; nz = 0; }
      else { t = tz; tz += tdz; z += sz; nx = 0; ny = 0; nz = -sz; }
      if (t > t1) return null;
    }
    return null;
  }

  /** The exposed solid cell nearest to a ray that just misses (aim assist), within maxD cells. */
  nearRay(ox, oy, oz, dx, dy, dz, maxD = 2.5) {
    const n = this.n, K = this.kind;
    let best = -1, bd = maxD * maxD, bt = 0;
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = x + n * (y + n * z);
      if (!K[i]) continue;
      const px = x + 0.5 - ox, py = y + 0.5 - oy, pz = z + 0.5 - oz;
      const t = px * dx + py * dy + pz * dz;
      if (t <= 0) continue;
      const d2 = px * px + py * py + pz * pz - t * t;
      if (d2 > bd + 1e-6 && !(Math.abs(d2 - bd) < 1e-6 && t < bt)) continue;
      if (!this.exposed(x, y, z)) continue;
      best = i; bd = d2; bt = t;
    }
    if (best < 0) return null;
    const x = best % n, y = ((best / n) | 0) % n, z = (best / (n * n)) | 0;
    // the face that looks back along the ray
    const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
    const nx = ax >= ay && ax >= az ? -Math.sign(dx) : 0, ny = ay > ax && ay >= az ? -Math.sign(dy) : 0, nz = az > ax && az > ay ? -Math.sign(dz) : 0;
    return { x, y, z, i: best, k: K[best], nx, ny, nz, t: bt, assist: true };
  }

  _take(i, out) {
    const n = this.n;
    out.push({ x: i % n, y: ((i / n) | 0) % n, z: (i / (n * n)) | 0, c: this.col[i], k: this.kind[i] });
    this.kind[i] = AIR;
  }

  /**
   * A pick blow at (cx, cy, cz): a ragged crater of radius r, and the rock outside a fracture
   * plane through it (normal (nx, ny, nz), pointing out of the clump) spalls off in one piece.
   * Ore skin in the crater gets scratched (ore is never removed). Returns { removed, oreHit, detached }.
   */
  bite(cx, cy, cz, r, nx = 0, ny = 0, nz = 0, seed = 0) {
    const n = this.n, K = this.kind, removed = [];
    let oreHit = 0;
    const rs = nx || ny || nz ? r * 1.75 : r;
    const x0 = Math.max(0, Math.floor(cx - rs - 1)), x1 = Math.min(n - 1, Math.ceil(cx + rs + 1));
    const y0 = Math.max(0, Math.floor(cy - rs - 1)), y1 = Math.min(n - 1, Math.ceil(cy + rs + 1));
    const z0 = Math.max(0, Math.floor(cz - rs - 1)), z1 = Math.min(n - 1, Math.ceil(cz + rs + 1));
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = x + n * (y + n * z);
      const k = K[i];
      if (!k) continue;
      const px = x + 0.5 - cx, py = y + 0.5 - cy, pz = z + 0.5 - cz;
      const dist = Math.hypot(px, py, pz);
      const d = dist + (h3(x, y, z, seed) - 0.5) * 1.4;
      if (k === ORE) {
        // the point scratches the ore's skin (not what's buried behind more ore)
        if (d < r - 0.6 && this.dmg[i] < 3 && this.oreSkin(x, y, z)) { this.dmg[i]++; oreHit++; }
        continue;
      }
      if (d < r) { this._take(i, removed); continue; }
      // the spall: outside the fracture plane, near the blow
      if (dist < rs && px * nx + py * ny + pz * nz + (h3(x, y, z, seed + 1) - 0.5) * 0.9 > r * 0.12) this._take(i, removed);
    }
    const detached = removed.length ? this.detach() : [];
    if (removed.length) this.version++;
    return { removed, oreHit, detached };
  }

  /**
   * A chisel flake: rock (and crust) just under the surface at (cx, cy, cz), on the outer side of a
   * plane with normal (nx, ny, nz), within r: up to `max` cells, nearest first. Never ore.
   */
  flake(cx, cy, cz, nx, ny, nz, r, max, seed = 0) {
    const n = this.n, K = this.kind, cand = [];
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(n - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(n - 1, Math.ceil(cy + r));
    const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(n - 1, Math.ceil(cz + r));
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = x + n * (y + n * z);
      const k = K[i];
      if (!k || k === ORE) continue;
      const px = x + 0.5 - cx, py = y + 0.5 - cy, pz = z + 0.5 - cz;
      const d = Math.hypot(px, py, pz);
      if (d > r) continue;
      if (px * nx + py * ny + pz * nz + (h3(x, y, z, seed) - 0.5) * 0.8 < -0.45) continue;
      cand.push([d, i]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const removed = [];
    for (let j = 0; j < cand.length && removed.length < max; j++) this._take(cand[j][1], removed);
    const detached = removed.length ? this.detach() : [];
    if (removed.length) this.version++;
    return { removed, detached };
  }

  /** Solid non-ore cells next to air within r of a point, nearest first. */
  surfaceNear(cx, cy, cz, r, want = (k) => k === SOFT || k === ROCK) {
    const n = this.n, K = this.kind, out = [];
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(n - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(n - 1, Math.ceil(cy + r));
    const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(n - 1, Math.ceil(cz + r));
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = x + n * (y + n * z);
      if (!want(K[i])) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz);
      if (d > r || !this.exposed(x, y, z)) continue;
      out.push([d, i]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out;
  }

  /**
   * The chisel: prises a small flake of rock or crust off where it's set (never ore). Set on ore,
   * it works the nearest rock along the ore's edge instead, flaking away from the ore. hit: a
   * raycast result; d: the ray direction (grid coords). Returns { removed, detached, tink }
   * (tink: nothing left to take there, the ore is clean).
   */
  nibble(hit, d, size = 8, seed = 0) {
    let cx = hit.x + 0.5, cy = hit.y + 0.5, cz = hit.z + 0.5;
    let nx = hit.nx - d[0] * 0.8, ny = hit.ny - d[1] * 0.8, nz = hit.nz - d[2] * 0.8;
    if (hit.k === ORE) {
      const near = this.surfaceNear(cx + hit.nx * 0.5, cy + hit.ny * 0.5, cz + hit.nz * 0.5, 3.4);
      if (!near.length) return { removed: [], detached: [], tink: true };
      const i = near[0][1], n = this.n;
      const x = i % n + 0.5, y = ((i / n) | 0) % n + 0.5, z = ((i / (n * n)) | 0) + 0.5;
      nx = x - cx; ny = y - cy; nz = z - cz; // flake away from the ore
      cx = x; cy = y; cz = z;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    const res = this.flake(cx, cy, cz, nx / l, ny / l, nz / l, 2.3 + size * 0.06, size, seed);
    return { ...res, tink: !res.removed.length };
  }

  /** The brush: sweeps loose crust off around a point (up to `max` cells). Rock and ore stay. */
  sweep(cx, cy, cz, max = 6, r = 3.4) {
    const removed = [], n = this.n, K = this.kind;
    // loose dirt, and grit: rock bits hanging on by one or two faces
    const loose = (i) => {
      if (K[i] === SOFT) return true;
      if (K[i] !== ROCK) return false;
      const x = i % n, y = ((i / n) | 0) % n, z = (i / (n * n)) | 0;
      let s = 0;
      for (const d of N6) if (this.at(x + d[0], y + d[1], z + d[2]) !== AIR) s++;
      return s <= 2;
    };
    const near = this.surfaceNear(cx, cy, cz, r, (k) => k === SOFT || k === ROCK);
    for (let j = 0; j < near.length && removed.length < max; j++) {
      const i = near[j][1];
      if (loose(i)) this._take(i, removed);
    }
    const detached = removed.length ? this.detach() : [];
    if (removed.length) this.version++;
    return { removed, detached };
  }

  /** The drill: a round bore; ore in it gets gouged. */
  bore(cx, cy, cz, r) {
    const n = this.n, K = this.kind, removed = [];
    let oreHit = 0;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(n - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(n - 1, Math.ceil(cy + r));
    const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(n - 1, Math.ceil(cz + r));
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = x + n * (y + n * z);
      const k = K[i];
      if (!k || Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz) > r) continue;
      if (k === ORE) { if (this.dmg[i] < 3 && Math.random() < 0.5 && this.oreSkin(x, y, z)) { this.dmg[i]++; oreHit++; } continue; }
      this._take(i, removed);
    }
    const detached = removed.length ? this.detach() : [];
    if (removed.length) this.version++;
    return { removed, oreHit, detached };
  }

  /** Cells no longer attached to the ore (6-connected through solid) fall off. */
  detach() {
    const n = this.n, K = this.kind, ore = this.ore;
    if (!ore || !ore.length) return [];
    const M = this._mark, Q = this._queue;
    const g = ++this._gen;
    let qh = 0, qt = 0;
    for (let j = 0; j < ore.length; j++) { M[ore[j]] = g; Q[qt++] = ore[j]; }
    const nn = n * n;
    while (qh < qt) {
      const i = Q[qh++];
      const x = i % n, y = ((i / n) | 0) % n, z = (i / nn) | 0;
      if (x > 0) { const j = i - 1; if (K[j] && M[j] !== g) { M[j] = g; Q[qt++] = j; } }
      if (x < n - 1) { const j = i + 1; if (K[j] && M[j] !== g) { M[j] = g; Q[qt++] = j; } }
      if (y > 0) { const j = i - n; if (K[j] && M[j] !== g) { M[j] = g; Q[qt++] = j; } }
      if (y < n - 1) { const j = i + n; if (K[j] && M[j] !== g) { M[j] = g; Q[qt++] = j; } }
      if (z > 0) { const j = i - nn; if (K[j] && M[j] !== g) { M[j] = g; Q[qt++] = j; } }
      if (z < n - 1) { const j = i + nn; if (K[j] && M[j] !== g) { M[j] = g; Q[qt++] = j; } }
    }
    const out = [];
    for (let i = 0; i < K.length; i++) if (K[i] && M[i] !== g) this._take(i, out);
    return out;
  }

  /** Everything that isn't ore comes off (the clump is clean). Returns the removed cells. */
  strip() {
    const K = this.kind, out = [];
    for (let i = 0; i < K.length; i++) if (K[i] && K[i] !== ORE) this._take(i, out);
    if (out.length) this.version++;
    return out;
  }

  /** Ore cells with a face in the air (for glints), up to `max`, spread over the list. */
  exposedOre(max = 48) {
    const ore = this.ore, n = this.n, out = [];
    if (!ore) return out;
    const step = Math.max(1, Math.floor(ore.length / (max * 3)));
    for (let j = 0; j < ore.length && out.length < max; j += step) {
      const i = ore[j];
      if (this.exposed(i % n, ((i / n) | 0) % n, (i / (n * n)) | 0)) out.push(i);
    }
    return out;
  }

  // ------------------------------------------------------------ save / restore
  /** Removed cells vs. a freshly generated grid, as run-length text; damaged ore as text. */
  diff(fresh) {
    const K = this.kind, F = fresh.kind, runs = [];
    let last = 0;
    for (let i = 0; i < K.length;) {
      if (F[i] && !K[i]) {
        let j = i;
        while (j < K.length && F[j] && !K[j]) j++;
        runs.push((i - last).toString(36), (j - i).toString(36));
        last = j;
        i = j;
      } else i++;
    }
    const dm = [];
    for (let i = 0; i < this.dmg.length; i++) if (this.dmg[i]) dm.push(i.toString(36) + ':' + this.dmg[i]);
    return { cut: runs.join('.'), dmg: dm.join('.') };
  }
  applyDiff(cut, dmg) {
    if (cut) {
      const r = cut.split('.').map((s) => parseInt(s, 36));
      let at = 0;
      for (let j = 0; j + 1 < r.length; j += 2) {
        at += r[j];
        for (let i = at; i < at + r[j + 1] && i < this.kind.length; i++) if (this.kind[i] !== ORE) this.kind[i] = AIR;
        at += r[j + 1];
      }
    }
    if (dmg) for (const s of dmg.split('.')) { const [i, v] = s.split(':'); const ii = parseInt(i, 36); if (ii >= 0 && ii < this.dmg.length) this.dmg[ii] = Math.min(3, +v || 0); }
    this.detach();
    this.updateClean();
    this.version++;
  }
}

// ---------------------------------------------------------------- generation
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const randDir = (rng) => { for (;;) { const a = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1]; const l = len(a); if (l > 0.2 && l <= 1) return [a[0] / l, a[1] / l, a[2] / l]; } };
const basis = (d) => { const u = norm(cross(Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], d)); return [u, cross(d, u)]; };

/**
 * spec: { seed, item, oreId, crust, rock, peb, R } (R: lump radius in cells; crust/rock/peb:
 * world materials whose colours dress the clump). Returns a ClumpGrid.
 */
export function buildClump(spec) {
  const R = spec.R;
  const n = Math.ceil(R * 2.6) + 2;
  const g = new ClumpGrid(n);
  const rng = makeRng((spec.seed * 2654435761) >>> 0 || 1);
  const noise = makeNoise3D((spec.seed ^ 0x5bd1e995) >>> 0 || 7);
  const c = n / 2;
  const K = g.kind, C = g.col, N3 = n * n * n;

  // palette
  const crust = MAT[spec.crust] || MAT[1], rock = MAT[spec.rock] || MAT[4], peb = MAT[spec.peb] || rock;
  for (let k = 0; k < 4; k++) { g.pal[P_CRUST + k] = crust.tones[k]; g.pal[P_ROCK + k] = rock.tones[k]; g.pal[P_PEB + k] = peb.tones[k]; }
  g.pal[P_CRUST + 4] = crust.accent; g.pal[P_ROCK + 4] = rock.accent; g.pal[P_PEB + 4] = peb.accent;
  const oc = oreColors(spec.item, spec.oreId);
  for (let k = 0; k < 5; k++) g.pal[P_ORE + k] = oc[k];
  g.pal[P_FLECK] = mixHex(oc[3], rock.tones[2], 0.25);
  g.pal[P_SCRATCH] = mixHex(oc[1], 0xd8d2c8, 0.55);
  g.pal[P_GOUGE] = mixHex(oc[0], 0x18120e, 0.5);

  // ---- the ore core (palette offsets 1..5 into P_ORE) in its own mask first
  const core = new Uint8Array(N3);
  const ctr = [c + (rng() - 0.5) * R * 0.2, c + (rng() - 0.5) * R * 0.2, c + (rng() - 0.5) * R * 0.2];
  CORES[shapeOf(spec.item)](core, n, ctr, R * 1.32, rng, noise, spec);

  // ---- the lump: the ore in a coat of rock 1-6 cells thick that fills the hollows between its
  // arms, cut by fracture planes; one plane shaves the edge of the ore so a patch of it shows
  let bx0 = n, by0 = n, bz0 = n, bx1 = -1, by1 = -1, bz1 = -1;
  const dist = new Float32Array(N3).fill(1e9);
  for (let i = 0; i < N3; i++) {
    if (!core[i] || core[i] >= 10) continue;
    dist[i] = 0;
    const x = i % n, y = ((i / n) | 0) % n, z = (i / (n * n)) | 0;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
  }
  if (bx1 < 0) { bx0 = bx1 = by0 = by1 = bz0 = bz1 = c | 0; const i = g.idx(c | 0, c | 0, c | 0); core[i] = 2; dist[i] = 0; }
  const M = 8; // how far the coat can reach
  const lx0 = Math.max(1, bx0 - M), lx1 = Math.min(n - 2, bx1 + M), ly0 = Math.max(1, by0 - M), ly1 = Math.min(n - 2, by1 + M), lz0 = Math.max(1, bz0 - M), lz1 = Math.min(n - 2, bz1 + M);
  // chamfer distance from the ore (two sweeps over the 26-neighbourhood)
  {
    const fw = [];
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dz < 0 || (dz === 0 && (dy < 0 || (dy === 0 && dx < 0)))) fw.push([dx + n * (dy + n * dz), Math.hypot(dx, dy, dz)]);
    for (let z = lz0; z <= lz1; z++) for (let y = ly0; y <= ly1; y++) for (let x = lx0; x <= lx1; x++) {
      const i = x + n * (y + n * z);
      let d = dist[i];
      for (let k = 0; k < fw.length; k++) { const v = dist[i + fw[k][0]] + fw[k][1]; if (v < d) d = v; }
      dist[i] = d;
    }
    for (let z = lz1; z >= lz0; z--) for (let y = ly1; y >= ly0; y--) for (let x = lx1; x >= lx0; x--) {
      const i = x + n * (y + n * z);
      let d = dist[i];
      for (let k = 0; k < fw.length; k++) { const v = dist[i - fw[k][0]] + fw[k][1]; if (v < d) d = v; }
      dist[i] = d;
    }
  }
  // a hull around the ore's extent fills between crystal points and nuggets
  const hcx = (bx0 + bx1 + 1) / 2, hcy = (by0 + by1 + 1) / 2, hcz = (bz0 + bz1 + 1) / 2;
  const hrx = Math.max(2, (bx1 - bx0 + 1) * 0.4), hry = Math.max(2, (by1 - by0 + 1) * 0.4), hrz = Math.max(2, (bz1 - bz0 + 1) * 0.4);
  const planes = [];
  const along = (nn) => {
    const ds = [];
    for (let i = 0; i < N3; i++) {
      if (!core[i] || core[i] >= 10) continue;
      const x = i % n, y = ((i / n) | 0) % n, z = (i / (n * n)) | 0;
      ds.push((x + 0.5 - c) * nn[0] + (y + 0.5 - c) * nn[1] + (z + 0.5 - c) * nn[2]);
    }
    ds.sort((a, b) => a - b);
    return ds;
  };
  {
    const n0 = randDir(rng);
    const ds = along(n0);
    planes.push({ n: n0, o: ds[Math.floor(ds.length * 0.975)] - 0.6 - rng() * 1.0, fresh: true });
    const extra = 1 + (rng() * 3 | 0);
    for (let k = 0; k < extra; k++) {
      const nk = randDir(rng);
      if (dot(nk, n0) > 0.5) continue;
      const dk = along(nk);
      planes.push({ n: nk, o: dk[dk.length - 1] + 1.5 + rng() * 2.5, fresh: rng() < 0.6 });
    }
  }
  const ox = rng() * 100, oy = rng() * 100, oz = rng() * 100;
  const thick = spec.coat ?? 1;
  for (let z = lz0; z <= lz1; z++) for (let y = ly0; y <= ly1; y++) for (let x = lx0; x <= lx1; x++) {
    const i = x + n * (y + n * z);
    const px = (x + 0.5 - c), py = (y + 0.5 - c), pz = (z + 0.5 - c);
    const d = dist[i];
    if (d > M) continue;
    let inside = d < 1;
    if (!inside) {
      const T = (1.6 + (noise.fbm(px * 0.11 + ox, py * 0.11 + oy, pz * 0.11 + oz, 2) + 0.55) * 3.6) * thick + (noise.n(px * 0.4 + oy, py * 0.4 + oz, pz * 0.4 + ox)) * 0.8;
      inside = d <= T;
      if (!inside) {
        const ex = (x + 0.5 - hcx) / hrx, ey = (y + 0.5 - hcy) / hry, ez = (z + 0.5 - hcz) / hrz;
        inside = ex * ex + ey * ey + ez * ez + noise.n(px * 0.3 + 9, py * 0.3, pz * 0.3) * 0.5 < 1;
      }
    }
    if (!inside) continue;
    let cut = false;
    for (const p of planes) {
      const sd = px * p.n[0] + py * p.n[1] + pz * p.n[2] - p.o + (h3(x, y, z, 11) - 0.5) * 0.7;
      if (sd > 0) { cut = true; break; }
    }
    if (cut) continue;
    K[i] = ROCK;
  }
  // ore wins inside the lump
  for (let i = 0; i < N3; i++) if (core[i] && core[i] < 10 && K[i]) { K[i] = ORE; C[i] = P_ORE + core[i] - 1; }
  // keep the piece attached to the ore (or the middle) only
  {
    const seed = [];
    for (let i = 0; i < N3; i++) if (K[i] === ORE) seed.push(i);
    if (!seed.length) { const i = g.idx(c | 0, c | 0, c | 0); K[i] = ORE; C[i] = P_ORE + 1; seed.push(i); }
    g.ore = Int32Array.from(seed);
    g.detach();
  }

  // ---- depth below the surface (BFS from the air), for the crust
  const depth = new Uint8Array(N3).fill(255);
  const Q = g._queue;
  let qh = 0, qt = 0;
  for (let i = 0; i < N3; i++) {
    if (!K[i]) continue;
    const x = i % n, y = ((i / n) | 0) % n, z = (i / (n * n)) | 0;
    if (g.exposed(x, y, z)) { depth[i] = 0; Q[qt++] = i; }
  }
  while (qh < qt) {
    const i = Q[qh++];
    const x = i % n, y = ((i / n) | 0) % n, z = (i / (n * n)) | 0;
    for (const dd of N6) {
      const X = x + dd[0], Y = y + dd[1], Z = z + dd[2];
      if (!g.inb(X, Y, Z)) continue;
      const j = X + n * (Y + n * Z);
      if (!K[j] || depth[j] <= depth[i] + 1) continue;
      depth[j] = depth[i] + 1;
      Q[qt++] = j;
    }
  }

  // ---- dress the matrix: strata, grains, ore flecks near the core, crust outside
  const strata = randDir(rng);
  const near = new Uint8Array(N3); // within ~2 cells of ore
  for (const i of g.ore) {
    const x = i % n, y = ((i / n) | 0) % n, z = (i / (n * n)) | 0;
    if (!g.oreSkin(x, y, z)) continue;
    for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (g.inb(x + dx, y + dy, z + dz)) near[x + dx + n * (y + dy + n * (z + dz))] = 1;
  }
  for (let i = 0; i < N3; i++) {
    if (K[i] !== ROCK) continue;
    const x = i % n, y = ((i / n) | 0) % n, z = (i / (n * n)) | 0;
    const px = x + 0.5 - c, py = y + 0.5 - c, pz = z + 0.5 - c;
    // which surface is nearest: a fresh fracture face, or the old weathered outside?
    const dpt = depth[i];
    const h = h3(x, y, z, 5);
    let soft = false;
    if (dpt < 4) {
      let fresh = 99;
      for (const p of planes) if (p.fresh) fresh = Math.min(fresh, p.o - (px * p.n[0] + py * p.n[1] + pz * p.n[2]));
      const onFresh = fresh <= dpt + 1.2;
      soft = onFresh ? dpt < 1 && noise.n(px * 0.33 + 3, py * 0.33 + 9, pz * 0.33) > 0.12 : dpt < 0.9 + (noise.n(px * 0.21 + 7, py * 0.21, pz * 0.21) + 0.6) * 1.35;
    }
    if (soft) {
      K[i] = SOFT;
      const pt = noise.n(px * 0.3 + 11, py * 0.3, pz * 0.3 + 5);
      let t = pt > 0.2 ? 3 : pt > -0.05 ? 2 : 1;
      if (h < 0.12) t = Math.max(0, t - 1); else if (h > 0.9) t = Math.min(3, t + 1);
      C[i] = P_CRUST + (h < 0.03 ? 4 : t);
      continue;
    }
    const band = noise.n((px * strata[0] + py * strata[1] + pz * strata[2]) * 0.16 + 5, px * 0.05, pz * 0.05);
    let t = band > 0.18 ? 3 : band > -0.05 ? 2 : band > -0.25 ? 1 : 0;
    if (h < 0.1) t = Math.max(0, t - 1); else if (h > 0.92) t = Math.min(3, t + 1);
    C[i] = P_ROCK + t;
    if (h < 0.045) C[i] = P_ROCK + 4;
    else if (near[i] && h3(x, y, z, 9) < 0.14 && shapeOf(spec.item) !== 'fossil') C[i] = P_FLECK;
    if (core[i] >= 10) C[i] = core[i] === 11 ? P_FLECK : P_ORE + 1; // a vein of ore-stained rock
  }
  // pebbles of a second rock in the matrix
  const nPeb = 3 + (rng() * 4 | 0);
  for (let k = 0; k < nPeb; k++) {
    const d = randDir(rng), rr = R * (0.25 + rng() * 0.55);
    const px = c + d[0] * rr, py = c + d[1] * rr, pz = c + d[2] * rr, pr = 0.9 + rng() * 1.4;
    for (let z = Math.floor(pz - pr); z <= pz + pr; z++) for (let y = Math.floor(py - pr); y <= py + pr; y++) for (let x = Math.floor(px - pr); x <= px + pr; x++) {
      if (!g.inb(x, y, z)) continue;
      const i = x + n * (y + n * z);
      if (K[i] !== ROCK || Math.hypot(x + 0.5 - px, (y + 0.5 - py) * 1.2, z + 0.5 - pz) > pr) continue;
      const h = h3(x, y, z, 13);
      C[i] = P_PEB + (h < 0.25 ? 1 : h < 0.7 ? 2 : h < 0.93 ? 3 : 4);
    }
  }
  g.indexOre();
  g.R = R;
  // the lump's own middle: it turns about this point, and its collision ball sits here
  {
    let sx = 0, sy = 0, sz = 0, k = 0;
    for (let i = 0; i < N3; i++) if (K[i]) { sx += i % n; sy += ((i / n) | 0) % n; sz += (i / (n * n)) | 0; k++; }
    g.pivot = k ? [sx / k + 0.5, sy / k + 0.5, sz / k + 0.5] : [c, c, c];
  }
  return g;
}

// ---------------------------------------------------------------- ore cores
// Each writes palette offsets (1 dark, 2 main, 3 main2, 4 light, 5 glint) into `core`.
function stampBall(core, n, cx, cy, cz, r, colorAt) {
  for (let z = Math.max(0, Math.floor(cz - r)); z <= Math.min(n - 1, cz + r); z++)
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(n - 1, cy + r); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(n - 1, cx + r); x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz) > r) continue;
        const v = colorAt(x, y, z);
        if (v) core[x + n * (y + n * z)] = v;
      }
}

const metalCol = (noise) => (x, y, z) => {
  const h = h3(x, y, z, 21);
  if (h > 0.965) return 5;
  if (h > 0.84) return 4;
  if (h < 0.16) return 1;
  return noise.n(x * 0.3, y * 0.3, z * 0.3) > 0 ? 2 : 3;
};

const CORES = {
  nugget(core, n, ctr, R, rng, noise) {
    const col = metalCol(noise);
    const k = 3 + (rng() * 3 | 0);
    for (let b = 0; b < k; b++) {
      const d = randDir(rng), off = b === 0 ? 0 : R * (0.12 + rng() * 0.2);
      const cx = ctr[0] + d[0] * off, cy = ctr[1] + d[1] * off, cz = ctr[2] + d[2] * off;
      const r = R * (b === 0 ? 0.27 : 0.15 + rng() * 0.11);
      const ax = 0.8 + rng() * 0.4, ay = 0.75 + rng() * 0.35, az = 0.8 + rng() * 0.4;
      const m = r * 1.45;
      for (let z = Math.max(0, Math.floor(cz - m)); z <= Math.min(n - 1, cz + m); z++)
        for (let y = Math.max(0, Math.floor(cy - m)); y <= Math.min(n - 1, cy + m); y++)
          for (let x = Math.max(0, Math.floor(cx - m)); x <= Math.min(n - 1, cx + m); x++) {
            const qx = (x + 0.5 - cx) / (r * ax), qy = (y + 0.5 - cy) / (r * ay), qz = (z + 0.5 - cz) / (r * az);
            if (qx * qx + qy * qy + qz * qz + noise.n(x * 0.32 + b * 7, y * 0.32, z * 0.32) * 0.75 < 1) core[x + n * (y + n * z)] = col(x, y, z);
          }
    }
    // veins branching out through the rock toward the surface
    const nv = 2 + (rng() * 3 | 0);
    for (let v = 0; v < nv; v++) {
      let d = randDir(rng);
      const p = [ctr[0], ctr[1], ctr[2]];
      const L = R * (0.6 + rng() * 0.35), rad = 0.6 + rng() * 0.4;
      for (let s = 0; s < L; s += 0.6) {
        p[0] += d[0] * 0.6; p[1] += d[1] * 0.6; p[2] += d[2] * 0.6;
        const w = randDir(rng);
        d = norm([d[0] + w[0] * 0.28, d[1] + w[1] * 0.28, d[2] + w[2] * 0.28]);
        stampBall(core, n, p[0], p[1], p[2], rad * (1 - s / L * 0.45) + 0.25, (x, y, z) => { const i = x + n * (y + n * z); return core[i] && core[i] < 10 ? 0 : h3(x, y, z, 23) > 0.6 ? 11 : 10; });
      }
    }
  },

  crystal(core, n, ctr, R, rng, noise, spec) {
    const axis = randDir(rng);
    const base = [ctr[0] - axis[0] * R * 0.3, ctr[1] - axis[1] * R * 0.3, ctr[2] - axis[2] * R * 0.3];
    const k = 5 + (rng() * 4 | 0);
    const xls = [];
    for (let i = 0; i < k; i++) {
      const w = randDir(rng);
      const dir = norm([axis[0] + w[0] * 0.85, axis[1] + w[1] * 0.85, axis[2] + w[2] * 0.85]);
      const j = randDir(rng), jr = R * 0.12 * rng();
      xls.push({ s: [base[0] + j[0] * jr, base[1] + j[1] * jr, base[2] + j[2] * jr], dir, L: R * (i === 0 ? 0.85 : 0.42 + rng() * 0.38), rad: Math.max(1.3, R * (i === 0 ? 0.16 : 0.08 + rng() * 0.07)), b: basis(dir), tw: rng() * Math.PI });
    }
    // a few tiny points around the bed
    for (let i = 0; i < 4; i++) {
      const w = randDir(rng);
      const dir = norm([axis[0] + w[0], axis[1] + w[1], axis[2] + w[2]]);
      xls.push({ s: [base[0] + w[0] * R * 0.22, base[1] + w[1] * R * 0.22, base[2] + w[2] * R * 0.22], dir, L: R * (0.18 + rng() * 0.14), rad: 1.05, b: basis(dir), tw: rng() * Math.PI });
    }
    for (const xl of xls) {
      const { s, dir, L, rad } = xl;
      const ex = [s[0] + dir[0] * L, s[1] + dir[1] * L, s[2] + dir[2] * L];
      const lo = [Math.min(s[0], ex[0]) - rad - 1, Math.min(s[1], ex[1]) - rad - 1, Math.min(s[2], ex[2]) - rad - 1];
      const hi = [Math.max(s[0], ex[0]) + rad + 1, Math.max(s[1], ex[1]) + rad + 1, Math.max(s[2], ex[2]) + rad + 1];
      const tip = rad * 2.1;
      for (let z = Math.max(0, Math.floor(lo[2])); z <= Math.min(n - 1, hi[2]); z++)
        for (let y = Math.max(0, Math.floor(lo[1])); y <= Math.min(n - 1, hi[1]); y++)
          for (let x = Math.max(0, Math.floor(lo[0])); x <= Math.min(n - 1, hi[0]); x++) {
            const wx = x + 0.5 - s[0], wy = y + 0.5 - s[1], wz = z + 0.5 - s[2];
            const t = wx * dir[0] + wy * dir[1] + wz * dir[2];
            if (t < -0.6 || t > L) continue;
            const b0 = xl.b[0], b1 = xl.b[1];
            const a = wx * b0[0] + wy * b0[1] + wz * b0[2], b = wx * b1[0] + wy * b1[1] + wz * b1[2];
            if (a * a + b * b > (rad + 0.6) * (rad + 0.6) * 1.35) continue;
            // hexagonal cross-section
            const ang = Math.atan2(b, a) + xl.tw;
            const sec = ((ang % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6;
            const radial = Math.hypot(a, b) * Math.cos(sec);
            const allow = t > L - tip ? rad * (L - t) / tip : rad;
            if (radial > allow + 0.3) continue;
            const facet = Math.floor((ang + 10 * Math.PI) / (Math.PI / 3)) & 1;
            const h = h3(x, y, z, 31);
            let v = facet ? 2 : 3;
            if (radial > allow - 0.5 && facet && h > 0.3) v = 4;
            if (t > L - tip * 0.55) v = h > 0.5 ? 5 : 4;
            else if (t < L * 0.14) v = 1;
            if (spec.item === 'voidstone' && h > 0.9) v = 5;
            const i = x + n * (y + n * z);
            if (!core[i] || v > core[i]) core[i] = v;
          }
    }
  },

  gem(core, n, ctr, R, rng, noise, spec) {
    const cut = ITEMS[spec.item]?.icon?.cut || 'oval';
    // random orientation
    const ax = randDir(rng), [bu, bv] = basis(ax);
    const inside = (a, b, cc, g) => {
      if (cut === 'brilliant') return Math.abs(a) + Math.abs(b) * 1.15 + Math.abs(cc) <= g * 1.3 && Math.abs(b) <= g * 0.85;
      if (cut === 'square') return Math.max(Math.abs(a), Math.abs(cc)) <= g * 0.72 && Math.abs(a) + Math.abs(cc) <= g * 1.15 && Math.abs(b) <= g * (1.05 - Math.max(0, Math.max(Math.abs(a), Math.abs(cc)) - g * 0.45) * 0.6);
      if (cut === 'round') return Math.hypot(a, b, cc) <= g;
      if (cut === 'blob') return Math.hypot(a, b * 1.1, cc) + noise.n(a * 0.25 + 4, b * 0.25, cc * 0.25) * g * 0.45 <= g;
      return (a / g) ** 2 + (b / (g * 0.76)) ** 2 + (cc / (g * 0.9)) ** 2 <= 1; // oval
    };
    const bodies = [{ c: ctr, g: R * (0.36 + rng() * 0.06) }];
    const ns = 1 + (rng() * 2 | 0);
    for (let k = 0; k < ns; k++) { const d = randDir(rng); bodies.push({ c: [ctr[0] + d[0] * R * 0.5, ctr[1] + d[1] * R * 0.5, ctr[2] + d[2] * R * 0.5], g: R * (0.12 + rng() * 0.07) }); }
    for (const B of bodies) {
      const m = B.g * 1.4;
      for (let z = Math.max(0, Math.floor(B.c[2] - m)); z <= Math.min(n - 1, B.c[2] + m); z++)
        for (let y = Math.max(0, Math.floor(B.c[1] - m)); y <= Math.min(n - 1, B.c[1] + m); y++)
          for (let x = Math.max(0, Math.floor(B.c[0] - m)); x <= Math.min(n - 1, B.c[0] + m); x++) {
            const wx = x + 0.5 - B.c[0], wy = y + 0.5 - B.c[1], wz = z + 0.5 - B.c[2];
            const q0 = wx * bu[0] + wy * bu[1] + wz * bu[2], q1 = wx * ax[0] + wy * ax[1] + wz * ax[2], q2 = wx * bv[0] + wy * bv[1] + wz * bv[2];
            if (!inside(q0, q1, q2, B.g)) continue;
            const edge = !inside(q0 * 1.1, q1 * 1.1, q2 * 1.1, B.g);
            const h = h3(x, y, z, 41);
            let v = q0 * q2 > 0 ? 2 : 3;
            if (q1 > B.g * 0.35 && edge) v = 4;
            else if (q1 < -B.g * 0.45) v = 1;
            if (edge && h > 0.86) v = 4;
            if (h > 0.975) v = 5;
            if (cut === 'blob' && h < 0.05) v = 1; // bits caught in the amber
            core[x + n * (y + n * z)] = v;
          }
    }
  },

  coal(core, n, ctr, R, rng, noise) {
    const nrm = randDir(rng), th = R * (0.17 + rng() * 0.07);
    const col = (x, y, z) => { const h = h3(x, y, z, 51); return h > 0.985 ? 5 : h > 0.93 ? 4 : h < 0.55 ? 1 : 2; };
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const wx = x + 0.5 - ctr[0], wy = y + 0.5 - ctr[1], wz = z + 0.5 - ctr[2];
      const pd = Math.abs(wx * nrm[0] + wy * nrm[1] + wz * nrm[2]);
      if (pd > th * 1.55 || wx * wx + wy * wy + wz * wz > R * R * (0.36 + noise.n(x * 0.15 + 5, y * 0.15, z * 0.15) * 0.12)) continue;
      if (pd - th * (1 + noise.n(x * 0.2, y * 0.2, z * 0.2) * 0.5) < 0) core[x + n * (y + n * z)] = col(x, y, z);
    }
    const nb = 2 + (rng() * 2 | 0);
    for (let k = 0; k < nb; k++) {
      const d = randDir(rng), o = R * 0.22 * rng(), hs = R * (0.11 + rng() * 0.08);
      const cx = ctr[0] + d[0] * o, cy = ctr[1] + d[1] * o, cz = ctr[2] + d[2] * o;
      for (let z = Math.max(0, Math.floor(cz - hs)); z <= Math.min(n - 1, cz + hs); z++)
        for (let y = Math.max(0, Math.floor(cy - hs)); y <= Math.min(n - 1, cy + hs); y++)
          for (let x = Math.max(0, Math.floor(cx - hs)); x <= Math.min(n - 1, cx + hs); x++) core[x + n * (y + n * z)] = col(x, y, z);
    }
  },

  fossil(core, n, ctr, R, rng) {
    const w0 = randDir(rng), nrm = norm([w0[0] * 0.7, w0[1] * 0.7 + 0.6, w0[2] * 0.7]);
    const [u, v] = basis(nrm);
    const F = R * 0.6, T = R * 0.17, B = Math.log(2.3) / (Math.PI * 2), rot = rng() * Math.PI * 2;
    const m = F + 1;
    for (let z = Math.max(0, Math.floor(ctr[2] - m)); z <= Math.min(n - 1, ctr[2] + m); z++)
      for (let y = Math.max(0, Math.floor(ctr[1] - m)); y <= Math.min(n - 1, ctr[1] + m); y++)
        for (let x = Math.max(0, Math.floor(ctr[0] - m)); x <= Math.min(n - 1, ctr[0] + m); x++) {
          const wx = x + 0.5 - ctr[0], wy = y + 0.5 - ctr[1], wz = z + 0.5 - ctr[2];
          const hh = wx * nrm[0] + wy * nrm[1] + wz * nrm[2];
          if (Math.abs(hh) > T + 0.5) continue;
          const a = wx * u[0] + wy * u[1] + wz * u[2], b = wx * v[0] + wy * v[1] + wz * v[2];
          const rho = Math.hypot(a, b);
          if (rho > F) continue;
          const allow = T * (0.5 + 0.5 * Math.sqrt(Math.max(0, 1 - (rho / F) ** 2)));
          if (Math.abs(hh) > allow) continue;
          const th = Math.atan2(b, a) + rot;
          const k = (Math.log(F / Math.max(rho, 0.6)) / B - th) / (Math.PI * 2);
          const f = k - Math.floor(k);
          let c = 2;
          if (f < 0.13 || rho < 1.4) c = 1; // the coiled suture
          else if (((th * 16) / (Math.PI * 2) + k * 0.5) % 1 < 0.24 && Math.abs(hh) > allow - 1.3) c = 4; // ribs on the faces
          else if (f > 0.55) c = 3;
          core[x + n * (y + n * z)] = c;
        }
  },

  salt(core, n, ctr, R, rng) {
    const k = 4 + (rng() * 3 | 0);
    for (let b = 0; b < k; b++) {
      const d = randDir(rng), o = b === 0 ? 0 : R * (0.15 + rng() * 0.2), hs = R * (b === 0 ? 0.22 : 0.11 + rng() * 0.09);
      const cx = ctr[0] + d[0] * o, cy = ctr[1] + d[1] * o, cz = ctr[2] + d[2] * o;
      for (let z = Math.max(0, Math.floor(cz - hs)); z <= Math.min(n - 1, cz + hs); z++)
        for (let y = Math.max(0, Math.floor(cy - hs)); y <= Math.min(n - 1, cy + hs); y++)
          for (let x = Math.max(0, Math.floor(cx - hs)); x <= Math.min(n - 1, cx + hs); x++) {
            const ax = Math.abs(x + 0.5 - cx), ay = Math.abs(y + 0.5 - cy), az = Math.abs(z + 0.5 - cz);
            const edges = (ax > hs - 1 ? 1 : 0) + (ay > hs - 1 ? 1 : 0) + (az > hs - 1 ? 1 : 0);
            core[x + n * (y + n * z)] = edges >= 2 ? 5 : ay >= ax && ay >= az ? 4 : ax >= az ? 2 : 3;
          }
    }
  },

  truffle(core, n, ctr, R, rng, noise) {
    const r = R * (0.34 + rng() * 0.05), m = r * 1.4;
    for (let z = Math.max(0, Math.floor(ctr[2] - m)); z <= Math.min(n - 1, ctr[2] + m); z++)
      for (let y = Math.max(0, Math.floor(ctr[1] - m)); y <= Math.min(n - 1, ctr[1] + m); y++)
        for (let x = Math.max(0, Math.floor(ctr[0] - m)); x <= Math.min(n - 1, ctr[0] + m); x++) {
          const bump = noise.n(x * 0.55 + 3, y * 0.55, z * 0.55);
          const d = Math.hypot(x + 0.5 - ctr[0], y + 0.5 - ctr[1], z + 0.5 - ctr[2]) - bump * r * 0.3;
          if (d > r) continue;
          const h = h3(x, y, z, 61);
          core[x + n * (y + n * z)] = bump > 0.25 ? (h > 0.5 ? 4 : 3) : h < 0.4 ? 1 : 2;
        }
  },
};
CORES.shard = CORES.crystal;


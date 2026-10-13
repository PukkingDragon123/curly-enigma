// Tile grid for the iso scenes: blocked cells, circle obstacles, circle-vs-world
// collision with sliding, line of sight and A* paths for NPCs.
import { clamp } from '../core/util.js';

export const MAT = { dirt: 0, stone: 1, wood: 2, sand: 3, water: 4 };
const MAT_NAMES = ['dirt', 'stone', 'wood', 'sand', 'water'];

export class TileMap {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.solid = new Uint8Array(w * h);
    this.mats = new Uint8Array(w * h);
    this.circles = [];
  }

  inb(tx, tz) { return tx >= 0 && tz >= 0 && tx < this.w && tz < this.h; }
  blocked(tx, tz) { return !this.inb(tx, tz) || this.solid[tx + tz * this.w] !== 0; }
  setSolid(tx, tz, v = 1) { if (this.inb(tx, tz)) this.solid[tx + tz * this.w] = v; }
  fill(x0, z0, w, d, v = 1) {
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) this.setSolid(x, z, v);
  }
  setMat(tx, tz, m) { if (this.inb(tx, tz)) this.mats[tx + tz * this.w] = typeof m === 'string' ? MAT[m] ?? 0 : m; }
  fillMat(x0, z0, w, d, m) { for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) this.setMat(x, z, m); }
  matAt(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z);
    return this.inb(tx, tz) ? MAT_NAMES[this.mats[tx + tz * this.w]] : 'dirt';
  }

  addCircle(x, z, r, tag = null) {
    const c = { x, z, r, tag, off: false };
    this.circles.push(c);
    return c;
  }
  removeCircle(c) {
    const i = this.circles.indexOf(c);
    if (i >= 0) this.circles.splice(i, 1);
  }

  /** Is a circle at (x,z) free of walls and obstacles? */
  freeAt(x, z, r = 0.3) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    for (let tz = z0; tz <= z1; tz++)
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.blocked(tx, tz)) continue;
        const cx = clamp(x, tx, tx + 1), cz = clamp(z, tz, tz + 1);
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
      }
    for (const c of this.circles) {
      if (c.off) continue;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (r + c.r) ** 2) return false;
    }
    return true;
  }

  /** Push a circle at p (x,z mutable) out of blocked tiles and obstacles (sliding falls out naturally). */
  resolve(p, r) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r), z0 = Math.floor(p.z - r), z1 = Math.floor(p.z + r);
      for (let tz = z0; tz <= z1; tz++)
        for (let tx = x0; tx <= x1; tx++) {
          if (!this.blocked(tx, tz)) continue;
          const cx = clamp(p.x, tx, tx + 1), cz = clamp(p.z, tz, tz + 1);
          const dx = p.x - cx, dz = p.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            p.x += (dx / d) * (r - d);
            p.z += (dz / d) * (r - d);
          } else {
            const l = p.x - tx, rr = tx + 1 - p.x, t = p.z - tz, b = tz + 1 - p.z;
            const m = Math.min(l, rr, t, b);
            if (m === l) p.x = tx - r; else if (m === rr) p.x = tx + 1 + r; else if (m === t) p.z = tz - r; else p.z = tz + 1 + r;
          }
          moved = true;
        }
      for (const c of this.circles) {
        if (c.off) continue;
        const dx = p.x - c.x, dz = p.z - c.z;
        const min = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-4;
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
        moved = true;
      }
      if (!moved) break;
      hit = true;
    }
    return hit;
  }

  /** Move with collision, sub-stepping long moves. Returns true if something was hit. */
  move(p, dx, dz, r) {
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / (r * 0.8)));
    let hit = false;
    for (let i = 0; i < n; i++) {
      p.x += dx / n;
      p.z += dz / n;
      if (this.resolve(p, r)) hit = true;
    }
    return hit;
  }

  /** Line of sight between two points for a walker of radius r. */
  los(x0, z0, x1, z1, r = 0.25) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(d / 0.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      if (!this.freeAt(x, z, r)) return false;
    }
    return true;
  }

  nearestFree(tx, tz, maxR = 6) {
    if (!this.blocked(tx, tz)) return [tx, tz];
    for (let r = 1; r <= maxR; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (!this.blocked(tx + dx, tz + dz)) return [tx + dx, tz + dz];
        }
    return null;
  }

  /** A* over the 8-connected tile grid. Returns [{x,z}] waypoints (tile centers, smoothed) or null. */
  findPath(sx, sz, gx, gz, r = 0.28) {
    const W = this.w, H = this.h, N = W * H;
    const s = this.nearestFree(Math.floor(sx), Math.floor(sz), 2);
    const g = this.nearestFree(Math.floor(gx), Math.floor(gz), 4);
    if (!s || !g) return null;
    const start = s[0] + s[1] * W, goal = g[0] + g[1] * W;
    const gs = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];
    const push = (f, i) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const pk = (k - 1) >> 1;
        if (heap[pk][0] <= heap[k][0]) break;
        [heap[pk], heap[k]] = [heap[k], heap[pk]];
        k = pk;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const a = 2 * k + 1, b = a + 1;
          let m = k;
          if (a < heap.length && heap[a][0] < heap[m][0]) m = a;
          if (b < heap.length && heap[b][0] < heap[m][0]) m = b;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const hx = g[0], hz = g[1];
    const heur = (i) => {
      const dx = Math.abs((i % W) - hx), dz = Math.abs(((i / W) | 0) - hz);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    gs[start] = 0;
    push(heur(start), start);
    let found = false, iter = 0;
    while (heap.length && iter++ < 6000) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      if (cur === goal) { found = true; break; }
      closed[cur] = 1;
      const cx = cur % W, cz = (cur / W) | 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (this.blocked(nx, nz)) continue;
          if (dx && dz && (this.blocked(cx + dx, cz) || this.blocked(cx, cz + dz))) continue;
          const ni = nx + nz * W;
          if (closed[ni]) continue;
          const ng = gs[cur] + (dx && dz ? 1.414 : 1);
          if (ng < gs[ni]) {
            gs[ni] = ng;
            came[ni] = cur;
            push(ng + heur(ni), ni);
          }
        }
    }
    if (!found) return null;
    const cells = [];
    for (let i = goal; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => ({ x: (i % W) + 0.5, z: ((i / W) | 0) + 0.5 }));
    if (gx !== undefined) pts[pts.length - 1] = this.freeAt(gx, gz, r) ? { x: gx, z: gz } : pts[pts.length - 1];
    // string-pull smoothing
    const out = [];
    let ax = sx, az = sz, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.los(ax, az, pts[j].x, pts[j].z, r * 0.9)) j--;
      out.push(pts[j]);
      ax = pts[j].x; az = pts[j].z;
      i = j + 1;
    }
    return out;
  }

  /** Random free tile center inside a rect (inclusive tile coords). */
  randomFree(rng, x0, z0, x1, z1, r = 0.3, tries = 30) {
    for (let k = 0; k < tries; k++) {
      const x = Math.floor(x0 + rng() * (x1 - x0 + 1)) + 0.5;
      const z = Math.floor(z0 + rng() * (z1 - z0 + 1)) + 0.5;
      if (this.freeAt(x, z, r)) return { x, z };
    }
    return null;
  }
}

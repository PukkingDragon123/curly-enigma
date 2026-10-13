// Falling-sand simulation for loose pixels (sand, gravel, ash, snow, rubble). Only cells
// that were disturbed are simulated; they go back to sleep once nothing moves.
import { M, GRAN, D_SHADE } from './micro.js';

export class Sand {
  constructor(world) {
    this.w = world;
    this.active = new Set(); // cell indices
    this.quiet = new Map(); // cell → passes without movement
    this.moved = 0;
    this.flip = false;
  }

  /** Wake up the cells around a pixel position (radius in pixels). */
  wake(px, py, r = 40) {
    const w = this.w;
    const c0 = Math.max(0, Math.floor((px - r) / M)), c1 = Math.min(w.W - 1, Math.floor((px + r) / M));
    const r0 = Math.max(0, Math.floor((py - r) / M)), r1 = Math.min(w.H - 1, Math.floor((py + r) / M));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) { const i = cy * w.W + cx; this.active.add(i); this.quiet.delete(i); }
  }

  /** One pass over the active cells (bottom-up). Returns how many pixels moved. */
  step() {
    const w = this.w, MW = w.MW, pm = w.pm;
    if (!this.active.size) return 0;
    this.flip = !this.flip;
    const cells = [...this.active].sort((a, b) => b - a);
    let total = 0;
    for (const ci of cells) {
      const cx = ci % w.W, cy = (ci / w.W) | 0;
      const x0 = cx * M, y0 = cy * M;
      let moved = 0;
      for (let y = y0 + M - 1; y >= y0; y--) {
        if (y >= w.MH - 1) continue;
        for (let k = 0; k < M; k++) {
          const x = this.flip ? x0 + k : x0 + M - 1 - k;
          const p = y * MW + x;
          const m = pm[p];
          if (!m || !GRAN[m]) continue;
          const below = p + MW;
          if (!pm[below]) { w.movePx(x, y, x, y + 1); moved++; continue; }
          // slide off slopes (gravel and rubble pile steeper than sand)
          const steep = m !== 4 && m !== 13 && m !== 16;
          if (steep && ((x * 7 + y * 13 + w.pd[p]) & 1)) continue;
          const dir = ((x + y + (this.flip ? 1 : 0)) & 1) ? 1 : -1;
          for (const d of [dir, -dir]) {
            const nx = x + d;
            if (nx < 0 || nx >= MW) continue;
            if (!pm[y * MW + nx] && !pm[below + d]) { w.movePx(x, y, nx, y + 1); moved++; break; }
          }
        }
      }
      if (moved) {
        total += moved;
        this.quiet.delete(ci);
        // movement can wake the neighbors (above loses support, below receives grains)
        for (const n of [ci - w.W, ci + w.W, ci - 1, ci + 1, ci + w.W - 1, ci + w.W + 1]) if (n >= 0 && n < w.W * w.H) this.active.add(n);
      } else {
        const q = (this.quiet.get(ci) || 0) + 1;
        if (q > 2) { this.active.delete(ci); this.quiet.delete(ci); } else this.quiet.set(ci, q);
      }
    }
    this.moved += total;
    return total;
  }
}

export { D_SHADE };

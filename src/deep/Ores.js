// Ore deposits in the 3D rock: they show once any of their voxels meets air, chip quality when the
// pick hits them directly, shake loose when most of their rim is free, and hop out of the wall as a
// little voxel model of the deposit itself (pristine if it was never struck and came free with the
// chisel or brush), which then flies into the backpack.
import { VOX, MAT, ORE_BASE } from './materials.js';
import { ORES } from '../data/ores.js';
import { h3 } from './noise.js';

export class Ores {
  constructor(world) {
    this.w = world;
  }

  /** The ore voxels of a deposit that are still in the world: [{x, y, z, m}] (loaded chunks only). */
  voxelsOf(d) {
    const w = this.w;
    const mo = ORE_BASE + d.oreId;
    const out = [];
    const r = d.r + 0.2;
    const x0 = Math.floor((d.x - r) * VOX), x1 = Math.ceil((d.x + r) * VOX);
    const y0 = Math.floor((d.y - r) * VOX), y1 = Math.ceil((d.y + r) * VOX);
    const z0 = Math.floor((d.z - r) * VOX), z1 = Math.ceil((d.z + r) * VOX);
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (w.voxelAt(x, y, z) !== mo) continue;
      if (w.depositAt(x, y, z) !== d) continue;
      out.push({ x, y, z, m: mo });
    }
    return out;
  }

  /** Fraction of the deposit's rim that touches open space (0..1), plus whether any voxel shows. */
  exposure(d, vox = this.voxelsOf(d)) {
    const w = this.w;
    const mo = ORE_BASE + d.oreId;
    let rim = 0, free = 0;
    for (const v of vox) {
      let edge = false, open = false;
      for (const [dx, dy, dz] of N6) {
        const m = w.voxelAt(v.x + dx, v.y + dy, v.z + dz);
        if (m !== mo) { edge = true; if (!m || MAT[m]?.fluid) open = true; }
      }
      if (edge) { rim++; if (open) free++; }
    }
    return { frac: rim ? free / rim : 0, shows: free > 0, n: vox.length };
  }

  /** Pick blow on an ore voxel: chips quality (and maybe a voxel). Returns the deposit + new q. */
  hitOre(vx, vy, vz, power) {
    const d = this.w.depositAt(vx, vy, vz);
    if (!d) return null;
    const s = this.w.depState(d);
    const ore = ORES[d.oreId];
    s.hits++;
    s.q = Math.max(0, s.q - (ore.frag || 10) * power * (0.7 + Math.random() * 0.6));
    this.w.editsDirty = true;
    return { d, s, ore };
  }

  /** Strikes nearby shake fragile ore (echo crystals, fossils). */
  vibrate(x, y, z, power) {
    for (const d of this.w.depositsNear(x, y, z, 1.2)) {
      const s = this.w.depState(d);
      if (s.taken) continue;
      const ore = ORES[d.oreId];
      const dist = Math.hypot(d.x - x, d.y - y, d.z - z);
      const k = Math.max(0, 1 - dist / 1.2) * (ore.vib || 1) * power;
      if (k > 0.05) s.q = Math.max(0, s.q - k * 3);
    }
  }

  /**
   * After the rock around (x, y, z) changed: find deposits that came loose.
   * tool: what freed them. Returns [{ d, s, voxels, pristine }] — their voxels are already removed.
   */
  checkFree(x, y, z, tool) {
    const freed = [];
    for (const d of this.w.depositsNear(x, y, z, 1.0)) {
      const s = this.w.depState(d);
      if (s.taken) continue;
      const vox = this.voxelsOf(d);
      if (!vox.length) continue;
      const e = this.exposure(d, vox);
      if (e.shows && !s.seen) { s.seen = true; freed.seenNew = d; }
      const need = s.brushed > 0.6 ? 0.42 : 0.58;
      if (e.frac < need) continue;
      s.taken = true;
      this.w.editsDirty = true;
      const pristine = s.hits === 0 && (tool === 'chisel' || tool === 'brush') && s.q >= 60;
      const cols = MAT[ORE_BASE + d.oreId].tones;
      const voxels = vox.map((v) => ({ ...v, c: h3(v.x, v.y, v.z, 2) > 0.7 ? MAT[ORE_BASE + d.oreId].accent : cols[1 + (h3(v.x, v.y, v.z, 3) * 3 | 0) % 3] }));
      for (const v of vox) this.w.setVoxel(v.x, v.y, v.z, 0);
      freed.push({ d, s, voxels, pristine });
    }
    return freed;
  }
}

const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

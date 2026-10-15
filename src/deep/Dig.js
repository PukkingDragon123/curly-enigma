// Breaking rock: every material is made of "plates" (the same jittered Voronoi cells the terrain
// shader draws as cracks). Blows damage the plate under the crosshair; when it gives, the whole
// plate comes out along its cracks as one tumbling chunk. Soil plates are small and go in one
// blow; hard rock takes a few. The chisel nibbles single voxels, the drill bores a round hole.
import { VOX, M, MAT, ORE_BASE, voxelColor } from './materials.js';
import { h3 } from './noise.js';

// --- the shader's hash33 / hash3, in JS (float precision differs a little; only seams care)
const fract = (x) => x - Math.floor(x);
function hash33(x, y, z) {
  let px = fract(x * 0.1031), py = fract(y * 0.1030), pz = fract(z * 0.0973);
  const d = px * (py + 33.33) + py * (px + 33.33) + pz * (pz + 33.33);
  px += d; py += d; pz += d;
  return [fract((px + py) * pz), fract((px + px) * py), fract((py + px) * px)];
}

/** Plate id (integer cell key) of a voxel for plate scale S (voxels). */
export function plateOf(vx, vy, vz, S) {
  const qx = vx + 0.5, qy = vy + 0.5, qz = vz + 0.5;
  const gx = Math.floor(qx / S - 0.5), gy = Math.floor(qy / S - 0.5), gz = Math.floor(qz / S - 0.5);
  let f1 = 1e9, best = 0;
  for (let k = 0; k < 8; k++) {
    const cx = gx + (k & 1), cy = gy + ((k >> 1) & 1), cz = gz + ((k >> 2) & 1);
    const h = hash33(cx, cy, cz);
    const fx = (cx + 0.5 + (h[0] - 0.5) * 0.85) * S, fy = (cy + 0.5 + (h[1] - 0.5) * 0.85) * S, fz = (cz + 0.5 + (h[2] - 0.5) * 0.85) * S;
    const d = (qx - fx) ** 2 + (qy - fy) ** 2 + (qz - fz) ** 2;
    if (d < f1) { f1 = d; best = ((cx + 4096) * 8192 + (cy + 4096)) * 8192 + (cz + 4096); }
  }
  return best;
}

const UNBREAKABLE = new Set([M.BEDROCK, M.BURROW, M.LANTERN]);
export const breakable = (m) => m && !MAT[m]?.fluid && !UNBREAKABLE.has(m);

export class Digger {
  constructor(world) {
    this.w = world;
    this.damage = new Map(); // plate key → damage (0..1)
  }

  /**
   * A pickaxe blow on voxel (vx, vy, vz). power: tool strength (1 = rusty pick).
   * Returns { broken: [{x, y, z, m, c}], material, chips } — broken voxels are already removed.
   */
  strike(vx, vy, vz, power) {
    const w = this.w;
    const m = w.voxelAt(vx, vy, vz);
    const mat = MAT[m];
    if (!breakable(m) || m >= ORE_BASE) return { broken: [], material: m };
    const S = mat.style ? mat.style[1] : 3;
    const plate = plateOf(vx, vy, vz, Math.max(1, S));
    const key = plate + ':' + (S | 0);
    const dmg = (this.damage.get(key) || 0) + power / Math.max(0.3, mat.hp);
    if (dmg < 1) {
      this.damage.set(key, dmg);
      // a chip off the surface every blow: the voxel itself goes if it's exposed and soft enough
      const chips = [];
      if (mat.hp < 1.5 || dmg > 0.5) {
        chips.push({ x: vx, y: vy, z: vz, m, c: voxelColor(m, vx, vy, vz, h3(vx, vy, vz, 1)) });
        w.setVoxel(vx, vy, vz, 0);
      }
      return { broken: chips, material: m, cracked: dmg };
    }
    this.damage.delete(key);
    return { broken: this.takePlate(vx, vy, vz, S, plate), material: m };
  }

  /** Remove the plate containing (vx, vy, vz): flood fill same-plate voxels of breakable rock. */
  takePlate(vx, vy, vz, S, plate) {
    const w = this.w;
    const out = [];
    const lim = Math.ceil(S * 1.6) + 1;
    const seen = new Set();
    const stack = [[vx, vy, vz]];
    while (stack.length && out.length < 700) {
      const [x, y, z] = stack.pop();
      const k = ((x + 4096) * 8192 + (y + 4096)) * 8192 + (z + 4096);
      if (seen.has(k)) continue;
      seen.add(k);
      if (Math.abs(x - vx) > lim || Math.abs(y - vy) > lim || Math.abs(z - vz) > lim) continue;
      const m = w.voxelAt(x, y, z);
      if (!breakable(m) || m >= ORE_BASE) continue;
      const mS = MAT[m].style ? MAT[m].style[1] : 3;
      if (plateOf(x, y, z, Math.max(1, mS)) !== plate && !(x === vx && y === vy && z === vz)) continue;
      out.push({ x, y, z, m, c: voxelColor(m, x, y, z, h3(x, y, z, 1)) });
      w.setVoxel(x, y, z, 0);
      stack.push([x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]);
    }
    return out;
  }

  /** Chisel: remove the voxel and maybe one exposed neighbour — precise, never hurts ore. */
  chisel(vx, vy, vz) {
    const w = this.w;
    const m = w.voxelAt(vx, vy, vz);
    if (!breakable(m) || m >= ORE_BASE) return [];
    const out = [{ x: vx, y: vy, z: vz, m, c: voxelColor(m, vx, vy, vz, h3(vx, vy, vz, 1)) }];
    w.setVoxel(vx, vy, vz, 0);
    return out;
  }

  /** Drill: bore a small round hole (radius r voxels) at the point; ore voxels only get chipped. */
  drill(cx, cy, cz, r) {
    const w = this.w;
    const out = [], ore = [];
    for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 + (z + 0.5 - cz) ** 2 > r * r) continue;
      const m = w.voxelAt(x, y, z);
      if (!breakable(m)) continue;
      if (m >= ORE_BASE) { ore.push({ x, y, z, m }); continue; }
      out.push({ x, y, z, m, c: voxelColor(m, x, y, z, h3(x, y, z, 1)) });
      w.setVoxel(x, y, z, 0);
    }
    return { broken: out, ore };
  }
}

export { VOX };

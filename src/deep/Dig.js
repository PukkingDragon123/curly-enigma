// Breaking rock: every material is made of "plates" (the same jittered Voronoi cells the terrain
// shader draws as cracks). Blows damage the plate under the crosshair; when it gives, the whole
// plate comes out along its cracks as one tumbling chunk. Soil plates are small and go in one
// blow; hard rock takes a few. The chisel nibbles single voxels, the drill bores a round hole.
//
// Tools (building part): every material wants a tool kind (toolWant): the pick for rock, ore and
// stone blocks, the axe for wood (timber, roots, mushroom stalks, planks, logs, doors, chests), the
// spade for soil, sand and gravel, shears for vines. toolRule(m, kind) says how well another tool
// does (mul: power multiplier, ok: false = it can't). The scene's dig slot picks the best tool the
// mole owns for what's under the crosshair (Build.js sets `digger.kit`); natural rock and soil dig
// as before with a pick, wood resists it. Placed blocks (MAT[m].built, build/blocks.js) take damage
// per block and come out whole (the item comes back through `digger.onBuilt(info)`), and the
// ragged bites of picks, chisels and drills never chew into them.
import { VOX, M, MAT, ORE_BASE, voxelColor } from './materials.js';
import { clamp } from '../core/util.js';
import { h3 } from './noise.js';
import { familyOf, isBuilt, unitOf, unitWorth } from './build/blocks.js';

const QSH = Math.round(Math.log2(VOX / 4)); // voxel → quarter-meter cell

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

const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const UNBREAKABLE = new Set([M.BEDROCK, M.BURROW, M.LANTERN, M.DOOR]);
export const breakable = (m) => m && !MAT[m]?.fluid && !MAT[m]?.ward && !MAT[m]?.unbreakable && !UNBREAKABLE.has(m);

// ---------------------------------------------------------------- tools: what breaks what
const WOOD = new Set([M.TIMBER, M.BOARDS, M.ROOTS, M.STEM, M.LADDER]);
const SOIL = new Set([M.DIRT, M.LOAM, M.CLAY, M.SAND, M.GRAVEL, M.SNOW, M.ASH, M.MOSS, M.MYCEL, M.RUBBLE]);
const SOFT = new Set([M.VINES, M.FERN]);
export const TOOL_NAMES = { pick: 'a pickaxe', axe: 'an axe', spade: 'a spade', shears: 'shears', any: 'anything' };

/** The tool kind a material wants: 'pick' | 'axe' | 'spade' | 'shears' | 'any'. */
export function toolWant(m) {
  const b = familyOf(m);
  if (b) return b.tool;
  if (WOOD.has(m)) return 'axe';
  if (SOIL.has(m) || MAT[m]?.gran) return 'spade';
  if (SOFT.has(m)) return 'shears';
  return 'pick';
}

/**
 * How a tool kind does on a material: { want, mul (power ×), ok (false: it can't), keep (the
 * gathered block or item comes with it) }. Placed stone needs a pick; wood with a pick is slow.
 */
export function toolRule(m, kind = 'pick') {
  const want = toolWant(m);
  if (want === 'any' || kind === want) return { want, mul: 1, ok: true, keep: true };
  if (isBuilt(m)) {
    if (want === 'pick') return { want, mul: 0, ok: false, keep: false };
    if (want === 'axe') return { want, mul: kind === 'pick' ? 0.3 : 0.15, ok: true, keep: true };
    if (want === 'spade') return { want, mul: kind === 'pick' ? 0.6 : 0.4, ok: true, keep: true };
    return { want, mul: 0.5, ok: true, keep: true };
  }
  // natural: a pick digs everything (moles always have), but wood resists it and vines just tear
  if (want === 'axe') return { want, mul: m === M.ROOTS ? 0.6 : m === M.STEM ? 0.5 : 0.35, ok: true, keep: true };
  if (want === 'shears') return { want, mul: 1, ok: true, keep: false };
  if (want === 'spade') return { want, mul: kind === 'pick' ? 1 : 0.7, ok: true, keep: true };
  return { want, mul: kind === 'pick' ? 1 : 0.25, ok: true, keep: true };
}

export class Digger {
  constructor(world) {
    this.w = world;
    this.damage = new Map(); // plate key → damage (0..1)
    this.bdmg = new Map(); // placed unit key → { d (0..1), t }
    this.kit = null; // the tool in the paw: { kind, item, power, pickPower, tier } (Build.js), null = the pick
    this.onBuilt = null; // (info) → void: a placed block broke ({ unit, worth, m, at })
    this.refused = null; // { m, want, t }: the last blow that did nothing (wrong tool)
    this.lastBuilt = null; // { key, d, t, unit }: the placed block last hit (crack overlay)
  }

  /** Power for this blow with the tool in the paw (the scene passes the pick's power). */
  kitPower(power) {
    const k = this.kit;
    return k && k.kind !== 'pick' ? power * (k.power || 1) / Math.max(0.1, k.pickPower || 1) : power;
  }

  /**
   * A pickaxe blow on voxel (vx, vy, vz), struck through the face with normal n: knocks a round,
   * ragged bite of small voxels out of the rock around the point — bigger for a stronger pick,
   * smaller in harder rock. Hard rock (hp > 1.6) takes a blow or two to crack before it gives.
   * Returns { broken: [{x, y, z, m, c}], material, cracked } — broken voxels are already removed.
   */
  strike(vx, vy, vz, power, n = [0, 0, 0]) {
    const w = this.w;
    const m = w.voxelAt(vx, vy, vz);
    const mat = MAT[m];
    if (!breakable(m) || m >= ORE_BASE) return { broken: [], material: m };
    if (familyOf(m)) return this.strikeBuilt(vx, vy, vz, power, m);
    const rule = toolRule(m, this.kit?.kind || 'pick');
    if (!rule.ok) { this.refused = { m, want: rule.want, t: performance.now() }; return { broken: [], material: m, refused: rule.want }; }
    power = this.kitPower(power) * rule.mul;
    const hp = Math.max(0.3, mat.hp);
    // cracking: damage per quarter-meter cell of rock
    if (hp > 1.6) {
      const q = QSH, key = ((vx >> q) + 4096) * 67108864 + ((vy >> q) + 4096) * 8192 + ((vz >> q) + 4096);
      const dmg = (this.damage.get(key) || 0) + (power * 2.3) / hp;
      if (dmg < 1) {
        this.damage.set(key, dmg);
        // the face splinters a little where it was hit
        return { broken: this.bite(vx + 0.5 - n[0] * 0.5, vy + 0.5 - n[1] * 0.5, vz + 0.5 - n[2] * 0.5, 1.3, null), material: m, cracked: dmg };
      }
      this.damage.delete(key);
    }
    const R = clamp(0.11 + 0.2 * Math.sqrt(power / hp), 0.1, 0.46) * VOX; // voxels
    // the centre sinks into the rock so most of the ball takes rock out
    const cx = vx + 0.5 - n[0] * R * 0.45, cy = vy + 0.5 - n[1] * R * 0.45, cz = vz + 0.5 - n[2] * R * 0.45;
    return { broken: this.bite(cx, cy, cz, R, m), material: m };
  }

  /**
   * A blow on a placed thing: damage adds up per unit (a block cell, a door, a torch); when it
   * gives, the whole unit comes out (no debris: Build.js pops the item back) and onBuilt hears of it.
   */
  strikeBuilt(vx, vy, vz, power, m) {
    const unit = unitOf(this.w, vx, vy, vz);
    if (!unit || !unit.voxels.length) return { broken: [], material: m };
    const rule = toolRule(m, this.kit?.kind || 'pick');
    const k = this.kitPower(power) * rule.mul;
    const now = performance.now();
    if (!rule.ok || k <= 0) { this.refused = { m, want: rule.want, t: now, block: unit.block }; return { broken: [], material: m, refused: rule.want }; }
    let rec = this.bdmg.get(unit.key);
    if (!rec || now - rec.t > 6000) rec = { d: 0, t: now };
    rec.d += k / Math.max(0.1, unit.block.hp);
    rec.t = now;
    this.lastBuilt = { key: unit.key, d: Math.min(1, rec.d), t: now, unit };
    if (rec.d < 0.999) { this.bdmg.set(unit.key, rec); return { broken: [], material: m, cracked: rec.d, built: { unit, broke: false } }; }
    this.bdmg.delete(unit.key);
    for (const v of unit.voxels) this.w.setVoxel(v.x, v.y, v.z, 0);
    const info = { unit, broke: true, worth: unitWorth(unit), m, at: [vx, vy, vz] };
    this.lastBuilt = { key: unit.key, d: 1, t: now, unit };
    this.onBuilt?.(info);
    return { broken: [], material: m, built: info };
  }

  /** Remove breakable, non-ore voxels within a ragged ball (voxel units) and return them. */
  bite(cx, cy, cz, R, hostM) {
    const w = this.w, out = [];
    const r0 = Math.floor(R + 1);
    for (let z = Math.floor(cz) - r0; z <= Math.floor(cz) + r0; z++) for (let y = Math.floor(cy) - r0; y <= Math.floor(cy) + r0; y++) for (let x = Math.floor(cx) - r0; x <= Math.floor(cx) + r0; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz);
      if (d > R * (0.78 + 0.34 * h3(x, y, z, 31))) continue;
      const m = w.voxelAt(x, y, z);
      if (!breakable(m) || m >= ORE_BASE || isBuilt(m)) continue;
      out.push({ x, y, z, m, c: voxelColor(m, x, y, z, h3(x, y, z, 1)) });
      w.setVoxel(x, y, z, 0);
    }
    return out;
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
      if (!breakable(m) || m >= ORE_BASE || isBuilt(m)) continue;
      const mS = MAT[m].style ? MAT[m].style[1] : 3;
      if (plateOf(x, y, z, Math.max(1, mS)) !== plate && !(x === vx && y === vy && z === vz)) continue;
      out.push({ x, y, z, m, c: voxelColor(m, x, y, z, h3(x, y, z, 1)) });
      w.setVoxel(x, y, z, 0);
      stack.push([x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]);
    }
    return out;
  }

  /** Chisel: a tiny precise bite (the voxel and its nearest neighbours) — never hurts ore. */
  chisel(vx, vy, vz) {
    const m = this.w.voxelAt(vx, vy, vz);
    if (!breakable(m) || m >= ORE_BASE || isBuilt(m)) return [];
    return this.bite(vx + 0.5, vy + 0.5, vz + 0.5, 0.6 + VOX / 16, m);
  }

  /** Drill: bore a small round hole (radius r voxels) at the point; ore voxels only get chipped. */
  drill(cx, cy, cz, r) {
    const w = this.w;
    const out = [], ore = [];
    for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 + (z + 0.5 - cz) ** 2 > r * r) continue;
      const m = w.voxelAt(x, y, z);
      if (!breakable(m) || isBuilt(m)) continue;
      if (m >= ORE_BASE) { ore.push({ x, y, z, m }); continue; }
      out.push({ x, y, z, m, c: voxelColor(m, x, y, z, h3(x, y, z, 1)) });
      w.setVoxel(x, y, z, 0);
    }
    return { broken: out, ore };
  }
}

export { VOX };

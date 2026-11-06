// Breaking rock: every material breaks its own way (MAT[m].brk, materials.js). Rock is made of
// "plates" (the same jittered Voronoi cells the terrain shader draws as seams): blows add up per
// plate and spread a little into the plates around it, the face splinters and cracks (DigScene
// draws the cracks, Cracks.js), and when a plate gives it breaks out along its seams as one slab
// (the cracked plates beside it come with it; crystal and ice burst into shards). Soil goes in one
// round bite and falls as clods, clay peels off in a wide shallow curl, gravel and sand pour and
// slide into the hole (loosen() / settle()). The chisel nibbles single voxels, the drill bores a
// round hole.
//
// Tools (building part): every material wants a tool kind (toolWant): the pick for rock, ore and
// stone blocks, the axe for wood (timber, roots, mushroom stalks, planks, logs, doors, chests), the
// spade for soil, sand and gravel, shears for vines. toolRule(m, kind) says how well another tool
// does (mul: power multiplier, ok: false = it can't). The scene's dig slot picks the best tool the
// mole owns for what's under the crosshair (Build.js sets `digger.kit`); natural rock and soil dig
// as before with a pick, wood resists it. Placed blocks (MAT[m].built, build/blocks.js) take damage
// per block and come out whole (the item comes back through `digger.onBuilt(info)`), and the
// ragged bites of picks, chisels and drills never chew into them.
import { VOX, VK, M, MAT, ORE_BASE, voxelColor } from './materials.js';
import { clamp } from '../core/util.js';
import { h3 } from './noise.js';
import { familyOf, isBuilt, unitOf, unitWorth } from './build/blocks.js';

const ROCKY = (m) => { const b = MAT[m]?.brk; return b === 'slab' || b === 'shatter'; };
/** The plate scale (voxels) the terrain shader uses for a material. */
export const plateScale = (m) => Math.max(1, (MAT[m]?.style ? MAT[m].style[1] : 3) * VK);
const vkey = (x, y, z) => ((x + 4096) * 8192 + (y + 4096)) * 8192 + (z + 4096);
const TAN = [[[0, 1, 0], [0, 0, 1]], [[1, 0, 0], [0, 0, 1]], [[1, 0, 0], [0, 1, 0]]]; // in-face axes by normal axis

// --- the shader's hash33 / hash3, in JS (float precision differs a little; only seams care)
const fract = (x) => x - Math.floor(x);

/** Plate id (integer cell key) of a voxel for plate scale S (voxels). */
export function plateOf(vx, vy, vz, S) {
  const qx = vx + 0.5, qy = vy + 0.5, qz = vz + 0.5;
  const gx = Math.floor(qx / S - 0.5), gy = Math.floor(qy / S - 0.5), gz = Math.floor(qz / S - 0.5);
  let f1 = 1e9, best = 0;
  for (let k = 0; k < 8; k++) {
    const cx = gx + (k & 1), cy = gy + ((k >> 1) & 1), cz = gz + ((k >> 2) & 1);
    // hash33(cx, cy, cz), inlined (no array per cell: this runs for every voxel of a plate)
    let px = fract(cx * 0.1031), py = fract(cy * 0.1030), pz = fract(cz * 0.0973);
    const dd = px * (py + 33.33) + py * (px + 33.33) + pz * (pz + 33.33);
    px += dd; py += dd; pz += dd;
    const h0 = fract((px + py) * pz), h1 = fract((px + px) * py), h2 = fract((py + px) * px);
    const fx = (cx + 0.5 + (h0 - 0.5) * 0.85) * S, fy = (cy + 0.5 + (h1 - 0.5) * 0.85) * S, fz = (cz + 0.5 + (h2 - 0.5) * 0.85) * S;
    const d = (qx - fx) * (qx - fx) + (qy - fy) * (qy - fy) + (qz - fz) * (qz - fz);
    if (d < f1) { f1 = d; best = ((cx + 4096) * 8192 + (cy + 4096)) * 8192 + (cz + 4096); }
  }
  return best;
}

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// what a gap wakes: the grains above it, beside it and on the slopes above
const WAKE = [[0, 1, 0], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
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
   * A pickaxe blow on voxel (vx, vy, vz), struck through the face with normal n. Returns
   * { broken: [{x, y, z, m, c}] (already removed), material, brk, cracked?: plate damage 0..1 (the
   * blow only cracked it), plate (damage key), slabs?: [[voxels]] (plates that broke out whole) }.
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
    const hp = Math.max(0.3, mat.hp), brk = mat.brk || 'slab';
    if (brk === 'slab' || brk === 'shatter') return this.crack(vx, vy, vz, power, hp, n, m, brk);
    const R = clamp(0.11 + 0.2 * Math.sqrt(power / hp), 0.1, 0.46) * VOX * (brk === 'crumble' ? 1.08 : 1); // voxels
    if (brk === 'peel') {
      // clay: a wide disc in the face, under half as deep, comes away in one curl
      const k = R * 0.2;
      return { broken: this.bite(vx + 0.5 - n[0] * k, vy + 0.5 - n[1] * k, vz + 0.5 - n[2] * k, R * 1.02, m, n, 0.5), material: m, brk };
    }
    // the centre sinks into the rock so most of the ball takes rock out
    const cx = vx + 0.5 - n[0] * R * 0.45, cy = vy + 0.5 - n[1] * R * 0.45, cz = vz + 0.5 - n[2] * R * 0.45;
    return { broken: this.bite(cx, cy, cz, R, m), material: m, brk };
  }

  /** Add damage to a plate (key); returns the new total. Old records are forgotten (bounded). */
  hurt(key, k) {
    const d = (this.damage.get(key) || 0) + k;
    this.damage.delete(key);
    this.damage.set(key, d);
    if (this.damage.size > 400) this.damage.delete(this.damage.keys().next().value);
    return d;
  }

  /** Rock: crack the plate under the blow (and a little of those around it); break it out when it gives. */
  crack(vx, vy, vz, power, hp, n, m, brk) {
    const S = plateScale(m), plate = plateOf(vx, vy, vz, S), key = plate * 16 + Math.round(S);
    const k = (power * 1.6) / hp;
    const d = this.hurt(key, k);
    const nb = this.neighbours(vx, vy, vz, n, S, plate);
    for (const q of nb) q.d = this.hurt(q.key, k * 0.45);
    if (d < 1) {
      // the face splinters a little where it was hit
      const r = 1.05 + 0.3 * Math.min(2, power);
      return { broken: this.bite(vx + 0.5 - n[0] * 0.5, vy + 0.5 - n[1] * 0.5, vz + 0.5 - n[2] * 0.5, r, null), material: m, brk, cracked: d, plate: key, pid: plate, S };
    }
    this.damage.delete(key);
    const slabs = [], cleared = [key];
    const first = this.takePlate(vx, vy, vz, S, plate, n);
    if (first.length) slabs.push(first);
    // plates the blow cracked through come out with it (a strong pick brings more)
    for (const q of nb) {
      if (slabs.length >= 3) break;
      if (q.d < 0.75) continue;
      this.damage.delete(q.key);
      cleared.push(q.key);
      const s2 = this.takePlate(q.x, q.y, q.z, S, q.plate, n);
      if (s2.length) slabs.push(s2);
    }
    let broken = slabs.flat();
    // a plate that was mostly gone already: knock a bite out as well so every blow gets somewhere
    if (first.length < 24) {
      const R = clamp(0.11 + 0.2 * Math.sqrt(power / hp), 0.1, 0.46) * VOX;
      broken = broken.concat(this.bite(vx + 0.5 - n[0] * R * 0.45, vy + 0.5 - n[1] * R * 0.45, vz + 0.5 - n[2] * R * 0.45, R, m));
    }
    return { broken, slabs, material: m, brk, plate: key, cleared, S };
  }

  /** The plates around a blow (in the face around it, and one behind): [{ key, plate, x, y, z }]. */
  neighbours(vx, vy, vz, n, S, plate) {
    const ax = n[0] ? 0 : n[1] ? 1 : 2;
    const [t1, t2] = TAN[ax];
    const out = [], seen = new Set([plate]);
    const r = S * 0.85;
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const u = i < 6 ? Math.cos(a) * r : 0, v = i < 6 ? Math.sin(a) * r : 0, back = i < 6 ? 0 : S * 0.9;
      for (let dz = 0; dz < 3; dz++) {
        const dd = back + dz;
        const x = Math.floor(vx + 0.5 + t1[0] * u + t2[0] * v - n[0] * dd), y = Math.floor(vy + 0.5 + t1[1] * u + t2[1] * v - n[1] * dd), z = Math.floor(vz + 0.5 + t1[2] * u + t2[2] * v - n[2] * dd);
        const m = this.w.voxelAt(x, y, z);
        if (!m) continue;
        if (!breakable(m) || m >= ORE_BASE || !ROCKY(m) || isBuilt(m)) break;
        const p = plateOf(x, y, z, S);
        if (!seen.has(p)) { seen.add(p); out.push({ key: p * 16 + Math.round(S), plate: p, x, y, z }); }
        break;
      }
    }
    return out;
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

  /**
   * Remove breakable, non-ore voxels within a ragged ball (voxel units) and return them. With a
   * normal n and flat < 1 the ball is squashed to a disc flat × R deep across n (clay peeling).
   */
  bite(cx, cy, cz, R, hostM, n = null, flat = 1) {
    const w = this.w, out = [];
    const r0 = Math.floor(R + 1), sq = n && flat < 1 ? 1 / (flat * flat) - 1 : 0;
    for (let z = Math.floor(cz) - r0; z <= Math.floor(cz) + r0; z++) for (let y = Math.floor(cy) - r0; y <= Math.floor(cy) + r0; y++) for (let x = Math.floor(cx) - r0; x <= Math.floor(cx) + r0; x++) {
      const ox = x + 0.5 - cx, oy = y + 0.5 - cy, oz = z + 0.5 - cz, dn = sq ? ox * n[0] + oy * n[1] + oz * n[2] : 0;
      const d = Math.sqrt(ox * ox + oy * oy + oz * oz + dn * dn * sq);
      if (d > R * (0.78 + 0.34 * h3(x, y, z, 31))) continue;
      const m = w.voxelAt(x, y, z);
      if (!breakable(m) || m >= ORE_BASE || isBuilt(m)) continue;
      out.push({ x, y, z, m, c: voxelColor(m, x, y, z, h3(x, y, z, 1)) });
      w.setVoxel(x, y, z, 0);
    }
    return out;
  }

  /**
   * Remove the plate containing (vx, vy, vz): flood fill the voxels of rock in the same plate
   * (scale S), no deeper than a slab behind the face (normal n). Returns them (removed).
   */
  takePlate(vx, vy, vz, S, plate, n = [0, 0, 0]) {
    const w = this.w;
    const out = [];
    const lim = Math.ceil(S * 1.5) + 1, deep = Math.max(3, S * 0.75);
    const seen = new Set();
    const st = [vx, vy, vz];
    while (st.length && out.length < 360) {
      const z = st.pop(), y = st.pop(), x = st.pop();
      const k = vkey(x, y, z);
      if (seen.has(k)) continue;
      seen.add(k);
      if (Math.abs(x - vx) > lim || Math.abs(y - vy) > lim || Math.abs(z - vz) > lim) continue;
      if (-((x - vx) * n[0] + (y - vy) * n[1] + (z - vz) * n[2]) > deep) continue;
      const m = w.voxelAt(x, y, z);
      if (!breakable(m) || m >= ORE_BASE || !ROCKY(m) || isBuilt(m)) continue;
      if (plateOf(x, y, z, S) !== plate && !(x === vx && y === vy && z === vz)) continue;
      out.push({ x, y, z, m, c: voxelColor(m, x, y, z, h3(x, y, z, 1)) });
      w.setVoxel(x, y, z, 0);
      st.push(x + 1, y, z, x - 1, y, z, x, y + 1, z, x, y - 1, z, x, y, z + 1, x, y, z - 1);
    }
    return out;
  }

  // ------------------------------------------------------------ loose grains (gravel, sand, ash, snow)
  /** Wake the loose grains around voxels that just went (they may slide into the gap). */
  loosen(broken) {
    if (!broken.length) return;
    const q = (this.pour ||= { q: [], i: 0, set: new Set(), left: 0 });
    q.left = Math.min(600, q.left + 160);
    const step = Math.max(1, Math.floor(broken.length / 60));
    for (let i = 0; i < broken.length; i += step) {
      const v = broken[i];
      for (const [dx, dy, dz] of WAKE) this.wake(v.x + dx, v.y + dy, v.z + dz);
    }
  }

  wake(x, y, z) {
    const P = this.pour;
    if (!P || P.left <= 0 || !MAT[this.w.voxelAt(x, y, z)]?.gran) return;
    const k = vkey(x, y, z);
    if (P.set.has(k)) return;
    P.set.add(k);
    P.q.push(x, y, z);
    P.left--;
  }

  /**
   * Let up to `max` woken grains fall straight down or slide off a slope steeper than 45°.
   * blocked(x, y, z) → true where a grain must not land (the mole). Returns the moves
   * [{ x, y, z, ty, tx, tz, m }] (ty = where it landed; ty === null: it crumbled away).
   */
  settle(max = 30, blocked = null) {
    const P = this.pour, w = this.w, moves = [];
    if (!P || P.i >= P.q.length) { if (P) { P.q.length = 0; P.i = 0; P.set.clear(); } return moves; }
    const air = (x, y, z) => w.voxelAt(x, y, z) === 0;
    while (P.i < P.q.length && moves.length < max) {
      const x = P.q[P.i++], y = P.q[P.i++], z = P.q[P.i++];
      P.set.delete(vkey(x, y, z));
      const m = w.voxelAt(x, y, z);
      if (!MAT[m]?.gran) continue;
      let tx = x, tz = z, ty = y;
      if (air(x, y - 1, z)) ty = y - 1;
      else {
        const o = (Math.random() * 4) | 0;
        for (let j = 0; j < 4; j++) {
          const [dx, dz] = SIDES[(o + j) & 3];
          if (air(x + dx, y, z + dz) && air(x + dx, y - 1, z + dz)) { tx = x + dx; tz = z + dz; ty = y - 1; break; }
        }
        if (ty === y) continue;
      }
      let f = 0;
      while (f++ < 40 && air(tx, ty - 1, tz)) ty--;
      w.setVoxel(x, y, z, 0);
      if (blocked && blocked(tx, ty, tz)) { moves.push({ x, y, z, tx, ty: null, tz, m }); }
      else { w.setVoxel(tx, ty, tz, m); moves.push({ x, y, z, tx, ty, tz, m }); this.wake(tx, ty, tz); }
      for (const [dx, dy, dz] of WAKE) this.wake(x + dx, y + dy, z + dz);
    }
    if (P.i > 3000) { P.q.splice(0, P.i); P.i = 0; }
    return moves;
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

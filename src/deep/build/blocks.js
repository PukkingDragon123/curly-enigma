// What the mole can build, Minecraft-like, on a 0.5 m grid (a block is 8×8×8 voxels: the mole is
// 0.86 m tall, so it stands under two blocks and jumps one, like a Minecraft player). Every placed
// thing is plain voxels of the building materials (./mats.js), so it saves with the dug rock and
// collides like rock; breaking any voxel of it takes the whole unit out (a block cell, a door, a
// torch) and gives the item back.
//
//   solid    cobble, stone bricks, clay bricks, planks, logs (axis by the face you click), dirt,
//            glass; shapes: block, slab (top or bottom), stairs (tall side away from you, upside
//            down under a ceiling), post (a 1/4-block column; logs and planks lie as beams when
//            put on a wall), pane (glass, a thin sheet across your view)
//   ladder   a ladder face against a wall (rails and rungs, hugging rough rock); a click puts up a
//            whole run from the floor to the top of the wall, one ladder per block
//   torch    one bracket voxel on a wall or floor (the flame is a model, Build.js; it lights the cave)
//   lantern  one hook voxel under a ceiling, on a floor or on a wall
//   door     a 1-voxel plate, 1×2 blocks, hinged on a column just outside the doorway so an open
//            door never narrows the opening (the mole is 0.44 m wide, a doorway 0.5 m); the hinge
//            material says which way the next toggle swings (B_DOOR_CW / B_DOOR_CCW)
//   chest    a little iron-banded box inside its cell (storage, Build.js)
//   bench    the workbench: a table with legs and a shelf (crafting, picker.js)
import { M, MAT } from '../materials.js';
import { BM } from './mats.js';

export const BS = 8; // voxels per block edge
export const BS_SHIFT = 3;

/** Horizontal directions: 0 +x (east), 1 −x (west), 2 +z (south), 3 −z (north). */
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const dirIndex = (dx, dz) => (Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 1) : (dz >= 0 ? 2 : 3));
/** Clockwise seen from above (north → east → south → west). */
export const rotCW = ([dx, dz]) => [-dz, dx];
export const rotCCW = ([dx, dz]) => [dz, -dx];

export const SHAPES = {
  block: { name: 'Block', hint: 'A full block' },
  slab: { name: 'Slab', hint: 'Half a block: steps you walk up without jumping' },
  stairs: { name: 'Stairs', hint: 'Climb away from you; upside down under a ceiling' },
  post: { name: 'Post', hint: 'A thin pillar; on a wall it lies as a beam' },
  pane: { name: 'Pane', hint: 'A thin sheet of glass across your view' },
};

/**
 * The catalogue (order = the picker's order; the ladder stays first: the mining lesson asks for
 * build mode 0). tool: what breaks it properly (Dig.js toolRule), hp: blows with that tool at power 1.
 */
export const BLOCKS = [
  { id: 'ladder', item: 'blk_ladder', kind: 'ladder', m: M.LADDER, mats: [M.LADDER], tool: 'axe', hp: 0.5, snd: 'wood', hint: 'Aim at a wall: a ladder from the floor to the top' },
  { id: 'cobble', item: 'blk_cobble', kind: 'solid', m: BM.B_COBBLE, shapes: ['block', 'slab', 'stairs', 'post'], tool: 'pick', hp: 2.2, snd: 'stone' },
  { id: 'stonebrick', item: 'blk_stonebrick', kind: 'solid', m: BM.B_STONEBRICK, shapes: ['block', 'slab', 'stairs', 'post'], tool: 'pick', hp: 2.6, snd: 'stone' },
  { id: 'bricks', item: 'blk_bricks', kind: 'solid', m: BM.B_CLAYBRICK, shapes: ['block', 'slab', 'stairs'], tool: 'pick', hp: 2.4, snd: 'stone' },
  { id: 'planks', item: 'blk_planks', kind: 'solid', m: BM.B_PLANKS, shapes: ['block', 'slab', 'stairs', 'post'], tool: 'axe', hp: 1.4, snd: 'wood' },
  { id: 'log', item: 'blk_log', kind: 'solid', m: BM.B_LOG_Y, mats: [BM.B_LOG_Y, BM.B_LOG_X, BM.B_LOG_Z], shapes: ['block', 'post'], axis: true, tool: 'axe', hp: 1.8, snd: 'wood' },
  { id: 'dirt', item: 'blk_dirt', kind: 'solid', m: BM.B_DIRT, shapes: ['block', 'slab'], tool: 'spade', hp: 0.8, snd: 'dirt' },
  { id: 'glass', item: 'blk_glass', kind: 'solid', m: BM.B_GLASS, shapes: ['block', 'pane'], tool: 'any', hp: 0.5, snd: 'ice' },
  { id: 'torch', item: 'blk_torch', kind: 'torch', m: BM.B_TORCH, tool: 'any', hp: 0.15, snd: 'wood', light: { c: [1.0, 0.6, 0.26], r: 5.2 }, hint: 'On a wall or the floor: it lights the cave' },
  { id: 'lantern', item: 'blk_lantern', kind: 'lantern', m: BM.B_LANTERN, tool: 'any', hp: 0.35, snd: 'metal', light: { c: [1.0, 0.74, 0.4], r: 7.2 }, hint: 'Hang it from a ceiling, or stand it on the floor' },
  { id: 'door', item: 'blk_door', kind: 'door', m: BM.B_DOOR, mats: [BM.B_DOOR, BM.B_DOOR_CW, BM.B_DOOR_CCW], tool: 'axe', hp: 1.4, snd: 'wood', hint: 'In a doorway 1 block wide, 2 high' },
  { id: 'chest', item: 'blk_chest', kind: 'chest', m: BM.B_CHEST, tool: 'axe', hp: 1.4, snd: 'wood', hint: 'Storage that stays down here' },
  { id: 'workbench', item: 'blk_workbench', kind: 'bench', m: BM.B_BENCH, tool: 'axe', hp: 1.6, snd: 'wood', hint: 'Craft doors, glass, bricks and chests at it' },
];
for (const b of BLOCKS) b.mats ||= [b.m];
export const BLOCK = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));
export const BLOCK_OF_ITEM = Object.fromEntries(BLOCKS.map((b) => [b.item, b]));
/** material → its catalogue entry (placed things only). */
export const FAMILY = new Map();
for (const b of BLOCKS) for (const m of b.mats) FAMILY.set(m, b);
export const familyOf = (m) => FAMILY.get(m) || null;
export const isBuilt = (m) => !!MAT[m]?.built || m === M.LADDER;
export const LOG_AXIS = { y: BM.B_LOG_Y, x: BM.B_LOG_X, z: BM.B_LOG_Z };
export const DOOR_MATS = new Set([BM.B_DOOR, BM.B_DOOR_CW, BM.B_DOOR_CCW]);

// ------------------------------------------------------------------ shapes in a cell
/**
 * Does a shape fill local voxel (x, y, z) (0..7) of its cell?
 * o: { top: upside down (slab, stairs), dir: stairs' tall side (DIRS index), axis: 'x'|'y'|'z' (post; pane: its normal) }
 */
export function shapeHas(shape, o, x, y, z) {
  switch (shape) {
    case 'slab': return o.top ? y >= 4 : y < 4;
    case 'stairs': {
      const low = o.top ? y >= 4 : y < 4;
      if (low) return true;
      const d = o.dir ?? 3;
      const far = d === 0 ? x >= 4 : d === 1 ? x < 4 : d === 2 ? z >= 4 : z < 4;
      return far;
    }
    case 'post': {
      const a = o.axis || 'y', i = (v) => v >= 2 && v <= 5;
      return a === 'y' ? i(x) && i(z) : a === 'x' ? i(y) && i(z) : i(x) && i(y);
    }
    case 'pane': return (o.axis === 'x' ? x : z) >= 3 && (o.axis === 'x' ? x : z) <= 4;
    case 'chest': return x >= 1 && x <= 6 && z >= 1 && z <= 6 && y <= 5;
    case 'bench': {
      if (y >= 6) return true;
      const corner = (x < 2 || x > 5) && (z < 2 || z > 5);
      if (corner) return true;
      return y === 1 && x >= 1 && x <= 6 && z >= 1 && z <= 6;
    }
    default: return true; // block
  }
}

/** Local voxels of a shape: [[x, y, z], ...] (0..7). */
export function shapeVoxels(shape, o = {}) {
  const out = [];
  for (let y = 0; y < BS; y++) for (let z = 0; z < BS; z++) for (let x = 0; x < BS; x++) if (shapeHas(shape, o, x, y, z)) out.push([x, y, z]);
  return out;
}

// ------------------------------------------------------------------ doors
/**
 * A door's voxels (world voxel coords) from its hinge column (hx, hy, hz: the bottom voxel), the
 * direction the leaf runs from the hinge (DIRS vector) and the hinge material.
 * Returns [{ x, y, z, m }] (16 hinge voxels + 8 × 16 leaf voxels).
 */
export function doorVoxels(hx, hy, hz, d, hingeM) {
  const out = [];
  for (let y = 0; y < 16; y++) {
    out.push({ x: hx, y: hy + y, z: hz, m: hingeM });
    for (let k = 1; k <= BS; k++) out.push({ x: hx + d[0] * k, y: hy + y, z: hz + d[1] * k, m: BM.B_DOOR });
  }
  return out;
}

/**
 * Read a door from any of its voxels: { hinge: [x, y, z], dir: [dx, dz], hingeM, voxels } or null.
 * w: the world (voxelAt).
 */
export function readDoor(w, vx, vy, vz) {
  const seen = new Set(), stack = [[vx, vy, vz]], vox = [];
  let hinge = null;
  while (stack.length && vox.length < 420) {
    const [x, y, z] = stack.pop();
    const k = x + ',' + y + ',' + z;
    if (seen.has(k)) continue;
    seen.add(k);
    const m = w.voxelAt(x, y, z);
    if (!DOOR_MATS.has(m)) continue;
    vox.push({ x, y, z, m });
    if (m !== BM.B_DOOR && (!hinge || y < hinge[1])) hinge = [x, y, z, m];
    stack.push([x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]);
  }
  if (!hinge) return null;
  const [hx, hy, hz, hm] = hinge;
  // the leaf runs from the hinge column's bottom voxel to the side where the plate is
  let dir = null;
  for (const d of DIRS) if (w.voxelAt(hx + d[0], hy, hz + d[1]) === BM.B_DOOR) { dir = d; break; }
  if (!dir) return null;
  return { hinge: [hx, hy, hz], dir, hingeM: hm, voxels: vox };
}

// ------------------------------------------------------------------ units: what one break takes out
/**
 * The placed thing a voxel belongs to: { key, block, voxels: [{x, y, z, m}], cell?: [cx, cy, cz] } or null.
 * Blocks and ladders are per 0.5 m cell; doors are the whole door; torches and lanterns one voxel.
 */
export function unitOf(w, vx, vy, vz) {
  const m = w.voxelAt(vx, vy, vz);
  const block = FAMILY.get(m);
  if (!block) return null;
  if (block.kind === 'torch' || block.kind === 'lantern') return { key: `v:${vx},${vy},${vz}`, block, voxels: [{ x: vx, y: vy, z: vz, m }] };
  if (block.kind === 'door') {
    const d = readDoor(w, vx, vy, vz);
    if (!d) return { key: `v:${vx},${vy},${vz}`, block, voxels: [{ x: vx, y: vy, z: vz, m }] };
    return { key: `d:${d.hinge.join(',')}`, block, voxels: d.voxels, door: d };
  }
  const cx = vx >> BS_SHIFT, cy = vy >> BS_SHIFT, cz = vz >> BS_SHIFT;
  const voxels = [];
  for (let z = 0; z < BS; z++) for (let y = 0; y < BS; y++) for (let x = 0; x < BS; x++) {
    const X = cx * BS + x, Y = cy * BS + y, Z = cz * BS + z;
    const mm = w.voxelAt(X, Y, Z);
    if (FAMILY.get(mm) === block) voxels.push({ x: X, y: Y, z: Z, m: mm });
  }
  return { key: `c:${cx},${cy},${cz}`, block, voxels, cell: [cx, cy, cz] };
}

/** How many voxels a unit needs left to give its item back (a block chewed by a blast crumbles). */
export function unitWorth(unit) {
  const k = unit.block.kind;
  if (k === 'torch' || k === 'lantern' || k === 'door') return 1;
  return unit.voxels.length >= 24 ? 1 : 0;
}

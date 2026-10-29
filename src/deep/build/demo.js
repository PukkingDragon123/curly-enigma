// Test and screenshot helpers for the building part (not used by the game). In an eval:
//   const d = await import('/src/deep/build/demo.js');
//   d.setup(scene) → finds a cave spot, stands the mole there (the lesson counts as done)
//   d.hut(scene)   → clears a room and builds a little hut in front of the mole through the real
//                    planner (walls, logs, glass, a door, a stair roof, torches, a lantern, a chest,
//                    a workbench, a ladder); returns camera spots
//   d.tunnel(scene) → digs a 1×2 tunnel off the room and lines it with torches
//   d.breakTest(scene) → blows needed for placed blocks with the right and the wrong tools
import { VOX, M, ORE_BASE } from '../materials.js';
import { OPAQUE } from '../Mesher.js';
import { BS, DIRS } from './blocks.js';

const yawOf = (fi) => Math.atan2(-DIRS[fi][0], -DIRS[fi][1]); // DigScene yaw that looks along DIRS[fi]

export function setup(s, o = {}) {
  const st = s.state;
  st.flag('prologue', true);
  st.data.energy = 100;
  // a cave spot well away from lifts, burrows and town (building is refused there)
  const clear = (x, y, z) => !s.builder?.protectedAt?.(x, y, z, 7);
  const p = o.at || s.debug.find((b, d, x, y, z) => d > (o.d0 ?? 7) && d < (o.d1 ?? 20) && clear(x, y, z), { r: o.r ?? 40, seed: o.seed ?? 3 });
  if (p) s.debug.teleport(p.x, p.y, p.z, 0, 0);
  return p;
}

/** Empty a box of cells (rock out, ore kept), then a stone floor under it. */
export function clearCells(s, c0, c1, floor = true) {
  const w = s.world;
  for (let cz = c0[2]; cz <= c1[2]; cz++) for (let cy = c0[1]; cy <= c1[1]; cy++) for (let cx = c0[0]; cx <= c1[0]; cx++)
    for (let k = 0; k < 512; k++) {
      const X = cx * BS + (k & 7), Y = cy * BS + ((k >> 3) & 7), Z = cz * BS + (k >> 6);
      const m = w.voxelAt(X, Y, Z);
      if (m && m < ORE_BASE) w.setVoxel(X, Y, Z, 0);
    }
  if (floor) for (let cz = c0[2]; cz <= c1[2]; cz++) for (let cx = c0[0]; cx <= c1[0]; cx++) for (let k = 0; k < 64; k++) {
    const X = cx * BS + (k & 7), Z = cz * BS + (k >> 3), Y = c0[1] * BS - 1;
    if (!OPAQUE[w.voxelAt(X, Y, Z)]) w.setVoxel(X, Y, Z, M.STONE);
  }
}

/**
 * Place a block through the planner as if the mole aimed at the face of the neighbour of cell
 * (cx, cy, cz) that touches it. o: { id, shape, n: the face's normal, pointing into the cell
 * (default [0, 1, 0]: the floor under it), facing: DIRS index, hy (0..8: how high on a wall face) }.
 */
export function put(s, cx, cy, cz, o) {
  const b = s.builder, pl = s.player;
  b.select(o.id, true);
  if (o.shape) b.setShape(o.shape);
  if (o.facing !== undefined) pl.yaw = yawOf(o.facing);
  const n = o.n || [0, 1, 0];
  const at = (c, k) => (k > 0 ? c * BS - 1 : k < 0 ? c * BS + BS : c * BS + 4);
  const vx = at(cx, n[0]), vy = n[1] ? at(cy, n[1]) : cy * BS + Math.floor(o.hy ?? 2), vz = at(cz, n[2]);
  const face = (c, k, v) => (k > 0 ? c * BS : k < 0 ? c * BS + BS : v + 0.5);
  const hy = n[1] ? face(cy, n[1]) : cy * BS + (o.hy ?? 2) + 0.5;
  const hit = { vx, vy, vz, nx: n[0], ny: n[1], nz: n[2], m: s.world.voxelAt(vx, vy, vz), x: face(cx, n[0], vx) / VOX, y: hy / VOX, z: face(cz, n[2], vz) / VOX, dist: 1 };
  const p = b.planAt(hit);
  if (!p) return { ok: false, why: 'no plan' };
  if (!p.ok) return { ok: false, why: p.why };
  b.commit(p);
  return { ok: true, n: p.voxels.length };
}

/** A torch or lantern on a face: voxel (x, y, z) is the free voxel, n the face normal it sits on. */
export function fix(s, id, x, y, z, n) {
  const b = s.builder;
  b.select(id, true);
  const hit = { vx: x - n[0], vy: y - n[1], vz: z - n[2], nx: n[0], ny: n[1], nz: n[2], m: s.world.voxelAt(x - n[0], y - n[1], z - n[2]), x: (x + 0.5) / VOX, y: (y + 0.5) / VOX, z: (z + 0.5) / VOX, dist: 1 };
  const p = b.planAt(hit);
  if (!p?.ok) return { ok: false, why: p?.why };
  b.commit(p);
  return { ok: true };
}

/** The mole's cell. */
export function cellOf(s) { const p = s.player.pos; return [Math.floor(p.x * 2), Math.floor((p.y + 0.02) * 2), Math.floor(p.z * 2)]; }

/**
 * A hut 5×5 cells, 2 high, in front of the mole (it faces +z: the door looks back at the mole).
 * Returns { o (origin cell: the hut's front-left floor cell), shots }.
 */
export function hut(s) {
  const b = s.builder, pl = s.player;
  for (const [id, n] of [['blk_cobble', 40], ['blk_stonebrick', 20], ['blk_planks', 40], ['blk_log', 12], ['blk_glass', 6], ['blk_door', 2], ['blk_chest', 2], ['blk_workbench', 1], ['blk_torch', 16], ['blk_lantern', 2], ['blk_ladder', 12]]) if (s.state.count(id) < n) s.state.addItem(id, { n: n - s.state.count(id), spill: true });
  const me = cellOf(s);
  const o = [me[0] - 2, me[1], me[2] + 3]; // front-left corner, floor level
  clearCells(s, [o[0] - 3, o[1], me[2] - 1], [o[0] + 7, o[1] + 4, o[2] + 7]);
  // stand back so nothing is "in the way"
  s.debug.teleport((me[0] + 0.5) / 2, o[1] / 2 + 0.02, (me[2] - 0.2) / 2, Math.PI, 0);
  const R = [];
  const P = (x, y, z, opt) => { const r = put(s, o[0] + x, o[1] + y, o[2] + z, opt); R.push([x, y, z, opt.id, r.ok ? 'ok' : r.why]); return r; };
  // floor: planks inside (the rock under the room comes out first)
  clearCells(s, [o[0] + 1, o[1] - 1, o[2] + 1], [o[0] + 3, o[1] - 1, o[2] + 3]);
  for (let x = 1; x <= 3; x++) for (let z = 1; z <= 3; z++) P(x, -1, z, { id: 'planks', shape: 'block', facing: 2 });
  // walls: log posts at the corners, cobble below, stone bricks above, glass windows on the sides
  for (const [x, z] of [[0, 0], [4, 0], [0, 4], [4, 4]]) for (let y = 0; y < 2; y++) P(x, y, z, { id: 'log', shape: 'block' });
  for (let y = 0; y < 2; y++) {
    for (let k = 1; k <= 3; k++) {
      const window = y === 1 && k === 2;
      const front = k === 2 ? null : { id: y ? 'stonebrick' : 'cobble', shape: 'block' };
      if (front) P(k, y, 0, front); // the doorway stays open (k = 2)
      P(k, y, 4, { id: y ? 'stonebrick' : 'cobble', shape: 'block' });
      P(0, y, k, window ? { id: 'glass', shape: 'block' } : { id: y ? 'stonebrick' : 'cobble', shape: 'block' });
      P(4, y, k, window ? { id: 'glass', shape: 'pane', facing: 0 } : { id: y ? 'stonebrick' : 'cobble', shape: 'block' });
    }
  }
  // roof: stairs round the rim (tall side inward), log beams at the corners, a planks middle
  for (let x = 0; x <= 4; x++) for (let z = 0; z <= 4; z++) {
    const rim = x === 0 || z === 0 || x === 4 || z === 4;
    const corner = (x === 0 || x === 4) && (z === 0 || z === 4);
    if (corner) P(x, 2, z, { id: 'cobble', shape: 'block' });
    else if (rim) P(x, 2, z, { id: 'planks', shape: 'stairs', facing: z === 0 ? 2 : z === 4 ? 3 : x === 0 ? 0 : 1 });
    else P(x, 2, z, { id: 'planks', shape: x === 2 && z === 2 ? 'slab' : 'block' });
  }
  P(2, 3, 2, { id: 'planks', shape: 'slab' });
  // the door: stand in front of the doorway looking in
  pl.yaw = yawOf(2);
  const door = put(s, o[0] + 2, o[1], o[2], { id: 'door', facing: 2 });
  R.push(['door', door.ok ? 'ok' : door.why]);
  // inside: a chest and a workbench in the back corners, a torch on the back wall, a lantern under the roof
  R.push(['chest', put(s, o[0] + 1, o[1], o[2] + 3, { id: 'chest' }).why || 'ok']);
  R.push(['bench', put(s, o[0] + 3, o[1], o[2] + 3, { id: 'workbench' }).why || 'ok']);
  const bx = (o[0] + 2) * BS + 4, by = o[1] * BS + 11, bz = (o[2] + 4) * BS - 1;
  R.push(['torch in', fix(s, 'torch', bx, by, bz, [0, 0, -1]).ok]);
  R.push(['lantern', fix(s, 'lantern', (o[0] + 2) * BS + 4, (o[1] + 2) * BS - 1, (o[2] + 2) * BS + 4, [0, -1, 0]).ok]);
  // outside: torches either side of the door, a ladder up the side wall
  R.push(['torch l', fix(s, 'torch', (o[0] + 1) * BS + 4, o[1] * BS + 12, o[2] * BS - 1, [0, 0, -1]).ok]);
  R.push(['torch r', fix(s, 'torch', (o[0] + 3) * BS + 4, o[1] * BS + 12, o[2] * BS - 1, [0, 0, -1]).ok]);
  b.select('ladder', true);
  pl.yaw = yawOf(1);
  const lad = put(s, o[0] + 5, o[1] + 1, o[2] + 1, { id: 'ladder', n: [1, 0, 0], hy: 3 });
  R.push(['ladder', lad.ok ? lad.n : lad.why]);
  b.select('cobble', true);
  b.setShape('block');
  const W = (cx, cy, cz) => [cx / 2, cy / 2, cz / 2];
  return {
    o, R: R.filter((r) => r[r.length - 1] !== 'ok' && r[r.length - 1] !== true),
    shots: {
      front: { at: W(o[0] + 2.5, o[1] + 0.02, o[2] - 3.2), yaw: Math.PI + 0.25, pitch: -0.05 },
      corner: { at: W(o[0] - 2.2, o[1] + 0.02, o[2] - 2.2), yaw: Math.PI + 0.75, pitch: -0.12 },
      inside: { at: W(o[0] + 2.5, o[1] + 0.02, o[2] + 1.2), yaw: Math.PI, pitch: 0.05 },
    },
  };
}

/** A 1×2 tunnel off to the −x side of the hut room, a torch every few blocks on its wall. */
export function tunnel(s, o, len = 14) {
  const t0 = [o[0] - 3, o[1], o[2] + 2];
  clearCells(s, [t0[0] - len, t0[1], t0[2]], [t0[0], t0[1] + 1, t0[2]], true);
  let n = 0;
  for (let k = 1; k < len; k += 4) {
    const cx = t0[0] - k;
    const r = fix(s, 'torch', cx * BS + 4, t0[1] * BS + 11, (t0[2] + 1) * BS - 1, [0, 0, -1]);
    if (r.ok) n++;
  }
  return { torches: n, start: [(t0[0] + 0.5) / 2, t0[1] / 2 + 0.02, (t0[2] + 0.5) / 2], end: [(t0[0] - len + 0.5) / 2, t0[1] / 2, (t0[2] + 0.5) / 2] };
}

/** Blows to break a placed block of each kind with the dig slot's tool (with and without the right tool). */
export function breakTest(s, o) {
  const b = s.builder, pl = s.player, st = s.state;
  const out = {};
  const test = (id, withTools) => {
    const owned = st.data.owned;
    for (const k of ['axe_copper', 'spade_copper', 'shears', 'axe_stone', 'spade_stone']) if (!withTools) delete owned[k];
    if (withTools) b.debug.tools();
    const c = [o[0] + 8, o[1], o[2] + 2];
    clearCells(s, [c[0] - 2, c[1], c[2] - 2], [c[0] + 1, c[1] + 2, c[2] + 1]);
    const r = put(s, c[0], c[1], c[2], { id, shape: 'block' });
    if (!r.ok) return 'place: ' + r.why;
    s.debug.teleport(c[0] / 2 - 0.55, c[1] / 2 + 0.02, (c[2] + 0.5) / 2, Math.PI / 2, -0.35);
    b.debug.aim((c[0] + 0.5) / 2, (c[1] + 0.5) / 2, (c[2] + 0.5) / 2);
    s.selectSlot(0);
    const before = st.count(BLOCK_ITEM[id]);
    let n = 0;
    for (; n < 40; n++) {
      s.updateTarget();
      b.updateKit(1);
      if (!s.target || !s.target.m || s.target.m < 80) break;
      st.data.energy = 100;
      s.strike();
    }
    for (let k = 0; k < 90; k++) s.update(1 / 30);
    return { blows: n, tool: b.kit?.item?.id, back: st.count(BLOCK_ITEM[id]) - before };
  };
  for (const id of ['cobble', 'planks', 'log', 'dirt', 'glass']) { out[id + ':paws+pick'] = test(id, false); out[id + ':tools'] = test(id, true); }
  return out;
}
const BLOCK_ITEM = { cobble: 'blk_cobble', planks: 'blk_planks', log: 'blk_log', dirt: 'blk_dirt', glass: 'blk_glass' };

/** Stand at a shot spot. */
export function stand(s, sp) { s.debug.teleport(sp.at[0], sp.at[1], sp.at[2], sp.yaw, sp.pitch); }

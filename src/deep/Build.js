// Building in the mine, Minecraft-like (building part, wave 4). The build slot puts blocks on a
// 0.5 m grid (cobble, stone bricks, clay bricks, planks, logs, dirt, glass; slabs, stairs, posts,
// panes), ladders up walls, torches and lanterns that light the caves, doors, chests and a
// workbench. A see-through ghost shows what goes where (green: fine, red: not here); the face you
// aim at decides where it snaps, your facing turns stairs, doors and panes, the face's axis turns
// logs. The dig slot picks the right tool for what's under the crosshair (pick, axe, spade, shears:
// Dig.js toolRule) and breaks a placed block whole: cracks spread over it, then it pops out and
// flies back into your pack. What you dig keeps a block now and then (cobble from stone, dirt from
// soil, logs from roots and timber, clay, sand; "Gather" in the picker), never into your last free
// pocket and never past a comfortable load. Everything placed is plain voxels (build/blocks.js), so it
// saves with the world's dug rock; torches and lanterns are found again from the saved edits and
// their lights go into plan.lights (like glow stakes), so DigScene.lights() and the air's halos
// pick them up. Chests keep their things in state.data.build.chests (per world seed and block).
// No building in lift rooms, Deep Town, NPC burrows or near the home.
//
// API (DigScene, docs/DEEP.md): new Build(ctx) · update(dt, { hide }) (from DigScene's build
// section every frame) · place() (the build slot's click) · openPicker(tab) · target(eye, dir,
// reach) / use(eye, dir, reach) (E on a door, chest or workbench; it wires itself to E when
// DigScene doesn't call use) · handTool(slot) (the view model's tool for a slot) · item() (the
// selected block's item) · lights(eye) → [] (placed lights live in plan.lights) · onVoxel ·
// dispose() · debug.*
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { makeObjectMaterial } from './TerrainMaterial.js';
import { VOX, M, MAT, ORE_BASE } from './materials.js';
import { OPAQUE } from './Mesher.js';
import { key3, CB } from './World.js';
import { VoxelGrid, meshGridGreedy } from '../gfx/Voxel.js';
import { iconCanvas, pixelTexture, iconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import * as Inv from '../core/inventory.js';
import { kgOf } from '../core/weight.js';
import { toolWant, toolRule, TOOL_NAMES } from './Dig.js';
import { BM } from './build/mats.js';
import { RM } from './ruins/mats.js';
import {
  BS, BLOCKS, BLOCK, BLOCK_OF_ITEM, SHAPES, DIRS, dirIndex, rotCW, rotCCW, familyOf, isBuilt, LOG_AXIS,
  shapeHas, doorVoxels, readDoor, unitOf, DOOR_MATS,
} from './build/blocks.js';
import { patchBuildLook } from './build/shader.js';
import { torchModel, lanternModel, bracketModel, crackTextures, miniBlockGeo, heldGeo, blockColors, LANTERN_S } from './build/models.js';
import { burrowBB } from './gen/burrows.js';

const REACH = 2.3;
const CS = 32;
const FIX = new Set([BM.B_TORCH, BM.B_LANTERN]);
const free = (m) => m === 0 || !!MAT[m]?.fluid || m === M.VINES || m === M.FERN;
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_OF = (dx, dy, dz) => (dx > 0 ? 0 : dx < 0 ? 1 : dy > 0 ? 2 : dy < 0 ? 3 : dz > 0 ? 4 : 5);
const rnd = (a, b) => a + Math.random() * (b - a);

/** What digging a natural material keeps: [item, blocks per 512 voxels] or null. */
function yieldOf(m, kind) {
  if (!m || m >= ORE_BASE || isBuilt(m)) return null;
  if (m === RM.DCOB || m === RM.DMOSSCOB) return ['blk_cobble', 1]; // a dungeon's walls are good building stone
  if (m === RM.DBRICKA || m === RM.DBRICKB || m === RM.DMOSSBRICK || m === RM.DCRACKBRICK) return ['blk_stonebrick', 1];
  const d = MAT[m];
  if (!d || d.made || d.unbreakable || d.fluid) return null;
  if (m === M.CLAY) return ['clay_lump', 1.2];
  if (m === M.SAND) return ['sand_pile', 1.2];
  if (m === M.VINES) return kind === 'shears' ? ['vine_cut', 6] : null;
  if (m === M.CRYSTAL || m === M.GEODE || m === M.GLOWCAP || m === M.MOSS || m === M.FERN || m === M.BONE) return null;
  if (d.snd === 'wood') return ['blk_log', 1];
  if (d.snd === 'dirt') return ['blk_dirt', 1];
  if (d.snd === 'gravel') return ['blk_cobble', 0.5];
  if (d.snd === 'stone' || d.snd === 'crystal') return ['blk_cobble', 1];
  return null;
}

export class Build {
  constructor(ctx) {
    this.ctx = ctx;
    this.w = ctx.world;
    this.owner = ctx.owner;
    this.st = ctx.state;
    this.ui = ctx.ui;
    this.audio = ctx.audio;
    this.fx = ctx.fx;
    this.U = ctx.U;
    this.player = ctx.player;
    this.plan = ctx.plan || ctx.world.plan;
    this.scene3 = ctx.scene3 || ctx.scene;
    this.time = 0;
    this.root = new THREE.Group();
    this.scene3.add(this.root);
    const d = (this.st.data.build ||= {});
    d.v ||= 1;
    d.sel ||= 'ladder';
    d.shape ||= {};
    if (d.gather === undefined) d.gather = true;
    d.chests ||= {};
    d.doors ||= {};
    this.data = d;
    this.seed = this.w.seed;
    this.objMat = makeObjectMaterial(this.U, {});
    this.glowMat = makeObjectMaterial(this.U, { emissive: 1.35 });
    this.credit = {};
    this.fixtures = new Map(); // 'x,y,z' → fixture
    this.glass = new Set(); // glass voxel keys 'x,y,z'
    this.glassDirty = true;
    this.pops = [];
    this.out = [];
    this.notes = {};
    this.kitKind = 'pick';
    this.kitT = 0;
    this.zones = this.protectedZones();
    this.makeHelpers();
    this.scanEdits();
    this.checkChests();
    // a few ladders and torches to start with (once per save, after Old Star's lesson)
    if (!d.kit && this.st.flag?.('prologue')) {
      d.kit = 1;
      this.st.addItem('blk_ladder', { n: 8, spill: true });
      this.st.addItem('blk_torch', { n: 6, spill: true });
      setTimeout(() => this.ui.toast?.('A builder\'s start: <b>8 ladders</b> and <b>6 torches</b> in your pack. The build tool is <b>7</b>.', { icon: iconURL('blk_torch'), kind: 'good', dur: 4200 }), 3200);
    }
    // gather: digging natural rock keeps a block now and then
    this.offAct = this.st.on('act', (a) => {
      if (this.owner?.game && this.owner.game.scene !== this.owner) { this.dispose(); return; } // the scene left without disposing us
      if (a?.type === 'dig') this.gather(a);
    });
    // hear the digger when a placed block breaks
    const dg = this.owner?.digger;
    if (dg) dg.onBuilt = (info) => this.onBuilt(info);
    this.select(d.sel, true);
    this.debug = this.makeDebug();
  }

  // ------------------------------------------------------------------ selection
  get block() { return BLOCK[this.data.sel] || BLOCKS[0]; }
  /** The selected block's item (the build slot's icon and count). */
  item() { return ITEMS[this.block.item]; }
  shapeOf(b = this.block) { const s = this.data.shape[b.id]; return b.shapes ? (b.shapes.includes(s) ? s : b.shapes[0]) : null; }
  select(id, quiet = false) {
    const b = BLOCK[id] || BLOCKS[0];
    this.data.sel = b.id;
    if (this.owner) this.owner.buildMode = BLOCKS.indexOf(b); // the mining lesson reads it (0 = ladder)
    this.planKey = null;
    if (!quiet) { this.owner?.updateHotbar?.(); this.audio?.play('ui_click', { pitch: 1.1 }); }
  }
  setShape(shape) {
    const b = this.block;
    if (!b.shapes?.includes(shape)) return;
    this.data.shape[b.id] = shape;
    this.planKey = null;
    this.owner?.updateHotbar?.();
  }
  /** How many of the selected block the mole has (Infinity while building is free in the lesson). */
  have(b = this.block) { return this.freeBuild() ? Infinity : this.st.count(b.item); }
  freeBuild() { return !this.st.flag?.('prologue') && (this.block.kind === 'ladder') || !!this.debugFree; }
  label() {
    const b = this.block, sh = this.shapeOf(b), n = this.st.count(b.item);
    return `Build: ${ITEMS[b.item]?.name || b.id}${sh && sh !== 'block' ? ' · ' + SHAPES[sh].name : ''}${this.freeBuild() ? '' : ` (${n})`}`;
  }

  // ------------------------------------------------------------------ tools in the paw
  /** The best tool the mole owns of a kind (pick: the equipped one). */
  bestTool(kind) {
    const st = this.st;
    if (kind === 'pick') return st.equipped('pick');
    let best = null;
    for (const id of Object.keys(st.data.owned || {})) {
      const it = ITEMS[id];
      if (!it || it.slot !== kind || !st.data.owned[id]) continue;
      if (!best || (it.tier || 1) > (best.tier || 1) || ((it.tier || 1) === (best.tier || 1) && (it.power || 1) > (best.power || 1))) best = it;
    }
    return best;
  }
  /** The kit for a material: the right tool if owned, else the pick. */
  kitFor(m) {
    const pick = this.st.equipped('pick') || ITEMS.pick_rusty;
    const want = m ? toolWant(m) : 'pick';
    const t = want !== 'pick' && want !== 'any' ? this.bestTool(want) : null;
    const it = t || pick;
    return { kind: t ? want : 'pick', item: it, power: it.power || 1, pickPower: pick.power || 1, tier: it.tier || 1, want };
  }
  /** The view model's tool for a slot: { kind, opts } or null (DigScene's default). */
  handTool(slot) {
    if (slot === 'build') {
      const it = this.item();
      const geo = heldGeo(it.id);
      return { kind: 'stake', opts: { item: it.id, geo } };
    }
    if (slot === 'pick') {
      const k = this.kit;
      if (!k || k.kind === 'pick') return null;
      return { kind: 'pick', opts: { item: k.item.id, geo: heldGeo(k.item.id) } };
    }
    return null;
  }
  updateKit(dt) {
    const o = this.owner;
    const dg = o?.digger;
    if (!dg) return;
    if (o.slotName !== 'pick') { if (this.kitKind !== 'pick') { this.kit = null; dg.kit = null; this.kitKind = 'pick'; } return; }
    const m = o.target?.m || 0;
    const k = this.kitFor(m);
    // switch tools only when the aim has rested a moment and no swing is under way
    if (k.item.id !== (this.kit?.item?.id ?? this.st.equipped('pick')?.id)) {
      this.kitT += dt;
      if (this.kitT < 0.12 || o.swing) return;
    }
    this.kitT = 0;
    const changed = (this.kit?.item?.id || null) !== k.item.id;
    this.kit = k;
    this.kitKind = k.kind;
    dg.kit = k;
    if (changed && o.vm) { const h = this.handTool('pick'); o.vm.setTool('pick', h ? h.opts : { item: k.item.id }); }
  }

  // ------------------------------------------------------------------ protected places
  protectedZones() {
    const p = this.plan, z = [];
    if (p.house) { const h = p.house; z.push({ box: [h.x0 - 3, (h.y0 ?? 0) - 2.5, h.z0 - 3, h.x1 + 3, (h.y1 ?? 3) + 1.5, h.z1 + 3], name: 'your home' }); }
    if (p.town) { const T = p.town; z.push({ sphere: [T.x - 1, T.y + 0.5, T.z, (T.r || 5) + 5], name: 'Deep Town' }); }
    for (const L of p.lifts || []) z.push({ box: [L.x - 2.8, L.y - 1.2, L.z - 2.8, L.x + 2.8, L.y + 3.4, L.z + 2.8], name: `the ${L.name || 'old'} lift` });
    for (const f of p.features || []) if (f.kind === 'burrow') { try { z.push({ box: burrowBB(f), name: 'somebody\'s burrow' }); } catch (e) { /* noop */ } }
    return z;
  }
  protectedAt(x, y, z, margin = 0) {
    for (const Z of this.zones) {
      let d;
      if (Z.box) { const [x0, y0, z0, x1, y1, z1] = Z.box; d = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1), Math.max(z0 - z, 0, z - z1)); }
      else { const [sx, sy, sz, r] = Z.sphere; d = Math.max(0, Math.hypot(x - sx, y - sy, z - sz) - r); }
      if (d <= margin) return Z;
    }
    return null;
  }

  // ------------------------------------------------------------------ planning a placement
  /** Does a voxel box overlap the mole (or Nugget)? (voxel coords, inclusive min, exclusive max) */
  hitsBodies(x0, y0, z0, x1, y1, z1) {
    const p = this.player.pos, h = this.player.h || 0.86;
    const ov = (ax0, ay0, az0, ax1, ay1, az1) => x1 / VOX > ax0 && x0 / VOX < ax1 && y1 / VOX > ay0 && y0 / VOX < ay1 && z1 / VOX > az0 && z0 / VOX < az1;
    if (ov(p.x - 0.23, p.y, p.z - 0.23, p.x + 0.23, p.y + h, p.z + 0.23)) return 'you';
    const n = this.owner?.nugget;
    if (n?.pos && !n.carrying && ov(n.pos.x - 0.25, n.pos.y, n.pos.z - 0.25, n.pos.x + 0.25, n.pos.y + 0.9, n.pos.z + 0.25)) return 'Nugget';
    return null;
  }

  /** Is any voxel of a cell a placed thing? */
  cellBuilt(cx, cy, cz) {
    const w = this.w;
    for (let z = 0; z < BS; z++) for (let y = 0; y < BS; y++) for (let x = 0; x < BS; x++) if (isBuilt(w.voxelAt(cx * BS + x, cy * BS + y, cz * BS + z))) return true;
    return false;
  }

  /** The cell a block goes in for a hit (face snapping), or null. */
  cellFor(hit) {
    const w = this.w;
    const ax = hit.vx + hit.nx, ay = hit.vy + hit.ny, az = hit.vz + hit.nz;
    const c = [ax >> 3, ay >> 3, az >> 3];
    const h = [hit.vx >> 3, hit.vy >> 3, hit.vz >> 3];
    if (c[0] === h[0] && c[1] === h[1] && c[2] === h[2]) {
      // the face is inside a cell: a placed thing → the next cell out; rough rock → fill round it if there's room
      if (isBuilt(hit.m)) return [c[0] + hit.nx, c[1] + hit.ny, c[2] + hit.nz];
      let n = 0;
      for (let z = 0; z < BS; z++) for (let y = 0; y < BS; y++) for (let x = 0; x < BS; x++) if (free(w.voxelAt(c[0] * BS + x, c[1] * BS + y, c[2] * BS + z))) n++;
      if (n < 512 * 0.45) return [c[0] + hit.nx, c[1] + hit.ny, c[2] + hit.nz];
    }
    return c;
  }

  /** The player's facing as a DIRS index. */
  facing() { const f = this.player.forward(); return dirIndex(f.x, f.z); }

  /**
   * What the build slot would do at the crosshair: { ok, why, block, voxels: [{x,y,z,m}], cost,
   * kind, cells, fix?, door?, key } or null (nothing in reach).
   */
  planAt(hit) {
    if (!hit) return null;
    const b = this.block;
    const k = b.kind;
    let p;
    if (k === 'ladder') p = this.planLadder(hit, b);
    else if (k === 'torch' || k === 'lantern') p = this.planFixture(hit, b);
    else if (k === 'door') p = this.planDoor(hit, b);
    else p = this.planSolid(hit, b);
    if (!p) return null;
    p.block = b;
    if (p.ok) {
      const c = p.center;
      const Z = c && this.protectedAt(c[0], c[1], c[2], 0.3);
      if (Z) { p.ok = false; p.why = `Not here: ${Z.name}`; }
    }
    if (p.ok && !this.freeBuild() && this.st.count(b.item) < 1) { p.ok = false; p.why = `No ${ITEMS[b.item]?.name || b.id} left`; p.none = true; }
    if (p.ok && p.voxels.some((v) => !this.w.inBounds(v.x, v.y, v.z))) { p.ok = false; p.why = 'Too far out'; }
    return p;
  }

  planSolid(hit, b) {
    const w = this.w;
    const cell = this.cellFor(hit);
    if (!cell) return null;
    const [cx, cy, cz] = cell;
    let shape = b.kind === 'chest' ? 'chest' : b.kind === 'bench' ? 'bench' : this.shapeOf(b);
    const o = {};
    const hy = hit.y * VOX - cy * BS; // where on the cell's height the aim was (0..8)
    o.top = hit.ny < 0 || (hit.ny === 0 && hy >= 4 && hy < 8);
    o.dir = this.facing();
    const f = this.player.forward();
    o.axis = shape === 'pane' ? (Math.abs(f.x) > Math.abs(f.z) ? 'x' : 'z') : hit.ny ? 'y' : hit.nx ? 'x' : 'z';
    let m = b.m;
    if (b.axis) m = LOG_AXIS[shape === 'post' ? o.axis : (hit.ny ? 'y' : hit.nx ? 'x' : 'z')];
    if (shape === 'post' && (b.id === 'cobble' || b.id === 'stonebrick')) o.axis = 'y';
    const voxels = [];
    let want = 0, got = 0;
    for (let z = 0; z < BS; z++) for (let y = 0; y < BS; y++) for (let x = 0; x < BS; x++) {
      if (!shapeHas(shape, o, x, y, z)) continue;
      want++;
      const X = cx * BS + x, Y = cy * BS + y, Z = cz * BS + z;
      if (!free(w.voxelAt(X, Y, Z))) continue;
      got++;
      voxels.push({ x: X, y: Y, z: Z, m });
    }
    const center = [(cx + 0.5) * BS / VOX, (cy + 0.5) * BS / VOX, (cz + 0.5) * BS / VOX];
    const p = { ok: true, why: '', voxels, cost: 1, kind: 'solid', cells: [cell], center, key: `s:${cell}:${shape}:${o.top ? 1 : 0}:${o.dir}:${o.axis}:${m}:${got}` };
    const whole = b.kind === 'chest' || b.kind === 'bench';
    if (this.cellBuilt(cx, cy, cz)) { p.ok = false; p.why = 'Something is built there'; }
    else if (got < want * (whole ? 0.999 : 0.5)) { p.ok = false; p.why = whole ? 'Needs a clear spot' : 'Too much rock in the way'; }
    if (p.ok && whole && !OPAQUE[w.voxelAt(cx * BS + 4, cy * BS - 1, cz * BS + 4)]) { p.ok = false; p.why = 'Needs solid ground under it'; }
    if (p.ok) { const who = this.hitsBodies(cx * BS, cy * BS, cz * BS, cx * BS + BS, cy * BS + BS, cz * BS + BS); if (who && voxels.length) { p.ok = false; p.why = who === 'you' ? 'You\'re standing there' : `${this.st.data.chicken?.name || 'Nugget'} is in the way`; } }
    return p;
  }

  /** Ladder voxels for one cell against a wall in direction wd (DIRS vector toward the wall), or null. */
  ladderCell(cx, cy, cz, wd) {
    const w = this.w;
    const u = [Math.abs(wd[1]), Math.abs(wd[0])]; // across the wall (x or z)
    const out = [];
    let want = 0;
    for (let y = 0; y < BS; y++) for (let k = 1; k <= 6; k++) {
      const rail = k === 1 || k === 6;
      if (!rail && !(y & 1)) continue;
      want++;
      // march from the cell's open side toward the wall; the ladder sits on the last free voxel
      const bx = cx * BS + u[0] * k, bz = cz * BS + u[1] * k, Y = cy * BS + y;
      let at = null;
      for (let s = 0; s < BS; s++) {
        // s = 0 is the face away from the wall
        const t = wd[0] + wd[1] > 0 ? s : BS - 1 - s;
        const X = wd[0] ? cx * BS + t : bx, Z = wd[1] ? cz * BS + t : bz;
        const m = w.voxelAt(X, Y, Z);
        if (!free(m)) break;
        const nx = X + wd[0], nz = Z + wd[1];
        const mn = w.voxelAt(nx, Y, nz);
        if (!free(mn)) { if (OPAQUE[mn] && !FIX.has(mn) && !DOOR_MATS.has(mn) && mn !== M.LADDER) at = { x: X, y: Y, z: Z, m: M.LADDER }; break; }
      }
      if (at) out.push(at);
    }
    return out.length >= want * 0.6 ? out : null;
  }

  planLadder(hit, b) {
    if (hit.ny !== 0) return { ok: false, why: 'Ladders go on walls', voxels: [], cells: [], center: null, key: 'l:x' };
    const wd = [-hit.nx, -hit.nz];
    // the cell of the voxel in front of the face (rough rock may fill most of it: the ladder hugs it)
    const cell = [(hit.vx + hit.nx) >> 3, (hit.vy + hit.ny) >> 3, (hit.vz + hit.nz) >> 3];
    const [cx, cy, cz] = cell;
    const take = (c) => !this.cellBuilt(...c) && this.ladderCell(c[0], c[1], c[2], wd);
    const first = take(cell);
    if (!first) return { ok: false, why: 'No wall to lean it on', voxels: [], cells: [cell], center: [(cx + 0.5) / 2, (cy + 0.5) / 2, (cz + 0.5) / 2], key: `l:${cell}:none` };
    // a run: down to the floor, up to the top of the wall (8 blocks at most)
    const cells = [[cell, first]];
    for (let k = 1; k < 8; k++) { const c = [cx, cy - k, cz]; const v = take(c); if (!v) break; cells.unshift([c, v]); }
    for (let k = 1; cells.length < 8; k++) { const c = [cx, cy + k, cz]; const v = take(c); if (!v) break; cells.push([c, v]); }
    const n = Math.min(cells.length, this.have(b));
    const use = n > 0 ? cells.slice(0, Math.max(1, n)) : cells.slice(0, 1);
    const voxels = use.flatMap((c) => c[1]);
    const mid = use[use.length >> 1][0];
    const p = { ok: true, why: '', voxels, cost: use.length, kind: 'ladder', cells: use.map((c) => c[0]), center: [(mid[0] + 0.5) / 2, (mid[1] + 0.5) / 2, (mid[2] + 0.5) / 2], key: `l:${use.map((c) => c[0].join(',')).join('|')}:${voxels.length}` };
    const lo = use[0][0], hi = use[use.length - 1][0];
    const who = this.hitsBodies(lo[0] * BS, lo[1] * BS, lo[2] * BS, lo[0] * BS + BS, hi[1] * BS + BS, lo[2] * BS + BS);
    // a ladder is thin: only refuse when the mole stands right where its rungs go
    if (who === 'Nugget') { p.ok = false; p.why = 'Nugget is in the way'; }
    else if (who === 'you') {
      const pl = this.player.pos, hits = voxels.some((v) => (v.x + 1) / VOX > pl.x - 0.22 && v.x / VOX < pl.x + 0.22 && (v.z + 1) / VOX > pl.z - 0.22 && v.z / VOX < pl.z + 0.22 && (v.y + 1) / VOX > pl.y && v.y / VOX < pl.y + 0.86);
      if (hits) { p.ok = false; p.why = 'Step back from the wall'; }
    }
    return p;
  }

  planFixture(hit, b) {
    const w = this.w;
    const ax = hit.vx + hit.nx, ay = hit.vy + hit.ny, az = hit.vz + hit.nz;
    const center = [(ax + 0.5) / VOX, (ay + 0.5) / VOX, (az + 0.5) / VOX];
    const p = { ok: true, why: '', voxels: [{ x: ax, y: ay, z: az, m: b.m }], cost: 1, kind: b.kind, cells: [], center, key: `f:${ax},${ay},${az}:${hit.nx},${hit.ny},${hit.nz}`, fix: { x: ax, y: ay, z: az, n: [hit.nx, hit.ny, hit.nz] } };
    if (b.kind === 'torch' && hit.ny < 0) { p.ok = false; p.why = 'Torches go on walls and floors'; }
    else if (!free(w.voxelAt(ax, ay, az))) { p.ok = false; p.why = 'No room'; }
    else if (!OPAQUE[w.voxelAt(hit.vx, hit.vy, hit.vz)] || DOOR_MATS.has(hit.m) || FIX.has(hit.m) || hit.m === M.LADDER || hit.m === BM.B_GLASS) { p.ok = false; p.why = 'Nothing to fix it to'; }
    else if (b.kind === 'lantern' && hit.ny < 0 && !free(w.voxelAt(ax, ay - 4, az))) { p.ok = false; p.why = 'Too low to hang'; }
    return p;
  }

  planDoor(hit, b) {
    const w = this.w;
    if (hit.ny < 0) return { ok: false, why: 'Doors stand on the floor', voxels: [], cells: [], center: null, key: 'd:x' };
    let cell = this.cellFor(hit);
    // standing on the floor: drop to the lowest open cell (at most one)
    if (hit.ny === 0) { const below = [cell[0], cell[1] - 1, cell[2]]; if (free(w.voxelAt(below[0] * BS + 4, below[1] * BS + 4, below[2] * BS + 4)) && free(w.voxelAt(below[0] * BS + 4, below[1] * BS, below[2] * BS + 4))) cell = below; }
    const [cx, cy, cz] = cell;
    const fi = this.facing(), f = DIRS[fi], right = rotCW(f);
    const X0 = cx * BS, Y0 = cy * BS, Z0 = cz * BS;
    // the leaf's layer: the cell face toward the mole
    const layer = f[0] ? (f[0] > 0 ? X0 : X0 + BS - 1) : (f[1] > 0 ? Z0 : Z0 + BS - 1);
    // along `right`: the opening spans U0..U0+7; the hinge sits just outside one end
    const U0 = right[0] ? X0 : Z0;
    const ends = [
      { u: right[0] + right[1] > 0 ? U0 - 1 : U0 + BS, dir: right, hm: BM.B_DOOR_CW }, // hinge on the left
      { u: right[0] + right[1] > 0 ? U0 + BS : U0 - 1, dir: [-right[0], -right[1]], hm: BM.B_DOOR_CCW }, // on the right
    ];
    const at = (e, y) => (right[0] ? [e.u, y, layer] : [layer, y, e.u]);
    const wall = (e) => !!OPAQUE[w.voxelAt(...at(e, Y0 + 4))];
    const pick = wall(ends[0]) ? ends[0] : wall(ends[1]) ? ends[1] : ends[0];
    const h = at(pick, Y0);
    const vox = doorVoxels(h[0], h[1], h[2], pick.dir, pick.hm);
    const center = [(X0 + 4) / VOX, (Y0 + 8) / VOX, (Z0 + 4) / VOX];
    const p = { ok: true, why: '', voxels: vox, cost: 1, kind: 'door', cells: [cell, [cx, cy + 1, cz]], center, key: `d:${h}:${pick.dir}`, door: { hinge: h, dir: pick.dir, hm: pick.hm, f } };
    for (const v of vox) {
      const m = w.voxelAt(v.x, v.y, v.z);
      if (v.m === BM.B_DOOR ? !free(m) : (m >= ORE_BASE || MAT[m]?.unbreakable || MAT[m]?.ward || FIX.has(m) || DOOR_MATS.has(m) || m === M.LADDER || (isBuilt(m) && familyOf(m)?.kind !== 'solid'))) { p.ok = false; p.why = 'A door needs a clear doorway 1 block wide and 2 high'; break; }
    }
    if (p.ok && !OPAQUE[w.voxelAt(right[0] ? U0 + 4 : layer, Y0 - 1, right[0] ? layer : U0 + 4)]) { p.ok = false; p.why = 'A door needs a floor'; }
    if (p.ok && this.hitsBodies(Math.min(...vox.map((v) => v.x)), Y0, Math.min(...vox.map((v) => v.z)), Math.max(...vox.map((v) => v.x)) + 1, Y0 + 16, Math.max(...vox.map((v) => v.z)) + 1)) { p.ok = false; p.why = 'Step out of the doorway'; }
    return p;
  }

  // ------------------------------------------------------------------ placing
  /** The build slot's click: use a door, chest or bench under the crosshair, else put the block down. */
  place() {
    const o = this.owner;
    const eye = this.player.eye(), f = this.player.forward();
    const u = this.useTarget(eye, f, o.reach?.() ?? REACH);
    if (u) { this.useIt(u); return true; }
    const p = this.planAt(o.target);
    if (!p) { this.audio.play('ui_error', { vol: 0.4 }); return false; }
    if (!p.ok) {
      this.audio.play('ui_error', { vol: 0.5 });
      if (p.none) this.noteNone(p.block);
      else this.note('why:' + p.why, p.why, 3);
      return false;
    }
    return this.commit(p);
  }

  /** Put a planned placement into the world (place() after its checks; demo/test hooks). */
  commit(p) {
    const w = this.w, b = p.block;
    for (const v of p.voxels) w.setVoxel(v.x, v.y, v.z, v.m);
    if (!this.freeBuild()) this.st.removeItem(b.item, p.cost);
    if (b.kind === 'chest') this.data.chests[this.chestKey(p.cells[0])] ||= { slots: [] };
    if (FIX.has(b.m)) this.addFixture(p.fix.x, p.fix.y, p.fix.z, b.m);
    // feel: a thud, dust in its colours, the paw pushes it in
    const [x, y, z] = p.center;
    const T = blockColors(b.m).map((c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]);
    this.fx.dust(x, y - 0.1, z, 6, T[2], 0.12);
    this.audio.play('place');
    this.audio.play('hit', { snd: b.snd === 'ice' ? 'crystal' : b.snd, vol: 0.45 });
    this.owner.vm?.swing?.('stake', 0.1);
    this.owner.energy?.(0.15);
    this.st.emit('act', { type: 'build', id: b.id, item: b.item, shape: p.kind === 'solid' ? this.shapeOf(b) : b.kind, n: p.cost });
    this.planKey = null;
    this.owner.updateHotbar?.();
    if (!this.data.placed) { this.data.placed = 1; this.note('first', `Placed! Break it again with your <b>pick</b> (slot 1): it comes back to your pack. ${this.owner.isTouch?.() ? 'Tap the build slot again' : '<b>R</b>'} for other blocks.`, 99, 'good'); }
    return true;
  }

  noteNone(b) {
    const it = ITEMS[b.item];
    const how = { blk_cobble: 'Dig stone to keep some', blk_dirt: 'Dig soil to keep some', blk_log: 'Dig roots or old timber', blk_planks: 'Saw logs into planks (Craft)', blk_torch: 'Craft them: a stick and coal', blk_ladder: 'Craft them at a workbench', blk_stonebrick: 'Dress cobble at a workbench', blk_glass: 'Melt sand at a workbench', blk_bricks: 'Fire clay at a workbench', blk_door: 'Make one at a workbench', blk_chest: 'Make one at a workbench', blk_lantern: 'A torch in iron, at a workbench', blk_workbench: 'Four planks (Craft)' }[b.item] || 'Craft or buy some';
    this.note('none:' + b.id, `No <b>${it?.name || b.id}</b> left. ${how}.`, 4);
  }

  note(key, html, cd = 4, kind = 'warn') {
    if (this.notes[key] && this.time - this.notes[key] < cd) return;
    this.notes[key] = this.time;
    this.ui.toast?.(html, { kind, icon: iconURL(this.block.item) });
  }

  // ------------------------------------------------------------------ doors, chests, workbenches
  /** A placed thing E would use under the crosshair: { kind: 'door'|'chest'|'bench', unit, label } or null. */
  useTarget(eye, dir, reach = REACH) {
    const hit = this.w.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, reach + 0.05);
    if (!hit) return null;
    const b = familyOf(hit.m);
    if (!b || !(b.kind === 'door' || b.kind === 'chest' || b.kind === 'bench')) return null;
    const unit = unitOf(this.w, hit.vx, hit.vy, hit.vz);
    if (!unit) return null;
    const label = b.kind === 'door' ? (this.doorOpen(unit) ? 'Shut the door' : 'Open the door') : b.kind === 'chest' ? 'Open the chest' : 'Workbench: craft';
    return { kind: b.kind, unit, label, hit };
  }
  doorKey(h) { return `${this.seed}:${h[0]},${h[1]},${h[2]}`; }
  doorOpen(unit) { return !!(unit.door && this.data.doors[this.doorKey(unit.door.hinge)]); }
  /** DigScene's crosshair chain (optional hook). */
  target(eye, dir, reach) {
    const u = this.useTarget(eye, dir, reach);
    return u ? { label: u.label, kind: 'use' } : null;
  }
  /** E: DigScene's interact chain (optional hook) → events or null. */
  use(eye, dir, reach, self = false) {
    if (!self) this.leadUse = true;
    const u = this.useTarget(eye, dir, reach);
    if (!u) return null;
    this.useIt(u);
    return [];
  }
  useIt(u) {
    if (u.kind === 'door') this.toggleDoor(u.unit);
    else if (u.kind === 'chest') this.openChest(u.unit);
    else this.openPicker('craft', { bench: true });
    this.owner.vm?.impact?.('none', 0.3);
  }

  toggleDoor(unit) {
    const w = this.w, d = unit.door || readDoor(w, unit.voxels[0].x, unit.voxels[0].y, unit.voxels[0].z);
    if (!d) return false;
    const [hx, hy, hz] = d.hinge;
    // the hinge's material is its hand: CW doors swing clockwise to open (seen from above), back to shut
    const key = this.doorKey(d.hinge), open = !!this.data.doors[key];
    const cw = (d.hingeM === BM.B_DOOR_CW) !== open;
    const nd = cw ? rotCW(d.dir) : rotCCW(d.dir);
    const next = doorVoxels(hx, hy, hz, nd, d.hingeM);
    for (const v of next) if (v.m === BM.B_DOOR && !free(w.voxelAt(v.x, v.y, v.z))) { this.audio.play('thud', { vol: 0.5 }); this.note('doorblock', 'The door is blocked.', 2); return false; }
    // the mole standing where the leaf swings?
    const xs = next.map((v) => v.x), zs = next.map((v) => v.z);
    if (this.hitsBodies(Math.min(...xs), hy, Math.min(...zs), Math.max(...xs) + 1, hy + 16, Math.max(...zs) + 1)) { this.note('doorbody', 'Step back to swing the door.', 2); this.audio.play('thud', { vol: 0.4 }); return false; }
    for (let k = 1; k <= BS; k++) for (let y = 0; y < 16; y++) w.setVoxel(hx + d.dir[0] * k, hy + y, hz + d.dir[1] * k, 0);
    for (const v of next) w.setVoxel(v.x, v.y, v.z, v.m);
    if (open) delete this.data.doors[key]; else this.data.doors[key] = 1;
    this.audio.play('door');
    this.audio.play('creak', { vol: 0.5 });
    this.fx.dust(hx / VOX + nd[0] * 0.25, (hy + 1) / VOX, hz / VOX + nd[1] * 0.25, 4, [0.5, 0.42, 0.34], 0.1);
    return true;
  }

  chestKey(cell) { return `${this.seed}:${cell[0]},${cell[1]},${cell[2]}`; }
  openChest(unit) {
    const key = this.chestKey(unit.cell);
    const c = (this.data.chests[key] ||= { slots: [] });
    this.audio.play('door', { vol: 0.6 });
    import('./build/picker.js').then((m) => m.openChest(this, c, key)).catch((e) => console.warn('chest panel', e));
  }
  openPicker(tab = 'blocks', o = {}) {
    if (this.ui.isPanelOpen?.()) return;
    const bench = o.bench ?? this.benchNear();
    return import('./build/picker.js').then((m) => m.openPicker(this, { tab, bench })).catch((e) => console.warn('build picker', e));
  }
  /** A workbench within reach? */
  benchNear(r = 3) {
    const w = this.w, p = this.player.pos;
    const R = Math.ceil(r * VOX);
    const x0 = Math.floor(p.x * VOX), y0 = Math.floor((p.y + 0.4) * VOX), z0 = Math.floor(p.z * VOX);
    for (let z = -R; z <= R; z += 2) for (let y = -12; y <= 12; y += 2) for (let x = -R; x <= R; x += 2) if (w.voxelAt(x0 + x, y0 + y, z0 + z) === BM.B_BENCH) return true;
    return false;
  }

  /** A chest's cell lost its chest (a blast): what was in it goes to the pack (or home). */
  spillChest(key, at) {
    const c = this.data.chests[key];
    delete this.data.chests[key];
    if (!c?.slots?.some(Boolean)) return 0;
    let n = 0;
    for (const s of c.slots) {
      if (!s) continue;
      if (s.w) { Inv.addWeaponToBag(this.st, s.w); n++; continue; }
      if (s.lots) for (const l of s.lots) { this.st.addItem(s.id, { q: l.q, p: l.p, spill: true }); n++; }
      else { this.st.addItem(s.id, { n: s.n, spill: true }); n += s.n; }
    }
    this.ui.toast?.(`The chest's things (<b>${n}</b>) go into your pack${at ? '' : ': the chest is gone'} (what doesn't fit waits at home).`, { kind: 'good', icon: iconURL('blk_chest') });
    return n;
  }
  /** Chests whose blocks are gone from the saved world (another save's world, a lost edit): give their things back. */
  checkChests() {
    const pre = this.seed + ':';
    for (const key of Object.keys(this.data.chests)) {
      if (!key.startsWith(pre)) continue;
      const [cx, cy, cz] = key.slice(pre.length).split(',').map(Number);
      let found = false;
      for (let y = 0; y < BS && !found; y++) {
        const vx = cx * BS + 3, vy = cy * BS + y, vz = cz * BS + 3;
        const ed = this.w.edits.get(key3(vx >> CB, vy >> CB, vz >> CB));
        const i = (vx & (CS - 1)) + CS * ((vy & (CS - 1)) + CS * (vz & (CS - 1)));
        if (ed?.get(i) === BM.B_CHEST) found = true;
      }
      if (!found) this.spillChest(key);
    }
  }

  // ------------------------------------------------------------------ breaking (Dig.js → onBuilt)
  onBuilt(info) {
    const { unit } = info;
    const b = unit.block;
    const vs = unit.voxels;
    let x = 0, y = 0, z = 0;
    for (const v of vs) { x += v.x + 0.5; y += v.y + 0.5; z += v.z + 0.5; }
    x /= vs.length * VOX; y /= vs.length * VOX; z /= vs.length * VOX;
    this.audio.play('break', { snd: b.snd === 'ice' ? 'ice' : b.snd, vol: 0.8 });
    const T = blockColors(b.m).map((c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]);
    this.fx.dust(x, y, z, 10, T[1], 0.22);
    const out = [this.player.eye().x - x, 0.6, this.player.eye().z - z];
    this.fx.chips(x, y, z, 10, T[2], out);
    if (b.kind === 'door' && unit.door) { this.restoreHinge(unit.door); delete this.data.doors[this.doorKey(unit.door.hinge)]; }
    if (b.kind === 'chest' && unit.cell) this.spillChest(this.chestKey(unit.cell), true);
    for (const v of vs) if (FIX.has(v.m)) this.removeFixture(v.x, v.y, v.z);
    if (info.worth > 0) this.pop(b.item, info.worth, x, y, z, b);
    this.owner.hitStop = Math.max(this.owner.hitStop || 0, 0.04);
    this.st.emit('act', { type: 'unbuild', id: b.id, item: b.item });
  }
  /** Put back the doorframe the hinge column replaced (from the voxel beyond it). */
  restoreHinge(d) {
    const w = this.w, [hx, hy, hz] = d.hinge;
    const bx = hx - d.dir[0], bz = hz - d.dir[1];
    for (let y = 0; y < 16; y++) {
      const m = w.voxelAt(bx, hy + y, bz);
      if (OPAQUE[m] && !FIX.has(m) && !DOOR_MATS.has(m) && m < ORE_BASE && free(w.voxelAt(hx, hy + y, hz))) w.setVoxel(hx, hy + y, hz, m);
    }
  }

  /** An item pops out of a broken block and flies to the mole. */
  pop(id, n, x, y, z, b) {
    let mesh;
    if (b && (b.kind === 'solid' || b.kind === 'chest' || b.kind === 'bench')) {
      mesh = new THREE.Mesh(miniBlockGeo(b.m), this.objMat);
      mesh.layers.enable(LAYER_OUTLINE);
    } else {
      this.popTex ||= {};
      const tex = (this.popTex[id] ||= pixelTexture(iconCanvas(id)));
      mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: true }));
      mesh.scale.setScalar(0.16);
    }
    mesh.position.set(x, y, z);
    this.root.add(mesh);
    this.pops.push({ mesh, id, n, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(rnd(-0.6, 0.6), 2.2, rnd(-0.6, 0.6)), t: 0, spin: rnd(3, 6) });
  }
  updatePops(dt) {
    const eye = this.player.eye();
    for (const p of [...this.pops]) {
      p.t += dt;
      if (p.t < 0.35) { p.vel.y -= 9 * dt; p.pos.addScaledVector(p.vel, dt); }
      else {
        const d = new THREE.Vector3().subVectors(eye, p.pos); d.y -= 0.35;
        const dist = d.length();
        if (dist < 0.28 || p.t > 2.5) { this.collectPop(p); continue; }
        p.vel.lerp(d.multiplyScalar(Math.min(9, 3 + p.t * 5) / dist), Math.min(1, dt * 7));
        p.pos.addScaledVector(p.vel, dt);
        p.mesh.scale.multiplyScalar(1 - dt * 0.6);
      }
      p.mesh.position.copy(p.pos);
      if (p.mesh.isMesh) { p.mesh.rotation.y += p.spin * dt; p.mesh.rotation.x += p.spin * 0.4 * dt; }
    }
  }
  collectPop(p) {
    this.root.remove(p.mesh);
    if (p.mesh.isSprite) p.mesh.material.dispose();
    this.pops.splice(this.pops.indexOf(p), 1);
    this.give(p.id, p.n);
  }
  /** Into the pack; what doesn't fit (or is too heavy) waits in the trunk at home. */
  give(id, n = 1) {
    const st = this.st, it = ITEMS[id];
    const ok = st.canAdd(id, n) && (st.canLift?.(id, n) ?? true);
    st.addItem(id, { n, spill: true });
    if (!ok) this.note('full:' + id, `No room in your pack: the <b>${it?.name || id}</b> waits in the trunk at home.`, 6);
    this.audio.play('pickup', { pitch: 1.1 + Math.random() * 0.2, vol: 0.6 });
    this.floatNote(`+${n} ${it?.name || id}`);
    this.owner.updateHotbar?.();
    this.owner.showBag?.();
  }
  floatNote(text, color = '#f6e6c0') {
    const W = window.innerWidth, H = window.innerHeight;
    this.floatK = ((this.floatK || 0) + 1) % 3;
    this.ui.floatText?.(text, W / 2 + (this.floatK - 1) * 22, H / 2 + 46, color, 0.9);
  }

  // ------------------------------------------------------------------ gathering what you dig
  gather(a) {
    if (!this.data.gather || !this.st.flag?.('prologue')) return;
    const y = yieldOf(a.mat, this.kit?.kind || 'pick');
    if (!y) return;
    const rule = toolRule(a.mat, this.kit?.kind || 'pick');
    if (!rule.keep) return;
    const [id, rate] = y;
    this.credit[id] = (this.credit[id] || 0) + (a.n || 0) * rate / 512;
    if (this.credit[id] < 1) return;
    const k = Math.floor(this.credit[id]);
    this.credit[id] -= k;
    if (!this.roomToGather(id, k)) { this.credit[id] = 0; return; }
    this.st.addItem(id, { n: k });
    this.audio.play('pickup', { pitch: 0.8 + Math.random() * 0.2, vol: 0.35 });
    this.floatNote(`+${k} ${ITEMS[id]?.name || id}`, '#e8d8b0');
    if (this.owner.slotName === 'build' || this.block.item === id) this.owner.updateHotbar?.();
    if (!this.data.gathered) { this.data.gathered = 1; this.note('gather', `You keep a <b>${ITEMS[id]?.name}</b> now and then as you dig: blocks to build with. (Turn it off in the build picker.)`, 99, 'good'); }
  }
  /** Gathering never fills your last free pocket or makes the pack heavy. */
  roomToGather(id, k) {
    const st = this.st, slots = Inv.bag(st), cap = Inv.bagSlots(st);
    const f = Inv.bagFill(st);
    const room = Inv.roomFor(slots, id, cap);
    const partial = room - f.free * Inv.stackMax(id);
    if (partial < k && f.free < 2) return false;
    if (room < k) return false;
    const L = st.bagLoad?.();
    if (L && (L.kg + kgOf(id) * k) / Math.max(1, L.carry) > 0.95) return false;
    return true;
  }

  // ------------------------------------------------------------------ torches and lanterns
  scanEdits() {
    for (const [ck, ed] of this.w.edits) {
      const cz = (ck % 1024) - 512, cy = (Math.floor(ck / 1024) % 1024) - 512, cx = Math.floor(ck / 1048576) - 512;
      for (const [i, m] of ed) {
        if (!FIX.has(m) && m !== BM.B_GLASS) continue;
        const x = cx * CS + (i & 31), y = cy * CS + ((i >> 5) & 31), z = cz * CS + (i >> 10);
        if (m === BM.B_GLASS) this.glass.add(x + ',' + y + ',' + z);
        else this.addFixture(x, y, z, m);
      }
    }
  }
  /** Which way a fixture hangs: the solid neighbour it is fixed to (down first, then walls, then up). */
  supportOf(x, y, z, m) {
    const w = this.w;
    const order = m === BM.B_LANTERN ? [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] : [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    for (const d of order) { const n = w.voxelAt(x + d[0], y + d[1], z + d[2]); if (OPAQUE[n] && !FIX.has(n)) return d; }
    return null;
  }
  addFixture(x, y, z, m) {
    const k = x + ',' + y + ',' + z;
    if (this.fixtures.has(k)) return this.fixtures.get(k);
    const b = familyOf(m);
    const L = { x: (x + 0.5) / VOX, y: (y + 0.5) / VOX + 0.25, z: (z + 0.5) / VOX, c: b.light.c.slice(), r: b.light.r, lantern: true, build: k };
    this.plan.lights.push(L);
    const fx = { k, x, y, z, m, light: L, group: null, flame: null, phase: Math.random() * 10, built: false };
    this.fixtures.set(k, fx);
    return fx;
  }
  removeFixture(x, y, z) {
    const k = x + ',' + y + ',' + z, f = this.fixtures.get(k);
    if (!f) return;
    this.fixtures.delete(k);
    const i = this.plan.lights.indexOf(f.light);
    if (i >= 0) this.plan.lights.splice(i, 1);
    if (f.group) this.root.remove(f.group);
  }
  /** Build a fixture's model once its chunk is here (it needs its neighbours to know which way it hangs). */
  dressFixture(f) {
    const ch = this.w.chunk(f.x >> CB, f.y >> CB, f.z >> CB);
    if (!ch || !ch.vox) return;
    f.built = true;
    const sup = this.supportOf(f.x, f.y, f.z, f.m) || [0, -1, 0];
    f.sup = sup;
    const g = new THREE.Group();
    const cx = (f.x + 0.5) / VOX, cy = (f.y + 0.5) / VOX, cz = (f.z + 0.5) / VOX;
    const H = 0.5 / VOX;
    if (f.m === BM.B_TORCH) {
      const t = torchModel();
      const body = new THREE.Mesh(t.body, this.objMat), flame = new THREE.Mesh(t.flame, this.glowMat);
      body.layers.enable(LAYER_OUTLINE);
      const inner = new THREE.Group();
      inner.add(body, flame);
      g.add(inner);
      if (sup[1] < 0) { g.position.set(cx, cy - H + 1 / VOX, cz); }
      else {
        // on a wall: the foot at the bracket, leaning out of the wall
        g.position.set(cx + sup[0] * H * 0.6, cy - H * 0.6, cz + sup[2] * H * 0.6);
        g.rotation.y = Math.atan2(-sup[0], -sup[2]);
        inner.rotation.x = 0.42;
      }
      f.flame = flame;
      g.updateMatrixWorld(true);
      const top = flame.localToWorld(t.top.clone());
      f.light.x = top.x; f.light.y = top.y + 0.05; f.light.z = top.z;
      f.top = top;
    } else {
      let lm;
      if (sup[1] > 0) { lm = lanternModel('hang'); g.position.set(cx, cy + H, cz); }
      else if (sup[1] < 0) { lm = lanternModel('stand'); g.position.set(cx, cy - H, cz); }
      else {
        // on a wall: an iron arm out of it, the lantern hanging from its end
        lm = lanternModel('hang');
        const arm = new THREE.Mesh(bracketModel(), this.objMat);
        arm.layers.enable(LAYER_OUTLINE);
        const yaw = Math.atan2(-sup[0], -sup[2]);
        const holder = new THREE.Group();
        holder.position.set(cx + sup[0] * H, cy - 0.06, cz + sup[2] * H);
        holder.rotation.y = yaw;
        holder.add(arm);
        g.add(holder);
        const k = LANTERN_S * 1.15; // the bracket's own voxel size: its arm's end is at (y 5, z 7.5)
        const tip = new THREE.Vector3(0, 5 * k, 7.5 * k).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        g.userData.lanternAt = new THREE.Vector3(holder.position.x + tip.x, holder.position.y + tip.y, holder.position.z + tip.z);
      }
      const body = new THREE.Mesh(lm.body, this.objMat), glow = new THREE.Mesh(lm.glow, this.glowMat);
      body.layers.enable(LAYER_OUTLINE);
      const lg = new THREE.Group();
      lg.add(body, glow);
      if (g.userData.lanternAt) { lg.position.copy(g.userData.lanternAt); g.add(lg); g.position.set(0, 0, 0); }
      else g.add(lg);
      f.flame = glow;
      g.updateMatrixWorld(true);
      const lp = lg.localToWorld(lm.light.clone());
      f.light.x = lp.x; f.light.y = lp.y; f.light.z = lp.z;
      f.top = lp;
      f.swing = lg;
    }
    f.group = g;
    this.root.add(g);
  }
  updateFixtures(dt) {
    const eye = this.player.eye();
    let n = 0;
    for (const f of this.fixtures.values()) {
      const d2 = (f.x / VOX - eye.x) ** 2 + (f.y / VOX - eye.y) ** 2 + (f.z / VOX - eye.z) ** 2;
      if (!f.built) { if (d2 < 30 * 30 && n++ < 6) this.dressFixture(f); continue; }
      const vis = d2 < 34 * 34;
      if (f.group) f.group.visible = vis;
      if (!vis) continue;
      const t = this.time + f.phase;
      if (f.m === BM.B_TORCH && f.flame) {
        const k = 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 29) * 0.06;
        f.flame.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k));
        // now and then a spark lifts off the flame
        if (d2 < 12 * 12 && Math.random() < dt * 1.5 && f.top) this.fx.spawn?.({ x: f.top.x + rnd(-0.015, 0.015), y: f.top.y + 0.05, z: f.top.z + rnd(-0.015, 0.015), vx: rnd(-0.08, 0.08), vy: rnd(0.25, 0.5), vz: rnd(-0.08, 0.08), life: rnd(0.35, 0.7), size: rnd(0.006, 0.01), color: Math.random() < 0.5 ? [1, 0.55, 0.15] : [1, 0.82, 0.4], glow: true, drag: 0.6, grav: -0.15 });
      } else if (f.swing && f.sup && f.sup[1] >= 0) {
        f.swing.rotation.z = Math.sin(t * 1.3) * 0.04;
        f.swing.rotation.x = Math.sin(t * 0.9) * 0.03;
      }
    }
  }

  // ------------------------------------------------------------------ voxels changing under us
  hook() {
    const w = this.w;
    if (w.onChange === this.hookFn) return;
    const prev = w.onChange;
    this.hookFn = (vx, vy, vz, old, m) => { if (prev) prev(vx, vy, vz, old, m); this.onVoxel(vx, vy, vz, old, m); };
    w.onChange = this.hookFn;
  }
  onVoxel(vx, vy, vz, old, m) {
    if (old === m) return;
    if (FIX.has(old) && !FIX.has(m)) this.removeFixture(vx, vy, vz);
    if (FIX.has(m) && !FIX.has(old)) this.addFixture(vx, vy, vz, m);
    if (old === BM.B_GLASS || m === BM.B_GLASS) {
      const k = vx + ',' + vy + ',' + vz;
      if (m === BM.B_GLASS) this.glass.add(k); else this.glass.delete(k);
      this.glassDirty = true;
    } else if (this.glass.size && (OPAQUE[old] === 1) !== (OPAQUE[m] === 1)) {
      for (const [dx, dy, dz] of N6) if (this.glass.has((vx + dx) + ',' + (vy + dy) + ',' + (vz + dz))) { this.glassDirty = true; break; }
    }
    // something lost its support: a torch or lantern on it falls
    if (OPAQUE[old] && !OPAQUE[m]) {
      for (const [dx, dy, dz] of N6) {
        const f = this.fixtures.get((vx + dx) + ',' + (vy + dy) + ',' + (vz + dz));
        if (f && !this.supportOf(f.x, f.y, f.z, f.m)) (this.drops ||= []).push(f);
      }
    }
    if (old === BM.B_CHEST && m !== BM.B_CHEST) (this.chestCheck ||= new Set()).add(`${vx >> 3},${vy >> 3},${vz >> 3}`);
  }
  /** Deferred: fixtures that fell, chests that were blown away. */
  settle() {
    if (this.drops?.length) {
      for (const f of this.drops.splice(0)) {
        if (!this.fixtures.has(f.k) || this.supportOf(f.x, f.y, f.z, f.m)) continue;
        this.w.setVoxel(f.x, f.y, f.z, 0);
        this.pop(f.m === BM.B_TORCH ? 'blk_torch' : 'blk_lantern', 1, (f.x + 0.5) / VOX, (f.y + 0.5) / VOX, (f.z + 0.5) / VOX, familyOf(f.m));
      }
    }
    if (this.chestCheck?.size) {
      for (const c of this.chestCheck) {
        const [cx, cy, cz] = c.split(',').map(Number);
        let left = 0;
        for (let z = 1; z < 7; z++) for (let y = 0; y < 6; y++) for (let x = 1; x < 7; x++) if (this.w.voxelAt(cx * BS + x, cy * BS + y, cz * BS + z) === BM.B_CHEST) left++;
        if (!left) this.spillChest(this.chestKey([cx, cy, cz]));
      }
      this.chestCheck.clear();
    }
  }

  // ------------------------------------------------------------------ glass: draw what the mesher hid behind it
  rebuildGlass() {
    this.glassDirty = false;
    this.glassRetry = false;
    if (this.glassMesh) { this.root.remove(this.glassMesh); this.glassMesh.geometry.dispose(); this.glassMesh = null; }
    if (!this.glass.size) return;
    const w = this.w, eye = this.player.eye();
    const pos = [], dat = [], idx = [];
    // tangent axes so that a × b = the face normal (counter-clockwise seen from the glass)
    const AB = { 0: [[0, 1, 0], [0, 0, 1]], 1: [[0, 0, 1], [0, 1, 0]], 2: [[0, 0, 1], [1, 0, 0]], 3: [[1, 0, 0], [0, 0, 1]], 4: [[1, 0, 0], [0, 1, 0]], 5: [[0, 1, 0], [1, 0, 0]] };
    for (const k of this.glass) {
      const [gx, gy, gz] = k.split(',').map(Number);
      if (Math.abs(gx / VOX - eye.x) > 26 || Math.abs(gy / VOX - eye.y) > 26 || Math.abs(gz / VOX - eye.z) > 26) continue;
      if (w.voxelAt(gx, gy, gz) !== BM.B_GLASS) { const ch = w.chunk(gx >> CB, gy >> CB, gz >> CB); if (!ch || !ch.vox) this.glassRetry = true; continue; }
      for (const [dx, dy, dz] of N6) {
        const nx = gx + dx, ny = gy + dy, nz = gz + dz;
        const m = w.voxelAt(nx, ny, nz);
        if (!OPAQUE[m] || m === BM.B_GLASS) continue;
        // the neighbour's face toward the glass
        const f = FACE_OF(-dx, -dy, -dz);
        const [a, b] = AB[f];
        const ox = nx + (-dx > 0 ? 1 : 0), oy = ny + (-dy > 0 ? 1 : 0), oz = nz + (-dz > 0 ? 1 : 0);
        const v0 = pos.length / 3;
        pos.push(ox, oy, oz, ox + a[0], oy + a[1], oz + a[2], ox + a[0] + b[0], oy + a[1] + b[1], oz + a[2] + b[2], ox + b[0], oy + b[1], oz + b[2]);
        for (let i = 0; i < 4; i++) dat.push(f, m, 3, 0);
        idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
      }
    }
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('vdata', new THREE.Uint8BufferAttribute(dat, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.owner.terrain.mat);
    mesh.scale.setScalar(1 / VOX);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.glassMesh = mesh;
    this.root.add(mesh);
    this.glassAt = eye.clone();
  }

  // ------------------------------------------------------------------ ghost, outline, cracks
  makeHelpers() {
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x8aff8a, vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false });
    this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMat);
    this.ghost.renderOrder = 15;
    this.ghost.visible = false;
    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.ghostBox = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: 0xd8ffd0, transparent: true, opacity: 0.55, depthWrite: false }));
    this.ghostBox.renderOrder = 16;
    this.ghostBox.visible = false;
    this.outline = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: 0x120a06, transparent: true, opacity: 0.7, depthWrite: false }));
    this.outline.renderOrder = 16;
    this.outline.visible = false;
    this.crackMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: 0.85 });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.crackMat);
    this.crack.renderOrder = 14;
    this.crack.visible = false;
    this.root.add(this.ghost, this.ghostBox, this.outline, this.crack);
  }
  bboxOf(voxels) {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const v of voxels) { x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); z0 = Math.min(z0, v.z); x1 = Math.max(x1, v.x + 1); y1 = Math.max(y1, v.y + 1); z1 = Math.max(z1, v.z + 1); }
    return [x0, y0, z0, x1, y1, z1];
  }
  placeBox(obj, bb, pad = 0.004) {
    obj.position.set((bb[0] + bb[3]) / 2 / VOX, (bb[1] + bb[4]) / 2 / VOX, (bb[2] + bb[5]) / 2 / VOX);
    obj.scale.set((bb[3] - bb[0]) / VOX + pad, (bb[4] - bb[1]) / VOX + pad, (bb[5] - bb[2]) / VOX + pad);
  }
  showGhost(p) {
    const on = !!p && (p.voxels.length > 0);
    this.ghost.visible = on;
    this.ghostBox.visible = on && p.kind !== 'torch' && p.kind !== 'lantern';
    if (!on) return;
    if (p.key !== this.ghostKey) {
      this.ghostKey = p.key;
      this.ghost.geometry.dispose();
      if (p.kind === 'torch' || p.kind === 'lantern') {
        const fx = p.fix;
        let geo;
        if (p.kind === 'torch') geo = torchModel().body.clone();
        else geo = lanternModel(fx.n[1] > 0 ? 'stand' : 'hang').body.clone();
        const H = 0.5 / VOX;
        const m4 = new THREE.Matrix4();
        const cx = (fx.x + 0.5) / VOX, cy = (fx.y + 0.5) / VOX, cz = (fx.z + 0.5) / VOX;
        if (p.kind === 'torch' && fx.n[1] === 0) {
          m4.makeRotationY(Math.atan2(fx.n[0], fx.n[2])).multiply(new THREE.Matrix4().makeRotationX(0.42));
          geo.applyMatrix4(m4);
          geo.translate(cx - fx.n[0] * H * 0.6, cy - H * 0.6, cz - fx.n[2] * H * 0.6);
        } else if (p.kind === 'lantern' && fx.n[1] === 0) {
          // hanging off the end of a wall bracket (see dressFixture)
          const k = LANTERN_S * 1.15;
          geo.translate(cx - fx.n[0] * H + fx.n[0] * 7.5 * k, cy - 0.06 + 5 * k, cz - fx.n[2] * H + fx.n[2] * 7.5 * k);
        } else geo.translate(cx, cy + (fx.n[1] < 0 ? H : -H + (p.kind === 'torch' ? 1 / VOX : 0)), cz);
        this.ghost.geometry = geo;
        this.ghost.position.set(0, 0, 0);
        this.ghost.scale.setScalar(1);
      } else {
        const bb = this.bboxOf(p.voxels);
        const gr = new VoxelGrid(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]);
        for (const v of p.voxels) gr.set(v.x - bb[0], v.y - bb[1], v.z - bb[2], 0xffffff);
        this.ghost.geometry = meshGridGreedy(gr, { scale: 1 / VOX, pivot: [0, 0, 0], shade: true });
        this.ghost.position.set(bb[0] / VOX, bb[1] / VOX, bb[2] / VOX);
        this.ghost.scale.setScalar(1);
        // the outline: the block cells (or the door's two)
        const cells = p.cells.length ? p.cells : null;
        if (cells) {
          let c0 = [1e9, 1e9, 1e9], c1 = [-1e9, -1e9, -1e9];
          for (const c of cells) for (let i = 0; i < 3; i++) { c0[i] = Math.min(c0[i], c[i] * BS); c1[i] = Math.max(c1[i], c[i] * BS + BS); }
          this.placeBox(this.ghostBox, [...c0, ...c1], 0.01);
        } else this.placeBox(this.ghostBox, bb, 0.01);
      }
    }
    this.ghostMat.color.setHex(p.ok ? 0x9aff8a : 0xff6a5a);
    this.ghostMat.opacity = 0.26 + Math.sin(this.time * 6) * 0.07;
    this.ghostBox.material.color.setHex(p.ok ? 0xd8ffd0 : 0xffb0a0);
  }

  /** The placed thing under the crosshair while digging: a dark outline and its cracks. */
  showBreak(on) {
    const o = this.owner, hit = on ? o.target : null;
    const unit = hit && familyOf(hit.m) ? this.unitCached(hit) : null;
    this.outline.visible = !!unit;
    this.crack.visible = false;
    if (!unit) return null;
    const bb = this.bboxOf(unit.voxels);
    this.placeBox(this.outline, bb, 0.006);
    const rec = o.digger?.bdmg?.get(unit.key);
    if (rec && rec.d > 0 && performance.now() - rec.t < 6000) {
      const tex = crackTextures();
      const s = Math.min(tex.length - 1, Math.floor(rec.d * tex.length));
      if (this.crackMat.map !== tex[s]) { this.crackMat.map = tex[s]; this.crackMat.needsUpdate = true; }
      this.placeBox(this.crack, bb, 0.01);
      this.crack.visible = true;
    }
    return { unit, d: rec?.d || 0 };
  }
  unitCached(hit) {
    const k = hit.vx + ',' + hit.vy + ',' + hit.vz + ':' + hit.m;
    if (this.uk === k && this.time - this.ukT < 0.3) return this.uu;
    this.uk = k; this.ukT = this.time;
    this.uu = unitOf(this.w, hit.vx, hit.vy, hit.vz);
    return this.uu;
  }

  // ------------------------------------------------------------------ per frame
  /** Called by DigScene's build section every frame. o.hide: busy or holding a clump. */
  update(dt, o = {}) {
    this.time += dt;
    this.hook();
    const own = this.owner, ui = this.ui;
    if (!this.patched && own?.terrain?.mat) this.patched = (!/[?&]bklook=0/.test(location.search) && patchBuildLook(own.terrain.mat)) || 'no'; // ?bklook=0: plain look (A/B tests)
    const hide = !!o.hide;
    this.updateKit(dt);
    // the build slot: plan, ghost, crosshair
    if (!hide && own.slotName === 'build') {
      const eye = this.player.eye(), f = this.player.forward();
      const u = this.useTarget(eye, f, own.reach?.() ?? REACH);
      if (u) {
        this.showGhost(null);
        ui.setCrosshair?.({ visible: true, kind: 'use', label: u.label });
        this.placeBox(this.outline, this.bboxOf(u.unit.voxels), 0.006);
        this.outline.visible = true;
        this.crack.visible = false;
      } else {
        const p = this.planAt(own.target);
        this.plan_ = p;
        this.showGhost(p);
        this.outline.visible = false;
        this.crack.visible = false;
        if (own.target) ui.setCrosshair?.({ visible: true, kind: 'none', label: p ? (p.ok ? `${ITEMS[p.block.item]?.name || ''}${p.cost > 1 ? ' ×' + p.cost : ''}` : p.why) : '' });
      }
    } else {
      this.showGhost(null);
      this.plan_ = null;
      const b = !hide && own.slotName === 'pick' ? this.showBreak(true) : this.showBreak(false);
      // the crosshair over a placed block: its name, the cracks so far, the tool it wants
      if (b && own.target && !hide) {
        const m = own.target.m, want = toolWant(m), k = this.kit?.kind || 'pick';
        const fam = familyOf(m);
        const name = ITEMS[fam.item]?.name || MAT[m]?.name || '';
        const slow = want !== 'any' && want !== k ? ` · ${TOOL_NAMES[want]} would be quicker` : '';
        ui.setCrosshair?.({ visible: true, kind: 'rock', label: name + slow, progress: b.d });
      } else if (!hide && own.slotName === 'pick' && own.target && this.kit && this.kit.want === 'axe' && this.kit.kind === 'pick' && !isBuilt(own.target.m)) {
        ui.setCrosshair?.({ visible: true, kind: 'rock', label: `${MAT[own.target.m]?.name || ''} · an axe would cut it` });
      } else if (!hide && own.slotName !== 'build') {
        // E on a door, chest or bench with any tool (when DigScene isn't calling us itself)
        const eye = this.player.eye(), f = this.player.forward();
        const u = !this.leadUse && own.target && familyOf(own.target.m) ? this.useTarget(eye, f, own.reach?.() ?? REACH) : null;
        if (u) ui.setCrosshair?.({ visible: true, kind: 'use', label: u.label });
      }
    }
    // E with any tool (fallback while DigScene's interact doesn't know us)
    const inp = own.game?.input;
    if (!hide && !this.leadUse && inp?.pressed?.('KeyE') && !ui.isPanelOpen?.()) this.use(this.player.eye(), this.player.forward(), own.reach?.() ?? REACH, true);
    // a refused blow (wrong tool): say why
    const rf = own.digger?.refused;
    if (rf && rf.t !== this.refT) {
      this.refT = rf.t;
      const nm = rf.block ? ITEMS[rf.block.item]?.name : MAT[rf.m]?.name;
      this.note('refuse:' + rf.m, `<b>${nm || 'That'}</b> needs ${TOOL_NAMES[rf.want] || 'another tool'}.`, 3);
    }
    this.settle();
    this.updateFixtures(dt);
    this.updatePops(dt);
    // glass: rebuild the hidden faces behind it when it changes, when we've walked on, or when its chunks arrive
    if (this.glassDirty || this.glassRetry || (this.glass.size && this.glassAt && this.glassAt.distanceTo(this.player.eye()) > 10)) { this.glassT = (this.glassT || 0) - dt; if (this.glassT <= 0) { this.glassT = this.glassRetry && !this.glassDirty ? 1 : 0.2; this.rebuildGlass(); } }
    // the first time the build slot comes up after the lesson: how it works
    if (own.slotName === 'build' && !this.data.tip && this.st.flag?.('prologue')) {
      this.data.tip = 1;
      this.note('tip', `Build: ${own.isTouch?.() ? 'aim and press the big button' : 'aim and click'} to put a <b>${ITEMS[this.block.item]?.name}</b> down. ${own.isTouch?.() ? 'Tap the slot again' : '<b>R</b>'} opens the block picker and crafting.`, 99, 'good');
    }
    return this.out.length ? this.out.splice(0) : [];
  }

  /** Placed lights live in plan.lights (see the top); nothing extra here. */
  lights() { return []; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.offAct?.();
    if (this.owner?.digger?.onBuilt) this.owner.digger.onBuilt = null;
    for (const f of this.fixtures.values()) { const i = this.plan.lights.indexOf(f.light); if (i >= 0) this.plan.lights.splice(i, 1); }
    this.fixtures.clear();
    if (this.w.onChange === this.hookFn) this.w.onChange = null;
    this.glassMesh?.geometry.dispose();
    this.ghost.geometry.dispose();
    for (const p of this.pops) if (p.mesh.isSprite) p.mesh.material.dispose();
    this.scene3.remove(this.root);
    this.objMat.dispose(); this.glowMat.dispose(); this.ghostMat.dispose(); this.crackMat.dispose();
  }

  // ------------------------------------------------------------------ test hooks
  makeDebug() {
    const self = this;
    return {
      /** Select a block (id) and a shape. */
      select: (id, shape) => { self.select(id); if (shape) self.setShape(shape); return self.block.id; },
      /** Place at the crosshair now (aim first: scene.debug.teleport or aim()). */
      place: () => self.place(),
      plan: () => { const p = self.planAt(self.owner.target); return p && { ok: p.ok, why: p.why, n: p.voxels.length, cost: p.cost, kind: p.kind, cells: p.cells }; },
      /** Look at a point (meters). */
      aim: (x, y, z) => { const pl = self.player, e = pl.eye(); const dx = x - e.x, dy = y - e.y, dz = z - e.z; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(dy, Math.hypot(dx, dz)); self.owner.updateTarget?.(); return self.owner.target && { m: self.owner.target.m, vx: self.owner.target.vx, vy: self.owner.target.vy, vz: self.owner.target.vz }; },
      /** Give n of every block (or the listed items). */
      give: (n = 32, ids = null) => { for (const b of ids || BLOCKS.map((q) => q.item)) self.st.addItem(b, { n, spill: true }); self.owner.updateHotbar?.(); },
      tools: () => { for (const id of ['axe_copper', 'spade_copper', 'shears']) self.st.addItem(id); return ['axe_copper', 'spade_copper', 'shears']; },
      free: (on = true) => { self.debugFree = on; },
      kit: () => self.kit && { kind: self.kit.kind, item: self.kit.item.id, want: self.kit.want },
      /** Swing the dig slot's tool at the crosshair n times (headless). */
      hit: (n = 1) => { const o = self.owner; o.selectSlot?.(0); for (let i = 0; i < n; i++) { o.updateTarget?.(); self.updateKit(1); o.strike?.(); } return o.digger?.lastBuilt?.d ?? null; },
      use: () => { const u = self.useTarget(self.player.eye(), self.player.forward(), REACH); if (u) self.useIt(u); return u?.kind || null; },
      fixtures: () => [...self.fixtures.values()].map((f) => ({ x: f.x, y: f.y, z: f.z, m: f.m, built: f.built, light: [+f.light.x.toFixed(2), +f.light.y.toFixed(2), +f.light.z.toFixed(2)] })),
      glass: () => ({ n: self.glass.size, faces: self.glassMesh ? self.glassMesh.geometry.index.count / 6 : 0 }),
      gather: (on) => { if (on !== undefined) self.data.gather = !!on; return self.data.gather; },
      picker: (tab) => self.openPicker(tab || 'blocks'),
      protectedAt: (x, y, z) => self.protectedAt(x, y, z)?.name || null,
      patched: () => self.patched,
      /** A flat spot on solid floor in front of the mole, cleared to `h` blocks high (for tests). */
      clearing: (w = 3, d = 3, h = 3) => {
        const pl = self.player, wv = self.w;
        const f = DIRS[self.facing()], r = rotCW(f);
        const c0 = [Math.floor(pl.pos.x * VOX) >> 3, Math.floor(pl.pos.y * VOX) >> 3, Math.floor(pl.pos.z * VOX) >> 3];
        for (let a = 0; a < d; a++) for (let b = -(w >> 1); b <= (w >> 1); b++) for (let y = 0; y < h; y++) {
          const cx = c0[0] + f[0] * a + r[0] * b, cz = c0[2] + f[1] * a + r[1] * b;
          for (let k = 0; k < 512; k++) { const X = cx * BS + (k & 7), Y = (c0[1] + y) * BS + ((k >> 3) & 7), Z = cz * BS + (k >> 6); if (wv.voxelAt(X, Y, Z) < ORE_BASE) wv.setVoxel(X, Y, Z, 0); }
          if (y === 0) for (let k = 0; k < 64; k++) { const X = cx * BS + (k & 7), Z = cz * BS + (k >> 3), Y = c0[1] * BS - 1; if (!OPAQUE[wv.voxelAt(X, Y, Z)]) wv.setVoxel(X, Y, Z, M.STONE); }
        }
        return c0;
      },
    };
  }
}

export { REACH as BUILD_REACH, DOOR_MATS, BLOCK_OF_ITEM };

// Old Star's cave workshop, north of your room and three worn steps down through the arch of the
// old ones. The rock is a voxel volume (caveRock.js); everything in it is placed here, in meters,
// into the room's tile-unit group: his forge corner (forge, bellows, anvil, quench trough, tool
// rack, coal, his cot), the cooking hearth (fire ring, tripod and pot, his mossy armchair, table
// and stools, shelves, herbs, logs), his notes board and his chest on the west wall, the ruins
// (a dais before a sealed doorway with a glow in its crack, broken pillars, a cracked mosaic), the
// old mining gear (rails, a mine cart, the winch and pulleys, pit props) round the cage lift, the
// old passage to Deep Town (caved in until the way is found), the hole you fell through with what
// came down with you, the drip basin, glow-worms, roots, moss and mushrooms. Static props are
// merged into a few draw calls with the fixed lights baked in; the fires, water and moving parts
// stay live. Also: the lights (for the scene's light pool and the rock), the collision boxes, and
// the places Old Star goes (STAR_SPOTS).
import * as THREE from 'three';
import { bakeLighting } from '../iso/bake.js';
import { Batch, keepUnbatched } from '../iso/vox.js';
import { hangingLantern, glowThread, hangingRoot, glowShrooms, barrel, crate, sack, ropeCoil, bucket as smallBucket } from '../iso/props.js';
import { lowRes, group } from '../iso/kit.js';
import { makeRng } from '../core/util.js';
import { buildFurniture } from '../iso/furniture.js';
import { townDoor, doorRubble } from './props.js';
import * as TP from './tavernProps.js';
import * as CP from './caveProps.js';
import * as RP from './ruinProps.js';
import { CaveRock, planD, DRIPSTONES, POOL, MOUND, FLUE } from './caveRock.js';
import { T, HALL, ARCH, STAIRS, SHAFT, FRONT, HOLE, STEP_H, STEP_D } from './units.js';
import { HomeLift, liftBoxes, LIFT } from './lift.js';

const tl = (m) => m / T;
const Y = HALL.y;

/** Where things are (meters). */
export const SPOTS = {
  forge: { x: -1.6, z: -10.28, yaw: 0 },
  bellows: { x: -2.86, z: -10.12, yaw: Math.PI },
  anvil: { x: -0.72, z: -9.08, yaw: -0.55 },
  trough: { x: 0.62, z: -9.35, yaw: 1.42 },
  rack: { x: 0.05, z: -10.62, yaw: -0.15 },
  coal: { x: -0.35, z: -10.5, yaw: 0.4 },
  cot: { x: -3.88, z: -9.0, yaw: -Math.PI / 2 },
  crate: { x: -3.7, z: -8.15, yaw: 0.3 },
  fire: { x: -2.55, z: -4.15 },
  armchair: { x: -3.55, z: -3.05, yaw: 0 },
  table: { x: -1.1, z: -2.75, yaw: 0.25 },
  stools: [{ x: -1.75, z: -2.3 }, { x: -0.55, z: -3.35 }],
  shelf: { x: -4.45, z: -4.0, yaw: Math.PI / 2 },
  logs: { x: -3.85, z: -5.25, yaw: 1.2 },
  board: { x: -3.2, z: -6.55, yaw: Math.PI / 2 },
  chest: { x: -2.7, z: -7.55, yaw: Math.PI / 2 + 0.25 },
  dais: { x: 6.95, z: -9.55 },
  sealed: { x: 6.95, z: -10.3 },
  pillars: [{ x: 5.55, z: -9.15, h: 104 }, { x: 8.4, z: -9.0, h: 62 }],
  drum: { x: 5.6, z: -7.85, yaw: 0.6 },
  mosaic: { x: 6.3, z: -7.45, r: 62 },
  rails: { x0: 6.15, x1: SHAFT.x0 - 0.04, z: LIFT.cz },
  cart: { x: 6.95, z: LIFT.cz },
  winch: { x: 8.05, z: -5.62, yaw: 0 },
  miners: { x: 8.25, z: -3.18, yaw: Math.PI },
  mound: { x: MOUND.x, z: MOUND.z },
  passage: { x: FRONT.x, z: FRONT.z },
  pool: { x: POOL.x, z: POOL.z },
};

/** Old Star's places: where he stands (or sits / lies), which way he faces, his pose. */
export const STAR_SPOTS = {
  anvil: { x: -1.2, z: -8.55, face: { x: SPOTS.anvil.x, z: SPOTS.anvil.z }, pose: 'hammer' },
  bellows: { x: -2.55, z: -9.55, face: { x: -2.4, z: -10.2 }, pose: 'pump' },
  fire: { x: -2.0, z: -3.55, face: { x: SPOTS.fire.x, z: SPOTS.fire.z }, pose: 'stir' },
  board: { x: -2.55, z: -6.45, face: { x: -3.4, z: -6.55 }, pose: 'read' },
  lift: { x: 8.25, z: -4.9, face: { x: 7.0, z: -4.4 }, pose: 'idle' },
  ruins: { x: 6.9, z: -8.35, face: { x: 6.95, z: -10.4 }, pose: 'ponder' },
  pool: { x: 1.15, z: -6.2, face: { x: POOL.x, z: POOL.z }, pose: 'idle' },
  armchair: { sit: true, pose: 'sit' },
  cot: { lie: true, pose: 'sleep' },
};

export class CaveHall {
  /** room: the tile-unit group (scaled by T); world: the meters scene. */
  constructor(room, world) {
    this.room = room;
    this.world = world;
    this.meshes = [];
    this.dyn = {};
    this.lights = [];
    this.boxes = [];
    this.furn = [];
    this.waters = [];
    this.worms = [];
    this.drips = [];
  }

  /** opts: { doorOpen, notes (count) } */
  build(opts = {}) {
    const t0 = performance.now();
    this.opts = opts;
    const st = {};
    const step = (k, fn) => { const a = performance.now(); fn(); st[k] = Math.round(performance.now() - a); };
    step('rock', () => { this.rock = new CaveRock().build(); this.world.add(this.rock.group); });
    this.decor = new THREE.Group();
    this.room.add(this.decor);
    step('forge', () => this.buildForge());
    step('hearth', () => this.buildHearth());
    step('wall', () => this.buildWestWall());
    step('ruins', () => this.buildRuins());
    step('gear', () => this.buildGear());
    step('ways', () => this.buildWays());
    step('life', () => this.buildLife());
    step('merge', () => this.merge());
    this.collide();
    this.steps = { ...st, ...Object.fromEntries(Object.entries(this.rock.stats).map(([k, v]) => ['rock.' + k, v])) };
    this.ms = performance.now() - t0;
  }

  // ------------------------------------------------------------ placing
  /** The voxel floor's top under (x, z) (m). */
  ground(x, z) { return this.rock.groundAt(x, z); }

  /** Put obj at (x, y?, z) meters with yaw into the static decor (or `parent`); y defaults to the ground. */
  place(obj, x, z, yaw = 0, y = null, parent = this.decor) {
    obj.position.set(tl(x), tl(y ?? this.ground(x, z)), tl(z));
    obj.rotation.y = yaw;
    parent.add(obj);
    return obj;
  }

  /** Local point (tiles) of an object → world meters. */
  toM(obj, p) {
    obj.updateMatrixWorld(true);
    return new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(obj.matrixWorld);
  }

  /** The rock face met going from (x, z) along (dx, dz) at height y (m): { x, z } just in front of it. */
  wallAt(x, z, dx, dz, y = Y + 0.6, back = 0.02) {
    const L = Math.hypot(dx, dz);
    dx /= L; dz /= L;
    for (let t = 0; t < 4; t += 0.02) if (this.rock.solidAt(x + dx * t, y, z + dz * t)) return { x: x + dx * (t - back), z: z + dz * (t - back), t };
    return { x: x + dx * 4, z: z + dz * 4, t: 4 };
  }

  /** A collision box (meters) round a placed thing: half sizes hw × hd turned by yaw, h tall. */
  boxAt(x, z, hw, hd, h, yaw = 0, y0 = null) {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    const ex = hw * c + hd * s, ez = hw * s + hd * c;
    const b = y0 ?? this.ground(x, z);
    this.boxes.push([x - ex, b, z - ez, x + ex, b + h, z + ez]);
  }

  light(o) { const l = { flicker: 0.1, speed: 1, priority: 1, power: 0.4, radius: 1.5, ...o }; this.lights.push(l); return l; }

  // ------------------------------------------------------------ the forge corner
  buildForge() {
    const S = SPOTS;
    const pipeTop = this.rock.roofAt(FLUE.x, FLUE.z, Y + 1.0) + 0.5;
    const f = CP.forge(tl(pipeTop - this.ground(S.forge.x, S.forge.z)), 5);
    this.place(f.obj, S.forge.x, S.forge.z, S.forge.yaw);
    const fire = this.toM(f.obj, f.fire);
    this.dyn.forge = { embers: f.embers, flames: f.flames, fire };
    this.light({ kind: 'forge', x: fire.x, y: fire.y + 0.12, z: fire.z + 0.05, color: 0xff7a2a, intensity: 2.2, distance: 5.2, flicker: 0.28, speed: 1.4, pool: 0.9, poolZ: fire.z + 0.6, poolOpacity: 0.26, halo: 0.42, haloOpacity: 0.32, priority: 9, power: 1.25, radius: 3.4, rock: [1.9, 0.82, 0.32], reach: 5.6 });
    this.boxAt(S.forge.x, S.forge.z, 0.58, 0.41, 0.56, S.forge.yaw);
    this.boxAt(S.forge.x, S.forge.z - 0.17, 0.12, 0.12, 3.2, 0); // the pipe
    const b = CP.bellows(7);
    this.place(b.obj, S.bellows.x, S.bellows.z, S.bellows.yaw);
    this.dyn.bellows = b;
    this.boxAt(S.bellows.x, S.bellows.z, 0.5, 0.26, 0.62, S.bellows.yaw);
    const a = CP.anvil(9);
    this.place(a.obj, S.anvil.x, S.anvil.z, S.anvil.yaw);
    this.dyn.anvilFace = this.toM(a.obj, a.face);
    this.boxAt(S.anvil.x, S.anvil.z, 0.3, 0.14, 0.72, S.anvil.yaw);
    const tr = CP.trough(13);
    this.place(tr.obj, S.trough.x, S.trough.z, S.trough.yaw);
    const ws = this.toM(tr.obj, { x: 0, y: tr.water.y, z: 0 });
    this.addWater('trough', ws.x, ws.y, ws.z, tr.water.w * T, tr.water.d * T, S.trough.yaw, 0x1e4a5a);
    this.boxAt(S.trough.x, S.trough.z, 0.52, 0.2, 0.42, S.trough.yaw);
    this.dyn.troughAt = { x: S.trough.x, y: ws.y, z: S.trough.z };
    const rack = CP.toolRack(17);
    const rw = this.wallAt(S.rack.x, S.rack.z + 0.6, 0, -1);
    this.place(rack.obj, rw.x, rw.z + 0.03, S.rack.yaw);
    this.boxAt(rw.x, rw.z + 0.12, 0.52, 0.1, 1.5, S.rack.yaw);
    const coal = lowRes(() => CP.coalHeap(33));
    this.place(coal.obj, S.coal.x, S.coal.z, S.coal.yaw);
    const cot = CP.cot(19);
    this.place(cot.obj, S.cot.x, S.cot.z, S.cot.yaw);
    this.dyn.cot = { obj: cot.obj, lie: cot.lie };
    this.boxAt(S.cot.x, S.cot.z, 0.56, 0.28, 0.36, S.cot.yaw);
    const cr = CP.bedsideCrate(21);
    this.place(cr.obj, S.crate.x, S.crate.z, S.crate.yaw);
    const cp = this.toM(cr.obj, cr.candle);
    this.light({ kind: 'candle', x: cp.x, y: cp.y, z: cp.z, color: 0xffc070, intensity: 0, real: false, halo: 0.09, haloOpacity: 0.6, flicker: 0.2, power: 0.25, radius: 0.8 });
    this.boxAt(S.crate.x, S.crate.z, 0.19, 0.19, 0.34, S.crate.yaw);
    // his spare bucket by the trough, a barrel of water for the trough
    const bk = CP.quenchBucket(15);
    this.place(bk.obj, S.trough.x + 0.25, S.trough.z + 0.62, 0.4);
    this.dyn.bucket = { obj: bk.obj, water: bk.water, home: { x: S.trough.x + 0.25, z: S.trough.z + 0.62 } };
    const br = barrel(3, { fill: 'water' });
    this.place(br.obj, 1.25, -9.95, 0.3);
    this.boxAt(1.25, -9.95, 0.22, 0.22, 0.5);
    // a lantern on a hook over the anvil
    this.hangLantern(-0.35, -9.35, 0.45, 2);
  }

  // ------------------------------------------------------------ the cooking hearth
  buildHearth() {
    const S = SPOTS;
    const h = CP.cookHearth(23);
    this.place(h.obj, S.fire.x, S.fire.z, 0.3);
    const fire = this.toM(h.obj, h.fire);
    this.dyn.hearth = { flames: h.flames, embers: h.embers, fire, pot: this.toM(h.obj, h.pot), kettle: this.toM(h.obj, h.kettle) };
    this.light({ kind: 'fire', x: fire.x, y: fire.y + 0.15, z: fire.z, color: 0xff8a3a, intensity: 2.0, distance: 4.8, flicker: 0.32, speed: 1.3, pool: 1.05, poolOpacity: 0.3, halo: 0.5, haloOpacity: 0.3, priority: 8, power: 1.1, radius: 3.2, rock: [1.7, 0.86, 0.4], reach: 5.2 });
    this.boxAt(S.fire.x, S.fire.z, 0.42, 0.42, 0.22);
    // his mossy armchair, turned to the fire
    const ac = buildFurniture('armchair', {});
    const yaw = Math.atan2(S.fire.x - S.armchair.x, S.fire.z - S.armchair.z);
    this.place(ac.obj, S.armchair.x, S.armchair.z, yaw);
    this.furn.push({ id: 'armchair', obj: ac.obj, seats: ac.seats, box: null });
    this.boxAt(S.armchair.x, S.armchair.z, 0.24, 0.24, 0.5, yaw);
    const t = CP.table(25);
    this.place(t.obj, S.table.x, S.table.z, S.table.yaw);
    const tc = this.toM(t.obj, t.candle);
    this.light({ kind: 'candle', x: tc.x, y: tc.y, z: tc.z, color: 0xffc070, intensity: 0, real: false, halo: 0.09, haloOpacity: 0.6, flicker: 0.2, power: 0.25, radius: 0.8 });
    this.boxAt(S.table.x, S.table.z, 0.48, 0.28, 0.46, S.table.yaw);
    for (const [i, s] of S.stools.entries()) {
      const k = CP.stool(27 + i);
      this.place(k.obj, s.x, s.z, i * 1.3);
      this.furn.push({ id: 'stool', obj: k.obj, seats: [{ x: 0, z: 0, y: k.seat.y, yaw: 0 }], box: [s.x - 0.14, Y, s.z - 0.14, s.x + 0.14, Y + 0.3, s.z + 0.14] });
    }
    const sw = this.wallAt(-3.0, S.shelf.z, -1, 0, Y + 0.7);
    const sh = CP.shelf(0.95, 29);
    this.place(sh.obj, sw.x, S.shelf.z, Math.PI / 2, Y + 0.32);
    const lg = lowRes(() => CP.logStack(35));
    this.place(lg.obj, S.logs.x, S.logs.z, S.logs.yaw);
    this.boxAt(S.logs.x, S.logs.z, 0.36, 0.18, 0.46, S.logs.yaw);
    // herbs drying on a string over the table, a sack and a barrel by the shelf
    const hl = CP.herbLine(1.1, 31);
    const top = Math.min(this.rock.roofAt(-1.6, -3.0), this.rock.roofAt(-0.6, -3.0));
    this.place(hl, -1.65, -3.05, 0.2, Math.min(top - 0.05, Y + 1.85));
    const sk = sack({});
    this.place(sk.obj, -4.05, -4.65, 0.4);
    const bb = barrel(5, { fill: 'apples' });
    this.place(bb.obj, -4.0, -3.15, 0.2);
    this.boxAt(-4.0, -3.15, 0.22, 0.22, 0.5);
    this.hangLantern(-1.4, -4.25, 0.5, 3);
  }

  // ------------------------------------------------------------ the notes board and the chest
  buildWestWall() {
    const S = SPOTS;
    const bw = this.wallAt(-2.2, S.board.z, -1, 0, Y + 0.7);
    const board = TP.notesBoard(Math.max(3, Math.min(10, this.opts.notes ?? 8)), 13);
    // on a plank backing between two pit posts
    const fr = RP.pitFrame(76, 86, 71);
    this.place(fr.obj, bw.x + 0.04, S.board.z, Math.PI / 2);
    this.place(board.obj, bw.x + 0.08, S.board.z, Math.PI / 2, Y + 0.46);
    this.boardObj = board.obj;
    this.dyn.board = board;
    this.notePins = board.notes.map((q) => this.toM(board.obj, { x: q.x, y: q.y, z: 0.1 }));
    this.boardAt = { x: bw.x + 0.08, z: S.board.z, y: Y + 0.46, w: (board.w ?? 1.6) * T, h: (board.h ?? 1.2) * T };
    this.boxAt(bw.x + 0.05, S.board.z, 0.08, 0.66, 1.5);
    // the chest
    const ch = TP.lootChest(17);
    const cg = group(ch.obj, ch.lid, ch.loot);
    this.place(cg, S.chest.x, S.chest.z, S.chest.yaw, null, this.room);
    this.dyn.chest = { ...ch, group: cg };
    cg.traverse((m) => { m.userData.noBatch = true; });
    this.boxAt(S.chest.x, S.chest.z, 0.32, 0.2, 0.36, S.chest.yaw);
    this.hangLantern(-2.65, -6.1, 0.4, 4, 'notes');
  }

  // ------------------------------------------------------------ the ruins
  buildRuins() {
    const S = SPOTS;
    const d = lowRes(() => RP.dais(2.3, 1.15, 14, 53));
    this.place(d.obj, S.dais.x, S.dais.z, 0, Y);
    this.boxes.push([S.dais.x - 1.15, Y, S.dais.z - 0.575, S.dais.x + 1.15, Y + 14 / 64, S.dais.z + 0.575]);
    const sw = this.wallAt(S.sealed.x, S.dais.z, 0, -1, Y + 0.6);
    const sa = lowRes(() => RP.sealedArch(45));
    this.place(sa.obj, S.sealed.x, sw.z + 0.05, 0, Y + 14 / 64);
    const gp = this.toM(sa.obj, sa.glow);
    this.dyn.sealedGlow = gp;
    this.light({ kind: 'ruin', x: gp.x, y: gp.y, z: gp.z + 0.25, color: 0x4ad8c0, intensity: 0.9, distance: 3.2, flicker: 0.15, speed: 0.35, halo: 0.55, haloOpacity: 0.22, priority: 3, power: 0.5, radius: 2.2, rock: [0.25, 0.75, 0.7], reach: 3.6 });
    this.boxes.push([S.sealed.x - 1.0, Y, sw.z - 0.2, S.sealed.x + 1.0, Y + 2.2, sw.z + 0.25]);
    // a soft fill over the dais (baked and on the rock only): the old stone reads pale in the gloom
    this.light({ kind: 'ruinfill', x: S.dais.x - 0.3, y: Y + 1.7, z: S.dais.z + 1.1, color: 0xffd2a0, intensity: 0, real: false, power: 0.55, radius: 2.8, rock: [0.42, 0.36, 0.28], reach: 3.6 });
    for (const [i, p] of S.pillars.entries()) {
      const pl = lowRes(() => RP.pillar(p.h, true, 47 + i * 3));
      this.place(pl.obj, p.x, p.z, i * 0.7, Y + (Math.abs(p.x - S.dais.x) < 1.1 ? 14 / 64 : 0));
      this.boxAt(p.x, p.z, 0.24, 0.24, p.h / 64 + 0.1);
    }
    const dr = lowRes(() => RP.fallenDrum(46, 49));
    this.place(dr.obj, S.drum.x, S.drum.z, S.drum.yaw);
    this.boxAt(S.drum.x, S.drum.z, 0.37, 0.18, 0.33, S.drum.yaw);
    const mo = RP.mosaic(S.mosaic.r, 51);
    this.place(mo.obj, S.mosaic.x, S.mosaic.z, 0.15, Y + 0.002);
    for (const [x, z, s] of [[5.3, -10.0, 1], [8.6, -10.2, 2], [7.9, -8.2, 3]]) {
      const m = lowRes(() => glowShrooms(70 + s, 1, 0.7));
      this.place(m.obj, x, z, s);
      const gw = this.toM(m.obj, { x: 0, y: 0.25, z: 0 });
      this.light({ kind: 'shroom', x: gw.x, y: gw.y, z: gw.z, color: 0x5ad0e0, intensity: 0, real: false, halo: 0.22, haloOpacity: 0.3, pool: 0.3, poolOpacity: 0.14, flicker: 0.08, speed: 0.3, power: 0.3, radius: 1.0 });
    }
  }

  // ------------------------------------------------------------ the old mining gear round the lift
  buildGear() {
    const S = SPOTS;
    this.lift = new HomeLift(this.room, this.decor);
    const r = lowRes(() => RP.rails(S.rails.x1 - S.rails.x0, 55));
    this.place(r.obj, S.rails.x0, S.rails.z, 0, Y);
    const c = lowRes(() => RP.mineCart(57));
    this.place(c.obj, S.cart.x, S.cart.z, Math.PI / 2, Y + 6 / 64);
    this.boxAt(S.cart.x, S.cart.z, 0.36, 0.27, 0.6, 0);
    this.boxes.push([S.rails.x0 - 0.02, Y, S.rails.z - 0.3, S.rails.x0 + 0.12, Y + 0.3, S.rails.z + 0.3]); // the buffer stop
    const w = lowRes(() => RP.winch(59));
    this.place(w.obj, S.winch.x, S.winch.z, S.winch.yaw);
    this.boxAt(S.winch.x, S.winch.z, 0.42, 0.32, 0.9, S.winch.yaw);
    // a beam across the bay with pulley blocks, the winch rope going up over it
    const by = Math.min(this.rock.roofAt(7.6, -5.6), this.rock.roofAt(7.6, -3.4)) - 0.16;
    const bm = TP.sagBeam(Math.round(2.6 * 64), 2, 39);
    this.place(bm, 7.6, -4.45 + 1.3, Math.PI / 2, by);
    for (const [z, len] of [[-5.15, 0.5], [-3.95, 0.8]]) {
      const p = RP.pulley(61 + Math.round(z * 3));
      this.place(p, 7.6, z, 0.2, by - 0.02);
      void len;
    }
    // the Miners' Board on a pit frame by the lift
    const mw = this.wallAt(S.miners.x, -4.4, 0, 1, Y + 0.7);
    const fr = RP.pitFrame(70, 92, 73);
    this.place(fr.obj, S.miners.x, mw.z - 0.03, Math.PI, Y);
    const mb = TP.minersBoard(49);
    this.place(mb, S.miners.x, mw.z - 0.08, Math.PI, Y + 0.55);
    this.minersAt = { x: S.miners.x, z: mw.z - 0.1, y: Y + 0.55 };
    this.boxAt(S.miners.x, mw.z - 0.08, 0.6, 0.1, 1.6, 0);
    // crates, barrels and a coil of rope
    for (const [x, z, k, s] of [[7.15, -3.55, 'crate', 1], [6.7, -3.45, 'crate', 2], [9.05, -5.75, 'barrel', 3], [6.85, -5.65, 'rope', 4], [9.15, -3.25, 'barrel', 5]]) {
      const o = k === 'crate' ? crate(s, { open: s === 2 }) : k === 'barrel' ? barrel(s, { fill: s === 3 ? 'coal' : null }) : ropeCoil(s);
      this.place(o.obj, x, z, s * 0.7);
      if (k !== 'rope') this.boxAt(x, z, 0.24, 0.24, k === 'crate' ? 0.4 : 0.5, s * 0.7);
    }
    // the lantern at the lift and its cage light
    this.liftLantern = this.light({ kind: 'lift', ...this.lift.lanternPos(new THREE.Vector3()).multiplyScalar(T), color: 0xffb860, intensity: 0.8, distance: 2.6, flicker: 0.1, halo: 0.16, haloOpacity: 0.55, priority: 2, power: 0.5, radius: 1.8, rock: [0.9, 0.7, 0.42], reach: 3.6 });
    const lp = this.lift.lanternM;
    if (lp) this.light({ kind: 'portal', x: lp.x, y: lp.y, z: lp.z, color: 0xffb050, intensity: 0.9, distance: 3.4, flicker: 0.12, halo: 0.18, haloOpacity: 0.55, pool: 0.6, poolOpacity: 0.15, priority: 4, power: 0.55, radius: 2.2, rock: [0.95, 0.72, 0.42], reach: 4.0 });
  }

  // ------------------------------------------------------------ the ways in and out
  buildWays() {
    // the worn steps up to your room and the arch of the old ones round the doorway
    const steps = RP.wornSteps(64, 2, Math.round(STEP_H * 64), Math.round(STEP_D * 64), 43);
    this.place(steps.obj, ARCH.x, HALL.z1 - 2 * STEP_D, Math.PI, Y);
    const arch = RP.caveArch(Math.round(ARCH.hw * 64), Math.round(ARCH.h * 64), Math.round(-Y * 64), 41);
    this.place(arch.obj, ARCH.x, HALL.z1 + 0.005, Math.PI, Y);
    this.light({ kind: 'arch', x: ARCH.x, y: 0.7, z: HALL.z1 - 0.2, color: 0xffb070, intensity: 0, real: false, power: 0.35, radius: 1.4 });
    // the old passage north to Deep Town: a door in a stone arch, choked with rubble until it's dug
    const P = FRONT;
    const pw = this.wallAt(P.x, -9.0, 0, -1, Y + 0.3);
    this.passageZ = Math.min(P.z, pw.z);
    const door = townDoor(!!this.opts.doorOpen, 4);
    const dz = -10.75;
    const frame = group(door.frame, door.hinge);
    this.place(frame, P.x, dz, 0, Y);
    this.doorFrame = frame;
    this.doorLeaf = door.hinge;
    this.passage = { x: P.x, z: dz };
    const pf = RP.pitFrame(84, 96, 77);
    this.place(pf.obj, P.x, -10.05, 0, Y);
    if (!this.opts.doorOpen) {
      const rb = doorRubble(4);
      this.place(rb, P.x, dz + 0.05, 0, Y);
      this.boxes.push([P.x - 0.6, Y, dz - 0.3, P.x + 0.6, Y + 0.55, dz + 0.7]);
    } else {
      this.light({ kind: 'door', x: P.x, y: Y + 0.95, z: dz + 0.15, color: 0xffd090, intensity: 0.8, distance: 2.8, flicker: 0.08, halo: 0.25, haloOpacity: 0.4, priority: 3, power: 0.4, radius: 1.6, rock: [0.9, 0.75, 0.5], reach: 3 });
    }
    this.boxes.push([P.x - 0.6, Y, dz - 1.4, P.x + 0.6, Y + 1.6, dz - 0.02]); // the door itself
    this.hangLantern(P.x - 0.2, -9.25, 0.35, 5, 'passage');
    // the hole you fell through, what came down with you
    const db = lowRes(() => RP.fallDebris(65));
    this.place(db.obj, MOUND.x, MOUND.z, 0.3, Y + 0.02);
    this.glints = db.glints.map((p) => { const w = this.toM(db.obj, p); w.y = this.ground(w.x, w.z) + 0.04; return w; });
    this.dyn.debris = db.obj;
    // roots dangling from the hole's lip and the roof round it
    const rng = makeRng(81);
    const roof = this.rock.roofAt(HOLE.x, HOLE.z, Y + 1.2);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rng() * 0.5, r = HOLE.r * (0.95 + rng() * 0.5);
      const x = HOLE.x + Math.cos(a) * r, z = HOLE.z + Math.sin(a) * r;
      const top = Math.min(this.rock.roofAt(x, z, Y + 1.2), roof + 0.6);
      const len = 0.35 + rng() * 0.9;
      this.place(lowRes(() => hangingRoot(80 + k, tl(len))), x, z, rng() * 6, top + 0.02);
    }
  }

  // ------------------------------------------------------------ the living cave
  buildLife() {
    const rng = makeRng(17);
    // a lantern over the middle and one by the steps
    this.hangLantern(2.85, -5.75, 0.7, 6, 'center');
    this.hangLantern(2.2, -2.2, 0.45, 7, 'entry');
    // glow-worms: threads of beads hanging from the roof, thick over the ruins and the middle
    let n = 0;
    for (let tries = 0; tries < 1600 && n < 240; tries++) {
      const x = HALL.x0 + rng() * (HALL.x1 - HALL.x0 - 2), z = HALL.z0 + rng() * (HALL.z1 - HALL.z0);
      const d = planD(x, z);
      if (d < 0.7) continue;
      if (Math.hypot(x - HOLE.x, z - HOLE.z) < 1.3) continue;
      if (Math.hypot(x - FLUE.x, z - FLUE.z) < 1.6 || Math.hypot(x - SPOTS.fire.x, z - SPOTS.fire.z) < 1.2) continue; // too smoky
      // clusters: keep the dense patches dense
      const cl = Math.sin(x * 0.9 + 1.3) * Math.cos(z * 0.8 - 0.4);
      if (cl < -0.1 && rng() < 0.75) continue;
      const roof = this.rock.roofAt(x, z, Y + 1.0);
      if (roof < Y + 1.6) continue;
      const len = 0.06 + rng() * rng() * 0.45;
      const col = rng() < 0.75 ? 0x8affd8 : 0xb4f0ff;
      const th = glowThread(200 + n, tl(len), col);
      this.place(th, x, z, rng() * 6, roof + 0.01);
      this.worms.push({ x, y: roof - len, z, len, col, ph: rng() * 6.28 });
      n++;
    }
    // roots from the roof here and there, moss and mushrooms at the foot of the walls
    for (let k = 0; k < 16; k++) {
      const x = HALL.x0 + 1 + rng() * (HALL.x1 - HALL.x0 - 3), z = HALL.z0 + 1 + rng() * (HALL.z1 - HALL.z0 - 1);
      const d = planD(x, z);
      if (d < 0.2 || d > 1.6) continue;
      const roof = this.rock.roofAt(x, z, Y + 1.0);
      this.place(lowRes(() => hangingRoot(120 + k, tl(0.3 + rng() * 0.6))), x, z, rng() * 6, roof + 0.02);
    }
    const tufts = [[0.0, -6.15], [1.15, -7.2], [-0.05, -7.25], [3.6, -10.05], [2.75, -9.85], [9.0, -5.95], [-4.2, -5.8], [4.9, -1.45], [-0.6, -1.9]];
    for (const [i, [x, z]] of tufts.entries()) this.place(RP.mossTuft(90 + i), x, z, i);
    for (const [x, z, s, hue] of [[1.25, -7.25, 1, 0], [-0.15, -6.0, 2, 0], [4.85, -1.35, 3, 1], [-4.1, -2.4, 4, 0], [9.2, -3.5, 5, 1], [2.55, -10.15, 6, 0]]) {
      const m = lowRes(() => glowShrooms(60 + s, hue, 0.55));
      this.place(m.obj, x, z, s);
      const gw = this.toM(m.obj, { x: 0, y: 0.2, z: 0 });
      this.light({ kind: 'shroom', x: gw.x, y: gw.y, z: gw.z, color: hue ? 0xb07ae0 : 0x5ad0e0, intensity: 0, real: false, halo: 0.18, haloOpacity: 0.28, pool: 0.25, poolOpacity: 0.12, flicker: 0.08, speed: 0.3, power: 0.25, radius: 0.8 });
    }
    // the drip basin's water
    this.addWater('pool', POOL.x, Y - 0.035, POOL.z, POOL.r * 1.9, POOL.r * 1.9, 0, 0x163a4a, true);
    // the stalactites that drip
    for (const s of DRIPSTONES) if (s.drip) this.drips.push({ x: s.x, z: s.z, y: this.rock.roofAt(s.x, s.z, Y + 0.6) - 0.02, t: 1 + Math.random() * 3, every: 2.2 + Math.random() * 2.6 });
  }

  hangLantern(x, z, len, seed, kind = 'lantern') {
    const top = this.rock.roofAt(x, z, Y + 0.8);
    const l = hangingLantern(len / T, seed);
    this.place(l.obj, x, z, seed, top + 0.03);
    const p = this.toM(l.obj, l.lights[0]);
    return this.light({ kind, x: p.x, y: p.y, z: p.z, color: 0xffb060, intensity: kind === 'center' ? 1.3 : 0.95, distance: kind === 'center' ? 4.6 : 3.4, flicker: 0.1, halo: 0.2, haloOpacity: 0.5, pool: kind === 'center' ? 1.1 : 0.7, poolX: p.x, poolZ: p.z, poolOpacity: 0.14, priority: kind === 'center' ? 6 : 4, power: kind === 'center' ? 0.75 : 0.55, radius: kind === 'center' ? 3.0 : 2.2, rock: kind === 'center' ? [1.0, 0.78, 0.5] : [0.85, 0.66, 0.42], reach: kind === 'center' ? 6.0 : 4.2 });
  }

  // ------------------------------------------------------------ water
  /** A still water surface (meters), w × d, turned by yaw; rippled by the scene (ripple()). */
  addWater(name, x, y, z, w, d, yaw, color, round = false) {
    const mat = waterMaterial(color, round);
    const geo = new THREE.PlaneGeometry(w, d, 1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.renderOrder = 2;
    this.world.add(m);
    this.meshes.push(m);
    const wtr = { name, mesh: m, mat, x, y, z, w, d, yaw, rips: [] };
    this.waters.push(wtr);
    this.dyn[name + 'Water'] = wtr;
    return wtr;
  }

  /** A ring of ripples on a water surface at (x, z) meters. */
  ripple(name, x, z, k = 1) {
    const w = this.waters.find((q) => q.name === name);
    if (!w) return;
    const U = w.mat.uniforms;
    const i = (U.uRipN.value = (U.uRipN.value + 1) % 4);
    // into the surface's local frame
    const c = Math.cos(-w.yaw), s = Math.sin(-w.yaw), dx = x - w.x, dz = z - w.z;
    U.uRip.value[i].set(dx * c + dz * s, -dx * s + dz * c, U.uTime.value, k);
  }

  // ------------------------------------------------------------ merge
  merge() {
    const flames = [...this.dyn.forge.flames, ...this.dyn.hearth.flames];
    for (const m of flames) m.userData.noBatch = true;
    this.room.updateMatrixWorld(true);
    const batch = new Batch(5);
    this.decor.updateMatrixWorld(true);
    // keep the moving parts out: whole groups go to the room (their hinges keep working)
    const live = [this.dyn.bucket.obj, this.doorFrame, this.dyn.bellows.obj].filter(Boolean);
    for (const o of live) this.room.attach(o);
    this.lift.cage.traverse((m) => { m.userData.noBatch = true; });
    this.lift.root.traverse((m) => { m.userData.noBatch = true; });
    batch.add(this.decor);
    const lights = this.bakeLights();
    const amb = this.ambient();
    this.decorMeshes = batch.build(this.world, null, { bake: (g) => bakeLighting(g, lights, { ambient: amb, max: 2.0 }) });
    keepUnbatched(this.decor, this.world);
    this.room.remove(this.decor);
    // the live pieces get the same baked light once
    const dynBake = (obj) => {
      if (!obj) return;
      obj.updateMatrixWorld(true);
      obj.traverse((m) => {
        if (!m.isMesh || !m.geometry.getAttribute('color') || m.material.isMeshBasicMaterial) return;
        const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
        bakeLighting(g, lights, { ambient: amb, max: 2.0 });
        m.geometry.setAttribute('color', g.getAttribute('color'));
        g.dispose();
      });
    };
    for (const o of live) dynBake(o);
    dynBake(this.lift.cage);
    dynBake(this.dyn.chest.group);
  }

  bakeLights() { return this.lights.map((l) => ({ x: l.x, y: l.y, z: l.z, color: l.color, power: (l.power ?? 0.4) * 1.35, radius: (l.radius ?? 1.2) * 1.2 })); }

  /** Ambient for baking: gloom up high and near the rock, a warm floor bounce. */
  ambient() {
    return (x, y, z, nx, ny, nz, out) => {
      let k = 0.8;
      const h = y - Y;
      if (h > 1.3) k *= Math.max(0.4, 1 - (h - 1.3) * 0.4);
      if (h < 0.2) k *= Math.max(0.3, 0.8 + h);
      const d = planD(x, z);
      if (d < 0.8) k *= 0.62 + Math.max(0, d) * 0.45;
      if (ny < -0.5) k *= 0.75;
      out[0] = k; out[1] = k * 0.9; out[2] = k * 0.84;
    };
  }

  // ------------------------------------------------------------ collision (meters)
  collide() {
    const B = (...b) => this.boxes.push(b);
    // the worn steps up to your room
    for (let i = 1; i <= 2; i++) B(STAIRS.x0, Y, HALL.z1 - i * STEP_D, STAIRS.x1, -i * STEP_H, HALL.z1 - (i - 1) * STEP_D);
    for (const b of liftBoxes(false)) void b; // (the scene adds the lift's own boxes)
  }

  // ------------------------------------------------------------ frame
  /** Fires breathe, flames lick, water shimmers. air: the forge's draught 0..1 (bellows). */
  update(dt, time, air = 0) {
    const fk = 0.82 + 0.18 * Math.sin(time * 9.7) * Math.sin(time * 5.3 + 1) + air * 0.5;
    this.dyn.forge.embers.material.color.setRGB(0.85 + fk * 0.35, 0.7 + fk * 0.3, 0.6 + fk * 0.25);
    for (const f of this.dyn.forge.flames) {
      const u = f.userData.flame;
      f.scale.y = 0.6 + 0.4 * Math.abs(Math.sin(time * 7 + u.ph)) + air * 0.6;
      f.visible = Math.sin(time * 3.1 + u.ph * 2) > -0.6 || air > 0.3;
    }
    const hk = 0.85 + 0.15 * Math.sin(time * 8.3 + 2) * Math.sin(time * 4.1);
    this.dyn.hearth.embers.material.color.setRGB(0.8 + hk * 0.3, 0.7 + hk * 0.25, 0.6 + hk * 0.2);
    for (const f of this.dyn.hearth.flames) {
      const u = f.userData.flame;
      f.scale.y = 0.65 + 0.45 * Math.abs(Math.sin(time * 6.2 + u.ph));
      f.scale.x = 1 + Math.sin(time * 4 + u.ph) * 0.08;
    }
    for (const w of this.waters) w.mat.uniforms.uTime.value = time;
  }

  /** The lights for the rock this frame: the strongest near the eye, with their flicker. */
  rockLights(eye, srcs) {
    const out = [];
    for (const s of srcs) {
      if (!s.rock || s.on === false) continue;
      const dd = Math.hypot(s.x - eye.x, s.y - eye.y, s.z - eye.z);
      out.push({ s, w: dd - (s.priority || 0) * 0.6 });
    }
    out.sort((a, b) => a.w - b.w);
    const G = 1.55; // the rock's light gain (its shader is darker than the props' lighting)
    return out.slice(0, 8).map(({ s }) => { const k = (s.k ?? 1) * G; return { x: s.x, y: s.y, z: s.z, r: (s.reach || 4) * 1.25, c: [s.rock[0] * k, s.rock[1] * k, s.rock[2] * k] }; });
  }

  dispose() {
    this.rock?.dispose();
    for (const m of this.meshes) { m.geometry.dispose(); m.material.dispose(); }
  }
}

// ---------------------------------------------------------------- water
/** Dark still water: a deep tint, a sheen that wobbles, and up to four ripple rings (uRip: x, z, t0, k). */
function waterMaterial(color, round) {
  const rip = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0));
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(color) }, uRip: { value: rip }, uRipN: { value: 0 }, uRound: { value: round ? 1 : 0 } },
    vertexShader: /* glsl */`
      varying vec3 vL; varying vec3 vW;
      void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uCol; uniform vec4 uRip[4]; uniform float uRound;
      varying vec3 vL; varying vec3 vW;
      void main() {
        vec2 p = floor(vL.xz * 64.0) / 64.0; // 1/64 m texels
        if (uRound > 0.5) { vec2 q = vL.xz / vec2(${'0.62'}, ${'0.62'}); float r = length(q); if (r > 1.0 + sin(atan(q.y, q.x) * 5.0) * 0.06) discard; }
        float h = sin(p.x * 23.0 + uTime * 1.3) * sin(p.y * 19.0 - uTime * 1.1) * 0.5 + 0.5;
        float ring = 0.0;
        for (int i = 0; i < 4; i++) {
          float age = uTime - uRip[i].z;
          if (age < 0.0 || age > 1.6) continue;
          float d = length(p - uRip[i].xy);
          float rr = age * 0.32;
          ring += smoothstep(0.012, 0.0, abs(d - rr)) * (1.0 - age / 1.6) * uRip[i].w;
        }
        vec3 col = uCol * (0.75 + h * 0.35);
        col += vec3(0.55, 0.75, 0.8) * step(0.93, h) * 0.35;
        col += vec3(0.7, 0.9, 1.0) * ring * 0.8;
        // the fire's glint
        col += vec3(0.9, 0.5, 0.2) * pow(h, 6.0) * 0.12;
        gl_FragColor = vec4(col, 0.86);
      }`,
  });
}

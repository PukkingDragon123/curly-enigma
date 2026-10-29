// Old Star's camp, three worn steps and a rock passage down from your nook: an old, run-down camp
// in a natural cave hollow, there for decades and patched ever since. His shack of warped grey
// planks and a patched tarp against the north rock (his sagging cot, his old armchair, his notes on
// the wall outside, a gramophone on a crate, a lantern on a hook by the sacking door); the fire pit
// in a ring of stones with the kettle on its tripod (the cooking spot), a plank table and a wobbly
// stool, logs to sit on, crates and barrels of stores; the forge corner: his old stone forge with
// its pipe up a crack in the rock, the bellows, the anvil on its stump, the quench trough, coal and
// tools leaning on the rock; the spring dripping out of the rock into a stone basin in the side nook;
// the rusty cage lift in its rock shaft, the old door to Deep Town in a tunnel mouth (caved in until
// you find it from below), his chest, the coal cart, the Miners' Board, his slate of the million;
// the hole you fell through up in the roof, a thin grey light down it, what came down with you on
// the floor under it. Candle stubs, cobwebs, roots, drips, glowing mushrooms in the damp corners.
//
// Built in jobs (JOBS: the rock, the west of the hollow, the east, then 'ways', the steps, the door
// and the walls' collision), each of which can run in a build worker (houseWorker.js, driven by
// houseLoad.js) or on the main thread: a job builds its pieces, merges the static voxels by material,
// bakes the camp's fixed lights into them and packs it all (pack.js); the scene puts the packed jobs
// back together (StarHouse.assemble), builds the cage lift itself, and keeps fires, water and moving
// parts live. Also the lights (for the scene's light pool), the collision boxes, the seats and Old
// Star's places. (The scene still calls it `scene.cave` / `scene.house`.)
import * as THREE from 'three';
import { keepUnbatched } from '../iso/vox.js';
import { lowRes, group } from '../iso/kit.js';
import { barrel, crate, sack, glowShrooms, crystals } from '../iso/props.js';
import { buildFurniture } from '../iso/furniture.js';
import { townDoor, doorRubble, lanternOnHook } from './props.js';
import * as TP from './tavernProps.js';
import * as CP from './caveProps.js';
import * as RP from './ruinProps.js';
import * as HP from './houseProps.js';
import * as KP from './clutterProps.js';
import * as CMP from './campProps.js';
import { buildCaveRock, caveBoxes, DRIPS } from './caveShell.js';
import { ROOMS, FY, roomAt, hollowSD, ceilAt, lean } from './plan.js';
import { T, HALL, ARCH, STAIRS, SHAFT, FRONT, HOLE, STEP_H, STEP_D, floorAt } from './units.js';
import { HomeLift, LIFT, LIFT_LIGHTS } from './lift.js';
import { Merger, worldGeo, mergeQuads, matDesc, matFrom, quantize, qTransfer, unquantize, packNode, unpackNode, packRef, unpackRef, CSCALE } from './pack.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

const tl = (m) => m / T;
const Y = FY;

/** His shack against the north rock (m): the middle of its front wall, its width and depth. */
export const SHACK = { x: 2.35, z: -3.95, W: 2.6, D: 1.55, Hf: 1.5, Hb: 1.95, dc: -0.35, dw: 0.82 };

/** Where things are (meters). */
export const SPOTS = {
  // the forge corner (north-west)
  forge: { x: -2.0, z: -5.02, yaw: 0 },
  bellows: { x: -3.07, z: -5.0, yaw: Math.PI },
  anvil: { x: -1.12, z: -3.92, yaw: -0.55 },
  trough: { x: 0.08, z: -4.78, yaw: Math.PI / 2 },
  rack: { x: -3.6, z: -3.75 },
  coal: { x: -0.92, z: -5.32, yaw: 0.4 },
  // the shack (his cot along its back wall, his armchair, the books)
  cot: { x: 1.92, z: -5.1 },
  armchair: { x: 3.05, z: -4.58 },
  books: { x: 1.3, z: -4.32 },
  // the camp kitchen (south-west): the fire pit, the table, the spring in its nook
  fire: { x: -0.9, z: -2.05 },
  hearth: { x: -0.9, z: -2.05 },
  sink: { x: -4.85, z: -2.15 },
  pool: { x: -4.85, z: -2.15 },
  table: { x: -2.55, z: -1.22, yaw: 0 },
  // round the shack and the hole
  board: { x: SHACK.x + SHACK.W / 2 + 0.06, z: -4.72 },
  clock: { x: 3.98, z: -3.5 },
  rubble: { x: 3.95, z: -1.05 },
  // the east: the lift, the way out, his chest
  chest: { x: 6.35, z: -0.66, yaw: Math.PI },
  miners: { x: 5.12, z: -4.55 },
  cart: { x: 6.95, z: -1.72 },
  dream: { x: 5.3, z: -0.48 },
  suitcase: { x: 5.38, z: -5.3 },
  passage: { x: FRONT.x, z: FRONT.z },
  // (old names kept for the scene and the tests)
  sofa: { x: 3.05, z: -4.58 },
  trinkets: { x: 5.3, z: -0.48 },
  mound: { x: 3.95, z: -1.05 },
  winch: { x: 6.95, z: -1.72 },
  dais: { x: 5.3, z: -0.48 },
  sealed: { x: 5.3, z: -0.48 },
  mosaic: { x: 2.4, z: -2.6 },
};

/** Old Star's places: where he stands (or sits / lies), which way he faces, his pose. */
export const STAR_SPOTS = {
  anvil: { x: -1.6, z: -3.52, face: { x: SPOTS.anvil.x, z: SPOTS.anvil.z }, pose: 'hammer' },
  bellows: { x: -2.86, z: -4.42, face: { x: -2.76, z: -5.1 }, pose: 'pump' },
  fire: { x: -0.88, z: -2.72, face: { x: -0.9, z: -2.05 }, pose: 'stir' },
  board: { x: 4.3, z: -4.72, face: { x: 3.7, z: -4.72 }, pose: 'read' },
  lift: { x: 6.4, z: -3.32, face: { x: 7.8, z: -3.37 }, pose: 'idle' },
  ruins: { x: 5.3, z: -1.12, face: { x: 5.3, z: -0.4 }, pose: 'ponder' }, // (his slate of the million)
  pool: { x: -4.2, z: -2.12, face: { x: -4.95, z: -2.15 }, pose: 'idle' }, // (the spring)
  books: { x: 1.62, z: -4.5, face: { x: 1.25, z: -4.3 }, pose: 'read' },
  hearth: { x: -0.05, z: -1.62, face: { x: -0.9, z: -2.05 }, pose: 'idle' },
  armchair: { sit: true, pose: 'sit' },
  cot: { lie: true, pose: 'sleep' },
};

/** What a job hands the scene besides its meshes, lights, boxes and looks (dyn and furn too). */
const KEEP = ['boardObj', 'doorFrame', 'doorLeaf', 'passage', 'boardAt', 'minersAt', 'notePins', 'glints', 'gramophone', 'holeTop'];

/** The build jobs: the rock, the west of the hollow, the east, then the steps, the door and the walls' collision. */
export const JOBS = ['rock', 'west', 'east', 'ways'];
const BUILDERS = { rock: 'buildRock', west: 'buildWest', east: 'buildEast', ways: 'buildWays' };

/**
 * The camp's fixed lights (m): the fire pit, the forge, the lanterns, candles, the hole's grey light,
 * the glow in the damp corners. Every job bakes with them (the 'rock' job hands them to the scene).
 */
export function campLights() {
  const S = SPOTS;
  const L = [
    { kind: 'fire', x: S.fire.x, y: Y + 0.22, z: S.fire.z, color: 0xff8a3a, intensity: 2.0, distance: 4.6, flicker: 0.32, speed: 1.3, pool: 1.0, poolOpacity: 0.3, halo: 0.42, haloOpacity: 0.3, priority: 9, power: 1.25, radius: 3.9 },
    { kind: 'forge', x: S.forge.x, y: Y + 0.62, z: S.forge.z + 0.05, color: 0xff7a2a, intensity: 1.9, distance: 4.4, flicker: 0.28, speed: 1.4, pool: 0.8, poolZ: S.forge.z + 0.6, poolOpacity: 0.24, halo: 0.36, haloOpacity: 0.3, priority: 9, power: 1.15, radius: 3.4 },
    { kind: 'lantern', x: SHACK.x + SHACK.dc + SHACK.dw / 2 + 0.16, y: Y + 1.18, z: SHACK.z + 0.2, color: 0xffb860, intensity: 0.9, distance: 3.2, flicker: 0.12, halo: 0.2, haloOpacity: 0.55, pool: 0.65, poolOpacity: 0.14, priority: 6, power: 0.62, radius: 2.5 },
    { kind: 'candle', x: SHACK.x + 0.95, y: Y + 0.62, z: SHACK.z - 1.05, color: 0xffc070, intensity: 0.55, distance: 2.0, flicker: 0.2, halo: 0.09, haloOpacity: 0.6, priority: 4, power: 0.4, radius: 1.5, real: true },
    { kind: 'candle', x: S.table.x + 0.3, y: Y + 0.62, z: S.table.z - 0.12, color: 0xffc070, intensity: 0.5, distance: 1.8, flicker: 0.2, halo: 0.09, haloOpacity: 0.6, priority: 3, power: 0.32, radius: 1.3, real: true },
    { kind: 'lantern', x: 6.55, y: Y + 1.3, z: -2.25, color: 0xffb050, intensity: 0.75, distance: 3.0, flicker: 0.12, halo: 0.18, haloOpacity: 0.5, pool: 0.55, poolOpacity: 0.12, priority: 5, power: 0.5, radius: 2.3 },
    { kind: 'lantern', x: -1.5, y: Y + 1.25, z: -4.35, color: 0xffb060, intensity: 0.6, distance: 2.6, flicker: 0.1, halo: 0.16, haloOpacity: 0.5, priority: 4, power: 0.4, radius: 2.0 },
    { kind: 'sky', x: HOLE.x, y: Y + 1.9, z: HOLE.z, color: 0xb8c8d0, intensity: 0.5, distance: 3.0, flicker: 0.03, speed: 0.2, pool: 0.75, poolX: HOLE.x, poolZ: HOLE.z, poolOpacity: 0.12, halo: 0.3, haloOpacity: 0.12, priority: 5, power: 0.42, radius: 2.4 },
    { kind: 'shroom', x: -4.3, y: Y + 0.25, z: -1.45, color: 0x5ad0d8, intensity: 0, real: false, halo: 0.22, haloOpacity: 0.3, pool: 0.4, poolOpacity: 0.12, flicker: 0.06, speed: 0.3, power: 0.28, radius: 1.1 },
    { kind: 'shroom', x: 7.15, y: Y + 0.25, z: -5.05, color: 0xa070f0, intensity: 0, real: false, halo: 0.22, haloOpacity: 0.3, pool: 0.4, poolOpacity: 0.12, flicker: 0.06, speed: 0.3, power: 0.28, radius: 1.1 },
    { kind: 'shroom', x: 0.72, y: Y + 0.25, z: -5.42, color: 0x5ad0d8, intensity: 0, real: false, halo: 0.2, haloOpacity: 0.28, pool: 0.35, poolOpacity: 0.1, flicker: 0.06, speed: 0.3, power: 0.24, radius: 1.0 },
    { kind: 'shroom', x: -4.75, y: Y + 0.5, z: -2.7, color: 0x6ae0c0, intensity: 0.35, real: true, distance: 1.8, halo: 0.2, haloOpacity: 0.32, flicker: 0.05, speed: 0.3, power: 0.36, radius: 1.4, priority: 2 },
    { kind: 'lantern', x: -4.25, y: Y + 1.15, z: -1.75, color: 0xffb060, intensity: 0.55, distance: 2.4, flicker: 0.12, halo: 0.14, haloOpacity: 0.5, pool: 0.45, poolOpacity: 0.12, priority: 4, power: 0.42, radius: 1.9 },
    { kind: 'lantern', x: FRONT.x - 0.62, y: Y + 1.05, z: FRONT.z + 0.22, color: 0xffb050, intensity: 0.6, distance: 2.6, flicker: 0.12, halo: 0.16, haloOpacity: 0.5, pool: 0.5, poolOpacity: 0.12, priority: 4, power: 0.45, radius: 2.0 },
  ];
  const cl = LIFT_LIGHTS.cage, lp = LIFT_LIGHTS.portal;
  L.push({ kind: 'lift', x: cl.x, y: cl.y, z: cl.z, color: 0xffb860, intensity: 0.4, distance: 2.0, flicker: 0.1, halo: 0.16, haloOpacity: 0.55, priority: 2, power: 0.16, radius: 1.3 });
  L.push({ kind: 'portal', x: lp.x, y: lp.y, z: lp.z, color: 0xffb050, intensity: 0.25, distance: 2.2, flicker: 0.12, halo: 0.18, haloOpacity: 0.55, pool: 0.6, poolOpacity: 0.15, priority: 4, power: 0.22, radius: 1.6 });
  for (const l of L) { l.room = null; l.fixed = true; }
  return L;
}

export class StarHouse {
  /** room: the tile-unit group (scaled by T); world: the meters scene (or a stand-in group in a worker). */
  constructor(room, world) {
    this.room = room;
    this.world = world;
    this.meshes = [];
    this.dyn = {};
    this.lights = [];
    this.boxes = [];
    this.furn = [];
    this.waters = [];
    this.waterSpecs = [];
    this.worms = [];
    this.drips = [];
    this.looks = [];
    this.shadowSpots = [];
    this.parts = []; // live pieces moved out of the merge into the room (their hinges keep working)
    this.liveBake = []; // live pieces that get the camp's baked light once
    this.steps = {};
    this.roomMeshes = {};
  }

  // ------------------------------------------------------------ a build job
  /** Build one job ('rock', 'west', 'east', 'ways'). opts: { doorOpen, notes }. */
  buildJob(id, opts = {}) {
    const t0 = performance.now();
    this.opts = opts;
    this.decor = new THREE.Group();
    this.room.add(this.decor);
    // (a job that fails leaves its part bare: better a bare corner than no camp)
    try { this[BUILDERS[id]](); } catch (e) { console.error(`[home] building ${id} failed`, e); this.failed = String(e?.message || e); }
    this.steps[id] = Math.round(performance.now() - t0);
    return this;
  }

  /**
   * Merge, bake and pack what buildJob made: { msg, transfer }. lights: every light in the camp
   * (for 'ways'); the other jobs bake with the camp's fixed lights and their own.
   */
  packJob(id, lights = null) {
    const t0 = performance.now();
    const transfer = [];
    // (every camp job bakes with the camp's fixed lights; 'ways' gets every job's)
    const L = (lights || [...campLights(), ...this.lights.filter((l) => !l.fixed)]).map(bakeLight);
    const amb = this.ambient();
    this.room.updateMatrixWorld(true);
    for (const o of this.parts) this.room.attach(o);
    const meshes = mergeStatic(this.decor, 'camp', L, amb, transfer);
    keepUnbatched(this.decor, this.world);
    this.room.remove(this.decor);
    // the live pieces get the same baked light once
    for (const o of [...this.parts, ...this.liveBake]) dynBake(o, L, amb);
    const merge = Math.round(performance.now() - t0);
    const surf = []; // (the camp's rock is a voxel piece of the 'rock' job, merged like the rest)
    // the live trees, and every reference into them
    this.room.updateMatrixWorld(true);
    const ctx = { ids: new Map(), next: 0, transfer, roomInv: new THREE.Matrix4().copy(this.room.matrixWorld).invert() };
    const nodes = [];
    for (const o of [...this.room.children]) nodes.push({ parent: 'room', node: packNode(o, ctx) });
    for (const o of [...this.world.children]) nodes.push({ parent: 'world', node: packNode(o, ctx) });
    const meta = packRef({ dyn: this.dyn, furn: this.furn, ...Object.fromEntries(KEEP.map((k) => [k, this[k]])) }, ctx);
    this.steps.merge = merge;
    const msg = {
      id, meshes, surf, nodes, meta,
      lights: this.lights, boxes: this.boxes, shadowSpots: this.shadowSpots, looks: this.looks, waters: this.waterSpecs, drips: this.drips,
      steps: this.steps, ms: Math.round(performance.now() - t0) + (this.steps[id] || 0),
    };
    return { msg, transfer };
  }

  // ------------------------------------------------------------ in the scene: the jobs put together
  /**
   * The camp from its packed jobs, in the scene: room (the tile group), world (the scene). Builds
   * the cage lift here (it's all moving parts).
   */
  static assemble(room, world, jobs, vista = null) {
    const t0 = performance.now();
    const h = new StarHouse(room, world);
    h.surfMeshes = [];
    for (const p of jobs) h.addPayload(p);
    h.surfaces = { meshes: h.surfMeshes, boxes: [], steps: {}, dispose() {} };
    let a = performance.now();
    h.buildLift();
    h.steps.lift = Math.round(performance.now() - a);
    h.buildUnder();
    void vista; // (no cavern outside: the camp is all rock round)
    // the few live behaviours that don't travel: the fire's flicker, the bellows' squeeze, the pins
    const fp = h.dyn.fireplace;
    if (fp) fp.update = (t) => flicker(fp.flames, t);
    const b = h.dyn.bellows;
    if (b?.parts && b.compress) b.setCompress = CP.bellowsCompress(b.parts, b.compress);
    const bd = h.dyn.board;
    if (bd?.pinData) bd.pins = (read) => TP.notesPins(bd.pinData, read);
    h.liftLantern = h.lights.find((l) => l.kind === 'lift') || null;
    h.steps.assemble = Math.round(performance.now() - t0);
    h.ms = jobs.reduce((s, p) => s + (p.ms || 0), 0) + h.steps.assemble;
    return h;
  }

  /** One packed job into the scene. */
  addPayload(p) {
    const room = this.room, world = this.world;
    const tag = (m, id) => { m.userData.room = id; (this.roomMeshes[id] ||= []).push(m); };
    for (const s of p.meshes) {
      const m = unquantize(s.q, matFrom(s.mt, CSCALE));
      if (s.outline) m.layers.enable(LAYER_OUTLINE);
      world.add(m);
      tag(m, s.room);
    }
    const ids = new Map();
    for (const n of p.nodes) (n.parent === 'room' ? room : world).add(unpackNode(n.node, ids));
    const meta = unpackRef(p.meta, ids, room);
    Object.assign(this.dyn, meta.dyn);
    this.furn.push(...(meta.furn || []));
    for (const k of KEEP) if (meta[k] !== undefined && meta[k] !== null) this[k] = meta[k];
    this.lights.push(...p.lights);
    this.boxes.push(...p.boxes);
    this.shadowSpots.push(...p.shadowSpots);
    this.looks.push(...p.looks);
    this.drips.push(...p.drips);
    for (const w of p.waters) this.addWaterMesh(w);
    Object.assign(this.steps, { [p.id]: p.ms });
  }

  /** The cage lift (built here: it's mostly moving parts), its static frame merged and lit with the camp. */
  buildLift() {
    const decor = new THREE.Group();
    this.room.add(decor);
    this.lift = new HomeLift(this.room, decor);
    this.lift.cage.traverse((m) => { m.userData.noBatch = true; });
    this.lift.root.traverse((m) => { m.userData.noBatch = true; });
    this.room.updateMatrixWorld(true);
    const L = this.lights.map(bakeLight), amb = this.ambient();
    for (const s of mergeStatic(decor, 'camp', L, amb, null)) {
      const m = unquantize(s.q, matFrom(s.mt, CSCALE));
      if (s.outline) m.layers.enable(LAYER_OUTLINE);
      m.userData.room = 'camp';
      this.world.add(m);
      (this.roomMeshes.camp ||= []).push(m);
    }
    this.room.remove(decor);
    dynBake(this.lift.cage, L, amb);
  }

  /**
   * The earth under the camp: from inside the lift shaft (riding up or down) you see its face,
   * timbered at the landing.
   */
  buildUnder() {
    const under = new THREE.Mesh(new THREE.BoxGeometry(SHAFT.x0 - HALL.x0, 3.6, -HALL.z0 + 0.5), new THREE.MeshLambertMaterial({ color: 0x2a1c12 }));
    under.position.set((HALL.x0 + SHAFT.x0) / 2, Y - 1.8 - 0.26, (HALL.z0 - 0.5) / 2);
    this.world.add(under);
    this.meshes.push(under);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, SHAFT.z1 - SHAFT.z0), new THREE.MeshLambertMaterial({ color: 0x4a2e1c }));
    lip.position.set(SHAFT.x0 - 0.02, Y - 0.09, (SHAFT.z0 + SHAFT.z1) / 2); // the landing's oak sill
    this.world.add(lip);
    this.meshes.push(lip);
  }

  // ------------------------------------------------------------ placing
  /** The floor's top under (x, z) (m). */
  ground(x, z) {
    if (z > STAIRS.z0 - 1e-4 && x >= STAIRS.x0 && x <= STAIRS.x1) return floorAt(x, z);
    return Y;
  }

  /** The roof over (x, z) (m). */
  roofAt(x, z) { return ceilAt(x, z); }

  /** Put obj at (x, y?, z) meters with yaw into the static decor (or `parent`); y defaults to the floor. */
  place(obj, x, z, yaw = 0, y = null, parent = this.decor) {
    obj.position.set(tl(x), tl(y ?? this.ground(x, z)), tl(z));
    obj.rotation.y = yaw;
    parent.add(obj);
    return obj;
  }

  /**
   * Put a wall piece against the rock: from (x, z) it's pushed back along -(nx, nz) (the way into
   * the rock) until it meets the rock at h m over the floor, its face toward (nx, nz). y: its foot
   * over the floor. Returns { x, z, yaw, nx, nz }.
   */
  onRock(obj, x, z, nx, nz, y = 0, h = 0.6, gap = 0.01, parent = this.decor) {
    let px = x, pz = z;
    for (let i = 0; i < 80 && hollowSD(px, pz) + lean(h) < -gap; i++) { px -= nx * 0.02; pz -= nz * 0.02; }
    const yaw = Math.atan2(nx, nz);
    this.place(obj, px, pz, yaw, Y + y, parent);
    return { x: px, z: pz, yaw, nx, nz };
  }

  /** Put a wall piece on a flat face of the shack (or anything): at (x, z) facing (nx, nz). */
  onFace(obj, x, z, nx, nz, y = 0, parent = this.decor) {
    this.place(obj, x, z, Math.atan2(nx, nz), Y + y, parent);
    return { x, z, yaw: Math.atan2(nx, nz), nx, nz };
  }

  /** Local point (tiles) of an object → world meters. */
  toM(obj, p) {
    obj.updateMatrixWorld(true);
    return new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(obj.matrixWorld);
  }

  /** A collision box (meters) round a placed thing: half sizes hw × hd turned by yaw, h tall. */
  boxAt(x, z, hw, hd, h, yaw = 0, y0 = null) {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    const ex = hw * c + hd * s, ez = hw * s + hd * c;
    const b = y0 ?? this.ground(x, z);
    this.boxes.push([x - ex, b, z - ez, x + ex, b + h, z + ez]);
    if (y0 === null && h > 0.15 && h < 2.0) this.shadowSpots.push({ x, z, w: ex * 2 + 0.16, h: ez * 2 + 0.16 }); // a soft contact shadow
  }

  /** A fixed light (meters): for the scene's light pool, its glows, and the bake (power, radius). */
  light(o) {
    const l = { flicker: 0.1, speed: 1, priority: 1, power: 0.4, radius: 1.5, room: null, ...o };
    this.lights.push(l);
    return l;
  }

  /** Something to look at (the scene turns these into interactables): { x, y, z, r | box, label, lines, aside }. */
  look(o) { this.looks.push(o); return o; }

  /** A floor piece at (x, z) turned by yaw, solid as a box hw × hd × h m when given (and its contact shadow). */
  prop(obj, x, z, yaw = 0, hw = 0, hd = 0, h = 0, y = null) {
    this.place(obj, x, z, yaw, y);
    if (hw && h) this.boxAt(x, z, hw, hd, h, yaw);
    return obj;
  }

  /** A candle's glow (no real light: a halo and a little baked warmth). */
  candleGlow(p, power = 0.16) {
    this.light({ kind: 'candle', x: p.x, y: p.y, z: p.z, color: 0xffc070, intensity: 0, real: false, halo: 0.07, haloOpacity: 0.6, flicker: 0.22, power, radius: 0.7 });
  }

  /** Candle stubs at (x, y, z) m. */
  stubs(x, z, y = null, n = 3, seed = 75) {
    const c = CMP.candleStubs(n, seed);
    this.place(c.obj, x, z, seed, y);
    for (const f of c.flames) this.candleGlow(this.toM(c.obj, f), 0.12);
    return c;
  }

  /** A cobweb in a corner of the rock or the shack: at (x, z), y m up, facing yaw. */
  web(x, y, z, yaw, s = 0.3, seed = 73) {
    const w = CMP.cobweb(s, seed);
    w.position.set(tl(x), tl(Y + y), tl(z));
    w.rotation.y = yaw;
    this.decor.add(w);
  }

  // ------------------------------------------------------------ the rock
  /** The hollow's rock, its floor and roof, the hole, roots, drips, the glow in the damp corners. */
  buildRock() {
    const rock = buildCaveRock();
    this.decor.add(rock.obj);
    this.holeTop = rock.top;
    for (const l of campLights()) this.lights.push(l);
    // water dripping from the roof onto the dark wet patches in the floor
    DRIPS.forEach((d, i) => {
      this.drips.push({ x: d.x, z: d.z, y: ceilAt(d.x, d.z) - 0.04, t: 1 + i * 0.7, every: 2.4 + (i % 3) * 1.3, pool: false });
    });
    // glowing mushrooms in the damp corners, a crystal cluster in the spring's nook
    for (const [x, z, hue, size, seed] of [[-4.3, -1.45, 1, 1.2, 3], [7.15, -5.05, 2, 1.1, 5], [0.72, -5.42, 1, 0.9, 7], [-3.7, -4.3, 0, 0.8, 9], [4.6, -5.4, 2, 0.8, 11]]) {
      const s = lowRes(() => glowShrooms(seed, hue, size));
      this.place(s.obj, x, z, seed);
    }
    this.look({ x: -4.3, y: Y + 0.2, z: -1.45, r: 0.3, label: 'Glowing mushrooms', pick: true, special: true });
    const cr = lowRes(() => crystals(17, 0.8, 2));
    this.place(cr.obj, -4.75, -2.75, 0.6);
    this.look({ x: HOLE.x, y: Y + 1.9, z: HOLE.z, r: 0.5, label: 'Look up at the hole', lines: ['A ragged hole in the roof, roots all round it, and far up a grey speck of daylight. That\'s where I came in.', 'Dirt still trickles down now and then. A long way down. Lucky the floor was soft.'], aside: 'hole' });
  }

  // ------------------------------------------------------------ the west: the forge corner, the fire pit, the spring
  buildWest() {
    const S = SPOTS;
    // his old stone forge against the north rock, its pipe up a crack in the roof
    const pipe = tl(ceilAt(S.forge.x, S.forge.z - 0.25) - Y + 0.35);
    const f = CP.forge(pipe, 5);
    this.place(f.obj, S.forge.x, S.forge.z, S.forge.yaw);
    this.dyn.forge = { embers: f.embers, flames: f.flames, fire: this.toM(f.obj, f.fire) };
    this.boxAt(S.forge.x, S.forge.z, 0.58, 0.41, 0.56, S.forge.yaw);
    this.boxAt(S.forge.x, S.forge.z - 0.17, 0.14, 0.14, 2.5, 0);
    const b = CP.bellows(7);
    this.place(b.obj, S.bellows.x, S.bellows.z, S.bellows.yaw);
    this.dyn.bellows = b;
    this.parts.push(b.obj);
    this.boxAt(S.bellows.x, S.bellows.z, 0.45, 0.24, 0.62, S.bellows.yaw);
    // the anvil on its stump, the quench trough and his bucket, coal, scrap, tools against the rock
    const a = CP.anvil(9);
    this.place(a.obj, S.anvil.x, S.anvil.z, S.anvil.yaw);
    this.dyn.anvilFace = this.toM(a.obj, a.face);
    this.boxAt(S.anvil.x, S.anvil.z, 0.3, 0.14, 0.72, S.anvil.yaw);
    const tr = CP.trough(13);
    this.place(tr.obj, S.trough.x, S.trough.z, S.trough.yaw);
    const ws = this.toM(tr.obj, { x: 0, y: tr.water.y, z: 0 });
    this.addWater('trough', ws.x, ws.y, ws.z, tr.water.w * T, tr.water.d * T, S.trough.yaw, 0x1e3a44);
    this.boxAt(S.trough.x, S.trough.z, 0.52, 0.2, 0.42, S.trough.yaw);
    this.dyn.troughAt = { x: S.trough.x, y: ws.y, z: S.trough.z };
    const bk = CP.quenchBucket(15);
    this.place(bk.obj, S.trough.x + 0.32, S.trough.z + 0.62, 0.4);
    this.dyn.bucket = { obj: bk.obj, water: bk.water, home: { x: S.trough.x + 0.32, z: S.trough.z + 0.62 } };
    this.parts.push(bk.obj);
    const coal = lowRes(() => CP.coalHeap(33));
    this.place(coal.obj, S.coal.x, S.coal.z, S.coal.yaw);
    this.onRock(CMP.toolsLeaning(77), S.rack.x + 0.4, S.rack.z, 1, 0, 0, 0.9);
    this.boxAt(S.rack.x + 0.05, S.rack.z, 0.12, 0.55, 1.1);
    this.prop(KP.scrapPile(), -3.15, -3.3, 0.8, 0.3, 0.24, 0.25);
    this.prop(KP.grindstone(), -0.05, -3.55, -Math.PI / 2, 0.38, 0.26, 0.7);
    for (const [x, z, s] of [[-0.45, -5.48, 1], [-3.55, -4.42, 2]]) { const o = sack({ seed: s, color: 0x4a4440 }); this.place(o.obj, x, z, s); }
    this.onRock(KP.horseshoes(), -2.0, -5.3, 0, 1, 1.35, 1.4);
    const lan = HP.hangingOilLamp(0.45, 98);
    this.place(lan.obj, -1.5, -4.35, 0, ceilAt(-1.5, -4.35) - 0.02);
    this.web(-3.3, 1.2, -5.25, Math.PI / 4, 0.32, 1);
    // the fire pit in its ring of stones, the tripod and the kettle (the cooking spot)
    const ch = CP.cookHearth(23);
    this.place(ch.obj, S.fire.x, S.fire.z, 0.4);
    const fire = this.toM(ch.obj, ch.fire);
    this.dyn.hearth = { flames: ch.flames, embers: ch.embers, fire, pot: this.toM(ch.obj, ch.pot), kettle: this.toM(ch.obj, ch.kettle) };
    this.dyn.fireplace = { flames: ch.flames, fire };
    this.boxAt(S.fire.x, S.fire.z, 0.36, 0.36, 0.28);
    this.look({ x: S.fire.x, y: Y + 0.4, z: S.fire.z, r: 0.2, label: 'The kettle', lines: ['A black iron kettle on a hook, older than you. It sings when it boils, a bit flat.', 'Soot an inch thick on the pot. "Seasoning," says Old Star.'] });
    // logs to sit on round the fire
    for (const [x, z, yaw, seed] of [[-0.9, -1.25, 0, 85], [0.05, -2.15, Math.PI / 2, 86]]) {
      const lg = CMP.logSeat(0.85, seed);
      this.place(lg.obj, x, z, yaw);
      const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
      this.furn.push({ id: 'chair', obj: lg.obj, seats: [{ x: lg.seat.x, z: lg.seat.z, y: lg.seat.y, yaw: 0 }], box: [x - 0.42 * c - 0.15 * s, Y, z - 0.42 * s - 0.15 * c, x + 0.42 * c + 0.15 * s, Y + 0.3, z + 0.42 * s + 0.15 * c] });
      this.boxAt(x, z, 0.42, 0.13, 0.26, yaw);
    }
    // the plank table, one wobbly stool and a crate for the other seat, herbs drying from the roof
    const tb = CP.table(25);
    this.place(tb.obj, S.table.x, S.table.z, S.table.yaw);
    this.boxAt(S.table.x, S.table.z, 0.47, 0.27, 0.45);
    const st = CP.stool(27);
    const sx = S.table.x - 0.1, sz = S.table.z + 0.5;
    this.place(st.obj, sx, sz, 0.35);
    this.furn.push({ id: 'chair', obj: st.obj, seats: [{ x: 0, z: 0, y: st.seat.y, yaw: Math.PI }], box: [sx - 0.15, Y, sz - 0.15, sx + 0.15, Y + 0.32, sz + 0.15] });
    this.boxAt(sx, sz, 0.14, 0.14, 0.3);
    const cr = crate(4, {});
    this.place(cr.obj, S.table.x - 0.72, S.table.z - 0.05, 0.3);
    this.boxAt(S.table.x - 0.72, S.table.z - 0.05, 0.2, 0.2, 0.32, 0.3);
    this.place(CP.herbLine(1.0, 31), S.table.x, S.table.z - 0.1, 0.1, ceilAt(S.table.x, S.table.z) - 0.12);
    // stores along the south rock: crates, a barrel of water, sacks, the food crate
    for (const [x, z, k, s] of [[-3.55, -0.82, 'crate', 1], [-3.0, -0.7, 'barrel', 3], [-1.62, -0.66, 'crate', 2], [-1.18, -0.62, 'sack', 5]]) {
      const o = k === 'crate' ? crate(s, { open: s === 2 }) : k === 'barrel' ? barrel(s, { fill: 'water' }) : sack({ seed: s });
      this.place(o.obj, x, z, s * 0.7);
      if (k !== 'sack') this.boxAt(x, z, 0.22, 0.22, k === 'crate' ? 0.4 : 0.5, s * 0.7);
    }
    this.look({ x: -1.62, y: Y + 0.45, z: -0.66, r: 0.28, label: 'The food crate', larder: true, special: true });
    const sh = CP.shelf(0.9, 29);
    this.onRock(sh.obj ?? sh, -2.55, -0.6, 0, -1, 0.82, 1.2);
    this.stubs(-3.0, -0.7, Y + 0.5, 2, 76);
    this.web(-3.9, 1.05, -0.62, -Math.PI * 0.75, 0.28, 2);
    // the spring in the side nook: a crack in the rock, a slick of moss, a basin of stones
    const sp = CMP.springBasin(81);
    const spp = this.onRock(sp.obj, S.sink.x - 0.2, S.sink.z, 1, 0, 0, 0.7);
    const bw = this.toM(sp.obj, sp.basin);
    this.addWater('pool', bw.x, Y + 0.05, bw.z, sp.water.r * 2 * T, sp.water.r * 2 * T, 0, 0x1e3a40, true);
    this.dyn.pump = this.toM(sp.obj, sp.spout);
    this.drips.push({ x: this.dyn.pump.x, z: this.dyn.pump.z, y: this.dyn.pump.y - 0.01, t: 1, every: 1.6, pool: true });
    this.boxAt(bw.x, bw.z, 0.3, 0.3, 0.12);
    void spp;
    const sl = HP.hangingOilLamp(0.35, 95);
    this.place(sl.obj, -4.25, -1.75, 0, ceilAt(-4.25, -1.75) - 0.02);
    this.look({ x: bw.x, y: Y + 0.3, z: bw.z, r: 0.3, label: 'The spring', lines: ['Water seeping out of the rock, cold enough to hurt your teeth. Old Star\'s drunk from it for forty years.', 'A tin cup on a string, hung on a nail in the rock. Rust on the nail, none on the cup.'] });
  }

  // ------------------------------------------------------------ the east: his shack, the hole, the lift, the way out
  buildEast() {
    const S = SPOTS, K = SHACK;
    // the shack: warped grey planks and a patched tarp against the north rock
    const sk = CMP.shack({ W: K.W, D: K.D, Hf: K.Hf, Hb: K.Hb, dc: K.dc, dw: K.dw, wc: 0.72, ww: 0.42, seed: 71 });
    this.place(sk.obj, K.x, K.z, 0);
    for (const [a, b, c, d] of sk.walls) this.boxes.push([K.x + a, Y, K.z + b, K.x + c, Y + 1.8, K.z + d]);
    this.boxes.push([K.x - K.W / 2 - 0.1, Y + K.Hf - 0.05, K.z - K.D - 0.1, K.x + K.W / 2 + 0.1, Y + K.Hb + 0.2, K.z + 0.3]); // its roof
    const hook = this.toM(sk.obj, sk.hook);
    const lan = lanternOnHook(3);
    lan.obj.scale.setScalar(0.9);
    this.place(lan.obj, hook.x, K.z + 0.05, 0, Y + 0.72);
    this.look({ x: K.x, y: Y + 1.2, z: K.z + 0.05, r: 0.5, label: 'Old Star\'s shack', lines: ['Planks gone grey, nailed over planks gone greyer. Every winter he says he\'ll build a proper house.', 'A tarp for a roof, patched with sacks, a shirt and what looks like a flag. It keeps the drips off. Mostly.'] });
    // inside: his cot along the back wall, his armchair, a crate with a candle, the gramophone, books
    const cot = CP.cot(19);
    this.place(cot.obj, S.cot.x, S.cot.z, 0);
    this.dyn.cot = { obj: cot.obj, lie: cot.lie };
    this.boxAt(S.cot.x, S.cot.z, 0.56, 0.28, 0.32);
    this.look({ x: S.cot.x, y: Y + 0.35, z: S.cot.z, r: 0.35, label: 'Old Star\'s cot', lines: ['A cot that sags in the middle like a hammock. The quilt is more darns than quilt.', 'A red nightcap on the pillow, and a moth hole in the nightcap.'] });
    const ac = buildFurniture('armchair', {});
    const ay = Math.atan2(K.x + K.dc - S.armchair.x, K.z + 0.4 - S.armchair.z);
    this.place(ac.obj, S.armchair.x, S.armchair.z, ay);
    this.furn.push({ id: 'armchair', obj: ac.obj, seats: ac.seats, box: null });
    this.boxAt(S.armchair.x, S.armchair.z, 0.24, 0.24, 0.5, ay);
    const ct = CMP.crateTable(89);
    this.place(ct.obj, K.x + 0.95, K.z - 1.05, 0.2);
    this.boxAt(K.x + 0.95, K.z - 1.05, 0.22, 0.22, 0.35, 0.2);
    const gr = KP.gramophone();
    gr.obj.scale.setScalar(0.62);
    this.place(gr.obj, K.x + 0.95, K.z - 1.05, -0.4, Y + 0.35);
    this.gramophone = this.toM(gr.obj, gr.horn);
    this.look({ x: K.x + 0.95, y: Y + 0.65, z: K.z - 1.05, r: 0.25, label: 'Wind the gramophone', gramophone: true, special: true });
    this.prop(KP.bookStack(6, 205), S.books.x, S.books.z, 0.4, 0.2, 0.18, 0.3);
    this.prop(KP.bookStack(4, 206), S.books.x + 0.05, S.books.z - 0.38, 1.2);
    this.look({ x: S.books.x, y: Y + 0.3, z: S.books.z, r: 0.3, label: 'Browse the books', books: true, aside: 'books' });
    this.stubs(S.cot.x - 0.62, S.cot.z + 0.05, Y, 3, 74);
    this.web(K.x - K.W / 2 + 0.05, K.Hb - 0.35, K.z - K.D + 0.05, Math.PI / 4, 0.26, 3);
    this.web(K.x + K.W / 2 - 0.05, K.Hb - 0.4, K.z - K.D + 0.05, -Math.PI / 4, 0.24, 4);
    // his notes on the shack's east wall, outside; the clock on a crate by the door; straw, a log, the drying line
    this.buildBoard();
    const ct2 = CMP.crateTable(90);
    this.place(ct2.obj, S.clock.x, S.clock.z, -0.3);
    this.boxAt(S.clock.x, S.clock.z, 0.22, 0.22, 0.35, -0.3);
    this.candleGlow(this.toM(ct2.obj, ct2.flame), 0.18);
    this.place(CMP.alarmClock(87), S.clock.x - 0.08, S.clock.z + 0.06, -0.5, Y + 0.35);
    this.look({ x: S.clock.x, y: Y + 0.45, z: S.clock.z, r: 0.22, label: 'The alarm clock', clock: true });
    this.place(CMP.strawPile(0.8, 0.5, 79), K.x - 1.05, K.z + 0.45, 0.3);
    const dl = CMP.dryingLine(1.5, 83);
    this.place(dl, K.x - K.W / 2 - 0.62, K.z + 0.25, 0.35, Y + 1.32);
    this.prop(KP.logBasket(), K.x + K.W / 2 + 0.45, K.z - 1.4, 0.3, 0.27, 0.2, 0.3);
    // what came down with you, under the hole
    const db = lowRes(() => RP.fallDebris(65));
    db.obj.scale.setScalar(0.55);
    this.place(db.obj, S.rubble.x, S.rubble.z, 0.3, Y + 0.01);
    this.glints = db.glints.map((p) => { const w = this.toM(db.obj, p); w.y = Y + 0.03; return w; });
    this.dyn.debris = db.obj;
    this.boxAt(S.rubble.x, S.rubble.z, 0.3, 0.3, 0.12);
    // his slate of the million, propped against the south rock over a crate of odds
    const tb = HP.tallyBoard();
    const tp = this.onRock(tb.obj, S.dream.x, S.dream.z - 0.3, 0, -1, 0.4, 1.0);
    this.look({ x: tp.x, y: Y + 0.85, z: tp.z - 0.05, r: 0.45, label: 'The slate on the rock', lines: ['"THE WAY UP", chalked over a long thermometer to a million. It reached nearly halfway once.', 'Then it was rubbed out, right down to the bottom. "LONG STORY", says the chalk.', 'Tally marks down the side. Years, by the look of them. Lots of years.'], aside: 'dream' });
    const oc = crate(7, {});
    this.place(oc.obj, S.dream.x, S.dream.z - 0.12, 0.2);
    this.boxAt(S.dream.x, S.dream.z - 0.12, 0.22, 0.22, 0.38, 0.2);
    // the east: his chest, the coal cart by the lift, the Miners' Board on its posts, the suitcase by the door
    const chs = TP.lootChest(17);
    const cg = group(chs.obj, chs.lid, chs.loot);
    this.place(cg, S.chest.x, S.chest.z, S.chest.yaw, null, this.room);
    this.dyn.chest = { ...chs, group: cg };
    cg.traverse((m) => { m.userData.noBatch = true; });
    this.liveBake.push(cg);
    this.boxAt(S.chest.x, S.chest.z, 0.32, 0.2, 0.36, S.chest.yaw);
    const c = lowRes(() => RP.mineCart(57));
    this.place(c.obj, S.cart.x, S.cart.z, Math.PI / 2, Y);
    this.boxAt(S.cart.x, S.cart.z, 0.36, 0.27, 0.6, Math.PI / 2);
    const mb = TP.minersBoard(49);
    const mp = this.onFace(mb, S.miners.x, S.miners.z, 1, 0, 0.5);
    this.place(CMP.boardPosts(1.05, 1.42, 91), S.miners.x - 0.03, S.miners.z, Math.PI / 2);
    for (const dz of [-0.52, 0.52]) this.boxes.push([S.miners.x - 0.08, Y, S.miners.z + dz - 0.05, S.miners.x + 0.02, Y + 1.4, S.miners.z + dz + 0.05]);
    this.minersAt = { x: mp.x + 0.04, z: mp.z, y: Y + 0.5, nx: 1 };
    const su = HP.suitcase();
    this.place(su.obj, S.suitcase.x, S.suitcase.z, 0.12);
    this.boxAt(S.suitcase.x, S.suitcase.z, 0.36, 0.16, 0.4, 0.12);
    this.look({ x: S.suitcase.x, y: Y + 0.3, z: S.suitcase.z, r: 0.3, label: 'The old suitcase', lines: ['A leather suitcase, packed and strapped. A SURFACE EXPRESS label on the side. Dust on the hat.', 'Packed for a trip that never happened. Nobody has moved it in years. Nobody wants to.'], aside: 'suitcase' });
    const dl2 = lanternOnHook(4);
    this.onRock(dl2.obj, FRONT.x - 0.62, FRONT.z + 0.25, 0, 1, 0.62, 1.1);
    const bs = HP.bootsAndStick();
    this.place(bs.obj, FRONT.x + 0.72, FRONT.z + 0.32, 0.2);
    for (const [x, z, k, s] of [[5.35, -1.25, 'barrel', 6], [7.15, -0.88, 'crate', 8], [7.28, -1.32, 'crate', 9], [5.1, -2.3, 'sack', 6]]) {
      const o = k === 'crate' ? crate(s, {}) : k === 'barrel' ? barrel(s, { fill: null }) : sack({ seed: s });
      this.place(o.obj, x, z, s * 0.7);
      if (k !== 'sack') this.boxAt(x, z, 0.22, 0.22, k === 'crate' ? 0.4 : 0.5, s * 0.7);
    }
    const ll = HP.hangingOilLamp(0.5, 96);
    this.place(ll.obj, 6.55, -2.25, 0, ceilAt(6.55, -2.25) - 0.02);
    this.web(SHAFT.x0 - 0.05, 1.45, SHAFT.z0 - 0.32, -Math.PI / 2, 0.3, 5);
    this.web(4.4, 1.15, -0.45, Math.PI, 0.26, 6);
  }

  /** The notes board on the shack's east wall (outside, facing east). */
  buildBoard() {
    const S = SPOTS;
    const board = TP.notesBoard(Math.max(3, Math.min(10, this.opts.notes ?? 8)), 13);
    const bp = this.onFace(board.obj, S.board.x, S.board.z, 1, 0, 0.5);
    this.boardObj = board.obj;
    this.dyn.board = board;
    this.notePins = board.notes.map((q) => this.toM(board.obj, { x: q.x, y: q.y, z: 0.1 }));
    this.boardAt = { x: bp.x, z: bp.z, y: Y + 0.5, w: (board.w ?? 1.6) * T, h: (board.h ?? 1.2) * T, nx: 1 };
    this.light({ kind: 'notes', x: bp.x + 0.5, y: Y + 1.3, z: bp.z, color: 0xffd8a0, intensity: 0, real: false, power: 0.3, radius: 1.2 });
  }

  // ------------------------------------------------------------ the ways in and out, the walls' collision
  buildWays() {
    // the worn steps up the rock passage to your nook, and the doorway's old frame
    const steps = RP.wornSteps(64, 2, Math.round(STEP_H * 64), Math.round(STEP_D * 64), 43);
    this.place(steps.obj, ARCH.x, HALL.z1 - 2 * STEP_D, Math.PI, Y);
    const df = HP.doorFrame(ARCH.hw * 2, ARCH.h - Y, -HALL.z1, 7, { roundTop: true, step: -Y });
    this.place(df, ARCH.x, HALL.z1 / 2, 0, Y);
    // the old door to Deep Town in its tunnel mouth: choked with rubble until it's dug
    const P = FRONT;
    const door = townDoor(!!this.opts.doorOpen, 4);
    const frame = group(door.frame, door.hinge);
    this.place(frame, P.x, P.z, 0, Y);
    this.parts.push(frame);
    this.doorFrame = frame;
    this.doorLeaf = door.hinge;
    this.passage = { x: P.x, z: P.z };
    if (!this.opts.doorOpen) {
      const rb = doorRubble(4);
      this.place(rb, P.x, P.z + 0.05, 0, Y);
      this.boxes.push([P.x - 0.55, Y, P.z, P.x + 0.55, Y + 0.5, P.z + 0.4]);
    } else this.light({ kind: 'door', x: P.x, y: Y + 0.95, z: P.z + 0.15, color: 0xffd090, intensity: 0.8, distance: 2.8, flicker: 0.08, halo: 0.25, haloOpacity: 0.4, priority: 3, power: 0.4, radius: 1.6 });
    this.boxes.push([P.x - 0.6, Y, P.z - 0.6, P.x + 0.6, Y + 1.6, P.z - 0.02]); // the door itself and the tunnel behind
    // the steps' collision, the floor, the rock walls
    for (let i = 1; i <= 2; i++) this.boxes.push([STAIRS.x0, Y, HALL.z1 - i * STEP_D, STAIRS.x1, -i * STEP_H, HALL.z1 - (i - 1) * STEP_D]);
    this.boxes.push([HALL.x0, Y - 1, HALL.z0, SHAFT.x0, Y, HALL.z1 + 0.02]);
    this.boxes.push(...caveBoxes());
  }

  // ------------------------------------------------------------ water
  /** A still water surface (meters), w × d, turned by yaw; rippled by the scene (ripple()). Made in the scene. */
  addWater(name, x, y, z, w, d, yaw, color, round = false) {
    this.waterSpecs.push({ name, x, y, z, w, d, yaw, color, round });
  }

  addWaterMesh({ name, x, y, z, w, d, yaw, color, round }) {
    const mat = waterMaterial(color, round);
    mat.uniforms.uHalf.value.set(w / 2, d / 2);
    const geo = new THREE.PlaneGeometry(w, d, 1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.renderOrder = 2;
    m.userData.room = roomAt(x, z)?.id ?? null;
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
    const c = Math.cos(-w.yaw), s = Math.sin(-w.yaw), dx = x - w.x, dz = z - w.z;
    U.uRip.value[i].set(dx * c + dz * s, -dx * s + dz * c, U.uTime.value, k);
  }

  /** Ambient for baking props: dimmer up high and in corners, a warm floor bounce. */
  ambient() {
    // a dim cave: little light but the fires', deep shadow up under the rock and in the corners
    return (x, y, z, nx, ny, nz, out) => {
      let k = 0.5;
      const h = y - Y;
      if (h > 1.2) k *= Math.max(0.45, 1 - (h - 1.2) * 0.45);
      if (h < 0.15) k *= Math.max(0.6, 0.82 + h * 1.4);
      if (ny < -0.5) k *= 0.7;
      const edge = hollowSD(x, z);
      if (edge > -0.5) k *= 0.82 + Math.max(0, -edge) * 0.36; // the rock's own shade near the walls
      out[0] = k * 0.86; out[1] = k * 0.9; out[2] = k; // (cool: the firelight is the warm)
    };
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
    const hk = 0.8 + 0.2 * Math.sin(time * 6.3 + 2) * Math.sin(time * 3.1);
    this.dyn.hearth.embers.material.color.setRGB(0.75 + hk * 0.35, 0.68 + hk * 0.28, 0.6 + hk * 0.2);
    this.dyn.fireplace.update?.(time);
    if (this.dyn.pendulum) this.dyn.pendulum.rotation.z = Math.sin(time * Math.PI) * 0.16;
    for (const w of this.waters) w.mat.uniforms.uTime.value = time;
  }

  dispose() {
    this.surfaces?.dispose();
    this.vista?.dispose();
    for (const m of this.meshes) { m.geometry.dispose(); m.material.dispose(); }
    for (const list of Object.values(this.roomMeshes)) for (const m of list) m.geometry.dispose();
  }
}

// ---------------------------------------------------------------- merging and baking
/** A light as the bake wants it (a little stronger and wider than the live one, which flickers on top). */
function bakeLight(l) { return { x: l.x, y: l.y, z: l.z, color: l.color, power: (l.power ?? 0.4) * 1.3, radius: (l.radius ?? 1.2) * 1.15, room: l.room, spill: l.spill }; }

/**
 * Merge the static voxel meshes under `decor` by material (into < 64 k vertex chunks), bake the
 * lights into them and pack them: [{ room, q, mt, outline }]. room: the job's room, or null to
 * file each piece under the room it stands in (the doors between rooms). Marks what it took.
 */
function mergeStatic(decor, room, L, amb, transfer) {
  decor.updateMatrixWorld(true);
  const groups = new Map();
  decor.traverse((m) => {
    if (!m.isMesh || !m.geometry || m.userData.noBatch) return;
    const g = m.geometry;
    if (!g.getAttribute('color') || g.getAttribute('uv') || !g.index) return;
    if (!m.visible || !g.index.count) { m.userData.batched = true; return; }
    const mt = matDesc(m.material);
    if (!mt) return;
    const wg = worldGeo(m, mergeQuads(g));
    let rid = room;
    if (!rid) {
      wg.computeBoundingSphere();
      const c = wg.boundingSphere.center;
      rid = (roomAt(c.x, c.z) || nearestRoom(c.x, c.z)).id;
    }
    const outline = m.layers.isEnabled(LAYER_OUTLINE);
    const key = rid + '|' + JSON.stringify(mt) + '|' + (outline ? 1 : 0);
    let e = groups.get(key);
    if (!e) groups.set(key, (e = { room: rid, mt, outline, merger: new Merger() }));
    e.merger.add(wg);
    m.userData.batched = true;
  });
  decor.traverse((m) => { if (m.isMesh && m.userData.batched) m.geometry.dispose(); });
  const out = [];
  for (const e of groups.values()) {
    for (const geo of e.merger.build()) {
      if (e.mt.k !== 'basic') bakeRooms(geo, L, amb);
      const q = quantize(geo);
      if (transfer) qTransfer(q, transfer);
      out.push({ room: e.room, q, mt: e.mt, outline: e.outline });
      geo.dispose();
    }
    for (const c of e.merger.chunks) for (const g of c.geos) g.dispose();
  }
  return out;
}

/** The room nearest (x, z) (for things in a doorway or a wall). */
function nearestRoom(x, z) {
  let best = ROOMS[0], bd = Infinity;
  for (const r of ROOMS) {
    const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1), d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

/** Bake the lights into a live piece's vertex colors (once, in its place). */
function dynBake(obj, L, amb) {
  if (!obj) return;
  obj.updateMatrixWorld(true);
  obj.traverse((m) => {
    if (!m.isMesh || !m.geometry.getAttribute('color') || m.material.isMeshBasicMaterial) return;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    bakeRooms(g, L, amb);
    m.geometry.setAttribute('color', g.getAttribute('color'));
    g.dispose();
  });
}

/** The flames' flicker (as the fireplace's own update did). */
function flicker(flames, t) {
  (flames || []).forEach((m, i) => {
    const s0 = (m.userData.s0 ||= m.scale.clone());
    m.scale.set(s0.x * (0.8 + 0.25 * Math.sin(t * 6 + i * 2)), s0.y * (0.5 + 0.55 * Math.abs(Math.sin(t * (4.1 + i * 1.3) + i * 1.7)) + 0.1 * Math.sin(t * 11 + i)), s0.z);
  });
}

// ---------------------------------------------------------------- baking by room
const _c = new THREE.Color();
/**
 * Bake the fixed lights into a merged geometry's vertex colours, each vertex lit only by the
 * lights of the room it stands in (walls between rooms keep the light in).
 */
function bakeRooms(geo, lights, ambient) {
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), colA = geo.getAttribute('color');
  if (!pos || !nor || !colA) return;
  const P = pos.array, N = nor.array, C = colA.array;
  const L = lights.map((l) => { _c.setHex(l.color ?? 0xffc070); const p = l.power ?? 1; return { ...l, r: _c.r * p, g: _c.g * p, b: _c.b * p, rad: l.radius ?? 2 }; });
  const amb = [1, 1, 1];
  const byRoom = L.some((l) => l.room); // (the camp's lights light everything they reach: no room walls)
  let lastRoom = undefined, list = L;
  for (let i = 0; i < pos.count; i++) {
    const k = i * 3, x = P[k], y = P[k + 1], z = P[k + 2];
    const room = byRoom ? roomAt(x, z)?.id ?? null : null;
    if (byRoom && room !== lastRoom) { lastRoom = room; list = room ? L.filter((l) => !l.room || l.room === room || l.spill?.includes(room)) : L; }
    ambient(x, y, z, N[k], N[k + 1], N[k + 2], amb);
    let r = amb[0], g = amb[1], b = amb[2];
    for (const l of list) {
      const dx = l.x - x, dy = l.y - y, dz = l.z - z;
      const d2 = dx * dx + dy * dy + dz * dz, r2 = l.rad * l.rad;
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2) || 1e-4;
      const w = ((dx * N[k] + dy * N[k + 1] + dz * N[k + 2]) / d) * 0.65 + 0.35;
      if (w <= 0) continue;
      const t = 1 - d2 / r2, a = t * t * w;
      r += l.r * a; g += l.g * a; b += l.b * a;
    }
    C[k] *= Math.min(2.0, r); C[k + 1] *= Math.min(2.0, g); C[k + 2] *= Math.min(2.0, b);
  }
  colA.needsUpdate = true;
}

// ---------------------------------------------------------------- water
/** Dark still water: a deep tint, a sheen that wobbles, and up to four ripple rings (uRip: x, z, t0, k). */
function waterMaterial(color, round) {
  const rip = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0));
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(color) }, uRip: { value: rip }, uRipN: { value: 0 }, uRound: { value: round ? 1 : 0 }, uHalf: { value: new THREE.Vector2(1, 1) } },
    vertexShader: /* glsl */`
      varying vec3 vL; varying vec3 vW;
      void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uCol; uniform vec4 uRip[4]; uniform float uRound; uniform vec2 uHalf;
      varying vec3 vL; varying vec3 vW;
      void main() {
        if (uRound > 0.5 && length(vL.xz / uHalf) > 1.0) discard; // a round pool
        vec2 p = floor(vL.xz * 64.0) / 64.0; // 1/64 m texels
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
        col += vec3(0.9, 0.5, 0.2) * pow(h, 6.0) * 0.12;
        gl_FragColor = vec4(col, 0.86);
      }`,
  });
}

export { LIFT };

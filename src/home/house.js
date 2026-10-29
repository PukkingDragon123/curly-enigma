// Old Star's house, three worn steps down from your bedroom: the living room with his fireplace
// between two round windows, his armchair and the old settee on the big rug, bookcases, the
// grandfather clock, his notes board, his trinket shelf; the kitchen with the range in its brick
// inglenook (the cooking station), the sink and pump under the window, the pantry shelves, the
// plate dresser and the dining table; the smithy with his forge and its hood, the bellows, the
// anvil, the quench trough, the tool rack and his box bed, warm from the forge; the hall with the
// cage lift down to the mine, the front door (the way to Deep Town, caved in until you find it
// from below), coats and boots, the Miners' Board, his chest, the coal cart and his dream wall: the
// million-gold tally and the suitcase that was packed once. The hole you fell through is boarded
// over in the living room ceiling, with what came down swept into the corner.
//
// Built in jobs (JOBS: one per room, then 'ways', the doors and steps between them), each of which
// can run in a build worker (houseWorker.js, driven by houseLoad.js) or on the main thread: a job
// builds its room's furnishings and its walls, ceiling and floor, merges the static voxels by
// material, bakes the room's fixed lights into them (a light only lights its own room) and packs
// it all (pack.js); the scene puts the packed jobs back together (StarHouse.assemble), builds the
// cage lift itself, and keeps fires, the clock's pendulum, water and moving parts live. Also the
// lights (for the scene's light pool), the collision boxes, the seats and Old Star's places.
import * as THREE from 'three';
import { keepUnbatched } from '../iso/vox.js';
import { lowRes, group } from '../iso/kit.js';
import { barrel, crate, sack, hangingRoot } from '../iso/props.js';
import { buildFurniture } from '../iso/furniture.js';
import { townDoor, doorRubble } from './props.js';
import * as TP from './tavernProps.js';
import * as CP from './caveProps.js';
import * as RP from './ruinProps.js';
import * as HP from './houseProps.js';
import * as GP from './gardenProps.js';
import * as WP from './workshopProps.js';
import * as KP from './clutterProps.js';
import { HouseSurfaces, unpackSurfaces, surfaceBoxes } from './surfaces.js';
import { buildVista } from './vista.js';
import { ROOM, ROOMS, DOORS, WINDOWS, FY, WALL, sideInfo, roomAt } from './plan.js';
import { T, HALL, ARCH, STAIRS, SHAFT, FRONT, HOLE, STEP_H, STEP_D, floorAt } from './units.js';
import { HomeLift, LIFT, LIFT_LIGHTS } from './lift.js';
import { makeRng } from '../core/util.js';
import { Merger, worldGeo, mergeQuads, matDesc, matFrom, quantize, qTransfer, unquantize, packNode, unpackNode, packRef, unpackRef, CSCALE } from './pack.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

const tl = (m) => m / T;
const Y = FY;

/** Where things are (meters). */
export const SPOTS = {
  // the smithy
  forge: { x: -2.55, z: -6.72, yaw: 0 },
  bellows: { x: -3.62, z: -6.7, yaw: Math.PI },
  anvil: { x: -2.3, z: -5.5, yaw: -0.55 },
  trough: { x: -1.08, z: -5.95, yaw: Math.PI / 2 },
  rack: { x: -5.0, z: -6.3 },
  coal: { x: -1.5, z: -6.85, yaw: 0.4 },
  cot: { x: -5.0, z: -4.62 },
  // the kitchen
  fire: { x: -3.95, z: -2.75 },
  sink: { x: -5.0, z: -1.85 },
  table: { x: -2.6, z: -1.62, yaw: 0 }, // (clear of the way to the larder door)
  chairs: [{ x: -2.9, z: -2.19, yaw: 0 }, { x: -2.3, z: -2.19, yaw: 0 }, { x: -2.9, z: -1.05, yaw: Math.PI }, { x: -2.3, z: -1.05, yaw: Math.PI }],
  // the living room
  hearth: { x: 2.1, z: -5.8 },
  armchair: { x: 1.12, z: -4.3 },
  sofa: { x: 2.55, z: -3.48 },
  board: { x: 4.8, z: -4.65 },
  clock: { x: 4.55, z: -3.45 },
  rubble: { x: 3.95, z: -1.05 },
  trinkets: { x: 0.7, z: -0.31 },
  // the hall
  chest: { x: 6.35, z: -0.62, yaw: Math.PI },
  miners: { x: 5.0, z: -4.25 },
  cart: { x: 7.25, z: -1.9 },
  dream: { x: 7.8, z: -0.95 },
  suitcase: { x: 7.12, z: -5.45 },
  passage: { x: FRONT.x, z: FRONT.z },
  // (old names kept for the scene and the tests)
  pool: { x: -4.55, z: -1.85 },
  mound: { x: 3.95, z: -1.05 },
  winch: { x: 7.25, z: -1.9 },
  dais: { x: 7.4, z: -0.95 },
  sealed: { x: 7.8, z: -0.95 },
  mosaic: { x: 2.1, z: -4.0 },
};

/** Old Star's places: where he stands (or sits / lies), which way he faces, his pose. */
export const STAR_SPOTS = {
  anvil: { x: -2.78, z: -5.12, face: { x: SPOTS.anvil.x, z: SPOTS.anvil.z }, pose: 'hammer' },
  bellows: { x: -3.4, z: -6.12, face: { x: -3.3, z: -6.8 }, pose: 'pump' },
  fire: { x: -3.75, z: -2.22, face: { x: -3.85, z: -3.2 }, pose: 'stir' },
  board: { x: 4.22, z: -4.6, face: { x: 4.9, z: -4.6 }, pose: 'read' },
  lift: { x: 6.7, z: -3.95, face: { x: 5.8, z: -3.0 }, pose: 'idle' },
  ruins: { x: 7.18, z: -0.92, face: { x: 7.9, z: -0.95 }, pose: 'ponder' }, // (his dream wall, in the hall)
  pool: { x: -4.38, z: -1.75, face: { x: -5.0, z: -1.85 }, pose: 'idle' }, // (the sink)
  books: { x: 0.0, z: -3.2, face: { x: -0.7, z: -3.2 }, pose: 'read' },
  hearth: { x: 2.4, z: -4.75, face: { x: 2.1, z: -5.6 }, pose: 'idle' },
  // the rooms out back: tending Marigold's glowcaps, at the edge of the terrace, over his drawings, at the bench, in the larder
  garden: { x: 1.02, z: -8.38, face: { x: 2.0, z: -8.2 }, pose: 'idle' },
  terrace: { x: 2.55, z: -11.3, face: { x: 2.55, z: -12.4 }, pose: 'ponder' },
  drawings: { x: -2.9, z: -9.18, face: { x: -2.9, z: -9.85 }, pose: 'read' },
  workbench: { x: -4.2, z: -9.38, face: { x: -4.2, z: -10.1 }, pose: 'idle' },
  larder: { x: -3.25, z: 1.55, face: { x: -3.25, z: 2.6 }, pose: 'idle' },
  armchair: { sit: true, pose: 'sit' },
  cot: { lie: true, pose: 'sleep' },
};

/** What a job hands the scene besides its meshes, lights, boxes and looks (dyn and furn too). */
const KEEP = ['boardObj', 'doorFrame', 'doorLeaf', 'passage', 'boardAt', 'minersAt', 'notePins', 'glints', 'giants', 'skylight', 'telescopeAt', 'gramophone'];

/** The build jobs: every room, then the doors and steps between them (which need every room's lights). */
export const JOBS = [...ROOMS.map((r) => r.id), 'ways'];
const BUILDERS = { living: 'buildLiving', kitchen: 'buildKitchen', smithy: 'buildSmithy', hall: 'buildHall', garden: 'buildGarden', terrace: 'buildTerrace', workshop: 'buildWorkshop', larder: 'buildLarder', ways: 'buildWays' };

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
    this.liveBake = []; // live pieces that get the room's baked light once
    this.steps = {};
    this.roomMeshes = {};
  }

  // ------------------------------------------------------------ a build job
  /** Build one job: a room's furnishings ('living', 'kitchen'...) or 'ways'. opts: { doorOpen, notes }. */
  buildJob(id, opts = {}) {
    const t0 = performance.now();
    this.opts = opts;
    this.decor = new THREE.Group();
    this.room.add(this.decor);
    // (a room whose furnishings fail still gets its walls: better a bare room than no house)
    try { this[BUILDERS[id]](); } catch (e) { console.error(`[home] building ${id} failed`, e); this.failed = String(e?.message || e); }
    this.steps[id] = Math.round(performance.now() - t0);
    return this;
  }

  /**
   * Merge, bake and pack what buildJob made: { msg, transfer }. lights: every light in the house
   * (the 'ways' job lights each side of a door by its own room); a room bakes with its own.
   */
  packJob(id, lights = null) {
    const t0 = performance.now();
    const transfer = [];
    const L = (lights || this.lights).map(bakeLight);
    const amb = this.ambient();
    this.room.updateMatrixWorld(true);
    for (const o of this.parts) this.room.attach(o);
    const meshes = mergeStatic(this.decor, id === 'ways' ? null : id, L, amb, transfer);
    keepUnbatched(this.decor, this.world);
    this.room.remove(this.decor);
    // the live pieces get the same baked light once
    for (const o of [...this.parts, ...this.liveBake]) dynBake(o, L, amb);
    const merge = Math.round(performance.now() - t0);
    // the room's walls, ceiling and floor
    let surf = [];
    if (ROOM[id]) {
      const a = performance.now();
      const s = new HouseSurfaces(new THREE.Group(), L, { soot: (x, y, z) => this.soot(x, y, z), wear: (x, z) => this.wear(x, z) }).buildRoom(ROOM[id]);
      surf = s.pack(id, transfer);
      this.steps.surfaces = Math.round(performance.now() - a);
    }
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
   * The house from its packed jobs (and the cavern's painted panoramas, `vista`), in the scene:
   * room (the tile group), world (the scene). Builds the cage lift here (it's all moving parts).
   */
  static assemble(room, world, jobs, vista = null) {
    const t0 = performance.now();
    const h = new StarHouse(room, world);
    h.surfMeshes = [];
    for (const p of jobs) h.addPayload(p);
    h.surfaces = { meshes: h.surfMeshes, boxes: surfaceBoxes(), steps: jobs.reduce((o, p) => { o[p.id] = p.steps?.surfaces ?? 0; return o; }, {}), dispose() {} };
    h.boxes.push(...h.surfaces.boxes);
    let a = performance.now();
    h.buildLift();
    h.steps.lift = Math.round(performance.now() - a);
    h.buildUnder();
    a = performance.now();
    h.vista = buildVista(world, vista);
    h.vista.group.userData.room = 'outside';
    h.steps.vista = Math.round(performance.now() - a);
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
    for (const m of unpackSurfaces(p.surf, world)) { tag(m, m.userData.room); this.surfMeshes.push(m); }
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

  /** The cage lift (built here: it's mostly moving parts), its static frame merged and lit with the hall. */
  buildLift() {
    const decor = new THREE.Group();
    this.room.add(decor);
    this.lift = new HomeLift(this.room, decor);
    this.lift.cage.traverse((m) => { m.userData.noBatch = true; });
    this.lift.root.traverse((m) => { m.userData.noBatch = true; });
    this.room.updateMatrixWorld(true);
    const L = this.lights.map(bakeLight), amb = this.ambient();
    for (const s of mergeStatic(decor, 'hall', L, amb, null)) {
      const m = unquantize(s.q, matFrom(s.mt, CSCALE));
      if (s.outline) m.layers.enable(LAYER_OUTLINE);
      m.userData.room = 'hall';
      this.world.add(m);
      (this.roomMeshes.hall ||= []).push(m);
    }
    this.room.remove(decor);
    dynBake(this.lift.cage, L, amb);
  }

  /**
   * The earth under the house: from inside the lift shaft (riding up or down) you see its face,
   * timbered at the landing, not the cavern painted round the house.
   */
  buildUnder() {
    const under = new THREE.Mesh(new THREE.BoxGeometry(SHAFT.x0 - HALL.x0, 3.6, -HALL.z0 + 0.5), new THREE.MeshLambertMaterial({ color: 0x2a1c12 }));
    under.position.set((HALL.x0 + SHAFT.x0) / 2, Y - 1.8 - 0.004, (HALL.z0 - 0.5) / 2);
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

  /** The ceiling over (x, z) (m). */
  roofAt(x, z, from = Y + 1) {
    const r = roomAt(x, z);
    return r ? Y + r.h : Math.max(from, Y + 2.2);
  }

  /** Put obj at (x, y?, z) meters with yaw into the static decor (or `parent`); y defaults to the floor. */
  place(obj, x, z, yaw = 0, y = null, parent = this.decor) {
    obj.position.set(tl(x), tl(y ?? this.ground(x, z)), tl(z));
    obj.rotation.y = yaw;
    parent.add(obj);
    return obj;
  }

  /** Put a wall piece on a room's side at `a` m along it, its foot `y` m over the floor, `out` m off the wall. Returns its yaw. */
  onWall(obj, roomId, side, a, y = 0, out = 0, parent = this.decor) {
    const S = sideInfo(ROOM[roomId], side);
    const yaw = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[side];
    const x = S.fixed === 'z' ? a : S.at + S.nx * out, z = S.fixed === 'z' ? S.at + S.nz * out : a;
    this.place(obj, x, z, yaw, Y + y, parent);
    return { x, z, yaw, nx: S.nx, nz: S.nz };
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

  /** A wall piece's box: w wide along the wall, d deep off it, h tall, from y0 over the floor. */
  wallBox(p, w, d, h, y0 = 0) {
    if (y0 === 0 && d > 0.15) this.shadowSpots.push({ x: p.x + (p.nx || 0) * d / 2, z: p.z + (p.nz || 0) * d / 2, w: (p.nz ? w : d) + 0.14, h: (p.nz ? d : w) + 0.14 });
    if (p.nz) this.boxes.push([p.x - w / 2, Y + y0, Math.min(p.z, p.z + p.nz * d), p.x + w / 2, Y + y0 + h, Math.max(p.z, p.z + p.nz * d)]);
    else this.boxes.push([Math.min(p.x, p.x + p.nx * d), Y + y0, p.z - w / 2, Math.max(p.x, p.x + p.nx * d), Y + y0 + h, p.z + w / 2]);
  }

  /** A fixed light (meters): for the scene's light pool, its glows, and the bake (power, radius, room). */
  light(o) {
    const l = { flicker: 0.1, speed: 1, priority: 1, power: 0.4, radius: 1.5, ...o };
    if (!l.room) l.room = roomAt(l.x, l.z)?.id ?? null;
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

  // ------------------------------------------------------------ the living room
  buildLiving() {
    const S = SPOTS, R = ROOM.living, hh = Math.round(R.h * 64);
    // the fireplace between the windows
    const hr = TP.hearth(hh, 11);
    const hp = this.onWall(hr.obj, 'living', 'n', S.hearth.x);
    const fire = this.toM(hr.obj, hr.fire);
    this.dyn.fireplace = { flames: hr.flames, fire, update: hr.update };
    this.light({ kind: 'fire', x: fire.x, y: fire.y + 0.12, z: fire.z + 0.2, color: 0xff8a3a, intensity: 2.2, distance: 5.0, flicker: 0.3, speed: 1.3, pool: 1.1, poolZ: fire.z + 0.9, poolOpacity: 0.3, halo: 0.45, haloOpacity: 0.28, priority: 9, power: 1.25, radius: 3.6, room: 'living' });
    for (const c of hr.lights) { const p = this.toM(hr.obj, c); if (c.kind === 'candle') this.light({ kind: 'candle', x: p.x, y: p.y, z: p.z, color: 0xffc070, intensity: 0, real: false, halo: 0.08, haloOpacity: 0.6, flicker: 0.2, power: 0.18, radius: 0.7 }); }
    this.wallBox(hp, 1.75, 0.5, 2.3);
    this.wallBox(hp, 1.4, 0.88, 0.06);
    this.look({ x: S.hearth.x, y: Y + 1.35, z: S.hearth.z + 0.45, r: 0.25, label: 'Look at the mantel', lines: ['A gold nugget in a little glass box. "My first," says the label, in a very young hand.', 'A photo on the mantel: a big mole and a little one, both in helmets, squinting at the camera.', 'A pipe on a stand, a tin of tobacco, two candlesticks dripping wax onto everything.'] });
    // windows either side, and the cavern's teal light through them
    this.roomWindows('living');
    // firelight from the house coming up the steps into your doorway
    this.light({ kind: 'arch', x: ARCH.x, y: 0.7, z: HALL.z1 - 0.2, color: 0xffb070, intensity: 0, real: false, power: 0.3, radius: 1.2, room: 'living' });
    // his armchair turned to the fire, a footstool, the settee, a lamp table, the big rug
    const ac = buildFurniture('armchair', {});
    const ay = Math.atan2(S.hearth.x - S.armchair.x, (S.hearth.z + 0.9) - S.armchair.z);
    this.place(ac.obj, S.armchair.x, S.armchair.z, ay);
    this.furn.push({ id: 'armchair', obj: ac.obj, seats: ac.seats, box: null });
    this.boxAt(S.armchair.x, S.armchair.z, 0.24, 0.24, 0.5, ay);
    const fs = HP.footstool();
    this.place(fs.obj, S.armchair.x + 0.35, S.armchair.z - 0.42, 0.4);
    this.boxAt(S.armchair.x + 0.35, S.armchair.z - 0.42, 0.18, 0.14, 0.2, 0.4);
    const so = TP.stuffedSofa(31);
    this.place(so.obj, S.sofa.x, S.sofa.z, Math.PI);
    this.furn.push({ id: 'sofa', obj: so.obj, seats: so.seats, box: null });
    this.boxAt(S.sofa.x, S.sofa.z, 0.52, 0.24, 0.45, 0);
    const lt = HP.lampTable();
    const ltx = S.armchair.x - 0.58, ltz = S.armchair.z + 0.42; // (beside the chair, clear of the way in from the garden)
    this.place(lt.obj, ltx, ltz, 0.3);
    const lp = this.toM(lt.obj, lt.lamp);
    this.light({ kind: 'lamp', x: lp.x, y: lp.y, z: lp.z, color: 0xffc070, intensity: 1.3, distance: 3.2, flicker: 0.05, halo: 0.2, haloOpacity: 0.55, pool: 0.7, poolOpacity: 0.16, priority: 6, power: 0.7, radius: 2.4 });
    this.boxAt(ltx, ltz, 0.2, 0.2, 0.55);
    // his knitting by the chair, slippers by the fire, logs, books piled up, the globe of the surface
    this.prop(KP.knittingBasket(), S.armchair.x + 0.42, S.armchair.z + 0.32, 0.6, 0.16, 0.16, 0.25);
    this.prop(KP.slippers(), 3.25, -5.0, -0.3);
    this.prop(KP.logBasket(), 0.98, -5.5, 0.15, 0.27, 0.2, 0.3);
    this.prop(KP.bookStack(6, 205), 0.12, -2.42, 0.4, 0.22, 0.2, 0.36);
    this.prop(KP.bookStack(4, 206), 4.48, -4.0, 1.2, 0.2, 0.18, 0.28);
    this.prop(KP.standingGlobe(), 4.35, -5.38, 0.5, 0.26, 0.26, 0.95);
    const gr = KP.gramophone();
    this.prop(gr.obj, 1.62, -0.66, Math.PI, 0.35, 0.32, 0.6);
    this.gramophone = this.toM(gr.obj, gr.horn);
    this.look({ x: 1.62, y: Y + 0.75, z: -0.66, r: 0.3, label: 'Wind the gramophone', gramophone: true, special: true });
    this.place(lowRes(() => HP.bigRug(2.7, 2.0, 93)), 2.05, -4.1, 0, Y + 0.002);
    // bookcases on the west wall, between the doors, and a small one by the steps
    const bc = HP.bookcase(1.35, 1.7, 71);
    const bp = this.onWall(bc.obj, 'living', 'w', -3.25);
    this.wallBox(bp, 1.4, 0.34, 1.85);
    const bcc = this.toM(bc.obj, bc.candle);
    this.light({ kind: 'candle', x: bcc.x, y: bcc.y, z: bcc.z, color: 0xffc070, intensity: 0, real: false, halo: 0.07, haloOpacity: 0.55, flicker: 0.2, power: 0.15, radius: 0.6 });
    this.look({ x: bp.x + 0.2, y: Y + 0.9, z: bp.z, r: 0.5, label: 'Browse the books', books: true, aside: 'books' });
    // the clock, the notes board on the east wall
    const ck = HP.grandfatherClock();
    this.place(ck.obj, S.clock.x, S.clock.z, -Math.PI / 2);
    this.dyn.pendulum = ck.pendulum;
    this.parts.push(ck.pendulum);
    this.boxAt(S.clock.x, S.clock.z, 0.26, 0.17, 1.75, -Math.PI / 2);
    this.look({ x: S.clock.x - 0.1, y: Y + 1.4, z: S.clock.z, r: 0.22, label: 'The grandfather clock', clock: true });
    this.buildBoard();
    // the trinket shelf and Marigold's portrait on the south wall, by the steps
    const ts = HP.trinketShelf(1.3);
    const tp = this.onWall(ts.obj, 'living', 's', S.trinkets.x, 0.82);
    const tc = this.toM(ts.obj, ts.candle);
    this.light({ kind: 'candle', x: tc.x, y: tc.y, z: tc.z, color: 0xffc070, intensity: 0, real: false, halo: 0.07, haloOpacity: 0.55, flicker: 0.2, power: 0.16, radius: 0.6 });
    this.look({ x: tp.x, y: Y + 1.05, z: tp.z - 0.12, r: 0.42, label: 'Old Star\'s keepsakes', lines: ['A Surface Express ticket in a frame: ADMIT ONE. Torn in half, and glued back together.', 'A jar of coins labelled THE WAY UP. Mostly buttons, if you look closely.', 'A tin model of the Surface Express, its paint worn off where a thumb pushes it.', 'A seashell. From the surface. He must have carried it down here himself, a long time ago.', 'A medal on a ribbon: "For Steadfast Digging". The ribbon is older than the medal.'], aside: 'trinkets' });
    this.onWall(HP.painting('portrait', 0.34, 0.42, 'gilt'), 'living', 's', S.trinkets.x, 1.5);
    this.look({ x: S.trinkets.x, y: Y + 1.72, z: -0.4, r: 0.22, label: 'The portrait', lines: ['A lady mole in a lace collar, smiling like she knows something. "Marigold", says the brass plate.'], aside: 'portrait' });
    this.onWall(HP.painting('sea', 0.5, 0.34, 'gilt'), 'living', 'n', 4.42, 1.2);
    this.look({ x: 4.42, y: Y + 1.37, z: -5.75, r: 0.25, label: 'The painting of the sea', lines: ['The sun over the sea, painted by somebody who had only ever heard about either.', 'Blue to the edge of the world. Old Star says it\'s waiting for him.'], aside: 'sea' });
    this.onWall(HP.painting('hills', 0.34, 0.26, 'oak'), 'living', 's', 3.35, 1.32);
    this.onWall(HP.painting('mountains', 0.36, 0.26, 'oak'), 'living', 's', 4.15, 1.42);
    // plants in the corners, a sconce, the chandelier
    const bc2 = HP.bookcase(0.72, 1.45, 79);
    const bp2 = this.onWall(bc2.obj, 'living', 'w', -0.8);
    this.wallBox(bp2, 0.78, 0.34, 1.6);
    for (const [x, z, k] of [[-0.32, -5.5, 'fern'], [4.5, -2.0, 'glowcap'], [-0.32, -4.05, 'spike']]) this.plant(x, z, k);
    const sc = HP.brassSconce();
    this.onWall(sc.obj, 'living', 'e', -5.45, 1.42);
    this.sconceLight(sc, 'living');
    const ch = TP.wagonChandelier(22, 37);
    this.place(ch.obj, 2.1, -3.7, 0.3, Y + R.h - 0.02);
    ch.candles.forEach((c, i) => { const p = this.toM(ch.obj, c); if (i % 2 === 0) this.light({ kind: i ? 'candle' : 'center', x: p.x, y: p.y, z: p.z, color: 0xffc070, intensity: i ? 0 : 1.0, real: !i, distance: 3.6, halo: 0.1, haloOpacity: 0.6, flicker: 0.15, power: i ? 0.25 : 0.45, radius: i ? 1.2 : 2.6, priority: 5 }); });
    // what came down with you, swept into the corner under the boarded hole
    const db = lowRes(() => RP.fallDebris(65));
    db.obj.scale.setScalar(0.55);
    this.place(db.obj, S.rubble.x, S.rubble.z, 0.3, Y + 0.01);
    this.glints = db.glints.map((p) => { const w = this.toM(db.obj, p); w.y = Y + 0.03; return w; });
    this.dyn.debris = db.obj;
    this.boxAt(S.rubble.x, S.rubble.z, 0.3, 0.3, 0.12);
    this.look({ x: HOLE.x, y: Y + R.h - 0.05, z: HOLE.z, r: 0.45, label: 'Look up at the patched ceiling', lines: ['Boards nailed over a hole in the ceiling. Fresh ones. That\'s where I came in.', 'Roots and dark behind the boards. Dirt still trickles through the gaps.'], aside: 'hole' });
    const rng = makeRng(81);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3 + rng(), r = HOLE.r * (0.7 + rng() * 0.4);
      this.place(lowRes(() => hangingRoot(80 + k, tl(0.12 + rng() * 0.3))), HOLE.x + Math.cos(a) * r, HOLE.z + Math.sin(a) * r, rng() * 6, Y + R.h - 0.01);
    }
  }

  buildBoard() {
    const S = SPOTS;
    const board = TP.notesBoard(Math.max(3, Math.min(10, this.opts.notes ?? 8)), 13);
    const bp = this.onWall(board.obj, 'living', 'e', S.board.z, 0.62);
    this.boardObj = board.obj;
    this.dyn.board = board;
    this.notePins = board.notes.map((q) => this.toM(board.obj, { x: q.x, y: q.y, z: 0.1 }));
    this.boardAt = { x: bp.x, z: bp.z, y: Y + 0.62, w: (board.w ?? 1.6) * T, h: (board.h ?? 1.2) * T, nx: -1 };
    this.wallBox(bp, 1.1, 0.08, 1.0, 0.62);
    this.light({ kind: 'notes', x: bp.x - 0.5, y: Y + 1.5, z: bp.z, color: 0xffd8a0, intensity: 0, real: false, power: 0.35, radius: 1.3 });
  }

  // ------------------------------------------------------------ the kitchen
  buildKitchen() {
    const S = SPOTS, R = ROOM.kitchen, hh = Math.round(R.h * 64);
    this.roomWindows('kitchen');
    const rg = HP.kitchenRange(hh, 61);
    const rp = this.onWall(rg.obj, 'kitchen', 'n', S.fire.x);
    const fire = this.toM(rg.obj, rg.fire);
    this.dyn.hearth = { flames: rg.flames, embers: rg.embers, fire, pot: this.toM(rg.obj, rg.pot), kettle: this.toM(rg.obj, rg.kettle) };
    this.light({ kind: 'fire', x: fire.x, y: fire.y + 0.1, z: fire.z + 0.25, color: 0xff8a3a, intensity: 1.7, distance: 4.2, flicker: 0.25, speed: 1.2, pool: 0.8, poolOpacity: 0.22, halo: 0.25, haloOpacity: 0.25, priority: 8, power: 0.95, radius: 3.0, room: 'kitchen' });
    for (const c of rg.candles) { const p = this.toM(rg.obj, c); this.light({ kind: 'candle', x: p.x, y: p.y, z: p.z, color: 0xffc070, intensity: 0, real: false, halo: 0.07, haloOpacity: 0.55, flicker: 0.2, power: 0.15, radius: 0.7 }); }
    this.wallBox(rp, 1.75, 0.62, 2.2);
    this.wallBox(rp, 1.6, 0.98, 0.04);
    // the plate dresser by the back door
    const pd = HP.plateDresser(0.85);
    const pdp = this.onWall(pd.obj, 'kitchen', 'n', -1.28);
    this.wallBox(pdp, 0.9, 0.36, 1.6);
    // the sink and pump under the window
    const sk = HP.sinkPump();
    const sp = this.onWall(sk.obj, 'kitchen', 'w', S.sink.z);
    const ws = this.toM(sk.obj, sk.water);
    this.addWater('pool', ws.x, ws.y, ws.z, sk.water.d * T, sk.water.w * T, 0, 0x2a4a5a);
    this.dyn.pump = this.toM(sk.obj, sk.spout);
    this.wallBox(sp, 1.0, 0.5, 0.75);
    this.drips.push({ x: this.dyn.pump.x, z: this.dyn.pump.z, y: this.dyn.pump.y - 0.01, t: 2, every: 3.4, pool: true });
    // the pantry along the south wall
    const pa = HP.pantryShelf(1.85, 1.45);
    const pap = this.onWall(pa.obj, 'kitchen', 's', -3.58);
    this.wallBox(pap, 1.9, 0.28, 1.5);
    this.look({ x: pap.x, y: Y + 0.8, z: pap.z - 0.2, r: 0.6, label: 'The pantry shelves', lines: ['Pickled glowcaps, honey, three kinds of jam and a jar labelled "DO NOT".', 'Enough flour for a winter, if winters happened down here.', 'A cheese wheel with one neat slice gone. Old Star swears it was Nugget.'] });
    // the dining table and its chairs
    const dt = HP.diningTable();
    this.place(dt.obj, S.table.x, S.table.z, S.table.yaw);
    const dc = this.toM(dt.obj, dt.candle);
    this.light({ kind: 'candle', x: dc.x, y: dc.y, z: dc.z, color: 0xffc070, intensity: 0, real: false, halo: 0.09, haloOpacity: 0.65, flicker: 0.2, power: 0.3, radius: 1.0 });
    const db = this.toM(dt.obj, dt.bowl);
    this.light({ kind: 'shroom', x: db.x, y: db.y, z: db.z, color: 0x5ad0e0, intensity: 0, real: false, halo: 0.08, haloOpacity: 0.35, flicker: 0.05, speed: 0.3, power: 0.12, radius: 0.5 });
    this.boxAt(S.table.x, S.table.z, 0.56, 0.31, 0.45);
    for (const [i, c] of S.chairs.entries()) {
      const k = HP.rushChair(105 + i, [0x8a3a2a, 0x3a5a3a, 0x8a6a2a, 0x3a4a6a][i]);
      this.place(k.obj, c.x, c.z, c.yaw);
      this.furn.push({ id: 'chair', obj: k.obj, seats: [{ x: k.seat.x, z: k.seat.z, y: k.seat.y, yaw: 0 }], box: [c.x - 0.2, Y, c.z - 0.2, c.x + 0.2, Y + 0.32, c.z + 0.2] });
      this.boxAt(c.x, c.z, 0.2, 0.19, 0.3, c.yaw);
    }
    // herbs from the beams, a lamp over the table, sacks and a barrel by the pantry
    this.place(CP.herbLine(1.1, 31), -3.0, -2.75, 0.05, Y + R.h - 0.18);
    this.place(CP.herbLine(0.9, 37), -4.3, -1.0, Math.PI / 2, Y + R.h - 0.18);
    const hl = HP.hangingOilLamp(0.55);
    this.place(hl.obj, S.table.x, S.table.z, 0, Y + R.h);
    const hp = this.toM(hl.obj, hl.light);
    this.light({ kind: 'lantern', x: hp.x, y: hp.y, z: hp.z, color: 0xffc070, intensity: 1.15, distance: 3.2, flicker: 0.06, halo: 0.18, haloOpacity: 0.55, pool: 0.75, poolX: hp.x, poolZ: hp.z, poolOpacity: 0.16, priority: 5, power: 0.65, radius: 2.4 });
    const bb = barrel(5, { fill: 'apples' });
    this.place(bb.obj, -1.15, -0.62, 0.2);
    this.boxAt(-1.15, -0.62, 0.22, 0.22, 0.5);
    const sk2 = sack({});
    this.place(sk2.obj, -4.8, -0.88, 0.4);
    this.plant(-1.1, -3.1, 'glowcap');
    // the churn and the eggs by the larder door, plaits of garlic and onions, the spice rack, the mop
    this.prop(KP.butterChurn(), -1.12, -1.18, 0.4, 0.13, 0.13, 0.55);
    this.prop(KP.eggBasket(), -2.92, -0.64, 0.3);
    for (const [x, z, on, len] of [[-1.35, -2.95, false, 0.45], [-4.55, -2.1, true, 0.55], [-3.1, -1.0, false, 0.4]]) this.place(KP.garlicString(len, on, 227 + x * 3), x, z, x, Y + R.h - 0.02);
    this.onWall(KP.spiceRack(), 'kitchen', 'w', -2.92, 1.08);
    this.prop(KP.mopBucket(), -4.74, -2.57, 0.3, 0.14, 0.14, 0.3);
    this.look({ x: -2.92 + 0, y: Y + 0.12, z: -0.64, r: 0.2, label: 'The egg basket', lines: ['Eggs from Nugget, already. Old Star has written the date on each one in pencil.'] });
  }

  // ------------------------------------------------------------ the smithy
  buildSmithy() {
    const S = SPOTS, R = ROOM.smithy;
    this.roomWindows('smithy');
    const f = CP.forge(tl(R.h + 0.05), 5);
    this.place(f.obj, S.forge.x, S.forge.z, S.forge.yaw);
    const fire = this.toM(f.obj, f.fire);
    this.dyn.forge = { embers: f.embers, flames: f.flames, fire };
    this.light({ kind: 'forge', x: fire.x, y: fire.y + 0.12, z: fire.z + 0.05, color: 0xff7a2a, intensity: 2.2, distance: 5.0, flicker: 0.28, speed: 1.4, pool: 0.9, poolZ: fire.z + 0.6, poolOpacity: 0.26, halo: 0.42, haloOpacity: 0.32, priority: 9, power: 1.3, radius: 3.6, room: 'smithy' });
    this.boxAt(S.forge.x, S.forge.z, 0.58, 0.41, 0.56, S.forge.yaw);
    this.boxAt(S.forge.x, S.forge.z - 0.17, 0.14, 0.14, 2.5, 0);
    const b = CP.bellows(7);
    this.place(b.obj, S.bellows.x, S.bellows.z, S.bellows.yaw);
    this.dyn.bellows = b;
    this.parts.push(b.obj);
    this.boxAt(S.bellows.x, S.bellows.z, 0.45, 0.24, 0.62, S.bellows.yaw);
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
    const bk = CP.quenchBucket(15);
    this.place(bk.obj, S.trough.x - 0.12, S.trough.z + 0.68, 0.4);
    this.dyn.bucket = { obj: bk.obj, water: bk.water, home: { x: S.trough.x - 0.12, z: S.trough.z + 0.68 } };
    this.parts.push(bk.obj);
    const rack = CP.toolRack(17);
    const rp = this.onWall(rack.obj, 'smithy', 'w', S.rack.z);
    this.wallBox(rp, 1.05, 0.2, 1.5);
    const coal = lowRes(() => CP.coalHeap(33));
    this.place(coal.obj, S.coal.x, S.coal.z, S.coal.yaw);
    // his box bed against the west wall, warm from the forge
    const bed = HP.boxBed();
    const bp = this.onWall(bed.obj, 'smithy', 'w', S.cot.z);
    this.dyn.cot = { obj: bed.obj, lie: bed.lie, foot: bed.foot };
    const bc = this.toM(bed.obj, bed.candle);
    this.light({ kind: 'candle', x: bc.x, y: bc.y, z: bc.z, color: 0xffc070, intensity: 0, real: false, halo: 0.08, haloOpacity: 0.6, flicker: 0.2, power: 0.25, radius: 0.8 });
    this.wallBox(bp, 1.5, 0.74, 1.65);
    this.look({ x: bp.x + 0.45, y: Y + 0.5, z: bp.z, r: 0.4, label: 'Old Star\'s box bed', lines: ['A bed built into the wall like a cupboard, curtains and all. It smells of soot and peppermint.', 'A red nightcap on the pillow. Warm from the forge: no wonder he sleeps in here.'] });
    // a water barrel, a lantern over the anvil, sacks of charcoal
    const br = barrel(3, { fill: 'water' });
    this.place(br.obj, -3.92, -3.98, 0.3);
    this.boxAt(-3.92, -3.98, 0.22, 0.22, 0.5);
    // the grindstone, a rack of finished blades over the trough, scrap, his apron, horseshoes for luck
    this.prop(KP.grindstone(), -1.42, -4.02, Math.PI, 0.4, 0.27, 0.7);
    this.onWall(KP.bladeRack(0.95), 'smithy', 'e', -6.0, 0.82);
    this.look({ x: -0.9, y: Y + 1.3, z: -6.0, r: 0.4, label: 'The rack of blades', lines: ['Daggers, a short sword, an axe, a spear head, each with a paper tag: who it\'s for, and what they still owe.', 'Most of the tags say PAID. One says "PAID IN TURNIPS".'] });
    this.prop(KP.scrapPile(), -3.28, -4.05, 0.3, 0.33, 0.25, 0.25);
    this.onWall(KP.apronHook(), 'smithy', 's', -3.3, 0.72);
    this.onWall(KP.horseshoes(), 'smithy', 'n', -1.42, 1.55);
    const lan = HP.hangingOilLamp(0.6);
    this.place(lan.obj, -2.2, -5.2, 0, Y + R.h);
    const lp = this.toM(lan.obj, lan.light);
    this.light({ kind: 'lantern', x: lp.x, y: lp.y, z: lp.z, color: 0xffb060, intensity: 0.9, distance: 3.2, flicker: 0.1, halo: 0.18, haloOpacity: 0.5, pool: 0.6, poolOpacity: 0.12, priority: 4, power: 0.5, radius: 2.2 });
    for (const [x, z, s] of [[-4.62, -5.62, 1], [-1.02, -6.98, 2]]) { const o = sack({ seed: s, color: 0x4a4440 }); this.place(o.obj, x, z, s); }
    const sc = HP.brassSconce(5);
    this.onWall(sc.obj, 'smithy', 's', -4.25, 1.35);
    this.sconceLight(sc, 'smithy');
    const sc2 = HP.brassSconce(6);
    this.onWall(sc2.obj, 'smithy', 'e', -6.55, 1.35);
    this.sconceLight(sc2, 'smithy');
  }

  // ------------------------------------------------------------ the hall
  buildHall() {
    const S = SPOTS, R = ROOM.hall;
    this.roomWindows('hall');
    void R;
    // coats and boots by the front door, the suitcase that was packed once
    const cr = TP.coatRack(27);
    this.onWall(cr, 'hall', 'w', -5.3, 0.1);
    const bs = HP.bootsAndStick();
    this.place(bs.obj, 5.32, -5.15, Math.PI / 2);
    this.boxAt(5.32, -5.15, 0.15, 0.35, 0.3, 0);
    const su = HP.suitcase();
    this.place(su.obj, S.suitcase.x, S.suitcase.z, 0.12);
    this.boxAt(S.suitcase.x, S.suitcase.z, 0.36, 0.16, 0.4, 0.12);
    this.look({ x: S.suitcase.x, y: Y + 0.3, z: S.suitcase.z, r: 0.3, label: 'The old suitcase', lines: ['A leather suitcase, packed and strapped. A SURFACE EXPRESS label on the side. Dust on the hat.', 'Packed for a trip that never happened. Nobody has moved it in years. Nobody wants to.'], aside: 'suitcase' });
    // the Miners' Board
    const mb = TP.minersBoard(49);
    const mp = this.onWall(mb, 'hall', 'w', S.miners.z, 0.55);
    this.minersAt = { x: mp.x + 0.08, z: mp.z, y: Y + 0.55, nx: 1 };
    this.wallBox(mp, 1.0, 0.1, 1.0, 0.55);
    // his chest by the south wall
    const ch = TP.lootChest(17);
    const cg = group(ch.obj, ch.lid, ch.loot);
    this.place(cg, S.chest.x, S.chest.z, S.chest.yaw, null, this.room);
    this.dyn.chest = { ...ch, group: cg };
    cg.traverse((m) => { m.userData.noBatch = true; });
    this.liveBake.push(cg);
    this.boxAt(S.chest.x, S.chest.z, 0.32, 0.2, 0.36, S.chest.yaw);
    // the coal cart by the lift
    const c = lowRes(() => RP.mineCart(57));
    this.place(c.obj, S.cart.x, S.cart.z, Math.PI / 2, Y);
    this.boxAt(S.cart.x, S.cart.z, 0.36, 0.27, 0.6, Math.PI / 2);
    // the dream wall: the tally of the million, over a crate of odds
    const tb = HP.tallyBoard();
    const tp = this.onWall(tb.obj, 'hall', 'e', S.dream.z, 0.62);
    this.look({ x: tp.x - 0.05, y: Y + 1.05, z: tp.z, r: 0.48, label: 'The slate on the wall', lines: ['"THE WAY UP", chalked over a long thermometer to a million. It reached nearly halfway once.', 'Then it was rubbed out, right down to the bottom. "LONG STORY", says the chalk.', 'Tally marks down the side. Years, by the look of them. Lots of years.'], aside: 'dream' });
    for (const [x, z, k, s] of [[5.35, -0.65, 'crate', 1], [5.38, -1.15, 'barrel', 3], [7.45, -0.58, 'crate', 2]]) {
      const o = k === 'crate' ? crate(s, { open: s === 2 }) : barrel(s, { fill: null });
      this.place(o.obj, x, z, s * 0.7);
      this.boxAt(x, z, 0.24, 0.24, k === 'crate' ? 0.4 : 0.5, s * 0.7);
    }
    // a runner down the hall, sconces, a plant
    this.place(TP.runnerRug(Math.round(3.4 * 64), 46, 35), 6.25, -2.95, Math.PI / 2, Y + 0.002);
    const s1 = HP.brassSconce(2);
    this.onWall(s1.obj, 'hall', 'w', -1.55, 1.35);
    this.onWall(TP.mineMap(23), 'hall', 'w', -0.78, 0.95);
    this.look({ x: 5.05, y: Y + 1.25, z: -0.78, r: 0.3, label: 'The old map', lines: ['A map of the old workings, inked over and over. An X down in the deep, circled twice.', 'The lift shaft, the galleries, and a passage up to Deep Town, crossed out in red.'] });
    this.sconceLight(s1, 'hall');
    const s2 = HP.brassSconce(3);
    this.onWall(s2.obj, 'hall', 'n', 5.45, 1.35);
    this.sconceLight(s2, 'hall');
    this.plant(5.32, -3.25, 'fern');
    this.place(KP.doormat(), FRONT.x, -5.22, 0, Y + 0.002);
    this.prop(KP.caneStand(), 7.55, -5.55, 0.4, 0.13, 0.13, 1.1);
    this.onWall(KP.keyBoard(), 'hall', 'w', -3.3, 1.02);
    this.onWall(KP.helmetPegs().obj, 'hall', 'e', -5.0, 0.86);
    this.onWall(KP.wallMirror(), 'hall', 's', 7.0, 0.95);
    this.look({ x: 7.0, y: Y + 1.3, z: -0.4, r: 0.25, label: 'The mirror', lines: ['A mole in a dusty apron looks back at you. There\'s dirt on its nose. There\'s dirt on yours.'] });
    // the lift's lanterns (the lift itself is built in the scene: it's all moving parts)
    const cl = LIFT_LIGHTS.cage, lp = LIFT_LIGHTS.portal;
    this.light({ kind: 'lift', x: cl.x, y: cl.y, z: cl.z, color: 0xffb860, intensity: 0.4, distance: 2.0, flicker: 0.1, halo: 0.16, haloOpacity: 0.55, priority: 2, power: 0.16, radius: 1.3, room: 'hall' });
    this.light({ kind: 'portal', x: lp.x, y: lp.y, z: lp.z, color: 0xffb050, intensity: 0.25, distance: 2.2, flicker: 0.12, halo: 0.18, haloOpacity: 0.55, pool: 0.6, poolOpacity: 0.15, priority: 4, power: 0.22, radius: 1.6, room: 'hall' });
    // the front door's lamp, once the way to Deep Town is open
    if (this.opts.doorOpen) this.light({ kind: 'door', x: FRONT.x, y: Y + 0.95, z: FRONT.z + 0.15, color: 0xffd090, intensity: 0.8, distance: 2.8, flicker: 0.08, halo: 0.25, haloOpacity: 0.4, priority: 3, power: 0.4, radius: 1.6, room: 'hall' });
  }

  // ------------------------------------------------------------ the glow garden
  buildGarden() {
    const R = ROOM.garden, S = SPOTS;
    this.roomWindows('garden');
    // the light well over the skylight, and the cavern's teal light falling down it
    const sk = R.skylight;
    const lw = GP.lightWell(sk.r, 2.2, 33);
    this.place(lw.obj, sk.x, sk.z, 0, Y + R.h);
    this.light({ kind: 'sky', x: sk.x, y: Y + R.h - 0.25, z: sk.z, color: 0x8ae8e0, intensity: 1.5, distance: 5.6, flicker: 0.04, speed: 0.2, pool: 1.25, poolX: sk.x, poolZ: sk.z, poolOpacity: 0.2, halo: 0.9, haloOpacity: 0.16, priority: 7, power: 1.05, radius: 4.4, room: 'garden' });
    this.skylight = { x: sk.x, y: Y + R.h, z: sk.z, r: sk.r };
    this.look({ x: sk.x, y: Y + R.h - 0.05, z: sk.z, r: sk.r, label: 'Look up the light well', lines: ['A shaft up through the rock to a glass dome, and above it the cavern\'s roof, crawling with glow-worms.', 'Old Star dug the well himself, so Marigold\'s mushrooms would have a sky. It took him two years.'], aside: 'skylight' });
    // the beds: round the pool of light, under the west window, along the west wall
    const beds = [
      { x: 2.12, z: -8.15, w: 1.5, d: 1.05, seed: 3, hues: ['teal', 'violet'] },
      { x: 0.32, z: -9.72, w: 1.55, d: 0.72, seed: 5, hues: ['amber', 'pink'] },
      { x: -0.2, z: -7.55, w: 0.68, d: 1.2, seed: 8, hues: ['green', 'teal'] },
    ];
    for (const b of beds) {
      const mb = GP.mushroomBed(b.w, b.d, b.seed, b.hues);
      this.place(mb.obj, b.x, b.z, 0);
      this.boxAt(b.x, b.z, b.w / 2, b.d / 2, 0.3, 0);
      for (const gl of mb.glows) { const p = this.toM(mb.obj, gl); this.light({ kind: 'shroom', x: p.x, y: p.y, z: p.z, color: gl.color, intensity: 0, real: false, halo: 0.14, haloOpacity: 0.35, flicker: 0.06, speed: 0.3, power: 0.2, radius: 0.85 }); }
    }
    this.look({ x: 2.12, y: Y + 0.5, z: -8.15, r: 0.7, label: 'Marigold\'s glowcaps', lines: ['Teal ones, violet ones, a few the size of an umbrella. They hum, very faintly, if you listen.', 'The soil is warm. Old Star says they like it when you talk to them. He talks to them a lot.'], aside: 'garden' });
    // giant glowcaps: three in the middle bed, one by the pool
    this.giants = [];
    for (const [x, z, h, r, hue, seed] of [[1.72, -8.32, 1.3, 0.34, 'teal', 3], [2.52, -7.92, 0.95, 0.27, 'violet', 5], [2.3, -8.55, 0.68, 0.21, 'amber', 7], [4.38, -8.12, 1.4, 0.36, 'pink', 9]]) {
      const gc = GP.giantGlowcap(h, r, hue, seed);
      this.place(gc.obj, x, z, seed * 0.7);
      const p = this.toM(gc.obj, gc.glow);
      this.light({ kind: 'shroom', x: p.x, y: p.y - 0.12, z: p.z, color: gc.color, intensity: h > 1 ? 0.55 : 0, real: h > 1.2, distance: 2.4, halo: 0.42 + r, haloOpacity: 0.28, flicker: 0.05, speed: 0.25, power: 0.42, radius: 1.7, priority: 3 });
      this.giants.push({ x: p.x, y: p.y, z: p.z, color: gc.color });
      this.boxAt(x, z, 0.07, 0.07, h);
    }
    // the stone face on the east wall spouting into its pool
    const sf = GP.spoutFace(5);
    const sp = this.onWall(sf.obj, 'garden', 'e', -7.0, 0.32);
    this.dyn.spout = this.toM(sf.obj, sf.mouth);
    const pb = GP.pondBasin(0.36, 7);
    this.place(pb.obj, 4.3, -7.0, 0);
    const pw = this.toM(pb.obj, { x: 0, y: pb.water.y, z: 0 });
    this.addWater('pond', pw.x, pw.y, pw.z, pb.water.r * 2, pb.water.r * 2, 0, 0x1e5a5a, true);
    this.boxAt(4.3, -7.0, 0.45, 0.45, 0.16);
    void sp;
    this.look({ x: 4.3, y: Y + 0.2, z: -7.0, r: 0.42, label: 'The pool', lines: ['Lily pads, a glowing bud, pebbles that shine like coins. They aren\'t. You checked.', 'The water comes down from somewhere above, through the old stone mole\'s mouth.'] });
    // Marigold's bench facing the beds and the terrace, a trellis, the potting table, a can
    const bn = GP.gardenBench(9);
    this.place(bn.obj, 2.45, -6.38, Math.PI);
    this.furn.push({ id: 'bench', obj: bn.obj, seats: bn.seats, box: null });
    this.boxAt(2.45, -6.38, 0.47, 0.2, 0.32, Math.PI);
    this.look({ x: 2.45, y: Y + 0.5, z: -6.2, r: 0.2, label: 'The brass plaque', lines: ['"FOR MARIGOLD, WHO MADE THINGS GROW". The brass is polished bright. Somebody does it every week.'], aside: 'plaque' });
    this.onWall(GP.trellis(0.85, 1.75, 19).obj, 'garden', 's', 1.4);
    const pt = GP.pottingTable(1.15, 11);
    const ptp = this.onWall(pt.obj, 'garden', 's', 3.95);
    this.wallBox(ptp, 1.2, 0.48, 0.65);
    this.prop(GP.wateringCan(13), 1.18, -7.55, 0.8);
    const scc = GP.scarecrow(21).obj;
    scc.scale.setScalar(0.7);
    this.prop(scc, -0.22, -7.25, 0.3);
    for (const [x, z, d, s] of [[0.55, -8.05, 0.7, 17], [3.35, -9.25, 0.85, 18], [3.2, -7.1, 0.6, 19]]) {
      const hb = GP.hangingBasket(d, s);
      this.place(hb.obj, x, z, s, Y + R.h);
      const p = this.toM(hb.obj, hb.glow);
      this.light({ kind: 'shroom', x: p.x, y: p.y, z: p.z, color: 0x8af0d0, intensity: 0, real: false, halo: 0.18, haloOpacity: 0.3, flicker: 0.05, speed: 0.3, power: 0.18, radius: 0.8 });
    }
    // a lantern on a post by the bench, for reading
    const lpost = GP.lanternPost(1.0, 41);
    this.place(lpost.obj, 1.55, -6.35, 0);
    const ll = this.toM(lpost.obj, lpost.light);
    this.light({ kind: 'lantern', x: ll.x, y: ll.y, z: ll.z, color: 0xffc070, intensity: 0.9, distance: 3.0, flicker: 0.08, halo: 0.2, haloOpacity: 0.5, pool: 0.6, poolOpacity: 0.15, priority: 5, power: 0.55, radius: 2.2 });
    this.boxAt(1.55, -6.35, 0.08, 0.08, 1.3);
    // the bath in the corner: the copper tub under the window, the hot spring's pipe, a screen, towels
    const bt = GP.bathTub(23);
    this.place(bt.obj, 4.42, -9.45, Math.PI / 2);
    const bw = this.toM(bt.obj, { x: 0, y: bt.water.y, z: 0 });
    this.addWater('bath', bw.x, bw.y, bw.z, bt.water.w, bt.water.d, Math.PI / 2, 0x2a6a6a);
    this.dyn.bathSteam = this.toM(bt.obj, bt.steam);
    this.boxAt(4.42, -9.45, 0.6, 0.33, 0.55, Math.PI / 2);
    const spp = GP.springPipe(31);
    this.onWall(spp.obj, 'garden', 'n', 4.55);
    this.dyn.bathSpout = this.toM(spp.obj, spp.spout);
    const bs = GP.bathShelf(29);
    this.onWall(bs.obj, 'garden', 'e', -9.62, 1.02);
    const bc = this.toM(bs.obj, bs.candle);
    this.light({ kind: 'candle', x: bc.x, y: bc.y, z: bc.z, color: 0xffc070, intensity: 0.45, real: true, distance: 1.6, halo: 0.08, haloOpacity: 0.6, flicker: 0.2, power: 0.28, radius: 1.0, priority: 2 });
    this.prop(GP.foldingScreen(25), 3.55, -9.2, Math.PI / 2 + 0.1, 0.06, 0.72, 1.3);
    this.prop(GP.towelRail(27), 3.86, -8.42, 0.2, 0.3, 0.08, 0.8);
    this.look({ x: 4.42, y: Y + 0.5, z: -9.45, r: 0.45, label: 'Take a soak', bath: true, special: true });
  }

  // ------------------------------------------------------------ the terrace
  buildTerrace() {
    const R = ROOM.terrace;
    const cx = (R.x0 + R.x1) / 2;
    // the balustrade along the edge (and an unseen rail above it: it's a long way down)
    const bl = GP.balustrade(R.x1 - R.x0 + 0.06, 35);
    this.place(bl.obj, cx, R.z0 + 0.13, Math.PI);
    this.boxes.push([R.x0 - 0.2, Y, R.z0 - 0.3, R.x1 + 0.2, Y + 2.6, R.z0 + 0.24]);
    this.shadowSpots.push({ x: cx, z: R.z0 + 0.3, w: R.x1 - R.x0, h: 0.25 });
    for (const [x, s] of [[R.x0 + 0.25, 41], [R.x1 - 0.25, 42]]) {
      const lp = GP.lanternPost(1.2, s);
      this.place(lp.obj, x, R.z0 + 0.42, 0);
      const l = this.toM(lp.obj, lp.light);
      this.light({ kind: 'lantern', x: l.x, y: l.y, z: l.z, color: 0xffc070, intensity: 0.9, distance: 3.2, flicker: 0.1, halo: 0.22, haloOpacity: 0.5, pool: 0.7, poolOpacity: 0.16, priority: 5, power: 0.6, radius: 2.4, room: 'terrace' });
      this.boxAt(x, R.z0 + 0.42, 0.1, 0.1, 1.4);
    }
    // pots along the coping
    for (const [x, k] of [[0.55, 'fern'], [1.6, 'glowcap'], [3.0, 'trail'], [3.95, 'glowcap']]) {
      const p = HP.pottedPlant(k === 'trail' ? 'spike' : k, Math.round(x * 17));
      p.obj.scale.setScalar(0.5);
      this.place(p.obj, x, R.z0 + 0.12, x, Y + bl.h * T);
    }
    // the telescope, aimed at the far village; a little table for tea
    const ts = GP.telescope(37);
    const ty = Math.atan2(0.42, -0.9);
    this.place(ts.obj, 3.72, -11.25, ty);
    this.boxAt(3.72, -11.25, 0.24, 0.24, 1.0, ty);
    this.telescopeAt = { x: 3.72, z: -11.25, yaw: ty };
    this.look({ x: 3.72, y: Y + 0.68, z: -11.3, r: 0.25, label: 'Look through the telescope', telescope: true, special: true });
    const tt = GP.teaTable(39);
    this.place(tt.obj, 0.98, -11.02, 0);
    this.furn.push({ id: 'teaChair', obj: tt.obj, seats: tt.seats, box: null });
    this.boxAt(0.98, -11.02, 0.2, 0.2, 0.45);
    for (const sx of [-0.52, 0.52]) this.boxAt(0.98 + sx, -11.02, 0.14, 0.14, 0.3);
    // the wind chime on the house wall, the cliff falling away under the edge
    const wc = GP.windChime(43);
    this.onWall(wc.obj, 'terrace', 's', 3.55, 1.45);
    this.dyn.chime = this.toM(wc.obj, wc.glow);
    const cf = GP.cliffFace(R.x1 - R.x0 + 2.4, 6, 45);
    this.place(cf, cx, R.z0, Math.PI, Y);
    this.look({ x: cx, y: Y + 0.7, z: R.z0 + 0.05, r: 1.2, label: 'Look out over the cavern', window: true, aside: 'terrace' });
  }

  // ------------------------------------------------------------ the workshop
  buildWorkshop() {
    const R = ROOM.workshop;
    this.roomWindows('workshop');
    // the workbench and its pegboard on the north wall, the drafting table under the big window
    const wb = WP.workbench(1.25, 55);
    const wbp = this.onWall(wb.obj, 'workshop', 'n', -4.22);
    this.wallBox(wbp, 1.3, 0.46, 0.62);
    const wl = this.toM(wb.obj, wb.lamp);
    this.light({ kind: 'lamp', x: wl.x, y: wl.y, z: wl.z, color: 0xffe0a8, intensity: 0.9, distance: 2.4, flicker: 0.03, halo: 0.14, haloOpacity: 0.5, pool: 0.5, poolOpacity: 0.14, priority: 4, power: 0.5, radius: 1.8 });
    this.look({ x: -4.22, y: Y + 0.95, z: -9.95, r: 0.45, label: 'The workbench', lines: ['A clock in pieces, every spring laid out in order. A vise with a tiny brass lever in it.', 'Tools on the pegboard, each drawn round in chalk so you know where it goes back. Two of the shapes are empty.'] });
    const dt = WP.draftingTable(53);
    this.place(dt.obj, -2.9, -9.78, 0);
    this.boxAt(-2.9, -9.78, 0.5, 0.39, 0.75);
    const dl = this.toM(dt.obj, dt.lamp);
    this.light({ kind: 'lamp', x: dl.x, y: dl.y, z: dl.z, color: 0xfff0c0, intensity: 0.8, distance: 2.2, flicker: 0.02, halo: 0.12, haloOpacity: 0.5, priority: 3, power: 0.45, radius: 1.6 });
    this.look({ x: -2.9, y: Y + 0.72, z: -9.7, r: 0.4, label: 'Old Star\'s drawings', lines: ['THE SURFACE EXPRESS, drawn in white on blue: every wheel, every rivet, a little window with a mole in it.', 'A lift cage, measured to the inch. "IF THE CABLE HOLDS" is written along the side, and underlined.', 'Sums in the margin. They all come to a million, however he adds them.'], aside: 'drawings' });
    this.prop(WP.toolChest(61), -1.22, -9.86, 0, 0.28, 0.19, 0.62);
    // the little railway in the middle of the room
    const rw = WP.modelRailway(1.5, 0.85, 51);
    const rx = -2.55, rz = -8.35;
    this.place(rw.obj, rx, rz, 0);
    this.boxAt(rx, rz, 0.75, 0.43, 0.5);
    const cars = rw.train.map((c, i) => { this.place(c, rx, rz, 0, Y + rw.track.y * T); this.parts.push(c); c.traverse((m) => { m.userData.noBatch = true; }); return c; });
    this.dyn.railway = { cars, x: rx, z: rz, y: Y + rw.track.y * T, rx: rw.track.rx * T, rz: rw.track.rz * T };
    this.look({ x: rx, y: Y + 0.55, z: rz, r: 0.55, label: 'Wind the little train', railway: true, special: true });
    // the loft over the workbench in the north-west corner (you can stand under it), the clockwork hen by the west wall
    const lf = WP.loftGallery(1.6, 0.74, 1.95, 59);
    const lfp = this.onWall(lf.obj, 'workshop', 'n', -4.2);
    for (const p of lf.posts) { const w = this.toM(lf.obj, { x: p.x, y: 0, z: p.z }); this.boxes.push([w.x - 0.05, Y, w.z - 0.05, w.x + 0.05, Y + 2.4, w.z + 0.05]); }
    this.boxes.push([R.x0, Y + 1.88, R.z0, R.x0 + 1.62, Y + 1.95, R.z0 + 0.74]); // the deck
    const ld = this.toM(lf.obj, { x: lf.lamp.x, y: lf.lamp.y, z: lf.lamp.z });
    this.light({ kind: 'candle', x: ld.x, y: ld.y, z: ld.z, color: 0xffc070, intensity: 0, real: false, halo: 0.08, haloOpacity: 0.6, flicker: 0.2, power: 0.3, radius: 1.1 });
    this.look({ x: lfp.x, y: Y + 2.1, z: lfp.z + 0.4, r: 0.6, label: 'The loft', lines: ['Crates up in the loft, stencilled SURFACE GOODS, and a hammock slung under the eaves.', 'A ladder up to it, rungs worn pale. He naps up there in the afternoons, when the forge is too hot.'] });
    this.prop(WP.clockworkHen(57).obj, -4.6, -8.2, Math.PI / 2, 0.18, 0.15, 0.25);
    this.look({ x: -4.6, y: Y + 0.45, z: -8.2, r: 0.22, label: 'The clockwork hen', lines: ['A brass hen with glass eyes and a key in her side. Her wing gears are showing. She looks a lot like Nugget.', 'A label round her neck: "FOR WHEN THE REAL ONE IS CROSS WITH ME".'], aside: 'hen' });
    for (const [x, z, s] of [[-4.62, -9.0, 4], [-1.15, -7.75, 6]]) { const c = crate(s, { open: s === 6 }); this.place(c.obj, x, z, s * 0.4); this.boxAt(x, z, 0.24, 0.24, 0.4, s * 0.4); }
    const bk = HP.bookcase(0.82, 1.45, 83);
    const bkp = this.onWall(bk.obj, 'workshop', 's', -1.85);
    this.wallBox(bkp, 0.86, 0.34, 1.55);
    // lamps hung over the railway and the bench
    for (const [x, z, d] of [[-2.55, -8.35, 0.75], [-4.2, -9.4, 0.9]]) {
      const hl = HP.hangingOilLamp(d);
      this.place(hl.obj, x, z, 0, Y + R.h);
      const p = this.toM(hl.obj, hl.light);
      this.light({ kind: 'lantern', x: p.x, y: p.y, z: p.z, color: 0xffc070, intensity: 1.0, distance: 3.0, flicker: 0.06, halo: 0.18, haloOpacity: 0.55, pool: 0.7, poolOpacity: 0.16, priority: 5, power: 0.6, radius: 2.4 });
    }
    const sc = HP.brassSconce(8);
    this.onWall(sc.obj, 'workshop', 'e', -9.6, 1.4);
    this.sconceLight(sc, 'workshop');
  }

  // ------------------------------------------------------------ the larder
  buildLarder() {
    const R = ROOM.larder;
    this.roomWindows('larder');
    const pa = HP.pantryShelf(1.75, 1.45, 66);
    const pap = this.onWall(pa.obj, 'larder', 's', -4.0);
    this.wallBox(pap, 1.8, 0.28, 1.5);
    const ch = WP.cheeseRack(0.85, 1.45, 71);
    const chp = this.onWall(ch, 'larder', 's', -2.62);
    this.wallBox(chp, 0.9, 0.36, 1.5);
    this.look({ x: -2.62, y: Y + 0.7, z: 2.45, r: 0.45, label: 'The cheese rack', lines: ['Wheels of cheese, yellow, orange and one with blue in it that smells like a cave. A wedge is gone from the big one.', 'A note pinned to the rack: "NUGGET. NO."'], aside: 'cheese' });
    const rb = WP.rootBins(1.1, 77);
    const rbp = this.onWall(rb.obj, 'larder', 'w', 1.35);
    this.wallBox(rbp, 1.15, 0.42, 0.45);
    const bc = WP.barrelCradle(3, 73);
    this.place(bc, R.x1 - 0.34, 1.68, -Math.PI / 2);
    this.boxAt(R.x1 - 0.34, 1.68, 0.76, 0.33, 0.55, -Math.PI / 2);
    this.look({ x: R.x1 - 0.4, y: Y + 0.45, z: 1.68, r: 0.5, label: 'The barrels', lines: ['CIDER, says the chalk on one. ALSO CIDER on the next. The third one just says NO.', 'They\'re cool to the touch. The whole larder is: it\'s cut deep into the rock.'] });
    this.prop(WP.iceChest(79).obj, -4.42, 0.2, 0, 0.38, 0.22, 0.4);
    this.prop(WP.mushroomLogs(81).obj, -3.28, 0.18, 0, 0.55, 0.22, 0.5);
    this.onWall(WP.mouseHole(83), 'larder', 'w', 2.32);
    this.prop(sack({ seed: 4, color: 0xd8c8a0 }).obj, -2.1, 1.25, 0.5);
    this.prop(sack({ seed: 5, color: 0xc8b890 }).obj, -2.35, 1.55, 1.9);
    const hr = WP.hangingRack(1.5, 75);
    this.place(hr, -3.45, 1.15, 0, Y + R.h - 0.02);
    const hl = HP.hangingOilLamp(0.5);
    this.place(hl.obj, -2.6, 0.75, 0, Y + R.h);
    const p = this.toM(hl.obj, hl.light);
    this.light({ kind: 'lantern', x: p.x, y: p.y, z: p.z, color: 0xffc888, intensity: 0.8, distance: 2.8, flicker: 0.07, halo: 0.16, haloOpacity: 0.5, pool: 0.6, poolOpacity: 0.14, priority: 4, power: 0.55, radius: 2.3 });
    this.look({ x: -3.4, y: Y + 1.2, z: 0.4, r: 0.6, label: 'Take a snack from the larder', larder: true, special: true });
  }

  // ------------------------------------------------------------ doors, steps, windows
  buildWays() {
    // the worn steps up to your room and the doorway's frame
    const steps = RP.wornSteps(64, 2, Math.round(STEP_H * 64), Math.round(STEP_D * 64), 43);
    this.place(steps.obj, ARCH.x, HALL.z1 - 2 * STEP_D, Math.PI, Y);
    const df = HP.doorFrame(ARCH.hw * 2, ARCH.h - Y, -HALL.z1, 7, { roundTop: true, step: -Y });
    this.place(df, ARCH.x, HALL.z1 / 2, 0, Y);
    // the doors between the rooms
    for (const d of DOORS) {
      const fr = HP.doorFrame(d.w, d.h, WALL, 11 + d.id.length);
      if (d.x !== undefined) this.place(fr, d.x, d.c, Math.PI / 2, Y);
      else this.place(fr, d.c, d.z, 0, Y);
    }
    // the front door to Deep Town: a round door in a stone arch, choked with rubble until it's dug
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
    }
    this.boxes.push([P.x - 0.6, Y, P.z - 0.6, P.x + 0.6, Y + 1.6, P.z - 0.02]); // the door itself and the tunnel behind
    // the steps' collision
    for (let i = 1; i <= 2; i++) this.boxes.push([STAIRS.x0, Y, HALL.z1 - i * STEP_D, STAIRS.x1, -i * STEP_H, HALL.z1 - (i - 1) * STEP_D]);
  }

  /** The round windows of one room. */
  roomWindows(id) { for (const w of WINDOWS) if (w.room === id) this.addWindow(w); }

  /** A round window on the cavern with its frame, glass glints, outside ledge and teal light. */
  addWindow(w) {
    const r = ROOM[w.room];
    const sill = { living: w.c < 2 ? 'plant' : 'candle', kitchen: 'jar', smithy: 'plant', hall: 'plant' }[w.room];
    const win = HP.roundWindow(w.r, 3 + Math.round(w.c * 7), sill);
    const p = this.onWall(win.obj, w.room, w.side, w.c, w.cy);
    void r;
    // the cavern's glow: a cool light just inside, a pool on the floor below, a faint halo in the glass
    const ix = p.x + (p.nx || 0) * 0.25, iz = p.z + (p.nz || 0) * 0.25;
    this.light({ kind: 'window', x: ix, y: Y + w.cy, z: iz, color: 0x7ad0c8, intensity: 0.35, distance: 2.2, flicker: 0.05, speed: 0.3, pool: 0.5, poolX: p.x + (p.nx || 0) * 0.7, poolZ: p.z + (p.nz || 0) * 0.7, poolOpacity: 0.08, priority: 2, power: 0.3, radius: 1.7, room: w.room });
    this.look({ x: p.x + (p.nx || 0) * 0.05, y: Y + w.cy, z: p.z + (p.nz || 0) * 0.05, r: w.r, label: 'Look out of the window', window: true, aside: 'window' });
    if (w.room === 'living' && sill === 'candle') { const s = this.toM(win.obj, { x: win.sill.x + 0.28, y: win.sill.y + 0.3, z: win.sill.z }); this.light({ kind: 'candle', x: s.x, y: s.y, z: s.z, color: 0xffc070, intensity: 0, real: false, halo: 0.07, haloOpacity: 0.55, flicker: 0.2, power: 0.15, radius: 0.6 }); }
  }

  plant(x, z, kind) {
    const p = HP.pottedPlant(kind, Math.round(x * 13 + z * 7));
    this.place(p.obj, x, z, x + z);
    this.boxAt(x, z, 0.14, 0.14, 0.3);
    if (p.glow) {
      const g = this.toM(p.obj, p.glow);
      this.light({ kind: 'shroom', x: g.x, y: g.y, z: g.z, color: 0x5ad0e0, intensity: 0, real: false, halo: 0.16, haloOpacity: 0.32, pool: 0.25, poolOpacity: 0.12, flicker: 0.06, speed: 0.3, power: 0.22, radius: 0.8 });
    }
  }

  sconceLight(sc, room) {
    const p = this.toM(sc.obj, sc.light);
    this.light({ kind: 'sconce', x: p.x, y: p.y, z: p.z, color: 0xffb860, intensity: 0.8, distance: 2.6, flicker: 0.1, halo: 0.14, haloOpacity: 0.55, priority: 2, power: 0.45, radius: 1.7, room });
  }

  // ------------------------------------------------------------ soot and wear (for the surfaces)
  /** Soot on walls and floors: round the forge and up the smithy's back wall, the hearths. */
  soot(x, y, z) {
    let k = 0;
    const F = SPOTS.forge;
    const df = Math.hypot((x - F.x) / 1.6, (z - F.z) / 1.4);
    if (df < 1 && roomAt(x, z)?.id !== 'kitchen') k = Math.max(k, (1 - df) * (y > Y + 0.6 ? 0.9 : 0.5));
    return Math.min(1, k);
  }

  /** Where feet have worn the floors pale: the ways between the doors. */
  wear(x, z) {
    const paths = [[2.5, -1.0, 2.5, -3.0], [2.5, -2.4, 5.4, -2.35], [-0.2, -1.75, 2.5, -2.2], [-0.2, -4.75, 1.4, -4.7], [-0.9, -1.75, -2.2, -2.6], [-2.35, -3.2, -2.35, -4.6], [5.2, -2.35, 7.2, -3.37], [6.2, -2.4, 6.2, -5.2]];
    let best = 0;
    for (const [ax, az, bx, bz] of paths) {
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      best = Math.max(best, Math.max(0, 1 - d / 0.45));
    }
    return best * 0.6 * (0.7 + 0.3 * Math.sin(x * 9) * Math.sin(z * 7));
  }

  // ------------------------------------------------------------ water
  /** A still water surface (meters), w × d, turned by yaw; rippled by the scene (ripple()). Made in the scene. */
  addWater(name, x, y, z, w, d, yaw, color, round = false) {
    this.waterSpecs.push({ name, x, y, z, w, d, yaw, color, round });
  }

  addWaterMesh({ name, x, y, z, w, d, yaw, color, round }) {
    const mat = waterMaterial(color, round);
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
    return (x, y, z, nx, ny, nz, out) => {
      let k = 0.78;
      const h = y - Y;
      if (h > 1.3) k *= Math.max(0.5, 1 - (h - 1.3) * 0.4);
      if (h < 0.15) k *= Math.max(0.55, 0.8 + h * 1.4);
      if (ny < -0.5) k *= 0.72;
      out[0] = k; out[1] = k * 0.92; out[2] = k * 0.85;
    };
  }

  // ------------------------------------------------------------ frame
  /** Fires breathe, flames lick, the pendulum swings, water shimmers. air: the forge's draught 0..1 (bellows). */
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
  let lastRoom = undefined, list = L;
  for (let i = 0; i < pos.count; i++) {
    const k = i * 3, x = P[k], y = P[k + 1], z = P[k + 2];
    const room = roomAt(x, z)?.id ?? null;
    if (room !== lastRoom) { lastRoom = room; list = room ? L.filter((l) => !l.room || l.room === room || l.spill?.includes(room)) : L; }
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
    uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(color) }, uRip: { value: rip }, uRipN: { value: 0 }, uRound: { value: round ? 1 : 0 } },
    vertexShader: /* glsl */`
      varying vec3 vL; varying vec3 vW;
      void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uCol; uniform vec4 uRip[4]; uniform float uRound;
      varying vec3 vL; varying vec3 vW;
      void main() {
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

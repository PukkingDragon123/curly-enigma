// Old Star's cave: one small, old hollow in the rock, lived in for sixty years and patched ever
// since. His stone forge against the north rock with its pipe up a crack (black with soot round it),
// the bellows, the anvil on its stump, his quench bucket and a heap of coal; his tools on pegs on the
// west rock under an old frame of shoring timbers, his leather apron on a nail, the grey fleece he
// sleeps on by the forge's warmth, his trunk in the south-west corner; the fire pit in its ring of
// stones in the south-east with the tripod, the pot and the kettle, his stump to sit on; his notes
// nailed straight to the rock, the slate on a crate in the corner that is his Miners' Board, THE WAY
// UP chalked on the rock beside it; the rusty cage lift in its shaft in the east rock, the old door
// to Deep Town in the north rock (caved in until you find it from below); the hole you fell through
// up in the roof, a thin grey light down it, what came down with you on the floor under it; and your
// bedroll on the floor along the south rock, a flat stone at its head with your notebook (the Index
// Book) and a candle, your little trunk at its foot. Roots, drips, cobwebs, a few glowing mushrooms.
// The alcoves you dig out later (nooks.js) open off it: the rock, your corner (which moves into your
// sleeping alcove once it's dug), the soft walls still to dig and the collision follow the open set.
//
// Built in jobs (JOBS: the rock, the west of the hollow, the east, then 'ways': the door, your
// corner, the alcoves' lanterns and the walls' collision), each of which can run in a build worker
// (houseWorker.js, driven by houseLoad.js) or on the main thread: a job builds its pieces, merges the
// static voxels by material, bakes the cave's fixed lights into them and packs it all (pack.js); the
// scene puts the packed jobs back together (StarHouse.assemble), builds the cage lift itself, and
// keeps fires, water and moving parts live. Also the lights (for the scene's light pool), the
// collision boxes, the seats and Old Star's places. (The scene still calls it `scene.cave` / `scene.house`.)
import * as THREE from 'three';
import { keepUnbatched } from '../iso/vox.js';
import { lowRes, group, VoxelGrid, M32, M16, G16, line, h3, mulc } from '../iso/kit.js';
import { crate, rubble } from '../iso/props.js';
import { townDoor, doorRubble, lanternOnHook } from './props.js';
import * as TP from './tavernProps.js';
import * as CP from './caveProps.js';
import * as RP from './ruinProps.js';
import * as HP from './houseProps.js';
import * as KP from './clutterProps.js';
import * as CMP from './campProps.js';
import * as HW from './hollowProps.js';
import { buildCaveRock, caveBoxes, DRIPS, chalkSpots, chalkDecal } from './caveShell.js';
import { ROOMS, FY, roomAt, hollowSD, caveSD, ceilAt, lean, setOpenNooks } from './plan.js';
import { NOOKS, diggable, nooksFromKey } from './nooks.js';
import { SPOTS, STAR_SPOTS, NOOK_BED } from './spots.js';
import { T, HALL, SHAFT, FRONT, HOLE, ROOM_CURTAINS } from './units.js';
import { HomeLift, LIFT, LIFT_LIGHTS } from './lift.js';
import { Merger, worldGeo, mergeQuads, matDesc, matFrom, quantize, qTransfer, unquantize, packNode, unpackNode, packRef, unpackRef, CSCALE } from './pack.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

const tl = (m) => m / T;
const Y = FY;

/** (Old: his shack. Gone with the camp; kept so old imports still resolve.) */
export const SHACK = { x: 99, z: 99, W: 0, D: 0, Hf: 0, Hb: 0, dc: 0, dw: 0 };

export { SPOTS, STAR_SPOTS };

/** What a job hands the scene besides its meshes, lights, boxes and looks (dyn and furn too). */
const KEEP = ['boardObj', 'doorFrame', 'doorLeaf', 'passage', 'boardAt', 'minersAt', 'notePins', 'glints', 'gramophone', 'holeTop', 'laundry', 'mine', 'digAt'];

/** The build jobs: the rock, the west of the hollow, the east, then the door, your corner and the walls' collision. */
export const JOBS = ['rock', 'west', 'east', 'ways'];
const BUILDERS = { rock: 'buildRock', west: 'buildWest', east: 'buildEast', ways: 'buildWays' };

/**
 * The cave's fixed lights (m): the fire pit, the forge, the lanterns, the hole's grey light, the glow
 * in the damp corner. Every job bakes with them (the 'rock' job hands them to the scene).
 */
export function campLights() {
  const S = SPOTS;
  const L = [
    // (warm pools that end: past them the rock is cold and blue)
    { kind: 'fire', x: S.fire.x, y: Y + 0.22, z: S.fire.z, color: 0xff9244, intensity: 2.0, distance: 3.2, flicker: 0.32, speed: 1.3, pool: 0.95, poolOpacity: 0.3, halo: 0.4, haloOpacity: 0.3, priority: 9, power: 1.3, radius: 2.4 },
    { kind: 'forge', x: S.forge.x, y: Y + 0.62, z: S.forge.z + 0.05, color: 0xffb466, intensity: 1.7, distance: 3.0, flicker: 0.28, speed: 1.4, pool: 0.8, poolZ: S.forge.z + 0.6, poolOpacity: 0.22, halo: 0.36, haloOpacity: 0.3, priority: 9, power: 0.9, radius: 2.2 },
    { kind: 'lantern', x: 5.3, y: Y + 1.42, z: -2.6, color: 0xffb860, intensity: 0.7, distance: 2.8, flicker: 0.12, halo: 0.18, haloOpacity: 0.5, pool: 0.6, poolOpacity: 0.12, priority: 6, power: 0.5, radius: 2.2 },
    { kind: 'lantern', x: FRONT.x + 0.62, y: Y + 1.05, z: FRONT.z + 0.24, color: 0xffb050, intensity: 0.55, distance: 2.4, flicker: 0.12, halo: 0.15, haloOpacity: 0.5, pool: 0.45, poolOpacity: 0.12, priority: 4, power: 0.4, radius: 1.8 },
    { kind: 'sky', x: HOLE.x, y: Y + 1.7, z: HOLE.z, color: 0xa8c0d8, intensity: 0.55, distance: 3.0, flicker: 0.03, speed: 0.2, pool: 0.75, poolX: HOLE.x, poolZ: HOLE.z, poolOpacity: 0.2, poolColor: 0xb8d0e8, halo: 0.28, haloOpacity: 0.1, priority: 5, power: 0.5, radius: 2.4 },
    // (bake only: the hole's shaft lit cold and grey from the daylight far up it)
    { kind: 'skyhi', x: HOLE.x, y: Y + 2.9, z: HOLE.z, color: 0x9ab4cc, intensity: 0, real: false, flicker: 0, power: 0.8, radius: 1.4 },
    { kind: 'shroom', x: 2.66, y: Y + 0.25, z: -3.18, color: 0x5ad0d8, intensity: 0.3, real: true, distance: 1.6, halo: 0.2, haloOpacity: 0.3, pool: 0.38, poolOpacity: 0.12, flicker: 0.06, speed: 0.3, power: 0.3, radius: 1.1, priority: 2 },
  ];
  const cl = LIFT_LIGHTS.cage, lp = LIFT_LIGHTS.portal;
  L.push({ kind: 'lift', x: cl.x, y: cl.y, z: cl.z, color: 0xffb860, intensity: 0.4, distance: 2.0, flicker: 0.1, halo: 0.16, haloOpacity: 0.55, priority: 2, power: 0.16, radius: 1.3 });
  L.push({ kind: 'portal', x: lp.x, y: lp.y, z: lp.z, color: 0xffb050, intensity: 0.25, distance: 2.2, flicker: 0.12, halo: 0.18, haloOpacity: 0.55, pool: 0.6, poolOpacity: 0.15, priority: 4, power: 0.22, radius: 1.6 });
  for (const l of L) { l.room = null; l.fixed = true; }
  return L;
}

/** The lanterns Old Star hung in the alcoves you've dug (m): one in each, on a hook in the rock by its neck. */
export function nookLanterns(set) {
  const out = [];
  for (const n of NOOKS) {
    if (!set.has(n.id)) continue;
    const [x0, z0, x1, z1] = n.rect.map((v) => v * T);
    // inside the alcove, on the wall beside where the neck comes in, a little to one side
    const nk = n.neck, cx = (nk[0] + nk[2]) / 2, cz = (nk[1] + nk[3]) / 2;
    const side = n.open.n ? { x: Math.min(x1 - 0.25, nk[2] + 0.32), z: z0 + 0.08, nx: 0, nz: 1 } : n.open.e ? { x: x1 - 0.08, z: Math.min(z1 - 0.3, nk[3] + 0.3), nx: -1, nz: 0 } : { x: x0 + 0.08, z: cz, nx: 1, nz: 0 };
    void cx;
    out.push({ id: n.id, kind: 'lantern', x: side.x + side.nx * 0.12, y: Y + 1.18, z: side.z + side.nz * 0.12, wx: side.x, wz: side.z, nx: side.nx, nz: side.nz, color: 0xffb860, intensity: 0.85, distance: 3.4, flicker: 0.12, halo: 0.16, haloOpacity: 0.5, pool: 0.7, poolOpacity: 0.12, priority: 5, power: 0.72, radius: 3.0 });
  }
  return out;
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
    this.drapes = []; // cloth the scene hangs (campCloth.js): { cloth, x, y, z, yaw, w, h, ... } (m)
  }

  // ------------------------------------------------------------ a build job
  /** Build one job ('rock', 'west', 'east', 'ways'). opts: { doorOpen, notes, nooks (nookKey of the open alcoves) }. */
  buildJob(id, opts = {}) {
    const t0 = performance.now();
    this.opts = opts;
    // (the alcoves dug in this save: the rock, your corner and the collision follow them)
    this.nookSet = nooksFromKey(opts.nooks);
    setOpenNooks(this.nookSet);
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
    const meta = packRef({ dyn: this.dyn, furn: this.furn, drapes: this.drapes, ...Object.fromEntries(KEEP.map((k) => [k, this[k]])) }, ctx);
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
    // (the scene hangs the washing and every other drape as cloth: campCloth.js)
    h.laundry = [...(h.laundry || []), ...h.drapes];
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
    if (meta.drapes?.length) this.drapes.push(...meta.drapes);
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
   * The earth under the camp: from inside the lift shaft (riding up or down) you see its face, a
   * voxel relief of banded earth, clay and stone with stones and roots standing out of it, timbered
   * at the landing under the oak sill; lit and merged with the camp near the landing, falling
   * away into the dark below (as the shaft's lining does).
   */
  buildUnder() {
    const decor = new THREE.Group();
    this.room.add(decor);
    for (const m of underEarth()) decor.add(m);
    decor.add(landingSill());
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
  }

  // ------------------------------------------------------------ placing
  /** The floor's top under (x, z) (m). */
  ground() { return Y; }

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
    // (from the root down: the room's tile scale must be in it, or the point comes out in tiles,
    // twice as far out: the forge's embers, the kettle's steam, the spring, the candles' glows and
    // the shack's lantern all used to land a long way off)
    obj.updateWorldMatrix(true, false);
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

  /**
   * Cloth for the scene to hang (campCloth.js): a sheet w × h m whose middle top (its pins) is at
   * (x, y, z) m, turned yaw; o: the rest of the drape spec (nx, ny, pins, layout, boxes, floor, tex, color...).
   * For layout 'flat' (x, z) is the sheet's middle and y its height.
   */
  drape(kind, x, y, z, yaw, w, h, o = {}) {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const flat = o.layout === 'flat';
    // the frame is the sheet's first corner: back from the middle along its x (and z when flat)
    const ox = -w / 2, oz = flat ? -h / 2 : 0;
    this.drapes.push({ cloth: kind, x: x + ox * c + oz * sn, y, z: z - ox * sn + oz * c, yaw, w, h, ...o });
  }

  /** Where the rock is from (x, z) going -(nx, nz), h m over the floor (as onRock, without a piece). */
  rockAt(x, z, nx, nz, h = 0.6, gap = 0.01) {
    let px = x, pz = z;
    for (let i = 0; i < 80 && hollowSD(px, pz) + lean(h) < -gap; i++) { px -= nx * 0.02; pz -= nz * 0.02; }
    return { x: px, z: pz, yaw: Math.atan2(nx, nz) };
  }

  /**
   * A tarp w × d m thrown over the things under it, centred on (x, z) turned yaw: boxes [bx, bz,
   * hw, hd, h] in that turned frame (m). pin: [i, j] of its 9 × 9 particles that stays put (on the top).
   */
  tarpOver(x, z, yaw, boxes, w = 0.78, d = 0.72, pin = [4, 4], seed = 1) {
    const top = Math.max(...boxes.map((b) => b[4]));
    const lift = top + 0.02;
    // the boxes in the sheet's frame (its first corner, lift over the floor)
    const bb = boxes.map(([bx, bz, bhw, bhd, bh]) => [w / 2 + bx - bhw, -lift - 0.05, d / 2 + bz - bhd, w / 2 + bx + bhw, -lift + bh, d / 2 + bz + bhd]);
    this.drape('tarp', x, Y + lift, z, yaw, w, d, { layout: 'flat', nx: 9, ny: 9, pins: [pin], boxes: bb, floor: -lift + 0.012, tex: { kind: 'tarp', seed }, iters: 4, damping: 2.6, gust: 0.2 });
  }

  /** A curtain rod (m): from x0 to x1 at height y, z; brass knobs on the ends. Into the static decor. */
  rod(x0, x1, y, z, parent = this.decor) {
    const L = Math.round((x1 - x0) * 64);
    const g = new VoxelGrid(L + 6, 6, 6);
    line(g, [[3, 3, 3], [L + 3, 3, 3]], 1.1, (x) => (x % 7 === 0 ? 0x4a2c16 : 0x5e3a1e));
    for (const ex of [1, L + 4]) g.box(ex - 1, 1, 1, 3, 4, 4, 0xc8a050);
    const m = M32(g, [3, 3, 3]);
    this.place(m, x0, z, 0, y, parent);
    return m;
  }

  // ------------------------------------------------------------ the rock
  /** The hollow's rock, its floor and roof, the hole, roots, drips, the glow in the damp corner; your alcoves' lanterns' light. */
  buildRock() {
    const set = this.nookSet;
    const rock = buildCaveRock(set);
    this.decor.add(rock.obj);
    this.holeTop = rock.top;
    for (const l of campLights()) this.lights.push(l);
    for (const l of nookLanterns(set)) this.light({ ...l, wx: undefined, wz: undefined });
    // Old Star's chalk on the rock: THE WAY UP, and an arch and an X on each soft wall still to dig
    chalkSpots(set).forEach((c, i) => { const m = chalkDecal(c, set, 7 + i); if (m) this.decor.add(m); });
    // water dripping from the roof onto the dark wet patches in the floor
    DRIPS.forEach((d, i) => {
      this.drips.push({ x: d.x, z: d.z, y: ceilAt(d.x, d.z) - 0.04, t: 1 + i * 0.7, every: 2.4 + (i % 3) * 1.3, pool: false });
    });
    // a few glowing mushrooms in the damp corner behind the bellows
    const s = CMP.glowCaps(3, 0, 0.75);
    this.place(s.obj, 2.66, -3.18, 3);
    this.boxAt(2.66, -3.18, 0.12, 0.12, 0.16);
    this.look({ x: 2.66, y: Y + 0.15, z: -3.18, r: 0.24, label: 'Glowing mushrooms', pick: true, special: true });
    this.look({ x: HOLE.x, y: Y + 1.7, z: HOLE.z, r: 0.45, label: 'Look up at the hole', lines: ['A ragged hole in the roof, roots all round it, and far up a grey speck of daylight. That\'s where I came in.', 'Dirt still trickles down now and then. A long way down. Lucky the floor was soft.'], aside: 'hole' });
  }

  // ------------------------------------------------------------ the west: the forge corner, his fleece, his trunk
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
    // the anvil on its stump, his quench bucket, the coal
    const a = CP.anvil(9);
    this.place(a.obj, S.anvil.x, S.anvil.z, S.anvil.yaw);
    this.dyn.anvilFace = this.toM(a.obj, a.face);
    this.boxAt(S.anvil.x, S.anvil.z, 0.3, 0.14, 0.72, S.anvil.yaw);
    const bk = CP.quenchBucket(15);
    this.place(bk.obj, S.trough.x, S.trough.z, 0.4);
    const mouth = this.toM(bk.obj, bk.mouth);
    this.addWater('trough', mouth.x, Y + 13.4 / 64, mouth.z, 0.2, 0.2, 0, 0x1e3a44, true);
    this.dyn.troughAt = { x: S.trough.x, y: Y + 13.4 / 64, z: S.trough.z };
    this.dyn.bucket = { obj: bk.obj, water: bk.water, home: { x: S.trough.x, z: S.trough.z } };
    this.boxAt(S.trough.x, S.trough.z, 0.15, 0.15, 0.3);
    const coal = lowRes(() => CP.coalHeap(33));
    coal.obj.scale.setScalar(0.8);
    this.place(coal.obj, S.coal.x, S.coal.z, S.coal.yaw);
    this.boxAt(S.coal.x, S.coal.z, 0.24, 0.2, 0.18, S.coal.yaw);
    // an old tarp half over the coal (to keep the drips off it; cloth: it lifts in the draught)
    this.tarpOver(S.coal.x + 0.06, S.coal.z + 0.02, S.coal.yaw, [[0, 0, 0.22, 0.17, 0.16]], 0.6, 0.5, [2, 2], 5);
    // old shoring timbers along the west rock, his tools on pegs between the posts, his apron on a nail
    const sh = this.rockAt(2.9, -2.33, 1, 0, 1.0);
    this.place(HW.shoring(1.25, Math.min(1.5, ceilAt(2.7, -2.33) - Y - 0.04), 307), sh.x + 0.02, -2.33, Math.PI / 2, Y);
    this.boxes.push([sh.x - 0.1, Y, -2.33 - 0.66, sh.x + 0.18, Y + 1.5, -2.33 - 0.5], [sh.x - 0.1, Y, -2.33 + 0.5, sh.x + 0.18, Y + 1.5, -2.33 + 0.66]);
    this.onRock(HW.toolPegs(317), 2.9, -2.33, 1, 0, 0.42, 0.9);
    const ah = this.onRock(KP.apronHook(247, { apron: false }), 2.9, -3.18, 1, 0, 0.42, 0.9);
    this.drape('apron', ah.x + ah.nx * 0.07, Y + 0.42 + 55 / 64, ah.z + ah.nz * 0.07, ah.yaw, 0.36, 0.7, { nx: 6, ny: 9, pins: [[2, 0], [3, 0]], tex: { kind: 'apron', seed: 4 }, boxes: [[-1, -2, -1, 2, 1, -0.06]], floor: -(0.42 + 55 / 64) + 0.01, iters: 4, damping: 2.2, gust: 0.6 });
    this.web(2.62, 1.1, -3.6, Math.PI / 4, 0.24, 1);
    // his grey fleece along the west rock (where he sleeps: the forge keeps that corner warm)
    const pl = HW.pelt(303);
    this.place(pl.obj, S.cot.x, S.cot.z, S.cot.yaw);
    this.dyn.cot = { obj: pl.obj, lie: pl.lie, foot: pl.foot };
    this.look({ x: S.cot.x, y: Y + 0.1, z: S.cot.z, r: 0.3, label: 'Old Star\'s fleece', lines: ['A grey fleece gone flat and yellow at the edges, a cushion with a patch. Old Star sleeps here, by the forge.', 'He gave you his bedroll. He says the fleece is warmer anyway. It isn\'t.'] });
    // his trunk in the south-west corner, a stack of books beside it, candle stubs on the rock
    const chs = TP.lootChest(17);
    const cg = group(chs.obj, chs.lid, chs.loot);
    this.place(cg, S.chest.x, S.chest.z, S.chest.yaw, null, this.room);
    this.dyn.chest = { ...chs, group: cg };
    cg.traverse((m) => { m.userData.noBatch = true; });
    this.liveBake.push(cg);
    this.boxAt(S.chest.x, S.chest.z, 0.32, 0.2, 0.36, S.chest.yaw);
    this.prop(KP.bookStack(5, 205), 3.22, -1.42, 0.5, 0.15, 0.13, 0.24);
    this.look({ x: 3.22, y: Y + 0.22, z: -1.42, r: 0.2, label: 'Browse the books', books: true, aside: 'books' });
    this.stubs(3.0, -1.72, Y, 2, 74);
    this.web(2.95, 1.0, -1.05, -Math.PI * 0.75, 0.24, 2);
  }

  // ------------------------------------------------------------ the east: the fire pit, the notes, the slate, the hole
  buildEast() {
    const S = SPOTS;
    // the fire pit in its ring of stones, the tripod, the pot and the kettle (the cooking spot)
    const ch = CP.cookHearth(23);
    this.place(ch.obj, S.fire.x, S.fire.z, 0.4);
    const fire = this.toM(ch.obj, ch.fire);
    this.dyn.hearth = { flames: ch.flames, embers: ch.embers, fire, pot: this.toM(ch.obj, ch.pot), kettle: this.toM(ch.obj, ch.kettle) };
    this.dyn.fireplace = { flames: ch.flames, fire };
    this.boxAt(S.fire.x, S.fire.z, 0.36, 0.36, 0.28);
    this.look({ x: S.fire.x, y: Y + 0.4, z: S.fire.z, r: 0.2, label: 'The kettle', lines: ['A black iron kettle on a hook, older than you. It sings when it boils, a bit flat.', 'Soot an inch thick on the pot. "Seasoning," says Old Star.'] });
    // his stump by the fire (he sits there of an evening, with his pipe)
    const st = HW.stumpSeat(305);
    const ay = Math.atan2(S.fire.x - S.armchair.x, S.fire.z - S.armchair.z);
    this.place(st.obj, S.armchair.x, S.armchair.z, ay);
    this.furn.push({ id: 'armchair', obj: st.obj, seats: st.seats, box: null });
    this.boxAt(S.armchair.x, S.armchair.z, 0.22, 0.22, 0.42, ay);
    // the old lantern hanging over the middle of the hollow
    const lan = HP.hangingOilLamp(Math.max(0.2, ceilAt(5.3, -2.6) - Y - 1.5), 98);
    this.place(lan.obj, 5.3, -2.6, 0, ceilAt(5.3, -2.6) - 0.02);
    // his notes nailed to the north rock
    this.buildBoard();
    // the slate on a crate in the north-east corner: his Miners' Board
    const sl = HW.slateOnCrate(319);
    this.place(sl.obj, S.miners.x, S.miners.z, S.miners.yaw);
    this.boxAt(S.miners.x, S.miners.z, 0.2, 0.2, 0.62, S.miners.yaw);
    const f = this.toM(sl.obj, sl.face);
    this.minersAt = { x: f.x, y: Y + 0.32, z: f.z, nx: Math.sin(S.miners.yaw), nz: Math.cos(S.miners.yaw), slate: true };
    this.look({ x: S.dream.x, y: Y + 1.15, z: S.dream.z + 0.1, r: 0.32, label: 'The chalk on the rock', lines: ['"THE WAY UP", chalked on the rock over a thermometer to a million. It reached nearly halfway once.', 'Then it was rubbed out, right down to the bottom. Tally marks beside it. Years, by the look of them. Lots of years.'], aside: 'dream' });
    // the way to Deep Town: a lantern on a hook by the old door, a painted board, cobwebs, stones down from the cave-in
    const dl = lanternOnHook(4);
    this.onRock(dl.obj, FRONT.x + 0.62, FRONT.z + 0.3, 0, 1, 0.62, 1.1);
    this.onRock(CMP.townSign(113).obj, FRONT.x + 0.66, FRONT.z + 0.3, 0, 1, 1.28, 1.35);
    this.web(FRONT.x - 0.5, 0.92, FRONT.z + 0.1, 0, 0.24, 7);
    this.place(CMP.fallenStones(5, 0.6, 0.3, 115), FRONT.x - 0.05, FRONT.z + 0.62, 0.1);
    // what came down with you, under the hole
    const db = lowRes(() => RP.fallDebris(65));
    db.obj.scale.setScalar(0.45);
    this.place(db.obj, S.rubble.x, S.rubble.z, 0.3, Y + 0.01);
    this.glints = db.glints.map((p) => { const w = this.toM(db.obj, p); w.y = Y + 0.03; return w; });
    this.dyn.debris = db.obj;
    this.boxAt(S.rubble.x, S.rubble.z, 0.24, 0.24, 0.1);
    // an old prop post holding up a cracked slab of roof by the lift
    this.prop(HW.propPost(ceilAt(7.55, -3.32) - Y - 0.02, 309), 7.55, -3.32, 0.2, 0.1, 0.1, 1.6);
    this.web(SHAFT.x0 - 0.05, 1.3, SHAFT.z0 - 0.3, -Math.PI / 2, 0.26, 5);
    this.web(6.95, 0.95, -0.92, Math.PI, 0.22, 6);
  }

  /** His notes nailed to the north rock (facing south into the hollow). */
  buildBoard() {
    const S = SPOTS;
    const board = HW.rockNotes(Math.max(3, Math.min(7, this.opts.notes ?? 6)), 315);
    const bp = this.onRock(board.obj, S.board.x, S.board.z + 0.5, 0, 1, 0.55, 0.9, 0.005);
    this.boardObj = board.obj;
    this.dyn.board = board;
    this.notePins = board.notes.map((q) => this.toM(board.obj, { x: q.x, y: q.y, z: 0.1 }));
    this.boardAt = { x: bp.x, z: bp.z, y: Y + 0.55, w: board.w * T, h: board.h * T, nx: 0, nz: 1 };
    this.light({ kind: 'notes', x: bp.x, y: Y + 1.2, z: bp.z + 0.5, color: 0xffd8a0, intensity: 0, real: false, power: 0.25, radius: 1.1 });
  }

  // ------------------------------------------------------------ the way out, your corner, the alcoves, the walls' collision
  buildWays() {
    const set = this.nookSet;
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
    // your corner: the bedroll on the floor, the flat stone at its head (your notebook), your trunk;
    // in the hollow along the south rock until your sleeping alcove is dug, then in there
    const inNook = set.has('nook_bed');
    const at = inNook ? NOOK_BED : SPOTS;
    const br = HW.bedroll(301);
    this.place(br.obj, at.bed.x, at.bed.z, at.bed.yaw);
    const c = Math.abs(Math.cos(at.bed.yaw)), s = Math.abs(Math.sin(at.bed.yaw));
    this.boxes.push([at.bed.x - br.hw * c - br.hd * s, Y, at.bed.z - br.hw * s - br.hd * c, at.bed.x + br.hw * c + br.hd * s, Y + 0.12, at.bed.z + br.hw * s + br.hd * c]);
    this.shadowSpots.push({ x: at.bed.x, z: at.bed.z, w: (br.hw * c + br.hd * s) * 2 + 0.1, h: (br.hw * s + br.hd * c) * 2 + 0.1 });
    this.dyn.bedroll = { obj: br.obj, lie: br.lie, head: br.head, foot: br.foot, x: at.bed.x, z: at.bed.z, yaw: at.bed.yaw, inNook };
    const lg = HW.stoneLedge(311);
    this.place(lg.obj, at.ledge.x, at.ledge.z, at.ledge.yaw);
    this.boxAt(at.ledge.x, at.ledge.z, 0.23, 0.17, 0.3, at.ledge.yaw);
    const fl = this.toM(lg.obj, lg.flame);
    this.light({ kind: 'candle', x: fl.x, y: fl.y, z: fl.z, color: 0xffc070, intensity: 0.45, distance: 1.6, flicker: 0.2, halo: 0.08, haloOpacity: 0.6, priority: 3, power: 0.3, radius: 1.1, real: true });
    const tr = HW.tinTrunk(313);
    this.place(tr, at.mine.x, at.mine.z, at.mine.yaw);
    this.boxAt(at.mine.x, at.mine.z, 0.24, 0.16, 0.3, at.mine.yaw);
    this.mine = { ledge: { x: at.ledge.x, z: at.ledge.z, yaw: at.ledge.yaw, top: Y + lg.top * T }, trunk: { x: at.mine.x, z: at.mine.z, yaw: at.mine.yaw } };
    // the alcoves you've dug: a lantern on a hook in each, a curtain of sacking across your own
    for (const l of nookLanterns(set)) {
      const h = lanternOnHook(9);
      this.place(h.obj, l.wx, l.wz, Math.atan2(l.nx, l.nz), Y + 0.92);
    }
    if (inNook) {
      const A = ROOM_CURTAINS.arch, pw = A.hw - 0.04;
      this.rod(A.x - A.hw, A.x + A.hw, A.y + 0.02, A.z);
      // one old sack split open and nailed up, pulled aside to the left (lamplight past it)
      const cw = pw * 1.15;
      this.drape('curtain', A.x - A.hw + cw / 2, A.y, A.z, 0, cw, A.y - 0.03, { nx: 7, ny: 11, tex: { kind: 'sacking', w: 26, h: 40, base: [128, 104, 76], seed: 41, holes: false }, floor: -A.y + 0.012, iters: 4, damping: 1.6, slack: 1.04 });
    }
    // the soft rock still to dig: loose earth heaped under the chalk (the chalk is on the rock itself)
    this.digAt = [];
    for (const n of NOOKS) {
      if (!diggable(n.id, set)) continue;
      const r = this.rockAt(n.dig.x - n.dig.nx * 0.6, n.dig.z - n.dig.nz * 0.6, -n.dig.nx, -n.dig.nz, 0.5);
      this.place(HW.looseEarth(0.62, 321 + n.id.length), r.x - n.dig.nx * 0.03, r.z - n.dig.nz * 0.03, Math.atan2(-n.dig.nx, -n.dig.nz), Y);
      this.digAt.push({ id: n.id, x: r.x, z: r.z, nx: -n.dig.nx, nz: -n.dig.nz });
    }
    // the floor and the rock walls
    this.boxes.push([HALL.x0 - 8, Y - 1, HALL.z0 - 2, HALL.x1 + 4, Y, 6]);
    this.boxes.push(...caveBoxes(set));
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
      let k = 0.6;
      const h = y - Y;
      if (h > 1.2) k *= Math.max(0.45, 1 - (h - 1.2) * 0.45);
      if (h < 0.15) k *= Math.max(0.6, 0.82 + h * 1.4);
      if (ny < -0.5) k *= 0.7;
      const edge = hollowSD(x, z);
      if (edge > -0.5) k *= 0.82 + Math.max(0, -edge) * 0.36; // the rock's own shade near the walls
      out[0] = k * 0.62; out[1] = k * 0.8; out[2] = k * 1.18; // (cold blue rock: the firelight is the warm)
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
// ------------------------------------------------------------ the shaft's west face (buildUnder)
/** Voxels per metre of the earth face (1/32 m: rock and earth, coarser than the timber). */
const UV = 32;
const EARTH = [0x3f2e20, 0x4a3626, 0x553f2c, 0x4e3a28];
const CLAY = [0x5c3c28, 0x6a4630, 0x62402c];
const STONE = [0x4a4844, 0x5a5852, 0x52504a];
const PEBBLE = [0x7a7468, 0x8a8070, 0x6c665c];
const ROOT = [0x2c1c12, 0x3a2618];
const PLANK = [0x4e3220, 0x563826, 0x46301e];
/** How lit the face is at y (m): the lining's fade (lift.js), full near the landing, black far down. */
const underFade = (y) => { const yy = (y - HALL.y) * 64; return yy >= -40 ? 1 : Math.max(0.04, 0.55 * (1 - Math.min(1, -yy / 170)) ** 1.6); };

/**
 * The earth under the camp as seen through the lift shaft's open west side: a relief of voxel
 * columns standing out of the dark toward the shaft (x up to SHAFT.x0), banded by strata, with
 * stones and pebbles proud of the face, roots trailing down it and plank cribbing under the sill.
 * Two meshes: the lit part near the landing (merged and lit with the camp) and the unlit part
 * below, its colours fading into the dark. In tile units, for the room group.
 */
function underEarth() {
  const z0 = SHAFT.z0 - 0.4, z1 = SHAFT.z1 + 0.4, yTop = Y - 0.26, yBot = SHAFT.pit - 0.1, yLit = HALL.y - 40 / 64;
  const NZ = Math.round((z1 - z0) * UV), D = 8;
  const nLit = Math.round((yTop - yLit) * UV), nDark = Math.round((yLit - yBot) * UV);
  // stones bedded in the face: lumps that stand out a few voxels
  const stones = [];
  for (let i = 0; i < 26; i++) stones.push({ z: h3(i, 1, 7, 31) * NZ, y: h3(i, 2, 7, 31) * (nLit + nDark), r: 1.6 + h3(i, 3, 7, 31) * 2.6, c: STONE[i % 3] });
  const roots = [];
  for (let i = 0; i < 9; i++) roots.push({ z: Math.floor(h3(i, 4, 9, 33) * NZ), y0: nLit + nDark - 6 - Math.floor(h3(i, 5, 9, 33) * 30), len: 10 + Math.floor(h3(i, 6, 9, 33) * 34) });
  const build = (n, yOff, fade) => {
    const g = new VoxelGrid(D, n, NZ);
    for (let y = 0; y < n; y++) {
      const Yv = y + yOff, wy = yBot + (Yv + 0.5) / UV;
      const k = fade ? underFade(wy) : 1;
      // strata: wavy bands of earth, clay and stone
      const band = Math.floor((Yv + Math.sin(Yv * 0.07) * 3) / 11);
      const kind = band % 5 === 2 ? CLAY : band % 7 === 4 ? STONE : EARTH;
      for (let z = 0; z < NZ; z++) {
        let h = 3 + Math.floor(h3(z >> 2, Yv >> 2, 3, 41) * 2.5) + (h3(z, Yv, 5, 43) < 0.08 ? 1 : 0);
        let c = kind[Math.floor(h3(z >> 1, Yv >> 1, band, 45) * kind.length)];
        for (const st of stones) {
          const d = Math.hypot(z - st.z, (Yv - st.y) * 1.15);
          if (d < st.r) { h = Math.max(h, 5 + Math.round((1 - d / st.r) * 2)); c = d < st.r * 0.45 ? mulc(st.c, 1.15) : st.c; }
        }
        if (h3(z, Yv, 7, 47) < 0.025) { h = Math.max(h, 5); c = PEBBLE[Math.floor(h3(z, Yv, 8, 49) * 3)]; }
        for (let x = 0; x < Math.min(D, h); x++) g.set(x, y, z, mulc(x < h - 1 ? mulc(c, 0.8) : c, k));
      }
      // roots trailing down the face, one voxel proud of it
      for (const rt of roots) {
        if (Yv > rt.y0 || Yv < rt.y0 - rt.len) continue;
        const z = rt.z + Math.round(Math.sin((rt.y0 - Yv) * 0.21 + rt.z) * 1.4);
        if (z < 0 || z >= NZ) continue;
        g.set(Math.min(D - 1, 6 + ((Yv >> 3) & 1)), y, z, mulc(ROOT[(Yv >> 2) & 1], k));
      }
    }
    return g;
  };
  const out = [];
  // near the landing: plank cribbing (0.4 m) under the sill, then the earth; lit with the camp
  const gl = build(nLit, nDark, false);
  const crib = Math.round(0.4 * UV);
  for (let y = nLit - crib; y < nLit; y++) {
    const row = Math.floor((nLit - y) / 4);
    for (let z = 0; z < NZ; z++) {
      const seam = (nLit - y) % 4 === 0;
      const c = mulc(PLANK[Math.floor(h3(row, z >> 3, 3, 51) * 3)], seam ? 0.6 : 1 - (h3(z, y, 5, 53) < 0.1 ? 0.12 : 0));
      for (let x = 0; x < D; x++) gl.set(x, y, z, x < D - 1 ? mulc(c, 0.7) : c);
      if (!seam && (z === 3 || z === NZ - 4) && (nLit - y) % 4 === 2) gl.set(D - 1, y, z, 0x2a2a2e); // nail heads
    }
  }
  const lit = M16(gl, [D, 0, 0]);
  lit.position.set(SHAFT.x0 / T, yLit / T, z0 / T);
  out.push(lit);
  // below: unlit, fading into the dark
  const dark = G16(build(nDark, 0, true), [D, 0, 0]);
  dark.position.set(SHAFT.x0 / T, yBot / T, z0 / T);
  out.push(dark);
  return out;
}

/** The landing's oak sill across the shaft's mouth: grain, a worn top, nail heads, iron straps (1/64 m). */
function landingSill() {
  const L = Math.round((SHAFT.z1 - SHAFT.z0) * 64), H = 12, D = 3;
  const g = new VoxelGrid(D, H, L);
  const OAK = [0x5a3a22, 0x6a4628, 0x4e321c];
  for (let z = 0; z < L; z++) for (let y = 0; y < H; y++) for (let x = 0; x < D; x++) {
    const grain = Math.floor(h3(z >> 3, y, 1, 61) * 3);
    let c = OAK[grain];
    if (y === H - 1) c = h3(z >> 1, 0, 2, 63) < 0.6 ? 0x7a5634 : 0x6e4c2c; // worn pale by sixty years of paws
    if (y === 0) c = mulc(c, 0.7);
    if (h3(z, y, 3, 65) < 0.04) c = mulc(c, 0.75); // knots and checks
    if ((z < 5 || z >= L - 5) && y > 1 && y < H - 2) c = (z === 2 || z === L - 3) && y === 6 ? 0x5a5a62 : 0x34343a; // iron straps, a bolt
    if (x === D - 1 && y === H - 3 && z % 18 === 9) c = 0x2a2a2e; // nail heads
    g.set(x, y, z, c);
  }
  const m = M32(g, [D, 0, 0]);
  m.position.set(SHAFT.x0 / T, (Y - H / 64) / T, SHAFT.z0 / T);
  return m;
}

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

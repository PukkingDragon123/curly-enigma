// The smithy, built for first person in meters (the mole is 0.86 m tall, eyes at 0.72 m). The
// voxel props in models.js are modelled in old "units" (1/32-unit voxels); each one is placed
// with a uniform scale S, so the finest detail is ~2.2 cm. Returns the room handles, the
// collision boxes, the interaction spots and the camera docks the activities use.
//
//   north wall (z = 0): the brick hearth with its copper hood, the bellows to its right (worked
//   by a chain pull hanging at the hearth's front corner), the workbench and tool rack beyond.
//   The smith's spot is in front of the hearth: the anvil is a quarter turn to the right, the
//   quench barrel to the left, the ingot mold on a stone block at the hearth's left corner.
import * as THREE from 'three';
import { makeRng } from '../core/util.js';
import {
  V, P, makeHearth, makeBellows, makeAnvil, makeBarrel, makeGrindstone, makeToolRack, makeWorkbench,
  makeCoalBin, makeCrate, makeShelf, makeLantern, makeHerbBundle, makeVine, makeBeam, makeMossStrip, makeMold,
  makeSack, makeScrapPile, makeStool, makeLogs, makeStoneBlock, makeBladeBarrel, makeWallDisplay, makeBucket, makeTongs,
  makeBellowsPull, makeChainSpan, makeDoor, makePlinth,
} from './models.js';
import { backWallTexture, sideWallTexture, floorTexture, postcardTexture, rugTexture, WaterTexture } from './textures.js';
import { batchStatic } from '../bookends/batch.js';
import { makeShimmer } from './fx.js';
import { makeGlow } from '../bookends/fx.js';

/** Meters per model unit. */
export const S = 0.7;
export const ROOM = { w: 5.6, d: 4.8, h: 2.5 };
/** The ingot mold and ingots are modelled big: they're placed at this × S. */
export const MS = 0.5;
const U = (m) => m / S; // meters → model units (textures are laid out in units)

function plane(w, h, tex, color = 0xffffff) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, color }));
}

export function buildWorld(scene) {
  const t0 = performance.now();
  const W = { boxes: [], docks: {}, hanging: [] };
  const R = ROOM;
  const root = new THREE.Group();
  scene.add(root);
  W.root = root;
  const put = (obj, x, y, z, ry = 0, s = S) => {
    obj.scale.multiplyScalar(s);
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    root.add(obj);
    return obj;
  };
  const solid = (x0, y0, z0, x1, y1, z1, tag = null) => W.boxes.push([x0, y0, z0, x1, y1, z1, tag]);
  const world = (obj, local) => { obj.updateWorldMatrix(true, false); return obj.localToWorld(local.clone()); };

  // ---------------------------------------------------------------- shell
  const hearthX = 2.0;
  const floor = plane(R.w, R.d, floorTexture(U(R.w), U(R.d), [U(hearthX - 0.95), 0, U(hearthX + 0.95), U(1.75)]));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(R.w / 2, 0, R.d / 2);
  root.add(floor);
  const north = plane(R.w, R.h, backWallTexture(U(R.w), U(R.h), [U(hearthX - 0.68), U(hearthX + 0.68)]));
  north.position.set(R.w / 2, R.h / 2, 0);
  root.add(north);
  const west = plane(R.d, R.h, sideWallTexture(U(R.d), U(R.h), [U(1.7), U(0.75), U(1.15), U(0.68)], 7));
  west.rotation.y = Math.PI / 2;
  west.position.set(0, R.h / 2, R.d / 2);
  root.add(west);
  const east = plane(R.d, R.h, sideWallTexture(U(R.d), U(R.h), null, 13));
  east.rotation.y = -Math.PI / 2;
  east.position.set(R.w, R.h / 2, R.d / 2);
  root.add(east);
  const south = plane(R.w, R.h, sideWallTexture(U(R.w), U(R.h), null, 17));
  south.rotation.y = Math.PI;
  south.position.set(R.w / 2, R.h / 2, R.d);
  root.add(south);
  // ceiling boards, smoked dark over the years
  const ceil = plane(R.w, R.d, floorTexture(U(R.w), U(R.d), null, 23), 0x9a7a6a);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(R.w / 2, R.h, R.d / 2);
  root.add(ceil);
  // floor, ceiling and thick walls for the walker
  solid(-1, -1, -1, R.w + 1, 0, R.d + 1); solid(-1, R.h, -1, R.w + 1, R.h + 1, R.d + 1);
  solid(-1, 0, -1, 0, 3, R.d + 1); solid(R.w, 0, -1, R.w + 1, 3, R.d + 1);
  solid(-1, 0, -1, R.w + 1, 3, 0); solid(-1, 0, R.d, R.w + 1, 3, R.d + 1);

  // stone plinths along the foot of the walls, timber wall plates, corner posts and joists
  const plinth = (len, x, z, ry) => { const p = makePlinth(Math.round(U(len) * 32), 8, 4, Math.round(x * 7 + z * 3)); put(p, x, 0, z, ry); };
  plinth(R.w, 0, 0.0, 0);
  plinth(R.d, 0.0, R.d, Math.PI / 2);
  plinth(R.d, R.w, 0, -Math.PI / 2);
  plinth(R.w, R.w, R.d, Math.PI);
  const beamV = (m) => Math.round(U(m) * 16);
  const plateN = makeBeam(beamV(R.w), 5, 4);
  put(plateN, R.w / 2, R.h - 0.12, 0.1);
  for (const [x, ry] of [[0.1, Math.PI / 2], [R.w - 0.1, Math.PI / 2]]) put(makeBeam(beamV(R.d), 5, 4), x, R.h - 0.12, R.d / 2, ry);
  put(makeBeam(beamV(R.w), 5, 4), R.w / 2, R.h - 0.12, R.d - 0.1);
  for (const [x, z] of [[0.1, 0.1], [R.w - 0.1, 0.1], [0.1, R.d - 0.1], [R.w - 0.1, R.d - 0.1], [3.62, 0.1]]) put(makeBeam(4, beamV(R.h), 4), x, R.h / 2, z);
  for (const x of [0.9, 3.35, 4.75]) put(makeBeam(beamV(R.d), 6, 4, 0x3e2616), x, R.h - 0.18, R.d / 2, Math.PI / 2);
  const moss = makeMossStrip(beamV(R.w), 9);
  put(moss, R.w / 2, R.h - 0.05, 0.1);

  // ---------------------------------------------------------------- hearth, bellows, the pull
  const hearth = makeHearth({ H: 18, tuyereRight: true });
  hearth.group.userData.dynamic = true;
  put(hearth.group, hearthX, 0, 0.415);
  W.hearth = hearth;
  W.firePos = world(hearth.group, hearth.firePos);
  W.coalTop = W.firePos.y;
  solid(hearthX - 0.56, 0, 0, hearthX + 0.56, 0.5, 0.84, 'hearth');
  solid(hearthX - 0.62, 0.9, 0, hearthX + 0.62, 2.6, 0.84, 'hood');
  const bellows = makeBellows({ standH: 6 });
  bellows.group.rotation.y = Math.PI; // nozzle toward -x, into the hearth's right side
  const tuyere = world(hearth.group, hearth.tuyere);
  const nz = bellows.nozzleTip.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).multiplyScalar(S);
  bellows.group.userData.dynamic = true;
  put(bellows.group, tuyere.x - nz.x, 0, tuyere.z - nz.z, Math.PI);
  W.bellows = bellows;
  solid(tuyere.x, 0, tuyere.z - 0.28, tuyere.x + 0.98, 0.45, tuyere.z + 0.28, 'bellows');
  // the pull: a pulley on the hood's front-right corner, a chain down to a T-handle by the fire
  const pull = makeBellowsPull(24);
  pull.group.position.set(21 * P, 41 * P, 19.5 * P);
  pull.group.scale.setScalar(0.5);
  hearth.group.add(pull.group);
  W.pull = pull;
  W.pullSpan = makeChainSpan(7, S);
  root.add(W.pullSpan);
  W.pullGrip = (out = new THREE.Vector3()) => { pull.handle.updateWorldMatrix(true, false); return pull.handle.localToWorld(out.set(0, 1.5 * P, 0)); };
  W.pullTop = (out = new THREE.Vector3()) => { pull.group.updateWorldMatrix(true, false); return pull.group.localToWorld(out.set(0, 0, 0)); };
  W.bellowsEnd = (out = new THREE.Vector3()) => { bellows.grip.updateWorldMatrix(true, false); return bellows.grip.getWorldPosition(out); };
  // spare tongs hanging down the hearth's left side
  for (const [dz, ry] of [[0.28, Math.PI / 2 + 0.1], [0.42, Math.PI / 2 - 0.08]]) {
    const t = makeTongs(10);
    put(t, hearthX - 0.575, 0.58, dz, 0, 0.6 * S);
    t.rotation.set(0, ry, Math.PI / 2);
  }

  // ingot mold on a stone block at the hearth's left corner
  const blockG = makeStoneBlock(6.4);
  put(blockG, hearthX - 0.88, 0, 0.6);
  const mold = makeMold();
  mold.group.userData.dynamic = true;
  put(mold.group, hearthX - 0.88, 13 * P * S, 0.6, 0, MS * S);
  W.mold = mold;
  W.moldTop = world(mold.group, new THREE.Vector3(0, mold.cavityTop, 0));
  solid(hearthX - 1.1, 0, 0.38, hearthX - 0.66, 0.42, 0.82, 'mold');

  // ---------------------------------------------------------------- the anvil: a quarter turn right
  // a mole's anvil: about half a mole long, its face at knuckle height (~0.37 m) on a tall stump
  const AS = 0.5;
  const anvil = makeAnvil({ stumpH: 14 });
  const anvilPos = new THREE.Vector3(2.8, 0, 1.38);
  put(anvil.group, anvilPos.x, 0, anvilPos.z, -Math.PI / 2, AS); // horn toward the hearth (north)
  W.anvil = anvil;
  W.anvilFace = world(anvil.group, new THREE.Vector3(anvil.faceX, anvil.faceY, 0));
  W.anvilAxis = new THREE.Vector3(0, 0, 1); // along the face, horn → heel
  solid(anvilPos.x - 0.2, 0, anvilPos.z - 0.2, anvilPos.x + 0.2, 0.4, anvilPos.z + 0.2, 'anvil');
  solid(anvilPos.x - 0.1, 0.2, anvilPos.z - 0.5, anvilPos.x + 0.1, 0.4, anvilPos.z + 0.32, 'anvil');

  // ---------------------------------------------------------------- quench barrel: to the left
  const water = new WaterTexture(40);
  W.water = water;
  const barrel = makeBarrel(water.texture);
  barrel.group.userData.dynamic = true;
  const barrelPos = new THREE.Vector3(1.28, 0, 1.52);
  put(barrel.group, barrelPos.x, 0, barrelPos.z);
  W.barrel = barrel;
  W.barrelTop = new THREE.Vector3(barrelPos.x, barrel.waterY * S, barrelPos.z);
  solid(barrelPos.x - 0.25, 0, barrelPos.z - 0.25, barrelPos.x + 0.25, 0.46, barrelPos.z + 0.25, 'barrel');
  const bucket = makeBucket();
  put(bucket, 0.9, 0, 1.95, 0.4);

  // ---------------------------------------------------------------- bench, rack, grindstone: the east side
  const bench = makeWorkbench();
  put(bench.group, 4.45, 0, 0.27);
  W.bench = bench;
  W.fulcrumTop = world(bench.group, bench.fulcrumTop);
  W.candleMat = bench.candleMat;
  solid(3.82, 0, 0, 5.08, 0.5, 0.52, 'bench');
  const rack = makeToolRack();
  put(rack, 4.45, 0.78, 0.015);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(14 * V * S, 10 * V * S), new THREE.MeshLambertMaterial({ map: postcardTexture() }));
  card.position.set(5.32, 1.0, 0.012);
  card.rotation.z = 0.06;
  root.add(card);
  const grind = makeGrindstone();
  const grindPos = new THREE.Vector3(3.72, 0, 2.38);
  put(grind.group, grindPos.x, 0, grindPos.z, 0.25);
  W.grind = grind;
  W.grindContact = world(grind.group, grind.contact);
  W.grindAxle = new THREE.Vector3(Math.cos(0.25), 0, -Math.sin(0.25));
  W.grindTan = new THREE.Vector3(Math.sin(0.25), 0, Math.cos(0.25));
  solid(grindPos.x - 0.25, 0, grindPos.z - 0.22, grindPos.x + 0.25, 0.45, grindPos.z + 0.22, 'grind');
  const stool = makeStool();
  put(stool, 4.25, 0, 1.25);
  solid(4.08, 0, 1.08, 4.42, 0.31, 1.42, 'stool');
  const shelf = makeShelf();
  put(shelf.group, R.w - 0.01, 1.2, 1.55, -Math.PI / 2);
  W.shelfGlow = shelf.glowMat;

  // ---------------------------------------------------------------- the west side: coal, Nugget, firewood
  const coal = makeCoalBin();
  put(coal, 0.4, 0, 0.58, 0.1);
  W.coalBin = coal;
  solid(0.1, 0, 0.3, 0.7, 0.3, 0.86, 'coal');
  const crate = makeCrate();
  put(crate, 0.42, 0, 1.38, 0.2);
  W.perch = new THREE.Vector3(0.42, 16 * P * S, 1.38);
  solid(0.18, 0, 1.14, 0.66, 0.36, 1.62, 'crate');
  const logs = makeLogs();
  put(logs, 0.26, 0, 2.35, Math.PI / 2);
  solid(0.08, 0, 2.05, 0.46, 0.3, 2.65, 'logs');
  const sack = makeSack();
  put(sack, 0.32, 0, 3.0, 0.6);
  solid(0.1, 0, 2.8, 0.55, 0.42, 3.2, 'sack');
  const scrap = makeScrapPile();
  put(scrap, 3.55, 0, 3.15, 0.5);

  // ---------------------------------------------------------------- the south side: door, finished work
  const door = makeDoor(33, 54);
  put(door, 1.25, 0, R.d - 0.04, Math.PI);
  W.doorPos = new THREE.Vector3(1.25, 0.55, R.d - 0.1);
  const blades = makeBladeBarrel(4);
  put(blades, 5.05, 0, 4.28, 0.4);
  solid(4.82, 0, 4.05, 5.28, 0.5, 4.5, 'blades');
  W.bladeBarrel = new THREE.Vector3(5.05, 0.45, 4.28);
  const display = makeWallDisplay();
  put(display, 3.4, 1.35, R.d - 0.03, Math.PI);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.8), new THREE.MeshLambertMaterial({ map: rugTexture(U(1.25), U(0.8)), transparent: true, alphaTest: 0.5 }));
  rug.rotation.x = -Math.PI / 2;
  rug.rotation.z = 0.05;
  rug.position.set(1.7, 0.004, 3.55);
  root.add(rug);

  // ---------------------------------------------------------------- hanging things
  const rng = makeRng(41);
  const hang = (obj, phase, amp) => { obj.userData.dynamic = true; W.hanging.push({ obj, phase, amp }); };
  const lantern = makeLantern(10);
  put(lantern.group, 2.75, R.h - 0.18 - (10 + 8) * V * S - 0.02, 2.35);
  W.lanternMat = lantern.glassMat;
  W.lantern = lantern.group;
  W.lanternPos = new THREE.Vector3(2.75, R.h - 0.18 - (10 + 8) * V * S + 0.12, 2.35);
  [3.75, 4.05, 4.35, 4.65, 4.95, 5.25].forEach((x, i) => {
    const h = makeHerbBundle(i, 3 + (i % 3) * 2, 100 + i);
    put(h, x, R.h - 0.2, 0.3);
    hang(h, rng.range(0, 6), 0.03);
  });
  const vineSpots = [[0.6, 0.22, 18], [1.05, 0.22, 10], [3.0, 0.22, 8], [5.35, 0.24, 14], [0.22, 2.4, 16], [0.22, 3.6, 22], [5.38, 2.8, 12], [5.38, 3.9, 18], [2.4, R.d - 0.22, 10]];
  vineSpots.forEach(([x, z, len], i) => {
    const v = makeVine(len, 200 + i);
    put(v, x, R.h - 0.1, z);
    hang(v, rng.range(0, 6), 0.02);
  });
  for (const [x, len, z] of [[0.9, 12, 2.0], [3.35, 15, 3.2], [3.35, 8, 1.2], [4.75, 10, 2.6]]) {
    const v = makeVine(len, 300 + len);
    put(v, x, R.h - 0.22, z);
    hang(v, rng.range(0, 6), 0.025);
  }

  // heat haze over the coals and a soft dithered glow above them
  W.shimmer = makeShimmer(0.8, 0.75);
  W.shimmer.position.copy(W.firePos).add(new THREE.Vector3(0, 0.06, 0.02));
  root.add(W.shimmer);
  W.fireGlow = makeGlow({ color: 0xff8a30, size: 0.9, intensity: 0.3, falloff: 1.5, levels: 6, renderOrder: 14 });
  W.fireGlow.position.copy(W.firePos).add(new THREE.Vector3(0, 0.08, 0.05));
  W.fireGlow.userData.dynamic = true;
  root.add(W.fireGlow);

  // ---------------------------------------------------------------- light
  const hemi = new THREE.HemisphereLight(0xb89080, 0x3a2418, 0.95);
  root.add(hemi);
  const fire = new THREE.PointLight(0xff8a3a, 5, 7.5, 1.35);
  fire.position.copy(W.firePos).add(new THREE.Vector3(0, 0.16, -0.06));
  root.add(fire);
  const lamp = new THREE.PointLight(0xffc070, 1.2, 4.5, 1.5);
  lamp.position.copy(W.lanternPos);
  root.add(lamp);
  const work = new THREE.PointLight(0xff7a2a, 0, 1.6, 1.8); // hot metal lights its surroundings
  root.add(work);
  W.light = fire;
  W.lamp = lamp;
  W.workLight = work;
  W.hemi = hemi;

  // ---------------------------------------------------------------- docks (camera stances for the work)
  // stand: where the walker ends up; eye: the camera (the mole leans in); look: what it looks at
  const dock = (name, stand, eye, look, fov = 64, pts = []) => { W.docks[name] = { name, stand: new THREE.Vector3(...stand), eye: new THREE.Vector3(...eye), look: new THREE.Vector3(...look), fov, pts }; };
  const v3 = (p, x = 0, y = 0, z = 0) => p.clone().add(new THREE.Vector3(x, y, z));
  const fp = W.firePos, af = W.anvilFace, bt = W.barrelTop, mt = W.moldTop, gc = W.grindContact, ft = W.fulcrumTop;
  const pg = W.pullGrip(new THREE.Vector3());
  dock('hearth', [2.24, 0, 1.24], [2.26, 0.74, 1.12], [fp.x + 0.32, fp.y - 0.02, fp.z + 0.02], 62, [v3(fp, -0.22), v3(fp, 0.16), v3(pg, 0, -0.05)]);
  dock('anvil', [2.3, 0, 1.45], [2.34, 0.73, af.z], [af.x, af.y - 0.02, af.z], 60, [v3(af, 0, 0, -0.16), v3(af, 0, 0, 0.16)]);
  dock('barrel', [1.86, 0, 1.5], [1.82, 0.74, bt.z], [bt.x + 0.04, bt.y - 0.04, bt.z], 64, [v3(bt, 0, 0, -0.18), v3(bt, 0, 0, 0.18), v3(bt, 0, 0.3)]);
  dock('mold', [1.82, 0, 1.2], [1.72, 0.74, 1.1], [mt.x + 0.04, mt.y + 0.02, mt.z + 0.02], 60, [v3(mt, -0.06), v3(mt, 0.12, 0.12)]);
  dock('grind', [3.2, 0, 1.85], [3.18, 0.76, 1.8], [gc.x, gc.y - 0.04, gc.z], 60, [v3(gc, -0.15), v3(gc, 0.2)]);
  dock('bench', [4.4, 0, 1.0], [ft.x, 0.74, 0.92], [ft.x, ft.y + 0.02, ft.z], 60, [v3(ft, -0.24), v3(ft, 0.24)]);
  dock('reveal', [2.3, 0, 1.6], [2.3, 0.72, 1.62], [1.8, 0.62, 2.6], 60);
  dock('spawn', [2.25, 0, 2.15], [2.25, 0.72, 2.15], [2.2, 0.45, 0.6], 74);

  // merge the static props into a few big meshes (the moving/clickable groups are flagged dynamic)
  const batches = batchStatic(root);
  W.stats = { ms: performance.now() - t0, batches: batches.length, batched: batches.reduce((n, b) => n + b.userData.batched, 0) };
  return W;
}

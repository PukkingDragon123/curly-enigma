// Builds the blacksmith corner: room shell, props, light and named stations/camera shots.
import * as THREE from 'three';
import { makeRng } from '../core/util.js';
import {
  V, makeHearth, makeBellows, makeAnvil, makePlatform, makeBarrel, makeGrindstone, makeToolRack, makeWorkbench,
  makeCoalBin, makeCrate, makeShelf, makeLantern, makeHerbBundle, makeVine, makeBeam, makeMossStrip, makeMold,
  makeSack, makeScrapPile, makeStool, makeLogs,
} from './models.js';
import { backWallTexture, sideWallTexture, floorTexture, postcardTexture, rugTexture, WaterTexture } from './textures.js';

export const ROOM = { left: -4.1, right: 4.5, back: -2.3, front: 2.9, ceil: 4.0 };

function plane(w, h, tex, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ map: tex, color: opts.color ?? 0xffffff });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return m;
}

export function buildWorld(scene) {
  const W = {};
  const R = ROOM;
  const width = R.right - R.left, depth = R.front - R.back, height = R.ceil;

  // ---------------------------------------------------------------- shell
  const hearthX = -1.25, hearthZ = R.back + 0.565;
  const floor = plane(width, depth, floorTexture(width, depth, [hearthX - R.left - 1.25, 0, hearthX - R.left + 1.35, 1.75]));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((R.left + R.right) / 2, 0, (R.back + R.front) / 2);
  scene.add(floor);
  const back = plane(width, height, backWallTexture(width, height, [hearthX - R.left - 0.95, hearthX - R.left + 0.95]));
  back.position.set((R.left + R.right) / 2, height / 2, R.back);
  scene.add(back);
  const sideD = depth;
  const left = plane(sideD, height, sideWallTexture(sideD, height, [1.55, 0.9, 1.6, 0.95]));
  left.rotation.y = Math.PI / 2;
  left.position.set(R.left, height / 2, (R.back + R.front) / 2);
  scene.add(left);
  const right = plane(sideD, height, sideWallTexture(sideD, height, null, 13));
  right.rotation.y = -Math.PI / 2;
  right.position.set(R.right, height / 2, (R.back + R.front) / 2);
  scene.add(right);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshLambertMaterial({ color: 0x2a1810 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((R.left + R.right) / 2, height, (R.back + R.front) / 2);
  scene.add(ceil);

  // beams: wall plate, posts, ceiling joists
  const plate = makeBeam(Math.round(width / V), 5, 4);
  plate.position.set((R.left + R.right) / 2, 3.25, R.back + 0.13);
  scene.add(plate);
  const plateL = makeBeam(Math.round(sideD / V), 5, 4);
  plateL.rotation.y = Math.PI / 2;
  plateL.position.set(R.left + 0.13, 3.25, (R.back + R.front) / 2);
  scene.add(plateL);
  for (const x of [R.left + 0.14, 0.35, R.right - 0.14]) {
    const post = makeBeam(4, Math.round(3.4 / V), 4);
    post.position.set(x, 1.7, R.back + 0.14);
    scene.add(post);
  }
  for (const x of [-2.2, 1.7]) {
    const joist = makeBeam(Math.round(depth / V), 5, 4, 0x3e2616);
    joist.rotation.y = Math.PI / 2;
    joist.position.set(x, 3.75, (R.back + R.front) / 2);
    scene.add(joist);
  }
  const moss = makeMossStrip(Math.round(width / V), 9);
  moss.position.set((R.left + R.right) / 2, 3.25 + 2.5 * V, R.back + 0.13);
  scene.add(moss);

  // ---------------------------------------------------------------- hearth & bellows
  const hearth = makeHearth();
  hearth.group.position.set(hearthX, 0, hearthZ);
  scene.add(hearth.group);
  W.hearth = hearth;
  W.firePos = hearth.firePos.clone().add(hearth.group.position);
  const bellows = makeBellows();
  const tuyere = hearth.tuyere.clone().add(hearth.group.position);
  bellows.group.position.set(tuyere.x - bellows.nozzleTip.x, tuyere.y - bellows.nozzleTip.y, tuyere.z);
  scene.add(bellows.group);
  W.bellows = bellows;
  // an invisible, generous hit box for clicking the bellows
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.9, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(bellows.group.position.x - 0.42, 0.45, bellows.group.position.z);
  scene.add(hit);
  W.bellowsHit = hit;

  // ingot mold on a stone block between hearth and anvil
  const blockG = makeCrate();
  blockG.position.set(hearthX + 1.25, 0, hearthZ + 0.25);
  blockG.scale.set(1, 0.8, 1);
  scene.add(blockG);
  const mold = makeMold();
  mold.group.position.set(hearthX + 1.25, 8 * V * 0.8, hearthZ + 0.25);
  scene.add(mold.group);
  W.mold = mold;

  // ---------------------------------------------------------------- anvil station
  const anvil = makeAnvil();
  const anvilPos = new THREE.Vector3(0.55, 0, -0.42);
  anvil.group.position.copy(anvilPos);
  scene.add(anvil.group);
  W.anvil = anvil;
  W.anvilFace = new THREE.Vector3(anvilPos.x + anvil.faceX, anvil.faceY, anvilPos.z);
  const platform = makePlatform();
  platform.position.set(anvilPos.x, 0, anvilPos.z - 0.62);
  scene.add(platform);

  // ---------------------------------------------------------------- quench barrel, grindstone, bench
  const water = new WaterTexture(20);
  W.water = water;
  const barrel = makeBarrel(water.texture);
  const barrelPos = new THREE.Vector3(hearthX + 0.5, 0, hearthZ + 1.05);
  barrel.group.position.copy(barrelPos);
  scene.add(barrel.group);
  W.barrel = barrel;
  W.barrelTop = new THREE.Vector3(barrelPos.x, barrel.waterY, barrelPos.z);
  const grind = makeGrindstone();
  grind.group.position.set(3.2, 0, -0.6);
  grind.group.rotation.y = 0.3;
  scene.add(grind.group);
  W.grind = grind;
  W.grindContact = grind.contact.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.3).add(grind.group.position);
  W.grindAxle = new THREE.Vector3(Math.cos(0.3), 0, -Math.sin(0.3));
  W.grindTan = new THREE.Vector3(Math.sin(0.3), 0, Math.cos(0.3)); // the rim's top runs this way, away from the grinder
  const bench = makeWorkbench();
  bench.group.position.set(2.75, 0, R.back + 0.4);
  scene.add(bench.group);
  W.bench = bench;
  W.fulcrumTop = bench.fulcrumTop.clone().add(bench.group.position);
  const rack = makeToolRack();
  rack.position.set(2.7, 1.15, R.back + 0.02);
  scene.add(rack);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(14 * V, 10 * V), new THREE.MeshLambertMaterial({ map: postcardTexture() }));
  card.position.set(3.85, 1.75, R.back + 0.02);
  card.rotation.z = 0.06;
  scene.add(card);

  // ---------------------------------------------------------------- decor
  const coal = makeCoalBin();
  coal.position.set(hearthX - 1.5, 0, hearthZ + 1.35);
  coal.rotation.y = 0.25;
  scene.add(coal);
  W.coalBin = coal;
  const crate = makeCrate();
  crate.position.set(1.75, 0, -0.5);
  crate.rotation.y = 0.3;
  scene.add(crate);
  W.perch = new THREE.Vector3(1.75, 8 * V, -0.5);
  const shelf = makeShelf();
  shelf.group.position.set(1.2, 1.75, R.back + 0.02);
  scene.add(shelf.group);
  W.shelfGlow = shelf.glowMat;
  const lantern = makeLantern(14);
  lantern.group.position.set(0.95, 3.75 - (14 + 8) * V, -0.9);
  scene.add(lantern.group);
  W.lanternMat = lantern.glassMat;
  W.lantern = lantern.group;
  W.candleMat = bench.candleMat;

  // floor clutter: rug, charcoal sack, logs, scrap heap, a stool
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshLambertMaterial({ map: rugTexture(1.8, 1.1), transparent: true, alphaTest: 0.5 }));
  rug.rotation.x = -Math.PI / 2;
  rug.rotation.z = 0.08;
  rug.position.set(-1.05, 0.004, 1.05);
  scene.add(rug);
  const sack = makeSack();
  sack.position.set(-3.55, 0, 0.25);
  sack.rotation.y = 0.6;
  scene.add(sack);
  const logs = makeLogs();
  logs.position.set(-3.75, 0, -0.62);
  logs.rotation.y = Math.PI / 2;
  scene.add(logs);
  const scrap = makeScrapPile();
  scrap.position.set(1.25, 0, 0.75);
  scene.add(scrap);
  const stool = makeStool();
  stool.position.set(3.95, 0, 0.6);
  scene.add(stool);

  const rng = makeRng(41);
  W.hanging = [];
  // dried herbs along a rope under the wall plate
  const herbXs = [-0.2, 0.15, 0.6, 1.15, 1.55, 2.0];
  herbXs.forEach((x, i) => {
    const h = makeHerbBundle(i, 3 + (i % 3) * 2, 100 + i);
    h.position.set(x, 3.2, R.back + 0.32);
    scene.add(h);
    W.hanging.push({ obj: h, phase: rng.range(0, 6), amp: 0.03 });
  });
  // vines from the plate and joists
  const vineSpots = [[-3.6, R.back + 0.3, 18], [-3.1, R.back + 0.28, 10], [-0.05, R.back + 0.3, 8], [2.35, R.back + 0.28, 14], [3.6, R.back + 0.3, 20], [4.0, R.back + 0.32, 9],
    [R.left + 0.3, -1.2, 16], [R.left + 0.3, 0.2, 22], [R.left + 0.28, 1.2, 12]];
  vineSpots.forEach(([x, z, len], i) => {
    const v = makeVine(len, 200 + i);
    v.position.set(x, 3.25, z);
    scene.add(v);
    W.hanging.push({ obj: v, phase: rng.range(0, 6), amp: 0.02 });
  });
  for (const [x, len] of [[-2.2, 12], [-2.2, 7], [1.7, 15], [1.7, 9]]) {
    const v = makeVine(len, 300 + len);
    v.position.set(x, 3.72, -1.0 + len * 0.06);
    scene.add(v);
    W.hanging.push({ obj: v, phase: rng.range(0, 6), amp: 0.025 });
  }

  // ---------------------------------------------------------------- light
  const hemi = new THREE.HemisphereLight(0xc8a0a0, 0x4a2c1c, 2.1);
  scene.add(hemi);
  const fire = new THREE.PointLight(0xff8a3a, 7, 14, 1.2);
  fire.position.copy(W.firePos).add(new THREE.Vector3(0.1, 0.45, 0.45));
  scene.add(fire);
  W.light = fire;
  W.hemi = hemi;

  // ---------------------------------------------------------------- stations & shots
  const bp = bellows.group.position;
  W.stations = {
    bellows: { pos: new THREE.Vector3(bp.x - bellows.length - 0.33, 0, bp.z + 0.02), yaw: Math.PI / 2 },
    anvil: { pos: new THREE.Vector3(anvilPos.x, 3 * V, anvilPos.z - 0.62), yaw: 0 },
    hearth: { pos: new THREE.Vector3(hearthX - 0.2, 0, hearthZ + 1.12), yaw: Math.PI },
    barrel: { pos: new THREE.Vector3(barrelPos.x + 0.56, 0, barrelPos.z - 0.12), yaw: -Math.PI / 2 },
    bench: { pos: new THREE.Vector3(1.55, 0, R.back + 0.75), yaw: Math.PI / 2 },
    grind: { pos: W.grindContact.clone().setY(0).addScaledVector(W.grindTan, -0.58), yaw: Math.atan2(W.grindTan.x, W.grindTan.z) },
    idle: { pos: new THREE.Vector3(anvilPos.x, 3 * V, anvilPos.z - 0.62), yaw: 0.45 },
  };
  // walking obstacles (circles {x,z,r} and boxes {x0,x1,z0,z1}) and detour waypoints
  W.obstacles = [
    { x0: hearthX - 0.8, x1: hearthX + 0.8, z0: R.back - 0.1, z1: hearthZ + 0.62 },
    { x0: bp.x - 0.95, x1: bp.x + 0.1, z0: bp.z - 0.38, z1: bp.z + 0.38 },
    { x: barrelPos.x, z: barrelPos.z, r: 0.38 },
    { x: coal.position.x, z: coal.position.z, r: 0.42 },
    { x: mold.group.position.x, z: mold.group.position.z, r: 0.33 },
    { x: anvilPos.x, z: anvilPos.z, r: 0.4 },
    { x: crate.position.x, z: crate.position.z, r: 0.36 },
    { x0: 1.85, x1: 3.65, z0: R.back - 0.1, z1: R.back + 0.78 },
    { x: grind.group.position.x, z: grind.group.position.z, r: 0.38 },
    { x: -3.55, z: 0.25, r: 0.3 }, { x: -3.75, z: -0.62, r: 0.25 }, { x: 1.25, z: 0.75, r: 0.38 }, { x: 3.95, z: 0.6, r: 0.28 },
  ];
  W.waypoints = [[-3.72, -1.08], [-2.3, -1.06], [-1.6, -0.02], [-0.15, -0.02], [-0.1, -0.95], [1.05, 0.0], [1.15, -1.15], [2.65, -1.15], [0.55, 0.35], [2.7, 0.05], [-1.45, -0.62], [3.9, -0.12], [2.43, -0.62]]
    .map(([x, z]) => new THREE.Vector3(x, 0, z));
  const af = W.anvilFace;
  W.shots = {
    overview: { pos: new THREE.Vector3(3.1, 2.45, 4.0), look: new THREE.Vector3(-0.55, 0.95, -1.0), fov: 45 },
    menu: { pos: new THREE.Vector3(3.0, 2.15, 4.3), look: new THREE.Vector3(-0.3, 1.05, -1.2), fov: 44 },
    hearth: { pos: new THREE.Vector3(hearthX - 0.45, 2.15, hearthZ + 4.6), look: new THREE.Vector3(hearthX - 1.05, 0.72, hearthZ), fov: 42 },
    pour: { pos: new THREE.Vector3(hearthX + 0.35, 1.75, hearthZ + 2.85), look: new THREE.Vector3(hearthX + 1.05, 0.5, hearthZ + 0.3), fov: 40 },
    anvil: { pos: new THREE.Vector3(af.x + 0.05, af.y + 0.05 + 3.3 * Math.sin(0.98), af.z - 0.1 + 3.3 * Math.cos(0.98)), look: new THREE.Vector3(af.x + 0.05, af.y + 0.05, af.z - 0.1), fov: 23 },
    infuse: { pos: new THREE.Vector3(af.x + 0.25, af.y + 0.95, af.z + 1.55), look: new THREE.Vector3(af.x + 0.02, af.y + 0.22, af.z - 0.1), fov: 38 },
    quench: { pos: new THREE.Vector3(0.2, 2.3, 3.6), look: new THREE.Vector3(-0.95, 0.6, -1.15), fov: 46 },
    bench: { pos: new THREE.Vector3(W.fulcrumTop.x - 0.05, W.fulcrumTop.y + 0.95, W.fulcrumTop.z + 1.45), look: new THREE.Vector3(W.fulcrumTop.x - 0.05, W.fulcrumTop.y + 0.05, W.fulcrumTop.z), fov: 40 },
    grind: { pos: new THREE.Vector3(W.grindContact.x - 0.3, 2.0, W.grindContact.z + 3.2), look: new THREE.Vector3(W.grindContact.x - 0.1, 0.62, W.grindContact.z - 0.2), fov: 34 },
    reveal: { pos: new THREE.Vector3(2.4, 2.25, 3.55), look: new THREE.Vector3(-1.05, 0.9, -1.1), fov: 44 },
  };
  return W;
}

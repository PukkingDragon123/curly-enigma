// Builds the blacksmith corner: room shell, props, light and named stations/camera shots.
import * as THREE from 'three';
import { makeRng } from '../core/util.js';
import {
  V, makeHearth, makeBellows, makeAnvil, makePlatform, makeBarrel, makeGrindstone, makeToolRack, makeWorkbench,
  makeCoalBin, makeCrate, makeShelf, makeLantern, makeHerbBundle, makeVine, makeBeam, makeMossStrip, makeMold,
} from './models.js';
import { backWallTexture, sideWallTexture, floorTexture, postcardTexture, WaterTexture } from './textures.js';

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
  barrel.group.position.set(1.8, 0, -0.62);
  scene.add(barrel.group);
  W.barrel = barrel;
  W.barrelTop = new THREE.Vector3(1.8, barrel.waterY, -0.62);
  const grind = makeGrindstone();
  grind.group.position.set(3.35, 0, -0.75);
  grind.group.rotation.y = -0.5;
  scene.add(grind.group);
  W.grind = grind;
  W.grindContact = grind.contact.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.5).add(grind.group.position);
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
  crate.position.set(-0.3, 0, R.back + 0.38);
  scene.add(crate);
  W.perch = new THREE.Vector3(-0.3, 8 * V, R.back + 0.38);
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
  const hemi = new THREE.HemisphereLight(0x9a7a88, 0x3a2216, 1.25);
  scene.add(hemi);
  const fire = new THREE.PointLight(0xff8a3a, 9, 11, 1.25);
  fire.position.copy(W.firePos).add(new THREE.Vector3(0.1, 0.45, 0.45));
  scene.add(fire);
  W.light = fire;
  W.hemi = hemi;

  // ---------------------------------------------------------------- stations & shots
  const bp = bellows.group.position;
  W.stations = {
    bellows: { pos: new THREE.Vector3(bp.x - bellows.length - 0.33, 0, bp.z + 0.02), yaw: Math.PI / 2 },
    anvil: { pos: new THREE.Vector3(anvilPos.x, 3 * V, anvilPos.z - 0.62), yaw: 0 },
    hearth: { pos: new THREE.Vector3(hearthX + 0.15, 0, hearthZ + 1.05), yaw: Math.PI },
    barrel: { pos: new THREE.Vector3(1.25, 0, -1.05), yaw: Math.PI * 0.75 },
    bench: { pos: new THREE.Vector3(2.2, 0, R.back + 1.05), yaw: Math.PI * 0.9 },
    idle: { pos: new THREE.Vector3(anvilPos.x - 0.75, 0, anvilPos.z + 0.35), yaw: 0.35 },
  };
  const af = W.anvilFace;
  W.shots = {
    overview: { pos: new THREE.Vector3(3.1, 2.45, 4.0), look: new THREE.Vector3(-0.55, 0.95, -1.0), fov: 45 },
    menu: { pos: new THREE.Vector3(2.4, 2.25, 3.55), look: new THREE.Vector3(-1.05, 0.9, -1.1), fov: 44 },
    hearth: { pos: new THREE.Vector3(hearthX + 1.25, 1.62, hearthZ + 2.25), look: new THREE.Vector3(hearthX - 0.85, 0.7, hearthZ + 0.05), fov: 42 },
    anvil: { pos: new THREE.Vector3(af.x + 0.08, af.y + 1.72, af.z + 1.42), look: new THREE.Vector3(af.x + 0.08, af.y + 0.3, af.z - 0.22), fov: 40 },
    quench: { pos: new THREE.Vector3(0.9, 1.75, 2.15), look: new THREE.Vector3(0.1, 0.55, -1.0), fov: 46 },
    bench: { pos: new THREE.Vector3(W.fulcrumTop.x - 0.05, W.fulcrumTop.y + 0.95, W.fulcrumTop.z + 1.45), look: new THREE.Vector3(W.fulcrumTop.x - 0.05, W.fulcrumTop.y + 0.05, W.fulcrumTop.z), fov: 40 },
    grind: { pos: new THREE.Vector3(W.grindContact.x - 0.9, 1.45, W.grindContact.z + 1.35), look: new THREE.Vector3(W.grindContact.x, 0.65, W.grindContact.z), fov: 42 },
    reveal: { pos: new THREE.Vector3(2.4, 2.25, 3.55), look: new THREE.Vector3(-1.05, 0.9, -1.1), fov: 44 },
  };
  return W;
}

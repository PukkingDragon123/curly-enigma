// Title screen diorama: a cozy burrow nook. The mole warms his paws by a campfire, Nugget
// dozes beside him, mushrooms glow, roots dangle, ore glints in the walls, and far above a
// crack lets one thin beam of golden sunlight in. That beam is the dream.
import * as THREE from 'three';
import { VoxelGrid, voxMesh, jitf, hash3 } from './vox.js';
import { makeCampfire, makeRock, makeLog, makeMushrooms, makeFlower, makePickaxe, makeRoot, makeNest, makeSack, makeLantern, S16 } from './props.js';
import { Particles, Twinkles, SHAPE, makeGlow, makeSheetSprite, makeBeam, makeLightPool, makeBlobShadow, flameSheet, zzzTexture } from './fx.js';
import { makeMole, makeChicken } from './actors.js';
import { makeNoise2D, makeRng, shade, clamp } from '../core/util.js';

const VS = 1 / 8;
const ORE_PAL = {
  gold: [0xf2c23a, 0xffe08a, 0xb07a14, 0xfff6c8],
  copper: [0xd9773f, 0xf2a35e, 0x9c4a24, 0xffd0a0],
  gem: [0x7fd0ff, 0xbfe6ff, 0x4a86c9, 0xffffff],
  gem2: [0xff7ab0, 0xffc0dc, 0xc04a80, 0xffffff],
};

/** A little deposit of ore nuggets / gem points poking out of a wall (faces +z). */
function makeOreCluster(kind, seed) {
  const rng = makeRng(seed);
  const p = ORE_PAL[kind];
  const g = new VoxelGrid(10, 10, 4);
  const gem = kind.startsWith('gem');
  const n = gem ? 3 : 4 + rng.int(0, 2);
  for (let i = 0; i < n; i++) {
    const x = rng.int(1, 7), y = rng.int(1, 7);
    if (gem) {
      // little crystal points sticking out
      const h = rng.int(2, 3);
      for (let k = 0; k < h; k++) g.set(x, y, k, k === h - 1 ? p[1] : p[k % 2 ? 0 : 2]);
      g.set(x + 1, y, 0, p[2]); g.set(x, y + 1, 1, p[0]); g.set(x, y + 1, 0, p[0]);
    } else {
      const w = rng.int(1, 2), hh = rng.int(1, 2);
      g.box(x, y, 0, w + 1, hh + 1, 2, (xx, yy, zz) => (zz === 1 && yy === y + hh ? p[1] : p[0]));
      g.set(x, y, 0, p[2]);
      g.set(x + w, y + hh, 2, p[3]);
    }
  }
  return voxMesh(g, { pivot: [5, 5, 0], scale: S16, kind: 'basic' });
}
const BOUNDS = { x0: -7.5, x1: 7.5, y0: -0.5, y1: 6.5, z0: -4.5, z1: 3.0 };
const CH = { cx: 0.5, cy: 1.4, cz: 0.4, rx: 6.6, ry: 4.4, rz: 4.0 };
const FRONT_Z = 2.6;
const CRACK = { x: 5.15, z: -2.55 };

export const BURROW = {
  fire: new THREE.Vector3(0.95, 0, 1.15),
  mole: new THREE.Vector3(2.25, 0, 0.35),
  hen: new THREE.Vector3(3.05, 0, 0.95),
  beamTop: new THREE.Vector3(5.1, 5.0, -2.5),
  beamBottom: new THREE.Vector3(3.95, 0.02, -0.75),
};

function caveGrid() {
  const nx = Math.round((BOUNDS.x1 - BOUNDS.x0) / VS);
  const ny = Math.round((BOUNDS.y1 - BOUNDS.y0) / VS);
  const nz = Math.round((BOUNDS.z1 - BOUNDS.z0) / VS);
  const g = new VoxelGrid(nx, ny, nz);
  const n1 = makeNoise2D(11), n2 = makeNoise2D(23), n3 = makeNoise2D(37);
  const dirt = [0x6b4a32, 0x5e4029, 0x74503a, 0x624330];
  const bands = [0x6a4a30, 0x4a3022, 0x7a4a34, 0x3e2a20, 0x5e4430, 0x6e5644, 0x4e3628];
  const wx = (i) => BOUNDS.x0 + (i + 0.5) * VS;
  const wy = (j) => BOUNDS.y0 + (j + 0.5) * VS;
  const wz = (k) => BOUNDS.z0 + (k + 0.5) * VS;
  const beam = BURROW.beamBottom;
  for (let k = 0; k < nz; k++) {
    const z = wz(k);
    for (let i = 0; i < nx; i++) {
      const x = wx(i);
      const clear = Math.hypot(x - 1.75, (z - 0.7) * 1.2) < 2.4 || Math.hypot(x - beam.x, z - beam.z) < 0.7 || Math.hypot(x - 4.7, z + 0.6) < 1.1;
      const bump = !clear && n1(x * 0.7, z * 0.7) > 0.22 ? VS : 0;
      const frontCut = FRONT_Z + n2(x * 0.6, 3.3) * 0.25;
      for (let j = 0; j < ny; j++) {
        const y = wy(j);
        if (z > frontCut + (y < 0 ? 0.3 : 0)) continue;
        const floor = y < bump;
        let inside = false;
        let deep = false;
        if (!floor) {
          const dx = (x - CH.cx) / CH.rx, dy = (y - CH.cy) / CH.ry, dz = (z - CH.cz) / CH.rz;
          const e0 = dx * dx + dy * dy + dz * dz;
          if (e0 < 0.55) inside = true; // the noise can't reach this far: skip it
          else if (e0 > 1.75) deep = true;
          else {
            const ledge = (Math.floor((y + n2(x * 0.3, z * 0.3) * 0.35) / 0.42) % 3 === 0) ? -0.05 : 0;
            const e = e0 + n1(x * 0.45 + z * 0.33, y * 0.5) * 0.22 + n3(y * 1.3 + x * 0.5, z * 1.1 + x * 0.4) * 0.1 + ledge;
            inside = e < 1;
          }
          // the crack: a narrow wobbling slot through the ceiling above the beam
          const cxw = CRACK.x + Math.sin(y * 2.1) * 0.1 + (y - 4.5) * 0.25;
          if (y > 2.6 && Math.abs(x - cxw) < 0.14 && Math.abs(z - CRACK.z - (y - 4) * 0.05) < 0.3) inside = true;
        }
        if (inside) continue;
        // deep rock is never seen: fill it without the colour work
        if (deep && z < frontCut - 0.5) { g.set(i, j, k, 0x3a2a20); continue; }
        // solid: pick a colour
        let c;
        const front = z > frontCut - VS * 1.5;
        if (floor || y < 0.2) {
          c = dirt[(hash3(i, j, k, 1) * dirt.length) | 0];
          const dbx = x - beam.x, dbz = z - beam.z;
          const db = dbx * dbx + dbz * dbz * 1.6;
          if (db < 0.5 && hash3(i, 0, k, 3) < 0.85 - db) c = hash3(i, 1, k, 4) < 0.5 ? 0x5a7a34 : 0x6e8e3e; // moss in the light
          else if (hash3(i, j, k, 5) < 0.04) c = 0x8a8278; // pebbles
          else if (hash3(i, j, k, 6) < 0.05) c = 0x4a3020;
        } else {
          const b = Math.floor((y + n2(x * 0.25, z * 0.25) * 0.5) / 0.55);
          c = bands[((b % bands.length) + bands.length) % bands.length];
          if (hash3(i, j, k, 7) < 0.06) c = 0x8a8278;
          else if (hash3(i, j, k, 8) < 0.05) c = shade(c, 0.78);
          if (y > 3.2 && hash3(i, j, k, 9) < 0.08) c = 0x8a6a48; // root bits near the ceiling
          if (y > 2.2 && n3(x * 0.9 + 4, z * 0.9 + y * 0.6) > 0.18 && hash3(i, j, k, 10) < 0.7) c = hash3(i, j, k, 12) < 0.5 ? 0x4a6a2e : 0x5a7a34; // mossy patches
        }
        if (front) c = shade(c, 0.55);
        g.set(i, j, k, jitf(c, i, j, k, 2, 0.07));
      }
    }
  }
  // ore deposits embedded in the walls (meshed separately at character scale)
  const ores = [];
  const oreSpots = [
    [-4.6, 2.4, 'gold'], [-2.3, 3.4, 'gem'], [-0.8, 1.6, 'copper'], [0.6, 3.7, 'gold'], [1.8, 2.5, 'gem2'],
    [5.6, 2.6, 'gold'], [6.3, 1.2, 'copper'], [-5.6, 0.9, 'gem'], [3.5, 3.9, 'copper'], [-3.4, 1.1, 'gold'],
    [2.6, 1.3, 'gold'], [0.2, 2.6, 'gem'], [4.6, 1.5, 'gem'], [1.4, 4.2, 'gold'],
  ];
  const pal = ORE_PAL;
  const rng = makeRng(77);
  for (const [ox, oy, kind] of oreSpots) {
    // march from the front toward the back until the wall
    const i0 = Math.round((ox - BOUNDS.x0) / VS - 0.5);
    const j0 = Math.round((oy - BOUNDS.y0) / VS - 0.5);
    let kHit = -1;
    for (let k = nz - 1; k >= 0; k--) {
      const z = wz(k);
      if (z > FRONT_Z - 0.6) continue;
      if (g.filled(i0, j0, k)) { kHit = k; break; }
    }
    if (kHit < 0) continue;
    // darken the host rock around the deposit a little
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (g.filled(i0 + di, j0 + dj, kHit)) g.set(i0 + di, j0 + dj, kHit, jitf(0x2e2420, i0 + di, j0 + dj, kHit, 3, 0.1));
    }
    ores.push({ pos: new THREE.Vector3(wx(i0), wy(j0), wz(kHit) + VS * 0.5), kind, color: pal[kind][3], seed: rng.int(1, 1e6) });
  }
  return { g, ores, nx, ny, nz };
}

/** A round woven rug lying flat. */
function makeRug() {
  const r = 13;
  const g = new VoxelGrid(r * 2 + 2, 1, r * 2 + 2);
  for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) {
    const d = Math.hypot(x + 0.5 - g.w / 2, (z + 0.5 - g.d / 2) * 1.25);
    if (d > r) continue;
    const ring = Math.floor(d / 2.2);
    const c = [0xc94a3a, 0xe8b050, 0xa83a30, 0xe0d0a0, 0xb84030, 0xd88a3a][ring % 6];
    g.set(x, 0, z, jitf(c, x, 0, z, 5, 0.06));
  }
  return voxMesh(g, { pivot: [g.w / 2, 0, g.d / 2], scale: S16 });
}

/**
 * Build the burrow into `scene`. Returns an object with update(dt) and the parts the title
 * scene animates.
 */
export function buildBurrow(scene, textures) {
  scene.background = new THREE.Color(0x0e0a10);
  const root = new THREE.Group();
  scene.add(root);

  // ---------------------------------------------------------------- cave shell
  const cave = caveGrid();
  const opt = { scale: VS, pivot: [-BOUNDS.x0 / VS, -BOUNDS.y0 / VS, -BOUNDS.z0 / VS], solid: { nx: true, px: true, ny: true, py: true, nz: true } };
  root.add(voxMesh(cave.g, opt));
  for (const o of cave.ores) {
    const m = makeOreCluster(o.kind, o.seed);
    m.position.copy(o.pos);
    root.add(m);
  }

  // sky glow above the crack
  const skyBit = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  skyBit.rotation.x = Math.PI / 2;
  skyBit.position.set(CRACK.x + 0.2, BOUNDS.y1 - 0.05, CRACK.z + 0.1);
  root.add(skyBit);

  // ---------------------------------------------------------------- lights
  // toon materials keep ~35% of every light even on faces turned away, so keep these modest
  const hemi = new THREE.HemisphereLight(0x9a86c8, 0x4a2a1a, 2.3);
  scene.add(hemi);
  const fireLight = new THREE.PointLight(0xffa050, 6.5, 12, 1.8);
  fireLight.position.copy(BURROW.fire).add(new THREE.Vector3(0, 0.75, 0.1));
  scene.add(fireLight);
  const sunLight = new THREE.PointLight(0xffd890, 4, 3.6, 2);
  sunLight.position.copy(BURROW.beamBottom).add(new THREE.Vector3(0.1, 0.9, 0));
  scene.add(sunLight);

  // ---------------------------------------------------------------- rug, fire, seat
  const rug = makeRug();
  rug.position.set(1.7, 0.005, 0.75);
  root.add(rug);
  const fire = makeCampfire(5);
  fire.position.copy(BURROW.fire);
  root.add(fire);
  const flames = flameSheet(8, 18, 26, 3);
  textures.push(flames.texture);
  const flameA = makeSheetSprite(flames.texture, { cols: flames.cols, size: [0.62, 0.9], anchor: [0.5, 0] });
  flameA.position.copy(BURROW.fire).add(new THREE.Vector3(0, 0.08, 0));
  const flameB = makeSheetSprite(flames.texture, { cols: flames.cols, size: [0.42, 0.62], anchor: [0.5, 0] });
  flameB.position.copy(BURROW.fire).add(new THREE.Vector3(0.12, 0.06, 0.12));
  flameB.userData.sheet.uFlipX.value = 1;
  root.add(flameA, flameB);
  const fireGlow = makeGlow({ color: 0xff8a30, size: 3.4, intensity: 0.55, falloff: 1.5, levels: 5 });
  fireGlow.position.copy(BURROW.fire).add(new THREE.Vector3(0, 0.45, 0));
  root.add(fireGlow);
  const firePool = makeLightPool({ color: 0xff8a3a, rx: 1.9, rz: 1.5, intensity: 0.32, levels: 4 });
  firePool.position.copy(BURROW.fire).add(new THREE.Vector3(0, 0.02, 0));
  root.add(firePool);

  const log = makeLog(22, 3.2);
  log.position.set(BURROW.mole.x, 0, BURROW.mole.z - 0.05);
  log.rotation.y = -0.3;
  root.add(log);

  // ---------------------------------------------------------------- characters
  const mole = makeMole();
  const seatTop = 7 * S16;
  mole.root.position.set(BURROW.mole.x, seatTop - 2 * mole.s + 0.01, BURROW.mole.z);
  mole.face(-0.3, true);
  mole.play('sit');
  root.add(mole.root);
  const moleShadow = makeBlobShadow(0.75, 0.5, 0.5);
  moleShadow.position.set(BURROW.mole.x, 0.012, BURROW.mole.z + 0.1);
  root.add(moleShadow);

  const hen = makeChicken();
  hen.root.position.copy(BURROW.hen);
  hen.face(-1.0, true);
  hen.play('sit');
  root.add(hen.root);
  const henShadow = makeBlobShadow(0.32, 0.26, 0.5);
  henShadow.position.set(BURROW.hen.x, 0.012, BURROW.hen.z);
  root.add(henShadow);

  // ---------------------------------------------------------------- props
  const rock = makeRock(9, { w: 16, h: 11, d: 13, color: 0x7a7068, moss: 0.35 });
  rock.position.set(4.75, 0, -0.75);
  root.add(rock);
  const pick = makePickaxe();
  pick.position.set(4.08, 0.0, -0.32);
  pick.rotation.set(0.05, -0.5, -0.42);
  root.add(pick);
  const nest = makeNest(3);
  nest.position.set(-2.55, 0, -1.55);
  nest.rotation.y = 0.25;
  root.add(nest);
  const sack = makeSack(2);
  sack.position.set(-1.05, 0, -2.45);
  root.add(sack);
  const sack2 = makeSack(4, 0xb89060);
  sack2.position.set(-0.45, 0, -2.75);
  sack2.scale.setScalar(0.8);
  root.add(sack2);
  const flower = makeFlower();
  flower.position.copy(BURROW.beamBottom);
  root.add(flower);
  const lantern = makeLantern({ post: 0 });
  lantern.group.position.set(-4.1, 2.75, -2.2);
  root.add(lantern.group);
  const lanternGlow = makeGlow({ color: 0xffc060, size: 1.6, intensity: 0.5, levels: 4 });
  lanternGlow.position.copy(lantern.group.position).add(lantern.glowPos);
  root.add(lanternGlow);
  // the lantern hangs from a root
  const hangRoot = makeRoot(41, 20);
  hangRoot.position.set(-4.1, 4.15, -2.2);
  root.add(hangRoot);

  // mushrooms + halos
  const glows = [];
  const shroomSpots = [
    { p: [-3.55, 0, 0.2], seed: 4, n: 5, sc: 1 },
    { p: [-5.2, 0.2, -1.0], seed: 8, n: 3, sc: 0.9 },
    { p: [5.55, 0, 0.4], seed: 12, n: 4, sc: 1 },
    { p: [0.1, 0, -2.85], seed: 15, n: 3, sc: 0.8 },
    { p: [-2.1, 0, 2.05], seed: 19, n: 3, sc: 1.1 },
    { p: [6.2, 0.3, -1.6], seed: 22, n: 3, sc: 0.85, cap: [0x7af0a0, 0xc0ffd0, 0x3aa070] },
  ];
  for (const s of shroomSpots) {
    const m = makeMushrooms(s.seed, { n: s.n, scale: s.sc, cap: s.cap });
    m.group.position.set(...s.p);
    m.group.rotation.y = s.seed;
    root.add(m.group);
    for (const gl of m.glows) {
      const p = gl.pos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s.seed).add(m.group.position);
      const halo = makeGlow({ color: s.cap ? 0x5ae08a : 0x3a98ff, size: gl.size * 2.1, intensity: 0.3, falloff: 1.8, levels: 4 });
      halo.position.copy(p);
      root.add(halo);
      glows.push({ mesh: halo, base: 0.3, ph: Math.random() * 6 });
    }
  }

  // hanging roots
  const roots = [];
  const rootSpots = [[-3.2, -1.2, 26], [-1.6, -2.6, 34], [-0.2, -0.6, 22], [1.4, -2.2, 30], [2.6, -2.9, 38], [4.9, -1.6, 24], [5.8, -2.6, 30], [-5.0, -2.4, 24], [0.9, 0.6, 18]];
  rootSpots.forEach(([x, z, len], i) => {
    // find the ceiling height above (x, z) from the chamber ellipsoid
    const dx = (x - CH.cx) / CH.rx, dz = (z - CH.cz) / CH.rz;
    const rem = Math.max(0.05, 1 - dx * dx - dz * dz);
    const top = CH.cy + Math.sqrt(rem) * CH.ry - 0.05;
    const r = makeRoot(100 + i * 7, len);
    const pivot = new THREE.Group();
    pivot.position.set(x, top, z);
    pivot.add(r);
    root.add(pivot);
    roots.push({ pivot, ph: i * 1.7, amp: 0.025 + (i % 3) * 0.01 });
  });

  // ---------------------------------------------------------------- the sunbeam
  const camGuess = new THREE.Vector3(1.0, 2.6, 11);
  const beamFrom = BURROW.beamTop.clone().add(new THREE.Vector3(0.45, 1.6, -0.1));
  const beam = makeBeam(beamFrom, BURROW.beamBottom, 0.85, camGuess, { color: 0xffc860, intensity: 0.75, levels: 8 });
  root.add(beam);
  const beamCore = makeBeam(beamFrom, BURROW.beamBottom, 0.26, camGuess, { color: 0xfff0c0, intensity: 0.55, levels: 6 });
  root.add(beamCore);
  const pool = makeLightPool({ color: 0xffd27a, rx: 0.7, rz: 0.42, intensity: 0.85, levels: 5 });
  pool.position.copy(BURROW.beamBottom).add(new THREE.Vector3(0, 0.01, 0));
  root.add(pool);
  const crackGlow = makeGlow({ color: 0xffe0a0, size: 1.2, intensity: 0.7, levels: 4 });
  crackGlow.position.copy(BURROW.beamTop).add(new THREE.Vector3(0.05, 0.1, 0));
  root.add(crackGlow);

  // dust motes drifting in the beam
  const motes = new Particles({ max: 90, additive: true });
  root.add(motes.points);
  const beamAxis = new THREE.Vector3().subVectors(BURROW.beamTop, BURROW.beamBottom);
  const moteSpawn = () => {
    const t = Math.random();
    const p = BURROW.beamBottom.clone().addScaledVector(beamAxis, t);
    p.x += (Math.random() - 0.5) * 0.4;
    p.z += (Math.random() - 0.5) * 0.3;
    motes.spawn({ pos: [p.x, p.y, p.z], vel: [(Math.random() - 0.5) * 0.06, -0.03 - Math.random() * 0.05, (Math.random() - 0.5) * 0.04], life: 4 + Math.random() * 5,
      color: Math.random() < 0.3 ? 0xffffff : 0xffe6a0, size: Math.random() < 0.25 ? 2 : 1, alpha: 0.9, fadeIn: 1.2, flicker: 0.5, wobble: 0.05 });
  };
  for (let i = 0; i < 60; i++) { moteSpawn(); motes.life[(motes.next - 1 + motes.max) % motes.max] = Math.random() * 4; }

  // embers rising from the fire
  const embers = new Particles({ max: 120, additive: true });
  root.add(embers.points);

  // a few fireflies wandering the nook
  const flies = new Particles({ max: 16, additive: true });
  root.add(flies.points);
  const flyHome = [];
  const frng = makeRng(5);
  for (let i = 0; i < 14; i++) {
    const p = [frng.range(-5.5, 6), frng.range(0.6, 3.6), frng.range(-3, 1.8)];
    flyHome.push({ p, ph: frng.range(0, 9), sp: frng.range(0.25, 0.55) });
    flies.spawn({ pos: p.slice(), life: 1e9, color: frng.chance(0.5) ? 0xd8ff7a : 0xfff0a0, size: frng.chance(0.3) ? 2 : 1, fadeIn: 0 });
  }

  // ore sparkles
  const twinkles = new Twinkles(cave.ores.map((o, i) => ({ pos: [o.pos.x + 0.06, o.pos.y + 0.08, o.pos.z + 0.2], color: o.color, size: 1, big: 5, bigShape: SHAPE.plus, speed: 0.7 + (i % 4) * 0.3, phase: i * 2.1, sharp: 12, base: 0 })));
  root.add(twinkles.points);

  // zzz over Nugget
  const zTex = zzzTexture();
  textures.push(zTex);
  const zs = [0, 1, 2].map((i) => {
    const s = makeSheetSprite(zTex, { cols: 1, size: [0.16, 0.16], anchor: [0.5, 0.5] });
    root.add(s);
    return { s, t: i * 1.1 };
  });

  // ---------------------------------------------------------------- update
  let t = 0;
  let emberAcc = 0;
  let moteAcc = 0;
  let rubWait = 4;
  let rubT = 0;
  const tmp = new THREE.Vector3();
  const update = (dt) => {
    t += dt;
    // fire flicker
    const fl = 0.82 + 0.1 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 23.7 + 1) + 0.05 * Math.sin(t * 5.3);
    fireLight.intensity = 6.5 * fl;
    fireLight.position.x = BURROW.fire.x + Math.sin(t * 7.3) * 0.04;
    fireGlow.userData.glow.uIntensity.value = 0.5 * fl;
    firePool.userData.glow.uIntensity.value = 0.3 * fl;
    flameA.userData.sheet.uFrame.value = Math.floor(t * 11) % 8;
    flameB.userData.sheet.uFrame.value = Math.floor(t * 9 + 3) % 8;
    flameA.scale.set(1 + Math.sin(t * 9) * 0.05, 1 + Math.sin(t * 7.1) * 0.08, 1);

    emberAcc += dt * 9;
    while (emberAcc > 1) {
      emberAcc -= 1;
      embers.spawn({
        pos: [BURROW.fire.x + (Math.random() - 0.5) * 0.35, 0.25 + Math.random() * 0.2, BURROW.fire.z + (Math.random() - 0.5) * 0.3],
        vel: [(Math.random() - 0.5) * 0.25, 0.7 + Math.random() * 0.8, (Math.random() - 0.5) * 0.2],
        life: 1.2 + Math.random() * 1.8, color: Math.random() < 0.4 ? 0xffe080 : 0xffa040, color2: 0xd9401a,
        size: Math.random() < 0.2 ? 2 : 1, gravity: -0.05, drag: 0.4, wobble: 0.35, flicker: 0.3,
      });
    }
    embers.update(dt);
    for (let i = 0; i < flyHome.length; i++) {
      const f = flyHome[i];
      const a = t * f.sp + f.ph;
      flies.pos[i * 3] = f.p[0] + Math.sin(a) * 0.6 + Math.sin(a * 2.3) * 0.15;
      flies.pos[i * 3 + 1] = f.p[1] + Math.sin(a * 1.7) * 0.25;
      flies.pos[i * 3 + 2] = f.p[2] + Math.cos(a * 0.8) * 0.4;
      flies.col[i * 4 + 3] = clamp(Math.sin(t * 1.3 + f.ph * 3) * 1.6 - 0.4, 0, 1) * 0.9;
    }
    flies.geo.attributes.position.needsUpdate = true;
    flies.geo.attributes.aColor.needsUpdate = true;
    moteAcc += dt * 9;
    while (moteAcc > 1) { moteAcc -= 1; moteSpawn(); }
    motes.update(dt);
    twinkles.update(dt);

    beam.userData.beam.uTime.value = t;
    beamCore.userData.beam.uTime.value = t * 1.3;
    const breathe = 0.9 + 0.1 * Math.sin(t * 0.7);
    beam.userData.beam.uIntensity.value = 0.75 * breathe;
    pool.userData.glow.uIntensity.value = 0.85 * breathe;
    for (const g of glows) g.mesh.userData.glow.uIntensity.value = g.base * (0.85 + 0.15 * Math.sin(t * 1.3 + g.ph));
    for (const r of roots) {
      r.pivot.rotation.z = Math.sin(t * 0.6 + r.ph) * r.amp;
      r.pivot.rotation.x = Math.sin(t * 0.47 + r.ph * 1.3) * r.amp * 0.7;
    }

    // the mole warms his paws (rubbing them now and then) and glances up at the light
    mole.update(dt);
    rubWait -= dt;
    if (rubWait < 0) { rubWait = 6 + Math.random() * 6; rubT = 1.4; }
    let rub = 0;
    if (rubT > 0) { rubT -= dt; rub = Math.sin(t * 19) * 0.16 * Math.min(1, rubT * 3); }
    const look = clamp(Math.sin(t * 0.21) * 2.2 - 1.2, 0, 1); // occasionally looks up at the beam
    mole.armL.rotation.x = -0.95 + Math.sin(t * 1.1) * 0.06;
    mole.armR.rotation.x = -0.95 + Math.sin(t * 1.1 + 0.6) * 0.06;
    mole.armL.rotation.z = 0.25 + rub;
    mole.armR.rotation.z = -0.25 + rub;
    mole.neck.rotation.x = -0.05 + Math.sin(t * 0.8) * 0.03 - look * 0.55;
    mole.neck.rotation.y = look * -0.5;
    mole.hip.position.y += Math.sin(t * 2) * mole.s * 0.15;

    // Nugget dozes: eyes shut, head nodding slowly
    hen.update(dt);
    const nod = Math.sin(t * 0.9);
    hen.head.rotation.x = 0.25 + nod * 0.12;
    const peek = Math.sin(t * 0.37) > 0.97;
    for (const e of hen.eyes) e.scale.y = peek ? 1 : 0.2;
    for (const z of zs) {
      z.t += dt;
      const k = (z.t % 3.3) / 3.3;
      hen.head.getWorldPosition(tmp);
      z.s.position.set(tmp.x + 0.15 + k * 0.35 + Math.sin(k * 6) * 0.05, tmp.y + 0.25 + k * 0.7, tmp.z);
      z.s.userData.sheet.uOpacity.value = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
      const sc = 0.7 + k * 0.6;
      z.s.scale.set(sc, sc, 1);
    }
  };

  return { root, update, mole, hen, fireLight };
}

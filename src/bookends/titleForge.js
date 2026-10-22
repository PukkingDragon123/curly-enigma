// Title screen diorama: a blacksmith's forge in a cave. A tough mole works a glowing blade at the
// anvil (heavy blows, sparks bouncing off the anvil and the flagstones, flashes on the rock), a
// stone forge roars under its brick hood while the bellows pump, smoke curls up the chimney and
// embers drift, steam bursts from the quench tub. Tools hang on the wall, finished blades stand
// in a rack, crystals and mushrooms glow cold blue in the corners against all that orange.
//
//   const dio = await buildForgeCave(scene, textures, { audio });
//   dio.update(dt, camera)   // every frame
//   dio.shots                // camera framings: { menu: {wide, tall}, stones: {wide, tall} }
//   dio.smith                // the Smith (titleSmith.js)
import * as THREE from 'three';
import { VoxelGrid, voxMesh, hash3 } from './vox.js';
import { cyl, pj, pp, S32 } from './props.js';
import { makeMushrooms, makeLantern, makeRock, makeSack } from './props.js';
import { Particles, Twinkles, SHAPE, makeGlow, makeSheetSprite, makeLightPool, makeBlobShadow, flameSheet } from './fx.js';
import { batchStatic } from './batch.js';
import { makeAnvil, makeForge, makeBellows, makeQuenchTub, makeToolBoard, makeWeaponRack, makeCoalPile, makeIngots, makeGrindstone, makeHoist, makeTimberFrame, IRON } from './titleProps.js';
import { makeSmith } from './titleSmith.js';
import { makeNoise2D, makeRng, shade, mixHex, clamp } from '../core/util.js';

const VS = 1 / 16;
const BOUNDS = { x0: -6.5, x1: 8.0, y0: -0.5, y1: 5.0, z0: -4.0, z1: 3.0 };
const CH = { cx: 0.7, cy: 0.9, cz: 0.1, rx: 6.6, ry: 3.9, rz: 3.0 };
const FRONT_Z = 2.35;

/** Layout (world units; the floor is y = 0, the camera looks down -z). */
export const FORGE = {
  smith: new THREE.Vector3(0, 0, -0.1),
  smithYaw: 0.6, // three-quarters toward the camera, the anvil in front of him
  forge: new THREE.Vector3(2.0, 0, -1.6),
  forgeYaw: -0.55,
  tub: new THREE.Vector3(1.38, 0, 0.62),
  rack: new THREE.Vector3(-2.15, 0, -1.35),
  coal: new THREE.Vector3(3.3, 0, -0.3),
  grind: new THREE.Vector3(-2.7, 0, 0.45),
  ingots: new THREE.Vector3(0.95, 0, -1.15),
};

const STRATA = [
  [0x4e3a30, 0x48352c, 0x564036], [0x3e2c26, 0x382822, 0x46322a], [0x5a3a2e, 0x52352a, 0x624034],
  [0x4c4440, 0x46403c, 0x544a46], [0x46342a, 0x403026, 0x4e3a2e], [0x5a4a3e, 0x52443a, 0x625044],
];
const DIRT = [0x4a382c, 0x423226, 0x4e3c2e, 0x46352a];
const FLAG = [0x6a625c, 0x746a62, 0x605852, 0x7a7068];
const DEEP_ROCK = 0x241a16;
let FILLED = 0;
function filledBit() {
  if (!FILLED) { const t = new VoxelGrid(1, 1, 1); t.set(0, 0, 0, 0); FILLED = t.data[0]; }
  return FILLED;
}

// ------------------------------------------------------------------ cave shell
function caveGrid(flue) {
  const nx = Math.round((BOUNDS.x1 - BOUNDS.x0) / VS);
  const ny = Math.round((BOUNDS.y1 - BOUNDS.y0) / VS);
  const nz = Math.round((BOUNDS.z1 - BOUNDS.z0) / VS);
  const g = new VoxelGrid(nx, ny, nz);
  const data = g.data;
  const FB = filledBit();
  const n1 = makeNoise2D(11), n2 = makeNoise2D(23), n3 = makeNoise2D(37), n4 = makeNoise2D(53);
  const wx = (i) => BOUNDS.x0 + (i + 0.5) * VS;
  const wy = (j) => BOUNDS.y0 + (j + 0.5) * VS;
  const wz = (k) => BOUNDS.z0 + (k + 0.5) * VS;
  const bxn = (nx + 1) >> 1, byn = (ny + 1) >> 1, bzn = (nz + 1) >> 1;
  const bnoise = new Float32Array(bxn * byn * bzn).fill(NaN);
  const solid = new Uint8Array(nx * ny * nz);
  const frontCuts = new Float32Array(nx);
  for (let i = 0; i < nx; i++) frontCuts[i] = FRONT_Z + n2(wx(i) * 0.6, 3.3) * 0.22;
  for (let k = 0; k < nz; k++) {
    const z = wz(k);
    for (let i = 0; i < nx; i++) {
      const x = wx(i);
      // the floor: flat where the work happens, bumpy toward the walls
      const work = Math.hypot((x - 0.7) / 3.2, (z + 0.3) / 2.2) < 1;
      const bump = !work && n1(x * 0.7, z * 0.7) > 0.2 ? VS : 0;
      const frontCut = frontCuts[i];
      const inFlue = Math.hypot(x - flue.x, z - flue.z) < 0.42;
      for (let j = 0; j < ny; j++) {
        const y = wy(j);
        if (z > frontCut + (y < 0 ? 0.25 : 0)) continue;
        let inside = false, core = false;
        if (!(y < bump)) {
          const dx = (x - CH.cx) / CH.rx, dy = (y - CH.cy) / CH.ry, dz = (z - CH.cz) / CH.rz;
          const e0 = dx * dx + dy * dy + dz * dz;
          if (e0 < 0.55) inside = true;
          else if (e0 > 1.95) core = true;
          else if (e0 <= 1.75) {
            const bi = (i >> 1) + bxn * ((j >> 1) + byn * (k >> 1));
            let nn = bnoise[bi];
            if (nn !== nn) {
              const ledge = (Math.floor((y + n2(x * 0.3, z * 0.3) * 0.35) / 0.45) % 3 === 0) ? -0.05 : 0;
              nn = n1(x * 0.45 + z * 0.33, y * 0.5) * 0.24 + n3(y * 1.3 + x * 0.5, z * 1.1 + x * 0.4) * 0.1 + ledge;
              bnoise[bi] = nn;
            }
            inside = e0 + nn < 1;
          }
          // the chimney shaft through the roof
          if (inFlue && y > 2.4) { core = false; inside = true; }
        }
        if (!inside) solid[i + nx * (j + ny * k)] = core && z < frontCut - 0.25 ? 2 : 1;
      }
    }
  }
  const NXY = nx * ny;
  const fl = (x, z) => { // flagstone cells: jittered grid, id + distance to the joint
    const s = 0.42;
    const gx = Math.floor(x / s + (Math.floor(z / s) % 2) * 0.5), gz = Math.floor(z / s);
    const fx = x / s + (Math.floor(z / s) % 2) * 0.5 - gx, fz = z / s - gz;
    return { id: gx * 31 + gz * 17, edge: Math.min(fx, 1 - fx, fz, 1 - fz) * s };
  };
  for (let k = 0; k < nz; k++) {
    const z = wz(k);
    for (let j = 0; j < ny; j++) {
      const y = wy(j);
      for (let i = 0; i < nx; i++) {
        const id = i + nx * (j + ny * k);
        const sv = solid[id];
        if (!sv) continue;
        if (sv === 2) { data[id] = DEEP_ROCK | FB; continue; }
        const exposed = (i > 0 && !solid[id - 1]) || (i < nx - 1 && !solid[id + 1]) || (j > 0 && !solid[id - nx]) || (j < ny - 1 && !solid[id + nx])
          || (k > 0 && !solid[id - NXY]) || (k === nz - 1 || !solid[id + NXY]);
        if (!exposed) { data[id] = DEEP_ROCK | FB; continue; }
        const x = wx(i);
        let c;
        const front = z > frontCuts[i] - VS * 1.5;
        const dForge = Math.hypot(x - FORGE.forge.x, z - FORGE.forge.z);
        if (y < 0.2) {
          const f = fl(x + 0.13, z + 0.07);
          const work = Math.hypot((x - 0.75) / 2.7, (z + 0.35) / 1.85);
          if (work < 1 && f.edge > 0.025) {
            c = pj(FLAG[(f.id >>> 0) % FLAG.length], i, j, k, f.id & 255, 0.05, 2);
            if (f.edge < 0.05) c = shade(c, 0.86);
            if (hash3(i >> 1, 0, k >> 1, 3) < 0.05) c = shade(c, 0.8);
          } else if (work < 1) c = 0x2e2420; // joints
          else {
            c = pp(DIRT, i, j, k, 1, 2);
            if (hash3(i >> 1, j, k >> 1, 5) < 0.04) c = 0x6a625a;
          }
          if (dForge < 1.9) c = mixHex(c, 0x1e1614, clamp((1.9 - dForge) / 1.9, 0, 0.55)); // soot
          // scale and iron filings around the anvil, glinting
          if (Math.hypot(x - 0.6, z + 0.05) < 0.9 && hash3(i, j, k, 9) < 0.06) c = hash3(i, j, k, 10) < 0.5 ? 0x8a8896 : 0x3a3a44;
        } else {
          const warp = n2(x * 0.25, z * 0.25) * 0.5 + n4(x * 0.9, z * 0.9) * 0.08;
          const by = (y + warp) / 0.48;
          const b = Math.floor(by);
          const bi = ((b % STRATA.length) + STRATA.length) % STRATA.length;
          c = pp(STRATA[bi], i, j, k, bi + 3, 2);
          const fr = by - b;
          if (fr < 0.07) c = shade(c, 0.72);
          else if (fr > 0.93) c = shade(c, 1.1);
          const h = hash3(i >> 1, j >> 1, k >> 1, 7);
          if (h < 0.03) c = 0x7a7068;
          else if (h > 0.975) c = shade(c, 0.78);
          if (Math.abs(n3(x * 1.7 + z * 0.6, y * 1.4)) < 0.018) c = shade(c, 0.6);
          // soot climbing the rock above the forge, cold moss far from it
          const soot = clamp((2.6 - Math.hypot(x - FORGE.forge.x, (z - FORGE.forge.z) * 0.8)) / 2.6, 0, 1) * clamp((y - 0.6) / 2.2, 0, 1);
          if (soot > 0) c = mixHex(c, 0x161012, soot * 0.75);
          if (dForge > 4 && y > 1.6 && n3(x * 0.9 + 4, z * 0.9 + y * 0.6) > 0.2 && hash3(i >> 1, j >> 1, k >> 1, 10) < 0.6) c = pp([0x3a5a3a, 0x48683e, 0x2e4a30], i, j, k, 12, 1);
        }
        if (front) c = shade(c, 0.5);
        data[id] = (c & 0xffffff) | FB;
      }
    }
  }
  const at = (x, y, z) => g.filled(Math.round((x - BOUNDS.x0) / VS - 0.5), Math.round((y - BOUNDS.y0) / VS - 0.5), Math.round((z - BOUNDS.z0) / VS - 0.5));
  /** First rock surface walking from the front toward -z at (x, y). */
  const wallZ = (x, y) => { for (let z = FRONT_Z - 0.6; z > BOUNDS.z0; z -= VS) if (at(x, y, z)) return z + VS; return BOUNDS.z0; };
  /** The ceiling above (x, z). */
  const ceilY = (x, z) => { for (let y = 1.5; y < BOUNDS.y1; y += VS) if (at(x, y, z)) return y; return BOUNDS.y1; };
  return { g, wallZ, ceilY, at };
}

// ------------------------------------------------------------------ small pieces
const CRYS = { blue: [0x6ad0ff, 0xbfeaff, 0x3a86c9, 0xffffff], teal: [0x5ae8d0, 0xb8fff0, 0x2a9a8a, 0xffffff], pink: [0xff7ab0, 0xffc0dc, 0xc04a80, 0xffffff] };
function makeCrystals(seed, pal, n = 6, len = 26) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(52, 56, 44);
  const base = new VoxelGrid(52, 56, 44);
  base.ellipsoid(26, 12, 3, 12, 7, 4.5, (x, y, z) => pp([0x342a30, 0x3e3438, 0x2a2228], x, y, z, seed, 2));
  for (let i = 0; i < n; i++) {
    const big = i < 2;
    const a = big ? rng.range(-0.35, 0.35) : rng.range(-1.1, 1.1);
    const L = big ? rng.int(Math.round(len * 0.8), len) : rng.int(Math.round(len * 0.35), Math.round(len * 0.7));
    const r = big ? rng.range(2.6, 3.4) : rng.range(1.5, 2.4);
    const from = [26 + rng.range(-8, 8), 11 + rng.range(-3, 4), 3];
    const up = big ? rng.range(0.45, 0.8) : rng.range(0.15, 0.75);
    const dir = [Math.sin(a) * 0.6, up, 0.8];
    const dl = Math.hypot(...dir);
    const to = [from[0] + dir[0] / dl * L, from[1] + dir[1] / dl * L, from[2] + dir[2] / dl * L];
    cyl(g, from, to, r, (t, ang, d) => {
      const tip = 0.72;
      if (t > tip && d > (1 - t) / (1 - tip)) return -1;
      if (t > 0.9) return pal[3];
      const facet = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 6 + 0.5) % 6;
      if (d < 0.35 && t > 0.15) return mixHex(pal[1], 0xffffff, 0.35);
      return facet === 0 || facet === 1 ? pal[1] : facet === 2 || facet === 5 ? pal[0] : pal[2];
    });
  }
  const grp = new THREE.Group();
  grp.add(voxMesh(base, { pivot: [26, 12, 0], scale: S32 }));
  grp.add(voxMesh(g, { pivot: [26, 12, 0], scale: S32, kind: 'basic' }));
  return grp;
}

/** Spark streaks: 1px lines from each spark's position back along its velocity (motion blur). */
class Sparks {
  constructor(max = 360) {
    this.max = max;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.ml = new Float32Array(max); this.hot = new Float32Array(max);
    this.next = 0;
    this.pos = new Float32Array(max * 6); this.col = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
    this.boxes = []; // [{x0,x1,z0,z1,y}] surfaces they bounce on (besides the floor)
  }
  spawn(pos, vel, life, hot = 1) {
    const i = this.next; this.next = (i + 1) % this.max;
    this.p.set(pos, i * 3); this.v.set(vel, i * 3);
    this.life[i] = 0; this.ml[i] = life; this.hot[i] = hot;
  }
  update(dt) {
    const { p, v, pos, col } = this;
    for (let i = 0; i < this.max; i++) {
      const i3 = i * 3, i6 = i * 6;
      if (this.ml[i] <= 0 || this.life[i] >= this.ml[i]) { this.ml[i] = 0; col.fill(0, i6, i6 + 6); continue; }
      this.life[i] += dt;
      const k = this.life[i] / this.ml[i];
      v[i3 + 1] -= 6.5 * dt;
      const dr = Math.exp(-0.6 * dt);
      v[i3] *= dr; v[i3 + 2] *= dr;
      const ox = p[i3], oy = p[i3 + 1], oz = p[i3 + 2];
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      let floor = 0.005;
      for (const b of this.boxes) if (p[i3] > b.x0 && p[i3] < b.x1 && p[i3 + 2] > b.z0 && p[i3 + 2] < b.z1 && oy >= b.y - 0.01) floor = Math.max(floor, b.y);
      if (p[i3 + 1] < floor && v[i3 + 1] < 0) {
        p[i3 + 1] = floor;
        v[i3 + 1] *= -0.38; v[i3] *= 0.62; v[i3 + 2] *= 0.62;
        if (Math.random() < 0.3) this.ml[i] = Math.min(this.ml[i], this.life[i] + 0.15);
      }
      // the streak: from now back along the velocity
      const sl = 0.03;
      pos[i6] = p[i3]; pos[i6 + 1] = p[i3 + 1]; pos[i6 + 2] = p[i3 + 2];
      pos[i6 + 3] = p[i3] - v[i3] * sl; pos[i6 + 4] = p[i3 + 1] - v[i3 + 1] * sl; pos[i6 + 5] = p[i3 + 2] - v[i3 + 2] * sl;
      void ox; void oz;
      // white-yellow → orange → deep red, fading out
      const h = this.hot[i] * (1 - k);
      const r = Math.min(1, 0.7 + h * 0.9), gg = Math.min(1, Math.max(0, h * 1.35 + 0.05)), bb = Math.max(0, h * 1.3 - 0.45);
      const a = (1 - k * k);
      col[i6] = r * a; col[i6 + 1] = gg * a; col[i6 + 2] = bb * a;
      col[i6 + 3] = r * a * 0.45; col[i6 + 4] = gg * a * 0.3; col[i6 + 5] = bb * a * 0.2;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ build
export async function buildForgeCave(scene, textures, { audio = null, standin = false } = {}) {
  const t0 = performance.now();
  scene.background = new THREE.Color(0x0a0608);
  const root = new THREE.Group();
  scene.add(root);
  const rng = makeRng(17);

  // ---- the smith first: the anvil is built to meet his hammer
  const smith = await makeSmith({ height: 1.42, standin });
  root.add(smith.root);
  const yaw = FORGE.smithYaw;
  const imp = smith.impactOffset(yaw); // hammer face at impact, smith at the origin
  const home = FORGE.smith.clone();
  const impact = new THREE.Vector3(home.x + imp.x, imp.y, home.z + imp.z);

  // ---- forge (rotated to face the smith and the camera)
  const forgeCenter = FORGE.forge;
  const fq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), FORGE.forgeYaw);
  const flueLocal = new THREE.Vector3(0, 0, -0.34).applyQuaternion(fq).add(forgeCenter);
  const cave = caveGrid({ x: flueLocal.x, z: flueLocal.z });
  const tGrid = performance.now();
  const shell = voxMesh(cave.g, { scale: VS, pivot: [-BOUNDS.x0 / VS, -BOUNDS.y0 / VS, -BOUNDS.z0 / VS], solid: { nx: true, px: true, ny: true, py: true, nz: true }, interior: DEEP_ROCK });
  shell.userData.noBatch = true;
  shell.layers.disable(1);
  root.add(shell);
  const tShell = performance.now();

  const chimney = Math.max(1.2, cave.ceilY(flueLocal.x, flueLocal.z) - 2.0 + 0.4);
  const forge = makeForge({ chimney });
  forge.group.position.copy(forgeCenter);
  forge.group.quaternion.copy(fq);
  root.add(forge.group);
  const toW = (o, v) => v.clone().applyQuaternion(o.quaternion).add(o.position);
  const fire = toW(forge.group, forge.fire);
  const fireMouth = toW(forge.group, forge.mouth);
  const hood = toW(forge.group, forge.hood);
  const coalMat = forge.coals.material;

  // ---- anvil, under the hammer
  const anvilTop = Math.max(0.35, impact.y - 0.07);
  const anvil = makeAnvil({ top: anvilTop });
  const af = anvil.userData.face;
  anvil.position.set(impact.x - af.x + 0.04, 0, impact.z - af.z);
  root.add(anvil);
  const faceW = anvil.position.clone().add(af);
  // the blade lies along the anvil with its middle under the hammer, the tang toward his left paw
  const spot = new THREE.Vector3(impact.x + 0.3, faceW.y + 0.01, impact.z);

  const tub = makeQuenchTub();
  tub.group.position.copy(FORGE.tub);
  root.add(tub.group);
  const water = FORGE.tub.clone().setY(tub.waterY);

  smith.place({ home, yaw, spot, dir: new THREE.Vector3(-1, 0, 0), fire: fire.clone().add(new THREE.Vector3(0, 0.08, 0)), tub: water, step: 0.62 });
  root.add(smith.blade);
  const smithShadow = makeBlobShadow(0.55, 0.42, 0.5);
  smithShadow.position.set(home.x, 0.012, home.z);
  root.add(smithShadow);
  const anvilShadow = makeBlobShadow(0.62, 0.42, 0.45);
  anvilShadow.position.set(anvil.position.x - 0.08, 0.011, anvil.position.z);
  root.add(anvilShadow);

  // ---- bellows on the forge's right cheek, nozzle into the fire
  const bel = makeBellows();
  const belPos = new THREE.Vector3(0.82, 0, 0.1).applyQuaternion(fq).add(forgeCenter);
  bel.group.position.copy(belPos);
  bel.group.quaternion.copy(fq);
  bel.group.userData.dynamic = true;
  root.add(bel.group);

  // ---- the rest of the shop
  const board = makeToolBoard();
  const bx = -0.85, by = 0.95;
  board.position.set(bx, by, cave.wallZ(bx, by + 0.6) + 0.02);
  root.add(board);
  const board2 = makeToolBoard(21);
  board2.position.set(-3.0, 1.05, cave.wallZ(-3.0, 1.65) + 0.02);
  board2.rotation.y = 0.45;
  board2.scale.setScalar(0.9);
  root.add(board2);
  const rack = makeWeaponRack();
  rack.position.copy(FORGE.rack);
  rack.rotation.y = 0.35;
  root.add(rack);
  const coal = makeCoalPile();
  coal.position.copy(FORGE.coal);
  root.add(coal);
  const ingots = makeIngots();
  ingots.position.copy(FORGE.ingots);
  ingots.rotation.y = 0.4;
  root.add(ingots);
  const grind = makeGrindstone();
  grind.group.position.copy(FORGE.grind);
  grind.group.rotation.y = 0.6;
  root.add(grind.group);
  for (const [x, w, h, ry] of [[-3.7, 2.2, 2.3, 0.35], [4.3, 2.0, 2.2, -0.45]]) {
    const tf = makeTimberFrame(w, h, Math.round(x * 3 + 9));
    tf.position.set(x, 0, cave.wallZ(x, 1.2) + 0.25);
    tf.rotation.y = ry;
    root.add(tf);
  }
  const hoistX = -1.35, hoistZ = -0.75;
  const hoistTop = cave.ceilY(hoistX, hoistZ);
  const hoist = makeHoist(Math.max(0.6, hoistTop - 2.2));
  const hoistPivot = new THREE.Group();
  hoistPivot.position.set(hoistX, hoistTop + 0.05, hoistZ);
  hoistPivot.add(hoist);
  hoistPivot.userData.dynamic = true;
  root.add(hoistPivot);
  // a lantern on the left timber
  const lantern = makeLantern({ post: 0, color: 0xffc860 });
  const lanternPos = new THREE.Vector3(-3.2, 1.9, cave.wallZ(-3.2, 1.9) + 0.45);
  lantern.group.position.copy(lanternPos).add(new THREE.Vector3(0, -0.4, 0));
  root.add(lantern.group);
  // clutter: sacks of charcoal, a rock or two
  for (const [x, z, s, sc] of [[2.95, -1.25, 6, 0.9], [3.45, -0.95, 8, 0.75], [-1.75, 0.95, 3, 0.8]]) {
    const sk = makeSack(s, 0x6a5a4a);
    sk.position.set(x, 0, z);
    sk.scale.setScalar(sc);
    sk.rotation.y = s;
    root.add(sk);
  }
  for (const [x, z, sd, sc] of [[-4.4, 1.2, 9, 1], [5.2, 0.9, 21, 1.2], [-1.2, 1.75, 31, 0.6]]) {
    const r = makeRock(sd, { w: 14, h: 9, d: 12, color: 0x5e5650, moss: 0.15 });
    r.position.set(x, 0, z);
    r.scale.setScalar(sc);
    root.add(r);
  }
  // cold light in the corners: crystals in the walls, glowing mushrooms
  const glows = [];
  const crystalSpots = [[-4.6, 0.9, 'blue', 1.2], [5.0, 1.0, 'teal', 1.1], [-2.6, 2.6, 'blue', 0.7], [3.4, 2.7, 'pink', 0.6]];
  crystalSpots.forEach(([x, y, pal, sc], i) => {
    const z = cave.wallZ(x, y);
    const m = makeCrystals(500 + i, CRYS[pal], 6, 26);
    m.position.set(x, y, z);
    m.scale.setScalar(sc);
    m.lookAt(new THREE.Vector3(x * 0.85, y + 0.3, z + 1));
    root.add(m);
    const halo = makeGlow({ color: pal === 'pink' ? 0xff5aa0 : pal === 'teal' ? 0x3ae0c0 : 0x3aa8ff, size: 1.9 * sc, intensity: 0.34, falloff: 1.7, levels: 5 });
    halo.position.set(x, y + 0.25 * sc, z + 0.3);
    root.add(halo);
    glows.push({ mesh: halo, base: 0.34, ph: i * 2.3 });
  });
  for (const s of [{ p: [-4.1, 0, -0.6], seed: 4, n: 5, sc: 1 }, { p: [4.7, 0, -0.4], seed: 12, n: 4, sc: 0.9 }, { p: [-3.3, 0, 1.6], seed: 19, n: 3, sc: 0.8, cap: [0x7af0a0, 0xc0ffd0, 0x3aa070] }]) {
    const m = makeMushrooms(s.seed, { n: s.n, scale: s.sc, cap: s.cap });
    m.group.position.set(...s.p);
    m.group.rotation.y = s.seed;
    root.add(m.group);
    for (const gl of m.glows) {
      const p = gl.pos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s.seed).add(m.group.position);
      const halo = makeGlow({ color: s.cap ? 0x5ae08a : 0x3a98ff, size: gl.size * 2.1, intensity: 0.3, falloff: 1.8, levels: 5 });
      halo.position.copy(p);
      root.add(halo);
      glows.push({ mesh: halo, base: 0.3, ph: Math.random() * 6 });
    }
  }
  const batches = batchStatic(root, { skip: (o) => o === smith.root || o === smith.blade });

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0x4a5a9a, 0x2a1a14, 1.3);
  scene.add(hemi);
  const forgeLight = new THREE.PointLight(0xff8a3a, 9, 9.5, 1.5);
  forgeLight.position.copy(fire).add(new THREE.Vector3(0, 0.45, 0)).add(new THREE.Vector3(0, 0, 0.55).applyQuaternion(fq));
  scene.add(forgeLight);
  const hotLight = new THREE.PointLight(0xffa040, 2, 3.2, 1.6);
  scene.add(hotLight);
  const coldLight = new THREE.PointLight(0x5a8aff, 2.6, 7.5, 1.6);
  coldLight.position.set(-3.6, 1.6, -0.6);
  scene.add(coldLight);
  // a cold rim on the smith from behind-left, against all that forge orange
  const rimLight = new THREE.PointLight(0x6a8cff, 4.6, 4.2, 1.3);
  rimLight.position.set(home.x - 1.1, 1.9, home.z - 1.0);
  scene.add(rimLight);
  const lanternLight = new THREE.PointLight(0xffc070, 1.8, 4, 1.6);
  lanternLight.position.copy(lanternPos).add(new THREE.Vector3(0, -0.2, 0.3));
  scene.add(lanternLight);

  // ---------------------------------------------------------------- fire
  const sheetBack = flameSheet(8, 30, 40, 7, [0xffe066, 0xffa62a, 0xf07a1a, 0xd8481a, 0x9a2a14]);
  const sheetMid = flameSheet(8, 26, 34, 3);
  const sheetCore = flameSheet(8, 18, 24, 11, [0xffffff, 0xfffbe0, 0xffe88a, 0xffc040, 0xff9a2a]);
  textures.push(sheetBack.texture, sheetMid.texture, sheetCore.texture);
  const flames = [
    { s: makeSheetSprite(sheetBack.texture, { cols: 8, size: [0.7, 0.9], anchor: [0.5, 0] }), off: [0.05, -0.02, -0.06], rate: 9, ph: 2, sway: 0.06 },
    { s: makeSheetSprite(sheetMid.texture, { cols: 8, size: [0.5, 0.66], anchor: [0.5, 0], renderOrder: 1 }), off: [-0.12, 0, 0.04], rate: 11, ph: 0, sway: 0.05 },
    { s: makeSheetSprite(sheetMid.texture, { cols: 8, size: [0.38, 0.5], anchor: [0.5, 0], renderOrder: 1 }), off: [0.16, 0, 0.08], rate: 13, ph: 5, sway: 0.08, flip: true },
    { s: makeSheetSprite(sheetCore.texture, { cols: 8, size: [0.28, 0.36], anchor: [0.5, 0], renderOrder: 2 }), off: [0.0, 0.01, 0.12], rate: 14, ph: 3, sway: 0.04 },
  ];
  for (const f of flames) {
    f.s.position.copy(fire).add(new THREE.Vector3(...f.off).applyQuaternion(fq));
    if (f.flip) f.s.userData.sheet.uFlipX.value = 1;
    f.base = f.s.position.clone();
    root.add(f.s);
  }
  const fireGlow = makeGlow({ color: 0xff7a28, size: 3.4, intensity: 0.55, falloff: 1.4, levels: 6 });
  fireGlow.position.copy(fire).add(new THREE.Vector3(0, 0.3, 0.2));
  root.add(fireGlow);
  const hoodGlow = makeGlow({ color: 0xff5a1a, size: 2.2, intensity: 0.22, falloff: 1.6, levels: 5 });
  hoodGlow.position.copy(hood).add(new THREE.Vector3(0, -0.2, 0.1));
  root.add(hoodGlow);
  const firePool = makeLightPool({ color: 0xff7a30, rx: 2.0, rz: 1.5, intensity: 0.3, levels: 5 });
  firePool.position.set(fireMouth.x - 0.4, 0.02, fireMouth.z + 0.7);
  root.add(firePool);
  const bladeGlow = makeGlow({ color: 0xff9a40, size: 0.9, intensity: 0.5, falloff: 1.6, levels: 5 });
  root.add(bladeGlow);
  const hitGlow = makeGlow({ color: 0xfff0c0, size: 1.1, intensity: 0, falloff: 1.3, levels: 5, renderOrder: 8 });
  root.add(hitGlow);
  const lanternGlow = makeGlow({ color: 0xffc060, size: 1.3, intensity: 0.45, levels: 5 });
  lanternGlow.position.copy(lantern.group.position).add(lantern.glowPos);
  root.add(lanternGlow);

  // ---------------------------------------------------------------- particles
  const sparks = new Sparks(420);
  const ax0 = anvil.position.x - 0.55, ax1 = anvil.position.x + 0.62;
  sparks.boxes.push({ x0: ax0, x1: ax1, z0: anvil.position.z - 0.2, z1: anvil.position.z + 0.2, y: faceW.y });
  sparks.boxes.push({ x0: forgeCenter.x - 0.7, x1: forgeCenter.x + 0.7, z0: forgeCenter.z - 0.45, z1: forgeCenter.z + 0.5, y: 0.74 });
  root.add(sparks.lines);
  const sparkHeads = new Particles({ max: 120, additive: true });
  root.add(sparkHeads.points);
  const embers = new Particles({ max: 180, additive: true });
  root.add(embers.points);
  const smoke = new Particles({ max: 90, additive: false, renderOrder: 4 });
  root.add(smoke.points);
  const steam = new Particles({ max: 120, additive: false, renderOrder: 4 });
  root.add(steam.points);
  const motes = new Particles({ max: 70, additive: true });
  root.add(motes.points);
  const dust = new Particles({ max: 60, additive: false, renderOrder: 4 });
  root.add(dust.points);
  for (let i = 0; i < 50; i++) {
    motes.spawn({ pos: [rng.range(-2.5, 3.5), rng.range(0.3, 2.6), rng.range(-1.8, 1.4)], vel: [rng.range(-0.04, 0.04), rng.range(-0.02, 0.03), 0], life: rng.range(4, 9), color: rng.chance(0.4) ? 0xffd8a0 : 0xff9a5a, size: 1, alpha: 0.7, fadeIn: 1, flicker: 0.5, wobble: 0.06 });
    motes.life[(motes.next - 1 + motes.max) % motes.max] = rng.range(0, 4);
  }
  // ore glints and the steel in the rack
  const twinkles = new Twinkles([
    ...[[-0.9, 1.6], [1.1, 2.6], [-2.2, 2.0], [2.9, 1.7], [4.0, 2.4], [-4.0, 2.2], [0.2, 3.0]].map(([x, y], i) => ({ pos: [x, y, cave.wallZ(x, y) + 0.05], color: i % 3 ? 0xffe08a : 0xbfe6ff, size: 1, big: 4, bigShape: SHAPE.plus, speed: 0.6 + (i % 4) * 0.3, phase: i * 2.1, sharp: 12, base: 0 })),
    { pos: [FORGE.rack.x - 0.25, 1.05, FORGE.rack.z + 0.35], color: 0xffffff, size: 1, big: 3, bigShape: SHAPE.plus, speed: 0.9, phase: 1, sharp: 16 },
    { pos: [FORGE.rack.x + 0.05, 0.95, FORGE.rack.z + 0.4], color: 0xffffff, size: 1, big: 3, bigShape: SHAPE.plus, speed: 0.7, phase: 3, sharp: 16 },
  ]);
  root.add(twinkles.points);

  // ---------------------------------------------------------------- events
  const S = { flash: 0, shake: 0, hit: 0, bellowsT: 0, roar: 0, steamT: 0, pumpT: 0, fireBoost: 0 };
  const pan = (p) => clamp((p.x - 0.8) / 4, -0.7, 0.7);
  const play = (name, o = {}) => { if (audio) audio.play(name, o); };
  smith.on('strike', (pos, power) => {
    S.flash = 1; S.hit = 1; S.shake = 0.6 * power;
    hitGlow.position.copy(pos).add(new THREE.Vector3(0, 0.02, 0.05));
    const n = Math.round(64 * power);
    const heat = smith.heat;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.4 + Math.random() * 3.2 * power;
      const up = 0.5 + Math.random() * 1.9;
      sparks.spawn([pos.x + (Math.random() - 0.5) * 0.06, pos.y + 0.02, pos.z + (Math.random() - 0.5) * 0.06], [Math.cos(a) * sp, up * (0.8 + Math.random()), Math.sin(a) * sp * 0.8 + 0.6], 0.55 + Math.random() * 1.0, 0.75 + heat * 0.5);
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.6;
      sparkHeads.spawn({ pos: [pos.x, pos.y + 0.02, pos.z], vel: [Math.cos(a) * sp, 0.8 + Math.random() * 2.4, Math.sin(a) * sp * 0.8 + 0.5], life: 0.4 + Math.random() * 0.6, color: 0xfffbe0, color2: 0xff6a1a, size: Math.random() < 0.35 ? 4 : Math.random() < 0.6 ? 3 : 2, size2: 1, gravity: 6, drag: 0.5, shape: Math.random() < 0.5 ? SHAPE.plus : SHAPE.square, fadeIn: 0 });
    }
    // a puff of scale and soot
    for (let i = 0; i < 6; i++) dust.spawn({ pos: [pos.x + (Math.random() - 0.5) * 0.2, pos.y, pos.z + (Math.random() - 0.5) * 0.15], vel: [(Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3], life: 0.8 + Math.random() * 0.6, color: 0x4a4048, color2: 0x2a2228, size: 2, size2: 3, alpha: 0.5, fadeIn: 0.02, drag: 2, shape: SHAPE.round });
    play('clang', { pitch: 0.86 + Math.random() * 0.1 + (power > 1 ? -0.06 : 0), vol: 0.42 * power, pan: pan(pos) });
    play('thud', { vol: 0.16 * power });
  });
  smith.on('clink', (pos) => { play('clang', { pitch: 1.5 + Math.random() * 0.2, vol: 0.12, pan: pan(pos) }); });
  smith.on('bellows', () => { S.pumpT = 1.6; });
  smith.on('fire', (pos) => {
    S.fireBoost = 1;
    for (let i = 0; i < 18; i++) embers.spawn({ pos: [pos.x + (Math.random() - 0.5) * 0.3, pos.y + 0.1, pos.z + (Math.random() - 0.5) * 0.2], vel: [(Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.4, (Math.random() - 0.5) * 0.4], life: 1 + Math.random(), color: 0xffe080, color2: 0xd9401a, size: Math.random() < 0.3 ? 2 : 1, gravity: -0.1, drag: 0.6, wobble: 0.3 });
    play('ignite', { vol: 0.6 });
  });
  smith.on('quench', (pos) => {
    S.steamT = 1.4;
    for (let i = 0; i < 26; i++) steam.spawn({ pos: [pos.x + (Math.random() - 0.5) * 0.3, pos.y + 0.05, pos.z + (Math.random() - 0.5) * 0.3], vel: [(Math.random() - 0.5) * 0.5, 0.9 + Math.random() * 0.9, (Math.random() - 0.5) * 0.4], life: 1.2 + Math.random() * 1.2, color: 0xf0f0f4, color2: 0x8a8a98, size: 2, size2: 7, alpha: 0.55, fadeIn: 0.05, drag: 1.2, wobble: 0.25, shape: SHAPE.round });
    for (let i = 0; i < 8; i++) sparkHeads.spawn({ pos: [pos.x, pos.y + 0.03, pos.z], vel: [(Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 1.2], life: 0.4, color: 0xd8f0ff, color2: 0x6a8aa0, size: 1, gravity: 5, fadeIn: 0 });
    play('quench');
  });

  const stats = { grid: tGrid - t0, shell: tShell - tGrid, total: performance.now() - t0, batches: batches.length, shellTris: shell.geometry.index ? shell.geometry.index.count / 3 : 0 };

  // ---------------------------------------------------------------- camera framings
  const focus = new THREE.Vector3(home.x * 0.5 + anvil.position.x * 0.5, 0.75, home.z);
  const shots = {
    menu: {
      wide: { pos: new THREE.Vector3(-0.62, 1.12, 4.55), look: new THREE.Vector3(0.12, 0.92, -0.35), fov: 33 },
      tall: { pos: new THREE.Vector3(0.3, 1.55, 6.6), look: new THREE.Vector3(0.45, 0.05, -0.3), fov: 46 },
    },
    stones: {
      wide: { pos: new THREE.Vector3(-0.2, 1.05, 3.6), look: new THREE.Vector3(0.38, 0.5, -0.3), fov: 36 },
      tall: { pos: new THREE.Vector3(0.2, 1.35, 5.2), look: new THREE.Vector3(0.35, 0.3, -0.3), fov: 46 },
    },
  };

  // ---------------------------------------------------------------- update
  let t = 0, emberAcc = 0, smokeAcc = 0, moteAcc = 0;
  const tmp = new THREE.Vector3();
  const update = (dt, camera) => {
    t += dt;
    smith.cam = camera;
    smith.update(dt);
    // bellows: a slow idle breath, a hard pump while the blade is in the fire
    S.pumpT = Math.max(0, S.pumpT - dt);
    const pumping = S.pumpT > 0;
    const prevPump = S.pump || 0;
    const ph = pumping ? (t * 2.2) % 1 : (t * 0.35) % 1;
    const open = pumping ? Math.abs(Math.sin(ph * Math.PI)) : 0.25 + 0.15 * Math.sin(t * 0.9);
    S.pump = open;
    bel.top.rotation.z = open * 0.16;
    bel.leather.scale.y = 0.35 + open * 1.0;
    if (pumping && prevPump > 0.85 && open < prevPump && !S.puffed) { S.puffed = true; play('bellows', { vol: 0.55 }); S.fireBoost = Math.max(S.fireBoost, 0.8); }
    if (open < 0.3) S.puffed = false;
    // fire flicker, roaring when the bellows blow
    S.fireBoost = Math.max(0, S.fireBoost - dt * 0.8);
    const roar = 1 + S.fireBoost * 0.6;
    const fl = (0.82 + 0.1 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 23.7 + 1) + 0.05 * Math.sin(t * 5.3)) * roar;
    forgeLight.intensity = 9 * fl;
    fireGlow.userData.glow.uIntensity.value = 0.48 * fl;
    hoodGlow.userData.glow.uIntensity.value = 0.2 * fl;
    firePool.userData.glow.uIntensity.value = 0.28 * fl;
    coalMat.color.setScalar(0.72 + 0.22 * fl + Math.sin(t * 3.1) * 0.05);
    for (const f of flames) {
      f.s.userData.sheet.uFrame.value = Math.floor(t * f.rate * roar + f.ph) % 8;
      f.s.scale.set((1 + Math.sin(t * 9 + f.ph) * f.sway) * (1 + S.fireBoost * 0.15), (1 + Math.sin(t * 7.1 + f.ph * 1.7) * f.sway * 1.6) * roar, 1);
    }
    // embers from the firepot, smoke up the hood
    emberAcc += dt * (9 + S.fireBoost * 30);
    while (emberAcc > 1) {
      emberAcc -= 1;
      embers.spawn({ pos: [fire.x + (Math.random() - 0.5) * 0.35, fire.y + 0.1, fire.z + (Math.random() - 0.5) * 0.25], vel: [(Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.2 + 0.08], life: 1.2 + Math.random() * 1.6, color: Math.random() < 0.4 ? 0xffe080 : 0xffa040, color2: 0xc8361a, size: Math.random() < 0.2 ? 2 : 1, gravity: -0.05, drag: 0.4, wobble: 0.35, flicker: 0.3 });
    }
    embers.update(dt);
    smokeAcc += dt * 3.2;
    while (smokeAcc > 1) {
      smokeAcc -= 1;
      smoke.spawn({ pos: [hood.x + (Math.random() - 0.5) * 0.5, hood.y - 0.1, hood.z + 0.1], vel: [(Math.random() - 0.5) * 0.1, 0.35 + Math.random() * 0.15, 0.05], life: 3 + Math.random(), color: 0x3a3034, color2: 0x1e181c, size: 2, size2: 7, alpha: 0.32, fadeIn: 0.5, wobble: 0.12, drag: 0.2, shape: SHAPE.round });
    }
    smoke.update(dt);
    // steam keeps wisping off the tub for a while after a quench
    S.steamT = Math.max(0, S.steamT - dt);
    if (S.steamT > 0 && Math.random() < dt * 18 * S.steamT) steam.spawn({ pos: [water.x + (Math.random() - 0.5) * 0.4, water.y + 0.04, water.z + (Math.random() - 0.5) * 0.4], vel: [(Math.random() - 0.5) * 0.2, 0.4 + Math.random() * 0.4, 0], life: 1.6, color: 0xe8e8f0, color2: 0x7a7a88, size: 2, size2: 5, alpha: 0.4, fadeIn: 0.2, wobble: 0.2, drag: 0.6, shape: SHAPE.round });
    steam.update(dt);
    sparks.update(dt);
    sparkHeads.update(dt);
    dust.update(dt);
    moteAcc += dt * 6;
    while (moteAcc > 1) { moteAcc -= 1; motes.spawn({ pos: [rng.range(-2.5, 3.5), rng.range(0.2, 2.6), rng.range(-1.8, 1.4)], vel: [rng.range(-0.04, 0.04), rng.range(0.0, 0.05), 0], life: rng.range(4, 9), color: rng.chance(0.4) ? 0xffd8a0 : 0xff9a5a, size: 1, alpha: 0.6, fadeIn: 1, flicker: 0.5, wobble: 0.06 }); }
    motes.update(dt);
    twinkles.update(dt);
    for (const g of glows) g.mesh.userData.glow.uIntensity.value = g.base * (0.85 + 0.15 * Math.sin(t * 1.3 + g.ph));
    // the hot blade lights its surroundings; a white flash on every blow
    S.hit = Math.max(0, S.hit - dt * 7);
    S.flash = Math.max(0, S.flash - dt * 6);
    const heat = smith.heat;
    smith.blade.getWorldPosition(tmp);
    root.worldToLocal(tmp);
    tmp.add(new THREE.Vector3(0, 0.05, 0));
    hotLight.position.copy(tmp).add(new THREE.Vector3(0, 0.15, 0.2));
    hotLight.intensity = heat * 2.6 + S.hit * 7;
    bladeGlow.position.copy(tmp);
    bladeGlow.userData.glow.uIntensity.value = heat * 0.45 + S.hit * 0.3;
    bladeGlow.userData.glow.uColor.value.setHex(heat > 0.7 ? 0xffc060 : 0xff6a20);
    hitGlow.userData.glow.uIntensity.value = S.hit * 1.1;
    // the hoist chain sways in the draught, the grindstone idles, the lantern flickers
    hoistPivot.rotation.z = Math.sin(t * 0.55) * 0.03;
    hoistPivot.rotation.x = Math.sin(t * 0.41 + 1) * 0.02;
    grind.wheel.rotation.x += dt * 0.15;
    lanternLight.intensity = 1.8 * (0.92 + Math.sin(t * 9.3) * 0.04 + Math.sin(t * 17.1) * 0.04);
    S.shake = Math.max(0, S.shake - dt * 4);
  };

  return {
    root, update, smith, stats, shots, focus, anvil, forge, fire, impact, S,
    lights: { forgeLight, hotLight, coldLight, hemi },
    get flash() { return S.flash; },
    get shake() { return S.shake; },
  };
}

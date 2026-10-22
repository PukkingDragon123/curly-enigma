// Rocco the raccoon: a CharacterRig (so expressions, talking and looking all work) built on the fox
// and turned into a raccoon by repainting his skin in place (a black mask with white brows over the
// eyes, a grey-and-black ringed tail, dark ears with pale rims), then dressed in a long, too-big coat
// whose right front panel swings open (rig.openCoat(k)) on a purple lining full of hidden pockets
// (pocket watches, a dagger, rings). His eyes dart about on their own (rig.shifty(k)).
import * as THREE from 'three';
import { makeCharacter } from '../../gfx/characters.js';
import { VoxelGrid, voxelMesh } from '../../gfx/Voxel.js';
import { SHOPS } from '../../data/shops.js';

export const ROCCO_SPEC = SHOPS.rocco.keeper;

const COAT = [0x3a3424, 0x4a422e, 0x5a5038, 0x6a6044]; // olive drab, dark → light
const LINING = [0x3a1a3a, 0x542a52, 0x6a3a68];
const _c = new THREE.Color();

/** Build Rocco. opts: { kind } → CharacterRig with .openCoat(k 0..1) and .shifty(k). */
export function makeRocco(opts = {}) {
  const rig = makeCharacter(ROCCO_SPEC, { kind: opts.kind || 'toon' });
  try { raccoonize(rig); } catch (e) { console.warn('rocco: paint', e); }
  try { addCoat(rig); } catch (e) { console.warn('rocco: coat', e); }
  rig.shiftyK = 1;
  rig.shifty = (k) => { rig.shiftyK = k; return rig; };
  const eyesX = (rig.eyes || []).map((g) => g.position.x);
  let dart = 0, dartT = 1.5, dartTo = 0;
  const update0 = rig.update.bind(rig);
  rig.update = (dt) => {
    update0(dt);
    // shifty eyes: a quick glance to one side now and then, held, then back
    dartT -= dt;
    if (dartT <= 0) {
      dartTo = dartTo ? 0 : (Math.random() < 0.5 ? -1 : 1) * rig.shiftyK;
      dartT = dartTo ? 0.5 + Math.random() * 0.7 : 1.2 + Math.random() * 2.6;
    }
    dart += (dartTo - dart) * Math.min(1, dt * 22);
    (rig.eyes || []).forEach((g, i) => { g.position.x = eyesX[i] + dart * rig.vs * 1.1; });
    // the coat flap eases toward where it was asked to be
    if (rig.coatFlap) {
      rig.coatK += (rig.coatTo - rig.coatK) * Math.min(1, dt * 6);
      rig.coatFlap.rotation.y = rig.coatK * 1.35;
    }
  };
  rig.coatK = 0; rig.coatTo = 0;
  rig.openCoat = (k = 1) => { rig.coatTo = k; return rig; };
  return rig;
}

/** Repaint the fox's skin: mask, brows, ringed tail, ear rims (per-vertex, this rig only). */
function raccoonize(rig) {
  const geo = rig.skin?.main?.geometry;
  const bones = rig.skeleton?.bones;
  if (!geo || !bones) return;
  const P = geo.attributes.position.array, C = geo.attributes.color.array, SI = geo.attributes.skinIndex.array;
  const n = geo.attributes.position.count;
  const idxOf = (b) => bones.indexOf(b);
  const head = idxOf(rig.headMesh);
  const tailB = new Set(bones.map((b, i) => (b.parent === rig.tail ? i : -1)).filter((i) => i >= 0));
  const earB = new Set(bones.map((b, i) => (rig.ears && rig.ears.includes(b.parent) ? i : -1)).filter((i) => i >= 0));
  const vs = rig.vs;
  const eyeY = rig.anchors.eyes.y / vs, eyeZ = rig.anchors.eyes.z / vs;
  const eyeX = Math.abs((rig.eyes?.[0]?.position.x || 0) / vs) || 3;
  // per-part bounds (voxel units, part-local)
  const bb = new Map();
  for (let i = 0; i < n; i++) {
    const b = SI[i * 4];
    let r = bb.get(b);
    if (!r) bb.set(b, (r = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]));
    for (let k = 0; k < 3; k++) { const v = P[i * 3 + k]; if (v < r[k]) r[k] = v; if (v > r[k + 3]) r[k + 3] = v; }
  }
  const lum = (r, g, b) => r * 0.3 + g * 0.59 + b * 0.11;
  _c.setHex(ROCCO_SPEC.fur);
  const furL = lum(_c.r, _c.g, _c.b);
  const paint = (i, hex, keep = 0.6) => {
    const r0 = C[i * 3] / 65535, g0 = C[i * 3 + 1] / 65535, b0 = C[i * 3 + 2] / 65535;
    const k = Math.max(0.7, Math.min(1.25, lum(r0, g0, b0) / furL)) * keep + (1 - keep);
    _c.setHex(hex);
    C[i * 3] = Math.min(65535, Math.round(_c.r * k * 65535)); C[i * 3 + 1] = Math.min(65535, Math.round(_c.g * k * 65535)); C[i * 3 + 2] = Math.min(65535, Math.round(_c.b * k * 65535));
  };
  const hb = bb.get(head);
  for (let i = 0; i < n; i++) {
    const b = SI[i * 4];
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const r0 = C[i * 3] / 65535, g0 = C[i * 3 + 1] / 65535, b0 = C[i * 3 + 2] / 65535;
    const white = lum(r0, g0, b0) > 0.62; // the fox's white muzzle and cheeks
    if (b === head && hb) {
      const front = z > eyeZ - 3.5, ax = Math.abs(x);
      const dy = y - eyeY;
      // the bandit mask: a band through the eyes sweeping back to the cheeks, a stripe down the nose
      const band = dy > -2.6 + Math.max(0, ax - eyeX - 1) * 0.35 && dy < 1.9 - Math.max(0, ax - eyeX) * 0.2;
      if (front && band && ax < hb[3] * 0.98 && !(white && dy < -1.4)) paint(i, ax < 0.9 && dy < 0.5 ? 0x5a5658 : 0x262224, 0.3);
      else if (front && dy >= 1.9 && dy < 3.6 && ax > 0.8 && ax < eyeX + 2.6) paint(i, 0xf2eee6, 0.25); // white brows
      else if (!white && y > hb[4] - 2.5 && z < 0) paint(i, 0x6e6a6c); // a darker crown
    } else if (tailB.has(b)) {
      const ring = Math.floor((-z - 1) / 2.4);
      paint(i, -z > 13.5 ? 0x221e20 : ring % 2 ? 0x2c282a : 0xa6a2a2, 0.55);
    } else if (earB.has(b)) {
      const r = bb.get(b);
      const t = (y - r[1]) / Math.max(1e-3, r[4] - r[1]);
      paint(i, t > 0.72 || Math.abs(x) > Math.max(Math.abs(r[0]), Math.abs(r[3])) - 0.6 ? 0xeae6de : 0x3a3638, 0.4);
    }
  }
  geo.attributes.color.needsUpdate = true;
}

/** The long coat: a shell over the body (the right front panel is its own hinged mesh) and sleeves. */
function addCoat(rig) {
  const geo = rig.skin?.main?.geometry, bones = rig.skeleton?.bones;
  if (!geo || !bones) return;
  const P = geo.attributes.position.array, SI = geo.attributes.skinIndex.array, n = geo.attributes.position.count;
  const bodyI = bones.indexOf(rig.bodyMesh);
  const r = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) if (SI[i * 4] === bodyI) for (let k = 0; k < 3; k++) { const v = P[i * 3 + k]; if (v < r[k]) r[k] = v; if (v > r[k + 3]) r[k + 3] = v; }
  if (r[0] > r[3]) return;
  const vs = rig.vs;
  const cx = (r[0] + r[3]) / 2, cz = (r[2] + r[5]) / 2;
  const rx = (r[3] - r[0]) / 2 + 1.1, rz = (r[5] - r[2]) / 2 + 1.1;
  // the skirt hangs down past the knees: from the hip, most of the leg
  const legV = (rig.p.lh || 7) * 2;
  const y0 = Math.floor(r[1] - legV * 0.5), y1 = Math.ceil(r[4] + 2);
  const W = Math.ceil(rx * 2 + 6), D = Math.ceil(rz * 2 + 6), H = y1 - y0 + 1;
  const ox = cx - W / 2, oz = cz - D / 2; // grid → part-local
  const main = new VoxelGrid(W, H, D), flap = new VoxelGrid(W, H, D);
  const yHip = r[1] - y0, yTop = H - 1;
  for (let y = 0; y < H; y++) {
    const t = y / Math.max(1, yHip); // < 1 below the hip
    const flare = y < yHip ? (1 - t) * 1.1 : 0;
    const collar = y > yTop - 4; // the popped collar stands up round the back of the neck
    const taper = y > yTop - 7 && !collar ? (y - (yTop - 7)) * 0.45 : collar ? 1.2 : 0;
    const RX = rx + flare - taper, RZ = rz + flare * 0.7 - taper * 0.6;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const lx = x + ox - cx + 0.5, lz = z + oz - cz + 0.5;
      const e = Math.pow(Math.abs(lx / RX) ** 3 + Math.abs(lz / RZ) ** 3, 1 / 3); // boxy enough to hold a belly
      if (e > 1 || e < 1 - 1.7 / Math.min(RX, RZ)) continue;
      const front = lz > 0;
      // a V at the neck, a vent up the back, the front edges overlapping below the chest
      const vneck = front && Math.abs(lx) < (y - (yTop - 12)) * 0.8 && y > yTop - 12;
      if (vneck) continue;
      if (collar && lz > RZ * 0.15) continue;
      if (!front && Math.abs(lx) < 0.8 && y < yHip - 2) continue;
      let c = (x + y * 3) % 11 === 0 ? COAT[1] : COAT[2];
      if (y === 0 || y === 1) c = COAT[0];
      if (Math.abs(y - (yHip + 3)) < 1) c = (front && Math.abs(lx) < 1.2) ? 0xb88a3a : 0x2e281c; // the belt and its buckle
      if (collar) c = (y + x) % 2 ? COAT[3] : COAT[2];
      const edge = front && Math.abs(lx) < 1.6;
      const lapel = front && y > yTop - 12 && Math.abs(lx) < (y - (yTop - 12)) * 0.7 + 2;
      if (lapel) c = COAT[3];
      if (edge) c = COAT[1];
      if (front && Math.abs(lx - 1.2) < 0.6 && (yTop - y) % 5 === 3 && y > yHip - 3 && y < yTop - 8) c = 0xd8a840; // buttons
      if (Math.abs(Math.abs(lx) - RX * 0.55) < 0.7 && y > yHip - 6 && y < yHip - 2 && front && lz > RZ * 0.6) c = COAT[0]; // pocket flaps
      if (front && lx > 0.5) flap.set(x, y, z, c); else main.set(x, y, z, c);
    }
  }
  // inside the flap: the purple lining and its hidden pockets
  const goods = [0xe8c050, 0xfff0a0, 0xc8ccd4, 0xff4a5a, 0x5ae0ff];
  for (let y = 2; y < H - 3; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (!flap.filled(x, y, z)) continue;
    const inner = !flap.filled(x, y, z - 1);
    if (!inner || flap.filled(x, y, z - 1)) continue;
    const lx = x + ox - cx;
    const row = Math.floor((y - 3) / 6), col = Math.floor((lx - 1) / 3);
    const pocket = (y - 3) % 6 < 4 && (lx - 1) % 3 < 2.2 && row >= 0 && col >= 0;
    if (z - 1 >= 0) flap.set(x, y, z - 1, pocket ? ((y - 3) % 6 === 3 ? 0x2a1028 : LINING[1]) : LINING[(x + y) % 3 === 0 ? 0 : 2]);
    if (pocket && (y - 3) % 6 === 2 && z - 2 >= 0 && ((row + col) % 2 === 0)) flap.set(x, y + 1, z - 2, goods[(row * 3 + col) % goods.length]);
  }
  const mk = (grid) => {
    const m = voxelMesh(grid, { greedy: true, kind: 'toon', pivot: [0, 0, 0], scale: 1 });
    return m;
  };
  const coat = mk(main);
  coat.position.set(ox, y0, oz);
  coat.name = 'rocco-coat';
  rig.bodyMesh.add(coat);
  // the flap hinges at its outer side seam (right side, middle of the depth)
  const hingeX = cx + rx - 0.4, hingeZ = cz + rz * 0.15;
  const pivot = new THREE.Group();
  pivot.position.set(hingeX, 0, hingeZ);
  const fm = mk(flap);
  fm.position.set(ox - hingeX, y0, oz - hingeZ);
  pivot.add(fm);
  rig.bodyMesh.add(pivot);
  rig.coatFlap = pivot;
  rig.coatMeshes = [coat, fm];
  // sleeves over the upper arms (and forearms on the tall build)
  for (const g of [rig.armL, rig.armR, rig.elbowL, rig.elbowR]) {
    if (!g) continue;
    const bi = bones.findIndex((b) => b.parent === g);
    if (bi < 0) continue;
    const q = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) if (SI[i * 4] === bi) for (let k = 0; k < 3; k++) { const v = P[i * 3 + k]; if (v < q[k]) q[k] = v; if (v > q[k + 3]) q[k + 3] = v; }
    if (q[0] > q[3]) continue;
    const bone = bones[bi];
    const fore = g === rig.elbowL || g === rig.elbowR;
    const sw = Math.ceil(q[3] - q[0] + 2), sd = Math.ceil(q[5] - q[2] + 2);
    const top = q[4], bot = fore ? q[1] + (q[4] - q[1]) * 0.45 : q[1];
    const sh = Math.max(2, Math.ceil(top - bot));
    const s = new VoxelGrid(sw, sh, sd);
    for (let y = 0; y < sh; y++) for (let z = 0; z < sd; z++) for (let x = 0; x < sw; x++) {
      const e = Math.hypot((x + 0.5 - sw / 2) / (sw / 2), (z + 0.5 - sd / 2) / (sd / 2));
      if (e > 1 || e < 0.55) continue;
      s.set(x, y, z, y === 0 && fore ? COAT[3] : (x + y) % 9 === 0 ? COAT[1] : COAT[2]);
    }
    const m = mk(s);
    m.position.set((q[0] + q[3]) / 2 - sw / 2, bot, (q[2] + q[5]) / 2 - sd / 2);
    bone.add(m);
    rig.coatMeshes.push(m);
  }
  void vs;
}

// The old collapsed mine tunnel where the mole breaks out into Deep Town: a timber
// frame set into the rock, rusty rails running out of the dark, nailed-up boards with a
// "CLOSED - CAVE-IN" sign (separate meshes so they can burst outward), and the rubble
// that seals it again afterwards. Local space: x along the wall (0 = tunnel center),
// z out of the rock face (0 = face), y up.
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, iron, stone, line, M32, G32, group, mulc, h3, sp3, S32, lowRes } from './kit.js';
import { rubble } from './props.js';
import { PixelCanvas, pixelTexture, ramp } from '../gfx/PixelArt.js';
import { drawTextCentered } from './pixel.js';
import { makeRng } from '../core/util.js';

const hash3i = (x, y) => (((Math.imul(x, 374761393) + Math.imul(y, 668265263)) ^ 0x5bd1e995) >>> 0) % 1000 / 1000;
export const TUNNEL_W = 1.62; // opening width
export const TUNNEL_H = 2.0; // opening height (arch top)

/** Is wall-space point (du from center, y) inside the opening? (for carving the wall) */
export function inTunnel(du, y) {
  const r = TUNNEL_W / 2;
  if (Math.abs(du) > r) return false;
  const spring = TUNNEL_H - r;
  return y < spring || du * du + (y - spring) ** 2 <= r * r;
}

/** Timber frame, dark interior, rails and the deep rubble. Static (batched). */
export function tunnelFrame() {
  const W = 76, H = 82, D = 60;
  const g = new VoxelGrid(W, H, D);
  const cx = W / 2;
  const fz = 40; // grid z of the rock face
  const post = beam(0x8a6440, 'y', 3);
  // a rough stone arch around the mouth (voussoirs), mossy at the foot
  const st = stone(0x8a8078, { seed: 12 });
  const R0 = 27, R1 = 35, spring = 38;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx;
    const r = y < spring ? Math.abs(dx) : Math.hypot(dx, y - spring);
    if (r < R0 || r > R1 + (hash3i(x, y) < 0.3 ? 1 : 0)) continue;
    const a = y < spring ? (dx < 0 ? Math.PI : 0) : Math.atan2(y - spring, dx);
    const blk = y < spring ? Math.floor(y / 9) * 2 + (dx < 0 ? 1 : 0) : 20 + Math.floor((a / Math.PI) * 11);
    const seam = y < spring ? y % 9 === 0 : Math.abs(((a / Math.PI) * 11) % 1) < 0.1;
    for (let z = fz - 3; z < fz + 3; z++) g.set(x, y, z, seam ? 0x4a4038 : mulc(st(x, y, z), 0.9 + (blk * 37 % 7) * 0.035 - (y < 6 && hash3i(x, z) < 0.5 ? 0.25 : 0)));
  }
  // posts with iron bands and old hazard paint, slightly splayed
  for (const s of [-1, 1]) {
    const x0 = Math.round(cx + s * 22 - (s > 0 ? 0 : 6));
    g.box(x0, 0, fz - 4, 6, 56, 7, (x, y, z) => (z === fz + 2 && y > 18 && y < 34 && Math.floor((y + x) / 3) % 2 ? (y % 7 < 4 ? 0xe0b030 : 0x2a1a10) : post(x, y, z)));
    for (const y of [10, 42]) g.box(x0, y, fz - 4, 6, 2, 8, C.iron);
    g.set(x0 + 3, 11, fz + 4, C.ironL); g.set(x0 + 3, 43, fz + 4, C.ironL);
  }
  // lintel
  g.box(cx - 28, 54, fz - 5, 56, 7, 9, beam(0x7a5636, 'x', 4));
  for (const x of [cx - 24, cx + 20]) g.box(x, 54, fz + 4, 4, 7, 1, C.iron);
  // a painted shaft number on the lintel
  const digits = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4]]; // a "7"
  for (const [dx, dy] of digits) g.set(cx - 1 + dx, 59 - dy, fz + 4, 0xe8d8b0);
  // inner shoring: two arched ribs deeper in (seen through the opening)
  for (const z of [fz - 18, fz - 34]) {
    for (let k = 0; k <= 20; k++) {
      const a = Math.PI * k / 20;
      const x = cx - Math.cos(a) * 25, y = 36 + Math.sin(a) * 26;
      g.box(Math.round(x) - 1, Math.round(y) - 1, z, 3, 3, 3, mulc(0x4e3622, 0.975 * sp3(k, z, 0, 2)));
    }
    g.box(cx - 27, 0, z, 3, 37, 3, 0x4e3622); g.box(cx + 24, 0, z, 3, 37, 3, 0x4e3622);
  }
  // rusty rails running out of the tunnel (end in a broken sleeper)
  for (let z = 0; z < D; z += 7) g.box(cx - 14, 0, z, 28, 1, 3, (x, y, zz) => mulc(0x5a3e28, 0.95 * sp3(x, y, zz, 5)));
  for (const x of [cx - 10, cx + 9]) for (let z = 0; z < D - 2; z++) { g.set(x, 1, z, 0x6a4a3a); g.set(x, 2, z, z % 9 === 0 ? 0x8a5a3a : 0x7a6a64); }
  const obj = M32(g, [cx, 0, fz]);
  // the deep rubble that has always choked the tunnel further in
  const deep = lowRes(() => rubble(7, 1.5, 0.9));
  deep.obj.position.set(0, 0, -1.25);
  deep.obj.scale.set(1, 1.6, 1);
  // darkness inside: a black backdrop deep in
  const dark = new VoxelGrid(56, 70, 2);
  dark.box(0, 0, 0, 56, 70, 2, 0x0c0908);
  const darkM = M32(dark, [28, 0, 1], { outline: false });
  darkM.position.set(0, 0, -1.65);
  return group(obj, deep.obj, darkM);
}

/** Planks nailed across the opening (each a separate mesh) + the sign. */
export function tunnelBoards(seed = 3) {
  const rng = makeRng(seed);
  const boards = [];
  const rows = [0.18, 0.46, 0.74, 1.02, 1.36, 1.66];
  rows.forEach((y, i) => {
    const len = 1.86 + rng.range(-0.08, 0.14);
    const L = Math.round(len * 32);
    const g = new VoxelGrid(L, 5, 2);
    const wf = wood(i % 2 ? 0x8a6a48 : 0x7a5a3a, { axis: 'x', across: 'y', pw: 99, seed: seed + i });
    g.box(0, 0, 0, L, 5, 2, (x, yy, z) => ((x < 2 || x > L - 3) && yy === 4 && (x + i) % 2 ? -1 : wf(x, yy, z)));
    for (const x of [3, L - 4]) { g.set(x, 1, 1, C.ironL); g.set(x, 3, 1, C.ironL); }
    const m = M32(g, [L / 2, 2.5, 0]);
    m.position.set(rng.range(-0.06, 0.06), y, 0.05 + i * 0.004);
    m.rotation.z = rng.range(-0.09, 0.09);
    boards.push(m);
  });
  // one diagonal brace
  const L = 66;
  const dg = new VoxelGrid(L, 5, 2);
  dg.box(0, 0, 0, L, 5, 2, wood(0x6a4a30, { axis: 'x', across: 'y', pw: 99, seed: seed + 9 }));
  dg.set(3, 2, 1, C.ironL); dg.set(L - 4, 2, 1, C.ironL);
  const dm = M32(dg, [L / 2, 2.5, 0]);
  dm.position.set(0.02, 0.92, 0.1);
  dm.rotation.z = 0.62;
  boards.push(dm);
  // the sign
  const sg = signCanvasClosed();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(sg.w / 40, sg.h / 40), new THREE.MeshLambertMaterial({ map: pixelTexture(sg.commit()), transparent: true, alphaTest: 0.5 }));
  sign.position.set(0.08, 1.2, 0.14);
  sign.rotation.z = -0.06;
  return { boards, sign };
}

function signCanvasClosed() {
  const w = 44, h = 26;
  const pc = new PixelCanvas(w, h);
  const R = ramp(0xd8c8a0);
  pc.rect(0, 0, w, h, 0x3a2414);
  pc.rect(1, 1, w - 2, h - 2, 0xd8c8a0);
  for (let i = 0; i < 70; i++) pc.set(2 + ((i * 37) % (w - 4)), 2 + ((i * 53) % (h - 4)), i % 2 ? R[2] : R[4]);
  // hazard stripes top and bottom
  for (let x = 1; x < w - 1; x++) for (const y of [1, 2, h - 3, h - 2]) pc.set(x, y, ((x + y) >> 1) % 2 ? 0x2a1a10 : 0xe0b030);
  drawTextCentered(pc, 'CLOSED', w / 2, 6, 0x9a2a1a, { shadow: 0x6a4a3a });
  drawTextCentered(pc, 'CAVE-IN!', w / 2, 14, 0x2a1a10);
  pc.set(2, 4, 0x8a8a90); pc.set(w - 3, 4, 0x8a8a90);
  return pc;
}

/** Broken leftovers after the escape: splintered stubs on the posts and planks on the ground. */
export function brokenBoards(seed = 5) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(80, 70, 50);
  const cx = 40, fz = 10;
  // splintered stubs still nailed to the posts
  for (const [y, s] of [[8, -1], [17, 1], [33, -1], [44, 1], [53, -1]]) {
    const len = rng.int(5, 12);
    const x0 = s < 0 ? cx - 30 : cx + 30 - len;
    g.box(x0, y, fz, len, 4, 2, wood(0x7a5a3a, { axis: 'x', across: 'y', pw: 99, seed: y }));
    for (let k = 0; k < 3; k++) g.set(s < 0 ? x0 + len + k : x0 - 1 - k, y + rng.int(0, 3), fz, 0x8a6a48);
  }
  // planks lying on the floor in front
  for (let k = 0; k < 4; k++) {
    const a = rng.range(-0.8, 0.8), L = rng.range(22, 46);
    const x = cx + rng.range(-24, 24), z = fz + rng.range(10, 34);
    line(g, [[x - Math.cos(a) * L / 2, 0.5, z - Math.sin(a) * L / 2], [x + Math.cos(a) * L / 2, 0.5 + (k === 1 ? 6 : 0), z + Math.sin(a) * L / 2]], 1.2, wood(k % 2 ? 0x8a6a48 : 0x7a5a3a, { axis: 'x', across: 'y', pw: 99, seed: k }));
  }
  return M32(g, [cx, 0, fz]);
}

/** The rubble that slumps into the mouth and seals it (local origin at the face). */
export function sealRubble(seed = 9) {
  const r = lowRes(() => rubble(seed, 1.7, 1.15));
  r.obj.position.set(0, 0, -0.32);
  r.obj.scale.set(1, 1.35, 1);
  return r.obj;
}

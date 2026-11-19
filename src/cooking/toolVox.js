// Voxel props for the wave-16 cooking steps: the stone mortar and pestle (grind), a bone-handled
// peeler (peel), a roasting skewer (skewer), a balloon whisk (whisk), a horsehair sieve (sift), and
// the things a crack can split: a stone nut and a salt geode. Small tools are built at half the
// kitchen voxel (PS / 2: finer than the counter props, like the size rule asks). Origins: bottom
// centre unless noted.
import { VoxelGrid } from '../gfx/Voxel.js';
import { PS, vmesh, jit, ring } from './models.js';
import { shade, mixHex } from '../core/util.js';

export const FS = PS / 2; // fine voxel

const WOOD = 0x9a6a3a, WOOD_D = 0x6a4224, BONE = 0xe8dcc0, IRON = 0x8a8e96, STONE = 0x8a8478, STONE_D = 0x5e5a52;

/** A squat granite mortar: thick walls, a flared foot, chips and a carved band. Origin bottom centre. */
export function mortar() {
  const H = 22, g = new VoxelGrid(40, H + 1, 40), cx = 20, cz = 20;
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const rOut = y < 3 ? 15.5 - y * 0.4 : 13.2 + Math.sin(t * Math.PI) * 4.2;
    const rIn = y < 6 ? -1 : 6 + (y - 6) * 0.42;
    ring(g, cx, cz, rOut, rIn, y, y + 1, (x, yy, z, d, a) => {
      if (rIn > 0 && d <= rIn + 1.1) return jit(0x6e6a62, x, yy, z, 7, 0.05); // the worn bowl inside
      if (yy === H - 1) return jit(0xb4ae9e, x, yy, z, 3, 0.04); // a lit rim
      if (yy === 9 || yy === 10) return (Math.round(a * 10) % 2 ? 0x726c60 : 0x9a9282); // carved band
      const k = Math.cos(a - 2.2);
      const c = k > 0.55 ? shade(STONE, 1.14) : k < -0.5 ? STONE_D : STONE;
      return jit((x * 7 + yy * 3 + z * 11) % 19 === 0 ? 0xb8b0a0 : c, x, yy, z, 5, 0.07);
    });
  }
  const m = vmesh(g, [cx, 0, cz], { scale: FS });
  m.userData.bowlY = 6 * FS;
  m.userData.rimY = H * FS;
  m.userData.innerR = 12 * FS;
  return m;
}

/** The pestle: a stone club with a rounded head. Origin at the head's bottom. */
export function pestle() {
  const g = new VoxelGrid(12, 34, 12), c = 6;
  g.ellipsoid(c, 5, c, 4.6, 5, 4.6, (x, y, z) => jit(y < 3 ? 0x6e6a62 : STONE, x, y, z, 9, 0.06));
  for (let y = 6; y < 34; y++) {
    const r = 3.2 - (y - 6) * 0.04 + (y > 29 ? 0.8 : 0);
    ring(g, c, c, r, -1, y, y + 1, (x, yy, z, d, a) => jit(Math.cos(a - 2.2) > 0.5 ? 0xa49c8c : STONE, x, yy, z, 4, 0.05));
  }
  return vmesh(g, [c, 0, c], { scale: FS });
}

/** A swivel peeler: a bone handle with brass rivets and a slotted steel blade on top. Origin: the blade. */
export function peeler() {
  const g = new VoxelGrid(8, 36, 5);
  g.box(2, 0, 1, 4, 22, 3, BONE);
  for (let y = 0; y < 22; y++) for (let x = 2; x < 6; x++) if ((x + y) % 7 === 0) g.set(x, y, 1, 0xd0c4a4);
  g.set(3, 6, 0, 0xd8a83a); g.set(3, 15, 0, 0xd8a83a);
  g.box(1, 22, 1, 6, 2, 3, 0xb8962a); // brass collar
  // the U frame and the blade
  g.box(0, 24, 2, 1, 11, 1, IRON); g.box(7, 24, 2, 1, 11, 1, IRON); g.box(0, 34, 2, 8, 1, 1, IRON);
  for (let y = 26; y < 34; y++) { g.set(2, y, 2, 0xd8dee6); g.set(3, y, 2, y % 3 ? 0xb8c0ca : 0x5a6270); g.set(4, y, 2, 0xd8dee6); g.set(5, y, 2, 0xe8eef4); }
  return vmesh(g, [4, 30, 2.5], { scale: FS });
}

/** A long iron roasting skewer with a twisted ring handle. Lies along +x; origin at its middle. */
export function skewerStick(len = 64) {
  const g = new VoxelGrid(len + 10, 9, 9);
  for (let x = 0; x < len; x++) { g.set(x + 8, 4, 4, x % 6 === 0 ? 0x6a6e76 : IRON); if (x > len - 4) g.set(x + 8, 4, 4, 0xb8c0ca); }
  // the ring handle
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    const x = Math.round(4 + Math.cos(t) * 3.6), y = Math.round(4 + Math.sin(t) * 3.6);
    g.set(x, y, 4, a % 4 < 2 ? 0x9aa0aa : 0x5a5e66);
  }
  return vmesh(g, [(len + 10) / 2, 4.5, 4.5], { scale: FS });
}

/** A balloon whisk: wire loops on a turned wooden handle. Origin at the wire tip (pointing down). */
export function whisk() {
  const g = new VoxelGrid(17, 52, 17), c = 8;
  // wires: 6 teardrop loops that meet at the handle and bulge round the bottom
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i <= 90; i++) {
      const t = i / 90;
      const Y = Math.round(25 - Math.sin(t * Math.PI) * 24);
      const R = Math.sin(t * Math.PI) ** 0.8 * 7.6 * (t < 0.5 ? 1 : -1);
      const X = Math.round(c + ca * R), Z = Math.round(c + sa * R), col = i % 9 === 0 ? 0xf2f6fa : 0xb8c0ca;
      g.set(X, Math.max(0, Y), Z, col); g.set(X, Math.max(0, Y) + 1, Z, i % 9 === 0 ? 0xf2f6fa : 0x8a96a8); // two voxels thick: reads at a glance
    }
  }
  // the ferrule and handle
  for (let y = 25; y < 29; y++) ring(g, c, c, 2.6, -1, y, y + 1, 0xc8a040);
  for (let y = 29; y < 52; y++) ring(g, c, c, y < 49 ? 2.2 + Math.sin((y - 29) * 0.3) * 0.5 : 2.8, -1, y, y + 1, (x, yy, z, d, a) => jit(Math.cos(a - 2.2) > 0.4 ? 0xb88850 : WOOD, x, yy, z, 3, 0.05));
  return vmesh(g, [c, 0, c], { scale: FS });
}

/** A round sieve: a bentwood rim and a mesh floor of crossed hairs. Origin at the mesh centre. */
export function sieve() {
  const R = 18, g = new VoxelGrid(R * 2 + 14, 9, R * 2 + 2), cx = R + 1, cz = R + 1;
  ring(g, cx, cz, R, R - 1.6, 1, 9, (x, y, z, d, a) => jit(y === 8 ? 0xc8945a : y < 3 ? WOOD_D : WOOD, x, y, z, 2, 0.06));
  ring(g, cx, cz, R - 1.6, -1, 1, 2, (x, y, z) => ((x + z) % 2 === 0 ? 0xd8ccb0 : -1));
  ring(g, cx, cz, R - 1.6, -1, 1, 2, (x, y, z) => ((x % 3 === 0 || z % 3 === 0) ? 0xb8ac90 : undefined));
  // a handle sticking out to +x
  g.box(R * 2 + 1, 4, cz - 1, 12, 3, 3, WOOD);
  g.box(R * 2 + 9, 4, cz - 1, 3, 3, 3, WOOD_D);
  return vmesh(g, [cx, 1, cz], { scale: FS });
}

/** A stone nut, whole or as one cracked half (cup up) with its kernel. Origin at the centre. */
export function stoneNut(part = 'whole') {
  const g = new VoxelGrid(22, 20, 22), c = 11;
  const shellC = (x, y, z) => {
    const r = Math.sin((y + Math.sin(x * 0.9) * 1.6) * 0.95 + (x < c ? 0 : 1.7));
    return jit(r > 0.8 ? 0xb89a72 : r < -0.85 ? 0x6a5236 : 0x9a7a56, x, y, z, 6, 0.05);
  };
  if (part === 'whole') {
    g.ellipsoid(c, 10, c, 9, 9.4, 8.4, shellC);
    for (let y = 2; y < 19; y++) g.set(c, y, c + 8, 0x5a4430); // the seam
    return vmesh(g, [c, 10, c], { scale: FS });
  }
  g.ellipsoid(c, 10, c, 9, 9.4, 8.4, (x, y, z) => (y > 10 ? -1 : shellC(x, y, z)));
  g.ellipsoid(c, 10, c, 7.4, 8, 7, (x, y, z) => (y > 10 ? -1 : y > 5 ? jit(0xeed4a0, x, y, z, 2, 0.05) : 0xd8b880));
  for (let z = 0; z < 22; z++) for (let x = 0; x < 22; x++) if (Math.hypot(x - c, z - c) < 6.6) g.set(x, 11, z, (x + z) % 5 ? 0xf2dcaa : 0xd8b880);
  return vmesh(g, [c, 10, c], { scale: FS });
}

/** A rock-salt geode: rough grey outside; split, a cave of pink-white cubes. Origin at the centre. */
export function saltGeode(part = 'whole') {
  const g = new VoxelGrid(26, 24, 26), c = 13;
  const rock = (x, y, z) => jit(((x * 5 + y * 3 + z * 7) % 13 === 0) ? 0x9a948a : (y + x) % 9 === 0 ? 0x5a564e : 0x7a746a, x, y, z, 8, 0.08);
  if (part === 'whole') {
    g.ellipsoid(c, 11, c, 11.4, 10.6, 10.6, rock);
    for (let i = 0; i < 9; i++) g.set(c - 4 + i, 12 + (i % 3) - 1, c + 10, 0x4a463e); // a crack line
    return vmesh(g, [c, 11, c], { scale: FS });
  }
  g.ellipsoid(c, 11, c, 11.4, 10.6, 10.6, (x, y, z) => (y > 11 ? -1 : rock(x, y, z)));
  // the crystal lining: little cubes standing in, pink to white, a lit facet on each
  for (let z = 0; z < 26; z++) for (let y = 3; y <= 11; y++) for (let x = 0; x < 26; x++) {
    const d = Math.hypot((x - c) / 8.6, (y - 11) / 8.4, (z - c) / 8.2);
    if (d < 0.78) { g.clear(x, y, z); continue; }
    if (d > 1.0) continue;
    const h = ((x * 13 + y * 7 + z * 5) % 11) / 11;
    g.set(x, y, z, h < 0.3 ? 0xffffff : h < 0.6 ? 0xf6e2e2 : h < 0.85 ? 0xe8c6c8 : 0xc8a2a8);
  }
  return vmesh(g, [c, 11, c], { scale: FS });
}

/** Froth in the bowl: a lumpy dome of foam voxels, `k` 0..1 how high it has risen. Origin bottom centre. */
export function foam(k, color = 0xfff4d8) {
  const R = 20, H = Math.max(1, Math.round(2 + k * 9)), g = new VoxelGrid(R * 2 + 1, H + 2, R * 2 + 1);
  for (let z = 0; z <= R * 2; z++) for (let x = 0; x <= R * 2; x++) {
    const d = Math.hypot(x - R, z - R) / R;
    if (d > 1) continue;
    const h = Math.round(H * (1 - d * d) + ((x * 7 + z * 13) % 5 === 0 ? 1 : 0));
    for (let y = 0; y < h; y++) g.set(x, y, z, y === h - 1 ? ((x * 3 + z * 5) % 7 === 0 ? 0xffffff : mixHex(color, 0xffffff, 0.35)) : color);
  }
  return vmesh(g, [R + 0.5, 0, R + 0.5], { scale: FS });
}

/** A heap of something poured (flour under the sieve, powder in the mortar): k 0..1 its size. */
export function heap(k, color = 0xf6eedc, r = 16) {
  const R = Math.max(2, Math.round(r * (0.35 + 0.65 * k))), H = Math.max(1, Math.round(R * 0.55)), g = new VoxelGrid(R * 2 + 1, H + 1, R * 2 + 1);
  for (let z = 0; z <= R * 2; z++) for (let x = 0; x <= R * 2; x++) {
    const d = Math.hypot(x - R, z - R) / R;
    if (d > 1) continue;
    const h = Math.max(1, Math.round(H * (1 - d) ** 0.8));
    for (let y = 0; y < h; y++) g.set(x, y, z, jit(y === h - 1 ? mixHex(color, 0xffffff, 0.2) : shade(color, 0.92), x, y, z, 4, 0.04));
  }
  return vmesh(g, [R + 0.5, 0, R + 0.5], { scale: FS });
}

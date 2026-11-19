// The player mole's work gloves (wave 17, the player: "make your hand wear a glove, never show a bare
// hand"): thick tan leather smithing/mining gloves. Stitched seams, a darker gauntlet cuff with a
// strap and a brass buckle, oiled knuckle patches worn pale on the tops, soot and scuffs, and the
// fingertips cut open so the claws poke out. One palette and a few painters, shared by every
// builder that draws the player's paws:
//   3D  fps/viewmodel/parts.js (first-person fist + open paw), char/paw.js (the cooking paws),
//       char/limbs.js (the third-person rig: title, journey, cutscenes, portraits)
//   2D  ui/oreLoader.js (loading screen), ui/touchArt.js, ui/Onboard.js, ui/skillIcons.js
// Equipped hand gear (rubber gloves, ember mitts...) does not change the paws' look yet; when it
// does, draw it over these (the work glove is the base layer).
import { mix, h3, PX, NX, PY, NY, PZ, NZ } from './vox.js';
import { VOX_RULE_ON, refineSteps, voxelSizeFor } from '../voxRes.js';

/** Ramps, darkest first. */
export const GLOVE = Object.freeze({
  hide: [0x24140a, 0x382012, 0x4e2e19, 0x684022, 0x84542c, 0x9e6a38, 0xb88248, 0xd09e62, 0xe4bc84], // tan work leather
  cuff: [0x150c07, 0x21130b, 0x2f1b10, 0x3e2416, 0x50301d, 0x623c24, 0x784c2e], // the darker gauntlet
  patch: [0x20130b, 0x311d12, 0x452a1a, 0x5b3a24, 0x734c30, 0x8e6242, 0xab7e5a, 0xc89e7a], // oiled knuckle patches
  strap: [0x100906, 0x1c110a, 0x2a1910, 0x3a2416, 0x4c311e],
  brass: [0x3e2808, 0x6a4814, 0x9c7024, 0xc89a36, 0xe6be52, 0xf8de8a, 0xfff6cc],
  thread: [0x7a6a4c, 0xb0a07c, 0xd8c8a0, 0xf2e6c6],
  soot: 0x161212,
  scuff: 0xe0c49a,
});

/** Filled neighbours among the 18 face + edge neighbours (a cheap ambient-occlusion probe). */
export function around(v, x, y, z) {
  let n = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const a = (dx !== 0) + (dy !== 0) + (dz !== 0);
    if (a === 0 || a === 3) continue;
    if (v.has(x + dx, y + dy, z + dz)) n++;
  }
  return n;
}

/** Smooth value noise in [0, 1) on cells of `cell` voxels (soot blotches, wear). */
export function vn3(x, y, z, s, cell) {
  const fx = x / cell, fy = y / cell, fz = z / cell;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), sz = tz * tz * (3 - 2 * tz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => h3(ix + i, iy + j, iz + k, s);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), sx), L(c(0, 1, 0), c(1, 1, 0), sx), sy),
    L(L(c(0, 0, 1), c(1, 0, 1), sx), L(c(0, 1, 1), c(1, 1, 1), sx), sy), sz);
}

/** The bit for a face direction name ('+x' ...). */
export const FACE = { '+x': PX, '-x': NX, '+y': PY, '-y': NY, '+z': PZ, '-z': NZ };

/**
 * One leather voxel's colour. `v` the Vox (for the occlusion probe), e its exposure, o:
 *   ramp   GLOVE.hide | cuff | patch    k     base ramp index (float)
 *   up     exposure bit facing the light (+1)    down  bit facing away (-2); other sides -0.6
 *   seed   noise seed    soot 0..1 (sooty blotches)    wear 0..1 (pale scuffs, worn edges)
 *   grain  pebbled-hide strength (1)    s     voxel scale (1, 2 for a 2× finer build)
 */
export function leather(v, x, y, z, e, o) {
  const ramp = o.ramp || GLOVE.hide, s = o.s || 1, seed = o.seed || 0;
  let k = o.k ?? 4;
  if (e & o.up) k += 1;
  else if (e & o.down) k -= 2;
  else k -= 0.6;
  // pebbled hide: blotchy 2-voxel cells, a few darker pores
  const g = o.grain ?? 1;
  const cell = h3(Math.floor(x / (2 * s)), Math.floor(y / (2 * s)), Math.floor(z / (2 * s)), seed);
  if (cell < 0.16) k -= 0.5 * g; else if (cell > 0.88) k += 0.42 * g;
  if (h3(x, y, z, seed + 3) < 0.03 * g) k -= 0.8;
  // a little ambient occlusion in the creases; convex edges rubbed pale
  const n = around(v, x, y, z);
  if (n > 14) k -= Math.min(1, (n - 14) / 4) * 1.0;
  else if (n <= 9) k += 0.75 * (0.5 + (o.wear ?? 0.5));
  let c = ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(k)))];
  // soot: smooth dark blotches (thickest low on the glove, where it brushes the forge)
  const soot = o.soot ?? 0.5;
  if (soot > 0) {
    const b = vn3(x, y, z, seed + 11, 7 * s);
    if (b > 1 - soot * 0.55) c = mix(c, GLOVE.soot, b > 1 - soot * 0.3 ? 0.5 : 0.28);
  }
  // scuffs: short pale scratches across the grain
  const wear = o.wear ?? 0.5;
  if (wear > 0 && (e & o.up) && h3(Math.floor((x + z) / (2 * s)), Math.floor(y / (3 * s)), 0, seed + 17) < 0.06 * wear) c = mix(c, GLOVE.scuff, 0.4);
  return c;
}

/**
 * A running stitch along a seam over leather colour c: t is the position along it (voxels), dash
 * the stitch length. Pale thread (lit at its leading end), then a dark needle hole, then the hide.
 */
export function stitch(c, t, dash = 2) {
  const p = ((Math.floor(t) % (dash * 2)) + dash * 2) % (dash * 2);
  if (p < dash) return mix(GLOVE.thread[p === 0 ? 3 : 2], c, 0.3); // (waxed thread, a little dulled)
  return p === dash ? mix(c, GLOVE.soot, 0.45) : c;
}

/** Brass (a buckle, a rivet): k 0..6, lit or shaded. */
export const brass = (k) => GLOVE.brass[Math.max(0, Math.min(6, Math.round(k)))];

/**
 * The size rule (gfx/voxRes.js) for a glove on a character: how many 2× steps finer than the body's
 * voxels (vs, world units) the glove is built. ext: the glove's extent in body voxels, bodyH: the
 * character's height. A glove is a small thing (the finest class) on a furniture-sized body, so it
 * goes a step finer than the body whenever its class is finer; at most one step (faces stay cheap).
 */
export function gloveSteps(vs, ext, bodyH) {
  if (!VOX_RULE_ON) return 0;
  const L = ext * vs;
  return Math.min(1, Math.max(refineSteps(L, vs), voxelSizeFor(L) < voxelSizeFor(bodyH) ? 1 : 0));
}

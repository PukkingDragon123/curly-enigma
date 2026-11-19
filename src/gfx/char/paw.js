// The first-person mole paw (seen huge in the cooking scene): furry forearm, and a broad paw in a
// thick leather work glove (wave 17, gfx/char/glove.js): tan hide with stitched seams, an oiled
// knuckle patch rubbed pale on top, a darker flared gauntlet with a strap and a brass buckle, soot
// and scuffs, and five stubby fingers whose tips are cut open so the big pale digging claws (dirt
// under them) poke out. Pivot at the back of the forearm; fingers point +z, the back of the paw
// faces +y. Same footprint as the classic 14×10×22 paw at twice the resolution.
import * as THREE from 'three';
import { Vox, mix, lt, h3, furColor, cached, partMesh, PY, NY, PZ, NZ, PX, NX } from './vox.js';
import { CLAW } from './spec.js';
import { GLOVE, leather, stitch, brass, around } from './glove.js';

const V16 = 1 / 16;
const UP = { up: PY, down: NY };

function pawGeo(fur, sleeve, bake) {
  return cached(`fpaw-glove|${fur}|${sleeve}|${bake}`, () => {
    const v = new Vox(-15, 15, -12, 12, 0, 50);
    // forearm (fur or sleeve), slightly flattened capsule along z
    v.fill(-9, 9, -8, 8, 0, 26, (x, y, z) => (x * x) / 64 + ((y + 0.5) * (y + 0.5)) / 42 <= 1, 0, 1);
    // a ruff of fur spilling out of the gauntlet's open end
    v.fill(-11, 11, -10, 10, 12, 19, (x, y, z) => {
      const a = Math.atan2(y, x);
      const tuft = (Math.floor((a + 4) * 3.2) & 1) ? 1.6 : 0;
      const r = (x * x) / 96 + ((y + 0.5) * (y + 0.5)) / 74;
      return r <= 1 && z > 15.5 - tuft;
    }, 0, 2);
    // the gauntlet: a flared leather shell from the open end (z 17) to the paw, a rolled rim
    const gx = (x, z) => 10.9 + Math.max(0, 22 - z) * 0.14, gy = (y, z) => 9.9 + Math.max(0, 22 - z) * 0.13;
    const shell = (x, y, z, grow = 0) => {
      const qx = x / (gx(x, z) + grow), qy = (y + 1) / (gy(y, z) + grow), r = qx * qx + qy * qy; // (voxel centres)
      return r <= 1 && r >= 0.62;
    };
    v.fill(-14, 14, -12, 12, 17, 30, (x, y, z) => shell(x, y, z), 0, 7);
    v.fill(-14, 14, -12, 12, 17, 19, (x, y, z) => shell(x, y, z, 0.8), 0, 7); // the rolled rim
    v.fill(-14, 14, -12, 12, 22, 25, (x, y, z) => shell(x, y, z, 0.9), 0, 8); // the strap
    // the buckle on top (+y), a brass frame and prong, the strap's tongue tucked on past it
    for (let x = -3; x <= 3; x++) for (let z = 21; z <= 26; z++) {
      const frame = Math.abs(x) === 3 || z === 21 || z === 26, prong = x === 0 && z >= 22 && z <= 25;
      if (frame || prong) { v.setM(x, 10, z, 9); if (frame) v.setM(x, 11, z, 9); }
    }
    for (let x = 4; x <= 8; x++) for (let z = 22; z <= 25; z++) {
      if (x === 8 && (z === 22 || z === 25)) continue;
      let y = 11;
      while (y > 0 && v.m(x, y, z) !== 8) y--;
      if (y > 0) v.setM(x, y + 1, z, 8);
    }
    for (const a of [0.7, Math.PI - 0.7]) v.setM(Math.round(Math.cos(a) * 11.3 - 0.5), Math.round(Math.sin(a) * 10.3 - 1), 20, 9); // rivets by the rim
    // broad paw: wide, flat, rounded (thick hide)
    v.ell(0, -2.2, 31.5, 12, 6.2, 7.9, 0, 3, 2.6);
    // knuckle ridge, under an oiled patch
    for (const fx of [-9, -4.5, 0, 4.5, 9]) v.ell(fx, 1.4, 35.4, 2.6, 1.8, 2.4, 0, 6);
    // five stubby fingers fanning out slightly, each with a soft pad underneath; the tips cut open
    const fingers = [[-9.4, -0.1], [-4.7, -0.04], [0, 0], [4.7, 0.04], [9.4, 0.1]];
    for (const [fx, fan] of fingers) {
      for (let k = 0; k <= 6; k++) {
        const z = 35.5 + k, x = fx + fan * k * 4;
        v.ell(x, -2.2 - k * 0.12, z, 2.45, 2.55, 1.4, 0, k >= 5 ? 10 : 4);
      }
      // the claw: a thick, hooked nail that scoops down past the fingertip
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const z = 41.2 + t * 5.4, y = -1 - t * t * 4.6, x = fx + fan * (24 + k * 2.5);
        const r = 1.95 * (1 - t * 0.66) + 0.3;
        v.ell(x, y, z, r, r * 0.8, 1, 0, 5);
      }
    }
    const fC = fur, sC = sleeve ?? fur;
    v.resolve({
      1: (x, y, z, e) => (sleeve != null ? (z % 6 === 0 ? mix(sC, 0x1c1024, 0.1) : sC) : furColor(fC, x, z, y, e & PY ? PX : PZ, 31, 1.3)),
      2: (x, y, z, e) => {
        let c = lt(fC, 0.1);
        c = furColor(c, x, z, y, e & PY ? PX : PZ, 32, 1.4);
        if (z <= 14) c = lt(c, 0.1); // sunlit tuft tips
        return c;
      },
      3: (x, y, z, e) => {
        let c = leather(v, x, y, z, e, { ...UP, k: 4.5, seed: 41, soot: 0.45, wear: 0.6 });
        const ax = Math.abs(x + 0.5);
        if (e & PY) {
          if (z >= 32 && z <= 33 && ax < 11) c = stitch(c, x, 2); // the knuckle patch's back seam
          else if (z > 26 && z < 32 && Math.abs(ax - 3.5) < 0.6) c = stitch(c, z, 2); // the points down the back
          else if (z === 27 || z === 28) c = stitch(c, x, 2); // sewn to the gauntlet
        }
        if ((e & NY) && z > 27 && z < 37 && ax < 9) { // the reinforced palm
          c = leather(v, x, y, z, e, { ...UP, ramp: GLOVE.patch, k: 4.4, seed: 42, soot: 0.6, wear: 0.4 });
          if (z === 28 || z === 36 || ax >= 8.5) c = stitch(c, z === 28 || z === 36 ? x : z, 2);
        }
        if (h3(x >> 1, z >> 1, 3, 7) < 0.06 && (e & PY)) c = mix(c, 0x5a4028, 0.35); // dirt
        return c;
      },
      4: (x, y, z, e) => {
        let c = leather(v, x, y, z, e, { ...UP, k: 4.6, seed: 43, soot: 0.55, wear: 0.7 });
        if ((e & (PX | NX)) && !(e & PY) && !(e & NY) && (x & 1)) c = stitch(c, z, 1); // finger seams
        return c;
      },
      5: (x, y, z, e) => {
        let c = CLAW;
        if (e & PY) c = lt(c, 0.35);
        if ((e & NY) || ((e & (PX | NX)) && !(e & PY))) c = mix(c, 0xb0a080, 0.45);
        if (z < 44.5 && (e & NY)) c = 0x5a4028; // dirt under the claws, of course
        if (z < 42.2 && (e & PY)) c = mix(c, 0x8a7a60, 0.35); // shadowed where it leaves the glove
        return c;
      },
      6: (x, y, z, e) => {
        let c = leather(v, x, y, z, e, { ...UP, ramp: GLOVE.patch, k: 4.8, seed: 44, soot: 0.2, wear: 1 });
        if ((e & PY) && y >= 2) c = mix(c, GLOVE.patch[7], 0.4 + (h3(x, z, 0, 45) < 0.3 ? 0.25 : 0)); // rubbed pale
        if ((e & PY) && (z === 33 || z === 37)) c = stitch(c, x, 2);
        return c;
      },
      7: (x, y, z, e) => {
        let c = leather(v, x, y, z, e, { ...UP, ramp: GLOVE.cuff, k: 3.6, seed: 46, soot: 0.75, wear: 0.6 });
        if (z <= 18) { c = leather(v, x, y, z, e, { ...UP, ramp: GLOVE.cuff, k: 5, seed: 47, soot: 0.3, wear: 1 }); if (e & PZ) c = GLOVE.cuff[1]; }
        else if (z === 19) c = stitch(c, Math.atan2(y, x) * 11, 2);
        else if (Math.abs(x + 0.5 + 6) < 0.6 && (e & PY)) c = stitch(c, z, 2); // the side seam
        if (z >= 29) c = mix(c, GLOVE.soot, 0.3); // tucked under the glove
        return c;
      },
      8: (x, y, z, e) => {
        let c = leather(v, x, y, z, e, { ...UP, ramp: GLOVE.strap, k: 2.7, seed: 48, soot: 0, wear: 0.8, grain: 0.4 });
        if (z === 22 || z === 25) c = mix(c, GLOVE.thread[1], 0.25);
        return c;
      },
      9: (x, y, z, e) => brass((e & PY ? 5 : e & NY ? 1.5 : 3.4) + (h3(x, y, z, 49) < 0.25 ? -1 : 0) + (around(v, x, y, z) <= 8 ? 1 : 0)),
      10: (x, y, z, e) => {
        // the cut-open fingertip: a pale rolled edge, dark where the claw comes out
        const near = v.m(x, y, z + 1) === 5 || v.m(x + 1, y, z) === 5 || v.m(x - 1, y, z) === 5 || v.m(x, y + 1, z) === 5 || v.m(x, y - 1, z) === 5;
        if (near) return GLOVE.cuff[1];
        return leather(v, x, y, z, e, { ...UP, k: 5.6, seed: 50, soot: 0.2, wear: 1, grain: 0.5 });
      },
    });
    return v.geometry(bake);
  });
}

/** A big mole paw for first-person views. side: -1 left, 1 right. Pivot at the wrist end of the forearm. */
export function makePaw(side = 1, opts = {}) {
  const vs = (opts.scale ?? 1) * V16 / 2;
  const kind = opts.kind || 'toon';
  const mesh = partMesh(pawGeo(opts.fur ?? 0x3a2e2a, opts.sleeve ?? null, kind === 'basic'), kind, vs);
  if (side < 0) mesh.scale.x = -vs;
  const root = new THREE.Group();
  root.add(mesh);
  return root;
}

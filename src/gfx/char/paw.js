// The first-person mole paw (seen huge in the cooking scene): furry forearm, a fluffy cuff,
// a broad pink paw with knuckles and creases, five stubby fingers and big pale digging claws
// with dirt under them. Pivot at the back of the forearm; fingers point +z, the back of the
// paw faces +y. Same footprint as the classic 14×10×22 paw at twice the resolution.
import * as THREE from 'three';
import { Vox, mix, dk, lt, h3, furColor, cached, partMesh, PY, NY, PZ, PX, NX } from './vox.js';
import { SKIN_PINK, CLAW } from './spec.js';

const V16 = 1 / 16;

function pawGeo(fur, sleeve, bake) {
  return cached(`fpaw|${fur}|${sleeve}|${bake}`, () => {
    const v = new Vox(-15, 15, -11, 11, 0, 50);
    // forearm (fur or sleeve), slightly flattened capsule along z
    v.fill(-9, 9, -8, 8, 0, 26, (x, y, z) => (x * x) / 64 + ((y + 0.5) * (y + 0.5)) / 42 <= 1, 0, 1);
    // fluffy fur cuff with tufts reaching toward the paw
    v.fill(-11, 11, -10, 10, 19, 28, (x, y, z) => {
      const a = Math.atan2(y, x);
      const tuft = (Math.floor((a + 4) * 3.2) & 1) ? 1.4 : 0;
      const r = (x * x) / 92 + ((y + 0.5) * (y + 0.5)) / 70;
      return r <= 1 && z < 25.5 + tuft;
    }, 0, 2);
    // broad paw: wide, flat, rounded
    v.ell(0, -2.2, 31.5, 11.6, 5.8, 7.6, 0, 3, 2.6);
    // knuckle ridge
    for (const fx of [-9, -4.5, 0, 4.5, 9]) v.ell(fx, 1.2, 35.4, 2.4, 1.6, 2.2, 0, 3);
    // five stubby fingers fanning out slightly, each with a soft pad underneath
    const fingers = [[-9.4, -0.1], [-4.7, -0.04], [0, 0], [4.7, 0.04], [9.4, 0.1]];
    for (const [fx, fan] of fingers) {
      for (let k = 0; k <= 6; k++) {
        const z = 35.5 + k, x = fx + fan * k * 4;
        v.ell(x, -2.2 - k * 0.12, z, 2.2, 2.3, 1.4, 0, 4);
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
      1: (x, y, z, e) => (sleeve != null ? (z % 6 === 0 ? dk(sC, 0.1) : sC) : furColor(fC, x, z, y, e & PY ? PX : PZ, 31, 1.3)),
      2: (x, y, z, e) => {
        let c = lt(fC, 0.08);
        c = furColor(c, x, z, y, e & PY ? PX : PZ, 32, 1.4);
        if (z >= 25) c = lt(c, 0.1);
        return c;
      },
      3: (x, y, z, e) => {
        let c = SKIN_PINK;
        if (e & PY) {
          c = lt(c, 0.06);
          // creases between the fingers and across the knuckles
          const ax = Math.abs(x + 0.5);
          if (z > 31 && (Math.abs(ax - 2.3) < 0.6 || Math.abs(ax - 6.8) < 0.6)) c = dk(c, 0.14);
          if (z === 33 && ax < 10) c = dk(c, 0.08);
          if (h3(x >> 1, z >> 1, 3, 7) < 0.08) c = mix(c, 0x6a4a30, 0.35); // dirt
          if (x < -4 && x > -9 && z > 27 && z < 31) c = lt(c, 0.18); // sheen
        }
        if (e & NY) c = mix(c, 0xd87a8a, 0.5); // pads underneath
        return c;
      },
      4: (x, y, z, e) => {
        let c = SKIN_PINK;
        if (e & PY) c = lt(c, z > 40 ? 0.04 : 0.1);
        if (e & NY) c = mix(c, 0xd87a8a, 0.6);
        if ((e & (PX | NX)) && !(e & PY)) c = dk(c, 0.1);
        return c;
      },
      5: (x, y, z, e) => {
        let c = CLAW;
        if (e & PY) c = lt(c, 0.35);
        if ((e & NY) || ((e & (PX | NX)) && !(e & PY))) c = mix(c, 0xb0a080, 0.45);
        if (z < 44.5 && (e & NY)) c = 0x5a4028; // dirt under the claws, of course
        if (z < 42.2 && (e & PY)) c = mix(c, 0xc8a890, 0.4); // nail bed
        return c;
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

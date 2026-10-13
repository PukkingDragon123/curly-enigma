// Hi-res limbs. Arms hang from the shoulder pivot (origin) along -y and end in paws: the
// moles' huge pink spade paws with five pale claws, or small hands. Legs hang from the hip
// joint and end in feet with toes. Built for the +x side; the left side mirrors via scale.x.
import { Vox, mix, dk, lt, lum, h3, furColor, cached, PY, NY, PZ, NZ, PX, NX } from './vox.js';
import { SKIN_PINK, CLAW, DIGGERS, PATCH_COLORS } from './spec.js';
import { pantsColor, sleeveColor } from './body.js';

const THREAD = 0xf0e4c4;

function pawColor(sp, fur) {
  if (DIGGERS.has(sp)) return sp === 'golden' ? 0xe0a890 : SKIN_PINK;
  if (sp === 'frog') return mix(fur, 0xf0f0c0, 0.3);
  if (sp === 'fox' || sp === 'badger') return 0x2a2224;
  if (sp === 'hedgehog' || sp === 'armadillo' || sp === 'rabbit') return mix(fur, 0xe8a8a8, 0.35);
  return dk(fur, 0.12);
}

/** Arm geometry: { geo, socket:[x,y,z] } (voxels, relative to the shoulder pivot). */
export function buildArm(spec, p, bake) {
  const sp = spec.species;
  const fur = spec.fur;
  const sleeve = sleeveColor(spec);
  const dirt = Math.round((spec.dirt ?? 0.4) * 4);
  const key = `arm|${sp}|${fur}|${sleeve}|${spec.outfit}|${p.ah}|${spec.age}|${dirt}|${bake}`;
  return cached(key, () => {
    const ah = p.ah * 2; // arm length in voxels
    const big = DIGGERS.has(sp);
    const v = new Vox(-8, 10, -ah - 14, 4, -7, 9);
    const darkFur = lum(fur) < 0.3;
    const seed = 41;
    const pawC = pawColor(sp, fur);
    // upper arm (fur or sleeve): a soft capsule from the shoulder down
    const armBot = -ah + 2;
    const short = spec.outfit === 'dress';
    v.fill(-4, 4, armBot - 1, 3, -4, 4, (x, y, z) => {
      // tapered capsule: rounded shoulder at the top, slimmer toward the wrist
      const yc = Math.max(armBot, Math.min(-0.8, y));
      const t = (-0.8 - yc) / (-0.8 - armBot);
      const r = 2.75 - t * 0.45;
      return x * x + (y - yc) * (y - yc) + z * z * 1.05 <= r * r;
    }, (x, y, z) => {
      const onSleeve = sleeve !== null && (!short || y > armBot + (ah - 2) * 0.55);
      if (onSleeve) {
        let c = sleeve;
        const cuffY = short ? Math.round(armBot + (ah - 2) * 0.55) : armBot + 1;
        if (y <= cuffY + 1 && y >= cuffY) c = spec.outfit === 'suit' ? 0xf4efe4 : lt(sleeve, 0.2);
        if (short && y === cuffY + 2) c = lt(sleeve, 0.1);
        return c;
      }
      const e = (x >= 2 ? PX : 0) | (x <= -3 ? NX : 0) | (z >= 2 ? PZ : 0) | (z <= -3 ? NZ : 0);
      return furColor(fur, x, y, z, e || PZ, seed, darkFur ? 1.2 : 1);
    });
    // puffed sleeve for dresses
    if (short && sleeve !== null) v.ell(0, 0, 0, 3.8, 3, 3.8, (x, y) => (y < -1 ? lt(sleeve, 0.1) : sleeve));

    let socket;
    if (big) {
      // the spade paw: broad, flat and pink, ending in five pale claws
      const pcx = 0.7, pcy = -ah - 0.4, pcz = 0.5;
      v.ell(pcx, pcy, pcz, 5, 3.4, 3, 0, 1, 2.5);
      // finger knuckles along the bottom edge
      const fingers = [-4, -2, 0, 2, 4];
      for (const fx of fingers) v.ell(pcx + fx, pcy - 2.7, pcz + 0.7, 1.05, 1.4, 2, 0, 4);
      // furry wrist cuff
      v.ell(0, armBot + 0.5, 0, 3.4, 1.5, 3.4, (x, y, z) => (sleeve !== null && !short ? lt(sleeve, 0.2) : furColor(lt(fur, 0.06), x, y, z, PZ, seed + 1)));
      const clawC = sp === 'molerat' ? 0xf0dcb0 : CLAW;
      fingers.forEach((fx, i) => {
        const cx = pcx + fx;
        const len = i === 2 ? 3.4 : i === 0 || i === 4 ? 2.4 : 3;
        const y0 = pcy - 3.4, z0 = pcz + 1.2;
        // claw: curving forward to a point
        v.line(cx, y0, z0, cx, y0 - len * 0.65, z0 + len * 0.55, 0, 0.62, 2);
        v.line(cx, y0 - len * 0.65, z0 + len * 0.55, cx, y0 - len * 0.9, z0 + len * 1.1, 0, 0.5, 3);
      });
      v.resolve({
        1: (x, y, z, e) => {
          let c = pawC;
          if (e & PY) c = lt(c, 0.12);
          if (e & NY) c = dk(c, 0.1);
          // palm pads on the inner side
          if ((e & NZ) && y < pcy + 1) c = dk(c, 0.07);
          if (dirt > 1 && h3(x >> 1, y >> 1, z, 77) < dirt * 0.06) c = mix(c, 0x6a4a30, 0.4);
          return c;
        },
        4: (x, y, z, e) => {
          let c = dk(pawC, 0.04);
          if (e & PY) c = lt(c, 0.08);
          if (dirt > 2 && (e & NY)) c = mix(c, 0x6a4a30, 0.35);
          return c;
        },
        2: (x, y, z, e) => ((e & NY) || (e & NZ) ? mix(clawC, 0xb8a888, 0.45) : (e & (PX | NX)) && !(e & PZ) ? mix(clawC, 0xc8b8a0, 0.3) : clawC),
        3: (x, y, z, e) => (dirt > 2 ? mix(clawC, 0x6a4a30, 0.45) : (e & PZ) ? lt(clawC, 0.3) : clawC),
      });
      socket = [0, -(p.ah + 1) * 2, 2];
    } else {
      // small paw / hand
      const pcy = -ah - 0.5;
      v.ell(0.3, pcy, 0.4, 3.4, 3, 3.2, 0, 1, 2.4);
      if (sp === 'frog') for (const dx of [-2, 0, 2]) v.ell(0.3 + dx, pcy - 2.6, 1.6, 1.1, 0.9, 1.3, 0, 1);
      else for (const dx of [-1.6, 0, 1.6]) v.ell(0.3 + dx, pcy - 2.2, 1.8, 0.9, 0.9, 1, 0, 1);
      v.resolve({
        1: (x, y, z, e) => {
          let c = pawC;
          if (e & PY) c = lt(c, 0.1);
          if ((e & PZ) && y < pcy - 1.5 && (x === -1 || x === 1)) c = dk(c, 0.15);
          if (dirt > 1 && h3(x, y, z, 78) < dirt * 0.06) c = mix(c, 0x6a4a30, 0.4);
          return c;
        },
      });
      socket = [0, -(p.ah + 1) * 2, 2];
    }
    return { geo: v.geometry(bake), socket };
  });
}

/** Leg geometry (origin at the hip joint, foot at y = -(lh+1)*2). side ±1 picks the knee patch. */
export function buildLeg(spec, p, side, bake) {
  const sp = spec.species;
  const fur = spec.fur;
  const pants = pantsColor(spec);
  const dirt = Math.round((spec.dirt ?? 0.4) * 4) / 4; // quantized like the cache key
  const patch = side < 0 && (spec.patches || 0) > 0 && pants !== null;
  const cuffs = spec.outfit === 'overalls';
  const key = `leg|${sp}|${fur}|${pants}|${p.lh}|${spec.body}|${Math.round(dirt * 4)}|${patch ? spec.seed % 7 : 0}|${cuffs}|${bake}`;
  return cached(key, () => {
    const L = p.lh * 2; // leg length (hip joint → ankle)
    const v = new Vox(-6, 6, -L - 5, 3, -6, 9);
    const wide = spec.body === 'chubby' || spec.body === 'stocky' ? 3.4 : spec.body === 'slim' ? 2.6 : 3;
    const darkFur = lum(fur) < 0.3;
    const foot = DIGGERS.has(sp) ? (sp === 'golden' ? 0xe0a890 : SKIN_PINK) : sp === 'fox' || sp === 'badger' ? 0x2a2224 : sp === 'frog' ? mix(fur, 0xf0f0c0, 0.25) : dk(fur, 0.18);
    // leg
    v.fill(-5, 5, -L - 1, 3, -5, 5, (x, y, z) => x * x + z * z <= wide * wide && y < 2.5, (x, y, z) => {
      // pants with an outer side seam
      if (pants !== null) return x >= Math.floor(wide) - 0.5 && Math.abs(z + 0.5) < 1 ? dk(pants, 0.16) : pants;
      return furColor(fur, x, y, z, PZ, 61, darkFur ? 1.2 : 1);
    });
    // rolled denim cuffs
    if (cuffs && pants !== null) v.fill(-5, 5, -L - 1, -L + 2, -5, 5, (x, y, z) => x * x + z * z <= (wide + 0.9) ** 2 && y > -L - 0.4 && y < -L + 2, (x, y) => (y >= -L + 1 ? lt(pants, 0.3) : lt(pants, 0.18)));
    // foot: a rounded slipper shape with toes
    const fy = -L - 1;
    v.ell(0, fy, 1.4, wide + 0.6, 1.9, 4.4, 0, 1, 2.4);
    for (const dx of [-2, 0, 2]) v.ell(dx * 0.95, fy - 0.4, 5.2, 1.2, 1.2, 1.2, 0, 1);
    v.carve(-6, 6, -L - 5, fy - 1, -6, 9, (x, y) => y < fy - 1);
    const kneeY = Math.round(-L * 0.45);
    v.resolve({
      1: (x, y, z, e) => {
        let c = foot;
        if (e & PY) c = lt(c, 0.1);
        if ((e & NY) || y <= fy - 1) c = dk(c, 0.18);
        // little claws on the toes
        if (z >= 6 && y <= fy && DIGGERS.has(sp)) c = CLAW;
        if (dirt > 0.4 && (e & PY) && z > 2 && ((x + z) & 1)) c = mix(c, 0x5a4028, 0.35 * dirt);
        return c;
      },
    });
    // knee patch, grime toward the cuffs
    v.paint((x, y, z, c) => {
      const isPants = pants !== null && y > fy + 1 && c !== foot;
      if (patch && isPants && z >= 1 && Math.abs(y - kneeY) <= 2 && x >= -2 && x <= 1) {
        const edge = Math.abs(y - kneeY) === 2 || x === -2 || x === 1;
        const pc = PATCH_COLORS[(spec.seed | 0) % PATCH_COLORS.length];
        return edge ? ((x + y) % 2 ? THREAD : dk(pc, 0.1)) : pc;
      }
      // grime at the cuffs: a smooth band with a dithered top edge
      const gTop = -L + 1 + dirt * 2.5;
      if (y > fy + 1 && y < gTop && (y < gTop - 1 || ((x + y + z) & 1))) return mix(c, 0x4a3420, 0.22 + dirt * 0.18);
      // a scuffed knee
      const kd = Math.hypot(x + 0.5, (y + 0.5 - kneeY) * 1.2);
      if (dirt > 0.3 && z >= 1 && kd < 2.2 && (kd < 1.4 || ((x + y) & 1))) return mix(c, darkFur || pants === null ? 0x8a6a48 : 0x4a3420, 0.25 + dirt * 0.2);
      return undefined;
    });
    return { geo: v.geometry(bake) };
  });
}

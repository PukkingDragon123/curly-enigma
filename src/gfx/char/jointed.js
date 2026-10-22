// Jointed limbs for the tall build (proportions(spec, {build: 'tall'})): arms in two parts (upper
// arm on the shoulder, forearm + paw on the elbow) and legs in two parts (thigh on the hip, shin
// + foot on the knee), so grown-up folk bend their elbows and knees. More tailoring than the
// classic limbs: shoulder caps, sleeves with seams and buttoned cuffs or rolled up past the elbow,
// trouser creases and rolled denim cuffs, knee patches, laced work boots with thick soles, and
// detailed paws: the moles' pink spade paws with knuckles, pads and long claws, or small hands
// with a thumb, three fingers and nails. Built for the +x side; the left side mirrors via scale.x.
// Frames: 1 unit = 1 hi-res voxel; each part's origin is its joint, the limb hangs along -y.
import { Vox, mix, dk, lt, lum, h3, furColor, cached, PY, NY, PZ, NZ, PX, NX } from './vox.js';
import { SKIN_PINK, CLAW, DIGGERS, PATCH_COLORS } from './spec.js';
import { pantsColor, sleeveColor } from './body.js';

const THREAD = 0xf0e4c4;
const BRASS = 0xd8b048;

function pawColor(sp, fur) {
  if (DIGGERS.has(sp)) return sp === 'golden' ? 0xe0a890 : SKIN_PINK;
  if (sp === 'frog') return mix(fur, 0xf0f0c0, 0.3);
  if (sp === 'fox' || sp === 'badger') return 0x2a2224;
  if (sp === 'hedgehog' || sp === 'armadillo' || sp === 'rabbit') return mix(fur, 0xe8a8a8, 0.35);
  return dk(fur, 0.12);
}

/**
 * The two arm parts: { upper, lower, UA, FA, socket } (geometries in voxels; UA: shoulder → elbow,
 * FA: elbow → wrist; socket: the held-item point in the elbow frame).
 */
export function buildArmParts(spec, p, bake) {
  const sp = spec.species;
  const fur = spec.fur;
  const sleeve = sleeveColor(spec);
  const short = spec.outfit === 'dress';
  const rolled = sleeve !== null && !short && !!spec.rolled && spec.outfit !== 'suit';
  const dirt = Math.round((spec.dirt ?? 0.4) * 4);
  const k = p.limb || 1;
  const A = Math.round(p.ah * 2);
  const UA = Math.round(A * 0.5), FA = A - UA;
  const key = `jarm|${sp}|${fur}|${sleeve}|${spec.outfit}|${rolled}|${A}|${k}|${spec.age}|${dirt}|${bake}`;
  return cached(key, () => {
    const darkFur = lum(fur) < 0.3;
    const seed = 43;
    const big = DIGGERS.has(sp);
    const pawC = pawColor(sp, fur);
    const FUR = 1, SLV = 2, CUFF = 3, ROLL = 4, PAW = 5, KNUCK = 6, CLAWB = 7, CLAWT = 8, NAIL = 9, PAD = 10;
    const sleeveAt = (yAbs) => sleeve !== null && (!short || yAbs > -UA * 0.55) && (!rolled || yAbs > -UA + 1.5);
    const furPaint = (x, y, z, e) => furColor(fur, x, y, z, e || PZ, seed, darkFur ? 1.2 : 1);
    const slvPaint = (x, y, z, e) => {
      let c = sleeve;
      if ((e & NX) && !(e & (PZ | NZ))) c = dk(c, 0.1); // the inner seam
      if ((e & NZ) && Math.abs(x + 0.5) < 0.6) c = dk(c, 0.12); // the back seam
      if (e & PY) c = lt(c, 0.05);
      if (dirt > 2 && h3(x >> 1, y >> 1, z, 91) < 0.06 * dirt) c = mix(c, 0x5a4028, 0.3);
      return c;
    };

    // ---------------------------------------------------------------- upper arm
    const up = new Vox(-7, 8, -UA - 5, 6, -7, 7);
    up.fill(-7, 7, -UA - 4, 5, -7, 7, (x, y, z) => {
      const yc = Math.max(-UA - 0.5, Math.min(0.5, y));
      const t = (0.5 - yc) / (UA + 1);
      const r = (3.05 - 0.45 * t) * k;
      return x * x + (y - yc) * (y - yc) + z * z * 1.05 <= r * r;
    }, 0, (x, y) => (sleeveAt(y) ? SLV : FUR));
    // a rounded shoulder cap
    up.fill(-7, 7, -5, 4, -7, 7, (x, y, z) => ((x - 0.2) / (3.4 * k)) ** 2 + ((y + 0.6) / (2.9 * k)) ** 2 + (z / (3.2 * k)) ** 2 <= 1, 0, (x, y) => (sleeveAt(y) ? SLV : FUR));
    if (short && sleeve !== null) up.ell(0, -0.8, 0, 3.9 * k, 3.1 * k, 3.8 * k, 0, CUFF); // puffed sleeve
    if (rolled) {
      // the sleeve rolled up into a fat band just above the elbow
      up.fill(-6, 6, -UA - 1, -UA + 4, -6, 6, (x, y, z) => x * x + z * z * 1.05 <= (2.85 * k + 0.85) ** 2 && y > -UA + 0.5 && y < -UA + 3.5, 0, ROLL);
    }
    up.resolve({
      [FUR]: furPaint,
      [SLV]: slvPaint,
      [CUFF]: (x, y, z, e) => (y < -2 ? lt(sleeve, 0.1) : (e & PY) ? lt(sleeve, 0.08) : sleeve),
      [ROLL]: (x, y, z, e) => {
        let c = lt(sleeve, 0.12);
        if (y === -UA + 2) c = dk(sleeve, 0.12); // the fold
        if (e & NY) c = dk(sleeve, 0.2);
        return c;
      },
    });

    // ---------------------------------------------------------------- forearm and paw
    const lo = new Vox(-8, 9, -FA - 13, 4, -7, 10);
    const longSleeve = sleeve !== null && !short && !rolled;
    lo.fill(-7, 7, -FA - 1, 3, -7, 7, (x, y, z) => {
      const yc = Math.max(-FA, Math.min(1, y));
      const t = (1 - yc) / (FA + 1);
      const r = (2.75 - 0.5 * t) * k;
      return x * x + (y - yc) * (y - yc) + z * z * 1.08 <= r * r;
    }, 0, () => (longSleeve ? SLV : FUR));
    // forearm fur: a thicker, ragged fringe toward the wrist (the classic "fluffy cuff")
    if (!longSleeve) {
      lo.fill(-6, 6, -FA - 1, -FA + 3, -6, 6, (x, y, z) => {
        const a = Math.atan2(z, x);
        const tuft = (Math.floor((a + 4) * 2.6) & 1) ? 0.7 : 0;
        return x * x + z * z <= (2.55 * k + 0.6 + tuft) ** 2 && y > -FA - 0.5 + tuft && y < -FA + 2.2;
      }, 0, FUR);
    } else {
      // a buttoned cuff
      lo.fill(-6, 6, -FA - 1, -FA + 2, -6, 6, (x, y, z) => x * x + z * z <= (2.4 * k + 0.7) ** 2 && y > -FA - 0.6 && y < -FA + 1.6, 0, CUFF);
    }
    const pk = k * 0.86;
    const pcy = -FA - 3.2 * pk;
    if (big) {
      // the spade paw: broad, flat, pink, with knuckles, a palm pad and five long claws
      lo.ell(0.7, pcy, 0.5, 5.2 * pk, 3.6 * pk, 3.1 * pk, 0, PAW, 2.5);
      const fingers = [-4, -2, 0, 2, 4].map((f) => f * pk);
      for (const fx of fingers) lo.ell(0.7 + fx, pcy - 2.9 * pk, 0.5 + 0.8, 1.1 * pk, 1.5 * pk, 2.1 * pk, 0, KNUCK);
      lo.ell(0.7, pcy + 0.4, -1.8 * pk, 3 * pk, 2 * pk, 0.9, 0, PAD); // palm pad on the inner side
      fingers.forEach((fx, i) => {
        const cx = 0.7 + fx;
        const len = (i === 2 ? 3.8 : i === 0 || i === 4 ? 2.7 : 3.3) * pk;
        const y0 = pcy - 3.6 * pk, z0 = 0.5 + 1.3;
        lo.line(cx, y0, z0, cx, y0 - len * 0.62, z0 + len * 0.55, 0, 0.64, CLAWB);
        lo.line(cx, y0 - len * 0.62, z0 + len * 0.55, cx, y0 - len * 0.88, z0 + len * 1.12, 0, 0.5, CLAWT);
      });
    } else {
      // a small hand: palm, three curled fingers and a thumb, with nails
      lo.ell(0.3, pcy, 0.4, 3.3 * pk, 3.1 * pk, 2.7 * pk, 0, PAW, 2.4);
      if (sp === 'frog') {
        for (const dx of [-2, 0, 2]) lo.ell(0.3 + dx * pk, pcy - 2.7 * pk, 1.6, 1.15, 0.95, 1.35, 0, PAW);
      } else {
        for (const dx of [-1.7, 0, 1.7]) {
          const fx = 0.3 + dx * pk;
          lo.line(fx, pcy - 1.8 * pk, 0.9, fx, pcy - 3.4 * pk, 1.9, 0, 0.95, KNUCK);
          lo.line(fx, pcy - 3.4 * pk, 1.9, fx, pcy - 3.9 * pk, 2.9, 0, 0.8, NAIL);
        }
        lo.line(-2.4 * pk, pcy - 0.2, 1.4, -3.2 * pk, pcy - 1.8 * pk, 2.6, 0, 0.95, KNUCK); // thumb
        lo.set(Math.floor(-3.2 * pk), Math.floor(pcy - 1.8 * pk), 3, dk(pawC, 0.05));
      }
    }
    const clawC = sp === 'molerat' ? 0xf0dcb0 : CLAW;
    lo.resolve({
      [FUR]: furPaint,
      [SLV]: slvPaint,
      [CUFF]: (x, y, z, e) => {
        let c = sleeve !== null ? (spec.outfit === 'suit' ? 0xf4efe4 : lt(sleeve, 0.14)) : fur;
        if ((e & PZ) && x === 1 && y === -FA) c = 0xf4ecdc; // the button
        if (e & NY) c = dk(c, 0.15);
        return c;
      },
      [PAW]: (x, y, z, e) => {
        let c = pawC;
        if (e & PY) c = lt(c, 0.12);
        if (e & NY) c = dk(c, 0.1);
        // creases across the back of the paw
        if (big && (e & PZ) && (y === Math.round(pcy + 1) || y === Math.round(pcy - 1)) && (x + 40) % 3 !== 0) c = dk(c, 0.07);
        if (dirt > 1 && h3(x >> 1, y >> 1, z, 77) < dirt * 0.06) c = mix(c, 0x6a4a30, 0.4);
        return c;
      },
      [KNUCK]: (x, y, z, e) => {
        let c = dk(pawC, 0.04);
        if (e & PY) c = lt(c, 0.1);
        if (dirt > 2 && (e & NY)) c = mix(c, 0x6a4a30, 0.35);
        return c;
      },
      [PAD]: () => dk(pawC, 0.16),
      [NAIL]: (x, y, z, e) => ((e & PZ) && (e & NY) ? mix(clawC, pawC, 0.3) : (e & PZ) ? lt(mix(pawC, clawC, 0.5), 0.15) : pawC),
      [CLAWB]: (x, y, z, e) => ((e & NY) || (e & NZ) ? mix(clawC, 0xb8a888, 0.45) : (e & (PX | NX)) && !(e & PZ) ? mix(clawC, 0xc8b8a0, 0.3) : clawC),
      [CLAWT]: (x, y, z, e) => (dirt > 2 ? mix(clawC, 0x6a4a30, 0.45) : (e & PZ) ? lt(clawC, 0.3) : clawC),
    });
    return { upper: up.geometry(bake), lower: lo.geometry(bake), UA, FA, socket: [0, -(FA + 4 * k), 2] };
  });
}

/**
 * The two leg parts: { thigh, shin, T, S } (T: hip → knee, S: knee → ankle; the sole lands
 * S + 2 voxels below the knee). side ±1 picks the knee patch (left leg).
 */
export function buildLegParts(spec, p, side, bake) {
  const sp = spec.species;
  const fur = spec.fur;
  const pants = pantsColor(spec);
  const dirt = Math.round((spec.dirt ?? 0.4) * 4) / 4;
  const patch = side < 0 && (spec.patches || 0) > 0 && pants !== null;
  const cuffs = spec.outfit === 'overalls';
  const boots = spec.boots || 0;
  const skirt = spec.outfit === 'dress';
  const k = p.limb || 1;
  const L = Math.round(p.lh * 2);
  const T = Math.round(L * 0.5), S = L - T;
  const key = `jleg|${sp}|${fur}|${pants}|${L}|${k}|${spec.body}|${Math.round(dirt * 4)}|${patch ? spec.seed % 7 : 0}|${cuffs}|${boots}|${bake}`;
  return cached(key, () => {
    const darkFur = lum(fur) < 0.3;
    const wide = (spec.body === 'chubby' || spec.body === 'stocky' ? 3.7 : spec.body === 'slim' ? 3.0 : 3.35) * Math.min(1.08, k);
    const FUR = 1, PANT = 2, CUFF = 3, FOOT = 4, TOE = 5, BOOT = 6, SOLE = 7, LACE = 8, BCUFF = 9;
    const legPaint = (x, y, z, e, yAbs) => {
      if (pants !== null) {
        let c = pants;
        if (x >= Math.floor(wide) - 0.5 && Math.abs(z + 0.5) < 1) c = dk(pants, 0.16); // outer seam
        if ((e & PZ) && x === 0 && spec.outfit === 'suit') c = lt(pants, 0.1); // a pressed crease
        if (e & PY) c = lt(c, 0.05);
        return c;
      }
      return furColor(fur, x, y, z, e || PZ, 61 + (yAbs | 0), darkFur ? 1.2 : 1);
    };

    // ---------------------------------------------------------------- thigh
    const th = new Vox(-7, 7, -T - 5, 4, -7, 7);
    th.fill(-6, 6, -T - 4, 3, -6, 6, (x, y, z) => {
      const yc = Math.max(-T, Math.min(1.5, y));
      const t = (1.5 - yc) / (T + 1.5);
      const r = wide * (1.06 - 0.12 * t);
      return x * x + (y - yc) * (y - yc) + z * z <= r * r;
    }, 0, () => (pants !== null ? PANT : FUR));
    th.resolve({ [PANT]: (x, y, z, e) => legPaint(x, y, z, e, y), [FUR]: (x, y, z, e) => legPaint(x, y, z, e, y) });
    // trouser pockets: a slanted opening at the hip
    if (pants !== null && !cuffs && !skirt) th.paint((x, y, z, c) => ((x - 1) === -y && y <= 0 && y > -3 && z >= Math.floor(wide) - 2 ? dk(pants, 0.25) : undefined));

    // ---------------------------------------------------------------- shin and foot
    const sh = new Vox(-7, 7, -S - 7, 4, -7, 11);
    sh.fill(-6, 6, -S - 1, 3, -6, 6, (x, y, z) => {
      const yc = Math.max(-S, Math.min(1.5, y));
      const t = (1.5 - yc) / (S + 1.5);
      const r = wide * (0.98 - 0.16 * t);
      return x * x + (y - yc) * (y - yc) + z * z <= r * r;
    }, 0, () => (pants !== null ? PANT : FUR));
    const fy = -S - 1;
    const footR = wide * 0.84;
    if (cuffs && pants !== null && !boots) sh.fill(-6, 6, -S - 1, -S + 3, -6, 6, (x, y, z) => x * x + z * z <= (footR + 1.2) ** 2 && y > -S - 0.4 && y < -S + 2.2, 0, CUFF);
    if (boots) {
      // a laced work boot: shaft to mid-shin with a folded cuff, a toe cap and a thick sole
      const top = fy + 5.5;
      sh.fill(-6, 6, fy - 1, top, -6, 6, (x, y, z) => x * x + z * z <= (footR + 0.75) ** 2 && y < top, 0, BOOT);
      sh.fill(-6, 6, top - 1.5, top + 1, -6, 6, (x, y, z) => x * x + z * z <= (footR + 1.15) ** 2 && y > top - 1.4 && y < top + 0.6, 0, BCUFF);
      sh.ell(0, fy - 0.2, 1.8, footR + 1, 2.2, 4.9, 0, BOOT, 2.4);
      sh.fill(-6, 6, fy - 2, fy, -6, 10, (x, y, z) => {
        const f = (x / (footR + 1.2)) ** 2 + ((z - 1.8) / 5.3) ** 2;
        return f <= 1 && y < fy - 0.6;
      }, 0, SOLE);
      // laces up the front of the shaft and the instep
      for (let y = Math.round(fy) + 1; y < top - 1; y++) for (const x of [-1, 0]) {
        const zf = sh.frontZ(x, y);
        if (isFinite(zf)) sh.setM(x, y, zf, LACE);
      }
    } else {
      // a bare foot: a rounded slipper shape with toes
      sh.ell(0, fy, 1.4, footR + 0.6, 1.9, 4.5, 0, FOOT, 2.4);
      for (const dx of [-2, 0, 2]) sh.ell(dx * 0.95, fy - 0.4, 5.3, 1.25, 1.2, 1.25, 0, TOE);
    }
    sh.carve(-7, 7, -S - 7, fy - 1, -7, 11, (x, y) => y < fy - 1);
    const foot = DIGGERS.has(sp) ? (sp === 'golden' ? 0xe0a890 : SKIN_PINK) : sp === 'fox' || sp === 'badger' ? 0x2a2224 : sp === 'frog' ? mix(fur, 0xf0f0c0, 0.25) : dk(fur, 0.18);
    const bootC = boots || 0x5a3a24;
    sh.resolve({
      [PANT]: (x, y, z, e) => legPaint(x, y, z, e, y - T),
      [FUR]: (x, y, z, e) => legPaint(x, y, z, e, y - T),
      [CUFF]: (x, y) => (y >= -S + 1 ? lt(pants, 0.3) : lt(pants, 0.18)),
      [FOOT]: (x, y, z, e) => {
        let c = foot;
        if (e & PY) c = lt(c, 0.1);
        if ((e & NY) || y <= fy - 1) c = dk(c, 0.18);
        if (dirt > 0.4 && (e & PY) && z > 2 && ((x + z) & 1)) c = mix(c, 0x5a4028, 0.35 * dirt);
        return c;
      },
      [TOE]: (x, y, z, e) => (z >= 6 && DIGGERS.has(sp) ? CLAW : (e & PY) ? lt(foot, 0.08) : dk(foot, 0.05)),
      [BOOT]: (x, y, z, e) => {
        let c = bootC;
        if (e & PY) c = lt(c, 0.16);
        if (z > 4 && (e & PY)) c = lt(c, 0.26); // the toe cap's shine
        if ((e & (PX | NX)) && y === Math.round(fy) + 1) c = dk(c, 0.2); // the welt
        if (dirt > 0.3 && y < fy + 2 && ((x + y + z) & 1)) c = mix(c, 0x4a3420, 0.35);
        return c;
      },
      [BCUFF]: (x, y, z, e) => ((e & NY) ? dk(bootC, 0.2) : lt(bootC, 0.12)),
      [SOLE]: (x, y, z, e) => ((e & NY) ? 0x1e1618 : z > 5 ? 0x3a2e2a : 0x2a2224),
      [LACE]: (x, y) => ((x + y) & 1 ? 0xe8dcc0 : (y & 1 ? BRASS : dk(bootC, 0.3))),
    });
    // knee patch on the left knee, grime toward the cuffs
    sh.paint((x, y, z, c) => {
      if (patch && pants !== null && z >= 1 && y <= 1 && y >= -3 && x >= -2 && x <= 1 && c !== foot) {
        const edge = y === 1 || y === -3 || x === -2 || x === 1;
        const pc = PATCH_COLORS[(spec.seed | 0) % PATCH_COLORS.length];
        return edge ? ((x + y) % 2 ? THREAD : dk(pc, 0.1)) : pc;
      }
      if (boots) return undefined;
      const gTop = -S + 1 + dirt * 3;
      if (y > fy + 1 && y < gTop && (y < gTop - 1 || ((x + y + z) & 1))) return mix(c, 0x4a3420, 0.22 + dirt * 0.18);
      return undefined;
    });
    return { thigh: th.geometry(bake), shin: sh.geometry(bake), T, S };
  });
}

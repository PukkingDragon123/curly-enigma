// Hi-res heads: species skulls with muzzles, noses, teeth, quills and shells, structured
// fur, dirt, blush, freckles and wrinkles, plus the face layout the rig needs (eye sockets,
// brow, mouth and whisker anchors, ears). Local frame: origin at the neck point (x center,
// y = head bottom, z center), 1 unit = 1 hi-res voxel, the face looks down +z.
import { Vox, mix, dk, lt, lum, h3, rngFrom, furColor, smudge, cached, PY, PZ } from './vox.js';
import { eyeFootprint } from './face.js';
import { SKIN_PINK } from './spec.js';

// material ids for the head grid
const FUR = 1, MUZ = 2, NOSE = 3, SKIN = 4, TOOTH = 5, QUILL = 6, SHELL = 7, PAD = 8, STAR = 9, WHITE = 11;

// snout ellipsoid [cx, cy, cz, rx, ry, rz] relative to (0, 0, hz)
const HEADS = {
  mole: { n: 3.1, cheeks: true, snout: [0, 6.2, -2, 5.2, 4.3, 5.6], nose: 'pink', mouthY: 2.6, teeth: true },
  starnose: { n: 3.1, cheeks: true, snout: [0, 6.2, -2, 5.2, 4.3, 5.2], nose: 'star', mouthY: 2.4, teeth: true },
  golden: { n: 2.6, cheeks: true, snout: [0, 6, -2, 4.6, 3.8, 5], nose: 'pad', mouthY: 2.8, teeth: true },
  molerat: { n: 2.9, cheeks: true, snout: [0, 6, -2, 6, 4.4, 6], nose: 'rat', mouthY: 5.4, buck: true },
  hedgehog: { n: 2.8, snout: [0, 6, -1.5, 4.2, 3.6, 6.4], nose: 'black', mouthY: 3.2, ears: 'round', quills: true },
  rabbit: { n: 2.6, cheeks: true, snout: [0, 6.6, -2.4, 4.6, 3.6, 4], nose: 'bunny', mouthY: 4.4, mouth: 'bunny', bunnyTeeth: true, ears: 'long' },
  badger: { n: 3.1, snout: [0, 6, -1.5, 4.6, 3.8, 5.8], nose: 'black', mouthY: 3, ears: 'round' },
  armadillo: { n: 3, snout: [0, 6, -1, 3.6, 3.2, 7], nose: 'snub', mouthY: 3.4, ears: 'oval', shield: true },
  fox: { n: 3, snout: [0, 5.8, -1, 4.2, 3.4, 7], nose: 'black', mouthY: 3.4, ears: 'pointy', ruff: true },
  frog: { n: 2.8, snout: null, nose: 'frog', mouthY: 4, mouth: 'frog' },
  shrew: { n: 2.9, snout: 'cone', nose: 'small', mouthY: 3.6, ears: 'tiny' },
  vole: { n: 2.5, cheeks: true, snout: [0, 6, -2, 5, 4, 4.4], nose: 'small', mouthY: 3.4, teeth: true, ears: 'tiny' },
};

/**
 * The skull as a row shape (shared with hats so they hug it): a superellipsoid that is a
 * little rounder over the crown than at the jaw, wider at the cheeks, with a flat-ish face.
 * k/ky grow it at the sides/top, sx scales the base radii, nh overrides the exponent.
 */
export function skullRow(hx, hy, hz, n, k = 0, ky = k, sx = 1, nh = 0) {
  return (yc) => {
    const r = (yc - hy) / hy;
    const nr = nh || (r > 0 ? Math.max(2.3, n - 0.45) : n);
    return [(hx * (1 + 0.045 * -r) - 0.15) * sx + k, (hz * (1 - 0.03 * r) - 0.15) * sx + k, nr, (yc - hy) / (hy + ky), nh || nr + 0.5];
  };
}

export function headInfoKey(spec, p) {
  return [spec.species, spec.fur, p.hw, p.hh, p.hd, spec.eyes, spec.blush ? 1 : 0, spec.freckles ? 1 : 0, spec.age,
    Math.round((spec.dirt ?? 0.4) * 10), spec.seed, spec.tuft && !hatCoversTop(spec.hat) ? 1 : 0, spec.earring || 0].join('|');
}

function hatCoversTop(hat) { return hat && hat !== 'none' && hat !== 'bow'; }

/**
 * Build the head of a spec: { geo, info } cached by the head-relevant spec fields.
 * info (head-local voxels): { W, H, D, hx, hy, hz, n, skull(x,y,z), frog, eyes: [{side, x, y, z, type}],
 *   lid, browY, browZ: [z per eye], mouth: {y, z, kind, teeth, buck}, lip, whisk: {x, y, z, len, color} | null,
 *   ears: [{side, x, y, z, rx, rz}], earKind, noseY, snoutFront, topAt(x, z) }
 */
export function buildHead(spec, p, bake) {
  return cached(`head|${headInfoKey(spec, p)}|${bake}`, () => makeHead(spec, p, bake));
}

function makeHead(spec, p, bake) {
  const sp = spec.species;
  const S = HEADS[sp] || HEADS.mole;
  const fur = spec.fur;
  const seed = (spec.seed | 0) % 9973;
  const rng = rngFrom(seed * 13 + 7);
  const W = p.hw * 2, H = p.hh * 2, D = p.hd * 2;
  const hx = W / 2, hy = H / 2, hz = D / 2;
  const elder = spec.age === 'elder', baby = spec.age === 'baby';
  const n = baby ? Math.min(S.n, 2.6) : S.n;
  const v = new Vox(-hx - 6, hx + 6, -2, H + 9, -hz - 8, hz + 13);

  // ---------------------------------------------------------------- skull
  const row0 = skullRow(hx, hy, hz, n);
  const skull = (x, y, z) => {
    const [sx, sz, nr, ty, nz] = row0(y);
    return Math.abs(x / sx) ** nr + Math.abs(ty) ** nr + Math.abs(z / sz) ** nz <= 1;
  };
  v.seRows(0, 0, -1, H + 1, hx + 1, hz + 1, row0, 0, sp === 'molerat' ? SKIN : FUR);
  if (S.cheeks) for (const s of [-1, 1]) v.ell(s * (hx - 4.2), 6.4, hz - 5.6, 4.8, 4.4, 5, 0, sp === 'molerat' ? SKIN : FUR);
  if (S.ruff) {
    // fox cheek ruffs that flare out into tufts
    for (const s of [-1, 1]) {
      v.ell(s * (hx - 2.2), 5.2, 1.5, 4.2, 4.4, 5.6, 0, WHITE);
      for (let k = 0; k < 3; k++) v.line(s * (hx + 0.6), 3.5 + k * 2.2, 1 + k, s * (hx + 2.6), 2.4 + k * 2.4, 0.5 + k, 0, 0.6, WHITE);
    }
  }

  // ---------------------------------------------------------------- snout & nose
  let snoutFront = hz, sn = null;
  if (S.snout === 'cone') {
    // shrew: long tapering nose cone
    const z0 = hz - 3, z1 = hz + 9;
    v.fill(-5, 5, 1, 11, z0, z1, (x, y, z) => {
      const t = (z - z0) / (z1 - z0);
      const r = 4.2 * (1 - t) + 1.1 * t;
      const cy = 6.4 - t * 1.4;
      return x * x + (y - cy) * (y - cy) * 1.3 <= r * r;
    }, 0, MUZ);
    snoutFront = z1;
    sn = { cy: 5.4, rx: 2.4, front: z1, side: 2.6 };
  } else if (S.snout) {
    const [cx, cy, cz, rx, ry, rz] = S.snout;
    const babyK = baby ? 0.85 : 1;
    v.ell(cx, cy, hz + cz, rx * babyK, ry * babyK, rz * babyK, 0, sp === 'molerat' ? SKIN : MUZ, 2.2);
    snoutFront = hz + cz + rz * babyK;
    sn = { cy, rx: rx * babyK, front: snoutFront, side: rx * babyK };
  }

  // nose
  const noseY = sn ? sn.cy + (sp === 'molerat' ? 1.3 : 1.4) : 9;
  if (S.nose === 'pink') {
    v.ell(0, noseY, snoutFront - 0.6, 3.4, 2.6, 2.3, 0, NOSE);
  } else if (S.nose === 'star') {
    v.ell(0, noseY - 0.2, snoutFront - 0.3, 2, 1.6, 1.4, 0, NOSE);
    // the famous star: fleshy pink rays around the nostrils (real ones have 22; 18 read cleaner)
    const rays = 18;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + 0.17;
      const r1 = 1.6, r2 = i % 2 ? 4.4 : 5.2;
      const ca = Math.cos(a), sa = Math.sin(a) * 0.9;
      v.line(ca * r1, noseY - 0.2 + sa * r1, snoutFront + 0.4, ca * r2, noseY - 0.2 + sa * r2, snoutFront + 1.6, 0, 0.55, STAR);
    }
  } else if (S.nose === 'pad') {
    // the golden mole's leathery nose shield: a wedge, wider on top
    v.fill(-4, 4, noseY - 2.5, noseY + 2, snoutFront - 2, snoutFront + 1, (x, y, z) => {
      const t = (y - (noseY - 2.2)) / 4;
      return t >= 0 && t <= 1 && Math.abs(x) <= 1.2 + t * 2.2 && z <= snoutFront + 0.6 - Math.abs(x) * 0.25;
    }, 0, PAD);
  } else if (S.nose === 'rat') {
    v.ell(0, noseY, snoutFront - 0.4, 3, 1.8, 1.4, 0, NOSE, 2.4);
  } else if (S.nose === 'black') {
    v.ell(0, noseY - 0.3, snoutFront - 0.3, 2.4, 1.9, 1.7, 0, NOSE, 2.2);
  } else if (S.nose === 'bunny') {
    // a little inverted triangle
    const ny = Math.round(noseY + 0.5), nz = Math.round(snoutFront);
    v.box(-2, ny, nz - 2, 2, ny + 1, nz + 1, 0, NOSE);
    v.box(-1, ny - 1, nz - 2, 1, ny, nz + 1, 0, NOSE);
  } else if (S.nose === 'snub') {
    v.ell(0, noseY - 0.6, snoutFront - 0.1, 2, 1.3, 1, 0, NOSE);
  } else if (S.nose === 'small') {
    v.ell(0, noseY - 0.4, snoutFront - 0.2, 1.8, 1.4, 1.2, 0, NOSE);
  }

  // teeth
  if (S.buck) {
    // naked mole-rat: big ivory incisors out front
    const tz = Math.round(snoutFront) - 3;
    v.box(-2, 0, tz, 0, 5, tz + 2, 0, TOOTH);
    v.box(0, 0, tz, 2, 5, tz + 2, 0, TOOTH);
    v.box(-2, -1, tz - 1, 2, 1, tz + 1, 0, TOOTH);
  }
  if (S.bunnyTeeth) {
    const tz = Math.round(snoutFront) - 2;
    v.box(-2, 1, tz, 2, 4, tz + 1, 0, TOOTH);
  }

  // frog: eye bumps on top, nostrils
  let frogEyes = null;
  if (sp === 'frog') {
    for (const s of [-1, 1]) v.ell(s * 7.5, H - 1.2, hz - 5.2, 4.6, 4.2, 4.4, 0, FUR);
    frogEyes = true;
  }

  // armadillo head shield: a raised scaly plate over the crown
  if (S.shield) {
    v.fill(-hx, hx, hy, H + 2, -hz, hz - 2, (x, y, z) => {
      if (skull(x, y, z)) return false;
      const ty = (y - 1 - hy) / hy;
      const sx = hx * 0.84, sz = hz * 0.95;
      return Math.abs(x / sx) ** 2.6 + Math.abs(ty) ** 2.6 + Math.abs((z + 1.5) / sz) ** 2.6 <= 1;
    }, 0, SHELL);
  }

  // hedgehog: a dense mat of quills over the crown and back of the head, with bold spikes
  if (S.quills) {
    const backR = (x, y, z) => y >= 5 && z < hz * 0.4 - (y - hy) * 0.55 - Math.abs(x) * 0.12;
    v.dilate(backR, QUILL);
    v.dilate((x, y, z) => backR(x, y, z) && y >= 6, QUILL);
    const spikes = [];
    for (let z = -hz - 3; z < hz; z += 4)
      for (let y = 6; y < H + 3; y += 3)
        for (let x = -hx - 3; x <= hx + 2; x += 3) {
          const xx = x + ((y / 3 | 0) & 1), zz = z + ((x + 33) % 3 === 0 ? 1 : 0);
          if (v.m(xx, y, zz) !== QUILL || v.exposure(xx, y, zz) === 0) continue;
          spikes.push([xx, y, zz]);
        }
    for (const [x, y, z] of spikes) {
      const nx = x / hx * 0.6, ny = (y - hy) / hy * 0.55 + 0.35, nz = z / hz * 0.35 - 1;
      const L = Math.hypot(nx, ny, nz) || 1;
      const len = 3 + h3(x, y, z, seed) * 2;
      for (let k = 1; k <= Math.ceil(len); k++) {
        const qx = Math.floor(x + 0.5 + (nx / L) * k), qy = Math.floor(y + 0.5 + (ny / L) * k), qz = Math.floor(z + 0.5 + (nz / L) * k);
        if (v.has(qx, qy, qz)) continue;
        v.set(qx, qy, qz, k >= Math.ceil(len) ? 0xf2e6c8 : k >= Math.ceil(len) - 1 ? 0xa07a50 : 0x4a2e1c);
      }
    }
  }

  // a jagged fur fringe along the cheeks so the silhouette reads furry, not smooth
  if (sp !== 'molerat' && sp !== 'frog' && sp !== 'armadillo') {
    const fringeM = S.ruff ? WHITE : FUR;
    for (const side of [-1, 1]) {
      for (let y = 2; y <= 10; y += 2) {
        const z = Math.round(hz * 0.15) - (y > 7 ? 1 : 0);
        const edge = v.sideX(y, z, side);
        if (!isFinite(edge)) continue;
        const k = ((y >> 1) & 1) ? 2 : 1;
        for (let i = 1; i <= k; i++) v.setM(edge + side * i, y - (i - 1), z, fringeM);
        v.setM(edge + side, y, z - 1, fringeM);
      }
    }
  }

  // tuft / cowlick on top (hidden under hats)
  if (spec.tuft && !hatCoversTop(spec.hat)) {
    const tc = lt(fur, 0.08);
    v.line(0, H - 1, 1, 0.4, H + 2.6, 2.8, tc, 0.6);
    v.line(0.4, H + 2.6, 2.8, -0.6, H + 3.6, 4.6, tc, 0.55);
    v.line(-2, H - 1, 0, -3, H + 1.8, 0.4, tc, 0.55);
    v.line(2, H - 1.4, -0.5, 3.2, H + 1.2, -1.2, tc, 0.55);
  }

  // ---------------------------------------------------------------- face layout
  const type = (spec.eyes || 'bead') === 'bead' && (baby || spec.age === 'kid') ? 'big' : spec.eyes || 'bead';
  const fp = eyeFootprint(type);
  const eyeCy = sp === 'frog' ? H - 0.5 : 11.5;
  const eyeCx = sp === 'frog' ? 7.5 : 6.5;
  const ey0 = Math.round(eyeCy - fp.h / 2);
  const eyes = [];
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? Math.round(eyeCx - fp.w / 2) : -Math.round(eyeCx - fp.w / 2) - fp.w;
    let zf = Infinity;
    for (let x = x0; x < x0 + fp.w; x++) for (let y = ey0; y < ey0 + fp.h; y++) {
      const f = v.frontZ(x, y);
      if (f > 0 && f < zf) zf = f;
    }
    if (!isFinite(zf)) zf = hz - 1;
    eyes.push({ side, x0, y0: ey0, w: fp.w, h: fp.h, zf, cx: x0 + fp.w / 2, cy: ey0 + fp.h / 2 });
  }

  // ---------------------------------------------------------------- colors
  const darkFur = lum(fur) < 0.3;
  let muzzle = sp === 'fox' || sp === 'badger' ? 0xf4efe6 : sp === 'frog' ? mix(fur, 0xf0f0c0, 0.5) : sp === 'hedgehog' ? lt(fur, 0.25) : mix(fur, 0xf6e8d8, darkFur ? 0.3 : 0.38);
  if (elder) muzzle = mix(muzzle, 0xe4e0dc, 0.55);
  const skin = sp === 'molerat' ? fur : SKIN_PINK;
  const noseC = { pink: 0xf09aa6, star: 0xf07a90, pad: 0xc89070, rat: 0xd88088, black: 0x1e1618, bunny: 0xf08a9c, small: sp === 'shrew' ? 0x9a5a5a : 0x3a2224, snub: 0xb87a6e, frog: 0x2a4a2a }[S.nose] || 0xf09aa6;
  const dirt = Math.round((spec.dirt ?? 0.4) * 10) / 10; // quantized like the cache key
  const dustC = darkFur ? 0x8a6a48 : sp === 'molerat' ? 0x9a6a50 : 0x5a4028;

  const badgerRegion = (x, y, z) => {
    const ax = Math.abs(x + 0.5);
    if (z < -hz * 0.55) return fur;
    if (ax < 2.6 && y > 4) return 0xf4f2ec;
    if (ax < 7.2 && y > 4.5) return 0x26242a;
    if (y < 11 && z > -2) return 0xf4f2ec;
    return fur;
  };
  const muzzleOval = (x, y, z) => {
    if (z < hz * 0.25) return false;
    const a = (x + 0.5) / (sp === 'fox' ? 6.5 : 8.6), b = (y + 0.5 - 5.6) / 5.6;
    return a * a + b * b < 1;
  };
  // dark-furred folk get a softer, lighter face so their eyes read
  const faceTone = darkFur ? mix(fur, muzzle, 0.42) : fur;
  const inFace = (x, y, z) => {
    if (!darkFur || z < hz * 0.2) return false;
    const a = (x + 0.5) / 10.6, b = (y + 0.5 - 10) / 7.6;
    const d = a * a + b * b;
    return d < 0.86 || (d < 1 && (x + y) % 2 === 0);
  };
  const region = (x, y, z) => {
    if (sp === 'badger') return badgerRegion(x, y, z);
    if (sp === 'fox' && y < H * 0.4 && z > -1) return 0xf4efe6;
    if (sp === 'frog') {
      if (y < H * 0.32) return muzzle;
      if (h3(x >> 2, y >> 2, z >> 2, seed) < 0.18) return dk(fur, 0.22);
      return fur;
    }
    if (sp === 'hedgehog' && z < hz * 0.35 - (y - hy) * 0.6 - Math.abs(x) * 0.15 && y >= 5) return 0x3a2416;
    if (muzzleOval(x, y, z) && sp !== 'molerat') return muzzle;
    if (inFace(x, y, z)) return faceTone;
    return fur;
  };
  // wrinkles for the naked mole-rat & elders
  const wrinkle = (x, y, z) => {
    if (sp === 'molerat') {
      const w = y + Math.round(Math.sin(x * 0.42 + z * 0.3) * 0.9);
      if (y > 13 && w % 3 === 0) return true;
      if (z > hz - 2 && y > 6 && y < 11 && Math.abs(x) < 5 && (y + (Math.abs(x) >> 1)) % 3 === 0) return true;
      if (Math.abs(x) > hx - 3 && y < 10 && (y + z) % 4 === 0) return true;
    }
    return false;
  };
  // dirt smudges: cheeks, forehead, snout, chin
  const spots = [];
  const cand = [[-9, 6.5, hz - 2.5], [9, 6.5, hz - 2.5], [-4, 17, hz - 3], [3, 16.5, hz - 3], [-4.5, 4.5, snoutFront - 2], [4, 5.2, snoutFront - 2], [0, 1.5, hz - 3], [-10, 12, 0], [10, 10, -3]];
  const nSpots = Math.round(dirt * 4.4);
  for (let i = 0; i < nSpots; i++) {
    const c = cand.splice(rng.int(0, cand.length - 1), 1)[0];
    spots.push({ x: c[0] + rng.range(-1, 1), y: c[1] + rng.range(-1, 1), z: c[2], r: rng.range(1.8, 2.8), c: dustC, a: rng.range(0.35, 0.55) });
  }
  // blush & freckles (front surface ovals on the cheeks)
  const blush = spec.blush ? 0xf27f96 : 0;
  const cheekX = eyeCx + 2.6, cheekY = eyes[0].y0 - 1.6;
  const inBlush = (x, y, z) => {
    if (!blush || z < hz * 0.2) return 0;
    const a = (Math.abs(x + 0.5) - cheekX) / 2.4, b = (y + 0.5 - cheekY) / 1.25;
    const d = a * a + b * b;
    return d < 1 ? (d < 0.3 && x * Math.sign(x + 0.5) === Math.floor(cheekX) - 1 ? 2 : 1) : 0;
  };
  const freck = (x, y, z) => {
    if (!spec.freckles || z < hz * 0.2) return false;
    const ax = Math.abs(x + 0.5) - 0.5, yy = y;
    return (ax === Math.floor(cheekX) - 2 && yy === Math.floor(cheekY) + 1) || (ax === Math.floor(cheekX) && yy === Math.floor(cheekY) + 2) || (ax === Math.floor(cheekX) + 1 && yy === Math.floor(cheekY));
  };
  const crow = (x, y, z) => {
    if (!elder || z < 0) return false;
    const ax = Math.abs(x + 0.5) - 0.5;
    const ox = eyeCx + 3;
    return (ax === ox && (y === ey0 + 1 || y === ey0 + 3)) || (ax === ox + 1 && y === ey0 + 2);
  };

  const furPaint = (x, y, z, e) => {
    let c = region(x, y, z);
    if (z < -hz * 0.35 && c === fur) c = dk(c, z < -hz * 0.7 ? 0.14 : 0.07);
    if (sp === 'golden' && (e & PY)) c = mix(c, 0xf8e070, 0.25);
    c = furColor(c, x, y, z, e, seed, darkFur ? 1.25 : 1);
    if (crow(x, y, z)) c = dk(c, 0.3);
    const b = inBlush(x, y, z);
    if (b) c = b === 2 ? 0xffb4c4 : mix(c, blush, 0.85);
    else if (freck(x, y, z)) c = dk(c, 0.35);
    return smudge(c, x, y, z, spots, seed);
  };
  const muzPaint = (x, y, z, e) => {
    let c = muzzle;
    if (sp === 'frog') c = fur;
    c = furColor(c, x, y, z, e, seed + 5, 0.6);
    const b = inBlush(x, y, z);
    if (b) c = b === 2 ? 0xffb4c4 : mix(c, blush, 0.85);
    return smudge(c, x, y, z, spots, seed);
  };
  const skinPaint = (x, y, z, e) => {
    let c = skin;
    const mott = h3(x >> 1, y >> 1, z >> 1, seed);
    if (mott < 0.18) c = dk(c, 0.06); else if (mott > 0.9) c = lt(c, 0.08);
    if (wrinkle(x, y, z)) c = dk(c, 0.16);
    if (e & PY) c = lt(c, 0.06);
    const b = inBlush(x, y, z);
    if (b) c = mix(c, 0xf06a86, 0.6);
    return smudge(c, x, y, z, spots, seed);
  };
  const nosePaint = (x, y, z, e) => {
    let c = noseC;
    const top = y >= Math.round(noseY + 0.6);
    if (top && (e & PY)) c = lt(c, S.nose === 'black' ? 0.18 : 0.22);
    if (y <= Math.floor(noseY - 1.2)) c = dk(c, 0.12);
    // glossy highlight top-left of the nose
    if ((S.nose === 'pink' || S.nose === 'black' || S.nose === 'rat') && (e & PZ) && y === Math.round(noseY + 0.8) && (x === -2 || x === -1)) c = S.nose === 'black' ? 0x8a8090 : 0xffe4ea;
    // nostrils
    if ((S.nose === 'pink' || S.nose === 'rat' || S.nose === 'star') && (e & PZ) && !(e & PY) && y === Math.floor(noseY - 0.6) && (x === -2 || x === 1)) c = dk(noseC, 0.32);
    return c;
  };
  const starPaint = (x, y, z) => {
    const r = Math.hypot(x + 0.5, y + 0.5 - (noseY - 0.2));
    return r > 3.8 ? 0xffc4cc : r > 2.6 ? 0xf8a0b0 : 0xf07a90;
  };
  const toothPaint = (x, y, z, e) => {
    const c = sp === 'molerat' ? 0xf2e2b0 : 0xfffaf0;
    if (x === -1 && sp === 'molerat') return dk(c, 0.12);
    return (e & PY) ? lt(c, 0.3) : c;
  };
  const shellPaint = (x, y, z, e) => {
    const base = mix(fur, 0x8a7868, 0.6);
    const band = ((z + 40) % 4 === 0) || ((x + 40 + ((z >> 2) & 1) * 2) % 4 === 0 && (e & PY));
    let c = band ? dk(base, 0.3) : base;
    if ((e & PY) && !band) c = lt(c, 0.14);
    return c;
  };
  const padPaint = (x, y, z, e) => {
    let c = 0xa8705a;
    if (e & PY) c = lt(c, 0.2);
    if ((e & PZ) && y >= Math.floor(noseY + 0.6) && (x === -1 || x === 0)) c = lt(c, 0.28); // sheen
    return c;
  };
  const whitePaint = (x, y, z, e) => furColor(0xf4efe6, x, y, z, e, seed + 3, 0.5);

  // lids match the fur around the eyes
  const lidC = sp === 'molerat' ? dk(skin, 0.06) : dk(region(Math.round(eyes[1].cx), Math.round(eyes[1].cy), hz), 0.06);

  // carve flat eye sockets and give them a lid-colored floor
  for (const e of eyes) {
    for (let x = e.x0; x < e.x0 + e.w; x++)
      for (let y = e.y0; y < e.y0 + e.h; y++) {
        for (let z = e.zf + 1; z < v.z1; z++) {
          const mm = v.m(x, y, z);
          if (mm === FUR || mm === MUZ || mm === SKIN || mm === WHITE) v.set(x, y, z, -1);
        }
        if (v.has(x, y, e.zf)) v.set(x, y, e.zf, lidC);
      }
  }

  // mouth socket
  const mouthName = S.mouth === 'frog' ? 'frog' : S.mouth === 'bunny' ? 'bunny' : 'mole';
  const mw = mouthName === 'frog' ? 12 : 6;
  const mouthY = S.mouthY;
  const my0 = Math.round(mouthY - 1), my1 = my0 + 3;
  let mz = -Infinity;
  for (let x = -mw / 2; x < mw / 2; x++) for (let y = my0; y < my1; y++) mz = Math.max(mz, v.frontZ(x, y));
  if (!isFinite(mz)) mz = hz;
  // rest the mouth against the face: carve what sticks out in front of the plane
  let mzf = Infinity;
  for (let x = -mw / 2 + 1; x < mw / 2 - 1; x++) for (let y = my0; y < my1; y++) { const f = v.frontZ(x, y); if (f > 0) mzf = Math.min(mzf, f); }
  if (!isFinite(mzf)) mzf = mz;
  for (let x = -mw / 2; x < mw / 2; x++) for (let y = my0; y < my1; y++) for (let z = mzf + 1; z < v.z1; z++) {
    const mm = v.m(x, y, z);
    if (mm === FUR || mm === MUZ || mm === SKIN || mm === WHITE) v.set(x, y, z, -1);
  }

  // earring: a little hoop on the left side of the head
  if (spec.earring) {
    const side = v.sideX(9, -1, -1);
    const ex = (isFinite(side) ? side : -hx) - 1;
    const col = spec.earring;
    for (const [dx, dy] of [[0, 0], [0, -1], [0, -2], [0, -3], [1, -3], [-1, -3], [1, -4], [-1, -4], [0, -5]]) v.set(ex, 9 + dy, -1 + dx, dx === 0 && dy === -5 ? dk(col, 0.25) : dy === -1 ? lt(col, 0.3) : col);
  }

  // whiskers anchor on the snout sides
  const whisk = sn && sp !== 'molerat' && sp !== 'armadillo' && sp !== 'frog'
    ? { x: sn.side - 0.6, y: sn.cy + 0.3, z: (sn.front + hz) / 2 + 1.2, len: sp === 'shrew' ? 7 : sp === 'starnose' ? 5 : 6, color: darkFur ? mix(muzzle, 0xf4ece4, 0.45) : mix(lum(muzzle) > 0.6 ? muzzle : fur, 0x241a1c, 0.55) }
    : null;

  // spots for the expression extras (blush, tears, a sweat drop, an anger mark), on the surface
  const onFace = (x, y, side = 1) => {
    const xi = Math.floor(x), yi = Math.round(y);
    const z = v.frontZ(xi, yi);
    return { side, x: xi + 0.5, y: yi + 0.5, z: isFinite(z) ? z + 1 : hz };
  };
  const exprSpots = {
    cheeks: [-1, 1].map((side) => onFace(side > 0 ? cheekX - 0.5 : -cheekX - 0.5, cheekY, side)),
    tears: eyes.map((e) => onFace(e.cx + e.side * 1.4 - 0.5, e.y0 - 1.2, e.side)),
    sweat: onFace(hx - 3.5, Math.min(H - 3, ey0 + fp.h + 3), 1),
    vein: onFace(-hx + 3.5, Math.min(H - 2.5, ey0 + fp.h + 4.5), -1),
  };

  v.resolve({ [FUR]: furPaint, [MUZ]: muzPaint, [NOSE]: nosePaint, [SKIN]: skinPaint, [TOOTH]: toothPaint, [SHELL]: shellPaint, [PAD]: padPaint, [STAR]: starPaint, [WHITE]: whitePaint, [QUILL]: (x, y, z) => ((x + 99) % 3 === 0 ? 0x5a3a22 : 0x3a2416) });

  const lip = sp === 'molerat' ? dk(skin, 0.45) : sp === 'frog' ? dk(fur, 0.55) : darkFur ? dk(muzzle, 0.62) : dk(muzzle, 0.6);
  const geo = v.geometry(bake);
  const top = (x, z) => v.topY(Math.round(x), Math.round(z));
  const info = {
    W, H, D, hx, hy, hz, n, skull, frog: !!frogEyes,
    eyes: eyes.map((e) => ({ side: e.side, x: e.cx, y: e.cy, z: e.zf + 1, type })),
    lid: lidC,
    browY: ey0 + fp.h + 0.5,
    browZ: eyes.map((e) => {
      let z = -Infinity;
      for (let x = e.x0; x < e.x0 + e.w; x++) for (let y = ey0 + fp.h; y < ey0 + fp.h + 3; y++) z = Math.max(z, v.frontZ(x, y));
      return isFinite(z) ? z + 1 : hz;
    }),
    mouth: { y: my0 + 1.5, z: mzf + 1, kind: mouthName, teeth: !!S.teeth, buck: !!S.buck },
    lip,
    whisk,
    ears: S.ears ? earLayout(S.ears, v, hx, H, hz) : [],
    earKind: S.ears || null,
    noseY,
    snoutFront,
    topAt: top,
    expr: exprSpots,
  };
  return { geo, info };
}

function earLayout(kind, v, hx, H, hz) {
  const out = [];
  for (const side of [-1, 1]) {
    let x, z, tilt, back;
    if (kind === 'long') { x = 4.5; z = -2; tilt = 0.16; back = -0.12; }
    else if (kind === 'pointy') { x = 6.5; z = -2; tilt = 0.28; back = -0.06; }
    else if (kind === 'oval') { x = 6; z = -3; tilt = 0.22; back = -0.18; }
    else if (kind === 'round') { x = 8; z = -3; tilt = 0.5; back = -0.1; }
    else { x = 8.6; z = -3; tilt = 0.7; back = -0.1; }
    const xi = side > 0 ? Math.floor(x) : -Math.floor(x) - 1;
    let y = v.topY(xi, z);
    if (!isFinite(y)) y = H - 3;
    out.push({ side, x: side * x, y: y - (kind === 'long' || kind === 'pointy' ? 1.5 : 2.2), z, rz: -side * tilt, rx: back });
  }
  return out;
}

// ---------------------------------------------------------------- ears (separate meshes for wiggle)
export function earGeo(kind, fur, species, elder, bake) {
  return cached(`ear|${kind}|${fur}|${species}|${elder}|${bake}`, () => {
    const inner = species === 'fox' ? 0xf4ece0 : species === 'badger' ? 0x26242a : species === 'hedgehog' || species === 'rabbit' || species === 'armadillo' ? 0xf0a8b4 : dk(fur, 0.3);
    const outer = species === 'badger' ? 0x26242a : species === 'armadillo' ? mix(fur, 0xd8a8a0, 0.3) : fur;
    let v;
    if (kind === 'long') {
      v = new Vox(-3, 3, 0, 18, -2, 2);
      v.fill(-3, 3, 0, 18, -2, 2, (x, y, z) => {
        const t = y / 17;
        const r = 2.6 * Math.sin(Math.PI * (0.18 + t * 0.78)) + 0.35;
        return (x * x) / (r * r) + (z * z) / 2.2 <= 1 && y < 17.5;
      }, (x, y, z) => {
        if (z >= 1 && Math.abs(x + 0.5) < 1.6 && y > 2 && y < 15) return y > 12 ? mix(inner, 0xffd0d8, 0.3) : inner;
        let c = y > 14 ? dk(outer, 0.08) : outer;
        if ((x + y) % 5 === 0 && z < 1) c = lt(c, 0.08);
        return c;
      });
    } else if (kind === 'pointy') {
      v = new Vox(-5, 5, 0, 11, -2, 2);
      v.fill(-5, 5, 0, 11, -2, 2, (x, y, z) => {
        const half = 4.6 * (1 - y / 10.5);
        return Math.abs(x) <= half && Math.abs(z) < 1.6 + (y < 3 ? 0.4 : 0);
      }, (x, y, z) => {
        if (y >= 7) return 0x221a1c;
        if (z >= 1 && Math.abs(x) < 4.6 * (1 - y / 10.5) - 1.2 && y < 7) return y % 2 ? inner : lt(inner, 0.12);
        return outer;
      });
    } else if (kind === 'oval') {
      v = new Vox(-3, 3, 0, 10, -2, 2);
      v.ell(0, 5, 0, 2.8, 4.8, 1.4, (x, y, z) => (z >= 0 && Math.abs(x + 0.5) < 1.5 && y > 1 && y < 9 ? inner : outer));
    } else {
      const r = kind === 'round' ? 3 : 2.4;
      v = new Vox(-4, 4, -1, 6, -2, 2);
      v.ell(0, r, 0, r + 0.2, r, 1.3, (x, y, z) => {
        if (species === 'badger') return Math.hypot(x + 0.5, y + 0.5 - r) > r - 1 ? 0xf4f2ec : 0x26242a;
        return z >= 0 && Math.hypot(x + 0.5, y + 0.5 - r) < r - 1.1 ? inner : outer;
      });
    }
    return v.geometry(bake);
  });
}

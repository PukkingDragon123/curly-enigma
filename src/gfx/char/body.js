// Hi-res torsos: fur bodies with belly patches, quills or shells, and dirty outfits
// (overalls, aprons, vests, shirts, dresses, suits) with straps, buckles, pockets, stitched
// patches, collars and hems; knotted scarves and backpacks. Plus tails.
// Local frame: origin at the hip point (x center, y = body bottom, z center), 1 unit = 1 voxel.
import { Vox, mix, dk, lt, lum, h3, rngFrom, furColor, smudge, cached, PX, NX, PY, NY, PZ, NZ } from './vox.js';
import { PATCH_COLORS, SKIN_PINK } from './spec.js';

// material ids for the body grid
const FUR = 1, CLOTH = 3, CLOTH2 = 4, STRAP = 5, POCKET = 7, SCARF = 8, PACK = 9, PACK2 = 10, SHELL = 11, SKIN = 12, COLLAR = 13, TIE = 14, SASH = 15, QUILL = 18;
const BELT = 19, LEATHER = 20, TUFT = 21, IRON = 22, HANDLE = 23;

export const TROUSERS = 0x4a3c34;
const SHIRT_UNDER = 0xeee6d6;
const THREAD = 0xf0e4c4;
const BRASS = 0xd8b048;

/** Pants color for the legs of a spec (null = bare fur). */
export function pantsColor(spec) {
  const o = spec.outfit;
  if (o === 'overalls') return spec.outfitColor;
  if (o === 'suit') return dk(spec.outfitColor, 0.25);
  if (o === 'vest' || o === 'apron') return TROUSERS;
  if (o === 'shirt' && spec.age !== 'baby') return mix(TROUSERS, spec.outfitColor, 0.2);
  return null;
}

/** Sleeve color for the arms of a spec (null = bare fur). */
export function sleeveColor(spec) {
  const o = spec.outfit;
  if (o === 'shirt' || o === 'dress') return spec.outfitColor;
  if (o === 'suit') return spec.outfitColor;
  if (o === 'vest') return SHIRT_UNDER;
  if ((o === 'overalls' || o === 'apron') && spec.shirt) return spec.shirt;
  return null;
}

function fabricAt(c, fabric, x, y, z) {
  if (fabric === 'stripe') return ((y + 40) % 4 === 0) ? lt(c, 0.28) : c;
  if (fabric === 'dots') return ((y + 40) % 4 === 1 && (x + z + 40 + ((y >> 2) & 1) * 2) % 4 === 0) ? lt(c, 0.45) : c;
  if (fabric === 'plaid') {
    const a = (x + 40) % 5 === 0, b = (y + 40) % 5 === 0;
    return a && b ? dk(c, 0.3) : a || b ? dk(c, 0.15) : c;
  }
  return c;
}

function bodyKey(spec, p, bake) {
  return ['body', spec.species, spec.fur, p.bw, p.bh, p.bd, spec.outfit, spec.outfitColor, spec.scarf || 0, spec.backpack ? 1 : 0,
    Math.round((spec.dirt ?? 0.4) * 10), spec.seed, spec.patches || 0, spec.fabric || 'plain', spec.age, spec.body, bake,
    `${p.tall ? 'T' : 'C'}${spec.shirt || 0}.${spec.belt || 0}`].join('|');
}

export function buildBody(spec, p, bake) {
  return cached(bodyKey(spec, p, bake), () => makeBody(spec, p, bake));
}

function makeBody(spec, p, bake) {
  const sp = spec.species;
  const fur = spec.fur;
  const seed = ((spec.seed | 0) % 9973) + 11;
  const rng = rngFrom(seed * 7 + 1);
  const bx = p.bw, by = p.bh, bz = p.bd; // half sizes in hi-res voxels
  const H = by * 2;
  const outfit = spec.outfit || 'none';
  const oc = spec.outfitColor ?? 0x3a6a9a;
  const fabric = spec.fabric || 'plain';
  const chubby = spec.body === 'chubby';
  const stocky = spec.body === 'stocky';
  const baby = spec.age === 'baby';
  const darkFur = lum(fur) < 0.3;
  const v = new Vox(-bx - 7, bx + 7, -4, H + 5, -bz - 11, bz + 8);

  // ---------------------------------------------------------------- torso
  const nTop = chubby ? 2.7 : 3, nBot = chubby ? 3 : stocky ? 3.6 : 3.3;
  const baseM = sp === 'molerat' ? SKIN : FUR;
  if (p.tall) {
    // a grown-up torso: hips, a waist, a deep chest and rounded shoulders the head sits on
    const belly = chubby ? 1 : stocky ? 0.45 : 0;
    const g = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
    v.seRows(0, 0, -1, H + 1, bx * 1.1 + 1, bz * 1.3 + 1, (yc) => {
      const ty = (yc - by) / by;
      const chest = g(ty, 0.38, 0.5), waist = g(ty, -0.1, 0.3), hips = g(ty, -0.7, 0.34);
      const wx = 0.84 + 0.16 * chest + 0.08 * hips - 0.08 * waist * (1 - belly) + 0.05 * belly * waist;
      const wz = 0.86 + 0.14 * chest - 0.05 * waist * (1 - belly) + 0.2 * belly * g(ty, -0.15, 0.5);
      return [bx * wx - 0.1, bz * wz - 0.1, ty < 0 ? 3.4 : 2.9, ty, 3.4];
    }, 0, baseM);
    if (chubby) v.ell(0, by * 0.78, bz * 0.42, bx * 0.8, by * 0.62, bz * 0.74, 0, baseM);
  } else {
    v.seRows(0, 0, -1, H + 1, bx + 1, bz + 1, (yc) => {
      const ty = (yc - by) / by;
      // flatter front and back so clothes sit on clean planes
      return [bx * (1 - Math.max(0, ty) * 0.1) - 0.1, bz - 0.1, ty < 0 ? nBot : nTop, ty, 4.4];
    }, 0, baseM);
    if (chubby) v.ell(0, by * 0.8, bz * 0.38, bx * 0.82, by * 0.78, bz * 0.72, 0, baseM);
    else if (spec.body !== 'slim') v.ell(0, by * 0.75, bz * 0.3, bx * 0.72, by * 0.65, bz * 0.7, 0, baseM);
  }

  const front = (x, y) => v.frontZ(x, y);
  const yw = Math.round(H * 0.42); // waist line

  // dilate: grow a one-voxel layer over the surface where region(x,y,z) holds
  const dilate = (region, m) => v.dilate(region, m);

  // ---------------------------------------------------------------- species extras
  if (sp === 'armadillo') {
    // banded shell over the back, wrapping the shoulders and flanks so it reads from the front
    const shellR = (x, y, z) => y > 1.5 && y < H + 0.5 && (z < bz * 0.25 || (Math.abs(x + 0.5) > bx * 0.62 && z < bz * 0.7) || y > H - 3.5);
    dilate(shellR, SHELL);
    dilate((x, y, z) => shellR(x, y, z) && (y + 40) % 3 !== 0, SHELL); // ridges between the bands
  }

  // ---------------------------------------------------------------- outfits
  const bibHalf = Math.max(4, Math.round(bx * 0.6));
  const bibTop = H - 3;
  const outfitInfo = { bibTop, bibHalf, yw };
  if (outfit === 'overalls') {
    dilate((x, y, z) => z > 1 && Math.abs(x + 0.5) < bibHalf && y >= yw - 1 && y < bibTop, CLOTH);
    // straps: front above the bib, over the shoulders, down the back
    const sx = bibHalf - 1.5;
    const onStrap = (x, y, z) => Math.abs(Math.abs(x + 0.5) - sx) < 1.1 && ((z > 1 && y >= bibTop - 1) || (z <= 1 && z >= -1 && y >= H - 2) || (z < -1 && y >= yw - 1));
    dilate(onStrap, STRAP);
    // bib pocket on top of the bib
    const py0 = bibTop - 7, py1 = bibTop - 2;
    dilate((x, y, z) => z > 2 && Math.abs(x + 0.5) < 3.1 && y >= py0 && y < py1 && v.m(x, y, z - 1) === CLOTH, POCKET);
    outfitInfo.pocket = [py0, py1];
    // brass buckles where the straps meet the bib
    for (const s of [-1, 1]) {
      const bxp = s > 0 ? Math.round(sx - 1) : -Math.round(sx - 1) - 2;
      for (let x = bxp; x < bxp + 2; x++) for (let y = bibTop - 2; y < bibTop; y++) {
        const z = front(x, y);
        if (isFinite(z)) v.set(x, y, z + 1, (y === bibTop - 1 && x === bxp) ? 0xfff0a0 : y === bibTop - 2 && x === bxp + 1 ? 0x9a7428 : BRASS);
      }
    }
    // side buttons at the waist
    for (const s of [-1, 1]) {
      const x = s > 0 ? Math.round(bx * 0.82) : -Math.round(bx * 0.82) - 1;
      const z = front(x, yw);
      if (isFinite(z)) v.set(x, yw, z + 1, BRASS);
    }
  } else if (outfit === 'apron') {
    const ah = Math.max(4, Math.round(bx * 0.66));
    dilate((x, y, z) => z > 1 && Math.abs(x + 0.5) < ah && y >= 0 && y < H - 3, CLOTH);
    // neck loop and waist ties
    dilate((x, y, z) => (Math.abs(Math.abs(x + 0.5) - (ah - 1.5)) < 1.1 && z > 1 && y >= H - 4) || (y >= H - 2 && z <= 1 && Math.abs(x + 0.5) < ah), STRAP);
    dilate((x, y, z) => (y === yw || y === yw + 1) && z <= 1, STRAP);
    // big front pocket
    dilate((x, y, z) => z > 2 && Math.abs(x + 0.5) < 4.1 && y >= yw - 4 && y < yw && v.m(x, y, z - 1) === CLOTH, POCKET);
    outfitInfo.pocket = [yw - 4, yw];
    // bow at the back
    const bzk = v.backZ(0, yw) - 1;
    if (isFinite(bzk)) {
      const tc = dk(oc, 0.1);
      v.ell(-0.5, yw + 0.5, bzk, 1.2, 1.2, 1.2, tc);
      for (const s of [-1, 1]) {
        v.ell(s * 3, yw + 1, bzk - 0.5, 2.2, 1.6, 1, lt(tc, 0.08));
        v.line(s * 1, yw - 1, bzk - 0.5, s * 2.5, yw - 4.5, bzk - 1.5, tc, 0.6);
      }
    }
    // a wooden spoon peeking out of the pocket
    if (h3(1, 2, 3, seed) < 0.5) {
      const z = front(2, yw - 1);
      if (isFinite(z)) for (let y = yw - 2; y < yw + 3; y++) v.set(2, y, z + 1, y >= yw + 1 ? 0xb8864a : 0x9a6a3a);
    }
  } else if (outfit === 'dress') {
    // flared skirt from the waist down, past the body bottom
    const skirt = (x, y, z) => {
      if (y >= yw + 1 || y < -2) return false;
      const k = 1 + (yw + 1 - y) * 0.035 + 0.08;
      const ty = (Math.max(y, 0.5) - by) / by;
      const sx = bx * k + 0.6, sz = bz * k + 0.6;
      return Math.abs(x / sx) ** 2.4 + Math.abs(Math.max(ty, -0.86)) ** 2.4 * 0.35 + Math.abs(z / sz) ** 2.4 <= 1;
    };
    v.fill(-bx - 6, bx + 6, -2, yw + 1, -bz - 6, bz + 6, (x, y, z) => skirt(x, y, z) && !v.has(Math.floor(x), Math.floor(y), Math.floor(z)), 0, CLOTH2);
    // white collar at the neck front
    dilate((x, y, z) => z > 2 && y >= H - 3 && Math.abs(x + 0.5) < 5 && Math.abs(x + 0.5) > 0.5, COLLAR);
    // waist sash
    dilate((x, y, z) => y === yw + 1 || y === yw + 2, SASH);
  } else if (outfit === 'vest' || outfit === 'suit') {
    // collar points of the shirt underneath
    dilate((x, y, z) => z > 2 && y >= H - 2 && Math.abs(x + 0.5) < 4 && Math.abs(x + 0.5) > 0.5, COLLAR);
    if (outfit === 'suit') {
      // lapels on each side of the V
      dilate((x, y, z) => {
        if (z < 2 || y < yw + 1 || y >= H - 1) return false;
        const vHalf = 1.2 + (y - yw) * 0.45;
        const ax = Math.abs(x + 0.5);
        return ax >= vHalf && ax < vHalf + 1.6;
      }, STRAP);
      // red tie
      for (let y = yw - 1; y < H - 1; y++) {
        const w = y >= H - 3 ? 2 : 1; // the knot is wider
        for (let x = -w; x < w; x++) {
          const z = front(x, y);
          if (isFinite(z)) v.setM(x, y, z + 1, TIE);
        }
      }
      // pocket square
      const px = -Math.round(bx * 0.5) - 1;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]]) {
        const z = front(px + dx, H - 6 + dy);
        if (isFinite(z)) v.set(px + dx, H - 6 + dy, z + 1, dy === 2 ? 0xc94a3a : 0xf8f4ec);
      }
    } else {
      // vest buttons down the right edge of the opening
      for (let y = yw; y < H - 3; y += 2) {
        const z = front(1, y);
        if (isFinite(z)) v.set(1, y, z + 1, y % 4 === yw % 4 ? BRASS : dk(BRASS, 0.15));
      }
    }
  } else if (outfit === 'shirt') {
    dilate((x, y, z) => z > 2 && y >= H - 3 && Math.abs(x + 0.5) < 5 && Math.abs(x + 0.5) > 0.5, COLLAR);
    // hem band
    if (!baby) dilate((x, y, z) => y === yw - 2, CLOTH2);
  }

  // ---------------------------------------------------------------- scarf
  if (spec.scarf) {
    const sc = spec.scarf;
    const ry = H - 1.6, rxR = bx * 0.72, rzR = bz * 0.74;
    const tube = 2.3;
    v.fill(-bx - 3, bx + 3, H - 5, H + 2, -bz - 3, bz + 3, (x, y, z) => {
      if (v.has(Math.floor(x), Math.floor(y), Math.floor(z))) return false;
      const a = Math.atan2(z / rzR, x / rxR);
      const cx = Math.cos(a) * rxR, cz = Math.sin(a) * rzR;
      const d = Math.hypot(x - cx, (y - ry) * 1.15, z - cz);
      return d < tube + (Math.abs(x) < bx * 0.5 && z > 0 ? 0.6 : 0);
    }, 0, SCARF);
    // knot at front right with two hanging tails
    const kx = Math.round(bx * 0.36), kz = Math.max(...[-1, 0, 1].map((d) => front(kx + d, H - 2))) + 1;
    v.ell(kx + 0.5, H - 2.4, kz + 0.2, 1.8, 1.6, 1.4, 0, SCARF);
    const tails = [[kx - 1, 3, Math.round(H * 0.5) + (chubby ? 1 : 0)], [kx + 2, 3, Math.round(H * 0.36)]];
    for (const [tx, tw, len] of tails) {
      for (let k = 0; k < len; k++) {
        const y = H - 4 - k;
        const sx = tx + Math.round(k * 0.18);
        for (let x = sx; x < sx + tw; x++) {
          const z = front(x, y);
          if (!isFinite(z)) continue;
          const fringe = k === len - 1 && (x - sx) % 2 === 1;
          if (fringe) continue;
          v.set(x, y, z + 1, k >= len - 2 ? lt(sc, 0.25) : (k % 5 === 3) ? lt(sc, 0.3) : (x === sx ? dk(sc, 0.12) : sc));
        }
      }
    }
  }

  // ---------------------------------------------------------------- backpack
  if (spec.backpack) {
    const pz = v.backZ(0, Math.round(by)) - 2.6;
    const pw = Math.round(bx * 0.68), ph = Math.round(by * 0.82);
    v.ell(0, by * 1.02, pz, pw, ph, 3, 0, PACK, 3.2);
    // flap and buckle
    v.fill(-pw, pw, by * 1.02, by * 1.02 + ph + 1, pz - 4.5, pz + 2, (x, y, z) => {
      const t = (y - by * 1.02) / ph;
      return Math.abs(x / (pw + 0.4)) ** 3.2 + Math.abs(t) ** 3.2 + Math.abs((z - pz) / 3.4) ** 3.2 <= 1 && z < pz - 1.2 && !v.has(Math.floor(x), Math.floor(y), Math.floor(z));
    }, 0, PACK2);
    const bkz = v.backZ(0, Math.round(by * 1.02)) - 1;
    v.box(-1, Math.round(by * 1.02) - 1, bkz, 1, Math.round(by * 1.02) + 1, bkz + 1, BRASS);
    v.set(-1, Math.round(by * 1.02), bkz, 0xfff0a0);
    // bedroll on top
    const ry0 = Math.round(by * 1.02 + ph) + 1.2;
    v.fill(-pw - 1, pw + 1, ry0 - 2.4, ry0 + 2.4, pz - 2.5, pz + 2.5, (x, y, z) => (y - ry0) ** 2 + (z - pz) ** 2 <= 2.3 ** 2 && Math.abs(x) < pw + 0.5, (x) => (Math.abs(x + 0.5) > pw - 2 && Math.abs(x + 0.5) < pw - 0.5 ? 0x5a3a22 : x % 3 === 0 ? 0xb8463a : 0xc85848));
    // shoulder straps on the front
    for (const s of [-1, 1]) {
      const sx = s > 0 ? Math.round(bx * 0.5) : -Math.round(bx * 0.5) - 2;
      for (let y = Math.round(H * 0.45); y < H; y++) for (let x = sx; x < sx + 2; x++) {
        const z = front(x, y);
        if (isFinite(z) && z > 0 && v.m(x, y, z) !== SCARF) v.set(x, y, z + 1, y === Math.round(H * 0.6) ? BRASS : 0x6a4222);
      }
    }
  }

  // hedgehog back quills: a striated mat with bold spikes
  if (sp === 'hedgehog') {
    const backR = (x, y, z) => y >= H * 0.25 && z < bz * 0.05 - Math.abs(x) * 0.08;
    dilate(backR, QUILL);
    dilate((x, y, z) => backR(x, y, z) && y >= H * 0.35, QUILL);
    const spikes = [];
    for (let z = -bz - 3; z < bz * 0.2; z += 4)
      for (let y = Math.round(H * 0.35); y < H + 2; y += 4)
        for (let x = -bx - 3; x <= bx + 2; x += 3) {
          const xx = x + ((y / 3 | 0) & 1), zz = z + ((x + 33) % 3 === 0 ? 1 : 0);
          if (v.m(xx, y, zz) !== QUILL || v.exposure(xx, y, zz) === 0) continue;
          spikes.push([xx, y, zz]);
        }
    for (const [xx, y, zz] of spikes) {
      const nx = xx / bx * 0.6, ny = (y - by) / by * 0.4 + 0.35, nz = -1;
      const L = Math.hypot(nx, ny, nz) || 1;
      const len = 3 + h3(xx, y, zz, seed) * 2;
      for (let k = 1; k <= Math.ceil(len); k++) {
        const qx = Math.floor(xx + 0.5 + (nx / L) * k), qy = Math.floor(y + 0.5 + (ny / L) * k), qz = Math.floor(zz + 0.5 + (nz / L) * k);
        if (v.has(qx, qy, qz)) continue;
        v.set(qx, qy, qz, k >= Math.ceil(len) ? 0xf2e6c8 : k >= Math.ceil(len) - 1 ? 0xa07a50 : 0x4a2e1c);
      }
    }
  }

  // tailoring: the grown-up build gets all of it, the chibi build the bits that suit it
  tallDetails(v, spec, p, { H, bx, by, bz, yw, outfit, bibTop, bibHalf, front, dilate, seed, fur, chibi: !p.tall });

  // ---------------------------------------------------------------- paint
  const dirt = Math.round((spec.dirt ?? 0.4) * 10) / 10; // quantized like the cache key
  const dustC = darkFur ? 0x8a6a48 : 0x5a4028;
  const spots = [];
  const nSpots = Math.round(dirt * 5);
  for (let i = 0; i < nSpots; i++) {
    const low = rng() < 0.72;
    const a = rng.range(-Math.PI, Math.PI);
    const sx = Math.cos(a) * bx * 0.85, sy = low ? rng.range(0, H * 0.45) : rng.range(H * 0.45, H * 0.9), sz = Math.sin(a) * bz * 0.85 + (rng() < 0.6 ? bz * 0.3 : 0);
    const r = rng.range(2.2, 3.6), dusty = rng() < 0.5, al = rng.range(0.28, 0.45);
    // grown-ups: darker, fainter grime (pale dust blotches read as camouflage on a big shirt)
    if (p.tall) spots.push({ x: sx, y: sy * 0.8, z: sz, r: r * 0.9, c: 0x4a3420, a: al * 0.62 });
    else spots.push({ x: sx, y: sy, z: sz, r, c: dusty ? dustC : 0x4a3420, a: al });
  }
  // contact shadow where the head sits on the shoulders
  const neckShade = (c, x, y, z, e) => {
    if (!(e & PY) || y < H - 5) return c;
    const r = Math.hypot((x + 0.5) / (bx * 0.95), (z + 0.5) / (bz * 0.95));
    return r < 0.9 ? dk(c, 0.28 * (1 - r / 0.9) + 0.08) : c;
  };
  const grime = (c, x, y, z) => {
    // grime gathers at hems and low on the body: a smooth band with a dithered top edge
    const lim = 1 + dirt * 3.5;
    if (y < lim) {
      const k = (lim - y) / lim;
      if (k > 0.35 || ((x + y + z) & 1)) return smudge(mix(c, 0x4a3420, dirt * 0.4 * Math.min(1, k + 0.3)), x, y, z, spots, seed);
    }
    return smudge(c, x, y, z, spots, seed);
  };
  const belly = sp === 'badger' ? 0x2a2a2c : sp === 'fox' ? 0xf4efe6 : sp === 'frog' ? mix(fur, 0xf0f0c0, 0.5) : sp === 'hedgehog' ? lt(fur, 0.2) : mix(fur, 0xf6e8d8, darkFur ? 0.26 : 0.34);
  const inBelly = (x, y, z) => {
    if (z < bz * 0.2) return false;
    const a = (x + 0.5) / (bx * 0.62), b = (y + 0.5 - by * 0.92) / (by * 0.78);
    return a * a + b * b < 1;
  };
  const backDark = (c, z) => (z < -bz * 0.4 ? dk(c, z < -bz * 0.75 ? 0.13 : 0.07) : c);

  // patches (sewn-on squares with stitches)
  const patchList = [];
  const nPatch = outfit === 'none' ? 0 : spec.patches || 0;
  const pc = [[-bx * 0.5, yw * 0.45, 'f'], [bx * 0.45, H * 0.68, 'f'], [bx * 0.3, yw * 0.5, 'b'], [-bx * 0.3, H * 0.7, 'b']];
  for (let i = 0; i < Math.min(nPatch, 3); i++) {
    const c = pc[(i + (seed % 2)) % pc.length];
    patchList.push({ x: Math.round(c[0]) - 2, y: Math.round(c[1]) - 2, w: 4 + (i % 2), h: 4, face: c[2], col: PATCH_COLORS[(seed + i * 3) % PATCH_COLORS.length], plaid: (seed + i) % 3 === 0 });
  }
  const patchAt = (x, y, z) => {
    for (const pt of patchList) {
      if ((pt.face === 'f' && z < 1) || (pt.face === 'b' && z > -1)) continue;
      if (x >= pt.x && x < pt.x + pt.w && y >= pt.y && y < pt.y + pt.h) {
        const edge = x === pt.x || x === pt.x + pt.w - 1 || y === pt.y || y === pt.y + pt.h - 1;
        if (edge) return (x + y) % 2 ? THREAD : dk(pt.col, 0.1);
        return pt.plaid && ((x - pt.x) % 2 === 0 || (y - pt.y) === 2) ? dk(pt.col, 0.18) : pt.col;
      }
    }
    return -1;
  };

  const ocTwill = (x, y, z) => (outfit === 'overalls' ? oc : fabricAt(oc, fabric, x, y, z));
  const tee = spec.shirt && spec.age !== 'baby' ? spec.shirt : 0; // a shirt under the overalls / apron
  const torsoCloth = (x, y, z) => {
    // what the torso surface is wearing at this point (null = fur)
    if (outfit === 'overalls') return y < yw ? 'pants' : tee ? 'tee' : null;
    if (outfit === 'apron' && tee && y >= yw - 2) return 'tee';
    if (outfit === 'shirt') return y >= yw - 2 || baby ? 'shirt' : 'shorts';
    if (outfit === 'dress') return 'dress';
    if (outfit === 'vest') {
      const open = z > 1 && Math.abs(x + 0.5) < 1.2 + Math.max(0, y - yw) * 0.28 && y >= yw - 3;
      if (y < yw - 3) return 'trousers';
      return open ? 'under' : 'vest';
    }
    if (outfit === 'suit') {
      const vHalf = 1.2 + (y - yw) * 0.45;
      if (y < yw - 3) return 'trousers';
      if (z > 1 && y >= yw + 1 && Math.abs(x + 0.5) < vHalf) return 'under';
      return 'jacket';
    }
    if (outfit === 'apron') return y < yw - 2 ? 'trousers' : null;
    return null;
  };

  const furPaint = (x, y, z, e) => {
    const cl = torsoCloth(x, y, z);
    let c;
    if (cl) {
      if (cl === 'pants') c = ocTwill(x, y, z);
      else if (cl === 'shirt' || cl === 'dress' || cl === 'vest' || cl === 'jacket') c = fabricAt(oc, cl === 'vest' || cl === 'jacket' ? 'plain' : fabric, x, y, z);
      else if (cl === 'shorts' || cl === 'trousers') c = cl === 'trousers' && outfit === 'suit' ? dk(oc, 0.25) : TROUSERS;
      else if (cl === 'under') c = SHIRT_UNDER;
      else if (cl === 'tee') c = fabricAt(tee, fabric === 'plain' && (spec.seed & 1) ? 'plaid' : fabric, x, y, z);
      // seams: side seams and a waist seam
      if ((cl === 'pants' || cl === 'trousers' || cl === 'shorts') && y === yw - 1 - (cl === 'pants' ? 0 : 3)) c = dk(c, 0.18);
      if ((e & (PX | NX)) && !(e & (PZ | NZ)) && Math.abs(z) < 1 && cl !== 'under') c = dk(c, 0.1);
      if (cl === 'vest' && y === yw - 3) c = dk(c, 0.2);
      if (cl === 'jacket' && (x === 0 || x === -1) && y < yw && y >= yw - 3 && z > 0) c = dk(c, 0.2);
      if (cl === 'vest' && z > 1 && y === yw + 1 && Math.abs(Math.abs(x + 0.5) - bx * 0.5) < 1.6) c = dk(c, 0.35);
      const pt = patchAt(x, y, z);
      if (pt >= 0 && cl !== 'under') c = pt;
      if (e & PY) c = lt(c, 0.05);
    } else {
      c = sp === 'molerat' ? fur : inBelly(x, y, z) ? belly : fur;
      if (sp === 'badger') c = z > bz * 0.25 ? 0x2a2a2c : fur;
      c = backDark(c, z);
      c = furColor(c, x, y, z, e, seed, darkFur ? 1.25 : 1);
    }
    return grime(neckShade(c, x, y, z, e), x, y, z);
  };
  const skinPaint = (x, y, z, e) => {
    const cl = torsoCloth(x, y, z);
    if (cl) return furPaint(x, y, z, e);
    let c = fur;
    if ((y + Math.round(Math.sin(x * 0.4 + z * 0.3))) % 3 === 0 && z < bz * 0.5) c = dk(c, 0.12);
    if (inBelly(x, y, z)) c = lt(c, 0.1);
    return grime(c, x, y, z);
  };
  const clothPaint = (x, y, z, e) => {
    let c = outfit === 'overalls' ? ocTwill(x, y, z) : fabricAt(oc, outfit === 'apron' ? 'plain' : fabric, x, y, z);
    if (outfit === 'overalls') {
      // stitching just inside the bib edge
      const ax = Math.abs(x + 0.5);
      if ((Math.abs(ax - (bibHalf - 1)) < 0.6 && y < bibTop - 1) || (y === bibTop - 2 && ax < bibHalf - 1)) { if ((x + y) % 2 === 0) c = lt(c, 0.32); }
      if (y === bibTop - 1) c = dk(c, 0.12);
    }
    if (outfit === 'apron') {
      const ax = Math.abs(x + 0.5);
      if (ax > Math.max(4, Math.round(bx * 0.66)) - 1.5 && (y + x) % 2 === 0) c = lt(c, 0.25);
      if (y <= 0) c = dk(c, 0.12);
      // stains
      if (h3(x >> 1, y >> 1, 3, seed) < 0.1) c = mix(c, h3(x, y, 1, seed) < 0.5 ? 0x8a4a2a : 0x6a5030, 0.45);
    }
    const pt = patchAt(x, y, z);
    if (pt >= 0) c = pt;
    if (e & PY) c = lt(c, 0.06);
    return grime(neckShade(c, x, y, z, e), x, y, z);
  };
  const cloth2Paint = (x, y, z, e) => {
    let c = fabricAt(oc, fabric, x, y, z);
    if (outfit === 'dress') {
      // folds and a lacy hem
      if ((e & (PX | NX | NZ)) && (Math.round(Math.atan2(z, x) * 2.6) & 1) && y < yw - 1) c = dk(c, 0.07);
      if (y <= -1) c = (x + z + 99) % 3 === 0 ? lt(c, 0.6) : lt(c, 0.38);
      else if (y === 0) c = dk(c, 0.1);
    } else c = dk(c, 0.12);
    if (e & PY) c = lt(c, 0.05);
    return grime(c, x, y, z);
  };
  const strapPaint = (x, y, z, e) => {
    let c = outfit === 'apron' ? dk(oc, 0.1) : outfit === 'suit' ? dk(oc, 0.22) : dk(oc, 0.16);
    if (outfit === 'overalls' && (e & (PZ | NZ)) && (y % 2 === 0) && Math.abs(Math.abs(x + 0.5) - (bibHalf - 1.5)) < 0.6) c = lt(c, 0.22);
    if (e & PY) c = lt(c, 0.06);
    return grime(neckShade(c, x, y, z, e), x, y, z);
  };
  const pocketPaint = (x, y, z, e) => {
    let c = dk(oc, 0.06);
    const [p0, p1] = outfitInfo.pocket || [0, 0];
    if (y === p1 - 1) c = dk(oc, 0.35);
    else if ((y === p0 || Math.abs(Math.abs(x + 0.5) - (outfit === 'apron' ? 3.5 : 2.5)) < 0.6) && (x + y) % 2 === 0) c = lt(c, 0.38);
    return grime(c, x, y, z);
  };
  const scarfPaint = (x, y, z, e) => {
    const sc = spec.scarf;
    let c = sc;
    const a = Math.atan2(z, x);
    if ((Math.round(a * 4.5) & 3) === 0) c = lt(sc, 0.22);
    if (e & NY) c = dk(c, 0.18);
    if ((x + y * 2 + z) % 4 === 0) c = dk(c, 0.06); // knit texture
    return smudge(c, x, y, z, spots.slice(0, 2), seed);
  };
  const packPaint = (x, y, z, e) => {
    let c = 0x8a5a2a;
    if ((e & (PX | NX)) && Math.abs(y - by) < 1) c = dk(c, 0.25);
    if ((x + 40) % 6 === 0 && (e & NZ)) c = dk(c, 0.1);
    return grime(c, x, y, z);
  };
  const pack2Paint = (x, y, z, e) => {
    let c = 0x6a4220;
    if (e & NY) c = dk(c, 0.2);
    if ((e & NZ) && (x + y) % 3 === 0 && Math.abs(x + 0.5) > 2) c = lt(c, 0.06);
    return grime(c, x, y, z);
  };
  const shellPaint = (x, y, z, e) => {
    // armour bands: a clear grey-brown, darker grooves every third row, lit ridge tops
    const base = mix(fur, 0x8a7868, 0.6);
    const band = (y + 40) % 3 === 0;
    let c = band ? dk(base, 0.32) : base;
    if (!band && (e & PY)) c = lt(c, 0.18);
    if (!band && ((x + 40 + ((y / 3) | 0)) % 4 === 0) && (e & (PX | NX | NZ))) c = dk(c, 0.12); // scutes
    return grime(c, x, y, z);
  };
  const collarPaint = (x, y, z, e) => {
    let c = outfit === 'dress' ? 0xf8f4ec : outfit === 'shirt' ? lt(oc, 0.5) : tee && (outfit === 'overalls' || outfit === 'apron') ? dk(tee, 0.12) : 0xf4efe4;
    if (y === H - 3 || (e & NY)) c = dk(c, 0.1);
    return c;
  };
  const tiePaint = (x, y) => (y >= H - 3 ? 0xa83a32 : y % 3 === 0 ? 0xd85a4a : 0xc94a3a);
  const sashPaint = (x, y, z, e) => (y === yw + 2 ? lt(dk(oc, 0.3), 0.05) : dk(oc, 0.3));

  const beltC = outfit === 'suit' ? 0x2a2224 : 0x5a3a24;
  const beltPaint = (x, y, z, e) => {
    let c = beltC;
    if (e & PY) c = lt(c, 0.12);
    else if (e & NY) c = dk(c, 0.22);
    else if ((x + 40) % 3 === 0 && (e & (PZ | NZ))) c = dk(c, 0.08); // stitched edge
    return grime(c, x, y, z);
  };
  const leatherPaint = (x, y, z, e) => {
    let c = 0x7a5232;
    if (e & PY) c = lt(c, 0.14);
    else if (e & NY) c = dk(c, 0.25);
    if ((e & PZ) && h3(x, y, z, seed + 9) < 0.12) c = lt(c, 0.1); // scuffs
    return grime(c, x, y, z);
  };
  const tuftPaint = (x, y, z, e) => {
    const cl = torsoCloth(x, y, z);
    let c = cl && z > 0 ? lt(belly, 0.12) : backDark(fur, z);
    if (e & PY) c = lt(c, 0.1);
    return c;
  };
  const ironPaint = (x, y, z, e) => ((e & PY) ? 0x9a9aa4 : (e & PZ) ? 0x6a6a74 : 0x4a4a54);
  const handlePaint = (x, y) => ((y + 40) % 4 === 0 ? 0x6a4226 : 0x8a5a32);
  v.resolve({ [FUR]: furPaint, [SKIN]: skinPaint, [CLOTH]: clothPaint, [CLOTH2]: cloth2Paint, [STRAP]: strapPaint, [POCKET]: pocketPaint, [SCARF]: scarfPaint, [PACK]: packPaint, [PACK2]: pack2Paint, [SHELL]: shellPaint, [COLLAR]: collarPaint, [TIE]: tiePaint, [SASH]: sashPaint, [QUILL]: (x, y, z) => ((x + 99) % 3 === 0 ? 0x5a3a22 : 0x3a2416),
    [BELT]: beltPaint, [LEATHER]: leatherPaint, [TUFT]: tuftPaint, [IRON]: ironPaint, [HANDLE]: handlePaint });
  return { geo: v.geometry(bake), info: { yw, bibTop } };
}

// ---------------------------------------------------------------- grown-up details
/**
 * The tall build's extra tailoring (all on the torso grid, before painting): under-shirt collars,
 * a button placket and a chest pocket on shirts, belts with a brass buckle and loops, a tool belt
 * with a pouch and a hammer, a watch chain on waistcoats, a fur tuft at the open collar and
 * a ragged fur fringe where the fur shows.
 */
function tallDetails(v, spec, p, o) {
  const { H, bx, bz, yw, outfit, front, dilate, seed, chibi } = o;
  if (spec.age === 'baby') return;
  const BRASS2 = 0xe8c060;
  const onFront = (x, y, c) => { const z = front(x, y); if (isFinite(z)) v.set(x, y, z + 1, c); return z; };
  const tee = spec.shirt && (outfit === 'overalls' || outfit === 'apron');
  // collars: the under-shirt's points show above the bib; open collars get a tuft of chest fur
  if (tee) dilate((x, y, z) => z > 2 && y >= H - 3 && Math.abs(x + 0.5) < 5 && Math.abs(x + 0.5) > 1.5, COLLAR);
  if (outfit === 'shirt' || outfit === 'vest' || tee) dilate((x, y, z) => z > 2 && y >= H - 4 && Math.abs(x + 0.5) < 1.6 && ((x + y) & 1) === 0, TUFT);
  // shirts: a placket with buttons down the middle and a chest pocket with a flap
  if (outfit === 'shirt' && spec.age !== 'kid') {
    for (let y = yw - 1; y < H - 4; y++) {
      onFront(-1, y, dk(spec.outfitColor, 0.2));
      if ((y - yw) % 3 === 0) onFront(0, y, 0xf4ecdc);
    }
    const px = Math.round(bx * 0.35), py = H - 9;
    for (let x = px; x < px + 4; x++) for (let y = py; y < py + 4; y++) {
      const top = y === py + 3;
      onFront(x, y, top ? dk(spec.outfitColor, 0.25) : (x === px || x === px + 3 || y === py) && (x + y) % 2 ? lt(spec.outfitColor, 0.3) : dk(spec.outfitColor, 0.06));
    }
    onFront(px + 1, py + 2, 0xf4ecdc);
    // a pencil in the pocket
    if (seed % 3 === 0) for (let y = py + 3; y < py + 6; y++) onFront(px + 2, y, y === py + 5 ? 0xf09aa6 : 0xe0b030);
  }
  // waistcoats: a gold watch chain from a button to the pocket
  if ((outfit === 'vest' || outfit === 'suit') && (spec.age === 'elder' || seed % 2 === 0)) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([Math.round(1 + t * (bx * 0.55)), Math.round(yw + 3 - Math.sin(t * Math.PI) * 2.2 - t)]); }
    for (const [x, y] of pts) onFront(x, y, (x + y) % 2 ? BRASS2 : 0xb08a30);
  }
  // belts
  const belt = spec.belt || 0;
  if (belt && outfit !== 'dress') {
    const low = outfit === 'overalls' || outfit === 'apron';
    const by0 = low ? yw - (chibi ? 3 : 4) : yw - 2, by1 = by0 + 2;
    dilate((x, y) => y >= by0 && y < by1, BELT);
    // buckle: a brass frame with a dark tongue, off the middle on a tool belt
    const bxk = belt === 2 ? 1 : -2;
    for (let x = bxk; x < bxk + 4; x++) for (let y = by0 - 1; y <= by1; y++) {
      const z = front(x, y);
      if (!isFinite(z)) continue;
      const edge = x === bxk || x === bxk + 3 || y === by0 - 1 || y === by1;
      v.set(x, y, z + 1, edge ? (y === by1 ? BRASS2 : 0xc8a048) : (x === bxk + 1 ? 0x3a2a1a : 0x5a3a24));
    }
    // loops
    for (const lx of [-Math.round(bx * 0.6), Math.round(bx * 0.6) - 1]) for (let y = by0 - 1; y <= by1; y++) onFront(lx, y, 0x4a2e1c);
    if (belt === 2 && chibi) {
      // a chubby little pouch on the hip
      const pxc = Math.round(bx * 0.62), pz = Math.round(bz * 0.35);
      v.fill(pxc - 2, pxc + 2, by0 - 4, by1, pz - 2, pz + 2, (x, y, z) => Math.abs(x - pxc) <= 1.9 && y >= by0 - 3.5 && Math.abs(z - pz) <= 1.8 && !v.has(Math.floor(x), Math.floor(y), Math.floor(z)), 0, LEATHER);
    }
    if (belt === 2 && !chibi) {
      // a leather pouch on the right hip, a hammer hanging in a loop on the left
      const pxc = Math.round(bx * 0.72), pz = Math.round(bz * 0.2);
      v.fill(pxc - 2.5, pxc + 2.5, by0 - 6, by1, pz - 2.5, pz + 2.5, (x, y, z) => Math.abs(x - pxc) <= 2.4 && y >= by0 - 5.5 && Math.abs(z - pz) <= 2.2 && !v.has(Math.floor(x), Math.floor(y), Math.floor(z)) && Math.abs(x) > bx * 0.55, 0, LEATHER);
      v.fill(pxc - 3, pxc + 3, by0 - 1, by1 + 1, pz - 3, pz + 3, (x, y, z) => Math.abs(x - pxc) <= 2.9 && y >= by0 - 0.5 && Math.abs(z - pz) <= 2.7 && !v.has(Math.floor(x), Math.floor(y), Math.floor(z)), 0, BELT);
      const hx = -Math.round(bx * 0.82) - 1, hz = Math.round(bz * 0.15);
      for (let y = by0 - 9; y < by0 + 1; y++) for (const dx of [0, -1]) if (!v.has(hx + dx, y, hz)) v.setM(hx + dx, y, hz, HANDLE);
      v.fill(hx - 3, hx + 2, by0 + 1, by0 + 3, hz - 3, hz + 4, (x, y, z) => !v.has(Math.floor(x), Math.floor(y), Math.floor(z)), 0, IRON);
    }
  }
  // a ragged fringe of fur where the fur shows (flanks and back), so the outline reads furry
  // (not on the round chibi bodies: their silhouette stays clean and blocky)
  if (!chibi && spec.species !== 'molerat' && spec.species !== 'frog' && spec.species !== 'armadillo') {
    const furry = outfit === 'none' || ((outfit === 'overalls' || outfit === 'apron') && !tee);
    dilate((x, y, z) => {
      if (y < 2 || y > H - 2) return false;
      if (!furry && y > yw - (outfit === 'overalls' ? 0 : 3)) return false;
      if (outfit !== 'none' && y < yw) return false;
      const side = Math.abs(x + 0.5) > bx * 0.78 || z < -bz * 0.6;
      return side && h3(x >> 1, y, z >> 1, seed + 21) < 0.09;
    }, TUFT);
  }
}

// ---------------------------------------------------------------- tails
/** Tail geometry; origin at the root, extending toward -z. */
export function buildTail(spec, bake) {
  const sp = spec.species;
  const fur = spec.fur;
  return cached(`tail|${sp}|${fur}|${spec.age}|${bake}`, () => {
    const v = new Vox(-7, 7, -4, 16, -22, 3);
    if (sp === 'fox') {
      // big bushy tail curving up, white tip
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const z = -2 - t * 14, y = 1 + t * t * 7;
        const r = 2.4 + Math.sin(t * Math.PI) * 2.6;
        v.ell(0, y, z, r, r, 2.2, (x, yy, zz) => (t > 0.82 ? 0xf6f2ea : furColor(fur, x, yy, zz, NZ, 33)));
      }
    } else if (sp === 'rabbit') {
      v.ell(0, 1.5, -1.5, 3.4, 3.2, 3, (x, y, z) => (h3(x, y, z, 5) < 0.3 ? 0xe8e4dc : 0xfaf8f2));
      for (let k = 0; k < 6; k++) v.set(Math.round(Math.cos(k) * 3), Math.round(1.5 + Math.sin(k * 2) * 3), -3 - (k % 2), 0xfaf8f2);
    } else if (sp === 'badger') {
      v.ell(0, 1, -3.5, 2.4, 2.2, 4.2, (x, y, z) => (z < -6 ? lt(fur, 0.25) : fur));
    } else if (sp === 'armadillo') {
      for (let i = 0; i < 12; i++) {
        const r = 2 - i * 0.13;
        v.ell(0, 0.5 - i * 0.18, -1 - i, r, r, 0.9, i % 2 ? mix(fur, 0x9a8878, 0.35) : dk(mix(fur, 0x9a8878, 0.35), 0.22));
      }
    } else if (sp === 'shrew' || sp === 'molerat') {
      v.line(0, 0.5, 0, 0, -0.5, -12, sp === 'molerat' ? dk(fur, 0.05) : dk(fur, 0.15), 0.9);
    } else if (sp === 'vole') {
      v.line(0, 0.5, 0, 0, 0, -6, dk(fur, 0.12), 1.2);
    } else if (sp === 'starnose') {
      // the star-nosed mole's chunky ringed tail
      for (let i = 0; i < 9; i++) v.ell(0, 0.6 - i * 0.12, -1 - i, 1.8, 1.8, 0.8, i % 2 ? dk(fur, 0.1) : fur);
    } else if (sp === 'mole') {
      v.line(0, 0.5, 0, 0, 1.6, -5, SKIN_PINK, 1.1);
      v.set(0, 1, -6, lt(SKIN_PINK, 0.2));
    }
    return v.geometry(bake);
  });
}

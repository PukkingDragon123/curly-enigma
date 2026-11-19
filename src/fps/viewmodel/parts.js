// First-person view-model geometry: the mole's furry forearms, a gripping fist and an open
// spade paw, and every tool (pickaxes by tier, chisel + mallet, brush, drills, x-ray lamps,
// glow stake, support beam, extruded food). All built as hi-res voxels (1 unit = VMV meters,
// set in ViewModel.js), greedy-meshed and cached by their inputs.
//
// Frames (right hand; the left mirrors via scale.x = -1 on its parts):
//   fist  origin = grip centre; the held handle runs along +Y through it; the forearm comes
//         from +Z (wrist at z ≈ +12) and the paw points -Z; back of the paw faces +X.
//   open  origin = palm centre; palm faces -Y, fingers point -Z, wrist at z ≈ +12.
//   tools origin = the point gripped by the fist; their handle runs along +Y.
//   arm   origin = wrist centre; the forearm runs along +Z toward the shoulder.
import { Vox, cached, mix, dk, lt, h3, PX, NX, PY, NY, PZ, NZ } from '../../gfx/char/vox.js';
import { CLAW } from '../../gfx/char/spec.js';
import { GLOVE, leather, stitch, brass, around } from '../../gfx/char/glove.js';
import { ITEMS } from '../../data/items.js';
import { drawIconSmall } from '../../gfx/PixelArt.js';
import { hashStr } from '../../core/util.js';

export const PLAYER_FUR = 0x3a2e2a;
const DIRT = 0x5a4028;
const BRASS = 0xd8b048;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** Soft dirt smudges at fixed spots: [[x, y, z, r], ...] (solid core, faint fringe). */
function smudged(c, x, y, z, spots, amt = 0.3) {
  for (const [sx, sy, sz, r] of spots) {
    const d = ((x + 0.5 - sx) ** 2 + (y + 0.5 - sy) ** 2 + (z + 0.5 - sz) ** 2) / (r * r);
    if (d < 1) return mix(c, DIRT, amt * (d < 0.45 ? 1 : 0.55));
  }
  return c;
}

// ---------------------------------------------------------------- arms
/** Fur along a forearm: staggered tufts that run along the arm, a lighter top and darker belly. */
function armFur(base, x, y, z, seed, k = 1) {
  let c = base;
  if (y < -5) c = dk(c, 0.1);
  else if (y > 6) c = lt(c, 0.06);
  // tufts only on the part near the wrist (the rest runs off-screen toward the shoulder)
  if (z > 80) return z > 120 ? dk(c, 0.06) : c;
  const a = Math.atan2(y, x);
  const ring = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24);
  const zz = z + (ring % 3) * 2 + 40;
  const seg = Math.floor(zz / 8);
  const hh = h3(ring, seg, seed, 3);
  if (hh > 0.66) {
    const p = zz - seg * 8;
    if (p === 2 || p === 3) c = lt(c, 0.13 * k);
    else if (p === 4) c = dk(c, 0.16 * k);
  }
  return c;
}

/** A long furry forearm (wrist at z = 0, running +Z toward the shoulder), a ruff of fur out of the glove. */
export function forearmGeo(fur = PLAYER_FUR, dirt = 1) {
  return cached(`vm-arm-g|${fur}|${dirt}`, () => {
    const L = 170;
    const v = new Vox(-20, 21, -20, 21, -10, L + 1);
    v.fill(-20, 20, -20, 20, 0, L, (x, y, z) => {
      const t = Math.min(1, z / 100);
      const rx = 8.6 + t * 3, ry = 8 + t * 2.6;
      return (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
    }, 0, 1);
    // a ruff of fur spilling out of the glove's gauntlet (its open end is at z ≈ 11)
    v.fill(-20, 20, -20, 20, 6, 17, (x, y, z) => {
      const a = Math.atan2(y, x);
      const ring = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 18);
      const reach = 13 + (ring % 2 ? 2.5 : 0) + (ring % 3 === 0 ? 1.2 : 0);
      const r = 10.4 + (ring % 2) * 1.3 - Math.max(0, z - 11) * 0.55;
      return x * x + y * y <= r * r && z < reach;
    }, 0, 2);
    const spots = dirt ? [[6, 9, 40, 6], [-8, 7, 72, 7], [9, -3, 110, 8], [-3, 11, 128, 6]] : [];
    const cuff = lt(fur, 0.2);
    v.resolve({
      1: (x, y, z) => smudged(armFur(fur, x, y, z, 31), x, y, z, spots, 0.3),
      2: (x, y, z) => {
        let c = armFur(cuff, x, y, z, 32, 1.4);
        if (z > 12) c = lt(c, 0.06); // sunlit tuft tips
        return c;
      },
    });
    return v.geometry(false);
  });
}

// ---------------------------------------------------------------- paws (gloved)
// Wave 17: the paws always wear thick leather work gloves (gfx/char/glove.js): tan hide with
// stitched seams, oiled knuckle patches worn pale on the tops, a darker flared gauntlet with a
// strap and a brass buckle, soot and scuffs; the fingertips are cut open and the claws poke out.
// The voxels stay at the view model's fine size (VMV is well under the size rule's 1/64 m class).
const clawBase = (x, y, z, e) => ((e & NY) || (e & NZ) ? mix(CLAW, 0xb8a888, 0.4) : (e & PY) ? lt(CLAW, 0.25) : CLAW);
const clawTip = (dirt) => (x, y, z, e) => (dirt && (e & NY) ? mix(CLAW, DIRT, 0.45) : (e & PY) ? lt(CLAW, 0.4) : CLAW);
const G_UP = { up: PY, down: NY };
/** Gauntlet shell test (axis along +z through (cx, cy), from z0 to the flared open end z1). */
function gauntletAt(cx, cy, rx, ry, z0, z1, x, y, z, grow = 0) {
  if (z < z0 || z > z1) return false;
  const f = 1 + Math.max(0, z - (z0 + 5)) * 0.012 + grow;
  const qx = (x - cx) / (rx * f), qy = (y - cy) / (ry * f); // (x, y: voxel centres)
  const r = qx * qx + qy * qy;
  const th = 2.4 / Math.min(rx, ry);
  return r <= 1 && r >= (1 - th) * (1 - th);
}
/**
 * The gauntlet: material 7 shell, a thicker rolled rim (also 7) at the open end, a raised strap
 * (8) and its brass buckle and rivets (9). phi0: where the buckle sits (radians, from +x toward +y).
 */
function addGauntlet(v, g) {
  const { cx, cy, rx, ry, z0, z1, phi0 } = g;
  v.fill(cx - rx * 1.4, cx + rx * 1.4, cy - ry * 1.4, cy + ry * 1.4, z0, z1 + 1, (x, y, z) => gauntletAt(cx, cy, rx, ry, z0, z1, x, y, z), 0, 7);
  v.fill(cx - rx * 1.4, cx + rx * 1.4, cy - ry * 1.4, cy + ry * 1.4, z1 - 2, z1 + 1, (x, y, z) => gauntletAt(cx, cy, rx, ry, z1 - 2, z1, x, y, z, 0.07), 0, 7);
  const sz0 = g.strap, sz1 = g.strap + 3;
  v.fill(cx - rx * 1.4, cx + rx * 1.4, cy - ry * 1.4, cy + ry * 1.4, sz0, sz1 + 1, (x, y, z) => gauntletAt(cx, cy, rx, ry, sz0, sz1, x, y, z, 0.085), 0, 8);
  // the buckle: a brass frame standing on the strap (tangent t × axis z), a prong down its middle
  const bx = Math.cos(phi0), by = Math.sin(phi0);
  const R = Math.max(rx, ry) * (1.1 + (sz0 - z0 - 5) * 0.012);
  for (let t = -3; t <= 3; t++) for (let dz = -1; dz <= 4; dz++) {
    const frame = Math.abs(t) === 3 || dz === -1 || dz === 4;
    const prong = t === 0 && dz >= 0 && dz <= 3;
    if (!frame && !prong) continue;
    for (let dr = 0; dr <= 1.2; dr += 0.6) {
      const px = cx + bx * (R + dr) * (rx / Math.max(rx, ry)) - by * t, py = cy + by * (R + dr) * (ry / Math.max(rx, ry)) + bx * t;
      v.setM(Math.floor(px), Math.floor(py), sz0 + dz, 9);
    }
  }
  // the strap's tongue tucked on past the buckle
  for (let t = 4; t <= 8; t++) for (let dz = 0; dz <= 3; dz++) {
    const px = cx + bx * (R + 0.5) * (rx / Math.max(rx, ry)) - by * t, py = cy + by * (R + 0.5) * (ry / Math.max(rx, ry)) + bx * t;
    if (!(t === 8 && (dz === 0 || dz === 3))) v.setM(Math.floor(px), Math.floor(py), sz0 + dz, 8);
  }
  // rivets either side of the side seam, near the rim
  for (const a of [phi0 + 2.2, phi0 + 2.55]) {
    const px = cx + Math.cos(a) * rx * 1.13, py = cy + Math.sin(a) * ry * 1.13;
    v.setM(Math.floor(px), Math.floor(py), z1 - 4, 9);
  }
}
/** Painters for the gauntlet parts (7 cuff, 8 strap, 9 brass), given the shared geometry. */
function gauntletPaint(v, g, seed) {
  const { cx, cy, z1, phi0 } = g;
  return {
    7: (x, y, z, e) => {
      let c = leather(v, x, y, z, e, { ...G_UP, ramp: GLOVE.cuff, k: 3.6, seed, soot: 0.75, wear: 0.6 });
      const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
      const da = Math.abs(((a - phi0 - 2.37 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (z >= z1 - 2) { // the rolled rim: worn paler, a stitch line under it
        c = leather(v, x, y, z, e, { ...G_UP, ramp: GLOVE.cuff, k: 5, seed: seed + 1, soot: 0.3, wear: 1 });
        if (e & NZ) c = GLOVE.cuff[1];
      } else if (z === z1 - 3) c = stitch(c, a * 12, 2);
      else if (da < 0.07 && !(e & NZ)) c = stitch(c, z, 2); // the side seam
      else if (da < 0.16) c = GLOVE.cuff[1];
      if (z === g.z0 || z === g.z0 + 1) c = mix(c, GLOVE.soot, 0.3); // tucked under the glove's wrist
      return c;
    },
    8: (x, y, z, e) => {
      let c = leather(v, x, y, z, e, { ...G_UP, ramp: GLOVE.strap, k: 2.6, seed: seed + 2, soot: 0, wear: 0.8, grain: 0.4 });
      if (z === g.strap || z === g.strap + 3) c = mix(c, GLOVE.thread[1], 0.25); // the strap's stitched edges
      return c;
    },
    9: (x, y, z, e) => brass((e & PY ? 5 : e & NY ? 1.5 : 3.4) + (h3(x, y, z, seed + 4) < 0.25 ? -1 : 0) + (around(v, x, y, z) <= 8 ? 1 : 0)),
  };
}
/** The cut-open fingertip: a pale rolled edge, dark where the claw comes out of it. */
function rimPaint(v, seed) {
  return (x, y, z, e) => {
    const nearClaw = v.m(x + 1, y, z) === 3 || v.m(x - 1, y, z) === 3 || v.m(x, y + 1, z) === 3 || v.m(x, y - 1, z) === 3 || v.m(x, y, z + 1) === 3 || v.m(x, y, z - 1) === 3;
    if (nearClaw) return GLOVE.cuff[1];
    return leather(v, x, y, z, e, { ...G_UP, k: 5.6, seed, soot: 0.2, wear: 1, grain: 0.5 });
  };
}

/** A gloved fist around a handle that runs along +Y (see the frame notes above). */
export function fistGeo(dirt = 1) {
  return cached(`vm-fist-glove|${dirt}`, () => {
    const v = new Vox(-17, 18, -18, 20, -18, 26);
    // the mitt: heel and back of the paw behind/outside the handle (a touch fuller: thick hide)
    v.ell(2.6, 0.4, 2.8, 11, 12.5, 10.9, 0, 1, 2.6);
    // four fingers curled around the front of the handle; the cut-open tips (6) let the big pale
    // claws out, hooking back round the near side of the handle (the side the player sees)
    const fy = [8.6, 3.2, -2.2, -7.6];
    fy.forEach((y, i) => {
      const R = i === 3 ? 8.1 : 8.8;
      let prev = null;
      for (let k = 0; k <= 7; k++) {
        const th = ((22 + k * 23) * Math.PI) / 180;
        const p = [Math.cos(th) * R, y, -Math.sin(th) * R];
        if (prev) v.line(prev[0], prev[1], prev[2], p[0], p[1], p[2], 0, (i === 0 ? 3.45 : 3.25) + (k === 7 ? 0.25 : 0), k === 7 ? 6 : 2);
        prev = p;
      }
      const [ex, ey, ez] = prev;
      const c1 = [ex - 1.2, ey - 0.3, ez + 4.2], c2 = [ex + 0.6, ey - 0.8, ez + 8.2], c3 = [ex + 3.4, ey - 1.4, ez + 10.6];
      v.line(ex, ey, ez, c1[0], c1[1], c1[2], 0, 2.2, 3);
      v.line(c1[0], c1[1], c1[2], c2[0], c2[1], c2[2], 0, 1.6, 3);
      v.line(c2[0], c2[1], c2[2], c3[0], c3[1], c3[2], 0, 0.9, 4);
    });
    // the knuckle ridge on the back, under an oiled leather patch
    for (const y of fy) v.ell(8.5, y, -4.6, 2.6, 2.3, 2.8, 0, 5);
    // the thumb hooks over the top of the handle; its tip cut open too
    v.line(-4, 9.5, 6.5, -6, 13, 0.5, 0, 3.7, 2);
    v.line(-6, 13, 0.5, -4.8, 13.3, -2.6, 0, 3.3, 2);
    v.line(-4.8, 13.3, -2.6, -3.5, 13.6, -5.5, 0, 3.4, 6);
    v.line(-3.5, 13.6, -5.5, -0.6, 12.8, -9.5, 0, 2, 3);
    v.line(-0.6, 12.8, -9.5, 2.4, 10.4, -12, 0, 1.1, 4);
    // the gauntlet round the wrist (the forearm runs out of it along +z)
    const G = { cx: 1.2, cy: 0.3, rx: 12.3, ry: 12.6, z0: 8, z1: 23, strap: 12, phi0: 0.75 };
    addGauntlet(v, G);
    const spots = dirt ? [[8, 9, -4, 3.2], [-7, -6, 2, 3], [4, -11, 6, 3]] : [];
    const inPatch = (x, y, z) => x >= 6 && z >= -10 && z <= 0 && y >= -11 && y <= 12;
    v.resolve({
      1: (x, y, z, e) => {
        let c = leather(v, x, y, z, e, { ...G_UP, k: 4.4, seed: 21, soot: 0.5, wear: 0.6 });
        if (inPatch(x, y, z)) {
          c = leather(v, x, y, z, e, { ...G_UP, ramp: GLOVE.patch, k: 4.2, seed: 22, soot: 0.3, wear: 0.8 });
          if (z === -10 || z === 0 || y === -11 || y === 12) c = stitch(c, z === -10 || z === 0 ? y : z, 2);
        } else if (z >= 6 && z <= 7) c = stitch(c, Math.atan2(y, x - 1.2) * 12, 2); // the seam where the gauntlet is sewn on
        else if (Math.abs(y - 0.3) < 0.6 && x > 3 && (e & PX)) c = stitch(c, z, 2); // a seam down the back
        return smudged(c, x, y, z, spots, 0.22);
      },
      2: (x, y, z, e) => {
        let c = leather(v, x, y, z, e, { ...G_UP, k: 4.6, seed: 23, soot: 0.65, wear: 0.7 });
        // the seams between the finger rolls: stitched
        for (const fyy of fy) if (Math.abs(y - (fyy + 2.8)) < 0.6 && !(e & PY)) c = stitch(c, Math.atan2(-z, x) * 9, 2);
        return smudged(c, x, y, z, spots, 0.22);
      },
      3: clawBase,
      4: clawTip(dirt),
      5: (x, y, z, e) => {
        let c = leather(v, x, y, z, e, { ...G_UP, ramp: GLOVE.patch, k: 4.6, seed: 24, soot: 0.25, wear: 1 });
        if (x >= 10) c = mix(c, GLOVE.patch[7], 0.45 + (h3(x, y >> 1, z >> 1, 25) < 0.3 ? 0.25 : 0)); // knuckle tops rubbed pale
        if ((z === -10 || z === 0) && x < 10) c = stitch(c, y, 2);
        return c;
      },
      6: rimPaint(v, 26),
      ...gauntletPaint(v, G, 27),
    });
    return v.geometry(false);
  });
}

/** An open gloved spade paw: palm down, five fingers forward, the claws out of the cut tips. */
export function openPawGeo(dirt = 1) {
  return cached(`vm-open-glove|${dirt}`, () => {
    const v = new Vox(-22, 22, -14, 15, -36, 26);
    v.ell(0, 0, -1, 13.3, 6.6, 10.8, 0, 1, 2.5); // broad spade palm (thick hide)
    v.ell(0, 0.6, 7, 9.8, 6, 6.8, 0, 1); // heel toward the wrist
    const fingers = [-10, -5, 0, 5, 10];
    for (const fx of fingers) {
      const tx = fx * 1.14;
      v.ell(fx * 0.95, 3.8, -8, 2.5, 2.2, 2.8, 0, 5); // knuckle, under the patch
      v.line(fx * 0.95, -0.2, -9, tx * 0.97, -0.5, -14.2, 0, 2.4, 2); // finger
      v.line(tx * 0.97, -0.5, -14.2, tx, -0.6, -16.2, 0, 2.6, 6); // the cut-open tip
      v.line(tx, -0.6, -16.5, tx * 1.03, -2.4, -23.5, 0, 2.3, 3); // claw root
      v.line(tx * 1.03, -2.4, -23.5, tx * 1.05, -6, -28.5, 0, 1.5, 3); // claw, hooking down
      v.line(tx * 1.05, -6, -28.5, tx * 1.06, -9.5, -31, 0, 0.8, 4);
    }
    const G = { cx: 0, cy: 0.4, rx: 12.2, ry: 11.6, z0: 8, z1: 23, strap: 12, phi0: 1.25 };
    addGauntlet(v, G);
    const spots = dirt ? [[-7, 5, -4, 2.6], [8, 4, 3, 2.4], [0, -6, -4, 3]] : [];
    const onFinger = (x) => fingers.some((f) => Math.abs(x + 0.5 - f * 0.95 - 2.5) < 0.6);
    v.resolve({
      1: (x, y, z, e) => {
        let c = leather(v, x, y, z, e, { ...G_UP, k: 4.5, seed: 31, soot: 0.45, wear: 0.6 });
        if ((e & PY) && z >= -12 && z <= -4) { // the knuckle patch
          c = leather(v, x, y, z, e, { ...G_UP, ramp: GLOVE.patch, k: 4.4, seed: 32, soot: 0.25, wear: 0.8 });
          if (z === -12 || z === -4 || Math.abs(x + 0.5) >= 12.5) c = stitch(c, x, 2);
        } else if ((e & PY) && z > -4 && z < 7 && (Math.abs(x + 0.5 - 3.8) < 0.6 || Math.abs(x + 0.5 + 3.8) < 0.6)) c = stitch(c, z, 2); // the points down the back
        else if ((e & NY) && z >= -10 && z <= 5 && Math.abs(x + 0.5) <= 10) { // a reinforced palm
          c = leather(v, x, y, z, e, { ...G_UP, ramp: GLOVE.patch, k: 4, seed: 33, soot: 0.6, wear: 0.5 });
          if (z === -10 || z === 5 || Math.abs(x + 0.5) >= 9.5) c = stitch(c, z === -10 || z === 5 ? x : z, 2);
        } else if (z === 6 || z === 7) c = stitch(c, x, 2); // sewn to the gauntlet
        if ((e & PY) && z < -5 && onFinger(x)) c = mix(c, GLOVE.hide[1], 0.5); // creases into the fingers
        return smudged(c, x, y, z, spots, 0.22);
      },
      2: (x, y, z, e) => {
        let c = leather(v, x, y, z, e, { ...G_UP, k: 4.7, seed: 34, soot: 0.55, wear: 0.7 });
        if ((e & (PX | NX)) && !(e & PY) && !(e & NY)) c = stitch(c, z, 2); // the finger side seams
        return c;
      },
      3: clawBase,
      4: clawTip(dirt),
      5: (x, y, z, e) => {
        let c = leather(v, x, y, z, e, { ...G_UP, ramp: GLOVE.patch, k: 4.6, seed: 35, soot: 0.2, wear: 1 });
        if ((e & PY) && y >= 5) c = mix(c, GLOVE.patch[7], 0.45 + (h3(x >> 1, y, z, 36) < 0.3 ? 0.25 : 0)); // rubbed pale
        return c;
      },
      6: rimPaint(v, 37),
      ...gauntletPaint(v, G, 38),
    });
    return v.geometry(false);
  });
}

// ---------------------------------------------------------------- metals & woods
const TIERS = {
  1: { wood: 0x8a7a66, wrap: 0xc8b07a, wrap2: 0xa08a58, band: 0x6a5a4a, rivet: 0x6a6058 },
  2: { wood: 0x9a6a3a, wrap: 0x6a3a22, wrap2: 0x4e2a18, band: 0xb86a34, rivet: 0xd08a4a },
  3: { wood: 0x8a5a32, wrap: 0x4a2a1a, wrap2: 0x6a4028, band: 0x7a7e86, rivet: BRASS },
  4: { wood: 0x7a4a2a, wrap: 0x2a2224, wrap2: 0xb83a32, band: 0x9aa4b0, rivet: 0xe8eef4 },
  5: { wood: 0x3a2a30, wrap: 0x2a3a5a, wrap2: 0xe0e8f0, band: 0xe0e8f0, rivet: 0xe0e8f0 },
  6: { wood: 0x2a2a30, wrap: 0x1e3a2e, wrap2: 0xe8c050, band: 0xe8c050, rivet: 0xe8c050 },
};
const DEFAULT_METAL = { pick: 0x9aa0a8, chisel: 0xa0a6ae, brush: 0xc9a06a, drill: 0xb08a3a, xray: 0x7fe7ff };

/** Metal colour and tier of an item id (or the kind's default). */
export function metalOf(kind, id) {
  const it = id && ITEMS[id];
  const base = it?.icon?.c ?? DEFAULT_METAL[kind] ?? 0x9aa0a8;
  let tier = it?.tier ?? 3;
  if (kind !== 'pick') tier = /fine|badger|lumite|prism/.test(id || '') ? 5 : 3;
  return { base, tier, id: id || kind };
}

function woodGrain(base, x, y, z, seed) {
  const a = Math.atan2(z, x);
  const b = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 10);
  let c = b % 2 ? base : dk(base, 0.06);
  if (h3(b, y >> 3, seed, 1) < 0.18) c = dk(c, 0.14);
  if (h3(b, y >> 2, seed, 2) > 0.9) c = lt(c, 0.1);
  return c;
}

/** Spiral grip wrap around a handle of the given radius. */
function wrapColor(t, x, y, z) {
  const a = Math.atan2(z, x);
  const b = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8);
  return ((y * 2 + b) % 8 + 8) % 8 < 4 ? t.wrap : t.wrap2;
}

// ---------------------------------------------------------------- pickaxe
/** Pickaxe for an item: { geo, glow } (glow = mithril/adamant runes, else null). */
export function pickGeo(id) {
  const m = metalOf('pick', id);
  return cached(`vm-pick|${m.id}|${m.base}|${m.tier}`, () => {
    const t = TIERS[m.tier] || TIERS[3];
    const HY = 74; // head height on the handle
    const v = new Vox(-9, 10, -22, HY + 16, -50, 40);
    const yc = (z) => HY + 3 - 10 * (z / 44) ** 2;
    const front = (z) => clamp01((-z - 6) / 38);
    const back = (z) => clamp01((z - 6) / 26);
    const hh = (z) => (z < 0 ? lerp(6.4, 0.7, front(z) ** 0.85) : lerp(6.4, 2.2, back(z)));
    const hw = (z) => (z < 0 ? lerp(4.6, 0.8, front(z)) : lerp(4.6, 6.2, back(z)));
    // handle, grip wrap, pommel
    v.fill(-4, 4, -13, HY + 6, -4, 4, (x, y, z) => x * x + z * z <= 3.2 * 3.2, 0, 1);
    v.fill(-5, 5, -11, 16, -5, 5, (x, y, z) => x * x + z * z <= 3.9 * 3.9, 0, 2);
    v.ell(0, -15.5, 0, 4.4, 3.4, 4.4, 0, 3);
    // the head: an arched beam with a point in front and an adze blade behind
    v.fill(-8, 8, HY - 22, HY + 12, -48, 36, (x, y, z) => {
      if (z < -44.5 || z > 32.5) return false;
      return Math.abs(y - yc(z)) <= hh(z) && Math.abs(x) <= hw(z);
    }, 0, 4);
    // socket around the handle top
    v.ell(0, HY, 0, 5.2, 8.5, 6.2, 0, 5, 3.2);
    v.box(-1, HY + 7, -1, 1, HY + 9, 1, 0, 6); // wedge in the handle end
    // rivets on the socket
    for (const s of [-1, 1]) v.ell(s * 5.6, HY + 0.5, 0, 0.9, 0.9, 0.9, 0, 7);
    // tier bands on the handle (mithril / adamant)
    if (m.tier >= 5) for (const y of [20, HY - 16]) v.fill(-5, 5, y, y + 1, -5, 5, (x, yy, z) => x * x + z * z <= 3.8 * 3.8, 0, 7);
    // a chipped tip for the rusty one
    if (m.tier === 1) { v.carve(-3, 3, HY - 22, HY + 12, -46, -40, (x, y, z) => y > yc(z) - 0.5 && z < -41); }
    // engraved runes along the head (glowing, mithril and up)
    const runes = [];
    if (m.tier >= 5) {
      for (let z = -30; z <= 24; z++) {
        const k = ((z % 7) + 7) % 7;
        if (k === 5 || k === 6) continue;
        const y = Math.round(yc(z));
        for (const dir of [-1, 1]) {
          const x = v.sideX(y, z, dir);
          if (!isFinite(x)) continue;
          runes.push([x, y, z]);
          if (k === 1) { if (v.has(x, y + 1, z)) runes.push([x, y + 1, z]); if (v.has(x, y - 1, z)) runes.push([x, y - 1, z]); }
        }
      }
    }
    const base = m.base;
    const metal = (x, y, z, e) => {
      let c = base;
      if (e & PY) c = lt(c, 0.22);
      if (e & NY) c = dk(c, 0.28);
      const edge = z < -34 || z > 27;
      if (edge && (e & (PX | NX | PY))) c = lt(base, m.tier >= 4 ? 0.55 : 0.3);
      if (m.tier === 1) {
        const r = h3(x >> 1, y >> 1, z >> 2, 11);
        if (r < 0.38) c = mix(c, r < 0.12 ? 0x7a3a1a : 0xa85a2a, 0.65);
        else if (r > 0.93) c = dk(c, 0.2);
      } else if (m.tier === 2) {
        if (h3(x >> 1, y >> 1, z >> 1, 12) < ((e & NY) ? 0.45 : 0.14)) c = mix(c, 0x4fa08a, 0.6);
      } else if (m.tier === 3) {
        if (h3(x >> 1, y >> 1, z >> 1, 13) < 0.16) c = dk(c, 0.1);
      } else if (m.tier === 4) {
        if (((y + (z >> 3)) & 3) === 0 && !(e & PY)) c = lt(c, 0.07);
      } else {
        if (h3(x, y, z, 14) < 0.035) c = 0xffffff;
        if (m.tier === 6 && h3(x >> 1, y, z >> 2, 15) < 0.12) c = dk(c, 0.35);
      }
      return c;
    };
    v.resolve({
      1: (x, y, z) => woodGrain(m.tier === 1 && h3(0, y >> 4, 0, 3) < 0.3 ? dk(t.wood, 0.08) : t.wood, x, y, z, 21),
      2: (x, y, z) => wrapColor(t, x, y, z),
      3: (x, y, z, e) => (e & PY ? lt(t.band, 0.2) : dk(t.band, 0.1)),
      4: metal,
      5: (x, y, z, e) => {
        let c = dk(base, 0.18);
        if (e & PY) c = lt(c, 0.12);
        if (m.tier === 1 && h3(x, y >> 1, z, 16) < 0.35) c = mix(c, 0x8a4a22, 0.6);
        return c;
      },
      6: () => (m.tier >= 5 ? t.band : 0x5a4a3a),
      7: (x, y, z, e) => (e & PY ? lt(t.rivet, 0.3) : t.rivet),
    });
    let glow = null;
    if (runes.length) {
      const runeC = m.tier === 6 ? 0x6af0b0 : 0x9ff0ff;
      const g = new Vox(-9, 10, HY - 23, HY + 16, -50, 40);
      for (const [x, y, z] of runes) { v.clear(x, y, z); g.set(x, y, z, runeC); }
      glow = g.geometry(false);
    }
    return { geo: v.geometry(false), glow, runeColor: m.tier === 6 ? 0x3ae08a : 0x5ad8ff };
  });
}

// ---------------------------------------------------------------- chisel & mallet
export function chiselGeo(id) {
  const m = metalOf('chisel', id);
  return cached(`vm-chisel|${m.id}|${m.base}`, () => {
    const v = new Vox(-6, 7, -36, 50, -6, 7);
    v.fill(-4, 4, -29, 13, -4, 4, (x, y, z) => x * x + z * z <= 3.3 * 3.3 && Math.abs(x) + Math.abs(z) <= 4.4, 0, 1); // octagonal handle
    v.fill(-5, 5, 13, 16, -5, 5, (x, y, z) => x * x + z * z <= 3.7 * 3.7, 0, 2); // ferrule
    v.fill(-4, 4, 16, 38, -4, 4, (x, y, z) => { const h = lerp(2.3, 1.8, (y - 16) / 22); return Math.abs(x + 0.5) <= h && Math.abs(z + 0.5) <= h; }, 0, 3);
    v.fill(-5, 5, 38, 48, -4, 4, (x, y, z) => { const k = (y - 38) / 10; return Math.abs(x + 0.5) <= lerp(2.2, 3.6, k) && Math.abs(z + 0.5) <= lerp(1.9, 0.6, k); }, 0, 3);
    v.ell(0, -31, 0, 3.9, 2.6, 3.9, 0, 4); // the struck cap, mushroomed
    v.resolve({
      1: (x, y, z) => woodGrain(0xa86a3a, x, y, z, 23),
      2: (x, y, z, e) => (e & PY ? lt(BRASS, 0.25) : BRASS),
      3: (x, y, z, e) => {
        let c = m.base;
        if (y >= 45) c = lt(c, 0.5); // honed edge
        else if (e & PY) c = lt(c, 0.2);
        else if (e & (NX | NZ)) c = dk(c, 0.18);
        if (m.tier >= 5 && h3(x, y, z, 5) < 0.05) c = 0xffffff;
        return c;
      },
      4: (x, y, z, e) => (e & NY ? dk(m.base, 0.4) : dk(m.base, 0.2)),
    });
    return v.geometry(false);
  });
}

/** The wooden mallet for the left paw: head centre at (0, 28, 0), barrel along Z (faces at z = ±10). */
export const MALLET_HEAD = 28;
export function malletGeo() {
  return cached('vm-mallet', () => {
    const v = new Vox(-8, 9, -16, 36, -12, 12);
    v.fill(-3, 3, -14, 22, -3, 3, (x, y, z) => x * x + z * z <= 2.5 * 2.5, 0, 1);
    // barrel head with iron bands near both faces
    v.fill(-8, 8, 21, 36, -11, 11, (x, y, z) => x * x + (y - 28) ** 2 <= 6.6 * 6.6 && Math.abs(z) <= 10, 0,
      (x, y, z) => (Math.abs(z + 0.5) > 7 && Math.abs(z + 0.5) < 8.6 ? 3 : 2));
    v.resolve({
      1: (x, y, z) => woodGrain(0x9a6a3a, x, y, z, 24),
      2: (x, y, z, e) => {
        if (e & (PZ | NZ)) { const r = Math.round(Math.hypot(x + 0.5, y + 0.5 - 28)); return r % 3 === 0 ? 0x8a5a2e : 0xc08a52; } // end grain rings
        return woodGrain(0xb07a42, x, y - 28, z, 25);
      },
      3: (x, y, z, e) => (e & PY ? 0x9aa0a8 : 0x6a6e76),
    });
    return v.geometry(false);
  });
}

// ---------------------------------------------------------------- brush
export function brushGeo(id) {
  const m = metalOf('brush', id);
  const badger = /badger/.test(id || '');
  return cached(`vm-brush|${badger}|${m.base}`, () => {
    const v = new Vox(-9, 10, -18, 46, -6, 7);
    v.fill(-4, 4, -16, 17, -4, 4, (x, y, z) => x * x + z * z <= (y < -8 ? 3.6 : 3.2) ** 2, 0, 1);
    v.carve(-5, 5, -14, -10, -2, 2, (x, y, z) => (y + 0.5 + 12) ** 2 + (z + 0.5) ** 2 <= 1.6); // hang hole
    v.fill(-7, 7, 16, 23, -3, 3, (x, y, z) => Math.abs(x + 0.5) <= lerp(3.6, 6.2, (y - 16) / 6) && Math.abs(z + 0.5) <= 2.6, 0, 2); // ferrule
    // bristle tufts with ragged tips
    for (let x = -7; x < 7; x++) for (let z = -2; z < 3; z++) {
      const len = 15 + Math.floor(h3(x, z, 7, 3) * 4);
      const spread = (x + 0.5) * 0.06;
      for (let k = 0; k < len; k++) v.setM(Math.round(x + spread * k), 23 + k, z, 3);
    }
    v.resolve({
      1: (x, y, z) => woodGrain(badger ? 0x5a3a2a : 0xc9a06a, x, y, z, 26),
      2: (x, y, z, e) => {
        let c = badger ? 0xc8ccd4 : BRASS;
        if (e & PY) c = lt(c, 0.2);
        if (y === 19) c = dk(c, 0.2);
        return c;
      },
      3: (x, y, z) => {
        const k = y - 23;
        if (badger) return k < 5 ? 0x2a2624 : k < 11 ? 0xf0ece4 : (x + z) & 1 ? 0x8a8480 : 0x6a6460;
        return k > 12 ? 0xf0dcae : (x + z) & 1 ? 0xd8b880 : 0xc8a46a;
      },
    });
    return v.geometry(false);
  });
}

// ---------------------------------------------------------------- drills
/** Drill body (grip along +Y, barrel forward along -Z): { geo, bitGeo, chuck: [x,y,z], socket: {pos, up, fwd} }. */
export function drillGeo(id) {
  const m = metalOf('drill', id);
  const lumite = /lumite/.test(id || '');
  return cached(`vm-drill|${lumite}|${m.base}`, () => {
    const v = new Vox(-30, 18, -18, 42, -36, 22);
    const BY = 22; // barrel axis height
    // pistol grip with finger grooves
    v.fill(-5, 5, -14, 12, -6, 6, (x, y, z) => (x / 3.7) ** 2 + (z / 4.7) ** 2 <= 1 && !(z < -3 && [-8, -3, 2].some((g) => Math.abs(y - g) < 1)), 0, 1);
    v.box(-1, 5, -8, 1, 10, -5, 0, 7); // trigger
    // boiler / motor body along Z
    v.fill(-12, 12, BY - 12, BY + 12, -10, 17, (x, y, z) => x * x + (y - BY) ** 2 <= 10.6 * 10.6, 0, 2);
    // rivet rings
    for (const zr of [-8, 14]) v.fill(-12, 12, BY - 12, BY + 12, zr, zr + 1, (x, y, z) => x * x + (y - BY) ** 2 <= 11.3 * 11.3 && x * x + (y - BY) ** 2 > 10 * 10 && ((Math.round(Math.atan2(y - BY, x) * 4) & 1) === 0), 0, 3);
    // gauge on the back face (toward the viewer)
    v.fill(-2, 10, BY - 3, BY + 9, 16, 19, (x, y, z) => (x - 3.5) ** 2 + (y - BY - 3) ** 2 <= 4.6 * 4.6, 0, 4);
    // a steam pipe looping over the top
    v.line(-3, BY + 10, 8, -3, BY + 15, 4, 0, 1.4, 3);
    v.line(-3, BY + 15, 4, -3, BY + 15, -6, 0, 1.4, 3);
    v.line(-3, BY + 15, -6, -3, BY + 9, -10, 0, 1.4, 3);
    v.ell(-3, BY + 17, 4, 1.6, 2.2, 1.6, 0, 3); // whistle
    // neck with cooling fins, then the chuck
    v.fill(-9, 9, BY - 9, BY + 9, -25, -9, (x, y, z) => x * x + (y - BY) ** 2 <= (((z + 40) % 3 === 0) ? 7.8 : 6.4) ** 2, 0, 5);
    v.fill(-7, 7, BY - 7, BY + 7, -32, -24, (x, y, z) => x * x + (y - BY) ** 2 <= lerp(5.4, 4.2, (-z - 24) / 8) ** 2, 0, 6);
    // side handle for the left paw
    v.line(-9, BY - 1, -16, -24, BY - 3, -16, 0, 2.7, 1);
    v.ell(-25.5, BY - 3.2, -16, 3.4, 3.4, 3.4, 0, 1);
    if (lumite) {
      // glowing coils wound around the body
      v.fill(-13, 13, BY - 13, BY + 13, -9, 14, (x, y, z) => {
        const r2 = x * x + (y - BY) ** 2;
        if (r2 > 11.6 * 11.6 || r2 <= 10.4 * 10.4) return false;
        const a = Math.atan2(y - BY, x);
        return ((Math.round(a * 2.5 + z * 0.55) % 3) + 3) % 3 === 0;
      }, 0, 8);
    }
    const body = lumite ? 0x3a4048 : m.base;
    v.resolve({
      1: (x, y, z, e) => (lumite ? (e & PY ? 0x4a5058 : 0x2a2e34) : ((y + 40) % 5 === 0 ? 0x4a2a1a : 0x6a3a22)),
      2: (x, y, z, e) => {
        let c = body;
        if (e & PY) c = lt(c, 0.2);
        if (e & NY) c = dk(c, 0.25);
        if (z === 3) c = dk(c, 0.2); // seam
        if (!lumite && h3(x >> 1, y >> 1, z >> 1, 3) < 0.1) c = mix(c, 0x6a8a5a, 0.35); // patina
        return c;
      },
      3: (x, y, z, e) => (lumite ? 0xc8d0d8 : e & PY ? 0xf0c860 : 0xb88a3a),
      4: (x, y, z, e) => {
        if (!(e & PZ)) return dk(body, 0.2);
        const r = Math.hypot(x + 0.5 - 3.5, y + 0.5 - BY - 3);
        if (r > 3.6) return lumite ? 0x9aa4ae : BRASS;
        if (Math.abs(x + 0.5 - 3.5 - (y + 0.5 - BY - 3) * 0.7) < 0.7 && y + 0.5 > BY + 3) return 0xd83a2a; // needle
        return lumite ? 0xd8ffe0 : 0xf4ecd8;
      },
      5: (x, y, z, e) => (e & PY ? 0x8a9098 : 0x5a5e66),
      6: (x, y, z, e) => ((Math.round(Math.atan2(y - BY, x) * 2) & 1) ? 0x9aa0a8 : 0x6a6e76),
      7: () => 0x2a2a30,
      8: () => 0x8affa0,
    });
    // the bit: a fluted cone pointing -Z from the chuck
    const bit = new Vox(-6, 7, -6, 7, -40, 1);
    bit.fill(-6, 6, -6, 6, -40, 0, (x, y, z) => {
      const t = -z / 38;
      return x * x + y * y <= lerp(4.4, 0.5, t) ** 2;
    }, (x, y, z) => {
      const a = Math.atan2(y + 0.5, x + 0.5);
      const f = (((Math.round(a * 1.6 + z * 0.45) % 4) + 4) % 4);
      const steel = lumite ? 0x9ad0a8 : 0xb8bec8;
      return f === 0 ? dk(steel, 0.35) : f === 1 ? lt(steel, 0.25) : steel;
    });
    return {
      geo: v.geometry(false),
      bitGeo: bit.geometry(false),
      chuck: [0, BY, -32],
      socket: { pos: [-18, BY - 2.4, -16], up: [1, 0.12, 0], fwd: [0, 0.55, -1] },
    };
  });
}

// ---------------------------------------------------------------- x-ray lamps
/** X-ray lamp (grip along +Y, lens facing -Z): { geo, lensGeo, lens: [x,y,z], color }. */
export function xrayGeo(id) {
  const m = metalOf('xray', id);
  const prism = /prism/.test(id || '');
  return cached(`vm-xray|${prism}|${m.base}`, () => {
    const v = new Vox(-14, 15, -18, 40, -22, 18);
    const BY = 21;
    v.fill(-5, 5, -14, 12, -6, 6, (x, y, z) => (x / 3.6) ** 2 + (z / 4.6) ** 2 <= 1 && !(z < -3 && [-8, -3, 2].some((g) => Math.abs(y - g) < 1)), 0, 1);
    v.fill(-11, 11, BY - 11, BY + 11, -12, 12, (x, y, z) => x * x + (y - BY) ** 2 <= 9.6 * 9.6, 0, 2); // housing
    v.fill(-12, 12, BY - 12, BY + 12, -15, -11, (x, y, z) => { const r2 = x * x + (y - BY) ** 2; return r2 <= 10.8 * 10.8 && r2 > 7.6 * 7.6; }, 0, 3); // bezel
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; v.ell(Math.cos(a) * 9.2, BY + Math.sin(a) * 9.2, -15.2, 0.9, 0.9, 0.9, 0, 4); }
    for (const bx of [-4, 0, 4]) v.box(bx, BY - 7, -17, bx + 1, BY + 8, -16, 0, 3); // cage bars
    // power vial across the back top, glowing
    v.fill(-8, 8, BY + 7, BY + 15, 0, 12, (x, y, z) => (y - BY - 11) ** 2 + (z - 6) ** 2 <= 3.2 * 3.2 && Math.abs(x) <= 7, 0, 5);
    for (const s of [-1, 1]) v.fill(-9, 9, BY + 7, BY + 15, 0, 12, (x, y, z) => (y - BY - 11) ** 2 + (z - 6) ** 2 <= 3.8 * 3.8 && Math.abs(x + 0.5 - s * 7.5) < 1.2, 0, 3);
    // dial on the back face
    v.fill(-6, 6, BY - 6, BY + 6, 12, 14, (x, y, z) => x * x + (y - BY + 1) ** 2 <= 4.2 * 4.2, 0, 6);
    const lensC = m.base;
    v.resolve({
      1: (x, y, z) => ((y + 40) % 5 === 0 ? 0x2a2a30 : 0x3a3a42),
      2: (x, y, z, e) => {
        let c = prism ? 0xb8bcc8 : 0x4a5058;
        if (e & PY) c = lt(c, 0.2);
        if (e & NY) c = dk(c, 0.25);
        if (Math.abs(z) === 4) c = dk(c, 0.18);
        return c;
      },
      3: (x, y, z, e) => (prism ? (e & PY ? 0xf0f4ff : 0xc8ccd8) : (e & PY ? 0xf0c860 : BRASS)),
      4: () => 0x6a6058,
      5: (x, y, z) => (((x + 40) % 4 === 0) ? lt(lensC, 0.5) : lensC),
      6: (x, y, z, e) => {
        if (!(e & PZ)) return 0x3a3a42;
        const r = Math.hypot(x + 0.5, y + 0.5 - BY + 1);
        if (r > 3.3) return 0x2a2a30;
        return Math.abs(x + 0.5 - (y + 0.5 - BY + 1)) < 0.7 && x + 0.5 > 0 ? 0xd83a2a : 0xe8f0f0;
      },
    });
    const lens = new Vox(-9, 10, BY - 9, BY + 10, -15, -11);
    lens.fill(-9, 9, BY - 9, BY + 9, -15, -12, (x, y, z) => x * x + (y - BY) ** 2 <= 7.8 * 7.8 && z >= -14 + (x * x + (y - BY) ** 2 < 20 ? -1 : 0), (x, y, z) => {
      const r = Math.hypot(x + 0.5, y + 0.5 - BY);
      if (prism) {
        const f = (Math.round(Math.atan2(y + 0.5 - BY, x + 0.5) * 3 / Math.PI) + 6) % 3;
        return [0xe0a8ff, 0xc888f0, 0xf4d8ff][f];
      }
      return r < 2.5 ? lt(lensC, 0.6) : r < 5 ? lensC : dk(lensC, 0.25);
    });
    return { geo: v.geometry(false), lensGeo: lens.geometry(false), lens: [0, BY, -15], color: lensC };
  });
}

// ---------------------------------------------------------------- glow stake & beam
/** Glow stake (grip mid-shaft, lumite tip along +Y): { geo, crystalGeo, color }. */
export function stakeGeo() {
  return cached('vm-stake', () => {
    const v = new Vox(-6, 7, -28, 30, -6, 7);
    v.fill(-4, 4, -22, 27, -4, 4, (x, y, z) => Math.abs(x + 0.5) <= 2.6 && Math.abs(z + 0.5) <= 2.6 && !(Math.abs(x + 0.5) > 2 && Math.abs(z + 0.5) > 2), 0, 1);
    v.fill(-5, 5, 20, 27, -5, 5, (x, y, z) => Math.abs(x + 0.5) <= 3.3 && Math.abs(z + 0.5) <= 3.3 && ((y + Math.round(x * 0.4)) % 2 === 0), 0, 2); // twine
    v.box(-3, -25, -3, 3, -22, 3, 0, 3); // brass cap
    v.resolve({
      1: (x, y, z) => (h3(x, y >> 2, z, 41) < 0.12 ? 0x5a3a22 : (x + z) & 1 ? 0x9a6a3a : 0x8a5a32),
      2: () => 0xc8b07a,
      3: (x, y, z, e) => (e & NY ? 0xa88a38 : BRASS),
    });
    const c = new Vox(-6, 7, 25, 50, -6, 7);
    const color = 0x6af0c8;
    c.fill(-6, 6, 25, 49, -6, 6, (x, y, z) => {
      const t = (y - 26) / 22;
      const r = t < 0.3 ? 3.8 : lerp(3.8, 0, (t - 0.3) / 0.7);
      return t >= 0 && t <= 1 && Math.abs(x + 0.5) + Math.abs(z + 0.5) * 0.6 <= r * 1.2 && Math.abs(z + 0.5) <= r;
    }, (x, y, z) => (((x + z + y) % 3 === 0) ? lt(color, 0.5) : (x < 0 ? dk(color, 0.2) : color)));
    return { geo: v.geometry(false), crystalGeo: c.geometry(false), color };
  });
}

/** Support beam along +Y (gripped at y = 0 by the right paw, centre at y = -BEAM_GRIP). */
export const BEAM_GRIP = 38;
export function beamGeo() {
  return cached('vm-beam', () => {
    const y0 = -BEAM_GRIP * 2 - 42, y1 = 42;
    const v = new Vox(-9, 10, y0 - 1, y1 + 2, -9, 10);
    v.box(-6, y0, -6, 7, y1, 7, 0, 1);
    for (const yb of [y0 + 6, y1 - 12]) v.box(-7, yb, -7, 8, yb + 7, 8, 0, 2);
    v.resolve({
      1: (x, y, z, e) => {
        if (e & (PY | NY)) { const r = Math.round(Math.hypot(x + 0.5, z + 0.5)); return r % 3 === 0 ? 0x7a4a26 : 0xb07a46; }
        let c = ((x + z + 40) % 5 === 0) ? 0x8a5a32 : 0xa06a3a;
        if (h3(x >> 1, y >> 4, z >> 1, 51) < 0.12) c = 0x6a4022;
        if ((e & PZ) && Math.abs(Math.abs(y + BEAM_GRIP) - Math.abs(x + 0.5) * 2) < 1 && Math.abs(x + 0.5) < 4) c = 0x3a2a22; // carpenter's mark
        return c;
      },
      2: (x, y, z, e) => {
        if (((y + 40) % 7 === 3) && ((x + z + 40) % 6 === 0)) return 0xc8ccd4; // rivets
        return e & PY ? 0x6a6e76 : 0x4a4e56;
      },
    });
    return v.geometry(false);
  });
}

// ---------------------------------------------------------------- food
/**
 * An item's 32×32 icon extruded into a little voxel snack in the XY plane (facing the viewer),
 * standing on the fist: bottom of its pixels at y = 4. Four bite stages (0 = whole).
 */
export function foodGeo(id, stage = 0) {
  return cached(`vm-food|${id}|${stage}`, () => {
    const it = ITEMS[id];
    const pc = drawIconSmall(it?.icon || { k: '?' }, hashStr(id || 'food'), 32, id); // 64-px icon reduced to the 32-cell snack
    let x0 = 32, y0 = 32, x1 = -1, y1 = -1;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (pc.alpha(x, y) >= 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const v = new Vox(-20, 21, -2, 40, -4, 5);
    if (x1 < 0) return v.geometry(false);
    const cx = (x0 + x1 + 1) / 2;
    const opaque = (x, y) => x >= 0 && y >= 0 && x < 32 && y < 32 && pc.alpha(x, y) >= 128;
    // bites, from the top right corner
    const bites = [[x1 - 1, y0 + 1, 6.5], [(x0 + x1) / 2 + 2, y0 - 1, 7.5], [x0 + 3, y0 + 3, 7]].slice(0, stage);
    const bitten = (x, y) => bites.some(([bx, by, r]) => (x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2 <= r * r);
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      if (!opaque(px, py) || bitten(px, py)) continue;
      const c = pc.getHex(px, py);
      const edge = !opaque(px - 1, py) || !opaque(px + 1, py) || !opaque(px, py - 1) || !opaque(px, py + 1) || bitten(px - 1, py) || bitten(px + 1, py) || bitten(px, py - 1);
      const deep = !edge && opaque(px - 2, py) && opaque(px + 2, py) && opaque(px, py - 2) && opaque(px, py + 2);
      const X = Math.round(px - cx), Y = 4 + (y1 - py);
      const zb = deep ? -2 : -1, zf = deep ? 2 : 1;
      const bite = bitten(px - 1, py) || bitten(px + 1, py) || bitten(px, py - 1) || bitten(px, py + 1);
      for (let z = zb; z <= zf; z++) v.set(X, Y, z, bite ? lt(c, 0.35) : z === zf ? c : dk(c, 0.12));
    }
    return v.geometry(false);
  });
}

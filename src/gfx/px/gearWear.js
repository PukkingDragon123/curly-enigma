// Equipment icons (32×32): helmets and the sunstone crown, gloves, suits, boots and bags.
// Hand-pixel style on top of gearKit: rounded forms shaded in a few clean bands, seams
// between parts, stitching, rivets, buckles, folds, wear marks and an ink outline.
import {
  M, mat, mix, hash2, step, ink, seam, stick, dents, pits, rivet, stitch, line, glint, toneN, RAMPS, shadowOf,
} from './gearKit.js';
import { vol } from './shade.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const isTop = (m, x, y) => !m.get(x - 1, y) || !m.get(x, y - 1);
const isBot = (m, x, y) => !m.get(x + 1, y) || !m.get(x, y + 1);

/** Ellipsoid shading: tone from the normal of an ellipsoid (cx, cy, rx, ry), clamped lo..hi. */
function ballTone(x, y, cx, cy, rx, ry, o = {}) {
  const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
  const nz = Math.sqrt(Math.max(0.02, 1 - nx * nx - ny * ny)) * (o.flat ?? 1);
  return clamp(toneN(nx, ny, nz, o.bias || 0), o.lo ?? 1, o.hi ?? 5);
}
function ball(pc, mask, R, cx, cy, rx, ry, o = {}) {
  mask.each((x, y) => {
    let k = ballTone(x, y, cx, cy, rx, ry, o);
    if (o.rim && isBot(mask, x, y) && !isTop(mask, x, y) && (x + 0.5 - cx) > rx * 0.25 && k >= 4) k = 3; // reflected light
    pc.set(x, y, R[k]);
  });
}
/** Soft volume via the distance-field dome (gfx/px/shade.vol) limited to a few clean tones. */
function soft(pc, mask, R, o = {}) {
  vol(pc, mask, R, { round: o.round ?? 3, min: o.min ?? 1, max: o.max ?? 5, bias: o.bias || 0, spec: o.spec ?? false, bounce: o.bounce });
  if (o.lip !== false) mask.each((x, y) => { if (isTop(mask, x, y) && !isBot(mask, x, y)) step(pc, R, x, y, -1, 1, 5); });
}

// ---------------------------------------------------------------- helmets
function helmet(pc, id) {
  if (id === 'helmet_sun') return crown(pc);
  const kind = id === 'helmet_basic' ? 'cap' : id === 'helmet_brass' ? 'brass' : 'lumite';
  const R = kind === 'cap' ? mat(0xa8763a, { cont: 1.12 }) : kind === 'brass' ? mat(0xd0a040, { cont: 1.22, warm: 52 }) : mat(0x8c9aaa, { cont: 1.25 });
  const BAND = kind === 'cap' ? mat(0x4e2e1e, { cont: 1.1 }) : kind === 'brass' ? mat(0x7a4a24, { cont: 1.1 }) : mat(0x4a5262, { cont: 1.2 });
  // brim: lit top surface, shaded front lip; a little wider at the front than the back
  const brx = kind === 'cap' ? 14.2 : kind === 'brass' ? 12.8 : 12;
  const brim = M().ellipse(16, 23.8, brx, 3.7).ellipse(15, 24.6, brx - 3, 3.3);
  brim.each((x, y) => {
    const ny = (y + 0.5 - 23.8) / 3.7, nx = (x + 0.5 - 16) / brx;
    let k = ny < 0.05 ? (nx < -0.4 ? 1 : nx < 0.45 ? 2 : 3) : ny < 0.6 ? 3 : 4;
    if (y >= 27) k = 5;
    pc.set(x, y, R[k]);
  });
  // dome: a near hemisphere, turned a touch to the left
  const cx = 15.2, cy = 22.4, rx = 10.8, ry = 13;
  const dome = M().ellipse(cx, cy, rx, ry).and(M().rect(0, 0, 32, 23));
  seam(pc, dome, 'shadow');
  ball(pc, dome, R, cx, cy, rx, ry, { bias: -0.08, rim: true, lo: 2 });
  for (const [x, y, k] of [[9, 15, 1], [10, 14, 1], [11, 13, 1], [9, 16, 1], [10, 15, 0]]) if (dome.get(x, y)) pc.set(x, y, R[k]);
  // band round the bottom of the dome
  const band = dome.clone().and(M().rect(0, 19, 32, 4));
  seam(pc, band, BAND[6], { only: (x, y) => y < 19 });
  band.each((x, y) => { const k = ballTone(x, y, cx, cy, rx, ry, { bias: -0.05, lo: 2 }); pc.set(x, y, BAND[clamp(k + (y === 22 ? 1 : 0), 1, 5)]); });
  for (let x = 0; x < 32; x++) if (band.get(x, 19) && x < 13) pc.set(x, 19, BAND[1]);
  if (kind === 'cap') {
    // hardened leather: stitched gores, a dent, a tin holder with a stubby candle
    for (const [x0, y0, x1, y1] of [[13, 11, 11, 18], [19, 11, 21, 18]]) {
      line(pc, x0, y0, x1, y1, (i, X, Y) => R[Math.min(5, R.indexOf(pc.get(X, Y)) + 1)], dome);
      stitch(pc, [[x0 + 1, y0 + 1], [x1 + 1, y1]], mix(R[1], 0xfff0c8, 0.45), { gap: 2, mask: dome });
    }
    pc.set(22, 15, R[5]); pc.set(23, 16, R[2]); pc.set(22, 16, R[4]);
    for (const x of [7, 24]) rivet(pc, x, 20, mat(0xc8ccd4, { cont: 1.2 }));
    const TN = mat(0xb0b4bc, { cont: 1.25 });
    const holder = M().rect(12, 17, 6, 2).ellipse(15, 19.4, 3.2, 1.4);
    seam(pc, holder, 'shadow');
    holder.each((x, y) => pc.set(x, y, TN[y === 17 ? 1 : x < 14 ? 2 : x < 16 ? 3 : 4]));
    const WX = mat(0xf2e6c6, { cont: 0.95 });
    const cdl = M().rect(13, 11, 4, 6);
    seam(pc, cdl, 'shadow');
    cdl.each((x, y) => pc.set(x, y, WX[x === 13 ? 1 : x === 14 ? 2 : x === 15 ? 3 : 4]));
    for (const [x, y, k] of [[13, 11, 1], [14, 11, 1], [16, 11, 2], [12, 13, 2], [12, 14, 3], [17, 12, 3], [17, 13, 4], [17, 14, 4]]) pc.set(x, y, WX[k]);
    pc.set(15, 10, 0x2a1a14);
    ink(pc);
    for (const [x, y, c] of [[15, 9, 0xffa828], [14, 9, 0xffd060], [16, 9, 0xff8a1a], [15, 8, 0xffd870], [14, 8, 0xffe39a], [15, 7, 0xffe8a8], [15, 6, 0xfff4d8]]) { pc.set(x, y, c); pc.emit(x, y, 1); }
    return;
  }
  if (kind === 'brass') {
    // comb ridge front to back, rivets on the band, a lamp with a glowing reflector
    for (let y = 11; y < 19; y++) { const x = Math.round(14.6 - (y - 11) * 0.1); if (dome.get(x, y)) { pc.set(x, y, R[1]); pc.set(x + 1, y, R[4]); } }
    for (const x of [7, 10, 20, 23]) rivet(pc, x, 20, R);
    dents(pc, dome, R, { dens: 0.05, seed: 13, only: (x, y) => y < 18 && y > 12 });
    const LB = mat(0xb48434, { cont: 1.22, warm: 52 });
    const lamp = M().rect(10, 12, 9, 7).ellipse(14.5, 12, 4.5, 1.3);
    seam(pc, lamp, 'shadow');
    lamp.each((x, y) => pc.set(x, y, LB[y < 12 ? 1 : x < 12 ? 2 : x < 16 ? 3 : 4]));
    const refl = M().disk(14.5, 15.4, 3.2);
    refl.each((x, y) => pc.set(x, y, LB[(x + y) < 29 ? 1 : 4]));
    const glass = M().disk(14.5, 15.4, 2.1);
    const GL = mat(0xffd27a, { cont: 1 });
    glass.each((x, y) => { const t = (x + 0.5 - 14.5) + (y + 0.5 - 15.4); pc.set(x, y, GL[t < -1.4 ? 0 : t < 0.6 ? 1 : 2]); pc.emit(x, y, 1); });
    const ch = M().rect(13, 8, 3, 3);
    seam(pc, ch, 'shadow');
    ch.each((x, y) => pc.set(x, y, LB[x === 13 ? 2 : x === 14 ? 3 : 4]));
    ink(pc);
    glint(pc, 13, 14, 0, 0, 1);
    pc.set(14, 6, 0xffe0a0, 110); pc.set(15, 5, 0xffe0a0, 70);
    return;
  }
  // lumite: steel helmet with a riveted rib and a crystal in a brass bezel
  for (let y = 11; y < 19; y++) { const x = 15; if (dome.get(x, y)) { pc.set(x - 1, y, R[2]); pc.set(x, y, R[1]); pc.set(x + 1, y, R[4]); } }
  for (const x of [7, 11, 20, 24]) rivet(pc, x, 20, R);
  for (let y = 12; y < 19; y += 3) rivet(pc, 14, y, R);
  const bez = M().disk(15.5, 14.6, 3.9);
  seam(pc, bez, 'shadow');
  const BZ = RAMPS.brass();
  bez.each((x, y) => pc.set(x, y, BZ[(x + y) < 29 ? 2 : 4]));
  const LR = mat(0x7bf08a, { cont: 1.1 });
  const g = M().poly([[15.5, 11.2], [18.4, 14.6], [15.5, 18], [12.6, 14.6]]);
  g.each((x, y) => { const l = x + 0.5 < 15.5, u = y + 0.5 < 14.6; pc.set(x, y, LR[l ? (u ? 1 : 2) : (u ? 2 : 4)]); pc.emit(x, y, 0.95); });
  ink(pc);
  glint(pc, 14, 13, 0, 0, 1);
  for (const [x, y] of [[5, 10], [26, 9]]) glint(pc, x, y, 1, 0xb8ffc0, 0.7);
}

function crown(pc) {
  const R = mat(0xf0bc34, { cont: 1.2, warm: 55 });
  const IN = mat(0xb07a1e, { cont: 1.1 });
  // inside of the back of the band, seen between the points
  const backBand = M().rect(5, 15, 22, 4);
  backBand.each((x, y) => pc.set(x, y, IN[y === 15 ? 3 : x < 16 ? 4 : 5]));
  for (let x = 6; x < 26; x += 3) pc.set(x, 16, IN[2]);
  // the front: band + five points (side points short, the middle one tall)
  const tips = [[3.5, 11], [9.5, 8], [16, 3.6], [22.5, 8], [28.5, 11]];
  const pts = [[3, 27.4], [3, 11.5]];
  for (let i = 0; i < tips.length; i++) {
    pts.push(tips[i]);
    if (i < tips.length - 1) pts.push([(tips[i][0] + tips[i + 1][0]) / 2, 17.4]);
  }
  pts.push([29, 11.5], [29, 27.4]);
  const front = M().poly(pts);
  seam(pc, front, 'shadow');
  front.each((x, y) => {
    // each point is a little pyramid: lit left face, shaded right face
    let near = tips[0];
    for (const t of tips) if (Math.abs(t[0] - x - 0.5) < Math.abs(near[0] - x - 0.5)) near = t;
    let k = y < 19 ? (x + 0.5 < near[0] ? 2 : 3) : 2;
    if (x > 22) k++;
    if (x < 6) k = Math.max(1, k - 1);
    pc.set(x, y, R[clamp(k, 1, 5)]);
  });
  // ridge lines up the points
  for (const [tx, ty] of tips) for (let y = Math.ceil(ty) + 1; y < 19; y++) if (front.get(tx, y)) pc.set(tx, y, R[1]);
  // band: raised rims, an engraved wave between them
  for (let x = 3; x < 30; x++) {
    const sh = x < 8 ? 0 : x < 23 ? 1 : 2;
    pc.set(x, 19, R[1 + Math.min(1, sh)]); pc.set(x, 20, R[3 + Math.min(1, sh)]);
    pc.set(x, 25, R[1 + sh]); pc.set(x, 26, R[4 + Math.min(1, sh)]);
    const wy = 22 + Math.round(Math.sin(x * 0.9));
    pc.set(x, wy, R[4]);
  }
  // pearls on the tips
  for (const [x, y] of tips) {
    const m = M().disk(x, y - 0.4, 1.5);
    seam(pc, m, 'shadow');
    m.each((X, Y) => { const t = (X + 0.5 - x) + (Y + 0.5 - y + 0.4); pc.set(X, Y, t < -0.6 ? 0xffffff : t < 0.8 ? 0xf2eadc : 0xb4a49c); });
  }
  // sunstone in a claw setting, smaller gems either side
  const SR = mat(0xffb82a, { cont: 1.1 });
  const s = M().ellipse(16, 21.8, 3.4, 3.6);
  seam(pc, s, R[6]);
  s.each((x, y) => { const t = (x + 0.5 - 16) * -0.6 + (y + 0.5 - 21.8) * -0.8; pc.set(x, y, SR[t > 1.6 ? 0 : t > 0.3 ? 1 : t > -1.2 ? 2 : 3]); pc.emit(x, y, 1); });
  for (const [x, y] of [[12, 19], [19, 19], [12, 24], [19, 24]]) pc.set(x, y, R[0]);
  for (const [x, c] of [[8, 0xe0283a], [24, 0x2a5ae0]]) {
    const m = M().ellipse(x + 0.5, 22.5, 1.6, 1.5);
    seam(pc, m, R[6]);
    m.each((X, Y) => pc.set(X, Y, (X + Y) < x + 22 ? mix(c, 0xffffff, 0.5) : (X + Y) < x + 24 ? c : shadowOf(c, 0.55)));
  }
  ink(pc);
  glint(pc, 15, 20, 0, 0, 1);
  glint(pc, 6, 15, 1, R[0]);
  for (const [x, y] of [[25, 3], [29, 6]]) glint(pc, x, y, 1, 0xfff4b0, 0.6);
}

// ---------------------------------------------------------------- gloves
/**
 * One glove, palm toward the viewer, fingers up and a little fanned. (ox, oy) = palm centre.
 * kind: 'rubber' | 'mitt' | 'gauntlet'. Returns { all, palm, fingers, thumb, cuff }.
 */
function glove(pc, ox, oy, R, CR, kind, back = false) {
  const bias = back ? -0.22 : 0;
  const palm = M().ellipse(ox, oy - 0.6, 6, 5.6).union(M().rect(Math.round(ox - 6), Math.round(oy - 1), 12, 6));
  const fingers = [];
  if (kind === 'mitt') {
    const m = M().ellipse(ox - 0.3, oy - 6.8, 6, 6.2);
    fingers.push({ m, mitt: true });
  } else {
    // index, middle, ring, little: fanned a little, different lengths, separated by dark gaps
    const F = [[-4.4, 8.6, -0.12], [-1.5, 10, -0.03], [1.4, 9.4, 0.05], [4.2, 7.4, 0.16]];
    for (const [dx, len, a] of F) {
      const bx = ox + dx, by = oy - 3;
      const tx = bx + Math.sin(a) * len, ty = by - Math.cos(a) * len;
      fingers.push({ m: M().capsule(bx, by, tx, ty, 1.38), x0: bx, y0: by, x1: tx, y1: ty, r: 1.38, len });
    }
  }
  const thumb = { x0: ox - 4.8, y0: oy + 1.4, x1: ox - 9.2, y1: oy - 3.4, r: 1.75 };
  thumb.m = M().capsule(thumb.x0, thumb.y0, thumb.x1, thumb.y1, thumb.r);
  const cuff = M().poly([[ox - 6.4, oy + 4.4], [ox + 6.4, oy + 4.4], [ox + 7.4, oy + 12.6], [ox - 7.4, oy + 12.6]]);
  const all = palm.clone().union(thumb.m).union(cuff);
  for (const f of fingers) all.union(f.m);
  // fingers (each seamed against its neighbour so they read separately), palm, thumb, cuff
  for (const f of fingers) {
    seam(pc, f.m, 'shadow');
    if (f.mitt) { ball(pc, f.m, R, ox - 0.8, oy - 7.8, 6.6, 7, { bias: bias + 0.02, lo: back ? 2 : 1 }); continue; }
    stick(pc, f.x0, f.y0, f.x1, f.y1, f.r, R, { tones: kind === 'rubber' ? [1, 2, 3, 4] : [2, 2, 3, 4], min: back ? 2 : 1, tex: () => (back ? 1 : 0) });
    // fingertip catch-light and two knuckle creases
    const tx = f.x1 - 0.6, ty = f.y1 - 0.2;
    if (f.m.get(tx, ty)) pc.set(tx, ty, R[back ? 2 : 1]);
    for (const t of [0.42, 0.72]) { const x = f.x0 + (f.x1 - f.x0) * t, y = f.y0 + (f.y1 - f.y0) * t; if (f.m.get(x + 0.5, y)) pc.set(x + 0.5, y, R[back ? 5 : 4]); }
  }
  const pm = palm.clone().sub(cuff);
  seam(pc, pm, 'shadow', { only: (x, y) => y > oy - 6 });
  ball(pc, pm, R, ox - 0.8, oy - 1.2, 7, 7.2, { bias, rim: true, lo: back ? 2 : 1 });
  // heel-of-hand crease
  for (let x = Math.round(ox - 3); x < ox + 2; x++) if (pm.get(x, oy + 2)) pc.set(x, Math.round(oy + 2 - (x - ox) * 0.25), R[back ? 5 : 4]);
  seam(pc, thumb.m, 'shadow', { only: (x, y) => pm.get(x, y) });
  stick(pc, thumb.x0, thumb.y0, thumb.x1, thumb.y1, thumb.r, R, { tones: [1, 2, 3, 3, 4, 5], min: back ? 2 : 1 });
  seam(pc, cuff, CR[6], { only: (x, y) => y < oy + 4.4 });
  cuff.each((x, y) => {
    const t = (x + 0.5 - ox) / 7.4;
    let k = t < -0.6 ? 2 : t < 0.15 ? 3 : t < 0.7 ? 4 : 5;
    if (y <= Math.round(oy + 5)) k = Math.max(1, k - 1);
    pc.set(x, y, CR[clamp(k + (back ? 1 : 0), 1, 5)]);
  });
  return { all, palm: pm, fingers, thumb, cuff };
}

function gloves(pc, id) {
  const kind = id === 'ember_mitts' ? 'mitt' : id === 'frost_gauntlets' ? 'gauntlet' : 'rubber';
  const R = kind === 'rubber' ? mat(0xf0c428, { cont: 1.22, warm: 55 }) : kind === 'mitt' ? mat(0xc8502a, { cont: 1.12 }) : mat(0x86c4e4, { cont: 1.2 });
  const CR = kind === 'rubber' ? mat(0xd8a418, { cont: 1.2 }) : kind === 'mitt' ? mat(0x6a3a22, { cont: 1.1 }) : mat(0x5a7aa8, { cont: 1.2 });
  const backG = glove(pc, 21, 14.6, R, CR, kind, true);
  const G = glove(pc, 12.6, 18.4, R, CR, kind, false);
  const { all, palm, cuff } = G;
  if (kind === 'rubber') {
    // rolled cuff lip, wet shine streaks, a lightning bolt stamped on the cuff
    for (let x = 0; x < 32; x++) if (cuff.get(x, 29)) pc.set(x, 29, CR[2]);
    for (const f of G.fingers) for (const t of [0.55, 0.65]) { const x = f.x0 + (f.x1 - f.x0) * t - 0.8, y = f.y0 + (f.y1 - f.y0) * t; if (f.m.get(x, y)) pc.set(x, y, R[0]); }
    for (const [x, y] of [[9, 15], [10, 14]]) if (palm.get(x, y)) pc.set(x, y, R[0]);
    const BOLT = 0xc8341c;
    for (const [x, y] of [[14, 23], [13, 24], [14, 24], [12, 25], [13, 25], [14, 25], [13, 26], [12, 27]]) pc.set(x, y, BOLT);
    pc.set(15, 23, mix(BOLT, 0xffffff, 0.3));
  } else if (kind === 'mitt') {
    const PA = mat(0x7a4a2a, { cont: 1.1 });
    const pt = M().ellipse(13.5, 18.6, 3.6, 2.6);
    seam(pc, pt, 'shadow');
    pt.each((x, y) => pc.set(x, y, PA[(x + y) < 31 ? 2 : 3]));
    stitch(pc, [[10, 18], [12, 16], [15, 16], [17, 18]], mix(PA[1], 0xf0d8a0, 0.5), { gap: 2 });
    // fleece trim on the cuff
    for (let x = 0; x < 32; x++) if (cuff.get(x, 22) || cuff.get(x, 23)) { pc.set(x, 22, hash2(x, 1, 3) < 0.5 ? 0xf2e8d8 : 0xd8ccb8); pc.set(x, 23, hash2(x, 2, 3) < 0.4 ? 0xe8dcc8 : 0xc0b098); }
  } else {
    // articulated finger plates: a dark joint line every couple of pixels, lit lip below it
    for (const f of G.fingers.concat(backG.fingers)) {
      for (const t of [0.34, 0.62, 0.86]) {
        const x = f.x0 + (f.x1 - f.x0) * t, y = Math.floor(f.y0 + (f.y1 - f.y0) * t);
        for (let dx = -2; dx <= 2; dx++) { const X = Math.floor(x + dx); if (f.m.get(X, y)) pc.set(X, y, R[5]); }
      }
    }
    const kn = M().rect(8, 15, 11, 2);
    seam(pc, kn, 'shadow');
    kn.each((x, y) => pc.set(x, y, R[y === 15 ? 1 : 3]));
    for (const x of [10, 14]) rivet(pc, x, 15, R);
    for (const [x, y] of [[8, 23], [13, 23], [18, 23]]) rivet(pc, x, y, CR);
    // frost rime along the top edges
    for (const [x, y] of [[5, 14], [6, 14], [8, 9], [11, 7], [20, 4], [23, 5], [7, 23]]) if (all.get(x, y)) pc.set(x, y, 0xf4fcff);
  }
  ink(pc);
  if (kind === 'mitt') for (const [x, y, c] of [[11, 11, 0xffc050], [16, 8, 0xffa040], [14, 14, 0xffd070], [26, 4, 0xffb04a], [4, 8, 0xff9a3a]]) { glint(pc, x, y, (x < 6 || x > 24) ? 1 : 0, c, 0.9); pc.emit(x, y, 1); }
  if (kind === 'gauntlet') for (const [x, y] of [[27, 4], [3, 6]]) glint(pc, x, y, 1, 0xbff6ff, 0.6);
  if (kind === 'rubber') glint(pc, 10, 9, 1, R[0]);
}

// ---------------------------------------------------------------- suits
function suit(pc, id) {
  const thermal = id === 'thermal_suit';
  const R = thermal ? mat(0x4e72c8, { cont: 1.15 }) : mat(0xc4c0b8, { cont: 1.25, hs: 0.6 });
  const TR = thermal ? mat(0xe8782a, { cont: 1.15 }) : mat(0xd8a838, { cont: 1.2, warm: 52 }); // trim
  const DK = mat(thermal ? 0x2a3450 : 0x5a5450, { cont: 1.1 });
  // sleeves (behind the torso), the left one bent at the elbow
  const armL = M().path([[9.5, 8.5], [5.4, 14], [3.6, 21.6]], [3, 2.9, 2.6]);
  const armR = M().path([[22.5, 8.5], [26.4, 14.6], [28, 21.4]], [3, 2.9, 2.6]);
  for (const [arm, sx] of [[armL, -1], [armR, 1]]) {
    arm.each((x, y) => { const t = sx < 0 ? (x - 2) / 7 : (x - 23) / 7; pc.set(x, y, R[t < 0.3 ? 2 : t < 0.65 ? 3 : 4]); });
  }
  // gloves-cuffs on the sleeves
  for (const [x, y] of [[3.6, 22.4], [28, 22.2]]) { const m = M().ellipse(x, y, 2.6, 1.6); seam(pc, m, 'shadow'); m.each((X, Y) => pc.set(X, Y, TR[Y < y ? 2 : 4])); }
  // torso + legs with a crotch gap
  const body = M().poly([[9, 6.5], [23, 6.5], [24.4, 19], [24.6, 30], [17.2, 30], [16.4, 21.6], [15.6, 21.6], [14.8, 30], [7.4, 30], [7.6, 19]]);
  seam(pc, body, 'shadow');
  ball(pc, body, R, 14.6, 15, 11, 16, { bias: 0.1, rim: true });
  // quilting: gently curved stitched seams
  for (let y0 = 10; y0 < 19; y0 += 3) for (let x = 8; x < 25; x++) {
    const y = y0 + Math.round(Math.sin((x - 8) / 16 * Math.PI) * 0.6);
    if (body.get(x, y) && Math.abs(x - 16) > 0) step(pc, R, x, y, 1, 1, 5);
  }
  // trouser seams and knee pads
  for (const [x0, x1] of [[8, 15], [17, 24]]) {
    const kp = M().rect(x0 + 1, 24, x1 - x0 - 1, 3);
    seam(pc, kp, 'shadow');
    kp.each((x, y) => pc.set(x, y, DK[y === 24 ? 2 : x < x0 + 3 ? 3 : 4]));
  }
  // collar / hood ring, zipper, belt with buckle, a chest pocket with flap
  const col = M().ellipse(16, 6.6, 6.8, 2.6);
  seam(pc, col, 'shadow');
  col.each((x, y) => pc.set(x, y, thermal ? (hash2(x, y, 4) < 0.5 ? 0xf2e6d2 : 0xd4c4aa) : TR[x < 14 ? 2 : x < 19 ? 3 : 4]));
  if (thermal) for (let x = 10; x < 23; x += 2) pc.set(x, 4 + (x % 4 ? 0 : 1), 0xfff8ec);
  for (let y = 9; y < 20; y++) { pc.set(16, y, y % 2 ? DK[2] : DK[4]); pc.set(15, y, step(pc, R, 15, y, 1) ? pc.get(15, y) : pc.get(15, y)); }
  pc.set(16, 9, 0xe8e8f0); pc.set(16, 10, 0xb8b8c8);
  const belt = body.clone().and(M().rect(0, 19, 32, 2));
  belt.each((x, y) => pc.set(x, y, DK[y === 19 ? 2 : 4]));
  const BK = RAMPS.brass();
  for (const [x, y, k] of [[15, 19, 1], [16, 19, 2], [17, 19, 2], [15, 20, 3], [16, 20, 5], [17, 20, 4]]) pc.set(x, y, BK[k]);
  const pk = M().rect(18, 10, 4, 4);
  seam(pc, pk, 'shadow');
  pk.each((x, y) => pc.set(x, y, y === 10 ? TR[2] : R[x === 18 ? 2 : 3]));
  pc.set(20, 11, BK[1]);
  if (thermal) {
    // orange piping down the arms and legs
    for (let i = 0; i < 12; i++) { const t = i / 11; pc.set(Math.round(7 - t * 3.6), 10 + i, TR[2]); pc.set(Math.round(25 + t * 2.6), 10 + i, TR[3]); }
    for (let y = 22; y < 30; y++) { pc.set(8, y, TR[2]); pc.set(24, y, TR[4]); }
  } else {
    // aluminised sheen: crisp light streaks + reflective bands
    for (const [x, y] of [[11, 9], [10, 10], [10, 11], [11, 15], [12, 16], [20, 22], [21, 23], [5, 12]]) if (pc.alpha(x, y)) pc.set(x, y, R[0]);
    for (let x = 8; x < 25; x++) if (body.get(x, 17)) pc.set(x, 17, TR[(x < 12 ? 1 : x < 20 ? 2 : 3)]);
  }
  ink(pc);
  glint(pc, thermal ? 11 : 10, 10, thermal ? 0 : 1, R[0]);
}

// ---------------------------------------------------------------- boots
function boots(pc, id) {
  const spring = id === 'spring_boots';
  const R = spring ? mat(0x3a7ad0, { cont: 1.15 }) : mat(0x7a4c2c, { cont: 1.12 });
  const SO = mat(0x3a2a22, { cont: 1.1 });
  const CF = spring ? mat(0xe8e8f0, { cont: 1.1 }) : mat(0xc89a62, { cont: 1.05 });
  const LC = spring ? 0xf4f4f8 : 0xe8d0a0;
  const boot = (ox, oy, back) => {
    // shaft, ankle and foot in side view (toe to the right), slightly scuffed
    const m = M().poly([[ox + 2.4, oy], [ox + 10.6, oy], [ox + 10.8, oy + 11], [ox + 15.6, oy + 13.2], [ox + 17.2, oy + 16.6], [ox + 16.8, oy + 18.6], [ox + 1.4, oy + 18.6], [ox + 1.8, oy + 9]]);
    m.ellipse(ox + 14, oy + 16.2, 3.4, 2.6);
    seam(pc, m, 'shadow');
    m.each((x, y) => {
      const t = (x - ox) / 17;
      let k = t < 0.18 ? 2 : t < 0.55 ? 3 : 4;
      if (y > oy + 10 && x > ox + 11) k = (y < oy + 14 ? 2 : 3); // toe box catches the light
      if (back) k = Math.min(5, k + 1);
      pc.set(x, y, R[k]);
    });
    // toe cap seam and heel counter seam
    for (let y = oy + 12; y < oy + 18; y++) { const x = Math.round(ox + 12 - (y - oy - 12) * 0.3); if (m.get(x, y)) pc.set(x, y, R[5]); }
    for (let y = oy + 12; y < oy + 18; y++) if (m.get(ox + 4, y)) pc.set(ox + 4, y, R[back ? 5 : 4]);
    stitch(pc, [[ox + 3, oy + 12.5], [ox + 3, oy + 17]], mix(R[1], 0xf0e0c0, 0.4), { gap: 2 });
    // folded cuff
    const cuff = M().rect(ox + 2, oy, 9, 3);
    seam(pc, cuff, 'shadow');
    cuff.each((x, y) => pc.set(x, y, CF[(y === oy ? 1 : 2) + (x > ox + 8 ? 1 : 0) + (back ? 1 : 0)]));
    // laces: eyelets + crossing laces down the front
    for (let y = oy + 4; y < oy + 12; y += 2) {
      pc.set(ox + 9, y, LC); pc.set(ox + 8, y + 1, mix(LC, R[4], 0.4)); pc.set(ox + 10, y + 1, 0x2a1a14);
    }
    pc.set(ox + 11, oy + 3, LC); pc.set(ox + 12, oy + 4, mix(LC, 0x806040, 0.3)); // lace bow end
    // sole
    const sole = M().rect(ox + 1, oy + 18, 17, 3).ellipse(ox + 16.4, oy + 19.4, 1.8, 1.5);
    seam(pc, sole, 'shadow');
    sole.each((x, y) => pc.set(x, y, SO[y === oy + 18 ? 2 : y === oy + 19 ? 3 : 4]));
    if (spring) {
      // gravium coil under the heel, brass plate
      // gravium coil under the heel: stacked rings, front arcs lit, back arcs in shadow
      const SP = mat(0xc8ccd4, { cont: 1.3 });
      const cxs = ox + 6.5;
      for (let i = 0; i < 2; i++) {
        const cy = oy + 22.1 + i * 1.8;
        for (let a = 0; a < Math.PI * 2; a += 0.12) {
          const x = Math.floor(cxs + Math.cos(a) * 2.9), y = Math.floor(cy + Math.sin(a) * 0.95);
          const front = Math.sin(a) > 0;
          if (!front && pc.alpha(x, y)) continue;
          pc.set(x, y, front ? SP[Math.cos(a) < -0.3 ? 1 : Math.cos(a) < 0.4 ? 2 : 4] : SP[5]);
        }
      }
      const BP = RAMPS.brass();
      for (let x = ox + 3; x < ox + 11; x++) { pc.set(x, oy + 25, BP[x < ox + 5 ? 1 : 3]); pc.set(x, oy + 26, BP[4]); }
    } else {
      // iron studs and a worn heel
      for (let x = ox + 2; x < ox + 18; x += 3) { pc.set(x, oy + 20, 0xd8dce4); pc.set(x, oy + 21, 0x5a5e68); }
    }
    return m;
  };
  boot(13, 1, true);
  boot(1, spring ? 4 : 8, false);
  ink(pc);
  glint(pc, 27, 13, 0);
  glint(pc, 15, 20, 0);
}

// ---------------------------------------------------------------- bags
function bag(pc, id) {
  switch (id) {
    case 'bag_small': {
      // burlap sack, slumped to one side, cinched with twine; coarse weave, a stitched patch
      const R = mat(0xc4a06a, { cont: 1.05 });
      const m = M().poly([[9, 11], [21, 10], [26, 16], [28, 24], [25, 29], [16, 30.4], [6, 29], [3.6, 23], [5, 16]]);
      m.ellipse(16, 22, 11.8, 8.2);
      seam(pc, m, 'shadow');
      ball(pc, m, R, 14.5, 21, 13.2, 10.4, { bias: 0.08, rim: true });
      // weave
      m.each((x, y) => { if ((x + y * 2) % 4 === 0 && hash2(x, y, 2) < 0.7) step(pc, R, x, y, 1, 1, 5); });
      // folds radiating from the neck
      for (const [x0, y0, x1, y1] of [[12, 12, 9, 19], [19, 12, 23, 18], [16, 13, 16, 17]]) line(pc, x0, y0, x1, y1, (i, X, Y) => (i % 3 === 2 ? null : R[Math.min(5, R.indexOf(pc.get(X, Y)) + 1)]), m);
      // gathered neck with a ruffled mouth
      const neck = M().poly([[12, 5], [20.6, 4.4], [18.8, 10.6], [13.4, 10.6]]);
      seam(pc, neck, 'shadow');
      neck.each((x, y) => pc.set(x, y, R[(x % 2 ? 1 : 0) + (x < 15 ? 2 : x < 18 ? 3 : 4)]));
      for (let x = 11; x <= 21; x++) pc.set(x, 4 + (x % 2), R[x % 2 ? 2 : 3]);
      // twine: two turns, a knot and a dangling end
      const TW = RAMPS.twine();
      for (let x = 12; x <= 20; x++) { pc.set(x, 9, TW[(x % 2) + 2]); pc.set(x, 10, TW[4]); }
      pc.set(21, 10, TW[2]); pc.set(22, 11, TW[3]); pc.set(22, 12, TW[3]); pc.set(23, 13, TW[4]); pc.set(23, 14, TW[3]);
      // patch with cross stitches
      const PA = mat(0x8e6c44, { cont: 1.05 });
      const p = M().poly([[17, 19], [23, 18.4], [23.6, 24], [17.6, 24.6]]);
      seam(pc, p, 'shadow');
      p.each((x, y) => pc.set(x, y, PA[(x + y) < 41 ? 2 : 3]));
      for (const [x, y] of [[17, 19], [19, 18], [21, 18], [23, 20], [23, 22], [18, 24], [20, 24]]) pc.set(x, y, 0xe8d8b0);
      ink(pc);
      break;
    }
    case 'bag_medium': {
      // leather satchel: shoulder strap, body, flap with stitched edge and a brass buckle
      const R = RAMPS.leather();
      const strap = M().path([[4.6, 15], [6.6, 6], [12, 2.6], [20, 2.6], [25.4, 6], [27.4, 15]], 1.25);
      strap.each((x, y) => pc.set(x, y, R[y < 4 ? 2 : x < 16 ? 3 : 4]));
      const body = M().poly([[4, 12], [28, 12], [28.4, 27], [27, 29], [5, 29], [3.6, 27]]);
      seam(pc, body, 'shadow');
      soft(pc, body, R, { round: 3, min: 2, bias: 0.06 });
      // scuffs and a side gusset seam
      pits(pc, body, R, 0.04, 6, 0.02);
      for (let y = 22; y < 29; y++) { pc.set(5, y, R[4]); pc.set(26, y, R[5]); }
      const flap = M().poly([[3.6, 12], [28.4, 12], [27.6, 20], [22, 23], [10, 23], [4.4, 20]]);
      seam(pc, flap, 'shadow');
      flap.each((x, y) => { const t = (x - 4) / 24; pc.set(x, y, R[y === 12 ? 1 : t < 0.25 ? 2 : t < 0.7 ? 3 : 4]); });
      // creased fold along the top of the flap
      for (let x = 5; x < 28; x++) pc.set(x, 14, R[x % 5 === 0 ? 4 : 3]);
      // stitching along the flap edge
      const edgeP = [[5, 15], [5.4, 19.6], [10.4, 22], [21.6, 22], [26.6, 19.6], [27, 15]];
      stitch(pc, edgeP, mix(R[1], 0xf4dca8, 0.55), { gap: 2 });
      // strap tongue + brass buckle
      const tg = M().rect(14, 19, 4, 8);
      seam(pc, tg, 'shadow');
      tg.each((x, y) => pc.set(x, y, R[x === 14 ? 2 : x === 17 ? 4 : 3]));
      const BK = RAMPS.brass();
      const bk = M().rect(13, 21, 6, 4).sub(M().rect(14, 22, 4, 2));
      bk.each((x, y) => pc.set(x, y, BK[y === 21 ? 1 : x === 13 ? 2 : y === 24 || x === 18 ? 4 : 2]));
      pc.set(15, 22, BK[1]); pc.set(15, 23, BK[3]); // prong
      for (const [x, y] of [[6, 4], [25, 4]]) rivet(pc, x, y, BK);
      ink(pc);
      glint(pc, 13, 21, 0);
      break;
    }
    case 'bag_large':
    case 'bag_huge': {
      const huge = id === 'bag_huge';
      const R = mat(huge ? 0x3a62a0 : 0x5e7040, { cont: 1.12 });
      const ST = RAMPS.leather();
      // bedroll strapped on top
      const RR = mat(huge ? 0xb04a3a : 0xa88a5a, { cont: 1.05 });
      const ry = huge ? 5 : 7;
      const roll = M().capsule(6.6, ry, 25.4, ry, 3.2);
      roll.each((x, y) => { let k = y < ry - 1.5 ? 2 : y < ry + 0.6 ? 3 : 4; if ((x + (y > ry ? 1 : 0)) % 6 === 0) k++; pc.set(x, y, RR[clamp(k, 1, 5)]); });
      // spiral end of the roll
      for (const [dx, dy, k] of [[0, 0, 5], [1, -1, 2], [-1, 1, 3], [1, 1, 4], [-1, -1, 1]]) pc.set(25 + dx, ry + dy, RR[k]);
      // main pack, front pocket, side pocket
      const pack = M().poly([[6.4, ry + 2], [25.6, ry + 2], [27.6, 29], [4.4, 29]]).ellipse(16, ry + 3, 10, 2.6);
      seam(pc, pack, 'shadow');
      soft(pc, pack, R, { round: 4, min: 2, bias: 0.08 });
      pack.each((x, y) => { if ((x * 3 + y) % 7 === 0 && hash2(x, y, 4) < 0.6) step(pc, R, x, y, 1, 1, 5); });
      const pk = M().poly([[9, 18], [23, 18], [23.6, 27.6], [8.4, 27.6]]);
      seam(pc, pk, 'shadow');
      soft(pc, pk, R, { round: 2, min: 2, bias: 0.1 });
      const fl = M().poly([[8.6, 17.4], [23.4, 17.4], [23, 21.4], [16, 22.6], [9, 21.4]]);
      seam(pc, fl, 'shadow');
      fl.each((x, y) => pc.set(x, y, R[y === 17 ? 1 : x < 12 ? 2 : x < 20 ? 3 : 4]));
      stitch(pc, [[9.6, 20.6], [16, 21.6], [22.4, 20.6]], mix(R[1], 0xf0e8c8, 0.5), { gap: 2 });
      // straps with buckles running over the bedroll and down the pack
      const BK = mat(0xc8ccd4, { cont: 1.25 });
      for (const x of [9, 22]) {
        for (let y = ry - 3; y < 29; y++) if (pack.get(x, y) || roll.get(x, y)) { if (pk.get(x, y) || fl.get(x, y)) continue; pc.set(x, y, ST[y % 4 === 0 ? 2 : 3]); pc.set(x + 1, y, ST[4]); }
        pc.set(x, ry + 4, BK[1]); pc.set(x + 1, ry + 4, BK[3]); pc.set(x, ry + 5, BK[4]);
      }
      for (const x of [12, 19]) { pc.set(x, 21, BK[1]); pc.set(x, 22, BK[4]); }
      if (huge) {
        // brass lantern hanging off the side strap
        const LN = mat(0x4a4a52, { cont: 1.15 });
        const ln = M().rect(26, 16, 4, 6);
        seam(pc, ln, 'shadow');
        ln.each((x, y) => pc.set(x, y, LN[y === 16 || y === 21 ? 2 : 4]));
        for (const [x, y, c] of [[27, 17, 0xfff0c0], [28, 17, 0xffd070], [27, 18, 0xffc860], [28, 18, 0xffb040], [27, 19, 0xffb040], [28, 19, 0xe8902a], [27, 20, 0xe8902a], [28, 20, 0xc8701e]]) { pc.set(x, y, c); pc.emit(x, y, 1); }
        pc.set(27, 15, LN[2]); pc.set(28, 14, LN[3]); pc.set(27, 13, LN[2]);
        // a map case sticking out of the top pocket
        const mp = M().rect(4, ry - 4, 3, 7);
        mp.each((x, y) => pc.set(x, y, [0xf0e2c0, 0xd8c49a, 0xb89e72][x - 4]));
        pc.set(5, ry - 4, 0xc04a3a);
      } else {
        // small pick strapped to the side
        line(pc, 2, 27, 6, 13, mat(0x9a6a3a)[3]); line(pc, 3, 27, 7, 13, mat(0x9a6a3a)[4]);
        const PI = mat(0x9aa0a8, { cont: 1.2 });
        line(pc, 2, 13, 9, 11, PI[2]); line(pc, 2, 14, 9, 12, PI[4]); pc.set(1, 15, PI[3]);
      }
      ink(pc);
      glint(pc, 9, ry - 1, 0);
      break;
    }
    case 'bag_bottomless': {
      // velvet pouch with a gold drawstring, a starry void where the inside should be
      const R = mat(0x6a2a8a, { cont: 1.15 });
      const m = M().ellipse(16, 21, 12, 9.4).poly([[8.6, 10], [23.4, 10], [27.4, 17], [4.6, 17]]);
      seam(pc, m, 'shadow');
      ball(pc, m, R, 14.6, 19.4, 13.4, 11.6, { bias: 0.1, rim: true });
      // velvet folds
      for (const [x0, y0, x1, y1] of [[10, 14, 7, 23], [21, 14, 25, 22], [15, 15, 14, 26]]) line(pc, x0, y0, x1, y1, (i, X, Y) => R[Math.min(5, R.indexOf(pc.get(X, Y)) + 1)], m);
      for (const [x0, y0, x1, y1] of [[11, 14, 8, 22], [16, 15, 15, 25]]) line(pc, x0, y0, x1, y1, (i, X, Y) => R[Math.max(1, R.indexOf(pc.get(X, Y)) - 1)], m);
      // ruffled lip and the mouth
      const lip = M().ellipse(16, 9.6, 9.8, 4.2);
      seam(pc, lip, 'shadow');
      const GD = RAMPS.gold();
      lip.each((x, y) => pc.set(x, y, R[(y < 8 ? 1 : 2) + (x > 20 ? 1 : 0) + ((x % 3 === 0) ? 1 : 0)]));
      const mouth = M().ellipse(16, 9.4, 7.8, 2.8);
      mouth.each((x, y) => { pc.set(x, y, y < 9 ? 0x0a0418 : 0x160a2c); });
      // drawstring through the lip, knotted with tassels
      for (let x = 6; x <= 26; x++) if (m.get(x, 14)) pc.set(x, 14, GD[x % 2 ? 2 : 3]);
      for (let x = 6; x <= 26; x++) if (m.get(x, 15) && x % 2 === 0) pc.set(x, 15, GD[4]);
      line(pc, 24, 14, 26, 19, GD[3]); line(pc, 25, 14, 27, 19, GD[4]); pc.set(26, 20, GD[1]); pc.set(27, 20, GD[2]); pc.set(26, 21, GD[3]);
      ink(pc);
      // stars in the void + a faint rune on the velvet (emissive, after the outline)
      for (const [x, y, c] of [[11, 9, 0xffffff], [14, 10, 0x9ad0ff], [17, 8, 0xd8b8ff], [20, 10, 0xffe8a0], [22, 9, 0xffffff], [13, 8, 0x8070c0]]) { pc.set(x, y, c); pc.emit(x, y, 1); }
      for (const [x, y] of [[16, 19], [15, 20], [17, 20], [16, 21], [16, 22], [14, 23], [18, 23]]) { pc.set(x, y, 0xe0b8ff); pc.emit(x, y, 0.7); }
      for (const [x, y] of [[4, 6], [28, 5], [28, 27]]) glint(pc, x, y, 1, 0xd8b8ff, 0.8);
      glint(pc, 9, 17, 0);
      break;
    }
  }
}

export { helmet, gloves, suit, boots, bag };

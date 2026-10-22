// The well: a low domed round room with a wave mosaic round a parapeted shaft and a timber winch
// over it (rope and bucket still hanging); down the shaft a spiral stair of stone treads hugs the
// wall past glowing rune niches to a landing just above the black water at the bottom. Under the
// water an arch opens into a flooded gallery, and at its end is the sealed door. A bronze wheel on
// the landing opens the old drain: the water sinks away and the door gives.
//
// Puzzle: 'valve'. Pure: runs in the chunk workers too.
import { M } from '../materials.js';
import { h3, G, rng, boxDist, treasureVox, strandMat, strandLen, glyphPix, hyp } from './common.js';

const T = 3;
const SW = 13; // stair width (voxels)
const RISE = 4, TREAD = 7, SLAB = 5;

export function wellLayout(L) {
  const { R, H } = L;
  const r = rng(L.seed + 404);
  const Hs = Math.round(H * 0.55);
  const RS = Math.max(26, Math.min(36, Math.round(R * 0.42)));
  const DD = 128 + Math.floor(r() * 3) * 16;
  const WL = 22; // water depth in the shaft
  const dth = TREAD / (RS - SW / 2);
  const kL = Math.floor((DD - WL) / RISE); // the last step: the landing
  const yL = -RISE * kL;
  // the stair starts so that its landing faces the gallery across the water (the gallery is at +a)
  const th0 = Math.PI + kL * dth + 0.8;
  const GL = 56, GW = 14, GH = 30;
  const gal = { a0: RS - 1, a1: RS + GL, y0: -DD, y1: -DD + GH };
  const room = { a0: RS + GL + T + 1, a1: RS + GL + T + 1 + 44, y0: -DD, y1: -DD + 36, b0: -24, b1: 24 };
  const hoards = [{ a: room.a1 - 9, b: -12, r: 8, h: 7 }, { a: room.a1 - 8, b: 12, r: 8, h: 6 }, { a: room.a0 + 9, b: 15, r: 5, h: 3 }];
  const thV = th0 - (kL * dth + 0.8); // the landing's middle
  const DW = 8, DH = 18;
  const doorRunes = [];
  for (let i = 0; i < 2; i++) for (const s of [-1, 1]) doorRunes.push({ a: gal.a1 - 2, y0: -DD + 4 + i * 6, y1: -DD + 7 + i * 6, b0: s < 0 ? -DW - 3 : DW + 1, b1: s < 0 ? -DW - 1 : DW + 3 });
  return {
    Hs, RS, DD, WL, dth, kL, yL, th0, GL, GW, GH, gal, room, hoards, DW, DH, doorRunes,
    door: { a0: gal.a1, a1: room.a0, y0: -DD, y1: -DD + DH + DW, b0: -DW, b1: DW },
    chest: { a: room.a1 - 12, y: -DD, b: 0, face: [-1, 0] },
    entry: { a: -R - 36, b: 0, dir: [-1, 0] },
    valve: { a: Math.cos(thV) * (RS - 0.5), b: Math.sin(thV) * (RS - 0.5), y: yL + 11, face: [-Math.cos(thV), -Math.sin(thV)] },
    winch: { y: 41, len: DD - WL - 30 },
    braziers: [{ a: gal.a1 - 6, b: -(DW + 4), y: -DD }, { a: gal.a1 - 6, b: DW + 4, y: -DD }],
    bb: [-R - 40, room.a1 + 6, -DD - 8, H + 12, -R - T - 4, R + T + 4],
  };
}

/**
 * The heights (local voxels) a column can change in, written to out [y0, y1): the shaft and the
 * gallery go deep, everywhere else only the room above (most of the bounding box is plain rock).
 */
export function wellSpan(L, a, b, out) {
  const P = L.P, ca = a + 0.5, cb = b + 0.5, ab = Math.abs(cb), d = Math.sqrt(ca * ca + cb * cb);
  const top = L.H + 13, low = -P.DD - 8;
  out[1] = top;
  if (d < P.RS + 4) out[0] = low;
  else if (ca >= P.RS - 4 && ab < P.room.b1 + 6) { out[0] = low; if (d >= L.R + 4 && ca > 0) out[1] = -P.DD + 46; }
  else out[0] = -4;
  return out;
}

/** Is local voxel (a, y, b) part of the spiral stair (or its landing)? */
function stairAt(P, ca, cb, y, d) {
  if (d < P.RS - SW || d >= P.RS || y >= 0) return false;
  const th = Math.atan2(cb, ca);
  let phi = (P.th0 - th) % (Math.PI * 2);
  if (phi < 0) phi += Math.PI * 2;
  for (let n = 0; n < 6; n++) {
    const ph = phi + n * Math.PI * 2;
    let k = Math.floor(ph / P.dth);
    if (k > P.kL) { if (ph < P.kL * P.dth + 1.6) k = P.kL; else break; } // the landing runs on level
    const top = -RISE * k;
    if (y >= top) return false; // above this tread (every later turn is lower still)
    if (y >= top - SLAB) return k === P.kL ? 2 : 1;
  }
  return false;
}

export function wellVox(L, a, y, b, cur, vx, vy, vz) {
  const P = L.P, R = L.R, H = L.H, { RS, DD, WL, Hs, gal, DW, DH } = P;
  const ca = a + 0.5, cb = b + 0.5, ab = Math.abs(cb);
  const d = hyp(ca, cb);
  // 1. the sealed door at the gallery's end, the treasure room
  if (ca >= gal.a1 - 2 && ca < P.room.a0 && ab < 20 && y >= -DD - 3 && y < -DD + 40) {
    const m = doorWall(L, P, a, y, b, ca, cb, ab, cur);
    if (m !== null && m !== -2) return m;
  }
  const rd = boxDist(P.room, a, y, b);
  if (rd <= 4 && a >= gal.a1) {
    const m = treasureVox(L, P.room, a, y, b, rd, vx, vy, vz);
    if (m >= 0) return m;
  }
  // 2. the flooded gallery
  if (ca >= RS - 3 && ca < gal.a1 && ab < P.GW + T && y >= -DD - 3 && y < -DD + P.GH + T) {
    const gy = y + DD;
    const vt = 20 + 10 * Math.sqrt(Math.max(0, 1 - (cb / P.GW) ** 2));
    const inG = ca >= RS + 2 && ab < P.GW && gy >= 0 && gy < vt;
    const arch = ca < RS + 3 && ab < 10 && gy >= 0 && gy < 18; // the opening under the water
    if (inG || (arch && d >= RS - 1)) {
      if (gy === 0 && ab < 3 && (Math.floor(ca) & 3) === 0) return M.BRONZE; // drain slots
      return M.WATER;
    }
    if (d >= RS + T || ca >= RS + 2) {
      if (gy < 0) return gy === -1 ? (ab < 3 && (Math.floor(ca) & 3) !== 0 ? M.RDARK : M.FLAG) : M.RSTONE;
      if (inG) return M.WATER;
      if (ab < P.GW + T && gy < vt + T) return ab >= P.GW && ab < P.GW + 1 && gy > 2 && gy < 16 && (Math.floor(ca) % 14 === 7) ? (L.zone === 4 ? M.RUNE_R : M.RUNE) : M.RSTONE;
    }
  }
  // 3. the shaft
  if (d < RS + T && y < 0 && y >= -DD - 3) {
    if (y < -DD) return d < 4 && y === -DD - 1 ? M.BRONZE : M.RSTONE; // floor with the drain grate
    if (d >= RS) {
      // the lining, rune niches lighting the stair down
      if (d < RS + 1) {
        const st = runeNiche(P, ca, cb, y);
        if (st) return st === 2 ? (L.zone === 4 ? M.RUNE_R : M.RUNE) : M.RDARK;
        if ((((y % 32) + 32) % 32) < 2) return M.RDARK;
      }
      if (cur === 0 && y > -DD + WL + 4) return -1;
      return h3(vx >> 3, vy >> 3, vz >> 3, L.seed + 7) < 0.08 ? M.CRACKED : M.RSTONE;
    }
    const st = stairAt(P, ca, cb, y, d);
    if (st) {
      const top = y === -1 || stairAt(P, ca, cb, y + 1, d) === false;
      return top && d < RS - SW + 1.5 ? M.RDARK : st === 2 && top ? M.FLAG : M.RSTONE;
    }
    if (y < -DD + WL) return M.WATER;
    // roots (or ice, crystal) hanging down the shaft from the rim
    const sm = strandMat(L.zone);
    if (sm && d > RS - 3) { const len = strandLen(L, a, b, 0.05) * 3; if (len && y >= -len) return sm; }
    return 0;
  }
  // 4. the entrance corridor
  if (ca < 0 && ab < 13 && d >= R + T - 0.5) return corridor(L, a, y, b, ca, cb, ab, cur, vx, vy, vz);
  // 5. the room above
  const yc = Hs + (H - Hs) * Math.sqrt(Math.max(0, 1 - (Math.min(d, R) / R) ** 2));
  if (d < R) {
    if (y < -3) return -1;
    if (y < 0) return y === -1 ? floor(L, P, ca, cb, d, vx, vy, vz) : M.RSTONE;
    if (y < yc) return inside(L, P, a, y, b, ca, cb, d, yc, vx, vy, vz);
    if (y < yc + T) return M.RSTONE;
    return -1;
  }
  if (d < R + T) {
    if (y < -3) return -1;
    if (y < 0) return M.RSTONE;
    if (y >= Hs + T) return -1;
    if (ca < 0 && ab < 9 && (y < 24 || (y - 24) ** 2 + cb * cb < 81)) return 0;
    if (cur === 0) return -1;
    return M.RSTONE;
  }
  return -1;
}

/** Glowing rune niches on the shaft wall, every few steps down (1: frame, 2: the rune). */
function runeNiche(P, ca, cb, y) {
  const th = Math.atan2(cb, ca);
  let phi = (P.th0 - th) % (Math.PI * 2);
  if (phi < 0) phi += Math.PI * 2;
  for (let n = 0; n < 6; n++) {
    const ph = phi + n * Math.PI * 2, k = Math.round(ph / P.dth);
    if (k % 5 !== 2 || k > P.kL) continue;
    const off = (ph - k * P.dth) * P.RS, yy = y - (-RISE * k + 12);
    if (Math.abs(off) < 2.5 && yy >= -1 && yy < 4) return Math.abs(off) < 1.5 && yy >= 0 && yy < 3 ? 2 : 1;
  }
  return 0;
}

function floor(L, P, ca, cb, d, vx, vy, vz) {
  const RS = P.RS;
  if (h3(vx, vy, vz, L.seed + 12) < 0.02) return M.GRAVEL;
  if (d < RS + 4) return M.RDARK;
  if (d < RS + 5) return M.MOS_G;
  if (d < RS + 14) {
    // waves running round the well
    const th = Math.atan2(cb, ca);
    const w = Math.sin(th * Math.round(RS * 0.5) + (d - RS) * 0.9);
    return w > 0.35 ? M.MOS_B : w > -0.2 ? M.MOS_T : M.MOS_W;
  }
  if (d < RS + 15) return M.MOS_G;
  if (d < RS + 16) return M.MOS_K;
  return M.FLAG;
}

function inside(L, P, a, y, b, ca, cb, d, yc, vx, vy, vz) {
  const R = L.R, { RS, Hs } = P;
  // the parapet round the shaft (open where the stair starts)
  if (d >= RS && d < RS + 4 && y < 9) {
    const th = Math.atan2(cb, ca);
    let dt = th - P.th0; dt -= Math.round(dt / (Math.PI * 2)) * Math.PI * 2;
    const g = dt * RS;
    if (g > -17 && g < 1) return 0; // the way onto the first tread
    if (g > -19 && g < 3) return y < 12 ? M.RDARK : 0;
    return y === 8 ? M.RDARK : y < 2 ? M.RDARK : M.RSTONE;
  }
  // the winch: two posts on the parapet and a beam across
  for (const s of [-1, 1]) if (Math.abs(ca) < 2 && Math.abs(cb - s * (RS + 2)) < 2 && y < 44) return M.TIMBER;
  if (y >= 41 && y < 44 && Math.abs(ca) < 1.5 && ab(cb) < RS + 4) return M.TIMBER;
  // walls: plinth, pilasters, a band of wave runes
  const n = Math.floor(R - d);
  if (n <= 1) {
    const th = Math.atan2(cb, ca), arc = th * R;
    for (let k = 0; k < 8; k++) {
      const tk = -Math.PI + Math.PI / 8 + (k * Math.PI) / 4;
      let dt = th - tk; dt -= Math.round(dt / (Math.PI * 2)) * Math.PI * 2;
      if (Math.abs(dt * R) < 4 && y < Hs) return y >= Hs - 4 || y < 3 ? M.RDARK : M.RSTONE;
    }
    if (n === 0 && y < 3) return M.RDARK;
    if (n === 0 && y >= Hs - 11 && y < Hs - 2) {
      const ry = y - (Hs - 10);
      if (ry < 0 || ry > 7) return M.RDARK;
      const cell = Math.floor(arc / 9), gx = Math.floor(arc) - cell * 9;
      const g = cell % 2 ? G.wave : G.drop;
      if (gx < 7 && glyphPix(g, gx, ry)) return h3(cell, 5, 2, L.seed + 21) < 0.25 ? M.RUNEOFF : L.zone === 4 ? M.RUNE_R : M.RUNE;
      return M.RDARK;
    }
  }
  const sm = strandMat(L.zone);
  if (sm) { const len = strandLen(L, a, b, 0.01); if (len && y >= yc - len) return sm; }
  // broken pots by the wall
  if (d > R - 6 && y < 5 && h3(vx >> 2, 0, vz >> 2, L.seed + 33) < 0.06) return h3(vx, vy, vz, L.seed + 34) < 0.5 ? M.MOS_R : M.RUBBLE;
  return 0;
}
const ab = (v) => Math.abs(v);

function doorWall(L, P, a, y, b, ca, cb, abv, cur) {
  const { gal, DD, DW, DH } = P;
  const gy = y + DD;
  const inDoor = abv < DW && gy >= 0 && (gy < DH || (gy - DH) ** 2 + cb * cb < DW * DW);
  if (ca >= gal.a1) {
    if (gy < 0) return M.RSTONE;
    if (inDoor) return a === gal.a1 || a === P.room.a0 - 1 ? M.WARD : M.BEDROCK;
    if (a === gal.a1) return gy < 3 ? M.RDARK : M.RSTONE;
    if (abv < P.room.b1 + 1 && gy < 37) return a === P.room.a0 - 1 ? -2 : M.BEDROCK;
    return cur === 0 ? -1 : M.RSTONE;
  }
  // the frame in the gallery (under water)
  if (gy < 0) return null;
  const rr = hyp(gy - DH, cb);
  const jamb = abv >= DW && abv < DW + 3 && gy < DH;
  const arch = gy >= DH && rr >= DW && rr < DW + 3;
  if ((jamb || arch) && abv < P.GW) {
    for (const r of P.doorRunes) if (a === r.a && y >= r.y0 && y < r.y1 && b >= r.b0 && b < r.b1) return M.RUNEOFF;
    return M.RDARK;
  }
  return null;
}

function corridor(L, a, y, b, ca, cb, abv, cur, vx, vy, vz) {
  const R = L.R, end = -R - 36;
  if (ca < end || y < -3 || y >= 38) return -1;
  if (y < 0) return y === -1 ? M.FLAG : M.RSTONE;
  const inner = abv < 9 && (y < 24 || (y - 24) ** 2 + cb * cb < 81);
  if (inner) {
    const t = (ca - end) / 36, pile = (1 - t) * 38 - 10 + h3(vx >> 1, 0, vz >> 1, L.seed + 2) * 6;
    if (y < pile) return h3(vx >> 2, vy >> 2, vz >> 2, L.seed + 4) < 0.3 ? M.RSTONE : M.RUBBLE;
    return 0;
  }
  if (cur === 0) return -1;
  if (y < 24 || (y - 24) ** 2 + cb * cb < 144) return M.RSTONE;
  return -1;
}

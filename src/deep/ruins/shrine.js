// The shrine: a round domed chamber with the old ones' idol on a stepped dais (a seated
// star-nosed figure in pale marble, a gilded crown and star, an offering bowl in its paws, eyes
// that wake when the shrine is satisfied), offering bowls round it, a ring of glowing runes
// running round the wall, a sunburst mosaic floor, roots growing in through the oculus, a toppled
// guardian lying broken by the wall. The sealed door is in the flat bay behind the idol.
//
// Puzzles: 'dials' (three linked symbol drums on an altar under a mosaic mural: turn them until
// they show the mural's signs) or 'beams' (a sun crystal in the wall shines across the room; turn
// three crystal mirrors to bring the light round to the socket in front of the idol).
// Pure: runs in the chunk workers too.
import { M } from '../materials.js';
import { h3, G, rng, pickSymbols, boxDist, treasureVox, strandMat, strandLen, glyphPix, SYMBOLS, hyp } from './common.js';

const T = 3;

export function shrineLayout(L) {
  const { R, H } = L;
  const r = rng(L.seed + 202);
  const Hs = Math.round(H * 0.62);
  const DR = Math.round(R * 0.3);
  const FW = R - 4; // the flat bay with the door, behind the idol (+a)
  const DW = 8, DH = 24;
  const room = { a0: FW + T + 1, a1: FW + T + 1 + 40, y0: 0, y1: 36, b0: -24, b1: 24 };
  const hoards = [{ a: room.a1 - 9, b: -12, r: 8, h: 7 }, { a: room.a1 - 8, b: 12, r: 8, h: 6 }, { a: room.a0 + 8, b: -15, r: 5, h: 3 }];
  const bowls = [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4].map((t) => ({ a: Math.cos(t) * (DR + 9), b: Math.sin(t) * (DR + 9) }));
  // a toppled guardian against the wall, away from the door, the entrance and the puzzle
  const fallA = (L.puzzle === 'dials' ? -1 : 1) * (Math.PI * 0.62 + r() * 0.12);
  const doorRunes = [];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) doorRunes.push({ a: FW - 2, y0: 4 + i * 7, y1: 7 + i * 7, b0: s < 0 ? -DW - 3 : DW + 1, b1: s < 0 ? -DW - 1 : DW + 3 });
  const P = {
    Hs, DR, FW, DW, DH, room, hoards, bowls, fallA, doorRunes,
    door: { a0: FW, a1: FW + T + 1, y0: 0, y1: DH + DW, b0: -DW, b1: DW },
    chest: { a: room.a1 - 12, y: 0, b: 0, face: [-1, 0] },
    entry: { a: -R - 36, b: 0, dir: [-1, 0] },
    braziers: [{ a: FW - 8, b: -(DW + 9) }, { a: FW - 8, b: DW + 9 }],
    eyes: [33, 34].flatMap((y) => [-4, -3, 2, 3].map((b) => ({ a: -6, y, b }))),
    bb: [-R - 40, room.a1 + 6, -5, H + 12, -R - T - 4, R + T + 4],
  };
  if (L.puzzle === 'dials') {
    const target = pickSymbols(r, 3);
    P.target = target;
    // the drums turn in steps of one symbol; each also turns its left neighbour
    const start = target.map((g) => SYMBOLS.indexOf(g));
    for (let i = 0; i < 3; i++) start[i] = (start[i] + 1 + Math.floor(r() * 5)) % 6;
    // drums on the altar under the mural, in the same order as its signs (left to right facing it)
    P.dials = [16, 0, -16].map((a, i) => ({ a: a + 0.5, b: R - 7, y: 8, face: [0, -1], start: start[i], link: i > 0 ? i - 1 : -1, glyphs: SYMBOLS }));
    P.mural = { b: R - 3, w: 52, y0: 17, y1: 37 };
    P.altar = { a0: -24, a1: 24, b0: R - 11, y1: 8 };
  } else {
    const k = Math.round(R * 0.5), wb = Math.sqrt(R * R - k * k);
    P.beam = {
      y: 12,
      src: { a: k, b: -(wb - 1), dir: [0, 1] },
      mirrors: [{ a: k, b: -k }, { a: -k, b: -k }, { a: -k, b: 0 }],
      recv: { a: -(DR + 7), b: 0 },
    };
    // the right turns, and a wrong start for each
    const path = [[0, 1], [-1, 0], [0, 1], [1, 0]];
    P.beam.mirrors.forEach((m, i) => {
      m.sol = mirrorFor(path[i], path[i + 1]);
      m.start = (m.sol + 1 + Math.floor(r() * 3)) % 4;
    });
  }
  return P;
}

/** Mirror orientation k whose normal is the diagonal (cos, sin)(π/4 + kπ/2) that turns d_in into d_out. */
export function mirrorFor(din, dout) {
  // the normal points against the incoming beam and along the outgoing one
  const na = dout[0] - din[0], nb = dout[1] - din[1];
  const ang = Math.atan2(nb, na);
  return ((Math.round((ang - Math.PI / 4) / (Math.PI / 2)) % 4) + 4) % 4;
}

export function shrineVox(L, a, y, b, cur, vx, vy, vz) {
  const P = L.P, R = L.R, H = L.H, { Hs, FW, DW, DH } = P;
  const ca = a + 0.5, cb = b + 0.5, ab = Math.abs(cb);
  const d = hyp(ca, cb);
  if (y < -5) return -1;
  // 1. the flat door bay: the sealed door, its frame
  if (ca > FW - 2 && ca < FW + T + 1 && ab < 18) {
    const m = doorBay(L, P, a, y, b, ca, cb, ab, cur);
    if (m !== null && m !== -2) return m;
  }
  // 2. the treasure room
  const rd = boxDist(P.room, a, y, b);
  if (rd <= 4 && a >= FW + T) {
    const m = treasureVox(L, P.room, a, y, b, rd, vx, vy, vz);
    if (m >= 0) return m;
  }
  // 3. the entrance corridor
  if (ca < 0 && ab < 13 && d >= R + T - 0.5) return corridor(L, a, y, b, ca, cb, ab, cur, vx, vy, vz);
  // the door bay and the mural wall are flat
  let dd = d;
  if (ab < 18 && ca > 0) dd = Math.max(dd, ca + (R - FW));
  if (P.mural && cb > 0 && Math.abs(ca) < P.mural.w / 2 + 3) dd = Math.max(dd, cb + 3);
  const yc = Hs + (H - Hs) * Math.sqrt(Math.max(0, 1 - (Math.min(d, R) / R) ** 2));
  if (dd < R) {
    if (y < -3) return -1;
    if (y < -1) return M.RSTONE;
    if (y === -1) return floor(L, P, ca, cb, d, vx, vy, vz);
    if (y < yc) return inside(L, P, a, y, b, ca, cb, d, dd, yc, vx, vy, vz);
    // the oculus, choked with roots (or crystal, or ice)
    if (d < 6) return y < yc + 6 ? (strandMat(L.zone) || M.RSTONE) : -1;
    if (y < yc + T) return M.RSTONE;
    return -1;
  }
  // 4. the wall ring
  if (dd < R + T) {
    if (y < -3) return -1;
    if (y < 0) return M.RSTONE;
    if (y >= Hs + T) return -1;
    if (ca < 0 && ab < 9 && (y < 24 || (y - 24) ** 2 + cb * cb < 81)) return 0; // the entrance
    if (cur === 0) return -1;
    return h3(vx >> 3, vy >> 3, vz >> 3, L.seed + 7) < 0.08 ? M.CRACKED : M.RSTONE;
  }
  return -1;
}

function floor(L, P, ca, cb, d, vx, vy, vz) {
  const R = L.R, DR = P.DR;
  const hb = h3(vx, vy, vz, L.seed + 12);
  if (hb < 0.02) return M.GRAVEL;
  if (d < DR + 1) return M.RDARK;
  if (d < DR + 3) return M.MOS_G;
  if (d < DR + 4) return M.MOS_K;
  const r1 = R * 0.76;
  if (d < r1) {
    const th = Math.atan2(cb, ca) + Math.PI;
    const w = th / (Math.PI * 2) * 24, fw = w - Math.floor(w);
    if (fw < 0.06 && d > DR + 7) return M.MOS_G;
    // rays narrowing outward: red on cream
    const ray = Math.abs(fw - 0.5) < 0.3 * (1 - (d - DR) / (r1 - DR) * 0.6);
    return Math.floor(w) % 2 ? (ray ? M.MOS_R : M.MOS_W) : ray ? M.MOS_B : M.MOS_W;
  }
  if (d < r1 + 2) return M.MOS_B;
  if (d < r1 + 3) return M.MOS_G;
  return M.FLAG;
}

function inside(L, P, a, y, b, ca, cb, d, dd, yc, vx, vy, vz) {
  const R = L.R, { Hs, DR } = P, s = L.seed;
  // the dais: two steps, gilded edges
  if (d < DR && y < 3) return d > DR - 1.5 && y === 2 ? M.GILT : M.RDARK;
  if (d < DR - 5 && y < 6) return d > DR - 6.5 && y === 5 ? M.GILT : M.RDARK;
  // the idol
  if (d < DR - 5 && y < 46) { const m = idol(L, P, ca, y - 6, cb); if (m >= 0) return m; }
  // offering bowls on little plinths
  for (const bw of P.bowls) {
    const od = hyp(ca - bw.a, cb - bw.b);
    if (od > 5) continue;
    if (y < 7 && Math.max(Math.abs(ca - bw.a), Math.abs(cb - bw.b)) < 3) return y === 6 ? M.RDARK : M.RSTONE;
    if (y === 7 && od < 4) return M.BRONZE;
    if (y === 8 && od < 4.4) return od > 3 ? M.BRONZE : M.HOARD;
    if (y === 9 && od < 4.6 && od > 3.4) return M.BRONZE;
  }
  // the dials' altar under the mural
  if (P.altar) {
    const A = P.altar;
    if (ca >= A.a0 && ca < A.a1 && cb >= A.b0 && y < A.y1) return y === A.y1 - 1 || ca < A.a0 + 1 || ca >= A.a1 - 1 ? M.RDARK : M.RSTONE;
  }
  // the sun crystal in the wall (beams)
  if (P.beam) {
    const S = P.beam.src;
    const ds = hyp(ca - S.a, cb - S.b, y - P.beam.y);
    if (ds < 4 && dd > R - 3) return ds < 2.4 ? M.CRYSTAL : M.GILT;
    for (const m of P.beam.mirrors) if (Math.max(Math.abs(ca - m.a), Math.abs(cb - m.b)) < 3 && y < 4) return y === 3 ? M.RDARK : M.RSTONE; // pedestal feet
    const rc = P.beam.recv;
    if (Math.max(Math.abs(ca - rc.a), Math.abs(cb - rc.b)) < 3 && y < 4) return y === 3 ? M.GILT : M.RDARK;
  }
  // the toppled guardian
  { const m = fallen(L, P, ca, y, cb, vx, vy, vz); if (m >= 0) return m; }
  // the wall's skin: pilasters, plinth, the rune ring, the mural
  const n = Math.floor(R - dd); // 0 against the wall
  if (n <= 2) {
    const th = Math.atan2(cb, ca);
    const arc = th * R;
    // eight pilasters (skipping the door bay and the entrance)
    for (let k = 0; k < 8; k++) {
      const tk = -Math.PI + Math.PI / 8 + (k * Math.PI) / 4;
      let dth = th - tk; dth -= Math.round(dth / (Math.PI * 2)) * Math.PI * 2;
      if (Math.abs(dth * R) < 4.5 && y < Hs) {
        if (n <= 2 && y >= Hs - 4) return M.RDARK;
        if (n <= 1) return y < 3 ? M.RDARK : M.RSTONE;
      }
    }
    if (n === 0 && y < 3) return M.RDARK;
    if (P.mural && cb > 0 && Math.abs(ca) < P.mural.w / 2 + 3 && n === 0) { const m = mural(L, P, ca, y); if (m >= 0) return m; }
    // the rune ring
    if (n === 0 && y >= Hs - 11 && y < Hs - 2) {
      const ry = y - (Hs - 10);
      if (ry < 0 || ry > 7) return M.RDARK;
      const cell = Math.floor(arc / 9), gx = Math.floor(arc) - cell * 9;
      if (gx < 7) {
        const g = SYMBOLS[(cell * 7 + (s % 5) + 60) % SYMBOLS.length] ?? G.sun;
        if (glyphPix(g, gx, ry)) return h3(cell, 3, 1, s + 21) < 0.22 ? M.RUNEOFF : L.zone === 4 ? M.RUNE_R : M.RUNE;
      }
      return M.RDARK;
    }
  }
  const sm = strandMat(L.zone);
  if (sm) {
    const len = strandLen(L, a, b, d < 9 ? 0.05 : 0.006);
    if (len && y >= yc - (sm === M.CRYSTAL ? Math.min(len, 6) : len)) return sm;
  }
  return 0;
}

/** The mural over the altar: three big gold symbols on lapis, framed. */
function mural(L, P, ca, y) {
  const Mu = P.mural;
  if (y < Mu.y0 || y >= Mu.y1) return -1;
  const half = Mu.w / 2;
  if (Math.abs(ca) >= half + 1) return -1;
  const ly = y - Mu.y0;
  if (Math.abs(ca) >= half || ly === 0 || ly === Mu.y1 - Mu.y0 - 1) return M.GILT;
  if (Math.abs(ca) >= half - 1 || ly === 1 || ly === Mu.y1 - Mu.y0 - 2) return M.MOS_K;
  // facing the wall (+b) the right is -a: read left to right
  const xx = Math.floor(half - 2 - ca); // 0.. across
  const k = Math.floor(xx / 16), gx = xx - k * 16 - 1, gy = ly - 3;
  if (k >= 0 && k < 3 && gx >= 0 && gx < 14 && gy >= 0 && gy < 14) {
    const g = P.target[k];
    const on = glyphPix(g, Math.floor(gx / 2), Math.floor(gy / 2));
    if (on) return M.MOS_G;
  }
  // stars scattered in the lapis sky
  if (h3(Math.floor(ca), y, 4, L.seed + 30) < 0.012) return M.MOS_W;
  return ly < 4 ? M.MOS_T : M.MOS_B;
}

/** The idol, in its own frame (u forward toward the entrance, h above the dais top, v sideways). */
function idol(L, P, ca, h, cb) {
  if (h < 0) return -1;
  const u = -ca, v = cb, av = Math.abs(v);
  // lotus cushion
  if (h < 3) { const e = (u / 11) ** 2 + (v / 10) ** 2; if (e < 1) return h === 2 && e > 0.7 ? M.GILT : M.MOS_R; return -1; }
  // crossed legs
  if (((u - 1) / 7) ** 2 + ((h - 5) / 3.2) ** 2 + (v / 10) ** 2 < 1) return M.MARBLE;
  // paws and the offering bowl
  const bow = hyp(u - 8, v);
  if (h >= 10 && h < 13 && bow < 4.2) return h === 10 || bow > 3 ? M.BRONZE : M.HOARD;
  // arms: shoulders to paws
  for (const sg of [-1, 1]) {
    const ax = -1, ay = 17, az = 7 * sg, bx = 6, by = 11, bz = 3.5 * sg;
    const px = u - ax, py = h - ay, pz = v - az, qx = bx - ax, qy = by - ay, qz = bz - az;
    const t = Math.max(0, Math.min(1, (px * qx + py * qy + pz * qz) / (qx * qx + qy * qy + qz * qz)));
    const ex = px - qx * t, ey = py - qy * t, ez = pz - qz * t;
    if (ex * ex + ey * ey + ez * ez < (2.4 - t * 0.5) ** 2) return t > 0.92 ? M.GILT : M.MARBLE;
  }
  // the robe, with a gilded collar
  if (((u + 1) / 6) ** 2 + ((h - 12) / 9) ** 2 + (v / 8) ** 2 < 1) return h >= 17 && h < 19 ? M.GILT : M.MARBLE;
  // the head, eyes (they wake when the shrine is satisfied), the snout, the star nose, the crown
  const hd = hyp(u / 6, (h - 25) / 6, v / 6.5) * 6;
  if (h >= 30 && h < 32 && hd < 7 && hd > 4.5) return M.GILT; // crown band
  if (h >= 32 && h < 36 && hd < 7.5 && hd > 5 && (Math.round(Math.atan2(v, u) / (Math.PI / 3)) * (Math.PI / 3) - Math.atan2(v, u)) ** 2 < 0.03 && h < 36 - Math.abs(Math.atan2(v, u)) * 0.6) return M.GILT;
  if (u >= 4.8 && u < 6.5 && h >= 27 && h < 29 && av >= 2 && av < 4) return M.RUNEOFF;
  if (hd < 6) return M.MARBLE;
  if (u >= 4 && u < 9 && hyp(h - 23.5, v) < 2.7 - (u - 4) * 0.18) return M.MARBLE;
  // the star: eleven fleshy-gold rays round the nose tip
  if (u >= 8.5 && u < 10.5) {
    const rr = hyp(h - 23.5, v);
    if (rr < 1.6) return M.MOS_R;
    if (rr < 5.4) {
      const an = Math.atan2(h - 23.5, v), k = Math.round(an / (Math.PI * 2 / 11));
      if (Math.abs(an - k * (Math.PI * 2 / 11)) * rr < 0.85) return M.GILT;
    }
  }
  return -1;
}

/** A toppled guardian: an empty plinth, the body lying on the floor, its head rolled off. */
function fallen(L, P, ca, y, cb, vx, vy, vz) {
  const R = L.R, t = P.fallA;
  const ox = Math.cos(t), oz = Math.sin(t); // outward
  const tx = -oz, tz = ox;
  const pa = ox * (R - 9), pb = oz * (R - 9);
  const u = (ca - pa) * -ox + (cb - pb) * -oz; // inward from the plinth
  const w = (ca - pa) * tx + (cb - pb) * tz;
  if (u < -6 || u > 40 || Math.abs(w) > 12 || y > 12) return -1;
  // plinth with broken feet
  if (Math.abs(u) < 5 && Math.abs(w) < 5) {
    if (y < 7) return y === 6 ? M.RDARK : M.RSTONE;
    if (y < 10 && Math.abs(w) > 1 && Math.abs(w) < 4 && Math.abs(u) < 3 && h3(vx, vy, vz, L.seed + 40) < 0.7) return M.MARBLE;
    return -1;
  }
  // the body: a robed figure lying on its side
  const bu = u - 20, bw = w - 1.5;
  if ((bu / 13) ** 2 + (bw / 5) ** 2 + ((y - 4) / 4.4) ** 2 < 1) return h3(vx >> 1, vy >> 1, vz >> 1, L.seed + 41) < 0.08 ? M.CRACKED : M.MARBLE;
  // its head, rolled off
  if (hyp(u - 37, w - 6, y - 3.4) < 4) return M.MARBLE;
  // chips of marble
  if (y === 0 && u > 4 && u < 40 && h3(vx, vy, vz, L.seed + 42) < 0.06) return M.MARBLE;
  return -1;
}

/** The flat bay behind the idol: the sealed door and its frame (null: not part of it). */
function doorBay(L, P, a, y, b, ca, cb, ab, cur) {
  const { FW, DW, DH } = P;
  if (y < -3) return null;
  const inDoor = ab < DW && y >= 0 && (y < DH || (y - DH) ** 2 + cb * cb < DW * DW);
  if (ca >= FW) {
    if (y < 0) return M.RSTONE;
    if (y >= P.Hs + 8) return null;
    if (inDoor) return a === FW || a === FW + T ? M.WARD : M.BEDROCK;
    if (a === FW) return y < 3 ? M.RDARK : M.RSTONE;
    if (ab < P.room.b1 + 1 && y < P.room.y1 + 1) return a === FW + T ? -2 : M.BEDROCK;
    return cur === 0 ? -1 : M.RSTONE;
  }
  if (y < 0) return null;
  const rr = hyp(y - DH, cb);
  const jamb = ab >= DW && ab < DW + 4 && y < DH;
  const arch = y >= DH && rr >= DW && rr < DW + 4;
  if (jamb || arch) {
    for (const r of P.doorRunes) if (a === r.a && y >= r.y0 && y < r.y1 && b >= r.b0 && b < r.b1) return M.RUNEOFF;
    if (arch && ab < 1.5 && rr > DW + 1) return M.GILT;
    return M.RDARK;
  }
  // a gilded eye over the door
  const ly = y - (DH + DW + 5);
  if (a === FW - 1 && ly >= 0 && ly < 14 && ab < 8) {
    const gx = Math.floor((cb + 7) / 2), gy = Math.floor(ly / 2);
    if (glyphPix(G.eye, gx, gy)) return M.GILT;
    return ly === 0 || ly === 13 || ab >= 7 ? M.RDARK : -1;
  }
  return null;
}

function corridor(L, a, y, b, ca, cb, ab, cur, vx, vy, vz) {
  const R = L.R, end = -R - 36;
  if (ca < end || y < -3 || y >= 38) return -1;
  if (y < 0) return y === -1 ? (h3(vx >> 2, 0, vz >> 2, L.seed) < 0.15 ? M.GRAVEL : M.FLAG) : M.RSTONE;
  const inner = ab < 9 && (y < 24 || (y - 24) ** 2 + cb * cb < 81);
  if (inner) {
    const t = (ca - end) / 36, pile = (1 - t) * 38 - 10 + h3(vx >> 1, 0, vz >> 1, L.seed + 2) * 6;
    if (y < pile) return h3(vx >> 2, vy >> 2, vz >> 2, L.seed + 4) < 0.3 ? M.RSTONE : M.RUBBLE;
    return 0;
  }
  if (cur === 0) return -1;
  if (y < 24 || (y - 24) ** 2 + cb * cb < 144) return M.RSTONE;
  return -1;
}

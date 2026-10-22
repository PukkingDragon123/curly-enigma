// The vault: a square antechamber under a coffered ceiling, two marble guardians with spears
// flanking a great round seal-door (concentric rings, a boss and bolts, eight rune studs in a
// gilded frame), and behind it the treasure room. One guardian has fallen and broken on the
// floor; a corner of the ceiling has come down. A frieze over the side walls shows how the door
// was opened.
//
// Puzzles: 'plates' (three pressure plates in the floor that must all be weighed down at once —
// stand on one, set a clump of ore or a stone block on the others) or 'levers' (as in the hall).
// Pure: runs in the chunk workers too.
import { M } from '../materials.js';
import { h3, G, rng, pickSymbols, boxDist, treasureVox, strandMat, strandLen, glyphPix, hyp } from './common.js';

const T = 4;

export function vaultLayout(L) {
  const { R, H } = L;
  const r = rng(L.seed + 303);
  const LA = Math.round(R * 0.8), LB = Math.round(R * 0.72);
  const HC = Math.max(46, Math.round(H * 0.86)); // flat ceiling (coffered)
  const DR = 18, DY = 21; // the round door: radius, centre height
  const room = { a0: LA + T + 6, a1: LA + T + 6 + 52, y0: 0, y1: 40, b0: -32, b1: 32 };
  const hoards = [{ a: room.a1 - 11, b: -18, r: 11, h: 9 }, { a: room.a1 - 10, b: 17, r: 10, h: 8 }, { a: room.a0 + 10, b: -22, r: 7, h: 5 }, { a: room.a0 + 12, b: 22, r: 6, h: 4 }];
  const fallSide = r() < 0.5 ? -1 : 1;
  const studs = [];
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2 + Math.PI / 8;
    studs.push({ y: Math.round(DY + Math.sin(t) * (DR + 2.5)), b: Math.round(Math.cos(t) * (DR + 2.5)) });
  }
  const P = {
    LA, LB, HC, DR, DY, room, hoards, fallSide, studs,
    statues: [-1, 1].map((s) => ({ a: LA - 9, b: s * (DR + 15), fallen: s === fallSide })),
    // the door is the disc through the wall plus the short passage behind it (all sealed)
    door: { a0: LA - 1, a1: LA + T + 6, y0: DY - DR - 1, y1: DY + DR + 1, b0: -DR - 1, b1: DR + 1 },
    doorRunes: studs.map((s) => ({ a: LA - 1, y0: s.y - 1, y1: s.y + 1, b0: s.b - 1, b1: s.b + 1 })),
    chest: { a: room.a1 - 15, y: 0, b: 0, face: [-1, 0] },
    entry: { a: -LA - 40, b: 0, dir: [-1, 0] },
    braziers: [{ a: LA - 10, b: -(DR + 6) }, { a: LA - 10, b: DR + 6 }],
    collapse: { a: -LA + 6, b: (r() < 0.5 ? -1 : 1) * (LB - 6), rad: 22 + r() * 6 },
    bb: [-LA - 44, room.a1 + 6, -5, HC + 14, -LB - T - 6, LB + T + 6],
  };
  if (L.puzzle === 'plates') {
    P.plates = [{ a: -Math.round(LA * 0.35), b: -Math.round(LB * 0.5) }, { a: -Math.round(LA * 0.35), b: Math.round(LB * 0.5) }, { a: Math.round(LA * 0.3), b: 0 }]
      .map((p) => ({ ...p, h: 6 })); // half size (voxels)
  } else {
    const syms = pickSymbols(r, 4);
    const ka = [-Math.round(LA * 0.45), Math.round(LA * 0.2)];
    const spots = [];
    for (const k of ka) for (const s of [-1, 1]) spots.push({ a: k, s });
    P.levers = spots.map((sp, i) => ({ side: sp.s, a: sp.a, b: sp.s * (LB + 2), y: 14, face: [0, -sp.s], glyph: syms[i] }));
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    P.order = order;
    P.lintel = order.map((i) => syms[i]);
  }
  return P;
}

export function vaultVox(L, a, y, b, cur, vx, vy, vz) {
  const P = L.P, { LA, LB, HC, DR, DY } = P;
  const ca = a + 0.5, cb = b + 0.5, ab = Math.abs(cb);
  if (y < -5) return -1;
  // 1. the round door, its passage and the treasure room
  const rDoor = hyp(y + 0.5 - DY, cb);
  if (ca > LA - 3 && ca < P.room.a0 && rDoor < DR + 8) {
    const m = doorWall(L, P, a, y, b, ca, cb, rDoor, cur);
    if (m !== null && m !== -2) return m;
  }
  const rd = boxDist(P.room, a, y, b);
  if (rd <= 4 && a >= LA) {
    const m = treasureVox(L, P.room, a, y, b, rd, vx, vy, vz);
    if (m >= 0) return m;
  }
  // 2. the entrance corridor
  if (ca < -LA - T + 0.5) return corridor(L, P, a, y, b, ca, cb, ab, cur, vx, vy, vz);
  const room = Math.abs(ca) < LA && ab < LB;
  const col = P.collapse, cd = hyp(ca - col.a, cb - col.b) / col.rad;
  if (room) {
    if (y < -3) return -1;
    if (y < -1) return M.RSTONE;
    if (y === -1) return floor(L, P, ca, cb, ab, cd, vx, vy, vz);
    if (y < HC) return inside(L, P, a, y, b, ca, cb, ab, cd, vx, vy, vz);
    // the coffered ceiling: deep square coffers between dark ribs, a gold rosette in each
    const ka = ((Math.floor(ca) % 16) + 16) % 16, kb = ((Math.floor(cb) % 16) + 16) % 16;
    const rib = ka < 3 || kb < 3;
    if (cd < 0.5) return y < HC + 9 ? 0 : -1; // the broken corner
    if (y === HC) return rib ? M.RDARK : 0;
    if (y === HC + 1) return rib ? M.RDARK : (Math.abs(ka - 9) < 1 && Math.abs(kb - 9) < 1 ? M.GILT : 0);
    if (y < HC + 5) return y === HC + 2 && !rib && Math.abs(ka - 9) <= 1 && Math.abs(kb - 9) <= 1 ? M.GILT : M.RSTONE;
    return -1;
  }
  // 3. walls
  const wa = Math.abs(ca) - LA, wb = ab - LB;
  if (wa < T && wb < T) {
    if (y < -3) return -1;
    if (y < 0) return M.RSTONE;
    if (y >= HC + 5) return -1;
    if (ca < 0 && wb < 0 && ab < 10 && (y < 24 || (y - 24) ** 2 + cb * cb < 100)) return 0; // entrance
    if (P.levers && wb >= 0) for (const lv of P.levers) {
      if (lv.side !== Math.sign(cb) || Math.abs(ca - lv.a) >= 6 || y < 6 || y >= 23) continue;
      return wb < 2 ? 0 : M.RDARK;
    }
    if (cur === 0) return -1;
    return h3(vx >> 3, vy >> 3, vz >> 3, L.seed + 7) < 0.08 ? M.CRACKED : M.RSTONE;
  }
  // the broken corner's rubble chimney
  if (cd < 0.5 && y >= HC && y < HC + 9 && Math.abs(ca) < LA + T && ab < LB + T) return 0;
  return -1;
}

function floor(L, P, ca, cb, ab, cd, vx, vy, vz) {
  const hb = h3(vx, vy, vz, L.seed + 12);
  if (P.plates) for (const p of P.plates) {
    const da = Math.abs(ca - p.a), db = Math.abs(cb - p.b);
    if (da < p.h && db < p.h) return 0; // the plate's pit (the slab is a model)
    if (da < p.h + 1 && db < p.h + 1) return M.RDARK; // its frame
    if (da < p.h + 2 && db < p.h + 2) return M.MOS_G;
  }
  if (cd < 0.8 && hb < 0.4 * (1 - cd)) return M.RUBBLE;
  if (hb < 0.02) return M.GRAVEL;
  // a checkerboard of dark and pale slabs with a gold-edged path to the door
  if (ab < 12 && ca > -P.LA + 4) return ab >= 10 ? M.MOS_G : (Math.floor(ca / 6) + Math.floor((cb + 12) / 6)) & 1 ? M.MOS_K : M.MOS_W;
  const ka = Math.floor((ca + 400) / 8), kb = Math.floor((cb + 400) / 8);
  return (ka + kb) & 1 ? M.RDARK : M.FLAG;
}

function inside(L, P, a, y, b, ca, cb, ab, cd, vx, vy, vz) {
  const { LA, LB, HC } = P, s = L.seed;
  // the collapsed corner
  if (cd < 1) {
    const top = (HC + 4) * Math.pow(1 - cd, 1.4) - 3 + (h3(vx >> 2, 0, vz >> 2, s + 13) - 0.5) * 6;
    if (y < top) return h3(vx >> 2, vy >> 2, vz >> 2, s + 14) < 0.2 ? M.RSTONE : M.RUBBLE;
  }
  // guardians
  for (const st of P.statues) { const m = statue(L, st, ca, y, cb, vx, vy, vz); if (m >= 0) return m; }
  // the plate pits are covered by the slabs (models); a pressed slab sinks into this gap
  // walls: plinth, pilasters, a frieze with the plates' story (or the levers' symbols), cornice
  const n = Math.min(Math.floor(LB - ab), Math.floor(LA - Math.abs(ca)));
  const onSide = Math.floor(LB - ab) <= Math.floor(LA - Math.abs(ca));
  if (n <= 1) {
    if (n === 0 && y < 4) return M.RDARK;
    if (n === 0 && y >= HC - 4) return M.RDARK;
    const along = onSide ? ca : cb;
    if (((Math.floor(along) % 24) + 24) % 24 < 4 && y < HC - 4) return n <= 1 ? M.RSTONE : 0; // pilasters
    if (onSide && n === 0 && y >= HC - 16 && y < HC - 6) {
      const fy = y - (HC - 16);
      if (fy === 0 || fy === 9) return M.RDARK;
      return friezeSide(L, P, ca, cb, fy - 1);
    }
  }
  const sm = strandMat(L.zone);
  if (sm && cd < 1.6) {
    const len = strandLen(L, a, b, 0.02);
    if (len && y >= HC - len) return sm;
  }
  if (y === 0 && cd < 1.4 && L.zone <= 3 && h3(vx >> 1, 0, vz >> 1, s + 15) < 0.4 * (1.4 - cd)) return M.MOSS;
  return 0;
}

/** The side friezes: what opens the door (weights on the plates, or the lever symbols). */
function friezeSide(L, P, ca, cb, gy) {
  if (gy < 0 || gy > 7) return M.FRIEZE;
  const dir = cb > 0 ? -1 : 1;
  const x = Math.floor(ca * dir + 40);
  const k = Math.floor(x / 9), gx = x - k * 9;
  let g;
  if (P.plates) g = k % 4 === 3 ? G.arrow : G.weight;
  else g = P.lintel[((k % 4) + 4) % 4];
  if (gx < 7 && gy < 7 && glyphPix(g, dir < 0 && g === G.arrow ? gx : gx, gy)) return M.GILT;
  return M.FRIEZE;
}

/** A marble guardian on a plinth, spear upright; or fallen, lying broken on the floor. */
function statue(L, st, ca, y, cb, vx, vy, vz) {
  const u = ca - st.a, v = cb - st.b;
  if (Math.abs(u) > 30 || Math.abs(v) > 14 || y > 44) return -1;
  const onPl = Math.abs(u) < 6 && Math.abs(v) < 6;
  if (onPl && y < 6) return y === 5 ? M.RDARK : M.RSTONE;
  if (!st.fallen) {
    const h = y - 6;
    if (h < 0) return -1;
    if (h < 22 && (u / 4.6) ** 2 + (v / 5.2) ** 2 < 1 - h / 70) return h === 0 || h === 21 ? M.GILT : M.MARBLE; // robe
    if (h >= 22 && h < 26 && Math.abs(u) < 3 && Math.abs(v) < 5.5) return M.MARBLE; // shoulders
    if (hyp(u, h - 29.5, v) < 4.4) return M.MARBLE; // head
    if (h >= 33 && h < 35 && hyp(u, v) < 3.5) return M.GILT; // helm crest
    if (u < -3 && u > -7 && Math.abs(v) < 1.2 && h >= 28 && h < 31) return M.MARBLE; // snout
    // the spear, in the outer paw
    const sv = -Math.sign(st.b) * 6.5;
    if (Math.abs(u + 2) < 0.8 && Math.abs(v - sv) < 0.8 && h < 36) return M.RDARK;
    if (Math.abs(u + 2) < 1.4 && Math.abs(v - sv) < 1.4 && h >= 36 && h < 38 + (Math.abs(u + 2) < 0.8 && Math.abs(v - sv) < 0.8 ? 3 : 0)) return M.BRONZE;
    return -1;
  }
  // fallen toward the middle of the room: feet stumps on the plinth, the body along the floor
  if (onPl && y < 9 && Math.abs(v) < 4 && Math.abs(u) < 3 && h3(vx, vy, vz, L.seed + 50) < 0.65) return M.MARBLE;
  const w = v * -Math.sign(st.b); // toward the middle
  if (w > 6 && ((w - 17) / 11) ** 2 + (u / 5) ** 2 + ((y - 4.5) / 4.6) ** 2 < 1) return h3(vx >> 1, vy >> 1, vz >> 1, L.seed + 51) < 0.08 ? M.CRACKED : M.MARBLE;
  if (hyp(w - 27, u + 7, y - 3.6) < 4.2) return M.MARBLE;
  if (Math.abs(w - 16) < 14 && Math.abs(u + 7) < 0.8 && y === 0) return M.RDARK; // the spear shaft
  if (y === 0 && w > 4 && w < 36 && Math.abs(u) < 10 && h3(vx, vy, vz, L.seed + 52) < 0.05) return M.MARBLE;
  return -1;
}

/** The round door: the disc (sealed), its frame on the wall, the passage behind (sealed too). */
function doorWall(L, P, a, y, b, ca, cb, rr, cur) {
  const { LA, DR, DY } = P;
  if (y < -3) return null;
  // the disc and the short passage behind it are seal-stone with bedrock between
  if (ca >= LA - 1 && ca < P.room.a0 && rr < DR + 1) {
    if (ca < LA) {
      // the face of the disc stands proud: rings, bolts and a boss
      const ring = Math.abs(rr - 7) < 1 || Math.abs(rr - 13.5) < 1;
      const th = Math.atan2(y + 0.5 - DY, cb), spoke = Math.abs(((th / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.42;
      if (rr < 3.5 || ring || (spoke && rr > 7 && rr < 13.5)) return M.WARD;
      return null;
    }
    if (a === LA || a === P.room.a0 - 1) return M.WARD;
    return M.BEDROCK;
  }
  if (ca >= LA) {
    if (y < 0) return M.RSTONE;
    const behindRoom = ab(cb) < P.room.b1 + 1 && y < P.room.y1 + 1;
    if (a === LA) return y < 4 ? M.RDARK : M.RSTONE;
    if (behindRoom || rr < DR + 6) return a === P.room.a0 - 1 ? -2 : M.BEDROCK;
    return cur === 0 ? -1 : M.RSTONE;
  }
  // the frame on the wall face: gilded ring, rune studs, a dark outer ring
  if (ca >= LA - 2 && y >= 0) {
    if (rr >= DR + 1 && rr < DR + 4) {
      for (const r of P.doorRunes) if (a === r.a && y >= r.y0 && y < r.y1 && b >= r.b0 && b < r.b1) return M.RUNEOFF;
      return a === LA - 1 ? M.GILT : null;
    }
    if (rr >= DR + 4 && rr < DR + 6 && a === LA - 1) return M.RDARK;
  }
  return null;
}
const ab = (v) => Math.abs(v);

function corridor(L, P, a, y, b, ca, cb, abv, cur, vx, vy, vz) {
  const LA = P.LA, end = -LA - 40;
  if (ca < end || abv >= 13 || y < -3 || y >= 38) return -1;
  if (y < 0) return y === -1 ? M.FLAG : M.RSTONE;
  const inner = abv < 10 && (y < 24 || (y - 24) ** 2 + cb * cb < 100);
  if (inner) {
    const t = (ca - end) / 40, pile = (1 - t) * 40 - 9 + h3(vx >> 1, 0, vz >> 1, L.seed + 2) * 6;
    if (y < pile) return h3(vx >> 2, vy >> 2, vz >> 2, L.seed + 4) < 0.3 ? M.RSTONE : M.RUBBLE;
    return 0;
  }
  if (cur === 0) return -1;
  if (y < 24 || (y - 24) ** 2 + cb * cb < 169) return M.RSTONE;
  return -1;
}

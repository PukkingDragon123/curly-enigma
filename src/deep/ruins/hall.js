// The pillared hall: a long barrel-vaulted nave of fitted stone on two rows of fluted pillars,
// a gilded frieze of the old ones' symbols running along the walls above a dark plinth, a mosaic
// carpet down the nave, and at the far end a sealed door under a lintel of carved signs, with the
// treasure room behind it. Part of the roof has come down: a rubble slope under a broken chimney,
// snapped pillars with their drums lying in the dust, roots hanging through the cracks. The front
// opens on a short arched corridor the rock has mostly swallowed.
//
// Puzzles: 'levers' (four levers in wall niches under their symbols, pulled in the order the lintel
// shows) or 'switch' (a cracked wall panel hides a niche with a pull switch; the lintel shows a
// hammer and an arrow toward it). Pure: runs in the chunk workers too.
import { M } from '../materials.js';
import { h3, G, rng, pickSymbols, boxDist, treasureVox, strandMat, strandLen, glyphPix, hyp } from './common.js';

const T = 4; // wall thickness

export function hallLayout(L) {
  const { R, H } = L;
  const r = rng(L.seed + 101);
  const LA = R, LB = Math.max(40, Math.round(R * 0.62));
  const Hs = Math.round(H * 0.62);
  const PB = Math.round(LB * 0.55);
  const NP = Math.max(3, Math.min(6, Math.round((2 * LA - 32) / 26)));
  const SP = (2 * LA - 32) / (NP - 1);
  const pillars = [];
  for (let k = 0; k < NP; k++) pillars.push(Math.round(-LA + 16 + k * SP));
  const bays = [];
  for (let k = 0; k + 1 < NP; k++) bays.push(Math.round((pillars[k] + pillars[k + 1]) / 2));
  const collapse = { a: Math.round(-LA * 0.2 + r() * LA * 0.25), b: (r() < 0.5 ? -1 : 1) * (PB + 6), rad: LB * 0.8 + r() * 8 };
  const broken = pillars.map((pa, k) => [-1, 1].map((s) => {
    const inCol = hyp(pa - collapse.a, s * PB - collapse.b) < collapse.rad * 0.8;
    return inCol || h3(k, s + 3, 5, L.seed) < 0.25 ? 10 + Math.floor(h3(k, s + 3, 6, L.seed) * (Hs - 24)) : 0;
  }));
  const DW = 8, DH = 26;
  const room = { a0: LA + T, a1: LA + T + 44, y0: 0, y1: 38, b0: -26, b1: 26 };
  const hoards = [{ a: room.a1 - 9, b: -15, r: 9, h: 7 }, { a: room.a1 - 7, b: 13, r: 8, h: 6 }, { a: room.a0 + 9, b: 18, r: 6, h: 4 }];
  // runes up the door jambs (2 wide, 3 tall, on the jambs' front faces)
  const doorRunes = [];
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) doorRunes.push({ a: LA - 2, y0: 4 + i * 6, y1: 7 + i * 6, b0: s < 0 ? -DW - 3 : DW + 1, b1: s < 0 ? -DW - 1 : DW + 3 });
  const P = {
    LA, LB, Hs, PB, NP, pillars, bays, broken, collapse, DW, DH, room, hoards, doorRunes,
    door: { a0: LA, a1: LA + T, y0: 0, y1: DH + DW, b0: -DW, b1: DW },
    chest: { a: room.a1 - 13, y: 0, b: 0, face: [-1, 0] },
    entry: { a: -LA - 44, b: 0, dir: [-1, 0] },
    braziers: [{ a: LA - 9, b: -(DW + 10) }, { a: LA - 9, b: DW + 10 }],
    bb: [-LA - 48, room.a1 + 6, -5, H + 18, -LB - T - 7, LB + T + 7],
  };
  const nb = bays.length;
  if (L.puzzle === 'levers') {
    const syms = pickSymbols(r, 4);
    const spots = [];
    for (let k = nb - 1; k >= 0 && spots.length < 4; k--) for (const s of [-1, 1]) if (spots.length < 4) spots.push({ s, k });
    P.levers = spots.map((sp, i) => ({ bay: sp.k, side: sp.s, a: bays[sp.k], b: sp.s * (LB + 2), y: 14, face: [0, -sp.s], glyph: syms[i] }));
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    P.order = order;
    P.lintel = order.map((i) => syms[i]);
  } else {
    const side = r() < 0.5 ? -1 : 1, k = nb - 1;
    P.switch = { bay: k, side, a: bays[k], b: side * (LB + 5), y: 16, face: [0, -side] };
    P.lintel = [G.hammer, G.arrow];
    P.lintelFlip = side < 0;
  }
  return P;
}

/** Material for local voxel (a, y, b), or -1 to leave what is there. */
export function hallVox(L, a, y, b, cur, vx, vy, vz) {
  const P = L.P, H = L.H, { LA, LB, Hs } = P;
  const ca = a + 0.5, cb = b + 0.5, ab = Math.abs(cb);
  if (y < -5) return -1;
  // 1. the back wall with the sealed door, its frame and the lintel
  if (ca > LA - 2 && ca < LA + T && ab < LB + T) {
    const m = backWall(L, P, a, y, b, ca, cb, ab, cur);
    if (m !== null && m !== -2) return m;
  }
  // 2. the treasure room behind, wrapped in bedrock
  const rd = boxDist(P.room, a, y, b);
  if (rd <= 4 && a >= LA + T - 1) {
    const m = treasureVox(L, P.room, a, y, b, rd, vx, vy, vz);
    if (m >= 0) return m;
  }
  // 3. the front corridor
  if (ca < -LA - T + 0.5) return corridor(L, P, a, y, b, ca, cb, ab, cur, vx, vy, vz);
  const yc = Hs + (H - Hs) * Math.sqrt(Math.max(0, 1 - (Math.min(ab, LB) / LB) ** 2)); // vault height here
  const col = P.collapse;
  const cd = hyp(ca - col.a, (cb - col.b) * 1.15) / col.rad;
  const chimney = cd < 0.42 + h3(vx >> 2, 0, vz >> 2, L.seed + 9) * 0.12;
  const chimTop = H + 9 + Math.floor(h3(vx >> 2, 1, vz >> 2, L.seed + 8) * 8);
  const nave = Math.abs(ca) < LA && ab < LB;
  if (nave) {
    if (y < -3) return -1;
    if (y < -1) return M.RSTONE;
    if (y === -1) return floor(L, P, ca, cb, ab, cd, vx, vy, vz);
    if (y < yc) return inside(L, P, a, y, b, ca, cb, ab, yc, cd, chimney, chimTop, vx, vy, vz);
    if (chimney) return y < chimTop ? (y >= chimTop - strandLen(L, a, b, 0.07) && strandMat(L.zone) ? strandMat(L.zone) : 0) : -1;
    if (y < yc + 3) return y < yc + 2 && ribAt(P, ca) ? M.RDARK : M.RSTONE;
    return -1;
  }
  // 4. the walls (caves that cut through them stay open)
  const wa = Math.abs(ca) - LA, wb = ab - LB;
  if (wa < T && wb < T) {
    if (y < -3) return -1;
    if (y < 0) return M.RSTONE;
    if (y >= yc + 3) return -1;
    // the front doorway
    if (ca < 0 && wb < 0 && ab < 10 && (y < 26 || (y - 26) ** 2 + cb * cb < 100)) return 0;
    if (wb >= 0) {
      const m = sideWall(L, P, ca, y, cb, wb);
      if (m !== null) return m;
    }
    if (cur === 0) return -1;
    return h3(vx >> 3, vy >> 3, vz >> 3, L.seed + 7) < 0.1 ? M.CRACKED : M.RSTONE;
  }
  // 5. the switch niche reaches back into the rock
  const sw = P.switch;
  if (sw && Math.sign(cb) === sw.side && Math.abs(ca - sw.a) < 7 && wb >= T && wb < 6 && y >= 7 && y < 27) {
    return Math.abs(ca - sw.a) < 6 && y >= 8 && y < 26 && wb < 5 ? 0 : M.RDARK;
  }
  return -1;
}

/** Ribs under the vault in line with each pillar pair. */
function ribAt(P, ca) {
  for (const pa of P.pillars) if (Math.abs(ca - pa) < 3) return true;
  return false;
}

function floor(L, P, ca, cb, ab, cd, vx, vy, vz) {
  const hb = h3(vx, vy, vz, L.seed + 12);
  if (cd < 0.9 && hb < 0.35 * (1 - cd)) return M.RUBBLE;
  if (hb < 0.022) return M.GRAVEL; // lost tiles
  const edge = P.PB - 7;
  if (ab < edge) {
    // the mosaic carpet: a gold and black border, red lozenges outlined in blue on cream
    if (ab >= edge - 2) return M.MOS_G;
    if (ab >= edge - 3) return M.MOS_K;
    const pu = (((Math.floor(ca) % 12) + 12) % 12) - 5.5, pw = (((Math.floor(cb) % 12) + 12) % 12) - 5.5, dd = Math.abs(pu) + Math.abs(pw);
    if (dd < 2) return M.MOS_G;
    if (dd < 5) return M.MOS_R;
    if (dd < 6) return M.MOS_B;
    return M.MOS_W;
  }
  // flagstones, with a dark border round the base of each pillar row
  return Math.abs(ab - P.PB) < 8 && Math.abs(ab - P.PB) >= 7 ? M.RDARK : M.FLAG;
}

function inside(L, P, a, y, b, ca, cb, ab, yc, cd, chimney, chimTop, vx, vy, vz) {
  const s = L.seed, { LB, Hs, PB } = P;
  // the cave-in: rubble, dressed blocks and flagstones under the chimney
  if (cd < 1) {
    const top = (Hs + 10) * Math.pow(1 - cd, 1.25) - 2 + (h3(vx >> 2, 0, vz >> 2, s + 13) - 0.5) * 6;
    if (y < top) {
      const k = h3(vx >> 2, vy >> 2, vz >> 2, s + 14);
      return k < 0.18 ? M.RSTONE : k < 0.24 ? M.FLAG : M.RUBBLE;
    }
  }
  // pillars, and the drums of the snapped ones lying beside them
  const side = cb < 0 ? 0 : 1;
  for (let k = 0; k < P.pillars.length; k++) {
    const oa = ca - P.pillars[k];
    if (Math.abs(oa) > 20) continue;
    const ob = ab - PB, brk = P.broken[k][side];
    if (Math.abs(oa) < 7.5 && Math.abs(ob) < 7.5) {
      const m = pillar(L, P, oa, ob, y, brk, yc, vx, vy, vz);
      if (m >= 0) return m;
    }
    if (brk) {
      const dir = h3(k, side, 9, s) < 0.5 ? -1 : 1, off = oa - dir * 13, lat = ab - (PB - 9);
      if (Math.abs(off) < 6 && Math.abs(lat) < 5 && y < 10 && !(Math.abs(lat) > 3.5 && (y < 1 || y > 8))) {
        // a lying drum: flutes run along it
        return Math.floor(lat + 5) % 3 === 1 && y === 9 ? M.FRIEZE : M.RSTONE;
      }
    }
  }
  // the walls' decoration, standing out into the nave
  const n = Math.floor(LB - ab); // 0: the layer against the side wall
  if (n <= 2 && Math.abs(ca) < P.LA) {
    for (const pa of P.pillars) if (Math.abs(ca - pa) < 5) {
      if (y >= Hs - 4) return n <= 2 ? M.RDARK : 0; // pilaster capital
      if (n <= 1) return y < 4 ? M.RDARK : M.RSTONE;
    }
    if (n === 0 && y < 4) return M.RDARK; // plinth
    if (n === 0 && y >= Hs - 4 && y < Hs - 1) return M.RDARK; // cornice
    if (y >= Hs - 16 && y < Hs - 5 && n <= 1) {
      const m = frieze(L, P, ca, cb, y - (Hs - 16), n);
      if (m >= 0) return m;
    }
  }
  // the growth: roots (or crystal, icicles) hanging from the vault
  const sm = strandMat(L.zone);
  if (sm) {
    const top = chimney ? chimTop : yc;
    const len = strandLen(L, a, b, chimney ? 0.06 : 0.01);
    if (len && y >= top - (sm === M.CRYSTAL ? Math.min(len, 7) : len)) return sm;
  }
  if (y === 0 && cd < 1.3 && L.zone <= 3 && h3(vx >> 1, 0, vz >> 1, s + 15) < 0.45 * (1.3 - cd)) return M.MOSS;
  return 0;
}

/** The frieze band (fy 0..10 from its bottom; n: 0 the band, 1 the raised symbols). */
function frieze(L, P, ca, cb, fy, n) {
  if (fy === 0 || fy === 10) return M.RDARK; // its frame stands out two voxels
  let k = 0, bd = 1e9;
  for (let i = 0; i < P.bays.length; i++) { const d = Math.abs(ca - P.bays[i]); if (d < bd) { bd = d; k = i; } }
  const sideS = cb < 0 ? -1 : 1;
  const g = friezeGlyph(L, P, k, sideS);
  const dir = sideS > 0 ? -1 : 1; // left to right for someone facing the wall
  const gx = Math.floor((ca - P.bays[k]) * dir + 3.5), gy = fy - 2;
  const on = gx >= 0 && gx < 7 && gy >= 0 && gy < 7 && glyphPix(g, gx, gy);
  if (n === 1) return on ? M.GILT : -1;
  if (on) return M.GILT;
  // a running key pattern between the symbols
  if (bd > 6 && (fy === 2 || fy === 8 || ((fy === 3 || fy === 7) && (Math.floor(ca) & 3) === 0))) return M.RDARK;
  return M.FRIEZE;
}

function friezeGlyph(L, P, k, side) {
  if (P.levers) for (const lv of P.levers) if (lv.bay === k && lv.side === side) return lv.glyph;
  if (P.switch && P.switch.bay === k && P.switch.side === side) return G.hammer;
  const list = [G.sun, G.mole, G.peak, G.wave, G.star, G.paw, G.eye];
  return list[(k * 3 + (side > 0 ? 1 : 0) + (L.seed % 7)) % list.length];
}

function pillar(L, P, oa, ob, y, brk, yc, vx, vy, vz) {
  const top = Math.floor(yc), da = Math.abs(oa), db = Math.abs(ob);
  if (brk && y >= brk) {
    // the jagged stump top
    if (y < brk + 3 && da < 5 && db < 5 && h3(vx >> 1, vy, vz >> 1, L.seed + 16) < 0.5 - (y - brk) * 0.15) return M.RSTONE;
    return -1;
  }
  if (y < 3) return da < 6.5 && db < 6.5 ? M.RDARK : -1;
  if (y < 5) return da < 5.8 && db < 5.8 ? M.RDARK : -1;
  if (y >= top - 6) {
    // the capital, flaring up into the vault
    const hw = y >= top - 3 ? 7.2 : 6.2;
    return da < hw && db < hw ? M.RDARK : -1;
  }
  if (y >= top - 8 && da < 5.5 && db < 5.5) return M.GILT; // a gilded necking ring
  if (da >= 5 || db >= 5) return -1;
  // fluting: the outer layer is grooved every third voxel
  if (da >= 4 && db < 4 && Math.floor(ob + 5) % 3 === 1) return -1;
  if (db >= 4 && da < 4 && Math.floor(oa + 5) % 3 === 1) return -1;
  return h3(vx >> 2, vy >> 2, vz >> 2, L.seed + 17) < 0.1 ? M.CRACKED : M.RSTONE;
}

/** Side walls: lever niches, the hidden switch panel. null = plain wall. */
function sideWall(L, P, ca, y, cb, wb) {
  const sideS = cb < 0 ? -1 : 1;
  const sw = P.switch;
  if (sw && sideS === sw.side && Math.abs(ca - sw.a) < 8) {
    const inN = Math.abs(ca - sw.a) < 6 && y >= 8 && y < 26;
    if (wb < 2 && y >= 4 && y < 30) return M.CRACKED;
    if (inN) return 0;
    if (Math.abs(ca - sw.a) < 7 && y >= 7 && y < 27) return M.RDARK;
  }
  if (P.levers) for (const lv of P.levers) {
    if (lv.side !== sideS || Math.abs(ca - lv.a) >= 6 || y < 6 || y >= 23) continue;
    if (wb < 2) return 0;
    return M.RDARK;
  }
  return null;
}

/** The back wall: the sealed door, the bedrock behind its face, the frame and the lintel. */
function backWall(L, P, a, y, b, ca, cb, ab, cur) {
  const { LA, DW, DH } = P;
  if (y < -3) return null;
  const inDoor = ab < DW && y >= 0 && (y < DH || (y - DH) ** 2 + cb * cb < DW * DW);
  if (ca >= LA) {
    if (y < 0) return M.RSTONE;
    if (inDoor) return a === LA || a === LA + T - 1 ? M.WARD : M.BEDROCK;
    const behindRoom = ab < P.room.b1 + 1 && y < P.room.y1 + 1;
    if (a === LA) return y < 4 ? M.RDARK : M.RSTONE;
    if (behindRoom) return a === LA + T - 1 ? -2 : M.BEDROCK; // -2: the room's lining decides
    return cur === 0 ? -1 : M.RSTONE;
  }
  // the frame stands two voxels out of the wall face
  if (y < 0) return null;
  const rr = hyp(y - DH, cb);
  const jamb = ab >= DW && ab < DW + 4 && y < DH;
  const arch = y >= DH && rr >= DW && rr < DW + 4;
  if (jamb || arch) {
    for (const r of P.doorRunes) if (a === r.a && y >= r.y0 && y < r.y1 && b >= r.b0 && b < r.b1) return M.RUNEOFF;
    if (arch && ab < 1.5 && rr > DW + 1) return M.GILT; // keystone
    if (jamb && y < 3) return M.RDARK;
    return M.RDARK;
  }
  // the lintel with the hint
  const ly = y - (DH + DW + 6);
  if (a === LA - 1 && ly >= -1 && ly <= 7) {
    const n = P.lintel.length, w = n * 8 - 1, x0 = -w / 2;
    if (ab < w / 2 + 2) {
      if (ly === -1 || ly === 7 || ab >= w / 2 + 1) return M.RDARK;
      const xx = Math.floor(cb - x0), k = Math.floor(xx / 8), gx = xx - k * 8;
      if (k >= 0 && k < n && gx < 7) {
        const g = P.lintel[k];
        if (glyphPix(g, P.lintelFlip && g === G.arrow ? 6 - gx : gx, ly)) return M.GILT;
      }
      return M.FRIEZE;
    }
  }
  return null;
}

function corridor(L, P, a, y, b, ca, cb, ab, cur, vx, vy, vz) {
  const LA = P.LA, end = -LA - 44;
  if (ca < end || ab >= 13 || y < -3 || y >= 40) return -1;
  if (y < 0) return y === -1 ? (h3(vx >> 2, 0, vz >> 2, L.seed) < 0.15 ? M.GRAVEL : M.FLAG) : M.RSTONE;
  const inner = ab < 10 && (y < 26 || (y - 26) ** 2 + cb * cb < 100);
  if (inner) {
    // where it caved in: rubble rising toward the far end
    const t = (ca - end) / 44, pile = (1 - t) * 40 - 8 + h3(vx >> 1, 0, vz >> 1, L.seed + 2) * 6;
    if (y < pile) return h3(vx >> 2, vy >> 2, vz >> 2, L.seed + 4) < 0.3 ? M.RSTONE : M.RUBBLE;
    if (y === 0 && h3(vx >> 1, 0, vz >> 1, L.seed + 3) < 0.3) return M.RUBBLE;
    return 0;
  }
  if (cur === 0) return -1;
  if (y < 26 || (y - 26) ** 2 + cb * cb < 169) return h3(vx >> 3, vy >> 3, vz >> 3, L.seed + 6) < 0.18 ? M.CRACKED : M.RSTONE;
  return -1;
}

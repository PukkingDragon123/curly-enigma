// One layer of the underground, side-on, as a woodcut print: wavy strata bands of the layer's rocks
// carved with gouge strokes along the bedding, a big cave hollow (its floor lit cream from the top
// left, its ceilings and right-hand walls outlined in plum), an old mine gallery up in the rock with a
// ladder down a chimney, pockets of water / lava / crystal, pillars, drip-stones, a survey staff
// down the left edge with the depths, then the layer's own sights (features.js), the lift cages and
// the town shaft (props.js), and banded lamplight.
import { makeNoise2D, makeRng, clamp } from '../../core/util.js';
import { Art, ZP, INK, INK2, CREAM, LAMP, WATER, LAVA, hash, mix, smoothstep, lump, lightPool, distField, digits } from './kit.js';
import { ID, support, lamp, rails, cart, ladder, cage, cable, shaft, sheave } from './props.js';
import { zoneFeatures, backFeatures, ICE } from './features.js';

/** Zone n spans [n-1]..[n] metres down. Mirrors ZONE_DEPTHS in deep/Generator.js (where the lifts are). */
export const LIFT_ZONE_DEPTHS = [0, 25, 55, 90, 130, 170, 210];
export const STAFF = 14; // the survey staff down the left edge (art px)
const STAFF_C = [0xe4cc98, 0xa8402c]; // its painted bands (cream / rust), 5 m each

/**
 * Paint a layer. L: { z, W, H, seed, plaque {x0,y0,x1,y1}, stops [{ id, ax, open }], shx (the town
 * shaft's x), ores [{ id, col:[c, hi], known }], here }.
 * Returns { art (Art), anim, floorTop, ceilBot }.
 */
export function paintLayer(L) {
  const { z, W, H, seed } = L;
  const P = ZP[z];
  const rng = makeRng(seed * 31 + z * 977);
  const n1 = makeNoise2D(seed * 13 + z * 101), n2 = makeNoise2D(seed * 7 + z * 59), n3 = makeNoise2D(seed * 3 + z * 7);
  const pq = L.plaque;
  const shx = L.shx;
  const air = new Uint8Array(W * H); // 0 rock, 1 air, 2 water, 3 lava, 4 ice
  const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : air[(y | 0) * W + (x | 0)]);
  const setA = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && y >= 3 && x < W && y < H - 2) air[y * W + x] = v; };
  const stops = L.stops || [];
  const nearStop = (x, r = 16) => stops.some((s) => Math.abs(x - s.ax) < r);
  const nearShaft = (x, r = 9) => Math.abs(x - shx) < r;

  // ---- the main hollow: a floor line and a ceiling line
  const fl = new Float32Array(W), cl = new Float32Array(W);
  for (let x = 0; x < W; x++) fl[x] = H - 30 - n1(x * 0.011, 3.1) * 10 - n2(x * 0.05, 1.7) * 3;
  for (const s of stops) { const f = fl[clamp(s.ax, 0, W - 1)]; for (let x = Math.max(0, s.ax - 14); x < Math.min(W, s.ax + 15); x++) fl[x] = f + (fl[x] - f) * smoothstep(9, 14, Math.abs(x - s.ax)); }
  for (let x = 0; x < W; x++) {
    let c = fl[x] - (46 + n1(x * 0.008, 7.3) * 18 + n2(x * 0.04, 4.4) * 5);
    const under = 1 - smoothstep(pq.x1, pq.x1 + 34, x);
    c = Math.max(c, (pq.y1 + 12) * under + 52 * (1 - under));
    if (fl[x] - c < 26) c = fl[x] - 26;
    cl[x] = c;
  }
  for (let x = 0; x < W; x++) for (let y = Math.ceil(cl[x]); y < fl[x]; y++) setA(x, y, 1);

  // ---- the old gallery up in the rock (rails along it) and the chimney down to the hollow
  let gal = null;
  if (W > 260) {
    const gx0 = Math.round(Math.max(pq.x1 + 26, W * 0.4 + rng() * W * 0.08));
    const gx1 = Math.round(Math.min(W - 6, gx0 + W * 0.34 + rng() * W * 0.1));
    let minC = H; for (let x = gx0; x < gx1; x++) minC = Math.min(minC, cl[x]);
    const gy = Math.round(clamp(pq.y0 + 34 + rng() * 10, 28, minC - 30));
    if (minC - gy > 26) {
      gal = { x0: gx0, x1: gx1, y: gy, f: new Int16Array(W), c: new Int16Array(W) };
      for (let x = gx0; x < gx1; x++) {
        const e = Math.min(x - gx0, gx1 - x), sh = e < 9 ? ((9 - e) ** 2) / 9 : 0;
        const f = Math.round(gy + 7 + n2(x * 0.03, 9.1) * 1.5), c = Math.round(gy - 9 - n1(x * 0.05, 2.2) * 3 + sh);
        gal.f[x] = f; gal.c[x] = c;
        for (let y = c; y < f - sh * 0.4; y++) setA(x, y, 1);
      }
      // the chimney down to the hollow, away from the lifts and the shaft
      let cx = -1;
      for (let k = 0; k < 30; k++) { const x = Math.round(gx0 + 14 + rng() * Math.max(1, (gx1 - gx0) * 0.5)); if (!nearStop(x, 22) && !nearShaft(x, 16)) { cx = x; break; } }
      if (cx > 0) {
        gal.cx = cx;
        for (let y = gal.f[cx] - 2; y < cl[cx] + 3; y++) for (let i = -3; i <= 4; i++) setA(cx + i + Math.round(n2(y * 0.08, 3) * 1.5), y, 1);
      }
    }
  }

  // ---- pockets in the rock (water lenses, a crevice, a geode, a lava pocket, an ice lens): lumpy, few
  const pockets = [];
  const quiet = (x, y, r) => x > STAFF + 8 + r && x < W - r - 4 && y > 10 && y < H - 8 && !(x < pq.x1 + 10 + r && y < pq.y1 + 10) && !nearShaft(x, r + 10);
  const nPk = 1 + (W > 380 ? 1 : 0) + (z === 2 ? 1 : 0);
  for (let k = 0, tries = 0; k < nPk && tries < 120; tries++) {
    const rx = rng.int(6, 11), ry = rng.int(3, 6);
    const x = rng.int(rx + 4, W - rx - 4);
    const upper = rng() < 0.75;
    const y = upper ? rng.int(14, Math.max(15, Math.round(cl[x]) - ry - 10)) : rng.int(Math.round(fl[x]) + ry + 7, H - ry - 5);
    if (!quiet(x, y, rx)) continue;
    let ok = true;
    for (let j = -ry - 6; j <= ry + 6 && ok; j++) for (let i = -rx - 6; i <= rx + 6; i++) if (A(x + i, y + j) || (gal && x + i >= gal.x0 - 4 && x + i <= gal.x1 + 4 && Math.abs(y + j - gal.y) < 18) || pockets.some((q) => Math.abs(q.x - x - i) < q.rx + 6 && Math.abs(q.y - y - j) < q.ry + 6)) { ok = false; break; }
    if (!ok) continue;
    const kinds = { 1: ['water', 'air'], 2: ['water', 'air', 'water'], 3: ['geode', 'water'], 4: ['lava', 'air'], 5: ['ice', 'water'], 6: ['geode', 'air'] }[z];
    const kind = kinds[k % kinds.length];
    pockets.push({ x, y, rx, ry, kind });
    k++;
    // two or three overlapping lumps, so no pocket is a neat oval
    const lumps = [[0, 0, 1, 1], [rng.range(-0.5, 0.5) * rx, rng.range(-0.3, 0.4) * ry, rng.range(0.45, 0.7), rng.range(0.6, 0.9)], [rng.range(-0.6, 0.6) * rx, rng.range(-0.2, 0.3) * ry, rng.range(0.3, 0.5), rng.range(0.5, 0.8)]];
    for (let j = -ry - 3; j <= ry + 3; j++) for (let i = -rx - 4; i <= rx + 4; i++) {
      let inside = false;
      for (const [ox, oy, sx, sy] of lumps) {
        const u = (i - ox) / (rx * sx), v = (j - oy) / (ry * sy);
        if (u * u + v * v * (v > 0 ? 1.4 : 0.9) < 1 + n2((x + i) * 0.35, (y + j) * 0.35) * 0.35) { inside = true; break; }
      }
      if (!inside) continue;
      const lvl = kind === 'lava' ? j > -ry * 0.2 : true;
      setA(x + i, y + j, kind === 'water' ? 2 : kind === 'lava' ? (lvl ? 3 : 1) : kind === 'ice' ? 4 : 1);
    }
  }
  // crawlways: narrow wandering tunnels off the hollow, up into the rock, ending in a little chamber
  for (let k = 0; k < (W > 380 ? 2 : 1); k++) {
    for (let t = 0; t < 30; t++) {
      const x0 = rng.int(Math.max(pq.x1 + 16, STAFF + 20), W - 30);
      if (nearStop(x0, 20) || nearShaft(x0, 16) || (gal && x0 > gal.x0 - 10 && x0 < gal.x1 + 10)) continue;
      let x = x0, y = Math.ceil(cl[x0]) + 2;
      const dir = rng() < 0.5 ? -1 : 1, steps = rng.int(22, 40);
      const path = [];
      let bad = false;
      for (let i = 0; i < steps; i++) {
        x += dir * (rng() < 0.75 ? 1 : 0); y -= rng() < 0.45 ? 1 : 0;
        if (y < pq.y1 + 8 && x < pq.x1 + 8) { bad = true; break; }
        if (y < 12 || nearShaft(x, 9) || x < STAFF + 10 || x > W - 8) { bad = true; break; }
        path.push([x, y]);
      }
      if (bad) continue;
      for (const [px, py] of path) for (let j = -2; j <= 1; j++) for (let i = -1; i <= 1; i++) setA(px + i, py + j, 1);
      const [ex, ey] = path[path.length - 1];
      for (let j = -4; j <= 2; j++) for (let i = -5; i <= 5; i++) if (i * i / 25 + j * j / (j < 0 ? 16 : 4) < 1 + n2((ex + i) * 0.4, ey + j) * 0.3) setA(ex + i, ey + j, 1);
      pockets.push({ x: ex, y: ey, rx: 5, ry: 3, kind: 'nest' });
      break;
    }
  }

  // ---- pools in the hollow's floor: water (frozen in the Frost Vault), a lava river in the Magma Deep
  const pools = [];
  const keep = (x) => nearStop(x, 17) || nearShaft(x, 10) || (gal && gal.cx && Math.abs(x - gal.cx) < 10);
  if (z === 4) {
    let run = -1;
    for (let x = 6; x <= W - 6; x++) {
      const k = keep(x) || x === W - 6;
      if (!k && run < 0) run = x;
      if (k && run >= 0) { if (x - run >= 26) pools.push({ x0: run + 2, x1: x - 3, deep: 10, kind: 3 }); run = -1; }
    }
  } else if (z !== 6) {
    const w = Math.round(clamp(W * 0.17, 32, 84));
    for (let t = 0; t < 40; t++) {
      const x0 = rng.int(pq.x1 > W * 0.5 ? 8 : Math.round(pq.x1 * 0.5), W - w - 8);
      let ok = true;
      for (let x = x0 - 6; x < x0 + w + 6; x++) if (keep(x)) { ok = false; break; }
      if (ok) { pools.push({ x0, x1: x0 + w, deep: z === 5 ? 9 : 11, kind: z === 5 ? 4 : 2 }); break; }
    }
  }
  for (const pl of pools) {
    const lvl = Math.round(Math.max(fl[pl.x0], fl[pl.x1]));
    pl.level = lvl;
    for (let x = pl.x0; x <= pl.x1; x++) {
      const t = (x - pl.x0) / (pl.x1 - pl.x0);
      const dip = Math.max(2, Math.round(pl.deep * Math.pow(Math.sin(Math.PI * t), 0.6) + n2(x * 0.2, 6) * 1.5));
      const bot = Math.max(Math.round(fl[x]), lvl) + dip;
      for (let y = Math.ceil(cl[x]); y < lvl; y++) setA(x, y, 1);
      for (let y = lvl; y < Math.min(H - 3, bot); y++) setA(x, y, pl.kind);
    }
  }

  // ---- pillars, hanging drip-stones and stalagmites (rock in the mask; painted with the rock)
  const nPil = W > 420 ? 2 : 1;
  for (let k = 0, tries = 0; k < nPil && tries < 60; tries++) {
    const x = rng.int(20, W - 20), w0 = rng.int(8, 13);
    let bad = false;
    for (let i = x - w0 - 6; i < x + w0 + 6; i++) if (keep(i) || pools.some((p) => i >= p.x0 - 4 && i <= p.x1 + 4) || i < pq.x1 + 6) bad = true;
    if (bad) continue;
    const lean = rng.range(-2, 2);
    for (let y = Math.floor(cl[x]) - 2; y < fl[x] + 2; y++) {
      const t = clamp((y - cl[x]) / (fl[x] - cl[x]), 0, 1);
      const half = (w0 / 2) * (0.42 + 0.58 * Math.pow(Math.abs(2 * t - 1), 1.4)) + n2(y * 0.15, x) * 0.8;
      const cx = x + lean * (t - 0.5) * 2;
      for (let i = Math.round(cx - half); i <= Math.round(cx + half); i++) if (A(i, y) === 1) setA(i, y, 0);
    }
    k++;
  }
  for (let k = 0; k < W / 26; k++) {
    const x = rng.int(3, W - 4);
    if (nearStop(x, 12) || nearShaft(x, 8)) continue;
    const big = rng() < 0.3;
    const top = Math.ceil(cl[x]), len = big ? rng.int(9, 16) : rng.int(2, 6), w = big ? rng.int(5, 9) : rng.int(2, 4), lean = rng.range(-1, 1);
    for (let j = 0; j < len; j++) {
      const half = (w / 2) * (1 - j / len) ** 0.8, ox = lean * (j / len) ** 2 * 2;
      for (let i = Math.round(x - half + ox); i <= Math.round(x + half + ox); i++) if (A(i, top + j) === 1) setA(i, top + j, 0);
    }
  }
  for (let k = 0; k < W / 34; k++) {
    const x = rng.int(4, W - 5);
    if (keep(x) || pools.some((p) => x >= p.x0 - 3 && x <= p.x1 + 3)) continue;
    const fy = Math.floor(fl[x]), len = rng.int(3, 8), w = rng.int(4, 8);
    for (let j = 0; j < len; j++) {
      const half = (w / 2) * (1 - j / len) ** 0.7;
      for (let i = Math.round(x - half); i <= Math.round(x + half); i++) if (A(i, fy - 1 - j) === 1) setA(i, fy - 1 - j, 0);
    }
  }

  // ---- where things stand (the hollow's floor top) and hang from (its ceiling underside)
  const floorTop = new Int16Array(W), ceilBot = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    let y = Math.round((cl[x] + fl[x]) / 2);
    if (A(x, y) !== 1) { floorTop[x] = x ? floorTop[x - 1] : Math.round(fl[x]); ceilBot[x] = x ? ceilBot[x - 1] : Math.round(cl[x]); continue; }
    let f = y; while (f < H - 1 && A(x, f) === 1) f++;
    let c = y; while (c > 0 && A(x, c - 1) === 1) c--;
    floorTop[x] = f; ceilBot[x] = c;
  }

  // ---- the strata, the rock and the back wall
  const BD = makeBands(W, H, P, rng, n3);
  const { bands, bandAt } = BD;
  const dRock = distField(W, H, (k) => air[k] !== 0 && air[k] !== 4);
  const dOpen = distField(W, H, (k) => air[k] === 0 || air[k] === 4);
  const pc = new Art(W, H);
  const open = (x, y) => { const v = A(x, y); return v !== 0 && v !== 4; };
  rockPass(pc, { W, H, z, P, air, A, dRock, nz: n1, ...BD });
  backPass(pc, { W, H, air, Bk: P.back, n2, dOpen, ceilBot });
  const Bk = P.back;
  backFeatures({ pc, z, W, H, P, rng, A, floorTop, ceilBot, dOpen });
  // liquids: water in woodcut lines; lava in hot bands; the Frost Vault's pool is ice
  const liquid = [];
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const v = A(x, y);
    if (v !== 2 && v !== 3) continue;
    const surf = A(x, y - 1) === 1;
    let s = 0; while (A(x, y - s - 1) === v) s++; // depth below the surface
    let c;
    if (v === 2) {
      c = surf ? (hash(x >> 1, y, 2) < 0.75 ? WATER[4] : WATER[3]) : s < 2 ? WATER[3] : s < 5 ? WATER[2] : WATER[1];
      if (!surf && s >= 2 && (s % 3 === 1) && hash((x + s * 3) >> 2, s, 8) < 0.45) c = s < 5 ? WATER[3] : WATER[2];
      if (A(x, y + 1) === 0 || A(x + 1, y) === 0) c = WATER[0];
    } else {
      c = surf ? LAVA[4] : s < 2 ? LAVA[3] : s < 4 ? LAVA[2] : LAVA[1];
      if (!surf && s >= 2 && (s % 3 === 0) && hash((x + s * 5) >> 2, s, 9) < 0.5) c = LAVA[s < 4 ? 3 : 2];
      if (A(x, y + 1) === 0 || A(x + 1, y) === 0) c = LAVA[0];
    }
    pc.p(x, y, c);
    pc.id[y * W + x] = ID.liquid;
    if (surf) liquid.push(x, y, v);
  }
  // the Frost Vault's frozen pool: ice with cracks
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (A(x, y) === 4 && pools.some((p) => x >= p.x0 && x <= p.x1)) {
    const surf = A(x, y - 1) === 1;
    pc.p(x, y, surf ? CREAM : (x + y * 2) % 11 === 0 ? ICE[3] : ICE[2]);
  }

  // ---- texture marks, ore nodules, cracks
  const anim = { drips: [], glints: [], glows: [], critters: [], plants: [], falls: [], cages: [], lamps: [], spores: [], floaters: [], liquid, embers: z === 4, snow: z === 5 };
  const quietAt = (x, y) => !(x < pq.x1 + 4 && y < pq.y1 + 4) && !nearShaft(x, 9) && x > STAFF + 2;
  const solidBox = (x, y, w, h, m = 1) => { for (let j = -m; j < h + m; j++) for (let i = -m; i < w + m; i++) if (A(x + i, y + j) !== 0) return false; return true; };
  for (let gy = 0; gy < H; gy += 9) for (let gx = 0; gx < W; gx += 9) {
    const x = gx + ((hash(gx, gy, 21 + z) * 7) | 0), y = gy + ((hash(gx, gy, 22 + z) * 7) | 0);
    if (x >= W || y >= H || !quietAt(x, y)) continue;
    const k = y * W + x;
    if (air[k] !== 0 || dRock[k] < 3) continue;
    const b = bands[bandAt[k]], R = b.R;
    const h = hash(gx, gy, 23 + z);
    if (b.seam && h > 0.3) continue;
    if (z === 1 || z === 5) { // pebbles and stones, in gravelly patches
      if (h < (n2(x * 0.035, y * 0.05 + 2) > 0.1 ? 0.5 : 0.08)) { const w = 3 + ((h * 12) | 0) % 4, hh = 2 + ((h * 31) | 0) % 2; if (solidBox(x, y, w, hh)) lump(pc, x, y, w, hh, z === 5 ? ZP[5].mats[2] : ZP[1].mats[3], gx * 7 + gy, P.ink); }
    } else if (z === 2) { // clay lumps and shell grit
      const clump = n2(x * 0.04, y * 0.04 + 5) > 0.15;
      if (clump && h < 0.3) { if (solidBox(x, y, 5, 3)) lump(pc, x, y, 5, 3, ZP[2].mats[(bandAt[k] + 1) % 3], gx + gy * 3, P.ink); }
      else if (h < 0.1) { pc.p(x, y, R[3]); pc.p(x + 1, y, R[2]); pc.p(x + 1, y + 1, R[0]); }
    } else if (z === 3) { // feldspar and mica: angular flecks
      if (h < 0.5) { pc.p(x, y, R[3]); pc.p(x + 1, y, R[2]); pc.p(x, y + 1, R[2]); pc.p(x + 1, y + 1, R[0]); if (h < 0.12) pc.p(x + 2, y - 1, CREAM); }
    } else if (z === 4) { // vesicles: little holes lit from the top left
      if (h < 0.45) { pc.p(x, y, R[0]); pc.p(x + 1, y, R[0]); pc.p(x, y + 1, INK); pc.p(x + 1, y + 1, R[2]); pc.p(x + 2, y + 1, R[2]); }
    } else if (z === 6) { // star flecks, rare
      if (h < 0.12) { pc.p(x, y, 0xb88a3a); pc.p(x + 1, y, 0xf0d488); pc.p(x + 1, y + 1, 0x6a4a1e); }
      else if (h < 0.3) { pc.p(x, y, R[2]); pc.p(x + 1, y + 1, R[0]); }
    }
  }
  // basalt's columns: vertical joints in the Magma Deep
  if (z === 4) for (let x = STAFF + 4; x < W; x += 7 + ((hash(x, 3, 44) * 4) | 0)) {
    for (let y = 0; y < H; y++) {
      const k = y * W + x;
      if (air[k] !== 0 || bands[bandAt[k]].seam || !quietAt(x, y) || dRock[k] < 2) continue;
      const brk = hash(x, Math.floor(y / 9), 45);
      if (brk < 0.15) continue;
      pc.p(x, y, P.ink); if (dRock[k] > 2) pc.p(x + 1, y, bands[bandAt[k]].R[2]);
      if ((y + x) % 9 === 0) { pc.p(x - 1, y, P.ink); pc.p(x - 2, y + 1, P.ink); }
    }
  }
  // ore nodules: the layer's ores near the open rock (known ones in colour, the rest a hint)
  const ores = (L.ores || []).filter((o) => o.col);
  if (ores.length) {
    const want = Math.round((W * H) / 2600);
    for (let k = 0, tries = 0; k < want && tries < want * 12; tries++) {
      const x = rng.int(STAFF + 4, W - 6), y = rng.int(6, H - 6);
      const kk = y * W + x;
      if (air[kk] !== 0 || dRock[kk] < 3 || dRock[kk] > 16 || !quietAt(x, y) || !solidBox(x - 1, y - 1, 5, 4)) continue;
      const o = ores[rng.int(0, ores.length - 1)];
      const R = bands[bandAt[kk]].R;
      const cur = pc.cur; pc.cur = ID.ore;
      const shape = [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2], [2, 2]].filter((_, i) => hash(x, y, i) < 0.85 || i === 1 || i === 4);
      for (const [i, j] of shape) {
        let c;
        if (o.known) c = j === 0 || i === 0 ? o.col[1] : i === 3 || j === 2 ? mix(o.col[0], P.ink, 0.45) : o.col[0];
        else c = j === 0 ? R[2] : j === 2 ? R[0] : mix(R[1], R[2], 0.5);
        pc.p(x + i, y + j, c);
      }
      if (o.known) { pc.p(x + 4, y + 2, P.ink); pc.p(x + 3, y + 3, P.ink); pc.p(x + 1, y, CREAM); }
      pc.cur = cur;
  if (o.known && rng() < 0.2) anim.glints.push({ x: x + 1, y, c: o.col[1], ph: rng() });
      k++;
    }
  }
  // cracks: carved lines from the open into the rock
  for (let k = 0; k < W / 26; k++) {
    let x = rng.int(STAFF + 4, W - 4), y = rng.int(4, H - 4);
    if (dRock[y * W + x] !== 1 || !quietAt(x, y)) continue;
    const down = !open(x, y + 1) && open(x, y - 1);
    const len = rng.int(5, 15);
    for (let j = 0; j < len; j++) {
      x += rng() < 0.4 ? (rng() < 0.5 ? -1 : 1) : 0; y += down ? 1 : -1;
      if (A(x, y) !== 0 || A(x - 1, y) !== 0) break;
      pc.p(x, y, P.ink); pc.p(x - 1, y, bands[bandAt[y * W + x]].R[2]);
      if (rng() < 0.18) { const bx = x + (rng() < 0.5 ? 1 : -2); pc.p(bx, y + 1, INK2); }
    }
  }

  // ---- the layer's sights (roots, crystals, fossils, ice, ruins...) and its life
  zoneFeatures({ pc, z, W, H, P, rng, A, dRock, dOpen, floorTop, ceilBot, pq, gal, pockets, pools, anim, keep, nearStop, nearShaft, quietAt, bands, bandAt, ores, cl, fl });

  // ---- the old mine: supports with lamps along the hollow and the gallery, rails, a cart, the ladder
  const lights = [];
  const supX = [];
  for (let x = pq.x1 * 0.4 + 30; x < W - 20; x += 70 + rng() * 60) {
    const xx = Math.round(x);
    if (keep(xx) || nearStop(xx, 24) || pools.some((p) => xx >= p.x0 - 10 && xx <= p.x1 + 10)) continue;
    if (floorTop[xx] - ceilBot[xx] < 30) continue;
    const sp = support(pc, xx, floorTop[xx], ceilBot[xx]);
    supX.push(xx);
    if (supX.length % 2 === 1) { lamp(pc, sp.x + 3, sp.y + 1); anim.lamps.push({ x: sp.x + 3, y: sp.y + 5 }); lights.push({ x: sp.x + 3, y: sp.y + 6, r: 26, k: 0.5 }); }
  }
  if (gal) {
    const gfy = (x) => (x >= gal.x0 + 4 && x <= gal.x1 - 4 && A(x, gal.f[x]) === 0 && A(x, gal.f[x] - 1) === 1 ? gal.f[x] : null);
    rails(pc, gal.x0 + 6, gal.x1 - 6, gfy);
    const cx = Math.round(gal.x0 + (gal.x1 - gal.x0) * (0.55 + rng() * 0.25));
    if (gfy(cx) != null && !nearShaft(cx, 10) && (!gal.cx || Math.abs(cx - gal.cx) > 12)) {
      const o = ores.find((q) => q.known);
      cart(pc, cx, gfy(cx) - 3, o ? [mix(o.col[0], P.ink, 0.3), o.col[1]] : null);
    }
    for (let x = gal.x0 + 18; x < gal.x1 - 10; x += 34) {
      if (nearShaft(x, 10) || (gal.cx && Math.abs(x - gal.cx) < 9)) continue;
      const sp = support(pc, x, gal.f[x], gal.c[x], 12);
      if (x === gal.x0 + 18) { lamp(pc, sp.x + 1, sp.y + 1); anim.lamps.push({ x: sp.x + 1, y: sp.y + 5 }); lights.push({ x: sp.x + 1, y: sp.y + 6, r: 22, k: 0.45 }); }
    }
    if (gal.cx) ladder(pc, gal.cx - 2, gal.f[gal.cx] - 7, floorTop[gal.cx] - 1);
  }
  // rails along the hollow's floor near the lifts
  for (const s of stops) {
    const x0 = clamp(s.ax - 34, 2, W - 2), x1 = clamp(s.ax + 34, 2, W - 2);
    rails(pc, x0, x1, (x) => (Math.abs(x - s.ax) > 9 && A(x, floorTop[x]) === 0 && !pools.some((p) => x >= p.x0 - 1 && x <= p.x1 + 1) && Math.abs(floorTop[x] - floorTop[clamp(s.ax, 0, W - 1)]) < 5 ? floorTop[x] : null));
  }

  // ---- the town shaft through the rock (the cage runs in it: anim)
  shaft(pc, shx, 0, H, (y) => A(shx, y) === 0 && A(shx - 4, y) === 0, Bk);
  anim.shaft = { x: shx };

  // ---- lift cages: on the floor, a headframe wheel under the ceiling, the cable up into the rock
  for (const s of stops) {
    const x = clamp(s.ax, 12, W - 12);
    const fy = floorTop[x];
    s.x = x; s.fy = fy;
    const cy = ceilBot[x];
    cable(pc, x, fy - 18, Math.max(0, cy - 4), !s.open);
    for (let y = cy - 4; y >= 0; y--) if (A(x, y) === 0) { pc.p(x - 1, y, P.ink); pc.p(x, y, (y & 1) ? 0x4a4250 : 0x75707a); pc.p(x + 1, y, P.back[0]); }
    if (fy - cy > 30) {
      sheave(pc, x + 4, cy + 6);
      for (let i = -6; i <= 10; i++) { pc.p(x + i, cy + 1, 0x9a643a); pc.p(x + i, cy + 2, INK); }
      pc.p(x - 6, cy + 3, 0x6a3e2a); pc.p(x + 10, cy + 3, 0x6a3e2a);
    }
    const lp = cage(pc, x, fy, s.open);
    anim.cages.push({ ...s, lx: lp.x, ly: lp.y });
    if (s.open) lights.push({ x: lp.x, y: lp.y, r: 34, k: 0.6 });
  }

  // ---- lamplight: flat bands of warm light round the lamps; lava lights the rock above it
  const onBack = (x, y) => pc.id[y * W + x] === 1;
  for (const l of lights) lightPool(pc, l.x, l.y, l.r * 0.7, LAMP[2], l.k * 0.55, onBack);
  if (z === 4) for (const pl of pools) for (let x = pl.x0; x < pl.x1; x += 22) lightPool(pc, x + 6, pl.level - 2, 26, LAVA[2], 0.4, onBack);
  for (const pk of pockets) if (pk.kind === 'lava') lightPool(pc, pk.x, pk.y, pk.rx + 6, LAVA[2], 0.35, onBack);
  for (const g of anim.glows) if (g.light) lightPool(pc, g.x, g.y, g.light * 0.7, g.c, 0.25, onBack);

  // ---- the survey staff down the left edge: painted bands of 5 m, ticks, the depths
  {
    const d0 = LIFT_ZONE_DEPTHS[z - 1], d1 = LIFT_ZONE_DEPTHS[z];
    const yOf = (d) => Math.round(((d - d0) / (d1 - d0)) * H);
    const cur = pc.cur; pc.cur = ID.support;
    for (let y = 0; y < H; y++) {
      const d = d0 + (y / H) * (d1 - d0), seg = Math.floor(d / 5) & 1;
      const C = STAFF_C[seg];
      pc.p(2, y, INK); pc.p(3, y, mix(C, CREAM, 0.35)); pc.p(4, y, C); pc.p(5, y, C); pc.p(6, y, INK);
    }
    for (let d = Math.ceil(d0); d < d1; d++) {
      const y = yOf(d), big = d % 5 === 0;
      pc.p(7, y, INK); if (big) { pc.p(8, y, INK); pc.p(7, y + 1, INK2); }
    }
    for (let d = Math.ceil(d0 / 10) * 10; d < d1; d += 10) {
      if (d - d0 < 6 && d !== d0) continue;
      if (d1 - d < 6) continue;
      const y = clamp(yOf(d) - 2, 2, H - 7);
      // a cream chip of paper under the numbers so they read on any rock
      const w = digits(pc, 10, y, d, CREAM, null);
      for (let j = -1; j <= 5; j++) for (let i = -1; i <= w; i++) pc.p(10 + i, y + j, j === 5 || i === w ? P.ink : 0x3a2430);
      digits(pc, 10, y, d, CREAM, null);
    }
    pc.cur = cur;
  }
  return { art: pc, anim, floorTop, ceilBot, pools, gal, air };
}

// ------------------------------------------------------------------ shared passes (layers and the top)
/** Wavy strata bands down a slab: a thin seam band first (the contact with the rock above), then the layer's rocks in order. */
export function makeBands(W, H, P, rng, n3, y0 = -4) {
  const bands = [];
  let y = y0, k = 0;
  while (y < H + 12) {
    const seamB = k === 0 || (k % (P.seamEvery + 1) === P.seamEvery);
    const th = seamB ? rng.int(4, 8) : rng.int(22, 40);
    bands.push({ y0: y, seam: seamB, R: seamB ? P.seam : P.mats[P.order[k % P.order.length] % P.mats.length], amp: rng.range(2.5, 7), f: rng.range(0.006, 0.015), ph: rng() * 50, tilt: rng.range(-0.035, 0.035) });
    y += th; k++;
  }
  const nb = bands.length;
  const bY = new Float32Array(nb * W);
  for (let i = 0; i < nb; i++) { const b = bands[i]; for (let x = 0; x < W; x++) bY[i * W + x] = b.y0 + (i ? b.amp * n3(x * b.f, b.ph) + b.tilt * (x - W / 2) : 0); }
  const bandAt = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) { let i = 0; for (let yy = 0; yy < H; yy++) { while (i < nb - 1 && yy >= bY[(i + 1) * W + x]) i++; bandAt[yy * W + x] = i; } }
  return { bands, bY, bandAt };
}

/**
 * The rock, woodcut-style: each band flat in its mid tone, carved with gouge strokes along its
 * bedding (more at the band's foot, which sits in shadow, a few light ones along its top), floors lit
 * cream from the top left, plum outlines only on the shadow side (under ceilings, right-hand walls).
 * air: 0 rock, 4 ice (painted as rock), anything else open; 9 = leave alone (sky).
 */
export function rockPass(pc, o) {
  const { W, H, z, P, air, A, dRock, bands, bY, bandAt, nz } = o;
  const nb = bands.length;
  const open = (x, y) => { const v = A(x, y); return v !== 0 && v !== 4 && v !== 9; };
  const isAir = (x, y) => A(x, y) === 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, v = air[k];
    if (v !== 0 && v !== 4) continue;
    const bi = bandAt[k], b = bands[bi], R = v === 4 ? ICE : b.R;
    const top = bY[bi * W + x], bot = bi < nb - 1 ? bY[(bi + 1) * W + x] : H + 10;
    const vpos = (y - top) / Math.max(1, bot - top);
    const dd = dRock[k];
    const row = Math.floor(y - (top - b.y0)); // the bedding follows the band's own wave
    const sp = b.seam ? 2 : 3;
    const on = ((row % sp) + sp) % sp === 0;
    let c = R[1];
    if (on) {
      // short gouge strokes, staggered, thick where the block was cut deep (by the density field)
      const L = 7 + (b.seam ? 0 : 2), cx = Math.floor((x + hash(row, 5, z) * L) / L), sx = x + hash(row, 5, z) * L - cx * L;
      const s0 = hash(cx, row, z + 7) * 3, len = 2 + hash(cx, row, z + 8) * 5;
      if (sx >= s0 && sx < s0 + len) {
        const dens = nz ? 0.75 + nz(x * 0.025 + bi * 3.1, y * 0.05) * 0.9 : 1;
        let pDark = (dd > 22 ? 0.55 : dd > 9 ? 0.34 : dd > 4 ? 0.12 : 0) + (vpos > 0.68 ? 0.3 : 0);
        const hh = hash(cx, row, z + 9);
        if (hh < pDark * dens) c = R[0];
        else if (vpos < 0.2 && dd > 3 && hh > 0.78) c = R[2];
      }
    }
    if (y - top < 1 && bi > 0 && hash(x >> 2, bi, 7) < 0.8) c = b.seam ? R[0] : INK2;
    pc.p(x, y, c);
    pc.id[k] = v === 4 ? ID.ice : 10 + bi;
    if (dd <= 3) {
      if (open(x, y + 1) || open(x + 1, y)) pc.p(x, y, P.ink);
      else if (isAir(x, y - 1)) pc.p(x, y, hash(x, y, 3) < 0.14 ? R[2] : (v === 4 ? CREAM : R[3]));
      else if (isAir(x, y - 2) || isAir(x - 1, y) || isAir(x - 1, y - 1)) pc.p(x, y, R[2]);
      else if (open(x, y + 2) || open(x + 2, y) || open(x + 1, y + 1)) pc.p(x, y, R[0]);
      else if (isAir(x, y - 3) && hash(x, y, 4) < 0.5) pc.p(x, y, R[2]);
    }
  }
}

/** The back wall through the open: flat contour bands (darker by the rock), vertical hatching between them, seep stains. */
export function backPass(pc, o) {
  const { W, H, air, Bk, n2, dOpen, ceilBot } = o;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (air[k] !== 1) continue;
    const d = dOpen[k] + n2(x * 0.06, y * 0.06) * 2.2;
    let t = d < 2.5 ? 0 : d < 7 ? 1 : d < 15 ? 2 : 3;
    const edge = d - [0, 2.5, 7, 15][t];
    if (t > 0 && edge < 2.2 && (x % 3 === 0) && hash(x, Math.floor(y / 3), 9) < 0.8) t--;
    if (ceilBot && t > 0 && hash(x, 0, 12) < 0.06 && y < ceilBot[x] + 12 + (hash(x, 1, 12) * 30)) t = Math.min(t, 1);
    pc.p(x, y, Bk[t]);
    pc.id[k] = 1;
  }
}

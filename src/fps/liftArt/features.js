// Each layer's own sights, drawn into its slab: tree roots and red-cap mushrooms in the Rootsoil,
// fossils, amber and rubber vines in the Clayworks, faceted crystal clusters and a geode in the
// Crystal Grotto, lava falls, ember cracks and a trestle bridge in the Magma Deep, icicles, a frozen
// waterfall and something big frozen in the ice in the Frost Vault, a giant's ribs and a broken arch
// in the Core. Plus the far things on the back wall (backFeatures).
import { INK, INK2, CREAM, LAMP, WATER, LAVA, WOOD, IRON, hash, mix, lump } from './kit.js';
import { ID, beam } from './props.js';
import { clamp } from '../../core/util.js';

export const ICE = [0x2c4a6e, 0x5a8cb0, 0x9cc8dc, 0xe4ecde];
const BARK = [0x3a2224, 0x6e4a32, 0x9c7450, 0xcaa474];
const BONE = [0x6a5444, 0xa89070, 0xd8c49a, 0xf4e6c4];
const CAP = [0x4a1420, 0x8e2a2a, 0xc04a36, 0xec8a5e];
const GLOWCAP = [0x1e3a5a, 0x2e7a9a, 0x6ec8d0, 0xd4f4e4];
const STONE = [0x2e2638, 0x5a5068, 0x8a809a, 0xc4bcc8];

/** A hexagonal crystal seen side-on: a lit facet, a shaded facet, a cream glint, a pointed tip. */
export function prism(pc, x, y, len, w, dir, lean, R, ink = INK) {
  const cur = pc.cur; pc.cur = ID.xtal;
  for (let j = 0; j < len; j++) {
    const t = j / len;
    const half = t < 0.72 ? w / 2 : (w / 2) * (1 - (t - 0.72) / 0.28);
    const cx = x + lean * j;
    const a = Math.round(cx - half), b = Math.round(cx + half);
    const yy = y + dir * j;
    for (let i = a; i <= b; i++) {
      const u = b === a ? 0.5 : (i - a) / (b - a);
      let c = u < 0.34 ? R[2] : u < 0.8 ? R[1] : R[0];
      if (i === b && b > a) c = ink;
      if (i === a && j % 5 !== 4) c = R[3];
      if (j === len - 1) c = R[3];
      pc.p(i, yy, c);
    }
  }
  pc.cur = cur;
}

function root(pc, x, y, w, len, R, ink, rng, A, depth = 0) {
  const cur = pc.cur; pc.cur = ID.root;
  let fx = x, dir = rng() < 0.5 ? -1 : 1;
  for (let j = 0; j < len; j++) {
    const t = j / len;
    const ww = Math.max(1, Math.round(w * (1 - t * 0.85)));
    if (rng() < 0.12) dir = -dir;
    fx += (rng() - 0.5) * 0.7 + dir * 0.28;
    const yy = y + j;
    const x0 = Math.round(fx - ww / 2);
    const inAir = A(x0, yy) === 1;
    for (let i = 0; i < ww; i++) {
      let c = ww === 1 ? (inAir ? R[2] : R[1]) : i === 0 ? R[2] : i === ww - 1 ? ink : R[1];
      if (ww > 3 && i === 1 && (yy & 3) === 0) c = R[3];
      if (ww > 2 && i === ww - 2 && hash(x0, yy, 3) < 0.3) c = R[0];
      pc.p(x0 + i, yy, c);
    }
    if (ww === 1 && j === len - 1) pc.p(x0, yy + 1, R[3]);
    if (ww >= 2 && depth < 2 && rng() < (depth ? 0.05 : 0.08)) root(pc, x0 + (dir > 0 ? ww : -1), yy, ww - 1, Math.round((len - j) * (0.35 + rng() * 0.3)), R, ink, rng, A, depth + 1);
    if (A(x0, yy) === 2 || A(x0, yy) === 3) break;
  }
  pc.cur = cur;
}

/** Red-cap mushrooms: big = 0..2. */
function redcap(pc, x, fy, big, flip) {
  const cur = pc.cur; pc.cur = ID.plant;
  const pal = { h: CAP[3], r: CAP[2], m: CAP[1], d: INK, w: CREAM, s: 0xe8d4ac, S: 0xa8906c, g: 0x6a3a30 };
  const S = [
    ['.hr.', 'hwrd', 'dggd', '.sS.'],
    ['..hr..', '.hwrrd', 'hrrwmd', 'dggggd', '..sS..', '..sS..'],
    ['...hhr...', '.hrwrrmd.', 'hrrrrwrmd', 'hwrrrrmmd', 'ddggggddd', '...sS....', '...sS....', '..ssSS...'],
  ][big];
  pc.stamp(x - (S[0].length >> 1), fy - S.length, S, pal, flip);
  pc.cur = cur;
}
function glowcap(pc, x, fy, h, anim) {
  const cur = pc.cur; pc.cur = ID.plant;
  for (let j = 1; j <= h; j++) { pc.p(x, fy - j, j === h ? 0xd4c8b0 : 0xb4a890); if (j < h - 1 && j % 2) pc.p(x + 1, fy - j, 0x7a6e5e); }
  pc.stamp(x - 2, fy - h - 3, ['.hh..', 'hmmmd', '.ddd.'], { h: GLOWCAP[3], m: GLOWCAP[2], d: GLOWCAP[0] });
  pc.cur = cur;
  anim.glows.push({ x, y: fy - h - 2, r: 5, c: 0x6ec8d0, f: 0.5, pulse: hash(x, fy, 1) });
}
function grass(pc, x, fy, M, n) {
  const cur = pc.cur; pc.cur = ID.plant;
  for (let k = 0; k < n; k++) {
    const xx = x + k * 2 + ((hash(x, k, 3) * 2) | 0), hh = 1 + ((hash(x, k, 4) * 4) | 0);
    for (let j = 1; j <= hh; j++) pc.p(xx + (j === hh && hash(xx, j, 5) < 0.5 ? 1 : 0), fy - j, j === hh ? M[3] : M[2]);
  }
  pc.cur = cur;
}

export function backFeatures(F) {
  const { pc, z, W, P, rng, A, floorTop, ceilBot } = F;
  const Bk = P.back;
  const onAir = (x, y, c) => { if (A(x, y) === 1) pc.p(x, y, c); };
  // far stalagmites and columns behind the hollow, in the back wall's own tones
  for (let k = 0; k < W / 18; k++) {
    const x = rng.int(2, W - 3), up = rng() < 0.5;
    const len = rng.int(4, up ? 14 : 18), w = rng.int(2, 5);
    const y0 = up ? floorTop[x] - 1 : ceilBot[x];
    for (let j = 0; j < len; j++) {
      const half = Math.round((w / 2) * (1 - j / len));
      for (let i = -half; i <= half; i++) onAir(x + i, up ? y0 - j : y0 + j, i === -half ? Bk[2] : Bk[0]);
    }
  }
  if (z === 1) for (let k = 0; k < W / 24; k++) { // root threads far back
    let x = rng.int(0, W - 1); const len = rng.int(6, 22);
    for (let j = 0; j < len; j++) { x += rng() < 0.2 ? rng.int(-1, 1) : 0; onAir(x, ceilBot[clamp(x, 0, W - 1)] + j, j === len - 1 ? Bk[3] : Bk[0]); }
  }
  if (z === 3) for (let k = 0; k < W / 16; k++) { // far crystals, muted
    const x = rng.int(4, W - 5), up = rng() < 0.6, len = rng.int(4, 11);
    const c = mix(rng() < 0.5 ? 0x52aab0 : 0x8e66b8, Bk[1], 0.55);
    const y0 = up ? floorTop[x] - 1 : ceilBot[x];
    for (let j = 0; j < len; j++) { const y = up ? y0 - j : y0 + j; onAir(x, y, j === len - 1 ? mix(c, CREAM, 0.4) : c); if (j < len - 2) onAir(x + 1, y, Bk[0]); }
  }
  if (z === 4) { // a far lava fall (earned glow) and the red light low in the hollow
    for (let k = 0; k < Math.max(1, W / 220); k++) {
      const x = rng.int(W * 0.25, W - 20);
      for (let y = ceilBot[x]; y < floorTop[x]; y++) { onAir(x, y, (y % 4) ? 0xb83a1e : 0xec7c2a); onAir(x + 1, y, 0x6e1a1e); }
    }
    for (let x = 0; x < W; x++) for (let y = ceilBot[x]; y < floorTop[x]; y++) {
      const d = floorTop[x] - y;
      if (A(x, y) !== 1) continue;
      if (d < 7 || (d < 14 && (x + y) % 3 === 0)) pc.b(x, y, 0x8a2a1a, d < 7 ? 0.45 : 0.3);
    }
  }
  if (z === 5) for (let k = 0; k < W / 30; k++) { // far ice columns
    const x = rng.int(4, W - 6);
    for (let y = ceilBot[x]; y < floorTop[x]; y++) { onAir(x, y, Bk[3]); onAir(x + 1, y, mix(Bk[3], CREAM, 0.3)); onAir(x + 2, y, Bk[1]); }
  }
  if (z === 6) for (let k = 0; k < W / 7; k++) { // a few far stars where the wall should be
    const x = rng.int(0, W - 1), y = rng.int(ceilBot[x], floorTop[x]);
    if (A(x, y) === 1 && F.dOpen[y * W + x] > 6) { pc.p(x, y, k % 5 ? 0x8a72b0 : CREAM); }
  }
}

export function zoneFeatures(F) {
  const { pc, z, W, H, P, rng, A, dRock, floorTop, ceilBot, pq, pockets, pools, anim, keep, nearStop, quietAt } = F;
  const ink = P.ink;
  const floorOK = (x) => !keep(x) && !pools.some((p) => x >= p.x0 - 2 && x <= p.x1 + 2) && A(x, floorTop[x]) === 0;
  const quietRock = (x, y, w, h) => { for (let j = -2; j < h + 2; j++) for (let i = -2; i < w + 2; i++) { if (A(x + i, y + j) !== 0 || !quietAt(x + i, y + j)) return false; } return dRock[y * W + x] > 3; };
  const placeQuiet = (w, h, tries = 60) => { for (let t = 0; t < tries; t++) { const x = rng.int(20, W - w - 4), y = rng.int(8, H - h - 4); if (quietRock(x, y, w, h)) return [x, y]; } return null; };

  // ---- pockets: geodes lined with crystal teeth, nests at the end of the crawlways
  for (const pk of pockets) {
    if (pk.kind === 'geode') {
      const X = P.xtal || [[0x1e0e2e, 0x3e2058, 0x6a44a0, 0xc8a8e8], [0x341c52, 0x5e3a8a, 0x8e66b8, 0xd8c4ec]];
      pc.cur = ID.xtal;
      for (let j = -pk.ry - 4; j <= pk.ry + 4; j++) for (let i = -pk.rx - 6; i <= pk.rx + 6; i++) {
        const x = pk.x + i, y = pk.y + j, k = y * W + x;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (A(x, y) === 0 && dRock[k] <= 1 && F.dOpen) pc.p(x, y, (x + y) % 3 ? P.seam[3] : P.seam[2]); // the pale rind
        else if (A(x, y) === 1) {
          const d = F.dOpen[k], R = X[(hash(x >> 1, y >> 1, 3) < 0.5) ? 0 : 1];
          pc.p(x, y, d <= 1 ? ((x + 2 * y) % 4 === 0 ? R[3] : R[2]) : d <= 2 ? ((x + y) & 1 ? R[1] : R[2]) : d <= 3 ? R[0] : ink);
        }
      }
      pc.cur = 0;
      anim.glints.push({ x: pk.x - 2, y: pk.y - 1, c: 0xe0d4ec, ph: rng() });
    } else if (pk.kind === 'nest') {
      // a bed of dry grass on the chamber floor, and whatever's living there
      let fy = pk.y; while (fy < H - 1 && A(pk.x, fy) === 1) fy++;
      pc.cur = ID.plant;
      for (let i = -4; i <= 4; i++) { const y = fy - 1 - (Math.abs(i) < 3 ? 1 : 0); if (A(pk.x + i, y) === 1) pc.p(pk.x + i, y, (i & 1) ? 0xc4a46a : 0x9a7a44); if (A(pk.x + i, fy - 1) === 1) pc.p(pk.x + i, fy - 1, 0x7a5a32); }
      if (z <= 2) pc.stamp(pk.x - 2, fy - 4, ['.h.h.', 'hwlwl'], { h: CREAM, w: 0xe6d6b4, l: 0xb4a080 }); // eggs
      else if (z >= 4) pc.stamp(pk.x - 3, fy - 3, ['h.....', 'lllllh', '.d..d.'], { h: BONE[3], l: BONE[2], d: BONE[1] }); // old bones
      pc.cur = 0;
    }
  }

  // ---- things that grow on any floor: moss and grass (the upper layers)
  if (z <= 2) {
    const M = P.moss;
    for (let x = 0; x < W; x++) {
      const y = floorTop[x];
      if (!floorOK(x) || hash(x >> 4, 0, z + 60) < 0.35) continue;
      pc.cur = ID.plant;
      pc.p(x, y, M[(x * 7) % 5 === 0 ? 3 : 2]); if (A(x, y + 1) === 0) pc.p(x, y + 1, M[1]);
      pc.cur = 0;
      if (hash(x, 1, 61) < 0.22) grass(pc, x, y, M, 1);
    }
  }

  if (z === 1) {
    // tree roots coming down from the meadow, through the rock and into the hollow
    for (let k = 0; k < Math.max(2, W / 160); k++) {
      const x = rng.int(pq.x1 + 10, W - 14);
      if (F.nearShaft(x, 14)) continue;
      root(pc, x, 0, rng.int(6, 8), rng.int(70, 120), BARK, ink, rng, A);
    }
    // rootlets hanging from the ceiling
    for (let k = 0; k < W / 22; k++) {
      let x = rng.int(4, W - 5);
      if (nearStop(x, 10)) continue;
      const len = rng.int(3, 14);
      pc.cur = ID.root;
      for (let j = 0; j < len; j++) { x += hash(x, j, 3) < 0.25 ? (hash(x, j, 4) < 0.5 ? -1 : 1) : 0; if (A(x, ceilBot[clamp(x, 0, W - 1)] + j) !== 1) break; pc.p(x, ceilBot[clamp(x, 0, W - 1)] + j, j === len - 1 ? BARK[3] : j < 2 ? BARK[1] : BARK[2]); }
      pc.cur = 0;
      if (k % 5 === 0) anim.drips.push({ x, y: ceilBot[clamp(x, 0, W - 1)] + len, ph: rng(), sp: 0.5 + rng() * 0.6 });
    }
    // buried: a bone, a little skull, an old clay pot, a worm's burrow
    let q = placeQuiet(9, 3);
    if (q) { pc.cur = ID.bone; pc.stamp(q[0], q[1], ['hl.....lh', '.mllllld.', 'hl.....ld', '.d.....d.'], { h: BONE[3], l: BONE[2], m: BONE[1], d: ink }); pc.cur = 0; }
    q = placeQuiet(7, 5);
    if (q) { pc.cur = ID.bone; pc.stamp(q[0], q[1], ['.hhhl..', 'hllllm.', 'le.llmd', '.llmdld', '..l.l.d'], { h: BONE[3], l: BONE[2], m: BONE[1], e: ink, d: ink }); pc.cur = 0; }
    q = placeQuiet(7, 7);
    if (q) { pc.cur = ID.fossil; pc.stamp(q[0], q[1], ['.hlll..', '..lm...', '.hllmd.', 'hlmmmmd', 'lwmwmmd', '.lmmmd.', '..ddd..'], { h: 0xe6a070, l: 0xc0784a, m: 0x8e4e32, w: 0xe8d4ac, d: ink }); pc.cur = 0; }
    q = placeQuiet(30, 10);
    if (q) {
      let [x, y] = q;
      for (let j = 0; j < 26; j++) { pc.p(x, y, P.back[1]); pc.p(x, y + 1, P.back[0]); pc.p(x, y + 2, ink); x++; if (hash(x, y, 5) < 0.3) y += hash(x, y, 6) < 0.5 ? -1 : 1; }
      pc.stamp(x, y - 2, ['.bbb.', 'b...b', 'b.wwbb', '.bbb.'], { b: P.back[0], w: 0xd08a8a });
      pc.stamp(x + 1, y, ['ppw', '.pp'], { p: 0xc87a7a, w: 0xe8b0a0 });
    }
    // red caps and blue glowcaps by the walls
    for (let k = 0; k < Math.max(3, W / 80); k++) { const x = rng.int(STAFFX, W - 8); if (floorOK(x)) redcap(pc, x, floorTop[x], rng.int(0, 2), rng() < 0.5); }
    for (let k = 0; k < 2; k++) { const x = rng.int(W * 0.5, W - 10); if (floorOK(x) && floorOK(x + 3)) { glowcap(pc, x, floorTop[x], 3, anim); glowcap(pc, x + 3, floorTop[x + 3], 5, anim); anim.spores.push({ x: x + 2, y: floorTop[x] - 8 }); } }
  }

  if (z === 2) {
    // fossils in the quiet clay: an ammonite, a fish, a fern, amber with a bug in it
    const fos = [
      [['..0000...', '.0hlll00.', '0hl000lm0', '0l0hl00m0', '0l0l0lml0', '0m00lmm0.', '.0mmm00..', '..000....'], { 0: ink, h: BONE[3], l: BONE[2], m: BONE[1] }],
      [['...l.l.l.l...', 'l..l.l.l.l.00.', 'llllllllllll0e0', 'l..l.l.l.l.00.', '...l.l.l.l...'], { l: BONE[2], 0: BONE[1], e: ink }],
      [['....l..', '.l.l.l.', '..lll..', 'l.lll.l', '.l.l.l.', '...l...', '...l...'], { l: mix(BONE[1], 0x8a3a2c, 0.4) }],
      [['.hll.', 'hlmmd', 'lmbmd', 'lmmmd', '.ddd.'], { h: 0xfce08a, l: 0xf0a82a, m: 0xc8701a, b: INK2, d: ink }],
    ];
    for (let k = 0; k < fos.length + (W > 420 ? 1 : 0); k++) {
      const [rows, pal] = fos[k % fos.length];
      const q = placeQuiet(rows[0].length + 1, rows.length);
      if (!q) continue;
      pc.cur = ID.fossil; pc.stamp(q[0], q[1], rows, pal, hash(k, 3, 9) < 0.5); pc.cur = 0;
      if (k === 3) anim.glints.push({ x: q[0] + 1, y: q[1] + 1, c: 0xfce08a, ph: rng() });
    }
    // lumite veins: thin green threads
    for (let k = 0; k < Math.max(2, W / 150); k++) {
      const q = placeQuiet(4, 12); if (!q) continue;
      let [x, y] = q;
      pc.cur = ID.ore;
      for (let j = 0; j < 14; j++) { if (A(x, y) !== 0) break; pc.p(x, y, j % 4 === 0 ? 0xa8e0a0 : 0x4a9a5a); pc.p(x + 1, y, 0x2a4a32); x += hash(x, y, 7) < 0.4 ? 1 : 0; y++; }
      pc.cur = 0;
    }
    // rubber vines hanging into the hollow
    for (let k = 0; k < W / 40; k++) {
      let x = rng.int(10, W - 10); if (nearStop(x, 12) || F.nearShaft(x, 9)) continue;
      const len = rng.int(10, 30), top = ceilBot[x];
      pc.cur = ID.plant;
      for (let j = 0; j < len; j++) {
        const y = top + j; if (A(x, y) !== 1) break;
        pc.p(x, y, P.moss[1]); pc.p(x + 1, y, ink);
        if (j % 4 === 2) { const s = (j >> 2) & 1 ? -1 : 1; pc.p(x + s, y, P.moss[3]); pc.p(x + 2 * s, y + 1, P.moss[2]); }
        if (j % 9 === 8) x += hash(x, j, 2) < 0.5 ? 1 : 0;
      }
      pc.cur = 0;
    }
    // a seep down the wall into the pool
    const pl = pools.find((p) => p.kind === 2);
    if (pl) { const x = Math.round(pl.x0 + (pl.x1 - pl.x0) * 0.3); anim.falls.push({ x, y0: ceilBot[x], y1: pl.level, kind: 'water' }); }
  }

  if (z === 3) {
    const X = P.xtal;
    // crystal clusters on the floor and from the ceiling
    for (let k = 0; k < Math.max(5, W / 60); k++) {
      const x = rng.int(STAFFX + 6, W - 10), up = rng() < 0.6;
      if (keep(x) || (up && !floorOK(x))) continue;
      const R = X[k % 2], n = rng.int(2, 4);
      const base = up ? floorTop[x] : ceilBot[x];
      for (let m = 0; m < n; m++) {
        const xx = x + (m - (n >> 1)) * 4 + rng.int(-1, 1);
        const len = Math.round(rng.int(6, up ? 18 : 12) * (m === (n >> 1) ? 1.25 : 0.85));
        prism(pc, xx, (up ? floorTop[clamp(xx, 0, W - 1)] : ceilBot[clamp(xx, 0, W - 1)]) + (up ? 0 : -1), len, rng.int(3, 5), up ? -1 : 1, (m - (n - 1) / 2) * 0.12 + rng.range(-0.05, 0.05), R, ink);
      }
      anim.glints.push({ x: x - 1, y: up ? base - 10 : base + 6, c: R[3], ph: rng() });
      if (k % 2 === 0) anim.glows.push({ x, y: up ? base - 6 : base + 4, r: 6, c: R[2], f: 0.35, pulse: rng(), light: 18 });
    }
    // quartz veins
    for (let k = 0; k < Math.max(2, W / 160); k++) {
      const q = placeQuiet(20, 6); if (!q) continue;
      let [x, y] = q;
      for (let j = 0; j < 26; j++) { if (A(x, y) !== 0 || !quietAt(x, y)) break; pc.p(x, y, P.seam[3]); pc.p(x, y + 1, P.seam[1]); x++; if (hash(x, y, 8) < 0.25) y += hash(x, y, 9) < 0.5 ? -1 : 1; }
    }
    // glowcaps and a spider's thread
    for (let k = 0; k < 3; k++) { const x = rng.int(STAFFX + 4, W - 10); if (floorOK(x) && floorOK(x + 3)) { glowcap(pc, x, floorTop[x], 4, anim); glowcap(pc, x + 3, floorTop[x + 3], 2, anim); anim.spores.push({ x: x + 2, y: floorTop[x] - 8 }); } }
  }

  if (z === 4) {
    // ember cracks in the rock round the lava
    for (const pl of pools) for (let k = 0; k < (pl.x1 - pl.x0) / 14; k++) {
      let x = rng.int(pl.x0, pl.x1), y = pl.level + 2;
      while (y < H - 2 && A(x, y) !== 0) y++;
      for (let j = 0; j < rng.int(4, 9); j++) { if (A(x, y) !== 0) break; pc.p(x, y, j < 3 ? LAVA[3] : LAVA[1]); pc.p(x + 1, y, INK); y++; x += hash(x, y, 4) < 0.35 ? (hash(x, y, 5) < 0.5 ? -1 : 1) : 0; }
    }
    // a lava fall from a crack in the ceiling into the river
    const pl = pools.slice().sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
    if (pl) {
      const x = Math.round(pl.x0 + (pl.x1 - pl.x0) * 0.7);
      anim.falls.push({ x, y0: ceilBot[x], y1: pl.level, kind: 'lava' });
      for (let i = -3; i <= 3; i++) pc.p(x + i, ceilBot[x] - 1, Math.abs(i) < 2 ? LAVA[3] : LAVA[1]);
      anim.glows.push({ x, y: pl.level - 2, r: 8, c: 0xec7c2a, f: 0.6, light: 30 });
      // an old trestle bridge over the river's other end
      const bx0 = pl.x0 - 2, bx1 = Math.min(pl.x1 + 2, Math.round(pl.x0 + (pl.x1 - pl.x0) * 0.55));
      if (bx1 - bx0 > 20) {
        const dy = pl.level - 1;
        pc.cur = ID.support;
        for (let x2 = bx0; x2 <= bx1; x2++) { pc.p(x2, dy, (x2 - bx0) % 4 === 0 ? WOOD[3] : WOOD[2]); pc.p(x2, dy + 1, WOOD[0]); pc.p(x2, dy + 2, INK); floorTop[x2] = dy; }
        for (let x2 = bx0 + 6; x2 < bx1 - 3; x2 += 9) { beam(pc, x2, dy + 3, 2, 9, WOOD, true); pc.p(x2 - 1, dy + 4, WOOD[1]); pc.p(x2 + 2, dy + 4, WOOD[0]); }
        for (let x2 = bx0; x2 <= bx1; x2++) { pc.p(x2, dy - 1, IRON[3]); pc.p(x2, dy - 2, (x2 & 3) ? IRON[2] : IRON[1]); }
        pc.cur = 0;
      }
    }
    // obsidian shards on the banks
    for (let k = 0; k < W / 70; k++) {
      const x = rng.int(STAFFX, W - 8); if (!floorOK(x)) continue;
      prism(pc, x, floorTop[x], rng.int(4, 9), 3, -1, rng.range(-0.2, 0.2), P.mats[2], ink);
    }
  }

  if (z === 5) {
    // icicles all along the ceiling
    for (let k = 0; k < W / 5; k++) {
      const x = rng.int(2, W - 3); if (nearStop(x, 9) || F.nearShaft(x, 8)) continue;
      const len = rng.int(3, 15), top = ceilBot[x];
      pc.cur = ID.ice;
      for (let j = 0; j < len; j++) { if (A(x, top + j) !== 1) break; pc.p(x, top + j, j === len - 1 ? CREAM : j < len * 0.5 ? ICE[2] : ICE[3]); if (j < len * 0.45) pc.p(x + 1, top + j, ICE[1]); }
      pc.cur = 0;
      if (rng() < 0.18) anim.drips.push({ x, y: top + len, ph: rng(), sp: 0.4 + rng() * 0.4, ice: true });
    }
    // snow drifts on the floor
    for (let x = 0; x < W; x++) {
      if (!floorOK(x)) continue;
      const y = floorTop[x], hh = Math.max(0, Math.round(1.6 + Math.sin(x * 0.09 + 1) * 1.4 + hash(x >> 3, 0, 51)));
      pc.cur = ID.ice;
      for (let j = 0; j < hh; j++) if (A(x, y - 1 - j) === 1) pc.p(x, y - 1 - j, j === hh - 1 ? CREAM : 0xd4dcd4);
      pc.cur = 0;
    }
    // a frozen waterfall
    for (let t = 0; t < 20; t++) {
      const x = rng.int(W * 0.3, W - 20);
      if (keep(x) || floorTop[x] - ceilBot[x] < 30) continue;
      pc.cur = ID.ice;
      for (let y = ceilBot[x] - 1; y < floorTop[x]; y++) {
        const w = 3 + Math.round(Math.abs(Math.sin(y * 0.21)) * 2 + (y > floorTop[x] - 8 ? (y - floorTop[x] + 8) * 0.6 : 0));
        for (let i = -w; i <= w; i++) pc.p(x + i, y, i === -w ? ICE[3] : i === w ? ink : i < 0 ? ICE[2] : (y % 6 === 0 ? ICE[2] : ICE[1]));
      }
      pc.cur = 0;
      break;
    }
    // something big frozen in an ice lens
    const q = placeQuiet(30, 18);
    if (q) {
      const [x, y] = q;
      pc.cur = ID.ice;
      for (let j = 0; j < 18; j++) for (let i = 0; i < 30; i++) {
        const u = (i - 14.5) / 15, v = (j - 8.5) / 9;
        if (u * u + v * v > 1 + (hash(i, j, 3) - 0.5) * 0.12) continue;
        const e = u * u + v * v > 0.8;
        pc.p(x + i, y + j, e ? (u + v > 0 ? ink : CREAM) : (i + j * 2) % 9 === 0 ? ICE[3] : ICE[2]);
      }
      pc.stamp(x + 4, y + 3, [
        '......aaaaa.........',
        '....aaaaaaaaa.......',
        '...aaaaaaaaaaaa.....',
        '..aaaaaaaaaaaaaaa...',
        '.aaaaaaaaaaaaaaaaa..',
        '.aaaaaaaaaaaaaaaeat.',
        'aaaaaaaaaaaaaaaaaa.t',
        'aaaaaaaaaaaaaaaa.a.t',
        '.aa.aaa..aaa.aa..a..',
        '.aa.aaa..aaa.aa..a..',
        '.aa..aa...aa..a.....',
      ], { a: ICE[0], e: ICE[2], t: CREAM });
      pc.cur = 0;
      anim.glints.push({ x: x + 6, y: y + 3, c: CREAM, ph: rng() });
    }
  }

  if (z === 6) {
    // starmetal veins (gold, earned)
    for (let k = 0; k < Math.max(2, W / 140); k++) {
      const q = placeQuiet(6, 20); if (!q) continue;
      let [x, y] = q;
      pc.cur = ID.ore;
      for (let j = 0; j < 22; j++) { if (A(x, y) !== 0) break; pc.p(x, y, j % 5 === 0 ? 0xf0d488 : 0xb88a3a); pc.p(x + 1, y, 0x6a4a1e); y++; x += hash(x, y, 2) < 0.4 ? (hash(x, y, 3) < 0.5 ? -1 : 1) : 0; }
      pc.cur = 0;
      anim.glints.push({ x: q[0], y: q[1] + 2, c: 0xf0d488, ph: rng() });
    }
    // voidstone clusters
    for (let k = 0; k < W / 90; k++) {
      const x = rng.int(STAFFX + 6, W - 10); if (!floorOK(x)) continue;
      for (let m = 0; m < 3; m++) prism(pc, x + m * 4 - 4, floorTop[clamp(x + m * 4 - 4, 0, W - 1)], rng.int(5, m === 1 ? 14 : 9), 3, -1, (m - 1) * 0.15, [0x1e0e2e, 0x3e2058, 0x6a44a0, 0xc8a8e8], ink);
    }
    // a giant's ribs in the rock
    const q = placeQuiet(46, 20);
    if (q) {
      const [x, y] = q;
      pc.cur = ID.bone;
      for (let i = 0; i < 46; i++) { pc.p(x + i, y + 2, BONE[2]); pc.p(x + i, y + 3, BONE[1]); pc.p(x + i, y + 4, ink); }
      for (let r = 0; r < 6; r++) {
        const rx = x + 4 + r * 7;
        for (let j = 0; j < 16 - Math.abs(r - 2) * 2; j++) { const xx = rx + Math.round(Math.sin(j / 16 * Math.PI * 0.8) * 4); pc.p(xx, y + 5 + j, BONE[2]); pc.p(xx + 1, y + 5 + j, BONE[1]); pc.p(xx + 2, y + 5 + j, ink); }
      }
      pc.cur = 0;
    }
    // a broken arch on the floor, carved stone
    for (let t = 0; t < 20; t++) {
      const x = rng.int(W * 0.35, W - 30);
      let ok = true; for (let i = 0; i < 24; i++) if (!floorOK(x + i)) ok = false;
      if (!ok || floorTop[x] - ceilBot[x] < 34) continue;
      const fy = floorTop[x];
      pc.cur = ID.ruin;
      for (const [px, h] of [[0, 22], [18, 13]]) {
        for (let j = 0; j < h; j++) for (let i = 0; i < 5; i++) pc.p(x + px + i, fy - 1 - j, i === 0 ? STONE[2] : i === 4 ? ink : j % 6 === 0 ? STONE[0] : STONE[1]);
        pc.p(x + px + 1, fy - h, STONE[3]);
      }
      for (let i = -1; i < 14; i++) { pc.p(x + i, fy - 23, STONE[2]); pc.p(x + i, fy - 24, STONE[3]); pc.p(x + i, fy - 22, i % 4 === 1 ? STONE[0] : STONE[1]); pc.p(x + i, fy - 21, ink); }
      lump(pc, x + 9, fy - 4, 6, 3, STONE, 7, ink);
      pc.cur = 0;
      break;
    }
    // floating rocks in the hollow
    for (let k = 0; k < Math.max(2, W / 120); k++) {
      const x = rng.int(pq.x1 + 10, W - 16);
      if (floorTop[x] - ceilBot[x] < 34 || keep(x)) continue;
      anim.floaters.push({ x, y: Math.round((ceilBot[x] + floorTop[x]) / 2) - 4 + rng.int(-5, 5), w: rng.int(2, 4), ph: rng() });
    }
  }
}
const STAFFX = 20;

// 32×32 icons: tools (picks per tier, chisels, brushes, drills, x-ray lamps, supplies),
// equipment (helmets, gloves, suits, boots, bags), forged weapons and UI glyphs.
import { mat, mix } from './color.js';
import { vol, fill, sparkle, hash2, vnoise, glowHalo } from './shade.js';
import { M, ring, lineIn, grain, darkOf } from './parts.js';

const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };
const WOOD = () => mat(0x9a6a3a, { cont: 1.05 });
const DWOOD = () => mat(0x6a4426, { cont: 1.05 });
const LEATHER = () => mat(0x7a4a2a, { cont: 1.05 });

// ---------------------------------------------------------------- shared shapes
/**
 * Paint a straight round shaft (handle) between two points with cylinder shading and grain.
 * Returns its mask.
 */
export function shaft(pc, x0, y0, x1, y1, r, R, o = {}) {
  const m = M().capsule(x0, y0, x1, y1, r);
  if (o.clip) m.sub(o.clip);
  if (o.ring !== false) ring(pc, m, R);
  vol(pc, m, R, { mode: 'cyl', axis: Math.atan2(y1 - y0, x1 - x0), spec: o.spec });
  if (o.grain !== false) {
    const ax = x1 - x0, ay = y1 - y0, L = Math.hypot(ax, ay) || 1;
    m.each((x, y) => {
      const u = ((x + 0.5 - x0) * ax + (y + 0.5 - y0) * ay) / L;
      const v = (-(x + 0.5 - x0) * ay + (y + 0.5 - y0) * ax) / L;
      const k = R.indexOf(pc.getHex(x, y));
      if (k > 1 && k < 5 && vnoise(u * 0.25, v * 1.6, o.seed || 3) > 0.68) pc.set(x, y, R[k + 1]);
    });
  }
  return m;
}

/** Wrap bands across a shaft (grip tape / twine / leather) between t0..t1 of the segment. */
function wrap(pc, x0, y0, x1, y1, r, t0, t1, R, step = 2) {
  const ax = x1 - x0, ay = y1 - y0, L = Math.hypot(ax, ay);
  const m = M().capsule(x0 + ax * t0, y0 + ay * t0, x0 + ax * t1, y0 + ay * t1, r + 0.35);
  ring(pc, m, R);
  vol(pc, m, R, { mode: 'cyl', axis: Math.atan2(ay, ax) });
  m.each((x, y) => {
    const u = ((x + 0.5 - x0) * ax + (y + 0.5 - y0) * ay) / L;
    const v = (-(x + 0.5 - x0) * ay + (y + 0.5 - y0) * ax) / L;
    if (((u + v * 0.9) % step + step) % step < 0.8) { const k = R.indexOf(pc.getHex(x, y)); if (k >= 0 && k < 5) pc.set(x, y, R[k + 1]); }
  });
  return m;
}

/** Metal band (ferrule/collar) across a shaft at parameter t. */
function band(pc, x0, y0, x1, y1, r, t, w, R, grow = 0.7) {
  const ax = x1 - x0, ay = y1 - y0;
  const cx = x0 + ax * t, cy = y0 + ay * t, L = Math.hypot(ax, ay);
  const ux = ax / L, uy = ay / L;
  const m = M().capsule(cx - ux * w / 2, cy - uy * w / 2, cx + ux * w / 2, cy + uy * w / 2, r + grow);
  ring(pc, m, R);
  vol(pc, m, R, { mode: 'cyl', axis: Math.atan2(ay, ax), spec: 0.85 });
  return m;
}

/** Points along a (possibly curved) spine with a width profile → mask; spine(s) and wid(s) for s in [0,1]. */
function sweep(spine, wid, n = 60) {
  const m = M();
  for (let i = 0; i <= n; i++) { const s = i / n; const [x, y] = spine(s); m.disk(x, y, Math.max(0.35, wid(s))); }
  return m;
}

// ---------------------------------------------------------------- pickaxes
const PICK_TIER = {
  pick_rusty: { head: 0x7a6c62, cont: 0.95, rust: true, handle: 'old', wrap: 0xb89a6a },
  pick_copper: { head: 0xd4703a, cont: 1.15, handle: 'plain' },
  pick_iron: { head: 0x868c96, cont: 1.1, handle: 'plain', wrap: 0x6a4428 },
  pick_steel: { head: 0xa8b8c8, cont: 1.35, handle: 'dark', wrap: 0x5a3420, collar: 0xc8a050 },
  pick_mithril: { head: 0x9ce0e6, cont: 1.3, handle: 'dark', wrap: 0x2a3a5a, collar: 0xe0b848, engrave: true },
  pick_adamant: { head: 0x34c88c, cont: 1.35, handle: 'dark', wrap: 0x3a1a3a, collar: 0xf0c848, gem: 0xe02a5a, engrave: true },
};

function pickaxe(pc, id, spec) {
  const T = PICK_TIER[id] || { head: spec.c || 0x9aa0a8, cont: 1, handle: 'plain' };
  const HR = T.handle === 'dark' ? DWOOD() : T.handle === 'old' ? mat(0x86603e, { cont: 0.9 }) : WOOD();
  // handle: bottom-left to the head
  const hx0 = 5, hy0 = 28, hx1 = 20.5, hy1 = 11.5;
  shaft(pc, hx0, hy0, hx1 + 2, hy1 - 2, 1.6, HR, { seed: 7 });
  if (T.wrap) wrap(pc, hx0, hy0, hx1, hy1, 1.6, 0.04, 0.3, mat(T.wrap, { cont: 0.95 }), 2.2);
  pc.set(hx0 - 1, hy0, HR[5]);
  // head: curved crescent perpendicular to the handle
  const R = mat(T.head, { cont: T.cont, hs: 1.1 });
  const ux = 0.7071, uy = 0.7071, vx = -0.7071, vy = 0.7071; // across the handle, and down the handle
  const H = [21, 11];
  const spine = (s) => { const t = -12.5 + s * 23.5; return [H[0] + ux * t + vx * 0.045 * t * t, H[1] + uy * t + vy * 0.045 * t * t]; };
  const wid = (s) => { const t = -12.5 + s * 23.5; const e = Math.abs(t) / (t < 0 ? 12.5 : 11); return 0.5 + 2.4 * Math.pow(1 - e, 0.7); };
  const head = sweep(spine, wid);
  ring(pc, head, R);
  vol(pc, head, R, { round: 2.2, spec: T.rust ? false : 0.8 });
  // sharpened lower edge darker, upper ridge lit
  head.each((x, y) => {
    if (!head.get(x, y + 1) && head.get(x, y - 1)) { const k = R.indexOf(pc.getHex(x, y)); if (k >= 0 && k < 5) pc.set(x, y, R[k + 1]); }
  });
  for (let i = 0; i <= 40; i++) { const s = i / 40; if (s > 0.08 && s < 0.92 && Math.abs(s - 0.53) > 0.07) { const [x, y] = spine(s); const w = wid(s); pc.set(x - 0.5 - w * 0.45, y - 0.5 - w * 0.45, R[1]); } }
  if (T.rust) {
    const RU = mat(0xb8662a, { cont: 0.95 });
    head.each((x, y) => {
      const n = vnoise(x * 0.45, y * 0.45, 4);
      if (n > 0.48 && hash2(x, y, 2) < 0.85) { const k = R.indexOf(pc.getHex(x, y)); if (k > 0) pc.set(x, y, RU[Math.min(5, k)]); }
      if (hash2(x, y, 9) < 0.08) pc.set(x, y, R[5]);
    });
    // chipped tip
    const [cx, cy] = spine(0.02); pc.clear(cx, cy);
  }
  // socket collar around the handle
  const CR = mat(T.collar || T.head, { cont: 1.1 });
  const col = M().oval(H[0], H[1], 2.6, 3.4, -Math.PI / 4);
  ring(pc, col, CR);
  vol(pc, col, CR, { round: 1.5, spec: 0.8 });
  pc.set(H[0] - 1, H[1] - 1, CR[1]);
  if (T.engrave) {
    for (let i = 0; i <= 30; i++) { const s = 0.12 + i / 30 * 0.32; const [x, y] = spine(s); if (i % 2 === 0) pc.set(x + 0.3, y + 0.3, R[4]); }
    for (let i = 0; i <= 24; i++) { const s = 0.62 + i / 24 * 0.26; const [x, y] = spine(s); if (i % 2 === 0) pc.set(x + 0.3, y + 0.3, R[4]); }
  }
  if (T.gem) {
    const GR = mat(T.gem, { cont: 1.2 });
    const g = M().disk(H[0], H[1], 1.6);
    fill(pc, g, GR[3]); pc.set(H[0] - 1, H[1] - 1, GR[0]); pc.set(H[0], H[1], GR[4]);
  }
  if (!T.rust) { const [x, y] = spine(0.3); sparkle(pc, x - 1, y - 2, 1, 0xffffff, R[0]); }
}

// ---------------------------------------------------------------- chisel / brush
/** Map (u along the bottom-left→top-right diagonal, v across) to canvas coords. */
const diag = (u, v = 0, x0 = 4, y0 = 28) => [x0 + (u + v) * 0.7071, y0 + (-u + v) * 0.7071];
/** Polygon from a centerline profile along the diagonal: [[u, halfWidth], ...]. */
function diagPoly(profile, x0, y0) {
  const left = profile.map(([u, w]) => diag(u, -w, x0, y0));
  const right = profile.map(([u, w]) => diag(u, w, x0, y0)).reverse();
  return M().poly([...left, ...right]);
}

function chisel(pc, id) {
  const fine = id === 'chisel_fine';
  const HR = fine ? DWOOD() : WOOD();
  const R = mat(fine ? 0x9ce0e6 : 0xa8aeb8, { cont: 1.3 });
  const [hx0, hy0] = diag(1.5), [hx1, hy1] = diag(12.5);
  shaft(pc, hx0, hy0, hx1, hy1, fine ? 2.1 : 2.4, HR, { seed: 5 });
  // steel shank widening into a flat blade with a square cutting edge
  const steel = diagPoly(fine ? [[12, 1.1], [24, 1.1], [27, 1.5], [33.5, 1.5]] : [[12, 1.3], [23, 1.3], [26, 2.0], [33, 2.0]]);
  ring(pc, steel, R);
  vol(pc, steel, R, { mode: 'cyl', axis: -Math.PI / 4, flat: 0.55, spec: 0.85 });
  // bevel at the tip: last few pixels bright, edge line brightest
  steel.each((x, y) => {
    const u = ((x + 0.5 - 4) - (y + 0.5 - 28)) * 0.7071;
    if (u > (fine ? 31 : 30.5)) pc.set(x, y, R[u > (fine ? 32.6 : 32.1) ? 0 : 1]);
  });
  band(pc, hx0, hy0, hx1, hy1, fine ? 2.1 : 2.4, 0.97, 0.6, mat(fine ? 0xe0b040 : 0x8a8a92, { cont: 1.2 }), 0.25);
  const cap = M().disk(hx0 - 0.4, hy0 + 0.4, fine ? 2.0 : 2.3);
  const CR = mat(0x6a6a74, { cont: 1.1 });
  ring(pc, cap, CR); vol(pc, cap, CR, { round: 1.5 });
  const [gx, gy] = diag(22, -1.6);
  sparkle(pc, gx, gy, 1, 0xffffff, R[0]);
}

function brush(pc, id) {
  const badger = id === 'brush_badger';
  const HR = badger ? DWOOD() : mat(0xc8904e, { cont: 1 });
  const [hx0, hy0] = diag(0), [hx1, hy1] = diag(15);
  shaft(pc, hx0, hy0, hx1, hy1, 1.8, HR, { seed: 11 });
  const hole = M().disk(hx0 + 1.4, hy0 - 1.4, 0.7); fill(pc, hole, HR[6]);
  // bristle fan: flares out and ends flat
  const tuft = diagPoly([[17.5, 2.2], [22, 3.4], [28, 4.6], [31.5, 4.8], [32.5, 4.2]]);
  const BR = badger ? mat(0x7a7470, { cont: 1.15 }) : mat(0xd8b070, { cont: 1.05 });
  ring(pc, tuft, BR);
  vol(pc, tuft, BR, { mode: 'cyl', axis: -Math.PI / 4, flat: 0.3 });
  tuft.each((x, y) => {
    const u = ((x + 0.5 - 4) - (y + 0.5 - 28)) * 0.7071, v = ((x + 0.5 - 4) + (y + 0.5 - 28)) * 0.7071;
    const k = BR.indexOf(pc.getHex(x, y));
    if (k < 0) return;
    if (((v * 1.6) % 2 + 2) % 2 < 0.8 && k < 5) pc.set(x, y, BR[k + 1]);
    if (badger) {
      if (u > 28.5) pc.set(x, y, mix(0xf6f2ea, BR[k], 0.25));
      else if (u > 24 && u < 27) pc.set(x, y, mix(0x241e22, BR[k], 0.3));
    } else if (u > 29 && k > 1) pc.set(x, y, BR[k - 1]);
  });
  band(pc, hx0, hy0, hx1 + 3, hy1 - 3, 1.9, 0.92, 3.6, mat(badger ? 0xc8a050 : 0xa8acb4, { cont: 1.25 }));
}

// ---------------------------------------------------------------- drills & lamps
function drill(pc, id) {
  const lum = id === 'drill_lumite';
  const BR = lum ? mat(0x9aa8b8, { cont: 1.25 }) : mat(0xc8963a, { cont: 1.2, warm: 50 });
  const BIT = mat(lum ? 0xb8c8d8 : 0x8a8f98, { cont: 1.35 });
  // spiral bit pointing right
  const bit = M().poly([[19, 12.5], [30, 16], [19, 19.5]]);
  ring(pc, bit, BIT);
  vol(pc, bit, BIT, { mode: 'cyl', axis: 0, spec: 0.8 });
  bit.each((x, y) => { if (((x * 1.0 + y * 0.9) % 3.2 + 3.2) % 3.2 < 1) { const k = BIT.indexOf(pc.getHex(x, y)); if (k >= 0 && k < 5) pc.set(x, y, BIT[k + 1]); } });
  // body: horizontal cylinder with end caps
  const body = M().rect(5, 10, 15, 12);
  body.ellipse(5.5, 16, 2.5, 6).ellipse(19.5, 16, 1.5, 6);
  ring(pc, body, BR);
  vol(pc, body, BR, { mode: 'cyl', axis: 0, spec: 0.75 });
  // rings / rivets
  for (const x of [8, 15]) for (let y = 10; y < 22; y++) if (body.get(x, y)) { const k = BR.indexOf(pc.getHex(x, y)); if (k >= 0 && k < 5) pc.set(x, y, BR[Math.min(5, k + 1)]); }
  for (const [x, y] of [[10, 11], [13, 11], [10, 20], [13, 20]]) { pc.set(x, y, BR[1]); pc.set(x, y + 1, BR[4]); }
  // grip handle below
  const HR = LEATHER();
  const grip = M().poly([[8, 21], [12, 21], [10.5, 29], [6.5, 29]]);
  ring(pc, grip, HR);
  vol(pc, grip, HR, { mode: 'cyl', axis: Math.PI / 2 + 0.2 });
  for (let y = 22; y < 29; y += 2) for (let x = 6; x < 13; x++) if (grip.get(x, y)) pc.set(x, y, HR[4]);
  if (lum) {
    // glowing lumite core window
    const win = M().ellipse(11.5, 15.5, 3.2, 3);
    const LR = mat(0x7bf08a, { cont: 1 });
    ring(pc, win, BR, { lit: BR[5] });
    vol(pc, win, LR, { emit: 0.9 });
    gl(pc, 10, 14, 0xeaffea);
    for (const [x, y] of [[3, 13], [2, 18], [24, 7]]) gl(pc, x, y, 0xb8ffb8, 0.8);
  } else {
    // pressure gauge + steam puffs
    const g = M().disk(11.5, 8.5, 3);
    ring(pc, g, mat(0x5a4020));
    fill(pc, g, 0xf0e8d0);
    pc.set(11, 8, 0x2a1a10); pc.set(12, 7, 0xc83a2a); pc.set(13, 6, 0xc83a2a);
    const ST = 0xf4f0ec;
    for (const [x, y, r] of [[3.5, 7, 1.6], [5.5, 4.5, 1.2], [2.5, 3, 0.9]]) M().disk(x, y, r).each((X, Y) => pc.set(X, Y, ST, 200));
  }
}

function xrayLamp(pc, id) {
  const prism = id === 'xray_prism';
  const beamC = prism ? 0xe0a8ff : 0x7fe7ff;
  // beam cone to the top-right (translucent)
  const cone = M().poly([[18, 11], [31, 0], [31, 9], [21, 14]]);
  cone.each((x, y) => { const t = (x - 18) / 13; pc.set(x, y, prism ? [0xff9ad0, 0xffe08a, 0x9affd0, 0x9ad0ff, 0xd0a0ff][Math.floor((y + x * 0.4) / 2.2) % 5] : beamC, Math.round(150 - t * 80)); pc.emit(x, y, 0.5); });
  // handle
  const HR = DWOOD();
  shaft(pc, 6, 29, 11, 20, 2, HR, { seed: 4 });
  // lamp housing: brass cylinder angled to the top-right
  const R = mat(prism ? 0x8a7ab0 : 0xc89a40, { cont: 1.2 });
  const body = M().capsule(9, 21, 17, 13, 4.2);
  ring(pc, body, R);
  vol(pc, body, R, { mode: 'cyl', axis: -Math.PI / 4, spec: 0.8 });
  // lens
  const LR = mat(beamC, { cont: 1 });
  const lens = M().oval(18, 12, 2.2, 4.6, -Math.PI / 4);
  ring(pc, lens, R, { lit: R[5] });
  vol(pc, lens, LR, { emit: 0.9 });
  gl(pc, 17, 10, 0xffffff);
  // vents
  for (const t of [0.35, 0.55]) { const x = 9 + 8 * t, y = 21 - 8 * t; lineIn(pc, x - 2.4, y - 2.4, x + 2.4, y + 2.4, R[4], body); }
  if (prism) { const p = M().poly([[12, 13], [15, 16], [12, 17]]); fill(pc, p, 0xf0e0ff); pc.set(12, 14, 0xffffff); }
}

function beamIcon(pc) {
  const R = WOOD();
  const post = M().rect(13, 9, 6, 21);
  ring(pc, post, R);
  vol(pc, post, R, { mode: 'cyl', axis: Math.PI / 2, flat: 0.5 });
  grain(pc, post, R, { vertical: true, seed: 3 });
  const cap = M().rect(4, 5, 24, 5);
  ring(pc, cap, R);
  vol(pc, cap, R, { mode: 'cyl', axis: 0, flat: 0.5 });
  grain(pc, cap, R, { vertical: false, seed: 8 });
  // end grain + iron brackets + nails
  for (const x of [4, 27]) for (let y = 5; y < 10; y++) pc.set(x, y, R[4]);
  const IR = mat(0x5a5a64, { cont: 1.1 });
  const br = M().poly([[11, 10], [13, 10], [13, 14]]).union(M().poly([[19, 10], [21, 10], [19, 14]]));
  fill(pc, br, IR[3]);
  for (const [x, y] of [[7, 7], [24, 7], [15, 13], [16, 24]]) { pc.set(x, y, IR[1]); pc.set(x + 1, y, IR[4]); }
  // foot plank
  const foot = M().rect(10, 28, 12, 3);
  ring(pc, foot, R);
  vol(pc, foot, R, { mode: 'cyl', axis: 0, flat: 0.6 });
}

function stakeIcon(pc) {
  const R = WOOD();
  const st = M().poly([[14, 11], [18, 11], [18, 25], [16, 30], [14, 25]]);
  ring(pc, st, R);
  vol(pc, st, R, { mode: 'cyl', axis: Math.PI / 2 });
  grain(pc, st, R, { vertical: true, seed: 2 });
  band(pc, 16, 9, 16, 15, 2, 0.5, 2, mat(0x8a8a90, { cont: 1.2 }));
  // lumite crystal tip, glowing
  const LR = mat(0x7bf08a, { cont: 1.1 });
  const c = M().poly([[16, 1], [20.5, 7], [16, 11], [11.5, 7]]);
  ring(pc, c, LR);
  c.each((x, y) => { const left = x < 16; const up = y < 7; pc.set(x, y, LR[left ? (up ? 1 : 2) : (up ? 3 : 4)]); pc.emit(x, y, 0.9); });
  gl(pc, 15, 4, 0xffffff);
  for (const [x, y] of [[9, 3], [23, 5], [22, 11], [10, 11]]) gl(pc, x, y, 0xb8ffb8, 0.8);
}

// ---------------------------------------------------------------- helmets
function helmet(pc, id, spec) {
  const c = spec.c || 0xc9a23a;
  if (id === 'helmet_sun') return crown(pc);
  const R = mat(id === 'helmet_basic' ? 0xd8a838 : id === 'helmet_lumite' ? 0x9aa8b6 : 0xd0a040, { cont: 1.2 });
  // dome
  const dome = M().ellipse(16, 21, 10.5, 13).sub(M().rect(0, 22, 32, 12));
  const brim = M().ellipse(16, 23, 14.5, 3.4);
  ring(pc, brim, R);
  vol(pc, brim, R, { round: 2, spec: id === 'helmet_basic' ? false : 0.85 });
  ring(pc, dome, R);
  vol(pc, dome, R, { spec: id === 'helmet_basic' ? false : 0.8, bounce: true });
  // ridge along the top
  for (let y = 9; y < 22; y++) { pc.set(15, y, R[1]); pc.set(17, y, R[4]); }
  if (id === 'helmet_basic') {
    // candle stub on the front with a little flame
    const WX = mat(0xf0e4c8);
    const cdl = M().rect(14, 9, 4, 7);
    ring(pc, cdl, WX); vol(pc, cdl, WX, { mode: 'cyl', axis: Math.PI / 2 });
    pc.set(16, 8, 0x3a2a20);
    for (const [x, y, cc] of [[16, 7, 0xffd060], [16, 6, 0xffb030], [15, 6, 0xffe8a0], [16, 5, 0xff9020], [16, 4, 0xffe0a0]]) gl(pc, x, y, cc);
    for (const [x, y] of [[12, 15], [20, 15]]) { pc.set(x, y, R[4]); }
    pc.set(15, 16, 0xe8d8a8);
  } else if (id === 'helmet_brass') {
    // oil lamp: brass housing with a glass lens
    const LR = mat(0xd0a040, { cont: 1.2 });
    const h = M().disk(16, 13.5, 4.6);
    ring(pc, h, LR); vol(pc, h, LR, { spec: 0.8 });
    const lens = M().disk(16, 13.5, 3);
    vol(pc, lens, mat(0xffe090), { emit: 0.9 });
    gl(pc, 15, 12, 0xffffff);
    for (const [x, y] of [[8, 16], [24, 16], [11, 19], [21, 19]]) { pc.set(x, y, R[1]); pc.set(x + 1, y + 1, R[4]); }
  } else if (id === 'helmet_lumite') {
    const LR = mat(0x7bf08a, { cont: 1.1 });
    const g = M().poly([[16, 7], [20, 12], [16, 18], [12, 12]]);
    ring(pc, g, LR, { lit: R[6] });
    g.each((x, y) => { pc.set(x, y, LR[x < 16 ? (y < 12 ? 1 : 2) : (y < 12 ? 3 : 4)]); pc.emit(x, y, 0.9); });
    gl(pc, 15, 10, 0xffffff);
    // steel bands with rivets
    for (let x = 6; x < 27; x++) if (dome.get(x, 19)) pc.set(x, 19, R[4]);
    for (const x of [8, 12, 20, 24]) pc.set(x, 18, R[1]);
  }
}

function crown(pc) {
  const R = mat(0xf2c030, { cont: 1.2, warm: 55 });
  const body = M().poly([[4, 26], [4, 11], [9, 17], [12, 7], [16, 15], [20, 7], [23, 17], [28, 11], [28, 26]]);
  ring(pc, body, R);
  vol(pc, body, R, { mode: 'cyl', axis: Math.PI / 2, spec: 0.75 });
  // band
  const bnd = M().rect(4, 21, 25, 5);
  vol(pc, bnd, R, { mode: 'cyl', axis: 0, spec: 0.8, bias: 0.05 });
  for (let x = 4; x < 29; x++) { pc.set(x, 21, R[1]); pc.set(x, 25, R[5]); }
  // tip pearls
  for (const [x, y] of [[4, 10], [12, 6], [20, 6], [28, 10]]) { const m = M().disk(x + 0.5, y + 0.5, 1.6); fill(pc, m, 0xfff4e0); pc.set(x, y, 0xffffff); }
  // sunstone in front, glowing, small gems on the band
  const SR = mat(0xffcf3a, { cont: 1.1 });
  const s = M().disk(16, 18.5, 3.6);
  ring(pc, s, R, { lit: R[5] });
  vol(pc, s, SR, { emit: 1, spec: 0.8 });
  gl(pc, 15, 17, 0xffffff);
  for (const [x, c] of [[8, 0xe02a3a], [24, 0x2a5ae0]]) { pc.set(x, 23, c); pc.set(x + 1, 23, darkOf(c, 0.6)); pc.set(x, 22, mix(c, 0xffffff, 0.5)); }
  for (const [x, y] of [[16, 11], [11, 15], [21, 15]]) gl(pc, x, y, 0xfff4b0, 0.7);
}

// ---------------------------------------------------------------- gloves
function gloves(pc, id) {
  const kind = id === 'ember_mitts' ? 'mitt' : id === 'frost_gauntlets' ? 'gauntlet' : 'rubber';
  const base = kind === 'rubber' ? 0xf2c828 : kind === 'mitt' ? 0xd0582a : 0x7ac8ea;
  const R = mat(base, { cont: kind === 'rubber' ? 1.25 : 1.15, warm: 55 });
  const CR = kind === 'rubber' ? mat(0xd8a818, { cont: 1.2 }) : kind === 'mitt' ? mat(0x8a3a1a, { cont: 1.05 }) : mat(0xdcf0fa, { cont: 1.1 });
  // a second glove peeking out behind (darker, offset up-right)
  const back = M().ellipse(21, 13, 6.5, 7).union(M().rect(17, 13, 9, 10));
  ring(pc, back, R);
  vol(pc, back, R, { round: 4, bias: -0.25 });
  // palm, fingers, thumb, cuff of the front glove
  const palm = M().ellipse(13.5, 16.5, 7, 7);
  const fingers = [];
  if (kind === 'mitt') fingers.push(M().ellipse(13.5, 9.5, 6.4, 6.5));
  else for (const [fx, top] of [[8.5, 6.5], [12, 4.5], [15.5, 5], [19, 8]]) fingers.push(M().capsule(fx, top, fx, 14, 1.75));
  const thumb = M().capsule(6.5, 19, 2.5, 13.5, 2.1);
  const cuff = M().poly([[7.5, 21.5], [20.5, 21.5], [22, 30], [6, 30]]);
  const hand = palm.clone().union(thumb);
  for (const f of fingers) hand.union(f);
  ring(pc, hand.clone().union(cuff), R);
  const glossy = kind === 'rubber' ? 0.68 : kind === 'gauntlet' ? 0.78 : false;
  vol(pc, thumb, R, { round: 2, spec: glossy, shine: 8 });
  vol(pc, palm, R, { round: 5, spec: glossy, shine: 8, bounce: true });
  for (const f of fingers) { vol(pc, f, R, { round: kind === 'mitt' ? 4 : 1.7, spec: glossy, shine: 8 }); }
  // dark creases between the fingers
  if (kind !== 'mitt') for (const fx of [10.25, 13.75, 17.25]) for (let y = 8; y < 14; y++) if (hand.get(fx, y) && !palm.get(fx, y + 1.5)) pc.set(fx, y, R[5]);
  vol(pc, cuff, CR, { mode: 'cyl', axis: Math.PI / 2 + 0.05, spec: kind === 'rubber' ? 0.7 : false });
  for (let x = 6; x < 23; x++) if (cuff.get(x, 22)) { pc.set(x, 22, CR[1]); }
  for (let x = 6; x < 23; x++) if (cuff.get(x, 28)) { pc.set(x, 28, CR[4]); }
  if (kind === 'rubber') {
    // zap-proof bolt stamped on the cuff + wet highlights
    const B = 0xc83a1a;
    for (const [x, y] of [[15, 23], [14, 24], [15, 24], [16, 24], [13, 25], [14, 26], [15, 26], [14, 27]]) pc.set(x, y, B);
    for (const [x, y] of [[11, 13], [11, 14], [12, 12], [8, 7]]) pc.set(x, y, 0xfffbe0);
  } else if (kind === 'mitt') {
    hand.each((x, y) => { if (((x + (y % 2) * 1.5) % 3) < 1 && y % 2 === 0) { const k = R.indexOf(pc.getHex(x, y)); if (k >= 0 && k < 5) pc.set(x, y, R[k + 1]); } });
    for (const [x, y] of [[11, 12], [16, 9], [14, 18]]) gl(pc, x, y, 0xffc050, 0.9);
    for (const [x, y] of [[26, 5], [4, 9]]) gl(pc, x, y, 0xffb04a, 0.8);
  } else {
    // armour plates across the fingers + frost
    for (const y of [9, 12]) for (let x = 6; x < 22; x++) if (hand.get(x, y) && !palm.get(x, y + 3)) pc.set(x, y, R[4]);
    for (let x = 7; x < 20; x++) if (palm.get(x, 17)) pc.set(x, 17, R[4]);
    for (const [x, y] of [[8, 9], [16, 6], [12, 19], [4, 14]]) pc.set(x, y, 0xffffff);
    for (const [x, y] of [[27, 4], [3, 5]]) sparkle(pc, x, y, 1, 0xffffff, 0xbff6ff, 0.6);
  }
}

// ---------------------------------------------------------------- suits & boots
function suit(pc, id, spec) {
  const thermal = id === 'thermal_suit';
  const R = mat(thermal ? 0x5a7ad0 : 0xc8c0b0, { cont: 1.15 });
  const body = M();
  body.poly([[9, 6], [23, 6], [25, 18], [24, 30], [17, 30], [16, 21], [15, 30], [8, 30], [7, 18]]); // torso + legs
  const armL = M().poly([[9, 6], [4, 9], [2, 21], [6, 22], [8, 12]]);
  const armR = M().poly([[23, 6], [28, 9], [30, 21], [26, 22], [24, 12]]);
  const all = body.clone().union(armL).union(armR);
  ring(pc, all, R);
  vol(pc, armL, R, { mode: 'cyl', axis: Math.PI / 2 + 0.3 });
  vol(pc, armR, R, { mode: 'cyl', axis: Math.PI / 2 - 0.3 });
  vol(pc, body, R, { round: 5, spec: thermal ? false : 0.75 });
  // quilting lines
  body.each((x, y) => { if (y > 8 && (y % 4 === 0) && x % 2 === 0) { const k = R.indexOf(pc.getHex(x, y)); if (k >= 0 && k < 5) pc.set(x, y, R[k + 1]); } });
  // collar / hood ring, zipper, belt, cuffs
  const CO = mat(thermal ? 0xe07a2a : 0x8a8a90, { cont: 1.1 });
  const collar = M().ellipse(16, 6.5, 6.5, 2.5);
  ring(pc, collar, CO); vol(pc, collar, CO, { round: 1.5 });
  for (let y = 9; y < 21; y++) pc.set(16, y, y % 2 ? CO[2] : CO[4]);
  for (let x = 7; x < 26; x++) if (body.get(x, 19)) { pc.set(x, 19, CO[3]); pc.set(x, 20, CO[4]); }
  pc.set(16, 19, 0xe0c060); pc.set(16, 20, 0xb08a30);
  for (const [x, y] of [[3, 21], [4, 21], [5, 21], [27, 21], [28, 21], [29, 21]]) pc.set(x, y, CO[3]);
  if (thermal) {
    // orange piping stripes on the arms
    for (let i = 0; i < 12; i++) { pc.set(5 - i * 0.25, 10 + i, CO[2]); pc.set(27 + i * 0.25, 10 + i, CO[2]); }
  } else {
    // reflective sheen
    for (const [x, y] of [[11, 10], [12, 11], [11, 12], [21, 24]]) pc.set(x, y, 0xffffff);
  }
}

function boots(pc, id) {
  const spring = id === 'spring_boots';
  const R = mat(spring ? 0x3a7ad0 : 0x7a5030, { cont: 1.1 });
  const boot = (ox) => {
    const m = M().poly([[ox + 3, 5], [ox + 11, 5], [ox + 11, 17], [ox + 16, 19], [ox + 17, 24], [ox + 2, 24]]);
    m.ellipse(ox + 13, 21, 4.5, 3.4);
    ring(pc, m, R);
    vol(pc, m, R, { round: 3, spec: spring ? 0.8 : false });
    // cuff band and laces
    const CF = mat(spring ? 0xe8e8f0 : 0xc8a070);
    for (let x = ox + 3; x <= ox + 11; x++) { pc.set(x, 6, CF[2]); pc.set(x, 7, CF[3]); }
    for (let y = 10; y < 18; y += 2) { pc.set(ox + 6, y, CF[2]); pc.set(ox + 8, y, CF[2]); pc.set(ox + 7, y + 1, CF[3]); }
    // sole
    const SO = mat(0x3a2a20);
    const sole = M().rect(ox + 2, 24, 16, 3);
    ring(pc, sole, SO); vol(pc, sole, SO, { mode: 'cyl', axis: 0, flat: 0.5 });
    if (spring) {
      const SP = mat(0xc8ccd4, { cont: 1.3 });
      for (let i = 0; i < 3; i++) {
        const y = 27.5 + i * 1.3;
        lineIn(pc, ox + 6, y, ox + 13, y + 0.6, SP[i % 2 ? 4 : 1]);
      }
    } else {
      for (let x = ox + 3; x < ox + 18; x += 3) { pc.set(x, 27, 0xc8ccd4); pc.set(x, 28, 0x6a6e78); }
    }
    return m;
  };
  boot(12);
  boot(1);
}

// ---------------------------------------------------------------- bags
function bag(pc, id) {
  switch (id) {
    case 'bag_small': {
      // burlap sack tied with twine
      const R = mat(0xc8a46e, { cont: 1.05 });
      const m = M().ellipse(16, 20, 11, 10).poly([[11, 8], [21, 8], [24, 14], [8, 14]]);
      ring(pc, m, R);
      vol(pc, m, R, { round: 6 });
      m.each((x, y) => { if ((x + y) % 2 === 0 && hash2(x, y, 3) < 0.5) { const k = R.indexOf(pc.getHex(x, y)); if (k >= 0 && k < 5) pc.set(x, y, R[k + 1]); } });
      // gathered neck and twine
      const neck = M().poly([[12, 4], [20, 4], [18.5, 9], [13.5, 9]]);
      ring(pc, neck, R); vol(pc, neck, R, { mode: 'cyl', axis: Math.PI / 2 });
      const TW = mat(0x8a5a2a);
      for (let x = 12; x <= 20; x++) { pc.set(x, 9, TW[2]); pc.set(x, 10, TW[4]); }
      lineIn(pc, 20, 10, 23, 13, TW[3]); pc.set(23, 14, TW[2]);
      for (let x = 11; x < 21; x += 2) pc.set(x + 0.5, 3.5, R[2]);
      // stitched patch
      const PA = mat(0x9a7a4a);
      const p = M().rect(18, 18, 6, 5);
      fill(pc, p, PA[3]);
      for (let x = 18; x < 24; x += 2) { pc.set(x, 18, PA[1]); pc.set(x + 1, 22, PA[5]); }
      break;
    }
    case 'bag_medium': {
      // leather satchel with flap, buckle and strap
      const R = LEATHER();
      const strap = M().path([[5, 14], [8, 4], [16, 2], [24, 4], [27, 14]], 1.2);
      ring(pc, strap, R); vol(pc, strap, R, { round: 1 });
      const body = M().rect(4, 12, 24, 17);
      body.sub(M().rect(4, 28, 2, 2)).sub(M().rect(26, 28, 2, 2));
      ring(pc, body, R);
      vol(pc, body, R, { round: 3 });
      const flap = M().poly([[4, 12], [28, 12], [27, 20], [21, 22.5], [11, 22.5], [5, 20]]);
      ring(pc, flap, R, { lit: R[4], dark: R[6] });
      vol(pc, flap, R, { round: 2, bias: 0.06 });
      // stitching
      flap.edge().each((x, y) => { if (y > 13 && (x + y) % 2 === 0) pc.set(x, y, mix(R[1], 0xf0d8a0, 0.5)); });
      const BK = mat(0xe0b848, { cont: 1.2 });
      const bk = M().rect(14, 19, 4, 5);
      ring(pc, bk, BK); fill(pc, bk, BK[2]); pc.set(15, 21, BK[5]); pc.set(16, 21, BK[5]); pc.set(14, 19, BK[0]);
      break;
    }
    case 'bag_large':
    case 'bag_huge': {
      const huge = id === 'bag_huge';
      const R = mat(huge ? 0x3a62a0 : 0x5e7040, { cont: 1.1 });
      // bedroll on top
      const roll = M().capsule(7, huge ? 5 : 7, 25, huge ? 5 : 7, 3);
      const RR = mat(huge ? 0xb04a3a : 0xa88a5a);
      ring(pc, roll, RR); vol(pc, roll, RR, { mode: 'cyl', axis: 0 });
      for (const x of [10, 22]) for (let y = 2; y < 11; y++) if (roll.get(x, y)) pc.set(x, y, 0x5a3a20);
      // main pack
      const pack = M().poly([[6, 9], [26, 9], [28, 29], [4, 29]]);
      pack.ellipse(16, 10, 10, 3);
      ring(pc, pack, R); vol(pc, pack, R, { round: 4 });
      // front pocket with flap and buckles
      const pk = M().rect(9, 18, 14, 10);
      ring(pc, pk, R, { lit: R[4] }); vol(pc, pk, R, { round: 2, bias: 0.05 });
      const fl = M().rect(9, 18, 14, 4);
      fill(pc, fl, R[2]); for (let x = 9; x < 23; x++) pc.set(x, 22, R[5]);
      const BK = mat(0xc8ccd4, { cont: 1.2 });
      for (const x of [12, 19]) { pc.set(x, 22, BK[1]); pc.set(x, 23, BK[3]); }
      // straps
      const ST = LEATHER();
      for (const x of [8, 23]) for (let y = 10; y < 29; y++) if (pack.get(x, y) && !pk.get(x, y)) pc.set(x, y, y % 4 === 0 ? ST[2] : ST[3]);
      if (huge) {
        // lantern hanging on the side
        const LN = mat(0x4a4a50);
        const ln = M().rect(26, 15, 4, 6);
        ring(pc, ln, LN); fill(pc, ln, LN[3]);
        const gL = M().rect(27, 16, 2, 4); fill(pc, gL, 0xffc860, 1); pc.set(27, 16, 0xfff0c0);
        pc.set(27, 14, LN[2]); pc.set(28, 13, LN[2]);
      } else {
        // small pick strapped to the side
        lineIn(pc, 3, 26, 7, 12, 0x9a6a3a); lineIn(pc, 4, 26, 8, 12, 0x6a4424);
        lineIn(pc, 3, 12, 10, 10, 0x9aa0a8); pc.set(2, 13, 0x9aa0a8); pc.set(10, 11, 0x6a6e78);
      }
      break;
    }
    case 'bag_bottomless': {
      const R = mat(0x6a2a8a, { cont: 1.15 });
      const m = M().ellipse(16, 20, 12, 10).poly([[9, 9], [23, 9], [27, 16], [5, 16]]);
      ring(pc, m, R);
      vol(pc, m, R, { round: 6, spec: 0.8 });
      // open mouth with starry void inside
      const mouth = M().ellipse(16, 9.5, 8.5, 3.2);
      const lip = M().ellipse(16, 9.5, 9.5, 4);
      ring(pc, lip, R);
      fill(pc, lip, mix(R[2], 0xe0b048, 0.5));
      fill(pc, mouth, 0x120624);
      for (const [x, y, c] of [[12, 9, 0xffffff], [17, 8, 0xd8b8ff], [20, 10, 0xffe8a0], [14, 11, 0x9ad0ff], [22, 9, 0xffffff]]) gl(pc, x, y, c);
      // gold drawstring and rune
      const GD = mat(0xe8b840, { cont: 1.2 });
      for (let x = 7; x <= 25; x++) if (m.get(x, 14)) pc.set(x, 14, x % 2 ? GD[2] : GD[4]);
      lineIn(pc, 24, 14, 27, 19, GD[3]); pc.set(27, 20, GD[1]);
      for (const [x, y] of [[16, 19], [15, 20], [17, 20], [16, 21], [16, 22], [14, 19], [18, 19]]) gl(pc, x, y, 0xf0c8ff, 0.7);
      for (const [x, y] of [[4, 6], [28, 5], [27, 26]]) sparkle(pc, x, y, 1, 0xffffff, 0xd8b8ff, 0.8);
      break;
    }
  }
}

// ---------------------------------------------------------------- weapons
/**
 * Diagonal forged weapon (handle bottom-left, tip top-right) on a 32×32 canvas.
 * metalColor tints the metal parts, infusionColor (optional) adds glowing runes + halo.
 */
export function drawWeaponArt(pc, type, metalColor, infusionColor) {
  const R = mat(metalColor, { cont: 1.3, hs: 1.1 });
  const G = mat(0x7a4a2a, { cont: 1.05 }); // grip leather
  const BR = mat(0xd0a040, { cont: 1.2 }); // brass fittings
  const D = 0.7071;
  // axis: from (2,30) toward (30,2); position u along it, v across (+v = toward bottom-right)
  const at = (u, v = 0) => [2 + u * D + v * D, 30 - u * D + v * D];
  // blade as a polygon: both edges follow the width profile and meet in a sharp tip
  const bladeMask = (u0, u1, wf, tip = 2.2) => {
    const top = [], bot = [];
    for (let i = 0; i <= 24; i++) { const s = i / 24; const u = u0 + (u1 - u0) * s; const w = Math.max(0.35, wf(s)); top.push(at(u, -w)); bot.push(at(u, w)); }
    const m = M().poly([...top, at(u1 + tip, 0), ...bot.reverse()]);
    m.u0 = u0; m.u1 = u1 + tip; m.wf = wf;
    return m;
  };
  const paintBlade = (m) => {
    ring(pc, m, R);
    m.each((x, y) => {
      const u = ((x + 0.5 - 2) * D - (y + 0.5 - 30) * D);
      const v = ((x + 0.5 - 2) * D + (y + 0.5 - 30) * D); // across (+ = lower-right)
      const s = Math.max(0, Math.min(1, (u - m.u0) / Math.max(1, m.u1 - m.u0 - 2)));
      const w = Math.max(0.6, m.wf(s));
      let k;
      if (v < -w + 0.9) k = 1;            // lit bevel along the upper edge
      else if (v < -0.35) k = 2;          // upper flat
      else if (v < 0.55) k = s < 0.82 ? 4 : 3; // fuller groove down the middle
      else if (v > w - 0.9) k = 2;        // thin glint on the lower cutting edge
      else k = 3;
      pc.set(x, y, R[k]);
    });
  };
  const grip = (u0, u1, r = 1.5) => {
    const [x0, y0] = at(u0), [x1, y1] = at(u1);
    shaft(pc, x0, y0, x1, y1, r, G, { grain: false });
    wrap(pc, x0, y0, x1, y1, r, 0, 1, G, 1.8);
  };
  const guard = (u, len, w = 1.4, Rg = BR) => {
    const [cx, cy] = at(u);
    const m = M().capsule(cx - len * D, cy - len * D, cx + len * D, cy + len * D, w);
    // knobbed quillon ends + a raised center block
    m.disk(cx - len * D, cy - len * D, w + 0.5).disk(cx + len * D, cy + len * D, w + 0.5);
    m.disk(cx, cy, w + 0.7);
    ring(pc, m, Rg); vol(pc, m, Rg, { mode: 'cyl', axis: Math.PI / 4, spec: 0.8 });
    pc.set(cx - 0.5, cy - 0.5, Rg[0]);
  };
  const pommel = (u, r = 2, Rp = BR) => {
    const [cx, cy] = at(u);
    const m = M().disk(cx, cy, r);
    ring(pc, m, Rp); vol(pc, m, Rp, { spec: 0.8 });
  };
  let blade = null;
  switch (type) {
    case 'dagger':
      grip(3, 10); pommel(3, 2.2); guard(11, 4.2);
      blade = bladeMask(12, 28.5, (s) => 2.3 * (1 - Math.pow(s, 1.8) * 0.75), 2.5);
      paintBlade(blade);
      break;
    case 'shortsword':
      grip(3, 10); pommel(2.6, 2.2); guard(11, 5);
      blade = bladeMask(12, 35, (s) => (s < 0.85 ? 2.3 : 2.3 * (1 - (s - 0.85) * 3.5)), 2.6);
      paintBlade(blade);
      break;
    case 'longsword':
      grip(2, 10, 1.4); pommel(1.8, 2); guard(10.5, 6);
      blade = bladeMask(12, 37.5, (s) => (s < 0.88 ? 2.0 : 2.0 * (1 - (s - 0.88) * 4)), 2.4);
      paintBlade(blade);
      break;
    case 'greatsword':
      grip(1.5, 10, 1.6); pommel(1.5, 2.4); guard(11, 7.5, 1.8);
      blade = bladeMask(12.5, 37, (s) => (s < 0.86 ? 3.1 : 3.1 * (1 - (s - 0.86) * 3.6)), 3.2);
      paintBlade(blade);
      break;
    case 'rapier': {
      grip(3, 10, 1.3); pommel(2.6, 1.8);
      // swept ring hilt
      const [cx, cy] = at(11.5);
      for (let a = 0; a < Math.PI * 2; a += 0.12) pc.set(cx + Math.cos(a) * 4 + 0.5, cy + Math.sin(a) * 4 + 0.5, a < Math.PI ? BR[2] : BR[4]);
      guard(11, 3.5, 1.1);
      blade = bladeMask(12, 38.5, (s) => 1.05 * (1 - s * 0.5), 2);
      paintBlade(blade);
      break;
    }
    case 'spear': {
      const [x0, y0] = at(0.5), [x1, y1] = at(28);
      shaft(pc, x0, y0, x1, y1, 1.3, WOOD(), { seed: 9 });
      wrap(pc, x0, y0, x1, y1, 1.3, 0.25, 0.42, G, 1.8);
      blade = bladeMask(26.5, 37, (s) => (s < 0.3 ? 1 + s * 7 : 3.1 * (1 - (s - 0.3) / 0.75)), 2.6);
      paintBlade(blade);
      guard(27.2, 1.6, 1.1, R);
      break;
    }
    case 'axe': {
      const [x0, y0] = at(1), [x1, y1] = at(30);
      shaft(pc, x0, y0, x1, y1, 1.5, WOOD(), { seed: 2 });
      wrap(pc, x0, y0, x1, y1, 1.5, 0.02, 0.28, G, 1.8);
      // crescent head on the lower-right side of the haft
      const [hx, hy] = at(25);
      const head = M().poly([[hx - 2, hy - 2], [hx + 4, hy - 7], [hx + 9, hy - 2], [hx + 9.5, hy + 4], [hx + 5, hy + 8.5], [hx + 2, hy + 3]]);
      head.ellipse(hx + 6.5, hy + 1, 3.6, 6.2);
      ring(pc, head, R);
      vol(pc, head, R, { round: 2.5, spec: 0.8 });
      // bright cutting edge
      head.each((x, y) => { const d = (x - hx) * 0.8 + (y - hy) * 0.2; if (d > 7.5 && head.get(x, y)) pc.set(x, y, R[1]); });
      blade = head;
      break;
    }
    case 'mace': {
      const [x0, y0] = at(1), [x1, y1] = at(27);
      shaft(pc, x0, y0, x1, y1, 1.4, mat(0x6a6e78, { cont: 1.2 }), { grain: false });
      wrap(pc, x0, y0, x1, y1, 1.5, 0.02, 0.3, G, 1.8);
      const [hx, hy] = at(30.5);
      const head = M().disk(hx, hy, 5);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; head.capsule(hx, hy, hx + Math.cos(a) * 7, hy + Math.sin(a) * 7, 1.2); }
      ring(pc, head, R);
      vol(pc, head, R, { round: 3, spec: 0.8 });
      blade = head;
      break;
    }
    case 'warhammer': {
      const [x0, y0] = at(1), [x1, y1] = at(30);
      shaft(pc, x0, y0, x1, y1, 1.4, DWOOD(), { seed: 6 });
      wrap(pc, x0, y0, x1, y1, 1.5, 0.02, 0.3, G, 1.8);
      const [hx, hy] = at(29);
      // block head across the haft + back spike
      const head = M().poly([[hx - 9, hy - 1], [hx - 1, hy - 9], [hx + 3, hy - 5], [hx - 5, hy + 3]]);
      head.poly([[hx + 1, hy - 3], [hx + 9, hy + 5], [hx - 1, hy + 1]]);
      ring(pc, head, R);
      vol(pc, head, R, { round: 2, spec: 0.8 });
      blade = head;
      break;
    }
    case 'moleblade': {
      grip(2.5, 10, 1.6); pommel(2.3, 2.5); guard(11, 6.5, 1.8);
      // shovel-sword: narrow neck widening into a broad spade blade
      blade = bladeMask(12, 37, (s) => (s < 0.3 ? 1.6 : s < 0.88 ? 1.6 + (s - 0.3) * 6.2 : 5.2 * (1 - (s - 0.88) * 4.5)), 1.6);
      paintBlade(blade);
      // spade rim + mole-king gem
      const [gx, gy] = at(30);
      const gm = M().disk(gx, gy, 1.7);
      fill(pc, gm, 0x2ad96a); pc.set(gx - 1, gy - 1, 0xb4ffcc); pc.set(gx + 0.5, gy + 0.5, 0x0a7a3a);
      break;
    }
    default:
      grip(3, 10); guard(11, 5);
      blade = bladeMask(12, 35, () => 2);
      paintBlade(blade);
  }
  // fuller / glint
  if (blade && ['dagger', 'shortsword', 'longsword', 'greatsword', 'moleblade'].includes(type)) {
    const [a0, b0] = at(14), [a1, b1] = at(type === 'dagger' ? 22 : 30);
    lineIn(pc, a0, b0, a1, b1, R[4], blade);
  }
  const [sx, sy] = at(type === 'dagger' ? 20 : 26, -1.2);
  sparkle(pc, sx, sy, 1, 0xffffff, R[0]);
  if (infusionColor && blade) {
    const IR = mat(infusionColor, { cont: 1 });
    // glowing runes along the blade + emissive edge
    blade.each((x, y) => { if (hash2(x, y, 5) < 0.16 && R.indexOf(pc.getHex(x, y)) >= 2) { pc.set(x, y, IR[1]); pc.emit(x, y, 1); } });
    blade.edge().each((x, y) => { pc.set(x, y, (x + y) % 2 ? IR[2] : IR[1]); pc.emit(x, y, 0.85); });
    glowHalo(pc, mix(infusionColor, 0xffffff, 0.15), 120, 2);
  }
}

// ---------------------------------------------------------------- UI glyphs
function coin(pc) {
  const R = mat(0xf2c030, { cont: 1.2, warm: 55 });
  // coin seen slightly from below: thickness band at the bottom
  const edge = M().ellipse(16, 17.5, 12.5, 12.5);
  ring(pc, edge, R);
  fill(pc, edge, R[5]);
  for (let x = 4; x < 29; x++) for (let y = 17; y < 31; y++) if (edge.get(x, y) && (x % 2 === 0)) pc.set(x, y, R[4]);
  const face = M().ellipse(16, 15.5, 12.5, 12.5);
  vol(pc, face, R, { round: 2.5, spec: 0.85 });
  // raised rim and embossed mole paw
  const inner = M().ellipse(16, 15.5, 9.5, 9.5);
  inner.edge().each((x, y) => pc.set(x, y, (x + y) < 31 ? R[4] : R[1]));
  const paw = M().ellipse(16, 17.5, 4, 3.4);
  for (const [x, y] of [[11.5, 12.5], [14.5, 10.5], [17.5, 10.5], [20.5, 12.5]]) paw.disk(x, y, 1.4);
  paw.each((x, y) => pc.set(x, y, R[2]));
  paw.edge().each((x, y) => { if (!paw.get(x + 1, y + 1)) pc.set(x, y, R[4]); else if (!paw.get(x - 1, y - 1)) pc.set(x, y, R[1]); });
  sparkle(pc, 9, 8, 2, 0xffffff, R[0]);
}

function boltGlyph(pc) {
  const R = mat(0xffd02a, { cont: 1.15, warm: 55 });
  const m = M().poly([[19, 1], [7, 17], [15, 17], [11, 31], [26, 12], [17.5, 12], [23, 1]]);
  ring(pc, m, R);
  m.each((x, y) => {
    const left = (x - 16) * 0.5 + (y - 16) * -0.3 < 0;
    pc.set(x, y, R[left ? 2 : 3]);
  });
  m.edge().each((x, y) => { if (!m.get(x - 1, y) || !m.get(x, y - 1)) pc.set(x, y, R[1]); else pc.set(x, y, R[4]); });
  lineIn(pc, 19, 4, 11, 15, R[0], m);
  sparkle(pc, 22, 4, 1, 0xffffff, R[0]);
}

function bookGlyph(pc) {
  const R = mat(0x9a3a2a, { cont: 1.1 });
  const GD = mat(0xe8b440, { cont: 1.2 });
  // pages block (side) and cover in 3/4 view
  const pages = M().poly([[7, 7], [27, 4], [28, 25], [8, 28]]);
  const PG = mat(0xf2e6c8, { cont: 0.9 });
  ring(pc, pages, PG);
  fill(pc, pages, PG[2]);
  for (let y = 6; y < 28; y += 2) for (let x = 24; x < 29; x++) if (pages.get(x, y)) pc.set(x, y, PG[4]);
  const cover = M().poly([[4, 6], [24, 3], [25, 25], [5, 28]]);
  ring(pc, cover, R);
  vol(pc, cover, R, { round: 2.5 });
  // spine
  for (let y = 4; y < 29; y++) for (const x of [4, 5]) if (cover.get(x, y)) pc.set(x, y, x === 4 ? R[4] : R[2]);
  // gold frame + emblem (a little pick over a gem)
  const frame = M().poly([[8, 8], [21, 6], [21.8, 23], [9, 25]]);
  frame.edge().each((x, y) => pc.set(x, y, GD[(x + y) % 3 === 0 ? 1 : 2]));
  const gem = M().poly([[15, 11], [18, 14], [15, 18], [12, 14]]);
  fill(pc, gem, 0x6ad0ff); pc.set(14, 13, 0xe0f8ff); pc.set(15, 16, 0x2a7ab0);
  for (const [x, y] of [[4, 6], [23, 3], [24, 24], [5, 27]]) { pc.set(x, y, GD[1]); }
  // ribbon bookmark
  for (let y = 25; y < 31; y++) pc.set(19, y, y > 28 ? 0xc02a3a : 0xe04a4a);
  pc.set(18, 30, 0xc02a3a); pc.set(20, 30, 0xc02a3a);
}

function heartGlyph(pc) {
  const R = mat(0xe0303e, { cont: 1.15 });
  const m = M().disk(10.5, 11.5, 6.5).disk(21.5, 11.5, 6.5).poly([[4.3, 13.5], [27.7, 13.5], [16, 28]]);
  ring(pc, m, R);
  vol(pc, m, R, { round: 6, spec: 0.8, bounce: true });
  sparkle(pc, 9, 9, 1, 0xffffff, R[0]);
  pc.set(8, 11, R[0]); pc.set(8, 12, R[1]);
}

// ---------------------------------------------------------------- dispatcher
export function drawGear(pc, spec, id, seed) {
  switch (spec.k) {
    case 'tool': {
      const t = spec.t;
      if (t === 'pick') pickaxe(pc, id, spec);
      else if (t === 'chisel') chisel(pc, id || (spec.c === 0x9fe0e6 ? 'chisel_fine' : 'chisel_basic'));
      else if (t === 'brush') brush(pc, id);
      else if (t === 'drill') drill(pc, id || (spec.c === 0x7bf08a ? 'drill_lumite' : 'drill_steam'));
      else if (t === 'xray') xrayLamp(pc, id || (spec.c === 0xe0a8ff ? 'xray_prism' : 'xray_lamp'));
      else if (t === 'beam') beamIcon(pc);
      else if (t === 'stake') stakeIcon(pc);
      else return false;
      return true;
    }
    case 'equip': {
      const t = spec.t;
      if (t === 'helmet') helmet(pc, id, spec);
      else if (t === 'gloves') gloves(pc, id, spec);
      else if (t === 'suit') suit(pc, id, spec);
      else if (t === 'boots') boots(pc, id);
      else if (t === 'bag') bag(pc, id || 'bag_medium');
      else return false;
      return true;
    }
    case 'coin': coin(pc); return true;
    case 'bolt': boltGlyph(pc); return true;
    case 'book': bookGlyph(pc); return true;
    case 'heart': heartGlyph(pc); return true;
    default: return false;
  }
}

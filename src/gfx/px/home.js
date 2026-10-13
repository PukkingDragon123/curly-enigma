// 32×32 icons: home furniture (3/4 view), floor & wall swatches, blueprints, the surface ticket.
import { mat, mix } from './color.js';
import { Mask, vol, fill, sparkle, hash2, vnoise, maskOf } from './shade.js';
import { M, ring, lineIn, grain } from './parts.js';
import { camera, drawSolid, boxFaces } from './solid.js';
import { leaf } from './flora.js';
import { drawWeaponArt } from './gear.js';

const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };
const WOOD = () => mat(0x9a6a3a, { cont: 1.05 });
const DWOOD = () => mat(0x6e4626, { cont: 1.05 });
const LWOOD = () => mat(0xc0884e, { cont: 1.05 });
const STONE = () => mat(0x8a847e, { cont: 1 });
const IRON = () => mat(0x4a4a52, { cont: 1.15 });

const CAM = (o = {}) => camera({ yaw: o.yaw ?? -0.55, tilt: o.tilt ?? 0.62, cx: o.cx ?? 16, cy: o.cy ?? 21, scale: o.scale ?? 1 });

/** Box helper: draws an axis-aligned box with the shared camera. Returns its mask. */
function box(pc, cam, x0, y0, z0, x1, y1, z1, R, o = {}) {
  const faces = boxFaces(x0, y0, z0, x1, y1, z1, R, { ...o, bias: { top: -0.12, ...(o.bias || {}) } });
  return drawSolid(pc, cam, faces);
}
/** Wood grain painter for box faces. */
const woodPaint = (R, seed = 1, vertical = false) => (p, m, tone) => {
  m.each((x, y) => p.set(x, y, R[tone]));
  m.each((x, y) => {
    const n = vnoise((vertical ? x : y) * 0.9 + vnoise(x * 0.2, y * 0.2, seed) * 2, (vertical ? y : x) * 0.15, seed + 3);
    if (n > 0.7 && tone < 5) p.set(x, y, R[tone + 1]);
  });
};
/** Upright cylinder in 2D 3/4 view: top ellipse at (cx, y), height h. */
function cylinder(pc, cx, y, rx, ry, h, R, o = {}) {
  const body = M().rect(Math.round(cx - rx), Math.round(y), Math.round(rx * 2), Math.round(h)).union(M().ellipse(cx, y + h, rx, ry));
  const top = M().ellipse(cx, y, rx, ry);
  const all = body.clone().union(top);
  if (o.ring !== false) ring(pc, all, R);
  vol(pc, body, R, { mode: 'cyl', axis: Math.PI / 2, flat: o.flat ?? 0.1, spec: o.spec });
  if (o.top !== false) { fill(pc, top, R[o.topTone ?? 2]); top.edge().each((x, yy) => { if (yy > y) pc.set(x, yy, R[o.topTone ?? 2 + 1]); }); }
  return { all, body, top };
}
/** Final silhouette outline using each edge pixel's own color. */
function outlineAll(pc, k = 0.3) {
  const sil = maskOf(pc, 128);
  const out = sil.clone().dilate(1).sub(sil);
  out.each((x, y) => {
    const n = sil.get(x + 1, y) ? pc.getHex(x + 1, y) : sil.get(x - 1, y) ? pc.getHex(x - 1, y) : sil.get(x, y + 1) ? pc.getHex(x, y + 1) : pc.getHex(x, y - 1);
    pc.set(x, y, mix(n, 0x140a10, 0.78));
  });
}

// ---------------------------------------------------------------- furniture
const F = {
  bed(pc, c) {
    const royal = c === 0x6a5ad9, straw = c === 0xd9b45a;
    const cam = CAM({ cy: 22, scale: 0.95 });
    const W = royal ? DWOOD() : WOOD();
    // frame + legs
    box(pc, cam, -9, 0, -6, 9, 4, 7, W, { paintAll: woodPaint(W, 3) });
    if (royal) for (const [x, z] of [[-9, -6], [7.5, -6]]) box(pc, cam, x, 0, z, x + 1.5, 20, z + 1.5, W);
    else box(pc, cam, -10, 0, -6, -8, 11, 7, W, { paintAll: woodPaint(W, 5) }); // headboard
    const Q = mat(straw ? 0xe0c060 : c, { cont: 1.05 });
    // mattress / quilt
    box(pc, cam, -8, 4, -5.5, 8.5, 7, 6.5, Q, {
      paintAll: (p, m, tone) => m.each((x, y) => {
        let k = tone;
        if (straw) { if (hash2(x, y, 2) < 0.35) k = Math.min(5, tone + 1); else if (hash2(x, y, 7) < 0.15) k = Math.max(1, tone - 1); }
        else if (!royal && ((Math.floor(x / 3) + Math.floor(y / 3)) % 2)) { p.set(x, y, mat(0xf0e0c0)[tone]); return; }
        p.set(x, y, Q[k]);
      }),
    });
    // pillow
    const PW = mat(0xf2ead8);
    box(pc, cam, -7.5, 7, -4.5, -3.5, 9, 5.5, PW);
    if (royal) {
      // canopy + curtains with gold trim
      const CN = mat(c, { cont: 1.1 });
      box(pc, cam, -9.5, 18, -6.5, 9.5, 20.5, 8, CN, { tone: { top: 2 } });
      const G = mat(0xe8b840);
      const a = cam.p(-9.5, 18, 8), b = cam.p(9.5, 18, 8);
      lineIn(pc, a[0], a[1], b[0], b[1], G[1]);
      for (const [x0, z0] of [[-9, -6], [7.5, -6]]) { const p0 = cam.p(x0, 18, z0); const curtain = M().poly([[p0[0] - 2, p0[1]], [p0[0] + 3, p0[1]], [p0[0] + 2, p0[1] + 14], [p0[0] - 2.5, p0[1] + 14]]); fill(pc, curtain, CN[3]); for (let y = 0; y < 14; y += 1) pc.set(p0[0] - 1, p0[1] + y, CN[4]); }
      for (const [x, z] of [[8.5, 7], [-9.5, 7]]) box(pc, cam, x, 0, z - 1.5, x + 1.5, 20, z, W);
    }
    outlineAll(pc);
  },
  forge(pc) {
    const cam = CAM({ cy: 23, scale: 0.9 });
    const S = mat(0x7a7470, { cont: 1.05 });
    const stonePaint = (p, m, tone) => m.each((x, y) => { const brick = ((Math.floor(y / 3) % 2) ? x + 2 : x) % 5 === 0 || y % 3 === 0; p.set(x, y, S[brick ? Math.min(5, tone + 1) : tone]); });
    box(pc, cam, -10, 0, -7, 10, 10, 6, S, { paintAll: stonePaint });
    // fire bed glowing on top
    const fire = M();
    const c0 = cam.p(-7, 10, -4), c1 = cam.p(7, 10, -4), c2 = cam.p(7, 10, 3), c3 = cam.p(-7, 10, 3);
    fire.poly([c0, c1, c2, c3].map((q) => [q[0], q[1]]));
    fire.each((x, y) => gl(pc, x, y, hash2(x, y, 3) < 0.3 ? 0xffe080 : hash2(x, y, 5) < 0.5 ? 0xff9a2a : 0xd84a1a, 1));
    // flames
    for (const [x, y, h] of [[13, 13, 5], [16, 12, 7], [19, 13, 5]]) for (let i = 0; i < h; i++) gl(pc, x + Math.sin(i) * 0.6, y - i, i < 2 ? 0xffd040 : i < 4 ? 0xff9a2a : 0xffe8a0, 1);
    // hood + chimney
    const H = mat(0x5a5450, { cont: 1.05 });
    box(pc, cam, -4, 16, -6, 4, 22, -1, H);
    // anvil in front
    const A = IRON();
    box(pc, cam, 3, 0, 4, 9, 3, 8, A);
    box(pc, cam, 1.5, 3, 4.5, 10.5, 5, 7.5, A, { tone: { top: 2 } });
    outlineAll(pc);
  },
  stove(pc) {
    const cam = CAM({ cy: 24, scale: 1 });
    const I = mat(0x3e3e46, { cont: 1.2 });
    box(pc, cam, -7, 0, -6, 7, 13, 6, I);
    // firebox door with glowing window
    const d0 = cam.p(-4, 3, 6), d1 = cam.p(4, 9, 6);
    const win = M().rect(Math.round(Math.min(d0[0], d1[0])) + 1, Math.round(d1[1]) + 1, 6, 4);
    win.each((x, y) => gl(pc, x, y, y < d1[1] + 2.5 ? 0xffd060 : 0xff7a2a, 1));
    // pot on top + chimney pipe
    const P = mat(0x8a5a3a, { cont: 1.1 });
    cylinder(pc, 13, 6, 4.6, 1.8, 4, P, { topTone: 4 });
    const PI = IRON();
    box(pc, cam, 3.5, 13, -5, 6, 26, -2.5, PI);
    for (const [x, y] of [[11, 3], [13, 1], [15, 2]]) pc.set(x, y, 0xffffff, 180);
    outlineAll(pc);
  },
  coop(pc) {
    const cam = CAM({ cy: 25, scale: 1 });
    const W = WOOD();
    box(pc, cam, -8, 0, -6, 8, 11, 6, W, { paintAll: woodPaint(W, 4, true) });
    // red roof (two slopes)
    const RF = mat(0xc84a3a, { cont: 1.1 });
    const shingle = (p, m, tone) => { const b = m.bounds(); m.each((x, y) => p.set(x, y, RF[(y - b.y0) % 3 === 2 ? Math.min(5, tone + 1) : ((x + Math.floor((y - b.y0) / 3) * 2) % 4 === 0 ? Math.min(5, tone + 1) : tone)])); };
    drawSolid(pc, cam, [
      { pts: [[-9.5, 10, 7], [9.5, 10, 7], [9.5, 17, 0], [-9.5, 17, 0]], R: RF, paint: shingle, bias: -0.15 },
      { pts: [[9.5, 10, -7], [-9.5, 10, -7], [-9.5, 17, 0], [9.5, 17, 0]], R: RF, paint: shingle },
      { pts: [[9.5, 10, 7], [9.5, 10, -7], [9.5, 17, 0]], R: WOOD() },
    ]);
    // door + ramp + egg
    const d = cam.p(-2, 0, 6);
    const door = M().rect(Math.round(d[0]) - 1, Math.round(d[1]) - 7, 5, 7);
    fill(pc, door, 0x2a1a10);
    pc.set(Math.round(d[0]), Math.round(d[1]) - 8, 0x2a1a10);
    const e = M().ellipse(d[0] + 1.5, d[1] - 2, 1.5, 2); fill(pc, e, 0xf6ecd8); pc.set(d[0] + 1, d[1] - 3, 0xffffff);
    outlineAll(pc);
  },
  planter(pc) {
    const cam = CAM({ cy: 25, scale: 1 });
    const W = WOOD();
    box(pc, cam, -9, 0, -5, 9, 7, 5, W, { paintAll: woodPaint(W, 9) });
    // soil
    const s = [cam.p(-8, 7, -4), cam.p(8, 7, -4), cam.p(8, 7, 4), cam.p(-8, 7, 4)].map((q) => [q[0], q[1]]);
    const soil = M().poly(s);
    soil.each((x, y) => pc.set(x, y, hash2(x, y, 2) < 0.3 ? 0x3a2414 : 0x4e3220));
    // glowcaps sprouting
    for (const [x, y, r] of [[11, 14, 3.4], [17, 11, 4], [22, 14, 3]]) {
      for (let yy = y; yy < y + 6; yy++) pc.set(x, yy, 0xe8e0d0);
      const cap = M().ellipse(x, y, r, r * 0.65);
      cap.each((X, Y) => gl(pc, X, Y, Y < y - 0.5 ? 0x8ad8ff : 0x4ab0ff, 0.9));
      pc.set(x - 1, y - 1, 0xe0f8ff);
    }
    outlineAll(pc);
  },
  desk(pc) {
    const cam = CAM({ cy: 24, scale: 1 });
    const W = WOOD();
    box(pc, cam, -10, 7, -5, 10, 9, 5, W, { paintAll: woodPaint(W, 2) });
    for (const [x, z] of [[-9.5, -4.5], [8, -4.5], [-9.5, 3.5], [8, 3.5]]) box(pc, cam, x, 0, z, x + 1.5, 7, z + 1, W);
    // drawer
    box(pc, cam, 1, 3.5, 3.5, 8, 7, 4.8, W);
    // open book, quill, candle
    const B = mat(0xf4e8cc);
    box(pc, cam, -7, 9, -3, 1, 10, 3, B, { tone: { top: 1 } });
    const bk = cam.p(-3, 10, 0);
    lineIn(pc, bk[0], bk[1] - 2, bk[0] + 1, bk[1] + 2, 0x8a3a2a);
    for (let i = 0; i < 3; i++) lineIn(pc, bk[0] - 5, bk[1] - 1 + i, bk[0] - 2, bk[1] - 2 + i, 0xb0a080);
    const q = cam.p(2, 10, -2);
    lineIn(pc, q[0], q[1], q[0] + 5, q[1] - 8, 0xf4f0e8); lineIn(pc, q[0] + 1, q[1], q[0] + 6, q[1] - 7, 0xd8d0c0);
    const cd = cam.p(7, 10, -3);
    cylinder(pc, cd[0], cd[1] - 5, 1.4, 0.6, 5, mat(0xf0e4c8), { ring: false });
    gl(pc, cd[0], cd[1] - 7, 0xffd060); gl(pc, cd[0], cd[1] - 8, 0xffe8a0);
    outlineAll(pc);
  },
  rack(pc) {
    const cam = CAM({ cy: 27, scale: 1, yaw: -0.3 });
    const W = DWOOD();
    box(pc, cam, -12, 0, -2, 12, 2, 2, W);
    box(pc, cam, -12, 0, -2, -10, 20, 2, W);
    box(pc, cam, 10, 0, -2, 12, 20, 2, W);
    box(pc, cam, -12, 18, -2, 12, 20, 2, W);
    // three weapons standing upright: sword, axe, spear
    const S = mat(0xc6cbd2, { cont: 1.3 }), C = mat(0xd9773f, { cont: 1.2 }), G = mat(0xf2c23a, { cont: 1.2 }), H = mat(0x7a4a2a);
    const blade = (x, y0, y1, w, R) => { const m = M().rect(x - w, y0, w * 2 + 1, y1 - y0); m.poly([[x - w, y0], [x + 0.5, y0 - 3], [x + w + 1, y0]]); ring(pc, m, R); m.each((X, Y) => pc.set(X, Y, R[X < x ? 2 : X > x ? 4 : 1])); };
    const handle = (x, y0, y1) => { for (let y = y0; y < y1; y++) { pc.set(x, y, H[y % 2 ? 2 : 3]); pc.set(x + 1, y, H[4]); } };
    handle(9, 17, 25); blade(9.5, 5, 16, 1, S); for (let x = 6; x <= 13; x++) { pc.set(x, 16, G[2]); pc.set(x, 17, G[4]); }
    handle(16, 9, 26); { const hd = M().poly([[17, 6], [22, 4], [23, 12], [17, 10]]); ring(pc, hd, C); hd.each((X, Y) => pc.set(X, Y, C[X > 21 ? 1 : Y < 7 ? 2 : 3])); }
    handle(22, 8, 26); { const tip = M().poly([[20.5, 8], [22.5, 1], [24.5, 8]]); ring(pc, tip, G); tip.each((X, Y) => pc.set(X, Y, G[X < 22.5 ? 2 : 4])); }
    box(pc, cam, -12, 8, 0.5, 12, 9.5, 2, W);
    outlineAll(pc);
  },
  gemcase(pc) {
    const cam = CAM({ cy: 26, scale: 1 });
    const W = DWOOD();
    box(pc, cam, -6, 0, -5, 6, 8, 5, W, { paintAll: woodPaint(W, 7, true) });
    // glass cover
    const G = mat(0xcce8f4, { cont: 0.9 });
    const glass = box(pc, cam, -5.5, 8, -4.5, 5.5, 18, 4.5, G, { paintAll: (p, m, tone) => m.each((x, y) => p.set(x, y, G[Math.min(3, tone)], 210)) });
    // cushion + ruby
    const cu = cam.p(0, 8.5, 0);
    const cs = M().ellipse(cu[0], cu[1], 4, 1.6); fill(pc, cs, 0xb03a4a);
    const gem = M().poly([[cu[0], cu[1] - 6], [cu[0] + 3, cu[1] - 3], [cu[0], cu[1] - 0.5], [cu[0] - 3, cu[1] - 3]]);
    gem.each((x, y) => gl(pc, x, y, x < cu[0] ? (y < cu[1] - 3 ? 0xff8a9a : 0xe02a3a) : (y < cu[1] - 3 ? 0xe02a3a : 0x9a1028), 0.6));
    pc.set(cu[0] - 1, cu[1] - 4, 0xffffff);
    // glass glints
    const g0 = cam.p(-5, 17, 4.5);
    lineIn(pc, g0[0] + 1, g0[1] + 1, g0[0] + 4, g0[1] + 8, 0xffffff);
    outlineAll(pc);
  },
  glowlamp(pc, pot = false) {
    const B = pot ? mat(0xb8603a) : mat(0xe0d8c0);
    if (pot) cylinder(pc, 16, 21, 7, 2.6, 7, B, { topTone: 5 });
    else { cylinder(pc, 16, 25, 6, 2.2, 4, B); for (let y = 12; y < 25; y++) { pc.set(15, y, 0xe8e0d0); pc.set(16, y, 0xd0c8b0); pc.set(17, y, 0xb8b098); } }
    const caps = pot ? [[11, 17, 3.4, 4], [17, 13, 4.4, 8], [22, 17, 3, 4]] : [[16, 9, 8, 0]];
    for (const [x, y, r, h] of caps) {
      for (let yy = y; yy < y + h; yy++) { pc.set(x, yy, 0xe8e0d0); pc.set(x + 1, yy, 0xc8c0b0); }
      const cap = M().ellipse(x, y, r, r * 0.62).sub(M().rect(0, Math.round(y + 1), 32, 32));
      ring(pc, cap, mat(0x4ab0ff));
      cap.each((X, Y) => gl(pc, X, Y, Y < y - r * 0.3 ? 0x9ae0ff : 0x4ab0ff, 0.9));
      for (let X = Math.round(x - r + 1); X < x + r - 1; X++) gl(pc, X, Math.round(y + 0.5), X % 2 ? 0xbff0ff : 0x7fd8ff, 1);
      pc.set(x - r * 0.4, y - r * 0.3, 0xe8faff);
    }
    outlineAll(pc);
  },
  lantern(pc) {
    const I = IRON();
    // post with an arm and a hanging lantern
    for (let y = 6; y < 31; y++) { pc.set(9, y, I[2]); pc.set(10, y, I[3]); pc.set(11, y, I[5]); }
    const base = M().ellipse(10, 30, 5, 1.6); fill(pc, base, I[4]);
    lineIn(pc, 10, 6, 21, 6, I[2]); lineIn(pc, 10, 7, 21, 7, I[4]);
    lineIn(pc, 12, 7, 10, 10, I[3]);
    pc.set(20, 8, I[3]); pc.set(20, 9, I[3]);
    const L = mat(0x3a3a40, { cont: 1.1 });
    const lan = M().rect(16, 11, 9, 11);
    ring(pc, lan, L); fill(pc, lan, L[3]);
    const glass = M().rect(17, 13, 7, 7);
    glass.each((x, y) => gl(pc, x, y, (x === 17 || y === 13) ? 0xfff0c0 : 0xffc060, 1));
    lineIn(pc, 20, 13, 20, 19, L[3]);
    const cap = M().poly([[15, 11], [20.5, 8], [26, 11]]); ring(pc, cap, L); fill(pc, cap, L[2]);
    for (const [x, y] of [[14, 17], [27, 16], [20, 24]]) gl(pc, x, y, 0xffd890, 0.5);
    outlineAll(pc);
  },
  jar(pc) {
    const GLR = mat(0xd8eef0, { cont: 0.9 });
    const jar = M().rect(8, 9, 16, 18).ellipse(16, 27, 8, 2.4);
    ring(pc, jar, GLR);
    jar.each((x, y) => pc.set(x, y, GLR[x < 11 ? 1 : x > 21 ? 4 : 3], 200));
    // little beetle glowing inside + grass
    for (let x = 9; x < 24; x += 2) lineIn(pc, x, 27, x + (x % 4 ? 1 : -1), 23, 0x5a9a4a);
    const ab = M().ellipse(14, 18, 3, 2.6); ab.each((x, y) => gl(pc, x, y, 0xc8ff7a, 1));
    const sh = M().ellipse(18, 17, 3.2, 2.6); fill(pc, sh, 0x34345a); pc.set(17, 16, 0x6a6a9a);
    gl(pc, 13, 17, 0xffffff);
    // cloth lid + twine
    const CL = mat(0xd8c8a0);
    const lid = M().ellipse(16, 8.5, 9.5, 2.6).rect(6.5, 8, 19, 3);
    ring(pc, lid, CL); vol(pc, lid, CL, { round: 1.5 });
    for (let x = 7; x < 26; x++) pc.set(x, 11, 0x8a6a40);
    for (let y = 10; y < 25; y++) pc.set(10, y, 0xffffff, 150);
    outlineAll(pc);
  },
  crystallamp(pc) {
    const S = STONE();
    cylinder(pc, 16, 23, 7, 2.6, 5, S);
    const C = mat(0xc08aff, { cont: 1.1 });
    const pts = [[16, 2], [21, 10], [19, 22], [13, 22], [11, 10]];
    const m = M().poly(pts);
    ring(pc, m, C);
    m.each((x, y) => { const left = x < 16 - (y - 10) * 0.05; gl(pc, x, y, C[y < 10 ? (left ? 1 : 2) : (left ? 2 : 4)], 0.9); });
    lineIn(pc, 16, 3, 15, 21, C[0]);
    lineIn(pc, 11, 10, 21, 10, C[1]);
    for (const [x, y] of [[6, 6], [26, 8], [24, 16]]) sparkle(pc, x, y, 1, 0xffffff, 0xe0a8ff, 0.8);
    outlineAll(pc);
  },
  fireplace(pc) {
    const cam = CAM({ cy: 27, scale: 1, yaw: -0.3 });
    const S = mat(0x8a827a, { cont: 1.05 });
    const stonePaint = (p, m, tone) => m.each((x, y) => { const brick = ((Math.floor(y / 3) % 2) ? x + 2 : x) % 6 === 0 || y % 3 === 0; p.set(x, y, S[brick ? Math.min(5, tone + 1) : tone]); });
    box(pc, cam, -12, 0, -3, 12, 20, 3, S, { paintAll: stonePaint });
    box(pc, cam, -13, 14, -3.5, 13, 16.5, 4.5, DWOOD());
    // hearth opening with fire
    const o0 = cam.p(-6, 0, 3), o1 = cam.p(6, 11, 3);
    const op = M().rect(Math.round(o0[0]), Math.round(o1[1]), Math.round(o1[0] - o0[0]), Math.round(o0[1] - o1[1]));
    fill(pc, op, 0x1a1214);
    const fb = M().ellipse((o0[0] + o1[0]) / 2, o0[1] - 2, 5, 3);
    fb.each((x, y) => gl(pc, x, y, hash2(x, y, 1) < 0.4 ? 0xffd060 : 0xff7a2a, 1));
    for (const [dx, h] of [[-2, 5], [0, 7], [2, 5]]) for (let i = 0; i < h; i++) gl(pc, (o0[0] + o1[0]) / 2 + dx + Math.sin(i) * 0.5, o0[1] - 3 - i, i < 2 ? 0xffb030 : 0xffe08a, 1);
    // little logs
    lineIn(pc, o0[0] + 2, o0[1] - 1, o1[0] - 2, o0[1] - 1, 0x6a4424);
    outlineAll(pc);
  },
  stool(pc) {
    const B = mat(0x7a5434, { cont: 1.05 });
    const c = cylinder(pc, 16, 13, 10, 4, 12, B, { topTone: 1 });
    // bark texture
    c.body.each((x, y) => { if ((x + Math.floor(y / 2)) % 3 === 0) { const k = B.indexOf(pc.getHex(x, y)); if (k >= 0 && k < 5) pc.set(x, y, B[k + 1]); } });
    // growth rings on top
    const T = mat(0xd8a868);
    c.top.each((x, y) => { const d = Math.hypot((x + 0.5 - 16) / 10, (y + 0.5 - 13) / 4); pc.set(x, y, T[Math.floor(d * 5) % 2 ? 3 : 2]); });
    pc.set(16, 13, T[5]);
    // mushroom friend
    const cap = M().ellipse(25, 22, 2.6, 1.6); fill(pc, cap, 0xc84a3a); pc.set(24, 21, 0xf0e0d0);
    pc.set(25, 23, 0xe8e0d0); pc.set(25, 24, 0xe8e0d0);
    outlineAll(pc);
  },
  chair(pc) {
    const cam = CAM({ cy: 27, scale: 1 });
    const W = WOOD();
    for (const [x, z] of [[-6, -5], [4.5, -5], [-6, 4], [4.5, 4]]) box(pc, cam, x, 0, z, x + 1.5, 9, z + 1.5, W);
    box(pc, cam, -6.5, 9, -5.5, 6.5, 11, 6, W, { paintAll: woodPaint(W, 4) });
    // back rest with slats
    box(pc, cam, -6.5, 11, -5.5, -5, 24, -4, W);
    box(pc, cam, 5, 11, -5.5, 6.5, 24, -4, W);
    box(pc, cam, -6.5, 21, -5.5, 6.5, 24, -4, W, { paintAll: woodPaint(W, 6) });
    box(pc, cam, -1.5, 11, -5.3, 1.5, 21, -4.2, W);
    outlineAll(pc);
  },
  armchair(pc, sofa = false) {
    const cam = CAM({ cy: 25, scale: sofa ? 0.85 : 1 });
    const U = sofa ? mat(0x8a5a32, { cont: 1.05 }) : mat(0x4e8a3e, { cont: 1.05 });
    const hw = sofa ? 13 : 8;
    const tex = (p, m, tone) => m.each((x, y) => p.set(x, y, U[sofa ? tone : (hash2(x, y, 3) < 0.25 ? Math.min(5, tone + 1) : tone)]));
    box(pc, cam, -hw, 2, -5, hw, 8, 6, U, { paintAll: tex });
    box(pc, cam, -hw, 8, -5, hw, sofa ? 20 : 18, -1.5, U, { paintAll: tex });
    if (sofa) {
      // two plump seat cushions and buttoned tufts on the back
      for (const [x0, x1] of [[-hw + 0.5, -0.3], [0.3, hw - 0.5]]) box(pc, cam, x0, 8, -1.5, x1, 10, 5.5, mat(0xa86a3a, { cont: 1.05 }), { bias: { top: -0.25 } });
      for (const x of [-8, -3, 3, 8]) { const p = cam.p(x, 15, -1.5); pc.set(p[0], p[1], U[5]); pc.set(p[0] - 1, p[1] - 1, U[2]); }
    }
    box(pc, cam, -hw - 2.5, 2, -5, -hw, 12, 6, U, { paintAll: tex });
    box(pc, cam, hw, 2, -5, hw + 2.5, 12, 6, U, { paintAll: tex });
    // cushion seam + feet
    const s0 = cam.p(-hw + 1, 8, 5), s1 = cam.p(hw - 1, 8, 5);
    lineIn(pc, s0[0], s0[1], s1[0], s1[1], U[4]);
    if (sofa) { const c0 = cam.p(0, 8, 5), c1 = cam.p(0, 8, -1.5); lineIn(pc, c0[0], c0[1], c1[0], c1[1], U[4]); }
    for (const [x, z] of [[-hw - 2, 5], [hw + 1, 5]]) box(pc, cam, x, 0, z - 1, x + 1.2, 2, z, DWOOD());
    if (!sofa) for (const [x, y] of [[9, 9], [21, 8], [14, 13]]) { pc.set(x, y, 0x8ac06a); pc.set(x + 1, y, 0x6aa84a); }
    else { lineIn(pc, 3, 9, 7, 3, 0x6a4424); lineIn(pc, 27, 10, 29, 4, 0x6a4424); pc.set(7, 2, 0x5aa84a); pc.set(29, 3, 0x5aa84a); }
    outlineAll(pc);
  },
  table(pc, long = false) {
    const W = WOOD();
    if (!long) {
      const top = M().ellipse(16, 13, 13, 5.5);
      const ed = M().ellipse(16, 14.5, 13, 5.5);
      ring(pc, ed.clone().union(top), W);
      fill(pc, ed, W[4]);
      top.each((x, y) => pc.set(x, y, W[(y < 12) ? 2 : 3]));
      grain(pc, top, W, { vertical: false, seed: 4 });
      const leg = M().rect(14, 18, 4, 9);
      ring(pc, leg, W); vol(pc, leg, W, { mode: 'cyl', axis: Math.PI / 2 });
      const ft = M().ellipse(16, 27.5, 6, 2); ring(pc, ft, W); vol(pc, ft, W, { round: 1.5 });
      // teacup on the table
      const cup = M().rect(18, 8, 4, 3); fill(pc, cup, 0xf0e8d8); pc.set(22, 9, 0xf0e8d8); pc.set(18, 8, 0xffffff);
    } else {
      const cam = CAM({ cy: 25, scale: 0.9, yaw: -0.4 });
      box(pc, cam, -14, 9, -5, 14, 11.5, 5, W, { paintAll: woodPaint(W, 6), bias: { top: -0.22 } });
      for (const [x, z] of [[-13, -4], [11.5, -4], [-13, 3], [11.5, 3]]) box(pc, cam, x, 0, z, x + 1.6, 9, z + 1.4, W);
      const c = cam.p(-4, 11.5, 0);
      const pl = M().ellipse(c[0], c[1], 3, 1.2); fill(pc, pl, 0xf0e8d8);
      const c2 = cam.p(6, 11.5, 0);
      cylinder(pc, c2[0], c2[1] - 3, 1.4, 0.6, 3, mat(0xc8a050), { ring: false });
    }
    outlineAll(pc);
  },
  rug(pc, c, kind) {
    const R = mat(c, { cont: 1.05 });
    if (kind === 'long') {
      const m = M().poly([[2, 21], [18, 9], [30, 14], [14, 27]]);
      ring(pc, m, R); fill(pc, m, R[3]);
      const in1 = M().poly([[5, 21], [18, 11.5], [27, 14.5], [14, 24.5]]);
      fill(pc, in1, R[2]);
      const in2 = M().poly([[9, 20.5], [18, 14], [23, 16], [14, 22.5]]);
      fill(pc, in2, mix(c, 0xf0d890, 0.5));
      in2.each((x, y) => { if ((x + y) % 4 === 0) pc.set(x, y, R[4]); });
      for (const [x0, y0, x1, y1] of [[2, 21, 14, 27], [18, 9, 30, 14]]) for (let t = 0; t <= 1; t += 0.08) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; pc.set(x - 1, y + 1, 0xf0e0c0); }
    } else {
      const fancy = kind === 'fancy';
      const m = M().ellipse(16, 18, 15, 9.5);
      ring(pc, m, R);
      m.each((x, y) => {
        const d = Math.hypot((x + 0.5 - 16) / 15, (y + 0.5 - 18) / 9.5);
        const band = Math.floor(d * (fancy ? 6 : 5));
        pc.set(x, y, [R[3], fancy ? 0xe8b840 : R[1], R[3], R[4], fancy ? 0xe8b840 : R[2], R[4], R[3]][band] ?? R[3]);
      });
      // woven texture
      m.each((x, y) => { if ((x + y) % 2 === 0 && hash2(x, y, 3) < 0.3) { const cc = pc.getHex(x, y); pc.set(x, y, mix(cc, 0x000000, 0.15)); } });
      if (fancy) {
        const md = M().poly([[16, 13], [21, 18], [16, 23], [11, 18]]);
        fill(pc, md, 0xe8b840); pc.set(16, 18, 0x6a2a8a); pc.set(15, 17, 0xfff0b0);
        for (const [x, y] of [[1, 18], [31, 18], [16, 8], [16, 28]]) { pc.set(x, y, 0xe8b840); pc.set(x, y + 1, 0xc89020); }
      }
    }
    outlineAll(pc);
  },
  fern(pc) {
    const P = mat(0xb8603a, { cont: 1.05 });
    const LR = mat(0x5aa04a, { cont: 1.1 });
    for (const [x1, y1, b] of [[5, 6, 1.5], [12, 2, 1], [20, 2, -1], [27, 6, -1.5], [3, 13, 1], [29, 13, -1], [16, 1, 0]]) leaf(pc, 16, 18, x1, y1, 2.4, LR, { bend: b });
    const pot = cylinder(pc, 16, 18, 8, 2.6, 10, P, { topTone: 5 });
    for (let x = 8; x < 25; x++) if (pot.body.get(x, 21)) { pc.set(x, 21, P[2]); pc.set(x, 22, P[4]); }
    outlineAll(pc);
  },
  bookshelf(pc) {
    const cam = CAM({ cy: 29, scale: 1, yaw: -0.3 });
    const W = DWOOD();
    box(pc, cam, -10, 0, -3, 10, 27, 3, W, { paintAll: woodPaint(W, 2, true) });
    const cols = [0xc94a3a, 0x3a7ac9, 0x5ab84a, 0xe0b040, 0x9a5ad9, 0xd8783a, 0x3aa8a0];
    for (let s = 0; s < 3; s++) {
      const y0 = 2 + s * 8.5;
      const a = cam.p(-8.5, y0 + 7, 3), b = cam.p(8.5, y0, 3);
      const x0 = Math.round(Math.min(a[0], b[0])), yt = Math.round(a[1]);
      // shelf cavity
      fill(pc, M().rect(x0, yt, Math.round(Math.abs(b[0] - a[0])), 7), 0x2a1a10);
      let x = x0;
      let i = s * 3;
      while (x < x0 + Math.abs(b[0] - a[0]) - 1) {
        const w = 2 + (i % 2), h = 5 + ((i * 7) % 3);
        const C = mat(cols[i % cols.length]);
        for (let xx = 0; xx < w; xx++) for (let yy = 0; yy < h; yy++) pc.set(x + xx, yt + 7 - h + yy, C[xx === 0 ? 2 : xx === w - 1 ? 4 : 3]);
        pc.set(x, yt + 7 - h + 1, C[1]);
        x += w; i++;
      }
    }
    outlineAll(pc);
  },
  barrel(pc) {
    const W = WOOD();
    const body = M().fn((x, y) => { const t = (y + 0.5 - 17) / 12; const rx = 10 - t * t * 2.6; return Math.abs(t) <= 1 && Math.abs(x + 0.5 - 16) <= rx; });
    body.union(M().ellipse(16, 29, 7.4, 2.2));
    ring(pc, body, W);
    vol(pc, body, W, { mode: 'cyl', axis: Math.PI / 2, flat: 0.15 });
    body.each((x, y) => { if ((x - 6) % 3 === 0) { const k = W.indexOf(pc.getHex(x, y)); if (k >= 0 && k < 5) pc.set(x, y, W[k + 1]); } });
    const I = IRON();
    for (const y of [9, 15, 22, 27]) for (let x = 0; x < 32; x++) if (body.get(x, y)) pc.set(x, y, y === 15 || y === 22 ? I[3] : I[2]);
    const top = M().ellipse(16, 5.5, 7.4, 2.4);
    ring(pc, top, W); fill(pc, top, W[2]);
    for (let x = 10; x < 23; x += 3) pc.set(x, 5, W[4]);
    outlineAll(pc);
  },
  crate(pc) {
    const cam = CAM({ cy: 24, scale: 1 });
    const W = LWOOD();
    const plank = (p, m, tone) => {
      m.each((x, y) => p.set(x, y, W[tone]));
      const b = m.bounds();
      m.each((x, y) => { if ((y - b.y0) % 4 === 3) p.set(x, y, W[Math.min(5, tone + 2)]); });
      m.edge().each((x, y) => p.set(x, y, W[Math.min(5, tone + 1)]));
      for (const [cx, cy] of [[b.x0 + 1, b.y0 + 1], [b.x1 - 1, b.y0 + 1], [b.x0 + 1, b.y1 - 1], [b.x1 - 1, b.y1 - 1]]) if (m.get(cx, cy) && m.get(cx + 1, cy) && m.get(cx - 1, cy)) p.set(cx, cy, 0x5a5a64);
    };
    box(pc, cam, -8, 0, -8, 8, 15, 8, W, { paintAll: plank });
    // diagonal brace + stencil on the front face
    const a = cam.p(-8, 0, 8), b = cam.p(8, 15, 8);
    lineIn(pc, a[0] + 1, a[1] - 1, b[0] - 1, b[1] + 1, W[1]);
    lineIn(pc, a[0] + 1, a[1] - 2, b[0] - 1, b[1], W[4]);
    const f = cam.p(0, 9, 8);
    for (const [dx, dy] of [[-3, 0], [-2, 0], [-1, 0], [1, 0], [2, 0], [-3, 1], [1, 1]]) pc.set(f[0] + dx, f[1] + dy, 0xc84a3a);
    outlineAll(pc);
  },
  clock(pc) {
    const cam = CAM({ cy: 30, scale: 1, yaw: -0.35 });
    const W = DWOOD();
    box(pc, cam, -6, 0, -3, 6, 27, 3, W, { paintAll: woodPaint(W, 9, true) });
    const f = cam.p(0, 21, 3);
    const face = M().disk(f[0], f[1], 4.6);
    ring(pc, face, mat(0xe0b040)); fill(pc, face, 0xf2ead4);
    for (let i = 0; i < 12; i += 3) { const a = i / 12 * Math.PI * 2; pc.set(f[0] + Math.cos(a) * 3.4, f[1] + Math.sin(a) * 3.4, 0x6a5a4a); }
    lineIn(pc, f[0], f[1], f[0], f[1] - 3, 0x2a1a14); lineIn(pc, f[0], f[1], f[0] + 2, f[1], 0x2a1a14);
    // pendulum window
    const w0 = cam.p(-3, 4, 3), w1 = cam.p(3, 14, 3);
    const win = M().rect(Math.round(w0[0]) + 1, Math.round(w1[1]), 5, 10);
    fill(pc, win, 0x2a1810);
    for (let y = 0; y < 7; y++) pc.set(Math.round(w0[0]) + 3, Math.round(w1[1]) + y, 0xc8a040);
    const pd = M().disk(Math.round(w0[0]) + 3.5, Math.round(w1[1]) + 7.5, 1.6); fill(pc, pd, 0xf0c848);
    outlineAll(pc);
  },
  painting(pc, c, t) {
    const window = t === 'window';
    const FR = mat(window ? 0xa87448 : 0xd8a840, { cont: 1.1 });
    const m = M().rect(2, 4, 28, 23);
    ring(pc, m, FR); vol(pc, m, FR, { round: 2.5 });
    const inner = M().rect(5, 7, 22, 17);
    if (window) {
      inner.each((x, y) => pc.set(x, y, mix(0x6ac0f0, 0xd8f0ff, (y - 7) / 17)));
      for (const [x, y, r] of [[11, 12, 2.4], [14, 11, 2.8], [17, 12, 2.2]]) M().disk(x, y, r).each((X, Y) => pc.set(X, Y, 0xffffff));
      for (let y = 7; y < 24; y++) { pc.set(15, y, FR[2]); pc.set(16, y, FR[4]); }
      for (let x = 5; x < 27; x++) { pc.set(x, 15, FR[2]); pc.set(x, 16, FR[4]); }
      M().disk(22, 10, 2).each((x, y) => gl(pc, x, y, 0xfff4b0, 0.6));
    } else if (c === 0x3ac9d9) {
      // the beach: sea, sand, a little umbrella
      inner.each((x, y) => pc.set(x, y, y < 13 ? mix(0x8ad0f8, 0xd8f0ff, (y - 7) / 6) : y < 18 ? (((x + y) % 5) ? 0x3ab0d0 : 0x7ad8e8) : 0xf0d890));
      M().disk(22, 10, 2.2).each((x, y) => pc.set(x, y, 0xffe060));
      lineIn(pc, 11, 13, 11, 21, 0x8a6a4a);
      M().ellipse(11, 13, 4, 2).sub(M().rect(0, 14, 32, 10)).each((x, y) => pc.set(x, y, x < 11 ? 0xe04a4a : 0xf8f0e0));
    } else {
      // "The Sun": a big yellow circle, deeply moving
      inner.each((x, y) => pc.set(x, y, mix(0x5aa0e0, 0x9ad0f8, (y - 7) / 17)));
      M().disk(16, 15, 5.5).each((x, y) => pc.set(x, y, x + y < 30 ? 0xfff0a0 : 0xffd34a));
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; pc.set(16 + Math.cos(a) * 7.5, 15 + Math.sin(a) * 7.5, 0xffe070); }
    }
    for (let x = 5; x < 27; x++) pc.set(x, 7, mix(pc.getHex(x, 7), 0x000000, 0.25));
    outlineAll(pc);
  },
  banner(pc) {
    const R = mat(0x8a2a3a, { cont: 1.1 });
    const pole = DWOOD();
    const p = M().capsule(3, 4, 29, 4, 1.2); ring(pc, p, pole); vol(pc, p, pole, { mode: 'cyl', axis: 0 });
    const m = M().poly([[6, 5], [26, 5], [26, 28], [16, 22], [6, 28]]);
    ring(pc, m, R);
    vol(pc, m, R, { mode: 'cyl', axis: 0, flat: 0.5 });
    // folds
    for (const x of [11, 21]) for (let y = 6; y < 25; y++) if (m.get(x, y)) pc.set(x, y, R[4]);
    // crossed claws crest
    const G = mat(0xf0c848, { cont: 1.1 });
    for (let i = 0; i < 9; i++) { pc.set(11 + i, 9 + i, G[2]); pc.set(20 - i, 9 + i, G[2]); }
    for (const [x, y] of [[10, 8], [9, 9], [21, 8], [22, 9], [11, 18], [20, 18]]) pc.set(x, y, G[1]);
    M().disk(15.5, 13.5, 2).each((x, y) => pc.set(x, y, G[3]));
    outlineAll(pc);
  },
  musicbox(pc) {
    const cam = CAM({ cy: 25, scale: 1 });
    const W = mat(0xa86a3a, { cont: 1.05 });
    box(pc, cam, -8, 0, -5, 8, 8, 5, W, { paintAll: woodPaint(W, 5) });
    // open lid tilted back
    drawSolid(pc, cam, [{ pts: [[-8, 8, -5], [8, 8, -5], [8, 17, -9], [-8, 17, -9]], R: W, twoSided: true }]);
    const G = mat(0xe0b040);
    const c = cam.p(0, 8, 0);
    M().ellipse(c[0], c[1], 5, 2).each((x, y) => pc.set(x, y, G[3]));
    for (let x = -3; x <= 3; x += 2) pc.set(c[0] + x, c[1] - 1, G[1]);
    // crank + notes floating up
    const k = cam.p(8, 4, 2);
    lineIn(pc, k[0], k[1], k[0] + 3, k[1], 0x6a6a74); pc.set(k[0] + 3, k[1] + 1, 0x6a6a74);
    const note = (x, y, cc) => { pc.set(x, y, cc); pc.set(x + 1, y, cc); pc.set(x + 1, y - 1, cc); pc.set(x + 1, y - 2, cc); pc.set(x + 2, y - 3, cc); };
    note(5, 9, 0xf2c23a); note(24, 5, 0xe06aa0); note(13, 3, 0x6ab8f0);
    outlineAll(pc);
  },
  plushie(pc) {
    const R = mat(0xe8a0b4, { cont: 1.05 });
    const pts = [];
    for (let i = 0; i <= 30; i++) pts.push([5 + i * 0.75, 20 + Math.sin(i * 0.3) * 4]);
    const m = M();
    pts.forEach(([x, y], i) => m.disk(x, y, 4.2 - Math.abs(i - 22) * 0.05));
    ring(pc, m, R);
    vol(pc, m, R, { round: 4 });
    // stitches & segments
    for (let i = 3; i < 28; i += 4) { const [x, y] = pts[i]; for (let k = -3; k <= 3; k += 2) pc.set(x, y + k, R[4]); }
    for (let i = 0; i < 30; i += 2) { const [x, y] = pts[i]; pc.set(x, y + 3.6, R[5]); }
    // face with button eyes and blush
    const [hx, hy] = pts[30];
    pc.set(hx - 2, hy - 1, 0x1a1220); pc.set(hx + 1, hy - 1, 0x1a1220);
    pc.set(hx - 2, hy - 2, 0x6a6a7a); pc.set(hx + 1, hy - 2, 0x6a6a7a);
    pc.set(hx - 1, hy + 1, 0xc05a70); pc.set(hx - 3, hy + 1, 0xf0b0c0); pc.set(hx + 2, hy + 1, 0xf0b0c0);
    // little bow
    for (const [x, y] of [[13, 13], [14, 14], [15, 13], [12, 14], [16, 14]]) pc.set(x, y, 0x5a8ae0);
    outlineAll(pc);
  },
  tank(pc) {
    const cam = CAM({ cy: 24, scale: 0.9, yaw: -0.35 });
    const I = IRON();
    box(pc, cam, -13, 0, -5, 13, 2, 5, I);
    const G = mat(0x7ad0f0, { cont: 0.9 });
    box(pc, cam, -12.5, 2, -4.5, 12.5, 16, 4.5, G, { paintAll: (p, m, tone) => m.each((x, y) => p.set(x, y, G[Math.min(4, tone)], 230)) });
    // water line, plants, sand, fish
    const f0 = cam.p(-12, 2, 4.5), f1 = cam.p(12, 13, 4.5);
    const yTop = Math.round(f1[1]);
    for (let x = Math.round(f0[0]); x < f1[0]; x++) pc.set(x, yTop, 0xd8f4ff);
    for (let x = Math.round(f0[0]); x < f1[0]; x++) { pc.set(x, Math.round(f0[1]) - 1, 0xe8d090); pc.set(x, Math.round(f0[1]) - 2, (x % 3) ? 0xe8d090 : 0xd0b878); }
    for (const x of [f0[0] + 3, f0[0] + 18]) for (let y = 0; y < 6; y++) pc.set(x + Math.sin(y) * 0.6, f0[1] - 3 - y, 0x4a9a4a);
    for (const [x, y] of [[f0[0] + 8, yTop + 4], [f0[0] + 14, yTop + 7]]) { const fm = M().ellipse(x, y, 2.4, 1.2); fill(pc, fm, 0xf0d0d0); pc.set(x - 3, y, 0xe0b0b0); pc.set(x + 1, y - 1, 0xffffff); }
    for (const [x, y] of [[f0[0] + 11, yTop + 2], [f0[0] + 12, yTop + 0]]) pc.set(x, y, 0xffffff);
    outlineAll(pc);
  },
  fountain(pc) {
    const S = mat(0x9a948e, { cont: 1.05 });
    const basin = M().ellipse(16, 23, 14, 6).union(M().rect(2, 23, 29, 4)).union(M().ellipse(16, 27, 14, 4));
    ring(pc, basin, S); vol(pc, basin, S, { mode: 'cyl', axis: Math.PI / 2, flat: 0.3 });
    const water = M().ellipse(16, 23, 11.5, 4.2);
    water.each((x, y) => pc.set(x, y, (x + y) % 5 ? 0x5ab8e6 : 0x9ad8f8));
    // central column with a top bowl, spouting water
    const col = M().rect(14, 10, 4, 13); ring(pc, col, S); vol(pc, col, S, { mode: 'cyl', axis: Math.PI / 2 });
    const tb = M().ellipse(16, 10, 6, 2.2); ring(pc, tb, S); fill(pc, tb, S[2]);
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) { const x = 16 + s * i * 0.9, y = 8 - Math.sin(i / 9 * Math.PI) * 4 + i * 0.9; pc.set(x, y, i % 2 ? 0xbfe6ff : 0xffffff); }
    pc.set(16, 4, 0xffffff); pc.set(16, 5, 0xbfe6ff);
    outlineAll(pc);
  },
  trophy(pc) {
    const W = DWOOD();
    const cam = CAM({ cy: 29, scale: 1 });
    box(pc, cam, -7, 0, -4, 7, 4, 4, W, { paintAll: woodPaint(W, 3) });
    const G = mat(0xf2c030, { cont: 1.25, warm: 55 });
    // golden pickaxe on a stand
    const stand = M().rect(15, 17, 3, 7); ring(pc, stand, G); vol(pc, stand, G, { mode: 'cyl', axis: Math.PI / 2, spec: 0.8 });
    const h = M().capsule(10, 22, 22, 6, 1.4); ring(pc, h, G); vol(pc, h, G, { mode: 'cyl', axis: -0.93, spec: 0.8 });
    const head = M();
    for (let t = -10; t <= 9; t += 0.25) head.disk(21 + t * 0.6 + t * t * 0.03, 6 + t * 0.8 - t * t * 0.0, Math.max(0.5, 2 - Math.abs(t) / 6));
    ring(pc, head, G); vol(pc, head, G, { round: 1.5, spec: 0.75 });
    // plaque
    const p = cam.p(0, 2, 4);
    for (let x = -3; x <= 3; x++) pc.set(p[0] + x, p[1], 0xe0b040);
    for (const [x, y] of [[8, 4], [27, 12], [6, 16]]) sparkle(pc, x, y, 1, 0xffffff, 0xfff0a0, 0.7);
    outlineAll(pc);
  },
  statue(pc) {
    const S = mat(0xe4e0d8, { cont: 1 });
    const cam = CAM({ cy: 30, scale: 1 });
    box(pc, cam, -8, 0, -6, 8, 6, 6, mat(0x9a948e), { tone: { top: 2 } });
    // a heroic marble mole: body, head, snout, paws, little pick
    const body = M().ellipse(16, 17, 7, 7);
    const head = M().ellipse(16, 8.5, 5.5, 4.8);
    const snout = M().ellipse(21.5, 10, 3, 2);
    const all = body.clone().union(head).union(snout);
    ring(pc, all, S);
    vol(pc, body, S, { round: 4, spec: 0.9 });
    vol(pc, head, S, { round: 3, spec: 0.9 });
    vol(pc, snout, S, { round: 1.5 });
    pc.set(18, 7, S[5]); pc.set(24, 10, S[4]);
    lineIn(pc, 17, 7, 19, 6, S[4]);
    const paw = M().ellipse(22, 16, 2.6, 2); ring(pc, paw, S); vol(pc, paw, S, { round: 1.2 });
    lineIn(pc, 23, 17, 27, 6, 0xc8c0b8); lineIn(pc, 24, 5, 29, 8, 0xc8c0b8); pc.set(23, 4, 0xb0a8a0);
    for (const [x, y] of [[11, 14], [13, 20]]) pc.set(x, y, S[1]);
    outlineAll(pc);
  },
};

function furniture(pc, t, c) {
  switch (t) {
    case 'bed': return F.bed(pc, c);
    case 'forge': return F.forge(pc);
    case 'stove': return F.stove(pc);
    case 'coop': return F.coop(pc);
    case 'planter': return F.planter(pc);
    case 'desk': return F.desk(pc);
    case 'rack': return F.rack(pc);
    case 'gemcase': return F.gemcase(pc);
    case 'glowlamp': return F.glowlamp(pc, false);
    case 'potglow': return F.glowlamp(pc, true);
    case 'lantern': return F.lantern(pc);
    case 'jar': return F.jar(pc);
    case 'crystallamp': return F.crystallamp(pc);
    case 'fireplace': return F.fireplace(pc);
    case 'stool': return F.stool(pc);
    case 'chair': return F.chair(pc);
    case 'armchair': return F.armchair(pc, false);
    case 'sofa': return F.armchair(pc, true);
    case 'table': return F.table(pc, false);
    case 'longtable': return F.table(pc, true);
    case 'rug': return F.rug(pc, c || 0xc9583a, c === 0x3a7ac9 ? 'long' : c === 0x8a3ac9 ? 'fancy' : 'round');
    case 'fern': return F.fern(pc);
    case 'bookshelf': return F.bookshelf(pc);
    case 'barrel': return F.barrel(pc);
    case 'crate': return F.crate(pc);
    case 'clock': return F.clock(pc);
    case 'painting': return F.painting(pc, c, 'painting');
    case 'window': return F.painting(pc, c, 'window');
    case 'banner': return F.banner(pc);
    case 'musicbox': return F.musicbox(pc);
    case 'plushie': return F.plushie(pc);
    case 'tank': return F.tank(pc);
    case 'fountain': return F.fountain(pc);
    case 'trophy': return F.trophy(pc);
    case 'statue': return F.statue(pc);
    default: { const cam = CAM(); box(pc, cam, -8, 0, -6, 8, 12, 6, WOOD()); outlineAll(pc); }
  }
}

// ---------------------------------------------------------------- floors & walls
function swatch(pc, spec, wall) {
  const c = spec.c, pat = spec.pat || 'dirt';
  const R = mat(c, { cont: 1 });
  // floors: a diamond tile seen from above at an angle; walls: an upright panel with baseboard
  const area = wall ? M().rect(5, 2, 22, 28) : M().poly([[16, 4], [31, 15.5], [16, 27], [1, 15.5]]);
  const uv = wall ? (x, y) => [x - 5, y - 2] : (x, y) => { const dx = x + 0.5 - 16, dy = (y + 0.5 - 15.5) * 1.33; return [(dx + dy) * 0.62 + 10, (dy - dx) * 0.62 + 10]; };
  ring(pc, area, R);
  area.each((x, y) => {
    const [u, v] = uv(x, y);
    let k = 3;
    switch (pat) {
      case 'plank': { const row = Math.floor(v / 4); const off = (row * 7) % 10; if (v % 4 < 0.7 || ((u + off) % 10) < 0.7) k = 5; else if (hash2(Math.floor(u), row, 3) < 0.2) k = 4; else if (v % 4 < 1.5) k = 2; break; }
      case 'stone': case 'brick': { const h = pat === 'brick' ? 3.2 : 5; const row = Math.floor(v / h); const off = row % 2 ? h : 0; if (v % h < 0.8 || ((u + off) % (h * 2)) < 0.8) k = 5; else k = hash2(Math.floor((u + off) / (h * 2)), row, 4) < 0.3 ? 2 : 3; break; }
      case 'checker': k = ((Math.floor(u / 5) + Math.floor(v / 5)) % 2) ? 3 : -1; break;
      case 'tile': { if (u % 6.5 < 0.8 || v % 6.5 < 0.8) k = 5; else if ((u % 6.5) < 2 && (v % 6.5) < 2) k = 2; break; }
      case 'moss': { const n = vnoise(u * 0.5, v * 0.5, 2); k = n > 0.62 ? 2 : n < 0.3 ? 4 : 3; if (hash2(x, y, 3) < 0.12) k = 1; break; }
      case 'carpet': { const d = Math.max(Math.abs(u - 10), Math.abs(v - 10)); k = d > 8 ? 4 : d > 6.5 ? 2 : d < 2 ? 2 : 3; if ((x + y) % 2 === 0 && hash2(x, y, 5) < 0.3) k = Math.min(5, k + 1); break; }
      case 'paper': { k = 3; const fu = ((u % 6) + 6) % 6, fv = ((v % 6) + 6) % 6; if (Math.hypot(fu - 3, fv - 3) < 1.2) { pc.set(x, y, (Math.floor(u / 6) + Math.floor(v / 6)) % 2 ? 0xf0d890 : 0xe8a0b0); return; } if (u % 3 < 0.5) k = 4; break; }
      default: { const n = hash2(x, y, 9); k = n < 0.12 ? 4 : n > 0.9 ? 2 : 3; if (hash2(x, y, 11) < 0.04) { pc.set(x, y, 0x9a948e); return; } }
    }
    pc.set(x, y, k < 0 ? 0x2a2a30 : R[k]);
  });
  // light/shade by side so it reads as a surface
  if (!wall) area.edge().each((x, y) => { if (y > 15.5) { const k = R.indexOf(pc.getHex(x, y)); pc.set(x, y, R[Math.min(5, (k < 0 ? 3 : k) + 1)]); } });
  else {
    for (let x = 5; x < 27; x++) { pc.set(x, 2, R[1]); pc.set(x, 3, R[2]); }
    const BB = mat(0x5a3a22);
    for (let x = 5; x < 27; x++) for (let y = 26; y < 30; y++) pc.set(x, y, BB[y === 26 ? 2 : y === 29 ? 5 : 3]);
    for (let y = 4; y < 26; y++) { pc.set(26, y, mix(pc.getHex(26, y), 0x000000, 0.25)); pc.set(5, y, mix(pc.getHex(5, y), 0xffffff, 0.12)); }
  }
}

// ---------------------------------------------------------------- blueprints & ticket
function blueprint(pc, t, level = 1) {
  const B = mat(0x2e5cb8, { cont: 1.05 });
  // rolled sheet: paper with a curl at the top-right corner
  const sheet = M().poly([[2, 4], [28, 3], [30, 28], [3, 29]]);
  ring(pc, sheet, B);
  vol(pc, sheet, B, { mode: 'flat', normal: [0, 0, 1] });
  sheet.each((x, y) => { if ((x % 4 === 0 || y % 4 === 0) && hash2(x, y, 1) < 0.85) pc.set(x, y, B[2]); });
  const curl = M().poly([[23, 3], [28, 3], [29, 8]]);
  fill(pc, curl, B[1]); lineIn(pc, 23, 3, 29, 8, B[5]);
  const ink = 0xeaf2ff, ink2 = 0xa8c4f0;
  const tmp = new (pc.constructor)(32, 32);
  if (['dagger', 'shortsword', 'axe', 'mace', 'spear', 'longsword', 'warhammer', 'rapier', 'greatsword', 'moleblade'].includes(t)) {
    drawWeaponArt(tmp, t, 0xffffff);
    const sil = maskOf(tmp, 200);
    // line drawing: outline of the weapon silhouette + center line
    const shrink = new Mask(32, 32);
    sil.each((x, y) => { const X = Math.round(3.5 + x * 0.8), Y = Math.round(4.5 + y * 0.8); shrink.set(X, Y); });
    shrink.dilate(1).erode(1);
    // white-ink silhouette with a dashed construction line through its middle
    shrink.each((x, y) => pc.set(x, y, ink2));
    shrink.edge().each((x, y) => pc.set(x, y, ink));
    for (let i = 4; i < 28; i += 2) { const x = i, y = 31 - i; if (!shrink.get(x, y) && !shrink.get(x + 1, y)) pc.set(x, y, B[2]); }
  } else if (t === 'bellows') {
    const m = M().poly([[8, 10], [22, 12], [22, 20], [8, 22]]);
    m.edge().each((x, y) => pc.set(x, y, ink));
    for (let x = 11; x < 21; x += 3) lineIn(pc, x, 11, x, 21, ink2);
    lineIn(pc, 22, 16, 27, 16, ink); lineIn(pc, 4, 16, 8, 16, ink);
  } else if (t === 'hearth') {
    const m = M().rect(7, 9, 18, 14);
    m.edge().each((x, y) => pc.set(x, y, ink));
    const o = M().rect(11, 15, 10, 8); o.edge().each((x, y) => pc.set(x, y, ink2));
    for (const [x, y] of [[14, 19], [16, 17], [18, 19]]) pc.set(x, y, 0xffb070);
    lineIn(pc, 12, 9, 12, 5, ink); lineIn(pc, 15, 9, 15, 5, ink); lineIn(pc, 12, 5, 15, 5, ink);
  } else {
    // room plan grows with the extension level: walls, doors, dimension marks
    const w = 12 + level * 3, h = 10 + level * 2;
    const x0 = Math.round(16 - w / 2), y0 = Math.round(16 - h / 2);
    const m = M().rect(x0, y0, w, h);
    m.edge().each((x, y) => pc.set(x, y, ink));
    for (let x = 14; x < 18; x++) pc.set(x, y0 + h - 1, B[3]);
    lineIn(pc, 14, y0 + h - 1, 17, y0 + h - 4, ink2);
    if (level >= 2) { lineIn(pc, x0 + Math.round(w * 0.6), y0, x0 + Math.round(w * 0.6), y0 + h - 5, ink); }
    if (level >= 3) { lineIn(pc, x0, y0 + Math.round(h * 0.45), x0 + Math.round(w * 0.6), y0 + Math.round(h * 0.45), ink); for (let i = 0; i < 3; i++) lineIn(pc, x0 + 2 + i * 2, y0 + 2, x0 + 2 + i * 2, y0 + 5, ink2); }
    for (let x = x0; x < x0 + w; x += 2) pc.set(x, y0 + h + 2, ink2);
    for (let i = 0; i < level; i++) { pc.set(5 + i * 3, 25, ink); pc.set(5 + i * 3, 26, ink); }
  }
}

function ticket(pc) {
  const G = mat(0xf2c23a, { cont: 1.15, warm: 55 });
  const m = M().poly([[2, 8], [30, 6], [30, 24], [2, 26]]);
  // notched ends
  m.sub(M().disk(2, 16, 2.4)).sub(M().disk(30, 15, 2.4));
  ring(pc, m, G);
  vol(pc, m, G, { round: 2.5, spec: 0.85 });
  // stub perforation
  for (let y = 7; y < 26; y += 2) pc.set(22, y + (y > 15 ? 0 : 0), G[5]);
  // red "ONE WAY" stripes and a mole stamp
  const RD = 0xc8383a;
  for (let x = 5; x < 20; x++) { pc.set(x, 11, RD); pc.set(x, 21, RD); }
  const FONT = { O: ['.#.', '#.#', '#.#', '#.#', '.#.'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], E: ['###', '#..', '##.', '#..', '###'] };
  [...'ONE'].forEach((ch, i) => FONT[ch].forEach((row, y) => [...row].forEach((v, x) => { if (v === '#') pc.set(7 + i * 4 + x, 13 + y, 0x6a3a10); })));
  const st = M().disk(26, 15, 2.6);
  st.edge().each((x, y) => pc.set(x, y, RD));
  pc.set(26, 15, RD); pc.set(25, 14, RD); pc.set(27, 14, RD);
  for (const [x, y] of [[4, 3], [28, 28], [16, 2]]) sparkle(pc, x, y, 1, 0xffffff, 0xfff0a0, 0.8);
}

// ---------------------------------------------------------------- dispatcher
export function drawHome(pc, spec, id) {
  switch (spec.k) {
    case 'furn': furniture(pc, spec.t, spec.c); return true;
    case 'floor': swatch(pc, spec, false); return true;
    case 'wall': swatch(pc, spec, true); return true;
    case 'blueprint': blueprint(pc, spec.t, id && /room(\d)/.test(id) ? +id.match(/room(\d)/)[1] : 1); return true;
    case 'ticket': ticket(pc); return true;
    default: return false;
  }
}

// 32×32 icons: home furniture (3/4 view), floor & wall swatches, blueprints, the surface ticket.
// Hand-pixel style on top of lifeKit / gearKit: every box face gets crisp bevelled edges and a
// material painter (planks with seams, grain and knots; bevelled stone courses; woven cloth;
// riveted iron), rounded parts are painted in flat planes, and the whole piece gets the
// hue-tinted ink outline. Small props (books, cups, candles, mushrooms) add life.
import { mat, mix } from './color.js';
import { Mask, maskOf } from './shade.js';
import {
  M, hash2, vnoise, step, ink, inkOf, seam, glint, line, gl, clamp, isTop, isBot, blob, loop, fringe, form, sheen, marks, bumps, speckle,
  blade, tube, spline, steam, twinkle, sparkle, rivet, pits, RAMPS, shadowOf,
} from './lifeKit.js';
import { camera, drawSolid, boxFaces } from './solid.js';
import { leaf, mushroom } from './flora.js';
import { drawWeaponArt } from './gear.js';

const WOOD = () => mat(0x9a6a3a, { cont: 1.1 });
const DWOOD = () => mat(0x6e4626, { cont: 1.12 });
const LWOOD = () => mat(0xc0884e, { cont: 1.08 });
const STONE = () => mat(0x8a847e, { cont: 1.08 });
const IRON = () => mat(0x4a4a54, { cont: 1.2 });
const GOLD = () => mat(0xe8b440, { cont: 1.22, warm: 54 });
const GLOWCAP = () => mat(0x3a9cf0, { cont: 1.1 });

const CAM = (o = {}) => camera({ yaw: o.yaw ?? -0.55, tilt: o.tilt ?? 0.62, cx: o.cx ?? 16, cy: o.cy ?? 21, scale: o.scale ?? 1 });

// ---------------------------------------------------------------- face painters
/** Grain axis of a projected face: unit vector along its longer (or shorter) edge. */
function faceAxes(P, o) {
  const [a, b, c] = P;
  const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]];
  const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
  let g = (o.cross ? l1 < l2 : l1 >= l2) ? [e1[0] / l1, e1[1] / l1] : [e2[0] / l2, e2[1] / l2];
  if (o.vertical) g = [0, 1];
  if (o.horizontal) g = [1, 0];
  return { a, g, n: [-g[1], g[0]] };
}
/** Bevelled edge tone: lit lip on the top-left edges of a face, darker on the bottom-right. */
const edgeK = (m, x, y, k) => { const t = isTop(m, x, y), b = isBot(m, x, y); return t && !b ? k - 1 : b && !t ? k + 1 : k; };

/** Wood: planks (seam every `planks` px across the grain), grain streaks, an odd knot, nail heads. */
const wood = (R, o = {}) => (pc, m, tone, f, P) => {
  const T = clamp(tone + (o.dk || 0), 1, 5);
  const { a, g, n } = faceAxes(P, o);
  const seed = o.seed ?? 1;
  m.each((x, y) => {
    const u = (x + 0.5 - a[0]) * g[0] + (y + 0.5 - a[1]) * g[1], v = (x + 0.5 - a[0]) * n[0] + (y + 0.5 - a[1]) * n[1];
    let k = edgeK(m, x, y, T);
    if (k === T) {
      if (o.planks) { const pv = ((v % o.planks) + o.planks) % o.planks; if (pv < 0.95) k = T + 2; else if (pv < 1.95) k = T - 1; }
      if (k === T) {
        const gn = vnoise(u * 0.16 + seed * 3.1, v * 1.25, seed);
        if (gn > 0.72) k = T + 1; else if (gn < 0.1) k = T - 1;
        if (o.knots && hash2(Math.floor(u / 6), Math.floor(v / 3), seed) < 0.06 && Math.abs((u % 6) - 3) < 0.6) k = T + 2;
      }
    }
    pc.set(x, y, R[clamp(k, o.lo ?? 1, 5)]);
  });
  if (o.nails) {
    const b = m.bounds();
    if (b && b.w > 4 && b.h > 3) for (const [x, y] of [[b.x0 + 1, b.y0 + 1], [b.x1 - 1, b.y0 + 1]]) if (m.get(x, y) && m.get(x + 1, y + 1)) { pc.set(x, y, 0xb8bcc4); pc.set(x + 1, y + 1, R[5]); }
  }
};

/** Stone: staggered courses of bevelled blocks with dark mortar joints. */
const stone = (R, o = {}) => (pc, m, tone) => {
  const h = o.h ?? 3, w = o.w ?? 5;
  m.each((x, y) => {
    const row = Math.floor((y + (o.oy || 0)) / h), off = (row % 2) * Math.floor(w / 2) + Math.floor(hash2(row, 0, 3) * 2);
    const col = Math.floor((x + off) / w);
    const fy = (((y + (o.oy || 0)) % h) + h) % h, fx = (((x + off) % w) + w) % w;
    let k = tone + (hash2(col, row, 5) < 0.28 ? 1 : hash2(col, row, 6) < 0.18 ? -1 : 0);
    if (fy === h - 1 || fx === w - 1) k = tone + 2;
    else if (fy === 0 || fx === 0) k -= 1;
    else if (hash2(x, y, 9) < 0.06) k += 1;
    k = edgeK(m, x, y, k);
    pc.set(x, y, R[clamp(k, 1, 5)]);
  });
};

/** Cloth / upholstery: bevelled, a soft weave, optional checks (patchwork) or tufted buttons. */
const cloth = (R, o = {}) => (pc, m, tone) => {
  m.each((x, y) => {
    let k = edgeK(m, x, y, tone);
    let RR = R;
    if (o.check && ((Math.floor(x / 3) + Math.floor(y / 3)) % 2)) RR = o.check;
    if (k === tone && (x + y * 2) % 4 === 0 && hash2(x, y, 3) < 0.5) k++;
    pc.set(x, y, RR[clamp(k, 1, 5)]);
  });
  if (o.stitch) m.edge().each((x, y) => { if ((x + y) % 2 === 0 && !isBot(m, x, y)) pc.set(x, y, o.stitch); });
};

/** Iron: bevelled plate with a few pits and corner rivets. */
const iron = (R, o = {}) => (pc, m, tone) => {
  m.each((x, y) => pc.set(x, y, R[clamp(edgeK(m, x, y, tone), 1, 5)]));
  pits(pc, m.clone().erode(1), R, 0.04, o.seed ?? 2, 0.02);
  if (o.rivets !== false) { const b = m.bounds(); if (b && b.w > 5 && b.h > 4) for (const [x, y] of [[b.x0 + 1, b.y0 + 1], [b.x1 - 2, b.y0 + 1], [b.x0 + 1, b.y1 - 2], [b.x1 - 2, b.y1 - 2]]) if (m.get(x, y) && m.get(x + 1, y + 1)) rivet(pc, x, y, R); }
};

/** Plain bevelled face. */
const plain = (R) => (pc, m, tone) => m.each((x, y) => pc.set(x, y, R[clamp(edgeK(m, x, y, tone), 1, 5)]));

/** Box helper: draws an axis-aligned box with the shared camera. Returns its mask. */
function box(pc, cam, x0, y0, z0, x1, y1, z1, R, o = {}) {
  const faces = boxFaces(x0, y0, z0, x1, y1, z1, R, { paintAll: plain(R), ...o, bias: { top: -0.12, ...(o.bias || {}) } });
  return drawSolid(pc, cam, faces);
}
/** Screen polygon of a box face at height y (top face) for laying things on. */
const topPoly = (cam, x0, z0, x1, z1, y) => [cam.p(x0, y, z0), cam.p(x1, y, z0), cam.p(x1, y, z1), cam.p(x0, y, z1)].map((q) => [q[0], q[1]]);

/** Points relative to (x, y). */
const rel = (pts, x, y) => pts.map(([dx, dy, c]) => [x + dx, y + dy, c]);

/**
 * A hand-built upright crock / pot / base from its outer silhouette and its top (mouth / face)
 * outline: belly shaded from the top-left, a lit lip, the top filled with topTone (or left for
 * the caller: top: false). Returns { all, body, top }.
 */
function crock(pc, R, outer, mouth, o = {}) {
  const all = loop(outer), top = loop(mouth);
  if (o.seam !== false) seam(pc, all, 'shadow');
  const body = all.clone().sub(top);
  const b = all.bounds(), tb = top.bounds();
  form(pc, body, R, { cx: b.x0 + b.w * 0.34, cy: (tb.y0 + tb.y1) / 2, rx: b.w * 0.62, ry: (b.y1 - tb.y0) * 1.2 + 1, dome: 0.25, bias: o.bias ?? 0.04 });
  const lip = top.clone().dilate(1, true).and(all).sub(top);
  const mcy = (tb.y0 + tb.y1 + 1) / 2;
  lip.each((x, y) => pc.set(x, y, R[y + 0.5 >= mcy ? (x < (tb.x0 + tb.x1) / 2 + 2 ? 1 : 2) : 3]));
  if (o.top !== false) { const tk = o.topTone ?? 2; top.each((x, y) => pc.set(x, y, R[clamp(edgeK(top, x, y, tk), 0, 5)])); }
  return { all, body, top };
}

/** Lay a lit strip along the top-front edge of a slab (a crisp catch-light). */
function edgeLight(pc, a, b, c, mask) { line(pc, a[0], a[1], b[0], b[1], (i, X, Y) => (!mask || mask.get(X, Y) ? c : null)); }

// ---------------------------------------------------------------- small props
function candle(pc, x, y, h = 5) {
  const W = mat(0xf2e6c8, { cont: 1.05 });
  const m = M().rect(x - 1, y - h, 3, h);
  seam(pc, m, 'shadow');
  m.each((X, Y) => pc.set(X, Y, W[X === x - 1 ? 1 : X === x + 1 ? 4 : 2]));
  pc.set(x + 1, y - h, W[1]); pc.set(x - 1, y - h + 2, W[1]);
  return () => { gl(pc, x, y - h - 1, 0xffe8a0, 1); gl(pc, x, y - h - 2, 0xffc040, 1); gl(pc, x, y - h - 3, 0xfff4c0, 0.8); };
}
function glowcapProp(pc, x, y, r, h, seed = 3) {
  mushroom(pc, x, y, r, h, GLOWCAP(), mat(0xe4dccb, { cont: 1.05 }), { seed, glow: [0xc6f4ff, 0x6ad6ff], emit: 0.85, spots: [[-0.4, -0.5, 2], [0.3, -0.4, 1]], spotC: [0xe6fbff, 0x8ad8f8], lump: 0.04 });
}

// ---------------------------------------------------------------- furniture
const F = {
  bed(pc, c) {
    if (c === 0xd9b45a) return F.strawBed(pc);
    return F.frameBed(pc, c);
  },
  strawBed(pc) {
    // a heap of straw on a pallet of two split logs, a patched blanket thrown over one end
    const BK = mat(0x7a5434, { cont: 1.1 });
    for (const [x0, y0, x1, y1] of [[3.4, 23.6], [6.4, 27.4]].map(([x, y]) => [x, y, x + 23, y - 7])) {
      const lg = tube(pc, [[x0, y0], [x1, y1]], 2.3, BK, { bias: 0.06, capStart: 0.1, capEnd: 0.1 });
      marks(pc, lg.mask, BK, { dens: 0.25, seed: x0 | 0, len: 3, dir: [0.96, -0.3] });
      for (const [dx, dy, k] of [[0, 0, 2], [1, 0, 1], [0, 1, 3], [-1, 0, 3], [0, -1, 2]]) pc.set(Math.round(x0) + dx, Math.round(y0) + dy, mat(0xd8a868)[k]);
    }
    const SR = mat(0xe0c060, { cont: 1.12 });
    const heap = loop([[3.4, 19.4], [5.4, 16], [10, 13.4], [15.6, 11.6], [21.6, 10.4], [26.6, 11.6], [29.4, 14.6], [28.4, 18.4], [22.6, 21.6], [14.6, 24.2], [7.4, 24.8], [3.8, 22.8]]);
    seam(pc, heap, 'shadow');
    form(pc, heap, SR, { bias: 0.08 });
    for (let i = 0; i < 26; i++) {
      const x = 5 + hash2(i, 1, 6) * 22, y = 12 + hash2(i, 2, 6) * 11, a = -0.4 + (hash2(i, 3, 6) - 0.5) * 1.2;
      line(pc, x, y, x + Math.cos(a) * 3.4, y + Math.sin(a) * 3.4, (n, X, Y) => (heap.get(X, Y) ? SR[i % 3 === 0 ? 1 : i % 3 === 1 ? 4 : 2] : null));
    }
    // patched blanket over the far end
    const BL = mat(0x8a5ab0, { cont: 1.1 });
    const bl = loop([[17, 12.4], [22, 10.6], [27, 11.8], [29.2, 15], [28.4, 19.4], [25.6, 21.6, 1], [23.6, 19.6], [21.4, 21.4, 1], [19.6, 17.6], [17.4, 15.6]]);
    seam(pc, bl, 'shadow');
    form(pc, bl, BL, { bias: 0.08 });
    const pa = loop([[22, 14], [25.6, 13.4], [25.8, 16.6], [22.4, 17]]);
    pa.each((x, y) => pc.set(x, y, mat(0xd8a050)[(x + y) % 2 ? 2 : 3]));
    for (const [x, y] of [[22, 13], [24, 13], [26, 15], [21, 16]]) pc.set(x, y, 0xf0e0c0);
    ink(pc);
    for (const [x0, y0, x1, y1] of [[6, 15, 4, 12], [11, 12, 10, 9], [16, 11, 18, 8], [3, 19, 1, 18], [8, 24, 6, 27]]) line(pc, x0, y0, x1, y1, (i) => (i ? 0xd8b050 : null));
  },
  frameBed(pc, c) {
    const royal = c === 0x6a5ad9;
    const cam = CAM({ cy: 22, scale: 0.95 });
    const W = royal ? DWOOD() : WOOD();
    if (royal) for (const [x, z] of [[-9, -6], [7.5, -6]]) box(pc, cam, x, 0, z, x + 1.5, 20, z + 1.5, W, { paintAll: wood(W, { seed: 2, vertical: true }) });
    // frame + headboard
    box(pc, cam, -9, 0, -6, 9, 4, 7, W, { paintAll: wood(W, { seed: 3, planks: 2.5, nails: true }) });
    if (!royal) {
      box(pc, cam, -10, 0, -6, -8, 11, 7, W, { paintAll: wood(W, { seed: 5, planks: 3, vertical: true }) });
      for (const z of [-6, 5.5]) box(pc, cam, -10.4, 11, z, -7.6, 13, z + 1.5, W, { paintAll: wood(W, { seed: 6 }) });
    }
    const Q = mat(c, { cont: 1.08 });
    // mattress / quilt
    box(pc, cam, -8, 4, -5.5, 8.5, 7, 6.5, Q, { paintAll: cloth(Q, { check: royal ? null : mat(0xf0e0c0, { cont: 1.05 }), stitch: royal ? null : 0xfff4e0 }) });
    if (!royal) {
      // the quilt spills over the side in a wavy hem
      const h0 = cam.p(-6, 4, 6.5), h1 = cam.p(8.5, 4, 6.5);
      const hem = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; hem.push([h0[0] + (h1[0] - h0[0]) * t, h0[1] + (h1[1] - h0[1]) * t + 1.6 + (i % 2) * 1.2]); }
      const drape = M().poly([[h0[0], h0[1] - 1], [h1[0], h1[1] - 1], ...hem.reverse()]);
      seam(pc, drape, 'shadow');
      drape.each((x, y) => pc.set(x, y, ((Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? mat(0xf0e0c0) : Q)[isBot(drape, x, y) ? 4 : 3]));
    }
    {
      // quilt folded back at the head: a soft roll
      const fold = cam.p(-3, 7.2, 0.5);
      const roll = blob(fold[0], fold[1], 6.6, 2.2, { seed: 3, rot: 0.42 });
      seam(pc, roll, 'shadow');
      form(pc, roll, Q, { bias: 0.08 });
    }
    // a puffy pillow
    const pp = cam.p(-5.6, 8, 0.5);
    const pillow = blob(pp[0], pp[1], 4.2, 2.4, { seed: 5, lump: 0.08, rot: 0.42 });
    seam(pc, pillow, 'shadow');
    form(pc, pillow, mat(0xf2ead8, { cont: 1.05 }), { bias: 0.1 });
    if (royal) {
      // canopy + velvet curtains with gold trim
      const CN = mat(c, { cont: 1.12 });
      box(pc, cam, -9.5, 18, -6.5, 9.5, 20.5, 8, CN, { tone: { top: 2 }, paintAll: cloth(CN) });
      const G = GOLD();
      const a = cam.p(-9.5, 18, 8), b = cam.p(9.5, 18, 8);
      line(pc, a[0], a[1], b[0], b[1], (i) => G[i % 2 ? 1 : 2]);
      for (const [x0, z0] of [[-9, -6], [7.5, -6]]) {
        const p0 = cam.p(x0, 18, z0);
        const curtain = M().poly([[p0[0] - 2, p0[1]], [p0[0] + 3, p0[1]], [p0[0] + 2.5, p0[1] + 14], [p0[0] - 2.5, p0[1] + 14]]);
        seam(pc, curtain, 'shadow');
        curtain.each((x, y) => pc.set(x, y, CN[(x - Math.round(p0[0])) % 2 ? 4 : 3]));
        for (let y = 0; y < 2; y++) pc.set(p0[0], p0[1] + 9 + y, G[2]);
      }
      for (const [x, z] of [[8.5, 7], [-9.5, 7]]) box(pc, cam, x, 0, z - 1.5, x + 1.5, 20, z, W, { paintAll: wood(W, { seed: 7, vertical: true }) });
      for (const [x, z] of [[8.5, 7], [-9.5, 7]]) { const t = cam.p(x + 0.75, 21, z - 0.75); pc.set(t[0], t[1], G[1]); pc.set(t[0], t[1] - 1, G[0]); }
    }
    ink(pc);
  },
  forge(pc) {
    const cam = CAM({ cy: 23, scale: 0.9 });
    const S = mat(0x7a7470, { cont: 1.1 });
    box(pc, cam, -10, 0, -7, 10, 10, 6, S, { paintAll: stone(S, { h: 3, w: 5 }) });
    // bed of glowing coals on top
    const fire = M().poly(topPoly(cam, -7, -4, 7, 3, 10));
    seam(pc, fire, 'shadow');
    fire.each((x, y) => { const h = hash2(x, y, 3); gl(pc, x, y, h < 0.22 ? 0xfff0a0 : h < 0.5 ? 0xff9a2a : h < 0.8 ? 0xd84a1a : 0x6a2a1a, h < 0.8 ? 1 : 0.3); });
    // hood + chimney (sooty iron)
    const H = mat(0x4e4a48, { cont: 1.1 });
    box(pc, cam, -4, 16, -6, 4, 22, -1, H, { paintAll: iron(H) });
    // anvil in front: waisted body, horn, lit face
    const A = IRON();
    box(pc, cam, 3, 0, 4, 9, 2.5, 8, A, { paintAll: iron(A, { rivets: false }) });
    box(pc, cam, 4.4, 2.5, 4.8, 7.6, 3.6, 7.2, A, { paintAll: iron(A, { rivets: false }) });
    box(pc, cam, 1.5, 3.6, 4.5, 10.5, 5.4, 7.5, A, { tone: { top: 1 }, paintAll: iron(A, { rivets: false }) });
    ink(pc);
    // flames licking up and sparks
    for (const [x, y, h] of [[12, 13, 5], [15, 12, 7], [18, 13, 5], [20, 14, 3]]) for (let i = 0; i < h; i++) gl(pc, x + Math.round(Math.sin(i * 1.3 + x) * 0.7), y - i, i < 2 ? 0xffd040 : i < 4 ? 0xff9a2a : 0xffe8a0, 1);
    for (const [x, y] of [[10, 4], [21, 6], [17, 3]]) gl(pc, x, y, 0xffc060, 0.9);
  },
  stove(pc) {
    const cam = CAM({ cy: 24, scale: 1 });
    const I = mat(0x3c3c46, { cont: 1.22 });
    // chimney pipe behind
    const PI = IRON();
    box(pc, cam, 3.5, 13, -5, 6, 26, -2.5, PI, { paintAll: iron(PI, { rivets: false }) });
    box(pc, cam, -7, 0, -6, 7, 13, 6, I, { paintAll: iron(I) });
    box(pc, cam, -7.6, 12, -6.6, 7.6, 13.4, 6.6, I, { tone: { top: 1 }, paintAll: iron(I, { rivets: false }) });
    // firebox door with a glowing grate
    const d0 = cam.p(-4.5, 2.5, 6), d1 = cam.p(3.5, 9.5, 6);
    const door = M().poly([cam.p(-4.5, 2.5, 6), cam.p(3.5, 2.5, 6), cam.p(3.5, 9.5, 6), cam.p(-4.5, 9.5, 6)].map((q) => [q[0], q[1]]));
    seam(pc, door, 'shadow');
    door.each((x, y) => pc.set(x, y, I[clamp(edgeK(door, x, y, 3), 1, 5)]));
    const win = door.clone().erode(1);
    win.each((x, y) => { if (isTop(win, x, y) || isBot(win, x, y)) return; gl(pc, x, y, (x % 2 === 0) ? I[5] : (y < (d0[1] + d1[1]) / 2 ? 0xffd060 : 0xff7a2a), x % 2 === 0 ? 0 : 1); });
    void d0; void d1;
    // a pot on the hob
    const P = mat(0x8a5a3a, { cont: 1.12 });
    const pt = cam.p(-1.5, 13.4, -1);
    crock(pc, P, rel([[-5, 0], [-4, -1.6], [0, -2.2], [4.4, -1.4], [5.2, 0.4], [5.2, 2.6], [4.4, 4.6], [1.6, 5.8], [-2.4, 5.6], [-4.6, 4.2], [-5.4, 2]], pt[0], pt[1] - 4.6), rel([[-3.8, 0], [-1, -1.2], [3, -1], [4, 0.2], [1, 1.2], [-2.6, 1]], pt[0], pt[1] - 4.6), { topTone: 4 });
    pc.set(pt[0] - 5, pt[1] - 3, P[3]); pc.set(pt[0] + 5, pt[1] - 3, P[4]);
    ink(pc);
    steam(pc, pt[0] - 2, pt[1] - 7, 6); steam(pc, pt[0] + 1, pt[1] - 7, 5, { phase: 2 });
  },
  planter(pc) {
    const cam = CAM({ cy: 25, scale: 1 });
    const W = WOOD();
    box(pc, cam, -9, 0, -5, 9, 7, 5, W, { paintAll: wood(W, { seed: 9, planks: 2.4, nails: true }) });
    const soil = M().poly(topPoly(cam, -8, -4, 8, 4, 7));
    const SO = mat(0x4e3220, { cont: 1.05 });
    soil.each((x, y) => pc.set(x, y, SO[hash2(x, y, 2) < 0.3 ? 4 : hash2(x, y, 3) < 0.15 ? 2 : 3]));
    glowcapProp(pc, 11.5, 13, 3.6, 4.5, 3);
    glowcapProp(pc, 20.5, 14.6, 3, 3.6, 7);
    glowcapProp(pc, 16.5, 10, 4.4, 6.6, 5);
    ink(pc);
    for (const [x, y] of [[5, 6], [27, 7]]) twinkle(pc, x, y, 0xe8fbff, 0x7fd8ff, 1, 0.8);
  },
  desk(pc) {
    const cam = CAM({ cy: 24, scale: 1 });
    const W = WOOD();
    for (const [x, z] of [[-9.5, -4.5], [8, -4.5], [-9.5, 3.5], [8, 3.5]]) box(pc, cam, x, 0, z, x + 1.5, 7, z + 1, W, { paintAll: wood(W, { seed: 3, vertical: true }) });
    box(pc, cam, 1, 3.5, 3.5, 8, 7, 4.8, W, { paintAll: wood(W, { seed: 6 }) });
    box(pc, cam, -10, 7, -5, 10, 9, 5, W, { paintAll: wood(W, { seed: 2, planks: 3 }) });
    const kn = cam.p(4.5, 5.2, 4.8); pc.set(kn[0], kn[1], 0xe8c060);
    // an open book, a quill in an ink pot, a candle
    const B = mat(0xf4e8cc, { cont: 1.05 });
    box(pc, cam, -7, 9, -3, 1, 10, 3, B, { tone: { top: 1 } });
    const bk = cam.p(-3, 10, 0);
    line(pc, bk[0], bk[1] - 2, bk[0] + 1, bk[1] + 2, 0x9a7a5a);
    for (let i = 0; i < 3; i++) { line(pc, bk[0] - 5, bk[1] - 1 + i, bk[0] - 2, bk[1] - 2 + i, 0xb0a080); line(pc, bk[0] + 2, bk[1] - 1 + i, bk[0] + 4, bk[1] - 2 + i, 0xb0a080); }
    const ip = cam.p(3, 10, -2);
    const pot = blob(ip[0], ip[1] - 1, 1.6, 1.4, { seed: 2 });
    seam(pc, pot, 'shadow'); form(pc, pot, mat(0x2a2a3a, { cont: 1.2 }), { bias: 0.1 });
    tube(pc, [[ip[0], ip[1] - 2], [ip[0] + 4, ip[1] - 9]], (s) => 0.6 + s * 0.8, mat(0xf4f0e8, { cont: 1.1 }), { capEnd: 0.6 });
    const cd = cam.p(7, 10, -3);
    const flame = candle(pc, Math.round(cd[0]), Math.round(cd[1]), 5);
    ink(pc);
    flame();
  },
  rack(pc) {
    const cam = CAM({ cy: 27, scale: 1, yaw: -0.3 });
    const W = DWOOD();
    const wp = wood(W, { seed: 4 });
    box(pc, cam, -12, 0, -2, 12, 2, 2, W, { paintAll: wp });
    box(pc, cam, -12, 0, -2, -10, 20, 2, W, { paintAll: wood(W, { seed: 5, vertical: true }) });
    box(pc, cam, 10, 0, -2, 12, 20, 2, W, { paintAll: wood(W, { seed: 6, vertical: true }) });
    box(pc, cam, -12, 18, -2, 12, 20, 2, W, { paintAll: wp });
    // three weapons standing upright: a sword, an axe, a spear
    const S = RAMPS.steel(), C = mat(0xd9773f, { cont: 1.2 }), G = GOLD(), H = RAMPS.leather();
    const handle = (x, y0, y1) => tube(pc, [[x + 0.5, y0], [x + 0.5, y1]], 0.9, H, { capStart: 0.1, capEnd: 0.1 });
    handle(9, 17, 25.5);
    const blade1 = M().rect(8, 5, 3, 11).union(M().poly([[8, 5], [9.5, 2], [11, 5]]));
    seam(pc, blade1, 'shadow');
    blade1.each((X, Y) => pc.set(X, Y, S[X === 8 ? 1 : X === 9 ? (Y % 4 ? 2 : 0) : 4]));
    for (let x = 6; x <= 13; x++) { pc.set(x, 16, G[x < 9 ? 1 : 2]); pc.set(x, 17, G[4]); }
    handle(15.5, 8, 26);
    const hd = M().poly([[17, 6], [21.6, 4], [23, 8], [21.6, 12.4], [17, 10.6]]);
    seam(pc, hd, 'shadow'); form(pc, hd, C, { dome: 0.2, bias: 0.06 });
    line(pc, 22.6, 5, 22.6, 11, C[1]);
    handle(23, 7, 26);
    const tip = M().poly([[21.5, 7.4], [23.5, 0.6], [25.4, 7.4]]);
    seam(pc, tip, 'shadow'); tip.each((X, Y) => pc.set(X, Y, S[X < 23.5 ? 1 : X < 24.5 ? 3 : 4]));
    box(pc, cam, -12, 8, 0.5, 12, 9.5, 2, W, { paintAll: wp });
    ink(pc);
    glint(pc, 9, 4, 0);
  },
  gemcase(pc) {
    const cam = CAM({ cy: 26, scale: 1 });
    const W = DWOOD();
    box(pc, cam, -6.6, 0, -5.6, 6.6, 2, 5.6, W, { paintAll: wood(W, { seed: 7 }) });
    box(pc, cam, -6, 2, -5, 6, 8, 5, W, { paintAll: wood(W, { seed: 8, vertical: true }) });
    // velvet cushion + a faceted ruby, under a glass dome
    const cu = cam.p(0, 8.5, 0);
    const cs = blob(cu[0], cu[1], 4.6, 1.8, { seed: 3 });
    form(pc, cs, mat(0xb03a4a, { cont: 1.1 }), { bias: 0.08 });
    const gem = M().poly([[cu[0], cu[1] - 7], [cu[0] + 3.4, cu[1] - 3.6], [cu[0], cu[1] - 0.6], [cu[0] - 3.4, cu[1] - 3.6]]);
    seam(pc, gem, 'shadow');
    gem.each((x, y) => gl(pc, x, y, x < cu[0] ? (y < cu[1] - 3.6 ? 0xff8a9a : 0xe02a3a) : (y < cu[1] - 3.6 ? 0xe02a3a : 0x9a1028), 0.6));
    line(pc, cu[0] - 3, cu[1] - 3.6, cu[0] + 3, cu[1] - 3.6, 0xff6a7a);
    const glass = loop(rel([[-6, 0.4], [-6.4, -6], [-5.4, -10.6], [-2.6, -13.2], [1.4, -13.6], [4.8, -11.8], [6.4, -7.4], [6.2, 0.4]], cu[0], cu[1]));
    glass.each((x, y) => { if (pc.alpha(x, y) < 10) pc.set(x, y, 0xcce8f4, 120); });
    ink(pc, { minA: 100 });
    for (let y = 0; y < 8; y++) pc.set(Math.round(cu[0] - 4.6 + y * 0.15), Math.round(cu[1] - 10 + y), 0xffffff, 230);
    pc.set(cu[0] - 1, cu[1] - 5, 0xffffff);
    twinkle(pc, Math.round(cu[0] + 4), Math.round(cu[1] - 13), 0xffffff, 0xffc0d0, 1, 0.6);
  },
  glowlamp(pc, pot = false) {
    if (pot) {
      // a clay pot of glowcaps
      const B = mat(0xb8603a, { cont: 1.12 });
      const c = crock(pc, B, [[8.4, 20], [10, 18], [16, 17.2], [22.4, 18.2], [23.8, 20.2], [23, 22.6], [22.2, 26], [20.4, 28.8], [11.4, 28.6], [9.8, 26], [9, 22.6]],
        [[10, 20], [12.4, 18.8], [16.4, 18.4], [20.4, 18.8], [22.2, 20.2], [19.6, 21.4], [16, 21.6], [12, 21.2]], { top: false });
      for (let x = 8; x < 25; x++) if (c.body.get(x, 23)) { pc.set(x, 23, B[x < 13 ? 1 : 2]); pc.set(x, 24, B[4]); }
      const SO = mat(0x4e3220);
      c.top.each((x, y) => pc.set(x, y, SO[hash2(x, y, 2) < 0.3 ? 4 : 3]));
      glowcapProp(pc, 11, 15.4, 3.6, 4.4, 3);
      glowcapProp(pc, 21.4, 16, 3.2, 4, 9);
      glowcapProp(pc, 16.6, 11, 4.8, 8.6, 5);
    } else {
      // a turned wooden base, a tall pale stem and one big glowing cap
      const B = mat(0xd8c8a6, { cont: 1.08 });
      crock(pc, B, [[9.4, 25], [11, 23.2], [16, 22.6], [21.2, 23.4], [22.6, 25], [22.8, 27.4], [20.4, 29.6], [11.6, 29.4], [9.2, 27.4]], [[11, 25], [13, 23.8], [19, 23.9], [21, 25], [19, 26.2], [13, 26.1]]);
      glowcapProp(pc, 16, 10, 9.4, 15.4, 4);
    }
    ink(pc);
    for (const [x, y] of [[4, 4], [28, 6]]) twinkle(pc, x, y, 0xe8fbff, 0x7fd8ff, 1, 0.8);
  },
  lantern(pc) {
    const I = IRON();
    // post with a scrolled arm and a hanging oil lantern
    tube(pc, [[10, 30], [10, 5]], 1.3, I, { bias: 0.08 });
    const base = blob(10, 30, 4.6, 1.6, { seed: 2 }); seam(pc, base, 'shadow'); form(pc, base, I, { bias: 0.08 });
    tube(pc, [[10, 6], [16, 5.4], [21, 6.4]], 0.9, I, { seam: false });
    tube(pc, [[11, 9.6], [13, 7.4], [15.6, 6.4]], 0.6, I, { seam: false });
    const L = mat(0x3a3a42, { cont: 1.15 });
    const lan = M().rect(16, 12, 9, 10);
    seam(pc, lan, 'shadow');
    lan.each((x, y) => pc.set(x, y, L[clamp(edgeK(lan, x, y, 3), 1, 5)]));
    const glass = M().rect(17, 13, 7, 8);
    glass.each((x, y) => gl(pc, x, y, x === 17 || y === 13 ? 0xfff4c8 : (x + y) % 5 === 0 ? 0xffe090 : 0xffc060, 1));
    line(pc, 20, 13, 20, 20, L[3]);
    const fl = [[20, 16], [20, 17], [21, 17], [20, 18]];
    for (const [x, y] of fl) gl(pc, x, y, 0xfffbe0, 1);
    const cap = M().poly([[15, 12], [20.5, 8.6], [26, 12]]);
    seam(pc, cap, 'shadow'); cap.each((x, y) => pc.set(x, y, L[x < 20 ? 2 : 4]));
    const bot = M().rect(17, 22, 7, 1.6);
    seam(pc, bot, 'shadow'); bot.each((x, y) => pc.set(x, y, L[4]));
    ink(pc);
    line(pc, 20, 7, 20, 8, 0x2a2a30);
    for (const [x, y] of [[14, 17], [28, 16], [20, 26]]) gl(pc, x, y, 0xffd890, 0.5);
  },
  jar(pc) {
    const GLR = mat(0xd8eef0, { cont: 1 });
    // a roomy jar: moss and grass inside, a happy glow beetle, cloth lid and twine
    const jar = loop([[7.4, 9.4], [24.6, 9.2], [25, 12], [24.6, 20], [25.2, 26], [22.6, 29], [16, 29.6], [9, 29.2], [6.8, 26.4], [7.4, 20], [7, 12]]);
    jar.each((x, y) => pc.set(x, y, GLR[x < 10 ? 1 : x > 21 ? 4 : 3], 200));
    const MO = mat(0x4e8a3a, { cont: 1.1 });
    const moss = blob(16, 26, 8, 2.8, { seed: 3, lump: 0.12 }).and(jar);
    moss.each((x, y) => pc.set(x, y, MO[hash2(x, y, 2) < 0.3 ? 2 : 3]));
    for (let x = 8; x < 25; x += 2) line(pc, x, 25, x + (x % 4 ? 1 : -1), 21 + (x % 3), (i) => MO[i ? 2 : 3]);
    const ab = blob(13.6, 17.4, 3, 2.6, { seed: 4 });
    ab.each((x, y) => gl(pc, x, y, (x + y) % 3 ? 0xc8ff7a : 0xe8ffb0, 1));
    const sh = blob(17.6, 16.6, 3.4, 2.6, { seed: 5 });
    seam(pc, sh, 'shadow');
    form(pc, sh, mat(0x34408c, { cont: 1.15 }), { bias: 0.06 });
    line(pc, 17, 14, 18, 19, 0x1a1630);
    pc.set(21, 15, 0x1a1630); pc.set(22, 14, 0x1a1630); pc.set(20, 17, 0xffffff);
    const CL = mat(0xd8c8a0, { cont: 1.08 });
    const lid = loop([[5.6, 8.6], [8.4, 6], [13, 5.2], [17, 5.8], [21.4, 5], [25, 6.4], [26.8, 9], [26.4, 12], [24.4, 11], [22.4, 12.6], [20, 11.2], [17.6, 12.6], [15.2, 11.2], [12.6, 12.8], [10.4, 11.2], [8, 12.4], [5.8, 11.4]]);
    seam(pc, lid, 'shadow');
    form(pc, lid, CL, { bias: 0.08 });
    const TW = RAMPS.twine();
    for (let x = 6; x < 26; x++) pc.set(x, 10, TW[(x % 2) + 2]);
    ink(pc, { minA: 150 });
    for (let y = 12; y < 26; y++) if (y % 4) pc.set(9, y, 0xffffff, 200);
    gl(pc, 12, 16, 0xffffff, 1);
  },
  crystallamp(pc) {
    const S = STONE();
    const c = crock(pc, S, [[8.4, 22.8], [10, 20.8], [14, 20], [19, 20.2], [22.6, 21], [24, 23.2], [23.6, 26.2], [21.8, 28.4], [17.6, 29], [12, 28.8], [9, 27.6], [8, 25.2]], [[10, 22.6], [13, 21.2], [19, 21.4], [22.2, 22.6], [19, 23.8], [13, 23.6]], { topTone: 2 });
    marks(pc, c.body, S, { dens: 0.1, seed: 2, len: 2, dir: [1, 0] });
    // a cluster of cut amethyst points, the big one glowing
    const C = mat(0xb07af6, { cont: 1.15 });
    const pt = (pts, n, emit) => { const m = M().poly(pts); seam(pc, m, 'shadow'); m.each((x, y) => { gl(pc, x, y, C[n(x, y)], emit); }); return m; };
    pt([[9.6, 22], [8, 15], [10.6, 12.4], [13, 21.6]], (x) => (x < 10 ? 2 : 4), 0.6);
    pt([[19.4, 21.6], [22, 13.6], [24.6, 16], [23, 22]], (x) => (x < 22.5 ? 2 : 4), 0.6);
    const big = pt([[12, 22], [11, 9.4], [16, 2], [21, 9.4], [20, 22]], (x, y) => (y < 9.4 ? (x < 16 ? 1 : 2) : x < 14 ? 2 : x < 18 ? 3 : 4), 0.9);
    line(pc, 16, 3, 16, 21, C[1]);
    line(pc, 11, 9.4, 21, 9.4, C[0]);
    void big;
    ink(pc);
    glint(pc, 13, 6, 0);
    for (const [x, y] of [[5, 6], [27, 8], [25, 3]]) twinkle(pc, x, y, 0xffffff, 0xe0a8ff, 1, 0.8);
  },
  fireplace(pc) {
    const cam = CAM({ cy: 27, scale: 1, yaw: -0.3 });
    const S = mat(0x8a827a, { cont: 1.1 });
    box(pc, cam, -12, 0, -3, 12, 20, 3, S, { paintAll: stone(S, { h: 3, w: 6 }) });
    const W = DWOOD();
    box(pc, cam, -13, 14, -3.5, 13, 16.5, 4.5, W, { paintAll: wood(W, { seed: 3, horizontal: true }) });
    // the hearth opening: sooty dark, logs, a crackling fire
    const op = M().poly([cam.p(-6, 0.4, 3), cam.p(6, 0.4, 3), cam.p(6, 9, 3), cam.p(3, 11, 3), cam.p(-3, 11, 3), cam.p(-6, 9, 3)].map((q) => [q[0], q[1]]));
    seam(pc, op, 'shadow');
    op.each((x, y) => pc.set(x, y, y < op.bounds().y0 + 3 ? 0x140c10 : 0x24161a));
    const b = op.bounds();
    const LG = mat(0x6a4424, { cont: 1.1 });
    tube(pc, [[b.x0 + 2, b.y1 - 1.5], [b.x1 - 2, b.y1 - 2.5]], 1.2, LG, { bias: 0.06 });
    tube(pc, [[b.x0 + 3, b.y1 - 0.5], [b.x1 - 1, b.y1 - 0.5]], 1.1, LG, { bias: 0.06 });
    const mx = (b.x0 + b.x1) / 2;
    const fl = M().poly([[mx - 5, b.y1 - 2], [mx - 3, b.y1 - 7], [mx - 1.6, b.y1 - 4.6], [mx, b.y1 - 9.4], [mx + 1.6, b.y1 - 4.6], [mx + 3.4, b.y1 - 7.4], [mx + 5, b.y1 - 2]]);
    fl.each((x, y) => { const t = (b.y1 - y) / 9; gl(pc, x, y, t > 0.6 ? 0xfff2b0 : t > 0.35 ? 0xffc040 : 0xff7a2a, 1); });
    ink(pc);
    for (const [x, y] of [[mx - 2, b.y0 - 1], [mx + 3, b.y0 - 2]]) void x, void y;
    // a candle and a little pot on the mantel
    const cd = cam.p(-8, 16.5, 0.5);
    const flame = candle(pc, Math.round(cd[0]), Math.round(cd[1]), 4);
    const pt = cam.p(8, 16.5, 0.5);
    const pot = blob(pt[0], pt[1] - 2, 2.2, 2, { seed: 4 });
    seam(pc, pot, 'shadow'); form(pc, pot, mat(0x5a8ac8, { cont: 1.1 }), { bias: 0.08 });
    ink(pc);
    flame();
  },
  stool(pc) {
    // a tree stump: rough bark with deep furrows, a cut top with growth rings, a root flare
    const B = mat(0x6e4a2e, { cont: 1.1 });
    const body = loop([[6, 12.4], [16, 11.4], [26, 12.2], [26.4, 18], [25.8, 23], [27.6, 26.6], [22, 28.4], [16, 29], [9.6, 28.6], [4.6, 26.8], [6.4, 22.6], [5.6, 17.4]]);
    for (const [x, y, r] of [[5.4, 24.6, 2.6], [26.8, 24.4, 2.4], [12, 27.4, 2.2], [21, 27.6, 2]]) body.union(blob(x, y, r, r * 0.8, { seed: x | 0 }));
    seam(pc, body, 'shadow');
    form(pc, body, B, { cx: 12, cy: 18, rx: 13, ry: 30, dome: 0.2, bias: 0.04 });
    body.each((x, y) => { const f = Math.sin(x * 1.3 + vnoise(x * 0.3, y * 0.2, 3) * 4); if (f > 0.65 && !isTop(body, x, y)) step(pc, B, x, y, 2, 1, 5); else if (f < -0.85) step(pc, B, x, y, -1, 1, 5); });
    const T = mat(0xd8a868, { cont: 1.08 });
    const top = loop([[6, 12.2], [8, 9.6], [12.4, 8.4], [17, 8.2], [22.4, 9], [26, 11.2], [25.4, 13.8], [21.6, 15.4], [16, 15.8], [10.4, 15.4], [6.8, 14.2]]);
    top.each((x, y) => { const d = Math.hypot((x + 0.5 - 15.4) / 10, (y + 0.5 - 12) / 4) + vnoise(x * 0.4, y * 0.4, 2) * 0.12; pc.set(x, y, T[Math.floor(d * 5.5) % 2 ? 3 : 2]); });
    top.edge().each((x, y) => pc.set(x, y, y < 12 ? B[2] : B[3]));
    pc.set(15, 12, T[5]); line(pc, 17, 11, 22, 13, T[4]);
    // a little red mushroom friend and a moss tuft
    mushroom(pc, 25.6, 24, 2.6, 4, mat(0xd04a3a, { cont: 1.1 }), mat(0xe8e0d0), { seed: 3, spots: [[-0.3, -0.5, 1]], spotC: [0xf8e8e0, 0xd8b8b0] });
    for (const [x, y, c] of [[8, 14, 0x6aa04a], [9, 14, 0x8ac06a], [8, 15, 0x4a7a3a], [10, 15, 0x5a903a]]) pc.set(x, y, c);
    ink(pc);
    glint(pc, 10, 10, 0);
  },
  chair(pc) {
    const cam = CAM({ cy: 27, scale: 1 });
    const W = WOOD();
    const leg = wood(W, { seed: 4, vertical: true });
    for (const [x, z] of [[-6, -5], [4.5, -5], [-6, 4], [4.5, 4]]) box(pc, cam, x, 0, z, x + 1.5, 9, z + 1.5, W, { paintAll: leg });
    // back rest with a carved slat, then the seat
    box(pc, cam, -6.5, 11, -5.5, -5, 24, -4, W, { paintAll: leg });
    box(pc, cam, 5, 11, -5.5, 6.5, 24, -4, W, { paintAll: leg });
    box(pc, cam, -6.5, 21, -5.5, 6.5, 24, -4, W, { paintAll: wood(W, { seed: 6 }) });
    box(pc, cam, -1.5, 11, -5.3, 1.5, 21, -4.2, W, { paintAll: wood(W, { seed: 8, vertical: true }) });
    box(pc, cam, -6.5, 9, -5.5, 6.5, 11, 6, W, { paintAll: wood(W, { seed: 5, planks: 2.6 }) });
    const h = cam.p(0, 17, -4.2); pc.set(h[0], h[1], W[5]); pc.set(h[0] - 1, h[1] - 1, W[1]);
    ink(pc);
  },
  armchair(pc, sofa = false) {
    const cam = CAM({ cy: 25, scale: sofa ? 0.85 : 1 });
    const U = sofa ? mat(0x8a5a32, { cont: 1.1 }) : mat(0x4e8a3e, { cont: 1.1 });
    const hw = sofa ? 13 : 8;
    // root sofa: woody, grained upholstery; mossy armchair: fuzzy living moss
    const tex = sofa ? wood(U, { seed: 3, horizontal: true }) : (p, m, tone) => m.each((x, y) => { let k = edgeK(m, x, y, tone); const h = hash2(x, y, 3); if (h < 0.22) k++; else if (h > 0.9) k--; p.set(x, y, U[clamp(k, 1, 5)]); });
    box(pc, cam, -hw, 2, -5, hw, 8, 6, U, { paintAll: tex });
    box(pc, cam, -hw, 8, -5, hw, sofa ? 20 : 18, -1.5, U, { paintAll: tex });
    const CU = sofa ? mat(0xa86a3a, { cont: 1.08 }) : mat(0x5a9a46, { cont: 1.08 });
    if (sofa) for (const [x0, x1] of [[-hw + 0.5, -0.3], [0.3, hw - 0.5]]) box(pc, cam, x0, 8, -1.5, x1, 10, 5.5, CU, { bias: { top: -0.25 }, paintAll: cloth(CU) });
    else box(pc, cam, -hw + 0.5, 8, -1.5, hw - 0.5, 10, 5.5, CU, { bias: { top: -0.25 }, paintAll: tex });
    if (sofa) for (const x of [-8, -3, 3, 8]) { const p = cam.p(x, 15, -1.5); pc.set(p[0], p[1], U[5]); pc.set(p[0] - 1, p[1] - 1, U[2]); }
    box(pc, cam, -hw - 2.5, 2, -5, -hw, 12, 6, U, { paintAll: tex });
    box(pc, cam, hw, 2, -5, hw + 2.5, 12, 6, U, { paintAll: tex });
    for (const [x, z] of [[-hw - 2, 5], [hw + 1, 5]]) box(pc, cam, x, 0, z - 1, x + 1.2, 2, z, DWOOD());
    if (!sofa) {
      // moss fuzz: tufts on the top edges and a few tiny sprouts
      const sil = maskOf(pc, 128);
      fringe(sil, 16, 20, { dens: 0.4, seed: 3, len: 1, only: (x, y) => y < 18 }).sub(sil).each((x, y) => pc.set(x, y, U[2]));
    }
    ink(pc);
    if (!sofa) { for (const [x, y] of [[9, 9], [21, 8], [14, 13]]) { pc.set(x, y, 0x9ad06a); pc.set(x + 1, y, 0x6aa84a); } pc.set(24, 6, 0xf0e070); }
    else { line(pc, 3, 9, 7, 3, 0x5a3a20); line(pc, 27, 10, 29, 4, 0x5a3a20); pc.set(7, 2, 0x6ab84a); pc.set(8, 2, 0x4a9a3a); pc.set(29, 3, 0x6ab84a); }
  },
  table(pc, long = false) {
    const W = WOOD();
    if (!long) {
      // a round pedestal table with a tea cup and a saucer
      const leg = tube(pc, [[16, 18], [16, 26]], 2, W, { bias: 0.06 });
      void leg;
      const ft = blob(16, 27.4, 6.4, 2, { seed: 2 }); seam(pc, ft, 'shadow'); form(pc, ft, W, { bias: 0.08 });
      const TP = [[3, 13.4], [4.6, 10], [9, 8], [15, 7.2], [21.6, 7.6], [26.6, 9.4], [29.2, 12.6], [28, 16], [23.6, 18.4], [16.6, 19.2], [9.4, 18.6], [4.6, 16.6]];
      const top = loop(TP);
      const ed = loop(TP.map(([x, y]) => [x, y + 1.8]));
      seam(pc, ed.clone().union(top), 'shadow');
      ed.each((x, y) => pc.set(x, y, W[x < 8 ? 3 : 4]));
      top.each((x, y) => {
        const d = Math.hypot((x + 0.5 - 16) / 13, (y + 0.5 - 13) / 5.5);
        let k = (x + 0.5 - 16) / 13 + (y + 0.5 - 13) / 5.5 < -0.6 ? 1 : 2;
        if (Math.floor(d * 6 + vnoise(x * 0.3, y * 0.5, 4) * 0.8) % 2 && k === 2) k = 3;
        pc.set(x, y, W[k]);
      });
      const SC = mat(0xf0e8d8, { cont: 1.05 });
      const sau = blob(20.4, 11.6, 3.4, 1.4, { seed: 3 }); seam(pc, sau, 'shadow'); form(pc, sau, SC, { flatten: 0.5 });
      const cup = loop([[18.4, 7.6, 1], [22.8, 7.4, 1], [22.6, 10], [21.4, 11.2], [19.4, 11], [18.6, 9.8]]);
      seam(pc, cup, 'shadow'); cup.each((x, y) => pc.set(x, y, SC[x < 20 ? 1 : 3]));
      pc.set(23, 9, SC[3]); pc.set(19, 8, 0x8a5a3a); pc.set(20, 8, 0x6a3a1a);
      ink(pc);
      steam(pc, 20, 6, 5, { a: 160 });
    } else {
      const cam = CAM({ cy: 25, scale: 0.9, yaw: -0.4 });
      for (const [x, z] of [[-13, -4], [11.5, -4], [-13, 3], [11.5, 3]]) box(pc, cam, x, 0, z, x + 1.6, 9, z + 1.4, W, { paintAll: wood(W, { seed: 4, vertical: true }) });
      box(pc, cam, -14, 9, -5, 14, 11.5, 5, W, { paintAll: wood(W, { seed: 6, planks: 2.6, knots: true }), bias: { top: -0.22 } });
      // a loaf on a plate and a candlestick
      const c = cam.p(-4, 11.5, 0);
      const pl = blob(c[0], c[1], 4, 1.5, { seed: 2 }); seam(pc, pl, 'shadow'); form(pc, pl, mat(0xf0e8d8), { flatten: 0.5 });
      const BR = mat(0xc8843a, { cont: 1.12 });
      const loaf = blob(c[0], c[1] - 2, 3.4, 2.2, { seed: 5 }); seam(pc, loaf, 'shadow'); form(pc, loaf, BR, { bias: 0.08 });
      line(pc, c[0] - 1, c[1] - 4, c[0] + 1, c[1] - 2, BR[1]);
      const c2 = cam.p(6, 11.5, 0);
      const flame = candle(pc, Math.round(c2[0]), Math.round(c2[1]), 5);
      ink(pc);
      flame();
    }
  },
  rug(pc, c, kind) {
    const R = mat(c, { cont: 1.08 });
    if (kind === 'long') {
      // a woven runner in perspective: border, diamond motif, weave, fringed ends
      const m = M().poly([[2.6, 21], [18, 9.4], [29.4, 14.4], [14, 26.6]]);
      const uv = (x, y) => { const dx = x + 0.5 - 16, dy = y + 0.5 - 18; return [dx * 0.8 - dy * 1.0, dx * 0.45 + dy * 0.85]; };
      m.each((x, y) => {
        const [u, v] = uv(x, y);
        let col = R[3];
        if (Math.abs(v) > 3.6) col = R[2];
        else if (Math.abs(v) > 2.8) col = mix(c, 0xf0d890, 0.55);
        else if ((Math.abs(((u % 6) + 6) % 6 - 3) + Math.abs(v)) < 2.4) col = (Math.abs(((u % 6) + 6) % 6 - 3) + Math.abs(v)) < 1.2 ? R[1] : mix(c, 0xf0d890, 0.5);
        if ((x + y) % 2 === 0 && hash2(x, y, 3) < 0.3) col = mix(col, 0x000000, 0.12);
        pc.set(x, y, col);
      });
      m.each((x, y) => { if (isBot(m, x, y)) pc.set(x, y, R[4]); });
      ink(pc);
      for (const [x0, y0, x1, y1] of [[2.6, 21, 14, 26.6], [18, 9.4, 29.4, 14.4]]) for (let t = 0.05; t < 1; t += 0.11) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; pc.set(x - 1, y + 1, 0xf0e0c0); pc.set(x - 2, y + 2, 0xd8c8a0); }
    } else if (kind === 'fancy') {
      // a medallion carpet with a cusped, scalloped edge: gold border with purple cartouches, a
      // deep pile field with a faint lattice, an eight-point star medallion, gold tassels at the
      // ends, and the front-right lobe flipped over to show its canvas backing
      const GD = mat(0xe8b840, { cont: 1.15, warm: 52 });
      const RP = [];
      const N = 9;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + 0.2, a2 = a + Math.PI / N;
        const j = (k) => (hash2(i, k, 31) - 0.5) * 0.06;
        RP.push([16 + Math.cos(a) * 14.6 * (1 + j(1)), 17.6 + Math.sin(a) * 9.6 * (1 + j(2))]);
        RP.push([16 + Math.cos(a2) * 13.2 * (1 + j(3)), 17.6 + Math.sin(a2) * 8.6 * (1 + j(4)), 1]);
      }
      const m = loop(RP, { seg: 6 });
      // the flap: everything past a fold line at the front-right is turned back over the rug
      const fold = (x, y) => (x + 0.5 - 22.4) * 0.62 + (y + 0.5 - 25.4) * 0.78;
      const flapSrc = M();
      m.each((x, y) => { if (fold(x, y) > 0) flapSrc.set(x, y); });
      m.sub(flapSrc);
      const under = m.clone().shift(0, 1).sub(m);
      under.each((x, y) => pc.set(x, y, R[5]));
      const b1 = m.clone().erode(1), b3 = m.clone().erode(3), b4 = m.clone().erode(4);
      const star = M().poly((() => { const P = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 2.6 : 5.6; P.push([16 + Math.cos(a) * r * 1.1, 17.4 + Math.sin(a) * r * 0.66]); } return P; })());
      const core = M().poly([[16, 14.6], [19, 17.4], [16, 20.2], [13, 17.4]]);
      m.each((x, y) => {
        const lit = (x + 0.5 - 16) / 15 + (y + 0.5 - 17.6) / 10 < -0.5, shade = (x + 0.5 - 16) / 15 + (y + 0.5 - 17.6) / 10 > 0.6;
        let col;
        if (!b1.get(x, y)) col = GD[isBot(m, x, y) ? 4 : 3];
        else if (!b3.get(x, y)) {
          // border: gold ground, a running row of purple cartouches
          const a = Math.atan2((y + 0.5 - 17.6) / 9.6, (x + 0.5 - 16) / 14.6);
          col = (Math.floor(a * 30 / (Math.PI * 2) + 40) % 3 === 0) ? R[3] : GD[lit ? 1 : shade ? 3 : 2];
        } else if (!b4.get(x, y)) col = R[5];
        else if (core.get(x, y)) col = Math.abs(x + 0.5 - 16) + Math.abs(y + 0.5 - 17.4) * 1.3 < 1.6 ? 0xfff0b0 : 0xb02a3a;
        else if (star.get(x, y)) col = GD[(x + y) % 5 ? 2 : 1];
        else {
          // field: deep pile with a faint diamond lattice and little gold flowers on its knots
          const u = (x + 0.5 - 16) * 0.66 + (y + 0.5 - 17.6), v = (x + 0.5 - 16) * 0.66 - (y + 0.5 - 17.6);
          const lu = ((Math.floor(u) % 4) + 4) % 4 === 0, lv = ((Math.floor(v) % 4) + 4) % 4 === 0;
          col = lu && lv ? GD[2] : lu || lv ? R[2] : R[lit ? 2 : shade ? 4 : 3];
        }
        if (b1.get(x, y) && (x + y) % 2 === 0 && hash2(x, y, 3) < 0.22) col = mix(col, 0x000000, 0.14);
        pc.set(x, y, col);
      });
      // star outline so it reads as embroidered
      star.edge().each((x, y) => { if (!core.get(x, y)) pc.set(x, y, GD[4]); });
      // the flipped flap: mirror of the lost lobe across the fold, canvas backing with weave
      const CV = mat(0xd8c8a4, { cont: 1.05 });
      const flap = M();
      flapSrc.each((x, y) => {
        const d = fold(x, y), nx = 0.62, ny = 0.78;
        const X = Math.round(x + 0.5 - 2 * d * nx - 0.5), Y = Math.round(y + 0.5 - 2 * d * ny - 0.5);
        flap.set(X, Y);
      });
      flap.union(flap.clone().dilate(1).and(flap.clone().shift(1, 0).union(flap.clone().shift(0, 1))));
      seam(pc, flap, 'shadow');
      flap.each((x, y) => pc.set(x, y, ((x + y * 2) % 4 === 0) ? CV[3] : CV[fold(x, y) > -1.2 ? 1 : 2]));
      flap.each((x, y) => { if (isBot(flap, x, y)) pc.set(x, y, CV[4]); });
      ink(pc);
      // gold tassels at the two ends
      for (const [x, y, dx] of [[1, 16, -1], [1, 19, -1], [30, 15, 1], [30, 18, 1]]) { pc.set(x, y, GD[2]); pc.set(x + dx, y, GD[3]); pc.set(x + dx, y + 1, GD[4]); }
      glint(pc, 7, 12, 0);
    } else {
      // a braided rag rug, coiled from one long braid: a single spiral (not rings), each turn its
      // own scrap colour, chevron plaits along the braid, a lumpy hand-sewn outline and a thick edge
      const RP = [[1.6, 18.6], [3.4, 13.6], [8, 10], [14, 8.4], [20.4, 8.6], [25.8, 10.6], [29.6, 14.4], [30.6, 19.2], [28, 23.8], [22.6, 26.8], [15.4, 27.6], [8.4, 26.4], [3.6, 23.4]];
      const m = loop(RP);
      const under = m.clone().shift(0, 2).sub(m);
      const SCRAPS = [R, mat(0xe2cca0, { cont: 1.05 }), mat(0x9a5a3a, { cont: 1.08 }), R, mat(0xc8a060, { cont: 1.06 }), mat(0xa8604a, { cont: 1.05 })];
      const cx = 16.4, cy = 18, rx = 14.6, ry = 9.4, NT = 5.2;
      const coil = (x, y) => {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, th = Math.atan2(v, u);
        const r = Math.hypot(u, v) * (1 + 0.05 * Math.sin(th * 3 + 1.3) + (vnoise(x * 0.3, y * 0.3, 5) - 0.5) * 0.06);
        const t = r * NT - (th + Math.PI) / (Math.PI * 2);
        return { t, u, v, th, r };
      };
      under.each((x, y) => { const { t } = coil(x, Math.min(y, 27)); const S = SCRAPS[((Math.floor(t) % 6) + 6) % 6]; pc.set(x, y, S[(x % 2) ? 4 : 5]); });
      m.each((x, y) => {
        const { t, u, v, th, r } = coil(x, y);
        const turn = Math.floor(t), f = t - turn;
        const S = SCRAPS[((turn % 6) + 6) % 6];
        // the braid's round cross-section, lit on the side facing the top-left
        const outward = u * 0.6 + v * 0.8 < 0;
        let k = (f > 0.5) === outward ? 2 : 3;
        // plaits: short slanted strands alternating along the braid
        const arc = th * r * 12;
        if (((Math.floor(arc + (f - 0.5) * (f > 0.5 ? 3 : -3)) % 3) + 3) % 3 === 0) k += 1;
        if (f < 0.14 || f > 0.92) k = 5; // the stitched groove between turns
        if (r < 0.12) k = 3;
        pc.set(x, y, S[clamp(k, 1, 5)]);
      });
      m.each((x, y) => { if (isTop(m, x, y) && !isBot(m, x, y) && (x + y) % 2) step(pc, R, x, y, -1, 1, 5); });
      ink(pc);
      glint(pc, 8, 12, 0);
    }
  },
  fern(pc) {
    const P = mat(0xb8603a, { cont: 1.12 });
    const LR = mat(0x5aa04a, { cont: 1.15 });
    const LD = mat(0x3e8040, { cont: 1.12 });
    for (const [x1, y1, b, R] of [[4, 7, 1.5, LD], [27, 6, -1.5, LD], [12, 2, 1, LR], [20, 2, -1, LR], [2.6, 14, 1, LR], [29.4, 13, -1, LR], [16, 0.6, 0.3, LR]]) blade(pc, 16, 18, x1, y1, 2.6, R, { bend: b, serr: 0.35, teeth: 6, veins: 3 });
    const pot = crock(pc, P, [[7.6, 18], [9, 16], [16, 15.2], [23, 16], [24.6, 18], [24, 20.6], [23, 24.2], [21.4, 27.6], [19.6, 29], [12, 28.8], [10.4, 27.4], [9, 24], [8, 20.6]],
      [[9.4, 18], [12, 16.6], [20, 16.8], [22.8, 18], [20, 19.4], [12, 19.2]], { top: false });
    for (let x = 8; x < 25; x++) if (pot.body.get(x, 21)) { pc.set(x, 21, P[x < 12 ? 1 : 2]); pc.set(x, 22, P[4]); }
    pot.top.each((x, y) => pc.set(x, y, hash2(x, y, 2) < 0.3 ? 0x3a2414 : 0x4e3220));
    ink(pc);
    glint(pc, 10, 21, 0);
  },
  bookshelf(pc) {
    const cam = CAM({ cy: 29, scale: 1, yaw: -0.3 });
    const W = DWOOD();
    box(pc, cam, -10, 0, -3, 10, 27, 3, W, { paintAll: wood(W, { seed: 2, vertical: true }) });
    const cols = [0xc94a3a, 0x3a7ac9, 0x5ab84a, 0xe0b040, 0x9a5ad9, 0xd8783a, 0x3aa8a0, 0xe8e0c8];
    for (let s = 0; s < 3; s++) {
      const y0 = 2 + s * 8.5;
      const a = cam.p(-8.5, y0 + 7, 3), b = cam.p(8.5, y0, 3);
      const x0 = Math.round(Math.min(a[0], b[0])), yt = Math.round(a[1]), wv = Math.round(Math.abs(b[0] - a[0]));
      const cav = M().rect(x0, yt, wv, 7);
      cav.each((x, y) => pc.set(x, y, y === yt ? 0x140a08 : 0x24140c));
      let x = x0, i = s * 3;
      while (x < x0 + wv - 1) {
        const w = 2 + (i % 2), h = 5 + ((i * 7) % 3);
        const C = mat(cols[i % cols.length], { cont: 1.1 });
        const lean = i % 5 === 3 && x < x0 + wv - 4;
        for (let xx = 0; xx < w; xx++) for (let yy = 0; yy < h; yy++) {
          const X = x + xx + (lean ? Math.floor(yy / 3) - 1 : 0), Y = yt + 7 - h + yy;
          if (!cav.get(X, Y)) continue;
          pc.set(X, Y, C[xx === 0 ? 2 : xx === w - 1 ? 4 : 3]);
        }
        pc.set(x, yt + 7 - h, C[1]);
        if (h > 5) { pc.set(x + 1, yt + 7 - h + 2, mix(C[3], 0xf0d890, 0.6)); if (w > 2) pc.set(x + 1, yt + 7 - h + 3, mix(C[3], 0xf0d890, 0.6)); }
        x += w + (lean ? 1 : 0); i++;
      }
    }
    ink(pc);
  },
  barrel(pc) {
    const W = WOOD();
    // bulging staves, iron hoops, a lid with a bung and a drip of root beer
    const body = M().fn((x, y) => { const t = (y + 0.5 - 17) / 12; const rx = 10.4 - t * t * 2.8; return Math.abs(t) <= 1 && Math.abs(x + 0.5 - 16) <= rx; });
    body.union(loop([[8.6, 28.4], [16, 28.6], [23.4, 28.2], [22, 30.6], [16, 31], [10, 30.6]]));
    form(pc, body, W, { cx: 12, cy: 15, rx: 12, ry: 30, dome: 0.2, bias: 0.04 });
    body.each((x, y) => {
      const t = (y + 0.5 - 17) / 12, rx = 10.4 - t * t * 2.8, u = (x + 0.5 - 16) / rx;
      const st = Math.asin(clamp(u, -1, 1)) * 3.2;
      if (Math.abs(st - Math.round(st)) < 0.12 && !isTop(body, x, y)) step(pc, W, x, y, 2, 1, 5);
      else if (vnoise(st * 2, y * 0.25, 3) > 0.75) step(pc, W, x, y, 1, 1, 5);
    });
    const I = IRON();
    for (const y of [8, 14, 21, 27]) for (let x = 0; x < 32; x++) if (body.get(x, y)) { pc.set(x, y, I[x < 11 ? 1 : x < 19 ? 2 : 4]); if (body.get(x, y + 1)) step(pc, W, x, y + 1, 1, 1, 5); }
    for (const y of [14, 21]) { pc.set(7, y, I[0]); pc.set(24, y, I[5]); }
    const top = loop([[8.4, 5.8], [10.4, 3.6], [15, 3], [20.6, 3.4], [23.6, 5], [22.4, 7.2], [16.6, 8], [10.6, 7.6]]);
    seam(pc, top, 'shadow');
    top.each((x, y) => pc.set(x, y, W[clamp(edgeK(top, x, y, 2), 1, 5)]));
    for (let x = 11; x < 22; x += 3) line(pc, x, 4, x - 1, 7, W[3]);
    pc.set(19, 5, W[5]); pc.set(18, 5, W[4]);
    ink(pc);
    pc.set(12, 18, 0x6a3a1a); pc.set(12, 19, 0x8a4a20); pc.set(12, 20, 0x6a3a1a);
    glint(pc, 9, 10, 0);
  },
  crate(pc) {
    const cam = CAM({ cy: 24, scale: 1 });
    const W = LWOOD();
    box(pc, cam, -8, 0, -8, 8, 15, 8, W, { paintAll: wood(W, { seed: 3, planks: 3.8, nails: true, horizontal: true }) });
    // diagonal brace on the front and a red stencil
    const a = cam.p(-7.4, 0.6, 8), b = cam.p(7.4, 14.4, 8);
    const br = M().capsule(a[0], a[1], b[0], b[1], 1.2).and(maskOf(pc, 128));
    seam(pc, br, 'shadow');
    br.each((x, y) => pc.set(x, y, W[(x + y) % 5 === 0 ? 3 : isTop(br, x, y) ? 1 : 2]));
    const f = cam.p(-2, 10, 8);
    const ST = 0xb83a30;
    for (const [dx, dy] of [[-3, 0], [-2, 0], [-1, 0], [1, 0], [2, 0], [3, 0], [-3, 1], [1, 1], [-3, 2], [-2, 2], [1, 2], [2, 2]]) if (!br.get(f[0] + dx, f[1] + dy)) pc.set(f[0] + dx, f[1] + dy, ST);
    // a tuft of packing straw poking out of the lid
    ink(pc);
    for (const [x0, y0, x1, y1] of [[17, 5, 19, 1], [18, 5, 21, 2], [20, 6, 23, 4]]) line(pc, x0, y0, x1, y1, (i) => (i % 2 ? 0xd8b050 : 0xf0d070));
  },
  clock(pc) {
    const cam = CAM({ cy: 30, scale: 1, yaw: -0.35 });
    const W = DWOOD();
    box(pc, cam, -6, 0, -3, 6, 27, 3, W, { paintAll: wood(W, { seed: 9, vertical: true }) });
    box(pc, cam, -6.8, 25, -3.6, 6.8, 27.6, 3.6, W, { tone: { top: 1 }, paintAll: wood(W, { seed: 10 }) });
    const f = cam.p(0, 21, 3);
    const G = GOLD();
    const face = loop(rel([[-4.6, -1.6], [-2.6, -4.4], [0.6, -4.8], [3.8, -3.2], [4.8, 0.2], [3.4, 3.8], [0, 4.8], [-3.4, 3.8], [-4.8, 1]], f[0], f[1]));
    seam(pc, face, 'shadow');
    face.each((x, y) => pc.set(x, y, 0xf2ead4));
    face.edge().each((x, y) => pc.set(x, y, G[(x + 0.5 - f[0]) + (y + 0.5 - f[1]) < 0 ? 1 : 3]));
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pc.set(f[0] + Math.cos(a) * 3.2, f[1] + Math.sin(a) * 3.2, i % 3 ? 0xb0a080 : 0x5a4a3a); }
    line(pc, f[0], f[1], f[0], f[1] - 3, 0x2a1a14); line(pc, f[0], f[1], f[0] + 2, f[1] + 1, 0x2a1a14);
    // pendulum window: glass with the brass bob mid-swing
    const w0 = cam.p(-3, 4, 3), w1 = cam.p(3, 14, 3);
    const win = M().rect(Math.round(w0[0]) + 1, Math.round(w1[1]), 5, 10);
    seam(pc, win, 'shadow');
    win.each((x, y) => pc.set(x, y, x === win.bounds().x0 ? 0x3a2418 : 0x24160e));
    line(pc, Math.round(w0[0]) + 3, Math.round(w1[1]), Math.round(w0[0]) + 4, Math.round(w1[1]) + 6, G[2]);
    const pd = blob(Math.round(w0[0]) + 4.5, Math.round(w1[1]) + 7.5, 1.7, 1.7, { seed: 2 });
    form(pc, pd, G, { bias: 0.1 });
    ink(pc);
    pc.set(Math.round(w0[0]) + 2, Math.round(w1[1]) + 1, 0x6a5a4a);
    glint(pc, Math.round(f[0]) - 2, Math.round(f[1]) - 2, 0);
  },
  painting(pc, c, t) {
    const window = t === 'window';
    const FR = mat(window ? 0xa87448 : 0xd8a840, { cont: 1.15, warm: window ? 40 : 52 });
    // a carved frame: bevelled moulding with corner blocks
    const m = M().rect(2, 4, 28, 23);
    const inner = M().rect(5, 7, 22, 17);
    const sunF = !window && c !== 0x3ac9d9;
    if (window) {
      // a sill below and a little sprout pot on it
      const sill = loop([[0.6, 26.4, 1], [31.4, 26.4, 1], [30.6, 29.4, 1], [1.4, 29.4, 1]]);
      sill.each((x, y) => pc.set(x, y, FR[y === 26 ? 1 : y === 27 ? 2 : 4]));
    }
    if (sunF) {
      // gilt rosettes on the corners and a shell crest on top
      for (const [x, y] of [[2.6, 4.6], [29.4, 4.6], [2.6, 26.4], [29.4, 26.4]]) { const r = loop(rel([[-2.4, 0], [-1, -2.4], [1.2, -2.2], [2.4, 0.2], [1, 2.4], [-1.4, 2.2]], x, y)); r.each((X, Y) => pc.set(X, Y, FR[(X + 0.5 - x) + (Y + 0.5 - y) < 0 ? 1 : 3])); }
      const crest = loop([[11, 4.4], [12.6, 1.6], [16, 0.4], [19.4, 1.6], [21, 4.4]]);
      crest.each((x, y) => pc.set(x, y, FR[(x % 2) ? 2 : 1]));
      line(pc, 16, 1, 16, 4, FR[4]); line(pc, 13, 3, 15, 4, FR[4]); line(pc, 19, 3, 17, 4, FR[4]);
    }
    if (!window && !sunF) {
      // a driftwood frame: four bleached sticks lashed at the corners, ends overhanging
      const DW = mat(0xb8a890, { cont: 1.1 });
      for (const [x0, y0, x1, y1] of [[0.6, 5.4, 31, 4.6], [1, 25.6, 30.6, 26.4], [3.4, 2.4, 3, 29], [28.6, 2, 29, 29.4]]) {
        const st = tube(pc, [[x0, y0], [x1, y1]], 1.6, DW, { bias: 0.06, capStart: 0.2, capEnd: 0.2 });
        marks(pc, st.mask, DW, { dens: 0.2, seed: x0 | 0, len: 3, dir: x0 === x1 || Math.abs(x1 - x0) < 2 ? [0, 1] : [1, 0], lit: false });
      }
      inner.union(M().rect(5, 7, 22, 17));
    }
    if (!window && !sunF) {} else m.clone().sub(inner).each((x, y) => {
      const d = Math.min(x - 2, y - 4, 29 - x, 26 - y);
      let k = d === 0 ? (x - 2 === 0 || y - 4 === 0 ? 1 : 4) : d === 1 ? 2 : (x - 5 < 0 || y - 7 < 0 ? 3 : 2);
      if (d === 2) k = (x < 5 || y < 7) ? 4 : 1;
      pc.set(x, y, FR[k]);
    });
    if (!window && !sunF) for (const [x, y] of [[3, 5], [28, 4], [3, 25], [28, 26]]) { pc.set(x, y, 0xc8a46a); pc.set(x + 1, y, 0x8a6a40); pc.set(x, y + 1, 0x8a6a40); }
    if (window) {
      inner.each((x, y) => pc.set(x, y, mix(0x6ac0f0, 0xd8f0ff, (y - 7) / 17)));
      for (const [x, y, r] of [[10, 12, 2.4], [13, 11, 2.8], [16, 12.4, 2.2], [20, 18, 1.8], [22.4, 17.6, 2]]) blob(x, y, r, r * 0.8, { seed: x | 0 }).each((X, Y) => { if (inner.get(X, Y)) pc.set(X, Y, Y > y ? 0xe0f0ff : 0xffffff); });
      blob(22, 10, 2, 2, { seed: 5, lump: 0.2 }).each((x, y) => gl(pc, x, y, 0xfff4b0, 0.6));
      for (let y = 7; y < 24; y++) { pc.set(15, y, FR[2]); pc.set(16, y, FR[4]); }
      for (let x = 5; x < 27; x++) { pc.set(x, 15, FR[2]); pc.set(x, 16, FR[4]); }
      for (let x = 5; x < 27; x++) pc.set(x, 25, FR[1]);
    } else if (c === 0x3ac9d9) {
      // "The Beach": sky, a rolling sea with white caps, sand and a little umbrella
      inner.each((x, y) => pc.set(x, y, y < 13 ? mix(0x8ad0f8, 0xd8f0ff, (y - 7) / 6) : y < 18 ? ((x + y * 2) % 6 ? (y < 15 ? 0x3ab0d0 : 0x2a90c0) : 0xd8f4ff) : y === 18 ? 0xf8f0d8 : 0xf0d890));
      for (let x = 5; x < 27; x++) if (hash2(x, 21, 3) < 0.2) pc.set(x, 21 + (x % 3), 0xd8b870);
      blob(22, 10, 2.2, 2.2, { seed: 7, lump: 0.2 }).each((x, y) => pc.set(x, y, x + y < 31 ? 0xfff0a0 : 0xffd84a));
      line(pc, 11, 13, 11, 21, 0x8a6a4a);
      blob(11, 13, 4.2, 2, { seed: 2 }).sub(M().rect(0, 14, 32, 10)).each((x, y) => pc.set(x, y, (x - 7) % 3 === 0 ? 0xf8f0e0 : 0xe04a4a));
    } else {
      // "The Sun": a big yellow circle with brush-stroke rays, deeply moving
      inner.each((x, y) => pc.set(x, y, mix(0x5aa0e0, 0x9ad0f8, (y - 7) / 17 + (hash2(x, y >> 1, 3) - 0.5) * 0.15)));
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + 0.2; line(pc, 16 + Math.cos(a) * 6.6, 15 + Math.sin(a) * 6.6, 16 + Math.cos(a) * 8.4, 15 + Math.sin(a) * 8.4, (n, X, Y) => (inner.get(X, Y) ? 0xffe070 : null)); }
      const sun = blob(16, 15, 5.6, 5.6, { seed: 6, lump: 0.04 });
      sun.each((x, y) => pc.set(x, y, (x + 0.5 - 14) ** 2 + (y + 0.5 - 13) ** 2 < 9 ? 0xfff6c0 : x + y < 31 ? 0xfff0a0 : 0xffd34a));
    }
    for (let x = 5; x < 27; x++) pc.set(x, 7, mix(pc.getHex(x, 7), 0x000000, 0.3));
    for (let y = 7; y < 24; y++) pc.set(5, y, mix(pc.getHex(5, y), 0x000000, 0.2));
    ink(pc);
    glint(pc, 3, 5, 0);
  },
  banner(pc) {
    const R = mat(0x8a2a3a, { cont: 1.12 });
    const pole = DWOOD();
    // the cloth hangs in soft folds from a pole, swallow-tailed, with the crossed-claws crest
    const m = M().poly([[6, 5], [26, 5], [26.6, 28.4], [16, 22.4], [5.4, 28.4]]);
    seam(pc, m, 'shadow');
    m.each((x, y) => { const f = Math.sin((x - 6) / 20 * Math.PI * 3); pc.set(x, y, R[f > 0.55 ? 2 : f < -0.55 ? 4 : 3]); });
    m.each((x, y) => { if (isBot(m, x, y) && !isTop(m, x, y)) pc.set(x, y, R[5]); });
    for (let x = 6; x < 26; x++) if (m.get(x, 25 - Math.abs(x - 16) * 0.55)) pc.set(x, Math.round(25 - Math.abs(x - 16) * 0.55), 0xe8b840);
    const G = GOLD();
    const claw = (x0, y0, dx) => { for (let i = 0; i < 9; i++) { pc.set(x0 + i * dx, y0 + i, G[i < 3 ? 1 : 2]); pc.set(x0 + i * dx, y0 + i + 1, G[4]); } for (const k of [-1, 1, 3]) pc.set(x0 + k * dx * -0.5, y0 - 1 + Math.abs(k), G[1]); };
    claw(11, 9, 1); claw(20, 9, -1);
    const shield = blob(15.5, 13.6, 2.4, 2.6, { seed: 2 });
    seam(pc, shield, 'shadow'); form(pc, shield, G, { bias: 0.1 });
    tube(pc, [[2.6, 4.4], [29.4, 4.4]], 1.3, pole, { bias: 0.06 });
    for (const x of [2, 29]) { const k = blob(x + 0.5, 4.4, 1.8, 1.8, { seed: x }); seam(pc, k, 'shadow'); form(pc, k, G, { bias: 0.1 }); }
    ink(pc);
    for (const [x0, y0] of [[8, 5], [24, 5]]) line(pc, x0, y0, x0 + (x0 < 16 ? -2 : 2), 2, 0x3a2a20);
  },
  musicbox(pc) {
    const cam = CAM({ cy: 25, scale: 1 });
    const W = mat(0xa86a3a, { cont: 1.1 });
    box(pc, cam, -8, 0, -5, 8, 8, 5, W, { paintAll: wood(W, { seed: 5 }) });
    // open lid tilted back with a mirror, a brass comb and drum, a dancing mole on a spring
    drawSolid(pc, cam, [{ pts: [[-8, 8, -5], [8, 8, -5], [8, 17, -9], [-8, 17, -9]], R: W, twoSided: true, paint: wood(W, { seed: 7 }) }]);
    const mi = cam.p(0, 13, -7);
    const mirror = blob(mi[0], mi[1], 4, 2.6, { seed: 3 });
    mirror.each((x, y) => pc.set(x, y, (x + y) % 5 === 0 ? 0xffffff : 0xb8d8e8));
    const G = GOLD();
    const c = cam.p(0, 8, 0);
    const well = M().poly(topPoly(cam, -6.6, -3.6, 6.6, 3.6, 8));
    well.each((x, y) => pc.set(x, y, 0x3a2414));
    const drum = M().rect(Math.round(c[0] - 4), Math.round(c[1] - 1), 6, 2);
    drum.each((x, y) => pc.set(x, y, G[y === Math.round(c[1] - 1) ? 1 : 3]));
    for (let x = -4; x <= 1; x += 2) pc.set(c[0] + x, c[1] - 1, G[0]);
    const k = cam.p(8, 4, 2);
    tube(pc, [[k[0], k[1]], [k[0] + 3, k[1] - 0.4], [k[0] + 3.4, k[1] + 2]], 0.7, RAMPS.steel(), { seam: false });
    ink(pc);
    const note = (x, y, cc) => { pc.set(x, y, cc); pc.set(x + 1, y, cc); pc.set(x + 1, y - 1, cc); pc.set(x + 1, y - 2, cc); pc.set(x + 2, y - 3, cc); pc.set(x, y + 1, mix(cc, 0x000000, 0.4)); };
    note(4, 9, 0xf2c23a); note(24, 4, 0xe06aa0); note(12, 3, 0x6ab8f0);
  },
  plushie(pc) {
    const R = mat(0xeaa2b6, { cont: 1.1 });
    // a squishy worm plush sitting curled up: stitched segments, button eyes, a chewed ear, a bow
    const pts = [[25, 26], [17, 27.4], [9.6, 25.6], [7.6, 19.6], [10.6, 14], [15, 11.2]];
    const sw = tube(pc, pts, (s) => 4.4 - s * 0.3, R, { bias: 0.1, capStart: 0.9, capEnd: 0.5 });
    for (let s = 0.12; s < 0.9; s += 0.13) {
      const [x, y] = sw.at(s), [x2, y2] = sw.at(s + 0.01);
      const tx = x2 - x, ty = y2 - y, tl = Math.hypot(tx, ty) || 1, nx = ty / tl, ny = -tx / tl;
      line(pc, x - nx * 4, y - ny * 4, x + nx * 4, y + ny * 4, (i, X, Y) => (sw.mask.get(X, Y) ? (i % 2 ? R[4] : 0xf8e4ea) : null));
    }
    // head with ears (one chewed)
    const head = blob(18, 9.6, 6.6, 5.6, { seed: 3, lump: 0.04 });
    const earL = blob(13.4, 4.6, 2, 2.6, { seed: 5, rot: -0.4 });
    const earR = blob(22.8, 4.4, 2, 2.6, { seed: 6, rot: 0.4 }).sub(M().poly([[22, 1.6], [25.4, 2.6], [23.4, 4.2]]));
    for (const e of [earL, earR]) { seam(pc, e, 'shadow'); form(pc, e, R, { bias: 0.08 }); }
    seam(pc, head, 'shadow');
    form(pc, head, R, { bias: 0.08 });
    for (const [x, y] of [[13, 5], [22, 5]]) pc.set(x, y, R[4]);
    ink(pc);
    // the chewed edge of the right ear: little nibbles
    pc.set(23, 2, 0x8a4a5a); pc.set(24, 3, 0x8a4a5a);
    for (const [x, y] of [[15, 9], [20, 9]]) { pc.set(x, y, 0x1a1220); pc.set(x + 1, y, 0x1a1220); pc.set(x, y + 1, 0x1a1220); pc.set(x + 1, y + 1, 0x3a2a3a); pc.set(x, y, 0x6a6a7a); }
    pc.set(17, 12, 0xc05a70); pc.set(18, 12, 0xc05a70);
    for (const [x, y] of [[13, 12], [22, 12]]) pc.set(x, y, 0xf4a0b0);
    // a blue bow on the tail and a stitched patch
    const BW = mat(0x5a8ae0, { cont: 1.1 });
    for (const [x, y, k] of [[26, 22, 2], [27, 21, 1], [27, 22, 3], [28, 23, 3], [25, 23, 3], [24, 24, 4], [26, 23, 4]]) pc.set(x, y, BW[k]);
    for (const [x, y] of [[11, 21], [12, 22], [11, 23], [13, 21]]) pc.set(x, y, 0xfff0f4);
  },
  tank(pc) {
    const cam = CAM({ cy: 24, scale: 0.9, yaw: -0.35 });
    const I = IRON();
    box(pc, cam, -13, 0, -5, 13, 2, 5, I, { paintAll: iron(I, { rivets: false }) });
    const G = mat(0x7ad0f0, { cont: 0.9 });
    box(pc, cam, -12.5, 2, -4.5, 12.5, 16, 4.5, G, { paintAll: (p, m, tone) => m.each((x, y) => p.set(x, y, G[Math.min(4, tone)], 230)) });
    // water line, sand, swaying weed, two content blind fish, bubbles
    const f0 = cam.p(-12, 2, 4.5), f1 = cam.p(12, 13, 4.5);
    const yTop = Math.round(f1[1]);
    for (let x = Math.round(f0[0]); x < f1[0]; x++) { pc.set(x, yTop, 0xe8f8ff); pc.set(x, yTop + 1, 0xa8e0f4); }
    for (let x = Math.round(f0[0]); x < f1[0]; x++) { pc.set(x, Math.round(f0[1]) - 1, 0xe8d090); pc.set(x, Math.round(f0[1]) - 2, (x % 3) ? 0xe8d090 : 0xd0b878); }
    for (const x of [f0[0] + 3, f0[0] + 18]) for (let y = 0; y < 7; y++) { pc.set(x + Math.round(Math.sin(y * 0.9) * 0.8), f0[1] - 3 - y, y % 2 ? 0x5aaa4a : 0x3a8a3a); }
    for (const [x, y, d] of [[f0[0] + 8, yTop + 4, 1], [f0[0] + 14, yTop + 7, -1]]) {
      const fm = blob(x, y, 2.6, 1.4, { seed: 2 });
      seam(pc, fm, 'shadow'); form(pc, fm, mat(0xf2bcb2, { cont: 1.1 }), { bias: 0.1 });
      pc.set(x - 3 * d, y, 0xe896ae); pc.set(x - 3 * d, y - 1, 0xe896ae); pc.set(x - 3 * d, y + 1, 0xe896ae);
      pc.set(x + 1.6 * d, y - 0.6, 0xe0e8f8);
    }
    ink(pc, { minA: 150 });
    for (const [x, y] of [[f0[0] + 11, yTop + 2], [f0[0] + 12, yTop]]) pc.set(x, y, 0xffffff);
    const g0 = cam.p(-12, 15, 4.5);
    line(pc, g0[0] + 1, g0[1] + 1, g0[0] + 3, g0[1] + 6, 0xffffff);
  },
  fountain(pc) {
    const S = mat(0x9a948e, { cont: 1.1 });
    // a carved stone basin, a pedestal with a little bowl, water arcing down
    const RIM = [[1.6, 22.6], [3.6, 19.4], [8.6, 17.4], [15.4, 16.8], [22.4, 17.2], [27.6, 18.8], [30.4, 22], [30, 25], [16, 26.4], [2, 25.2]];
    const basin = loop([[1.6, 22.6], [3.6, 19.4], [8.6, 17.4], [15.4, 16.8], [22.4, 17.2], [27.6, 18.8], [30.4, 22], [30.6, 26.6], [27.6, 29.4], [21, 30.8], [11, 30.8], [4.4, 29.2], [1.4, 26.4]]);
    form(pc, basin, S, { cx: 12, cy: 22, rx: 16, ry: 12, dome: 0.2, bias: 0.04 });
    marks(pc, basin, S, { dens: 0.07, seed: 3, len: 2, dir: [1, 0] });
    for (let x = 3; x < 30; x += 5) line(pc, x, 24, x, 28, (i, X, Y) => (basin.get(X, Y) && !isBot(basin, X, Y) ? S[4] : null));
    const water = loop([[4.4, 22.4], [7.4, 19.8], [15, 18.8], [23, 19.2], [27.6, 21.6], [25.6, 24.4], [16, 25.6], [7, 24.8]]);
    water.each((x, y) => pc.set(x, y, (x * 2 + y * 3) % 7 === 0 ? 0x9ad8f8 : y < 21 ? 0x3a90c8 : 0x5ab8e6));
    loop(RIM).clone().sub(water).each((x, y) => { if (y < 25) pc.set(x, y, y < 21 ? S[1] : S[2]); });
    const col = M().rect(14, 10, 4, 13);
    seam(pc, col, 'shadow');
    col.each((x, y) => pc.set(x, y, S[x === 14 ? 1 : x === 17 ? 4 : 2]));
    const tb = loop([[9.4, 10.2], [11.4, 8.2], [16, 7.6], [21, 8.2], [22.8, 10.2], [21, 12.4], [16, 13], [11, 12.4]]);
    seam(pc, tb, 'shadow');
    tb.each((x, y) => pc.set(x, y, S[clamp(edgeK(tb, x, y, 2), 1, 5)]));
    loop([[12, 10], [14, 9], [18.4, 9], [20.2, 10], [18, 11], [14, 11]]).each((x, y) => pc.set(x, y, 0x5ab8e6));
    ink(pc);
    for (const s of [-1, 1]) for (let i = 0; i < 10; i++) { const x = 16 + s * i * 1.05, y = 8 - Math.sin(i / 10 * Math.PI) * 4 + i * 1.1; pc.set(x, y, i % 3 ? 0xbfe6ff : 0xffffff); }
    pc.set(16, 4, 0xffffff); pc.set(16, 5, 0xbfe6ff); pc.set(16, 6, 0xffffff);
    for (const [x, y] of [[6, 20], [26, 21], [10, 24]]) pc.set(x, y, 0xffffff);
  },
  trophy(pc) {
    const W = DWOOD();
    const cam = CAM({ cy: 29, scale: 1 });
    box(pc, cam, -7, 0, -4, 7, 4, 4, W, { paintAll: wood(W, { seed: 3 }) });
    const G = GOLD();
    // a golden pickaxe mounted on a stand
    tube(pc, [[16.5, 24], [16.5, 17]], 1.5, G, { bias: 0.1 });
    tube(pc, [[10, 22], [22, 6]], 1.4, G, { bias: 0.1 });
    const head = M();
    for (let t = -10; t <= 9; t += 0.25) head.disk(21 + t * 0.6 + t * t * 0.03, 6 + t * 0.8, Math.max(0.6, 2.1 - Math.abs(t) / 5.5));
    seam(pc, head, 'shadow');
    form(pc, head, G, { bias: 0.1 });
    // brass plaque on the plinth
    const p = cam.p(0, 2, 4);
    const pl = M().rect(Math.round(p[0] - 3), Math.round(p[1] - 1), 7, 2);
    pl.each((x, y) => pc.set(x, y, G[y === Math.round(p[1] - 1) ? 1 : 3]));
    ink(pc);
    glint(pc, 16, 9, 1); glint(pc, 14, 4, 0);
    for (const [x, y] of [[7, 4], [27, 14], [5, 15]]) twinkle(pc, x, y, 0xffffff, 0xfff0a0, 1, 0.7);
  },
  statue(pc) {
    const S = mat(0xe4e0d8, { cont: 1.05 });
    const cam = CAM({ cy: 30, scale: 1 });
    box(pc, cam, -8, 0, -6, 8, 6, 6, mat(0x9a948e, { cont: 1.08 }), { tone: { top: 2 }, paintAll: stone(mat(0x9a948e, { cont: 1.08 }), { h: 3, w: 6 }) });
    // a heroic marble mole in profile: pear body, long snout, a raised digging paw gripping a pick
    const body = loop([[8.6, 15], [11.6, 11.6], [16.6, 11], [20.6, 13], [22.4, 17.4], [22, 22.4], [19.6, 25.8], [14, 26.4], [9.4, 24.6], [7.4, 20]]);
    const head = loop([[10.4, 9], [12.6, 5.4], [16.6, 4], [20.4, 5.2], [24, 7.4], [27.4, 9], [27.6, 10.6], [24.6, 11.4], [20, 12.4], [15, 12.8], [11.4, 11.6]]);
    for (const m of [body, head]) { seam(pc, m, 'shadow'); form(pc, m, S, { bias: 0.06 }); }
    marks(pc, body, S, { dens: 0.05, seed: 2, len: 2, dir: [1, 1] });
    const PK = mat(0xc8c0b8, { cont: 1.05 });
    tube(pc, [[23.4, 19], [27.4, 6]], 0.8, PK, { capEnd: 0.1 });
    const pick = M();
    for (let t = -5; t <= 5; t += 0.25) pick.disk(27.4 + t * 0.9, 5.6 + t * 0.4 - Math.abs(t) * 0.25, Math.max(0.5, 1.2 - Math.abs(t) / 6));
    seam(pc, pick, 'shadow'); form(pc, pick, PK, { bias: 0.08 });
    const paw = loop([[20.6, 15.4], [23, 14], [25.4, 15], [25.6, 17.6], [23.4, 18.8], [21, 18]]);
    seam(pc, paw, 'shadow'); form(pc, paw, S, { bias: 0.08 });
    for (const x of [22, 24]) pc.set(x, 18, S[5]);
    // squinting eye, nose tip, a crease of fur at the neck
    line(pc, 17, 7, 19, 7, S[5]); pc.set(18, 6, S[4]);
    pc.set(27, 9, S[4]); pc.set(27, 10, S[5]);
    line(pc, 12, 12, 19, 13, (i) => (i % 2 ? S[4] : null));
    for (const [x, y] of [[11, 15], [13, 20]]) pc.set(x, y, S[0]);
    ink(pc);
    line(pc, 9, 19, 11, 22, 0xa8a49c);
  },
};

function furniture(pc, t, c) {
  switch (t) {
    case 'bed': return F.bed(pc, c);
    case 'forge': return F.forge(pc);
    case 'stove': return F.stove(pc);
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
    default: { const cam = CAM(); const W = WOOD(); box(pc, cam, -8, 0, -6, 8, 12, 6, W, { paintAll: wood(W, { planks: 3 }) }); ink(pc); }
  }
}

// ---------------------------------------------------------------- floors & walls
function swatch(pc, spec, wall) {
  const c = spec.c;
  let pat = spec.pat || 'dirt';
  if (wall && pat === 'plank' && c === 0x8a2420) pat = 'panel';
  const gold = !wall && pat === 'tile' && c === 0xe0b040;
  const R = mat(c, { cont: 1.05 });
  // floors: a slab of floor seen from above at an angle; walls: an upright panel with a baseboard.
  // Each material gets its own edge: crumbling dirt, staggered plank ends, stepped flagstones,
  // overhanging moss, a missing tile, a curled gold leaf, a frayed carpet, a peeling paper...
  const uv = wall ? (x, y) => [x - 5, y - 2] : (x, y) => { const dx = x + 0.5 - 16, dy = (y + 0.5 - 15.5) * 1.33; return [(dx + dy) * 0.62 + 10, (dy - dx) * 0.62 + 10]; };
  let area;
  if (wall) {
    area = M().rect(5, 4, 22, 26);
    if (pat === 'dirt') area = loop([[5, 5], [8, 3.4], [12, 4.4], [16, 2.6], [20, 4], [24, 2.8], [27, 4.6, 1], [27, 30, 1], [5, 30, 1]]);
    else if (pat === 'plank') { area = M().rect(5, 4, 22, 26); for (let r = 0; r < 7; r++) { const ext = Math.round(hash2(r, 1, 4) * 2.4) - 1; if (ext > 0) area.rect(27, 4 + r * 4, ext, 3); else if (ext < 0) area.sub(M().rect(26, 4 + r * 4, 1, 3)); } }
    else if (pat === 'stone' || pat === 'brick') { area = M().rect(5, 5, 22, 25); const w = pat === 'brick' ? 3.2 * 2 : 10; for (let x = 5; x < 27; x++) { const k = Math.floor((x - 5) / w); if (k % 2 === 0) area.rect(x, 3, 1, 2); } }
    else if (pat === 'panel') area = M().rect(5, 4, 22, 26).union(M().rect(4, 3, 24, 2));
    else if (pat === 'paper') area = M().rect(5, 4, 22, 26).sub(loop([[22, 3, 1], [28, 3, 1], [28, 9, 1]]));
  } else {
    const D = [[16, 4], [31, 15.5], [16, 27], [1, 15.5]];
    area = M().poly(D);
    if (pat === 'dirt') area = loop([[16, 3.6], [20, 6.4], [24.6, 9], [28, 12.6], [31, 15.6], [27.4, 18.6], [23, 22], [19.6, 25], [16, 27.4], [12, 24.6], [8.6, 22.4], [4.6, 18.8], [1, 15.6], [4.4, 12.4], [8.4, 9.6], [12, 6.8]], { jit: 0.9, seed: 5 });
    else if (pat === 'moss') area = fringe(M().poly(D), 16, 15.5, { dens: 0.55, seed: 4, len: 1.6, lean: 0.2 });
    else if (pat === 'plank') area.each((x, y) => { const [u, v] = uv(x, y); const row = Math.floor(v / 4); if (u > 19.2 - hash2(row, 2, 3) * 2.2 || u < 0.8 + hash2(row, 4, 3) * 1.6) area.set(x, y, 0); });
    else if (pat === 'stone') area.each((x, y) => { const [u, v] = uv(x, y); const row = Math.floor(v / 5), off = row % 2 ? 5 : 0, col = Math.floor((u + off) / 10); if ((u < 2 || u > 18 || v < 2 || v > 18) && hash2(col, row, 6) < 0.45) area.set(x, y, 0); });
    else if (pat === 'tile' && !gold) area.each((x, y) => { const [u, v] = uv(x, y); if (u > 13 && v < 6.5) area.set(x, y, 0); });
    else if (pat === 'checker') area.each((x, y) => { const [u, v] = uv(x, y); if (u < 5 && v > 15) area.set(x, y, 0); });
  }
  const K = new Int8Array(1024).fill(-1);
  area.each((x, y) => {
    const [u, v] = uv(x, y);
    let k = 3, col = null;
    switch (pat) {
      case 'plank': {
        const row = Math.floor(v / 4), off = (row * 7) % 10, fv = ((v % 4) + 4) % 4, fu = (((u + off) % 10) + 10) % 10;
        if (fv < 0.8 || fu < 0.7) k = 5;
        else if (fv < 1.6) k = 2;
        else if (fu < 1.5) k = 4;
        else { const g = vnoise(u * 0.35 + row * 7, fv * 1.6, 3); k = g > 0.7 ? 4 : g < 0.15 ? 2 : 3; }
        if (k === 3 && Math.abs(fu - 8.6) < 0.5 && Math.abs(fv - 2.6) < 0.6) col = R[1];
        break;
      }
      case 'stone': case 'brick': {
        const h = pat === 'brick' ? 3.2 : 5, row = Math.floor(v / h), off = row % 2 ? h : 0;
        const fv = ((v % h) + h) % h, fu = (((u + off) % (h * 2)) + h * 2) % (h * 2);
        const cell = hash2(Math.floor((u + off) / (h * 2)), row, 4);
        if (fv < 0.8 || fu < 0.8) k = 5;
        else if (fv < 1.6 || fu < 1.6) k = 2;
        else if (fv > h - 1 || fu > h * 2 - 1) k = 4;
        else k = cell < 0.3 ? 2 : cell > 0.8 ? 4 : 3;
        if (k === 3 && hash2(x, y, 7) < 0.07) k = 4;
        if (pat === 'stone' && k >= 2 && k <= 4 && cell > 0.6 && hash2(x, y, 8) < 0.25) col = mix(R[k], 0x5a8a3a, 0.35);
        break;
      }
      case 'checker': {
        const dark = (Math.floor(u / 5) + Math.floor(v / 5)) % 2;
        const fu = ((u % 5) + 5) % 5, fv = ((v % 5) + 5) % 5;
        if (dark) col = fu < 1 || fv < 1 ? 0x3a3a44 : fu > 4 || fv > 4 ? 0x1e1e26 : 0x2a2a32;
        else k = fu < 1 || fv < 1 ? 2 : fu > 4 || fv > 4 ? 4 : 3;
        if (!dark && hash2(x, y, 5) < 0.04) k = 1;
        break;
      }
      case 'tile': {
        const fu = ((u % 6.5) + 6.5) % 6.5, fv = ((v % 6.5) + 6.5) % 6.5;
        if (fu < 0.8 || fv < 0.8) k = 5;
        else if (fu < 1.7 || fv < 1.7) k = 2;
        else if (fu > 5.6 || fv > 5.6) k = 4;
        else if (fu < 2.6 && fv < 2.6) k = 1;
        else k = 3;
        if (gold && k === 3 && (u + v * 0.5) % 7 < 0.8) col = R[1];
        if (gold && k === 3 && hash2(Math.floor(u / 6.5), Math.floor(v / 6.5), 2) < 0.3) k = 2;
        break;
      }
      case 'panel': {
        // painted boards: vertical planks over a wainscot, a chair rail across the middle
        const fu = ((u % 5.5) + 5.5) % 5.5;
        if (v > 12 && v < 14.5) k = v < 13 ? 1 : v > 14 ? 4 : 2;
        else if (fu < 0.8) k = 5; else if (fu < 1.6) k = 2;
        else { k = v > 14.5 ? 4 : 3; if (hash2(x, y, 6) < 0.025) k = 1; }
        break;
      }
      case 'moss': { const n = vnoise(u * 0.5, v * 0.5, 2); k = n > 0.62 ? 2 : n < 0.3 ? 4 : 3; if (hash2(x, y, 3) < 0.12) k = 1; if (hash2(x, y, 4) < 0.03) col = 0xe8e070; break; }
      case 'carpet': { const d = Math.max(Math.abs(u - 10), Math.abs(v - 10)); k = d > 8 ? 4 : d > 6.5 ? 2 : d < 2 ? 2 : 3; if (d > 6.5 && d < 8 && (Math.floor(u) + Math.floor(v)) % 3 === 0) col = 0xe8b840; if ((x + y) % 2 === 0 && hash2(x, y, 5) < 0.3) k = Math.min(5, k + 1); break; }
      case 'paper': { k = 3; const fu = ((u % 6) + 6) % 6, fv = ((v % 6) + 6) % 6; if (Math.hypot(fu - 3, fv - 3) < 1.3) { col = (Math.floor(u / 6) + Math.floor(v / 6)) % 2 ? 0xf0d890 : 0xe8a0b0; if (Math.hypot(fu - 2.6, fv - 2.6) < 0.6) col = 0xfff4e0; } else if (u % 3 < 0.5) k = 4; break; }
      default: { const n = hash2(x, y, 9); k = n < 0.14 ? 4 : n > 0.9 ? 2 : 3; if (vnoise(u * 0.4, v * 0.4, 6) > 0.7) k = Math.min(5, k + 1); if (hash2(x, y, 11) < 0.04) col = 0x9a948e; }
    }
    K[y * 32 + x] = k;
    pc.set(x, y, col ?? (k < 0 ? 0x2a2a30 : R[clamp(k, 1, 5)]));
  });
  if (!wall) {
    // a thickness edge on the near sides so the swatch reads as a slab of floor
    area.each((x, y) => { if (!area.get(x, y + 1)) { const k = clamp(K[y * 32 + x] + 1, 1, 5); pc.set(x, y, R[k]); pc.set(x, y + 1, R[5]); } });
    area.edge().each((x, y) => { if (y < 15.5 && x < 16) step(pc, R, x, y, -1, 1, 5); });
  } else {
    for (let x = 0; x < 32; x++) { let y = 0; while (y < 12 && !area.get(x, y)) y++; if (y < 12) { pc.set(x, y, R[1]); if (area.get(x, y + 1)) pc.set(x, y + 1, R[2]); } }
    if (pat === 'dirt') for (const [x0, y0, x1, y1] of [[8, 4, 10, 10], [10, 10, 9, 14], [21, 4, 23, 9], [23, 9, 25, 12]]) line(pc, x0, y0, x1, y1, R[5]);
    const BB = mat(0x5a3a22, { cont: 1.1 });
    for (let x = 5; x < 27; x++) for (let y = 25; y < 30; y++) pc.set(x, y, BB[y === 25 ? 1 : y === 26 ? 2 : y === 29 ? 5 : (x * 3 + y) % 7 === 0 ? 4 : 3]);
    for (let y = 4; y < 25; y++) { pc.set(26, y, mix(pc.getHex(26, y), 0x000000, 0.25)); pc.set(5, y, mix(pc.getHex(5, y), 0xffffff, 0.12)); }
    if (pat === 'paper') { const cu = loop([[22, 3.4], [27.4, 8.6], [23.6, 7.6]]); seam(pc, cu, 'shadow'); cu.each((x, y) => pc.set(x, y, mix(c, 0xf8f0e0, 0.55))); }
  }
  if (gold) { const lf = loop([[14, 2.6], [17.6, 0.6], [19.6, 3.4], [16.6, 5.4]]); seam(pc, lf, 'shadow'); lf.each((x, y) => pc.set(x, y, R[(x + y) % 3 ? 1 : 0])); }
  ink(pc);
  if (wall && pat === 'dirt') for (const [x0, y0, x1, y1] of [[9, 30, 8, 31], [20, 30, 22, 31], [6, 14, 3, 16], [3, 16, 2, 19]]) line(pc, x0, y0, x1, y1, 0x8a6a4a);
  if (!wall && pat === 'carpet') for (let t = 0.08; t < 1; t += 0.12) { const x = 16 + (31 - 16) * t, y = 27 - (27 - 15.5) * t; line(pc, x + 1, y + 1, x + 2, y + 2, 0xe8b840); const x2 = 1 + 15 * t, y2 = 15.5 + 11.5 * t; line(pc, x2 - 1, y2 + 1, x2 - 2, y2 + 2, 0xe8b840); }
  if (gold) for (const [x, y] of [[6, 13], [26, 18]]) twinkle(pc, x, y, 0xffffff, 0xfff0a0, 1, 0.6);
}

// ---------------------------------------------------------------- blueprints & ticket
function blueprint(pc, t, level = 1) {
  const B = mat(0x2e5cb8, { cont: 1.08 });
  // a sheet of blueprint paper, pinned flat, its top-right corner curling; grid, then the plan
  // each sheet is its own: a jittered outline, a dog-eared corner (a different one per plan),
  // sometimes a torn bite out of an edge
  let sd = level * 7;
  for (const ch of t) sd = (sd * 31 + ch.charCodeAt(0)) % 9973;
  const J = (k) => (hash2(sd, k, 13) - 0.5) * 2.4;
  const C = [[2 + J(1), 4 + J(2)], [29 + J(3), 3 + J(4)], [30 + J(5) * 0.5, 28.6 + J(6) * 0.5], [2.6 + J(7) * 0.5, 29.4 + J(8) * 0.4]];
  const sheet = M().poly(C);
  const ci = sd % 4, cn = C[ci], ca = C[(ci + 3) % 4], cb = C[(ci + 1) % 4];
  const toward = (p, q, d) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]); return [p[0] + (q[0] - p[0]) * d / l, p[1] + (q[1] - p[1]) * d / l]; };
  const A = toward(cn, ca, 5.6), Bp = toward(cn, cb, 5.6);
  sheet.sub(M().poly([A, cn, Bp]));
  if (sd % 3 === 0) { const e = toward(C[2], C[3], 9 + (sd % 5)); sheet.sub(loop([[e[0] - 2, e[1] + 1], [e[0] - 0.6, e[1] - 1.6], [e[0] + 0.6, e[1] - 0.6], [e[0] + 1.8, e[1] - 2], [e[0] + 2.4, e[1] + 1]])); }
  sheet.each((x, y) => { const k = edgeK(sheet, x, y, 3); pc.set(x, y, B[k + ((x * 7 + y * 3) % 11 === 0 ? 1 : 0)]); });
  sheet.each((x, y) => { if ((x % 4 === 0 || y % 4 === 0) && hash2(x, y, 1) < 0.85 && !isTop(sheet, x, y)) pc.set(x, y, B[2]); });
  const flap = M().poly([A, Bp, [A[0] + Bp[0] - cn[0], A[1] + Bp[1] - cn[1]]]);
  seam(pc, flap, 'shadow');
  flap.each((x, y) => pc.set(x, y, B[isTop(flap, x, y) ? 1 : 2]));
  line(pc, A[0], A[1], Bp[0], Bp[1], B[5]);
  const ink2 = 0xa8c4f0, inkW = 0xeaf2ff;
  const tmp = new (pc.constructor)(32, 32);
  if (['dagger', 'shortsword', 'axe', 'mace', 'spear', 'longsword', 'warhammer', 'rapier', 'greatsword', 'moleblade'].includes(t)) {
    drawWeaponArt(tmp, t, 0xffffff);
    const sil = maskOf(tmp, 200);
    const shrink = new Mask(32, 32);
    sil.each((x, y) => { const X = Math.round(3.5 + x * 0.8), Y = Math.round(4.5 + y * 0.8); shrink.set(X, Y); });
    shrink.dilate(1).erode(1);
    shrink.each((x, y) => pc.set(x, y, ink2));
    shrink.edge().each((x, y) => pc.set(x, y, inkW));
    for (let i = 4; i < 28; i += 2) { const x = i, y = 31 - i; if (!shrink.get(x, y) && !shrink.get(x + 1, y)) pc.set(x, y, B[2]); }
    // dimension ticks
    for (let x = 6; x < 26; x += 4) pc.set(x, 27, inkW);
    line(pc, 6, 27, 26, 27, (i) => (i % 2 ? ink2 : null));
  } else if (t === 'bellows') {
    const m = M().poly([[8, 10], [22, 12], [22, 20], [8, 22]]);
    m.edge().each((x, y) => pc.set(x, y, inkW));
    for (let x = 11; x < 21; x += 3) line(pc, x, 11, x, 21, ink2);
    line(pc, 22, 16, 27, 16, inkW); line(pc, 4, 16, 8, 16, inkW);
    pc.set(27, 15, inkW); pc.set(27, 17, inkW);
  } else if (t === 'hearth') {
    const m = M().rect(7, 9, 18, 14);
    m.edge().each((x, y) => pc.set(x, y, inkW));
    const o = M().rect(11, 15, 10, 8); o.edge().each((x, y) => pc.set(x, y, ink2));
    for (const [x, y] of [[14, 19], [16, 17], [18, 19], [15, 20], [17, 20]]) gl(pc, x, y, 0xffb070, 0.6);
    line(pc, 12, 9, 12, 5, inkW); line(pc, 15, 9, 15, 5, inkW); line(pc, 12, 5, 15, 5, inkW);
  } else {
    // room plan grows with the extension level: walls, doors, dimension marks
    const w = 12 + level * 3, h = 10 + level * 2;
    const x0 = Math.round(16 - w / 2), y0 = Math.round(16 - h / 2);
    const m = M().rect(x0, y0, w, h);
    m.edge().each((x, y) => pc.set(x, y, inkW));
    for (let x = 14; x < 18; x++) pc.set(x, y0 + h - 1, B[3]);
    line(pc, 14, y0 + h - 1, 17, y0 + h - 4, ink2);
    if (level >= 2) line(pc, x0 + Math.round(w * 0.6), y0, x0 + Math.round(w * 0.6), y0 + h - 5, inkW);
    if (level >= 3) { line(pc, x0, y0 + Math.round(h * 0.45), x0 + Math.round(w * 0.6), y0 + Math.round(h * 0.45), inkW); for (let i = 0; i < 3; i++) line(pc, x0 + 2 + i * 2, y0 + 2, x0 + 2 + i * 2, y0 + 5, ink2); }
    for (let x = x0; x < x0 + w; x += 2) pc.set(x, y0 + h + 2, ink2);
    for (let i = 0; i < level; i++) { pc.set(5 + i * 3, 25, inkW); pc.set(5 + i * 3, 26, inkW); }
  }
  ink(pc);
  // brass drawing pins in the two corners that are not folded
  for (const [x, y] of [C[(ci + 1) % 4], C[(ci + 2) % 4]].map(([x, y]) => [Math.round(x + (x < 16 ? 2 : -3)), Math.round(y + (y < 16 ? 2 : -3))])) { pc.set(x, y, 0xf0d070); pc.set(x + 1, y, 0xc89a3a); pc.set(x, y + 1, 0xb08030); pc.set(x + 1, y + 1, 0x7a5a20); }
}

function ticket(pc) {
  const G = mat(0xf2c23a, { cont: 1.18, warm: 55 });
  const m = M().poly([[2, 8], [30, 6], [30, 24], [2, 26]]);
  m.sub(M().disk(2, 16, 2.4)).sub(M().disk(30, 15, 2.4));
  // a gilt ticket: embossed border, ONE WAY lettering, a stub with a mole stamp
  form(pc, m, G, { flatten: 0.4, dome: 0.6, round: 2.5, bias: 0.06 });
  const inner = m.clone().erode(2);
  inner.edge().each((x, y) => pc.set(x, y, (x + y) % 2 ? G[4] : G[2]));
  for (let y = 7; y < 26; y += 2) if (m.get(22, y)) pc.set(22, y, G[5]);
  const RD = 0xc8383a;
  for (let x = 5; x < 20; x++) { pc.set(x, 11, RD); pc.set(x, 21, RD); }
  const FONT = { O: ['.#.', '#.#', '#.#', '#.#', '.#.'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], E: ['###', '#..', '##.', '#..', '###'] };
  [...'ONE'].forEach((ch, i) => FONT[ch].forEach((row, y) => [...row].forEach((v, x) => { if (v === '#') { pc.set(7 + i * 4 + x, 13 + y, 0x6a3a10); if (!FONT[ch][y + 1] || FONT[ch][y + 1][x] !== '#') pc.set(7 + i * 4 + x, 14 + y, G[1]); } })));
  const st = blob(26, 15, 2.9, 2.7, { seed: 4, lump: 0.2 });
  st.edge().each((x, y) => { if (hash2(x, y, 3) < 0.85) pc.set(x, y, RD); });
  pc.set(26, 15, RD); pc.set(25, 14, RD); pc.set(27, 14, RD); pc.set(26, 16, RD);
  ink(pc);
  glint(pc, 6, 8, 0);
  for (const [x, y] of [[4, 3], [28, 28], [16, 2]]) twinkle(pc, x, y, 0xffffff, 0xfff0a0, 1, 0.8);
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

export { leaf, sparkle, sheen, shadowOf, inkOf, spline, speckle, bumps };

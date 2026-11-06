// Icons for the quest items ({ k: 'quest', t }: src/data/questItems.js), hand-built on the shared
// icon kits (px/lifeKit, px/gearKit) like the relics: control-point silhouettes, planes lit from the
// top-left, seams, an ink outline and real-pixel detail (stitching, grain, stamped marks, paper
// fibre, wax, glints). Authored on the 32-unit design grid, painted natively at S× (px/res.js).
// Hooked into gfx/PixelArt.js drawIconArt.
import {
  M, mat, mix, hash2, vnoise, ink, seam, form, loop, marks, speckle, line, glint, sparkle, stitch, rivet,
  step, isTop, isBot, clamp, toneN, S, SZ, nc, np, dc, pits,
} from './px/lifeKit.js';
import { stick, wrapStick, dents, RAMPS } from './px/gearKit.js';

const GOLD = () => mat(0xe2ae3a, { cont: 1.18, warm: 54 });
const BRASS = () => mat(0xc8944a, { cont: 1.18, warm: 52 });
const PAPER = () => mat(0xe8d8b0, { cont: 0.85 });
const RED = 0xc23c2c;
const P = (pc, X, Y, c) => pc.set(X, Y, c);

function part(pc, m, R, o = {}) {
  if (o.seam !== false) seam(pc, m, 'shadow');
  return form(pc, m, R, o);
}
function carve(pc, R, x0, y0, x1, y1, mask = null, dk = 2) {
  const cut = [];
  line(pc, x0, y0, x1, y1, (i, X, Y) => { cut.push(X, Y); return null; }, mask);
  const on = new Set();
  for (let i = 0; i < cut.length; i += 2) on.add(cut[i + 1] * SZ + cut[i]);
  for (let i = 0; i < cut.length; i += 2) step(pc, R, cut[i], cut[i + 1], dk);
  for (let i = 0; i < cut.length; i += 2) {
    const X = cut[i] + 1, Y = cut[i + 1] + 1;
    if (!on.has(Y * SZ + X) && (!mask || mask.get(X, Y))) step(pc, R, X, Y, -1);
  }
}
/** Paper: a flat sheet with a lit top-left edge, a shaded bottom-right one and soft fibre. */
function paper(pc, m, R, o = {}) {
  m.each((X, Y) => {
    let k = isTop(m, X, Y) && !isBot(m, X, Y) ? 1 : isBot(m, X, Y) ? 4 : o.base ?? 2;
    const n = vnoise(dc(X) * 0.9, dc(Y) * 0.3, o.seed ?? 4);
    if (k === (o.base ?? 2) && n > 0.7) k++;
    if (o.tex) k += o.tex(X, Y) || 0;
    pc.set(X, Y, R[clamp(k, 1, 5)]);
  });
  speckle(pc, m, [R[3], R[4]], 0.02, o.seed ?? 4, (X, Y) => !isTop(m, X, Y));
}

const DRAW = {
  /** Granny's oven mitten: quilted, a cream cuff, scorched where the trouble started. */
  mitten(pc) {
    const R = mat(0xc8642a, { cont: 1.08 }), C = mat(0xe8d8b0, { cont: 0.85 }), SC = mat(0x5a2a12, { cont: 1.1 });
    const m = loop([[11, 4.4], [16.6, 3.2], [21.2, 4.8], [23.4, 8.8], [23.8, 14.6], [23.2, 19.6], [22.6, 23.6], [10.4, 23.6], [10, 20.4], [7.6, 19.2], [5, 16], [4.6, 12.6], [6.2, 10.8], [8.4, 12], [9.6, 14], [9.6, 8.2]]);
    part(pc, m, R, { cx: 15, cy: 12, rx: 9, ry: 10, bias: 0.06 });
    // the thumb's seam and the quilting: diamond stitch lines with puffed pads between
    carve(pc, R, 9.6, 14.4, 10.4, 21, m, 1);
    for (let k = -3; k <= 4; k++) {
      line(pc, 8 + k * 3.6, 4, 8 + k * 3.6 + 18, 22, (i, X, Y) => (m.get(X, Y) && !isTop(m, X, Y) && i % 4 !== 3 ? R[4] : null));
      line(pc, 26 + k * 3.6, 4, 26 + k * 3.6 - 18, 22, (i, X, Y) => (m.get(X, Y) && !isTop(m, X, Y) && i % 4 !== 3 ? R[4] : null));
    }
    // scorch marks: dark singes with an ember-bright ring
    for (const [x, y, r] of [[18, 9.6, 2.4], [13.6, 15.6, 1.6], [20.4, 17.4, 1.2]]) {
      m.each((X, Y) => {
        const d = Math.hypot(dc(X) - x, (dc(Y) - y) * 1.2) + (hash2(X, Y, 3) - 0.5) * 0.8;
        if (d < r * 0.6) pc.set(X, Y, SC[hash2(X, Y, 4) < 0.3 ? 6 : 5]);
        else if (d < r) pc.set(X, Y, SC[3]);
        else if (d < r + 0.5 && hash2(X, Y, 5) < 0.5) { pc.set(X, Y, 0xff9a3a); pc.emit(X, Y, 0.5); }
      });
    }
    // the cuff and its hanging loop
    const cuff = loop([[9.2, 22.2], [23.8, 22.2], [24.6, 28.6], [8.6, 28.6]].map((p) => [...p, 1]));
    part(pc, cuff, C, { flatten: 0.6, bias: 0.06 });
    cuff.each((X, Y) => { if (((X + Y) & 3) === 0 && !isTop(cuff, X, Y)) step(pc, C, X, Y, 1); }); // terry weave
    stitch(pc, [[9.4, 23.4], [23.8, 23.4]], C[5], { gap: 1.5 });
    const lp = M().path([[22.4, 22.8], [25.6, 19.6], [27.6, 21.6], [24.4, 24.4]], 0.6);
    part(pc, lp, C, { bias: 0.1, round: 0.6 });
    ink(pc);
    glint(pc, 13.4, 6.4, 1, R[1]);
  },
  /** Brass weights for the scales: three bells with stamped marks on a worn board. */
  weights(pc) {
    const B = BRASS(), W = RAMPS.wood();
    const bd = loop([[3, 22.6], [29, 22.6], [29.6, 25.4], [28.8, 27.6], [3.2, 27.6], [2.4, 25.4]].map((p) => [...p, 1]));
    bd.each((X, Y) => {
      const y = dc(Y), x = dc(X);
      let k = y < 23.6 ? 1 : y < 25.6 ? 3 : 4;
      if (isBot(bd, X, Y)) k = 5;
      const n = vnoise(x * 0.25, y * 1.6, 3);
      if (n > 0.72 && k > 1) k++;
      pc.set(X, Y, W[clamp(k, 1, 5)]);
    });
    line(pc, 3, 23.6, 29, 23.6, W[4], bd);
    const bell = (cx, w, h, knob) => {
      const top = 22.6 - h + knob * 1.6;
      // a squat bell: rounded shoulders, a waist, a flared foot; a ring handle on top
      const m = loop([[cx - w * 0.3, top + 0.8], [cx, top], [cx + w * 0.3, top + 0.8], [cx + w * 0.4, top + (22.6 - top) * 0.3], [cx + w * 0.34, top + (22.6 - top) * 0.6], [cx + w * 0.52, 21.4], [cx + w * 0.54, 22.8, 1], [cx - w * 0.54, 22.8, 1], [cx - w * 0.52, 21.4], [cx - w * 0.34, top + (22.6 - top) * 0.6], [cx - w * 0.4, top + (22.6 - top) * 0.3]]);
      const ring = M().path([[cx - knob, top + 0.4], [cx - knob, top - knob * 0.9], [cx, top - knob * 1.6], [cx + knob, top - knob * 0.9], [cx + knob, top + 0.4]], 0.55 + knob * 0.18);
      part(pc, ring, B, { bias: 0.1, round: 0.8 });
      part(pc, m, B, { cx: cx - w * 0.15, cy: top + (22.6 - top) * 0.4, rx: w * 0.5, ry: (22.6 - top) * 0.6, bias: 0.06 });
      line(pc, cx - w * 0.5, 21.6, cx + w * 0.5, 21.6, (i, X, Y) => (m.get(X, Y) ? B[i < 3 ? 2 : 4] : null)); // the foot's ridge
      line(pc, cx - w * 0.3, top + (22.6 - top) * 0.55, cx + w * 0.3, top + (22.6 - top) * 0.55, (i, X, Y) => (m.get(X, Y) && !isTop(m, X, Y) ? B[5] : null)); // the waist
      return { m: m.union(ring), top };
    };
    const big = bell(9.2, 10.4, 13.6, 1.5), mid = bell(19.2, 7.6, 9.6, 1.2), sm = bell(25.8, 5, 6.4, 0.9);
    // stamped marks: a crown on the big one, pips on the others
    const X0 = np(9.2), Y0 = np(big.top + 4.2);
    for (const [dx, dy] of [[-3, 0], [-2, -2], [-1, 0], [0, -3], [1, 0], [2, -2], [3, 0], [-3, 1], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1]]) step(pc, B, X0 + dx, Y0 + dy, 2);
    for (const [dx, dy] of [[-3, 2], [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2], [3, 2], [4, 1], [4, 0]]) step(pc, B, X0 + dx, Y0 + dy, -1);
    for (const [x, y] of [[18.2, mid.top + 3], [20.2, mid.top + 3], [25.8, sm.top + 2]]) { const X = np(x), Y = np(y); step(pc, B, X, Y, 2); step(pc, B, X + 1, Y + 1, -1); }
    dents(pc, big.m, B, { dens: 0.05, seed: 4 });
    ink(pc);
    glint(pc, 6.6, big.top + 2.4, 1, B[1]);
    glint(pc, 17, mid.top + 1.6, 0, B[1]);
  },
  /** The old pick from under the stair: a pitted iron head, a split handle with T.T. cut in it. */
  oldpick(pc) {
    const W = RAMPS.oldWood(), I = mat(0x7a7a84, { cont: 1.1 }), RU = mat(0xa8582a, { cont: 1.0 }), TW = RAMPS.twine();
    const h = stick(pc, 7.4, 28, 22.6, 8.6, 1.5, W, { grain: true, seed: 3, knots: [0.4] });
    wrapStick(pc, 7.4, 28, 22.6, 8.6, 1.5, 2, 7.6, TW, { rows: 2, grow: 0.45, tones: [2, 2, 3, 3, 4, 4] });
    // T.T. carved into the handle
    carve(pc, W, 11.4, 19, 13.6, 20.6, h, 2); carve(pc, W, 12.6, 19.8, 12, 21.4, h, 2);
    carve(pc, W, 14, 15.8, 16.2, 17.4, h, 2); carve(pc, W, 15.2, 16.6, 14.6, 18.2, h, 2);
    for (const [x, y] of [[13.4, 22], [16, 18.8]]) { const X = np(x), Y = np(y); step(pc, W, X, Y, 2); }
    // the head: a curved bar, a spike to the left, a worn blunt end on the right
    const head = loop([[4.4, 10.6, 1], [9.4, 6.6], [15.6, 4.6], [22, 4.4], [26.6, 5.8], [29.4, 9.4, 1], [26.4, 8.6], [21.6, 7.8], [16, 8.2], [10.6, 9.6]]);
    part(pc, head, I, { cx: 16, cy: 5, rx: 13, ry: 4, bias: 0.04 });
    line(pc, 6.4, 9.8, 15.8, 5.8, I[1], head); line(pc, 15.8, 5.8, 25.6, 6.4, I[2], head);
    // rust in blotches and pits
    head.each((X, Y) => {
      const n = vnoise(dc(X) * 0.5, dc(Y) * 0.5, 6), k = I.indexOf(pc.get(X, Y));
      if (k < 0) return;
      if (n > 0.58) pc.set(X, Y, RU[clamp(k + (hash2(X, Y, 1) < 0.3 ? 1 : 0), 2, 5)]);
    });
    pits(pc, head, I, 0.07, 9, 0);
    // the eye collar round the handle
    const eye = loop([[19.4, 5.4], [24, 5.6], [23.6, 10.2], [19.2, 10.2]]);
    part(pc, eye, I, { bias: 0.02 });
    rivet(pc, 21, 7, I);
    ink(pc);
    glint(pc, 26.4, 6.8, 0, I[1]);
  },
  /** A charcoal rubbing of the sun hymn: paper hung from a rod, the glyphs pale in grey hatching. */
  rubbing(pc) {
    const R = PAPER(), W = RAMPS.darkWood();
    const sh = loop([[6.4, 5.6, 1], [25.6, 5.6, 1], [25.8, 18], [26.2, 26.4], [24.6, 28.4], [21, 27.4], [16, 28.6], [10.6, 27.6], [7.4, 28.8], [5.8, 26.6], [6.2, 18]]);
    seam(pc, sh, 'shadow');
    paper(pc, sh, R, { seed: 7 });
    // the rubbed panel: charcoal hatching with the carved glyphs left pale
    const panel = loop([[8.4, 8], [23.6, 8], [23.6, 25.2], [8.4, 25.6]]);
    const glyph = M();
    for (const [x, y, w, h] of [[10, 10, 3.6, 1.2], [10, 10, 1.2, 4.4], [15.2, 10, 1.2, 4.6], [15.2, 12.2, 3.4, 1.2], [19.8, 10, 2.4, 1.2], [20.4, 10, 1.2, 4.4],
      [10, 16.6, 4, 1.2], [12.4, 16.6, 1.2, 4.2], [16.2, 16.6, 1.2, 4.2], [16.2, 19.6, 3.2, 1.2], [20.6, 16.6, 1.2, 4.4], [20.6, 16.6, 2, 1.2]]) glyph.rect(x, y, w, h);
    // sun disc glyph at the bottom
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; glyph.line(16 + Math.cos(a) * 1.6, 23.2 + Math.sin(a) * 1.2, 16 + Math.cos(a) * 2.6, 23.2 + Math.sin(a) * 1.9); }
    panel.each((X, Y) => {
      if (glyph.get(X, Y)) { pc.set(X, Y, R[(X + Y) % 5 === 0 ? 2 : 1]); return; }
      const hatch = ((X + Y * 2) % 3 === 0) || hash2(X, Y, 2) < 0.18;
      const n = vnoise(dc(X) * 0.4, dc(Y) * 0.4, 3);
      pc.set(X, Y, hatch ? (n > 0.5 ? 0x3a3238 : 0x524850) : n > 0.6 ? 0x6a6068 : 0x7e7478);
    });
    // charcoal smudge where a thumb went
    sh.each((X, Y) => { const d = Math.hypot(dc(X) - 23.6, dc(Y) - 26); if (d < 2.4 && hash2(X, Y, 8) < 0.5) step(pc, R, X, Y, 2); });
    // the rod and its knobs, a hanging string
    line(pc, 9, 5, 16, 1.6, 0xb89a6a); line(pc, 16, 1.6, 23, 5, 0x8a6a40);
    const rod = M().path([[4, 5.2], [28, 5.2]], 1.1);
    part(pc, rod, W, { bias: 0.1, round: 1 });
    line(pc, 4.6, 4.6, 27.4, 4.6, W[1], rod);
    for (const x of [3.6, 28.4]) part(pc, loop([[x - 1.4, 5.2], [x, 3.4], [x + 1.4, 5.2], [x, 7]]), W, { bias: 0.12 });
    ink(pc);
  },
  /** A gold star coin: a milled rim, a red-enamelled star, its edge showing as it leans. */
  starcoin(pc) {
    const G = GOLD();
    const pts = [], ptsF = [];
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; pts.push([16 + Math.cos(a) * 11.4, 16.6 + Math.sin(a) * 10.8]); ptsF.push([16 + Math.cos(a) * 11.4, 15 + Math.sin(a) * 10.8]); }
    const edge = loop(pts, { seg: 3 });
    // the coin's edge (its thickness) with milling
    edge.each((X, Y) => pc.set(X, Y, G[(X % 3 === 0) ? 5 : 4]));
    const face = loop(ptsF, { seg: 3 });
    seam(pc, face, G[6], { soft: false });
    form(pc, face, G, { cx: 15, cy: 14, rx: 11.4, ry: 10.8, flatten: 0.5, dome: 0.3, bias: 0.1 });
    // raised rim ring and a beaded border inside it
    const inner = face.clone().erode(nc(1.6));
    inner.edge().each((X, Y) => pc.set(X, Y, (dc(X) - 16) + (dc(Y) - 15) < 0 ? G[5] : G[2]));
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, X = np(16 + Math.cos(a) * 8.4), Y = np(15 + Math.sin(a) * 8);
      P(pc, X, Y, G[1]); P(pc, X + 1, Y + 1, G[4]);
    }
    // the star, raised and enamelled red
    const st = [];
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 2.6 : 6; st.push([16 + Math.cos(a) * r, 15.4 + Math.sin(a) * r]); }
    const star = M().poly(st);
    seam(pc, star, G[5], { soft: false });
    const RR = mat(RED, { cont: 1.1 });
    star.each((X, Y) => {
      const x = dc(X) - 16, y = dc(Y) - 15.4, a = Math.atan2(y, x);
      const seg = Math.floor(((a + Math.PI * 2.5) / (Math.PI * 2)) * 10 + 0.5) % 2;
      const lit = Math.cos(a) * -0.6 + Math.sin(a) * -0.8;
      pc.set(X, Y, RR[lit > 0.2 ? (seg ? 1 : 2) : lit < -0.3 ? (seg ? 3 : 4) : seg ? 2 : 3]);
    });
    star.edge().each((X, Y) => { if (isTop(star, X, Y) && !isBot(star, X, Y)) pc.set(X, Y, G[1]); });
    dents(pc, face, G, { dens: 0.04, seed: 3, only: (X, Y) => !star.get(X, Y) });
    ink(pc);
    glint(pc, 10.4, 8.6, 1, G[1]);
    P(pc, np(14.6), np(12.6), 0xffffff);
  },
  /** Rocco's purse: plum velvet on a gold kiss-lock frame, a coin peeking out. */
  purse(pc) {
    const L = mat(0x7a4a8a, { cont: 1.08 }), G = GOLD();
    const body = loop([[7.6, 12.4], [24.4, 12.4], [26.6, 17], [27.4, 22], [25.6, 26.6], [21, 29], [16, 29.4], [11, 29], [6.4, 26.6], [4.6, 22], [5.4, 17]]);
    part(pc, body, L, { cx: 14.6, cy: 18.6, rx: 11, ry: 9, bias: 0.04 });
    // velvet: soft pile direction and a few deep folds from the frame down
    body.each((X, Y) => { if (((X + 2 * Y) % 7) === 0 && !isTop(body, X, Y)) step(pc, L, X, Y, 1); });
    for (const [x0, x1] of [[10, 8.6], [16, 16.6], [22, 23.6]]) carve(pc, L, x0, 14.4, x1, 22.6, body, 1);
    // an R stitched in gold thread
    stitch(pc, [[14, 24.6], [14, 20.2], [16.6, 20.2], [17.2, 21.2], [16.4, 22.2], [14.2, 22.2], [17.6, 24.8]], G[2], { gap: 1.2, mask: body });
    // the kiss-lock frame: a gold arc with two ball clasps
    const fr = M().path([[6.4, 13.4], [9, 11.2], [16, 10.4], [23, 11.2], [25.6, 13.4]], 1.1);
    part(pc, fr, G, { bias: 0.1, round: 1.2 });
    line(pc, 7.4, 12.2, 24.6, 12.2, (i, X, Y) => (fr.get(X, Y) && i % 2 ? G[1] : null));
    for (const x of [14.4, 17.6]) {
      const b = loop([[x, 6.4], [x + 1.6, 7.4], [x + 1.8, 9], [x, 10.4], [x - 1.8, 9], [x - 1.6, 7.4]]);
      part(pc, b, G, { bias: 0.12 });
    }
    rivet(pc, 6, 13, G); rivet(pc, 25.4, 13, G);
    // a coin peeking out, leaning on the purse
    const coin = loop([[2.6, 26.4], [4.6, 23.8], [8.2, 23.4], [10.6, 25.8], [10.4, 28.6], [7.2, 30.2], [3.8, 29.6]]);
    part(pc, coin, G, { bias: 0.1 });
    const ci = coin.clone().erode(nc(1));
    ci.edge().each((X, Y) => pc.set(X, Y, isTop(ci, X, Y) ? G[4] : G[2]));
    ink(pc);
    glint(pc, 13.6, 7, 0, G[1]);
    glint(pc, 9.4, 16, 1, L[1]);
  },
  /** A letter for Loam: a folded envelope with a wax seal, a stamp and an address. */
  letter(pc) {
    const R = PAPER(), WX = mat(0xb8322a, { cont: 1.08 });
    const env = loop([[3.6, 9, 1], [28.4, 8.4, 1], [28.8, 25.6, 1], [3.2, 26, 1]]);
    seam(pc, env, 'shadow');
    paper(pc, env, R, { seed: 9 });
    // the flap: two folded planes meeting at the seal, their crease lines
    const flap = M().poly([[3.6, 9], [16, 18.6], [28.4, 8.4]]);
    flap.and(env).each((X, Y) => { const k = R.indexOf(pc.get(X, Y)); pc.set(X, Y, R[clamp((k < 0 ? 2 : k) + (dc(X) > 16 ? 1 : 0), 1, 5)]); });
    line(pc, 4.2, 9.6, 16, 18.6, R[4], env); line(pc, 27.8, 9, 16, 18.6, R[5], env);
    line(pc, 4.2, 10.4, 15.6, 19.2, R[1], env);
    // the side folds underneath, as faint creases
    line(pc, 3.6, 25.4, 12.8, 18.8, R[3], env); line(pc, 28.4, 25, 19.4, 18.6, R[4], env);
    // a stamp in the corner, with a perforated edge
    const stp = loop([[21.4, 19.6], [27, 19.6], [27, 24.4], [21.4, 24.4]].map((p) => [...p, 1]));
    stp.each((X, Y) => { const e = isTop(stp, X, Y) || isBot(stp, X, Y); pc.set(X, Y, e ? ((X + Y) % 2 ? 0xf4ecd8 : R[3]) : dc(Y) > 22.4 ? 0x5a8a3a : 0x7aa8d8); });
    for (const [x, y] of [[23.6, 21.6], [24.6, 21.6], [24.6, 22.6]]) P(pc, np(x), np(y), 0xffe08a); // a little sun on it
    // address lines in ink
    for (const [y, l] of [[21, 9], [22.8, 7], [24.4, 8]]) line(pc, 6.6, y, 6.6 + l, y, (i) => (i % 9 === 4 || i % 13 === 7 ? null : i % 3 ? 0x4a3a32 : 0x6a5a4a), env);
    // the wax seal: a lumpy blob, a pressed mole in it, a ribbon tail
    for (const [x0, y0, x1, y1] of [[14.6, 19.6, 12.6, 24], [17.4, 19.6, 19.6, 24]]) line(pc, x0, y0, x1, y1, 0x8a2a3a);
    const seal = loop([[16, 14.4], [18.8, 15.2], [20, 17.8], [19, 20.6], [16.2, 21.8], [13.4, 21], [12, 18.2], [13.2, 15.4]], { jit: 0.3, seed: 2 });
    part(pc, seal, WX, { bias: 0.08 });
    const sc = seal.clone().erode(nc(1.4));
    sc.edge().each((X, Y) => pc.set(X, Y, isTop(sc, X, Y) ? WX[5] : WX[2]));
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [-1, 3], [2, 3]]) step(pc, WX, np(15.6) + dx, np(16.8) + dy, 1);
    ink(pc);
    P(pc, np(14), np(15.6), 0xffe0d8);
  },
};

/** drawIconArt hook: true when it drew the spec. */
export function drawQuestIcon(pc, spec) {
  if (!spec || spec.k !== 'quest') return false;
  (DRAW[spec.t] || DRAW.rubbing)(pc);
  return true;
}

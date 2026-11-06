// 32×32 icons: cooking ingredients, shop snacks and every dish from the stove.
// Hand-pixel style on top of lifeKit / gearKit: turned wooden bowls with growth-ring grain,
// glazed plates with a lit rim, glossy broths with a reflected window, lumpy chunks, crumb and
// crust textures, steam; a crisp tinted ink outline and a few flat planes per form.
import {
  M, mat, mix, hash2, vnoise, step, ink, inkOf, seam, glint, line, gl, clamp, isTop, isBot, blob, loop, fringe, form, sheen, marks, bumps,
  speckle, blade, tube, spline, steam, twinkle, sparkle, stitch, rivet, pits, RAMPS,
  S, SZ, dc, nc, np, dot, dotE, alphaD, getD, grain, glD, isTopD, isBotD, stepD,
} from './lifeKit.js';
import { leaf, mushroom } from './flora.js';

// ---------------------------------------------------------------- tableware
const WOODB = () => mat(0xa06a3c, { cont: 1.12 });
const CERAMIC = () => mat(0xece4d6, { cont: 1.05 });
const CLAY = () => mat(0xc2663a, { cont: 1.1 });
const HERB = () => mat(0x5aa84a, { cont: 1.15 });

/**
 * A hand-built vessel (bowl, pot, pan) in 3/4 view from two outlines: `outer` (the whole
 * silhouette, back rim to foot) and `mouth` (the opening seen from above). The body is shaded as
 * a belly lit from the top-left, the rim gets a lit lip, the inside a shadowed back wall.
 * o: wood (growth-ring grain), band (glazed stripe color) + dots, ribs (gourd ribs), dents,
 * chip ([x, y, r] notch out of the rim), bias. Returns the contents surface mask (.mouth, .outer).
 */
function vessel(pc, R, outer, mouth, o = {}) {
  const om = loop(outer), mm = loop(mouth);
  if (o.chip) { const [x, y, r] = o.chip; om.sub(loop([[x - r, y - r * 0.6], [x + r * 0.2, y - r], [x + r, y - r * 0.2], [x + r * 0.3, y + r * 0.5, 1]])); }
  if (o.extra) om.union(o.extra);
  const lip = mm.clone().dilate(1, true).and(om).sub(mm);
  const body = om.clone().sub(mm).sub(lip);
  const b = om.bounds(), mb = mm.bounds();
  const mcx = (mb.x0 + mb.x1 + 1) / 2, mcy = (mb.y0 + mb.y1 + 1) / 2;
  form(pc, body, R, { cx: b.x0 + b.w * 0.34, cy: mcy, rx: b.w * 0.62, ry: (b.y1 - mcy) * 1.35 + 1, dome: 0.3, bias: o.bias ?? 0.04 });
  if (o.wood) {
    for (const k of [0.38, 0.55, 0.7, 0.85]) {
      const cy = mcy - 2, ry = (b.y1 - cy) * k + 1, rx = b.w * 0.5 * k;
      for (let x = b.x0; x <= b.x1; x++) {
        const t = (x + 0.5 - mcx) / rx;
        if (Math.abs(t) >= 1) continue;
        const y = Math.round(cy + ry * Math.sqrt(1 - t * t) + vnoise(x * 0.3, k * 9, 2) * 1.2 - 0.6);
        if (body.get(x, y) && !isBot(body, x, y) && hash2(x, y, 4) > 0.2) step(pc, R, x, y, 1, 1, 5);
      }
    }
  }
  if (o.ribs) for (const f of o.ribs) for (let y = mb.y1; y <= b.y1; y++) { const x = Math.round(mcx + f * (b.w / 2) * Math.sqrt(Math.max(0, 1 - ((y - mb.y1) / (b.y1 - mb.y1 + 1)) ** 2)) * 0.9); if (body.get(x, y) && !isBot(body, x, y)) { step(pc, R, x, y, 1, 1, 5); step(pc, R, x - 1, y, -1, 1, 5); } }
  if (o.band) {
    const by = mb.y1 + (b.y1 - mb.y1) * 0.38;
    body.eachD((X, Y, x, y) => {
      if (Math.abs(y + 0.5 - by - Math.abs(x + 0.5 - mcx) * -0.06) > 1.1) return;
      const k = R.indexOf(pc.get(X, Y));
      pc.set(X, Y, mix(o.band, k <= 2 ? 0xffffff : 0x1a1030, k <= 2 ? 0.22 : k >= 4 ? 0.32 : 0));
    });
    if (o.dots) body.eachD((X, Y, x, y) => { if (Math.abs(y - Math.round(by + 2.6)) < 0.5 && X % 3 === 0 && !isBot(body, X, Y)) pc.set(X, Y, o.dots); });
  }
  if (o.dents) for (const [x, y] of o.dents) { step(pc, R, x, y, 1, 1, 5); step(pc, R, x + 1, y, 1, 1, 5); step(pc, R, x, y - 1, -1, 1, 5); }
  // lit lip all round, brightest at the front-left; the inside wall in shadow at the back
  lip.eachD((X, Y, x, y) => { const front = y + 0.5 >= mcy; pc.set(X, Y, R[front ? (x < mcx + mb.w * 0.3 ? 1 : 2) : (x < mcx - mb.w * 0.25 ? 2 : 3)]); });
  mm.eachD((X, Y, x, y) => pc.set(X, Y, R[y + 0.5 < mcy ? 5 : 4]));
  if (o.glint !== false) glint(pc, Math.round(mb.x0 + mb.w * 0.2), Math.round(mb.y1), 0);
  const surf = mm.clone().erode(1).and(mm.clone().shift(0, 2));
  surf.mouth = mm; surf.outer = om;
  return surf;
}

/**
 * A hand-built platter / plate / board from its top outline (+ optional well outline): a
 * thickness band underneath, a lit rim catch-light, a glaze sheen, an optional painted trim.
 * Returns the well (or the whole top) mask.
 */
function platter(pc, R, top, well = null, o = {}) {
  const tm = loop(top);
  const th = o.thick ?? 1.5;
  const under = tm.clone().shift(0, Math.round(th)).sub(tm);
  if (o.extra) tm.union(o.extra);
  under.eachD((X, Y, x, y) => pc.set(X, Y, R[o.underK ?? 4]));
  const b = tm.bounds();
  const cx = (b.x0 + b.x1 + 1) / 2, cy = (b.y0 + b.y1 + 1) / 2;
  tm.eachD((X, Y, x, y) => { const t = (x + 0.5 - cx) / (b.w / 2) + (y + 0.5 - cy) / (b.h / 2) * 0.6; pc.set(X, Y, R[t < -0.6 ? 1 : t < 0.5 ? 2 : 3]); });
  let wm = tm;
  if (well) {
    wm = loop(well);
    wm.eachD((X, Y, x, y) => pc.set(X, Y, R[3]));
    wm.edge().eachD((X, Y, x, y) => pc.set(X, Y, y + 0.5 < cy ? R[4] : R[1]));
  }
  if (o.trim) { const t2 = tm.clone().erode(2).sub(wm.clone().dilate(1)); t2.edge().eachD((X, Y, x, y) => { if ((X + Y) % 3 !== 0) pc.set(X, Y, y < cy ? mix(o.trim, 0xffffff, 0.15) : o.trim); }); }
  tm.edge().eachD((X, Y, x, y) => { if (y + 0.5 < cy && x < cx + 3 && !tm.get(X, Y - 1)) pc.set(X, Y, R[o.rimK ?? 0]); });
  tm.under = under;
  return wm;
}

/** Fill a broth / stew surface: rim shadow at the back, a reflected window, a few fat droplets. */
function broth(pc, m, R, o = {}) {
  const b = m.bounds();
  if (!b) return;
  const cx = (b.x0 + b.x1 + 1) / 2, cy = (b.y0 + b.y1 + 1) / 2, rw = b.w / 2, rh = b.h / 2;
  m.eachD((X, Y, x, y) => {
    let k = 3;
    if (!m.get(X, Y - 1) || !m.get(X, Y - 2)) k = 4; // shadow under the back rim
    const dx = (x + 0.5 - (cx - rw * 0.25)) / (rw * 0.42), dy = (y + 0.5 - (cy + rh * 0.05)) / (rh * 0.5);
    const d = dx * dx + dy * dy;
    if (o.gloss !== false && d < 1 && d > 0.45 && dy < 0.2) k = 1;
    else if (o.gloss !== false && d <= 0.45 && dy < 0.2) k = 2;
    pc.set(X, Y, R[k]);
    if (o.emit) pc.emit(X, Y, o.emit);
  });
  for (let i = 0; i < (o.drops ?? 3); i++) {
    const x = Math.round(b.x0 + 2 + hash2(i, 3, o.seed ?? 5) * (b.w - 4)), y = Math.round(b.y0 + 1 + hash2(i, 7, o.seed ?? 5) * (b.h - 2));
    if (m.at(x, y) && m.at(x + 1, y + 1)) { dot(pc, x, y, R[1]); dot(pc, x + 1, y + 1, R[4]); }
  }
}

/** A small lumpy chunk (veg cube, meat, potato) with its own seam, planes and glint. */
function lump(pc, x, y, r, R, seed = 1, o = {}) {
  const m = blob(x, y, r, r * (o.sq ?? 0.85), { seed, lump: o.lump ?? 0.18, rot: seed * 0.7 });
  if (o.clip) m.and(o.clip);
  seam(pc, m, 'shadow');
  form(pc, m, R, { bias: o.bias ?? 0.1, emit: o.emit, dome: 0.3 });
  if (r >= 1.8 && o.glint !== false) { const b = m.bounds(); if (b) dot(pc, b.x0 + 1, b.y0 + (b.h > 2 ? 1 : 0), R[1]); }
  return m;
}

/** A carrot coin: orange disc with a paler core ring. */
function coin(pc, x, y, r, seed) {
  const R = mat(0xf0943a, { cont: 1.1 });
  const m = lump(pc, x, y, r, R, seed, { lump: 0.06, sq: 0.7 });
  dot(pc, Math.round(x - 0.5), Math.round(y - 0.5), R[1]);
  return m;
}

/** Tiny herb leaves strewn on top. */
function herbs(pc, pts, R = HERB()) {
  for (const [x, y, a] of pts) blade(pc, x, y, x + Math.cos(a) * 3, y + Math.sin(a) * 3, 1.2, R, { veins: 0, rib: false, fold: 0.8 });
}

/** A wooden skewer stick along a line. */
function skewer(pc, x0, y0, x1, y1) {
  const W = mat(0xcaa070, { cont: 1.05 });
  return tube(pc, [[x0, y0], [x1, y1]], 0.9, W, { bias: 0.08, capStart: 0.1, capEnd: 0.1 });
}

// ---------------------------------------------------------------- ingredients
function flourSack(pc) {
  const R = mat(0xe6d6b2, { cont: 1.08 });
  // a plump burlap sack, slumped, its mouth rolled down around a heap of flour
  const body = loop([[7, 12.4], [16, 11.6], [25.4, 12.6], [27.6, 17.4], [29, 22.6], [28, 27], [24, 29.6], [16, 30.2], [8.4, 29.8], [3.6, 27.4], [3, 22], [4.6, 17]]);
  form(pc, body, R, { cx: 14, cy: 19, rx: 13, ry: 11, bias: 0.06 });
  body.eachD((X, Y, x, y) => { if ((X + Y * 2) % 4 === 0 && hash2(X, Y, 2) < 0.6 && !isTop(body, X, Y)) step(pc, R, X, Y, 1, 1, 5); });
  // sag folds
  for (const [x0, y0, x1, y1] of [[10, 15, 8, 22], [21, 15, 24, 21], [15, 26, 18, 28]]) line(pc, x0, y0, x1, y1, (i, X, Y) => (i % 3 === 2 || !body.get(X, Y) ? null : (step(pc, R, X, Y, 1, 1, 5), null)));
  // rolled rim
  const rim = loop([[5.4, 12.6], [8, 9.8], [13, 9.2], [18, 9.6], [23.6, 9.4], [26.8, 11.4], [26, 14], [21, 14.8], [16, 14.2], [10, 14.8], [6.4, 14.4]]);
  seam(pc, rim, 'shadow');
  form(pc, rim, R, { bias: 0.08 });
  for (let x = 6; x < 27; x += 3) if (rim.at(x, 13)) { dot(pc, x, 13, R[4]); dot(pc, x, 12, R[3]); }
  // the flour heap
  const FL = mat(0xfaf6ee, { cont: 0.8 });
  const heap = loop([[8.6, 11.4], [10.6, 8.6], [13.4, 6.4], [16.6, 5.8], [18.4, 7.4], [21.6, 8.2], [23.6, 10.6], [20, 12.2], [14, 12.6]]);
  seam(pc, heap, 'shadow');
  form(pc, heap, FL, { bias: 0.14 });
  bumps(pc, heap, FL, { dens: 0.1, seed: 2 });
  // stamped wheat-root mark
  const ST = 0x9a7040;
  for (let y = 17; y < 26; y++) dot(pc, 16, y, ST);
  for (const [x, y] of [[14, 18], [18, 18], [14, 21], [18, 21], [15, 19], [17, 19], [15, 22], [17, 22], [13, 24], [19, 24]]) dot(pc, x, y, ST);
  // twine
  const TW = RAMPS.twine();
  for (let x = 6; x <= 25; x++) if (body.at(x, 15)) dot(pc, x, 15, TW[(x % 2) + 2]);
  dot(pc, 26, 16, TW[3]); dot(pc, 27, 17, TW[4]); dot(pc, 27, 18, TW[3]);
  ink(pc);
  for (const [x, y, a] of [[3, 27, 200], [4, 28, 150], [28, 28, 190], [29, 27, 130], [23, 4, 160], [9, 5, 120]]) dot(pc, x, y, 0xffffff, a);
  glint(pc, 12, 8, 0);
}

function butter(pc) {
  // a block of butter on a crinkled paper wrapper, one end freshly cut, a curl on top
  const PP = mat(0xf2ecdc, { cont: 1.05 });
  const paper = M().poly([[1.6, 20], [17, 12.6], [30.6, 17.6], [15, 26.6]]);
  paper.eachD((X, Y, x, y) => pc.set(X, Y, PP[(X + Y * 2) % 7 === 0 ? 3 : y > 21 ? 3 : 2]));
  for (const [x0, y0, x1, y1] of [[4, 20, 9, 18], [22, 22, 27, 19], [12, 24, 14, 25]]) line(pc, x0, y0, x1, y1, PP[4]);
  const R = mat(0xffdc6c, { cont: 1.08, warm: 56 });
  const top = M().poly([[6, 14.4], [17, 9.4], [26, 13], [15, 18]]);
  const front = M().poly([[6, 14.4], [15, 18], [15, 23.6], [6, 20]]);
  const side = M().poly([[15, 18], [26, 13], [26, 18.6], [15, 23.6]]);
  for (const [m, k] of [[side, 4], [front, 3], [top, 2]]) { seam(pc, m, 'shadow'); m.eachD((X, Y, x, y) => pc.set(X, Y, R[k])); }
  // soft rounded edges: lit lip along the top edges, slight sag
  line(pc, 7, 14, 15, 17.6, R[1]); line(pc, 15, 17.6, 25, 13.2, R[1]);
  for (const [x, y] of [[8, 13], [11, 12], [14, 11], [17, 10]]) dot(pc, x, y, R[1]);
  // cut face: knife marks
  for (const y of [16, 18, 20]) line(pc, 7, y, 14, y + 3, (i) => (i % 3 ? null : R[4]));
  // a curl shaved off the top
  const curl = blob(19.6, 11.6, 3, 1.6, { seed: 3, rot: -0.3 });
  seam(pc, curl, 'shadow');
  form(pc, curl, R, { bias: 0.15 });
  dot(pc, 20, 12, R[3]); dot(pc, 21, 12, R[4]);
  ink(pc);
  glint(pc, 10, 13, 0);
}

function buttonMushroom(pc) {
  const ST = mat(0xf2eadc, { cont: 1.05 });
  const CP = mat(0xb88a62, { cont: 1.15, warm: 40 });
  const GI = mat(0x7a5a44, { cont: 1.05 });
  // one lying on its side showing its gills, a plump one standing behind
  mushroom(pc, 19.5, 15.4, 7.4, 12.6, CP, ST, { lean: 1.2, seed: 4, spots: [[-0.5, -0.55, 2], [0.1, -0.7, 1]], spotC: [CP[1], CP[2]], GI, tall: 1 });
  const cap = loop([[4.6, 17.6], [8, 16.2], [12.4, 17], [15.6, 19.6], [16.4, 23.4], [14.4, 27.4], [10, 28.6], [5.4, 27.4], [3, 23.6], [3.2, 19.8]]);
  seam(pc, cap, 'shadow');
  const K = form(pc, cap, CP, { cx: 8.4, cy: 21, rx: 7.4, ry: 6.6, bias: 0.06 });
  void K;
  // the gill face (it lies tilted toward us): radial gills around a stub of stem
  const face = loop([[9.6, 20.6], [13, 20], [15.4, 22.4], [15, 25.6], [12, 27], [9, 25.6], [8.4, 22.8]]);
  seam(pc, face, 'shadow');
  face.eachD((X, Y, x, y) => { const a = Math.atan2(y + 0.5 - 23.6, x + 0.5 - 11.6); pc.set(X, Y, GI[(Math.floor(a * 3.2 + 10) % 2) ? 3 : 4]); });
  const stub = blob(13.4, 24.6, 2.2, 1.7, { seed: 2 });
  seam(pc, stub, 'shadow'); form(pc, stub, ST, { bias: 0.1 });
  // a crumb of soil at the foot
  const SO = mat(0x5a3e2a);
  const soil = blob(18, 29.2, 9, 1.8, { seed: 3, lump: 0.2 });
  seam(pc, soil, 'shadow'); form(pc, soil, SO, { bias: 0.1 }); bumps(pc, soil, SO, { dens: 0.3, seed: 1 });
  ink(pc);
  glint(pc, 15, 7, 0); dot(pc, 6, 19, CP[1]);
}

function rootBeer(pc) {
  const GR = mat(0x6e3410, { cont: 1.15, warm: 40 });
  // amber bottle: shoulders, neck, a cork, a paper label with a root mark, glassy streaks
  const bottle = loop([[13, 6, 1], [19, 6, 1], [19.2, 11], [20.4, 13.4], [22.6, 15.6], [23.2, 18], [23, 27.6], [21.6, 29.6, 1], [10.6, 29.8, 1], [9, 27.8], [8.8, 18], [9.6, 15.4], [11.8, 13.2], [12.8, 11]]);
  const lipm = M().rect(12, 5, 8, 2);
  bottle.union(lipm);
  form(pc, bottle, GR, { cx: 13.5, cy: 18, rx: 9, ry: 16, flatten: 0.7, dome: 0.15, bias: 0.08 });
  lipm.eachD((X, Y, x, y) => pc.set(X, Y, GR[Math.round(y) === 5 ? 1 : 3]));
  const CK = mat(0xc89a5a, { cont: 1.1 });
  const ck = M().rect(13, 1, 6, 4);
  seam(pc, ck, 'shadow');
  ck.eachD((X, Y, x, y) => pc.set(X, Y, CK[Math.round(x) === 13 ? 2 : Math.round(x) === 18 ? 4 : hash2(X, Y, 2) < 0.3 ? 4 : 3]));
  // label
  const LB = mat(0xf0e0b8, { cont: 1.05 });
  const lb = M().rect(9, 18, 14, 8);
  lb.eachD((X, Y, x, y) => pc.set(X, Y, LB[x < 11 ? 2 : x > 20 ? 4 : 3]));
  for (let x = 9; x < 23; x++) { dot(pc, x, 18, LB[1]); dot(pc, x, 25, LB[4]); if (x % 2) dot(pc, x, 19, 0xc84a3a); }
  for (const [x, y] of [[16, 20], [16, 21], [15, 22], [17, 22], [14, 23], [18, 23], [16, 23]]) dot(pc, x, y, 0x7a3a1a);
  // glass streaks: a long highlight left, a thin rim light right
  for (let y = 7; y < 29; y++) if (!lb.at(11, y) && bottle.at(11, y) && y !== 15) dot(pc, y < 15 ? 14 : 11, y, GR[y % 4 ? 1 : 0]);
  for (let y = 16; y < 29; y++) if (!lb.at(21, y)) dot(pc, 21, y, GR[2]);
  ink(pc);
  glint(pc, 14, 8, 0);
  for (const [x, y, a] of [[22, 3, 180], [24, 5, 130], [21, 1, 110]]) dot(pc, x, y, 0xfff4e0, a);
}

function honeyJar(pc) {
  const GL = mat(0xf2a020, { cont: 1.12, warm: 50 });
  // a squat glass pot of glowing honey, cloth lid tied with twine, a dipper leaning in
  const jar = loop([[8.4, 10], [23.6, 10.2], [24.4, 13.4], [26.6, 16.6], [27.4, 21.2], [26, 26], [22, 29.2], [15.6, 30], [9.6, 29.2], [5.8, 26.2], [4.8, 21.4], [5.8, 16.4], [7.8, 13.4]]);
  form(pc, jar, GL, { cx: 13.5, cy: 18, rx: 12, ry: 12, bias: 0.1 });
  // honey glows from within: a warm core, darker toward the glass edge
  blob(18.5, 22, 5.6, 5.2, { seed: 4 }).and(jar).eachD((X, Y, x, y) => step(pc, GL, X, Y, -1, 1, 5));
  sheen(pc, jar, 0xfff4c0, { inset: 1, a0: -2.8, a1: -1.9 });
  // drip running down from under the lid
  for (let y = 12; y < 19; y++) dot(pc, 10, y, GL[y > 16 ? 1 : 2]);
  dot(pc, 10, 19, GL[1]); dot(pc, 11, 19, GL[3]);
  // cloth lid, gathered, with a scalloped hem and twine
  const CL = mat(0xd24a3a, { cont: 1.1 });
  const lid = loop([[5.4, 9.4], [8, 6.6], [12, 5.4], [16.4, 6], [20, 5.2], [24.6, 6.6], [26.8, 9.6], [26.4, 13.4], [24.4, 12.2], [22.6, 14], [20.6, 12.4], [18.2, 13.8], [16, 12.4], [13.6, 14], [11.4, 12.6], [9, 14], [7.4, 12.4], [5.6, 13.4]]);
  seam(pc, lid, 'shadow');
  form(pc, lid, CL, { bias: 0.1 });
  for (let x = 6; x < 26; x++) if (lid.at(x, 10)) dot(pc, x, 10, (x % 4) < 2 ? CL[4] : CL[3]);
  for (let x = 6; x < 27; x += 2) if (lid.at(x, 8)) dot(pc, x, 8, 0xf0e0c0);
  const TW = RAMPS.twine();
  for (let x = 7; x < 26; x++) dot(pc, x, 11, TW[(x % 2) + 2]);
  // label
  const LB = mat(0xf4ead0, { cont: 1 });
  const lb = M().rect(12, 18, 9, 7);
  seam(pc, lb, 'shadow');
  lb.eachD((X, Y, x, y) => pc.set(X, Y, LB[Math.round(y) === 18 ? 1 : Math.round(x) === 20 ? 4 : 2]));
  for (const [x, y] of [[14, 20], [15, 20], [16, 20], [17, 20], [18, 20], [15, 21], [17, 21], [16, 22], [14, 23], [18, 23]]) dot(pc, x, y, 0xc88a20);
  // dipper
  const DP = mat(0xb08050, { cont: 1.1 });
  tube(pc, [[21, 7], [25.4, 1.6]], 0.8, DP, { seam: false });
  ink(pc);
  glint(pc, 11, 15, 1, 0xfff4c0);
}

function egg(pc) {
  // a straw nest cradling one speckled egg
  const SW = mat(0xd4a84e, { cont: 1.1 });
  const nest = blob(16, 25.6, 13.4, 4.4, { seed: 3, lump: 0.1 });
  form(pc, nest, SW, { bias: 0.04 });
  for (let i = 0; i < 18; i++) {
    const a = hash2(i, 1, 4) * Math.PI, y = 22.5 + hash2(i, 2, 4) * 6.5, x = 4 + hash2(i, 3, 4) * 24;
    line(pc, x - Math.cos(a) * 3, y - Math.sin(a) * 0.8, x + Math.cos(a) * 3, y + Math.sin(a) * 0.8, (n, X, Y) => (nest.get(X, Y) ? SW[i % 3 === 0 ? 1 : i % 3 === 1 ? 4 : 5] : null));
  }
  const R = mat(0xf0dcc0, { cont: 1.08, hs: 0.4, sat: 0.8 });
  const e = loop([[15, 4.6], [18.6, 5.6], [21.6, 9], [23.6, 13.6], [24.4, 18], [23.4, 22.4], [20.6, 25.4], [16.4, 26.6], [12, 26], [8.8, 23.2], [7.6, 18.8], [8.4, 13.4], [10.6, 8.6]]);
  seam(pc, e, 'shadow');
  form(pc, e, R, { cx: 14.5, cy: 13.5, rx: 9, ry: 11.5, bias: 0.06 });
  speckle(pc, e, [0xc8a47e, 0xd4b48e, 0xb89068], 0.09, 11, (x, y) => !isTop(e, x, y) && y > 9);
  // straw tucked in front of the egg
  for (const [x0, y0, x1, y1, c] of [[6, 24, 14, 22, 2], [18, 23, 27, 25, 1], [11, 25, 21, 24, 4]]) line(pc, x0, y0, x1, y1, SW[c]);
  ink(pc);
  glint(pc, 12, 9, 1, 0xfff8ec);
  for (const [x0, y0, x1, y1] of [[2, 22, 5, 21], [27, 21, 30, 23]]) line(pc, x0, y0, x1, y1, 0xc8a040);
}

// ---------------------------------------------------------------- shop snacks
function grubBar(pc) {
  const WR = mat(0x3e7cc0, { cont: 1.12 });
  // a crinkle-wrapped bar, torn open at one end to show the oat-and-grub bar inside
  const bar = M().poly([[2.6, 17.6], [21, 7.4], [29.4, 13], [11, 24.4]]);
  form(pc, bar, WR, { flatten: 0.6, dome: 0.4, round: 2.5, bias: 0.06 });
  // crimped seal at the far end
  for (let i = 0; i < 6; i++) { const x = 22 + i * 1.3, y = 8.2 + i * 0.95; dot(pc, x, y, WR[i % 2 ? 1 : 4]); dot(pc, x - 1, y + 1, WR[i % 2 ? 4 : 2]); }
  // label band with a logo
  const lb = M().poly([[13.4, 12.4], [19.6, 9], [25, 14.4], [18.6, 18]]);
  seam(pc, lb, 'shadow');
  lb.eachD((X, Y, x, y) => pc.set(X, Y, (x + y) < 30 ? 0xf8d24a : 0xe8b030));
  line(pc, 16, 13, 21, 11, 0xc84a3a); line(pc, 17, 15, 22, 13, 0xc84a3a);
  dot(pc, 19, 14, 0xffffff);
  // torn-open wrapper and the bar itself: crumbly with oats and a grub
  const BR = mat(0xc89a5a, { cont: 1.1 });
  const open = M().poly([[2.6, 17.6], [8.8, 14.2], [14.4, 20.6], [10.4, 23.6]]);
  seam(pc, open, 'shadow');
  form(pc, open, BR, { bias: 0.06 });
  bumps(pc, open, BR, { dens: 0.3, seed: 4 });
  for (const [x, y] of [[6, 18], [9, 20], [8, 17]]) { dot(pc, x, y, 0xf2e0c0); dot(pc, x + 1, y, 0xe0c8a0); }
  dot(pc, 11, 20, 0xe8c8b0); dot(pc, 12, 21, 0xd8a890);
  for (const [x, y] of [[9, 13], [10, 15], [13, 18], [14, 20]]) dot(pc, x, y, WR[1]);
  ink(pc);
  glint(pc, 18, 9, 0);
  for (const [x, y] of [[3, 22], [5, 24]]) dot(pc, x, y, 0xb08850);
}

function teaFlask(pc) {
  const R = mat(0x4f8a56, { cont: 1.18 });
  const ST = RAMPS.steel();
  // an enamel flask with a steel cup-cap, a strap lug and a painted mushroom band
  const body = loop([[8.4, 9.6], [12, 8.6], [20, 8.6], [23.6, 9.6], [24, 14], [23.6, 21], [24, 26.4], [22, 29.4], [16, 30], [10, 29.4], [8, 26.4], [8.4, 21], [8, 14]]);
  form(pc, body, R, { cx: 12.5, cy: 17, rx: 10, ry: 20, flatten: 0.7, dome: 0.15, bias: 0.06 });
  pits(pc, body, R, 0.03, 4, 0.02);
  // band
  body.eachD((X, Y, x, y) => { if (y >= 16 && y <= 21) pc.set(X, Y, Math.round(y) === 16 || Math.round(y) === 21 ? 0xd8c8a0 : mix(0xf2e6c8, 0x8a7a5a, x < 11 ? 0 : x > 21 ? 0.25 : 0.08)); });
  const cap = blob(16, 18, 3.4, 1.8, { seed: 2 });
  cap.eachD((X, Y, x, y) => pc.set(X, Y, y < 18 ? 0xd8a070 : 0xb07a50));
  dot(pc, 15, 17, 0xf0c8a0); dot(pc, 16, 19, 0xe8dcc8); dot(pc, 16, 20, 0xd8ccb8);
  // steel cup-cap
  const cup = loop([[9.4, 2.4, 1], [22.6, 2, 1], [22.4, 7.4], [20, 9.6], [12, 9.6], [9.6, 7.6]]);
  seam(pc, cup, 'shadow');
  form(pc, cup, ST, { cx: 13, cy: 5, rx: 9, ry: 10, flatten: 0.6, dome: 0.1 });
  for (let x = 9; x < 23; x++) { dot(pc, x, 2, ST[1]); dot(pc, x, 6, ST[4]); }
  // lug + strap ring
  const lug = M().rect(23, 13, 3, 3);
  seam(pc, lug, 'shadow'); lug.eachD((X, Y, x, y) => pc.set(X, Y, ST[Math.round(x) === 23 ? 2 : 4]));
  for (const y of [12, 26]) for (let x = 9; x < 23; x += 4) rivet(pc, x, y, ST);
  ink(pc);
  glint(pc, 11, 4, 0); dot(pc, 11, 12, R[0]);
  steam(pc, 14, 1, 6, { a: 150 }); steam(pc, 19, 1, 5, { a: 120, phase: 2 });
}

function pie(pc, color = 0xc8384a) {
  const CR = mat(0xdca058, { cont: 1.12, warm: 45 });
  const TN = mat(0x9aa0a8, { cont: 1.2 });
  // the tin, the domed crust, a lattice over glossy filling, a crimped rim, steam
  const tin = loop([[1.6, 21.6], [4, 18.4], [10, 16.8], [17, 16.6], [24, 17.4], [29.4, 19.6], [30.6, 23], [27.6, 26.6], [20, 28.8], [11, 28.6], [4.4, 26.4]]);
  tin.eachD((X, Y, x, y) => pc.set(X, Y, TN[y > 25 ? 4 : (X % 2 ? 3 : 2)]));
  const top = loop([[2.4, 19.4], [5, 15.2], [10, 12.6], [16.4, 12], [22, 12.6], [27.4, 15], [29.6, 18.6], [28, 22.4], [23, 25], [16, 25.8], [9, 25.2], [4, 22.8]]);
  seam(pc, top, 'shadow');
  form(pc, top, CR, { flatten: 0.6, bias: 0.06 });
  const FR = mat(color, { cont: 1.15 });
  const inner = loop([[6, 18.4], [9, 15], [16, 13.8], [23, 14.8], [26.4, 18], [24, 21.6], [16.6, 23.4], [9, 22.4]]);
  inner.eachD((X, Y, x, y) => {
    const u = x - y * 0.9, v = x + y * 1.1;
    const su = ((Math.floor(u) % 5) + 5) % 5, sv = ((Math.floor(v) % 6) + 6) % 6;
    if (su < 2) { pc.set(X, Y, CR[su === 0 ? 1 : 3]); return; }
    if (sv < 2) { pc.set(X, Y, CR[sv === 0 ? 2 : 4]); return; }
    pc.set(X, Y, FR[sv === 2 ? 4 : su === 2 ? 2 : 3]);
  });
  // crimped rim: a ring of pinched bumps
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2, x = 16 + Math.cos(a) * 12.6, y = 19 + Math.sin(a) * 6.2;
    dot(pc, x, y, CR[1]); dot(pc, x + 1, y + (Math.sin(a) > 0 ? 0 : 1), CR[4]);
  }
  speckle(pc, top, [CR[4]], 0.04, 6, (x, y) => !inner.get(x, y));
  ink(pc);
  glint(pc, 7, 16, 0);
  for (const [x, y] of [[13, 17], [19, 20]]) dot(pc, x, y, FR[0]);
  steam(pc, 11, 12, 8); steam(pc, 17, 11, 9, { phase: 2 }); steam(pc, 22, 12, 7, { phase: 4 });
}

// ---------------------------------------------------------------- dishes
function dish(pc, id, spec) {
  const c = spec.c || 0xe0a060;
  switch (id) {
    case 'glowcap_soup': {
      // a low, wide bowl carved from one burl, thick-lipped, chipped on the far rim
      const s = vessel(pc, WOODB(), [[2.6, 15.4], [5, 12.6], [10, 11.2], [16, 10.8], [22, 11.2], [27, 12.4], [29.4, 15], [28.6, 19], [25.4, 23.6], [21, 26.4], [20.4, 28.4, 1], [11.4, 28.6, 1], [10.8, 26.6], [6.4, 23.4], [3.4, 19.2]],
        [[5, 15], [8, 13.2], [13, 12.6], [19, 12.4], [24, 13], [27, 14.8], [26, 17], [21.6, 18.6], [16, 19], [10, 18.6], [6, 17.2]], { wood: true, chip: [24.6, 11.6, 1.6] });
      broth(pc, s, mat(0x4ec0ff, { cont: 1.05 }), { emit: 0.6, seed: 3 });
      // floating glowcap slices: little caps with lit gills
      for (const [x, y, r] of [[11, 15.4, 2.6], [18.5, 14.6, 2.2], [21.6, 17, 1.8]]) {
        const m = blob(x, y, r, r * 0.55, { seed: x | 0 });
        seam(pc, m, 'shadow');
        m.each((X, Y) => gl(pc, X, Y, Y + 0.5 < y ? 0xe0f8ff : (X % 2 ? 0x8ae0ff : 0x5ac0f0), 0.9));
      }
      ink(pc);
      steam(pc, 12, 11, 8, { c: 0xd8f6ff, emit: 0.3 }); steam(pc, 20, 10, 7, { c: 0xd8f6ff, phase: 2, emit: 0.3 });
      for (const [x, y] of [[6, 5], [26, 4]]) twinkle(pc, x, y, 0xe8fbff, 0x8ae0ff, 1, 0.8);
      return;
    }
    case 'carrot_stew': {
      // a deep clay pot with a rolled rim and two lug handles
      const lugs = loop([[5, 15.4], [2.4, 14.8], [1.4, 17], [2.6, 19], [5, 18.4]]).union(loop([[27, 15.4], [29.6, 14.8], [30.6, 17], [29.4, 19], [27, 18.4]]));
      const s = vessel(pc, CLAY(), [[5, 13.6], [8, 11.4], [12.6, 10.6], [19, 10.4], [24, 11.4], [27, 13.4], [27.8, 17], [27, 21.4], [24.4, 25.6], [20, 28], [12, 28.2], [7.4, 25.6], [5, 21.4], [4.2, 17]],
        [[7, 13.6], [10, 12.2], [16, 11.8], [22, 12.2], [25, 13.6], [23.4, 15.4], [16, 16.2], [8.6, 15.4]], { band: 0xf0d090, dots: 0x8a3a1a, extra: lugs });
      broth(pc, s, mat(0xd8823a, { cont: 1.05 }), { seed: 4, drops: 2 });
      const POT = mat(0xe8d4a0, { cont: 1.05 });
      for (const [x, y, r, sd] of [[8.6, 14.6, 1.9, 1], [20.4, 15.4, 2, 3]]) lump(pc, x, y, r, POT, sd, { clip: s });
      for (const [x, y, sd] of [[13, 14.4, 2], [17.6, 16, 5], [23, 14.4, 6], [11.4, 16.6, 7]]) coin(pc, x, y, 1.7, sd);
      herbs(pc, [[15, 13.4, -0.6], [9, 16.6, 0.4]]);
      ink(pc);
      steam(pc, 10, 10, 8); steam(pc, 16, 9, 9, { phase: 2 }); steam(pc, 22, 10, 7, { phase: 4 });
      return;
    }
    case 'worm_noodles': {
      // a flared porcelain noodle bowl on a narrow foot ring
      const s = vessel(pc, mat(0xd04a44, { cont: 1.1 }), [[2, 13.4], [5, 10.8], [11, 9.8], [16, 9.6], [21, 9.8], [27, 10.8], [30, 13.4], [29, 16.4], [26, 21.4], [22, 24.8], [21, 26.2, 1], [21.8, 28.4, 1], [10.2, 28.4, 1], [11, 26.2, 1], [10, 24.8], [6, 21.4], [3, 16.4]],
        [[4, 13.4], [7, 11.4], [16, 10.8], [25, 11.4], [28, 13.4], [26, 15.6], [16, 16.8], [6, 15.6]], { band: 0xf4e8d0, dots: 0x2a6a8a });
      broth(pc, s, mat(0xe2b878, { cont: 1.05 }), { gloss: false, drops: 0 });
      // pink wavy noodles piled in the broth
      const NR = mat(0xf0a4a0, { cont: 1.1 });
      for (let k = 0; k < 5; k++) for (let x = 4; x < 28; x++) {
        const y = 13.6 + k * 1.15 + Math.sin(x * 0.85 + k * 2.1) * 0.8;
        if (s.at(x, y)) dot(pc, x, y, NR[k % 2 ? 3 : 2]);
        if (s.at(x, y + 1) && k === 4) dot(pc, x, y + 1, NR[4]);
      }
      // half an egg and green onion rings
      const EW = mat(0xf8f2e4, { cont: 1 });
      const eg = blob(20.5, 14.6, 2.8, 1.8, { seed: 2 });
      seam(pc, eg, 'shadow'); form(pc, eg, EW, { bias: 0.1 });
      dot(pc, 20, 14, 0xf2b030); dot(pc, 21, 14, 0xe09020); dot(pc, 20, 15, 0xd88a18);
      for (const [x, y] of [[9, 14], [12, 16], [15, 13]]) { dot(pc, x, y, 0x6ac04a); dot(pc, x + 1, y, 0x3a8a3a); }
      // chopsticks
      const CS = mat(0xb07a40, { cont: 1.1 });
      tube(pc, [[13, 15], [26.5, 1]], 0.75, CS, { capStart: 0.1, capEnd: 0.1 });
      tube(pc, [[16.5, 15], [30.5, 3.5]], 0.75, CS, { capStart: 0.1, capEnd: 0.1, bias: -0.05 });
      ink(pc);
      steam(pc, 7, 11, 7); steam(pc, 11, 10, 6, { phase: 3 });
      return;
    }
    case 'fern_salad': {
      // a shallow, wide salad bowl of pale glazed clay, a little lopsided
      const s = vessel(pc, mat(0x6aa8c8, { cont: 1.1 }), [[2.6, 18], [5, 16], [10, 15.2], [16, 15], [22, 15.4], [27.4, 16.6], [29.6, 18.8], [28.4, 22], [24.6, 25.6], [18, 27.4], [12, 27.2], [6.6, 25], [3.4, 21.4]],
        [[4.6, 18.2], [8, 16.8], [16, 16.4], [24, 16.8], [27.4, 18.6], [25, 20.4], [16, 21.2], [7, 20.2]], { band: 0xf4f0e0 });
      void s;
      // a heap of pale fern leaves rising above the rim, with carrot coins and berries tucked in
      const LR = mat(0xc8dcae, { cont: 1.2 });
      const LD = mat(0x8ab878, { cont: 1.15 });
      for (const [x0, y0, x1, y1, b, R] of [[9, 17, 3.6, 9, 1, LD], [21, 16, 27.6, 8, -1, LD], [13, 16, 10, 4, -1, LR], [17, 16, 19.6, 3, 1, LR], [22, 17, 28.4, 13, 1, LR], [15, 18, 8, 12, 0.5, LR], [18, 18, 24, 11, -0.6, LR], [11, 18, 5, 15, 0.5, LD]]) {
        blade(pc, x0, y0, x1, y1, 2.3, R, { bend: b, serr: 0.4, teeth: 4, veins: 2 });
      }
      coin(pc, 12.6, 14, 1.6, 2); coin(pc, 20, 13.4, 1.5, 3);
      for (const [x, y] of [[16, 11], [10, 11]]) { const m = lump(pc, x, y, 1.3, mat(0xd8343a, { cont: 1.1 }), x); void m; }
      ink(pc);
      glint(pc, 15, 7, 0);
      return;
    }
    case 'fried_fish': {
      // a long fish platter, a touch lopsided, blue-trimmed
      platter(pc, CERAMIC(), [[1.6, 21.6], [4, 18], [10, 16.2], [18, 15.8], [25, 16.8], [29.6, 19], [30.4, 22.4], [27, 25.6], [20, 27.2], [11, 27], [4.4, 25.4]],
        [[5.6, 21.6], [9, 18.8], [16, 18], [23, 18.6], [26.6, 21], [24, 23.8], [16, 24.8], [8.6, 24]], { trim: 0x5a8ac8 });
      // a crisp, battered fish lying across the plate: crumbly crust, scored, tail flaring
      const R = mat(0xdea446, { cont: 1.15, warm: 45 });
      const tail = M().poly([[23, 18.4], [29.6, 13.2], [28.4, 18.6], [30, 23.4]]);
      seam(pc, tail, 'shadow'); form(pc, tail, R, { bias: 0.02 });
      for (const y of [15, 17, 19, 21]) line(pc, 24, 18.5, 29, y, (i, X, Y) => (i && tail.get(X, Y) ? R[4] : null));
      const fish = loop([[4, 18.6], [6, 15.4], [11, 13.8], [17, 14], [22, 15.4], [24.6, 18.4], [22.4, 21.4], [16, 22.8], [10, 22.6], [5.4, 21]]);
      seam(pc, fish, 'shadow');
      form(pc, fish, R, { bias: 0.06 });
      bumps(pc, fish, R, { dens: 0.22, seed: 3 });
      for (const x of [11, 15, 19]) line(pc, x + 1, 14.6, x - 1, 21, (i, X, Y) => (fish.get(X, Y) && !isBot(fish, X, Y) ? R[5] : null));
      // lemon wedge and a herb sprig
      const LM = mat(0xf6dc4a, { cont: 1.1 });
      const lm = M().poly([[3, 23], [9, 20.4], [8.6, 24.4]]);
      seam(pc, lm, 'shadow'); lm.eachD((X, Y, x, y) => pc.set(X, Y, LM[(X + Y) % 3 ? 2 : 1]));
      line(pc, 3, 23, 9, 20, LM[4]);
      herbs(pc, [[20, 24, -0.4], [22, 23.6, 0.3]]);
      ink(pc);
      dot(pc, 6, 17, 0x1a1210); dot(pc, 6, 16, 0xffffff);
      glint(pc, 9, 15, 0);
      steam(pc, 12, 12, 7); steam(pc, 18, 12, 6, { phase: 2 });
      return;
    }
    case 'spicy_omelette': {
      // served in the cast-iron skillet it was cooked in
      const SK = mat(0x3a3a42, { cont: 1.2 });
      tube(pc, [[26, 18.6], [30.6, 15.6]], 1.2, SK, { capEnd: 0.4 });
      vessel(pc, SK, [[2.6, 17.6], [6, 14], [12, 12.8], [19, 12.8], [24, 14], [27, 17], [26.6, 20.6], [23.4, 23.6], [16.4, 25], [9.4, 24.6], [4.6, 22.4]],
        [[4.6, 17.6], [7.4, 15.2], [12.4, 14.2], [19, 14.2], [23.4, 15.2], [25, 17.4], [22.4, 20.4], [16, 21.8], [9, 21.4], [5.4, 19.8]], { glint: false });
      const R = mat(0xffd248, { cont: 1.1, warm: 52 });
      // a fat folded omelette: browned in patches, the fold seam, chili flakes
      const om = loop([[4.6, 20.4], [6, 16.8], [10, 14.2], [16, 13.4], [22, 14], [26.4, 16.6], [27.4, 20], [24, 21.8, 1], [16, 22.6], [8, 22.2, 1]]);
      seam(pc, om, 'shadow');
      form(pc, om, R, { cy: 20, ry: 7, bias: 0.04 });
      om.eachD((X, Y, x, y) => { if (vnoise(x * 0.5, y * 0.6, 4) > 0.7 && !isTop(om, X, Y)) pc.set(X, Y, mix(R[3], 0xb06a2a, 0.45)); });
      for (let x = 6; x < 27; x++) { const y = Math.round(18.8 + Math.sin(x * 0.25) * 0.6); if (om.at(x, y) && om.at(x, y + 1)) { dot(pc, x, y, R[4]); dot(pc, x, y - 1, R[1]); } }
      for (const [x, y] of [[10, 16], [15, 15], [20, 16], [13, 21], [22, 20], [17, 22]]) { dot(pc, x, y, 0xe0302a); dot(pc, x + 1, y, 0x9a1a1a); }
      herbs(pc, [[20, 13.6, -0.5], [22.4, 13.4, 0.2]]);
      ink(pc);
      glint(pc, 9, 15, 0);
      steam(pc, 14, 12, 7, { c: 0xffe0d0 });
      return;
    }
    case 'bubble_tea': {
      // tall glass: pearls at the bottom, milky swirl, a foam cap and a fat straw
      const GLR = mat(0xe8eef4, { cont: 1 });
      const glass = M().poly([[8, 6], [24, 6], [22.4, 29], [9.6, 29]]);
      glass.eachD((X, Y, x, y) => pc.set(X, Y, GLR[2], 210));
      const tea = M().poly([[8.5, 10], [23.5, 10], [22.3, 28.4], [9.7, 28.4]]);
      const TR = mat(c, { cont: 1.1 });
      tea.eachD((X, Y, x, y) => { const sw = Math.sin(y * 0.6 + x * 0.25) > 0.75; pc.set(X, Y, TR[x < 11 ? 2 : x > 20 ? 4 : sw ? 2 : 3]); });
      for (const [x, y] of [[11, 26], [14, 27], [17, 26], [20, 27], [12, 23], [16, 24], [19, 23], [13, 28], [18, 28]]) { dot(pc, x, y, 0x3a2030); dot(pc, x + 1, y, 0x2a1424); dot(pc, x, y - 1, 0x8a6a7a); dot(pc, x + 1, y - 1, 0x4a2a3a); }
      const foam = blob(16, 9.6, 8, 1.8, { seed: 2, lump: 0.1 });
      foam.and(glass);
      foam.eachD((X, Y, x, y) => pc.set(X, Y, y < 10 ? 0xfaf4fc : 0xe0d4e8));
      const ST = mat(0xf26aa0, { cont: 1.12 });
      tube(pc, [[15, 22], [19.5, 4], [21, 0.5]], 1.4, ST, { bias: 0.08, capEnd: 0.1 });
      ink(pc, { minA: 150 });
      for (let y = 8; y < 28; y++) if (y % 5) dot(pc, Math.round(9.4 + y * 0.04), y, 0xffffff);
      dot(pc, 22, 9, 0xffffff);
      for (const [x, y] of [[4, 12], [27, 15], [26, 8]]) twinkle(pc, x, y, 0xffffff, 0xe0d0ff, 1, 0.4);
      return;
    }
    case 'zippy_skewer':
    case 'shrimp_skewer': {
      const shrimp = id === 'shrimp_skewer';
      skewer(pc, 3, 29, 28.5, 3.5);
      const bits = shrimp ? [[8.4, 23.4], [15, 17], [21.6, 10.6]] : [[8.4, 23.4], [15, 17], [21.6, 10.6]];
      bits.forEach(([x, y], i) => {
        if (shrimp) {
          // a curled grilled shrimp: segmented arc with a tail fan
          const R = mat(0xf88a72, { cont: 1.15, warm: 30 });
          const sw = tube(pc, [[x - 3, y - 1.6], [x - 1, y - 3.6], [x + 2.4, y - 2.6], [x + 3.2, y + 0.6], [x + 1.4, y + 3]], (s) => 2.4 - s * 1.1, R, { bias: 0.08 });
          for (let k = 0; k < 4; k++) { const [px, py] = sw.at(0.25 + k * 0.17); if (sw.mask.at(px, py)) dot(pc, px, py, R[4]); }
          blade(pc, x + 1.4, y + 3, x - 1.2, y + 5, 1.2, R, { veins: 0, rib: false });
          for (const [gx, gy] of [[x - 1, y - 3], [x + 2, y - 2]]) if (sw.mask.at(gx, gy)) dot(pc, gx, gy, 0xffd0c0);
        } else {
          // zippy chunks: glazed blue meat and pink fungus, alternating, with char marks
          const R = mat(i % 2 ? 0xe8a0a8 : 0x4a90dc, { cont: 1.15 });
          // a grilled cube of meat: lit top, two side faces, rough jittered corners
          const J = (k) => (hash2(i, k, 17) - 0.5) * 1.4, S2 = 3.6;
          const tp = [[x - S2 + J(1), y - 1.2 + J(2)], [x + J(3), y - S2 + J(4)], [x + S2 + J(5), y - 1.4 + J(6)], [x + J(7), y + 0.6]];
          const lf = [tp[0], tp[3], [x + J(8), y + S2 + 0.4], [x - S2 + J(9), y + 2 + J(10)]];
          const rt = [tp[3], tp[2], [x + S2 + J(11), y + 2.2 + J(12)], [x + J(8), y + S2 + 0.4]];
          const m = M().poly(tp).union(M().poly(lf)).union(M().poly(rt));
          seam(pc, m, 'shadow');
          M().poly(rt).each((X, Y) => pc.set(X, Y, R[4]));
          M().poly(lf).each((X, Y) => pc.set(X, Y, R[3]));
          M().poly(tp).each((X, Y) => pc.set(X, Y, R[(X + Y) % 4 ? 2 : 1]));
          bumps(pc, m, R, { dens: 0.12, seed: i + 3 });
          line(pc, x - 2, y + 1, x + 1, y - 2, (n, X, Y) => (m.get(X, Y) && n % 2 === 0 ? R[5] : null));
          speckle(pc, m, [R[1]], 0.12, i + 5);
        }
      });
      ink(pc);
      if (shrimp) { for (const [x, y] of [[26, 22], [5, 10]]) twinkle(pc, x, y, 0xffffff, 0xbff6ff, 1, 0.6); }
      else {
        const bolt = (pts) => { for (let i = 0; i + 1 < pts.length; i++) line(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], (n, X, Y) => (gl(pc, X, Y, n ? 0xfff27a : 0xffffff, 1), null)); };
        bolt([[5, 14], [7, 11], [5, 9], [7, 6]]); bolt([[25, 19], [27, 16], [25, 14]]);
      }
      return;
    }
    case 'truffle_risotto': {
      // on a rough-split slab of slate
      const s = platter(pc, mat(0x3a4250, { cont: 1.15 }), [[2, 20.4, 1], [7, 16.8, 1], [15, 15.8, 1], [22, 16.6, 1], [29.6, 18.6, 1], [30, 22.8, 1], [24, 26.6, 1], [13, 27.2, 1], [4.6, 25, 1]], null, { thick: 2, rimK: 1 });
      void s;
      const RR = mat(0xf0e2bc, { cont: 1.08 });
      // a creamy mound of rice grains
      const heap = loop([[5.6, 19.4], [7.4, 15.4], [11, 13.4], [15, 12.2], [19.6, 12.8], [24.4, 14.6], [26.4, 18.4], [23.6, 21.6], [17, 22.8], [10, 22.4]]);
      seam(pc, heap, 'shadow');
      form(pc, heap, RR, { bias: 0.06 });
      heap.clone().erode(1).eachD((X, Y, x, y) => { if ((X + Y * 2) % 3 === 0) { step(pc, RR, X, Y, -1, 1, 5); if ((X + Y) % 2) step(pc, RR, X + 1, Y, 1, 1, 5); } });
      // truffle shavings: dark curls with pale marbling, a herb
      for (const [x, y, sd] of [[11, 15.4, 1], [16.4, 13.6, 2], [20.6, 16.6, 3], [14.6, 18.6, 4], [19.6, 19.4, 5]]) {
        const m = blob(x, y, 2, 1.1, { seed: sd, rot: sd * 0.6 });
        seam(pc, m, 'shadow');
        m.each((X, Y) => pc.set(X, Y, (X + Y) % 3 ? 0x5a3a28 : 0xc8a888));
        dot(pc, Math.round(x - 1), Math.round(y - 1), 0x8a6a4a);
      }
      herbs(pc, [[21.6, 13.4, -0.8], [23.6, 13, -0.2]]);
      ink(pc);
      glint(pc, 9, 14, 0);
      steam(pc, 13, 11, 6); steam(pc, 19, 10, 6, { phase: 3 });
      return;
    }
    case 'ember_curry': {
      // a squat cast-iron cauldron on three stubby legs, ear handles
      const legs = loop([[7.4, 24], [10, 25], [9.4, 29.4, 1], [7.4, 29, 1]]).union(loop([[22, 25], [24.6, 24], [24.6, 29, 1], [22.6, 29.4, 1]])).union(loop([[14.6, 26.4], [17.4, 26.4], [17, 30, 1], [15, 30, 1]]));
      const ears = loop([[4.4, 14.4], [2, 13.4], [1.6, 16], [4, 16.8]]).union(loop([[27.6, 14.4], [30, 13.4], [30.4, 16], [28, 16.8]]));
      const s = vessel(pc, mat(0x3a3a46, { cont: 1.15 }), [[4, 13.4], [7, 11], [12, 10.2], [20, 10.2], [25, 11], [28, 13.4], [28.6, 17], [27.4, 21.6], [24, 25.2], [19, 27], [13, 27], [8, 25.2], [4.6, 21.6], [3.4, 17]],
        [[6, 13.4], [9, 12], [16, 11.6], [23, 12], [26, 13.4], [24, 15], [16, 15.8], [8, 15]], { band: 0xd8a040, extra: legs.union(ears) });
      broth(pc, s, mat(0xd8521e, { cont: 1.05 }), { seed: 6, emit: 0.25 });
      // a white rice mound on one side, chili rings and a curl of cream
      const RC = mat(0xf6f2e6, { cont: 0.9 });
      const rice = blob(20.6, 13.6, 6, 3.2, { seed: 4, lump: 0.12 });
      seam(pc, rice, 'shadow');
      form(pc, rice, RC, { bias: 0.1 });
      rice.eachD((X, Y, x, y) => { if ((X + Y * 3) % 4 === 0) step(pc, RC, X, Y, 1, 1, 5); });
      for (const [x, y] of [[8, 16], [11, 15], [13, 17]]) { glD(pc, x, y, 0xffb040, 0.6); dot(pc, x + 1, y, 0xb02a1a); }
      line(pc, 8, 17, 12, 17, (i) => (i % 2 ? 0xf6e8d0 : 0xe8d0b0));
      ink(pc);
      for (const x0 of [8, 13]) for (let i = 0; i < 8; i++) gl(pc, x0 + Math.round(Math.sin(i * 0.8 + x0) * 1.2), 11 - i, i < 3 ? 0xff7a2a : i < 6 ? 0xffb050 : 0xffe0a0, 0.7);
      return;
    }
    case 'frost_parfait': {
      const GLR = mat(0xe4f0f6, { cont: 1 });
      // a footed glass: layered cream and berry ice, a whipped crown, a frost flower on top
      const glass = M().poly([[6.6, 8], [25.4, 8], [19.4, 21], [12.6, 21]]).union(M().rect(15, 21, 2, 5)).union(loop([[9.6, 27.6], [12, 26], [16, 25.4], [20, 26], [22.6, 27.8], [20, 29.2], [12, 29.2]]));
      glass.eachD((X, Y, x, y) => pc.set(X, Y, GLR[y > 21 ? (x < 16 ? 2 : 4) : 2], 220));
      const lay = [[9, 0xffffff], [11, 0x9adcf0], [14, 0xf4f8ff], [16, 0x6ab8e0], [19, 0xd8f0ff]];
      for (let y = 9; y < 21; y++) {
        let col = lay[0][1];
        for (const [yy, cc] of lay) if (y >= yy) col = cc;
        for (let x = 7; x < 26; x++) if (glass.at(x - 1, y) && glass.at(x + 1, y) && glass.at(x, y)) dot(pc, x, y, x > 20 ? mix(col, 0x4a7aa0, 0.25) : col);
      }
      const W = mat(0xf8fbff, { cont: 0.7 });
      const top = blob(16, 7.6, 9, 2.8, { seed: 5, lump: 0.1 }).union(blob(14.6, 5, 5, 2.6, { seed: 6 })).union(blob(16, 3, 2.4, 1.8, { seed: 7 }));
      seam(pc, top, 'shadow');
      form(pc, top, W, { bias: 0.04 });
      for (const [x, y] of [[11, 7], [15, 5], [19, 8]]) dot(pc, x, y, W[4]);
      ink(pc, { minA: 150 });
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; glD(pc, Math.round(21 + Math.cos(a) * 2), Math.round(3 + Math.sin(a) * 2), 0xbff6ff, 0.6); }
      glD(pc, 21, 3, 0xffffff, 0.8);
      for (let y = 9; y < 20; y++) if (y % 4) dot(pc, Math.round(8.4 + (y - 9) * 0.4), y, 0xffffff);
      return;
    }
    case 'crystal_tea': {
      // a teacup on its saucer, pale glowing tea, a crystal petal garnish
      const SC = CERAMIC();
      const sau = loop([[2, 25.6], [5, 22.6], [11, 21.6], [18, 21.4], [25, 22.2], [29.6, 24.6], [29, 27.6], [24, 29.4], [16, 30], [8, 29.4], [3, 27.8]]);
      form(pc, sau, SC, { flatten: 0.5, dome: 0.2 });
      loop([[8.6, 25], [12, 23.4], [20, 23.4], [23.4, 25], [20, 26.6], [12, 26.6]]).edge().eachD((X, Y, x, y) => { if (y < 25) pc.set(X, Y, SC[4]); });
      const handle = loop([[23, 13.6], [26.6, 13], [29.4, 15.6], [28.6, 19.6], [24.6, 21.6]]).sub(loop([[24.4, 15.4], [26.6, 15.2], [27.4, 17.4], [25.6, 19]]));
      seam(pc, handle, 'shadow'); form(pc, handle, SC, { bias: 0.04 });
      const cup = loop([[4.6, 13], [7, 10.2], [15, 9.4], [23, 10.2], [25.4, 13], [25, 16.4], [22.6, 20.4], [18.6, 23], [12, 23.2], [7.4, 20.6], [5.2, 16.6]]);
      seam(pc, cup, 'shadow');
      form(pc, cup, SC, { cx: 11.5, cy: 13, rx: 11, ry: 12, flatten: 0.8, dome: 0.2, bias: 0.06 });
      for (let x = 6; x < 25; x++) if (cup.at(x, 19) && x % 2) dot(pc, x, 19, 0x7ab8e0);
      const mouth = loop([[6.4, 13], [9, 11.2], [15, 10.8], [21, 11.2], [23.6, 13], [21, 15], [15, 15.6], [9, 15]]);
      mouth.clone().dilate(1).and(cup).sub(mouth).eachD((X, Y, x, y) => pc.set(X, Y, SC[y < 13 ? 2 : 1]));
      const tea = mouth.clone().erode(1).and(mouth.clone().shift(0, 1));
      tea.eachD((X, Y, x, y) => gl(pc, X, Y, y < 13 ? 0xd8f4ff : 0xa8dcf0, 0.5));
      const CR = mat(0xc8ecff, { cont: 1.25 });
      for (const [x1, y1] of [[17, 6.4], [22.4, 8], [12.6, 8.6]]) blade(pc, 17.4, 12.4, x1, y1, 1.8, CR, { rib: 0xffffff, fold: 1.5, veins: 0, pow: 1.1 });
      const ctr = blob(17.4, 12, 1.4, 1.1, { seed: 2 }); seam(pc, ctr, 'shadow'); ctr.eachD((X, Y, x, y) => gl(pc, X, Y, 0xfff2b0, 0.8));
      ink(pc);
      glint(pc, 9, 15, 0);
      for (const [x, y] of [[6, 6], [10, 3]]) twinkle(pc, x, y, 0xffffff, 0xd8f4ff, 1, 0.6);
      steam(pc, 12, 9, 6, { c: 0xe8f8ff });
      return;
    }
    case 'sleepy_stew': {
      // half a dried gourd, ribbed, its stalk still on
      const nub = loop([[27.6, 16.4], [29.6, 13.6], [31, 14.6], [29.6, 17.6]]);
      const s = vessel(pc, mat(0xb8884a, { cont: 1.12 }), [[3.6, 17.6], [5.6, 14], [10, 12.2], [16, 11.6], [22, 12.4], [26.6, 14.6], [29, 17.6], [28.4, 21.4], [25, 25.2], [19.6, 27.6], [12.6, 27.4], [7, 24.8], [4, 21.4]],
        [[5.6, 17.4], [8.4, 15], [13, 13.8], [19, 13.8], [24, 15], [27, 17.2], [24.4, 18.8], [16, 19.6], [8.4, 19]], { ribs: [-0.7, -0.25, 0.25, 0.7], extra: nub });
      broth(pc, s, mat(0x6a5a8c, { cont: 1.05 }), { seed: 5 });
      for (const [x, y, r, sd, col] of [[9.6, 16.6, 1.9, 1, 0x9a7ac0], [15, 15.4, 2, 2, 0xf0c8a0], [20.6, 16.4, 1.8, 3, 0x9a7ac0], [12.6, 18, 1.4, 4, 0xe8d8b0]]) lump(pc, x, y, r, mat(col, { cont: 1.08 }), sd, { clip: s });
      ink(pc);
      // drowsy "z z z" drifting up
      const Z = (x, y, k, cc) => { line(pc, x, y, x + k, y, cc); line(pc, x + k, y, x, y + k, cc); line(pc, x, y + k, x + k, y + k, cc); };
      Z(17, 7, 3, 0xd8c8f8); Z(23, 3, 2, 0xc0b0e8); Z(12, 10, 2, 0xe8e0ff);
      return;
    }
    case 'whisper_wrap': {
      // on a wooden board with a hanging-hole handle
      const BD = mat(0xc08a52, { cont: 1.1 });
      const board = platter(pc, BD, [[3, 21.4], [5, 18], [24, 16], [28, 17], [29.4, 20.4], [27.4, 25], [8, 27.2], [4.4, 25.8]], null, { thick: 2, rimK: 1, extra: loop([[2, 21], [0.6, 22.4], [1, 24.6], [3.4, 24.4]]) });
      marks(pc, board, BD, { dens: 0.2, seed: 3, len: 4, dir: [1, -0.1], lit: false });
      const TR = mat(0xe8c890, { cont: 1.1 });
      // two halves of a rolled wrap, cut faces showing the spiral of lavender filling
      for (const [x, y, sd] of [[10.6, 15.6, 2], [21, 16.6, 4]]) {
        const body = blob(x, y, 6.2, 5.4, { seed: sd, lump: 0.16, rot: sd * 0.5, freq: [2, 3, 5] });
        seam(pc, body, 'shadow');
        form(pc, body, TR, { bias: 0.06 });
        bumps(pc, body, TR, { dens: 0.08, seed: sd });
        const face = blob(x + 1.2, y + 0.6, 4.2, 3.8, { seed: sd + 1, lump: 0.12, rot: sd });
        seam(pc, face, 'shadow');
        face.each((X, Y) => {
          const dx = X + 0.5 - x - 1.2, dy = Y + 0.5 - y - 0.6, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
          const sp = Math.sin(a + r * 1.7);
          pc.set(X, Y, r > 3.2 ? 0xf4ead0 : sp > 0.35 ? 0xd8c0f0 : sp > -0.3 ? 0xa080c8 : 0x7a5aa6);
        });
        dot(pc, Math.round(x - 3), Math.round(y - 3), TR[1]);
      }
      ink(pc);
      for (const [x, y] of [[6, 7], [26, 6], [16, 4]]) glD(pc, x, y, 0xe8d8ff, 0.6);
      return;
    }
    case 'lotus_feast': {
      // a golden platter shaped like an open lotus leaf, scalloped all round
      const LP = [];
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, r = i % 2 ? 1 : 0.9; LP.push([16 + Math.cos(a) * 14.6 * r, 21.6 + Math.sin(a) * 6.4 * r + (Math.cos(a) > 0.6 ? 0.6 : 0)]); }
      platter(pc, mat(0xe0b848, { cont: 1.18, warm: 52 }), LP, LP.map(([x, y]) => [16 + (x - 16) * 0.7, 21.9 + (y - 21.6) * 0.62]), { trim: 0xfff0b0 });
      // the lotus centerpiece, truffle slices and a honey drizzle around it
      const R = mat(0xff8ac4, { cont: 1.18 });
      for (const [a, l] of [[-2.4, 9], [-0.74, 9], [-1.57, 10], [-2.0, 7], [-1.14, 7]]) blade(pc, 16, 18.6, 16 + Math.cos(a) * l, 18.6 + Math.sin(a) * l, 2.6, R, { veins: 1, pow: 1.15, tex: (x, y, t) => t * 0.14 });
      const h = blob(16, 16.6, 2.6, 2, { seed: 2 });
      seam(pc, h, 'shadow');
      form(pc, h, mat(0xffd84a), { emit: 1, bias: 0.1 });
      for (const [x, y] of [[6.6, 21], [25.4, 21]]) {
        const m = blob(x, y, 2.6, 1.6, { seed: x | 0 });
        seam(pc, m, 'shadow');
        m.each((X, Y) => pc.set(X, Y, (X + Y) % 3 ? 0x5a3a28 : 0xc8a888));
      }
      for (let x = 10; x < 23; x++) dot(pc, x, Math.round(23 + Math.sin(x * 0.9) * 0.6), x % 3 ? 0xf2a020 : 0xffd060);
      ink(pc);
      for (const [x, y] of [[5, 6], [27, 5], [16, 2]]) twinkle(pc, x, y, 0xffffff, 0xffe08a, 1, 0.9);
      return;
    }
    case 'grub_pancakes': {
      // a chipped stoneware plate
      platter(pc, mat(0xd8d0c0, { cont: 1.05 }), [[2.4, 24], [5, 21], [10, 19.8], [16, 19.4], [23, 19.8], [27.6, 21], [29.6, 24], [27.6, 27], [22, 28.6], [11, 28.6], [5, 27.2]],
        [[6, 24], [9, 22.2], [16, 21.6], [23, 22.2], [26, 24], [22, 26.2], [16, 26.6], [10, 26.2]], { extra: null });
      const R = mat(0xe0aa66, { cont: 1.1, warm: 45 });
      // a stack of four pancakes, browned rims, a butter pat melting and honey running down
      for (let i = 0; i < 4; i++) {
        const y = 21.4 - i * 3.1;
        const pk = blob(16 + (i % 2 ? 0.8 : -0.6), y, 11 - i * 0.4, 3.3, { seed: i * 3 + 2, lump: 0.1, rot: (i % 2 ? 0.05 : -0.04), freq: [3, 5, 7] });
        seam(pc, pk, 'shadow');
        pk.each((x, yy) => dot(pc, x, yy, yy + 0.5 < y - 0.6 ? R[2] : yy + 0.5 < y + 1 ? R[3] : R[4]));
        pk.each((x, yy) => { if (!pk.at(x, yy + 1)) dot(pc, x, yy, R[5]); else if (yy + 0.5 > y && hash2(x, yy, i) < 0.2) dot(pc, x, yy, R[5]); });
      }
      const HN = mat(0xf2a020, { cont: 1.12 });
      const pool = blob(16.6, 10.4, 7.6, 2, { seed: 4, lump: 0.1 });
      pool.eachD((X, Y, x, y) => pc.set(X, Y, HN[(X + Y) % 3 ? 2 : 1]));
      for (const [x, y0, y1] of [[8, 11, 17], [23, 11, 20], [12, 12, 15], [19, 12, 14]]) { for (let y = y0; y < y1; y++) dot(pc, x, y, HN[y === y1 - 1 ? 3 : 2]); dot(pc, x, y1, HN[1]); }
      const BT = mat(0xfff0a0, { cont: 0.9 });
      const bt = M().poly([[13, 8.4], [17, 7], [20, 8.4], [16, 10]]);
      const btf = M().poly([[13, 8.4], [16, 10], [16, 11.4], [13, 9.8]]);
      seam(pc, bt.clone().union(btf), 'shadow');
      bt.eachD((X, Y, x, y) => pc.set(X, Y, BT[1])); btf.eachD((X, Y, x, y) => pc.set(X, Y, BT[3]));
      ink(pc);
      glint(pc, 14, 8, 0);
      steam(pc, 10, 6, 5, { a: 150 });
      return;
    }
    case 'deviled_egg': {
      // served on a big glossy leaf
      const LF = mat(0x4e9a46, { cont: 1.15 });
      blade(pc, 1.4, 24.6, 30.6, 19.6, 6.6, LF, { bend: 1.6, veins: 5, asym: 0.1, fold: 0.5, pow: 0.9 });
      for (const [x, y, sd] of [[10, 18.4, 2], [22, 18.4, 5]]) {
        const W = mat(0xf8f2e6, { cont: 1 });
        const half = loop(sd < 4 ? [[4.2, 18.6], [6, 15.4], [10, 14.4], [14.4, 15.6], [16, 18.6], [14, 21.6], [9.4, 22.6], [5.6, 21.4]] : [[16.4, 18], [18.4, 15], [22.6, 14.2], [26.6, 15.6], [27.8, 18.8], [25.4, 22], [20.6, 22.6], [17.4, 20.8]]);
        seam(pc, half, 'shadow'); form(pc, half, W, { bias: 0.06 });
        // piped yolk: a swirled mound with ridges
        const YR = mat(0xffd448, { cont: 1.1, warm: 50 });
        const yolk = blob(x, y - 1.2, 3.4, 2.4, { seed: sd + 1 }).union(blob(x - 0.4, y - 2.8, 2, 1.6, { seed: sd + 2 }));
        seam(pc, yolk, 'shadow'); form(pc, yolk, YR, { bias: 0.08 });
        for (let k = -2; k <= 2; k += 2) { const X = Math.round(x + k), Y = Math.round(y - 1 - Math.abs(k) * 0.3); if (yolk.get(X, Y)) pc.set(X, Y, YR[4]); }
        dot(pc, x - 1, y - 2, 0xd83a2a); dot(pc, x + 1, y - 1, 0xd83a2a); dot(pc, x, y - 3, 0xb02a1a);
      }
      herbs(pc, [[15, 13, -1.2], [17, 13, -0.6]]);
      ink(pc);
      glint(pc, 6, 16, 0); glint(pc, 18, 16, 0);
      return;
    }
    case 'mystery_mush': {
      // a dented tin bowl with a bent rim
      const s = vessel(pc, mat(0x8a8c94, { cont: 1.15 }), [[3, 14.4], [6, 12], [11, 11], [16, 11.4], [20, 10.6], [26, 11.6], [29, 14], [28.4, 17.6], [26, 22.6], [22.6, 25.6], [16, 26.6], [9.4, 25.4], [6, 22.4], [3.6, 17.6]],
        [[5, 14.2], [8, 12.8], [16, 12.6], [24, 12.6], [27, 14], [25, 15.8], [16, 16.8], [7.4, 15.8]], { dents: [[22, 20], [9, 19], [17, 23]] });
      void s;
      const MR = mat(0x8a9a52, { cont: 1.1 });
      // a suspicious heap with a spoon stuck in it, bubbling, a fly circling
      const SP = RAMPS.steel();
      tube(pc, [[19, 11], [27, 2]], 0.8, SP, { capEnd: 0.1 });
      const sp = blob(27.6, 1.8, 2, 1.5, { seed: 2, rot: -0.8 });
      seam(pc, sp, 'shadow'); form(pc, sp, SP, { bias: 0.1 });
      const heap = blob(15.6, 14, 10.4, 4, { seed: 5, lump: 0.14 }).union(blob(13, 11.4, 5, 3, { seed: 6, lump: 0.12 }));
      seam(pc, heap, 'shadow');
      form(pc, heap, MR, { bias: 0.06, tex: (x, y) => (vnoise(dc(x) * 0.8, dc(y) * 0.8, 4) - 0.5) * 0.4 });
      for (const [x, y, r] of [[10, 12, 1.2], [18.6, 13.6, 1], [14, 15, 0.8]]) blob(x, y, r + 0.5, r + 0.3, { seed: x | 0, lump: 0.25 }).edge().each((X, Y) => { if (heap.get(X, Y)) pc.set(X, Y, (X + 0.5) / S - x + (Y + 0.5) / S - y < 0 ? MR[1] : MR[4]); });
      for (const [x, y] of [[8, 15], [20, 15]]) { dot(pc, x, y, 0xc0a0d0); dot(pc, x + 1, y, 0x6a4a7a); }
      ink(pc);
      dot(pc, 5, 5, 0x1e1a22); dot(pc, 4, 4, 0xd8e8ff, 200); dot(pc, 6, 4, 0xc8d8f0, 180);
      for (let i = 0; i < 4; i++) dot(pc, 7 + i, 7 + (i % 2), 0x8a9a6a, 140);
      steam(pc, 9, 8, 5, { c: 0xc8e0a0, a: 140 });
      return;
    }
    default: {
      const s = vessel(pc, WOODB(), [[3, 15], [6, 12.4], [16, 11.2], [26, 12.4], [29, 15], [28, 19.6], [24, 25], [16, 27.6], [8, 25], [4, 19.6]],
        [[5, 15], [9, 13.2], [16, 12.8], [23, 13.2], [27, 15], [24, 17], [16, 18], [8, 17]], { wood: true });
      broth(pc, s, mat(c, { cont: 1.05 }));
      ink(pc);
    }
  }
}

// ---------------------------------------------------------------- dispatcher
export function drawFood(pc, spec, id) {
  switch (spec.k) {
    case 'ingr': {
      const t = spec.t;
      if (t === 'flour') flourSack(pc);
      else if (t === 'butter') butter(pc);
      else if (t === 'mushroom') buttonMushroom(pc);
      else if (t === 'rootbeer') rootBeer(pc);
      else if (t === 'honey') honeyJar(pc);
      else return false;
      return true;
    }
    case 'egg': egg(pc); return true;
    case 'food': {
      const t = spec.t;
      if (id === 'grub_bar' || (!id && t === 'bar')) grubBar(pc);
      else if (id === 'tea_flask' || (!id && t === 'flask')) teaFlask(pc);
      else if (id === 'hearty_pie' || (!id && t === 'pie')) pie(pc, spec.c ? spec.c : 0xc8384a);
      else dish(pc, id, spec);
      return true;
    }
    default: return false;
  }
}

export { leaf };

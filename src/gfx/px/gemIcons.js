// 32×32 cut gems (ruby, sapphire, emerald, diamond, sunstone), amber, and the odd
// minerals (coal, fossil slab, obsidian shard), all built on the facet renderer.
import { makeRng } from '../../core/util.js';
import { hash2, bayer } from './shade.js';
import { Scene, material, rampOf, stoneTex, glint, ypr, dot, nrm, gemTone } from './facets.js';
import { ROCK, rockMat } from './oreIcons.js';

// ---------------------------------------------------------------- cut-gem meshes
/**
 * Brilliant-style cut for any girdle outline. shape(t) → [x, y] on the unit girdle (t 0..1).
 * Local frame: girdle in the x/y plane, crown toward +z. o: n (girdle points, multiple of 2·k),
 * k (table / crown ring points), table (0..1), crown, pav (heights), star (crown ring radius).
 */
export function brilliantMesh(shape, o = {}) {
  const k = o.k ?? 8, n = k * 2;
  const tb = o.table ?? 0.52, cr = o.crown ?? 0.42, pv = o.pav ?? 0.95, st = o.star ?? 0.8;
  const G = [], T = [], C = [];
  for (let i = 0; i < n; i++) { const [x, y] = shape(i / n); G.push([x, y, 0]); }
  for (let j = 0; j < k; j++) {
    const [x, y] = shape(j / k), [x2, y2] = shape((j + 0.5) / k);
    T.push([x * tb, y * tb, cr]);
    C.push([x2 * st, y2 * st, cr * 0.55]);
  }
  const P = [];
  P.push(T.slice()); // table
  for (let j = 0; j < k; j++) {
    const j1 = (j + 1) % k;
    P.push([T[j], T[j1], C[j]]); // star facets
    P.push([T[j], C[(j + k - 1) % k], G[2 * j]]); // bezel (split)
    P.push([T[j], G[2 * j], C[j]]);
    P.push([C[j], G[2 * j], G[2 * j + 1]]); // upper girdle
    P.push([C[j], G[2 * j + 1], G[(2 * j + 2) % n]]);
  }
  // pavilion: mains to a culet + girdle halves
  const cul = [0, 0, -pv];
  const PM = [];
  for (let j = 0; j < k; j++) { const [x, y] = shape((j + 0.5) / k); PM.push([x * 0.45, y * 0.45, -pv * 0.55]); }
  for (let j = 0; j < k; j++) {
    P.push([G[2 * j], PM[j], G[2 * j + 1]]);
    P.push([G[2 * j + 1], PM[j], G[(2 * j + 2) % n]]);
    P.push([G[2 * j], PM[(j + k - 1) % k], PM[j]]);
    P.push([PM[j], PM[(j + k - 1) % k], cul]);
  }
  return P;
}

/** Step cut (emerald cut): octagonal girdle, three concentric step rings and a table. */
export function stepMesh(w, h, ch, o = {}) {
  const oct = (sx, sy, c) => [[-sx + c, -sy], [sx - c, -sy], [sx, -sy + c], [sx, sy - c], [sx - c, sy], [-sx + c, sy], [-sx, sy - c], [-sx, -sy + c]];
  const rings = [[1, 0], [0.86, 0.18], [0.7, 0.32], [0.56, 0.4]].map(([k, z]) => oct(w * k, h * k, ch * k).map(([x, y]) => [x, y, z * (o.crown ?? 1) * 1]));
  const P = [];
  for (let r = 0; r + 1 < rings.length; r++) for (let i = 0; i < 8; i++) {
    const a = rings[r], b = rings[r + 1], i1 = (i + 1) % 8;
    const q = [a[i], a[i1], b[i1], b[i]];
    q.tag = r;
    P.push(q);
  }
  const tb = rings[rings.length - 1].slice();
  tb.tag = 9;
  P.push(tb);
  const cul = oct(w * 0.3, h * 0.08, 0).map(([x, y]) => [x, y, -(o.pav ?? 0.7)]);
  for (let i = 0; i < 8; i++) { const i1 = (i + 1) % 8; P.push([rings[0][i1], rings[0][i], cul[i], cul[i1]]); }
  P.push(cul.slice().reverse());
  return P;
}

/** Gem material: facet tones scattered by internal reflections, flares opposite the light. */
export function gemMat(R, o = {}) {
  return material(R, {
    eq: 0.55, grad: 0.03, ridgeAll: true, rim: false, flare: 0.9, gap: 99, clean: true,
    tex: (c) => (hash2(c.face.pid, 7, o.seed ?? 1) - 0.5) * (o.jit ?? 1.3),
    ...o,
  });
}

export function gemScene(R, polys, rot, o = {}) {
  const sc = new Scene(32);
  const m = gemMat(R, o);
  m.toneFn = o.toneFn || ((f, n) => gemTone(n, o.g || {}));
  m.tex = o.tex ?? null;
  const P = polys.map((p) => ypr(p, rot.yaw ?? 0, rot.pitch ?? 0, rot.roll ?? 0, rot.t ?? [16, 16, 0], rot.s ?? 1));
  const ob = sc.add(m, P);
  return { sc, m, ob };
}

/** Paint the table: a lighter, cleaner plane with a reflected window band. */
export function table(pc, sc, ob, R, o = {}) {
  let tf = null, best = -2;
  const up = o.up || [0, -0.45, 0.9];
  for (const f of ob.faces) { const d = dot(f.n, nrm(up)); if (d > best) { best = d; tf = f; } }
  if (!tf) return;
  const inT = (x, y) => sc.pidAt(x, y) === tf.pid;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!inT(x, y)) continue;
    const e = !inT(x - 1, y) || !inT(x, y - 1), e2 = !inT(x + 1, y) || !inT(x, y + 1);
    const band = (x - y * 0.8 + 40 + (o.bandOff ?? 0)) % 9;
    let k = band < 2.2 ? 1 : band < 3.4 ? 2 : (o.base ?? 3);
    if (e) k = 1;
    else if (e2) k = 4;
    pc.set(x, y, R[k]);
  }
}

// ---------------------------------------------------------------- gems
export const G = {
  ruby: () => rampOf([0xffffff, 0xffb4be, 0xf2445e, 0xc81e3c, 0x8e0e30, 0x5c0626, 0x2a0214]),
  sapphire: () => rampOf([0xffffff, 0xb4d0ff, 0x5a8cf2, 0x2a5ad8, 0x1a38a6, 0x10206e, 0x060a30]),
  emerald: () => rampOf([0xf2fff0, 0xa8f8c0, 0x4ade88, 0x1fae62, 0x10804c, 0x08563a, 0x022618]),
  diamond: () => rampOf([0xffffff, 0xf0faff, 0xcdeefc, 0x9ed2ee, 0x74a6d2, 0x4c74a8, 0x1e2c54]),
  sun: () => rampOf([0xfffbe0, 0xffe68a, 0xffc040, 0xf28c22, 0xc85a14, 0x8a320e, 0x3c1206]),
  amber: () => rampOf([0xfff6d0, 0xffd27a, 0xf6a634, 0xd47a1a, 0xa45212, 0x6e300c, 0x301206]),
};

function ruby(pc) {
  // rough-cut ruby: an uneven, hand-faceted stone with a lopsided table
  const R = G.ruby();
  const sc = new Scene(32);
  const m = gemMat(R, {});
  m.toneFn = (f, n) => gemTone(n, { phase: 0.9 });
  m.tex = null;
  const ob = sc.chunk(m, makeRng(14), { x: 16, y: 16.5, a: 14.5, c: 11.5, h: 12, n: [6, 8, 7, 5], rings: [[0, 0.45], [0.38, 1], [0.72, 0.86], [1, 0.52]], jag: 0.26, yaw: 0.5, p: 0.75, lean: [-1.2, 0.8] });
  sc.roughen([ob], { amount: 0.18, scale: 0.7, seed: 4 });
  sc.render(pc);
  glint(pc, 10, 10, 2, 0xffffff, R[1]);
  glint(pc, 22, 19, 0, 0xffffff, R[1]);
}

function sapphire(pc) {
  // water-worn sapphire: a stubby hexagonal barrel crystal, ends rounded off, lying askew
  const R = G.sapphire();
  const sc = new Scene(32);
  const m = gemMat(R, { eq: 0.7, flare: 0.6, rim: true });
  m.toneFn = null;
  m.tex = (c) => (hash2(c.face.pid, 3, 5) - 0.5) * 0.9;
  const d = [0.8, -0.55, 0.25];
  sc.prism(m, { b: [6, 24, 0], d, len: 24, r: 6.6, tip: 5.5, sides: 6, twist: 0.25, taper: 0.88, jit: [1, 0.84, 0.97, 1.06, 0.88, 0.96], skew: [0.3, -0.2], under: 1 });
  // a smaller twin grown across its front
  sc.prism(m, { b: [10, 26, 5], d: [0.2, -0.95, 0.5], len: 10, r: 3, tip: 3.4, sides: 6, twist: 0.9, jit: [1, 0.9, 1.05, 0.92, 1, 0.95] });
  sc.roughen(sc.objs, { amount: 0.16, scale: 0.8, seed: 9 });
  sc.render(pc);
  // growth bands (colour zoning) across the barrel
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = y * 32 + x;
    if (sc.ob[i] !== 0 || sc.k[i] < 2 || sc.k[i] > 4) continue;
    const u = (x - 7.5) * 0.82 + (y - 22) * -0.5;
    if (Math.abs(((u % 4.5) + 4.5) % 4.5 - 2.2) < 0.45) pc.set(x, y, R[sc.k[i] + 1]);
  }
  glint(pc, 11, 13, 2, 0xffffff, R[1]);
  glint(pc, 24, 9, 0, 0xffffff, R[1]);
}

function emerald(pc) {
  const R = G.emerald();
  const { sc } = gemScene(R, stepMesh(10, 12.5, 3.4, { crown: 5, pav: 6 }), { yaw: 0.3, pitch: 0.45, roll: 0.2, t: [16, 16, 0] }, {
    seed: 9, toneFn: (f, n) => gemTone(n, { waves: 2 }) + (f.tag === 9 ? -0.6 : f.tag === 1 ? 0.9 : f.tag === 0 ? -0.2 : 0),
  });
  sc.render(pc);
  glint(pc, 12, 9, 2, 0xffffff, R[1]);
}

function diamond(pc) {
  const R = G.diamond();
  const round = (t) => { const a = t * Math.PI * 2; return [Math.cos(a) * 13, Math.sin(a) * 13]; };
  const { sc, ob } = gemScene(R, brilliantMesh(round, { table: 0.56, crown: 5, pav: 13, star: 0.78 }), { yaw: 0.2, pitch: 1.2, roll: -0.2, t: [16, 16, 0] }, { seed: 11, g: { phase: 1.5 } });
  sc.render(pc);
  // fire: a few spectral pixels in the pavilion
  for (const [x, y, c] of [[12, 19, 0xffb4d8], [19, 17, 0xb4f0ff], [16, 23, 0xfff0a0], [21, 21, 0xc8ffd0], [10, 16, 0xffd0a8]]) if (sc.objAt(x, y) === ob.id) pc.set(x, y, c);
  glint(pc, 10, 7, 2, 0xffffff, R[1]);
  glint(pc, 24, 14, 1, 0xffffff, R[1]);
}

function sunstone(pc) {
  // a sunstone nodule: an uneven chunk with a few polished facets, schiller sparks and a glow
  const R = G.sun();
  const sc = new Scene(32);
  const m = gemMat(R, {});
  m.toneFn = (f, n) => gemTone(n, { phase: 2.2, bias: 0.12 });
  m.tex = null;
  m.glow = 0.8;
  const ob = sc.chunk(m, makeRng(31), { x: 16, y: 16.5, a: 12.5, b: 11, c: 10, n: 13, jag: 0.3, base: 0.75, yaw: 0.4, p: 0.55 });
  sc.roughen([ob], { amount: 0.2, scale: 0.7, seed: 6 });
  sc.render(pc);
  // aventurescence: copper and gold sparks inside
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (sc.objAt(x, y) !== ob.id || sc.k[y * 32 + x] === 0) continue;
    const h = hash2(x, y, 21);
    if (h < 0.035) pc.set(x, y, 0xfffbe0);
    else if (h < 0.06) pc.set(x, y, 0xc84a12);
  }
  // rays: they leave the silhouette along its own outline, alternating long / short
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2, long = i % 2 === 0;
    let r = 4;
    while (r < 16 && sc.objAt(Math.floor(16 + Math.cos(a) * r), Math.floor(16.5 + Math.sin(a) * r)) >= 0) r += 0.5;
    for (let k = r + 1.6, e = Math.min(r + (long ? 4 : 2.6), 16.5); k < e; k += 0.5) {
      const x = Math.floor(16 + Math.cos(a) * k), y = Math.floor(16.5 + Math.sin(a) * k);
      if (pc.alpha(x, y)) continue;
      pc.set(x, y, k < r + 2.6 ? 0xffd860 : long ? 0xffeeb0 : 0xffc040);
      pc.emit(x, y, 0.8);
    }
  }
  glint(pc, 11, 10, 2, 0xffffff, 0xfffbd0, 1);
}

function amber(pc, bug) {
  // a resin nodule: a lumpy main body, a drip run down from it and a small bead, flow lines inside
  const R = G.amber();
  const sc = new Scene(32);
  const m = material(R, { eq: 0.5, eqShare: true, q: [0.06, 0.26, 0.6, 0.86], spec: 0.8, shine: 7, grad: 0.05, ridge: false, rim: false, bounce: true, clean: true });
  const blob = (seed, cx, cy, a, b, c, rot, n = 24, jag = 0.1) => {
    const rng = makeRng(seed), pts = [];
    for (let i = 0; i < n; i++) {
      const v = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - v * v), t = i * 2.39996;
      const k = 1 - rng.range(0, jag);
      pts.push([Math.cos(t) * r * a * k, v * b * k, Math.sin(t) * r * c * k]);
    }
    return sc.hull(m, ypr(pts, rot[0], rot[1], rot[2], [cx, cy, 0]), { smooth: { c: [cx, cy, 0], r: [a, b, c], k: 0.96 }, group: 3 });
  };
  const body = blob(81, 14, 14, 11.5, 9.5, 7.5, [0.3, 0.2, -0.35], 26, 0.16);
  const drip = blob(82, 22, 21, 4, 6, 3.4, [0, 0.1, -0.75], 18, 0.08);
  const bead = blob(83, 26.5, 27, 2.3, 2.6, 2.2, [0, 0, -0.5], 12, 0.05);
  const lump = blob(84, 7.5, 21, 4.5, 3.8, 3.8, [0.4, 0.2, 0.3], 14, 0.12);
  sc.roughen([body, lump], { amount: 0.12, scale: 0.8, seed: 3 });
  sc.render(pc);
  const ids = new Set([body.id, drip.id, bead.id, lump.id]);
  const inA = (x, y) => ids.has(sc.objAt(x, y));
  const edge = (x, y) => !inA(x - 1, y) || !inA(x + 1, y) || !inA(x, y - 1) || !inA(x, y + 1);
  // light caught inside: the far (lower-right) side of the body glows through
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!inA(x, y) || edge(x, y)) continue;
    const d = Math.hypot((x + 0.5 - 17) / 1.2, y + 0.5 - 17);
    const k = sc.k[y * 32 + x];
    if (d < 6 && k >= 3 && (d < 4 || bayer(x, y) < 0.5)) pc.set(x, y, R[k - 1]);
  }
  // flow lines: the resin's layers sweeping round the body and down into the drip
  for (const [ox, oy, rr, a0, a1] of [[13, 12, 6.5, 0.2, 2.2], [14, 13, 4.2, -0.4, 1.9], [12, 12, 8, 1.0, 2.6]]) {
    for (let a = a0; a < a1; a += 0.05) {
      const x = Math.floor(ox + Math.cos(a) * rr), y = Math.floor(oy + Math.sin(a) * rr * 0.8);
      if (!inA(x, y) || edge(x, y)) continue;
      const k = sc.k[y * 32 + x];
      if (k > 0 && k < 5) pc.set(x, y, R[k + 1]);
    }
  }
  for (let t = 0; t < 1; t += 0.06) { const x = Math.floor(19.5 + t * 5), y = Math.floor(17 + t * 7); if (inA(x, y) && !edge(x, y) && sc.k[y * 32 + x] > 0) pc.set(x, y, R[Math.min(5, sc.k[y * 32 + x] + 1)]); }
  if (bug) {
    // a beetle caught in the resin: dark shell with a lit edge, head, six legs and feelers
    const K = 0x2a1206, K2 = 0x5a2a0c, K3 = 0xb06a2a;
    const shell = [[12, 13], [13, 13], [14, 13], [15, 13], [11, 14], [12, 14], [13, 14], [14, 14], [15, 14], [16, 14], [11, 15], [12, 15], [13, 15], [14, 15], [15, 15], [16, 15], [11, 16], [12, 16], [13, 16], [14, 16], [15, 16], [16, 16], [12, 17], [13, 17], [14, 17], [15, 17], [13, 18], [14, 18]];
    for (const [x, y] of shell) pc.set(x, y, K);
    for (const [x, y] of [[13, 14], [13, 15], [12, 15], [12, 16]]) pc.set(x, y, K3);
    for (let y = 13; y <= 18; y++) pc.set(14, y, K2);
    for (const [x, y] of [[13, 11], [14, 11], [13, 12], [14, 12]]) pc.set(x, y, K2);
    for (const [x, y] of [[10, 13], [9, 12], [17, 13], [18, 12], [10, 15], [9, 15], [17, 15], [18, 15], [10, 17], [9, 18], [17, 17], [18, 18], [12, 10], [11, 9], [15, 10], [16, 9]]) pc.set(x, y, K2);
  } else {
    for (const [x, y, big] of [[16, 15, 1], [9, 18, 0], [19, 9, 0], [21, 21, 0], [12, 16, 0]]) {
      if (!inA(x, y)) continue;
      pc.set(x, y, R[1]);
      if (big) { pc.set(x + 1, y, R[1]); pc.set(x, y + 1, R[1]); pc.set(x + 1, y + 1, R[2]); pc.set(x + 2, y + 1, R[4]); pc.set(x + 1, y + 2, R[4]); }
      else pc.set(x + 1, y + 1, R[4]);
    }
  }
  // crisp white cores inside the specular patches
  for (let y = 1; y < 31; y++) for (let x = 1; x < 31; x++) if (inA(x, y) && sc.k[y * 32 + x] === 0 && sc.k[y * 32 + x - 1] === 0 && sc.k[(y - 1) * 32 + x] === 0) pc.set(x, y, 0xffffff);
}

// ---------------------------------------------------------------- coal, fossil, obsidian
function coal(pc) {
  const R = rampOf([0xf0f4ff, 0x9aa2c6, 0x5e6280, 0x3a3a4e, 0x262432, 0x18151e, 0x09070c]);
  const sc = new Scene(32);
  const m = material(R, { eq: 0.7, ridgeAll: true, grad: 0.04, tex: stoneTex(17, { amp: 0.3, pit: 0.03, speck: 0.03 }) });
  const rng = makeRng(77);
  sc.chunk(m, rng, { x: 10, y: 21.5, a: 9, b: 6.8, c: 7.2, n: 9, jag: 0.35, base: 0.6, yaw: 0.4, z: 0 });
  sc.chunk(m, rng, { x: 23, y: 22, a: 8, b: 6.3, c: 6.8, n: 8, jag: 0.35, base: 0.6, yaw: -0.6, z: 1 });
  sc.chunk(m, rng, { x: 16, y: 12, a: 9.5, b: 7.3, c: 7.8, n: 9, jag: 0.3, base: 0.6, yaw: 0.1, z: -3 });
  sc.render(pc);
  // vitreous lustre: bright bluish-white glints along the lit ridges
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = y * 32 + x;
    if (sc.ob[i] < 0 || sc.k[i] !== 1) continue;
    if (hash2(x, y, 8) < 0.35) pc.set(x, y, R[0]);
  }
  glint(pc, 13, 8, 1, 0xf0f4ff, R[1]);
  glint(pc, 21, 18, 0, 0xffffff, R[1]);
  glint(pc, 7, 18, 0, 0xffffff, R[1]);
}

function fossil(pc) {
  // a broken flag of shale: jagged fractured edges, one corner snapped off, an ammonite in relief
  const SL = ROCK.taupe();
  const sc = new Scene(32);
  const m = rockMat(SL, 31, { amp: 0.35, pit: 0.06 });
  const slab = sc.chunk(m, makeRng(37), { x: 15.5, y: 18, a: 14.5, c: 12, h: 7, n: [6, 7, 6], jag: 0.3, yaw: 0.35, p: 0.95, rings: [[0, 0.95], [0.5, 1], [1, 0.88]], group: 1 });
  const chip = sc.chunk(m, makeRng(38), { x: 26.5, y: 24, a: 4, c: 3.5, h: 4, n: [5, 5, 4], jag: 0.3, yaw: 0.9, p: 0.95, z: 2, group: 1 });
  sc.carve((x, y) => x + 0.5 > 4 && (x + 0.5 - 4) * 0.9 + (y + 0.5 - 4) * 0.6 < 4.5); // the snapped-off corner
  sc.roughen([slab, chip], { amount: 0.33, scale: 0.6, seed: 12 });
  sc.render(pc);
  // ammonite in relief on the top plane (foreshortened spiral, its edge broken by the fracture)
  const SH = rampOf([0xfff8e8, 0xf4e2c0, 0xe0c696, 0xc4a070, 0x987650, 0x6c5038, 0x382418]);
  const cx = 15.5, cy = 16.5, R0 = 9, sy = 0.78;
  const b = 0.115, a0 = R0 / Math.exp(b * Math.PI * 2 * 3.05);
  const crack = (x, y) => Math.abs((y + 0.5) - (23 - (x + 0.5) * 0.45 + Math.sin(x * 1.3) * 0.6)) < 0.6;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (sc.objAt(x, y) !== slab.id) continue;
    const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / sy;
    const r = Math.hypot(dx, dy);
    if (crack(x, y)) { pc.set(x, y, SL[6]); if (sc.objAt(x, y + 1) === slab.id) pc.set(x, y + 1, SL[1]); continue; }
    const wob = R0 + Math.sin(Math.atan2(dy, dx) * 5 + 1) * 0.5;
    if (r > wob + 1) continue;
    if (r > wob) { if (dx + dy > 0) pc.set(x, y, SL[5]); continue; }
    if ((x + 0.5 - 17) + (y + 0.5 - 26) > 0 && r > R0 * 0.7) continue; // a bite of the shell lost with the edge
    const th = Math.atan2(dy, dx) + Math.PI;
    const w = Math.log(Math.max(0.6, r) / a0) / b / (Math.PI * 2) - th / (Math.PI * 2);
    const u = w - Math.floor(w);
    const turn = Math.floor(w) + th / (Math.PI * 2);
    const rib = ((turn * 13) % 1 + 1) % 1 < 0.4;
    const facing = Math.cos(Math.atan2(dy, dx) - Math.atan2(-0.6, -0.55));
    let k = u < 0.15 ? 6 : u < 0.38 ? (facing > 0 ? 1 : 2) : u < 0.75 ? 3 : 4;
    if (rib && k > 1 && k < 6) k -= 1;
    if (k === 3 && facing < -0.4) k = 4;
    if (hash2(x, y, 41) < 0.06 && k < 6) k = Math.min(5, k + 1);
    pc.set(x, y, SH[k]);
  }
  pc.set(cx - 0.5, cy - 0.5, SH[6]);
  glint(pc, 10, 11, 1, 0xffffff, SH[1]);
}

function obsidian(pc) {
  const R = rampOf([0xf6eeff, 0xa898d8, 0x5e4c86, 0x342850, 0x221a36, 0x150f22, 0x07040c]);
  const sc = new Scene(32);
  const m = material(R, { eq: 0.6, ridgeAll: true, flare: 0.5, grad: 0.06 });
  const pts = [[0, -14, 0], [5, -6, 2], [7.5, 5, 1], [2, 13, 2.5], [-5, 9, 1.5], [-7.5, -1, 1], [-2, -4, 5], [1.5, 4, 5.5], [-1, 8, 4.5], [0, 0, -3], [3, -2, -2]];
  const P = ypr(pts, 0, -0.2, 0.42, [16, 16.5, 0]);
  const ob = sc.hull(m, P);
  sc.render(pc);
  // conchoidal ripples on the biggest plane
  let big = null, area = 0;
  const cnt = new Map();
  for (let i = 0; i < 1024; i++) if (sc.ob[i] === ob.id) { const p = sc.faces[sc.fb[i]].pid; cnt.set(p, (cnt.get(p) || 0) + 1); }
  for (const [p, n] of cnt) if (n > area) { area = n; big = p; }
  for (let k = 0; k < 4; k++) {
    const r = 3.5 + k * 3;
    for (let a = 0; a < Math.PI * 2; a += 0.04) {
      const x = Math.floor(21 + Math.cos(a) * r), y = Math.floor(22 + Math.sin(a) * r);
      if (sc.pidAt(x, y) === big) { const kk = sc.k[y * 32 + x]; pc.set(x, y, R[Math.max(1, Math.min(5, kk + (k % 2 ? -1 : 1)))]); }
    }
  }
  glint(pc, 14, 6, 2, 0xffffff, R[1]);
  glint(pc, 20, 15, 0, 0xffffff, R[1]);
}

const DRAW = {
  ruby, sapphire, emerald, diamond, sunstone, amber: (pc) => amber(pc, false), amber_bug: (pc) => amber(pc, true),
  coal, fossil, obsidian_shard: obsidian,
};

/** Draw a gem / misc mineral icon by item id; false if unknown. */
export function drawGemIcon(pc, id) {
  const f = DRAW[id];
  if (!f) return false;
  f(pc);
  return true;
}


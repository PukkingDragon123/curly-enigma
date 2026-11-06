// Cut gems (ruby, sapphire, emerald, diamond, sunstone), amber, and the odd minerals (coal,
// fossil slab, obsidian shard), all built on the facet renderer. Authored on the 32-unit
// design grid and rasterised natively at S× (res.js).
import { makeRng } from '../../core/util.js';
import { hash2, bayer } from './shade.js';
import { Scene, material, rampOf, stoneTex, glint, ypr, dot, nrm, gemTone } from './facets.js';
import { ROCK, rockMat, cracks } from './oreIcons.js';
import { M, loop, ink, isTop, line, mix } from './lifeKit.js';
import { S, dc, nc, np, dot as dpx } from './res.js';

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
  sc.eachPx((X, Y, x, y) => {
    if (!inT(X, Y)) return;
    const e = !inT(X - 1, Y) || !inT(X, Y - 1), e2 = !inT(X + 1, Y) || !inT(X, Y + 1);
    const band = (x - y * 0.8 + 40 + (o.bandOff ?? 0)) % 9;
    let k = band < 2.2 ? 1 : band < 3.4 ? 2 : (o.base ?? 3);
    if (S > 1 && band >= 3.4 && band < 3.4 + 0.5) k = 2; // the reflection's soft trailing edge
    if (e) k = 1;
    else if (e2) k = 4;
    pc.set(X, Y, R[k]);
  });
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
  // growth bands (colour zoning) across the barrel; at S > 1 each band is a fine dark line
  // with a paler one beside it, plus a silk of hair-thin rutile needles
  sc.eachPx((X, Y, x, y, i) => {
    if (sc.ob[i] !== 0 || sc.k[i] < 2 || sc.k[i] > 4) return;
    const u = (x - 7.5) * 0.82 + (y - 22) * -0.5, b = ((u % 4.5) + 4.5) % 4.5 - 2.2;
    if (Math.abs(b) < (S > 1 ? 0.26 : 0.45)) pc.set(X, Y, R[sc.k[i] + 1]);
    else if (S > 1 && b > 0.26 && b < 0.55 && sc.k[i] > 2) pc.set(X, Y, R[sc.k[i] - 1]);
    else if (S > 1 && hash2(Math.floor((x * 0.5 + y * 0.87) * 2), Math.floor((x * 0.87 - y * 0.5) * 0.4), 9) < 0.06 && hash2(X, Y, 3) < 0.7) pc.set(X, Y, R[Math.max(1, sc.k[i] - 1)]);
  });
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
  for (const [x, y, c] of [[12, 19, 0xffb4d8], [19, 17, 0xb4f0ff], [16, 23, 0xfff0a0], [21, 21, 0xc8ffd0], [10, 16, 0xffd0a8], [14, 21, 0xc8d8ff], [23, 18, 0xffc8a0]]) {
    if (sc.objD(x, y) !== ob.id) continue;
    if (S === 1) { pc.set(x, y, c); continue; }
    // a short spectral streak: hot core and a dimmer tail
    const X = nc(x), Y = nc(y);
    pc.set(X, Y, c); if (sc.objAt(X + 1, Y - 1) === ob.id) pc.set(X + 1, Y - 1, c);
    if (sc.objAt(X - 1, Y + 1) === ob.id) pc.set(X - 1, Y + 1, mix(c, pc.getHex(X - 1, Y + 1), 0.5));
  }
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
  const ob = sc.chunk(m, makeRng(31), { x: 16, y: 16.5, a: 14, b: 12.2, c: 11.2, n: 13, jag: 0.3, base: 0.75, yaw: 0.4, p: 0.55 });
  sc.roughen([ob], { amount: 0.2, scale: 0.7, seed: 6 });
  sc.render(pc);
  // aventurescence: copper and gold sparks inside (at S > 1: little platelets, a bright pixel
  // with a dimmer one beside it, all lying the same way like the real hematite flakes)
  sc.eachPx((X, Y, x, y, i) => {
    if (sc.ob[i] !== ob.id || sc.k[i] === 0) return;
    const h = hash2(X, Y, 21);
    if (h < 0.035 / S) { pc.set(X, Y, 0xfffbe0); if (S > 1 && sc.ob[i + 1] === ob.id) pc.set(X + 1, Y, 0xffd27a); }
    else if (h < 0.06 / S) { pc.set(X, Y, 0xc84a12); if (S > 1 && sc.ob[i + 1] === ob.id && hash2(X, Y, 22) < 0.5) pc.set(X + 1, Y, 0xe8782a); }
  });
  // rays: they leave the silhouette along its own outline, alternating long / short
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2, long = i % 2 === 0;
    let r = 4;
    while (r < 17 && sc.objD(16 + Math.cos(a) * r, 16.5 + Math.sin(a) * r) >= 0) r += 0.25;
    for (let k = r + 1.4, e = Math.min(r + (long ? 3.4 : 2.4), 17); k < e; k += 0.5 / S) {
      const x = np(16 + Math.cos(a) * k), y = np(16.5 + Math.sin(a) * k);
      if (pc.alpha(x, y)) continue;
      pc.set(x, y, k < r + 2.6 ? 0xffd860 : long ? 0xffeeb0 : 0xffc040);
      pc.emit(x, y, 0.8);
    }
  }
  glint(pc, 10, 9, 2, 0xffffff, 0xfffbd0, 1);
}

function amber(pc, bug) {
  // a clear resin nodule: a rounded, slightly lopsided bead of amber with a drip still hanging
  // from its underside, lit through: a dark Fresnel rim on the lit side, light gathering into a
  // bright caustic crescent inside the far side, a sharp window highlight, a few flow lines and
  // trapped bubbles (or a beetle caught inside)
  const R = G.amber();
  // one outline: the nodule sags at its lower right into a hanging tear of resin
  const m = loop([[4.6, 16], [5.6, 10.8], [9.4, 6.8], [14.6, 5.2], [19.6, 6.2], [23.6, 9], [26, 13.2], [25.8, 17.4], [24, 20.6], [22.8, 23.4], [23.2, 26.4], [22, 29.2], [19.8, 29.8], [18.2, 28], [17.8, 25], [14.6, 23.8], [9.6, 23.2], [6.2, 20.6]]);
  const drip = M().fn((x, y) => y + 0.5 > 23.6 && x + 0.5 > 16.6).and(m);
  // rim layers: a crisp 1px Fresnel line, then broader bands (design widths ~1, 2, 3)
  const e1 = m.clone().erode(1), e2 = m.clone().erode(S > 1 ? 3 : 2), e3 = m.clone().erode(S > 1 ? 5 : 3);
  const cx = 15.6, cy = 15.4;
  m.each((X, Y) => {
    const x = dc(X), y = dc(Y);
    const u = ((x + 0.5 - cx) * 0.6 + (y + 0.5 - cy) * 0.8) / 10; // -1 toward the light .. +1 away
    let k;
    if (!e1.get(X, Y)) k = u < 0 ? 5 : 3;
    else if (!e2.get(X, Y)) k = u < -0.15 ? 4 : u > 0.35 ? 1 : 3;
    else if (!e3.get(X, Y)) k = u > 0.3 ? 1 : u > -0.2 ? 2 : 3;
    else k = u > -0.35 ? 2 : 3;
    // resin is never quite clear: a faint cloud of darker swirls deep inside
    if (S > 1 && e3.get(X, Y) && k >= 2 && Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2.2 + y * 0.35) > 0.92) k = Math.min(4, k + 1);
    if (drip.get(X, Y)) k = !e1.get(X, Y) ? (x < 20 ? 3 : 4) : (x < 20 ? 1 : 2);
    pc.set(X, Y, R[k]);
  });
  // drip tip gathers the light
  if (S === 1) { pc.set(20, 28, R[1]); pc.set(21, 28, R[2]); } else { const X = nc(20), Y = nc(28); pc.set(X, Y, R[0]); pc.set(X + 1, Y, R[1]); pc.set(X, Y + 1, R[1]); pc.set(X + 2, Y, R[2]); pc.set(X + 1, Y + 1, R[2]); }
  // flow lines: faint darker curves following the resin's layers
  for (const [ox, oy, rr, a0, a1, sq] of [[15, 15.4, 6, 0.3, 2.4, 0.8], [16, 15, 8, 3.7, 5.2, 0.72], ...(S > 1 ? [[15.4, 15.6, 4, 3.4, 5.6, 0.85], [15.2, 15.2, 10, 0.5, 1.6, 0.7]] : [])]) {
    let last = '';
    for (let a = a0; a < a1; a += 0.04 / S) {
      const x = np(ox + Math.cos(a) * rr), y = np(oy + Math.sin(a) * rr * sq), key = x + ',' + y;
      if (key === last || !e2.get(x, y)) continue;
      last = key;
      const k = R.indexOf(pc.get(x, y));
      if (k > 0 && k < 5) pc.set(x, y, R[k + 1]);
    }
  }
  if (bug) {
    // a small beetle caught inside, seen through the resin (its colours pulled toward amber)
    const K = (c) => mix(c, R[4], 0.25);
    const shell = loop([[12.4, 12.6], [14.6, 11.2], [17.2, 11.6], [18.6, 13.8], [18, 16.8], [15.6, 18.4], [13, 17.6], [11.8, 15.4]]);
    shell.each((X, Y) => {
      const x = dc(X), y = dc(Y), left = (x + 0.5) < 15.4 + (y - 11) * 0.12;
      let c = isTop(shell, X, Y) ? 0x8a4a1a : left ? 0x4a2410 : 0x2e140a;
      if (S > 1 && !isTop(shell, X, Y) && (X + Y * 2) % 5 === 0) c = left ? 0x5a2e14 : 0x3a1a0c; // pitted elytra
      pc.set(X, Y, K(c));
    });
    line(pc, 15, 12, 15, 14, K(0x1a0a04)); line(pc, 16, 15, 16, 17, K(0x1a0a04));
    const head = loop([[17.6, 10.6], [19.6, 9.6], [20.4, 11.6], [18.8, 12.6]]);
    head.each((x, y) => pc.set(x, y, K(isTop(head, x, y) ? 0x4a2410 : 0x2a1206)));
    for (const [x0, y0, x1, y1] of [[13, 13, 10, 11], [12, 15, 9, 15], [13, 17, 10, 19], [17, 12, 18, 9.6], [18, 15, 21, 15.6], [17, 17, 19.6, 20], [20, 10, 22.6, 8], [19, 10, 20, 7.4]]) line(pc, x0, y0, x1, y1, (i) => (i ? K(0x3a1a08) : null));
    if (S === 1) pc.set(14, 12, K(0xd88a3a)); else { const X = nc(14), Y = nc(12); pc.set(X, Y, K(0xf0b060)); pc.set(X + 1, Y, K(0xd88a3a)); pc.set(X, Y + 1, K(0xb06a2a)); }
    // a few bubbles it breathed out as it drowned
    if (S > 1) for (const [x, y] of [[20.5, 13.5], [21.5, 12.5]]) { pc.set(np(x), np(y), R[0]); pc.set(np(x), np(y) + 1, R[3]); }
  } else if (S === 1) {
    // trapped bubbles: a light dot with a dark rim below it, and a speck of bark
    for (const [x, y] of [[19, 10], [11, 18], [21, 17]]) { pc.set(x, y, R[0]); pc.set(x, y + 1, R[4]); }
    pc.set(12, 11, R[5]); pc.set(13, 11, R[4]);
  } else {
    // trapped bubbles of different sizes: a bright cap, the clear middle, a dark lower rim
    for (const [x, y, big] of [[19, 10, 1], [11, 18, 1], [21, 17, 0], [17.5, 20.5, 0], [13.5, 8.5, 0], [22.5, 12, 0]]) {
      const X = np(x), Y = np(y);
      if (big) {
        pc.set(X, Y, R[0]); pc.set(X + 1, Y, R[1]); pc.set(X - 1, Y + 1, R[1]); pc.set(X + 2, Y + 1, R[2]);
        pc.set(X - 1, Y + 2, R[3]); pc.set(X + 2, Y + 2, R[4]); pc.set(X, Y + 3, R[4]); pc.set(X + 1, Y + 3, R[4]);
      } else { pc.set(X, Y, R[0]); pc.set(X, Y + 1, R[4]); }
    }
    // a speck of bark and a fleck of leaf litter caught in the resin
    for (const [X, Y, c] of [[nc(12), nc(11), R[5]], [nc(12) + 1, nc(11), R[4]], [nc(12) + 2, nc(11) + 1, R[5]], [nc(16), nc(21), R[4]], [nc(16) + 1, nc(21), R[5]]]) pc.set(X, Y, c);
  }
  ink(pc);
  // the window highlight: a hard white sliver and a softer second one
  if (S === 1) {
    for (const [x, y, c] of [[8, 11, 0xffffff], [9, 10, 0xffffff], [10, 9, R[0]], [8, 12, R[0]], [11, 9, R[1]], [7, 14, R[1]]]) pc.set(x, y, c);
    pc.set(23, 18, R[0]); pc.set(24, 16, R[1]);
  } else {
    line(pc, 8, 11.8, 10.6, 9, (i) => (i < 4 ? 0xffffff : R[0]));
    line(pc, 8.5, 12, 11, 9.3, (i) => (i < 2 ? R[0] : R[1]));
    line(pc, 7.2, 13.6, 7.6, 12.8, R[1]);
    line(pc, 23.4, 17.4, 24.2, 16, (i) => (i ? R[1] : R[0]));
  }
  glint(pc, 10, 10, 0, 0xffffff, R[1]);
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
  sc.eachPx((X, Y, x, y, i) => {
    if (sc.ob[i] < 0 || sc.k[i] !== 1) return;
    if (hash2(X, Y, 8) < 0.35) pc.set(X, Y, R[0]);
  });
  // bedding planes: faint dull streaks across the broken faces (anthracite's sheen comes and goes)
  if (S > 1) sc.eachPx((X, Y, x, y, i) => {
    if (sc.ob[i] < 0 || sc.k[i] < 2 || sc.k[i] > 4) return;
    const b = ((y * 1.1 - x * 0.35 + Math.sin(x * 0.6) * 0.5) % 2.6 + 2.6) % 2.6;
    if (b < 0.3 && hash2(X, Y, 12) < 0.8) pc.set(X, Y, R[sc.k[i] + 1]);
  });
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
  const crackW = S > 1 ? 0.32 : 0.6;
  const crack = (x, y) => Math.abs((y + 0.5) - (23 - (x + 0.5) * 0.45 + Math.sin(x * 1.3) * 0.6)) < crackW;
  const ribs = S > 1 ? 19 : 13; // finer ribbing (and a suture between them) at higher resolution
  sc.eachPx((X, Y, x, y) => {
    if (sc.objAt(X, Y) !== slab.id) return;
    const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / sy;
    const r = Math.hypot(dx, dy);
    if (crack(x, y)) { pc.set(X, Y, SL[6]); if (sc.objAt(X, Y + 1) === slab.id) pc.set(X, Y + 1, SL[1]); return; }
    const wob = R0 + Math.sin(Math.atan2(dy, dx) * 5 + 1) * 0.5;
    if (r > wob + 1) return;
    if (r > wob) { if (dx + dy > 0) pc.set(X, Y, SL[r > wob + 0.5 ? 4 : 5]); return; }
    if ((x + 0.5 - 17) + (y + 0.5 - 26) > 0 && r > R0 * 0.7) return; // a bite of the shell lost with the edge
    const th = Math.atan2(dy, dx) + Math.PI;
    const w = Math.log(Math.max(0.6, r) / a0) / b / (Math.PI * 2) - th / (Math.PI * 2);
    const u = w - Math.floor(w);
    const turn = Math.floor(w) + th / (Math.PI * 2);
    const rp = ((turn * ribs) % 1 + 1) % 1, rib = rp < 0.4;
    const facing = Math.cos(Math.atan2(dy, dx) - Math.atan2(-0.6, -0.55));
    let k = u < 0.15 ? 6 : u < 0.38 ? (facing > 0 ? 1 : 2) : u < 0.75 ? 3 : 4;
    if (rib && k > 1 && k < 6) k -= 1;
    if (S > 1 && rp > 0.4 && rp < 0.52 && k > 1 && k < 5 && u > 0.2) k += 1; // the groove behind each rib
    if (k === 3 && facing < -0.4) k = 4;
    if (hash2(X, Y, 41) < 0.06 && k < 6) k = Math.min(5, k + 1);
    pc.set(X, Y, SH[k]);
  });
  dpx(pc, cx - 0.5, cy - 0.5, SH[6]);
  // hairline fractures in the shale, running off the break
  cracks(pc, sc, [slab], [[[26, 13], [24.4, 14.6], [23.6, 17.2], [24.6, 19]], [[6, 22], [8.4, 23.4], [9.4, 26]], [[19, 7.4], [21.6, 8.6], [23, 8.2]]]);
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
  for (let i = 0; i < sc.w * sc.h; i++) if (sc.ob[i] === ob.id) { const p = sc.faces[sc.fb[i]].pid; cnt.set(p, (cnt.get(p) || 0) + 1); }
  for (const [p, n] of cnt) if (n > area) { area = n; big = p; }
  // at S > 1 the ripples are finer and more numerous, each a dark trough with a lit crest
  const NR = S > 1 ? 7 : 4, step = S > 1 ? 1.7 : 3;
  for (let k = 0; k < NR; k++) {
    const r = 3.5 + k * step;
    for (let a = 0; a < Math.PI * 2; a += 0.04 / S) {
      const x = np(21 + Math.cos(a) * r), y = np(22 + Math.sin(a) * r * 0.92);
      if (sc.pidAt(x, y) === big) { const kk = sc.k[y * sc.w + x]; pc.set(x, y, R[Math.max(1, Math.min(5, kk + (k % 2 ? -1 : 1)))]); }
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


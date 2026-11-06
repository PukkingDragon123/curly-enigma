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
  const R = G.ruby();
  const { sc } = gemScene(R, brilliantMesh((t) => { const a = t * Math.PI * 2; return [Math.cos(a) * 12.5, Math.sin(a) * 10]; }, { table: 0.6, crown: 2.6, pav: 7 }), { yaw: 0.2, pitch: 0.42, roll: -0.25, t: [16, 16, 0] }, { seed: 3 });
  sc.render(pc);
  glint(pc, 11, 10, 2, 0xffffff, R[1]);
  glint(pc, 22, 20, 0, 0xffffff, R[1]);
}

function sapphire(pc) {
  const R = G.sapphire();
  // pear: round one end, pointed the other
  const pear = (t) => { const a = t * Math.PI * 2; const r = 1 - 0.42 * Math.pow(Math.max(0, Math.cos(a - Math.PI)), 3); return [Math.cos(a) * 12.5 * r + (Math.cos(a) < 0 ? 0 : 0), Math.sin(a) * 9.5 * (0.75 + 0.25 * r)]; };
  const { sc } = gemScene(R, brilliantMesh(pear, { table: 0.58, crown: 2.8, pav: 7 }), { yaw: 0.15, pitch: 0.4, roll: 0.8, t: [16.5, 16, 0] }, { seed: 5, g: { phase: 1.4 } });
  sc.render(pc);
  glint(pc, 12, 11, 2, 0xffffff, R[1]);
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
  const R = G.sun();
  // sun-cut: a round brilliant seen almost face-on, its star of facets radiating from a hot core
  const cushion = (t) => { const a = t * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a); const r = 1 / Math.pow(Math.abs(c) ** 3 + Math.abs(s2) ** 3, 1 / 3); return [c * r * 10, s2 * r * 9]; };
  const { sc, m, ob } = gemScene(R, brilliantMesh(cushion, { table: 0.55, crown: 2.8, pav: 6, k: 8, star: 0.78 }), { yaw: 0.15, pitch: 0.45, roll: 0.55, t: [16, 16, 0] }, { seed: 13, g: { phase: 2.2 } });
  m.glow = 0.8;
  sc.render(pc);
  // hot core in the table + a few schiller sparks
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (sc.objAt(x, y) !== ob.id) continue;
    const d = Math.hypot(x + 0.5 - 15.5, y + 0.5 - 15);
    if (d < 1.5) pc.set(x, y, R[0]);
    else if (d < 2.6 && sc.k[y * 32 + x] > 1) pc.set(x, y, R[1]);
    if (hash2(x, y, 21) < 0.025 && d > 3) pc.set(x, y, hash2(x, y, 22) < 0.5 ? 0xfffbe0 : 0xc84a12);
  }
  // rays: alternating long / short, tapering, glowing
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2, long = i % 2 === 0, l = long ? 15.5 : 13.6;
    for (let r = 12.2; r < l; r += 0.5) {
      const x = Math.floor(16 + Math.cos(a) * r), y = Math.floor(16 + Math.sin(a) * r);
      if (pc.alpha(x, y)) continue;
      pc.set(x, y, r < 13.3 ? 0xffd860 : long ? 0xffeeb0 : 0xffc040);
      pc.emit(x, y, 0.8);
    }
  }
  glint(pc, 11, 10, 2, 0xffffff, 0xfffbd0, 1);
}

function amber(pc, bug) {
  const R = G.amber();
  const sc = new Scene(32);
  const m = material(R, { eq: 0.5, q: [0.06, 0.26, 0.6, 0.86], spec: 0.8, shine: 7, grad: 0.05, ridge: false, rim: false, bounce: true, clean: true });
  // a resin drop: rounded, fatter at the bottom-left, a little pinched toward the top-right
  const pts = [];
  const N = 44;
  for (let i = 0; i < N; i++) {
    const v = 1 - ((i + 0.5) / N) * 2, r = Math.sqrt(1 - v * v), a = i * 2.39996;
    let x = Math.cos(a) * r, z = Math.sin(a) * r, y = v;
    const pinch = 1 - Math.max(0, -y) * 0.38;
    pts.push([x * 10.5 * pinch, y * 12.5, z * 8 * pinch]);
  }
  const P = ypr(pts, 0, 0.25, 0.75, [15, 18, 0]);
  const ob = sc.hull(m, P, { smooth: { c: [15, 18, 0], r: [10.5, 12.5, 8], k: 0.92 }, group: 3 });
  // a smaller drip lobe fused on the upper right
  const P2 = ypr(pts.map(([x, y, z]) => [x * 0.62, y * 0.5, z * 0.6]), 0.3, 0.2, -0.9, [20.5, 11, 0.5]);
  const ob2 = sc.hull(m, P2, { smooth: { c: [20.5, 11, 0.5], r: [6.5, 6.2, 4.8], k: 0.92 }, group: 3 });
  sc.render(pc);
  const inA = (x, y) => sc.objAt(x, y) === ob.id || sc.objAt(x, y) === ob2.id;
  const edge = (x, y) => !inA(x - 1, y) || !inA(x + 1, y) || !inA(x, y - 1) || !inA(x, y + 1);
  // light caught inside: the far (lower-right) half glows through, the rim stays deep
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!inA(x, y) || edge(x, y)) continue;
    const d = Math.hypot((x + 0.5 - 18.5) / 1.1, y + 0.5 - 21.5);
    const k = sc.k[y * 32 + x];
    if (d < 6.5 && k >= 3 && (d < 4.5 || bayer(x, y) < 0.5)) pc.set(x, y, R[k - 1]);
  }
  // reflected rim light along the lower-right edge (one pixel in)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!inA(x, y) || edge(x, y)) continue;
    if ((!inA(x + 2, y) || !inA(x, y + 2)) && x + y > 34 && x + y < 44) pc.set(x, y, R[2]);
  }
  if (bug) {
    const K = 0x3a1a0a, K2 = 0x6a3410, K3 = 0x9a5a22;
    for (const [x, y] of [[15, 16], [16, 16], [17, 16], [15, 17], [16, 17], [17, 17], [15, 18], [16, 18], [17, 18], [15, 19], [16, 19], [17, 19], [16, 20]]) pc.set(x, y, K);
    for (const [x, y] of [[15, 14], [16, 14], [17, 14], [16, 15]]) pc.set(x, y, K2);
    for (const [x, y] of [[13, 15], [14, 16], [18, 16], [19, 15], [13, 18], [14, 18], [18, 18], [19, 18], [14, 20], [18, 20], [14, 13], [18, 13], [13, 12], [19, 12]]) pc.set(x, y, K2);
    pc.set(15, 16, K3); pc.set(15, 17, K3); pc.set(16, 19, K2);
  } else {
    // bubbles: lit top-left pixel, shade below-right
    for (const [x, y, big] of [[19, 19, 1], [12, 21, 0], [21, 13, 0], [16, 24, 0], [14, 17, 0]]) {
      pc.set(x, y, R[1]);
      if (big) { pc.set(x + 1, y, R[1]); pc.set(x, y + 1, R[1]); pc.set(x + 1, y + 1, R[2]); pc.set(x + 2, y + 1, R[4]); pc.set(x + 1, y + 2, R[4]); }
      else pc.set(x + 1, y + 1, R[4]);
    }
  }
  // the window reflection: a curved highlight on the upper-left shoulder
  // crisp white core inside the specular patches
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
  const SL = ROCK.taupe();
  const sc = new Scene(32);
  const m = rockMat(SL, 31, { amp: 0.35, pit: 0.06 });
  const slab = sc.chunk(m, makeRng(31), { x: 16, y: 17.5, a: 14, c: 12, h: 6.5, n: [7, 7, 6], jag: 0.12, yaw: 0.25, p: 1.0, rings: [[0, 0.95], [0.45, 1], [1, 0.9]] });
  sc.render(pc);
  // ammonite in relief on the top plane (foreshortened spiral)
  const SH = rampOf([0xfff8e8, 0xf4e2c0, 0xe0c696, 0xc4a070, 0x987650, 0x6c5038, 0x382418]);
  const cx = 16, cy = 15.5, R0 = 9.5, sy = 0.82;
  const b = 0.115, a0 = R0 / Math.exp(b * Math.PI * 2 * 3.05);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (sc.objAt(x, y) !== slab.id) continue;
    const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / sy;
    const r = Math.hypot(dx, dy);
    if (r > R0 + 1) continue;
    if (r > R0) { if (dx + dy > 0) pc.set(x, y, SL[5]); continue; } // cast shadow lip
    const th = Math.atan2(dy, dx) + Math.PI;
    const w = Math.log(Math.max(0.6, r) / a0) / b / (Math.PI * 2) - th / (Math.PI * 2);
    const u = w - Math.floor(w);
    const turn = Math.floor(w) + th / (Math.PI * 2);
    const rib = ((turn * 13) % 1 + 1) % 1 < 0.4;
    // whorl tube profile lit from the top-left
    const ang = Math.atan2(dy, dx);
    const facing = Math.cos(ang - Math.atan2(-0.6, -0.55)); // +1 on the lit side of the spiral
    let k = u < 0.15 ? 6 : u < 0.38 ? (facing > 0 ? 1 : 2) : u < 0.75 ? 3 : 4;
    if (rib && k > 1 && k < 6) k -= 1;
    if (k === 3 && facing < -0.4) k = 4;
    pc.set(x, y, SH[k]);
  }
  pc.set(cx - 0.5, cy - 0.5, SH[6]);
  glint(pc, 10, 10, 1, 0xffffff, SH[1]);
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


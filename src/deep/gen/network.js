// The cave network: the mine is laid out like a dungeon that nature dug. A jittered 3D grid of
// nodes (16 m apart, layers 9 m apart) holds chambers of four kinds:
//   junction  where passages meet (a little widening, no room)
//   grotto    a small round room
//   cavern    a domed chamber: flat sediment floor, a breakdown pile under the fractured roof,
//             flowstone columns
//   hall      a huge one (deeper down; dinosaur country is nearly all hall)
// joined by passages: on every layer a random spanning tree (growing tree: long winding runs and
// side branches that end in a dead end), a few extra links that close loops, and ramps between
// the layers. Passages are phreatic tubes (round, a flat silt floor) or vadose canyons (tall and
// narrow, scalloped, a round tube at the top: a keyhole), some pinched into a squeeze. Dead ends
// are grottos, and the generator puts something there (an ore seam, a cracked-open geode).
//
// netDensity(plan, x, y, z) is the openness of the network at a point (metres; > 0 open, about
// 0.1 per metre in from a wall, like the rest of caveDensity). A coarse bucket grid lists the
// primitives near each point, so a sample only looks at the few chambers and passages around it.
// Pure and deterministic (it is rebuilt from the seed in every chunk worker).
import { makeRng } from '../../core/util.js';

export const NET = { CX: 16, CY: 10, NX: 12, NY: 21, X0: -96, D0: 6.5 };
const B = 8; // bucket size (m)
const BX0 = -96, BY0 = -216, BZ0 = -96, NBX = 24, NBY = 28, NBZ = 24;
const K = 0.1; // openness per metre

export const J = 0, GROTTO = 1, CAVERN = 2, HALL = 3;
export const KIND_NAMES = ['junction', 'grotto', 'cavern', 'hall'];

/**
 * Build the network for a plan. o: { avoid: [{x, y, z, r}] (spheres nothing may cut into),
 * avoidCol: [{x, z, r, y0, y1}] (vertical columns: the town shaft), dino(x, y, z) → 0..1 }.
 */
export function buildNetwork(seed, o = {}) {
  const rng = makeRng(seed + 4242);
  const { CX, CY, NX, NY, X0, D0 } = NET;
  const nodes = [];
  const at = (i, j, k) => nodes[i + NX * (k + NX * j)];
  const avoid = o.avoid || [], cols = o.avoidCol || [];
  const near = (x, y, z, pad) => {
    for (const a of avoid) { const dx = a.x - x, dy = (a.y - y) * 1.3, dz = a.z - z, r = a.r + pad; if (dx * dx + dy * dy + dz * dz < r * r) return true; }
    for (const c of cols) { const dx = c.x - x, dz = c.z - z, r = c.r + pad; if (y > c.y0 - pad && y < c.y1 + pad && dx * dx + dz * dz < r * r) return true; }
    return false;
  };
  // ---- nodes
  for (let j = 0; j < NY; j++) for (let k = 0; k < NX; k++) for (let i = 0; i < NX; i++) {
    const depth = D0 + j * CY + rng.range(-2, 2);
    const x = X0 + CX / 2 + i * CX + rng.range(-4.5, 4.5), z = X0 + CX / 2 + k * CX + rng.range(-4.5, 4.5), y = -depth;
    const dino = o.dino ? o.dino(x, y, z) : 0;
    let kind;
    const h = rng();
    if (dino > 0.3) kind = h < 0.7 ? HALL : CAVERN;
    else if (depth < 12) kind = h < 0.45 ? J : h < 0.85 ? GROTTO : CAVERN;
    else if (depth < 25) kind = h < 0.34 ? J : h < 0.68 ? GROTTO : h < 0.97 ? CAVERN : HALL;
    else kind = h < 0.32 ? J : h < 0.66 ? GROTTO : h < 0.945 ? CAVERN : HALL;
    let R = kind === J ? rng.range(1.5, 2.1) : kind === GROTTO ? rng.range(2.6, 4) : kind === CAVERN ? rng.range(4.5, 6.6) : rng.range(8, 11);
    let H = kind === J ? rng.range(2.2, 2.7) : kind === GROTTO ? rng.range(2.6, 3.5) : kind === CAVERN ? rng.range(3.5, 5.2) : rng.range(5.5, 8.5);
    if (dino > 0.3) { R *= 1 + dino * 0.25; H *= 1 + dino * 0.15; }
    const asp = rng.range(0.72, 1.3);
    const n = {
      edge: false, id: nodes.length, i, j, kk: k, x, y, z, kind, dino,
      Rx: R * Math.sqrt(asp), Rz: R / Math.sqrt(asp), H,
      yF: y - Math.min(H * 0.35, 2.2), tx: 0, tz: 0, pileH: 0, px: 0, pz: 0, pr: 0,
      seed: (rng() * 1e9) | 0, deg: 0, off: false, nb: [], cols: 0, frac: 0, lift: null,
      iRx: 0, iRz: 0, iH: 0, k: 0, pr2: 0, x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0,
    };
    // sloping floors in some caverns (rimstone forms on those), a breakdown pile under big roofs
    if (kind >= CAVERN && rng() < 0.45) { const a = rng() * 6.283, s = rng.range(0.03, 0.08); n.tx = Math.cos(a) * s; n.tz = Math.sin(a) * s; }
    else rng();
    if (kind >= CAVERN && rng() < 0.7) {
      const a = rng() * 6.283, d = rng.range(0.2, 0.55);
      n.px = x + Math.cos(a) * n.Rx * d; n.pz = z + Math.sin(a) * n.Rz * d;
      n.pr = R * rng.range(0.35, 0.6); n.pileH = Math.min(H * 0.45, rng.range(1.2, 2.8));
    } else { rng(); rng(); rng(); rng(); }
    n.cols = kind >= CAVERN && rng() < 0.6 ? 1 : 0; // flowstone columns
    n.frac = kind >= CAVERN ? rng.range(0.08, 0.2) : rng.range(0, 0.06); // fractured roof
    // nothing in the way of the places that need solid rock round them
    if (near(x, y, z, Math.max(n.Rx, n.Rz) + 2)) n.off = true;
    nodes.push(n);
  }
  // ---- edges: a growing-tree spanning tree per layer, loops, ramps between layers
  const edges = [];
  const linked = new Set();
  const key = (a, b) => (a < b ? a * 8192 + b : b * 8192 + a);
  const link = (a, b, ramp = false) => {
    if (a.off || b.off || linked.has(key(a.id, b.id))) return null;
    const e = makeEdge(a, b, rng, ramp);
    if (crosses(e, near)) return null;
    linked.add(key(a.id, b.id));
    edges.push(e);
    a.deg++; b.deg++;
    a.nb.push(b.id); b.nb.push(a.id);
    return e;
  };
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let j = 0; j < NY; j++) {
    const seen = new Uint8Array(NX * NX);
    const start = rng.int(0, NX * NX - 1);
    const live = [start];
    seen[start] = 1;
    while (live.length) {
      const li = rng() < 0.6 ? live.length - 1 : rng.int(0, live.length - 1);
      const c = live[li], ci = c % NX, ck = (c / NX) | 0;
      const opts = [];
      for (const [di, dk] of N4) { const ni = ci + di, nk = ck + dk; if (ni >= 0 && nk >= 0 && ni < NX && nk < NX && !seen[ni + NX * nk]) opts.push(ni + NX * nk); }
      if (!opts.length) { live.splice(li, 1); continue; }
      const nb = opts[rng.int(0, opts.length - 1)];
      seen[nb] = 1;
      live.push(nb);
      link(at(ci, j, ck), at(nb % NX, j, (nb / NX) | 0));
    }
    // loops
    for (let k = 0; k < NX; k++) for (let i = 0; i < NX; i++) {
      if (i + 1 < NX && rng() < 0.11) link(at(i, j, k), at(i + 1, j, k));
      if (k + 1 < NX && rng() < 0.11) link(at(i, j, k), at(i, j, k + 1));
    }
  }
  // ramps down to the next layer: a sloping passage to a neighbour's column
  for (let j = 0; j + 1 < NY; j++) {
    let n = 0;
    for (let k = 0; k < NX; k++) for (let i = 0; i < NX; i++) {
      const force = n < 3 && k === NX - 1 && i > NX - 4;
      if (!force && rng() >= 0.15) { rng(); continue; }
      const [di, dk] = N4[rng.int(0, 3)];
      const ni = i + di, nk = k + dk;
      if (ni < 0 || nk < 0 || ni >= NX || nk >= NX) continue;
      if (link(at(i, j, k), at(ni, j + 1, nk), true)) n++;
    }
  }
  // dead ends become grottos (something waits at the end of them)
  for (const n of nodes) {
    if (n.off || n.deg === 0) continue;
    if (n.deg === 1 && n.kind === J) { n.kind = GROTTO; const R = 2.8 + (n.seed % 100) / 100 * 1.2; n.Rx = n.Rz = R; n.H = 2.9; n.yF = n.y - 1.0; }
  }
  for (const n of nodes) prepNode(n);
  // ---- the bucket grid (CSR)
  const prims = [];
  for (const n of nodes) if (!n.off && n.deg > 0) prims.push(n);
  for (const e of edges) prims.push(e);
  const NB = NBX * NBY * NBZ;
  const count = new Int32Array(NB + 1);
  let fill = null, list = null;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      const bx0 = Math.max(0, Math.floor((p.x0 - BX0) / B)), bx1 = Math.min(NBX - 1, Math.floor((p.x1 - BX0) / B));
      const by0 = Math.max(0, Math.floor((p.y0 - BY0) / B)), by1 = Math.min(NBY - 1, Math.floor((p.y1 - BY0) / B));
      const bz0 = Math.max(0, Math.floor((p.z0 - BZ0) / B)), bz1 = Math.min(NBZ - 1, Math.floor((p.z1 - BZ0) / B));
      for (let bz = bz0; bz <= bz1; bz++) for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
        const b = bx + NBX * (by + NBY * bz);
        if (pass === 0) count[b + 1]++; else list[fill[b]++] = p;
      }
    }
    if (pass === 0) { for (let b = 0; b < NB; b++) count[b + 1] += count[b]; list = new Array(count[NB]); fill = count.slice(); }
  }
  return { nodes, edges, start: count, list, deadEnds: nodes.filter((n) => !n.off && n.deg === 1) };
}

/** A passage between two nodes: its floor line A → M → B (a bend in the middle), its kind and size. */
function makeEdge(a, b, rng, ramp) {
  const ax = a.x, az = a.z, bx = b.x, bz = b.z, ay = a.yF + 0.05, by = b.yF + 0.05;
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
  const s = rng.range(-0.3, 0.3) * L;
  const mx = (ax + bx) / 2 - dz / L * s, mz = (az + bz) / 2 + dx / L * s;
  const my = (ay + by) / 2 + (ramp ? 0 : rng.range(-0.8, 0.6));
  const deep = -Math.min(a.y, b.y);
  const canyon = !ramp && deep > 8 && rng() < 0.32;
  const r = canyon ? rng.range(0.55, 0.85) : rng.range(0.9, 1.35) * (a.dino > 0.3 || b.dino > 0.3 ? 1.6 : 1);
  const H = canyon ? rng.range(2.8, 4.6) : 0;
  const sq = !ramp && rng() < 0.25 ? rng.range(0.25, 0.42) : 0, st = rng.range(0.3, 0.7);
  const ph = rng() * 6.283, mw = canyon ? rng.range(0.15, 0.35) : 0;
  const v0x = mx - ax, v0z = mz - az, v1x = bx - mx, v1z = bz - mz;
  const l0 = Math.max(1e-6, v0x * v0x + v0z * v0z), l1 = Math.max(1e-6, v1x * v1x + v1z * v1z);
  const rt = canyon ? r * 1.75 : 0, pad = (canyon ? rt : r) + 2.2;
  return {
    edge: true, a: a.id, b: b.id, ramp, kind: canyon ? 1 : 0, r, H, sq, st, ph, mw, rt,
    p: [ax, ay, az, mx, my, mz, bx, by, bz],
    v0x, v0z, v1x, v1z, il0: 1 / l0, il1: 1 / l1, len0: Math.sqrt(l0), len1: Math.sqrt(l1),
    x0: Math.min(ax, mx, bx) - pad, x1: Math.max(ax, mx, bx) + pad,
    z0: Math.min(az, mz, bz) - pad, z1: Math.max(az, mz, bz) + pad,
    y0: Math.min(ay, my, by) - 0.8, y1: Math.max(ay, my, by) + (canyon ? H : r * 2) + 1.2,
  };
}

/** Does a passage run through a protected place? */
function crosses(e, near) {
  const p = e.p;
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const s = t < 0.5 ? t * 2 : (t - 0.5) * 2, o = t < 0.5 ? 0 : 3;
    const x = p[o] + (p[o + 3] - p[o]) * s, y = p[o + 1] + (p[o + 4] - p[o + 1]) * s + 1, z = p[o + 2] + (p[o + 5] - p[o + 2]) * s;
    if (near(x, y, z, (e.rt || e.r) + 1.5)) return true;
  }
  return false;
}

function prepNode(n) {
  n.iRx = 1 / n.Rx; n.iRz = 1 / n.Rz;
  n.iH = 1 / n.H;
  n.k = K * Math.min(n.Rx, n.Rz, n.H * 1.4) / 2.3;
  n.pr2 = n.pr > 0 ? 1 / (n.pr * n.pr) : 0;
  const R = Math.max(n.Rx, n.Rz) * 1.2 + 1.8;
  n.x0 = n.x - R; n.x1 = n.x + R; n.z0 = n.z - R; n.z1 = n.z + R;
  n.y0 = n.yF - 0.8; n.y1 = n.yF + n.H * 1.15 + 1.2;
}

/**
 * Openness of the network at (x, y, z) (metres): > 0 open. nz: plan noises (for the walls' wobble,
 * boulders, cracked roofs and columns). Returns -1 far from everything.
 */
export function netDensity(net, nz, x, y, z) {
  const bx = Math.floor((x - BX0) / B), by = Math.floor((y - BY0) / B), bz = Math.floor((z - BZ0) / B);
  if (bx < 0 || by < 0 || bz < 0 || bx >= NBX || by >= NBY || bz >= NBZ) return -1;
  const b = bx + NBX * (by + NBY * bz);
  const s0 = net.start[b], s1 = net.start[b + 1];
  if (s0 === s1) return -1;
  // the walls wobble: a two-scale warp of the sample point (shared by every shape here)
  const n1 = nz[1], n2 = nz[2];
  const wx = x + n1.n(x * 0.075 + 3.3, y * 0.09, z * 0.075) * 2.6 + n2.n(x * 0.21, y * 0.25 + 7.7, z * 0.21) * 0.9;
  const wz = z + n2.n(x * 0.075 - 9.1, y * 0.09, z * 0.075 + 1.7) * 2.6 + n1.n(x * 0.21 + 4.4, y * 0.25, z * 0.21 - 2.2) * 0.9;
  let d = -1;
  const L = net.list;
  for (let i = s0; i < s1; i++) {
    const p = L[i];
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1 || y < p.y0 || y > p.y1) continue;
    const o = p.edge ? passage(p, wx, y, wz) : chamber(p, nz, wx, y, wz, x, z);
    if (o > d) d = o;
  }
  return d;
}

function chamber(c, nz, x, y, z, rx, rz) {
  const dx = (x - c.x) * c.iRx, dz = (z - c.z) * c.iRz;
  const h2 = dx * dx + dz * dz;
  if (h2 > 1.5) return -1;
  // the floor: a little tilt, silt hummocks, a breakdown pile of boulders under the roof
  let yF = c.yF + c.tx * (x - c.x) + c.tz * (z - c.z);
  if (c.pileH > 0) {
    const px = rx - c.px, pz = rz - c.pz, pd = (px * px + pz * pz) * c.pr2;
    if (pd < 1) {
      const bo = nz[3].n(rx * 0.85 + 11.1, y * 0.85, rz * 0.85 - 3.7);
      yF += c.pileH * (1 - pd) * (1 - pd) * (0.55 + bo * 0.9) + Math.max(0, bo) * 0.5 * (1 - pd);
    }
  }
  const v = (y - yF) * c.iH;
  if (v < -0.35 || v > 1.3) return -1;
  // a dome over a flat floor: h^2.5 + v^2 < 1, the roof cracked into blocks
  let f = 1 - h2 * Math.sqrt(Math.sqrt(h2));
  if (v > 0) {
    f -= v * v;
    if (v > 0.4 && c.frac > 0) f -= Math.abs(nz[0].n(rx * 0.33 + 7.7, y * 0.33, rz * 0.33 - 1.1)) * c.frac * 2 * (v - 0.4);
  }
  let o = f * c.k;
  // the floor: flat silt (a steep gradient keeps it level under the wall noise)
  const fl = (y - yF) * 0.32;
  if (fl < o) o = fl;
  // flowstone columns where a stalactite met its stalagmite
  if (c.cols && o > 0) {
    const cn = nz[3].n(rx * 0.42 + 21.7, y * 0.05, rz * 0.42 - 13.3);
    if (cn > 0.42) o -= (cn - 0.42) * 2.6 * Math.min(1, (1 - h2) * 3);
  }
  return o;
}

function passage(e, x, y, z) {
  const p = e.p;
  // nearest of the two segments, in plan (x, z): t along it, the floor height there
  let ax = p[0], az = p[2];
  let t = ((x - ax) * e.v0x + (z - az) * e.v0z) * e.il0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  let cx = ax + e.v0x * t, cz = az + e.v0z * t;
  let u2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
  let fy = p[1] + (p[4] - p[1]) * t, tt = t * 0.5, side = ((x - ax) * e.v0z - (z - az) * e.v0x) / e.len0;
  ax = p[3]; az = p[5];
  let t2 = ((x - ax) * e.v1x + (z - az) * e.v1z) * e.il1;
  t2 = t2 < 0 ? 0 : t2 > 1 ? 1 : t2;
  cx = ax + e.v1x * t2; cz = az + e.v1z * t2;
  const u22 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
  if (u22 < u2) { u2 = u22; fy = p[4] + (p[7] - p[4]) * t2; tt = 0.5 + t2 * 0.5; side = ((x - ax) * e.v1z - (z - az) * e.v1x) / e.len1; }
  const v = y - fy;
  if (v < -0.5) return -1;
  // a squeeze somewhere along it
  let sq = 1;
  if (e.sq) { const q = (tt - e.st) * 9; sq = 1 - e.sq * Math.exp(-q * q); }
  let o;
  if (e.kind === 0) {
    // a phreatic tube: round, its floor silted flat
    const r = e.r * sq, cy = r * 0.8, dv = v - cy, u = Math.sqrt(u2);
    o = (r - Math.sqrt(u * u + dv * dv)) * K;
  } else {
    // a vadose canyon: a tall slot, wider and wobbly low down, the old tube at its top (a keyhole)
    const H = e.H * (0.75 + 0.25 * sq), rt = e.rt, top = H - rt;
    const dv = v - top;
    const ot = (rt - Math.sqrt(u2 + dv * dv)) * K;
    const w = e.r * (1 + 0.25 * Math.max(0, 1 - v / H)) * sq;
    const s = Math.abs(side + e.mw * Math.sin(v * 1.7 + e.ph));
    const os = Math.min(w - s, top - v + rt * 0.6) * K;
    o = ot > os ? ot : os;
  }
  const fl = v * 0.32;
  return fl < o ? fl : o;
}

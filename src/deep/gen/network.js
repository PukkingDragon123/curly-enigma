// The cave network: the mine is laid out like a dungeon that nature dug. A jittered 3D grid of
// nodes (16 m apart, layers 9 m apart) holds chambers of four kinds:
//   junction  where passages meet (a little widening, no room)
//   grotto    a small round room
//   cavern    a domed chamber: flat sediment floor, a breakdown pile under the fractured roof,
//             flowstone columns
//   hall      a huge one (deeper down; dinosaur country is nearly all hall)
//   vault     a giant cavern (a few in every zone, tens of metres across and up to ~18 m high):
//             a domed roof cracked into blocks, steep walls stepped at the bedding planes and
//             lobed into alcoves, often a still lake in a basin in its floor (lava in the magma
//             deep), breakdown piles, a raised terrace with a rubble ramp down, columns, and a talus
//             slope under every passage that comes in high up the wall, so every way in can be
//             walked (see planVaults; the generator adds stalactite forests, falls and crystals)
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

export const J = 0, GROTTO = 1, CAVERN = 2, HALL = 3, VAULT = 4;
export const KIND_NAMES = ['junction', 'grotto', 'cavern', 'hall', 'vault'];

/**
 * Build the network for a plan. o: { avoid: [{x, y, z, r}] (spheres nothing may cut into),
 * avoidCol: [{x, z, r, y0, y1}] (vertical columns: the town shaft), dino(x, y, z) → 0..1,
 * vaults: [{ d0, d1, n, zone, lake (chance), fluid, big }] (giant caverns per depth band),
 * vaultAvoid: [{x, y, z, r}] (more places a giant cavern keeps clear of) }.
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
  // ---- giant caverns: they swallow the chambers in their way; passages into them get talus slopes
  const vaults = o.vaults ? planVaults(nodes, edges, near, seed, o) : [];
  for (const n of nodes) prepNode(n);
  // ---- the bucket grid (CSR)
  const prims = [];
  for (const n of nodes) if (!n.off && n.deg > 0) prims.push(n);
  for (const e of edges) if (!e.dead) prims.push(e);
  for (const v of vaults) prims.push(v);
  const NB = NBX * NBY * NBZ;
  const count = new Int32Array(NB + 1);
  let fill = null, list = null;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      const bx0 = Math.max(0, Math.floor((p.x0 - BX0) / B)), bx1 = Math.min(NBX - 1, Math.floor((p.x1 - BX0) / B));
      const py0 = p.vault ? p.yb0 : p.y0, py1 = p.vault ? p.yb1 : p.y1; // (a vault's y0 is its floor)
      const by0 = Math.max(0, Math.floor((py0 - BY0) / B)), by1 = Math.min(NBY - 1, Math.floor((py1 - BY0) / B));
      const bz0 = Math.max(0, Math.floor((p.z0 - BZ0) / B)), bz1 = Math.min(NBZ - 1, Math.floor((p.z1 - BZ0) / B));
      for (let bz = bz0; bz <= bz1; bz++) for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
        const b = bx + NBX * (by + NBY * bz);
        if (pass === 0) count[b + 1]++; else list[fill[b]++] = p;
      }
    }
    if (pass === 0) { for (let b = 0; b < NB; b++) count[b + 1] += count[b]; list = new Array(count[NB]); fill = count.slice(); }
  }
  return { nodes, edges, vaults, start: count, list, deadEnds: nodes.filter((n) => !n.off && n.deg === 1) };
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
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
    if (p.vault ? (y < p.yb0 || y > p.yb1) : (y < p.y0 || y > p.y1)) continue;
    const o = p.edge ? passage(p, wx, y, wz) : p.vault ? vault(p, nz, wx, y, wz, x, z) : chamber(p, nz, wx, y, wz, x, z);
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
  // passages into a giant cavern with a lake run in above its water (never under it)
  const vt = e.vlt;
  if (vt && vt.lake) {
    const dx = x - vt.x, dz = z - vt.z;
    const hu = (dx * vt.c + dz * vt.s) * vt.iRx, hw = (-dx * vt.s + dz * vt.c) * vt.iRz, h = Math.sqrt(hu * hu + hw * hw);
    if (h < 1.25) { const lim = vt.lake.wl + 0.35 - Math.max(0, h - 1) * 9; if (fy < lim) fy = lim; }
  }
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

// ---------------------------------------------------------------- giant caverns (vaults)
const sm01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const TALUS = 0.58; // rise per metre of the rubble slopes (about 30°: an easy scramble either way)

/**
 * Pick the giant caverns (a band at a time: o.vaults) and fit them into the network: the chambers
 * inside one are swallowed, passages between swallowed chambers go (the cavern is the way now),
 * and every passage that still comes in gets a mouth: where its floor line meets the cavern's
 * wall. A mouth high up the wall gets a talus cone down to the floor (vaultFloor), a passage that
 * would come in too high to reach is dropped where the network can spare it.
 */
function planVaults(nodes, edges, near, seed, o) {
  const rng = makeRng(seed + 9191);
  const out = [];
  const extra = o.vaultAvoid || [];
  const blocked = (x, y, z, pad) => near(x, y, z, pad) || extra.some((a) => Math.hypot(a.x - x, (a.y - y) * 1.3, a.z - z) < a.r + pad);
  for (const band of o.vaults) {
    const cand = nodes.filter((n) => !n.off && n.deg >= 2 && n.kind >= GROTTO && -n.yF > band.d0 && -n.yF < band.d1 && Math.abs(n.x) < 70 && Math.abs(n.z) < 70);
    for (let i = cand.length - 1; i > 0; i--) { const j = rng.int(0, i); const t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
    let made = 0;
    for (const n of cand) {
      if (made >= band.n) break;
      if (n.off) continue;
      const big = band.big ?? 1;
      const R = rng.range(13, 18.5) * big, asp = rng.range(0.8, 1.25);
      const Rx = R * Math.sqrt(asp), Rz = R / Math.sqrt(asp), Rm = Math.max(Rx, Rz);
      const H = rng.range(13.5, 18) * (0.8 + 0.2 * big);
      const y0 = n.yF - rng.range(0.4, 1.2);
      if (Math.abs(n.x) + Rm > 90 || Math.abs(n.z) + Rm > 90 || -(y0 + H) < 3.5) continue;
      if (out.some((v) => Math.hypot(v.x - n.x, v.z - n.z) < v.Rm + Rm + 8 && Math.abs(v.y0 - y0) < Math.max(v.H, H) + 6)) continue;
      let bad = false;
      for (let a = 0; a < 6.283 && !bad; a += 0.5) for (const f of [0, 0.5, 1]) {
        for (const hy of [0.5, H * 0.5, H - 0.5]) if (blocked(n.x + Math.cos(a) * Rm * f, y0 + hy, n.z + Math.sin(a) * Rm * f, 3)) { bad = true; break; }
        if (bad) break;
      }
      if (bad) continue;
      out.push(makeVault(out.length, n, band, rng, { Rx, Rz, Rm, H, y0 }, nodes, edges));
      made++;
    }
  }
  return out;
}

function makeVault(id, n, band, rng, d, nodes, edges) {
  const { Rx, Rz, Rm, H, y0 } = d;
  const rot = rng() * Math.PI;
  const v = {
    vault: true, kind: VAULT, id, node: n.id, x: n.x, z: n.z, y0, H, Rx, Rz, Rm, rot, c: Math.cos(rot), s: Math.sin(rot), iRx: 1 / Rx, iRz: 1 / Rz,
    zone: band.zone, seed: rng.int(1, 1e9), ph: rng() * 100, Fr: rng.range(0.6, 1.6), frac: rng.range(0.1, 0.2),
    stal: rng.range(0.25, 0.55) * (band.stal ?? 1), stalL: rng.range(2.5, 5), mouths: [], piles: [], cols: [], terr: null, lake: null,
  };
  // the lake: a basin in the floor a little off centre (lava in the magma deep)
  if (rng() < (band.lake ?? 0.7)) {
    const a = rng() * 6.283, off = rng.range(0, 0.15), lr = rng() * Math.PI;
    const lx = v.x + Math.cos(a) * Rx * off, lz = v.z + Math.sin(a) * Rz * off;
    v.lake = { x: lx, z: lz, rx: Rm * rng.range(0.32, 0.45), rz: Rm * rng.range(0.3, 0.42), c: Math.cos(lr), s: Math.sin(lr), wl: y0 - 0.45, D: band.fluid === 'lava' ? rng.range(0.9, 1.5) : rng.range(1.3, 2.6), k: 1.3, fluid: band.fluid || 'water' };
  }
  // where a point at normalised (h, angle a) of the vault's own frame is in the world
  const at = (h, a) => { const u = Math.cos(a) * h * Rx, w = Math.sin(a) * h * Rz; return { x: v.x + u * v.c - w * v.s, z: v.z + u * v.s + w * v.c }; };
  const lakeNear = (p, pad) => v.lake && Math.hypot((p.x - v.lake.x) / v.lake.rx, (p.z - v.lake.z) / v.lake.rz) < pad;
  // breakdown piles: blocks fallen from the roof, out in the dry
  const np = rng.int(1, 3);
  for (let i = 0; i < np; i++) {
    const p = at(rng.range(0.35, 0.72), rng() * 6.283);
    if (lakeNear(p, 1.5)) continue;
    const r = rng.range(2.6, 5.5);
    v.piles.push({ x: p.x, z: p.z, r, i2: 1 / (r * r), h: rng.range(1.2, 3.4) });
  }
  // a terrace along part of the wall (a second level), a rubble ramp down at one end
  if (rng() < 0.65) {
    const a = rng() * 6.283, aw = rng.range(0.45, 0.85), hT = rng.range(0.66, 0.74), yT = y0 + rng.range(3.2, 5.6);
    v.terr = { a, aw, h: hT, y: yT };
    const e = at((hT + 0.95) / 2, a + aw * 0.8 * (rng() < 0.5 ? 1 : -1));
    v.mouths.push({ x: e.x, z: e.z, y: yT - 0.1, ramp: true });
  }
  // columns where a stalactite met its stalagmite long ago
  const nc = rng.int(2, 6);
  for (let i = 0; i < nc; i++) {
    const p = at(rng.range(0.12, 0.78), rng() * 6.283);
    if (v.cols.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.r + 4)) continue;
    v.cols.push({ x: p.x, z: p.z, r: rng() < 0.25 ? rng.range(1.4, 2.3) : rng.range(0.45, 1.2), ph: rng() * 6.283, k: rng.int(5, 9) });
  }
  // swallow the chambers inside it (and any whose room would reach well into it)
  for (const q of nodes) {
    if (q.yF < y0 - 3 || q.yF > y0 + H - 1.2) continue;
    const dx = q.x - v.x, dz = q.z - v.z;
    const h = Math.hypot((dx * v.c + dz * v.s) / Rx, (-dx * v.s + dz * v.c) / Rz);
    const qr = Math.max(q.Rx, q.Rz) * 1.25;
    if (h < 1.15 || Math.hypot(dx, dz) - qr < Rm * 0.8) { q.off = true; q.vault = v; }
  }
  // passages: inside ones go; ones coming in get a mouth (a talus cone under it when it is high)
  const roofAt = (h) => y0 + H * Math.sqrt(Math.max(0, 1 - h ** 8));
  const hOf = (x, z) => { const dx = x - v.x, dz = z - v.z; return Math.hypot((dx * v.c + dz * v.s) / Rx, (-dx * v.s + dz * v.c) / Rz); };
  for (const e of edges) {
    if (e.dead) continue;
    const A = nodes[e.a], B = nodes[e.b];
    const ia = A.vault === v, ib = B.vault === v;
    if (ia && ib) { e.dead = true; A.deg--; B.deg--; continue; }
    if (e.x1 < v.x - Rm - 2 || e.x0 > v.x + Rm + 2 || e.z1 < v.z - Rm - 2 || e.z0 > v.z + Rm + 2 || e.y1 < y0 - 4 || e.y0 > y0 + H + 2) continue;
    const p = e.p, N = 48;
    const pt = (t) => { const s = t < 0.5 ? t * 2 : (t - 0.5) * 2, k = t < 0.5 ? 0 : 3; return [p[k] + (p[k + 3] - p[k]) * s, p[k + 1] + (p[k + 4] - p[k + 1]) * s, p[k + 2] + (p[k + 5] - p[k + 2]) * s]; };
    const inside = (q) => { const h = hOf(q[0], q[2]); return h < 1 && q[1] > y0 - 3.5 && q[1] < roofAt(h) + 0.5; };
    const ms = [];
    for (const [t0, dt] of [[0, 1 / N], [1, -1 / N]]) {
      if ((t0 === 0 && ia) || (t0 === 1 && ib)) continue;
      for (let i = 0, t = t0; i <= N; i++, t += dt) {
        const q = pt(t);
        if (inside(q)) { ms.push({ x: q[0], z: q[2], y: Math.max(q[1], v.lake ? v.lake.wl + 0.35 : -1e9) }); break; }
      }
    }
    if (!ms.length && !ia && !ib) continue;
    // a passage coming in too high to reach (or under the lake): the network can do without it?
    const tooHigh = ms.some((m) => m.y > y0 + H * 0.7);
    if (tooHigh && !ia && !ib && A.deg > 1 && B.deg > 1) { e.dead = true; A.deg--; B.deg--; continue; }
    e.vlt = v;
    for (const m of ms) v.mouths.push(m);
  }
  v.yb0 = y0 - (v.lake ? v.lake.D + 1.5 : 1.5);
  v.yb1 = y0 + H + 2.5;
  const pad = Rm * 1.2 + 4;
  v.x0 = v.x - pad; v.x1 = v.x + pad; v.z0 = v.z - pad; v.z1 = v.z + pad; // (its box in y: yb0..yb1)
  return v;
}

/** Distance from a vault lake's centre, normalised (1 = the waterline of a flat shore; wobbly). */
export function lakeDist(L, nz, x, z) {
  const dx = x - L.x, dz = z - L.z;
  const a = (dx * L.c + dz * L.s) / L.rx, b = (-dx * L.s + dz * L.c) / L.rz;
  return Math.sqrt(a * a + b * b) + nz[1].n(x * 0.16 + 3.1, 3.3, z * 0.16 - 2.2) * 0.16;
}
/** Is (x, y, z) in a vault lake's water (or the shore dips round it that fill too)? */
export function inVaultLake(v, nz, x, y, z) {
  const L = v.lake;
  return !!L && y < L.wl && y > L.wl - L.D - 1.5 && lakeDist(L, nz, x, z) < 1.6;
}

/**
 * The floor of a vault at (x, z) (raw metres; h = normalised distance from the centre on the
 * warped wall, u / w the warped point in the vault's frame): a gentle bowl rising to the walls,
 * silt hummocks, the lake's basin, talus cones under the mouths, breakdown piles, the terrace.
 */
export function vaultFloor(v, nz, x, z, h, u, w) {
  const hum = nz[3].n(x * 0.21 + 5.5, 0.37, z * 0.21 - 3.1) * 0.21 + nz[0].n(x * 0.6, 1.7, z * 0.6) * 0.07;
  const rk = h > 0.58 ? Math.min(1, (h - 0.58) / 0.42) : 0;
  let f = v.y0 + v.Fr * rk * rk + hum;
  const L = v.lake;
  if (L) {
    const dL = lakeDist(L, nz, x, z);
    if (dL < 2.2) {
      const lf = L.wl + (dL < 1 ? -L.D * (1 - dL * dL) : (dL - 1) * L.k) + hum * 0.35;
      if (lf < f) f = lf;
    }
  }
  // talus under the mouths: lumpy rubble at ~30°
  const M = v.mouths;
  for (let i = 0; i < M.length; i++) {
    const m = M[i], c = m.y + 0.25 - TALUS * Math.hypot(x - m.x, z - m.z);
    if (c > f - 0.6) { const t = c + nz[3].n(x * 0.9 + i, 2.2, z * 0.9) * 0.22; if (t > f) f = t; }
  }
  for (const p of v.piles) {
    const dx = x - p.x, dz = z - p.z, pd = (dx * dx + dz * dz) * p.i2;
    if (pd < 1) {
      const bo = nz[3].n(x * 0.85 + 11.1, f * 0.85, z * 0.85 - 3.7);
      const t = f + p.h * (1 - pd) * (1 - pd) * (0.55 + bo * 0.9) + Math.max(0, bo) * 0.5 * (1 - pd);
      if (t > f) f = t;
    }
  }
  const T = v.terr;
  if (T && h > T.h - 0.25) {
    let da = Math.abs(Math.atan2(w, u) - T.a);
    if (da > Math.PI) da = 2 * Math.PI - da;
    const e = Math.min((h - T.h) * v.Rm, (T.aw - da) * v.Rm * h); // metres in from the shelf's edge
    const tf = T.y + hum * 0.6 + Math.min(0, e) * 2.6;
    if (tf > f) f = tf;
  }
  return f;
}

/** The roof of a vault over (x, z) (no fractures): highest in the middle, down to the floor at the wall. */
export function vaultRoof(v, nz, x, z, h) {
  const h2 = h * h, h8 = h2 * h2 * h2 * h2;
  return v.y0 + v.H * Math.sqrt(Math.max(0, 1 - h8)) + nz[0].n(x * 0.11 + v.ph, 9.1, z * 0.11) * 1.3 * Math.max(0, 1 - h2);
}

/** A vault's frame at a warped point: { h, u, w } (h: normalised distance, lobes and ledges in). */
function frame(v, nz, x, y, z, rx, rz, o) {
  const dx = x - v.x, dz = z - v.z;
  const u = (dx * v.c + dz * v.s) * v.iRx, w = (-dx * v.s + dz * v.c) * v.iRz;
  const h0 = Math.sqrt(u * u + w * w);
  o.u = u; o.w = w; o.h0 = h0;
  if (h0 > 1.5) { o.h = h0; return o; }
  // lobes and alcoves: the wall's reach varies with direction (and a little with height)
  const iu = u / (h0 + 1e-4), iw = w / (h0 + 1e-4);
  const lob = nz[2].n(iu * 1.3 + v.ph, iw * 1.3 - v.ph, y * 0.045) * 0.22 + nz[1].n(iu * 3.1 - v.ph, y * 0.11, iw * 3.1) * 0.06;
  // ledges: the walls step in at the bedding planes every few metres
  const st = (y - v.y0) / 2.7 + nz[0].n(rx * 0.05, 4.4, rz * 0.05) * 0.5, fr = st - Math.floor(st);
  o.h = h0 / (1 + lob) + (fr < 0.2 ? (0.2 - fr) * 0.18 : 0);
  return o;
}
const FR = { u: 0, w: 0, h: 0, h0: 0 };

function vault(v, nz, x, y, z, rx, rz) {
  if (y < v.yb0 || y > v.yb1) return -1;
  const F = frame(v, nz, x, y, z, rx, rz, FR);
  if (F.h0 > 1.5) return -1;
  const h = F.h;
  const fy = vaultFloor(v, nz, rx, rz, h, F.u, F.w);
  let o = (y - fy) * 0.32;
  let ry = vaultRoof(v, nz, rx, rz, h);
  // the roof cracked into blocks, some hanging lower than others
  if (y > ry - 4) ry -= Math.abs(nz[0].n(rx * 0.27 + 7.7, y * 0.27, rz * 0.27 - 1.1)) * v.frac * 9;
  const or = (ry - y) * 0.1;
  if (or < o) o = or;
  if (h > 1) { const ow = (1 - h) * v.Rm * 0.1; if (ow < o) o = ow; }
  return o;
}

/** The vault (if any) a point is in (raw metres; pad: normalised slack round the wall). */
export function vaultAt(net, x, y, z, pad = 0) {
  const V = net && net.vaults;
  if (!V) return null;
  for (const v of V) {
    if (y < v.yb0 - 1 || y > v.yb1 + 1) continue;
    const dx = x - v.x, dz = z - v.z;
    if (Math.hypot((dx * v.c + dz * v.s) * v.iRx, (-dx * v.s + dz * v.c) * v.iRz) < 1 + pad) return v;
  }
  return null;
}

/** The warp netDensity applies to (x, y, z) before the shapes: [wx, wz]. */
export function warpXZ(nz, x, y, z) {
  const n1 = nz[1], n2 = nz[2];
  return [x + n1.n(x * 0.075 + 3.3, y * 0.09, z * 0.075) * 2.6 + n2.n(x * 0.21, y * 0.25 + 7.7, z * 0.21) * 0.9,
    z + n2.n(x * 0.075 - 9.1, y * 0.09, z * 0.075 + 1.7) * 2.6 + n1.n(x * 0.21 + 4.4, y * 0.25, z * 0.21 - 2.2) * 0.9];
}

/** Floor and roof heights of a vault over raw (x, z) (as the density sees them near height y). */
export function vaultSpan(v, nz, x, z, y = v.y0 + 1) {
  const [wx, wz] = warpXZ(nz, x, y, z);
  const F = frame(v, nz, wx, y, wz, x, z, { u: 0, w: 0, h: 0, h0: 0 });
  return { floor: vaultFloor(v, nz, x, z, F.h, F.u, F.w), roof: vaultRoof(v, nz, x, z, F.h), h: F.h };
}

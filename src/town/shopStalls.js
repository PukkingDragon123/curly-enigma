// The burrow folk's counters on the town square: Barnaby's general store, Granny Thistle's herbs,
// Rocco's "storage" and Warden Brask's supply post (their burrows down the mine stay as they are).
// A 1/32 frame (posts, a painted counter front, side boards, a back wall with shelves) dressed in
// 1/64 voxels: a stitched, striped awning, a carved crest board with the shop's emblem standing on
// it, and each shop's own wares on the counter, the shelves and hanging from the front beam.
// Town units; front = +z, origin on the floor at the stall's middle.
// shopStall(id, seed) → { obj, lights, shadow }. STALL: the numbers the square needs (statics.js,
// townCloth.js hang the valance at the awning's front edge).
import { VoxelGrid, C, wood, beam, line, ring, mulc, mixc, sp3, group } from '../iso/kit.js';
import { fastMesh } from '../iso/mesher.js';

const F = 64; // fine voxels per TU (the frame is at 32)

export const STALL = {
  w: 2.0, d: 1.3, // footprint (TU)
  lantern: { x: 50 / F, y: 106 / F, z: 33 / F }, // the hanging lantern's flame (TU, local)
  valance: { w: 2.1, z: 0.955, y: 1.74 }, // where the cloth valance hangs (TU, local)
  keeper: { z: -0.14 }, // where the keeper stands
  win: [-0.92, 0.6, 0.1, 0.92, 1.95, 0.8], // the serving window (local TU box)
};

const STYLE = {
  trader: { cloth: [0x3a68a8, 0xe8dcc0], hem: 0x24406a, panel: 0x3a5a86, trim: 0xd8b060, board: 0x4a3020, emblem: 'scale' },
  herbalist: { cloth: [0x4a8a3c, 0xe6dcb8], hem: 0x2e5a26, panel: 0x3e6634, trim: 0xa8c860, board: 0x3a2a1a, emblem: 'leaf' },
  rocco: { cloth: [0x5e3c70, 0x3a3444], hem: 0x2a1e34, panel: 0x4a3452, trim: 0xc0b0d8, board: 0x2e2630, emblem: 'key' },
  outpost: { cloth: [0xd07a2a, 0x3c3632], hem: 0x5a3416, panel: 0x6e4c2a, trim: 0xe8b848, board: 0x3a2a1c, emblem: 'pick' },
};
/** The awning colors (sRGB) for the cloth valance. */
export const stallCloth = (id) => (STYLE[id] || STYLE.trader).cloth.map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);

// ---------------------------------------------------------------- a sparse voxel sketch
/** Voxels in a Map, drawn in stall coordinates (negative is fine), meshed in one tight grid. */
class Sparse {
  constructor() { this.m = new Map(); }
  key(x, y, z) { return (Math.round(x) + 512) + (Math.round(y) + 512) * 1024 + (Math.round(z) + 512) * 1048576; }
  set(x, y, z, c) {
    const k = this.key(x, y, z);
    if (c === null || c === undefined || c < 0) this.m.delete(k);
    else this.m.set(k, c & 0xffffff);
  }
  get(x, y, z) { return this.m.get(this.key(x, y, z)) ?? -1; }
  filled(x, y, z) { return this.m.has(this.key(x, y, z)); }
  clear(x, y, z) { this.m.delete(this.key(x, y, z)); }
  /** Mesh at `scale` TU per voxel, positioned so stall (0,0,0) is the origin. */
  mesh(scale, kind = 'toon', o = {}) {
    if (!this.m.size) return null;
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    const pts = [];
    for (const [k, c] of this.m) {
      const x = (k % 1024) - 512, y = (Math.floor(k / 1024) % 1024) - 512, z = Math.floor(k / 1048576) - 512;
      pts.push(x, y, z, c);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const g = new VoxelGrid(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1);
    for (let i = 0; i < pts.length; i += 4) g.set(pts[i] - x0, pts[i + 1] - y0, pts[i + 2] - z0, pts[i + 3]);
    return kind === 'glow'
      ? fastMesh(g, { scale, pivot: [-x0, -y0, -z0], kind: 'basic', shade: true, outline: false })
      : fastMesh(g, { scale, pivot: [-x0, -y0, -z0], kind: 'toon', ...o });
  }
}
// the grid's shape helpers only call set/clear, so they draw into the sketch as they are
for (const f of ['box', 'ellipsoid', 'rbox', 'cylinderY']) Sparse.prototype[f] = VoxelGrid.prototype[f];

const lift = (c, k) => mulc(c, k);

// ---------------------------------------------------------------- the frame (1/32)
function frame(g, st, seed) {
  const post = beam(C.woodD, 'y', seed);
  // four posts: the front pair carries the front beam, the back pair (taller) the back beam
  for (const x of [-32, 29]) { g.box(x, 0, 15, 3, 60, 3, post); g.box(x, 0, -20, 3, 74, 3, post); }
  g.box(-32, 60, 15, 64, 2, 3, beam(C.woodD, 'x', seed + 1));
  g.box(-32, 74, -20, 64, 2, 3, beam(C.woodD, 'x', seed + 2));
  for (const x of [-31, 30]) line(g, [[x + 0.5, 61.5, 16.5], [x + 0.5, 75.5, -18.5]], 0.9, C.woodD);
  // brass caps where the beams cross the posts
  for (const x of [-32, 31]) { g.set(x, 61, 18, C.brass); g.set(x, 75, -18, C.brass); }
  // the counter: a thick top (overhanging), the painted front with framed, recessed panels
  g.box(-33, 26, 9, 66, 2, 11, wood(C.woodL, { axis: 'x', across: 'z', pw: 3, seed: seed + 3 }));
  g.box(-33, 25, 19, 66, 1, 1, C.woodD);
  const pw = wood(st.panel, { axis: 'y', across: 'x', pw: 4, seed: seed + 4, knots: false, dark: 0.86 });
  g.box(-31, 0, 15, 62, 25, 3, (x, y, z) => {
    const kick = y < 2, rail = y > 21 || (y > 1 && y < 4), stile = x <= -30 || x >= 29 || Math.abs(x + 10.5) < 1 || Math.abs(x - 10.5) < 1;
    if (kick) return mulc(C.woodD, 0.8);
    if (rail || stile) return z === 17 ? lift(C.wood, (x + y) % 9 ? 1 : 0.9) : C.wood;
    if (z === 17) return -1; // the panels sit back a voxel
    const pin = y === 5 || y === 20 || Math.abs(x + 10.5) === 2 || Math.abs(x - 10.5) === 2 || x === -28 || x === 27; // a painted pinstripe
    return pin ? st.trim : pw(x, y, z);
  });
  // side boards up to the counter, capped
  const side = wood(C.wood, { axis: 'y', across: 'z', pw: 5, seed: seed + 5 });
  for (const x of [-32, 30]) { g.box(x, 0, -18, 2, 26, 33, side); g.box(x - (x < 0 ? 1 : 0), 26, -19, 3, 2, 28, wood(C.woodL, { axis: 'z', across: 'x', pw: 99, seed })); }
  // the back wall and its shelves on little brackets
  g.box(-30, 0, -20, 60, 74, 2, wood(C.woodG, { axis: 'y', across: 'x', pw: 6, seed: seed + 6 }));
  for (const y of [28, 42, 56]) {
    g.box(-29, y, -18, 58, 2, 6, wood(C.woodL, { axis: 'x', across: 'z', pw: 99, seed: seed + y }));
    g.box(-29, y + 2, -13, 58, 1, 1, C.woodD); // a lip so things don't roll off
    for (const x of [-22, 0, 21]) { g.set(x, y - 1, -18, C.woodD); g.set(x, y - 1, -17, C.woodD); g.set(x, y - 2, -18, C.woodD); }
  }
}

// ---------------------------------------------------------------- the awning (1/64)
const awnY = (z) => 125 - (z - 33) * 0.389; // its top surface over the front and back beams

function awning(g, st) {
  for (let z = -42; z <= 60; z++) {
    const y = Math.round(awnY(z));
    for (let x = -68; x <= 67; x++) {
      const sx = x + 68, stripe = Math.floor(sx / 12) % 2;
      let c = st.cloth[stripe];
      // a running stitch along each seam (flat colors otherwise: the mesher merges the runs)
      if (sx % 12 === 0 && (z & 2)) c = mulc(c, 0.72);
      else if (z > 20) c = mulc(c, 1.05); // the front sun-faded a shade
      if (x <= -67 || x >= 66 || z >= 58 || z <= -41) c = st.hem; // hemmed all round
      g.set(x, y, z, c);
      g.set(x, y - 1, z, mulc(c, 0.78));
    }
  }
  // the batten along the front edge the valance hangs from, with a brass stud at each stripe
  const yb = Math.round(awnY(59)) - 3;
  g.box(-68, yb, 57, 136, 2, 3, beam(C.woodD, 'x', 5));
  for (let x = -62; x <= 62; x += 12) g.set(x, yb + 1, 60, C.brass);
  // a rolled-up storm flap along the back edge
  for (let x = -68; x <= 67; x++) for (const [dy, dz] of [[0, 0], [1, 0], [0, -1], [1, -1], [2, -1], [1, -2]]) g.set(x, Math.round(awnY(-43)) + dy, -43 + dz, mulc(st.cloth[1], dy === 2 ? 1.08 : 0.92));
  for (const x of [-50, -10, 30]) for (let dy = -1; dy < 4; dy++) g.set(x, Math.round(awnY(-43)) + dy, -42 - (dy > 1 ? 2 : 0), C.rope);
}

// ---------------------------------------------------------------- the crest board and its emblem (1/64)
function raster() {
  const m = new Map();
  const r = {
    m,
    px(x, y, c) { if (c != null) m.set(`${Math.round(x)},${Math.round(y)}`, c); },
    disc(cx, cy, rad, c, r0 = -1) {
      for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= rad && d > r0) r.px(x, y, c);
      }
    },
    seg(x0, y0, x1, y1, w, c) {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, col = typeof c === 'function' ? c(t) : c;
        r.px(x, y, col);
        if (w > 1) r.disc(x, y, w / 2, col);
      }
    },
    rect(x0, y0, w, h, c) { for (let y = Math.round(y0); y < Math.round(y0) + h; y++) for (let x = Math.round(x0); x < Math.round(x0) + w; x++) r.px(x, y, c); },
  };
  return r;
}

/** The shop's emblem as 28×26 pixels (origin bottom-left). */
function emblem(kind) {
  const r = raster();
  if (kind === 'scale') {
    const B = 0xe0b860, D = 0x9a7430;
    r.rect(9, 0, 10, 2, D); r.rect(11, 2, 6, 1, B);
    r.rect(13, 3, 2, 17, B);
    r.disc(13.5, 22.2, 1.7, B);
    r.rect(2, 19, 24, 2, B);
    r.disc(1.6, 19.5, 1.2, B); r.disc(26.4, 19.5, 1.2, B);
    for (const cx of [4.5, 23.5]) {
      r.seg(cx, 18.4, cx - 3.6, 11, 1, D); r.seg(cx, 18.4, cx + 3.6, 11, 1, D);
      r.rect(cx - 4.5, 10, 10, 1, B); r.rect(cx - 3.5, 9, 8, 1, B); r.rect(cx - 2.5, 8, 6, 1, D);
    }
  } else if (kind === 'leaf') {
    const G = 0x5a9a3e, L = 0x9ad06a, D = 0x386a28;
    const a = 0.78, ca = Math.cos(a), sa = Math.sin(a), cx = 14.5, cy = 13.5, len = 12, wid = 6.2;
    for (let y = 0; y < 26; y++) for (let x = 0; x < 28; x++) {
      const dx = x - cx, dy = y - cy, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      if (Math.abs(u) > len) continue;
      const half = wid * Math.sqrt(1 - (u / len) ** 2) * (u > 0 ? 1 - (u / len) * 0.3 : 1);
      if (Math.abs(v) > half) continue;
      const rib = Math.abs(v) < 0.55, vein = !rib && ((((u - Math.abs(v) * 0.9) % 4) + 4) % 4) < 0.8;
      r.px(x, y, Math.abs(v) > half - 1.1 ? D : rib ? L : vein ? mixc(G, L, 0.5) : G);
    }
    r.seg(cx - ca * len, cy - sa * len, cx - ca * (len + 3.5) - 1, cy - sa * (len + 3.5), 1, 0x7a5a2a);
  } else if (kind === 'key') {
    const B = 0xe0b860, D = 0x9a7430;
    r.disc(7, 15, 6.2, B, 2.7);
    r.disc(7, 15, 1.2, D);
    r.rect(12, 14, 15, 3, B);
    r.rect(12, 12, 2, 7, D);
    r.rect(19, 9, 2, 5, B); r.rect(22, 11, 2, 3, B); r.rect(25, 10, 2, 4, B);
  } else {
    const I = 0xb4b4c0, ID = 0x6e6e7c, W = 0xa06e3a, WD = 0x6a4424;
    r.seg(5, 2, 19.5, 18.5, 2.4, (t) => (t < 0.14 ? WD : W));
    const d = [0.657, 0.751], p = [0.751, -0.657];
    for (let t = -1; t <= 1.0001; t += 0.04) {
      const w = 2.7 - Math.abs(t) * 1.7, x = 19.5 + p[0] * t * 11 - d[0] * t * t * 4, y = 18.5 + p[1] * t * 11 - d[1] * t * t * 4;
      r.disc(x, y, w / 2, I);
      r.px(x, y, I);
    }
    r.disc(19.5, 18.5, 1.6, ID);
  }
  return r.m;
}

function crest(g, st) {
  const z0 = -37, yb = 158, top = 192;
  const inside = (x, y) => {
    if (y < yb || y > top || x < -21 || x > 20) return false;
    if (y > 186) { const ry = (y - 186) / 7; return Math.abs(x + 0.5) <= 21 * Math.sqrt(Math.max(0, 1 - ry * ry)); }
    return true;
  };
  const bw = wood(st.board, { axis: 'x', across: 'y', pw: 6, seed: 3, dark: 0.75 });
  for (let y = yb; y <= top; y++) for (let x = -21; x <= 20; x++) {
    if (!inside(x, y)) continue;
    g.set(x, y, z0, bw(x, y, z0));
    g.set(x, y, z0 + 1, bw(x, y, z0 + 1));
    const edge = !inside(x - 2, y) || !inside(x + 2, y) || !inside(x, y - 2) || !inside(x, y + 2);
    if (edge) g.set(x, y, z0 + 2, mulc(st.trim, !inside(x - 2, y) || !inside(x, y + 2) ? 1.12 : 0.82));
  }
  // nails at the corners, two struts down onto the awning
  for (const [x, y] of [[-18, 161], [17, 161], [-18, 184], [17, 184]]) g.set(x, y, z0 + 2, 0xd8d8e0);
  for (const x of [-14, 13]) for (let y = Math.round(awnY(z0)); y < yb; y++) { g.set(x, y, z0, C.iron); g.set(x + 1, y, z0, C.ironL); }
  // the emblem stands proud of the board, bevelled: lit along its upper-left edges
  const m = emblem(st.emblem);
  const has = (x, y) => m.has(`${x},${y}`);
  for (const [k, c] of m) {
    const [x, y] = k.split(',').map(Number);
    const lit = !has(x - 1, y + 1) || !has(x, y + 1), dark = !has(x + 1, y - 1) || !has(x, y - 1);
    const col = lit && !dark ? mulc(c, 1.22) : dark && !lit ? mulc(c, 0.76) : c;
    const X = x - 14, Y = yb + 3 + y;
    g.set(X, Y, z0 + 2, col);
    g.set(X, Y, z0 + 3, col);
  }
}

// ---------------------------------------------------------------- wares (1/64)
const W = {
  jar(g, x, y, z, h, fill, lid = 0x9a6a3a) {
    g.cylinderY(x, z, 3.3, y, y + h, (xx, yy, zz) => (yy === y + h - 1 ? 0xd8e4ea : xx < x - 1.5 && zz > z ? mulc(fill, 1.32) : mulc(fill, (yy - y) % 3 ? 0.94 : 0.84)));
    g.cylinderY(x, z, 2.6, y + h, y + h + 2, lid);
    g.set(x, y + h + 2, z, mulc(lid, 1.25));
  },
  bottle(g, x, y, z, col, h = 7) {
    g.cylinderY(x, z, 2.3, y, y + h, (xx, yy, zz) => (xx < x - 0.8 && zz > z - 0.5 ? mulc(col, 1.35) : col));
    g.cylinderY(x, z, 1.2, y + h, y + h + 3, mulc(col, 0.9));
    g.box(x, y + h + 3, z, 1, 2, 1, 0xb88a5a);
    g.box(x - 1, y + 2, z + 2, 3, 3, 1, 0xe8dcc0); // a little paper label
  },
  sack(g, x, y, z, col, top) {
    g.ellipsoid(x, y + 6, z, 5.6, 6.6, 4.8, (xx, yy, zz) => ((xx + yy * 2) % 7 === 0 ? mulc(col, 0.86) : mulc(col, sp3(xx, yy, zz, 4, 0.12, 0.08))));
    g.cylinderY(x, z, 2.4, y + 11, y + 14, mulc(col, 0.88));
    g.cylinderY(x, z, 2.9, y + 11, y + 12, C.rope);
    if (top) g.ellipsoid(x, y + 14, z, 2.4, 1.3, 2.1, top);
  },
  crate(g, x0, y0, z0, w, h, d, base = C.wood) {
    g.box(x0, y0, z0, w, h, d, (x, y, z) => {
      const ex = x === x0 || x === x0 + w - 1, ey = y === y0 || y === y0 + h - 1, ez = z === z0 || z === z0 + d - 1;
      if ((ex && ey) || (ey && ez) || (ex && ez)) return (x + y + z) % 5 ? mulc(base, 0.7) : 0x9a9aa4; // dark edges, a nail now and then
      return (y - y0) % 4 === 0 ? mulc(base, 0.82) : mulc(base, sp3(x, y, z, 2, 0.1, 0.08));
    });
  },
  parcel(g, x0, y0, z0, w, h, d, paper = 0xc8a878) {
    const mx = x0 + (w >> 1), mz = z0 + (d >> 1);
    g.box(x0, y0, z0, w, h, d, (x, y, z) => (x === mx || z === mz ? C.rope : mulc(paper, sp3(x, y, z, 6, 0.1, 0.07))));
    g.set(mx, y0 + h, mz, C.rope); g.set(mx - 1, y0 + h, mz, C.rope); g.set(mx + 1, y0 + h, mz, C.rope);
  },
  coil(g, x, y, z, rad, col = C.rope) {
    ring(g, x, z, rad - 1.8, rad + 0.4, y, y + 3, (xx, yy, zz, a) => (Math.floor(a * 5 + yy * 1.7) % 2 ? col : mulc(col, 0.78)));
  },
  /** A coil hanging on a hook (the ring stands in the xy plane). */
  coilHung(g, x, y, z, rad, col = C.rope) {
    for (let a = 0; a < Math.PI * 2; a += 0.05) for (let k = 0; k < 3; k++) {
      const rr = rad - k * 1.1;
      g.set(x + Math.cos(a) * rr, y - rad + Math.sin(a) * rr, z + (k - 1), Math.floor(a * 6 + k) % 2 ? col : mulc(col, 0.8));
    }
    line(g, [[x, y + 2, z], [x, y - 1, z]], 0.5, C.iron);
  },
  lantern(g, gl, x, y, z) {
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) g.box(x + dx, y, z + dz, 1, 10, 1, C.iron);
    g.box(x - 3, y - 1, z - 3, 7, 1, 7, C.ironD);
    g.box(x - 3, y + 10, z - 3, 7, 1, 7, C.iron);
    g.box(x - 2, y + 11, z - 2, 5, 1, 5, C.ironL);
    g.box(x - 1, y + 12, z - 1, 3, 1, 3, C.iron);
    line(g, [[x + 0.5, y + 13, z + 0.5], [x + 0.5, y + 16, z + 0.5]], 0.5, C.ironD);
    gl.box(x - 2, y, z - 2, 5, 10, 5, (xx, yy, zz) => (Math.abs(xx - x) < 1 && Math.abs(zz - z) < 1 && yy > y + 2 && yy < y + 7 ? 0xfff2c0 : 0xffc870));
  },
  /** A pick hung head-up on its hook, the handle hanging down. */
  pick(g, x, y, z) {
    for (let t = -1; t <= 1.0001; t += 0.04) {
      const px = x + t * 9, py = y - 3 - t * t * 4, r = 1.7 - Math.abs(t) * 1.0;
      g.ellipsoid(px, py, z, r + 0.35, r + 0.35, 1.3, Math.abs(t) > 0.7 ? 0xd0d0dc : py > y - 3.5 ? 0xa0a0ac : 0x7a7a88);
    }
    g.box(x - 1, y - 6, z - 1, 3, 3, 3, 0x4a4a54); // the eye the handle goes through
    line(g, [[x, y - 6, z], [x, y - 22, z]], 0.9, (xx, yy) => (yy < y - 19 ? 0x6a4424 : (yy & 3) ? 0xa06e3a : 0x8a5a30));
  },
  pan(g, x, y, z) {
    line(g, [[x, y, z], [x, y - 8, z]], 0.8, 0x2a2a30);
    for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) {
      const d = Math.hypot(xx, yy);
      if (d > 6.2) continue;
      g.set(x + xx, y - 14 + yy, z, d > 5 ? 0x4a4a54 : 0x24242a);
      if (d > 5) g.set(x + xx, y - 14 + yy, z + 1, 0x5c5c68);
    }
  },
  bundle(g, x, y, z, col, seed = 0) {
    g.box(x - 1, y - 3, z - 1, 3, 3, 3, C.rope);
    for (let k = 0; k < 7; k++) {
      const ex = x + (k - 3) * 1.3, ey = y - 13 - ((k + seed) % 3) * 1.5, ez = z + ((k % 3) - 1) * 1.3;
      line(g, [[x, y - 3, z], [ex, ey, ez]], 0.5, mulc(col, 0.8));
      g.ellipsoid(ex, ey + 2, ez, 1.4, 2.6, 1.2, (k + seed) % 2 ? col : mulc(col, 1.18));
    }
  },
  pot(g, x, y, z, leaf, flower) {
    g.cylinderY(x, z, 3.3, y, y + 5, (xx, yy) => (yy === y + 2 ? 0x9a4a2a : 0xb8643a));
    g.cylinderY(x, z, 3.9, y + 5, y + 6, 0xc87448);
    g.cylinderY(x, z, 2.8, y + 5, y + 6, 0x3a2a1e);
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05 + 0.3, ex = x + Math.cos(a) * 3.2, ez = z + Math.sin(a) * 2.6, ey = y + 11 + (k % 3) * 1.5;
      line(g, [[x, y + 6, z], [ex, ey, ez]], 0.5, mulc(leaf, 0.8));
      g.ellipsoid(ex, ey, ez, 1.6, 0.9, 1.3, k % 2 ? leaf : mulc(leaf, 1.2));
      if (flower && k % 2) g.set(ex, ey + 1, ez, flower);
    }
  },
  glowcap(g, gl, x, y, z, s = 1) {
    g.cylinderY(x, z, 0.8 * s, y, y + 3 * s, 0xe8e0c8);
    gl.ellipsoid(x, y + 3 * s, z, 2.4 * s, 1.3 * s, 2.4 * s, (xx, yy, zz) => ((xx * 3 + zz * 5) % 7 === 0 ? 0xd8faff : 0x5ad0e0));
  },
  basket(g, x0, y0, z0, w, d, h = 4) {
    g.box(x0, y0, z0, w, h, d, (x, y, z) => {
      const wall = x === x0 || x === x0 + w - 1 || z === z0 || z === z0 + d - 1 || y === y0;
      return wall ? ((x + z + y) % 2 ? 0xb08048 : 0x8a6038) : -1;
    });
  },
  mortar(g, x, y, z) {
    ring(g, x, z, 1.8, 3.4, y + 1, y + 5, (xx, yy) => (yy === y + 4 ? 0xb4aca0 : 0x8a8078));
    g.cylinderY(x, z, 2.4, y, y + 1, 0x6e665e);
    g.cylinderY(x, z, 1.9, y + 1, y + 3, 0x5a8a3a); // something green ground up
    line(g, [[x - 1, y + 3, z], [x + 3, y + 10, z - 1]], 0.9, 0xc8c0b4);
  },
  dynamite(g, x, y, z) {
    for (const [dx, dz] of [[-1.4, 0], [1.4, 0], [0, 1.3]]) {
      g.cylinderY(x + dx, z + dz, 1.3, y, y + 10, (xx, yy) => (yy === y + 4 || yy === y + 5 ? 0xe8d8b0 : 0xc83a2a));
      line(g, [[x + dx, y + 10, z + dz], [x + dx * 1.6, y + 12, z + dz + 1], [x + dx * 2.2, y + 12.5, z + dz + 2]], 0.5, 0x2a2420);
    }
  },
  helmet(g, gl, x, y, z, col = 0xd8a830, lit = false) {
    g.ellipsoid(x, y + 2, z, 5, 5, 5, (xx, yy, zz) => (yy < y + 2 ? -1 : yy === y + 5 ? mulc(col, 0.85) : col));
    ring(g, x, z, 4.5, 6.5, y + 1, y + 2, mulc(col, 0.8));
    g.box(x - 1, y + 4, z + 4, 3, 3, 2, C.brass);
    if (lit) gl.box(x - 1, y + 4, z + 6, 3, 3, 1, 0xfff2c0); else g.box(x - 1, y + 4, z + 6, 3, 3, 1, 0xd8d0b0);
  },
  stakes(g, gl, x, y, z) {
    for (let k = 0; k < 4; k++) {
      const tx = x + (k - 1.5) * 2.2, tz = z + (k % 2);
      line(g, [[tx, y, tz], [tx + (k - 1.5) * 0.8, y + 12, tz]], 0.5, 0x8a6a4a);
      gl.ellipsoid(tx + (k - 1.5) * 0.8, y + 13, tz, 1.1, 1.6, 1.1, k % 2 ? 0x9affd8 : 0xd8ff9a);
    }
  },
  coins(g, x, y, z) {
    for (const [dx, dz, h] of [[0, 0, 5], [3, 1, 3], [-2, 2, 2]]) g.cylinderY(x + dx, z + dz, 1.6, y, y + h, (xx, yy) => ((yy - y) % 2 ? 0xf2c23a : 0xc8962a));
  },
  ledger(g, x, y, z) {
    g.box(x - 6, y, z - 4, 13, 1, 9, 0x6a3a2a);
    g.box(x - 5, y + 1, z - 4, 5, 1, 8, (xx, yy, zz) => (zz % 2 ? 0xe8dcc0 : 0xb8a888));
    g.box(x + 1, y + 1, z - 4, 5, 1, 8, (xx, yy, zz) => (zz % 2 && xx < x + 4 ? 0xe8dcc0 : 0xb8a888));
    g.box(x, y + 1, z - 4, 1, 2, 8, 0xd8ccb0);
  },
  scale(g, x, y, z) {
    g.box(x - 3, y, z - 2, 7, 1, 5, 0x9a7430);
    g.box(x, y + 1, z, 1, 10, 1, C.brass);
    g.box(x - 7, y + 11, z, 15, 1, 1, C.brass);
    for (const ex of [x - 6, x + 6]) {
      line(g, [[ex, y + 11, z], [ex, y + 6, z]], 0.4, 0x9a7430);
      g.cylinderY(ex, z, 2.8, y + 5, y + 6, C.brass);
    }
    g.ellipsoid(x - 6, y + 7, z, 1.6, 1.1, 1.6, 0xd9773f); // a lump of copper being weighed
  },
  clock(g, x, y, z) {
    g.rbox(x - 5, y, z - 3, 11, 13, 5, (xx, yy) => (yy === y ? 0x3a2418 : 0x6a3a22), 1);
    g.ellipsoid(x + 0.5, y + 13, z - 0.5, 4.5, 2.5, 2.4, 0x6a3a22);
    for (let yy = -4; yy <= 4; yy++) for (let xx = -4; xx <= 4; xx++) {
      const d = Math.hypot(xx, yy);
      if (d <= 3.4) g.set(x + xx, y + 8 + yy, z + 2, d > 2.7 ? C.brass : 0xf0e8d0);
    }
    g.set(x, y + 9, z + 3, 0x2a2420); g.set(x, y + 10, z + 3, 0x2a2420); g.set(x + 1, y + 8, z + 3, 0x2a2420); g.set(x, y + 8, z + 3, 0x2a2420);
    g.box(x - 4, y - 1, z - 2, 2, 1, 3, C.brass); g.box(x + 3, y - 1, z - 2, 2, 1, 3, C.brass);
  },
  musicBox(g, x, y, z) {
    g.box(x - 4, y, z - 3, 9, 5, 6, (xx, yy, zz) => ((xx === x - 4 || xx === x + 4) && (zz === z - 3 || zz === z + 2) ? C.brass : yy === y + 2 ? 0x8a2a2a : 0x6a1e22));
    g.box(x - 4, y + 5, z - 4, 9, 6, 1, 0x6a1e22); // the lid, open
    g.box(x - 3, y + 5, z - 2, 7, 1, 4, 0xc8a0a8); // velvet
    line(g, [[x + 5, y + 2, z], [x + 7, y + 2, z], [x + 7, y + 4, z]], 0.4, C.brass);
  },
  plush(g, x, y, z) {
    g.ellipsoid(x, y + 3.5, z, 3.4, 3.6, 2.8, 0xc89878);
    g.ellipsoid(x, y + 8.5, z, 3, 2.8, 2.6, 0xc89878);
    for (const dx of [-2.4, 2.4]) g.ellipsoid(x + dx, y + 11, z, 1.1, 1.1, 1, 0xa87858);
    g.set(x - 1, y + 9, z + 2.6, 0x2a2420); g.set(x + 1, y + 9, z + 2.6, 0x2a2420); g.set(x, y + 8, z + 2.6, 0x6a3a2a);
    g.box(x - 1, y + 3, z + 2, 3, 2, 1, 0xe8d0b8);
  },
  amber(g, gl, x, y, z) {
    gl.ellipsoid(x, y + 3, z, 3, 3.4, 2.6, (xx, yy) => (yy > y + 4 ? 0xffc860 : 0xf0a030));
    g.set(x, y + 3, z + 3, 0x3a2410); g.set(x + 1, y + 3, z + 3, 0x3a2410); g.set(x, y + 4, z + 3, 0x3a2410); // the bug inside
    g.cylinderY(x, z, 2.2, y - 1, y, C.brass);
  },
  painting(g, x, y, z) {
    for (let yy = 0; yy < 17; yy++) for (let xx = 0; xx < 22; xx++) {
      const fr = xx < 2 || xx > 19 || yy < 2 || yy > 14;
      let c;
      if (fr) c = (xx + yy) % 5 ? C.gold : 0xb08a2a;
      else {
        const d = Math.hypot(xx - 11, yy - 10);
        c = d < 3 ? 0xffe060 : d < 4.2 && (Math.round(Math.atan2(yy - 10, xx - 11) * 2.5) % 2) ? 0xf0c040 : yy < 6 ? (yy < 4 ? 0x4a8a3a : 0x6aaa4a) : mixc(0x6aa8e0, 0xb8dcf0, (yy - 6) / 9);
      }
      g.set(x - 11 + xx, y + yy, z, c);
      if (fr) g.set(x - 11 + xx, y + yy, z + 1, mulc(c, 1.1));
    }
  },
  sword(g, x, y, z, len = 24) {
    for (let yy = 0; yy < len; yy++) {
      const tip = yy < 3;
      g.set(x, y + yy, z, tip && yy < 1 ? -1 : 0xd0d4dc);
      if (!tip || yy > 1) g.set(x + 1, y + yy, z, yy % 5 ? 0x9aa0ac : 0xb8bcc8);
    }
    g.box(x - 3, y + len, z, 8, 1, 1, C.brass);
    g.box(x, y + len + 1, z, 2, 5, 1, 0x5a3424);
    g.box(x, y + len + 6, z, 2, 2, 1, C.brass);
  },
  fossil(g, x, y, z) {
    for (let a = 0; a < 14; a += 0.05) {
      const rr = 0.45 * a;
      g.set(x + Math.cos(a) * rr, y + 6 + Math.sin(a) * rr, z, Math.floor(a * 3) % 2 ? 0xd8c8a8 : 0xa89878);
      g.set(x + Math.cos(a) * rr, y + 6 + Math.sin(a) * rr, z - 1, 0xb8a888);
    }
  },
  tin(g, x, y, z, col, h = 5) {
    g.cylinderY(x, z, 2.2, y, y + h, (xx, yy) => (yy === y + 1 || yy === y + 2 ? 0xe8dcc0 : col));
    g.cylinderY(x, z, 2.2, y + h, y + h + 1, 0x9a9aa4);
  },
  gloves(g, x, y, z) {
    for (const dx of [-3, 3]) {
      g.box(x + dx - 2, y - 9, z, 4, 6, 2, 0xe8c030);
      for (let f = 0; f < 4; f++) g.box(x + dx - 2 + f, y - 12 - (f === 1 || f === 2 ? 1 : 0), z, 1, 3, 2, f % 2 ? 0xe8c030 : 0xd0a828);
      g.box(x + dx - 2, y - 3, z, 4, 1, 2, 0xc8a020);
    }
    line(g, [[x - 3, y - 3, z], [x, y, z], [x + 3, y - 3, z]], 0.4, C.rope);
  },
  /** A timber leaning on the stall's side: its foot out at x + h·tilt, its top against x. */
  beamLean(g, x, z, h, tilt) {
    for (let y = 0; y < h; y++) { const bx = Math.round(x + (h - y) * tilt); g.box(bx, y, z, 4, 1, 4, (xx, yy, zz) => (yy % 9 === 0 && xx === bx ? 0x4a3020 : mulc(0x9a6a3a, sp3(xx, yy, zz, 3, 0.15, 0.1)))); }
  },
  hook(g, x, y, z) { g.set(x, y, z, C.ironD); g.set(x, y - 1, z, C.ironD); g.set(x + 1, y - 2, z, C.ironD); },
};

// the shelves' tops and the counter top, in fine voxels
const SHELF = [60, 88, 116], COUNTER = 56, SZ = -31, CZ = 29, HANG = 119, HZ = 33;

/** Each shop's wares: counter, shelves, the front beam (and a few things propped outside). */
const WARES = {
  trader(g, gl) {
    // (the middle of the counter stays low: the keeper's face reads over it)
    W.scale(g, -48, COUNTER, CZ);
    W.jar(g, -34, COUNTER, CZ, 8, 0xd84a6a, 0xd8b060); W.jar(g, -26, COUNTER, CZ + 1, 9, 0x6ab04a); W.jar(g, -18, COUNTER, CZ, 7, 0xe8c040, 0xd8b060);
    W.ledger(g, 0, COUNTER, CZ);
    W.coins(g, 13, COUNTER, CZ);
    W.parcel(g, 20, COUNTER, CZ - 3, 9, 5, 7); W.parcel(g, 21, COUNTER + 5, CZ - 2, 7, 4, 5, 0xd8b890);
    W.sack(g, 42, COUNTER, CZ - 2, 0xc8b088, 0xf4f0e8);
    // shelves: jars of this and that, tins, sacks below
    [0xd84a6a, 0x6ab04a, 0xe8c040, 0x8a5ad0, 0xe07a3a, 0x5ab0d0, 0xc8a070, 0xd84a6a].forEach((c, i) => W.jar(g, -50 + i * 14 + (i > 3 ? 4 : 0), SHELF[1], SZ, 7 + (i % 3), c, i % 2 ? 0xd8b060 : 0x9a6a3a));
    [0x3a6aa8, 0xa83a3a, 0x3a8a5a, 0xc8a050, 0x6a4a8a, 0x3a6aa8, 0xa83a3a].forEach((c, i) => W.tin(g, -48 + i * 16, SHELF[2], SZ, c, 4 + (i % 2) * 2));
    [-46, -32, 30, 44].forEach((x, i) => W.sack(g, x, SHELF[0], SZ, i % 2 ? 0xb89a6a : 0xc8b088, i % 2 ? 0xe8c070 : 0xf4f0e8));
    W.crate(g, -14, SHELF[0], SZ - 5, 10, 8, 10);
    W.crate(g, 6, SHELF[0], SZ - 5, 10, 8, 10, C.woodL);
    // the front beam: rope, a pick, a pan, glow stakes
    W.coilHung(g, -50, HANG, HZ, 6); W.pick(g, -30, HANG, HZ); W.pan(g, -8, HANG, HZ); W.pick(g, 12, HANG, HZ); W.coilHung(g, 30, HANG, HZ, 5, 0xa88858);
  },
  herbalist(g, gl) {
    W.mortar(g, -48, COUNTER, CZ);
    W.pot(g, -34, COUNTER, CZ, 0x4a9a3a, 0xe060a0); W.pot(g, -22, COUNTER, CZ + 1, 0x6aaa4a); W.pot(g, 40, COUNTER, CZ, 0x3a8a4a, 0xf0e070);
    W.basket(g, -8, COUNTER, CZ - 6, 16, 12);
    for (let k = 0; k < 6; k++) W.glowcap(g, gl, -5 + (k % 3) * 5, COUNTER + 3, CZ - 3 + Math.floor(k / 3) * 5, 0.9 + (k % 2) * 0.2);
    [0x7aba4a, 0xa060c0, 0xd8a040].forEach((c, i) => W.bottle(g, 16 + i * 6, COUNTER, CZ + (i % 2), c));
    // shelves: tinctures, pots, jars of dried things
    [0x7aba4a, 0xa060c0, 0xd8a040, 0x60a0d0, 0xc84a4a, 0x7aba4a, 0xe0c060, 0xa060c0, 0x60a0d0].forEach((c, i) => W.bottle(g, -52 + i * 13, SHELF[2], SZ, c, 6 + (i % 3)));
    [-44, -28, 30, 46].forEach((x, i) => W.pot(g, x, SHELF[1], SZ, [0x4a9a3a, 0x6aaa4a, 0x3a8a4a, 0x5a9a5a][i], i % 2 ? 0xe060a0 : 0));
    [0x8a6a3a, 0x6a8a3a, 0xa86a5a, 0x5a7a4a].forEach((c, i) => W.jar(g, -46 + i * 30 + (i > 1 ? 6 : 0), SHELF[0], SZ, 8, c));
    // the front beam: drying herbs
    [0x6aaa4a, 0xa070c8, 0x8a7a3a, 0x4a8a3a, 0xb08a4a].forEach((c, i) => W.bundle(g, -52 + i * 18, HANG, HZ, c, i));
  },
  rocco(g, gl) {
    // the tarp: lumpy, over who knows what, its edge hanging off the counter
    const tarp = (xx, yy, zz) => ((xx + yy) % 6 < 2 ? 0x2e5a5a : 0x3a6a6a);
    g.ellipsoid(-42, COUNTER + 1, CZ - 1, 10, 7, 8, tarp); g.ellipsoid(-30, COUNTER + 1, CZ + 1, 7, 9, 7, tarp); g.ellipsoid(-48, COUNTER + 1, CZ + 3, 6, 5, 6, tarp);
    for (let x = -54; x <= -24; x++) for (let y = COUNTER - 1 - ((x * 7) % 5 + 5) % 4; y < COUNTER + 2; y++) g.set(x, y, 40, tarp(x, y, 40));
    W.clock(g, -14, COUNTER, CZ);
    W.amber(g, gl, 0, COUNTER, CZ + 1);
    W.musicBox(g, 16, COUNTER, CZ);
    W.plush(g, 32, COUNTER, CZ);
    W.coins(g, 46, COUNTER, CZ + 2);
    // shelves: shinies, a fossil, a crate with a question about it
    W.fossil(g, -46, SHELF[1], SZ); W.fossil(g, 42, SHELF[0], SZ + 1);
    [0xb07ae0, 0x6ac8ff, 0x7bf08a, 0xff9ad0].forEach((c, i) => gl.ellipsoid(-30 + i * 22 + (i > 1 ? 14 : 0), SHELF[1] + 2.5, SZ, 1.8, 2.6, 1.8, c));
    W.crate(g, -52, SHELF[0], SZ - 5, 12, 9, 10, 0x6a5a48); W.crate(g, -38, SHELF[0], SZ - 4, 9, 7, 9, 0x7a6a50); W.crate(g, 24, SHELF[0], SZ - 5, 12, 9, 10, 0x6a5a48);
    [0x8a6a4a, 0x5a6a8a, 0x8a4a4a, 0x6a8a5a].forEach((c, i) => W.tin(g, -48 + i * 12 + (i > 1 ? 50 : 0), SHELF[2], SZ, c, 6));
    // the back wall above the top shelf: the famous painting of the SUN, and a blade on pegs
    W.painting(g, 0, SHELF[2] + 8, -36);
    W.sword(g, -30, SHELF[2] + 4, -36, 18); W.sword(g, 18, SHELF[2] + 6, -36, 16);
    // the front beam: keys on strings
    [-50, -34, -18, 10, 26].forEach((x, i) => {
      line(g, [[x, HANG, HZ], [x, HANG - 5 - (i % 2) * 2, HZ]], 0.4, 0x7a6a5a);
      const y = HANG - 6 - (i % 2) * 2;
      for (let a = 0; a < 6.28; a += 0.4) g.set(x + Math.round(Math.cos(a) * 1.6), y - 1 + Math.round(Math.sin(a) * 1.6), HZ, C.brass);
      g.box(x, y - 9, HZ, 1, 6, 1, C.brass);
      g.box(x + 1, y - 9, HZ, 1, 1, 1, C.brass); g.box(x + 1, y - 7, HZ, 2, 1, 1, C.brass);
    });
  },
  outpost(g, gl) {
    W.crate(g, -54, COUNTER, CZ - 6, 14, 6, 12, 0x9a6a3a);
    for (let k = 0; k < 4; k++) W.dynamite(g, -50 + k * 3.4, COUNTER + 2, CZ - 2 + (k % 2) * 3);
    W.helmet(g, gl, -30, COUNTER, CZ, 0xd8a830, true);
    W.helmet(g, gl, -17, COUNTER, CZ + 1, 0xc86a30);
    W.coil(g, 0, COUNTER, CZ, 5, 0x3a3430); // fuse
    W.stakes(g, gl, 18, COUNTER, CZ);
    W.tin(g, 32, COUNTER, CZ, 0x8a8a94, 6);
    W.ledger(g, 46, COUNTER, CZ);
    // shelves: rations, flasks, more charges
    [0xc8a050, 0xa83a3a, 0xc8a050, 0x5a6a4a, 0xc8a050, 0xa83a3a].forEach((c, i) => W.parcel(g, -54 + i * 18 + (i > 2 ? 4 : 0), SHELF[2], SZ - 3, 8, 4, 6, c));
    [0x8a8a94, 0x6a7a5a, 0x8a8a94, 0x6a7a5a, 0x8a8a94].forEach((c, i) => W.tin(g, -48 + i * 10 + (i > 2 ? 52 : 0), SHELF[1], SZ, c, 7));
    W.crate(g, -50, SHELF[0], SZ - 5, 12, 8, 10, 0x9a6a3a); W.helmet(g, gl, 40, SHELF[0], SZ, 0xd8a830); W.coil(g, 24, SHELF[0], SZ, 5);
    // the front beam: a pick, rope, rubber gloves; and support beams leaning on the side
    W.pick(g, -46, HANG, HZ); W.coilHung(g, -24, HANG, HZ, 6); W.gloves(g, -2, HANG, HZ); W.pick(g, 18, HANG, HZ);
    W.beamLean(g, 64, -22, 62, 0.12); W.beamLean(g, 64, -12, 58, 0.18); W.beamLean(g, 64, -2, 54, 0.1);
  },
};

/** A burrow folk's stall (see the top of the file). */
export function shopStall(id, seed = 1) {
  const st = STYLE[id] || STYLE.trader;
  // (the awning, the crest and the wares mesh apart: tight grids instead of one tall one)
  const fr = new Sparse(), top = new Sparse(), sign = new Sparse(), fine = new Sparse(), glow = new Sparse();
  frame(fr, st, seed);
  awning(top, st);
  crest(sign, st);
  (WARES[id] || WARES.trader)(fine, glow);
  // the lantern by the front beam's corner, and its hook
  W.hook(fine, STALL.lantern.x * F, HANG, HZ);
  W.lantern(fine, glow, Math.round(STALL.lantern.x * F), 100, HZ);
  // (no corner AO on the stepped awning: every step would split its faces into single voxels)
  const obj = group(fr.mesh(1 / 32), top.mesh(1 / F, 'toon', { ao: false }), sign.mesh(1 / F), fine.mesh(1 / F), glow.mesh(1 / F, 'glow'));
  return { obj, lights: [], shadow: { rx: 1.15, rz: 0.78, k: 0.62 } };
}

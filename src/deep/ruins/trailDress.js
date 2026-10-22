// The old trails, dressed at play time: signposts with hand-painted arrows at every place's way
// out (boards turned along each trail toward its far end, and one pointing home into the place),
// milestones halfway along the long ones, iron rails on the cart tracks, old ore carts (some
// tipped over), tools the miners left behind (a snapped pick at a cave-in, a shovel, a bucket, a
// crate, a barrel, a lamp), and hand ropes strung along every plank bridge over a chasm.
// Everything is deterministic from the plan; models build near the mole and go when far.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { VOX, M } from '../materials.js';
import { OPAQUE } from '../Mesher.js';
import { h3 } from '../noise.js';
import { trailCollapse, TRAIL_W } from '../gen/trails.js';
import * as MD from './models.js';

const R_BUILD = 20, R_DROP = 28;
const GEAR = ['pick', 'shovel', 'bucket', 'crate', 'barrel', 'lamp'];
const CB = 5; // log2(32)

/** Short sign names (two lines when long). */
function signText(name) {
  const n = name.replace(/^The /, '');
  if (n.length <= 11) return n;
  const sp = n.indexOf(' ', Math.floor(n.length / 2) - 3);
  const at = sp > 0 ? sp : n.lastIndexOf(' ');
  return at > 0 ? n.slice(0, at) + '\n' + n.slice(at + 1) : n;
}

export class TrailDress {
  constructor(R) {
    this.R = R;
    this.w = R.w;
    this.plan = R.plan;
    this.items = [];
    this.signs = [];
    this.bridges = [];
    try { this.lay(); } catch (e) { console.warn('trail dressing', e); }
  }

  /** The name of the place nearest a trail end. */
  placeName(p) {
    const P = this.plan;
    let best = null, bd = 9;
    for (const L of P.lifts || []) { const d = Math.hypot(L.x - p.x, L.y - p.y, L.z - p.z); if (d < bd) { bd = d; best = L.id === 'L0' ? 'Mine Entrance' : L.name + (L.id[0] === 'L' ? ' Lift' : ''); } }
    for (const b of P.burrows || []) { const d = Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z); if (d < bd) { bd = d; best = b.name; } }
    if (P.town) { const d = Math.hypot(P.town.x - p.x, P.town.y - p.y, P.town.z - p.z); if (d < bd + 4) { bd = d; best = 'Deep Town'; } }
    return best || 'Old Workings';
  }

  lay() {
    const P = this.plan;
    const exits = [];
    const exitAt = (p, out) => {
      for (const e of exits) if (Math.hypot(e.p.x - p.x, e.p.y - p.y, e.p.z - p.z) < 1.4) return e;
      const e = { p: { ...p }, out, boards: [] };
      exits.push(e);
      return e;
    };
    for (const T of P.trails || []) {
      const segs = P.features.filter((f) => f.kind === 'trail' && f.trail === T.id);
      if (segs.length < 2) continue;
      const A = T.pts[0], B = T.pts[T.pts.length - 1];
      const nameA = this.placeName(A), nameB = this.placeName(B);
      const dir = (f) => { const dx = f.b.x - f.a.x, dz = f.b.z - f.a.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
      const len = (f) => Math.hypot(f.b.x - f.a.x, f.b.z - f.a.z);
      // the way out of A: at the end of its door segment, boards along the trail and back in
      const f0 = segs[0], f1 = segs.find((f, i) => i > 0 && !f.ladder) || segs[1];
      const eA = exitAt(f0.b, dir(f0));
      eA.boards.push({ text: nameB, d: dir(f1), far: true });
      eA.home = eA.home || { text: nameA, d: dir(f0).map((v) => -v) };
      // and into B
      const fl = segs[segs.length - 1], fp = [...segs].reverse().find((f, i) => i > 0 && !f.ladder) || segs[segs.length - 2];
      const eB = exitAt(fl.a, dir(fl).map((v) => -v));
      eB.boards.push({ text: nameA, d: dir(fp).map((v) => -v), far: true });
      eB.home = eB.home || { text: nameB, d: dir(fl) };
      // a milestone halfway along a long trail
      const total = segs.reduce((n, f) => n + (f.ladder ? 0 : len(f)), 0);
      if (total > 28) {
        const mid = segs.filter((f) => !f.ladder && len(f) > 3)[Math.floor(segs.length / 2) - 1];
        if (mid && !trailCollapse(mid)) {
          const d = dir(mid), s = len(mid) * 0.5;
          this.signs.push({ kind: 'sign', seg: mid, s, side: 1, boards: [{ text: nameB, d }, { text: nameA, d: d.map((v) => -v) }] });
        }
      }
      // along the way: rails, carts, lost tools
      segs.forEach((f, i) => {
        if (f.ladder) return;
        const L = len(f), col = trailCollapse(f), door = i === 0 || i === segs.length - 1;
        const clear = (s) => !col || Math.abs(s - col.s) > col.hl + 0.9;
        if (f.rails && !door && L > 0.5) this.items.push({ kind: 'rails', seg: f, s: L / 2 });
        if (f.rails && !door && L > 3.5 && h3(f.seed, 11, 2, 90) < 0.45) {
          const s = L * (0.25 + h3(f.seed, 12, 2, 91) * 0.5);
          if (clear(s)) this.items.push({ kind: 'cart', seg: f, s, tipped: h3(f.seed, 13, 2, 92) < 0.3, side: 0 });
        }
        if (!door && L > 2.5 && h3(f.seed, 14, 2, 93) < 0.55) {
          const s = L * (0.15 + h3(f.seed, 15, 2, 94) * 0.7);
          if (clear(s)) this.items.push({ kind: 'gear', seg: f, s, side: h3(f.seed, 16, 2, 95) < 0.5 ? -1 : 1, g: GEAR[(h3(f.seed, 17, 2, 96) * GEAR.length) | 0] });
        }
        if (col) {
          // whoever was digging this cave-in out gave up and left their tools
          this.items.push({ kind: 'gear', seg: f, s: Math.max(0.3, col.s - col.hl - 0.55), side: 1, g: h3(f.seed, 18, 2, 97) < 0.5 ? 'pick' : 'shovel' });
          if (h3(f.seed, 19, 2, 98) < 0.6) this.items.push({ kind: 'gear', seg: f, s: Math.min(L - 0.3, col.s + col.hl + 0.6), side: -1, g: 'bucket' });
        }
        if (!door && L > 1) this.bridges.push({ seg: f, scanned: false, ropes: null });
      });
    }
    for (const e of exits) {
      const seen = new Set([e.home?.text]);
      const boards = e.boards.filter((b) => !seen.has(b.text) && seen.add(b.text)).slice(0, 3);
      if (e.home) boards.push(e.home);
      // stand it against the wall to the right of the way out, just inside the mouth (past it the
      // way may drop down a ladder shaft)
      const seg = { a: e.p, b: { x: e.p.x + e.out[0], y: e.p.y, z: e.p.z + e.out[1] } };
      this.signs.push({ kind: 'sign', seg, s: -0.7, side: 1, boards });
    }
    this.items.push(...this.signs);
  }

  // ------------------------------------------------------------ world queries
  real(x, y, z) { const ch = this.w.chunk(Math.floor(x * VOX) >> CB, Math.floor(y * VOX) >> CB, Math.floor(z * VOX) >> CB); return !!(ch && ch.vox && !ch.pending); }
  solid(x, y, z) { return OPAQUE[this.w.voxelAt(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX))] === 1; }
  /** The floor surface under (x, z) near height y (metres), or null if not loaded / none. */
  floorAt(x, y, z) {
    if (!this.real(x, y, z) || !this.real(x, y - 0.6, z)) return null;
    const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
    let vy = Math.floor((y + 0.45) * VOX);
    for (let k = 0; k < 16; k++, vy--) {
      if (OPAQUE[this.w.voxelAt(vx, vy, vz)] === 1 && OPAQUE[this.w.voxelAt(vx, vy + 1, vz)] !== 1) return (vy + 1) / VOX;
    }
    return null;
  }
  segPoint(f, s, side, out = {}) {
    const dx = f.b.x - f.a.x, dz = f.b.z - f.a.z, L = Math.hypot(dx, dz) || 1, t = s / L; // may run past the ends
    const ux = dx / L, uz = dz / L, off = side * ((TRAIL_W / 2) - 0.32);
    out.x = f.a.x + dx * t - uz * off; out.z = f.a.z + dz * t + ux * off; out.y = f.a.y + (f.b.y - f.a.y) * t;
    out.ux = ux; out.uz = uz;
    return out;
  }

  // ------------------------------------------------------------ build
  build(it) {
    const R = this.R, mat = R.mat;
    let p = this.segPoint(it.seg, it.s, it.side || 0);
    let fy = this.floorAt(p.x, p.y, p.z);
    if (fy === null && it.kind !== 'rails' && it.kind !== 'cart') {
      // no floor right there (a shaft, a chasm): try a little to either side and back
      for (const [ds, sd] of [[-0.5, 1], [0, -1], [-0.5, -1], [0.5, 1], [-1, 1], [0.5, -1]]) {
        if (!this.real(p.x, p.y, p.z)) break;
        const q = this.segPoint(it.seg, it.s + ds, (it.side || 1) * sd);
        const f = this.floorAt(q.x, q.y, q.z);
        if (f !== null) { p = q; fy = f; it.s += ds; it.side = (it.side || 1) * sd; break; }
      }
    }
    if (fy === null) return false;
    const g = new THREE.Group();
    g.position.set(p.x, fy, p.z);
    const geos = [];
    const add = (geo, parent = g, m = mat) => { const mesh = new THREE.Mesh(geo, m); mesh.layers.enable(LAYER_OUTLINE); parent.add(mesh); geos.push(geo); return mesh; };
    const yawAlong = Math.atan2(-p.uz, p.ux); // model +x along the trail
    if (it.kind === 'sign') {
      add(MD.signPost());
      it.boards.forEach((b, i) => {
        const m = add(MD.signBoard(signText(b.text), i % 2 ? 0xa8804a : null));
        m.position.y = 1.08 - i * 0.2;
        m.rotation.y = Math.atan2(-b.d[1], b.d[0]) + (h3(i, it.seg.a.x * 10 | 0, 3, 5) - 0.5) * 0.12;
        m.rotation.z = (h3(i, 2, it.seg.a.z * 10 | 0, 6) - 0.5) * 0.08; // nailed on a bit crooked
      });
      it.pos = new THREE.Vector3(p.x, fy + 0.95, p.z);
      it.label = 'Read the signpost';
    } else if (it.kind === 'cart') {
      const c = add(MD.cart(it.tipped, it.seg.seed | 0));
      g.rotation.y = yawAlong;
      if (it.tipped) { g.position.x += -p.uz * 0.32; g.position.z += p.ux * 0.32; c.rotation.y = 0.3; }
      else g.position.y += 1 / VOX + 3 / 32; // on the rails, on the sleepers
    } else if (it.kind === 'gear') {
      add(MD.gear(it.g, it.seg.seed | 0));
      g.rotation.y = yawAlong + (h3(it.seg.seed, it.s * 10 | 0, 1, 7) - 0.5) * 1.2;
    } else if (it.kind === 'rails') {
      // from end to end of the segment, tilted to its slope, resting on the sleepers
      const f = it.seg, L = Math.hypot(f.b.x - f.a.x, f.b.z - f.a.z);
      const a = this.segPoint(f, 0, 0), fa = this.floorAt(a.x, a.y, a.z);
      if (fa === null) return false;
      g.position.set(a.x, fa + 1 / VOX, a.z);
      const m = add(MD.rails(L + 0.3));
      m.position.x = -0.15;
      g.rotation.order = 'YXZ';
      g.rotation.y = yawAlong;
      g.rotation.z = Math.atan2(f.b.y - f.a.y, L);
    }
    R.root.add(g);
    it.obj = g;
    it.geos = geos;
    return true;
  }
  drop(it) {
    if (!it.obj) return;
    this.R.root.remove(it.obj);
    for (const g of it.geos) g.dispose();
    it.obj = null;
    it.geos = null;
  }

  /** Plank decks on a segment (runs of BOARDS with nothing under them) get hand ropes. */
  scanBridge(br) {
    const f = br.seg, L = Math.hypot(f.b.x - f.a.x, f.b.z - f.a.z);
    const runs = [];
    let start = -1;
    const p = {};
    for (let s = 0; s <= L; s += 0.125) {
      this.segPoint(f, s, 0, p);
      if (!this.real(p.x, p.y, p.z)) return false;
      const vx = Math.floor(p.x * VOX), vy = Math.floor((p.y - 0.5 / VOX) * VOX), vz = Math.floor(p.z * VOX);
      const deck = [M.BOARDS, M.TIMBER].includes(this.w.voxelAt(vx, vy, vz)) && OPAQUE[this.w.voxelAt(vx, vy - 3, vz)] !== 1;
      if (deck && start < 0) start = s;
      if ((!deck || s + 0.125 > L) && start >= 0) { if (s - start > 0.7) runs.push([start, s]); start = -1; }
    }
    br.runs = runs;
    return true;
  }
  buildBridge(br) {
    const R = this.R, g = new THREE.Group(), geos = [];
    const f = br.seg;
    for (const [s0, s1] of br.runs) for (const side of [-1, 1]) {
      const a = this.segPoint(f, s0 - 0.1, side), b = this.segPoint(f, s1 + 0.1, side);
      a.x += -a.uz * side * 0.12; a.z += a.ux * side * 0.12; b.x += -b.uz * side * 0.12; b.z += b.ux * side * 0.12;
      for (const q of [a, b]) {
        const post = new THREE.BoxGeometry(0.07, 0.8, 0.07);
        post.translate(q.x, q.y + 0.32, q.z);
        geos.push(MD.colorize(post, 0x5e3a1e));
      }
      const span = Math.hypot(b.x - a.x, b.z - a.z), sag = Math.min(0.25, span * 0.05);
      for (const [hy, sg] of [[0.66, sag], [0.36, sag * 0.8]]) for (const r of MD.sagRope(b.x - a.x, b.y - a.y, b.z - a.z, sg, Math.max(6, Math.round(span * 3)))) { r.translate(a.x, a.y + hy, a.z); geos.push(r); }
      // hangers from the hand rope down to the deck
      const n = Math.floor(span / 0.5);
      for (let k = 1; k < n; k++) {
        const t = k / n, y = a.y + (b.y - a.y) * t, top = 0.66 - sag * 4 * t * (1 - t);
        const h = new THREE.BoxGeometry(0.02, top, 0.02);
        h.translate(a.x + (b.x - a.x) * t, y + top / 2, a.z + (b.z - a.z) * t);
        geos.push(MD.colorize(h, 0x96784a));
      }
    }
    if (!geos.length) return;
    const merged = mergeGeometries(geos);
    for (const geo of geos) geo.dispose();
    const m = new THREE.Mesh(merged, R.mat);
    m.layers.enable(LAYER_OUTLINE);
    g.add(m);
    R.root.add(g);
    br.obj = g;
    br.geos = [merged];
  }

  // ------------------------------------------------------------ frame
  update(dt, eye) {
    let budget = 2;
    for (const it of this.items) {
      const p = it.seg ? this.segPoint(it.seg, it.s, 0, this._p || (this._p = {})) : null;
      if (!p) continue;
      const d = Math.hypot(p.x - eye.x, (p.y - eye.y) * 1.4, p.z - eye.z);
      if (!it.obj && d < R_BUILD && budget > 0 && !(it.failT > 0)) { budget--; if (!this.build(it)) it.failT = 0.5; }
      else if (it.obj && d > R_DROP) this.drop(it);
      if (it.failT > 0) it.failT -= dt;
    }
    for (const br of this.bridges) {
      const f = br.seg, mx = (f.a.x + f.b.x) / 2, my = (f.a.y + f.b.y) / 2, mz = (f.a.z + f.b.z) / 2;
      const d = Math.hypot(mx - eye.x, (my - eye.y) * 1.4, mz - eye.z) - Math.hypot(f.b.x - f.a.x, f.b.z - f.a.z) / 2;
      if (d < 14 && !br.runs && budget > 0) { budget--; if (this.scanBridge(br) && br.runs.length) this.buildBridge(br); }
      else if (d > R_DROP && br.runs) { if (br.obj) { this.R.root.remove(br.obj); for (const g of br.geos) g.dispose(); br.obj = null; } br.runs = null; }
    }
  }

  /** Signposts are readable: E shows what they say. */
  pick(eye, dir, reach) {
    let best = null, bt = reach;
    for (const it of this.signs) {
      if (!it.obj || !it.pos) continue;
      const ox = it.pos.x - eye.x, oy = it.pos.y - eye.y, oz = it.pos.z - eye.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > bt + 0.3) continue;
      const ex = ox - dir.x * t, ey = oy - dir.y * t, ez = oz - dir.z * t;
      if (ex * ex + ey * ey * 0.4 + ez * ez < 0.3 * 0.3) { bt = t; best = it; }
    }
    if (!best) return null;
    return { t: bt, label: best.label, use: () => [{ say: `The old sign reads: ${best.boards.map((b) => `<b>${b.text}</b>`).join(' · ')}`, key: 'sign', tone: 'good', cd: 0.5 }] };
  }

  dispose() {
    for (const it of this.items) this.drop(it);
    for (const br of this.bridges) if (br.obj) { this.R.root.remove(br.obj); for (const g of br.geos) g.dispose(); }
  }
}

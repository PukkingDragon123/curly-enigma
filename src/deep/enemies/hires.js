// Creatures up close in "super high resolution" (wave 12): every creature model built under a skin
// style (./vox.js HI.style, set by Enemies.geo from the model key) keeps its source voxels, and a
// creature near the eye swaps each of its parts' geometry for a near copy built in a worker
// (./hiWorker.js → ./hiBuild.js: refined to ~1/96 m, with scales, cracked stone, fur, chitin…).
// Far creatures keep the normal model (coarse far, fine near), so the cost is only paid on the few
// in arm's reach; phones get a coarser near copy, a shorter reach and fewer of them. Models without a
// skin style (the kaiju: enemies/kaiju.js) never get one.
//
// The swap is purely visual: animation code that sets mesh.geometry to another shared model (eyes,
// frames) is followed (the near copy of that model is put back on the next frame), and the near
// copy carries the model's userData (voxel lists for bursts and picking).
//
// Wave 16: three levels of detail round the base model (refined 4× on desktops, 2× on phones):
//   near  the 1/136 m copy above, the closest few in arm's reach
//   mid   a worker-built copy at ~1/96 m with the same skin detail (fur, scales, chitin, cracked
//         stone), for the next few in good view on desktops, within a triangle budget (not on phones)
//   far   past ~11 m (7 m on phones) a coarser copy (~1/48 m, 1/32 on phones), built here from the
//         coarse voxels the base model keeps, so a swarm across a cavern costs a quarter
//
// Wave 19: the tiers go by how big a creature looks, not how far it is (voxRes.js creatureLodDist:
// distance / K, its scale in deep/enemies/sizes.js), so a 4 cm beetle wears its near copy only at
// your paws and its far copy a couple of metres off; the near slots go to what fills the view.
//
// API (Enemies): new HiRes(mgr) · update() (once a frame, after the creatures moved) · info() ·
// dispose(). ?res12=0 turns it off (A/B shots).
//
// The worker is inlined (the single-file build has no separate files to load it from). Where a
// page can't run workers (blocked, a worker that errors or stops answering) the near copies are
// built on the main thread instead: one at a time, a few frames apart, at most LOCAL_CELLS fine
// cells each (a little coarser, so no frame stalls).
import * as THREE from 'three';
import { HI, VB } from './vox.js';
import { RES12, creatureLodDist } from '../../gfx/voxRes.js';
import { buildHi } from './hiBuild.js';
import HiWorker from './hiWorker.js?worker&inline';
import { PHONE } from '../../core/platform.js';
import { scaleOfKey } from './sizes.js';

/** A job the worker hasn't answered in this long: the worker is taken as gone (ms). */
const WORKER_WAIT = 20000;
/** Main-thread near copies: fine cells per copy, and the gap between two (ms). */
const LOCAL_CELLS = 0.9e6;
const LOCAL_GAP = 350;

const OFF = !RES12;
/** Mid copies even where the base model is as fine: they still add the skin (fur, scales, cracks). */
const SKIN_MID = true;

/** Skin style by model key (the part before the first '|'). Unlisted keys get no near copy. */
const STYLE = {
  raptor: 'scale', tameraptor: 'scale', tyrant: 'scale', shellback: 'scale', ptero: 'scale', drake: 'scale', wyrm: 'scale', kobold: 'scale', fish: 'scale',
  cgolem: 'stone', golem: 'stone', mimic: 'stone', troll_rock: 'stone', kobold_rock: 'stone', tortoise: 'stone', bones: 'stone',
  troll: 'hide', imp: 'hide', egg: 'hide', nest: 'hide',
  bunny: 'fur', bat: 'fur', elk: 'fur', molebear: 'fur',
  spider: 'chitin', beetle: 'chitin', crab: 'chitin', shrimp: 'chitin',
  slime: 'smooth', wisp: 'smooth', voidwisp: 'smooth', wraith: 'smooth', puffer: 'smooth', worm: 'smooth', slug: 'smooth',
};
export function styleFor(key) {
  const k = String(key).split('|')[0].replace(/[^a-z_]/g, '');
  const st = STYLE[k] || null;
  // (wave 19, hand-drawn first) a creature scaled down (sizes.js) gets its finer voxels in flat
  // colour, as drawn: no scale rows, fur strands or cracks jittered over a body a few cm long
  return st && scaleOfKey(key) < 1 ? 'smooth' : st;
}
/** Run build() with the skin style of a model key in effect (nested builds restore it). */
export function withStyle(key, build) {
  const prev = HI.style;
  HI.style = OFF ? null : styleFor(key) || null;
  try { return build(); } finally { HI.style = prev; }
}

const _v = new THREE.Vector3();
/** Far copies built on this thread: at most one a frame, and none once a frame has spent this long (ms). */
const FAR_BUDGET = 3;

export class HiRes {
  constructor(mgr) {
    this.mgr = mgr;
    this.hi = new Map(); // base geometry → { near, mid, far } (null while building, false: none)
    this.jobs = new Map(); // id → { geo, tier }
    this.queue = [];
    this.busy = 0;
    this.id = 0;
    this.on = new Set(); // creatures wearing a copy
    this.stats = { built: 0, ms: 0, tris: 0, failed: 0, far: 0, mid: 0 };
    this.worker = null;
    this.local = false; // building on the main thread (no worker)
    if (!OFF) {
      try {
        this.worker = new HiWorker();
        this.worker.onmessage = (e) => this.arrived(e.data);
        this.worker.onerror = (e) => { e?.preventDefault?.(); this.toLocal('error'); };
      } catch (e) { this.toLocal('blocked'); }
    }
  }
  /** No worker after all: the jobs in flight go back on the queue and are built here. */
  toLocal(why) {
    if (this.disposed || this.local) return;
    try { this.worker?.terminate(); } catch (e) { /* gone */ }
    this.worker = null;
    this.local = true;
    this.stats.local = why;
    for (const m of this.inflight || []) this.queue.unshift(m);
    this.inflight = [];
    this.busy = 0;
    // (the jobs were sized for a worker: coarser here, and the biggest models stay as they are;
    // the mid copies are a worker's luxury: dropped)
    for (const m of this.queue) while (m.k > 2 && m.cells * m.k ** 3 > LOCAL_CELLS) m.k--;
    this.queue = this.queue.filter((m) => {
      if (m.tier === 'near' && m.cells * m.k ** 3 <= LOCAL_CELLS * 2) return true;
      const j = this.jobs.get(m.id);
      this.jobs.delete(m.id);
      if (j) this.slot(j.geo)[j.tier] = false;
      return false;
    });
    this.pump();
  }
  /**
   * The reach and the count of each level by the render tier: phones get fewer, coarser and only
   * close up. { near, mid, far } (each null when off).
   */
  policy() {
    const eng = this.mgr.owner?.game?.engine, fx = eng?.fx || 'high';
    const touch = PHONE; // (PC only: the full reach and density)
    const far = { r: touch || fx === 'low' ? 7 : 11, vox: touch || fx === 'low' ? 1 / 32 : 1 / 48 };
    // (no worker copies after the GPU context has been lost once: memory is short there; none on the
    // smallest phones, and fewer fine cells on small ones: a near copy is a spike of tens of MB in the worker)
    if (OFF || fx === 'off' || eng?.contextLosses > 0) return { near: null, mid: null, far };
    const mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 8;
    // (wave 13: twice the voxels on the skin: 1/96 → 1/136 m on desktop, 1/72 → 1/100 on phones,
    // which see them only in arm's reach and one or two at a time)
    if (fx === 'low' || touch) {
      if (mem <= 3) return { near: null, mid: null, far };
      return { near: { r: 2.6, max: 1, vox: 1 / 100, cells: mem <= 4 ? 3.5e6 : 6e6 }, mid: null, far }; // (phones: no mid copies, their density holds)
    }
    // (mid copies within a triangle budget: a cavern of dinos keeps its base models past it)
    return { near: { r: 6, max: 4, vox: 1 / 136, cells: 14e6 }, mid: { r: 11, max: 8, vox: 1 / 96, cells: 2.5e6, tris: 9e5 }, far };
  }
  slot(geo) { let c = this.hi.get(geo); if (!c) { c = { near: undefined, mid: undefined, far: undefined }; this.hi.set(geo, c); } return c; }
  request(geo, tier, T) {
    const src = geo.userData.hiSrc, c = this.slot(geo);
    if (!src || !T || (!this.worker && !this.local) || (this.local && tier !== 'near')) { c[tier] = false; return; }
    c[tier] = null;
    // finer by k, but a big model never past its cell budget
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const v of src.list) { if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y; if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z; }
    const cells = (x1 - x0 + 3) * (y1 - y0 + 3) * (z1 - z0 + 3);
    let k = Math.max(2, Math.round(src.vs / T.vox));
    const cap = this.local ? Math.min(LOCAL_CELLS, T.cells || 7e6) : (T.cells || 7e6);
    while (k > 2 && cells * k * k * k > cap) k--;
    // (a mid copy no finer than the base model is no use: it stays as it is)
    if (tier === 'mid' && geo.userData.ck && k <= geo.userData.ck && src.vs / k >= geo.userData.vs * 0.99 && !SKIN_MID) { c[tier] = false; return; }
    if (this.local && cells * k * k * k > cap * 2) { c[tier] = false; return; } // (too big to build here: it keeps its normal model)
    const list = new Int32Array(src.list.length * 4);
    src.list.forEach((v, i) => { list[i * 4] = v.x; list[i * 4 + 1] = v.y; list[i * 4 + 2] = v.z; list[i * 4 + 3] = v.c; });
    const id = ++this.id;
    this.jobs.set(id, { geo, tier });
    const m = { id, list, pivot: src.pivot, vs: src.vs, k, style: src.style, seed: src.seed, t0: 0, cells, tier };
    // (the near copies first: the mid ones fill in behind them)
    if (tier === 'near') { const i = this.queue.findIndex((q) => q.tier !== 'near'); if (i < 0) this.queue.push(m); else this.queue.splice(i, 0, m); }
    else this.queue.push(m);
    this.pump();
  }
  pump() {
    if (this.disposed) return;
    if (this.local) { this.pumpLocal(); return; }
    while (this.busy < 1 && this.queue.length && this.worker) {
      const m = this.queue.shift();
      m.t0 = performance.now();
      this.t0 = m.t0;
      this.busy++;
      // (the list is copied, not handed over: it's needed again if the worker never answers)
      (this.inflight ||= []).push(m);
      try { this.worker.postMessage(m); } catch (e) { this.toLocal('post'); return; }
      clearTimeout(this.watch);
      this.armWatch(m);
    }
  }
  /** The worker owes an answer for m: if none comes in WORKER_WAIT it's taken as gone (a late timer re-arms: the page was busy). */
  armWatch(m) {
    const due = performance.now() + WORKER_WAIT;
    this.watch = setTimeout(() => {
      if (!this.busy || !(this.inflight || []).includes(m)) return;
      if (performance.now() - due > 2500) this.armWatch(m); else this.toLocal('silent');
    }, WORKER_WAIT);
  }
  /** One job on this thread, then the next a little later. */
  pumpLocal() {
    if (this.localT || !this.queue.length) return;
    this.localT = setTimeout(() => {
      this.localT = null;
      const m = this.queue.shift();
      if (!m || this.disposed) return;
      const t0 = performance.now();
      this.t0 = t0;
      let r = null;
      try { r = buildHi(m); } catch (e) { r = null; }
      this.arrived(r ? { id: m.id, ok: true, ...r } : { id: m.id, ok: false }, true);
    }, LOCAL_GAP);
  }
  arrived(m, local = false) {
    if (!local) {
      this.busy = Math.max(0, this.busy - 1);
      if (this.inflight) this.inflight = this.inflight.filter((q) => q.id !== m.id);
      clearTimeout(this.watch);
    }
    const j = this.jobs.get(m.id);
    this.jobs.delete(m.id);
    this.stats.ms += performance.now() - (this.t0 || 0);
    if (j && m.ok && !this.disposed) {
      const { geo, tier } = j;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
      g.setIndex(new THREE.BufferAttribute(m.idx, 1));
      g.computeBoundingSphere();
      g.userData = { ...geo.userData, hiOf: geo, lod: tier };
      delete g.userData.hiSrc;
      this.slot(geo)[tier] = g;
      this.stats.built++;
      if (tier === 'mid') this.stats.mid++;
      this.stats.tris += m.idx.length / 3;
    } else if (j) { this.stats.failed++; this.slot(j.geo)[j.tier] = false; }
    this.pump();
  }
  /** The far copy of a base model: its coarse voxels refined only k× (built here, a frame's budget allowing). */
  farCopy(geo, vox, t0) {
    const ud = geo.userData, c = this.slot(geo);
    if (c.far !== undefined) return c.far;
    const k = ud.ck ? Math.max(1, Math.round((ud.vs * ud.ck) / vox)) : 0;
    if (!ud.cvox || !ud.ck || ud.ck <= k) { c.far = false; return false; }
    if (this.farN > 0 || performance.now() - t0 > FAR_BUDGET) return null; // (next frame)
    this.farN++;
    const vb = new VB(1);
    for (const v of ud.cvox) vb.set(v.x, v.y, v.z, v.c);
    const g = vb.geoLo(ud.cpivot[0], ud.cpivot[1], ud.cpivot[2], ud.vs * ud.ck, k);
    const own = g.userData;
    g.userData = { ...ud, hiOf: geo, lod: 'far', farVox: own.vox };
    delete g.userData.hiSrc;
    c.far = g;
    this.stats.far++;
    return g;
  }
  /** Each creature's level of detail by distance (and the closest few in reach), parts swapped to match. */
  update() {
    const t0 = performance.now();
    this.farN = 0;
    const P = this.policy(), m = this.mgr, eye = m.eye;
    const cand = [];
    const all = new Set(m.list);
    const T = m.tame;
    if (T) { if (T.pal) all.add(T.pal); if (T.stray) all.add(T.stray); for (const e of T.away || []) all.add(e); }
    for (const e of all) {
      if (!e?.alive || !e.root || !e.root.visible || e.info?.kaiju) continue;
      // (wave 19: the root of a world-space model, a wyrm, sits at the origin: its head is where it is)
      (e.root.position.lengthSq() > 0 ? e.root.getWorldPosition(_v) : _v.copy(e.pos));
      cand.push([creatureLodDist(_v.distanceTo(eye), e.K ?? 1), e]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    let nN = 0, nM = 0, mT = 0;
    const want = new Map();
    for (const [d, e] of cand) {
      let t = null;
      if (P.near && d < P.near.r && nN < P.near.max) { t = 'near'; nN++; }
      else if (P.mid && d < P.mid.r && nM < P.mid.max && mT + (e.lodTris || 0) <= P.mid.tris) { t = 'mid'; nM++; mT += e.lodTris || 0; }
      else if (P.far && d > P.far.r) t = 'far';
      if (t) want.set(e, t);
    }
    for (const e of this.on) if (!want.has(e)) { this.wear(e, null, P, t0); this.on.delete(e); }
    for (const [e, t] of want) { this.wear(e, t, P, t0); this.on.add(e); }
  }
  wear(e, tier, P, t0 = performance.now()) {
    if (!e.root) return;
    e.lodTier = tier;
    let tris = 0;
    e.root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      if (!g) return;
      const base = g.userData.hiOf || g;
      let to = base;
      if (tier === 'far') to = this.farCopy(base, P.far.vox, t0) || base;
      else if (tier && base.userData.hiSrc) {
        const c = this.slot(base);
        if (c[tier] === undefined) this.request(base, tier, P[tier]);
        // (a near copy still building: the mid one meanwhile, if there is one)
        to = c[tier] || (tier === 'near' && c.mid) || base;
        if (tier === 'near' && !c[tier] && c.mid === undefined && P.mid) this.request(base, 'mid', P.mid);
      }
      if (o.geometry !== to) o.geometry = to;
      // (what it costs once its copies are in: the mid budget counts it)
      const want = tier === 'mid' || tier === 'near' ? this.hi.get(base)?.mid || base : base;
      tris += (want.index ? want.index.count : 0) / 3;
    });
    e.lodTris = tris;
  }
  info() {
    let ready = 0, far = 0, mid = 0;
    for (const c of this.hi.values()) { if (c.near) ready++; if (c.mid) mid++; if (c.far) far++; }
    const lod = { near: 0, mid: 0, far: 0 };
    for (const e of this.on) if (e.lodTier) lod[e.lodTier]++;
    return { on: this.on.size, lod, models: ready, mid, far, building: this.jobs.size, built: this.stats.built, failed: this.stats.failed, msAvg: this.stats.built ? +(this.stats.ms / this.stats.built).toFixed(1) : 0, trisAvg: this.stats.built ? Math.round(this.stats.tris / this.stats.built) : 0, worker: !!this.worker, local: this.local ? this.stats.local : false, policy: this.policy() };
  }
  dispose() {
    this.disposed = true;
    for (const e of this.on) this.wear(e, null, null);
    this.on.clear();
    for (const c of this.hi.values()) { c.near?.dispose(); c.mid?.dispose(); c.far?.dispose(); }
    this.hi.clear();
    this.worker?.terminate();
    this.worker = null;
    clearTimeout(this.watch);
    clearTimeout(this.localT);
  }
}

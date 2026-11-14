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
// API (Enemies): new HiRes(mgr) · update() (once a frame, after the creatures moved) · info() ·
// dispose(). ?res12=0 turns it off (A/B shots).
import * as THREE from 'three';
import { HI } from './vox.js';
import { RES12 } from '../../gfx/voxRes.js';
import HiWorker from './hiWorker.js?worker';

const OFF = !RES12;

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
  return STYLE[k] || null;
}
/** Run build() with the skin style of a model key in effect (nested builds restore it). */
export function withStyle(key, build) {
  const prev = HI.style;
  HI.style = OFF ? null : styleFor(key) || null;
  try { return build(); } finally { HI.style = prev; }
}

const _v = new THREE.Vector3();

export class HiRes {
  constructor(mgr) {
    this.mgr = mgr;
    this.hi = new Map(); // coarse geometry → near copy (null while building)
    this.jobs = new Map(); // id → coarse geometry
    this.queue = [];
    this.busy = 0;
    this.id = 0;
    this.on = new Set(); // creatures wearing near copies
    this.stats = { built: 0, ms: 0, tris: 0, failed: 0 };
    this.worker = null;
    if (!OFF) {
      try {
        this.worker = new HiWorker();
        this.worker.onmessage = (e) => this.arrived(e.data);
        this.worker.onerror = () => { this.worker = null; };
      } catch (e) { this.worker = null; }
    }
  }
  /** The reach and the count by the render tier: phones get fewer, coarser and only close up. */
  policy() {
    const eng = this.mgr.owner?.game?.engine, fx = eng?.fx || 'high';
    const touch = typeof document !== 'undefined' && document.documentElement.classList.contains('is-touch');
    if (fx === 'off') return null;
    // (wave 13: twice the voxels on the skin: 1/96 → 1/136 m on desktop, 1/72 → 1/100 on phones,
    // which see them only in arm's reach and one or two at a time)
    if (fx === 'low' || touch) return { r: 2.6, max: 1, vox: 1 / 100, cells: 7e6 };
    return { r: 6, max: 4, vox: 1 / 136, cells: 14e6 };
  }
  request(geo, P) {
    const src = geo.userData.hiSrc;
    if (!src || !this.worker) return;
    this.hi.set(geo, null);
    // finer by k, but a big model never past ~7M fine cells
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const v of src.list) { if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y; if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z; }
    const cells = (x1 - x0 + 3) * (y1 - y0 + 3) * (z1 - z0 + 3);
    let k = Math.max(2, Math.round(src.vs / P.vox));
    while (k > 2 && cells * k * k * k > (P.cells || 7e6)) k--;
    const list = new Int32Array(src.list.length * 4);
    src.list.forEach((v, i) => { list[i * 4] = v.x; list[i * 4 + 1] = v.y; list[i * 4 + 2] = v.z; list[i * 4 + 3] = v.c; });
    const id = ++this.id;
    this.jobs.set(id, geo);
    this.queue.push({ id, list, pivot: src.pivot, vs: src.vs, k, style: src.style, seed: src.seed, t0: 0 });
    this.pump();
  }
  pump() {
    while (this.busy < 1 && this.queue.length && this.worker) {
      const m = this.queue.shift();
      m.t0 = performance.now();
      this.t0 = m.t0;
      this.busy++;
      this.worker.postMessage(m, [m.list.buffer]);
    }
  }
  arrived(m) {
    this.busy = Math.max(0, this.busy - 1);
    const geo = this.jobs.get(m.id);
    this.jobs.delete(m.id);
    this.stats.ms += performance.now() - (this.t0 || 0);
    if (geo && m.ok && !this.disposed) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
      g.setIndex(new THREE.BufferAttribute(m.idx, 1));
      g.computeBoundingSphere();
      g.userData = { ...geo.userData, hiOf: geo };
      delete g.userData.hiSrc;
      this.hi.set(geo, g);
      this.stats.built++;
      this.stats.tris += m.idx.length / 3;
    } else if (geo) { this.stats.failed++; }
    this.pump();
  }
  /** Swap creatures' parts to their near copies (or back) by distance. */
  update() {
    if (!this.worker) return;
    const P = this.policy(), m = this.mgr, eye = m.eye;
    // who is near: the closest few within reach
    const cand = [];
    const all = new Set(m.list);
    const T = m.tame;
    if (T) { if (T.pal) all.add(T.pal); if (T.stray) all.add(T.stray); for (const e of T.away || []) all.add(e); }
    if (P) {
      for (const e of all) {
        if (!e?.alive || !e.root || !e.root.visible) continue;
        e.root.getWorldPosition(_v);
        const d = _v.distanceTo(eye);
        if (d < P.r) cand.push([d, e]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      cand.length = Math.min(cand.length, P.max);
    }
    const near = new Set(cand.map((c) => c[1]));
    for (const e of this.on) if (!near.has(e)) { this.wear(e, false, P); this.on.delete(e); }
    for (const e of near) { this.wear(e, true, P); this.on.add(e); }
  }
  wear(e, hi, P) {
    if (!e.root) return;
    e.root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      if (!g) return;
      if (hi) {
        if (g.userData.hiOf) return;
        if (!g.userData.hiSrc) return;
        if (!this.hi.has(g)) { this.request(g, P); return; }
        const h = this.hi.get(g);
        if (h) o.geometry = h;
      } else if (g.userData.hiOf) o.geometry = g.userData.hiOf;
    });
  }
  info() {
    let ready = 0;
    for (const g of this.hi.values()) if (g) ready++;
    return { on: this.on.size, models: ready, building: this.jobs.size, built: this.stats.built, failed: this.stats.failed, msAvg: this.stats.built ? +(this.stats.ms / this.stats.built).toFixed(1) : 0, trisAvg: this.stats.built ? Math.round(this.stats.tris / this.stats.built) : 0, worker: !!this.worker, policy: this.policy() };
  }
  dispose() {
    this.disposed = true;
    for (const e of this.on) this.wear(e, false, null);
    this.on.clear();
    for (const g of this.hi.values()) g?.dispose();
    this.hi.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}

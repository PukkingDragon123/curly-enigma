// A few workers that generate and mesh chunks off the main thread (src/deep/genWorker.js). If the
// page can't start workers (or one fails), `ok` goes false and the world falls back to doing the
// same work on the main thread within the frame budget. A worker that never says it's ready, or
// a pool that stops answering with jobs out, counts as failed too (a sandboxed page can swallow a
// blocked worker without an error).
import { RES12 } from '../gfx/voxRes.js';
import GenWorker from './genWorker.js?worker&inline';

/** No 'ready' from the workers in this long, or no answer at all with jobs out: failed (ms). */
const READY_WAIT = 12000;
const ANSWER_WAIT = 20000;

export class ChunkPool {
  /** init: { seed, opts: { W, D }, tunnels } — the plan parameters (the worker rebuilds the plan). */
  constructor(init, n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1))) {
    this.ok = false;
    this.workers = [];
    this.busy = [];
    this.cb = new Map();
    this.id = 1;
    this.max = 6; // jobs in flight per worker
    // the first worker sends back the plan it built (see plan())
    this.planWait = null;
    this.planGot = undefined;
    try {
      for (let i = 0; i < n; i++) {
        const w = new GenWorker();
        w.onmessage = (e) => this.onMsg(i, e.data);
        w.onerror = (e) => this.fail(e);
        w.postMessage({ t: 'init', ...init, sendPlan: i === 0, res12: RES12 });
        this.workers.push(w);
        this.busy.push(0);
      }
      this.ok = this.workers.length > 0;
    } catch (err) {
      console.warn('chunk workers unavailable, generating on the main thread', err);
      for (const w of this.workers) { try { w.terminate(); } catch (e) { /* gone */ } }
      this.workers = [];
      this.ok = false;
    }
    if (this.ok) {
      this.readyN = 0;
      this.lastMsg = performance.now();
      let tick = performance.now();
      this.watch = setInterval(() => {
        if (!this.ok) { clearInterval(this.watch); return; }
        // (this page was busy for a while: their answers may be queued behind it, not missing)
        const now = performance.now();
        if (now - tick > 2500) this.lastMsg = now;
        tick = now;
        const quiet = now - this.lastMsg;
        if (this.readyN === 0 && quiet > READY_WAIT) this.fail(new Error('the chunk workers never started'));
        else if (this.inflight > 0 && quiet > ANSWER_WAIT) this.fail(new Error('the chunk workers stopped answering'));
      }, 1000);
    }
  }

  /**
   * The plan the first worker built (structured-cloned, without its noise: see Generator.revivePlan),
   * or null if it can't be had within ms (the caller then builds its own).
   */
  plan(ms = 8000) {
    if (!this.ok) return Promise.resolve(null);
    if (this.planGot !== undefined) return Promise.resolve(this.planGot);
    return new Promise((res) => {
      const done = (p) => { clearTimeout(t); this.planWait = null; res(p); };
      // (not one worker ready by then: they never will be)
      const t = setTimeout(() => { if (!this.readyN) this.fail(new Error('the chunk workers never started')); done(null); }, ms);
      this.planWait = done;
    });
  }

  get inflight() { let n = 0; for (const b of this.busy) n += b; return n; }
  get capacity() { return this.workers.length * this.max; }

  /** Post a job to the least busy worker; cb(result) later. Returns false when everyone is full. */
  send(msg, transfer, cb) {
    if (!this.ok) return false;
    if (this.inflight === 0) this.lastMsg = performance.now(); // (the quiet clock starts with the first job out)
    let best = -1;
    for (let i = 0; i < this.workers.length; i++) if (this.busy[i] < this.max && (best < 0 || this.busy[i] < this.busy[best])) best = i;
    if (best < 0) return false;
    const id = this.id++;
    this.cb.set(id, cb);
    this.busy[best]++;
    this.workers[best].postMessage({ ...msg, id }, transfer || []);
    return true;
  }

  onMsg(i, m) {
    this.lastMsg = performance.now();
    if (m.t === 'ready') {
      this.readyN++;
      if (i === 0) { this.planGot = m.plan || null; this.planWait?.(this.planGot); }
      return;
    }
    this.busy[i] = Math.max(0, this.busy[i] - 1);
    const f = this.cb.get(m.id);
    this.cb.delete(m.id);
    if (f) f(m);
  }

  fail(e) {
    e?.preventDefault?.();
    if (!this.ok) return;
    console.warn('chunk worker failed, generating on the main thread', e?.message || e);
    this.ok = false;
    clearInterval(this.watch);
    for (const w of this.workers) { try { w.terminate(); } catch (err) { /* gone */ } }
    // jobs that will never come back: tell their owners so they can redo the work
    for (const f of this.cb.values()) try { f(null); } catch (err) { /* noop */ }
    this.cb.clear();
    this.planWait?.(null);
  }

  dispose() {
    clearInterval(this.watch);
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.ok = false;
    this.cb.clear();
  }
}

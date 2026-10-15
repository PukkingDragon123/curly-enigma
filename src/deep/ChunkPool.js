// A few workers that generate and mesh chunks off the main thread (src/deep/genWorker.js). If the
// page can't start workers (or one fails), `ok` goes false and the world falls back to doing the
// same work on the main thread within the frame budget.
import GenWorker from './genWorker.js?worker&inline';

export class ChunkPool {
  /** init: { seed, opts: { W, D }, tunnels } — the plan parameters (the worker rebuilds the plan). */
  constructor(init, n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1))) {
    this.ok = false;
    this.workers = [];
    this.busy = [];
    this.cb = new Map();
    this.id = 1;
    this.max = 6; // jobs in flight per worker
    try {
      for (let i = 0; i < n; i++) {
        const w = new GenWorker();
        w.onmessage = (e) => this.onMsg(i, e.data);
        w.onerror = (e) => this.fail(e);
        w.postMessage({ t: 'init', ...init });
        this.workers.push(w);
        this.busy.push(0);
      }
      this.ok = this.workers.length > 0;
    } catch (err) {
      console.warn('chunk workers unavailable, generating on the main thread', err);
      this.ok = false;
    }
  }

  get inflight() { let n = 0; for (const b of this.busy) n += b; return n; }
  get capacity() { return this.workers.length * this.max; }

  /** Post a job to the least busy worker; cb(result) later. Returns false when everyone is full. */
  send(msg, transfer, cb) {
    if (!this.ok) return false;
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
    if (m.t === 'ready') return;
    this.busy[i] = Math.max(0, this.busy[i] - 1);
    const f = this.cb.get(m.id);
    this.cb.delete(m.id);
    if (f) f(m);
  }

  fail(e) {
    if (!this.ok) return;
    console.warn('chunk worker failed, generating on the main thread', e?.message || e);
    this.ok = false;
    // jobs that will never come back: tell their owners so they can redo the work
    for (const f of this.cb.values()) try { f(null); } catch (err) { /* noop */ }
    this.cb.clear();
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.ok = false;
    this.cb.clear();
  }
}

// The cave plants' fine copies (wave 12) come from a worker (./fineWorker.js): a proto asks once
// (./plants.js buildOne), its p.fine arrives a frame or few later and Vegetation re-plants the near
// chunks that still wear the coarse copy (protoStats.fineGen counts the arrivals).
//
// The worker is inlined (the single-file build has no separate files to load it from). If it
// can't start, errors or stops answering, the fine copies are made on the main thread instead,
// one at a time a few frames apart (protoStats.fineLocal says why).
import { protoStats, modelOf } from './plants.js';
import { fine2 } from './fine.js';
import { boxify } from './vox.js';
import FineWorker from './fineWorker.js?worker&inline';

/** A request the worker hasn't answered in this long: it's taken as gone (ms). */
const WORKER_WAIT = 15000;
/** Main-thread fine copies: the gap between two (ms). */
const LOCAL_GAP = 120;

let W = null, local = false, watch = null, localT = null;
const wait = new Map(); // id → proto waiting on the worker
const queue = []; // [id, proto, name, i] for the main thread

function got(q, p, ms) {
  if (!p) { q.wantFine = false; return; }
  q.fine = p;
  protoStats.fine = (protoStats.fine || 0) + 1;
  protoStats.fineBoxes = (protoStats.fineBoxes || 0) + p.n;
  protoStats.fineMs = (protoStats.fineMs || 0) + ms;
  protoStats.fineGen = (protoStats.fineGen || 0) + 1;
}

/** No worker after all: everything still waiting is made here. */
function toLocal(why) {
  if (local) return;
  local = true;
  protoStats.fineLocal = why;
  clearTimeout(watch);
  try { W?.terminate(); } catch (e) { /* gone */ }
  W = null;
  for (const [id, q] of wait) { const [name, i] = id.split('#'); queue.push([id, q, name, +i]); }
  wait.clear();
  pumpLocal();
}

function pumpLocal() {
  if (localT || !queue.length) return;
  localT = setTimeout(() => {
    localT = null;
    const job = queue.shift();
    if (!job) return;
    const [, q, name, i] = job;
    const t0 = performance.now();
    let p = null;
    try {
      const m = modelOf(name, i);
      const f = fine2(m.g, m.pivot);
      p = boxify(f.g, f.pivot, m.mode);
      p.res = 2;
    } catch (e) { p = null; }
    got(q, p, performance.now() - t0);
    pumpLocal();
  }, LOCAL_GAP);
}

function rearm() {
  clearTimeout(watch);
  if (!wait.size) return;
  const due = performance.now() + WORKER_WAIT;
  // (fired late: the page was busy, the answers may be queued behind it; give them a turn)
  watch = setTimeout(() => { if (performance.now() - due > 2500) rearm(); else toLocal('silent'); }, WORKER_WAIT);
}

export function askFine(p, name, i) {
  const id = name + '#' + i;
  if (!W && !local) {
    try {
      W = new FineWorker();
      W.onmessage = (e) => {
        const m = e.data, q = wait.get(m.id);
        wait.delete(m.id);
        rearm();
        if (q) got(q, m.p, m.ms);
      };
      W.onerror = (e) => { e?.preventDefault?.(); toLocal('error'); };
    } catch (e) { toLocal('blocked'); }
  }
  if (local) { queue.push([id, p, name, i]); pumpLocal(); return; }
  wait.set(id, p);
  try { W.postMessage({ id, name, i }); } catch (e) { toLocal('post'); return; }
  if (wait.size === 1) rearm();
}

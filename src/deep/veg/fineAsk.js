// The cave plants' fine copies (wave 12) come from a worker (./fineWorker.js): a proto asks once
// (./plants.js buildOne), its p.fine arrives a frame or few later and Vegetation re-plants the near
// chunks that still wear the coarse copy (protoStats.fineGen counts the arrivals).
import { protoStats } from './plants.js';
import FineWorker from './fineWorker.js?worker';

let W = null, failed = false;
const wait = new Map();
export function askFine(p, name, i) {
  if (failed) { p.wantFine = false; return; }
  if (!W) {
    try {
      W = new FineWorker();
      W.onmessage = (e) => {
        const m = e.data, q = wait.get(m.id);
        wait.delete(m.id);
        if (!q) return;
        if (!m.p) { q.wantFine = false; return; }
        q.fine = m.p;
        protoStats.fine = (protoStats.fine || 0) + 1;
        protoStats.fineBoxes = (protoStats.fineBoxes || 0) + m.p.n;
        protoStats.fineMs = (protoStats.fineMs || 0) + m.ms;
        protoStats.fineGen = (protoStats.fineGen || 0) + 1;
      };
      W.onerror = () => { failed = true; for (const q of wait.values()) q.wantFine = false; wait.clear(); };
    } catch (e) { failed = true; p.wantFine = false; return; }
  }
  const id = name + '#' + i;
  wait.set(id, p);
  W.postMessage({ id, name, i });
}

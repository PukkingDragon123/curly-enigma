// Builds creatures' hi-res near copies off the main thread (./hiBuild.js), one request at a time.
import { buildHi } from './hiBuild.js';

self.onmessage = (e) => {
  const m = e.data;
  let r = null;
  try { r = buildHi(m); } catch (err) { r = null; }
  if (!r) { self.postMessage({ id: m.id, ok: false }); return; }
  self.postMessage({ id: m.id, ok: true, ...r }, [r.pos.buffer, r.nor.buffer, r.col.buffer, r.idx.buffer]);
};

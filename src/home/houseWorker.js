// A build worker for Old Star's house: runs one job at a time (houseJobs.js) and posts the packed
// result back, its buffers transferred. Errors go back too (the scene then builds that job itself).
import { runJob } from './houseJobs.js';

self.onmessage = (e) => {
  const job = e.data;
  try {
    const t0 = performance.now();
    const { msg, transfer } = runJob(job);
    self.postMessage({ ok: true, key: job.key, msg, ms: Math.round(performance.now() - t0) }, transfer);
  } catch (err) {
    self.postMessage({ ok: false, key: job.key, error: String((err && err.stack) || err) });
  }
};

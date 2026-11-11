// The cave's build jobs, the same in a build worker (houseWorker.js) and on the main thread:
//   { kind: 'room', id, opts }           'rock' (the hollow's rock, floor and roof, the dug alcoves),
//                                        'west', 'east' (what's in them), or 'ways' (the door, your
//                                        corner, the walls' collision; with `lights`: every job's)
//   opts: { doorOpen, notes, nooks (nooks.js nookKey of the dug alcoves) }
// runJob(job) → { msg, transfer } (msg is plain data and typed arrays; transfer: their buffers).
// Nothing here may touch the DOM: a worker has none.
import * as THREE from 'three';
import { StarHouse, JOBS } from './house.js';
import { T } from './units.js';

export { JOBS };

export function runJob(job) {
  if (job.kind === 'shell') return { msg: { kind: 'shell', surf: null }, transfer: [] }; // (your old room's walls: gone with it)
  const room = new THREE.Group();
  room.scale.setScalar(T);
  const world = new THREE.Group();
  const h = new StarHouse(room, world).buildJob(job.id, job.opts || {});
  const r = h.packJob(job.id, job.lights || null);
  r.msg.kind = 'room';
  return r;
}

/**
 * Every camp job on this thread, one after another (when there are no workers): { jobs, vista: null }.
 * pause: async () => void between jobs; onJob(id) after each.
 */
export async function runHouseJobs(opts = {}, pause = null, onJob = null) {
  const jobs = [];
  for (const id of JOBS) {
    if (id === 'ways') continue;
    jobs.push(runJob({ kind: 'room', id, opts }).msg);
    onJob?.(id);
    if (pause) await pause();
  }
  const lights = jobs.flatMap((p) => p.lights);
  jobs.push(runJob({ kind: 'room', id: 'ways', opts, lights }).msg);
  onJob?.('ways');
  if (pause) await pause();
  return { jobs, vista: null };
}

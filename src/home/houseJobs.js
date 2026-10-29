// The house's build jobs, the same in a build worker (houseWorker.js) and on the main thread:
//   { kind: 'room', id, opts }           a room's furnishings, walls, ceiling and floor (or id 'ways':
//                                        the doors and steps between rooms, with `lights`: every
//                                        room's, so each side of a door is lit by its own room)
//   { kind: 'vista' }                    the cavern's two painted panoramas
//   { kind: 'shell', W, D, wallId }      your bedroom's walls and ceiling
// runJob(job) → { msg, transfer } (msg is plain data and typed arrays; transfer: their buffers).
// Nothing here may touch the DOM: a worker has none.
import * as THREE from 'three';
import { StarHouse, JOBS } from './house.js';
import { T } from './units.js';
import { paintVistaData } from './vista.js';
import { packShellSurfaces } from './shellSurf.js';

export { JOBS };

export function runJob(job) {
  if (job.kind === 'vista') { const transfer = []; return { msg: { kind: 'vista', vista: paintVistaData(transfer) }, transfer }; }
  if (job.kind === 'shell') { const transfer = []; return { msg: { kind: 'shell', surf: packShellSurfaces(job.W, job.D, job.wallId, transfer) }, transfer }; }
  const room = new THREE.Group();
  room.scale.setScalar(T);
  const world = new THREE.Group();
  const h = new StarHouse(room, world).buildJob(job.id, job.opts || {});
  const r = h.packJob(job.id, job.lights || null);
  r.msg.kind = 'room';
  return r;
}

/**
 * Every house job on this thread, one after another (when there are no workers): { jobs, vista }.
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
  const vista = runJob({ kind: 'vista' }).msg.vista;
  onJob?.('vista');
  return { jobs, vista };
}

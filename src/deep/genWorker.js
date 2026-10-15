// Chunk generation and meshing off the main thread. The plan is rebuilt here from the same seed
// (it is deterministic), so the worker and the game agree on every voxel.
import { makePlan, addMouth, ChunkGen, CS } from './Generator.js';
import { meshSolidRaw } from './Mesher.js';

let gen = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.t === 'init') {
    const plan = makePlan(m.seed, m.opts);
    for (const t of m.tunnels || []) addMouth(plan, t.wall, t.t);
    gen = new ChunkGen(plan);
    self.postMessage({ t: 'ready' });
    return;
  }
  if (m.t === 'gen') {
    if (!m.real && gen.isSolid(m.cx, m.cy, m.cz)) {
      self.postMessage({ t: 'gen', id: m.id, virtual: true, deps: gen.depositsFor(m.cx, m.cy, m.cz) });
      return;
    }
    const vox = new Uint8Array(CS * CS * CS);
    const deps = gen.generate(m.cx, m.cy, m.cz, vox);
    self.postMessage({ t: 'gen', id: m.id, vox, deps }, [vox.buffer]);
    return;
  }
  if (m.t === 'mesh') {
    const raw = meshSolidRaw(m.pad);
    if (!raw) { self.postMessage({ t: 'mesh', id: m.id, raw: null }); return; }
    self.postMessage({ t: 'mesh', id: m.id, raw }, [raw.pos.buffer, raw.dat.buffer, raw.idx.buffer]);
  }
};

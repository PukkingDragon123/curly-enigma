// Chunk generation and meshing off the main thread. The plan is rebuilt here from the same seed
// (it is deterministic), so the worker and the game agree on every voxel.
import { makePlan, addMouth, ChunkGen, CS } from './Generator.js';
import { meshSolidRaw, FLUID, PAD } from './Mesher.js';
// cave prop models (Props.js asks for them here, so building and meshing them never costs a frame)
import { buildModel, modelBuffers } from './props/models.js';
import '../cooking/plantModels.js';

/** Does the chunk inside a padded block hold any fluid? (saves the main thread a 32³ scan) */
function padHasFluid(pad) {
  const P = PAD;
  for (let z = 1; z <= CS; z++) for (let y = 1; y <= CS; y++) {
    const row = (y + P * z) * P;
    for (let x = 1; x <= CS; x++) if (FLUID[pad[row + x]]) return true;
  }
  return false;
}

let gen = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.t === 'init') {
    const plan = makePlan(m.seed, m.opts);
    for (const t of m.tunnels || []) addMouth(plan, t.wall, t.t);
    gen = new ChunkGen(plan);
    // one worker hands its plan to the game, so the main thread needn't build it as well
    // (the noise fields are functions: the game rebuilds them from the seed)
    if (m.sendPlan) {
      const { noise, ...rest } = plan;
      try { self.postMessage({ t: 'ready', plan: rest }); return; } catch (err) { /* not cloneable: the game builds its own */ }
    }
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
  if (m.t === 'model') {
    let model = null;
    try { model = buildModel(m.type, m.v, m.p); } catch (err) { model = null; }
    self.postMessage({ t: 'model', id: m.id, model }, model ? modelBuffers(model) : []);
    return;
  }
  if (m.t === 'mesh') {
    const raw = meshSolidRaw(m.pad);
    const fluid = padHasFluid(m.pad);
    if (!raw) { self.postMessage({ t: 'mesh', id: m.id, raw: null, fluid }); return; }
    self.postMessage({ t: 'mesh', id: m.id, raw, fluid }, [raw.pos.buffer, raw.dat.buffer, raw.idx.buffer]);
  }
};

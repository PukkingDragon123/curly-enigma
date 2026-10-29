// The old 2D foraging overlay is gone: gathering is an in-world 3D close-up now (src/deep/gather).
// This module stays so older imports keep working: openForage() gathers the nearest plant of that
// kind in the mine (or a stand-in in front of the mole), and the headless sims are re-exported.
import { openGather } from '../deep/gather/index.js';
import { simulate, makeSim, scriptInput } from '../deep/gather/sims.js';

export { simulate, makeSim, scriptInput };

/** Gather `id` in the mine; resolves like openGather ({ cancel } | { id, q, p, n, ... }). */
export function openForage(game, id, opts = {}) {
  const props = game?.scene?.props;
  if (!props) return Promise.resolve({ cancel: true });
  const e = game.scene.player?.eye?.();
  let best = null, bd = opts.r ?? 3;
  for (const p of props.plants || []) {
    if (p.gone || !p.m || p.item !== id || !e) continue;
    const d = Math.hypot(p.cx - e.x, p.cy - e.y, p.cz - e.z);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) return openGather(props, best, opts);
  if (typeof window !== 'undefined') { window.__gather?.open(id, { standIn: true, ...opts }); return Promise.resolve({ cancel: true, standIn: true }); }
  return Promise.resolve({ cancel: true });
}

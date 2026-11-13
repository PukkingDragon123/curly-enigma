// Builds the cave plants' fine copies (wave 12) off the main thread: the same model as the game's
// (./plants.js modelOf), twice as fine with its detail (./fine.js), packed into boxes (./vox.js).
import { modelOf } from './plants.js';
import { fine2 } from './fine.js';
import { boxify } from './vox.js';

self.onmessage = (e) => {
  const { id, name, i } = e.data;
  const t0 = performance.now();
  let p = null;
  try {
    const m = modelOf(name, i);
    const f = fine2(m.g, m.pivot);
    p = boxify(f.g, f.pivot, m.mode);
    p.res = 2;
  } catch (err) { p = null; }
  const ms = performance.now() - t0;
  if (!p) { self.postMessage({ id, p: null, ms }); return; }
  self.postMessage({ id, p, ms }, [p.off.buffer, p.size.buffer, p.rgb.buffer, p.glow.buffer, p.bend.buffer]);
};

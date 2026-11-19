// Builds the cave plants' prototypes (the first variant of every model, and its half-resolution far
// copy) off the main thread, so meeting a new kind of plant while walking never stalls a frame
// (each one is 5-120 ms of voxel work: ./plantWarm.js hands them to plants.js adoptProto).
import { modelOf } from './plants.js';
import { boxify, down2 } from './vox.js';

const bufs = (p) => [p.off.buffer, p.size.buffer, p.rgb.buffer, p.glow.buffer, p.bend.buffer];

self.onmessage = (e) => {
  for (const name of e.data.names) {
    let p = null, ext = 0;
    try {
      const m = modelOf(name, 0);
      p = boxify(m.g, m.pivot, m.mode);
      p.lod = boxify(down2(m.g), m.pivot.map((q) => Math.round(q / 2)), m.mode);
      ext = Math.max(m.pivot[0], m.g.w - m.pivot[0], m.pivot[1], m.g.h - m.pivot[1], m.pivot[2], m.g.d - m.pivot[2]);
    } catch (err) { p = null; }
    if (!p) { self.postMessage({ name, p: null }); continue; }
    self.postMessage({ name, p, ext }, [...bufs(p), ...bufs(p.lod)]);
  }
  self.postMessage({ done: true });
};

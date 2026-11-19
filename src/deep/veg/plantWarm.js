// (no hitches when chunks load) Every plant model's first variant is built in a worker as soon as
// the mine opens (./protoWorker.js), nearest-to-use first, and adopted into plants.js's cache as it
// lands: Vegetation then finds it ready instead of building it in the middle of a frame. Anything
// asked for before its worker copy arrives is still built on the spot, as before.
import ProtoWorker from './protoWorker.js?worker&inline';
import { MODELS, adoptProto } from './plants.js';

let started = false;
/** Start warming (once per page). first: model names to build before the rest. */
export function warmPlants(first = []) {
  if (started || typeof Worker === 'undefined') return;
  started = true;
  let W;
  try { W = new ProtoWorker(); } catch (e) { return; }
  const names = [...new Set([...first.filter((n) => MODELS[n]), ...Object.keys(MODELS)])];
  const quit = setTimeout(() => { try { W.terminate(); } catch (e) { /* gone */ } }, 120000);
  W.onmessage = (e) => {
    const m = e.data;
    if (m.done) { clearTimeout(quit); W.terminate(); return; }
    if (m.p) adoptProto(m.name, m.p, m.ext);
  };
  W.onerror = () => { clearTimeout(quit); try { W.terminate(); } catch (e) { /* gone */ } };
  W.postMessage({ names });
}

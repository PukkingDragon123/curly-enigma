// What a picture of an item is (shared by the item worker and the main-thread fallback of
// src/ui/itemVox.js): the item's model (./itemModels.js) drawn by the item renderer (./itemRaster.js)
// in one of a few kinds of frame:
//   still   the resting 3/4 view in its pocket
//   rock    one of ROCK_N frames of a gentle sway and bob (hovered or held); frame 0 = the still
//   spin    one of SPIN_N frames of a whole slow turn (the backpack's tag)
//   pop     one of POP_N frames of the "picked up" flourish: a quick turn that lands on the still
//   held    one of ROCK_N frames of the sway, lifted off its floor (no floor shadow: it's in the paw)
//
//   renderFrame(key, size, kind, i) → { img: ImageData, real, src } | null
import { itemMesh } from './itemModels.js';
import { rasterItem, fitItem } from './itemRaster.js';

export const ROCK_N = 24, SPIN_N = 48, POP_N = 14;
const SWAY = 0.36, BOB = 0.035;

const models = new Map(); // key → model | null (the last few)
function modelOf(key) {
  if (models.has(key)) { const m = models.get(key); models.delete(key); models.set(key, m); return m; }
  let m = null;
  try { m = itemMesh(key); } catch (e) { m = null; }
  if (m) m.fits = new Map();
  models.set(key, m);
  while (models.size > 24) models.delete(models.keys().next().value);
  return m;
}
/** The fit of a model at a size for a kind of frame (stills and rocks share one: no jump on hover). */
function fitOf(m, size, kind) {
  const fk = (kind === 'spin' ? 'spin' : 'still') + size;
  let f = m.fits.get(fk);
  if (!f) {
    const p = m.pose;
    const poses = kind === 'spin'
      ? Array.from({ length: 12 }, (_, k) => ({ yaw: p.yaw + (k / 12) * Math.PI * 2, pitch: p.pitch }))
      : [{ yaw: p.yaw - SWAY, pitch: p.pitch }, { yaw: p.yaw, pitch: p.pitch }, { yaw: p.yaw + SWAY, pitch: p.pitch }, { yaw: p.yaw, pitch: p.pitch, lift: BOB }];
    f = fitItem(m.M, poses, size, { pad: Math.max(2, Math.round(size / 40)) });
    m.fits.set(fk, f);
  }
  return f;
}

/** Frame i of a kind for an item key at size px (see the header). */
export function renderFrame(key, size, kind = 'still', i = 0) {
  const m = modelOf(key);
  if (!m) return null;
  const p = m.pose;
  const f = fitOf(m, size, kind);
  let job;
  if (kind === 'rock' || kind === 'held') {
    const a = (i / ROCK_N) * Math.PI * 2;
    job = { yaw: p.yaw + Math.sin(a) * SWAY, pitch: p.pitch, lift: BOB * (1 - Math.cos(a)) * 0.5, ...f };
  } else if (kind === 'spin') {
    job = { yaw: p.yaw + (i / SPIN_N) * Math.PI * 2, pitch: p.pitch - 0.04 + Math.sin((i / SPIN_N) * Math.PI * 2) * 0.04, ...f };
  } else if (kind === 'pop') {
    const t = i / (POP_N - 1), e = 1 - (1 - t) ** 3;
    const s = 0.78 + 0.22 * e + Math.sin(t * Math.PI) * 0.08;
    job = { yaw: p.yaw - (1 - e) * Math.PI * 2, pitch: p.pitch, lift: Math.sin(t * Math.PI) * 0.1, k: f.k * s, ox: f.ox, oy: f.oy - (s - 1) * 0 };
  } else job = { yaw: p.yaw, pitch: p.pitch, ...f };
  const img = rasterItem(m.M, { size, ground: kind !== 'held', ...job });
  return { img, real: m.real, src: m.src };
}

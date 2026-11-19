// What a picture of an item is (shared by the item worker and the main-thread fallback of
// src/ui/itemVox.js): the item's model (./itemModels.js) drawn as a small pixel sprite by the item
// renderer (./itemRaster.js), in one of a few kinds of frame:
//   still   the resting 3/4 view in its pocket
//   rock    one of ROCK_N frames of a gentle sway and bob (hovered); frame 0 = the still
//   held    the same sway lifted off its floor (no floor shadow: it's in the paw)
//   spin    one of SPIN_N frames of a whole slow turn (the backpack's tag)
//   pop     one of POP_N frames of the "picked up" flourish: a quick turn that lands on the still
// Few frames, like a hand-animated sprite. Frames reuse their still's palette (no colour flicker).
//
//   renderFrame(key, size, kind, i) → { img: ImageData, real, src } | null
import { itemMesh } from './itemModels.js';
import { rasterItem, fitItem } from './itemRaster.js';

export const ROCK_N = 8, SPIN_N = 16, POP_N = 8;
const SWAY = 0.22, BOB = 0.05;

const models = new Map(); // key → model | null (the last few)
function modelOf(key) {
  if (models.has(key)) { const m = models.get(key); models.delete(key); models.set(key, m); return m; }
  let m = null;
  try { m = itemMesh(key); } catch (e) { m = null; }
  if (m) { m.fits = new Map(); m.pals = new Map(); }
  models.set(key, m);
  while (models.size > 24) models.delete(models.keys().next().value);
  return m;
}
/** The fit of a model at a size (stills and sways share one: no jump on hover; a spin has its own). */
function fitOf(m, size, kind) {
  const fk = (kind === 'spin' ? 'spin' : 'still') + size;
  let f = m.fits.get(fk);
  if (!f) {
    const p = m.pose;
    const poses = kind === 'spin'
      ? Array.from({ length: 12 }, (_, k) => ({ yaw: p.yaw + (k / 12) * Math.PI * 2, pitch: p.pitch }))
      : [{ yaw: p.yaw - SWAY, pitch: p.pitch }, { yaw: p.yaw, pitch: p.pitch }, { yaw: p.yaw + SWAY, pitch: p.pitch }, { yaw: p.yaw, pitch: p.pitch, lift: BOB }];
    f = fitItem(m.M, poses, size, { pad: 1 });
    m.fits.set(fk, f);
  }
  return f;
}
function jobOf(m, size, kind, i) {
  const p = m.pose, f = fitOf(m, size, kind);
  if (kind === 'rock' || kind === 'held') {
    const a = (i / ROCK_N) * Math.PI * 2;
    return { yaw: p.yaw + Math.sin(a) * SWAY, pitch: p.pitch, lift: BOB * (1 - Math.cos(a)) * 0.5, ...f };
  }
  if (kind === 'spin') return { yaw: p.yaw + (i / SPIN_N) * Math.PI * 2, pitch: p.pitch, ...f };
  if (kind === 'pop') {
    const t = i / (POP_N - 1), e = 1 - (1 - t) ** 3;
    return { yaw: p.yaw - (1 - e) * Math.PI * 2, pitch: p.pitch, lift: Math.sin(t * Math.PI) * 0.12, ...f };
  }
  return { yaw: p.yaw, pitch: p.pitch, ...f };
}

/** Frame i of a kind for an item key at size px (see the header). */
export function renderFrame(key, size, kind = 'still', i = 0) {
  const m = modelOf(key);
  if (!m) return null;
  // the still's palette first (its frames are drawn in the same colours)
  let pal = m.pals.get(size);
  if (!pal) {
    const r = rasterItem(m.M, { size, ground: true, ...jobOf(m, size, 'still', 0) });
    pal = r.pal;
    m.pals.set(size, pal);
    if (kind === 'still') return { img: r.img, real: m.real, src: m.src };
  }
  const r = rasterItem(m.M, { size, ground: kind !== 'held', pal, ...jobOf(m, size, kind, i) });
  return { img: r.img, real: m.real, src: m.src };
}

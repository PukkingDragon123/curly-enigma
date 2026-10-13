// Water & lava cellular automaton with reactions (obsidian, steam, freezing, dissolving).
import { B, BLOCKS, ORES, isSolid } from './blocks.js';

const MIN = 0.004;
let flip = false;

/**
 * One fluid tick over a rectangle (grid coords, inclusive).
 * onEvent(kind, x, y) receives reaction events: 'obsidian', 'steam', 'splash'.
 */
export function stepFluids(w, x0, y0, x1, y1, onEvent, lavaTick = true) {
  const W = w.W, H = w.H;
  x0 = Math.max(1, x0); x1 = Math.min(W - 2, x1);
  y0 = Math.max(0, y0); y1 = Math.min(H - 2, y1);
  flip = !flip;
  const fl = w.fluid, ft = w.ftype, bl = w.block;
  for (let y = y1; y >= y0; y--) {
    for (let k = 0; k <= x1 - x0; k++) {
      const x = flip ? x0 + k : x1 - k;
      const i = y * W + x;
      let f = fl[i];
      if (f <= 0) continue;
      const type = ft[i];
      if (isSolid(bl[i])) { fl[i] = 0; ft[i] = 0; continue; }
      if (type === 2 && !lavaTick) continue;
      const visc = type === 2 ? 0.4 : 1;
      // fall
      const j = i + W;
      if (!isSolid(bl[j])) {
        const other = ft[j];
        if (other === 0 || other === type || fl[j] < MIN) {
          const mv = Math.min(f, 1 - fl[j]) * (type === 2 ? 0.6 : 1);
          if (mv > 0.0001) {
            fl[j] += mv; ft[j] = type; f -= mv;
          }
        }
      }
      if (f > MIN) {
        // spread sideways
        for (let s = 0; s < 2; s++) {
          const dx = (s === 0) === flip ? -1 : 1;
          const jj = i + dx;
          if (isSolid(bl[jj])) continue;
          const other = ft[jj];
          if (other !== 0 && other !== type && fl[jj] > MIN) continue;
          const diff = f - fl[jj];
          if (diff > 0.006) {
            const mv = (diff / 3) * visc;
            fl[jj] += mv; ft[jj] = type; f -= mv;
          }
        }
      }
      // over-pressure pushes up
      if (f > 1.02 && y > 0 && !isSolid(bl[i - W]) && (ft[i - W] === 0 || ft[i - W] === type)) {
        const mv = f - 1;
        fl[i - W] += mv; ft[i - W] = type; f -= mv;
      }
      if (f < MIN) { f = 0; ft[i] = 0; }
      fl[i] = f;
    }
  }
  // reactions: lava meeting water hardens into obsidian
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (ft[i] !== 2 || fl[i] < 0.08) continue;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (ft[j] === 1 && fl[j] > 0.08) {
          const strong = fl[i] > 0.35;
          fl[j] = Math.max(0, fl[j] - 0.4);
          if (fl[j] < MIN) ft[j] = 0;
          fl[i] = 0; ft[i] = 0;
          if (onEvent) onEvent(strong ? 'obsidian' : 'steam', x, y);
          break;
        }
      }
    }
}

/** Run many ticks over the whole world (used at generation). */
export function settleFluids(w, ticks) {
  for (let t = 0; t < ticks; t++) stepFluids(w, 1, 0, w.W - 2, w.H - 2, null, true);
  // lava + water that met during settling become obsidian quietly
  for (let i = 0; i < w.W * w.H; i++) if (w.fluid[i] < 0.02) { w.fluid[i] = 0; w.ftype[i] = 0; }
}

/** Fluid level at a cell (0..1) and type. */
export function fluidAt(w, x, y) {
  if (!w.inb(x, y)) return { f: 0, t: 0 };
  const i = w.idx(x, y);
  return { f: w.fluid[i], t: w.ftype[i] };
}

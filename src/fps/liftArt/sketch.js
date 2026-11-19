// The layers you haven't reached are still drawn, but as the cartographer's unfinished sheet: the same
// cross-section traced on warm paper, its outlines half inked in sepia and half left in pencil,
// shadows laid in with diagonal hatching (crossed where it's darkest), a faint wash of the layer's
// colour bleeding in here and there, and the drawing fading out the deeper it goes. When you reach a
// layer, its colour print rolls on over the sketch (liftLayers.js: the ink-in).
import { makeNoise2D, clamp } from '../../core/util.js';
import { Art, PAPER, PAPER2, PAPER3, PENCIL, PENCIL2, SEPIA, SEPIA2, hash, mix, lum } from './kit.js';

/**
 * src: the colour Art (with its id map). o: { seed, ink (0..1: how much of it is inked), fade (0..1:
 * how faded the whole sheet is), wash (colour), region(x, y) → only sketch where true (the rest is
 * left transparent) }. Returns a new Art.
 */
export function sketchOf(src, o = {}) {
  const { w: W, h: H } = src;
  const out = new Art(W, H);
  if (!o.region) out.copy(src); // with a region, only that part is drawn (the rest stays clear)
  const nA = makeNoise2D((o.seed || 1) * 17 + 5), nB = makeNoise2D((o.seed || 1) * 29 + 11);
  const ink = o.ink ?? 0.5, fade = o.fade ?? 0, region = o.region || null;
  // luminance, lightly blurred (shapes, not texture), normalised to the sheet's own range
  const L = new Float32Array(W * H);
  for (let k = 0, i = 0; k < W * H; k++, i += 4) L[k] = (src.d[i] * 0.3 + src.d[i + 1] * 0.59 + src.d[i + 2] * 0.11) / 255;
  const Lb = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; s += L[yy * W + xx]; n++; }
    Lb[y * W + x] = s / n;
  }
  const sorted = Float32Array.from(Lb).sort();
  const lo = sorted[Math.floor(sorted.length * 0.04)], hi = sorted[Math.floor(sorted.length * 0.97)];
  const id = src.id;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (region && !region(x, y)) continue;
    const k = y * W + x;
    // the paper: two broad stains, a few fibres
    const st = nA(x * 0.018, y * 0.022) + nB(x * 0.05, y * 0.05) * 0.4;
    let c = st > 0.5 ? PAPER2 : st < -0.5 ? mix(PAPER, 0xf2e4c4, 0.6) : PAPER;
    if (hash(x, y, 71) < 0.004) c = PAPER3;
    // a faint wash of the layer's colour here and there
    if (o.wash != null && nB(x * 0.012 + 3, y * 0.02) > 0.3 - ink * 0.3) c = mix(c, o.wash, 0.1);
    // how finished this bit of the drawing is: inked, pencil, or just faint construction
    const fin = ink + nA(x * 0.011 + 7, y * 0.016) * 0.7;
    const fog = clamp(fade + (y / H) * 0.35 + nB(x * 0.02, y * 0.015 + 4) * 0.25, 0, 1);
    const shade = clamp(1 - (Lb[k] - lo) / Math.max(0.05, hi - lo), 0, 1);
    const lineC = fin > 0.55 ? SEPIA : fin > 0.15 ? PENCIL : PENCIL2;
    const hatchC = fin > 0.62 ? SEPIA2 : PENCIL2;
    const a = id[k];
    // a hand's hatching: strokes in short runs that skip, more so where the sheet fades
    const seg = hash(Math.floor((x - y) / 6), Math.floor((x + y) / 9), 3) > fog * 0.8 + 0.08;
    const segB = hash(Math.floor((x + y) / 6), Math.floor((x - y) / 9), 4) > fog * 0.9 + 0.15;
    if (a === 1 || (a >= 5 && a <= 8)) {
      // the open: the cave's hollow shaded in (crossed where it's darkest); the core's bright heart left bare
      const lvl = a === 1 ? (shade > 0.62 ? 2 : 1) : [2, 1, 1, 0][a - 5];
      if (lvl >= 1 && ((x + y) & 3) === 0 && seg) c = hatchC;
      if (lvl >= 2 && ((x - y) & 3) === 0 && segB) c = hatchC;
    } else if (a === 2) {
      if (y % 3 === 0 && hash(x >> 2, y, 6) > 0.3 + fog * 0.5) c = PENCIL; // water: level lines
    } else if (a >= 10 && a < 40) {
      // rock is the bare sheet: a dot of stipple in its shadowed parts, a line where one stratum meets the next
      if (shade > 0.78 && hash(x, y, 5) < 0.035 * (1 - fog)) c = PENCIL;
      const up = y > 0 ? id[k - W] : a;
      if (up !== a && up >= 10 && up < 40 && hash(x >> 2, y, 5) > 0.25 + fog * 0.5) c = PENCIL;
    } else if (a >= 40) {
      if (shade > 0.62 && ((x + y) % 3) === 0 && seg) c = hatchC; // things in shade
    }
    // outlines: where the drawing's shapes meet
    const r = x < W - 1 ? id[k + 1] : a, d = y < H - 1 ? id[k + W] : a;
    const rockish = (q) => q >= 10 && q < 40;
    const openish = (q) => q === 1 || (q >= 5 && q <= 8);
    const differs = (q) => q !== a && !(rockish(q) && rockish(a)) && !(openish(q) && openish(a));
    if ((differs(r) || differs(d)) && hash(x >> 1, y >> 1, 9) > fog * 0.85 - 0.05) c = lineC;
    // bright things (lamps, crystals, ore) keep a dot of their own colour, as if dabbed in
    const sc = (src.d[k * 4] << 16) | (src.d[k * 4 + 1] << 8) | src.d[k * 4 + 2];
    if (a >= 60 && a !== 60 && lum(sc) > 0.55 && hash(x, y, 13) < 0.35 * (1 - fog)) c = mix(c, sc, 0.5);
    out.p(x, y, c);
  }
  return out;
}

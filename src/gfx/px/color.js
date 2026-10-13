// Color helpers for the pixel-art generators: HSL conversion, hue-shifted material
// ramps (cool shadows, warm highlights) and small mixing utilities.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function rgbOf(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
export function hexOf(r, g, b) {
  const f = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  return ((f(r) << 16) | (f(g) << 8) | f(b)) >>> 0;
}

export function toHsl(c) {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = clamp01(s); l = clamp01(l);
  if (s === 0) return hexOf(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return hexOf(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}

/** Rotate hue h toward target by at most amt degrees (shortest way). */
export function towardHue(h, target, amt) {
  const d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) <= amt) return target;
  return (h + Math.sign(d) * amt + 360) % 360;
}

export function mix(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return hexOf(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export function mul(c, f) { const A = rgbOf(c); return hexOf(A[0] * f, A[1] * f, A[2] * f); }
/** Perceived luminance 0..1. */
export function lum(c) { const A = rgbOf(c); return (A[0] * 0.3 + A[1] * 0.59 + A[2] * 0.11) / 255; }

/** Shift a color in HSL: dh degrees, saturation * ds, lightness + dl. */
export function adjust(c, dh = 0, ds = 1, dl = 0) {
  const [h, s, l] = toHsl(c);
  return fromHsl(h + dh, s * ds, l + dl);
}

/** Darker, cooler, slightly more saturated version of c (k = lightness multiplier). */
export function deepen(c, k = 0.5, shift = 14) {
  let [h, s, l] = toHsl(c);
  if (s < 0.06) { h = 255; s = 0.12; }
  return fromHsl(towardHue(h, 255, shift), Math.min(1, s * 1.08 + 0.06), l * k);
}
/** Lighter, warmer version of c (t = 0..1 toward near-white). */
export function brighten(c, t = 0.4, shift = 10) {
  let [h, s, l] = toHsl(c);
  if (s < 0.06) { h = 48; s = 0.1; }
  return fromHsl(towardHue(h, 52, shift), s * (1 - t * 0.35), l + (0.97 - l) * t);
}

/**
 * Hue-shifted material ramp. R[0] = specular glint ... R[3] = base ... R[5] = deep shadow,
 * R[6] = selective-outline dark. Also R.o (= R[6]) for template compatibility.
 * opts: cont (contrast), hs (hue-shift multiplier), sat (saturation multiplier),
 *       warm/cool (target hues), glintWhite (how close R[0] gets to white).
 */
export function mat(base, o = {}) {
  const cont = o.cont ?? 1, hs = o.hs ?? 1, satK = o.sat ?? 1;
  const warm = o.warm ?? 50, cool = o.cool ?? 255;
  let [h, s, l] = toHsl(base);
  s *= satK;
  const grey = s < 0.07;
  const hiH = grey ? 45 : h, loH = grey ? 250 : h;
  const hiS = grey ? 0.1 : s, loS = grey ? 0.1 : s;
  const lmax = 0.97;
  const up = (t) => l + (lmax - l) * Math.min(1, t * cont);
  const dn = (t) => l * Math.max(0.04, 1 - t * cont);
  const hsK = grey ? 1 : 0.35 + 0.65 * Math.min(1, s * 1.6);
  const R = [
    fromHsl(towardHue(hiH, warm, 20 * hs * hsK), hiS * 0.55, up(o.glintWhite ?? 0.86)),
    fromHsl(towardHue(hiH, warm, 13 * hs * hsK), hiS * 0.82, up(0.55)),
    fromHsl(towardHue(hiH, warm, 6 * hs * hsK), hiS * 0.94, up(0.26)),
    base,
    fromHsl(towardHue(loH, cool, 9 * hs * hsK), Math.min(1, loS * 1.05 + 0.04), dn(0.24)),
    fromHsl(towardHue(loH, cool, 18 * hs * hsK), Math.min(1, loS * 1.1 + 0.07), dn(0.45)),
    fromHsl(towardHue(loH, cool, 26 * hs * hsK), Math.min(1, loS * 1.05 + 0.12), Math.max(0.07, l * 0.24)),
  ];
  if (o.dark) R[6] = o.dark;
  R.o = R[6];
  R.base = base;
  return R;
}

/** Same as mat() but from explicit [main, hi, lo] triples (item icon specs). */
export function mat3([c, hi, lo], o = {}) {
  const R = mat(c, o);
  if (hi !== undefined) { R[1] = mix(hi, R[1], 0.35); R[0] = mix(hi, 0xffffff, 0.55); }
  if (lo !== undefined) { R[5] = mix(lo, R[5], 0.4); R[4] = mix(R[4], mix(c, lo, 0.5), 0.5); }
  return R;
}

/** Fixed palette used across icons (wood, steel, paper...). */
export const P = {
  ink: 0x2a1a14, inkV: 0x24142a, white: 0xfffbf0, black: 0x120c10,
  wood: 0x9a6a3a, woodL: 0xc8945a, woodD: 0x6a4424, woodDD: 0x3e2614,
  steel: 0x9aa4ae, steelD: 0x5a6068, iron: 0x7a7f88,
  brass: 0xd9a84a, gold: 0xf2c23a, copper: 0xd9773f,
  leather: 0x8a5a32, cloth: 0xc9b48a, paper: 0xf0e2c0, parch: 0xe8d2a2,
  rope: 0xc8a870, red: 0xd9473a, green: 0x5aa84a, blue: 0x4a7ad9,
  leaf: 0x5aa04a, leafD: 0x2f6a3a, soil: 0x5a3c28, stone: 0x8a847e,
};

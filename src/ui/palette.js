// Master 2D palette ("Lamplight Woodcut", wave 20). Every 2D asset draws from these colours, and
// the item-icon renders (src/ui/iconRender.js) are snapped to them.
//
// API (import { … } from './palette.js'):
//   PAL            { name: '#rrggbb' } all ~50 named colours (PAL.ink, PAL.cream, PAL.gold, …)
//   PALETTE        [{ name, hex, rgb:[r,g,b] }] the same list, in order
//   RAMPS          { wood, leather, iron, brass, gold, copper, stone, parchment, moss, flame, ice,
//                    slime, skin, cloth, clothRed, plum, berry, magic } dark → light arrays of hex
//   ramp(name, i?) the ramp array, or its i-th tone (clamped; negative i counts from the light end)
//   rampRGB(name)  the ramp as [[r,g,b], …]
//   snap(rgb)      nearest palette colour as [r,g,b] (OKLab distance, cached LUT); snapHex('#…')
//   snapIndex(r,g,b) index into PALETTE; nearest(hex) → { name, hex, rgb }; palDist(i, j), palL(i)
//   rampOf(hex)    { name, i } of the ramp holding the nearest colour (for shading along a ramp)
//   step(hex, d)   move d tones lighter (+) or darker (-) along that colour's ramp
//   OUTLINE / OUTLINE_LIT / HIGHLIGHT  the shared line colours (dark plum, lit-edge plum, cream)
//   paletteCSS()   ':root{--pal-ink:#…;…}' custom properties, for CSS users
// Shadows fall to plum/indigo, never black; lights go to cream, never white.

const LIST = [
  // plum darks (outline, shadow)
  ['ink', '#1e1424'], ['plum', '#2e1b33'], ['plumMid', '#4a2b4a'], ['plumLt', '#6e4766'], ['mauve', '#94707e'],
  // cool indigo / slate
  ['indigo', '#252a44'], ['slate', '#3a4562'], ['steel', '#5a6a84'], ['mist', '#8a9aae'],
  // cream lights
  ['cream', '#fff0d2'], ['creamDk', '#f2dcae'], ['sand', '#dcbf8a'], ['tan', '#b8945e'],
  // wood
  ['bark', '#3a2318'], ['wood', '#5e3a22'], ['woodMid', '#86552e'], ['woodLt', '#ab7a42'],
  // leather
  ['leatherDk', '#4a2420'], ['leather', '#74382a'], ['leatherLt', '#a0583a'], ['skin', '#cc8e68'],
  // copper
  ['rust', '#7e3a1e'], ['copper', '#b45e30'], ['copperLt', '#de8a52'], ['peach', '#f2b47e'],
  // brass / gold
  ['umber', '#5a3c16'], ['brass', '#8e6a24'], ['gold', '#c8962a'], ['goldLt', '#ecc650'], ['goldPale', '#f8e49a'],
  // warm stone / iron greys
  ['stoneDk', '#3a3438'], ['stone', '#575056'], ['stoneMid', '#7a7174'], ['stoneLt', '#a2989a'], ['stonePale', '#c9bfbb'],
  // moss / leaf
  ['mossDk', '#22311f'], ['moss', '#3c5a2a'], ['mossMid', '#5e8236'], ['leaf', '#8cac48'], ['lime', '#c2d872'],
  // slime
  ['slimeDk', '#2f6e3e'], ['slime', '#56a24a'],
  // flame / red
  ['wine', '#5e1824'], ['red', '#9a2c2a'], ['flame', '#d4561e'], ['flameLt', '#f28e2e'], ['rose', '#d4788a'],
  // ice / water
  ['deepSea', '#1f3a52'], ['sea', '#2f6a86'], ['ice', '#5ea6b8'], ['frost', '#a6dcd8'],
  // magic
  ['violet', '#5a3c88'], ['lilac', '#9478c0'],
];

export const PAL = Object.fromEntries(LIST);
const toRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const PALETTE = LIST.map(([name, hex]) => ({ name, hex, rgb: toRGB(hex) }));

const R = (...names) => names.map((n) => PAL[n]);
export const RAMPS = {
  plum: R('ink', 'plum', 'plumMid', 'plumLt', 'mauve'),
  wood: R('bark', 'wood', 'woodMid', 'woodLt', 'tan'),
  leather: R('plum', 'leatherDk', 'leather', 'leatherLt', 'skin'),
  iron: R('indigo', 'stoneDk', 'stone', 'stoneMid', 'stoneLt', 'stonePale'),
  brass: R('umber', 'brass', 'gold', 'goldLt'),
  gold: R('umber', 'brass', 'gold', 'goldLt', 'goldPale'),
  copper: R('leatherDk', 'rust', 'copper', 'copperLt', 'peach'),
  stone: R('plum', 'stoneDk', 'stone', 'stoneMid', 'stoneLt'),
  parchment: R('tan', 'sand', 'creamDk', 'cream'),
  moss: R('mossDk', 'moss', 'mossMid', 'leaf', 'lime'),
  flame: R('wine', 'red', 'flame', 'flameLt', 'goldLt'),
  ice: R('indigo', 'deepSea', 'sea', 'ice', 'frost'),
  slime: R('mossDk', 'slimeDk', 'slime', 'leaf', 'lime'),
  skin: R('leather', 'leatherLt', 'skin', 'peach', 'creamDk'),
  cloth: R('indigo', 'slate', 'steel', 'mist'),
  clothRed: R('plum', 'wine', 'red', 'rose'),
  berry: R('plum', 'wine', 'plumMid', 'rose'),
  magic: R('plum', 'violet', 'lilac', 'frost'),
};

export const OUTLINE = PAL.ink;        // 1px dark-plum outline
export const OUTLINE_LIT = PAL.plumLt; // the outline where the light hits (top-left edges)
export const HIGHLIGHT = PAL.cream;    // hand-placed glint pixels

export function ramp(name, i) {
  const r = RAMPS[name] || RAMPS.stone;
  if (i == null) return r;
  const k = i < 0 ? r.length + i : i;
  return r[Math.max(0, Math.min(r.length - 1, k))];
}
export const rampRGB = (name) => ramp(name).map(toRGB);

// --- nearest colour in OKLab -------------------------------------------------------------------
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
function oklab(r, g, b) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817104123 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const LAB = PALETTE.map((p) => oklab(...p.rgb));
/** OKLab distance² between two palette indices (for merging colours). */
export const palDist = (i, j) => { const a = LAB[i], b = LAB[j]; return (a[0] - b[0]) ** 2 + 1.4 * ((a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2); };
/** OKLab lightness (0..1) of a palette index. */
export const palL = (i) => LAB[i][0];
const LUT = new Int16Array(32 * 32 * 32).fill(-1); // 5 bits per channel

export function snapIndex(r, g, b) {
  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  const hit = LUT[key];
  if (hit >= 0) return hit;
  const [L, A, B] = oklab((r & 248) | 4, (g & 248) | 4, (b & 248) | 4);
  let best = 0, bd = 1e9;
  for (let i = 0; i < LAB.length; i++) {
    const p = LAB[i];
    // chroma weighted a little up so hues stay put (a brown never snaps to a grey of equal L)
    const d = (L - p[0]) ** 2 + 1.4 * ((A - p[1]) ** 2 + (B - p[2]) ** 2);
    if (d < bd) { bd = d; best = i; }
  }
  LUT[key] = best;
  return best;
}
export const snap = (rgb) => PALETTE[snapIndex(rgb[0], rgb[1], rgb[2])].rgb;
export const nearest = (hex) => PALETTE[snapIndex(...toRGB(hex))];
export const snapHex = (hex) => nearest(hex).hex;

const RAMP_OF = {};
for (const [name, r] of Object.entries(RAMPS)) r.forEach((h, i) => { if (!(h in RAMP_OF)) RAMP_OF[h] = { name, i }; });
export function rampOf(hex) {
  const h = nearest(hex).hex;
  return RAMP_OF[h] || { name: 'stone', i: 2 };
}
export function step(hex, d) {
  const { name, i } = rampOf(hex);
  return ramp(name, Math.max(0, Math.min(RAMPS[name].length - 1, i + d)));
}

export function paletteCSS() {
  return ':root{' + PALETTE.map((p) => `--pal-${p.name}:${p.hex};`).join('') + '}';
}

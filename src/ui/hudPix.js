// The HUD's hand-drawn pixel maps (wave 20, "one consistent 2D style"): every HUD sprite is a string
// grid, one character a pixel, read through ONE legend of the master palette (src/ui/palette.js), so
// the same letter is the same colour in every map. One canvas pixel = one art pixel = one --px on
// screen (scaled whole by CSS, image-rendering: pixelated). Code here only paints, mirrors, recolours
// and slices these maps; nothing is generated (no noise, no gradients, no glow).
//
//   pix(key, rows, extra?)      a cached data URL of the map ('.' and ' ' stay clear)
//   pixPx(rows, extra?)         the map painted into a Px raster (to stamp or animate further)
//   paint(p, rows, ox, oy, extra?)  paint a map into an existing raster
//   recolor(rows, { from: to }) swap letters (one map, several dyes: seals, charms, frames lit/unlit)
//   hex(ch) / rgb(ch)           a legend letter's colour
//   hudVar(node, name, url)     publish an art URL as a CSS custom property
import { Px, art, cssUrl } from './uiArt.js';
import { PAL } from './palette.js';

/**
 * The legend. Ramps read dark → light; capitals are usually the lighter tone of a pair.
 *  outline & plum   K ink (the 1px outline) · P plum · p plumMid · q plumLt (the lit outline) · m mauve
 *  wood             1 bark · 2 wood · 3 woodMid · 4 woodLt
 *  paper            T tan · S sand · c creamDk · C cream (highlights, never white)
 *  leather          L leatherDk · l leather · t leatherLt · k skin
 *  brass & gold     u umber · b brass · g gold · G goldLt · Y goldPale
 *  copper           x rust · X copper · y copperLt · Q peach
 *  iron & stone     d stoneDk · n stone · N stoneMid · o stoneLt · O stonePale
 *  cool             i indigo · s slate · e steel · E mist
 *  moss             M mossDk · v moss · V mossMid · f leaf · F lime
 *  red              w wine · r red · h flame · H flameLt · R rose
 *  water            z deepSea · Z sea · a ice · A frost · j slimeDk · J slime
 *  magic            U violet · W lilac
 */
export const LEGEND = {
  K: 'ink', P: 'plum', p: 'plumMid', q: 'plumLt', m: 'mauve',
  1: 'bark', 2: 'wood', 3: 'woodMid', 4: 'woodLt',
  T: 'tan', S: 'sand', c: 'creamDk', C: 'cream',
  L: 'leatherDk', l: 'leather', t: 'leatherLt', k: 'skin',
  u: 'umber', b: 'brass', g: 'gold', G: 'goldLt', Y: 'goldPale',
  x: 'rust', X: 'copper', y: 'copperLt', Q: 'peach',
  d: 'stoneDk', n: 'stone', N: 'stoneMid', o: 'stoneLt', O: 'stonePale',
  i: 'indigo', s: 'slate', e: 'steel', E: 'mist',
  M: 'mossDk', v: 'moss', V: 'mossMid', f: 'leaf', F: 'lime',
  w: 'wine', r: 'red', h: 'flame', H: 'flameLt', R: 'rose',
  z: 'deepSea', Z: 'sea', a: 'ice', A: 'frost', j: 'slimeDk', J: 'slime',
  U: 'violet', W: 'lilac',
};
const toInt = (h) => parseInt(h.slice(1), 16);
const COLOR = Object.fromEntries(Object.entries(LEGEND).map(([ch, name]) => [ch, toInt(PAL[name])]));
/** A legend letter's colour as 0xRRGGBB (undefined for clear). */
export const hex = (ch) => COLOR[ch];
/** A legend letter's colour as '#rrggbb'. */
export const css = (ch) => PAL[LEGEND[ch]];

/** Paint a map into a raster at (ox, oy). extra: { letter: 0xRRGGBB | null } overrides. */
export function paint(p, rows, ox = 0, oy = 0, extra) {
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      if (ch === '.' || ch === ' ') continue;
      const c = extra && ch in extra ? extra[ch] : COLOR[ch];
      if (c !== undefined && c !== null) p.set(ox + x, oy + y, c);
    }
  }
  return p;
}
const width = (rows) => rows.reduce((w, r) => Math.max(w, r.length), 0);
/** A map painted into a new raster, at one fine pixel per art pixel. */
export function pixPx(rows, extra) {
  const p = new Px(width(rows), rows.length, 1);
  return paint(p, rows, 0, 0, extra);
}
/** A cached data URL of a map (drawn once). */
export const pix = (key, rows, extra) => art('hp:' + key, () => pixPx(typeof rows === 'function' ? rows() : rows, extra), { res: 1, refine: false });
/** Swap letters in a map: recolor(rows, { g: 'w', G: 'r' }). */
export const recolor = (rows, map) => rows.map((r) => r.replace(/./g, (ch) => (ch in map ? map[ch] : ch)));
/** A map mirrored left ↔ right (a matching part on the other side). */
export const mirror = (rows) => rows.map((r) => r.split('').reverse().join(''));
/** Layer maps: later ones paint over earlier ones ('.' lets the one under show). */
export function stack(...layers) {
  const H = Math.max(...layers.map((l) => l.rows.length + (l.y || 0)));
  const W = Math.max(...layers.map((l) => width(l.rows) + (l.x || 0)));
  const out = Array.from({ length: H }, () => Array(W).fill('.'));
  for (const { rows, x = 0, y = 0 } of layers)
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.' && r[i] !== ' ') out[y + j][x + i] = r[i]; });
  return out.map((r) => r.join(''));
}
/** Publish an art URL as a CSS custom property on a node. */
export const hudVar = (node, name, url) => { if (url) node.style.setProperty(name, cssUrl(url)); };

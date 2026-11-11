// The finishing pass for interface art drawn at a higher resolution (src/ui/px.js, r = 2): what
// a hand-pixeller does when the canvas doubles. Runs once per asset as uiArt's art() caches it.
//  1. Contours: every diagonal stair-step of the art grid gets its half-pixel corner (Scale2x rule),
//     so curves of seals, tacks, rims and tears read smoother while straight edges stay crisp and
//     dithers stay as they are.
//  2. Material: art pixels that are still flat blocks (the fine-painted textures of craftArt already
//     carry their own) get a little of their material at half-pixel size: wood grain streaks along
//     the board, leather pores, hammer dents and glints on brass and iron, paper fibres, grit in
//     slate and stone, a gloss on wax. Only inside surfaces (3+ neighbours of the same material), so
//     outlines, stitches, ink lines and lettering stay clean.
// o.edges === false or o.detail === false turns a step off for an asset; o.brown: 'leather' | 'wood' |
// 'brass' | 'none'... names what the asset's browns are (default: palette lookup, else wood).

const NONE = 0, WOOD = 1, LEATHER = 2, BRASS = 3, STEEL = 4, PAPER = 5, STONE = 6, SLATE = 7, WAX = 8, CLOTH = 9;
const MAT_NAMES = { none: 15, wood: WOOD, leather: LEATHER, brass: BRASS, steel: STEEL, paper: PAPER, stone: STONE, slate: SLATE, wax: WAX, cloth: CLOTH };

// browns that are leather (the uiArt / craftArt / hud leather ramps); every other brown is wood
const LEATHER_TONES = new Set([
  0xa87444, 0x8c5a32, 0x704628, 0x56341b, 0x3f2412,
  0x22130a, 0x2e1a0c, 0x3f2412, 0x4c2c16, 0x56341b, 0x623c20, 0x704628, 0x7e5030, 0x8c5a32, 0x9a6638, 0xa87444,
  0x1c0806, 0x2e0e0a, 0x3e140e, 0x4e1a12, 0x5e2016, 0x6c261a, 0x7a2e1e, 0x8a3624, 0x9a422c, 0xac5034,
  0x4a2a14, 0x683c1c, 0x865026, 0xa26432, 0xb87840, 0xcc8c50, 0xdaa064, 0xe6b47c, 0xf0c896,
]);
const CANVAS_TONES = new Set([0xdcc69c, 0xcfb789, 0xbca277, 0x9c8258, 0xd8ccb0, 0xc4b694, 0xa8987a, 0x6e5e44, 0x86765a, 0x9c8c6e, 0xb2a282, 0xc6b896, 0xd6caaa, 0xe4dabe, 0xf0e8d2]);

const hsv = (c) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
  let h = 0;
  if (dl) h = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
  return [(h * 60 + 360) % 360, mx ? dl / mx : 0, mx / 255];
};
const memo = new Map();
function matOf(c, brown) {
  const k = c * 16 + brown;
  let m = memo.get(k);
  if (m !== undefined) return m;
  const [h, s, v] = hsv(c);
  m = NONE;
  if (v < 0.14) m = NONE; // ink, outlines, gaps
  else if (CANVAS_TONES.has(c)) m = CLOTH;
  else if ((h < 13 || h > 335) && s > 0.55 && !LEATHER_TONES.has(c)) m = WAX;
  else if (LEATHER_TONES.has(c)) m = brown === 15 ? NONE : brown || LEATHER;
  else if (s < 0.13) m = v > 0.5 ? STEEL : STONE;
  else if (h >= 36 && h <= 62 && s > 0.4 && v > 0.48) m = BRASS;
  else if (h >= 18 && h < 62 && s < 0.45 && v > 0.6) m = PAPER;
  else if (h >= 6 && h < 48 && v <= 0.82) m = brown === 15 ? NONE : brown || WOOD;
  else if ((h < 10 || h > 335) && s > 0.45) m = WAX;
  else if (h >= 70 && h < 200 && s < 0.4 && v < 0.5) m = SLATE;
  memo.set(k, m);
  return m;
}

const mixC = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  return (Math.round(ar + (((b >> 16) & 255) - ar) * t) << 16) | (Math.round(ag + (((b >> 8) & 255) - ag) * t) << 8) | Math.round(ab + ((b & 255) - ab) * t);
};
const dark = (c, t) => mixC(c, (((c >> 16) & 255) * 0.42) << 16 | (((c >> 8) & 255) * 0.36) << 8 | ((c & 255) * 0.32), t);
const light = (c, t) => mixC(c, 0xfff6e0, t);
const lum = (c) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const hash = (x, y, s) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Finish a raster drawn at r = 2 (see the header). */
export function refine(p, o = {}) {
  if (p.r !== 2) return p;
  const W = p.w, H = p.h, d = p.d, FW = p.fw;
  const seed = typeof o.seed === 'string' ? hashStr(o.seed) & 0xffff : (o.seed ?? 1);
  const brown = MAT_NAMES[o.brown] || 0;
  // art-level snapshot: key per pixel (alpha in the top byte; transparent = 0; textured block = -1)
  const K = new Float64Array(W * H), C = new Int32Array(W * H), flat = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = p._i(x, y), a = d[i + 3], j = y * W + x;
      C[j] = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      flat[j] = p.flat(x, y) ? 1 : 0;
      K[j] = !flat[j] ? -1 : a ? a * 16777216 + C[j] : 0;
    }
  const key = (x, y, def) => (x < 0 || y < 0 || x >= W || y >= H ? def : K[y * W + x]);
  const put = (fx, fy, c, a = 255) => { const i = (fy * FW + fx) * 4; d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = a; };
  const putK = (fx, fy, k) => { if (k === 0) { d[(fy * FW + fx) * 4 + 3] = 0; return; } put(fx, fy, k % 16777216, Math.floor(k / 16777216)); };
  const touched = new Uint8Array(W * H);

  // 1. contours
  if (o.edges !== false)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const E = K[y * W + x];
        if (E < 0) continue;
        const B = key(x, y - 1, E), D = key(x - 1, y, E), F = key(x + 1, y, E), Hh = key(x, y + 1, E);
        if (B < 0 || D < 0 || F < 0 || Hh < 0 || B === Hh || D === F) continue;
        const fx = x * 2, fy = y * 2;
        let t = 0;
        if (D === B && D !== E) { putK(fx, fy, D); t = 1; }
        if (B === F && F !== E) { putK(fx + 1, fy, F); t = 1; }
        if (D === Hh && D !== E) { putK(fx, fy + 1, D); t = 1; }
        if (Hh === F && F !== E) { putK(fx + 1, fy + 1, F); t = 1; }
        touched[y * W + x] = t;
      }

  // 2. material
  if (o.detail === false) return p;
  const amt = o.amount ?? 1;
  const M = new Uint8Array(W * H);
  for (let j = 0; j < W * H; j++) M[j] = K[j] > 0 && K[j] >= 255 * 16777216 ? matOf(C[j], brown) : NONE;
  const mAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? NONE : M[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const j = y * W + x, m = M[j];
      if (!m || touched[j] || !flat[j]) continue;
      const same = (mAt(x - 1, y) === m) + (mAt(x + 1, y) === m) + (mAt(x, y - 1) === m) + (mAt(x, y + 1) === m);
      if (same < 3) continue;
      const c = C[j], fx = x * 2, fy = y * 2, h = hash(x, y, seed);
      const set = (i, k, col) => put(fx + i, fy + k, col);
      switch (m) {
        case WOOD: {
          // grain runs the way the colour changes least
          const L = lum(c), cl = (xx, yy) => (mAt(xx, yy) === m ? Math.abs(lum(C[yy * W + xx]) - L) : 40);
          const horiz = cl(x - 1, y) + cl(x + 1, y) <= cl(x, y - 1) + cl(x, y + 1);
          const along = horiz ? x : y, across = horiz ? y : x;
          const g = hash(across, Math.floor((along + Math.floor(hash(across, 7, seed) * 5)) / 4), seed + 1);
          if (g < 0.3 * amt) { const col = dark(c, 0.3); if (horiz) { set(0, 1, col); set(1, 1, col); } else { set(1, 0, col); set(1, 1, col); } }
          else if (g < 0.4 * amt) { const col = light(c, 0.14); if (horiz) { set(0, 0, col); set(1, 0, col); } else { set(0, 0, col); set(0, 1, col); } }
          else if (h < 0.035 * amt) set(1, 1, dark(c, 0.55)); // a pore
          break;
        }
        case LEATHER:
          if (h < 0.24 * amt) { set(1, 1, dark(c, 0.32)); if (h < 0.09 * amt) set(0, 0, light(c, 0.16)); }
          break;
        case BRASS: case STEEL: {
          const v = lum(c) / 255;
          if (h < 0.1 * amt) { set(0, 0, dark(c, 0.26)); set(1, 1, light(c, 0.3)); } // a hammer dent
          else if (v > 0.72 && h < 0.17 * amt) set(0, 0, light(c, 0.65)); // a glint
          else if (m === STEEL && h > 1 - 0.06 * amt) { set(0, 0, light(c, 0.22)); set(1, 0, light(c, 0.22)); } // a scratch
          break;
        }
        case PAPER: {
          if (h < 0.11 * amt) {
            const col = dark(c, 0.11), k = Math.floor(hash(x, y, seed + 2) * 3);
            if (k === 0) { set(0, 0, col); set(1, 0, col); } else if (k === 1) { set(0, 0, col); set(0, 1, col); } else { set(0, 0, col); set(1, 1, col); }
          } else if (h < 0.15 * amt) set(1, 0, light(c, 0.3));
          else if (h > 1 - 0.012 * amt) set(1, 1, mixC(c, 0xb07a46, 0.35)); // a speck of foxing
          break;
        }
        case CLOTH:
          set(0, 0, light(c, 0.07)); set(1, 1, dark(c, 0.08));
          break;
        case STONE: case SLATE:
          if (h < 0.22 * amt) set(Math.floor(h * 9) & 1, Math.floor(h * 17) & 1, h < 0.09 ? light(c, 0.16) : dark(c, 0.22));
          break;
        case WAX:
          if (lum(c) > 110 && h < 0.16 * amt) set(0, 0, light(c, 0.3));
          break;
        default:
      }
    }
  return p;
}

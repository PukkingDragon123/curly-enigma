// Woodcut prints for the quest posters (src/ui/questPoster.js): the house "Lamplight Woodcut" look
// in 2D. A picture is carved as a tone map on the fine grid (2 fine pixels per art pixel), then
// printed onto the poster's paper in plum-black ink plus one accent ink:
//  - tones: paper (cut away), light hatch, dense hatch, solid ink, accent solid, accent hatch;
//    hatching runs along the form (per shape: / \ - |), lit from the top left;
//  - outlines are carved: solid two fine pixels on the shadow side, one and broken on the lit side;
//    a paper halo cuts the subject free of the background (carved lines, rays, rock strata...);
//  - the print shows the block: wood grain streaks in big inks, gouge chatter, worn spots, the
//    accent plate a fine pixel out of register, the block's chipped frame.
// Shapes are lopsided on purpose: blobs wobble, polygons are hand-placed.
//   const b = new Block(36, 26); MOTIFS.ore(b, ctx); b.print(px, x, y, { ink, acc, bg })
import { hash } from './craftArt.js';

export const T = { BG: 0, PAPER: 1, LIGHT: 2, DENSE: 3, INK: 4, ACC: 5, ACCL: 6, CUT: 7 };
const { BG, PAPER, LIGHT, DENSE, INK, ACC, ACCL, CUT } = T;
const DIRS = { '/': 0, '\\': 1, '-': 2, '|': 3 };
const TAU = Math.PI * 2;

/** Smooth value noise (not periodic), 0..1. */
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, f = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return (a + (b - a) * f(u)) * (1 - f(v)) + (c + (d - c) * f(u)) * f(v);
}
function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
  return [Math.hypot(x - ax - dx * t, y - ay - dy * t), t];
}
const bbox = (pts, pad = 0) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
};

/** Points along an elliptical arc (for domes and caps drawn as polygons). */
export function arc(cx, cy, rx, ry, a0, a1, n = 14, wob = 0, seed = 1) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, k = 1 + (wob ? (hash(i, 3, seed) - 0.5) * wob : 0);
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}

export class Block {
  constructor(w, h, r = 2, seed = 1) {
    this.w = w; this.h = h; this.r = r; this.seed = seed;
    this.fw = w * r; this.fh = h * r;
    const n = this.fw * this.fh;
    this.T = new Uint8Array(n); // tone
    this.I = new Uint16Array(n); // shape id (0: none)
    this.D = new Uint8Array(n); // hatch direction
    this.n = 0;
  }

  /** Fill every fine pixel inside(X, Y) (art coordinates of its centre) with tone (or tone(X, Y)). */
  shape(box, inside, tone, o = {}) {
    const r = this.r, id = o.same ? Math.max(1, this.n) : ++this.n, dir = DIRS[o.dir ?? '/'] ?? 0;
    const fx0 = Math.max(0, Math.floor(box[0] * r)), fy0 = Math.max(0, Math.floor(box[1] * r));
    const fx1 = Math.min(this.fw, Math.ceil(box[2] * r)), fy1 = Math.min(this.fh, Math.ceil(box[3] * r));
    for (let fy = fy0; fy < fy1; fy++)
      for (let fx = fx0; fx < fx1; fx++) {
        const X = (fx + 0.5) / r, Y = (fy + 0.5) / r;
        if (!inside(X, Y)) continue;
        const t = typeof tone === 'function' ? tone(X, Y) : tone;
        if (t === null || t === undefined) continue;
        const i = fy * this.fw + fx;
        this.T[i] = t; this.I[i] = t === CUT ? 0 : id; this.D[i] = dir;
      }
    return id;
  }
  poly(pts, tone, o) { return this.shape(bbox(pts, 1), (x, y) => inPoly(pts, x, y), tone, o); }
  /** A lopsided ellipse: its radius wobbles with the angle (o.wob, o.rot radians, o.seed). */
  blob(cx, cy, rx, ry, tone, o = {}) {
    const wob = o.wob ?? 0.08, rot = o.rot || 0, s = (o.seed ?? this.n * 7 + 3) + this.seed;
    const p1 = hash(s, 1, 9) * TAU, p2 = hash(s, 2, 9) * TAU, p3 = hash(s, 3, 9) * TAU;
    const cr = Math.cos(-rot), sr = Math.sin(-rot), m = Math.max(rx, ry) * (1 + wob) + 1;
    return this.shape([cx - m, cy - m, cx + m, cy + m], (x, y) => {
      const dx = x - cx, dy = y - cy, u = (dx * cr - dy * sr) / rx, v = (dx * sr + dy * cr) / ry, a = Math.atan2(v, u);
      const k = 1 + wob * (Math.sin(2 * a + p1) * 0.5 + Math.sin(3 * a + p2) * 0.35 + Math.sin(5 * a + p3) * 0.2);
      return u * u + v * v <= k * k;
    }, tone, o);
  }
  /** A thick line along points; width w (or w → w1 tapering along it). */
  stroke(pts, w, tone, o = {}) {
    const w1 = o.w1 ?? w, segs = [];
    let tot = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push([pts[i - 1], pts[i], tot, l]); tot += l; }
    return this.shape(bbox(pts, Math.max(w, w1)), (x, y) => {
      for (const [a, b, at, l] of segs) {
        const [d, t] = segDist(x, y, a[0], a[1], b[0], b[1]);
        const k = tot ? (at + t * l) / tot : 0;
        if (d <= (w + (w1 - w) * k) / 2) return true;
      }
      return false;
    }, tone, o);
  }
  rect(x, y, w, h, tone, o) { return this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], tone, o); }

  /**
   * Lighting for a form centred (cx, cy) with half-sizes (rx, ry): a tone function that steps from
   * paper (lit, top left) through light and dense hatch to ink, the band edges wobbling as if
   * carved. o.shift brightens (+) or darkens (-); o.tones: the four tones; o.bands: thresholds.
   */
  lit(cx, cy, rx, ry, o = {}) {
    const b = o.bands ?? [0.6, 0.18, -0.3], sh = o.shift ?? 0, tn = o.tones ?? [PAPER, LIGHT, DENSE, INK], s = this.seed + (o.seed ?? 0);
    const lx = o.light?.[0] ?? -0.6, ly = o.light?.[1] ?? -0.8;
    return (X, Y) => {
      const u = (X - cx) / rx, v = (Y - cy) / ry;
      const l = u * lx + v * ly + sh + (vnoise(X * 0.8, Y * 0.8, s) - 0.5) * 0.3;
      return l >= b[0] ? tn[0] : l >= b[1] ? tn[1] : l >= b[2] ? tn[2] : tn[3];
    };
  }
  /** Accent-ink lighting: paper glint, accent hatch, accent, ink. */
  litAcc(cx, cy, rx, ry, o = {}) { return this.lit(cx, cy, rx, ry, { bands: [0.75, 0.15, -0.65], tones: [PAPER, ACCL, ACC, INK], ...o }); }

  /** A curved bar (a pick's head, a crossguard): along +p for ±L, bowed toward d, tapering at the tips. */
  bar(c, p, d, L, bow, w, tone, o = {}) {
    const top = [], bot = [], n = 16;
    for (let i = 0; i <= n; i++) {
      const t = -1 + (2 * i) / n, ww = w * (1 - Math.abs(t) ** (o.taper ?? 1.6)) + (o.tip ?? 0.35);
      const x = c[0] + p[0] * L * t + d[0] * bow * (1 - t * t), y = c[1] + p[1] * L * t + d[1] * bow * (1 - t * t);
      top.push([x + d[0] * ww / 2, y + d[1] * ww / 2]); bot.push([x - d[0] * ww / 2, y - d[1] * ww / 2]);
    }
    return this.poly([...top, ...bot.reverse()], tone, o);
  }

  // ------------------------------------------------------------ printing
  /**
   * Print onto a Px (r must match) at art offset (ox, oy). o: { ink, acc, bg: 'lines' | 'vlines' |
   * 'rays' | 'strata' | 'dark' | 'plain', center: [x, y] (rays), frame (true), seed, acc2 }.
   */
  print(p, ox, oy, o = {}) {
    const W = this.fw, H = this.fh, r = this.r, s = (o.seed ?? 1) + this.seed;
    const ink = o.ink ?? 0x2e1a28, acc = o.acc ?? 0xa8321e, bg = o.bg ?? 'lines', Tn = this.T, I = this.I, D = this.D;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x);
    // the halo: background within two fine pixels of the subject stays paper
    const halo = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!I[y * W + x]) continue;
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > 4) continue;
            const j = at(x + dx, y + dy);
            if (j >= 0 && !I[j]) halo[j] = 1;
          }
      }
    const cx = (o.center?.[0] ?? this.w / 2) * r, cy = (o.center?.[1] ?? this.h / 2) * r;
    const hatch = (x, y, d, per, on) => {
      const u = d === 0 ? x + y : d === 1 ? x - y + 4000 : d === 2 ? y : x;
      // the line breaks now and then, like a gouge lifting
      const line = Math.floor(u / per), along = d === 2 ? x : d === 3 ? y : x - y;
      if (hash(line, Math.floor(along / 7), s + 5) < 0.07) return false;
      return (u % per) < on;
    };
    // the background is cut in a second, paler block (a tone plate), quieter toward the subject
    const bgInk = (x, y) => {
      const X = x / r, Y = y / r;
      if (bg === 'plain') return hash(x, y, s + 9) < 0.012;
      if (bg === 'dark') return !(hash(x >> 2, y, s + 11) < 0.05 || hash(x, y, s + 12) < 0.02);
      if (bg === 'lines' || bg === 'vlines') {
        const a = bg === 'lines' ? y : x, b = bg === 'lines' ? x : y, n = bg === 'lines' ? H : W;
        const e = Math.abs(a / n - 0.5) * 2; // 0 middle .. 1 edge: the lines thicken toward the edges
        const wv = Math.round(Math.sin(b * 0.19 + a * 0.07 + s) * 0.8);
        const on = e > 0.8 ? 2 : 1;
        if (hash(b >> 3, a, s + 13) < (e < 0.3 ? 0.5 : 0.06)) return false;
        return ((a + wv) % 4 + 4) % 4 < on;
      }
      if (bg === 'rays') {
        const dx = x - cx, dy = y - cy, dd = Math.hypot(dx, dy) / r;
        if (dd < 4) return false;
        const f = ((Math.atan2(dy, dx) / TAU + 1) * 24 + vnoise(dd * 0.3, 1, s) * 0.3) % 1;
        return f < Math.min(0.42, 0.06 + dd * 0.018);
      }
      if (bg === 'strata') {
        const yy = Y + Math.sin(X * 0.33 + s) * 1.2 + Math.sin(X * 0.9 + s * 2) * 0.35, L = Math.floor(yy / 4.4), f = yy / 4.4 - L;
        if (f < 0.12) return true; // the bed's dark seam
        const k = ((L % 3) + 3) % 3;
        if (k === 0) return hatch(x, y, 2, 4, 1);
        if (k === 1) return hatch(x, y, 1, 5, 1);
        return hash(x, y, s + L) < 0.12;
      }
      return false;
    };
    const put = (x, y, c, a) => p.fset(ox * r + x, oy * r + y, c, a);
    // wood grain shows in the big inks, worn spots let the paper through
    const wear = (x, y) => (hash((x + y * 13) >> 2, y, s + 21) < 0.05 ? 196 : hash(x, y, s + 22) < 0.04 ? 200 : 246);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x, t = Tn[i], id = I[i], d = D[i];
        // the carved outline
        if (id && t !== INK) {
          let edge = false;
          for (const [dx, dy, lit] of [[1, 0, 0], [0, 1, 0], [2, 0, 0], [0, 2, 0], [-1, 0, 1], [0, -1, 1]]) {
            const j = at(x + dx, y + dy);
            if (j < 0) continue;
            const nid = I[j];
            if (nid === id) continue;
            if (!nid) {
              if (lit) { if (hash(x >> 1, y >> 1, s + 31) < 0.55) { edge = true; break; } } else { edge = true; break; }
            } else if (Math.abs(dx) + Math.abs(dy) === 1 && nid < id && Tn[j] !== INK && hash(x, y, s + 32) > 0.08) { edge = true; break; }
          }
          if (edge) { put(x, y, ink, wear(x, y)); continue; }
        }
        if (t === BG) { if (!halo[i] && bgInk(x, y)) put(x, y, ink, Math.round(wear(x, y) * (o.tone ?? 0.5))); continue; }
        if (t === PAPER || t === CUT) continue;
        if (t === LIGHT) { if (hatch(x, y, d, 4, 1)) put(x, y, ink, wear(x, y)); continue; }
        if (t === DENSE) { if (hatch(x, y, d, 3, 2)) put(x, y, ink, wear(x, y)); continue; }
        if (t === INK) { if (hash(x >> 1, y, s + 41) > 0.03) put(x, y, ink, wear(x, y)); continue; }
        // the accent plate, a fine pixel out of register
        if (t === ACC) { put(x + 1, y, acc, 236); continue; }
        if (t === ACCL) { if (hatch(x, y, d, 3, 1)) put(x + 1, y, acc, 230); }
      }
    // the block's frame: a chipped ink border
    if (o.frame !== false)
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const e = Math.min(x, y, W - 1 - x, H - 1 - y);
          if (e === 0 || (e === 1 && hash(x, y, s + 51) > 0.12) || (e === 2 && hash(x >> 1, y >> 1, s + 52) < 0.1)) put(x, y, ink, wear(x, y));
        }
  }
}

// ---------------------------------------------------------------- the pictures (36×26 art px)
const PIC_W = 36, PIC_H = 26;
export { PIC_W, PIC_H };

/** Small helpers the pictures share. */
const ground = (b, y = 23, tone = INK) => b.poly([[-1, y + 0.6], [7, y - 0.2], [15, y + 0.4], [24, y - 0.3], [37, y + 0.5], [37, 27], [-1, 27]], tone, { dir: '-' });
const sparkle = (b, x, y, k = 1.6, tone = PAPER) => { b.stroke([[x - k, y], [x + k, y]], 0.5, tone, { same: true }); b.stroke([[x, y - k], [x, y + k]], 0.5, tone, { same: true }); };

export const MOTIFS = {
  /** Old Star: a battered helmet, round spectacles, white brows, the pink star of a nose. Bold masses. */
  star(b) {
    // the coat, the turned-up collar, the satchel strap
    b.poly([[1, 27], [4, 21.4], [10, 19], [26, 19], [32, 21.4], [35, 27]], INK);
    b.poly([[10.2, 18.6], [15, 22.4], [16.6, 27], [10.4, 27], [7.6, 21.4]], b.lit(12, 22, 4, 5, { shift: 0.35 }), { dir: '\\' });
    b.poly([[25.8, 18.6], [21, 22.4], [19.4, 27], [25.6, 27], [28.4, 21.4]], DENSE, { dir: '/' });
    b.stroke([[6.4, 22.6], [12, 27.4]], 1.3, LIGHT, { dir: '|' });
    // the head: dark fur in vertical strokes, ragged cheeks
    b.poly([[8.4, 12.6], [6.4, 14.2], [7.8, 15], [6.6, 16.8], [8.6, 17.2], [8.4, 18.8], [27.6, 18.8], [27.4, 17.2], [29.4, 16.8], [28.2, 15], [29.6, 14.2], [27.6, 12.6]], DENSE, { dir: '|' });
    b.blob(18, 14, 9.6, 7.2, b.lit(18, 14, 9.6, 7.2, { shift: -0.5, bands: [0.7, 0.15, -0.25] }), { dir: '|', wob: 0.05 });
    // the helmet: an iron dome, a lit streak, the brim, the dim lamp
    b.poly(arc(18, 8.8, 9, 7.8, Math.PI, TAU, 16, 0.05, 7), b.lit(15, 4, 9, 6, { shift: -0.1, bands: [0.75, 0.35, 0] }), { dir: '\\' });
    b.stroke([[11.6, 6.6], [13.8, 3.4], [16, 2.2]], 0.8, PAPER, { same: true });
    b.poly([[5.8, 8.2], [30.2, 8.2], [31.2, 10], [5, 10.2]], INK);
    b.blob(18, 4.8, 2.2, 2, INK, { wob: 0.03 });
    b.blob(17.8, 4.6, 1.3, 1.2, LIGHT, { dir: '/', wob: 0.03, same: true });
    // the greying muzzle: one big pale shape
    b.blob(18, 18.9, 7, 4.6, b.lit(18, 18.9, 7, 4.6, { shift: 1.1, bands: [0.2, -0.6, -2] }), { dir: '/', wob: 0.07 });
    // bushy white brows over round spectacles
    b.poly([[9.6, 11.6], [11.4, 9.8], [13.2, 10.6], [14.6, 9.4], [16.6, 11], [14.6, 12], [11, 12.6]], PAPER);
    b.poly([[26.4, 11.6], [24.6, 9.8], [22.8, 10.6], [21.4, 9.4], [19.4, 11], [21.4, 12], [25, 12.6]], PAPER);
    for (const x of [13.6, 22.4]) {
      b.blob(x, 14.2, 3, 2.6, INK, { wob: 0.03 });
      b.blob(x, 14.2, 1.75, 1.5, PAPER, { wob: 0.03, same: true });
      b.blob(x + 0.45, 14.5, 0.8, 0.85, INK, { wob: 0, same: true });
      b.blob(x - 0.7, 13.6, 0.35, 0.3, PAPER, { wob: 0, same: true });
    }
    b.stroke([[16.4, 13.6], [19.6, 13.6]], 0.8, INK);
    // the star: fleshy rays round the nose, each carved apart
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * TAU - Math.PI / 2;
      b.blob(18 + Math.cos(a) * 3.1, 18.8 + Math.sin(a) * 2.7, 1.7, 0.72, ACC, { rot: a, wob: 0.08, seed: k });
    }
    b.blob(18, 18.8, 1.8, 1.5, ACC, { wob: 0.05 });
    b.blob(17.2, 19.1, 0.45, 0.5, INK, { wob: 0, same: true }); b.blob(18.8, 19.1, 0.45, 0.5, INK, { wob: 0, same: true });
    b.stroke([[16.2, 22.4], [17.1, 23.1], [18, 22.6], [18.9, 23.1], [19.8, 22.4]], 0.6, INK);
    for (const [y, k] of [[18, -1], [19.6, 1]]) { b.stroke([[11.8, y], [6.4, y + k * 1.2]], 0.45, INK); b.stroke([[24.2, y], [29.6, y + k * 1.2]], 0.45, INK); }
  },

  /** A lump of rock, cut into lit facets, studded with ore. */
  ore(b) {
    b.blob(18, 23.4, 13.5, 2.2, INK, { wob: 0.1 });
    const f = { top: [[8, 11], [13, 7], [20, 6], [26.4, 8], [24, 12.4], [15, 13]], left: [[5.6, 19], [8, 11], [15, 13], [13.4, 19.6], [12, 23]],
      front: [[15, 13], [24, 12.4], [27.4, 19.6], [26, 23], [12, 23], [13.4, 19.6]], right: [[24, 12.4], [26.4, 8], [30.4, 12.6], [31.2, 19], [27.4, 19.6]] };
    b.poly(f.top, b.lit(17, 9, 9, 4, { shift: 0.55 }), { dir: '/' });
    b.poly(f.left, b.lit(10, 16, 5, 6, { shift: 0.1 }), { dir: '|' });
    b.poly(f.front, b.lit(20, 18, 8, 6, { shift: -0.3 }), { dir: '\\' });
    b.poly(f.right, b.lit(28, 15, 3, 6, { shift: -0.8 }), { dir: '-' });
    // the ore, set in every face
    const nug = [[12.6, 10, 2.1, 1.3, 0.3], [19.5, 8.6, 1.6, 1.1, -0.2], [17.4, 17, 2.5, 1.8, 0.5], [23.4, 18.6, 1.5, 1.2, 0], [9, 15.6, 1.3, 1.6, 0.2], [27.6, 15.2, 1.1, 1.5, 0.1], [21.4, 21.4, 1.1, 0.8, 0.4]];
    nug.forEach(([x, y, rx, ry, rot], k) => { b.blob(x, y, rx, ry, b.litAcc(x, y, rx, ry), { rot, wob: 0.18, seed: k * 5 }); b.blob(x - rx * 0.35, y - ry * 0.4, 0.45, 0.35, PAPER, { wob: 0, same: true }); });
    // pebbles knocked loose
    b.blob(4.4, 23.2, 1.5, 1, b.lit(4.4, 23.2, 1.5, 1), { wob: 0.2 });
    b.blob(32.8, 22.6, 1.1, 0.8, b.lit(32.8, 22.6, 1.1, 0.8), { wob: 0.2 });
  },

  /** A miner's pick, head up, on a heap of chips. */
  pick(b) {
    b.poly([[6, 27], [10, 22.6], [15, 21.8], [21, 23.4], [27, 22.4], [31, 27]], b.lit(18, 24, 12, 3, { shift: -0.4 }), { dir: '-' });
    const d = [0.64, -0.77], p = [0.77, 0.64];
    b.stroke([[8.6, 25], [21.4, 9.6]], 2.3, b.lit(15, 17, 4, 8, { shift: 0.2 }), { dir: '/', w1: 1.9 });
    b.stroke([[9.6, 23.6], [11.4, 21.6]], 2.7, ACC, { dir: '/' }); // the leather grip
    b.stroke([[10.2, 23.8], [11.4, 22.4]], 0.4, INK, { same: true });
    b.bar([21.6, 9.2], p, d, 10.4, 2.2, 2.4, b.lit(20, 6, 9, 6, { shift: 0.1 }), { taper: 1.4, tip: 0.25, dir: '\\' });
    b.stroke([[15.4, 3.6], [24.8, 7]], 0.45, PAPER, { same: true });
    b.rect(19.8, 8, 3.4, 3, INK);
    sparkle(b, 30.6, 6, 1.4); sparkle(b, 8, 9, 1);
  },

  /** The forge: an anvil, a hammer coming down, a glowing bar and sparks. */
  anvil(b) {
    ground(b, 23.4);
    b.poly([[10, 23.6], [12.6, 19.4], [23.4, 19.4], [26, 23.6]], b.lit(18, 21, 8, 3, { shift: -0.3 }), { dir: '-' });
    b.poly([[13, 19.6], [14.4, 15.4], [21.6, 15.4], [23, 19.6]], DENSE, { dir: '|' });
    b.poly([[2.6, 13.4], [8.6, 12.8], [8.8, 15.8], [5.6, 15]], b.lit(6, 14, 3, 1.5, { shift: 0.3 }), { dir: '-' });
    b.poly([[8.4, 12.6], [28.4, 12.6], [28.8, 15.6], [8.6, 15.8]], b.lit(18, 14, 10, 2, { shift: -0.2 }), { dir: '-' });
    b.stroke([[9, 12.9], [27.8, 12.9]], 0.5, PAPER, { same: true });
    b.poly([[12, 11.2], [21, 11], [21.4, 12.6], [11.8, 12.6]], b.litAcc(16, 11.8, 5, 1)); // the hot bar
    // the hammer
    b.stroke([[22.4, 7.6], [32.4, 1.4]], 1.4, b.lit(27, 4, 5, 3, { shift: 0.3 }), { dir: '\\' });
    b.poly([[16.4, 5.6], [21.6, 3.6], [24, 8.6], [18.8, 10.6]], b.lit(20, 7, 3, 3, { shift: -0.1 }), { dir: '/' });
    // sparks: short carved strokes and loose bits
    for (const [a, l] of [[-2.7, 4], [-2.3, 3], [-1.9, 4.6], [-1.3, 3.4], [-0.6, 4], [-3.0, 2.6], [-0.2, 2.6]]) {
      const x0 = 16.6 + Math.cos(a) * 2.4, y0 = 11 + Math.sin(a) * 2.4;
      b.stroke([[x0, y0], [x0 + Math.cos(a) * l, y0 + Math.sin(a) * l]], 0.5, ACC, { w1: 0.3 });
    }
    for (const [x, y] of [[9.6, 5.4], [26.6, 11.2], [13, 3], [29.4, 9.4]]) b.rect(x, y, 0.5, 0.5, ACC);
  },

  /** A blade, point up. */
  blade(b) {
    b.poly([[18, 0.4], [20.5, 3.8], [20.3, 17.6], [15.7, 17.6], [15.5, 3.8]], (x) => (x < 17.4 ? LIGHT : x < 18.4 ? PAPER : DENSE), { dir: '/' });
    b.stroke([[18, 4.6], [18, 16.4]], 0.5, INK, { same: true });
    b.bar([18, 18.7], [1, 0], [0, -1], 8.6, -0.9, 2, b.lit(18, 18.7, 8, 1.5), { taper: 2.4, tip: 0.8, dir: '-' });
    b.rect(16.7, 19.8, 2.6, 3.8, ACC, { dir: '-' });
    for (let y = 20.4; y < 23.6; y += 1.1) b.stroke([[16.7, y], [19.3, y + 0.5]], 0.4, INK, { same: true });
    b.blob(18, 24.8, 1.9, 1.4, b.lit(18, 24.8, 1.9, 1.4), { wob: 0.1 });
    sparkle(b, 15, 3, 1.4);
  },

  /** The cage lift in its timbered shaft. */
  lift(b) {
    b.rect(0, 0, 6.4, 27, DENSE, { dir: '|' });
    b.rect(29.6, 0, 6.4, 27, INK);
    for (const y of [4, 15.6]) { b.rect(0, y, 7.4, 2, b.lit(3, y + 1, 4, 1, { shift: 0.3 }), { dir: '-' }); b.rect(28.6, y + 0.4, 7.4, 2, LIGHT, { dir: '-' }); }
    b.stroke([[18, -1], [18, 4.4]], 0.9, INK);
    b.stroke([[13.6, 4.4], [18, 2.2], [22.4, 4.4]], 0.6, INK);
    b.rect(10.4, 4.2, 15.2, 2.4, b.lit(18, 5.4, 7.6, 1.2, { shift: 0.2 }), { dir: '-' });
    b.rect(11, 6.6, 14, 15.6, INK);
    for (const x of [13, 15.5, 18, 20.5, 23]) b.stroke([[x, 6.8], [x, 22]], 0.75, LIGHT, { dir: '|', same: true });
    b.stroke([[11.2, 14.2], [24.8, 14.2]], 0.7, PAPER, { same: true });
    b.rect(10.4, 22, 15.2, 2.6, b.lit(18, 23.3, 7.6, 1.3), { dir: '-' });
    b.blob(24, 9.4, 1, 1.2, ACC, { wob: 0.1 }); // a lamp left lit
    ground(b, 25.2);
  },

  /** Deep Town: crooked roofs under the cave's teeth, warm windows, a string of lamps. */
  town(b) {
    // stalactites along the top
    const top = [[-1, -1], [37, -1], [37, 3]];
    for (let x = 36; x >= 0; x -= 3) top.push([x, 2.4 + hash(x, 1, 5) * 1.5], [x - 1.5, 3.2 + hash(x, 2, 5) * 4.4]);
    top.push([-1, 3]);
    b.poly(top, INK);
    // the houses, back to front
    const house = (x, y, w, h, roof, sh) => {
      b.rect(x, y, w, h, b.lit(x + w / 2, y + h / 2, w / 2, h / 2, { shift: sh }), { dir: '|' });
      b.poly([[x - 1, y + 0.2], [x + w * 0.45, y - roof], [x + w + 1, y + 0.2]], b.lit(x + w / 2, y - roof / 2, w / 2, roof / 2, { shift: sh - 0.4 }), { dir: '\\' });
      b.rect(x + w * 0.24, y + h * 0.28, 1.6, 1.8, ACC); b.rect(x + w * 0.62, y + h * 0.28, 1.6, 1.8, ACC);
      b.rect(x + w * 0.42, y + h - 3.6, 1.8, 3.6, INK);
    };
    house(3, 15, 7, 8, 4, -0.1);
    house(25, 14, 8, 9, 5, -0.4);
    b.rect(15.2, 8, 1.4, 4, INK);
    house(12, 12.6, 10, 10.6, 5.4, 0.2);
    // the lamp string
    const s = []; for (let x = 0; x <= 36; x += 2) s.push([x, 7.4 + Math.sin(x / 36 * Math.PI) * 2.6]);
    b.stroke(s, 0.4, INK);
    for (let x = 3; x < 36; x += 5) b.blob(x, 8.4 + Math.sin(x / 36 * Math.PI) * 2.6, 0.75, 0.9, ACC, { wob: 0.1, seed: x });
    ground(b, 23);
    for (let x = 1; x < 36; x += 3.4) b.stroke([[x, 24.6 + hash(x, 3, 5)], [x + 1.6, 24.4 + hash(x, 4, 5)]], 0.45, PAPER, { same: true });
  },

  /** A pot on the fire, steam curling up through the carved sky. */
  pot(b) {
    for (const [x0, k] of [[13.4, 1], [18, -1], [22.6, 1]]) {
      const s = []; for (let y = 9.6; y > 0; y -= 1) s.push([x0 + Math.sin(y * 0.9 + x0) * 1.2 * k, y]);
      b.stroke(s, 1.5, CUT, { w1: 0.8 });
    }
    b.stroke([[9, 25], [27, 22.6]], 1.6, DENSE, { dir: '-' }); b.stroke([[9.4, 22.4], [27.4, 25.2]], 1.6, INK);
    b.poly([[11, 24], [12.6, 19.4], [14.2, 21.6], [15.8, 17.6], [18, 20.8], [20.2, 17.2], [21.8, 21], [23.6, 18.8], [25, 24]], ACC);
    b.poly([[14.6, 23.6], [16.2, 20.6], [18, 22.4], [19.8, 20.4], [21.4, 23.6]], PAPER, { same: true });
    b.blob(18, 14.6, 8.6, 5.8, b.lit(18, 13, 8.6, 6, { shift: -0.15 }), { dir: '-', wob: 0.04 });
    b.poly([[8.4, 9.6], [27.6, 9.6], [27, 11.4], [9, 11.4]], INK);
    b.stroke([[9.4, 9.9], [26.6, 9.9]], 0.45, PAPER, { same: true });
    b.stroke([[8.4, 12], [6.4, 12.4], [6.6, 14.4], [9, 14]], 0.7, INK);
    b.stroke([[27.6, 12], [29.6, 12.4], [29.4, 14.4], [27, 14]], 0.7, INK);
  },

  /** A cut gem, its facets in every tone, glints. */
  gem(b) {
    const g = [[9, 9.6], [13.6, 9.6], [18, 9.6], [22.4, 9.6], [27, 9.6]], c = [18, 24];
    const tones = [LIGHT, ACCL, ACC, DENSE];
    for (let i = 0; i < 4; i++) b.poly([g[i], g[i + 1], c], tones[i], { dir: i % 2 ? '\\' : '/' });
    b.poly([[9, 9.6], [13.4, 5], [15, 7.4], [13.6, 9.6]], PAPER);
    b.poly([[13.6, 9.6], [15, 7.4], [21, 7.4], [22.4, 9.6]], ACCL, { dir: '-' });
    b.poly([[22.4, 9.6], [21, 7.4], [22.6, 5], [27, 9.6]], ACC);
    b.poly([[13.4, 5], [22.6, 5], [21, 7.4], [15, 7.4]], PAPER);
    sparkle(b, 11.4, 3.4, 1.8); sparkle(b, 28.4, 14.6, 1.3); sparkle(b, 7.4, 17, 1);
  },

  /** A fat sack of gold and a stack of coins. */
  coins(b) {
    ground(b, 24, DENSE);
    b.blob(14.6, 17.6, 8.2, 6.4, b.lit(14.6, 16.6, 8.2, 6.4), { dir: '\\', wob: 0.07 });
    b.poly([[11.6, 9.6], [17.6, 9.6], [16.8, 11.8], [12.4, 11.8]], DENSE, { dir: '|' });
    b.poly([[10, 6.8], [11.6, 9.6], [17.6, 9.6], [19.6, 6.4], [17.8, 7.8], [16.6, 5.4], [15, 7.6], [13.4, 5.2], [12.4, 7.8]], b.lit(15, 7.4, 5, 2.2, { shift: 0.2 }), { dir: '|' });
    b.stroke([[11.2, 10.6], [18, 10.4]], 1, ACC);
    b.stroke([[17.8, 10.6], [20, 13.2]], 0.5, ACC);
    for (let k = 0; k < 5; k++) {
      const y = 22.6 - k * 1.5, x = 27.4 + (k % 2 ? 0.4 : -0.3);
      b.blob(x, y + 0.5, 4, 1.25, DENSE, { wob: 0.03, dir: '|', seed: k });
      b.blob(x, y, 4, 1.15, b.litAcc(x, y, 4, 1.2, { shift: 0.3 }), { wob: 0.03, seed: k + 9 });
    }
    b.blob(7.4, 23.2, 2.2, 1, b.litAcc(7.4, 23.2, 2.2, 1, { shift: 0.3 }), { wob: 0.05 });
    sparkle(b, 31.6, 11.6, 1.3); sparkle(b, 23, 5.6, 1.6);
  },

  /** Glowcaps: a big cap, two small ones, spores. */
  shroom(b) {
    b.poly([[-1, 27], [-1, 22.6], [8, 21.4], [18, 22.4], [28, 21], [37, 22.2], [37, 27]], DENSE, { dir: '-' });
    for (const x of [4, 9.6, 26, 32]) b.stroke([[x, 22], [x - 0.6, 20.2], [x + 0.6, 21.6], [x + 1.2, 19.8], [x + 1.4, 22]], 0.4, INK);
    const cap = (cx, cy, rx, ry, sw, sh, k) => {
      b.poly([[cx - sw, cy + sh], [cx - sw * 0.7, cy + 0.6], [cx + sw * 0.7, cy + 0.6], [cx + sw * 1.1, cy + sh]], b.lit(cx, cy + sh / 2, sw, sh / 2, { shift: 0.3 }), { dir: '|' });
      b.poly([[cx - rx * 0.92, cy + 0.6], [cx + rx * 0.92, cy + 0.6], [cx + rx * 0.7, cy + 1.6], [cx - rx * 0.7, cy + 1.6]], DENSE, { dir: '|' });
      b.poly([...arc(cx, cy + 0.6, rx, ry, Math.PI, TAU, 14, 0.06, k)], b.litAcc(cx - 1, cy - ry * 0.4, rx, ry));
      for (let i = 0; i < 4; i++) b.blob(cx - rx * 0.5 + i * rx * 0.34, cy - ry * (0.35 + hash(i, k, 3) * 0.3), 0.55 + hash(i, k, 4) * 0.4, 0.45, PAPER, { same: true, wob: 0.15, seed: i + k });
    };
    cap(19, 11, 9.2, 6.6, 2.2, 11, 1);
    cap(7.4, 17.6, 4, 3, 1.1, 4.4, 2);
    cap(29.6, 18.6, 3.2, 2.4, 0.9, 3.4, 3);
    for (const [x, y] of [[29, 6], [32, 10.6], [5, 9.6], [25.4, 3], [9.6, 4.6]]) b.rect(x, y, 0.5, 0.5, ACC);
  },

  /** A tied bunch of herbs. */
  herb(b) {
    const stems = [[-0.62, 14.6], [-0.3, 17.4], [0.02, 18.6], [0.34, 17], [0.66, 14.2]];
    for (const [a, l] of stems) {
      const x1 = 18 + Math.sin(a) * l, y1 = 24 - Math.cos(a) * l;
      b.stroke([[18, 24.4], [x1, y1]], 0.6, INK);
      for (let t = 0.35; t < 1; t += 0.2) {
        const x = 18 + Math.sin(a) * l * t, y = 24 - Math.cos(a) * l * t, side = (t * 10) % 2 < 1 ? 1 : -1, la = a + side * 0.9;
        b.blob(x + Math.sin(la) * 2, y - Math.cos(la) * 2, 2.5, 1.05, b.litAcc(x, y, 2, 1, { shift: 0.2 }), { rot: la - Math.PI / 2, wob: 0.12, seed: Math.round(t * 50 + a * 9), dir: '\\' });
      }
      b.blob(x1, y1, 1.1, 1.3, ACC, { wob: 0.2 });
    }
    b.stroke([[16.2, 20.6], [19.8, 20.2]], 1.2, LIGHT, { dir: '|' });
    b.stroke([[19.6, 20.4], [22, 23.4], [21.2, 25]], 0.5, INK);
  },

  /** A broken arch on its pillars, a rune still glowing. */
  ruin(b) {
    b.poly([[10.4, 23.4], [11, 12.4], [13.6, 8.8], [18, 7.6], [22.4, 9], [25.4, 12.6], [26, 23.4]], INK);
    ground(b, 23.2);
    b.rect(5.4, 7, 5.4, 16.4, b.lit(8, 15, 2.7, 8, { shift: 0.2 }), { dir: '|' });
    for (const x of [6.8, 9.4]) b.stroke([[x, 8], [x, 22.4]], 0.4, INK, { same: true });
    b.rect(4.4, 5, 7.6, 2.2, INK);
    b.poly([[25.4, 12], [27, 10.4], [28.6, 11.6], [30.4, 10], [30.6, 23.4], [25.4, 23.4]], b.lit(28, 17, 2.6, 6, { shift: -0.4 }), { dir: '|' });
    const a = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; a.push([8 + t * 13.6, 6 - Math.sin(t * Math.PI * 0.62) * 4.6]); }
    for (let i = 10; i >= 0; i--) { const t = i / 10; a.push([9.6 + t * 12.6, 8.2 - Math.sin(t * Math.PI * 0.62) * 3.6 + (i === 10 ? 1.4 : 0)]); }
    b.poly(a, b.lit(15, 4, 7, 3, { shift: 0.1 }), { dir: '-' });
    b.poly([[17, 21.6], [22.6, 20.4], [23.4, 23.6], [16.6, 24]], b.lit(20, 22, 3, 1.6), { dir: '/' });
    b.poly([[12.6, 22.4], [15.6, 21.8], [15.8, 23.8], [12.4, 24]], DENSE, { dir: '\\' });
    b.stroke([[8.1, 11], [8.1, 15.4]], 0.6, ACC); b.stroke([[6.9, 12.4], [9.3, 13.6]], 0.6, ACC); b.stroke([[7, 16.6], [9.2, 16.6]], 0.6, ACC);
  },

  /** A creature's head: a heavy brow, deep sockets with lit eyeballs, teeth. */
  beast(b) {
    b.poly([[6.6, 6.4], [12.6, 1.8], [23.4, 1.8], [29.4, 6.4], [31.6, 14], [27.4, 22], [18, 25.4], [8.6, 22], [4.4, 14]], b.lit(17, 11, 13, 12, { shift: -0.1 }), { dir: '/' });
    b.stroke([[13, 3.6], [15.6, 6], [14.6, 7.6]], 0.45, PAPER, { same: true });
    b.stroke([[27.4, 6.4], [25.8, 9]], 0.45, PAPER, { same: true });
    b.poly([[6.4, 9], [12, 7.4], [17, 9.6], [18, 8.6], [19, 9.6], [24, 7.4], [29.6, 9], [28.4, 11.2], [24, 10.2], [18, 11.4], [12, 10.2], [7.6, 11.2]], INK);
    for (const x of [12.8, 23.2]) {
      b.blob(x, 13, 3.4, 2.5, INK, { wob: 0.1, seed: x });
      b.blob(x + (x < 18 ? 0.4 : -0.4), 13.3, 1.8, 1.4, b.litAcc(x, 13, 1.8, 1.4, { shift: 0.2 }), { wob: 0.06, same: true });
      b.stroke([[x + (x < 18 ? 0.4 : -0.4), 12.4], [x + (x < 18 ? 0.4 : -0.4), 14.2]], 0.45, INK, { same: true });
      b.stroke([[x - 2.6, 11.6], [x + 2.6, 11.8]], 0.7, INK, { same: true }); // the heavy lid
    }
    b.poly([[16.6, 12], [19.4, 12], [20.4, 16.4], [15.6, 16.4]], b.lit(18, 14, 2, 2.2, { shift: 0.4 }), { dir: '|' });
    b.stroke([[16.4, 16.4], [17.2, 17]], 0.5, INK); b.stroke([[19.6, 16.4], [18.8, 17]], 0.5, INK);
    b.poly([[9.6, 18.6], [26.4, 18.6], [24, 23.2], [12, 23.2]], INK);
    for (let x = 11; x < 25.5; x += 2.4) b.poly([[x, 18.6], [x + 1.8, 18.6], [x + 0.9, 20.8 + hash(x, 1, 3) * 0.8]], PAPER, { same: true });
    for (let x = 12.6; x < 23.5; x += 2.6) b.poly([[x, 23.2], [x + 1.8, 23.2], [x + 0.9, 21.4]], PAPER, { same: true });
  },

  /** Three sticks of dynamite tied with twine, the fuse fizzing. */
  dyn(b) {
    for (const [x, rot] of [[13.4, -0.12], [22.6, 0.12], [18, 0]]) {
      const c = Math.cos(rot), s = Math.sin(rot), pt = (u, v) => [x + u * c - v * s, 17 + u * s + v * c];
      b.poly([pt(-1.9, -7.6), pt(1.9, -7.6), pt(1.9, 7), pt(-1.9, 7)], b.litAcc(x, 15, 1.9, 8, { shift: 0.15 }), { dir: '|' });
      const [tx, ty] = pt(0, -7.6);
      b.blob(tx, ty, 1.9, 0.7, PAPER, { rot, wob: 0.03, same: true });
      b.blob(tx, ty, 0.5, 0.3, INK, { rot, wob: 0, same: true });
    }
    for (const y of [12.6, 20]) b.stroke([[10.6, y + 0.3], [14, y - 0.2], [18, y + 0.4], [22, y - 0.2], [25.4, y + 0.3]], 0.9, INK);
    b.stroke([[18, 9.4], [18.6, 6.6], [20.6, 5.6], [22, 6.6], [23.6, 4.4], [25.4, 3.4]], 0.55, INK);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.stroke([[25.8 + Math.cos(a) * 0.8, 3 + Math.sin(a) * 0.8], [25.8 + Math.cos(a) * (k % 2 ? 2 : 3), 3 + Math.sin(a) * (k % 2 ? 2 : 3)]], 0.45, ACC, { w1: 0.25 }); }
    ground(b, 24.6, DENSE);
  },

  /** Further down: rock beds, a plumb-bob on its line, the way down carved through. */
  deep(b) {
    b.stroke([[18, -1], [18, 13.6]], 0.6, INK);
    b.stroke([[16, -1], [16.6, 6], [15.8, 14], [16.4, 27]], 1.6, CUT);
    b.stroke([[20, -1], [19.6, 8], [20.4, 16], [19.8, 27]], 1.6, CUT);
    b.poly([[15.6, 13.6], [20.4, 13.6], [19.8, 17.4], [18, 21.6], [16.2, 17.4]], b.litAcc(17.4, 16, 2.4, 4, { shift: 0.2 }));
    b.stroke([[16.2, 13.9], [19.8, 13.9]], 0.5, INK, { same: true });
    for (const y of [22.6, 25]) b.poly([[13, y - 2], [18, y + 1.4], [23, y - 2], [21.6, y - 2.6], [18, y - 0.4], [14.4, y - 2.6]], INK);
  },

  /** A ticket for the Surface Express. */
  ticket(b) {
    const rot = -0.14, c = Math.cos(rot), s = Math.sin(rot), pt = (u, v) => [18 + u * c - v * s, 13 + u * s + v * c];
    const shape = [pt(-13, -6.4), pt(13, -6.4), pt(13, -2), pt(11.8, -1), pt(11.8, 1), pt(13, 2), pt(13, 6.4), pt(-13, 6.4), pt(-13, 2), pt(-11.8, 1), pt(-11.8, -1), pt(-13, -2)];
    b.poly(shape, b.lit(18, 13, 13, 6.4, { shift: 0.45, bands: [0.2, -0.6, -2] }), { dir: '\\' });
    b.poly([pt(-12.6, -6), pt(-5.4, -6), pt(-5.4, 6), pt(-12.6, 6)], ACCL, { dir: '/', same: true });
    for (let v = -5.4; v < 6; v += 1.3) { const [x, y] = pt(-4.6, v); b.rect(x - 0.25, y - 0.25, 0.5, 0.5, INK, { same: true }); }
    for (const [v, l] of [[-3.6, 13], [-1.2, 10], [1.2, 12], [3.6, 7]]) b.stroke([pt(-2.2, v), pt(-2.2 + l, v)], 0.5, INK, { same: true });
    const [hx, hy] = pt(-9, 0);
    b.blob(hx, hy, 1.3, 1.3, CUT, { wob: 0.05 });
    sparkle(b, 31.4, 3.4, 1.4); sparkle(b, 4.4, 22.4, 1.1);
  },

  /** A hanging lantern, its light carved out as rays. */
  lantern(b) {
    b.stroke([[15.4, 3.6], [15.6, 1.2], [18, 0.4], [20.4, 1.2], [20.6, 3.6]], 0.6, INK);
    b.poly([[13.2, 6], [22.8, 6], [21, 3.2], [15, 3.2]], b.lit(18, 4.6, 5, 1.6, { shift: 0.2 }), { dir: '-' });
    b.rect(14.4, 6, 7.2, 12.6, (x, y) => (Math.hypot(x - 18, (y - 12.4) * 0.7) < 2.6 ? PAPER : ACCL), { dir: '|' });
    b.poly([[18, 8.6], [19.6, 12], [19, 14.4], [17, 14.4], [16.4, 12]], ACC);
    b.poly([[18, 10.6], [18.8, 12.8], [18, 14], [17.2, 12.8]], PAPER, { same: true });
    for (const x of [14.4, 21.6]) b.stroke([[x, 6], [x, 18.6]], 0.9, INK);
    b.stroke([[14.4, 12.3], [21.6, 12.3]], 0.4, INK, { same: true });
    b.poly([[13, 18.4], [23, 18.4], [22, 21], [14, 21]], b.lit(18, 19.6, 5, 1.3, { shift: -0.2 }), { dir: '-' });
  },

  /** A trader's stall: a striped awning, a counter, wares. */
  stall(b) {
    ground(b, 24.4, DENSE);
    for (const x of [6, 30]) b.stroke([[x, 11], [x, 24.6]], 1.1, INK);
    b.rect(4, 17.6, 28, 6.6, b.lit(18, 21, 14, 3.4, { shift: -0.1 }), { dir: '-' });
    for (const y of [19.8, 22]) b.stroke([[4.4, y], [31.6, y]], 0.4, INK, { same: true });
    // wares: a jar, a sack, a crate
    b.blob(9.6, 15.6, 2, 2.2, b.lit(9.6, 15.6, 2, 2.2), { wob: 0.05, dir: '|' });
    b.rect(8.4, 12.6, 2.4, 1.2, INK);
    b.blob(17, 15.6, 3, 2.4, b.lit(17, 15.6, 3, 2.4), { wob: 0.1, dir: '\\' });
    b.rect(22.6, 13.4, 5, 4.2, b.lit(25, 15.4, 2.5, 2), { dir: '-' });
    // the awning: stripes, a scalloped hem
    const aw = [[5, 4.6], [31, 4.6], [33.6, 10.6]];
    for (let x = 33.6; x >= 2.4; x -= 1.3) aw.push([x, 10.6 + (Math.round((33.6 - x) / 1.3) % 4 < 2 ? 1.2 : 0)]);
    aw.push([2.4, 10.6]);
    b.poly(aw, (x) => (Math.floor((x - 2.4) / 3.9) % 2 ? ACC : PAPER), { dir: '|' });
    b.stroke([[5, 4.8], [31, 4.8]], 0.6, INK, { same: true });
  },

  /** A stack of ingots. */
  ingot(b) {
    ground(b, 23.6, DENSE);
    const bar = (x, y, w) => {
      b.poly([[x + 1.4, y - 2.6], [x + w - 1.4, y - 2.6], [x + w, y], [x, y]], b.litAcc(x + w / 2, y - 1.3, w / 2, 1.3, { shift: 0.8 }), { dir: '-' });
      b.poly([[x, y], [x + w, y], [x + w - 1, y + 4.2], [x + 1, y + 4.2]], b.litAcc(x + w / 2, y + 2, w / 2, 2, { shift: -0.2 }), { dir: '|' });
      b.stroke([[x + w / 2 - 1, y + 1.4], [x + w / 2 + 1, y + 2.8]], 0.4, INK, { same: true });
      b.stroke([[x + w / 2 + 1, y + 1.4], [x + w / 2 - 1, y + 2.8]], 0.4, INK, { same: true });
    };
    bar(4.4, 19.4, 13); bar(18.6, 19.4, 13); bar(11.4, 13.4, 13);
    sparkle(b, 28.6, 9.4, 1.5); sparkle(b, 7, 9, 1.1);
  },

  /** A parcel tied with twine, a tag and a wax blob. */
  parcel(b) {
    ground(b, 23.6, DENSE);
    b.poly([[7, 10.6], [21, 10.6], [29.6, 7], [15.4, 7]], b.lit(18, 8.8, 11, 1.8, { shift: 0.6 }), { dir: '/' });
    b.poly([[7, 10.6], [21, 10.6], [21, 23.6], [7, 23.6]], b.lit(14, 17, 7, 6.5, { shift: 0.05 }), { dir: '|' });
    b.poly([[21, 10.6], [29.6, 7], [29.6, 20], [21, 23.6]], b.lit(25, 15, 4.3, 8, { shift: -0.7 }), { dir: '-' });
    b.stroke([[14, 10.6], [14, 23.6]], 0.7, INK); b.stroke([[7, 17], [21, 17]], 0.7, INK);
    b.stroke([[11.2, 8.8], [25.6, 8.8]], 0.6, INK); b.stroke([[18.2, 7], [24.4, 10.6]], 0.6, INK);
    b.stroke([[25.2, 15.4], [29.6, 13.6]], 0.6, INK);
    b.blob(14, 17, 1.7, 1.5, b.litAcc(14, 17, 1.7, 1.5), { wob: 0.18 });
    b.stroke([[14.4, 17.6], [16.8, 21.6]], 0.4, INK);
    b.poly([[15.6, 21], [19.2, 20.2], [19.8, 23], [16.2, 23.8]], PAPER);
  },
};

/** Draw a motif into a fresh block. */
export function carve(id, seed = 1, r = 2) {
  const b = new Block(PIC_W, PIC_H, r, seed);
  (MOTIFS[id] || MOTIFS.parcel)(b);
  return b;
}
/** The background each picture is printed on, and where its rays start. */
export const BACKDROP = {
  star: { bg: 'lines' }, ore: { bg: 'strata' }, pick: { bg: 'strata' }, anvil: { bg: 'lines' }, blade: { bg: 'rays', center: [18, 9] },
  lift: { bg: 'vlines' }, town: { bg: 'lines' }, pot: { bg: 'lines' }, gem: { bg: 'rays', center: [18, 12] }, coins: { bg: 'lines' },
  shroom: { bg: 'lines' }, herb: { bg: 'lines' }, ruin: { bg: 'rays', center: [16, 14] }, beast: { bg: 'dark' }, dyn: { bg: 'rays', center: [25.8, 3] },
  deep: { bg: 'strata' }, ticket: { bg: 'vlines' }, lantern: { bg: 'rays', center: [18, 12.4] }, stall: { bg: 'lines' }, ingot: { bg: 'strata' },
  parcel: { bg: 'lines' },
};

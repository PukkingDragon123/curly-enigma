// Dust in your eyes (wave 13): a burst dust bunny (or a spore cloud) throws a veil of grainy pixel
// dust over the view: clumps of fluff with lit tops and shaded undersides, loose grains, drifting
// down and crumbling away through a dither over 2-3 s, never a flat blur. The mole sneezes it off:
// "ah... ah... CHOO!" moves the camera (a { view: [pitch, roll, dy] } event each frame; DigScene adds
// it to the camera, honouring the screen-shake setting) and a cough or two after.
//
//   veil.hit(k, { tones, sneeze, from })  k 0..1 strength; tones: 5 hex colours dark → light
//   veil.update(dt, events)               runs the fade and the sneeze, pushes { view } events
//   veil.dispose()
import { clamp } from '../../core/util.js';

const DUST = [0x5e5446, 0x8a7e6c, 0xb4a690, 0xd6cab4, 0xf2e8d6];
const ROWS = 200; // grains down the screen: chunky enough to read as pixel dust
const PAD = 24; // the field is bigger than the screen so it can drift
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** Five veil tones (dark → light) from one [r, g, b] 0..1 colour (spores), muted toward dust. */
export function tonesOf(c) {
  const hex = (r, g, b) => (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255);
  return [0.32, 0.5, 0.7, 0.88, 1.05].map((k, i) => {
    const m = i / 4; // lighter tones lean to cream
    return hex((c[0] * 0.75 + 0.2) * 255 * k * (1 - m * 0.2) + 60 * m, (c[1] * 0.75 + 0.18) * 255 * k * (1 - m * 0.2) + 55 * m, (c[2] * 0.6 + 0.16) * 255 * k * (1 - m * 0.2) + 45 * m);
  });
}

/** "ah... ah... CHOO!" then two little coughs: [pitch, roll, dy] at time t (s). */
function sneezeCurve(t) {
  if (t <= 0 || t > 1.9) return null;
  if (t < 0.5) { const k = smooth(t / 0.5); return [0.06 * k, 0.015 * k, 0.012 * k]; } // ah...
  if (t < 0.62) { const k = smooth((t - 0.5) / 0.12); return [0.06 + 0.035 * k, 0.015 + 0.01 * k, 0.012 + 0.006 * k]; } // ah...!
  if (t < 0.68) { const k = (t - 0.62) / 0.06; return [0.095 - 0.275 * k, 0.025 - 0.06 * k, 0.018 - 0.07 * k]; } // CHOO
  const u = t - 0.68, e = Math.exp(-u * 6.5) * Math.cos(u * 15);
  let p = -0.18 * e, r = -0.035 * e, y = -0.052 * e;
  for (const c of [0.62, 0.86]) { const v = u - c; if (v > 0 && v < 0.16) { const w = Math.sin((v / 0.16) * Math.PI); p -= 0.032 * w; y -= 0.01 * w; } } // *hkk* *hkk*
  return [p, r, y];
}

export class DustVeil {
  constructor(mgr) {
    this.mgr = mgr;
    this.t = 99; this.k = 0; this.life = 2.6;
    this.sneezeT = -1;
    this.cv = null;
    this.level = -1;
    this.drawT = 0;
  }

  /** Dust in the face: k 0..1. o: { tones (5 hex, dark → light), sneeze (default true), life } */
  hit(k, o = {}) {
    if (typeof document === 'undefined') return;
    k = clamp(k, 0, 1);
    if (k < 0.08) return;
    // a fresh cloud thickens a veil that's still there
    const left = this.t < this.life ? this.k * (1 - smooth((this.t - 0.7) / (this.life - 0.7))) : 0;
    this.k = clamp(Math.max(k, left + k * 0.5), 0, 1);
    this.t = 0;
    this.life = o.life ?? 2.6;
    this.pal = (o.tones || DUST).map(rgb);
    this.seed = (Math.random() * 1e6) | 0;
    this.build();
    this.ox = 0; this.oy = 0;
    this.level = -1;
    if (o.sneeze !== false && this.sneezeT < 0) { this.sneezeT = 0; this.cough = 0; }
    try { this.cv.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(0.98)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' }); } catch (e) { /* no WAAPI: no pop */ }
  }

  /** The grain field: big soft clumps heaped toward the edges, smaller tufts, loose specks. */
  build() {
    const host = this.mgr.ui?.world || document.body;
    const W0 = Math.max(160, innerWidth || 1280), H0 = Math.max(120, innerHeight || 720);
    const H = ROWS, W = Math.round(ROWS * (W0 / H0));
    if (!this.cv) {
      this.cv = document.createElement('canvas');
      this.cv.className = 'dust-veil';
      this.cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges;transform-origin:50% 50%';
    }
    if (!this.cv.isConnected) host.append(this.cv);
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; this.img = null; }
    this.ctx = this.ctx && this.cv === this.ctx.canvas ? this.ctx : this.cv.getContext('2d');
    if (!this.img) this.img = this.ctx.createImageData(W, H);
    const FW = W + PAD * 2, FH = H + PAD * 2;
    this.W = W; this.H = H; this.FW = FW; this.FH = FH;
    const F = this.F = this.F && this.F.length === FW * FH ? this.F.fill(0) : new Float32Array(FW * FH);
    const T = this.T = this.T && this.T.length === FW * FH ? this.T.fill(0) : new Float32Array(FW * FH); // near tufts (drift faster)
    const s = this.seed;
    const R = (i) => hash(i, 7, s);
    const blob = (A, cx, cy, rx, ry, w) => {
      const x0 = Math.max(0, Math.floor(cx - rx * 1.4)), x1 = Math.min(FW - 1, Math.ceil(cx + rx * 1.4));
      const y0 = Math.max(0, Math.floor(cy - ry * 1.4)), y1 = Math.min(FH - 1, Math.ceil(cy + ry * 1.4));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
        if (d < 1.9) A[y * FW + x] += w * Math.max(0, 1 - d / 1.9) ** 1.6;
      }
    };
    // big clumps, each a cluster of lumps, heaped toward the edges (the middle stays thinner: you can still just see)
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R(i) * 0.6, e = 0.55 + R(i + 50) * 0.5;
      const cx = FW / 2 + Math.cos(a) * e * W * 0.55, cy = FH / 2 + Math.sin(a) * e * H * 0.58;
      const r = H * (0.12 + R(i + 100) * 0.12);
      for (let j = 0; j < 5; j++) blob(F, cx + (hash(i, j, s + 1) - 0.5) * r * 1.6, cy + (hash(i, j, s + 2) - 0.5) * r * 1.2, r * (0.5 + hash(i, j, s + 3) * 0.5), r * (0.4 + hash(i, j, s + 4) * 0.4), 0.55 + hash(i, j, s + 5) * 0.4);
    }
    for (let i = 0; i < 9; i++) blob(F, FW / 2 + (R(i + 200) - 0.5) * W * 0.8, FH / 2 + (R(i + 300) - 0.5) * H * 0.7, H * (0.06 + R(i + 400) * 0.08), H * (0.05 + R(i + 500) * 0.06), 0.5);
    // near tufts: small fluffy knots that tumble past
    for (let i = 0; i < 26; i++) {
      const cx = R(i + 600) * FW, cy = R(i + 700) * FH, r = 2 + R(i + 800) * 5;
      for (let j = 0; j < 3; j++) blob(T, cx + (hash(i, j, s + 9) - 0.5) * r * 2, cy + (hash(i, j, s + 8) - 0.5) * r, r * (0.6 + hash(i, j, s + 7) * 0.5), r * 0.6, 0.9);
    }
    // a speckle of loose grains over everything
    for (let i = 0; i < FW * FH; i++) { const x = i % FW, y = (i / FW) | 0; F[i] += (hash(x >> 1, y >> 1, s + 11) ** 14) * 0.8 + (hash((x / 3) | 0, (y / 3) | 0, s + 12) - 0.5) * 0.12; }
  }

  update(dt, out) {
    // the sneeze moves the head (the scene adds it to the camera)
    if (this.sneezeT >= 0) {
      const prev = this.sneezeT;
      this.sneezeT += dt;
      if (prev < 0.5 && this.sneezeT >= 0.5) this.mgr.audio?.play?.('sneeze', { vol: 0.9 });
      if (prev < 1.3 && this.sneezeT >= 1.3) this.mgr.audio?.play?.('dust_cough', { vol: 0.7 });
      const v = sneezeCurve(this.sneezeT);
      if (v) out.push({ view: v });
      else this.sneezeT = -1;
    }
    if (!this.cv) return;
    if (this.t >= this.life) { if (this.level !== 0) { this.level = 0; this.cv.style.display = 'none'; } return; }
    this.t += dt;
    // fast in (with an overshoot), a moment thick, then it settles and crumbles away
    const t = this.t, L = this.life;
    const env = t < 0.07 ? (t / 0.07) * 1.18 : t < 0.25 ? 1.18 - 0.18 * smooth((t - 0.07) / 0.18) : t < 0.7 ? 1 : 1 - smooth((t - 0.7) / (L - 0.7));
    this.ox += Math.sin(t * 1.7 + this.seed) * dt * 3;
    this.oy += dt * (4 + t * 5); // settling
    this.drawT -= dt;
    const lv = Math.round(env * this.k * 24) / 24;
    if (lv === this.level && this.drawT > 0) return;
    this.drawT = 1 / 14; // redraw at most ~14 times a second (phones)
    this.level = lv;
    if (lv <= 0) { this.cv.style.display = 'none'; return; }
    this.cv.style.display = '';
    this.draw(lv);
  }

  draw(lv) {
    const { W, H, FW, F, T, pal } = this, px = this.img.data;
    // the clumps settle (the screen samples the field further up as it sinks); the near tufts drift faster
    const ox = PAD - Math.round(clamp(this.ox, -PAD + 2, PAD - 2)), oy = PAD - Math.round(clamp(this.oy * 0.5, -PAD + 2, PAD - 2));
    const tox = Math.round(this.ox * 2.5) % PAD, toy = Math.round(this.oy * 1.6) % PAD;
    const thin = 1 - lv; // how far it has crumbled
    const g = Math.floor(this.t * 9);
    for (let y = 0; y < H; y++) {
      const fy = y + oy, ty = clamp(y + PAD - toy, 1, this.FH - 2);
      for (let x = 0; x < W; x++) {
        const i = fy * FW + x + ox, j = ty * FW + clamp(x + PAD + tox, 1, FW - 2);
        const v = F[i] * lv, u = T[j] * lv;
        const th = B4[(y & 3) * 4 + (x & 3)] * 0.2 + 0.46 + thin * 0.2; // a thin dithered rim, crisp clumps
        const o = (y * W + x) * 4;
        let c = -1, a = 0;
        if (u > th + 0.05) {
          // a near tuft: lit from the top left, dark rim at the bottom right
          const sl = T[j - FW - 1] - T[j + FW + 1];
          c = T[j + FW + 1] * lv < th ? 1 : sl > 0.08 ? 4 : sl < -0.08 ? 2 : 3; a = 245;
        } else if (v > th) {
          const sl = F[i - FW - 1] - F[i + FW + 1];
          const core = v - th;
          c = F[i + FW + 1] * lv < th ? 1 : sl > 0.1 ? (core > 0.35 ? 4 : 3) : sl < -0.1 ? 1 : core > 0.5 ? 3 : 2;
          a = core > 0.3 ? 236 : 196;
        } else if (v > th - 0.12 && hash(x >> 1, y >> 1, g) < 0.08 * lv) { c = 1; a = 170; } // loose 2x2 grains at the edge, twinkling
        if (c < 0) { px[o + 3] = 0; continue; }
        const p = pal[c];
        px[o] = p[0]; px[o + 1] = p[1]; px[o + 2] = p[2]; px[o + 3] = a;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  dispose() {
    this.cv?.remove();
    this.cv = null;
    this.sneezeT = -1;
  }
}

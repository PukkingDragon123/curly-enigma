// Hand-painted (in code) pixel-art plant sprites for the cave vegetation: grass tufts, ferns,
// clover, glowing fungus, hanging roots and vines, bioluminescent flowers, dry tufts and thorn
// scrub, stone roses, frost grass and lichen, ash weeds with ember pods, dino-cavern giant fronds
// and horsetails, void tendrils, crystal grass, mycelium threads, moss drapes, leaf litter.
//
// Every painter is (r, …) → Spr, painted at PXM texels per metre with the plant's root on the
// bottom row (standing plants) or the top row (hanging ones). Light comes from the upper left;
// colours come from small hue-shifted ramps (dark → light), and glow levels mark what shines.
import { Spr, Atlas, rng, tone, ph, mix, shade } from './paint.js';

// ---------------------------------------------------------------- ramps (dark → light)
export const RAMP = {
  grass: [0x0f2418, 0x173a20, 0x22562a, 0x2f7431, 0x4a963a, 0x76b84a, 0xaed866],
  moss: [0x0b261f, 0x123c28, 0x1a5833, 0x24763c, 0x379848, 0x5cbe5c, 0x9ce88a],
  pale: [0x262616, 0x3a3a22, 0x52522c, 0x6e6c36, 0x8e8a46, 0xb0a85c, 0xd0c880],
  dry: [0x2a1c12, 0x46301e, 0x664828, 0x886636, 0xaa8648, 0xc8a45e, 0xe4c680],
  fern: [0x0c2216, 0x143622, 0x1d4e2e, 0x296a38, 0x3e8a42, 0x60aa50, 0x92ca6a],
  dino: [0x0f240e, 0x183a15, 0x24561c, 0x347426, 0x4c9430, 0x70b23e, 0xa2ce56],
  clover: [0x0e2a19, 0x154023, 0x1e5a2c, 0x2a7636, 0x3c9442, 0x5ab452, 0x8cd470],
  root: [0x1c1009, 0x2c1a0e, 0x422816, 0x5c3a20, 0x784e2e, 0x986a42, 0xbc9268],
  dirt: [0x1e140c, 0x2c1e12, 0x3c2a1a, 0x4e3824, 0x60482e],
  vine: [0x0b2015, 0x12341c, 0x1b4c26, 0x266830, 0x38863a, 0x58a64a, 0x88c862],
  frost: [0x1a3246, 0x284a64, 0x3c6886, 0x588caa, 0x80b2ca, 0xb2d6e8, 0xe8f8ff],
  ash: [0x0a0808, 0x141010, 0x201a18, 0x2e2622, 0x3e322c, 0x52443c, 0x685850],
  ember: [0x581404, 0x882208, 0xbe3e0c, 0xee6818, 0xff9e2e, 0xffce5e, 0xfff0b0],
  void: [0x10061c, 0x1c0b32, 0x2c134e, 0x461e78, 0x6832a6, 0x9858d6, 0xd2a6ff],
  crystal: [0x0c1c32, 0x142e4c, 0x20466c, 0x326894, 0x5090ba, 0x84bede, 0xd0f0ff],
  stem: [0x3a3040, 0x544a5a, 0x726876, 0x928896, 0xb2aab2, 0xd0caca, 0xeeeae6],
  cyan: [0x082a32, 0x0d4650, 0x146c76, 0x209ca2, 0x48ccc8, 0x92eee2, 0xdcfff6],
  violet: [0x1c0c34, 0x301452, 0x4a2076, 0x6a329e, 0x9252ca, 0xbe88ee, 0xeed6ff],
  pink: [0x340c24, 0x521438, 0x782054, 0xa63278, 0xd2549c, 0xee8ec2, 0xffd6ea],
  amber: [0x381c06, 0x582e0a, 0x82460e, 0xae6418, 0xda8c28, 0xf2b64e, 0xffe29e],
  blue: [0x0a1c3e, 0x102e5c, 0x1a4682, 0x2864ae, 0x408cd6, 0x74b6f2, 0xc6e4ff],
  brownCap: [0x24140c, 0x3a2214, 0x56341e, 0x74482a, 0x94603a, 0xb67e52, 0xd8a476],
  red: [0x3a0a0a, 0x5c1010, 0x841a16, 0xae2a20, 0xd04030, 0xe8705a, 0xfff0e0],
  ink: [0x1c1a1e, 0x2e2a30, 0x48444a, 0x6a666c, 0x908c90, 0xbab6b4, 0xe4e0da],
  pebble: [0x26221e, 0x3a3530, 0x504a44, 0x68625a, 0x827b72, 0x9e968c, 0xbcb4a8],
  succ: [0x15241f, 0x213a32, 0x2e5246, 0x426c5e, 0x60907c, 0x8ab4a0, 0xc0d8c8],
};
const R = RAMP;

// ---------------------------------------------------------------- grasses
/**
 * A tuft of blades fanning out of one root. o: { w, h, n, min (shortest blade, 0..1), spread,
 * droop, w0, w1 (blade width at the root), tone (shift), glowTip (level), seeds, specks, stiff }.
 */
export function grassTuft(r, RR, o = {}) {
  const W = o.w ?? 48, H = o.h ?? 40;
  const s = new Spr(W, H);
  const n = o.n ?? r.int(16, 24), mn = o.min ?? 0.4;
  const bl = [];
  for (let i = 0; i < n; i++) {
    const u = ((r() + r() + r()) / 3 - 0.5) * 2; // -1..1, crowded toward the middle
    const len = (H - 2) * (mn + r() * (1 - mn));
    bl.push({ x: W / 2 + u * W * (o.root ?? 0.2), u, len, lean: u * (o.spread ?? 0.42) + (r() - 0.5) * 0.25, bend: o.stiff ? (r() - 0.5) * 0.08 : (r() - 0.5) * 0.45 + Math.sign(u || 1) * (o.droop ?? 0.18) * r(), w: r.range(o.w0 ?? 1.7, o.w1 ?? 3.1), d: r(), k: r() });
  }
  bl.sort((a, b) => a.d - b.d); // back blades first, darker
  for (const b of bl) {
    const y0 = H - 1, x1 = b.x + b.lean * b.len, y1 = y0 - b.len;
    const tx = x1 + b.bend * b.len * 0.55, ty = y1 + Math.abs(b.bend) * b.len * 0.3;
    const base = 0.5 + b.d * 1.7 + (o.tone ?? 0) + (b.k - 0.5) * 0.6;
    const broken = o.broken && b.k < o.broken;
    const end = broken ? 0.55 + b.k : 1;
    s.strand(b.x, y0, b.x + b.lean * b.len * 0.3, y0 - b.len * 0.55, broken ? b.x + (tx - b.x) * end : tx, broken ? y0 + (ty - y0) * end : ty, b.w, 1,
      (t, sd) => tone(RR, base + t * 3.3 - sd * 0.85), o.glowTip ? (t) => (t > 0.84 ? o.glowTip : 0) : 0);
  }
  // seed stalks: thin straight stems with a head of grains (oats, wild rye)
  for (let i = 0; i < (o.seeds || 0); i++) {
    const x0 = W / 2 + (r() - 0.5) * W * 0.3, len = (H - 3) * r.range(0.82, 1), lean = (r() - 0.5) * 0.5;
    const x1 = x0 + lean * len, y1 = H - 1 - len;
    s.line(x0, H - 1, x1, y1, (t) => tone(RR, 2 + t * 2.5));
    const hc = o.seedCol || RR;
    for (let k = 0; k < 7; k++) {
      const t = 1 - k * 0.045, x = x0 + (x1 - x0) * t, y = H - 1 + (y1 - (H - 1)) * t;
      const sd = k & 1 ? 1 : -1;
      s.set(x + sd, y + 1, tone(hc, 4 + (sd < 0 ? 1 : 0)), o.seedGlow || 0);
      s.set(x + sd, y, tone(hc, 5), o.seedGlow || 0);
    }
  }
  // little lights or blossoms caught among the blades
  for (let i = 0; i < (o.specks || 0); i++) {
    const x = W / 2 + (r() - 0.5) * W * 0.7, y = H * r.range(0.2, 0.75);
    if (!s.has(x, y + 1) && !s.has(x, y)) continue;
    const c = o.speckCol ? tone(o.speckCol, 5) : 0xfff4c8;
    s.set(x, y, c, o.speckGlow ?? 0);
    if (o.speckBig) { s.set(x + 1, y, o.speckCol ? tone(o.speckCol, 4) : c, o.speckGlow ?? 0); s.set(x, y - 1, o.speckCol ? tone(o.speckCol, 6) : c, o.speckGlow ?? 0); }
  }
  return s.rim(0.8, 'b');
}

/** Ice blades: stiff, straight, with a few crystal spikes and sparkles. */
export function frostGrass(r) {
  const s = grassTuft(r, R.frost, { w: 40, h: 34, n: r.int(12, 17), stiff: true, w0: 1.4, w1: 2.6, spread: 0.3, tone: 0.4, glowTip: 1 });
  for (let i = 0; i < r.int(2, 3); i++) {
    const x = 20 + (r() - 0.5) * 18, len = r.range(10, 20), lean = (r() - 0.5) * 0.5;
    s.strand(x, 33, x + lean * len * 0.5, 33 - len * 0.5, x + lean * len, 33 - len, r.range(3, 4.5), 1, (t, sd) => (sd < -0.3 ? 0xffffff : tone(R.frost, 3.5 + t * 2.5 - sd)), (t) => (t > 0.6 ? 2 : 1));
  }
  for (let i = 0; i < 7; i++) { const x = r.int(4, 36), y = r.int(6, 30); if (s.has(x, y)) s.set(x, y, 0xffffff, 4); }
  return s;
}

/** Glassy crystal grass of the grotto: straight angular blades, bright edges, glowing tips. */
export function crystalGrass(r) {
  const W = 40, H = 36, s = new Spr(W, H);
  const n = r.int(9, 14);
  for (let i = 0; i < n; i++) {
    const u = (r() + r() - 1);
    const x0 = W / 2 + u * 9, len = r.range(10, H - 3), lean = u * 0.45 + (r() - 0.5) * 0.2, wd = r.range(2.2, 3.6);
    const x1 = x0 + lean * len, y1 = H - 1 - len, d = r();
    s.strand(x0, H - 1, (x0 + x1) / 2, (H - 1 + y1) / 2, x1, y1, wd, 1, (t, sd) => (sd < -0.5 && t > 0.2 ? tone(R.crystal, 6) : tone(R.crystal, 1.5 + d + t * 3 - sd)), (t) => (t > 0.7 ? 3 : t > 0.35 ? 1 : 0));
  }
  for (let i = 0; i < 5; i++) { const x = r.int(6, 34), y = r.int(4, 30); if (s.has(x, y)) s.set(x, y, 0xffffff, 4); }
  return s.rim(0.8, 'b');
}

// ---------------------------------------------------------------- ferns
/**
 * One frond, root at the bottom centre: a curving rachis with alternate pinnae, widest about a
 * third of the way up. Rosettes of these on tilted cards make a fern. o: { w, h, gap, ang, curl,
 * lobed, rw (rachis width), tone }.
 */
export function frond(r, RR, o = {}) {
  const W = o.w ?? 32, H = o.h ?? 72;
  const s = new Spr(W, H);
  const cx = W / 2, L = H - 2;
  const curl = (o.curl ?? r.range(0.06, 0.16)) * (r() < 0.5 ? -1 : 1);
  const xAt = (k) => cx + curl * L * (k / L) ** 2;
  const gap = o.gap ?? 3;
  const ang = o.ang ?? 0.45;
  let side = r() < 0.5 ? 1 : -1;
  for (let k = Math.round(L * 0.07); k < L - 1; k += gap / 2) {
    const t = k / L;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.98)), 0.65) * (1 - t * 0.3);
    const pl = (W / 2 - 1.5) * env * (0.85 + r() * 0.2);
    const x0 = xAt(k), y0 = H - 1 - k;
    if (pl < 1.5) { s.set(x0 + side, y0 - 1, tone(RR, 4 + t)); side = -side; continue; }
    const a = ang + t * 0.5 + (r() - 0.5) * 0.1;
    const x1 = x0 + side * pl * Math.cos(a), y1 = y0 - pl * Math.sin(a);
    const cxp = x0 + side * pl * 0.55 * Math.cos(a * 0.55), cyp = y0 - pl * 0.4 * Math.sin(a * 0.55);
    const base = 1.4 + t * 1.9 + (side > 0 ? -0.35 : 0.35) + (o.tone ?? 0);
    const wd = o.pw ?? Math.max(1.6, 2.6 + (1 - t) * 1.2 - (pl < 4 ? 1 : 0));
    s.strand(x0, y0, cxp, cyp, x1, y1, wd, 1, (tt, sd) => tone(RR, base + tt * 1.3 - sd * side * 0.75));
    // serrated pinnae (the big ferns): little lobes along the leaflet
    if (o.lobed && pl > 5) {
      for (let q = 2; q < pl - 1; q += 2) {
        const qt = q / pl, px = x0 + (x1 - x0) * qt, py = y0 + (y1 - y0) * qt;
        s.set(px, py - 1.5, tone(RR, base + qt * 1.3 + 0.8));
        s.set(px, py + 1.5, tone(RR, base + qt * 1.3 - 0.9));
      }
    }
    side = -side;
  }
  // the rachis on top: darker, a touch wider at the root
  const rw = o.rw ?? 2;
  s.strand(cx, H - 1, xAt(L * 0.5), H - 1 - L * 0.5, xAt(L), 1, rw, 1, (t, sd) => tone(RR, 1.6 + t * 1.6 - sd * 0.4 + (o.tone ?? 0)));
  // a fiddlehead curl at the tip now and then
  if (o.fiddle) { const x = xAt(L), y = 2; s.set(x + 1, y, tone(RR, 4)); s.set(x + 2, y + 1, tone(RR, 4)); s.set(x + 1, y + 2, tone(RR, 3)); }
  return s.rim(0.82, 'b');
}

/** Horsetail reeds: jointed stems with whorls of needles at every node and a cone on top. */
export function horsetail(r) {
  const W = 34, H = 128, s = new Spr(W, H);
  const n = r.int(2, 3);
  for (let i = 0; i < n; i++) {
    const x0 = W / 2 + (i - (n - 1) / 2) * 7 + (r() - 0.5) * 3;
    const len = (H - 4) * (i === 0 ? r.range(0.85, 1) : r.range(0.5, 0.85));
    const lean = (r() - 0.5) * 0.08;
    const seg = r.int(9, 12);
    const xAt = (k) => x0 + lean * k;
    // whorls first (behind the stem)
    for (let k = seg; k < len - 6; k += seg) {
      const t = k / len, y = H - 1 - k, x = xAt(k);
      const nl = Math.max(3, (1 - t) * 11 + 3);
      for (const sd of [-1, 1]) for (let q = 0; q < 3; q++) {
        const a = 0.35 + q * 0.32, l = nl * (1 - q * 0.18);
        s.line(x + sd, y, x + sd * l * Math.cos(a), y - l * Math.sin(a), (tt) => tone(R.dino, 2.4 + tt * 2.4 - q * 0.3));
      }
    }
    for (let k = 0; k < len; k++) {
      const y = H - 1 - k, x = xAt(k), t = k / len;
      const node = k % seg === 0 && k > 0;
      const w = t < 0.12 ? 3 : 2;
      for (let q = 0; q < w; q++) {
        const c = node ? (q === 0 ? 0x2e2a16 : 0x1a1c0e) : tone(R.dino, 3.2 + t * 1.6 - q * 1.1 + (k % seg === 1 ? 0.8 : 0));
        s.set(x + q - 1, y, c);
      }
    }
    // the spore cone
    const tx = xAt(len), ty = H - 1 - len;
    s.ell(tx, ty - 3, 2, 4, (dx, dy) => tone(R.amber, 2.5 - dx * 1.2 - dy * 0.6 + ((ty + dy * 4) & 1 ? 0.5 : 0)));
  }
  return s.rim(0.8, 'b');
}

// ---------------------------------------------------------------- ground cover (seen from above)
/** Clover: trios of round leaflets with pale chevrons, a few pompom flowers. */
export function clover(r, o = {}) {
  const W = 40, H = 40, s = new Spr(W, H);
  const n = r.int(10, 15);
  const pts = [];
  for (let i = 0; i < n; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * 14; pts.push({ x: 20 + Math.cos(a) * d, y: 20 + Math.sin(a) * d, rot: r() * 6.283, lr: r.range(2.2, 3.3), d: r() }); }
  pts.sort((a, b) => a.d - b.d);
  for (const p of pts) {
    for (let k = 0; k < 3; k++) {
      const la = p.rot + k * 2.094, lx = p.x + Math.cos(la) * p.lr * 0.95, ly = p.y + Math.sin(la) * p.lr * 0.95;
      s.ell(lx, ly, p.lr, p.lr, (dx, dy) => {
        const rr = dx * dx + dy * dy;
        let t = 2.4 + p.d * 1.2 + (-dx - dy) * 0.8;
        if (rr > 0.7) t -= 0.7;
        // the pale chevron on each leaflet
        const ux = dx * Math.cos(la) + dy * Math.sin(la), uy = -dx * Math.sin(la) + dy * Math.cos(la);
        if (Math.abs(Math.abs(uy) - (ux + 0.1) * 0.8) < 0.18 && ux > -0.2 && ux < 0.5) t += 1.6;
        return tone(R.clover, t);
      });
    }
    s.set(p.x, p.y, tone(R.clover, 1));
  }
  for (let i = 0; i < (o.flowers ?? r.int(1, 3)); i++) {
    const p = pts[Math.floor(r() * pts.length)];
    const fc = o.flowerRamp || (r() < 0.6 ? [0x8a7a86, 0xb8a8b4, 0xe2d8de, 0xfff6fa] : [0x7a3a5a, 0xb05a82, 0xe08ab0, 0xffc8e0]);
    s.ell(p.x + 1, p.y - 1, 2.2, 2.2, (dx, dy) => fc[Math.max(0, Math.min(3, Math.round(2.2 - dx - dy + (ph(p.x * 9 + dx * 4, dy * 4) - 0.5))))], o.flowerGlow || 0);
  }
  return s.rim(0.78, 'br');
}

/** Frost lichen rosettes (floors and walls): lobed rings, pale rims, dark hearts. */
export function lichen(r, RR = R.frost, o = {}) {
  const W = 40, H = 40, s = new Spr(W, H);
  const n = r.int(4, 7);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * 12, x = 20 + Math.cos(a) * d, y = 20 + Math.sin(a) * d, rad = r.range(3.5, 7);
    for (let k = 0; k < 14; k++) {
      const la = (k / 14) * 6.283 + r() * 0.3, lr = rad * r.range(0.75, 1);
      s.ell(x + Math.cos(la) * lr * 0.7, y + Math.sin(la) * lr * 0.7, lr * 0.38, lr * 0.38, (dx, dy) => tone(RR, 3.4 + (dx * Math.cos(la) + dy * Math.sin(la)) * 1.4 - dy * 0.5));
    }
    s.ell(x, y, rad * 0.45, rad * 0.45, (dx, dy) => tone(RR, 1.5 + (ph(x + dx * 5, y + dy * 5) > 0.5 ? 0.8 : 0)));
  }
  for (let i = 0; i < 9; i++) { const x = r.int(4, 36), y = r.int(4, 36); if (s.has(x, y)) s.set(x, y, o.speck ?? 0xe8fbff, o.glow ?? 2); }
  return s.rim(0.8, 'br');
}

/** Fallen leaves and a twig (under ferns and in the dino halls). */
export function litter(r) {
  const W = 40, H = 40, s = new Spr(W, H);
  const cols = [R.root, R.amber, R.dry, R.dino];
  s.line(r.int(4, 10), r.int(25, 34), r.int(28, 36), r.int(8, 18), (t) => tone(R.root, 2 + (t * 9 & 1)));
  for (let i = 0; i < r.int(9, 13); i++) {
    const RR = cols[Math.floor(r() * cols.length)];
    const a = r() * 6.283, d = Math.sqrt(r()) * 13;
    s.leaf(20 + Math.cos(a) * d, 20 + Math.sin(a) * d, r() * 6.283, r.range(5, 8), r.range(3, 5), RR, r.range(1.5, 3));
  }
  return s.rim(0.75, 'br');
}

/** Pebbles and grit on a bare cave floor (flat): a scatter of small round stones, lit from the upper left. */
export function pebbles(r, RR = R.pebble) {
  const W = 40, H = 40, s = new Spr(W, H);
  const n = r.int(10, 16);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * 15, rr = i < 3 ? r.range(2.6, 4) : r.range(1.2, 2.6);
    const base = r.range(2, 4.2);
    s.ell(20 + Math.cos(a) * d, 20 + Math.sin(a) * d, rr, rr * r.range(0.7, 1), (dx, dy) => tone(RR, base - dx * 1.2 - dy * 1.4));
  }
  for (let i = 0; i < 26; i++) { const x = r.int(4, 36), y = r.int(4, 36); s.set(x, y, tone(RR, r.int(1, 3))); } // grit
  return s.rim(0.7, 'br');
}

/** Star moss of the Core: a dark velvet mat with glowing star-specks. */
export function starMoss(r) {
  const W = 40, H = 40, s = new Spr(W, H);
  for (let i = 0; i < 9; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * 11;
    s.ell(20 + Math.cos(a) * d, 20 + Math.sin(a) * d, r.range(4, 8), r.range(4, 8), (dx, dy, x, y) => tone(R.void, 1.5 + (ph(x, y, 3) - 0.5) * 1.6 - dy * 0.6 - dx * 0.4));
  }
  for (let i = 0; i < 26; i++) {
    const x = r.int(3, 37), y = r.int(3, 37);
    if (!s.has(x, y)) continue;
    const big = r() < 0.3;
    s.set(x, y, big ? 0xffffff : tone(R.void, 6), 4);
    if (big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (s.has(x + dx, y + dy)) s.set(x + dx, y + dy, tone(R.void, 5), 3);
  }
  return s.rim(0.8, 'br');
}

// ---------------------------------------------------------------- fungus
/**
 * A cluster of mushrooms seen from the side: stems with rings and bulbs, domed, conical or flat
 * caps with dark gills, pale spots. Caps glow (spots most). o: { w, h, n, shape, glow, big,
 * spots (chance per texel), spotCol (hex; default the cap's lightest tone), spotGlow (level),
 * tall (the big one's stem as a share of the height) }.
 */
export function fungus(r, CAP, STEM = R.stem, o = {}) {
  const W = o.w ?? 40, H = o.h ?? 40, s = new Spr(W, H);
  const n = o.n ?? r.int(3, 6);
  const ms = [];
  for (let i = 0; i < n; i++) {
    const big = i === 0;
    ms.push({
      x: W / 2 + (big ? (r() - 0.5) * 4 : (r() - 0.5) * W * 0.62), sh: big ? H * (o.tall ? r.range(o.tall[0], o.tall[1]) : r.range(0.42, 0.56)) : H * r.range(0.12, 0.36),
      cr: big ? r.range(6, 8.5) * (o.big ?? 1) : r.range(2.4, 5), lean: (r() - 0.5) * 0.5, shape: o.shape || r.pick(['dome', 'dome', 'cone', 'flat']), d: big ? 0.45 : r(),
    });
  }
  ms.sort((a, b) => a.d - b.d);
  const gl = o.glow ?? 2;
  for (const m of ms) {
    const tx = m.x + m.lean * m.sh, ty = H - 1 - m.sh;
    const sw = m.cr > 5 ? 3.2 : 2.2;
    // the stem (a bulb at its foot) and a ring under the big caps
    s.strand(m.x, H - 1, m.x + m.lean * m.sh * 0.35, H - 1 - m.sh * 0.5, tx, ty, sw + 1, sw, (t, sd) => tone(STEM, 2.6 + t * 1.6 - sd * 1.1 + m.d * 0.4));
    s.ell(m.x, H - 1.5, sw * 0.8, 1.5, (dx) => tone(STEM, 2 - dx));
    if (m.cr > 4.5) { const ry = ty + m.sh * 0.25, rx = m.x + (tx - m.x) * 0.75; for (let q = -Math.ceil(sw); q <= Math.ceil(sw); q++) s.set(rx + q, ry, tone(STEM, q < 0 ? 4.5 : 3)); }
    // the cap
    const capH = m.shape === 'cone' ? m.cr * 1.15 : m.shape === 'flat' ? Math.max(2, m.cr * 0.42) : m.cr * 0.78;
    for (let yy = 0; yy <= Math.ceil(capH); yy++) {
      const h = yy / capH;
      let hw = m.shape === 'cone' ? m.cr * Math.pow(Math.max(0, 1 - h), 0.85) : m.shape === 'flat' ? m.cr * Math.sqrt(Math.max(0, 1 - h ** 4)) : m.cr * Math.sqrt(Math.max(0, 1 - h * h));
      if (hw < 0.5) continue;
      for (let xx = Math.round(tx - hw); xx <= Math.round(tx + hw); xx++) {
        const dx = (xx - tx) / Math.max(1, hw), y = ty - yy;
        let t = 2.6 + h * 1.8 - dx * 1.0 + m.d * 0.5, g = gl;
        if (yy === 0) { t = 3.6 - dx * 0.5; g = Math.min(4, gl + 1); } // the bright rim
        if (h > 0.2 && ph(xx, y, m.x * 13 | 0) < (o.spots ?? 0.1)) { // spots
          s.set(xx, y, o.spotCol ?? tone(CAP, 6), o.spotGlow ?? 4);
          continue;
        }
        s.set(xx, y, tone(CAP, t), g);
      }
    }
    // gills under the rim
    const gw = m.cr * 0.82;
    for (let xx = Math.round(tx - gw); xx <= Math.round(tx + gw); xx++) if (!s.has(xx, ty + 1) || Math.abs(xx - tx) > sw / 2) s.set(xx, ty + 1, (xx & 1) ? tone(CAP, 1) : tone(CAP, 2), 1);
  }
  return s.rim(0.8, 'b');
}

/** Pale puffballs huddled on the ground. */
export function puffballs(r) {
  const W = 32, H = 20, s = new Spr(W, H);
  const n = r.int(3, 6);
  const bs = [];
  for (let i = 0; i < n; i++) bs.push({ x: 16 + (r() - 0.5) * 22, rr: i ? r.range(2.2, 4) : r.range(4.5, 6), d: r() });
  bs.sort((a, b) => a.d - b.d);
  for (const b of bs) {
    s.ell(b.x, H - 1 - b.rr * 0.85, b.rr, b.rr * 0.9, (dx, dy, x, y) => {
      let t = 3.6 - dx * 1.1 - dy * 1.3 + b.d * 0.4;
      if (ph(x, y, 7) < 0.12 && dy < 0.4) t += 1.4; // warts
      return tone(R.stem, t);
    }, (dx, dy) => (dy < -0.4 ? 1 : 0));
  }
  return s.rim(0.78, 'b');
}

// ---------------------------------------------------------------- flowers
/**
 * A bioluminescent flower on a slim stem: 'bell' (a drooping glowing bell), 'orb' (a lantern
 * bulb), 'star' (open petals round a bright heart) or 'spike' (a spire of little florets).
 */
export function flower(r, PET, kind = 'bell', o = {}) {
  const W = o.w ?? 24, H = o.h ?? 48, s = new Spr(W, H);
  const SR = o.stem || R.fern;
  const lean = (r() - 0.5) * 6;
  const top = { x: W / 2 + lean, y: H * (kind === 'bell' ? 0.2 : 0.16) };
  // leaves at the foot and on the stem
  for (let i = 0; i < r.int(2, 3); i++) {
    const side = i & 1 ? 1 : -1, y = H - 2 - i * r.range(4, 7);
    s.leaf(W / 2, y, side > 0 ? -0.55 - r() * 0.3 : Math.PI + 0.55 + r() * 0.3, r.range(6, 9), r.range(3, 4.4), SR, 1.6);
  }
  if (kind === 'bell') {
    // the stem arches over and the bell hangs from its end
    const hx = top.x + 4, hy = top.y;
    s.strand(W / 2, H - 1, W / 2 + lean * 0.4, H * 0.45, top.x, top.y - 2, 2, 1, (t, sd) => tone(SR, 2 + t * 2 - sd * 0.6));
    s.line(top.x, top.y - 2, hx, hy, tone(SR, 3.5));
    for (let yy = 0; yy < 7; yy++) {
      const hw = 1.2 + yy * 0.5 + (yy === 6 ? 0.8 : 0);
      for (let xx = Math.round(hx - hw); xx <= Math.round(hx + hw); xx++) {
        const dx = (xx - hx) / hw;
        s.set(xx, hy + 1 + yy, tone(PET, 3 + (1 - yy / 6) * 1.2 - dx * 1.1 + (yy === 6 ? 1 : 0)), yy > 4 ? 4 : 3);
      }
    }
    s.set(hx, hy + 8, tone(PET, 6), 4); s.set(hx, hy + 9, tone(PET, 5), 4); // the glowing heart
  } else {
    s.strand(W / 2, H - 1, W / 2 + lean * 0.3, H * 0.5, top.x, top.y, 2, 1, (t, sd) => tone(SR, 2 + t * 2 - sd * 0.6));
    if (kind === 'orb') {
      s.ell(top.x, top.y - 2, 3.4, 3.8, (dx, dy) => tone(PET, 4.2 - dx * 1.2 - dy * 1.2 + (dx * dx + dy * dy > 0.75 ? -1 : 0)), (dx, dy) => (dx * dx + dy * dy < 0.4 ? 4 : 3));
      s.set(top.x - 1, top.y - 4, 0xffffff, 4);
      // bracts holding it
      s.set(top.x - 2, top.y + 1, tone(SR, 3)); s.set(top.x + 2, top.y + 1, tone(SR, 3)); s.set(top.x - 3, top.y, tone(SR, 4)); s.set(top.x + 3, top.y, tone(SR, 4));
    } else if (kind === 'star') {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + ((i + 0.5) / n - 0.5) * Math.PI * 1.25;
        s.strand(top.x, top.y, top.x + Math.cos(a) * 3, top.y + Math.sin(a) * 3, top.x + Math.cos(a) * 6.5, top.y + Math.sin(a) * 5.5, 3, 1.5, (t, sd) => tone(PET, 3 + t * 2 - sd * 0.7), (t) => (t > 0.5 ? 3 : 2));
      }
      s.ell(top.x, top.y, 1.6, 1.4, tone(PET, 6), 4);
    } else {
      // spike: florets up the top third
      for (let k = 0; k < 12; k++) {
        const t = k / 11, y = top.y + 8 - k * 1.1, x = top.x + (k & 1 ? 1.2 : -1.2) * (1 - t * 0.6);
        s.ell(x, y, 1.7 - t * 0.7, 1.2, (dx, dy) => tone(PET, 3 + t * 2 - dx - dy * 0.5), t > 0.6 ? 4 : 3);
      }
    }
  }
  return s.rim(0.82, 'b');
}

// ---------------------------------------------------------------- hanging things (root on the top row)
/** Roots through the ceiling: a clod of earth, wandering tendrils with hairs and pale tips. */
export function roots(r, o = {}) {
  const W = o.w ?? 32, H = o.h ?? 128, s = new Spr(W, H);
  const n = o.n ?? r.int(3, 6);
  const todo = [];
  for (let i = 0; i < n; i++) todo.push({ x: W / 2 + (r() - 0.5) * W * 0.45, y: 2, len: (H - 4) * (i === 0 ? r.range(0.8, 1) : r.range(0.35, 0.95)), w0: i < 2 ? 3 : 2, vx: (r() - 0.5) * 0.3, gen: 0 });
  while (todo.length) {
    const T = todo.pop();
    let { x, y, vx } = T;
    for (let k = 0; k < T.len && y < H - 1; k++) {
      vx += (r() - 0.5) * 0.2;
      vx = Math.max(-0.5, Math.min(0.5, vx));
      x = Math.max(2, Math.min(W - 3, x + vx));
      y += 1;
      const t = k / T.len, w = Math.max(1, Math.round(T.w0 * (1 - t * 0.9)));
      for (let q = 0; q < w; q++) s.set(x + q - (w >> 1), y, tone(R.root, (t > 0.9 ? 5.5 : 2.6 + t * 1.4) + (q === 0 && w > 1 ? 0.9 : q === w - 1 && w > 1 ? -0.8 : 0) + (ph(x, y) - 0.5) * 0.7));
      if (t > 0.15 && r() < 0.06) { const sd = r() < 0.5 ? -1 : 1, hl = r.int(2, 5); s.line(x + sd, y, x + sd * hl, y + hl * 0.9, tone(R.root, 4.5)); }
      if (T.gen < 2 && t > 0.1 && t < 0.6 && r() < 0.018) todo.push({ x, y, len: (T.len - k) * r.range(0.4, 0.8), w0: 1, vx: vx + (r() < 0.5 ? -0.4 : 0.4), gen: T.gen + 1 });
    }
  }
  // the clod of earth they come out of
  for (let i = 0; i < 9; i++) s.ell(W / 2 + (r() - 0.5) * W * 0.55, r.range(0, 2.5), r.range(2, 4), r.range(1.4, 2.6), (dx, dy, x, y) => tone(R.dirt, 2.4 - dy - (ph(x, y, 5) < 0.3 ? 1 : 0)));
  return s.rim(0.8, 'r');
}

/** Hanging vines: a wandering stem with alternate leaves, curling tendrils, glowing berries. */
export function vine(r, o = {}) {
  const W = o.w ?? 32, H = o.h ?? 160, s = new Spr(W, H);
  const LR = o.leaf || R.vine;
  const n = o.n ?? r.int(1, 2);
  for (let i = 0; i < n; i++) {
    const x0 = W / 2 + (i ? (r() - 0.5) * 12 : (r() - 0.5) * 4), ph0 = r() * 6.283, len = (H - 3) * (i ? r.range(0.4, 0.75) : r.range(0.85, 1));
    const amp = r.range(1.5, 3.2);
    const xAt = (k) => x0 + Math.sin(k * 0.085 + ph0) * amp + Math.sin(k * 0.21 + ph0 * 2) * 0.8;
    for (let k = 0; k < len; k++) { const x = xAt(k), y = k + 2; s.set(x, y, tone(LR, 1.4 + (k / len))); if (k < len * 0.4) s.set(x + 1, y, tone(LR, 1)); }
    let side = r() < 0.5 ? 1 : -1;
    for (let k = r.int(3, 6); k < len - 2; k += r.int(4, 7)) {
      const x = xAt(k), y = k + 2, t = k / len;
      const sz = 1 - t * 0.35;
      s.leaf(x + side, y, side > 0 ? 0.5 + r() * 0.5 : Math.PI - 0.5 - r() * 0.5, r.range(5, 7.5) * sz, r.range(3.4, 4.6) * sz, LR, 1.8 + (side > 0 ? -0.3 : 0.4), o.leafGlow || 0);
      if (r() < 0.18) { const cx = x - side * 2, cy = y + 2; s.set(cx, cy, tone(LR, 4)); s.set(cx - side, cy + 1, tone(LR, 4)); s.set(cx - side, cy + 2, tone(LR, 3)); s.set(cx, cy + 3, tone(LR, 3)); }
      if (o.berry && r() < (o.berryP ?? 0.16)) {
        const bx = x - side * 1.5, by = y + 3;
        for (const [dx, dy] of [[0, 0], [1, 1], [-1, 1], [0, 2]]) s.set(bx + dx, by + dy, tone(o.berry, dy === 0 ? 6 : 4.5 - dx * 0.5), 4);
      }
      side = -side;
    }
    // a bud at the tip
    s.set(xAt(len), len + 2, tone(LR, 5));
  }
  // moss tuft it hangs from
  for (let i = 0; i < 6; i++) s.ell(W / 2 + (r() - 0.5) * 14, r.range(0, 2), r.range(2, 3.5), 1.6, (dx, dy, x, y) => tone(R.moss, 2.5 - dy + (ph(x, y, 9) - 0.5)));
  return s.rim(0.82, 'r');
}

/** A curtain of moss hanging from a ledge: a dense mat and ragged strands of uneven length. */
export function mossDrape(r, o = {}) {
  const W = o.w ?? 48, H = o.h ?? 56, s = new Spr(W, H);
  const RR = o.ramp || R.moss;
  for (let x = 3; x < W - 3; x++) {
    if (r() < 0.25) continue;
    const edge = Math.min(x - 3, W - 4 - x) / (W / 2);
    const len = Math.max(2, (H - 6) * Math.min(1, edge * 1.6 + 0.1) * r.range(0.25, 1));
    let xx = x;
    for (let k = 0; k < len; k++) {
      if (r() < 0.12) xx += r() < 0.5 ? -1 : 1;
      const t = k / len;
      s.set(xx, 4 + k, tone(RR, 2.2 + t * 1.8 + (ph(xx, k) - 0.5) * 0.9 - (x & 1) * 0.5), o.glowTip && t > 0.85 ? o.glowTip : 0);
    }
  }
  for (let x = 2; x < W - 2; x += 2) s.ell(x, r.range(1, 3), r.range(1.6, 2.8), r.range(1.6, 3), (dx, dy, X, Y) => tone(RR, 2.6 - dy * 1.2 - dx * 0.3 + (ph(X, Y, 4) - 0.5)));
  return s.rim(0.8, 'r');
}

/** Mycelium threads: pale glowing filaments with beads and a drop at the end. */
export function mycelThreads(r, o = {}) {
  const W = 24, H = o.h ?? 96, s = new Spr(W, H);
  const RR = o.ramp || R.violet;
  for (let i = 0; i < r.int(4, 7); i++) {
    const x0 = 12 + (r() - 0.5) * 16, len = (H - 4) * r.range(0.3, 1), ph0 = r() * 6;
    let lastBead = 0;
    for (let k = 0; k < len; k++) {
      const x = x0 + Math.sin(k * 0.12 + ph0) * 1.2;
      s.set(x, k + 2, tone(RR, 4.4 + (k & 1) * 0.6), 1);
      if (k - lastBead > 7 && r() < 0.12) { lastBead = k; s.set(x, k + 2, 0xffffff, 4); s.set(x + 1, k + 2, tone(RR, 6), 4); s.set(x, k + 3, tone(RR, 5), 3); }
    }
    const x = x0 + Math.sin(len * 0.12 + ph0) * 1.2;
    s.ell(x, len + 3, 1.4, 1.8, (dx, dy) => (dx + dy < -0.4 ? 0xffffff : tone(RR, 5.5)), 4);
  }
  for (let i = 0; i < 5; i++) s.ell(12 + (r() - 0.5) * 14, 1, 2.5, 1.5, (dx, dy, x, y) => tone(RR, 2 + (ph(x, y) > 0.5 ? 1 : 0)), 1);
  return s;
}

/** Frost fringe: a row of little icicles and rime hanging off a ceiling. */
export function rimeFringe(r) {
  const W = 40, H = 40, s = new Spr(W, H);
  for (let i = 0; i < r.int(7, 11); i++) {
    const x = r.range(4, 36), len = r.range(6, 36), w = r.range(2.2, 3.6);
    s.strand(x, 1, x + (r() - 0.5) * 2, len * 0.5, x + (r() - 0.5) * 2, len, w, 1, (t, sd) => (sd < -0.4 ? 0xffffff : tone(R.frost, 4.2 + t - sd * 1.1)), (t) => (t > 0.85 ? 3 : 1));
  }
  for (let x = 1; x < W - 1; x++) for (let y = 0; y < 3; y++) if (r() < 0.7) s.set(x, y, tone(R.frost, 4 + r() * 2), 1);
  return s.rim(0.85, 'r');
}

// ---------------------------------------------------------------- dry, hot and strange
/** Dead thorn scrub: forking grey twigs with thorns and a few shrivelled leaves. */
export function thorn(r) {
  const W = 48, H = 40, s = new Spr(W, H);
  const TR = [0x1e1814, 0x2e2620, 0x40362e, 0x56493e, 0x6e5e50, 0x8c7a68];
  const grow = (x, y, a, len, w, d) => {
    const x1 = x + Math.cos(a) * len, y1 = y - Math.sin(a) * len;
    s.strand(x, y, (x + x1) / 2 + (r() - 0.5) * 3, (y + y1) / 2, x1, y1, w, Math.max(1, w - 1), (t, sd) => tone(TR, 2.5 + t - sd * 0.9));
    for (let k = 2; k < len; k += 3) if (r() < 0.45) { const t = k / len, px = x + (x1 - x) * t, py = y + (y1 - y) * t; s.set(px + (r() < 0.5 ? -1 : 1), py - 1, tone(TR, 4)); }
    if (d >= 3 || len < 4) { if (r() < 0.6) s.leaf(x1, y1, -a - 0.6, 3.5, 2.2, R.dry, 2); return; }
    const k = r.int(2, 3);
    for (let i = 0; i < k; i++) grow(x1, y1, a + (i - (k - 1) / 2) * r.range(0.45, 0.8), len * r.range(0.55, 0.75), Math.max(1, w - 1), d + 1);
  };
  for (let i = 0; i < r.int(3, 4); i++) grow(24 + (r() - 0.5) * 6, H - 1, Math.PI / 2 + (r() - 0.5) * 1.1, r.range(9, 14), 2.6, 0);
  return s.rim(0.85, 'b');
}

/** A stone rose: a tight rosette of fleshy dusty leaves with blushing tips. */
export function stoneRose(r) {
  const W = 32, H = 24, s = new Spr(W, H);
  const n = r.int(9, 13);
  const ls = [];
  for (let i = 0; i < n; i++) ls.push({ a: Math.PI / 2 + ((i + 0.5) / n - 0.5) * Math.PI * 1.15 + (r() - 0.5) * 0.15, l: r.range(6, 11) * (1 - Math.abs((i + 0.5) / n - 0.5) * 0.7), d: Math.abs((i + 0.5) / n - 0.5) });
  ls.sort((a, b) => a.d - b.d);
  ls.reverse();
  for (const L of ls) {
    s.leaf(16, H - 2, -L.a, L.l, r.range(4, 5.2), R.succ, 2.2 - L.d, 0, false);
    const tx = 16 + Math.cos(-L.a) * L.l * 0.95, ty = H - 2 + Math.sin(-L.a) * L.l * 0.95;
    s.set(tx, ty, tone(R.pink, 4)); s.set(tx - Math.cos(-L.a), ty - Math.sin(-L.a), tone(R.pink, 3));
  }
  s.ell(16, H - 6, 2.2, 2, (dx, dy) => tone(R.succ, 5 - dy), 0);
  return s.rim(0.8, 'b');
}

/** Ash weed: jagged charcoal stems, ragged leaves and glowing ember pods at the tips. */
export function ashWeed(r) {
  const W = 40, H = 52, s = new Spr(W, H);
  for (let i = 0; i < r.int(2, 4); i++) {
    let x = 20 + (r() - 0.5) * 8, y = H - 1;
    const len = r.range(22, 48), segs = r.int(4, 6), lean = (r() - 0.5) * 0.7;
    let px = x, py = y;
    for (let k = 1; k <= segs; k++) {
      const t = k / segs;
      const nx = x + lean * len * t + (r() - 0.5) * 4, ny = y - len * t;
      s.line(px, py, nx, ny, tone(R.ash, 3 + t * 2));
      if (k < segs * 0.75) s.line(px + 1, py, nx + 1, ny, tone(R.ash, 2));
      if (k < segs && r() < 0.7) {
        const sd = r() < 0.5 ? -1 : 1, ll = r.range(3, 7);
        s.line(nx, ny, nx + sd * ll, ny - ll * 0.6, tone(R.ash, 4));
        s.set(nx + sd * ll * 0.5, ny - ll * 0.3 + 1, tone(R.ash, 5));
        if (r() < 0.5) s.ell(nx + sd * ll, ny - ll * 0.6, 1.3, 1.3, (dx, dy) => tone(R.ember, 4 - dy * 1.5 - dx * 0.5), 3);
      }
      px = nx; py = ny;
    }
    s.ell(px, py - 1, 2.2, 2.6, (dx, dy) => tone(R.ember, 4.4 - dy * 1.6 - dx * 0.6 + (dx * dx + dy * dy < 0.25 ? 1.5 : 0)), (dx, dy) => (dx * dx + dy * dy < 0.4 ? 4 : 3));
    s.set(px, py - 5, tone(R.ember, 6), 4); // a spark lifting off
  }
  return s.rim(0.85, 'b');
}

/** Void tendrils: curling glowing filaments ending in little spirals. */
export function voidTendril(r) {
  const W = 28, H = 72, s = new Spr(W, H);
  for (let i = 0; i < r.int(3, 5); i++) {
    const x0 = 14 + (r() - 0.5) * 10, len = (H - 10) * r.range(0.45, 1), ph0 = r() * 6, amp = r.range(1.5, 4);
    let x = x0, y = H - 1;
    for (let k = 0; k < len; k++) {
      x = x0 + Math.sin(k * 0.09 + ph0) * amp * (k / len);
      y = H - 1 - k;
      const t = k / len;
      s.set(x, y, tone(R.void, 2 + t * 3), t > 0.6 ? 2 : t > 0.3 ? 1 : 0);
      if (t < 0.3) s.set(x + 1, y, tone(R.void, 1.5));
    }
    const dir = r() < 0.5 ? 1 : -1;
    for (let a = 0; a < 9; a += 0.25) {
      const rr = 3.2 * (1 - a / 9);
      s.set(x + dir * (Math.cos(a) * rr - rr), y - 1 - Math.sin(a) * rr * 1.1, tone(R.void, 5 + a / 9), a > 6 ? 4 : 3);
    }
  }
  return s.rim(0.85, 'b');
}

// ---------------------------------------------------------------- the atlas
let ATLAS = null;
/** Paint every sprite once (cached for the session): the atlas with named variant lists. */
export function vegetationAtlas() {
  if (ATLAS) return ATLAS;
  const t0 = performance.now();
  const A = new Atlas(1024, 1024);
  let seed = 9001;
  const put = (name, fn, n = 1) => { for (let i = 0; i < n; i++) A.put(name, fn(rng(seed += 7919))); };
  // grasses
  put('grass', (r) => grassTuft(r, R.grass, { tone: -0.35, specks: r() < 0.4 ? 2 : 0 }), 4);
  put('grassTall', (r) => grassTuft(r, R.grass, { w: 48, h: 64, n: r.int(14, 20), min: 0.35, droop: 0.3, seeds: r.int(1, 3), seedCol: R.dry }), 3);
  put('mossGrass', (r) => grassTuft(r, R.moss, { glowTip: r() < 0.5 ? 1 : 0, specks: r.int(1, 3), speckCol: R.cyan, speckGlow: 4 }), 4);
  put('paleGrass', (r) => grassTuft(r, R.pale, { n: r.int(10, 15), min: 0.3, w1: 2.4, broken: 0.2 }), 3);
  put('dryGrass', (r) => grassTuft(r, R.dry, { n: r.int(11, 17), broken: 0.35, seeds: r.int(1, 3), droop: 0.3 }), 4);
  put('frostGrass', (r) => frostGrass(r), 3);
  put('crystalGrass', (r) => crystalGrass(r), 3);
  put('ashGrass', (r) => grassTuft(r, R.ash, { n: r.int(8, 12), w: 40, h: 30, broken: 0.4, tone: 1, specks: 3, speckCol: R.ember, speckGlow: 4 }), 2);
  put('voidGrass', (r) => grassTuft(r, R.void, { n: r.int(10, 14), w: 40, h: 34, stiff: true, glowTip: 3, tone: 0.6 }), 2);
  // mycelium tufts: pale threads standing up off the mushroom beds, their tips aglow
  put('fungusGrass', (r) => grassTuft(r, R.stem, { n: r.int(14, 20), w: 40, h: 22, w0: 1, w1: 1.7, glowTip: 2, tone: -0.4, specks: 3, speckCol: r() < 0.5 ? R.violet : R.cyan, speckGlow: 4 }), 3);
  // ferns
  put('frond', (r) => frond(r, R.fern, { fiddle: r() < 0.3 }), 3);
  put('frondPale', (r) => frond(r, R.pale, { w: 28, h: 56 }), 2);
  put('giantFrond', (r) => frond(r, R.dino, { w: 72, h: 224, gap: 5, ang: 0.32, lobed: true, rw: 4, pw: 4 }), 2);
  put('horsetail', (r) => horsetail(r), 2);
  // ground cover
  put('clover', (r) => clover(r), 3);
  put('cloverGlow', (r) => clover(r, { flowers: 3, flowerRamp: [0x1a6a72, 0x3ab0b4, 0x8ef0e6, 0xe8fffa], flowerGlow: 3 }), 2);
  put('lichenFrost', (r) => lichen(r, R.frost), 2);
  put('lichenRust', (r) => lichen(r, [0x3a1e0e, 0x5e3014, 0x8a4a1c, 0xb46a28, 0xd28e3c, 0xeab25a, 0xfadc8a], { speck: 0xfff0b8, glow: 0 }), 2);
  put('lichenCrystal', (r) => lichen(r, R.crystal, { speck: 0xe8fbff, glow: 3 }), 2);
  put('litter', (r) => litter(r), 2);
  put('starMoss', (r) => starMoss(r), 2);
  // fungus
  put('fungusCyan', (r) => fungus(r, R.cyan), 2);
  put('fungusViolet', (r) => fungus(r, R.violet, R.stem, { shape: r() < 0.5 ? 'cone' : undefined }), 2);
  put('fungusPink', (r) => fungus(r, R.pink), 1);
  put('fungusBlue', (r) => fungus(r, R.blue, R.stem, { shape: 'dome' }), 2);
  put('fungusAmber', (r) => fungus(r, R.amber, R.stem, { shape: 'flat', glow: 1 }), 1);
  put('fungusBrown', (r) => fungus(r, R.brownCap, R.stem, { glow: 0, w: 36, h: 32 }), 2);
  put('puffballs', (r) => puffballs(r), 2);
  // wave 4: the caves grow mushrooms, not grass: brown caps, red toadstools, ink caps, tall
  // glowing stalks, buttons, ember and frost caps
  put('brownCap', (r) => fungus(r, R.brownCap, R.stem, { shape: 'flat', glow: 0, n: r.int(1, 3), w: 36, h: 30, big: 1.25, spots: 0.03, spotCol: 0xd8b48a, spotGlow: 0 }), 3);
  put('toadstool', (r) => fungus(r, R.red, R.stem, { shape: 'dome', glow: 0, n: r.int(1, 3), w: 34, h: 34, big: 1.05, spots: 0.16, spotCol: 0xf4ece0, spotGlow: 0 }), 3);
  put('inkcap', (r) => fungus(r, R.ink, R.stem, { shape: 'cone', glow: 0, n: r.int(2, 4), w: 30, h: 48, tall: [0.48, 0.62], spots: 0.04, spotCol: 0x14121a, spotGlow: 0 }), 2);
  put('glowShroom', (r) => fungus(r, r() < 0.5 ? R.cyan : R.blue, R.stem, { shape: r() < 0.5 ? 'dome' : 'cone', n: r.int(2, 3), w: 32, h: 64, big: 0.8, tall: [0.62, 0.78] }), 2);
  put('glowShroom', (r) => fungus(r, R.violet, R.stem, { shape: 'dome', n: r.int(2, 3), w: 32, h: 60, big: 0.8, tall: [0.6, 0.75] }), 1);
  put('mushTiny', (r) => fungus(r, r() < 0.5 ? R.amber : R.cyan, R.stem, { n: r.int(5, 8), w: 30, h: 16, big: 0.55, shape: 'dome' }), 2);
  put('mushTiny', (r) => fungus(r, R.brownCap, R.stem, { n: r.int(5, 8), w: 30, h: 16, big: 0.55, shape: 'dome', glow: 0, spots: 0.02, spotGlow: 0 }), 1);
  put('emberCap', (r) => fungus(r, R.ember, R.ash, { shape: r() < 0.5 ? 'flat' : 'dome', n: r.int(2, 4), w: 34, h: 30, glow: 2 }), 2);
  put('frostCap', (r) => fungus(r, R.frost, R.frost, { shape: 'cone', n: r.int(2, 4), w: 32, h: 36, glow: 1 }), 2);
  put('pebbles', (r) => pebbles(r), 3);
  // flowers
  put('flowerCyan', (r) => flower(r, R.cyan, 'bell'), 1);
  put('flowerCyan', (r) => flower(r, R.cyan, 'orb'), 1);
  put('flowerViolet', (r) => flower(r, R.violet, 'star'), 1);
  put('flowerViolet', (r) => flower(r, R.violet, 'spike'), 1);
  put('flowerPink', (r) => flower(r, R.pink, 'bell'), 1);
  put('flowerPink', (r) => flower(r, R.pink, 'star'), 1);
  put('flowerEmber', (r) => flower(r, R.ember, 'orb', { stem: R.ash }), 1);
  put('flowerEmber', (r) => flower(r, R.ember, 'spike', { stem: R.ash }), 1);
  put('flowerFrost', (r) => flower(r, R.frost, 'star', { stem: R.frost }), 1);
  put('flowerFrost', (r) => flower(r, R.crystal, 'bell', { stem: R.frost }), 1);
  // dry
  put('thorn', (r) => thorn(r), 2);
  put('stoneRose', (r) => stoneRose(r), 2);
  put('ashWeed', (r) => ashWeed(r), 3);
  put('voidTendril', (r) => voidTendril(r), 3);
  // hanging
  put('roots', (r) => roots(r), 3);
  put('rootsShort', (r) => roots(r, { h: 56, n: r.int(4, 7) }), 2);
  put('vine', (r) => vine(r), 2);
  put('vineBerry', (r) => vine(r, { berry: R.cyan, n: 2 }), 1);
  put('vineBerry', (r) => vine(r, { berry: R.pink, n: 2 }), 1);
  put('vineDino', (r) => vine(r, { leaf: R.dino, n: 2 }), 2);
  put('glowVine', (r) => vine(r, { berry: R.amber, n: 3 }), 2); // cave vines hung with glow berries
  put('mossDrape', (r) => mossDrape(r, { glowTip: 1 }), 2);
  put('rootDrape', (r) => mossDrape(r, { ramp: R.root, h: 40 }), 1);
  put('mycel', (r) => mycelThreads(r), 2);
  put('mycelCyan', (r) => mycelThreads(r, { ramp: R.cyan, h: 72 }), 1);
  put('rime', (r) => rimeFringe(r), 2);
  put('voidHang', (r) => voidTendril(r).vflip(), 2);
  A.ms = performance.now() - t0;
  A.tex = A.texture();
  ATLAS = A;
  return A;
}
export { mix, shade };

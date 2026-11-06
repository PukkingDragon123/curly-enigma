// Tool icons (32×32): pickaxes per tier, chisels, brushes, drills, x-ray lamps, support beams
// and glow stakes. Hand-pixel style on top of gearKit: crisp ink outline, part seams, planes
// instead of gradients, wood grain, leather / twine wraps, hammer marks, rivets and glints.
import {
  M, mat, mix, hash2, vnoise, T, solid, step, paint, ink, seam, cast, bevel, sweep, facetSweep, stick, wrapStick,
  dents, pits, rivet, stitch, line, glint, scratch, diagMask, diagAt, RAMPS, shadowOf, liftOf,
} from './gearKit.js';
import { glowHalo } from './shade.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SQ = Math.SQRT2;
const Ad = (x, y) => [(x - y) / 2, x + y - 31];
const isTop = (m, x, y) => !m.get(x - 1, y) || !m.get(x, y - 1);
const isBot = (m, x, y) => !m.get(x + 1, y) || !m.get(x, y + 1);

/** Local frame on the main diagonal: origin (A0, d0), u px toward the top-right, w px toward the bottom-right. */
function frame(A0, d0) {
  return {
    at: (u, w) => diagAt(A0 + u / SQ, d0 + w * SQ),
    uw: (x, y) => { const [A, d] = Ad(x, y); return [(A - A0) * SQ, (d - d0) / SQ]; },
    poly(pts) { return M().poly(pts.map(([u, w]) => this.at(u, w))); },
  };
}

// ---------------------------------------------------------------- pickaxes
const PICK_TIER = {
  pick_rusty: { head: 0x7c706a, cont: 1.0, rust: true, wood: 'old', wrap: 'twine', chip: true, crack: true },
  pick_first: { head: 0xc87a44, cont: 1.12, wood: 'ash', wrap: 0x5a3020, rough: true },
  pick_copper: { head: 0xd4703a, cont: 1.2, wood: 'wood', wrap: 0x7a4426 },
  pick_iron: { head: 0x7e8590, cont: 1.18, wood: 'wood', wrap: 0x5a3422, dentK: 1.4 },
  pick_steel: { head: 0xa8b8c8, cont: 1.32, wood: 'dark', wrap: 0x4a2a1c, collar: 0xcf9a3a, stitch: 0xe0c890 },
  pick_mithril: { head: 0x9ce0e6, cont: 1.3, wood: 'dark', wrap: 0x2a3e66, collar: 0xe8b848, inlay: 0xf4e08a, stitch: 0xc8dcff },
  pick_adamant: { head: 0x34c88c, cont: 1.35, wood: 'dark', wrap: 0x4a1e4a, collar: 0xf0c848, gem: 0xe02a5a, inlay: 0xf0d070, stitch: 0xe8b8e8 },
  pick_starmetal: { head: 0xf2c870, cont: 1.3, wood: 'dark', wrap: 0x1e2448, collar: 0xe8ecf8, gem: 0x9ad8ff, stars: true, stitch: 0xf0e0a0 },
};

function woodRamp(kind) {
  if (kind === 'old') return RAMPS.oldWood();
  if (kind === 'ash') return RAMPS.ash();
  if (kind === 'dark') return RAMPS.darkWood();
  return RAMPS.wood();
}

/** A carved handle along the diagonal on stripes d0-1.5..d0+1.5 with a flared butt. */
function handle(pc, A0, A1, d0, W, o = {}) {
  const [x0, y0] = diagAt(A0, d0), [x1, y1] = diagAt(A1, d0);
  const m = stick(pc, x0, y0, x1, y1, o.r ?? 1.1, W, { tones: o.tones || [1, 2, 3, 3, 4, 5], grain: true, seed: o.seed || 7, knots: o.knots || [0.58] });
  // flared butt knob
  const [bx, by] = diagAt(A0 + 0.4, d0);
  const butt = M().disk(bx, by, (o.r ?? 1.1) + 0.75);
  seam(pc, butt, 'shadow');
  butt.each((x, y) => { const t = (x + 0.5 - bx) * -0.6 + (y + 0.5 - by) * -0.8; pc.set(x, y, W[t > 0.6 ? 2 : t > -0.4 ? 3 : t > -1.1 ? 4 : 5]); });
  // end grain ring on the butt
  pc.set(bx - 0.5, by + 0.5, W[5]);
  if (o.crack) {
    // a split running up the grain
    for (let i = 0; i < 7; i++) { const [x, y] = diagAt(A0 + 3 + i * 0.5, d0 + (i % 3 === 2 ? 1 : 0)); if (m.get(x, y)) pc.set(x, y, W[6]); }
  }
  return { m, x0, y0, x1, y1 };
}

function pickaxe(pc, id, spec) {
  const T0 = PICK_TIER[id] || { head: spec.c || 0x9aa0a8, cont: 1.15, wood: 'wood', wrap: 0x6a3a22 };
  const W = woodRamp(T0.wood);
  const R = mat(T0.head, { cont: T0.cont, hs: 1.1 });
  const d0 = -0.5, Ae = 7.2; // handle stripes, eye position along the diagonal
  const L = frame(Ae, d0);
  // --- handle (behind the head)
  const h = handle(pc, -13, Ae + 2.2, d0, W, { crack: T0.crack, seed: id.length });
  // wrap near the butt
  if (T0.wrap) {
    const twine = T0.wrap === 'twine';
    const WR = twine ? RAMPS.twine() : mat(T0.wrap, { cont: 1.05 });
    wrapStick(pc, h.x0, h.y0, h.x1, h.y1, 1.1, 2.6, 10.5, WR, { period: twine ? 1.5 : 2.3, slant: twine ? 1.1 : 0.75, grow: 0.6, tones: [1, 2, 3, 3, 4, 5] });
    if (twine) {
      // a loose end dangling from the top turn
      const [tx, ty] = diagAt(-13 + 10.5 / SQ, d0 + 1.8);
      pc.set(tx, ty, WR[2]); pc.set(tx, ty + 1, WR[3]); pc.set(tx - 1, ty + 2, WR[4]);
      if (T0.rust) pc.set(tx - 1, ty + 3, WR[3]);
    } else if (T0.stitch) {
      // stitched seam down the wrap
      for (let u = 3.4; u < 10; u += 1.4) { const [sx, sy] = diagAt(-13 + u / SQ, d0 + 1.2); pc.set(sx, sy, T0.stitch); }
    }
  }
  // --- head: an arc across the handle, long pick spike to the top-left, chisel adze to the bottom-right
  const wL = 12.2, wR = 9.6;
  const jit = (w) => (T0.rough ? (vnoise(w * 0.7, 3.3, 5) - 0.5) * 0.7 : 0);
  const spine = (s) => { const w = -wL + (wL + wR) * s; return L.at(-0.04 * w * w + 0.5, w); };
  const wid = (s) => {
    const w = -wL + (wL + wR) * s;
    if (w < 0) { const e = -w / wL; return 0.3 + 2.55 * Math.pow(1 - e, 0.85) + jit(w); }
    const e = w / wR;
    return (e > 0.84 ? 1.75 : 2.85 - e * 1.25) + jit(w);
  };
  const sw = sweep(spine, wid, { capEnd: 0.6 });
  const head = sw.mask;
  if (T0.chip) { const [cx, cy] = spine(0.01); head.set(cx, cy, 0); const [c2x, c2y] = spine(0.03); head.set(c2x + 1, c2y, 0); }
  seam(pc, head, 'shadow');
  facetSweep(pc, sw, R, { slope: 0.62, edge: 0.9, edgeK: 1.8 });
  // lit crest line along the spine on the upper arm, sharpened tips
  head.each((x, y) => {
    const i = y * 32 + x, v = sw.V[i], s = sw.S[i];
    const w = -wL + (wL + wR) * s;
    if (Math.abs(v) < 0.5 && w < -1 && w > -wL + 1.5) pc.set(x, y, R[1]);
    if (w < -wL + 2.6 && !isBot(head, x, y)) pc.set(x, y, R[isTop(head, x, y) ? 0 : 1]);
    if (w > wR - 1.1) pc.set(x, y, R[isTop(head, x, y) ? 1 : 2]); // ground chisel edge
  });
  // eye block wrapping the handle
  const eye = L.poly([[2.9, -2.4], [2.9, 2.2], [-2.7, 2.2], [-2.7, -2.4]]);
  const CR = T0.collar ? mat(T0.collar, { cont: 1.2, warm: 52 }) : R;
  seam(pc, eye, 'shadow');
  eye.each((x, y) => {
    const [u, w] = L.uw(x, y);
    let k = u > 1.9 ? 2 : u < -1.7 ? 4 : 3;
    if (w < -1.4) k--; else if (w > 1.3) k++;
    if (isTop(eye, x, y) && !isBot(eye, x, y)) k = 1;
    pc.set(x, y, CR[clamp(k, 1, 5)]);
  });
  // wedge: the handle end shows through the top of the eye
  const [wx, wy] = L.at(3.6, -0.2);
  const wedge = M().disk(wx, wy, 1.1);
  seam(pc, wedge, 'shadow');
  wedge.each((x, y) => pc.set(x, y, W[(x + 0.5 - wx) + (y + 0.5 - wy) < 0 ? 1 : 3]));
  pc.set(wx, wy, T0.collar ? CR[3] : R[4]); // iron wedge
  // texture: hammer marks / rust / engraving
  dents(pc, head, R, { dens: T0.rough ? 0.16 : T0.rust ? 0.1 : 0.07 * (T0.dentK || 1), seed: id.length + 3, only: (x, y) => !eye.get(x, y) });
  if (T0.rust) {
    const RU = mat(0xa8582a, { cont: 1.0 });
    head.each((x, y) => {
      if (eye.get(x, y)) return;
      const n = vnoise(x * 0.42, y * 0.42, 4);
      const k = R.indexOf(pc.get(x, y));
      if (k < 0) return;
      if (n > 0.55) pc.set(x, y, RU[clamp(k + (hash2(x, y, 1) < 0.3 ? 1 : 0), 2, 5)]);
      else if (n > 0.47 && hash2(x, y, 2) < 0.5) pc.set(x, y, RU[clamp(k + 1, 3, 5)]);
    });
    pits(pc, head, R, 0.08, 9, 0);
  }
  if (T0.inlay) {
    // engraved inlay line following the spine on both arms
    head.each((x, y) => {
      const i = y * 32 + x, s = sw.S[i], v = sw.V[i];
      const w = -wL + (wL + wR) * s;
      if (eye.get(x, y)) return;
      if (Math.abs(v + 0.9) < 0.5 && ((w < -3.4 && w > -8.6) || (w > 3.4 && w < 7.2))) pc.set(x, y, (x + y) % 2 ? T0.inlay : mix(T0.inlay, R[4], 0.35));
    });
  }
  if (T0.collar) {
    const [r1x, r1y] = L.at(-1.4, -1.2), [r2x, r2y] = L.at(1, 1.2);
    pc.set(r1x, r1y, CR[0]); pc.set(r2x, r2y, CR[1]);
  }
  if (T0.gem) {
    const [gx, gy] = L.at(0, -0.1);
    const GR = mat(T0.gem, { cont: 1.2 });
    const g = M().disk(gx, gy, 1.45);
    seam(pc, g, CR[5]);
    g.each((x, y) => { const t = (x + 0.5 - gx) + (y + 0.5 - gy); pc.set(x, y, GR[t < -0.6 ? 1 : t < 0.7 ? 3 : 4]); });
    pc.set(gx - 1, gy - 1, 0xffffff);
    if (T0.stars) g.each((x, y) => pc.emit(x, y, 0.8));
  }
  ink(pc);
  if (!T0.rust) { const [gx, gy] = spine(0.24); glint(pc, Math.floor(gx), Math.floor(gy - 1), 1, R[0]); }
  if (T0.stars) {
    glint(pc, 26, 24, 1, 0xfff0b0, 0.9);
    head.each((x, y) => { if (hash2(x, y, 41) < 0.06 && R.indexOf(pc.get(x, y)) >= 2) { pc.set(x, y, 0xfffbe8); pc.emit(x, y, 1); } });
  }
}

export { pickaxe, frame, handle, woodRamp, PICK_TIER };

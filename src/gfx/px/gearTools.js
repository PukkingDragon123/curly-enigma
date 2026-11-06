// Tool icons (32×32): pickaxes per tier, chisels, brushes, drills, x-ray lamps, support beams
// and glow stakes. Hand-pixel style on top of gearKit: crisp ink outline, part seams, planes
// instead of gradients, wood grain, leather / twine wraps, hammer marks, rivets and glints.
import {
  M, mat, mix, hash2, vnoise, ink, seam, bevel, sweep, facetSweep, stick, wrapStick, dents, pits, rivet, stitch, line, glint, diagMask, diagAt, RAMPS,
} from './gearKit.js';

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
    wrapStick(pc, h.x0, h.y0, h.x1, h.y1, 1.1, 2.6, 10.5, WR, { rows: twine ? 2 : 3, grow: 0.5, tones: [2, 2, 3, 3, 4, 4] });
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
  facetSweep(pc, sw, R, { slope: 0.5, edge: 0.9, edgeK: 1.7, bias: 0.06, max: 4 });
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
  seam(pc, eye, 'shadow', T0.collar ? {} : { only: (x, y) => eye.get(x - 1, y) || eye.get(x, y - 1) });
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
  const deep = head.clone().erode(1);
  dents(pc, head, R, { dens: T0.rough ? 0.13 : T0.rust ? 0.08 : 0.05 * (T0.dentK || 1), seed: id.length + 3, only: (x, y) => !eye.get(x, y) && deep.get(x, y) });
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



/** Paint a stripe-space mask: tone(A, d, x, y) → ramp index (null = skip). */
function stripes(pc, mask, R, tone) {
  mask.each((x, y) => { const [A, d] = Ad(x, y); const k = tone(A, d, x, y); if (k !== null && k !== undefined) pc.set(x, y, R[clamp(k, 0, 6)]); });
}
/** Generic stripe shading for a 45° bar: lit top-left edge, mid body, shaded bottom-right edge. */
const barTone = (m, lo = 2, mid = 3, hi = 4) => (A, d, x, y) => (isTop(m, x, y) && !isBot(m, x, y) ? lo - 1 : isBot(m, x, y) ? hi : d < -0.5 ? lo : mid);

// ---------------------------------------------------------------- chisels
function chisel(pc, id) {
  const fine = id === 'chisel_fine';
  const W = fine ? RAMPS.darkWood() : RAMPS.wood();
  const S = mat(fine ? 0x9ce0e6 : 0xa8aeb8, { cont: 1.3 });
  const FE = fine ? RAMPS.brass() : mat(0x8c8f98, { cont: 1.2 });
  const IR = RAMPS.iron();
  // handle: a slightly barrelled wooden grip
  const [hx0, hy0] = diagAt(-11.6, -0.5), [hx1, hy1] = diagAt(-2.6, -0.5);
  stick(pc, hx0, hy0, hx1, hy1, fine ? [1.05, 1.15] : [1.2, 1.3], W, { tones: [1, 2, 3, 3, 4, 5], grain: true, seed: fine ? 12 : 5, knots: fine ? [] : [0.35] });
  // octagonal facet line along the grip
  for (let A = -10.6; A < -3.4; A += 0.5) { const [x, y] = diagAt(A, -1.5); if (W.indexOf(pc.get(x, y)) === 2 && hash2(x, y, 7) < 0.7) pc.set(x, y, W[1]); }
  // mushroomed strike cap, burred from years of mallet blows
  const [cx, cy] = diagAt(-12.5, -0.5);
  const cap = M().disk(cx, cy, fine ? 1.6 : 2.1);
  if (!fine) { cap.set(cx - 2.6, cy - 0.5); cap.set(cx + 0.5, cy + 2.2); }
  seam(pc, cap, 'shadow');
  cap.each((x, y) => { const t = (x + 0.5 - cx) * -0.6 + (y + 0.5 - cy) * -0.8; pc.set(x, y, IR[t > 0.9 ? 1 : t > -0.2 ? 2 : t > -1 ? 3 : 4]); });
  if (!fine) { pc.set(cx - 1, cy - 1, IR[0]); pc.set(cx, cy + 1, IR[5]); }
  // ferrule band
  const fer = diagMask((A, d) => A >= -3.2 && A <= -1.6 && d >= (fine ? -2 : -3) && d <= (fine ? 1 : 2));
  seam(pc, fer, 'shadow');
  stripes(pc, fer, FE, (A, d, x, y) => (isTop(fer, x, y) && !isBot(fer, x, y) ? 1 : isBot(fer, x, y) ? 4 : Math.abs(A + 2.4) < 0.3 ? 4 : d < 0 ? 2 : 3));
  // tang shank, then the flat blade with a ground bevel at the cutting edge
  const hwL = (A) => (A < 3.6 ? 1 : A < 5.4 ? 1 + (A - 3.6) * (fine ? 0.6 : 1.1) : fine ? 2 : 3);
  const hwR = (A) => (A < 3.6 ? 0 : A < 5.4 ? (A - 3.6) * 0.6 : 1);
  const tip = fine ? 12.6 : 12.4;
  const bl = diagMask((A, d) => A >= -1.8 && A <= tip && d >= -hwL(A) - 0.01 && d <= hwR(A) + 0.01);
  seam(pc, bl, 'shadow');
  stripes(pc, bl, S, (A, d, x, y) => {
    const top = isTop(bl, x, y), bot = isBot(bl, x, y);
    if (A > tip - 0.6) return 0;                    // honed edge
    if (A > tip - 2.2) return top ? 0 : bot ? 3 : 1; // the ground bevel catches the light
    if (top) return 1;
    if (bot) return 4;
    return d < -1 ? 2 : 3;
  });
  // bevel boundary + a few honing scratches + maker's mark
  bl.each((x, y) => { const [A] = Ad(x, y); if (Math.abs(A - (tip - 2.3)) < 0.26 && !isTop(bl, x, y)) pc.set(x, y, S[4]); });
  const [mx, my] = diagAt(7, -1.4); pc.set(mx, my, S[4]); pc.set(mx + 1, my, S[5]);
  if (fine) { const [ex, ey] = diagAt(8.6, -1.2); pc.set(ex, ey, 0xf4e08a); }
  ink(pc);
  const [gx, gy] = diagAt(tip - 1.2, -2.2); glint(pc, Math.floor(gx), Math.floor(gy), 1, S[0]);
}

// ---------------------------------------------------------------- brushes
function brush(pc, id) {
  const badger = id === 'brush_badger';
  const W = badger ? RAMPS.darkWood() : mat(0xc8904e, { cont: 1.05 });
  const FE = badger ? RAMPS.brass() : mat(0xb4b8c0, { cont: 1.25 });
  const BR = badger ? mat(0x6e6660, { cont: 1.15 }) : mat(0xd8b070, { cont: 1.05 });
  // paddle handle with a rounded end and a hanging hole
  const hm = diagMask((A, d) => A >= -12.6 && A <= -1.6 && d >= -2 && d <= 1 && !(A < -12 && (d === -2 || d === 1)));
  seam(pc, hm, 'shadow');
  stripes(pc, hm, W, (A, d, x, y) => {
    let k = isTop(hm, x, y) && !isBot(hm, x, y) ? 1 : isBot(hm, x, y) ? 4 : d < 0 ? 2 : 3;
    if (vnoise(A * 0.6, d * 1.3, 4) > 0.72 && k > 1 && k < 4) k++;
    return k;
  });
  const [hx, hy] = diagAt(-11, -0.5);
  pc.set(hx, hy, W[6]); pc.set(hx + 1, hy, W[5]); pc.set(hx, hy + 1, W[4]);
  // leather thong through the hole
  const LE = RAMPS.leather();
  for (const [dx, dy, k] of [[-1, 1, 2], [-2, 2, 3], [-2, 3, 3], [-1, 4, 4], [0, 4, 4], [1, 3, 3]]) pc.set(hx + dx, hy + dy, LE[k]);
  // ferrule with crimp lines
  const fer = diagMask((A, d) => A >= -2.2 && A <= 2.4 && d >= -3 && d <= 2);
  seam(pc, fer, 'shadow');
  stripes(pc, fer, FE, (A, d, x, y) => {
    if (Math.abs(A + 0.9) < 0.3 || Math.abs(A - 0.9) < 0.3) return isTop(fer, x, y) ? 2 : 5;
    return isTop(fer, x, y) && !isBot(fer, x, y) ? 1 : isBot(fer, x, y) ? 4 : d < -1 ? 1 : d < 1 ? 2 : 3;
  });
  // bristles: a flared fan, each stripe a strand bundle, ragged tips
  const end = (d) => 11.4 + (hash2(d, 3, badger ? 5 : 2) - 0.5) * 1.6 - Math.abs(d + 0.5) * 0.12;
  const bm = diagMask((A, d) => A > 2.4 && A <= end(d) && d >= -3 - (A - 2.4) * 0.28 && d <= 2 + (A - 2.4) * 0.28);
  seam(pc, bm, 'shadow');
  bm.each((x, y) => {
    const [A, d] = Ad(x, y);
    let k = d < -3 ? 2 : d < 0 ? 3 : 4;
    const hs = hash2(d, 1, badger ? 9 : 7);                // strand bundles: each stripe its own shade
    if (hs < 0.34) k += 1; else if (hs > 0.8 && k > 2) k -= 1;
    if (hash2(x, y, 5) < 0.08) k += 1;
    if (isTop(bm, x, y) && !isBot(bm, x, y)) k = 1;
    if (A < 3.6) k = Math.max(k, 4);                    // shadow under the ferrule
    let c = BR[clamp(k, 1, 5)];
    if (badger) {
      const tipZone = A > end(d) - 2.2, band = A > end(d) - 4.4 && !tipZone;
      if (tipZone) c = mix(0xf4f0e8, BR[clamp(k, 1, 5)], 0.18 + (k - 2) * 0.08);
      else if (band) c = mix(0x221c22, BR[clamp(k, 1, 5)], 0.35);
    } else if (A > end(d) - 1.2 && k > 1) c = BR[k - 1];
    pc.set(x, y, c);
  });
  // two stray hairs
  for (const [A, d] of [[9.4, -6.2], [10.4, 4.6]]) { const [x, y] = diagAt(A, d); pc.set(x, y, badger ? 0xe8e0d8 : BR[2]); }
  ink(pc);
}

// ---------------------------------------------------------------- drills
function drill(pc, id) {
  const lum = id === 'drill_lumite';
  const B = lum ? mat(0x8e9cb0, { cont: 1.25 }) : mat(0xc8963a, { cont: 1.22, warm: 52 });
  const BIT = mat(lum ? 0xc4d4e4 : 0x8c929c, { cont: 1.35 });
  const BAND = lum ? mat(0x4a5266, { cont: 1.2 }) : mat(0x8a5a2a, { cont: 1.15 });
  // spiral bit: tapered with diagonal flutes
  const bit = M().poly([[20, 12.6], [27, 14.6], [31, 16], [27, 17.4], [20, 19.4]]);
  seam(pc, bit, 'shadow');
  bit.each((x, y) => {
    let k = y < 15 ? 2 : y < 17 ? 3 : 4;
    if (((x + y * 1.2) % 3.4 + 3.4) % 3.4 < 1.1) k = Math.min(5, k + 2);
    else if (((x + y * 1.2) % 3.4 + 3.4) % 3.4 < 1.8) k = Math.max(1, k - 1);
    pc.set(x, y, BIT[k]);
  });
  pc.set(30, 15, BIT[0]);
  // chuck
  const ch = M().rect(18, 11, 3, 10);
  seam(pc, ch, 'shadow');
  ch.each((x, y) => pc.set(x, y, BIT[y < 13 ? 1 : y < 17 ? 2 : y < 19 ? 3 : 4]));
  for (let y = 12; y < 20; y += 2) pc.set(20, y, BIT[5]);
  // body: boiler cylinder (horizontal) with a domed back end
  const body = M().rect(6, 9, 12, 14).ellipse(6.5, 16, 3.2, 7);
  seam(pc, body, 'shadow');
  body.each((x, y) => {
    const v = (y + 0.5 - 16) / 7;
    let k = v < -0.72 ? 2 : v < -0.35 ? 1 : v < 0.15 ? 2 : v < 0.55 ? 3 : 4;
    if (x < 5 && k < 4) k++;
    pc.set(x, y, B[clamp(k, 1, 5)]);
  });
  // riveted bands
  for (const bx of [9, 15]) for (let y = 9; y < 23; y++) if (body.get(bx, y)) {
    const v = (y + 0.5 - 16) / 7;
    pc.set(bx, y, BAND[v < -0.4 ? 2 : v < 0.3 ? 3 : 4]);
    if (y % 3 === 0) pc.set(bx, y, BAND[1]);
  }
  // pistol grip in leather, trigger
  const LE = RAMPS.leather();
  const grip = M().poly([[8, 21], [13, 21], [11.4, 29.6], [6.4, 29.6]]);
  seam(pc, grip, 'shadow');
  grip.each((x, y) => { let k = x < 8.6 + (y - 21) * -0.2 ? 2 : x > 10.6 - (y - 21) * 0.2 ? 4 : 3; if (y % 3 === 0) k++; pc.set(x, y, LE[clamp(k, 1, 5)]); });
  stitch(pc, [[10.4, 22], [9, 29]], mix(LE[1], 0xf0d8a0, 0.6), { gap: 2 });
  const trig = M().rect(13, 22, 2, 3);
  trig.each((x, y) => pc.set(x, y, BAND[y === 22 ? 2 : 4]));
  if (lum) {
    // vented cowl and a glowing lumite core window
    const win = M().ellipse(12, 15.5, 3.4, 3.2);
    const LR = mat(0x7bf08a, { cont: 1.05 });
    seam(pc, win, B[6]);
    win.each((x, y) => { const t = (x + 0.5 - 12) * -0.6 + (y + 0.5 - 15.5) * -0.8; pc.set(x, y, LR[t > 1.2 ? 1 : t > -0.4 ? 2 : 3]); pc.emit(x, y, 0.9); });
    pc.set(11, 14, 0xf0fff0); pc.set(12, 14, 0xc8ffd0);
    for (const vy of [10, 12]) for (let x = 7; x < 17; x++) if (body.get(x, vy) && (x === 7 || x > 8)) pc.set(x, vy, B[x % 2 ? 4 : 5]);
  } else {
    // pressure gauge on a stem, needle in the red, a brass valve
    const stem = M().rect(12, 6, 2, 3);
    stem.each((x, y) => pc.set(x, y, B[x === 12 ? 2 : 4]));
    const g = M().disk(13, 4.6, 3.2);
    seam(pc, g, 'shadow');
    g.each((x, y) => { const r = Math.hypot(x + 0.5 - 13, y + 0.5 - 4.6); pc.set(x, y, r > 2.1 ? B[(x + y) < 17 ? 1 : 4] : (x + y) > 18 ? 0xcfc4ac : 0xf4eedc); });
    // tick marks round the dial, needle swinging toward the red
    pc.set(11, 4, 0x8a7a68); pc.set(13, 3, 0x8a7a68); pc.set(14, 4, 0xc8301e);
    pc.set(13, 5, 0x2a1a14); pc.set(12, 5, 0x2a1a14);
    pc.set(12, 3, 0xffffff);
    const vlv = M().rect(6, 6, 2, 3);
    vlv.each((x, y) => pc.set(x, y, B[x === 6 ? 1 : 3]));
    for (const [x, y] of [[11, 12], [16, 12], [11, 20], [16, 20]]) rivet(pc, x, y, B);
  }
  ink(pc);
  if (!lum) {
    // steam puffs from the valve (soft, translucent: after the outline)
    const ST = 0xf6f2ee;
    for (const [x, y, r, a] of [[5, 3.6, 1.7, 225], [2.6, 2.2, 1.3, 190], [7.6, 1.6, 1, 150]]) M().disk(x, y, r).each((X, Y) => { if (!pc.alpha(X, Y)) pc.set(X, Y, (X + Y) % 3 ? ST : 0xdcd8e4, a); });
  } else {
    for (const [x, y] of [[3, 12], [23, 8], [26, 23]]) glint(pc, x, y, 1, 0xb8ffc0, 0.8);
  }
  glint(pc, 9, 11, 0);
}

// ---------------------------------------------------------------- x-ray lamps
function xrayLamp(pc, id) {
  const prism = id === 'xray_prism';
  const beamC = prism ? 0xe0a8ff : 0x7fe7ff;
  const B = prism ? mat(0x8a7ab0, { cont: 1.2 }) : RAMPS.brass();
  const W = RAMPS.darkWood();
  // handle (diagonal), then the lamp barrel along the same axis, hood and lens facing the top-right
  const [x0, y0] = diagAt(-13, 0), [x1, y1] = diagAt(-3, 0);
  stick(pc, x0, y0, x1, y1, 1.1, W, { tones: [1, 2, 3, 4, 5], grain: true, seed: 4 });
  wrapStick(pc, x0, y0, x1, y1, 1.1, 1.4, 8, RAMPS.leather(), { rows: 3, grow: 0.4, tones: [2, 2, 3, 3, 4, 4] });
  const barrel = diagMask((A, d) => A >= -3.4 && A <= 6.4 && Math.abs(d + 0.5) <= (A < -1.6 ? 2.6 : 5.6));
  seam(pc, barrel, 'shadow');
  stripes(pc, barrel, B, (A, d, x, y) => {
    let k = isTop(barrel, x, y) && !isBot(barrel, x, y) ? 1 : isBot(barrel, x, y) ? 5 : d < -3 ? 1 : d < 0 ? 2 : d < 3 ? 3 : 4;
    if (Math.abs(A - 0.4) < 0.3 || Math.abs(A - 3.9) < 0.3) k = Math.min(5, k + 1); // seams between the barrel rings
    return k;
  });
  // cooling vents
  for (const A of [1.4, 2.4]) for (let d = -3; d <= 2; d++) { const [x, y] = diagAt(A, d); if (barrel.get(x, y) && (d + Math.round(A * 2)) % 2) pc.set(x, y, B[5]); }
  // hood rim
  const hood = diagMask((A, d) => A >= 6.4 && A <= 7.6 && Math.abs(d + 0.5) <= 6.6);
  seam(pc, hood, 'shadow');
  stripes(pc, hood, B, (A, d) => (d < -3 ? 1 : d < 2 ? 2 : 4));
  // lens
  const [lx, ly] = diagAt(8.2, -0.5);
  const lens = M().oval(lx, ly, 1.7, 4.4, -Math.PI / 4);
  const LR = mat(beamC, { cont: 1.05 });
  lens.each((x, y) => { const t = (x + 0.5 - lx) * -0.7 + (y + 0.5 - ly) * -0.7; pc.set(x, y, LR[t > 1.4 ? 0 : t > 0 ? 1 : t > -1.6 ? 2 : 3]); pc.emit(x, y, 0.9); });
  for (const [x, y] of [[-7, 0], [-5.4, 0]]) { const [rx, ry] = diagAt(x, y); }
  for (const A of [-2.4]) { const [rx, ry] = diagAt(A, -2.5); rivet(pc, rx, ry, B); }
  if (prism) {
    // a small prism crystal mounted on the barrel
    const pm = M().poly([[11, 14], [14, 11], [15.5, 15.5]]);
    seam(pc, pm, 'shadow');
    pm.each((x, y) => { pc.set(x, y, (x + y) < 26 ? 0xf8f0ff : (x + y) < 28 ? 0xd8b8ff : 0x9a7ad8); pc.emit(x, y, 0.6); });
  }
  ink(pc, { skip: (x, y) => x > 22 && y < 9 && lens.clone().dilate(1).get(x, y) === 0 && false });
  // beam: translucent cone from the lens toward the top-right corner
  const cone = M().poly([diagAt(8.6, -6.4), diagAt(13.4, -10.4), diagAt(13.4, 9.4), diagAt(8.6, 5.4)]);
  cone.each((x, y) => {
    if (pc.alpha(x, y)) return;
    const [A, d] = Ad(x, y);
    const t = clamp((A - 8.6) / 4.8, 0, 1);
    if (t > 0.55 && hash2(x, y, 4) < (t - 0.55) * 1.8) return;
    const c = prism ? [0xff9ad0, 0xffe08a, 0x9affd0, 0x9ad0ff, 0xd0a0ff][clamp(Math.floor((d + 12) / 4.6), 0, 4)] : (Math.abs(d + 0.5) < 2 ? 0xd8fcff : beamC);
    pc.set(x, y, c, Math.round((170 - t * 120) * (((x + y) & 1) ? 1 : 0.8)));
    pc.emit(x, y, 0.45);
  });
  glint(pc, Math.floor(lx - 1), Math.floor(ly - 1), 0);
}

// ---------------------------------------------------------------- beams & stakes
function beamIcon(pc) {
  const W = RAMPS.wood();
  const IR = RAMPS.iron();
  // upright post with an adze-dressed face
  const post = M().rect(13, 9, 7, 20);
  seam(pc, post, 'shadow');
  post.each((x, y) => {
    let k = x === 13 ? 2 : x < 17 ? 3 : x < 19 ? 4 : 5;
    const n = vnoise(x * 1.1, y * 0.16, 3);
    if (n > 0.7 && k < 5) k++; else if (n < 0.14 && k > 2) k--;
    pc.set(x, y, W[k]);
  });
  // cap beam across the top, end grain visible on the left
  const cap = M().rect(3, 4, 27, 6);
  seam(pc, cap, 'shadow');
  cap.each((x, y) => {
    let k = y === 4 ? 1 : y < 7 ? 2 : y < 9 ? 3 : 4;
    const n = vnoise(x * 0.15, y * 1.1, 8);
    if (n > 0.68 && k < 5) k++; else if (n < 0.14 && k > 1) k--;
    pc.set(x, y, W[k]);
  });
  // end grain rings on the cap's left end
  const EG = mat(0xc89a62, { cont: 1.05 });
  for (let y = 4; y < 10; y++) for (let x = 3; x < 5; x++) pc.set(x, y, EG[(Math.abs(y - 6.5) + (x - 3)) < 1.2 ? 3 : 2]);
  pc.set(3, 6, EG[4]); pc.set(4, 7, EG[4]);
  // checks (cracks) along the grain
  for (const [x, y, n] of [[8, 6, 4], [22, 7, 5], [16, 14, 5], [17, 22, 3]]) for (let i = 0; i < n; i++) pc.set(y > 10 ? x : x + i, y > 10 ? y + i : y, W[5]);
  // iron knee braces with nails
  const br = M().poly([[9, 10], [13, 10], [13, 16]]).union(M().poly([[20, 10], [24, 10], [20, 16]]));
  seam(pc, br, 'shadow');
  br.each((x, y) => pc.set(x, y, IR[y === 10 ? 2 : (x < 13 ? 3 : 4)]));
  for (const [x, y] of [[10, 10], [12, 13], [21, 10], [20, 13]]) rivet(pc, x, y, IR);
  for (const [x, y] of [[6, 6], [26, 6], [15, 18], [15, 25]]) rivet(pc, x, y, IR);
  // foot plank
  const foot = M().rect(9, 28, 15, 3);
  seam(pc, foot, 'shadow');
  foot.each((x, y) => pc.set(x, y, W[y === 28 ? 2 : y === 29 ? 3 : 4]));
  ink(pc);
}

function stakeIcon(pc) {
  const W = RAMPS.ash();
  const st = M().poly([[13.5, 12], [19, 12], [19, 24], [16.6, 30.5], [15.6, 30.5], [13.5, 24]]);
  seam(pc, st, 'shadow');
  st.each((x, y) => {
    let k = x <= 14 ? 2 : x < 17 ? 3 : 4;
    if (y > 24 && x >= 16) k = 5; // whittled point facets
    const n = vnoise(x * 1.2, y * 0.2, 2);
    if (n > 0.72 && k < 5) k++;
    pc.set(x, y, W[k]);
  });
  // knife cuts on the point
  for (const [x, y] of [[15, 25], [16, 27], [14, 24]]) pc.set(x, y, W[1]);
  // twine lashing under the crystal
  const TW = RAMPS.twine();
  for (let y = 11; y <= 14; y++) for (let x = 13; x <= 19; x++) if (st.get(x, y) || y <= 12) pc.set(x, y, TW[(y % 2 ? 2 : 4) + (x > 17 ? 1 : 0)]);
  pc.set(20, 14, TW[3]); pc.set(21, 15, TW[4]);
  // lumite crystal: two facets lit, two shaded, a bright inner streak
  const LR = mat(0x7bf08a, { cont: 1.1 });
  const c = M().poly([[16.3, 0.6], [21, 6.6], [16.3, 11.4], [11.6, 6.6]]);
  seam(pc, c, 'shadow');
  c.each((x, y) => {
    const l = x + 0.5 < 16.3, u = y + 0.5 < 6.6;
    pc.set(x, y, LR[l ? (u ? 1 : 2) : (u ? 2 : 4)]);
    pc.emit(x, y, 0.9);
  });
  for (let y = 3; y < 10; y++) { pc.set(16, y, LR[y < 6 ? 0 : 1]); pc.emit(16, y, 1); }
  ink(pc);
  for (const [x, y] of [[9, 3], [24, 5], [23, 11]]) glint(pc, x, y, 1, 0xb8ffb8, 0.8);
  glint(pc, 14, 4, 0, 0, 1);
}

export { pickaxe, chisel, brush, drill, xrayLamp, beamIcon, stakeIcon, frame, handle, woodRamp, PICK_TIER };

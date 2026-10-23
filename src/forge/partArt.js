// 32×32 item icons for coop parts ({ k: 'cooppart', t: track, metal, level }): shelf brackets
// and racks, leg bands, talons, braces and spurs, the nest box, the warming pan and the bell,
// the ore chute and the roof lanterns. Metal-coloured from METALS; one shape per track, with
// the levels told apart. Drawn with the shared icon toolkit (gfx/px); hooked into
// gfx/PixelArt.js drawIconArt.
import { mat, mix } from '../gfx/px/color.js';
import { vol, sparkle, hash2 } from '../gfx/px/shade.js';
import { M, ring, lineIn } from '../gfx/px/parts.js';
import { METALS } from '../data/weapons.js';

const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };
const LOOK = {
  copper: { cont: 1.2, warm: 30 }, tin: { cont: 0.85, hs: 0.5 }, bronze: { cont: 1.1, warm: 52 }, iron: { cont: 1.05 },
  steel: { cont: 1.35, hs: 1.3 }, silver: { cont: 1.35, hs: 1.2 }, mithril: { cont: 1.25 },
};
const metalRamp = (metal) => mat(METALS[metal]?.color ?? 0x8a8f96, LOOK[metal] || {});

/** A round bar (cylinder-shaded capsule) between two points; returns its mask. */
function rod(pc, x0, y0, x1, y1, r, R, o = {}) {
  const m = M().capsule(x0, y0, x1, y1, r);
  if (o.clip) m.sub(o.clip);
  ring(pc, m, R);
  vol(pc, m, R, { mode: 'cyl', axis: Math.atan2(y1 - y0, x1 - x0), spec: o.spec ?? 0.86 });
  return m;
}
/** A flat strap through points (radius r), lit as a bevelled plate. */
function strap(pc, pts, r, R, o = {}) {
  const m = M().path(pts, r);
  if (o.clip) m.sub(o.clip);
  ring(pc, m, R);
  vol(pc, m, R, { round: o.round ?? 1.5, spec: o.spec ?? 0.8 });
  return m;
}
const rivet = (pc, x, y, R) => { pc.set(x, y, R[5]); pc.set(x - 1, y - 1, R[1]); };

// ---------------------------------------------------------------- shelves
function shelves(pc, R, lv) {
  if (lv >= 3) {
    // a rack: a frame of rails seen from above-front, slats across, little brackets under it
    const steel = lv >= 4;
    const fr = M().poly([[4, 12], [24, 7], [29, 14], [9, 20]]).sub(M().poly([[7, 12.3], [23.4, 8.6], [26.4, 13.6], [9.6, 17.6]]));
    for (let k = 1; k < (steel ? 4 : 3); k++) { const t = k / (steel ? 4 : 3); fr.union(M().path([[4 + 20 * t, 12 - 5 * t], [9 + 20 * t, 20 - 6 * t]], 0.8)); }
    for (const [x, y] of [[7, 19], [25, 15]]) strap(pc, [[x, y], [x, y + 7], [x + 4, y + 6]], 1.1, R, { round: 1 });
    ring(pc, fr, R); vol(pc, fr, R, { round: 1.2, spec: 0.8 });
    if (steel) {
      // raised side rails on posts and tie-down loops
      strap(pc, [[3, 8], [23, 3]], 0.9, R); strap(pc, [[9, 16], [29, 10]], 0.9, R);
      for (const [x, y] of [[4, 9], [13, 6.5], [22, 4], [10, 17], [19, 14.5], [28, 12]]) lineIn(pc, x, y, x, y + 3, R[4]);
      for (const [x, y] of [[3, 13], [29, 15]]) { pc.set(x, y, R[1]); pc.set(x + 1, y - 1, R[1]); pc.set(x + 1, y + 1, R[4]); }
    }
    for (const [x, y] of [[6, 13], [24, 9], [27, 14], [10, 18]]) rivet(pc, x, y, R);
    return;
  }
  // a shelf bracket: wall arm on the left, shelf arm along the top, a brace between
  const wall = strap(pc, [[8, 27], [8, 7]], 2.2, R);
  const top = strap(pc, [[8, 6], [26, 6]], 2.2, R);
  if (lv === 2) {
    // a scrolled brace and a curl at the shelf's end
    const pts = [];
    for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * (Math.PI / 2); pts.push([21 + Math.cos(a) * 12, 21 + Math.sin(a) * 12]); }
    strap(pc, pts, 1.3, R, { clip: wall.clone().union(top) });
    const sp = [];
    for (let i = 0; i <= 14; i++) { const a = -Math.PI / 2 + (i / 14) * Math.PI * 1.7; const r = 3.6 - i * 0.16; sp.push([26 + Math.cos(a) * r, 11 + Math.sin(a) * r]); }
    strap(pc, sp, 0.9, R, { round: 1 });
  } else {
    strap(pc, [[10, 22], [22, 9]], 1.5, R, { clip: wall.clone().union(top) });
    strap(pc, [[26, 7], [26, 3]], 1.4, R); // the lip
  }
  for (const [x, y] of [[8, 12], [8, 21], [14, 6], [21, 6]]) { pc.set(x, y, R[6]); pc.set(x + 1, y, R[5]); }
}

// ---------------------------------------------------------------- legs
function band(pc, cx, cy, rx, ry, w, R) {
  const m = M().ellipse(cx, cy, rx, ry).sub(M().ellipse(cx, cy - w * 0.4, rx - w, ry - w * 0.7));
  ring(pc, m, R); vol(pc, m, R, { round: 1.6, spec: 0.8 });
  // the lower lip (thickness of the band seen from the side)
  m.each((x, y) => { if (y > cy + ry * 0.35 && !m.get(x, y + 1)) pc.set(x, y, R[5]); });
  return m;
}
function legs(pc, R, lv) {
  if (lv === 1) {
    band(pc, 11, 13, 8, 6, 2.6, R);
    band(pc, 20, 20, 8, 6, 2.6, R);
    for (const [x, y] of [[3, 13], [12, 20]]) { pc.set(x, y, R[1]); pc.set(x, y + 1, R[5]); pc.set(x - 1, y, R[5]); }
    for (const [x, y] of [[7, 9], [16, 16], [24, 16]]) rivet(pc, x, y, R);
    return;
  }
  if (lv === 2) {
    // iron talons: a heel band with three hooked claw caps
    band(pc, 16, 10, 7, 4.5, 2.4, R);
    for (const [ex, ey, hx] of [[6, 25, 5], [16, 28, 17], [26, 25, 28]]) {
      const m = M().path([[16 + (ex - 16) * 0.25, 13], [ex, ey - 4], [hx, ey]], [2.6, 2, 0.6]);
      ring(pc, m, R); vol(pc, m, R, { round: 1.6, spec: 0.75 });
      pc.set(hx, ey, R[0]);
    }
    for (const [x, y] of [[11, 8], [16, 7], [21, 8]]) rivet(pc, x, y, R);
    return;
  }
  if (lv === 3) {
    // a steel brace: two bars, a bowed leaf spring, cuffs at both ends
    rod(pc, 9, 27, 23, 5, 1.6, R);
    const bow = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; bow.push([10 + 12 * t - Math.sin(t * Math.PI) * 4, 25 - 19 * t - Math.sin(t * Math.PI) * 3]); }
    strap(pc, bow, 1, R, { round: 1 });
    for (const [x, y] of [[8, 28], [24, 4]]) { const c = M().ellipse(x, y, 5, 2.6).sub(M().ellipse(x, y - 0.6, 3.4, 1.4)); ring(pc, c, R); vol(pc, c, R, { round: 1.2, spec: 0.8 }); }
    for (const [x, y] of [[12, 22], [20, 9]]) { pc.set(x, y, R[0]); pc.set(x + 1, y + 1, R[5]); }
    return;
  }
  // mithril spurs: a heel band and a star rowel glinting at the back
  const u = M().path([[5, 9], [6, 20], [12, 25], [20, 23], [22, 14]], 2).sub(M().path([[7, 10], [8, 19], [12, 22.6], [19, 21], [20, 14]], 0.6));
  ring(pc, u, R); vol(pc, u, R, { round: 1.6, spec: 0.78 });
  strap(pc, [[20, 21], [25, 18]], 1.2, R, { round: 1 });
  const st = M();
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; st.capsule(26, 13, 26 + Math.cos(a) * 5.4, 13 + Math.sin(a) * 5.4, [1.1, 0.35]); }
  st.disk(26, 13, 2);
  ring(pc, st, R); vol(pc, st, R, { round: 1.2, spec: 0.7 });
  pc.set(26, 13, R[6]);
  sparkle(pc, 22, 7, 1, 0xffffff, R[0], 0.6);
  for (const [x, y] of [[5, 9], [22, 14]]) { pc.set(x, y, R[0]); }
}

// ---------------------------------------------------------------- nest
function nest(pc, R, lv) {
  if (lv === 1) {
    // a tin nest box in three-quarter view, straw peeking over the dipped front
    const front = M().poly([[5, 14], [22, 14], [22, 27], [5, 27]]).sub(M().ellipse(13.5, 13, 5, 4.5));
    const side = M().poly([[22, 14], [28, 10], [28, 23], [22, 27]]);
    const back = M().poly([[5, 14], [11, 9], [28, 9], [22, 14]]);
    const straw = M().ellipse(16, 14.5, 9, 3.2);
    straw.each((x, y) => pc.set(x, y, hash2(x, y, 4) > 0.5 ? 0xe8c060 : 0xb88a38));
    for (const [x, y] of [[9, 11], [20, 11], [14, 12]]) { pc.set(x, y, 0xf0d070); pc.set(x + 1, y - 1, 0xf0d070); }
    ring(pc, side, R); vol(pc, side, R, { mode: 'flat', normal: [0.7, -0.1, 0.7] });
    ring(pc, front, R); vol(pc, front, R, { round: 1.2, spec: 0.85 });
    back.sub(straw); back.each((x, y) => pc.set(x, y, R[4]));
    lineIn(pc, 5, 14, 22, 14, R[1]); lineIn(pc, 22, 14, 28, 10, R[2]);
    for (const [x, y] of [[7, 25], [20, 25], [7, 16], [20, 16]]) rivet(pc, x, y, R);
    return;
  }
  if (lv === 2) {
    // a warming pan: a domed, pierced lid on a round pan, the long handle off to the corner
    rod(pc, 18, 14, 29, 3, 1.3, mat(0x7a4a2a, { cont: 1.05 }), { spec: false });
    const pan = M().ellipse(13, 20, 11, 7);
    ring(pc, pan, R); vol(pc, pan, R, { round: 3, spec: 0.85 });
    const lid = M().ellipse(13, 18, 9, 5);
    vol(pc, lid, R, { round: 4, spec: 0.8, bias: 0.06 });
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; pc.set(Math.round(13 + Math.cos(a) * 5.5), Math.round(18 + Math.sin(a) * 3), R[6]); }
    for (const [x, y] of [[13, 18], [10, 17], [16, 19]]) pc.set(x, y, R[5]);
    lineIn(pc, 4, 22, 22, 22, R[5]);
    pc.set(13, 13, R[1]); pc.set(13, 12, R[2]);
    return;
  }
  // the nest bell
  const bell = M().fn((x, y) => {
    const t = (y + 0.5 - 7) / 19; if (t < 0 || t > 1) return false;
    const r = 4 + t * 3.5 + (t > 0.82 ? (t - 0.82) * 22 : 0);
    return Math.abs(x + 0.5 - 16) <= r;
  });
  const loop = M().ellipse(16, 5, 3, 3).sub(M().ellipse(16, 5, 1.6, 1.6));
  ring(pc, loop, R); vol(pc, loop, R, { round: 1, spec: 0.8 });
  ring(pc, bell, R); vol(pc, bell, R, { mode: 'cyl', axis: Math.PI / 2, spec: 0.82 });
  lineIn(pc, 10, 17, 22, 17, R[1]); lineIn(pc, 10, 18, 22, 18, R[4]);
  const lip = M().ellipse(16, 26, 11, 1.8); vol(pc, lip, R, { round: 1, spec: 0.8 });
  const clap = M().disk(16, 28.5, 1.6); ring(pc, clap, R); vol(pc, clap, R, { round: 1.5 });
  sparkle(pc, 12, 11, 1, 0xffffff, R[0], 0.5);
}

// ---------------------------------------------------------------- chute
function chute(pc, R) {
  // a sloped trough out of the bottom of a funnel
  const tr = M().poly([[11, 17], [15, 15], [29, 25], [26, 29]]);
  ring(pc, tr, R); vol(pc, tr, R, { mode: 'cyl', axis: Math.atan2(10, 14), spec: 0.85 });
  lineIn(pc, 13, 18, 27, 27, R[5], tr);
  const fun = M().poly([[3, 5], [21, 5], [15, 16], [9, 16]]);
  ring(pc, fun, R); vol(pc, fun, R, { mode: 'cyl', axis: Math.PI / 2, spec: 0.84 });
  const mouth = M().ellipse(12, 5, 9, 2.4);
  mouth.each((x, y) => pc.set(x, y, R[(x + y) % 2 ? 5 : 6]));
  lineIn(pc, 3, 5, 21, 5, R[1]);
  for (const [x, y] of [[12, 8], [12, 11], [12, 14]]) rivet(pc, x, y, R);
  // a bit of ore rolling down it
  const ore = M().disk(24, 22, 1.8); vol(pc, ore, mat(0x7a6a5a), { round: 1.5 }); pc.set(24, 22, 0xd9773f);
}

// ---------------------------------------------------------------- lamp
function lamp(pc, R, lv) {
  const green = lv >= 2;
  const cx = 16;
  // the light inside (glowing)
  const glow = green ? 0x9dff9a : 0xffc860, core = green ? 0xe8ffe0 : 0xfff2c0;
  const box = M().rect(cx - 6, 13, 13, 12);
  box.each((x, y) => { const d = Math.hypot(x + 0.5 - cx - 0.5, y + 0.5 - 19); gl(pc, x, y, d < 2.5 ? core : d < 5 ? glow : mix(glow, 0x2a2010, 0.55), d < 5 ? 1 : 0.5); });
  if (green) { for (const [x, y, h] of [[15, 16, 7], [18, 19, 4], [13, 20, 3]]) { lineIn(pc, x, y, x, y + h, 0xe8ffe0, null, 1); lineIn(pc, x + 1, y + 1, x + 1, y + h, 0x5ad86a, null, 1); } }
  else { const c = M().rect(15, 19, 3, 6); c.each((x, y) => pc.set(x, y, y === 19 ? 0xfff4d8 : 0xf0e2c0)); gl(pc, 16, 17, 0xffd060); gl(pc, 16, 18, 0xffb030); }
  // the cage: posts, base, top frame
  const frame = M();
  for (const x of green ? [cx - 7, cx - 3, cx + 1, cx + 5, cx + 8] : [cx - 7, cx + 8]) frame.rect(x, 13, green ? 1 : 2, 12);
  frame.rect(cx - 8, 25, 17, 3).rect(cx - 8, 11, 17, 2);
  ring(pc, frame, R); vol(pc, frame, R, { round: 1, spec: 0.85 });
  // the roof: a pyramid (tin) or a dome (lumite), the ring on top
  const roof = green ? M().ellipse(cx + 0.5, 11, 9, 5).sub(M().rect(0, 11, 32, 21)) : M().poly([[cx - 9, 11], [cx + 10, 11], [cx + 0.5, 4]]);
  ring(pc, roof, R); vol(pc, roof, R, { round: 2.5, spec: 0.8 });
  const rg = M().ellipse(cx + 0.5, 3, 2.4, 2.4).sub(M().ellipse(cx + 0.5, 3, 1.2, 1.2));
  ring(pc, rg, R); vol(pc, rg, R, { round: 1, spec: 0.8 });
  for (const x of [cx - 6, cx + 7]) rivet(pc, x, 26, R);
}

/** Draws { k: 'cooppart', t, metal, level } icons; false for anything else. */
export function drawPartIcon(pc, spec) {
  if (!spec || spec.k !== 'cooppart') return false;
  const R = metalRamp(spec.metal);
  const lv = spec.level || 1;
  if (spec.t === 'shelves') shelves(pc, R, lv);
  else if (spec.t === 'legs') legs(pc, R, lv);
  else if (spec.t === 'nest') nest(pc, R, lv);
  else if (spec.t === 'chute') chute(pc, R, lv);
  else if (spec.t === 'lamp') lamp(pc, R, lv);
  else return false;
  return true;
}

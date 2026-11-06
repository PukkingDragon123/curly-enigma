// Tool icons: pickaxes per tier, chisels, brushes, drills, x-ray lamps, support beams and glow
// stakes. Hand-pixel style on top of gearKit: crisp ink outline, part seams, planes instead of
// gradients, wood grain, leather / twine wraps, hammer marks, rivets and glints. Authored on the
// 32-unit design grid and painted natively at S× (res.js): mask callbacks get native (X, Y) for
// painting and design (x, y) for geometry; small parts are drawn at real-pixel scale.
import {
  M, mat, mix, hash2, vnoise, ink, seam, bevel, sweep, facetSweep, stick, wrapStick, dents, pits, rivet, stitch, line, glint, diagMask, diagAt, RAMPS,
  S, SZ, dc, nc, np, dot,
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
  butt.eachD((X, Y, x, y) => { const t = (x + 0.5 - bx) * -0.6 + (y + 0.5 - by) * -0.8; pc.set(X, Y, W[t > 0.6 ? 2 : t > -0.4 ? 3 : t > -1.1 ? 4 : 5]); });
  // end grain ring on the butt
  if (S === 1) pc.set(bx - 0.5, by + 0.5, W[5]);
  else {
    const X = np(bx - 0.2), Y = np(by + 0.2);
    for (const [dx, dy, k] of [[0, 0, 5], [-1, 0, 4], [0, 1, 4], [1, 1, 3], [-1, -1, 3], [1, -1, 4], [-1, 1, 5]]) if (butt.get(X + dx, Y + dy)) pc.set(X + dx, Y + dy, W[k]);
  }
  if (o.crack) {
    // a split running up the grain (a dark line with a lit lip at S > 1)
    for (let i = 0; i < 7 * S; i++) {
      const [x, y] = diagAt(A0 + 3 + i * 0.5 / S, d0 + (Math.floor(i / S) % 3 === 2 ? 0.8 : 0) * (S > 1 ? 0.6 : 1));
      const X = S > 1 ? np(x) : x, Y = S > 1 ? np(y) : y;
      if (m.get(X, Y)) { pc.set(X, Y, W[6]); if (S > 1 && m.get(X + 1, Y + 1)) pc.set(X + 1, Y + 1, W[2]); }
    }
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
      if (S === 1) {
        pc.set(tx, ty, WR[2]); pc.set(tx, ty + 1, WR[3]); pc.set(tx - 1, ty + 2, WR[4]);
        if (T0.rust) pc.set(tx - 1, ty + 3, WR[3]);
      } else {
        // a frayed end: a twisted strand (lit side, shaded side) splitting into fibres at its tip
        const ex = tx - 1.1, ey = ty + (T0.rust ? 3.6 : 2.8);
        line(pc, tx + 0.3, ty, ex + 0.2, ey, (i) => WR[i % 3 === 0 ? 3 : 2]);
        line(pc, tx + 0.8, ty + 0.2, ex + 0.7, ey + 0.1, (i) => WR[i % 3 === 1 ? 5 : 4]);
        line(pc, ex + 0.2, ey, ex - 0.4, ey + 0.9, WR[3]); line(pc, ex + 0.7, ey + 0.1, ex + 0.9, ey + 1, WR[4]);
      }
    } else if (T0.stitch) {
      // stitched seam down the wrap (little slanted stitches, each with a shadow at S > 1)
      for (let u = 3.4; u < 10; u += 1.4) {
        const [sx, sy] = diagAt(-13 + u / SQ, d0 + 1.2);
        if (S === 1) { pc.set(sx, sy, T0.stitch); continue; }
        const X = np(sx), Y = np(sy);
        pc.set(X, Y, T0.stitch); pc.set(X + 1, Y - 1, T0.stitch); pc.set(X + 1, Y, mix(T0.stitch, 0x1a0e08, 0.55));
      }
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
  if (T0.chip) {
    // a chipped tip: a little notch bitten out of the spike's end
    const [cx, cy] = spine(0.01), [c2x, c2y] = spine(0.03);
    if (S === 1) { head.set(cx, cy, 0); head.set(c2x + 1, c2y, 0); } else {
      for (const [x, y] of [[cx, cy], [cx + 0.5, cy], [cx, cy + 0.5], [c2x + 1, c2y], [c2x + 1.5, c2y + 0.4]]) head.set(np(x), np(y), 0);
    }
  }
  seam(pc, head, 'shadow');
  facetSweep(pc, sw, R, { slope: 0.5, edge: 0.9, edgeK: 1.7, bias: 0.06, max: 4 });
  // lit crest line along the spine on the upper arm, sharpened tips
  head.eachD((X, Y, x, y) => {
    const i = Y * SZ + X, v = sw.V[i], s = sw.S[i];
    const w = -wL + (wL + wR) * s;
    if (Math.abs(v) < 0.5 && w < -1 && w > -wL + 1.5) pc.set(X, Y, R[1]);
    if (w < -wL + 2.6 && !isBot(head, X, Y)) pc.set(X, Y, R[isTop(head, X, Y) ? 0 : 1]);
    if (w > wR - 1.1) pc.set(X, Y, R[isTop(head, X, Y) ? 1 : 2]); // ground chisel edge
  });
  // eye block wrapping the handle
  const eye = L.poly([[2.9, -2.4], [2.9, 2.2], [-2.7, 2.2], [-2.7, -2.4]]);
  const CR = T0.collar ? mat(T0.collar, { cont: 1.2, warm: 52 }) : R;
  seam(pc, eye, 'shadow', T0.collar ? {} : { only: (x, y) => eye.get(x - 1, y) || eye.get(x, y - 1) });
  eye.eachD((X, Y, x, y) => {
    const [u, w] = L.uw(x, y);
    let k = u > 1.9 ? 2 : u < -1.7 ? 4 : 3;
    if (w < -1.4) k--; else if (w > 1.3) k++;
    if (isTop(eye, X, Y) && !isBot(eye, X, Y)) k = 1;
    pc.set(X, Y, CR[clamp(k, 1, 5)]);
  });
  // wedge: the handle end shows through the top of the eye
  const [wx, wy] = L.at(3.6, -0.2);
  const wedge = M().disk(wx, wy, 1.1);
  seam(pc, wedge, 'shadow');
  wedge.eachD((X, Y, x, y) => pc.set(X, Y, W[(x + 0.5 - wx) + (y + 0.5 - wy) < 0 ? 1 : 3]));
  if (S === 1) pc.set(wx, wy, T0.collar ? CR[3] : R[4]); // iron wedge
  else { const X = np(wx - 0.3), Y = np(wy - 0.3), WC = T0.collar ? CR : R; pc.set(X, Y, WC[2]); pc.set(X + 1, Y, WC[4]); pc.set(X, Y + 1, WC[3]); pc.set(X + 1, Y + 1, WC[5]); } // iron wedge
  // texture: hammer marks / rust / engraving
  const deep = head.clone().erode(S);
  dents(pc, head, R, { dens: T0.rough ? 0.13 : T0.rust ? 0.08 : 0.05 * (T0.dentK || 1), seed: id.length + 3, only: (x, y) => !eye.get(x, y) && deep.get(x, y) });
  if (T0.rust) {
    const RU = mat(0xa8582a, { cont: 1.0 });
    head.eachD((X, Y, x, y) => {
      if (eye.get(X, Y)) return;
      const n = vnoise(x * 0.42, y * 0.42, 4);
      const k = R.indexOf(pc.get(X, Y));
      if (k < 0) return;
      if (n > 0.55) pc.set(X, Y, RU[clamp(k + (hash2(X, Y, 1) < 0.3 ? 1 : 0), 2, 5)]);
      else if (n > 0.47 && hash2(X, Y, 2) < 0.5) pc.set(X, Y, RU[clamp(k + 1, 3, 5)]);
    });
    pits(pc, head, R, 0.08, 9, 0);
  }
  if (T0.inlay) {
    // engraved inlay line following the spine on both arms
    head.eachD((X, Y, x, y) => {
      const i = Y * SZ + X, s = sw.S[i], v = sw.V[i];
      const w = -wL + (wL + wR) * s;
      if (eye.get(X, Y)) return;
      if (!((w < -3.4 && w > -8.6) || (w > 3.4 && w < 7.2))) return;
      if (S === 1) { if (Math.abs(v + 0.9) < 0.5) pc.set(X, Y, (X + Y) % 2 ? T0.inlay : mix(T0.inlay, R[4], 0.35)); return; }
      // a gold wire laid in a cut groove: bright wire, the groove's shadow on its far side, and
      // a scroll of tiny leaves along it
      if (Math.abs(v + 0.9) < 0.26) pc.set(X, Y, (X + Y) % 5 === 0 ? mix(T0.inlay, 0xffffff, 0.5) : T0.inlay);
      else if (v + 0.9 > 0.26 && v + 0.9 < 0.55) pc.set(X, Y, mix(T0.inlay, R[5], 0.55));
      else if (v + 0.9 < -0.26 && v + 0.9 > -0.75 && Math.floor((w + 20) * 1.4) % 3 === 0) pc.set(X, Y, mix(T0.inlay, R[3], 0.3));
    });
  }
  if (T0.collar) {
    const [r1x, r1y] = L.at(-1.4, -1.2), [r2x, r2y] = L.at(1, 1.2);
    if (S === 1) { pc.set(r1x, r1y, CR[0]); pc.set(r2x, r2y, CR[1]); }
    else { rivet(pc, r1x, r1y, CR); rivet(pc, r2x, r2y, CR); }
  }
  if (T0.gem) {
    const [gx, gy] = L.at(0, -0.1);
    const GR = mat(T0.gem, { cont: 1.2 });
    // a small cut stone in a gold bezel: octagonal girdle, a table, facets toned by direction
    const oct = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; oct.push([gx + Math.cos(a) * 1.55, gy + Math.sin(a) * 1.55]); }
    const g = M().poly(oct);
    seam(pc, g, CR[5]);
    g.eachD((X, Y, x, y) => {
      const dx = x + 0.5 - gx, dy = y + 0.5 - gy, t = dx + dy;
      if (S === 1) { pc.set(X, Y, GR[t < -0.6 ? 1 : t < 0.7 ? 3 : 4]); return; }
      const r = Math.max(Math.abs(dx), Math.abs(dy), (Math.abs(dx) + Math.abs(dy)) * 0.72);
      let k = r < 0.7 ? (t < 0 ? 2 : 3) : t < -0.6 ? 1 : t < 0.5 ? 3 : 4;
      if (r >= 0.7 && dx * dy < 0 && Math.abs(t) < 0.9) k = 2; // the side facets flash
      pc.set(X, Y, GR[k]);
    });
    if (S === 1) pc.set(gx - 1, gy - 1, 0xffffff); else { pc.set(np(gx - 0.8), np(gy - 0.8), 0xffffff); pc.set(np(gx - 0.8) + 1, np(gy - 0.8), GR[0]); }
    if (T0.stars) g.eachD((X, Y, x, y) => pc.emit(X, Y, 0.8));
  }
  ink(pc);
  if (!T0.rust) { const [gx, gy] = spine(0.24); glint(pc, Math.floor(gx), Math.floor(gy - 1), 1, R[0]); }
  if (T0.stars) {
    glint(pc, 26, 24, 1, 0xfff0b0, 0.9);
    head.eachD((X, Y, x, y) => {
      if (hash2(X, Y, 41) >= 0.06 / S || R.indexOf(pc.get(X, Y)) < 2) return;
      pc.set(X, Y, 0xfffbe8); pc.emit(X, Y, 1);
      // at S > 1 the brightest flecks twinkle: four dim arms
      if (S > 1 && hash2(X, Y, 42) < 0.35) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (head.get(X + dx, Y + dy)) { pc.set(X + dx, Y + dy, 0xf6d890); pc.emit(X + dx, Y + dy, 0.6); }
    });
  }
}



/** Paint a stripe-space mask: tone(A, d, X, Y) (A, d design; X, Y native) → ramp index (null = skip). */
function stripes(pc, mask, R, tone) {
  mask.eachD((X, Y, x, y) => { const [A, d] = Ad(x, y); const k = tone(A, d, X, Y); if (k !== null && k !== undefined) pc.set(X, Y, R[clamp(k, 0, 6)]); });
}
/** Generic stripe shading for a 45° bar: lit top-left edge, mid body, shaded bottom-right edge. */
const barTone = (m, lo = 2, mid = 3, hi = 4) => (A, d, x, y) => (isTop(m, x, y) && !isBot(m, x, y) ? lo - 1 : isBot(m, x, y) ? hi : d < -0.5 ? lo : mid);

// ---------------------------------------------------------------- chisels
function chisel(pc, id) {
  const fine = id === 'chisel_fine';
  const W = fine ? RAMPS.darkWood() : RAMPS.wood();
  const ST = mat(fine ? 0x9ce0e6 : 0xa8aeb8, { cont: 1.3 });
  const FE = fine ? RAMPS.brass() : mat(0x8c8f98, { cont: 1.2 });
  const IR = RAMPS.iron();
  // handle: a slightly barrelled wooden grip
  const [hx0, hy0] = diagAt(-11.6, -0.5), [hx1, hy1] = diagAt(-2.6, -0.5);
  stick(pc, hx0, hy0, hx1, hy1, fine ? [1.05, 1.15] : [1.2, 1.3], W, { tones: [1, 2, 3, 3, 4, 5], grain: true, seed: fine ? 12 : 5, knots: fine ? [] : [0.35] });
  // octagonal facet line along the grip
  { const [ax, ay] = diagAt(-10.6, -1.5), [bx, by] = diagAt(-3.4, -1.5); line(pc, ax, ay, bx, by, (i, X, Y) => (W.indexOf(pc.get(X, Y)) === 2 && hash2(X, Y, 7) < 0.7 ? W[1] : null)); }
  // mushroomed strike cap, burred from years of mallet blows
  const [cx, cy] = diagAt(-12.5, -0.5);
  const cap = M().disk(cx, cy, fine ? 1.6 : 2.1);
  if (!fine) for (const [x, y] of S === 1 ? [[cx - 2.6, cy - 0.5], [cx + 0.5, cy + 2.2]] : [[cx - 2.6, cy - 0.5], [cx - 2.4, cy], [cx + 0.5, cy + 2.2], [cx + 1, cy + 2], [cx - 1.6, cy - 1.9]]) cap.set(np(x), np(y));
  seam(pc, cap, 'shadow');
  cap.eachD((X, Y, x, y) => { const t = (x + 0.5 - cx) * -0.6 + (y + 0.5 - cy) * -0.8; pc.set(X, Y, IR[t > 0.9 ? 1 : t > -0.2 ? 2 : t > -1 ? 3 : 4]); });
  if (!fine) {
    if (S === 1) { pc.set(cx - 1, cy - 1, IR[0]); pc.set(cx, cy + 1, IR[5]); }
    else {
      // the struck face: a bright worn spot, the burr curling over the rim, a dark dent
      const X = np(cx - 0.8), Y = np(cy - 0.8);
      pc.set(X, Y, IR[0]); pc.set(X + 1, Y, IR[1]); pc.set(X, Y + 1, IR[1]);
      pc.set(np(cx + 0.2), np(cy + 1), IR[5]); pc.set(np(cx + 0.2) + 1, np(cy + 1), IR[4]);
      cap.eachD((XX, YY) => { if (!cap.get(XX - 1, YY) && hash2(XX, YY, 3) < 0.4) pc.set(XX, YY, IR[1]); });
    }
  }
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
  stripes(pc, bl, ST, (A, d, x, y) => {
    const top = isTop(bl, x, y), bot = isBot(bl, x, y);
    if (A > tip - 0.6) return 0;                    // honed edge
    if (A > tip - 2.2) return top ? 0 : bot ? 3 : 1; // the ground bevel catches the light
    if (top) return 1;
    if (bot) return 4;
    return d < -1 ? 2 : 3;
  });
  // bevel boundary + a few honing scratches + maker's mark
  bl.eachD((X, Y, x, y) => { const [A] = Ad(x, y); if (Math.abs(A - (tip - 2.3)) < 0.26 && !isTop(bl, X, Y)) pc.set(X, Y, ST[4]); });
  const [mx, my] = diagAt(7, -1.4);
  if (S === 1) { pc.set(mx, my, ST[4]); pc.set(mx + 1, my, ST[5]); }
  else { const X = np(mx), Y = np(my); for (const [dx, dy, k] of [[0, 0, 4], [1, -1, 4], [2, -2, 5], [1, 0, 5], [2, -1, 3], [0, 1, 2]]) if (bl.get(X + dx, Y + dy)) pc.set(X + dx, Y + dy, ST[k]); } // a struck maker's arrow
  if (fine) { const [ex, ey] = diagAt(8.6, -1.2); if (S === 1) pc.set(ex, ey, 0xf4e08a); else { const X = np(ex), Y = np(ey); pc.set(X, Y, 0xfff4b0); pc.set(X + 1, Y - 1, 0xf4e08a); pc.set(X + 1, Y, 0xb08a3a); } }
  ink(pc);
  const [gx, gy] = diagAt(tip - 1.2, -2.2); glint(pc, Math.floor(gx), Math.floor(gy), 1, ST[0]);
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
  const LE = RAMPS.leather();
  if (S === 1) {
    pc.set(hx, hy, W[6]); pc.set(hx + 1, hy, W[5]); pc.set(hx, hy + 1, W[4]);
    // leather thong through the hole
    for (const [dx, dy, k] of [[-1, 1, 2], [-2, 2, 3], [-2, 3, 3], [-1, 4, 4], [0, 4, 4], [1, 3, 3]]) pc.set(hx + dx, hy + dy, LE[k]);
  } else {
    // a drilled hole: dark bore, its lit lower wall, a worn rim
    const X = np(hx), Y = np(hy);
    for (const [dx, dy, k] of [[0, 0, 6], [1, 0, 6], [0, 1, 6], [1, 1, 5], [-1, 0, 4], [0, -1, 4], [1, -1, 4], [-1, 1, 4], [2, 0, 3], [2, 1, 2], [1, 2, 2], [0, 2, 3]]) if (hm.get(X + dx, Y + dy)) pc.set(X + dx, Y + dy, W[k]);
    // the leather thong looped through it: a flat strap with a lit edge, a stitched join
    const P = [[hx + 0.4, hy + 1], [hx - 1, hy + 1.6], [hx - 2, hy + 2.8], [hx - 1.8, hy + 4], [hx - 0.6, hy + 4.6], [hx + 0.8, hy + 4.2], [hx + 1.4, hy + 3.2]];
    for (let i = 0; i + 1 < P.length; i++) {
      line(pc, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], LE[i < 3 ? 2 : 3]);
      line(pc, P[i][0] + 0.5, P[i][1] + 0.3, P[i + 1][0] + 0.5, P[i + 1][1] + 0.3, LE[i < 3 ? 3 : 4]);
      line(pc, P[i][0] + 0.9, P[i][1] + 0.6, P[i + 1][0] + 0.9, P[i + 1][1] + 0.6, LE[5]);
    }
    pc.set(np(hx - 0.6), np(hy + 4.6), 0xe0c890);
  }
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
  bm.eachD((X, Y, x, y) => {
    const [A, d] = Ad(x, y);
    let k = d < -3 ? 2 : d < 0 ? 3 : 4;
    const hs = hash2(d, 1, badger ? 9 : 7);                // strand bundles: each stripe its own shade
    if (hs < 0.34) k += 1; else if (hs > 0.8 && k > 2) k -= 1;
    if (hash2(X, Y, 5) < 0.08) k += 1;
    if (isTop(bm, X, Y) && !isBot(bm, X, Y)) k = 1;
    if (A < 3.6) k = Math.max(k, 4);                    // shadow under the ferrule
    let c = BR[clamp(k, 1, 5)];
    if (badger) {
      const tipZone = A > end(d) - 2.2, band = A > end(d) - 4.4 && !tipZone;
      if (tipZone) c = mix(0xf4f0e8, BR[clamp(k, 1, 5)], 0.18 + (k - 2) * 0.08);
      else if (band) c = mix(0x221c22, BR[clamp(k, 1, 5)], 0.35);
    } else if (A > end(d) - 1.2 && k > 1) c = BR[k - 1];
    pc.set(X, Y, c);
  });
  // two stray hairs
  for (const [A, d] of [[9.4, -6.2], [10.4, 4.6]]) {
    const [x, y] = diagAt(A, d);
    if (S === 1) { pc.set(x, y, badger ? 0xe8e0d8 : BR[2]); continue; }
    // a stray hair curling away from the fan
    const [x2, y2] = diagAt(A + 1.2, d + (d < 0 ? -0.9 : 0.9));
    line(pc, x, y, x2, y2, (i) => (i < 2 ? BR[3] : badger ? 0xe8e0d8 : BR[2]));
  }
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
  bit.eachD((X, Y, x, y) => {
    let k = y < 15 ? 2 : y < 17 ? 3 : 4;
    if (((x + y * 1.2) % 3.4 + 3.4) % 3.4 < 1.1) k = Math.min(5, k + 2);
    else if (((x + y * 1.2) % 3.4 + 3.4) % 3.4 < 1.8) k = Math.max(1, k - 1);
    pc.set(X, Y, BIT[k]);
  });
  if (S === 1) pc.set(30, 15, BIT[0]); else { const X = nc(30), Y = nc(15); pc.set(X, Y, BIT[0]); pc.set(X - 1, Y, BIT[1]); pc.set(X + 1, Y + 1, BIT[1]); }
  // chuck
  const ch = M().rect(18, 11, 3, 10);
  seam(pc, ch, 'shadow');
  ch.eachD((X, Y, x, y) => pc.set(X, Y, BIT[y < 13 ? 1 : y < 17 ? 2 : y < 19 ? 3 : 4]));
  if (S === 1) for (let y = 12; y < 20; y += 2) pc.set(20, y, BIT[5]);
  else {
    // the jaws' grip grooves, and the chuck-key holes
    for (let y = 12; y < 20; y += 1.5) { const Y = np(y); for (let X = 18 * S + 1; X < 21 * S; X++) if (ch.get(X, Y) && ch.get(X, Y + 1)) { pc.set(X, Y, BIT[X > 20 * S ? 5 : 4]); if (X < 20 * S) pc.set(X, Y + 1, BIT[1]); } }
    for (const y of [13, 18]) { const X = np(19), Y = np(y); pc.set(X, Y, BIT[6] ?? BIT[5]); pc.set(X + 1, Y, BIT[5]); pc.set(X, Y + 1, BIT[5]); pc.set(X + 1, Y + 1, BIT[2]); }
  }
  // body: boiler cylinder (horizontal) with a domed back end
  const body = M().rect(6, 9, 12, 14).ellipse(6.5, 16, 3.2, 7);
  seam(pc, body, 'shadow');
  body.eachD((X, Y, x, y) => {
    const v = (y + 0.5 - 16) / 7;
    let k = v < -0.72 ? 2 : v < -0.35 ? 1 : v < 0.15 ? 2 : v < 0.55 ? 3 : 4;
    if (x < 5 && k < 4) k++;
    pc.set(X, Y, B[clamp(k, 1, 5)]);
  });
  // riveted bands
  const bands = M().rect(9, 8, 1, 16).union(M().rect(15, 8, 1, 16)).and(body);
  seam(pc, bands, 'shadow');
  bands.eachD((X, Y, x, y) => {
    const v = (y + 0.5 - 16) / 7;
    let k = v < -0.4 ? 2 : v < 0.3 ? 3 : 4;
    if (S > 1 && !bands.get(X - 1, Y)) k = Math.max(1, k - 1); // the band's lit left lip
    else if (S > 1 && !bands.get(X + 1, Y)) k = Math.min(5, k + 1);
    pc.set(X, Y, BAND[k]);
    if (S === 1 && Math.round(y) % 3 === 0) pc.set(X, Y, BAND[1]);
  });
  if (S > 1) for (const bx of [9, 15]) for (let y = 10; y < 22.5; y += 3) if (body.get(np(bx + 0.5), np(y))) rivet(pc, bx, y, BAND);
  // pistol grip in leather, trigger
  const LE = RAMPS.leather();
  const grip = M().poly([[8, 21], [13, 21], [11.4, 29.6], [6.4, 29.6]]);
  seam(pc, grip, 'shadow');
  grip.eachD((X, Y, x, y) => {
    let k = x < 8.6 + (y - 21) * -0.2 ? 2 : x > 10.6 - (y - 21) * 0.2 ? 4 : 3;
    const r = Y % (3 * S);
    if (r === 0) k++;                    // the grooves between the finger rolls
    else if (S > 1 && r === 1) k--;      // each roll's lit upper edge
    pc.set(X, Y, LE[clamp(k, 1, 5)]);
  });
  stitch(pc, [[10.4, 22], [9, 29]], mix(LE[1], 0xf0d8a0, 0.6), { gap: 2 });
  const trig = M().rect(13, 22, 2, 3);
  trig.eachD((X, Y, x, y) => pc.set(X, Y, BAND[isTop(trig, X, Y) ? 2 : x > 14.5 ? 5 : 4]));
  if (lum) {
    // vented cowl and a glowing lumite core window
    const win = M().ellipse(12, 15.5, 3.4, 3.2);
    const LR = mat(0x7bf08a, { cont: 1.05 });
    seam(pc, win, B[6]);
    win.eachD((X, Y, x, y) => { const t = (x + 0.5 - 12) * -0.6 + (y + 0.5 - 15.5) * -0.8; pc.set(X, Y, LR[t > 1.2 ? 1 : t > -0.4 ? 2 : 3]); pc.emit(X, Y, 0.9); });
    if (S === 1) { pc.set(11, 14, 0xf0fff0); pc.set(12, 14, 0xc8ffd0); for (const vy of [10, 12]) for (let x = 7; x < 17; x++) if (body.get(x, vy) && (x === 7 || x > 8)) pc.set(x, vy, B[x % 2 ? 4 : 5]); }
    else {
      // the window's glass: a curved reflection, the core's inner facets showing through
      line(pc, 10.4, 14.6, 11.6, 13.4, 0xf0fff0); pc.set(np(12.2), np(13.6), 0xc8ffd0);
      win.eachD((X, Y, x, y) => { if ((X * 2 + Y) % 7 === 0 && !isTop(win, X, Y)) pc.set(X, Y, LR[2]); });
      // vent slots: dark slit, a lit lip below, bridges between
      for (const vy of [10, 12]) for (let X = 7 * S; X < 17 * S; X++) {
        const Y = vy * S;
        if (!body.get(X, Y) || (X > 7 * S + 2 && X < 9 * S) || X % 5 === 4) continue;
        pc.set(X, Y, B[5]); if (body.get(X, Y + 1)) pc.set(X, Y + 1, B[2]);
      }
    }
  } else {
    // pressure gauge on a stem, needle in the red, a brass valve
    const stem = M().rect(12, 6, 2, 3);
    stem.eachD((X, Y, x, y) => pc.set(X, Y, B[isTop(stem, X, Y) ? 1 : x < 12.5 ? 2 : 4]));
    const g = M().disk(13, 4.6, 3.2);
    seam(pc, g, 'shadow');
    g.eachD((X, Y, x, y) => { const r = Math.hypot(x + 0.5 - 13, y + 0.5 - 4.6); pc.set(X, Y, r > 2.1 ? B[(x + y) < 17 ? 1 : 4] : (x + y) > 18 ? 0xcfc4ac : 0xf4eedc); });
    // tick marks round the dial, needle swinging toward the red
    if (S === 1) {
      pc.set(11, 4, 0x8a7a68); pc.set(13, 3, 0x8a7a68); pc.set(14, 4, 0xc8301e);
      pc.set(13, 5, 0x2a1a14); pc.set(12, 5, 0x2a1a14);
      pc.set(12, 3, 0xffffff);
    } else {
      const ox = 13 * S, oy = Math.round(4.6 * S);
      for (let a = Math.PI * 0.85; a <= Math.PI * 2.15; a += Math.PI * 0.26) {
        const red = a > Math.PI * 1.85;
        pc.set(ox + Math.round(Math.cos(a) * 3), oy + Math.round(Math.sin(a) * 3), red ? 0xc8301e : 0x8a7a68);
      }
      line(pc, 13, 4.6, 14.6, 3.6, 0x2a1a14); // the needle, pointing into the red
      pc.set(ox, oy, 0x4a3a30); pc.set(ox - 1, oy, 0x2a1a14);
      pc.set(ox - 2, oy - 2, 0xffffff); pc.set(ox - 1, oy - 3, 0xffffff); // the glass catches the light
    }
    const vlv = M().rect(6, 6, 2, 3);
    vlv.eachD((X, Y, x, y) => pc.set(X, Y, B[isTop(vlv, X, Y) ? 1 : x < 6.5 ? 2 : isBot(vlv, X, Y) ? 4 : 3]));
    for (const [x, y] of [[11, 12], [16, 12], [11, 20], [16, 20]]) rivet(pc, x, y, B);
  }
  ink(pc);
  if (!lum) {
    // steam puffs from the valve (soft, translucent: after the outline)
    const ST = 0xf6f2ee;
    // lumpy, billowing puffs (never round): a lit top, a shaded underside
    for (const [x, y, r, a, sd] of [[5, 3.6, 1.7, 225, 1], [2.6, 2.2, 1.3, 190, 2], [7.6, 1.6, 1, 150, 3]]) {
      const puff = M().fn((px, py) => { const dx = px + 0.5 - x, dy = py + 0.5 - y, t = Math.atan2(dy, dx); return Math.hypot(dx, dy) < r * (1 + 0.16 * Math.sin(t * 3 + sd) + 0.08 * Math.sin(t * 5 + sd * 2)); });
      puff.eachD((X, Y, px, py) => { if (!pc.alpha(X, Y)) pc.set(X, Y, py + 0.5 > y + r * 0.35 ? 0xd2cede : (X + Y) % 3 ? ST : 0xe4e0ea, a); });
    }
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
  if (S === 1) for (const A of [1.4, 2.4]) for (let d = -3; d <= 2; d++) { const [x, y] = diagAt(A, d); if (barrel.get(x, y) && (d + Math.round(A * 2)) % 2) pc.set(x, y, B[5]); }
  else for (const A of [1.2, 1.9, 2.6]) {
    // vent slots: a dark slit with a lit lip on its far side
    const [ax, ay] = diagAt(A, -3.4), [bx, by] = diagAt(A, 2.4), [cx, cy] = diagAt(A + 0.35, -3.4), [ex, ey] = diagAt(A + 0.35, 2.4);
    line(pc, ax, ay, bx, by, B[5], barrel); line(pc, cx, cy, ex, ey, B[1], barrel);
  }
  // hood rim
  const hood = diagMask((A, d) => A >= 6.4 && A <= 7.6 && Math.abs(d + 0.5) <= 6.6);
  seam(pc, hood, 'shadow');
  stripes(pc, hood, B, (A, d) => (d < -3 ? 1 : d < 2 ? 2 : 4));
  // lens
  const [lx, ly] = diagAt(8.2, -0.5);
  const lens = M().oval(lx, ly, 1.7, 4.4, -Math.PI / 4);
  const LR = mat(beamC, { cont: 1.05 });
  lens.eachD((X, Y, x, y) => { const t = (x + 0.5 - lx) * -0.7 + (y + 0.5 - ly) * -0.7; pc.set(X, Y, LR[t > 1.4 ? 0 : t > 0 ? 1 : t > -1.6 ? 2 : 3]); pc.emit(X, Y, 0.9); });
  for (const A of [-2.4]) { const [rx, ry] = diagAt(A, -2.5); rivet(pc, rx, ry, B); }
  if (prism) {
    // a small prism crystal mounted on the barrel
    const pm = M().poly([[11, 14], [14, 11], [15.5, 15.5]]);
    seam(pc, pm, 'shadow');
    pm.eachD((X, Y, x, y) => { pc.set(X, Y, (x + y) < 26 ? 0xf8f0ff : (x + y) < 28 ? 0xd8b8ff : 0x9a7ad8); pc.emit(X, Y, 0.6); });
  }
  ink(pc, { skip: (x, y) => x > 22 && y < 9 && lens.clone().dilate(1).get(x, y) === 0 && false });
  // beam: translucent cone from the lens toward the top-right corner
  const cone = M().poly([diagAt(8.6, -6.4), diagAt(13.4, -10.4), diagAt(13.4, 9.4), diagAt(8.6, 5.4)]);
  cone.eachD((X, Y, x, y) => {
    if (pc.alpha(X, Y)) return;
    const [A, d] = Ad(x, y);
    const t = clamp((A - 8.6) / 4.8, 0, 1);
    if (t > 0.55 && hash2(X, Y, 4) < (t - 0.55) * 1.8) return;
    const c = prism ? [0xff9ad0, 0xffe08a, 0x9affd0, 0x9ad0ff, 0xd0a0ff][clamp(Math.floor((d + 12) / 4.6), 0, 4)] : (Math.abs(d + 0.5) < 2 ? 0xd8fcff : beamC);
    pc.set(X, Y, c, Math.round((170 - t * 120) * (((X + Y) & 1) ? 1 : 0.8)));
    pc.emit(X, Y, 0.45);
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
  post.eachD((X, Y, x, y) => {
    let k = isTop(post, X, Y) ? 1 : x < 13.5 ? 2 : x < 17 ? 3 : x < 19 ? 4 : 5;
    const n = vnoise(x * 1.1, y * 0.16, 3);
    if (n > 0.7 && k < 5) k++; else if (n < 0.14 && k > 2) k--;
    else if (S > 1 && k > 1 && k < 5 && vnoise(x * 2.6, y * 0.3, 13) > 0.78) k++; // fine grain lines
    if (S > 1 && k > 2 && Math.abs(((y * 0.7 + Math.sin(x)) % 3.1) - 1.5) < 0.08) k--; // adze facets catching light
    pc.set(X, Y, W[k]);
  });
  // cap beam across the top, end grain visible on the left
  const cap = M().rect(3, 4, 27, 6);
  seam(pc, cap, 'shadow');
  cap.eachD((X, Y, x, y) => {
    let k = isTop(cap, X, Y) ? 1 : y < 7 ? 2 : y < 9 ? 3 : 4;
    const n = vnoise(x * 0.15, y * 1.1, 8);
    if (n > 0.68 && k < 5) k++; else if (n < 0.14 && k > 1) k--;
    else if (S > 1 && k > 1 && k < 4 && vnoise(x * 0.3, y * 2.6, 18) > 0.78) k++;
    pc.set(X, Y, W[k]);
  });
  // end grain rings on the cap's left end
  const EG = mat(0xc89a62, { cont: 1.05 });
  if (S === 1) {
    for (let y = 4; y < 10; y++) for (let x = 3; x < 5; x++) pc.set(x, y, EG[(Math.abs(y - 6.5) + (x - 3)) < 1.2 ? 3 : 2]);
    pc.set(3, 6, EG[4]); pc.set(4, 7, EG[4]);
  } else {
    // growth rings round an off-centre pith, a radial check splitting them
    for (let Y = 4 * S; Y < 10 * S; Y++) for (let X = 3 * S; X < 5 * S; X++) {
      if (!cap.get(X, Y)) continue;
      const r = Math.hypot((dc(X) + 0.5 - 3.4) * 2.2, dc(Y) + 0.5 - 6.8);
      let k = Math.floor(r * 1.6) % 2 ? 2 : 3;
      if (r < 0.4) k = 4;
      if (isTop(cap, X, Y)) k = 1;
      pc.set(X, Y, EG[k]);
    }
    line(pc, 3.4, 6.8, 4.6, 8.8, EG[5]);
  }
  // checks (cracks) along the grain: a dark split with a lit lip beside it
  for (const [x, y, n] of [[8, 6, 4], [22, 7, 5], [16, 14, 5], [17, 22, 3]]) {
    if (S === 1) { for (let i = 0; i < n; i++) pc.set(y > 10 ? x : x + i, y > 10 ? y + i : y, W[5]); continue; }
    const vert = y > 10, x1 = vert ? x + 0.3 : x + n, y1 = vert ? y + n : y + 0.3;
    line(pc, x, y, x1, y1, W[5]); line(pc, x + (vert ? 0.5 : 0.3), y + (vert ? 0.4 : 0.5), x1 + (vert ? 0.5 : -0.3), y1 + (vert ? -0.4 : 0.5), W[2]);
  }
  // iron knee braces with nails
  const br = M().poly([[9, 10], [13, 10], [13, 16]]).union(M().poly([[20, 10], [24, 10], [20, 16]]));
  seam(pc, br, 'shadow');
  br.eachD((X, Y, x, y) => pc.set(X, Y, IR[isTop(br, X, Y) ? 2 : isBot(br, X, Y) ? 5 : (x < 13 ? 3 : 4)]));
  if (S > 1) dents(pc, br, IR, { dens: 0.12, seed: 4 });
  for (const [x, y] of [[10, 10], [12, 13], [21, 10], [20, 13]]) rivet(pc, x, y, IR);
  for (const [x, y] of [[6, 6], [26, 6], [15, 18], [15, 25]]) rivet(pc, x, y, IR);
  // foot plank
  const foot = M().rect(9, 28, 15, 3);
  seam(pc, foot, 'shadow');
  foot.eachD((X, Y, x, y) => pc.set(X, Y, W[isTop(foot, X, Y) ? 1 : y < 29 ? 2 : y < 30 ? 3 : 4]));
  ink(pc);
}

function stakeIcon(pc) {
  const W = RAMPS.ash();
  const st = M().poly([[13.5, 12], [19, 12], [19, 24], [16.6, 30.5], [15.6, 30.5], [13.5, 24]]);
  seam(pc, st, 'shadow');
  st.eachD((X, Y, x, y) => {
    let k = x <= 14 ? 2 : x < 17 ? 3 : 4;
    if (y > 24 && x >= 16) k = 5; // whittled point facets
    const n = vnoise(x * 1.2, y * 0.2, 2);
    if (n > 0.72 && k < 5) k++;
    pc.set(X, Y, W[k]);
  });
  // knife cuts on the point
  if (S === 1) for (const [x, y] of [[15, 25], [16, 27], [14, 24]]) pc.set(x, y, W[1]);
  else for (const [x, y, l] of [[15, 25, 1.2], [16, 27, 1], [14, 23.6, 1.4], [17.2, 24.6, 1]]) line(pc, x, y, x + l * 0.4, y + l, (i) => (i ? W[2] : W[1]), st);
  // twine lashing under the crystal
  const TW = RAMPS.twine();
  if (S === 1) {
    for (let y = 11; y <= 14; y++) for (let x = 13; x <= 19; x++) if (st.get(x, y) || y <= 12) pc.set(x, y, TW[(y % 2 ? 2 : 4) + (x > 17 ? 1 : 0)]);
    pc.set(20, 14, TW[3]); pc.set(21, 15, TW[4]);
  } else {
    // wound turns: each a lit rolled cord with a dark crease, crossing over at a slant
    const lash = M().rect(13, 11, 7, 4).and(M().rect(13, 11, 7, 2).union(st));
    seam(pc, lash, 'shadow');
    lash.eachD((X, Y, x, y) => {
      const r = (Y + Math.floor((X - 13 * S) / 4)) % 3;
      let k = r === 0 ? 4 : r === 1 ? 2 : 3;
      if (x > 17.5) k++;
      if (isTop(lash, X, Y) && r !== 0) k = Math.max(1, k - 1);
      pc.set(X, Y, TW[clamp(k, 1, 5)]);
    });
    line(pc, 19.8, 14, 21.4, 15.8, (i) => TW[i < 2 ? 3 : 4]); line(pc, 20.2, 13.8, 21.8, 15.4, TW[2]);
  }
  // lumite crystal: two facets lit, two shaded, a bright inner streak
  const LR = mat(0x7bf08a, { cont: 1.1 });
  const c = M().poly([[16.3, 0.6], [21, 6.6], [16.3, 11.4], [11.6, 6.6]]);
  seam(pc, c, 'shadow');
  c.eachD((X, Y, x, y) => {
    const l = x + 0.5 < 16.3, u = y + 0.5 < 6.6;
    pc.set(X, Y, LR[l ? (u ? 1 : 2) : (u ? 2 : 4)]);
    pc.emit(X, Y, 0.9);
  });
  if (S === 1) for (let y = 3; y < 10; y++) { pc.set(16, y, LR[y < 6 ? 0 : 1]); pc.emit(16, y, 1); }
  else { line(pc, 16, 2.6, 16, 9.6, (i) => LR[i < 6 ? 0 : 1], c, 1); line(pc, 17.2, 4.2, 18.6, 6.6, LR[1], c, 0.9); line(pc, 14.4, 7.4, 15.2, 8.8, LR[1], c, 0.9); }
  ink(pc);
  for (const [x, y] of [[9, 3], [24, 5], [23, 11]]) glint(pc, x, y, 1, 0xb8ffb8, 0.8);
  glint(pc, 14, 4, 0, 0, 1);
}

export { pickaxe, chisel, brush, drill, xrayLamp, beamIcon, stakeIcon, frame, handle, woodRamp, PICK_TIER };

// Icons: the dispatcher for tools (picks per tier, chisels, brushes, drills, x-ray lamps,
// supplies: gearTools.js), equipment (helmets, gloves, suits, boots, bags: gearWear.js), forged
// weapons (gearWeapons.js) and the UI glyphs (coin, bolt, book, heart) drawn here. Authored on
// the 32-unit design grid and painted natively at S× (res.js).
import { mat } from './color.js';
import { vol, vnoise } from './shade.js';
import { ring } from './parts.js';
import { M, loop, form, marks, seam, step, ink, glint, line, isTop, isBot, hash2, S, dc, nc, np, dot, dotE, twinkle } from './lifeKit.js';
import { drawExplosiveIcon } from '../../deep/explosives/icon.js';
import * as TOOLS from './gearTools.js';
import * as WEAR from './gearWear.js';

// ---------------------------------------------------------------- shared shapes
/**
 * Paint a straight round shaft (handle) between two points with cylinder shading and grain.
 * Returns its mask.
 */
export function shaft(pc, x0, y0, x1, y1, r, R, o = {}) {
  const m = M().capsule(x0, y0, x1, y1, r);
  if (o.clip) m.sub(o.clip);
  if (o.ring !== false) ring(pc, m, R);
  vol(pc, m, R, { mode: 'cyl', axis: Math.atan2(y1 - y0, x1 - x0), spec: o.spec });
  if (o.grain !== false) {
    const ax = x1 - x0, ay = y1 - y0, L = Math.hypot(ax, ay) || 1;
    m.eachD((X, Y, x, y) => {
      const u = ((x + 0.5 - x0) * ax + (y + 0.5 - y0) * ay) / L;
      const v = (-(x + 0.5 - x0) * ay + (y + 0.5 - y0) * ax) / L;
      const k = R.indexOf(pc.getHex(X, Y));
      if (k > 1 && k < 5 && vnoise(u * 0.25, v * 1.6, o.seed || 3) > 0.68) pc.set(X, Y, R[k + 1]);
    });
  }
  return m;
}

// ---------------------------------------------------------------- weapons
// Forged weapons live in gearWeapons.js (re-exported here for PixelArt.js / home.js).
export { drawWeaponArt } from './gearWeapons.js';

// ---------------------------------------------------------------- UI glyphs
// Hand-built outlines (lifeKit.loop), flat planes lit from the top-left, the tinted ink outline,
// rim light and glints: a hand-struck coin, a jagged bolt, a worn tome, a plump heart.
function coin(pc) {
  const R = mat(0xeab434, { cont: 1.22, warm: 55 });
  // a worn, hand-struck coin leaning on a little stack of two more: a touch out of round with a
  // flat spot, a raised beaded rim with a fresh nick in it, the thick reeded edge showing on
  // its right, an embossed mole paw rubbed smooth on its high points, scuffs
  const flat = (P, th) => {
    const top = loop(P), side = top.clone().shift(0, th).sub(top);
    side.eachD((X, Y, x, y) => pc.set(X, Y, R[(X % 2) ? 3 : 5]));
    side.eachD((X, Y, x, y) => { if (!side.get(X, Y + 1)) pc.set(X, Y, R[5]); });
    top.eachD((X, Y, x, y) => pc.set(X, Y, R[isTop(top, X, Y) ? 1 : isBot(top, X, Y) ? 4 : (X + Y) % 5 ? 2 : 3]));
    return top;
  };
  flat([[15.6, 27.4], [20, 25.4], [26, 25.2], [30.4, 26.4], [30.8, 28.2], [27, 29.6], [21, 30], [16.6, 29.2]], 2);
  flat([[13.6, 24.6], [17.6, 22.6], [23.6, 21.8], [28.6, 22.8], [30.2, 24.6], [27.8, 26.4], [21.6, 27], [16, 26.4]], 2);
  const FACE = [[13.4, 2.4], [18, 3.2], [21.6, 5.8], [23.6, 9.6], [24.2, 14], [23.4, 18.6], [21, 22.6], [17.4, 25.2], [13, 26], [8.8, 25], [5.4, 22.2], [3.4, 18], [2.8, 13.6], [3.6, 9.2], [5.6, 5.8, 1], [9.2, 3.4]];
  const face = loop(FACE);
  const nick = loop([[19.6, 2.6], [25, 4.4], [21.2, 8.6, 1]]);
  const edge = loop(FACE.map(([x, y, c]) => [x + 2.2, y + 0.6, c])).sub(face);
  face.sub(nick); edge.sub(nick);
  seam(pc, face.clone().union(edge), 'shadow');
  edge.eachD((X, Y, x, y) => pc.set(X, Y, R[(Y % 2) ? 3 : 5]));
  edge.eachD((X, Y, x, y) => { if (isBot(edge, X, Y) && !face.get(X - 1, Y)) pc.set(X, Y, R[5]); });
  // the face: raised rim, sunk field, a row of beads inside the rim
  const field = face.clone().erode(S === 1 ? 2 : 3), bead = field.clone().sub(field.clone().erode(1));
  face.eachD((X, Y, x, y) => {
    const lit = (x + 0.5 - 13) * 0.6 + (y + 0.5 - 14) * 0.8 < 0;
    if (!field.get(X, Y)) pc.set(X, Y, R[isTop(face, X, Y) ? 1 : lit ? 2 : 4]);
    else pc.set(X, Y, R[3]);
  });
  bead.eachD((X, Y, x, y) => { const lit = (x + 0.5 - 13) * 0.6 + (y + 0.5 - 14) * 0.8 < 0; pc.set(X, Y, (X + Y) % 3 === 0 ? R[lit ? 2 : 1] : R[lit ? 4 : 2]); });
  // wear: the field rubbed brighter toward the top-left
  field.clone().erode(1).eachD((X, Y, x, y) => { if ((x + 0.5 - 13) * 0.6 + (y + 0.5 - 14) * 0.8 < -4 && hash2(X, Y, 3) < 0.5) pc.set(X, Y, R[2]); });
  // embossed paw: pad and four toe beans, high points worn bright, low edges shaded
  const parts = [loop([[9.4, 17], [12.4, 14.4], [16, 14.6], [18, 17.6], [16.8, 20.6], [13, 21.2], [10, 20]]),
    loop([[7, 13.2], [8.4, 11], [10.2, 11.8], [9.6, 14.2]]), loop([[10.6, 9.8], [12.4, 8], [14.2, 9], [13.2, 11.6]]),
    loop([[15.2, 9.4], [17.2, 8.4], [18.2, 10.4], [16.4, 12]]), loop([[18.4, 12.6], [20.2, 11.8], [21, 13.8], [19.2, 15]])];
  for (const m of parts) {
    m.eachD((X, Y, x, y) => { const t = isTop(m, X, Y), b2 = isBot(m, X, Y); pc.set(X, Y, R[t && !b2 ? 1 : b2 && !t ? 4 : 2]); });
    m.clone().dilate(1).sub(m).eachD((X, Y, x, y) => { if (field.get(X, Y) && (m.get(X - 1, Y) || m.get(X, Y - 1))) pc.set(X, Y, R[5]); });
  }
  // the nick: bright fresh metal along its cut, and scratches across the field
  nick.clone().dilate(1).and(face.clone().union(edge)).eachD((X, Y, x, y) => pc.set(X, Y, R[x < 22 ? 1 : 3]));
  line(pc, 6, 19, 9, 23, (i) => (i % 2 ? null : R[4]));
  line(pc, 17, 21, 21, 19, (i) => (i % 3 === 1 ? null : R[2]));
  ink(pc);
  glint(pc, 7, 7, 1, 0xffffff, R[0]);
  if (S === 1) { pc.set(6, 10, R[0]); pc.set(22, 7, 0xffffff); }
  else { pc.set(nc(6), nc(10), R[0]); pc.set(nc(6) + 1, nc(10) + 1, R[1]); twinkle(pc, 22, 7, 0xffffff, R[0], 0.5, 0); }
}

function boltGlyph(pc) {
  const R = mat(0xffcc2a, { cont: 1.18, warm: 55 });
  // a jagged, slightly crooked lightning bolt with a split prong and a lit facet
  const m = loop([[19.6, 1, 1], [24.6, 1.4, 1], [19.4, 10.4, 1], [26.4, 10.8, 1], [12.6, 30.6, 1], [15.6, 18.6, 1], [12.4, 20.4, 1], [14.2, 17.4, 1], [7.2, 17.6, 1]]);
  m.eachD((X, Y, x, y) => { const lit = (x - 16) * 0.55 + (y - 15) * -0.25 < 0; pc.set(X, Y, R[lit ? 2 : 3]); });
  m.eachD((X, Y, x, y) => { const t = !m.get(X - 1, Y) || !m.get(X, Y - 1), b2 = !m.get(X + 1, Y) || !m.get(X, Y + 1); if (t && !b2) pc.set(X, Y, R[1]); else if (b2 && !t) pc.set(X, Y, R[4]); });
  line(pc, 21, 3, 11, 16, (i, X, Y) => (m.get(X, Y) && !(!m.get(X - 1, Y) || !m.get(X, Y - 1)) ? R[0] : null));
  line(pc, 22, 11, 15, 25, (i, X, Y) => (m.get(X, Y) && i % 3 !== 2 ? R[1] : null));
  ink(pc);
  glint(pc, 22, 3, 1);
  for (const [x, y] of [[27, 8], [6, 21], [10, 27]]) { if (S === 1) pc.set(x, y, 0xfff4b0); else twinkle(pc, x, y, 0xfffbe0, 0xffd860, 0.5, 0); }
}

function bookGlyph(pc) {
  const R = mat(0x9a3a2a, { cont: 1.12 });
  const GD = mat(0xe8b440, { cont: 1.2, warm: 54 });
  const PG = mat(0xf2e6c8, { cont: 1.05 });
  // a fat old tome in 3/4: page block on the side, worn leather cover, raised spine bands
  const pages = loop([[8, 6.6], [27, 4, 1], [28.4, 24.6], [9, 28.4]]);
  pages.eachD((X, Y, x, y) => pc.set(X, Y, PG[(Y + (x > 25 ? 1 : 0)) % 2 ? 2 : 3]));
  const cover = loop([[3.6, 6.4], [6, 4.6], [22.4, 2.4], [24.6, 3.6], [25.6, 23.6], [24, 25.6], [6.6, 28.6], [4.6, 27]]);
  seam(pc, cover, 'shadow');
  form(pc, cover, R, { flatten: 0.5, dome: 0.5, round: 3, bias: 0.06 });
  marks(pc, cover, R, { dens: 0.05, seed: 4, len: 2, dir: [1, -0.2] });
  // spine bands
  for (const y of [8, 15, 22]) {
    if (S === 1) { pc.set(4, y, R[1]); pc.set(5, y, R[2]); pc.set(4, y + 1, R[5]); pc.set(5, y + 1, R[4]); continue; }
    // a raised spine band: lit crown, a soft shoulder, the shadow it throws below
    for (let X = 4 * S - 1; X < 6 * S; X++) {
      if (!cover.get(X, y * S)) continue;
      pc.set(X, y * S - 1, R[3]); pc.set(X, y * S, R[X < 5 * S ? 1 : 2]); pc.set(X, y * S + 1, R[X < 5 * S ? 2 : 3]); pc.set(X, y * S + 2, R[5]); pc.set(X, y * S + 3, R[4]);
    }
  }
  // gilt frame, a gem in the middle, metal corner caps and a clasp
  const frame = loop([[8.4, 8.6], [20.6, 6.8], [21.4, 22.4], [9.4, 24.4]], { seg: 2 });
  frame.edge().eachD((X, Y, x, y) => pc.set(X, Y, GD[(X + Y) % 3 === 0 ? 1 : 3]));
  const gem = loop([[15, 11.2, 1], [18.4, 14.4, 1], [15.2, 18.6, 1], [12, 14.8, 1]]);
  gem.eachD((X, Y, x, y) => pc.set(X, Y, x + y < 29 ? 0x8ae0ff : x < 16 ? 0x4aa8e0 : 0x2a6ab0));
  if (S === 1) {
    pc.set(14, 13, 0xe8fbff);
    for (const [x, y] of [[4, 5], [22, 3], [24, 24], [5, 27]]) { pc.set(x, y, GD[1]); pc.set(x + 1, y, GD[2]); pc.set(x, y + 1, GD[3]); }
  } else {
    // the gem's facets: a table, a bright star, a dark culet glimpse
    pc.set(nc(14), nc(13), 0xffffff); pc.set(nc(14) + 1, nc(13), 0xe8fbff); pc.set(nc(14), nc(13) + 1, 0xc0ecff);
    line(pc, 15.2, 16.6, 16.4, 15.4, 0x1a4a90);
    // brass corner caps: folded triangles with a lit edge and a nail
    for (const [x, y, sx, sy] of [[4, 5, 1, 1], [22, 3, -1, 1], [24, 24, -1, -1], [5, 27, 1, -1]]) {
      const X = nc(x) + (sx < 0 ? 1 : 0), Y = nc(y) + (sy < 0 ? 1 : 0);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4 - j; i++) {
        const px = X + i * sx, py = Y + j * sy;
        if (!cover.get(px, py)) continue;
        pc.set(px, py, GD[i === 0 || j === 0 ? (sx > 0 && sy > 0 ? 1 : 2) : i + j === 3 ? 4 : 3]);
      }
      pc.set(X + sx, Y + sy, GD[0]);
    }
  }
  const cl = loop([[24, 12, 1], [28, 11.6, 1], [28.2, 15.4, 1], [24.2, 15.8, 1]]);
  cl.eachD((X, Y, x, y) => pc.set(X, Y, GD[Math.round(x) === 24 ? 1 : 3]));
  ink(pc);
  if (S === 1) {
    for (let y = 26; y < 31; y++) pc.set(19, y, y > 28 ? 0xb02a3a : 0xe04a4a);
    pc.set(18, 30, 0xb02a3a); pc.set(20, 31, 0xb02a3a);
  } else {
    // the silk bookmark: a lit edge, a fold, and a forked (swallow-tail) end
    for (let Y = 26 * S; Y < 31 * S; Y++) {
      const X = 19 * S + (Y > 28 * S ? 1 : 0);
      pc.set(X - 1, Y, 0xf06a5a); pc.set(X, Y, Y > 28 * S ? 0xb02a3a : 0xe04a4a); pc.set(X + 1, Y, 0x9a1e2e);
    }
    pc.set(19 * S - 2, 31 * S - 1, 0xb02a3a); pc.set(19 * S + 2, 31 * S, 0x8a1828); pc.set(19 * S + 2, 31 * S + 1, 0x8a1828);
  }
  glint(pc, 8, 7, 0);
}

function heartGlyph(pc) {
  const R = mat(0xd8343e, { cont: 1.15 });
  // a stuffed felt heart: two plump lobes either side of a pinched cleft, a running stitch all
  // round its edge, a lopsided patch sewn on with cross stitches, the left lobe catching the light
  const m = loop([[16, 8.6], [18.6, 5.2], [22.4, 3.6], [26.4, 4.6], [29, 8.4], [28.8, 13.4], [26, 18.6], [21.4, 23.4], [16.8, 28.6, 1], [11.2, 24.2], [5.6, 19.4], [2.4, 14], [2.6, 8.6], [5.4, 4.6], [9.6, 3.4], [13.4, 5]]);
  form(pc, m, R, { cx: 15, cy: 13, rx: 15, ry: 14, bias: 0.04 });
  // each lobe puffs out on its own: a lit crown on the left lobe, a softer one on the right
  const lobeL = loop([[5, 9], [7.6, 6], [11, 5.6], [13.2, 7.4], [12, 10.6], [8.4, 12], [5.6, 11.6]]);
  lobeL.and(m).eachD((X, Y, x, y) => step(pc, R, X, Y, -1, 1, 5));
  const lobeR = loop([[19, 7.6], [21.6, 5.6], [25, 5.6], [26.6, 8], [25, 10.4], [21.4, 10.6]]);
  lobeR.and(m).eachD((X, Y, x, y) => { if (hash2(X, Y, 2) < 0.8) step(pc, R, X, Y, -1, 2, 5); });
  // the cleft pinched in, a fold running down from it
  for (const [x, y, d] of [[16, 9, 2], [16, 10, 2], [16, 11, 1], [15, 12, 1], [15, 13, 1]]) step(pc, R, x, y, d, 1, 5);
  if (S === 1) { pc.set(17, 10, R[2]); pc.set(16, 12, R[2]); } else line(pc, 17.2, 9.6, 16.2, 12.4, R[2]);
  // felt texture: a sparse dither of the neighbouring tone
  m.clone().erode(1).eachD((X, Y, x, y) => { if ((X * 3 + Y * 5) % 11 === 0 && hash2(X, Y, 9) < 0.7) step(pc, R, X, Y, 1, 1, 5); });
  // the patch, sewn on crooked
  const PT = mat(0xf07a8a, { cont: 1.1 });
  const patch = loop([[17.4, 14.6, 1], [23.6, 13.2, 1], [24.6, 18.8, 1], [18.6, 20.4, 1]]);
  seam(pc, patch, 'shadow');
  patch.eachD((X, Y, x, y) => pc.set(X, Y, PT[isTop(patch, X, Y) ? 1 : isBot(patch, X, Y) ? 4 : ((X >> (S - 1)) + (Y >> (S - 1))) % 2 ? 2 : 3]));
  // the running stitch, inset from the edge, and the patch's cross stitches
  const TH = 0xf6e6c8;
  const stitchRing = m.clone().erode(S === 1 ? 2 : 4).sub(m.clone().erode(S === 1 ? 3 : 5));
  // dashes measured along the seam (arc length round each lobe, then round the point): two on, one off
  stitchRing.eachD((X, Y, x, y) => {
    const [cx, cy] = y < 12 ? (x < 16 ? [9, 10] : [23, 9.4]) : [15.6, 12];
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, arc = Math.atan2(dy, dx) * Math.hypot(dx, dy);
    if (((Math.floor(arc / 1.1) % 3) + 3) % 3 !== 2 && !patch.get(X, Y)) pc.set(X, Y, TH);
  });
  for (const [x, y] of [[18, 15], [22, 14], [23, 18], [19, 19]]) {
    if (S === 1) { pc.set(x, y, TH); pc.set(x + 1, y + 1, TH); pc.set(x + 1, y, 0xd8c0a0); pc.set(x, y + 1, 0xd8c0a0); continue; }
    // a cross stitch: the top thread lit, the under thread shaded, a pucker of shadow at its foot
    const X = nc(x), Y = nc(y);
    for (let i = 0; i < 4; i++) { pc.set(X + i, Y + i, TH); pc.set(X + 3 - i, Y + i, i === 1 || i === 2 ? TH : 0xd8c0a0); }
    pc.set(X + 4, Y + 4, PT[4]);
  }
  ink(pc);
  if (S === 1) { pc.set(8, 7, 0xffe8ec); pc.set(9, 7, R[0]); pc.set(8, 8, R[0]); pc.set(23, 6, R[1]); }
  else {
    // a soft satin shine on the left lobe, a smaller one on the right
    const X = nc(8), Y = nc(7);
    for (const [dx, dy, c] of [[0, 0, 0xffffff], [1, 0, 0xffe8ec], [0, 1, 0xffe8ec], [2, -1, R[0]], [-1, 2, R[0]], [3, -1, R[1]], [-1, 3, R[1]]]) pc.set(X + dx, Y + dy, c);
    pc.set(nc(23), nc(6), R[0]); pc.set(nc(23) + 1, nc(6), R[1]);
  }
}

// ---------------------------------------------------------------- dispatcher
export function drawGear(pc, spec, id, seed) {
  switch (spec.k) {
    case 'tool': {
      const t = spec.t;
      if (t === 'pick') TOOLS.pickaxe(pc, id || 'pick_iron', spec);
      else if (t === 'chisel') TOOLS.chisel(pc, id || (spec.c === 0x9fe0e6 ? 'chisel_fine' : 'chisel_basic'));
      else if (t === 'brush') TOOLS.brush(pc, id);
      else if (t === 'drill') TOOLS.drill(pc, id || (spec.c === 0x7bf08a ? 'drill_lumite' : 'drill_steam'));
      else if (t === 'xray') TOOLS.xrayLamp(pc, id || (spec.c === 0xe0a8ff ? 'xray_prism' : 'xray_lamp'));
      else if (t === 'beam') TOOLS.beamIcon(pc);
      else if (t === 'stake') TOOLS.stakeIcon(pc);
      else if (t === 'dynamite') drawExplosiveIcon(pc, spec);
      else return false;
      return true;
    }
    case 'equip': {
      const t = spec.t;
      if (t === 'helmet') WEAR.helmet(pc, id || 'helmet_basic', spec);
      else if (t === 'gloves') WEAR.gloves(pc, id || 'rubber_gloves', spec);
      else if (t === 'suit') WEAR.suit(pc, id || 'heat_suit', spec);
      else if (t === 'boots') WEAR.boots(pc, id || 'grip_boots');
      else if (t === 'bag') WEAR.bag(pc, id || 'bag_medium');
      else return false;
      return true;
    }
    case 'coin': coin(pc); return true;
    case 'bolt': boltGlyph(pc); return true;
    case 'book': bookGlyph(pc); return true;
    case 'heart': heartGlyph(pc); return true;
    default: return false;
  }
}

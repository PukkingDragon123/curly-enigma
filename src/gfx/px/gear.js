// 32×32 icons: the dispatcher for tools (picks per tier, chisels, brushes, drills, x-ray lamps,
// supplies: gearTools.js), equipment (helmets, gloves, suits, boots, bags: gearWear.js), forged
// weapons (gearWeapons.js) and the UI glyphs (coin, bolt, book, heart) drawn here.
import { mat } from './color.js';
import { vol, vnoise } from './shade.js';
import { M, ring } from './parts.js';
import { loop, form, sheen, marks, seam, step, ink, glint, line } from './lifeKit.js';
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
    m.each((x, y) => {
      const u = ((x + 0.5 - x0) * ax + (y + 0.5 - y0) * ay) / L;
      const v = (-(x + 0.5 - x0) * ay + (y + 0.5 - y0) * ax) / L;
      const k = R.indexOf(pc.getHex(x, y));
      if (k > 1 && k < 5 && vnoise(u * 0.25, v * 1.6, o.seed || 3) > 0.68) pc.set(x, y, R[k + 1]);
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
  const R = mat(0xf0bc34, { cont: 1.22, warm: 55 });
  // a hand-struck coin, a touch out of round and clipped flat on one side, seen slightly tilted
  const FACE = [[15.4, 2.6], [20.6, 3.6], [24.8, 6.6], [27.4, 11], [27.8, 15.8], [26.4, 20.6], [23, 24.6], [18.6, 26.8], [13.4, 27], [9.2, 25.2, 1], [5.8, 21.6, 1], [3.6, 16.4], [3.8, 11.2], [6.4, 6.8], [10.4, 3.8]];
  const face = loop(FACE);
  const edge = loop(FACE.map(([x, y, c]) => [x + 1.2, y + 2.4, c])).sub(face);
  edge.each((x, y) => pc.set(x, y, R[(x % 2) ? 4 : 5]));
  form(pc, face, R, { flatten: 0.55, dome: 0.5, round: 3, bias: 0.06 });
  // raised rim: the field inside is sunk, shadowed on its top-left, lit on its bottom-right
  const field = face.clone().erode(2);
  field.each((x, y) => pc.set(x, y, R[3]));
  field.edge().each((x, y) => { const tl = !field.get(x - 1, y) || !field.get(x, y - 1); pc.set(x, y, R[tl ? 4 : 2]); });
  // embossed mole paw: a pad and four toe beans, each lit top-left / shaded bottom-right
  const parts = [loop([[11.6, 17.4], [14.6, 14.6], [18.4, 14.8], [20.6, 17.8], [19.4, 21], [15.6, 21.8], [12.4, 20.6]]),
    loop([[9.4, 13.2], [10.6, 11.2], [12.4, 12], [11.8, 14.4]]), loop([[13, 10.4], [14.6, 8.6], [16.4, 9.6], [15.4, 12]]),
    loop([[17.4, 9.8], [19.4, 8.8], [20.4, 10.8], [18.6, 12.2]]), loop([[20.8, 12.6], [22.6, 11.8], [23.4, 13.8], [21.6, 15]])];
  for (const m of parts) m.each((x, y) => { const t = !m.get(x - 1, y) || !m.get(x, y - 1), b2 = !m.get(x + 1, y) || !m.get(x, y + 1); pc.set(x, y, R[t && !b2 ? 1 : b2 && !t ? 4 : 2]); });
  // wear: a nick in the rim and a couple of scratches
  pc.set(24, 21, R[5]); pc.set(25, 20, R[4]);
  line(pc, 8, 19, 10, 22, (i) => (i % 2 ? null : R[4]));
  ink(pc);
  glint(pc, 9, 7, 1, R[0]);
  pc.set(7, 10, R[0]); pc.set(23, 6, R[1]);
}

function boltGlyph(pc) {
  const R = mat(0xffcc2a, { cont: 1.18, warm: 55 });
  // a jagged, slightly crooked lightning bolt with a split prong and a lit facet
  const m = loop([[19.6, 1, 1], [24.6, 1.4, 1], [19.4, 10.4, 1], [26.4, 10.8, 1], [12.6, 30.6, 1], [15.6, 18.6, 1], [12.4, 20.4, 1], [14.2, 17.4, 1], [7.2, 17.6, 1]]);
  m.each((x, y) => { const lit = (x - 16) * 0.55 + (y - 15) * -0.25 < 0; pc.set(x, y, R[lit ? 2 : 3]); });
  m.each((x, y) => { const t = !m.get(x - 1, y) || !m.get(x, y - 1), b2 = !m.get(x + 1, y) || !m.get(x, y + 1); if (t && !b2) pc.set(x, y, R[1]); else if (b2 && !t) pc.set(x, y, R[4]); });
  line(pc, 21, 3, 11, 16, (i, X, Y) => (m.get(X, Y) && !(!m.get(X - 1, Y) || !m.get(X, Y - 1)) ? R[0] : null));
  line(pc, 22, 11, 15, 25, (i, X, Y) => (m.get(X, Y) && i % 3 !== 2 ? R[1] : null));
  ink(pc);
  glint(pc, 22, 3, 1);
  for (const [x, y] of [[27, 8], [6, 21], [10, 27]]) pc.set(x, y, 0xfff4b0);
}

function bookGlyph(pc) {
  const R = mat(0x9a3a2a, { cont: 1.12 });
  const GD = mat(0xe8b440, { cont: 1.2, warm: 54 });
  const PG = mat(0xf2e6c8, { cont: 1.05 });
  // a fat old tome in 3/4: page block on the side, worn leather cover, raised spine bands
  const pages = loop([[8, 6.6], [27, 4, 1], [28.4, 24.6], [9, 28.4]]);
  pages.each((x, y) => pc.set(x, y, PG[(y + (x > 25 ? 1 : 0)) % 2 ? 2 : 3]));
  const cover = loop([[3.6, 6.4], [6, 4.6], [22.4, 2.4], [24.6, 3.6], [25.6, 23.6], [24, 25.6], [6.6, 28.6], [4.6, 27]]);
  seam(pc, cover, 'shadow');
  form(pc, cover, R, { flatten: 0.5, dome: 0.5, round: 3, bias: 0.06 });
  marks(pc, cover, R, { dens: 0.05, seed: 4, len: 2, dir: [1, -0.2] });
  // spine bands
  for (const y of [8, 15, 22]) { pc.set(4, y, R[1]); pc.set(5, y, R[2]); pc.set(4, y + 1, R[5]); pc.set(5, y + 1, R[4]); }
  // gilt frame, a gem in the middle, metal corner caps and a clasp
  const frame = loop([[8.4, 8.6], [20.6, 6.8], [21.4, 22.4], [9.4, 24.4]], { seg: 2 });
  frame.edge().each((x, y) => pc.set(x, y, GD[(x + y) % 3 === 0 ? 1 : 3]));
  const gem = loop([[15, 11.2, 1], [18.4, 14.4, 1], [15.2, 18.6, 1], [12, 14.8, 1]]);
  gem.each((x, y) => pc.set(x, y, x + y < 29 ? 0x8ae0ff : x < 16 ? 0x4aa8e0 : 0x2a6ab0));
  pc.set(14, 13, 0xe8fbff);
  for (const [x, y] of [[4, 5], [22, 3], [24, 24], [5, 27]]) { pc.set(x, y, GD[1]); pc.set(x + 1, y, GD[2]); pc.set(x, y + 1, GD[3]); }
  const cl = loop([[24, 12, 1], [28, 11.6, 1], [28.2, 15.4, 1], [24.2, 15.8, 1]]);
  cl.each((x, y) => pc.set(x, y, GD[x === 24 ? 1 : 3]));
  ink(pc);
  for (let y = 26; y < 31; y++) pc.set(19, y, y > 28 ? 0xb02a3a : 0xe04a4a);
  pc.set(18, 30, 0xb02a3a); pc.set(20, 31, 0xb02a3a);
  glint(pc, 8, 7, 0);
}

function heartGlyph(pc) {
  const R = mat(0xe0303e, { cont: 1.18 });
  // a plump, hand-drawn heart: the left lobe a bit fuller, the tip leaning, a soft cleft
  const m = loop([[16, 8.6], [18.6, 5.2], [22.4, 3.6], [26.4, 4.6], [29, 8.4], [28.8, 13.4], [26, 18.6], [21.4, 23.4], [16.8, 28.6, 1], [11.2, 24.2], [5.6, 19.4], [2.4, 14], [2.6, 8.6], [5.4, 4.6], [9.6, 3.4], [13.4, 5]]);
  form(pc, m, R, { cx: 15, cy: 13, rx: 15, ry: 14, bias: 0.06 });
  // the cleft: a short shaded crease running down from the dip
  for (const [x, y] of [[16, 9], [16, 10], [15, 11]]) step(pc, R, x, y, 1, 1, 5);
  sheen(pc, m, R[1], { inset: 1, a0: -2.9, a1: -1.7 });
  ink(pc);
  glint(pc, 8, 7, 1, R[0]);
  pc.set(6, 10, R[0]); pc.set(22, 7, R[1]); pc.set(23, 7, R[1]);
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

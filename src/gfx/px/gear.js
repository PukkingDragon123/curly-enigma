// 32×32 icons: the dispatcher for tools (picks per tier, chisels, brushes, drills, x-ray lamps,
// supplies: gearTools.js), equipment (helmets, gloves, suits, boots, bags: gearWear.js), forged
// weapons (gearWeapons.js) and the UI glyphs (coin, bolt, book, heart) drawn here.
import { mat } from './color.js';
import { vol, fill, sparkle, vnoise } from './shade.js';
import { M, ring, lineIn } from './parts.js';
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
function coin(pc) {
  const R = mat(0xf2c030, { cont: 1.2, warm: 55 });
  // coin seen slightly from below: thickness band at the bottom
  const edge = M().ellipse(16, 17.5, 12.5, 12.5);
  ring(pc, edge, R);
  fill(pc, edge, R[5]);
  for (let x = 4; x < 29; x++) for (let y = 17; y < 31; y++) if (edge.get(x, y) && (x % 2 === 0)) pc.set(x, y, R[4]);
  const face = M().ellipse(16, 15.5, 12.5, 12.5);
  vol(pc, face, R, { round: 2.5, spec: 0.85 });
  // raised rim and embossed mole paw
  const inner = M().ellipse(16, 15.5, 9.5, 9.5);
  inner.edge().each((x, y) => pc.set(x, y, (x + y) < 31 ? R[4] : R[1]));
  const paw = M().ellipse(16, 17.5, 4, 3.4);
  for (const [x, y] of [[11.5, 12.5], [14.5, 10.5], [17.5, 10.5], [20.5, 12.5]]) paw.disk(x, y, 1.4);
  paw.each((x, y) => pc.set(x, y, R[2]));
  paw.edge().each((x, y) => { if (!paw.get(x + 1, y + 1)) pc.set(x, y, R[4]); else if (!paw.get(x - 1, y - 1)) pc.set(x, y, R[1]); });
  sparkle(pc, 9, 8, 2, 0xffffff, R[0]);
}

function boltGlyph(pc) {
  const R = mat(0xffd02a, { cont: 1.15, warm: 55 });
  const m = M().poly([[19, 1], [7, 17], [15, 17], [11, 31], [26, 12], [17.5, 12], [23, 1]]);
  ring(pc, m, R);
  m.each((x, y) => {
    const left = (x - 16) * 0.5 + (y - 16) * -0.3 < 0;
    pc.set(x, y, R[left ? 2 : 3]);
  });
  m.edge().each((x, y) => { if (!m.get(x - 1, y) || !m.get(x, y - 1)) pc.set(x, y, R[1]); else pc.set(x, y, R[4]); });
  lineIn(pc, 19, 4, 11, 15, R[0], m);
  sparkle(pc, 22, 4, 1, 0xffffff, R[0]);
}

function bookGlyph(pc) {
  const R = mat(0x9a3a2a, { cont: 1.1 });
  const GD = mat(0xe8b440, { cont: 1.2 });
  // pages block (side) and cover in 3/4 view
  const pages = M().poly([[7, 7], [27, 4], [28, 25], [8, 28]]);
  const PG = mat(0xf2e6c8, { cont: 0.9 });
  ring(pc, pages, PG);
  fill(pc, pages, PG[2]);
  for (let y = 6; y < 28; y += 2) for (let x = 24; x < 29; x++) if (pages.get(x, y)) pc.set(x, y, PG[4]);
  const cover = M().poly([[4, 6], [24, 3], [25, 25], [5, 28]]);
  ring(pc, cover, R);
  vol(pc, cover, R, { round: 2.5 });
  // spine
  for (let y = 4; y < 29; y++) for (const x of [4, 5]) if (cover.get(x, y)) pc.set(x, y, x === 4 ? R[4] : R[2]);
  // gold frame + emblem (a little pick over a gem)
  const frame = M().poly([[8, 8], [21, 6], [21.8, 23], [9, 25]]);
  frame.edge().each((x, y) => pc.set(x, y, GD[(x + y) % 3 === 0 ? 1 : 2]));
  const gem = M().poly([[15, 11], [18, 14], [15, 18], [12, 14]]);
  fill(pc, gem, 0x6ad0ff); pc.set(14, 13, 0xe0f8ff); pc.set(15, 16, 0x2a7ab0);
  for (const [x, y] of [[4, 6], [23, 3], [24, 24], [5, 27]]) { pc.set(x, y, GD[1]); }
  // ribbon bookmark
  for (let y = 25; y < 31; y++) pc.set(19, y, y > 28 ? 0xc02a3a : 0xe04a4a);
  pc.set(18, 30, 0xc02a3a); pc.set(20, 30, 0xc02a3a);
}

function heartGlyph(pc) {
  const R = mat(0xe0303e, { cont: 1.15 });
  const m = M().disk(10.5, 11.5, 6.5).disk(21.5, 11.5, 6.5).poly([[4.3, 13.5], [27.7, 13.5], [16, 28]]);
  ring(pc, m, R);
  vol(pc, m, R, { round: 6, spec: 0.8, bounce: true });
  sparkle(pc, 9, 9, 1, 0xffffff, R[0]);
  pc.set(8, 11, R[0]); pc.set(8, 12, R[1]);
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

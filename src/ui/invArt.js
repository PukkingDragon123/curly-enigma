// Pixel art for the inventory: the backpack's own sprites (sewn-shut pockets, the trunk's slots,
// the toss pit, the tidy brush, the spring scale).
import { Px, PAL, art, mixHex } from './uiArt.js';

// ---------------------------------------------------------------- backpack sprites
const C = PAL.canvas, W = PAL.wood, B = PAL.brass;

/** A pocket sewn shut (locked until a bigger bag): darker canvas, the flap stitched down with a
 * zigzag of heavy thread and a cross-stitch in the middle. 9-slice 5. */
function sewnPocket() {
  const p = new Px(18, 18);
  const base = mixHex(C.dk, C.dd, 0.45), dd = mixHex(C.dd, 0x3a2410, 0.4);
  p.rr(1, 1, 16, 16, 2, base);
  for (let y = 2; y < 16; y++) for (let x = 2; x < 16; x++) if ((x * 3 + y * 5) % 7 === 0) p.set(x, y, mixHex(base, dd, 0.5));
  // the flap folded over the opening
  p.rr(2, 2, 14, 7, 2, mixHex(C.base, C.dk, 0.35));
  p.hl(3, 14, 2, C.hi);
  p.hl(3, 14, 8, dd);
  // zigzag stitches along the flap's edge
  const TH = 0x7a3a1e, TL = 0xc8784a;
  for (let x = 3; x <= 14; x++) p.set(x, (x & 1) ? 7 : 9, (x & 1) ? TL : TH);
  // a cross-stitch in the middle
  for (let k = 0; k < 4; k++) { p.set(7 + k, 10 + k, TH); p.set(10 - k, 10 + k, TL); }
  p.vl(16, 4, 15, dd);
  p.hl(2, 15, 16, dd);
  p.outline(C.dd);
  return p;
}

/** A slot in the trunk at home: dark oak with brass corners. 9-slice 4. */
function trunkSlot(on = false) {
  const p = new Px(14, 14);
  p.rect(1, 1, 12, 12, on ? 0x6a4428 : 0x3e2614);
  p.rect(3, 3, 8, 8, on ? 0x4a2e18 : 0x2a180c);
  p.hl(1, 12, 1, on ? 0x8a5a32 : 0x52321a);
  for (const [x, y] of [[1, 1], [11, 1], [1, 11], [11, 11]]) { p.rect(x, y, 2, 2, B.base); p.set(x, y, B.hi); }
  p.outline(0x1a0e06);
  return p;
}

/** The toss pit: a hole dug in the dirt, crumbs round the rim. */
function tossPit(open = false) {
  const p = new Px(24, 18);
  const D = [0x8a6a4a, 0x6e523a, 0x54402c, 0x3a2c20];
  p.ellipse(12, 10, 11, 6.5, D[1]);
  p.ellipse(12, 9.4, 10, 5.5, D[0]);
  p.ellipse(12, 10.5, 8, 4.4, D[2]);
  p.ellipse(12, 11, open ? 7.4 : 6.6, open ? 4.2 : 3.6, 0x120c08);
  p.ellipse(12, 10.2, 6.2, 2, D[3]);
  for (const [x, y] of [[2, 6], [4, 4], [19, 4], [22, 7], [3, 13], [21, 14], [9, 3], [15, 2]]) { p.set(x, y, D[1]); p.set(x + 1, y, D[2]); }
  if (open) for (const [x, y] of [[8, 6], [16, 5], [12, 4]]) p.set(x, y, 0xffe8a0);
  p.outline(0x24150d);
  return p;
}

/** Tidy brush icon for the sort buttons. */
function brushIcon() {
  const p = new Px(12, 12);
  p.line(1, 10, 6, 5, W.dk); p.line(2, 10, 7, 5, W.base); p.line(1, 11, 6, 6, W.dd);
  p.rect(6, 3, 3, 3, B.base); p.set(6, 3, B.hi);
  for (let i = 0; i < 4; i++) { p.line(8 + i * 0.5, 2 + i, 11, 0 + i, i % 2 ? 0xe8d8b0 : 0xc8b088); }
  p.outline(0x24150d);
  return p;
}

// a brass spring scale with a hook (the backpack's load readout)
function weightIcon() {
  const p = new Px(12, 12);
  const BR = [0x5a3a12, 0x9a6a22, 0xd8a43a, 0xf6d47a];
  p.rect(5, 0, 2, 2, BR[1]); p.set(5, 0, BR[2]); // the ring
  p.rect(3, 2, 6, 6, BR[1]); p.rect(4, 3, 4, 4, 0xf2e6c8); p.set(3, 2, BR[2]); p.set(4, 2, BR[3]);
  p.line(4, 6, 7, 3, 0xc23c2c); p.set(5, 5, 0x3a2a1a); // the needle
  p.rect(5, 8, 2, 2, 0x6a625c); // the hook
  p.set(6, 10, 0x8a827a); p.set(5, 11, 0x8a827a); p.set(4, 10, 0x8a827a);
  p.outline(0x24150d);
  return p;
}

const sprite = (key, fn) => art('inv:' + key, fn);
export const INV_ART = {
  sewn: () => sprite('sewn', sewnPocket),
  trunk: (on = false) => sprite('trunk' + (on ? 1 : 0), () => trunkSlot(on)),
  toss: (open = false) => sprite('toss' + (open ? 1 : 0), () => tossPit(open)),
  brush: () => sprite('brush', brushIcon),
  weight: () => sprite('weight', weightIcon),
};

/** Publish the frames as CSS custom properties (--inv-*) on an element. */
export function installInvArt(node) {
  node.style.setProperty('--inv-sewn', `url("${INV_ART.sewn()}")`);
  node.style.setProperty('--inv-trunk', `url("${INV_ART.trunk(false)}")`);
  node.style.setProperty('--inv-trunkOn', `url("${INV_ART.trunk(true)}")`);
}

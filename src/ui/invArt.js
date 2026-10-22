// Pixel art for the inventory: item icons for Nugget's food ({ k: 'hen', t }) drawn with the
// shared icon toolkit (gfx/px), and the backpack's own sprites (sewn-shut pockets, the coop's
// straw cubbies, the trunk's slots, the toss pit, the feed bowl, Nugget peeking from her window).
import { Px, PAL, art, mixHex } from './uiArt.js';
import { mat, mix } from '../gfx/px/color.js';
import { vol, fill, sparkle, hash2 } from '../gfx/px/shade.js';
import { M, ring, lineIn } from '../gfx/px/parts.js';

// ---------------------------------------------------------------- item icons (32×32)
function feedSack(pc) {
  // a little burlap sack of cracked corn, tied at the neck, a hen stamped on the front
  const R = mat(0xc8a46a, { cont: 1.05 });
  const body = M().poly([[8, 13], [24, 13], [27, 22], [25, 29], [7, 29], [5, 22]]).ellipse(16, 25, 11, 5);
  ring(pc, body, R);
  vol(pc, body, R, { round: 5, tex: (x, y) => ((x + y) % 3 === 0 ? -0.08 : (x * 2 + y) % 5 === 0 ? 0.05 : 0) });
  // the neck gathered with twine, grain heaped in the open top
  const neck = M().poly([[11, 9], [21, 9], [23, 14], [9, 14]]);
  ring(pc, neck, R); vol(pc, neck, R, { round: 2 });
  const TW = mat(0x9a3a2a);
  for (let x = 9; x <= 23; x++) { pc.set(x, 13, TW[2]); pc.set(x, 14, TW[4]); }
  pc.set(24, 14, TW[3]); pc.set(25, 15, TW[3]); pc.set(25, 16, TW[4]);
  const G = mat(0xf2c23a, { cont: 1.1 });
  const heap = M().ellipse(16, 8.5, 6, 3);
  ring(pc, heap, G); vol(pc, heap, G, { round: 2 });
  for (let i = 0; i < 14; i++) { const x = 11 + (hash2(i, 1, 7) * 11 | 0), y = 6 + (hash2(i, 2, 7) * 5 | 0); if (heap.get(x, y)) pc.set(x, y, hash2(i, 3, 7) < 0.5 ? G[1] : G[4]); }
  // the stamp: a little hen in red ink
  const INK = 0xa83a2a;
  const hen = [' ..r. ', ' .rrr.', 'rrrrr.', '.rrrrr', '..rrr.', '..r.r.'];
  hen.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === 'r') pc.set(13 + x, 18 + y, INK); });
  pc.set(17, 18, 0xe0302a);
  // spilled kernels
  for (const [x, y] of [[4, 29], [6, 30], [27, 30], [28, 28]]) { pc.set(x, y, G[2]); pc.set(x + 1, y, G[4]); }
}

function seedTwist(pc) {
  // a paper twist of seeds, open at the top, a few spilling out
  const P = mat(0xece0c4, { cont: 0.95 });
  const cone = M().poly([[7, 10], [25, 10], [17, 29], [15, 29]]);
  ring(pc, cone, P); vol(pc, cone, P, { round: 3 });
  for (let y = 12; y < 27; y += 3) for (let x = 8; x < 25; x++) if (cone.get(x, y) && (x + y) % 4 === 0) pc.set(x, y, P[4]);
  const S = mat(0x8a6a3a, { cont: 1.1 }), S2 = mat(0x5a4a2a), S3 = mat(0xd8b860);
  const top = M().ellipse(16, 10, 9, 3.2);
  ring(pc, top, S); fill(pc, top, S[4]);
  for (let i = 0; i < 26; i++) {
    const x = 8 + (hash2(i, 4, 9) * 17 | 0), y = 7 + (hash2(i, 5, 9) * 6 | 0);
    if (!top.get(x, y) && !(y < 10 && Math.abs(x - 16) < 7)) continue;
    const c = [S, S2, S3][i % 3];
    pc.set(x, y, c[2]); pc.set(x + 1, y, c[4]);
  }
  for (const [x, y, k] of [[5, 24, 0], [26, 26, 1], [24, 29, 2], [7, 28, 1]]) { const c = [S, S2, S3][k]; pc.set(x, y, c[2]); pc.set(x + 1, y, c[4]); }
  // a red string round the twist
  for (let x = 13; x <= 19; x++) pc.set(x, 21, x % 2 ? 0xc23c2c : 0x8a2418);
}

function fatGrub(pc) {
  // a plump cream grub curled into a C, segment rings, a little brown head
  const R = mat(0xf0e2c0, { cont: 1.05 });
  const m = M();
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = -0.5 + (i / 24) * Math.PI * 1.45;
    pts.push([16 + Math.cos(a) * 8, 17 + Math.sin(a) * 7.5]);
  }
  pts.forEach(([x, y], i) => m.disk(x, y, 4.6 - Math.abs(i - 12) * 0.12));
  ring(pc, m, R);
  vol(pc, m, R, { round: 4, spec: 0.88 });
  for (let i = 2; i < 22; i += 3) {
    const [x, y] = pts[i];
    const nx = x - 16, ny = y - 17, l = Math.hypot(nx, ny) || 1;
    for (let k = -3; k <= 3; k++) {
      const px = Math.round(x + (nx / l) * k), py = Math.round(y + (ny / l) * k);
      if (m.get(px, py)) pc.set(px, py, R[4]);
    }
  }
  const [hx, hy] = pts[0];
  const head = M().disk(hx + 1, hy - 1, 3.2);
  const H = mat(0xa86a3a, { cont: 1.1 });
  ring(pc, head, H); vol(pc, head, H, { round: 2 });
  pc.set(hx + 2, hy - 2, 0x1a1020);
  sparkle(pc, 12, 10, 1, 0xffffff, R[1]);
}

/** Icon drawer for { k: 'hen', t: 'feed' | 'seeds' | 'grub' } (hooked into gfx/PixelArt.js). */
export function drawHenIcon(pc, spec) {
  if (!spec || spec.k !== 'hen') return false;
  if (spec.t === 'feed') feedSack(pc);
  else if (spec.t === 'seeds') seedTwist(pc);
  else if (spec.t === 'grub') fatGrub(pc);
  else return false;
  return true;
}

// ---------------------------------------------------------------- backpack sprites
const L = PAL.leather, C = PAL.canvas, W = PAL.wood, B = PAL.brass;

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

/** The coop's cubby: rough planks, straw on the floor. 9-slice 5. */
function cubby(on = false) {
  const p = new Px(18, 18);
  const wood = on ? mixHex(W.lt, 0xffe0a0, 0.25) : W.dk;
  p.rect(1, 1, 16, 16, wood);
  p.rect(3, 3, 12, 11, on ? 0x5a3a20 : 0x3a2414);
  // plank seams on the back wall
  for (let y = 3; y < 14; y++) { p.set(7, y, 0x2a180c); p.set(11, y, 0x2a180c); }
  // straw along the bottom
  const S = [0xe8c860, 0xd0a840, 0xb88a30, 0xf6dc80];
  for (let x = 3; x < 15; x++) { p.set(x, 13, S[(x * 7) % 4]); if (x % 3) p.set(x, 12, S[(x * 5 + 1) % 4]); }
  p.set(4, 11, S[3]); p.set(9, 11, S[0]); p.set(13, 11, S[1]);
  // frame highlights
  p.hl(1, 16, 1, on ? W.hi : W.base); p.vl(1, 1, 16, on ? W.hi : W.base);
  p.hl(1, 16, 16, W.dd); p.vl(16, 1, 16, W.dd);
  p.hl(2, 15, 14, on ? W.base : W.dk); p.hl(2, 15, 15, W.dd);
  // nails
  for (const [x, y] of [[2, 2], [15, 2], [2, 15], [15, 15]]) p.set(x, y, 0x8a8278);
  p.outline(W.ol);
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

/** Nugget's feed bowl, fill 0..4. */
function bowl(fill = 0) {
  const p = new Px(26, 16);
  const G = [0xfff0a0, 0xf2c23a, 0xd9901e, 0x9a5c10];
  if (fill > 0) {
    const h = [0, 1.6, 2.6, 3.6, 4.6][fill];
    p.ellipse(13, 7.5 - h * 0.4, 9.5, 1.6 + h * 0.7, G[1]);
    for (let i = 0; i < 18 + fill * 6; i++) {
      const x = 5 + Math.floor(hash2(i, 1, 3) * 17), y = Math.floor(7.6 - h * 0.4 + (hash2(i, 2, 3) - 0.5) * (1.6 + h));
      if (p.a(x, y)) p.set(x, y, hash2(i, 3, 3) < 0.4 ? G[0] : hash2(i, 4, 3) < 0.5 ? G[2] : G[3]);
    }
  }
  // the clay bowl
  for (let y = 7; y < 15; y++) for (let x = 1; x < 25; x++) {
    const dx = (x + 0.5 - 13) / 12, dy = (y + 0.5 - 7.5) / 7;
    if (dx * dx + dy * dy > 1 || y < 8) continue;
    p.set(x, y, x < 8 ? 0xd88a5a : x > 19 ? 0x8a4428 : 0xb0583a);
  }
  p.ellipse(13, 7.6, 12, 2, 0xc86a48);
  p.ellipse(13, 7.6, 10.4, 1.2, fill ? G[2] : 0x5a2a18);
  if (fill) p.ellipse(13, 7.2, 9, 1, G[1]);
  for (let x = 4; x < 23; x += 4) p.set(x, 11, 0xe8b080);
  p.outline(0x3a1a10);
  return p;
}

/**
 * Nugget peeking out of her round window (the coop panel's portrait). mood: 'happy' | 'ok' |
 * 'hungry' | 'away' (empty window).
 */
function henWindow(mood = 'ok') {
  const p = new Px(30, 30);
  const F = [0xfffaf0, 0xf2e8d6, 0xd8ccb4, 0xb8a890];
  // the log wall behind
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
    const o = y % 6;
    p.set(x, y, [0x6a4022, 0x86562e, 0x86562e, 0xa06c3c, 0xb8834c, 0x3a2010][o]);
  }
  // the dark round hole and the carved frame
  p.disk(15, 15, 12.5, 0x7a4a26);
  for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2; p.set(Math.round(15 + Math.cos(t) * 11.5 - 0.5), Math.round(15 + Math.sin(t) * 11.5 - 0.5), a % 2 ? 0x9a6234 : 0x5a3418); }
  p.disk(15, 15, 10.2, 0x1e140c);
  if (mood !== 'away') {
    const sad = mood === 'hungry';
    const hy = sad ? 18 : 15;
    // head
    p.disk(15, hy + 2, 7.5, F[1]);
    p.disk(14, hy + 1, 6, F[0]);
    p.ellipse(15, hy + 8.5, 8, 3, F[2]);
    // comb
    for (const [x, y, r] of [[12, hy - 5, 1.8], [15, hy - 6, 2.2], [18, hy - 5, 1.8]]) p.disk(x, y, r, 0xe0302a);
    p.set(14, hy - 7, 0xff6a5a);
    // beak and wattle
    p.rect(13, hy + 2, 5, 2, 0xf0b030); p.rect(14, hy + 4, 3, 1, 0xc88a20); p.set(17, hy + 2, 0xffd060);
    p.ellipse(15.5, hy + 6.5, 1.2, 1.6, 0xd02a2a);
    // eyes: round and bright, or half-shut and sulky
    for (const ex of [11, 19]) {
      if (sad) { p.hl(ex - 1, ex + 1, hy, 0x1a1020); p.set(ex - 1, hy - 1, 0x5a4a3a); }
      else { p.rect(ex - 1, hy - 1, 2, 3, 0x1a1020); p.set(ex - 1, hy - 1, 0xffffff); }
    }
    if (mood === 'happy') { p.set(9, hy + 2, 0xf08a8a); p.set(21, hy + 2, 0xf08a8a); p.set(10, hy + 3, 0xf08a8a); p.set(20, hy + 3, 0xf08a8a); }
    if (sad) { p.set(23, hy - 4, 0x7fc0f0); p.set(23, hy - 3, 0x3f7ec8); }
  }
  // clip to a soft round badge
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) if (Math.hypot(x + 0.5 - 15, y + 0.5 - 15) > 14.5) p.clear(x, y);
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
  cubby: (on = false) => sprite('cubby' + (on ? 1 : 0), () => cubby(on)),
  trunk: (on = false) => sprite('trunk' + (on ? 1 : 0), () => trunkSlot(on)),
  toss: (open = false) => sprite('toss' + (open ? 1 : 0), () => tossPit(open)),
  bowl: (f = 0) => sprite('bowl' + f, () => bowl(Math.max(0, Math.min(4, f | 0)))),
  hen: (mood = 'ok') => sprite('hen:' + mood, () => henWindow(mood)),
  brush: () => sprite('brush', brushIcon),
  weight: () => sprite('weight', weightIcon),
};

/** Publish the frames as CSS custom properties (--inv-*) on an element. */
export function installInvArt(node) {
  node.style.setProperty('--inv-sewn', `url("${INV_ART.sewn()}")`);
  node.style.setProperty('--inv-cubby', `url("${INV_ART.cubby(false)}")`);
  node.style.setProperty('--inv-cubbyOn', `url("${INV_ART.cubby(true)}")`);
  node.style.setProperty('--inv-trunk', `url("${INV_ART.trunk(false)}")`);
  node.style.setProperty('--inv-trunkOn', `url("${INV_ART.trunk(true)}")`);
}
void mix; void lineIn; void L;

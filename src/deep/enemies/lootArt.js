// 32×32 item icons for creature loot ({ k: 'loot', t, c }): hides, tusks, fangs, claws, teeth,
// scales, plates, feathers, gel, ash, meat, eggs and kobold trinkets. Drawn with the shared icon
// toolkit (gfx/px) so they sit with the other drops. Hooked into gfx/PixelArt.js drawIconArt.
import { mat, mix } from '../../gfx/px/color.js';
import { vol, sparkle, hash2 } from '../../gfx/px/shade.js';
import { M, ring, lineIn } from '../../gfx/px/parts.js';

const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };

function hide(pc, c) {
  const R = mat(c, { cont: 1 });
  // a stretched pelt: four leg flaps, a ragged edge, stitches round the rim
  const m = M().ellipse(16, 16, 10, 11.5);
  for (const [x, y] of [[6, 7], [26, 7], [6, 25], [26, 25]]) m.capsule(16, 16, x, y, 3.2);
  m.fn((x, y) => m.get(x, y) && hash2(x, y, 7) > 0.08);
  ring(pc, m, R);
  vol(pc, m, R, { round: 5, tex: (x, y) => (hash2(x >> 1, y >> 1, 3) - 0.5) * 0.25 });
  const inner = M().ellipse(16, 16, 7.5, 9);
  inner.each((x, y) => { if (!inner.get(x + 1, y) || !inner.get(x, y + 1)) pc.set(x, y, R[(x + y) % 3 ? 4 : 1]); });
  for (const [x, y] of [[12, 12], [19, 14], [15, 20]]) pc.set(x, y, R[5]);
}
function tusk(pc) {
  const R = mat(0xe8dcc0, { cont: 1.05 });
  const m = M().path([[7, 28], [10, 20], [15, 12], [22, 7], [27, 5]], 3).path([[22, 7], [27, 5]], 1.6);
  ring(pc, m, R);
  vol(pc, m, R, { round: 3, spec: 0.82 });
  const base = M().ellipse(8.5, 26, 4, 3.5);
  ring(pc, base, mat(0x7a5a3a)); vol(pc, base, mat(0x7a5a3a), { round: 3 });
  for (let i = 0; i < 4; i++) pc.set(10 + i * 3, 21 - i * 3.2, R[4]);
}
function fang(pc, c) {
  const R = mat(0x2e1e18, { cont: 1.1 });
  const m = M().path([[9, 5], [13, 12], [17, 20], [21, 27]], 2.6).path([[17, 20], [21, 27]], 1.3);
  m.ellipse(9, 6, 4.5, 3.5);
  ring(pc, m, R);
  vol(pc, m, R, { round: 3, spec: 0.85 });
  for (let y = 18; y < 28; y++) pc.set(Math.round(17 + (y - 18) * 0.42), y, mix(0xd8c8b0, R[2], 0.3));
  // a bead of venom on the tip
  const v = M().disk(23.5, 28.5, 2);
  vol(pc, v, mat(c || 0x8ae05a), { round: 2, emit: 0.6 });
  gl(pc, 23, 28, 0xffffff, 1);
}
function claw(pc) {
  const R = mat(0xf0e4cc, { cont: 1.05 });
  const m = M().path([[8, 27], [9, 19], [13, 11], [20, 6], [27, 7]], 3.2).path([[20, 6], [27, 7]], 1.5);
  ring(pc, m, R);
  vol(pc, m, R, { round: 3.5, spec: 0.8 });
  const b = M().ellipse(9, 26, 4.5, 4);
  const BR = mat(0x6a3a22);
  ring(pc, b, BR); vol(pc, b, BR, { round: 3 });
  for (let i = 0; i < 6; i++) pc.set(11 + i * 2, 20 - i * 2.4, R[4]);
}
function tooth(pc) {
  const R = mat(0xf2ead8, { cont: 1 });
  const m = M().poly([[9, 5], [23, 5], [20, 18], [16, 29], [12, 18]]);
  ring(pc, m, R);
  vol(pc, m, R, { round: 4, spec: 0.84 });
  const root = M().poly([[8, 3], [24, 3], [23, 8], [9, 8]]);
  const RR = mat(0xb07a5a); ring(pc, root, RR); vol(pc, root, RR, { round: 2 });
  for (let y = 9; y < 26; y += 2) pc.set(Math.round(16 + (hash2(y, 1, 2) - 0.5) * 2), y, R[4]);
  // serrated edges
  for (let y = 9; y < 24; y += 3) { pc.set(Math.round(21 - (y - 5) * 0.28) + 1, y, R[5]); pc.set(Math.round(11 + (y - 5) * 0.28) - 1, y, R[5]); }
}
function scale(pc, c) {
  const R = mat(c, { cont: 1.15 });
  const m = M().poly([[16, 3], [27, 10], [25, 21], [16, 30], [7, 21], [5, 10]]);
  ring(pc, m, R);
  vol(pc, m, R, { round: 6, spec: 0.78 });
  for (let i = 0; i < 4; i++) { const y = 9 + i * 5; for (let x = 7; x < 26; x++) { const yy = y + Math.abs(x - 16) * 0.35; if (m.get(x, yy)) pc.set(x, yy, i % 2 ? R[4] : R[2]); } }
  for (let y = 6; y < 27; y++) pc.set(16, y, R[1]);
}
function plate(pc, c) {
  const R = mat(c, { cont: 1.05 });
  const m = M().poly([[16, 4], [27, 10], [27, 22], [16, 28], [5, 22], [5, 10]]);
  ring(pc, m, R);
  vol(pc, m, R, { round: 5, tex: (x, y) => (hash2(x, y, 9) - 0.5) * 0.2 });
  const k = M().disk(16, 15, 4.5);
  const KR = mat(0xe8dcc0); ring(pc, k, KR); vol(pc, k, KR, { round: 4, spec: 0.85 });
  for (const [x, y] of [[9, 12], [23, 12], [9, 20], [23, 20], [16, 24]]) { pc.set(x, y, R[5]); pc.set(x + 1, y, R[1]); }
}
function feather(pc, c) {
  const R = mat(c, { cont: 1.05 });
  const m = M().fn((x, y) => { const t = (x + y - 12) / 36; if (t < 0 || t > 1) return false; const d = Math.abs(x - y) / 1.4; return d < 6.5 * Math.sin(t * Math.PI) ** 0.7 && hash2(x, y, 4) > 0.04; });
  ring(pc, m, R);
  vol(pc, m, R, { round: 4 });
  m.each((x, y) => { if ((x * 2 + y) % 5 === 0) pc.set(x, y, R[4]); });
  lineIn(pc, 5, 27, 26, 6, 0xf4ecd8); lineIn(pc, 3, 29, 6, 26, 0xc8b8a0);
}
function gel(pc, c) {
  const R = mat(c, { cont: 1.1 });
  const m = M().fn((x, y) => { const dx = x + 0.5 - 16, dy = y + 0.5 - 18; const r = 10 + Math.sin(Math.atan2(dy, dx) * 3) * 1.2; return dy < 9 && dx * dx + dy * dy * 1.3 < r * r; });
  ring(pc, m, R);
  m.each((x, y) => pc.set(x, y, R[2], 215));
  vol(pc, M().ellipse(16, 19, 6, 5), R, { round: 4 });
  for (const [x, y] of [[11, 11], [12, 11], [11, 12]]) pc.set(x, y, 0xffffff);
  for (const [x, y] of [[19, 21], [14, 23]]) pc.set(x, y, R[0]);
}
function ash(pc, c) {
  // a little drawstring pouch, cold glowing ash spilling out
  const BR = mat(0x5a4a5a);
  const bag = M().ellipse(16, 20, 9, 8).rect(12, 9, 8, 6);
  ring(pc, bag, BR); vol(pc, bag, BR, { round: 5 });
  lineIn(pc, 11, 13, 21, 13, 0xc8b890);
  const pile = M().ellipse(16, 9, 6, 3);
  pile.each((x, y) => gl(pc, x, y, hash2(x, y, 2) > 0.5 ? c : mix(c, 0xffffff, 0.5), 0.8));
  for (const [x, y] of [[8, 5], [24, 4], [20, 2], [12, 3]]) sparkle(pc, x, y, 1, 0xffffff, c, 0.8);
}
function meat(pc) {
  const R = mat(0xc8463a, { cont: 1.05 });
  const m = M().ellipse(14, 17, 10, 8);
  ring(pc, m, R);
  vol(pc, m, R, { round: 5, tex: (x, y) => (Math.sin((x + y) * 0.9) > 0.7 ? 0.25 : 0) });
  m.each((x, y) => { if (!m.get(x - 2, y) || !m.get(x, y + 2)) pc.set(x, y, 0xf0d8c0); }); // the fat rim
  const bone = M().capsule(20, 12, 28, 6, 1.6).disk(28.5, 5, 2).disk(27, 3.5, 1.6);
  const BR = mat(0xf0e8d8); ring(pc, bone, BR); vol(pc, bone, BR, { round: 2 });
  for (const [x, y] of [[10, 15], [15, 19], [12, 21]]) pc.set(x, y, R[1]);
}
function egg(pc, c) {
  const R = mat(c || 0xe0caa0, { cont: 1.05 });
  const m = M().fn((x, y) => { const dx = (x + 0.5 - 16) / 9.5, dy = (y + 0.5 - 17.5) / 12; return dx * dx * (1 + dy * 0.35) + dy * dy <= 1; });
  ring(pc, m, R);
  vol(pc, m, R, { spec: 0.9, bounce: true });
  m.each((x, y) => { if (hash2(x, y, 6) > 0.9) pc.set(x, y, R[5]); });
  pc.set(12, 10, 0xffffff); pc.set(12, 11, R[0]);
}
function trinket(pc) {
  // a carved bone charm with a little red bead, on a string
  lineIn(pc, 6, 4, 16, 10, 0xc8a870); lineIn(pc, 26, 4, 16, 10, 0xc8a870);
  const m = M().poly([[16, 10], [24, 18], [16, 30], [8, 18]]);
  const R = mat(0xe8dcc0); ring(pc, m, R); vol(pc, m, R, { round: 4 });
  for (const [x, y] of [[16, 15], [13, 19], [19, 19], [16, 23]]) pc.set(x, y, R[5]);
  const b = M().disk(16, 19, 2); vol(pc, b, mat(0xd8402a), { round: 2 });
  pc.set(15, 18, 0xffd0c0);
}

const DRAW = { hide, tusk, fang, claw, tooth, scale, plate, feather, gel, ash, meat, egg, trinket };

/** Draws { k: 'loot', t, c } item icons; false for anything else. */
export function drawLootIcon(pc, spec) {
  if (!spec || spec.k !== 'loot') return false;
  const f = DRAW[spec.t];
  if (!f) return false;
  f(pc, spec.c);
  return true;
}

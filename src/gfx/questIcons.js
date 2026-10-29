// 32×32 icons for the quest items ({ k: 'quest', t }: src/data/questItems.js), drawn with the shared
// pixel-art toolkit like the relics (lit volumes, own-colour outlines, glints). Hooked into
// gfx/PixelArt.js drawIconArt.
import { M, part, ring } from './px/parts.js';
import { mat } from './px/color.js';
import { vol, sparkle, fill } from './px/shade.js';

const GOLD = () => mat(0xe2ae3a, { cont: 1.1 });
const BRASS = () => mat(0xc8944a);
const WOOD = () => mat(0x8a5a32);
const PAPER = () => mat(0xe8d8b0, { cont: 0.8 });
const RED = 0xc23c2c;

const DRAW = {
  mitten(pc) {
    const R = mat(0xc8642a), C = mat(0xe8d8b0, { cont: 0.8 });
    const m = M().ellipse(16, 14, 8, 9).union(M().capsule(8, 14, 6, 20, 3)).union(M().rect(10, 20, 12, 6));
    part(pc, m, R, { spec: 0.4 });
    part(pc, M().rect(9, 24, 14, 5), C, {});
    for (const [x, y] of [[13, 10], [18, 12], [15, 16]]) pc.set(x, y, 0x5a2a12); // singe marks
    fill(pc, M().rect(11, 26, 10, 1), C[3]);
  },
  weights(pc) {
    const B = BRASS();
    part(pc, M().rect(4, 22, 24, 4), WOOD(), {});
    part(pc, M().rect(6, 13, 7, 9).union(M().rect(8, 10, 3, 3)), B, { spec: 0.8 });
    part(pc, M().rect(15, 16, 6, 6).union(M().rect(17, 14, 2, 2)), B, { spec: 0.8 });
    part(pc, M().rect(23, 18, 4, 4), B, { spec: 0.8 });
    sparkle(pc, 8, 15, 1, 0xffffff, B[1]);
  },
  oldpick(pc) {
    const W = WOOD(), I = mat(0x7a7a84);
    const handle = M().capsule(8, 27, 22, 9, 1.6);
    ring(pc, handle, W); vol(pc, handle, W);
    const head = M().poly([[6, 9], [14, 4], [24, 4], [29, 9], [24, 7], [14, 7]]);
    part(pc, head, I, { spec: 0.7 });
    fill(pc, M().rect(12, 20, 2, 1), 0x3a1a0a); fill(pc, M().rect(15, 17, 2, 1), 0x3a1a0a); // T.T.
    sparkle(pc, 26, 7, 1, 0xffffff, I[1]);
  },
  rubbing(pc) {
    const P = PAPER();
    part(pc, M().rect(6, 5, 20, 23), P, { spec: false });
    const runes = M();
    for (let y = 9; y < 25; y += 4) for (let x = 9; x < 24; x += 3) if ((x * 7 + y * 3) % 5) runes.rect(x, y, 2, 2);
    fill(pc, runes, 0x3a3238);
    fill(pc, M().rect(6, 5, 20, 1), P[1]);
    part(pc, M().rect(4, 4, 24, 2), WOOD(), {});
  },
  starcoin(pc) {
    const G = GOLD();
    part(pc, M().disk(16, 16, 11), G, { spec: 0.85 });
    fill(pc, M().disk(16, 16, 8).sub(M().disk(16, 16, 7)), G[3]);
    const st = M();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; st.capsule(16, 16, 16 + Math.cos(a) * 5, 16 + Math.sin(a) * 5, 1.1); }
    fill(pc, st, RED);
    sparkle(pc, 11, 10, 2, 0xffffff, G[1]);
  },
  purse(pc) {
    const L = mat(0x7a4a8a), G = GOLD();
    part(pc, M().ellipse(16, 19, 10, 9), L, { spec: 0.4 });
    part(pc, M().rect(12, 8, 8, 4), L, {});
    fill(pc, M().rect(11, 11, 10, 1), 0x3a1a3a);
    part(pc, M().disk(22, 9, 3), G, { spec: 0.8 });
    part(pc, M().disk(10, 26, 2.5), G, { spec: 0.8 });
    fill(pc, M().disk(16, 20, 2), RED);
  },
  letter(pc) {
    const P = PAPER();
    part(pc, M().rect(4, 9, 24, 16), P, { spec: false });
    const flap = M().poly([[4, 9], [16, 18], [28, 9]]);
    fill(pc, flap.clone().sub(M().poly([[6, 9], [16, 16], [26, 9]])), P[3]);
    part(pc, M().disk(16, 17, 3), mat(0xb8322a), { spec: 0.6 });
    for (const y of [21, 23]) fill(pc, M().rect(7, y, 6, 1), 0x7a5a3a);
  },
};

/** drawIconArt hook: true when it drew the spec. */
export function drawQuestIcon(pc, spec) {
  if (!spec || spec.k !== 'quest') return false;
  (DRAW[spec.t] || DRAW.rubbing)(pc);
  return true;
}

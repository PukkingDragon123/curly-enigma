// 32×32 icons for the relics ({ k: 'relic', t }), drawn with the shared pixel-art toolkit
// (lit volumes with hue-shifted ramps, own-colour outlines, glints). Hooked into
// gfx/PixelArt.js drawIconArt.
import { M } from '../../gfx/px/parts.js';
import { part, ring } from '../../gfx/px/parts.js';
import { mat } from '../../gfx/px/color.js';
import { vol, sparkle, fill } from '../../gfx/px/shade.js';

const GOLD = () => mat(0xe2ae3a, { cont: 1.1 });
const BRONZE = () => mat(0x4a8a68);
const STONE = () => mat(0x8a8274);
const CRYS = (c) => mat(c, { cont: 0.9 });

const DRAW = {
  idol(pc) {
    const G = GOLD();
    part(pc, M().ellipse(16, 25, 8, 3.2), G, { spec: 0.9 }); // cushion
    part(pc, M().ellipse(16, 19, 6, 6.5), G, { spec: 0.85 }); // body
    part(pc, M().disk(16, 10.5, 5), G, { spec: 0.8 }); // head
    // the star nose
    const st = M();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; st.line(16, 12, 16 + Math.cos(a) * 2.6, 12 + Math.sin(a) * 2.6); }
    fill(pc, st, 0xff8aa0);
    pc.set(16, 12, 0xffd0d8);
    pc.set(13, 9, 0x2a1408); pc.set(19, 9, 0x2a1408);
    part(pc, M().rect(13, 4, 7, 2), CRYS(0x58c8e0), { spec: 0.7 });
    sparkle(pc, 11, 16, 1, 0xffffff, G[1]);
  },
  disc(pc) {
    const B = BRONZE(), G = GOLD();
    part(pc, M().disk(16, 16, 12), B, { spec: 0.9 });
    const rays = M();
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; rays.capsule(16 + Math.cos(a) * 5, 16 + Math.sin(a) * 5, 16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10, 0.9); }
    vol(pc, rays, G, { spec: 0.8 });
    part(pc, M().disk(16, 16, 4.5), G, { spec: 0.7 });
    sparkle(pc, 12, 11, 2, 0xffffff, G[1]);
  },
  ewer(pc) {
    const B = BRONZE(), G = GOLD();
    part(pc, M().ellipse(15, 20, 7, 8).union(M().rect(12, 7, 6, 6)), B, { spec: 0.85 });
    part(pc, M().capsule(19, 10, 26, 6, [1.6, 1]), B, {}); // the spout
    const h = M().capsule(8, 9, 6, 17, 1.2);
    ring(pc, h, G); vol(pc, h, G);
    fill(pc, M().rect(11, 13, 9, 1), G[2]);
    fill(pc, M().rect(9, 22, 13, 1), G[3]);
    part(pc, M().ellipse(15, 6.5, 4, 1.4), G, {});
    sparkle(pc, 12, 17, 1, 0xffffff, B[1]);
  },
  lens(pc) {
    const B = BRONZE(), C = CRYS(0x9ad8f4);
    part(pc, M().disk(15, 15, 11), B, { spec: 0.9 });
    part(pc, M().disk(15, 15, 8), C, { spec: 0.6, emit: 0.3 });
    part(pc, M().capsule(22, 22, 28, 28, 2), B, {});
    sparkle(pc, 11, 11, 2, 0xffffff, C[1], 0.6);
  },
  tablet(pc) {
    const S = STONE(), G = GOLD();
    part(pc, M().rect(7, 4, 18, 25), S, { spec: false });
    const ln = M();
    for (let y = 8; y < 26; y += 5) for (let x = 10; x < 23; x += 4) if ((x + y) % 3) ln.rect(x, y, 2, 3);
    fill(pc, ln, G[3]);
    fill(pc, M().rect(8, 5, 16, 1), S[1]);
    // a chipped corner
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4 - i; j++) pc.put(24 - j, 28 - i, 0, 0);
  },
  crown(pc) {
    const G = mat(0xd8783a, { cont: 1.1 }), E = CRYS(0xff6a2a);
    const m = M().rect(6, 16, 20, 8);
    for (let k = 0; k < 5; k++) m.poly([[6 + k * 5, 16], [8.5 + k * 5, 7], [11 + k * 5, 16]]);
    part(pc, m, G, { spec: 0.85 });
    for (let k = 0; k < 5; k++) part(pc, M().disk(8.5 + k * 5, 8, 1.5), E, { emit: 0.8, ring: false });
    part(pc, M().disk(16, 20, 2.4), E, { emit: 0.7 });
    sparkle(pc, 10, 18, 1, 0xffffff, G[1]);
  },
  mirror(pc) {
    const B = mat(0xc8944a), C = CRYS(0xe8f4ff);
    part(pc, M().disk(16, 13, 10), B, { spec: 0.9 });
    part(pc, M().disk(16, 13, 7.5), C, { spec: 0.5, emit: 0.4 });
    part(pc, M().rect(14, 23, 4, 7), B, {});
    sparkle(pc, 13, 10, 2, 0xffffff, C[1], 0.8);
  },
  mask(pc) {
    const C = CRYS(0x8acff0);
    const m = M().ellipse(16, 15, 10, 12).sub(M().ellipse(11.5, 12, 2.6, 1.8)).sub(M().ellipse(20.5, 12, 2.6, 1.8));
    part(pc, m, C, { spec: 0.6, emit: 0.2 });
    const st = M();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; st.line(16, 19, 16 + Math.cos(a) * 3, 19 + Math.sin(a) * 3); }
    fill(pc, st, 0xffffff);
    fill(pc, M().rect(12, 24, 8, 1), C[4]);
    sparkle(pc, 10, 8, 2, 0xffffff, C[1], 0.5);
  },
  key(pc) {
    const G = GOLD();
    const m = M().capsule(14, 14, 27, 27, 1.8);
    const star = M();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; star.capsule(10, 10, 10 + Math.cos(a) * 7, 10 + Math.sin(a) * 7, 2); }
    m.union(star).union(M().rect(22, 25, 3, 5)).union(M().rect(25, 22, 5, 3));
    part(pc, m, G, { spec: 0.8 });
    part(pc, M().disk(10, 10, 2), CRYS(0x58c8e0), { emit: 0.6 });
    sparkle(pc, 7, 6, 2, 0xffffff, G[1]);
  },
  orb(pc) {
    const V = mat(0x4a2a7a, { cont: 1.2 }), G = GOLD();
    part(pc, M().rect(9, 24, 14, 5), G, {});
    part(pc, M().disk(16, 15, 10), V, { spec: 0.75, emit: 0.25 });
    const sw = M();
    for (let t = 0; t < 30; t++) { const a = t * 0.42, r = t * 0.28; sw.set(16 + Math.cos(a) * r, 15 + Math.sin(a) * r); }
    fill(pc, sw, 0xc89aff, 0.7);
    sparkle(pc, 12, 10, 1, 0xffffff, V[1], 0.5);
  },
  amulet(pc) {
    const G = GOLD(), H = CRYS(0xd8283a);
    const chain = M();
    for (let t = 0; t <= 20; t++) { const a = Math.PI * (t / 20); if (t % 2 === 0) chain.set(16 + Math.cos(a) * 10, 14 - Math.sin(a) * 10); }
    fill(pc, chain, G[2]);
    part(pc, M().poly([[16, 13], [24, 20], [16, 29], [8, 20]]), G, { spec: 0.85 });
    part(pc, M().poly([[16, 16], [21, 20.5], [16, 26], [11, 20.5]]), H, { emit: 0.6, spec: 0.6 });
    sparkle(pc, 14, 18, 1, 0xffffff, H[1], 0.6);
  },
};

/** drawIconArt hook: true when it drew the spec. */
export function drawRelic(pc, spec) {
  if (!spec || spec.k !== 'relic') return false;
  const fn = DRAW[spec.t] || DRAW.idol;
  fn(pc);
  return true;
}

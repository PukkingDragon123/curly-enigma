// Cave creatures as 32×32 pixel-art sprites, 4 animation frames each, facing right.
// Emissive pixels are flagged on pc.glow (the mine atlas turns them into its alpha glow band).
// critterIconURL(id) gives a UI icon (frame 0 + soft glow) without needing the mine.
//
// Frame conventions (Entities.js): frames 0↔1 are a good 2-frame loop on their own and
// 0→1→2→3 is a full cycle. Special poses: rock_crab 0 = hidden (looks like a rock),
// 1 = peeking, 2/3 = scuttling; cave_bat 1 = wings folded (also used flipped for roosting).
import { PixelCanvas } from './px/canvas.js';
import { mat, mix } from './px/color.js';
import { vol, fill, sparkle, glowHalo, hash2, bayer } from './px/shade.js';
import { M, ring, lineIn } from './px/parts.js';

const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };
const EYE = 0x1a1220;

/** Cute dot eye with a highlight. */
function eye(pc, x, y, big = false) {
  pc.set(x, y, EYE);
  if (big) { pc.set(x + 1, y, EYE); pc.set(x, y + 1, EYE); pc.set(x + 1, y + 1, EYE); pc.set(x, y, 0xffffff); }
  else pc.set(x, y - 1, mix(EYE, 0xffffff, 0.15));
}

/** Thin leg: list of joints, 1px, colored. */
function leg(pc, pts, c, c2) {
  for (let i = 0; i + 1 < pts.length; i++) lineIn(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i === pts.length - 2 && c2 !== undefined ? c2 : c);
}

// ---------------------------------------------------------------- creatures
export const CRITTER_DRAW = {
  earthworm(pc, f) {
    const R = mat(0xe89a9a, { cont: 1.05 });
    const ph = f * Math.PI / 2;
    const pts = [];
    for (let i = 0; i <= 22; i++) pts.push([4 + i, 22 + Math.sin(i * 0.42 - ph) * 2.6 * (0.4 + i / 30)]);
    const m = M();
    for (let i = 0; i < pts.length; i++) m.disk(pts[i][0], pts[i][1], i > 19 ? 2.4 : 2.1 - (i < 3 ? (3 - i) * 0.4 : 0));
    ring(pc, m, R);
    vol(pc, m, R, { round: 2, spec: 0.88 });
    // segment rings + saddle band
    for (let i = 2; i < 21; i += 2) { const [x, y] = pts[i]; if (m.get(x, y + 1)) { pc.set(x, y + 1, R[4]); pc.set(x, y, R[3]); } }
    for (let i = 13; i <= 15; i++) { const [x, y] = pts[i]; for (let k = -1; k <= 1; k++) if (m.get(x, y + k)) pc.set(x, y + k, R[k < 0 ? 2 : 4] === undefined ? R[3] : mix(R[3], 0xc8606a, 0.5)); }
    // happy face on the head
    const [hx, hy] = pts[22];
    pc.set(hx, hy - 1, EYE);
    pc.set(hx + 1, hy + 1, 0xb85a64);
    pc.set(hx - 1, hy + 0.5, 0xf0b0b8);
  },
  dust_bunny(pc, f) {
    const R = mat(0xcabca6, { cont: 1.05 });
    const hop = [0, -4, -6, -1][f];
    const sq = [1.12, 0.94, 0.96, 1.08][f];
    const cx = 16, cy = 21 + hop, r = 8;
    const body = M().fn((x, y) => {
      const dx = (x + 0.5 - cx) / (r * sq), dy = (y + 0.5 - cy) / (r / sq);
      const a = Math.atan2(dy, dx);
      const fuzz = 1 + 0.12 * Math.sin(a * 9 + 1.3) + 0.06 * Math.sin(a * 17);
      return dx * dx + dy * dy <= fuzz * fuzz;
    });
    // ears
    const e1 = M().oval(cx - 3, cy - r / sq - 2, 1.8, 3.6, -0.3), e2 = M().oval(cx + 3, cy - r / sq - 2.5, 1.8, 3.8, 0.25);
    const all = body.clone().union(e1).union(e2);
    ring(pc, all, R, { lit: R[5] });
    vol(pc, e1, R, { round: 1.2 }); vol(pc, e2, R, { round: 1.2 });
    vol(pc, body, R, { round: 5, tex: (x, y) => (hash2(x, y, 3) - 0.5) * 0.18 });
    for (const [x, y] of [[cx - 3, cy - r / sq - 1], [cx + 3, cy - r / sq - 1.5]]) pc.set(x, y, 0xe8a0a8);
    // face
    eye(pc, cx + 1, cy - 1, true); eye(pc, cx + 5, cy - 1, true);
    pc.set(cx + 3, cy + 1, 0xf07a8a);
    pc.set(cx + 0, cy + 2, 0xe8b0b0); pc.set(cx + 6, cy + 2, 0xe8b0b0);
    // shadow on the ground when airborne
    if (hop < -2) M().ellipse(16, 29.5, 6, 1.2).each((x, y) => pc.set(x, y, 0x000000, 70));
  },
  mole_cricket(pc, f) {
    const R = mat(0x8a6040, { cont: 1.1 });
    const step = f % 2;
    // legs (behind)
    const LC = 0x5a3a24;
    leg(pc, [[15, 22], [13 - step, 27], [11 - step * 2, 29]], LC);
    leg(pc, [[19, 22], [21 + step, 27], [24 + step, 29]], LC);
    leg(pc, [[11, 22], [7 + step, 25], [4 + step, 29]], LC);
    // abdomen, thorax, head
    const ab = M().ellipse(10, 19, 8, 4.2);
    const th = M().ellipse(19, 18, 4.6, 4.4);
    const hd = M().ellipse(25, 18.5, 3.6, 3.4);
    const all = ab.clone().union(th).union(hd);
    ring(pc, all, R);
    vol(pc, ab, R, { round: 3, spec: 0.85 }); vol(pc, th, R, { round: 3, spec: 0.85 }); vol(pc, hd, R, { round: 2.5 });
    for (let x = 4; x < 17; x += 3) for (let y = 16; y < 23; y++) if (ab.get(x, y)) pc.set(x, y, R[4]);
    // folded wings
    const wg = M().poly([[5, 15], [17, 15], [15, 18], [3, 18]]);
    fill(pc, wg, 0xb89870); for (let x = 5; x < 17; x += 2) pc.set(x, 16, 0x9a7a54);
    // big digging forelegs
    const dg = M().poly([[23, 21], [27, 22 + step], [29, 25 + step], [25, 25]]);
    ring(pc, dg, R); fill(pc, dg, R[3]); pc.set(28, 25 + step, R[1]); pc.set(26, 24, R[1]);
    eye(pc, 26, 17);
    leg(pc, [[27, 16], [30, 12 + step], [31, 11 + step]], 0x6a4a30);
    leg(pc, [[27, 16], [29, 11], [29, 9]], 0x6a4a30);
  },
  cave_bat(pc, f) {
    const R = mat(0x5e4a70, { cont: 1.05 });
    const W = mat(0x4a3a5a, { cont: 1.05 });
    const cx = 16, cy = 15;
    const wing = (side) => {
      const s = side;
      let pts;
      if (f === 0) pts = [[cx + s * 3, cy - 1], [cx + s * 9, cy - 9], [cx + s * 15, cy - 7], [cx + s * 13, cy - 3], [cx + s * 11, cy - 1], [cx + s * 8, cy + 1]]; // up
      else if (f === 1) pts = [[cx + s * 3, cy - 2], [cx + s * 6, cy - 3], [cx + s * 7, cy + 5], [cx + s * 4, cy + 7]]; // folded
      else if (f === 2) pts = [[cx + s * 3, cy], [cx + s * 9, cy + 1], [cx + s * 14, cy + 6], [cx + s * 11, cy + 7], [cx + s * 8, cy + 9], [cx + s * 5, cy + 6]]; // down
      else pts = [[cx + s * 3, cy - 1], [cx + s * 10, cy - 3], [cx + s * 15, cy], [cx + s * 12, cy + 2], [cx + s * 9, cy + 4], [cx + s * 6, cy + 2]]; // mid
      const m = M().poly(pts);
      ring(pc, m, W);
      vol(pc, m, W, { round: 2 });
      // finger bones
      for (let i = 1; i < pts.length - 1; i++) lineIn(pc, pts[0][0], pts[0][1], pts[i][0], pts[i][1], W[1], m);
    };
    wing(-1); wing(1);
    const body = M().ellipse(cx, cy + 1, 4, 5);
    const ears = M().poly([[cx - 4, cy - 3], [cx - 3.5, cy - 9], [cx - 1, cy - 4]]).poly([[cx + 4, cy - 3], [cx + 3.5, cy - 9], [cx + 1, cy - 4]]);
    const all = body.clone().union(ears);
    ring(pc, all, R);
    vol(pc, ears, R, { round: 1 });
    vol(pc, body, R, { round: 3, tex: (x, y) => (hash2(x, y, 4) - 0.5) * 0.2 });
    pc.set(cx - 3, cy - 6, 0xd88aa0); pc.set(cx + 3, cy - 6, 0xd88aa0);
    // red eyes, fangs, feet
    gl(pc, cx - 2, cy - 1, 0xff4a4a, 0.6); gl(pc, cx + 2, cy - 1, 0xff4a4a, 0.6);
    pc.set(cx - 1, cy + 2, 0xffffff); pc.set(cx + 1, cy + 2, 0xffffff);
    pc.set(cx - 1, cy + 6, W[5]); pc.set(cx + 1, cy + 6, W[5]);
  },
  rock_crab(pc, f) {
    const SH = mat(0x8a7c6c, { cont: 1.05 });
    const LG = mat(0xb07a5a, { cont: 1.1 });
    const walk = f >= 2, peek = f >= 1;
    const step = f === 3 ? 1 : 0;
    const cy = walk ? 19 : 22;
    if (walk) {
      for (let i = 0; i < 3; i++) {
        const lx = 9 + i * 3, rx = 17 + i * 3;
        const s = (i + step) % 2;
        leg(pc, [[lx, cy + 2], [lx - 3, cy + 6 - s], [lx - 4, cy + 9]], LG[4]);
        leg(pc, [[rx, cy + 2], [rx + 3, cy + 6 - s], [rx + 4, cy + 9]], LG[4]);
      }
      // claws
      for (const [x, s] of [[4, -1], [28, 1]]) {
        const cl = M().ellipse(x, cy - 1 - step, 3, 2.4).sub(M().ellipse(x + s * 1.5, cy - 2.5 - step, 1.6, 1));
        ring(pc, cl, LG); vol(pc, cl, LG, { round: 1.5, spec: 0.85 });
        lineIn(pc, x - s * 2, cy + 1, 16 + s * -7, cy + 2, LG[4]);
      }
    }
    // rocky shell: faceted lump with moss
    const sh = M().ellipse(16, cy, 11, 7).sub(M().rect(0, cy + 4, 32, 10)).union(M().rect(6, cy + 2, 21, 3));
    ring(pc, sh, SH);
    vol(pc, sh, SH, { round: 4, tex: (x, y) => (hash2(Math.floor(x / 2), Math.floor(y / 2), 8) - 0.5) * 0.35 });
    for (const [x, y] of [[11, cy - 5], [12, cy - 5], [13, cy - 6], [20, cy - 4], [21, cy - 5]]) pc.set(x, y, 0x6a9a4a);
    pc.set(12, cy - 6, 0x8ac06a);
    if (peek) {
      // eye stalks pop up
      for (const x of [13, 19]) { lineIn(pc, x, cy - 6, x, cy - 9, LG[3]); pc.set(x, cy - 10, EYE); pc.set(x, cy - 11, 0xffffff); }
    } else {
      pc.set(14, cy + 3, 0x2a2018); pc.set(18, cy + 3, 0x2a2018);
    }
  },
  ore_slug(pc, f) {
    const R = mat(0x8ccf98, { cont: 1.05 });
    const st = [0, 1, 2, 1][f];
    // slime trail
    for (let x = 1; x < 9 + st; x++) pc.set(x, 28, 0xc8f0d0, 160);
    const foot = M().ellipse(16 - st * 0.5, 26, 11 + st, 3.2);
    const body = M().ellipse(17 - st * 0.4, 22, 9 + st * 0.6, 5.2);
    const head = M().ellipse(24 + st * 0.5, 22, 4, 3.6);
    const all = foot.clone().union(body).union(head);
    ring(pc, all, R);
    vol(pc, foot, R, { round: 2 });
    vol(pc, body, R, { round: 4, spec: 0.78, shine: 8 });
    vol(pc, head, R, { round: 2.5, spec: 0.8 });
    // metal flecks from eaten ore
    for (const [x, y, c] of [[13, 20, 0xf2c23a], [17, 19, 0xd8dde6], [15, 23, 0xd9773f], [20, 21, 0xf2c23a], [11, 22, 0xd8dde6]]) pc.set(x - st * 0.4, y, c);
    // eye stalks
    const sx = 25 + st * 0.5;
    lineIn(pc, sx, 19, sx + 1, 14 - (f === 2 ? 1 : 0), R[3]); lineIn(pc, sx + 2, 19, sx + 4, 15, R[3]);
    pc.set(sx + 1, 13 - (f === 2 ? 1 : 0), EYE); pc.set(sx + 4, 14, EYE);
    pc.set(sx + 2, 23, 0x4a7a50);
  },
  glow_beetle(pc, f) {
    const R = mat(0x34345a, { cont: 1.15 });
    const L = mat(0xc8ff6a, { cont: 1 });
    const bob = [0, -1, 0, 1][f];
    const cy = 16 + bob;
    // wings: translucent, buzzing
    const wUp = f % 2 === 0;
    for (const s of [-1, 1]) {
      const w = M().oval(16 + s * 5, cy - (wUp ? 6 : 1), 6, 2.6, s * (wUp ? -0.7 : -0.2));
      w.each((x, y) => pc.set(x, y, 0xd8e8ff, bayer(x, y) < 0.6 ? 200 : 140));
      w.edge().each((x, y) => pc.set(x, y, 0xa8b8e0, 220));
    }
    // glowing abdomen (lantern bottom)
    const ab = M().ellipse(10.5, cy + 2, 5.5, 4.5);
    ring(pc, ab, L, { lit: L[4], dark: L[5] });
    vol(pc, ab, L, { emit: 1, round: 3 });
    gl(pc, 9, cy + 1, 0xffffff);
    // shell + head
    const sh = M().ellipse(17, cy, 6, 5);
    const hd = M().ellipse(23.5, cy + 1, 3, 2.8);
    ring(pc, sh.clone().union(hd), R);
    vol(pc, sh, R, { round: 3, spec: 0.75 });
    vol(pc, hd, R, { round: 2 });
    lineIn(pc, 17, cy - 5, 17, cy + 4, R[5]);
    eye(pc, 24, cy, false);
    pc.set(25, cy, 0xffffff);
    leg(pc, [[24, cy - 2], [27, cy - 6], [29, cy - 7]], R[2]);
    leg(pc, [[23, cy - 2], [25, cy - 7], [26, cy - 9]], R[2]);
    for (const x of [14, 18, 21]) leg(pc, [[x, cy + 4], [x - 1, cy + 7]], R[4]);
  },
  spark_mite(pc, f) {
    const R = mat(0x5fd8ff, { cont: 1.05 });
    // legs
    for (let i = 0; i < 3; i++) { const s = (i + f) % 2; leg(pc, [[12 + i * 3, 20], [10 + i * 3 - s, 24], [9 + i * 4, 25]], 0x2a6a8a); }
    const body = M().ellipse(16, 17, 8, 6.5);
    ring(pc, body, R);
    vol(pc, body, R, { emit: 0.85, spec: 0.8, round: 4 });
    eye(pc, 19, 15, true); eye(pc, 14, 15, true);
    pc.set(16, 19, 0x1a3a5a);
    // orbiting sparks
    for (let i = 0; i < 4; i++) {
      const a = f * (Math.PI / 4) + i * (Math.PI / 2);
      const x = 16 + Math.cos(a) * 12, y = 17 + Math.sin(a) * 9;
      gl(pc, x, y, 0xffffff); gl(pc, x + 1, y, 0xfff6a0, 0.9); gl(pc, x, y + 1, 0xfff6a0, 0.9);
    }
    lineIn(pc, 16, 10, 15, 6, 0x5fd8ff); gl(pc, 15, 5, 0xfff6a0);
  },
  crystal_spider(pc, f) {
    const R = mat(0xa8daf8, { cont: 1.15 });
    // legs: 4 per side, twitching
    const LC = 0x5a8ab8, LT = 0xc8ecff;
    for (let i = 0; i < 4; i++) {
      const y0 = 14 + i * 1.6, s = (i + f) % 2;
      leg(pc, [[12, y0], [6, y0 - 4 + i * 2 + s], [2, y0 + 2 + i * 2 - s]], LC, LT);
      leg(pc, [[20, y0], [26, y0 - 4 + i * 2 + s], [30, y0 + 2 + i * 2 - s]], LC, LT);
    }
    // thread stub
    for (let y = 0; y < 10; y++) pc.set(16, y, 0xe8f4ff, 200);
    const ceph = M().ellipse(16, 13, 4, 3.4);
    const abd = M().ellipse(16, 20.5, 6, 5.5);
    ring(pc, ceph.clone().union(abd), R);
    vol(pc, ceph, R, { round: 2.5, spec: 0.85 });
    vol(pc, abd, R, { round: 3.5, spec: 0.8 });
    // crystal spikes on the abdomen
    for (const [x0, y0, x1, y1] of [[14, 18, 12, 14], [18, 18, 20, 14], [16, 19, 16, 14]]) { lineIn(pc, x0, y0, x1, y1, R[0]); gl(pc, x1, y1, 0xffffff, 0.6); }
    gl(pc, 14, 12, 0xff5a8a, 0.7); gl(pc, 18, 12, 0xff5a8a, 0.7); pc.set(15, 11, 0xff8aaa); pc.set(17, 11, 0xff8aaa);
  },
  blind_fish(pc, f) {
    const R = mat(0xf2d8d4, { cont: 1.05 });
    const tail = [0, 2, 0, -2][f];
    const fin = mat(0xe8c0c0, { cont: 1 });
    // tail
    const t = M().poly([[8, 16], [1, 10 + tail], [3, 16], [1, 22 + tail]]);
    ring(pc, t, fin); vol(pc, t, fin, { round: 1.5 });
    t.each((x, y) => { if ((y + x) % 3 === 0) pc.set(x, y, fin[4]); });
    // dorsal & pelvic fins
    const df = M().poly([[11, 11], [16, 7 + (f % 2)], [20, 11]]);
    ring(pc, df, fin); fill(pc, df, fin[2]);
    const body = M().ellipse(16, 16, 11, 5.5);
    ring(pc, body, R);
    vol(pc, body, R, { round: 4, spec: 0.82 });
    // translucent belly showing a hint of bones
    for (let x = 11; x < 21; x += 2) pc.set(x, 17, R[4]);
    // eyeless face, gill, little mouth
    lineIn(pc, 22, 13, 22, 18, R[4]);
    pc.set(25, 14, R[4]); pc.set(26, 14, R[3]);
    pc.set(26, 17, 0xc87a80);
    const pf = M().poly([[15, 20], [19, 20], [14, 24 + (f % 2)]]);
    ring(pc, pf, fin); fill(pc, pf, fin[3]);
  },
  lava_newt(pc, f) {
    const R = mat(0xf0642a, { cont: 1.1, warm: 40 });
    const step = f % 2, sw = [0, 1, 0, -1][f];
    // legs
    for (const [x, s] of [[9, step], [20, 1 - step]]) { leg(pc, [[x, 22], [x - 2 + s * 2, 26], [x - 3 + s * 3, 27]], R[4]); leg(pc, [[x + 2, 22], [x + 4 - s * 2, 26], [x + 5 - s * 2, 27]], R[5]); }
    // tail sweeping
    const tl = M().path([[8, 21], [4, 20 + sw], [1, 17 + sw * 2]], [2.4, 1.6, 0.7]);
    const body = M().ellipse(15, 21, 8, 3.6);
    const head = M().ellipse(25, 20, 4, 3.2);
    const all = tl.clone().union(body).union(head);
    ring(pc, all, R);
    vol(pc, tl, R, { round: 1.5 }); vol(pc, body, R, { round: 2.5, spec: 0.85 }); vol(pc, head, R, { round: 2, spec: 0.85 });
    // dark back stripe and glowing spots
    for (let x = 7; x < 24; x++) if (all.get(x, 18)) pc.set(x, 18, R[5]);
    for (const [x, y] of [[10, 19], [14, 19], [18, 19], [22, 18], [5, 19]]) gl(pc, x, y, 0xffd27a, 1);
    eye(pc, 26, 19, false); pc.set(27, 19, 0xffe080);
    pc.set(28, 21, 0x8a2a10);
  },
  ember_moth(pc, f) {
    const W = mat(0xffa040, { cont: 1.05, warm: 45 });
    const B = mat(0x6a3a1c, { cont: 1.05 });
    const flap = [0, 1, 2, 1][f];
    for (const s of [-1, 1]) {
      const h = [7, 4.5, 2.2][flap];
      const fw = M().oval(16 + s * 6.5, 13 - h * 0.3, 6.5, h, s * 0.35);
      const hw = M().oval(16 + s * 5, 19, 4.4, Math.max(1.5, h * 0.6), -s * 0.4);
      const wm = fw.clone().union(hw);
      ring(pc, wm, W);
      vol(pc, wm, W, { round: 2, emit: 0.55 });
      // eye spots and glowing rims
      const ex = 16 + s * 7, ey = 13 - h * 0.3;
      if (h > 3) { gl(pc, ex, ey, 0x3a1a0a, 0); pc.set(ex, ey, 0x5a2a10); gl(pc, ex - s, ey - 1, 0xffe8a0, 1); }
      fw.edge().each((x, y) => { if (!fw.get(x, y - 1)) gl(pc, x, y, 0xffd070, 0.9); });
    }
    const body = M().ellipse(16, 16, 2.6, 6);
    ring(pc, body, B);
    vol(pc, body, B, { round: 2, tex: (x, y) => (hash2(x, y, 2) - 0.5) * 0.3 });
    for (let y = 13; y < 21; y += 2) pc.set(16, y, B[1]);
    leg(pc, [[15, 10], [12, 5], [11, 4]], B[3]); leg(pc, [[17, 10], [20, 5], [21, 4]], B[3]);
    gl(pc, 15, 11, 0xffe08a, 0.4); gl(pc, 17, 11, 0xffe08a, 0.4);
    if (f % 2) for (const [x, y] of [[8, 26], [24, 25]]) gl(pc, x, y, 0xffb04a, 0.9);
  },
  frost_shrimp(pc, f) {
    const R = mat(0xffa894, { cont: 1.1 });
    const flick = [0, 1, 2, 1][f];
    // segmented curved body, tail fan
    const segs = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.15 + i * 0.13) + flick * 0.06;
      segs.push([16 + Math.cos(a) * -8 + 2, 14 + Math.sin(a) * 8 - 2, 3.4 - i * 0.3]);
    }
    const body = M();
    for (const [x, y, r] of segs) body.disk(x, y, r);
    const tail = M().poly([[segs[5][0] + 1, segs[5][1]], [segs[5][0] + 5, segs[5][1] + 3 + flick], [segs[5][0] - 1, segs[5][1] + 4]]);
    const head = M().ellipse(22, 11, 5, 3.4);
    const all = body.clone().union(tail).union(head);
    ring(pc, all, R);
    vol(pc, body, R, { round: 2.5, spec: 0.8 });
    vol(pc, head, R, { round: 2, spec: 0.85 });
    fill(pc, tail, R[2]);
    for (const [x, y] of segs) pc.set(x + 1, y - 2, R[1]);
    // frost on the back
    for (const [x, y] of segs.slice(0, 4)) pc.set(x, y - 2.5, 0xffffff);
    // legs, antennae, eye
    for (const [x, y] of segs.slice(0, 5)) leg(pc, [[x, y + 2], [x - 1, y + 5]], R[4]);
    leg(pc, [[26, 9], [30, 4], [31, 2 + flick]], R[3]); leg(pc, [[26, 10], [31, 8 + flick]], R[3]);
    eye(pc, 24, 10, true);
    for (const [x, y] of [[6, 4], [10, 26]]) sparkle(pc, x, y, 1, 0xffffff, 0xbff6ff, 0.5);
  },
  gem_tortoise(pc, f) {
    const SK = mat(0xa8b880, { cont: 1.05 });
    const SH = mat(0x6a8a5a, { cont: 1.1 });
    const step = f % 2, bob = f === 1 || f === 3 ? 1 : 0;
    // legs
    for (const [x, s] of [[9, step], [21, 1 - step]]) { const l = M().rect(x - 1.5 + s, 23, 4, 5); ring(pc, l, SK); vol(pc, l, SK, { round: 1.2 }); }
    // head + neck
    const hd = M().ellipse(27, 20 + bob, 3.8, 3.2).union(M().rect(22, 19 + bob, 5, 4));
    ring(pc, hd, SK); vol(pc, hd, SK, { round: 2 });
    eye(pc, 28, 19 + bob); pc.set(30, 21 + bob, SK[5]);
    // domed shell with plates and moss, big gem on top
    const sh = M().ellipse(15, 19, 11, 8.5).sub(M().rect(0, 24, 32, 9));
    ring(pc, sh, SH);
    vol(pc, sh, SH, { round: 5, spec: 0.9 });
    for (const [x, y] of [[10, 14], [20, 14], [15, 20], [8, 20], [22, 20]]) { M().disk(x, y, 2.6).and(sh).edge().each((X, Y) => pc.set(X, Y, SH[4])); }
    for (let x = 4; x < 27; x++) if (sh.get(x, 23)) pc.set(x, 23, SH[5]);
    for (const [x, y] of [[7, 17], [8, 16], [22, 15], [23, 16], [13, 22]]) pc.set(x, y, 0x8ac06a);
    const g = M().poly([[15, 8], [18.5, 11.5], [15, 15], [11.5, 11.5]]);
    const GR = mat(0xe02a3a, { cont: 1.2 });
    ring(pc, g, GR);
    g.each((x, y) => { pc.set(x, y, GR[x < 15 ? (y < 11.5 ? 1 : 2) : (y < 11.5 ? 3 : 4)]); pc.emit(x, y, 0.5); });
    gl(pc, 14, 10, 0xffffff, 0.8);
  },
  void_wisp(pc, f) {
    const flick = [0, 1, 0, -1][f];
    // trailing smoky tail
    const tail = M();
    for (let i = 0; i < 12; i++) tail.disk(16 - i * 0.2 + Math.sin(i * 0.8 + f * 1.6) * 1.6, 20 + i, Math.max(0.5, 4.5 - i * 0.35));
    tail.each((x, y) => gl(pc, x, y, y > 26 ? 0x3a1a60 : 0x5a2a90, 0.5));
    // flame body
    const body = M().fn((x, y) => {
      const dx = (x + 0.5 - 16) / 7, dy = (y + 0.5 - 15) / 8;
      return dx * dx + dy * dy * (dy < 0 ? 0.8 : 1.4) <= 1 && !(dy < -0.55 && Math.abs(dx - flick * 0.2) > 0.5 + dy * 0.3);
    });
    const R = mat(0x8a5ad0, { cont: 1.05 });
    ring(pc, body, R, { lit: 0x2a1040, dark: 0x1a0828 });
    body.each((x, y) => {
      const d = Math.hypot((x + 0.5 - 16) / 7, (y + 0.5 - 16) / 7);
      gl(pc, x, y, d < 0.35 ? 0xf4e8ff : d < 0.6 ? 0xc8a0ff : d < 0.85 ? 0x9a6ae0 : 0x6a3ab0, d < 0.6 ? 1 : 0.7);
    });
    // flame tips
    for (const [x, y] of [[14 + flick, 6], [18 + flick, 7], [16 + flick, 5]]) gl(pc, x, y, 0xb890f0, 0.8);
    // hollow eyes (they eat light)
    for (const x of [13, 18]) { pc.set(x, 14, 0x12061e); pc.set(x + 1, 14, 0x12061e); pc.set(x, 15, 0x12061e); pc.set(x + 1, 15, 0x12061e); pc.emit(x, 14, 0); }
    pc.set(15, 18, 0x2a1040); pc.set(16, 18, 0x2a1040);
  },
};

/** Draw one frame of a creature into a fresh 32×32 PixelCanvas (null for unknown ids). */
export function drawCritter(id, frame = 0) {
  const fn = CRITTER_DRAW[id];
  if (!fn) return null;
  const pc = new PixelCanvas(32);
  fn(pc, frame & 3);
  return pc;
}

const urlCache = new Map();
/** 32×32 data URL of a creature (frame 0) for the Index Book and UI. */
export function critterIconURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const pc = drawCritter(id, id === 'rock_crab' ? 2 : id === 'cave_bat' ? 0 : 0);
  if (!pc) return null;
  if (pc.glow) {
    let n = 0;
    for (const g of pc.glow) if (g > 0.3) n++;
    if (n > 4) glowHalo(pc, 0xffffff, 50, 1);
  }
  const url = pc.commit().toDataURL();
  urlCache.set(id, url);
  return url;
}

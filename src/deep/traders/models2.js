// Prop models for the burrows (part 2): Rocco's junk hoard (weapons racks, the NO QUESTIONS sign,
// the gramophone, the mannequin, the mounted fish, the crate-stack secret door and his stash), the
// Deep Outpost (brazier, sandbags, cot, map table, banner, stove) and the signs over the doors.
// Same conventions as ./models.js.
import { PGrid, hv, shade } from '../props/grid.js';
import { addModels, paintText, textWidth } from './kit.js';
import { W, IR, BR, BURLAP, wood } from './models.js';

const L = (c, r, at, o = {}) => ({ c, r, at, ...o });
const STEEL = [0x5a606a, 0x7a828e, 0x9ea6b2, 0xc8d0da, 0xf0f4f8];

/** A blade along +y from (x, y0, z): length n, with a guard and grip below. */
function sword(g, x, y0, z, n, o = {}) {
  const S = o.metal || STEEL;
  g.box(x, y0, z, 1, 4, 1, o.grip || 0x4a2a1a); // grip
  g.set(x, y0 - 1, z, o.pommel || BR[2]);
  g.box(x - 2, y0 + 4, z, 5, 1, 1, o.guard || BR[1]);
  for (let i = 0; i < n; i++) {
    const y = y0 + 5 + i, w = o.wide && i < n - 3 ? 1 : 0;
    g.set(x, y, z, i > n - 2 ? S[4] : S[2]);
    if (i < n - 1) g.set(x + 1, y, z, S[1]);
    if (w) g.set(x - 1, y, z, S[3]);
  }
}
function axe(g, x, y0, z, n) {
  g.box(x, y0, z, 1, n, 1, W[3]);
  for (let dy = 0; dy < 6; dy++) for (let dx = 1; dx < 4 + (dy > 1 && dy < 5 ? 1 : 0); dx++) g.set(x + dx, y0 + n - 7 + dy, z, dx > 3 ? STEEL[4] : STEEL[2]);
  g.box(x - 1, y0 + n - 5, z, 1, 2, 1, STEEL[1]);
}
function spear(g, x, y0, z, n) {
  g.box(x, y0, z, 1, n, 1, W[2]);
  g.set(x, y0 + n, z, STEEL[2]); g.set(x, y0 + n + 1, z, STEEL[3]); g.set(x, y0 + n + 2, z, STEEL[4]);
  g.set(x - 1, y0 + n, z, STEEL[2]); g.set(x + 1, y0 + n, z, STEEL[2]);
  g.set(x, y0 + n - 1, z, 0xc83a2a);
}
function mace(g, x, y0, z, n) {
  g.box(x, y0, z, 1, n, 1, W[1]);
  g.ell(x, y0 + n + 1, z, 2, 2, 1.5, IR[3]);
  for (const [dx, dy] of [[-3, 0], [3, 0], [0, 3], [-2, 2], [2, 2]]) g.set(x + dx, y0 + n + 1 + dy, z, IR[4]);
}

addModels({
  // ---------------------------------------------------------------- Rocco's Storage
  noquestions(r, v, p) {
    const txt = 'NO QUESTIONS', tw = textWidth(txt), w = tw + 8, chainL = Math.max(4, Math.min(48, p || 12));
    const g = new PGrid(w, 13 + chainL, 4);
    for (let y = 0; y < 13; y++) for (let x = 0; x < w; x++) {
      const edge = x === 0 || x === w - 1 || y === 0 || y === 12;
      if ((x === 0 || x === w - 1) && (y === 0 || y === 12)) continue; // round the corners
      const chip = !edge && hv(x, y, 3, 9) < 0.04;
      g.set(x, y, 1, edge ? W[1] : chip ? W[2] : (y % 4 === 0 ? 0x5a1814 : 0x7a2018));
      g.set(x, y, 0, W[1]); g.set(x, y, 2, edge ? W[1] : 0x6a1c16);
    }
    paintText(g, txt, 4, 9, 3, (x, y) => (hv(x, y, 7, 3) < 0.12 ? 0xc8b890 : 0xf2e6c4), { jitter: true });
    g.box(2, 2, 3, 2, 1, 1, 0xf2e6c4); // a painted underline flick
    for (let x = 4; x < w - 6; x++) if (hv(x, 2, 2, 5) < 0.75) g.set(x, 2, 3, 0xe0d4b0);
    for (const cx of [3, w - 4]) { for (let y = 13; y < 13 + chainL; y++) g.set(cx, y, 1, y % 2 ? IR[2] : IR[4]); g.set(cx, 12, 1, IR[3]); }
    return { grid: g, pivot: [w / 2, 13 + chainL, 1.5], sway: 'down', swayAmt: 0.008 };
  },
  weaponrack(r, v) {
    const g = new PGrid(34, 34, 6);
    // two rails on brackets
    for (const y of [8, 24]) { g.box(0, y, 0, 34, 2, 2, (x, yy, z) => wood(x, yy, z, 0, 2, 2, y)); for (let x = 3; x < 34; x += 6) { g.set(x, y + 2, 2, W[4]); g.set(x, y + 2, 3, W[4]); } }
    for (const x of [1, 32]) g.box(x, 4, 0, 1, 26, 1, W[1]);
    if (v === 0) {
      sword(g, 4, 3, 3, 22, { wide: true });
      axe(g, 10, 2, 3, 26);
      sword(g, 16, 6, 3, 18, { metal: [0x6a5a2a, 0x9a8040, 0xc8a050, 0xe8c870, 0xfff0b0], guard: IR[2] });
      spear(g, 22, 0, 3, 29);
      mace(g, 28, 3, 3, 20);
    } else {
      spear(g, 4, 0, 3, 29);
      sword(g, 10, 4, 3, 20, { grip: 0x2a1a3a });
      sword(g, 16, 2, 3, 24, { wide: true, guard: IR[3], pommel: 0xc83a4a });
      axe(g, 22, 3, 3, 24);
      sword(g, 28, 8, 3, 14, { metal: [0x7a3a2a, 0xa85a3a, 0xc87a4a, 0xe8a070, 0xffd0a0] });
    }
    return { grid: g, pivot: [17, 0, 0] };
  },
  weaponbarrel(r, v) {
    const g = new PGrid(18, 34, 18);
    for (let y = 0; y < 18; y++) {
      const R = 6.4 + Math.sin((y / 17) * Math.PI) * 1.2;
      g.cylY(8.5, 8.5, R, y, y + 1, (x, yy, z) => (y === 2 || y === 15 ? IR[2] : (Math.floor((Math.atan2(z - 8.5, x - 8.5) + Math.PI) * 3.2) % 2 ? W[3] : W[2])));
    }
    g.cylY(8.5, 8.5, 5.4, 17, 18, W[0]);
    // hilts and shafts poking out at angles
    const sticks = [[6, 7, -0.25, 0.1, 'sword'], [10, 6, 0.2, -0.1, 'spear'], [8, 11, 0.05, 0.25, 'sword'], [11, 10, 0.3, 0.2, 'axe'], [5, 10, -0.2, 0.3, 'sword']];
    for (const [x, z, lx, lz, k] of sticks) {
      const top = k === 'spear' ? 33 : 26;
      g.line(x, 12, z, x + lx * 14, top - 3, z + lz * 14, k === 'sword' ? 0x4a2a1a : W[3]);
      const tx = x + lx * 14, tz = z + lz * 14;
      if (k === 'sword') { g.box(tx - 2, top - 3, tz, 5, 1, 1, BR[1]); g.box(tx, top - 2, tz, 1, 2, 1, 0x4a2a1a); g.set(tx, top, tz, BR[3]); }
      else if (k === 'spear') { g.set(tx, top - 2, tz, STEEL[2]); g.set(tx, top - 1, tz, STEEL[3]); g.set(tx, top, tz, STEEL[4]); }
      else { g.box(tx + 1, top - 6, tz, 3, 5, 1, STEEL[2]); g.box(tx + 3, top - 5, tz, 1, 3, 1, STEEL[4]); }
    }
    return { grid: g, pivot: [8.5, 0, 8.5] };
  },
  wheel(r, v) {
    const g = new PGrid(26, 26, 5);
    const c = 12.5;
    for (let y = 0; y < 26; y++) for (let x = 0; x < 26; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d > 12.4) continue;
      if (d > 10.6) { g.set(x, y, 1, d > 11.8 ? IR[2] : W[2]); g.set(x, y, 2, d > 11.8 ? IR[2] : W[3]); g.set(x, y, 3, d > 11.8 ? IR[2] : W[2]); continue; }
      if (d < 2.6) { g.box(x, y, 0, 1, 1, 5, d < 1.2 ? IR[3] : W[1]); continue; }
      const a = Math.atan2(y - c, x - c);
      for (let k = 0; k < 8; k++) { const sa = (k / 8) * Math.PI * 2; if (Math.abs(Math.sin(a - sa)) * d < 0.8 && Math.cos(a - sa) > 0) g.set(x, y, 2, W[3]); }
    }
    for (let x = 4; x < 9; x++) g.set(x, 21, 1, -1); // a broken bit of rim
    return { grid: g, pivot: [12.5, 0, 2.5] };
  },
  gramophone(r, v) {
    const g = new PGrid(20, 26, 18);
    g.box(1, 0, 2, 16, 7, 14, (x, y, z) => (y === 0 || y === 6 ? W[1] : wood(x, y, z, 0, 2, 3, 21)));
    g.cylY(9, 9, 6, 7, 8, 0x1a1418); g.set(9, 8, 9, BR[3]);
    g.line(14, 8, 4, 10, 10, 8, BR[2]);
    g.box(17, 3, 8, 2, 1, 1, BR[2]); g.box(18, 3, 8, 1, 3, 1, BR[3]); // the crank
    // the horn: a flaring cone from the tone arm up and forward
    for (let t = 0; t < 1; t += 0.03) {
      const R = 0.8 + Math.pow(t, 2.2) * 7.5, cx = 10 - t * 2, cy = 10 + t * 12, cz = 8 + t * 6;
      for (let a = 0; a < 6.283; a += 0.25 / Math.max(1, R * 0.5)) {
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * 0.7 - Math.cos(a) * 0 + 0, z = cz + Math.sin(a) * R * 0.5;
        g.set(x, y, z, Math.floor(a * 2.2) % 2 ? BR[3] : BR[2]);
      }
    }
    return { grid: g, pivot: [9, 0, 9] };
  },
  painting(r, v) {
    const g = new PGrid(26, 22, 6);
    for (let y = 0; y < 22; y++) for (let x = 0; x < 26; x++) {
      const fr = x < 2 || x > 23 || y < 2 || y > 19;
      let c;
      if (fr) c = (x + y) % 3 === 0 ? BR[3] : BR[1];
      else {
        // the surface: a sky (they've heard of it), a sun, green hills, a little tree
        const hill = 7 + Math.sin(x * 0.35) * 2 + Math.sin(x * 0.9) * 0.8;
        if (y < hill) c = y < hill - 1 ? (hv(x, y, 2, 3) < 0.3 ? 0x4a8a2a : 0x5aa83a) : 0x7ac04a;
        else if (Math.hypot(x - 18, y - 15) < 3) c = Math.hypot(x - 18, y - 15) < 2 ? 0xfff2a0 : 0xffd040;
        else c = y > 14 ? 0x5a9ae0 : 0x7ab8f0;
        if (x === 7 && y >= hill - 1 && y < hill + 3) c = 0x6a4a2a;
        if (Math.hypot(x - 7, y - (hill + 4)) < 2) c = 0x2a7a2a;
        if ((y === 12 && x > 9 && x < 13) || (y === 13 && x > 10 && x < 12)) c = 0xffffff;
      }
      g.set(x, y, 2, c);
      if (fr) g.set(x, y, 3, shade(c, 0.85));
    }
    g.box(2, 0, 0, 1, 18, 2, W[1]); g.box(23, 0, 0, 1, 18, 2, W[1]); // the stand behind
    for (let x = 4; x < 24; x += 7) g.set(x, 19, 3, -1); // a chipped frame
    return { grid: g, pivot: [13, 0, 2], s: 32 };
  },
  mannequin(r, v) {
    const g = new PGrid(18, 34, 14);
    g.cylY(9, 7, 4, 0, 1, W[1]);
    g.box(8, 1, 6, 2, 12, 2, W[2]);
    g.ell(9, 19, 7, 5.4, 7, 4, (x, y, z, dx, dy) => (dy > 0.55 ? 0xd8c8a8 : 0xc8b490));
    // a red scarf, a battered miner's helmet, a tag on a string
    for (let x = 4; x < 15; x++) for (let z = 3; z < 12; z++) if (g.has(x, 24, z) || Math.hypot(x - 9, z - 7) < 4.6) { g.set(x, 24, z, (x + z) % 3 ? 0xc83a2a : 0xe85a3a); }
    g.box(10, 18, 11, 2, 6, 1, 0xc83a2a); g.box(10, 17, 11, 2, 1, 1, 0xf2d8a0);
    g.cylY(9, 7, 1.6, 26, 28, 0xd8c8a8);
    g.ell(9, 29, 7, 4.6, 3.6, 4.6, (x, y, z, dx, dy) => (dy < -0.3 ? -1 : (dx + dy > 0.7 ? 0xffe070 : 0xd8a020)));
    g.cylY(9, 7, 5.2, 28, 29, 0xb88a18);
    g.box(8, 30, 11, 3, 2, 1, IR[2]); g.set(9, 31, 12, 0xfff2c0);
    g.line(4, 21, 7, 2, 16, 7, 0xe8e0d0); g.box(1, 13, 7, 3, 3, 1, 0xf2e8c8);
    return { grid: g, pivot: [9, 0, 7] };
  },
  chest(r, v) {
    const g = new PGrid(24, 18, 16);
    g.box(1, 0, 1, 22, 9, 14, (x, y, z) => wood(x, y, z, 0, 3, 2, 31));
    for (let a = 0; a <= Math.PI; a += 0.04) for (let x = 1; x < 23; x++) g.set(x, 9 + Math.sin(a) * 5, 8 + Math.cos(a) * 7, (x === 1 || x === 22) ? W[1] : wood(x, 0, Math.round(a * 8), 0, 3, 3, 33));
    for (let a = 0; a <= Math.PI; a += 0.04) for (let x = 2; x < 22; x++) if (x % 1 === 0) g.add(x, 9 + Math.sin(a) * 4, 8 + Math.cos(a) * 6, W[2]);
    for (const x of [4, 19]) { g.box(x, 0, 0, 2, 9, 1, IR[2]); g.box(x, 0, 15, 2, 9, 1, IR[2]); for (let a = 0; a <= Math.PI; a += 0.05) { g.set(x, 9 + Math.sin(a) * 5.4, 8 + Math.cos(a) * 7.4, IR[3]); g.set(x + 1, 9 + Math.sin(a) * 5.4, 8 + Math.cos(a) * 7.4, IR[2]); } }
    g.box(10, 5, 15, 4, 5, 1, BR[2]); g.box(11, 3, 16, 2, 3, 1, BR[3]); g.set(11, 4, 17, 0x1a1418);
    return { grid: g, pivot: [12, 0, 8], s: 32 };
  },
  stashchest(r, v) {
    const g = new PGrid(18, 16, 14);
    g.box(1, 0, 2, 16, 7, 11, (x, y, z) => wood(x, y, z, 0, 3, 2, 41));
    g.box(2, 1, 3, 14, 6, 9, 0x2a1a12);
    // heaped gold and a gem inside, the lid flung open behind
    if (v === 0) {
      for (let i = 0; i < 40; i++) { const x = 3 + r() * 12, z = 4 + r() * 7, y = 5 + r() * 2.5; g.set(x, y, z, r() < 0.5 ? BR[3] : BR[2], 1); }
      g.set(9, 7, 7, 0x4ad8ff, 3); g.set(10, 7, 7, 0x9af0ff, 3); g.set(6, 7, 6, 0xff4a6a, 2);
    } else { g.box(2, 1, 3, 14, 1, 9, 0x3a2418); g.set(5, 2, 6, BR[2], 1); g.set(11, 2, 9, 0xd8d0c0); } // emptied: a lone coin, a scrap of paper
    g.box(1, 7, 0, 16, 9, 2, (x, y, z) => wood(x, y, z, 0, 3, 3, 43));
    for (const x of [3, 14]) { g.box(x, 0, 1, 1, 7, 1, IR[2]); g.box(x, 7, 2, 1, 9, 1, IR[2]); }
    return { grid: g, pivot: [9, 0, 7], light: v === 0 ? L([1.0, 0.75, 0.3], 1.4, [0, 0.25, 0], { glow: true }) : null };
  },
  jewels(r, v) {
    const g = new PGrid(16, 6, 10);
    g.box(0, 0, 0, 16, 1, 10, 0x3a0e1a);
    g.box(0, 1, 0, 16, 1, 1, BR[1]); g.box(0, 1, 9, 16, 1, 1, BR[1]); g.box(0, 1, 0, 1, 1, 10, BR[1]); g.box(15, 1, 0, 1, 1, 10, BR[1]);
    // a pearl necklace, two rings, a pocket watch with its chain
    for (let a = 0; a < 6.28; a += 0.35) g.set(5 + Math.cos(a) * 3.4, 1, 5 + Math.sin(a) * 2.6, 0xf4f0e8, 1);
    g.set(5, 1, 8, 0x4ad8ff, 3);
    for (const [x, z, c] of [[11, 3, 0xff4a5a], [13, 6, 0x5aff8a]]) { g.set(x, 1, z, BR[3]); g.set(x + 1, 1, z, BR[3]); g.set(x, 2, z, c, 2); }
    g.cylY(11, 7.5, 2, 1, 2, BR[2]); g.set(11, 2, 7, 0xf8f4e8); g.set(11, 2, 8, 0x1a1418);
    for (let x = 12; x < 15; x++) g.set(x, 1, 8 + (x % 2), BR[3]);
    return { grid: g, pivot: [8, 0, 5] };
  },
  coatrack(r, v) {
    const g = new PGrid(18, 40, 18);
    g.box(8, 0, 8, 2, 38, 2, W[2]);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.line(9 + dx, 1, 9 + dz, 9 + dx * 6, 0, 9 + dz * 6, W[1]);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.line(9 + dx, 34, 9 + dz, 9 + dx * 4, 37, 9 + dz * 4, W[1]);
    // a long grey coat on one hook, a bowler hat on top, a striped scarf
    g.ell(13, 24, 9, 3.4, 9, 4, (x, y, z) => ((x + y) % 7 === 0 ? 0x4a4a52 : 0x5a5a66));
    g.box(13, 31, 9, 1, 3, 1, 0x4a4a52);
    g.cylY(9, 9, 4.6, 38, 39, 0x2a2228); g.ell(9, 39.5, 9, 3, 2.6, 3, 0x2a2228); g.cylY(9, 9, 3.2, 39, 40, 0x8a2a2a);
    for (let y = 20; y < 33; y++) g.set(5, y, 9 + Math.sin(y * 0.6), y % 4 < 2 ? 0x3a6ac8 : 0xe8e0d0);
    // an umbrella leaning on it (what for, down here?)
    g.line(3, 0, 13, 6, 22, 11, 0x2a2228); g.ell(5, 14, 12, 2.2, 7, 2.2, 0x3a2a4a); g.line(6, 22, 11, 7, 23, 13, W[4]);
    return { grid: g, pivot: [9, 0, 9] };
  },
  fish(r, v) {
    const g = new PGrid(30, 16, 7);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 30; x++) {
      const d = Math.hypot((x - 14.5) / 14.5, (y - 7.5) / 7.5);
      if (d > 1) continue;
      g.set(x, y, 0, d > 0.85 ? W[1] : wood(x, y, 0, 0, 3, 3, 51));
    }
    // a pale cave fish with big glassy eyes, mounted mid-leap
    g.ell(14, 8, 3, 9, 3.6, 2, (x, y, z, dx, dy) => (dy > 0.3 ? 0xd8dce0 : dy < -0.4 ? 0xf4f2ee : (x % 3 === 0 ? 0xc8ccd4 : 0xe8eaec)));
    for (let k = 0; k < 4; k++) { g.set(24 + k, 8 + k, 3, 0xc8ccd4); g.set(24 + k, 8 - k, 3, 0xc8ccd4); }
    g.set(8, 9, 5, 0x1a1a22); g.set(7, 9, 5, 0xe8f0ff); g.set(8, 10, 5, 0xe8f0ff);
    g.line(14, 11, 3, 18, 14, 3, 0xd8dce0); g.set(6, 7, 4, 0xd88a8a);
    g.box(11, 1, 1, 8, 2, 1, BR[2]);
    return { grid: g, pivot: [15, 0, 0] };
  },
  lostfound(r, v) {
    const g = new PGrid(20, 20, 17);
    g.box(0, 0, 0, 20, 11, 16, (x, y, z) => (x === 0 || x === 19 || y === 0 || y === 10 || z === 0 || z === 15 ? W[1] : wood(x, y, z, 0, 3, 3, 61)));
    g.box(1, 1, 1, 18, 10, 14, -1);
    g.box(1, 1, 1, 18, 6, 14, 0x3a2a1e);
    paintText(g, 'LOST', 3, 8, 16, 0xf0e2c0, { jitter: true });
    // junk poking out: a boot, an umbrella handle, a teddy, a frying pan
    g.box(3, 7, 4, 4, 5, 3, 0x5a3a24); g.box(3, 7, 2, 6, 2, 3, 0x4a2e1c);
    g.line(14, 6, 8, 16, 18, 6, 0x2a2228); for (let a = 0; a < 3.2; a += 0.3) g.set(16 + Math.cos(a) * 1.6, 18 + Math.sin(a) * 1.6, 6, 0x2a2228);
    g.ell(10, 11, 9, 2.6, 2.6, 2.2, 0xb88a5a); g.ell(10, 14, 9, 1.8, 1.8, 1.6, 0xc89a6a); g.set(9, 16, 9, 0xb88a5a); g.set(11, 16, 9, 0xb88a5a); g.set(10, 14, 11, 0x2a1a1a);
    g.cylY(6, 12, 3, 9, 10, IR[1]); g.line(6, 10, 12, 1, 13, 14, W[0]);
    return { grid: g, pivot: [10, 0, 8] };
  },
  cratedoor(r, v) { // the secret door, swung open (1/16 m: matches the crate-stack plug in the wall)
    const g = new PGrid(15, 21, 4);
    const rows = [[0, 8], [8, 15], [15, 21]];
    for (const [a, b] of rows) for (let y = a; y < b; y++) for (let x = 0; x < 15; x++) {
      const top = y === b - 1 || y === a, side = x === 0 || x === 14 || x === 7;
      const brace = Math.abs(((y - a) * 7) / Math.max(1, b - a - 1) - (x % 7)) < 0.8;
      for (let z = 0; z < 4; z++) g.set(x, y, z, top || side || brace ? 0x4a2e1a : (hv(x, y, z, 3) < 0.3 ? 0x80592e : 0x966a38));
    }
    for (const y of [3, 17]) { g.box(0, y, 4, 3, 1, 0, IR[3]); g.set(0, y, 3, IR[4]); g.set(1, y, 3, IR[4]); g.set(2, y, 3, IR[3]); }
    g.set(12, 10, 3, BR[3]); g.set(13, 10, 3, BR[2]);
    return { grid: g, pivot: [0, 0, 0], s: 16 };
  },
  hinges(r, v) { // the tell-tale hinges on the closed secret door
    const g = new PGrid(6, 22, 3);
    for (const y of [4, 18]) { g.box(0, y, 0, 4, 2, 1, IR[3]); g.set(4, y, 0, IR[4]); g.box(0, y, 1, 1, 2, 1, IR[4]); }
    g.box(0, 11, 0, 1, 2, 2, BR[2]);
    return { grid: g, pivot: [0, 0, 0] };
  },
  stuckpick(r, v) {
    const g = new PGrid(20, 20, 18);
    g.line(10, 6, 0, 10, 10, 14, W[3], 0, 0.6); // the handle sticking out of the wall
    g.line(4, 6, 1, 10, 6, 0, IR[3]); g.line(10, 6, 0, 16, 5, 1, IR[3]);
    // a note nailed beside it: BACK DOOR (TODO)
    g.box(1, 11, 0, 14, 8, 1, 0xf0e4c4);
    paintText(g, 'TODO', 3, 17, 1, 0x3a2a1a);
    for (let x = 3; x < 12; x++) if (hv(x, 1, 1, 3) < 0.7) g.set(x, 12, 1, 0x6a5a4a);
    g.set(8, 18, 1, IR[4]);
    return { grid: g, pivot: [10, 6, 0] };
  },

  // ---------------------------------------------------------------- the Deep Outpost
  brazier(r, v) {
    const g = new PGrid(20, 18, 20);
    for (const a of [0.4, 2.5, 4.6]) g.line(10 + Math.cos(a) * 3, 9, 10 + Math.sin(a) * 3, 10 + Math.cos(a) * 8, 0, 10 + Math.sin(a) * 8, IR[1], 0, 0.6);
    for (let y = 9; y < 15; y++) g.cylY(10, 10, 4 + (y - 9) * 0.9, y, y + 1, (x, yy, z) => (Math.hypot(x - 10, z - 10) < 3 + (y - 9) * 0.9 && y > 10 ? -1 : (x + z + yy) % 5 === 0 ? IR[3] : IR[1]));
    for (let i = 0; i < 40; i++) { const a = r() * 6.28, rr = r() * 6; g.set(10 + Math.cos(a) * rr, 13 + r() * 2, 10 + Math.sin(a) * rr, [0xe84a10, 0xf07a20, 0xf0a040, 0x3a2a24, 0x5a3a2a][Math.floor(r() * 5)], 2); }
    return { grid: g, pivot: [10, 0, 10], light: L([0.95, 0.45, 0.18], 4.2, [0, 0.6, 0], { fire: true }) };
  },
  sandbags(r, v) {
    const g = new PGrid(40, 22, 14);
    const bag = (x, y, z, w) => g.ell(x, y, z, w / 2, 2.6, 4.4, (xx, yy, zz, dx, dy) => (dy > 0.5 ? BURLAP[3] : (xx + yy * 2) % 6 === 0 ? BURLAP[1] : BURLAP[2]));
    let y = 2.6;
    for (let row = 0; row < 4; row++) {
      const n = 4 - (row > 2 ? 1 : 0), w = 10, off = row % 2 ? 5 : 0;
      for (let i = 0; i < n; i++) bag(5 + off + i * w + (v ? row % 2 : 0), y, 7 + (hv(i, row, v, 3) - 0.5) * 2, w + 0.6);
      y += 4.6;
    }
    return { grid: g, pivot: [20, 0, 7] };
  },
  blanket(r, v) {
    const g = new PGrid(36, 6, 18);
    g.box(0, 0, 1, 34, 2, 16, (x, y, z) => (x > 8 && x < 12 ? 0xb83a2a : (x + z) % 9 === 0 ? 0x5a5e66 : 0x6a6e78));
    g.box(14, 2, 1, 20, 1, 16, (x, y, z) => (x > 26 && x < 29 ? 0xb83a2a : 0x7a7e88));
    g.ell(4, 3, 9, 4, 2, 6, 0xe8e0cc); // the pillow
    g.box(30, 3, 4, 4, 2, 10, 0x6a6e78);
    return { grid: g, pivot: [17, 0, 9] };
  },
  maptable(r, v) {
    const g = new PGrid(18, 4, 28);
    g.box(0, 0, 0, 18, 1, 28, (x, y, z) => wood(x, y, z, 2, 3, 2, 71));
    // a map: parchment with inked tunnels, the outpost circled, red pins, a brass compass
    for (let z = 2; z < 26; z++) for (let x = 1; x < 17; x++) g.set(x, 1, z, hv(x >> 2, 0, z >> 2, 73) < 0.3 ? 0xd8c8a0 : 0xe8dab4);
    let x = 3, z = 4;
    for (let i = 0; i < 40; i++) { g.set(x, 1, z, 0x4a3a2a); x += r() < 0.5 ? (r() < 0.5 ? 1 : -1) : 0; z += 1; if (z > 24) { z = 4; x = 4 + r() * 10; } x = Math.max(2, Math.min(15, x)); }
    for (let a = 0; a < 6.28; a += 0.3) g.set(11 + Math.cos(a) * 2.5, 1, 18 + Math.sin(a) * 2.5, 0xb83a2a);
    for (const [px, pz] of [[5, 8], [12, 11], [7, 21]]) { g.set(px, 2, pz, 0xe83a3a); g.set(px, 1, pz, 0x8a8a8a); }
    g.cylY(14, 5, 2, 1, 2, BR[2]); g.set(14, 2, 5, 0xf0f0f0); g.set(14, 2, 4, 0xd83a2a);
    return { grid: g, pivot: [9, 0, 14] };
  },
  banner(r, v) {
    const g = new PGrid(26, 36, 3);
    g.box(0, 34, 1, 26, 1, 1, W[2]); g.set(0, 34, 1, BR[3]); g.set(25, 34, 1, BR[3]);
    for (let y = 2; y < 34; y++) for (let x = 3; x < 23; x++) {
      const tip = y < 8 && Math.abs(x - 12.5) > (y - 2) * 1.6 + 0.5;
      if (tip) continue;
      g.set(x, y, 1, x === 3 || x === 22 ? 0xd8a030 : (y % 6 === 0 && x % 2 ? 0x6a1a1a : 0x8a2420));
    }
    // crossed picks in gold
    for (let k = -6; k <= 6; k++) { g.set(12.5 + k, 20 + k, 2, BR[3]); g.set(12.5 + k, 20 - k, 2, BR[3]); }
    for (const s of [-1, 1]) for (let k = -3; k <= 3; k++) { g.set(12.5 + s * 6 + k * 0.5 * s, 26 + Math.abs(k) * -0.5, 2, IR[4]); g.set(12.5 + s * 6 + k * 0.5 * s, 14 + Math.abs(k) * 0.5, 2, IR[4]); }
    for (let x = 4; x < 22; x += 3) g.set(x, 33, 2, 0xd8a030);
    return { grid: g, pivot: [13, 0, 0], sway: (x, y) => Math.max(0, (34 / 32 - y) / 1.1), swayAmt: 0.01 };
  },
  stove(r, v) {
    const g = new PGrid(20, 48, 20);
    for (let y = 0; y < 22; y++) {
      const R = y < 2 ? 6.5 : y > 19 ? 6 : 5.6 + Math.sin(((y - 2) / 18) * Math.PI) * 1.8;
      g.cylY(10, 10, R, y, y + 1, (x, yy, z) => (y < 2 || y === 12 || y > 19 ? IR[2] : (x + z) % 5 === 0 ? IR[2] : IR[1]));
    }
    // the glowing grate, a kettle on top, the flue going up into the dark
    g.box(7, 4, 16, 6, 5, 2, (x, y) => ((x + y) % 2 ? 0xff8a20 : 0x3a2a24), 3);
    g.ell(10, 25, 9, 3.6, 2.6, 3.6, STEEL[2]); g.set(10, 28, 9, STEEL[3]); g.line(13, 25, 9, 16, 27, 9, STEEL[2]);
    g.cylY(14, 13, 1.6, 22, 48, (x, y) => (y % 8 === 0 ? IR[3] : IR[1]));
    return { grid: g, pivot: [10, 0, 10], light: L([1.1, 0.5, 0.2], 2.6, [0, 0.2, 0.25], { fire: true }) };
  },

  // ---------------------------------------------------------------- signs over the doors (p = burrow kind)
  signboard(r, v, p) {
    const S = {
      trader: { text: 'TRADING POST', board: [0x6a4424, 0x8a5a32], ink: 0xf0d890, edge: W[0] },
      herbalist: { text: 'HERBALIST', board: [0x2c4a2a, 0x3a5e36], ink: 0xf0ecd0, edge: W[1] },
      raccoon: { text: 'STORAGE', sub: 'NO QUESTIONS', board: [0x3a3442, 0x4a4454], ink: 0xe8e0c8, edge: W[0] },
      outpost: { text: 'DEEP OUTPOST', board: [0x5a2a1e, 0x6e3424], ink: 0xf2e2b0, edge: IR[1] },
    }[p] || { text: 'BURROW', board: [W[2], W[3]], ink: 0xf0e0b0, edge: W[0] };
    const lines = S.sub ? [S.text, S.sub] : [S.text];
    const icon = 11;
    const tw = Math.max(...lines.map(textWidth));
    const w = tw + icon + 9, h = lines.length * 7 + 6;
    const bracket = 6;
    const g = new PGrid(w, h + bracket + 1, 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
      const edge = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      const c = edge ? S.edge : (Math.floor(y / 3) % 2 ? S.board[0] : S.board[1]);
      g.set(x, y, 1, hv(x, y, 2, 7) < 0.05 && !edge ? shade(c, 1.15) : c);
      g.set(x, y, 0, S.edge);
    }
    let ty = h - 4;
    for (const ln of lines) { paintText(g, ln, icon + 4 + Math.floor((tw - textWidth(ln)) / 2), ty, 2, (x, y) => (hv(x, y, 5, 3) < 0.1 ? shade(S.ink, 0.8) : S.ink), { jitter: p === 'raccoon' }); ty -= 7; }
    // the icon: scales, a leaf, a key, crossed picks
    const ic = (x, y, c, gl = 0) => g.set(3 + x, Math.round(h / 2 - 4) + y, 2, c, gl);
    if (p === 'trader') { for (let x = 0; x < 9; x++) ic(x, 6, BR[3]); for (let y = 0; y < 8; y++) ic(4, y, BR[2]); for (const x of [0, 1, 2, 6, 7, 8]) ic(x, 2, BR[3]); ic(1, 3, BR[2]); ic(7, 3, BR[2]); ic(3, 0, BR[1]); ic(5, 0, BR[1]); }
    else if (p === 'herbalist') { for (let k = 0; k < 8; k++) { ic(k, k, 0x7ac04a); ic(k + 1, k, 0x5aa83a); if (k < 7) ic(k, k + 1, 0x8ad05a); if (k > 1 && k < 7) { ic(k - 1, k + 1, 0x6ab84a); ic(k + 2, k - 1, 0x4a9a3a); } } }
    else if (p === 'raccoon') { for (let a = 0; a < 6.28; a += 0.4) ic(2 + Math.round(Math.cos(a) * 2), 5 + Math.round(Math.sin(a) * 2), BR[3]); for (let x = 4; x < 9; x++) ic(x, 5, BR[2]); ic(7, 4, BR[2]); ic(8, 3, BR[2]); }
    else { for (let k = 0; k < 9; k++) { ic(k, k, IR[4]); ic(8 - k, k, IR[4]); } ic(0, 7, IR[3]); ic(1, 8, IR[3]); ic(7, 8, IR[3]); ic(8, 7, IR[3]); }
    // hung from an iron bracket on two little chains
    g.box(0, h + bracket, 0, w, 1, 2, IR[1]);
    for (const cx of [3, w - 4]) for (let y = h; y < h + bracket; y++) g.set(cx, y, 1, y % 2 ? IR[2] : IR[4]);
    return { grid: g, pivot: [w / 2, h + bracket + 1, 0], sway: 'down', swayAmt: 0.006 };
  },
});


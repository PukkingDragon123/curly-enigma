// The lift panel as a cross-section of the earth: the surface (sky, the meadow, the tavern and
// the lift's head-frame) at the top, then every stratum down to the Core: the six zones with
// their own rock, seams of gravel, shale, obsidian and crust between them, fossils, roots,
// crystals, lava pockets, ice and star ore. The shaft runs down the middle with the cable in it;
// every known lift is a lit stop at its depth (tap its tag to ride), unknown lifts are "?" pins in
// the rock, and the lift you're standing at says "you are here". Drawn once into a small canvas
// (one canvas pixel = one --px), labels are DOM buttons over it; the whole thing scrolls.
import { el, makeNoise2D, makeRng, clamp, mixHex, shade } from '../core/util.js';
import { PixelCanvas } from '../gfx/PixelArt.js';
import { ZONES } from '../data/zones.js';
import './liftPanel.css';

/** Zone n spans [n-1]..[n] metres down. Mirrors ZONE_DEPTHS in deep/Generator.js (where the lifts are). */
export const LIFT_ZONE_DEPTHS = [0, 25, 55, 90, 130, 170, 210];

const CW = 164; // canvas width in --px
const SX = 62; // the shaft's centre
const GROUND = 40; // the grass line (0 m)
const PXM = [2.4, 2.0, 1.9, 1.8, 1.8, 1.8]; // canvas px per metre in each zone
const CORE_PAD = 26; // the glowing heart below the last stratum

const hex = (s) => parseInt(String(s).replace('#', ''), 16);
const mixHexCss = (c, t) => '#' + mixHex(hex(c), 0xfff4e0, t).toString(16).padStart(6, '0');
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Depth (m) → canvas y, and back. */
function makeScale() {
  const tops = [GROUND];
  for (let z = 1; z <= 6; z++) tops.push(tops[z - 1] + (LIFT_ZONE_DEPTHS[z] - LIFT_ZONE_DEPTHS[z - 1]) * PXM[z - 1]);
  const y = (d) => {
    if (d <= 0) return GROUND + d * PXM[0];
    for (let z = 1; z <= 6; z++) if (d <= LIFT_ZONE_DEPTHS[z] || z === 6) return tops[z - 1] + (d - LIFT_ZONE_DEPTHS[z - 1]) * PXM[z - 1];
    return tops[6];
  };
  const depth = (yy) => {
    if (yy <= GROUND) return 0;
    for (let z = 1; z <= 6; z++) if (yy <= tops[z] || z === 6) return LIFT_ZONE_DEPTHS[z - 1] + (yy - tops[z - 1]) / PXM[z - 1];
    return LIFT_ZONE_DEPTHS[6];
  };
  return { y, depth, tops, H: Math.ceil(tops[6] + CORE_PAD) };
}

// ------------------------------------------------------------------ the strata
const SEAMS = [
  null,
  { a: 0x6a5a48, b: 0x8a7a64, spot: 0xa89c88 }, // gravel (rootsoil | clay)
  { a: 0x4a4650, b: 0x5e5a66, spot: 0x76727e }, // shale (clay | grotto)
  { a: 0x1e1622, b: 0x2e2234, spot: 0x8a5ac8 }, // obsidian (grotto | magma)
  { a: 0x4a2a26, b: 0x5e3630, spot: 0xc85a2a }, // cooling crust (magma | frost)
  { a: 0x2a2244, b: 0x3a2e5a, spot: 0xd8c8ff }, // void seam (frost | core)
];

function zonePalette(z) {
  const base = hex(ZONES[z].color);
  if (z === 1) return [0x6a4628, 0x5a3c22, 0x7a5232, 0x4e341e];
  if (z === 2) return [0xa4562e, 0xb8673a, 0x8e4a28, 0xc87a48];
  if (z === 3) return [0x4e5476, 0x5c6488, 0x444a68, 0x6a7296];
  if (z === 4) return [0x3a2a2c, 0x4a3232, 0x2e2226, 0x56383a];
  if (z === 5) return [0x9ac8e0, 0xb8dcec, 0x82b4d4, 0xd4ecf6];
  if (z === 6) return [0x4a2e6a, 0x5a3a7e, 0x3e2658, 0x6a48a0];
  return [base, shade(base, 0.9), shade(base, 1.1), shade(base, 0.8)];
}

/** The rock everywhere, before any details. */
function paintStrata(pc, S, seed) {
  const n1 = makeNoise2D(seed + 1), n2 = makeNoise2D(seed + 2), n3 = makeNoise2D(seed + 3);
  const pals = [null, 1, 2, 3, 4, 5, 6].map((z) => (z ? zonePalette(z) : null));
  for (let y = GROUND; y < S.H; y++) {
    for (let x = 0; x < CW; x++) {
      // wavy strata: shift the depth by a slow wave so boundaries undulate
      const wy = y + n1(x * 0.045, y * 0.004) * 3.2 + n2(x * 0.15, y * 0.02) * 0.8;
      const d = S.depth(wy);
      let z = 1;
      while (z < 6 && d > LIFT_ZONE_DEPTHS[z]) z++;
      const P = pals[z];
      const local = wy - S.tops[z - 1];
      const h = hash(x, y, 7);
      // sub-strata inside every zone: bands of the four tones, a darker line between some
      const bandH = z === 2 ? 4 : z === 5 ? 5 : z === 6 ? 7 : 6;
      const bw = local / bandH + n3(x * 0.04, z * 3.1) * 0.9;
      const band = Math.floor(bw);
      let c = P[((band % 4) + 4) % 4];
      if (bw - band < 0.12 && z !== 6) c = shade(c, 0.82);
      // texture: speckle, patches
      if (h < 0.06) c = shade(c, z === 5 ? 0.94 : 0.86);
      else if (h > 0.95) c = shade(c, z === 5 ? 1.04 : 1.14);
      if (z === 6) { // the core swirls
        const sw = Math.sin(x * 0.12 + Math.sin(y * 0.09) * 2.2 + y * 0.05);
        if (sw > 0.82) c = P[3]; else if (sw < -0.85) c = P[2];
      }
      if (z === 4 && (x + Math.floor(local / 9)) % 6 === 0 && h < 0.7) c = shade(c, 0.78); // basalt columns
      if (z === 5 && h > 0.985) c = 0xffffff; // frost glints
      // seams between the zones
      for (let s = 1; s <= 5; s++) {
        const sd = wy - S.tops[s];
        const half = 2.6 + n3(x * 0.07, s) * 1.2;
        if (Math.abs(sd) < half) {
          const M = SEAMS[s];
          c = (Math.floor(sd + 10) & 1) ? M.a : M.b;
          if (h > 0.9) c = M.spot;
          if (Math.abs(Math.abs(sd) - half) < 0.6) c = shade(c, 0.7);
        }
      }
      // topsoil just under the grass
      if (y < GROUND + 3) c = y === GROUND ? 0x3e2a1a : h < 0.5 ? 0x4a3220 : 0x553a24;
      pc.set(x, y, c);
    }
  }
}

// small pixel motifs: [dx, dy, colour]
function stamp(pc, x, y, pts) { for (const [dx, dy, c] of pts) pc.set(x + dx, y + dy, c); }

function ammonite(pc, x, y) {
  const C = 0xeadcb4, D = 0xb8a47a;
  stamp(pc, x, y, [[1, 0, C], [2, 0, C], [3, 0, C], [0, 1, C], [4, 1, C], [0, 2, C], [2, 2, D], [3, 2, C], [4, 2, C], [0, 3, C], [4, 3, D], [1, 4, C], [2, 4, C], [3, 4, D]]);
}
function fishBones(pc, x, y) {
  const C = 0xe8dcc0;
  for (let i = 0; i < 7; i++) pc.set(x + i, y + 1, C);
  for (let i = 1; i < 6; i += 2) { pc.set(x + i, y, C); pc.set(x + i, y + 2, C); }
  stamp(pc, x, y, [[7, 0, C], [7, 2, C], [8, 1, C], [-1, 0, C], [-1, 2, C]]);
}
function bone(pc, x, y) {
  const C = 0xf2ead6;
  stamp(pc, x, y, [[0, 0, C], [0, 2, C], [1, 1, C], [2, 1, C], [3, 1, C], [4, 1, C], [5, 0, C], [5, 2, C]]);
}
function crystal(pc, x, y, hgt, c, hi) {
  for (let k = 0; k < hgt; k++) { pc.set(x, y - k, k > hgt - 2 ? hi : c); if (k < hgt - 2) pc.set(x + 1, y - k, shade(c, 0.8)); }
}
function snowflake(pc, x, y) {
  const C = 0xffffff, B = 0xbfe6ff;
  stamp(pc, x, y, [[2, 0, B], [2, 1, C], [0, 2, B], [1, 2, C], [2, 2, C], [3, 2, C], [4, 2, B], [2, 3, C], [2, 4, B], [1, 1, B], [3, 3, B], [3, 1, B], [1, 3, B]]);
}
function star(pc, x, y, c, hi) {
  stamp(pc, x, y, [[2, 0, hi], [1, 1, c], [2, 1, hi], [3, 1, c], [0, 2, c], [1, 2, hi], [2, 2, 0xffffff], [3, 2, hi], [4, 2, c], [1, 3, c], [2, 3, hi], [3, 3, c], [2, 4, c]]);
}
function glyphQ(pc, x, y, c) { // a 3x5 "?"
  stamp(pc, x, y, [[0, 0, c], [1, 0, c], [2, 0, c], [2, 1, c], [1, 2, c], [2, 2, c], [1, 4, c]]);
}

/** Roots, fossils, crystals, lava, ice, star ore... Keeps clear of the shaft. */
function paintDetails(pc, S, seed, avoid) {
  const rng = makeRng(seed * 7 + 3);
  const free = (x, y, w, h) => x > 1 && x + w < CW - 1 && (x + w < SX - 5 || x > SX + 5) && !avoid.some((a) => x < a.x1 && x + w > a.x0 && y < a.y1 && y + h > a.y0);
  const inZone = (z) => [Math.round(S.tops[z - 1] + 5), Math.round(S.tops[z] - 5)];
  const place = (z, n, w, h, fn) => {
    const [y0, y1] = inZone(z);
    for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
      const x = Math.round(rng.range(2, CW - w - 2)), y = Math.round(rng.range(y0, Math.max(y0, y1 - h)));
      if (!free(x, y, w, h)) continue;
      fn(x, y, i);
      avoid.push({ x0: x - 2, x1: x + w + 2, y0: y - 2, y1: y + h + 2 });
      i++;
    }
  };
  // rootsoil: roots hanging from the meadow, pebbles, a bone, a worm
  for (let r = 0; r < 9; r++) {
    let x = rng.range(4, CW - 4);
    if (Math.abs(x - SX) < 8) continue;
    const len = rng.range(8, 34);
    for (let k = 0; k < len; k++) {
      const y = GROUND + 2 + k;
      x += rng.range(-0.6, 0.6);
      if (Math.abs(x - SX) < 5) break;
      pc.set(x, y, k < len * 0.5 ? 0x9a7650 : 0x8a6a46);
      if (k < len * 0.3) pc.set(x + 1, y, 0x7e5e40);
      if (rng.chance(0.12)) { const s = rng.chance(0.5) ? 1 : -1; pc.set(x + s, y + 1, 0x9a7650); pc.set(x + s * 2, y + 2, 0x8a6a46); }
    }
  }
  place(1, 1, 6, 3, (x, y) => bone(pc, x, y));
  place(1, 1, 7, 3, (x, y) => { for (let k = 0; k < 7; k++) pc.set(x + k, y + Math.round(Math.sin(k * 1.3)), 0xe88a9a); });
  place(1, 10, 2, 2, (x, y) => { pc.set(x, y, 0x9a9284); pc.set(x + 1, y, 0x8a8278); pc.set(x, y + 1, 0x7a7268); });
  // clayworks: ammonites, a fish, a water pocket, amber, a buried pot
  place(2, 3, 5, 5, (x, y) => ammonite(pc, x, y));
  place(2, 1, 9, 3, (x, y) => fishBones(pc, x, y));
  place(2, 1, 12, 5, (x, y) => {
    for (let j = 0; j < 5; j++) for (let i = 0; i < 12; i++) {
      const e = ((i - 5.5) / 6) ** 2 + ((j - 2) / 2.6) ** 2;
      if (e < 1) pc.set(x + i, y + j, j === 0 ? 0x2a4a6a : j === 1 ? 0x8ac8f0 : 0x3a78b0);
    }
  });
  place(2, 3, 2, 2, (x, y) => { pc.set(x, y, 0xffb030); pc.set(x + 1, y, 0xe08a20); pc.set(x, y + 1, 0xd07a18); pc.set(x + 1, y + 1, 0xffd060); });
  place(2, 1, 5, 5, (x, y) => { stamp(pc, x, y, [[1, 0, 0x8a4a2a], [2, 0, 0x8a4a2a], [3, 0, 0x8a4a2a], [0, 1, 0xa85a32], [1, 1, 0xc87a48], [2, 1, 0xe8b070], [3, 1, 0xc87a48], [4, 1, 0xa85a32], [0, 2, 0xa85a32], [1, 2, 0xb8683a], [2, 2, 0xb8683a], [3, 2, 0xb8683a], [4, 2, 0xa85a32], [1, 3, 0x8a4a2a], [2, 3, 0x8a4a2a], [3, 3, 0x8a4a2a]]); });
  // crystal grotto: clusters and a geode
  place(3, 6, 7, 7, (x, y, i) => {
    const [c, hi] = i % 3 === 0 ? [0xd06ad8, 0xffd0ff] : i % 3 === 1 ? [0x5ac8f0, 0xe0f8ff] : [0x7ae0c0, 0xe8fff4];
    for (let k = 0; k < 3; k++) crystal(pc, x + k * 2, y + 6, 3 + ((k * 7 + i) % 4), c, hi);
  });
  place(3, 1, 11, 9, (x, y) => {
    for (let j = 0; j < 9; j++) for (let i = 0; i < 11; i++) {
      const e = ((i - 5) / 5.5) ** 2 + ((j - 4) / 4.5) ** 2;
      if (e < 1) pc.set(x + i, y + j, e > 0.62 ? 0x8a8296 : e > 0.38 ? (hash(i, j, 3) < 0.5 ? 0xc8a0ff : 0x9a6ae0) : 0x1a1426);
    }
  });
  // magma deep: lava veins, pools, embers
  const [m0, m1] = inZone(4);
  for (let v = 0; v < 4; v++) {
    let x = rng.range(4, CW - 6), y = rng.range(m0, m1);
    for (let k = 0; k < 40; k++) {
      x += rng.range(-1.2, 1.2) + 0.4; y += rng.range(-0.6, 1.1);
      if (y > m1 + 4 || x > CW - 2) break;
      if (Math.abs(x - SX) < 5) continue;
      pc.set(x, y, k % 5 === 0 ? 0xffe070 : 0xff7a20);
    }
  }
  place(4, 3, 10, 5, (x, y) => {
    for (let j = 0; j < 5; j++) for (let i = 0; i < 10; i++) {
      const e = ((i - 4.5) / 5) ** 2 + ((j - 2.5) / 2.6) ** 2;
      if (e < 1) pc.set(x + i, y + j, j === 0 ? 0x2a1a1a : e < 0.3 ? 0xfff0a0 : e < 0.6 ? 0xffb030 : 0xe8501a);
    }
  });
  place(4, 12, 1, 1, (x, y) => pc.set(x, y, rng.chance(0.5) ? 0xff5a20 : 0xffc040));
  // frost vault: snowflakes, a frozen fish, an ice cave with icicles
  place(5, 4, 5, 5, (x, y) => snowflake(pc, x, y));
  place(5, 1, 9, 3, (x, y) => { fishBones(pc, x, y); pc.set(x + 3, y + 1, 0x4a8ab0); });
  place(5, 1, 14, 7, (x, y) => {
    for (let j = 0; j < 7; j++) for (let i = 0; i < 14; i++) {
      const e = ((i - 6.5) / 7) ** 2 + ((j - 3) / 3.4) ** 2;
      if (e < 1) pc.set(x + i, y + j, 0x2a4a6a);
    }
    for (let i = 2; i < 12; i += 2) { const L = 1 + ((i * 3) % 3); for (let k = 0; k < L; k++) pc.set(x + i, y + 1 + k, 0xe8f8ff); }
  });
  // the core: star ore
  place(6, 7, 5, 5, (x, y, i) => star(pc, x, y, i % 2 ? 0xffd040 : 0xb070ff, i % 2 ? 0xfff4b0 : 0xf0d0ff));
  place(6, 10, 1, 1, (x, y) => pc.set(x, y, 0xffffff));
}

// the surface and the top of the earth (canvas px)
const HOME_DEPTH = 5; // Old Star's cave, a few metres under the clearing
const HOLE_X = SX - 19; // where the mole fell in
const WAYUP_X = SX - 38; // the Surface Express shaft up from Deep Town (locked: a million gold)

function pine(pc, x, base, h, P) {
  // P: [dark, mid, light, trunk]
  for (let y = base - 3; y < base; y++) pc.set(x, y, P[3]);
  for (let r = 0; r < h; r++) {
    const y = base - h - 2 + r;
    const half = Math.floor(r * 0.34 + (r % 4) * 0.35);
    for (let i = -half; i <= half; i++) {
      const c = i < -half * 0.3 ? P[0] : i > half * 0.45 ? P[2] : P[1];
      pc.set(x + i, y, (r % 4 === 3 && Math.abs(i) === half) ? P[0] : c);
    }
  }
}

function oak(pc, x, base, w, h, P) {
  for (let y = base - h * 0.45; y < base; y++) { pc.set(x, y, P[3]); pc.set(x + 1, y, shade(P[3], 1.15)); }
  const cy = base - h * 0.62;
  for (let j = -h * 0.42; j <= h * 0.42; j++) for (let i = -w; i <= w; i++) {
    const e = (i / w) ** 2 + (j / (h * 0.42)) ** 2 + (hash(x + i, Math.round(cy + j), 3) - 0.5) * 0.25;
    if (e >= 1) continue;
    pc.set(x + i, cy + j, i - j > w * 0.35 ? P[2] : e > 0.62 && i < 0 ? P[0] : P[1]);
  }
}

/** Sky, far hills, the forest, the clearing with the broken ground and the chest. */
function paintSurface(pc, wayUp) {
  // sky: dithered bands from deep blue to a warm horizon
  const SKY = [0x3a64c0, 0x4a78d0, 0x5e8cdc, 0x76a2e6, 0x92b8ec, 0xb0ccee, 0xd4dce8, 0xf2dcc0, 0xffd8a8];
  for (let y = 0; y < GROUND; y++) {
    const t = y / (GROUND - 1) * (SKY.length - 1);
    for (let x = 0; x < CW; x++) {
      const k = Math.min(SKY.length - 1, Math.floor(t + ((x + y * 2) % 4) / 4 * 0.9));
      pc.set(x, y, SKY[k]);
    }
  }
  // the sun, low on the right
  const sx = CW - 26, sy = 13;
  for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
    const d = Math.hypot(x, y);
    if (d < 3.6) pc.set(sx + x, sy + y, 0xfffbe8);
    else if (d < 5.2 && (x + y) % 2 === 0) pc.set(sx + x, sy + y, 0xffe8b0);
    else if (d < 7 && (x + y * 3) % 4 === 0) pc.set(sx + x, sy + y, 0xffdca0);
  }
  const cloud = (cx, cy, w) => {
    for (let y = -3; y <= 1; y++) for (let x = -w; x <= w; x++) {
      const e = (x / w) ** 2 + ((y + 1) / (y < -1 ? 2.2 : 3)) ** 2 + Math.sin(x * 0.9) * 0.08;
      if (e < 1) pc.set(cx + x, cy + y, y >= 0 ? 0xd8d8e8 : y === -3 ? 0xffffff : 0xf6f2f0);
    }
  };
  cloud(24, 7, 9); cloud(92, 5, 7); cloud(140, 15, 5);
  for (const [bx, by] of [[70, 9], [76, 6], [81, 10]]) stamp(pc, bx, by, [[0, 0, 0x2a2a40], [1, 1, 0x2a2a40], [2, 0, 0x2a2a40]]);
  // far mountains, hazy
  for (let x = 0; x < CW; x++) {
    const h1 = Math.round(11 + Math.sin(x * 0.05) * 4 + Math.sin(x * 0.17 + 2) * 1.6);
    for (let k = 0; k < h1; k++) pc.set(x, GROUND - 6 - k, k === h1 - 1 ? 0xa8c0cc : k > h1 - 4 && (x + k) % 5 === 0 ? 0xc8d8e0 : 0x92aab8);
  }
  // the forest: a hazy back row, then darker rows in front; the clearing in the middle
  const clear0 = HOLE_X - 12, clear1 = SX + 4;
  const back = [0x5a8a80, 0x6a9a8a, 0x86b09a, 0x4a6a5a];
  const mid = [0x2e5a3a, 0x3e7044, 0x5a8e4e, 0x4a3424];
  const front = [0x1e4a2c, 0x2e6236, 0x4e8a3e, 0x3e2a1c];
  for (let x = 2; x < CW; x += 5) pine(pc, x + (hash(x, 1, 21) * 3 | 0), GROUND - 5, 10 + (hash(x, 2, 21) * 7 | 0), back);
  for (let x = 4; x < CW; x += 9) {
    const xx = x + (hash(x, 3, 21) * 4 | 0);
    if (xx > clear0 - 2 && xx < clear1 + 2) continue;
    if (hash(x, 4, 21) < 0.35) oak(pc, xx, GROUND - 3, 5, 15, [0x2e5a2e, 0x3e7a3a, 0x6aa04a, 0x5a3e28]);
    else pine(pc, xx, GROUND - 3, 15 + (hash(x, 5, 21) * 8 | 0), mid);
  }
  for (let x = 1; x < CW; x += 13) {
    const xx = x + (hash(x, 6, 21) * 5 | 0);
    if (xx > clear0 - 6 && xx < clear1 + 6) continue;
    pine(pc, xx, GROUND - 1, 22 + (hash(x, 7, 21) * 9 | 0), front);
  }
  // light shafts slanting through the canopy
  for (let y = 4; y < GROUND - 1; y++) for (let x = 0; x < CW; x++) {
    const u = x + (y * 0.6);
    const band = (u % 31) < 3.2 && (u % 62) < 31;
    if (band && (x + y) % 2 === 0 && y > 10) pc.set(x, y, mixHex(pc.getHex(x, y), 0xfff0c0, 0.35));
  }
  // the grass, flowers, the clearing
  for (let x = 0; x < CW; x++) {
    pc.set(x, GROUND - 2, 0x5aa83c); pc.set(x, GROUND - 1, 0x4a9030);
    if (hash(x, 1, 5) < 0.45) pc.set(x, GROUND - 3, 0x6ab84a);
    if (hash(x, 2, 5) < 0.14) pc.set(x, GROUND - 4, 0x7ac458);
    if (hash(x, 3, 5) < 0.06) pc.set(x, GROUND - 4, [0xfff6e8, 0xffe066, 0xff8ad0, 0xe84a3a][(x * 7) % 4]);
  }
  // a fallen log, a mushroom ring
  for (let x = clear1 + 2; x < clear1 + 9; x++) { pc.set(x, GROUND - 3, 0x6a4a30); pc.set(x, GROUND - 4, x % 3 ? 0x7a5a3a : 0x8a6a48); }
  for (const dx of [-8, -5, 6]) { pc.set(HOLE_X + dx, GROUND - 3, 0xe8e0d0); pc.set(HOLE_X + dx, GROUND - 4, 0xd84a3a); pc.set(HOLE_X + dx + 1, GROUND - 4, 0xd84a3a); }
  // the strange chest at the lip of the hole, spilling gold and gems
  const cx = HOLE_X + 4, cy = GROUND - 3;
  pc.rect(cx, cy - 3, 6, 4, 0x6a4024);
  pc.rect(cx, cy - 4, 6, 1, 0x8a5a32);
  pc.set(cx, cy - 3, 0xd8a840); pc.set(cx + 5, cy - 3, 0xd8a840); pc.set(cx + 2, cy - 2, 0xffe070); pc.set(cx + 3, cy - 2, 0xd8a840);
  for (const [dx, dy, c] of [[-1, 1, 0xffd040], [-2, 2, 0xffe070], [-1, 2, 0xd8a840], [1, 1, 0x5ae0ff], [6, 1, 0xff4a6a], [7, 1, 0xffd040], [-3, 3, 0xffd040]]) pc.set(cx + dx, cy + dy - 1, c);
  pc.set(cx + 3, cy - 5, 0xffffff); pc.set(cx + 2, cy - 6, 0xfff4b0); pc.set(cx + 4, cy - 6, 0xfff4b0); pc.set(cx + 3, cy - 7, 0xfff4b0);
  // the way up (once Deep Town is known): a locked gate in the grass over the express shaft
  if (wayUp) {
    for (let x = WAYUP_X - 4; x <= WAYUP_X + 4; x++) { pc.set(x, GROUND - 2, 0x5a5a62); pc.set(x, GROUND - 3, (x - WAYUP_X) % 2 ? 0x8a8a94 : 0x5a5a62); }
    for (const dx of [-4, 4]) for (let y = GROUND - 8; y < GROUND - 2; y++) pc.set(WAYUP_X + dx, y, 0x6a4428);
    for (let x = WAYUP_X - 4; x <= WAYUP_X + 4; x++) pc.set(x, GROUND - 8, 0x7a5232);
    stamp(pc, WAYUP_X - 1, GROUND - 7, [[0, 0, 0xd8a840], [1, -1, 0xd8a840], [2, 0, 0xd8a840], [0, 1, 0xf2c23a], [1, 1, 0xf2c23a], [2, 1, 0xf2c23a], [0, 2, 0xf2c23a], [1, 2, 0x3a2008], [2, 2, 0xf2c23a]]);
  }
}

/** Under the clearing: the hole he fell through, Old Star's cave workshop, the express shaft. */
function paintHome(pc, S, wayUp, townY) {
  const hy = Math.round(S.y(HOME_DEPTH));
  const x0 = SX - 32, x1 = SX + 7, cyT = hy - 7, cyB = hy + 5;
  // the cave pocket
  for (let y = cyT - 1; y <= cyB + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    const e = ((x - (x0 + x1) / 2) / ((x1 - x0) / 2 + 0.5)) ** 2 + ((y - (cyT + cyB) / 2) / ((cyB - cyT) / 2 + 0.5)) ** 4 + (hash(x, y, 31) - 0.5) * 0.12;
    if (e < 1) {
      // lamplit rock: warmer toward the forge on the left
      const warm = clamp(1 - (x - x0) / (x1 - x0) * 1.3, 0, 1);
      const c = y > cyB - 2 ? 0x3a2618 : e > 0.75 ? 0x24160e : 0x33200f;
      pc.set(x, y, mixHex(c, 0x6a3a1a, warm * (e < 0.75 ? 0.45 : 0.2)));
    }
    else if (e < 1.18) pc.set(x, y, shade(pc.getHex(x, y), 0.6));
  }
  // the floor, stalactites, glow-worms on the ceiling
  for (let x = x0 + 2; x < x1 - 1; x++) pc.set(x, cyB, x % 3 ? 0x4a3424 : 0x3a281c);
  for (let x = x0 + 4; x < x1 - 2; x += 5) { pc.set(x, cyT + 1, 0x3a2a20); if (x % 2) pc.set(x, cyT + 2, 0x3a2a20); }
  for (let x = x0 + 3; x < x1 - 2; x += 3) if (hash(x, 2, 33) < 0.6) pc.set(x, cyT + (x % 2), 0x7ae8ff);
  // Old Star's forge: the hearth glowing, its chimney up through the rock
  const fx = x0 + 4;
  pc.rect(fx, cyB - 4, 5, 4, 0x6a5a58);
  pc.rect(fx + 1, cyB - 3, 3, 2, 0xffa030); pc.set(fx + 2, cyB - 3, 0xfff0a0);
  for (let y = cyT - 6; y < cyB - 4; y++) pc.set(fx + 2, y, y < cyT ? 0x3a2a26 : 0x5a4a48);
  for (let j = -3; j <= 3; j++) for (let i = -4; i <= 4; i++) { const d = Math.hypot(i, j * 1.4); if (d > 2.4 && d < 4.4 && (i + j) % 2 === 0) pc.set(fx + 2 + i, cyB - 2 + j, mixHex(pc.getHex(fx + 2 + i, cyB - 2 + j), 0xff8020, 0.4)); }
  // the anvil, the quench trough, his bed, Old Star himself
  stamp(pc, fx + 8, cyB - 2, [[0, 0, 0x6a6e76], [1, 0, 0x8a8e96], [2, 0, 0x6a6e76], [3, 0, 0x5a5e66], [-1, 0, 0x6a6e76], [1, 1, 0x4a4e56], [2, 1, 0x4a4e56], [0, 2, 0x5a3a22], [3, 2, 0x5a3a22], [1, 2, 0x5a3a22], [2, 2, 0x5a3a22]]);
  pc.rect(fx + 14, cyB - 2, 4, 2, 0x5a3a22); pc.set(fx + 15, cyB - 2, 0x3a7ab0); pc.set(fx + 16, cyB - 2, 0x5a9ad0);
  stamp(pc, fx + 20, cyB - 4, [[1, 0, 0x5a5050], [0, 1, 0x4a4044], [1, 1, 0x4a4044], [2, 1, 0xf07090], [0, 2, 0x76643e], [1, 2, 0x76643e], [0, 3, 0x76643e], [1, 3, 0x76643e]]);
  pc.rect(x1 - 9, cyB - 1, 5, 1, 0xa83a2a); pc.set(x1 - 9, cyB - 2, 0xe8dcc0);
  // the hole he fell through: a crooked dark crack from the clearing to the cave roof
  let x = HOLE_X;
  for (let y = GROUND - 2; y <= cyT + 1; y++) {
    x += Math.round(Math.sin(y * 0.9) * 0.6);
    const w = y < GROUND + 1 ? 3 : 2;
    for (let i = -w; i <= w; i++) pc.set(x + i, y, Math.abs(i) === w ? 0x2a1a12 : 0x0e0806);
    if (hash(x, y, 34) < 0.3) pc.set(x + w + 1, y, 0x9a7650); // roots torn at the edges
  }
  // the Surface Express shaft from Deep Town up to the locked gate
  if (wayUp && townY != null) {
    for (let y = GROUND - 2; y < townY - 3; y++) {
      for (let i = -1; i <= 1; i++) pc.set(WAYUP_X + i, y, 0x140c0a);
      pc.set(WAYUP_X - 2, y, 0x5a5a62); pc.set(WAYUP_X + 2, y, 0x4a4a52);
      if (y % 3 === 0) pc.set(WAYUP_X, y, 0xd8a840);
    }
  }
  return { hy, cyT, cyB };
}

/** The shaft (from the floor of Old Star's cave), its timbers and the cable. knownTo: canvas y of the deepest known stop. */
function paintShaft(pc, S, knownTo, top) {
  const bottom = S.H - CORE_PAD + 4;
  for (let y = top; y < bottom; y++) {
    for (let x = SX - 2; x <= SX + 2; x++) pc.set(x, y, y > knownTo ? 0x1a1214 : 0x140c0a);
    pc.set(SX - 3, y, y > knownTo ? shade(pc.getHex ? pc.getHex(SX - 3, y) : 0x2a1a14, 0.7) : 0x5a3a22);
    pc.set(SX + 3, y, y > knownTo ? shade(pc.getHex ? pc.getHex(SX + 3, y) : 0x2a1a14, 0.7) : 0x4a2e1a);
    if ((y - GROUND) % 12 === 0 && y <= knownTo) for (let x = SX - 4; x <= SX + 4; x++) pc.set(x, y, 0x6a4428);
    // the cable: bright brass to the deepest stop, a dim dashed line below
    if (y <= knownTo) { pc.set(SX, y, 0xd8b058); if (y % 3 === 0) pc.set(SX, y, 0xf0d080); } else if (y % 3 !== 0) pc.set(SX, y, 0x5a4a3a);
  }
}

/** The glowing heart under everything. */
function paintCore(pc, S) {
  const cy = S.H + 18, cx = CW / 2;
  for (let y = S.H - CORE_PAD - 8; y < S.H; y++) for (let x = 0; x < CW; x++) {
    const d = Math.hypot((x - cx) * 0.55, y - cy);
    const k = clamp(1 - (d - 18) / 40, 0, 1);
    if (k <= 0) continue;
    const q = Math.floor(k * 5 + ((x + y * 3) % 4) / 4);
    if (q <= 0) continue;
    pc.set(x, y, [0, 0x6a3a9a, 0x9a5ad0, 0xc890ff, 0xf0d8ff, 0xffffff][Math.min(5, q)]);
  }
}

function lamp(pc, x, y, lit) {
  // a little platform both sides, and a lantern hanging beside the shaft
  for (let k = -5; k <= 5; k++) if (Math.abs(k) > 2) { pc.set(x + k, y + 1, 0x7a5232); pc.set(x + k, y + 2, 0x4a2e1a); }
  const lx = x + 5;
  if (lit) {
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const d = Math.hypot(i, j);
      if (d > 1.6 && d < 3.4 && (i + j) % 2 === 0) pc.set(lx + i, y - 1 + j, mixHex(0xffd070, 0x000000, 0.35));
    }
    pc.set(lx, y - 1, 0xfff4c0); pc.set(lx, y, 0xffc040); pc.set(lx, y - 2, 0x3a2a22);
  } else { pc.set(lx, y - 1, 0x6a5a4a); pc.set(lx, y, 0x4a3a2a); }
}

function cageIcon(pc, x, y) {
  const B = 0xf2c23a, D = 0x8a5a1a;
  for (let j = -4; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const edge = Math.abs(i) === 3 || j === -4 || j === 3;
    if (edge || i % 2 === 0) pc.set(x + i, y + j, edge ? B : D);
  }
  pc.set(x, y - 5, B);
}

/**
 * Open the lift map. dests: liftDestinations(state); ride(id) when a stop is chosen.
 * Returns the panel handle.
 */
export function openLiftMap(game, here, opts, dests, ride) {
  const st = game.state;
  const S = makeScale();
  const seed = (st.data.deep && st.data.deep.seed) || 1;
  // where each stop sits
  const stops = dests.map((d) => {
    let depth = d.depth || 0;
    if (d.id !== 'home' && depth <= 0 && d.zone >= 1) depth = d.id === 's0' ? 18 : LIFT_ZONE_DEPTHS[d.zone - 1] + 2; // stations from old saves
    if (d.id === 'home') depth = HOME_DEPTH;
    return { ...d, depth, y: Math.round(S.y(depth)) };
  }).sort((a, b) => a.y - b.y);
  const deepest = stops.reduce((m, s) => Math.max(m, s.y), GROUND);
  // unknown lifts: three are buried in every zone; the ones not found yet are "?" pins in the rock
  const pins = [];
  for (let z = 1; z <= 6; z++) {
    const known = stops.filter((s) => s.id && /^L\d\d$/.test(s.id) && +s.id[1] === z).length;
    for (let k = known; k < 3; k++) {
      const d = LIFT_ZONE_DEPTHS[z - 1] + 5 + hash(seed, z * 7 + k, 11) * (LIFT_ZONE_DEPTHS[z] - LIFT_ZONE_DEPTHS[z - 1] - 10);
      const side = hash(seed, z * 5 + k, 12) < 0.5 ? -1 : 1;
      const x = side < 0 ? Math.round(14 + hash(seed, z + k, 13) * (SX - 34)) : Math.round(SX + 44 + hash(seed, z + k, 14) * (CW - SX - 54));
      pins.push({ x, y: Math.round(S.y(d)), z });
    }
  }

  // ---- paint
  const pc = new PixelCanvas(CW, S.H);
  const town = stops.find((s) => s.id === 'town');
  const wayUp = !!town;
  paintSurface(pc, wayUp);
  paintStrata(pc, S, seed % 997);
  const homeY = Math.round(S.y(HOME_DEPTH));
  const avoid = [{ x0: SX + 6, x1: CW, y0: 0, y1: 0 }, { x0: SX - 36, x1: SX + 10, y0: GROUND, y1: homeY + 8 }, { x0: WAYUP_X - 4, x1: WAYUP_X + 4, y0: GROUND, y1: (town ? town.y : 0) + 6 }];
  for (const s of stops) avoid.push({ x0: SX + 4, x1: SX + 70, y0: s.y - 6, y1: s.y + 5 });
  for (const p of pins) avoid.push({ x0: p.x - 4, x1: p.x + 6, y0: p.y - 4, y1: p.y + 6 });
  paintDetails(pc, S, seed % 991, avoid);
  paintCore(pc, S);
  const home = paintHome(pc, S, wayUp, town ? town.y : null);
  paintShaft(pc, S, deepest, home.cyB);
  // a depth ruler down the right edge: a tick every 10 m, a long one every 50 m
  for (let d = 10; d < LIFT_ZONE_DEPTHS[6]; d += 10) {
    const y = Math.round(S.y(d)), L = d % 50 === 0 ? 5 : 2;
    for (let k = 0; k < L; k++) pc.set(CW - 1 - k, y, d % 50 === 0 ? 0xf2d890 : 0xc8b080);
  }
  // Deep Town: a cave pocket of lit windows on the far side of the shaft (the express shaft above it)
  if (town) {
    const tx = SX - 41, ty = town.y;
    for (let j = -5; j <= 4; j++) for (let i = 0; i < 24; i++) {
      const e = ((i - 11.5) / 12.5) ** 2 + (j / 5.4) ** 2;
      if (e < 1) pc.set(tx + i, ty + j, j > 2 ? 0x2a1e18 : 0x1e1612);
    }
    for (let h = 0; h < 4; h++) {
      const hx = tx + 3 + h * 5, hh = 3 + (h % 2);
      pc.rect(hx, ty + 3 - hh, 4, hh, 0x6a4a34);
      pc.set(hx + 1, ty + 4 - hh, 0xffc860);
      pc.set(hx + 1, ty + 2 - hh, 0x8a3a2a); pc.set(hx + 2, ty + 2 - hh, 0x8a3a2a);
    }
    for (let i = 0; i < 24; i += 3) pc.set(tx + i, ty - 4 + (i % 2), 0xffe080); // string lights
  }
  for (const p of pins) {
    for (let j = -2; j <= 3; j++) for (let i = -2; i <= 4; i++) {
      const e = ((i - 1) / 3.4) ** 2 + ((j - 0.5) / 3.2) ** 2;
      if (e < 1) pc.set(p.x + i, p.y + j, e > 0.6 ? shade(pc.getHex(p.x + i, p.y + j), 0.55) : 0x24181a);
    }
    glyphQ(pc, p.x, p.y - 2, 0xc8a050);
  }
  for (const s of stops) lamp(pc, SX, s.y, true);
  const cur = stops.find((s) => s.id === here);
  if (cur) cageIcon(pc, SX, cur.y - 2);
  const canvas = pc.commit();
  canvas.className = 'lp-canvas';

  // ---- DOM: the map, zone names, a depth ruler, the stops
  const P = (v) => `calc(var(--px) * ${v})`;
  const map = el('div', { class: 'lp-map', style: { width: P(CW), height: P(S.H) } }, [canvas]);
  for (let z = 1; z <= 6; z++) {
    const Z = ZONES[z];
    map.append(el('div', { class: 'lp-zone', style: { left: P(3), top: P(z === 1 ? S.tops[1] - 15 : S.tops[z - 1] + 4), color: mixHexCss(Z.color, 0.55), maxWidth: P(SX - 10) } }, [
      el('b', {}, Z.name),
      el('small', {}, `${LIFT_ZONE_DEPTHS[z - 1]}–${LIFT_ZONE_DEPTHS[z]} m`),
    ]));
  }
  for (let d = 50; d < LIFT_ZONE_DEPTHS[6]; d += 50) map.append(el('div', { class: 'lp-tick', style: { top: P(S.y(d) - 7) } }, `${d} m`));
  // stop tags: push apart so none overlap; a leader joins each tag to its lamp
  const tags = [];
  let last = -99;
  const pxCss = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
  const gap = Math.max(9, Math.ceil(24 / pxCss)); // tags never overlap, whatever the pixel size
  for (const s of stops) {
    const ty = Math.max(s.y - 4, last + gap);
    last = ty;
    const isHere = s.id === here;
    const Z = ZONES[s.zone];
    const icon = s.id === 'home' ? '⌂' : s.id === 'town' ? '★' : '';
    const label = [icon ? el('i', { class: 'lp-ico' }, icon) : null, el('span', { class: 'lp-name' }, s.name), el('span', { class: 'lp-depth' }, `${Math.round(s.depth)} m`)];
    if (isHere) label.push(el('em', { class: 'lp-here' }, 'you are here'));
    const tag = el(isHere ? 'div' : 'button', {
      class: 'lp-stop' + (isHere ? ' here' : ''),
      type: isHere ? undefined : 'button',
      style: { top: P(ty), left: P(SX + 9) },
      title: s.desc || '',
      'aria-label': isHere ? `${s.name}: you are here` : `Ride to ${s.name}, ${Math.round(s.depth)} metres down`,
      onclick: isHere ? undefined : () => { h?.close(); ride(s.id); },
    }, label);
    tag.style.setProperty('--zc', s.id === 'home' ? '#8a5a2a' : s.id === 'town' ? '#c8902a' : (Z && Z.color) || '#8a7a6a');
    const lead = el('i', { class: 'lp-lead', style: { top: P(Math.min(s.y, ty + 3)), height: P(Math.abs(ty + 3 - s.y) + 1), left: P(SX + 6) } });
    const glow = el('i', { class: 'lp-glow' + (isHere ? ' here' : ''), style: { top: P(s.y - 4), left: P(SX + 2) } });
    map.append(lead, glow, tag);
    tags.push({ s, tag });
  }
  for (const p of pins) map.append(el('i', { class: 'lp-pin', title: `An old lift is buried somewhere in the ${ZONES[p.z].name}. Dig to it and ring its bell.`, style: { left: P(p.x - 3), top: P(p.y - 4) } }));
  // twinkles over crystals, lava and star ore (CSS-animated pixels)
  const rng = makeRng(seed + 5);
  for (let i = 0; i < 26; i++) {
    const z = 3 + (i % 4);
    const y = rng.range(S.tops[z - 1] + 4, S.tops[z] - 4), x = rng.range(4, CW - 4);
    if (Math.abs(x - SX) < 8) continue;
    map.append(el('i', { class: 'lp-tw z' + z, style: { left: P(Math.round(x)), top: P(Math.round(y)), animationDelay: `${(i * 0.37) % 3}s` } }));
  }
  map.append(el('i', { class: 'lp-smoke', style: { left: P(SX - 32 + 6), top: P(GROUND - 14) } })); // the forge chimney
  map.append(el('div', { class: 'lp-note', style: { left: P(HOLE_X - 3), top: P(GROUND - 19) } }, 'you fell in here'));
  if (wayUp) map.append(el('div', { class: 'lp-note gold', title: 'The Surface Express in Deep Town: a ticket costs a million gold.', style: { left: P(Math.max(1, WAYUP_X - 14)), top: P(GROUND - 30) } }, [el('b', {}, 'the way up'), el('small', {}, '1,000,000 g')]));
  const scroller = el('div', { class: 'lp-scroll scroll' }, [map]);
  const legend = el('div', { class: 'lp-legend' }, [
    el('span', {}, [el('i', { class: 'lp-k lit' }), 'a lift you know: tap to ride']),
    el('span', {}, [el('i', { class: 'lp-k unk' }), 'a lift still buried']),
  ]);
  const body = el('div', { class: 'lp-body' }, [scroller, legend]);
  game.audio.play('bell', { vol: 0.5 });
  const h = game.ui.openPanel({ title: opts.title || 'The Lift', sub: opts.sub || 'Where to?', body, className: 'lp-panel' });
  // open on the stop we're at (or the surface)
  requestAnimationFrame(() => {
    const px = canvas.getBoundingClientRect().width / CW || 3;
    const at = cur ? cur.y : GROUND;
    scroller.scrollTop = Math.max(0, at * px - scroller.clientHeight * 0.4);
  });
  return h;
}

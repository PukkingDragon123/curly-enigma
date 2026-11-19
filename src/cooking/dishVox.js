// Cooked dishes as fully built voxel servings: the vessel (a glazed clay bowl, a red mug, a tall
// glass, a cream plate with a blue rim, a jam jar with a cloth cap, a plank platter) and what's in
// it, by the kind of dish: brothy soup with diced chunks and herb flecks, thick stew, noodles in
// loops, a buttery mash peak, a leafy salad, risotto grains under truffle shavings, layered
// parfait, a crisp fish with its tail, a folded omelette, a stack of pancakes under a honey drip,
// egg halves, a crimped pie, a scored loaf, jam toast, skewers, jerky strips, a feast platter.
// Each built from voxels in one frame (origin: bottom centre, x right, y up, +z toward you), so
// the same model sits on the kitchen's plate (dishMesh) and in the mole's paws (dishVoxInto, the
// view model's char Vox) with bites taken out of it as it is eaten (stage 0..3: the food goes,
// the vessel stays; a bowl's level drops, a solid gets bite marks with paler flesh at the edges).
import { VoxelGrid, voxelMesh } from '../gfx/Voxel.js';
import { DISHES } from '../data/recipes.js';
import { ITEMS } from '../data/items.js';
import { shade, mixHex, hashStr } from '../core/util.js';

// what each icon type is served in and as
const FORM = {
  soup: ['bowl', 'soup'], stew: ['bowl', 'stew'], mushstew: ['bowl', 'stew'], mash: ['bowl', 'mash'], pesto: ['bowl', 'noodles'],
  noodles: ['bowl', 'noodles'], risotto: ['bowl', 'risotto'], salad: ['bowl', 'salad'], mush: ['bowl', 'mash'],
  cup: ['mug', 'tea'], tea: ['mug', 'tea'], parfait: ['glass', 'parfait'], jam: ['jar', 'jam'],
  fish: ['plate', 'fish'], saltfish: ['plate', 'fish'], omelette: ['plate', 'omelette'], trufomelette: ['plate', 'omelette'],
  frittata: ['plate', 'omelette'], pancakes: ['plate', 'stack'], egg: ['plate', 'egg'], wrap: ['plate', 'wrap'],
  jerky: ['plate', 'strips'], friedgrubs: ['plate', 'strips'], bread: ['board', 'loaf'], jamtoast: ['plate', 'toast'],
  rootpie: ['plate', 'pie'], fishpie: ['plate', 'pie'], pie: ['plate', 'pie'], skewer: ['plate', 'skewer'], feast: ['platter', 'feast'],
};
// a few dishes look like their own thing whatever their icon says
const BY_ID = { roast_nuts: ['bowl', 'nuts'], nut_brittle: ['plate', 'brittle'], spore_kraut: ['bowl', 'salad'], glow_pesto: ['bowl', 'noodles'], worm_noodles: ['bowl', 'noodles'], ember_curry: ['bowl', 'stew'], sleepy_stew: ['bowl', 'stew'], carrot_stew: ['bowl', 'stew'] };

/** { vessel, food, c (main colour), glow } for a dish id (null: not a cooked dish). */
export function dishForm(id) {
  const d = DISHES[id];
  if (!d) return null;
  const t = d.icon?.t;
  const [vessel, food] = BY_ID[id] || FORM[t] || ['bowl', 'stew'];
  return { vessel, food, c: d.icon?.c ?? 0xc89a5a, glow: d.buff === 'glow' || d.buff2 === 'glow', id };
}

// deterministic per-voxel noise
const hh = (x, y, z, s = 1) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const jit = (c, x, y, z, s, a = 0.06) => shade(c, 1 + (hh(x, y, z, s) - 0.5) * 2 * a);

/** Voxel buffer: food voxels are tagged so bites take only them. */
class Buf {
  constructor() { this.m = new Map(); }
  put(x, y, z, c, food = true) { x = Math.round(x); y = Math.round(y); z = Math.round(z); this.m.set(x + ',' + y + ',' + z, { x, y, z, c, food }); }
  has(x, y, z) { return this.m.has(Math.round(x) + ',' + Math.round(y) + ',' + Math.round(z)); }
  del(x, y, z) { this.m.delete(x + ',' + y + ',' + z); }
  /** Fill a disc of radius r at height y (cx, cz centre). */
  disc(r, y, fn, food = true) {
    const R = Math.ceil(r);
    for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) { const d = Math.hypot(x, z); if (d <= r) { const c = fn(x, z, d); if (c != null && c >= 0) this.put(x, y, z, c, food); } }
  }
  ell(cx, cy, cz, rx, ry, rz, fn, food = true) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
      if (dx * dx + dy * dy + dz * dz <= 1) { const c = typeof fn === 'function' ? fn(x, y, z, dy) : fn; if (c != null && c >= 0) this.put(x, y, z, c, food); }
    }
  }
}

// ------------------------------------------------------------------ vessels (R: rim radius in voxels)
function bowlV(B, R) {
  const H = Math.round(R * 0.62);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1), r = R * (0.55 + 0.45 * Math.sqrt(t)), rin = y < 2 ? -1 : r - 1.6;
    B.disc(r, y, (x, z, d) => {
      if (d <= rin) return null;
      if (y === H - 1) return 0xe8c8a0; // the lit rim
      if (y === Math.round(H * 0.62) || y === Math.round(H * 0.62) + 1) return (Math.round(Math.atan2(z, x) * 6) % 2 ? 0x2c5a9a : 0x4a78b8); // painted band
      const k = (x * -0.6 + z * 0.4) / r;
      return jit(k > 0.35 ? 0xd88a52 : k < -0.4 ? 0x8a4a28 : 0xb8683a, x, y, z, 3, 0.05); // terracotta, lit from the top left
    }, false);
  }
  B.disc(R * 0.5, 0, () => 0x6a3a1e, false); // the foot ring
  return { top: H - 1, inner: R - 1.8, floor: 1 };
}
function mugV(B, R) {
  const r = R * 0.62, H = Math.round(R * 1.15);
  for (let y = 0; y < H; y++) B.disc(r, y, (x, z, d) => (y > 0 && d < r - 1.4 ? null : y >= H - 1 ? 0xf0e2c8 : jit((x * -0.6 + z * 0.4) / r > 0.3 ? 0xd86a4a : 0xb04838, x, y, z, 7, 0.04)), false);
  // the handle on +x
  for (let y = Math.round(H * 0.25); y < Math.round(H * 0.8); y++) {
    const e = y === Math.round(H * 0.25) || y === Math.round(H * 0.8) - 1;
    for (let x = Math.round(r); x <= Math.round(r) + (e ? 3 : 0); x++) for (let z = -1; z <= 0; z++) B.put(x, y, z, 0xa04030, false);
    if (!e) for (let z = -1; z <= 0; z++) B.put(Math.round(r) + 3, y, z, 0xa04030, false);
  }
  return { top: H - 1, inner: r - 1.4, floor: 1 };
}
function glassV(B, R) {
  const r = R * 0.55, H = Math.round(R * 1.4);
  B.disc(r * 0.8, 0, () => 0xc8e4f0, false);
  for (let y = 1; y < Math.round(H * 0.18); y++) B.disc(1.2, y, () => 0xd8f0f8, false); // the stem
  const y0 = Math.round(H * 0.18);
  for (let y = y0; y < H; y++) { const rr = r * (0.7 + 0.3 * ((y - y0) / (H - y0))); B.disc(rr, y, (x, z, d) => (d < rr - 1 ? null : (x + z + y) % 7 === 0 ? 0xffffff : 0xb8e0ee), false); }
  return { top: H - 1, inner: r - 1, floor: y0, y0 };
}
function plateV(B, R) {
  B.disc(R * 0.7, 0, () => 0xc8b898, false);
  B.disc(R, 1, (x, z, d) => (d > R - 2.2 ? ((Math.round(Math.atan2(z, x) * 9) % 2) ? 0x4a78b8 : 0xf4ead6) : jit(0xf6eedc, x, 1, z, 2, 0.02)), false);
  B.disc(R, 2, (x, z, d) => (d > R - 1.6 ? jit(0xfff8ea, x, 2, z, 5, 0.03) : null), false);
  return { top: 2, inner: R - 2.2, floor: 2 };
}
function boardV(B, R) {
  for (let z = -Math.round(R * 0.7); z <= Math.round(R * 0.7); z++) for (let x = -R; x <= R + 3; x++) {
    if (x > R && Math.abs(z) > 1) continue; // the handle
    for (let y = 0; y < 2; y++) B.put(x, y, z, jit((z + 40) % 5 === 0 ? 0x8a5a2a : 0xae763c, x, y, z, 4, 0.05), false);
  }
  return { top: 1, inner: R, floor: 2 };
}
function jarV(B, R) {
  const r = R * 0.55, H = Math.round(R * 1.1);
  for (let y = 0; y < H; y++) B.disc(r, y, (x, z, d) => (d < r - 1 && y > 0 ? null : (x * -0.6 + z * 0.4) / r > 0.45 ? 0xeaf6f8 : 0xa8d0dc), false);
  // the cloth cap tied with string, a paper label
  for (let y = H; y < H + 2; y++) B.disc(r + 1.4, y, (x, z) => ((x + z) % 4 === 0 ? 0xf4f0e0 : 0xd84a4a), false);
  B.disc(r + 0.5, H + 2, (x, z) => ((x + z) % 4 === 0 ? 0xf4f0e0 : 0xc83a3a), false);
  for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; B.put(Math.cos(t) * (r + 0.6), H - 1, Math.sin(t) * (r + 0.6), 0xe8d8b0, false); }
  for (let y = Math.round(H * 0.3); y < Math.round(H * 0.62); y++) for (let x = -Math.round(r * 0.5); x <= Math.round(r * 0.5); x++) B.put(x, y, Math.round(r), y === Math.round(H * 0.45) ? 0x8a5a3a : 0xf2e2c0, false);
  return { top: H - 1, inner: r - 1, floor: 1, H };
}
function platterV(B, R) {
  for (let z = -Math.round(R * 0.75); z <= Math.round(R * 0.75); z++) for (let x = -R - 2; x <= R + 2; x++) for (let y = 0; y < 2; y++) {
    if ((Math.abs(x) > R + 1) && Math.abs(z) > R * 0.6) continue;
    B.put(x, y, z, y === 1 && (Math.abs(x) > R || Math.abs(z) > R * 0.7) ? 0xc8a050 : jit(0x9a6a3a, x, y, z, 6, 0.05), false);
  }
  return { top: 1, inner: R, floor: 2 };
}

// ------------------------------------------------------------------ foods
const LEAF = [0x5a9a3a, 0x7ab84a, 0x9ad070];
function chunks(B, cx, cz, y, n, r, cols, seed) {
  for (let i = 0; i < n; i++) {
    const a = hh(i, 1, 0, seed) * Math.PI * 2, d = Math.sqrt(hh(i, 2, 0, seed)) * r;
    const x = Math.round(cx + Math.cos(a) * d), z = Math.round(cz + Math.sin(a) * d), c = cols[i % cols.length], w = 1 + (hh(i, 3, 0, seed) < 0.5 ? 1 : 0);
    for (let xx = 0; xx <= w; xx++) for (let zz = 0; zz <= 1; zz++) { B.put(x + xx, y, z + zz, jit(c, x + xx, y, z + zz, seed, 0.08)); if ((xx + zz + i) % 3 === 0) B.put(x + xx, y + 1, z + zz, shade(c, 1.15)); }
  }
}
function soupF(B, V, f, thick) {
  const y = V.top - (thick ? 1 : 2), r = V.inner, c = f.c;
  for (let yy = V.floor; yy <= y; yy++) B.disc(r * (0.55 + 0.45 * Math.sqrt((yy - V.floor + 1) / (y - V.floor + 1))), yy, (x, z, d) => (yy === y ? ((x * 3 + z * 5) % 11 === 0 ? mixHex(c, 0xffffff, 0.35) : d > r - 1.5 ? shade(c, 0.85) : jit(c, x, yy, z, 2, 0.05)) : shade(c, 0.8)));
  const cols = [mixHex(c, 0xffa040, 0.5), mixHex(c, 0xffffff, 0.45), 0xe8a050, 0xf0e0b0];
  chunks(B, 0, 0, y + 1, thick ? 10 : 6, r * 0.7, cols, hashStr(f.id) & 255);
  for (let i = 0; i < 8; i++) B.put(Math.round((hh(i, 7, 1) - 0.5) * r * 1.4), y + 1, Math.round((hh(i, 8, 1) - 0.5) * r * 1.4), LEAF[i % 3]); // herb flecks
  if (thick) B.ell(0, y + 1, 0, r * 0.45, 2, r * 0.4, (x, yy, z) => jit(shade(c, 1.05), x, yy, z, 9, 0.08)); // mounded middle
}
function noodlesF(B, V, f) {
  soupF(B, V, { ...f, c: mixHex(f.c, 0xf0d8a0, 0.5) }, false);
  const y = V.top, c = mixHex(f.c, 0xf6e0b0, 0.55);
  for (let k = 0; k < 5; k++) for (let i = 0; i < 40; i++) { const t = i / 40; const a = t * Math.PI * 3 + k; const r = V.inner * (0.25 + 0.5 * t); B.put(Math.cos(a) * r * 0.9, y - 1 + (i % 7 === 0 ? 1 : 0), Math.sin(a) * r * 0.8, i % 9 ? c : shade(c, 0.85)); }
}
function mashF(B, V, f) {
  const c = mixHex(f.c, 0xf6ecd0, 0.4);
  B.ell(0, V.top - 1, 0, V.inner * 0.95, V.top * 0.55, V.inner * 0.9, (x, y, z) => jit((x + y * 2 + z) % 9 === 0 ? mixHex(c, 0xffffff, 0.3) : c, x, y, z, 5, 0.05));
  const py = V.top - 1 + Math.round(V.top * 0.5);
  B.ell(0, py, 0, 2.2, 1.4, 2, 0xffe070); // the butter pat, melting
  for (let i = 0; i < 6; i++) B.put(2 + i * 0.6, py - 1 - i * 0.6, 1, 0xffd040);
  B.put(-2, py - 1, -1, LEAF[1]); B.put(-1, py, 2, LEAF[2]);
}
function saladF(B, V, f) {
  const base = V.top - 3;
  for (let i = 0; i < 70; i++) {
    const a = hh(i, 1, 3) * Math.PI * 2, d = Math.sqrt(hh(i, 2, 3)) * V.inner * 0.9, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const y = base + Math.round((1 - d / V.inner) * 4) + (i % 3);
    const leaf = i % 7 === 0 ? 0xf08a3a : i % 5 === 0 ? mixHex(f.c, 0xffffff, 0.2) : LEAF[i % 3];
    B.put(x, y, z, leaf); B.put(x + 1, y, z, shade(leaf, 0.9)); if (i % 2) B.put(x, y + 1, z + 1, shade(leaf, 1.1));
  }
}
function risottoF(B, V, f) {
  soupF(B, V, { ...f, c: 0xf0e0b0 }, true);
  const y = V.top + 2;
  for (let i = 0; i < 9; i++) { const x = Math.round((hh(i, 4, 2) - 0.5) * V.inner), z = Math.round((hh(i, 5, 2) - 0.5) * V.inner); B.put(x, y, z, 0x4a3426); B.put(x + 1, y, z, 0x6a4a36); }
}
function nutsF(B, V) {
  for (let i = 0; i < 26; i++) {
    const a = hh(i, 1, 9) * Math.PI * 2, d = Math.sqrt(hh(i, 2, 9)) * V.inner * 0.8, x = Math.cos(a) * d, z = Math.sin(a) * d, y = V.top - 2 + Math.round((1 - d / V.inner) * 4);
    B.ell(x, y, z, 1.4, 1.1, 1.2, (xx, yy, zz) => jit(i % 3 ? 0xb8864a : 0xd8a868, xx, yy, zz, i, 0.08));
    if (i % 4 === 0) B.put(x, y + 1, z, 0xffffff); // salt
  }
}
function teaF(B, V, f) {
  B.disc(V.inner, V.top - 1, (x, z, d) => (d > V.inner - 1 ? shade(f.c, 0.8) : (x + z) % 6 === 0 ? mixHex(f.c, 0xffffff, 0.4) : f.c));
  if (f.id === 'bubble_tea') for (let i = 0; i < 7; i++) B.put(Math.round((hh(i, 1, 5) - 0.5) * V.inner * 1.3), V.top - 1, Math.round((hh(i, 2, 5) - 0.5) * V.inner * 1.3), 0x3a2430);
}
function parfaitF(B, V, f) {
  const cols = [mixHex(f.c, 0xffffff, 0.2), 0xfff4dc, 0xd84a6a, f.c, 0xfff4dc];
  for (let y = V.y0 + 1; y < V.top; y++) { const rr = V.inner * (0.7 + 0.3 * ((y - V.y0) / (V.top - V.y0))) - 0.5; B.disc(rr, y, (x, z) => jit(cols[Math.floor((y - V.y0) / 3) % cols.length], x, y, z, 6, 0.04)); }
  B.ell(0, V.top + 1, 0, V.inner * 0.7, 2.5, V.inner * 0.7, 0xfffaf0);
  B.ell(0, V.top + 3, 0, 1.4, 1.4, 1.4, 0xd82a3a); // the berry on top
  B.put(0, V.top + 5, 0, LEAF[0]);
}
function jamF(B, V, f) { for (let y = V.floor; y < Math.round(V.H * 0.85); y++) B.disc(V.inner, y, (x, z) => jit((x + y + z) % 8 === 0 ? 0xf06a8a : f.c, x, y, z, 3, 0.05)); }
function fishF(B, V, f) {
  const y = V.top + 1, L = V.inner * 0.85, c = mixHex(f.c, 0xe0a050, 0.4);
  for (let x = -Math.round(L); x <= Math.round(L * 0.75); x++) {
    const t = (x + L) / (L * 1.75), w = Math.sin(t * Math.PI) * V.inner * 0.42 + 0.5;
    for (let z = -Math.round(w); z <= Math.round(w); z++) for (let yy = 0; yy < 3; yy++) {
      if (yy === 2 && Math.abs(z) > w - 1) continue;
      B.put(x, y + yy, z, yy === 2 ? ((x + 40) % 4 === 0 ? shade(c, 0.7) : jit(mixHex(c, 0xfff0c0, 0.25), x, yy, z, 5, 0.06)) : shade(c, 0.85));
    }
  }
  // the tail fin and the eye
  for (let i = 0; i < 4; i++) for (let z = -i - 1; z <= i + 1; z++) B.put(Math.round(L * 0.75) + i + 1, y + 1, z, shade(c, 0.8 + (z % 2) * 0.08));
  B.put(-Math.round(L * 0.7), y + 2, 1, 0x1a1210); B.put(-Math.round(L * 0.7), y + 3, 1, 0xffffff);
  // a lemon wedge and herbs
  B.ell(-2, y, V.inner * 0.65, 2.5, 1.2, 1.4, 0xfff060); B.put(3, y + 3, 0, LEAF[1]); B.put(5, y + 3, -1, LEAF[2]);
}
function omeletteF(B, V, f) {
  const y = V.top + 1, r = V.inner * 0.82, c = mixHex(f.c, 0xffd860, 0.3);
  // a folded half-moon: flat underneath, the fold line along its back, browned freckles
  B.ell(0, y, 0, r, r * 0.32, r * 0.62, (x, yy, z, dy) => (dy < -0.1 ? null : Math.abs(z + r * 0.3) < 0.8 ? shade(c, 0.86) : jit((x * 7 + z * 3) % 13 === 0 ? 0xc89030 : (x + z) % 5 === 0 ? shade(c, 1.08) : c, x, yy, z, 4, 0.05)));
  for (let i = 0; i < 6; i++) B.put(Math.round((hh(i, 1, 6) - 0.5) * r), y + Math.round(r * 0.3), Math.round((hh(i, 2, 6) - 0.5) * r * 0.8), i % 2 ? LEAF[0] : f.id === 'truffle_omelette' ? 0x4a3426 : 0xd84a2a);
}
function stackF(B, V, f) {
  const r = V.inner * 0.7, c = mixHex(f.c, 0xe0a050, 0.3);
  let y = V.top + 1;
  for (let k = 0; k < (f.id === 'nut_brittle' ? 2 : 4); k++) {
    B.disc(r - (k % 2), y, (x, z, d) => (d > r - 1.6 ? shade(c, 0.78) : jit(c, x, y, z, k, 0.05)));
    B.disc(r - 1 - (k % 2), y + 1, (x, z) => jit(mixHex(c, 0xffe0a0, 0.3), x, y + 1, z, k + 3, 0.05));
    y += 2;
  }
  B.ell(0, y, 0, 2, 1, 2, 0xfff0a0); // butter
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; B.put(Math.cos(a) * (r - 1), y - 1 - (i % 3), Math.sin(a) * (r - 1), 0xe8a020); } // honey drips
  B.disc(r * 0.6, y - 1, (x, z) => ((x + z) % 3 ? 0xf0b030 : null));
  if (f.id === 'nut_brittle') for (let i = 0; i < 10; i++) B.put(Math.round((hh(i, 1, 8) - 0.5) * r * 1.4), y, Math.round((hh(i, 2, 8) - 0.5) * r * 1.4), 0x8a5a2a);
}
function eggF(B, V, f) {
  for (const sx of [-1, 1]) {
    const cx = sx * V.inner * 0.38, y = V.top + 1;
    B.ell(cx, y, 0, V.inner * 0.34, 2.4, V.inner * 0.26, (x, yy) => (yy > y + 1 ? null : 0xfaf6ec));
    B.ell(cx, y + 1, 0, V.inner * 0.16, 1.6, V.inner * 0.14, (x, yy, z) => ((x + z) % 3 === 0 ? 0xffe890 : mixHex(0xffc23a, f.c, 0.3)));
    B.put(cx, y + 3, 0, 0xd84a2a); B.put(cx + 1, y + 3, 1, LEAF[1]);
  }
}
function pieF(B, V, f) {
  const r = V.inner * 0.85, y = V.top + 1, crust = 0xd8a050;
  for (let yy = 0; yy < 4; yy++) B.disc(r - (yy === 3 ? 0.5 : 0), y + yy, (x, z, d) => {
    if (x > 0 && z > 0 && Math.abs(Math.atan2(z, x) - 0.6) < 0.45 && yy > 0) return yy === 1 ? mixHex(f.c, 0xc86a3a, 0.4) : null; // a slice taken: the filling shows
    if (d > r - 1.6) return (Math.round(Math.atan2(z, x) * 10) % 2) ? shade(crust, 1.12) : shade(crust, 0.85); // crimped edge
    if (yy === 3) return (Math.abs(x) % 4 === 0 || Math.abs(z) % 4 === 0) ? jit(mixHex(crust, 0xffe0a0, 0.25), x, yy, z, 3, 0.04) : jit(crust, x, yy, z, 2, 0.06);
    return yy === 0 ? shade(crust, 0.8) : jit(mixHex(f.c, 0xc86a3a, 0.4), x, yy, z, 6, 0.08);
  });
  if (f.id === 'fish_pie') for (const [x, z] of [[-3, -2], [2, -4], [-1, 3]]) { B.put(x, y + 4, z, 0xc8d0d8); B.put(x, y + 5, z, 0xb8c0c8); B.put(x, y + 6, z, 0x1a1210); }
}
function loafF(B, V, f) {
  const r = V.inner * 0.75, y = V.top + 1, c = mixHex(f.c, 0xd8a060, 0.3);
  B.ell(0, y + 2, 0, r, r * 0.45, r * 0.55, (x, yy, z) => (yy < y ? null : jit(Math.abs((x + 40) % 6 - 3) < 1 && yy > y + r * 0.3 ? mixHex(c, 0xfff0c0, 0.45) : c, x, yy, z, 8, 0.06)));
  for (let i = 0; i < 10; i++) B.put(Math.round((hh(i, 1, 4) - 0.5) * r * 1.4), y + Math.round(r * 0.45) + 2, Math.round((hh(i, 2, 4) - 0.5) * r * 0.6), LEAF[i % 2]); // thyme flecks
}
function toastF(B, V, f) {
  const y = V.top + 1, w = Math.round(V.inner * 0.7);
  for (let z = -w; z <= w; z++) for (let x = -w; x <= w; x++) {
    if (Math.abs(x) === w && Math.abs(z) === w) continue;
    const edge = Math.abs(x) >= w - 1 || Math.abs(z) >= w - 1;
    B.put(x, y, z, 0xb8783a); B.put(x, y + 1, z, edge ? 0xc8884a : (x + z) % 5 === 0 ? 0xf0d0a0 : 0xe8c08a);
    if (!edge && Math.hypot(x, z) < w * 0.75) B.put(x, y + 2, z, (x * 3 + z) % 7 === 0 ? 0xf06a8a : f.c);
  }
}
function skewerF(B, V, f) {
  const y = V.top + 3, L = Math.round(V.inner * 1.1);
  for (const dz of [-3, 3]) {
    for (let x = -L; x <= L; x++) B.put(x, y, dz, 0x9aa0aa, false);
    for (let k = 0; k < 4; k++) B.ell(-L * 0.6 + k * L * 0.4, y, dz, 2.2, 2.2, 2, (x, yy, z) => jit(k % 2 ? mixHex(f.c, 0xffd080, 0.3) : shade(f.c, 0.85), x, yy, z, k, 0.1));
  }
}
function stripsF(B, V, f) {
  for (let i = 0; i < 9; i++) {
    const a = hh(i, 1, 2) * Math.PI, x0 = (hh(i, 2, 2) - 0.5) * V.inner, z0 = (hh(i, 3, 2) - 0.5) * V.inner * 0.9, y = V.top + 1 + (i % 3);
    for (let t = -3; t <= 3; t++) { B.put(x0 + Math.cos(a) * t, y, z0 + Math.sin(a) * t, jit(t % 2 ? f.c : shade(f.c, 1.15), i, y, t, 4, 0.08)); B.put(x0 + Math.cos(a) * t, y, z0 + Math.sin(a) * t + 1, shade(f.c, 0.8)); }
  }
  B.put(0, V.top + 5, 0, LEAF[0]);
}
function wrapF(B, V, f) {
  const y = V.top + 3, L = Math.round(V.inner * 0.8);
  for (let x = -L; x <= L; x++) for (let a = 0; a < 18; a++) { const t = (a / 18) * Math.PI * 2; B.put(x, y + Math.sin(t) * 2.8, Math.cos(t) * 2.8, (x === -L || x === L) ? (a % 2 ? LEAF[1] : f.c) : jit(0xf0d8a0, x, a, 0, 3, 0.05)); }
  for (let a = 0; a < 6; a++) B.put(-L - 1, y + (a % 3) - 1, (a % 2) * 2 - 1, LEAF[a % 3]);
}
function feastF(B, V, f) {
  B.ell(0, V.top + 4, 0, 4, 3, 4, (x, y, z) => ((x + y + z) % 3 ? f.c : 0xffffff)); // the lotus heart
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; B.ell(Math.cos(a) * 6, V.top + 3, Math.sin(a) * 5, 2.6, 1.2, 1.6, mixHex(f.c, 0xffd0e8, 0.4)); }
  chunks(B, -V.inner * 0.6, 0, V.top + 1, 6, 3, [0xe8a050, 0x4a3426, 0xf0e0b0], 7);
  chunks(B, V.inner * 0.6, 0, V.top + 1, 6, 3, [0xd84a2a, 0x7ab84a], 9);
}
const FOOD = { soup: (B, V, f) => soupF(B, V, f, false), stew: (B, V, f) => soupF(B, V, f, true), noodles: noodlesF, mash: mashF, salad: saladF, risotto: risottoF, nuts: nutsF, tea: teaF, parfait: parfaitF, jam: jamF, fish: fishF, omelette: omeletteF, stack: stackF, brittle: stackF, egg: eggF, pie: pieF, loaf: loafF, toast: toastF, skewer: skewerF, strips: stripsF, wrap: wrapF, feast: feastF };
const VESSELS = { bowl: bowlV, mug: mugV, glass: glassV, plate: plateV, board: boardV, jar: jarV, platter: platterV };

/** Build a dish into a voxel buffer: R the rim radius in voxels, stage 0..3 bites taken. */
function build(id, R, stage, o = {}) {
  const f = dishForm(id);
  if (!f) return null;
  const B = new Buf();
  let V = (VESSELS[f.vessel] || bowlV)(B, R);
  // served on a plate that's already there (the kitchen's): just the food, sat where the plate's top is
  if (o.noPlate && f.vessel === 'plate') { B.m.clear(); V = { top: -1, inner: R - 2.2, floor: 0 }; }
  (FOOD[f.food] || FOOD.stew)(B, V, f);
  if (stage > 0) bite(B, f, V, stage);
  return { B, f };
}

/** Take `stage` bites: liquids go down a level each; solids lose round mouthfuls from the front. */
function bite(B, f, V, stage) {
  const all = [...B.m.values()].filter((v) => v.food);
  if (!all.length) return;
  let y0 = 1e9, y1 = -1e9, z1 = -1e9, x1 = -1e9;
  for (const v of all) { y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z1 = Math.max(z1, v.z); x1 = Math.max(x1, v.x); }
  const liquid = f.vessel === 'bowl' || f.vessel === 'mug' || f.vessel === 'glass' || f.vessel === 'jar';
  if (liquid) {
    const cut = y1 - Math.round((y1 - y0 + 1) * stage / 3.4);
    for (const v of all) if (v.y > cut) B.del(v.x, v.y, v.z);
    return;
  }
  const r = Math.max(3, (x1 - Math.min(...all.map((v) => v.x))) * 0.22);
  const bites = [[x1, y1, z1], [x1 * 0.2, y1, z1], [x1 * -0.5, y1 - 1, z1]].slice(0, stage);
  for (const v of all) for (const [bx, by, bz] of bites) if ((v.x - bx) ** 2 + (v.y - by) ** 2 * 0.6 + (v.z - bz) ** 2 <= r * r) { B.del(v.x, v.y, v.z); break; }
  // the bitten edge shows paler inside
  for (const v of B.m.values()) if (v.food) for (const [bx, by, bz] of bites) { const d = Math.sqrt((v.x - bx) ** 2 + (v.y - by) ** 2 * 0.6 + (v.z - bz) ** 2); if (d < r + 1.2) { v.c = mixHex(v.c, 0xfff4dc, 0.35); break; } }
}

function bounds(B) {
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (const v of B.m.values()) { x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); z0 = Math.min(z0, v.z); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); z1 = Math.max(z1, v.z); }
  return { x0, y0, z0, x1, y1, z1 };
}

/**
 * The dish as a kitchen mesh (toon, outlined, origin bottom centre). o.R: rim radius in voxels
 * (default 22), o.size: world width of the rim (default 0.5), o.stage: bites. null for non-dishes.
 */
export function dishMesh(id, o = {}) {
  const R = o.R ?? 22, size = o.size ?? 0.5, stage = o.stage ?? 0;
  const res = build(id, R, stage, o);
  if (!res) return null;
  const { B } = res, b = bounds(B);
  const g = new VoxelGrid(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, b.z1 - b.z0 + 1);
  for (const v of B.m.values()) g.set(v.x - b.x0, v.y - b.y0, v.z - b.z0, v.c);
  const m = voxelMesh(g, { pivot: [-b.x0 + 0.5, -b.y0, -b.z0 + 0.5], scale: size / (R * 2), greedy: true, kind: 'toon' });
  m.userData.dish = res.f;
  return m;
}

/** Write the dish into a char Vox (the view model's food): R rim radius in voxels, stage bites. */
export function dishVoxInto(v, id, R = 13, stage = 0) {
  const res = build(id, R, stage);
  if (!res) return false;
  for (const p of res.B.m.values()) v.set(p.x, p.y, p.z, p.c);
  return res.f;
}

/** Is this item a cooked dish (built here) rather than a raw snack? */
export const isDish = (id) => !!DISHES[id] && ITEMS[id]?.cat === 'food';

// Wave 17: random cave plants. A procedural generator, so no two clumps look alike: every model
// is grown from a seed (the variant; Vegetation then picks a variant, size, turn and colour shift
// per plant from its position), through
//
//   - a small L-system (rewrite rules, then a 3D turtle: F grows a stem, + - turn, & ^ tilt,
//     / rolls by the golden angle, [ ] branch, L a leaf, B a bloom / bud / tip) for the herbs,
//     coral fungi and creepers, with tropism (stems bend up toward the roof, creepers hug the floor)
//   - part grammars for the rest: mushroom clusters (cap shape, count, lean, spots, gill glow),
//     moss cushions with spore capsules, lichen rosettes with cup fruits, root tangles that arch in
//     and out of the floor, crystal lichen, cave grasses, puffball clutches, hanging spore curtains
//   - zone palettes: hue-shifted 7-step ramps (cool, bluer shadows; warm, yellower highlights) per
//     place (zones 1-6 and the biomes), each variant nudging the hues a little
//
// and every one comes with companions (moss, pebbles, fallen bits, sprouts: ./finish.js).
// Exports: RMODELS (name → (r) → { g, pivot, mode }), RKINDS (name → flora kind), RDROPS (name →
// harvest drop), RPLACES. Names are `${base}_${place}` (e.g. coral_f, moss_3).
import { VG, tone } from './vox.js';
import { ph } from './paint.js';
import { groundBits, dew } from './finish.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- colour
function hsl(h, s, l) {
  h = ((((h % 360) + 360) % 360) / 360);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const b = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (b(f(h + 1 / 3)) << 16) | (b(f(h)) << 8) | b(f(h - 1 / 3));
}
const toward = (h, t, a) => { const d = ((t - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), a); };
/** A 7-step ramp (dark → light) round hue h: the shadows lean cool (toward blue), the lights warm (toward yellow). */
export function hramp(h, s, l0, l1, n = 7) {
  const R = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let hh = toward(h, 238, (1 - t) * (1 - t) * 36);
    hh = toward(hh, 54, t * t * 32);
    const ss = Math.min(1, s * (0.72 + 0.42 * Math.sin(Math.PI * (0.12 + 0.72 * t))));
    R.push(hsl(hh, ss, l0 + (l1 - l0) * Math.pow(t, 0.92)));
  }
  return R;
}
// per place: [hue, saturation, darkest, lightest] for leaves, stems, caps, glow, accent, moss, pebbles, crystal
const PLACE = {
  1: { leaf: [112, 0.45, 0.07, 0.62], stem: [32, 0.3, 0.1, 0.72], cap: [24, 0.52, 0.09, 0.7], glow: [186, 0.75, 0.2, 0.88], acc: [42, 0.85, 0.2, 0.8], moss: [118, 0.5, 0.06, 0.55], peb: [30, 0.1, 0.1, 0.64], crys: [195, 0.55, 0.12, 0.92] },
  2: { leaf: [78, 0.4, 0.08, 0.6], stem: [32, 0.28, 0.12, 0.74], cap: [30, 0.55, 0.1, 0.68], glow: [38, 0.9, 0.2, 0.82], acc: [12, 0.7, 0.2, 0.72], moss: [74, 0.45, 0.07, 0.5], peb: [24, 0.14, 0.1, 0.62], crys: [330, 0.45, 0.15, 0.9] },
  3: { leaf: [168, 0.45, 0.07, 0.62], stem: [210, 0.2, 0.12, 0.76], cap: [205, 0.55, 0.1, 0.72], glow: [190, 0.8, 0.2, 0.88], acc: [275, 0.6, 0.2, 0.84], moss: [160, 0.5, 0.06, 0.55], peb: [215, 0.14, 0.1, 0.64], crys: [200, 0.65, 0.15, 0.94] },
  4: { leaf: [18, 0.35, 0.05, 0.44], stem: [12, 0.2, 0.06, 0.46], cap: [14, 0.55, 0.08, 0.62], glow: [24, 0.95, 0.25, 0.78], acc: [44, 0.95, 0.3, 0.82], moss: [10, 0.25, 0.05, 0.34], peb: [8, 0.08, 0.05, 0.42], crys: [20, 0.8, 0.2, 0.82] },
  5: { leaf: [195, 0.35, 0.14, 0.84], stem: [205, 0.2, 0.2, 0.88], cap: [210, 0.45, 0.16, 0.88], glow: [192, 0.7, 0.3, 0.92], acc: [175, 0.55, 0.3, 0.92], moss: [190, 0.3, 0.12, 0.72], peb: [210, 0.12, 0.14, 0.74], crys: [200, 0.6, 0.25, 0.96] },
  6: { leaf: [272, 0.45, 0.06, 0.6], stem: [260, 0.2, 0.1, 0.64], cap: [285, 0.55, 0.08, 0.68], glow: [292, 0.8, 0.22, 0.84], acc: [190, 0.75, 0.25, 0.86], moss: [268, 0.4, 0.05, 0.46], peb: [260, 0.1, 0.06, 0.52], crys: [280, 0.6, 0.15, 0.92] },
  m: { leaf: [126, 0.5, 0.07, 0.62], stem: [40, 0.25, 0.12, 0.74], cap: [182, 0.6, 0.1, 0.76], glow: [174, 0.8, 0.2, 0.88], acc: [318, 0.65, 0.22, 0.84], moss: [130, 0.55, 0.06, 0.58], peb: [150, 0.08, 0.1, 0.62], crys: [180, 0.6, 0.15, 0.92] },
  d: { leaf: [58, 0.3, 0.1, 0.68], stem: [34, 0.3, 0.14, 0.76], cap: [28, 0.5, 0.12, 0.72], glow: [36, 0.85, 0.2, 0.84], acc: [8, 0.6, 0.2, 0.72], moss: [60, 0.3, 0.1, 0.56], peb: [30, 0.2, 0.14, 0.72], crys: [345, 0.45, 0.2, 0.92] },
  f: { leaf: [282, 0.4, 0.08, 0.64], stem: [270, 0.15, 0.14, 0.8], cap: [268, 0.55, 0.1, 0.74], glow: [292, 0.8, 0.22, 0.88], acc: [182, 0.8, 0.2, 0.88], moss: [300, 0.35, 0.07, 0.52], peb: [270, 0.08, 0.1, 0.6], crys: [190, 0.6, 0.15, 0.92] },
  j: { leaf: [98, 0.5, 0.07, 0.6], stem: [28, 0.32, 0.1, 0.68], cap: [22, 0.5, 0.1, 0.7], glow: [48, 0.85, 0.22, 0.84], acc: [345, 0.6, 0.22, 0.8], moss: [95, 0.5, 0.06, 0.52], peb: [32, 0.12, 0.1, 0.62], crys: [50, 0.5, 0.2, 0.9] },
};
export const RPLACES = Object.keys(PLACE);
/** A variant's palette: the place's ramps with every hue nudged by the same small seeded shift. */
export function palette(place, r) {
  const P = PLACE[place] || PLACE[1], jh = (r() - 0.5) * 26, js = 0.88 + r() * 0.24, out = {};
  for (const k in P) { const [h, s, l0, l1] = P[k]; out[k] = hramp(h + jh * (k === 'peb' ? 0.3 : 1), Math.min(1, s * js), l0, l1); }
  return out;
}
const lightOf = (place) => { const [h, s] = PLACE[place].glow; const c = hsl(h, s, 0.6); return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]; };

// ---------------------------------------------------------------- the L-system and its turtle
/** Rewrite the axiom n times (rules: symbol → string | (r) → string). Leftover A becomes B. */
export function lsys(axiom, rules, n, r, cap = 3000) {
  let s = axiom;
  for (let i = 0; i < n; i++) {
    let o = '';
    for (const ch of s) { const R = rules[ch]; o += R === undefined ? ch : typeof R === 'function' ? R(r) : R; }
    s = o;
    if (s.length > cap) break;
  }
  return s.replace(/A/g, 'B');
}
/**
 * Walk an L-system string. o: { x, y, z, th (tilt from vertical), ph (heading), a (turn), b (tilt
 * step), step (voxels), shrink (per branch depth), w0 (stem width), wd (width lost per depth),
 * trop (bend toward up: > 0; toward the floor plane: < 0), floor (keep y within 0..floor), stem
 * (ramp), leaf(s), bloom(s), r }. The stem is coloured dark at the foot, paler up and out.
 */
export function walk(g, str, o) {
  const r = o.r, st = [];
  let s = { x: o.x, y: o.y, z: o.z, th: o.th ?? 0, ph: o.ph ?? 0, d: 0, side: 1 };
  const S = o.stem, H = o.H || 40;
  for (const ch of str) {
    switch (ch) {
      case 'F': {
        const L = o.step * Math.pow(o.shrink ?? 0.86, s.d) * (0.8 + r() * 0.4);
        const hx = Math.sin(s.th) * Math.cos(s.ph), hy = Math.cos(s.th), hz = Math.sin(s.th) * Math.sin(s.ph);
        const w = Math.max(1, Math.round((o.w0 ?? 2) - s.d * (o.wd ?? 0.7)));
        const n = Math.max(2, Math.ceil(L * 2));
        for (let i = 1; i <= n; i++) {
          const t = i / n, x = s.x + hx * L * t, y = s.y + hy * L * t, z = s.z + hz * L * t;
          const k = Math.min(1, Math.max(0, y / H)), base = 1.6 + k * 2.6 + s.d * 0.25;
          if (w === 1) g.set(x, y, z, tone(S, base + 0.4));
          else for (let q = 0; q < w; q++) for (let p = 0; p < w; p++) {
            if (w > 2 && (q === 0 || q === w - 1) && (p === 0 || p === w - 1)) continue;
            g.set(x + q - (w - 1) / 2, y, z + p - (w - 1) / 2, tone(S, base + (q === 0 ? 0.9 : 0) - (p === w - 1 ? 0.5 : 0)));
          }
        }
        s.x += hx * L; s.y += hy * L; s.z += hz * L;
        if (o.floor !== undefined) s.y = Math.max(0, Math.min(o.floor, s.y));
        if (o.trop > 0) s.th *= 1 - o.trop;
        else if (o.trop < 0) s.th += (Math.PI / 2 - s.th) * -o.trop;
        break;
      }
      case '+': s.ph += o.a * (0.7 + r() * 0.6); break;
      case '-': s.ph -= o.a * (0.7 + r() * 0.6); break;
      case '&': s.th += o.b * (0.7 + r() * 0.6); break;
      case '^': s.th -= o.b * (0.7 + r() * 0.6); break;
      case '/': s.ph += 2.3999 + (r() - 0.5) * 0.4; s.side = -s.side; break; // the golden angle: leaves spiral
      case '[': st.push(s); s = { ...s, d: s.d + 1 }; break;
      case ']': s = st.pop() || s; break;
      case 'L': o.leaf?.(s); break;
      case 'B': o.bloom?.(s); break;
      default: break;
    }
  }
}

/** A flat leaf in any heading az (radians), rising `rise` per voxel, drooping at the tip: lit rim, dark midrib, warm tip. */
export function blade(g, x0, y0, z0, az, rise, L, W, R, o = {}) {
  const dx = Math.cos(az), dz = Math.sin(az), sx = -dz, sz = dx, droop = o.droop ?? 0.35, base = o.base ?? 1.8;
  for (let u = 0; u <= L; u += 0.6) {
    const t = u / L, half = (W / 2) * Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.62) * 0.96 + 0.04));
    const y = y0 + rise * u - droop * L * t * t;
    for (let v = -half; v <= half + 0.01; v += 0.6) {
      const edge = Math.abs(v) > half - 0.7, mid = Math.abs(v) < 0.35;
      const tt = base + Math.floor(t * 3) * 0.6 + (mid ? -0.7 : edge ? 1.4 : v < 0 ? 0.55 : -0.15);
      g.set(x0 + dx * u + sx * v, y + Math.abs(v) * (o.cup ?? 0.2), z0 + dz * u + sz * v, tone(R, tt), o.glow && edge && t > 0.3 ? o.glow : 0);
    }
  }
}

/** A cap profile: layers up from y, radius cr·prof(h), height capH; rim lit and (glowy) shining through, gills under it. */
function cap(g, cx, y, cz, cr, capH, prof, C, o = {}) {
  const top = Math.max(1, Math.round(capH)), p1 = ph(o.seed || 1, 1, 5) * TAU, p2 = ph(o.seed || 1, 2, 5) * TAU;
  const wob = (a) => 1 + 0.09 * Math.sin(3 * a + p1) + 0.06 * Math.sin(5 * a + p2);
  for (let yy = 0; yy < top; yy++) {
    const h = (yy + 0.5) / top, rr = cr * prof(h) + 0.3;
    if (rr < 0.4) continue;
    for (let z = Math.floor(cz - rr - 1); z <= Math.ceil(cz + rr + 1); z++) for (let x = Math.floor(cx - rr - 1); x <= Math.ceil(cx + rr + 1); x++) {
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), a = Math.atan2(dz, dx), R = rr * wob(a);
      if (d > R) continue;
      const rim = d > R - 1.05, dd = d / Math.max(0.6, R);
      if (o.hollow && yy > 0 && d < R - 1.4 && h > 0.5) continue; // a funnel's cup
      let c = tone(C, 2.1 + h * 2.4 + (Math.cos(a - 2.4) > 0.35 && dd < 0.8 ? 0.9 : 0) - (rim && h < 0.35 ? -1.6 : 0));
      let gl = 0;
      if (rim && h < 0.35 && o.glow) gl = 2; // light through the thin edge
      if (o.spots && cr > 3 && ph(x * 3 + 7, y + yy, (z * 5) ^ (o.seed | 0)) < o.spots && h > 0.25 && !rim) c = o.spotCol;
      if (o.bands && Math.round(h * 5) % 2 && !rim) { c = tone(o.bands, 4.6); gl = o.glow ? 2 : 0; }
      g.set(x, y + yy, z, c, gl);
    }
  }
  // gills: a radial ring of dark slits and lit ribs under the cap
  if (o.gills !== false && cr >= 2.5) {
    const gr = cr * prof(0.05) - 0.4;
    for (let z = Math.floor(cz - gr); z <= Math.ceil(cz + gr); z++) for (let x = Math.floor(cx - gr); x <= Math.ceil(cx + gr); x++) {
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d > gr || d < 0.8) continue;
      const rib = Math.abs((((Math.atan2(dz, dx) / TAU) * Math.round(gr * 2.6)) % 1 + 1) % 1 - 0.5) < 0.22;
      g.set(x, y - 1, z, rib ? (o.gillGlow ? tone(o.gillGlow, 4.5) : tone(C, 4)) : tone(C, 1), rib && o.gillGlow ? 2 : 0);
    }
  }
  return y + top;
}
const PROF = {
  dome: (h) => Math.sqrt(Math.max(0, 1 - h * h)),
  bell: (h) => Math.sqrt(Math.max(0, 1 - Math.pow(h, 2.6))) * (h < 0.25 ? 0.86 + h * 0.5 : 1),
  cone: (h) => Math.pow(Math.max(0, 1 - h), 0.85),
  flat: (h) => Math.sqrt(Math.max(0, 1 - Math.pow(h, 4))),
  umbo: (h) => (h < 0.7 ? Math.sqrt(Math.max(0, 1 - h * h * 0.9)) : 0.32 * (1 - (h - 0.7) / 0.3) + 0.12),
  funnel: (h) => 0.35 + 0.65 * Math.pow(h, 0.7),
};
const CAPH = { dome: 0.8, bell: 1.15, cone: 1.5, flat: 0.45, umbo: 0.85, funnel: 0.9 };

/** The usual companions round a generated plant (./finish.js groundBits) in its palette. */
function base(g, r, c, P, o = {}) {
  groundBits(g, r, c, c, o.rIn ?? 2, o.R ?? 10, {
    moss: o.moss === false ? null : P.moss, mossN: o.mossN ?? 2 + (r() < 0.5 ? 1 : 0), mossGlow: o.mossGlow ? P.glow : null,
    peb: P.peb, pebN: o.pebN ?? r.int(1, 3), bits: o.bits, roots: o.roots ? P.stem : null, rootN: 2,
    buttons: o.buttons ? [P.cap, o.buttons, !!o.glowy] : null, stemR: P.stem, sprouts: o.sprouts ? P.leaf : null, sproutN: o.sprouts || 0,
  });
}

// ---------------------------------------------------------------- the generators: (r, P) → model
/** Leafy herbs from an L-system: a stalk with spiralling leaves and a bloom, or a forked little bush. */
function herb(r, P) {
  const W = 45, H = 50, g = new VG(W, H, W), c = 22;
  const gram = r.int(0, 2), bloomKind = r.pick(['bell', 'star', 'spike', 'berry', 'orb']);
  const leafW = r.int(4, 6), leafL = r.int(7, 12), glowy = r() < 0.65;
  const bloom = (s) => {
    const { x, y, z } = s, A = P.acc, G = P.glow;
    if (bloomKind === 'bell') { // a nodding bell: the stem hooks over, the bell hangs open and glows inside
      const hx = Math.round(Math.cos(s.ph) * 2), hz = Math.round(Math.sin(s.ph) * 2);
      g.set(x + hx / 2, y + 1, z + hz / 2, tone(P.stem, 4)); g.set(x + hx, y, z + hz, tone(P.stem, 4));
      for (let k = 0; k < 4; k++) { const rr = k < 1 ? 0.6 : k < 3 ? 1.4 : 1.9; for (let a = 0; a < TAU; a += 0.5) g.set(x + hx + Math.cos(a) * rr, y - 1 - k, z + hz + Math.sin(a) * rr, tone(A, 3 + k * 0.6 + (Math.cos(a - 2.4) > 0.3 ? 1 : 0)), k === 3 ? 2 : 0); }
      g.set(x + hx, y - 3, z + hz, tone(G, 6), 3); g.set(x + hx, y - 4, z + hz, tone(G, 5), 3);
    } else if (bloomKind === 'star') { // five pointed petals round a glowing eye
      const n = 5 + (r() < 0.4 ? 1 : 0), a0 = r() * TAU;
      for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; for (let k = 1; k <= 3; k++) { g.set(x + Math.cos(a) * k, y + (k === 3 ? 1 : 0), z + Math.sin(a) * k, tone(A, 3 + k * 0.9), k === 3 && glowy ? 2 : 0); if (k === 2) { g.set(x + Math.cos(a + 0.35) * k, y, z + Math.sin(a + 0.35) * k, tone(A, 3.4)); } } }
      g.set(x, y, z, tone(G, 6), 3); g.set(x, y + 1, z, tone(P.acc, 6), 2);
    } else if (bloomKind === 'spike') { // a spike of tiny florets, opening from the bottom
      for (let k = 0; k < 7; k++) { g.set(x, y + k, z, tone(P.stem, 4)); const a = k * 2.4; const op = k < 4; g.set(x + Math.round(Math.cos(a)), y + k, z + Math.round(Math.sin(a)), tone(op ? A : P.leaf, op ? 4 + (k & 1) : 3.5), op && glowy ? 2 : 0); }
      g.set(x, y + 7, z, tone(G, 5), 2);
    } else if (bloomKind === 'berry') { // a cluster of glowing berries
      for (let i = 0; i < 5; i++) { const a = i * 2.4, d = i ? 1.3 : 0; g.set(x + Math.cos(a) * d, y - (i ? 1 : 0), z + Math.sin(a) * d, tone(G, i ? 5 : 6), glowy ? 3 : 1); g.set(x + Math.cos(a) * d, y - (i ? 2 : 1), z + Math.sin(a) * d, tone(G, 3.5), glowy ? 2 : 0); }
    } else { // a round glowing bud in a cup of sepals
      g.blob(x, y + 2, z, 1.7, 1.9, 1.7, (dx, dy) => tone(G, dy > 0.3 ? 6 : 4.6), glowy ? 3 : 1, Math.round(x * 7 + z), 0.1);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; g.set(x + Math.cos(a) * 1.6, y + 1, z + Math.sin(a) * 1.6, tone(P.leaf, 4)); }
    }
  };
  const leaf = (s) => blade(g, s.x, s.y, s.z, s.ph, 0.35 + r() * 0.3, Math.max(3, leafL * Math.pow(0.85, s.d) * (0.8 + r() * 0.4)), leafW, P.leaf, { droop: 0.3 + r() * 0.25, glow: 0 });
  // basal rosette: big leaves round the foot, overlapping
  const nb = r.int(3, 5), a0 = r() * TAU;
  for (let i = 0; i < nb; i++) blade(g, c, 1, c, a0 + (i / nb) * TAU + r() * 0.4, 0.25 + r() * 0.25, leafL + r.int(1, 5), leafW + 1, P.leaf, { droop: 0.45 + r() * 0.2, base: 1.4 + r() * 0.6 });
  const stalks = gram === 2 ? r.int(2, 3) : 1;
  for (let k = 0; k < stalks; k++) {
    let str;
    if (gram === 0) str = lsys('A', { A: (q) => (q() < 0.14 ? 'F[&&L]F[+&FA]/A' : 'F[&L]F/A') }, r.int(4, 6), r);
    else if (gram === 1) str = lsys('FA', { A: (q) => (q() < 0.55 ? 'F[+&LA]/[-&LA]' : 'F[&L]/F[&LA]/A') }, r.int(3, 4), r);
    else str = lsys('FA', { A: (q) => (q() < 0.3 ? 'F[&L]/A' : 'FF/A') }, r.int(3, 5), r);
    walk(g, str, { r, x: c + (k ? r.int(-4, 4) : 0), y: 1, z: c + (k ? r.int(-4, 4) : 0), th: 0.1 + r() * 0.25 + k * 0.15, ph: r() * TAU, a: 0.7, b: 0.5, step: gram === 1 ? 5 : 3.6, shrink: 0.85, w0: gram === 1 ? 3 : 2, wd: 0.8, trop: 0.18, stem: P.stem.map((v, i) => (i < 3 ? P.leaf[i + 1] : v)), H: 44, leaf, bloom });
  }
  base(g, r, c, P, { R: 13, rIn: 3, bits: [tone(P.acc, 4.6), r.int(2, 4), glowy], sprouts: r.int(1, 3), mossGlow: glowy && r() < 0.5 });
  dew(g, r, r.int(3, 6), 4);
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** Coral fungus: tubes that fork and fork again from an L-system, pale toward the tips, which glow. */
function coral(r, P) {
  const W = 41, H = 40, g = new VG(W, H, W), c = 20, glowy = r() < 0.75;
  const C = r() < 0.5 ? P.cap : P.acc, T = P.glow;
  const clumps = r.int(1, 3);
  for (let k = 0; k < clumps; k++) {
    const str = lsys('FA', { A: (q) => (q() < 0.55 ? 'F[&+A]/[&-A]' : q() < 0.5 ? 'F[&A]/[&A]/[&A]' : 'F/[&A]FA') }, r.int(3, 4), r); // (the tips left over bloom)
    const bx = c + (k ? r.int(-7, 7) : 0), bz = c + (k ? r.int(-7, 7) : 0), sc = k ? 0.7 : 1;
    walk(g, str, { r, x: bx, y: 0, z: bz, th: 0.12, ph: r() * TAU, a: 0.9, b: 0.42, step: 5.5 * sc, shrink: 0.82, w0: k ? 2 : 3, wd: 0.7, trop: 0.22, stem: C, H: 30 * sc,
      bloom: (s) => { g.set(s.x, s.y + 1, s.z, tone(T, 6), glowy ? 3 : 1); g.set(s.x, s.y, s.z, tone(C, 5.5), glowy ? 2 : 0); if (r() < 0.4) g.set(s.x + 1, s.y + 1, s.z, tone(T, 5), glowy ? 2 : 0); } });
  }
  base(g, r, c, P, { R: 12, rIn: 3, bits: [tone(C, 5), r.int(2, 5), false], buttons: r() < 0.4 ? r.int(1, 2) : 0, mossGlow: true, glowy });
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** A mushroom cluster from a part grammar: a shape for the clutch, one big cap and its smaller kin leaning away. */
function shroom(r, P) {
  const W = 47, H = 50, g = new VG(W, H, W), c = 23;
  const shape = r.pick(['dome', 'bell', 'cone', 'flat', 'umbo', 'funnel', 'dome', 'bell']);
  const C = r() < 0.7 ? P.cap : P.acc, glowy = r() < 0.7, spots = r() < 0.4 ? 0.06 + r() * 0.06 : 0;
  const banded = !spots && glowy && r() < 0.14;
  const n = r.int(3, 5), tall = 0.8 + r() * 0.6, lean = 0.1 + r() * 0.25;
  const caps = [];
  for (let i = 0; i < n; i++) {
    const k = i === 0 ? 1 : 0.3 + 0.55 * Math.pow(r(), 1.4), a = i * 2.4 + r() * 0.8, d = i === 0 ? r() * 1.5 : 3.5 + Math.sqrt(r()) * 8;
    caps.push({ k, x: c + Math.cos(a) * d, z: c + Math.sin(a) * d, a });
  }
  caps.sort((p, q) => q.k - p.k);
  for (const m of caps) {
    const h = Math.round((7 + 17 * m.k) * tall), cr = 1.6 + 6 * m.k, w = m.k > 0.8 ? 3 : m.k > 0.5 ? 2 : 1;
    const out = lean * h * (m.k < 1 ? 0.5 : 0.2), tx = m.x + Math.cos(m.a) * out, tz = m.z + Math.sin(m.a) * out;
    // a curved stem, paler up top, a darker bulb at the foot, a skirt (ring) on the big ones
    g.strand([m.x, 0, m.z], [m.x + Math.cos(m.a) * out * 0.2, h * 0.6, m.z + Math.sin(m.a) * out * 0.2], [tx, h, tz], w + (m.k > 0.8 ? 0.6 : 0), w, (t, e) => tone(P.stem, 2.2 + t * 2.8 + (e ? 0.6 : 0)));
    if (m.k > 0.7) for (let i = 0; i < 12; i++) { const aa = (i / 12) * TAU; g.set(tx + Math.cos(aa) * (w * 0.5 + 0.9), Math.round(h * 0.72) - (i % 3 === 0 ? 1 : 0), tz + Math.sin(aa) * (w * 0.5 + 0.9), tone(P.stem, 5.4)); }
    const ch = cr * CAPH[shape] * (0.85 + r() * 0.3);
    const topY = cap(g, tx, h, tz, cr, ch, PROF[shape], C, { glow: glowy, seed: Math.round(m.x * 13 + m.z), spots, spotCol: r() < 0.5 ? 0xf6f0e6 : tone(P.acc, 6), bands: banded ? P.glow : null, gillGlow: glowy ? P.glow : null, hollow: shape === 'funnel' });
    if (m.k === 1 && r() < 0.7) g.set(tx + 1, topY, tz - 1, 0xeafcff, 1); // a dew bead on the crown
  }
  base(g, r, c, P, { R: 15, rIn: 3, bits: [tone(C, 4.4), r.int(2, 5), glowy], buttons: r.int(1, 4), roots: r() < 0.5, mossGlow: glowy && r() < 0.6, glowy });
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** A moss cushion: lumpy overlapping mounds, banded, with spore capsules on thin stalks and star tips. */
function moss(r, P) {
  const W = 33, g = new VG(W, 14, W), c = 16, M = P.moss;
  const n = r.int(2, 4);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = i ? 3 + r() * 7 : 0, x = c + Math.cos(a) * d, z = c + Math.sin(a) * d, rx = (i ? 3.5 + r() * 3 : 6 + r() * 3), ry = 1.6 + r() * 1.8;
    g.blob(x, 0, z, rx, ry, rx * (0.75 + r() * 0.5), (dx, dy, dz, X, Y, Z) => {
      const n2 = ph(X >> 1, Z >> 1, Y + i * 7);
      return dy > 0.55 ? tone(M, 4.4 + (n2 < 0.3 ? 1 : 0)) : dy > 0.1 ? tone(M, 3.2 + (n2 < 0.25 ? 0.8 : 0)) : tone(M, 2.2);
    }, 0, i * 13 + 2, 0.28);
  }
  // spore capsules: a wiry red-brown seta and a fat little capsule, a few glowing
  const glowy = r() < 0.6;
  for (let i = 0, k = r.int(4, 10); i < k; i++) {
    const x = Math.round(c + (r() - 0.5) * 14), z = Math.round(c + (r() - 0.5) * 14);
    let y = 0;
    while (y < 10 && g.has(x, y, z)) y++;
    if (!y) continue;
    const L = r.int(2, 5), lx = r() < 0.5 ? 1 : 0;
    for (let q = 0; q < L; q++) g.set(x + (q > L - 2 ? lx : 0), y + q, z, tone(P.stem, 2.5 + q * 0.5));
    g.set(x + lx, y + L, z, tone(P.acc, 4.6), glowy && i % 2 ? 2 : 0);
    g.set(x + lx, y + L + 1, z, tone(P.acc, 5.6), glowy && i % 2 ? 3 : 0);
  }
  // star tips: little four-armed rosettes poking out of the crown
  for (let i = 0; i < r.int(3, 7); i++) {
    const x = Math.round(c + (r() - 0.5) * 12), z = Math.round(c + (r() - 0.5) * 12);
    let y = 0;
    while (y < 10 && g.has(x, y, z)) y++;
    if (!y) continue;
    g.set(x, y, z, tone(M, 6));
    if (r() < 0.6) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.add(x + dx, y, z + dz, tone(M, 5));
  }
  groundBits(g, r, c, c, 8, 15, { peb: P.peb, pebN: r.int(1, 3), bits: [tone(M, 5), r.int(2, 5), false] });
  dew(g, r, r.int(2, 5), 1);
  return { g, pivot: [c, 0, c], mode: 'flat' };
}

/** Lichen rosettes: lobed crusts in rings of colour, a lit curled rim, cup-shaped fruits. */
function lichen(r, P) {
  const W = 31, g = new VG(W, 5, W), c = 15, A = r() < 0.5 ? P.moss : P.cap, B = P.acc;
  for (let i = 0, n = r.int(3, 6); i < n; i++) {
    const a = r() * TAU, d = i ? Math.sqrt(r()) * 9 : 0, x = c + Math.cos(a) * d, z = c + Math.sin(a) * d, rad = 2.5 + r() * 3.5, RR = i % 3 === 2 ? B : A;
    g.patch(x, 0, z, rad, rad * (0.75 + r() * 0.5), (dx, dz, X, Z, rim) => {
      const dd = Math.hypot(dx, dz);
      return rim ? tone(RR, 5) : Math.round(dd * 4) % 2 ? tone(RR, 3.4) : tone(RR, 2.4 + (dd < 0.3 ? -0.8 : 0));
    }, 0, i * 9 + 1, 0.4);
    // the curled lobes stand up a voxel round the rim
    for (let q = 0, m = Math.round(rad * 2.4); q < m; q++) { const la = (q / m) * TAU + r() * 0.3; g.add(x + Math.cos(la) * rad * 0.85, 1, z + Math.sin(la) * rad * 0.85, tone(RR, 5.6)); }
  }
  // cup fruits: little rings with a dark (or glowing) eye
  const glowy = r() < 0.5;
  for (let i = 0, k = r.int(3, 8); i < k; i++) {
    const x = Math.round(c + (r() - 0.5) * 18), z = Math.round(c + (r() - 0.5) * 18);
    if (!g.has(x, 0, z)) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(x + dx, 1, z + dz, tone(B, 4.4 + (dx < 0 ? 1 : 0)));
    g.set(x, 1, z, glowy ? tone(P.glow, 5.5) : tone(B, 1.4), glowy ? 2 : 0);
  }
  groundBits(g, r, c, c, 4, 13, { peb: P.peb, pebN: r.int(1, 4) });
  return { g, pivot: [c, 0, c], mode: 'flat' };
}

/** A root tangle: thick roots arching out of the floor and diving back, rootlets, moss on their backs. */
function roots(r, P) {
  const W = 45, H = 24, g = new VG(W, H, W), c = 22, S = P.stem;
  for (let i = 0, n = r.int(3, 6); i < n; i++) {
    const a = r() * TAU, L = 10 + r() * 12, d0 = r() * 4, x0 = c + Math.cos(a) * d0, z0 = c + Math.sin(a) * d0, b = a + (r() - 0.5) * 1.4;
    const x1 = x0 + Math.cos(b) * L, z1 = z0 + Math.sin(b) * L, top = 4 + r() * 9, w = r() < 0.4 ? 3 : 2;
    g.strand([x0, 0, z0], [(x0 + x1) / 2, top * 1.9, (z0 + z1) / 2], [x1, 0, z1], w + 0.5, w - 0.6, (t, e) => tone(S, 1.8 + Math.sin(t * Math.PI) * 2 + (e ? 0.7 : 0) + (Math.round(t * 20) % 5 === 0 ? -0.6 : 0)));
    // moss on the arch's back
    for (let k = 3; k < 17; k++) { const t = k / 20, u = 1 - t, x = u * u * x0 + 2 * u * t * (x0 + x1) / 2 + t * t * x1, z = u * u * z0 + 2 * u * t * (z0 + z1) / 2 + t * t * z1, y = 2 * u * t * top * 1.9 + w * 0.5; if (r() < 0.6) g.add(x, Math.round(y) + 1, z, tone(P.moss, 3.5 + (k & 1)), r() < 0.08 ? 2 : 0); }
    // rootlets
    for (let k = 0; k < 3; k++) { const t = 0.15 + r() * 0.7, u = 1 - t, x = u * u * x0 + 2 * u * t * (x0 + x1) / 2 + t * t * x1, z = u * u * z0 + 2 * u * t * (z0 + z1) / 2 + t * t * z1, y = 2 * u * t * top * 1.9; const ra = r() * TAU; for (let q = 1; q < 5; q++) g.add(x + Math.cos(ra) * q * 0.7, y - q, z + Math.sin(ra) * q * 0.7, tone(S, 3.6 + q * 0.3)); }
  }
  base(g, r, c, P, { R: 16, rIn: 4, mossN: 3, sprouts: r.int(1, 3), buttons: r() < 0.4 ? 2 : 0 });
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** A glowing creeper: stems that wander over the floor (an L-system bent flat), leaflets and glowing buds. */
function creeper(r, P) {
  const W = 49, g = new VG(W, 10, W), c = 24;
  const str = lsys('A', { A: (q) => (q() < 0.2 ? 'F[+L][-B]F[-FA]+A' : q() < 0.5 ? 'F[+L]F[-L]+A' : 'F[-L]/F[+B]-A') }, r.int(5, 7), r);
  for (let k = 0, n = r.int(2, 3); k < n; k++) {
    walk(g, str, { r, x: c, y: 0, z: c, th: Math.PI / 2, ph: (k / n) * TAU + r(), a: 0.55, b: 0, step: 3.4, shrink: 0.97, w0: 1, wd: 0, trop: -0.5, floor: 1, stem: P.stem, H: 6,
      leaf: (s) => { const side = s.side; blade(g, s.x, 1, s.z, s.ph + side * (1.2 + r() * 0.4), 0.45, r.int(2, 4), r.int(2, 3), P.leaf, { droop: 0.1, cup: 0.3 }); },
      bloom: (s) => { g.set(s.x, 1, s.z, tone(P.glow, 6), 3); g.set(s.x, 2, s.z, tone(P.glow, 5), 2); if (r() < 0.5) g.set(s.x + 1, 1, s.z, tone(P.acc, 5), 2); } });
  }
  groundBits(g, r, c, c, 3, 18, { moss: P.moss, mossN: 2, peb: P.peb, pebN: r.int(1, 2) });
  return { g, pivot: [c, 0, c], mode: 'flat' };
}

/** Crystal lichen: a crust with clusters of small faceted prisms growing out of it, glowing at their points. */
function crystal(r, P) {
  const W = 35, H = 28, g = new VG(W, H, W), c = 17, X = P.crys;
  g.patch(c, 0, c, 9 + r() * 4, 8 + r() * 4, (dx, dz, x, z, rim) => (rim ? tone(P.moss, 4) : ph(x, z, 3) < 0.3 ? tone(X, 2) : tone(P.moss, 2.6)), 0, 5, 0.38);
  for (let i = 0, n = r.int(4, 9); i < n; i++) {
    const a = r() * TAU, d = i ? 2 + Math.sqrt(r()) * 9 : 0, x0 = c + Math.cos(a) * d, z0 = c + Math.sin(a) * d;
    const h = Math.round((i ? 4 + r() * 9 : 12 + r() * 10)), w = i ? (r() < 0.5 ? 2 : 1) : 3, lx = Math.cos(a) * (0.12 + r() * 0.2), lz = Math.sin(a) * (0.12 + r() * 0.2);
    for (let y = 0; y <= h; y++) {
      const t = y / h, ww = t > 0.8 ? Math.max(1, w - 1) : w, x = x0 + lx * y, z = z0 + lz * y;
      for (let q = 0; q < ww; q++) for (let p = 0; p < ww; p++) {
        const lit = q === 0, dark = p === ww - 1 && ww > 1;
        g.set(x + q, y + 1, z + p, t > 0.88 ? tone(X, 6) : lit ? tone(X, 4.6 + t) : dark ? tone(X, 2 + t) : tone(X, 3.2 + t * 1.5), t > 0.7 ? 3 : t > 0.35 ? 1 : 0);
      }
    }
  }
  groundBits(g, r, c, c, 5, 15, { peb: P.peb, pebN: r.int(1, 3), bits: [tone(X, 5), r.int(2, 5), true] });
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** Cave grass: two-tone blades of many lengths, curving out, some with seed heads and a few tiny blossoms. */
function grass(r, P) {
  const H = r.int(16, 26), W = 37, g = new VG(W, H + 4, W), c = 18, A = P.leaf, B = r() < 0.5 ? P.moss : P.stem;
  for (let i = 0, n = r.int(12, 20); i < n; i++) {
    const a = r() * TAU, L = Math.round(H * (0.35 + r() * 0.65)), lean = 0.2 + r() * 0.5, x0 = c + (r() - 0.5) * 6, z0 = c + (r() - 0.5) * 6, RR = r() < 0.75 ? A : B, tn = r() * 1.2;
    for (let k = 0; k <= L; k++) {
      const t = k / L, s = lean * L * Math.pow(t, 1.7), x = x0 + Math.cos(a) * s, z = z0 + Math.sin(a) * s, y = Math.round(k * (1 - 0.3 * t * t));
      g.set(x, y, z, tone(RR, 1.5 + tn + t * 3.4), 0);
      if (t < 0.35) g.set(x - Math.sin(a), y, z + Math.cos(a), tone(RR, 1.2 + tn + t * 3));
    }
  }
  const glowy = r() < 0.4;
  for (let i = 0, n = r.int(0, 3); i < n; i++) { // seed heads
    const x0 = c + r.int(-2, 2), z0 = c + r.int(-2, 2), L = H + r.int(0, 3);
    for (let k = 0; k <= L; k++) { g.set(x0, k, z0, tone(P.stem, 2.5 + k / L * 2)); if (k > L * 0.65 && k % 2 === 0) { g.set(x0 + (k & 2 ? 1 : -1), k, z0, tone(P.acc, 4.5), glowy ? 2 : 0); } }
  }
  for (let i = 0, n = r.int(1, 4); i < n; i++) { // blossoms caught in the blades
    const x = r.int(4, W - 5), y = r.int(Math.round(H * 0.3), H), z = r.int(4, W - 5);
    if (g.has(x, y, z)) { g.set(x, y + 1, z, tone(P.acc, 5.6), glowy ? 2 : 0); g.add(x + 1, y + 1, z, tone(P.acc, 4.4)); }
  }
  groundBits(g, r, c, c, 3, 12, { moss: P.moss, mossN: 2, peb: P.peb, pebN: r.int(1, 3) });
  dew(g, r, r.int(2, 4), 6);
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** Puffballs: a clutch of warty, lumpy balls, lit on top, one burst at the crown with a glowing spore haze. */
function puff(r, P) {
  const W = 37, g = new VG(W, 26, W), c = 18, C = r() < 0.7 ? hramp(34 + (r() - 0.5) * 30, 0.3, 0.34, 0.97) : P.cap;
  const n = r.int(2, 6), burst = r.int(0, n - 1);
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + r(), d = i ? 4 + Math.sqrt(r()) * 8 : 0, x = c + Math.cos(a) * d, z = c + Math.sin(a) * d, rr = i ? 2 + r() * 2.6 : 4.5 + r() * 2, ry = rr * (0.8 + r() * 0.25);
    g.blob(x, ry * 0.9, z, rr, ry, rr, (dx, dy, dz, X, Y, Z) => {
      if (i === burst && dy > 0.62 && Math.hypot(dx, dz) < 0.42) return -1; // the torn crown
      const wart = ph(X, Y, Z * 3 + i) < 0.12;
      return wart ? tone(C, 6) : dy > 0.4 ? tone(C, 4.6 + (dx < -0.2 ? 0.8 : 0)) : dy < -0.35 ? tone(C, 2) : tone(C, 3.4);
    }, 0, i * 7 + 3, 0.16);
    if (i === burst) { // the spores: a glowing core and a haze of motes rising
      g.set(x, ry * 1.6, z, tone(P.glow, 5), 2);
      for (let k = 0; k < 6; k++) g.set(x + r.int(-2, 2), ry * 2 + 1 + k * 1.3, z + r.int(-2, 2), tone(P.glow, 5 + (k & 1)), 2);
    }
  }
  base(g, r, c, P, { R: 15, rIn: 5, bits: [tone(C, 4), r.int(2, 4), false], sprouts: r.int(0, 2) });
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** A hanging spore curtain: a mycelium pad on the roof, threads hung with glowing beads, a drop at each end. */
function curtain(r, P) {
  const L = r.int(38, 56), W = 31, D = 15, top = L + 3, g = new VG(W, top + 3, D), cx = 15, cz = 7;
  const T = r() < 0.5 ? P.glow : P.acc, S = P.stem;
  g.patch(cx, top - 1, cz, 12, 5.5, (dx, dz, X, Z, rim) => (rim ? tone(S, 3) : ph(X, Z, 9) < 0.25 ? tone(T, 3) : tone(S, 4.4)), 0, 13, 0.3, 2);
  for (let i = 0, n = r.int(8, 15); i < n; i++) {
    const x0 = cx + (r() - 0.5) * 20, z0 = cz + (r() - 0.5) * 7, len = Math.round(L * (0.3 + r() * 0.7)), sw = (r() - 0.5) * 2, beadK = r.int(4, 7);
    for (let k = 0; k < len; k++) {
      const t = k / len, x = x0 + Math.sin(t * 3 + i) * sw, y = top - 2 - k;
      const bead = k % beadK === beadK - 1;
      g.set(x, y, z0, bead ? tone(T, 5.5) : tone(S, 4 + t), bead ? 2 : t > 0.8 ? 1 : 0);
      if (bead && r() < 0.5) g.set(x + 1, y, z0, tone(T, 4.5), 1);
    }
    g.set(x0 + Math.sin(3 + i) * sw, top - 2 - len, z0, tone(T, 6), 3); // the drop
  }
  return { g, pivot: [cx, top + 1, cz], mode: 'down' };
}

// ---------------------------------------------------------------- the kinds
const GEN = { herb, coral, shroom, moss, lichen, roots, creeper, crystal, grass, puff, curtain };
// flora kind templates (see flora.js KINDS); amb: purely ambient (thinned on phones)
const TEMPLATE = {
  herb: { lay: 'cross', sc: [0.8, 1.2], sway: 0.06, rank: 1, glow: 1, h: 0.55, push: 0.8 },
  coral: { lay: 'cross', sc: [0.85, 1.2], sway: 0.008, rank: 1, glow: 1, push: 0.25 },
  shroom: { lay: 'cross', sc: [0.85, 1.2], sway: 0.006, rank: 1, glow: 1, h: 0.5, push: 0.3 },
  moss: { lay: 'flat', sc: [0.8, 1.2], rank: 'r', push: 0.05, glow: 0.8, amb: 1 },
  lichen: { lay: 'flat', sc: [0.8, 1.15], rank: 'r', push: 0, glow: 0.8, amb: 1 },
  roots: { lay: 'cross', sc: [0.85, 1.2], sway: 0, rank: 0.9, push: 0.05, amb: 1 },
  creeper: { lay: 'flat', sc: [0.85, 1.2], rank: 'r2', glow: 1, push: 0.15 },
  crystal: { lay: 'cross', sc: [0.85, 1.15], sway: 0, rank: 1, glow: 1, push: 0, amb: 1 },
  grass: { lay: 'cross', sc: [0.85, 1.2], sway: 0.05, rank: 'r', h: 0.4 },
  puff: { lay: 'cross', sc: [0.85, 1.2], sway: 0, rank: 0.9, glow: 0.6, push: 0.15 },
  curtain: { lay: 'hang', len: [0.45, 0.95], sway: 0.05, rank: 1, hang: true, glow: 1, amb: 1 },
};
// what the harvestable ones give (the rest are ambient)
const DROP = {
  herb: ['stone_thyme', 'cave_garlic', 0.12], coral: ['mushroom', 'truffle', 0.04], shroom: ['mushroom', 'glowcap', 0.25], moss: ['glow_moss', 'sparkmoss', 0.08],
  creeper: ['cave_berry', 'sparkmoss', 0.15], puff: ['spore_puff'], grass: ['stone_thyme'],
};
export const RMODELS = {}, RKINDS = {}, RDROPS = {};
for (const base of Object.keys(GEN)) for (const place of RPLACES) {
  const name = base + '_' + place;
  RMODELS[name] = (r) => GEN[base](r, palette(place, r));
  RKINDS[name] = { ...TEMPLATE[base], v: 8, m: name, rnd: 1, ...(TEMPLATE[base].glow ? { light: lightOf(place) } : {}) };
  if (DROP[base]) RDROPS[name] = DROP[base];
}

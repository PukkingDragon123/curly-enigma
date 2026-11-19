// Art for the stamina gauge (src/ui/Stamina.js) in the house style ("Lamplight Woodcut"): flat tones,
// hatching for shade, texture marks for the material, a dark-plum outline broken on the lit side.
// Drawn at R fine pixels per art pixel (R = the page's --px, so the canvas sits 1:1 on CSS pixels
// and never smears); one art pixel = one --px like the rest of the HUD.
//  - a carved walnut stave, lopsided along its top, grain cut in long strokes, a knot; a trough
//    gouged along it (stamina, hunger and injury are painted into GEO.ch every frame); hand-forged
//    iron staples clamp the trough at the quarters; an iron shoe on the right end, two square nails
//  - on the left a medallion (wave 19: it replaced the oil lamp): a lopsided forged iron ring with
//    three square rivets, a carved oak bevel ribbed with gouge cuts, a deep plum recess the mole's
//    live 3D face (src/ui/staminaFace.js) sits in; the ring's lower half is drawn again over the
//    face (layers.front) so the head leans out of the frame, its helmet over the top rim
// Light from the top left. Shadows fall to plum, highlights stop at cream.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
const h2 = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (h2(xi, yi, s) * (1 - u) + h2(xi + 1, yi, s) * u) * (1 - v) + (h2(xi, yi + 1, s) * (1 - u) + h2(xi + 1, yi + 1, s) * u) * v;
}

/** Layout in art pixels. ch: the trough (x0..x1, y0..y1 inclusive); med: the medallion; face: the 3D face's box. */
export const GEO = {
  W: 112, H: 38,
  strap: { x0: 24, x1: 111, y0: 20, y1: 37 },
  ch: { x0: 38, x1: 103, y0: 25, y1: 31 },
  med: { cx: 17, cy: 21.4, r: 16.1, ring: 2.7, bevel: 2.3 },
  face: { x: 0, y: 0, w: 34, h: 36 },
};

// colours as 0xRRGGBB; the canvas buffer wants 0xAABBGGRR
export const pk = (c, a = 255) => ((a << 24) | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;

/** Flat tones, darkest first (3–5 per material). */
export const PAL = {
  ink: 0x26101e,
  cream: 0xf6e6c4,
  walnut: [0x2e1820, 0x4a2a24, 0x683c2a, 0x885434, 0xaa7244],
  oak: [0x4a2c24, 0x7a4a2e, 0xa26a3c, 0xc69050, 0xe2b674],
  iron: [0x221a26, 0x38303e, 0x544a58, 0x786c76, 0xa89a9a],
  recess: [0x170c1a, 0x221428, 0x2e1c30, 0x3c2632, 0x52362e],
  trough: [0x1a0e1c, 0x261624, 0x34202c],
  stam: [0x5a2212, 0x9a4418, 0xce7828, 0xeeaa46, 0xf8d88e],
  low: [0x4a1214, 0x86221a, 0xbe421e, 0xe6743a, 0xf6b884],
  hunger: [0x5a3418, 0x8a5a28, 0xb6823a, 0xdaac5c, 0xf0d290],
  linen: [0x5a4a46, 0x8e7e70, 0xbeac92, 0xe0d2b4, 0xf4eada],
  blood: [0x4a0e16, 0x7a1a1e, 0xa82e26],
};
/** Hatch spacing in fine pixels (about 1.4 art pixels at any R). */
export const hatchP = (R) => Math.max(3, Math.round(R * 1.4));

/** The medallion's lopsided outer radius at angle a (art px). */
export function medR(a) {
  const M = GEO.med;
  return M.r + 0.38 * Math.sin(3 * a + 0.7) + 0.22 * Math.sin(5 * a + 2.1) + 0.18 * Math.sin(2 * a - 0.4);
}

const cache = new Map();
/**
 * The static layers at R fine px per art px (made once per R):
 * { W, H, R, base, front (the ring's lower half, drawn over the face), clip (where the face may draw),
 * rec (the recess, where the face's shadow falls) }.
 */
export function gaugeLayers(R) {
  if (cache.has(R)) return cache.get(R);
  const W = GEO.W * R, H = GEO.H * R;
  const base = new Uint32Array(W * H), front = new Uint32Array(W * H), clip = new Uint8Array(W * H);
  const kind = new Uint8Array(W * H); // 1 stave, 2 medallion
  const P = hatchP(R);
  const S = GEO.strap, C = GEO.ch, M = GEO.med;
  const WAL = PAL.walnut, IR = PAL.iron, OAK = PAL.oak, RC = PAL.recess, TR = PAL.trough, INK = PAL.ink;
  const put = (fx, fy, c, k = 0) => { if (fx < 0 || fy < 0 || fx >= W || fy >= H) return; const i = fy * W + fx; base[i] = pk(c); if (k) kind[i] = k; };

  // ---------------------------------------------------------------- the stave
  const topY = (u) => S.y0 + 0.4 * Math.sin(u * 0.31 + 1.2) + 0.25 * Math.sin(u * 0.83) + 0.3;
  const botY = (u) => S.y1 + 1 - 0.3 * Math.sin(u * 0.27 + 2.0) - 0.2;
  const inStave = (u, v) => {
    if (u < S.x0 || u >= S.x1 + 1) return false;
    const t = topY(u), b = botY(u);
    if (v < t || v >= b) return false;
    const rr = 3.2, ex = S.x1 + 1 - rr; // the right end rounded (a little more at the bottom)
    if (u > ex) { if (v < t + rr && Math.hypot(u - ex, v - (t + rr)) > rr) return false; if (v > b - rr - 0.6 && Math.hypot(u - ex, (v - (b - rr - 0.6)) * 0.9) > rr) return false; }
    return true;
  };
  const grain = (u, ar) => vnoise(u / 8.5, ar * 1.7, 11) > 0.71; // a long cut along the grain on art row ar
  const knot = { u: 74.5, v: 34.2 };
  for (let fy = 0; fy < H; fy++) for (let fx = 0; fx < W; fx++) {
    const u = (fx + 0.5) / R, v = (fy + 0.5) / R;
    if (!inStave(u, v)) continue;
    const dv = v - topY(u), db = botY(u) - v;
    let c = WAL[2];
    if (dv < 1.1) c = dv < 1 / R + 0.01 && ((fx / (2 * R)) | 0) % 5 !== 2 ? WAL[4] : WAL[3]; // the lit top edge, a nick or two in it
    else if (db < 2.2) c = (fx - fy + 999 * P) % P === 0 ? WAL[0] : WAL[1]; // the underside: hatched
    else {
      const ar = Math.floor(v);
      if (fy === ar * R + (R >> 1) && grain(u, ar)) c = WAL[1];
      else if (fy === ar * R + (R >> 1) && dv < 5 && vnoise(u / 6, ar * 2.3, 17) < 0.16) c = WAL[3];
      const kd = Math.hypot((u - knot.u) / 1.9, (v - knot.v) / 1.05);
      if (kd < 0.55) c = WAL[0]; else if (kd < 1 && kd > 0.78) c = WAL[1]; else if (kd < 1.5 && kd > 1.3 && v < knot.v) c = WAL[3];
    }
    // the trough: gouged along the stave (its lip casts a cut shadow; the lower lip catches the light)
    const inCh = u >= C.x0 && u < C.x1 + 1 && v >= C.y0 && v < C.y1 + 1;
    if (inCh) {
      const j = fy - C.y0 * R;
      c = j < R ? TR[0] : fy >= (C.y1 + 1) * R - 1 ? TR[2] : TR[1];
      if (j >= R && fy % R === 0 && vnoise(u / 5, v * 3, 23) > 0.74) c = TR[2]; // gouge marks
    } else if (u >= C.x0 && u < C.x1 + 1) {
      if (fy === C.y0 * R - 1) c = INK;
      else if (fy === (C.y1 + 1) * R) c = WAL[4];
      else if (fy === (C.y1 + 1) * R + 1 && R > 2) c = WAL[3];
    } else if (u >= C.x1 + 1 && u < C.x1 + 1 + 1 / R + 0.01 && v >= C.y0 && v < C.y1 + 1) c = INK;
    put(fx, fy, c, 1);
  }
  // ---- the iron shoe on the right end: wrapped round, two square nails, hammer marks
  for (let fy = 0; fy < H; fy++) for (let fx = 0; fx < W; fx++) {
    const u = (fx + 0.5) / R, v = (fy + 0.5) / R;
    if (u < C.x1 + 1.6 || !inStave(u, v)) continue;
    const dv = v - topY(u), db = botY(u) - v, du = u - (C.x1 + 1.6);
    let c = IR[2];
    if (du < 1 / R + 0.01) c = INK;
    else if (du < 1) c = IR[3];
    else if (dv < 1) c = dv < 1 / R + 0.01 && (fx % (3 * R)) > 0 ? IR[4] : IR[3];
    else if (db < 2.2) c = (fx - fy + 999 * P) % P === 0 ? IR[0] : IR[1];
    if (h2(fx >> 1, fy, 31) < 0.035 && dv >= 1 && db >= 2.2) c = IR[1];
    put(fx, fy, c, 1);
  }
  const nail = (ax, ay, s = 1) => {
    for (let j = -1; j <= s * R; j++) for (let i = -1; i <= s * R; i++) {
      const x = Math.round(ax * R) + i, y = Math.round(ay * R) + j;
      const edge = i < 0 || j < 0 || i >= s * R || j >= s * R;
      put(x, y, edge ? INK : i === 0 && j === 0 ? IR[4] : i + j >= 2 * s * R - 2 ? IR[0] : i < R / 2 || j < R / 2 ? IR[3] : IR[2]);
    }
  };
  nail(107.2, 22.6); nail(108, 33.4);
  // ---- iron staples clamping the trough at the quarters (a nail through each)
  const CWa = C.x1 + 1 - C.x0;
  [0.25, 0.5, 0.75].forEach((qq, n) => {
    const x0 = Math.round(C.x0 + CWa * qq) - 1 + (n === 1 ? 0 : n === 0 ? 0.4 : -0.3);
    for (const [y0, y1] of [[C.y0 - 3.6, C.y0 - 0.2], [C.y1 + 1.2, C.y1 + 4.4]]) {
      const fx0 = Math.round(x0 * R), fx1 = Math.round((x0 + 3) * R), fy0 = Math.round(y0 * R), fy1 = Math.round(y1 * R);
      for (let fy = fy0 - 1; fy <= fy1; fy++) for (let fx = fx0 - 1; fx <= fx1; fx++) {
        const edge = fx < fx0 || fy < fy0 || fx >= fx1 || fy >= fy1;
        if (edge) { if (!(fy < fy0 && fx > fx0 + R && ((fx >> 1) & 1))) put(fx, fy, INK); continue; } // (its lit top edge is broken)
        const i = (fx - fx0) / R, j = (fy - fy0) / R;
        put(fx, fy, j < 0.6 ? IR[4] : i < 0.9 ? IR[3] : i > 2.2 ? IR[1] : IR[2]);
      }
      nail(x0 + 1, (y0 + y1) / 2 - 0.5);
    }
  });
  // the stave's outline: ink, broken here and there along its lit top
  outline(base, kind, 1, W, H, (fx, fy, below, right) => below && !right && ((fx / (3 * R)) | 0) % 4 === 1, INK);

  // ---------------------------------------------------------------- the medallion
  const L = [-0.62, -0.78];
  const rivA = [-2.45, -0.3, 1.82];
  const ring = new Uint8Array(W * H); // 1 ring, 2 bevel, 3 recess
  for (let fy = 0; fy < H; fy++) for (let fx = 0; fx < W; fx++) {
    const u = (fx + 0.5) / R, v = (fy + 0.5) / R;
    const dx = u - M.cx, dy = v - M.cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const ro = medR(a);
    // its shadow on the stave: hatched, down and to the right
    if (r >= ro && kind[fy * W + fx] === 1 && r < ro + 2.2 && dx > -2 && dy > -6 && Math.hypot(dx - 1.3, dy - 1.6) < medR(Math.atan2(dy - 1.6, dx - 1.3)) + 0.2) {
      if ((fx + fy) % P < 2) put(fx, fy, WAL[0]);
      continue;
    }
    if (r >= ro) continue;
    const nd = r > 0 ? (dx * L[0] + dy * L[1]) / r : 0; // +1 facing the light (top left)
    const rr = ro - M.ring, rb = rr - M.bevel + 0.25 * Math.sin(4 * a + 1);
    let c;
    if (r >= rr) { // forged iron, rounded: the outer half lit where it faces the lamp, the inner half the other way
      const f = (r - rr) / M.ring;
      const lit = nd * (f - 0.38) * 1.7;
      c = lit > 0.42 ? IR[4] : lit > 0.1 ? IR[3] : lit > -0.28 ? IR[2] : (fx - fy + 999 * P) % P === 0 ? IR[0] : IR[1];
      if (h2(Math.round(a * 26), Math.round(r * 2), 37) < 0.07 && lit < 0.42) c = IR[1]; // hammer marks
      if (Math.abs(r - (rr + M.ring * 0.42)) < 0.5 / R && h2(Math.round(a * 9), 0, 39) < 0.3) c = IR[1]; // a forge seam
      ring[fy * W + fx] = 1;
    } else if (r >= rb) { // the oak bevel, sloping into the recess: lit on the far side, ribbed with gouge cuts
      const lit = -nd;
      let t = lit > 0.4 ? 3 : lit > -0.25 ? 2 : 1;
      // gouge cuts: unevenly spaced, some only part way across the bevel
      const g = ((a / TAU) * 34 + vnoise(a * 5, 1.7, 41) * 2.2 + 99) % 1, cell = Math.floor((a / TAU) * 34 + vnoise(a * 5, 1.7, 41) * 2.2 + 99);
      const reach = h2(cell, 3, 43), into = (ro - M.ring - r) / M.bevel; // 0 at the ring, 1 at the recess
      if (g < 0.2 && into > reach * 0.6) t -= 1; else if (g < 0.32 && t >= 2 && into > reach * 0.6) t += 1;
      t -= 1; // a shade darker than the raw oak: the face is what's lit
      c = OAK[clamp(t, 0, 4)];
      if (r < rb + 1 / R + 0.01 && nd < 0.2) c = OAK[0];
      ring[fy * W + fx] = 2;
    } else { // the recess: the rim's shadow crescent top left, lamplight pooling bottom right
      const toL = -(dx * L[0] + dy * L[1]);
      c = RC[1];
      if (r > rb - 2.6 && nd > 0.2) c = RC[0];
      else if (toL > 5.5 && r > rb - 3.5) c = RC[3];
      else if (toL > 2.5) c = RC[2];
      else if (nd > -0.1 && (fx + fy) % P === 0) c = RC[0];
      ring[fy * W + fx] = 3;
    }
    put(fx, fy, c, 2);
  }
  // the seams: ring | bevel always inked; bevel | recess inked except where the light catches it
  for (let fy = 1; fy < H - 1; fy++) for (let fx = 1; fx < W - 1; fx++) {
    const i = fy * W + fx, k = ring[i];
    if (k === 1 && (ring[i + 1] === 2 || ring[i - 1] === 2 || ring[i + W] === 2 || ring[i - W] === 2)) base[i] = pk(INK);
    if (k === 2 && (ring[i + 1] === 3 || ring[i - 1] === 3 || ring[i + W] === 3 || ring[i - W] === 3)) {
      const u = (fx + 0.5) / R - M.cx, v = (fy + 0.5) / R - M.cy;
      if (!(u * L[0] + v * L[1] < -4 && ((fx + fy) >> 1) % 3 === 0)) base[i] = pk(INK);
    }
  }
  // three square rivets (not evenly spaced)
  for (const a of rivA) {
    const r = medR(a) - M.ring * 0.5;
    const ax = M.cx + Math.cos(a) * r - 1, ay = M.cy + Math.sin(a) * r - 1;
    const fx0 = Math.round(ax * R), fy0 = Math.round(ay * R), s = 2 * R;
    for (let j = -1; j <= s; j++) for (let i = -1; i <= s; i++) {
      const edge = i < 0 || j < 0 || i >= s || j >= s;
      if (edge) { if (!((i < 0 || j < 0) && (i + j) % 3 === 0)) put(fx0 + i, fy0 + j, INK); continue; }
      put(fx0 + i, fy0 + j, i + j < R ? IR[4] : i + j > 2 * s - R - 2 ? IR[0] : i < s / 2 && j < s / 2 ? IR[3] : IR[2]);
    }
  }
  // the medallion's outline: ink, broken along its lit top left
  outline(base, kind, 2, W, H, (fx, fy) => {
    const u = (fx + 0.5) / R - M.cx, v = (fy + 0.5) / R - M.cy, r = Math.hypot(u, v) || 1;
    return (u * L[0] + v * L[1]) / r > 0.45 && ((Math.atan2(v, u) * 7 + 99) | 0) % 3 === 0;
  }, INK);

  // ---------------------------------------------------------------- front, clip
  for (let fy = 0; fy < H; fy++) for (let fx = 0; fx < W; fx++) {
    const i = fy * W + fx, u = (fx + 0.5) / R, v = (fy + 0.5) / R;
    const dx = u - M.cx, dy = v - M.cy, r = Math.hypot(dx, dy), ro = medR(Math.atan2(dy, dx));
    // the lower rim (and its outline) comes in front of the face, so the neck sinks behind it
    if (dy > 3.6 + Math.max(0, -dx) * 0.08 && r > ro - M.ring - M.bevel - 0.35 && r < ro + 1.2 && kind[i] === 2) front[i] = base[i];
    // the face may draw over the medallion, and above the stave over its left end
    if (r < ro + 0.6 || (v < S.y0 + 0.5 && Math.abs(dx) < ro + 1)) clip[i] = 1;
  }
  const rec = new Uint8Array(W * H);
  for (let i = 0; i < rec.length; i++) rec[i] = ring[i] === 3 ? 1 : 0;
  const L2 = { W, H, R, base, front, clip, rec };
  cache.set(R, L2);
  return L2;
}

/**
 * Ink one fine pixel round what's of kind k (into the empty pixels next to it). lit(fx, fy, below,
 * right): true where the line breaks (below/right: the shape is under / right of this pixel).
 */
function outline(buf, kind, k, W, H, lit, ink) {
  const add = [];
  for (let fy = 0; fy < H; fy++) for (let fx = 0; fx < W; fx++) {
    const i = fy * W + fx;
    if (kind[i] === k || (k === 1 && kind[i])) continue;
    const r = fx + 1 < W && kind[i + 1] === k, l = fx > 0 && kind[i - 1] === k, d = fy + 1 < H && kind[i + W] === k, up = fy > 0 && kind[i - W] === k;
    if (!(r || l || d || up)) continue;
    if (lit(fx, fy, d && !up, r && !l)) continue;
    add.push(i);
  }
  for (const i of add) { buf[i] = pk(ink); kind[i] = k; }
}

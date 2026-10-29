// Close-up voxel models of the cave plants for the gathering minigames, finer than the props in
// the mine (about 1.4 cm voxels) and built in parts so the stage can work them: a `stem` (along +y
// from the soil line, a little collar below it), a `head` (cap, leaves, flower; its origin is the
// top of the stem), a `body` under the soil (root, bulb, tuber; origin at the soil line) and
// `roots` (paths in metres from the body, drawn as segment chains that tear out one by one).
// Everything comes from the plant's spec (src/cooking/forage.js: form, colours, petals...).
//
//   const m = plantModel(id, spec, seed) → { S, stemLen, gripY, stemR, stem, head, body, extras,
//     roots: { n, col, r, paths: [[x, y, z]...] }, glow: [r, g, b] | null, light, form }
import { PGrid, voxGeo } from './gfx.js';
import { hv, shade, mixc } from '../props/grid.js';
import { rng } from './sims.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SOILC = [0x4c3422, 0x5a3c28, 0x3e2a1c];
const dirty = (c, x, y, z, k = 0.35) => (hv(x, y, z, 77) < k ? mixc(c, SOILC[Math.floor(hv(x, z, y, 78) * 3)], 0.55) : c);
const G = (w, h, d) => new PGrid(Math.ceil(w), Math.ceil(h), Math.ceil(d));

// ---------------------------------------------------------------- shared shapes
/** A tube along y: radius r(t) for t 0..1 over [y0, y1), colours by fn(x, y, z, t, a). */
function tube(g, cx, cz, y0, y1, rf, cf, glow = 0) {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0 - 1);
    const r = rf(t, y);
    for (let z = Math.floor(cz - r - 1); z <= Math.ceil(cz + r + 1); z++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
      if (dx * dx + dz * dz > r * r) continue;
      const c = cf(x, y, z, t, Math.atan2(dz, dx));
      if (c >= 0) g.set(x, y, z, c, typeof glow === 'function' ? glow(x, y, z, t) : glow);
    }
  }
}

/** A voxel line with a round brush of radius r (fractional ok), colour fn(t). */
function stroke(g, a, b, r, cf, glow = 0) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
    const rr = typeof r === 'function' ? r(t) : r;
    const c = typeof cf === 'function' ? cf(t, x, y, z) : cf;
    if (c < 0) continue;
    const gl = typeof glow === 'function' ? glow(t) : glow;
    if (rr < 0.6) { g.set(x, y, z, c, gl); continue; }
    const R = Math.ceil(rr);
    for (let dz = -R; dz <= R; dz++) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy + dz * dz > rr * rr + 0.25) continue;
      g.set(x + dx, y + dy, z + dz, c, gl);
    }
  }
}

/** A curved path (quadratic) as a stroke: p0 → p2 bending toward p1. */
function curve(g, p0, p1, p2, r, cf, glow = 0, steps = 10) {
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const p = [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2]];
    const t0 = (i - 1) / steps;
    stroke(g, prev, p, typeof r === 'function' ? r(t) : r, typeof cf === 'function' ? (k) => cf(t0 + (t - t0) * k) : cf, typeof glow === 'function' ? glow(t) : glow);
    prev = p;
  }
}

/** A leaf blade: a flat tapering strip along a curve, `w` voxels wide at its widest. */
function blade(g, p0, p1, p2, w, cMid, cEdge, glow = 0, steps = 12) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const p = [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2]];
    const d = [2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), 0, 2 * u * (p1[2] - p0[2]) + 2 * t * (p2[2] - p1[2])];
    const L = Math.hypot(d[0], d[2]) || 1;
    const sx = -d[2] / L, sz = d[0] / L;
    const half = w * Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.5;
    for (let k = -Math.ceil(half); k <= Math.ceil(half); k++) {
      if (Math.abs(k) > half + 0.3) continue;
      g.set(p[0] + sx * k, p[1] - Math.abs(k) * 0.25, p[2] + sz * k, Math.abs(k) >= half - 0.6 ? cEdge : cMid, glow);
    }
  }
}

// ---------------------------------------------------------------- stems
function stemPart(o) {
  const { len, below = 3, r0, r1, col, colD = shade(col, 0.82), S, ring, bulge = 0, leaves } = o;
  const W = Math.ceil(Math.max(r0, r1, bulge) * 2 + 4 + (leaves ? 22 : 0));
  const g = G(W, len + below + 2, W);
  const cx = W / 2, cz = W / 2;
  tube(g, cx, cz, 0, len + below, (t, y) => {
    const yy = y - below;
    let r = r0 + (r1 - r0) * clamp(yy / len, 0, 1);
    if (bulge && yy < 4) r = Math.max(r, bulge * (1 - Math.max(0, yy + below) / (below + 5) * 0.6));
    if (ring && Math.abs(yy - ring) < 1) r += 1.1;
    return r;
  }, (x, y, z, t, a) => {
    const yy = y - below;
    let c = Math.floor((a + Math.PI) / (Math.PI * 2) * 7 + hv(0, y >> 2, 0, 5) * 0.4) % 2 ? col : colD;
    if (hv(x, y, z, 31) < 0.08) c = shade(c, 1.12);
    if (ring && Math.abs(yy - ring) < 1) c = shade(col, 1.08);
    if (yy < 0) c = dirty(shade(c, 0.85), x, y, z, 0.55);
    else if (yy < 2) c = dirty(c, x, y, z, 0.25);
    return (c & ~1) | (y & 1); // rows never merge: the stem keeps a vertex ring per voxel row so it can bend
  }, o.glow || 0);
  if (leaves) for (const L of leaves) {
    const y = below + L.y, a = L.a, ca = Math.cos(a), sa = Math.sin(a);
    blade(g, [cx + ca * r0, y, cz + sa * r0], [cx + ca * L.len * 0.5, y + L.len * 0.45, cz + sa * L.len * 0.5], [cx + ca * L.len, y + L.len * 0.15, cz + sa * L.len], L.w, L.col, shade(L.col, 0.8));
  }
  return { geo: voxGeo(g, { pivot: [cx, below, cz], scale: S }), len: len * S, r: Math.max(r0, r1) * S };
}

// ---------------------------------------------------------------- heads
function capHead(spec, r, S, big = 1) {
  const C = spec.col;
  const rx = 12.5 * big, ry = 6.8 * big;
  const W = Math.ceil(rx * 2 + 4), H = Math.ceil(ry + 5);
  const g = G(W, H, W);
  const cx = W / 2, cz = W / 2, y0 = 1.2;
  const glowCap = spec.id === 'glowcap' ? 1 : 0;
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
    const rr = Math.hypot(dx, dz);
    if (rr > rx) continue;
    const yTop = y0 + ry * Math.sqrt(Math.max(0, 1 - (rr / rx) ** 2));
    const inner = rr < rx - 1.6;
    const yBot = inner ? y0 + (1 - rr / rx) * 2.4 : y0 - 0.6; // a shallow bowl of gills, the rim curls down
    const a = Math.atan2(dz, dx);
    for (let y = 0; y < H; y++) {
      const yc = y + 0.5;
      if (yc < yBot || yc > yTop + 0.35) continue;
      if (inner && yc < yBot + 1) {
        const gl = Math.floor((a + Math.PI) / (Math.PI * 2) * Math.round(rx * 2.6)) % 2;
        g.set(x, y, z, gl ? C.gill : shade(C.gill, 0.68), gl ? Math.min(2, glowCap) : 1);
        continue;
      }
      // the dome: lit from the upper left, a darker rim, glowing spots
      const dy = yc - y0;
      const lit = (-dx * 0.55 - dz * 0.3) / rx + dy / ry * 0.9;
      let c = lit > 1.05 ? C.hi : lit > 0.45 ? mixc(C.cap, C.hi, 0.35) : lit > -0.05 ? C.cap : lit > -0.45 ? shade(C.cap, 0.84) : shade(C.cap, 0.7);
      if (!inner && dy < 1.5) c = shade(C.cap, 0.6);
      let gl = glowCap;
      if (yc > yTop - 1.2 && hv(x >> 1, y >> 1, z >> 1, 41 + (r.seed | 0)) < 0.11 && rr > 2) { c = C.spot; gl = 3; }
      else if (hv(x, y, z, 43) < 0.07) c = shade(c, 1.1);
      g.set(x, y, z, c, gl);
    }
  }
  // the stem's top runs up into the cap
  tube(g, cx, cz, 0, Math.ceil(y0 + 3), () => 2.3, () => shade(C.stem, 0.95));
  return { geo: voxGeo(g, { pivot: [cx, 0, cz], scale: S }), w: rx * S, h: (ry + y0) * S };
}

function leafHead(spec, r, S) {
  const C = spec.col;
  const g = G(44, 34, 44);
  const cx = 22, cz = 22;
  const leaf = shade(C.leaf ?? 0x5aa84a, 0.8), dk = shade(leaf, 0.66), lt = shade(leaf, 1.3);
  const n = spec.leaves === 'feather' ? 6 : 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.6;
    const ca = Math.cos(a), sa = Math.sin(a);
    const L = 13 + r() * 6, H = 18 + r() * 9;
    if (spec.leaves === 'feather') {
      // a carrot frond: a stalk arching out with feathery leaflets
      const p0 = [cx, 0, cz], p1 = [cx + ca * L * 0.25, H * 0.9, cz + sa * L * 0.25], p2 = [cx + ca * L, H * 0.75, cz + sa * L];
      curve(g, p0, p1, p2, 0.7, (t) => (t < 0.3 ? dk : leaf), 0, 10);
      for (let k = 3; k <= 10; k++) {
        const t = k / 10, u = 1 - t;
        const px = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], py = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], pz = u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2];
        if (k % 2) continue; // leaflets in pairs every other step: airy, feathery fronds
        const len = (1.2 - t) * 4;
        for (const side of [-1, 1]) {
          for (let q = 1; q <= len; q++) g.set(px - sa * q * side + ca * q * 0.45, py + q * 0.3 - (q > 2 ? q * 0.35 : 0), pz + ca * q * side + sa * q * 0.45, q > len - 1 ? lt : q === 1 ? dk : leaf);
        }
      }
    } else {
      // long blades curling over
      blade(g, [cx, 0, cz], [cx + ca * L * 0.2, H * 1.05, cz + sa * L * 0.2], [cx + ca * L * 0.9, H * 0.55, cz + sa * L * 0.9], 3.4, leaf, dk);
    }
  }
  if (spec.spicy) {
    // little red chilies hanging under the leaves
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.4, x = cx + Math.cos(a) * 7, z = cz + Math.sin(a) * 7;
      stroke(g, [x, 12, z], [x + Math.cos(a) * 1.5, 6, z + Math.sin(a) * 1.5], (t) => 1.4 - t * 0.9, (t) => (t < 0.1 ? 0x3a7a2a : t < 0.35 ? 0xff6a4a : 0xd8301a), 1);
    }
  }
  return { geo: voxGeo(g, { pivot: [cx, 0, cz], scale: S, ao: false }), w: 20 * S, h: 26 * S };
}

function fernHead(spec, r, S) {
  const C = spec.col;
  const g = G(56, 36, 56);
  const cx = 28, cz = 28;
  const leaf = C.leaf, stem = C.stem, dk = shade(leaf, 0.75), tip = mixc(leaf, 0xffffff, 0.45);
  if (spec.small) {
    // stone thyme: a dense little tuft of wiry stems, tiny leaves and lilac flowers
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = r() * 5, h = 9 + r() * 9;
      const x0 = cx + Math.cos(a) * d * 0.3, z0 = cz + Math.sin(a) * d * 0.3;
      const x1 = cx + Math.cos(a) * (d + 3), z1 = cz + Math.sin(a) * (d + 3);
      stroke(g, [x0, 0, z0], [x1, h, z1], 0.4, (t) => (t < 0.4 ? stem : t > 0.85 ? 0xa8c088 : (i + Math.round(t * 9)) % 2 ? leaf : dk));
      if (r() < 0.55) { g.set(x1, h + 1, z1, 0xc8a8e0, 1); g.set(x1 + 1, h, z1, 0xb090d0, 1); }
    }
    return { geo: voxGeo(g, { pivot: [cx, 0, cz], scale: S, ao: false }), w: 9 * S, h: 18 * S };
  }
  const n = spec.fronds || 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    const ca = Math.cos(a), sa = Math.sin(a);
    const L = 20 + r() * 6, H = 20 + r() * 8;
    let prev = [cx, 0, cz];
    const steps = 22;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const d = t * L, y = H * Math.sin(Math.min(1, t * 1.1) * Math.PI * 0.6) - Math.max(0, t - 0.65) * 14;
      const p = [cx + ca * d, y, cz + sa * d];
      stroke(g, prev, p, t < 0.2 ? 0.8 : 0.4, t > 0.92 ? tip : stem);
      if (t > 0.16 && t < 0.95 && k % 2 === 0) {
        const len = Math.max(1, Math.round((1.05 - t) * 6));
        for (const side of [-1, 1]) for (let q = 1; q <= len; q++) {
          g.set(p[0] - sa * q * side, p[1] - (q > 2 ? 1 : 0) - q * 0.15, p[2] + ca * q * side, q === len ? tip : (q + k) % 2 ? leaf : dk);
        }
      }
      prev = p;
    }
    // a young fiddlehead curl
    if (i === 0) for (let k = 0; k < 10; k++) { const t = k / 10 * Math.PI * 1.6; g.set(cx - sa * 2 + Math.cos(t) * 2, 12 + Math.sin(t) * 2 + k * 0.4, cz + ca * 2, tip); }
  }
  return { geo: voxGeo(g, { pivot: [cx, 0, cz], scale: S, ao: false }), w: 24 * S, h: 24 * S };
}

function flowerHead(spec, r, S) {
  const C = spec.col;
  const g = G(44, 26, 44);
  const cx = 22, cz = 22;
  const n = spec.petals || 6;
  const gl = spec.hot ? 2 : 1;
  const lotus = !!spec.lotus;
  const rings = lotus ? [[n, 15, 3, 0], [Math.round(n * 0.75), 10, 7, 0.4]] : [[n, spec.cold ? 11 : 9, spec.hot ? 11 : 8, 0]];
  for (const [k, R, H, off] of rings) {
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + off;
      const ca = Math.cos(a), sa = Math.sin(a);
      const base = [cx + ca * 1.5, 2, cz + sa * 1.5];
      const tip = [cx + ca * R, 2 + H, cz + sa * R];
      const mid = [cx + ca * R * 0.55, 1 + H * 0.15, cz + sa * R * 0.55];
      // a petal: darker at its rim, a pale vein up the middle, the tip catching the light
      blade(g, base, mid, tip, lotus ? 6 : spec.cold ? 3.2 : 4.4, C.petal, shade(C.petal, 0.72), gl, 10);
      stroke(g, mid, tip, 0.4, (t) => (t > 0.75 ? C.hi : mixc(C.petal, C.hi, 0.45)), gl + (spec.hot ? 1 : 0));
      if (spec.cold) stroke(g, [cx + ca * 4, 3, cz + sa * 4], [cx + ca * (R + 2), 4 + H * 0.3, cz + sa * (R + 2)], 0.4, 0xffffff, 3);
    }
  }
  // the heart
  g.ell(cx, lotus ? 4 : 3, cz, lotus ? 3.6 : 2.4, lotus ? 2.4 : 2.2, lotus ? 3.6 : 2.4, (x, y, z) => (hv(x, y, z, 51) < 0.3 ? shade(C.heart, 1.15) : C.heart), 3);
  if (spec.hot) for (let i = 0; i < 6; i++) { const a = i * 1.05; g.set(cx + Math.cos(a) * 1.5, 7 + (i & 1), cz + Math.sin(a) * 1.5, 0xfff8d0, 3); }
  tube(g, cx, cz, 0, 2, () => 1.6, () => C.stem);
  return { geo: voxGeo(g, { pivot: [cx, 0, cz], scale: S, ao: false }), w: (lotus ? 15 : 11) * S, h: (lotus ? 11 : 12) * S };
}

function bulbHead(spec, r, S) {
  const C = spec.col;
  const g = G(28, 28, 28);
  const cx = 14, cz = 14;
  g.ell(cx, 13, cz, 10, 11, 10, (x, y, z, dx, dy, dz) => {
    const lit = -dx * 0.6 + dy * 0.8 - dz * 0.3;
    if (lit > 0.85 && hv(x, y, z, 61) < 0.6) return 0xffffff;
    if (hv(x >> 1, y >> 1, z >> 1, 62) < 0.06) return C.hi;
    return lit > 0.3 ? C.hi : lit > -0.4 ? C.bulb : shade(C.bulb, 0.75);
  }, 1);
  // veins and a few trapped bubbles
  for (let i = 0; i < 6; i++) { const a = i * 1.05; curve(g, [cx, 3, cz], [cx + Math.cos(a) * 12, 12, cz + Math.sin(a) * 12], [cx + Math.cos(a) * 3, 23, cz + Math.sin(a) * 3], 0.4, shade(C.bulb, 0.6), 1, 12); }
  tube(g, cx, cz, 0, 3, () => 1.8, () => C.stem);
  return { geo: voxGeo(g, { pivot: [cx, 0, cz], scale: S }), w: 10 * S, h: 24 * S };
}

function hangHead(spec, r, S) {
  // built hanging DOWN from its origin (the stage flips ceiling plants, so +y here is down there)
  const C = spec.col;
  const g = G(24, 24, 24);
  const cx = 12, cz = 12;
  if (spec.stretchy) {
    // rubber sap: a fat sap pod at the end of the vine
    g.ell(cx, 7, cz, 4.5, 6, 4.5, (x, y, z, dx, dy) => (dy > 0.4 ? C.sap : shade(C.sap, 0.85)), 1);
    g.set(cx - 1, 10, cz - 3, 0xfff8e0, 2);
    tube(g, cx, cz, 0, 2, () => 1.4, () => C.strand);
    return { geo: voxGeo(g, { pivot: [cx, 0, cz], scale: S }), w: 5 * S, h: 13 * S };
  }
  // whisperweed: a tassel of glowing tips
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, d = 1 + r() * 2.5;
    curve(g, [cx, 0, cz], [cx + Math.cos(a) * d * 2, 6, cz + Math.sin(a) * d * 2], [cx + Math.cos(a) * d * 1.4, 13 + r() * 6, cz + Math.sin(a) * d * 1.4], 0.4, (t) => (t > 0.6 ? C.tip : C.strand), (t) => (t > 0.85 ? 2 : 1), 8);
  }
  return { geo: voxGeo(g, { pivot: [cx, 0, cz], scale: S, ao: false }), w: 6 * S, h: 18 * S };
}

// ---------------------------------------------------------------- bodies (under the soil)
function rootBody(spec, r, S) {
  const C = spec.col;
  const g = G(26, 40, 26);
  const cx = 13, cz = 13, top = 36; // y = top is the soil line
  // the 3D close-up wants richer colours than the 2D art's (carrots are properly orange)
  const body = spec.body === 'taper' ? 0xe0782c : C.body, dk = shade(body, 0.72), lt = spec.body === 'taper' ? 0xf8a050 : shade(body, 1.2);
  let depth = 0;
  if (spec.body === 'taper') {
    depth = 26;
    tube(g, cx, cz, top - depth, top + 2, (t) => 0.8 + Math.pow(t, 0.7) * 4.6, (x, y, z, t, a) => ((top - y) % 5 === 0 && hv(x, y, z, 3) < 0.6 ? dk : a > 0.5 ? lt : body));
    for (let i = 0; i < 6; i++) { const y = top - 6 - i * 3.5, a = r() * 6.3; stroke(g, [cx + Math.cos(a) * 3, y, cz + Math.sin(a) * 3], [cx + Math.cos(a) * 6, y - 2, cz + Math.sin(a) * 6], 0.3, 0xe8d0b0); }
  } else if (spec.body === 'chili') {
    depth = 20;
    curve(g, [cx, top + 1, cz], [cx + 6, top - 8, cz + 2], [cx - 1, top - depth, cz - 2], (t) => 3.3 - t * 2.6, (t) => (t < 0.08 ? 0x4a8a3a : t < 0.5 ? body : shade(body, 0.85)), 1, 14);
    stroke(g, [cx - 1, top - 2, cz - 1], [cx - 2, top - 8, cz - 2], 0.4, 0xffa080, 2);
  } else if (spec.body === 'tuber') {
    depth = 14;
    g.ell(cx, top - 6, cz, 9, 8, 7.5, (x, y, z, dx, dy) => (hv(x >> 1, y >> 1, z >> 1, 9) < 0.12 ? 0x6a4a2a : dy > 0.3 ? lt : hv(x, y, z, 11) < 0.25 ? dk : body));
    g.ell(cx + 6, top - 4, cz + 2, 4, 4, 4, (x, y, z) => (hv(x, y, z, 12) < 0.2 ? dk : body));
    for (let i = 0; i < 5; i++) { const a = i * 1.3; g.set(cx + Math.cos(a) * 9, top - 5 + (i % 3), cz + Math.sin(a) * 7.5, 0x4a3018); }
  } else {
    // garlic: a white bulb of cloves with purple streaks and a beard of roots
    depth = 13;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      g.ell(cx + Math.cos(a) * 3.2, top - 6, cz + Math.sin(a) * 3.2, 3.6, 5.6, 3.6, (x, y, z, dx, dy) => (hv(x, y >> 1, z, 13 + i) < 0.15 ? 0xb890c0 : dy > 0.4 ? 0xfffaf0 : dx < -0.6 ? shade(body, 0.85) : body));
    }
    tube(g, cx, cz, top - 2, top + 2, (t) => 2.4 - t, () => 0xe8e0c8);
  }
  return { geo: voxGeo(g, { pivot: [cx, top, cz], scale: S }), depth: depth * S, w: 8 * S };
}

function smallBody(col, S, k = 1) {
  const g = G(14, 12, 14);
  g.ell(7, 6, 7, 3.6 * k, 3.4 * k, 3.6 * k, (x, y, z) => dirty(hv(x, y, z, 21) < 0.5 ? col : shade(col, 0.8), x, y, z, 0.5));
  return { geo: voxGeo(g, { pivot: [7, 9, 7], scale: S }), depth: 6 * S, w: 4 * S };
}

// ---------------------------------------------------------------- the model
const SIZE = { cap: 1 / 72, root: 1 / 72, herb: 1 / 80, flower: 1 / 72, bulb: 1 / 72, hang: 1 / 72 };

export function plantModel(id, spec, seed = 1) {
  const r = rng(seed * 7919 + id.length * 131);
  r.seed = seed;
  const form = spec.form || 'herb';
  const S = SIZE[form] || 1 / 72;
  const C = spec.col || {};
  const sp = { ...spec, id };
  const out = { form, S, extras: [], glow: null, light: null };
  const glowRGB = spec.glow ? [((spec.glow >> 16) & 255) / 255, ((spec.glow >> 8) & 255) / 255, (spec.glow & 255) / 255] : null;
  out.glow = glowRGB;
  let rootCol = 0xc8b090, rootR = 0.008, rootGlow = 0, rootN = spec.roots ?? 5, rootLen = [0.09, 0.2], rootDepth = [0.012, 0.05];
  if (form === 'cap') {
    const big = spec.id === 'gloomshroom' ? 0.9 : 1;
    const stem = stemPart({ len: 15, below: 4, r0: 2.4, r1: 2.0, col: shade(C.stem, 0.84), colD: shade(C.stem, 0.7), S, ring: 11, bulge: 3.6 });
    const head = capHead(sp, r, S, big);
    Object.assign(out, { stem: stem.geo, stemLen: stem.len, stemR: stem.r, head: head.geo, headW: head.w, headH: head.h, gripY: 0.09 });
    out.body = smallBody(shade(C.stem, 0.9), S, 1.1);
    rootCol = id === 'glowcap' ? 0xcfeaff : 0xd8c8e8; rootGlow = 1; rootR = 0.006; rootLen = [0.1, 0.22]; rootDepth = [0.006, 0.03];
    if (spec.caps > 1) {
      // a baby mushroom beside it (it stays in the soil)
      const bs = stemPart({ len: 5, below: 2, r0: 1.3, r1: 1.1, col: C.stem, S });
      const bh = capHead(sp, r, S, 0.42);
      out.extras.push({ geo: bs.geo, pos: [0.13, 0, -0.06] }, { geo: bh.geo, pos: [0.13, bs.len, -0.06] });
    }
  } else if (form === 'root') {
    const stem = stemPart({ len: 6, below: 2, r0: 2.2, r1: 1.6, col: shade(C.leaf ?? 0x4a8a3a, 0.85), S });
    const head = leafHead(sp, r, S);
    Object.assign(out, { stem: stem.geo, stemLen: stem.len, stemR: stem.r, head: head.geo, headW: head.w, headH: head.h, gripY: 0.045 });
    out.body = rootBody(sp, r, S);
    rootCol = 0xd8c0a0; rootR = 0.005; rootLen = [0.07, 0.16]; rootDepth = [0.02, out.body.depth * 0.8];
  } else if (form === 'herb') {
    const stem = stemPart({ len: spec.small ? 4 : 6, below: 2, r0: spec.small ? 1.6 : 2.2, r1: spec.small ? 1.3 : 1.7, col: C.stem, S });
    const head = fernHead(sp, r, S);
    Object.assign(out, { stem: stem.geo, stemLen: stem.len, stemR: stem.r, head: head.geo, headW: head.w, headH: head.h, gripY: spec.small ? 0.03 : 0.045 });
    out.body = smallBody(0x4a3a28, S, spec.small ? 0.7 : 1);
    rootCol = 0x8a6a48; rootR = 0.004; rootLen = [0.06, 0.13]; rootDepth = [0.008, 0.035];
  } else if (form === 'flower') {
    const lotus = !!spec.lotus;
    const len = lotus ? 5 : 19;
    const leaves = lotus ? null : [{ y: 5, a: 0.6, len: 9, w: 3, col: shade(C.stem, 1.05) }, { y: 9, a: 3.6, len: 8, w: 3, col: shade(C.stem, 1.1) }];
    const stem = stemPart({ len, below: 2, r0: 1.5, r1: 1.2, col: C.stem, S, leaves, glow: spec.hot ? 1 : 0 });
    const head = flowerHead(sp, r, S);
    Object.assign(out, { stem: stem.geo, stemLen: stem.len, stemR: stem.r, head: head.geo, headW: head.w, headH: head.h, gripY: lotus ? 0.03 : 0.1 });
    out.body = smallBody(shade(C.stem, 0.6), S, 0.9);
    rootCol = spec.hot ? 0x5a2a18 : 0x9a8a78; rootR = 0.005;
    if (lotus) { rootCol = 0xff9ad0; rootGlow = 2; }
  } else if (form === 'bulb') {
    const stem = stemPart({ len: 12, below: 2, r0: 1.6, r1: 1.4, col: C.stem, S, leaves: [{ y: 1, a: 0.3, len: 7, w: 2.6, col: shade(C.stem, 1.15) }, { y: 1, a: 3.4, len: 6, w: 2.6, col: shade(C.stem, 1.15) }] });
    const head = bulbHead(sp, r, S);
    Object.assign(out, { stem: stem.geo, stemLen: stem.len, stemR: stem.r, head: head.geo, headW: head.w, headH: head.h, gripY: 0.07 });
    out.body = smallBody(0x5a6a3a, S, 0.8);
    rootCol = 0xb8d0a0; rootR = 0.004;
  } else if (form === 'hang') {
    const len = spec.stretchy ? 26 : 22;
    const stem = stemPart({ len, below: 2, r0: spec.stretchy ? 1.6 : 2.2, r1: spec.stretchy ? 1.3 : 1.2, col: C.strand, colD: shade(C.strand, 0.75), S, glow: spec.stretchy ? 0 : 1 });
    const head = hangHead(sp, r, S);
    Object.assign(out, { stem: stem.geo, stemLen: stem.len, stemR: stem.r, head: head.geo, headW: head.w, headH: head.h, gripY: len * S * 0.7 });
    out.body = smallBody(C.base ?? 0x3a4820, S, 1.2);
    rootCol = C.base ? shade(C.base, 1.4) : 0x6a5a3a; rootR = 0.006;
  }
  out.roots = { n: rootN, col: rootCol, r: rootR, glow: rootGlow, len: rootLen, depth: rootDepth };
  if (glowRGB) out.light = { c: glowRGB, r: spec.lotus ? 2.6 : 1.8 };
  return out;
}

// A model built ahead (when the plant is aimed at) so pressing E doesn't wait for the meshing.
let warm = null;
export function warmPlant(id, spec, seed) {
  if (warm && warm.id === id && warm.seed === seed) return;
  warm = { id, seed, m: plantModel(id, spec, seed) };
}
/** The warmed model if it's this one (handed over once), else a fresh one. */
export function takePlant(id, spec, seed) {
  if (warm && warm.id === id && warm.seed === seed) { const m = warm.m; warm = null; return m; }
  return plantModel(id, spec, seed);
}

// High-resolution cave props (1/32 m voxels, twice the detail of the old 1/16 m set), registered
// over the old builders by ./models.js: lanterns on proper supports (an oak block and iron
// backplate with a scrolled arm and a knee brace on the walls; a ceiling plate or a timber stub
// with an eye bolt and a chain from the roof; a timber post with a crossbeam and brace standing on
// a cairn) with glass panes lit by the flame inside, glowing cave mushrooms, crates, barrels, rope
// coils, ore carts and the commonest forage plants.
//
// Same contract as ./models.js: (r, v, p) → { grid, pivot (voxels), scale, sway?, light?, emit?, main }.
// Mounts: 'floor' (pivot at the base, y up), 'ceil' (pivot at the top), 'wall' (z = 0 is the rock).
import { PGrid, hv, shade, mixc } from './grid.js';

export const P2 = 1 / 32; // metres per voxel here

// ---------------------------------------------------------------- palettes
const IRON_D = 0x26282c, IRON = 0x3c4046, IRON_M = 0x52575e, IRON_L = 0x737a82, IRON_H = 0xa4abb4;
const RUST_D = 0x5a2c18, RUST = 0x7e3e20, RUST_L = 0xa45a30;
const BRASS = 0xa07a34, BRASS_L = 0xd8b45c;
const OAK = [0x2e1c0e, 0x3e2614, 0x52331a, 0x664022, 0x7c4e2a, 0x946036, 0xae7444];
const PINE = [0x4a3418, 0x5e4220, 0x74522a, 0x8a6434, 0xa07840, 0xb88e50, 0xcca664];
const STONE = [0x2e2a28, 0x3c3734, 0x4c4642, 0x5c5550, 0x6e6660, 0x827970];
const ROPE = [0x3e2e1a, 0x544028, 0x6c5434, 0x846842, 0x9c7e52];
const GLASS = { frame: IRON_D, d: 0x8a4a12, m: 0xc87824, l: 0xf0a83c, flame: 0xffd27a, core: 0xfff4d4, hi: 0xfffaf0 };

const t = (R, k) => R[Math.max(0, Math.min(R.length - 1, Math.round(k)))];
const lin = (hex) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)]; };
const srgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/** Iron with a little rust and wear on its edges. */
function iron(x, y, z, s = 0) {
  const h = hv(x, y, z, 71 + s);
  return h < 0.07 ? RUST : h < 0.1 ? RUST_L : h > 0.93 ? IRON_M : IRON;
}
/** Oak along one axis ('x' | 'y' | 'z'): grain streaks and knots. */
function oak(axis, base = 3) {
  return (x, y, z) => {
    const a = axis === 'x' ? x : axis === 'y' ? y : z;
    const u = axis === 'x' ? y + z * 3 : axis === 'y' ? x + z * 3 : x + y * 3;
    const streak = hv(u, Math.floor(a / 7), 0, 31) < 0.3 ? -1 : hv(u, Math.floor(a / 5), 1, 33) > 0.82 ? 1 : 0;
    const knot = hv(Math.floor(x / 3), Math.floor(y / 3), Math.floor(z / 3), 35) < 0.025 ? -2 : 0;
    return t(OAK, base + streak + knot);
  };
}

// ---------------------------------------------------------------- shared parts
/** A chain hanging from (x, yTop, z): n links, alternating planes. Returns the y under the last link. */
function chain(g, x, yTop, z, n, c0 = IRON_M, c1 = IRON_D) {
  let y = yTop;
  for (let k = 0; k < n; k++) {
    const alongX = k % 2 === 0;
    for (let dy = 0; dy < 5; dy++) {
      const end = dy === 0 || dy === 4;
      for (const s of end ? [0] : [-1, 1]) {
        const c = dy === 1 && s < 0 ? IRON_L : (dy + k) & 1 ? c0 : c1;
        if (alongX) g.set(x + s, y - dy, z, c); else g.set(x, y - dy, z + s, c);
      }
    }
    y -= 4;
  }
  return y;
}

const LANT_H = 19; // a lantern's height, foot to the top of its ring (voxels)
/**
 * The lantern itself, its foot at y0, centred on (cx, cz): feet and a drip tray, a lower band,
 * four glass panes between corner posts (a flame shows through each, one pane catches the light),
 * an upper band, a stepped roof with vents and a ring to hang it by. Returns { top, flameY }.
 */
function lanternBody(g, cx, y0, cz, glow = GLASS) {
  const x0 = cx - 4, z0 = cz - 4; // the frame is 9 voxels across (x0 .. x0 + 8)
  // feet + tray
  for (const [dx, dz] of [[0, 0], [8, 0], [0, 8], [8, 8]]) g.set(x0 + dx, y0, z0 + dz, IRON_D);
  g.box(x0, y0 + 1, z0, 9, 1, 9, (x, y, z) => ((x === x0 || x === x0 + 8) && (z === z0 || z === z0 + 8) ? IRON_D : iron(x, y, z, 1)));
  g.box(x0 + 1, y0 + 2, z0 + 1, 7, 1, 7, (x, y, z) => (x === cx && z === cz ? BRASS : IRON_M));
  // glass between corner posts: the flame painted on every pane (it shows through the glass)
  const gy0 = y0 + 3, gh = 9; // the glass: 9 voxels tall
  for (let y = gy0; y < gy0 + gh; y++) {
    const v = (y - gy0) / (gh - 1); // 0 bottom .. 1 top
    for (let i = -4; i <= 4; i++) {
      for (const side of [0, 1, 2, 3]) {
        const x = side === 0 ? x0 : side === 1 ? x0 + 8 : cx + i, z = side === 2 ? z0 : side === 3 ? z0 + 8 : cz + i;
        if ((side < 2 && (i === -4 || i === 4)) || (side >= 2 && (i === -4 || i === 4))) { g.set(x, y, z, y === gy0 + gh - 1 || y === gy0 ? IRON_D : (y & 1 ? IRON : IRON_D)); continue; }
        const u = i / 3.5;
        // a teardrop of flame low in the middle of the pane, the glass glowing round it
        const fw = 0.55 * (1 - Math.pow(Math.max(0, v - 0.25) / 0.75, 1.4)) * (v < 0.25 ? v / 0.25 * 0.6 + 0.4 : 1);
        const inFlame = Math.abs(u) < fw && v > 0.12 && v < 0.8;
        const core = Math.abs(u) < fw * 0.45 && v > 0.18 && v < 0.55;
        let c = glow.m, gl = 2;
        if (core) { c = glow.core; gl = 3; } else if (inFlame) { c = glow.flame; gl = 3; } else if (Math.abs(u) > 0.78 || v > 0.9) { c = glow.d; gl = 1; } else if (v < 0.12) { c = glow.d; gl = 2; } else if (Math.abs(u) > 0.55) c = glow.m; else c = glow.l;
        // the pane facing the light gets a streak of reflection
        if ((side === 0 || side === 3) && i === -2 && v > 0.35 && v < 0.85) { c = glow.hi; gl = 2; }
        g.set(x, y, z, c, gl);
      }
    }
  }
  // a thin cross-bar a third of the way up the two side panes, like old miners' lamps
  for (let i = -3; i <= 3; i++) { g.set(x0, gy0 + 3, cz + i, IRON_D); g.set(x0 + 8, gy0 + 3, cz + i, IRON_D); }
  // the inside: a candle stub and the flame (seen from above through the vents)
  g.box(cx - 1, gy0, cz - 1, 2, 3, 2, 0xeee2c4);
  g.box(cx - 1, gy0 + 3, cz - 1, 2, 3, 2, glow.flame, 3);
  // upper band + roof steps + vents + ring
  const ry = gy0 + gh;
  g.box(x0, ry, z0, 9, 1, 9, (x, y, z) => ((x + z) & 1 ? IRON_D : IRON));
  for (let k = 1; k <= 3; k++) {
    const w = 9 - k * 2;
    g.box(cx - (w >> 1), ry + k, cz - (w >> 1), w, 1, w, (x, y, z) => {
      const edge = x === cx - (w >> 1) || z === cz - (w >> 1);
      if (k === 1 && (x === cx || z === cz) && !(x === cx && z === cz)) return IRON_D; // vents
      return edge ? IRON_L : iron(x, y, z, 2);
    });
  }
  g.set(cx, ry + 4, cz, BRASS);
  // the bail ring
  for (const [dx, dy] of [[-1, 5], [1, 5], [-1, 6], [1, 6], [0, 7]]) g.set(cx + dx, ry + dy, cz, dy === 7 ? IRON_L : IRON_M);
  return { top: ry + 7, flameY: gy0 + 4 };
}

/** A stone cairn: a heap of lumpy rocks round a post foot. */
function cairn(g, cx, cz, R, H, seed) {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + hv(i, seed, 1, 5) * 0.6, d = R * (0.55 + hv(i, seed, 2, 5) * 0.35);
    const rr = 2.2 + hv(i, seed, 3, 5) * 1.6;
    g.ell(cx + Math.cos(a) * d, rr * 0.7, cz + Math.sin(a) * d, rr, rr * 0.85, rr, (x, y, z, dx, dy) => t(STONE, 2.6 - dy * 1.4 - dx * 0.6 + (hv(x >> 1, y >> 1, z >> 1, seed + i) - 0.5) * 0.8));
  }
  g.ell(cx, H * 0.35, cz, R * 0.6, H * 0.5, R * 0.6, (x, y, z, dx, dy) => t(STONE, 2 - dy - dx * 0.5 + (hv(x >> 1, y >> 1, z >> 1, seed + 1) - 0.5) * 0.8));
}

// ---------------------------------------------------------------- builders
export const HIRES = {
  /** A wall lantern: oak mounting block, riveted backplate, scrolled arm with a knee brace, hook, chain. */
  lantern(r, v) {
    const g = new PGrid(26, 52, 30);
    const cx = 13, ay = 44;
    // the oak block bolted to the rock and the iron backplate on it
    g.box(cx - 4, ay - 18, 0, 9, 22, 3, oak('y', 3));
    g.box(cx - 3, ay - 15, 3, 7, 17, 1, (x, y, z) => (y === ay - 15 || y === ay + 1 ? IRON_D : iron(x, y, z, 3)));
    for (const [dx, y] of [[-2, ay - 13], [2, ay - 13], [-2, ay], [2, ay]]) { g.set(cx + dx, y, 4, IRON_H); g.set(cx + dx, y - 1, 4, IRON_L); }
    // the arm: two voxels square, out from the plate, a scroll at the end
    g.box(cx, ay, 4, 2, 2, 18, (x, y, z) => (y === ay + 1 ? (hv(x, y, z, 5) < 0.12 ? RUST : IRON_M) : iron(x, y, z, 4)));
    for (let a = 0; a < 5.2; a += 0.3) {
      const rr = 3.2 - a * 0.35;
      g.set(cx, ay + 2 + Math.sin(a) * rr, 21 + Math.cos(a) * rr * 0.8, IRON);
      g.set(cx + 1, ay + 2 + Math.sin(a) * rr, 21 + Math.cos(a) * rr * 0.8, IRON_D);
    }
    // the knee brace from the foot of the plate up to the arm, and a curl in the corner
    g.line(cx, ay - 13, 4, cx, ay - 1, 15, (tt) => (tt > 0.85 ? IRON_D : IRON), 0, 0.6);
    for (let a = 0; a < 6.28; a += 0.35) g.set(cx, ay - 4 + Math.sin(a) * 2.4, 7.5 + Math.cos(a) * 2.4, IRON_D);
    // the hook and a short chain to the lantern's ring
    const hz = 18;
    g.set(cx, ay - 1, hz, IRON_D); g.set(cx, ay - 2, hz, IRON_M); g.set(cx, ay - 3, hz + 1, IRON_M);
    const cy = chain(g, cx, ay - 3, hz, v ? 2 : 1);
    const body = lanternBody(g, cx, cy - LANT_H, hz);
    return {
      grid: g, pivot: [cx + 0.5, ay, 1], scale: P2,
      sway: (x, y, z) => (z > 12 * P2 && y < -1.5 * P2 ? Math.min(1, -y / (18 * P2)) : 0),
      light: { c: [1.1, 0.74, 0.38], r: 4.8, at: [0, (body.flameY - ay) * P2, (hz - 0.5) * P2], lantern: true },
      main: [0.3, 0.3, 0.32],
    };
  },

  /**
   * A lantern hanging on a chain of L (1/16 m) from the roof: an iron ceiling plate with an eye
   * bolt (v 0) or a short oak beam stub with an iron strap (v 1).
   */
  lanternC(r, v, L) {
    // as many links (4 voxels each) as put the lantern's middle (L + 5.5) / 16 m under the roof
    const anchor = v % 2 === 1 ? 5 : 1;
    const n = Math.max(0, Math.round((2 * L - anchor - 0.5) / 4));
    const top = anchor + 2 + n * 4 + LANT_H;
    const g = new PGrid(18, top + 2, 18);
    const cx = 9, cz = 9;
    let y = top;
    if (v % 2 === 1) {
      // a stub of oak beam let into the roof, an iron strap round it and an eye bolt under
      g.box(cx - 7, y - 4, cz - 3, 15, 5, 7, oak('x', 3));
      g.box(cx - 1, y - 4, cz - 4, 3, 5, 1, IRON); g.box(cx - 1, y - 4, cz + 3, 3, 5, 1, IRON); g.box(cx - 1, y - 5, cz - 4, 3, 1, 8, IRON_D);
      y -= 5;
    } else {
      // a riveted iron plate on the rock
      g.box(cx - 3, y, cz - 3, 7, 1, 7, (x, yy, z) => (Math.abs(x - cx) === 3 && Math.abs(z - cz) === 3 ? IRON_H : iron(x, yy, z, 6)));
      y -= 1;
    }
    // the eye bolt
    for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [0, -2]]) g.set(cx + dx, y + dy, cz, dy === -2 ? IRON_D : IRON_M);
    y -= 2;
    const cyb = chain(g, cx, y, cz, n);
    lanternBody(g, cx, cyb - LANT_H, cz);
    const bodyMid = cyb - LANT_H + 9.5;
    return {
      grid: g, pivot: [cx + 0.5, top + 1, cz + 0.5], scale: P2, sway: 'down',
      light: { c: [1.1, 0.74, 0.38], r: 4.8, at: [0, (bodyMid - top - 1) * P2, 0], lantern: true }, main: [0.3, 0.3, 0.32],
    };
  },

  /** A lantern post: a timber post on a cairn, a crossbeam and knee brace, the lantern on a chain. */
  lanternP(r, v) {
    const H = 46, g = new PGrid(26, H + 4, 31);
    const cx = 13, cz = 10;
    cairn(g, cx, cz, 6, 6, 3 + v);
    // the post (4 × 4, chamfered corners), the crossbeam and the brace
    for (let y = 0; y < H; y++) for (let dz = -2; dz <= 1; dz++) for (let dx = -2; dx <= 1; dx++) {
      if ((dx === -2 || dx === 1) && (dz === -2 || dz === 1)) continue;
      g.set(cx + dx, y, cz + dz, oak('y', dx < 0 ? 3.6 : 2.6)(cx + dx, y, cz + dz));
    }
    g.box(cx - 2, H - 4, cz - 2, 4, 4, 18, (x, y, z) => oak('z', y === H - 1 ? 4 : 3)(x, y, z));
    g.box(cx - 1, H - 4, cz + 16, 2, 4, 1, t(OAK, 1.5)); // the beam's end grain
    g.line(cx - 0.5, H - 15, cz + 2, cx - 0.5, H - 5, cz + 10, (tt) => t(OAK, 3 + (tt > 0.5 ? 0.5 : 0)), 0, 0.9);
    // iron straps and pegs where they meet
    for (let x = cx - 3; x <= cx + 2; x++) { g.set(x, H - 6, cz - 3, IRON); g.set(x, H - 6, cz + 2, IRON); }
    for (let z = cz - 3; z <= cz + 2; z++) { g.set(cx - 3, H - 6, z, IRON); g.set(cx + 2, H - 6, z, IRON); }
    g.set(cx + 2, H - 2, cz + 12, IRON_H); g.set(cx - 3, H - 2, cz + 12, IRON_H);
    // the hook under the beam's end, the chain, the lantern
    const hz = cz + 14;
    g.set(cx, H - 5, hz, IRON_D); g.set(cx, H - 6, hz, IRON_M);
    const cyb = chain(g, cx, H - 6, hz, 1);
    const body = lanternBody(g, cx, cyb - LANT_H, hz);
    return {
      grid: g, pivot: [cx, 0.5, cz], scale: P2,
      sway: (x, y, z) => (z > 9 * P2 && y < (H - 6) * P2 ? Math.min(1, ((H - 6) * P2 - y) / 0.5) : 0),
      light: { c: [1.1, 0.74, 0.38], r: 4.8, at: [0, body.flameY * P2, (hz + 0.5 - cz) * P2], lantern: true },
      main: [0.36, 0.26, 0.16],
    };
  },

  /** Glowing cave mushrooms: a cluster with curved stems, skirts, spotted caps, gills and a mossy foot. */
  mush(r, v) {
    const CAPS = [
      { c: [0x0c4a52, 0x146c74, 0x1e949a, 0x34bcbc, 0x6ce0d8, 0xb8fff4], gill: 0x0c3a40, light: [0.25, 0.85, 0.8] },
      { c: [0x10265c, 0x183a82, 0x2454a8, 0x3c78cc, 0x66a2ec, 0xc4e2ff], gill: 0x101e48, light: [0.3, 0.55, 1.0] },
      { c: [0x1c4a10, 0x2a6a18, 0x3c8c22, 0x58b034, 0x8cd458, 0xdcffc4], gill: 0x183a0e, light: [0.45, 0.95, 0.35] },
      { c: [0x3a1660, 0x52227e, 0x6c34a0, 0x9050c6, 0xb680e8, 0xf0dcff], gill: 0x2a1048, light: [0.7, 0.4, 1.0] },
    ];
    const cap = CAPS[v % CAPS.length];
    const W = 46, g = new PGrid(W, 44, W);
    const STEM = [0x8a8072, 0xa89c8a, 0xc6baa6, 0xded4c2, 0xf0e8da];
    // the mossy foot
    for (let k = 0; k < 40; k++) {
      const a = r() * 6.283, d = r.range(2, 18);
      const mc = r() < 0.5 ? 0x2e5a2a : 0x3e7230;
      g.ell(W / 2 + Math.cos(a) * d, 0, W / 2 + Math.sin(a) * d, r.range(1.5, 3), 1.2, r.range(1.5, 3), mc);
    }
    const n = r.int(3, 5);
    const ms = [];
    for (let i = 0; i < n; i++) {
      const big = i === 0, mid = i === 1;
      const a = r() * Math.PI * 2, d = big ? r.range(0, 2) : r.range(7, 14);
      ms.push({ x: W / 2 + Math.cos(a) * d, z: W / 2 + Math.sin(a) * d, sh: big ? r.int(22, 27) : mid ? r.int(13, 17) : r.int(5, 11), cr: big ? r.range(8, 9.5) : mid ? r.range(5.5, 6.5) : r.range(3, 4.5), lx: (r() - 0.5) * 0.5, lz: (r() - 0.5) * 0.5 });
    }
    for (const [i, m] of ms.entries()) {
      const sw = m.cr > 8 ? 2.6 : m.cr > 5 ? 1.8 : 1.2;
      // a stem with a slight S curve, a bulb at the foot, a skirt under the big caps
      let tx = m.x, tz = m.z;
      for (let y = 0; y < m.sh; y++) {
        const k = y / m.sh, bend = Math.sin(k * 2.2) * 2.2;
        tx = m.x + m.lx * bend * 3; tz = m.z + m.lz * bend * 3;
        const rr = sw * (y < 3 ? 1.35 - y * 0.1 : 1);
        g.cylY(tx, tz, rr, y, y + 1, (x, yy, z) => t(STEM, 2.4 + (x - tx) * -0.35 + (z - tz) * -0.25 + (hv(x >> 1, yy >> 2, z >> 1, 3) < 0.12 ? -1 : 0)));
        if (m.cr > 6 && y === Math.round(m.sh * 0.72)) g.cylY(tx, tz, rr + 1.6, y, y + 1, (x, yy, z) => (Math.hypot(x - tx, z - tz) > rr + 0.3 ? t(STEM, 3.5) : -1));
      }
      // the cap: a dome with a gill underside, a bright rim and spots
      const capH = m.cr * 0.68;
      for (let y = 0; y <= Math.ceil(capH); y++) {
        const h = y / capH;
        const R = m.cr * Math.sqrt(Math.max(0, 1 - h * h)) * (y === 0 ? 1.04 : 1);
        if (R < 0.5) continue;
        for (let z = Math.floor(tz - R); z <= Math.ceil(tz + R); z++) for (let x = Math.floor(tx - R); x <= Math.ceil(tx + R); x++) {
          const d = Math.hypot(x - tx, z - tz);
          if (d > R) continue;
          const yy = m.sh + y;
          if (y === 0) {
            if (d < R - 1.2) { g.set(x, yy, z, (Math.floor(Math.atan2(z - tz, x - tx) * 5) & 1) ? cap.gill : shade(cap.gill, 1.4), 1); continue; }
            g.set(x, yy, z, cap.c[4], 3); // the glowing rim
            continue;
          }
          const lit = ((tx - x) * 0.5 + (tz - z) * 0.3) / m.cr;
          let k = 2.2 + h * 1.8 + lit * 1.4, gl = 2;
          if (hv(x, yy, z, 11 + i) < 0.06 && h > 0.25) { k = 5; gl = 3; }
          g.set(x, yy, z, t(cap.c, k), gl);
        }
      }
    }
    return { grid: g, pivot: [W / 2, 0.5, W / 2], scale: P2, ao: false, light: { c: cap.light, r: 3.6, at: [0, 0.6, 0] }, emit: { k: 'spore', c: lin(cap.c[5]), at: [0, 0.75, 0], spread: 0.35 }, main: srgb(cap.c[3]) };
  },

  /** A miners' crate: planks with gaps, a frame, nails, a diagonal brace and a painted mark (v 1: smashed open, ore inside). */
  crate(r, v) {
    const S = 20, g = new PGrid(S + 2, S + 1, S + 2);
    const broken = v % 2 === 1;
    const top = broken ? 12 : S;
    const frame = (x, y, z) => {
      const ex = x === 1 || x === S, ey = y === 0 || y === top - 1, ez = z === 1 || z === S;
      return (ex && ey) || (ey && ez) || (ex && ez) || ((ex || ez) && (x === 1 || x === S) && (z === 1 || z === S));
    };
    g.box(1, 0, 1, S, top, S, (x, y, z) => {
      const ex = x === 1 || x === S, ez = z === 1 || z === S, ey = y === 0 || y === top - 1;
      if (frame(x, y, z)) return t(OAK, 2.4 + (hv(x, y, z, 2) < 0.2 ? -0.6 : 0));
      if (!ex && !ez && !ey) return broken && y > 4 ? -1 : 0x241a10;
      // planks run sideways, a dark gap every 5
      const along = ex ? z : x;
      if (y % 5 === 0 && !ey) return t(PINE, 0);
      return t(PINE, 3 + (hv(Math.floor(y / 5), ex ? 1 : 2, Math.floor(along / 7), 5) - 0.5) * 2 + (hv(along, y, 3) < 0.08 ? -1 : 0));
    });
    if (!broken) {
      // braces on two faces, nails, a stencilled mark
      for (let k = 2; k < S; k++) { g.set(k, k - 1, 0, t(OAK, 3)); g.set(k + 1, k - 1, 0, t(OAK, 2)); g.set(k, k - 1, S + 1, t(OAK, 3)); }
      for (const [x, y] of [[2, 2], [S - 1, 2], [2, S - 3], [S - 1, S - 3]]) { g.set(x, y, 0, IRON_L); g.set(x, y, S + 1, IRON_L); }
      for (let y = 7; y <= 12; y++) for (let z = 7; z <= 14; z++) if ((Math.abs(y - 9.5) < 1 || Math.abs(z - 10.5) < 1) && hv(y, z, 7) < 0.85) g.set(S + 1, y, z, 0x8a2a1a);
    } else {
      // ore and grit inside, a loose plank leaning on it
      for (let z = 2; z < S; z++) for (let x = 2; x < S; x++) {
        const hgt = 5 + Math.floor(hv(x >> 1, 0, z >> 1, 81) * 4);
        for (let y = 1; y < hgt; y++) {
          const ore = hv(x, y, z, 82) < 0.07;
          g.set(x, y, z, ore ? [0xf0c040, 0xd8743a, 0xb8c4d0][Math.floor(hv(x, y, z, 83) * 3)] : t(STONE, 2.5 + (hv(x >> 1, y, z >> 1, 84) - 0.5) * 2), ore ? 1 : 0);
        }
      }
      g.line(3, 12, 0, 16, 2, 0, t(PINE, 3), 0, 0.8);
    }
    return { grid: g, pivot: [S / 2 + 1, 0.5, S / 2 + 1], scale: P2, main: [0.42, 0.3, 0.18] };
  },

  /** A barrel: tapered staves, three riveted iron hoops, a planked head (v 1: open, full of water). */
  barrel(r, v) {
    const g = new PGrid(22, 26, 22);
    const c = 11, H = 24;
    for (let y = 0; y < H; y++) {
      const R = 7.4 + Math.sin((y / (H - 1)) * Math.PI) * 1.8;
      const hoop = y === 2 || y === 3 || y === H - 3 || y === H - 4 || y === 11 || y === 12;
      g.cylY(c, c, R, y, y + 1, (x, yy, z) => {
        const d = Math.hypot(x - c, z - c);
        if (d < R - 1.6) return -1; // hollow
        const a = Math.atan2(z - c, x - c);
        if (hoop) return (Math.floor((a + Math.PI) * 6) % 5 === 0 && (y === 3 || y === 12 || y === H - 4)) ? IRON_H : iron(x, yy, z, 8);
        const stave = Math.floor((a + Math.PI) / (Math.PI * 2) * 16);
        return t(OAK, 3.4 + (stave & 1 ? 0.7 : -0.3) + (Math.cos(a - 2.4) * 0.8) + (hv(stave, yy >> 2, 0, 9) < 0.15 ? -1 : 0));
      });
    }
    if (v % 2) {
      g.cylY(c, c, 6.2, H - 2, H - 1, (x, y, z) => (hv(x, y, z, 12) < 0.08 ? 0x8ab8d8 : 0x2c4a6a), 0);
    } else {
      g.cylY(c, c, 6.4, H - 1, H, (x, y, z) => (Math.abs(z - c) < 0.6 ? t(OAK, 1) : t(OAK, 3 + ((x >> 2) & 1))));
      g.box(c - 1, H, c - 1, 2, 1, 2, t(OAK, 1.5)); // the bung
    }
    return { grid: g, pivot: [c, 0.5, c], scale: P2, ao: false, main: [0.42, 0.28, 0.16] };
  },

  /** A coil of hemp rope: braided turns, a loose end trailing across the floor. */
  coil(r, v) {
    const g = new PGrid(30, 12, 30);
    const c = 14.5;
    const ring = (R, y0) => {
      for (let y = y0; y < y0 + 4; y++) for (let z = 0; z < 30; z++) for (let x = 0; x < 30; x++) {
        const d = Math.hypot(x - c, z - c) - R, dy = y - y0 - 1.5;
        if (d * d + dy * dy > 3.2) continue;
        const a = Math.atan2(z - c, x - c);
        const braid = Math.floor(a * R * 0.5 + dy * 0.8) & 1; // the lay of the strands, in broad twists
        g.set(x, y, z, t(ROPE, 1.6 + braid * 1.2 - (dy > 0.5 ? 0 : 0.6)));
      }
    };
    ring(10, 0); ring(7.4, 3); ring(5, 6);
    g.line(24, 1, 16, 29, 1, 27, (tt) => t(ROPE, 2 + ((tt * 14) & 1)), 0, 1.2);
    return { grid: g, pivot: [c, 0.5, c], scale: P2, ao: false, main: [0.62, 0.5, 0.32] };
  },

  /** An ore cart on the rails: riveted iron tub, wheels with spokes, a load of ore (v 1: tipped over, spilt). */
  cart(r, v) {
    const tipped = v % 2 === 1;
    const W = 30, H = 26, D = 22;
    const g = tipped ? new PGrid(W, D, H + 18) : new PGrid(W, H, D);
    const put = (x, y, z, c, gl = 0) => { if (tipped) g.set(x, D - 1 - z, y, c, gl); else g.set(x, y, z, c, gl); };
    // the tub: flared sides, rim, ribs, rivets
    for (let y = 8; y < H; y++) {
      const fl = Math.round((y - 8) / 9);
      for (let z = 1 - fl; z < D - 1 + fl; z++) for (let x = 1 - fl; x < W - 1 + fl; x++) {
        if (x < 0 || z < 0 || x >= W || z >= D) continue;
        const wall = x === 1 - fl || x === W - 2 + fl || z === 1 - fl || z === D - 2 + fl;
        if (!wall && y > 9) continue;
        const rim = y >= H - 2, rib = !rim && (x === 7 || x === 15 || x === 23) && wall;
        let c = rim ? (y === H - 1 ? IRON_L : IRON_D) : rib ? IRON_D : hv(x >> 2, y >> 2, z >> 2, 51) < 0.25 ? RUST : hv(x >> 1, y >> 1, z >> 1, 52) < 0.06 ? RUST_L : 0x5a524c;
        if (rib && y % 4 === 0) c = IRON_H;
        put(x, y, z, c);
      }
    }
    // the load
    for (let z = 3; z < D - 3; z++) for (let x = 3; x < W - 3; x++) {
      const hgt = tipped ? 11 : 18 + Math.floor(hv(x >> 1, 0, z >> 1, 53) * 3) + (Math.abs(x - 15) + Math.abs(z - 11) < 8 ? 2 : 0);
      for (let y = 10; y <= hgt; y++) {
        const ore = hv(x, y, z, 54) < 0.06;
        put(x, y, z, ore ? [0xf0c040, 0xd8743a, 0xb8c4d0][Math.floor(hv(x, y, z, 55) * 3)] : t(STONE, 2 + (hv(x >> 2, y >> 1, z >> 2, 56) - 0.5) * 2.5), ore ? 1 : 0);
      }
    }
    // the chassis, axles, wheels with spokes and hubs
    for (let x = 3; x < W - 3; x++) { put(x, 7, 4, IRON_D); put(x, 7, D - 5, IRON_D); }
    for (const wx of [7, 22]) {
      for (let z = 1; z < D - 1; z++) put(wx, 5, z, IRON);
      for (const wz of [1, D - 2]) {
        for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > 5.2) continue;
          const tyre = d > 4.1, spoke = Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.6;
          if (!tyre && !spoke && d > 1.4) continue;
          put(wx + dx, 5 + dy, wz, d < 1.4 ? IRON_H : tyre ? (dy > 0 ? IRON_M : IRON_D) : IRON);
        }
      }
    }
    if (tipped) {
      g.ell(15, 0.5, H + 9, 11, 3, 8, (x, y, z) => (g.has(x, y, z) ? -1 : hv(x, y, z, 57) < 0.06 ? [0xf0c040, 0xd8743a, 0xb8c4d0][Math.floor(hv(x, y, z, 58) * 3)] : t(STONE, 2.4 + (hv(x >> 1, y, z >> 1, 59) - 0.5) * 2.5)), 0);
      return { grid: g, pivot: [15, 1, 14], scale: P2, ao: false, main: [0.35, 0.3, 0.28] };
    }
    // the wheels' rims ride on the rails (their tops are 1/8 m over the spot)
    return { grid: g, pivot: [15, -6, 11], scale: P2, ao: false, main: [0.35, 0.3, 0.28] };
  },
};

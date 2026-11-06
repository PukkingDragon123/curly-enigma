// Hand-pixelled organic shapes for the in-world textures (paintings, posters, shadows, food,
// stones, foam, cloth, the loot and relic icons): the art rules forbid clean disc and ellipse
// stamps, so every round thing is a lumpy polygon instead: a ring of 7–11 corners round the
// centre, each at its own angle and reach (seeded), filled by pixel centres. It rasterises into
// flat runs and clean stair-steps the way a pixel artist would set it by hand, a little uneven,
// never a compass circle.
//
//   lumpIn(cx, cy, rx, ry, o)        → (x, y) => true when pixel (x, y) is inside (pixel centres,
//                                       the same convention as PixelCanvas.ellipse / Mask.ellipse)
//   blob(pc, cx, cy, rx, ry, c, a, o) paint it in one colour (c may be fn(dx, dy, x, y) → colour,
//                                       dx, dy in about -1..1; < 0 skips)
//   blobMask(mask, cx, cy, rx, ry, o) add it to a px Mask (gfx/px), returns the mask
// o: { seed, lump (how uneven, 0..0.4, default 0.14), n (corners), flat (cut flat below this dy,
//      e.g. 0.6 for a cushion or a pile sitting on something), rot (radians) }

const hsh = (a, b, s) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * How far pixel (x, y) is out toward the edge of a lumpy polygon round (cx, cy) with reach rx,
 * ry: 0 at the centre, 1 on the edge (for rims and rings that follow the same uneven outline).
 */
export function lumpDist(cx, cy, rx, ry, o = {}) {
  const seed = o.seed ?? Math.round(cx * 13 + cy * 7 + rx * 31 + ry * 17);
  const lump = o.lump ?? 0.14;
  const n = o.n ?? Math.max(7, Math.min(11, Math.round(5 + Math.max(rx, ry) * 0.8)));
  const rot = o.rot ?? 0, cr = Math.cos(rot), sr = Math.sin(rot);
  const C = [];
  for (let i = 0; i < n; i++) {
    let a = ((i + (hsh(i, 1, seed) - 0.5) * 0.5) / n) * Math.PI * 2;
    if (a < 0) a += Math.PI * 2;
    const r = 1 + (hsh(i, 2, seed) - 0.5) * 2 * lump;
    C.push({ a, x: Math.cos(a) * r, y: Math.sin(a) * r, r });
  }
  C.sort((p, q) => p.a - q.a);
  return (x, y) => {
    const px = x + 0.5 - cx, py = y + 0.5 - cy;
    const u = (px * cr + py * sr) / rx, v = (-px * sr + py * cr) / ry;
    const d = Math.hypot(u, v);
    if (d < 1e-6) return 0;
    const dx = u / d, dy = v / d;
    // the polygon edge along this ray: the segment between the two corners it falls between
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI * 2;
    let i = n - 1;
    for (let k = 0; k < n; k++) if (C[k].a <= a) i = k;
    const P = C[i], Q = C[(i + 1) % n];
    const ex = Q.x - P.x, ey = Q.y - P.y, den = dx * ey - dy * ex;
    const edge = Math.abs(den) < 1e-6 ? P.r : (P.x * ey - P.y * ex) / den;
    return d / Math.max(0.2, edge);
  };
}

/** The inside test of a lumpy polygon round (cx, cy) with reach rx, ry. */
export function lumpIn(cx, cy, rx, ry, o = {}) {
  const dist = lumpDist(cx, cy, rx, ry, o);
  const flat = o.flat ?? 9, rot = o.rot ?? 0, cr = Math.cos(rot), sr = Math.sin(rot);
  return (x, y) => {
    if (flat < 9 && (-(x + 0.5 - cx) * sr + (y + 0.5 - cy) * cr) / ry > flat) return false;
    return dist(x, y) <= 1;
  };
}

/** Paint a lumpy blob (c: colour or fn(dx, dy, x, y) → colour, < 0 skips). */
export function blob(pc, cx, cy, rx, ry, c, a = 255, o = {}) {
  const inside = lumpIn(cx, cy, rx, ry, o);
  const R = Math.max(rx, ry) * (1 + (o.lump ?? 0.14)) + 1;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      if (!inside(x, y)) continue;
      const col = typeof c === 'function' ? c((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry, x, y) : c;
      if (col >= 0) pc.set(x, y, col, a);
    }
  return pc;
}

/** Add a lumpy blob to a px Mask (native pixel coordinates); returns the mask. */
export function blobMask(mask, cx, cy, rx, ry, o = {}) {
  const inside = lumpIn(cx, cy, rx, ry, o);
  const R = Math.max(rx, ry) * (1 + (o.lump ?? 0.14)) + 1;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) if (inside(x, y)) mask.set(x, y, 1);
  return mask;
}

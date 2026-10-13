// A tiny flat-shaded 3D polygon renderer for icons (ingots, furniture, boxes): faces are
// projected with a fixed 3/4 camera, depth-sorted and filled with a ramp tone picked from
// their normal against the top-left light. Optional per-face painters add texture.
import { Mask, LIGHT, toneOf } from './shade.js';

/**
 * Camera: yaw r (radians, around the vertical), tilt t (how much of the top we see),
 * scale k, screen center (cx, cy).
 */
export function camera(o = {}) {
  const r = o.yaw ?? 0.5, t = o.tilt ?? 0.6, k = o.scale ?? 1, cx = o.cx ?? 16, cy = o.cy ?? 18;
  const cr = Math.cos(r), sr = Math.sin(r), ct = Math.cos(t), st = Math.sin(t);
  const view = (x, y, z) => {
    const x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
    return [x1, y * ct - z1 * st, y * st + z1 * ct];
  };
  return {
    view,
    /** 3D → [sx, sy, depth] (y up in 3D, depth toward the viewer). */
    p(x, y, z) { const v = view(x, y, z); return [cx + v[0] * k, cy - v[1] * k, v[2]]; },
    /** Screen-space normal [nx, ny(down), nz(toward viewer)]. */
    n(x, y, z) { const v = view(x, y, z); return [v[0], -v[1], v[2]]; },
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Tone (1..5) for a screen-space normal. */
export function toneOfNormal(n, bias = 0) {
  const v = norm(n);
  return Math.max(1, Math.min(5, Math.floor(toneOf(v[0] * LIGHT[0] + v[1] * LIGHT[1] + v[2] * LIGHT[2] + bias))));
}

/**
 * Render faces: [{pts: [[x,y,z]...] (CCW seen from outside), R (ramp), tone?, bias?, paint?(pc, mask, tone, face), ring?}]
 * Back-facing faces are skipped; the rest are painted far-to-near. Returns the union mask.
 */
export function drawSolid(pc, cam, faces, o = {}) {
  const list = [];
  for (const f of faces) {
    const P = f.pts.map((q) => cam.p(q[0], q[1], q[2]));
    // 3D normal from the first three points (counter-clockwise from outside)
    const n3 = norm(cross(sub(f.pts[1], f.pts[0]), sub(f.pts[2], f.pts[0])));
    const ns = cam.n(n3[0], n3[1], n3[2]);
    if (ns[2] <= 0.02 && !f.twoSided) continue;
    let depth = P.reduce((s, q) => s + q[2], 0) / P.length;
    // faces of one object (same center) sort together: object depth first, then face depth
    if (f.center) depth = cam.p(f.center[0], f.center[1], f.center[2])[2] * 100 + depth;
    depth += f.zbias || 0;
    list.push({ f, P, ns, depth });
  }
  list.sort((a, b) => a.depth - b.depth);
  const all = new Mask(pc.w, pc.h);
  for (const { f, P, ns } of list) {
    const m = new Mask(pc.w, pc.h).poly(P.map((q) => [q[0], q[1]]));
    all.union(m);
    const tone = f.tone ?? toneOfNormal(ns, f.bias ?? o.bias ?? 0);
    if (f.paint) f.paint(pc, m, tone, f, P);
    else m.each((x, y) => pc.set(x, y, f.R[tone]));
  }
  return all;
}

/** Faces of an axis-aligned box (x0..x1, y0..y1, z0..z1). Omit faces via skip ('top','bottom','front','back','left','right'). */
export function boxFaces(x0, y0, z0, x1, y1, z1, R, o = {}) {
  const sk = new Set(o.skip || []);
  const F = [];
  const center = o.group === false ? undefined : [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const add = (name, pts) => { if (!sk.has(name)) F.push({ name, pts, center, R: (o.R && o.R[name]) || R, paint: o.paint?.[name] || o.paintAll, tone: o.tone?.[name], bias: o.bias?.[name] }); };
  add('top', [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]);
  add('bottom', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
  add('front', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
  add('back', [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]);
  add('left', [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
  add('right', [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]);
  return F;
}

/**
 * Faces of a frustum-like prism: bottom rect (bx, bz half sizes) at y0, top rect (tx, tz) at y1,
 * centered at (cx, cz). Used for ingots, pots, crates with slanted sides.
 */
export function frustumFaces(cx, cz, bx, bz, tx, tz, y0, y1, R, o = {}) {
  const b = [[cx - bx, y0, cz - bz], [cx + bx, y0, cz - bz], [cx + bx, y0, cz + bz], [cx - bx, y0, cz + bz]];
  const t = [[cx - tx, y1, cz - tz], [cx + tx, y1, cz - tz], [cx + tx, y1, cz + tz], [cx - tx, y1, cz + tz]];
  const center = o.group === false ? undefined : [cx, (y0 + y1) / 2, cz];
  const mk = (name, pts) => ({ name, pts, center, R: (o.R && o.R[name]) || R, paint: o.paint?.[name] || o.paintAll, tone: o.tone?.[name], bias: o.bias?.[name] });
  return [
    mk('top', [t[0], t[3], t[2], t[1]]),
    mk('front', [b[3], b[2], t[2], t[3]]),
    mk('back', [b[1], b[0], t[0], t[1]]),
    mk('left', [b[0], b[3], t[3], t[0]]),
    mk('right', [b[2], b[1], t[1], t[2]]),
  ];
}

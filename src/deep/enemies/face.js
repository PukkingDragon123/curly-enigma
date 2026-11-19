// Wave 17 sculpted faces (player rule: never a dot-eye, line-mouth or emoji face pasted on a blob).
// Faces are built into the head, on its +z side, at the model's own voxel:
//
//   socketEye(head, ball, cx, cy, sd, o)  a socket carved in (shadowed deepest under the brow), an
//                                         eyeball seated in it (sclera, ringed iris, pupil, specular),
//                                         an upper lid shell, a lower lid, a brow ridge overhanging
//   mouth(vb, cx, cy, o)                  a carved opening with a dark throat, gums, individual
//                                         teeth and fangs, a tongue and rolled lips
//   nostrils(vb, cx, cy, sp, o)           two flared pits with a rim
//   front(vb, x, y)                       the z of the first voxel seen from the front (or null)
//
// The eyeball goes in its own VB (the classes' blinking `eyes` part): squashed behind its lid it
// reads as a blink. Light is from up-left-front, as everywhere in the kit.
import { mul, mix } from './vox.js';
import { taper } from './voxKit.js';

export const front = (vb, x, y, z0 = 60) => { for (let z = z0; z > -60; z--) if (vb.has(x, y, z)) return z; return null; };

/**
 * A sculpted eye on the +z face of `head` round (cx, cy); sd = +1 for the eye on the +x side.
 * o: { r (ball radius), depth (how deep it sits, 0..1 of r), iris, pupil, sclera, slit, pr (pupil
 *      0..1 of the iris), ir (iris 0..1 of the ball), look: [dx, dy], lid (0..1 of the ball under the
 *      upper lid), tilt (+ the lid and brow drop toward the nose: fierce; − sad), skin, lidCol,
 *      brow (colour, or false for none), browR, browUp, bag (lower lid colour), glow (no sclera:
 *      the whole ball is iris, for glowing eyes), ballOnly (just the ball: a second look for the same
 *      socket: pass o.cz from the first call), ballLid (0..1: the lid painted onto the ball itself, e.g. an angry squint) }
 * Returns the ball's centre [x, y, z].
 */
export function socketEye(head, ball, cx, cy, sd, o = {}) {
  const r = o.r ?? 2.5, tilt = o.tilt ?? 0.15;
  const zs = front(head, Math.floor(cx), Math.floor(cy)) ?? 0;
  const skin = o.skin ?? head.get(Math.floor(cx), Math.floor(cy), zs);
  const cz = o.cz ?? zs + 0.5 - r * (o.depth ?? 0.5); // (o.cz: the centre a first call returned)
  // the socket: carved a little bigger than the ball, its walls in shadow
  const R = r + 0.8, rim = [];
  if (!o.ballOnly)
  for (let z = Math.floor(cz - R - 1); z <= Math.ceil(cz + R + 2); z++) for (let y = Math.floor(cy - R - 1); y <= Math.ceil(cy + R + 1); y++) for (let x = Math.floor(cx - R - 1); x <= Math.ceil(cx + R + 1); x++) {
    const d = Math.hypot((x + 0.5 - cx) / R, (y + 0.5 - cy) / R, (z + 0.5 - cz) / R);
    if (d < 1 && z + 0.5 > cz - r * 0.4) head.del(x, y, z);
    else if (d < 1.4 && head.has(x, y, z)) rim.push([x, y, z]);
  }
  if (!o.ballOnly) for (const [x, y, z] of rim) head.set(x, y, z, mix(head.get(x, y, z), 0x140a14, y + 0.5 > cy ? 0.5 : 0.28));
  // the eyeball
  const [lx, ly] = o.look || [0, 0], ir = o.ir ?? 0.62, pr = o.pr ?? 0.45;
  const iris = o.iris ?? 0x7a5a2a, pupil = o.pupil ?? 0x0a0608, sclera = o.sclera ?? 0xeee4d2;
  for (let z = Math.floor(cz - r * 0.3); z <= Math.ceil(cz + r); z++) for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r, nz = (z + 0.5 - cz) / r;
    if (nx * nx + ny * ny + nz * nz > 1) continue;
    const ix = nx - lx * 0.45, iy = ny - ly * 0.45, id = Math.hypot(ix, iy) / ir;
    let c;
    if (o.glow || (nz > 0.05 && id < 1)) {
      c = id > 0.82 ? mul(iris, 0.5) : iy < -0.2 ? mix(iris, 0xffffff, 0.28) : iy > 0.35 ? mul(iris, 0.72) : iris;
      if (o.glow && id >= 1) c = mul(iris, 0.62);
      if (o.slit ? Math.abs(ix) < pr * ir * 0.32 && Math.abs(iy) < ir * 0.92 : id < pr) c = pupil;
    } else c = ny > 0.35 ? mul(sclera, 0.74) : nx * sd > 0.55 || ny < -0.6 ? mul(sclera, 0.86) : sclera;
    if (nz > 0.45 && Math.hypot(nx + 0.32, ny - 0.36) < Math.max(0.2, 0.75 / r)) c = 0xffffff; // the specular
    else if (nz > 0.5 && r >= 2 && Math.hypot(nx - 0.3, ny + 0.32) < 0.13) c = mix(c, 0xffffff, 0.6);
    if (o.ballLid) { const cut = 1 - 2 * o.ballLid + (o.tilt ?? 0.15) * nx * sd * 1.6; if (ny > cut) c = ny < cut + 0.25 ? 0x1a0e10 : (o.lidCol ?? skin); }
    ball.set(x, y, z, c);
  }
  if (o.ballOnly) return [cx, cy, cz];
  // the upper lid (a shell over the ball's top, dropping toward the nose when fierce) and its lash line,
  // the lower lid, the brow ridge
  const lid = o.lid ?? 0.28, lidCol = o.lidCol ?? skin, L = r + 0.9;
  for (let z = Math.floor(cz - 1); z <= Math.ceil(cz + L); z++) for (let y = Math.floor(cy - L); y <= Math.ceil(cy + L); y++) for (let x = Math.floor(cx - L); x <= Math.ceil(cx + L); x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz, d = Math.hypot(dx, dy, dz);
    if (d < r + 0.15 || d > L || dz < -0.2) continue;
    const ny = dy / d, nx = dx / d;
    const cut = 1 - 2 * lid + tilt * nx * sd * 1.2;
    if (ny > cut) head.set(x, y, z, ny < cut + 0.22 ? mix(lidCol, 0x1a0e10, 0.55) : lidCol);
    else if (ny < -0.72) head.set(x, y, z, o.bag ?? mix(lidCol, 0xffffff, 0.08));
  }
  if (o.brow !== false) {
    const bc = o.brow ?? mul(skin, 0.82), by = cy + r * 1.15 + (o.browUp ?? 0), br = o.browR ?? Math.max(0.9, r * 0.45);
    taper(head, cx + sd * r * 1.25, by + tilt * r * 0.5, zs + 0.3, cx - sd * r * 0.95, by - tilt * r * 0.9, zs + 0.9, br, br * 0.85, (x, y, z) => (y + 0.5 > by ? mix(bc, 0xfff0d8, 0.1) : bc));
  }
  return [cx, cy, cz];
}

/**
 * A sculpted mouth on the +z face round (cx, cy): a lens-shaped opening w × h carved d deep, the
 * throat darkening to the back, gums lining it, individual teeth hanging from the top (and rising
 * from the bottom when o.lower), fangs, a tongue on the floor, rolled lips (the lower one proud).
 * o: { w, h, d, curve (+ grin, − scowl), asym (one corner higher), gap (teeth spacing), fangs: [u…]
 *      (corner positions −1..1), fang (length), lower, tooth, gum, lip, tongue, throat }
 */
export function mouth(vb, cx, cy, o = {}) {
  const w = o.w ?? 8, h = o.h ?? 3, d = o.d ?? 3, hw = w / 2, curve = o.curve ?? 0.25, asym = o.asym ?? 0;
  const tooth = o.tooth ?? 0xf4ead4, gum = o.gum ?? 0xb8485a, throat = o.throat ?? 0x200810, tongue = o.tongue ?? 0xd86a7a;
  const gap = o.gap ?? 2, fangs = o.fangs ?? [-0.62, 0.62], fl = o.fang ?? 2;
  const cols = [];
  for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
    const u = (x + 0.5 - cx) / hw;
    if (Math.abs(u) > 1) continue;
    const half = (h / 2) * Math.pow(1 - u * u, 0.6), mid = cy + curve * u * u * h * 0.8 + asym * u;
    const top = Math.round(mid + half), bot = Math.round(mid - half);
    if (top <= bot) continue;
    const z0 = front(vb, x, Math.round(mid));
    if (z0 === null) continue;
    const lip = o.lip ?? mul(vb.get(x, top, front(vb, x, top) ?? z0), 0.78);
    const dd = Math.max(1, Math.round(d * (1 - u * u * 0.5)));
    for (let y = bot; y < top; y++) for (let k = -1; k <= dd; k++) vb.del(x, y, z0 - k);
    for (let y = bot; y < top; y++) vb.set(x, y, z0 - dd - 1, mix(throat, gum, 0.25 * (1 - Math.abs(u))));
    for (let k = 1; k <= dd; k++) { vb.set(x, top, z0 - k, gum); vb.set(x, bot - 1, z0 - k, mul(gum, 0.85)); }
    // lips: the rim round the opening, the lower one a voxel proud
    vb.set(x, top, z0 + (vb.has(x, top, z0 + 1) ? 1 : 0), lip);
    vb.set(x, bot - 1, z0, lip); if (Math.abs(u) < 0.75) vb.set(x, bot - 1, z0 + 1, mix(lip, 0xffffff, 0.08));
    cols.push({ x, u, top, bot, z0, dd });
  }
  for (const { x, u, top, bot, z0, dd } of cols) {
    const fang = fangs.some((f) => Math.abs(u - f) < 0.5 / hw + 0.06);
    const zt = z0 - Math.min(1, dd);
    if (fang || (Math.round(x - cx) % gap === 0)) {
      const n = fang ? fl : 1;
      for (let i = 1; i <= n && top - i >= bot - (fang ? 1 : 0); i++) vb.set(x, top - i, zt, i === n ? mix(tooth, 0xffffff, 0.3) : tooth);
    }
    if (o.lower && Math.round(x - cx + 1) % gap === 0 && Math.abs(u) < 0.85) vb.set(x, bot, zt, mul(tooth, 0.92));
    if (Math.abs(u) < 0.55 && top - bot >= 2) { vb.set(x, bot, z0 - dd, tongue); if (Math.abs(u) < 0.3) vb.set(x, bot, z0 - dd + 1, mix(tongue, 0xffffff, 0.15)); }
  }
}

/** Two flared nostril pits sp apart round (cx, cy) on the +z face. o: { r, col, rim } */
export function nostrils(vb, cx, cy, sp, o = {}) {
  const r = o.r ?? 0.9;
  for (const sd of [1, -1]) {
    const nx = cx + sd * sp / 2;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(nx - r - 1); x <= Math.ceil(nx + r + 1); x++) {
      const dd = Math.hypot((x + 0.5 - nx) / (r * 1.2), (y + 0.5 - cy) / r), z = front(vb, x, y);
      if (z === null) continue;
      if (dd < 1) { vb.del(x, y, z); vb.set(x, y, z - 1, o.col ?? 0x1a0c0c); }
      else if (dd < 1.7 && y + 0.5 > cy) vb.set(x, y, z, o.rim ?? mix(vb.get(x, y, z), 0xffffff, 0.12));
    }
  }
}

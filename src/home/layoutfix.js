// Small layout helpers for your alcoves: re-seating furniture that no longer fits where it stood
// (nooks.js does the work: an alcove at a time, storage when there's no room), and finding a free
// tile beside a piece (to stand up from a bed you've placed...).
import { reseatNooks, findSpotNooks } from './nooks.js';

/** Re-seat every placed piece that no longer fits the open alcoves `set` (storage if it can't). Returns true if anything moved. */
export function relocateBlocked(st, set) { return reseatNooks(st, set); }

/** The nearest spot (to x0, y0) in the open alcoves where `id` fits, trying its rotation first. */
export function findSpot(placed, set, id, r0, uid, x0 = 0, y0 = 0) { return findSpotNooks(placed, set, id, r0, uid, x0, y0); }

/** A free floor tile beside a placed piece, its front first: { x, z (tile centre), face: {x, z} } or null. */
export function besideItem(s, rec) {
  const { p, fw, fd } = rec;
  const yaw = (p.r || 0) * Math.PI / 2;
  const fx = Math.round(Math.sin(yaw)), fz = Math.round(Math.cos(yaw));
  const cands = [];
  const push = (x, y) => { if (!s.tileBlocked(x, y)) cands.push({ x: x + 0.5, z: y + 0.5 }); };
  if (fz > 0) for (let x = p.x; x < p.x + fw; x++) push(x, p.y + fd);
  if (fz < 0) for (let x = p.x; x < p.x + fw; x++) push(x, p.y - 1);
  if (fx > 0) for (let y = p.y; y < p.y + fd; y++) push(p.x + fw, y);
  if (fx < 0) for (let y = p.y; y < p.y + fd; y++) push(p.x - 1, y);
  // then along its sides, nearest the front first (out of bed on the side, not over the headboard)
  if (fz) for (const x of [p.x + fw, p.x - 1]) for (let k = 0; k < fd; k++) push(x, fz > 0 ? p.y + fd - 1 - k : p.y + k);
  if (fx) for (const y of [p.y + fd, p.y - 1]) for (let k = 0; k < fw; k++) push(fx > 0 ? p.x + fw - 1 - k : p.x + k, y);
  for (let y = p.y - 1; y <= p.y + fd; y++) for (let x = p.x - 1; x <= p.x + fw; x++) push(x, y);
  const c = cands[0];
  if (!c) return null;
  return { x: c.x, z: c.z, face: { x: rec.cx, z: rec.cz } };
}

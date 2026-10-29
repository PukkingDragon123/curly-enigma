// Small layout helpers for the first-person burrow: moving furniture out of tiles that older saves
// may have filled before the lift, the build bench and the tunnel fronts needed them, and finding a
// free tile beside a piece (to stand up from the bed, come back from the forge...).
import { FURNITURE } from '../data/furniture.js';
import { canPlace, isStorable, isWallHung } from '../iso/homeLayout.js';

/** Re-seat every placed piece that no longer fits (TUNNEL_SLOTS must be set). Returns true if anything moved. */
export function relocateBlocked(st, W, D) {
  const home = st.data.home;
  let changed = false;
  for (const p of [...home.placed]) {
    if (!FURNITURE[p.id]) continue;
    if (canPlace(home.placed, W, D, p.id, p.x, p.y, p.r || 0, p.uid).ok) continue;
    const spot = findSpot(home.placed, W, D, p.id, p.r || 0, p.uid, p.x, p.y);
    if (spot) { p.x = spot.x; p.y = spot.y; p.r = spot.r; changed = true; continue; }
    if (isStorable(p.id)) {
      home.placed.splice(home.placed.indexOf(p), 1);
      st.addItem(p.id, { spill: true, n: 1 });
      changed = true;
    }
  }
  return changed;
}

/** The nearest spot (to x0, y0) where `id` fits, trying its rotation first. */
export function findSpot(placed, W, D, id, r0, uid, x0 = 0, y0 = 0) {
  const rs = isWallHung(id) ? [0, 1, 2, 3] : [r0, (r0 + 1) % 4, (r0 + 2) % 4, (r0 + 3) % 4];
  let best = null, bd = Infinity;
  for (const r of rs) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - x0, y - y0) + (r === r0 ? 0 : 0.5);
    if (d >= bd) continue;
    if (canPlace(placed, W, D, id, x, y, r, uid).ok) { best = { x, y, r }; bd = d; }
  }
  return best;
}

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

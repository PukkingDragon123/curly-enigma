// Deep Town layout: one place for every landmark so the floor painter, collision,
// models and townsfolk all agree. Tiles are 1 world unit; x runs west→east, z north→south.
// The camera looks from the south-east, so the north (z≈0) and west (x≈0) cave walls are
// the tall back walls with shop fronts; the south and east edges are low rocky rims.

export const TOWN = {
  W: 36,
  H: 30,
  northFace: 3, // rock face z on the north wall
  westFace: 3, // rock face x on the west wall
  southRim: 27.5,
  eastRim: 33.5,
  wallH: 8.6, // height of the back walls (they fade into the dark well before the top)
  plaza: { x: 18.5, z: 15.5, r: 7.2 },
  fountain: { x: 18.5, z: 15.5, r: 2.15 },
  sun: { x: 21.05, z: 7.95, r: 1.3 },
  home: { x0: 9.5, w: 2, door: { x: 10.5, z: 3.65 }, spawn: { x: 10.5, z: 4.7 } },
  // the old collapsed tunnel the mole escapes through (boarded up, later blocked by rubble)
  tunnel: { x0: 12.45, x1: 14.75, cx: 13.6, out: { x: 13.6, z: 4.85 }, inside: { x: 13.6, z: 2.55 } },
  booth: { x0: 16, z0: 3, w: 5, d: 3 },
  // a thin waterfall pouring down the north wall between the booth and the assay office
  falls: { x: 21.75, z: 3, top: 6.6, basin: { x: 21.75, z: 3.62, rx: 0.68, rz: 0.56 } },
  lift: { x0: 29, z0: 3, w: 4, d: 4, cage: { x: 31, z: 5 }, front: { x: 31, z: 7.45 }, crank: { x: 28.35, z: 6.2 }, op: { x: 28.2, z: 7.25 } },
  // shop fronts along the back walls: a = start along the wall, w = width in tiles
  shops: [
    { id: 'tools', wall: 'N', a: 3.5, w: 5 },
    { id: 'assay', wall: 'N', a: 22.5, w: 5 },
    { id: 'grocer', wall: 'W', a: 5, w: 5 },
    { id: 'furniture', wall: 'W', a: 10.5, w: 5 },
    { id: 'blueprints', wall: 'W', a: 16, w: 5 },
    { id: 'outfitter', wall: 'W', a: 21.5, w: 5 },
  ],
  benches: [
    { x: 18.5, z: 11.75, yaw: 0 },
    { x: 13.95, z: 15.5, yaw: Math.PI / 2 },
    { x: 23.05, z: 15.5, yaw: -Math.PI / 2 },
    { x: 18.5, z: 19.25, yaw: Math.PI },
    { x: 12.15, z: 6.75, yaw: Math.PI * 0.12 }, // the old-timer's bench by the boarded tunnel
  ],
  lamps: [
    { x: 14.3, z: 11.2 }, { x: 22.7, z: 11.2 }, { x: 14.3, z: 19.8 }, { x: 22.7, z: 19.8 },
    { x: 6.7, z: 7.2 }, { x: 6.7, z: 18.4 }, { x: 15.35, z: 5.35 }, { x: 27.2, z: 8.6 },
    { x: 21.4, z: 25.0 }, { x: 10.9, z: 25.6 }, { x: 31.6, z: 17.2 },
  ],
  trees: [
    { x: 31.0, z: 22.6, h: 3.1, r: 1.55, hue: 0 },
    { x: 13.6, z: 26.1, h: 2.9, r: 1.45, hue: 1 },
    { x: 25.2, z: 26.3, h: 2.7, r: 1.35, hue: 2 },
  ],
  // mine-cart track from the lift out toward the plaza (a curve joins the straights)
  track: [{ x: 31, z: 7.2 }, { x: 31, z: 11.1 }, { x: 29.6, z: 12.5 }, { x: 25.6, z: 12.5 }],
  cart: { x: 31, z: 9.7 },
  orePile: { x: 24.7, z: 13.6 },
  houses: [{ x: 7.0, z: 29.6, yaw: Math.PI }, { x: 22.0, z: 30.0, yaw: Math.PI }, { x: 35.2, z: 14.0, yaw: -Math.PI / 2 }],
  // market stalls around the plaza (decor; the keepers chat)
  stalls: [
    { x: 11.55, z: 20.9, yaw: Math.PI * 0.25, kind: 'shrooms' },
    { x: 25.6, z: 19.9, yaw: -Math.PI * 0.3, kind: 'fish' },
    { x: 25.75, z: 9.35, yaw: -Math.PI * 0.75, kind: 'gems' },
  ],
  // shallow puddles on the cobbles, catching the lantern light
  puddles: [[24.3, 18.5, 0.62, 0.42], [12.7, 9.7, 0.5, 0.36], [28.7, 14.6, 0.55, 0.4], [8.9, 21.6, 0.45, 0.3], [20.6, 23.6, 0.4, 0.3]],
};

/** Front-of-shop geometry: door center on the floor, facing yaw, and facade extent. */
export function shopFront(s) {
  const mid = s.a + s.w / 2;
  if (s.wall === 'N') return { x: mid, z: TOWN.northFace + 1, yaw: 0, nx: 0, nz: 1, along: [1, 0] };
  return { x: TOWN.westFace + 1, z: mid, yaw: Math.PI / 2, nx: 1, nz: 0, along: [0, -1] };
}

/** Streets (setts) along the shop fronts and the short paths into the plaza. */
export function streetAt(x, z) {
  if (z > 3.0 && z < 6.4 && x > 3.0 && x < 33) return 'N';
  if (x > 3.0 && x < 6.4 && z > 3.0 && z < 27) return 'W';
  return null;
}

/** Secondary cobbled paths (round cobbles). */
export function pathAt(x, z) {
  if (Math.abs(x - 18.5) < 1.25 && z > 6 && z < 9.2) return true; // booth → plaza
  if (Math.abs(z - 15.5) < 1.1 && x > 6 && x < 12) return true; // west path → plaza
  if (Math.abs(x - 18.5) < 1.0 && z > 22 && z < 27.2) return true; // south path
  return false;
}

/** Is the floor point on the cobbled plaza or a path? */
export function pavedAt(x, z) {
  const p = TOWN.plaza;
  if (Math.hypot(x - p.x, z - p.z) < p.r) return true;
  return !!streetAt(x, z) || pathAt(x, z);
}

/** Distance from a point to the track polyline (and the segment index). */
export function trackDist(x, z) {
  const pts = TOWN.track;
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}

/** The plank deck around the lift shaft. */
export function deckAt(x, z) {
  const L = TOWN.lift;
  return x > L.x0 - 0.35 && x < L.x0 + L.w + 0.3 && z > L.z0 && z < L.z0 + L.d + 0.75;
}

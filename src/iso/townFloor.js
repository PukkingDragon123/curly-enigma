// Deep Town's floor, painted at 32 texels per tile: worn granite setts along the shop
// streets, a fan of ring setts around the fountain with a dressed curb, round cobbles
// on the side paths, packed earth with pebbles, roots, cracks, paw prints and cart ruts,
// gravel ballast under the rails, a plank deck round the lift, moss and tiny flowers in
// the damp corners, wet stones by the waterfall and puddles. Relief → normal map.
import { hyp, Surf, dirt, setts, ringSetts, cobbles, planks, pebbles, pebble, worm, pawTrail, moss, finish, toTextures, hash2, mul, mix } from './surface.js';
import { TOWN, streetAt, pathAt, trackDist, deckAt } from './townLayout.js';

export const TPX = 32;

const SETT = [0x8a8178, 0x7c736b, 0x968a7d, 0x6f675f, 0x857a6c, 0x9a9184, 0x7a6f62];
const RING = [0x948a7e, 0x857b70, 0x9e9486, 0x7a7066, 0x8c8073, 0xa59a8a];
const COBBLE = [0x8a7e72, 0x7a6e64, 0x9a8c7c, 0x6e645a, 0x8e8478, 0xa08f7a, 0x7d7266];
const CURB = [0xa49a8c, 0x9a9082, 0xb0a696];
const MORTAR = 0x3a2e26;

/** Paint the town floor. extras.shadows: [{x, z, rx, rz, k}] contact shadows of statics (world units). */
export function paintTownFloor(extras = {}) {
  const { W, H } = TOWN;
  const S = new Surf(W * TPX, H * TPX, TPX);
  const T = (v) => Math.round(v * TPX);
  const at = S.sampler('edgeNoise', 22, 5, 2);

  // ------------------------------------------------ packed earth everywhere
  dirt(S, {}, { colors: [0x6e5038, 0x5d432f, 0x4b3526], seed: 11 });
  // ------------------------------------------------ roots crawling out from the walls and trees
  const rr = (n, s) => hash2(n, 0, s);
  for (let k = 0; k < 26; k++) {
    const onN = k % 2 === 0;
    const u = 3.4 + rr(k, 3) * (onN ? 29 : 23);
    const x = onN ? T(u) : T(TOWN.westFace) + 2, y = onN ? T(TOWN.northFace) + 2 : T(u);
    if (onN && (Math.abs(u - TOWN.tunnel.cx) < 1.6)) continue;
    const ang = onN ? Math.PI / 2 + (rr(k, 5) - 0.5) * 1.1 : (rr(k, 5) - 0.5) * 1.1;
    worm(S, x, y, ang, 20 + rr(k, 7) * 70, { width: 2.2 + rr(k, 8) * 2.2, color: 0x5e4028, height: 1.4, seed: 100 + k, taper: true, branch: 0.06, wander: 0.4 });
  }
  for (const t of TOWN.trees) {
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rr(k, t.hue);
      worm(S, T(t.x) + Math.cos(a) * 10, T(t.z) + Math.sin(a) * 10, a, 26 + rr(k, 9) * 40, { width: 3.2, color: 0xb8aca0, height: 1.6, seed: 300 + k * 7 + t.hue, taper: true, branch: 0.05, wander: 0.3 });
    }
  }
  // cracks in the dry earth
  for (let k = 0; k < 40; k++) {
    const x = T(4 + rr(k, 11) * 29), y = T(4 + rr(k, 12) * 23);
    worm(S, x, y, rr(k, 13) * 6.28, 12 + rr(k, 14) * 26, { width: 1.6, dark: 0.62, height: -0.6, seed: 500 + k, wander: 0.9, branch: 0.12 });
  }

  // ------------------------------------------------ the rutted cart lane east of the plaza
  const lane = (x) => 15.5 - (x - 25.7) * 0.11;
  for (let x = T(25.2); x < T(33.6); x++) {
    const wz = lane(x / TPX);
    for (const off of [-0.34, 0.34]) {
      const yc = T(wz + off) + Math.round(Math.sin(x * 0.05) * 1.2);
      for (let dy = -2; dy <= 2; dy++) {
        const y = yc + dy;
        if (!S.inb(x, y)) continue;
        const i = x + y * S.w;
        const depth = 1 - Math.abs(dy) / 2.5;
        S.c[i] = mul(S.c[i], dy === 2 ? 1.12 : dy === -2 ? 0.86 : 0.74 + (1 - depth) * 0.1);
        S.ht[i] -= depth * 1.4;
        if (hash2(x, y, 3) < 0.04) S.wet[i] = 128;
      }
    }
  }
  pawTrail(S, T(26.2), T(15.4), -0.1, 70, { seed: 61, k: 0.82 });
  pawTrail(S, T(14.0), T(23.2), Math.PI * 0.62, 22, { seed: 62, k: 0.82 });
  pawTrail(S, T(9.0), T(17.0), Math.PI * 0.52, 34, { seed: 63, k: 0.8 });
  pawTrail(S, T(27.6), T(19.0), Math.PI * 0.2, 30, { seed: 64, k: 0.8, stride: 7, side: 2 });

  // pebbles everywhere on the earth
  pebbles(S, {}, { cell: 13, chance: 0.22, seed: 21 });
  pebbles(S, {}, { cell: 5, chance: 0.12, seed: 22, size: 0.6 });

  // ------------------------------------------------ gravel ballast under the rails
  for (let y = T(6.5); y < T(13.4); y++) for (let x = T(24.8); x < T(32); x++) {
    const d = trackDist(x / TPX, y / TPX);
    if (d > 0.62 + at(x, y) * 0.12) continue;
    const i = x + y * S.w;
    const g = hash2(x >> 1, y >> 1, 7), g2 = hash2(x, y, 8);
    const c = [0x6e655c, 0x5a5048, 0x7e766c, 0x4a423c, 0x8a8176][Math.floor(g * 5)];
    S.c[i] = mul(c, 0.9 + g2 * 0.2);
    S.ht[i] = (g * 1.2 + g2 * 0.3) * (d < 0.5 ? 1 : 0.6);
    S.own[i] = 6;
  }

  // ------------------------------------------------ streets: granite setts in running bond
  const NF = TOWN.northFace, WF = TOWN.westFace;
  setts(S, { x0: T(WF), y0: T(NF), x1: T(33.2), y1: T(6.9), inside: (cx, cy) => {
    const wx = cx / TPX, wz = cy / TPX;
    if (wx > 15.95 && wx < 21.05 && wz < 6.05) return false; // under the booth
    return wz < 6.25 + at(cx, cy) * 0.35 && wx < 32.8 + at(cx, cy) && streetAt(wx, Math.min(wz, 6.3)) !== null;
  } }, { axis: 'x', rowH: 10, minL: 10, maxL: 19, gap: 2, palette: SETT, mortar: MORTAR, seed: 31, moss: 0.32, crack: 0.12, owner: 2 });
  setts(S, { x0: T(WF), y0: T(6.0), x1: T(6.9), y1: T(27.4), inside: (cx, cy) => {
    const wx = cx / TPX, wz = cy / TPX;
    return wx < 6.25 + at(cx, cy) * 0.35 && wz < 26.9 + at(cx, cy);
  } }, { axis: 'y', rowH: 10, minL: 10, maxL: 19, gap: 2, palette: SETT, mortar: MORTAR, seed: 32, moss: 0.3, crack: 0.12, owner: 2 });

  // ------------------------------------------------ the plaza: ring setts, flagstones by the basin, a dressed curb
  const P = TOWN.plaza, F = TOWN.fountain;
  ringSetts(S, { cx: T(P.x), cy: T(P.z), r0: T(F.r + 0.78), r1: T(P.r - 0.42), rowH: 10, L: 14, gap: 2, palette: RING, mortar: MORTAR, seed: 41, moss: 0.36, owner: 3 });
  ringSetts(S, { cx: T(F.x), cy: T(F.z), r0: T(F.r - 0.05), r1: T(F.r + 0.78), rowH: 26, L: 30, gap: 2, palette: [0xa69c8e, 0x9a9082, 0xb2a898, 0x8e8478], mortar: 0x3e342c, seed: 42, bevel: 3.5, height: 2.6, owner: 3 });
  ringSetts(S, { cx: T(P.x), cy: T(P.z), r0: T(P.r - 0.42), r1: T(P.r), rowH: T(0.42), L: 34, gap: 2, palette: CURB, mortar: 0x3e342c, seed: 43, bevel: 3, height: 3, owner: 3,
    inside: (x, y) => !pathAt(x / TPX, y / TPX) || hyp(x / TPX - P.x, y / TPX - P.z) > P.r - 0.3 });

  // ------------------------------------------------ side paths: round cobbles with ragged edges
  const pathIn = (cx, cy) => {
    const wx = cx / TPX, wz = cy / TPX;
    if (hyp(wx - P.x, wz - P.z) < P.r - 0.2) return false;
    if (streetAt(wx, wz) && wz < 6.2 && wx < 32.8) return false;
    if (streetAt(wx, wz) && wx < 6.2) return false;
    const n = at(cx, cy) * 0.45;
    return pathAt(wx + n, wz - n);
  };
  for (const [x0, z0, x1, z1] of [[16.8, 5.8, 20.2, 9.6], [5.6, 13.8, 12.4, 17.2], [17, 21.6, 20, 27.6]]) {
    cobbles(S, { x0: T(x0), y0: T(z0), x1: T(x1), y1: T(z1), inside: pathIn }, { cell: 12, gap: 2, palette: COBBLE, mortar: MORTAR, seed: 51, jitter: 0.85, moss: 0.28, owner: 4 });
  }

  // ------------------------------------------------ the sunlit patch: the only grass in Deep Town
  const SU = TOWN.sun;
  for (let y = T(SU.z - SU.r - 0.3); y < T(SU.z + SU.r + 0.3); y++) for (let x = T(SU.x - SU.r * 1.3); x < T(SU.x + SU.r * 1.3); x++) {
    const dx = (x / TPX - SU.x) / 1.12, dz = y / TPX - SU.z;
    const d = hyp(dx, dz) / SU.r + at(x, y) * 0.22;
    if (d > 1) continue;
    const i = x + y * S.w;
    const h = hash2(x, y, 3), hb = hash2(x >> 1, y, 4);
    let c = hb < 0.25 ? 0x8ad86a : hb < 0.55 ? 0x6ac04a : hb < 0.85 ? 0x58a83c : 0x467f30;
    if (d > 0.86 && h < 0.5) c = mix(c, 0x6a5038, 0.5);
    if (h > 0.992) c = [0xfff070, 0xffffff, 0xf0a0c0][Math.floor(hash2(y, x, 5) * 3)];
    S.c[i] = c;
    S.ht[i] = 0.6 + hb * 1.2;
    S.own[i] = 7;
  }

  // ------------------------------------------------ the plank deck round the lift
  const L = TOWN.lift;
  planks(S, { x0: T(L.x0 - 0.35), y0: T(L.z0), x1: T(L.x0 + L.w + 0.3), y1: T(L.z0 + L.d + 0.75), inside: (x, y) => deckAt(x / TPX, y / TPX) }, { axis: 'x', bw: 9, minL: 40, maxL: 96, color: 0x8a5e38, seed: 71, worn: true, owner: 5 });
  // the shaft itself: a black hole
  for (let y = T(L.cage.z - 1); y < T(L.cage.z + 1); y++) for (let x = T(L.cage.x - 1); x < T(L.cage.x + 1); x++) { S.c[x + y * S.w] = 0x050304; S.ht[x + y * S.w] = -2; }

  // ------------------------------------------------ the waterfall's wet corner and the tunnel's dust spill
  const FB = TOWN.falls.basin;
  S.wetEllipse(T(FB.x), T(FB.z + 0.4), T(1.4), T(1.0), 0.85);
  moss(S, T(FB.x - 0.9), T(TOWN.northFace + 0.35), T(0.7), T(0.35), { seed: 81, onlyOwner: 2, alsoMortar: true });
  moss(S, T(FB.x + 0.95), T(TOWN.northFace + 0.3), T(0.55), T(0.3), { seed: 82, onlyOwner: 2, alsoMortar: true });
  const TU = TOWN.tunnel;
  for (let k = 0; k < 26; k++) {
    const a = rr(k, 91) * Math.PI, r = rr(k, 92) * 1.3;
    pebble(S, T(TU.cx + Math.cos(a) * r * 1.1), T(NF + 0.25 + Math.sin(a) * r * 0.7), 1.6 + rr(k, 93) * 2.6, 1.2 + rr(k, 94) * 1.6, [0x8a7a6a, 0x6e6056, 0x9a8a78][k % 3]);
  }
  S.darken(T(TU.cx), T(NF + 0.2), T(1.3), T(0.55), 0.7);

  // ------------------------------------------------ moss creeping from the walls, rims and plaza edge
  const mossSpots = [[3.6, 6.8, 0.6, 1.4], [4.6, 3.4, 1.2, 0.4], [8.4, 26.8, 1.6, 0.5], [16.2, 27.0, 1.3, 0.45], [27.6, 27.0, 1.7, 0.5], [33.0, 22.0, 0.45, 1.6], [33.0, 9.4, 0.4, 1.2],
    [32.6, 26.4, 1.0, 1.0], [3.6, 21.4, 0.5, 1.2], [10.6, 22.6, 0.9, 0.6], [26.6, 21.4, 0.8, 0.55], [12.2, 8.4, 0.7, 0.5], [28.4, 4.2, 0.5, 0.35]];
  mossSpots.forEach(([x, z, rx, rz], k) => moss(S, T(x), T(z), T(rx), T(rz), { seed: 120 + k }));

  // ------------------------------------------------ puddles: dark wet beds (the water sits on top as a mesh)
  for (const [x, z, rx, rz] of TOWN.puddles) {
    for (let y = T(z - rz - 0.12); y < T(z + rz + 0.12); y++) for (let xx = T(x - rx - 0.12); xx < T(x + rx + 0.12); xx++) {
      if (!S.inb(xx, y)) continue;
      const d = hyp((xx / TPX - x) / rx, (y / TPX - z) / rz) + at(xx, y) * 0.25;
      const i = xx + y * S.w;
      if (d < 1.25) S.wet[i] = Math.max(S.wet[i], d < 1 ? 255 : (1.25 - d) * 765);
      if (d < 1.12) S.c[i] = mul(S.c[i], d < 1 ? 0.62 : 0.8);
    }
  }

  // ------------------------------------------------ damp earth + contact shadow along the walls and rims (border band only)
  const NF0 = TOWN.northFace, WF0 = TOWN.westFace, band = 2.5;
  const shadeEdge = (x0, y0, x1, y1) => {
    for (let y = Math.max(0, y0); y < Math.min(S.h, y1); y++) {
      const wz = y / TPX;
      for (let x = Math.max(0, x0); x < Math.min(S.w, x1); x++) {
        const i = x + y * S.w;
        if (S.own[i] === 255) continue;
        S.own[i] |= 128;
        const wx = x / TPX;
        const dn = wz - NF0, dw = wx - WF0, ds = TOWN.southRim - 0.15 - wz, de = TOWN.eastRim - 0.15 - wx;
        const edge = Math.min(dn, dw, ds + 0.15, de + 0.15);
        let k = 1;
        if (edge < band && (S.own[i] & 127) === 0) k = 0.82 + Math.max(0, edge) * 0.072;
        const m = Math.min(dn, dw);
        if (m < 0.9) k *= 0.58 + Math.max(0, m) / 0.9 * 0.42 + (((x ^ y) & 1) ? 0.02 : 0);
        const r = Math.min(ds, de);
        if (r < 0.5) k *= 0.7 + Math.max(0, r) / 0.5 * 0.3;
        if (k !== 1) S.c[i] = mul(S.c[i], k);
      }
    }
  };
  shadeEdge(0, 0, S.w, T(NF0 + band));
  shadeEdge(0, T(NF0 + band), T(WF0 + band), S.h);
  shadeEdge(T(WF0 + band), T(TOWN.southRim - band), S.w, S.h);
  shadeEdge(T(TOWN.eastRim - band), T(NF0 + band), S.w, T(TOWN.southRim - band));
  for (let i = 0; i < S.own.length; i++) S.own[i] &= 127;

  // ------------------------------------------------ contact shadows of everything standing on the floor
  finish(S, { ao: 0.14, rake: 0.09 });
  return toTextures(S, { normal: 0.6, baseSpec: 0.04, topSpec: 10 });
}

/** Footstep material for a floor point. */
export function floorMaterialAt(x, z) {
  for (const [px, pz, rx, rz] of TOWN.puddles) if (hyp((x - px) / rx, (z - pz) / rz) < 1) return 'water';
  if (trackDist(x, z) < 0.55) return 'wood';
  if (deckAt(x, z)) return 'wood';
  if (hyp(x - TOWN.sun.x, z - TOWN.sun.z) < TOWN.sun.r) return 'dirt';
  const P = TOWN.plaza;
  if (hyp(x - P.x, z - P.z) < P.r || streetAt(x, z) || pathAt(x, z)) return 'stone';
  return 'dirt';
}

// Cloth in Deep Town (src/gfx/cloth.js): a banner on an iron bracket off every shop front (its
// colours and emblem by trade), the striped valances along the market stalls' awnings, and the
// flag on its pole by the lift, flying in the draught up the shaft. One ClothSet (one draw call +
// its ink line), in town units under the scaled root: the mole and the townsfolk nearby brush
// them aside, the cavern's slow draught stirs them, and they sleep when far off or out of view.
// The brackets and the pole are voxel art, merged with the statics (S.B).
import * as THREE from 'three';
import { Cloth, ClothSet, clothTexture } from '../gfx/cloth.js';
import { TOWN } from '../iso/townLayout.js';
import { VoxelGrid, M32, line } from '../iso/kit.js';
import { M } from './units.js';

/** Banner colours and emblem per shop. */
const SHOP_BANNER = {
  tools: { base: [120, 60, 40], trim: [216, 176, 92], emblem: 'pick' },
  assay: { base: [60, 64, 110], trim: [220, 200, 120], emblem: 'gem' },
  grocer: { base: [70, 110, 60], trim: [230, 210, 150], emblem: 'cup' },
  furniture: { base: [130, 84, 50], trim: [230, 200, 140], emblem: 'star' },
  blueprints: { base: [44, 80, 120], trim: [220, 230, 240], emblem: 'star' },
  outfitter: { base: [120, 50, 90], trim: [236, 196, 110], emblem: 'cup' },
};
const STALL_CLOTH = { shrooms: [[170, 64, 52], [232, 214, 176]], fish: [[60, 100, 150], [232, 232, 222]], gems: [[110, 70, 150], [232, 200, 96]] };

/** An iron bracket sticking out of a wall along +z, L TU long, with a scroll under it (voxel art, TU). */
function bracket(L = 0.9) {
  const n = Math.round(L * 32);
  const g = new VoxelGrid(6, 16, n + 2);
  line(g, [[3, 13, 0], [3, 13, n]], 0.9, (x, y, z) => (z % 9 === 0 ? 0x4a4a52 : 0x34343c));
  line(g, [[3, 2, 0], [3, 7, n * 0.35], [3, 12, n * 0.62]], 0.7, 0x34343c); // the brace
  g.box(1, 0, 0, 5, 16, 2, 0x2a2a30); // the wall plate
  g.box(2, 11, n - 1, 3, 4, 3, 0xc8a050); // a brass knob on the end
  return M32(g, [3, 13, 0]);
}

/** A flag pole H TU tall with a gilded finial and a stone foot (voxel art, TU). */
function flagPole(H = 3.3) {
  const n = Math.round(H * 32);
  const g = new VoxelGrid(12, n + 6, 12);
  for (let y = 0; y < n; y++) for (const [x, z] of [[5, 5], [6, 5], [5, 6], [6, 6]]) g.set(x, y, z, (y + x) % 11 === 0 ? 0x5a3a22 : x === 5 ? 0x7a5230 : 0x6a4628);
  for (let y = 0; y < 6; y++) for (let z = 1; z < 11; z++) for (let x = 1; x < 11; x++) if (Math.hypot(x - 5.5, z - 5.5) < 5.2 - y * 0.5) g.set(x, y, z, (x + z + y) % 4 ? 0x7a7068 : 0x6a6058);
  for (let y = n; y < n + 5; y++) for (let z = 4; z < 8; z++) for (let x = 4; x < 8; x++) if (Math.hypot(x - 5.5, z - 5.5, (y - n - 2) * 0.9) < 2.4) g.set(x, y, z, y === n + 4 ? 0xffe090 : 0xd8b050);
  return M32(g, [6, 0, 6]);
}

export function buildTownCloth(S) {
  const B = S.B, T = TOWN;
  const g = -9.8 / M; // (town units: everything falls 1/M faster per unit)
  const lift = T.lift.cage;
  const set = new ClothSet({ name: 'town cloth', far: 16 / M, near: 1.2 / M });
  // the cavern's slow draught (TU/s²), and the air coming up the lift's shaft: it flies the flag
  set.wind = (t, x = 0, z = 0) => {
    const k = Math.exp(-((x - lift.x) ** 2 + (z - lift.z) ** 2) / 30);
    const sw = Math.sin(t * 0.41) * Math.sin(t * 0.17 + 1.3);
    return [(0.9 + 0.6 * sw) + k * (12 + 5 * Math.sin(t * 1.3) * Math.sin(t * 0.53)), (0.5 * Math.sin(t * 0.29)) + k * 1.5 * Math.sin(t * 0.8)];
  };
  // banners off the shop fronts: a bracket out of the facade near its left end, the banner under it
  for (const s of T.shops) {
    const N = s.wall === 'N', face = (N ? T.northFace : T.westFace) + 1;
    const c = SHOP_BANNER[s.id] || SHOP_BANNER.tools;
    const along = N ? s.a + 0.32 : s.a + s.w - 0.32, y = 2.62, L = 0.95;
    const br = bracket(L);
    if (N) br.position.set(along, y, face); else { br.position.set(face, y, along); br.rotation.y = Math.PI / 2; }
    B.addStatic(br);
    const bw = 0.62, bh = 1.15;
    const cl = new Cloth({ w: bw, h: bh, nx: 6, ny: 10, tex: clothTexture('banner', { ...c, seed: s.a * 7 }), iters: 4, damping: 1.5, g, gust: 1 });
    // hung along the bracket (the sheet's plane is square to the wall: you see it down the street)
    if (N) cl.place(along, y - 0.05, face + L - 0.12, Math.PI / 2); else cl.place(face + L - 0.12 - bw, y - 0.05, along, 0);
    set.add(cl);
  }
  // the market stalls' awnings: a striped valance along the front edge
  T.stalls.forEach((s, i) => {
    const [a, b] = STALL_CLOTH[s.kind] || STALL_CLOTH.shrooms;
    const w = 1.66, cs = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    const lx = -w / 2, lz = 0.6;
    const cl = new Cloth({ w, h: 0.26, nx: 11, ny: 3, tex: clothTexture('valance', { base: a, trim: b, seed: i + 3 }), iters: 3, damping: 2.2, g, gust: 1.4 });
    cl.place(s.x + lx * cs + lz * sn, 1.68, s.z - lx * sn + lz * cs, s.yaw);
    set.add(cl);
  });
  // the flag by the lift, on its pole
  const fp = { x: T.lift.x0 + T.lift.w + 0.55, z: T.lift.z0 + T.lift.d - 0.15 };
  const pole = flagPole(3.3);
  pole.position.set(fp.x, 0, fp.z);
  B.addStatic(pole);
  B.solidCircle(fp.x, fp.z, 0.2, 3.2);
  set.add(new Cloth({ w: 1.0, h: 0.62, nx: 10, ny: 6, tex: clothTexture('flag', { base: [150, 40, 36], trim: [236, 196, 90], emblem: 'pick', seed: 9 }), pins: 'left', iters: 4, damping: 1.1, g, gust: 1 }).place(fp.x + 0.05, 3.25, fp.z, 0));
  S.root.add(set.build());
  S.townCloth = set;
  // each frame: the mole and the townsfolk close to it push through (TU)
  const cols = [];
  S.tickers.push((dt, time) => {
    cols.length = 0;
    const P = S.player?.pos;
    if (P) cols.push({ x: P.x, z: P.z, r: 0.36, y0: (P.y || 0) - 0.05, y1: (P.y || 0) + 1.45, key: 'me' });
    for (const f of S.folk?.list || []) {
      const a = f.a;
      if (!a || !P || Math.abs(a.x - P.x) > 9 || Math.abs(a.z - P.z) > 9) continue;
      cols.push({ x: a.x, z: a.z, r: 0.34, y0: 0, y1: 1.4, key: f });
    }
    set.update(dt, cols, time);
  });
  return set;
}

/** For a look in a test: the set's sheets awake and how many there are. */
export function townClothStats(S) { return S.townCloth ? { ...S.townCloth.stats } : null; }
void THREE;

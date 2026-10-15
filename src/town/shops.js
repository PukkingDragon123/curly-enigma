// Deep Town's shops for first person: each one is a little building tucked into a rock alcove,
// patterned on every face that shows (stone blocks, clapboards, board-and-batten, brick,
// half-timbered plaster), with corner posts, a shingled roof, a door with iron straps and a lit
// pane, and a wide serving window: a counter at mole-waist height (0.5 m), a propped shutter or
// a striped awning above, and inside, lit warm, the keeper's floor, shelves of goods along the
// back wall and a hanging lamp. Shell at 1/16 TU, goods and counter wares at 1/32.
// Local space: x along the front (0..w), z from the back of the alcove (0) to the front face
// (FRONT), y up. Everything in town units.
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, iron, stone, cloth, line, ring, sag, M32, G32, M16, G16, group, mulc, mixc, h3, sp3 } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';
import { barrel, crate, sack, bucket, pottedFern } from '../iso/props.js';
import { wallLantern } from '../iso/props2.js';
import { signCanvas } from '../iso/pixel.js';
import { SHOP_LOOK, grindstone, pickBarrel, veggieCrate, chalkboard, mannequin, scales, blueprintRolls, easel, chairTable, strongbox } from '../iso/shopFront.js';

const V = 16;
const MG = 2; // grid margin (voxels) round the body so side relief and the roof overhang fit
export const FRONT = 45 / V; // depth of a shop building, back to front face (TU)
const FZ = 45, H = 54, COUNTER = 13, WIN_TOP = 36, FLOOR = 6;

/** Per shop: which side the door is on, the interior colour, what is on the shelves. */
const FIT = {
  tools: { door: 'left', inside: 0x6a5a4e, goods: 'tools' },
  assay: { door: 'right', inside: 0x5a4a52, goods: 'assay' },
  grocer: { door: 'right', inside: 0x8a6a48, goods: 'grocer' },
  furniture: { door: 'left', inside: 0xc8b490, goods: 'furniture' },
  blueprints: { door: 'right', inside: 0x34405a, goods: 'blueprints' },
  outfitter: { door: 'left', inside: 0x5a5a3a, goods: 'outfitter' },
};

function pattern(style, wall, trim, seed) {
  return (x, y) => {
    switch (style) {
      case 'plank': {
        const row = Math.floor(y / 5), ly = y % 5, off = (row * 11) % 23;
        const c = mulc(wall, 0.9 + hash2(Math.floor((x + off) / 23), row, seed) * 0.16);
        if ((x + off) % 23 === 0) return [mulc(wall, 0.62), -1];
        if (ly === 0) return [mulc(c, 0.7), 1];
        if (ly === 4) return [mulc(c, 1.08), 0];
        return [Math.sin(x * 0.7 + row * 2) > 0.93 ? mulc(c, 0.9) : c, 0];
      }
      case 'board': {
        const b = ((x % 8) + 8) % 8;
        if (b === 0 || b === 1) return [mulc(wall, 0.72 + hash2(x >> 3, 1, seed) * 0.1), 1];
        const c = mulc(wall, 0.88 + hash2(x >> 3, 2, seed) * 0.18);
        return [(y + (x >> 3) * 7) % 13 === 0 ? mulc(c, 0.86) : c, 0];
      }
      case 'stone': {
        const row = Math.floor(y / 7), off = (row % 2) * 6;
        const bx = Math.floor((x + off) / 12), lx = (((x + off) % 12) + 12) % 12, ly = y % 7;
        if (ly === 0 || lx === 0) return [mixc(wall, 0x2a2420, 0.5), -1];
        const c = mulc(wall, 0.84 + hash2(bx, row, seed) * 0.3);
        if (ly === 6 || lx === 1) return [mulc(c, 1.1), 0];
        if (ly === 1 || lx === 11) return [mulc(c, 0.86), 0];
        return [h3(x, y, 0, seed) < 0.015 ? mulc(c, 0.88) : c, 0];
      }
      case 'brick': {
        const row = Math.floor(y / 4), off = (row % 2) * 4;
        const lx = (((x + off) % 8) + 8) % 8;
        if (y % 4 === 0 || lx === 0) return [0xb8a890, -1];
        const c = mulc(wall, 0.84 + hash2(Math.floor((x + off) / 8), row, seed) * 0.3);
        return [c, hash2(Math.floor((x + off) / 8), row, seed + 1) > 0.93 ? 1 : 0];
      }
      default: {
        const mid = Math.round(H * 0.47), px = ((x % 20) + 20) % 20;
        if (px < 2 || y === mid || y === mid + 1) return [mulc(trim, px < 1 ? 0.9 : 1), 1];
        if (y < mid && ((x % 40) + 40) % 40 < 20) { const t = (y / mid) * 18 + 1; if (Math.abs(px - t) < 1.2 || Math.abs(px - (19 - t)) < 1.2) return [mulc(trim, 1.06), 1]; }
        let c = mulc(wall, 0.995 * sp3(x >> 1, y >> 1, 0, seed, 0.04));
        if (h3(x, y, 1, seed) < 0.006) c = mulc(c, 0.85);
        return [c, 0];
      }
    }
  };
}

/**
 * A shop building w TU wide. Returns { obj, lights:[{x,y,z,kind}], signs:[{pc,w,h,anchor}], props:[{x,z,r}],
 * keeper:{x,y,z}, counter:{x0,x1,y,z} (the serving window), door:{u}, top } in local TU.
 */
export function shopBuilding(id, w) {
  const look = SHOP_LOOK[id], fit = FIT[id];
  const W = Math.round(w * V);
  const seed = id.length * 7 + 3;
  const wall = look.wall, trim = look.trim ?? C.woodD;
  const pat = pattern(look.style, wall, trim, seed);
  const GW = W + MG * 2, GH = H + 20, GD = FZ + 12;
  const g = new VoxelGrid(GW, GH, GD);
  const glow = new VoxelGrid(GW, GH, GD);
  const X = (x) => x + MG; // body x → grid x
  const doorLeft = fit.door === 'left';
  const dw = 20, dh = 30;
  // left to right (mirrored when the door is on the right): post, door, shutter, window, shutter, post
  const mir = (a, b) => (doorLeft ? [a, b] : [W - b, W - a]);
  const [dx0] = mir(5, 25);
  const [wx0, wx1] = mir(36, W - 11);
  const wcx = (wx0 + wx1) / 2;
  // ---- the body: front face with relief, side faces with the pattern carried round the corner
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const [c, r] = pat(x, y);
    const zf = FZ + (r > 0 ? 1 : r < 0 ? -1 : 0);
    for (let z = 0; z < zf; z++) g.set(X(x), y, z, z < zf - 1 ? mulc(c, 0.8) : c);
  }
  for (const side of [-1, 1]) {
    const xs = side < 0 ? 0 : W - 1;
    for (let z = FZ - 22; z < FZ; z++) for (let y = 0; y < H; y++) {
      const [c, r] = pat(FZ - z + (side < 0 ? 0 : 40), y);
      if (r > 0) g.set(X(xs + side), y, z, c); else if (r < 0) g.set(X(xs), y, z, c); else g.set(X(xs), y, z, c);
    }
  }
  // foundation stones round the front and sides
  const found = (x, y) => { const b = Math.floor((x + (y > 2 ? 5 : 0)) / 10); return (y === 3 || ((x + (y > 2 ? 5 : 0)) % 10 + 10) % 10 === 0) ? 0x3e3832 : mulc(0x7a7470, 0.84 + hash2(b, y > 2 ? 1 : 0, seed) * 0.3); };
  g.box(X(-1), 0, 0, W + 2, FLOOR, FZ + 2, (x, y, z) => (x === X(-1) || x === X(W) ? found(z, y) : found(x, y)));
  // corner posts and the top beam (with iron bolts)
  for (const x of [-1, W - 3]) g.box(X(x), FLOOR, FZ - 3, 4, H - FLOOR, 5, beam(trim, 'y', seed + x));
  g.box(X(-1), H - 4, FZ - 3, W + 2, 4, 6, beam(trim, 'x', seed + 3));
  for (let x = 6; x < W - 4; x += 14) g.set(X(x), H - 2, FZ + 3, C.ironL);
  // ---- roof: shingle courses stepping back to the rock, overhanging the sides
  const rc = look.roofColor ?? 0x4a5058;
  for (let k = 0; k < 18; k++) {
    const y = H + k, zf = Math.min(GD - 1, FZ + 9 - k);
    if (zf < 2) break;
    const off = (k % 2) * 3;
    for (let x = -2; x < W + 2; x++) for (let z = 0; z <= zf; z++) {
      const tile = Math.floor((x + off + 6) / 6);
      let c = mulc(rc, 0.86 + Math.floor(hash2(tile, k, seed + 4) * 3) * 0.08);
      if (z === zf && ((x + off) % 6 + 6) % 6 === 0) c = mulc(rc, 0.62);
      if (z === zf) c = mulc(c, 0.92);
      if (x === -2 || x === W + 1) c = mulc(c, 0.8);
      g.set(X(x), y, z, c);
    }
  }
  // ---- the interior, seen through the serving window
  const IX0 = 5, IX1 = W - 5, IZ0 = 5, IZ1 = FZ - 4, IY1 = 47;
  const inside = fit.inside;
  for (let x = IX0; x < IX1; x++) for (let y = FLOOR; y < IY1; y++) for (let z = IZ0; z < IZ1; z++) g.clear(X(x), y, z);
  // walls inside: wainscot below, plain above, darker toward the back corners
  for (let x = IX0; x < IX1; x++) for (let y = FLOOR; y < IY1; y++) {
    const c = y < 18 ? mulc(inside, 0.72 + (x % 6 === 0 ? -0.08 : 0)) : mulc(inside, 0.95 * sp3(x >> 1, y >> 1, 0, seed + 5, 0.06));
    g.set(X(x), y, IZ0 - 1, c);
  }
  for (const xs of [IX0 - 1, IX1]) for (let z = IZ0; z < IZ1; z++) for (let y = FLOOR; y < IY1; y++) g.set(X(xs), y, z, y < 18 ? mulc(inside, 0.68) : mulc(inside, 0.86));
  // floor boards and ceiling beams
  for (let x = IX0; x < IX1; x++) for (let z = IZ0; z < IZ1; z++) {
    const pl = Math.floor(z / 5);
    g.set(X(x), FLOOR - 1, z, z % 5 === 0 ? 0x3a2618 : mulc(0x6a4a30, 0.9 + hash2(Math.floor((x + pl * 13) / 24), pl, seed) * 0.16));
    g.set(X(x), IY1, z, x % 12 < 3 ? mulc(trim, 0.9) : mulc(inside, 0.6));
  }
  // shelves along the back wall
  const shelfY = [17, 26, 35];
  for (const sy of shelfY) {
    g.box(X(IX0 + 1), sy, IZ0, IX1 - IX0 - 2, 1, 7, wood(C.woodL, { axis: 'x', across: 'z', pw: 99, seed: sy }));
    for (const bx of [IX0 + 4, IX1 - 6, Math.round((IX0 + IX1) / 2)]) g.box(X(bx), sy - 3, IZ0, 1, 3, 2, C.woodD);
  }
  // ---- door: planks, straps, a lit pane, a stone step
  const inDoor = (x, y) => x >= dx0 && x < dx0 + dw && y >= FLOOR && y < FLOOR + dh;
  for (let x = dx0 - 3; x < dx0 + dw + 3; x++) for (let y = FLOOR; y < FLOOR + dh + 3; y++) {
    if (inDoor(x, y)) {
      for (let z = FZ - 6; z < FZ + 2; z++) g.clear(X(x), y, z);
      const pl = Math.floor((x - dx0) / 5);
      const col = look.door.color;
      g.set(X(x), y, FZ - 4, (x - dx0) % 5 === 0 ? mulc(col, 0.66) : mulc(col, 0.88 + hash2(pl, 3, seed) * 0.16));
      g.set(X(x), y, FZ - 5, mulc(col, 0.7));
    } else if (inDoor(x - 1, y) || inDoor(x + 1, y) || inDoor(x, y - 1) || inDoor(x - 2, y) || inDoor(x + 2, y) || inDoor(x, y - 2) || inDoor(x - 1, y - 1) || inDoor(x + 1, y - 1)) {
      for (let z = FZ - 4; z < FZ + 2; z++) g.set(X(x), y, z, beam(trim, 'y', seed + 9)(x, y, z));
    }
  }
  for (const sy of [FLOOR + 6, FLOOR + dh - 10]) for (let x = dx0; x < dx0 + dw - 4; x++) { g.set(X(x), sy, FZ - 3, C.iron); g.set(X(x), sy + 1, FZ - 3, x % 4 === 0 ? C.ironL : C.iron); }
  g.box(X(doorLeft ? dx0 + dw - 5 : dx0 + 3), FLOOR + Math.floor(dh * 0.42), FZ - 3, 2, 2, 2, C.brass);
  for (let x = dx0 + dw / 2 - 3; x < dx0 + dw / 2 + 3; x++) for (let y = FLOOR + dh - 9; y < FLOOR + dh - 4; y++) {
    g.clear(X(x), y, FZ - 4); g.clear(X(x), y, FZ - 5);
    glow.set(X(x), y, FZ - 5, y > FLOOR + dh - 7 ? C.glowW : C.glowO);
    if (x === dx0 + dw / 2 || y === FLOOR + dh - 7) g.set(X(x), y, FZ - 4, mulc(look.door.color, 0.6));
  }
  g.box(X(dx0 - 2), FLOOR - 1, FZ, dw + 4, 1, 6, (x, y, z) => mulc(0x7a726a, 0.975 * sp3(x, y, z, 2)));
  // ---- the serving window: opening, frame, counter, shutter or awning
  for (let x = wx0; x < wx1; x++) for (let y = COUNTER; y < WIN_TOP; y++) for (let z = FZ - 5; z < FZ + 2; z++) g.clear(X(x), y, z);
  for (let x = wx0 - 2; x < wx1 + 2; x++) for (const y of [WIN_TOP, WIN_TOP + 1]) for (let z = FZ - 3; z < FZ + 2; z++) g.set(X(x), y, z, beam(trim, 'x', seed + 11)(x, y, z));
  for (const x of [wx0 - 2, wx0 - 1, wx1, wx1 + 1]) for (let y = COUNTER - 2; y < WIN_TOP; y++) for (let z = FZ - 3; z < FZ + 2; z++) g.set(X(x), y, z, beam(trim, 'y', seed + 12)(x, y, z));
  const top = wood(C.woodL, { axis: 'x', across: 'z', pw: 4, seed: seed + 13 });
  g.box(X(wx0 - 3), COUNTER - 2, FZ - 12, wx1 - wx0 + 6, 2, 18, (x, y, z) => (y === COUNTER - 1 ? (z === FZ + 5 ? mulc(C.woodL, 1.1) : top(x, y, z)) : mulc(C.woodD, 0.9)));
  for (const cx of [wx0 + 2, wx1 - 4, Math.round(wcx) - 1]) for (let k = 0; k < 5; k++) g.box(X(cx), COUNTER - 3 - k, FZ + 1, 2, 1, 4 - Math.floor(k * 0.7), C.woodD);
  // the wall under the counter: tongue-and-groove panelling
  for (let x = wx0; x < wx1; x++) for (let y = FLOOR; y < COUNTER - 2; y++) g.set(X(x), y, FZ, x % 4 === 0 ? mulc(trim, 0.85) : mulc(C.wood, 0.95 + hash2(x >> 2, 4, seed) * 0.1));
  if (look.awning) {
    const [a, b] = look.awning;
    const atop = WIN_TOP + 2;
    for (let k = 0; k < 10; k++) {
      const y = atop - Math.round(k * 0.5), z = FZ + 1 + k;
      for (let x = wx0 - 4; x < wx1 + 4; x++) g.set(X(x), y, z, mulc(Math.floor((x - wx0 + 40) / 6) % 2 ? a : b, 0.98 * sp3(x, k, 0, seed) - k * 0.012));
    }
    const yb = atop - 5;
    for (let x = wx0 - 4; x < wx1 + 4; x++) { const sc = ((x - wx0 + 40) % 6), s2 = Math.floor((x - wx0 + 40) / 6) % 2; if (sc > 0 && sc < 5) g.set(X(x), yb - 1, FZ + 10, s2 ? a : b); if (sc > 1 && sc < 4) g.set(X(x), yb - 2, FZ + 10, s2 ? a : b); }
    for (const x of [wx0 - 3, wx1 + 2]) line(g, [[X(x), atop - 6, FZ], [X(x), yb, FZ + 10]], 0.5, C.iron);
  }
  // plank shutters folded back against the wall either side of the window
  {
    const sc = look.shutter ?? mulc(look.door.color, 1.08);
    for (const [x0, x1] of [[wx0 - 8, wx0 - 2], [wx1 + 2, wx1 + 8]]) {
      for (let x = x0; x < x1; x++) for (let y = COUNTER; y < WIN_TOP; y++) {
        const c = (y - COUNTER) % 4 === 0 ? mulc(sc, 0.72) : x === x0 || x === x1 - 1 ? mulc(sc, 0.85) : mulc(sc, sp3(x, y, 1, seed));
        g.set(X(x), y, FZ + 1, c);
      }
      for (const y of [COUNTER + 4, WIN_TOP - 5]) g.set(X(x0 < wx0 ? x0 + 1 : x1 - 2), y, FZ + 2, C.iron);
    }
  }
  // a hanging lamp inside, over the keeper's head
  const lz = FZ - 15;
  line(g, [[X(wcx), IY1, lz], [X(wcx), IY1 - 4, lz]], 0.5, C.iron);
  g.box(X(wcx) - 3, IY1 - 6, lz - 3, 6, 2, 6, C.iron);
  glow.box(X(wcx) - 2, IY1 - 11, lz - 2, 4, 5, 4, (x, y) => (y > IY1 - 9 ? C.glowW : C.glowO));
  glow.box(X(wcx) - 1, IY1 - 12, lz - 1, 2, 1, 2, C.glowY);
  const shell = M16(g, [MG, 0, 0]);
  const shellGlow = G16(glow, [MG, 0, 0]);
  const grp = group(shell, shellGlow);
  // ---- goods on the shelves and wares on the counter (1/32)
  const goods = shelfGoods(fit.goods, W, shelfY, IX0, IX1, IZ0, seed);
  if (goods) grp.add(goods);
  const wares = counterWares(id, wx0, wx1, seed);
  if (wares) { wares.position.set(0, COUNTER / V, (FZ + 1) / V); grp.add(wares); }
  // ---- signs, lanterns, dressing
  const s = look.sign;
  const signs = [];
  const pcw = Math.max(48, Math.min(80, 26 + s.text.length * 4));
  const pc = signCanvas({ w: pcw, h: 20, scale: 2, text: s.text, icon: s.icon, board: s.board, trim: s.trim });
  const sy = (WIN_TOP + 2) / V + pc.h / 64 + 0.07;
  const anchor = new THREE.Object3D();
  anchor.position.set(wcx / V, sy, FRONT + 0.12);
  grp.add(anchor);
  signs.push({ pc, w: pc.w / 32, h: pc.h / 32, anchor });
  const bk = new VoxelGrid(pc.w + 6, pc.h + 6, 3);
  bk.box(0, 0, 0, bk.w, bk.h, 3, (x, y, z) => (z === 2 && (x === 0 || y === 0 || x === bk.w - 1 || y === bk.h - 1) ? mulc(s.board, 1.2) : mulc(s.board, 0.67 * sp3(x >> 2, y, z, 2))));
  const bkm = M32(bk, [bk.w / 2, bk.h / 2, 3]);
  bkm.position.set(wcx / V, sy, FRONT + 0.1);
  grp.add(bkm);
  const lights = [];
  for (const lx of [0.06, w - 0.06]) {
    const l = wallLantern(Math.round(lx * 10) + id.length);
    l.obj.position.set(lx, 1.55, FRONT + 0.12);
    grp.add(l.obj);
    lights.push({ x: lx, y: 1.55 + l.light.y, z: FRONT + 0.12 + l.light.z, kind: 'lantern' });
  }
  lights.push({ x: wcx / V, y: (IY1 - 9) / V, z: lz / V, kind: 'inside' });
  const props = dressing(id, grp, w, doorLeft, wx0, wx1);
  return {
    obj: grp, lights, signs, props,
    // the keeper stands on a step behind the counter, face framed in the window
    keeper: { x: wcx / V, y: FLOOR / V + 0.26, z: (FZ - 14) / V },
    counter: { x0: wx0 / V, x1: wx1 / V, y0: COUNTER / V, y1: WIN_TOP / V, z: FRONT },
    door: { u: (dx0 + dw / 2) / V },
    top: (H + 18) / V,
  };
}

// ---------------------------------------------------------------- goods on the shelves
function shelfGoods(kind, W, shelfY, IX0, IX1, IZ0, seed) {
  // 1/32 grid covering the back wall interior; x, y, z in 1/32 from the building's local origin
  const X0 = IX0 * 2, X1 = IX1 * 2, Z0 = IZ0 * 2;
  const g = new VoxelGrid(X1 - X0 + 2, 96, 16);
  const put = (x, y, z, c) => g.set(x - X0, y, z - Z0, c);
  const box = (x, y, z, w, h, d, c) => g.box(x - X0, y, z - Z0, w, h, d, c);
  const rng = (a, b) => hash2(a, b, seed);
  for (let si = 0; si < shelfY.length; si++) {
    const y = (shelfY[si] + 1) * 2; // top of the shelf board in 1/32
    let x = X0 + 4;
    let k = 0;
    while (x < X1 - 6) {
      const r = rng(si * 31 + k, 1);
      const z = Z0 + 3;
      if (kind === 'grocer') {
        if (r < 0.4) { // a jar of preserves
          const c = [0xc8402a, 0xe0a030, 0x6a9a3a, 0x8a3a6a][Math.floor(r * 10) % 4];
          box(x, y, z, 5, 7, 5, c); box(x, y + 7, z, 5, 1, 5, 0xd8c8a0); box(x + 1, y + 2, z + 5, 3, 3, 1, 0xf0e8d0);
          x += 7;
        } else if (r < 0.7) { // a basket of roots
          box(x, y, z, 9, 4, 7, (xx, yy) => ((xx + yy) % 2 ? 0xb08048 : 0x8a6a3a));
          for (let j = 0; j < 5; j++) g.ellipsoid(x - X0 + 2 + j * 1.5, y + 4.5, z - Z0 + 3, 1.6, 1.4, 1.6, [0xf0a050, 0xe8904a, 0xd0b080][j % 3]);
          x += 11;
        } else { // a sack of flour
          g.ellipsoid(x - X0 + 4, y + 4, z - Z0 + 3.5, 4, 4.5, 3.5, 0xe8dcc0);
          x += 9;
        }
      } else if (kind === 'tools') {
        if (r < 0.5) { // a pick lying on the shelf
          box(x, y, z + 2, 12, 1, 1, C.wood); box(x + 10, y, z, 2, 4, 5, C.ironL); box(x + 9, y + 3, z + 1, 4, 1, 3, 0xc6cbd2);
          x += 15;
        } else { // a box of chisels
          box(x, y, z, 8, 4, 7, C.woodD);
          for (let j = 0; j < 4; j++) box(x + 1 + j * 2, y + 4, z + 2 + (j % 2), 1, 3, 1, j % 2 ? 0xc6cbd2 : C.ironL);
          x += 10;
        }
      } else if (kind === 'assay') {
        if (r < 0.45) { // a ledger
          const c = [0x7a2a2a, 0x2a4a6a, 0x3a5a2a, 0x6a4a2a][Math.floor(r * 10) % 4];
          box(x, y, z, 3, 10, 7, c); box(x, y + 8, z, 3, 1, 7, C.gold); x += 4;
        } else if (r < 0.75) { // a jar of ore samples
          box(x, y, z, 5, 6, 5, 0x9ac0c8); box(x, y + 6, z, 5, 1, 5, C.brass);
          for (let j = 0; j < 3; j++) box(x + 1 + j, y + 1 + (j % 2), z + 1, 1, 1, 3, [0xd9773f, 0xf2c23a, 0xbfc3c4][j]);
          x += 7;
        } else { // gold bars
          for (let j = 0; j < 3; j++) box(x + j * 3, y, z, 3, 2, 5, j % 2 ? C.gold : 0xd8a830);
          box(x + 1, y + 2, z, 4, 2, 5, 0xffd34a); x += 11;
        }
      } else if (kind === 'furniture') {
        if (r < 0.4) { // a tiny chair
          box(x, y, z, 1, 6, 1, C.woodD); box(x + 5, y, z, 1, 6, 1, C.woodD); box(x, y, z + 5, 1, 6, 1, C.woodD); box(x + 5, y, z + 5, 1, 6, 1, C.woodD);
          box(x, y + 5, z, 6, 1, 6, C.woodL); box(x, y + 6, z, 6, 6, 1, C.wood); x += 9;
        } else if (r < 0.7) { // a rolled rug
          const c = [0xa84a3a, 0x3a6a9a, 0x6a8a3a][Math.floor(r * 10) % 3];
          box(x, y, z, 12, 4, 4, (xx) => ((xx >> 1) % 2 ? c : mulc(c, 0.75))); x += 14;
        } else { // a little lamp
          box(x + 2, y, z + 2, 1, 7, 1, C.brass); box(x, y + 7, z, 5, 3, 5, 0xf0d8a0); x += 7;
        }
      } else if (kind === 'blueprints') {
        // pigeonholes of rolled plans
        box(x, y, z, 10, 10, 1, 0x2a2a3a);
        for (let j = 0; j < 4; j++) { const c = j % 2 ? 0x6a9ad9 : 0xe8dcc0; ring(g, x - X0 + 2.5 + (j % 2) * 5, z - Z0 + 4, 0, 1.6, y + 1 + Math.floor(j / 2) * 5, y + 5 + Math.floor(j / 2) * 5, c); }
        x += 12;
      } else if (kind === 'outfitter') {
        if (r < 0.4) { // a brass helmet with its lamp
          g.ellipsoid(x - X0 + 4, y + 2, z - Z0 + 3, 4, 4, 3.5, (xx, yy) => (yy < y + 2 ? -1 : C.brass));
          box(x + 3, y + 3, z + 6, 2, 2, 1, 0xfff0c0); x += 10;
        } else if (r < 0.7) { // boots
          for (const o of [0, 4]) { box(x + o, y, z, 3, 5, 3, 0x5a3a22); box(x + o, y, z + 3, 3, 2, 3, 0x5a3a22); }
          x += 10;
        } else { // a folded backpack
          box(x, y, z, 8, 8, 5, 0x8a5a2a); box(x + 1, y + 6, z + 5, 6, 2, 1, 0x6a4a2a); x += 10;
        }
      }
      x += 1 + Math.floor(rng(k, si + 5) * 3);
      k++;
    }
  }
  if (kind === 'grocer') for (let k = 0; k < 6; k++) { // herbs drying from the ceiling beams
    const x = X0 + 8 + k * Math.floor((X1 - X0 - 16) / 6);
    line(g, [[x - X0, 94, 10], [x - X0, 86, 10]], 0.5, 0x8a6a3a);
    g.ellipsoid(x - X0, 84, 10, 2, 3, 2, k % 2 ? 0x6a9a3a : 0x8aa84a);
  }
  const grp = new THREE.Group();
  const m = M32(g, [-X0, 0, -Z0]);
  grp.add(m);
  return grp;
}

/** Small things on the counter (local x along the window, z from the front face; 1/32). */
function counterWares(id, wx0, wx1, seed) {
  const L = (wx1 - wx0) * 2, g = new VoxelGrid(L, 40, 14);
  const base = wx0 * 2;
  const bell = (x) => { for (let y = 0; y < 4; y++) for (let z = 3; z < 10; z++) for (let xx = x - 3; xx <= x + 3; xx++) if (Math.hypot(xx + 0.5 - x, (y) * 1.3, z + 0.5 - 6.5) < 3.4) g.set(xx, y, z, y === 0 ? 0xa87a20 : (xx + y) % 3 ? C.gold : 0xffe08a); g.set(x, 4, 6, 0xffe08a); };
  if (id === 'assay') {
    // the brass balance and a little pile of nuggets
    const cx = L - 16;
    g.box(cx - 6, 0, 3, 12, 2, 8, C.woodD);
    g.box(cx - 1, 2, 6, 2, 13, 2, C.brass);
    g.box(cx - 10, 14, 6, 20, 1, 2, C.gold);
    g.box(cx - 1, 15, 6, 2, 2, 2, C.gold);
    for (const s of [-1, 1]) {
      const px = cx + s * 9;
      line(g, [[px, 14, 7], [px - 2, 7, 7]], 0.4, C.brass); line(g, [[px, 14, 7], [px + 2, 7, 7]], 0.4, C.brass);
      g.ellipsoid(px, 6, 7, 3.6, 1.3, 3, (x, y) => (y > 6 ? -1 : C.gold));
    }
    g.box(cx + 7, 7, 5, 3, 2, 3, 0xffd34a);
    for (let k = 0; k < 6; k++) g.ellipsoid(8 + k * 2.5, 1, 7 + (k % 2) * 2, 1.4, 1.2, 1.4, [0xd9773f, 0xf2c23a, 0xbfc3c4, 0x9a6450][k % 4]);
    bell(26);
  } else if (id === 'tools') {
    // a whetstone and a new pick on display
    g.box(6, 0, 4, 10, 3, 6, 0x8a8478); g.box(6, 3, 5, 10, 1, 4, 0xa09a90);
    line(g, [[L / 2 - 10, 1, 7], [L / 2 + 8, 1, 7]], 1, C.wood);
    line(g, [[L / 2 + 6, 1, 3], [L / 2 + 9, 2, 7], [L / 2 + 6, 1, 11]], 1, 0xc6cbd2);
    bell(L - 8);
  } else if (id === 'grocer') {
    for (let k = 0; k < 3; k++) {
      const x = 8 + k * 14;
      ring(g, x, 7, 3, 5, 0, 4, (xx, y, z) => ((xx + y + z) % 2 ? 0xb08048 : 0x8a6a3a));
      for (let j = 0; j < 5; j++) g.ellipsoid(x - 2 + (j % 3) * 2, 4.5, 6 + Math.floor(j / 3) * 2, 1.8, 1.5, 1.8, [[0xf0a050, 0xe8904a], [0x6ac8ff, 0xd8f6ff], [0xc8402a, 0xe06a4a]][k][j % 2]);
    }
    bell(L - 8);
  } else if (id === 'furniture') {
    g.box(8, 0, 3, 10, 1, 8, 0xa84a3a); g.box(9, 1, 4, 8, 6, 6, C.woodL); g.box(9, 7, 4, 8, 1, 6, C.wood); // a tiny dresser
    g.box(24, 0, 5, 1, 9, 1, C.brass); g.box(21, 9, 2, 7, 4, 7, 0xf0d8a0); // a lamp
    bell(L - 8);
  } else if (id === 'blueprints') {
    g.box(6, 0, 1, 26, 1, 12, 0x3a6ac9); // a blueprint spread out
    for (let k = 0; k < 6; k++) g.box(8 + k * 4, 1, 3 + (k % 3) * 3, 3, 1, 1, 0xd8e8ff);
    g.box(10, 1, 9, 12, 1, 1, 0xd8e8ff);
    g.box(34, 0, 4, 2, 6, 2, 0x2a2a3a); g.box(34, 6, 4, 2, 2, 2, 0x1a1a24); // inkwell
    line(g, [[36, 7, 5], [41, 15, 7]], 0.5, 0xe8e0d0); // quill
    bell(L - 8);
  } else if (id === 'outfitter') {
    g.ellipsoid(14, 1, 7, 6, 6, 5, (x, y) => (y < 1 ? -1 : C.brass)); g.box(12, 3, 11, 4, 3, 1, 0xfff0c0); // a helmet
    g.box(26, 0, 4, 8, 3, 6, 0x6a4a2a); g.box(27, 3, 5, 6, 1, 4, 0x8a6a4a); // a folded pack
    bell(L - 8);
  }
  void seed;
  return M32(g, [-base, 0, 0]);
}

/** Things standing on the street in front of each shop (local TU; +z is the street). */
function dressing(id, grp, w, doorLeft, wx0, wx1) {
  const props = [];
  const add = (r, x, z, ry = 0) => { r.obj.position.set(x, 0, z); r.obj.rotation.y = ry; grp.add(r.obj); props.push({ x, z, r: r.r ?? 0.3, shadow: r.shadow }); return r.obj; };
  const F = FRONT;
  const winSide = doorLeft ? w - 0.15 : 0.15; // the edge beside the window (away from the door)
  const s = doorLeft ? 1 : -1;
  if (id === 'tools') { add(grindstone(), w + 0.55, F + 0.75, -0.6); add(pickBarrel(), w + 0.25, F + 0.05); add(crate(2), -0.15, F + 0.5, 0.2); }
  if (id === 'grocer') {
    add(veggieCrate(1, [0xf0a050, 0xe8904a, 0x6ab84a]), winSide - s * 0.1, F + 0.45);
    add(veggieCrate(3, [0x6ac8ff, 0xd8f6ff, 0x5ad0e0]), winSide + s * 0.62, F + 0.4, 0.15);
    add(chalkboard(), (wx0 + wx1) / 32 - s * 0.2, F + 1.1, -0.2 * s);
  }
  if (id === 'furniture') { add(chairTable(), winSide + s * 0.85, F + 0.7); add(pottedFern(3), -0.2, F + 0.35); }
  if (id === 'blueprints') { add(blueprintRolls(), winSide + s * 0.4, F + 0.35); add(easel(), winSide + s * 1.2, F + 0.6, 0.25 * s); }
  if (id === 'outfitter') { add(mannequin(), winSide + s * 0.5, F + 0.55, 0.3 * s); add(crate(6), w + 0.3, F + 0.4); }
  if (id === 'assay') { add(scales(), winSide + s * 1.0, F + 0.75, -0.3 * s); add(strongbox(), -0.05, F + 0.35); add(bucket(false), w + 0.05, F + 0.3); }
  return props;
}

export { barrel, sack };

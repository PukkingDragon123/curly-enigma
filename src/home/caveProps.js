// Old Star's smithy, prop by prop, at 1/64 m voxels (1/32 of a tile; the room group is scaled to
// meters): his forge (a fieldstone hearth with a glowing coal bed, an iron hood and a chimney pipe
// up through the roof), the big leather bellows, the anvil on its stump, the stone quench trough
// and his bucket, the tool rack, a cot, a campfire hearth (a ring of stones, a tripod and a pot, the
// kettle), a table and stools, shelves of jars, drying herbs and a coal heap.
// Conventions (as tavernProps.js): floor pieces are centred at their foot with the front toward
// +z; wall pieces have x along the wall, origin on the wall at floor level, +z out of the wall.
// Returns { obj, ...parts }; points in `lights` are local tile units.
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, iron, line, ring, sag, M32, G32, group, mulc, mixc, h3, sp3, S32, lowRes } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';
import { P, blocks } from './tavernProps.js';

const vm = (m) => Math.round(m * 64);
export { vm };
const T = (v) => v * S32; // voxels → tiles

// ---------------------------------------------------------------- fills
/** Rounded fieldstones in mortar: irregular stones from a jittered grid (s voxels). */
export function fieldstone(s = 9, seed = 3, base = 0x6e665e) {
  const pal = [base, mulc(base, 0.84), mixc(base, 0x8a7a64, 0.5), mulc(base, 1.1), mixc(base, 0x5a5048, 0.6), mixc(base, 0x7a6a5a, 0.35)];
  return (x, y, z) => {
    // the nearest two stone centres decide the stone and the mortar between
    const gx = Math.floor((x + z * 0.5) / s), gy = Math.floor(y / (s * 0.72));
    let d1 = 1e9, d2 = 1e9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = (gx + i + 0.5 + (hash2(gx + i, gy + j, seed) - 0.5) * 0.7) * s, cy = (gy + j + 0.5 + (hash2(gx + i, gy + j, seed + 1) - 0.5) * 0.6) * s * 0.72;
      const d = (x + z * 0.5 - cx) ** 2 + ((y - cy) * 1.3) ** 2;
      if (d < d1) { d2 = d1; d1 = d; id = (gx + i) * 31 + (gy + j); } else if (d < d2) d2 = d;
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    if (edge < 1.1) return 0x3e3630;
    let c = pal[Math.floor(hash2(id, 7, seed) * pal.length)];
    if (edge < 2.2) c = mulc(c, 0.86);
    return mulc(c, sp3(x, y, z, seed, 0.06, 0.1));
  };
}

/** Soot toward the top/inside: mix toward black by k(x, y, z) 0..1. */
const sooted = (fill, k) => (x, y, z) => { const c = fill(x, y, z); if (c < 0) return c; const t = Math.round(Math.max(0, Math.min(1, k(x, y, z))) * 5) / 5; return t > 0 ? mixc(c, 0x1c1614, t * 0.8) : c; };

/** Glow grid helpers: flame tongue at (x, y, z) up h. */
function tongue(gl, x, y, z, h, seed = 0) {
  for (let k = 0; k < h; k++) {
    const t = k / h;
    const c = t < 0.3 ? 0xff7a2a : t < 0.65 ? 0xffb43a : t < 0.9 ? 0xffe070 : 0xfff6c8;
    gl.set(x + Math.round(Math.sin(k * 0.9 + seed) * 0.6), y + k, z, c);
    if (t < 0.45) gl.set(x + 1, y + k, z, 0xff8a2a);
  }
}

// ---------------------------------------------------------------- the forge
/**
 * Old Star's forge: a fieldstone hearth (1.12 × 0.78 m, 0.53 m high) with a capstone rim, a clay-
 * lined firepot of coals (the glowing embers are their own mesh: `embers`, recolour it to breathe),
 * stone cheeks carrying a riveted iron hood that funnels into a chimney pipe going up into the
 * rock (pipe tiles tall), a tuyere on the bellows side, tongs and a poker hung on the cheek.
 * Front +z. Returns { obj, embers, fire (local tiles: the coal bed), pipeTop, tuyere }.
 */
export function forge(pipe = 3.2, seed = 5) {
  const W = 72, D = 50, H = 34;
  const PT = Math.round(pipe * 32); // pipe top (voxels above the floor)
  const g = new VoxelGrid(W + 8, PT + 4, D + 6);
  const gl = new VoxelGrid(W + 8, PT + 4, D + 6);
  const ox = 4, oz = 2;
  const fs = fieldstone(9, seed, 0x6a625a);
  // the body, slightly battered (wider at the foot)
  for (let y = 0; y < H; y++) {
    const inset = y < 4 ? 0 : y < H - 5 ? 1 : 0;
    g.box(ox + inset, y, oz + inset, W - inset * 2, 1, D - inset * 2, sooted(fs, (x, yy, z) => (z < oz + 6 ? 0 : (yy - H + 12) / 14) * 0.6));
  }
  // capstones round the top: big flat slabs, the front one worn smooth and pale
  const cap = (x0, z0, w, d, s) => g.box(x0, H - 4, z0, w, 4, d, (x, y, z) => {
    if ((x === x0 || x === x0 + w - 1 || z === z0 || z === z0 + d - 1) && y === H - 4) return 0x4a423c;
    let c = mixc(0x8a8076, 0x9a9084, hash2(s, 1, 2));
    if (y === H - 1) c = mulc(c, 1.08);
    return mulc(c, sp3(x, y, z, s, 0.08, 0.08));
  });
  cap(ox, oz + D - 12, W, 12, 1); cap(ox, oz, W, 12, 2); cap(ox, oz + 12, 14, D - 24, 3); cap(ox + W - 14, oz + 12, 14, D - 24, 4);
  for (let x = ox + 10; x < ox + W - 10; x++) for (let z = oz + D - 6; z < oz + D - 1; z++) if (hash2(x >> 1, z, 5) < 0.6) g.set(x, H - 1, z, 0xb0a698); // polished by elbows
  // the firepot: a clay-lined hollow with a bed of coals
  const fx0 = ox + 16, fx1 = ox + W - 16, fz0 = oz + 13, fz1 = oz + D - 13;
  for (let x = fx0; x < fx1; x++) for (let z = fz0; z < fz1; z++) for (let y = H - 9; y < H; y++) g.clear(x, y, z);
  for (let x = fx0 - 1; x <= fx1; x++) for (let z = fz0 - 1; z <= fz1; z++) {
    const rim = x === fx0 - 1 || x === fx1 || z === fz0 - 1 || z === fz1;
    if (rim) for (let y = H - 9; y < H; y++) g.set(x, y, z, mixc(0x8a4a2e, 0x2a1a14, (y - H + 9) / 12 + h3(x, y, z, 4) * 0.2)); // baked clay lining
  }
  const embers = new VoxelGrid(W + 8, PT + 4, D + 6);
  for (let x = fx0; x < fx1; x++) for (let z = fz0; z < fz1; z++) {
    const cx = (fx0 + fx1) / 2, cz = (fz0 + fz1) / 2;
    const r = Math.hypot((x - cx) / (fx1 - fx0) * 2, (z - cz) / (fz1 - fz0) * 2);
    const top = H - 4 + Math.round((1 - r) * 3 + hash2(x >> 1, z >> 1, seed) * 1.5);
    for (let y = H - 9; y < top; y++) {
      const lump = hash2(x >> 1, (y * 7 + z) >> 1, seed + 3);
      if (y === top - 1 && lump < 0.55 + (1 - r) * 0.3) embers.set(x, y, z, lump < 0.18 ? 0xfff0a0 : lump < 0.4 ? 0xffb43a : 0xff6a1a);
      else g.set(x, y, z, lump < 0.3 ? 0x2a2428 : lump < 0.7 ? 0x1c181c : 0x3a3036);
    }
  }
  // stone cheeks at the back corners carrying the hood
  const cheek = (x0) => g.box(x0, H, oz + 2, 9, 30, 12, sooted(fieldstone(7, seed + 9, 0x625a52), (x, y) => (y - H) / 34));
  cheek(ox + 4); cheek(ox + W - 13);
  // the hood: riveted iron sheet, sooty inside, a bell narrowing up into the pipe
  const hy0 = H + 30, hy1 = H + 62;
  const pcx = ox + W / 2, pcz = oz + 14;
  for (let y = hy0; y < hy1; y++) {
    const t = (y - hy0) / (hy1 - hy0);
    const hw = Math.round(lerp(W / 2 - 2, 9, t ** 0.8)), hd0 = Math.round(lerp(oz + 1, pcz - 8, t ** 0.8)), hd1 = Math.round(lerp(oz + 34, pcz + 8, t ** 0.8));
    for (let x = pcx - hw; x < pcx + hw; x++) for (let z = hd0; z < hd1; z++) {
      const edge = x === pcx - hw || x === pcx + hw - 1 || z === hd0 || z === hd1 - 1;
      if (!edge && y > hy0 + 1) continue;
      let c = h3(x, y, z, 7) < 0.06 ? C.rust : (y - hy0) % 9 === 0 ? 0x4a4a52 : 0x3a3a42;
      if ((y - hy0) % 9 === 0 && (x + z) % 5 === 0) c = 0x6a6a74; // rivet rows
      if (y < hy0 + 3) c = mixc(c, 0x1a1414, 0.5);
      if (z === hd1 - 1 && y < hy0 + 8) c = mixc(c, 0x8a4a2a, 0.3); // heat-blued lip
      g.set(x, y, z, c);
    }
  }
  // the chimney pipe up into the rock, banded, sooty
  // (its own coarser grid: it's mostly seen from a distance, going up into the dark)
  const pg = new VoxelGrid(W + 8, PT + 4, D + 6);
  for (let y = hy1 - 1; y < PT; y++) ring(pg, pcx, pcz, 5.5, 7.5, y, y + 1, (x, yy, z) => ((yy - hy1) % 24 < 3 ? 0x55555e : h3(x >> 1, yy >> 2, z >> 1, 9) < 0.05 ? C.rust : mixc(0x34343c, 0x1a1616, Math.min(0.6, Math.floor((yy - hy1) / 24) * 0.12))));
  // tuyere: an iron pipe in from the left side, low over the coals
  line(g, [[-2, H - 6, oz + D / 2], [ox + 3, H - 6, oz + D / 2]], 2.6, (x, y, z) => (x === ox + 2 ? 0x5a5a64 : 0x3e3e46));
  // tongs and a poker hung on the right cheek
  const hx = ox + W - 4;
  line(g, [[hx, H + 26, oz + 16], [hx + 2, H + 2, oz + 20]], 0.6, 0x2e2e36);
  line(g, [[hx + 1, H + 26, oz + 17], [hx + 3, H + 3, oz + 24]], 0.6, 0x3a3a42);
  g.box(hx - 1, H + 25, oz + 15, 3, 2, 3, 0x55555e);
  line(g, [[hx - 3, H + 28, oz + 14], [hx - 6, H, oz + 18]], 0.7, 0x2a2a30);
  g.box(hx - 7, H, oz + 17, 3, 3, 3, 0x2a2a30);
  // coal crumbs and ash on the floor round the foot
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(hash2(k, 1, seed) * (W + 8)), z = oz + D + Math.floor(hash2(k, 2, seed) * 5) - 1;
    g.set(x, 0, z, hash2(k, 3, seed) < 0.5 ? 0x1e1a1c : 0x5a5450);
  }
  // a few flames licking up off the coals (animated: their own meshes)
  const flames = [];
  for (let k = 0; k < 5; k++) {
    const fg = new VoxelGrid(W + 8, PT + 4, D + 6);
    const x = fx0 + 3 + Math.floor((k / 5) * (fx1 - fx0 - 6)), z = fz0 + 3 + Math.floor(hash2(k, 4, seed) * (fz1 - fz0 - 6));
    tongue(fg, x, H - 2, z, 5 + (k % 3) * 2, k);
    const m = G32(fg, [ox + W / 2, 0, oz + D / 2]);
    m.userData.flame = { ph: k * 1.7, h: 1 };
    flames.push(m);
  }
  const emb = G32(embers, [ox + W / 2, 0, oz + D / 2], { outline: false });
  emb.material = emb.material.clone();
  emb.userData.noBatch = true;
  const obj = group(M32(g, [ox + W / 2, 0, oz + D / 2]), lowRes(() => M32(pg, [ox + W / 2, 0, oz + D / 2])), emb, ...flames);
  for (const f of flames) f.userData.noBatch = true;
  return {
    obj, embers: emb, flames,
    fire: { x: 0, y: T(H - 2), z: T((fz0 + fz1) / 2 - oz - D / 2) },
    pipeTop: { x: 0, y: T(PT), z: T(pcz - oz - D / 2) },
    tuyere: { x: T(-2 - ox - W / 2), y: T(H - 6), z: 0 },
    size: { w: T(W), d: T(D), h: T(H) },
  };
}
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- the bellows
/**
 * Big leather bellows on a trestle, nozzle toward -x (into the forge's tuyere). The top board
 * hinges at the nozzle end: setCompress(k) 0 open … 1 squeezed. Returns { obj, setCompress, handle }.
 */
export function bellows(seed = 7) {
  const L = 56, Wd = 30;
  const obj = new THREE.Group();
  // the trestle: two A-legs and a cross board, the bellows ride on top, tilted down to the nozzle
  const tg = new VoxelGrid(L + 6, 30, Wd + 6);
  const leg = beam(0x5a3a22, 'y', seed);
  for (const x of [8, L - 8]) {
    line(tg, [[x - 5, 0, 3], [x, 24, 3]], 1.4, leg); line(tg, [[x + 5, 0, 3], [x, 24, 3]], 1.4, leg);
    line(tg, [[x - 5, 0, Wd + 2], [x, 24, Wd + 2]], 1.4, leg); line(tg, [[x + 5, 0, Wd + 2], [x, 24, Wd + 2]], 1.4, leg);
    tg.box(x - 2, 22, 2, 4, 3, Wd + 2, beam(0x6a4428, 'z', seed + 1));
  }
  tg.box(6, 8, Wd / 2 + 1, L - 12, 2, 4, beam(0x5a3a22, 'x', seed + 2)); // stretcher
  obj.add(M32(tg, [0, 0, Wd / 2 + 3]));
  // a teardrop board (pointing -x)
  const board = (y0, c) => {
    const g = new VoxelGrid(L + 4, 4, Wd + 2);
    for (let x = 0; x < L; x++) {
      const t = x / L;
      const hw = (Wd / 2) * Math.min(1, Math.sqrt(Math.max(0, t * 1.15)) * 1.02) - (t > 0.92 ? (t - 0.92) * 40 : 0);
      for (let z = 0; z < Wd + 2; z++) {
        if (Math.abs(z + 0.5 - (Wd + 2) / 2) > hw) continue;
        for (let y = 0; y < 3; y++) g.set(x + 2, y, z, wood(c, { axis: 'x', across: 'z', pw: 6, seed })(x, y, z));
      }
    }
    return g;
  };
  const bottom = board(0, 0x6e4a2c);
  // the nozzle: an iron cone out of the narrow end
  line(bottom, [[-4, 2, Wd / 2 + 1], [6, 2, Wd / 2 + 1]], (t) => 1.2 + t * 1.6, (x, y, z) => (x < -2 ? 0x55555e : 0x3a3a42));
  const bm = M32(bottom, [2, 0, Wd / 2 + 1]);
  const body = new THREE.Group();
  body.position.set(T(4), T(25), 0);
  body.rotation.z = 0.06;
  obj.add(body);
  body.add(bm);
  // the leather: pleated bands between the boards (scaled in y as it breathes)
  const lg = new VoxelGrid(L + 4, 16, Wd + 2);
  for (let x = 4; x < L - 2; x++) {
    const t = x / L;
    const hw = (Wd / 2) * Math.min(1, Math.sqrt(t * 1.15)) - 1;
    for (let z = 0; z < Wd + 2; z++) {
      const dz = Math.abs(z + 0.5 - (Wd + 2) / 2);
      if (dz > hw || dz < hw - 1.5) { if (!(x >= L - 4 && dz <= hw)) continue; }
      for (let y = 0; y < 16; y++) {
        const fold = y % 4 < 2;
        lg.set(x + 2, y, z, fold ? (h3(x, y, z, 3) < 0.1 ? 0x5a3418 : 0x7a4a26) : 0x4a2a14);
      }
    }
  }
  const leather = M32(lg, [2, 0, Wd / 2 + 1]);
  leather.position.y = T(3);
  const lpivot = new THREE.Group();
  lpivot.add(leather);
  body.add(lpivot);
  // the top board on its hinge, with the handle at the wide end
  const top = board(0, 0x7a5232);
  top.box(L - 2, 3, Wd / 2 - 4, 4, 3, 10, beam(0x5a3a22, 'z', seed + 5));
  line(top, [[L + 1, 6, Wd / 2 - 3], [L + 4, 11, Wd / 2 + 1], [L + 1, 6, Wd / 2 + 5]], 0.6, C.rope);
  for (let k = 0; k < 3; k++) top.set(10 + k * 12, 3, Wd / 2 + 1, 0x8a8a94); // iron studs
  const tm = M32(top, [2, 0, Wd / 2 + 1]);
  const hinge = new THREE.Group();
  hinge.add(tm);
  body.add(hinge);
  const compress = { open: T(18), shut: T(5), len: T(L) };
  const setCompress = bellowsCompress([hinge, lpivot], compress);
  setCompress(0);
  obj.userData.noBatchParts = [hinge, lpivot];
  return { obj, setCompress, handle: { x: T(L + 6), y: T(25 + 14), z: 0 }, parts: [hinge, lpivot], compress };
}

/** The bellows' squeeze for its parts [hinge, leather pivot]: setCompress(k) 0 open … 1 squeezed. */
export function bellowsCompress([hinge, lpivot], { open, shut, len }) {
  return (k) => {
    const h = open + (shut - open) * k;
    // the top board hinges at x = 0: lift it by angle so its wide end sits h above the bottom
    hinge.rotation.z = Math.atan2(h, len) * 1.0;
    lpivot.scale.y = Math.max(0.15, (h / open) * 1.05);
  };
}

// ---------------------------------------------------------------- anvil
/** A London-pattern anvil on an iron-strapped stump, a hammer on its face. Horn toward +x. */
export function anvil(seed = 9) {
  const g = new VoxelGrid(64, 52, 30);
  const cz = 15;
  // the stump
  const SH = 26;
  for (let y = 0; y < SH; y++) ring(g, 30, cz, 0, 12.5 - (y < 3 ? -1 : 0) + Math.sin(y * 0.7) * 0.3, y, y + 1, (x, yy, z, a) => {
    const r = Math.hypot(x + 0.5 - 30, z + 0.5 - cz);
    if (yy === SH - 1) return r > 11.5 ? 0x4a2e1a : Math.round(r) % 3 === 0 ? 0x8a6040 : 0xa87850; // rings on the cut top
    if (yy === 6 || yy === 7 || yy === SH - 6 || yy === SH - 5) return 0x2e2e36; // iron straps
    return mulc(Math.floor(a * 5 + yy * 0.15) % 2 ? 0x4e3420 : 0x5e3e26, sp3(x, yy, z, seed, 0.12, 0.12)); // bark
  });
  // the anvil (iron), face polished
  const Y = SH;
  const I = 0x34343c, IL = 0x4a4a54, FACE = 0x9a9aa6, FACEL = 0xc8c8d4;
  g.box(18, Y, cz - 9, 24, 3, 18, I); // feet
  g.box(21, Y + 3, cz - 5, 18, 7, 10, I); // waist
  g.box(14, Y + 10, cz - 7, 34, 2, 14, IL); // body
  g.box(12, Y + 12, cz - 7, 38, 8, 14, (x, y, z) => (y === Y + 19 ? (h3(x, y, z, 3) < 0.25 ? FACEL : FACE) : z === cz - 7 || z === cz + 6 ? IL : I));
  // the horn: a cone out to +x
  for (let x = 50; x < 62; x++) {
    const t = (x - 50) / 12;
    const r = 5.6 * (1 - t) + 0.6;
    for (let y = Y + 11; y < Y + 21; y++) for (let z = cz - 7; z < cz + 7; z++) {
      const dy = y + 0.5 - (Y + 15 + t * 3.5), dz = z + 0.5 - cz;
      if (dy * dy + dz * dz < r * r) g.set(x, y, z, dy > r - 1.5 ? FACE : I);
    }
  }
  // the heel with its hardy hole
  g.box(4, Y + 14, cz - 5, 8, 6, 10, (x, y) => (y === Y + 19 ? FACE : I));
  g.clear(8, Y + 19, cz); g.clear(9, Y + 19, cz); g.clear(8, Y + 19, cz - 1); g.clear(9, Y + 19, cz - 1);
  // a hammer resting on the face
  line(g, [[22, Y + 21, cz + 4], [42, Y + 21, cz - 1]], 1.0, wood(0x8a5a32, { axis: 'x', pw: 99, seed }));
  g.box(40, Y + 20, cz - 4, 5, 5, 7, 0x4a4a54); g.box(44, Y + 21, cz - 3, 1, 3, 5, 0x8a8a96);
  return { obj: M32(g, [30, 0, cz]), face: { x: 0, y: T(Y + 20), z: 0 }, r: 0.3 };
}

// ---------------------------------------------------------------- the quench trough and the bucket
/**
 * The quench trough: one rough block of stone hollowed out (1.0 × 0.36 × 0.38 m), its rim chipped,
 * rust and lime stains down the sides, moss at the foot, a ladle hung over the side. The water is
 * a separate surface (scene: animated): returned as `water` { w, d, y } (tiles, centred).
 */
export function trough(seed = 13) {
  const W = 64, D = 24, H = 25;
  const g = new VoxelGrid(W + 4, H + 14, D + 10);
  const ox = 2, oz = 2;
  const st = (x, y, z) => {
    let c = mixc(0x7a7268, 0x6a625a, hash2(x >> 2, y >> 2, seed));
    if (y < 4 && h3(x, y, z, 4) < 0.35) c = mixc(c, 0x3f6a2c, 0.6); // moss at the foot
    if ((x * 7 + seed) % 23 < 2 && y < H - 2) c = mixc(c, 0x8a4a2a, 0.35); // rust runs
    if ((x * 5 + seed) % 19 < 1 && y < H - 3) c = mixc(c, 0xd8d0c0, 0.35); // lime streaks
    return mulc(c, sp3(x, y, z, seed, 0.1, 0.1));
  };
  for (let y = 0; y < H; y++) {
    const ins = y < 3 ? 1 : 0;
    for (let x = ox + ins; x < ox + W - ins; x++) for (let z = oz + ins; z < oz + D - ins; z++) {
      // rounded corners
      const cx = Math.min(x - ox, ox + W - 1 - x), cz = Math.min(z - oz, oz + D - 1 - z);
      if (cx + cz < 2) continue;
      g.set(x, y, z, st(x, y, z));
    }
  }
  // hollow it out
  for (let y = 5; y < H; y++) for (let x = ox + 4; x < ox + W - 4; x++) for (let z = oz + 4; z < oz + D - 4; z++) g.clear(x, y, z);
  // chips out of the rim
  for (let k = 0; k < 6; k++) {
    const x = ox + 3 + Math.floor(hash2(k, 1, seed) * (W - 6)), z = hash2(k, 2, seed) < 0.5 ? oz + 1 : oz + D - 2;
    g.clear(x, H - 1, z); g.clear(x + 1, H - 1, z); if (k % 2) g.clear(x, H - 2, z);
  }
  // the inner walls darker and wet
  g.paint((x, y, z, c) => (y >= 5 && y < H && x > ox + 2 && x < ox + W - 3 && z > oz + 2 && z < oz + D - 3 ? mulc(c, 0.7) : undefined));
  // a ladle hung over the near side
  line(g, [[ox + W - 14, H + 6, oz + D + 2], [ox + W - 12, H, oz + D - 1], [ox + W - 11, H - 6, oz + D - 3]], 0.6, wood(0x9a6a3e, { pw: 99 }));
  ring(g, ox + W - 11, oz + D - 4, 0, 2.5, H - 9, H - 6, 0x8a5a32);
  const waterY = H - 3;
  return { obj: M32(g, [ox + W / 2, 0, oz + D / 2]), water: { w: T(W - 8), d: T(D - 8), y: T(waterY), x: 0, z: 0 }, r: 0.5 };
}

/** Old Star's wooden bucket with iron hoops and a rope handle. full: water in it (a separate mesh: `water`). */
export function quenchBucket(seed = 15) {
  const g = new VoxelGrid(20, 26, 20);
  ring(g, 10, 10, 6.2, 8.2, 0, 15, (x, y, z, a) => (y === 2 || y === 3 || y === 11 || y === 12 ? (h3(x, y, z, 2) < 0.1 ? C.rust : 0x3a3a42) : mulc(Math.floor((a + Math.PI) * 4) % 2 ? 0x8a5a32 : 0x7a4e2a, sp3(x, y, z, seed))));
  ring(g, 10, 10, 0, 6.6, 0, 1, 0x5a3a22);
  line(g, [[1.6, 13, 10], [3, 20, 10], [10, 24, 10], [17, 20, 10], [18.4, 13, 10]], 0.6, (x, y) => (y % 2 ? C.rope : C.ropeD));
  const wg = new VoxelGrid(20, 26, 20);
  ring(wg, 10, 10, 0, 6.4, 12, 13, (x, y, z) => (h3(x, y, z, 6) < 0.15 ? 0x9fd6ff : 0x3a6a9a));
  const water = M32(wg, [10, 0, 10], { outline: false });
  return { obj: group(M32(g, [10, 0, 10]), water), water, mouth: { x: 0, y: T(15), z: 0 } };
}

// ---------------------------------------------------------------- tools on the wall
/** A plank rack on two posts with hammers, tongs, files, a punch and a few blade blanks. Wall piece. */
export function toolRack(seed = 17) {
  const W = 66, H = 96;
  const g = new VoxelGrid(W, H, 10);
  const post = beam(0x4e3220, 'y', seed);
  g.box(2, 0, 1, 5, H, 5, post); g.box(W - 7, 0, 1, 5, H, 5, post);
  g.box(0, 44, 4, W, 34, 2, wood(0x6a4428, { axis: 'x', across: 'y', pw: 7, seed }));
  g.box(0, 78, 4, W, 3, 4, beam(0x4e3220, 'x', seed + 1));
  // pegs
  const pegs = [8, 17, 26, 35, 44, 53];
  for (const x of pegs) g.box(x, 72, 6, 2, 2, 3, 0x3a2414);
  // hammers hanging head-up from the pegs (sizes differ)
  [[8, 5], [17, 4], [26, 6]].forEach(([x, s], i) => {
    line(g, [[x + 1, 70, 8], [x + 1, 50 + i * 2, 8]], 0.7, wood(0x9a6a3e, { pw: 99, seed: i }));
    g.box(x - s / 2 + 1, 70, 6, s, 4, 4, i === 2 ? 0x55555e : 0x3e3e46);
  });
  // tongs (two long jaws)
  for (const [x, k] of [[35, 0], [44, 1]]) {
    line(g, [[x, 72, 8], [x - 2, 48, 8]], 0.6, 0x2e2e36); line(g, [[x + 2, 72, 8], [x + 4, 48, 8]], 0.6, 0x34343c);
    g.box(x - 1, 70, 7, 5, 2, 2, 0x55555e);
    if (k) g.box(x - 3, 46, 7, 9, 2, 2, 0x2e2e36);
  }
  // a file and a punch, a blade blank leaning at the bottom
  line(g, [[53, 72, 8], [53, 54, 8]], 0.7, (x, y) => (y > 66 ? 0x7a4e2a : y % 2 ? 0x6a6a74 : 0x55555e));
  line(g, [[58, 60, 8], [58, 50, 8]], 0.9, 0x3a3a42);
  for (let k = 0; k < 3; k++) line(g, [[12 + k * 10, 0, 8], [16 + k * 10, 40, 6]], 1.1, (x, y) => (y > 30 ? 0x6a6a74 : y > 6 ? 0x8a8a96 : 0x4a2e1a));
  // a little iron star nailed to the top rail for luck
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, 1], [0, -1], [-2, 1], [2, 1], [-1, -2], [1, -2]]) g.set(W / 2 + dx, 84 + dy, 6, 0x8a8a96);
  g.box(W / 2 - 1, 81, 5, 2, 2, 1, 0x3a2414);
  return { obj: M32(g, [W / 2, 0, 0]) };
}

// ---------------------------------------------------------------- Old Star's cot
/** A low wooden cot laced with rope: a striped straw mattress, a patchwork quilt, a lumpy pillow. Head toward -x. */
export function cot(seed = 19) {
  const L = 70, Wd = 34, H = 16;
  const g = new VoxelGrid(L + 4, 34, Wd + 4);
  const fr = beam(0x5a3a22, 'x', seed);
  for (const [x, z] of [[2, 2], [L - 2, 2], [2, Wd], [L - 2, Wd]]) g.box(x - 1, 0, z - 1, 3, H + (x < 10 ? 10 : 2), 3, beam(0x4e3220, 'y', seed));
  g.box(1, H - 3, 1, L + 1, 3, 2, fr); g.box(1, H - 3, Wd, L + 1, 3, 2, fr);
  g.box(1, H - 3, 1, 2, 3, Wd + 1, fr); g.box(L - 2, H - 3, 1, 2, 3, Wd + 1, fr);
  g.box(1, H + 7, 1, 3, 3, Wd + 1, beam(0x6a4428, 'z', seed)); // headboard rail
  for (let z = 4; z < Wd; z += 4) line(g, [[2, H - 2, z], [L - 2, H - 2, z]], 0.5, C.ropeD);
  // the mattress (ticking stripes) under the quilt
  g.box(3, H - 1, 3, L - 5, 4, Wd - 3, (x, y, z) => ((z >> 1) % 3 === 0 ? 0xc8b890 : 0xe0d4b0));
  // the quilt: squares of faded cloth, a darned patch, turned down at the head
  const pal = [0x8a3a2a, 0x5a6a48, 0xb8923e, 0x4a5a7a, 0x9a6a4a, 0x6a4a5a];
  for (let x = 14; x < L - 3; x++) for (let z = 2; z < Wd + 1; z++) {
    const lump = Math.round(Math.sin(x * 0.18) * Math.sin(z * 0.3) * 1.2 + (x > L - 20 ? 1 : 0));
    const sq = pal[Math.floor(hash2(Math.floor(x / 8), Math.floor(z / 8), seed) * pal.length)];
    const seam = x % 8 === 0 || z % 8 === 0;
    for (let y = H + 3; y < H + 5 + lump; y++) g.set(x, y, z, seam ? mulc(sq, 0.7) : mulc(sq, sp3(x, y, z, seed, 0.08, 0.1)));
    if (z === 2 || z === Wd) for (let y = H - 1; y < H + 3; y++) g.set(x, y, z, mulc(sq, 0.8)); // hanging over the sides
  }
  for (let z = 2; z < Wd + 1; z++) g.box(13, H + 3, z, 3, 3, 1, 0xe8dcc0); // the turned-down sheet
  // the pillow
  g.ellipsoid(8, H + 6, Wd / 2 + 2, 6.5, 3.2, 11, (x, y, z) => (h3(x, y, z, 3) < 0.15 ? 0xd8ccb0 : 0xeae0c8));
  // his nightcap on the pillow, red with a bobble
  line(g, [[9, H + 9, Wd / 2 - 4], [12, H + 10, Wd / 2 - 9], [15, H + 8, Wd / 2 - 12]], (t) => 2.4 * (1 - t) + 0.6, 0xa83a2a);
  g.ellipsoid(15.5, H + 8, Wd / 2 - 12.5, 1.6, 1.6, 1.6, 0xf0e8d8);
  return { obj: M32(g, [L / 2 + 2, 0, Wd / 2 + 2]), lie: { x: T(-L / 2 + 9), y: T(H + 6), z: 0 }, r: 0.55 };
}

/** A crate by the cot with a candle stub, his spare spectacles and a book. Returns { obj, candle } (local tiles). */
export function bedsideCrate(seed = 21) {
  const g = new VoxelGrid(24, 34, 24), gl = new VoxelGrid(24, 34, 24);
  const wf = wood(0x8a6040, { axis: 'x', across: 'y', pw: 5, seed });
  g.box(1, 0, 1, 22, 20, 22, (x, y, z) => (x === 1 || x === 22 || z === 1 || z === 22 ? (y % 5 === 0 ? 0x5a3a22 : wf(x, y, z)) : -1));
  g.box(2, 19, 2, 20, 1, 20, wood(0x7a5434, { axis: 'z', across: 'x', pw: 5, seed: seed + 1 }));
  // the book, the spectacles, the candle in a tin dish
  g.box(4, 20, 4, 9, 2, 12, (x, y) => (y === 21 ? 0x6a2a2a : x === 4 ? 0xe8dcc0 : 0x5a2222));
  g.box(14, 20, 5, 6, 1, 3, 0xc8a048); g.set(15, 21, 6, 0xa8c0c8); g.set(18, 21, 6, 0xa8c0c8);
  ring(g, 16, 15, 0, 3.5, 20, 21, 0x6a6a74);
  g.box(15, 21, 14, 2, 5, 2, P.wax); g.set(14, 22, 14, P.wax); g.set(15, 26, 14, 0x2a2018);
  gl.set(15, 27, 14, P.flameO); gl.set(15, 28, 14, P.flameY); gl.set(15, 29, 14, P.flameW);
  return { obj: group(M32(g, [12, 0, 12]), G32(gl, [12, 0, 12])), candle: { x: T(15 - 12 + 0.5), y: T(28), z: T(14 - 12 + 0.5) }, r: 0.2 };
}

// ---------------------------------------------------------------- the cooking hearth
/**
 * An open fire in a ring of stones: crossed logs, a bed of ash and embers, a three-legged iron
 * tripod with a chain and a black pot, a flat cooking stone with the copper kettle, and a grate on
 * the far side. The flames are their own meshes (`flames`, animated by the scene); `embers` glows.
 * Returns { obj, flames, embers, fire, pot, kettle (local tiles) }.
 */
export function cookHearth(seed = 23) {
  const R = 22, S = 64;
  const c = S / 2;
  const g = new VoxelGrid(S, 72, S), gl = new VoxelGrid(S, 72, S);
  // the ring of stones
  for (let k = 0; k < 13; k++) {
    const a = (k / 13) * Math.PI * 2 + hash2(k, 1, seed) * 0.2;
    const x = c + Math.cos(a) * R, z = c + Math.sin(a) * R;
    const s = 4.2 + hash2(k, 2, seed) * 2.2;
    const col = [0x6e665e, 0x7a7068, 0x5e564f, 0x8a8076][k % 4];
    g.ellipsoid(x, 2.5, z, s, 3.2 + hash2(k, 3, seed) * 1.6, s * 0.9, (xx, yy, zz) => mixc(mulc(col, sp3(xx, yy, zz, k, 0.15, 0.12)), 0x1c1614, yy > 4 ? 0.1 : (Math.hypot(xx - c, zz - c) < R ? 0.45 : 0)));
  }
  // ash and embers on the floor of the ring
  const embers = new VoxelGrid(S, 72, S);
  for (let x = c - R + 3; x < c + R - 3; x++) for (let z = c - R + 3; z < c + R - 3; z++) {
    const r = Math.hypot(x + 0.5 - c, z + 0.5 - c);
    if (r > R - 3) continue;
    const h = hash2(x >> 1, z >> 1, seed + 5);
    g.set(x, 0, z, h < 0.5 ? 0x5a5450 : 0x3e3a38);
    if (r < R * 0.55 && h > 0.45) embers.set(x, 1, z, h > 0.85 ? 0xffd070 : h > 0.65 ? 0xff8a2a : 0xc8381a);
  }
  // crossed logs, charred at the ends
  for (let k = 0; k < 4; k++) {
    const a = k * 0.8 + 0.3;
    const L2 = 15;
    line(g, [[c - Math.cos(a) * L2, 1.8 + (k % 2) * 3, c - Math.sin(a) * L2], [c + Math.cos(a) * L2, 1.8 + (k % 2) * 3, c + Math.sin(a) * L2]], 2.4, (x, y, z, t) => {
      const mid = Math.abs(t - 0.5) < 0.22;
      return mid ? (h3(x, y, z, 3) < 0.4 ? 0xc8381a : 0x1e1816) : (Math.floor(t * 9) % 2 ? 0x5a3a22 : 0x4a2e1a);
    });
  }
  // the tripod and the pot
  const top = 62;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    line(g, [[c + Math.cos(a) * (R + 4), 0, c + Math.sin(a) * (R + 4)], [c, top, c]], 0.8, 0x2e2e36);
  }
  g.box(c - 2, top - 1, c - 2, 4, 3, 4, 0x3e3e46);
  for (let y = 40; y < top - 1; y++) g.set(c, y, c, y % 3 ? 0x3a3a42 : 0x55555e); // the chain
  const potY = 22;
  for (let y = 0; y < 15; y++) {
    const r = 9.5 * Math.sin(((y + 2) / 18) * Math.PI) + 1.5;
    ring(g, c, c, y > 12 ? r - 1.5 : 0, r, potY + y, potY + y + 1, (x, yy, z) => (yy === potY + 13 ? 0x3a3a42 : h3(x, yy, z, 9) < 0.06 ? 0x55555e : 0x1e1e24));
  }
  ring(g, c, c, 0, 7.2, potY + 13, potY + 14, (x, y, z) => (h3(x, y, z, 4) < 0.3 ? 0xc8a060 : 0xa87840)); // stew
  line(g, [[c - 9, potY + 15, c], [c, potY + 19, c], [c + 9, potY + 15, c]], 0.5, 0x3a3a42); // bail handle
  // the cooking stone and the kettle (copper, a dented spout)
  const kx = c + R + 2, kz = c - 10;
  g.box(kx - 9, 0, kz - 9, 16, 5, 16, (x, y, z) => mulc(0x7a7068, sp3(x, y, z, 2, 0.15, 0.1)));
  for (let y = 0; y < 11; y++) {
    const r = 6.5 - Math.abs(y - 4) * 0.35;
    ring(g, kx - 1, kz - 1, 0, r, 5 + y, 6 + y, (x, yy, z) => (yy === 5 + 10 ? 0x8a4a2a : h3(x, yy, z, 5) < 0.12 ? 0xe8a070 : yy % 4 === 0 ? 0xa85a32 : 0xc8703e));
  }
  line(g, [[kx + 4, 9, kz - 1], [kx + 9, 13, kz - 1]], 1.0, 0xb86a3a);
  line(g, [[kx - 6, 15, kz - 1], [kx - 1, 19, kz - 1], [kx + 4, 15, kz - 1]], 0.6, 0x3a3a42);
  // a grate over two stones on the far side, a fish on it
  const gz = c - R - 6;
  g.box(c - 10, 0, gz - 4, 5, 6, 8, 0x6e665e); g.box(c + 5, 0, gz - 4, 5, 6, 8, 0x6e665e);
  for (let x = c - 10; x < c + 10; x += 2) g.box(x, 6, gz - 4, 1, 1, 8, 0x2e2e36);
  g.box(c - 10, 6, gz - 4, 20, 1, 1, 0x2e2e36); g.box(c - 10, 6, gz + 3, 20, 1, 1, 0x2e2e36);
  g.ellipsoid(c, 7.6, gz, 6, 1.4, 2.4, (x) => (x > c + 4 ? 0x8a8a96 : x < c - 4 ? 0x6a7a8a : 0xb8a888));
  // the flames (animated)
  const flames = [];
  for (let k = 0; k < 6; k++) {
    const fg = new VoxelGrid(S, 72, S);
    const a = (k / 6) * Math.PI * 2;
    const x = Math.round(c + Math.cos(a) * 5), z = Math.round(c + Math.sin(a) * 5);
    tongue(fg, x, 5, z, 8 + (k % 3) * 3, k);
    tongue(fg, x + 1, 4, z + 1, 5 + (k % 2) * 2, k + 3);
    const m = G32(fg, [c, 0, c]);
    m.userData.flame = { ph: k * 1.3, h: 1 };
    m.userData.noBatch = true;
    flames.push(m);
  }
  const emb = G32(embers, [c, 0, c], { outline: false });
  emb.material = emb.material.clone();
  emb.userData.noBatch = true;
  return {
    obj: group(M32(g, [c, 0, c]), emb, ...flames), flames, embers: emb,
    fire: { x: 0, y: T(10), z: 0 }, pot: { x: 0, y: T(potY + 14), z: 0 }, kettle: { x: T(kx - c + 6), y: T(17), z: T(kz - c - 1) }, r: 0.45,
  };
}

// ---------------------------------------------------------------- table, stools, shelves, herbs
/** A rough plank table with supper things: bowls, a loaf, a jug, mugs and a candle. Returns { obj, candle }. */
export function table(seed = 25) {
  const L = 60, Wd = 34, H = 28;
  const g = new VoxelGrid(L, H + 18, Wd), gl = new VoxelGrid(L, H + 18, Wd);
  const top = wood(0x8a6040, { axis: 'x', across: 'z', pw: 6, seed });
  g.box(0, H - 3, 0, L, 3, Wd, (x, y, z) => (y === H - 1 && h3(x >> 1, y, z >> 1, 4) < 0.08 ? 0x5a3a22 : top(x, y, z)));
  for (const [x, z] of [[3, 3], [L - 6, 3], [3, Wd - 6], [L - 6, Wd - 6]]) g.box(x, 0, z, 3, H - 3, 3, beam(0x5a3a22, 'y', seed));
  g.box(4, 6, Wd / 2 - 1, L - 8, 2, 2, beam(0x4e3220, 'x', seed));
  // bowls, a loaf, a jug, a mug, a candle in a bottle
  ring(g, 14, 12, 3, 5, H, H + 3, 0x9a6a3e); ring(g, 14, 12, 0, 3, H, H + 1, 0x7a4e2a); ring(g, 14, 12, 0, 4, H + 2, H + 3, 0xc8a060);
  ring(g, 44, 22, 3, 5, H, H + 3, 0xa87a4a);
  g.ellipsoid(27, H + 2, 22, 6, 3.2, 4, (x, y) => (y > H + 3 ? 0xc8883a : 0xa86a2a));
  for (let k = 0; k < 3; k++) g.set(23 + k * 4, H + 4, 22, 0xe0b070);
  for (let y = 0; y < 12; y++) ring(g, 38, 10, 0, 3.6 - Math.abs(y - 4) * 0.25 + (y > 9 ? -1 : 0), H + y, H + y + 1, y > 9 ? 0x8a5a3a : 0xb8704a);
  g.box(41, H + 6, 9, 2, 1, 2, 0xb8704a); g.box(42, H + 3, 9, 1, 4, 2, 0xb8704a);
  ring(g, 50, 10, 0, 1.8, H, H + 6, 0x3a6a3a); ring(g, 50, 10, 0, 1, H + 6, H + 9, 0x3a6a3a);
  g.box(50, H + 9, 10, 1, 4, 1, P.wax); g.set(49, H + 11, 10, P.wax);
  gl.set(50, H + 13, 10, P.flameO); gl.set(50, H + 14, 10, P.flameY); gl.set(50, H + 15, 10, P.flameW);
  return { obj: group(M32(g, [L / 2, 0, Wd / 2]), G32(gl, [L / 2, 0, Wd / 2])), candle: { x: T(50 - L / 2 + 0.5), y: T(H + 14), z: T(10 - Wd / 2 + 0.5) }, seat: 0.3 };
}

/** A three-legged stool. */
export function stool(seed = 27) {
  const g = new VoxelGrid(20, 20, 20);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + seed;
    line(g, [[10 + Math.cos(a) * 7, 0, 10 + Math.sin(a) * 7], [10 + Math.cos(a) * 4, 16, 10 + Math.sin(a) * 4]], 1.0, beam(0x5a3a22, 'y', seed + k));
  }
  ring(g, 10, 10, 0, 7.5, 16, 19, (x, y, z) => (y === 18 ? mulc(0x9a6a3e, sp3(x, y, z, seed, 0.15, 0.1)) : 0x7a5232));
  return { obj: M32(g, [10, 0, 10]), seat: { x: 0, y: T(19), z: 0 }, r: 0.13 };
}

/** A plank shelf on pegs driven into the rock, crowded with jars, bottles and a mortar. Wall piece. */
export function shelf(len = 0.9, seed = 29) {
  const L = vm(len);
  const g = new VoxelGrid(L, 60, 16);
  const pl = wood(0x7a5232, { axis: 'x', across: 'z', pw: 99, seed });
  for (const y of [8, 34]) {
    g.box(0, y, 0, L, 2, 14, pl);
    for (const x of [6, L - 8]) { g.box(x, y - 5, 0, 2, 5, 3, 0x3a2414); g.box(x, y - 3, 3, 2, 2, 8, 0x4a2e1a); }
  }
  const jar = (x, y, z, h, r, c, lid) => {
    ring(g, x, z, 0, r, y, y + h, (xx, yy, zz) => (h3(xx, yy, zz, 5) < 0.12 ? mulc(c, 1.3) : c));
    ring(g, x, z, 0, r - 0.6, y + h, y + h + 2, lid);
  };
  let x = 4;
  const cols = [[0x9a7a3a, 0xc8a050], [0x5a7a4a, 0x8a5a3a], [0xb85a3a, 0xd8d0c0], [0x6a5a8a, 0x8a5a3a], [0xc8b080, 0x7a4a2a], [0x4a6a7a, 0x3a3a42]];
  for (let k = 0; x < L - 6; k++) {
    const [c, lid] = cols[k % cols.length];
    const h = 7 + (k * 5) % 6, r = 2.4 + (k % 3) * 0.7;
    jar(x + r, 10, 7, h, r, c, lid);
    x += r * 2 + 1.5;
  }
  x = 4;
  for (let k = 0; x < L - 8; k++) {
    if (k % 3 === 1) { // a mortar and pestle
      ring(g, x + 4, 7, 2, 4.2, 36, 41, 0x8a8076); line(g, [[x + 4, 38, 7], [x + 6, 45, 6]], 0.9, 0xa89a88); x += 10; continue;
    }
    const c = [0x3a6a3a, 0x6a3a2a, 0x2a4a6a, 0x8a7a3a][k % 4];
    const h = 9 + (k % 3) * 2;
    ring(g, x + 2, 7, 0, 2.2, 36, 36 + h, c); ring(g, x + 2, 7, 0, 1, 36 + h, 36 + h + 3, mulc(c, 1.1)); g.set(x + 2, 36 + h + 3, 7, 0xa8804a);
    x += 6;
  }
  return { obj: M32(g, [L / 2, 0, 0]) };
}

/** Bunches of herbs and garlic hung from a sagging string between two pegs (len m). Hangs from its top. */
export function herbLine(len = 1.1, seed = 31) {
  const L = vm(len);
  const g = new VoxelGrid(L + 4, 30, 8);
  const pts = sag([2, 28, 4], [L + 1, 28, 4], 16, 4);
  line(g, pts, 0.5, C.rope);
  for (let k = 1; k < 8; k++) {
    const t = k / 8, p = pts[Math.round(t * 16)];
    const kind = k % 3;
    const bx = Math.round(p[0]), by = Math.round(p[1]);
    if (kind === 2) { // garlic
      for (let j = 0; j < 3; j++) g.ellipsoid(bx + (j - 1) * 2, by - 6 - j * 2, 4, 1.8, 2, 1.8, 0xece4d0);
      line(g, [[bx, by, 4], [bx, by - 5, 4]], 0.5, 0x9a8a5a);
    } else {
      const col = kind ? [0x5a7a3a, 0x7a9a4a, 0x4a6a2a] : [0x8a6a8a, 0x6a8a4a, 0xa88aa8];
      for (let j = 0; j < 9; j++) {
        const dx = (hash2(k, j, seed) - 0.5) * 6, len2 = 8 + hash2(j, k, seed) * 8;
        line(g, [[bx, by - 1, 4], [bx + dx, by - len2, 4 + (j % 3) - 1]], 0.5, col[j % 3]);
      }
      g.box(bx - 1, by - 3, 3, 2, 2, 2, C.ropeD);
    }
  }
  return M32(g, [2, 29, 4]);
}

/** A heap of coal with a shovel stuck in it. */
export function coalHeap(seed = 33) {
  const g = new VoxelGrid(44, 30, 36);
  for (let x = 0; x < 44; x++) for (let z = 0; z < 36; z++) {
    const r = Math.hypot((x - 22) / 21, (z - 18) / 17);
    if (r > 1) continue;
    const h = Math.round((1 - r * r) * 13 + hash2(x >> 1, z >> 1, seed) * 2);
    for (let y = 0; y < h; y++) g.set(x, y, z, h3(x >> 1, y >> 1, z >> 1, 4) < 0.2 ? 0x4a4a54 : h3(x, y, z, 5) < 0.5 ? 0x1e1c22 : 0x2a282e);
  }
  line(g, [[26, 8, 18], [34, 26, 14]], 1.0, wood(0x8a5a32, { pw: 99 }));
  g.box(22, 4, 16, 6, 7, 6, 0x3a3a42);
  return { obj: M32(g, [22, 0, 18]), r: 0.3 };
}

/** A firewood stack: split logs, ends pale. */
export function logStack(seed = 35) {
  const g = new VoxelGrid(46, 30, 22);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) {
    const cx = 7 + k * 10.5 + r * 5, cy = 4.5 + r * 8.5;
    for (let x = 0; x < 46; x++) for (let y = Math.floor(cy - 5); y <= Math.ceil(cy + 5); y++) for (let z = 1; z < 21; z++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > 4.8 + hash2(k, r, seed) * 0.6) continue;
      g.set(x, y, z, z === 20 || z === 1 ? (Math.round(d) % 2 ? 0xc8a070 : 0xa87a48) : d > 3.8 ? 0x4a2e1a : mulc(0x7a5232, sp3(x, y, z, seed)));
    }
  }
  return { obj: M32(g, [23, 0, 11]), r: 0.35 };
}

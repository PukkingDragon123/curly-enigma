// Deep Town's lift for first person: a timber headframe over a plank-lined pit, a sheave wheel on
// top, the cable running up into a shaft in the cavern roof and down to a brass cage with a
// sliding lattice gate and a lamp, and Bramble's crank wheel with its bell. Riding: the gate
// slides open, the mole steps in, the gate rattles shut and the cage drops into the dark before
// the scene changes (lifts.js rideTo); arriving, the cage rises out of the pit and the mole steps
// out. Town units; the scene supplies tween/sleep helpers and the rig.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VoxelGrid, C, wood, beam, iron, stone, line, ring, M32, G32, M16, group, mulc, sp3, h3 } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';
import { signCanvas } from '../iso/pixel.js';
import { TOWN } from '../iso/townLayout.js';
import { ceilingInfo } from './cave.js';
import { M } from './units.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

const CAGE = 1.86; // cage width (TU)
const CAGE_H = 2.2;
const TOWER_H = 7.4;
export const PIT_DEPTH = 9;

/** The static parts: headframe, pit lining, curb, sheave, the cable up into the roof, the sign. */
export function liftTower() {
  const L = TOWN.lift, c = L.cage;
  const grp = new THREE.Group();
  // headframe at 1/16: four posts, cross beams, X-braces on the sides and back, a little roof
  const R = 16;
  const W = 72, Hh = Math.round((TOWER_H + 0.8) * R), D = 72;
  const g = new VoxelGrid(W, Hh, D);
  const post = (seed) => beam(0x6a4a2e, 'y', seed);
  const P0 = 6, P1 = W - 10; // post positions (4 voxels thick)
  for (const [x, z] of [[P0, P0], [P1, P0], [P0, P1], [P1, P1]]) g.box(x, 0, z, 4, Math.round(TOWER_H * R), 4, post(x + z));
  for (const y of [Math.round(2.6 * R), Math.round(5.2 * R), Math.round(TOWER_H * R) - 4]) {
    g.box(P0 - 1, y, P0, P1 - P0 + 6, 4, 4, beam(0x5e4028, 'x', y)); g.box(P0 - 1, y, P1, P1 - P0 + 6, 4, 4, beam(0x5e4028, 'x', y + 1));
    g.box(P0, y, P0 - 1, 4, 4, P1 - P0 + 6, beam(0x5e4028, 'z', y + 2)); g.box(P1, y, P0 - 1, 4, 4, P1 - P0 + 6, beam(0x5e4028, 'z', y + 3));
    for (const [x, z] of [[P0, P0], [P1, P0], [P0, P1], [P1, P1]]) g.box(x - 1, y + 1, z - 1, 6, 2, 6, C.iron);
  }
  // X-braces on the two sides and the back (the front stays open for the gate)
  const brace = (a, b) => line(g, [a, b], 1.2, (x, y, z) => mulc(0x5a3e26, 0.95 + h3(x >> 2, y >> 2, z >> 2, 4) * 0.1));
  for (const [y0, y1] of [[4, Math.round(2.6 * R)], [Math.round(2.6 * R) + 4, Math.round(5.2 * R)]]) {
    brace([P0 + 2, y0, P0 + 2], [P0 + 2, y1, P1 + 2]); brace([P0 + 2, y0, P1 + 2], [P0 + 2, y1, P0 + 2]);
    brace([P1 + 2, y0, P0 + 2], [P1 + 2, y1, P1 + 2]); brace([P1 + 2, y0, P1 + 2], [P1 + 2, y1, P0 + 2]);
    brace([P0 + 2, y0, P0 + 2], [P1 + 2, y1, P0 + 2]); brace([P1 + 2, y0, P0 + 2], [P0 + 2, y1, P0 + 2]);
  }
  // guide rails for the cage on the inside of the posts
  for (const x of [P0 + 4, P1 - 1]) g.box(x, 0, Math.round(W / 2) - 1, 1, Math.round(TOWER_H * R) - 4, 2, C.ironL);
  // the roof: two slopes of planks over the wheel
  const top = Math.round(TOWER_H * R);
  for (let k = 0; k < 10; k++) {
    g.box(P0 - 4 + k, top + k, P0 - 6, W - 2 * (P0 - 4 + k) + 2, 1, P1 - P0 + 16, (x, y, z) => ((x >> 2) % 2 ? 0x5a3a2a : 0x6a4a34));
  }
  const tm = M16(g, [W / 2, 0, D / 2]);
  tm.position.set(c.x, 0, c.z);
  grp.add(tm);
  // the sheave wheel under the roof (1/32), spokes and a brass hub
  const wh = new VoxelGrid(44, 44, 6);
  for (let y = 0; y < 44; y++) for (let x = 0; x < 44; x++) {
    const d = Math.hypot(x + 0.5 - 22, y + 0.5 - 22);
    const a = Math.atan2(y + 0.5 - 22, x + 0.5 - 22);
    const spoke = Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.42;
    if (d < 21 && (d > 17.5 || spoke || d < 4)) for (let z = 0; z < 6; z++) wh.set(x, y, z, d > 19.5 ? (z === 0 || z === 5 ? C.iron : 0x2e2e36) : d < 4 ? C.brass : C.ironL);
  }
  const wm = M32(wh, [22, 22, 3]);
  wm.position.set(c.x, TOWER_H - 0.9, c.z);
  wm.rotation.y = Math.PI / 2;
  grp.add(wm);
  // the cable: from the wheel up into the roof shaft (the cage end is part of the cage)
  const info = ceilingInfo();
  const up = info.shaft ? TOWN.ceiling.base - 1 : TOWER_H + 12;
  const cab = new VoxelGrid(2, Math.round((up - TOWER_H + 0.2) * 16), 2);
  cab.box(0, 0, 0, 2, cab.h, 2, (x, y) => (y % 5 === 0 ? 0x5a5a64 : 0x3a3a44));
  const cm = M16(cab, [1, 0, 1]);
  cm.position.set(c.x - 0.4, TOWER_H - 0.4, c.z);
  grp.add(cm);
  // the pit: a timbered shaft into the rock, fading into the dark; a stone curb round the mouth
  const shaft = pitShaft();
  shaft.position.set(c.x, 0, c.z);
  grp.add(shaft);
  const curb = new VoxelGrid(80, 4, 80);
  const st = stone(0x8a8078, { seed: 9 });
  for (let x = 0; x < 80; x++) for (let z = 0; z < 80; z++) {
    const inX = x >= 8 && x < 72, inZ = z >= 8 && z < 72;
    if (inX && inZ) continue;
    if (x < 4 || z < 4 || x >= 76 || z >= 76) continue;
    for (let y = 0; y < 3; y++) curb.set(x, y, z, y === 2 ? mulc(0x9a9086, sp3(x, y, z, 3)) : st(x, y, z));
  }
  const cbm = M32(curb, [40, 0, 40]);
  cbm.position.set(c.x, 0, c.z);
  grp.add(cbm);
  // a lantern on the front-left post, the LIFT sign on the beam
  const lan = new VoxelGrid(12, 20, 12), lg = new VoxelGrid(12, 20, 12);
  lan.box(2, 0, 2, 8, 2, 8, C.iron); lan.box(2, 14, 2, 8, 2, 8, C.iron); lan.box(4, 16, 4, 4, 2, 4, C.iron);
  for (const [x, z] of [[2, 2], [9, 2], [2, 9], [9, 9]]) lan.box(x, 2, z, 1, 12, 1, C.iron);
  lg.box(3, 2, 3, 6, 12, 6, (x, y) => (y > 8 ? C.glowW : C.glowO)); lg.box(5, 5, 5, 2, 5, 2, C.glowY);
  const lanG = group(M32(lan, [6, 0, 6]), G32(lg, [6, 0, 6]));
  const lx = c.x - (W / 2 - P0 - 2) / 16 - 0.25, lz = c.z + (P1 - D / 2 + 2) / 16 + 0.25;
  lanG.position.set(lx, 2.2, lz);
  grp.add(lanG);
  const sign = signCanvas({ w: 40, h: 16, scale: 2, text: 'LIFT', icon: 'pick_copper', board: 0x4a3020, trim: 0xd9a84a });
  return { obj: grp, wheel: wm, sign: { pc: sign, x: c.x, y: 2.6 * 1 + 0.55, z: c.z + (P1 - D / 2 + 4) / 16 + 0.06 }, light: { x: lx, y: 2.45, z: lz } };
}

/**
 * The shaft under the cage (local origin = centre of the mouth, going down PIT_DEPTH): square
 * timber sets every metre or so with corner posts, rough rock bulging between them, lagging boards
 * on the back wall, the cage's iron guide rails, a ladder and two cables, all fading into the
 * dark. Fine (1/16) near the top where the light reaches, coarse (1/8) further down.
 */
function pitShaft() {
  const grp = new THREE.Group();
  const IN = 2.0; // the opening (TU), same as the hole in the floor
  const part = (res, y0, y1) => {
    const n = Math.round(IN * res), wall = Math.round(0.25 * res), Wd = n + wall * 2;
    const H = Math.round((y1 - y0) * res);
    const g = new VoxelGrid(Wd, H, Wd);
    const k = 16 / res;
    const setEvery = Math.round(1.25 * res), setH = Math.max(1, Math.round(3 / k));
    const lag = wood(0x4a3424, { axis: 'y', across: 'x', pw: Math.max(2, Math.round(5 / k)), seed: 5 });
    for (let yy = 0; yy < H; yy++) {
      const depthTU = y0 + (H - 1 - yy + 0.5) / res; // TU below the mouth
      const f = Math.max(0.025, 1 - Math.pow(depthTU / (PIT_DEPTH * 0.42), 0.75));
      const yAbs = Math.round(depthTU * res);
      const isSet = yAbs % setEvery < setH && depthTU > 0.12;
      for (let side = 0; side < 4; side++) for (let u = 0; u < Wd; u++) {
        for (let t = 0; t < wall; t++) {
          // t = 0 at the shaft's inner face, growing into the rock
          const [x, z] = side === 0 ? [wall - 1 - t, u] : side === 1 ? [Wd - wall + t, u] : side === 2 ? [u, wall - 1 - t] : [u, Wd - wall + t];
          const inner = u >= wall && u < Wd - wall;
          const corner = !inner && (u < wall - 1 || u >= Wd - wall + 1);
          const post = u >= wall - Math.round(2 / k) && u < wall + Math.round(2 / k) || u >= Wd - wall - Math.round(2 / k) && u < Wd - wall + Math.round(2 / k);
          const rd = 1 + Math.floor(h3(Math.floor(u * k / 3), Math.floor(yAbs * k / 3), side, 31) * 3 / k) ; // rock surface depth
          let col = 0;
          if (corner) col = t >= 0 ? mulc(0x4a4038, 0.85 + h3(u, yAbs, side, 3) * 0.2) : 0;
          else if (isSet && t < Math.round(2 / k) + 1) col = mulc(yAbs % setEvery === 0 ? 0x5e4228 : 0x6a4a2e, 0.9 + h3(u >> 2, yAbs, side, 7) * 0.15);
          else if (post && t < Math.round(2 / k) + 1) col = mulc(0x5a3e26, 0.9 + h3(side, yAbs >> 2, u, 9) * 0.12);
          else if (side === 2 && t === Math.round(1 / k) && inner && h3(Math.floor(u * k / 5), Math.floor(yAbs / setEvery), 1, 11) > 0.25) col = lag(u, yAbs, 0);
          else if (t >= Math.min(rd, wall - 1)) {
            const strat = Math.floor((yAbs * k + Math.sin(u * k * 0.2 + side) * 3) / 9) % 3;
            col = mulc([0x5a4e46, 0x4e443e, 0x645448][strat], 0.85 + Math.floor(h3(Math.floor(u * k / 2), Math.floor(yAbs * k / 2), side, 13) * 3) * 0.08);
            if (h3(u, yAbs, side, 17) < 0.02 * k) col = 0x6a6a5a; // a wet glint
          }
          if (col) g.set(x, yy, z, mulc(col, f));
        }
      }
      // the cage's guide rails (iron) on both side walls, a ladder in the back-right corner, two cables
      const fr = (c2) => mulc(c2, f);
      const mid = Math.floor(Wd / 2);
      if (res >= 8) {
        g.set(wall, yy, mid, fr(0x6a6a74)); g.set(Wd - wall - 1, yy, mid, fr(0x6a6a74));
        if (res === 16) { g.set(wall, yy, mid - 1, fr(0x4a4a54)); g.set(Wd - wall - 1, yy, mid - 1, fr(0x4a4a54)); }
        const lx = Wd - wall - Math.round(6 / k);
        g.set(lx, yy, wall, fr(0x5a3e26)); g.set(lx + Math.max(1, Math.round(3 / k)), yy, wall, fr(0x5a3e26));
        if (yAbs % Math.max(1, Math.round(4 / k)) === 0) for (let x = lx; x <= lx + Math.max(1, Math.round(3 / k)); x++) g.set(x, yy, wall, fr(0x6a4a2e));
        g.set(wall + Math.round(4 / k), yy, wall, fr(0x2e2e36));
        if (res === 16) g.set(wall + 9, yy, wall, fr(0x3a3a44));
      }
    }
    const m = M16(g, [Wd / 2, H, Wd / 2]);
    if (res !== 16) m.scale.setScalar(16 / res);
    m.position.y = -y0;
    return m;
  };
  grp.add(part(16, 0, 1.25), part(8, 1.25, 4), part(4, 4, PIT_DEPTH));
  return grp;
}

/** A mine cart on the rails by the lift, loaded with coal and a few dull lumps of ore. */
export function coalCart(seed = 2) {
  const g = new VoxelGrid(30, 34, 40);
  const ir = iron(0x4a4a54, seed);
  for (let y = 6; y < 24; y++) {
    const f = Math.floor((y - 6) / 6);
    g.box(3 - f, y, 3 - f, 24 + f * 2, 1, 34 + f * 2, (x, yy, z) => {
      const edge = x === 3 - f || x === 26 + f || z === 3 - f || z === 36 + f;
      if (!edge) return -1;
      if (yy === 6 || yy === 23 || yy % 6 === 0) return C.ironL;
      if ((z % 8 === 3 || x % 8 === 3) && yy % 3 === 1) return 0x6a6a74;
      return ir(x, yy, z);
    });
  }
  g.box(3, 6, 3, 24, 1, 34, ir);
  for (let x = 4; x < 26; x++) for (let z = 4; z < 36; z++) {
    const h = 22 + Math.round(2.6 * Math.sin(x * 0.28) * Math.sin(z * 0.2) + hash2(x >> 1, z >> 1, 3) * 2);
    for (let y = 18; y < h; y++) {
      const lump = h3(x >> 1, y >> 1, z >> 1, 9);
      g.set(x, y, z, lump < 0.07 ? 0x8a5a3e : lump < 0.1 ? 0x7a7068 : mulc(0x2a2628, 0.85 + Math.floor(h3(x >> 1, y, z >> 1, 4) * 3) * 0.12));
    }
  }
  for (const z of [9, 30]) {
    g.box(1, 4, z, 28, 2, 2, C.ironD);
    for (const x of [0, 28]) {
      for (let y = 0; y < 10; y++) for (let zz = z - 5; zz < z + 7; zz++) {
        const d = Math.hypot(y + 0.5 - 5, zz + 0.5 - (z + 1));
        if (d < 5.2) g.set(x, y, zz, d > 4 ? C.ironD : d < 1.5 ? C.ironL : 0x2e2e36);
      }
    }
  }
  return { obj: M32(g, [15, 0, 20]), shadow: { rx: 0.55, rz: 0.75, k: 0.55 } };
}

/** A W×H pixel texture (1/32 TU texels, row 0 at the bottom); the colour function's 0 is see-through. */
function pixelTexture(W, H, pix) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = pix(x, y);
    if (!c) continue;
    const i = ((H - 1 - y) * W + x) * 4;
    img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Flat pixel panels (a lattice): double-sided, alpha-tested, lit like the voxels and outlined. */
function pixelMesh(geo, tex) {
  const mat = new THREE.MeshToonMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, gradientMap: voxelMaterial('toon').gradientMap });
  const m = new THREE.Mesh(geo, mat);
  m.layers.enable(LAYER_OUTLINE);
  m.userData.noBatch = true;
  return m;
}

/** The brass cage (local origin = floor centre). Returns { obj, gate, lamp, cableTop }. */
export function liftCage() {
  const S = Math.round(CAGE * 32), Hh = Math.round(CAGE_H * 32);
  const g = new VoxelGrid(S, Hh + 8, S);
  const glow = new VoxelGrid(S, Hh + 8, S);
  // floor: riveted iron plates over oak
  g.box(0, 0, 0, S, 3, S, (x, y, z) => (y < 2 ? C.woodD : ((x >> 3) + (z >> 3)) % 2 ? 0x5a5a64 : 0x4e4e58));
  for (let x = 2; x < S; x += 8) for (let z = 2; z < S; z += 8) g.set(x, 3, z, C.ironL);
  // corner posts, top frame, a roof with a hook
  for (const [x, z] of [[0, 0], [S - 3, 0], [0, S - 3], [S - 3, S - 3]]) g.box(x, 0, z, 3, Hh, 3, (xx, y) => (y % 12 === 0 ? 0xffe08a : C.brass));
  g.box(0, Hh - 3, 0, S, 3, S, (x, y) => (y === Hh - 1 ? 0x8a6a3a : C.brass));
  g.box(2, Hh, 2, S - 4, 2, S - 4, 0x6a5a3a);
  ring(g, S / 2, S / 2, 0, 4, Hh + 2, Hh + 5, C.iron);
  g.box(S / 2 - 1, Hh + 5, S / 2 - 1, 2, 3, 2, C.ironL);
  // lattice on the back and both sides (alpha-tested pixel panels: a voxel lattice is thousands
  // of tiny faces), brass bars and a hand rail
  const lattice = (u, y) => ((u + y) % 8 === 0 || (u - y + 800) % 8 === 0) && y > 4;
  for (let u = 0; u < S; u++) for (const y of [3, 22, Hh - 4]) { g.set(u, y, 0, C.brass); g.set(0, y, u, C.brass); g.set(S - 1, y, u, C.brass); }
  for (let u = 4; u < S - 4; u++) { g.set(u, 24, 2, 0x8a5a32); g.set(2, 24, u, 0x8a5a32); g.set(S - 3, 24, u, 0x8a5a32); }
  const panelPix = (u, y) => (u >= 3 && u < S - 3 && y >= 3 && y < Hh - 3 && lattice(u, y) ? mulc(0xb08a40, 0.92 + h3(u >> 2, y >> 2, 0, 5) * 0.16) : 0);
  // a lamp under the roof
  glow.box(S / 2 - 3, Hh - 9, S / 2 - 3, 6, 6, 6, (x, y) => (y > Hh - 6 ? C.glowW : C.glowO));
  g.box(S / 2 - 4, Hh - 3, S / 2 - 4, 8, 1, 8, C.iron);
  // the cage, its cable (from the hook up to the wheel) and the lattice panels: one mesh each
  const cab = new VoxelGrid(2, Math.round((TOWER_H - CAGE_H - 0.9) * 32), 2);
  cab.box(0, 0, 0, 2, cab.h, 2, (x, y) => (y % 7 === 0 ? 0x5a5a64 : 0x3a3a44));
  const shell = M32(g, [S / 2, 0, S / 2]);
  const cm = M32(cab, [1, 0, 1]);
  shell.geometry = mergeGeometries([shell.geometry, cm.geometry.clone().translate(0, (Hh + 8) / 32, 0)]);
  cm.geometry.dispose();
  const lampGlow = G32(glow, [S / 2, 0, S / 2]);
  lampGlow.userData.ol = false;
  const body = group(shell, lampGlow);
  const tex = pixelTexture(S, Hh, panelPix);
  const place = (rotY, x, z) => new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
  const pg = (m) => new THREE.PlaneGeometry(S / 32, Hh / 32).translate(0, Hh / 64, 0).applyMatrix4(m);
  const panels = pixelMesh(mergeGeometries([
    pg(place(0, 0, -S / 2 / 32 + 0.5 / 32)), pg(place(Math.PI / 2, -S / 2 / 32 + 0.5 / 32, 0)), pg(place(-Math.PI / 2, S / 2 / 32 - 0.5 / 32, 0)),
  ]), tex);
  body.add(panels);
  // the folding gate across the front (slides sideways)
  const gatePix = (x, y) => {
    if (x < 1 || x >= S - 1 || y < 0 || y >= Hh - 6) return 0;
    const d = (x + y) % 10 === 0 || (x - y + 1000) % 10 === 0;
    return d || y === 0 || y === Hh - 7 || y === 22 || x === S - 2 ? (y === 22 ? 0xffe08a : C.brass) : 0;
  };
  const gate = pixelMesh(new THREE.PlaneGeometry(S / 32, (Hh - 6) / 32).translate(0, (Hh - 6) / 64, 0.5 / 32), pixelTexture(S, Hh - 6, gatePix));
  gate.position.set(0, 3 / 32, (S / 2 - 1) / 32);
  body.add(gate);
  return { obj: body, gate, size: S / 32, height: Hh / 32, lamp: { x: 0, y: (Hh - 6) / 32, z: 0 } };
}

/** Bramble's crank: a timber stand with a big spoked wheel, a gear and a bell on a post. */
export function liftCrank() {
  const grp = new THREE.Group();
  const g = new VoxelGrid(30, 64, 22);
  const tb = beam(0x6a4a2a, 'y', 3);
  g.box(2, 0, 2, 26, 4, 18, wood(0x5a3a22, { axis: 'x', across: 'z', pw: 4, seed: 2 }));
  g.box(4, 4, 9, 4, 30, 4, tb); g.box(22, 4, 9, 4, 30, 4, tb);
  g.box(4, 30, 10, 22, 2, 2, C.iron);
  // bell post with a brass bell and its rope
  g.box(25, 0, 16, 4, 64, 4, tb); g.box(16, 60, 16, 12, 2, 4, tb);
  g.ellipsoid(18.5, 50, 18, 4.4, 6, 4.4, (x, y) => (y > 49 ? C.gold : 0xd9a84a));
  g.box(18, 43, 17, 1, 2, 1, 0x6a5a3a);
  line(g, [[18.5, 42, 18], [18.5, 30, 18]], 0.5, C.rope);
  const body = M32(g, [15, 0, 11]);
  grp.add(body);
  const wheel = new VoxelGrid(40, 40, 4);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 20);
    const a = Math.atan2(y + 0.5 - 20, x + 0.5 - 20);
    const spoke = Math.abs(((a / (Math.PI / 3)) % 1 + 1) % 1 - 0.5) > 0.4;
    if (d < 19.5 && (d > 15.5 || spoke || d < 3.5)) for (let z = 0; z < 4; z++) wheel.set(x, y, z, d > 15.5 ? (d > 18.5 ? C.iron : 0x5a3a22) : d < 3.5 ? C.brass : 0x6a4a2a);
  }
  wheel.box(33, 18, 4, 3, 3, 0, C.woodL);
  const wm = M32(wheel, [20, 20, 2]);
  const holder = new THREE.Group();
  holder.position.set(0, 31 / 32, (11 - 11) / 32 - 0.3);
  holder.add(wm);
  // a handle sticking out of the rim
  const hd = new VoxelGrid(4, 4, 12);
  hd.box(1, 1, 0, 2, 2, 12, C.woodL);
  const hm = M32(hd, [2, 2, 0]);
  wm.geometry = mergeGeometries([wm.geometry, hm.geometry.clone().translate(16 / 32, 0, 2 / 32)]);
  hm.geometry.dispose();
  grp.add(holder);
  return { obj: grp, body, wheel: holder, bell: { x: (18.5 - 15) / 32, y: 50 / 32, z: (18 - 11) / 32 } };
}

/** Build everything into the scene S (root, B, addLight, signs). Returns the lift handle. */
export function buildLift(S) {
  const B = S.B, L = TOWN.lift, c = L.cage;
  const t = liftTower();
  B.addStatic(t.obj);
  S.signs.add(t.sign.pc, t.sign.pc.w / 32, t.sign.pc.h / 32, new THREE.Matrix4().makeTranslation(t.sign.x, t.sign.y, t.sign.z));
  S.addLight({ x: t.light.x, y: t.light.y, z: t.light.z, color: 0xffc070, intensity: 4, distance: 5.5, flicker: 0.12, pool: 1.6, poolOpacity: 0.26, halo: 0.6, haloOpacity: 0.55 });
  const cage = liftCage();
  cage.obj.position.set(c.x, 0, c.z);
  S.root.add(cage.obj);
  const cageLight = S.addLight({ x: c.x, y: cage.lamp.y, z: c.z, color: 0xffd890, intensity: 1.0, distance: 2.4, flicker: 0.1, real: true, halo: 0.3, haloOpacity: 0.35, bake: false });
  const crank = liftCrank();
  crank.obj.position.set(L.crank.x, 0, L.crank.z);
  crank.obj.rotation.y = Math.PI / 2;
  // the stand and bell are static (batched); only the wheel turns
  const stand = new THREE.Group();
  stand.position.copy(crank.obj.position); stand.rotation.copy(crank.obj.rotation);
  stand.add(crank.body);
  B.addStatic(stand);
  S.root.add(crank.obj);
  // collision: the tower posts, the cage (a solid block while it waits at the top), the crank
  const P = 1.3;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.solidCircle(c.x + dx * (P - 0.05), c.z + dz * (P - 0.05), 0.2, 8);
  B.solid(c.x - 1.2, 0, c.z - 1.3, c.x + 1.2, 8, c.z + 1.15, 'cage', { nav: true });
  B.solidCircle(L.crank.x, L.crank.z, 0.45, 2);
  return {
    cage, crank, cageLight,
    /** move the cage (and its lamp) to height y (TU) */
    setY(y) { cage.obj.position.y = y; cageLight.y = cage.lamp.y + y; },
    gateOpen(k) { cage.gate.position.x = k * 0.82; },
    /** The moving parts join the outline pass only when the eye is near. */
    setOutline(on) {
      if (this.ol === on) return;
      this.ol = on;
      for (const o of [cage.obj, crank.obj]) o.traverse((m) => { if (m.isMesh && m.userData.ol !== false) { if (on) m.layers.enable(LAYER_OUTLINE); else m.layers.disable(LAYER_OUTLINE); } });
    },
  };
}

export { CAGE, CAGE_H, TOWER_H, M, hash2 };

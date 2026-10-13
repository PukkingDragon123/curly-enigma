// Voxel furniture models, part 2: displays, decor, wall pieces and the fancy stuff.
import * as THREE from 'three';
import { FURNITURE } from '../data/furniture.js';
import { METALS, INFUSIONS } from '../data/weapons.js';
import { ITEMS, sellPrice } from '../data/items.js';
import { pixelTexture } from '../gfx/PixelArt.js';
import { VoxelGrid, vmesh, gmesh, jit, hash3, V16, shade, mixHex, carve } from './vox.js';
import { paintingCanvas } from './pixel.js';
import { waterMaterial } from './water.js';

const WOOD = 0x8a5a32, WOOD_D = 0x5a3a22, WOOD_L = 0xb07a4a, IRON = 0x34343c, BRASS = 0xc8a050, GOLD = 0xf2c23a;
const wd = (c = WOOD, s = 1, amt = 0.08) => (x, y, z) => jit(c, x >> 1, y, z >> 1, s, amt);
const mottled = (c, s = 1, amt = 0.1) => (x, y, z) => jit(c, x, y, z, s, amt);
function fg(id, h) { const [w, d] = FURNITURE[id]?.size || [1, 1]; return new VoxelGrid(w * 16, h, d * 16); }
const M = (g, pivot) => vmesh(g, { scale: V16, pivot: pivot ?? [g.w / 2, 0, g.d / 2] });
const GL = (g, pivot, outline = true) => gmesh(g, { scale: V16, pivot: pivot ?? [g.w / 2, 0, g.d / 2], outline });
function at(mesh, gw, gd, x, y, z) { mesh.position.set((x - gw / 2) * V16, y * V16, (z - gd / 2) * V16); return mesh; }

/** Wall pieces hang with their back here (local z, footprint centered on its tile). */
export const WALL_Z = -0.5 + 0.14;

// ---------------------------------------------------------------- weapons for the rack
export function weaponModel(w) {
  const metal = METALS[w.metal]?.color ?? 0xa0a6ae;
  const edge = mixHex(metal, 0xffffff, 0.45), dark = shade(metal, 0.7);
  const glow = w.infusion ? INFUSIONS[w.infusion]?.color : null;
  const g = new VoxelGrid(11, 30, 3);
  const grip = 0x6a4226;
  const cx = 5;
  const blade = (y0, len, wid, tip = 3) => {
    for (let y = 0; y < len; y++) {
      const k = y >= len - tip ? (len - y) / (tip + 1) : 1;
      const hw = Math.max(0, Math.round((wid / 2) * k));
      for (let x = cx - hw; x <= cx + hw; x++) g.set(x, y0 + y, 1, x === cx ? dark : x < cx ? edge : metal);
      if (glow && y % 4 === 1) g.set(cx, y0 + y, 1, glow);
    }
  };
  switch (w.type) {
    case 'axe':
      g.box(cx, 0, 1, 1, 22, 1, grip);
      g.box(cx + 1, 15, 1, 3, 6, 1, metal); g.box(cx + 4, 14, 1, 1, 8, 1, edge); g.box(cx - 1, 17, 1, 1, 3, 1, dark);
      break;
    case 'mace':
      g.box(cx, 0, 1, 1, 17, 1, grip);
      g.ellipsoid(cx + 0.5, 20, 1.5, 2.6, 2.6, 1, metal);
      for (const [dx, dy] of [[-3, 0], [3, 0], [0, 3], [-2, 2], [2, 2]]) g.set(cx + dx, 20 + dy, 1, edge);
      break;
    case 'spear':
      g.box(cx, 0, 1, 1, 22, 1, 0x8a6a3a);
      blade(22, 7, 2, 4);
      break;
    case 'warhammer':
      g.box(cx, 0, 1, 1, 20, 1, grip);
      g.box(cx - 3, 19, 1, 7, 4, 1, metal); g.box(cx - 3, 19, 1, 1, 4, 1, edge);
      break;
    default: {
      const L = { dagger: 9, shortsword: 13, longsword: 18, greatsword: 21, rapier: 19, moleblade: 15 }[w.type] ?? 14;
      const Wd = { greatsword: 4, moleblade: 2, rapier: 0, dagger: 2 }[w.type] ?? 2;
      g.box(cx, 0, 1, 1, 5, 1, grip);
      g.box(cx - 1, 0, 1, 3, 1, 1, dark);
      g.box(cx - 3, 5, 1, 7, 1, 1, w.type === 'rapier' ? BRASS : dark);
      blade(6, L, Wd, w.type === 'rapier' ? 2 : 3);
      if (w.type === 'moleblade') g.ellipsoid(cx + 0.5, 6 + L, 1.5, 3.2, 3, 1, metal);
    }
  }
  if (w.gem && ITEMS[w.gem]?.icon?.c) g.set(cx, 0, 2, ITEMS[w.gem].icon.c[0]);
  return M(g, [5.5, 0, 1.5]);
}

function weaponRack(id, ctx) {
  const grp = new THREE.Group();
  const g = fg(id, 30);
  g.box(0, 0, 4, 32, 2, 9, wd(WOOD_D, 2));
  g.box(1, 2, 7, 3, 26, 3, wd(WOOD_D, 3)); g.box(28, 2, 7, 3, 26, 3, wd(WOOD_D, 4));
  g.box(0, 26, 6, 32, 3, 5, wd(WOOD, 5));
  g.box(4, 8, 7, 24, 2, 3, wd(WOOD, 6));
  for (const x of [9, 16, 23]) { g.box(x - 1, 2, 6, 3, 1, 5, WOOD_L); g.box(x - 2, 24, 9, 1, 2, 1, BRASS); g.box(x + 2, 24, 9, 1, 2, 1, BRASS); }
  grp.add(M(g));
  const best = [...(ctx.weapons || [])].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 3);
  best.forEach((w, i) => {
    const m = weaponModel(w);
    at(m, 32, 16, 9 + i * 7, 2, 11.5);
    m.rotation.x = -0.12;
    m.rotation.z = (i - 1) * 0.05;
    grp.add(m);
  });
  return { obj: grp };
}

// ---------------------------------------------------------------- gem case
function bestGem(state) {
  if (!state) return null;
  let best = null, bv = 0;
  for (const l of state.data.lots) {
    const it = ITEMS[l.id];
    if (!it || it.cat !== 'gem') continue;
    const v = sellPrice(l.id, l.q, l.p);
    if (v > bv) { bv = v; best = l; }
  }
  return best;
}

function gemCase(id, ctx) {
  const grp = new THREE.Group();
  const g = fg(id, 26);
  g.box(3, 0, 3, 10, 2, 10, wd(WOOD_D));
  g.box(4, 2, 4, 8, 9, 8, wd(WOOD, 2));
  g.box(3, 11, 3, 10, 2, 10, (x, y) => (y === 12 ? GOLD : WOOD_D));
  for (const [x, z] of [[3, 3], [12, 3], [3, 12], [12, 12]]) g.box(x, 13, z, 1, 10, 1, BRASS);
  for (let x = 3; x < 13; x++) { g.set(x, 23, 3, BRASS); g.set(x, 23, 12, BRASS); }
  for (let z = 3; z < 13; z++) { g.set(3, 23, z, BRASS); g.set(12, 23, z, BRASS); }
  g.box(6, 13, 6, 4, 1, 4, 0xb8303a); // velvet cushion
  grp.add(M(g));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.6, 0.56), new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.28, depthWrite: false }));
  glass.position.y = 13 / 16 + 0.3;
  grp.add(glass);
  const gem = bestGem(ctx.state);
  let gm = null, col = 0xe0a8ff;
  if (gem) {
    col = ITEMS[gem.id].icon?.c?.[0] ?? 0xe0a8ff;
    const hi = ITEMS[gem.id].icon?.c?.[1] ?? 0xffffff;
    const gg = new VoxelGrid(5, 6, 5);
    gg.ellipsoid(2.5, 3, 2.5, 2.3, 2.8, 2.3, (x, y, z) => (y > 3 && x < 3 ? hi : col));
    gm = GL(gg, [2.5, 0, 2.5]);
    gm.position.y = 14 / 16;
    grp.add(gm);
  }
  return {
    obj: grp,
    lights: gem ? [{ x: 0, y: 1.05, z: 0.1, color: col, intensity: 1.6, distance: 3.5, flicker: 0.05, speed: 0.4, pool: 0.8, poolOpacity: 0.16, halo: 0.45, hy: 1.0, haloOpacity: 0.2 }] : [],
    update(dt, t) { if (gm) { gm.rotation.y = t * 0.8; gm.position.y = 14 / 16 + Math.sin(t * 1.7) * 0.02; } },
  };
}

// ---------------------------------------------------------------- plants
function pot(g, x0, z0, w, h, c = 0xb8603a) {
  g.box(x0 + 1, 0, z0 + 1, w - 2, h - 1, w - 2, mottled(c, 2, 0.07));
  g.box(x0, h - 2, z0, w, 2, w, (x, y) => (y === h - 1 ? shade(c, 1.12) : c));
  g.box(x0 + 1, h - 1, z0 + 1, w - 2, 1, w - 2, 0x3a2a1a);
}

function plantFern(id) {
  const g = fg(id, 24);
  pot(g, 4, 4, 8, 7);
  for (let a = 0; a < 9; a++) {
    const ang = (a / 9) * Math.PI * 2 + 0.3;
    const len = 6 + (a % 3) * 2;
    for (let k = 0; k < len; k++) {
      const x = Math.round(8 + Math.cos(ang) * k * 0.75), z = Math.round(8 + Math.sin(ang) * k * 0.75);
      const y = Math.round(7 + k * 1.5 - k * k * 0.1);
      const c = k % 2 ? 0x5aa84a : 0x4a8a3a;
      g.set(x, y, z, c);
      if (k > 2 && k % 2 === 0) { g.set(x + (Math.sin(ang) > 0 ? 1 : -1), y, z, 0x7ac85a); g.set(x, y, z + (Math.cos(ang) > 0 ? -1 : 1), 0x6ab84a); }
    }
  }
  g.box(7, 7, 7, 2, 4, 2, 0x4a8a3a);
  return { obj: M(g) };
}

function plantGlowcap(id) {
  const grp = new THREE.Group();
  const g = fg(id, 18);
  pot(g, 3, 3, 10, 7, 0x9a5a3a);
  for (const [x, z, h] of [[6, 7, 5], [10, 9, 7], [7, 10, 3]]) g.box(x, 7, z, 1, h, 1, 0xe8dcc0);
  grp.add(M(g));
  const c = new VoxelGrid(16, 18, 16);
  for (const [x, z, h, r] of [[6, 7, 5, 2.4], [10, 9, 7, 3], [7, 10, 3, 1.8]]) {
    c.ellipsoid(x + 0.5, 7 + h, z + 0.5, r, r * 0.8, r, (xx, y, zz) => (y < 7 + h ? -1 : (xx + zz) % 4 === 0 ? 0xd8f6ff : 0x6ac8ff));
  }
  grp.add(GL(c));
  return { obj: grp, lights: [{ x: 0, y: 0.9, z: 0, color: 0x7fd0ff, intensity: 3.5, distance: 4.5, flicker: 0.05, speed: 0.3, pool: 1.3, poolOpacity: 0.28, halo: 0.8, hy: 0.85, haloOpacity: 0.3 }] };
}

// ---------------------------------------------------------------- storage & decor
function bookshelf(id) {
  const g = fg(id, 38);
  g.box(0, 0, 0, 16, 37, 10, wd(WOOD_D, 2));
  carve(g, 1, 1, 1, 14, 35, 9);
  g.box(1, 1, 0, 14, 35, 1, wd(0x4a2e1a, 3));
  for (const y of [9, 18, 27]) g.box(1, y, 1, 14, 1, 9, wd(WOOD, 4));
  const cols = [0xc94a3a, 0x3a6ac9, 0x5ab84a, 0xe0b040, 0x9a5ad9, 0x8a3a2a, 0x2a5a5a, 0xd9a06a];
  for (const y0 of [1, 10, 19, 28]) {
    let x = 1;
    let i = Math.floor(hash3(y0, 0, 0, 3) * 8);
    while (x < 15) {
      const bw = 1 + (hash3(x, y0, 1, 4) < 0.35 ? 1 : 0);
      const bh = 5 + Math.floor(hash3(x, y0, 2, 5) * 3);
      if (hash3(x, y0, 3, 6) < 0.12) { x += 1; continue; }
      if (y0 === 28 && x > 9) break;
      const c = cols[i++ % cols.length];
      g.box(x, y0, 2, Math.min(bw, 15 - x), bh, 7, (xx, yy, zz) => (yy === y0 + bh - 2 && zz === 8 ? 0xf0d890 : jit(c, xx, 0, 0, 2, 0.06)));
      x += bw;
    }
  }
  // a little globe of the surface on the top shelf
  g.box(11, 28, 4, 2, 1, 2, BRASS);
  g.ellipsoid(12, 31.5, 5, 2.4, 2.4, 2.4, (x, y, z) => ((x + y * 2 + z) % 5 < 2 ? 0x5ab84a : 0x3a8ad0));
  g.set(13, 36, 3, 0x6ab84a); g.set(12, 37, 3, 0x7ac85a);
  return { obj: M(g, [8, 0, 8]) };
}

function barrel(id) {
  const g = fg(id, 17);
  for (let y = 0; y < 16; y++) {
    const r = 5.4 + Math.sin((y / 15) * Math.PI) * 1.2;
    g.cylinderY(8, 8, r, y, y + 1, (x, yy, z) => {
      if (y === 2 || y === 3 || y === 12 || y === 13) return IRON;
      const a = Math.atan2(z + 0.5 - 8, x + 0.5 - 8);
      const stave = Math.floor((a + Math.PI) / (Math.PI / 6));
      return jit((x + z) % 5 === 0 ? shade(WOOD, 0.8) : WOOD, stave, yy >> 2, 0, 3, 0.1);
    });
  }
  g.cylinderY(8, 8, 5.2, 15, 16, (x, y, z) => (Math.round(Math.hypot(x - 7.5, z - 7.5)) === 2 ? WOOD_D : WOOD_L));
  g.box(9, 16, 6, 2, 1, 2, 0xc8a070);
  return { obj: M(g) };
}

function crate(id) {
  const g = fg(id, 15);
  g.box(1, 0, 1, 14, 13, 14, (x, y, z) => (y % 4 === 3 ? shade(WOOD_L, 0.8) : jit(WOOD_L, x >> 2, y >> 2, z >> 2, 3, 0.08)));
  for (const [x, z] of [[1, 1], [13, 1], [1, 13], [13, 13]]) g.box(x, 0, z, 2, 13, 2, WOOD);
  g.box(1, 12, 1, 14, 1, 14, WOOD);
  for (let k = 0; k < 11; k++) { g.set(2 + k, 1 + k, 15, WOOD); g.set(15, 1 + k, 2 + k, WOOD); }
  for (let x = 4; x < 12; x++) if (x % 2) g.set(x, 9, 15, 0xc0302a);
  g.box(4, 7, 15, 8, 1, 1, 0xc0302a);
  return { obj: M(g) };
}

function clock(id) {
  const grp = new THREE.Group();
  const g = fg(id, 46);
  g.box(2, 0, 1, 12, 10, 10, wd(0x5a3020, 2));
  g.box(1, 0, 0, 14, 2, 12, wd(0x4a2818, 3));
  g.box(3, 10, 2, 10, 20, 8, wd(0x5a3020, 4));
  carve(g, 5, 12, 9, 6, 16, 1);
  g.box(5, 12, 8, 6, 16, 1, 0x1a1214);
  g.box(2, 30, 1, 12, 12, 10, wd(0x5a3020, 5));
  g.box(1, 42, 0, 14, 2, 12, wd(0x4a2818, 6));
  g.box(6, 44, 4, 4, 2, 4, GOLD);
  g.set(7, 46 - 1, 5, GOLD);
  // face
  g.ellipsoid(8, 36, 11, 4.6, 4.6, 0.6, 0xf0e8d0);
  g.box(7, 36, 11, 1, 4, 1, 0x1a1418); g.box(8, 36, 11, 3, 1, 1, 0x1a1418);
  for (const [x, y] of [[8, 40], [12, 36], [8, 32], [4, 36]]) g.set(x, y, 11, 0x6a4a2a);
  grp.add(M(g, [8, 0, 8]));
  const pg = new VoxelGrid(5, 15, 1);
  pg.box(2, 4, 0, 1, 11, 1, BRASS);
  pg.ellipsoid(2.5, 2.5, 0.5, 2.4, 2.4, 0.6, GOLD);
  const pend = vmesh(pg, { scale: V16, pivot: [2.5, 15, 0.5] });
  pend.position.set(0, 28 / 16, (9.4 - 8) / 16);
  grp.add(pend);
  let last = 0;
  return {
    obj: grp,
    update(dt, t, env) {
      pend.rotation.z = Math.sin(t * Math.PI) * 0.32;
      const tick = Math.floor(t);
      if (tick !== last) { last = tick; if (env && env.near < 3.5) env.audio.play('click', { gap: 0.3 }); }
    },
  };
}

function framePlane(canvas, wpx, hpx, ppu, frameColor, basic = false) {
  const grp = new THREE.Group();
  const tex = pixelTexture(canvas);
  const w = wpx / ppu, h = hpx / ppu;
  const mat = basic ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ map: tex });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  plane.position.z = 0.07;
  grp.add(plane);
  const fw = Math.round(w * 16) + 4, fh = Math.round(h * 16) + 4;
  const g = new VoxelGrid(fw, fh, 2);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    if (x > 1 && x < fw - 2 && y > 1 && y < fh - 2) continue;
    g.set(x, y, 0, jit(shade(frameColor, 0.8), x >> 1, y >> 1, 0, 3, 0.1));
    if (x === 0 || y === 0 || x === fw - 1 || y === fh - 1 || ((x === 1 || x === fw - 2) && (y === 1 || y === fh - 2))) g.set(x, y, 1, jit(frameColor, x, y, 0, 4, 0.08));
  }
  const fm = vmesh(g, { scale: V16, pivot: [fw / 2, fh / 2, 0] });
  grp.add(fm);
  return { grp, w, h };
}

function painting(id) {
  const kind = id === 'painting_sun' ? 'sun' : 'beach';
  const pc = paintingCanvas(kind);
  const { grp } = framePlane(pc.commit(), pc.w, pc.h, 24, 0xc8a050);
  grp.position.set(0, 1.62, WALL_Z);
  const o = new THREE.Group();
  o.add(grp);
  return { obj: o, wall: true };
}

function fakeWindow(id) {
  const o = new THREE.Group();
  const pc = paintingCanvas('window');
  const tex = pixelTexture(pc.commit());
  const w = 1.6, h = 1.0;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  sky.position.set(0, 1.62, WALL_Z + 0.02);
  o.add(sky);
  const fw = 30, fh = 20;
  const g = new VoxelGrid(fw, fh, 3);
  const cream = 0xe8dcc0;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const border = x < 2 || x >= fw - 2 || y < 2 || y >= fh - 2;
    const mull = x === 14 || x === 15 || y === 10;
    if (border) { g.set(x, y, 0, shade(cream, 0.85)); g.set(x, y, 1, jit(cream, x, y, 0, 2, 0.05)); }
    else if (mull) g.set(x, y, 1, cream);
  }
  g.box(0, 0, 1, fw, 1, 2, WOOD);
  const fm = vmesh(g, { scale: V16, pivot: [fw / 2, fh / 2, 0] });
  fm.position.set(0, 1.62, WALL_Z);
  o.add(fm);
  // curtains + rod
  const c = new VoxelGrid(36, 22, 2);
  c.box(0, 20, 0, 36, 1, 1, BRASS);
  for (const x0 of [0, 31]) c.box(x0, 2, 1, 5, 18, 1, (x, y) => ((x + y) % 4 === 0 ? 0x9a2a24 : jit(0xc0443a, x, y, 0, 3, 0.06)));
  c.box(1, 9, 1, 3, 1, 1, GOLD); c.box(32, 9, 1, 3, 1, 1, GOLD);
  const cm = vmesh(c, { scale: V16, pivot: [18, 11, 0] });
  cm.position.set(0, 1.66, WALL_Z + 0.02);
  o.add(cm);
  return {
    obj: o,
    wall: true,
    lights: [{ x: 0, y: 1.6, z: WALL_Z + 0.5, color: 0xbfe6ff, intensity: 4, distance: 5, flicker: 0, pool: 1.6, poolZ: 0.4, poolOpacity: 0.3, halo: 1.4, hy: 1.62, hz: WALL_Z + 0.15, haloOpacity: 0.18, priority: 2 }],
  };
}

function banner(id) {
  const o = new THREE.Group();
  const pc = paintingCanvas('banner');
  const tex = pixelTexture(pc.commit());
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.1), new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5 }));
  p.position.set(0, 1.55, WALL_Z + 0.05);
  o.add(p);
  const r = new VoxelGrid(14, 2, 2);
  r.box(1, 0, 0, 12, 1, 1, WOOD_D); r.box(0, 0, 0, 1, 2, 1, GOLD); r.box(13, 0, 0, 1, 2, 1, GOLD);
  const rm = vmesh(r, { scale: V16, pivot: [7, 0, 0] });
  rm.position.set(0, 2.1, WALL_Z + 0.04);
  o.add(rm);
  return { obj: o, wall: true };
}

function musicBox(id) {
  const grp = new THREE.Group();
  const g = fg(id, 16);
  g.box(4, 0, 4, 8, 1, 8, WOOD_D);
  g.box(5, 1, 5, 6, 6, 6, wd(WOOD, 2));
  g.box(4, 7, 4, 8, 1, 8, WOOD_D);
  g.box(4, 8, 5, 8, 4, 6, (x, y, z) => (y === 8 || x === 4 || x === 11 ? GOLD : jit(0x8a3a5a, x, y, z, 3, 0.05)));
  g.box(5, 11, 6, 6, 1, 4, 0x3a1a2a);
  // open lid leaning back
  for (let k = 0; k < 6; k++) g.box(4, 12 + k, 5 - Math.floor(k / 2), 8, 1, 1, (x) => (x === 4 || x === 11 ? GOLD : 0x8a3a5a));
  grp.add(M(g));
  const crank = new VoxelGrid(1, 3, 1);
  crank.box(0, 0, 0, 1, 3, 1, BRASS);
  const cm = vmesh(crank, { scale: V16, pivot: [0.5, 0, 0.5] });
  cm.rotation.z = Math.PI / 2;
  at(cm, 16, 16, 12.3, 10, 8);
  grp.add(cm);
  const dancer = new VoxelGrid(3, 5, 3);
  dancer.box(1, 0, 1, 1, 2, 1, 0xf0d0d8); dancer.box(0, 2, 0, 3, 1, 3, 0xf080a8); dancer.box(1, 3, 1, 1, 2, 1, 0xf0d0d8);
  const dm = vmesh(dancer, { scale: V16, pivot: [1.5, 0, 1.5] });
  at(dm, 16, 16, 8, 12, 8);
  grp.add(dm);
  return {
    obj: grp,
    update(dt, t, env) {
      if (env && env.playing) { dm.rotation.y += dt * 4; cm.rotation.x += dt * 5; dm.position.y = 12 / 16 + Math.abs(Math.sin(t * 6)) * 0.02; }
    },
  };
}

function plushie(id) {
  const g = fg(id, 8);
  const pink = 0xe8a0b0;
  const segs = [[4, 11, 2.2], [6.5, 9, 2.4], [9, 8.5, 2.6], [11, 7, 2.9]];
  segs.forEach(([x, z, r], i) => g.ellipsoid(x, r, z, r, r, r, (xx, y, zz) => (i < 3 && (xx + zz) % 3 === 0 ? 0xd88a9a : jit(pink, xx, y, zz, i, 0.05))));
  g.set(12, 4, 9, 0x1a1418); g.set(10, 4, 9, 0x1a1418);
  g.set(11, 2, 9, 0xd04a6a);
  g.box(10, 6, 6, 3, 1, 1, 0x5a8ad0);
  return { obj: M(g) };
}

function fishTank(id) {
  const grp = new THREE.Group();
  const g = fg(id, 28);
  g.box(1, 0, 3, 30, 9, 11, wd(WOOD, 2));
  g.box(0, 9, 2, 32, 1, 13, WOOD_D);
  for (const x of [3, 17]) g.box(x, 2, 14, 12, 6, 1, wd(WOOD_L, 3));
  g.box(1, 10, 3, 30, 2, 11, (x, y, z) => (hash3(x, y, z, 2) < 0.5 ? 0xd8c8a8 : 0xa89878));
  g.box(1, 24, 3, 30, 1, 11, IRON);
  for (const [x, z] of [[1, 3], [30, 3], [1, 13], [30, 13]]) g.box(x, 10, z, 1, 15, 1, IRON);
  for (const [x, h] of [[5, 9], [7, 6], [24, 10], [26, 7], [14, 5]]) for (let y = 0; y < h; y++) g.set(x + (y % 3 === 0 ? 1 : 0), 12 + y, 6 + (x % 4), y % 2 ? 0x4a9a4a : 0x5ab85a);
  g.box(18, 12, 7, 4, 3, 3, 0x7a7470);
  grp.add(M(g));
  const water = new THREE.Mesh(new THREE.BoxGeometry(29 / 16, 11.5 / 16, 9.6 / 16), new THREE.MeshBasicMaterial({ color: 0x4ab8f0, transparent: true, opacity: 0.24, depthWrite: false }));
  water.position.set(0, (12 + 5.75) / 16, (8.5 - 8) / 16);
  grp.add(water);
  const fish = [];
  for (let i = 0; i < 2; i++) {
    const f = new VoxelGrid(8, 4, 2);
    f.box(1, 0, 0, 5, 4, 2, (x, y) => (y === 0 ? 0xfff0ea : 0xf8c0b0)); f.box(0, 1, 0, 1, 2, 2, 0xf8c0b0);
    f.box(6, 0, 0, 2, 1, 2, 0xe8907a); f.box(6, 3, 0, 2, 1, 2, 0xe8907a); f.box(6, 1, 0, 1, 2, 2, 0xe8a090);
    f.set(3, 3, 0, 0xe8907a); f.set(3, 3, 1, 0xe8907a);
    const m = vmesh(f, { scale: V16, pivot: [4, 2, 1] });
    grp.add(m);
    fish.push(m);
  }
  return {
    obj: grp,
    lights: [{ x: 0, y: 1.1, z: 0.2, color: 0x7ad0ff, intensity: 2.5, distance: 4, flicker: 0.05, speed: 0.5, pool: 1.3, poolOpacity: 0.25, halo: 0, real: true }],
    bubbles: { x: -0.5, y: 0.85, z: 0, top: 1.45 },
    update(dt, t) {
      fish.forEach((m, i) => {
        const ph = t * (0.45 + i * 0.12) + i * 2.4;
        const x = Math.sin(ph) * 0.7;
        m.position.set(x, (15 + i * 4 + Math.sin(t * 1.3 + i) * 1.2) / 16, (7.5 + i * 2.4 - 8) / 16);
        m.rotation.y = Math.cos(ph) > 0 ? Math.PI : 0;
      });
    },
  };
}

function fountain(id) {
  const grp = new THREE.Group();
  const g = fg(id, 26);
  const stone = (x, y, z) => jit(y % 3 === 2 ? 0x9a948e : 0x8a847e, (x + z) >> 2, y, 0, 4, 0.1);
  g.cylinderY(16, 16, 14.5, 0, 6, stone);
  carve(g, 0, 2, 0, 32, 4, 32, (x, y, z) => Math.hypot(x + 0.5 - 16, z + 0.5 - 16) < 12.5);
  g.cylinderY(16, 16, 14.5, 5, 6, (x, y, z) => (Math.hypot(x + 0.5 - 16, z + 0.5 - 16) < 12.5 ? -1 : 0xa8a29c));
  g.cylinderY(16, 16, 2.6, 2, 18, stone);
  g.cylinderY(16, 16, 5.5, 18, 20, stone);
  carve(g, 11, 19, 11, 10, 1, 10, (x, y, z) => Math.hypot(x + 0.5 - 16, z + 0.5 - 16) < 4.4);
  g.cylinderY(16, 16, 1.5, 20, 24, 0xa8a29c);
  g.set(9, 6, 3, 0x5a8a3a); g.set(24, 6, 27, 0x5a8a3a); g.set(25, 6, 26, 0x6aa84a);
  grp.add(M(g));
  const wm = waterMaterial({ res: [25, 25], round: true });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(25 / 16, 25 / 16).rotateX(-Math.PI / 2), wm);
  pool.position.y = 4.6 / 16;
  grp.add(pool);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(9 / 16, 9 / 16).rotateX(-Math.PI / 2), waterMaterial({ res: [9, 9], round: true }));
  top.position.y = 19.4 / 16;
  grp.add(top);
  return { obj: grp, spray: { x: 0, y: 24 / 16, z: 0, r: 0.34, basinY: 5 / 16 }, water: true };
}

function trophy(id) {
  const grp = new THREE.Group();
  const g = fg(id, 28);
  g.box(3, 0, 3, 10, 2, 10, wd(WOOD_D));
  g.box(4, 2, 4, 8, 7, 8, wd(0x5a3020, 2));
  g.box(5, 4, 12, 6, 3, 1, BRASS);
  g.box(3, 9, 3, 10, 1, 10, WOOD_D);
  grp.add(M(g));
  const p = new VoxelGrid(16, 20, 4);
  for (let k = 0; k < 16; k++) p.set(3 + Math.floor(k * 0.55), 1 + k, 2, k % 4 === 0 ? 0xc8a050 : 0xb07a3a);
  for (let k = -6; k <= 6; k++) { const x = 11 + k, y = 17 - Math.round(Math.abs(k) * 0.45); p.set(x, y, 2, Math.abs(k) > 4 ? 0xfff0a0 : GOLD); p.set(x, y + 1, 2, Math.abs(k) < 5 ? 0xffd34a : -1); }
  p.box(10, 15, 1, 3, 3, 3, GOLD);
  const pm = GL(p, [8, 0, 2]);
  pm.position.y = 10 / 16;
  grp.add(pm);
  return { obj: grp, lights: [{ x: 0, y: 1.3, z: 0, color: 0xffd34a, intensity: 3, distance: 4, flicker: 0.04, speed: 0.4, pool: 1.0, poolOpacity: 0.25, halo: 0.9, hy: 1.3, haloOpacity: 0.3 }], update(dt, t) { pm.rotation.y = Math.sin(t * 0.6) * 0.35; } };
}

function statue(id) {
  const g = fg(id, 56);
  const marble = (x, y, z) => {
    const v = Math.sin(x * 0.7 + y * 0.35 + z * 0.5) + Math.sin(y * 0.9 - x * 0.3);
    if (v > 1.7) return 0xbab4ac;
    return jit(0xece8e0, x, y, z, 3, 0.035);
  };
  const shadowM = 0xa8a29a, dark = 0x6a645e;
  const ped = (x, y, z) => jit(0x8a847e, x >> 1, y, z >> 1, 2, 0.08);
  g.box(2, 0, 2, 28, 3, 28, ped);
  g.box(5, 3, 5, 22, 7, 22, (x, y, z) => (y === 3 || y === 9 ? 0x7a746e : ped(x, y, z)));
  g.box(4, 10, 4, 24, 2, 24, (x, y) => (y === 11 ? 0xc8c2ba : 0xaaa49e));
  g.box(11, 5, 27, 10, 3, 1, BRASS); g.box(12, 6, 28, 8, 1, 1, 0xffe08a);
  // feet and stout legs
  g.ellipsoid(12, 12, 19, 3.2, 1.6, 4, marble); g.ellipsoid(20, 12, 19, 3.2, 1.6, 4, marble);
  g.box(10, 12, 14, 4, 4, 5, marble); g.box(18, 12, 14, 4, 4, 5, marble);
  // round body with a belly
  g.ellipsoid(16, 21, 16, 7.6, 7.5, 6.4, marble);
  g.ellipsoid(16, 19, 20.5, 5, 5, 2.4, (x, y, z) => jit(0xf4f0e8, x, y, z, 4, 0.03));
  // big chibi head
  g.ellipsoid(16, 33, 16.5, 7.6, 6.4, 6.8, marble);
  // snout and nose
  g.ellipsoid(16, 30.5, 23, 3.4, 2.6, 2.6, marble);
  g.box(15, 31, 25, 2, 2, 1, 0xd0c4c0);
  // heroic squint + brows
  g.box(11, 33, 22, 3, 1, 1, dark); g.box(18, 33, 22, 3, 1, 1, dark);
  g.box(10, 35, 21, 4, 1, 2, shadowM); g.box(18, 35, 21, 4, 1, 2, shadowM);
  // miner's helmet with a golden lamp
  g.ellipsoid(16, 37, 16.5, 8, 4.6, 7.4, (x, y, z) => (y < 37 ? -1 : y === 37 ? shadowM : marble(x, y, z)));
  g.box(14, 37, 23, 4, 3, 2, GOLD); g.box(15, 38, 25, 2, 1, 1, 0xfff0a0);
  // left paw on the hip
  g.box(6, 19, 14, 3, 7, 4, marble); g.box(7, 17, 17, 4, 3, 4, marble);
  // right arm raised high, gripping the pick
  for (let k = 0; k < 12; k++) g.box(22 + Math.floor(k * 0.25), 23 + k, 14, 3, 1, 4, marble);
  g.box(23, 35, 13, 5, 4, 6, marble);
  for (let k = 0; k < 16; k++) g.box(25 - Math.floor(k * 0.32), 37 + k, 15, 1, 1, 2, k > 13 ? marble : shadowM);
  for (let k = -9; k <= 7; k++) {
    const x = 20 + k, y = 52 - Math.round(Math.abs(k) * 0.42);
    g.box(x, y, 15, 1, 2, 2, Math.abs(k) > 6 ? GOLD : marble);
  }
  return { obj: M(g) };
}

const BUILDERS = {
  weapon_rack: weaponRack, gem_case: gemCase, plant_fern: plantFern, plant_glowcap: plantGlowcap,
  bookshelf, barrel, crate, clock, painting_sun: painting, painting_beach: painting, fake_window: fakeWindow,
  banner, music_box: musicBox, plushie, fish_tank: fishTank, fountain, trophy_pick: trophy, statue_mole: statue,
};

export function buildDecor(id, ctx) {
  const fn = BUILDERS[id];
  return fn ? fn(id, ctx) : null;
}

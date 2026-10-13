// 3D views of the blade: the hot billet as columns (fire + anvil), the dotted target outline,
// and the finished weapon as a voxel model (balance step + reveal).
import * as THREE from 'three';
import { VoxelGrid, voxelMesh, voxelMaterial } from '../gfx/Voxel.js';
import { METALS, INFUSIONS } from '../data/weapons.js';
import { mixHex, shade } from '../core/util.js';
import { applyHeat, glowAmount, glowHex } from './blackbody.js';
import { HAFTED } from './bladeSim.js';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';
import { makeGlow } from '../bookends/fx.js';

/** Mottled forge-scale texture: used as both colour and emissive map so hot metal glows unevenly. */
let scaleTex = null;
function getScaleTex() {
  if (scaleTex) return scaleTex;
  const pc = new PixelCanvas(16, 16);
  let s = 91;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = rnd();
    const blot = Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2) + Math.sin(y * 1.1 + x * 0.3);
    let c = v < 0.06 ? 0xffffff : blot > 1.2 ? 0x8a8a8a : blot < -1.35 ? 0x9a9a9a : v < 0.2 ? 0xc8c8c8 : 0xe6e6e6;
    if (v > 0.97) c = 0x6a6a6a;
    pc.set(x, y, c);
  }
  scaleTex = pixelTexture(pc.commit());
  scaleTex.colorSpace = THREE.NoColorSpace;
  scaleTex.userData.shared = true;
  return scaleTex;
}

export const COL = 0.08; // world length of one column
export const HWU = 0.028; // world units per half-width unit

/** Darkened "forge scale" look of a metal while it is being worked. */
export function scaleColor(metal) {
  return mixHex(METALS[metal]?.color ?? 0x8a8f96, 0x2e2826, 0.45);
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
unitBox.userData.shared = true;
const thick = (w) => 0.02 + Math.min(6, w) * 0.0045;

export class BladeView {
  constructor(sim) {
    this.sim = sim;
    this.group = new THREE.Group();
    this.base = scaleColor(sim.metal);
    this.cols = [];
    const st = getScaleTex();
    for (let i = 0; i < sim.maxLen; i++) {
      const mat = voxelMaterial('toon', { unique: true, vertexColors: false, color: this.base, emissive: 0x000000 });
      mat.map = st; mat.emissiveMap = st;
      const m = new THREE.Mesh(unitBox, mat);
      m.visible = false;
      m.layers.enable(1);
      this.group.add(m);
      this.cols.push({ mesh: m, mat, disp: sim.w[i] ?? 0, squash: 0, cracks: [] });
    }
    // tang: a stub the tongs hold
    const tm = voxelMaterial('toon', { unique: true, vertexColors: false, color: this.base, emissive: 0x000000 });
    tm.map = st; tm.emissiveMap = st;
    this.tang = new THREE.Mesh(unitBox, tm);
    this.tang.scale.set(0.16, 0.022, 0.035);
    this.tang.position.set(-0.08, 0.011, 0);
    this.tang.layers.enable(1);
    this.tangMat = tm;
    this.group.add(this.tang);
    this.crackMat = new THREE.MeshBasicMaterial({ color: 0x0a0606 });
    this.hover = -1;
    this.frame = this._makeFrame();
    this.group.add(this.frame);
    this.dots = null;
    // ghost: where a charging blow would leave the column
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.45, depthTest: false });
    this.ghostMesh = new THREE.Mesh(unitBox, this.ghostMat);
    this.ghostMesh.renderOrder = 28;
    this.ghostMesh.visible = false;
    this.group.add(this.ghostMesh);
    this.ghostW = 0;
    this.ghostCol = -1;
    // a dithered heat haze around the bar while it glows
    this.halo = makeGlow({ color: 0xff8a30, size: 1, intensity: 0, falloff: 1.6, levels: 6, renderOrder: 18 });
    this.halo.position.set(0, 0.03, 0);
    this.group.add(this.halo);
  }

  /** Show (col >= 0) or hide the predicted width of a column under a charging blow. */
  ghost(col, w = 0) {
    this.ghostCol = col;
    this.ghostW = w;
    this.ghostMesh.visible = col >= 0;
  }

  _makeFrame() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd34a, depthTest: false, transparent: true });
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(unitBox, mat);
      b.renderOrder = 30;
      g.add(b);
    }
    g.visible = false;
    g.userData.mat = mat;
    return g;
  }

  /** Dotted outline of the plan, with per-column match colors. */
  buildDots() {
    const t = this.sim.target;
    const pts = [];
    const segs = []; // column index owning each dot (-1 for caps)
    const step = 0.016;
    const y = 0.005;
    for (let i = 0; i < t.length; i++) {
      const x0 = i * COL, x1 = (i + 1) * COL;
      for (let x = x0 + step / 2; x < x1; x += step) for (const s of [-1, 1]) { pts.push(x, y, s * t[i] * HWU); segs.push(i); }
      const next = i + 1 < t.length ? t[i + 1] : 0;
      const a = Math.min(t[i], next), b = Math.max(t[i], next);
      for (let z = a * HWU; z < b * HWU; z += step) for (const s of [-1, 1]) { pts.push(x1, y, s * z); segs.push(i); }
    }
    for (let z = -t[0] * HWU; z <= t[0] * HWU; z += step) { pts.push(0, y, z); segs.push(0); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const cols = new Float32Array(pts.length);
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true, opacity: 0.95 });
    const p = new THREE.Points(geo, mat);
    p.renderOrder = 25;
    p.frustumCulled = false;
    this.dots = p;
    this.dotSegs = segs;
    this.group.add(p);
    return p;
  }

  setDotsVisible(v) { if (this.dots) this.dots.visible = v; }

  /** Lift the dots above the thickest column so they read on top. */
  update(dt, time) {
    const sim = this.sim;
    let maxTh = 0.02;
    for (let i = 0; i < this.cols.length; i++) {
      const c = this.cols[i];
      const w = sim.w[i] ?? 0;
      c.disp += (w - c.disp) * Math.min(1, dt * 16);
      c.squash = Math.max(0, c.squash - dt * 5);
      const vis = i < sim.w.length && c.disp > 0.03;
      c.mesh.visible = vis;
      if (!vis) { for (const k of c.cracks) k.visible = false; continue; }
      const th = thick(c.disp) * (1 - c.squash * 0.45);
      maxTh = Math.max(maxTh, th);
      c.mesh.scale.set(COL * 1.001, th, Math.max(0.006, 2 * c.disp * HWU * (1 + c.squash * 0.12)));
      c.mesh.position.set((i + 0.5) * COL, th / 2, 0);
      applyHeat(c.mat, this.base, sim.T[i] ?? 20, 0.95);
      if (i === this.hover) c.mat.emissive.offsetHSL(0, 0, 0).addScalar(0.05);
      // crack marks
      const n = sim.cracks[i] || 0;
      while (c.cracks.length < n) {
        const k = new THREE.Group();
        const seed = (i * 7 + c.cracks.length * 13) % 5;
        for (let s = 0; s < 3; s++) {
          const b = new THREE.Mesh(unitBox, this.crackMat);
          b.scale.set(0.012, 0.004, 0.012);
          b.position.set((s - 1) * 0.012 + (seed - 2) * 0.004, 0, (s % 2 ? 0.008 : -0.006) + (s - 1) * 0.01);
          k.add(b);
        }
        this.group.add(k);
        c.cracks.push(k);
      }
      c.cracks.forEach((k, j) => {
        k.visible = true;
        k.position.set((i + 0.5) * COL + (j - 1) * 0.018, th + 0.002, (j % 2 ? 1 : -1) * Math.min(c.disp * HWU * 0.4, 0.03));
      });
    }
    applyHeat(this.tangMat, this.base, sim.T[0] ?? 20, 0.7);
    // heat halo: centred on the bar, as bright as its hottest part
    let hot = 0, sumT = 0, sumX = 0;
    for (let i = 0; i < sim.w.length; i++) { const T = sim.T[i] ?? 20; const k = glowAmount(T); if (k > 0) { sumT += k; sumX += k * (i + 0.5) * COL; } if (T > hot) hot = T; }
    const gk = glowAmount(hot);
    const hu = this.halo.userData.glow;
    hu.uIntensity.value = Math.min(0.42, gk * 0.3) * (0.92 + Math.sin(time * 7.3) * 0.08);
    if (gk > 0) hu.uColor.value.setHex(glowHex(hot));
    hu.uSize.value.setScalar(0.35 + sim.length * COL * 1.15);
    this.halo.position.x = sumT > 0 ? sumX / sumT : sim.length * COL * 0.5;
    this.halo.visible = gk > 0.02;
    if (this.dots) {
      this.dots.position.y = maxTh + 0.004;
      const col = this.dots.geometry.attributes.color;
      const pulse = 0.75 + 0.25 * Math.sin(time * 5);
      const cGood = [0.35, 1, 0.4], cThick = [1, 0.62, 0.2], cThin = [0.55, 0.85, 1];
      for (let k = 0; k < this.dotSegs.length; k++) {
        const m = sim.match(this.dotSegs[k]);
        const c = m === 0 ? cGood : m > 0 ? cThick : cThin;
        const hl = this.dotSegs[k] === this.hover ? 1.25 : 1;
        col.array[k * 3] = c[0] * pulse * hl; col.array[k * 3 + 1] = c[1] * pulse * hl; col.array[k * 3 + 2] = c[2] * pulse * hl;
      }
      col.needsUpdate = true;
    }
    if (this.ghostCol >= 0) {
      const gw = Math.max(0.006, 2 * this.ghostW * HWU);
      this.ghostMesh.scale.set(COL * 0.9, 0.004, gw);
      this.ghostMesh.position.set((this.ghostCol + 0.5) * COL, maxTh + 0.006, 0);
      this.ghostMat.opacity = 0.35 + 0.2 * Math.sin(time * 14);
    }
    // selection frame
    if (this.hover >= 0 && this.hover < sim.w.length) {
      const c = this.cols[this.hover];
      const hw = Math.max(c.disp, sim.target[this.hover] ?? 0) * HWU + 0.012;
      const x0 = this.hover * COL - 0.004, x1 = (this.hover + 1) * COL + 0.004, y = maxTh + 0.006;
      const [a, b, l, r] = this.frame.children;
      a.scale.set(x1 - x0, 0.004, 0.006); a.position.set((x0 + x1) / 2, y, hw);
      b.scale.set(x1 - x0, 0.004, 0.006); b.position.set((x0 + x1) / 2, y, -hw);
      l.scale.set(0.006, 0.004, hw * 2); l.position.set(x0, y, 0);
      r.scale.set(0.006, 0.004, hw * 2); r.position.set(x1, y, 0);
      this.frame.visible = true;
      this.frame.userData.mat.opacity = 0.6 + 0.4 * Math.sin(time * 9);
    } else this.frame.visible = false;
  }

  /** World x-range (local) of column i center. */
  colX(i) { return (i + 0.5) * COL; }

  /** Hammer-impact squash on a column. */
  squash(i, k = 1) { if (this.cols[i]) this.cols[i].squash = Math.min(1, k); }

  /** Column index under a local-space x, or -1. */
  pick(localX, localZ) {
    const i = Math.floor(localX / COL);
    if (i < 0 || i >= this.sim.w.length) return -1;
    const hw = Math.max(this.sim.w[i], this.sim.target[i] ?? 0, 1.2) * HWU + 0.06;
    if (Math.abs(localZ) > hw) return -1;
    return i;
  }

  dispose() {
    this.halo.material.dispose();
    for (const c of this.cols) c.mat.dispose();
    this.tangMat.dispose();
    this.crackMat.dispose();
    this.frame.userData.mat.dispose();
    this.ghostMat.dispose();
    if (this.dots) { this.dots.geometry.dispose(); this.dots.material.dispose(); }
  }
}

// ---------------------------------------------------------------- finished weapon model
const VPC = 6; // weapon model voxels per column
const VW = COL / VPC; // weapon model voxel size
const RW = HWU / VW; // voxels per half-width unit

const INF_VEIN = {
  bioxide: 0x9af4ff, magmaite: 0xffa040, frostite: 0xe8fcff, gravium: 0xd8b8ff, voidstone: 0x9a5aff,
  lumite: 0xb8ffb0, obsidian_shard: 0x8a6ab0, echo_crystal: 0xbfe6ff, sunstone: 0xffe066,
};

const smooth01 = (t) => t * t * (3 - 2 * t);

/**
 * Voxel model of the finished weapon, blade along +y from the guard at y = 0 (hilt below),
 * broad faces toward ±z. The blade has a diamond cross-section with polished bevels, a temper
 * line on quench-hardened metals, a fuller, cracks where the forging cracked it and glowing
 * veins for infusions. opts: { infusion, gem, gemColor }.
 * Returns { group, blade, hilt, pommel, headCap, mat, veinMat, length, hiltLength, hafted }.
 */
export function buildWeapon(sim, opts = {}) {
  const metal = METALS[sim.metal];
  const mc = metal.color;
  const w = sim.w.slice(0, sim.length);
  const L = w.length;
  const maxHW = Math.max(2, ...w);
  const hafted = HAFTED.has(sim.type);
  const R = Math.ceil(maxHW * RW) + 2;
  const GX = R * 2 + 3, GY = L * VPC + 1, GZ = 9, cz = 4;
  const g = new VoxelGrid(GX, GY, GZ);
  const veins = new VoxelGrid(GX, GY, GZ);
  const cx = Math.floor(GX / 2);
  const edge = mixHex(mc, 0xffffff, 0.5), bevel = mixHex(mc, 0xffffff, 0.2), dark = shade(mc, 0.7), deep = shade(mc, 0.82);
  const hamonC = mixHex(mc, 0xffffff, 0.34);
  const quenched = !!metal.quench;
  const veinC = opts.infusion ? INF_VEIN[opts.infusion] ?? INFUSIONS[opts.infusion]?.color : null;
  // smooth half-width (in units) along the blade; the last column tapers to a point
  const hwAt = (yy) => {
    const f = yy / VPC - 0.5;
    const i0 = Math.max(0, Math.min(L - 1, Math.floor(f)));
    const t = Math.max(0, Math.min(1, f - i0));
    const a = w[i0];
    const b = i0 + 1 < L ? w[i0 + 1] : w[i0] * 0.15;
    let hw = a + (b - a) * smooth01(t);
    if (f > L - 1) hw = w[L - 1] * Math.max(0, 1 - (f - (L - 1)) * 1.6);
    return Math.max(0, hw);
  };
  for (let y = 0; y < GY; y++) {
    const col = Math.min(L - 1, Math.floor(y / VPC));
    const hw = hwAt(y);
    const r = hw * RW;
    const shaft = hafted && hw <= 1.65 && y < GY * 0.85;
    if (shaft) {
      // a forged socket/shaft: a round bar with a raised band every so often
      const rr = Math.max(1.6, r * 0.9);
      const band = y % 12 < 2;
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        if (dx * dx + dz * dz > (band ? rr + 0.7 : rr) ** 2 + 0.2) continue;
        g.set(cx + dx, y, cz + dz, band ? dark : dx < 0 ? bevel : dz > 0 ? deep : mc);
      }
      continue;
    }
    if (r < 0.35) continue;
    const ri = Math.round(r);
    const hamonAt = 0.62 + 0.07 * Math.sin(y * 0.55) + 0.03 * Math.sin(y * 1.7);
    for (let dx = -ri; dx <= ri; dx++) {
      const ad = Math.abs(dx);
      const t = ad / Math.max(0.6, r);
      if (t > 1.02) continue;
      // diamond cross-section: thick spine, bevels running to a one-voxel edge
      let ht = hafted ? Math.round(3 - t * 1.6) : Math.round(Math.max(0, 2.6 * (1 - t) + 0.2));
      if (t > 0.88) ht = 0;
      let c = t > 0.84 ? edge : t > 0.58 ? bevel : mc;
      if (!hafted && quenched && Math.abs(t - hamonAt) < 0.06 && y > 4) c = hamonC; // temper line
      if (!hafted && ad <= 1 && y > VPC * 1.2 && y < GY * 0.72 && r >= 4.5) c = dark; // fuller
      if (((y + dx * 1.6) % 46 + 46) % 46 < 2 && t < 0.84) c = mixHex(c, 0xffffff, 0.3); // polish streak
      if (hafted && hw > 1.65 && (y % 9 === 0) && t < 0.7) c = deep; // hammered facets on heads
      const cr = sim.cracks[col] || 0;
      const crack = cr > 0 && r >= 2 && ((y % VPC === 2 && dx === -1) || (y % VPC === 3 && dx === 0) || (y % VPC === 4 && dx === 1) || (cr > 1 && y % VPC === 1 && dx === 2));
      for (let z = cz - ht; z <= cz + ht; z++) {
        const face = z === cz - ht || z === cz + ht;
        let cc = c;
        if (crack && face) cc = 0x1a1414;
        if (veinC && face && ht >= 1 && !crack && y > 3) {
          // a glowing inlay: a wavy line down the spine with little branches
          const wave = Math.sin(y * 0.33 + (z < cz ? 0 : 1.7)) * Math.min(r * 0.32, 2.4);
          const branch = (y % 17 < 4) && Math.abs(dx - wave - Math.sign(wave || 1) * (y % 17)) < 0.7;
          if (Math.abs(dx - wave) < 0.75 || branch) { veins.set(cx + dx, y, z, veinC); continue; }
        }
        g.set(cx + dx, y, z, cc);
      }
    }
  }
  const mat = voxelMaterial('toon', { unique: true, emissive: 0x000000 });
  const blade = voxelMesh(g, { pivot: [cx + 0.5, 0, GZ / 2], scale: VW, material: mat, greedy: true });
  const group = new THREE.Group();
  group.add(blade);
  let veinMat = null;
  if (veinC) {
    veinMat = voxelMaterial('basic', { unique: true });
    const vm = voxelMesh(veins, { pivot: [cx + 0.5, 0, GZ / 2], scale: VW, material: veinMat, outline: false, greedy: true });
    group.add(vm);
  }
  // ---- hilt
  const fit = sim.fittings();
  const gripV = Math.round(fit.grip * VPC);
  const HW = Math.max(GX + 14, 30);
  const hg = new VoxelGrid(HW, gripV + 12, 11);
  const hcx = Math.floor(HW / 2), hcz = 5;
  const leather = 0x5a3420, leatherDk = 0x3a2214, wood = 0x6a4424, woodDk = 0x4a2e18;
  const guardC = sim.metal === 'iron' || sim.metal === 'steel' ? 0xc98a3a : shade(mc, 0.85);
  const gy = gripV + 4; // guard base row
  const round = (y0, y1, rad, fn) => {
    for (let y = y0; y < y1; y++) for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > rad + 0.2) continue;
      const c = fn(y, dx, dz, d);
      if (c !== undefined && c !== -1) hg.set(hcx + dx, y, hcz + dz, c);
    }
  };
  if (hafted) {
    // wooden haft with grain, two leather wraps and an iron collar
    round(2, gy + 2, 2.4, (y, dx, dz) => {
      const wrap = (y > gy - 10 && y < gy - 4) || (y > gripV * 0.35 && y < gripV * 0.35 + 6);
      if (wrap) return (y + Math.round(Math.atan2(dz, dx) * 2)) % 3 === 0 ? leatherDk : leather;
      return (Math.round(Math.atan2(dz, dx) * 3 + y * 0.15) % 4 === 0) ? woodDk : wood;
    });
    round(gy - 1, gy + 5, 3.3, (y) => (y === gy + 4 ? shade(mc, 0.95) : shade(mc, 0.78))); // collar
    round(0, 3, 3, (y) => (y === 0 ? shade(mc, 0.6) : shade(mc, 0.75))); // butt cap
  } else {
    // crossguard with flared quillons, a ricasso block and the grip with a diagonal wrap
    const gl = Math.min(HW - 2, Math.round(maxHW * RW * 2 + 12));
    for (let dx = -Math.floor(gl / 2); dx <= Math.floor(gl / 2); dx++) {
      const end = Math.abs(dx) > gl / 2 - 3;
      const y0 = gy + (end ? 1 : 0), h = end ? 4 : 4;
      for (let y = y0; y < y0 + h; y++) for (let dz = -2; dz <= 2; dz++) {
        const top = y === y0 + h - 1;
        hg.set(hcx + dx, y, hcz + dz, top ? shade(guardC, 1.2) : dz === -2 || dz === 2 ? shade(guardC, 0.85) : guardC);
      }
    }
    hg.box(hcx - 3, gy + 4, hcz - 2, 7, 3, 5, (x, y) => (y === gy + 6 ? shade(guardC, 1.15) : guardC));
    if (opts.gem) { hg.set(hcx, gy + 2, hcz - 3, opts.gemColor ?? 0xe02a3a); hg.set(hcx, gy + 2, hcz + 3, opts.gemColor ?? 0xe02a3a); }
    round(3, gy, 2.3, (y, dx, dz) => {
      const a = Math.atan2(dz, dx);
      const spiral = (y + Math.round(a * 1.9)) % 4;
      if (y === gy - 1 || y === 3) return shade(guardC, 0.9); // ferrules
      return spiral === 0 ? leatherDk : spiral === 2 ? shade(leather, 1.15) : leather;
    });
    if (sim.type === 'rapier') {
      for (let a = 0; a <= Math.PI; a += 0.12) hg.set(hcx + Math.round(Math.cos(a) * 7 + 0), Math.round(gy - Math.sin(a) * (gy - 3)), hcz, guardC);
    }
  }
  const hilt = voxelMesh(hg, { pivot: [hcx + 0.5, gy + 6, hcz + 0.5], scale: VW, greedy: true });
  group.add(hilt);
  // pommel (separate so the balance step can grow it)
  const pg = new VoxelGrid(11, 11, 11);
  pg.ellipsoid(5.5, 5.5, 5.5, 5, 4.6, 4.2, (x, y, z, dx, dy) => (dy > 0.5 ? mixHex(mc, 0xffffff, 0.3) : dy < -0.5 ? shade(mc, 0.7) : (x + y) % 3 === 0 ? shade(mc, 0.88) : mc));
  if (opts.gem) for (const z of [0, 1, 9, 10]) pg.box(4, 4, z, 3, 3, 1, (x, y) => (x === 4 && y === 6 ? 0xffffff : opts.gemColor ?? 0xe02a3a));
  const pommel = voxelMesh(pg, { pivot: [5.5, 5.5, 5.5], scale: VW, greedy: true });
  const hiltLen = (gy + 6) * VW;
  pommel.position.y = -hiltLen - 2 * VW;
  group.add(pommel);
  // head cap (balance weight for head-heavy weapons)
  const cg = new VoxelGrid(11, 8, 11);
  cg.box(0, 0, 0, 11, 4, 11, (x, y) => (y === 3 ? shade(mc, 0.85) : shade(mc, 0.68)));
  cg.box(2, 4, 2, 7, 2, 7, shade(mc, 0.8)); cg.box(4, 6, 4, 3, 2, 3, edge);
  const headCap = voxelMesh(cg, { pivot: [5.5, 0, 5.5], scale: VW, greedy: true });
  headCap.position.y = GY * VW - 2 * VW;
  headCap.visible = false;
  group.add(headCap);
  return { group, blade, hilt, pommel, headCap, mat, veinMat, length: GY * VW, hiltLength: hiltLen + 4 * VW, hafted };
}

// 3D views of the blade: the hot billet as columns (fire + anvil), the dotted target outline,
// and the finished weapon as a voxel model (balance step + reveal).
import * as THREE from 'three';
import { VoxelGrid, voxelMesh, voxelMaterial } from '../gfx/Voxel.js';
import { METALS, INFUSIONS } from '../data/weapons.js';
import { mixHex, shade } from '../core/util.js';
import { applyHeat } from './blackbody.js';
import { HAFTED } from './bladeSim.js';

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
    for (let i = 0; i < sim.maxLen; i++) {
      const mat = voxelMaterial('toon', { unique: true, vertexColors: false, color: this.base, emissive: 0x000000 });
      const m = new THREE.Mesh(unitBox, mat);
      m.visible = false;
      m.layers.enable(1);
      this.group.add(m);
      this.cols.push({ mesh: m, mat, disp: sim.w[i] ?? 0, squash: 0, cracks: [] });
    }
    // tang: a stub the tongs hold
    const tm = voxelMaterial('toon', { unique: true, vertexColors: false, color: this.base, emissive: 0x000000 });
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
    const mat = new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true, opacity: 0.95 });
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
    for (const c of this.cols) c.mat.dispose();
    this.tangMat.dispose();
    this.crackMat.dispose();
    this.frame.userData.mat.dispose();
    this.ghostMat.dispose();
    if (this.dots) { this.dots.geometry.dispose(); this.dots.material.dispose(); }
  }
}

// ---------------------------------------------------------------- finished weapon model
const VW = COL / 3; // weapon model voxel size: 3 voxels per column, ~1 voxel per half-width unit

const INF_VEIN = {
  bioxide: 0x9af4ff, magmaite: 0xffa040, frostite: 0xe8fcff, gravium: 0xd8b8ff, voidstone: 0x9a5aff,
  lumite: 0xb8ffb0, obsidian_shard: 0x8a6ab0, echo_crystal: 0xbfe6ff, sunstone: 0xffe066,
};

/**
 * Voxel model of the finished weapon, blade along +y from the guard at y = 0 (hilt below),
 * broad faces toward ±z. opts: { infusion, gem, pommelScale }.
 * Returns { group, blade, pommel, headCap, mat, veinMat, length, hiltLength }.
 */
export function buildWeapon(sim, opts = {}) {
  const metal = METALS[sim.metal];
  const mc = metal.color;
  const w = sim.w.slice(0, sim.length);
  const L = w.length;
  const maxHW = Math.max(2, ...w.map((x) => Math.round(x)));
  const hafted = HAFTED.has(sim.type);
  const GX = maxHW * 2 + 3, GY = L * 3 + 1, GZ = 3;
  const g = new VoxelGrid(GX, GY, GZ);
  const veins = new VoxelGrid(GX, GY, 1);
  const cx = Math.floor(GX / 2);
  const edge = mixHex(mc, 0xffffff, 0.38), dark = shade(mc, 0.78), spine = shade(mc, 0.9);
  const veinC = opts.infusion ? INF_VEIN[opts.infusion] ?? INFUSIONS[opts.infusion]?.color : null;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < L; i++) {
    for (let k = 0; k < 3; k++) {
      const y = i * 3 + k;
      // smooth the half-width along the column for nicer silhouettes
      const a = w[i], b = i + 1 < L ? w[i + 1] : w[i] * 0.4;
      const hw = Math.max(0.4, a + (b - a) * (k / 3) * 0.5);
      const r = Math.round(hw);
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const isEdge = Math.abs(dx) === r && r > 0;
        for (let z = 0; z < GZ; z++) {
          const thin = Math.abs(dx) > r * 0.55 && z !== 1;
          if (thin && isEdge) continue; // bevel: edges are one voxel thick
          let c = isEdge ? edge : z === 1 ? spine : mc;
          if (!hafted && dx === 0 && z !== 1 && y > 2 && i < L * 0.7 && r >= 2) c = dark; // fuller
          const cr = sim.cracks[i] || 0;
          if (cr > 0 && z !== 1 && r >= 2 && ((k === 1 && dx === -1) || (k === 2 && dx === 0) || (cr > 1 && k === 0 && dx === 1))) c = 0x1a1414;
          g.set(x, y, z, c);
        }
        if (veinC && !isEdge && Math.abs(dx) <= Math.max(0, r - 1) && rnd() < 0.2) veins.set(x, y, 0, veinC);
      }
    }
  }
  const mat = voxelMaterial('toon', { unique: true, emissive: 0x000000 });
  const blade = voxelMesh(g, { pivot: [cx + 0.5, 0, GZ / 2], scale: VW, material: mat });
  const group = new THREE.Group();
  group.add(blade);
  let veinMat = null;
  if (veinC) {
    veinMat = voxelMaterial('basic', { unique: true });
    const vm = voxelMesh(veins, { pivot: [cx + 0.5, 0, 0], scale: VW, material: veinMat, outline: false });
    vm.scale.z = 0.06;
    vm.position.z = (GZ / 2) * VW + 0.0005;
    const vm2 = vm.clone();
    vm2.position.z = -vm.position.z - 0.06 * VW;
    group.add(vm, vm2);
  }
  // ---- hilt
  const fit = sim.fittings();
  const gripV = Math.round(fit.grip * 3);
  const hg = new VoxelGrid(GX + 6, gripV + 4, 5);
  const hcx = Math.floor((GX + 6) / 2);
  const wood = 0x6a4424, wrap = 0x3a2214, leather = 0x5a3420;
  const guardC = sim.metal === 'iron' || sim.metal === 'steel' ? 0xc98a3a : shade(mc, 0.85);
  if (hafted) {
    for (let y = 0; y < gripV; y++) hg.box(hcx - 1, y + 2, 1, 3, 1, 3, (y % 4 === 0 ? 0x4a2e18 : wood));
    hg.box(hcx - 2, gripV + 1, 0, 5, 2, 5, shade(mc, 0.8)); // collar/socket
    hg.box(hcx - 1, 0, 1, 3, 2, 3, shade(mc, 0.75)); // butt cap
  } else {
    const gl = Math.min(GX + 6, maxHW * 2 + 7);
    hg.box(hcx - Math.floor(gl / 2), gripV + 1, 1, gl, 2, 3, (x, y) => (y === gripV + 2 ? shade(guardC, 1.15) : guardC));
    for (let y = 1; y < gripV + 1; y++) hg.box(hcx - 1, y, 1, 3, 1, 3, (x, yy, z) => ((x + yy + z) % 3 === 0 ? wrap : leather));
    if (sim.type === 'rapier') {
      for (let a = 0; a < Math.PI; a += 0.25) hg.set(hcx + Math.round(Math.cos(a) * 4), gripV + 1 - Math.round(Math.sin(a) * 4), 0, guardC);
    }
  }
  const hilt = voxelMesh(hg, { pivot: [hcx + 0.5, gripV + 3, 2.5], scale: VW });
  group.add(hilt);
  // pommel (separate so the balance step can grow it)
  const pg = new VoxelGrid(5, 5, 5);
  pg.box(0, 1, 1, 5, 3, 3, mc); pg.box(1, 0, 1, 3, 5, 3, mc); pg.box(1, 1, 0, 3, 3, 5, shade(mc, 0.9));
  if (opts.gem) { pg.set(2, 2, 0, opts.gemColor ?? 0xe02a3a); pg.set(2, 2, 4, opts.gemColor ?? 0xe02a3a); }
  const pommel = voxelMesh(pg, { pivot: [2.5, 2.5, 2.5], scale: VW });
  const hiltLen = (gripV + 3) * VW;
  pommel.position.y = -hiltLen - 1.2 * VW;
  group.add(pommel);
  // head cap (balance weight for head-heavy weapons)
  const cg = new VoxelGrid(5, 4, 5);
  cg.box(0, 0, 0, 5, 2, 5, shade(mc, 0.7)); cg.box(1, 2, 1, 3, 1, 3, shade(mc, 0.8)); cg.set(2, 3, 2, edge);
  const headCap = voxelMesh(cg, { pivot: [2.5, 0, 2.5], scale: VW });
  headCap.position.y = GY * VW - 1 * VW;
  headCap.visible = false;
  group.add(headCap);
  return { group, blade, hilt, pommel, headCap, mat, veinMat, length: GY * VW, hiltLength: hiltLen + 2.5 * VW, hafted };
}

// Streams chunks around the player: generates and meshes the nearest first within a per-frame
// time budget, remeshes dug chunks right away, culls by view direction and fog distance, and
// unloads far chunks (their edits live on in the world's edit store).
import * as THREE from 'three';
import { CS } from './Generator.js';
import { VOX } from './materials.js';
import { meshChunk } from './Mesher.js';
import { makeTerrainMaterial, makeFluidMaterial } from './TerrainMaterial.js';

const CM = CS / VOX; // chunk size in meters (4)

export class TerrainView {
  constructor(scene3, world, U) {
    this.w = world;
    this.root = new THREE.Group();
    scene3.add(this.root);
    this.mat = makeTerrainMaterial(U);
    this.fluidMat = makeFluidMaterial(U);
    this.radius = 5; // chunks
    this.keepRadius = 7;
    this.queue = [];
    this.stats = { gen: 0, mesh: 0, tris: 0 };
    world.onUnload = (ch) => this.drop(ch);
  }

  /** Make sure the chunks within r of a point exist and are meshed (blocking; used on load). */
  warm(x, y, z, r = 2) {
    const cx = Math.floor(x / CM), cy = Math.floor(y / CM), cz = Math.floor(z / CM);
    for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) this.w.ensure(cx + dx, cy + dy, cz + dz);
    for (let dz = -r + 1; dz < r; dz++) for (let dy = -r + 1; dy < r; dy++) for (let dx = -r + 1; dx < r; dx++) {
      const ch = this.w.chunk(cx + dx, cy + dy, cz + dz);
      if (ch && ch.dirty) this.build(ch);
    }
  }

  /** Per frame: stream around (x, y, z), spending at most budgetMs. */
  update(x, y, z, budgetMs = 6) {
    const t0 = performance.now();
    const w = this.w;
    const pcx = Math.floor(x / CM), pcy = Math.floor(y / CM), pcz = Math.floor(z / CM);
    // 1. dug chunks near the player first (they must update this frame)
    for (const ch of w.chunks.values()) {
      if (!ch.dirty || !ch.mesh && !ch.wasMeshed) continue;
      if (Math.abs(ch.cx - pcx) > 2 || Math.abs(ch.cy - pcy) > 2 || Math.abs(ch.cz - pcz) > 2) continue;
      this.build(ch);
    }
    // 2. new chunks, nearest first (re-sorted when the player crosses a chunk border)
    const key = pcx + ',' + pcy + ',' + pcz;
    if (key !== this.lastKey) {
      this.lastKey = key;
      const R = this.radius, list = [];
      for (let dz = -R; dz <= R; dz++) for (let dy = -R + 1; dy <= R - 1; dy++) for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dy * dy * 1.4 + dz * dz;
        if (d2 > R * R) continue;
        list.push([d2, pcx + dx, pcy + dy, pcz + dz]);
      }
      list.sort((a, b) => a[0] - b[0]);
      this.queue = list;
      this.qi = 0;
      // unload far chunks
      for (const ch of [...w.chunks.values()]) {
        const dx = ch.cx - pcx, dy = ch.cy - pcy, dz = ch.cz - pcz;
        if (dx * dx + dy * dy + dz * dz > this.keepRadius * this.keepRadius) w.unload(ch);
      }
    }
    while (this.qi < this.queue.length && performance.now() - t0 < budgetMs) {
      const [, cx, cy, cz] = this.queue[this.qi];
      // a chunk can only be meshed once its neighbours exist (faces and AO read them)
      let ready = true;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!w.chunk(cx + dx, cy + dy, cz + dz)) { w.ensure(cx + dx, cy + dy, cz + dz); this.stats.gen++; ready = false; }
        if (performance.now() - t0 > budgetMs) break;
      }
      if (!ready) continue;
      const ch = w.chunk(cx, cy, cz);
      if (ch.dirty) this.build(ch);
      this.qi++;
    }
    // remaining dirty chunks in range (neighbours of fresh ones), as budget allows
    if (performance.now() - t0 < budgetMs) {
      for (const ch of w.chunks.values()) {
        if (!ch.dirty || !ch.wasMeshed) continue;
        this.build(ch);
        if (performance.now() - t0 > budgetMs) break;
      }
    }
  }

  build(ch) {
    const r = meshChunk(this.w, ch);
    ch.dirty = false;
    ch.wasMeshed = true;
    this.stats.mesh++;
    const ox = (ch.cx * CS) / VOX, oy = (ch.cy * CS) / VOX, oz = (ch.cz * CS) / VOX;
    const set = (prop, geo, mat, order) => {
      let m = ch[prop];
      if (!geo) { if (m) { this.root.remove(m); m.geometry.dispose(); ch[prop] = null; } return; }
      if (!m) {
        m = new THREE.Mesh(geo, mat);
        m.position.set(ox, oy, oz);
        m.scale.setScalar(1 / VOX);
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        m.renderOrder = order;
        m.frustumCulled = true;
        this.root.add(m);
        ch[prop] = m;
      } else { m.geometry.dispose(); m.geometry = geo; }
    };
    set('mesh', r.solid, this.mat, 0);
    set('fluidMesh', r.fluid, this.fluidMat, 5);
  }

  drop(ch) {
    for (const prop of ['mesh', 'fluidMesh']) if (ch[prop]) { this.root.remove(ch[prop]); ch[prop].geometry.dispose(); ch[prop] = null; }
  }

  /** Hide chunks behind the fog. */
  cull(x, y, z, maxDist) {
    const R2 = (maxDist + CM) * (maxDist + CM);
    let tris = 0;
    for (const ch of this.w.chunks.values()) {
      const cx = (ch.cx + 0.5) * CM, cy = (ch.cy + 0.5) * CM, cz = (ch.cz + 0.5) * CM;
      const vis = (cx - x) ** 2 + (cy - y) ** 2 + (cz - z) ** 2 < R2;
      if (ch.mesh) { ch.mesh.visible = vis; if (vis) tris += ch.mesh.geometry.index.count / 3; }
      if (ch.fluidMesh) ch.fluidMesh.visible = vis;
    }
    this.stats.tris = tris;
  }

  dispose() {
    for (const ch of this.w.chunks.values()) this.drop(ch);
    this.mat.dispose(); this.fluidMat.dispose();
  }
}

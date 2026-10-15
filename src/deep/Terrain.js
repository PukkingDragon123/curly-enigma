// Streams chunks around the player: generates and meshes the nearest first within a per-frame
// time budget, remeshes dug chunks right away, culls by view direction and fog distance, and
// unloads far chunks (their edits live on in the world's edit store). With a worker pool
// (world.pool, src/deep/ChunkPool.js) generation and greedy meshing of new chunks happen off the
// main thread; dug chunks next to the player are still remeshed here, the same frame.
import * as THREE from 'three';
import { CS } from './Generator.js';
import { VOX } from './materials.js';
import { meshChunk, meshChunkFluid, fillPad, rawToGeometry, PAD, FLUID } from './Mesher.js';
import { makeTerrainMaterial, makeFluidMaterial } from './TerrainMaterial.js';

const CM = CS / VOX; // chunk size in meters

function hasFluid(v) {
  for (let i = 0; i < v.length; i++) if (FLUID[v[i]]) return true;
  return false;
}

export class TerrainView {
  constructor(scene3, world, U) {
    this.w = world;
    this.root = new THREE.Group();
    scene3.add(this.root);
    this.mat = makeTerrainMaterial(U);
    this.fluidMat = makeFluidMaterial(U);
    this.radius = Math.round(16 / CM); // chunks (16 m)
    this.keepRadius = Math.round(20 / CM);
    this.queue = [];
    this.stats = { gen: 0, mesh: 0, tris: 0 };
    this.jobs = 0;
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
      if (!ch.dirty || !ch.mesh && !ch.wasMeshed || !ch.urgent && w.pool?.ok) continue;
      if (Math.abs(ch.cx - pcx) > 3 || Math.abs(ch.cy - pcy) > 3 || Math.abs(ch.cz - pcz) > 3) continue;
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
    // walk the queue from the nearest unfinished chunk; with workers, chunks still waiting on
    // their neighbours are skipped (not waited on) so the pool stays busy
    const pool = w.pool && w.pool.ok ? w.pool : null;
    let j = this.qi, full = false;
    while (j < this.queue.length && !full && performance.now() - t0 < budgetMs && j - this.qi < 600) {
      const e = this.queue[j];
      if (e[4]) { if (j === this.qi) this.qi++; j++; continue; }
      const cx = e[1], cy = e[2], cz = e[3];
      // a chunk can only be meshed once its neighbours exist (faces and AO read them)
      let ready = true;
      for (let dz = -1; dz <= 1 && !full; dz++) for (let dy = -1; dy <= 1 && !full; dy++) for (let dx = -1; dx <= 1; dx++) {
        let n = w.chunk(cx + dx, cy + dy, cz + dz);
        if (!n) {
          n = w.request(cx + dx, cy + dy, cz + dz);
          if (!n) { full = true; break; } // the pool is busy: next frame
          this.stats.gen++;
        }
        if (n.pending) ready = false;
        if (!pool && performance.now() - t0 > budgetMs) { ready = false; full = true; break; }
      }
      if (full) break;
      if (ready) {
        const ch = w.chunk(cx, cy, cz);
        if (ch.dirty && !ch.virtual && !this.mesh(ch, pool)) break;
        e[4] = true;
        if (j === this.qi) this.qi++;
      }
      j++;
    }
    // remaining dirty chunks in range (neighbours of fresh ones), as budget allows
    if (performance.now() - t0 < budgetMs) {
      for (const ch of w.chunks.values()) {
        if (!ch.dirty || !ch.wasMeshed || ch.pending) continue;
        if (!this.mesh(ch, pool)) break;
        if (performance.now() - t0 > budgetMs) break;
      }
    }
  }

  /** Mesh a chunk: in a worker when there is a pool, else right here. False when the pool is full. */
  mesh(ch, pool) {
    if (!pool) { this.build(ch); return true; }
    const pad = fillPad(this.w, ch, new Uint8Array(PAD * PAD * PAD));
    const id = ++this.jobs;
    if (!pool.send({ t: 'mesh', pad }, [pad.buffer], (m) => this.meshed(ch, id, m))) return false;
    ch.meshJob = id;
    ch.dirty = false;
    ch.wasMeshed = true;
    this.stats.mesh++;
    return true;
  }

  /** A worker's mesh came back (ignored if the chunk was rebuilt or unloaded meanwhile). */
  meshed(ch, id, m) {
    if (ch.meshJob !== id) return;
    ch.meshJob = 0;
    if (this.w.chunks.get(ch.key) !== ch || !ch.vox) return;
    if (!m) { ch.dirty = true; return; } // the worker died: redo it here
    this.set(ch, 'mesh', m.raw ? rawToGeometry(m.raw) : null, this.mat, 0);
    this.set(ch, 'fluidMesh', hasFluid(ch.vox) ? meshChunkFluid(this.w, ch) : null, this.fluidMat, 5);
  }

  build(ch) {
    if (ch.virtual) { ch.dirty = false; return; } // solid rock all through: nothing to draw
    const r = meshChunk(this.w, ch);
    ch.dirty = false;
    ch.wasMeshed = true;
    ch.meshJob = 0; // a worker mesh still on its way is older than this one
    ch.urgent = false;
    this.stats.mesh++;
    this.set(ch, 'mesh', r.solid, this.mat, 0);
    this.set(ch, 'fluidMesh', r.fluid, this.fluidMat, 5);
  }

  set(ch, prop, geo, mat, order) {
    let m = ch[prop];
    if (!geo) { if (m) { this.root.remove(m); m.geometry.dispose(); ch[prop] = null; } return; }
    if (!m) {
      m = new THREE.Mesh(geo, mat);
      m.position.set((ch.cx * CS) / VOX, (ch.cy * CS) / VOX, (ch.cz * CS) / VOX);
      m.scale.setScalar(1 / VOX);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.renderOrder = order;
      m.frustumCulled = true;
      this.root.add(m);
      ch[prop] = m;
    } else { m.geometry.dispose(); m.geometry = geo; }
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

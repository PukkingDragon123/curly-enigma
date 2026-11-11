// The floors you lay in your alcoves (build mode's Floors tab): the cave's own floor is the rock's
// packed earth (caveShell.js), so only the tiles you've painted something else on (planks,
// flagstones, moss, carpet...) get a floor here, at 32 texels per tile with real relief and shine
// (iso/homeFloor.js), laid a hair over the earth. Painting a tile repaints it and redraws which tiles
// are covered. Stands in for the old room shell (shell.js) where the scene still asks it things:
// no lights, fungi, hearth or poster of its own any more.
import * as THREE from 'three';
import { paintHomeFloor, repaintHomeTile } from '../iso/homeFloor.js';
import { nookAtTile } from './nooks.js';

export class NookFloor {
  /** room: the tile-unit group (scaled to meters). */
  constructor(room, world) {
    this.room = room;
    this.world = world;
    this.fungi = [];
    this.strings = [];
    this.hearth = null;
    this.hearthBoxes = [];
    this.poster = null;
    this.decorMeshes = [];
    this.steps = {};
    this.ms = 0;
  }

  /** W × D tiles (the whole grid), floorMap { "x,y": floorId }, set: the open alcoves. */
  async build(W, D, floorMap, set) {
    const t0 = performance.now();
    this.W = W; this.D = D;
    this.map = floorMap;
    this.set = set;
    this.floor = paintHomeFloor(W, D, floorMap);
    const tex = this.floor.tex;
    for (const t of [tex.map, tex.normalMap]) { t.generateMipmaps = true; t.minFilter = THREE.NearestMipmapNearestFilter; t.needsUpdate = true; }
    this.mat = new THREE.MeshPhongMaterial({ map: tex.map, normalMap: tex.normalMap, specularMap: tex.specularMap, specular: 0x8a7e70, shininess: 24, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.refresh();
    this.ms = performance.now() - t0;
    this.steps = { floor: Math.round(this.ms) };
  }

  /** The covered tiles as one mesh (rows of painted tiles merged). */
  refresh() {
    const { W, D } = this;
    const pos = [], uv = [], nor = [], idx = [];
    const painted = (x, y) => { const id = this.map[`${x},${y}`]; return id && id !== 'floor_dirt' && nookAtTile(x, y, this.set); };
    for (let y = 0; y < D; y++) {
      let x = 0;
      while (x < W) {
        if (!painted(x, y)) { x++; continue; }
        let x1 = x + 1;
        while (x1 < W && painted(x1, y)) x1++;
        const b = pos.length / 3, Y = 0.004 / 0.5;
        for (const [px, pz] of [[x, y], [x1, y], [x1, y + 1], [x, y + 1]]) { pos.push(px, Y, pz); uv.push(px / W, 1 - pz / D); nor.push(0, 1, 0); }
        idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
        x = x1;
      }
    }
    if (this.floorMesh) { this.room.remove(this.floorMesh); this.floorMesh.geometry.dispose(); this.floorMesh = null; }
    if (!idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, this.mat);
    this.room.add(m);
    this.floorMesh = m;
  }

  paintTile(x, y, id) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.D) return;
    repaintHomeTile(this.floor.S, this.floor.tex, x, y, id);
    this.refresh();
  }

  /** (No wall styles in a cave: the rock is the rock.) */
  setWall() {}
  /** (No lamps of its own: your lights are your furniture.) */
  lightsM() { return []; }

  dispose() {
    if (this.floorMesh) { this.room.remove(this.floorMesh); this.floorMesh.geometry.dispose(); }
    this.mat?.dispose();
    const tex = this.floor?.tex;
    if (tex) for (const t of Object.values(tex)) t?.dispose?.();
  }
}

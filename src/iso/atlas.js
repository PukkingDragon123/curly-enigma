// One texture + one mesh for all the static flat pixel art in a scene (shop signs,
// posters, notices): canvases are shelf-packed into an atlas and every quad is merged
// into a single lit mesh with vertex colors (so the scene's baked light applies too).
import * as THREE from 'three';
import { pixelTexture } from '../gfx/PixelArt.js';

const _m = new THREE.Matrix4();

export class SignSheet {
  constructor(size = 1024) {
    this.size = size;
    this.items = [];
  }

  /**
   * Add a PixelCanvas drawn on a quad of w×h world units with a world matrix (or an Object3D
   * whose matrixWorld places it; the quad faces +z of that frame).
   */
  add(pc, w, h, frame) {
    this.items.push({ pc, w, h, m: frame.isObject3D ? (frame.updateMatrixWorld(true), frame.matrixWorld.clone()) : frame.clone() });
  }

  /** Pack and build the mesh. Returns null when empty. */
  build() {
    if (!this.items.length) return null;
    // shelf packing, tallest first
    const order = [...this.items].sort((a, b) => b.pc.h - a.pc.h);
    let x = 0, y = 0, row = 0;
    const S = this.size;
    for (const it of order) {
      const w = it.pc.w + 2, h = it.pc.h + 2;
      if (x + w > S) { x = 0; y += row; row = 0; }
      it.ax = x + 1; it.ay = y + 1;
      x += w;
      row = Math.max(row, h);
    }
    const H = Math.min(S, 1 << Math.ceil(Math.log2(Math.max(16, y + row))));
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    for (const it of order) ctx.drawImage(it.pc.commit ? it.pc.commit() : it.pc.canvas, it.ax, it.ay);
    const tex = pixelTexture(canvas);
    const pos = [], nor = [], uv = [], col = [], idx = [];
    let v = 0;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    for (const it of this.items) {
      nm.getNormalMatrix(it.m);
      n.set(0, 0, 1).applyMatrix3(nm).normalize();
      const u0 = it.ax / S, u1 = (it.ax + it.pc.w) / S, v1 = 1 - it.ay / H, v0 = 1 - (it.ay + it.pc.h) / H;
      const corners = [[-it.w / 2, -it.h / 2, u0, v0], [it.w / 2, -it.h / 2, u1, v0], [it.w / 2, it.h / 2, u1, v1], [-it.w / 2, it.h / 2, u0, v1]];
      for (const [cx, cy, cu, cv] of corners) {
        p.set(cx, cy, 0).applyMatrix4(it.m);
        pos.push(p.x, p.y, p.z);
        nor.push(n.x, n.y, n.z);
        uv.push(cu, cv);
        col.push(1, 1, 1);
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat);
    this.items = [];
    return mesh;
  }
}

export { _m };

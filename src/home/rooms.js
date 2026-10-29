// Drawing only what you can see: the camp (one open hollow) and your nook are shown only while the
// camera is in them or can see into the other through the arch between them (plan.js portals()),
// the view narrowed to the arch's patch of the screen. Cheap, and it keeps the triangles drawn to
// the part of the home you're in. (Rooms seen through a small opening skip the outline pass.)
import * as THREE from 'three';
import { portals } from './plan.js';
import { ARCH } from './units.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

/** A room seen through an opening keeps its ink outlines only while it fills this much of the screen (NDC area, of 4). */
const INK_AREA = 0.6;

export class RoomCull {
  /** s: the HomeScene (cave, shell, inBedroom). */
  constructor(s) {
    this.s = s;
    this.links = new Map();
    for (const p of portals()) {
      const box = new THREE.Box3(new THREE.Vector3(p.box[0], p.box[1], p.box[2]), new THREE.Vector3(p.box[3], p.box[4], p.box[5]));
      for (const [a, b] of [[p.a, p.b], [p.b, p.a]]) { if (!this.links.has(a)) this.links.set(a, []); this.links.get(a).push({ to: b, box }); }
    }
    this.groups = new Map([['camp', Object.values(s.cave.roomMeshes || {}).flat()]]);
    const sh = s.shell;
    this.groups.set('bedroom', [sh.wallMesh, sh.ceilMesh, sh.floorMesh, ...(sh.decorMeshes || [])].filter(Boolean));
    for (const list of this.groups.values()) for (const m of list) m.userData.ink = m.layers.isEnabled(LAYER_OUTLINE);
    this.ink = new Set();
    this.frustum = new THREE.Frustum();
    this.m = new THREE.Matrix4();
    this.seen = new Set();
    this.key = '';
    this.enabled = true;
  }

  /** The parts the camera stands in (none: show everything). */
  roomsAt(p) {
    if (this.s.inBedroom?.(p.x, p.z)) return p.z < 0.45 ? ['bedroom', 'camp'] : ['bedroom'];
    if (Math.abs(p.x - ARCH.x) < 0.6 && p.z > -1.3) return ['camp', 'bedroom'];
    return ['camp'];
  }

  update(camera) {
    const seen = this.seen;
    seen.clear();
    const start = this.enabled ? this.roomsAt(camera.position) : null;
    if (!start) { for (const k of this.groups.keys()) seen.add(k); }
    else {
      camera.updateMatrixWorld();
      this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.m);
      // through each opening only the part of the screen it covers (narrowed room by room): a room
      // is drawn when some opening chain to it is on screen
      const rects = new Map();
      for (const id of start) rects.set(id, [-1, -1, 1, 1]);
      const queue = [...start];
      let n = 0;
      while (queue.length && n++ < 80) {
        const id = queue.shift(), r = rects.get(id);
        for (const l of this.links.get(id) || []) {
          if (start.includes(l.to) || !this.frustum.intersectsBox(l.box)) continue;
          const pr = this.rectOf(l.box);
          const x0 = Math.max(r[0], pr[0]), y0 = Math.max(r[1], pr[1]), x1 = Math.min(r[2], pr[2]), y1 = Math.min(r[3], pr[3]);
          if (x0 >= x1 || y0 >= y1) continue;
          const cur = rects.get(l.to);
          if (!cur) { rects.set(l.to, [x0, y0, x1, y1]); queue.push(l.to); }
          else if (x0 < cur[0] || y0 < cur[1] || x1 > cur[2] || y1 > cur[3]) {
            cur[0] = Math.min(cur[0], x0); cur[1] = Math.min(cur[1], y0); cur[2] = Math.max(cur[2], x1); cur[3] = Math.max(cur[3], y1);
            queue.push(l.to);
          }
        }
      }
      for (const id of rects.keys()) seen.add(id);
      // the outline pass draws everything outlined again: rooms glimpsed through a small opening go without
      this.ink.clear();
      for (const [id, r] of rects) if (start.includes(id) || (r[2] - r[0]) * (r[3] - r[1]) > INK_AREA) this.ink.add(id);
    }
    const key = [...seen].sort().join() + '|' + (start ? [...this.ink].sort().join() : '*');
    if (key === this.key) return;
    this.key = key;
    for (const [id, list] of this.groups) {
      const on = seen.has(id), ink = !start || this.ink.has(id);
      for (const m of list) {
        m.visible = on;
        if (m.userData.ink) { if (ink) m.layers.enable(LAYER_OUTLINE); else m.layers.disable(LAYER_OUTLINE); }
      }
    }
  }

  /** The screen rectangle (NDC) a box covers; the whole screen when it reaches behind the camera. */
  rectOf(b) {
    const e = this.m.elements;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? b.max.x : b.min.x, y = i & 2 ? b.max.y : b.min.y, z = i & 4 ? b.max.z : b.min.z;
      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (w <= 0.05) return [-1, -1, 1, 1];
      const px = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w, py = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    return [x0, y0, x1, y1];
  }

  /** Show everything (and stop culling until enabled again). */
  showAll() { this.enabled = false; this.key = ''; for (const list of this.groups.values()) for (const m of list) { m.visible = true; if (m.userData.ink) m.layers.enable(LAYER_OUTLINE); } }
}

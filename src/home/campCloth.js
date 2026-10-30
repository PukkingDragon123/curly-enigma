// The cloth in Old Star's camp (src/gfx/cloth.js): the sacking over his shack's doorway (you, he and
// Nugget push it aside walking through; the draught from the hole stirs it) and a rag of blanket
// tacked over the shack's window hole. Meters, in the scene (not the tile-scaled room).
import { Cloth, sackingTexture } from '../gfx/cloth.js';
import { SHACK } from './house.js';
import { HALL } from './units.js';

export function campCloths(scene) {
  const K = SHACK, Y = HALL.y;
  const dh = 1.22, dw = K.dw;
  const list = [];
  // the doorway: a sack split open and nailed to the rod, nearly to the floor
  const door = new Cloth({ w: dw * 0.98, h: dh - 0.1, nx: 11, ny: 15, tex: sackingTexture({ seed: 11 }), iters: 5, damping: 1.4 });
  door.placeCorner(K.x + K.dc - dw / 2 + dw * 0.01, Y + dh - 0.05, K.z + 0.07, 0);
  scene.add(door.mesh);
  list.push(door);
  // the window: an old blanket tacked on at its top corners only, a corner torn loose
  const wc = 0.72, ww = 0.42;
  const win = new Cloth({ w: ww + 0.06, h: 0.4, nx: 7, ny: 7, tex: sackingTexture({ w: 24, h: 24, base: [120, 92, 84], seed: 5 }), pins: [[0, 0], [1, 0], [2, 0], [3, 0]], iters: 4, damping: 1.8 });
  win.placeCorner(K.x + wc - ww / 2 - 0.03, Y + 1.1, K.z + 0.08, 0);
  scene.add(win.mesh);
  list.push(win);
  // a draught down from the hole: mostly out of the shack (+z), wandering
  const wind = (t) => [0.35 * Math.sin(t * 0.53) + 0.2 * Math.sin(t * 1.7), 0.55 + 0.45 * Math.sin(t * 0.81) * Math.sin(t * 0.37 + 1)];
  // let it settle before anyone sees it
  for (let i = 0; i < 90; i++) for (const c of list) c.update(1 / 60, [], i / 60, wind);
  return {
    list,
    /** colliders: [{ x, z, r, y0, y1 }] (m); only near the shack's front is anything simulated. */
    update(dt, colliders, time) {
      const me = colliders[0];
      for (const c of list) {
        // (out of sight round the camp: it hangs still)
        if (me && Math.hypot(me.x - c.mesh.position.x, me.z - c.mesh.position.z) > 7) continue;
        const near = colliders.filter((q) => Math.abs(q.x - c.mesh.position.x - 0.3) < 1.2 && Math.abs(q.z - c.mesh.position.z) < 1.2);
        c.update(dt, near, time, wind);
      }
    },
    dispose() { for (const c of list) { scene.remove(c.mesh); c.dispose(); } },
  };
}

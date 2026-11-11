// The cloth in Old Star's cave (src/gfx/cloth.js): what the cave's build jobs hang as `laundry`
// (house.js `drape`: his leather apron on its nail by the forge, the two panels of sacking across
// the neck of your sleeping alcove once it's dug: you and he push them aside walking through, the
// draught down the hole stirs them). One set, one draw call. Meters, in the scene (not the
// tile-scaled room).
import { Cloth, ClothSet, sackingTexture, laundryTexture, clothTexture } from '../gfx/cloth.js';
import { HOLE, floorAt, ROOM_CURTAINS } from './units.js';

/** A cloth from a drape spec (house.js): { cloth, x, y, z, yaw, w, h, nx, ny, pins, layout, boxes, floor, tex, color, ... }. */
function fromSpec(d) {
  const tx = d.tex || {};
  const tex = tx.kind === 'sacking' ? sackingTexture({ w: tx.w ?? 32, h: tx.h ?? 40, base: tx.base, seed: tx.seed ?? 3, holes: tx.holes ?? true }) : clothTexture(tx.kind || 'rag', tx);
  const c = new Cloth({ w: d.w, h: d.h, nx: d.nx ?? 7, ny: d.ny ?? 7, tex, color: d.color ?? 0xffffff, pins: d.pins ?? 'top', layout: d.layout ?? 'hang', boxes: d.boxes ?? null, floor: d.floor ?? null, iters: d.iters ?? 4, damping: d.damping ?? 1.8, slack: d.slack ?? 1, gust: d.gust ?? 1 });
  return c.place(d.x, d.y, d.z, d.yaw ?? 0);
}

export function campCloths(scene, laundry = []) {
  const camp = new ClothSet({ name: 'camp cloth', far: 9 });
  // what the cave's build jobs hang (drape specs): his apron on its nail, the sacking across your alcove
  const HANG = { shirt: [0.36, 6, 8], johns: [0.5, 6, 10], towel: [0.3, 5, 7] };
  for (const [i, q] of (laundry || []).entries()) {
    if (q.cloth) { try { camp.add(fromSpec(q)); } catch (e) { console.warn('[home] drape', q.cloth, e); } continue; }
    const [h, nx, ny] = HANG[q.kind] || HANG.towel;
    const w = Math.hypot(q.b.x - q.a.x, q.b.z - q.a.z);
    const lt = laundryTexture(q.kind, 7 + i * 5);
    camp.add(new Cloth({ w, h, nx, ny, tex: lt.tex, iters: 4, damping: 2.0 }).place(q.a.x, q.a.y, q.a.z, q.yaw ?? 0));
  }
  // a draught down from the hole, wandering, strongest under it; a breath through your alcove's neck
  const A = ROOM_CURTAINS.arch;
  camp.wind = (t, x = 0, z = 0) => {
    const k = 0.6 + 0.8 * Math.exp(-((x - HOLE.x) ** 2 + (z - HOLE.z) ** 2) / 4);
    const door = Math.exp(-((x - A.x) ** 2 + (z - A.z) ** 2) / 0.5);
    return [(0.3 * Math.sin(t * 0.53) + 0.18 * Math.sin(t * 1.7)) * k, (0.4 + 0.35 * Math.sin(t * 0.81) * Math.sin(t * 0.37 + 1)) * k + door * 0.25];
  };
  scene.add(camp.build());

  const sets = [camp];
  return {
    // (HomeScene shows these with the cave)
    list: [{ mesh: camp.mesh }],
    sets,
    /** colliders: [{ x, z, r, y0, y1 }] (m): their height is taken from the floor under them here. */
    update(dt, colliders, time, camera = null) {
      const cols = colliders.map((q) => { const f = floorAt(q.x, q.z); return { x: q.x, z: q.z, r: q.r, y0: f - 0.05, y1: f + 0.95 }; });
      for (const s of sets) s.update(dt, cols, time, camera);
    },
    stats() { return sets.map((s) => ({ name: s.name, ...s.stats })); },
    dispose() { for (const s of sets) s.dispose(); },
  };
}

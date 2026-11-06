// The cloth in Old Star's camp and your nook (src/gfx/cloth.js): the sacking over his shack's
// doorway (you and he push it aside walking through; the draught from the hole stirs it), a rag of
// blanket tacked over the shack's window hole, the washing pegged on the drying line, and what the
// camp's build jobs hang as `laundry` besides (house.js `drape`: a tarp over the stores, his apron
// on its hook, the quilt hanging off his cot, an empty sack on a nail, a rag of canvas on the
// fallen lean-to); in your nook, the curtain in the doorway down to the camp (you brush through it)
// and the curtains either side of the crystal window. Two sets, one draw call each: the camp's
// (shown with the camp) and your nook's. Meters, in the scene (not the tile-scaled room).
import { Cloth, ClothSet, sackingTexture, laundryTexture, clothTexture } from '../gfx/cloth.js';
import { SHACK } from './house.js';
import { HALL, HOLE, floorAt, ROOM_CURTAINS } from './units.js';

/** A cloth from a drape spec (house.js): { cloth, x, y, z, yaw, w, h, nx, ny, pins, layout, boxes, floor, tex, color, ... }. */
function fromSpec(d) {
  const tx = d.tex || {};
  const tex = tx.kind === 'sacking' ? sackingTexture({ w: tx.w ?? 32, h: tx.h ?? 40, base: tx.base, seed: tx.seed ?? 3, holes: tx.holes ?? true }) : clothTexture(tx.kind || 'rag', tx);
  const c = new Cloth({ w: d.w, h: d.h, nx: d.nx ?? 7, ny: d.ny ?? 7, tex, color: d.color ?? 0xffffff, pins: d.pins ?? 'top', layout: d.layout ?? 'hang', boxes: d.boxes ?? null, floor: d.floor ?? null, iters: d.iters ?? 4, damping: d.damping ?? 1.8, slack: d.slack ?? 1, gust: d.gust ?? 1 });
  return c.place(d.x, d.y, d.z, d.yaw ?? 0);
}

export function campCloths(scene, laundry = []) {
  const K = SHACK, Y = HALL.y;
  const dh = 1.22, dw = K.dw;
  const camp = new ClothSet({ name: 'camp cloth', far: 9 });
  // the doorway: a sack split open and nailed to the rod, nearly to the floor
  camp.add(new Cloth({ w: dw * 0.98, h: dh - 0.1, nx: 11, ny: 15, tex: sackingTexture({ seed: 11 }), iters: 5, damping: 1.4, floor: -(dh - 0.05) + 0.01 })
    .place(K.x + K.dc - dw / 2 + dw * 0.01, Y + dh - 0.05, K.z + 0.07, 0));
  // the window: an old blanket tacked on at its top corners only, a corner torn loose
  const wc = 0.72, ww = 0.42;
  camp.add(new Cloth({ w: ww + 0.06, h: 0.4, nx: 7, ny: 7, tex: sackingTexture({ w: 24, h: 24, base: [120, 92, 84], seed: 5 }), pins: [[0, 0], [1, 0], [2, 0], [3, 0]], iters: 4, damping: 1.8 })
    .place(K.x + wc - ww / 2 - 0.03, Y + 1.1, K.z + 0.08, 0));
  // the washing on the line, pegged along its top; and whatever else the camp hangs (drape specs)
  const HANG = { shirt: [0.36, 6, 8], johns: [0.5, 6, 10], towel: [0.3, 5, 7] };
  for (const [i, q] of (laundry || []).entries()) {
    if (q.cloth) { try { camp.add(fromSpec(q)); } catch (e) { console.warn('[home] drape', q.cloth, e); } continue; }
    const [h, nx, ny] = HANG[q.kind] || HANG.towel;
    const w = Math.hypot(q.b.x - q.a.x, q.b.z - q.a.z);
    const lt = laundryTexture(q.kind, 7 + i * 5);
    camp.add(new Cloth({ w, h, nx, ny, tex: lt.tex, iters: 4, damping: 2.0 }).place(q.a.x, q.a.y, q.a.z, q.yaw ?? 0));
  }
  // a draught down from the hole: mostly out of the shack (+z), wandering, strongest under the hole
  camp.wind = (t, x = 0, z = 0) => {
    const k = 0.7 + 0.9 * Math.exp(-((x - HOLE.x) ** 2 + (z - HOLE.z) ** 2) / 5);
    return [(0.35 * Math.sin(t * 0.53) + 0.2 * Math.sin(t * 1.7)) * k, (0.55 + 0.45 * Math.sin(t * 0.81) * Math.sin(t * 0.37 + 1)) * k];
  };
  scene.add(camp.build());

  // your nook: the doorway curtain (two panels on a rod, a gap between: you brush through them)
  const room = new ClothSet({ name: 'room cloth', far: 8 });
  const A = ROOM_CURTAINS.arch, pw = A.hw - 0.04, ah = A.y - 0.03;
  const red = { base: [132, 52, 44], trim: [196, 150, 70] };
  room.add(new Cloth({ w: pw, h: ah, nx: 6, ny: 11, tex: clothTexture('curtain', { ...red, seed: 21 }), iters: 4, damping: 1.6, slack: 1.0, floor: -A.y + 0.012 }).place(A.x - A.hw, A.y, A.z, 0));
  room.add(new Cloth({ w: pw, h: ah, nx: 6, ny: 11, tex: clothTexture('curtain', { ...red, seed: 22 }), iters: 4, damping: 1.6, slack: 1.0, floor: -A.y + 0.012 }).place(A.x + A.hw - pw, A.y, A.z, 0));
  // the window's curtains, drawn back either side (the west wall: they face +x into the room)
  const Wn = ROOM_CURTAINS.window, cw = 0.24, ch = 0.82;
  const blue = { base: [70, 96, 120], trim: [210, 190, 140] };
  // (turned to face +x, a sheet runs toward -z from its corner)
  room.add(new Cloth({ w: cw, h: ch, nx: 5, ny: 9, tex: clothTexture('curtain', { ...blue, seed: 31 }), iters: 3, damping: 2.0 }).place(Wn.x, Wn.y, Wn.z - Wn.half + cw, Math.PI / 2));
  room.add(new Cloth({ w: cw, h: ch, nx: 5, ny: 9, tex: clothTexture('curtain', { ...blue, seed: 32 }), iters: 3, damping: 2.0 }).place(Wn.x, Wn.y, Wn.z + Wn.half, Math.PI / 2));
  // a breath through the doorway (the camp's air comes up the steps) and a whisper by the window
  room.wind = (t, x = 0, z = 0) => {
    const door = Math.exp(-((x - A.x) ** 2 + (z - A.z) ** 2) / 0.5);
    const w = 0.25 + 0.2 * Math.sin(t * 0.7) * Math.sin(t * 0.31 + 2);
    return [0.12 * Math.sin(t * 0.43) + 0.05, (0.5 * door + 0.08) * (0.6 + w)];
  };
  scene.add(room.build());

  const sets = [camp, room];
  return {
    // (HomeScene shows these with the camp)
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

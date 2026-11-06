// The forest's life: small birds only (the user's call, wave 8: no deer, squirrels, rabbits, frogs,
// butterflies or dragonflies). Each is a little voxel rig (body, two wings) with its own behaviour:
//   flitters  robins, blue tits, chaffinches, great tits and wrens about the trail and the
//             clearing: they perch on stumps, stones, logs, the signpost and the ground, hop, peck,
//             look about and sing (a call placed where the bird is: panned and quieter with
//             distance); every so often they flit to another perch in a bounding flight, and as
//             the traveller comes near they flit off ahead of him and settle again.
//   woodpecker a small spotted woodpecker drumming on a gate giant's trunk.
//   crossing  a finch that flits across the trail ahead of him as the opening shot cranes down.
//   swallows  swallows wheeling high over the clearing and the open stretch of trail.
//   makeVoxelBird(look): a lone bird rig (the flock that bursts out of the trees uses it).
//
//   const C = makeCritters(F, { lite }); scene.add(C.group);
//   C.update(dt, { t, hero: Vector3, cam: Camera, glint, crack, sfx(name, opts) }); C.dispose();
//   (sfx names: 'song' { kind, pan, vol, pitch }, 'flutter' { pan, vol }, 'woodpecker' { pan })
import * as THREE from 'three';
import { VoxelGrid, meshVoxGreedy, fshade } from '../vox.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { clamp, makeRng } from '../../core/util.js';
import { forestToon } from '../forestfx.js';
import { groundH, FOREST, CLEAR_R, HOLE_R } from '../forest.js';

/** Build a part mesh from a grid painter: fn(g) fills the grid; pivot in voxels. */
function part(w, h, d, fn, scale, pivot, mat) {
  const g = new VoxelGrid(w, h, d);
  fn(g);
  const geo = meshVoxGreedy(g, { scale, pivot });
  const m = new THREE.Mesh(geo, mat);
  m.layers.enable(LAYER_OUTLINE);
  return m;
}

// ------------------------------------------------------------------ songbird
function makeBird(mat, { back = 0x7a6248, breast = 0xe8783a, belly = 0xf4ece0, cap = null, cheek = null } = {}) {
  const S = 1 / 96;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 2 * S;
  root.add(body);
  body.add(part(10, 14, 16, (g) => {
    g.ellipsoid(5, 5, 7, 3.4, 3.6, 4.6, (x, y, z) => (z > 8 && y < 7 ? breast : y < 3 ? belly : back));
    g.ellipsoid(5, 9, 10, 2.8, 2.8, 2.8, (x, y, z) => (cap && y > 10 ? cap : cheek && z > 10 && y < 10 && y > 8 ? cheek : z > 10.5 && y < 9.5 ? breast : back));
    g.set(5, 9, 13, 0x2a2018); g.set(5, 9, 14, 0x2a2018); // beak
    g.set(3, 10, 11.5, 0x0e0a08); g.set(7, 10, 11.5, 0x0e0a08);
    for (let z = 0; z < 4; z++) g.set(5, 6 + z * 0.5, 2 - z * 0.4, fshade(back, 0.8)); // tail
    for (const x of [4, 6]) for (let y = 0; y < 2; y++) g.set(x, y, 7, 0x3a2a20);
  }, S, [5, 0, 7], mat));
  const wings = [];
  for (const sd of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(sd * 3 * S, 6 * S, 0);
    w.add(part(9, 3, 9, (g) => { for (let x = 0; x < 8; x++) for (let z = 0; z < 7 - x * 0.4; z++) g.set(sd > 0 ? x : 8 - x, 1, z + 1, x > 5 ? fshade(back, 0.75) : back); }, S, [sd > 0 ? 0 : 8, 1, 5], mat));
    w.visible = false;
    body.add(w);
    wings.push(w);
  }
  return { root, body, wings };
}
/** A small bird rig in the forest's light ({ root, body, wings }; wings shown), for flights scripted elsewhere. */
export function makeVoxelBird(look = {}) {
  const b = makeBird(forestToon({ dapple: true }), look);
  b.wings.forEach((w) => { w.visible = true; });
  return b;
}
/** Beat a flying bird's wings at time t (glide: 0..1, how much of the time it holds them out). */
export function flap(b, t, glide = 0) {
  const beat = Math.sin(t * 2.3) > glide * 2 - 1 ? Math.sin(t * 46) * 0.95 : 0.12;
  b.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * beat; });
}
/** The plumages of the trail's small birds, with the song each one sings (forest_song kinds). */
const PLUMAGE = [
  { name: 'robin', look: {}, song: 'robin', s: 1.25 },
  { name: 'blue tit', look: { back: 0x7a9a5a, breast: 0xf0d850, belly: 0xf0d850, cap: 0x4a7ad0, cheek: 0xf8f8f0 }, song: 'trill', s: 1.05 },
  { name: 'chaffinch', look: { back: 0x8a6a58, breast: 0xd89080, belly: 0xe8c8b8, cap: 0x6a7a98 }, song: 'trill', s: 1.2 },
  { name: 'great tit', look: { back: 0x6a8a4a, breast: 0xe8d040, belly: 0xe8d040, cap: 0x1a1a1e, cheek: 0xf8f8f0 }, song: 'robin', s: 1.15 },
  { name: 'wren', look: { back: 0x7a5a3a, breast: 0xa8845a, belly: 0xc8a878 }, song: 'wren', s: 0.85 },
];

// ------------------------------------------------------------------ the cast
/**
 * Place the forest's birds. F: the built forest (its spots). Returns { group, update, dispose, list }.
 */
export function makeCritters(F, { lite = false } = {}) {
  const group = new THREE.Group();
  group.name = 'critters';
  const mat = forestToon({ dapple: true });
  const list = [];
  const tr = FOREST.trail, L = tr.length;
  const rng = makeRng(4242);
  const _r = new THREE.Vector3(), _d = new THREE.Vector3();
  /** A sound placed where p is, heard from the camera: pan by the camera's right, quieter far off. */
  const placed = (c, p) => {
    if (!c.cam) return { pan: 0, k: 1 };
    _d.subVectors(p, c.cam.position);
    const dist = _d.length();
    _r.set(1, 0, 0).applyQuaternion(c.cam.quaternion);
    return { pan: clamp(_d.dot(_r) / Math.max(1, dist), -0.9, 0.9), k: clamp(1.4 - dist / 16, 0.15, 1) };
  };

  // ---- where they perch: stumps, stones, logs and the signpost near the trail, and the ground
  const perches = [];
  const nearTrail = (x, z, d) => FOREST.dist.trail(x, z) < d;
  for (const s of F.spots.stumps) if (nearTrail(s.x, s.z, 6)) perches.push({ x: s.x, z: s.z, y: s.top });
  for (const r of F.spots.rocks) if (!r.wet && nearTrail(r.x, r.z, 6)) perches.push({ x: r.x, z: r.z, y: r.top });
  for (const l of F.spots.logs) for (const u of [-0.25, 0.2]) { const x = l.x + Math.cos(l.ry) * u * l.len, z = l.z - Math.sin(l.ry) * u * l.len; perches.push({ x, z, y: l.top }); }
  if (F.spots.sign) perches.push({ x: F.spots.sign.x, z: F.spots.sign.z, y: F.spots.sign.top });
  for (let i = 0; i < 26; i++) { // the ground: the verges and the clearing's edge (they hop and peck there)
    const [x, z] = i < 18 ? tr.beside(rng.range(2, L - 9), (rng() < 0.5 ? -1 : 1) * rng.range(1.1, 3)) : (() => { const a = rng.range(0, 6.28), r = rng.range(HOLE_R + 2.2, CLEAR_R + 1); return [Math.cos(a) * r, Math.sin(a) * r]; })();
    if (FOREST.dist.stream(x, z) < 1.2 || FOREST.dist.trail(x, z) < 0.9) continue;
    perches.push({ x, z, y: groundH(x, z), ground: true });
  }
  for (const p of perches) p.v = new THREE.Vector3(p.x, p.y, p.z);

  // ---- the flitters: each starts on a perch spread along the trail and keeps to its own stretch
  const N = lite ? 5 : 9;
  for (let i = 0; i < N; i++) {
    const P = PLUMAGE[i % PLUMAGE.length];
    const b = makeBird(mat, P.look);
    b.root.scale.setScalar(P.s);
    group.add(b.root);
    const s0 = ((i + 0.5) / N) * (L - 2);
    const home = tr.at(s0);
    const mine = perches.filter((p) => (p.x - home.x) ** 2 + (p.z - home.z) ** 2 < 11 * 11);
    const pool = mine.length >= 2 ? mine : perches;
    let cur = pool[(i * 7) % pool.length];
    const from = new THREE.Vector3(), to = new THREE.Vector3();
    let state = 'perch', st = rng.range(0, 3), next = rng.range(2, 6), sing = rng.range(1, 5), dur = 1, look = 0;
    const off = new THREE.Vector3((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3);
    b.root.position.copy(cur.v).add(off);
    const flyTo = (c, flee) => {
      // somewhere else on its stretch (fleeing: away from him, a few metres on)
      let best = null, bs = -1e9;
      for (const p of pool) {
        if (p === cur) continue;
        const d = p.v.distanceTo(b.root.position);
        if (d < 1.2 || d > 9) continue;
        let score = Math.random() * 2 - Math.abs(d - 4) * 0.3;
        if (c.hero) score += Math.min(6, p.v.distanceTo(c.hero)) * (flee ? 1.2 : 0.25);
        if (score > bs) { bs = score; best = p; }
      }
      if (!best) { next = 2; return; }
      from.copy(b.root.position);
      cur = best;
      off.set((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3);
      to.copy(cur.v).add(off);
      dur = 0.6 + from.distanceTo(to) * 0.22;
      state = 'fly'; st = 0;
      b.wings.forEach((w) => { w.visible = true; });
      if (flee || Math.random() < 0.5) { const s = placed(c, b.root.position); c.sfx?.('flutter', { pan: s.pan, vol: 0.05 * s.k }); }
    };
    list.push({
      name: 'bird', obj: b,
      update(dt, c) {
        st += dt;
        const R = b.root;
        if (c.crack && state !== 'gone') { state = 'gone'; st = 0; from.copy(R.position); to.set(R.position.x * 2.5, R.position.y + 9, R.position.z * 2.5); b.wings.forEach((w) => { w.visible = true; }); }
        if (state === 'perch') {
          // hop, peck, look round; now and then a burst of song
          const ph = Math.floor(st * (cur.ground ? 1.6 : 0.8));
          if (ph !== look) { look = ph; R.rotation.y = rng.range(-3.1, 3.1); if (cur.ground && rng() < 0.6) { R.position.x += Math.sin(R.rotation.y) * 0.08; R.position.z += Math.cos(R.rotation.y) * 0.08; } }
          R.position.y = (cur.ground ? groundH(R.position.x, R.position.z) : cur.y) + (st % 0.62 < 0.07 ? 0.035 : 0);
          b.body.rotation.x = (Math.sin(st * 13) > 0.7 && ph % 3 === 0) ? 0.65 : Math.sin(st * 3) * 0.05;
          sing -= dt;
          if (sing <= 0 && c.t < 29.5) {
            sing = rng.range(3, 8);
            const s = placed(c, R.position);
            if (s.k > 0.2) c.sfx?.('song', { kind: P.song, pan: s.pan, vol: 0.022 * s.k + 0.006, pitch: rng.range(0.92, 1.15) });
            b.body.rotation.x = -0.35; // head up to sing
          }
          next -= dt;
          if (c.hero && c.hero.distanceTo(R.position) < 2.3) flyTo(c, true);
          else if (next <= 0) { next = rng.range(4, 10); flyTo(c, false); }
        } else if (state === 'fly') {
          // the bounding flight of a small bird: a burst of wingbeats, a dip with wings shut
          const u = clamp(st / dur, 0, 1);
          R.position.lerpVectors(from, to, u);
          R.position.y += Math.sin(u * Math.PI) * (0.35 + from.distanceTo(to) * 0.08) - Math.abs(Math.sin(u * Math.PI * 3)) * 0.06;
          R.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
          const beat = Math.sin(u * Math.PI * 3) > -0.2;
          b.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * (beat ? Math.sin(st * 48) * 0.95 : 0.15); });
          b.body.rotation.x = -0.15;
          if (u >= 1) { state = 'perch'; st = 0; next = rng.range(3, 9); b.wings.forEach((w) => { w.visible = false; }); }
        } else {
          // the ground groans: up and away over the trees
          const u = clamp(st / 3, 0, 1);
          R.position.lerpVectors(from, to, u * u);
          R.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
          b.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * Math.sin(st * 46) * 0.95; });
          if (u >= 1) R.visible = false;
        }
      },
    });
  }

  // ---- a small spotted woodpecker drumming on the right-hand gate giant
  {
    const g = FOREST.giants[1];
    const b = makeBird(mat, { back: 0x2a2a2e, breast: 0xf0ece4, belly: 0xf0ece4, cap: 0xd82a2a });
    const a = g.ry + 0.4;
    const r = 1.18 * g.s;
    b.root.position.set(g.x + Math.sin(a) * r, g.y + 3.1, g.z + Math.cos(a) * r);
    b.root.rotation.y = a + Math.PI;
    b.root.scale.setScalar(1.25);
    group.add(b.root);
    let next = 1.5, drum = 0;
    list.push({
      name: 'woodpecker', obj: b,
      update(dt, c) {
        b.body.rotation.x = -1.3;
        next -= dt;
        if (next <= 0 && !c.crack) { drum = 0.7; next = 3 + Math.random() * 3; const s = placed(c, b.root.position); if (s.k > 0.2) c.sfx?.('woodpecker', { pan: s.pan, vol: 0.05 * s.k }); }
        if (drum > 0) { drum -= dt; b.body.rotation.x = -1.3 + (Math.sin(drum * 70) > 0 ? 0.25 : 0); }
      },
    });
  }

  // ---- a finch that flits across the trail ahead of him as the opening shot cranes down
  {
    const b = makeBird(mat, PLUMAGE[2].look);
    b.root.scale.setScalar(1.3);
    b.wings.forEach((w) => { w.visible = true; });
    group.add(b.root);
    const P0 = tr.at(13), P1 = tr.at(16);
    const from = new THREE.Vector3(P0.x - P0.tz * 4.5, groundH(P0.x, P0.z) + 2.6, P0.z + P0.tx * 4.5);
    const to = new THREE.Vector3(P1.x + P1.tz * 5, groundH(P1.x, P1.z) + 3.4, P1.z - P1.tx * 5);
    const t0 = 2.2, dur = 2.0;
    b.root.visible = false;
    list.push({
      name: 'crossing-bird', obj: b,
      update(dt, c) {
        const u = (c.t - t0) / dur;
        b.root.visible = u > 0 && u < 1;
        if (!b.root.visible) return;
        b.root.position.lerpVectors(from, to, u);
        b.root.position.y += Math.sin(u * Math.PI) * 0.6 - Math.abs(Math.sin(u * Math.PI * 5)) * 0.18; // the bounding flight of a finch
        b.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
        const flap = Math.sin(c.t * 46) * (Math.sin(u * Math.PI * 5) > 0 ? 1 : 0.15);
        b.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * flap * 0.9; });
      },
    });
  }

  // ---- swallows wheeling high over the clearing and the trail's open stretch
  for (let i = 0; i < (lite ? 3 : 5); i++) {
    const b = makeBird(mat, { back: 0x1e2238, breast: 0xa84a3a, belly: 0xe8dcc8 });
    b.root.scale.setScalar(1.6);
    b.wings.forEach((w) => { w.visible = true; });
    group.add(b.root);
    const cx = i < 3 ? 0 : 3, cz = i < 3 ? -1 : 26, R = 5 + i * 1.3, h = 9 + (i % 3) * 1.6, sp = (0.42 + (i % 2) * 0.15) * (i % 2 ? -1 : 1);
    let st = i * 2.3;
    list.push({
      name: 'swallow', obj: b,
      update(dt, c) {
        st += dt;
        b.root.visible = !c.crack; // (the flock that bursts out takes over the sky)
        if (!b.root.visible) return;
        const a = st * sp + i, a2 = a + 0.05 * Math.sign(sp);
        const x = (q) => cx + Math.cos(q) * R + Math.sin(q * 2.7) * 1.2, z = (q) => cz + Math.sin(q) * R * 0.7;
        b.root.position.set(x(a), h + Math.sin(a * 2.3) * 1.1, z(a));
        b.root.rotation.set(0, Math.atan2(x(a2) - x(a), z(a2) - z(a)), -Math.sign(sp) * 0.35); // banking into the turn
        flap(b, st + i, 0.55);
      },
    });
  }

  const update = (dt, c) => { for (const k of list) k.update(dt, c); };
  const dispose = () => { group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); };
  return { group, update, dispose, list };
}

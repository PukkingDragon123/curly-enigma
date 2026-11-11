// Your raptors at home: they wait for you in Old Star's cave, curled up on the floor by the lift
// (the way you'll go back down). Each one breathes, sways its tail, dozes when you're away, lifts
// its head and watches you when you come close, chirps hello. E on one: a pet (a wag, a hop, a
// chirp), or, for one that isn't coming down the mine with you, "Take it along" (it's the one that
// comes next time). Built from the mine raptor's own model (enemies/dinos.js) with plain lit
// materials; the home scene calls homeRaptors(scene) once it's built (a one-line hook).
import * as THREE from 'three';
import { buildRaptor } from '../enemies/dinos.js';
import { VS } from '../enemies/vox.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { paintedBody, collarGeo } from './body.js';
import { defineTameSounds } from './sfx.js';
import { installTameDebug } from './debug.js';
import { SPOTS, STAR_SPOTS } from '../../home/spots.js';
import { walkable } from '../../home/plan.js';
import { clamp, rand } from '../../core/util.js';

/** Where the lift lets you out: they curl up as near it as there's room (meters, home space). */
const LANDING = { x: 7.38, z: -2.27 };
const HALL_C = { x: 5.4, z: -2.4 };

/**
 * Floor spots with room for a curled-up raptor, nearest the lift first: clear of the rock and
 * everything with a collision box or a contact shadow, and out of the way of Old Star's places,
 * your things and anything you use with E.
 */
export function restSpots(scene, n, o = {}) {
  const w = scene.world, shadows = scene.cave?.shadowSpots || [];
  const keep = [];
  for (const p of Object.values(STAR_SPOTS)) if (p && p.x !== undefined) keep.push([p.x, p.z, 0.55]);
  for (const p of Object.values(SPOTS)) if (p && p.x !== undefined) keep.push([p.x, p.z, 0.5]);
  for (const it of scene.rig?.items || []) {
    if (it.x !== undefined) keep.push([it.x, it.z, 0.45]);
    else if (it.box) keep.push([(it.box[0] + it.box[3]) / 2, (it.box[2] + it.box[5]) / 2, 0.45]);
  }
  keep.push([LANDING.x, LANDING.z, 0.55], [8.0, -2.27, 0.6]);
  const R = o.r ?? 0.24;
  const clear = (x, z) => {
    for (let dx = -R; dx <= R + 0.01; dx += R / 2) for (let dz = -R; dz <= R + 0.01; dz += R / 2) {
      const px = x + dx, pz = z + dz;
      if (!walkable(px, pz) || w?.solidAt?.(px, 0.2, pz) || w?.solidAt?.(px, 0.5, pz)) return false;
      if (shadows.some((s) => Math.abs(s.x - px) < s.w / 2 && Math.abs(s.z - pz) < s.h / 2)) return false;
    }
    return true;
  };
  const cands = [];
  for (let x = 2.4; x <= 8.0; x += 0.1) for (let z = -4.15; z <= -0.75; z += 0.1) {
    if (keep.some(([kx, kz, r]) => Math.hypot(kx - x, kz - z) < r) || !clear(x, z)) continue;
    cands.push({ x, z, d: Math.hypot(x - LANDING.x, z - LANDING.z) });
  }
  cands.sort((a, b) => a.d - b.d);
  if (o.all) return cands;
  const out = [];
  for (const c of cands) {
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 0.85)) continue;
    // it faces into the room, half toward the lift
    c.yaw = Math.atan2((HALL_C.x + LANDING.x) / 2 - c.x, (HALL_C.z + LANDING.z) / 2 - c.z);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);

const mk = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.layers.enable(LAYER_OUTLINE);
  parent.add(m);
  return m;
}

/** One curled-up raptor (a light rig: no legs to walk on, just the pose and the little moves). */
function curled(rec, cache, mats) {
  const v = ((rec.variant ?? 0) % 3 + 3) % 3, s = rec.size || 0.88;
  const G = cache.geo('raptor|' + v, () => buildRaptor(v));
  const root = new THREE.Group();
  root.scale.setScalar(s);
  const hips = mk(root, 0, 6 * VS, 0);
  const bodyG = mk(hips);
  bodyG.rotation.x = 0.12;
  mesh(paintedBody(cache, v, 'scar'), mats.body, bodyG);
  mesh(collarGeo(cache), mats.body, bodyG);
  const neck = mk(bodyG, 0, 6.5 * VS, 8 * VS);
  mesh(G.head, mats.body, neck);
  const jaw = mk(neck, 0, 0.8 * VS, 1.5 * VS);
  mesh(G.jaw, mats.body, jaw);
  const eyes = mesh(G.eyes, mats.eye, neck, 0, 3 * VS, 0);
  const arms = [1, -1].map((sd) => { const g = mk(bodyG, sd * 3 * VS, 0.5 * VS, 5.5 * VS); const a = mesh(G.arm, mats.body, g); if (sd < 0) a.scale.x = -1; g.rotation.x = 0.5; return g; });
  let tp = mk(bodyG, 0, 0.5 * VS, -5 * VS);
  const tail = G.tail.map((g, i) => { const seg = i ? mk(tp, 0, 0.2 * VS, -4.8 * VS) : tp; mesh(g, mats.body, seg); tp = seg; return seg; });
  // legs folded under it: thigh forward and down to a knee near the floor, shin back along it
  for (const sd of [1, -1]) {
    const hip = new THREE.Vector3(sd * 2.6 * VS, 0, -0.5 * VS);
    const knee = hip.clone().add(new THREE.Vector3(sd * 0.6 * VS, -5 * VS, 2.2 * VS));
    const ankle = knee.clone().add(new THREE.Vector3(0, -0.8 * VS, -5.9 * VS));
    const thigh = mesh(G.thigh, mats.body, hips, hip.x, hip.y, hip.z);
    thigh.quaternion.setFromUnitVectors(DOWN, _v.subVectors(knee, hip).normalize());
    const shin = mesh(G.shin, mats.body, hips, knee.x, knee.y, knee.z);
    shin.quaternion.setFromUnitVectors(DOWN, _v.subVectors(ankle, knee).normalize());
    mesh(G.foot, mats.body, root, ankle.x, ankle.y + hips.position.y, ankle.z + 1.5 * VS);
  }
  return { rec, root, hips, bodyG, neck, jaw, eyes, arms, tail, t: rand(0, 10), happy: 0, awake: 0, greeted: false, blinkT: rand(1, 3), blink: 0, hop: 0, tiltT: 2, tilt: 1 };
}

/**
 * Put your raptors in the cave (scene: HomeScene). Returns { list, update(dt), dispose() } or null
 * when you have none.
 */
export function homeRaptors(scene) {
  const g = scene.game, st = g.state;
  installTameDebug();
  const T = st.data.tame;
  const recs = (T?.raptors || []).slice(0, 4);
  if (!recs.length || !scene.rig || !scene.scene) return null;
  defineTameSounds(g.audio);
  const geos = new Map();
  const cache = { geo: (k, fn) => { let v = geos.get(k); if (!v) geos.set(k, (v = fn())); return v; } };
  const mats = { body: new THREE.MeshLambertMaterial({ vertexColors: true }), eye: new THREE.MeshBasicMaterial({ vertexColors: true }) };
  const spots = restSpots(scene, recs.length);
  const list = [];
  recs.forEach((rec, i) => {
    const p = spots[i] || { x: LANDING.x - 0.6 - i * 0.7, z: LANDING.z + 0.5, yaw: Math.PI / 2 };
    const r = curled(rec, cache, mats);
    r.root.position.set(p.x, 0, p.z);
    r.root.rotation.y = p.yaw;
    r.yaw0 = p.yaw;
    r.box = [p.x - 0.26, 0, p.z - 0.26, p.x + 0.26, 0.8, p.z + 0.26]; // (as tall as its head when it sits up: talk cameras keep off it too)
    r.tag = 'raptor:' + rec.id;
    scene.scene.add(r.root);
    list.push(r);
    scene.addIt({
      x: p.x, y: 0.32, z: p.z, r: 0.42, reach: 2.2,
      label: () => (T.active && T.active !== rec.id ? `Take ${rec.name} along` : `Pet ${rec.name}`),
      action: () => pet(r),
    });
  });
  const audio = g.audio;
  const say = (r, name, opts = {}) => {
    const d = r.root.position.distanceTo(scene.rig.player.pos);
    audio?.play?.(name, { ...opts, vol: (opts.vol ?? 1) * clamp(1.2 - d / 8, 0.15, 1) });
  };
  function pet(r) {
    const was = T.active;
    if (T.active && T.active !== r.rec.id) T.active = r.rec.id;
    else if (!T.active) T.active = r.rec.id;
    r.happy = 2.6;
    r.hop = 1;
    r.awake = 1;
    say(r, was !== T.active ? 'raptor_trill' : 'raptor_chirp', { n: 3 });
    const p = _w.copy(r.root.position).add(_v.set(0, 0.55, 0));
    for (let i = 0; i < 8; i++) scene.fx?.spawn?.({ x: p.x, y: p.y, z: p.z, vx: rand(-0.6, 0.6), vy: rand(0.6, 1.4), vz: rand(-0.6, 0.6), life: rand(0.6, 1), size: 0.014, color: [1, 0.86, 0.5], glow: true, drag: 1.6, grav: 0.8 });
    st.emit?.('act', { type: 'tame', what: 'pet', name: r.rec.name });
  }
  let boxT = 0;
  const tick = (dt) => {
    const pl = scene.rig?.player;
    if (!pl) return;
    // (furniture moves rebuild the collision: put their boxes back)
    if ((boxT -= dt) <= 0) {
      boxT = 1;
      for (const r of list) if (!scene.world.boxes.some((b) => b.tag === r.tag)) scene.world.add(...r.box, r.tag);
    }
    const eye = scene.rig.eye ? scene.rig.eye(_w) : _w.set(pl.pos.x, pl.pos.y + 0.72, pl.pos.z);
    for (const r of list) {
      r.t += dt;
      const d = Math.hypot(pl.pos.x - r.root.position.x, pl.pos.z - r.root.position.z);
      const near = d < 3.2;
      r.awake += ((near ? 1 : d < 6 ? 0.35 : 0) - r.awake) * Math.min(1, dt * 2);
      if (near && !r.greeted) { r.greeted = true; r.happy = Math.max(r.happy, 1.4); say(r, 'raptor_chirp', { n: 2 }); }
      if (d > 5) r.greeted = false;
      r.happy = Math.max(0, r.happy - dt);
      const wag = clamp(r.happy, 0, 1) * 0.9 + r.awake * 0.12;
      // breathing, a hop when it's happy
      r.hop = Math.max(0, r.hop - dt * 2.2);
      r.root.position.y = Math.sin(r.hop * Math.PI) * 0.12;
      r.bodyG.scale.y = 1 + Math.sin(r.t * 2.1) * 0.018;
      // the tail: a lazy sway asleep, a wag when you're there
      r.tail.forEach((seg, i) => { seg.rotation.y = Math.sin(r.t * (2 + wag * 10) - i * 0.7) * (0.06 + wag * 0.4) * (i + 1) / 3 + 0.25 * (1 - r.awake) * (i + 1) / 3; });
      // the head: down on its arms dozing, up and watching you, tilting now and then
      if ((r.tiltT -= dt) <= 0) { r.tiltT = rand(1.5, 3.5); r.tilt = -r.tilt; }
      r.root.updateWorldMatrix(true, true);
      _v.copy(eye).applyMatrix4(new THREE.Matrix4().copy(r.neck.parent.matrixWorld).invert()).sub(r.neck.position);
      const ly = clamp(Math.atan2(_v.x, _v.z), -1, 1), lx = clamp(-Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.6, 0.4);
      const a = r.awake, k = Math.min(1, dt * 4);
      r.neck.rotation.y += ((ly * a + 0.45 * (1 - a)) - r.neck.rotation.y) * k;
      r.neck.rotation.x += ((lx * a + 0.75 * (1 - a)) - r.neck.rotation.x) * k;
      r.neck.rotation.z += ((r.tilt * 0.3 * a * (r.happy > 0 ? 1 : 0.5)) - r.neck.rotation.z) * k;
      r.jaw.rotation.x = r.happy > 0 ? Math.max(0, Math.sin(r.t * 9)) * 0.35 : 0.04;
      r.arms.forEach((arm, i) => { arm.rotation.x = 0.5 + (r.happy > 0 ? Math.sin(r.t * 14 + i * 1.7) * 0.3 : 0); });
      // eyes: shut while it dozes, a blink now and then
      r.blinkT -= dt; r.blink = Math.max(0, r.blink - dt);
      if (r.blinkT <= 0) { r.blinkT = rand(1.8, 4.5); r.blink = 0.12; }
      const open = a < 0.2 ? 0.08 : r.blink > 0 ? 0.12 : r.happy > 0 ? 0.55 : 1;
      r.eyes.scale.y += (open - r.eyes.scale.y) * Math.min(1, dt * 12);
      // the odd happy chirp while you're about
      if (near && Math.random() < dt * 0.04) say(r, 'raptor_chirp', { n: 1, vol: 0.6 });
    }
  };
  scene.tickers.push(tick);
  const H = {
    list,
    update: tick,
    dispose() {
      const i = scene.tickers.indexOf(tick);
      if (i >= 0) scene.tickers.splice(i, 1);
      for (const r of list) { r.root.removeFromParent(); scene.world?.remove?.(r.tag); }
      mats.body.dispose(); mats.eye.dispose();
      for (const gg of geos.values()) for (const x of Object.values(gg?.isBufferGeometry ? { gg } : gg || {})) { if (x?.isBufferGeometry) x.dispose(); else if (Array.isArray(x)) x.forEach((y) => y?.dispose?.()); }
    },
  };
  scene.raptors = H;
  scene.own?.(() => H.dispose());
  return H;
}

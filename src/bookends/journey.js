// Helpers for the journey intro: Nugget's walking coop (the real model from src/gfx/char/coop.js
// when it exists, a simple stand-in otherwise), synthesized forest sounds (birdsong, a heartbeat)
// and the muffled hearing of someone who has just been knocked out.
import * as THREE from 'three';
import { VoxelGrid, voxMesh } from './vox.js';

const COOP = import.meta.glob('../gfx/char/coop.js');

/**
 * Nugget's coop: the inventory part's model when present (makeCoop), else a stand-in hut on
 * two chicken legs with the same small API: root, update(dt, {speed}), face(yaw, instant),
 * play(state), hop(), shake(k), setDoor(k), setNugget(on), peck(), windowWorld(out), onStep.
 */
export async function loadCoop(opts = {}) {
  const load = COOP['../gfx/char/coop.js'];
  if (load) {
    try {
      const m = await load();
      if (m && typeof m.makeCoop === 'function') {
        const c = m.makeCoop(opts);
        c.isPlaceholder = false;
        return c;
      }
    } catch (e) { console.warn('[fall] coop model failed, using the stand-in', e); }
  }
  return makeStandInCoop(opts);
}

/** A stand-in coop: a little log hut with a round window on two jointed chicken legs. */
function makeStandInCoop({ height = 1.1 } = {}) {
  const S = height / 34; // 34 voxels to the ridge
  const hut = new VoxelGrid(26, 22, 20);
  for (let x = 0; x < 24; x++) for (let y = 0; y < 13; y++) for (let z = 0; z < 18; z++) {
    if (x > 0 && x < 23 && z > 0 && z < 17 && y > 0) continue;
    hut.set(x + 1, y, z + 1, y % 3 === 0 ? 0x86562e : (x + z) % 5 === 0 ? 0x6a4022 : 0xa06c3c);
  }
  for (let y = 0; y < 9; y++) for (let x = -1; x < 25 - y * 0; x++) for (let z = -1; z < 19; z++) {
    const w = 13 - y * 1.45;
    if (Math.abs(x - 11.5) > w) continue;
    hut.set(x + 1, 13 + y, z + 1, (z + y) % 3 === 0 ? 0x6f5d48 : (x + z) % 4 === 0 ? 0x4f7a2c : 0x7d6a52);
  }
  for (let y = 15; y < 19; y++) for (let x = 10; x < 15; x++) hut.set(x, y, 19, (Math.hypot(x - 12, y - 17) < 1.6) ? 0x1e140c : 0xc8945a);
  hut.set(12, 17, 20, 0xe03a2a); hut.set(12, 16, 20, 0xfff6ee); hut.set(13, 16, 20, 0xffa020); // Nugget peeking out
  const body = voxMesh(hut, { pivot: [13, 0, 10], scale: S });
  const root = new THREE.Group();
  const hip = new THREE.Group();
  hip.position.y = 16 * S;
  hip.add(body);
  root.add(hip);
  const legs = [-1, 1].map((side) => {
    const g = new THREE.Group();
    g.position.set(side * 6 * S, 16 * S, 0);
    const lg = new VoxelGrid(5, 18, 8);
    for (let y = 2; y < 17; y++) lg.set(2, y, 3, 0xe39a2c);
    for (let z = 0; z < 8; z++) lg.set(2, 0, z, 0xb06a1c);
    for (const x of [0, 4]) lg.set(x, 0, 5, 0xb06a1c);
    const m = voxMesh(lg, { pivot: [2.5, 17, 3.5], scale: S });
    g.add(m);
    root.add(g);
    return g;
  });
  let t = 0, facing = 0, target = 0, hopT = 0, shakeT = 0, lastStep = 0;
  const rig = {
    root, height, isPlaceholder: true, radius: 0.5, onStep: null,
    face(y, instant) { target = y; if (instant) facing = y; },
    play() {}, hop() { hopT = 0.5; }, shake(k = 1) { shakeT = 0.6 * k; }, setDoor() {}, setNugget() {}, peck() {},
    windowWorld(out = new THREE.Vector3()) { return body.localToWorld(out.set(0, 17, 10)); },
    update(dt, { speed = 0 } = {}) {
      t += dt * (0.6 + speed * 3.4);
      let d = target - facing; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      facing += d * Math.min(1, dt * 6);
      root.rotation.y = facing;
      const w = speed > 0.05 ? Math.sin(t * 2) : 0;
      legs[0].rotation.x = w * 0.6; legs[1].rotation.x = -w * 0.6;
      hip.position.y = 16 * S + Math.abs(Math.cos(t * 2)) * S * 2 * Math.min(1, speed * 2) + (hopT > 0 ? Math.sin((hopT / 0.5) * Math.PI) * 0.15 : 0);
      hip.rotation.z = shakeT > 0 ? Math.sin(t * 40) * 0.08 * shakeT : w * 0.04;
      hopT = Math.max(0, hopT - dt); shakeT = Math.max(0, shakeT - dt);
      const step = Math.floor(t * 2 / Math.PI);
      if (speed > 0.05 && step !== lastStep) { lastStep = step; rig.onStep?.(step % 2 ? 1 : 0, 1); }
    },
    dispose() {},
  };
  return rig;
}

// ------------------------------------------------------------------ sounds
/** A little songbird phrase (a few rising and falling whistles), panned. */
export function birdsong(audio, { pan = 0, pitch = 1, vol = 0.03 } = {}) {
  const n = 3 + ((Math.random() * 4) | 0);
  let at = 0;
  const base = (2600 + Math.random() * 1400) * pitch;
  for (let i = 0; i < n; i++) {
    const f = base * (1 + (Math.random() - 0.4) * 0.35);
    const up = Math.random() < 0.5;
    audio.tone({ f, f2: f * (up ? 1.35 : 0.72), type: 'sine', dur: 0.07 + Math.random() * 0.06, vol, a: 0.005, release: 0.04, delay: at, pan, reverb: 0.35 });
    at += 0.09 + Math.random() * 0.08;
  }
}

/** One heartbeat (lub-dub), low enough to come through the muffle. */
export function heartbeat(audio, vol = 0.45) {
  audio.tone({ f: 62, f2: 40, type: 'sine', dur: 0.13, vol, a: 0.004, release: 0.12 });
  audio.tone({ f: 120, f2: 70, type: 'triangle', dur: 0.05, vol: vol * 0.25, a: 0.002, release: 0.05 });
  audio.tone({ f: 54, f2: 36, type: 'sine', dur: 0.11, vol: vol * 0.75, a: 0.004, release: 0.12, delay: 0.24 });
}

/**
 * Muffle everything (a lowpass on the master bus): knocked out, ears ringing.
 * Returns a function that restores normal hearing.
 */
export function muffle(audio, freq = 420) {
  const ctx = audio.ctx;
  if (!ctx || !audio.master || !audio.comp) return () => {};
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 14000;
  lp.Q.value = 0.9;
  try {
    audio.master.disconnect();
    audio.master.connect(lp).connect(audio.comp);
    lp.frequency.setTargetAtTime(freq, ctx.currentTime, 0.35);
  } catch (e) { return () => {}; }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    try { audio.master.disconnect(); lp.disconnect(); audio.master.connect(audio.comp); } catch (e) { /* already restored */ }
  };
}

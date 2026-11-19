// The cutscenes' film kit (wave 18), shared by the journey (scenes/FallScene.js), the wake-up and Old
// Star's lessons (home/wake.js, home/lessons.js), the title loop and the ending. Nothing here
// allocates per frame.
//   ease.*                     easing curves (smootherstep by default: no jerk at either end)
//   damp(a, b, lambda, dt)     frame-rate independent exponential follow (for small corrections)
//   Spring                     a critically damped follower (scalar or Vector3): eased starts and
//                              stops, so a glide from one framing to the next never jerks
//   Handheld                   an operator's sway: layered slow sines (breathing, weight shifts,
//                              a little roll), amplitude per shot; .apply(camera, t, amp)
//   rackFog(fog, near, far, k) the "rack focus" of a pixel film: fog pulled in behind a close-up
//                              (the background melts into haze) and pushed back on a wide shot
//   sting(audio, kind, o)      short music stings from the recorded notes: warm, tender, reveal,
//                              dread, drop, impact, wake, sunrise, hush
// The hold-to-skip indicator is bookends/skipHold.js.
import * as THREE from 'three';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const ease = {
  /** smootherstep: zero velocity and acceleration at both ends. */
  smooth: (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); },
  inOut: (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
  out: (x) => { x = clamp01(x); return 1 - Math.pow(1 - x, 3); },
  in: (x) => { x = clamp01(x); return x * x * x; },
  sine: (x) => { x = clamp01(x); return -(Math.cos(Math.PI * x) - 1) / 2; },
  /** A little overshoot, then settle (anticipation's partner: follow-through). */
  back: (x) => { x = clamp01(x); const c = 1.4; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
};

/** ease.smooth over [a, b]. */
export const span = (a, b, x) => ease.smooth((x - a) / (b - a));

/** Frame-rate independent exponential follow. */
export function damp(a, b, lambda, dt) { return b + (a - b) * Math.exp(-lambda * dt); }

/**
 * A critically damped spring (Unity's SmoothDamp): follows its target with eased starts and stops.
 * new Spring(0.6) → smooth time (s, ~ time to get most of the way). Scalar: s.x / s.to(target, dt).
 * Vector: s.vec(current: Vector3, target: Vector3, dt) moves `current` in place.
 */
export class Spring {
  constructor(smoothTime = 0.5, x = 0) {
    this.T = smoothTime;
    this.x = x;
    this.v = 0;
    this._v3 = null;
  }

  static step(cur, target, vel, T, dt, out) {
    const w = 2 / Math.max(1e-4, T), x = w * dt;
    const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const ch = cur - target;
    const temp = (vel + w * ch) * dt;
    out[1] = (vel - w * temp) * e;
    out[0] = target + (ch + temp) * e;
    return out;
  }

  to(target, dt) {
    const o = Spring._o;
    Spring.step(this.x, target, this.v, this.T, dt, o);
    this.x = o[0]; this.v = o[1];
    return this.x;
  }

  snap(x) { this.x = x; this.v = 0; if (this._v3) this._v3.set(0, 0, 0); return this; }

  vec(cur, target, dt) {
    const v = this._v3 || (this._v3 = new THREE.Vector3());
    const o = Spring._o;
    Spring.step(cur.x, target.x, v.x, this.T, dt, o); cur.x = o[0]; v.x = o[1];
    Spring.step(cur.y, target.y, v.y, this.T, dt, o); cur.y = o[0]; v.y = o[1];
    Spring.step(cur.z, target.z, v.z, this.T, dt, o); cur.z = o[0]; v.z = o[1];
    return cur;
  }
}
Spring._o = [0, 0];

/**
 * An operator holding the camera: slow, layered, never repeating. sample(t) fills this.pos (m)
 * and this.rot (yaw, pitch, roll in radians) for an amplitude of 1; apply() adds them to a camera.
 */
export class Handheld {
  constructor(seed = 1) {
    this.s = seed * 1.618;
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
  }

  sample(t, amp = 1) {
    const s = this.s;
    // (breathing ~0.25 Hz, weight shifts ~0.07 Hz, a faint tremor ~1.3 Hz)
    const n = (f, p) => Math.sin(t * f + p + s);
    this.pos.set(
      (n(0.43, 0.0) * 0.6 + n(0.11, 2.1) * 0.9 + n(1.31, 4.0) * 0.08) * 0.006 * amp,
      (n(0.29, 1.3) * 0.7 + n(1.57, 0.7) * 0.1 + n(0.07, 3.3) * 0.6) * 0.005 * amp,
      (n(0.19, 5.1) * 0.8 + n(0.09, 0.4) * 0.6) * 0.004 * amp,
    );
    this.yaw = (n(0.23, 2.7) * 0.7 + n(0.061, 1.1) + n(1.13, 0.2) * 0.06) * 0.0045 * amp;
    this.pitch = (n(0.31, 0.9) * 0.6 + n(0.083, 4.4) * 0.8 + n(1.41, 2.2) * 0.05) * 0.0035 * amp;
    this.roll = (n(0.17, 3.9) * 0.8 + n(0.053, 0.6) * 0.6) * 0.004 * amp;
    return this;
  }

  /** Add the sway to a camera that has just been aimed (after lookAt). */
  apply(cam, t, amp = 1) {
    if (amp <= 0) return;
    this.sample(t, amp);
    cam.position.add(this.pos);
    cam.rotateY(this.yaw);
    cam.rotateX(this.pitch);
    cam.rotateZ(this.roll);
  }
}

/**
 * Pull a scene's fog in or out ("rack focus"): k = 0 the scene's own fog (near0, far0), k = 1 the
 * fog right behind the subject (near, far). Works on THREE.Fog; FogExp2 gets its density scaled.
 */
export function rackFog(fog, base, near, far, k) {
  if (!fog) return;
  k = clamp01(k);
  if (fog.isFogExp2) { fog.density = base.density * (1 + k * ((far || 2) - 1)); return; }
  fog.near = base.near + (near - base.near) * k;
  fog.far = base.far + (far - base.far) * k;
}

// ------------------------------------------------------------------ stings
const BELL = 1055.1, BELL2 = 963.6, GLASS = 1916.5;
const semis = (n) => Math.pow(2, n / 12);
/** A note on the bell recording (f in Hz). */
function bell(a, f, o = {}) {
  a.sample?.(o.ids || ['n_bell'], { rate: f / (o.f0 || BELL), vol: o.vol ?? 0.3, delay: o.delay || 0, a: o.a ?? 0.01, reverb: o.reverb ?? 0.45, filter: o.filter, ff: o.ff, pan: o.pan, jit: 0, dur: o.dur, release: o.release });
}

/**
 * A short music sting, built from the recorded notes (no synth): kinds
 *   warm     a soft major chord blooming in (an establishing shot, the title)
 *   tender   two quiet notes, a little hesitant (the egg)
 *   reveal   a rising arpeggio and a shimmer (the gold, a gift)
 *   dread    a low cluster and a groan under it (the ground going)
 *   drop     a falling whoosh into the dark
 *   impact   the thud at the bottom: a low boom
 *   wake     a single far bell (eyes opening)
 *   sunrise  a bright chord swelling up (the surface)
 *   hush     a soft low note (a moment held)
 * o: { vol (overall), delay }.
 */
export function sting(a, kind, o = {}) {
  if (!a?.ctx || a.ctx.state !== 'running' || !a.sample) return;
  const V = o.vol ?? 1, d = o.delay || 0;
  const n = (semi, oo = {}) => bell(a, 261.6 * semis(semi), { ...oo, vol: (oo.vol ?? 0.25) * V, delay: d + (oo.delay || 0) });
  switch (kind) {
    case 'warm':
      n(0, { a: 0.5, vol: 0.18, filter: 'lowpass', ff: 1800 }); n(7, { a: 0.6, vol: 0.14, delay: 0.08, filter: 'lowpass', ff: 1800 });
      n(16, { a: 0.7, vol: 0.12, delay: 0.18, filter: 'lowpass', ff: 2200 }); n(24, { a: 0.9, vol: 0.08, delay: 0.42 });
      break;
    case 'tender':
      n(16, { vol: 0.2, a: 0.02 }); n(19, { vol: 0.17, a: 0.02, delay: 0.34 }); n(28, { vol: 0.07, delay: 0.62, a: 0.15 });
      break;
    case 'reveal':
      [0, 4, 7, 12, 16].forEach((s, i) => n(s + 12, { vol: 0.16 - i * 0.012, delay: i * 0.075 }));
      a.sample(['sparkle1', 'sparkle2'], { vol: 0.35 * V, delay: d + 0.3, reverb: 0.5, jit: 0.04 });
      n(-12, { vol: 0.18, a: 0.4, filter: 'lowpass', ff: 900, delay: 0.05 });
      break;
    case 'dread':
      n(-24, { vol: 0.32, a: 0.8, filter: 'lowpass', ff: 500 }); n(-23, { vol: 0.26, a: 0.9, filter: 'lowpass', ff: 500, delay: 0.1 });
      n(-18, { vol: 0.16, a: 1.1, filter: 'lowpass', ff: 700, delay: 0.25 });
      a.sample(['rumble_hit1', 'rumble_hit2'], { vol: 0.35 * V, rate: 0.62, a: 0.6, delay: d + 0.15, filter: 'lowpass', ff: 260, reverb: 0.3 });
      break;
    case 'drop':
      a.sample(['whoosh_big', 'whoosh1'], { vol: 0.55 * V, rate: 0.7, rate2: 0.45, slide: 0.9, delay: d, reverb: 0.4 });
      n(-5, { vol: 0.16, delay: 0.05, filter: 'lowpass', ff: 1200 }); n(-17, { vol: 0.2, delay: 0.3, a: 0.2, filter: 'lowpass', ff: 600 });
      break;
    case 'impact':
      a.sample(['rumble_hit1', 'rumble_hit2'], { vol: 0.8 * V, rate: 0.55, delay: d, filter: 'lowpass', ff: 220, reverb: 0.5 });
      n(-29, { vol: 0.22, filter: 'lowpass', ff: 300, delay: 0.02 });
      break;
    case 'wake':
      bell(a, 523.25, { vol: 0.12 * V, delay: d, a: 0.25, reverb: 0.8, filter: 'lowpass', ff: 1500 });
      bell(a, 783.99, { vol: 0.07 * V, delay: d + 0.5, a: 0.3, reverb: 0.8, filter: 'lowpass', ff: 1700 });
      break;
    case 'sunrise':
      [0, 7, 12, 16, 19, 24].forEach((s, i) => n(s, { vol: 0.15 - i * 0.012, a: 0.25 + i * 0.1, delay: i * 0.06 }));
      bell(a, GLASS * 0.75, { ids: ['n_glass'], f0: GLASS, vol: 0.12 * V, delay: d + 0.5, reverb: 0.7 });
      break;
    case 'hush':
      n(-12, { vol: 0.16, a: 0.5, filter: 'lowpass', ff: 700 }); n(-5, { vol: 0.08, a: 0.7, delay: 0.3, filter: 'lowpass', ff: 900 });
      break;
    default: break;
  }
  void BELL2;
}

/** Decode the stings' recordings ahead of time (a sting asked for before its note is decoded would be dropped). */
export function preloadStings(a) {
  if (!a?.load) return;
  for (const id of ['n_bell', 'n_glass', 'rumble_hit1', 'rumble_hit2', 'whoosh_big', 'whoosh1', 'sparkle1', 'sparkle2']) { try { a.load(id)?.catch?.(() => {}); } catch (e) { /* no audio */ } }
}

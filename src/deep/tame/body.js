// The tame raptor's body: the Cave Raptor's rig (enemies/dinos.js) with a voice and body language
// on top, so you can read how it feels without a word on screen:
//
//   scared   low crouch, head down and pushed out, tail up and stiff, jaw open: a hiss
//   wary     half crouch, head low, tail held still, watching you
//   curious  head tilted (it changes sides), quick sniffs at the air, tail swaying slowly
//   happy    tail wagging hard, head up, eyes squeezed half shut, little hops and chirps
//   hurt     tail tucked, head low, a limp, whimpers
//
// The brains (stray.js: a wild one you're winning over; pal.js: your companion) set `this.want`
// (a mood preset plus tweaks) every frame; animate() eases the body toward it. Its hide carries
// marks: fresh claw scratches on a wild stray, pale healed scars and a braided vine collar with an
// amber bead on a companion.
import * as THREE from 'three';
import { Raptor, buildRaptor } from '../enemies/dinos.js';
import { VB, VS } from '../enemies/vox.js';
import { look } from '../enemies/rig.js';
import { sparkle } from '../enemies/fx.js';
import { clamp, rand } from '../../core/util.js';

export const MOODS = {
  calm: { wag: 0.3 },
  scared: { crouch: 0.75, low: 0.55, stiff: 1, jaw: 0.55, angry: 1 },
  wary: { crouch: 0.35, low: 0.4, stiff: 0.6 },
  curious: { tilt: 1, sniff: 0.5, wag: 0.2, perk: 0.3 },
  happy: { wag: 1, perk: 0.6, tilt: 0.35, happy: 1 },
  eat: { wag: 0.55, low: 0.3 },
  hurt: { tuck: 1, low: 0.6, limp: 1 },
  alert: { crouch: 0.3, stiff: 0.5, perk: 0.2, angry: 1 },
  rest: { wag: 0.12 },
};
const KEYS = ['wag', 'tilt', 'low', 'crouch', 'jaw', 'sniff', 'tuck', 'stiff', 'perk', 'happy', 'limp', 'angry'];

/** Painted variants of the raptor's body: 'wound' (fresh claw marks) or 'scar' (healed). */
export function paintedBody(mgr, variant, kind) {
  return mgr.geo(`tameraptor|${kind}|${variant}`, () => {
    const G = mgr.geo('raptor|' + variant, () => buildRaptor(variant));
    const src = G.body.userData.cvox || G.body.userData.vox;
    const vb = new VB(121);
    const top = new Map(); // (y, z) → outermost x on the right flank
    for (const v of src) {
      vb.set(v.x, v.y, v.z, v.c);
      const k = v.y + ',' + v.z;
      if (!top.has(k) || top.get(k) < v.x) top.set(k, v.x);
    }
    // three slanting claw marks across the right flank
    const col = kind === 'wound' ? [0x8a2224, 0xc8545a] : [0xe4caa0, 0xd8b88a];
    for (let line = 0; line < 3; line++) {
      for (let s = 0; s < 4; s++) {
        const z = -3 + line * 2 + s, y = 2 - s;
        const x = top.get(y + ',' + z);
        if (x === undefined) continue;
        vb.set(x, y, z, col[s === 0 || s === 3 ? 1 : 0]);
      }
    }
    return vb.geo(0, 0, 0);
  });
}

/** A braided vine collar with an amber bead at the throat (1/48 m voxels, body space). */
export function collarGeo(mgr) {
  return mgr.geo('tameraptor|collar', () => {
    const vb = new VB(131);
    // the neck runs from (0, 2.5, 5.5) up to (0, 6, 7.5) in body voxels (1/24 m): ring its base
    const ax = new THREE.Vector3(0, 3.5, 2).normalize();
    const w = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(1, 0, 0)).normalize();
    const C = new THREE.Vector3(0, 3.4 * 2 + 1, 6 * 2 + 1); // in 1/48 m
    const r = 2.75 * 2, cols = [0x3e6a24, 0x5a8a32, 0x7aa844, 0x5a8a32];
    const n = 44;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (const t of [-0.5, 0.5]) {
        const px = Math.cos(a) * r, py = C.y + Math.sin(a) * r * w.y + ax.y * t, pz = C.z + Math.sin(a) * r * w.z + ax.z * t;
        // a twist: the two strands cross every few voxels
        const c = cols[(i + (t > 0 ? 2 : 0)) % 4];
        vb.set(Math.round(px), Math.round(py), Math.round(pz), c);
      }
    }
    // the bead at the throat (front, underneath)
    const bx = 0, by = Math.round(C.y - r * w.y) - 1, bz = Math.round(C.z - r * w.z) + 1;
    vb.ell(bx, by, bz, 1.7, 1.7, 1.7, (x, y, z, nx, ny) => (ny > 0.35 && nx < 0.2 ? 0xffe08a : ny < -0.4 ? 0xa0601a : 0xe8962a));
    vb.set(bx - 1, by + 1, bz + 1, 0xfff6d0);
    vb.set(bx, by + 2, bz, 0xc8b070); // the knot
    return vb.geo(0, 0, 0, VS / 2);
  });
}

export class TameRaptor extends Raptor {
  /**
   * o: { x, y, z, zone (where it is), variant (0..2: its colours), size, yaw, marks: 'wound' | 'scar',
   *      collar: bool }
   */
  constructor(mgr, o) {
    const variant = ((o.variant ?? 0) % 3 + 3) % 3;
    // (the raptor's palette follows its zone: pick the one that gives this individual's colours)
    super(mgr, { ...o, zone: 3 + variant, awake: true });
    this.zone = o.zone || 1;
    this.variant = variant;
    this.tame = true;
    this.awake = true;
    this.size = o.size ?? 0.86;
    if (o.yaw !== undefined) this.yaw = o.yaw;
    this.hp = this.maxHp = 10;
    this.want = { ...MOODS.calm };
    this.md = {};
    for (const k of KEYS) this.md[k] = 0;
    this.tiltSide = Math.random() < 0.5 ? 1 : -1;
    this.tiltT = rand(1, 3);
    this.sndT = {};
    this.hopT = 0;
    this.limpT = 0;
    // its marks
    if (o.marks) { const body = this.bodyG.children.find((c) => c.isMesh); if (body) body.geometry = paintedBody(mgr, variant, o.marks); }
    if (o.collar) this.collar = this.part(collarGeo(mgr), this.mat, this.bodyG);
  }

  // ------------------------------------------------------------------ voice
  /** A sound from it, at most every `cd` seconds per kind. */
  voice(name, opts = {}, cd = 0.5) {
    if (this.mgr.time - (this.sndT[name] ?? -99) < cd) return false;
    this.sndT[name] = this.mgr.time;
    this.sound(name, opts);
    return true;
  }
  chirp(n = 2, pitch = 1) { if (this.voice('raptor_chirp', { n, pitch: pitch / Math.sqrt(this.size) }, 0.35)) this.jawOpen = 0.6; }
  trill() { if (this.voice('raptor_trill', { pitch: 1 / Math.sqrt(this.size) }, 1.2)) this.jawOpen = 0.8; }
  coo() { this.voice('raptor_coo', {}, 1.5); }
  hiss() { if (this.voice('raptor_hiss', {}, 1.4)) this.jawOpen = 1; }
  sniff(n = 3) { this.voice('raptor_sniff', { n }, 0.9); }
  whimper() { this.voice('raptor_whimper', {}, 2.2); }
  yelp() { if (this.voice('raptor_yelp', {}, 0.3)) this.jawOpen = 1; }
  /** A happy little hop. */
  hop(h = 2.2) {
    if (!this.grounded || this.hopT > 0) return;
    this.hopT = 0.45;
    this.vel.y = h;
    this.sqv += 5;
  }
  /** Warm sparkles over its head (a bond, a good meal). */
  glow(n = 8) {
    const p = this.headPos(_h);
    sparkle(this.fx, p.x, p.y + 0.1, p.z, n, [1, 0.86, 0.5], 1.2, 0.6, 0.016, 0.9);
  }

  // ------------------------------------------------------------------ body
  /** The tell glow is for enemies: a friend's wind-up never glows. */
  tell() { this.tellSet = true; this.tellW = 0; }
  /** Set the mood for this frame (a MOODS key and optional tweaks). */
  feel(name, extra) {
    const m = MOODS[name] || MOODS.calm;
    for (const k of KEYS) this.want[k] = m[k] || 0;
    if (extra) Object.assign(this.want, extra);
  }

  /**
   * The Cave Raptor's own animation (dinos.js), with the mood on top, and the head always on what
   * it's minding (this.lookAt: you, the food, the creature it's biting; never your eyes in a fight).
   */
  animate(dt) {
    const md = this.md, w = this.want, mk = Math.min(1, dt * 6);
    for (const k of KEYS) md[k] += ((w[k] || 0) - md[k]) * mk;
    this.hopT = Math.max(0, this.hopT - dt);
    const A = this.atk, t = this.t, sp = Math.hypot(this.vel.x, this.vel.z);
    this.legs.update(dt);
    let lean = clamp(sp * 0.06, 0, 0.25), jaw = 0.05;
    if (A?.a.id === 'snap') {
      const k = A.phase === 'tell' ? clamp(A.t / A.a.tell, 0, 1) : 0;
      if (A.phase === 'tell') { lean = -0.25 * k; jaw = 0.7 * k; } else if (A.phase === 'go') { lean = 0.35; jaw = 0.7 - 0.7 * clamp(A.t / 0.08, 0, 1); }
    }
    if (!this.grounded) lean -= 0.15;
    const kk = Math.min(1, dt * 12);
    this.leanK += (lean - this.leanK) * kk; this.jawK += (jaw - this.jawK) * kk;
    const rest = this.restK;
    // crouch: the hips sink, the body tips forward; a limp dips one step in two
    this.limpT += dt * (2 + sp * 3.2);
    const limp = md.limp * clamp(sp, 0, 1) * Math.max(0, Math.sin(this.limpT)) * 1.6;
    this.bodyG.rotation.x = this.leanK + rest * 0.15 + Math.sin(t * 2.4) * 0.02 + md.crouch * 0.14 - md.perk * 0.08;
    this.hips.position.y = (12 - rest * 6 - md.crouch * 3.2 - limp) * VS + Math.abs(Math.sin(t * (6 + sp * 2.5))) * 0.4 * VS * clamp(sp / 2, 0, 1);
    // little arms: tucked when hurt, flapping when happy
    this.arms.forEach((a, i) => { a.rotation.x = -0.3 + Math.sin(t * 5 + i) * 0.1 + (A ? -0.6 : 0) + md.happy * Math.sin(t * 14 + i * 1.7) * 0.35 + md.tuck * 0.4; });
    // the head: on what it minds, low, perked, tilted (it changes sides now and then), sniffing
    if ((this.tiltT -= dt) <= 0) { this.tiltT = rand(1.4, 3.2); this.tiltSide = -this.tiltSide; }
    this.tiltK = (this.tiltK ?? 0) + (this.tiltSide - (this.tiltK ?? 0)) * Math.min(1, dt * 5);
    if (rest > 0.5) this.neck.rotation.set(0.6, 0.5, 0.2);
    else {
      if (this.headDown > 0.3) this.neck.rotation.x += (1 - this.neck.rotation.x) * Math.min(1, dt * 6);
      else look(this.neck, this.lookAt, dt, { yaw: 1, pitch: 0.6, rate: 9, basePitch: 0.15 + md.low * 0.35 - md.perk * 0.2 + md.sniff * Math.max(0, Math.sin(t * 19)) * 0.14 });
      this.neck.rotation.z += (md.tilt * 0.42 * this.tiltK - this.neck.rotation.z) * Math.min(1, dt * 8);
    }
    // the jaw: open while it talks, hisses, chirps
    if (this.talking) this.jawOpen = Math.max(this.jawOpen || 0, 0.5 + 0.5 * Math.sin(t * 22));
    this.jawOpen = Math.max(0, (this.jawOpen || 0) - dt * 3);
    this.jaw.rotation.x = this.jawK + this.jawOpen * 0.4 * (0.6 + 0.4 * Math.sin(t * 25)) + md.jaw * 0.5 * (0.7 + 0.3 * Math.sin(t * 30));
    // the tail: a wag is a faster, wider sway; tucked droops, stiff lifts and holds still
    const tc = this.tailChain.o;
    tc.sway = 0.08 + md.wag * 0.42 - md.stiff * 0.05;
    tc.swayHz = 6 + md.wag * 8;
    tc.droop = -0.04 + md.tuck * 0.32 - md.stiff * 0.18;
    this.tailChain.update(dt, this, { pitch: -(A ? 0.2 : 0) });
    this.eyes.geometry = md.angry > 0.5 || A ? this.G.angry : this.G.eyes;
    this.eyeOpen = this.asleep ? 0 : 1;
    this.squint = 1 - md.happy * 0.5;
  }
}

const _h = new THREE.Vector3();

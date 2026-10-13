// Nugget the hen at hi-res: layered scalloped feathers, a fanned tail, folded wings with
// primaries, serrated comb, wattles, a two-part beak, scaly legs with toes, and an optional
// woven straw hat with a ribbon. Same rig layout and API as the classic hen.
import * as THREE from 'three';
import { Vox, mix, dk, lt, h3, cached, partMesh, PY, NY, PZ } from './vox.js';

const V16 = 1 / 16;
const COMB = 0xe0302a;
const BEAK = 0xf0b030;
const LEG = 0xf0a030;

function featherScallop(c, x, y, z, e, k = 1) {
  // overlapping rows of rounded feathers: darker crescent along each feather's lower edge
  const r = Math.floor((y + z * 0.35 + 40) / 3);
  const off = (r & 1) * 1.5;
  const lx = ((x + off + 40) % 3 + 3) % 3;
  const ly = (y + z * 0.35 + 40) - r * 3;
  if (ly < 0.9 && lx > 0.4 && lx < 2.6) return dk(c, 0.11 * k);
  if (ly > 2.2 && lx > 1 && lx < 2) return lt(c, 0.05 * k);
  return c;
}

function hatGeo(bake) {
  return cached(`hen-hat|${bake}`, () => {
    const v = new Vox(-12, 12, -1, 9, -12, 12);
    // woven brim
    v.fill(-12, 12, 0, 1, -12, 12, (x, y, z) => x * x + z * z <= 10.6 * 10.6, (x, y, z) => {
      const r = Math.hypot(x + 0.5, z + 0.5);
      if (r > 9.6) return 0xc89a48;
      const weave = ((Math.floor(r) + Math.floor((Math.atan2(z, x) + 4) * 5)) & 1);
      return weave ? 0xe8c870 : 0xd8b058;
    });
    // crown
    v.fill(-6, 6, 1, 7, -6, 6, (x, y, z) => {
      const rr = 5.3 - Math.max(0, y - 4) * 0.7;
      return x * x + z * z <= rr * rr;
    }, (x, y, z) => {
      if (y === 1 || y === 2) return y === 2 ? 0xd84a3a : 0xb83a2e; // ribbon
      return ((y + Math.floor((Math.atan2(z, x) + 4) * 4)) & 1) ? 0xe0c060 : 0xd0aa50;
    });
    // ribbon bow on the side with tails
    v.ell(5.6, 2, 2.4, 1.2, 1.2, 1.2, 0xc94032);
    v.ell(6.2, 2.6, 4.2, 1, 1.6, 1.6, 0xd84a3a);
    v.ell(6.2, 2.6, 0.8, 1, 1.6, 1.6, 0xd84a3a);
    v.line(6.4, 1.5, 2.6, 7.4, -0.5, 3.6, 0xb83a2e, 0.6);
    // a little blue flower
    v.set(-5, 3, 3, 0x6aa8e8); v.set(-5, 4, 3, 0x6aa8e8); v.set(-5, 3, 4, 0x6aa8e8); v.set(-5, 2, 3, 0x6aa8e8); v.set(-5, 3, 2, 0x6aa8e8);
    v.set(-6, 3, 3, 0xf8e070);
    return v.geometry(bake);
  });
}

export function makeChicken(opts = {}) {
  const s = V16 * (opts.scale ?? 1);
  const vs = s / 2;
  const kind = opts.kind || 'toon';
  const bake = kind === 'basic';
  const feather = opts.color ?? 0xf6f0e4;
  const mk = (geo, outline = true) => partMesh(geo, kind, vs, outline);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // ---------------------------------------------------------------- body
  const bodyGeo = cached(`hen-body|${feather}|${bake}`, () => {
    const v = new Vox(-11, 11, -4, 26, -18, 14);
    v.ell(0, 5, -0.5, 8, 7.2, 9.4, 0, 1);
    v.ell(0, 4.6, 4.2, 6.8, 6.4, 5.8, 0, 2); // fluffy chest
    v.ell(0, 7.2, -6, 6.6, 6.2, 5.4, 0, 1); // rump
    // fanned tail plumes rising at the back
    const plume = (cx, by, bz, ty, tz, w, m) => {
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const y = by + (ty - by) * t, z = bz + (tz - bz) * t - Math.sin(t * Math.PI) * 1.2;
        const r = w * (1 - t * 0.55);
        v.ell(cx, y, z, r * 0.45 + 0.6, r * 0.8 + 0.4, r * 0.9 + 0.4, 0, m);
      }
    };
    plume(0, 9, -8, 18.5, -12.5, 3.2, 3);
    plume(-2.2, 8.5, -8, 16.5, -13, 2.8, 4);
    plume(2.2, 8.5, -8, 16.5, -13, 2.8, 4);
    plume(-3.6, 8, -7.5, 13.5, -13.2, 2.4, 3);
    plume(3.6, 8, -7.5, 13.5, -13.2, 2.4, 3);
    v.resolve({
      1: (x, y, z, e) => {
        let c = z < -4 && y > 6 ? dk(feather, 0.04) : feather;
        c = featherScallop(c, x, y, z, e);
        if (e & NY) c = dk(c, 0.06);
        return c;
      },
      2: (x, y, z, e) => {
        // chest fluff: softer, little tufts
        let c = feather;
        if (h3(x >> 1, y, z >> 1, 12) < 0.2) c = dk(c, 0.05);
        if ((e & PZ) && (x + y * 2) % 5 === 0) c = lt(c, 0.04);
        return c;
      },
      3: (x, y, z) => {
        // tail feathers: a darker shaft and grey-tipped ends
        let c = feather;
        if (Math.abs(x + 0.5) < 0.6) c = dk(c, 0.1);
        if (y > 15) c = mix(c, 0xb8b0a8, 0.35);
        return c;
      },
      4: (x, y, z) => (y > 13 ? mix(feather, 0xb8b0a8, 0.3) : (y + z) % 3 === 0 ? dk(feather, 0.08) : dk(feather, 0.03)),
    });
    return v.geometry(bake, [0, 0, 0]);
  });
  body.position.y = s * 4;
  const bodyMesh = mk(bodyGeo);
  body.add(bodyMesh);

  // ---------------------------------------------------------------- head
  const head = new THREE.Group();
  head.position.set(0, s * 5.5, s * 4);
  const headGeo = cached(`hen-head|${feather}|${bake}`, () => {
    const v = new Vox(-8, 8, -5, 22, -9, 15);
    v.ell(0, 1, -0.6, 4.8, 3.6, 4.8, 0, 1); // neck fluff
    v.ell(0, 6.2, 0.4, 5.3, 6.2, 5.2, 0, 1, 2.4); // head
    // serrated comb: a row of rounded points from front to back
    const combs = [[3.2, 3.2], [1, 4.6], [-1.4, 4.4], [-3.6, 3.2], [-5.2, 2]];
    for (const [cz, h] of combs) {
      const top = v.topY(0, Math.round(cz));
      v.ell(0, top + h / 2 + 0.2, cz, 1.25, h / 2 + 0.6, 1.3, 0, 2);
    }
    // beak: upper hooks down over the lower
    v.fill(-3, 3, 3, 9, 4, 11, (x, y, z) => {
      const t = (z - 4.6) / 4.8;
      if (t < 0 || t > 1) return false;
      const w = 2 * (1 - t * 0.75), top = 7.8 - t * 1.6, bot = 5.6 - t * 0.2 + t * t * 0.8;
      return Math.abs(x) <= w && y <= top && y >= bot;
    }, 0, 3);
    v.fill(-2, 2, 3, 6, 4, 9, (x, y, z) => {
      const t = (z - 4.8) / 3;
      return t >= 0 && t <= 1 && Math.abs(x) <= 1.4 * (1 - t * 0.6) && y >= 4.4 && y <= 5.5;
    }, 0, 4);
    // wattles under the beak
    for (const sx of [-1, 1]) v.ell(sx * 1.1, 2.6, 5.4, 1.3, 2.1, 1.1, 0, 2);
    // little red cheek patches around the eyes
    v.resolve({
      1: (x, y, z, e) => {
        let c = feather;
        if (y < 3) c = featherScallop(c, x, y, z, e, 0.8);
        if ((e & PY) && y > 10) c = lt(c, 0.04);
        const cheek = Math.hypot(Math.abs(x + 0.5) - 4.4, y + 0.5 - 6.4, z + 0.5 - 1.6) < 1.6;
        if (cheek) c = mix(c, 0xf08a8a, 0.55);
        return c;
      },
      2: (x, y, z, e) => ((e & PY) ? lt(COMB, 0.18) : (e & NY) ? dk(COMB, 0.18) : COMB),
      3: (x, y, z, e) => (z > 8 ? lt(BEAK, 0.15) : (e & PY) ? lt(BEAK, 0.1) : BEAK),
      4: () => dk(BEAK, 0.18),
    });
    return v.geometry(bake);
  });
  head.add(mk(headGeo));
  // eyes on the front corners of the head so they read from the front
  const eyeGeo = cached(`hen-eye|${bake}`, () => {
    const v = new Vox(0, 3, 0, 3, 0, 1);
    const D = 0x140c10;
    v.set(0, 2, 0, 0xffffff); v.set(1, 2, 0, D); v.set(2, 2, 0, D);
    v.set(0, 1, 0, D); v.set(1, 1, 0, D); v.set(2, 1, 0, D);
    v.set(1, 0, 0, D); v.set(2, 0, 0, 0x3a2a3a);
    return v.geometry(bake, [1.5, 1.5, 0]);
  });
  const eyes = [-1, 1].map((side) => {
    const e = new THREE.Group();
    // on the head's surface, turned slightly outward so they read from the front and side
    e.position.set(side * 3.05 * vs, 7.4 * vs, 4.75 * vs);
    e.rotation.y = side * 0.6;
    const m = mk(eyeGeo);
    if (side < 0) m.scale.x = -vs;
    e.add(m);
    head.add(e);
    return e;
  });
  body.add(head);

  // ---------------------------------------------------------------- wings
  const wingGeo = cached(`hen-wing|${feather}|${bake}`, () => {
    const v = new Vox(-3, 3, -11, 3, -15, 6);
    v.fill(-3, 3, -11, 3, -15, 6, (x, y, z) => {
      // teardrop: round at the shoulder, tapering back to the primaries
      const t = (4 - z) / 17;
      if (t < 0 || t > 1) return false;
      const top = 1.2 - t * 3.2, bot = -6.4 + t * 2.4 + t * t * 1.6;
      const half = 1.7 - t * 0.6;
      return y <= top && y >= bot && Math.abs(x + 0.5) <= half && (t > 0.08 || y > bot + 1.4);
    }, 0, 1);
    v.resolve({
      1: (x, y, z, e) => {
        let c = feather;
        if (z < -5) {
          // primaries: long feathers with dark separations
          if ((y + 40) % 2 === 0) c = dk(c, 0.12);
          if (z < -10) c = mix(c, 0xa8a098, 0.4);
        } else {
          c = featherScallop(c, x, y, z, e, 1.1);
        }
        if (e & NY) c = dk(c, 0.08);
        return c;
      },
    });
    return v.geometry(bake);
  });
  const wings = [-1, 1].map((side) => {
    const w = new THREE.Group();
    w.position.set(side * 8.4 * vs, 8 * vs, -1 * vs);
    const m = mk(wingGeo);
    if (side < 0) m.scale.x = -vs;
    w.add(m);
    body.add(w);
    return w;
  });

  // ---------------------------------------------------------------- legs
  const legGeo = cached(`hen-leg|${bake}`, () => {
    const v = new Vox(-5, 5, -9, 2, -5, 8);
    v.line(0, 1, 0, 0, -7, 0.6, 0, 0.95, 1);
    for (const [tx, tz] of [[-3, 4.2], [0, 5.4], [3, 4.2], [0, -2.6]]) v.line(0, -7.5, 0.6, tx, -7.6, tz, 0, 0.6, 2);
    v.carve(-5, 5, -9, -8, -5, 8, (x, y) => y < -8);
    v.resolve({
      1: (x, y) => ((y + 40) % 2 === 0 ? LEG : dk(LEG, 0.12)),
      2: (x, y, z) => (Math.abs(z) > 4.5 || (Math.abs(x) > 2.5 && z > 3.5) ? 0x4a3020 : LEG),
    });
    return v.geometry(bake);
  });
  const legs = [-1, 1].map((side) => {
    const l = new THREE.Group();
    l.position.set(side * 1.8 * s, 4 * s, 0);
    const m = mk(legGeo);
    if (side < 0) m.scale.x = -vs;
    l.add(m);
    root.add(l);
    return l;
  });

  let hat = null;
  if (opts.hat === 'straw') {
    hat = mk(hatGeo(bake));
    hat.position.set(0, 12.2 * vs, -0.4 * vs);
    hat.rotation.set(-0.12, 0, 0.1);
    head.add(hat);
  }
  const rig = new ChickenRig({ root, body, head, wings, legs, eyes, s, bodyMesh, vs });
  root.userData.rig = rig;
  return rig;
}

export class ChickenRig {
  constructor(parts) {
    Object.assign(this, parts);
    this.state = 'idle';
    this.t = Math.random() * 5;
    this.facing = 0;
    this.targetFacing = 0;
    this.peckT = 0;
    this.flapT = 0;
    this.blinkT = 2;
  }
  play(state) { if (this.state !== state) { this.state = state; this.stateT = 0; } }
  face(yaw, instant) { this.targetFacing = yaw; if (instant) this.facing = yaw; }
  peck() { this.peckT = 0.5; }
  flap(d = 0.8) { this.flapT = d; }
  update(dt) {
    this.t += dt;
    let d = this.targetFacing - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * Math.min(1, dt * 10);
    this.root.rotation.y = this.facing;
    const { body, head, wings, legs, s } = this;
    body.position.y = s * 4;
    body.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    head.position.set(0, s * 5.5, s * 4);
    legs[0].rotation.x = 0;
    legs[1].rotation.x = 0;
    wings[0].rotation.z = 0;
    wings[1].rotation.z = 0;
    const t = this.t;
    if (this.state === 'walk' || this.state === 'run') {
      const f = this.state === 'run' ? 18 : 11;
      legs[0].rotation.x = Math.sin(t * f) * 0.7;
      legs[1].rotation.x = -Math.sin(t * f) * 0.7;
      body.rotation.z = Math.sin(t * f) * 0.12;
      head.position.z = s * 4 + Math.sin(t * f * 2) * s * 0.8;
      body.position.y += Math.abs(Math.sin(t * f)) * s * 0.6;
      if (this.state === 'run') { wings[0].rotation.z = -0.25 - Math.abs(Math.sin(t * f)) * 0.2; wings[1].rotation.z = 0.25 + Math.abs(Math.sin(t * f)) * 0.2; }
    } else if (this.state === 'sit') {
      body.position.y = s * 2.2;
      legs[0].visible = legs[1].visible = false;
    } else {
      head.rotation.z = Math.sin(t * 1.7) * 0.15;
      head.rotation.y = Math.sin(t * 0.6) * 0.4;
    }
    if (this.state !== 'sit') legs[0].visible = legs[1].visible = true;
    if (this.peckT > 0) {
      this.peckT -= dt;
      const k = Math.sin((0.5 - this.peckT) / 0.5 * Math.PI * 2);
      head.rotation.x = Math.max(0, k) * 1.1;
      body.rotation.x = Math.max(0, k) * 0.35;
    }
    if (this.flapT > 0) {
      this.flapT -= dt;
      const f = Math.sin(t * 40) * 0.9 + 0.6;
      wings[0].rotation.z = -f;
      wings[1].rotation.z = f;
      body.position.y += s * 1.2;
    }
    // fluffy breathing
    if (this.bodyMesh) {
      const b = Math.sin(t * (this.state === 'sit' ? 1.6 : 2.6)) * 0.018;
      this.bodyMesh.scale.set(this.vs * (1 + b), this.vs * (1 + b * 0.5), this.vs * (1 + b * 0.6));
    }
    this.blinkT -= dt;
    const blink = this.blinkT < 0.1 || (this.state === 'sit' && Math.sin(t * 0.5) > 0.6);
    if (this.blinkT < 0) this.blinkT = 1.5 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = blink ? 0.2 : 1;
  }
  setTint(color) {
    this.root.traverse((o) => { if (o.isMesh && o.material && o.material.color) o.material.color.copy(color); });
  }
}

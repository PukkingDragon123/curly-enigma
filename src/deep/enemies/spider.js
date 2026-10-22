// Giant Cave Spider: eight legs that really step (IK, alternating tetrapod gait), eight glowing eyes,
// fangs that open. It lurks by its webs, crouched and still, until the mole blunders into a web or
// comes close; it shies from the lamp. It hunts bats, critters and kobolds.
//   bite    rears up, fangs spread, a hiss, then darts in (yellow: block or parry)
//   pounce  crouches and leaps on you from a few meters away (yellow)
//   web     curls its abdomen forward and spits a glob of web: caught, you can barely move for a
//           couple of seconds (a raised guard catches it)
// Webs (Webs, below) are sheets of silk strung across tunnels near its lair: walking into one slows
// you to a crawl and twangs (the spider comes running). Cut them with the pick: a little silk.
import * as THREE from 'three';
import { Beast } from './beast.js';
import { Legs } from './rig.js';
import { VB, VS, mul, mix, c01 } from './vox.js';
import { puff, sparkle } from './fx.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { rand, clamp } from '../../core/util.js';

const PAL = {
  1: { s: [0x2e1e14, 0x4a3020, 0x6a4a2c, 0x8e6a3e], mark: 0xe8d8b0, eye: 0xff4a2a, crystal: null, fang: 0x2a1a12 },
  3: { s: [0x1a1428, 0x2a2042, 0x3e3260, 0x5e4c88], mark: 0xb0e8ff, eye: 0x9affff, crystal: [0x4a8ad8, 0x9ad8ff, 0xe0f8ff], fang: 0x1a1428 },
  4: { s: [0x161212, 0x261c1c, 0x382a26, 0x523a32], mark: 0xff6a2a, eye: 0xffb040, crystal: null, fang: 0x120c0c },
};
const palFor = (z) => PAL[z >= 4 ? 4 : z >= 3 ? 3 : 1];
const BODY_Y = 8.5; // body height (voxels) when standing

export function buildSpider(zone) {
  const P = palFor(zone), S = P.s;
  const sc = (vb, k0 = 0.35) => (x, y, z, nx, ny, nz) => {
    if (typeof ny !== 'number') { ny = 0; nz = 0; }
    const n = vb.n(x, y, z);
    return S[Math.floor(clamp(k0 + ny * 0.42 + (n - 0.5) * 0.3, 0, 0.999) * 4)];
  };
  const body = new VB(71), bs = sc(body);
  body.ell(0, 0, 3, 4.6, 3, 5, bs); // cephalothorax
  body.ell(0, 2.4, -7.5, 6.6, 5.4, 8, bs); // abdomen
  body.ell(0, 1, -1.5, 2.2, 2, 2, bs); // waist
  // markings on the abdomen: a pale chevron stripe and spots; bristles
  body.paint((x, y, z, c) => {
    if (!body.open(x, y, z, 0, 1, 0) || z > -1) return undefined;
    const u = -z - 2;
    if (Math.abs(Math.abs(x) - (u % 4) * 0.6) < 0.7 && u % 4 < 2.5 && u < 13) return P.mark;
    if (body.n(x, y, z, 4) > 0.9) return mul(P.mark, 0.8);
    return undefined;
  });
  for (let i = 0; i < 40; i++) { const h = body.hitFrom(rand(-8, 8), 12, rand(-16, 6), 0, -1, 0); if (h) body.set(h[0], h[1] + 1, h[2], S[0]); }
  body.box(-1, 0, -16, 0, 1, -15, mul(S[2], 1.1)); // spinnerets
  const glow = new VB(72);
  if (P.crystal) for (let i = 0; i < 7; i++) {
    const h = body.hitFrom(rand(-4, 4), 12, -4 - i * 1.6, 0, -1, 0);
    if (!h) continue;
    for (let k = 0; k < 3 + (i % 3); k++) glow.set(h[0], h[1] + 1 + k, h[2] + (k > 1 ? -1 : 0), P.crystal[Math.min(2, k)]);
  }
  // eyes: two big ones in front, six small around
  const eyes = new VB();
  const eyeSpots = [[1, 1, 1.5], [-2, 1, 1.5], [2, 2, 1], [-3, 2, 1], [0, 2.5, 0.5], [-1, 2.5, 0.5], [3, 0, 0.5], [-4, 0, 0.5]];
  eyeSpots.forEach(([x, y], i) => {
    const h = body.hitFrom(x, y, 14, 0, 0, -1);
    if (!h) return;
    eyes.set(h[0], h[1], h[2] + 1, i < 2 ? 0xffffff : P.eye);
    if (i < 2) { eyes.set(h[0] + (x > 0 ? 1 : -1), h[1], h[2] + 1, P.eye); eyes.set(h[0], h[1] - 1, h[2] + 1, P.eye); eyes.set(h[0] + (x > 0 ? 1 : -1), h[1] - 1, h[2] + 1, mul(P.eye, 0.7)); }
  });
  // fangs (one mesh per side, pivot at the root) and feelers
  const fang = new VB(73);
  fang.ell(0, 0, 0, 1.3, 1.4, 1.3, S[1]);
  fang.cap(0, -0.5, 0.5, 0.4, -3.5, 1.4, 0.8, (x, y, z, t) => (t > 0.6 ? 0xd8c8b0 : P.fang));
  const palp = new VB(74);
  palp.cap(0, 0, 0, 0, 0.5, 3.4, 0.7, S[2]); palp.cap(0, 0.5, 3.4, 0, -1.2, 4.6, 0.6, S[1]);
  // legs: femur (up from the body to the knee) and tibia (down to the foot), banded
  const fem = new VB(75);
  fem.cap(0, 0, 0, 0, -11, 0, 1.15, (x, y, z, t) => (t > 0.85 ? S[3] : (Math.floor(t * 6) % 2 ? S[1] : S[2])));
  for (let i = 0; i < 10; i++) fem.set(i % 2 ? 1 : -2, -1 - i, i % 3 - 1, S[0]); // bristles
  const tib = new VB(76);
  tib.cap(0, 0, 0, 0, -13, 0, 0.85, (x, y, z, t) => (t > 0.85 ? mul(P.mark, 0.6) : t < 0.1 ? S[3] : (Math.floor(t * 5) % 2 ? S[1] : S[2])));
  const V = (vb, px = 0, py = 0, pz = 0) => vb.geo(px, py, pz);
  return { body: V(body), glow: glow.size ? V(glow) : null, eyes: V(eyes, 0, 1, 0), fang: V(fang), palp: V(palp), fem: V(fem), tib: V(tib), hide: c01(S[2]), eye: c01(P.eye) };
}

// ------------------------------------------------------------------ webs
/** A web: radial spokes and a spiral, r voxels, in the XY plane. */
function buildWeb(r, seed) {
  const v = new VB(seed);
  const n = 11;
  const line = (ax, ay, bx, by, c) => { const L = Math.ceil(Math.hypot(bx - ax, by - ay)); for (let i = 0; i <= L; i++) v.set(Math.round(ax + (bx - ax) * i / L), Math.round(ay + (by - ay) * i / L), 0, c); };
  const ends = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + v.n(i, 0, 0) * 0.3; const rr = r * (0.85 + v.n(i, 1, 0) * 0.15); ends.push([Math.cos(a) * rr, Math.sin(a) * rr, a]); line(0, 0, Math.cos(a) * rr, Math.sin(a) * rr, 0xf4f8ff); }
  for (let k = 0; k < 7; k++) {
    for (let i = 0; i < n; i++) {
      const f0 = (2 + k * (r - 3) / 7 + i * 0.12) / r, f1 = (2 + k * (r - 3) / 7 + (i + 1) * 0.12) / r;
      const a = ends[i], b = ends[(i + 1) % n];
      line(a[0] * f0, a[1] * f0, b[0] * f1, b[1] * f1, k % 2 ? 0xdce4f0 : 0xeef4ff);
    }
  }
  v.set(0, 0, 0, 0xffffff);
  return v;
}

export class Webs {
  constructor(mgr) {
    this.mgr = mgr;
    this.list = [];
    this.mat = mgr.material({ emissive: 0.25, alpha: 0.78 });
    this.mat.side = THREE.DoubleSide;
  }
  /** String a web across the cave around (x, y, z) facing `yaw` (the way through). */
  add(x, y, z, yaw, r = 1.1) {
    const m = this.mgr;
    if (this.list.length >= 8) this.remove(this.list[0]);
    const rv = Math.round(r / VS);
    const geo = m.geo('web|' + rv, () => buildWeb(rv, 7).geo(0, 0, 0));
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.layers.enable(LAYER_OUTLINE);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    m.root.add(mesh);
    const w = { isWeb: true, alive: true, x, y, z, r, yaw, nx: Math.sin(yaw), nz: Math.cos(yaw), mesh, hp: 2, wob: 0, t: 0, info: { name: 'Spider web' }, passive: true, spheres: [], center: new THREE.Vector3(x, y, z), lastHit: new THREE.Vector3() };
    w.cut = (power, dir) => this.cut(w, power, dir);
    this.list.push(w);
    return w;
  }
  /** Strings webs across the ways into a spider's lair. */
  lair(cx, cy, cz, n = 3) {
    const m = this.mgr, w = m.world;
    for (let k = 0; k < 14 && n > 0; k++) {
      const a = Math.random() * Math.PI * 2, d = rand(1.2, 4);
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
      const f = m.floorAt(x, cy + 0.8, z, 1.2, 3, 1.5);
      if (!f || m.excluded(f.x, f.y, f.z, 1)) continue;
      const y = f.y + 0.75;
      // span it across the narrower way: the facing whose sideways room is smallest
      let best = null;
      for (let i = 0; i < 4; i++) {
        const yaw = i * Math.PI / 4;
        const sx = Math.cos(yaw), sz = -Math.sin(yaw);
        const l = w.raycast(x, y, z, sx, 0, sz, 2.2)?.dist ?? 2.2, r2 = w.raycast(x, y, z, -sx, 0, -sz, 2.2)?.dist ?? 2.2;
        const span = Math.min(l, r2);
        if (!best || span < best.span) best = { yaw, span };
      }
      const r = clamp(best.span + 0.15, 0.6, 1.5);
      if (this.list.some((q) => Math.hypot(q.x - x, q.z - z) < 1.6)) continue;
      this.add(x, y, z, best.yaw, r);
      n--;
    }
  }
  remove(w) { w.alive = false; w.mesh.removeFromParent(); this.list.splice(this.list.indexOf(w), 1); }
  clear() { for (const w of [...this.list]) this.remove(w); }
  cut(w, power) {
    const m = this.mgr;
    w.hp -= power;
    w.wob = 1;
    m.sound('web_tear', { vol: 0.8 });
    for (let i = 0; i < 10; i++) m.fx.spawn({ x: w.x + rand(-w.r, w.r) * 0.6, y: w.y + rand(-w.r, w.r) * 0.6, z: w.z + rand(-w.r, w.r) * 0.6, vx: rand(-0.4, 0.4), vy: rand(-0.2, 0.4), vz: rand(-0.4, 0.4), life: rand(0.8, 1.6), size: rand(0.01, 0.02), color: [0.92, 0.95, 1], alpha: 0.8, drag: 2, grav: 0.4 });
    if (w.hp <= 0) {
      this.remove(w);
      m.noise(w.x, w.y, w.z, 6, 'web');
      if (Math.random() < 0.6) m.dropItem({ center: w.center }, 'spider_silk', 0, 0.5);
    }
    return { hitStop: 0.02, shake: 0.03, kick: 0.5, tag: null, combo: 0 };
  }
  /** A web the pick would hit before `reach` (a ray against its disc). */
  hitTest(eye, dir, reach) {
    let best = null, bt = reach;
    for (const w of this.list) {
      const dn = dir.x * w.nx + dir.z * w.nz;
      if (Math.abs(dn) < 1e-3) continue;
      const t = ((w.x - eye.x) * w.nx + (w.z - eye.z) * w.nz) / dn;
      if (t < 0 || t > bt) continue;
      const px = eye.x + dir.x * t - w.x, py = eye.y + dir.y * t - w.y, pz = eye.z + dir.z * t - w.z;
      if (px * px + py * py + pz * pz > w.r * w.r * 0.8) continue;
      bt = t; best = w;
    }
    if (best) best.lastHit.set(eye.x + dir.x * bt, eye.y + dir.y * bt, eye.z + dir.z * bt);
    return best;
  }
  update(dt) {
    const m = this.mgr, pl = m.pl;
    for (const w of [...this.list]) {
      w.t += dt;
      if (Math.hypot(w.x - pl.pos.x, w.z - pl.pos.z) > 40) { this.remove(w); continue; }
      // the mole walks into it: stuck, the web twangs and the spider comes
      const side = (pl.pos.x - w.x) * w.nx + (pl.pos.z - w.z) * w.nz;
      const ox = pl.pos.x - w.x - w.nx * side, oz = pl.pos.z - w.z - w.nz * side, oy = pl.pos.y + 0.4 - w.y;
      if (Math.abs(side) < 0.3 && ox * ox + oz * oz + oy * oy < w.r * w.r) {
        m.webbed = Math.max(m.webbed, 0.6);
        if (!w.touchT || w.t - w.touchT > 2) { w.touchT = w.t; w.wob = 1; m.sound('web_tear', { vol: 0.4 }); m.noise(w.x, w.y, w.z, 9, 'web'); m.say('web', 'Sticky! A <b>spider web</b>. Cut it with your pick.', 'warn', 60); }
      }
      w.wob = Math.max(0, w.wob - dt * 1.5);
      w.mesh.scale.set(1 + Math.sin(w.t * 30) * 0.03 * w.wob, 1 - Math.sin(w.t * 26) * 0.03 * w.wob, 1);
      w.mesh.rotation.x = Math.sin(w.t * 1.3 + w.x) * 0.02 + Math.sin(w.t * 18) * 0.06 * w.wob;
    }
  }
  blast(x, y, z, r) { for (const w of [...this.list]) if (Math.hypot(w.x - x, w.y - y, w.z - z) < r * 1.4) this.cut(w, 9); }
  dispose() { this.clear(); this.mat.dispose(); }
}

// ------------------------------------------------------------------ the spider
const _v = new THREE.Vector3();

export class Spider extends Beast {
  static info = {
    id: 'cave_spider', name: 'Giant Cave Spider', color: '#b07a4a', hits: 3.2, dmg: 5, poise: 2, tier: 3, flesh: true, snd: 'flesh',
    diet: 'hunt', social: 'solo', aggro: 'hostile', sleepy: 0.5, sight: 9, hear: 1.3, walk: 1.2, run: 3.4, turn: 5, accel: 9,
    keep: 2.8, close: 1.2, agile: true, jump: 4.5, space: [0.45, 0.8], prey: ['critter', 'shade_bat', 'kobold', 'pebble_mimic'], lightShy: 3.4,
    wakeR: 3.6, harvest: ['spider_silk'], metabolism: 0.004, depth: [14, 130], lie: 0, keepFar: 32, glowBits: false,
  };
  static attacks = [
    { id: 'bite', range: [0, 1.6], arc: 0.6, tell: 0.55, dur: 0.32, hitAt: 0.08, rec: 0.6, cd: [1.1, 1.9], w: 2.5,
      start() { this.sound('spider_hiss', {}); },
      go() { this.vel.x += Math.sin(this.yaw) * 3.2; this.vel.z += Math.cos(this.yaw) * 3.2; },
      hit(A) { return this.strikeAt(A, this.reachPoint(0.25, 0), 0.32, { dmg: this.info.dmg, push: 2.4, kind: 'bite' }); } },
    { id: 'pounce', range: [2, 4.4], arc: 0.45, tell: 0.6, dur: 0.6, hitAt: 0.05, rec: 0.7, cd: [2.2, 3.4], w: 1.4,
      start() { this.sound('chitter', {}); },
      go(A) { const t = this.targetPos(A); const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz) || 1; const v = Math.min(7, Math.max(0, d - 0.55) / 0.5); this.vel.set(dx / d * v, 4, dz / d * v); this.sound('whoosh', { vol: 0.5 }); },
      hit(A) { return A.t > 0.55 || this.strikeAt(A, this.reachPoint(0.15, 0), 0.38, { dmg: this.info.dmg * 1.2, push: 3.2, kind: 'bite' }); } },
    { id: 'spit', range: [3, 9], arc: 0.3, tell: 0.55, dur: 0.2, rec: 0.6, cd: [3, 4.5], w: 1, noPrey: true,
      when(e) { return e.sees && e.mgr.webbed <= 0; },
      go() { this.spit(); } },
  ];
  static lair(m, e, n) { m.webs?.lair(n.x, e.pos.y, n.z, 3); e.lurk = true; e.fallAsleep(); }

  /** The shared model for a zone; Enemies' prewarm builds it before a first sighting. */
  static warm(mgr, zone) {
    const z = zone >= 4 ? 4 : zone >= 3 ? 3 : 1;
    return mgr.geo('spider|' + z, () => buildSpider(z));
  }
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.34; this.h = 0.62; this.cy = 0.36; this.hitR = 0.38;
    this.mass = 2; this.kb = 2.4;
    this.size = rand(0.95, 1.12) * (this.zone >= 4 ? 1.15 : 1);
    this.step = 0.3; this.friction = 11;
    this.springK = 200; this.springC = 10; this.sqScale = 0.6;
    const G = this.G = Spider.warm(mgr, this.zone);
    this.hitCol = G.hide;
    this.mat = this.material({});
    this.eyeMat = this.material({ emissive: 1.4, rimK: 0.3 });
    if (G.glow) this.glowMat = this.material({ emissive: 1.2 });
    this.bodyG = this.group3(this.root, 0, BODY_Y * VS, 0);
    this.part(G.body, this.mat, this.bodyG);
    if (G.glow) this.part(G.glow, this.glowMat, this.bodyG);
    this.eyes = this.part(G.eyes, this.eyeMat, this.bodyG, 0, 1 * VS, 0);
    this.headObj = this.bodyG; this.headTop = 3.5 * VS; this.headFwd = 6 * VS;
    this.fangs = [1, -1].map((sd) => { const f = this.part(G.fang, this.mat, this.bodyG, sd * 1.4 * VS, -1.5 * VS, 7 * VS); if (sd < 0) f.scale.x = -1; return f; });
    this.palps = [1, -1].map((sd) => { const p = this.part(G.palp, this.mat, this.bodyG, sd * 2.6 * VS, -1 * VS, 6 * VS); return p; });
    // eight legs around the cephalothorax, knees high
    const defs = [];
    const order = [[1, 0], [-1, 1], [1, 1], [-1, 0], [1, 0], [-1, 1], [1, 1], [-1, 0]];
    for (let i = 0; i < 4; i++) for (const sd of [1, -1]) {
      const a = (i - 1.5) * 0.42; // fore-aft spread of the hips
      const hip = [sd * 3.2 * VS, 0, (3 + Math.sin(a) * -3) * VS - i * 1.1 * VS];
      const out = [Math.cos(a * 1.4) * 0.62, (i - 1.5) * -0.32];
      const thigh = this.part(G.fem, this.mat, this.bodyG), shin = this.part(G.tib, this.mat, this.bodyG);
      const group = (i + (sd > 0 ? 0 : 1)) % 2;
      defs.push({ parent: this.bodyG, hip, l1: 11 * VS, l2: 13 * VS, thigh, shin, knee: [sd * 0.7, 1, 0], rest: [sd * out[0], out[1]], group, lift: 0.1 });
    }
    void order;
    this.legs = new Legs(this, defs, { stride: 0.26, stepT: 0.16, lead: 0.12, speedK: 0.25, onStep: (L, k) => { if (this.dist < 8 && Math.random() < 0.3) this.sound('click', { vol: 0.15 }); } });
    this.fangK = 0; this.rear = 0; this.curl = 0;
    this.lurk = !!o.lurk;
    if (this.asleep) this.restK = 0.6;
  }

  spit() {
    const m = this.mgr, pl = m.pl;
    const h = this.reachPoint(0.1, 0.05, new THREE.Vector3());
    const T = clamp(this.dist / 8, 0.35, 0.9);
    const tx = pl.pos.x + pl.vel.x * T * 0.6, ty = pl.pos.y + 0.5, tz = pl.pos.z + pl.vel.z * T * 0.6;
    const g = 6;
    const v = [(tx - h.x) / T, (ty - h.y + 0.5 * g * T * T) / T, (tz - h.z) / T];
    const geo = m.geo('web_glob', () => { const r = new VB(77); r.ell(0, 0, 0, 2, 2, 2, (x, y, z, nx, ny) => (ny > 0.3 ? 0xffffff : 0xd8e0ec)); r.set(2, 0, 0, 0xe8f0ff); r.set(-2, 1, 0, 0xe8f0ff); return r.geo(0, 0, 0); });
    m.addShot({
      x: h.x, y: h.y, z: h.z, v, g, geo, dmg: 1, zone: this.zone, src: this, kind: 'web', mat: m.webs.mat, bounces: 0, trail: [0.9, 0.93, 1], spin: 0.5,
      onHit: (s, from) => {
        // a guard up in front catches it; otherwise: stuck
        if (m.blocking && m.combat.incoming(this, 0, [0, 0, 0], 'web_glob', { from, noParry: true }).blocked) return;
        m.webbed = Math.max(m.webbed, 2.4);
        m.say('webbed', 'Webbed! You can barely move. <b>Raise your guard</b> to catch the next one.', 'bad', 40);
        m.sound('splat', { vol: 0.7 });
      },
    });
    this.sound('web_shot', {});
  }

  // ------------------------------------------------------------------ behaviour flavour
  onNotice() { this.sound('spider_hiss', {}); this.rearK = 1; }
  onWake() { this.sound('chitter', {}); this.lurk = false; }
  onTaunt() { if (Math.random() < 0.5) this.sound('chitter', { vol: 0.7 }); }
  onHit() { this.sound('chitter', { vol: 1 }); this.rearK = 0.6; }
  onLit() {
    // shies from the lamp: backs off a few steps
    this.stun(0.5, 'recoil');
    const [dx, dz] = this.dirToPlayer();
    this.vel.x -= dx * 2.5; this.vel.z -= dz * 2.5;
    this.sound('spider_hiss', { vol: 0.6 });
  }

  // ------------------------------------------------------------------ body
  animate(dt) {
    const A = this.atk, t = this.t;
    this.legs.update(dt);
    let fang = 0.1 + Math.sin(t * 7) * 0.05, rear = 0, curl = 0, low = 0;
    if (A) {
      const k = A.phase === 'tell' ? clamp(A.t / A.a.tell, 0, 1) : 0;
      if (A.a.id === 'bite') { if (A.phase === 'tell') { rear = 0.45 * k; fang = 0.1 + 0.7 * k; } else if (A.phase === 'go') { rear = -0.15; fang = 0.8 - 0.8 * clamp(A.t / 0.1, 0, 1); } }
      if (A.a.id === 'pounce') { if (A.phase === 'tell') { low = 0.45 * k; fang = 0.6 * k; } else if (A.phase === 'go') { rear = 0.3; fang = 0.8; } }
      if (A.a.id === 'spit') { if (A.phase === 'tell') { curl = 0.6 * k; rear = 0.2 * k; } else curl = 0.6 - 0.6 * clamp(A.t / 0.2, 0, 1); }
    }
    if (this.headDown > 0.3) { fang = 0.4 + Math.sin(t * 14) * 0.3; low = 0.2; }
    this.rearK = Math.max(0, (this.rearK || 0) - dt * 2);
    rear += this.rearK * 0.35 * Math.sin(this.rearK * 9);
    const kk = Math.min(1, dt * 12);
    this.fangK += (fang - this.fangK) * kk; this.rear += (rear - this.rear) * kk; this.curl += (curl - this.curl) * kk;
    const rest = this.restK;
    this.bodyG.position.y = (BODY_Y - low * 4 - rest * 4.5) * VS + Math.sin(t * 2) * 0.15 * VS;
    this.bodyG.rotation.x = -this.rear + this.curl * 0.3;
    this.fangs[0].rotation.set(this.fangK * 0.4, 0, -this.fangK * 0.6);
    this.fangs[1].rotation.set(this.fangK * 0.4, 0, this.fangK * 0.6);
    this.palps.forEach((p, i) => { p.rotation.x = Math.sin(t * 5 + i * 1.7) * 0.3 - this.rear; });
    this.eyeOpen = this.asleep && !this.lurk ? 0.2 : 1;
    this.eyeMat.uniforms.emissive.value = this.asleep ? 0.5 : 1.3 + this.tellK * 0.8;
  }

  light() {
    if (this.dist > 12 || this.asleep) return null;
    const c = this.G.eye;
    return { x: this.center.x + Math.sin(this.yaw) * 0.3, y: this.center.y + 0.1, z: this.center.z + Math.cos(this.yaw) * 0.3, c: [c[0] * 0.35, c[1] * 0.35, c[2] * 0.35], r: 1.6 };
  }

  deathFx() {
    const c = this.center;
    this.sound('spider_hiss', { vol: 0.7 });
    puff(this.fx, c.x, c.y, c.z, 6, this.G.hide, 0.2, 0.3, 0.07, 0.5);
    sparkle(this.fx, c.x, c.y, c.z, 6, this.G.eye, 1.2, 2, 0.016, 0.5);
  }
}

// Cave Troll: a hunched giant of the middle depths (grey-green and warty in the Crystal Grotto, sooty
// with ember cracks in the Magma Deep, shaggy and frost-white in the Frost Vault), dragging a
// stalactite club. Usually found asleep and snoring in its den; noise, the lamp in its face or a mole
// walking right up wakes it. Slow to turn (circle it), slow to swing, but it hits like a cave-in:
//   sweep   a backhand swing of the club (yellow: block it; parry it and it reels)
//   smash   club raised high with both fists, a roar, then down: the ground cracks and a
//           shockwave rolls out (red: too heavy to block, jump the wave)
//   hurl    from afar it rips a rock out of the floor and throws it
// It hates light: a lamp shone in its eyes up close makes it cover its face and stumble.
// It eats anything (carcasses, kobolds, mushrooms).
import * as THREE from 'three';
import { Beast } from './beast.js';
import { Legs, Chain, look } from './rig.js';
import { VB, mul, mix, c01 } from './vox.js';
import { shockRing, puff, pebbles, sparkle } from './fx.js';
import { rand, clamp } from '../../core/util.js';

const TV = 1 / 20; // meters per troll voxel
const HIP = 16;

const LOOKS = {
  3: { s: [0x3a4a3a, 0x52664c, 0x6e8462, 0x92a882], belly: 0x8a9a76, wart: 0x2e3a2c, hair: [0x3a2e22, 0x54402c], eye: 0xffd040, dress: 'moss' },
  4: { s: [0x2e2624, 0x463a34, 0x5e4e44, 0x7a685a], belly: 0x6a5a4c, wart: 0x1e1816, hair: [0x221a16, 0x3a2c22], eye: 0xff8030, dress: 'ember' },
  5: { s: [0x5a6a7a, 0x7a8c9c, 0x9cb0c0, 0xc8d8e4], belly: 0xb0c0cc, wart: 0x4a5866, hair: [0xd8e4ec, 0xf4f8fc], eye: 0x7ae0ff, dress: 'frost' },
};
const lookFor = (z) => LOOKS[z >= 5 ? 5 : z >= 4 ? 4 : 3];

export function buildTroll(zone) {
  const L = lookFor(zone), S = L.s;
  const sc = (vb, k0 = 0.35) => (x, y, z, nx, ny, nz) => {
    if (typeof ny !== 'number') { ny = 0; nz = 0; }
    const n = vb.n(x, y, z);
    if (n > 0.93) return L.wart; // warts
    const k = clamp(k0 + ny * 0.4 + nz * 0.06 + (n - 0.5) * 0.4, 0, 0.999);
    return S[Math.floor(k * 4)];
  };
  // ---------------- torso (pivot at the hips): pot belly, a hunched back, boulder shoulders
  const torso = new VB(51), ts = sc(torso);
  torso.ell(0, 3, 0, 8, 5, 6.5, ts);
  torso.ell(0, 8.5, 2, 9.5, 8, 8.5, ts); // belly
  torso.ell(0, 15, -1, 11, 7, 9, ts); // chest
  torso.ell(0, 19, -4, 8.5, 5.5, 7, ts); // hump
  for (const sd of [1, -1]) torso.ell(sd * 11.5, 17, 0, 5.8, 5.2, 5.8, ts);
  torso.paint((x, y, z, c) => (z > 7 && Math.abs(x) < 6 && y > 3 && y < 14 ? (torso.n(x, y, z, 3) > 0.9 ? L.wart : L.belly) : undefined));
  // a loincloth of hides, a rope belt
  torso.paint((x, y, z, c) => {
    if (y === 4 || y === 5) return (x + z) % 3 ? 0x5a4a2e : 0x7a6438;
    if (y < 4 && y > -4 && (z > 4 || z < -4) && Math.abs(x) < 6) return torso.n(x, y, z, 5) < 0.5 ? 0x6a4a2e : 0x82603a;
    return undefined;
  });
  torso.box(-5, -3, 5, 5, 3, 7, (x, y, z) => (z >= 6 && (y > -3 || Math.abs(x) < 4) ? (torso.n(x, y, z, 6) < 0.5 ? 0x6a4a2e : 0x82603a) : -1));
  torso.box(-5, -3, -7, 5, 3, -6, (x, y, z) => (torso.n(x, y, z, 6) < 0.5 ? 0x6a4a2e : 0x82603a));
  // shaggy hair / moss / frost along the spine and the shoulders
  torso.paint((x, y, z, c) => {
    if (!(torso.open(x, y, z, 0, 1, 0) || torso.open(x, y, z, 0, 0, -1)) || y < 11) return undefined;
    const n = torso.n(x, y, z, 9);
    if (L.dress === 'moss' && n < 0.55 && z < 3) return n < 0.25 ? 0x3a7a2e : 0x4e9a3a;
    if (L.dress === 'frost' && n < 0.7) return n < 0.3 ? L.hair[0] : L.hair[1];
    if (L.dress === 'ember' && n < 0.4 && z < 0) return L.hair[(x + y) & 1];
    return undefined;
  });
  const glow = new VB(52);
  if (L.dress === 'ember') {
    // glowing cracks over the chest and back
    for (let i = 0; i < 40; i++) {
      const x = Math.round(torso.n(i, 1, 0) * 18 - 9), y = Math.round(6 + torso.n(i, 2, 0) * 14);
      const h = torso.hitFrom(x, y, i % 2 ? 14 : -14, 0, 0, i % 2 ? -1 : 1);
      if (h) { torso.del(...h); glow.set(...h, torso.n(i, 3, 0) < 0.5 ? 0xff6a1a : 0xffb040); }
    }
  }
  // ---------------- head (pivot at the neck): low, heavy brow, big nose, tusks in an underbite
  const head = new VB(53), hs = sc(head, 0.4);
  head.ell(0, 4, 1, 6, 5.2, 5.6, hs);
  head.ell(0, 7, 4.6, 5.6, 1.8, 2.6, (x, y, z, nx, ny) => mul(hs(x, y, z, nx, ny, 0), 0.85)); // brow
  head.ell(0, 3.4, 7.4, 2.6, 3.2, 2.6, (x, y, z, nx, ny) => (ny > 0.5 ? S[3] : S[2])); // the nose
  for (const sd of [1, -1]) { head.set(sd > 0 ? 1 : -2, 1, 8, L.wart); head.ell(sd * 5.2 - (sd < 0 ? 1 : 0), 5, 0, 1.4, 2.6, 1.6, hs); } // nostrils, ears
  head.paint((x, y, z) => (L.dress === 'frost' && y > 6 && head.open(x, y, z, 0, 1, 0) ? L.hair[1] : L.dress === 'moss' && y > 7 && head.n(x, y, z, 2) < 0.4 ? 0x3a6a2a : undefined));
  const eyeAt = [];
  for (const sd of [1, -1]) {
    const h = head.hitFrom(sd * 2.8 - (sd < 0 ? 1 : 0), 5, 16, 0, 0, -1);
    if (h) { eyeAt.push(h); head.set(h[0], h[1], h[2], 0x140c08); }
  }
  const jaw = new VB(54), jsh = sc(jaw, 0.25);
  jaw.ell(0, -1, 4.6, 5.2, 2.3, 4, jsh);
  for (const sd of [1, -1]) jaw.cap(sd * 3 - (sd < 0 ? 1 : 0), 0, 6.4, sd * 3.4 - (sd < 0 ? 1 : 0), 3.4, 6.6, 0.8, (x, y, z, t) => (t > 0.6 ? 0xfff6e0 : 0xe0d4b4)); // tusks
  for (let x = -2; x <= 1; x++) jaw.set(x, 1, 7, 0xe8dcc0);
  const eyes = new VB(), angry = new VB();
  for (const [vb, mad] of [[eyes, false], [angry, true]]) for (const [ex, ey, ez] of eyeAt) {
    vb.set(ex, ey, ez + 1, L.eye); vb.set(ex + (ex > 0 ? 1 : -1), ey, ez + 1, mad ? 0xff3a1a : L.eye);
    if (!mad) vb.set(ex, ey + 1, ez + 1, 0xffffff);
  }
  // ---------------- limbs
  const thigh = new VB(55); thigh.cap(0, 0, 0, 0, -8.5, 0.5, 4, sc(thigh, 0.45));
  const shin = new VB(56); shin.cap(0, 0, 0, 0, -8.5, -0.5, 3.2, sc(shin, 0.3));
  const foot = new VB(57);
  foot.ell(0, 1.5, 1.5, 3.8, 2, 4.6, sc(foot, 0.25));
  for (const x of [-3, -1, 1, 3]) foot.ell(x - 0.5, 1, 5.6, 1.1, 1, 1.2, (x2, y, z, nx, ny) => (ny > 0.3 ? S[2] : S[1]));
  for (const x of [-3, -1, 1, 3]) foot.set(Math.round(x - 0.5), 1, 7, 0x2a2018);
  const arm = new VB(58), as = sc(arm, 0.42);
  arm.cap(0, 0, 0, 0.5, -10.5, 1, 3.6, as);
  arm.cap(0.5, -10.5, 1, 0.5, -19.5, 4, 3.1, as);
  arm.ell(0.5, -22, 5, 4.2, 3.8, 4.3, sc(arm, 0.3));
  for (const x of [-2, 0, 2]) arm.set(x, -24, 9, L.wart);
  if (L.dress === 'frost') arm.paint((x, y, z) => (y > -9 && arm.open(x, y, z, 0, 0, -1) && arm.n(x, y, z) < 0.6 ? L.hair[1] : undefined));
  // the club: a broken stalactite lashed to a branch, a rock in its head
  const club = new VB(59);
  club.cap(0, -5, 0, 0, 8, 0, 1.6, (x, y, z) => (y % 3 ? 0x5a4026 : 0x6e5030));
  club.cap(0, 8, 0, 0, 22, 1, 4.2, (x, y, z, t) => {
    const n = club.n(x, y, z);
    return n > 0.85 ? 0x9aa4a0 : mix(0x6a6460, 0x9a948c, clamp(t + (n - 0.5) * 0.5, 0, 1));
  });
  for (const [x, y, z] of [[3, 16, 2], [-3, 13, -1], [1, 20, 4], [-2, 19, -3]]) club.cap(x * 0.5, y, z * 0.5, x * 1.4, y + 2, z * 1.4, 0.8, 0xc8c4bc); // stone spikes
  for (let y = 6; y <= 9; y++) for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) club.set(x, y, z, 0x8a7448); // the lashing
  const V = (vb, px = 0, py = 0, pz = 0) => vb.hollow().geo(px, py, pz, TV);
  return {
    torso: V(torso), glow: glow.size ? glow.geo(0, 0, 0, TV) : null, head: V(head), jaw: V(jaw), eyes: eyes.geo(0, 5, 0, TV), angry: angry.geo(0, 5, 0, TV),
    thigh: V(thigh), shin: V(shin), foot: V(foot), arm: V(arm), club: V(club),
    hide: c01(S[1]), dust: [0.45, 0.4, 0.34], hot: L.dress === 'ember',
  };
}

const _v = new THREE.Vector3();

export class Troll extends Beast {
  static info = {
    id: 'cave_troll', name: 'Cave Troll', color: '#8aa06a', hits: 10, dmg: 8, poise: 3, tier: 4, flesh: true, snd: 'flesh',
    diet: 'omni', social: 'solo', aggro: 'territorial', territory: 10, sleepy: 0.8, sight: 12, hear: 0.8, deep: 2.4, walk: 0.85, run: 1.9,
    turn: 2.2, accel: 4, keep: 2.6, close: 1.6, space: [0.5, 2.4], wakeR: 3.2, snore: 'big_snore', snorePitch: 0.8, lightShy: 4.2,
    harvest: ['beast_hide', 'beast_hide'], metabolism: 0.003, depth: [45, 160], lie: 1, keepFar: 34, patience: 12, parryStun: 1.6,
  };
  static attacks = [
    { id: 'sweep', range: [0, 2.3], arc: 0.7, tell: 0.7, dur: 0.38, hitAt: 0.14, rec: 0.7, cd: [1.6, 2.6], w: 2,
      start() { this.sound('grunt', { pitch: 0.8 }); },
      hit(A) { return this.strikeAt(A, this.reachPoint(0.55, 0.25), 0.75, { dmg: this.info.dmg, push: 5.5, up: 2.4 }); } },
    { id: 'smash', range: [0, 2.6], arc: 0.6, tell: 1.15, dur: 0.6, hitAt: 0.13, rec: 1.3, cd: [2.6, 3.8], w: 1.4, heavy: true,
      start() { this.sound('roar_big', { pitch: 1.35, vol: 0.9 }); },
      hit(A) {
        const p = this.reachPoint(0.9, 0);
        p.y = this.pos.y;
        this.slamFx(p);
        this.strikeAt(A, _v.set(p.x, p.y + 0.4, p.z), 0.8, { dmg: this.info.dmg * 1.5, push: 6, up: 3.5, heavy: true });
        return true;
      } },
    { id: 'hurl', range: [4, 11], arc: 0.35, tell: 1.0, dur: 0.25, rec: 0.9, cd: [3.5, 5], w: 1, noPrey: true,
      when(e) { return e.sees; },
      start() { this.sound('grunt', { pitch: 0.7 }); pebbles(this.fx, this.pos.x, this.pos.y + 0.1, this.pos.z, 8, this.G.dust, 0.3, 2); },
      go() { this.hurl(); } },
  ];

  /** The shared model for a zone; Enemies' prewarm builds it before a first sighting. */
  static warm(mgr, zone) {
    const z = zone >= 5 ? 5 : zone >= 4 ? 4 : 3;
    return mgr.geo('troll|' + z, () => buildTroll(z));
  }
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.42; this.h = 2.0; this.cy = 1.1; this.hitR = 0.62;
    this.mass = 7; this.kb = 1.4;
    this.size = rand(0.95, 1.08);
    this.step = 0.34; this.friction = 9;
    this.springK = 120; this.springC = 11; this.sqScale = 0.4;
    const G = this.G = Troll.warm(mgr, this.zone);
    this.hitCol = G.hide;
    this.mat = this.material({});
    this.eyeMat = this.material({ emissive: 1.1, rimK: 0 });
    if (G.glow) this.glowMat = this.material({ emissive: 1.4 });
    this.hips = this.group3(this.root, 0, HIP * TV, 0);
    this.torsoG = this.group3(this.hips);
    this.part(G.torso, this.mat, this.torsoG);
    if (G.glow) this.part(G.glow, this.glowMat, this.torsoG);
    this.neck = this.group3(this.torsoG, 0, 16.5 * TV, 9.5 * TV);
    this.headObj = this.neck; this.headTop = 9 * TV; this.headFwd = 4 * TV;
    this.part(G.head, this.mat, this.neck);
    this.jaw = this.group3(this.neck, 0, 2 * TV, 1 * TV);
    this.part(G.jaw, this.mat, this.jaw);
    this.eyes = this.part(G.eyes, this.eyeMat, this.neck, 0, 5 * TV, 0);
    this.shoulders = [1, -1].map((sd) => this.group3(this.torsoG, sd * 12.5 * TV, 17 * TV, 0.5 * TV));
    this.arms = this.shoulders.map((s, i) => { const a = this.part(G.arm, this.mat, s); if (i) a.scale.x = -1; return a; });
    this.hand = this.group3(this.shoulders[0], 0.5 * TV, -22 * TV, 5 * TV);
    this.club = this.part(G.club, this.mat, this.hand);
    const legDefs = [1, -1].map((sd, i) => {
      const thigh = this.part(G.thigh, this.mat, this.hips), shin = this.part(G.shin, this.mat, this.hips);
      const foot3 = this.part(G.foot, this.mat, this.root);
      return { parent: this.hips, hip: [sd * 5 * TV, 0, 0], l1: 8.5 * TV, l2: 8.5 * TV, thigh, shin, foot3, knee: [0, 0, 1], rest: [sd * 0.26, 0.05], group: i, lift: 0.14 };
    });
    this.legs = new Legs(this, legDefs, { stride: 0.42, stepT: 0.42, lead: 0.25, speedK: 0.2, onStep: (L, k) => this.footfall(L, k) });
    this.armK = [0, 0]; this.armZ = [0, 0]; this.armY = 0; this.leanK = 0.35; this.clubK = 0;
    this.coverT = 0;
    if (this.asleep) this.restK = 1;
  }

  footfall(L) {
    if (this.dist > 14) return;
    const p = L.foot;
    this.fx.dust(p.x, p.y + 0.03, p.z, 3, this.mgr.dustCol(this.pos), 0.12);
    this.sound('stomp', { vol: 0.35 });
    if (this.mode === 'fight' && this.dist < 6) this.mgr.shake(this, 0.12);
  }

  slamFx(p) {
    const m = this.mgr;
    shockRing(this.fx, p.x, p.y, p.z, 0.3, 4.4, this.G.dust, 60);
    pebbles(this.fx, p.x, p.y + 0.1, p.z, 18, this.G.dust, 0.4, 4);
    puff(this.fx, p.x, p.y + 0.1, p.z, 14, this.G.dust, 0.5, 0.4, 0.1, 0.7);
    this.fx.sparks(p.x, p.y + 0.1, p.z, 10, [1, 0.8, 0.45], [0, 1, 0], 3);
    this.sound('smash', { vol: 1 });
    this.sound('stomp', { vol: 1 });
    this.sound('break', { snd: 'stone', vol: 0.8 });
    m.addHazard({ kind: 'ring', x: p.x, y: p.y, z: p.z, r: 0.3, speed: 4.4, rMax: 3.4, dmg: this.info.dmg * 0.8, src: this });
    m.shake(this, 0.9);
    m.noise(p.x, p.y, p.z, 14, 'slam');
  }

  hurl() {
    const m = this.mgr, pl = m.pl;
    this.hand.updateWorldMatrix(true, false);
    const h = this.hand.getWorldPosition(new THREE.Vector3());
    h.y += 0.3;
    const T = clamp(this.dist / 9, 0.45, 1.1);
    const tx = pl.pos.x + pl.vel.x * T * 0.5, ty = pl.pos.y + 0.45, tz = pl.pos.z + pl.vel.z * T * 0.5;
    const g = 9;
    const v = [(tx - h.x) / T, (ty - h.y + 0.5 * g * T * T) / T, (tz - h.z) / T];
    const geo = m.geo('troll_rock', () => { const r = new VB(60); r.ell(0, 0, 0, 3.5, 3, 3.5, (x, y, z, nx, ny) => (r.n(x, y, z) > 0.8 ? 0x5a524a : ny > 0.3 ? 0x8a8278 : 0x6a625a)); return r.geo(0, 0, 0, TV); });
    m.addShot({ x: h.x, y: h.y, z: h.z, v, g, geo, dmg: this.info.dmg * 0.8, zone: this.zone, src: this, kind: 'rock', mat: this.mat, bounces: 0, trail: [0.45, 0.4, 0.35], r: 0.15, spin: 0.8 });
    this.sound('whoosh', { vol: 0.8, pitch: 0.6 });
  }

  // ------------------------------------------------------------------ behaviour flavour
  onNotice() { this.sound('roar_big', { pitch: 1.25, vol: 0.8 }); this.jawOpen = 1.6; this.mgr.shake(this, 0.3); }
  onWake(startled) { this.sound('grunt', { pitch: 0.7 }); this.jawOpen = 1; if (startled) this.decT = 0; }
  onTaunt() { if (Math.random() < 0.4) { this.sound('growl', { pitch: 0.6, dur: 0.9 }); this.jawOpen = 0.8; } }
  onHit() { this.sound('grunt', { pitch: rand(0.8, 1) }); this.jawOpen = 0.8; }
  onLit() {
    // the lamp right in its eyes: it covers its face and stumbles back
    this.coverT = 1.2;
    this.stun(1.1, 'dazed');
    this.sound('growl', { pitch: 0.8, dur: 0.6 });
    this.mgr.say('troll_light', 'The troll <b>hates the light</b>! Shine your lamp in its eyes.', 'good', 120);
  }

  // ------------------------------------------------------------------ body
  animate(dt) {
    const A = this.atk, sp = Math.hypot(this.vel.x, this.vel.z), t = this.t;
    this.legs.update(dt);
    const walk = clamp(sp / 1.5, 0, 1);
    const ph = t * (3.2 + sp * 2.2);
    // arms: knuckle-dragging swing; θ (x) per arm, spread (z), the club lifted with the right
    let r = -0.15 + Math.sin(ph) * 0.35 * walk, l = -0.15 - Math.sin(ph) * 0.35 * walk, rz = 0.18, lz = -0.18, ay = 0, lean = 0.32 + walk * 0.08, club = -0.6;
    if (A) {
      const id = A.a.id, k = A.phase === 'tell' ? clamp(A.t / A.a.tell, 0, 1) : 0;
      if (id === 'smash') {
        if (A.phase === 'tell') { r = l = -0.2 - 2.75 * k; rz = 0.18 - 0.16 * k; lz = -0.18 + 0.16 * k; lean = 0.32 - 0.5 * k; club = -0.6 + 0.4 * k; }
        else if (A.phase === 'go') { const g = clamp(A.t / 0.13, 0, 1); r = l = -2.95 + 2.2 * g; lean = -0.18 + 0.85 * g; club = -0.2 + 1.2 * g; rz = 0.04; lz = -0.04; }
        else { const q = clamp(A.t / A.a.rec, 0, 1); r = l = -0.75 + 0.6 * q; lean = 0.67 - 0.35 * q; club = 1 - 1.6 * q; }
        this.sqT = A.phase === 'tell' ? 0.06 * k : 0;
      } else if (id === 'sweep') {
        if (A.phase === 'tell') { r = -1.3 * k; rz = 0.18 + 0.9 * k; ay = 0.6 * k; lean = 0.25; club = -0.6 + 0.8 * k; }
        else if (A.phase === 'go') { const g = clamp(A.t / 0.16, 0, 1); r = -1.3; rz = 1.08 - 1.5 * g; ay = 0.6 - 1.3 * g; club = 0.2 + 0.6 * g; }
        else { const q = clamp(A.t / A.a.rec, 0, 1); r = -1.3 * (1 - q); rz = -0.42 + 0.6 * q; ay = -0.7 * (1 - q); club = 0.8 - 1.4 * q; }
      } else if (id === 'hurl') {
        if (A.phase === 'tell') { r = 0.5 - 3.2 * Math.min(1, k * 1.4); lean = 0.6 - 0.8 * k; }
        else r = -2.7 + 2.4 * clamp(A.t / 0.15, 0, 1);
      }
    }
    if (this.coverT > 0) { this.coverT -= dt; r = l = -2.3; rz = -0.5; lz = 0.5; lean = 0.1; }
    else if (this.stunT > 0) { r = 0.2 + Math.sin(t * 6) * 0.2; l = 0.2 - Math.sin(t * 6) * 0.2; lean = 0.5; }
    const kk = Math.min(1, dt * (A && A.phase === 'go' ? 24 : 7));
    this.armK[0] += (r - this.armK[0]) * kk; this.armK[1] += (l - this.armK[1]) * kk;
    this.armZ[0] += (rz - this.armZ[0]) * kk; this.armZ[1] += (lz - this.armZ[1]) * kk;
    this.armY += (ay - this.armY) * kk;
    this.clubK += (club - this.clubK) * kk;
    this.shoulders[0].rotation.set(this.armK[0], 0, this.armZ[0]);
    this.shoulders[1].rotation.set(this.armK[1], 0, this.armZ[1]);
    this.club.rotation.x = this.clubK;
    // torso: hunched, rocking with the gait, lying down asleep
    const rest = this.restK;
    this.leanK += (lean - this.leanK) * kk;
    const breathe = Math.sin(t * (this.asleep ? 1.4 : 2.2)) * 0.025;
    this.torsoG.rotation.set(this.leanK + rest * 0.55 + breathe, this.armY * 0.5, Math.sin(ph) * 0.05 * walk);
    this.hips.position.y = (HIP - rest * 9) * TV + Math.abs(Math.sin(ph)) * 0.8 * TV * walk;
    if (rest > 0.5) this.neck.rotation.set(0.3 * rest, 0, 0.25 * rest);
    else if (this.headDown > 0.05) this.neck.rotation.x += (0.7 - this.neck.rotation.x) * Math.min(1, dt * 4);
    else look(this.neck, this.mode === 'fight' || A ? this.mgr.eye : this.lookAt, dt, { yaw: 0.8, pitch: 0.5, rate: 4, basePitch: -0.2 });
    this.jawOpen = Math.max(0, (this.jawOpen || 0) - dt * 1.5);
    this.jaw.rotation.x = 0.06 + Math.min(1, this.jawOpen) * 0.45 + (A && A.phase === 'tell' ? 0.25 : 0) + (this.asleep ? 0.12 + Math.sin(t * 1.4) * 0.05 : 0);
    this.eyes.geometry = this.mode === 'fight' || A ? this.G.angry : this.G.eyes;
    this.eyeOpen = this.asleep ? 0 : Math.min(1, this.eyeOpen + dt * 3);
    if (this.coverT > 0) this.eyeOpen = 0.2;
    if (this.G.hot && Math.random() < dt * 4 && this.dist < 14) this.fx.ember(this.center.x + rand(-0.4, 0.4), this.center.y + rand(-0.2, 0.6), this.center.z + rand(-0.4, 0.4));
  }

  light() {
    if (!this.G.hot || this.dist > 18) return null;
    return { x: this.center.x, y: this.center.y + 0.3, z: this.center.z, c: [1.1, 0.42, 0.12], r: 2.8 };
  }

  deathFx() {
    const c = this.center;
    this.sound('roar_big', { pitch: 0.9, vol: 0.8 });
    this.sound('stomp', { vol: 1 });
    puff(this.fx, c.x, this.pos.y + 0.3, c.z, 14, this.G.dust, 0.6, 0.4, 0.12, 0.6);
    this.mgr.shake(this, 0.6);
  }
}

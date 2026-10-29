// Old Star, the old star-nosed mole blacksmith whose camp this is. He goes about his day between
// his places (STAR_SPOTS in house.js): hammering at the anvil (clang, sparks off the face), pumping
// the bellows (the coals flare), stirring the pot on the fire, a sit in his old armchair in the
// shack, rereading his notes or a book, a look at the lift or at his slate of the million, a drink
// at the spring, and at night he sleeps on his cot in the shack (snoring). He turns his head to follow you when you're near, his
// star nose wiggles when he sniffs you out. E has him talk (the lessons, or a tip for where you
// are). His model is src/gfx/char/starmole.js (makeStarMole); expressions come from the rig when
// it has them (setExpression), and he talks through the tutor card (game.ui.tutor).
import * as THREE from 'three';
import { makeCharacter } from '../gfx/characters.js';
import { VoxelGrid, M32, ring, line, wood } from '../iso/kit.js';
import { clamp, rand, pick } from '../core/util.js';
import { HALL } from './units.js';
import { STAR_SPOTS, SPOTS } from './house.js';

const starMods = import.meta.glob('../gfx/char/starmole.js');
const _v = new THREE.Vector3();
const _w2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HEIGHT = 0.76; // meters to the top of his head: a little shorter than you, stooped with age
const SPEED = 0.85;
const NAME = 'Old Star';
const ease = (k) => k * k * (3 - 2 * k);

/** The stand-in if his own model can't load: an elderly grey starnose. */
const FALLBACK = {
  seed: 4242, species: 'starnose', age: 'elder', body: 'stocky', fur: 0x7a726c, eyes: 'sleepy', outfit: 'vest',
  outfitColor: 0x6a4a32, hat: 'none', glasses: true, scarf: 0xb8442e, dirt: 0.25, blush: true, brows: 'bushy',
  cane: false, backpack: false, patches: 2, freckles: false, earring: false, tuft: true, fabric: 'plaid', eyeColor: 0x3a3a5a,
};

/** Something for his paws, in 1/64 m voxels, scaled into the rig by the caller. */
function heldThing(kind) {
  if (kind === 'hammer') {
    const g = new VoxelGrid(12, 34, 8);
    line(g, [[6, 0, 4], [6, 26, 4]], 0.9, wood(0x8a5a32, { pw: 99 }));
    g.box(2, 24, 2, 9, 6, 5, (x, y) => (y === 29 ? 0x6a6a74 : 0x3e3e46));
    g.box(10, 25, 3, 2, 4, 3, 0x8a8a96);
    return M32(g, [6, 4, 4]);
  }
  if (kind === 'ladle') {
    const g = new VoxelGrid(10, 34, 10);
    line(g, [[5, 0, 5], [5, 28, 5]], 0.6, wood(0x9a6a3e, { pw: 99 }));
    ring(g, 5, 5, 0, 3.4, 28, 31, 0x7a4e2a);
    return M32(g, [5, 6, 5]);
  }
  if (kind === 'note') {
    const g = new VoxelGrid(10, 12, 2);
    g.box(1, 0, 0, 8, 10, 1, (x, y) => (y % 2 === 0 && x > 1 && x < 7 && y > 1 ? 0x6a5a4a : 0xeadcbe));
    return M32(g, [5, 0, 1]);
  }
  if (kind === 'poker') {
    const g = new VoxelGrid(8, 40, 8);
    line(g, [[4, 0, 4], [4, 34, 4]], 0.6, 0x2e2e36);
    g.box(3, 34, 3, 3, 5, 3, 0x8a6a3a); g.box(3, 0, 3, 1, 3, 1, 0x2e2e36); g.box(2, 2, 3, 2, 1, 1, 0x2e2e36);
    return M32(g, [4, 30, 4]);
  }
  if (kind === 'pipe') {
    const g = new VoxelGrid(10, 12, 10);
    g.box(4, 0, 4, 2, 2, 6, 0x3a2416); g.box(3, 2, 8, 4, 4, 3, 0x5a3420);
    return M32(g, [5, 0, 5]);
  }
  return null;
}

export class OldStar {
  /** s: the HomeScene (meters scene, cave, tickers, ui). */
  constructor(s) {
    this.s = s;
    this.g = s.game;
    this.mode = 'idle';
    this.spot = null;
    this.path = null;
    this.nextT = rand(18, 30);
    this.pauseT = 0;
    this.sniffT = rand(2, 4);
    this.sniffK = 0;
    this.lookK = 0;
    this.poseT = 0;
    this.snoreT = 3;
    this.scripted = false;
    this.work = { t: 0, beat: 0 };
    this.pos = new THREE.Vector3();
  }

  async load() {
    let rig = null;
    const load = starMods['../gfx/char/starmole.js'];
    if (load) {
      try { const m = await load(); if (m.makeStarMole) rig = m.makeStarMole({ height: HEIGHT }); } catch (e) { console.warn('[home] makeStarMole failed, using the stand-in', e); }
    }
    if (!rig) { rig = makeCharacter(FALLBACK); this.standIn = true; }
    this.rig = rig;
    const h = rig.height || new THREE.Box3().setFromObject(rig.root).getSize(_v).y || 1;
    this.k = HEIGHT / h;
    this.obj = new THREE.Group();
    this.body = new THREE.Group();
    rig.root.scale.multiplyScalar(this.k);
    this.body.add(rig.root);
    this.obj.add(this.body);
    this.s.scene.add(this.obj);
    this.pos = this.obj.position;
    // things for his paws are built at 1/64 m: shrink them into the rig's units
    this.items = {};
    for (const k of ['hammer', 'ladle', 'note', 'pipe', 'poker']) { const m = heldThing(k); m.scale.setScalar(1 / this.k); this.items[k] = m; }
    return this;
  }

  get headY() { return this.pos.y + this.body.position.y + HEIGHT + 0.06; }
  /** Just above his head (meters): for bubbles and the crosshair. */
  head(out = _v) {
    if (this.rig.headWorld && this.mode !== 'sleep') return this.rig.headWorld(out);
    return out.set(this.pos.x, this.headY, this.pos.z);
  }

  /** His face for a while (mood names of the tutor: calm happy stern proud worried laugh). */
  feel(mood, hold = 3) {
    const r = this.rig;
    if (typeof r.setExpression === 'function') { try { r.setExpression(mood, { hold }); } catch (e) { /* older rigs */ } return; }
    const em = { happy: 'happy', laugh: 'happy', proud: 'happy', worried: 'sad', stern: 'angry' }[mood];
    if (em) r.doEmote?.(em, Math.min(2, hold));
    if (mood === 'laugh' && !this.busyPose()) { r.play?.('laugh'); this.gestureT = 1.4; }
  }

  /** A gesture for a while: 'point' | 'beckon' | 'lean' | 'stretch' | 'cheer' | 'wave' (his rig), or a nod. */
  gesture(state = 'point', secs = 2.5) {
    if (this.busyPose()) return;
    if (!this.standIn && this.rig.play) { this.rig.play(state); this.gestureT = secs; }
    else this.rig.doEmote?.(state === 'wave' ? 'wave' : 'nod', 1);
  }

  busyPose() { return this.mode === 'sleep' || this.mode === 'sit'; }

  // ------------------------------------------------------------ places
  spotOf(name) {
    if (name === 'armchair') {
      const f = this.s.cave.furn.find((q) => q.id === 'armchair');
      const seat = f.seats?.[0] || { x: 0, z: 0.1, y: 0.42 };
      f.obj.updateMatrixWorld(true);
      const w = _v.set(seat.x, 0, seat.z).applyMatrix4(f.obj.matrixWorld);
      const front = new THREE.Vector3(0, 0, 0.9).applyMatrix4(f.obj.matrixWorld);
      return { sit: true, x: w.x, z: w.z, y: seat.y * 0.5, face: { x: front.x, z: front.z }, pose: 'sit', approach: { x: front.x, z: front.z } };
    }
    if (name === 'cot') {
      const c = this.s.cave.dyn.cot;
      c.obj.updateMatrixWorld(true);
      const head = new THREE.Vector3(c.lie.x, c.lie.y, c.lie.z).applyMatrix4(c.obj.matrixWorld);
      const foot = (c.foot ? new THREE.Vector3(c.foot.x, c.lie.y, c.foot.z) : new THREE.Vector3(-c.lie.x, c.lie.y, c.lie.z)).applyMatrix4(c.obj.matrixWorld);
      const side = new THREE.Vector3(0, 0, c.foot ? 2.3 : 0.8).applyMatrix4(c.obj.matrixWorld);
      return { lie: true, head, foot, x: (head.x + foot.x) / 2, z: (head.z + foot.z) / 2, y: head.y, pose: 'sleep', approach: { x: side.x, z: side.z } };
    }
    return STAR_SPOTS[name];
  }

  ground(x, z) { return this.s.starFloor?.(x, z) ?? HALL.y; }

  /** Put him at a place right away (no walking). */
  placeAt(name) {
    const sp = this.spotOf(name);
    if (!sp) return;
    this.stand();
    if (sp.sit) { this.sitDown(); return; }
    if (sp.lie) { this.lieDown(); return; }
    this.pos.set(sp.x, this.ground(sp.x, sp.z), sp.z);
    this.faceTo(sp.face.x, sp.face.z, true);
    this.spot = name;
    this.setPose(sp.pose);
    this.mode = 'idle';
  }

  faceTo(x, z, instant = false) { this.rig.face(Math.atan2(x - this.pos.x, z - this.pos.z), instant); }

  setPose(pose) {
    this.pose = pose;
    this.poseT = 0;
    this.work.t = 0;
    const r = this.rig;
    r.holdItem?.(null, 'R'); r.holdItem?.(null, 'L');
    if (pose === 'hammer') { r.setPick?.(false); r.holdItem?.(this.items.hammer, 'R'); }
    else if (pose === 'stir') { r.setPick?.(false); r.holdItem?.(this.items.ladle, 'R'); }
    else if (pose === 'poke') { r.setPick?.(false); r.holdItem?.(this.items.poker, 'R'); }
    else if (pose === 'read') r.holdItem?.(this.items.note, 'L');
    else if (pose === 'sit') r.holdItem?.(this.items.pipe, 'L');
    else r.setPick?.(null);
    r.play?.(pose === 'sit' ? 'sit' : pose === 'sleep' ? 'sleep' : pose === 'hammer' ? 'hammer' : 'idle');
  }

  sitDown() {
    const sp = this.spotOf('armchair');
    this.pos.set(sp.x, this.ground(sp.x, sp.z), sp.z);
    this.body.position.y = sp.y;
    this.faceTo(sp.face.x, sp.face.z, true);
    this.spot = 'armchair';
    this.mode = 'sit';
    if (this.rig.seatY !== undefined || true) this.rig.seatY = sp.y / this.k;
    this.setPose('sit');
  }

  lieDown() {
    const sp = this.spotOf('cot');
    // lie along the bed on his back, his head on the pillow: the body's up axis turned to point at
    // the head end (tipped up a little by the pillow), his face (looking toward the foot) to the roof
    const d = _v.set(sp.head.x - sp.foot.x, 0, sp.head.z - sp.foot.z).normalize();
    const hx = sp.head.x - d.x * (HEIGHT - 0.06), hz = sp.head.z - d.z * (HEIGHT - 0.06);
    this.pos.set(hx, this.ground(hx, hz), hz);
    this.faceTo(hx - d.x, hz - d.z, true);
    this.body.quaternion.setFromUnitVectors(UP, _w2.set(d.x, 0.13, d.z).normalize());
    this.body.position.y = sp.y - this.pos.y - 0.04;
    this.body.position.z = 0;
    this.spot = 'cot';
    this.mode = 'sleep';
    this.setPose('sleep');
    this.rig.setPick?.(false);
  }

  /** Lean forward (toward where he faces) by `a` radians (0: upright). */
  lean(a) {
    const f = this.rig.facing ?? 0;
    this.body.quaternion.setFromAxisAngle(_w2.set(Math.cos(f), 0, -Math.sin(f)), a);
  }

  stand() {
    const was = this.mode;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    if (was === 'sit' || was === 'sleep') {
      const sp = this.spotOf(was === 'sit' ? 'armchair' : 'cot');
      this.pos.set(sp.approach.x, this.ground(sp.approach.x, sp.approach.z), sp.approach.z);
      this.rig.setPick?.(null);
    }
    this.mode = 'idle';
  }

  /** Walk to a place (A* over the cave floor). */
  goTo(name) {
    const sp = this.spotOf(name);
    if (!sp) return false;
    if (this.mode === 'sit' || this.mode === 'sleep') this.stand();
    const tx = sp.approach ? sp.approach.x : sp.x, tz = sp.approach ? sp.approach.z : sp.z;
    const path = this.s.starPath(this.pos.x, this.pos.z, tx, tz);
    if (!path) return false;
    this.path = path;
    this.pathI = 0;
    this.target = name;
    this.mode = 'walk';
    this.setPose('idle');
    this.rig.play?.('walk', 0.75);
    return true;
  }

  /** Walk to (x, z) meters (scripted); resolves on arrival. */
  walkTo(x, z, speed = SPEED) {
    if (this.mode === 'sit' || this.mode === 'sleep') this.stand();
    const path = this.s.starPath(this.pos.x, this.pos.z, x, z) || [{ x, z }];
    this.speed = speed;
    return new Promise((res) => {
      this.path = path;
      this.pathI = 0;
      this.target = null;
      this.mode = 'walk';
      this.onArrive = res;
      this.setPose(this.carrying ? 'carry' : 'idle');
    });
  }

  /** The place for now: asleep on the cot late at night, otherwise somewhere useful. */
  pickHaunt() {
    const hrs = this.s.clockHours();
    if (hrs >= 21.5) return 'cot';
    const opts = [['anvil', 4], ['bellows', 1.6], ['fire', 2.4], ['armchair', 2], ['board', 1.2], ['books', 1.0], ['hearth', 0.8], ['lift', 0.6], ['ruins', 0.8], ['pool', 0.5]].filter(([n]) => n !== this.spot);
    let t = Math.random() * opts.reduce((a, o) => a + o[1], 0);
    for (const [n, w] of opts) { t -= w; if (t <= 0) return n; }
    return 'anvil';
  }

  // ------------------------------------------------------------ talking
  /**
   * Say something: through the tutor card (his portrait, a mood) when you're near or it matters,
   * with his mouth moving and a sniff. o: { mood, wait, key, dur, card: false (a bubble over him) }.
   * Cutscene talk (game.convo) instead when o.convo, or o.wait and he isn't scripted, or a held talk
   * with him is up; a remark that doesn't wait floats by his head (convo, not held); o.convo: false
   * keeps the card. o.camera / o.gesture go to the cutscene.
   */
  say(html, o = {}) {
    const ui = this.g.ui;
    const mood = o.mood || 'calm';
    // cutscene talk (src/ui/Convo.js): when you talked to him (o.convo), a line you carry on yourself
    // while he isn't in a scripted scene, or while a talk with him is still up
    const cv = this.g.convo;
    if (o.card !== false && cv && o.convo !== false && cv.speaker('oldstar')) {
      const held = o.convo || (o.wait && !this.scripted && !this.s.scripted) || (cv.talkingTo('oldstar') && !!cv.active?.held);
      if (held) { this.sniff(); return cv.say('oldstar', html, { mood, wait: o.wait ?? !!o.convo, dur: o.dur, camera: o.camera, gesture: o.gesture, key: o.key }); }
      // a passing remark: the words float by him (no bars, your camera stays yours, nothing held)
      if (!o.wait) { this.sniff(); return cv.say('oldstar', html, { mood, wait: false, hold: false, dur: o.dur, key: o.key, gesture: o.gesture }); }
    }
    this.rig.talk?.(Math.min(3.2, 0.8 + html.replace(/<[^>]*>/g, '').length / 26));
    this.feel(mood, 3);
    this.sniff();
    if (o.card !== false && ui.tutor) return ui.tutor.say(html, { mood, wait: !!o.wait, key: o.key, dur: o.dur, place: o.place });
    // a little bubble over his head (asides, mumbling in his sleep)
    const s = this.s;
    ui.hideBubble('star');
    ui.bubble('star', html, 0, 0, { life: o.life ?? Math.min(6, 2.4 + html.length / 24), name: o.name === false ? null : NAME });
    s.anchors.set('star', () => this.head(_v).add(new THREE.Vector3(0, 0.1, 0)));
    s.hideFrom?.set('star', () => s.rig.player.pos.z > 0.05 && this.pos.z < -0.3);
    s.updateAnchors?.();
    if (o.babble !== false) this.g.audio.play('babble', { pitch: 210, n: clamp(Math.round(html.length / 10), 2, 9) });
    return Promise.resolve();
  }

  /** E on him: turn to you (and stop what he's doing for a moment). */
  attend() {
    const pl = this.s.rig.player.pos;
    this.pauseT = 8;
    if (this.mode === 'walk') { this.mode = 'idle'; this.path = null; this.rig.play?.('idle'); }
    if (this.mode === 'idle') this.faceTo(pl.x, pl.z);
  }

  /** The nose goes: a quick sniff (whiskers, a twitch of the star, a bob of the head). */
  sniff() {
    this.sniffK = 1;
    const r = this.rig;
    if (r.whiskK !== undefined) r.whiskK = 1;
    for (const k of ['sniff', 'wiggleNose', 'twitchNose', 'noseWiggle']) if (typeof r[k] === 'function') { r[k](0.9); break; }
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    if (!this.rig) return;
    const s = this.s, r = this.rig;
    const pl = s.rig.player.pos;
    const dx = pl.x - this.pos.x, dz = pl.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.pauseT = Math.max(0, this.pauseT - dt);
    if (!this.scripted) this.think(dt, dist);
    if (this.mode === 'walk') this.walk(dt, pl);
    // look at you when you're close and he's not busy walking or asleep
    const awake = this.mode !== 'sleep';
    const want = awake && this.mode !== 'walk' && dist < 3.0 && Math.abs(pl.y - this.pos.y) < 1.2 && !(this.pose === 'hammer' && this.pauseT <= 0 && dist > 1.4);
    this.lookK += ((want ? 1 : 0) - this.lookK) * Math.min(1, dt * 4);
    const rel = Math.atan2(Math.sin(Math.atan2(dx, dz) - r.facing), Math.cos(Math.atan2(dx, dz) - r.facing));
    const pitch = Math.atan2(pl.y + 0.72 - (this.pos.y + HEIGHT * 0.85), Math.max(0.3, dist));
    if (typeof r.look === 'function') r.look(clamp(rel, -1.1, 1.1) * this.lookK, pitch * this.lookK);
    if (this.gestureT > 0) { this.gestureT -= dt; if (this.gestureT <= 0 && !this.busyPose()) r.play?.(this.pose === 'hammer' ? 'hammer' : this.carrying ? 'carry' : 'idle'); }
    r.update(dt);
    this.poseT += dt;
    if (!(this.gestureT > 0)) this.animatePose(dt, dist);
    // standing close by, he turns his whole self to you, slowly (unless he's at work)
    if (want && dist < 1.6 && this.mode === 'idle' && Math.abs(rel) > 0.5 && (this.pauseT > 0 || !['hammer', 'pump', 'stir'].includes(this.pose))) r.face(Math.atan2(dx, dz));
    // sniffing when you're near: the star twitches
    this.sniffT -= dt;
    if (awake && dist < 2.2 && this.sniffT <= 0) { this.sniffT = rand(2.2, 5); this.sniff(); }
    if (this.sniffK > 0) {
      this.sniffK = Math.max(0, this.sniffK - dt * 2.2);
      if (r.neck && this.standIn) r.neck.rotation.x += Math.sin(this.sniffK * 40) * 0.05 * this.sniffK;
    }
  }

  /** Decide where to go next. */
  think(dt, dist) {
    if (this.mode === 'walk') return;
    this.nextT -= dt;
    const late = this.s.clockHours() >= 21.5;
    if (late && this.mode !== 'sleep' && this.pauseT <= 0) { this.goTo('cot'); return; }
    if (!late && this.mode === 'sleep' && this.pauseT <= 0) { this.stand(); this.nextT = 0; }
    if (this.nextT > 0 || this.pauseT > 0 || this.mode === 'sleep') return;
    if (dist < 1.2) { this.nextT = 4; return; } // don't wander off mid-chat
    this.nextT = rand(26, 55);
    this.goTo(this.pickHaunt());
  }

  walk(dt, pl) {
    const p = this.path;
    if (!p) { this.mode = 'idle'; return; }
    const wp = p[this.pathI];
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
    // wait for you if you're standing in the way
    const ahead = Math.hypot(pl.x - this.pos.x - dx / (d || 1) * 0.35, pl.z - this.pos.z - dz / (d || 1) * 0.35);
    if (ahead < 0.42 && Math.abs(pl.y - this.pos.y) < 0.5 && !this.scripted) { this.rig.play?.(this.carrying ? 'carry' : 'idle'); return; }
    if (d < 0.06) {
      this.pathI++;
      if (this.pathI >= p.length) { this.arrive(); return; }
      return;
    }
    const step = Math.min(d, (this.speed || SPEED) * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    const fy = this.ground(this.pos.x, this.pos.z);
    this.pos.y += (fy - this.pos.y) * Math.min(1, dt * 12);
    this.rig.face(Math.atan2(dx, dz));
    this.rig.play?.(this.carrying ? 'carry' : 'walk', 0.75);
    this.s.moveStarBox?.();
  }

  arrive() {
    this.path = null;
    this.speed = SPEED;
    const name = this.target;
    if (!name) {
      this.mode = 'idle';
      this.rig.play?.(this.carrying ? 'carry' : 'idle');
      this.s.moveStarBox?.();
      const f = this.onArrive;
      this.onArrive = null;
      f?.();
      return;
    }
    if (name === 'armchair') { this.sitDown(); this.s.moveStarBox?.(); return; }
    if (name === 'cot') { this.lieDown(); this.s.moveStarBox?.(); return; }
    const sp = this.spotOf(name);
    this.spot = name;
    this.mode = 'idle';
    this.faceTo(sp.face.x, sp.face.z);
    this.setPose(sp.pose);
    this.s.moveStarBox?.();
  }

  /** Little loops for each pose, layered on the rig's own animation; work makes sounds and sparks. */
  animatePose(dt, dist) {
    const r = this.rig, t = this.poseT;
    if (!r.armL || !r.armR || this.mode === 'walk') return;
    const s = this.s, near = dist < 6;
    switch (this.pose) {
      case 'hammer': {
        // a rhythm: three or four blows, a look at the work, again
        const w = this.work;
        w.t += dt;
        const cyc = 0.62;
        const n = Math.floor(w.t / cyc), ph = (w.t % cyc) / cyc;
        const resting = n % 6 >= 4;
        if (resting || this.pauseT > 0) { r.swingPhase = 0.05; if (r.neck) r.neck.rotation.x += 0.25; break; }
        r.swingPhase = ph;
        if (n !== w.beat) {
          w.beat = n;
          const face = s.cave?.dyn.anvilFace;
          if (face && near) {
            this.g.audio.play('clang', { pitch: 0.95 + Math.random() * 0.1, vol: clamp(1.2 - dist / 6, 0.12, 0.8) });
            for (let i = 0; i < 10; i++) s.fx.spawn({ x: face.x + rand(-0.04, 0.04), y: face.y + 0.02, z: face.z + rand(-0.04, 0.04), vx: rand(-1.4, 1.4), vy: rand(0.6, 1.8), vz: rand(-1.4, 1.4), life: rand(0.25, 0.6), size: rand(0.006, 0.012), color: [1, rand(0.6, 0.85), 0.3], glow: true, drag: 0.5, grav: 6, bounce: 0.3 });
            s.flashAnvil?.();
          }
        }
        break;
      }
      case 'pump': {
        // both paws on the bellows handle, pulling down and letting it rise
        const k = (Math.sin(t * 2.6) + 1) / 2;
        r.armL.rotation.set(-1.5 + k * 0.7, 0, 0.3);
        r.armR.rotation.set(-1.5 + k * 0.7, 0, -0.3);
        if (r.elbowL) { r.elbowL.rotation.x = -0.6; r.elbowR.rotation.x = -0.6; }
        r.hip.rotation.x += k * 0.15;
        s.cave?.dyn.bellows.setCompress(k);
        s.forgeAir = Math.max(s.forgeAir || 0, k * 0.9);
        if (near && k > 0.92 && !this.pumpSnd) { this.pumpSnd = true; this.g.audio.play('bellows', { vol: clamp(1 - dist / 6, 0.1, 0.6) }); }
        if (k < 0.5) this.pumpSnd = false;
        break;
      }
      case 'stir': {
        r.armR.rotation.set(-1.2 + Math.sin(t * 2.4) * 0.15, Math.cos(t * 2.4) * 0.3, -0.2);
        r.armL.rotation.set(-0.5, 0, 0.3);
        if (r.neck) r.neck.rotation.x += 0.25;
        if (near && Math.floor(t / 2.6) !== this.stirB) { this.stirB = Math.floor(t / 2.6); this.g.audio.play('stir', { vol: clamp(0.8 - dist / 6, 0.05, 0.4) }); }
        break;
      }
      case 'poke': {
        // crouched at the bedroom fire: a slow prod of the logs now and then, the embers jump
        const k = Math.max(0, Math.sin(t * 1.3)) ** 3;
        r.armR.rotation.set(-1.1 - k * 0.5, 0.1, -0.15);
        if (r.elbowR) r.elbowR.rotation.x = -0.5 + k * 0.4;
        r.armL.rotation.set(-0.4, 0, 0.35);
        if (r.neck) r.neck.rotation.x += 0.2;
        const h = s.shell?.hearth?.fire;
        if (h && k > 0.95 && !this.pokeB) {
          this.pokeB = true;
          for (let i = 0; i < 8; i++) s.fx.ember(h.x + rand(-0.12, 0.12), h.y, h.z + rand(-0.06, 0.06));
          if (near) this.g.audio.play('crack', { vol: 0.12 });
        }
        if (k < 0.5) this.pokeB = false;
        break;
      }
      case 'read':
        r.armL.rotation.set(-1.5, 0.25, 0.35);
        if (r.neck) { r.neck.rotation.x += 0.16; r.neck.rotation.z += Math.sin(t * 0.7) * 0.06; }
        break;
      case 'ponder':
        r.armR.rotation.set(-1.9, 0.3, -0.5);
        if (r.elbowR) r.elbowR.rotation.x = -1.6;
        r.armL.rotation.set(-0.6, 0, 0.5);
        if (r.neck) { r.neck.rotation.x -= 0.18; r.neck.rotation.z += Math.sin(t * 0.5) * 0.05; }
        break;
      case 'sit':
        r.armL.rotation.set(-0.9 + Math.sin(t * 0.5) * 0.05, 0.2, 0.3);
        if (Math.floor(t / 7) !== this.puffB && near) { this.puffB = Math.floor(t / 7); this.puffT = 0.6; }
        if (this.puffT > 0) { this.puffT -= dt; const hp = this.head(_v); s.fx.spawn({ x: hp.x + rand(-0.03, 0.03), y: hp.y - 0.12, z: hp.z + rand(-0.03, 0.03), vx: rand(-0.04, 0.04), vy: 0.12, vz: rand(-0.04, 0.04), life: 1.8, size: 0.012, grow: 0.03, color: [0.8, 0.78, 0.75], alpha: 0.25, drag: 0.6, grav: -0.03 }); }
        break;
      case 'sleep': {
        this.snoreT -= dt;
        if (this.snoreT <= 0) {
          this.snoreT = rand(3.2, 5);
          if (dist < 5) this.g.audio.play('snore', { vol: 0.22 });
          if (!this.g.ui.bubbles.has('star') && dist < 4) this.say('<i>Zzz…</i>', { card: false, name: false, babble: false, life: 2.4 });
        }
        break;
      }
      default:
    }
    if (this.carrying) {
      r.armL.rotation.set(-1.0, 0, 0.25); r.armR.rotation.set(-1.0, 0, -0.25);
      if (r.elbowL) { r.elbowL.rotation.x = -0.9; r.elbowR.rotation.x = -0.9; }
    }
  }

  // ------------------------------------------------------------ carrying things
  /** Take something (a mesh in meters) in both paws, carried in front of him. */
  carry(obj) {
    this.carrying = obj;
    if (!obj) return;
    if (obj.parent) obj.parent.remove(obj);
    obj.position.set(0, 0.3, 0.2);
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(1);
    this.carrier = this.carrier || new THREE.Group();
    this.body.add(this.carrier);
    this.carrier.rotation.y = 0;
    this.carrier.add(obj);
    this.rig.setPick?.(false);
  }

  /** Let go of what he carries (returns it, detached). */
  drop() {
    const o = this.carrying;
    this.carrying = null;
    if (o && o.parent) o.parent.remove(o);
    this.rig.setPick?.(null);
    return o;
  }

  /** Follow the scene's yaw convention: the direction he faces (radians). */
  get facing() { return this.rig.facing; }

  dispose() {
    this.g.ui.hideBubble('star');
    if (this.obj) this.s.scene.remove(this.obj);
    this.rig?.dispose?.();
  }
}

export { NAME as STAR_NAME, SPOTS as CAVE_SPOTS, ease };

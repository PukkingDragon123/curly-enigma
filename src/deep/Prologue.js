// The opening: the fall drops the mole into Old Star's dig (src/deep/gen/prologue.js), a chamber an
// old star-nosed mole has been digging for forty years. He has almost got out, but a rockfall pins
// his legs. Through play he teaches the basics, one at a time, with short lines in a speech bubble:
//   rocks   dig the rocks off him (each one crumbles after a few blows; he cheers)
//   ore     the copper glinting in the wall: dig round it, it breaks out as a clump; pick it up,
//           chip it clean (he gives you his spare chisel), bag it   → src/deep/Clumps.js
//   ledge   his map is up on a ledge: put up a ladder with the build tool (slot 7), climb, take it
//           (the radar appears; until then it is hidden)
//   lifts   he tells about the old lifts, then leads the way down his crawl (walking ahead, waiting
//           when you lag), to the last plug of earth before the mine-entrance lift; you break
//           through, he steps into the cage, you ring the bell and ride up together:
//           goto('home', { from: 'lift', first: true }) with flags prologue, fallen, nugget.
// Talking to him (E) shows what to do next and offers "Skip the lessons". Wander off and he calls
// you back (the radar comes back with him on it). Returning players (flag 'prologue') get nothing:
// the module stays inert. Progress is kept in state.data.deep.prologue.step, so a game continued
// mid-way picks up where it was (an arrival by lift hears him through the wall).
//
// DigScene hooks: spawn() · update(dt, { player, eye, time, busy }) → events · target(eye, dir, reach)
// · use(eye, dir, reach) → events | null · lights(eye) · dispose(). Test hooks: prologue.debug.*.
import * as THREE from 'three';
import { VOX, M, MAT, ORE_BASE } from './materials.js';
import { OPAQUE } from './Mesher.js';
import { CS } from './Generator.js';
import { prologueLayout, prologueOreVoxels, prologueRockVoxels, prologueWants, prologueBoxes, prologueInside } from './gen/prologue.js';
import { OldStarActor } from './prologue/oldstar.js';
import { Dressing } from './prologue/dressing.js';
import { Talk } from './prologue/talk.js';
import { LINES, GOALS, NAME, VOICE, pickLine } from './prologue/lines.js';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';
import { el, clamp, rand, pick } from '../core/util.js';

const GIFT_CHISEL = true; // Old Star hands over his spare chisel for the clump lesson
const STEPS = ['intro', 'rocks', 'freed', 'ore', 'loose', 'held', 'ledge', 'climb', 'map', 'lifts', 'walk', 'plug', 'cage', 'ride'];
// where a continued game resumes for each step
const RESUME = { intro: 'rocks', freed: 'ore', loose: 'ore', held: 'ore', climb: 'ledge', lifts: 'walk', ride: 'cage' };
const CB = Math.log2(CS);
const MANMADE = new Set([M.LADDER, M.BOARDS, M.BRICK, M.TIMBER, M.LANTERN, M.DOOR, M.BURROW]);
// what the generator's cave dressing turns surfaces into (moss, sand, mycelium...)
const DECOR = new Set([M.MOSS, M.SAND, M.MYCEL, M.VINES, M.ROOTS, M.SNOW, M.ASH].filter((m) => m !== undefined));
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const col01 = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const ease = (t) => t * t * (3 - 2 * t);
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Prologue {
  constructor(ctx) {
    this.c = ctx;
    this.st = ctx.state;
    this.owner = ctx.owner;
    this.w = ctx.world;
    this.ui = ctx.ui;
    this.audio = ctx.audio;
    this.fx = ctx.fx;
    const feat = ctx.plan?.features?.find((f) => f.kind === 'prologue');
    this.on = !!feat && !!ctx.plan.prologue && !this.st.flag('prologue');
    this.from = ctx.params?.from || 'home';
    // a save from before the opening existed (it never fell into the dig): nothing to teach
    if (this.on && this.from !== 'fall' && !this.st.data.deep?.prologue) { this.st.flag('prologue', true); this.on = false; }
    this.debug = { on: () => this.on };
    if (!this.on) return;
    const L = this.L = prologueLayout(feat);
    this.time = 0;
    this.cd = {};
    this.lineQ = null;
    this.co = null;
    this.coWait = 0;
    this.ev = [];
    // the save: how far we got (and the opening's flags: Nugget fell down with the mole)
    const deep = this.st.data.deep ||= { seed: 1, tunnels: [], stations: [] };
    this.save = deep.prologue ||= { step: 'intro' };
    // Nugget fell in too (DigScene brings her along once this is set). 'fallen' and 'prologue'
    // are set when the opening ends: a game quit half way continues with the fall, back in here.
    this.st.flag('nugget', true);
    // the scene's own first-visit hints would talk over Old Star: he does the explaining
    if (this.owner?.flags) { this.owner.flags.hintRadar = true; this.owner.flags.firstOre = true; }
    // nothing else grows in his dig (props are placed later, per chunk)
    const props = this.owner?.props;
    if (props && typeof props.blocked === 'function') {
      const orig = props.blocked;
      props.blocked = function (x, y, z, pad = 0.3) { return prologueInside(L, x, y, z, pad) || orig.call(this, x, y, z, pad); };
      this.unpatch = () => { props.blocked = orig; };
    }
    // Old Star, his camp, his voice
    // where to pick up: a fresh fall plays the landing first; a later step resumes after it
    const saved = RESUME[this.save.step] || this.save.step || 'rocks';
    this.after = STEPS.indexOf(saved) > STEPS.indexOf('rocks') ? saved : 'rocks';
    const resume = this.from === 'fall' ? 'intro' : saved === 'intro' ? 'rocks' : saved;
    this.step = resume;
    const at = resume === 'intro' ? this.after : resume;
    this.star = new OldStarActor(ctx, this.standFor(at));
    if (STEPS.indexOf(at) <= STEPS.indexOf('rocks')) this.star.play('pinned');
    this.dress = new Dressing(ctx, L);
    if (STEPS.indexOf(at) > STEPS.indexOf('map')) this.dress.takeMap();
    this.talk = new Talk(this.ui, this.owner.game.engine, NAME);
    this.lantern = new THREE.PointLight(0xffb870, 2.4, 7.5, 1.2);
    this.lantern.position.set(L.lantern.x, L.lantern.y + 0.3, L.lantern.z);
    ctx.scene3.add(this.lantern);
    // the rocks on his legs, the copper, the plug: voxel lists to watch
    this.rocks = prologueRockVoxels(L).map((vox, i) => ({ vox, n0: -1, last: -1, hits: 0, gone: STEPS.indexOf(at) > STEPS.indexOf('rocks'), need: i === 0 ? 3 : 2 }));
    this.oreVox = prologueOreVoxels(L);
    this.ore = { n0: -1, near0: -1, nearLast: -1, hits: 0, free: STEPS.indexOf(at) > STEPS.indexOf('ore') };
    this.plug = { vox: null, n0: -1, last: -1, hits: 0, open: STEPS.indexOf(at) > STEPS.indexOf('plug') };
    this.scrubbed = new Set();
    this.ores0 = this.st.data.stats.ores;
    this.radarShown = STEPS.indexOf(at) > STEPS.indexOf('map');
    this.setupDebug();
    this.enter(resume, true);
  }

  // ------------------------------------------------------------------ DigScene hooks
  spawn() {
    if (!this.on) return null;
    const s = this.L.spawn, o = this.L.o;
    // the whole chamber meshed before the first frame (the landing looks round it)
    try { this.owner.terrain?.warm?.(o.x + 0.4, o.y + 1.2, o.z, 3); } catch (e) { /* streaming catches up */ }
    this.intro = { t: 0, landed: false, landT: 0, yaw0: 0.35, x: s.x, z: s.z };
    return { x: s.x, y: s.y, z: s.z, yaw: this.intro.yaw0 };
  }

  update(dt, o) {
    if (!this.on) return null;
    this.time += dt;
    this.ev = [];
    const pl = o.player, eye = o.eye;
    if (!this.started) this.start(pl);
    // the opening shot, the ride: the mole stays put
    if (this.step === 'intro') this.updateIntro(dt, pl);
    if (this.hold) { pl.pos.x = this.hold.x; pl.pos.z = this.hold.z; pl.vel.x = 0; pl.vel.z = 0; }
    this.scrub();
    this.watch(dt, pl);
    if (!o.busy || this.leaving) {
      this.runScript(dt);
      this.stepLogic(dt, pl, eye);
    }
    // Old Star: looks at you while he talks (unless something else holds his eye)
    const st = this.star;
    if (!this.lookPoint) st.lookAt = _w.copy(eye);
    else st.lookAt = this.lookPoint;
    st.update(dt, eye);
    this.dress.update(dt);
    // glints: the copper in the wall, the map tube on the ledge
    this.glintT = (this.glintT || 0) - dt;
    if (this.glintT <= 0) {
      this.glintT = 0.22;
      if ((this.step === 'ore' || this.step === 'freed') && !this.ore.free) this.oreGlint();
      if (this.dress.map && STEPS.indexOf(this.step) >= STEPS.indexOf('ledge')) { const p = this.dress.mapPoint(_v); this.fx?.glints(p.x + rand(-0.2, 0.2), p.y + rand(0, 0.08), p.z + rand(-0.25, 0.25), [1, 0.85, 0.5]); }
    }
    // the bubble over his head, the objective tag
    this.talk.update(dt, this.star.headWorld(_v).add(_w.set(0, 0.08, 0)), this.owner.camera);
    this.talk.goal(this.goalText());
    // the radar: hidden until he gives you his map (or you're lost without him)
    if (!this.radarShown && Math.hypot(pl.pos.x - this.L.o.x, pl.pos.z - this.L.o.z) > 14) this.showRadar();
    return this.ev;
  }

  target(eye, dir, reach) {
    if (!this.on || this.step === 'intro' || this.step === 'ride' || this.leaving) return null;
    if (this.owner.clumps?.capture?.()) return null;
    const t = this.pickAt(eye, dir, reach);
    if (!t) return null;
    if (t === 'star') return { label: this.step === 'cage' && this.inCage() ? 'Ride up with Old Star' : 'Talk to Old Star', kind: 'use' };
    if (t === 'map') return { label: 'Take Old Star\'s map', kind: 'use' };
    if (t === 'cage') return { label: this.step === 'cage' ? 'Ring the bell: ride up with Old Star' : 'The old lift', kind: 'use' };
    return null;
  }

  use(eye, dir, reach) {
    if (!this.on || this.step === 'intro' || this.step === 'ride' || this.leaving) return null;
    const cl = this.owner.clumps;
    if (cl?.capture?.() || cl?.held) return null; // E bags the clump in paw
    const t = this.pickAt(eye, dir, reach);
    if (!t) return null;
    if (t === 'map') { this.takeMap(); return []; }
    if (t === 'cage' || (t === 'star' && this.step === 'cage' && this.inCage())) {
      if (this.step === 'cage' && this.inCage()) this.ride();
      else this.say(LINES.notWithout, { now: true });
      return [];
    }
    if (t === 'star') { this.openTalk(); return []; }
    return null;
  }

  lights(eye) {
    if (!this.on) return [];
    const L = this.L, out = this.lightsOut ||= [{ x: 0, y: 0, z: 0, c: [1.05, 0.72, 0.38], r: 6, lantern: true }, { x: 0, y: 0, z: 0, c: [0.85, 0.55, 0.28], r: 2.6, lantern: true }, { x: 0, y: 0, z: 0, c: [0.42, 0.36, 0.26], r: 1.7 }];
    out[0].x = L.lantern.x; out[0].y = L.lantern.y + 0.25; out[0].z = L.lantern.z;
    out[1].x = L.candle.x; out[1].y = L.ledge.y + 0.3; out[1].z = L.candle.z;
    const lp = this.star.rig.lampWorld(_v);
    out[2].x = lp.x; out[2].y = lp.y; out[2].z = lp.z;
    return out;
  }

  dispose() {
    if (!this.on) return;
    this.unpatch?.();
    this.star?.dispose();
    this.dress?.dispose();
    this.talk?.dispose();
    if (this.lantern) { this.c.scene3.remove(this.lantern); this.lantern.dispose?.(); }
  }

  // ------------------------------------------------------------------ steps
  /** Where Old Star stands (or sits) for a step. */
  standFor(step) {
    const L = this.L, o = L.o;
    const i = STEPS.indexOf(step);
    if (i <= STEPS.indexOf('rocks')) return { ...L.star };
    if (i <= STEPS.indexOf('held')) return { x: o.x - 2.2, y: o.y, z: o.z + 1.0, yaw: -Math.PI / 2 - 0.4 };
    if (i <= STEPS.indexOf('lifts')) return { x: o.x + 1.85, y: o.y, z: o.z + 0.9, yaw: Math.PI / 2 + 0.5 };
    if (step === 'walk' || step === 'plug') return { ...L.nookSide, yaw: Math.PI };
    return { ...L.cage, yaw: 0 };
  }

  enter(step, resume = false) {
    this.step = step;
    if (STEPS.indexOf(step) > STEPS.indexOf(this.save.step) && this.save.step !== 'done') this.save.step = step; // never back
    this.stepT = 0;
    this.lookPoint = null;
    const L = this.L, star = this.star;
    switch (step) {
      case 'intro': break;
      case 'rocks':
        star.play('pinned');
        if (resume && this.from !== 'fall') this.run(this.callScript());
        break;
      case 'freed': this.run(this.freedScript()); break;
      case 'ore':
        if (resume) { star.pos.set(this.standFor('ore').x, L.o.y, this.standFor('ore').z); star.play('point'); star.faceTo(L.ore); }
        this.run(this.oreScript(resume));
        break;
      case 'loose': this.run(this.looseScript()); break;
      case 'held': this.run(this.heldScript()); break;
      case 'ledge': this.run(this.ledgeScript(resume)); break;
      case 'climb': this.run(this.lineScript(['ladderUp'])); break;
      case 'map': this.run(this.lineScript(['mapTake'])); break;
      case 'lifts': this.run(this.liftsScript()); break;
      case 'walk': this.run(this.walkScript(resume)); break;
      case 'plug': this.run(this.plugScript()); break;
      case 'cage': this.run(this.cageScript(resume)); break;
      case 'ride': break;
    }
  }

  goalText() {
    if (this.from === 'lift' && !this.plug.open && this.inLiftRoom(this.owner.player)) return 'Old Star is calling through the south wall';
    if (this.step === 'ledge' && this.ladderCount() >= 6) return GOALS.climb;
    return GOALS[this.step] ?? '';
  }

  /** First frame: lights, the radar, where a continued game puts the mole. */
  start(pl) {
    this.started = true;
    this.star.light(!!this.owner.nugget);
    this.radarFn = (o) => {
      const r = this.owner.radar(o);
      r.markers = r.markers.filter((m) => m.kind !== 'town');
      if (!this.leaving) r.markers.push({ kind: 'home', x: this.star.pos.x, y: this.star.pos.y + 0.5, z: this.star.pos.z, label: NAME, color: 0xff8ab0 });
      return r;
    };
    if (this.radarShown) this.showRadar(); else this.ui.setRadar?.(null);
    // continued mid-way (not by the fall, not by lift): back in his dig, facing him
    if (this.from !== 'fall' && this.from !== 'lift') {
      const o = this.L.o;
      pl.pos.set(o.x + 0.6, o.y + 0.05, o.z - 0.3);
      pl.vel.set(0, 0, 0);
      const s = this.star.pos;
      pl.yaw = Math.atan2(-(s.x - pl.pos.x), -(s.z - pl.pos.z));
      pl.pitch = -0.12;
      this.owner.terrain?.warm?.(pl.pos.x, pl.pos.y + 0.5, pl.pos.z, 2);
    }
  }

  showRadar() {
    this.radarShown = true;
    this.ui.setRadar?.(this.radarFn, { heading: () => this.owner.player.yaw });
  }

  /** The landing: falling through the roof, a thump, seeing stars, a look round, Old Star calling. */
  updateIntro(dt, pl) {
    const I = this.intro || (this.intro = { t: 0, landed: true, landT: 0, yaw0: pl.yaw, x: pl.pos.x, z: pl.pos.z });
    I.t += dt;
    if (!I.landed) {
      pl.pitch = Math.max(-1.25, pl.pitch - dt * 1.6);
      if (pl.grounded || I.t > 2.5) {
        I.landed = true;
        I.landT = 0;
        I.yawL = pl.yaw;
        this.hold = { x: pl.pos.x, z: pl.pos.z };
        this.audio.play('thud', { vol: 0.8 });
        this.owner.shake?.(0.7);
        if (this.owner.post) { this.owner.post.flash = 0.5; this.owner.post.flashColor = 0xfff0d8; }
        this.fx?.dust(pl.pos.x, pl.pos.y + 0.05, pl.pos.z, 18, [0.55, 0.45, 0.36], 0.45);
        for (let k = 0; k < 8; k++) this.fx?.chips(pl.pos.x + rand(-0.4, 0.4), pl.pos.y + 2.4, pl.pos.z + rand(-0.4, 0.4), 1, [0.45, 0.35, 0.26], [0, -1, 0]);
      }
      return;
    }
    I.landT += dt;
    const t = I.landT;
    const s = this.star.headWorld(_v);
    const toYaw = Math.atan2(-(s.x - pl.pos.x), -(s.z - pl.pos.z));
    const toPitch = Math.atan2(s.y - (pl.pos.y + 0.72), Math.hypot(s.x - pl.pos.x, s.z - pl.pos.z));
    // dazed: the head lolls, little stars circle
    if (t < 1.4) {
      pl.pitch += (-0.55 - pl.pitch) * Math.min(1, dt * 2.5);
      if (this.owner.kick) this.owner.kick.z = Math.sin(t * 4.2) * 0.07 * (1 - t / 1.4);
      if (Math.random() < dt * 22) this.dizzy(pl, t);
    } else if (t < 2.5) {
      // a look round the chamber
      const k = (t - 1.4) / 1.1;
      pl.yaw = I.yawL + Math.sin(k * Math.PI) * 0.55;
      pl.pitch += (-0.05 - pl.pitch) * Math.min(1, dt * 3);
    } else {
      // and toward the voice
      const k = ease(clamp((t - 2.5) / 0.9, 0, 1));
      pl.yaw = I.yawL + wrapA(toYaw - I.yawL) * k;
      pl.pitch += (toPitch - pl.pitch) * Math.min(1, dt * 4);
    }
    const again = this.after !== 'rocks';
    if (t > 1.0 && !I.said) { I.said = true; this.say(again ? LINES.again : LINES.hello, { dur: 2.6 }); this.star.rig.waveArm = !again; }
    if (t > 3.5) {
      this.star.rig.waveArm = false;
      this.hold = null;
      if (again) { this.enter(this.after, true); return; }
      this.enter('rocks');
      this.run(this.lineScript(['overHere', 'rocks']));
    }
  }

  dizzy(pl, t) {
    const a = this.time * 5 + Math.random() * 6.28, r = 0.18;
    const f = pl.forward(_w);
    const cx = pl.pos.x + f.x * 0.6, cy = pl.pos.y + 0.95, cz = pl.pos.z + f.z * 0.6;
    this.fx?.spawn({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a * 2) * 0.03, z: cz + Math.sin(a) * r, vx: -Math.sin(a) * 0.5, vz: Math.cos(a) * 0.5, life: 0.5, size: 0.02, color: [1, 0.9, 0.4], glow: true });
  }

  // ------------------------------------------------------------------ scripts (generators: yield seconds or a predicate)
  run(gen) { this.co = gen; this.coWait = 0; this.coPred = null; }
  runScript(dt) {
    if (!this.co) return;
    if (this.coPred) { if (!this.coPred()) return; this.coPred = null; }
    if (this.coWait > 0) { this.coWait -= dt; if (this.coWait > 0) return; }
    for (let guard = 0; guard < 8 && this.co; guard++) {
      const co = this.co;
      const r = co.next();
      if (this.co !== co) { this.coWait = 0; this.coPred = null; continue; } // it started the next step's script
      if (r.done) { this.co = null; return; }
      if (typeof r.value === 'function') { if (!r.value()) { this.coPred = r.value; return; } continue; }
      if (typeof r.value === 'number' && r.value > 0) { this.coWait = r.value; return; }
    }
  }

  /** Say a line (key into LINES, or text): returns how long it shows. */
  say(line, o = {}) {
    const touch = this.owner.isTouch?.();
    let text = typeof line === 'string' && LINES[line] !== undefined ? LINES[line] : line;
    if (Array.isArray(text)) text = pick(text);
    text = pickLine(text, touch);
    if (!text) return 0;
    const plain = text.replace(/<[^>]+>/g, '');
    const dur = o.dur ?? clamp(1.5 + plain.length * 0.052, 2.2, 6.5);
    this.talk.show(text, dur);
    const d = this.owner.player ? this.star.pos.distanceTo(this.owner.player.pos) : 3;
    this.audio.play('babble', { pitch: VOICE.pitch * rand(0.95, 1.05), n: clamp(Math.round(plain.length / 9), 2, 8), wave: VOICE.wave, vol: d > 9 ? 0.5 : 1 });
    this.star.rig.talk(Math.min(dur * 0.75, 0.6 + plain.length / 28));
    if (Math.random() < 0.5) this.star.rig.sniff(0.8);
    return dur;
  }
  /** A line at most every cd seconds (per key). */
  sayCd(key, cd = 8) {
    if (this.cd[key] && this.time - this.cd[key] < cd) return 0;
    if (this.talk.showing && this.co) return 0;
    this.cd[key] = this.time;
    return this.say(key);
  }

  *lineScript(keys) { for (const k of keys) yield this.say(k) + 0.25; }

  *callScript() {
    // a continued game: he calls out once you're near
    yield () => this.near(9);
    yield this.say('overHere');
    yield this.say('rocks');
  }

  *freedScript() {
    const star = this.star;
    star.rig.squash = 1;
    star.play('stretch');
    this.audio.play('success', { vol: 0.5 });
    yield 0.4;
    yield this.say('free') + 0.1;
    star.play('dust');
    yield 0.9;
    star.play('idle');
    // a step out of the rubble, toward you
    const o = this.L.o;
    star.walk([{ x: star.pos.x + 0.35, y: o.y, z: star.pos.z - 0.35 }], null, 0.8);
    yield this.say('name') + 0.2;
    if (this.owner.nugget) { star.rig.doEmote('surprise', 1); yield this.say('hen') + 0.2; }
    this.enter('ore');
  }

  *oreScript(resume) {
    const star = this.star, L = this.L, sp = this.standFor('ore');
    if (!resume) {
      star.walk([{ x: sp.x, y: L.o.y, z: sp.z }], () => { star.faceTo(L.ore); star.play('point'); });
      yield () => !star.path;
    }
    this.lookPoint = new THREE.Vector3(L.ore.x, L.ore.y, L.ore.z);
    star.faceTo(L.ore);
    star.play('point');
    yield this.say('oreSee') + 0.3;
    this.lookPoint = null;
    yield this.say('oreDig');
    star.play('idle');
  }

  *looseScript() {
    this.star.play('cheer');
    yield this.say('oreLoose');
    this.star.play('idle');
  }

  *heldScript() {
    const st = this.st;
    if (GIFT_CHISEL && !st.equipped('chisel') && ITEMS.chisel_basic) {
      st.addItem('chisel_basic');
      st.equip('chisel_basic');
      this.owner.updateHotbar?.();
      this.ui.toast(`+ <b>${ITEMS.chisel_basic.name}</b> from Old Star`, { icon: iconURL('chisel_basic'), kind: 'good' });
      this.audio.play('pickup', { pitch: 0.9 });
      yield this.say('oreChisel') + 0.2;
    }
    yield this.say('oreHeld');
  }

  *ledgeScript(resume) {
    const star = this.star, L = this.L, sp = this.standFor('ledge');
    star.walk([{ x: sp.x, y: L.o.y, z: sp.z }], () => { star.faceTo(L.map); star.play('point'); });
    yield () => !star.path;
    this.lookPoint = this.dress.mapPoint(new THREE.Vector3());
    yield this.say('ledge') + 0.3;
    yield this.say('ladder');
    this.lookPoint = null;
    star.play('idle');
  }

  *liftsScript() {
    const star = this.star;
    star.faceTo(this.owner.player.pos);
    star.play('idle');
    yield this.say('mapGot') + 0.3;
    yield this.say('lifts') + 0.3;
    star.play('beckon');
    yield this.say('follow');
    this.enter('walk');
  }

  *walkScript(resume) {
    const star = this.star, L = this.L;
    if (resume) {
      star.pos.set(L.nookSide.x, L.nookSide.y, L.nookSide.z);
    } else {
      const pts = [{ x: L.mouth.x + 0.35, y: L.o.y, z: L.mouth.z - 0.45 }, ...L.crawl.slice(1), L.corner, { x: L.nook.x + 0.6, y: L.nook.y, z: L.nook.z }, L.nookSide];
      star.walk(pts, null, 1.05);
      yield () => !star.path;
    }
    this.enter('plug');
  }

  *plugScript() {
    const star = this.star, L = this.L;
    star.face(Math.PI);
    star.play('point');
    this.lookPoint = new THREE.Vector3((L.plug.x0 + L.plug.x1) / 2, L.plug.y0 + 0.5, L.plug.z0 + 0.2);
    yield () => this.near(2.6);
    yield this.say('plug') + 0.2;
    this.lookPoint = null;
    star.play('idle');
    yield this.say('plugGo');
  }

  *cageScript(resume) {
    const star = this.star, L = this.L;
    if (!resume) {
      star.play('cheer');
      this.audio.play('fanfare', { vol: 0.5 });
      yield this.say('out') + 0.1;
      star.play('idle');
      star.walk([{ x: L.door.x, y: L.door.y, z: L.door.z + 0.9 }, L.door, L.cage], () => { star.face(0); star.play('beckon'); });
      yield () => !star.path;
    } else {
      star.pos.set(L.cage.x, L.cage.y, L.cage.z);
      star.face(0, true);
    }
    star.play('beckon');
    yield () => this.near(3.2);
    yield this.say('cage') + 0.2;
    star.play('idle');
    yield this.say('bell');
  }

  // ------------------------------------------------------------------ per-step checks
  stepLogic(dt, pl, eye) {
    this.stepT += dt;
    const step = this.step, star = this.star;
    const far = star.pos.distanceTo(pl.pos);
    // wandered off: he calls you back (not while he's walking you somewhere)
    if (far > 9 && step !== 'intro' && step !== 'ride' && step !== 'walk' && !(this.from === 'lift' && step === 'rocks')) {
      this.sayCd('comeBack', 11);
      if (step !== 'rocks') star.play('beckon');
    }
    // arriving by lift with him still in the dig: he's heard through the wall
    if (this.from === 'lift' && !this.plug.open && far > 4 && this.inLiftRoom(pl)) {
      if (!this.cd.wall || this.time - this.cd.wall > 14) { this.cd.wall = this.time; this.say('Hello? Somebody at the old lift? I\'m just through the south wall, dig toward me!', { dur: 5 }); }
    }
    if (step === 'rocks') {
      if (!this.co && this.stepT > 14 && far < 9) { this.sayCd('rocksAgain', 13); }
      if (this.rocks.every((r) => r.gone)) this.enter('freed');
    } else if (step === 'ore') {
      if (this.ore.free) this.enter(this.owner.clumps ? 'loose' : 'held');
      // the pick on the ore itself
      const sw = this.owner.swing, tg = this.owner.target;
      if (sw && sw.hit && !this.swingSeen && tg && tg.m >= ORE_BASE && Math.hypot((tg.vx + 0.5) / VOX - this.L.ore.x, (tg.vz + 0.5) / VOX - this.L.ore.z) < 0.5) { this.swingSeen = true; this.sayCd('oreHit', 6); }
      if (!sw) this.swingSeen = false;
    } else if (step === 'loose') {
      const cl = this.owner.clumps, c = this.clump;
      if (!cl || !c) this.bagged(); // nothing to pick up (bagged in an earlier session)
      else if (c.state === 'gone' || c.state === 'stash') { if (this.st.data.stats.ores > this.ores0 || c.state === 'gone') this.bagged(); }
      else if (cl.held === c) this.enter('held');
      this.lookPoint = c && c.state === 'world' ? c.pos : null;
    } else if (step === 'held') {
      const cl = this.owner.clumps, c = this.clump;
      if (this.st.data.stats.ores > this.ores0) this.bagged();
      else if (cl && c && c.state === 'world' && cl.held !== c) { this.say('oreDropped'); this.enter('loose'); }
      else if (!c && this.stepT > 1) this.bagged(); // no clumps module: the ore flew straight to the bag
    } else if (step === 'ledge' || step === 'climb' || step === 'map') {
      const n = this.ladderCount();
      if (step === 'ledge' && n >= 6) this.enter('climb');
      if (step === 'ledge' && this.owner.slotName === 'build' && this.owner.buildMode > 0) this.sayCd('ladderMode', 9);
      if (step !== 'map' && this.onLedge(pl)) {
        if (n < 6) this.say('claws');
        this.enter('map');
      }
      if (step === 'ledge' && !this.co && this.stepT > 16) this.sayCd('ladder', 16);
      this.lookPoint = step === 'map' ? null : this.dress.mapPoint(_v.clone());
    } else if (step === 'plug') {
      if (this.plug.open) this.enter('cage');
    } else if (step === 'walk') {
      // walking ahead; waiting (and calling) when you fall behind
      if (star.path) {
        if (far > 3.8 && !star.paused) { star.paused = true; star.faceTo(pl.pos); star.play('beckon'); star.rig.play('beckon'); this.sayCd('wait', 7); }
        else if (star.paused && far < 2.6) { star.paused = false; star.play('idle'); }
        else if (!star.paused && Math.random() < dt * 0.08) this.sayCd('walk', 9);
      }
    }
  }

  near(r) { const p = this.owner.player.pos; return this.star.pos.distanceTo(p) < r; }
  inCage() { const s = this.star.pos, c = this.L.cage; return Math.hypot(s.x - c.x, s.z - c.z) < 0.4 && !this.star.path; }
  inLiftRoom(pl) { const R = this.L.room; return pl.pos.x > R.x0 && pl.pos.x < R.x1 && pl.pos.z > R.z0 && pl.pos.z < R.z1 && Math.abs(pl.pos.y - R.y0) < 1.5; }
  onLedge(pl) { const G = this.L.ledge; return pl.pos.x > G.x0 - 0.12 && pl.pos.y > G.y - 0.15 && pl.pos.y < G.y + 0.6 && pl.pos.z > G.z0 - 0.1 && pl.pos.z < G.z1 + 0.1 && pl.grounded; }

  bagged() {
    if (this.step === 'ledge' || STEPS.indexOf(this.step) > STEPS.indexOf('ledge')) return;
    this.say('oreBagged');
    this.star.rig.doEmote('nod', 1);
    this.enter('ledge');
  }

  // ------------------------------------------------------------------ the world: rocks, ore, plug, ladder
  loaded(vx, vy, vz) {
    const ch = this.w.chunk?.(vx >> CB, vy >> CB, vz >> CB);
    return !!ch && !ch.pending && (!!ch.vox || ch.virtual);
  }
  solid(vx, vy, vz) { const m = this.w.voxelAt(vx, vy, vz); return m !== 0 && !(MAT[m]?.fluid); }

  /** Watch the voxels the lessons hang on. */
  watch(dt, pl) {
    // the rocks pinning him: a few blows and each one crumbles off
    if (this.step === 'rocks' || this.step === 'intro') {
      for (let i = 0; i < this.rocks.length; i++) {
        const r = this.rocks[i];
        if (r.gone || !r.vox.length) continue;
        const [x0, y0, z0] = r.vox[0];
        if (!this.loaded(x0, y0, z0)) continue;
        let n = 0;
        for (const [x, y, z] of r.vox) if (this.solid(x, y, z)) n++;
        if (r.n0 < 0) { r.n0 = n; r.last = n; if (n < 4) r.gone = true; continue; }
        if (n < r.last) { r.hits++; r.last = n; this.star.rig.doEmote(r.hits === 1 ? 'surprise' : 'happy', 0.6); }
        if (r.hits >= r.need || n < r.n0 * 0.5) this.crumbleRock(i, pl);
      }
    }
    // the copper and the plug are bigger voxel counts: ten times a second is plenty
    this.watchT = (this.watchT || 0) - dt;
    if (this.watchT > 0) return;
    this.watchT = 0.1;
    // the copper: dig round it and it breaks out
    if ((this.step === 'ore' || this.step === 'freed') && !this.ore.free && this.oreVox.length) {
      const [x0, y0, z0] = this.oreVox[0];
      if (this.loaded(x0, y0, z0)) {
        const e = this.oreExposure();
        if (this.ore.n0 < 0 && e.n === 0) {
          // freed in an earlier session: the clump is lying about (or already bagged)
          this.ore.free = true;
          this.clump = this.owner.clumps?.list?.find((c) => c.dep === 'oldstar_copper' && c.state === 'world') || null;
          return;
        }
        if (this.ore.n0 < 0) { this.ore.n0 = e.frac; this.ore.near0 = e.near; this.ore.nearLast = e.near; }
        if (e.near < this.ore.nearLast) { this.ore.hits++; this.ore.nearLast = e.near; if (this.ore.hits === 2 && this.step === 'ore') this.sayCd('oreClose', 20); }
        if (this.step === 'ore' && (e.frac > Math.max(0.55, this.ore.n0 + 0.22) || this.ore.hits >= 4)) this.freeOre(pl);
      }
    }
    // the plug before the lift: three good blows and the old earth gives way
    if (this.step === 'plug' && !this.plug.open) {
      const P = this.plugVoxels();
      if (P.length && this.loaded(P[0][0], P[0][1], P[0][2])) {
        let n = 0;
        for (const [x, y, z] of P) if (this.solid(x, y, z)) n++;
        if (this.plug.n0 < 0) { this.plug.n0 = n; this.plug.last = n; if (n < P.length * 0.45) { this.breakPlug(); return; } }
        if (n < this.plug.last) { this.plug.hits++; this.plug.last = n; }
        if (this.plug.hits >= 3 || n < this.plug.n0 * 0.82) this.breakPlug();
      }
    }
  }

  /** Voxels of rock i crumble away (lumps tumble off his legs). */
  crumbleRock(i, quiet = false) {
    const r = this.rocks[i];
    if (r.gone) return;
    r.gone = true;
    const broken = [];
    for (const [x, y, z] of r.vox) {
      const m = this.w.voxelAt(x, y, z);
      if (!m || MAT[m]?.fluid || m >= ORE_BASE || MANMADE.has(m)) continue;
      broken.push({ x, y, z, m, c: MAT[m]?.tones?.[1 + ((x + y + z) & 1)] ?? 0x707070 });
      this.w.setVoxel(x, y, z, 0);
    }
    this.debris(broken, [Math.sin(this.L.star.yaw), 0.6, Math.cos(this.L.star.yaw)]);
    this.audio.play('break', { snd: 'stone', vol: 0.8 });
    this.owner.shake?.(0.15);
    const left = this.rocks.filter((q) => !q.gone).length;
    if (quiet) return;
    this.say(left === 0 ? 'Oh! Oh, that\'s the last of them!' : LINES.rockCheer[Math.min(LINES.rockCheer.length - 1, this.rocks.length - 1 - left)], { dur: 2.2 });
    this.star.rig.doEmote('happy', 1.2);
  }

  /** Broken voxels: a few tumbling lumps (the scene's debris bodies), dust and grit. */
  debris(broken, out) {
    if (!broken.length) return;
    const cells = new Map();
    const q = Math.max(1, VOX >> 2);
    for (const v of broken) {
      const k = Math.floor(v.x / q) + ',' + Math.floor(v.y / q) + ',' + Math.floor(v.z / q);
      let c = cells.get(k);
      if (!c) cells.set(k, (c = []));
      c.push(v);
    }
    let n = 0;
    for (const L of [...cells.values()].sort((a, b) => b.length - a.length)) {
      if (n++ > 5) break;
      const sp = 0.5 + Math.random();
      this.c.bodies?.spawn(L, { vel: [out[0] * sp + rand(-0.5, 0.5), out[1] * sp + rand(0.3, 1.2), out[2] * sp + rand(-0.5, 0.5)], life: 0.9 + Math.random() * 0.8, bounce: 0.4 });
    }
    const v0 = broken[(broken.length / 2) | 0];
    const x = (v0.x + 0.5) / VOX, y = (v0.y + 0.5) / VOX, z = (v0.z + 0.5) / VOX;
    this.fx?.dust(x, y, z, 14, [0.55, 0.47, 0.4], 0.25, out);
    this.fx?.chips(x, y, z, 10, col01(v0.c), out);
  }

  oreExposure() {
    const w = this.w, mo = this.L.ore.m;
    let rim = 0, open = 0;
    for (const [x, y, z] of this.oreVox) {
      if (w.voxelAt(x, y, z) !== mo) continue;
      let edge = false, air = false;
      for (const [dx, dy, dz] of N6) { const m = w.voxelAt(x + dx, y + dy, z + dz); if (m !== mo) { edge = true; if (!m || MAT[m]?.fluid) air = true; } }
      if (edge) { rim++; if (air) open++; }
    }
    // solid earth in the pocket round it (each blow there takes some)
    const o = this.L.ore;
    let near = 0;
    const r = 0.45;
    for (let vz = Math.floor((o.z - r) * VOX); vz <= Math.floor((o.z + r) * VOX); vz += 1) for (let vy = Math.floor((o.y - r) * VOX); vy <= Math.floor((o.y + r) * VOX); vy += 1) for (let vx = Math.floor((o.x - r) * VOX); vx <= Math.floor((o.x + r) * VOX); vx += 1) {
      const dx = (vx + 0.5) / VOX - o.x, dy = (vy + 0.5) / VOX - o.y, dz = (vz + 0.5) / VOX - o.z;
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      const m = w.voxelAt(vx, vy, vz);
      if (m && m !== mo && !MAT[m]?.fluid) near++;
    }
    return { frac: rim ? open / rim : 0, near, n: rim };
  }

  oreGlint() {
    const o = this.L.ore;
    this.fx?.glints(o.x + 0.2 + rand(-0.02, 0.06), o.y + rand(-0.15, 0.15), o.z + rand(-0.17, 0.17), [1, 0.72, 0.42]);
  }

  /** The copper comes out of the wall wrapped in its rock: a clump (or a pickup without Clumps). */
  freeOre(pl) {
    if (this.ore.free) return;
    this.ore.free = true;
    const L = this.L, o = L.ore, mo = o.m, mat = MAT[mo];
    const voxels = [];
    for (const [x, y, z] of this.oreVox) {
      if (this.w.voxelAt(x, y, z) !== mo) continue;
      voxels.push({ x, y, z, m: mo, c: mat.tones[1 + ((x * 3 + y + z) % 3)] });
      this.w.setVoxel(x, y, z, 0);
    }
    const d = { id: 'oldstar_copper', item: o.item, oreId: mat.ore, x: o.x + 0.06, y: o.y, z: o.z, r: o.r, q: 88, seed: 1907 };
    const s = { taken: true, hits: 0, q: 88, brushed: 0, seen: true };
    const n0 = this.owner.clumps?.list?.length ?? 0;
    this.owner.popOre?.({ d, s, voxels, pristine: true }, o.face);
    this.clump = this.owner.clumps?.list?.length > n0 ? this.owner.clumps.list[this.owner.clumps.list.length - 1] : null;
    this.star.rig.doEmote('hop', 1);
  }

  plugVoxels() {
    if (this.plug.vox) return this.plug.vox;
    const P = this.L.plug, out = [];
    for (let vz = Math.floor(P.z0 * VOX); vz < Math.ceil(P.z1 * VOX); vz++) for (let vy = Math.floor(P.y0 * VOX); vy < Math.ceil(P.y1 * VOX); vy++) for (let vx = Math.floor(P.x0 * VOX); vx < Math.ceil(P.x1 * VOX); vx++) {
      const x = (vx + 0.5) / VOX, y = (vy + 0.5) / VOX, z = (vz + 0.5) / VOX;
      if (x > P.x0 && x < P.x1 && y > P.y0 && y < P.y1 && z > P.z0 && z < P.z1) out.push([vx, vy, vz]);
    }
    this.plug.vox = out;
    return out;
  }

  breakPlug() {
    if (this.plug.open) return;
    this.plug.open = true;
    const broken = [];
    for (const [x, y, z] of this.plugVoxels()) {
      const m = this.w.voxelAt(x, y, z);
      if (!m || MAT[m]?.fluid || m >= ORE_BASE || MANMADE.has(m)) continue;
      broken.push({ x, y, z, m, c: MAT[m]?.tones?.[1 + ((x + y) & 1)] ?? 0x6a5040 });
      this.w.setVoxel(x, y, z, 0);
    }
    this.debris(broken, [0, 0.4, -1]);
    this.audio.play('collapse', { vol: 0.6 });
    this.audio.play('break', { snd: 'dirt' });
    this.owner.shake?.(0.35);
  }

  /** Ladder voxels against the wall under the ledge. */
  ladderCount() {
    if (this.ladT !== undefined && this.time - this.ladT < 0.25) return this.ladN;
    this.ladT = this.time;
    const Z = this.L.ladderZone;
    let n = 0;
    for (let vz = Math.floor(Z.z0 * VOX); vz < Math.ceil(Z.z1 * VOX); vz++) for (let vy = Math.floor(Z.y0 * VOX); vy < Math.ceil(Z.y1 * VOX); vy++) for (let vx = Math.floor(Z.x0 * VOX); vx < Math.ceil(Z.x1 * VOX); vx++) if (this.w.voxelAt(vx, vy, vz) === M.LADDER) n++;
    this.ladN = n;
    return n;
  }

  /**
   * The generator dresses caves after the features are stamped (moss, vines, stalagmites,
   * mushrooms). Whatever grew in the dug-out space of his dig is cleared once per loaded chunk
   * (never what the mole built: ladders, planks, bricks).
   */
  scrub() {
    if (!this.toScrub) {
      // every chunk the layout touches, once
      const seen = new Set();
      this.toScrub = [];
      for (const bx of prologueBoxes(this.L)) {
        const c0 = Math.floor(bx[0] * VOX) >> CB, c1 = Math.floor(bx[3] * VOX) >> CB;
        const e0 = Math.floor(bx[1] * VOX) >> CB, e1 = Math.floor(bx[4] * VOX) >> CB;
        const f0 = Math.floor(bx[2] * VOX) >> CB, f1 = Math.floor(bx[5] * VOX) >> CB;
        for (let cz = f0; cz <= f1; cz++) for (let cy = e0; cy <= e1; cy++) for (let cx = c0; cx <= c1; cx++) {
          const key = cx + ',' + cy + ',' + cz;
          if (!seen.has(key)) { seen.add(key); this.toScrub.push([cx, cy, cz]); }
        }
      }
    }
    if (!this.toScrub.length) return;
    let budget = 1;
    for (let i = 0; i < this.toScrub.length && budget > 0; i++) {
      const [cx, cy, cz] = this.toScrub[i];
      const ch = this.w.chunk?.(cx, cy, cz);
      if (!ch || ch.pending) continue;
      this.toScrub.splice(i--, 1);
      this.scrubbed.add(cx + ',' + cy + ',' + cz);
      if (!ch.vox) continue;
      budget--;
      this.scrubChunk(cx, cy, cz);
    }
  }

  scrubChunk(cx, cy, cz) {
    const L = this.L, w = this.w, X0 = cx * CS, Y0 = cy * CS, Z0 = cz * CS;
    const clear = [];
    for (const bx of prologueBoxes(L)) {
      const a0 = Math.max(0, Math.floor(bx[0] * VOX) - X0), a1 = Math.min(CS, Math.ceil(bx[3] * VOX) - X0);
      const b0 = Math.max(0, Math.floor(bx[1] * VOX) - Y0), b1 = Math.min(CS, Math.ceil(bx[4] * VOX) - Y0);
      const c0 = Math.max(0, Math.floor(bx[2] * VOX) - Z0), c1 = Math.min(CS, Math.ceil(bx[5] * VOX) - Z0);
      for (let z = c0; z < c1; z++) for (let y = b0; y < b1; y++) for (let x = a0; x < a1; x++) {
        const vx = X0 + x, vy = Y0 + y, vz = Z0 + z;
        const m = w.voxelAt(vx, vy, vz);
        if (!m || MANMADE.has(m) || MAT[m]?.fluid || m >= ORE_BASE) continue;
        const want = prologueWants(L, (vx + 0.5) / VOX, (vy + 0.5) / VOX, (vz + 0.5) / VOX);
        if (want === 0) clear.push(vx, vy, vz, 0);
        else if (want > 0 && want !== m && want !== M.LOAM && DECOR.has(m)) clear.push(vx, vy, vz, want); // mossed-over rocks are rocks again
      }
    }
    for (let i = 0; i < clear.length; i += 4) w.setVoxel(clear[i], clear[i + 1], clear[i + 2], clear[i + 3]);
  }

  // ------------------------------------------------------------------ the crosshair: him, the map, the cage
  pickAt(eye, dir, reach) {
    const step = this.step;
    // the map tube on the ledge
    if (this.dress.map && STEPS.indexOf(step) >= STEPS.indexOf('ledge') && STEPS.indexOf(step) <= STEPS.indexOf('map')) {
      const p = this.dress.mapPoint(_v);
      const ox = p.x - eye.x, oy = p.y - eye.y, oz = p.z - eye.z;
      const along = ox * dir.x + oy * dir.y + oz * dir.z;
      if (along > 0 && along < reach + 0.2) {
        const d2 = ox * ox + oy * oy + oz * oz - along * along;
        if (d2 < 0.24 * 0.24) return 'map';
      }
    }
    // a clump lying in front of him wins
    const hit = this.star.hit(eye, dir, reach);
    if (hit !== null) {
      const c = this.clump;
      if (c && c.state === 'world') {
        const ox = c.pos.x - eye.x, oy = c.pos.y - eye.y, oz = c.pos.z - eye.z;
        const along = ox * dir.x + oy * dir.y + oz * dir.z;
        if (along > 0 && along < hit && ox * ox + oy * oy + oz * oz - along * along < (c.r * 2) ** 2) return null;
      }
      return 'star';
    }
    // the lift cage (before he's in it, you're not leaving without him; a mole who came down by
    // lift can still ride it back up)
    if ((this.from !== 'lift' || step === 'cage') && this.owner.liftNear?.()) {
      const L = this.w.plan.lifts.find((l) => l.id === 'L0');
      if (L && Math.hypot(L.x - this.owner.player.pos.x, L.z - this.owner.player.pos.z) < 2.3) return 'cage';
    }
    return null;
  }

  takeMap() {
    if (!this.dress.map) return;
    this.dress.takeMap();
    this.audio.play('pickup_gem', { pitch: 0.9 });
    this.audio.play('discover');
    this.ui.toast('<b>Old Star\'s star-nose map</b> · your radar shows the way home and every lift you find', { kind: 'good', dur: 4200 });
    this.showRadar();
    this.enter('lifts');
  }

  // ------------------------------------------------------------------ talking to him, skipping, the ride
  openTalk() {
    if (this.panel) return;
    const touch = this.owner.isTouch?.();
    const what = GOALS[this.step] || 'Follow Old Star';
    const hint = {
      rocks: LINES.rocks, ore: LINES.oreDig, loose: LINES.oreLoose, held: LINES.oreHeld, ledge: LINES.ladder, climb: LINES.ladderUp,
      map: LINES.mapTake, lifts: LINES.follow, walk: LINES.follow, plug: LINES.plug, cage: LINES.bell, freed: LINES.name,
    }[this.step];
    this.say(hint || LINES.walk);
    const body = el('div', { class: 'cf-body' }, [
      el('p', { class: 'cf-text', html: `<b>${what}.</b><br>${pickLine(hint, touch) || ''}` }),
      el('div', { class: 'cf-row', style: { flexWrap: 'wrap', gap: 'calc(var(--px) * 4)' } }, [
        el('button', { class: 'btn', onclick: () => this.panel?.close() }, 'Right you are'),
        el('button', { class: 'btn alt', onclick: () => this.confirmSkip() }, 'Skip the lessons'),
      ]),
    ]);
    this.panel = this.ui.openPanel({ title: NAME, sub: 'An old star-nosed mole, forty years down here.', body, width: 'min(calc(var(--px) * 150), calc(100vw - 32px))', onClose: () => { this.panel = null; } });
  }

  async confirmSkip() {
    this.panel?.close();
    const ok = await this.ui.confirm('<b>Skip Old Star\'s lessons?</b><br>You\'ll ride straight up to his tavern with him.', 'Skip', 'Keep learning');
    if (ok) this.skip();
  }

  skip() {
    if (this.leaving) return;
    this.say(LINES.skip, { dur: 3 });
    this.ride(true);
  }

  ride(skipped = false) {
    if (this.leaving) return;
    this.leaving = true;
    this.enter('ride');
    const pl = this.owner.player;
    this.hold = { x: pl.pos.x, z: pl.pos.z };
    if (!skipped) this.say('ride', { dur: 2.5 });
    this.star.play('idle');
    this.star.rig.doEmote('hop', 0.8);
    this.audio.play('bell', { vol: 0.6 });
    this.audio.play('creak', { vol: 0.6 });
    this.audio.play('rumble_hit', { vol: 0.35 });
    this.owner.shake?.(0.25);
    this.finish();
    setTimeout(() => {
      const g = this.owner.game;
      if (g.scene !== this.owner) return;
      const params = { from: 'lift', first: true };
      const opts = { transition: 'fade', dur: 0.8, color: 0x0a0605 };
      if (typeof this.owner.leave === 'function') this.owner.leave('home', params, opts);
      else g.goto('home', params, opts);
    }, skipped ? 1400 : 1100);
  }

  /** The opening is done: flags for the rest of the game. */
  finish() {
    const st = this.st;
    st.flag('prologue', true);
    st.flag('fallen', true);
    st.flag('nugget', true);
    this.save.step = 'done';
    st.learn?.('elevator');
    if (!this.ore.free) for (const [x, y, z] of this.oreVox) if (this.w.voxelAt(x, y, z) === this.L.ore.m && this.loaded(x, y, z)) this.w.setVoxel(x, y, z, M.LOAM);
    if (GIFT_CHISEL && !st.owns('chisel_basic') && !st.equipped('chisel') && ITEMS.chisel_basic) { st.addItem('chisel_basic'); st.equip('chisel_basic'); }
  }

  // ------------------------------------------------------------------ test hooks
  setupDebug() {
    const D = this.debug;
    const pl = () => this.owner.player;
    D.step = () => this.step;
    D.layout = () => this.L;
    D.star = () => ({ x: this.star.pos.x, y: this.star.pos.y, z: this.star.pos.z, state: this.star.state, path: !!this.star.path });
    D.go = (step) => {
      const i = STEPS.indexOf(step);
      if (i < 0) return false;
      this.co = null;
      this.hold = null;
      if (i > STEPS.indexOf('rocks')) for (let k = 0; k < this.rocks.length; k++) if (!this.rocks[k].gone) this.crumbleRock(k, true);
      if (i > STEPS.indexOf('ore') && !this.ore.free) this.freeOre(pl());
      if (i > STEPS.indexOf('map')) this.dress.takeMap();
      if (i > STEPS.indexOf('map')) this.showRadar();
      if (i > STEPS.indexOf('plug')) this.breakPlug();
      const s = this.standFor(step);
      this.star.stop();
      this.star.pos.set(s.x, s.y, s.z);
      this.star.face(s.yaw ?? 0, true);
      this.star.play(i <= STEPS.indexOf('rocks') ? 'pinned' : 'idle');
      this.enter(step, true);
      return step;
    };
    D.clearRocks = () => { for (let k = 0; k < this.rocks.length; k++) this.crumbleRock(k); };
    D.freeOre = () => this.freeOre(pl());
    D.clump = () => this.clump;
    D.grab = () => this.owner.clumps?.debug?.grab(this.clump);
    D.clean = () => this.owner.clumps?.debug?.clean();
    D.bag = () => { const cl = this.owner.clumps; if (cl?.held) cl.use(pl().eye(), pl().forward(), 2); };
    D.ladder = () => {
      // what the build tool puts up: a strip of ladder against the wall under the ledge
      const Z = this.L.ladderZone, zc = (Z.z0 + Z.z1) / 2, x = Math.ceil(this.L.ledge.wallX * VOX - 0.5) - 1;
      for (let vy = Math.floor(Z.y0 * VOX); vy < Math.floor(this.L.ledge.y * VOX); vy++) for (let k = -1; k <= 1; k++) {
        if (k === 0 && (vy & 1)) continue;
        const vz = Math.floor(zc * VOX) + k;
        if (!this.w.voxelAt(x, vy, vz)) this.w.setVoxel(x, vy, vz, M.LADDER);
      }
      return this.ladderCount();
    };
    D.toLedge = () => { const G = this.L.ledge; D.stand(G.x0 + 0.45, G.y + 0.02, (G.z0 + G.z1) / 2 - 0.2, -Math.PI / 2 - 0.3, -0.25); };
    D.takeMap = () => this.takeMap();
    D.breakPlug = () => this.breakPlug();
    D.ride = () => this.ride();
    D.skip = () => this.skip();
    D.talk = () => this.openTalk();
    D.say = (k) => this.say(k);
    /** Put the mole somewhere (world meters), facing yaw/pitch. */
    D.stand = (x, y, z, yaw = pl().yaw, pitch = 0) => { const p = pl(); p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; this.hold = null; this.owner.terrain?.warm?.(x, y + 0.5, z, 2); };
    /** Turn the mole's view to a world point. */
    D.look = (x, y, z) => { const p = pl(); const e = p.eye(); p.yaw = Math.atan2(-(x - e.x), -(z - e.z)); p.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z)); };
    D.lookStar = () => { const h = this.star.headWorld(new THREE.Vector3()); D.look(h.x, h.y - 0.25, h.z); };
    /** Advance the scene n seconds in 1/30 s steps (headless runs are slow). */
    D.run = (sec = 1) => { const s = this.owner; for (let k = 0; k < Math.round(sec * 30); k++) s.update(1 / 30); return this.step; };
  }
}

const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

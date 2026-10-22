// Old Star's mining lesson (docs/REMAKE.md › the lessons). After waking up in his cave workshop you
// ride the cage lift down with him (deep { from: 'lift', lift: 'L0' }) and he walks you through his
// practice dig (src/deep/gen/prologue.js), beside you, reacting to what you do:
//   plug     the lift room's south wall is his loam plug: your first hole            → mine_rock
//   walk     follow him down his crawl into the dig                                   → reach dig
//   ore      dig the loam round the copper in the west wall, not the ore itself       → mine_ore
//   held     pick the clump up, chip it clean with his spare chisel, bag it           → mine_clean
//   gem      the south wall winks: dig in, a geode, take the amethyst                 → mine_gem
//   ledge    a ladder (build tool) up to the ledge, take his map (the book's map;
//            the radar comes on)                                                     → mine_ladder, mine_map
//   critter  a rock-nibbler comes out of its hole: hold your guard as it jumps
//            (mouse 2 / F; the scene's own block), then a tap of the pick            → mine_block
//   back     back through the crawl to the cage with the copper, ring the bell:
//            home { from: 'lift', lesson: 'mine' }; flag 'prologue' = lesson done    → mine_done
// He talks through the tutor (game.ui.tutor.say(html, { mood, key })), falling back on a speech
// bubble over his head; the step's instruction stays up between his other lines. Talking to him (E)
// shows what to do and offers to skip this lesson (or all of them: lesson 'skip').
// Progress lives in state.data.deep.prologue.step, so a lesson left half way picks up where it was.
// Active only while flag('prologue') is unset and the mole came down by the L0 cage (else inert).
//
// DigScene hooks: spawn() · update(dt, { player, eye, time, busy }) → events · target(eye, dir, reach)
// · use(eye, dir, reach) → events | null · lights(eye) · dispose(). Test hooks: prologue.debug.*.
import * as THREE from 'three';
import { VOX, M, MAT, ORE_BASE } from './materials.js';
import { CS } from './Generator.js';
import { prologueLayout, prologueOreVoxels, prologueGeodeVoxels, prologueWants, prologueBoxes, prologueInside, prologueCarved } from './gen/prologue.js';
import { OldStarActor } from './prologue/oldstar.js';
import { Dressing } from './prologue/dressing.js';
import { Talk } from './prologue/talk.js';
import { Nibbler } from './prologue/critter.js';
import { LINES, MOOD, GOALS, NAME, VOICE, pickLine } from './prologue/lines.js';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';
import { el, clamp, rand, pick } from '../core/util.js';

const GIFT_CHISEL = true; // Old Star hands over his spare chisel for the clump
export const STEPS = ['arrive', 'plug', 'walk', 'ore', 'loose', 'held', 'gem', 'gemfound', 'ledge', 'climb', 'map', 'critter', 'back', 'cage', 'ride'];
// where a lesson left half way picks up (the clump and the gem are found again from the world)
const RESUME = { loose: 'ore', held: 'ore', gemfound: 'gem', climb: 'ledge', map: 'ledge', cage: 'back', ride: 'back' };
const CB = Math.log2(CS);
const MANMADE = new Set([M.LADDER, M.BOARDS, M.BRICK, M.TIMBER, M.LANTERN, M.DOOR, M.BURROW]);
// what the generator's cave dressing turns surfaces into (moss, sand, mycelium...)
const DECOR = new Set([M.MOSS, M.SAND, M.MYCEL, M.VINES, M.ROOTS, M.SNOW, M.ASH].filter((m) => m !== undefined));
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const col01 = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const after = (a, b) => STEPS.indexOf(a) > STEPS.indexOf(b);

export class Prologue {
  constructor(ctx) {
    this.c = ctx;
    this.st = ctx.state;
    this.owner = ctx.owner;
    this.w = ctx.world;
    this.ui = ctx.ui;
    this.audio = ctx.audio;
    this.fx = ctx.fx;
    const params = ctx.params || {};
    const feat = ctx.plan?.features?.find((f) => f.kind === 'prologue');
    this.from = params.from || 'home';
    const liftId = this.from === 'lift' ? params.lift || 'L0' : null;
    this.on = !!feat && !!ctx.plan.prologue && !this.st.flag('prologue') && (liftId === 'L0' || this.from === 'fall' || !!params.lesson);
    this.debug = { on: () => this.on };
    if (!this.on) return;
    const L = this.L = prologueLayout(feat);
    this.time = 0;
    this.cd = {};
    this.co = null;
    this.coWait = 0;
    this.ev = [];
    this.emitted = [];
    this.lineId = 0;
    this.lineDone = true;
    this.lineEnd = 0;
    this.tipKey = null;
    // the save: how far the lesson got
    const deep = this.st.data.deep ||= { seed: 1, tunnels: [], stations: [] };
    this.save = deep.prologue ||= { step: 'arrive' };
    if (!STEPS.includes(this.save.step)) this.save.step = 'arrive';
    const resume = RESUME[this.save.step] || this.save.step;
    this.after = after(resume, 'walk') ? resume : null;
    // the scene's own first-visit hints would talk over Old Star: he does the explaining
    if (this.owner?.flags) { this.owner.flags.hintRadar = true; this.owner.flags.firstOre = true; }
    // nothing else grows in his dig (props are placed later, per chunk)
    const props = this.owner?.props;
    if (props && typeof props.blocked === 'function') {
      const orig = props.blocked;
      props.blocked = function (x, y, z, pad = 0.3) { return prologueInside(L, x, y, z, pad) || orig.call(this, x, y, z, pad); };
      this.unpatch = () => { props.blocked = orig; };
    }
    // Old Star (in the cage beside you), his dig, his voice, the critter in its hole
    this.star = new OldStarActor(ctx, L.spots.arrive);
    this.dress = new Dressing(ctx, L);
    this.talk = new Talk(this.ui, this.owner.game.engine, NAME);
    this.nibbler = new Nibbler(ctx, L);
    this.lantern = new THREE.PointLight(0xffb870, 2.4, 7.5, 1.2);
    this.lantern.position.set(L.lantern.x, L.lantern.y + 0.3, L.lantern.z);
    ctx.scene3.add(this.lantern);
    // what the lessons hang on: voxel lists to watch
    this.oreVox = prologueOreVoxels(L);
    this.geodeVox = prologueGeodeVoxels(L);
    this.ore = { n0: -1, nearLast: -1, hits: 0, free: after(resume, 'ore') };
    this.geode = { n0: -1, last: -1, open: after(resume, 'gem') };
    this.plug = { vox: null, n0: -1, last: -1, hits: 0, open: false };
    if (after(resume, 'gem')) this.dress.takeGem();
    if (after(resume, 'map')) this.dress.takeMap();
    this.scrubbed = new Set();
    this.ores0 = this.st.data.stats.ores;
    this.radarShown = after(resume, 'map');
    this.setupDebug();
    this.enter('arrive');
  }

  // ------------------------------------------------------------------ DigScene hooks
  /** Only for an arrival by the old 'fall' route: put the mole in the cage, as if by lift. */
  spawn() {
    if (!this.on) return null;
    const c = this.L.cage;
    return { x: c.x, y: c.y + 0.02, z: c.z, yaw: Math.PI };
  }

  update(dt, o) {
    if (!this.on) return null;
    this.time += dt;
    this.ev = [];
    const pl = o.player, eye = o.eye;
    if (!this.started) this.start(pl);
    if (this.hold) { pl.pos.x = this.hold.x; pl.pos.z = this.hold.z; pl.vel.x = 0; pl.vel.z = 0; }
    this.scrub();
    this.watch(dt, pl);
    if (!o.busy || this.leaving) {
      this.runScript(dt);
      this.stepLogic(dt, pl, eye);
      for (const e of this.nibbler.update(dt, { player: pl })) this.critterEvent(e);
    }
    // Old Star looks at you while he talks (unless something else holds his eye)
    const st = this.star;
    st.lookAt = this.lookPoint || _w.copy(eye);
    st.avoid = pl.pos;
    st.update(dt, eye);
    if (st.blockedT > 0.7 && !o.busy) this.sayCd('excuse', 9);
    this.dress.update(dt);
    // glints: the copper in the wall, the geode's wink, the map tube, the amethyst
    this.glintT = (this.glintT || 0) - dt;
    if (this.glintT <= 0) {
      this.glintT = 0.2;
      if (this.step === 'ore' && !this.ore.free) this.oreGlint();
      if (this.step === 'gem' && !this.geode.open) this.geodeGlint();
      if (this.dress.gem && this.geode.open && Math.random() < 0.6) { const p = this.dress.gemPoint(_v); this.fx?.glints(p.x + rand(-0.06, 0.06), p.y + rand(-0.04, 0.06), p.z + rand(-0.06, 0.06), [0.85, 0.6, 1]); }
      if (this.dress.map && (this.step === 'ledge' || this.step === 'climb' || this.step === 'map')) { const p = this.dress.mapPoint(_v); this.fx?.glints(p.x + rand(-0.2, 0.2), p.y + rand(0, 0.08), p.z + rand(-0.25, 0.25), [1, 0.85, 0.5]); }
    }
    // words: the step's instruction comes back whenever he isn't saying something else
    this.tipTick(dt);
    this.talk.update(dt, this.star.headWorld(_v).add(_w.set(0, 0.08, 0)), this.owner.camera);
    this.talk.goal(this.owner.game.quests ? '' : this.goalText());
    this.guardButton(this.step === 'critter' && this.nibbler.active);
    return this.ev;
  }

  target(eye, dir, reach) {
    if (!this.on || this.step === 'ride' || this.leaving) return null;
    if (this.owner.clumps?.capture?.()) return null;
    const t = this.pickAt(eye, dir, reach);
    if (!t) return null;
    if (t === 'star') return { label: this.step === 'cage' && this.inCage() ? 'Ride up with Old Star' : 'Talk to Old Star', kind: 'use' };
    if (t === 'map') return { label: 'Take Old Star\'s map', kind: 'use' };
    if (t === 'gem') return { label: 'Take the amethyst', kind: 'use' };
    if (t === 'cage') return { label: 'Ring the bell: up with Old Star', kind: 'use' };
    return null;
  }

  use(eye, dir, reach) {
    if (!this.on || this.step === 'ride' || this.leaving) return null;
    const cl = this.owner.clumps;
    if (cl?.capture?.() || cl?.held) return null; // E bags the clump in paw
    const t = this.pickAt(eye, dir, reach);
    if (!t) return null;
    if (t === 'map') { this.takeMap(); return []; }
    if (t === 'gem') return this.takeGem();
    if (t === 'cage' || (t === 'star' && this.step === 'cage' && this.inCage())) { this.ride(); return []; }
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
    if (this.geode.open && this.dress.gem) {
      out[3] ||= { x: 0, y: 0, z: 0, c: [0.55, 0.3, 0.8], r: 1.4 };
      out[3].x = L.gem.x; out[3].y = L.gem.y + 0.1; out[3].z = L.gem.z - 0.1;
    } else out.length = 3;
    return out;
  }

  dispose() {
    if (!this.on) return;
    this.unpatch?.();
    this.star?.dispose();
    this.dress?.dispose();
    this.talk?.dispose();
    this.nibbler?.dispose();
    this.guardButton(false);
    this.tutor?.hide?.('os-tip');
    if (this.lantern) { this.c.scene3.remove(this.lantern); this.lantern.dispose?.(); }
  }

  // ------------------------------------------------------------------ steps
  get tutor() { return this.owner?.game?.ui?.tutor || null; }

  /** Tell the quests (docs/REMAKE.md: act 'lesson' steps), once each. */
  lesson(step) {
    if (this.emitted.includes(step)) return;
    this.emitted.push(step);
    this.act('lesson', { step });
  }
  act(type, data = {}) {
    if (typeof this.owner?.act === 'function') this.owner.act(type, data);
    else this.st.emit?.('act', { ...data, type });
  }

  enter(step, quiet = false) {
    this.step = step;
    if (after(step, this.save.step)) this.save.step = step;
    this.stepT = 0;
    this.lookPoint = null;
    this.co = null;
    this.setTip(null);
    switch (step) {
      case 'arrive': this.run(this.arriveScript()); break;
      case 'plug': this.run(this.plugScript()); break;
      case 'walk': this.run(this.walkScript(quiet)); break;
      case 'ore': this.run(this.oreScript()); break;
      case 'loose': this.run(this.looseScript()); break;
      case 'held': this.run(this.heldScript()); break;
      case 'gem': this.run(this.gemScript()); break;
      case 'gemfound': this.run(this.gemFoundScript()); break;
      case 'ledge': this.run(this.ledgeScript()); break;
      case 'climb': this.setTip(null); this.say('ladderUp'); break;
      case 'map': this.setTip('mapTip'); break;
      case 'critter': this.run(this.critterScript()); break;
      case 'back': this.run(this.backScript()); break;
      case 'cage': this.run(this.cageScript()); break;
      case 'ride': break;
    }
  }

  goalText() {
    if (this.step === 'ledge' && this.ladderCount() >= 6) return GOALS.climb;
    return GOALS[this.step] ?? '';
  }

  /** First frame: lights, the radar (his map shows it), the opening lesson act. */
  start(pl) {
    this.started = true;
    this.star.light(!!this.owner.nugget);
    this.radarFn = (o) => {
      const r = this.owner.radar(o);
      if (!this.leaving) r.markers.push({ kind: 'home', x: this.star.pos.x, y: this.star.pos.y + 0.5, z: this.star.pos.z, label: NAME, color: 0xff8ab0 });
      return r;
    };
    if (this.radarShown) this.showRadar(); else this.ui.setRadar?.(null);
    this.lesson('dig');
    void pl;
  }

  showRadar() {
    this.radarShown = true;
    this.ui.setRadar?.(this.radarFn, { heading: () => this.owner.player.yaw });
  }

  // ------------------------------------------------------------------ talking
  /** Say a line (a LINES key, or text). o: { mood, dur, key }. Returns a predicate: the line is over. */
  say(line, o = {}) {
    const touch = this.owner.isTouch?.();
    const k = typeof line === 'string' && LINES[line] !== undefined ? line : null;
    let text = k ? LINES[k] : line;
    if (Array.isArray(text)) text = pick(text);
    text = pickLine(text, touch);
    if (!text) return () => true;
    const mood = o.mood || (k && MOOD[k]) || 'calm';
    const plain = text.replace(/<[^>]+>/g, '');
    const dur = o.dur ?? clamp(1.4 + plain.length * 0.05, 2.2, 6.5);
    const id = ++this.lineId;
    this.lineDone = false;
    const until = this.time + dur + plain.length / 42 * 0.4;
    const tutor = this.tutor;
    if (tutor) {
      this.talk.hide();
      const p = tutor.say(text, { mood, key: o.key || 'os-' + (k || 'line'), dur: o.dur });
      p?.then?.(() => { if (this.lineId === id) { this.lineDone = true; this.lineEnd = this.time; } });
    } else {
      this.talk.show(text, dur);
      const d = this.owner.player ? this.star.pos.distanceTo(this.owner.player.pos) : 3;
      this.audio.play('babble', { pitch: VOICE.pitch * rand(0.95, 1.05), n: clamp(Math.round(plain.length / 9), 2, 8), wave: VOICE.wave, vol: d > 9 ? 0.5 : 1 });
    }
    this.star.rig.talk(Math.min(dur * 0.8, 0.6 + plain.length / 26));
    this.star.mood(mood, dur);
    if (Math.random() < 0.4) this.star.rig.sniff?.(0.7);
    this.lineUntil = until;
    return () => this.lineId !== id || this.lineDone || this.time > until;
  }
  /** A line at most every cd seconds (per key), and never over a scripted one. */
  sayCd(key, cd = 8) {
    if (this.cd[key] && this.time - this.cd[key] < cd) return false;
    if (this.co && !this.lineOver()) return false;
    this.cd[key] = this.time;
    this.say(key);
    return true;
  }
  lineOver() { return this.lineDone || this.time > (this.lineUntil || 0); }

  /** The step's standing instruction (a LINES key, or null). */
  setTip(key) {
    this.tipKey = key;
    this.tipShown = null;
    if (!key) { this.tutor?.hide?.('os-tip'); }
  }
  tipTick() {
    const key = this.tipKey;
    if (!key) return;
    const tutor = this.tutor;
    if (tutor) {
      const act = tutor.active;
      if (act && act.key !== 'os-tip') return; // he's saying something else
      if (!act && this.time - (this.lineEnd || 0) < 0.6 && !this.lineOver()) return;
      if (act && this.tipShown === key) return;
      const text = pickLine(LINES[key], this.owner.isTouch?.());
      tutor.say(text, { mood: MOOD[key] || 'calm', key: 'os-tip', dur: Infinity });
      this.tipShown = key;
    } else if (!this.talk.showing && this.time - (this.tipAt || -99) > 7) {
      this.tipAt = this.time;
      this.talk.show(pickLine(LINES[key], this.owner.isTouch?.()), 6);
    }
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

  *arriveScript() {
    const star = this.star, L = this.L, S = L.spots;
    star.play('idle');
    yield 0.4;
    // out of the cage (its open side is +z), a word over his shoulder once there's room to see him,
    // then on to the plug
    const pl = this.owner.player;
    star.walk([{ x: S.arrive.x, y: L.lift.y, z: L.lift.z + 0.55 }, { x: L.lift.x + 0.2, y: L.lift.y, z: L.lift.z + 1.5 }], null, 0.9);
    star.squeeze = 2.2; // it's a small cage: he edges past you rather than waiting for you to move
    yield () => !star.path || this.stepT > 4;
    if (pl) star.faceTo(pl.pos);
    const said = this.say(this.after ? 'again' : 'arrive');
    yield 1.6;
    star.walk([{ x: L.lift.x + 0.15, y: L.lift.y, z: L.lift.z + 1.9 }, S.plug], () => { star.faceTo(this.plugFace()); }, 0.9);
    yield said;
    yield () => !star.path;
    if (this.after) {
      if (this.after === 'back') { this.after = null; this.enter('cage'); return; }
      this.enter(this.plugOpen() ? 'walk' : 'plug', true);
      return;
    }
    if (this.plugOpen()) { this.enter('walk'); return; }
    this.enter('plug');
  }

  *plugScript() {
    const star = this.star, L = this.L, pc = this.plugFace();
    star.faceTo(pc);
    star.play('point');
    this.lookPoint = new THREE.Vector3(pc.x, pc.y, pc.z);
    yield this.say('plug');
    this.lookPoint = null;
    star.play('idle');
    this.setTip('plugTip');
  }

  *walkScript(quiet) {
    const star = this.star, L = this.L, LP = (x, z) => ({ x: L.lift.x + x, y: L.lift.y, z: L.lift.z + z });
    const C = L.crawl;
    const ez = this.entryZ();
    const path = [LP(0.35, ez), LP(1.25, ez + 0.05), L.corner, ...C.slice(0, -1).reverse(), { x: L.mouth.x + 0.35, y: L.o.y, z: L.mouth.z - 0.5 }, L.spots[this.after && this.after !== 'back' ? this.after : 'ore'] || L.spots.ore];
    this.walking = true;
    if (this.walkFromPlug) { this.walkFromPlug = false; star.play('cheer'); yield this.say('plugDone'); }
    star.play('beckon');
    if (!quiet) yield this.say('follow');
    star.play('idle');
    star.walk(path, null, 1.0);
    yield () => !star.path;
    this.walking = false;
    yield this.say('welcome');
    this.enter(this.after || 'ore', true);
    this.after = null;
  }

  *oreScript() {
    const star = this.star, L = this.L, sp = L.spots.ore;
    if (star.pos.distanceTo(_v.set(sp.x, sp.y, sp.z)) > 0.4) { star.walk([sp]); yield () => !star.path; }
    if (this.ore.free) { this.enter('loose', true); return; }
    this.lookPoint = new THREE.Vector3(L.ore.x, L.ore.y, L.ore.z);
    star.faceTo(L.ore);
    star.play('point');
    yield this.say('oreSee');
    this.lookPoint = null;
    star.play('idle');
    this.setTip('oreTip');
  }

  *looseScript() {
    this.star.play('cheer');
    yield this.say('oreLoose');
    this.star.play('idle');
    this.setTip('looseTip');
  }

  *heldScript() {
    const st = this.st;
    if (GIFT_CHISEL && !st.equipped('chisel') && ITEMS.chisel_basic) {
      st.addItem('chisel_basic');
      st.equip('chisel_basic');
      this.owner.updateHotbar?.();
      this.ui.toast(`+ <b>${ITEMS.chisel_basic.name}</b> from Old Star`, { icon: iconURL('chisel_basic'), kind: 'good' });
      this.audio.play('pickup', { pitch: 0.9 });
      yield this.say('oreChisel');
    }
    this.setTip('heldTip');
  }

  *gemScript() {
    const star = this.star, L = this.L, sp = L.spots.gem;
    star.walk([sp]);
    yield () => !star.path;
    if (this.geode.open) { this.enter('gemfound', true); return; }
    this.lookPoint = new THREE.Vector3(L.geode.x, L.geode.y, L.geode.wallZ);
    star.faceTo({ x: L.geode.x, z: L.geode.wallZ });
    star.play('point');
    yield this.say('gemSee');
    star.play('idle');
    this.setTip('gemTip');
  }

  *gemFoundScript() {
    this.star.play('cheer');
    this.audio.play('sparkle');
    yield this.say('gemOpen');
    this.star.play('idle');
    this.setTip('gemTake');
  }

  *ledgeScript() {
    const star = this.star, L = this.L, sp = L.spots.ledge;
    star.walk([sp], null);
    yield () => !star.path;
    star.faceTo(L.map);
    star.play('point');
    this.lookPoint = this.dress.mapPoint(new THREE.Vector3());
    yield this.say('ledge');
    this.lookPoint = null;
    star.play('idle');
    this.setTip('ladderTip');
  }

  *critterScript() {
    const star = this.star, L = this.L, pl = this.owner.player;
    // down off the ledge first, and a moment's peace
    yield () => pl.pos.y < L.ledge.y - 0.6 && pl.grounded;
    yield 1.2;
    star.walk([L.spots.critter]);
    yield () => !star.path;
    this.audio.play('click', { vol: 0.6, pitch: 0.7 });
    this.audio.play('debris', { vol: 0.4 });
    this.lookPoint = new THREE.Vector3(L.burrow.x, L.burrow.y, L.burrow.z);
    star.faceTo(L.burrow);
    star.play('point');
    yield this.say('scratch');
    this.nibbler.emerge();
    star.play('idle');
    this.lookPoint = null;
    this.setTip('blockTip');
  }

  *backScript() {
    const star = this.star, L = this.L, LP = (x, z) => ({ x: L.lift.x + x, y: L.lift.y, z: L.lift.z + z });
    this.walking = true;
    star.play('beckon');
    yield this.say('done');
    star.play('idle');
    const C = L.crawl;
    star.walk([{ x: L.mouth.x + 0.35, y: L.o.y, z: L.mouth.z - 0.5 }, ...C.slice(1), LP(1.25, this.entryZ() + 0.05), LP(0.3, this.entryZ() - 0.05), LP(0.1, 1.7), L.door, L.cage], () => { star.face(0); star.play('beckon'); }, 1.0);
    yield () => !star.path;
    this.walking = false;
    this.enter('cage');
  }

  /**
   * Where (z, world meters) to cross between the trail and his crawl: the trail's timber frames can
   * stand right by the hole, so he picks the clearest lane near its middle (once the chunks are in).
   */
  entryZ() {
    if (this.entryZc != null) return this.entryZc;
    const f = this.L.lift, w = this.w;
    let best = f.z + 2.55, bestCost = Infinity;
    for (let z = f.z + 2.2; z <= f.z + 2.951; z += 0.05) {
      let n = 0;
      for (let x = f.x + 0.25; x < f.x + 0.85; x += 1 / VOX) for (let y = f.y + 0.3; y < f.y + 1.0; y += 2 / VOX) for (let dz = -0.24; dz <= 0.24; dz += 1 / VOX) {
        const m = w.voxelAt(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor((z + dz) * VOX));
        if (m && !MAT[m]?.fluid) n++;
      }
      const cost = n * 10 + Math.abs(z - (f.z + 2.55));
      if (cost < bestCost) { bestCost = cost; best = z; }
    }
    if (bestCost < 10) this.entryZc = best; // a clear lane: keep it (else the chunks aren't in yet)
    return best;
  }

  *cageScript() {
    const star = this.star, L = this.L;
    if (!this.inCage()) { star.walk([L.door, L.cage], null, 1.0); yield () => !star.path; }
    star.face(0);
    star.play('beckon');
    yield () => this.near(3.2);
    yield this.say('cage');
    star.play('idle');
    this.setTip('bell');
  }

  // ------------------------------------------------------------------ per-step checks
  stepLogic(dt, pl, eye) {
    this.stepT += dt;
    const step = this.step, star = this.star, L = this.L;
    const far = star.pos.distanceTo(pl.pos);
    // wandered off: he calls you back (not while he's leading the way)
    if (far > 10 && !this.walking && step !== 'ride') { if (this.sayCd('comeBack', 12)) star.play('beckon'); }
    // walking ahead: wait (and call) when you fall behind
    if (this.walking && star.path) {
      if (far > 3.8 && !star.paused) { star.paused = true; star.faceTo(pl.pos); star.play('beckon'); star.rig.play('beckon'); this.sayCd('wait', 8); }
      else if (star.paused && far < 2.6) { star.paused = false; star.play('idle'); }
      else if (!star.paused && Math.random() < dt * 0.06) this.sayCd(step === 'back' ? 'back' : 'walk', 10);
    }
    // the chamber reached
    if (!this.reached && prologueInside(L, pl.pos.x, pl.pos.y + 0.3, pl.pos.z, -0.3) && pl.pos.z < L.o.z + 2.5) { this.reached = true; this.act('reach', { place: 'dig' }); }
    // pick swings: on the ore (a telling-off), on the critter (a bonk)
    const sw = this.owner.swing;
    if (sw && sw.hit && !this.swingSeen) {
      this.swingSeen = true;
      const tg = this.owner.target, f = pl.forward(_w);
      if (this.nibbler.active && this.nibbler.hit(eye, f, 2.3) !== null) this.bonkNibbler(f);
      else if (step === 'ore' && tg && tg.m >= ORE_BASE && Math.hypot((tg.vx + 0.5) / VOX - L.ore.x, (tg.vz + 0.5) / VOX - L.ore.z) < 0.5) this.sayCd('oreHit', 6);
    }
    if (!sw) this.swingSeen = false;
    if (step === 'plug') {
      if (this.plug.open) { this.lesson('mine_rock'); this.enter('walk'); this.walkFromPlug = true; }
    } else if (step === 'ore') {
      if (this.ore.free) this.enter(this.owner.clumps ? 'loose' : 'held');
    } else if (step === 'loose') {
      const cl = this.owner.clumps, c = this.clump;
      if (!cl || !c) this.bagged();
      else if (c.state === 'gone' || c.state === 'stash') { if (this.st.data.stats.ores > this.ores0 || c.state === 'gone') this.bagged(); }
      else if (cl.held === c) this.enter('held');
      this.lookPoint = c && c.state === 'world' ? c.pos : null;
    } else if (step === 'held') {
      const cl = this.owner.clumps, c = this.clump;
      if (this.st.data.stats.ores > this.ores0) this.bagged();
      else if (cl && c && c.state === 'world' && cl.held !== c) { this.say('oreDropped'); this.enter('loose', true); this.setTip('looseTip'); }
      else if (!c && this.stepT > 1) this.bagged();
      else if (cl?.held === c && this.owner.slotName === 'pick' && this.stepT > 6) this.sayCd('heldPick', 30);
    } else if (step === 'gem') {
      if (this.geode.open) this.enter('gemfound');
      else if (!this.co && this.stepT > 18 && !this.looking(L.geode, 0.8)) this.sayCd('gemWhere', 18);
    } else if (step === 'ledge' || step === 'climb' || step === 'map') {
      const n = this.ladderCount();
      if (step === 'ledge' && n >= 6) this.enter('climb');
      if (step === 'ledge' && this.owner.slotName === 'build' && this.owner.buildMode > 0) this.sayCd('ladderMode', 9);
      if (step !== 'map' && this.onLedge(pl)) {
        if (n < 6) this.say('claws');
        this.lesson('mine_ladder');
        this.enter('map');
      }
      if (step === 'ledge' && !this.co && this.stepT > 20) this.sayCd('ladderTip', 20);
      this.lookPoint = step === 'map' ? null : this.dress.mapPoint(_v.clone());
    } else if (step === 'critter') {
      const nb = this.nibbler;
      if (nb.active) this.lookPoint = _v.copy(nb.pos).setY(nb.pos.y + 0.1).clone();
      if (nb.state === 'dizzy' && !this.dizzyAt) { this.dizzyAt = this.time; this.setTip('bonkTip'); this.say('bonkTip'); }
      // a hand from Old Star if it drags on: he shoos it with his pick
      const stuck = nb.active && nb.state !== 'flee' && (nb.hits >= 4 || this.stepT > 70 || (this.dizzyAt && this.time - this.dizzyAt > 9));
      if (stuck && !this.shooing) this.shoo();
      if (!nb.active && nb.state === 'gone' && !this.critterDone) { this.critterDone = true; this.lesson('mine_block'); this.after = null; this.run(this.afterCritter()); }
    } else if (step === 'cage') {
      // a mole already in the cage gets a nudge to ring
    }
  }

  *afterCritter() {
    this.setTip(null);
    yield this.say(this.shooing ? 'fled' : 'fled');
    yield 0.4;
    this.enter('back');
  }

  critterEvent(e) {
    if (e.tell) { this.star.mood('worried', 1.2); this.star.rig.sniff?.(0.6); this.tipShown = null; return; }
    if (e.guarded !== undefined) {
      if (e.guarded === 'parried') this.say('parried');
      else if (e.guarded === 'blocked') { if (this.nibbler.blocks < 2) this.say('blocked'); }
      else this.say('blockLate');
      return;
    }
    if (e.damage || e.blocked || e.parried) this.ev.push(e); // the scene hurts the mole or rings the guard
  }

  bonkNibbler(f) {
    const r = this.nibbler.bonk(f);
    if (r === 'recoil' && this.nibbler.blocks < 2) this.sayCd('bonkEarly', 12);
    if (r) this.owner.vm?.impact?.('pick', 0.5);
  }

  shoo() {
    this.shooing = true;
    const star = this.star, nb = this.nibbler;
    star.faceTo(nb.pos);
    star.walk([{ x: nb.pos.x + (star.pos.x - nb.pos.x) * 0.4, y: nb.pos.y, z: nb.pos.z + (star.pos.z - nb.pos.z) * 0.4 }], () => {
      star.faceTo(nb.pos);
      star.swing();
      this.audio.play('whoosh', { vol: 0.5 });
      setTimeout(() => { this.audio.play('hit', { snd: 'stone', vol: 0.5 }); nb.flee(); }, 300);
    }, 1.6);
    this.say('shoo');
  }

  near(r) { const p = this.owner.player.pos; return this.star.pos.distanceTo(p) < r; }
  inCage() { const s = this.star.pos, c = this.L.cage; return Math.hypot(s.x - c.x, s.z - c.z) < 0.4 && !this.star.path; }
  onLedge(pl) { const G = this.L.ledge; return pl.pos.x > G.x0 - 0.12 && pl.pos.y > G.y - 0.15 && pl.pos.y < G.y + 0.6 && pl.pos.z > G.z0 - 0.1 && pl.pos.z < G.z1 + 0.1 && pl.grounded; }
  /** Is the mole looking roughly at p (cos of the angle > c)? */
  looking(p, c) {
    const pl = this.owner.player, e = pl.eye(_v), f = pl.forward(_w);
    const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, l = Math.hypot(dx, dy, dz) || 1;
    return (dx * f.x + dy * f.y + dz * f.z) / l > c;
  }

  bagged() {
    if (after(this.step, 'held')) return;
    this.lesson('mine_clean');
    this.say('oreBagged');
    this.star.rig.doEmote('nod', 1);
    this.enter('gem');
  }

  // ------------------------------------------------------------------ the world: plug, ore, geode, ladder
  loaded(vx, vy, vz) {
    const ch = this.w.chunk?.(vx >> CB, vy >> CB, vz >> CB);
    return !!ch && !ch.pending && (!!ch.vox || ch.virtual);
  }
  solid(vx, vy, vz) { const m = this.w.voxelAt(vx, vy, vz); return m !== 0 && !(MAT[m]?.fluid); }

  /** The middle of the plug's face, on the trail side (meters). */
  plugFace() { const P = this.L.plug; return { x: P.x0, y: P.y0 + 0.5, z: this.L.nook.z }; }

  /** Is the plug already dug through (a lesson resumed, or dug from the far side)? */
  plugOpen() {
    if (this.plug.open) return true;
    const P = this.plugVoxels();
    if (!P.length || !this.loaded(P[0][0], P[0][1], P[0][2])) return false;
    let n = 0;
    for (const [x, y, z] of P) if (this.solid(x, y, z)) n++;
    if (n < P.length * 0.35) this.plug.open = true;
    return this.plug.open;
  }

  /** Watch the voxels the lessons hang on (ten times a second). */
  watch(dt) {
    this.watchT = (this.watchT || 0) - dt;
    if (this.watchT > 0) return;
    this.watchT = 0.1;
    // the plug: a few good blows and the old loam gives way
    if (this.step === 'plug' && !this.plug.open) {
      const P = this.plugVoxels();
      if (P.length && this.loaded(P[0][0], P[0][1], P[0][2])) {
        let n = 0;
        for (const [x, y, z] of P) if (this.solid(x, y, z)) n++;
        if (this.plug.n0 < 0) { this.plug.n0 = n; this.plug.last = n; if (n < P.length * 0.35) { this.plug.open = true; return; } }
        if (n < this.plug.last) { this.plug.hits++; this.plug.last = n; if (this.plug.hits < 3) this.sayCd('plugMore', 3); }
        if (this.plug.hits >= 3 || (this.plug.hits >= 2 && n < this.plug.n0 * 0.6)) this.breakPlug();
      }
    }
    // the copper: dig round it and it breaks out
    if (this.step === 'ore' && !this.ore.free && this.oreVox.length) {
      const [x0, y0, z0] = this.oreVox[0];
      if (this.loaded(x0, y0, z0)) {
        const e = this.oreExposure();
        if (this.ore.n0 < 0 && e.n === 0) {
          // freed in an earlier session: the clump is lying about (or already bagged)
          this.ore.free = true;
          this.clump = this.owner.clumps?.list?.find((c) => c.dep === 'oldstar_copper' && c.state === 'world') || null;
          return;
        }
        if (this.ore.n0 < 0) { this.ore.n0 = e.frac; this.ore.nearLast = e.near; }
        if (e.near < this.ore.nearLast) { this.ore.hits++; this.ore.nearLast = e.near; if (this.ore.hits === 2) this.sayCd('oreClose', 20); }
        if (e.frac > Math.max(0.55, this.ore.n0 + 0.22) || this.ore.hits >= 4) this.freeOre();
      }
    }
    // the geode: dig in far enough and it's open
    if (this.step === 'gem' && !this.geode.open && this.geodeVox.length) {
      const [x0, y0, z0] = this.geodeVox[0];
      if (this.loaded(x0, y0, z0)) {
        let n = 0;
        for (const [x, y, z] of this.geodeVox) if (this.w.voxelAt(x, y, z) === M.GEODE) n++;
        if (this.geode.n0 < 0) { this.geode.n0 = n; this.geode.last = n; }
        if (n < this.geode.last) { if (this.geode.last === this.geode.n0) this.sayCd('gemDig', 30); this.geode.last = n; }
        if (n < this.geode.n0 * 0.93 || n < this.geodeVox.length * 0.7) this.openGeode();
        // (also open when the loam in front is gone and the crystals show)
        else if (this.time % 1 < 0.1 && this.gemVisible()) this.openGeode();
      }
    }
  }

  /** Is the amethyst in plain view from the eye (nothing solid in between)? */
  gemVisible() {
    const pl = this.owner.player, e = pl.eye(_v), p = this.dress.gemPoint(_w);
    const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, d = Math.hypot(dx, dy, dz);
    if (d > 3) return false;
    const h = this.w.raycast(e.x, e.y, e.z, dx / d, dy / d, dz / d, d - 0.06);
    return !h;
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
    for (let vz = Math.floor((o.z - r) * VOX); vz <= Math.floor((o.z + r) * VOX); vz++) for (let vy = Math.floor((o.y - r) * VOX); vy <= Math.floor((o.y + r) * VOX); vy++) for (let vx = Math.floor((o.x - r) * VOX); vx <= Math.floor((o.x + r) * VOX); vx++) {
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

  /** The geode winks through its hand's width of loam: a sparkle on the wall in front of it. */
  geodeGlint() {
    if (Math.random() < 0.45) return;
    const G = this.L.geode, w = this.w;
    const x = G.x + rand(-0.18, 0.18), y = G.y + rand(-0.16, 0.16);
    // from the room toward the wall until rock: that's where it shows
    for (let z = G.wallZ - 0.6; z < G.z; z += 1 / VOX) {
      const m = w.voxelAt(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX));
      if (!m || MAT[m]?.fluid) continue;
      this.fx?.glints(x, y, z - 0.04, [0.8, 0.6, 1]);
      break;
    }
  }

  /** The copper comes out of the wall wrapped in its rock: a clump (or a pickup without Clumps). */
  freeOre() {
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
    this.lesson('mine_ore');
  }

  openGeode() {
    if (this.geode.open) return;
    this.geode.open = true;
    this.fx?.sparks?.(this.L.gem.x, this.L.gem.y + 0.05, this.L.gem.z - 0.2, 14, [0.8, 0.55, 1], [0, 0.3, -1], 2);
  }

  takeGem() {
    if (!this.dress.gem) return null;
    this.dress.takeGem();
    this.lesson('mine_gem');
    if (!after(this.step, 'gemfound')) this.run(this.gemGotScript());
    return [{ loot: { id: ITEMS[this.L.geode.item] ? this.L.geode.item : 'quartz', q: 92, p: true } }];
  }
  *gemGotScript() {
    this.setTip(null);
    yield this.say('gemGot');
    this.enter('ledge');
  }

  plugVoxels() {
    if (this.plug.vox) return this.plug.vox;
    const P = this.L.plug, out = [];
    for (let vz = Math.floor(P.z0 * VOX); vz < Math.ceil(P.z1 * VOX); vz++) for (let vy = Math.floor(P.y0 * VOX); vy < Math.ceil(P.y1 * VOX); vy++) for (let vx = Math.floor(P.x0 * VOX); vx < Math.ceil(P.x1 * VOX); vx++) {
      const x = (vx + 0.5) / VOX, y = (vy + 0.5) / VOX, z = (vz + 0.5) / VOX;
      if (x > P.x0 && x < P.x1 && y > P.y0 && y < P.y1 && z > P.z0 && z < P.z1 && prologueCarved(this.L, x, y, z)) out.push([vx, vy, vz]);
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
    this.debris(broken, [-1, 0.4, 0]);
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
   * Whatever the generator grew in the dug-out space of his dig (it skips most of it now) is
   * cleared once per loaded chunk (never what the mole built: ladders, planks, bricks).
   */
  scrub() {
    if (!this.toScrub) {
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
        if (!DECOR.has(m)) continue; // only the cave dressing; dug rock stays dug, rock stays rock
        const want = prologueWants(L, (vx + 0.5) / VOX, (vy + 0.5) / VOX, (vz + 0.5) / VOX);
        if (want === 0) clear.push(vx, vy, vz, 0);
        else if (want > 0 && want !== m && want !== M.LOAM) clear.push(vx, vy, vz, want);
      }
    }
    for (let i = 0; i < clear.length; i += 4) w.setVoxel(clear[i], clear[i + 1], clear[i + 2], clear[i + 3]);
  }

  // ------------------------------------------------------------------ the crosshair: him, the map, the gem, the cage
  pickAt(eye, dir, reach) {
    const step = this.step;
    const ray = (p, r, far) => {
      const ox = p.x - eye.x, oy = p.y - eye.y, oz = p.z - eye.z;
      const along = ox * dir.x + oy * dir.y + oz * dir.z;
      return along > 0 && along < far && ox * ox + oy * oy + oz * oz - along * along < r * r;
    };
    if (this.dress.map && (step === 'ledge' || step === 'climb' || step === 'map') && ray(this.dress.mapPoint(_v), 0.24, reach + 0.2)) return 'map';
    if (this.dress.gem && this.geode.open && ray(this.dress.gemPoint(_v), 0.16, 2.4)) return 'gem';
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
    // the cage, with him in it
    if (step === 'cage' && this.inCage() && this.owner.liftNear?.()) return 'cage';
    return null;
  }

  takeMap() {
    if (!this.dress.map) return;
    this.dress.takeMap();
    this.audio.play('pickup_gem', { pitch: 0.9 });
    this.audio.play('discover');
    this.ui.toast('<b>Old Star\'s map</b> · every lift and every place you find, in your book', { kind: 'good', dur: 4200 });
    this.showRadar();
    this.lesson('mine_ladder');
    this.lesson('mine_map');
    this.setTip(null);
    this.run(this.mapScript());
  }
  *mapScript() {
    yield this.say('mapGot');
    if (typeof this.ui.openBook === 'function') { yield 0.3; try { this.ui.openBook('map'); } catch (e) { /* the book isn't ready */ } }
    this.enter('critter');
  }

  // ------------------------------------------------------------------ talking to him, skipping, the ride
  openTalk() {
    if (this.panel) return;
    this.act('talk', { npc: 'oldstar' });
    const touch = this.owner.isTouch?.();
    const what = GOALS[this.step] || 'Follow Old Star';
    const hint = {
      arrive: LINES.plug, plug: LINES.plugTip, walk: LINES.follow, ore: LINES.oreTip, loose: LINES.looseTip, held: LINES.heldTip, gem: LINES.gemTip,
      gemfound: LINES.gemTake, ledge: LINES.ladderTip, climb: LINES.ladderUp, map: LINES.mapTip, critter: LINES.blockTip, back: LINES.done, cage: LINES.bell,
    }[this.step];
    this.say(hint || LINES.walk, { mood: 'calm' });
    const body = el('div', { class: 'cf-body' }, [
      el('p', { class: 'cf-text', html: `<b>${what}.</b><br>${pickLine(hint, touch) || ''}` }),
      el('div', { class: 'cf-row', style: { flexWrap: 'wrap', gap: 'calc(var(--px) * 4)' } }, [
        el('button', { class: 'btn', onclick: () => this.panel?.close() }, 'Right you are'),
        el('button', { class: 'btn alt', onclick: () => this.confirmSkip(false) }, 'Skip this lesson'),
        el('button', { class: 'btn alt', onclick: () => this.confirmSkip(true) }, 'Skip all lessons'),
      ]),
    ]);
    this.panel = this.ui.openPanel({ title: NAME, sub: 'Forty years down here, and he still digs for fun.', body, width: 'min(calc(var(--px) * 160), calc(100vw - 32px))', onClose: () => { this.panel = null; } });
  }

  async confirmSkip(all) {
    this.panel?.close();
    const ok = await this.ui.confirm(all ? '<b>Skip all of Old Star\'s lessons?</b><br>Mining, forging and cooking: you\'ll find your own way.' : '<b>Skip the mining lesson?</b><br>You\'ll ride straight back up with him.', 'Skip', 'Keep learning');
    if (ok) this.skip(all);
  }

  skip(all = false) {
    if (this.leaving) return;
    const st = this.st;
    if (!st.count?.('copper_ore') && ITEMS.copper_ore) {
      // a full backpack spills it into the trunk at home (where it's going anyway)
      const fits = st.canAdd ? st.canAdd('copper_ore') : true;
      st.addItem('copper_ore', { q: 80, spill: true });
      this.ui.toast(`+ <b>${ITEMS.copper_ore.name}</b> 80% from Old Star${fits ? '' : ' (in your trunk at home)'}`, { icon: iconURL('copper_ore'), kind: 'good' });
      this.say('skipCopper', { dur: 3 });
    } else this.say('skip', { dur: 3 });
    if (all) this.lesson('skip');
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
      const params = { from: 'lift', lesson: 'mine' };
      const opts = { transition: 'fade', dur: 0.8, color: 0x0a0605 };
      if (typeof this.owner.leave === 'function') this.owner.leave('home', params, opts);
      else g.goto('home', params, opts);
    }, skipped ? 1500 : 1100);
  }

  /** The lesson is done: the flag, the quests, his gifts. */
  finish() {
    const st = this.st;
    st.flag('prologue', true);
    this.save.step = 'done';
    st.learn?.('elevator');
    this.lesson('mine_done');
    if (GIFT_CHISEL && !st.owns?.('chisel_basic') && !st.equipped('chisel') && ITEMS.chisel_basic) { st.addItem('chisel_basic'); st.equip('chisel_basic'); }
    // a copper lump left in the wall was never a real deposit: it becomes loam
    if (!this.ore.free) for (const [x, y, z] of this.oreVox) if (this.w.voxelAt(x, y, z) === this.L.ore.m && this.loaded(x, y, z)) this.w.setVoxel(x, y, z, M.LOAM);
    this.tutor?.hide?.('os-tip');
    this.tipKey = null;
  }

  // ------------------------------------------------------------------ touch: a guard button while the critter is about
  /** The lesson's critter while it is after the mole (same shape as enemies.threat()), or null. */
  threat() {
    const nb = this.nibbler, p = this.owner?.player;
    if (!nb || !nb.active || nb.state === 'flee' || nb.state === 'dizzy' || !p) return null;
    return { kind: 'nibbler', dist: nb.pos.distanceTo(p.pos) };
  }

  guardButton(on) {
    // the touch controls have their own block button now (.d-block, "Block (hold)"): it glows while
    // the nibbler is out; this one only stands in when there is none
    const theirs = document.querySelector('.d-block, [aria-label^="Block"]:not(.os-guard)');
    if (on) theirs?.classList.add('lit');
    const want = on && this.owner.isTouch?.() && !theirs;
    if (!want) {
      if (this.guardEl) { this.guardEl.remove(); this.guardEl = null; this.owner.game.input.down.delete('KeyF'); }
      return;
    }
    if (this.guardEl) return;
    const inp = this.owner.game.input;
    const b = el('button', { class: 'os-guard interactive', 'aria-label': 'Block', title: 'Hold to block' }, [el('span', {}, '⛨'), el('small', {}, 'hold')]);
    const down = (e) => { e.preventDefault(); e.stopPropagation(); inp.down.add('KeyF'); b.classList.add('on'); };
    const up = (e) => { e?.stopPropagation?.(); inp.down.delete('KeyF'); b.classList.remove('on'); };
    b.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, up);
    (this.ui.root || document.body).append(b);
    this.guardEl = b;
  }

  // ------------------------------------------------------------------ test hooks
  setupDebug() {
    const D = this.debug;
    const pl = () => this.owner.player;
    D.steps = STEPS;
    D.step = () => this.step;
    D.emitted = () => this.emitted.slice();
    D.layout = () => this.L;
    D.star = () => ({ x: this.star.pos.x, y: this.star.pos.y, z: this.star.pos.z, state: this.star.state, path: !!this.star.path });
    /** Jump to a step: everything before it is done (the plug broken, the ore freed, the geode open...). */
    D.go = (step) => {
      const i = STEPS.indexOf(step);
      if (i < 0) return false;
      this.co = null;
      this.hold = null;
      this.walking = false;
      this.after = null;
      if (i > STEPS.indexOf('plug')) this.breakPlug();
      if (i > STEPS.indexOf('ore') && !this.ore.free) this.freeOre();
      if (i > STEPS.indexOf('gem')) this.openGeode();
      if (i > STEPS.indexOf('gemfound')) this.dress.takeGem();
      if (i > STEPS.indexOf('map')) { this.dress.takeMap(); this.showRadar(); }
      const spot = { arrive: 'arrive', plug: 'plug', walk: 'plug', ore: 'ore', loose: 'ore', held: 'ore', gem: 'gem', gemfound: 'gem', ledge: 'ledge', climb: 'ledge', map: 'ledge', critter: 'ledge', back: 'critter' }[step];
      const s = spot ? this.L.spots[spot] : { ...this.L.cage, yaw: 0 };
      this.star.stop();
      this.star.pos.set(s.x, s.y, s.z);
      this.star.face(s.yaw ?? 0, true);
      this.star.play('idle');
      this.enter(step, true);
      return step;
    };
    D.breakPlug = () => this.breakPlug();
    D.freeOre = () => this.freeOre();
    D.clump = () => this.clump;
    D.grab = () => this.owner.clumps?.debug?.grab(this.clump);
    D.clean = () => this.owner.clumps?.debug?.clean();
    D.bag = () => { const cl = this.owner.clumps; if (cl?.held) cl.use(pl().eye(), pl().forward(), 2); };
    D.openGeode = () => this.openGeode();
    D.takeGem = () => { const e = this.takeGem(); if (e) this.owner.events?.(e); return !!e; };
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
    D.critter = () => this.nibbler;
    /** Hold the guard (as F would) or let go. */
    D.guard = (on = true) => { const d = this.owner.game.input.down; if (on) d.add('KeyF'); else d.delete('KeyF'); };
    D.bonk = () => this.bonkNibbler(pl().forward(new THREE.Vector3()));
    D.ride = () => this.ride();
    D.skip = (all = false) => this.skip(all);
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

// Base class for cooking minigame steps.
//
// Lifecycle (driven by CookingScene):
//   begin()            set up props / food at the station (called while the camera pans in)
//   update(dt, live)   every frame; `live` is false during the intro title and the feedback,
//                      so animations run but input is ignored
//   finish(score)      a step calls this once; the scene then shows feedback
//   end()              cleanup: temp objects removed, borrowed props put back
import * as THREE from 'three';
import { clamp } from '../../core/util.js';
import { disposeObject } from '../../core/Scene.js';
import { sparkle, puff } from '../fx.js';

/** The tone of an old feedback colour: gold → great, green → good, cool/neutral → meh, warm red → bad. */
function toneOf(color = '#fff') {
  const n = parseInt(String(color).replace('#', ''), 16);
  if (!Number.isFinite(n)) return 'meh';
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (r > 200 && g > 180 && b < 140) return 'great';
  if (g > r + 20 && g > b) return 'good';
  if (r > g + 40 && r > b + 40) return 'bad';
  return 'meh';
}

export class Step {
  constructor(cook, opts = {}) {
    this.cook = cook;
    this.opts = opts;
    this.k = cook.kitchen;
    this.P = cook.kitchen.props;
    this.L = cook.paws.L;
    this.R = cook.paws.R;
    this.fx = cook.fx;
    this.ui = cook.ui;
    this.audio = cook.game.audio;
    this.input = cook.game.input;
    this.t = 0; // time since begin
    this.live = 0; // time spent live
    this.done = false;
    this.score = 0;
    this.objs = [];
    this.borrowed = [];
    this.limit = 0; // seconds of live time before auto-finish (0 = none)
    // the skill tree's `cook` multiplier widens every good window (state.skill('cook') ≥ 1)
    this.skill = Math.max(1, cook.game.state.skill?.('cook') || 1);
  }

  /** A good window [lo, hi] widened round its centre by the cook skill (clamped to [min, max]). */
  win(lo, hi, min = 0, max = Infinity) {
    const c = (lo + hi) / 2, h = ((hi - lo) / 2) * this.skill;
    return [Math.max(min, c - h), Math.min(max, c + h)];
  }

  /** Station name for the camera (board | bowl | cup | plate | pot | pan). */
  get station() { return 'board'; }
  get title() { return 'COOK!'; }
  get hint() { return ''; }
  /** Playing by touch? (hints say tap / drag instead of click / keys) */
  get touch() { return this.cook.lastPointer === 'touch' || document.documentElement.classList.contains('is-touch'); }

  begin() {}

  /** Called by the scene. Subclasses override tick(dt, live). */
  update(dt, live) {
    this.t += dt;
    if (live && !this.done) {
      this.live += dt;
      if (this.limit && this.live >= this.limit) this.timeout();
    }
    this.tick(dt, live && !this.done);
  }

  tick() {}

  timeout() { this.finish(0); }

  timeLeft() { return this.limit ? clamp(1 - this.live / this.limit, 0, 1) : null; }

  finish(score) {
    if (this.done) return;
    this.done = true;
    this.score = clamp(Math.round(Number.isFinite(score) ? score : 0), 0, 100);
  }

  end() {
    for (const o of this.objs) {
      o.parent?.remove(o);
      disposeObject(o);
    }
    this.objs = [];
    for (const name of this.borrowed) this.k.restore(name);
    this.borrowed = [];
  }

  /** Add a temporary object (removed on end). */
  temp(obj, parent = this.cook.scene) {
    parent.add(obj);
    this.objs.push(obj);
    return obj;
  }

  /** Borrow a kitchen prop; it goes back to its rest spot on end. */
  borrow(name) {
    if (!this.borrowed.includes(name)) this.borrowed.push(name);
    const o = this.P[name];
    this.cook.scene.attach(o);
    return o;
  }

  /** Station point. */
  get S() { return this.cook.spot(this.station); }

  /** World point under the mouse on the horizontal plane y = h. */
  mouseAt(h, out) { return this.cook.mouseOnPlane(h, out); }

  screen(v) { return this.cook.toScreen(v); }

  /**
   * How a moment went, said by the kitchen instead of a floating word: a glint of sparks for a
   * fine one, a soft wisp for a so-so one, a puff and a jolt for a bad one. `text` is only a note
   * for whoever reads the step (it is never drawn); `color` (the old word's colour) picks the tone.
   */
  float(text, at, color) {
    const tone = toneOf(color);
    const p = at.clone();
    p.y -= 0.1; // the old words floated above the food: the reaction belongs on it
    if (tone === 'great') sparkle(this.fx, p, 10);
    else if (tone === 'good') sparkle(this.fx, p, 5, [0xfffaf0, 0xffe8b0]);
    else if (tone === 'meh') puff(this.fx, p, 0xece6dc, 4, 0.08);
    else { puff(this.fx, p, 0x8a8078, 6, 0.1); this.cook.shake(0.003); }
  }

  /** Paw resting on the counter near the station (side −1 left, 1 right). */
  rest(paw, dx = 0, dz = 0) {
    const S = this.S;
    paw.goal.set(S.x + paw.side * 0.5 + dx, 0.22 + Math.sin(this.t * 2 + paw.side) * 0.01, S.z + 0.42 + dz);
    paw.setPose({ pitch: 0.5, roll: 0.3, yaw: 0.45 });
  }

  pressed() {
    const i = this.input;
    return i.mousePressed(0) || i.pressed('Space', 'Enter');
  }
}

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export { THREE };

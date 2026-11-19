// Eating from the belt, in first person (the mine: DigScene.eatBest; the burrow and Deep Town:
// ui/handTools.js). The paws lift the dish or snack to the mouth with a bounce and take three
// bites (fps/ViewModel.js eat: crumbs, steam, bite marks), while the view does a happy little bob
// and a warm glow breathes in with each bite. Only when it's all eaten (about 1.2 s) does the meal
// count: game.eat(id) (vitals, buffs). A blow, another tool or a panel cancels it: nothing eaten.
//
//   const seq = startEating(game, vm, id, { onDone })   → null if the paws are busy
//   seq.update(dt) → { bob, roll, glow }  (call every frame; apply bob/roll to the camera)
//   seq.cancel()   seq.done   seq.cancelled
import { ITEMS } from '../data/items.js';
import './eat.css';

const DUR = 1.2;
const BITES = [0.3, 0.54, 0.78]; // when each bite lands (matches the view model's rhythm)

export class EatSequence {
  constructor(game, vm, id, o = {}) {
    this.g = game; this.vm = vm; this.id = id; this.o = o;
    this.t = 0; this.done = false; this.cancelled = false; this.bit = 0;
    this.glow = 0; this.bob = 0;
    this.after = 0;
  }

  cancel() {
    if (this.done || this.cancelled) return false;
    this.cancelled = true;
    this.vm?.cancelEat?.();
    this.g.audio.play('ui_close', { vol: 0.35 });
    return true;
  }

  update(dt) {
    const out = { bob: 0, roll: 0, glow: 0 };
    if (this.cancelled) { this.glow = Math.max(0, this.glow - dt * 4); out.glow = this.glow; this.after += dt; return out; }
    this.t += dt;
    const t = this.t;
    // the bites: a crunch (or a slurp for a bowl), the glow swells a little more each time
    while (this.bit < BITES.length && t >= BITES[this.bit]) {
      this.bit++;
      const it = ITEMS[this.id];
      const soup = /soup|stew|tea|curry|mash|risotto|noodle/.test(this.id) || it?.icon?.t === 'cup';
      this.g.audio.play(soup ? 'slurp' : 'eat', { vol: 0.55, pitch: 0.95 + this.bit * 0.06 });
      this.glowTo = 0.35 + this.bit * 0.22;
    }
    const want = t < DUR ? (this.glowTo || 0.15) : 0;
    this.glow += (want - this.glow) * Math.min(1, dt * (want > this.glow ? 10 : 3));
    // a happy bob: a little dip and spring on each bite, a cheerful hop at the end
    let bob = 0, roll = 0;
    for (const b of BITES) { const u = (t - b) / 0.22; if (u > 0 && u < 1) bob += -Math.sin(u * Math.PI) * 0.012 + (u > 0.5 ? Math.sin((u - 0.5) * 2 * Math.PI) * 0.006 : 0); }
    if (t > DUR - 0.15 && t < DUR + 0.3) { const u = (t - DUR + 0.15) / 0.45; bob += Math.sin(u * Math.PI) * 0.02; roll = Math.sin(u * Math.PI * 2) * 0.025; }
    out.bob = bob; out.roll = roll; out.glow = this.glow;
    if (!this.done && t >= DUR) {
      this.done = true;
      this.g.audio.play('gulp', { vol: 0.5 });
      this.o.onDone?.(this.id);
    }
    if (this.done) this.after += dt;
    return out;
  }

  /** Finished (or cancelled) and every effect has settled. */
  get over() { return (this.done || this.cancelled) && this.after > 0.5; }
}

/** Start eating `id` with the view model `vm`; null when the paws are already busy eating. */
export function startEating(game, vm, id, o = {}) {
  if (vm && vm.eat && vm.eat(id) === false) return null;
  return new EatSequence(game, vm, id, o);
}

/**
 * The warm glow over the whole view (a dithered amber wash from the screen's edges in): a DOM layer
 * of pixel-stepped rings, so every scene gets it whatever its post pass. glowLayer(k) sets it 0..1.
 */
let layer = null;
export function glowLayer(k) {
  if (!layer) {
    if (k <= 0.01) return;
    layer = document.createElement('div');
    layer.className = 'eat-glow';
    document.body.append(layer);
  }
  layer.style.opacity = String(Math.max(0, Math.min(1, k)));
  layer.hidden = k <= 0.01;
}

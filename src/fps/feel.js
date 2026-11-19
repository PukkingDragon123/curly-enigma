// First-person camera feel shared by every walkable scene (FPSRig: burrow, town, forge; DigScene: the
// mine): head bob tied to the footsteps, the sprint FOV kick, and the footstep beat itself.
//
//   const feel = new CamFeel();
//   const f = feel.update(dt, player, { run, bob: gfx.headBob, kick: gfx.fovKick });
//   camera.position.add(f.offset (camera-local x/y, metres))... (or use f.x, f.y, f.roll)
//   camera.fov = baseFov + f.fov;   if (f.step) play a footstep
//
// The bob follows the body's stride phase (Player.rBobT, drawn between physics steps): one dip per
// footfall, the head lowest as the foot plants (that's when f.step fires), a slow side-to-side
// sway over two steps and the faintest roll. Subtle on purpose, off with the Head bob setting
// (the footsteps still sound). The FOV kick eases in as a sprint gets going and out when it stops:
// a critically damped spring, so it never pops.
import { clamp } from '../core/util.js';

const BOB_Y = 0.011; // metres down at a footfall (walking; a sprint a little more)
const BOB_X = 0.0055; // side sway (metres)
const BOB_ROLL = 0.0035; // radians
const KICK_FOV = 6; // degrees wider at a full sprint
const KICK_W = 9; // the kick spring's rate (rad/s)

export class CamFeel {
  constructor() {
    this.amp = 0;
    this.kick = 0;
    this.kickV = 0;
    this.beat = null;
    this.out = { x: 0, y: 0, roll: 0, fov: 0, step: false };
  }

  /**
   * One frame. pl: the FPSPlayer; o: { run (sprint held), bob (true), kick (true), sprintSpeed (3.2):
   * the speed that counts as a sprint }. Returns { x, y, roll, fov, step }.
   */
  update(dt, pl, o = {}) {
    const out = this.out;
    const speed = pl.speed || 0;
    const onFeet = pl.grounded && !pl.inWater && !pl.climbing && !pl.crawl;
    // bob amplitude follows the speed (smoothly, frame-rate independent)
    const want = onFeet ? clamp(speed / 2.7, 0, 1.35) : 0;
    this.amp += (want - this.amp) * (1 - Math.exp(-dt * 9));
    const ph = pl.rBobT ?? pl.bobT ?? 0; // advances with distance walked: π per footfall
    const a = o.bob === false ? 0 : this.amp;
    const fall = 0.5 + 0.5 * Math.cos(2 * ph); // 1 at a footfall, 0 mid-stride
    out.y = -BOB_Y * a * fall * (0.8 + 0.2 * a);
    out.x = BOB_X * a * Math.sin(ph);
    out.roll = BOB_ROLL * a * Math.sin(ph);
    // the footfall beat (sounds): each time the phase passes a multiple of π while walking
    const beat = Math.floor(ph / Math.PI);
    out.step = this.beat !== null && beat !== this.beat && onFeet && speed > 0.6;
    this.beat = beat;
    // sprint FOV kick
    const sprint = o.kick !== false && o.run && onFeet && speed > (o.sprintSpeed ?? 3.2) ? 1 : 0;
    const goal = sprint * KICK_FOV;
    const h = Math.min(dt, 1 / 30);
    this.kickV += (KICK_W * KICK_W * (goal - this.kick) - 2 * KICK_W * this.kickV) * h;
    this.kick += this.kickV * h;
    out.fov = this.kick;
    return out;
  }
}

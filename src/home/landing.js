// The landing, in first person, picking up where the fall cutscene cuts away: the view drops
// through the snapped roof boards with splinters and dirt raining alongside, slams into the heap on
// the floor (thud, shake, a burst of dust), tumbles and comes to rest lying on its side while little
// stars wobble round the top of the view. Nugget plops down beside the mole with a startled bawk,
// then the mole gets up, still swaying, and has a think about the way out.
import { HOLE } from '../iso/homeLayout.js';
import { rand } from '../core/util.js';
import { T, CEIL } from './units.js';
import { dizzyStars } from './fx.js';

const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);

export class Landing {
  constructor(s) {
    this.s = s;
    this.done = false;
  }

  async run() {
    const s = this.s, g = s.game, a = g.audio, fx = s.fx;
    const hx = HOLE.x * T, hz = HOLE.z * T;
    const nug = s.nug?.actor;
    s.beginScript(false);
    g.ui.setTouchControls(false);
    const c = s.cam;
    // where Nugget will come down: beside the mole, in view of the eyes lying on the floor
    const nx = HOLE.x + 1.9, nz = HOLE.z + 0.75;
    const lookYaw = Math.atan2(-(nx * T - hx), -(nz * T - hz));
    c.x = hx; c.z = hz; c.y = CEIL + 1.5;
    c.yaw = lookYaw + 2.2; c.pitch = -1.25; c.roll = 0.4;
    if (nug) { nug.scripted = true; nug.collide = false; nug.obj.visible = false; nug.pos.set(nx, 0, nz); }
    s.post.flash = 0.85;
    const shaftK = s.shaft.uniforms.uOpacity.value;
    s.shaft.uniforms.uOpacity.value = 0;
    s.post.flashColor = 0xfff2dc;
    s.post.vignette = 0.75;
    a.play('whoosh', { vol: 0.7 });
    // splinters and dirt falling with us
    for (let i = 0; i < 40; i++) {
      const wood = i % 3 === 0;
      fx.spawn({ x: hx + rand(-0.45, 0.45), y: CEIL + rand(-0.1, 1.2), z: hz + rand(-0.45, 0.45), vx: rand(-0.6, 0.6), vy: rand(-3.5, -1), vz: rand(-0.6, 0.6), life: 1.4, size: wood ? 0.028 : 0.016, color: wood ? [0.48, 0.34, 0.2] : [0.36, 0.25, 0.17], alpha: 1, grav: 9, bounce: 0.3, fade: false });
    }
    // ---- the drop
    const y0 = c.y, yaw0 = c.yaw;
    await s.tween(0.5, (k) => {
      s.post.flash = 0.85 * (1 - k) * (1 - k);
      c.y = lerp(y0, 0.24, k * k);
      c.roll = 0.4 + k * 3.6;
      c.pitch = lerp(-1.25, -0.5, k);
      c.yaw = yaw0 - k * 1.2;
    });
    // ---- impact
    s.post.flash = 0;
    s.tween(1.5, (k) => { s.shaft.uniforms.uOpacity.value = shaftK * k; });
    a.play('thud', { vol: 1 });
    a.play('collapse', { vol: 0.55 });
    a.play('land', { hard: true });
    s.rig.shake(1.2);
    this.burst(hx, hz);
    s.knockOver?.();
    // bounce and tumble, settling on one side
    const r1 = c.roll, p1 = c.pitch, yw1 = c.yaw;
    const rollEnd = Math.PI * 2 + 1.38;
    await s.tween(0.5, (k) => {
      c.y = 0.2 + Math.sin(k * Math.PI) * 0.26;
      c.roll = lerp(r1, rollEnd, ease(k));
      c.pitch = lerp(p1, 0.08, ease(k));
      c.yaw = lerp(yw1, lookYaw, ease(k));
    });
    a.play('land', { vol: 0.7 });
    fx.dust(hx, 0.05, hz, 14, [0.5, 0.4, 0.3], 0.3);
    s.rig.shake(0.5);
    c.y = 0.17;
    const stars = dizzyStars(g.ui, 4.2);
    const tick = (dt) => { stars.update(dt); if (stars.done) s.tickers.splice(s.tickers.indexOf(tick), 1); };
    s.tickers.push(tick);
    // lying there, breathing, the room swimming a little
    let t = 0;
    const sway = (dt) => { t += dt; c.roll = rollEnd + Math.sin(t * 2.1) * 0.03; c.y = 0.17 + Math.sin(t * 1.7) * 0.006; s.post.vignette = lerp(0.75, 0.5, Math.min(1, t / 2)); };
    s.tickers.push(sway);
    await s.sleepFor(0.7);
    // ---- Nugget comes down the hole and plops beside us
    if (nug) {
      nug.obj.visible = true;
      a.play('bawk', { pitch: 1.2 });
      const ny0 = (CEIL + 0.4) / T;
      await s.tween(0.5, (k) => { nug.pos.y = lerp(ny0, 0, k * k); if (Math.random() < 0.2) nug.rig.flap?.(0.3); });
      nug.pos.y = 0;
      a.play('thud', { vol: 0.35 });
      a.play('cluck', { n: 3, pitch: 1.2, gap: 0 });
      for (let i = 0; i < 12; i++) fx.spawn({ x: nx * T + rand(-0.05, 0.05), y: 0.2, z: nz * T + rand(-0.05, 0.05), vx: rand(-0.5, 0.5), vy: rand(0.3, 0.9), vz: rand(-0.5, 0.5), life: 1.6, size: rand(0.018, 0.03), color: [1, 0.97, 0.92], alpha: 1, drag: 2.2, grav: 0.8 });
      fx.dust(nx * T, 0.04, nz * T, 6, [0.5, 0.4, 0.3], 0.1);
      s.nugEmote('!', 1.2);
      nug.rig.play?.('idle');
      nug.faceToward(HOLE.x, HOLE.z, true);
      await s.sleepFor(0.9);
      nug.rig.peck?.();
      await s.sleepFor(0.4);
    } else await s.sleepFor(1);
    // ---- up again, dizzy
    s.tickers.splice(s.tickers.indexOf(sway), 1);
    a.play('shake');
    const r2 = c.roll - Math.PI * 2, y2 = c.y, p2 = c.pitch, eye = s.rig.player.eyeY;
    await s.tween(0.9, (k) => {
      const e = ease(k);
      c.roll = lerp(r2, 0, e) + Math.sin(k * 9) * 0.05 * (1 - k);
      c.y = lerp(y2, eye, e) - Math.sin(k * Math.PI) * 0.04;
      c.pitch = lerp(p2, -0.12, e);
    });
    // a last wobble on the feet
    const yw2 = c.yaw;
    await s.tween(1.0, (k) => { c.roll = Math.sin(k * 10) * 0.06 * (1 - k); c.yaw = yw2 + Math.sin(k * 6) * 0.08 * (1 - k); });
    c.roll = 0;
    s.post.vignette = 0.44;
    if (nug) { nug.scripted = false; nug.collide = true; s.nug.map.resolve(nug.pos, 0.17); }
    s.endScript();
    g.ui.setTouchControls(true);
    this.done = true;
    s.later(0.3, () => s.think('Oof… still in one piece.', 2.4));
    s.later(2.9, () => {
      s.think('Way too high to climb back up… I\'ll dig my way out. Or try that old lift in the corner?', 5);
      s.showDigHint();
    });
  }

  burst(x, z) {
    const fx = this.s.fx;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(0.6, 2.2);
      fx.spawn({ x, y: 0.06, z, vx: Math.cos(a) * sp, vy: rand(0.2, 0.8), vz: Math.sin(a) * sp, life: rand(1, 1.8), size: rand(0.04, 0.08), grow: 0.12, color: [0.6, 0.48, 0.36], alpha: 0.6, drag: 2.6, grav: -0.05 });
    }
    fx.chips(x, 0.1, z, 22, [0.36, 0.25, 0.17], [0, 1, 0]);
    fx.chips(x, 0.1, z, 10, [0.5, 0.36, 0.22], [0, 1, 0]);
    for (let i = 0; i < 20; i++) fx.spawn({ x: x + rand(-0.2, 0.2), y: CEIL + rand(0, 0.8), z: z + rand(-0.2, 0.2), vy: rand(-1, 0), life: 1.5, size: rand(0.01, 0.016), color: [0.4, 0.28, 0.19], alpha: 1, grav: 9, fade: false, bounce: 0.15 });
  }
}

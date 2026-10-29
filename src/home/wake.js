// Waking up in your bed at Old Star's (home { from: 'fall' }), mixed into HomeScene: the first
// cutscene of the forced tutorial (letterbox bars, nothing else on screen; a hold of Space / Enter /
// E, or of the ring on a touch screen, skips it: never a tap). Dark; a slow heartbeat; the world
// comes back muffled, as if through water (a low-pass on the whole mix that opens as you come round).
// Heavy eyelids crack open on the beams over the bed and sink shut again; a second, longer look, the
// head rolling on the pillow; a third, and his camp comes into focus: the fire (the room's own hearth
// when there is one, else the home's cooking fire: questSpot('hearth')), and Old Star crouched at it
// with a poker, his back to you. He hears you stir, straightens up, turns round, and the view eases
// in on him while he talks (each line waits for you): who he is, how you came tumbling down, the
// million gold for the way up, his offer to teach you. Then you sit up and get out of your cot, and
// the tutorial at home takes over (lessons.js: look, walk, talk, follow him to the cage lift). The overlay (WakeFx) draws the lids as a dark mask with soft edges and
// lashes, warm where the light comes through them; only the world (the canvas) is ever blurred, never
// the interface. Sets flags fallen + nugget, starts the `lessons` quest and emits lesson { step: 'wake' }
// (and talk oldstar), as before.
import * as THREE from 'three';
import { el, clamp } from '../core/util.js';
import { starData } from './starData.js';
import { besideItem } from './layoutfix.js';
import { T } from './units.js';

const ease = (k) => k * k * (3 - 2 * k);

// ---------------------------------------------------------------- the eyelids
/**
 * Eyelids over the view: open 0 (shut) … 1 (wide open, gone). The lids are dark curves meeting in
 * a soft almond, the upper one moving most, with a band of warm flesh-light along each edge and a
 * fringe of lashes; shut, the light glows dull red through them. Drawn on a small canvas and
 * softened with a CSS blur (they're far too close to focus on). blur: the view's own blur (px).
 */
export class WakeFx {
  constructor(game) {
    this.game = game;
    this.open = 1;
    this.blur = 0;
    this.glow = 0.5; // how much light comes through the shut lids (red)
    this.c = el('canvas', { class: 'wake-lids', style: { position: 'absolute', inset: '-24px', width: 'calc(100% + 48px)', height: 'calc(100% + 48px)', pointerEvents: 'none', zIndex: 3, filter: 'blur(13px)' } });
    this.ctx = this.c.getContext('2d');
    game.ui.root.insertBefore(this.c, game.ui.root.querySelector('.tutor'));
    this.resize();
    this.last = '';
  }

  resize() {
    const W = 320, a = window.innerHeight / Math.max(1, window.innerWidth);
    this.W = W; this.H = Math.max(120, Math.round(W * a));
    this.c.width = this.W; this.c.height = this.H;
    this.last = '';
  }

  update() {
    const g = this.ctx, W = this.W, H = this.H;
    const k = clamp(this.open, 0, 1);
    const key = `${k.toFixed(3)}|${this.glow.toFixed(2)}`;
    if (key !== this.last) {
      this.last = key;
      g.clearRect(0, 0, W, H);
      if (k < 0.995) this.drawLids(g, W, H, k);
    }
    // the blur and the dim on the canvas itself
    const canvas = this.game.canvas;
    const b = this.blur;
    canvas.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px) brightness(${(1 - Math.min(0.3, b * 0.03)).toFixed(3)}) saturate(${(1 - Math.min(0.4, b * 0.04)).toFixed(3)})` : '';
    return k < 0.999 || b > 0.05;
  }

  drawLids(g, W, H, k) {
    const mid = H * 0.5;
    // the aperture: an almond, sized by the width (a slit stays a slit on a tall phone screen), that
    // grows past the screen's edges as the eye opens
    const S = Math.min(H, W * 0.56), far = k * k * k * H * 0.45;
    const reachUp = k * S * 0.78, reachDn = k * S * 0.62;
    const top = (x) => { const u = (x - W / 2) / (W * 0.62); return mid - reachUp * Math.max(0, 1 - u * u) - far; };
    const bot = (x) => { const u = (x - W / 2) / (W * 0.66); return mid + reachDn * Math.max(0, 1 - u * u * 1.1) + far; };
    const shut = 1 - Math.min(1, k * 4);
    // the lids: deep red-brown where the light glows through, near black at the rims of the view
    const lid = (t) => `rgb(${Math.round(18 + 34 * this.glow * t)},${Math.round(6 + 6 * this.glow * t)},${Math.round(6 + 4 * this.glow * t)})`;
    const N = 40;
    const path = (edge, upper) => {
      g.beginPath();
      g.moveTo(0, upper ? 0 : H);
      for (let i = 0; i <= N; i++) { const x = (i / N) * W; g.lineTo(x, edge(x)); }
      g.lineTo(W, upper ? 0 : H);
      g.closePath();
    };
    for (const upper of [true, false]) {
      const edge = upper ? top : bot;
      path(edge, upper);
      const gr = upper ? g.createLinearGradient(0, 0, 0, Math.max(1, mid)) : g.createLinearGradient(0, H, 0, Math.min(H - 1, mid));
      gr.addColorStop(0, lid(0.4 + shut * 0.6));
      gr.addColorStop(1, lid(1));
      g.fillStyle = gr;
      g.fill();
      // the warm, lit band along the rim of each lid
      g.save();
      path(edge, upper);
      g.clip();
      g.lineWidth = S * 0.09;
      g.strokeStyle = `rgba(86,30,22,${0.35 + shut * 0.3})`;
      g.beginPath();
      for (let i = 0; i <= N; i++) { const x = (i / N) * W; if (i) g.lineTo(x, edge(x)); else g.moveTo(x, edge(x)); }
      g.stroke();
      g.restore();
      // lashes: dark curved strokes off the rim, longer on the upper lid
      if (k > 0.02 && k < 0.98) {
        g.strokeStyle = 'rgba(8,3,3,0.9)';
        g.lineWidth = 1.4;
        const n = upper ? 34 : 22, L = (upper ? 0.07 : 0.035) * S;
        for (let i = 1; i < n; i++) {
          const x = (i / n) * W + Math.sin(i * 7.3) * 2;
          const y = edge(x);
          const lean = (x - W / 2) / W;
          g.beginPath();
          g.moveTo(x, y);
          g.quadraticCurveTo(x + lean * L * 0.8, y + (upper ? 1 : -1) * L * 0.7, x + lean * L * 1.6, y + (upper ? 1 : -1) * L * (0.9 + Math.sin(i * 3.1) * 0.15));
          g.stroke();
        }
      }
    }
    // shut tight: the light still glows dully through
    if (k < 0.02) { g.fillStyle = lid(1); g.fillRect(0, 0, W, H); }
  }

  dispose() {
    this.c.remove();
    this.game.canvas.style.filter = '';
  }
}

// ---------------------------------------------------------------- sounds
function heartbeat(a, n = 2, vol = 0.16) {
  for (let i = 0; i < n; i++) {
    a.tone({ f: 58, f2: 42, type: 'sine', dur: 0.16, vol, delay: i * 1.05 });
    a.tone({ f: 52, f2: 40, type: 'sine', dur: 0.14, vol: vol * 0.66, delay: i * 1.05 + 0.24 });
  }
}
function breath(a, vol = 0.05) {
  a.noise({ color: 'pink', filter: 'bandpass', f: 500, f2: 900, q: 0.8, dur: 1.1, a: 0.4, vol });
}

/**
 * Everything sounds as if under a blanket: a low-pass between the master gain and the compressor.
 * Returns { set(k: 0 muffled … 1 clear), dispose() } (or a no-op when there's no audio).
 */
function muffler(a) {
  const ctx = a.ctx;
  if (!ctx || !a.master || !a.comp) return { set() {}, dispose() {} };
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  lp.Q.value = 0.6;
  try { a.master.disconnect(a.comp); } catch (e) { return { set() {}, dispose() {} }; }
  a.master.connect(lp).connect(a.comp);
  let gone = false;
  return {
    set(k) { if (!gone) lp.frequency.setTargetAtTime(260 * Math.pow(80, clamp(k, 0, 1)), ctx.currentTime, 0.05); },
    dispose() {
      if (gone) return;
      gone = true;
      try { a.master.disconnect(lp); lp.disconnect(); } catch (e) { /* already apart */ }
      try { a.master.connect(a.comp); } catch (e) { /* (nothing to do) */ }
    },
  };
}

// ---------------------------------------------------------------- the scene
/** Thrown through the cutscene's awaits when the player holds to skip. */
const CUT = { cut: true };

export class HomeWake {
  /** Per frame (HomeScene.update): the eyelids, the head's sway, and the tutorial at home (lessons.js). */
  tickWakeFx(dt) {
    if (this.wakeFx) this.wakeFx.update(dt);
    if (this.waking && this.wakeSway) this.wakeSway(dt);
    this.tickHomeTutor?.(dt);
  }

  sniffSound() {
    const a = this.game.audio;
    for (let i = 0; i < 3; i++) a.noise({ color: 'pink', filter: 'bandpass', f: 1800, q: 2, dur: 0.06, vol: 0.12, delay: i * 0.11 });
  }

  /** The fire nearest your bed (meters): the room's own hearth if it has one, else the home's cooking fire. */
  wakeFire() {
    const h = this.shell?.hearth;
    if (h && Number.isFinite(h.x)) return { x: h.x, z: h.z, own: true };
    const q = this.questSpot?.('hearth');
    return q ? { x: q.x, z: q.z } : null;
  }

  /** Where Old Star tends that fire, his back to you (meters): { x, z, face: { x, z } }. */
  hearthSpot() {
    const f = this.wakeFire(), p = this.cam || this.rig.player.pos;
    if (!f) return { x: p.x + 1.2, z: p.z - 1.2, face: { x: p.x + 2, z: p.z - 2 } };
    if (f.own) return { x: f.x + 0.12, z: f.z - 0.92, face: { x: f.x, z: f.z } };
    // on your side of the fire, facing it
    const dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz) || 1;
    return { x: f.x + (dx / d) * 0.8, z: f.z + (dz / d) * 0.8, face: { x: f.x, z: f.z } };
  }

  /**
   * Tweens and waits for a cutscene that a hold-to-skip can cut short: tween() and sleep() stop at
   * once when cut.on (resolving), go(p) awaits p and then throws CUT if the scene was cut meanwhile.
   */
  cineTools(cut) {
    const tween = (secs, fn) => new Promise((res) => {
      let t = 0;
      fn(0);
      const drop = () => { const i = this.tickers.indexOf(tick); if (i >= 0) this.tickers.splice(i, 1); };
      const tick = (dt) => {
        if (cut.on) { drop(); res(); return; }
        t += dt;
        const k = Math.min(1, t / secs);
        fn(k);
        if (k >= 1) { drop(); res(); }
      };
      this.tickers.push(tick);
    });
    const sleep = (secs) => tween(secs, () => {});
    // a skip lets go of whatever the scene was waiting on (a walk, a line) at once
    const cutP = new Promise((r) => { cut.fire = r; if (cut.on) r(); });
    const go = async (p) => { await Promise.race([p, cutP]); if (cut.on) throw CUT; };
    return { tween, sleep, go };
  }

  /**
   * Old Star says a line (through the cutscene talk when there is one, else his tutor card).
   * o: { mood, wait, key, dur }.
   */
  starLine(html, o = {}) {
    const star = this.star, ui = this.game.ui;
    if (this.game.scene !== this) return Promise.resolve(); // (the home has gone: nothing more to say)
    if (!star?.rig) return Promise.resolve(ui.tutor?.say(html, o));
    const ob = ui.onboard;
    // a line he waits on is a little cutscene (game.convo: the camera on him, the words by his head);
    // a passing tip is his card, which never holds you up
    if (ob && o.wait && this.game.convo?.say) {
      star.sniff?.();
      return ob.talk(html, { mood: o.mood, wait: true, camera: o.camera, gesture: o.gesture, scene: this }, () => star.say(html, o));
    }
    // (a passing tip stays on his card even while a talk with him is still winding down)
    return Promise.resolve(star.say(html, o.wait ? o : { ...o, convo: false }));
  }

  /** The camera's field of view, eased (a slow push in on whoever's talking). */
  zoomTo(fov, secs, tween = (s, f) => this.tween(s, f)) {
    if (this.game.convo?.say) return Promise.resolve(); // the cutscene talk frames its own shots
    const cam = this.camera, f0 = cam.fov;
    return tween(secs, (k) => { cam.fov = f0 + (fov - f0) * ease(k); cam.updateProjectionMatrix(); });
  }

  /** The whole waking-up scene: a cutscene (letterbox, hold to skip), then the tutorial takes over. */
  async wakeFromFall() {
    const g = this.game, st = g.state, a = g.audio, ui = g.ui, star = this.star, ob = ui.onboard;
    st.flag('fallen', true);
    st.flag('nugget', true);
    const sd = starData(st);
    sd.woke = false;
    ob?.begin(); // a new game: nothing on screen yet, the HUD comes in piece by piece
    if (!this.wakeFx) { this.wakeFx = new WakeFx(g); this.own(() => { this.wakeFx?.dispose(); this.wakeFx = null; }); }
    const fx = this.wakeFx;
    const muff = (this.wakeMuff = muffler(a));
    this.own(() => muff.dispose());
    ui.setTouchControls?.(false);
    this.hammer && (this.hammer.style.visibility = 'hidden');
    // no "click to look around" card over your eyelids: it's a cutscene till you're on your feet
    const lc = ui.lookCatch;
    if (lc) { lc.style.visibility = 'hidden'; this.own(() => { lc.style.visibility = ''; }); }
    this.beginScript(false);
    this.waking = true;
    const c = this.cam;
    const bed = this.findKind('bed');
    this.wakeBed = bed;
    // lying in bed, looking up at the beams
    if (bed) await this.lieDown(bed, true);
    const base = { yaw: c.yaw, pitch: 1.12, roll: 0.18 };
    c.pitch = base.pitch; c.roll = base.roll;
    fx.open = 0; fx.blur = 10; fx.glow = 0.35;
    const post0 = (this.wakeVignette = this.post.vignette);
    this.fov0 = this.camera.fov;
    this.post.vignette = 0.95;
    this.post.fade = 0;
    // the head drifts on the pillow: a slow sway that settles as you come round
    const sway = (this.wakeSwayS = { amp: 1, yaw: 0, pitch: 0, t: 0 });
    this.wakeSway = (dt) => {
      sway.t += dt;
      const s = sway.amp;
      c.yaw = base.yaw + sway.yaw + Math.sin(sway.t * 0.55) * 0.05 * s;
      c.pitch = base.pitch + sway.pitch + Math.sin(sway.t * 0.37 + 1) * 0.035 * s;
      c.roll = base.roll * (0.35 + 0.65 * s) + Math.sin(sway.t * 0.43 + 2) * 0.04 * s;
    };
    // Old Star crouched at the fire with the poker, his back to you
    if (star?.rig) {
      star.scripted = true;
      star.stand();
      const H = this.hearthSpot();
      star.pos.set(H.x, this.floorY(H.x, H.z), H.z);
      star.faceTo(H.face.x, H.face.z, true);
      star.setPose('poke');
      star.lean(0.32);
      star.spot = 'wake';
    }
    // the cutscene: letterbox bars, and a hold (never a tap) skips it
    const cut = (this.wakeCut = { on: false });
    ob?.cinema(true, { skip: () => this.skipWakeCinema() });
    const { tween, sleep, go } = this.cineTools(cut);
    const lids = (to, secs) => { const from = fx.open; return tween(secs, (k) => { fx.open = from + (to - from) * ease(k); }); };
    const blurTo = (to, secs) => { const from = fx.blur; return tween(secs, (k) => { fx.blur = from + (to - from) * ease(k); }); };
    const glowTo = (to, secs) => { const from = fx.glow; return tween(secs, (k) => { fx.glow = from + (to - from) * ease(k); }); };
    const clear = (to, secs) => { const from = this.muffK ?? 0; return tween(secs, (k) => { this.muffK = from + (to - from) * ease(k); muff.set(this.muffK); }); };
    const look = (dyaw, dpitch, secs) => { const y0 = sway.yaw, p0 = sway.pitch; return tween(secs, (k) => { sway.yaw = y0 + (dyaw - y0) * ease(k); sway.pitch = p0 + (dpitch - p0) * ease(k); }); };
    const line = (html, mood) => go(this.starLine(html, { mood, wait: true, camera: 'close' }));
    this.muffK = 0;
    muff.set(0);
    try {
      // ---- dark, light glowing red through the lids, a heartbeat; then a crack of warm light on the
      // beams, blurred, slowly widening... and shut again
      glowTo(0.7, 1.4);
      await go(sleep(0.3));
      heartbeat(a, 2);
      await go(lids(0.05, 0.9));
      await go(sleep(0.5));
      breath(a, 0.04);
      clear(0.2, 2);
      await go(lids(0.2, 1.1));
      await go(sleep(0.7));
      await go(lids(0.02, 0.6));
      await go(sleep(0.9));
      // ---- the second, longer: the head rolls toward the fire, Old Star hums to himself
      heartbeat(a, 1, 0.1);
      clear(0.45, 2.2);
      blurTo(6, 1.6);
      look(0.25, -0.18, 2.6);
      await go(lids(0.42, 1.0));
      if (star?.rig) a.play('babble', { pitch: 150, n: 3, vol: 0.35 });
      await go(sleep(0.9));
      await go(lids(0.12, 0.45));
      await go(lids(0.36, 0.5));
      await go(sleep(0.5));
      await go(lids(0.0, 0.55));
      await go(sleep(0.6));
      // ---- the third: eyes open, the room comes into focus, the sound comes back
      clear(1, 2.6);
      blurTo(0, 2.4);
      glowTo(0, 1);
      tween(2.6, (k) => { this.post.vignette = 0.95 + (post0 - 0.95) * ease(k); });
      const fire = this.wakeFire() || this.hearthSpot();
      const towards = Math.atan2(-(fire.x - c.x), -(fire.z - c.z));
      const dYaw = Math.atan2(Math.sin(towards - base.yaw), Math.cos(towards - base.yaw));
      look(dYaw * 0.85, -0.95, 2.4);
      await go(lids(0.7, 1.0));
      await go(lids(0.5, 0.18)); // a flutter
      await go(lids(1, 0.5));
      tween(1.6, (k) => { sway.amp = 1 - ease(k) * 0.7; });
      a.play('creak', { vol: 0.25 }); // the bed creaks as you stir
      await go(sleep(0.9));
      // ---- he hears you: straightens up, turns round, and the view settles on him
      if (star?.rig) {
        const r = star;
        tween(0.6, (k) => { r.lean(0.32 * (1 - ease(k))); });
        r.setPose('idle');
        await go(sleep(0.3));
        r.faceTo(c.x, c.z);
        r.sniff();
        this.sniffSound();
        await go(sleep(0.5));
        r.gesture('wave', 1.4);
        this.zoomTo(this.fov0 - 12, 2.2, tween);
      } else await go(sleep(0.6));
      await line('Ah! You\'re awake. Easy now: the cave likes to spin the first time.', 'happy');
      star?.rig && star.gesture('point', 1.6);
      await line('You came tumbling down out of the rock last night, you and a hen in a walking hut. Out cold. I\'m <b>Old Star</b>. That cot\'s yours now.', 'calm');
      await line('Sixty years I\'ve been stuck down here. The way up is the Surface Express, and a ticket costs a <span class="gold-txt">million gold</span>.', 'worried');
      await line('So here\'s my offer. I\'ll teach you to <b>dig</b>, to <b>forge</b> and to <b>cook</b>. We earn that million together, and we <b>both</b> ride out of here.', 'proud');
      if (this.nug) { a.play('cluck', { n: 2 }); this.nugEmote?.('♥'); }
      await line('Your hen\'s fine, by the way. Made herself at home by the crates. Up you get, then!', 'happy');
      // ---- sit up and get out of bed (on its side)
      this.wakeSway = null;
      sway.amp = 0;
      this.zoomTo(this.fov0, 1.2, tween);
      a.play('step', { mat: 'wood' });
      await go(this.wakeGetUp(bed, tween));
    } catch (e) {
      if (e !== CUT) throw e;
    }
    if (cut.on) await this.wakeCutToEnd();
    this.afterWake();
  }

  /** Sit up, swing the legs out of bed and stand beside it (the cutscene's own tweens: a skip stops it). */
  async wakeGetUp(bed, tween) {
    const c = this.cam;
    const end = this.besideBed(bed);
    if (!end) { await tween(0.7, (k) => { c.pitch *= 1 - k; c.roll *= 1 - k; }); return; }
    const x0 = c.x, y0 = c.y, z0 = c.z, yw0 = c.yaw, p0 = c.pitch, r0 = c.roll;
    const dyaw = Math.atan2(Math.sin(end.yaw - yw0), Math.cos(end.yaw - yw0));
    await tween(0.6, (k) => { const e = ease(k); c.pitch = p0 + (-0.15 - p0) * e; c.roll = r0 * (1 - e); c.y = y0 + 0.12 * e; });
    if (this.wakeCut?.on) return;
    this.game.audio.play('step', { mat: 'wood' });
    const y1 = c.y;
    await tween(0.7, (k) => { const e = ease(k); c.x = x0 + (end.x - x0) * e; c.z = z0 + (end.z - z0) * e; c.y = y1 + (end.y - y1) * e; c.yaw = yw0 + dyaw * e; c.pitch = -0.15 + 0.1 * e; });
  }

  /** Standing beside the bed, facing the room (where getting up ends): { x, y (eye), z, yaw } or null. */
  besideBed(bed) {
    if (!bed) return null;
    const s = besideItem(this, bed) || { x: bed.cx + 1, z: bed.cz };
    const x = s.x * T, z = s.z * T;
    return { x, z, y: this.floorY(x, z) + this.rig.player.eyeY, yaw: Math.atan2(-((this.W / 2) * T - x), -((this.D / 2) * T - z)) };
  }

  /** Hold to skip: the cutscene stops where it is (its tweens and line) and cuts to its end. */
  skipWakeCinema() {
    if (!this.waking || !this.wakeCut || this.wakeCut.on) return;
    this.wakeCut.on = true;
    this.wakeCut.fire?.();
    this.game.ui.tutor?.hide();
    this.game.convo?.end?.();
  }

  /** A quick dip to black, everything set as the scene would have left it, and back. */
  async wakeCutToEnd() {
    const fx = this.wakeFx, c = this.cam, star = this.star;
    await this.tween(0.22, (k) => { this.post.fade = Math.max(this.post.fade || 0, k); });
    if (fx) { fx.open = 1; fx.blur = 0; fx.glow = 0; }
    this.wakeMuff?.dispose();
    this.wakeSway = null;
    if (this.wakeVignette !== undefined) this.post.vignette = this.wakeVignette;
    if (this.fov0) { this.camera.fov = this.fov0; this.camera.updateProjectionMatrix(); }
    const end = this.besideBed(this.wakeBed);
    if (end && c) { c.x = end.x; c.y = end.y; c.z = end.z; c.yaw = end.yaw; c.pitch = -0.05; c.roll = 0; }
    if (star?.rig) {
      star.stand();
      star.lean(0);
      star.setPose('idle');
      const H = this.hearthSpot();
      star.pos.set(H.x, this.floorY(H.x, H.z), H.z);
      if (c) star.faceTo(c.x, c.z, true);
    }
    await this.sleepFor(0.15);
    await this.tween(0.45, (k) => { this.post.fade = 1 - k; });
    this.post.fade = 0;
  }

  /** The end of the waking-up (played through or skipped): control back, the lessons begin. */
  afterWake() {
    const g = this.game, st = g.state, ui = g.ui, star = this.star;
    const sd = starData(st);
    this.wakeSway = null;
    if (this.cam) this.cam.roll = 0;
    if (this.fov0) { this.camera.fov = this.fov0; this.camera.updateProjectionMatrix(); }
    if (this.scripted) this.endScript();
    this.unstick();
    this.waking = false;
    if (this.wakeFx) { this.wakeFx.open = 1; this.wakeFx.blur = 0; }
    this.wakeMuff?.dispose();
    if (this.wakeVignette !== undefined) this.post.vignette = this.wakeVignette;
    this.post.fade = 0;
    ui.setTouchControls?.(true);
    if (this.hammer) this.hammer.style.visibility = '';
    if (ui.lookCatch) ui.lookCatch.style.visibility = '';
    ui.onboard?.cinema(false);
    // the lessons begin (the same flags, quest and acts as ever)
    sd.woke = true;
    g.quests?.start?.('lessons');
    st.emit('act', { type: 'lesson', step: 'wake' });
    st.emit('act', { type: 'talk', npc: 'oldstar' });
    this.setLesson('mine');
    st.save();
    if (star?.rig) {
      star.scripted = false;
      star.nextT = 999;
      star.faceTo(this.rig.player.pos.x, this.rig.player.pos.z);
    }
    if (this.nug) { this.nug.ai.wake?.(); }
    // and now the tutorial: look, walk, talk, follow him to the lift (lessons.js)
    if (this.startHomeTutor) this.startHomeTutor('look');
    else if (star?.rig) this.later(1.6, () => this.placeStarForLesson());
  }

  /** Test hook: jump to the end of the waking-up scene (flags, the quest, the first lesson). */
  skipWake() {
    const st = this.game.state;
    st.flag('fallen', true);
    st.flag('nugget', true);
    starData(st).woke = true;
    this.game.quests?.start?.('lessons');
    st.emit('act', { type: 'lesson', step: 'wake' });
    if (this.lessonStage() === 'wake') this.setLesson('mine');
    if (this.wakeCut) { this.wakeCut.on = true; this.wakeCut.fire?.(); }
    if (this.wakeFx) { this.wakeFx.open = 1; this.wakeFx.blur = 0; }
    this.wakeMuff?.dispose();
    if (this.wakeVignette !== undefined) this.post.vignette = this.wakeVignette;
    if (this.fov0) { this.camera.fov = this.fov0; this.camera.updateProjectionMatrix(); }
    this.post.fade = 0;
    this.waking = false;
    this.wakeSway = null;
    if (this.scripted) this.endScript();
    this.game.ui.onboard?.cinema(false);
    this.game.ui.setTouchControls?.(true);
    this.placeStarForLesson(true);
  }
}

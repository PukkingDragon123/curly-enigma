// Waking up on your bedroll at Old Star's (home { from: 'fall' }), mixed into HomeScene: the first
// cutscene (letterbox bars, nothing else on screen; a hold of Space / Enter / E, or of the ring on a
// touch screen, skips it: never a tap). Dark, and through the dark, muffled, the rhythm of a hammer
// on an anvil. You're flat on your back on a heap of straw on the cave floor (his own bedroll: he
// gave it you). The world swims up out of the black, dim, blurred and doubled, on the low rock roof
// and a speck of grey daylight far up the hole you fell through, and fades away again (a slow blink:
// a fade to black, no lid art); the head rolls on the straw toward the sound and the second look
// finds the forge's glow and the sparks jumping off each blow; a blink, and the third clears: from
// down on the floor, Old Star at his anvil by the forge, hammering (his 'hammer' pose's own clang,
// its sparks made bigger, a flash of light off each blow). The straw rustles; his hammer stops
// mid-swing, his nose goes, he lays the hammer down on the anvil, turns, walks over, gets down on
// his hunkers beside you and gives your shoulder a shake (pose 'crouch', nudge()), the view
// following him (first person, no cards). Three short lines, each waits for you (game.convo: how
// you came down, who he is and the million, no pick so you'll make one). He straightens up, you sit
// up off the straw and get to your feet: the lessons take over (lessons.js; no look / walk
// teaching: you just move, with one tiny hint the first time). The overlay (WakeFx) is only the
// world's own frame, blurred, dimmed and doubled (a ghost copy drifting back into register), and a
// plain fade to black for the blinks (wave 12: no eyelid shapes); only the world (the canvas) is
// ever blurred, never the interface. The sound comes back through a low-pass that
// opens as you come round. Sets the flag fallen, starts the `lessons` quest and emits lesson
// { step: 'wake' } (and talk oldstar), as before; unlocks look / move / use (src/ui/Onboard.js).
import * as THREE from 'three';
import { el, clamp } from '../core/util.js';
import { starData } from './starData.js';
import { besideItem } from './layoutfix.js';
import { T } from './units.js';

const ease = (k) => k * k * (3 - 2 * k);

// ---------------------------------------------------------------- the bleary eyes
/**
 * Waking eyes over the world (wave 12: no lids drawn, ever). open: 0 (black) … 1 (eyes open): the
 * blinks are plain fades to black. blur: the world's blur (px). ghost: double vision, the offset (px)
 * of a second, fainter copy of the frame that drifts back into register as the eyes focus. dim: the
 * world's brightness (0.4 bleary … 1). Only the 3D view is touched, never the interface.
 */
export class WakeFx {
  constructor(game) {
    this.game = game;
    this.open = 1;
    this.blur = 0;
    this.ghost = 0;
    this.dim = 1;
    this.glow = 0; // (kept for old callers: the shut eyes no longer glow red)
    this.t = 0;
    const layer = { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 };
    // the double image: a small copy of each finished frame, offset and faint
    this.c = el('canvas', { class: 'wake-ghost', style: { ...layer, opacity: '0', imageRendering: 'auto' } });
    this.ctx = this.c.getContext('2d');
    // the blink: the dark itself (a flat black fade, nothing shaped)
    this.dark = el('div', { class: 'wake-dark', style: { ...layer, background: '#030202', opacity: '0' } });
    const before = game.ui.root.querySelector('.tutor');
    game.ui.root.insertBefore(this.c, before);
    game.ui.root.insertBefore(this.dark, before);
    this.copyQueued = false;
    this.resize();
  }

  resize() {
    const W = 360, a = window.innerHeight / Math.max(1, window.innerWidth);
    this.W = W; this.H = Math.max(120, Math.round(W * a));
    this.c.width = this.W; this.c.height = this.H;
  }

  /** Copy the frame once it's drawn (a microtask: after this frame's render, before it's shown). */
  queueCopy() {
    if (this.copyQueued) return;
    this.copyQueued = true;
    queueMicrotask(() => {
      this.copyQueued = false;
      if (!this.c.isConnected) return;
      try { this.ctx.drawImage(this.game.canvas, 0, 0, this.W, this.H); } catch (e) { /* (no frame to copy) */ }
    });
  }

  update(dt = 0) {
    this.t += dt;
    const k = clamp(this.open, 0, 1), b = this.blur, gh = this.ghost, dim = clamp(this.dim, 0, 1);
    const awake = k >= 0.999 && b <= 0.05 && gh <= 0.3 && dim >= 0.999;
    // the blur and the dim on the canvas itself
    const canvas = this.game.canvas;
    const bright = dim * (1 - Math.min(0.2, b * 0.02));
    const filt = awake ? '' : `blur(${b.toFixed(2)}px) brightness(${bright.toFixed(3)}) saturate(${(1 - Math.min(0.45, b * 0.045)).toFixed(3)})`;
    canvas.style.filter = filt;
    // the dark between blinks
    this.dark.style.opacity = awake ? '0' : (1 - k).toFixed(3);
    this.dark.style.display = awake || k >= 0.999 ? 'none' : '';
    // double vision: the frame again, a little to one side and a touch high, drifting as the eyes swim
    const seeGhost = !awake && gh > 0.3 && k > 0.02;
    this.c.style.display = seeGhost ? '' : 'none';
    if (seeGhost) {
      this.queueCopy();
      const sx = window.innerWidth / Math.max(1, canvas.clientWidth || window.innerWidth);
      const dx = gh * (1 + Math.sin(this.t * 0.9) * 0.18) * sx, dy = -gh * 0.22 + Math.sin(this.t * 0.6 + 1) * gh * 0.08;
      this.c.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      this.c.style.filter = filt;
      this.c.style.opacity = Math.min(0.5, 0.12 + gh * 0.03).toFixed(3);
    }
    return !awake;
  }

  /** Eyes open: no blur, no ghost, full light. */
  clear() { this.open = 1; this.blur = 0; this.ghost = 0; this.dim = 1; this.glow = 0; }

  dispose() {
    this.c.remove();
    this.dark.remove();
    this.game.canvas.style.filter = '';
  }
}

// ---------------------------------------------------------------- sounds
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
  /** Per frame (HomeScene.update): the bleary eyes, the head's sway, and the tutorial at home (lessons.js). */
  tickWakeFx(dt) {
    if (this.wakeFx) this.wakeFx.update(dt);
    if (this.waking && this.wakeSway) this.wakeSway(dt);
    this.tickHomeTutor?.(dt);
  }

  sniffSound() {
    const a = this.game.audio;
    for (let i = 0; i < 3; i++) a.noise({ color: 'pink', filter: 'bandpass', f: 1800, q: 2, dur: 0.06, vol: 0.12, delay: i * 0.11 });
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
    // a passing tip floats by him without holding you up
    if (ob && o.wait && this.game.convo?.say) {
      star.sniff?.();
      return ob.talk(html, { mood: o.mood, wait: true, camera: o.camera, gesture: o.gesture, scene: this }, () => star.say(html, o));
    }
    // a passing tip floats by his head (game.convo, not held: no bars, you keep walking; it takes
    // over from a talk with him that's winding down); the card only when he isn't here in 3D
    return Promise.resolve(star.say(html, o));
  }

  /** Where to look (yaw, pitch) from the scripted camera at a world point. */
  aimFrom(c, p) {
    return { yaw: Math.atan2(-(p.x - c.x), -(p.z - c.z)), pitch: Math.atan2(p.y - c.y, Math.max(0.05, Math.hypot(p.x - c.x, p.z - c.z))) };
  }

  /** The whole waking-up scene: a cutscene (letterbox, hold to skip), then the lessons take over. */
  async wakeFromFall() {
    const g = this.game, st = g.state, a = g.audio, ui = g.ui, star = this.star, ob = ui.onboard;
    st.flag('fallen', true);
    const sd = starData(st);
    sd.woke = false;
    ob?.begin(); // a new game: nothing on screen, nothing unlocked; things come in as he hands them over
    if (!this.wakeFx) { this.wakeFx = new WakeFx(g); this.own(() => { this.wakeFx?.dispose(); this.wakeFx = null; }); }
    const fx = this.wakeFx;
    const muff = (this.wakeMuff = muffler(a));
    this.own(() => muff.dispose());
    ui.setTouchControls?.(false);
    this.hammer && (this.hammer.style.visibility = 'hidden');
    // no "click to look around" card over your waking eyes: it's a cutscene till you're on your feet
    const lc = ui.lookCatch;
    if (lc) { lc.style.visibility = 'hidden'; this.own(() => { lc.style.visibility = ''; }); }
    this.beginScript(false);
    this.waking = true;
    const c = this.cam;
    const bed = this.findKind('bed');
    this.wakeBed = bed;
    // flat on your back on the bedroll, on the floor, looking up at the rock (and the hole you came through)
    if (bed) await this.lieDown(bed, true);
    const base = { yaw: c.yaw, pitch: 1.12, roll: 0.18 };
    c.pitch = base.pitch; c.roll = base.roll;
    fx.open = 0; fx.blur = 10; fx.ghost = 16; fx.dim = 0.62;
    const post0 = (this.wakeVignette = this.post.vignette);
    this.fov0 = this.camera.fov;
    this.post.vignette = 0.95;
    this.post.fade = 0;
    // Old Star at his anvil by the forge, hammering (his pose clangs and throws sparks off each blow)
    const anvil = this.cave?.dyn?.anvilFace || this.questSpot?.('forge') || { x: c.x, y: c.y, z: c.z - 2 };
    if (star?.rig) {
      star.scripted = true;
      star.placeAt('anvil');
      star.sparkK = 2.4;
      star.clangK = 1.35;
      star.pauseT = 0;
      star.nextT = 999;
      this.moveStarBox?.();
      // a flash of light off each blow, fading fast (the forge's glow behind him)
      const L = this.addLight?.({ x: anvil.x, y: anvil.y + 0.16, z: anvil.z + 0.1, color: 0xffb060, intensity: 0, distance: 2.4, flicker: 0, halo: 0.14, haloOpacity: 0.7, priority: 9 });
      if (L) {
        star.onBlow = () => { L.intensity = 1.5; };
        const tick = (dt) => { L.intensity = Math.max(0, L.intensity - dt * 5); };
        this.tickers.push(tick);
        this.own(() => { const i = this.tickers.indexOf(tick); if (i >= 0) this.tickers.splice(i, 1); this.removeLight?.(L); });
      }
    }
    const starHead = () => (star?.rig ? star.head(new THREE.Vector3()) : new THREE.Vector3(anvil.x, anvil.y + 0.5, anvil.z));
    // the head drifts on the pillow (a slow sway that settles as you come round); `track` turns it to
    // follow him once he's coming over
    const sway = (this.wakeSwayS = { amp: 1, yaw: 0, pitch: 0, t: 0, track: 0 });
    this.wakeSway = (dt) => {
      sway.t += dt;
      if (sway.track > 0 && star?.rig) {
        const h = starHead();
        const aim = this.aimFrom(c, h.setY(h.y - 0.12));
        const ty = Math.atan2(Math.sin(aim.yaw - base.yaw), Math.cos(aim.yaw - base.yaw)), tp = aim.pitch - base.pitch;
        const k = Math.min(1, dt * 3 * sway.track);
        sway.yaw += (ty - sway.yaw) * k;
        sway.pitch += (tp - sway.pitch) * k;
      }
      const s = sway.amp;
      c.yaw = base.yaw + sway.yaw + Math.sin(sway.t * 0.55) * 0.05 * s;
      c.pitch = base.pitch + sway.pitch + Math.sin(sway.t * 0.37 + 1) * 0.035 * s;
      c.roll = base.roll * (0.35 + 0.65 * s) + Math.sin(sway.t * 0.43 + 2) * 0.04 * s;
    };
    // the cutscene: letterbox bars, and a hold (never a tap) skips it
    const cut = (this.wakeCut = { on: false });
    ob?.cinema(true, { skip: () => this.skipWakeCinema() });
    const { tween, sleep, go } = this.cineTools(cut);
    // (the eyes: fade up from / down to black; and the blur, the double image and the dim easing off)
    const eyes = (to, secs) => { const from = fx.open; return tween(secs, (k) => { fx.open = from + (to - from) * ease(k); }); };
    const blurTo = (to, secs) => { const from = fx.blur; return tween(secs, (k) => { fx.blur = from + (to - from) * ease(k); }); };
    const ghostTo = (to, secs) => { const from = fx.ghost; return tween(secs, (k) => { fx.ghost = from + (to - from) * ease(k); }); };
    const dimTo = (to, secs) => { const from = fx.dim; return tween(secs, (k) => { fx.dim = from + (to - from) * ease(k); }); };
    const clear = (to, secs) => { const from = this.muffK ?? 0; return tween(secs, (k) => { this.muffK = from + (to - from) * ease(k); muff.set(this.muffK); }); };
    const look = (dyaw, dpitch, secs) => { const y0 = sway.yaw, p0 = sway.pitch; return tween(secs, (k) => { sway.yaw = y0 + (dyaw - y0) * ease(k); sway.pitch = p0 + (dpitch - p0) * ease(k); }); };
    const line = (html, mood, gesture) => go(this.starLine(html, { mood, wait: true, camera: 'face', gesture }));
    const cam = this.camera, fov0 = this.fov0;
    const fovTo = (to, secs) => { const from = cam.fov; return tween(secs, (k) => { cam.fov = from + (to - from) * ease(k); cam.updateProjectionMatrix(); }); };
    // where the sound comes from: him at the anvil (between his face and the work: his arms, the sparks)
    const focus = star?.rig ? starHead().setY(starHead().y - 0.18).lerp(new THREE.Vector3(anvil.x, anvil.y + 0.15, anvil.z), 0.4) : { x: anvil.x, y: anvil.y + 0.3, z: anvil.z };
    const toAnvil = this.aimFrom(c, focus);
    const dYaw = Math.atan2(Math.sin(toAnvil.yaw - base.yaw), Math.cos(toAnvil.yaw - base.yaw)), dPitch = toAnvil.pitch - base.pitch;
    this.muffK = 0;
    muff.set(0);
    try {
      // ---- dark; through it, muffled, a hammer on an anvil, steady. A breath.
      await go(sleep(1.3));
      breath(a, 0.04);
      clear(0.18, 1.4);
      // ---- the world swims up out of the black: dim, blurred and doubled, rock overhead and a speck
      // of grey daylight far up the hole... and fades away again (a slow blink)
      ghostTo(13, 1.8);
      await go(eyes(0.74, 1.0));
      await go(sleep(0.7));
      await go(eyes(0, 0.7));
      await go(sleep(0.35));
      // ---- the head rolls on the straw toward the sound: the forge's glow, sparks jumping off each blow
      clear(0.5, 1.8);
      blurTo(5, 1.6);
      ghostTo(7, 1.8);
      dimTo(0.78, 1.6);
      look(dYaw * 0.82, dPitch * 0.78, 2.2);
      a.play('step', { mat: 'sand', vol: 0.12 });
      await go(eyes(0.78, 0.95));
      await go(sleep(0.9));
      // a second slow blink, and the two images start to slide together
      await go(eyes(0.08, 0.45));
      await go(sleep(0.12));
      await go(eyes(0.85, 0.5));
      await go(sleep(0.25));
      // ---- it clears: from down on the floor, Old Star at his anvil, hammering. The sound comes back.
      clear(1, 2.1);
      blurTo(0, 1.9);
      ghostTo(0, 1.6);
      dimTo(1, 1.8);
      tween(2.1, (k) => { this.post.vignette = 0.95 + (post0 - 0.95) * ease(k); });
      look(dYaw, dPitch, 1.8);
      fovTo(fov0 * (cam.aspect < 1 ? 0.9 : 0.72), 2.8); // (the eyes settle on him: a slow push in; less on a phone held upright)
      await go(eyes(1, 0.8));
      tween(1.4, (k) => { sway.amp = 1 - ease(k) * 0.65; });
      await go(sleep(1.5));
      // ---- you stir, the straw rustles; the hammer stops mid-swing. His nose goes.
      a.play('step', { mat: 'sand', vol: 0.35 });
      if (star?.rig) {
        const r = star;
        r.pauseT = 99;
        await go(sleep(0.45));
        r.sniff();
        this.sniffSound();
        r.faceTo(c.x, c.z);
        await go(sleep(0.5));
        // he lays the hammer down on the anvil, and comes over
        r.setHammerDown();
        a.play('clunk', { vol: 0.35 });
        r.setPose('idle');
        r.sparkK = 1;
        r.clangK = 1;
        fovTo(fov0, 1.6);
        await go(sleep(0.35));
        sway.track = 1;
        r.wakeFrom = { x: r.pos.x, z: r.pos.z };
        const at = this.bedsideFor(r);
        await go(Promise.race([r.walkTo(at.x, at.z, 0.9), sleep(5)]));
        r.mode = 'idle';
        r.path = null;
        r.faceTo(c.x, c.z, true);
        // down on his hunkers beside you, a paw on your shoulder: a shake
        r.setPose('crouch');
        await go(sleep(0.4));
        r.nudge(0.9);
        sway.amp = 0.5;
        tween(0.8, (k) => { c.roll = base.roll * 0.35 + Math.sin(k * Math.PI * 6) * 0.03 * (1 - k); });
        await go(sleep(0.8));
      } else await go(sleep(0.6));
      await line('Oi. Oi! There you are. Easy now: the cave likes to spin the first time.', 'happy');
      await line('You came down through my roof last night, and half of it came with you.', 'laugh');
      star?.rig && star.nudge(0.4);
      await line('I\'m <b>Old Star</b>. Smith. Sixty years I\'ve been stuck down here: a ticket up costs a <span class="gold-txt">million gold</span>.', 'worried', 'point');
      await line('So: I teach you to <b>dig</b>, <b>forge</b> and <b>cook</b>, we earn it together, and we <b>both</b> ride out.', 'proud');
      await line('Where\'s your <b>pick</b>? Lost in the fall, I\'d guess, and you can\'t dig your way to a million with bare paws. Up you get: we\'ll make you your own at my <b>forge</b>!', 'happy');
      // ---- he straightens up and steps back; you sit up off the straw and get to your feet
      if (star?.rig) { star.setPose('idle'); star.gesture('beckon', 1.4); }
      this.wakeSway = null;
      sway.amp = 0;
      a.play('step', { mat: 'sand' });
      await go(this.wakeGetUp(bed, tween));
    } catch (e) {
      if (e !== CUT) throw e;
    }
    if (cut.on) await this.wakeCutToEnd();
    this.afterWake();
  }

  /** (Old: the little bench anvil by your room's fire. He wakes you from his own anvil now.) */
  setupBenchAnvil() { return null; }

  /** Where Old Star crouches by your bedroll: at your head, on his way over from the anvil, an arm's length off (meters). */
  bedsideFor() {
    const bed = this.wakeBed, c = this.cam, star = this.star;
    let hx, hz;
    if (bed?.bedroll) { const l = bed.lie, yaw = l.yaw || 0; hx = l.x - Math.sin(yaw) * 0.5; hz = l.z - Math.cos(yaw) * 0.5; } // (the head end)
    else { const end = this.besideBed(bed) || c; hx = end.x; hz = end.z; }
    const from = star?.wakeFrom || star?.pos || { x: hx, z: hz - 1 };
    let dx = from.x - hx, dz = from.z - hz;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const d = Math.min(1.2, L);
    for (const turn of [0, 0.5, -0.5, 1, -1]) {
      const cs = Math.cos(turn), sn = Math.sin(turn);
      const x = hx + (dx * cs - dz * sn) * d, z = hz + (dx * sn + dz * cs) * d;
      if (!this.onFloor || this.onFloor(x, z)) return { x, z };
    }
    return { x: hx + dx * d, z: hz + dz * d };
  }

  /** Sit up off the straw and stand beside the bedroll (the cutscene's own tweens: a skip stops it). */
  async wakeGetUp(bed, tween) {
    const c = this.cam;
    const end = this.besideBed(bed);
    if (!end) { await tween(0.7, (k) => { c.pitch *= 1 - k; c.roll *= 1 - k; }); return; }
    const x0 = c.x, y0 = c.y, z0 = c.z, yw0 = c.yaw, p0 = c.pitch, r0 = c.roll;
    const dyaw = Math.atan2(Math.sin(end.yaw - yw0), Math.cos(end.yaw - yw0));
    // up on an elbow, then sitting
    await tween(0.7, (k) => { const e = ease(k); c.pitch = p0 + (-0.25 - p0) * e; c.roll = r0 * (1 - e); c.y = y0 + 0.2 * e; });
    if (this.wakeCut?.on) return;
    this.game.audio.play('step', { mat: 'sand' });
    // a paw on the floor, and up onto your feet
    const y1 = c.y;
    await tween(0.85, (k) => { const e = ease(k); c.x = x0 + (end.x - x0) * e; c.z = z0 + (end.z - z0) * e; c.y = y1 + (end.y - y1) * (k < 0.4 ? e * 0.3 : e) + Math.sin(k * Math.PI) * 0.04; c.yaw = yw0 + dyaw * e; c.pitch = -0.25 + 0.2 * e; });
  }

  /** Standing beside the bed, facing the room (where getting up ends): { x, y (eye), z, yaw } or null. */
  besideBed(bed) {
    if (!bed) return null;
    const s = this.bedStand?.(bed) || (() => { const b = besideItem(this, bed) || { x: bed.cx + 1, z: bed.cz, face: { x: bed.cx, z: bed.cz - 2 } }; return { x: b.x * T, z: b.z * T, face: { x: b.face.x * T, z: b.face.z * T } }; })();
    const f = s.face || { x: s.x, z: s.z - 1 };
    return { x: s.x, z: s.z, y: this.floorY(s.x, s.z) + this.rig.player.eyeY, yaw: Math.atan2(-(f.x - s.x), -(f.z - s.z)) };
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
    fx?.clear();
    this.wakeMuff?.dispose();
    this.wakeSway = null;
    if (this.wakeVignette !== undefined) this.post.vignette = this.wakeVignette;
    if (this.fov0) { this.camera.fov = this.fov0; this.camera.updateProjectionMatrix(); }
    const end = this.besideBed(this.wakeBed);
    if (end && c) { c.x = end.x; c.y = end.y; c.z = end.z; c.yaw = end.yaw; c.pitch = -0.05; c.roll = 0; }
    if (star?.rig) {
      // he's come over to your cot (his hammer left on the anvil)
      star.mode = 'idle';
      star.path = null;
      star.pauseT = 0;
      star.sparkK = 1;
      star.clangK = 1;
      star.setHammerDown?.();
      star.setPose('idle');
      const at = this.bedsideFor(star);
      star.pos.set(at.x, this.floorY(at.x, at.z), at.z);
      if (c) star.faceTo(c.x, c.z, true);
      this.moveStarBox?.();
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
    this.wakeFx?.clear();
    this.wakeMuff?.dispose();
    if (this.wakeVignette !== undefined) this.post.vignette = this.wakeVignette;
    this.post.fade = 0;
    ui.setTouchControls?.(true);
    if (this.hammer) this.hammer.style.visibility = '';
    if (ui.lookCatch) ui.lookCatch.style.visibility = '';
    ui.onboard?.cinema(false);
    // on your feet: you can look, walk and use things (nothing else is in yet)
    ui.unlock?.(['look', 'move', 'use']);
    // the lessons begin (the same flags, quest and acts as ever)
    sd.woke = true;
    g.quests?.start?.('lessons');
    st.emit('act', { type: 'lesson', step: 'wake' });
    st.emit('act', { type: 'talk', npc: 'oldstar' });
    this.setLesson('pick');
    this.takeStartPick?.();
    st.save();
    if (star?.rig) {
      star.scripted = false;
      star.sparkK = 1;
      star.clangK = 1;
      star.onBlow = null;
      star.workFace = null; // (back to his forge's anvil from here on)
      star.takeHammer?.();
      star.nextT = 999;
      star.faceTo(this.rig.player.pos.x, this.rig.player.pos.z);
    }
    // and now the first lesson: he heads back to his forge, and you follow (lessons.js)
    if (this.startHomeTutor) this.startHomeTutor('forgeGo');
    if (star?.rig) this.later(0.9, () => { if (this.lessonStage() === 'pick') this.placeStarForLesson(); });
  }

  /** Test hook: jump to the end of the waking-up scene (flags, the quest, the first lesson). */
  skipWake() {
    const st = this.game.state;
    st.flag('fallen', true);
    starData(st).woke = true;
    this.game.quests?.start?.('lessons');
    st.emit('act', { type: 'lesson', step: 'wake' });
    if (this.lessonStage() === 'wake') { this.setLesson('pick'); this.takeStartPick?.(); }
    if (this.wakeCut) { this.wakeCut.on = true; this.wakeCut.fire?.(); }
    this.wakeFx?.clear();
    this.wakeMuff?.dispose();
    if (this.wakeVignette !== undefined) this.post.vignette = this.wakeVignette;
    if (this.fov0) { this.camera.fov = this.fov0; this.camera.updateProjectionMatrix(); }
    this.post.fade = 0;
    this.waking = false;
    this.wakeSway = null;
    if (this.scripted) this.endScript();
    this.game.ui.onboard?.cinema(false);
    this.game.ui.setTouchControls?.(true);
    this.game.ui.unlock?.(['look', 'move', 'use']);
    const star = this.star;
    if (star) { star.workFace = null; star.onBlow = null; star.sparkK = 1; star.clangK = 1; star.scripted = false; }
    this.placeStarForLesson(true);
  }
}

// Waking up in your bed at Old Star's (home { from: 'fall' }), mixed into HomeScene. No splash,
// no fuss: you just wake. Dark; a slow heartbeat; the world comes back muffled, as if through
// water (a low-pass on the whole mix that opens as you come round). Heavy eyelids crack open on the
// beams over the bed, blurred, and sink shut again; a second, longer look, the head rolling a
// little on the pillow; a third, and the room comes into focus: the fire in the bedroom hearth,
// and Old Star crouched at it with a poker, his back to you. He hears you stir, straightens up,
// turns round and talks (the tutor card): who he is, how you came down through his ceiling, the
// million gold for the way up, and his offer to teach you. Then you sit up and get out of bed.
// The overlay (WakeFx) draws the lids as a dark mask with soft edges and lashes, warm where the
// light comes through them; the blur is a CSS filter on the canvas. Sets flags fallen + nugget,
// starts the `lessons` quest and emits lesson { step: 'wake' }.
import { el, clamp } from '../core/util.js';
import { starData } from './starData.js';

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
export class HomeWake {
  tickWakeFx(dt) {
    if (this.wakeFx) this.wakeFx.update(dt);
    if (this.waking && this.wakeSway) this.wakeSway(dt);
  }

  sniffSound() {
    const a = this.game.audio;
    for (let i = 0; i < 3; i++) a.noise({ color: 'pink', filter: 'bandpass', f: 1800, q: 2, dur: 0.06, vol: 0.12, delay: i * 0.11 });
  }

  /** Where Old Star tends the bedroom fire (meters): { x, z, face: { x, z } }. */
  hearthSpot() {
    const h = this.shell.hearth;
    return { x: h.x + 0.12, z: h.z - 0.92, face: { x: h.x, z: h.z } };
  }

  /** The whole waking-up scene. Resolves when you're up and the first lesson is set. */
  async wakeFromFall() {
    const g = this.game, st = g.state, a = g.audio, ui = g.ui, star = this.star;
    st.flag('fallen', true);
    st.flag('nugget', true);
    const sd = starData(st);
    sd.woke = false;
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
    // lying in bed, looking up at the beams
    if (bed) await this.lieDown(bed, true);
    const base = { yaw: c.yaw, pitch: 1.12, roll: 0.18 };
    c.pitch = base.pitch; c.roll = base.roll;
    fx.open = 0; fx.blur = 10; fx.glow = 0.35;
    const post0 = (this.wakeVignette = this.post.vignette);
    this.post.vignette = 0.95;
    this.post.fade = 0;
    // the head drifts on the pillow: a slow sway that settles as you come round
    const sway = { amp: 1, yaw: 0, pitch: 0, t: 0 };
    this.wakeSway = (dt) => {
      sway.t += dt;
      const s = sway.amp;
      c.yaw = base.yaw + sway.yaw + Math.sin(sway.t * 0.55) * 0.05 * s;
      c.pitch = base.pitch + sway.pitch + Math.sin(sway.t * 0.37 + 1) * 0.035 * s;
      c.roll = base.roll * (0.35 + 0.65 * s) + Math.sin(sway.t * 0.43 + 2) * 0.04 * s;
    };
    // Old Star crouched at the bedroom fire with the poker, his back to you
    if (star?.rig) {
      star.scripted = true;
      star.stand();
      const H = this.hearthSpot();
      star.pos.set(H.x, this.floorY(H.x, H.z), H.z);
      star.faceTo(H.face.x, H.face.z, true);
      star.setPose('poke');
      star.lean(0.32);
      star.spot = 'bedroom';
    }
    const lids = (to, secs) => { const from = fx.open; return this.tween(secs, (k) => { fx.open = from + (to - from) * ease(k); }); };
    const blurTo = (to, secs) => { const from = fx.blur; return this.tween(secs, (k) => { fx.blur = from + (to - from) * ease(k); }); };
    const glowTo = (to, secs) => { const from = fx.glow; return this.tween(secs, (k) => { fx.glow = from + (to - from) * ease(k); }); };
    const clear = (to, secs) => { const from = this.muffK ?? 0; return this.tween(secs, (k) => { this.muffK = from + (to - from) * ease(k); muff.set(this.muffK); }); };
    const look = (dyaw, dpitch, secs) => { const y0 = sway.yaw, p0 = sway.pitch; return this.tween(secs, (k) => { sway.yaw = y0 + (dyaw - y0) * ease(k); sway.pitch = p0 + (dpitch - p0) * ease(k); }); };
    this.muffK = 0;
    muff.set(0);

    // ---- dark, light glowing red through the lids, a heartbeat; then a crack of warm light on the
    // beams, blurred, slowly widening... and shut again
    glowTo(0.7, 1.4);
    await this.sleepFor(0.3);
    heartbeat(a, 2);
    await lids(0.05, 0.9);
    await this.sleepFor(0.5);
    breath(a, 0.04);
    clear(0.2, 2);
    await lids(0.2, 1.1);
    await this.sleepFor(0.7);
    await lids(0.02, 0.6);
    await this.sleepFor(0.9);
    // ---- the second, longer: the head rolls toward the fire, Old Star hums to himself
    heartbeat(a, 1, 0.1);
    clear(0.45, 2.2);
    blurTo(6, 1.6);
    look(0.25, -0.18, 2.6);
    await lids(0.42, 1.0);
    if (star?.rig) a.play('babble', { pitch: 150, n: 3, vol: 0.35 });
    await this.sleepFor(0.9);
    await lids(0.12, 0.45);
    await lids(0.36, 0.5);
    await this.sleepFor(0.5);
    await lids(0.0, 0.55);
    await this.sleepFor(0.6);
    // ---- the third: eyes open, the room comes into focus, the sound comes back
    clear(1, 2.6);
    blurTo(0, 2.4);
    glowTo(0, 1);
    this.tween(2.6, (k) => { this.post.vignette = 0.95 + (post0 - 0.95) * ease(k); });
    const fire = this.shell.hearth;
    const towards = Math.atan2(-(fire.x - c.x), -(fire.z - c.z));
    const dYaw = Math.atan2(Math.sin(towards - base.yaw), Math.cos(towards - base.yaw));
    look(dYaw * 0.85, -0.95, 2.4);
    await lids(0.7, 1.0);
    await lids(0.5, 0.18); // a flutter
    await lids(1, 0.5);
    this.tween(1.6, (k) => { sway.amp = 1 - ease(k) * 0.7; });
    a.play('creak', { vol: 0.25 }); // the bed creaks as you stir
    await this.sleepFor(0.9);
    // ---- he hears you: straightens up, turns round
    if (star?.rig) {
      const r = star;
      this.tween(0.6, (k) => { r.lean(0.32 * (1 - ease(k))); });
      r.setPose('idle');
      await this.sleepFor(0.3);
      r.faceTo(c.x, c.z);
      r.sniff();
      this.sniffSound();
      await this.sleepFor(0.5);
      r.gesture('wave', 1.4);
    } else await this.sleepFor(0.6);
    const say = (text, mood) => (star?.rig ? star.say(text, { mood, wait: true }) : ui.tutor?.say(text, { mood, wait: true }));
    await say('Ah! You\'re awake. Easy, easy. Don\'t sit up too fast: the room likes to spin the first time.', 'happy');
    star?.rig && star.gesture('point', 1.6);
    await say('You came down through my ceiling last night, you and a hen in a walking house. Out cold, you were. I put you to bed. This room\'s yours now.', 'calm');
    await say('I\'m <b>Old Star</b>. Blacksmith, once, up top. Been stuck down here sixty years, give or take a winter.', 'calm');
    await say('I was <b>this</b> close to getting out. The way up is the Surface Express, from Deep Town. A ticket costs a <span class="gold-txt">million gold</span>. I had near half of it once. Long story. Don\'t ask.', 'worried');
    await say('So here\'s my offer. I\'m too old to swing a pick all day, but you\'re young. I\'ll teach you to <b>dig</b>, to <b>forge</b> and to <b>cook</b>. We earn that million together, and we <b>both</b> ride out of here.', 'proud');
    if (this.nug) { a.play('cluck', { n: 2 }); this.nugEmote?.('♥'); }
    await say('Your hen\'s fine, by the way. She\'s made herself at home in the corner. Up you get, then: the kettle\'s on downstairs.', 'happy');
    // ---- sit up and get out of bed
    this.wakeSway = null;
    sway.amp = 0;
    a.play('step', { mat: 'wood' });
    if (bed) await this.getUp(bed);
    else await this.tween(0.7, (k) => { c.pitch = c.pitch * (1 - k); c.roll = c.roll * (1 - k); });
    c.roll = 0;
    this.endScript();
    this.unstick();
    this.waking = false;
    fx.open = 1; fx.blur = 0;
    muff.dispose();
    this.post.vignette = post0;
    ui.setTouchControls?.(true);
    if (this.hammer) this.hammer.style.visibility = '';
    if (lc) lc.style.visibility = '';
    // the lessons begin
    sd.woke = true;
    g.quests?.start?.('lessons');
    st.emit('act', { type: 'lesson', step: 'wake' });
    st.emit('act', { type: 'talk', npc: 'oldstar' });
    this.setLesson('mine');
    st.save();
    if (star?.rig) {
      star.scripted = false;
      star.faceTo(this.rig.player.pos.x, this.rig.player.pos.z);
      star.gesture('point', 2.5);
      star.say('First lesson: mining. The cage lift is in the hall, through the living room downstairs. It goes straight down to my practice dig. Bring me back some <b>copper ore</b>: the orange specks in the rock.', { mood: 'calm' });
      this.later(1.6, () => this.placeStarForLesson());
    }
    if (this.nug) { this.nug.ai.wake?.(); }
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
    if (this.wakeFx) { this.wakeFx.open = 1; this.wakeFx.blur = 0; }
    this.wakeMuff?.dispose();
    if (this.wakeVignette !== undefined) this.post.vignette = this.wakeVignette;
    this.post.fade = 0;
    this.waking = false;
    this.wakeSway = null;
    if (this.scripted) this.endScript();
    this.game.ui.setTouchControls?.(true);
    this.placeStarForLesson(true);
  }
}


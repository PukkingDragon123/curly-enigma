// Waking up in Old Star's cave (home { from: 'fall' }), mixed into HomeScene. Darkness, a heartbeat;
// heavy eyelids open a crack on a blurred roof (the hole you came through, roots, dust) and close;
// a muffled voice; a star-nosed face leans in over you, blurred; footsteps away, water scooped,
// footsteps back... then a bucket of cold quench water in the face: a white splash across the
// screen, a gasp, a shiver, and the view snaps sharp as you sit up. Old Star laughs, tells you who
// he is, why he needs a million gold, and offers to teach you. Sets flags fallen + nugget, starts
// the `lessons` quest and emits lesson { step: 'wake' }. The overlays (eyelids, water on the
// screen, the blur) are WakeFx; splashFace() at the trough reuses the water.
import * as THREE from 'three';
import { el, rand, clamp } from '../core/util.js';
import { HALL, HOLE, T } from './units.js';
import { MOUND } from './caveRock.js';
import { SPOTS } from './cave.js';
import { starData } from './starData.js';

const ease = (k) => k * k * (3 - 2 * k);
const _v = new THREE.Vector3();

// ---------------------------------------------------------------- overlays
/** Eyelids and water on the lens, drawn in big pixels over the view; the blur is a CSS filter on the canvas. */
export class WakeFx {
  constructor(game) {
    this.game = game;
    this.open = 1;
    this.blur = 0;
    this.drops = [];
    this.sheet = 0;
    this.c = el('canvas', { class: 'pix', style: { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3, imageRendering: 'pixelated' } });
    this.ctx = this.c.getContext('2d');
    game.ui.root.insertBefore(this.c, game.ui.root.querySelector('.tutor'));
    this.resize();
  }

  resize() {
    const W = 200, a = window.innerHeight / Math.max(1, window.innerWidth);
    this.W = W; this.H = Math.max(80, Math.round(W * a));
    this.c.width = this.W; this.c.height = this.H;
  }

  /** A bucketful (k = 1) or a splash from the trough (k ≈ 0.4). */
  splash(k = 1) {
    this.sheet = Math.max(this.sheet, k);
    const n = Math.round(70 * k);
    for (let i = 0; i < n; i++) {
      this.drops.push({ x: rand(0, this.W), y: rand(-10, this.H), r: rand(1.5, 5.5) * (0.6 + k * 0.5), vy: rand(2, 9), life: rand(1.5, 4.5), t: 0, wob: rand(0, 6) });
    }
  }

  update(dt) {
    const g = this.ctx, W = this.W, H = this.H;
    g.clearRect(0, 0, W, H);
    // water: a white-blue sheet that drains away, beads that slide down leaving trails
    if (this.sheet > 0.01) {
      g.fillStyle = `rgba(200,230,255,${Math.min(0.85, this.sheet * 0.8)})`;
      g.fillRect(0, 0, W, H);
      this.sheet = Math.max(0, this.sheet - dt * 1.8);
    }
    this.drops = this.drops.filter((d) => (d.t += dt) < d.life);
    for (const d of this.drops) {
      d.vy = Math.max(1, d.vy - dt * 1.5);
      d.y += d.vy * dt * (d.r > 3 ? 3 : 1.5);
      d.x += Math.sin(d.t * 3 + d.wob) * dt * 2;
      const a = 1 - d.t / d.life;
      // the trail
      g.fillStyle = `rgba(170,210,240,${0.22 * a})`;
      g.fillRect(Math.round(d.x - d.r * 0.3), Math.round(d.y - d.r * 4), Math.max(1, Math.round(d.r * 0.6)), Math.round(d.r * 4));
      // the bead: a rim, a body, a glint
      const r = Math.round(d.r);
      g.fillStyle = `rgba(60,90,120,${0.5 * a})`;
      g.fillRect(Math.round(d.x - r), Math.round(d.y - r), r * 2, r * 2);
      g.fillStyle = `rgba(190,225,250,${0.55 * a})`;
      g.fillRect(Math.round(d.x - r + 1), Math.round(d.y - r + 1), Math.max(1, r * 2 - 2), Math.max(1, r * 2 - 2));
      g.fillStyle = `rgba(255,255,255,${0.9 * a})`;
      g.fillRect(Math.round(d.x - r + 1), Math.round(d.y - r + 1), 1, 1);
    }
    // eyelids: dark, warm where the light comes through, ragged with lashes
    const k = clamp(this.open, 0, 1);
    if (k < 0.999) {
      const mid = H / 2, reach = mid * (1 - k) + 1;
      for (let x = 0; x < W; x++) {
        const u = (x - W / 2) / (W / 2);
        const curve = (1 - u * u) * H * 0.12 * k;
        const top = Math.round(reach + curve), bot = Math.round(H - reach - curve);
        for (const [y0, y1, dir] of [[0, top, 1], [bot, H, -1]]) {
          g.fillStyle = '#0c0406';
          g.fillRect(x, y0, 1, Math.max(0, y1 - y0));
          // the rosy rim where light seeps through, dithered
          const rim = dir > 0 ? y1 : y0;
          for (let j = 0; j < 6; j++) {
            const yy = rim - dir * (j + 1);
            if ((x + j) % 2 === 0 || j < 2) { g.fillStyle = `rgba(${90 - j * 10},${24 - j * 3},${20 - j * 2},${0.9 - j * 0.12})`; g.fillRect(x, yy, 1, 1); }
          }
          if (dir > 0 && x % 5 === 0 && k > 0.05) { g.fillStyle = '#0c0406'; g.fillRect(x, rim, 1, 2 + (x % 3)); } // lashes
        }
      }
      if (k < 0.03) { g.fillStyle = '#0c0406'; g.fillRect(0, 0, W, H); }
    }
    // the blur and the dim on the canvas itself
    const canvas = this.game.canvas;
    const b = this.blur;
    canvas.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px) brightness(${(1 - Math.min(0.35, b * 0.03)).toFixed(3)})` : '';
    return this.drops.length > 0 || this.sheet > 0 || k < 0.999 || b > 0.05;
  }

  dispose() {
    this.c.remove();
    this.game.canvas.style.filter = '';
  }
}

// ---------------------------------------------------------------- sounds
function gasp(a) {
  a.noise({ color: 'pink', filter: 'bandpass', f: 700, f2: 2600, q: 1.1, dur: 0.38, a: 0.02, vol: 0.32 });
  a.tone({ f: 260, f2: 640, type: 'triangle', dur: 0.28, vol: 0.06 });
}
function shiver(a, secs = 1.4) {
  for (let t = 0; t < secs; t += 0.065) a.noise({ filter: 'bandpass', f: 2800 + Math.random() * 900, q: 4, dur: 0.018, vol: 0.06 * (1 - t / secs), delay: t });
  a.tone({ f: 170, f2: 150, type: 'sawtooth', dur: secs * 0.8, vol: 0.025, filter: 'lowpass', ff: 600, vib: 22, vibRate: 26, delay: 0.1 });
}
function heartbeat(a, n = 2) {
  for (let i = 0; i < n; i++) {
    a.tone({ f: 58, f2: 42, type: 'sine', dur: 0.16, vol: 0.18, delay: i * 0.9 });
    a.tone({ f: 52, f2: 40, type: 'sine', dur: 0.14, vol: 0.12, delay: i * 0.9 + 0.22 });
  }
}

// ---------------------------------------------------------------- the scene
export class HomeWake {
  /** Water on your face (the splash overlay), k 0..1. */
  wetFace(k = 0.5) {
    if (!this.wakeFx) { this.wakeFx = new WakeFx(this.game); this.own(() => { this.wakeFx?.dispose(); this.wakeFx = null; }); }
    this.wakeFx.splash(k);
  }

  tickWakeFx(dt) {
    if (this.wakeFx) this.wakeFx.update(dt);
  }

  sniffSound() {
    const a = this.game.audio;
    for (let i = 0; i < 3; i++) a.noise({ color: 'pink', filter: 'bandpass', f: 1800, q: 2, dur: 0.06, vol: 0.12, delay: i * 0.11 });
  }

  /** The whole waking-up scene. Resolves when you're standing and the first lesson is set. */
  async wakeFromFall() {
    const g = this.game, st = g.state, a = g.audio, ui = g.ui, star = this.star;
    st.flag('fallen', true);
    st.flag('nugget', true);
    const sd = starData(st);
    sd.woke = false;
    if (!this.wakeFx) { this.wakeFx = new WakeFx(g); this.own(() => { this.wakeFx?.dispose(); this.wakeFx = null; }); }
    const fx = this.wakeFx;
    ui.setTouchControls?.(false);
    this.hammer && (this.hammer.style.visibility = 'hidden');
    // no "click to look around" card over your eyelids: it's a cutscene till you're on your feet
    const lc = ui.lookCatch;
    if (lc) { lc.style.visibility = 'hidden'; this.own(() => { lc.style.visibility = ''; }); }
    this.beginScript(false);
    this.waking = true;
    const c = this.cam;
    // lying on the rubble, looking up at the hole you came through
    const gx = MOUND.x - 0.05, gz = MOUND.z + 0.62;
    const gy = this.cave.ground(gx, gz);
    c.x = gx; c.z = gz; c.y = gy + 0.16; c.yaw = 0.15; c.pitch = 1.18; c.roll = 0.2;
    fx.open = 0; fx.blur = 9;
    this.post.fade = 1;
    // Old Star crouched by you, leaning in (not seen yet)
    let bucketObj = null;
    if (star?.rig) {
      star.scripted = true;
      star.stand();
      star.pos.set(gx + 0.42, this.cave.ground(gx + 0.42, gz - 0.38), gz - 0.38);
      star.faceTo(gx, gz, true);
      star.setPose('idle');
      star.body.rotation.x = 0.55;
      star.body.position.z = 0;
    }
    const leanBack = () => { if (star?.rig) this.tween(0.6, (k) => { star.body.rotation.x = 0.55 * (1 - ease(k)); }); };
    const lids = (to, secs) => { const from = fx.open; return this.tween(secs, (k) => { fx.open = from + (to - from) * ease(k); }); };
    const blurTo = (to, secs) => { const from = fx.blur; return this.tween(secs, (k) => { fx.blur = from + (to - from) * ease(k); }); };
    const mumble = (html, secs) => { ui.tutor?.say(html, { muffled: true, mood: 'worried', dur: secs + 0.6, place: 'top' }); return this.sleepFor(secs); };

    await this.sleepFor(0.8);
    heartbeat(a, 2);
    this.tween(1.2, (k) => { this.post.fade = 1 - k; });
    await this.sleepFor(1.6);
    // a crack of light: the roof, the hole, roots, blurred
    await lids(0.22, 0.9);
    this.fx.dust(HOLE.x, this.holeTop - 0.2, HOLE.z, 6, [0.4, 0.3, 0.22], 0.2);
    await this.sleepFor(1.0);
    await lids(0, 0.45);
    await mumble('…hey. <i>Hey.</i> Can you hear me?', 2.4);
    // eyes open a little more: a face over yours, a pink star of a nose, spectacles
    heartbeat(a, 1);
    c.yaw += 0.35; c.pitch = 0.95;
    await lids(0.42, 0.8);
    star?.sniff();
    this.sniffSound();
    await mumble('Out cold. Sixty years nobody drops in, and then a whole hen house comes through my roof.', 3.2);
    await lids(0.05, 0.7);
    // footsteps going off, water scooped, footsteps coming back
    if (star?.rig) {
      leanBack();
      const T0 = SPOTS.trough;
      star.walkTo(T0.x - 0.55, T0.z + 0.9, 1.4).then(() => {});
      for (let i = 0; i < 6; i++) this.later(i * 0.35, () => a.play('step', { vol: 0.25 - i * 0.03, mat: 'stone' }));
      await lids(0.18, 0.5);
      await this.sleepFor(0.6);
      await lids(0.02, 0.4);
      await mumble('Right. This\'ll do it.', 1.6);
      // (he's far off: put him at the trough and bring him back with the bucket)
      star.path = null; star.mode = 'idle';
      star.pos.set(T0.x - 0.5, this.cave.ground(T0.x - 0.5, T0.z + 0.8), T0.z + 0.8);
      a.play('splash', { vol: 0.35 });
      this.cave.ripple('trough', T0.x, T0.z, 1.5);
      const b = this.cave.dyn.bucket;
      bucketObj = new THREE.Group();
      bucketObj.scale.setScalar(T);
      if (b?.obj) { b.obj.parent?.remove(b.obj); b.obj.position.set(0, 0, 0); b.obj.rotation.set(0, 0, 0); bucketObj.add(b.obj); }
      star.carry(bucketObj);
      star.pos.set(gx + 0.55, this.cave.ground(gx + 0.55, gz - 0.55), gz - 0.55);
      star.faceTo(gx, gz, true);
      for (let i = 0; i < 4; i++) this.later(i * 0.32, () => a.play('step', { vol: 0.12 + i * 0.05, mat: 'stone' }));
      await this.sleepFor(1.3);
    } else await this.sleepFor(2);
    // eyes open: there he is with the bucket raised
    c.yaw = Math.atan2(-((star?.pos.x ?? gx + 0.5) - c.x), -((star?.pos.z ?? gz - 0.5) - c.z)); c.pitch = 0.6;
    await lids(0.5, 0.5);
    await blurTo(5, 0.4);
    // the throw: the bucket swings up and over, the water comes at you
    if (star?.rig) {
      const r = star.rig;
      star.carrying = null; // (stop the carry pose; keep the bucket in his paws for the swing)
      await this.tween(0.45, (k) => { const e = ease(k); r.armL && r.armL.rotation.set(-1.0 - e * 1.6, 0, 0.25); r.armR && r.armR.rotation.set(-1.0 - e * 1.6, 0, -0.25); bucketObj.position.set(0, 0.3 + e * 0.32, 0.2 - e * 0.1); bucketObj.rotation.x = -e * 0.5; });
      a.play('whoosh', { vol: 0.8 });
      const from = star.pos.clone().add(_v.set(0, 0.75, 0));
      const to = new THREE.Vector3(c.x, c.y, c.z);
      for (let i = 0; i < 40; i++) {
        const t = rand(0.15, 0.35);
        const vx = (to.x - from.x) / t + rand(-0.6, 0.6), vz = (to.z - from.z) / t + rand(-0.6, 0.6), vy = (to.y - from.y) / t + 4.9 * t + rand(-0.4, 0.6);
        this.fx.droplet(from.x + rand(-0.06, 0.06), from.y + rand(-0.04, 0.06), from.z + rand(-0.06, 0.06), vx, vy, vz, t + 0.3, [0.72, 0.9, 1], rand(0.012, 0.022));
      }
      this.tween(0.25, (k) => { const e = ease(k); bucketObj.rotation.x = -0.5 - e * 1.9; bucketObj.position.z = 0.1 + e * 0.15; });
      await this.sleepFor(0.24);
    }
    // SPLASH
    fx.splash(1);
    this.post.flashColor = 0xd8f0ff;
    this.post.flash = 0.85;
    this.tween(0.9, (k) => { this.post.flash = 0.85 * (1 - k) * (1 - k); }).then(() => { this.post.flash = 0; });
    a.play('splash', { vol: 1 });
    a.noise({ color: 'white', filter: 'lowpass', f: 2200, f2: 600, dur: 0.6, vol: 0.3 });
    gasp(a);
    this.rig.shake(0.6);
    this.rig.vm?.impact('none', 0.6);
    fx.open = 1;
    blurTo(0, 0.55);
    // sit bolt upright
    const p0 = c.pitch, y0 = c.y, r0 = c.roll;
    await this.tween(0.32, (k) => { const e = 1 - (1 - k) ** 3; c.pitch = p0 + (-0.12 - p0) * e; c.y = y0 + 0.24 * e; c.roll = r0 * (1 - e); });
    shiver(a, 1.5);
    const shiverT = { t: 1.5 };
    const shiverTick = (dt) => { shiverT.t -= dt; c.roll = Math.sin(this.time * 47) * 0.012 * Math.max(0, shiverT.t); c.yaw += Math.sin(this.time * 61) * 0.0015 * Math.max(0, shiverT.t); if (shiverT.t <= 0) { this.tickers.splice(this.tickers.indexOf(shiverTick), 1); c.roll = 0; } };
    this.tickers.push(shiverTick);
    // face him
    if (star?.rig) {
      const yaw = Math.atan2(-(star.pos.x - c.x), -(star.pos.z - c.z));
      const yw0 = c.yaw, dy = Math.atan2(Math.sin(yaw - yw0), Math.cos(yaw - yw0));
      this.tween(0.6, (k) => { c.yaw = yw0 + dy * ease(k); c.pitch += (0.05 - c.pitch) * 0.12; });
      // the bucket comes down, upside down, and he laughs
      this.tween(0.4, (k) => { bucketObj.rotation.x = -2.4 + ease(k) * 0.4; bucketObj.position.y = 0.62 - ease(k) * 0.4; });
      star.rig.play?.('laugh');
      star.gestureT = 1.6;
      a.play('laugh', { pitch: 260 });
    }
    await this.sleepFor(0.5);
    const say = (text, mood) => (star?.rig ? star.say(text, { mood, wait: true }) : ui.tutor?.say(text, { mood, wait: true }));
    await say('Ha! <b>That</b> got you. Quench water, straight off my forge: cold as the deep. Needed it for the forge anyway.', 'laugh');
    // he sets the bucket down by his feet
    if (star?.rig && bucketObj) {
      const b = star.drop();
      if (b) { b.position.set(star.pos.x + 0.25, star.pos.y, star.pos.z + 0.2); b.rotation.set(0, 0.6, 0); b.scale.setScalar(T); this.scene.add(b); this.wakeBucket = b; }
      a.play('clunk', { vol: 0.4 });
      star.setPose('idle');
    }
    await say('Easy, easy. You came down through my roof, you and that walking hen house of yours. Landed right there, on the rubble.', 'calm');
    star?.gesture('point', 2);
    await say('I\'m <b>Old Star</b>. Blacksmith, once, up top. Been stuck down here sixty years, give or take a winter.', 'calm');
    await say('I was <b>this</b> close to getting out. The way up is the Surface Express, from Deep Town. A ticket costs a <span class="gold-txt">million gold</span>. I had near half of it once. Long story. Don\'t ask.', 'worried');
    await say('So here\'s my offer. I\'m too old to swing a pick all day, but you\'re young. I\'ll teach you to <b>dig</b>, to <b>forge</b> and to <b>cook</b>. We earn that million together, and we <b>both</b> ride out of here.', 'proud');
    await say('Your hen\'s fine, by the way. She\'s already found the side chamber up the steps. That\'s yours now: your bed\'s in there.', 'happy');
    // stand up
    a.play('land', { vol: 0.4 });
    const ty = this.cave.ground(c.x, c.z) + this.rig.player.eyeY, ya = c.y;
    await this.tween(0.7, (k) => { c.y = ya + (ty - ya) * ease(k); c.pitch += (-0.05 - c.pitch) * 0.1; });
    this.endScript();
    this.unstick();
    this.waking = false;
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
      star.gesture('point', 2.5);
      star.say('First lesson: mining. The cage lift, over there by the cart. It goes straight down to my practice dig. Bring me back some <b>copper ore</b>: the orange specks in the rock.', { mood: 'calm' });
      this.later(1.2, () => this.placeStarForLesson());
    }
    // put his bucket back by the trough when you're not looking
    this.later(20, () => this.returnBucket());
  }

  returnBucket() {
    const b = this.wakeBucket, d = this.cave.dyn.bucket;
    if (!b || !d) return;
    this.scene.remove(b);
    const inner = b.children[0];
    if (inner) { b.remove(inner); inner.position.set(d.home.x / T, this.cave.ground(d.home.x, d.home.z) / T, d.home.z / T); inner.rotation.set(0, 0.4, 0); this.room.add(inner); }
    this.wakeBucket = null;
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
    this.post.fade = 0;
    this.waking = false;
    if (this.scripted) this.endScript();
    this.game.ui.setTouchControls?.(true);
    this.placeStarForLesson(true);
  }
}

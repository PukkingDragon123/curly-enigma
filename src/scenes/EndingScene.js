// The ending: farewell at Deep Town's lift → the long ride up through every stratum →
// a blinding first glimpse of the sun (sunglasses on) → a sunset beach with Nugget, where
// the camera finally turns. Works with ?scene=ending&fresh=1; dev: &phase=farewell|ascent|surface|beach|credits&at=secs
import * as THREE from 'three';
import { Scene, disposeObject } from '../core/Scene.js';
import { el, clamp } from '../core/util.js';
import { useBookendStyles } from '../bookends/css.js';
import { disposeTextures } from '../bookends/fx.js';
import { makeMole, makeChicken } from '../bookends/actors.js';
import { makeCage } from '../bookends/cage.js';
import { makeSunglasses } from '../bookends/props.js';
import { buildLanding } from '../bookends/landing.js';
import { buildShaft, SHAFT_ZONES } from '../bookends/shaft.js';
import { buildBeach } from '../bookends/beach.js';
import { buildCredits } from '../bookends/credits.js';
import { HEART } from '../ui/UI.js';

const PHASES = ['farewell', 'ascent', 'surface', 'beach'];
const SURFACE_DUR = 4.2;
const BEACH_LINE_AT = 4.2;
const BEACH_LINE_OFF = 10.5;
const CREDITS_AT = 11.8;

const POST = {
  farewell: { vignette: 0.42, tint: 0xfff0e0, saturation: 1.1, contrast: 1.05, brightness: 1 },
  ascent: { vignette: 0.5, tint: 0xffffff, saturation: 1.1, contrast: 1.05, brightness: 1 },
  surface: { vignette: 0.2, tint: 0xfff6ee, saturation: 1.12, contrast: 1.04, brightness: 1.04 },
  beach: { vignette: 0.16, tint: 0xfff0e4, saturation: 1.16, contrast: 1.05, brightness: 1.02 },
};

export default class EndingScene extends Scene {
  async enter(params = {}) {
    this.hud = 'none';
    this.allowMenus = false;
    this.music = null;
    this.params = params;
    this.textures = [];
    this.bubbles = [];
    this.bubbleId = 0;
    this.wantLoops = {};
    this.loops = {};
    this.own(useBookendStyles());
    this.own(() => disposeTextures(this.textures));

    const st = this.game.state;
    st.flag('endingSeen', true);
    st.save();

    // the travellers and their ride, shared across every phase
    this.mole = makeMole();
    this.hen = makeChicken({ hat: 'straw' });
    this.cage = makeCage();
    this.shades = makeSunglasses(this.mole.s);
    this.shades.visible = false;
    this.mole.neck.add(this.shades);
    this.shadesRest = new THREE.Vector3(0, 6 * this.mole.s + (this.mole.eyeDrop ? 0 : this.mole.s), 6.6 * this.mole.s);
    this.shades.position.copy(this.shadesRest);

    const ctx = { mole: this.mole, hen: this.hen, cage: this.cage, shades: this.shades, textures: this.textures, game: this.game };
    this.views = { farewell: buildLanding(ctx), ascent: buildShaft(ctx), beach: buildBeach(ctx) };
    this.allScenes = [this.views.farewell.scene, this.views.ascent.scene, this.views.beach.scene];
    this.api = this.makeApi();
    this.buildDom();
    this.onResize(this.game.engine.width, this.game.engine.height);
    for (const v of Object.values(this.views)) {
      try { this.game.engine.renderer.compile(v.scene, v.camera); } catch (e) { /* optional */ }
    }

    let start = params.phase;
    let at = parseFloat(params.at) || 0;
    if (start === 'credits') { start = 'beach'; at = Math.max(at, CREDITS_AT); }
    if (!PHASES.includes(start)) start = 'farewell';
    this.setPhase(start);
    if (at > 0) for (let k = 0; k < at; k += 1 / 30) this.update(1 / 30);
  }

  // ------------------------------------------------------------------ phases
  setPhase(name) {
    this.phase = name;
    this.phaseT = 0;
    const v = this.views;
    const audio = this.game.audio;
    this.clearBubbles();
    for (const k of Object.keys(this.post)) delete this.post[k];
    Object.assign(this.post, POST[name], { fade: 0, flash: 0, flashColor: 0xffffff });
    if (name === 'farewell') {
      v.farewell.enter();
      this.useView(v.farewell.scene, v.farewell.camera);
      audio.playMusic('town');
    } else if (name === 'ascent') {
      v.ascent.enter();
      this.useView(v.ascent.scene, v.ascent.camera);
      audio.playMusic('ascent');
      this.startLoop('elevator', 0.55);
      this.post.fade = 1;
      this.depthEl.hidden = false;
      this.zbar.hidden = false;
    } else if (name === 'surface') {
      v.beach.enterSurface();
      this.useView(v.beach.scene, v.beach.surfaceCamera);
      audio.stopMusic(0.6);
      this.stopLoop('elevator');
      audio.play('whoosh');
      this.post.flash = 1;
      this.depthEl.hidden = true;
      this.zbar.hidden = true;
    } else if (name === 'beach') {
      this.shades.visible = true;
      this.shades.position.copy(this.shadesRest);
      this.cage.setGate(0);
      v.beach.enterBeach();
      this.useView(v.beach.scene, v.beach.camera);
      audio.playMusic('beach');
      this.stopLoop('elevator');
      this.startLoop('waves', 0.7);
      this.post.flash = 0.85;
      this.post.flashColor = 0xfff2dc;
      this.depthEl.hidden = true;
      this.zbar.hidden = true;
      this.skipBtn.hidden = true;
    }
  }

  useView(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.onResize(this.game.engine.width, this.game.engine.height);
  }

  skip() {
    if (this.phase !== 'beach') {
      this.game.audio.play('whoosh');
      this.setPhase('beach');
      this.post.flash = 1;
      return;
    }
    if (this.credits.shown && !this.credits.done) this.credits.finish();
  }

  // ------------------------------------------------------------------ api for phase modules
  makeApi() {
    const self = this;
    return {
      audio: this.game.audio,
      post: this.post,
      say: (member, html, life = 2) => self.trackBubble(member.rig, html, { life, name: member.name }),
      heart: (member) => {
        const img = `<img class="pix" alt="" src="${HEART()}" style="display:block;width:calc(var(--px) * 7);height:calc(var(--px) * 7)">`;
        self.trackBubble(member.rig, img, { life: 0.85, emote: true, dx: (Math.random() - 0.5) * 18, dy: -Math.random() * 10 });
        if (Math.random() < 0.25) self.game.audio.play('emote', { kind: 'love' });
      },
      startLoop: (name, vol) => self.startLoop(name, vol),
      stopLoop: (name) => self.stopLoop(name),
      setLoopVol: (name, vol) => { self.wantLoops[name] = vol; const h = self.loops[name]; if (h && h.alive) h.set({ vol }); },
      alive: () => !self.dead,
      setDepth: (m, zone, k) => self.setDepth(m, zone, k),
      toScreen: (v) => self.toScreen(v),
    };
  }

  startLoop(name, vol = 1) {
    this.wantLoops[name] = vol;
    this.ensureLoops();
  }

  stopLoop(name) {
    delete this.wantLoops[name];
    const h = this.loops[name];
    if (h) { h.stop(0.6); delete this.loops[name]; }
  }

  ensureLoops() {
    const ctx = this.game.audio.ctx;
    if (!ctx || ctx.state !== 'running') return;
    for (const [name, vol] of Object.entries(this.wantLoops)) {
      const h = this.loops[name];
      if (!h || !h.alive) this.loops[name] = this.game.audio.loop(name, { vol, fadeIn: 0.6 });
    }
  }

  // ------------------------------------------------------------------ bubbles
  headScreen(rig, b) {
    const v = new THREE.Vector3();
    rig.root.getWorldPosition(v);
    v.y += rig.height * 1.05 + 0.18;
    const p = this.toScreen(v);
    if (b) { p.x += b.dx || 0; p.y += b.dy || 0; }
    return p;
  }

  trackBubble(rig, html, opts) {
    const key = 'end' + this.bubbleId++;
    const b = { key, rig, until: this.time + (opts.life || 2) + 0.4, dx: opts.dx, dy: opts.dy };
    const p = this.headScreen(rig, b);
    this.game.ui.bubble(key, html, p.x, p.y, { life: opts.life, emote: !!opts.emote, name: opts.name || null });
    this.bubbles.push(b);
  }

  updateBubbles() {
    if (!this.bubbles.length) return;
    for (const b of this.bubbles) {
      const p = this.headScreen(b.rig, b);
      this.game.ui.moveBubble(b.key, p.x, p.y, p.visible);
    }
    this.bubbles = this.bubbles.filter((b) => b.until > this.time);
  }

  clearBubbles() {
    for (const b of this.bubbles) this.game.ui.hideBubble(b.key);
    this.bubbles = [];
  }

  // ------------------------------------------------------------------ DOM
  buildDom() {
    const g = this.game;
    this.depthNum = el('span', {}, '400');
    this.zoneEl = el('div', { class: 'zone bk-outline' }, '');
    this.depthEl = el('div', { class: 'bk-depth', hidden: true }, [
      el('div', { class: 'lbl bk-outline' }, 'DEPTH'),
      el('div', { class: 'num' }, [this.depthNum, el('small', {}, 'm')]),
      this.zoneEl,
    ]);
    this.zbarMark = el('b');
    this.zbar = el('div', { class: 'bk-zbar', hidden: true, 'aria-hidden': 'true' }, [...SHAFT_ZONES.slice().reverse().map((z) => el('i', { style: { background: z.css } })), this.zbarMark]);
    this.line = el('div', { class: 'bk-line bk-outline' }, [el('span', { class: 'early' }, 'Finally... '), el('span', { class: 'late' }, 'sunshine.')]);
    this.veil = el('div', { class: 'bk-veil' });
    this.credits = buildCredits(g, {
      onRelax: () => this.relax(),
      onTown: () => this.leave('town'),
      onTitle: () => this.leave('title'),
    });
    const dockBtn = (label, fn) => el('button', { class: 'btn alt', type: 'button', onclick: () => { g.audio.play('ui_click'); fn(); } }, label);
    this.dock = el('div', { class: 'bk-dock' }, [
      dockBtn('Credits', () => this.showCredits()),
      dockBtn('Deep Town', () => this.leave('town')),
      dockBtn('Title', () => this.leave('title')),
    ]);
    this.skipBtn = el('button', { class: 'btn alt bk-skip', type: 'button', hidden: true, onclick: () => this.skip() }, 'Skip ›');
    this.root = el('div', { class: 'bk-root bk-ending' }, [this.veil, this.depthEl, this.zbar, this.line, this.credits.el, this.dock, this.skipBtn]);
    g.ui.world.append(this.root);
    this.own(() => this.root.remove());
    // hold a key / mouse button to hurry the credits along
    const fastOn = (e) => { if (e.target && e.target.closest && e.target.closest('button')) return; this.credits.fast = true; };
    const fastOff = () => { this.credits.fast = false; };
    const onKey = (e) => {
      if (e.code === 'Escape' && this.phase === 'beach' && this.relaxing) { this.showCredits(true); }
      if (e.code === 'Space' || e.code === 'Enter') fastOn(e);
    };
    window.addEventListener('pointerdown', fastOn);
    window.addEventListener('pointerup', fastOff);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', fastOff);
    this.own(() => {
      window.removeEventListener('pointerdown', fastOn);
      window.removeEventListener('pointerup', fastOff);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', fastOff);
    });
  }

  setDepth(m, zoneIdx, k) {
    const v = String(Math.max(0, Math.round(m)));
    if (this.depthNum.textContent !== v) this.depthNum.textContent = v;
    const z = SHAFT_ZONES[zoneIdx];
    if (z && this.zoneShown !== zoneIdx) {
      this.zoneShown = zoneIdx;
      this.zoneEl.textContent = z.name;
      this.zoneEl.style.color = z.css;
      this.zoneEl.classList.remove('pop');
      void this.zoneEl.offsetWidth;
      this.zoneEl.classList.add('pop');
    }
    this.zbarMark.style.top = `${(1 - clamp(k, 0, 1)) * 100}%`;
  }

  showCredits(toEnd = false) {
    this.relaxing = false;
    this.dock.classList.remove('on');
    this.veil.classList.add('on');
    this.credits.start();
    if (toEnd) this.credits.finish();
  }

  relax() {
    this.relaxing = true;
    this.credits.hide();
    this.veil.classList.remove('on');
    this.dock.classList.add('on');
  }

  leave(to) {
    if (this.leaving) return;
    this.leaving = true;
    this.game.goto(to, { from: 'ending' }, { transition: 'fade', dur: 0.8, color: to === 'title' ? 0x000000 : 0x000000 });
  }

  // ------------------------------------------------------------------ frame
  onResize(w, h) {
    const aspect = w / h;
    const cams = new Set([this.camera]);
    if (this.views) for (const v of Object.values(this.views)) for (const c of v.cameras || [v.camera]) cams.add(c);
    for (const c of cams) {
      if (!c || !c.isPerspectiveCamera) continue;
      c.aspect = aspect;
      c.updateProjectionMatrix();
    }
    if (this.views) for (const v of Object.values(this.views)) if (v.onResize) v.onResize(w, h);
  }

  update(dt) {
    super.update(dt);
    if (this.dead) return;
    this.phaseT += dt;
    const t = this.phaseT;
    const v = this.views;
    const post = this.post;
    if (this.phase !== 'beach' && t > 0.8) this.skipBtn.hidden = false;
    switch (this.phase) {
      case 'farewell': {
        v.farewell.update(dt, this.api);
        const d = v.farewell.duration;
        post.fade = clamp((t - (d - 0.55)) / 0.5, 0, 1);
        if (t >= d) this.setPhase('ascent');
        break;
      }
      case 'ascent': {
        v.ascent.update(dt, this.api);
        const d = v.ascent.duration;
        post.fade = clamp(1 - t / 0.5, 0, 1);
        post.flash = clamp((t - (d - 0.8)) / 0.7, 0, 1) ** 1.5;
        if (t >= d) this.setPhase('surface');
        break;
      }
      case 'surface': {
        v.beach.updateSurface(dt, this.api, t);
        if (t < 0.35) post.flash = 1;
        else if (t < 1.5) post.flash = 1 - smooth01((t - 0.35) / 1.15);
        else if (t > SURFACE_DUR - 0.6) { post.flashColor = 0xfff2dc; post.flash = smooth01((t - (SURFACE_DUR - 0.6)) / 0.6) * 0.9; }
        else post.flash = 0;
        if (t >= SURFACE_DUR) this.setPhase('beach');
        break;
      }
      case 'beach': {
        v.beach.updateBeach(dt, this.api, t);
        post.flash = t < 1.6 ? 0.85 * (1 - smooth01(t / 1.6)) : 0;
        if (t >= BEACH_LINE_AT && !this.lineShown) { this.lineShown = true; this.line.classList.add('on'); }
        if (t >= BEACH_LINE_OFF && this.lineShown && !this.lineHidden) { this.lineHidden = true; this.line.classList.remove('on'); }
        if (t >= CREDITS_AT && !this.creditsStarted) { this.creditsStarted = true; this.showCredits(); }
        this.credits.update(dt);
        break;
      }
      default: break;
    }
    this.updateBubbles();
    this.ensureLoops();
  }

  exit() {
    this.dead = true;
    for (const s of this.allScenes || []) if (s !== this.scene) disposeObject(s);
    super.exit();
  }
}

function smooth01(x) {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
}

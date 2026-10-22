// Title screen: a tough blacksmith mole forging in a cave (bookends/titleForge.js) behind the
// MOLEFORGE logo and a menu of carved wooden signs hanging from an iron wall bracket
// (ui/signs.js). Continue / New Game raises the signs out of the way and brings up the three save
// stones on a ledge (bookends/titleStones.js); the camera pushes in on the anvil meanwhile.
//
// Debug (scene.debug): openStones(), closeStones(), pick(i), fake(i, pct) (pretend slot i is at
// pct% to see the gem stages), smash(i) (play the delete animation), shot('menu'|'stones'),
// step(sec) (advance the diorama by hand), menu (the sign menu).
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { el } from '../core/util.js';
import { buildForgeCave } from '../bookends/titleForge.js';
import { makeSaveStones, GEMS } from '../bookends/titleStones.js';
import { useBookendStyles } from '../bookends/css.js';
import { logoLetters, glintURL } from '../bookends/logo.js';
import { disposeTextures, setPixelScale } from '../bookends/fx.js';
import { makeSignMenu } from '../ui/signs.js';
import { openSettings } from '../ui/PauseMenu.js';

const CONTINUE_OK = new Set(['town', 'home', 'forge', 'cooking']); // the mine and the deep fall back to home

const TITLE_CSS = /* css */`
.tt-left .tt-menu { margin-top: calc(var(--px) * 9); }
.tt-left { transition: opacity .35s; }
.bk-title.stones .tt-left { opacity: 0; }
.bk-title.stones .bk-controls, .bk-title.stones .bk-sound { visibility: hidden; }
.tt-back { position: absolute; left: 0; top: 0; }
@media (max-height: 520px) and (min-aspect-ratio: 5/4) {
  .tt-left .bk-logo { --lp: calc(var(--px) * 1.5); }
  .tt-left .bk-sub { margin-top: calc(var(--px) * 2.5); }
  .tt-left .tt-menu { margin-top: calc(var(--px) * 3); }
}
@media (max-aspect-ratio: 5/4) {
  .tt-left .tt-menu { margin-top: auto; }
  .bk-title .bk-sound { top: calc(var(--px) * 52 + env(safe-area-inset-top, 0px)); bottom: auto; }
}
`;

export default class TitleScene extends Scene {
  async enter(params = {}) {
    this.hud = 'none';
    this.music = 'title';
    this.allowMenus = false;
    this.params = params;
    // ember grade, hot glow on the fire, the blade and the sparks; shafts of light through the
    // forge smoke from the firepot
    this.post = {
      vignette: 0.55, saturation: 1.12, contrast: 1.08, tint: 0xfff0e4, levels: 40,
      grade: 'forge', gradeMix: 0.7, bloom: 0.9, bloomThreshold: 0.7, bloomRadius: 1.2,
      rays: 0.32, raysSky: 0, raysThreshold: 0.66, raysColor: 0xffb070, raysRadius: 0.55, raysDecay: 0.95,
      flash: 0, flashColor: 0xffd8a0,
    };
    this.textures = [];
    this.own(useBookendStyles());
    this.own(() => disposeTextures(this.textures));
    const style = document.createElement('style');
    style.textContent = TITLE_CSS;
    document.head.append(style);
    this.own(() => style.remove());

    this.camera = new THREE.PerspectiveCamera(32, this.game.engine.aspect, 0.1, 100);
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 32, init: false };
    this.shotName = 'menu';
    this.dio = await buildForgeCave(this.scene, this.textures, { audio: this.game.audio, standin: params.smith === 'standin' }); // ?smith=standin: the fallback mole
    this.post.raysPos = this.dio.fire.clone().add(new THREE.Vector3(0, 0.35, 0));
    const st = this.dio.stats;
    console.log(`[title] forge built in ${st.total.toFixed(0)} ms (cave grid ${st.grid.toFixed(0)} ms, shell ${st.shell.toFixed(0)} ms, ${Math.round(st.shellTris / 1000)}k tris, ${st.batches} batches; smith: ${this.dio.smith.kind})`);
    setPixelScale(this.game.engine.height);
    this.layoutCamera(this.game.engine.width, this.game.engine.height, true);
    this.fireLoop = this.game.audio.loop('forge_fire', { vol: 0.32 });
    this.own(() => this.fireLoop?.stop?.());

    this.buildDom();
    this.debug = this.makeDebug();
    try { this.game.engine.renderer.compile(this.scene, this.camera); } catch (e) { /* optional */ }
  }

  // ------------------------------------------------------------------ DOM
  buildDom() {
    const g = this.game;
    const word = 'MOLEFORGE';
    const cssVars = (e, vars) => { for (const [k, v] of Object.entries(vars)) e.style.setProperty(k, String(v)); return e; }; // el() can't set custom properties
    const letters = logoLetters().map((L, i) => cssVars(el('span', { class: L.hot ? 'hot' : '', 'aria-hidden': 'true' }, [
      el('img', { class: 'pix', src: L.url, alt: '', draggable: 'false', style: { width: `calc(var(--lp) * ${L.w})`, height: `calc(var(--lp) * ${L.h})` } }),
    ]), { '--i': i }));
    const glint = glintURL();
    const sparkles = [[1, 0.18, 0.22, 0], [8, 0.25, 0.12, 1.9], [5, 0.4, 0.05, 3.3]].map(([li, x, y, d]) => cssVars(el('img', { class: 'pix bk-glint', src: glint, alt: '', style: { animationDelay: `${2.6 + d}s` } }), { '--gl': li, '--gx': x, '--gy': y }));
    const embers = Array.from({ length: 9 }, (_, i) => el('i', { class: 'bk-ember', style: { left: `${46 + ((i * 37) % 52)}%`, animationDelay: `${(i * 0.53) % 2.6 + 2}s`, animationDuration: `${2.1 + (i % 4) * 0.35}s` } }));
    const logo = el('h1', { class: 'bk-logo', 'aria-label': word }, [...letters, ...sparkles, ...embers]);
    requestAnimationFrame(() => {
      for (const sp of sparkles) {
        const li = +sp.style.getPropertyValue('--gl');
        const L = letters[li];
        if (!L) continue;
        sp.style.left = `${L.offsetLeft + L.offsetWidth * +sp.style.getPropertyValue('--gx')}px`;
        sp.style.top = `${L.offsetTop + L.offsetHeight * +sp.style.getPropertyValue('--gy')}px`;
      }
    });
    const sub = el('div', { class: 'bk-sub bk-outline' }, [el('i'), 'One million gold to the surface', el('i')]);
    const menuSlot = el('div', { class: 'tt-menu' });
    const keys = [['WASD', 'move'], ['C', 'crouch/dive'], ['Mouse', 'dig/aim'], ['E', 'interact'], ['B', 'the book'], ['I', 'backpack'], ['Esc', 'menu']];
    const controls = el('div', { class: 'bk-controls bk-outline' });
    keys.forEach(([k, label], i) => {
      if (i) controls.append(el('span', { class: 'dot' }, '·'));
      controls.append(el('kbd', {}, k), label);
    });
    this.soundHint = el('div', { class: 'bk-sound bk-outline', role: 'status' }, [el('span', { class: 'bk-sound-in' }, [el('span', { class: 'note' }, '♪'), (window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 'tap' : 'click') + ' anywhere for sound'])]);
    this.left = el('div', { class: 'bk-left tt-left' }, [logo, sub, menuSlot]);
    this.root = el('div', { class: 'bk-root bk-title' }, [this.left, controls, this.soundHint]);
    g.ui.world.append(this.root);
    this.own(() => this.root.remove());
    this.audioOn = false;

    const anySave = g.state.listSlots().some((s) => s.used);
    const items = [
      { label: anySave ? 'Continue' : 'New Game', primary: true, onClick: () => this.openStones() },
      { label: 'Settings', onClick: () => this.openSettings() },
      { label: 'Credits', onClick: () => this.openCredits() },
    ];
    const short = window.innerHeight < 520 && window.innerWidth > window.innerHeight;
    this.menu = makeSignMenu(menuSlot, items, { audio: g.audio, layer: this.root, mount: 'bracket', label: 'Main menu', breeze: 0.35, gap: short ? 4 : 7, top: short ? 8 : 12 });
    this.own(() => this.menu.destroy());

    // the save stones
    this.stones = makeSaveStones(this.root, {
      audio: g.audio,
      slots: () => g.state.listSlots(),
      onPick: (i, info) => this.pickSlot(i, info),
      onDelete: (i) => g.ui.confirm(`<b>Smash save stone ${i + 1}?</b><br>The ${GEMS[i].name.toLowerCase()} and everything in it will be gone for good.`, 'Smash it', 'Keep it'),
      afterDelete: (i) => { g.state.deleteSlot(i); this.refreshMenu(); },
    });
    this.own(() => this.stones.destroy());
    this.onKey = (e) => {
      if (e.key === 'Escape' && this.stones.open && !g.ui.isPanelOpen()) { e.preventDefault(); this.closeStones(); }
    };
    window.addEventListener('keydown', this.onKey);
    this.own(() => window.removeEventListener('keydown', this.onKey));
  }

  /** The first sign reads Continue while any stone holds a save. */
  refreshMenu() {
    const anySave = this.game.state.listSlots().some((s) => s.used);
    const want = anySave ? 'Continue' : 'New Game';
    if (this.menu.items[0].label !== want) this.menu.setLabel(0, want);
  }

  openStones() {
    if (this.busy || this.stones.open) return;
    this.root.classList.add('stones');
    this.menu.raise(true);
    this.setShot('stones');
    this.stones.show();
    // a single sign to go back, dangling from the roof at the top left
    const holder = el('div', { class: 'tt-back' });
    holder.style.left = 'calc(var(--px) * 8 + env(safe-area-inset-left, 0px))';
    this.root.append(holder);
    this.backMenu = makeSignMenu(holder, [{ label: 'Back', onClick: () => this.closeStones() }], { audio: this.game.audio, layer: this.root, mount: 'ceiling', top: 4, label: 'Back', autofocus: false, breeze: 0.2 });
    this.backHolder = holder;
  }

  closeStones() {
    if (this.busy || !this.stones.open) return;
    this.stones.hide();
    this.root.classList.remove('stones');
    this.setShot('menu');
    this.backMenu?.raise(true);
    const bm = this.backMenu, bh = this.backHolder;
    setTimeout(() => { bm?.destroy(); bh?.remove(); }, 500);
    this.backMenu = null;
    this.menu.raise(false);
    setTimeout(() => this.menu.focus(0), 300);
  }

  pickSlot(i, info) {
    if (this.busy) return;
    const g = this.game, st = g.state;
    this.busy = true;
    if (info && info.used) {
      st.useSlot(i);
      // never fell yet (a save from before the opening): play the fall first
      if (!st.flag('fallen')) g.goto('fall');
      else g.goto(this.continueTarget(), { from: 'continue' });
    } else {
      // every new game opens with the fall: the ground gives way under the mole and Nugget
      st.useSlot(i, { fresh: true });
      g.goto('fall');
    }
  }

  /** lastScene || 'home', but never back into the title, the ending or a dev scene. */
  continueTarget() {
    const ls = this.game.state.flag('lastScene');
    return CONTINUE_OK.has(ls) ? ls : 'home';
  }

  openSettings() {
    openSettings(this.game, { onClose: () => setTimeout(() => this.menu.focus(1), 30) });
  }

  openCredits() {
    const body = el('div', { class: 'bk-credits-body' }, [
      el('p', {}, 'A tough little mole, a very good chicken, an old star-nosed smith, and one million gold between them and the sun.'),
      el('ul', {}, [
        el('li', {}, 'Made with Three.js'),
        el('li', {}, 'Every sound synthesized in the browser'),
        el('li', {}, 'All art procedurally generated'),
        el('li', {}, 'No external assets'),
      ]),
      el('p', { class: 'muted' }, 'Thank you for digging with us.'),
    ]);
    this.game.ui.openPanel({ title: 'Credits', sub: 'MOLEFORGE', body, onClose: () => setTimeout(() => this.menu.focus(2), 30) });
  }

  // ------------------------------------------------------------------ camera
  setShot(name) { this.shotName = name; }

  shot() {
    const aspect = this.camera.aspect;
    const set = this.dio.shots[this.shotName] || this.dio.shots.menu;
    return aspect >= 1.25 ? set.wide : set.tall;
  }

  layoutCamera(w, h, snap = false) {
    this.camera.aspect = w / h;
    const s = this.shot();
    if (snap || !this.cam.init) {
      this.cam.pos.copy(s.pos); this.cam.look.copy(s.look); this.cam.fov = s.fov; this.cam.init = true;
    }
    // dev: ?cam=x,y,z,lookX,lookY,lookZ[,fov] to inspect the diorama
    const dc = this.params && this.params.cam ? String(this.params.cam).split(',').map(Number) : null;
    if (dc && dc.length >= 6) {
      this.camFixed = { pos: new THREE.Vector3(dc[0], dc[1], dc[2]), look: new THREE.Vector3(dc[3], dc[4], dc[5]), fov: dc[6] || 32 };
    }
    this.applyCamera(0);
  }

  applyCamera(t) {
    const c = this.camera;
    if (this.camFixed) {
      c.position.copy(this.camFixed.pos); c.fov = this.camFixed.fov; c.lookAt(this.camFixed.look); c.updateProjectionMatrix();
      return;
    }
    const { pos, look, fov } = this.cam;
    // a slow cinematic drift: orbit a little around the anvil, breathe in and out
    const off = new THREE.Vector3().subVectors(pos, look);
    const yaw = Math.sin(t * 0.07) * 0.075 + Math.sin(t * 0.023 + 1) * 0.045;
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    off.multiplyScalar(1 + Math.sin(t * 0.05) * 0.035);
    c.position.copy(look).add(off);
    c.position.y += Math.sin(t * 0.11) * 0.05;
    // the blows shake the camera a touch (if the player allows it)
    const shake = this.dio.shake * (this.game.state.data.settings.shake ?? 1);
    if (shake > 0) c.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.02 * shake, (Math.random() - 0.5) * 0.016 * shake, 0));
    c.fov = fov;
    c.lookAt(look);
    c.updateProjectionMatrix();
  }

  onResize(w, h) {
    setPixelScale(h);
    this.layoutCamera(w, h);
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    super.update(dt);
    this.dio.update(dt, this.camera);
    // glide toward the current framing
    const s = this.shot();
    const k = 1 - Math.exp(-dt * 2.2);
    this.cam.pos.lerp(s.pos, k);
    this.cam.look.lerp(s.look, k);
    this.cam.fov += (s.fov - this.cam.fov) * k;
    this.applyCamera(this.time);
    this.post.flash = this.dio.flash * 0.07;

    const ctx = this.game.audio.ctx;
    const on = !!(ctx && ctx.state === 'running');
    if (on !== this.audioOn) {
      this.audioOn = on;
      this.soundHint.classList.toggle('gone', on);
    }
  }

  // ------------------------------------------------------------------ test hooks
  makeDebug() {
    const self = this;
    return {
      get menu() { return self.menu; },
      get stones() { return self.stones; },
      get smith() { return self.dio.smith; },
      openStones() { self.openStones(); },
      closeStones() { self.closeStones(); },
      pick(i) { const info = self.game.state.listSlots()[i]; self.pickSlot(i, info); },
      /** Pretend slot i is at pct% complete (null to stop pretending). */
      fake(i, pct) { self.stones.setFake(i, pct); },
      smash(i) { return self.stones.smash(i); },
      shot(name) { self.setShot(name); const s = self.shot(); self.cam.pos.copy(s.pos); self.cam.look.copy(s.look); self.cam.fov = s.fov; },
      /** Advance the diorama (and the sign/stone animations) by `sec` seconds in 1/30 s steps. */
      step(sec = 1) {
        const n = Math.round(sec * 30);
        for (let i = 0; i < n; i++) { self.update(1 / 30); self.menu.step(1 / 30); self.backMenu?.step(1 / 30); if (self.stones.open) self.stones.step(1 / 30); }
      },
    };
  }
}

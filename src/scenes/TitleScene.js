// Title screen: a cozy voxel burrow diorama with a drifting camera, the MOLEFORGE logo and
// the main menu (Continue / New Game / Settings / Credits).
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { el } from '../core/util.js';
import { buildBurrow, BURROW } from '../bookends/burrow.js';
import { useBookendStyles } from '../bookends/css.js';
import { disposeTextures } from '../bookends/fx.js';

const CONTINUE_OK = new Set(['town', 'home', 'mine', 'forge', 'cooking']);

export default class TitleScene extends Scene {
  async enter(params = {}) {
    this.hud = 'none';
    this.music = 'title';
    this.allowMenus = false;
    this.params = params;
    this.post = { vignette: 0.5, saturation: 1.12, contrast: 1.06, tint: 0xfff2e8, levels: 40 };
    this.textures = [];
    this.own(useBookendStyles());
    this.own(() => disposeTextures(this.textures));

    this.camera = new THREE.PerspectiveCamera(30, this.game.engine.aspect, 0.1, 100);
    this.camBase = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.dio = buildBurrow(this.scene, this.textures);
    this.layoutCamera(this.game.engine.width, this.game.engine.height);

    this.buildDom();
    // compile shaders up front so the first frames don't hitch
    try { this.game.engine.renderer.compile(this.scene, this.camera); } catch (e) { /* optional */ }
  }

  // ------------------------------------------------------------------ DOM
  buildDom() {
    const g = this.game;
    const word = 'MOLEFORGE';
    const logo = el('h1', { class: 'big-title bk-logo', 'aria-label': word }, [...word].map((ch, i) => el('span', { class: ch === 'O' && i === 1 ? 'bk-o' : '', style: { '--i': i }, 'aria-hidden': 'true' }, ch)));
    const sub = el('div', { class: 'bk-sub bk-outline' }, [el('i'), 'One million gold to the surface', el('i')]);

    const items = [];
    if (this.canContinue()) items.push(['Continue', () => this.doContinue()]);
    items.push(['New Game', () => this.newGame()]);
    items.push(['Settings', () => this.openSettings()]);
    items.push(['Credits', () => this.openCredits()]);
    this.buttons = items.map(([label, fn], i) => el('button', {
      class: 'btn' + (i === 0 ? '' : ' alt'), style: { '--i': i }, type: 'button',
      onclick: () => { if (this.busy) return; g.audio.play('ui_click'); fn(); },
      onpointerenter: () => g.audio.play('ui_hover'),
    }, label));
    const menu = el('nav', { class: 'bk-menu', 'aria-label': 'Main menu' }, this.buttons);

    const keys = [['WASD', 'move'], ['Mouse', 'dig/aim'], ['E', 'interact'], ['B', 'Index Book'], ['I', 'inventory'], ['Esc', 'menu']];
    const controls = el('div', { class: 'bk-controls bk-outline' });
    keys.forEach(([k, label], i) => {
      if (i) controls.append(el('span', { class: 'dot' }, '·'));
      controls.append(el('kbd', {}, k), label);
    });
    this.soundHint = el('div', { class: 'bk-sound bk-outline', role: 'status' }, [el('span', { class: 'bk-sound-in' }, [el('span', { class: 'note' }, '♪'), 'click anywhere for sound'])]);
    this.root = el('div', { class: 'bk-root bk-title' }, [el('div', { class: 'bk-left' }, [logo, sub, menu]), controls, this.soundHint]);
    g.ui.world.append(this.root);
    this.own(() => this.root.remove());
    this.audioOn = false;
  }

  hasProgress() {
    const d = this.game.state.data;
    // (not playTime: the game loop also counts time spent idling on this screen)
    return !!this.game.state.flag('lastScene') || d.day > 1 || d.stats.blocks > 0 || d.stats.earned > 0 || d.weapons.length > 0 || Object.keys(d.index || {}).length > 0;
  }

  canContinue() {
    return this.game.state.hasSave() && this.hasProgress();
  }

  /** lastScene || 'home', but never back into the title, the ending or a dev scene. */
  continueTarget() {
    const ls = this.game.state.flag('lastScene');
    return CONTINUE_OK.has(ls) ? ls : 'home';
  }

  doContinue() {
    this.busy = true;
    this.game.goto(this.continueTarget(), { from: 'continue' });
  }

  async newGame() {
    const g = this.game;
    const st = g.state;
    // a save with no real progress (e.g. written on a page unload at the title) isn't worth a prompt
    if (st.hasSave() && this.hasProgress()) {
      this.busy = true;
      const ok = await g.ui.confirm('<b>Start a new game?</b><br>Your current save will be erased.', 'Start fresh', 'Keep my save');
      this.busy = false;
      if (!ok) return;
    }
    this.busy = true;
    st.reset();
    st.wipeSave();
    g.goto('home', { from: 'newgame' });
  }

  openSettings() {
    const g = this.game;
    const s = g.state.data.settings;
    const range = (id, label, key) => {
      const out = el('span', { class: 'muted', style: { minWidth: '3ch', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }, String(Math.round(s[key] * 100)));
      const input = el('input', {
        id, type: 'range', min: 0, max: 1, step: 0.05, value: s[key],
        oninput: (e) => {
          s[key] = parseFloat(e.target.value);
          out.textContent = String(Math.round(s[key] * 100));
          g.audio.setVolumes({ [key]: s[key] });
        },
        onchange: () => { if (key === 'sfx') g.audio.play('ui_click'); },
      });
      return el('label', { class: 'setting', for: id }, [label, el('span', { class: 'row', style: { gap: 'calc(var(--px) * 2)', flexWrap: 'nowrap' } }, [input, out])]);
    };
    const body = el('div', { class: 'menu-list' }, [
      range('bk-music', 'Music', 'music'),
      range('bk-sfx', 'Sound', 'sfx'),
      el('p', { class: 'muted', style: { margin: 0, fontSize: '.75em' } }, 'More options live in the in-game menu (Esc).'),
    ]);
    // only touch the save file if there already is one; otherwise settings ride along with the new game
    g.ui.openPanel({ title: 'Settings', body, onClose: () => { if (g.state.hasSave()) g.state.save(); } });
  }

  openCredits() {
    const body = el('div', { class: 'bk-credits-body' }, [
      el('p', {}, 'A dirty little mole, a very good chicken, and one million gold between them and the sun.'),
      el('ul', {}, [
        el('li', {}, 'Made with Three.js'),
        el('li', {}, 'Every sound synthesized in the browser'),
        el('li', {}, 'All art procedurally generated'),
        el('li', {}, 'No external assets'),
      ]),
      el('p', { class: 'muted' }, 'Thank you for digging with us.'),
    ]);
    this.game.ui.openPanel({ title: 'Credits', sub: 'MOLEFORGE', body });
  }

  // ------------------------------------------------------------------ camera
  layoutCamera(w, h) {
    const aspect = w / h;
    this.camera.aspect = aspect;
    if (aspect >= 1.25) {
      // menu on the left: frame the campfire right of centre
      const shift = THREE.MathUtils.clamp((aspect - 1.25) * 1.6, 0, 1.6);
      this.camBase.set(1.15 - shift * 0.55, 2.3, 9.3);
      this.camLook.set(1.15 - shift * 0.55, 1.3, -0.6);
      this.camera.fov = 30;
    } else {
      // tall screens: logo on top, menu at the bottom, diorama in the middle
      this.camBase.set(BURROW.mole.x - 0.4, 2.9, 13.5);
      this.camLook.set(BURROW.mole.x - 0.4, 1.7, -0.6);
      this.camera.fov = 44;
    }
    // dev: ?cam=x,y,z,lookX,lookY,lookZ[,fov] to inspect the diorama
    const dc = this.params && this.params.cam ? this.params.cam.split(',').map(Number) : null;
    if (dc && dc.length >= 6) {
      this.camBase.set(dc[0], dc[1], dc[2]);
      this.camLook.set(dc[3], dc[4], dc[5]);
      if (dc[6]) this.camera.fov = dc[6];
    }
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camLook);
    this.camQuat = this.camera.quaternion.clone();
    this.camera.updateProjectionMatrix();
  }

  onResize(w, h) {
    this.layoutCamera(w, h);
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    super.update(dt);
    const t = this.time;
    this.dio.update(dt);
    // slow drift: the camera floats but never turns (the beach gets that honour)
    this.camera.position.set(
      this.camBase.x + Math.sin(t * 0.11) * 0.42 + Math.sin(t * 0.23) * 0.1,
      this.camBase.y + Math.sin(t * 0.17) * 0.13,
      this.camBase.z + Math.sin(t * 0.07) * 0.45 - 0.2,
    );
    this.camera.quaternion.copy(this.camQuat);

    const ctx = this.game.audio.ctx;
    const on = !!(ctx && ctx.state === 'running');
    if (on !== this.audioOn) {
      this.audioOn = on;
      this.soundHint.classList.toggle('gone', on);
    }
  }
}

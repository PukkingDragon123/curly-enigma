// Title screen: a cozy voxel burrow diorama with a drifting camera, the MOLEFORGE logo and
// the main menu (Continue / New Game / Settings / Credits).
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { el } from '../core/util.js';
import { buildBurrow, BURROW } from '../bookends/burrow.js';
import { useBookendStyles } from '../bookends/css.js';
import { logoLetters, glintURL } from '../bookends/logo.js';
import { disposeTextures, setPixelScale } from '../bookends/fx.js';

const CONTINUE_OK = new Set(['town', 'home', 'forge', 'cooking']); // the old mine and the deep fall back to home

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
    const st = this.dio.stats;
    console.log(`[title] burrow built in ${st.total.toFixed(0)} ms (cave grid ${st.grid.toFixed(0)} ms, shell mesh ${st.shell.toFixed(0)} ms, ${Math.round(st.shellTris / 1000)}k tris; ${st.batched} props → ${st.batches} batches)`);
    setPixelScale(this.game.engine.height);
    this.layoutCamera(this.game.engine.width, this.game.engine.height);

    this.buildDom();
    // compile shaders up front so the first frames don't hitch
    try { this.game.engine.renderer.compile(this.scene, this.camera); } catch (e) { /* optional */ }
  }

  // ------------------------------------------------------------------ DOM
  buildDom() {
    const g = this.game;
    const word = 'MOLEFORGE';
    const letters = logoLetters().map((L, i) => el('span', { class: L.hot ? 'hot' : '', style: { '--i': i }, 'aria-hidden': 'true' }, [
      el('img', { class: 'pix', src: L.url, alt: '', draggable: 'false', style: { width: `calc(var(--lp) * ${L.w})`, height: `calc(var(--lp) * ${L.h})` } }),
    ]));
    const glint = glintURL();
    const sparkles = [[1, 0.18, 0.22, 0], [8, 0.25, 0.12, 1.9], [5, 0.4, 0.05, 3.3]].map(([li, x, y, d]) => el('img', { class: 'pix bk-glint', src: glint, alt: '', style: { '--gl': li, '--gx': x, '--gy': y, animationDelay: `${2.6 + d}s` } }));
    const embers = Array.from({ length: 9 }, (_, i) => el('i', { class: 'bk-ember', style: { left: `${46 + ((i * 37) % 52)}%`, animationDelay: `${(i * 0.53) % 2.6 + 2}s`, animationDuration: `${2.1 + (i % 4) * 0.35}s` } }));
    const logo = el('h1', { class: 'bk-logo', 'aria-label': word }, [...letters, ...sparkles, ...embers]);
    // position each glint over its letter once laid out
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

    const keys = [['WASD', 'move'], ['C', 'crouch/dive'], ['Mouse', 'dig/aim'], ['E', 'interact'], ['B', 'Index Book'], ['I', 'inventory'], ['Esc', 'menu']];
    const controls = el('div', { class: 'bk-controls bk-outline' });
    keys.forEach(([k, label], i) => {
      if (i) controls.append(el('span', { class: 'dot' }, '·'));
      controls.append(el('kbd', {}, k), label);
    });
    this.soundHint = el('div', { class: 'bk-sound bk-outline', role: 'status' }, [el('span', { class: 'bk-sound-in' }, [el('span', { class: 'note' }, '♪'), (window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 'tap' : 'click') + ' anywhere for sound'])]);
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
    // never fell yet (a save from before the opening): play the fall first
    if (!this.game.state.flag('fallen')) this.game.goto('fall');
    else this.game.goto(this.continueTarget(), { from: 'continue' });
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
    // every new game opens with the fall: the ground gives way under the mole and Nugget
    g.goto('fall');
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
    setPixelScale(h);
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

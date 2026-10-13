import { Engine } from './Engine.js';
import { Input } from './Input.js';
import { AudioSys } from './Audio.js';
import { registerSounds } from './sounds.js';
import { State, GOAL_GOLD } from './State.js';
import { UI } from '../ui/UI.js';
import { ITEMS } from '../data/items.js';
import { BUFFS } from '../data/recipes.js';
import { clamp, wait, el } from './util.js';

// Scenes load lazily so each one stays self-contained.
const SCENES = {
  title: () => import('../scenes/TitleScene.js'),
  town: () => import('../scenes/TownScene.js'),
  home: () => import('../scenes/HomeScene.js'),
  mine: () => import('../scenes/MineScene.js'),
  forge: () => import('../scenes/ForgeScene.js'),
  cooking: () => import('../scenes/CookingScene.js'),
  ending: () => import('../scenes/EndingScene.js'),
  showroom: () => import('../scenes/ShowroomScene.js'),
};

export class Game {
  constructor(root, hotData = {}) {
    this.root = root;
    this.canvas = root.querySelector('#game');
    this.engine = new Engine(this.canvas);
    this.input = new Input(this.canvas, this.engine);
    this.audio = new AudioSys();
    registerSounds(this.audio);
    this.state = new State();
    this.params = new URLSearchParams(location.search);
    if (!this.params.has('fresh')) {
      if (hotData && hotData.save) this.state.load(hotData.save);
      else this.state.load();
    }
    this.ui = new UI(this);
    this.scene = null;
    this.sceneName = null;
    this.transitioning = false;
    this.last = performance.now();
    this.autosaveT = 0;
    this.engine.onResize((w, h) => this.scene && this.scene.onResize(w, h));
    this.engine.setPixelOffset(this.state.data.settings.pixel || 0);
    this.audio.setVolumes({ music: this.state.data.settings.music, sfx: this.state.data.settings.sfx });

    // Audio needs a user gesture.
    const unlock = () => { this.audio.init(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // global hotkeys
    this.input.onKey((e) => {
      if (this.transitioning || !this.scene) return;
      if (this.ui.isPanelOpen()) return;
      if (!this.scene.allowMenus) return;
      if (e.code === 'KeyB') this.ui.openIndex();
      else if (e.code === 'KeyI' || e.code === 'Tab') this.ui.openInventory();
      else if (e.code === 'Escape') this.ui.openMenu();
    });

    const saveIfPlaying = () => { if (this.sceneName && this.sceneName !== 'title' && this.sceneName !== 'showroom') this.state.save(); };
    window.addEventListener('beforeunload', saveIfPlaying);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveIfPlaying(); });
    window.claude?.hot?.snapshot?.(() => ({ save: JSON.stringify(this.state.data) }));
    this.state.on('gold', () => this.checkGoal());
    this.state.on('energy', () => {});
  }

  async start() {
    const p = this.params;
    if (p.has('gold')) this.state.data.gold = parseInt(p.get('gold'), 10) || 0;
    if (p.has('zone')) this.state.data.zoneMax = Math.max(this.state.data.zoneMax, parseInt(p.get('zone'), 10));
    if (p.has('give')) for (const id of p.get('give').split(',')) if (ITEMS[id]) this.state.addItem(id, { q: 100, n: 5 });
    const first = p.get('scene') || 'title';
    const params = {};
    for (const [k, v] of p.entries()) params[k] = v;
    requestAnimationFrame((t) => this.loop(t));
    await this.goto(first, params, { transition: 'none' });
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 1 / 20);
    this.engine.time += dt;
    const st = this.state;
    if (this.scene && !this.transitioning) {
      if (this.sceneName !== 'title') st.data.playTime += dt;
      try { this.scene.update(dt); } catch (e) { console.error(e); this.reportError(e); }
      this.cheats();
    }
    if (this.scene) {
      try { this.scene.render(); } catch (e) { console.error(e); this.reportError(e); }
    }
    this.ui.update(dt);
    this.ui.tickBubbles(dt);
    this.input.endFrame();
    this.autosaveT += dt;
    if (this.autosaveT > 30 && this.sceneName !== 'title') {
      this.autosaveT = 0;
      st.save();
    }
  }

  reportError(e) {
    const now = performance.now();
    if (this._lastErr && now - this._lastErr < 4000) return;
    this._lastErr = now;
    this.ui.toast('Something went wrong: ' + (e && e.message ? e.message : e), { kind: 'bad', dur: 5000 });
  }

  cheats() {
    const inp = this.input;
    if (inp.consumeTyped('motherlode')) { this.state.addGold(250000, 'cheat'); this.ui.toast('Motherlode! +250,000 gold', { kind: 'good' }); }
    if (inp.consumeTyped('deepdive')) { this.state.data.zoneMax = 6; this.ui.toast('All lift stops unlocked', { kind: 'good' }); }
    if (inp.consumeTyped('fullbelly')) { this.state.restoreEnergy(999); }
  }

  /**
   * Switch scene with a transition.
   * opts.transition: 'iris' | 'fade' | 'none'; opts.center: [u,v] iris center in 0..1 screen coords
   */
  async goto(name, params = {}, opts = {}) {
    if (this.transitioning) return;
    const loader = SCENES[name];
    if (!loader) { console.warn('no scene', name); return; }
    this.transitioning = true;
    this.input.enabled = false;
    const tr = this.engine.transition;
    const kind = opts.transition ?? 'iris';
    const maxR = Math.hypot(this.engine.width, this.engine.height);
    if (this.scene && kind !== 'none') {
      tr.irisCenter = opts.center || [0.5, 0.5];
      tr.color = opts.color ?? 0x000000;
      const dur = opts.dur ?? 0.45;
      const t0 = performance.now();
      while (true) {
        const k = clamp((performance.now() - t0) / 1000 / dur, 0, 1);
        if (kind === 'iris') tr.iris = maxR * (1 - k) * (1 - k);
        else tr.fade = k;
        if (k >= 1) break;
        await wait(16);
      }
      if (kind === 'iris') tr.iris = 0;
    } else if (kind !== 'none') {
      tr.fade = 1;
    }

    let mod;
    try {
      mod = await loader();
    } catch (e) {
      console.error(e);
      this.ui.toast(`Couldn't load ${name}: ${e.message}`, { kind: 'bad', dur: 6000 });
      tr.iris = -1; tr.fade = 0;
      this.transitioning = false;
      this.input.enabled = true;
      return;
    }
    if (this.scene) {
      try { this.scene.exit(); } catch (e) { console.warn(e); }
      this.audio.stopAllLoops();
    }
    this.ui.closeAllPanels();
    this.ui.clearWorld();
    this.ui.setPrompt(null);
    this.ui.setHotbar(null);
    this.ui.setHints(null);
    const Cls = mod.default;
    const scene = new Cls(this);
    this.scene = scene;
    this.sceneName = name;
    try {
      await scene.enter(params);
    } catch (e) {
      console.error(e);
      this.reportError(e);
    }
    this.ui.setHudMode(scene.hud);
    if (scene.music) this.audio.playMusic(scene.music, scene.musicParams || {});
    scene.onResize(this.engine.width, this.engine.height);
    if (name !== 'title') this.state.save();

    // open
    if (kind !== 'none') {
      const dur = opts.dur ?? 0.5;
      const t0 = performance.now();
      tr.fade = kind === 'fade' ? 1 : 0;
      while (true) {
        const k = clamp((performance.now() - t0) / 1000 / dur, 0, 1);
        if (kind === 'iris') { tr.irisCenter = opts.openCenter || [0.5, 0.5]; tr.iris = maxR * k * k; }
        else tr.fade = 1 - k;
        if (k >= 1) break;
        await wait(16);
      }
    }
    tr.iris = -1;
    tr.fade = 0;
    this.transitioning = false;
    this.input.enabled = !this.ui.isPanelOpen();
    this.input.clearAll();
  }

  // ------------------------------------------------------------ shared gameplay helpers
  /** Eat a food item (or raw plant). Returns true if eaten. */
  eat(id) {
    const st = this.state;
    const it = ITEMS[id];
    if (!it || st.count(id) <= 0) return false;
    const energy = it.energy ?? it.food ?? 0;
    if (!energy && !it.buff) return false;
    st.removeItem(id, 1);
    st.restoreEnergy(energy);
    if (it.buff) {
      st.addBuff(it.buff, 300);
      this.ui.toast(`${BUFFS[it.buff].name}: ${BUFFS[it.buff].desc}`, { kind: 'good' });
    }
    if (it.maxEnergy) {
      st.data.maxEnergy += it.maxEnergy;
      st.restoreEnergy(it.maxEnergy);
      this.ui.toast(`Max energy +${it.maxEnergy}!`, { kind: 'good' });
    }
    if (id === 'glowcap') st.addBuff('glow', 120);
    if (id === 'pepperroot') st.addBuff('warm', 90);
    if (id === 'bubblebulb') st.addBuff('bouncy', 90);
    if (id === 'sparkmoss' && !st.protects('zap')) { this.audio.play('zap'); this.ui.toast('Bzzt! Your tongue tingles.', { kind: 'warn' }); st.addBuff('zippy', 60); }
    this.audio.play('eat');
    this.ui.toast(`Ate ${it.name} <b>+${energy}</b>`, { icon: undefined });
    st.learn('energy');
    return true;
  }

  /** Advance to the next day (from the home bed). */
  sleep() {
    const st = this.state;
    const d = st.data;
    st.nextDay();
    d.energy = d.maxEnergy;
    d.buffs = [];
    // the bed's quality adds a morning buff
    const beds = d.home.placed.map((p) => ITEMS[p.id]).filter((it) => it && it.kind === 'bed');
    const rest = Math.max(0, ...beds.map((b) => b.rest || 0));
    if (rest >= 1) st.addBuff('sturdy', 600);
    if (rest >= 2) st.addBuff('lucky', 600);
    // eggs
    const petBonus = d.chicken.lastPetDay >= d.day - 1 ? 0.35 : 0;
    if (st.flag('nugget') && d.home.placed.some((p) => p.id === 'coop') && Math.random() < 0.65 + petBonus) {
      d.chicken.eggs = Math.min(6, (d.chicken.eggs || 0) + 1 + (Math.random() < petBonus ? 1 : 0));
    }
    // planters
    for (const [puid, pl] of Object.entries(d.home.planters || {})) {
      if (pl && pl.id && pl.day < d.day) pl.ready = true;
    }
    d.commission = null;
    st.emit('energy', {});
    st.save();
  }

  checkGoal() {
    const st = this.state;
    if (!st.flag('goalToast') && st.gold >= GOAL_GOLD) {
      st.flag('goalToast', true);
      this.ui.toast('<b>1,000,000 gold!</b> The Surface Express ticket office is waiting...', { kind: 'good', dur: 6000 });
      this.audio.play('fanfare');
    }
  }

  /** Small loading overlay for slow scene builds. */
  showLoading(text = 'Digging...') {
    const n = el('div', { class: 'center-msg' }, [el('div', { class: 'big-title', style: { fontSize: 'calc(var(--px) * 14)' } }, text)]);
    this.ui.overlay.append(n);
    return () => n.remove();
  }
}

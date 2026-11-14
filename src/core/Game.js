import { Engine } from './Engine.js';
import { Input } from './Input.js';
import { AudioSys } from './Audio.js';
import { registerSounds } from './sounds.js';
import { State, GOAL_GOLD } from './State.js';
import { UI } from '../ui/UI.js';
import { Quests } from './quests.js';
import { ITEMS } from '../data/items.js';
import { BUFFS } from '../data/recipes.js';
import { foodBuffs } from '../cooking/buffs.js';
import { clamp, wait, el } from './util.js';
import { houseLoading } from '../home/loading.js';

// Scenes load lazily so each one stays self-contained.
const SCENES = {
  title: () => import('../scenes/TitleScene.js'),
  town: () => import('../scenes/TownScene.js'),
  home: () => import('../scenes/HomeScene.js'),
  mine: () => import('../scenes/DeepScene.js'), // old links and saves: the first-person underground
  deep: () => import('../scenes/DeepScene.js'),
  fall: () => import('../scenes/FallScene.js'),
  forge: () => import('../scenes/ForgeScene.js'),
  cooking: () => import('../scenes/CookingScene.js'),
  ending: () => import('../scenes/EndingScene.js'),
  showroom: () => import('../scenes/ShowroomScene.js'),
};

/** How long a scene may take to build before it's taken as stuck (ms; phones get 1.6×). */
const SCENE_WAIT = 45000;
/** Where to go when a scene can't be built: [scene, params]. */
const FALLBACK = {
  deep: ['home', { from: 'continue' }], mine: ['home', { from: 'continue' }], town: ['home', { from: 'continue' }],
  forge: ['home', { from: 'forge' }], cooking: ['home', { from: 'cooking' }], fall: ['home', { from: 'fall' }],
  ending: ['title', {}], showroom: ['title', {}], home: ['title', {}],
};
/** Scenes with a loading card of their own (the title's and the journey's, the house's lantern). */
const OWN_LOADER = new Set(['title', 'fall', 'home', 'ending', 'showroom']);
/** Resolves once the page has painted (a lantern put up now is on screen before a long build). */
const nextPaint = () => new Promise((res) => { let done = false; const go = () => { if (!done) { done = true; res(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 120); });
/** The lantern while a scene builds (no words): late, so a quick build never shows it. */
function loadLamp(game, { corner = false, delay = 0.6 } = {}) {
  try { return houseLoading(game, { corner, appear: delay, wick: false, label: 'Loading' }); } catch (e) { return null; }
}

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
    this.quests = new Quests(this); // quest chains, listening to state 'act' events (src/core/quests.js)
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
      if (e.code === 'KeyB') this.ui.openBook();
      else if (e.code === 'KeyI' || e.code === 'Tab') this.ui.openInventory();
      else if (e.code === 'Escape') this.ui.openMenu();
    });

    const saveIfPlaying = () => { if (this.sceneName && this.sceneName !== 'title' && this.sceneName !== 'showroom') this.state.save(); };
    window.addEventListener('beforeunload', saveIfPlaying);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveIfPlaying(); });
    window.claude?.hot?.snapshot?.(() => ({ save: JSON.stringify(this.state.data) }));
    this.engine.onContext((lost) => this.onContext(lost));
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
    // (while the GPU context is lost nothing can be seen: the world waits too)
    const blind = this.engine.contextLost;
    if (this.scene && !this.transitioning && !blind) {
      if (this.sceneName !== 'title') st.data.playTime += dt;
      try { this.scene.update(dt); } catch (e) { console.error(e); this.reportError(e); }
      this.cheats();
    }
    if (this.scene && !blind) {
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

  /**
   * The GPU context was lost (lost = true: phones do it under memory pressure) or came back. While
   * it's gone: the save is written, a lantern swings on a dark screen, and after a while a
   * button offers a reload in case it never comes back. When it's back the scene carries on, or
   * is built again if it can't put its meshes back on the GPU (scene.onContextRestored()).
   */
  onContext(lost) {
    if (lost) {
      if (this.sceneName && this.sceneName !== 'title' && this.sceneName !== 'showroom') this.state.save();
      try { this.dropCaches?.(); } catch (e) { /* optional */ }
      this.lostLamp?.done();
      this.lostLamp = loadLamp(this, { delay: 0.4 });
      clearTimeout(this.lostT);
      this.lostT = setTimeout(() => {
        if (!this.engine.contextLost || this.lostBtn) return;
        const b = el('button', { class: 'btn ctx-reload interactive', style: { position: 'absolute', left: '50%', bottom: 'calc(var(--px) * 30)', transform: 'translateX(-50%)', zIndex: 9, pointerEvents: 'auto' }, onclick: () => { try { this.state.save(); } catch (e) { /* noop */ } location.reload(); } }, 'Reload');
        this.ui.overlay.append(b);
        this.lostBtn = b;
      }, 9000);
      return;
    }
    clearTimeout(this.lostT);
    this.lostLamp?.done();
    this.lostLamp = null;
    this.lostBtn?.remove();
    this.lostBtn = null;
    const sc = this.scene;
    try { sc?.onContextRestored?.(); } catch (e) { console.warn(e); }
  }

  /** Let go of what's kept only to make the next visit quicker (the built house): memory is short. */
  dropCaches() {
    if (!this.visited?.has('home')) return; // (nothing kept: don't load the house's code just to say so)
    import('../home/houseLoad.js').then((m) => m.dropHouseCache?.()).catch(() => {});
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
    if (inp.consumeTyped('deepdive')) {
      const d = this.state.data;
      d.zoneMax = 6;
      d.deep ||= { seed: 1 + Math.floor(Math.random() * 1e6), tunnels: [], stations: [] };
      d.deep.stations = [0, 1, 2, 3, 4, 5];
      this.ui.toast('All lift stops unlocked', { kind: 'good' });
    }
    if (inp.consumeTyped('fullbelly')) { this.state.restoreEnergy(999); }
  }

  /**
   * Switch scene with a transition.
   * opts.transition: 'iris' | 'fade' | 'none' | 'seamless'; opts.center: [u,v] iris center in 0..1 screen coords
   *  'seamless': no black at all: the frame on screen now is held over the canvas while the next
   *  scene builds (a small lantern after a moment if it takes a while), then dissolves into the
   *  next scene's first frame. For hand-offs where both scenes show the same place (the passage
   *  between the burrow and Deep Town, src/home/passage.js). Held keys and the pointer lock carry on.
   * A request made while another switch is loading is dropped (the old scene is on its way out);
   * one made while the new scene is fading in waits its turn. A scene whose enter() throws or
   * never finishes (SCENE_WAIT) is let go for a safe one (FALLBACK) instead of a screen left black.
   */
  async goto(name, params = {}, opts = {}) {
    if (this.transitioning) {
      if (this._phase === 'open' && name !== this.sceneName) this._queued = { name, params, opts };
      else console.warn(`[game] goto(${name}) while switching to ${this._target}: dropped`);
      return;
    }
    const loader = SCENES[name];
    if (!loader) { console.warn('no scene', name); return; }
    this.transitioning = true;
    this._phase = 'close';
    this._target = name;
    this.input.enabled = false;
    const tr = this.engine.transition;
    const kind = opts.transition ?? 'iris';
    const seamless = kind === 'seamless' && !!this.scene;
    const maxR = Math.hypot(this.engine.width, this.engine.height);
    let hold = null;
    try {
      if (seamless) {
        hold = this.holdFrame();
      } else if (this.scene && kind !== 'none') {
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
      } else if (kind !== 'none' && kind !== 'seamless') {
        tr.fade = 1;
      }
      this._phase = 'load';
      let entered = await this.enterScene(name, params, { seamless, hold });
      // the scene couldn't be built: somewhere safe instead of a black screen (at most two hops)
      for (let hop = 0, at = name; !entered && hop < 2; hop++) {
        const fb = FALLBACK[at];
        if (!fb || !SCENES[fb[0]]) break;
        console.warn(`[game] ${at} failed to load, going to ${fb[0]}`);
        if (!hop) this.ui.toast('That place wouldn\'t load. Back to safety!', { kind: 'warn', dur: 3500 });
        at = fb[0];
        entered = await this.enterScene(at, { ...fb[1] }, { seamless: false, hold: null });
      }
      if (name !== 'title' && this.sceneName !== 'title') this.state.save();
      // open
      this._phase = 'open';
      if (hold) {
        // the next scene's first frame under the held one, then the held one dissolves (quick)
        tr.iris = -1; tr.fade = 0;
        try { this.scene?.render(); } catch (e) { console.warn(e); }
        hold.release(opts.dur ?? 0.22);
      } else if (kind !== 'none' && kind !== 'seamless') {
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
    } catch (e) {
      console.error(e);
      this.reportError(e);
      hold?.release(0);
    } finally {
      tr.iris = -1;
      tr.fade = 0;
      this.transitioning = false;
      this._phase = null;
      this.input.enabled = !this.ui.isPanelOpen();
      if (!seamless) this.input.clearAll();
    }
    const q = this._queued;
    this._queued = null;
    if (q && q.name !== this.sceneName) await this.goto(q.name, q.params, q.opts);
  }

  /** Start fetching a scene's code ahead of a switch that's coming (e.g. walking up the old passage). */
  prefetch(name) {
    if (!SCENES[name] || this._prefetched?.has(name)) return;
    (this._prefetched ||= new Set()).add(name);
    SCENES[name]().catch(() => this._prefetched.delete(name));
  }

  /**
   * Leave the current scene and build scene `name` in its place. Resolves true when it entered,
   * false when its module or its enter() failed or ran past SCENE_WAIT (the half-built scene is
   * let go). While it builds: the house's own lantern screen at home; elsewhere a lantern that
   * shows only if the build takes a while (a small one in the corner over a held frame).
   */
  async enterScene(name, params, { seamless = false, hold = null } = {}) {
    let mod;
    try {
      mod = await SCENES[name]();
    } catch (e) {
      console.error(e);
      this.ui.toast(`Couldn't load ${name}: ${e.message}`, { kind: 'bad', dur: 6000 });
      // (the old scene stays, when there is one: nothing was torn down yet)
      return !!this.scene;
    }
    const old = this.scene;
    if (old) {
      this.handingOff = seamless; // (the old scene keeps the pointer lock for the next)
      try { old.exit(); } catch (e) { console.warn(e); }
      this.handingOff = false;
      this.audio.stopAllLoops();
    }
    this.ui.closeAllPanels();
    this.ui.clearWorld();
    this.ui.setPrompt(null);
    this.ui.setHotbar(null);
    this.ui.setHints(null);
    const Cls = mod.default;
    let scene;
    try { scene = new Cls(this); } catch (e) { console.error(e); this.reportError(e); this.scene = null; return false; }
    this.scene = scene;
    this.sceneName = name;
    (this.visited ||= new Set()).add(name);
    this.engine.sceneName = name; // per-scene post defaults (Engine SCENE_POST)
    const lamp = OWN_LOADER.has(name) || scene.ownLoader ? null : loadLamp(this, { corner: seamless, delay: seamless ? 0.35 : 0.6 });
    let ok = true;
    try {
      this.ui.setActionIcon?.(null);
      // (let the lantern reach the screen before a long build blocks the page)
      if (lamp) await nextPaint();
      const p = scene.enter({ ...params, ...(seamless ? { seamless: true } : null) });
      p?.catch?.(() => {}); // (a scene let go may still fail later: nobody's listening any more)
      // (a stuck build waits on something that never comes; a slow one keeps the page busy: a
      // timer that fires late means it was still working, so it gets another while)
      let late = null;
      const span = this.engine.mobile ? SCENE_WAIT * 1.6 : SCENE_WAIT;
      const watch = new Promise((res) => {
        const arm = () => { const due = performance.now() + span; late = setTimeout(() => { if (performance.now() - due > 2500) arm(); else res('late'); }, span); };
        arm();
      });
      const r = await Promise.race([p, watch]);
      clearTimeout(late);
      if (r === 'late') throw new Error(`${name} took too long to load`);
    } catch (e) {
      console.error(e);
      ok = false;
    }
    lamp?.done();
    if (!ok && FALLBACK[name]) {
      // let the broken scene go (it may be half built) so something else can take its place
      scene.gone = true;
      try { scene.exit(); } catch (e) { console.warn(e); }
      this.audio.stopAllLoops();
      return false;
    }
    // (nowhere else to go: show what there is)
    if (!ok) this.reportError(new Error(`${name} did not load properly`));
    this.ui.setHudMode(scene.hud);
    if (scene.music) this.audio.playMusic(scene.music, scene.musicParams || {});
    try { scene.onResize(this.engine.width, this.engine.height); } catch (e) { console.warn(e); }
    return ok;
  }

  /**
   * Hold the frame on screen now over the canvas (for a seamless switch): draws the current scene
   * once more and copies the canvas into a 2D canvas laid exactly over it. Returns
   * { release(secs) } (fades it out and removes it), or null if it can't.
   */
  holdFrame() {
    const src = this.canvas;
    try {
      this.scene?.render();
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.className = 'hold-frame';
      c.style.cssText = `position:absolute;left:0;top:0;width:${src.style.width};height:${src.style.height};image-rendering:pixelated;image-rendering:crisp-edges;pointer-events:none;z-index:1;transition:opacity .2s linear`;
      const ctx = c.getContext('2d');
      ctx.drawImage(src, 0, 0);
      src.after(c);
      let gone = false;
      return {
        release(secs = 0.22) {
          if (gone) return;
          gone = true;
          c.style.transition = `opacity ${Math.max(0, secs)}s linear`;
          // (two frames: the new scene's first frame is on screen before the old one fades)
          requestAnimationFrame(() => requestAnimationFrame(() => { c.style.opacity = '0'; setTimeout(() => c.remove(), secs * 1000 + 60); }));
        },
      };
    } catch (e) {
      console.warn('[game] could not hold the frame', e);
      return null;
    }
  }

  // ------------------------------------------------------------ shared gameplay helpers
  /** Eat a food item (or raw plant). Returns true if eaten. */
  eat(id) {
    const st = this.state;
    const it = ITEMS[id];
    if (!it || st.count(id) <= 0) return false;
    const energy = it.energy ?? it.food ?? 0;
    if (!energy && !it.buff) return false;
    const took = st.removeItem(id, 1);
    st.restoreEnergy(energy * (st.skill?.('hearty') || 1));
    // cooking part: timed food buffs, longer for a better dish (src/cooking/buffs.js)
    if (it.buff) foodBuffs(this, id, Array.isArray(took) ? took[0]?.q : undefined);
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
    const n = el('div', { class: 'center-msg' }, [el('div', { class: 'big-title', style: { fontSize: 'max(var(--g), round(calc(var(--px) * 14) + 2px, var(--g)))' } }, text)]);
    this.ui.overlay.append(n);
    return () => n.remove();
  }
}

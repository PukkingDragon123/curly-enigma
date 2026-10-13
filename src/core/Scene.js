import * as THREE from 'three';

/**
 * Base class for game scenes. Subclasses build into `this.scene` and set `this.camera`.
 *
 * Lifecycle: constructor(game) → await enter(params) → update(dt)/render() each frame → exit()
 *  - hud:        'none' | 'town' | 'home' | 'mine' | 'mini' (which HUD bits to show)
 *  - post:       overrides for the pixel post-process (see Engine DEFAULT_POST)
 *  - allowMenus: whether B / I / Esc open the global panels
 */
export class Scene {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, game.engine.aspect, 0.1, 200);
    this.post = {};
    this.hud = 'none';
    this.allowMenus = true;
    this.music = null;
    this.time = 0;
    this._disposers = [];
  }

  // eslint-disable-next-line no-unused-vars
  async enter(params) {}

  update(dt) { this.time += dt; }

  render() {
    this.game.engine.render(this.scene, this.camera, this.post);
  }

  onResize(w, h) {
    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Register cleanup to run on exit (event unsubscribes, audio loops...). */
  own(fn) { this._disposers.push(fn); return fn; }

  exit() {
    for (const fn of this._disposers) { try { fn(); } catch (e) { console.warn(e); } }
    this._disposers = [];
    disposeObject(this.scene);
  }

  /** Project a world-space point to page CSS pixels. */
  toScreen(v) {
    return this.game.engine.toScreen(v, this.camera);
  }
}

/** Dispose geometries/materials under an object. Textures flagged with userData.shared are kept. */
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (m.userData?.shared) continue;
      for (const k of ['map', 'emissiveMap', 'alphaMap']) {
        const t = m[k];
        if (t && !t.userData?.shared) t.dispose();
      }
      m.dispose();
    }
  });
}

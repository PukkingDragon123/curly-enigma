// PC graphics and camera settings (the game targets PC only: no phone caps anywhere). Data and hooks
// only: the pause/settings menu draws them from GFX_OPTIONS and calls game.gfx.set().
//
//   game.gfx.get('fov')                      → 74
//   game.gfx.set({ preset: 'ultra' })       → applies the preset's values (tier, shadows, view distance)
//   game.gfx.set({ renderScale: 1.25 })     → any single value (the preset becomes 'custom')
//   game.gfx.on((values, changed) => ...)   → listen (returns an unsubscribe)
//   GFX_OPTIONS                              → [{ id, label, group, kind: 'choice' | 'slider' | 'toggle', options?, min?, max?, step?, help }]
//
// Saved per machine (localStorage), not per save slot. `?q=<tier>` still pins a render tier for tests.
// Hooks: Engine (render tier / pixel budget × renderScale², effect level, AO as "shadows", the fps cap
// in Game.loop), the first-person scenes (fov, view distance, head bob, sprint FOV kick: src/fps/feel.js).

const KEY = 'burrowsmith.gfx.v1';

/** The presets. tier: an Engine TIERS name; fx: glow level; shadows: 'off' | 'low' | 'high' (screen-space AO). */
export const GFX_PRESETS = Object.freeze({
  auto: { tier: 'auto', shadows: 'auto', viewDist: 1 }, // adapts to the frame time (the default)
  low: { tier: 'low', shadows: 'low', viewDist: 0.75 },
  medium: { tier: 'medium', shadows: 'low', viewDist: 0.9 },
  high: { tier: 'high', shadows: 'high', viewDist: 1 },
  ultra: { tier: 'ultra', shadows: 'high', viewDist: 1.3 },
});

export const GFX_DEFAULTS = Object.freeze({
  preset: 'auto', // auto | low | medium | high | ultra | custom
  tier: 'auto', // the render tier (auto adapts)
  renderScale: 1, // × the tier's pixel budget per axis (0.5 .. 1.5)
  shadows: 'auto', // auto | off | low | high
  viewDist: 1, // × how far the world is built and drawn (0.6 .. 1.5)
  vsync: true, // the desktop shell's swap interval (a browser always syncs to the display)
  fpsCap: 0, // 0 = the display's rate; else frames per second at most
  fov: 74, // vertical field of view of the first-person camera (degrees)
  headBob: true, // the view bobs with the footsteps
  fovKick: true, // the view widens a little while sprinting
  sway: 1, // how much the paws swing with the view and the stride (0 .. 1)
});

/** What the menu shows (in order). */
export const GFX_OPTIONS = Object.freeze([
  { id: 'preset', group: 'graphics', label: 'Quality', kind: 'choice', options: [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], help: 'Sets render resolution, effects, shadows and view distance together.' },
  { id: 'renderScale', group: 'graphics', label: 'Render scale', kind: 'slider', min: 0.5, max: 1.5, step: 0.05, format: (v) => Math.round(v * 100) + '%', help: 'Internal resolution of the pixel image.' },
  { id: 'shadows', group: 'graphics', label: 'Shadows', kind: 'choice', options: [['auto', 'Auto'], ['off', 'Off'], ['low', 'Low'], ['high', 'High']], help: 'Contact shadows in corners and under things.' },
  { id: 'viewDist', group: 'graphics', label: 'View distance', kind: 'slider', min: 0.6, max: 1.5, step: 0.05, format: (v) => Math.round(v * 100) + '%' },
  { id: 'vsync', group: 'graphics', label: 'V-Sync', kind: 'toggle' },
  { id: 'fpsCap', group: 'graphics', label: 'Frame cap', kind: 'choice', options: [[0, 'Off'], [30, '30'], [60, '60'], [90, '90'], [120, '120'], [144, '144'], [165, '165'], [240, '240']] },
  { id: 'fov', group: 'camera', label: 'Field of view', kind: 'slider', min: 60, max: 110, step: 1, format: (v) => Math.round(v) + '°' },
  { id: 'headBob', group: 'camera', label: 'Head bob', kind: 'toggle' },
  { id: 'fovKick', group: 'camera', label: 'Sprint FOV kick', kind: 'toggle' },
  { id: 'sway', group: 'camera', label: 'Paw sway', kind: 'slider', min: 0, max: 1, step: 0.1, format: (v) => Math.round(v * 100) + '%' },
]);

const RANGE = { renderScale: [0.5, 1.5], viewDist: [0.6, 1.5], fov: [60, 110], sway: [0, 1], fpsCap: [0, 1000] };
const PRESET_KEYS = ['tier', 'shadows', 'viewDist'];

function clean(o) {
  const v = { ...GFX_DEFAULTS };
  for (const k of Object.keys(GFX_DEFAULTS)) {
    if (!(k in o)) continue;
    const d = GFX_DEFAULTS[k], x = o[k];
    if (typeof d === 'number') { const n = Number(x); if (Number.isFinite(n)) v[k] = RANGE[k] ? Math.min(RANGE[k][1], Math.max(RANGE[k][0], n)) : n; }
    else if (typeof d === 'boolean') v[k] = !!x;
    else if (typeof x === 'string') v[k] = x;
  }
  if (!GFX_PRESETS[v.preset] && v.preset !== 'custom') v.preset = 'auto';
  if (!['auto', 'off', 'low', 'high'].includes(v.shadows)) v.shadows = 'auto';
  return v;
}

export class Graphics {
  constructor(engine) {
    this.engine = engine;
    this.listeners = new Set();
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
    this.v = clean(saved);
    this.apply(Object.keys(this.v));
  }

  get(k) { return this.v[k]; }
  all() { return { ...this.v }; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Change values ({ preset } brings the preset's values with it; any preset value set by hand makes it 'custom'). */
  set(patch = {}) {
    const next = { ...this.v, ...patch };
    if ('preset' in patch && GFX_PRESETS[patch.preset]) Object.assign(next, GFX_PRESETS[patch.preset], { preset: patch.preset });
    else if (PRESET_KEYS.some((k) => k in patch && patch[k] !== this.v[k])) next.preset = 'custom';
    const v = clean(next);
    const changed = Object.keys(v).filter((k) => v[k] !== this.v[k]);
    if (!changed.length) return this.v;
    this.v = v;
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage blocked */ }
    this.apply(changed);
    for (const fn of this.listeners) { try { fn(this.all(), changed); } catch (e) { console.warn(e); } }
    return this.v;
  }

  /** Push values into the engine (the scenes read fov, view distance and the camera toggles each frame). */
  apply(keys) {
    const e = this.engine, v = this.v;
    if (!e) return;
    const has = (k) => keys.includes(k);
    if (has('renderScale') && e.setRenderScale) e.setRenderScale(v.renderScale);
    if ((has('tier') || has('shadows')) && e.setQuality) e.setQuality({ tier: v.tier, shadows: v.shadows });
    e.viewDist = v.viewDist;
    e.fpsCap = v.fpsCap;
    e.vsync = v.vsync;
    // a desktop shell (Electron/Steam) may listen for the swap interval
    if (has('vsync')) { try { window.desktopShell?.setVsync?.(v.vsync); } catch (err) { /* no shell */ } }
  }
}

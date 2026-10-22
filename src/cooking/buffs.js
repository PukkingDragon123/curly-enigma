// Food buffs: what eating a dish does (foodBuffs, called by game.eat), the HUD strip of food
// icons with timers (BuffStrip, built by UI: ui.buffs) and the buffs that run themselves
// (hearty: energy trickles back). Buff data lives in data/recipes.js (BUFFS); the mine and the
// other parts read them with state.hasBuff(id) (docs/REMAKE.md › Cooking and foraging).
import { ITEMS } from '../data/items.js';
import { BUFFS } from '../data/recipes.js';
import { iconURL } from '../gfx/PixelArt.js';
import { el } from '../core/util.js';
import { kitchenData, fixQualityStacks } from './quality.js';

/** How long a dish's buff lasts for its quality (q 0..100; unknown = 1×). state.addBuff adds the
 * skill tree's `buff` multiplier on top (Slow Simmer...). */
export function buffSecs(state, it, q) {
  const base = it?.secs || 300;
  const k = q == null ? 1 : 0.6 + 0.8 * Math.max(0, Math.min(100, q)) / 100;
  return Math.round(base * k);
}

const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.ceil(s)}s`);

/** game.eat hook: the dish's buff(s), timed by its quality. Returns the buff ids given. */
export function foodBuffs(game, id, q) {
  const st = game.state, it = ITEMS[id];
  if (!it) return [];
  const ids = [it.buff, it.buff2].filter((b) => b && BUFFS[b]);
  if (!ids.length) return [];
  const secs = buffSecs(st, it, q);
  const real = Math.round(secs * (st.skill?.('buff') || 1)); // what addBuff will really give
  const kd = kitchenData(st);
  kd.buffMax ||= {};
  for (const b of ids) {
    const cur = (st.data.buffs || []).find((x) => x.id === b);
    const left = cur ? Math.max(0, cur.until - st.data.playTime) : 0;
    kd.buffFrom[b] = id;
    kd.buffMax[b] = Math.max(real, left);
    const c = game.ui.buffs?.items.get(b);
    if (c) c.max = kd.buffMax[b];
    st.addBuff(b, secs);
  }
  const names = ids.map((b) => `<b style="color:${BUFFS[b].color}">${BUFFS[b].name}</b>`).join(' + ');
  game.ui.toast(`${names} for ${fmt(real)} · ${ids.map((b) => BUFFS[b].desc).join(' ')}`, { icon: iconURL(id), kind: 'good', dur: 3400 });
  game.audio.play('glow', { vol: 0.5 });
  game.ui.buffs?.pop(ids);
  return ids;
}

// ---------------------------------------------------------------- the HUD strip
const CSS = /* css */`
.hud-tl .charms { display: none !important; }
.fb-strip { position: absolute; left: 0; top: calc(var(--sat, 0px) + var(--px) * 38); display: flex; gap: calc(var(--px) * 2); pointer-events: auto; }
#ui.focus .fb-strip { opacity: .55; }
.fb-buff { position: relative; width: calc(var(--icon-s) + var(--px) * 4); padding: var(--px) var(--px) calc(var(--px) * 1.5); border: 0; cursor: pointer;
  background: #f4e4c0; box-shadow: 0 0 0 var(--px) #3a2414, inset 0 calc(var(--px) * -1) 0 #d8c090, 0 calc(var(--px) * 2) 0 var(--px) rgba(0,0,0,.35);
  display: flex; flex-direction: column; align-items: center; gap: var(--px); font-family: var(--font); animation: fbIn .45s cubic-bezier(.2,1.7,.4,1); }
.fb-buff::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: var(--px); background: var(--c); }
.fb-buff img { width: var(--icon-s); height: var(--icon-s); display: block; image-rendering: pixelated; }
.fb-bar { width: 100%; height: calc(var(--px) * 1.5); background: #3a2414; position: relative; }
.fb-bar i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c); }
.fb-t { font-size: 11px; line-height: 1; color: #3a2414; letter-spacing: .02em; }
.fb-buff.low { animation: fbLow .6s steps(2) infinite; }
.fb-buff.pop { animation: fbPop .5s cubic-bezier(.2,1.8,.4,1); }
.fb-buff.pop::after { content: ''; position: absolute; inset: calc(var(--px) * -3); border: var(--px) solid var(--c); animation: fbRing .5s ease-out forwards; pointer-events: none; }
.fb-tip { position: absolute; left: 0; top: calc(100% + var(--px) * 3); width: max-content; max-width: calc(var(--px) * 90); text-align: left;
  font-size: 15px; line-height: 1.25; color: var(--ink, #2a1a14); background: #f8ecd2; padding: calc(var(--px) * 2) calc(var(--px) * 3);
  box-shadow: 0 0 0 var(--px) #3a2414, 0 calc(var(--px) * 2) 0 var(--px) rgba(0,0,0,.35); opacity: 0; pointer-events: none; transition: opacity .15s; z-index: 4; }
.fb-tip small { color: #7a5a3a; }
.fb-buff:hover .fb-tip, .fb-buff.open .fb-tip, .fb-buff:focus-visible .fb-tip { opacity: 1; }
@keyframes fbIn { from { transform: translateY(calc(var(--px) * -24)) rotate(-8deg); opacity: 0; } }
@keyframes fbPop { 0% { transform: scale(1); } 35% { transform: scale(1.25) rotate(4deg); } 100% { transform: scale(1); } }
@keyframes fbRing { from { opacity: 1; transform: scale(.8); } to { opacity: 0; transform: scale(1.35); } }
@keyframes fbLow { 50% { opacity: .45; } }
.fb-buff.out { animation: fbOut .35s ease-in forwards; }
@keyframes fbOut { to { transform: translateY(calc(var(--px) * -20)) scale(.6); opacity: 0; } }
@media (max-width: 640px), (max-height: 440px) { .fb-t { font-size: 9px; } .fb-strip { gap: var(--px); } }
`;
let styled = false;
function ensureCss() {
  if (styled) return;
  styled = true;
  document.head.append(el('style', { id: 'fb-styles' }, CSS));
}

/** The strip of active food buffs in the top-left HUD cluster (ui.buffs). */
export class BuffStrip {
  constructor(ui) {
    ensureCss();
    this.ui = ui;
    this.game = ui.game;
    this.items = new Map();
    this.root = el('div', { class: 'fb-strip', 'aria-label': 'Food buffs' });
    (ui.tl || ui.hud).append(this.root);
    this.t = 0;
    this.regen = 0;
    const st = this.game.state;
    st.on('buffs', () => this.render());
    st.on('load', () => { fixQualityStacks(st); this.render(); });
    fixQualityStacks(st);
    this.render();
  }

  /** A short pop + ring on these buffs (just eaten or refreshed). */
  pop(ids) {
    this.render();
    for (const id of ids) {
      const c = this.items.get(id);
      if (!c) continue;
      c.node.classList.remove('pop');
      void c.node.offsetWidth;
      c.node.classList.add('pop');
    }
  }

  render() {
    const st = this.game.state;
    const now = st.data.playTime;
    const kd = kitchenData(st);
    const live = new Set();
    for (const b of st.data.buffs || []) {
      const def = BUFFS[b.id];
      if (!def || b.until <= now) continue;
      live.add(b.id);
      const src = ITEMS[kd.buffFrom[b.id]] ? kd.buffFrom[b.id] : def.icon;
      let c = this.items.get(b.id);
      if (!c) {
        const img = el('img', { class: 'pix', alt: '' });
        const fillEl = el('i');
        const time = el('span', { class: 'fb-t' });
        const tip = el('span', { class: 'fb-tip' });
        const node = el('button', { class: 'fb-buff', 'aria-label': def.name, onclick: (e) => { e.stopPropagation(); node.classList.toggle('open'); } },
          [img, el('div', { class: 'fb-bar' }, [fillEl]), time, tip]);
        node.style.setProperty('--c', def.color);
        c = { node, img, fill: fillEl, time, tip, def, src: null, max: kd.buffMax?.[b.id] || 1 };
        this.items.set(b.id, c);
        this.root.append(node);
      }
      if (c.src !== src) { c.src = src; c.img.src = iconURL(src); }
      c.until = b.until;
      c.max = Math.max(c.max, b.until - now);
    }
    for (const [id, c] of this.items) {
      if (live.has(id)) continue;
      this.items.delete(id);
      c.node.classList.add('out');
      setTimeout(() => c.node.remove(), 360);
    }
    this.tick(true);
  }

  tick(force = false) {
    const st = this.game.state;
    const now = st.data.playTime;
    for (const [id, c] of this.items) {
      const left = Math.max(0, c.until - now);
      const txt = fmt(left);
      if (force || c.txt !== txt) {
        c.txt = txt;
        c.time.textContent = txt;
        c.fill.style.width = `${Math.max(0, Math.min(100, (left / c.max) * 100)).toFixed(1)}%`;
        c.node.classList.toggle('low', left < 30);
        const from = ITEMS[c.src]?.name;
        c.tip.innerHTML = `<b style="color:${c.def.color}">${c.def.name}</b><br>${c.def.desc}<br><small>${from ? from + ' · ' : ''}${left >= 60 ? Math.ceil(left / 60) + ' min' : Math.ceil(left) + ' s'} left</small>`;
      }
      if (left <= 0) { this.render(); return; }
      void id;
    }
  }

  /** Called from ui.update (wall-clock dt). */
  update(dt) {
    this.t += dt;
    if (this.t > 0.25) { this.t = 0; if (this.items.size) this.tick(); }
    // hearty: energy trickles back (paid out once a second so the lantern doesn't flicker)
    const st = this.game.state;
    if (this.items.has('hearty') && st.hasBuff('hearty') && this.game.sceneName !== 'title') {
      this.regen += dt * 0.6;
      if (this.regen >= 1) {
        const n = Math.floor(this.regen);
        this.regen -= n;
        if (st.data.energy < st.data.maxEnergy) st.restoreEnergy(n);
      }
    } else this.regen = 0;
  }
}

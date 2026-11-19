// The objective tracker: a wanted poster nailed to a cork patch under the backpack, in every
// first-person scene. The poster is a torn handbill with a hand-drawn woodcut of the quest's goal and
// its title (src/ui/questPoster.js, src/ui/posterPics.js); under it, on two lengths of twine, hangs a
// scroll with the current step in a few words, its progress (inked pips or a count) and where it is
// (an arrow that turns as you turn, the distance, ▲ ▼ when it's above or below you).
//  - a new quest: the poster flutters down from above, catches on the nail with a jolt and swings
//    (a damped pendulum, src: physics() below), then the scroll drops open with a wobble;
//  - progress: the next pip is inked in;
//  - a step done: an ink tick and a strike, the scroll rolls up and opens again on the next step;
//  - a quest done: tick, roll up, then the poster is torn off its nail (a scrap stays pinned) and
//    flutters away, and the next one drops in;
//  - idle: it sways a little; after a quiet spell it tucks smaller (the HUD's calm fades it out).
// Click it for the quest book. It also drives the world markers (src/ui/QuestMarks.js) and the
// toasts: a new quest, progress on quests not on the poster, the next step, rewards.
// Reads game.quests (src/core/quests.js) once it exists; UI.update drives it.
import { el, formatGoldFull } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { npcName } from '../data/quests.js';
import { LORE_BY_ID } from '../data/lore.js';
import { BART, PIN_KINDS } from './bookArt.js';
import { SFX } from './bookSfx.js';
import { QuestMarks } from './QuestMarks.js';
import { npcFace } from './npcFace.js';
import {
  posterLook, posterArt, scrapArt, corkArt, nailArt, rodArt, sheetArt, curlArt, twineArt, pipArt, tickArt, arrowArt, brief, shortGold, PSFX,
  POSTER_W, TITLE_Y, MID_H,
} from './questPoster.js';
import './quests.css';

// ?qtslow=N plays the poster's animations N times slower (for screenshots of single frames)
const SLOW = (() => { try { return Math.max(1, +new URLSearchParams(location.search).get('qtslow') || 1); } catch (e) { return 1; } })();
const wait = (ms) => new Promise((r) => setTimeout(r, ms * SLOW));
const anim = (node, kf, o) => node.animate(kf, typeof o === 'number' ? o * SLOW : { ...o, duration: o.duration * SLOW });
const done = (a) => (a?.finished ? a.finished.catch(() => {}) : Promise.resolve());
const IDLE = 8; // seconds before the poster tucks itself smaller
const MAX_PIPS = 5;

/** "2/5", or gold as "12,400 / 1,000,000". */
export function countText(v) {
  if (!v || v.max <= 1) return '';
  if (v.step?.gold) return `${formatGoldFull(v.n)} / ${formatGoldFull(v.max)}`;
  return `${v.n}/${v.max}`;
}

/** Reward line: "+100 gold · 2 skill points · 3 Glow Stakes · a recipe · ♥ Hazel · 2 pages of lore". */
export function rewardText(r, o = {}) {
  if (!r) return '';
  const out = [];
  if (r.gold) out.push(`+${formatGoldFull(r.gold)} gold`);
  if (r.sp) out.push(`${r.sp} skill point${r.sp > 1 ? 's' : ''}`);
  for (const [id, n] of Object.entries(r.items || {})) { const nm = ITEMS[id]?.name || id; out.push(`${n > 1 ? n + ' ' : ''}${n > 1 && !/s$/.test(nm) ? nm + 's' : nm}`); }
  for (const d of [].concat(r.recipe || [])) out.push(`recipe: ${ITEMS[d]?.name || d}`);
  const rep = typeof r.rep === 'number' ? (o.rep ? { [o.rep]: r.rep } : {}) : r.rep || (o.village && o.rep ? { [o.rep]: 1 } : {});
  for (const [npc, n] of Object.entries(rep)) if (n > 0) out.push(`${'♥'.repeat(Math.min(3, n))} ${npcName(npc)}`);
  const lore = [].concat(r.lore || []).filter((id) => LORE_BY_ID[id]);
  if (lore.length) out.push(lore.length === 1 ? `lore: ${LORE_BY_ID[lore[0]].title}` : `${lore.length} entries of lore`);
  return out.join(' · ');
}

const ARROW = (k) => arrowArt(k);
const cssPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;

export class Tracker {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.quests = null;
    this.shown = null; // { id, i, n, text }
    this.pending = [];
    this.running = false;
    this.idleT = 0;
    this.muted = false;
    this.starts = [];
    this.toastT = {};
    // the pendulum: the poster on its nail (deg, deg/s), the scroll on its twine
    this.ang = 0; this.vel = 0; this.sAng = 0; this.sVel = 0; this.t = Math.random() * 10;

    const img = (cls, src) => el('img', { class: 'pix ' + cls, src, alt: '', draggable: 'false' });
    this.cork = img('qt-cork', corkArt());
    this.nail = img('qt-nail', nailArt());
    this.scrap = el('img', { class: 'pix qt-scrap', alt: '', hidden: true });
    this.title = el('span', { class: 'qt-title' });
    this.poster = el('div', { class: 'qt-poster' }, [this.title]);
    this.text = el('span', { class: 'qt-text' });
    this.tick = img('qt-tick', tickArt());
    this.line = el('div', { class: 'qt-line' }, [el('span', { class: 'qt-step' }, [this.text]), this.tick]);
    this.pips = el('span', { class: 'qt-pips' });
    this.num = el('span', { class: 'qt-n' });
    this.arrow = img('qt-arrow', ARROW(0));
    this.dist = el('b', { class: 'qt-dist' });
    this.where = el('span', { class: 'qt-where', hidden: true }, [this.arrow, this.dist]);
    this.prog = el('div', { class: 'qt-prog' }, [this.pips, this.num, this.where]);
    this.sheetIn = el('div', { class: 'qt-sheet-in' }, [this.line, this.prog]);
    this.sheet = el('div', { class: 'qt-sheet' }, [this.sheetIn]);
    this.rodT = el('i', { class: 'qt-rod' });
    this.rodB = el('i', { class: 'qt-rod heavy' });
    this.scroll = el('div', { class: 'qt-scroll' }, [el('i', { class: 'qt-twine' }), this.rodT, this.sheet, this.rodB]);
    this.swingEl = el('div', { class: 'qt-swing' }, [this.poster, this.scroll]);
    this.drop = el('div', { class: 'qt-drop' }, [this.swingEl]);
    this.roll = el('button', {
      class: 'qt-roll', title: 'Your quests (B)', 'aria-label': 'Current objective: open the quest book',
      onclick: (e) => { e.stopPropagation(); this.game.audio.init?.(); ui.openBook?.('quests'); },
    }, [this.cork, this.scrap, this.drop, this.nail]);
    this.el = el('div', { class: 'qt', hidden: true, role: 'status', 'aria-live': 'polite' }, [this.roll]);
    // reach for it and it swings on its nail
    this.roll.addEventListener('pointerenter', () => { this.wake(); this.vel += 16 * (Math.random() < 0.5 ? -1 : 1); this.sVel += 10; });
    ui.hud.append(this.el);
    const root = document.documentElement.style;
    root.setProperty('--qt-rod', `url("${rodArt()}")`);
    root.setProperty('--qt-sheet', `url("${sheetArt()}")`);
    root.setProperty('--qt-curl', `url("${curlArt()}")`);
    if (SLOW > 1) root.setProperty('--qt-slow', SLOW);
    root.setProperty('--qt-twine', `url("${twineArt()}")`);
    this.marks = ui.questMarks = new QuestMarks(ui);
    // draw the book's little pictures while nothing's happening, so the first opening is instant
    const warm = () => { try { for (const k of ['quests', 'map', 'skills', 'index', 'lore']) BART.tab(k); for (const k of PIN_KINDS) BART.pin(k); pipArt(true); pipArt(false); for (let k = 0; k < 8; k++) ARROW(k); } catch (e) { /* noop */ } };
    if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 8000 }); else setTimeout(warm, 4000);
  }

  /** Hide the poster (cutscenes) or bring it back. */
  mute(on = true) { this.muted = !!on; this.el.classList.toggle('muted', this.muted); }

  bind(q) {
    this.quests = q;
    q.on('progress', (e) => { this.push({ kind: 'progress', ...e }); this.progressToast(e); });
    q.on('step', (e) => { this.push({ kind: 'step', ...e }); this.stepToast(e); });
    q.on('done', (e) => { this.push({ kind: 'done', ...e }); this.doneToast(e); });
    q.on('track', (e) => this.push({ kind: 'track', ...e }));
    q.on('start', (e) => this.onStart(e));
    q.on('say', (e) => this.sayToast(e));
    q.on('change', (e) => { if (e.boot) { this.pending = []; this.show(q.tracked(), { instant: true }); } });
    this.show(q.tracked(), { instant: true });
  }

  update(dt) {
    if (!this.quests && this.game.quests) this.bind(this.game.quests);
    if (!this.quests) return;
    this.idleT += dt;
    if (this.idleT > IDLE && !this.el.classList.contains('idle') && !this.running) this.el.classList.add('idle');
    // a quest finished in another screen (no event seen): keep the poster honest
    this._syncT = (this._syncT || 0) + dt;
    if (this._syncT > 1 && !this.running && !this.pending.length) {
      this._syncT = 0;
      const v = this.quests.tracked();
      if ((v?.id || null) !== (this.shown?.id || null) || (v && (v.i !== this.shown.i || v.n !== this.shown.n))) this.show(v, { instant: true });
    }
    try { this.marks.update(dt); } catch (e) { if (!this._mErr) { this._mErr = true; console.warn('quest marks', e); } }
    this._whereT = (this._whereT || 0) - dt;
    if (this._whereT <= 0) { this._whereT = 0.12; this.updateWhere(); }
    this._posT = (this._posT || 0) - dt;
    if (this._posT <= 0) { this._posT = 0.5; this.placeUnderPack(); if (this._guess && this.visible()) this.layoutPoster(); }
    this.physics(dt / SLOW);
  }

  /**
   * The swing: a damped pendulum about the nail, nudged by drops, tugs and the cursor; at rest it
   * drifts in a faint draught. The scroll hangs off it and lags behind on its twine.
   */
  physics(dt) {
    if (this.el.hidden || !this.visible()) { this.ang = this.vel = this.sAng = this.sVel = 0; return; }
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const sway = Math.sin(this.t * 1.13) * 0.5 + Math.sin(this.t * 0.47 + 1.7) * 0.35;
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const acc = -72 * (this.ang - sway) - 2.4 * this.vel;
      this.vel += acc * h; this.ang += this.vel * h;
      const sacc = -150 * this.sAng - 8 * this.sVel - 0.2 * acc;
      this.sVel += sacc * h; this.sAng += this.sVel * h;
    }
    this.ang = Math.max(-28, Math.min(28, this.ang));
    // whole quarter degrees only: at rest the pixels hold still between the draught's little tilts
    const q = (v) => (Math.abs(v) < 0.2 ? 0 : Math.round(v * 4) / 4);
    const a = q(this.ang) + 'deg', s = q(this.sAng) + 'deg';
    if (a !== this._a) { this._a = a; this.swingEl.style.rotate = a; }
    if (s !== this._s) { this._s = s; this.scroll.style.rotate = s; }
  }

  wake() { this.idleT = 0; this.el.classList.remove('idle'); }

  /** Sit just under the backpack and its tags (weight, pockets), whatever their size. */
  placeUnderPack() {
    if (this.el.hidden) return;
    const hud = this.ui.hud, base = hud.getBoundingClientRect();
    let bottom = 0;
    for (const sel of ['.hud-tr .pack', '.hud-tr .pack-tag', '.hud-tr .pack-load-t', '.hud-tr .journal-btn']) {
      for (const n of hud.querySelectorAll(sel)) {
        if (!n.offsetParent && n.getClientRects().length === 0) continue;
        const r = n.getBoundingClientRect();
        if (r.height > 0 && r.bottom > bottom) bottom = r.bottom;
      }
    }
    if (!bottom) { this.el.style.top = ''; return; }
    const top = Math.round(bottom - base.top - cssPx() * 2);
    if (this._top !== top) { this._top = top; this.el.style.top = top + 'px'; }
  }

  /** The where line: arrow and distance (the place's name is in the tooltip). */
  updateWhere() {
    if (!this.shown) { this.where.hidden = true; this.syncProg(); return; }
    const r = this.marks.bearing();
    const t = r?.t, b = r?.b;
    if (!t || t.quest?.id !== this.shown.id || (!b && !t.depth)) { this.where.hidden = true; this.syncProg(); this.setTip(null); return; }
    const deep = this.game.sceneName === 'deep' || this.game.sceneName === 'mine';
    let dist = '', k = -1;
    if (b) {
      k = ((Math.round(b.rel / (Math.PI / 4)) % 8) + 8) % 8;
      const near = b.d3 < (t.r || 2.5);
      dist = near ? 'here' : `${Math.round(b.dist)}m`;
      if (deep && Math.abs(b.dy) > 3 && !near) dist += `${b.dy > 0 ? '▲' : '▼'}`;
      if (near) k = -1;
    } else if (t.depth && deep) {
      const me = this.game.scene?.player?.pos;
      const down = me ? Math.round(t.depth + me.y) : 0;
      dist = down > 0 ? `▼${down}m` : 'here';
    }
    this.where.hidden = !dist;
    this.syncProg();
    this.arrow.hidden = k < 0;
    if (k >= 0 && this._k !== k) { this._k = k; this.arrow.src = ARROW(k); }
    if (this.dist.textContent !== dist) this.dist.textContent = dist;
    this.where.classList.toggle('via', !!t.via);
    this.setTip([t.label, t.sub].filter(Boolean).join(' · '));
  }

  setTip(place) {
    const v = this.shown;
    const tip = v ? [v.full, place].filter(Boolean).join(' · ') : 'Your quests (B)';
    if (this._tip !== tip) { this._tip = tip; this.roll.title = tip; }
  }

  // ------------------------------------------------------------ events → a queue of little animations
  push(e) {
    this.pending.push(e);
    if (!this.running) this.run();
  }

  async run() {
    this.running = true;
    try {
      await null; // let a burst of events (a quest finished in one go: its steps, then 'done') queue up first
      while (this.pending.length) {
        let e = this.pending.shift();
        // a burst of steps (a lesson skipping ahead) plays once, landing on the latest
        while (this.pending.length && this.pending[0].id === e.id && (this.pending[0].kind === 'step' || this.pending[0].kind === 'progress') && (e.kind === 'step' || e.kind === 'progress')) {
          const nx = this.pending.shift();
          e = nx.kind === 'step' || e.kind === 'step' ? { ...nx, kind: 'step' } : nx;
        }
        if (this.pending[0]?.kind === 'done' && this.pending[0].id === e.id && e.kind !== 'done') continue;
        await this.play(e);
      }
    } catch (err) { console.warn('tracker', err); }
    this.running = false;
  }

  visible() { return !this.el.hidden && !this.muted && this.ui.hudMode === 'deep'; }

  async play(e) {
    const q = this.quests;
    const tracked = q.data.tracked;
    const visible = this.visible();
    if (e.kind === 'progress') {
      if (e.id !== this.shown?.id) return;
      const v = q.get(e.id);
      if (!v || v.status !== 'active') return;
      this.wake();
      // gold ticks and rapid counts (walking a biome) update quietly; a real step forward is inked in
      const now = performance.now(), quick = now - (this._lastInk || 0) < 1600;
      if ((e.passive && v.step?.gold) || quick || !visible) { this.setCount(v); this.shown.n = v.n; if (!quick && visible) this.pulse(this.num); return; }
      this._lastInk = now;
      await this.inkProgress(v);
      return;
    }
    if (e.kind === 'step') {
      if (q.get(e.id)?.status !== 'active') return; // finished meanwhile: its 'done' plays next
      if (e.id !== this.shown?.id) { if (e.id === tracked) await this.swapPoster(q.tracked(), visible, { tear: false }); return; }
      this.wake();
      if (!visible) { this.show(q.get(e.id), { instant: true }); return; }
      await this.tickOff();
      await this.rollUp();
      if (q.get(e.id)?.status !== 'active') return; // finished while it rolled up: the 'done' tears it off
      this.fillStep(q.get(e.id));
      await this.unroll();
      return;
    }
    if (e.kind === 'done') {
      if (e.id !== this.shown?.id) return;
      this.wake();
      if (visible && !this.scroll.classList.contains('rolled')) { await this.tickOff(); await this.rollUp(); }
      await this.swapPoster(q.tracked(), visible, { tear: true });
      return;
    }
    if (e.kind === 'track') {
      const v = q.tracked();
      if ((v?.id || null) === (this.shown?.id || null)) return;
      this.wake();
      await this.swapPoster(v, visible, { tear: false });
    }
  }

  // ------------------------------------------------------------ filling it in
  setCount(v) {
    const max = v.max || 1, n = Math.min(v.n || 0, max);
    this.pips.textContent = '';
    this.num.textContent = '';
    if (max > 1 && max <= MAX_PIPS && !v.step?.gold) {
      const acc = this.look?.acc;
      for (let i = 0; i < max; i++) this.pips.append(el('img', { class: 'pix qt-pip' + (i < n ? ' on' : ''), src: pipArt(i < n, acc), alt: '' }));
    } else if (max > 1) this.num.textContent = v.step?.gold ? `${shortGold(n)}/${shortGold(max)}` : `${n}/${max}`;
    this._max = max;
    this.syncProg();
    this.el.dataset.n = n; this.el.dataset.max = max;
  }

  syncProg() { const h = (this._max || 1) <= 1 && this.where.hidden; if (this.prog.hidden !== h) this.prog.hidden = h; }

  fillStep(v) {
    this.text.textContent = brief(v.text) || v.text;
    this.setCount(v);
    this.text.classList.remove('struck');
    this.tick.classList.remove('on');
    this.el.dataset.step = v.i;
    this.shown = { ...(this.shown || {}), id: v.id, i: v.i, n: v.n, text: v.text, full: v.text };
    this._tip = null;
    this.setTip(null);
  }

  fill(v) {
    const def = v.def;
    this.look = posterLook(def, v.id);
    this.title.textContent = v.title;
    this.el.classList.toggle('main', def.kind === 'main');
    this.el.dataset.kind = def.kind;
    this.el.dataset.quest = v.id;
    this.el.dataset.motif = this.look.motif;
    this.shown = { id: v.id };
    this.fillStep(v);
    this._k = null;
    this.layoutPoster();
    this.updateWhere();
  }

  /** Size the poster to its title (one, two or three lines: more middle bands of paper) and print it. */
  layoutPoster() {
    if (!this.shown || !this.look) return;
    const P = cssPx(), th = this.title.offsetHeight;
    this._guess = !th;
    const art = th ? th / P : Math.ceil(this.title.textContent.length / 10) * 6;
    const k = Math.max(1, Math.ceil((TITLE_Y + art - 27) / MID_H));
    const key = this.shown.id + ':' + k;
    if (this._posterKey === key) return;
    this._posterKey = key;
    this.poster.style.height = `calc(var(--px) * ${27 + k * MID_H + 6})`;
    this.poster.style.backgroundImage = `url("${posterArt(this.shown.id, this.look, k)}")`;
  }

  show(v, { instant = false } = {}) {
    if (!v) { this.shown = null; this.el.hidden = true; return; }
    this.el.hidden = false;
    this.fill(v);
    this.placeUnderPack();
    if (instant) {
      for (const a of this.drop.getAnimations()) a.cancel();
      for (const a of this.sheet.getAnimations()) a.cancel();
      this.sheet.style.height = '';
      this.scroll.classList.remove('rolled');
    }
  }

  // ------------------------------------------------------------ pieces of animation
  /** The next pip is inked in (or the count scratched over), a little ink flicks off it. */
  async inkProgress(v) {
    const before = this.pips.querySelectorAll('.qt-pip.on').length;
    if (v.max > MAX_PIPS || v.step?.gold) {
      this.num.classList.remove('scratch'); void this.num.offsetWidth; this.num.classList.add('scratch');
      SFX.scratch(this.game.audio, { n: 3 });
      await wait(170);
      this.setCount(v);
      this.pulse(this.num);
    } else {
      this.setCount(v);
      const pips = [...this.pips.children];
      for (let i = before; i < Math.min(v.n, pips.length); i++) { pips[i].classList.add('inked'); this.splat(pips[i]); }
      SFX.tick(this.game.audio);
    }
    this.shown.n = v.n;
    this.sVel += 14;
    await wait(360);
  }

  /** Three or four tiny square drops of ink thrown off a mark. */
  splat(node) {
    for (let i = 0; i < 4; i++) {
      const d = el('i', { class: 'qt-ink' });
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 5;
      d.style.setProperty('--dx', `calc(var(--px) * ${(Math.cos(a) * r).toFixed(1)})`);
      d.style.setProperty('--dy', `calc(var(--px) * ${(Math.sin(a) * r * 0.7).toFixed(1)})`);
      d.style.setProperty('--c', '#' + (this.look?.acc?.[0] ?? 0xa8321e).toString(16).padStart(6, '0'));
      node.parentNode?.append(d);
      d.style.left = node.offsetLeft + node.offsetWidth / 2 + 'px';
      d.style.top = node.offsetTop + node.offsetHeight / 2 + 'px';
      setTimeout(() => d.remove(), 650 * SLOW);
    }
  }

  pulse(node) { node.classList.remove('pulse'); void node.offsetWidth; node.classList.add('pulse'); }

  /** A brushed ink tick in the margin and a stroke through the step. */
  async tickOff() {
    this.tick.classList.remove('on'); void this.tick.offsetWidth; this.tick.classList.add('on');
    SFX.tick(this.game.audio);
    this.vel += 9;
    await wait(200);
    this.text.classList.add('struck');
    SFX.scratch(this.game.audio, { n: 4 });
    await wait(560);
  }

  /** The scroll rolls itself up onto its top rod. */
  async rollUp() {
    const h = this.sheet.offsetHeight;
    if (!h) { this.scroll.classList.add('rolled'); return; }
    SFX.unroll(this.game.audio, { up: true });
    this.rodB.classList.add('spin');
    const a = anim(this.sheet, [{ height: h + 'px' }, { height: '0px' }], { duration: 300, easing: 'cubic-bezier(.55, 0, .9, .45)', fill: 'forwards' });
    await done(a);
    this.scroll.classList.add('rolled');
    this.sheet.style.height = '0px';
    a.cancel();
    this.rodB.classList.remove('spin');
    this.sVel -= 18;
    await wait(90);
  }

  /** It drops open: the heavy rod falls, overshoots, bounces, wobbles still. */
  async unroll() {
    const h = this.sheetIn.offsetHeight, P = cssPx();
    this.scroll.classList.remove('rolled');
    SFX.unroll(this.game.audio);
    this.rodB.classList.add('spin');
    const a = anim(this.sheet, [
      { height: '0px', easing: 'cubic-bezier(.4, 0, .9, .6)' },
      { height: `${h + P * 3}px`, offset: 0.62, easing: 'ease-out' },
      { height: `${h - P * 1.5}px`, offset: 0.8, easing: 'ease-in-out' },
      { height: `${h + P * 0.5}px`, offset: 0.92 },
      { height: `${h}px` },
    ], { duration: 560 });
    setTimeout(() => { this.rodB.classList.remove('spin'); this.sVel += 20; }, 340 * SLOW);
    await done(a);
    this.sheet.style.height = '';
    anim(this.rodB, [{ rotate: '-4deg' }, { rotate: '3deg', offset: 0.3 }, { rotate: '-1.5deg', offset: 0.6 }, { rotate: '0deg' }], { duration: 420, easing: 'ease-out' });
  }

  /** The poster lands from above, catches on the nail, swings; then the scroll opens. */
  async dropIn(v) {
    this.show(v);
    this.scroll.classList.add('rolled');
    this.sheet.style.height = '0px';
    const P = cssPx(), r = this.drop.getBoundingClientRect(), dy = -Math.max(240, r.bottom + 40);
    const kf = [
      { transform: `translate(${P * 5}px, ${dy}px) rotate(-16deg)`, easing: 'cubic-bezier(.4, 0, .85, .55)' },
      { transform: `translate(${-P * 4}px, ${dy * 0.52}px) rotate(10deg)`, offset: 0.38, easing: 'cubic-bezier(.3, 0, .8, .6)' },
      { transform: `translate(${P * 2}px, ${dy * 0.16}px) rotate(-6deg)`, offset: 0.7, easing: 'cubic-bezier(.4, 0, 1, .7)' },
      { transform: 'translate(0px, 0px) rotate(0deg)', offset: 0.84, easing: 'ease-out' },
      { transform: `translate(0px, ${P * 2.5}px) scale(1.02, .955)`, offset: 0.91, easing: 'ease-in-out' },
      { transform: `translate(0px, ${-P * 0.8}px) scale(.99, 1.015)`, offset: 0.96 },
      { transform: 'translate(0px, 0px) rotate(0deg)' },
    ];
    const a = anim(this.drop, kf, { duration: 820 });
    for (const old of this.drop.getAnimations()) if (old !== a) old.cancel();
    PSFX.flutter(this.game.audio, { n: 6 });
    await wait(820 * 0.84);
    PSFX.catch(this.game.audio);
    this.vel += 58 * (Math.random() < 0.5 ? -1 : 1);
    await done(a);
    await wait(120);
    await this.unroll();
  }

  /** Off the nail: torn (a scrap stays pinned) or just lifted off; it flutters down out of sight. */
  async away(tear) {
    const P = cssPx(), dir = Math.random() < 0.5 ? -1 : 1;
    if (tear && this.shown && this.look) {
      PSFX.rip(this.game.audio);
      this.scrap.src = scrapArt(this.look);
      this.scrap.hidden = false;
      anim(this.scrap, [{ translate: `0 ${P * 1.5}px` }, { translate: '0 0' }], { duration: 240, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    } else SFX.unroll(this.game.audio, { up: true });
    const a = anim(this.drop, [
      { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1, easing: 'ease-out' },
      { transform: `translate(0px, ${P * (tear ? 3 : -3)}px) rotate(${dir * 2}deg)`, offset: 0.1, easing: 'ease-in' },
      { transform: `translate(${dir * P * 7}px, ${P * 20}px) rotate(${-dir * 18}deg) scale(.95, .88)`, offset: 0.32, easing: 'ease-in-out' },
      { transform: `translate(${-dir * P * 9}px, ${P * 48}px) rotate(${dir * 14}deg) scale(.72, 1)`, offset: 0.56, easing: 'ease-in-out' },
      { transform: `translate(${dir * P * 12}px, ${P * 84}px) rotate(${-dir * 32}deg) scale(.9, .62)`, opacity: 1, offset: 0.8, easing: 'ease-in' },
      { transform: `translate(${-dir * P * 4}px, ${P * 126}px) rotate(${-dir * 10}deg) scale(.55, .9)`, opacity: 0 },
    ], { duration: 1150, fill: 'forwards' });
    PSFX.flutter(this.game.audio, { n: 9, vol: 0.8, delay: 0.12 });
    this.vel = 0;
    await done(a);
  }

  /** Swap the poster: the old one goes (torn or lifted off), the new one drops in. */
  async swapPoster(v, visible, { tear = false } = {}) {
    if (!visible) { this.show(v, { instant: true }); return; }
    if (this.shown && !this.el.hidden) await this.away(tear);
    if (!v) { this.show(null); for (const a of this.drop.getAnimations()) a.cancel(); return; }
    await wait(140);
    await this.dropIn(v);
  }

  // ------------------------------------------------------------ toasts
  onStart(e) {
    // starts arrive in bursts (the lessons end and Old Star has a list): one toast for the lot
    this.starts.push(e);
    clearTimeout(this._startT);
    this._startT = setTimeout(() => {
      const list = this.starts;
      this.starts = [];
      if (!list.length) return;
      this.ui.status?.setBadge?.(true);
      if (list.length === 1) {
        const v = list[0].quest;
        if (v?.id && v.id === this.quests?.data.tracked && this.visible()) return; // its poster drops in: no words needed
        this.ui.toast(`New: <b>${v.title}</b>`, { icon: npcFace(this.game, v.giver, { size: 40 }), dur: 2600 }); // (wave 18: short; the poster has the rest)
      } else {
        this.ui.toast(`<b>${list.length} new tasks</b>`, { icon: BART.tab('quests') });
      }
    }, 80);
  }

  /** Progress on a quest that isn't on the poster (or while it can't be seen): a little note. */
  progressToast(e) {
    const v = e.quest;
    if (!v || (e.passive && v.step?.gold) || this.quests.talking) return;
    if (e.id === this.shown?.id && this.visible()) return;
    const now = performance.now();
    if (now - (this.toastT[e.id] || 0) < 2500) return;
    this.toastT[e.id] = now;
    this.ui.toast(`<b>${v.title}</b> <b class="gold-txt">${countText(v)}</b>`, { icon: npcFace(this.game, v.giver, { size: 40 }), dur: 1800 });
  }

  /** A step done: what's next (when the poster isn't showing that quest, or can't be seen). */
  stepToast(e) {
    const v = e.quest;
    if (!v || v.id === 'lessons' || this.quests.talking) return;
    if (e.id === this.quests.data.tracked && this.visible()) return;
    this.ui.toast(`Next: <b>${v.title}</b>`, { icon: BART.box(true), dur: 2200 });
  }

  /**
   * Somebody's line when a step is done (Old Star says his through the tutor when he's there).
   * Wave 18: no quote toasts any more (they piled up at the top); whatever they hand over flies
   * into the backpack instead.
   */
  sayToast(e) {
    if (!e?.text || (this.quests.talking && (!e.by || e.by === this.quests.talking))) return;
    if (e.by === 'oldstar' && this.game.sceneName === 'home' && this.ui.tutor?.say) { this.ui.tutor.say(e.text, { mood: e.mood || 'calm', key: 'quest-say' }); return; }
    if (e.items) this.flyReward({ items: e.items }, 200);
  }

  /** Rewards are things: items arc into the backpack, gold into the pouch (src/ui/Hud.js flyReward). */
  flyReward(r, delay = 0) { this.ui.status?.flyReward?.(r, delay); }

  doneToast(e) {
    const v = e.quest;
    if (!v) return;
    // wave 18: one short line (the queue in UI.toast keeps them one at a time); the rewards fly home
    // as things, no reward list, no quote
    setTimeout(() => {
      this.ui.toast(`<b>${v.title}</b> · done!`, { kind: 'good', icon: BART.stamp(), dur: 2600 });
      this.game.audio.play('success', { vol: 0.6 });
      this.flyReward(e.reward, 350);
    }, this.ui.hudMode === 'deep' ? 650 : 0);
  }
}

export { POSTER_W };

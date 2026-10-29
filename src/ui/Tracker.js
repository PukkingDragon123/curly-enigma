// The objective tracker: a parchment strip hung under the backpack in every first-person scene.
// It says plainly what to do now: the quest (with its giver's seal), the current step with a
// tick box, the count and a progress bar, and where it is: an arrow that turns as you turn, the
// distance (▲ ▼ when it's above or below you) and the place ("Nibble & Root · Deep Town", "The town
// lift · in the mine"). Progress is scratched in with a quill, a finished step gets ticked and struck
// through before the strip rolls up and opens on the next one, and a finished quest gets Old Star's
// red stamp. Tap it for the book. It also drives the world markers (src/ui/QuestMarks.js) and the
// toasts: a new quest, progress on quests not on the strip, the next step, people's lines, rewards.
// Reads game.quests (src/core/quests.js) once it exists; UI.update drives it.
import { el, formatGoldFull } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { NPCS, QUESTS, npcName } from '../data/quests.js';
import { LORE_BY_ID } from '../data/lore.js';
import { BART, PIN_KINDS } from './bookArt.js';
import { SFX } from './bookSfx.js';
import { QuestMarks } from './QuestMarks.js';
import { npcFace, faceReady } from './npcFace.js';
import { Px, art } from './uiArt.js';
import './quests.css';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const IDLE = 14; // seconds before the strip settles down to just the line

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

// ------------------------------------------------------------ the direction arrow (8 crisp pixel arrows)
function arrowPx(k) {
  const p = new Px(13, 13);
  const a = (k / 8) * Math.PI * 2, c = 6;
  const fx = Math.sin(a), fy = -Math.cos(a);
  const tip = [c + fx * 5, c + fy * 5], tail = [c - fx * 4, c - fy * 4];
  const col = 0x8a3a1a, hi = 0xc8642a;
  p.line(Math.round(tail[0]), Math.round(tail[1]), Math.round(tip[0]), Math.round(tip[1]), col);
  p.line(Math.round(tail[0] + fy * 0.9), Math.round(tail[1] - fx * 0.9), Math.round(tip[0] + fy * 0.9 - fx), Math.round(tip[1] - fx * 0.9 - fy), col);
  for (const s of [-1, 1]) {
    const bx = tip[0] - fx * 3.4 + fy * s * 3.2, by = tip[1] - fy * 3.4 - fx * s * 3.2;
    p.line(Math.round(tip[0]), Math.round(tip[1]), Math.round(bx), Math.round(by), col);
    p.line(Math.round(tip[0] - fx), Math.round(tip[1] - fy), Math.round(bx - fx * 0.8), Math.round(by - fy * 0.8), hi);
  }
  p.set(Math.round(tip[0]), Math.round(tip[1]), 0x5a1e0a);
  return p;
}
const ARROW = (k) => art('qt:arrow' + k, () => arrowPx(k));
const sealPx = () => { const p = new Px(9, 9); p.disk(4.5, 4.5, 4.2, 0xb8402c); p.disk(4.5, 4.5, 2.6, 0xd8583a); p.set(3, 3, 0xff9a7a); p.outline(0x5a140c); return p; };
const SEAL = () => art('qt:seal', sealPx);

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
    document.documentElement.style.setProperty('--a-qstrip', `url("${BART.strip()}")`);

    this.face = el('img', { class: 'pix qt-face', src: SEAL(), alt: '' });
    this.title = el('span', { class: 'qt-title' });
    this.of = el('span', { class: 'qt-of' });
    this.box = el('img', { class: 'pix qt-box', src: BART.box(false), alt: '' });
    this.text = el('span', { class: 'qt-text' });
    this.strike = el('i', { class: 'qt-strike' });
    this.num = el('span', { class: 'qt-n' });
    this.bar = el('i', { class: 'qt-bar', hidden: true }, [el('b')]);
    this.line = el('div', { class: 'qt-line' }, [this.box, el('span', { class: 'qt-tx' }, [this.text, this.strike]), this.num]);
    this.arrow = el('img', { class: 'pix qt-arrow', src: ARROW(0), alt: '' });
    this.dist = el('b', { class: 'qt-dist' });
    this.place = el('span', { class: 'qt-place' });
    this.where = el('div', { class: 'qt-where', hidden: true }, [this.arrow, this.dist, this.place]);
    this.paper = el('div', { class: 'qt-paper' }, [el('div', { class: 'qt-head' }, [this.face, this.title, this.of]), this.line, this.bar, this.where]);
    this.quill = el('img', { class: 'pix qt-quill', src: BART.quill(), alt: '' });
    this.stamp = el('img', { class: 'pix qt-stamp', src: BART.stamp(), alt: '' });
    this.tag = el('span', { class: 'qt-tag' }, 'New');
    this.roll = el('button', {
      class: 'qt-roll', title: 'Your quests (B)', 'aria-label': 'Current objective: open the book',
      onclick: (e) => { e.stopPropagation(); this.game.audio.init?.(); ui.openBook?.('quests'); },
    }, [this.paper, this.tag, this.stamp]);
    this.el = el('div', { class: 'qt', hidden: true, role: 'status', 'aria-live': 'polite' }, [this.roll, this.quill]);
    this.roll.addEventListener('pointerenter', () => this.wake());
    ui.hud.append(this.el);
    this.marks = ui.questMarks = new QuestMarks(ui);
    // draw the book's little pictures while nothing's happening, so the first opening is instant
    const warm = () => { try { for (const k of ['quests', 'map', 'skills', 'index', 'lore']) BART.tab(k); for (const k of PIN_KINDS) BART.pin(k); BART.box(true); for (let k = 0; k < 8; k++) ARROW(k); } catch (e) { /* noop */ } };
    if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 8000 }); else setTimeout(warm, 4000);
  }

  /** Hide the strip (cutscenes) or bring it back. */
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
    // a quest finished in another screen (no event seen): keep the strip honest
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
    if (this._posT <= 0) { this._posT = 0.5; this.placeUnderPack(); }
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
    const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
    const top = Math.round(bottom - base.top + px * 3);
    if (this._top !== top) { this._top = top; this.el.style.top = top + 'px'; }
  }

  /** The where line: arrow, distance, place (from the world markers' resolved target). */
  updateWhere() {
    if (!this.shown) { this.where.hidden = true; return; }
    // the giver's face is drawn in the background: swap the stand-in sketch for it when it's ready
    if (!this._faceOk) { const g = QUESTS[this.shown.id]?.giver; if (g && faceReady(g, 40)) { this.face.src = npcFace(this.game, g, { size: 40 }); this._faceOk = true; } else if (g) npcFace(this.game, g, { size: 40 }); }
    const r = this.marks.bearing();
    const t = r?.t, b = r?.b;
    if (!t || t.quest?.id !== this.shown.id || (!t.label && !t.sub && !b && !t.depth)) { this.where.hidden = true; return; }
    this.where.hidden = false;
    const deep = this.game.sceneName === 'deep' || this.game.sceneName === 'mine';
    let dist = '', k = -1;
    if (b) {
      k = ((Math.round(b.rel / (Math.PI / 4)) % 8) + 8) % 8;
      const near = b.d3 < (t.r || 2.5);
      dist = near ? 'here' : `${Math.round(b.dist)} m`;
      if (deep && Math.abs(b.dy) > 3 && !near) dist += ` ${b.dy > 0 ? '▲' : '▼'}${Math.round(Math.abs(b.dy))}`;
      if (near) k = -1;
    } else if (t.depth && deep) {
      const me = this.game.scene?.player?.pos;
      const down = me ? Math.round(t.depth + me.y) : 0;
      dist = down > 0 ? `▼ ${down} m deeper` : 'you\'re there';
    }
    this.arrow.hidden = k < 0;
    if (k >= 0 && this._k !== k) { this._k = k; this.arrow.src = ARROW(k); }
    if (this.dist.textContent !== dist) this.dist.textContent = dist;
    const place = [t.label, t.sub].filter(Boolean).join(' · ');
    if (this.place.textContent !== place) this.place.textContent = place;
    this.where.classList.toggle('via', !!t.via);
  }

  // ------------------------------------------------------------ events → a queue of little animations
  push(e) {
    this.pending.push(e);
    if (!this.running) this.run();
  }

  async run() {
    this.running = true;
    try {
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
      // gold ticks and rapid counts (walking a biome) update quietly; a real step forward gets the quill
      const now = performance.now(), quick = now - (this._lastScribble || 0) < 1600;
      if ((e.passive && v.step?.gold) || quick) { this.setCount(v); this.shown.n = v.n; if (!quick) this.pulse(this.num); return; }
      this._lastScribble = now;
      await this.scribble(v, visible);
      return;
    }
    if (e.kind === 'step') {
      if (q.get(e.id)?.status !== 'active') return; // finished meanwhile: its 'done' plays next
      if (e.id !== this.shown?.id) { if (e.id === tracked) await this.swap(q.tracked(), visible); return; }
      this.wake();
      await this.tickOff(visible);
      await this.swap(q.get(e.id), visible, { roll: true });
      return;
    }
    if (e.kind === 'done') {
      if (e.id !== this.shown?.id) return;
      this.wake();
      await this.tickOff(visible);
      await this.slam(visible);
      await wait(visible ? 1100 : 0);
      this.stamp.classList.remove('on', 'slam');
      await this.swap(q.tracked(), visible, { roll: true });
      return;
    }
    if (e.kind === 'track') {
      const v = q.tracked();
      if ((v?.id || null) === (this.shown?.id || null)) return;
      this.wake();
      await this.swap(v, visible, { roll: !!this.shown, fresh: true });
    }
  }

  // ------------------------------------------------------------ pieces of animation
  setCount(v) {
    this.num.textContent = countText(v);
    const show = v.max > 1;
    this.bar.hidden = !show;
    if (show) this.bar.firstChild.style.width = Math.round(Math.min(1, v.n / v.max) * 100) + '%';
  }

  fill(v) {
    const def = v.def;
    this.title.textContent = v.title;
    this.title.style.color = NPCS[def.giver]?.ink || '';
    this.face.src = def.giver ? npcFace(this.game, def.giver, { size: 40 }) : SEAL();
    this._faceOk = !def.giver || faceReady(def.giver, 40);
    this.of.textContent = def.steps.length > 1 && v.status === 'active' ? `step ${v.i + 1} of ${def.steps.length}` : '';
    this.text.textContent = v.text;
    this.setCount(v);
    this.box.src = BART.box(false);
    this.strike.classList.remove('go');
    this.el.classList.toggle('main', def.kind === 'main');
    this.el.dataset.kind = def.kind;
    this.shown = { id: v.id, i: v.i, n: v.n, text: v.text };
    this._k = null;
    this.updateWhere();
  }

  show(v, { instant = false } = {}) {
    if (!v) { this.shown = null; this.el.hidden = true; return; }
    this.el.hidden = false;
    this.fill(v);
    this.placeUnderPack();
    if (instant) { this.roll.classList.remove('rolled', 'opening'); this.tag.classList.remove('on'); }
  }

  async swap(v, visible, { roll = false, fresh = false } = {}) {
    if (!visible) { this.show(v, { instant: true }); return; }
    if (roll && this.shown) {
      SFX.unroll(this.game.audio, { up: true });
      this.roll.classList.add('rolled');
      await wait(300);
    }
    if (!v) { this.show(null); this.roll.classList.remove('rolled'); return; }
    this.show(v);
    this.roll.classList.add('rolled');
    void this.roll.offsetWidth;
    this.roll.classList.remove('rolled');
    this.roll.classList.add('opening');
    SFX.unroll(this.game.audio);
    this.tag.classList.toggle('on', fresh);
    await wait(320);
    this.roll.classList.remove('opening');
    // the quill writes the new line in
    await this.write(this.line);
    if (fresh) setTimeout(() => this.tag.classList.remove('on'), 2600);
  }

  /** The quill hovers at a node, scratching, while it's revealed left to right. */
  async write(node, { ms = 520 } = {}) {
    node.classList.remove('ink');
    void node.offsetWidth;
    node.classList.add('ink');
    this.quillTo(node, true);
    SFX.scratch(this.game.audio, { n: 5 });
    await wait(ms);
    this.quill.classList.remove('on');
    node.classList.remove('ink');
  }

  quillTo(node, sweep = false) {
    const r = node.getBoundingClientRect(), base = this.el.getBoundingClientRect();
    this.quill.style.left = Math.round(r.left - base.left) + 'px';
    this.quill.style.top = Math.round(r.top - base.top + r.height * 0.5) + 'px';
    this.quill.style.setProperty('--sweep', Math.round(r.width) + 'px');
    this.quill.classList.remove('on', 'sweep', 'jot');
    void this.quill.offsetWidth;
    this.quill.classList.add('on', sweep ? 'sweep' : 'jot');
  }

  /** A count goes up: the old number is crossed out and the new one written over it. */
  async scribble(v, visible) {
    if (!visible) { this.setCount(v); this.shown.n = v.n; return; }
    this.num.classList.remove('scratch');
    void this.num.offsetWidth;
    this.num.classList.add('scratch');
    this.quillTo(this.num);
    SFX.scratch(this.game.audio, { n: 3 });
    await wait(180);
    this.setCount(v);
    this.shown.n = v.n;
    this.pulse(this.num);
    await wait(260);
    this.num.classList.remove('scratch');
    this.quill.classList.remove('on');
  }

  pulse(node) { node.classList.remove('pulse'); void node.offsetWidth; node.classList.add('pulse'); }

  /** Tick the box and strike the line through. */
  async tickOff(visible) {
    if (!visible) return;
    this.box.src = BART.box(true);
    this.pulse(this.box);
    SFX.tick(this.game.audio);
    await wait(120);
    this.strike.classList.add('go');
    this.quillTo(this.text, true);
    SFX.scratch(this.game.audio, { n: 4 });
    await wait(480);
    this.quill.classList.remove('on');
  }

  /** Old Star's stamp comes down on a finished quest. */
  async slam(visible) {
    if (!visible) return;
    this.stamp.classList.remove('on', 'slam');
    void this.stamp.offsetWidth;
    this.stamp.classList.add('on', 'slam');
    await wait(150);
    SFX.stamp(this.game.audio);
    this.roll.classList.remove('shake');
    void this.roll.offsetWidth;
    this.roll.classList.add('shake');
    this.splatter();
    await wait(260);
  }

  splatter() {
    for (let i = 0; i < 7; i++) {
      const d = el('i', { class: 'qt-dot' });
      const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 16;
      d.style.setProperty('--dx', Math.round(Math.cos(a) * r) + 'px');
      d.style.setProperty('--dy', Math.round(Math.sin(a) * r * 0.6) + 'px');
      this.roll.append(d);
      setTimeout(() => d.remove(), 700);
    }
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
        const v = list[0].quest, who = v.giverName;
        const head = list[0].accept ? 'Quest accepted' : v.kind === 'request' ? `A request from ${who}` : v.kind === 'village' || v.kind === 'lore' ? `${who} asks a favour` : `New task from ${who}`;
        this.ui.toast(`<small>${head}</small><br><b>${v.title}</b><br><small class="qt-first">First: ${v.text}</small>`, { icon: npcFace(this.game, v.giver, { size: 40 }), dur: 4200 });
      } else {
        this.ui.toast(`<b>${list.length} new tasks</b> in your book <small>(B)</small>`, { icon: BART.tab('quests') });
      }
    }, 80);
  }

  /** Progress on a quest that isn't on the strip (or while the strip can't be seen): a little note. */
  progressToast(e) {
    const v = e.quest;
    if (!v || (e.passive && v.step?.gold) || this.quests.talking) return;
    if (e.id === this.shown?.id && this.visible()) return;
    const now = performance.now();
    if (now - (this.toastT[e.id] || 0) < 2500) return;
    this.toastT[e.id] = now;
    this.ui.toast(`<b>${v.title}</b> · ${v.text} <b class="gold-txt">${countText(v)}</b>`, { icon: npcFace(this.game, v.giver, { size: 40 }), dur: 2200 });
  }

  /** A step done: what's next (when the strip isn't showing that quest, or can't be seen). */
  stepToast(e) {
    const v = e.quest;
    if (!v || v.id === 'lessons' || this.quests.talking) return;
    if (e.id === this.quests.data.tracked && this.visible()) return;
    this.ui.toast(`<b>${v.title}</b><br><small>Next: ${v.text}</small>`, { icon: BART.box(true), dur: 3200 });
  }

  /** Somebody's line when a step is done (Old Star says his through the tutor when he's there). */
  sayToast(e) {
    if (!e?.text || (this.quests.talking && (!e.by || e.by === this.quests.talking))) return;
    if (e.by === 'oldstar' && this.game.sceneName === 'home' && this.ui.tutor?.say) { this.ui.tutor.say(e.text, { mood: e.mood || 'calm', key: 'quest-say' }); return; }
    const who = e.by ? npcName(e.by) : null;
    const icon = e.items ? undefined : e.by ? npcFace(this.game, e.by, { size: 40 }) : undefined;
    const items = e.items ? Object.keys(e.items) : [];
    setTimeout(() => this.ui.toast(who ? `<b>${who}:</b> “${e.text}”` : e.text, { icon: items[0] ? undefined : icon, kind: items.length ? 'good' : '', dur: 4200 }), this.ui.isPanelOpen() ? 0 : 120);
  }

  doneToast(e) {
    const v = e.quest;
    if (!v) return;
    // skill points get their own toast from the skill tree when it's there
    const rw = rewardText(this.game.state.addSkillPoints ? { ...e.reward, sp: 0 } : e.reward, { rep: QUESTS[e.id]?.giver });
    const line = v.outro && !this.ui.isPanelOpen() && !this.quests.talking ? `<br><small class="qt-said">“${v.outro}”</small>` : '';
    setTimeout(() => {
      this.ui.toast(`<b>${v.title}</b> · done!${rw ? `<br><span class="gold-txt">${rw}</span>` : ''}${line}`, { kind: 'good', icon: BART.stamp(), dur: 5200 });
      this.game.audio.play('success', { vol: 0.6 });
    }, this.ui.hudMode === 'deep' ? 650 : 0);
  }
}

// The objective tracker: a small parchment strip with rolled ends, hung under the backpack in every
// first-person scene. It shows the tracked quest's current step. Progress is scratched in with a
// quill, a finished step gets ticked and struck through before the strip rolls up and opens on the
// next one, and a finished quest gets Old Star's red stamp slammed onto it. Tap it for the book.
// Reads game.quests (src/core/quests.js) once it exists; UI.update drives it.
import { el, formatGoldFull } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { NPCS } from '../data/quests.js';
import { BART, PIN_KINDS } from './bookArt.js';
import { SFX } from './bookSfx.js';
import './quests.css';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const IDLE = 14; // seconds before the strip settles down to just the line

/** "2/5", or gold as "12,400 / 1,000,000". */
export function countText(v) {
  if (!v || v.max <= 1) return '';
  if (v.step?.gold) return `${formatGoldFull(v.n)} / ${formatGoldFull(v.max)}`;
  return `${v.n}/${v.max}`;
}

/** Reward line: "+100 gold · 2 skill points · 3 Glow Stakes". */
export function rewardText(r) {
  if (!r) return '';
  const out = [];
  if (r.gold) out.push(`+${formatGoldFull(r.gold)} gold`);
  if (r.sp) out.push(`${r.sp} skill point${r.sp > 1 ? 's' : ''}`);
  for (const [id, n] of Object.entries(r.items || {})) { const nm = ITEMS[id]?.name || id; out.push(`${n} ${n > 1 && !/s$/.test(nm) ? nm + 's' : nm}`); }
  return out.join(' · ');
}

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
    document.documentElement.style.setProperty('--a-qstrip', `url("${BART.strip()}")`);

    this.title = el('span', { class: 'qt-title' });
    this.of = el('span', { class: 'qt-of' });
    this.box = el('img', { class: 'pix qt-box', src: BART.box(false), alt: '' });
    this.text = el('span', { class: 'qt-text' });
    this.strike = el('i', { class: 'qt-strike' });
    this.num = el('span', { class: 'qt-n' });
    this.line = el('div', { class: 'qt-line' }, [this.box, el('span', { class: 'qt-tx' }, [this.text, this.strike]), this.num]);
    this.paper = el('div', { class: 'qt-paper' }, [el('div', { class: 'qt-head' }, [this.title, this.of]), this.line]);
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
    // draw the book's little pictures while nothing's happening, so the first opening is instant
    const warm = () => { try { for (const k of ['quests', 'map', 'skills', 'index', 'notes']) BART.tab(k); for (const k of PIN_KINDS) BART.pin(k); for (const k of Object.keys(NPCS)) BART.giver(k); BART.box(true); } catch (e) { /* noop */ } };
    if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 8000 }); else setTimeout(warm, 4000);
  }

  /** Hide the strip (cutscenes) or bring it back. */
  mute(on = true) { this.muted = !!on; this.el.classList.toggle('muted', this.muted); }

  bind(q) {
    this.quests = q;
    q.on('progress', (e) => this.push({ kind: 'progress', ...e }));
    q.on('step', (e) => this.push({ kind: 'step', ...e }));
    q.on('done', (e) => { this.push({ kind: 'done', ...e }); this.doneToast(e); });
    q.on('track', (e) => this.push({ kind: 'track', ...e }));
    q.on('start', (e) => this.onStart(e));
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
  }

  wake() { this.idleT = 0; this.el.classList.remove('idle'); }

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

  async play(e) {
    const q = this.quests;
    const tracked = q.data.tracked;
    const visible = !this.el.hidden && !this.muted && this.ui.hudMode === 'deep';
    if (e.kind === 'progress') {
      if (e.id !== this.shown?.id) return;
      const v = q.get(e.id);
      if (!v || v.status !== 'active') return;
      this.wake();
      // gold ticks and rapid counts (walking a biome) update quietly; a real step forward gets the quill
      const now = performance.now(), quick = now - (this._lastScribble || 0) < 1600;
      if ((e.passive && v.step?.gold) || quick) { this.num.textContent = countText(v); this.shown.n = v.n; if (!quick) this.pulse(this.num); return; }
      this._lastScribble = now;
      await this.scribble(v, visible);
      return;
    }
    if (e.kind === 'step') {
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
  fill(v) {
    const def = v.def;
    this.title.textContent = v.title;
    this.title.style.color = NPCS[def.giver]?.ink || '';
    this.of.textContent = def.steps.length > 1 ? `${v.i + 1}/${def.steps.length}` : '';
    this.text.textContent = v.text;
    this.num.textContent = countText(v);
    this.box.src = BART.box(false);
    this.strike.classList.remove('go');
    this.el.classList.toggle('main', def.kind === 'main');
    this.shown = { id: v.id, i: v.i, n: v.n, text: v.text };
  }

  show(v, { instant = false } = {}) {
    if (!v) { this.shown = null; this.el.hidden = true; return; }
    this.el.hidden = false;
    this.fill(v);
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
    const t = countText(v);
    if (!visible) { this.num.textContent = t; this.shown.n = v.n; return; }
    this.num.classList.remove('scratch');
    void this.num.offsetWidth;
    this.num.classList.add('scratch');
    this.quillTo(this.num);
    SFX.scratch(this.game.audio, { n: 3 });
    await wait(180);
    this.num.textContent = t;
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
        const v = list[0].quest;
        const who = v.giverName;
        this.ui.toast(`<small>${v.kind === 'request' ? 'A request from' : 'New task from'} ${who}</small><br><b>${v.title}</b>`, { icon: BART.tab('quests') });
      } else {
        this.ui.toast(`<b>${list.length} new tasks</b> in your book <small>(B)</small>`, { icon: BART.tab('quests') });
      }
    }, 80);
  }

  doneToast(e) {
    const v = e.quest;
    if (!v) return;
    // skill points get their own toast from the skill tree when it's there
    const rw = rewardText(this.game.state.addSkillPoints ? { ...e.reward, sp: 0 } : e.reward);
    const line = v.outro ? `<br><small class="qt-said">“${v.outro}”</small>` : '';
    setTimeout(() => {
      this.ui.toast(`<b>${v.title}</b> · done!${rw ? `<br><span class="gold-txt">${rw}</span>` : ''}${line}`, { kind: 'good', icon: BART.stamp(), dur: 5200 });
      this.game.audio.play('success', { vol: 0.6 });
    }, this.ui.hudMode === 'deep' ? 650 : 0);
  }
}

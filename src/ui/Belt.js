// The hotbar (ui.setHotbar): nine leather loops on a strap at the bottom of the screen, always
// shown (like Minecraft's): the first nine slots of the inventory (core/hotbar.js). Number keys
// 1–9, the wheel or a tap pick a slot; the picked one sits up in a crisp brass frame. A loop shows
// what really hangs in it: a tool from the rack, or a stack (with its count). full(id): a pickup
// that didn't fit bounces off the belt and the loops flash red (no words).
// A new game (src/ui/Onboard.js UNLOCKS): until 'hotbar' is unlocked only the slots holding a tool
// you have show (your first pick first, then the chisel...), and the build slot waits for 'build';
// shown(i) says whether slot i is there (DigScene.selectSlot skips the others).
import { el, clamp } from '../core/util.js';
import { installPackArt } from './packArt.js';
import { hotbarOf, hotStack } from '../core/hotbar.js';
import * as Inv from '../core/inventory.js';
import { stackIcon, stackName, stackKey } from './invGrid.js';
import { itemVox } from './itemVox.js';
import { floatIn, ghost } from './floatType.js'; // the held item's name floats (wave 9: no tag behind it)
import { keepClear } from './uiSolid.js';


export class Belt {
  constructor(ui) {
    this.ui = ui;
    this.sel = -1;
    this.idle = 0;
    this.expanded = true;
    this.hover = false;
    this.loops = el('div', { class: 'belt-loops' });
    this.label = el('div', { class: 'belt-label' });
    this.strap = el('div', { class: 'belt-strap' }, [el('i', { class: 'belt-buckle' }), this.loops, el('i', { class: 'belt-tip' })]);
    this.el = el('div', { class: 'belt', hidden: true }, [this.label, this.strap]);
    ui.hud.append(this.el);
    installPackArt(this.el); // (the loops' and the strap's leather)
    installPackArt(document.documentElement); // (wave 19: the pockets' and counts' art for every slot grid: chests, the trunk...)
    this.el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { this.hover = true; this.expand(); } });
    this.el.addEventListener('pointerleave', () => { this.hover = false; });
    window.addEventListener('wheel', () => this.poke(), { passive: true });
    window.addEventListener('keydown', (e) => { if (/^Digit[1-9]$/.test(e.code)) this.poke(); });
  }

  poke() { if (!this.el.hidden && !this.ui.isPanelOpen()) this.expand(); }
  expand() {
    this.idle = 0;
    if (!this.expanded) { this.expanded = true; this.el.classList.remove('tucked'); }
  }
  collapse() {
    if (this.expanded) { this.expanded = false; this.el.classList.add('tucked'); }
  }

  /** slots: [{icon, key, label, off, n, meter}] */
  set(slots, sel = 0, onPick = null) {
    if (!slots) { this.el.hidden = true; this.slots = null; this.raw = null; this._sig = null; this.sel = -1; return; }
    this.raw = slots;
    // a loop holding a stack shows that stack (whatever kind the scene made of it), and keeps up
    // with it as things come and go
    const st0 = this.ui.game.state;
    if (st0?.on && this.watched !== st0) { this.watched = st0; st0.on('items', () => { if (this.raw && !this.el.hidden) this.set(this.raw, this.sel, this.onPick); }); }
    const size = itemVox.itemPx('belt');
    slots = slots.map((d, i) => {
      const s = st0?.data?.inv ? hotStack(st0, i) : null;
      if (!s || s.tool) return { ...d, icon: d.icon ? itemVox.fromIcon(d.icon, size) : d.icon, vox: d.icon ? itemVox.keyOf(d.icon) : null };
      const n = Inv.stackN(s);
      return { ...d, icon: stackIcon(s, size), vox: stackKey(s), label: stackName(s), n: n > 1 ? n : undefined, off: false, empty: false, q: s.lots ? Inv.stackQ(s) : undefined };
    });
    this.onPick = onPick;
    this.slots = slots;
    const wasHidden = this.el.hidden;
    this.el.hidden = false;
    // [unlock guard] a new game sees only the loops with a tool in them
    const st = this.ui.game.state, all = st.unlocked?.('hotbar') ?? true;
    const kinds = all ? null : hotbarOf(st);
    this.hide = slots.map((s, i) => !all && (s.empty || s.off || (kinds[i] === 'build' && !st.unlocked('build'))));
    const sig = JSON.stringify(slots.map((s, i) => [s.vox || s.icon, s.key, s.off, s.n, s.label, this.hide[i], size]));
    if (sig !== this._sig) {
      this._sig = sig;
      this.loops.innerHTML = '';
      this.nodes = slots.map((s, i) => {
        const gauge = el('i', { class: 'gauge', hidden: s.meter === undefined }, [el('b')]);
        const node = el('button', {
          class: 'loop' + (s.off ? ' off' : '') + (s.empty ? ' empty' : ''), title: s.label || '', 'aria-label': s.label || `Slot ${i + 1}`,
          onclick: (e) => {
            e.stopPropagation();
            if (!this.expanded) { this.expand(); return; }
            this.expand();
            if (this.onPick) this.onPick(i);
          },
        }, [
          el('span', { class: 'loop-face' }, [s.empty ? null : el('img', { class: 'pix', src: s.icon, alt: '', 'data-vox': s.vox || null }), el('i', { class: 'lip', 'aria-hidden': 'true' })]),
          s.key ? el('span', { class: 'k' }, s.key) : null,
          s.n !== undefined ? el('span', { class: 'n' }, String(s.n)) : null,
          gauge,
        ]);
        if (s.meter !== undefined) this.setGauge(gauge, s.meter);
        if (this.hide[i]) node.hidden = true;
        this.loops.append(node);
        return { node, gauge };
      });
      this.sel = -1;
    }
    if (sel !== this.sel) {
      this.nodes.forEach((n, i) => n.node.classList.toggle('sel', i === sel));
      // (wave 10) the picked loop springs: squashed as it's grabbed, stretched up, settled
      if (this.sel >= 0) try { this.nodes[sel]?.node.animate?.([{ scale: '1.2 .8' }, { scale: '.9 1.14', offset: 0.35 }, { scale: '1.04 .97', offset: 0.68 }, { scale: '1' }], { duration: 240, easing: 'ease-out' }); } catch { /* no WAAPI scale */ }
      if (this.sel >= 0 || wasHidden) {
        this.expand();
        this.label.classList.remove('flash');
        void this.label.offsetWidth;
        this.label.classList.add('flash');
      }
      this.sel = sel;
    }
    const lab = slots[sel]?.label;
    const show = lab && !/^[\s\-–—]*$/.test(lab);
    const text = show ? lab : '';
    if (text !== this.labelText) {
      // the old name scatters into bits, the new one's letters drop in (src/ui/floatType.js)
      if (this.labelText && !this.label.hidden) ghost(this.label, { n: 6, sample: 6, life: 0.55, rise: 14, spread: 18 });
      this.labelText = text;
      if (text) this.clear ||= keepClear(this.label, { prefer: 'y' });
      if (text) floatIn(this.label, text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]), { stagger: 0.02, max: 0.3 });
      else this.label.textContent = '';
    }
    this.label.hidden = !show;
  }

  /** A pickup that didn't fit: it bounces off the belt, the loops flash red (no words). */
  full(id) {
    if (this.el.hidden) return;
    this.expand();
    this.strap.classList.remove('nope');
    void this.strap.offsetWidth;
    this.strap.classList.add('nope');
    clearTimeout(this._nopeT);
    this._nopeT = setTimeout(() => this.strap.classList.remove('nope'), 520);
    if (!id) return;
    const ico = el('img', { class: 'pix belt-bounce', src: itemVox.src(id, itemVox.itemPx('belt')), alt: '' });
    this.strap.append(ico);
    setTimeout(() => ico.remove(), 760);
  }

  /** Is slot i on the belt (not held back by the tutorial)? */
  shown(i) { return !this.hide?.[i]; }

  setGauge(g, v) {
    g.hidden = v === null || v === undefined;
    if (g.hidden) return;
    const k = clamp(v, 0, 1);
    g.firstChild.style.height = (k * 100).toFixed(1) + '%';
    g.classList.toggle('hot', k > 0.78);
  }
  meter(i, v) {
    const s = this.nodes?.[i];
    if (s) this.setGauge(s.gauge, v);
  }

  update() { /* always shown in full: no tucking away */ }
}

// The tool belt (ui.setHotbar): a leather strap with tool loops at the bottom of the screen.
// After a moment of inactivity it tucks away to just the tool in your paw; scrolling, number
// keys, hovering or tapping pulls the whole belt back out.
import { el, clamp } from '../core/util.js';

const IDLE = 2.4;

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
    if (!slots) { this.el.hidden = true; this.slots = null; this._sig = null; this.sel = -1; return; }
    this.onPick = onPick;
    this.slots = slots;
    const wasHidden = this.el.hidden;
    this.el.hidden = false;
    const sig = JSON.stringify(slots.map((s) => [s.icon, s.key, s.off, s.n, s.label]));
    if (sig !== this._sig) {
      this._sig = sig;
      this.loops.innerHTML = '';
      this.nodes = slots.map((s, i) => {
        const gauge = el('i', { class: 'gauge', hidden: s.meter === undefined }, [el('b')]);
        const node = el('button', {
          class: 'loop' + (s.off ? ' off' : ''), title: s.label || '', 'aria-label': s.label || `Slot ${i + 1}`,
          onclick: (e) => {
            e.stopPropagation();
            if (!this.expanded) { this.expand(); return; }
            this.expand();
            if (this.onPick) this.onPick(i);
          },
        }, [
          el('span', { class: 'loop-face' }, [el('img', { class: 'pix', src: s.icon, alt: '' })]),
          s.key ? el('span', { class: 'k' }, s.key) : null,
          s.n !== undefined ? el('span', { class: 'n' }, String(s.n)) : null,
          gauge,
        ]);
        if (s.meter !== undefined) this.setGauge(gauge, s.meter);
        this.loops.append(node);
        return { node, gauge };
      });
      this.sel = -1;
    }
    if (sel !== this.sel) {
      this.nodes.forEach((n, i) => n.node.classList.toggle('sel', i === sel));
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
    this.label.textContent = show ? lab : '';
    this.label.hidden = !show;
  }

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

  update(dt) {
    if (this.el.hidden) return;
    if (this.expanded && !this.hover) {
      this.idle += dt;
      if (this.idle > (this.ui.focus ? 0.6 : IDLE)) this.collapse();
    }
  }
}

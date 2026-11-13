// The first-person crosshair: a small pixel reticle that changes with what you're looking at
// (rock, ore, a creature, something to use), its name floating under it and a ring for hold
// actions. Wave 9: the name has no tag behind it: outlined pixel letters that drop in when you look
// at something new while the old name scatters into voxel bits (src/ui/floatType.js).
import { el } from '../core/util.js';
import { floatIn, ghost } from './floatType.js';
import { keepClear } from './uiSolid.js';
import { Px } from './uiArt.js';
import { DSPR, progressRing } from './deepArt.js';

const KINDS = new Set(['none', 'rock', 'ore', 'enemy', 'use']);
const BITS = { ore: ['#fff6c4', '#ffe08a', '#d9a030'], enemy: ['#ffe0d0', '#ffb4a0', '#e8502a'], use: ['#ffffff', '#c8f4ff', '#7fc0f0'] };
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

export class Crosshair {
  constructor(ui) {
    this.ui = ui;
    this.kind = null;
    this.text = null;
    this.q = -1;
    this.ret = el('img', { class: 'pix xh-ret', src: DSPR.reticle('none'), alt: '' });
    this.ring = new Px(25, 25);
    this.ring.c.className = 'pix xh-ring';
    this.ring.c.hidden = true;
    this.label = el('span', { class: 'xh-label', hidden: true });
    this.el = el('div', { class: 'xh', hidden: true, 'aria-hidden': 'true' }, [this.ring.c, this.ret, this.label]);
    ui.hud.append(this.el);
  }

  /** o: { visible, kind: 'none'|'rock'|'ore'|'enemy'|'use', label, progress: 0..1 } or null. */
  set(o) {
    if (!o || o.visible === false) { this.el.hidden = true; return; }
    this.el.hidden = false;
    const kind = KINDS.has(o.kind) ? o.kind : 'none';
    if (kind !== this.kind) {
      this.kind = kind;
      this.ret.src = DSPR.reticle(kind);
      this.el.dataset.kind = kind;
    }
    const text = o.label ? String(o.label) : '';
    if (text !== this.text) {
      this.text = text;
      // the old name scatters where it was (after the live one in the page: tests read the first)
      if (!this.label.hidden) ghost(this.label, { after: true, n: 6, sample: 6, life: 0.5, rise: 14, spread: 16, colors: BITS[this.kind] });
      this.label.hidden = !text;
      if (text) { floatIn(this.label, `${kind === 'use' ? '<kbd>E</kbd>' : ''}${esc(text)}`, { stagger: 0.016, max: 0.25 }); this.clear ||= keepClear(this.label, { prefer: 'y' }); }
      else this.label.textContent = '';
    }
    const pr = Number(o.progress) || 0;
    const q = pr > 0.001 ? Math.round(Math.min(1, pr) * 24) : 0;
    if (q !== this.q) {
      this.q = q;
      this.ring.c.hidden = !q;
      if (q) {
        progressRing(this.ring, q / 24, q >= 24 ? 0x8af07a : kind === 'enemy' ? 0xff7a5a : 0xffd76a);
        this.ring.ctx.putImageData(this.ring.img, 0, 0);
      }
    }
  }
}

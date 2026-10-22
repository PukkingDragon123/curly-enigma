// Old Star's notes, pinned on the cork board in the tavern: E opens the one you're looking at (or
// the first you haven't read) on a sheet of old paper in his hand, and you can leaf through them
// all. Unread notes keep their red pins until you've read them (state.data.notesRead).
// The notes themselves are src/data/notes.js (NOTES = [{ id, title, text }]) when it exists.
import { el } from '../core/util.js';
import './notes.css';

const noteMods = import.meta.glob('../data/notes.js', { eager: true });

/** Until the real notes are written: a couple of Old Star's scraps. */
const PLACEHOLDER = [
  { id: 'welcome', title: 'To whoever finds this', text: 'If you\'re reading this, you\'ve met me, or I\'m dead and you\'ve found my tavern. Either way, welcome. Put the kettle on.\n\nThe lift in the corner goes down to the mine. Mind the gate.' },
  { id: 'lifts', title: 'On lifts', text: 'There are old lifts all through the rock, buried when the workings closed. Dig to one, ring its bell, and it\'s yours: it\'ll carry you home from any depth.' },
  { id: 'clumps', title: 'Clumps', text: 'Good ore comes away in clumps, rock and all. Don\'t smash it! Pick the clump up, turn it in your paws and chip it clean. A clean stone is worth twice a dirty one.' },
];

export function loadNotes() {
  const m = Object.values(noteMods)[0];
  const list = m && Array.isArray(m.NOTES) && m.NOTES.length ? m.NOTES : PLACEHOLDER;
  return list.map((n, i) => ({ id: String(n.id ?? 'note' + i), title: n.title || 'A note', text: String(n.text || '') }));
}

/** Read ids from the save (state.data.notesRead). */
export function readSet(state) {
  const d = state.data;
  if (!Array.isArray(d.notesRead)) d.notesRead = [];
  return new Set(d.notesRead);
}

export function markRead(state, id) {
  const d = state.data;
  if (!Array.isArray(d.notesRead)) d.notesRead = [];
  if (d.notesRead.includes(id)) return false;
  d.notesRead.push(id);
  state.dirty = true;
  return true;
}

/**
 * The note view: a pinned sheet with the note in Old Star's hand, arrows (and A/D, ←/→) to leaf
 * through, a row of pins showing which are still unread. onChange(i) after each page turn.
 * Returns the panel handle (with .show(i)).
 */
export function openNotes(game, notes, start = 0, opts = {}) {
  const st = game.state;
  let i = Math.max(0, Math.min(notes.length - 1, start));
  const title = el('div', { class: 'nt-title' });
  const text = el('div', { class: 'nt-text' });
  const sign = el('div', { class: 'nt-sign' }, [el('span', {}, '— Old Star'), el('i', { class: 'nt-star', 'aria-hidden': 'true' })]);
  const paper = el('div', { class: 'nt-paper' }, [title, text, sign]);
  const pins = el('div', { class: 'nt-pins' });
  const count = el('span', { class: 'nt-count' });
  const prev = el('button', { class: 'btn alt nt-prev', 'aria-label': 'Previous note', onclick: () => show(i - 1, -1) }, '‹');
  const next = el('button', { class: 'btn alt nt-next', 'aria-label': 'Next note', onclick: () => show(i + 1, 1) }, '›');
  const foot = el('div', { class: 'nt-foot' }, [prev, el('div', { class: 'nt-mid' }, [pins, count]), next]);
  const body = el('div', { class: 'nt-body' }, [paper, foot]);
  const read = readSet(st);
  const show = (k, dir = 0) => {
    if (k < 0 || k >= notes.length) { game.audio.play('ui_error', { vol: 0.4 }); return; }
    i = k;
    const n = notes[i];
    title.textContent = n.title;
    text.replaceChildren(...n.text.split('\n').map((p) => (p.trim() ? el('p', {}, p.trim()) : el('p', { class: 'gap' }, '\u00a0'))));
    sign.hidden = /O\.\s?S\.|Old Star/.test(n.text.slice(-24));
    count.textContent = `${i + 1} / ${notes.length}`;
    prev.disabled = i === 0;
    next.disabled = i === notes.length - 1;
    if (markRead(st, n.id)) read.add(n.id);
    pins.replaceChildren(...notes.map((q, j) => el('i', { class: 'nt-pin' + (read.has(q.id) ? ' read' : '') + (j === i ? ' cur' : ''), title: q.title, onclick: () => show(j, j > i ? 1 : -1) })));
    if (dir) {
      game.audio.play('page');
      paper.classList.remove('turn-l', 'turn-r');
      void paper.offsetWidth;
      paper.classList.add(dir > 0 ? 'turn-r' : 'turn-l');
    }
    opts.onChange?.(i);
  };
  const key = (e) => {
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); show(i + 1, 1); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); show(i - 1, -1); }
    else if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); h.close(); }
  };
  window.addEventListener('keydown', key);
  game.audio.play('page');
  const h = game.ui.openPanel({ body, className: 'nt-panel', onClose: () => { window.removeEventListener('keydown', key); opts.onClose?.(); } });
  h.kind = 'notes';
  h.show = (k) => show(k, k > i ? 1 : -1);
  show(i);
  return h;
}

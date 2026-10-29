// The lore reader: one or more lore entries (src/data/lore.js) on a sheet you can leaf through,
// dressed for where they came from: a charcoal rubbing of a ruin carving (raised runes over a
// translation), a torn and stained page of Hobb's journal, a book page, or a tale on parchment.
//   openLoreReader(game, entries, { title, kind, start }) → panel handle (.show(i))
// New entries get a "written in your book" ribbon. Arrows / A D / ← → leaf; E or Space closes.
import { el } from '../core/util.js';
import { SHELVES } from '../data/lore.js';
import { npcName } from '../data/quests.js';
import { BART } from './bookArt.js';
import './lore.css';

const SRC_NAMES = { carving: 'A carving in the old stone', journal: 'A page of Hobb\'s journal', tale: 'A tale', book: 'From a book', relic: 'The archive\'s label', quest: 'Written in your book', note: "Old Star's note" };
const RUIN_NAMES = { hall: 'Pillared Hall', shrine: 'Star Shrine', vault: 'Sealed Vault', well: 'Drowned Well', '*': 'an old ruin' };

/** Little raised runes for a carving (deterministic per entry, drawn as spans). */
function runeRow(seed, n = 18) {
  let h = seed;
  const out = [];
  for (let i = 0; i < n; i++) { h = (h * 1103515245 + 12345) & 0x7fffffff; out.push(el('i', { class: 'lr-rune r' + (h % 9) })); }
  return el('div', { class: 'lr-runes', 'aria-hidden': 'true' }, out);
}

/** The body of one entry, styled for its source. */
export function loreSheet(e, { isNew = false } = {}) {
  const src = e.src || 'tale';
  const kind = src === 'carving' ? 'carving' : src === 'journal' ? 'journal' : src === 'book' ? 'book' : src === 'note' ? 'note' : 'parch';
  const shelf = SHELVES.find((s) => s.id === e.shelf);
  const seed = [...e.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) & 0xffff;
  const sub = src === 'carving' ? `${SRC_NAMES.carving} · ${RUIN_NAMES[e.ruin] || 'an old ruin'}` : src === 'tale' && e.by ? `Told by ${npcName(e.by)}` : SRC_NAMES[src] || '';
  const paras = String(e.text || '').split('\n').map((p) => p.trim()).filter(Boolean);
  return el('article', { class: `lr-sheet lr-${kind}`, style: { '--ink': shelf?.ink || '#5a3a1a' } }, [
    isNew ? el('div', { class: 'lr-new' }, [el('img', { class: 'pix', src: BART.tab('lore'), alt: '' }), 'Written in your book']) : null,
    el('small', { class: 'lr-sub' }, sub),
    el('h2', { class: 'lr-title' }, e.title),
    kind === 'carving' ? runeRow(seed) : null,
    el('div', { class: 'lr-text' }, paras.map((p) => el('p', {}, p))),
    kind === 'carving' ? runeRow(seed + 7, 12) : null,
    kind === 'journal' ? el('i', { class: 'lr-stain', 'aria-hidden': 'true' }) : null,
  ]);
}

export function openLoreReader(game, entries, { title = null, start = 0, kind = null, fresh = null } = {}) {
  entries = (entries || []).filter(Boolean);
  if (!entries.length) return null;
  const lore = game.lore;
  let i = Math.max(0, Math.min(entries.length - 1, start));
  const host = el('div', { class: 'lr-host' });
  const count = el('span', { class: 'lr-count' });
  const prev = el('button', { class: 'btn alt lr-prev', 'aria-label': 'Previous', onclick: () => show(i - 1, -1) }, '‹');
  const next = el('button', { class: 'btn alt lr-next', 'aria-label': 'Next', onclick: () => show(i + 1, 1) }, '›');
  const done = el('button', { class: 'btn lr-done', onclick: () => h.close() }, 'Close');
  const foot = el('div', { class: 'lr-foot' }, entries.length > 1 ? [prev, count, next, done] : [el('span', { class: 'lr-hint' }, 'Kept in your book: Lore (B)'), done]);
  const body = el('div', { class: 'lr-body' + (kind ? ' lr-k-' + kind : '') }, [title ? el('div', { class: 'lr-head' }, title) : null, host, foot]);
  const seen = new Set();
  const show = (k, dir = 0) => {
    if (k < 0 || k >= entries.length) return;
    i = k;
    const e = entries[i];
    const isNew = fresh ? fresh.has(e.id) : !lore?.data?.read?.[e.id];
    lore?.markRead?.(e.id);
    host.replaceChildren(loreSheet(e, { isNew: isNew && !seen.has(e.id) }));
    seen.add(e.id);
    count.textContent = `${i + 1} / ${entries.length}`;
    prev.disabled = i === 0;
    next.disabled = i === entries.length - 1;
    if (dir) { game.audio.play('page'); host.classList.remove('turn-l', 'turn-r'); void host.offsetWidth; host.classList.add(dir > 0 ? 'turn-r' : 'turn-l'); }
  };
  const key = (ev) => {
    if (ev.code === 'ArrowRight' || ev.code === 'KeyD') { ev.preventDefault(); show(i + 1, 1); }
    else if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') { ev.preventDefault(); show(i - 1, -1); }
    else if (ev.code === 'KeyE' || ev.code === 'Space' || ev.code === 'Enter') { ev.preventDefault(); h.close(); }
  };
  window.addEventListener('keydown', key);
  game.audio.play('page');
  const h = game.ui.openPanel({ body, className: 'lr-panel', onClose: () => window.removeEventListener('keydown', key) });
  h.kind = 'lore';
  h.show = (k) => show(k, k > i ? 1 : -1);
  show(i);
  return h;
}

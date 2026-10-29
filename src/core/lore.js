// Lore (game.lore): the history of the caves, found in the world and written into the book's Lore
// chapter. Entries are data (src/data/lore.js); this keeps what you've found and hands out the next
// thing to read at each kind of spot:
//   lore.add(id, { quiet, from }) → true if new · lore.has(id) · lore.shelf(id) → [{ entry, found }]
//   lore.readCarving({ id, kind }) → entry (a ruin's carved wall: the next carving for its kind)
//   lore.readJournal(spotKey) → entry (Hobb's journal pages, in order, in the lost miners' satchels)
//   lore.tale(npc) → entry | null (the next tale this villager hasn't told you)
//   lore.readShelf(id) → opens a little shelf of books (Old Star's, Talpa's...)
//   lore.unread() → count of found-but-unread entries (the book's tab dot) · lore.markRead(id)
// Every read emits act { type: 'lore', id, src, shelf, ruin?, isNew } (quests count them);
// a new find toasts "Lore: <title>". Relics found in ruins add their entry (act 'relic').
// Save: state.data.lore = { found: { id: day }, read: { id: 1 }, spots: { key: id } }.
import { LORE, LORE_BY_ID, JOURNAL, CARVINGS, RELIC_LORE, SHELVES } from '../data/lore.js';
import { NOTES } from '../data/notes.js';
import { openLoreReader } from '../ui/loreReader.js';
import { BART } from '../ui/bookArt.js';

/** Books on shelves: what each shelf holds (lore ids). */
export const BOOKSHELVES = {
  oldstar: { title: "Old Star's shelf", books: ['b_smith', 'b_ledger'] },
  talpa: { title: 'Professor Talpa\'s shelf', books: ['b_talpa1', 'b_guide', 'cr_golems'] },
};

export class Lore {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.boot();
    this.state.on('load', () => this.boot());
    this.state.on('act', (a) => {
      if (a?.type === 'relic' && RELIC_LORE[a.id]) this.add(RELIC_LORE[a.id], { from: 'relic', ruin: a.ruin });
    });
  }

  boot() {
    const d = (this.state.data.lore ||= {});
    d.found ||= {};
    d.read ||= {};
    d.spots ||= {};
    // relics found before lore existed
    for (const [relic, id] of Object.entries(RELIC_LORE)) if (this.state.known?.('relic', relic) && !d.found[id]) d.found[id] = this.state.data.day || 1;
  }
  get data() { return this.state.data.lore; }

  has(id) { return !!this.data?.found[id]; }
  count() { return Object.keys(this.data?.found || {}).filter((id) => LORE_BY_ID[id]).length; }
  total() { return LORE.length; }
  unread() {
    const d = this.data;
    const notes = NOTES.filter((n) => !(this.state.data.notesRead || []).includes(n.id)).length;
    return Object.keys(d.found).filter((id) => LORE_BY_ID[id] && !d.read[id]).length + notes;
  }
  markRead(id) { if (this.data && !this.data.read[id]) { this.data.read[id] = 1; this.state.dirty = true; } }

  /** The entries of a shelf with their found state (Old Star's notes are the 'notes' shelf). */
  shelf(id) {
    if (id === 'notes') {
      const read = new Set(this.state.data.notesRead || []);
      return NOTES.map((n) => ({ entry: { ...n, shelf: 'notes', src: 'note' }, found: true, read: read.has(n.id) }));
    }
    return LORE.filter((e) => e.shelf === id).map((e) => ({ entry: e, found: this.has(e.id), read: !!this.data.read[e.id] }));
  }
  shelves() { return SHELVES.map((s) => { const all = this.shelf(s.id); return { ...s, n: all.filter((x) => x.found).length, max: all.length, unread: all.filter((x) => x.found && !x.read).length }; }); }

  /** Write an entry into the book. Returns true when it's new. */
  add(id, { quiet = false, from = null, ruin = null, act = true } = {}) {
    const e = LORE_BY_ID[id];
    if (!e) return false;
    const isNew = !this.data.found[id];
    if (isNew) { this.data.found[id] = this.state.data.day || 1; this.state.dirty = true; }
    if (act) this.state.emit('act', { type: 'lore', id, src: e.src, shelf: e.shelf, ruin, isNew, from });
    if (isNew && !quiet) this.toast(e);
    return isNew;
  }

  toast(e) {
    const ui = this.game.ui;
    ui?.toast?.(`<small>Written in your book · Lore</small><br><b>${e.title}</b> <small>(B)</small>`, { icon: BART.tab('lore'), dur: 3400 });
    ui?.status?.setBadge?.(true);
    this.game.audio?.play?.('page', { vol: 0.5 });
  }

  // ------------------------------------------------------------ what to read where
  /** A ruin's carved wall: the carving this ruin shows (the next one of its kind you haven't read). */
  readCarving(ruin = {}) {
    const key = 'ruin:' + (ruin.id ?? '?') + ':' + (ruin.wall ?? 0);
    let id = this.data.spots[key];
    if (!id || !LORE_BY_ID[id]) {
      const fits = CARVINGS.filter((e) => e.ruin === ruin.kind || e.ruin === '*');
      const pick = fits.find((e) => !this.has(e.id) && !Object.values(this.data.spots).includes(e.id))
        || CARVINGS.find((e) => !this.has(e.id) && !Object.values(this.data.spots).includes(e.id))
        || fits[Math.abs(hashStr(key)) % Math.max(1, fits.length)] || CARVINGS[0];
      id = pick.id;
      this.data.spots[key] = id;
    }
    this.add(id, { quiet: true, from: 'carving', ruin: ruin.id ?? null });
    return LORE_BY_ID[id];
  }

  /** A lost miner's satchel (ruins/site.js): the next page of Hobb's journal (the same page stays with the same spot). */
  readJournal(spotKey) {
    const key = 'page:' + spotKey;
    let id = this.data.spots[key];
    if (!id || !LORE_BY_ID[id]) {
      const next = JOURNAL.find((e) => !this.has(e.id) && !Object.values(this.data.spots).includes(e.id));
      id = (next || JOURNAL[Math.abs(hashStr(key)) % JOURNAL.length]).id;
      this.data.spots[key] = id;
    }
    this.add(id, { quiet: true, from: 'journal' });
    return LORE_BY_ID[id];
  }

  /** The next tale a villager can tell you (null when they've told you everything they know). */
  tale(npc, tales) {
    const list = (tales || LORE.filter((e) => e.by === npc).map((e) => e.id)).filter((id) => LORE_BY_ID[id]);
    const id = list.find((t) => !this.has(t));
    return id ? LORE_BY_ID[id] : null;
  }

  /** A shelf of books (Old Star's at home, Talpa's in his shop): opens the reader on them. */
  readShelf(shelfId = 'oldstar') {
    const sh = BOOKSHELVES[shelfId];
    if (!sh) return null;
    for (const id of sh.books) this.add(id, { quiet: true, from: 'shelf:' + shelfId });
    return openLoreReader(this.game, sh.books.map((id) => LORE_BY_ID[id]).filter(Boolean), { title: sh.title, kind: 'book' });
  }

  /** Open the reader on one entry (a carving, a journal page): returns the panel. */
  show(entry, opts = {}) {
    if (!entry) return null;
    const fresh = this.data.read[entry.id] ? null : new Set([entry.id]);
    return openLoreReader(this.game, [entry], { ...opts, fresh });
  }
}

function hashStr(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

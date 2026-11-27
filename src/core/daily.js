// Daily life (wave 21): the story stage along the slate, Old Star's chapter beats, friendship and
// gifts with Deep Town's folk (Stardew hearts), heart events, the morning letter, the cave's mood for
// the day, the day's rumour and Vex's daily price. Data in src/data/story.js. game.daily.
//
// Save: state.data.life = { f: { npc: points }, chat: { npc: day }, gift: { npc: day },
//   ev: { 'npc:i': day }, beat: stage told, mailStage: stage written about, mail: letter | null,
//   friendMail: { npc: hearts written about } }. Created on first use, so old saves just get it.
import { ITEMS, SELL_MOD } from '../data/items.js';
import { wayData } from '../data/way.js';
import { VILLAGERS } from '../data/villagers.js';
import { BEATS, CAST, TASTES_ANY, GIFT_SAYS, HEART, MAX_HEARTS, POINTS, HEART_AT, CONDITIONS, RUMOURS, SPECIAL_BONUS, LETTERS } from '../data/story.js';
import { makeRng, hashStr, pick } from './util.js';

/** Ores Vex might be after, by stage (only what you can dig by then). */
const SPECIAL_ORES = [['copper_ore', 'tin_ore', 'coal', 'quartz'], ['iron_ore', 'lumite', 'amber'], ['silver_ore', 'amethyst', 'echo_crystal'], ['gold_ore', 'ruby', 'magmaite']];

export class Daily {
  constructor(game) {
    this.game = game;
    this.st = game.state;
    SELL_MOD.fn = (id) => (id === this.special() ? SPECIAL_BONUS : 1);
    this.st.on('day', () => this.onDay());
  }

  get d() {
    const d = (this.st.data.life ||= {});
    d.f ||= {}; d.chat ||= {}; d.gift ||= {}; d.ev ||= {}; d.friendMail ||= {};
    return d;
  }
  get day() { return this.st.data.day || 1; }
  rng(salt) { return makeRng(hashStr(`${salt}:${this.day}:${this.st.data.created || 0}`)); }

  // ------------------------------------------------------------ the story
  /** How far along the slate: 0 (arrived) .. 6 (the Magma card in). */
  stage() {
    const w = wayData(this.st), done = w.done || {}, wd = w.wardens || {};
    if (done.magma) return 6;
    if (wd.grotto) return 5;
    if (done.grotto) return 4;
    if (wd.clay) return 3;
    if (done.clayworks) return 2;
    if (done.rootsoil) return 1;
    return 0;
  }
  /** The newest chapter Old Star hasn't told you about yet ({ stage, lines, lore }), or null. */
  beat() {
    const s = this.stage(), told = this.d.beat ?? 0;
    return s > told && BEATS[s] ? { stage: s, ...BEATS[s] } : null;
  }
  tellBeat(b) {
    this.d.beat = b.stage;
    if (b.lore) this.game.lore?.add(b.lore, { from: 'quest' });
    this.st.dirty = true;
  }

  // ------------------------------------------------------------ the day
  /** The cave's mood today ({ id, star, lift, forage?, oreQ?, dig? }). Day one is always quiet. */
  cond() {
    if (this.day <= 1) return CONDITIONS[0];
    const r = this.rng('cond'), tot = CONDITIONS.reduce((s, c) => s + c.w, 0);
    let x = r() * tot;
    for (const c of CONDITIONS) { x -= c.w; if (x < 0) return c; }
    return CONDITIONS[0];
  }
  /** The mine's multipliers for today. */
  get cave() { const c = this.cond(); return { id: c.id, forage: c.forage || 0, oreQ: c.oreQ || 0, dig: c.dig || 1 }; }
  rumour() { return this.rng('rumour').pick(RUMOURS); }
  /** The ore Vex pays more for today. */
  special() {
    const s = this.stage(), tier = s >= 6 ? 3 : s >= 4 ? 2 : s >= 3 ? 1 : 0;
    return this.rng('vex').pick(SPECIAL_ORES[this.rng('vext').int(0, tier)]);
  }

  // ------------------------------------------------------------ friendship
  points(npc) { return (this.d.f[npc] || 0) + (this.game.quests?.rep?.(npc) || 0) * HEART; }
  hearts(npc) { return Math.max(0, Math.min(MAX_HEARTS, Math.floor(this.points(npc) / HEART))); }
  add(npc, n) {
    const before = this.hearts(npc);
    this.d.f[npc] = Math.max(-HEART, (this.d.f[npc] || 0) + n);
    this.st.dirty = true;
    return this.hearts(npc) - before;
  }
  /** Have you chatted with them today? */
  chattedToday(npc) { return this.d.chat[npc] === this.day; }
  /**
   * First chat of the day: friendship, and their line for where the story is (their arc). Returns
   * { line, up } or null for anyone without an arc after the first chat (they chat as before).
   */
  chat(npc) {
    if (!VILLAGERS[npc] || this.chattedToday(npc)) return null;
    this.d.chat[npc] = this.day;
    const up = this.add(npc, POINTS.chat);
    const arc = CAST[npc]?.arc;
    return { line: arc ? stageLine(arc, this.stage()) : null, up };
  }
  taste(npc, id) {
    const t = CAST[npc] || TASTES_ANY, it = ITEMS[id];
    const has = (list) => (list || []).some((x) => x === id || (x[0] === '@' && it?.cat === x.slice(1)));
    if (has(t.love)) return 'love';
    if (has(t.hate) || has(TASTES_ANY.hate)) return 'hate';
    if (has(t.like)) return 'like';
    return 'meh';
  }
  giftedToday(npc) { return this.d.gift[npc] === this.day; }
  /** Things in the bag worth giving (not tools, gear or keys). */
  giftable() {
    const ok = new Set(['mineral', 'gem', 'plant', 'critter', 'drop', 'ingredient', 'food', 'ingot', 'craft']);
    return this.st.inventory().filter((g) => ok.has(ITEMS[g.id]?.cat));
  }
  /** Hand them an item: { kind, line, up } (kind 'again' when they've had one today). */
  give(npc, id) {
    if (this.giftedToday(npc)) return { kind: 'again', line: pick(GIFT_SAYS.again), up: 0 };
    if (!this.st.count(id) && !this.st.lotsOf?.(id)?.length) return null;
    this.st.removeItem(id, 1, { lowFirst: false });
    const kind = this.taste(npc, id);
    this.d.gift[npc] = this.day;
    const up = this.add(npc, POINTS[kind]);
    this.st.emit('act', { type: 'gift', npc, id, kind });
    this.st.emit('items', {});
    return { kind, line: pick(GIFT_SAYS[kind]), up };
  }
  /** A heart event they're ready for ({ npc, i, lines, gift? }), or null. */
  heartEvent(npc) {
    const evs = CAST[npc]?.events;
    if (!evs) return null;
    const h = this.hearts(npc);
    for (let i = 0; i < evs.length; i++) if (h >= HEART_AT[i] && !this.d.ev[`${npc}:${i}`]) return { npc, i, ...evs[i] };
    return null;
  }
  seeEvent(e) {
    this.d.ev[`${e.npc}:${e.i}`] = this.day;
    for (const [id, n] of Object.entries(e.gift || {})) if (ITEMS[id]) this.st.addItem(id, { n, spill: true });
    this.st.dirty = true;
  }

  // ------------------------------------------------------------ the post
  /** Overnight: the morning letter (one at most, the most important). */
  onDay() {
    const d = this.d, s = this.stage();
    if (d.mail) return; // one letter at a time: the next waits till you've read this one
    let L = null;
    if (s > (d.mailStage ?? 0) && LETTERS.stage[s]) { L = { ...LETTERS.stage[s] }; d.mailStage = s; }
    else if (!this.st.flag('life.welcome') && this.st.flag('escaped')) { L = { ...LETTERS.welcome }; this.st.flag('life.welcome', true); }
    else {
      // a friend who's grown fond of you since they last wrote
      const who = Object.keys(VILLAGERS).find((n) => this.hearts(n) >= 3 && (d.friendMail[n] || 0) < 3);
      if (who) {
        const t = this.rng('mail').pick(LETTERS.friend), name = VILLAGERS[who].name;
        L = { from: name, seal: 'o', text: t.text.replace('{name}', name), gift: t.gift ? { [t.gift]: 1 } : null };
        d.friendMail[who] = 3;
      }
    }
    if (L) { d.mail = { ...L, day: this.day }; this.st.dirty = true; }
  }
  /** The letter waiting for you (by your bedroll), or null. */
  get mail() { return this.d.mail || null; }
  /** Open it: gifts go in the bag; it's gone. Returns the letter. */
  readMail() {
    const L = this.d.mail;
    if (!L) return null;
    this.d.mail = null;
    for (const [id, n] of Object.entries(L.gift || {})) if (ITEMS[id]) this.st.addItem(id, { n, spill: true });
    this.st.dirty = true;
    this.st.emit('act', { type: 'mail', from: L.from });
    return L;
  }
}

/** The line for the stage from a stage-keyed table ({ 0: [...], 3: [...] }). */
export function stageLine(tbl, s) {
  let best = null;
  for (const k of Object.keys(tbl)) if (+k <= s && (best === null || +k > best)) best = +k;
  return best === null ? null : pick(tbl[best]);
}

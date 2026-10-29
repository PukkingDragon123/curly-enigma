// The quest engine (game.quests). Quests are data (src/data/quests.js): steps whose goals listen to
// the `act` events every part emits (docs/REMAKE.md) or watch the state (gold, items, flags).
// Nothing calls into here to make progress; the UI (the objective tracker, the book) listens.
//
//   quests.start(id) · quests.step(id) → the current step { i, def, n, max, text } | null
//   quests.done(id) → bool · quests.active() → [view] · quests.track(id) · quests.tracked() → view
//   quests.get(id) → view · quests.list() → { active, done, open } · quests.forNpc(npc)
//   quests.offers(npc) → [ids] (Deep Town folk: offered in their dialog) · quests.accept(id, npc)
//   quests.choose(id, optionId) · quests.markerFor(npc) → '!' | '?' | '…' | null (head markers)
//   quests.rep(npc) → friendship · quests.choice(id) → the option picked
//   quests.on('start'|'progress'|'step'|'done'|'track'|'say'|'change', fn) → unsubscribe
//   quests.debug.{ list(), step(id), complete(id), start(id), act(a), reset(), data(), give(id) }
//
// Save: state.data.quests = { v, active: { id: { s, n, u?, day } }, done: { id: day }, tracked,
//   order: [ids by start], seen: { id: 1 }, rep: { npc: n }, choices: { id: optionId } }.
// Lore (game.lore, src/core/lore.js) is made here too: quests reward it and listen to its acts.
import { QUESTS, QUEST_ORDER, NPC_ALIAS, NPCS, fillNames, npcName } from '../data/quests.js';
import { ITEMS } from '../data/items.js';
import { Lore } from './lore.js';

const normNpc = (v) => (typeof v === 'string' ? NPC_ALIAS[v] || v : v);
const PLACE_ALIAS = { 'burrow:rocco': 'burrow:raccoon', deeptown: 'town', 'deep town': 'town', oldstar_dig: 'dig', workshop: 'home' };
const BURROW_IDS = new Set(['trader', 'herbalist', 'raccoon', 'outpost']);
const BIOME_IDS = [null, 'moss', 'dry', 'fungus', 'dino']; // Generator.js BIOMES[i].id
/** Places as the quests name them: the mine says 'trader', 'R21', 'L11'; quests say 'burrow:trader', 'ruin:R21', 'lift:L11'. */
export function normPlace(p) {
  if (typeof p !== 'string') return p;
  p = PLACE_ALIAS[p] || p;
  if (BURROW_IDS.has(p)) return 'burrow:' + p;
  if (/^R\d+$/.test(p)) return 'ruin:' + p;
  if (/^(L\d+|s\d)$/.test(p)) return 'lift:' + p;
  return p;
}

/** Does an act match a matcher { type, field: value | [values] | fn(v, act) }? */
export function matches(m, a) {
  if (!m || !a) return false;
  if (m.type && m.type !== a.type) return false;
  for (const k in m) {
    if (k === 'type') continue;
    const want = m[k], got = a[k];
    if (typeof want === 'function') { if (!want(got, a)) return false; }
    else if (Array.isArray(want)) { if (!want.includes(got)) return false; }
    else if (want !== got) return false;
  }
  return true;
}

const list = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const GRADES = 'SABCDF';
const gradeOk = (have, want) => !want || (GRADES.indexOf(have || 'F') >= 0 && GRADES.indexOf(have || 'F') <= GRADES.indexOf(want));

/** Shorthands in the data → matchers and map marks (once, at load). */
function normalise() {
  for (const def of Object.values(QUESTS)) {
    if (def._norm) continue;
    def._norm = true;
    if (def.ask === undefined && def.from && NPCS[def.from]?.town) def.ask = true;
    for (const s of def.steps) {
      if (s.talk) { s.on = [...list(s.on), { type: 'talk', npc: s.talk }]; s.where ||= { npc: s.talk }; }
      if (s.look) { s.on = [...list(s.on), { type: 'look', at: s.look }]; s.where ||= { sight: s.look }; }
      if (s.deliver) s.where ||= { npc: s.deliver.to };
      if (s.choose) s.where ||= { npc: s.choose.to };
    }
  }
}
normalise();

/** Does a weapon match a delivery's { type, metal, grade } (grade: this or better)? */
const weaponFits = (w, want) => !!w && (!want.type || w.type === want.type) && (!want.metal || w.metal === want.metal) && gradeOk(w.grade, want.grade);

export class Quests {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.handlers = {};
    this.npcNews = {};
    this._busy = false;
    this._again = false;
    const st = this.state;
    this.lore = game.lore = new Lore(game); // the book's Lore chapter, filled as you find things
    st.on('act', (a) => this.onAct(a));
    st.on('load', () => this.boot());
    for (const evt of ['gold', 'items', 'weapon', 'discover', 'day']) st.on(evt, () => this.refreshSoon());
    // Until the forge and the kitchen emit their own acts, read them off the state: a new weapon is
    // a 'forge', an ingot made at the forge a 'smelt', a dish made at the stove a 'cook'. Once a
    // real act of that type has been seen these stop (no double counting).
    this.realSeen = {};
    this.realT = {};
    st.on('weapon', (e) => { const w = e?.weapon; if (w) this.synth({ type: 'forge', weapon: w.type, grade: w.grade, metal: w.metal, score: w.score }); });
    const made = (e) => {
      if (!e || !(e.n > 0)) return;
      const it = ITEMS[e.id], scene = game.sceneName;
      if (it?.cat === 'ingot' && scene === 'forge') this.synth({ type: 'smelt', id: e.id });
      else if (it?.cat === 'food' && scene === 'cooking') this.synth({ type: 'cook', dish: e.id });
    };
    st.on('items', made);
    st.on('stash', made); // a full backpack sends it home instead: still made
    this.boot();
    this.debug = {
      list: () => QUEST_ORDER.map((id) => {
        const v = this.get(id);
        let line = v.status.padEnd(7) + id;
        if (v.status === 'active') line += ` [${v.i + 1}/${v.def.steps.length}] ${v.text}` + (v.max > 1 ? ` (${v.n}/${v.max})` : '');
        if (this.data.tracked === id) line += '  <- tracked';
        return line;
      }).join('\n'),
      /** complete the current step of a quest (default: the tracked one) */
      step: (id = this.data.tracked) => { if (this.isActive(id)) this.advance(id); return this.get(id); },
      complete: (id = this.data.tracked) => { if (!this.isActive(id) && !this.isDone(id)) this.start(id, { quiet: true }); while (this.isActive(id)) this.advance(id); return this.get(id); },
      start: (id) => this.start(id),
      act: (a) => { st.emit('act', a); return this.tracked(); },
      reset: () => { delete st.data.quests; this.boot(); return this.debug.list(); },
      data: () => JSON.parse(JSON.stringify(this.data)),
      /** what the current step of a quest wants, handed over (items, a weapon, quest items) */
      give: (id = this.data.tracked) => {
        const s = this.step(id)?.def;
        if (!s?.deliver) return false;
        for (const [it, n] of Object.entries(s.deliver.items || {})) st.addItem(it, { n, q: 90, spill: true });
        if (s.deliver.weapon) st.addWeapon({ type: s.deliver.weapon.type || 'dagger', metal: s.deliver.weapon.metal || 'copper', score: 96 });
        if (s.deliver.any) { const it = Object.keys(ITEMS).find((k) => ITEMS[k].cat === s.deliver.any.cat); if (it) st.addItem(it, { n: s.deliver.any.n || 1, spill: true }); }
        return true;
      },
    };
  }

  // ------------------------------------------------------------ events
  on(evt, fn) { (this.handlers[evt] ||= new Set()).add(fn); return () => this.handlers[evt].delete(fn); }
  emit(evt, e) {
    for (const fn of [...(this.handlers[evt] || [])]) { try { fn(e); } catch (err) { console.warn('quest listener', err); } }
    if (evt !== 'change') for (const fn of [...(this.handlers.change || [])]) { try { fn({ evt, ...e }); } catch (err) { console.warn(err); } }
  }

  // ------------------------------------------------------------ save data
  get data() { return this.state.data.quests; }

  /** Fill the save's quest data (new game, old save, a load). */
  boot() {
    const d = this.state.data;
    const fresh = !d.quests;
    const q = (d.quests ||= {});
    q.v = 1;
    q.active ||= {};
    q.done ||= {};
    q.order ||= [];
    q.seen ||= {};
    q.rep ||= {};
    q.choices ||= {};
    if (q.tracked === undefined) q.tracked = null;
    for (const id of Object.keys(q.active)) if (!QUESTS[id] || q.done[id]) delete q.active[id];
    if (fresh) {
      // a save from before the quests (or one that's well under way) skips the lessons
      const s = d.stats || {};
      const begun = (s.blocks || 0) > 30 || (s.trips || 0) > 1 || (s.weapons || 0) > 0 || d.flags?.escaped || d.flags?.prologue || (d.day || 1) > 2;
      if (begun) { q.done.lessons = d.day || 1; this.startQuiet('million'); }
      else this.startQuiet('lessons');
    }
    if (q.tracked && !q.active[q.tracked]) q.tracked = null;
    this.refresh(true);
    if (!q.tracked) q.tracked = this.pickTrack();
    this.emit('change', { boot: true });
  }

  startQuiet(id) {
    const q = this.data;
    if (!QUESTS[id] || q.active[id] || q.done[id]) return;
    q.active[id] = { s: 0, n: 0, day: this.state.data.day || 1 };
    q.order.push(id);
  }

  // ------------------------------------------------------------ queries
  isActive(id) { return !!this.data?.active[id]; }
  isDone(id) { return !!this.data?.done[id]; }
  done(id) { return this.isDone(id); }
  available(id) {
    const def = QUESTS[id];
    if (!def || this.isActive(id) || this.isDone(id)) return false;
    if (!list(def.requires).every((r) => this.isDone(r))) return false;
    if (def.when) { try { if (!def.when(this.state, this)) return false; } catch (e) { return false; } }
    return true;
  }
  rep(npc) { return this.data?.rep?.[normNpc(npc)] || 0; }
  choice(id) { return this.data?.choices?.[id] || null; }

  /** A quest as the UI sees it: { id, def, title, giver, status, i, step, text, hint, n, max, steps: [...] } */
  get(id) {
    const def = QUESTS[id];
    if (!def) return null;
    const q = this.data, a = q.active[id];
    const status = a ? 'active' : q.done[id] ? 'done' : this.available(id) ? 'open' : 'locked';
    const i = a ? a.s : status === 'done' ? def.steps.length : -1;
    const steps = def.steps.map((s, k) => {
      const prog = k === i ? this.progress(id, s, a) : { n: k < i ? s.n || 1 : 0, max: s.n || 1 };
      return { id: s.id, def: s, text: this.stepText(s, prog), hint: fillNames(s.hint || ''), done: k < i, current: k === i, ...prog };
    });
    const cur = steps[i] || null;
    return {
      id, def, title: fillNames(def.title), giver: def.giver, giverName: npcName(def.giver), kind: def.kind, status,
      i, step: cur?.def || null, text: cur?.text || '', hint: cur?.hint || '', n: cur?.n || 0, max: cur?.max || 1,
      steps, intro: fillNames(def.intro || ''), outro: fillNames(def.outro || ''), reward: def.reward || null,
      day: a?.day || null, doneDay: q.done[id] || null, tracked: q.tracked === id, isNew: status === 'active' && !q.seen[id],
      from: def.from || null, ask: !!def.ask, choice: q.choices[id] || null, ready: !!cur && cur.n >= cur.max && !!(cur.def.deliver),
    };
  }

  /** Progress of a step: { n, max } (deliveries count what's in the bag, gold counts gold). */
  progress(id, s, a = this.data.active[id]) {
    const max = s.deliver ? this.deliverMax(s.deliver) : s.n || 1;
    let n = a?.n || 0;
    if (s.deliver) n = this.deliverHave(s.deliver);
    else if (s.count) { try { n = Math.max(0, Math.floor(s.count(this.state) || 0)); } catch (e) { n = 0; } }
    else if (s.unique) n = (a?.u || []).length;
    return { n: Math.min(n, max), max };
  }

  stepText(s, prog = { n: 0, max: 1 }) { return fillNames(s.text || ''); }

  // ------------------------------------------------------------ deliveries
  deliverMax(d) { return Object.values(d.items || {}).reduce((x, y) => x + y, 0) + (d.weapon ? 1 : 0) + (d.any ? d.any.n || 1 : 0); }
  /** How much of a delivery is in the bag (items count up to what's asked). */
  deliverHave(d) {
    const st = this.state;
    let n = Object.entries(d.items || {}).reduce((t, [it, k]) => t + Math.min(k, st.count(it)), 0);
    if (d.weapon && (st.data.weapons || []).some((w) => weaponFits(w, d.weapon))) n += 1;
    if (d.any) n += Math.min(d.any.n || 1, this.anyOf(d.any).reduce((t, it) => t + st.count(it), 0));
    return n;
  }
  anyOf(any) { return Object.keys(ITEMS).filter((k) => ITEMS[k].cat === any.cat && this.state.count(k) > 0); }
  /** What's still missing, in words ("2 more Glowcaps and a bronze axe"). */
  deliverShort(d) {
    const st = this.state, out = [];
    for (const [it, n] of Object.entries(d.items || {})) if (st.count(it) < n) out.push(`${n - st.count(it)} more ${ITEMS[it]?.name || it}`);
    if (d.weapon && !(st.data.weapons || []).some((w) => weaponFits(w, d.weapon))) out.push(`a ${[d.weapon.metal, d.weapon.type].filter(Boolean).join(' ') || 'weapon'}${d.weapon.grade ? ` (grade ${d.weapon.grade} or better)` : ''}`);
    if (d.any) { const have = this.anyOf(d.any).reduce((t, it) => t + st.count(it), 0); if (have < (d.any.n || 1)) out.push(`${(d.any.n || 1) - have} ${d.any.cat}`); }
    return out;
  }
  /** Hand a delivery over (items, then the best fitting weapon, then any of a kind). Returns what went. */
  takeDelivery(d) {
    const st = this.state, gave = [];
    for (const [it, n] of Object.entries(d.items || {})) { this.takeItem(it, n); gave.push([it, n]); }
    if (d.weapon) {
      const w = (st.data.weapons || []).filter((x) => weaponFits(x, d.weapon)).sort((a, b) => (a.score || 0) - (b.score || 0))[0];
      if (w) { st.removeWeapon(w.uid); gave.push(['weapon', 1, w]); }
    }
    if (d.any) {
      let left = d.any.n || 1;
      for (const it of this.anyOf(d.any).sort((a, b) => (ITEMS[a].value || 0) - (ITEMS[b].value || 0))) {
        const k = Math.min(left, st.count(it));
        if (k > 0) { this.takeItem(it, k); gave.push([it, k]); left -= k; }
        if (left <= 0) break;
      }
    }
    return gave;
  }
  /** Take items from the bag; quest items (key items) are simply not owned any more. */
  takeItem(id, n = 1) {
    const st = this.state, it = ITEMS[id];
    if (it?.cat === 'key') { if (st.data.owned[id]) { delete st.data.owned[id]; st.emit('items', { id, n: -1 }); } return; }
    st.removeItem(id, n, { lowFirst: true });
  }
  giveItems(items) {
    const st = this.state;
    for (const [it, n] of Object.entries(items || {})) if (ITEMS[it]) st.addItem(it, { n, q: 100, spill: true });
  }

  step(id) {
    const v = this.get(id);
    if (!v || v.status !== 'active') return null;
    return { i: v.i, def: v.step, n: v.n, max: v.max, text: v.text, hint: v.hint };
  }

  /** Active quests, tracked first, then main, then by start order (newest first). */
  active() {
    const q = this.data;
    const ids = Object.keys(q.active);
    const rank = (id) => (q.tracked === id ? 0 : QUESTS[id].kind === 'main' ? 1 : 2);
    return ids.sort((a, b) => rank(a) - rank(b) || q.order.indexOf(b) - q.order.indexOf(a)).map((id) => this.get(id));
  }

  /** Everything for the book: { active, done (newest first), open (could start) }. */
  list() {
    const q = this.data;
    return {
      active: this.active(),
      done: Object.keys(q.done).filter((id) => QUESTS[id]).sort((a, b) => (q.done[b] - q.done[a]) || (q.order.indexOf(b) - q.order.indexOf(a))).map((id) => this.get(id)),
      open: QUEST_ORDER.filter((id) => this.available(id) && QUESTS[id].from).map((id) => this.get(id)),
    };
  }

  tracked() { const id = this.data?.tracked; return id && this.isActive(id) ? this.get(id) : null; }

  /** Track a quest (null: let the game pick). */
  track(id) {
    const q = this.data;
    if (id && !this.isActive(id)) return false;
    const prev = q.tracked;
    q.tracked = id || this.pickTrack();
    if (q.tracked !== prev) this.emit('track', { id: q.tracked, prev });
    this.state.dirty = true;
    return true;
  }

  /** The best quest to show on the objective line. */
  pickTrack(exclude) {
    const q = this.data;
    const ids = Object.keys(q.active).filter((id) => id !== exclude);
    if (q.active.lessons && exclude !== 'lessons') return 'lessons';
    const newest = ids.filter((id) => id !== 'million').sort((a, b) => q.order.indexOf(b) - q.order.indexOf(a));
    return newest[0] || (ids.includes('million') ? 'million' : null);
  }

  markSeen(id) { if (this.data && !this.data.seen[id]) { this.data.seen[id] = 1; this.state.dirty = true; } }
  unseen() { return Object.keys(this.data?.active || {}).filter((id) => !this.data.seen[id]).length; }

  // ------------------------------------------------------------ lifecycle
  start(id, { quiet = false, by = null, accept = false } = {}) {
    const def = QUESTS[id];
    const q = this.data;
    if (!def || q.active[id] || q.done[id]) return false;
    q.active[id] = { s: 0, n: 0, day: this.state.data.day || 1 };
    q.order.push(id);
    this.state.dirty = true;
    if (def.gives) this.giveItems(def.gives);
    const view = this.get(id);
    // the objective line follows the newest quest, unless the lessons are running; a quest you just
    // said yes to goes straight onto the strip
    const cur = q.tracked;
    if (!cur || cur === 'million' || (!q.active[cur]) || (accept && !q.active.lessons) || (def.kind === 'request' && by && QUESTS[cur]?.kind !== 'main')) {
      q.tracked = id;
      if (!quiet) this.emit('track', { id, prev: cur });
    }
    if (!quiet) this.emit('start', { id, quest: view, by, accept });
    if (by && !accept) (this.npcNews[by] ||= []).push(`<b>${fillNames(def.title)}</b> · ${view.intro}`);
    this.refreshSoon();
    return true;
  }

  /** Say yes to a quest offered in a dialog (Deep Town folk). */
  accept(id, npc = QUESTS[id]?.from) {
    if (!this.available(id)) return false;
    return this.start(id, { by: normNpc(npc), accept: true });
  }

  /** Pick an option of the current step's choice ({ choose: { options } }). Returns the option. */
  choose(id, optId) {
    const def = QUESTS[id], a = this.data.active[id];
    const s = def && a ? def.steps[a.s] : null;
    const opt = s?.choose?.options.find((o) => o.id === optId);
    if (!opt) return null;
    this.data.choices[id] = opt.id;
    if (opt.flag) this.state.flag(opt.flag, true);
    for (const [it, n] of Object.entries(opt.take || {})) this.takeItem(it, n);
    this.pendingReward = { id, reward: opt.reward || null };
    this.emit('choice', { id, option: opt, quest: this.get(id) });
    this.advance(id);
    return opt;
  }

  /** Complete the current step of a quest (and the quest after its last step). */
  advance(id, { quiet = false } = {}) {
    const def = QUESTS[id], a = this.data.active[id];
    if (!def || !a) return;
    const s = def.steps[a.s];
    a.s++;
    a.n = 0;
    delete a.u;
    delete a.shown;
    this.state.dirty = true;
    if (s?.grant) this.giveItems(s.grant);
    if (s?.say && !quiet) this.emit('say', { id, by: s.say.by || null, text: fillNames(s.say.text), mood: s.say.mood, items: s.grant || null, quest: this.get(id) });
    if (a.s >= def.steps.length) { this.finish(id, { quiet }); return; }
    if (!quiet) this.emit('step', { id, done: s, i: a.s, quest: this.get(id) });
  }

  finish(id, { quiet = false } = {}) {
    const def = QUESTS[id], q = this.data;
    delete q.active[id];
    q.done[id] = this.state.data.day || 1;
    const st = this.state;
    // the quest's reward, plus the chosen option's (choices)
    const extra = this.pendingReward?.id === id ? this.pendingReward.reward : null;
    this.pendingReward = null;
    const r = mergeReward(def.reward || {}, extra);
    if (def.kind === 'village' && r.rep === undefined) r.rep = 1;
    if (r.gold) st.addGold(r.gold, 'quest');
    for (const [it, n] of Object.entries(r.items || {})) if (ITEMS[it]) st.addItem(it, { n, q: 100, spill: true });
    if (r.sp) st.addSkillPoints?.(r.sp, fillNames(def.title));
    for (const dish of list(r.recipe)) st.discover?.('recipe', dish);
    const reps = typeof r.rep === 'number' ? { [def.giver]: r.rep } : r.rep || {};
    for (const [npc, n] of Object.entries(reps)) q.rep[normNpc(npc)] = (q.rep[normNpc(npc)] || 0) + n;
    if (r.flag) st.flag(r.flag, true);
    const lore = list(r.lore).filter((l) => this.lore.add(l, { quiet: true, from: id }));
    const wasTracked = q.tracked === id;
    if (!quiet) this.emit('done', { id, quest: this.get(id), reward: { ...r, lore } });
    for (const n of list(def.next)) this.start(n, { quiet });
    if (wasTracked || !q.active[q.tracked]) {
      const next = list(def.next).find((n) => q.active[n] && n !== 'million') || this.pickTrack();
      q.tracked = next || null;
      if (!quiet) this.emit('track', { id: q.tracked, prev: id });
    }
    this.refreshSoon();
  }

  // ------------------------------------------------------------ acts
  /** A stand-in act read off the state (see the constructor); dropped if the real one shows up. */
  synth(a) {
    if (this.realSeen[a.type]) return;
    setTimeout(() => {
      if (this.realSeen[a.type] || performance.now() - (this.realT[a.type] || -1e9) < 1500) return;
      this.onAct({ ...a, synthetic: true });
    }, 40);
  }

  onAct(raw) {
    if (!raw || !raw.type || !this.data) return;
    if (!raw.synthetic && (raw.type === 'forge' || raw.type === 'smelt' || raw.type === 'cook')) {
      // a real one right after a stand-in for the same thing: already counted
      const dup = performance.now() - (this.synthT?.[raw.type] || -1e9) < 1500;
      this.realSeen[raw.type] = true;
      this.realT[raw.type] = performance.now();
      if (dup) return;
    }
    if (raw.synthetic) (this.synthT ||= {})[raw.type] = performance.now();
    const a = { ...raw };
    for (const k of ['npc', 'to', 'from']) if (a[k] !== undefined) a[k] = normNpc(a[k]);
    if (a.type === 'reach' && typeof a.place === 'string') {
      a.place = normPlace(a.place);
      // the map remembers places you've stood in
      const at = (this.state.data.atlas ||= { pins: [], seen: {} });
      (at.known ||= {})[a.place] = this.state.data.day || 1;
    }
    if (a.type === 'explore' && typeof a.biome === 'number') a.biome = BIOME_IDS[a.biome] || null;
    if (a.type === 'sell' && a.weapon && !a.weapon.type && a.id) a.weapon = { ...a.weapon, type: a.id };
    const q = this.data;
    if (a.type === 'talk' && a.npc) this.npcNews[a.npc] = [];
    // lessons: a lesson step skips ahead to it
    if (a.type === 'lesson' && q.active.lessons) this.lessonAct(a.step);
    // ...and so does doing a later lesson's thing (riding down, smelting): a tutorial doesn't hold you back
    else if (q.active.lessons && a.type !== 'talk') {
      const L = QUESTS.lessons.steps, cur = q.active.lessons.s;
      let k = -1;
      for (let i = cur + 1; i < L.length; i++) if (L[i].on && list(L[i].on).some((m) => m.type !== 'talk' && matches(m, a)) && (!L[i].need || L[i].need(this.state, this.game))) k = i;
      if (k > cur) while (this.data.active.lessons && this.data.active.lessons.s < k) this.advance('lessons');
    }
    for (const id of Object.keys(q.active)) {
      const def = QUESTS[id], st = q.active[id];
      if (!def || !st) continue;
      const s = def.steps[st.s];
      if (!s) continue;
      // deliveries: talk to them with the goods
      if (s.deliver && a.type === 'talk' && a.npc === s.deliver.to) { this.tryDeliver(id, s); continue; }
      if (!s.on) continue;
      if (!list(s.on).some((m) => matches(m, a))) continue;
      if (s.need && !s.need(this.state, this.game)) continue;
      const max = s.n || 1;
      if (s.unique) {
        const v = a[s.unique];
        st.u ||= [];
        if (v == null || st.u.includes(v)) continue;
        st.u.push(v);
        st.n = st.u.length;
      } else st.n = (st.n || 0) + (s.sum ? Math.max(0, +a[s.sum] || 0) || 1 : 1);
      this.state.dirty = true;
      if (st.n >= max) this.advance(id);
      else this.emit('progress', { id, n: st.n, max, quest: this.get(id) });
    }
    // talking to someone may start their next request
    if (a.type === 'talk' && a.npc) this.offer(a.npc);
    this.refreshSoon();
  }

  /** A { type: 'lesson', step } act: complete the lesson steps up to and including it. */
  lessonAct(name) {
    const def = QUESTS.lessons, st = this.data.active.lessons;
    if (!st) return;
    if (name === 'skip' || name === 'done') { while (this.data.active.lessons) this.advance('lessons'); return; }
    const k = def.steps.findIndex((s) => list(s.lesson).includes(name));
    if (k < st.s) return;
    while (this.data.active.lessons && this.data.active.lessons.s <= k) this.advance('lessons');
  }

  tryDeliver(id, s) {
    const d = s.deliver;
    const short = this.deliverShort(d);
    if (short.length) {
      (this.npcNews[d.to] ||= []).push(`<b>${fillNames(QUESTS[id].title)}</b> · I still need ${short.join(' and ')}.`);
      this.emit('short', { id, npc: d.to, short, quest: this.get(id) });
      return false;
    }
    const gave = this.takeDelivery(d);
    const def = QUESTS[id];
    if (this.data.active[id].s === def.steps.length - 1 && def.outro) (this.npcNews[d.to] ||= []).push(fillNames(def.outro));
    this.emit('handed', { id, npc: d.to, gave, quest: this.get(id) });
    this.advance(id);
    return true;
  }

  /** Offer the next request from this npc (one at a time per npc). Folk who ask (Deep Town) don't
   *  hand work out on their own: their dialog offers it (offers(npc), accept(id)). */
  offer(npc) {
    const q = this.data;
    // a story beat (urgent) comes first, even alongside their other work
    const urgent = QUEST_ORDER.find((k) => QUESTS[k].from === npc && QUESTS[k].urgent && !QUESTS[k].ask && this.available(k));
    if (urgent) { this.start(urgent, { by: npc }); return urgent; }
    if (Object.keys(q.active).some((id) => QUESTS[id].from === npc)) return null;
    const id = QUEST_ORDER.find((k) => QUESTS[k].from === npc && !QUESTS[k].ask && this.available(k));
    if (!id) return null;
    this.start(id, { by: npc });
    return id;
  }

  /** Quests this npc would offer you right now in a dialog (one at a time, like the burrow folk). */
  offers(npc) {
    npc = normNpc(npc);
    if (Object.keys(this.data.active).some((id) => QUESTS[id].from === npc)) return [];
    const id = QUEST_ORDER.find((k) => QUESTS[k].from === npc && QUESTS[k].ask && this.available(k));
    return id ? [id] : [];
  }

  /** The current step of an active quest, if this npc is the one to see about it. */
  stepsFor(npc) {
    npc = normNpc(npc);
    const out = [];
    for (const [id, a] of Object.entries(this.data.active)) {
      const def = QUESTS[id], s = def?.steps[a.s];
      if (!s) continue;
      const talk = list(s.on).some((m) => m.type === 'talk' && (Array.isArray(m.npc) ? m.npc.includes(npc) : m.npc === npc)) && !(s.unique === 'npc' && (a.u || []).includes(npc));
      const kind = s.choose?.to === npc ? 'choose' : s.deliver?.to === npc ? 'deliver' : talk ? 'talk' : def.from === npc ? 'waiting' : null;
      if (!kind) continue;
      let ready = kind === 'choose' || (kind === 'talk' && (!s.need || s.need(this.state, this.game)));
      if (kind === 'deliver') ready = this.deliverHave(s.deliver) >= this.deliverMax(s.deliver);
      out.push({ id, kind, ready, step: s, quest: this.get(id) });
    }
    return out;
  }

  /** What hangs over this npc's head: '!' work to offer, '?' something to hand in or say (gold),
   *  '…' a request of theirs under way (grey), or null. */
  markerFor(npc) {
    if (!this.data) return null;
    npc = normNpc(npc);
    const mine = this.stepsFor(npc);
    if (mine.some((m) => m.ready)) return '?';
    const busy = Object.keys(this.data.active).some((id) => QUESTS[id].from === npc);
    if (this.offers(npc).length || QUEST_ORDER.some((k) => QUESTS[k].from === npc && !QUESTS[k].ask && this.available(k) && (QUESTS[k].urgent || !busy))) return '!';
    if (mine.length) return '…';
    return null;
  }

  /** What a dialog with this npc might say about quests: { lines, offers, delivers }. Clears the news. */
  forNpc(npc) {
    npc = normNpc(npc);
    const lines = [...(this.npcNews[npc] || [])];
    this.npcNews[npc] = [];
    const mine = this.active().filter((v) => v.def.from === npc || v.step?.deliver?.to === npc);
    if (!lines.length) for (const v of mine) lines.push(`<b>${v.title}</b> · ${v.text}${v.max > 1 ? ` (${v.n}/${v.max})` : ''}`);
    return {
      lines,
      offers: QUEST_ORDER.filter((k) => QUESTS[k].from === npc && this.available(k)),
      delivers: mine.filter((v) => v.step?.deliver && v.n >= v.max).map((v) => v.id),
    };
  }

  // ------------------------------------------------------------ state checks
  refreshSoon() {
    if (this._soon) return;
    this._soon = true;
    Promise.resolve().then(() => { this._soon = false; this.refresh(); });
  }

  /** Auto-start quests whose requirements are done; complete steps whose state checks hold. */
  refresh(quiet = false) {
    if (!this.data) return;
    if (this._busy) { this._again = true; return; }
    this._busy = true;
    try {
      let guard = 0;
      do {
        this._again = false;
        const q = this.data;
        for (const id of QUEST_ORDER) {
          const def = QUESTS[id];
          if (def.auto && this.available(id)) this.start(id, { quiet });
        }
        for (const id of Object.keys(q.active)) {
          const def = QUESTS[id], a = q.active[id];
          const s = def?.steps[a.s];
          if (!s) continue;
          let ok = false;
          try {
            if (s.check && s.check(this.state)) ok = true;
            else if (s.count && s.count(this.state) >= (s.n || 1)) ok = true;
          } catch (e) { /* a check on missing data: not yet */ }
          if (ok) this.advance(id, { quiet });
          else if (s.count || s.deliver) {
            const p = this.progress(id, s, a);
            const key = p.n + '/' + p.max;
            if (a.shown !== key) { const first = a.shown === undefined; a.shown = key; if (!first && !quiet) this.emit('progress', { id, n: p.n, max: p.max, quest: this.get(id), passive: true }); }
          }
        }
      } while (this._again && ++guard < 20);
    } finally { this._busy = false; }
  }
}

/** A quest's reward plus a choice's (gold and points add up, items and lore join). */
function mergeReward(a, b) {
  const r = { ...a };
  if (!b) return r;
  for (const k of ['gold', 'sp']) if (b[k]) r[k] = (r[k] || 0) + b[k];
  if (b.items) r.items = { ...(r.items || {}), ...b.items };
  if (b.lore) r.lore = [...list(r.lore), ...list(b.lore)];
  if (b.recipe) r.recipe = [...list(r.recipe), ...list(b.recipe)];
  if (b.rep) r.rep = typeof b.rep === 'number' ? b.rep : { ...(typeof r.rep === 'object' ? r.rep : {}), ...b.rep };
  if (b.flag) r.flag = b.flag;
  return r;
}

// The book: one leather-bound book with chapter tabs on the page edge (B opens it, M opens it at
// the map). Quests (grouped: the way up, Deep Town & neighbours, lore; who else has work; done),
// the hand-drawn Map (Survey.js), Skills (src/ui/SkillTree.js when it exists), the Index (a summary
// that opens the Index Book), and Lore (Old Star's notes, tales, Hobb's journal, carvings, relics:
// src/core/lore.js; 'notes' still opens it). Two pages side by side, one at a time on phones.
// The pause menu (the little green journal) lives at the bottom of this file.
//   openBook(game, tab?, opts?) → panel handle with .tab(name), .chapter, .map (the map controller)
import { el } from '../core/util.js';
import { iconURL, weaponIconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { CREATURES } from '../data/creatures.js';
import { MECHANICS } from '../data/mechanics.js';
import { DISHES } from '../data/recipes.js';
import { WEAPON_TYPES } from '../data/weapons.js';
import { NOTES } from '../data/notes.js';
import { NPCS, QUESTS, QUEST_GROUPS, groupOf, npcTitle, npcName, ZONE_NAMES, ZONE_DEPTHS } from '../data/quests.js';
import { SHELVES, LORE_BY_ID } from '../data/lore.js';
import { stepGoal } from '../core/questWhere.js';
import { npcFace } from './npcFace.js';
import { loreSheet } from './loreReader.js';
import './lore.css';
import { indexName } from '../core/State.js';
import { BART } from './bookArt.js';
import { SFX } from './bookSfx.js';
import { countText, rewardText } from './Tracker.js';
import { renderMap } from './Survey.js';
import { onSwipe, put } from './common.js';
import './journal.css';

const skillMods = import.meta.glob('./SkillTree.js');

export const CHAPTERS = [
  { id: 'quests', label: 'Quests', color: '#8a3a1a' },
  { id: 'map', label: 'Map', color: '#3d6a5a' },
  { id: 'skills', label: 'Skills', color: '#6a4a8a' },
  { id: 'index', label: 'Index', color: '#74291c' },
  { id: 'lore', label: 'Lore', color: '#3a5a6a' },
];
const TAB_ALIAS = { notes: 'lore' };
const INDEX_CATS = [
  { id: 'mineral', label: 'Minerals', icon: () => iconURL('copper_ore'), list: () => Object.keys(ITEMS).filter((k) => ITEMS[k].cat === 'mineral') },
  { id: 'gem', label: 'Gems', icon: () => iconURL('ruby'), list: () => Object.keys(ITEMS).filter((k) => ITEMS[k].cat === 'gem') },
  { id: 'plant', label: 'Plants', icon: () => iconURL('glowcap'), list: () => Object.keys(ITEMS).filter((k) => ITEMS[k].cat === 'plant') },
  { id: 'critter', label: 'Creatures', icon: () => iconURL('glow_beetle'), list: () => Object.keys(CREATURES) },
  { id: 'weapon', label: 'Weapons', icon: () => weaponIconURL(Object.keys(WEAPON_TYPES)[0], 'iron'), list: () => Object.keys(WEAPON_TYPES) },
  { id: 'recipe', label: 'Recipes', icon: () => iconURL(Object.keys(DISHES)[0]), list: () => Object.keys(DISHES) },
  { id: 'mechanic', label: 'Mechanics', icon: () => BART.tab('index'), list: () => Object.keys(MECHANICS) },
];

let lastTab = 'quests';
let lastQuest = null;
let lastNote = null;
let lastShelf = 'notes';
let lastLore = null;

/** The book's own little state that outlives one opening (selected quest/note, last tab). */
export function bookMemory() { return { lastTab, lastQuest, lastNote, lastShelf, lastLore }; }

/** Where a step happens, in words ("Nibble & Root, west wall · Deep Town"). */
export function whereText(v) {
  const g = stepGoal(v);
  if (!g) return '';
  if (g.npc) return `${npcName(g.npc)} · ${NPCS[g.npc]?.where || ''}${NPCS[g.npc]?.town ? ' (Deep Town)' : ''}`;
  if (g.burrow) return NPCS[Object.keys(NPCS).find((k) => NPCS[k].burrow === g.burrow)]?.where || 'A burrow in the mine';
  if (g.place === 'home') return "Old Star's workshop (home)";
  if (g.place === 'town') return 'Deep Town';
  if (g.place === 'dig') return "Old Star's dig, by the first lift";
  if (g.zone) return `The ${ZONE_NAMES[g.zone]}, ${ZONE_DEPTHS[g.zone - 1]} m down`;
  if (g.ruin) return g.ruin === 'nearest' ? 'An old ruin (your map marks the nearest)' : `A ${{ shrine: 'star shrine', vault: 'sealed vault', hall: 'pillared hall', well: 'drowned well' }[g.ruin] || 'ruin'} (your map marks the nearest)`;
  if (g.danger === 'nest') return 'A creature lair (red rings on your radar)';
  if (g.sight) return { lake: 'An underground lake (blue on your radar)', lava: 'A lava pool in the Magma Deep', cavein: 'A cave-in on an old trail', signpost: 'The old trails\' signposts', sunbeam: 'The sunbeam, Deep Town', well: 'The old well, Deep Town', tunnel: 'The boarded tunnel, Deep Town', fountain: 'The fountain, Deep Town' }[g.sight] || '';
  if (g.biome) return { dino: 'The dino caverns (huge caves, ferns, bones)', fungus: 'The Mushroom Hollow', dry: 'The Sandstone Hollows', moss: 'Mossy caves' }[g.biome] || 'Somewhere in the mine';
  return g.scene === 'deep' ? 'Anywhere in the mine' : g.scene === 'home' ? "At Old Star's" : '';
}

export function openBook(game, tab, opts = {}) {
  const ui = game.ui, st = game.state, Q = game.quests;
  const existing = ui.panelStack.find((p) => p.kind === 'tome');
  if (existing) { if (tab) existing.tab(tab); return existing; }
  if (tab === 'notes') lastShelf = 'notes';
  if (TAB_ALIAS[tab]) tab = TAB_ALIAS[tab];
  if (!tab) tab = Q && Q.unseen() ? 'quests' : lastTab;
  if (!CHAPTERS.some((c) => c.id === tab)) tab = 'quests';
  ui.status?.setBadge?.(false);

  const left = el('div', { class: 'ib-page ib-left bk-page' });
  const right = el('div', { class: 'ib-page ib-right bk-page' });
  const spread = el('div', { class: 'bk-spread', hidden: true });
  const turn = el('div', { class: 'ib-turn', hidden: true }, [el('i'), el('b')]);
  const pages = el('div', { class: 'ib-pages' }, [left, right, spread, turn]);
  const tabs = el('nav', { class: 'ib-tabs bk-tabs', 'aria-label': 'Chapters' });
  const ribbon = el('i', { class: 'ib-ribbon' });
  const cover = el('div', { class: 'ib-cover' }, [pages]);
  const book = el('div', { class: 'ib bk' }, [ribbon, cover, tabs]);
  let chapter = tab, side = 'left', h = null, map = null, cleanup = [];

  // ---------------- tabs
  const tabEls = {};
  for (const c of CHAPTERS) {
    const b = el('button', { class: 'ib-tab bk-tab', title: `${c.label} (${CHAPTERS.indexOf(c) + 1})`, 'aria-label': c.label, onclick: () => go(c.id) }, [
      el('img', { class: 'pix', src: BART.tab(c.id), alt: '' }), el('span', {}, c.label), el('i', { class: 'bk-dot', hidden: true }),
    ]);
    b.style.setProperty('--tc', c.color);
    tabEls[c.id] = b;
    tabs.append(b);
  }
  const markTabs = () => {
    for (const c of CHAPTERS) tabEls[c.id].classList.toggle('on', c.id === chapter);
    tabEls.quests.querySelector('.bk-dot').hidden = !(Q && Q.unseen());
    const unread = game.lore ? game.lore.unread() : NOTES.filter((n) => !(st.data.notesRead || []).includes(n.id)).length;
    tabEls.lore.querySelector('.bk-dot').hidden = !unread;
  };

  // ---------------- chapters
  const head = (title, sub) => el('header', { class: 'bk-head' }, [el('h2', { class: 'ib-title' }, title), sub ? el('div', { class: 'bk-sub', html: sub }) : null]);
  const back = () => el('button', { class: 'ib-back', onclick: () => { side = 'left'; flip(-1, () => {}); } }, '‹ Back');

  // ===== Quests
  const questRow = (v) => {
    const ready = v.status === 'active' && (v.ready || (v.step && Q.stepsFor(v.step.deliver?.to || v.step.choose?.to || '').some((m) => m.id === v.id && m.ready)));
    const b = el('button', {
      class: 'bk-q' + (v.status === 'done' ? ' done' : '') + (v.tracked ? ' tracked' : '') + (v.id === lastQuest ? ' on' : '') + (v.isNew ? ' new' : '') + (ready ? ' ready' : ''),
      onclick: () => pickQuest(v.id),
    }, [
      el('i', { class: 'bk-seal', style: { '--ink': NPCS[v.giver]?.ink || '#8a3a1a' } }),
      el('span', { class: 'bk-qt' }, [
        el('b', {}, v.title),
        v.status === 'done' ? el('small', {}, `${npcTitle(v.giver)} · day ${v.doneDay}${v.choice ? ' · ' + (QUESTS[v.id].steps.flatMap((s) => s.choose?.options || []).find((o) => o.id === v.choice)?.label || '') : ''}`)
          : el('small', {}, [ready ? el('i', { class: 'bk-ready' }, '? ') : null, v.text, v.max > 1 ? el('em', {}, ` ${countText(v)}`) : null]),
      ]),
      v.tracked ? el('img', { class: 'pix bk-ribbon-ic', src: BART.pin('pin'), alt: 'tracked', title: 'On your strip' }) : null,
    ]);
    if (v.status === 'active' && v.max > 1) b.append(el('i', { class: 'bk-bar' }, [el('b', { style: { width: Math.round((v.n / v.max) * 100) + '%' } })]));
    return b;
  };
  /** Somebody with work to hand out (not started yet): who and where. */
  const askRow = (npc, id) => el('button', { class: 'bk-q ask' + (lastQuest === 'ask:' + npc ? ' on' : ''), onclick: () => pickQuest('ask:' + npc) }, [
    el('i', { class: 'bk-bang' }, '!'),
    el('span', { class: 'bk-qt' }, [el('b', {}, `${npcName(npc)} has work`), el('small', {}, NPCS[npc]?.where || '')]),
  ]);
  let showDone = false;
  const quests = {
    left() {
      const L = Q ? Q.list() : { active: [], done: [], open: [] };
      left.innerHTML = '';
      const list = el('div', { class: 'ib-scroll bk-list' });
      if (!L.active.length) list.append(el('p', { class: 'ib-note muted' }, 'Nothing under way. Old Star would say that\'s suspicious.'));
      // the one on your strip first, then the rest by group
      const pinned = L.active.find((v) => v.tracked);
      if (pinned) { list.append(el('h3', { class: 'bk-group pin' }, [el('span', {}, 'On your strip')])); list.append(questRow(pinned)); }
      for (const g of QUEST_GROUPS) {
        const rows = L.active.filter((v) => groupOf(v.kind) === g.id && v !== pinned);
        if (!rows.length) continue;
        list.append(el('h3', { class: 'bk-group' }, [el('span', {}, g.label), el('small', {}, String(rows.length))]));
        for (const v of rows) list.append(questRow(v));
      }
      // who else has work: Deep Town folk with a "!" over their head, the burrow folk's next request
      const askers = [...new Set(L.open.map((v) => QUESTS[v.id].from).filter(Boolean))].filter((npc) => Q.markerFor(npc) === '!');
      if (askers.length) {
        list.append(el('h3', { class: 'bk-group ask' }, [el('span', {}, 'Ask around'), el('small', {}, String(askers.length))]));
        for (const npc of askers.slice(0, 8)) list.append(askRow(npc));
      }
      if (L.done.length) {
        const tog = el('button', { class: 'bk-fold' + (showDone ? ' open' : ''), onclick: () => { showDone = !showDone; SFX.flick(game.audio); quests.left(); } }, [`Done (${L.done.length})`]);
        list.append(tog);
        if (showDone) for (const v of L.done) list.append(questRow(v));
      }
      put(left,
        head('Quests', `${L.active.length} under way${L.done.length ? ` · ${L.done.length} done` : ''}`),
        list,
        el('footer', { class: 'bk-foot' }, [el('span', {}, 'Tap a quest to read it. The pinned one is on your strip; a gold ! means someone has work.')]),
      );
    },
    right() {
      right.innerHTML = '';
      if (lastQuest?.startsWith('ask:')) { askPage(lastQuest.slice(4)); return; }
      const id = lastQuest && Q?.get(lastQuest) ? lastQuest : Q?.data.tracked || Q?.active()[0]?.id;
      const v = id && Q ? Q.get(id) : null;
      if (!v) { put(right, back(), head('Old Star says'), el('p', { class: 'ib-note' }, '"Write down what you mean to do, then do it. Then cross it out. Crossing out is the best part."')); return; }
      Q.markSeen(v.id);
      const giver = v.giver, ink = NPCS[giver]?.ink || '#8a3a1a';
      // what to do now: the current step, big, with its count, hint and place
      const cur = v.status === 'active' ? v.steps[v.i] : null;
      const now = cur ? el('section', { class: 'bk-now', style: { '--ink': ink } }, [
        el('h4', {}, `Now · step ${v.i + 1} of ${v.steps.length}`),
        el('div', { class: 'bk-now-line' }, [el('img', { class: 'pix', src: BART.box(false), alt: '' }), el('b', {}, cur.text), cur.max > 1 ? el('em', {}, countText({ ...cur, step: cur.def })) : null]),
        cur.max > 1 ? el('i', { class: 'bk-bar wide' }, [el('b', { style: { width: Math.round((cur.n / cur.max) * 100) + '%' } })]) : null,
        cur.hint ? el('p', { class: 'bk-hint' }, cur.hint) : null,
        whereText(v) ? el('p', { class: 'bk-where' }, [el('img', { class: 'pix', src: BART.pin('quest'), alt: '' }), el('span', {}, whereText(v))]) : null,
      ]) : null;
      const steps = el('ol', { class: 'bk-steps' });
      v.steps.forEach((s, k) => {
        if ((k >= v.i && v.status !== 'done')) return;
        steps.append(el('li', { class: 'done' }, [el('img', { class: 'pix', src: BART.box(true), alt: '' }), el('span', {}, [el('span', { class: 'bk-st' }, s.text)])]));
      });
      const left_ = v.status === 'active' ? v.steps.length - v.i - 1 : 0;
      if (left_ > 0) steps.append(el('li', { class: 'more' }, [el('span', {}, left_ === 1 ? '…and one more thing after that.' : `…and ${left_} more things after that.`)]));
      // quest items you carry for it
      const carry = v.status === 'active' ? questItems(v) : [];
      const rw = v.reward ? rewardText(v.reward, { rep: giver, village: v.kind === 'village' }) : '';
      const where = cur && stepGoal(v);
      const trackBtn = v.status === 'active' ? el('button', {
        class: 'bk-track' + (v.tracked ? ' on' : ''), onclick: () => {
          if (v.tracked) return;
          Q.track(v.id);
          SFX.pin(game.audio);
          render();
        },
      }, [el('img', { class: 'pix', src: BART.pin('pin'), alt: '' }), v.tracked ? 'On your strip' : 'Pin to your strip']) : null;
      const mapBtn = v.status === 'active' && where && (where.scene === 'deep' || where.place) ? el('button', { class: 'bk-maplink', onclick: () => go('map', { focus: { quest: v.id } }) }, [el('img', { class: 'pix', src: BART.tab('map'), alt: '' }), 'Show on map']) : null;
      put(right,
        back(),
        el('div', { class: 'bk-giver' }, [
          el('div', { class: 'ib-sketch bk-sketch bk-face' }, [el('img', { class: 'pix', src: npcFace(game, giver, { size: 64 }), alt: '' }), el('i', { class: 'tape a' })]),
          el('div', {}, [
            el('h2', { class: 'ib-title bk-qtitle' }, v.title),
            el('div', { class: 'bk-from' }, [npcTitle(giver), el('small', {}, NPCS[giver]?.where ? ` · ${NPCS[giver].where}` : '')]),
            el('div', { class: 'bk-kind' }, { main: 'The way up', story: 'Old Star\'s advice', request: 'A request', village: 'A favour for Deep Town', lore: 'Lore' }[v.kind] || ''),
          ]),
        ]),
        v.intro ? el('blockquote', { class: 'bk-said', style: { '--ink': ink } }, v.intro) : null,
        now,
        steps.children.length ? steps : null,
        carry.length ? el('div', { class: 'bk-carry' }, [el('span', {}, 'You carry'), ...carry.map((it) => el('span', { class: 'bk-item', title: ITEMS[it]?.desc || '' }, [el('img', { class: 'pix', src: iconURL(it), alt: '' }), ITEMS[it]?.name || it]))]) : null,
        v.status === 'done' && v.outro ? el('blockquote', { class: 'bk-said after', style: { '--ink': ink } }, v.outro) : null,
        rw ? el('div', { class: 'bk-reward' }, [el('span', {}, v.status === 'done' ? 'Got' : 'Reward'), el('b', { class: 'gold-txt' }, rw)]) : null,
        el('div', { class: 'bk-actions' }, [trackBtn, mapBtn]),
        v.status === 'done' ? el('div', { class: 'bk-donestamp' }, [el('img', { class: 'pix', src: BART.stamp(), alt: '' }), el('span', {}, `Done · day ${v.doneDay}`)]) : null,
      );
    },
  };
  /** The quest items a quest has handed you (that are still in your paws). */
  const questItems = (v) => {
    const ids = new Set();
    for (const s of v.def.steps) { for (const it of Object.keys(s.grant || {})) ids.add(it); for (const it of Object.keys(s.deliver?.items || {})) if (ITEMS[it]?.quest) ids.add(it); }
    for (const it of Object.keys(v.def.gives || {})) ids.add(it);
    return [...ids].filter((it) => st.count(it) > 0);
  };
  const askPage = (npc) => {
    const id = Q.offers(npc)[0] || Q.list().open.find((o) => QUESTS[o.id].from === npc)?.id;
    const def = id ? QUESTS[id] : null;
    put(right, back(),
      el('div', { class: 'bk-giver' }, [
        el('div', { class: 'ib-sketch bk-sketch bk-face' }, [el('img', { class: 'pix', src: npcFace(game, npc, { size: 64 }), alt: '' }), el('i', { class: 'tape a' })]),
        el('div', {}, [el('h2', { class: 'ib-title bk-qtitle' }, `${npcName(npc)} has work`), el('div', { class: 'bk-from' }, [NPCS[npc]?.title || '', el('small', {}, NPCS[npc]?.where ? ` · ${NPCS[npc].where}` : '')])]),
      ]),
      el('section', { class: 'bk-now', style: { '--ink': NPCS[npc]?.ink || '#8a3a1a' } }, [
        el('h4', {}, 'How to start it'),
        el('div', { class: 'bk-now-line' }, [el('i', { class: 'bk-bang big' }, '!'), el('b', {}, NPCS[npc]?.town ? `Talk to ${npcName(npc)} in Deep Town` : `Talk to ${npcName(npc)} at their counter`)]),
        el('p', { class: 'bk-hint' }, NPCS[npc]?.town ? 'Look for the gold ! over their head. They\'ll tell you what they need, and you can say yes or not now.' : 'Their Jobs tab has it, or just open their counter.'),
        NPCS[npc]?.where ? el('p', { class: 'bk-where' }, [el('img', { class: 'pix', src: BART.pin('quest'), alt: '' }), el('span', {}, NPCS[npc].where)]) : null,
      ]),
      def ? el('p', { class: 'ib-note muted' }, `Word is it's about "${def.title}".`) : null,
    );
  };
  const pickQuest = (id) => {
    lastQuest = id;
    if (book.classList.contains('single')) { flip(1, () => { side = 'right'; }); return; }
    game.audio.play('ui_click');
    quests.left();
    quests.right();
    right.classList.remove('ink'); void right.offsetWidth; right.classList.add('ink');
  };

  // ===== Lore: shelves of what you've found (Old Star's notes are one shelf)
  const lore = {
    left() {
      left.innerHTML = '';
      const L = game.lore;
      const list = el('div', { class: 'ib-scroll bk-lore' });
      if (!L) { put(left, head('Lore'), el('p', { class: 'ib-note muted' }, 'Nothing written yet.')); return; }
      for (const sh of L.shelves()) {
        const open = sh.id === lastShelf;
        list.append(el('button', { class: 'bk-shelf' + (open ? ' open' : ''), style: { '--ink': sh.ink }, onclick: () => { lastShelf = open ? null : sh.id; SFX.flick(game.audio); lore.left(); } }, [
          el('i', { class: 'bk-spine' }), el('span', {}, [el('b', {}, sh.label), el('small', {}, sh.sub)]), el('em', {}, `${sh.n}/${sh.max}`), sh.unread ? el('i', { class: 'bk-new' }) : null,
        ]));
        if (!open) continue;
        const ul = el('ul', { class: 'bk-entries' });
        for (const x of L.shelf(sh.id)) {
          const e = x.entry;
          ul.append(el('li', {}, [x.found ? el('button', { class: 'bk-entry' + (e.id === lastLore ? ' on' : '') + (x.read ? '' : ' unread'), onclick: () => pickLore(e.id, sh.id) }, e.title)
            : el('span', { class: 'bk-entry unknown', title: SRC_HINT[e.src] || '' }, ['· · ·', el('small', {}, SRC_HINT[e.src] || '')])]));
        }
        list.append(ul);
      }
      put(left, head('Lore', `${L.count()} of ${L.total()} found`), list,
        el('footer', { class: 'bk-foot' }, [el('span', {}, 'Folk on the benches tell tales. Ruins have carvings. Cave-ins hide old pages.')]));
    },
    right() {
      right.innerHTML = '';
      const L = game.lore;
      let e = null;
      if (lastShelf === 'notes' || (lastLore && !LORE_BY_ID[lastLore])) {
        const n = NOTES.find((x) => x.id === lastLore) || NOTES.find((x) => !(st.data.notesRead || []).includes(x.id)) || NOTES[0];
        if (n) { e = { ...n, shelf: 'notes', src: 'note' }; lastLore = n.id; const rd = (st.data.notesRead ||= []); if (!rd.includes(n.id)) { rd.push(n.id); st.dirty = true; } }
      } else e = LORE_BY_ID[lastLore] && L?.has(lastLore) ? LORE_BY_ID[lastLore] : null;
      if (!e) { put(right, back(), head('Lore'), el('p', { class: 'ib-note' }, '"Every stone down here remembers something. Most of it is about other stones." — Old Star')); return; }
      L?.markRead(e.id);
      put(right, back(), el('div', { class: 'bk-lorepage' }, [loreSheet(e)]));
    },
  };
  const SRC_HINT = { carving: 'Carved in a ruin', journal: 'A page by a cave-in', tale: 'Someone in Deep Town knows', relic: 'In a ruin\'s treasure room', book: 'In a book somewhere', quest: 'At the end of a quest', note: '' };
  const pickLore = (id, shelf) => {
    lastLore = id;
    lastShelf = shelf;
    if (book.classList.contains('single')) { flip(1, () => { side = 'right'; }); return; }
    SFX.flick(game.audio);
    lore.right(); lore.left(); markTabs();
    right.classList.remove('ink'); void right.offsetWidth; right.classList.add('ink');
  };

  // ===== Notes
  const notes = {
    left() {
      left.innerHTML = '';
      const read = new Set(st.data.notesRead || []);
      const list = el('div', { class: 'ib-scroll bk-notes' });
      NOTES.forEach((n, i) => {
        const b = el('button', { class: 'bk-slip' + (n.id === lastNote ? ' on' : '') + (read.has(n.id) ? '' : ' unread'), style: { '--r': (((i * 37) % 7) - 3) * 0.4 + 'deg' }, onclick: () => pickNote(n.id) }, [
          el('i', { class: 'bk-tack' }), el('span', {}, n.title),
        ]);
        list.append(b);
      });
      put(left, head("Old Star's Notes", `${NOTES.length} scraps, ${NOTES.filter((n) => !read.has(n.id)).length} unread`), list);
    },
    right() {
      right.innerHTML = '';
      const n = NOTES.find((x) => x.id === lastNote) || NOTES.find((x) => !(st.data.notesRead || []).includes(x.id)) || NOTES[0];
      if (!n) return;
      lastNote = n.id;
      const rd = (st.data.notesRead ||= []);
      if (!rd.includes(n.id)) { rd.push(n.id); st.dirty = true; }
      const signed = /O\.\s?S\.|Old Star/.test(n.text.slice(-24));
      put(right,
        back(),
        el('div', { class: 'bk-note' }, [
          el('i', { class: 'bk-tack big' }),
          el('h2', { class: 'ib-title' }, n.title),
          ...n.text.split('\n').map((p) => el('p', {}, p.trim())),
          signed ? null : el('div', { class: 'bk-sign' }, [el('span', {}, '— Old Star'), el('img', { class: 'pix', src: BART.stamp(), alt: '' })]),
        ]),
      );
    },
  };
  const pickNote = (id) => {
    lastNote = id;
    if (book.classList.contains('single')) { flip(1, () => { side = 'right'; }); return; }
    SFX.flick(game.audio);
    notes.right(); notes.left(); markTabs();
    right.classList.remove('ink'); void right.offsetWidth; right.classList.add('ink');
  };

  // ===== Index (a summary; the Index Book opens on top)
  const index = {
    left() {
      left.innerHTML = '';
      const rows = el('div', { class: 'ib-scroll bk-index' });
      let tk = 0, tt = 0;
      for (const c of INDEX_CATS) {
        const ids = c.list();
        const k = ids.filter((id) => st.known(c.id, id)).length;
        tk += k; tt += ids.length;
        rows.append(el('button', { class: 'bk-ix', onclick: () => ui.openIndex(c.id) }, [
          el('img', { class: 'pix', src: c.icon(), alt: '' }), el('span', {}, c.label), el('b', {}, `${k}/${ids.length}`),
          el('i', { class: 'ib-bar' }, [el('b', { style: { width: (ids.length ? (k / ids.length) * 100 : 0).toFixed(1) + '%' } })]),
        ]));
      }
      put(left, head('Index', `${Math.round((tk / Math.max(1, tt)) * 100)}% of the book filled in`), rows,
        el('button', { class: 'btn bk-open', onclick: () => ui.openIndex() }, [el('img', { class: 'pix', src: BART.tab('index'), alt: '' }), 'Open the Index Book']));
    },
    right() {
      right.innerHTML = '';
      const recent = Object.entries(st.data.index || {}).map(([k, e]) => ({ k, day: e.day || 0, n: e.n || 1 })).sort((a, b) => b.day - a.day).slice(0, 9);
      const list = el('ul', { class: 'bk-recent' });
      for (const r of recent) {
        const [cat, id] = r.k.split(':');
        list.append(el('li', {}, [el('button', { onclick: () => ui.openIndex(cat, id) }, [el('img', { class: 'pix', src: ui.indexIcon ? ui.indexIcon(cat, id) : BART.tab('index'), alt: '' }), el('span', {}, indexName(cat, id)), el('small', {}, `day ${r.day}`)])]));
      }
      const s = st.data.stats || {};
      put(right, back(), head('Lately recorded'),
        recent.length ? list : el('p', { class: 'ib-note muted' }, 'Nothing yet. Poke things. Taste things. Write it down.'),
        el('ul', { class: 'ib-stats' }, [
          el('li', {}, [el('img', { class: 'pix', src: iconURL('pick_rusty'), alt: '' }), el('span', {}, 'Rock dug'), el('b', {}, String(s.blocks || 0))]),
          el('li', {}, [el('img', { class: 'pix', src: iconURL('copper_ore'), alt: '' }), el('span', {}, 'Finds'), el('b', {}, String(s.ores || 0))]),
          el('li', {}, [el('img', { class: 'pix', src: BART.stamp(), alt: '' }), el('span', {}, 'Quests done'), el('b', {}, String(Object.keys(st.data.quests?.done || {}).length))]),
        ]));
    },
  };

  // ===== Skills (the skills part's page; a plain page until it exists)
  const skills = {
    async spread() {
      spread.innerHTML = '';
      const load = skillMods['./SkillTree.js'];
      if (load) {
        try {
          const m = await load();
          if (chapter !== 'skills') return;
          const host = el('div', { class: 'bk-skillhost' });
          spread.append(host);
          const r = m.renderSkills ? m.renderSkills(host, game) : null;
          if (r && typeof r.dispose === 'function') cleanup.push(() => r.dispose());
          return;
        } catch (e) { console.warn('skill tree failed', e); }
      }
      const pts = st.data.skills?.points ?? st.skillPoints?.() ?? 0;
      spread.append(el('div', { class: 'bk-skillwait' }, [
        head('Skills'),
        el('p', { class: 'ib-note' }, `You have ${pts} skill point${pts === 1 ? '' : 's'} saved up.`),
        el('p', { class: 'ib-note muted' }, '"Points are like ore: no use in your pocket. Spend them." — Old Star'),
      ]));
    },
  };

  // ===== Map (a spread)
  const mapChapter = {
    spread(o = {}) {
      spread.innerHTML = '';
      map?.dispose();
      map = renderMap(spread, game, { focus: o.focus, book: true, onClose: () => h?.close() });
      h && (h.map = map);
    },
  };

  const CH = { quests, notes, lore, index, skills, map: mapChapter };
  const isSpread = (c) => c === 'map' || c === 'skills';

  const render = (o = {}) => {
    markTabs();
    book.dataset.chapter = chapter;
    book.dataset.side = side;
    const sp = isSpread(chapter);
    left.hidden = right.hidden = sp;
    spread.hidden = !sp;
    pages.classList.toggle('spread', sp);
    if (!sp && map) { map.dispose(); map = null; if (h) h.map = null; }
    for (const f of cleanup.splice(0)) { try { f(); } catch (e) { /* noop */ } }
    const C = CH[chapter];
    if (sp) C.spread(o);
    else { C.left(); C.right(); }
  };

  // ---------------- page turning
  let turning = false;
  const flip = (dir, swap, o) => {
    if (turning) { swap(); render(o); return; }
    turning = true;
    game.audio.play('page');
    turn.hidden = false;
    turn.className = 'ib-turn ' + (dir > 0 ? 'fwd' : 'back');
    void turn.offsetWidth;
    turn.classList.add('go');
    setTimeout(() => { swap(); render(o); }, 190);
    setTimeout(() => { turn.hidden = true; turn.className = 'ib-turn'; turning = false; }, 460);
  };
  const go = (id, o = {}) => {
    if (id === 'notes') lastShelf = 'notes';
    if (TAB_ALIAS[id]) id = TAB_ALIAS[id];
    if (!CHAPTERS.some((c) => c.id === id)) return;
    if (id === chapter) {
      if (side === 'right') { side = 'left'; flip(-1, () => {}); }
      else if (o.focus && map) map.focus(o.focus);
      return;
    }
    const dir = CHAPTERS.findIndex((c) => c.id === id) > CHAPTERS.findIndex((c) => c.id === chapter) ? 1 : -1;
    SFX.flick(game.audio);
    flip(dir, () => { chapter = id; lastTab = id; side = 'left'; }, o);
  };
  onSwipe(pages, (dir) => {
    if (chapter === 'map') return; // the map pans with drags
    if (book.classList.contains('single') && side === 'right') { if (dir > 0) { side = 'left'; flip(-1, () => {}); } return; }
    const i = CHAPTERS.findIndex((c) => c.id === chapter), j = i - dir;
    if (j >= 0 && j < CHAPTERS.length) go(CHAPTERS[j].id);
  });

  const fit = () => {
    // one page at a time on narrow screens; a landscape phone gets the full spread
    const single = window.innerWidth < 700;
    book.classList.toggle('single', single);
    map?.resize();
  };
  fit();
  window.addEventListener('resize', fit);

  const onKey = (e) => {
    if (!h || h.closed || ui.panelStack[ui.panelStack.length - 1] !== h) return;
    if (e.repeat) return;
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '');
    if (typing) return;
    if (e.code === 'KeyB') { e.preventDefault(); h.close(); return; }
    if (e.code === 'KeyM') { e.preventDefault(); if (chapter === 'map') h.close(); else go('map'); return; }
    const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
    if (n >= 0) { go(CHAPTERS[n].id); return; }
    if (chapter === 'map') return; // arrows pan the map
    const i = CHAPTERS.findIndex((c) => c.id === chapter);
    if (e.code === 'ArrowRight' || e.code === 'PageDown') { if (i < CHAPTERS.length - 1) go(CHAPTERS[i + 1].id); }
    else if (e.code === 'ArrowLeft' || e.code === 'PageUp') { if (i > 0) go(CHAPTERS[i - 1].id); }
  };
  window.addEventListener('keydown', onKey);

  lastTab = chapter;
  render({ focus: opts.focus });
  game.audio.play('page');
  h = ui.openPanel({
    body: book, className: 'ib-panel bk-panel',
    onClose: () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('keydown', onKey);
      map?.dispose();
      for (const f of cleanup.splice(0)) { try { f(); } catch (e) { /* noop */ } }
      if (ui.book === h) ui.book = null;
    },
  });
  h.kind = 'tome';
  h.map = map;
  h.tab = (id, o) => go(id, o || {});
  Object.defineProperty(h, 'chapter', { get: () => chapter });
  h.onEscape = () => {
    if (map?.onEscape?.()) return true;
    if (book.classList.contains('single') && side === 'right') { side = 'left'; flip(-1, () => {}); return true; }
    return false;
  };
  ui.book = h;
  return h;
}

// ======================================================================== the pause menu
// The pause menu as the mole's little green journal: a handwritten to-do list on the left page,
// carved sliders and stamps for the settings on the right.
export function openJournal(game) {
  const st = game.state;
  const s = st.data.settings;
  const ui = game.ui;

  const item = (label, fn) => el('li', {}, [el('button', { onclick: (e) => fn(e.currentTarget) }, label)]);
  const mins = Math.floor(st.data.playTime / 60);
  const left = el('div', { class: 'ib-page ib-left' }, [
    el('h2', { class: 'jr-title' }, 'Paused'),
    el('div', { class: 'jr-sub' }, `Day ${st.data.day} · ${mins < 1 ? 'just started' : mins + ' min underground'}`),
    el('ul', { class: 'jr-menu' }, [
      item('Resume', () => h.close()),
      item('Save game', (b) => {
        const ok = st.save();
        b.classList.add('jr-saved');
        game.audio.play(ok ? 'success' : 'ui_error');
        ui.toast(ok ? 'Game saved' : 'Could not save', { kind: ok ? 'good' : 'bad' });
      }),
      item('Title screen', () => { h.close(); game.goto('title'); }),
    ]),
    el('p', { class: 'jr-note' }, 'Your game saves on its own every little while.'),
  ]);

  const slider = (label, val, on) => {
    const input = el('input', { class: 'jr-slider', type: 'range', min: 0, max: 1, step: 0.05, value: val, 'aria-label': label, oninput: (e) => on(parseFloat(e.target.value)) });
    input.addEventListener('change', () => game.audio.play('ui_click'));
    return el('label', { class: 'jr-row' }, [el('span', {}, label), input]);
  };
  const pixBtns = [[-1, 'Fine'], [0, 'Normal'], [1, 'Chunky']].map(([v, l]) => {
    const b = el('button', { class: s.pixel === v ? 'on' : '', onclick: () => {
      s.pixel = v;
      game.engine.setPixelOffset(v);
      game.audio.play('ui_click');
      for (const x of pixBtns) x.classList.toggle('on', x === b);
    } }, l);
    return b;
  });
  const lever = el('button', { class: 'jr-lever' + (s.shake > 0 ? ' on' : ''), role: 'switch', 'aria-checked': s.shake > 0 ? 'true' : 'false', 'aria-label': 'Screen shake', onclick: () => {
    s.shake = s.shake > 0 ? 0 : 1;
    lever.classList.toggle('on', s.shake > 0);
    lever.setAttribute('aria-checked', s.shake > 0 ? 'true' : 'false');
    game.audio.play('click');
  } });
  const right = el('div', { class: 'ib-page ib-right' }, [
    el('h3', { class: 'jr-h' }, 'Settings'),
    slider('Music', s.music, (v) => { s.music = v; game.audio.setVolumes({ music: v }); }),
    slider('Sound', s.sfx, (v) => { s.sfx = v; game.audio.setVolumes({ sfx: v }); }),
    el('div', { class: 'jr-row' }, [el('span', {}, 'Pixels'), el('div', { class: 'jr-opts' }, pixBtns)]),
    el('div', { class: 'jr-row' }, [el('span', {}, 'Screen shake'), lever]),
  ]);

  const book = el('div', { class: 'ib jr' }, [
    el('div', { class: 'ib-cover' }, [el('div', { class: 'ib-pages' }, [left, right])]),
    el('i', { class: 'jr-band' }),
  ]);
  game.audio.play('page');
  const h = ui.openPanel({ body: book, className: 'jr-panel' });
  if (!document.documentElement.classList.contains('is-touch')) setTimeout(() => left.querySelector('button')?.focus({ preventScroll: true }), 40);
  return h;
}

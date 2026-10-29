// Deep Town's side of the quests: who is who (the townsfolk get their names from
// src/data/villagers.js by seed), talking to them about work (src/ui/questTalk.js), the keepers'
// news before their shop opens, the notice board of open requests, where people are (for the
// objective strip, the waypoint and the "!" / "?" over their heads: src/ui/QuestMarks.js), and the
// crosshair labels ("Talk to Hazel · has work for you").
// Made by TownScene after the folk and keepers: scene.townQuests = new TownQuests(scene), ticked.
// Scene hooks it sets: scene.questNpcPos(npc) → {x,y,z} m, scene.questAnchors() → [{ npc, head(out) }].
// Test hooks: scene.townQuests.debug.{ talk(npc), notices(), who(), pos(npc) }.
import * as THREE from 'three';
import { M } from './units.js';
import { QUESTS, QUEST_ORDER, npcName, NPCS } from '../data/quests.js';
import { questTalk } from '../ui/questTalk.js';
import { openTalkMenu } from '../ui/choices.js';
import { el, pick } from '../core/util.js';

const _h = new THREE.Vector3();
const NOTICES = [
  'Please do NOT feed the glow-worms. — The Council',
  'BAND PRACTICE Thursdays at the fountain. Bring a spoon.',
  'Mushroom swap, Sunday, back lane. No blue ones please.',
  'Surface Express: ONE WAY ONLY. No refunds. No returns. No exceptions.',
  'FOUND: one sense of direction. Not mine. — Burdock',
];

export class TownQuests {
  constructor(scene) {
    this.s = scene;
    this.game = scene.game;
    this.byNpc = new Map(); // npc id → { a: actor, npc?: folk record, k?: keeper }
    for (const f of scene.folk?.list || []) if (f.npcId) this.byNpc.set(f.npcId, { a: f.a, f });
    for (const k of scene.keepers || []) this.byNpc.set(k.id, { a: k.a, k });
    this.declined = {}; // npc → scene time (an offer said no to: the shop opens straight away for a while)
    this.labelT = 0;
    scene.questNpcPos = (npc) => this.pos(npc);
    scene.questAnchors = () => this.anchors();
    this.debug = {
      talk: (npc) => { const r = this.byNpc.get(npc); return r?.f ? scene.folk.talkTo(r.f) : r?.k ? this.keeper(r.k) : null; },
      notices: () => this.notices(),
      who: () => [...this.byNpc.keys()],
      pos: (npc) => this.pos(npc),
    };
  }

  /** Head position (meters) of a townsperson or keeper. */
  pos(npc) {
    const r = this.byNpc.get(npc);
    if (!r) return null;
    r.a.headPos(_h).multiplyScalar(M);
    return { x: _h.x, y: _h.y, z: _h.z };
  }

  anchors() {
    const out = [];
    for (const [npc, r] of this.byNpc) out.push({ npc, head: (o) => { r.a.headPos(o).multiplyScalar(M); o.y += 0.07; return o; }, obj: r.a.obj });
    return out;
  }

  // ------------------------------------------------------------ talking
  /** A townsperson with a name: their quest business, or a story. Returns the line said, or null. */
  talk(f) {
    const s = this.s, a = f.a;
    if (!f.npcId || !this.game.quests) return null;
    const say = (html, o = {}) => s.say(a, html, { name: f.name, voice: a.voice, life: 4.2, mood: o.mood });
    const r = questTalk(this.game, f.npcId, { say, tales: true });
    if (!r.handled) return null;
    if (!f.seated) a.faceToward(s.player.x, s.player.z);
    f.pause = 4;
    a.rig.lookAt(s.eyeTarget);
    f.lookHold = 4;
    if (f.sleeping) { a.rig.setExpression('sleepy', { hold: 3 }); }
    else a.rig.talk?.(1.6);
    return r.line || '...';
  }

  /** E on a keeper's window: news about work first (when there is any), else straight to the shop.
   *  Professor Talpa also lends books (his shelf: game.lore.readShelf('talpa')). */
  keeper(k) {
    const Q = this.game.quests;
    if (!Q || k.id === 'lift' && !Q.markerFor('lift')) return false;
    const mark = Q.markerFor(k.id);
    const extra = k.id === 'blueprints' && this.game.lore ? [{ label: 'May I read your books?', sub: 'His shelf of lore', onClick: () => this.game.lore.readShelf('talpa') }] : null;
    if (!mark && extra) {
      openTalkMenu(this.game, { name: k.spec.name, who: 'blueprints', mood: 'happy', line: pick(['Plans? Books? Theories? I have all three.', 'Ah, a visitor! Mind the ink.', 'Come in, come in. Touch nothing. Touch everything, carefully.']), options: [
        { label: 'Let\'s see the plans', sub: 'Open the shop', primary: true, onClick: () => { this.game.ui.closePanel(); this.s.useKeeper(k, true); } },
        { ...extra[0], onClick: () => { this.game.ui.closePanel(); extra[0].onClick(); } },
      ] });
      return true;
    }
    if (!mark) return false;
    if (mark === '!' && this.s.time - (this.declined[k.id] ?? -1e9) < 240) return false;
    const say = (html, o = {}) => this.s.say(k.a, html, { name: k.spec.name, voice: k.spec.voice, life: 4, mood: o.mood });
    const r = questTalk(this.game, k.id, { say, shop: () => this.s.useKeeper(k, true), tales: false, extra });
    if (r.handled && mark === '!') this.declined[k.id] = this.s.time; // asked once: next time, the shop
    if (r.handled) { k.a.rig.lookAt(this.s.eyeTarget); k.a.rig.talk?.(1.4); }
    return r.handled;
  }

  // ------------------------------------------------------------ the notice board
  /** The plaza's notice board: requests folk are hoping someone will take on, pinned up. */
  notices() {
    const g = this.game, Q = g.quests;
    if (!Q) return null;
    const open = QUEST_ORDER.filter((id) => QUESTS[id].ask && NPCS[QUESTS[id].from]?.town && Q.offers(QUESTS[id].from).includes(id));
    const under = Q.active().filter((v) => v.def.kind === 'village' || v.def.kind === 'lore');
    const note = (o, i) => el('button', {
      class: 'nb-note' + (o.cls ? ' ' + o.cls : ''), style: { '--r': `${((i * 37) % 9) - 4}deg` },
      onclick: () => { g.audio.play('page', { vol: 0.5 }); o.on?.(); },
    }, [el('i', { class: 'nb-tack' }), el('b', {}, o.title), el('span', {}, o.text), o.who ? el('small', {}, o.who) : null]);
    const notes = [
      ...open.slice(0, 8).map((id) => {
        const d = QUESTS[id], who = d.from;
        return { title: 'WANTED', text: Q.get(id).steps[0]?.text || d.title, who: `Ask ${npcName(who)} · ${NPCS[who]?.where || ''}`, cls: 'want', on: () => g.ui.toast(`Look for the <b class="gold-txt">!</b> over <b>${npcName(who)}</b>: ${NPCS[who]?.where || 'in town'}.`, { dur: 3400 }) };
      }),
      ...under.slice(0, 4).map((v) => ({ title: 'IN HAND', text: v.title, who: `${npcName(v.giver)} · ${v.text}`, cls: 'taken', on: () => { h.close(); Q.track(v.id); g.ui.openBook?.('quests'); } })),
      ...NOTICES.slice(0, Math.max(1, 5 - open.length)).map((t) => ({ title: 'NOTICE', text: t, cls: 'misc' })),
    ];
    const body = el('div', { class: 'nb' }, [
      el('div', { class: 'tk-sign' }, [el('i', { class: 'tk-chain l' }), el('i', { class: 'tk-chain r' }), el('h2', {}, 'Notice Board')]),
      el('div', { class: 'nb-cork' }, [
        el('p', { class: 'nb-head' }, open.length ? `${open.length} request${open.length > 1 ? 's' : ''} pinned up${open.length > 8 ? ' (the newest 8 shown)' : ''}. Find who asked: there's a gold ! over their head.` : 'Nothing new pinned up. Check back after a day in the mine.'),
        el('div', { class: 'nb-notes' }, notes.map(note)),
      ]),
    ]);
    const h = g.ui.openPanel({ body, className: 'tk-panel nb-panel' });
    g.state.emit('act', { type: 'look', at: 'notices' });
    return h;
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    this.labelT -= dt;
    if (this.labelT > 0) return;
    this.labelT = 0.5;
    const Q = this.game.quests;
    if (!Q) return;
    // crosshair labels say who has news for you
    for (const [npc, r] of this.byNpc) {
      if (!r.f?.talk?.item) continue;
      const m = Q.markerFor(npc), nm = r.f.name;
      r.f.talk.item.label = m === '!' ? `Talk to ${nm} · has work for you` : m === '?' ? `Talk to ${nm} · ${handLabel(Q, npc)}` : r.f.sleeping ? `Wake ${nm}` : `Chat with ${nm}`;
    }
    for (const k of this.s.keepers || []) {
      if (k.id === 'lift' || !k.item) continue;
      const m = Q.markerFor(k.id);
      k.item.label = m === '!' ? `${k.label} · ${k.spec.name} has work` : m === '?' ? `${k.label} · ${handLabel(Q, k.id)}` : k.label;
    }
  }
}

function handLabel(Q, npc) {
  const m = Q.stepsFor(npc).find((x) => x.ready);
  if (!m) return 'news';
  return m.kind === 'deliver' ? 'hand it over' : m.kind === 'choose' ? 'decide' : 'tell them';
}


// Talking to somebody about work: the quest side of a conversation, on the talk board
// (src/ui/choices.js openTalkMenu: name sign, their face, a speech bubble, pinned notes), which is a
// cutscene talk when they're here in 3D (src/ui/Convo.js: their reminders and asides too).
//   questTalk(game, npc, { say, shop, tales, extra }) → { handled, line }  (extra: more notes, e.g. a bookshelf)
// It tells the quests you talked to them (act talk: deliveries are handed over, "talk to X" steps
// tick), then shows, in order: what just happened (a hand-in, their thanks, the reward), a choice
// they're waiting on, work they'd like done (Accept / Not now), or a story they haven't told you.
// While their request is under way they just remind you in a speech bubble (opts.say(html)).
// opts.shop: () => opens their shop (keepers get a "Let's trade" note). Returns handled: false when
// there was nothing to say about quests (the caller chats or opens the shop as usual).
import { openTalkMenu } from './choices.js';
import { npcFace, npcWho } from './npcFace.js';
import { rewardText, countText } from './Tracker.js';
import { QUESTS, npcName, fillNames } from '../data/quests.js';
import { VILLAGERS } from '../data/villagers.js';
import { ITEMS } from '../data/items.js';
import { pick } from '../core/util.js';

const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, '');

/** Emit talk and collect what the quests did about it (synchronously). */
function talkAct(game, npc) {
  const Q = game.quests, got = [];
  const off = Q.on('change', (e) => got.push(e));
  Q.talking = npc; // the strip's toasts leave what the dialog says to the dialog
  try { game.state.emit('act', { type: 'talk', npc }); } finally { off(); Q.talking = null; }
  return got;
}

export function questTalk(game, npc, opts = {}) {
  const Q = game.quests;
  if (!Q) return { handled: false };
  const st = game.state, name = npcName(npc), V = VILLAGERS[npc] || {};
  // the speaker is here in 3D: their asides are cutscene lines too (src/ui/Convo.js), not bubbles
  const cv = game.convo?.speaker(npc) ? game.convo : null;
  const say = cv ? (html, o = {}) => cv.say(npc, html, { mood: o.mood || 'calm', wait: o.wait ?? true, dur: o.dur }) : opts.say;
  const evs = talkAct(game, npc);
  const done = evs.filter((e) => e.evt === 'done');
  const handed = evs.filter((e) => e.evt === 'handed' && e.npc === npc);
  const says = evs.filter((e) => e.evt === 'say' && (!e.by || e.by === npc));
  const stepped = evs.filter((e) => e.evt === 'step' && !done.some((d) => d.id === e.id));
  const short = evs.filter((e) => e.evt === 'short' && e.npc === npc);
  let h = null;
  const close = () => h?.close();
  const shopNote = [
    ...(opts.shop ? [{ label: 'Let\'s trade', sub: 'Open the shop', onClick: () => { close(); opts.shop(); } }] : []),
    ...(opts.extra || []).map((x) => ({ ...x, onClick: () => { close(); x.onClick?.(); } })),
  ];
  const bye = (label = pick(['Right you are', 'See you later', 'Bye for now'])) => ({ label, onClick: close });
  const board = (o) => {
    const line = o.reward ? `${o.line}<span class="qtk-reward gold-txt">${o.reward}</span>` : o.line;
    h = openTalkMenu(game, { name, face: npcFace(game, npc, { expression: o.mood || 'happy' }), who: npcWho(npc), npc, mood: o.mood, ...o, line });
    return h;
  };

  // ---- something happened: a hand-in, a quest done, a line for a finished step
  if (done.length || handed.length || says.length) {
    const lines = [];
    let sub = '', rw = '';
    for (const e of says) lines.push(e.text);
    for (const e of done) {
      const v = e.quest;
      if (v?.outro && QUESTS[e.id].giver === npc) lines.push(v.outro);
      else { const hd = QUESTS[e.id].steps.at(-1)?.heard; lines.push(hd ? pick(hd) : `<i>That's ${v?.title || 'it'} done. ${npcName(QUESTS[e.id].giver)} will be pleased.</i>`); }
      sub = `${v?.title || ''} · done!`;
      rw = rewardText(e.reward, { rep: QUESTS[e.id].giver });
    }
    for (const e of stepped) if (e.quest?.status === 'active') lines.push(`<small class="qtk-next">Next: <b>${e.quest.text}</b></small>`);
    if (!lines.length) lines.push(pick(V.thanks || ['Thank you!']));
    const more = Q.offers(npc)[0];
    board({
      line: lines.join('<br>'), sub: sub || (handed[0]?.quest?.title ? `${handed[0].quest.title}` : ''), mood: done.length ? 'happy' : 'smug',
      className: 'qtk', reward: rw ? 'Reward: ' + rw : '',
      options: [
        ...(more ? [{ label: 'Anything else I can do?', sub: 'They might have more work', primary: true, onClick: () => { close(); offerBoard(more); } }] : []),
        ...shopNote, bye(done.length ? 'Glad to help' : 'Right you are'),
      ],
    });
    return { handled: true, line: stripTags(lines[0]) };
  }

  // ---- they heard what they needed to (a "tell them" step that counts people): a word and the count
  const heard = evs.find((e) => e.evt === 'progress' && QUESTS[e.id]?.steps[e.quest?.i]?.heard);
  if (heard) {
    const line = `${pick(QUESTS[heard.id].steps[heard.quest.i].heard)} <small>(${heard.quest.title}: ${heard.n}/${heard.max})</small>`;
    if (say) say(line, { mood: 'surprised' });
    else board({ line, sub: heard.quest.title, mood: 'surprised', options: [bye()] });
    return { handled: true, line: stripTags(line) };
  }

  // ---- a choice they're waiting on
  const choice = Q.stepsFor(npc).find((m) => m.kind === 'choose');
  if (choice) {
    const c = choice.step.choose;
    board({
      line: fillNames(c.prompt), sub: choice.quest.title, mood: 'thinking',
      options: c.options.map((o, i) => ({
        label: o.label, sub: o.sub, primary: i === 0,
        onClick: () => {
          close();
          const got = [];
          const off = Q.on('change', (e) => got.push(e));
          Q.talking = npc;
          try { Q.choose(choice.id, o.id); } finally { off(); Q.talking = null; }
          const fin = got.find((e) => e.evt === 'done');
          const rw = fin ? rewardText(fin.reward, { rep: QUESTS[choice.id].giver }) : '';
          board({ line: [o.say, fin?.quest?.outro].filter(Boolean).join('<br>'), sub: `${choice.quest.title} · done!`, mood: 'happy', reward: rw ? 'Reward: ' + rw : '', options: [...shopNote, bye('So be it')] });
        },
      })),
    });
    return { handled: true, line: stripTags(c.prompt) };
  }

  // ---- work they'd like done
  const offer = Q.offers(npc)[0];
  if (offer) { offerBoard(offer); return { handled: true, line: stripTags(QUESTS[offer].intro) }; }

  // ---- still waiting on their request: a reminder (and what's still missing)
  const mine = Q.stepsFor(npc);
  if (mine.length) {
    const m = mine[0], v = m.quest;
    const miss = short.find((e) => e.id === m.id)?.short;
    const line = miss?.length ? `Still need ${miss.join(' and ')}.` : `${pick(V.wait || ['How\'s it going?'])} <small>(${v.text}${v.max > 1 ? ' ' + countText(v) : ''})</small>`;
    if (say) {
      // (in a cutscene the shop opens once they've said it)
      const p = say(line, { mood: 'thinking' });
      if (opts.shop) { if (cv) Promise.resolve(p).then((r) => { if (!r?.skipped) opts.shop(); }); else opts.shop(); }
      return { handled: true, line: stripTags(line) };
    }
    board({ line, sub: v.title, mood: 'thinking', options: [...shopNote, bye('On it')] });
    return { handled: true, line: stripTags(line) };
  }

  // ---- a story they haven't told you yet
  if (opts.tales !== false && game.lore) {
    const tale = game.lore.tale(npc, V.tales);
    if (tale && (opts.tales === true || !opts.shop)) {
      const isNew = game.lore.add(tale.id, { quiet: true, from: 'tale' });
      game.lore.markRead(tale.id);
      board({
        line: tale.text.split('\n').join('<br>'), sub: `${tale.title}${isNew ? ' · a new tale for your book' : ''}`, mood: 'happy', className: 'qtk-tale',
        options: [...shopNote, bye(pick(['Thanks for the story', 'Fancy that', 'I\'ll remember that']))],
      });
      if (isNew) game.ui.toast(`<small>A tale for your book · Lore</small><br><b>${tale.title}</b>`, { dur: 2600 });
      return { handled: true, line: stripTags(tale.text.split('\n')[0]) };
    }
  }
  return { handled: false };

  // ------------------------------------------------------------ the offer
  function offerBoard(id) {
    const def = QUESTS[id], v = Q.get(id);
    const rw = rewardText(def.reward, { rep: def.kind === 'village' ? def.giver : null, village: def.kind === 'village' });
    const first = v.steps[0]?.text;
    board({
      line: fillNames(def.intro), sub: `${v.title} · ${def.kind === 'lore' ? 'a story to uncover' : 'a request'}`, mood: 'happy', className: 'qtk-offer', reward: rw ? 'Reward: ' + rw : '',
      options: [
        { label: 'I\'ll do it', sub: first ? `First: ${first}` : null, primary: true, onClick: () => accept(id) },
        { label: 'Not right now', sub: 'Ask me again later', onClick: () => { close(); say?.(pick(['Suit yourself.', 'Another time, then.', 'Mind how you go.']), { mood: 'neutral', wait: false, dur: 2.2 }); } },
        ...shopNote,
      ],
    });
  }
  function accept(id) {
    close();
    if (!Q.accept(id, npc)) return;
    game.audio.play('success', { vol: 0.5 });
    say?.(pick(['Wonderful!', 'Oh, thank you!', 'Splendid.', 'Off you go, then!']), { mood: 'happy', wait: false, dur: 2.2 });
    const gives = QUESTS[id].gives;
    if (gives) for (const it of Object.keys(gives)) game.ui.toast(`${name} hands you <b>${ITEMS[it]?.name || it}</b>.`, { dur: 2600 });
  }
}

export { stripTags };

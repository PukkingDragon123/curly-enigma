// (wave 21) Talking to Deep Town's named folk, day to day (game.daily, src/core/daily.js): the first
// chat of the day is their line for where the story's got to (and a bit of friendship); when they're
// fond enough, a heart event (a short cutscene, data/story.js CAST.events); after that, a second
// chat offers to give them something from your bag (src/ui/letters.js openGiftTray). The plaza
// gossips tell the day's rumour. Hearts pop over their head when they go up.
//   lifeTalk(scene, f) → the line said, or null (folk.js chats as before)
import { VILLAGERS } from '../data/villagers.js';
import { CAST } from '../data/story.js';
import { ITEMS } from '../data/items.js';
import { openGiftTray, heartURL } from '../ui/letters.js';
import { iconURL } from '../gfx/PixelArt.js';
import { pick } from '../core/util.js';
import { moodOf } from './moods.js';

const AGAIN = [['Hm?', 'Yes?', 'Back again.'], ['Back again?', 'Hello again.', 'You\'re about early.'], ['There you are.', 'I was hoping you\'d come by.', 'Sit a minute.']];
const MOOD_OF = { love: 'happy', like: 'happy', meh: 'neutral', hate: 'angry', again: 'thinking' };

export function lifeTalk(s, f) {
  const g = s.game, D = g.daily, id = f.npcId, cv = g.convo;
  if (!D || !id || !VILLAGERS[id] || !cv?.speaker(f)) return null;
  const a = f.a;
  const face = () => { if (!f.seated) a.faceToward(s.player.x, s.player.z); f.pause = 4; a.rig.lookAt(s.eyeTarget); f.lookHold = 4; };

  // a heart event they're ready for
  const ev = !f.sleeping && D.heartEvent(id);
  if (ev) {
    face();
    D.seeEvent(ev);
    cv.play({ who: f, name: f.name, lines: ev.lines.map(([text, mood]) => ({ text, mood })) }).then(() => {
      if (ev.gift) for (const [it, n] of Object.entries(ev.gift)) if (ITEMS[it]) g.ui.status?.flyTo?.('pack', iconURL(it), { n });
      hearts(s, f, 0);
    });
    return ev.lines[0][0];
  }

  // the first chat today
  if (!D.chattedToday(id)) {
    const r = D.chat(id);
    const gossip = /gossip/.test(VILLAGERS[id].title || '');
    const line = r?.line || (gossip ? D.rumour() : null);
    if (!line) { if (r?.up) hearts(s, f, r.up); return null; }
    face();
    const mood = f.sleeping ? 'sleepy' : moodOf(line);
    cv.say(f, line, { name: f.name, mood, wait: false, dur: Math.min(6, 2.6 + line.length * 0.045), gesture: f.sleeping || f.seated ? 'none' : undefined });
    if (r.up) s.later(1.2, () => hearts(s, f, r.up));
    return line;
  }

  // again today: a word, and the chance to give them something
  if (f.sleeping) return null;
  face();
  const h = D.hearts(id), line = pick(AGAIN[h >= 5 ? 2 : h >= 2 ? 1 : 0]);
  cv.play({
    who: f, name: f.name, lines: [{ text: line, mood: h >= 2 ? 'happy' : 'neutral' }],
    choices: [
      { label: D.giftedToday(id) ? 'Give something else' : 'Give something', sub: CAST[id] ? 'They have their favourites' : null, primary: true, value: 'gift' },
      { label: pick(['Just saying hello', 'See you', 'Mind how you go']), value: 'bye' },
    ],
  }).then((r) => { if (r.choice === 'gift') giftFlow(s, f); });
  return line;
}

function giftFlow(s, f) {
  const g = s.game, D = g.daily, id = f.npcId;
  const items = D.giftable();
  const tray = openGiftTray(g, id, items, (item) => {
    setTimeout(() => {
      tray.close();
      const r = D.give(id, item);
      if (!r) return;
      g.audio.play(r.kind === 'love' ? 'success' : r.kind === 'hate' ? 'fail' : 'pickup', { vol: 0.5 });
      g.convo.say(f, r.line, { name: f.name, mood: MOOD_OF[r.kind], wait: false, dur: 2.8 });
      if (r.kind === 'love' || r.kind === 'like') f.a.rig.doEmote?.(r.kind === 'love' ? 'hop' : 'nod', 1);
      if (r.up > 0) s.later(1.4, () => hearts(s, f, r.up));
    }, 380);
  });
}

/** Hearts over their head: how fond they are, the new ones beating in. */
function hearts(s, f, up) {
  const n = s.game.daily.hearts(f.npcId);
  if (n <= 0) return;
  const imgs = Array.from({ length: n }, (_, i) => `<img class="pix${i >= n - up ? ' new' : ''}" src="${heartURL(true)}" alt="">`).join('');
  s.say(f.a, `<span class="lt-up">${imgs}</span>`, { emote: true, life: 2.2, babble: false });
  if (up > 0) s.game.audio.play('emote', { kind: 'love' });
}

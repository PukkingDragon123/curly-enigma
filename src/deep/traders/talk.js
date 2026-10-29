// Talking to a burrow keeper over the counter (E on them): a cutscene talk first (src/ui/Convo.js:
// the camera on them, their news or a hello floating by their head), then the counter opens on the
// tab you asked for ("Let's trade", "About that job...") or they wave you off.
//   burrowTalk(traders, b) → true when the talk started (false: open the counter as before)
// The talk emits { type: 'talk', npc } (deliveries, offers); the counter then doesn't again.
import { SHOPS } from '../../data/shops.js';
import { traderData } from './shop.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function burrowTalk(T, b) {
  const game = T.owner?.game || globalThis.__game;
  const cv = game?.convo;
  if (!cv || (T.panel && !T.panel.closed)) return false;
  const B = T.ensureBuilt(b, true);
  const folk = B?.folk;
  if (!folk || folk.disposed) return false;
  const shop = SHOPS[b.shopId], npc = shop.npc, st = game.state, rocco = b.shopId === 'rocco';
  const td = traderData(st);
  const first = !td.met[npc];
  td.met[npc] = (st.data.day ?? 0) + 1;
  if (folk.dozing) { folk.dozing = false; folk.rig.setExpression?.('surprised', { hold: 1 }); folk.rig.setMood?.('stern'); }
  st.emit('act', { type: 'talk', npc });
  const news = game.quests?.forNpc?.(npc) || { lines: [] };
  const mood = npc === 'herbalist' ? 'stern' : rocco ? 'smug' : npc === 'outpost' ? 'stern' : 'happy';
  const lines = news.lines?.length
    ? news.lines.slice(0, 2).map((t) => ({ text: t, mood: 'happy' }))
    : [{ text: first ? shop.greet[0] : pick(shop.greet.slice(1).length ? shop.greet.slice(1) : shop.greet), mood }];
  const work = (game.quests?.active?.() || []).some((v) => v.def?.from === npc || v.step?.deliver?.to === npc) || news.lines?.length;
  cv.play({
    who: folk, name: shop.keeper.name, lines,
    choices: [
      { label: rocco ? 'Show me the goods' : npc === 'herbalist' ? 'What have you got?' : 'Let\'s trade', sub: rocco ? 'Blades bought, deals, oddities' : 'Buy and sell', primary: true, value: 'shop' },
      { label: work ? 'About that job...' : 'Any work for me?', sub: 'Their requests', value: 'jobs' },
      { label: pick(['Just passing through', 'Another time', 'Mind how you go']), value: 'bye' },
    ],
  }).then((r) => {
    if (r.choice === 'shop' || r.choice === 'jobs') T.openShop(b, r.choice === 'jobs' ? 'jobs' : undefined, { talked: true });
    else if (!folk.disposed) folk.react('bye', pick(shop.bye || ['Bye then.']));
  });
  return true;
}

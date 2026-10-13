// Shop panels for every store in Deep Town, including the assay office (selling)
// and the Surface Express ticket booth.
import { el, formatGoldFull, pick, makeRng } from '../core/util.js';
import { iconURL, weaponIconURL } from '../gfx/PixelArt.js';
import { ITEMS, sellPrice, CAT_LABEL } from '../data/items.js';
import { SHOPS } from '../data/shops.js';
import { FURNITURE, FLOORS, WALLS } from '../data/furniture.js';
import { WEAPON_TYPES, METALS, GRADES, gradeFor } from '../data/weapons.js';
import { renderPortrait } from '../gfx/characters.js';
import { COIN, qColor } from './UI.js';
import { GOAL_GOLD } from '../core/State.js';

const portraitCache = new Map();
function portrait(game, shopId) {
  if (portraitCache.has(shopId)) return portraitCache.get(shopId);
  const k = SHOPS[shopId].keeper;
  let c;
  try {
    c = renderPortrait(game.engine.renderer, { seed: 9, eyes: 'bead', dirt: 0.2, blush: true, ...k, hat: k.hat || 'none', glasses: k.glasses || false }, 72);
  } catch (e) {
    c = document.createElement('canvas');
  }
  portraitCache.set(shopId, c);
  return c;
}
function portraitImg(game, shopId) {
  const c = portrait(game, shopId);
  const img = el('img', { class: 'pix', alt: SHOPS[shopId].keeper.name });
  try { img.src = c.toDataURL(); } catch (e) { /* noop */ }
  return img;
}

const price = (n) => el('span', { class: 'price' }, [el('img', { class: 'pix', src: COIN(), alt: '' }), formatGoldFull(n)]);

/** Today's commission at the assay office. */
export function todaysCommission(state) {
  const d = state.data;
  if (d.commission && d.commission.day === d.day) return d.commission;
  const rng = makeRng(d.day * 7919 + 13);
  const types = Object.keys(WEAPON_TYPES).filter((t) => d.owned['bp_' + t]);
  const metalsByZone = [['copper', 'bronze'], ['copper', 'bronze', 'iron'], ['iron', 'steel', 'silver'], ['steel', 'silver', 'gold'], ['gold', 'mithril', 'moonsilver'], ['mithril', 'moonsilver', 'adamant', 'starmetal'], ['adamant', 'starmetal']];
  const metals = metalsByZone[Math.min(6, d.zoneMax)] || ['copper'];
  const type = types.length ? rng.pick(types) : 'dagger';
  const metal = rng.pick(metals);
  const minGrade = rng.pick(['D', 'C', 'C', 'B', 'B', 'A']);
  const bonus = { D: 1.4, C: 1.6, B: 1.9, A: 2.4 }[minGrade];
  d.commission = { day: d.day, type, metal, minGrade, bonus, done: false };
  return d.commission;
}

function gradeOk(g, min) {
  const order = GRADES.map((x) => x.g); // S A B C D F
  return order.indexOf(g) <= order.indexOf(min);
}

export function openShop(game, shopId) {
  const shop = SHOPS[shopId];
  if (!shop) return null;
  const st = game.state;
  const ui = game.ui;
  game.audio.play('babble', { pitch: shop.keeper.voice, n: 6 });

  const say = el('div', { class: 'say' }, [el('b', {}, shop.keeper.name), el('span', {}, pick(shop.lines))]);
  const header = el('div', { class: 'keeper' }, [portraitImg(game, shopId), say]);
  const tabsEl = el('div', { class: 'tabs' });
  const list = el('div', { class: 'list' });
  const scroll = el('div', { class: 'scroll', style: { maxHeight: 'min(calc(100vh - 260px), calc(var(--px) * 120))' } }, [list]);
  const foot = el('div', { class: 'row', style: { marginTop: 'calc(var(--px) * 3)' } });
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', minHeight: 0, width: 'min(calc(100vw - 80px), calc(var(--px) * 230))' } }, [header, tabsEl, scroll, foot]);

  const speak = (text) => { say.lastChild.textContent = text; game.audio.play('babble', { pitch: shop.keeper.voice, n: Math.min(8, Math.ceil(text.length / 8)) }); };

  let tab = shop.stock === 'sell' ? 'sell' : shop.stock === 'furniture' ? 'furniture' : 'buy';
  const tabs = shop.stock === 'sell' ? [['sell', 'Sell'], ['commission', 'Commission']] : shop.stock === 'furniture' ? [['furniture', 'Furniture'], ['floor', 'Floors'], ['wall', 'Walls']] : [['buy', 'Buy']];

  const render = () => {
    tabsEl.innerHTML = '';
    if (tabs.length > 1) for (const [k, label] of tabs) tabsEl.append(el('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; render(); } }, label));
    list.innerHTML = '';
    foot.innerHTML = '';
    if (shopId === 'ticket') return renderTicket();
    if (tab === 'sell') return renderSell();
    if (tab === 'commission') return renderCommission();
    let ids;
    if (tab === 'furniture') ids = Object.keys(FURNITURE).filter((id) => FURNITURE[id].price > 0);
    else if (tab === 'floor') ids = Object.keys(FLOORS).filter((id) => FLOORS[id].price > 0);
    else if (tab === 'wall') ids = Object.keys(WALLS).filter((id) => WALLS[id].price > 0);
    else ids = shop.stock.filter((s) => !s.minZone || s.minZone <= st.data.zoneMax + 0).map((s) => s.id);
    for (const id of ids) list.append(buyRow(id));
    const hidden = Array.isArray(shop.stock) ? shop.stock.filter((s) => s.minZone && s.minZone > st.data.zoneMax).length : 0;
    if (hidden) foot.append(el('span', { class: 'muted', style: { fontSize: '.8em' } }, `${hidden} more item${hidden > 1 ? 's' : ''} in the back. Come back once you've dug deeper.`));
  };

  const buyRow = (id) => {
    const it = ITEMS[id];
    const p = it.price ?? 0;
    const unique = ['tool', 'equip', 'blueprint', 'floor', 'wallpaper', 'key'].includes(it.cat);
    const owned = unique && st.owns(id);
    const stack = !unique;
    const needs = it.needs ? Object.entries(it.needs).map(([nid, n]) => `${n}× ${ITEMS[nid].name} (have ${st.count(nid)})`).join(', ') : '';
    const right = el('div', { class: 'row', style: { justifyContent: 'flex-end', gap: 'calc(var(--px) * 2)' } });
    if (owned) {
      if (it.slot && st.data.equip[it.slot] !== id) right.append(el('button', { class: 'btn alt', onclick: () => { st.equip(id); game.audio.play('ui_click'); render(); } }, 'Equip'));
      else right.append(el('span', { class: 'muted' }, it.slot ? 'Equipped' : 'Owned'));
    } else {
      right.append(price(p));
      const doBuy = (qty) => {
        const r = st.buy(id, p, qty);
        if (r.ok) {
          game.audio.play('ui_buy');
          game.audio.play('coins', { n: 3 });
          speak(pick(['Pleasure doing business!', 'Good choice.', 'Use it well!', 'Thank you kindly!', 'Come again!']));
          if (it.cat === 'furniture') ui.toast(`${it.name} is waiting at home. Place it in build mode.`, { icon: iconURL(id) });
          if (it.cat === 'blueprint' && it.kind === 'weapon') ui.toast(`New forge plans: ${it.name}`, { icon: iconURL(id), kind: 'good' });
          if (it.cat === 'blueprint' && it.kind === 'room') ui.toast('Your burrow is bigger now!', { kind: 'good' });
        } else {
          game.audio.play('ui_error');
          speak(r.reason === 'Not enough gold' ? pick(['Bit short, are we?', 'Come back with more gold, dear.', 'No credit, sorry!']) : r.reason);
        }
        render();
      };
      const can = st.canAfford(p) && (!it.needs || Object.entries(it.needs).every(([nid, n]) => st.count(nid) >= n));
      right.append(el('button', { class: 'btn', disabled: !can, onclick: () => doBuy(1) }, 'Buy'));
      if (stack && p > 0 && p * 5 <= 5000) right.append(el('button', { class: 'btn alt', disabled: !st.canAfford(p * 5), onclick: () => doBuy(5) }, '×5'));
    }
    const have = !unique && st.count(id) ? ` <span class="muted">(have ${st.count(id)})</span>` : '';
    return el('div', { class: 'li' + (owned ? ' locked' : '') }, [
      el('img', { class: 'pix', src: iconURL(id), alt: '' }),
      el('div', { style: { minWidth: 0 } }, [el('div', { class: 'name', html: it.name + have }), el('div', { class: 'desc' }, it.desc || ''), needs ? el('div', { class: 'desc', style: { color: '#8a3a2a' } }, 'Needs ' + needs) : null]),
      right,
    ]);
  };

  // ---------------- assay: selling
  const renderSell = () => {
    const groups = st.inventory((it) => it && it.value > 0 && !['tool', 'equip', 'blueprint', 'key', 'furniture', 'floor', 'wallpaper', 'consumable'].includes(it.cat));
    groups.sort((a, b) => (ITEMS[b.id].value || 0) - (ITEMS[a.id].value || 0));
    let total = 0;
    for (const w of st.data.weapons) {
      total += w.value;
      list.append(el('div', { class: 'li' }, [
        el('img', { class: 'pix', src: weaponIconURL(w.type, w.metal, w.infusion), alt: '' }),
        el('div', { style: { minWidth: 0 } }, [el('div', { class: 'name' }, w.name), el('div', { class: 'desc', html: `Grade <b style="color:${gradeFor(w.score).color};text-shadow:0 1px 0 #000">${w.grade}</b> · metal ${w.matQ}%` })]),
        el('div', { class: 'row' }, [price(w.value), el('button', { class: 'btn', onclick: () => { const g = st.sellWeapon(w.uid); afterSell(g); } }, 'Sell')]),
      ]));
    }
    for (const g of groups) {
      const it = ITEMS[g.id];
      const each = g.lots ? g.lots.reduce((s, l) => s + sellPrice(l.id, l.q, l.p), 0) : sellPrice(g.id) * g.n;
      total += each;
      const qline = g.lots ? `${g.n} pcs · avg quality <b style="color:${qColor(g.avgQ)}">${g.avgQ}%</b>${g.lots.some((l) => l.p) ? ` · ${g.lots.filter((l) => l.p).length} pristine` : ''}` : `${g.n} pcs · ${CAT_LABEL[it.cat] || ''}`;
      list.append(el('div', { class: 'li' }, [
        el('img', { class: 'pix', src: iconURL(g.id), alt: '' }),
        el('div', { style: { minWidth: 0 } }, [el('div', { class: 'name' }, it.name), el('div', { class: 'desc', html: qline })]),
        el('div', { class: 'row' }, [
          price(each),
          el('button', { class: 'btn alt', onclick: () => { const gg = g.lots ? st.sellLot(g.lots.sort((a, b) => sellPrice(b.id, b.q, b.p) - sellPrice(a.id, a.q, a.p))[0].uid) : st.sellStack(g.id, 1); afterSell(gg); } }, '1'),
          el('button', { class: 'btn', onclick: () => { let gg = 0; if (g.lots) for (const l of [...g.lots]) gg += st.sellLot(l.uid); else gg = st.sellStack(g.id, g.n); afterSell(gg); } }, 'All'),
        ]),
      ]));
    }
    if (!list.children.length) list.append(el('p', { class: 'muted' }, 'Nothing to sell. Old Vex buys ore, gems, ingots, plants, critters and weapons.'));
    const minerals = groups.filter((g) => g.lots);
    foot.append(el('span', { class: 'muted' }, 'Everything is worth about'), price(total), el('span', { class: 'spacer' }));
    if (minerals.length) foot.append(el('button', { class: 'btn', onclick: () => { let gg = 0; for (const g of minerals) for (const l of [...g.lots]) gg += st.sellLot(l.uid); afterSell(gg); } }, 'Sell all ore & gems'));
  };
  const afterSell = (g) => {
    if (g > 0) {
      game.audio.play('coins', { n: Math.min(8, 2 + Math.floor(Math.log10(g + 1) * 1.5)) });
      ui.toast(`Sold for <b>${formatGoldFull(g)}</b> gold`, { icon: COIN(), kind: 'good' });
      st.learn('assay');
      if (g > 5000) speak(pick(['Now THAT is quality.', 'Oh my. Oh my my.', 'You\'re going to make me retire early.']));
      else speak(pick(['Fair price, fair price.', 'Mm. Decent.', 'I\'ll take it.', 'Pristine pieces pay more, remember.']));
    }
    render();
  };

  // ---------------- assay: commission
  const renderCommission = () => {
    const c = todaysCommission(st);
    st.learn('commissions');
    const metal = METALS[c.metal].name, type = WEAPON_TYPES[c.type].name;
    list.append(el('div', { class: 'li' }, [
      el('img', { class: 'pix', src: weaponIconURL(c.type, c.metal), alt: '' }),
      el('div', {}, [el('div', { class: 'name' }, c.done ? 'Commission filled. Thank you!' : `Wanted: ${metal} ${type}`), el('div', { class: 'desc' }, c.done ? 'A new request goes up tomorrow.' : `Grade ${c.minGrade} or better. Pays ${c.bonus}× its value. A new request goes up every day.`)]),
      el('span'),
    ]));
    if (!c.done) {
      const matches = st.data.weapons.filter((w) => w.type === c.type && w.metal === c.metal && gradeOk(w.grade, c.minGrade));
      if (!matches.length) list.append(el('p', { class: 'muted' }, st.owns('bp_' + c.type) ? 'You don\'t have a matching weapon yet.' : `You'll need the ${type} plans from Inkwell Plans.`));
      for (const w of matches) {
        list.append(el('div', { class: 'li' }, [
          el('img', { class: 'pix', src: weaponIconURL(w.type, w.metal, w.infusion), alt: '' }),
          el('div', {}, [el('div', { class: 'name' }, w.name), el('div', { class: 'desc' }, `Grade ${w.grade}`)]),
          el('div', { class: 'row' }, [price(Math.round(w.value * c.bonus)), el('button', { class: 'btn', onclick: () => { const g = st.sellWeapon(w.uid, c.bonus); c.done = true; afterSell(g); speak('Splendid! Exactly what my client wanted.'); } }, 'Deliver')]),
        ]));
      }
    }
  };

  // ---------------- ticket booth
  const renderTicket = () => {
    const have = st.owns('exit_ticket');
    const g = st.gold;
    const pct = Math.min(100, (g / GOAL_GOLD) * 100);
    list.append(el('div', { class: 'li' }, [
      el('img', { class: 'pix', src: iconURL('exit_ticket'), alt: '' }),
      el('div', {}, [el('div', { class: 'name' }, 'Surface Ticket · One Way'), el('div', { class: 'desc' }, ITEMS.exit_ticket.desc)]),
      price(GOAL_GOLD),
    ]));
    list.append(el('div', { class: 'detail' }, [
      el('div', { html: `Your savings: <b class="gold-txt">${formatGoldFull(g)}</b> of ${formatGoldFull(GOAL_GOLD)} gold (${pct.toFixed(1)}%)` }),
      el('div', { class: 'goal-bar', style: { width: '100%', marginTop: 'calc(var(--px)*2)', height: 'calc(var(--px)*5)' } }, [el('i', { style: { width: pct + '%' } })]),
    ]));
    const buyBtn = el('button', { class: 'btn big', disabled: g < GOAL_GOLD && !have, onclick: async () => {
      if (!have) {
        const ok = await ui.confirm('Spend <b>1,000,000 gold</b> on a one-way ticket to the surface? There\'s no coming back down.', 'Buy the ticket', 'Not yet');
        if (!ok) return;
        if (!st.spend(GOAL_GOLD, 'ticket')) return;
        st.addItem('exit_ticket');
        st.flag('ticketBought', true);
        game.audio.play('fanfare');
        st.save();
      }
      ui.closeAllPanels();
      game.goto('ending', {}, { transition: 'fade', dur: 1.2, color: 0xffffff });
    } }, have ? 'Board the Surface Express' : g >= GOAL_GOLD ? 'Buy ticket & board' : 'Not enough gold yet');
    foot.append(buyBtn);
    if (g < GOAL_GOLD) speak(pick(shop.lines));
    else speak('A millionaire mole! Right this way, the lift is warmed up and waiting.');
  };

  render();
  return ui.openPanel({ title: shop.name, body });
}

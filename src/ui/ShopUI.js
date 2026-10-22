// Shops of Deep Town as places, not lists: a hanging sign, the keeper in a wooden frame, goods
// standing on shelves with paper price tags, and a counter where you pay. The assay office is a
// ledger and a brass balance; the Surface Express is a brass ticket window with the golden ticket.
import { el, formatGoldFull, pick, makeRng } from '../core/util.js';
import { iconURL, weaponIconURL } from '../gfx/PixelArt.js';
import { ITEMS, sellPrice, CAT_LABEL } from '../data/items.js';
import { SHOPS } from '../data/shops.js';
import { FURNITURE, FLOORS, WALLS } from '../data/furniture.js';
import { WEAPON_TYPES, METALS, GRADES, gradeFor } from '../data/weapons.js';
import { renderPortrait } from '../gfx/characters.js';
import { COIN } from './UI.js';
import { qColor, pips } from './common.js';
import { SPR } from './uiSprites.js';
import { GOAL_GOLD } from '../core/State.js';

const portraitCache = new Map();
function portrait(game, shopId) {
  if (portraitCache.has(shopId)) return portraitCache.get(shopId);
  const k = SHOPS[shopId].keeper;
  let url = '';
  try {
    const c = renderPortrait(game.engine.renderer, { seed: 9, eyes: 'bead', dirt: 0.2, blush: true, ...k, hat: k.hat || 'none', glasses: k.glasses || false }, 72, { expression: 'happy' });
    url = c.toDataURL();
  } catch (e) { /* noop */ }
  portraitCache.set(shopId, url);
  return url;
}

const price = (n, cls = '') => el('span', { class: 'price ' + cls }, [el('img', { class: 'pix', src: cls.includes('big') ? SPR.coin() : SPR.coinMini(), alt: '' }), formatGoldFull(n)]);

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

  // ---------------- the room
  const sayText = el('span', {}, pick(shop.lines));
  const say = el('div', { class: 'sh-say' }, [el('b', {}, shop.keeper.name), sayText]);
  const face = el('div', { class: 'sh-portrait' }, [el('img', { class: 'pix', src: portrait(game, shopId), alt: shop.keeper.name })]);
  const keeper = el('div', { class: 'sh-keeper' }, [face, say]);
  const tabsEl = el('div', { class: 'sh-tabs' });
  const stock = el('div', { class: 'sh-stock' });
  const scroll = el('div', { class: 'sh-scroll' }, [stock]);
  const counter = el('div', { class: 'sh-counter' });
  const foot = el('div', { class: 'sh-foot' });
  const scaleImg = el('img', { class: 'pix sh-scale', src: SPR.scale(0), alt: '' });
  const backNote = el('div', { class: 'sh-back', hidden: true });
  const wall = el('div', { class: 'sh-wall' }, [tabsEl, scroll, backNote]);
  const room = el('div', { class: 'sh-room' }, [keeper, counter, foot, wall]);
  const sign = el('div', { class: 'sh-sign' }, [el('i', { class: 'sh-chain l' }), el('i', { class: 'sh-chain r' }), el('h2', {}, shop.name)]);
  const root = el('div', { class: `sh shop-${shopId}` }, [sign, room]);
  if (shopId === 'assay') keeper.append(scaleImg);

  const speak = (text) => {
    sayText.textContent = text;
    say.classList.remove('talk');
    void say.offsetWidth;
    say.classList.add('talk');
    game.audio.play('babble', { pitch: shop.keeper.voice, n: Math.min(8, Math.ceil(text.length / 8)) });
  };

  let tab = shop.stock === 'sell' ? 'sell' : shop.stock === 'furniture' ? 'furniture' : 'buy';
  const tabs = shop.stock === 'sell' ? [['sell', 'Sell'], ['commission', 'Commission']] : shop.stock === 'furniture' ? [['furniture', 'Furniture'], ['floor', 'Floors'], ['wall', 'Walls']] : [['buy', 'Buy']];
  let picked = null; // item id on the counter

  const render = () => {
    tabsEl.innerHTML = '';
    if (tabs.length > 1) for (const [k, label] of tabs) tabsEl.append(el('button', { class: 'sh-tab' + (tab === k ? ' on' : ''), onclick: () => { if (tab === k) return; tab = k; picked = null; game.audio.play('ui_click'); render(); scroll.scrollTop = 0; } }, label));
    tabsEl.hidden = tabs.length < 2;
    stock.innerHTML = '';
    foot.innerHTML = '';
    counter.innerHTML = '';
    backNote.hidden = true;
    root.dataset.mode = shopId === 'ticket' ? 'ticket' : tab;
    if (shopId === 'ticket') return renderTicket();
    if (tab === 'sell') return renderSell();
    if (tab === 'commission') return renderCommission();
    let ids;
    if (tab === 'furniture') ids = Object.keys(FURNITURE).filter((id) => FURNITURE[id].price > 0);
    else if (tab === 'floor') ids = Object.keys(FLOORS).filter((id) => FLOORS[id].price > 0);
    else if (tab === 'wall') ids = Object.keys(WALLS).filter((id) => WALLS[id].price > 0);
    else ids = shop.stock.filter((s) => !s.minZone || s.minZone <= st.data.zoneMax + 0).map((s) => s.id);
    if (!picked || !ids.includes(picked)) picked = ids[0] || null;
    const goods = ids.map((id) => good(id));
    stock.append(...goods);
    goods.forEach((g, i) => g.style.setProperty('--d', Math.min(400, i * 22) + 'ms'));
    renderCounter();
    const hidden = Array.isArray(shop.stock) ? shop.stock.filter((s) => s.minZone && s.minZone > st.data.zoneMax).length : 0;
    backNote.hidden = !hidden;
    if (hidden) backNote.textContent = `${hidden} more in the back. Dig deeper and come back!`;
  };

  const isUnique = (it) => ['tool', 'equip', 'blueprint', 'floor', 'wallpaper', 'key'].includes(it.cat);

  // a good standing on the shelf, price tag dangling from the lip
  const good = (id) => {
    const it = ITEMS[id];
    const p = it.price ?? 0, pay = st.buyPrice ? st.buyPrice(p) : p; // st.buy applies the haggle discount itself
    const owned = isUnique(it) && st.owns(id);
    const can = st.canAfford(pay) && (!it.needs || Object.entries(it.needs).every(([nid, n]) => st.count(nid) >= n));
    const tagTxt = owned ? (it.slot && st.data.equip[it.slot] === id ? 'In use' : 'Owned') : formatGoldFull(pay);
    const b = el('button', {
      class: 'sh-good' + (picked === id ? ' on' : '') + (owned ? ' owned' : '') + (!owned && !can ? ' dear' : ''), title: it.name, 'aria-label': `${it.name}, ${tagTxt}`,
      onclick: () => { picked = id; game.audio.play('ui_click'); for (const n of stock.children) n.classList.toggle('on', n === b); renderCounter(true); },
    }, [
      el('span', { class: 'sh-item' }, [el('img', { class: 'pix', src: iconURL(id), alt: '' })]),
      el('span', { class: 'sh-tag' }, [owned ? null : el('img', { class: 'pix', src: SPR.coinMini(), alt: '' }), tagTxt]),
    ]);
    return b;
  };

  // the counter: the picked good, its notes, and the paying stamp
  const renderCounter = (pop) => {
    counter.innerHTML = '';
    if (!picked) { counter.append(el('p', { class: 'sh-note' }, 'The shelves are bare today.')); return; }
    const id = picked;
    const it = ITEMS[id];
    const p = it.price ?? 0;
    const unique = isUnique(it);
    const owned = unique && st.owns(id);
    const stack = !unique;
    const needs = it.needs ? Object.entries(it.needs).map(([nid, n]) => `${n}× ${ITEMS[nid].name} (have ${st.count(nid)})`).join(', ') : '';
    const actions = el('div', { class: 'sh-pay' });
    if (owned) {
      if (it.slot && st.data.equip[it.slot] !== id) actions.append(el('button', { class: 'btn alt', onclick: () => { st.equip(id); game.audio.play('ui_click'); render(); } }, 'Equip'));
      else actions.append(el('span', { class: 'sh-owned' }, it.slot ? 'Equipped' : 'Owned'));
    } else {
      actions.append(price(st.buyPrice ? st.buyPrice(p) : p, 'big'));
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
        const top = scroll.scrollTop;
        render();
        scroll.scrollTop = top;
        const card = counter.querySelector('.sh-card');
        if (r.ok) { card?.classList.add('paid'); coinDrop(card?.querySelector('.sh-pay') || card); }
        else counter.querySelector('.sh-buy')?.classList.add('nope');
      };
      const can = st.canAfford(p) && (!it.needs || Object.entries(it.needs).every(([nid, n]) => st.count(nid) >= n));
      const buy = el('button', { class: 'btn big sh-buy', disabled: !can, onclick: () => doBuy(1) }, 'Buy');
      actions.append(buy);
      if (stack && p > 0 && p * 5 <= 5000) actions.append(el('button', { class: 'btn alt', disabled: !st.canAfford(p * 5), onclick: () => doBuy(5) }, '×5'));
    }
    const have = !unique && st.count(id) ? `You have ${st.count(id)}` : '';
    const card = el('div', { class: 'sh-card' + (pop ? ' pop' : '') }, [
      el('div', { class: 'sh-card-icon' }, [el('img', { class: 'pix', src: iconURL(id), alt: '' })]),
      el('div', { class: 'sh-card-txt' }, [
        el('div', { class: 'sh-card-name' }, [el('b', {}, it.name), el('small', {}, CAT_LABEL[it.cat] || '')]),
        el('p', {}, it.desc || ''),
        needs ? el('p', { class: 'sh-needs' }, 'Needs ' + needs) : null,
        have ? el('p', { class: 'sh-have' }, have) : null,
      ]),
      actions,
    ]);
    counter.append(card);
  };

  // coins hop from the pouch onto the counter
  const coinDrop = (btn) => {
    const host = counter.getBoundingClientRect();
    const r = btn ? btn.getBoundingClientRect() : host;
    for (let i = 0; i < 5; i++) {
      const c = el('i', { class: 'sh-coin' });
      c.style.left = (r.left - host.left + r.width / 2 + (Math.random() * 40 - 20)) + 'px';
      c.style.top = (r.top - host.top - 10) + 'px';
      c.style.animationDelay = `${i * 60}ms, ${i * 60}ms`;
      counter.append(c);
      setTimeout(() => c.remove(), 900 + i * 60);
    }
  };

  // ---------------- assay: selling
  const tilt = () => {
    scaleImg.src = SPR.scale(1);
    setTimeout(() => { scaleImg.src = SPR.scale(-1); }, 260);
    setTimeout(() => { scaleImg.src = SPR.scale(0); }, 560);
  };
  const renderSell = () => {
    const groups = st.inventory((it) => it && it.value > 0 && !['tool', 'equip', 'blueprint', 'key', 'furniture', 'floor', 'wallpaper', 'consumable'].includes(it.cat));
    groups.sort((a, b) => (ITEMS[b.id].value || 0) - (ITEMS[a.id].value || 0));
    let total = 0;
    const ledger = el('div', { class: 'sh-ledger' });
    for (const w of st.data.weapons) {
      total += w.value;
      ledger.append(el('div', { class: 'sh-line' }, [
        el('img', { class: 'pix', src: weaponIconURL(w.type, w.metal, w.infusion), alt: '' }),
        el('div', { class: 'sh-line-txt' }, [el('b', {}, w.name), el('span', { html: `Grade <b style="color:${gradeFor(w.score).color}" class="sh-grade">${w.grade}</b> · metal ${w.matQ}%` })]),
        price(w.value),
        el('div', { class: 'sh-line-btns' }, [el('button', { class: 'btn', onclick: () => { const g = st.sellWeapon(w.uid); afterSell(g); } }, 'Sell')]),
      ]));
    }
    for (const g of groups) {
      const it = ITEMS[g.id];
      const each = g.lots ? g.lots.reduce((s, l) => s + sellPrice(l.id, l.q, l.p), 0) : sellPrice(g.id) * g.n;
      total += each;
      const meta = g.lots
        ? [pips(g.avgQ, g.lots.some((l) => l.p)), el('span', { html: `${g.n} pcs · <b style="color:${qColor(g.avgQ)}">${g.avgQ}%</b>${g.lots.some((l) => l.p) ? ` · ${g.lots.filter((l) => l.p).length} pristine` : ''}` })]
        : [el('span', {}, `${g.n} pcs · ${CAT_LABEL[it.cat] || ''}`)];
      ledger.append(el('div', { class: 'sh-line' }, [
        el('img', { class: 'pix', src: iconURL(g.id), alt: '' }),
        el('div', { class: 'sh-line-txt' }, [el('b', {}, it.name), el('span', { class: 'sh-meta' }, meta)]),
        price(each),
        el('div', { class: 'sh-line-btns' }, [
          el('button', { class: 'btn alt', title: 'Sell one', onclick: () => { const gg = g.lots ? st.sellLot(g.lots.sort((a, b) => sellPrice(b.id, b.q, b.p) - sellPrice(a.id, a.q, a.p))[0].uid) : st.sellStack(g.id, 1); afterSell(gg); } }, '1'),
          el('button', { class: 'btn', onclick: () => { let gg = 0; if (g.lots) for (const l of [...g.lots]) gg += st.sellLot(l.uid); else gg = st.sellStack(g.id, g.n); afterSell(gg); } }, 'All'),
        ]),
      ]));
    }
    if (!ledger.children.length) ledger.append(el('p', { class: 'sh-note sh-empty' }, 'Nothing to sell. Old Vex buys ore, gems, ingots, plants, critters and weapons.'));
    stock.append(ledger);
    const minerals = groups.filter((g) => g.lots);
    foot.append(el('span', { class: 'sh-note' }, 'Everything is worth about'), price(total, 'big'), el('span', { class: 'spacer' }));
    if (minerals.length) foot.append(el('button', { class: 'btn', onclick: () => { let gg = 0; for (const g of minerals) for (const l of [...g.lots]) gg += st.sellLot(l.uid); afterSell(gg); } }, 'Sell all ore & gems'));
  };
  const afterSell = (g) => {
    if (g > 0) {
      game.audio.play('coins', { n: Math.min(8, 2 + Math.floor(Math.log10(g + 1) * 1.5)) });
      ui.toast(`Sold for <b>${formatGoldFull(g)}</b> gold`, { icon: COIN(), kind: 'good' });
      st.learn('assay');
      tilt();
      if (g > 5000) speak(pick(['Now THAT is quality.', 'Oh my. Oh my my.', 'You\'re going to make me retire early.']));
      else speak(pick(['Fair price, fair price.', 'Mm. Decent.', 'I\'ll take it.', 'Pristine pieces pay more, remember.']));
    }
    const top = scroll.scrollTop;
    render();
    scroll.scrollTop = top;
  };

  // ---------------- assay: commission (a wanted poster)
  const renderCommission = () => {
    const c = todaysCommission(st);
    st.learn('commissions');
    const metal = METALS[c.metal].name, type = WEAPON_TYPES[c.type].name;
    const poster = el('div', { class: 'sh-poster' + (c.done ? ' done' : '') }, [
      el('small', {}, c.done ? 'Filled' : 'Wanted'),
      el('div', { class: 'sh-poster-icon' }, [el('img', { class: 'pix', src: weaponIconURL(c.type, c.metal), alt: '' })]),
      el('b', {}, c.done ? 'Commission filled. Thank you!' : `${metal} ${type}`),
      el('p', {}, c.done ? 'A new request goes up tomorrow.' : `Grade ${c.minGrade} or better. Pays ${c.bonus}× its value. A new request goes up every day.`),
    ]);
    stock.append(poster);
    if (!c.done) {
      const matches = st.data.weapons.filter((w) => w.type === c.type && w.metal === c.metal && gradeOk(w.grade, c.minGrade));
      const ledger = el('div', { class: 'sh-ledger' });
      if (!matches.length) ledger.append(el('p', { class: 'sh-note sh-empty' }, st.owns('bp_' + c.type) ? 'You don\'t have a matching weapon yet.' : `You'll need the ${type} plans from Inkwell Plans.`));
      for (const w of matches) {
        ledger.append(el('div', { class: 'sh-line' }, [
          el('img', { class: 'pix', src: weaponIconURL(w.type, w.metal, w.infusion), alt: '' }),
          el('div', { class: 'sh-line-txt' }, [el('b', {}, w.name), el('span', {}, `Grade ${w.grade}`)]),
          price(Math.round(w.value * c.bonus)),
          el('div', { class: 'sh-line-btns' }, [el('button', { class: 'btn', onclick: () => { const g = st.sellWeapon(w.uid, c.bonus); c.done = true; afterSell(g); speak('Splendid! Exactly what my client wanted.'); } }, 'Deliver')]),
        ]));
      }
      stock.append(ledger);
    }
  };

  // ---------------- ticket booth: a brass window and the golden ticket
  const renderTicket = () => {
    const have = st.owns('exit_ticket');
    const g = st.gold;
    const pct = Math.min(100, (g / GOAL_GOLD) * 100);
    const ticket = el('div', { class: 'sh-gticket' + (have ? ' have' : '') }, [
      el('div', { class: 'sh-gticket-in' }, [
        el('small', {}, 'Surface Express · One Way'),
        el('b', {}, 'Deep Town → The Surface'),
        el('span', {}, ITEMS.exit_ticket.desc.split('·').pop().trim()),
        el('div', { class: 'sh-gticket-price' }, [price(GOAL_GOLD, 'big')]),
      ]),
      el('img', { class: 'pix sh-gticket-icon', src: iconURL('exit_ticket'), alt: '' }),
    ]);
    const gauge = el('div', { class: 'sh-savings' }, [
      el('div', { class: 'sh-savings-row' }, [el('img', { class: 'pix', src: SPR.jar(g / GOAL_GOLD), alt: '' }), el('div', {}, [
        el('small', {}, 'Your savings'),
        el('b', {}, formatGoldFull(g)), el('span', {}, ` of ${formatGoldFull(GOAL_GOLD)} (${pct.toFixed(1)}%)`),
      ])]),
      el('div', { class: 'sh-gauge' }, [el('i', { style: { width: pct + '%' } })]),
    ]);
    const buyBtn = el('button', { class: 'btn big sh-board', disabled: g < GOAL_GOLD && !have, onclick: async () => {
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
    stock.append(el('div', { class: 'sh-window' }, [ticket, gauge, buyBtn]));
    if (g < GOAL_GOLD) speak(pick(shop.lines));
    else speak('A millionaire mole! Right this way, the lift is warmed up and waiting.');
  };

  render();
  const fit = () => root.classList.toggle('narrow', window.innerWidth < 700 || window.innerHeight < 470);
  fit();
  window.addEventListener('resize', fit);
  ui.status.pin(true);
  const h = ui.openPanel({ body: root, className: 'sh-panel', onClose: () => { window.removeEventListener('resize', fit); ui.status.pin(false); } });
  return h;
}

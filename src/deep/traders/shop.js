// The burrow folk's counter: the same room as the Deep Town shops (a hanging sign, the keeper's
// portrait and speech, shelves with price tags, a counter card, a ledger for selling; the sh-*
// styles in ui/shop.css) with the tabs the burrows need:
//   Buy · Sell (what this keeper buys, with today's wanted item) · Jobs (their requests, via
//   game.quests) and, for Rocco: Weapons (offers on your forged blades, a haggling mini-game),
//   Deal (today's shady deal) and Oddities (today's rare things).
// openBurrowShop(game, shopId, { folk, ctx, tab }) → panel handle. ui.openShop(id) routes here for
// shops with panel: 'burrow' (one line in ui/ShopUI.js). Every trade emits an `act` event:
// { type: 'buy', id, gold, from } · { type: 'sell', id, gold, to } (weapons add `weapon`) and
// { type: 'talk', npc } when the counter opens.
import * as THREE from 'three';
import './shop.css';
import { el, formatGoldFull, pick, makeRng, hashStr } from '../../core/util.js';
import { iconURL, weaponIconURL } from '../../gfx/PixelArt.js';
import { ITEMS, sellPrice, CAT_LABEL } from '../../data/items.js';
import { SHOPS } from '../../data/shops.js';
import { WEAPON_TYPES, METALS, gradeFor } from '../../data/weapons.js';
import { makeCharacter } from '../../gfx/characters.js';
import { qColor, pips } from '../../ui/common.js';
import { SPR } from '../../ui/uiSprites.js';
import { makeRocco } from './rocco.js';

// ---------------------------------------------------------------- save data + the day's picks
/** state.data.traders: { met, haggle, deals, tips, stash, secret } (filled in when missing). */
export function traderData(st) {
  const d = (st.data.traders ||= {});
  d.met ||= {}; d.haggle ||= {}; d.deals ||= {}; d.tips ||= []; d.sold ||= {};
  if (d.stash === undefined) d.stash = false;
  if (d.secret === undefined) d.secret = false;
  return d;
}
const today = (st) => st.data.day ?? 0;
const dayRng = (st, k) => makeRng((hashStr(k) ^ (today(st) * 2654435761)) >>> 0);

/** What a keeper asks for an item (their markup unless the stock entry names a price). */
export function shopPrice(shop, e) {
  const it = ITEMS[e.id];
  if (!it) return 0;
  if (e.price) return e.price;
  const base = it.price || Math.round((it.value || 1) * 2.2);
  return Math.max(1, Math.round(base * (shop.markup || 1)));
}
/** Today's wanted item (pays wantedMult), or null. */
export function wantedToday(shop, st) {
  if (!shop.wanted?.length) return null;
  return shop.wanted[Math.floor(dayRng(st, 'wanted:' + shop.npc)() * shop.wanted.length)];
}
const buysIt = (shop, it, id) => !!it && (shop.buys?.cats?.includes(it.cat) || shop.buys?.ids?.includes(id)) && (it.value || 0) > 0;
/** What this keeper pays for one of id at quality q. */
export function offerFor(shop, st, id, q = 100, p = false) {
  const it = ITEMS[id];
  let m = (shop.buys?.mult || 1) * (shop.buys?.catMult?.[it.cat] ?? 1);
  if (id === wantedToday(shop, st)) m *= shop.wantedMult || 1.3;
  return Math.max(1, Math.round(sellPrice(id, q, p) * m));
}
/** Rocco's offer for a weapon (grade, today's craving, haggling, the Rocco's Pal skill). */
export function weaponOffer(st, w) {
  const sh = SHOPS.rocco;
  const g = gradeFor(w.score ?? 50).g;
  let m = sh.grade[g] ?? 1;
  if (w.type === roccoCraving(st)) m *= sh.craving;
  const h = traderData(st).haggle[w.uid];
  if (h && h.day === today(st)) m *= 1 + h.k;
  m *= st.skill?.('fence') || 1;
  return { mult: m, gold: Math.round((w.value || 0) * m), grade: g };
}
/** The weapon type Rocco is after today. */
export function roccoCraving(st) {
  const types = Object.keys(WEAPON_TYPES);
  const owned = types.filter((t) => st.data.owned?.['bp_' + t]);
  const pool = owned.length >= 2 ? owned : types.slice(0, 4);
  return pool[Math.floor(dayRng(st, 'craving')() * pool.length)];
}
/** Today's oddities on Rocco's shelf. */
function roccoOddities(st) {
  const sh = SHOPS.rocco, z = st.data.zoneMax || 1;
  const pool = sh.stock.filter((e) => !e.minZone || e.minZone <= z + 1);
  const r = dayRng(st, 'oddities');
  const out = [];
  const left = pool.slice();
  while (out.length < (sh.oddities || 6) && left.length) out.push(left.splice(Math.floor(r() * left.length), 1)[0]);
  return out;
}
/** Today's shady deal: { kind: 'hot'|'crate'|'tip'|'swap', ... } */
export function roccoDeal(st) {
  const r = dayRng(st, 'deal');
  const kinds = ['hot', 'crate', 'tip', 'swap', 'crate', 'hot'];
  const kind = kinds[Math.floor(r() * kinds.length)];
  const z = Math.max(1, st.data.zoneMax || 1);
  if (kind === 'hot') { const types = Object.keys(WEAPON_TYPES); const owned = types.filter((t) => st.data.owned?.['bp_' + t]); const pool = owned.length ? owned : ['dagger']; return { kind, type: pool[Math.floor(r() * pool.length)], mult: 1.8 }; }
  if (kind === 'crate') return { kind, price: 250 + z * 150 };
  if (kind === 'tip') return { kind, price: 120 + z * 60 };
  const pool = ['amber_bug', 'music_box', 'truffle', 'echo_crystal', 'wisp_essence', 'gravium', 'painting_beach', 'fish_tank'].filter((id) => ITEMS[id]);
  return { kind: 'swap', item: pool[Math.floor(r() * pool.length)] };
}
const dealDone = (st) => traderData(st).deals[today(st)] === true;

// ---------------------------------------------------------------- portraits
// One posed rig per keeper, kept for the session: a new face is a re-pose and one small render.
const portraits = new Map(), studios = new Map();
function studio(game, shopId) {
  let S = studios.get(shopId);
  if (S) return S;
  const k = SHOPS[shopId].keeper;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x4a3050, 1.4));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(1, 2, 3); scene.add(dl);
  const rim = new THREE.DirectionalLight(0xffd8a0, 0.8); rim.position.set(-2, 1.5, -2); scene.add(rim);
  const rig = k.raccoon ? makeRocco() : makeCharacter({ seed: 9, dirt: 0.2, ...k }, { kind: 'toon' });
  rig.shifty?.(0);
  scene.add(rig.root);
  for (let i = 0; i < 4; i++) rig.update(0.05);
  rig.root.updateMatrixWorld(true);
  const a = rig.anchors;
  const head = rig.neck.localToWorld(new THREE.Vector3(0, a.headH * 0.42, 0));
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  const dist = (a.headH * 1.5 * 0.5) / Math.tan((15 * Math.PI) / 180);
  const dir = new THREE.Vector3(0.2, 0.14, 1).normalize();
  cam.position.copy(head).addScaledVector(dir, dist);
  cam.lookAt(head);
  S = { scene, rig, cam, rt: null };
  studios.set(shopId, S);
  return S;
}
/** A head-and-shoulders portrait (data URL) of a keeper wearing an expression. */
function portraitURL(game, shopId, expr = null) {
  const key = shopId + ':' + (expr || '');
  if (portraits.has(key)) return portraits.get(key);
  let url = '';
  try {
    const S = studio(game, shopId), rig = S.rig, size = 72, renderer = game.engine.renderer;
    rig.setExpression(expr || SHOPS[shopId].keeper.mood || 'neutral', { body: false });
    rig.blinkT = 99; rig.blinkK = -1; rig.talk(false);
    for (let i = 0; i < 14; i++) rig.update(0.05);
    S.rt ||= new THREE.WebGLRenderTarget(size, size);
    S.rt.texture.colorSpace = THREE.SRGBColorSpace;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(S.rt);
    renderer.setClearColor(0x221a2a, 1);
    renderer.clear();
    renderer.render(S.scene, S.cam);
    const px = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(S.rt, 0, 0, size, size, px);
    renderer.setRenderTarget(prev);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const si = ((size - 1 - y) * size + x) * 4, di = (y * size + x) * 4;
      img.data[di] = px[si]; img.data[di + 1] = px[si + 1]; img.data[di + 2] = px[si + 2]; img.data[di + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    url = c.toDataURL();
  } catch (e) { console.warn('portrait', e); }
  portraits.set(key, url);
  return url;
}

const price = (n, cls = '') => el('span', { class: 'price ' + cls }, [el('img', { class: 'pix', src: cls.includes('big') ? SPR.coin() : SPR.coinMini(), alt: '' }), formatGoldFull(n)]);
const isUnique = (it) => ['tool', 'equip', 'blueprint', 'floor', 'wallpaper', 'key'].includes(it.cat);

// ---------------------------------------------------------------- the panel
export function openBurrowShop(game, shopId, o = {}) {
  const shop = SHOPS[shopId];
  if (!shop) return null;
  const st = game.state, ui = game.ui, au = game.audio;
  const npc = shop.npc, folk = o.folk || null, rocco = shopId === 'rocco';
  const T = traderData(st);
  const firstVisit = !T.met[npc];
  T.met[npc] = today(st) + 1;
  // talking to them hands over deliveries and offers their next request (the quests listen)
  st.emit('act', { type: 'talk', npc });
  const news = game.quests?.forNpc?.(npc) || { lines: [] };
  if (folk) { folk.busy = true; folk.rig.setExpression(npc === 'herbalist' ? 'stern' : rocco ? 'smug' : 'happy', { hold: 1.5 }); }

  // ---------------- the room
  const sayText = el('span', {}, '');
  const say = el('div', { class: 'sh-say' }, [el('b', {}, shop.keeper.name), sayText]);
  const faceImg = el('img', { class: 'pix', src: portraitURL(game, shopId), alt: shop.keeper.name });
  const face = el('div', { class: 'sh-portrait' }, [faceImg]);
  const keeper = el('div', { class: 'sh-keeper' }, [face, say]);
  const tabsEl = el('div', { class: 'sh-tabs' });
  const stock = el('div', { class: 'sh-stock' });
  const scroll = el('div', { class: 'sh-scroll' }, [stock]);
  const counter = el('div', { class: 'sh-counter' });
  const foot = el('div', { class: 'sh-foot' });
  const backNote = el('div', { class: 'sh-back', hidden: true });
  const wall = el('div', { class: 'sh-wall' }, [tabsEl, scroll, backNote]);
  const room = el('div', { class: 'sh-room' }, [keeper, counter, foot, wall]);
  const sign = el('div', { class: 'sh-sign' }, [el('i', { class: 'sh-chain l' }), el('i', { class: 'sh-chain r' }), el('h2', {}, shop.name)]);
  const root = el('div', { class: `sh shop-burrow shop-${shopId}` }, [sign, room]);

  let exprT = null;
  const speak = (text, expr = null, opts = {}) => {
    sayText.innerHTML = text;
    say.classList.remove('talk');
    void say.offsetWidth;
    say.classList.add('talk');
    if (opts.sound !== false) au.play('babble', { pitch: shop.keeper.voice || 300, n: Math.min(8, Math.ceil(text.replace(/<[^>]+>/g, '').length / 8)) });
    if (folk) { folk.rig.talk(Math.min(3, 0.8 + text.length * 0.03)); if (expr) folk.rig.setExpression(expr, { hold: 2 }); }
    if (expr) {
      // the portrait pulls the face too, then relaxes
      const url = portraitURL(game, shopId, expr);
      if (url) { faceImg.src = url; face.classList.remove('bump'); void face.offsetWidth; face.classList.add('bump'); }
      clearTimeout(exprT);
      exprT = setTimeout(() => { faceImg.src = portraitURL(game, shopId); }, 2200);
    }
  };
  // warm the faces we'll want, a little after opening
  setTimeout(() => { if (!root.isConnected) return; portraitURL(game, shopId, 'happy'); setTimeout(() => { if (root.isConnected && rocco) portraitURL(game, shopId, 'surprised'); }, 700); }, 500);

  const tabs = rocco
    ? [['weapons', 'Weapons'], ['deal', 'Deal'], ['buy', 'Oddities'], ['sell', 'Shinies'], ['jobs', 'Jobs']]
    : [['buy', 'Buy'], ['sell', 'Sell'], ['jobs', 'Jobs']];
  let tab = o.tab || tabs[0][0];
  let picked = null;
  let haggle = null; // { w, ... } while haggling
  const jobsBadge = () => (game.quests?.active?.() || []).filter((v) => v.def?.from === npc || v.step?.deliver?.to === npc).length + (news.lines?.length ? 1 : 0);

  const render = () => {
    tabsEl.innerHTML = '';
    for (const [k, label] of tabs) {
      const b = el('button', { class: 'sh-tab' + (tab === k ? ' on' : ''), onclick: () => { if (tab === k) return; tab = k; picked = null; stopHaggle(); au.play('ui_click'); render(); scroll.scrollTop = 0; } }, label);
      if (k === 'jobs' && jobsBadge()) b.append(el('i', { class: 'tr-badge' }, String(jobsBadge())));
      if (k === 'deal' && !dealDone(st)) b.append(el('i', { class: 'tr-badge hot' }, '!'));
      tabsEl.append(b);
    }
    stock.innerHTML = ''; foot.innerHTML = ''; counter.innerHTML = '';
    backNote.hidden = true;
    root.dataset.mode = tab === 'buy' ? 'buy' : tab === 'weapons' ? 'weapons' : tab === 'sell' ? 'sell' : tab;
    if (tab === 'buy') renderBuy();
    else if (tab === 'sell') renderSell();
    else if (tab === 'jobs') renderJobs();
    else if (tab === 'weapons') renderWeapons();
    else if (tab === 'deal') renderDeal();
  };
  const rerender = () => { const top = scroll.scrollTop; render(); scroll.scrollTop = top; };

  // ---------------- buying
  const buyList = () => {
    const z = st.data.zoneMax || 1;
    const list = rocco ? roccoOddities(st) : shop.stock.filter((e) => !e.minZone || e.minZone <= z);
    return list.filter((e) => ITEMS[e.id]);
  };
  const renderBuy = () => {
    const list = buyList();
    if (!picked || !list.some((e) => e.id === picked)) picked = list[0]?.id || null;
    const goods = list.map((e) => good(e));
    stock.append(...goods);
    goods.forEach((g, i) => g.style.setProperty('--d', Math.min(400, i * 22) + 'ms'));
    renderCounter();
    const hidden = rocco ? 0 : shop.stock.filter((e) => e.minZone && e.minZone > (st.data.zoneMax || 1)).length;
    backNote.hidden = !hidden && !rocco;
    if (rocco) backNote.textContent = 'New oddities every morning. Don\'t ask where from.';
    else if (hidden) backNote.textContent = `${hidden} more in the back. Dig deeper and come back!`;
  };
  const good = (e) => {
    const it = ITEMS[e.id], p = st.buyPrice(shopPrice(shop, e));
    const owned = isUnique(it) && st.owns(e.id);
    const can = st.canAfford(p);
    const tagTxt = owned ? 'Owned' : formatGoldFull(p);
    const b = el('button', {
      class: 'sh-good' + (picked === e.id ? ' on' : '') + (owned ? ' owned' : '') + (!owned && !can ? ' dear' : ''), title: it.name, 'aria-label': `${it.name}, ${tagTxt}`,
      onclick: () => { picked = e.id; au.play('ui_click'); for (const n of stock.children) n.classList.toggle('on', n === b); renderCounter(true); },
    }, [
      el('span', { class: 'sh-item' }, [el('img', { class: 'pix', src: iconURL(e.id), alt: '' })]),
      el('span', { class: 'sh-tag' }, [owned ? null : el('img', { class: 'pix', src: SPR.coinMini(), alt: '' }), tagTxt]),
    ]);
    return b;
  };
  const renderCounter = (pop) => {
    counter.innerHTML = '';
    const e = buyList().find((x) => x.id === picked);
    if (!e) { counter.append(el('p', { class: 'sh-note' }, 'The shelves are bare today.')); return; }
    const it = ITEMS[e.id], base = shopPrice(shop, e), p = st.buyPrice(base);
    const unique = isUnique(it), owned = unique && st.owns(e.id);
    const actions = el('div', { class: 'sh-pay' });
    if (owned) actions.append(el('span', { class: 'sh-owned' }, 'Owned'));
    else {
      actions.append(price(p, 'big'));
      const doBuy = (qty) => {
        const r = st.buy(e.id, base, qty);
        if (r.ok) {
          const gold = p * qty;
          au.play('ui_buy'); au.play('coins', { n: 3 });
          st.emit('act', { type: 'buy', id: e.id, gold, from: npc, n: qty });
          T.sold[e.id] = (T.sold[e.id] || 0) + qty;
          speak(pick(shop.bought), 'happy');
          folk?.react('bought');
          if (it.cat === 'furniture') ui.toast(`${it.name} is waiting at home. Place it in build mode.`, { icon: iconURL(e.id) });
          if (it.cat === 'blueprint' && it.kind === 'weapon') ui.toast(`New forge plans: ${it.name}`, { icon: iconURL(e.id), kind: 'good' });
        } else {
          au.play('ui_error');
          speak(r.reason === 'Not enough gold' ? pick(shop.poor) : r.full ? 'Your pack\'s stuffed. Lighten it, then come back.' : r.reason, r.reason === 'Not enough gold' ? 'sad' : 'thinking');
          if (r.reason === 'Not enough gold') folk?.react('poor');
        }
        rerender();
        const card = counter.querySelector('.sh-card');
        if (r.ok) { card?.classList.add('paid'); coinDrop(card?.querySelector('.sh-pay') || card); }
        else counter.querySelector('.sh-buy')?.classList.add('nope');
      };
      actions.append(el('button', { class: 'btn big sh-buy', disabled: !st.canAfford(p), onclick: () => doBuy(1) }, 'Buy'));
      if (!unique && p * 5 <= 8000) actions.append(el('button', { class: 'btn alt', disabled: !st.canAfford(p * 5), onclick: () => doBuy(5) }, '×5'));
    }
    const have = !unique && st.count(e.id) ? `You have ${st.count(e.id)}` : '';
    const discount = p < base ? `Haggled down from ${formatGoldFull(base)}` : '';
    counter.append(el('div', { class: 'sh-card' + (pop ? ' pop' : '') }, [
      el('div', { class: 'sh-card-icon' }, [el('img', { class: 'pix', src: iconURL(e.id), alt: '' })]),
      el('div', { class: 'sh-card-txt' }, [
        el('div', { class: 'sh-card-name' }, [el('b', {}, it.name), el('small', {}, CAT_LABEL[it.cat] || '')]),
        el('p', {}, it.desc || ''),
        have ? el('p', { class: 'sh-have' }, have) : null,
        discount ? el('p', { class: 'sh-have' }, discount) : null,
      ]),
      actions,
    ]));
  };
  const coinDrop = (node) => {
    if (!node) return;
    const host = counter.getBoundingClientRect(), r = node.getBoundingClientRect();
    for (let i = 0; i < 5; i++) {
      const c = el('i', { class: 'sh-coin' });
      c.style.left = (r.left - host.left + r.width / 2 + (Math.random() * 40 - 20)) + 'px';
      c.style.top = (r.top - host.top - 10) + 'px';
      c.style.animationDelay = `${i * 60}ms, ${i * 60}ms`;
      counter.append(c);
      setTimeout(() => c.remove(), 900 + i * 60);
    }
  };

  // ---------------- selling
  const afterSale = (g, id, n, extra = {}) => {
    if (g <= 0) return;
    au.play('coins', { n: Math.min(8, 2 + Math.floor(Math.log10(g + 1) * 1.5)) });
    ui.toast(`Sold to ${shop.keeper.name} for <b>${formatGoldFull(g)}</b> gold`, { kind: 'good', icon: SPR.coin() });
    st.emit('act', { type: 'sell', id, gold: g, to: npc, n, ...extra });
    speak(pick(shop.sold), 'happy');
    folk?.react('sold');
  };
  const sellLot = (l) => { const lot = st.removeLot(l.uid); if (!lot) return 0; const g = offerFor(shop, st, lot.id, lot.q, lot.p); st.addGold(g, 'sell'); return g; };
  const sellStack = (id, n) => { const k = st.removeItem(id, n); const cnt = typeof k === 'number' ? k : k.length; const g = offerFor(shop, st, id) * cnt; if (g > 0) st.addGold(g, 'sell'); return [g, cnt]; };
  const renderSell = () => {
    const want = wantedToday(shop, st);
    if (want && ITEMS[want]) {
      stock.append(el('div', { class: 'sh-poster tr-wanted' }, [
        el('small', {}, 'Wanted today'),
        el('div', { class: 'tr-wanted-row' }, [el('img', { class: 'pix', src: iconURL(want), alt: '' }), el('div', {}, [el('b', {}, ITEMS[want].name), el('p', {}, `Pays ${Math.round((shop.wantedMult || 1.3) * 100)}% today.`)])]),
      ]));
    }
    const groups = st.inventory(() => true).filter((g) => buysIt(shop, ITEMS[g.id], g.id));
    groups.sort((a, b) => (b.id === want) - (a.id === want) || (ITEMS[b.id].value || 0) - (ITEMS[a.id].value || 0));
    let total = 0;
    const ledger = el('div', { class: 'sh-ledger' });
    for (const g of groups) {
      const it = ITEMS[g.id];
      const each = g.lots ? g.lots.reduce((s, l) => s + offerFor(shop, st, l.id, l.q, l.p), 0) : offerFor(shop, st, g.id) * g.n;
      total += each;
      const meta = g.lots
        ? [pips(g.avgQ, g.lots.some((l) => l.p)), el('span', { html: `${g.n} pcs · <b style="color:${qColor(g.avgQ)}">${g.avgQ}%</b>${g.id === want ? ' · <b class="tr-want">wanted!</b>' : ''}` })]
        : [el('span', { html: `${g.n} pcs · ${CAT_LABEL[it.cat] || ''}${g.id === want ? ' · <b class="tr-want">wanted!</b>' : ''}` })];
      ledger.append(el('div', { class: 'sh-line' + (g.id === want ? ' tr-wanted-line' : '') }, [
        el('img', { class: 'pix', src: iconURL(g.id), alt: '' }),
        el('div', { class: 'sh-line-txt' }, [el('b', {}, it.name), el('span', { class: 'sh-meta' }, meta)]),
        price(each),
        el('div', { class: 'sh-line-btns' }, [
          el('button', { class: 'btn alt', title: 'Sell one', onclick: () => { let gg; if (g.lots) gg = sellLot(g.lots.slice().sort((a, b) => offerFor(shop, st, b.id, b.q, b.p) - offerFor(shop, st, a.id, a.q, a.p))[0]); else gg = sellStack(g.id, 1)[0]; afterSale(gg, g.id, 1); rerender(); } }, '1'),
          el('button', { class: 'btn', onclick: () => { let gg = 0, n = 0; if (g.lots) for (const l of [...g.lots]) { gg += sellLot(l); n++; } else [gg, n] = sellStack(g.id, g.n); afterSale(gg, g.id, n); rerender(); } }, 'All'),
        ]),
      ]));
    }
    if (!groups.length) ledger.append(el('p', { class: 'sh-note sh-empty' }, `Nothing ${shop.keeper.name} wants. ${shop.buys?.label ? 'Buys: ' + shop.buys.label.toLowerCase() + '.' : ''}`));
    stock.append(ledger);
    foot.append(el('span', { class: 'sh-note' }, `${shop.keeper.name} would pay`), price(total, 'big'), el('span', { class: 'spacer' }));
    if (groups.length > 1) foot.append(el('button', { class: 'btn', onclick: () => { let gg = 0, n = 0; for (const g of groups) { if (g.lots) for (const l of [...g.lots]) { gg += sellLot(l); n++; } else { const [a, b] = sellStack(g.id, g.n); gg += a; n += b; } } afterSale(gg, 'bulk', n); rerender(); } }, 'Sell everything'));
  };

  // ---------------- jobs (requests from game.quests)
  const renderJobs = () => {
    const Q = game.quests;
    const box = el('div', { class: 'sh-ledger tr-jobs' });
    if (!Q) { box.append(el('p', { class: 'sh-note sh-empty' }, 'No work going right now.')); stock.append(box); return; }
    for (const line of news.lines || []) box.append(el('div', { class: 'tr-news', html: line }));
    const mine = (Q.active?.() || []).filter((v) => v.def?.from === npc || v.step?.deliver?.to === npc);
    for (const v of mine) {
      const s = v.step || {};
      const need = s.deliver?.items ? Object.entries(s.deliver.items) : [];
      box.append(el('div', { class: 'tr-job' }, [
        el('b', {}, v.title || v.id),
        el('p', {}, v.text || ''),
        need.length ? el('div', { class: 'tr-need' }, need.map(([id, n]) => el('span', { class: 'tr-need-it' + (st.count(id) >= n ? ' ok' : '') }, [el('img', { class: 'pix', src: iconURL(id), alt: '' }), `${Math.min(st.count(id), n)}/${n}`]))) : null,
        v.max > 1 ? el('div', { class: 'sh-gauge tr-prog' }, [el('i', { style: { width: Math.round((100 * (v.n || 0)) / v.max) + '%' } })]) : null,
      ]));
    }
    if (!mine.length && !(news.lines || []).length) box.append(el('p', { class: 'sh-note sh-empty' }, 'Nothing needs doing just now.'));
    stock.append(box);
    foot.append(el('button', { class: 'btn', onclick: () => {
      const id = Q.offer?.(npc);
      const more = Q.forNpc?.(npc)?.lines || [];
      news.lines = [...(news.lines || []), ...more];
      if (id) { au.play('page'); speak(more[0] || 'Here, a little job for you.', 'happy'); } else speak(mine.length ? 'One thing at a time, dear.' : 'Nothing just now. Ask me later.', 'thinking');
      rerender();
    } }, 'Any work?'));
    const deliverable = mine.filter((v) => v.step?.deliver && Object.entries(v.step.deliver.items).every(([id, n]) => st.count(id) >= n));
    if (deliverable.length) foot.append(el('button', { class: 'btn big', onclick: () => {
      st.emit('act', { type: 'talk', npc }); // deliveries happen when you talk to them
      const more = Q.forNpc?.(npc)?.lines || [];
      news.lines = more;
      au.play('success');
      speak(more[0] || 'Ah, lovely. Thank you.', 'happy');
      folk?.react('bought');
      rerender();
    } }, 'Hand it over'));
  };

  // ---------------- Rocco: weapons and haggling
  const renderWeapons = () => {
    const craving = roccoCraving(st);
    stock.append(el('div', { class: 'tr-banner' }, [el('img', { class: 'pix', src: weaponIconURL(craving, 'iron'), alt: '' }), el('span', { html: `Today Rocco's itching for a <b>${WEAPON_TYPES[craving]?.name || craving}</b>: +${Math.round((SHOPS.rocco.craving - 1) * 100)}%` })]));
    const ws = (st.data.weapons || []).slice().sort((a, b) => weaponOffer(st, b).gold - weaponOffer(st, a).gold);
    const ledger = el('div', { class: 'sh-ledger' });
    for (const w of ws) {
      const off = weaponOffer(st, w), gr = gradeFor(w.score ?? 50);
      const h = T.haggle[w.uid];
      const tag = h && h.day === today(st) ? (h.patience <= 0 ? ' · final offer' : h.k > 0 ? ` · haggled +${Math.round(h.k * 100)}%` : '') : '';
      ledger.append(el('div', { class: 'sh-line' + (haggle?.w.uid === w.uid ? ' tr-on' : '') }, [
        el('img', { class: 'pix', src: weaponIconURL(w.type, w.metal, w.infusion), alt: '' }),
        el('div', { class: 'sh-line-txt' }, [el('b', {}, w.name), el('span', { html: `Grade <b style="color:${gr.color}" class="sh-grade">${w.grade || gr.g}</b> · worth ${formatGoldFull(w.value)}${w.type === craving ? ' · <b class="tr-want">he wants it!</b>' : ''}${tag}` })]),
        price(off.gold),
        el('div', { class: 'sh-line-btns' }, [
          el('button', { class: 'btn alt', disabled: !!(h && h.day === today(st) && (h.tries <= 0 || h.patience <= 0)), onclick: () => startHaggle(w) }, 'Haggle'),
          el('button', { class: 'btn', onclick: () => sellWeapon(w) }, 'Sell'),
        ]),
      ]));
    }
    if (!ws.length) ledger.append(el('p', { class: 'sh-note sh-empty' }, 'No blades on you. Forge one at Old Star\'s and bring it here. Rocco pays well for good ones.'));
    stock.append(ledger);
    if (haggle) renderHaggle();
    else counter.append(el('p', { class: 'sh-note tr-hint' }, ws.length ? 'Pick a blade. Sell it, or haggle: push when the needle\'s in the green. Push your luck too often and he\'ll stop playing.' : 'Rocco buys forged weapons. Better grades, better prices.'));
  };
  const sellWeapon = (w, bonus = null, line = null) => {
    const off = weaponOffer(st, w);
    const mult = bonus ?? off.mult;
    const g = st.sellWeapon(w.uid, mult);
    if (g <= 0) return 0;
    stopHaggle();
    au.play('coins', { n: 8 }); au.play('ui_buy');
    ui.toast(`Rocco takes the <b>${w.name}</b> for <b>${formatGoldFull(g)}</b> gold. No questions.`, { kind: 'good', icon: weaponIconURL(w.type, w.metal, w.infusion) });
    st.emit('act', { type: 'sell', id: w.type, weapon: { type: w.type, metal: w.metal, grade: w.grade, score: w.score }, gold: g, to: npc });
    delete T.haggle[w.uid];
    speak(line || (off.grade === 'S' || off.grade === 'A' ? pick(['Oh, that is BEAUTIFUL. Don\'t tell anyone I said so.', 'Now THAT\'s a blade. My client will weep.']) : pick(shop.sold)), 'happy');
    folk?.react('sold');
    folk?.rig.openCoat?.(1); setTimeout(() => folk?.rig.openCoat?.(0), 1500);
    rerender();
    return g;
  };
  // the haggle: a needle swings across the meter; push while it's in the green
  let raf = 0;
  const stopHaggle = () => { cancelAnimationFrame(raf); raf = 0; haggle = null; };
  const startHaggle = (w) => {
    const H = SHOPS.rocco.haggle;
    let h = T.haggle[w.uid];
    if (!h || h.day !== today(st)) h = T.haggle[w.uid] = { day: today(st), k: 0, tries: H.tries, patience: H.patience };
    haggle = { w, h, t: Math.random(), speed: 0.9 + (H.tries - h.tries) * 0.35, zone: 0.25 + Math.random() * 0.5, width: Math.max(0.1, 0.24 - (H.tries - h.tries) * 0.05), result: null };
    au.play('ui_click');
    speak(pick(['Haggle with ME? Ha! Go on then.', 'Alright, alright. Make me an offer.', 'You drive a hard bargain. Let\'s see how hard.']), 'smug');
    rerender();
  };
  const renderHaggle = () => {
    const { w, h } = haggle;
    const off = weaponOffer(st, w);
    const needle = el('i', { class: 'tr-needle' });
    const zone = el('i', { class: 'tr-zone' });
    zone.style.left = ((haggle.zone - haggle.width / 2) * 100) + '%';
    zone.style.width = (haggle.width * 100) + '%';
    const meter = el('div', { class: 'tr-meter' }, [zone, el('i', { class: 'tr-zone-c' }), needle]);
    const dots = (n, max, cls) => el('span', { class: 'tr-dots ' + cls }, Array.from({ length: max }, (_, i) => el('i', { class: i < n ? 'on' : '' })));
    const push = el('button', { class: 'btn big tr-push', disabled: h.tries <= 0 || h.patience <= 0, onclick: () => doPush() }, h.tries <= 0 || h.patience <= 0 ? 'No more haggling' : 'Push!');
    counter.append(el('div', { class: 'sh-card tr-haggle' }, [
      el('div', { class: 'sh-card-icon' }, [el('img', { class: 'pix', src: weaponIconURL(w.type, w.metal, w.infusion), alt: '' })]),
      el('div', { class: 'sh-card-txt' }, [
        el('div', { class: 'sh-card-name' }, [el('b', {}, w.name), el('small', {}, 'Haggling')]),
        el('div', { class: 'tr-hrow' }, [el('span', {}, 'Pushes'), dots(h.tries, SHOPS.rocco.haggle.tries, 'tries'), el('span', {}, 'Patience'), dots(h.patience, SHOPS.rocco.haggle.patience, 'pat')]),
      ]),
      meter,
      el('div', { class: 'sh-pay' }, [price(off.gold, 'big'), push, el('button', { class: 'btn alt', onclick: () => sellWeapon(w) }, 'Deal!'), el('button', { class: 'btn alt', onclick: () => { stopHaggle(); speak('Suit yourself.', 'smug'); rerender(); } }, 'Leave it')]),
    ]));
    let last = performance.now();
    const tick = (now) => {
      if (!haggle || !needle.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      haggle.t += dt * haggle.speed;
      const x = 0.5 - 0.5 * Math.cos(haggle.t * Math.PI); // eases at the ends like a real needle
      haggle.x = x;
      needle.style.left = (x * 100) + '%';
      raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  };
  const doPush = () => {
    if (!haggle) return;
    const H = SHOPS.rocco.haggle, { h } = haggle;
    if (h.tries <= 0 || h.patience <= 0) return;
    const d = Math.abs((haggle.x ?? 0.5) - haggle.zone), half = haggle.width / 2;
    h.tries--;
    const meter = counter.querySelector('.tr-meter');
    if (d <= half) {
      const k = H.step[0] + (H.step[1] - H.step[0]) * (1 - d / half);
      h.k = +(h.k + k).toFixed(3);
      au.play(d < half * 0.35 ? 'perfect' : 'good');
      au.play('coins', { n: 3 });
      speak(d < half * 0.35 ? pick(['WHAT. Fine! FINE! Highway robbery.', 'Ow. You\'re good at this. I hate it.']) : pick(['Hmph. A little more, then.', 'Alright, alright, a bit more.', 'You\'re bleeding me dry here.']), 'surprised');
      folk?.react('up');
      meter?.classList.add('hit');
    } else {
      h.patience--;
      h.k = +Math.max(-0.2, h.k - H.miss).toFixed(3);
      au.play('oops');
      if (h.patience <= 0) { h.tries = 0; speak('That\'s it! Final offer. Take it or leave it.', 'angry'); folk?.react('angry'); }
      else speak(pick(['Ha! Nice try.', 'Pfft. Now it\'s LESS.', 'Rocco doesn\'t like greedy.']), 'smug');
      if (h.patience > 0) folk?.react('miss');
      meter?.classList.add('miss');
    }
    haggle.speed += 0.35;
    haggle.width = Math.max(0.1, haggle.width - 0.05);
    haggle.zone = 0.2 + Math.random() * 0.6;
    setTimeout(() => { if (haggle) rerender(); }, 380);
  };

  // ---------------- Rocco: today's shady deal
  const renderDeal = () => {
    const D = roccoDeal(st), done = dealDone(st);
    const card = el('div', { class: 'sh-poster tr-deal' + (done ? ' done' : '') });
    const act = el('div', { class: 'tr-deal-act' });
    let title = '', text = '', icon = null;
    if (D.kind === 'hot') {
      const tname = WEAPON_TYPES[D.type]?.name || D.type;
      title = `Hot order: a ${tname}`; icon = weaponIconURL(D.type, 'steel');
      text = `"Got a buyer. Tonight. Any ${tname.toLowerCase()} at all, ${Math.round(D.mult * 100)}% of what it's worth. Don't ask who."`;
      const ws = (st.data.weapons || []).filter((w) => w.type === D.type);
      if (!done) for (const w of ws) act.append(el('button', { class: 'btn', onclick: () => { T.deals[today(st)] = true; sellWeapon(w, D.mult * (st.skill?.('fence') || 1), 'Perfect. PERFECT. This never happened.'); } }, [el('img', { class: 'pix tr-ico', src: weaponIconURL(w.type, w.metal, w.infusion), alt: '' }), `Deliver ${w.name} · ${formatGoldFull(Math.round(w.value * D.mult * (st.skill?.('fence') || 1)))}g`]));
      if (!done && !ws.length) act.append(el('p', { class: 'sh-note' }, st.owns('bp_' + D.type) ? `You've no ${tname.toLowerCase()} on you. Forge one today.` : `You'll need the ${tname} plans first.`));
    } else if (D.kind === 'crate') {
      title = 'The mystery crate'; icon = iconURL('crate');
      text = '"Fell off a cart. Sealed. Could be treasure, could be socks. One per customer, per day."';
      if (!done) act.append(el('button', { class: 'btn big', disabled: !st.canAfford(D.price), onclick: () => openCrate(D) }, [`Buy it · `, price(D.price)]));
    } else if (D.kind === 'tip') {
      title = 'A tip, discreetly'; icon = iconURL('amethyst');
      text = '"I know where a geode\'s hiding. Gems, all inside, nobody\'s touched it. I\'ll mark it on your radar."';
      if (!done) act.append(el('button', { class: 'btn big', disabled: !st.canAfford(D.price), onclick: () => buyTip(D) }, [`Pay for the tip · `, price(D.price)]));
    } else {
      const it = ITEMS[D.item];
      title = `A swap: ${it.name}`; icon = iconURL(D.item);
      text = `"Your least favourite blade for my ${it.name.toLowerCase()}. Straight swap. It's worth ${formatGoldFull(it.value)}, give or take a lot."`;
      const ws = (st.data.weapons || []).slice().sort((a, b) => a.value - b.value);
      if (!done && ws[0]) act.append(el('button', { class: 'btn big', onclick: () => doSwap(D, ws[0]) }, [el('img', { class: 'pix tr-ico', src: weaponIconURL(ws[0].type, ws[0].metal, ws[0].infusion), alt: '' }), `Swap your ${ws[0].name}`]));
      if (!done && !ws[0]) act.append(el('p', { class: 'sh-note' }, 'Bring a blade, any blade.'));
    }
    if (done) act.append(el('p', { class: 'sh-note tr-done' }, 'Done for today. Come back tomorrow for another... opportunity.'));
    card.append(el('small', {}, done ? 'Sold out' : 'Today only'), el('div', { class: 'sh-poster-icon' }, [el('img', { class: 'pix', src: icon, alt: '' })]), el('b', {}, title), el('p', {}, text), act);
    stock.append(card);
    counter.append(el('p', { class: 'sh-note tr-hint' }, 'One shady deal a day. They change every morning.'));
  };
  const openCrate = (D) => {
    if (!st.spend(D.price, 'buy')) { speak(pick(shop.poor), 'sad'); return; }
    st.emit('act', { type: 'buy', id: 'mystery_crate', gold: D.price, from: npc });
    T.deals[today(st)] = true;
    const r = Math.random(), z = Math.max(1, st.data.zoneMax || 1);
    const gems = ['amber', 'amethyst', 'ruby', 'emerald', 'sapphire', 'diamond'].filter((g) => ITEMS[g]);
    let got = null, gold = 0, line;
    let spilled = false;
    const give = (id, n = 1) => { for (let i = 0; i < n; i++) { const fits = st.canAdd ? st.canAdd(id, 1) : true; st.addItem(id, { ...(ITEMS[id].q ? { q: 70 + Math.round(Math.random() * 28) } : {}), spill: true }); if (!fits) spilled = true; } got = id; };
    if (r < 0.28) { gold = Math.round(D.price * (0.4 + Math.random() * 2.4)); line = gold > D.price ? 'Coins! Lucky you. Lucky ME, I sold it.' : 'Coins. Some coins. Coins are coins.'; }
    else if (r < 0.5) { give(gems[Math.min(gems.length - 1, Math.floor(Math.random() * (z + 1)))]); line = 'A gem! I KNEW there was a gem in one of those.'; }
    else if (r < 0.64) { give(pick(['truffle', 'crystal_lily', 'wisp_essence', 'amber_bug'].filter((i) => ITEMS[i]))); line = 'Ooh, that\'s a rare one. Shouldn\'t have sold it so cheap.'; }
    else if (r < 0.74) { const bps = Object.keys(ITEMS).filter((i) => ITEMS[i].cat === 'blueprint' && ITEMS[i].kind === 'weapon' && !st.owns(i) && (ITEMS[i].price || 0) > 0 && (ITEMS[i].price || 0) < 20000 * z); if (bps.length) { give(pick(bps)); line = 'Forge plans! Somebody\'s going to miss those.'; } else { gold = D.price * 2; line = 'Coins. Lots of coins.'; } }
    else if (r < 0.86) { give(pick(['plushie', 'music_box', 'painting_beach', 'clock', 'beetle_jar'].filter((i) => ITEMS[i]))); line = 'Something for your burrow. Very... decorative.'; }
    else { give('dust_fluff', 3); line = 'Socks. It was socks. Well, fluff. No refunds!'; }
    if (gold) st.addGold(gold, 'crate');
    au.play('crack'); setTimeout(() => au.play(got === 'dust_fluff' ? 'oops' : 'fanfare'), 260);
    const what = got ? ITEMS[got].name : '';
    ui.toast(`The crate held ${got ? `<b>${what}</b>` : ''}${got && gold ? ' and ' : ''}${gold ? `<b>${formatGoldFull(gold)}</b> gold` : ''}!${spilled ? ' (No room in your pack: it went home to your stash.)' : ''}`, { kind: got === 'dust_fluff' ? 'warn' : 'good', icon: got ? iconURL(got) : SPR.coin() });
    speak(line, got === 'dust_fluff' ? 'laugh' : 'surprised');
    folk?.react(got === 'dust_fluff' ? 'laugh' : 'deal');
    rerender();
    stock.querySelector('.tr-deal')?.classList.add('tr-pop');
  };
  const buyTip = (D) => {
    const ctx = o.ctx, plan = ctx?.plan, deep = st.data.deep;
    const b = plan?.burrows?.find((q) => q.kind === 'raccoon');
    const pos = ctx?.player?.pos || b;
    const tipped = new Set(T.tips || []);
    const cand = (plan?.geodes || []).map((g, i) => ({ g, i, d: Math.hypot(g.x - pos.x, (g.y - pos.y) * 0.6, g.z - pos.z) })).filter((c) => !tipped.has(c.i)).sort((a, b2) => a.d - b2.d);
    const c = cand[0];
    if (!c || !deep) { speak('Hm. Fresh out of tips. Keep your gold.', 'thinking'); return; }
    if (!st.spend(D.price, 'buy')) { speak(pick(shop.poor), 'sad'); return; }
    st.emit('act', { type: 'buy', id: 'rocco_tip', gold: D.price, from: npc });
    T.deals[today(st)] = true;
    T.tips.push(c.i);
    (deep.stakes ||= []).push({ x: c.g.x, y: c.g.y, z: c.g.z, tip: true });
    const dx = c.g.x - pos.x, dz = c.g.z - pos.z, dy = c.g.y - pos.y;
    const dir = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'][((Math.round(Math.atan2(-dz, dx) / (Math.PI / 4)) % 8) + 8 + 2) % 8];
    const where = `about ${Math.round(Math.hypot(dx, dz))} m ${dir}${Math.abs(dy) > 3 ? `, ${Math.round(Math.abs(dy))} m ${dy < 0 ? 'down' : 'up'}` : ''}`;
    au.play('discover');
    ui.toast(`Rocco marks a geode on your radar: ${where}. (${ITEMS[c.g.item]?.name || 'gems'} inside, he says.)`, { kind: 'good', icon: iconURL(c.g.item) });
    speak(`${where.charAt(0).toUpperCase() + where.slice(1)}. Follow the little light on your radar. You didn't hear it from me.`, 'smug');
    folk?.react('deal');
    rerender();
  };
  const doSwap = (D, w) => {
    const gone = st.removeWeapon(w.uid);
    if (!gone) return;
    st.addItem(D.item, { ...(ITEMS[D.item].q ? { q: 90 } : {}), spill: true }); // the blade's pocket is free now; if not, it goes home
    T.deals[today(st)] = true;
    st.emit('act', { type: 'sell', id: w.type, weapon: { type: w.type, metal: w.metal, grade: w.grade, score: w.score }, gold: 0, to: npc, swap: D.item });
    st.emit('act', { type: 'buy', id: D.item, gold: 0, from: npc });
    au.play('success');
    ui.toast(`Swapped your ${w.name} for <b>${ITEMS[D.item].name}</b>.`, { kind: 'good', icon: iconURL(D.item) });
    speak('Pleasure doing business. It was never here.', 'smug');
    folk?.react('deal');
    rerender();
  };

  // ---------------- open
  render();
  const greet = news.lines?.length ? news.lines[0] : firstVisit ? shop.greet[0] : pick(shop.lines);
  speak(greet, news.lines?.length ? 'happy' : null, { sound: true });
  const fit = () => root.classList.toggle('narrow', window.innerWidth < 700 || window.innerHeight < 470);
  fit();
  window.addEventListener('resize', fit);
  ui.status?.pin?.(true);
  const h = ui.openPanel({
    body: root, className: 'sh-panel tr-panel', onClose: () => {
      stopHaggle();
      clearTimeout(exprT);
      window.removeEventListener('resize', fit);
      ui.status?.pin?.(false);
      if (folk) { folk.busy = false; setTimeout(() => folk.react('bye', pick(shop.bye)), 120); }
      o.onClose?.();
    },
  });
  h.shopId = shopId;
  h.debug = { tab: (k) => { tab = k; stopHaggle(); render(); return k; }, haggle: (i = 0) => { const w = (st.data.weapons || [])[i]; if (w) { tab = 'weapons'; startHaggle(w); } return !!w; }, push: (x) => { if (haggle) { haggle.x = x ?? haggle.zone; doPush(); } return haggle?.h; }, render };
  return h;
}

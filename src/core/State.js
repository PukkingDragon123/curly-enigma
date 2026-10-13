// Persistent game state + save/load. All gameplay systems read and write through here.
import { ITEMS, sellPrice } from '../data/items.js';
import { MECHANICS } from '../data/mechanics.js';
import { CREATURES } from '../data/creatures.js';
import { DISHES } from '../data/recipes.js';
import { WEAPON_TYPES, weaponValue, weaponName, gradeFor } from '../data/weapons.js';
import { uid, clamp } from './util.js';

const SAVE_KEY = 'moleforge.save.v1';
export const GOAL_GOLD = 1000000;

function defaultHome() {
  return {
    level: 0,
    wall: 'wall_dirt',
    floor: {}, // "x,y" → floor id (default floor_dirt)
    placed: [
      { uid: uid(), id: 'bed_straw', x: 1, y: 1, r: 0 },
      { uid: uid(), id: 'forge', x: 6, y: 1, r: 0 },
      { uid: uid(), id: 'stove', x: 4, y: 1, r: 0 },
      { uid: uid(), id: 'coop', x: 8, y: 5, r: 0 },
    ],
    planters: {}, // placed uid → { id, day }
  };
}

export function defaultData() {
  return {
    v: 1,
    gold: 120,
    day: 1,
    energy: 100,
    maxEnergy: 100,
    lots: [], // [{uid, id, q, p}] items with quality
    counts: { grub_bar: 2, support_beam: 3 }, // stackables
    weapons: [], // forged weapons
    owned: { pick_rusty: 1, helmet_basic: 1, bag_small: 1, bp_dagger: 1, floor_dirt: 1, wall_dirt: 1 },
    equip: { pick: 'pick_rusty', chisel: null, brush: null, drill: null, xray: null, helmet: 'helmet_basic', gloves: null, suit: null, boots: null, bag: 'bag_small' },
    furniture: {}, // unplaced furniture: id → count
    home: defaultHome(),
    forgeLevel: 0,
    recipes: {}, // dish id → best score
    index: {}, // "cat:id" → { day, n, best? }
    zoneMax: 1,
    deepest: 0,
    stats: { blocks: 0, ores: 0, pristine: 0, weapons: 0, dishes: 0, earned: 0, faints: 0, caveins: 0, explosions: 0, trips: 0, bestWeapon: 0, eggs: 0 },
    buffs: [], // [{id, until}] until = playTime seconds
    flags: {},
    chicken: { name: 'Nugget', eggs: 0, pets: 0, lastPetDay: 0 },
    commission: null,
    settings: { music: 0.55, sfx: 0.85, pixel: 0, shake: 1 },
    playTime: 0,
    created: Date.now(),
  };
}

export class State {
  constructor() {
    this.data = defaultData();
    this.handlers = {};
    this.dirty = false;
    this.lastSave = 0;
  }

  // ---------- events ----------
  on(evt, fn) {
    (this.handlers[evt] ||= new Set()).add(fn);
    return () => this.handlers[evt].delete(fn);
  }
  emit(evt, payload) {
    const hs = this.handlers[evt];
    if (hs) for (const fn of [...hs]) fn(payload);
    this.dirty = true;
  }

  // ---------- persistence ----------
  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      this.dirty = false;
      this.lastSave = performance.now();
      return true;
    } catch (e) {
      return false;
    }
  }
  load(raw) {
    try {
      const json = raw || localStorage.getItem(SAVE_KEY);
      if (!json) return false;
      const d = typeof json === 'string' ? JSON.parse(json) : json;
      const base = defaultData();
      this.data = { ...base, ...d, stats: { ...base.stats, ...d.stats }, settings: { ...base.settings, ...d.settings }, equip: { ...base.equip, ...d.equip }, chicken: { ...base.chicken, ...d.chicken } };
      if (!this.data.home || !this.data.home.placed) this.data.home = defaultHome();
      this.emit('load');
      return true;
    } catch (e) {
      console.warn('load failed', e);
      return false;
    }
  }
  reset() {
    const settings = this.data.settings;
    this.data = defaultData();
    this.data.settings = settings;
    this.emit('load');
  }
  wipeSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
  }

  // ---------- gold ----------
  get gold() { return this.data.gold; }
  addGold(n, reason = '') {
    n = Math.round(n);
    this.data.gold += n;
    if (n > 0) this.data.stats.earned += n;
    this.emit('gold', { delta: n, reason });
  }
  canAfford(n) { return this.data.gold >= n; }
  spend(n, reason = '') {
    if (this.data.gold < n) return false;
    this.data.gold -= n;
    this.emit('gold', { delta: -n, reason });
    return true;
  }

  // ---------- energy ----------
  get energy() { return this.data.energy; }
  get maxEnergy() { return this.data.maxEnergy; }
  useEnergy(n) {
    const d = this.data;
    d.energy = clamp(d.energy - n, 0, d.maxEnergy);
    this.emit('energy', { delta: -n });
    if (d.energy <= 0) this.emit('exhausted');
    return d.energy;
  }
  restoreEnergy(n) {
    const d = this.data;
    d.energy = clamp(d.energy + n, 0, d.maxEnergy);
    this.emit('energy', { delta: n });
  }

  // ---------- buffs ----------
  addBuff(id, seconds = 300) {
    const until = this.data.playTime + seconds;
    const b = this.data.buffs.find((x) => x.id === id);
    if (b) b.until = Math.max(b.until, until);
    else this.data.buffs.push({ id, until });
    this.emit('buffs');
  }
  hasBuff(id) {
    return this.data.buffs.some((b) => b.id === id && b.until > this.data.playTime);
  }
  tickBuffs() {
    const before = this.data.buffs.length;
    this.data.buffs = this.data.buffs.filter((b) => b.until > this.data.playTime);
    if (this.data.buffs.length !== before) this.emit('buffs');
  }

  // ---------- items ----------
  /** Add an item. For quality items pass {q, p}. Returns the lot or count. */
  addItem(id, opts = {}) {
    const it = ITEMS[id];
    if (!it) { console.warn('unknown item', id); return null; }
    const n = opts.n ?? 1;
    if (it.q) {
      let last = null;
      for (let i = 0; i < n; i++) {
        last = { uid: uid(), id, q: Math.round(clamp(opts.q ?? 100, 0, 100)), p: !!opts.p };
        this.data.lots.push(last);
      }
      this.emit('items', { id, n });
      return last;
    }
    if (it.cat === 'tool' || it.cat === 'equip' || it.cat === 'blueprint' || it.cat === 'floor' || it.cat === 'wallpaper' || it.cat === 'key') {
      this.data.owned[id] = 1;
      if (it.cat === 'blueprint' && it.kind === 'forge') this.data.forgeLevel = Math.max(this.data.forgeLevel, it.level);
      if (it.cat === 'blueprint' && it.kind === 'room') this.data.home.level = Math.max(this.data.home.level, it.level);
      this.emit('items', { id, n: 1 });
      return 1;
    }
    if (it.cat === 'furniture') {
      this.data.furniture[id] = (this.data.furniture[id] || 0) + n;
      this.emit('items', { id, n });
      return this.data.furniture[id];
    }
    this.data.counts[id] = (this.data.counts[id] || 0) + n;
    this.emit('items', { id, n });
    return this.data.counts[id];
  }

  /** Count of an item (lots + stack). */
  count(id) {
    const it = ITEMS[id];
    if (!it) return 0;
    if (it.q) return this.data.lots.reduce((s, l) => s + (l.id === id ? 1 : 0), 0);
    if (it.cat === 'furniture') return this.data.furniture[id] || 0;
    if (it.cat === 'tool' || it.cat === 'equip' || it.cat === 'blueprint' || it.cat === 'floor' || it.cat === 'wallpaper' || it.cat === 'key') return this.data.owned[id] ? 1 : 0;
    return this.data.counts[id] || 0;
  }
  owns(id) { return this.count(id) > 0; }

  lotsOf(id) { return this.data.lots.filter((l) => l.id === id); }

  /** Remove n of an item. For quality items removes the highest quality first unless lowFirst. Returns removed lots (or count). */
  removeItem(id, n = 1, { lowFirst = false } = {}) {
    const it = ITEMS[id];
    if (!it) return [];
    if (it.q) {
      const lots = this.lotsOf(id).sort((a, b) => (lowFirst ? a.q - b.q : b.q - a.q));
      const take = lots.slice(0, n);
      const set = new Set(take.map((l) => l.uid));
      this.data.lots = this.data.lots.filter((l) => !set.has(l.uid));
      this.emit('items', { id, n: -take.length });
      return take;
    }
    if (it.cat === 'furniture') {
      const have = this.data.furniture[id] || 0;
      const k = Math.min(have, n);
      this.data.furniture[id] = have - k;
      if (!this.data.furniture[id]) delete this.data.furniture[id];
      this.emit('items', { id, n: -k });
      return k;
    }
    const have = this.data.counts[id] || 0;
    const k = Math.min(have, n);
    this.data.counts[id] = have - k;
    if (!this.data.counts[id]) delete this.data.counts[id];
    this.emit('items', { id, n: -k });
    return k;
  }

  removeLot(lotUid) {
    const i = this.data.lots.findIndex((l) => l.uid === lotUid);
    if (i < 0) return null;
    const [l] = this.data.lots.splice(i, 1);
    this.emit('items', { id: l.id, n: -1 });
    return l;
  }

  /** Grouped inventory view: [{id, n, avgQ, lots?}] */
  inventory(filter = () => true) {
    const out = [];
    const groups = {};
    for (const l of this.data.lots) {
      if (!filter(ITEMS[l.id])) continue;
      (groups[l.id] ||= []).push(l);
    }
    for (const [id, lots] of Object.entries(groups)) {
      out.push({ id, n: lots.length, avgQ: Math.round(lots.reduce((s, l) => s + l.q, 0) / lots.length), lots });
    }
    for (const [id, n] of Object.entries(this.data.counts)) if (n > 0 && filter(ITEMS[id])) out.push({ id, n });
    for (const [id, n] of Object.entries(this.data.furniture)) if (n > 0 && filter(ITEMS[id])) out.push({ id, n });
    return out;
  }

  // ---------- weapons ----------
  addWeapon(w) {
    const weapon = { uid: uid(), day: this.data.day, ...w };
    weapon.grade = gradeFor(weapon.score).g;
    weapon.name = weapon.name || weaponName(weapon);
    weapon.value = weaponValue(weapon, ITEMS);
    this.data.weapons.push(weapon);
    this.data.stats.weapons++;
    this.data.stats.bestWeapon = Math.max(this.data.stats.bestWeapon, weapon.value);
    const key = 'weapon:' + weapon.type;
    const prev = this.data.index[key];
    const isNew = this.discover('weapon', weapon.type);
    const e = this.data.index[key];
    if (e) {
      e.metals = e.metals || {};
      e.metals[weapon.metal] = Math.max(e.metals[weapon.metal] || 0, weapon.score);
      e.best = Math.max(e.best || 0, weapon.score);
    }
    this.emit('weapon', { weapon, isNew: isNew && !prev });
    return weapon;
  }
  removeWeapon(wuid) {
    const i = this.data.weapons.findIndex((w) => w.uid === wuid);
    if (i < 0) return null;
    const [w] = this.data.weapons.splice(i, 1);
    this.emit('items', { id: 'weapon', n: -1 });
    return w;
  }

  // ---------- equipment ----------
  equip(id) {
    const it = ITEMS[id];
    if (!it || !it.slot || !this.owns(id)) return false;
    this.data.equip[it.slot] = id;
    this.emit('equip', { slot: it.slot, id });
    return true;
  }
  equipped(slot) { return this.data.equip[slot] ? ITEMS[this.data.equip[slot]] : null; }
  protects(kind) {
    for (const slot of ['gloves', 'suit']) {
      const it = this.equipped(slot);
      if (it && it.protect && it.protect.includes(kind)) return true;
    }
    return false;
  }
  bagCapacity() { return this.equipped('bag')?.cap ?? 14; }
  lightRadius() { return (this.equipped('helmet')?.light ?? 5) + (this.hasBuff('glow') ? 2.5 : 0); }

  /** Buy: handles price + extra item requirements. Returns {ok, reason} */
  buy(id, price, qty = 1) {
    const it = ITEMS[id];
    if (!it) return { ok: false, reason: 'Unknown item' };
    const total = price * qty;
    if (it.needs) {
      for (const [nid, n] of Object.entries(it.needs)) {
        if (this.count(nid) < n * qty) return { ok: false, reason: `Needs ${n * qty}× ${ITEMS[nid].name}` };
      }
    }
    if (!this.canAfford(total)) return { ok: false, reason: 'Not enough gold' };
    if (it.needs) for (const [nid, n] of Object.entries(it.needs)) this.removeItem(nid, n * qty, { lowFirst: true });
    this.spend(total, 'buy');
    for (let i = 0; i < qty; i++) this.addItem(id, it.q ? { q: 100 } : {});
    if ((it.cat === 'tool' || it.cat === 'equip') && it.slot) {
      const cur = this.equipped(it.slot);
      if (!cur || (it.price || 0) >= (cur.price || 0)) this.equip(id);
    }
    if (id === 'support_beam' || id === 'glow_stake') this.emit('items', { id });
    return { ok: true };
  }

  sellLot(lotUid) {
    const l = this.removeLot(lotUid);
    if (!l) return 0;
    const g = sellPrice(l.id, l.q, l.p);
    this.addGold(g, 'sell');
    return g;
  }
  sellStack(id, n = 1) {
    const k = this.removeItem(id, n);
    const cnt = typeof k === 'number' ? k : k.length;
    const g = sellPrice(id) * cnt;
    if (g > 0) this.addGold(g, 'sell');
    return g;
  }
  sellWeapon(wuid, bonusMult = 1) {
    const w = this.removeWeapon(wuid);
    if (!w) return 0;
    const g = Math.round(w.value * bonusMult);
    this.addGold(g, 'sell');
    return g;
  }

  // ---------- index ----------
  /** Record a discovery. Returns true if it is new. */
  discover(cat, id, extra) {
    const key = cat + ':' + id;
    const e = this.data.index[key];
    if (e) {
      e.n = (e.n || 1) + 1;
      if (extra) Object.assign(e, extra);
      return false;
    }
    this.data.index[key] = { day: this.data.day, n: 1, ...(extra || {}) };
    this.emit('discover', { cat, id, name: indexName(cat, id) });
    return true;
  }
  known(cat, id) { return !!this.data.index[cat + ':' + id]; }
  /** Shorthand for mechanics */
  learn(mechId) { return this.discover('mechanic', mechId); }

  // ---------- days ----------
  nextDay() {
    const d = this.data;
    d.day++;
    this.emit('day', { day: d.day });
  }
  unflag(k) {
    delete this.data.flags[k];
    this.dirty = true;
  }
  flag(k, v) {
    if (v === undefined) return this.data.flags[k];
    this.data.flags[k] = v;
    this.dirty = true;
    return v;
  }
}

export function indexName(cat, id) {
  if (cat === 'mechanic') return MECHANICS[id]?.name || id;
  if (cat === 'critter') return CREATURES[id]?.name || id;
  if (cat === 'weapon') return WEAPON_TYPES[id]?.name || id;
  if (cat === 'recipe') return DISHES[id]?.name || id;
  return ITEMS[id]?.name || id;
}

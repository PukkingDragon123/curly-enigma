// Persistent game state + save/load. All gameplay systems read and write through here.
import { ITEMS, sellPrice, setFindBonus } from '../data/items.js';
import { UPGRADES, MILESTONES, upgradeEffect, upgradeCost, upgradeLock, milestoneValue } from '../data/upgrades.js';
import { MECHANICS } from '../data/mechanics.js';
import { CREATURES } from '../data/creatures.js';
import { DISHES } from '../data/recipes.js';
import { WEAPON_TYPES, weaponValue, weaponName, gradeFor } from '../data/weapons.js';
import { uid, clamp } from './util.js';
import { slotKey, currentSlot, listSlots, useSlot, deleteSlot, completionOf } from './saves.js';
import { attachSkills, defaultSkills, fillSkills } from './skills.js';
import * as Inv from './inventory.js';

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
    v: 2,
    gold: 120,
    day: 1,
    energy: 100,
    maxEnergy: 100,
    lots: [], // read-only mirror of the backpack's quality lots [{uid, id, q, p}] (core/inventory.js)
    counts: { grub_bar: 2, support_beam: 3, chicken_feed: 6 }, // read-only mirror of the backpack's stackables
    weapons: [], // read-only mirror of the forged weapons in the backpack
    inv: Inv.defaultInv(), // the backpack: slots of stacks (core/inventory.js)
    coop: Inv.defaultCoop(), // Nugget's walking coop: its shelves, how fed she is (deep/Nugget.js)
    stash: { slots: [] }, // what didn't fit, kept at home
    owned: { pick_rusty: 1, helmet_basic: 1, bag_small: 1, bp_dagger: 1, floor_dirt: 1, wall_dirt: 1 },
    equip: { pick: 'pick_rusty', chisel: null, brush: null, drill: null, xray: null, helmet: 'helmet_basic', gloves: null, suit: null, boots: null, bag: 'bag_small' },
    furniture: {}, // unplaced furniture: id → count
    home: defaultHome(),
    forgeLevel: 0,
    recipes: {}, // dish id → best score
    index: {}, // "cat:id" → { day, n, best? }
    zoneMax: 1,
    deepest: 0,
    stats: { blocks: 0, ores: 0, pristine: 0, weapons: 0, dishes: 0, earned: 0, faints: 0, caveins: 0, explosions: 0, trips: 0, bestWeapon: 0, eggs: 0, blasts: 0, kills: 0, golems: 0 },
    upgrades: {}, // upgrade board: id → level (data/upgrades.js)
    progress: { ms: {}, tavern: null }, // milestones reached (id → day), the tavern's last takings
    buffs: [], // [{id, until}] until = playTime seconds
    flags: {},
    chicken: { name: 'Nugget', eggs: 0, pets: 0, lastPetDay: 0 },
    commission: null,
    settings: { music: 0.55, sfx: 0.85, pixel: 0, shake: 1 },
    playTime: 0,
    created: Date.now(),
    skills: defaultSkills(), // the skill tree: XP, levels, points, stamped nodes (core/skills.js)
  };
}

export class State {
  constructor() {
    this.data = defaultData();
    this.handlers = {};
    this.dirty = false;
    this.lastSave = 0;
    this.pendingMs = []; // milestones reached but not shown yet (takeMilestones)
    this.slot = currentSlot(); // save slot in use, 0..2 (core/saves.js)
    attachSkills(this); // state.skill(key), addSkillPoints(n), 'act' → XP (core/skills.js)
    this.applyUpgrades();
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
    try { return !!localStorage.getItem(slotKey(this.slot)); } catch (e) { return false; }
  }
  save() {
    try {
      this.data.saved = Date.now();
      localStorage.setItem(slotKey(this.slot), JSON.stringify(this.data));
      this.dirty = false;
      this.lastSave = performance.now();
      return true;
    } catch (e) {
      return false;
    }
  }
  load(raw) {
    try {
      const json = raw || localStorage.getItem(slotKey(this.slot));
      if (!json) return false;
      const d = typeof json === 'string' ? JSON.parse(json) : json;
      const base = defaultData();
      this.data = { ...base, ...d, stats: { ...base.stats, ...d.stats }, settings: { ...base.settings, ...d.settings }, equip: { ...base.equip, ...d.equip }, chicken: { ...base.chicken, ...d.chicken } };
      if (!this.data.home || !this.data.home.placed) this.data.home = defaultHome();
      // v1 saves began at home: they have already escaped the collapsed tunnels
      if (!(d.v >= 2)) { this.data.v = 2; this.data.flags = { ...this.data.flags, escaped: true, nugget: true }; }
      this.data.upgrades = { ...(d.upgrades || {}) };
      this.data.progress = { ...base.progress, ...(d.progress || {}) };
      this.data.progress.ms = { ...(this.data.progress.ms || {}) };
      this.data.skills = fillSkills(d.skills, this.data);
      this.invStashed = Inv.loadInventory(this, d); // old saves: pack the items into slots (core/inventory.js)
      this.pendingMs = [];
      this.applyUpgrades();
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
    this.pendingMs = [];
    this.applyUpgrades();
    this.emit('load');
  }
  wipeSave() {
    try { localStorage.removeItem(slotKey(this.slot)); } catch (e) { /* noop */ }
  }
  // ---------- save slots (core/saves.js) ----------
  /** [{ i, used, completion, gold, day, playTime, scene, fallen, saved, current }] for the 3 slots. */
  listSlots() { return listSlots(this); }
  /** Switch to slot i and load it (fresh data if empty; opts.fresh wipes it for a new game). */
  useSlot(i, opts) { return useSlot(this, i, opts); }
  /** Delete slot i's save (and its mine). */
  deleteSlot(i) { return deleteSlot(this, i); }
  /** How far this save is, 0..100 (formula in core/saves.js and docs/REMAKE.md). */
  completion() { return completionOf(this.data); }

  // ---------- gold ----------
  get gold() { return this.data.gold; }
  addGold(n, reason = '') {
    n = Math.round(n);
    this.data.gold += n;
    if (n > 0) this.data.stats.earned += n;
    this.emit('gold', { delta: n, reason });
    if (n > 0) this.checkMilestones();
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
    const until = this.data.playTime + seconds * (this.skill?.('buff') ?? 1); // Slow Simmer etc.
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
    // everything else goes in the backpack's slots: null + emit('full') when it doesn't fit
    // (opts.spill: what doesn't fit goes to the stash at home instead)
    return Inv.addToBag(this, id, opts);
  }
  /** Will n of this item fit in the backpack? */
  canAdd(id, n = 1) { return Inv.canAdd(this, id, n); }
  /** Can the mole lift n more of it (weight: core/weight.js)? */
  canLift(id, n = 1) { return Inv.canLift(this, id, n); }
  /** The backpack's load: { kg, carry, r, speed, jump, run, tier, max }. */
  bagLoad() { return Inv.bagLoad(this); }
  /** Backpack pockets unlocked (bag + upgrades + skills). */
  bagSlots() { return Inv.bagSlots(this); }
  /** { used, slots, free, full } pockets of the backpack. */
  bagFill() { return Inv.bagFill(this); }

  /** Count of an item (lots + stack). */
  count(id) {
    const it = ITEMS[id];
    if (!it) return 0;
    if (it.cat === 'furniture') return this.data.furniture[id] || 0;
    if (it.cat === 'tool' || it.cat === 'equip' || it.cat === 'blueprint' || it.cat === 'floor' || it.cat === 'wallpaper' || it.cat === 'key') return this.data.owned[id] ? 1 : 0;
    return Inv.countIn(Inv.bag(this), id);
  }
  owns(id) { return this.count(id) > 0; }

  lotsOf(id) { return Inv.lotsIn(Inv.bag(this), id); }

  /** Remove n of an item. For quality items removes the highest quality first unless lowFirst. Returns removed lots (or count). */
  removeItem(id, n = 1, { lowFirst = false } = {}) {
    const it = ITEMS[id];
    if (!it) return [];
    if (it.cat === 'furniture') {
      const have = this.data.furniture[id] || 0;
      const k = Math.min(have, n);
      this.data.furniture[id] = have - k;
      if (!this.data.furniture[id]) delete this.data.furniture[id];
      this.emit('items', { id, n: -k });
      return k;
    }
    return Inv.removeFromBag(this, id, n, { lowFirst });
  }

  removeLot(lotUid) { return Inv.removeLotFromBag(this, lotUid); }

  /** Grouped inventory view: [{id, n, avgQ, lots?}] */
  inventory(filter = () => true) {
    const out = Inv.groups(Inv.bag(this), filter);
    for (const [id, n] of Object.entries(this.data.furniture)) if (n > 0 && filter(ITEMS[id])) out.push({ id, n });
    return out;
  }

  // ---------- weapons ----------
  addWeapon(w) {
    const weapon = { uid: uid(), day: this.data.day, ...w };
    weapon.grade = gradeFor(weapon.score).g;
    weapon.name = weapon.name || weaponName(weapon);
    weapon.value = Math.round(weaponValue(weapon, ITEMS) * (this.skill?.('craft') ?? 1) * (weapon.gem ? this.skill?.('gemset') ?? 1 : 1)); // smithing skills
    Inv.addWeaponToBag(this, weapon); // a free pocket, or the stash at home when the bag is full
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
    this.checkMilestones();
    return weapon;
  }
  removeWeapon(wuid) {
    const w = Inv.removeWeaponFromBag(this, wuid);
    if (!w) return null;
    this.emit('items', { id: 'weapon', n: -1 });
    return w;
  }

  // ---------- equipment ----------
  equip(id) {
    const it = ITEMS[id];
    if (!it || !it.slot || !this.owns(id)) return false;
    // a smaller bag can't hold what's in the pockets it doesn't have
    if (it.slot === 'bag' && (it.slots ?? 6) < Inv.bagFill(this).used) return false;
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
  bagCapacity() { return Math.round(((this.equipped('bag')?.cap ?? 14) + this.upEffect('bag')) * (this.skill?.('carry') ?? 1)); }
  lightRadius() { return ((this.equipped('helmet')?.light ?? 5) + (this.hasBuff('glow') ? 2.5 : 0) + this.upEffect('lamp')) * (this.skill?.('lamp') ?? 1); }
  /** A shop price after the Haggler skills (state.buy charges this; show it on price tags). */
  buyPrice(price) { const k = this.skill?.('haggle') ?? 1; return k > 1 && price > 0 ? Math.max(1, Math.round(price / k)) : price; }

  /** Buy: handles price + extra item requirements. Returns {ok, reason} */
  buy(id, price, qty = 1) {
    const it = ITEMS[id];
    if (!it) return { ok: false, reason: 'Unknown item' };
    const total = this.buyPrice(price) * qty;
    if (it.needs) {
      for (const [nid, n] of Object.entries(it.needs)) {
        if (this.count(nid) < n * qty) return { ok: false, reason: `Needs ${n * qty}× ${ITEMS[nid].name}` };
      }
    }
    if (!this.canAfford(total)) return { ok: false, reason: 'Not enough gold' };
    if (!this.canAdd(id, qty)) return { ok: false, reason: 'No room in your backpack', full: true };
    if (it.needs) for (const [nid, n] of Object.entries(it.needs)) this.removeItem(nid, n * qty, { lowFirst: true });
    this.spend(total, 'buy');
    for (let i = 0; i < qty; i++) this.addItem(id, it.q ? { q: 100 } : {});
    if (total < price * qty) this.emit('skill', { type: 'perk', key: 'haggle', text: `Haggled <b>${price * qty - total}g</b> off`, quiet: true });
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
    // the tavern's takings come in overnight
    const inc = this.tavernIncome();
    if (inc > 0) {
      d.progress.tavern = { day: d.day, gold: inc };
      this.addGold(inc, 'tavern');
      this.emit('income', { gold: inc, day: d.day, source: 'tavern' });
    }
    this.checkMilestones();
  }

  // ---------- progression: the upgrade board (data/upgrades.js) and milestones ----------
  /** Level of an upgrade (0 = not bought). */
  upgrade(id) { return this.data.upgrades?.[id] || 0; }
  /** The upgrade's current effect value (see UPGRADES[id].effect). */
  upEffect(id) { return upgradeEffect(id, this.upgrade(id)); }
  /** Total upgrade levels bought. */
  upgradeLevels() { return Object.values(this.data.upgrades || {}).reduce((s, n) => s + n, 0); }
  /** Cost of the next level: { gold, items: {id: n} }, or null when maxed. */
  upgradeCost(id) { return upgradeCost(id, this.upgrade(id)); }
  /** Can the next level be bought? { ok, reason, cost, lock } */
  canUpgrade(id, zoneNames) {
    const u = UPGRADES[id];
    if (!u) return { ok: false, reason: 'Unknown upgrade' };
    const lock = upgradeLock(id, this, zoneNames);
    if (lock) return { ok: false, reason: lock, lock };
    const cost = this.upgradeCost(id);
    if (!cost) return { ok: false, reason: 'Maxed out', max: true };
    for (const [nid, n] of Object.entries(cost.items)) if (this.count(nid) < n) return { ok: false, reason: `Needs ${n}× ${ITEMS[nid]?.name || nid}`, cost };
    if (!this.canAfford(cost.gold)) return { ok: false, reason: 'Not enough gold', cost };
    return { ok: true, cost };
  }
  /** Buy the next level: pays gold and items, applies the effect. Returns { ok, reason, level }. */
  buyUpgrade(id) {
    const c = this.canUpgrade(id);
    if (!c.ok) return c;
    const { gold, items } = c.cost;
    for (const [nid, n] of Object.entries(items)) this.removeItem(nid, n, { lowFirst: true });
    this.spend(gold, 'upgrade');
    const level = this.upgrade(id) + 1;
    this.data.upgrades[id] = level;
    // stamina is permanent max energy (sleep and fainting read data.maxEnergy), and tops you up
    if (id === 'stamina') {
      const add = upgradeEffect('stamina', level) - upgradeEffect('stamina', level - 1);
      this.data.maxEnergy += add;
      this.restoreEnergy(add);
    }
    this.applyUpgrades();
    this.emit('upgrade', { id, level });
    this.checkMilestones();
    return { ok: true, level };
  }
  /** Keep derived bonuses (sale prices) in step with the upgrade levels. */
  applyUpgrades() {
    setFindBonus((1 + this.upEffect('appraise')) * (this.skill?.('sell') ?? 1)); // + the Trading skills
  }
  /**
   * Mining bonuses from the upgrade board. Multipliers are 1 when nothing's bought.
   * power: × pick power · rate: × pick swing interval (lower = faster) · glint: × range of the
   * hidden-ore glint · clean: × ore quality lost to scratches · blast: × blast radius · toss: ×
   * throw speed · sticky: charges stick where they hit · spare: chance a thrown charge isn't used
   * up · rest: energy/s regained standing still · nugget: Nugget's finds level · value: + fraction
   * on ore/gem prices (already inside sellPrice).
   */
  mineBonus() {
    return {
      power: this.upEffect('power'),
      rate: this.upEffect('swing'),
      glint: this.upEffect('nose'),
      clean: this.upEffect('steady'),
      blast: this.upEffect('blast'),
      toss: this.upEffect('throw'),
      sticky: this.upEffect('sticky') > 0,
      spare: this.upEffect('spare'),
      rest: this.upEffect('rest'),
      nugget: this.upEffect('nugget'),
      value: this.upEffect('appraise'),
    };
  }
  /** Gold the tavern takes in each night (paid in nextDay). */
  tavernIncome() { return Math.round(this.upEffect('tavern')); }

  /** Pay out every milestone reached (gold + items, once each). Returns the new ones. */
  checkMilestones() {
    if (this._msBusy || !this.data.progress) return [];
    this._msBusy = true;
    const got = [];
    try {
      const done = (this.data.progress.ms ||= {});
      for (const m of MILESTONES) {
        if (done[m.id] || milestoneValue(m, this) < m.at) continue;
        done[m.id] = this.data.day;
        got.push(m);
        if (m.reward?.gold) this.addGold(m.reward.gold, 'milestone');
        for (const [id, n] of Object.entries(m.reward?.items || {})) if (ITEMS[id]) this.addItem(id, { n, q: 100, spill: true });
      }
    } finally { this._msBusy = false; }
    if (got.length) {
      this.pendingMs.push(...got);
      this.emit('milestone', { list: got });
    }
    return got;
  }
  /** Milestones reached since the last call (for toasts); clears the queue. */
  takeMilestones() { const l = this.pendingMs; this.pendingMs = []; return l; }
  /** Day a milestone was reached, or 0. */
  milestone(id) { return this.data.progress?.ms?.[id] || 0; }
  unflag(k) {
    delete this.data.flags[k];
    this.dirty = true;
  }
  /**
   * Story flags: 'escaped' = dug out of the collapsed tunnels and reached Deep Town
   * (town, home and the lift are locked until then); 'nugget' = found Nugget the hen.
   */
  get escaped() { return !!this.data.flags.escaped; }
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

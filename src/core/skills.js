// Skills: XP from real activities (state 'act' events), line levels that give skill points, and
// the nodes those points stamp into the tree (data/skills.js). Everything is saved under
// state.data.skills. Other parts read the effects with state.skill(key) (see SKILL_KEYS for what
// each key does); a few effects are applied right here (perks that fire on act events) or in small
// State hooks (bag, lamp, prices, weapon value, buff time).
//
// state API (attached by attachSkills):
//   state.skill(key)              → multiplier ≥ 1 for 'mult' keys, 0..1 for 'chance', 0/1(+) for 'perk'
//   state.addSkillPoints(n, why)  → quests' reward; emits 'skill' {type:'points'}
//   state.skillLevel(line)        → line level (1..MAX_LEVEL)
//   state.skillPoints()           → unspent points
//   state.skillsDebug             → test hooks: xp, level, unlock, unlockAll, reset, points, act, force, dump
// Events: state.emit('skill', { type: 'xp'|'level'|'unlock'|'points'|'perk'|'respec', ... }).
import { SKILL_LINES, SKILL_NODES, NODE, SKILL_KEYS, XP_RULES, XP_RATE, TIER_LV, MAX_LEVEL, LINE, levelInfo, pointsForLevel, xpForLevel, nodesOf } from '../data/skills.js';
import { ITEMS } from '../data/items.js';
import { SMELTING } from '../data/weapons.js';

const LINE_IDS = SKILL_LINES.map((l) => l.id);
export const RESPEC_GOLD_PER_POINT = 30;

export function defaultSkills() {
  return {
    v: 1,
    xp: Object.fromEntries(LINE_IDS.map((id) => [id, 0])),
    lvl: Object.fromEntries(LINE_IDS.map((id) => [id, 1])),
    points: 0, // unspent
    earned: 0, // from levels
    granted: 0, // from quests and other rewards
    nodes: {}, // node id → day stamped
    seen: {}, // first-time keys ('zone:3', 'dish:soup', 'npc:rocco') for XP bonuses
    respecs: 0,
    nudge: 0, // playTime of the last "points to spend" nudge
  };
}

/** Fill a saved skills block (or build one for an old save, crediting some of its past work). */
export function fillSkills(saved, data) {
  const base = defaultSkills();
  if (!saved || typeof saved !== 'object') {
    const s = base;
    const st = data?.stats;
    // an old save: its notebook already knows a bit (generous but not the whole way)
    if (st && (st.ores || st.weapons || st.dishes || st.blocks || st.kills || st.earned)) {
      s.xp.mining = Math.min(xpForLevel(8), (st.ores || 0) * 8 + (st.pristine || 0) * 4 + (st.blocks || 0) * 0.25 + (st.blasts || 0) * 3);
      s.xp.smithing = Math.min(xpForLevel(8), (st.weapons || 0) * 45);
      s.xp.cooking = Math.min(xpForLevel(8), (st.dishes || 0) * 35);
      s.xp.combat = Math.min(xpForLevel(6), (st.kills || 0) * 12 + (st.golems || 0) * 30);
      s.xp.trading = Math.min(xpForLevel(8), Math.sqrt(st.earned || 0) * 6);
      s.xp.exploring = Math.min(xpForLevel(6), (st.trips || 0) * 25 + (data.deepest || 0) * 1.5);
      s.retro = true;
    }
    return syncLevels(s);
  }
  const s = { ...base, ...saved };
  s.xp = { ...base.xp };
  s.lvl = { ...base.lvl };
  for (const id of LINE_IDS) {
    const x = +saved.xp?.[id];
    s.xp[id] = Number.isFinite(x) && x > 0 ? x : 0;
    const L = +saved.lvl?.[id];
    s.lvl[id] = Number.isFinite(L) && L >= 1 ? Math.min(MAX_LEVEL, Math.floor(L)) : 1;
  }
  s.nodes = {};
  for (const [id, day] of Object.entries(saved.nodes || {})) if (NODE[id]) s.nodes[id] = day || 1;
  s.seen = { ...(saved.seen || {}) };
  for (const k of ['points', 'earned', 'granted', 'respecs', 'nudge']) s[k] = Number.isFinite(+saved[k]) ? Math.max(0, +saved[k]) : 0;
  return syncLevels(s);
}

/** Award points for levels the XP already reached but were never paid (old saves, new curves). */
function syncLevels(s) {
  for (const id of LINE_IDS) {
    const L = levelInfo(s.xp[id]).level;
    while ((s.lvl[id] || 1) < L) { s.lvl[id] = (s.lvl[id] || 1) + 1; const p = pointsForLevel(s.lvl[id]); s.points += p; s.earned += p; }
  }
  return s;
}

// ------------------------------------------------------------------------------- effects
function fxMap(state) {
  const s = state.data.skills;
  const c = state._skillFx;
  if (c && c.ref === s && c.rev === state._skillRev) return c.map;
  const map = {};
  for (const id of Object.keys(s?.nodes || {})) {
    const n = NODE[id];
    if (!n) continue;
    for (const [k, v] of Object.entries(n.fx)) map[k] = (map[k] || 0) + v;
  }
  state._skillFx = { ref: s, rev: state._skillRev, map };
  return map;
}

/** The value of one effect key (see the header). Unknown keys read as a neutral 1. */
export function skillValue(state, key) {
  const force = state._skillForce;
  if (force && key in force) return force[key];
  const def = SKILL_KEYS[key];
  if (!def) return 1;
  const v = fxMap(state)[key] || 0;
  if (def.kind === 'mult') return 1 + v;
  if (def.kind === 'chance') return Math.min(0.95, v);
  return v;
}

/** Sum of a key over a list of node ids (for "before → after" in the book). */
export function fxOf(ids) {
  const map = {};
  for (const id of ids) for (const [k, v] of Object.entries(NODE[id]?.fx || {})) map[k] = (map[k] || 0) + v;
  return map;
}

function touch(state) {
  state._skillRev = (state._skillRev || 0) + 1;
  state.applyUpgrades?.(); // ore & gem prices carry the 'sell' skill
  state.dirty = true;
}

// ------------------------------------------------------------------------------- levels & nodes
export const lineInfo = (state, line) => {
  const s = state.data.skills;
  const info = levelInfo(s.xp[line] || 0);
  return { ...info, xp: s.xp[line] || 0, line: LINE[line] };
};
export const has = (state, id) => !!state.data.skills.nodes[id];

/** Can this node be stamped now? { ok, code: 'done'|'barred'|'path'|'level'|'points'|'ok', reason, by? } */
export function canUnlock(state, id) {
  const n = NODE[id];
  const s = state.data.skills;
  if (!n) return { ok: false, code: 'none', reason: 'No such skill' };
  if (s.nodes[id]) return { ok: false, code: 'done', reason: 'Already stamped' };
  if (n.excl) {
    const other = SKILL_NODES.find((m) => m.excl === n.excl && m.id !== id && s.nodes[m.id]);
    if (other) return { ok: false, code: 'barred', reason: `You chose ${other.name} instead`, by: other.id };
  }
  if (n.t > 0 && n.req.length && !n.req.some((r) => s.nodes[r])) {
    return { ok: false, code: 'path', reason: 'Stamp ' + n.req.map((r) => NODE[r].name).join(' or ') + ' first' };
  }
  const need = TIER_LV[n.t] || 1;
  if ((s.lvl[n.line] || 1) < need) return { ok: false, code: 'level', reason: `Needs ${LINE[n.line].name} Lv ${need}`, need };
  if (s.points < n.cost) return { ok: false, code: 'points', reason: n.cost > 1 ? `Needs ${n.cost} skill points` : 'Needs a skill point' };
  return { ok: true, code: 'ok', reason: '' };
}

/** How a node looks: 'done' | 'ready' (stampable) | 'open' (on the path, waiting on level/points) | 'locked' | 'barred'. */
export function nodeState(state, id) {
  const c = canUnlock(state, id);
  if (c.code === 'done') return 'done';
  if (c.ok) return 'ready';
  if (c.code === 'barred') return 'barred';
  if (c.code === 'path' || c.code === 'none') return 'locked';
  return 'open';
}

export function unlock(state, id, { free = false } = {}) {
  const c = canUnlock(state, id);
  if (!c.ok && !(free && c.code !== 'done' && c.code !== 'barred')) return c;
  const n = NODE[id];
  const s = state.data.skills;
  if (!free) s.points -= n.cost;
  s.nodes[id] = state.data.day || 1;
  touch(state);
  state.emit('skill', { type: 'unlock', id, line: n.line, node: n });
  return { ok: true, code: 'ok' };
}

/** Points spent in one line. */
export function spentIn(state, line) {
  const s = state.data.skills;
  return nodesOf(line).reduce((t, n) => t + (s.nodes[n.id] ? n.cost : 0), 0);
}
export const respecCost = (state, line) => spentIn(state, line) * RESPEC_GOLD_PER_POINT;

/** Scrape a line's page clean: its points come back, for gold. */
export function respec(state, line, { free = false } = {}) {
  const pts = spentIn(state, line);
  if (!pts) return { ok: false, reason: 'Nothing stamped here yet' };
  const cost = pts * RESPEC_GOLD_PER_POINT;
  if (!free && !state.spend(cost, 'respec')) return { ok: false, reason: 'Not enough gold' };
  const s = state.data.skills;
  for (const n of nodesOf(line)) delete s.nodes[n.id];
  s.points += pts;
  s.respecs = (s.respecs || 0) + 1;
  touch(state);
  state.emit('skill', { type: 'respec', line, points: pts, gold: free ? 0 : cost });
  return { ok: true, points: pts, gold: cost };
}

/** Give XP to a line. Emits 'skill' xp (and level) events. */
export function addXp(state, line, xp, src = '') {
  const s = state.data.skills;
  if (!(xp > 0) || !LINE[line]) return 0;
  s.xp[line] = (s.xp[line] || 0) + xp;
  const info = levelInfo(s.xp[line]);
  state.emit('skill', { type: 'xp', line, xp, src, level: info.level, frac: info.frac });
  const was = s.lvl[line] || 1;
  if (info.level > was) {
    let pts = 0;
    for (let L = was + 1; L <= info.level; L++) pts += pointsForLevel(L);
    s.lvl[line] = info.level;
    s.points += pts;
    s.earned += pts;
    state.emit('skill', { type: 'level', line, level: info.level, from: was, points: pts });
  }
  return xp;
}

// ------------------------------------------------------------------------------- activities → XP + perks
function ingotOf(id) {
  if (!id) return null;
  const r = SMELTING.find((x) => x.id === id || x.out === id);
  if (r) return r.out;
  return ITEMS[id]?.cat === 'ingot' ? id : null;
}
function killXp(kind) {
  const k = String(kind || '');
  if (/golem|wyrm|rex|dino|boss|queen|king|titan/i.test(k)) return 45;
  if (/imp|wisp|puffer|spider|newt|bat|crab|slug|rock|beetle|mite/i.test(k)) return 10;
  return 8;
}

function bucket(state, type, xp) {
  const r = XP_RATE[type];
  if (!r) return xp;
  const b = (state._xpBuckets ||= {});
  const now = performance.now() / 1000;
  const cur = b[type] || { v: r.cap, t: now };
  cur.v = Math.min(r.cap, cur.v + (now - cur.t) * r.rate);
  cur.t = now;
  const got = Math.min(xp, Math.max(0, cur.v));
  cur.v -= got;
  b[type] = cur;
  return got;
}

function onAct(state, e) {
  if (!e || !e.type || !state.data.skills) return;
  const s = state.data.skills;
  const firsts = new Set();
  const k = {
    value: (id) => ITEMS[id]?.value || 0,
    ingotOf,
    killXp,
    first: (key) => {
      if (s.seen[key]) return false;
      s.seen[key] = state.data.day || 1;
      firsts.add(key);
      return true;
    },
    bonus: (line, xp) => { bonus[line] = (bonus[line] || 0) + xp; },
  };
  const bonus = {};
  const rule = XP_RULES[e.type];
  if (rule) {
    let gains = null;
    try { gains = rule(e, k); } catch (err) { console.warn('skills: xp rule', e.type, err); }
    const total = { ...bonus };
    for (const [line, raw] of Object.entries(gains || {})) {
      const xp = e.free ? raw : bucket(state, e.type, raw);
      if (xp > 0) total[line] = (total[line] || 0) + xp;
    }
    for (const [line, xp] of Object.entries(total)) if (xp > 0) addXp(state, line, xp, e.type);
  }
  perks(state, e, firsts);
}

const perk = (state, key, text, extra = {}) => state.emit('skill', { type: 'perk', key, text, ...extra });

function perks(state, e, firsts) {
  const sk = (key) => skillValue(state, key);
  const roll = (key) => { const p = sk(key); return p > 0 && Math.random() < p; };
  switch (e.type) {
    case 'cook': {
      const it = ITEMS[e.dish];
      if (it && roll('helping')) {
        state.addItem(e.dish, { q: Math.round(e.score ?? 80), spill: true });
        perk(state, 'helping', `Second helping! <b>+1 ${it.name}</b>`, { item: e.dish });
      }
      break;
    }
    case 'smelt': {
      const id = ingotOf(e.id);
      if (id && roll('thrift')) {
        const last = state.lotsOf?.(id).at(-1);
        state.addItem(id, { q: Math.round(e.q ?? last?.q ?? 80), spill: true });
        perk(state, 'thrift', `Thrifty smelter: <b>a bonus ${ITEMS[id].name}</b>`, { item: id });
      }
      break;
    }
    case 'forage': {
      const it = ITEMS[e.id];
      if (it && roll('double')) {
        state.addItem(e.id, { q: Math.round(e.q ?? 80), spill: true });
        perk(state, 'double', `Green paws: <b>another ${it.name}</b>`, { item: e.id });
      }
      break;
    }
    case 'kill':
      if (sk('hunger') > 0) { state.restoreEnergy(6); perk(state, 'hunger', 'Battle hunger: <b>+6 energy</b>', { quiet: true }); }
      break;
    case 'block':
      if (e.perfect && sk('wind') > 0) { state.restoreEnergy(4); perk(state, 'wind', 'Second wind: <b>+4 energy</b>', { quiet: true }); }
      break;
    case 'explore':
      if (sk('pathfinder') > 0 && [...firsts].some((f) => f.startsWith('zone:') || f.startsWith('biome:'))) {
        state.restoreEnergy(15);
        perk(state, 'pathfinder', 'New ground! <b>+15 energy</b>');
      }
      break;
    case 'sell': {
      const g = Math.round(e.gold || 0);
      if (g >= 100 && roll('tips')) {
        const tip = Math.max(1, Math.round(g * 0.1));
        state.addGold(tip, 'tip');
        perk(state, 'tips', `A happy customer tips you <b>${tip}g</b>`);
      }
      break;
    }
    default:
  }
}

function onDay(state) {
  // Game.sleep() clears buffs right after nextDay(): wait until it's done
  queueMicrotask(() => {
    if (skillValue(state, 'sleeper') > 0) {
      state.addBuff('lucky', 600);
      perk(state, 'sleeper', 'Light sleeper: you wake up with a <b>Lucky Nose</b>');
    }
    const lv = skillValue(state, 'interest');
    if (lv > 0) {
      const rate = lv >= 2 ? 0.015 : 0.01, cap = lv >= 2 ? 600 : 250;
      const g = Math.min(cap, Math.floor((state.gold || 0) * rate));
      if (g > 0) { state.addGold(g, 'interest'); perk(state, 'interest', `Savings jar: <b>+${g}g</b> interest overnight`); }
    }
  });
}

// ------------------------------------------------------------------------------- wiring
export function attachSkills(state) {
  state._skillRev = 0;
  if (!state.data.skills) state.data.skills = defaultSkills();
  state.skill = (key) => skillValue(state, key);
  state.addSkillPoints = (n = 1, reason = '') => {
    n = Math.round(n);
    if (!n) return 0;
    const s = state.data.skills;
    s.points = Math.max(0, s.points + n);
    if (n > 0) s.granted += n;
    state.emit('skill', { type: 'points', n, reason });
    return s.points;
  };
  state.skillLevel = (line) => state.data.skills?.lvl?.[line] || 1;
  state.skillPoints = () => state.data.skills?.points || 0;
  state.addSkillXp = (line, xp, src) => addXp(state, line, xp, src);

  state.on('act', (e) => { try { onAct(state, e); } catch (err) { console.warn('skills: act', err); } });
  state.on('day', () => onDay(state));
  state.on('load', () => { state._skillRev++; state._xpBuckets = {}; });

  state.skillsDebug = {
    /** Give XP to a line ('mining', ...). */
    xp: (line, n) => addXp(state, line, n, 'debug'),
    /** Jump a line to a level (gives the points on the way). */
    level: (line, L) => { const need = xpForLevel(Math.min(MAX_LEVEL, L)) - (state.data.skills.xp[line] || 0); if (need > 0) addXp(state, line, need + 0.01, 'debug'); return state.skillLevel(line); },
    /** Stamp a node (free = no points, ignores level and path). */
    unlock: (id, free = true) => unlock(state, id, { free }),
    /** Stamp every node a line can have (first of each choice). */
    unlockAll: (line) => { for (const n of SKILL_NODES) if (!line || n.line === line) unlock(state, n.id, { free: true }); return Object.keys(state.data.skills.nodes).length; },
    points: (n) => state.addSkillPoints(n, 'debug'),
    /** Emit an activity as if it happened, bypassing the XP rate caps. */
    act: (type, payload = {}) => state.emit('act', { type, ...payload, free: true }),
    /** Pretend a key has this value (for testing what reads it); force(key) clears one, force() all. */
    force: (key, v) => { if (key === undefined) state._skillForce = null; else if (v === undefined) { if (state._skillForce) delete state._skillForce[key]; } else (state._skillForce ||= {})[key] = v; state._skillRev++; },
    reset: () => { state.data.skills = defaultSkills(); touch(state); state.emit('skill', { type: 'respec', line: null, points: 0 }); },
    dump: () => {
      const s = state.data.skills;
      const fx = {};
      for (const key of Object.keys(SKILL_KEYS)) { const v = skillValue(state, key); if (v !== (SKILL_KEYS[key].kind === 'mult' ? 1 : 0)) fx[key] = +v.toFixed(3); }
      return { points: s.points, lvl: { ...s.lvl }, xp: Object.fromEntries(Object.entries(s.xp).map(([k, v]) => [k, Math.round(v)])), nodes: Object.keys(s.nodes), fx };
    },
  };
  return state;
}

export { SKILL_LINES, SKILL_NODES, NODE, SKILL_KEYS, TIER_LV, LINE, levelInfo, nodesOf };

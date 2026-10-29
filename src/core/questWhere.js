// Where does a quest step want you to go, seen from the scene you're in? One answer for the
// objective strip (distance and direction), the waypoint, the radar and the map.
//   stepGoal(view) → { scene: 'deep'|'town'|'home'|null, ...where } (what the step is about)
//   resolveTarget(game, view) → { label, sub, pos: {x,y,z} | null (meters, this scene), via,
//     depth (meters below the surface, for "go deeper" goals), sight, npc, here } | null
// via: when the goal is in another scene, the way there from here ('lift', 'town', 'home',
// 'passage'), and pos is that way's position. sight: a 'look' goal (gaze at it when close).
import { TOWN } from '../iso/townLayout.js';
import { M as TU } from '../town/units.js';
import { NPCS, ZONE_DEPTHS, ZONE_NAMES, npcName } from '../data/quests.js';

const TOWN_SIGHTS = {
  sunbeam: () => ({ x: TOWN.sun.x, y: 0.4, z: TOWN.sun.z, label: 'The sunbeam', r: 4.5 }),
  well: (sc) => sc?.well ? { x: sc.well.x, y: 0.6, z: sc.well.z, label: 'The old well', r: 4 } : null,
  tunnel: () => ({ x: TOWN.tunnel.cx, y: 1.0, z: TOWN.northFace + 0.3, label: 'The old Shaft Seven tunnel', r: 6 }),
  fountain: () => ({ x: TOWN.fountain.x, y: 0.8, z: TOWN.fountain.z, label: 'The fountain', r: 7 }),
  falls: () => ({ x: TOWN.falls.x, y: 2, z: TOWN.falls.z + 0.3, label: 'The waterfall', r: 7 }),
  notices: () => ({ x: 11.6, y: 1.3, z: 13.9, label: 'The notice board', r: 4 }),
};
const DEEP_SIGHTS = { lake: 'water', lava: 'lava', nest: 'nest' };
const SIGHT_NAMES = { lake: 'An underground lake', lava: 'A lava pool', nest: 'A creature lair', signpost: 'A lift station sign', cavein: 'A lost miner\'s remains', ruin: 'An old dungeon' };
const RUIN_NAMES = { cell: 'A monster room', crypt: 'A flooded crypt', vault: 'A Starfolk vault', fortress: 'A deep fortress' }; // ruins/dungeon.js DUNGEON_NAMES
const BURROW_NPC = { trader: 'trader', herbalist: 'herbalist', rocco: 'raccoon', outpost: 'outpost' };
const HOME_LIFT = { x: 7.3, y: 0.5, z: -3.4 }, HOME_PASSAGE = { x: 6.2, y: 0.4, z: -5.6 }, HOME_HOLE = { x: 3.7, y: 2.0, z: -1.45 }; // defaults; the home scene's questSpot() wins
/** A named spot at home: the home scene may say where (scene.questSpot(name) → {x,y,z} m), else the cave's defaults. */
const HOME_SPOTS = { hearth: { x: -3.95, y: 0.7, z: -2.75, label: 'The kitchen range', sub: 'cook here' }, forge: { x: -2.3, y: 0.9, z: -5.5, label: 'The forge and anvil', sub: 'smelt and forge here' } };
const HOME_KEYS = { lift: ['lift'], passage: ['passage', 'front'], hole: ['hole'], hearth: ['fire', 'hearth'], forge: ['anvil', 'forge'] };
function homeSpot(sc, name, def) {
  try {
    const p = sc.questSpot?.(name);
    if (p) return { x: p.x, y: p.y ?? def.y, z: p.z };
    // the home scene's named places (its debug.spots: the lift, the passage, the hole, SPOTS)
    const spots = sc.debug?.spots;
    for (const k of HOME_KEYS[name] || []) {
      const q = spots?.[k];
      if (q && (q.x ?? q.cx) !== undefined) return { x: q.x ?? q.cx, y: def.y, z: q.z ?? q.cz };
    }
  } catch (e) { /* the default */ }
  return { ...def };
}

/** What a step is about, and in which scene it happens. */
export function stepGoal(view) {
  const s = view?.step;
  if (!s) return null;
  const w = { ...(s.where || {}) };
  if (!w.npc && s.deliver) w.npc = s.deliver.to;
  if (!w.npc && s.choose) w.npc = s.choose.to;
  let scene = null;
  if (w.npc) {
    if (w.npc === 'oldstar') scene = 'home';
    else if (BURROW_NPC[w.npc]) { scene = 'deep'; w.burrow = BURROW_NPC[w.npc]; }
    else if (NPCS[w.npc]?.town) scene = 'town';
  }
  if (!scene && w.place) scene = w.place === 'home' ? 'home' : w.place === 'town' ? 'town' : 'deep';
  if (!scene && w.sight) scene = TOWN_SIGHTS[w.sight] ? 'town' : w.sight === 'hole' ? 'home' : 'deep';
  if (!scene && (w.burrow || w.ruin || w.danger || w.zone || w.biome)) scene = 'deep';
  const types = (Array.isArray(s.on) ? s.on : s.on ? [s.on] : []).map((m) => m.type);
  if (types.includes('cook')) w.spot = 'hearth';
  else if (types.some((t) => t === 'forge' || t === 'smelt' || t === 'part')) w.spot = 'forge';
  if (!scene) {
    // no place named: the mine is where most things are done
    if (types.some((t) => ['dig', 'ore', 'gem', 'forage', 'kill', 'explore', 'nest', 'blast', 'relic', 'puzzle', 'block'].includes(t))) scene = 'deep';
    else if (types.some((t) => ['forge', 'smelt', 'cook', 'part'].includes(t))) scene = 'home';
  }
  return { scene, ...w };
}

const sceneKind = (name) => (name === 'deep' || name === 'mine' ? 'deep' : name === 'town' ? 'town' : name === 'home' ? 'home' : null);

/** Nearest of a list to p (y counts double: floors matter). */
function nearest(list, p) {
  let best = null, bd = Infinity;
  for (const r of list) { const d = Math.hypot(r.x - p.x, (r.y - p.y) * 2, r.z - p.z); if (d < bd) { bd = d; best = r; } }
  return best;
}

/** The lost miners' remains in the dungeons (where Hobb's pages are; the quests' old 'cavein' sights). */
export function caveIns(plan) {
  return plan.remains || [];
}
/** The lift stations' name signs (the quests' old 'signpost' sights). */
function trailEnds(plan) {
  return plan.signs || [];
}

/** In the mine: the position of a deep goal (or null), in plan meters. */
function deepPos(game, sc, g, me) {
  const plan = sc.world?.plan;
  if (!plan) return null;
  if (g.burrow) { const b = (plan.burrows || []).find((x) => x.id === g.burrow || x.kind === g.burrow); return b ? { x: b.x, y: b.y + 1, z: b.z, label: npcName(Object.keys(BURROW_NPC).find((k) => BURROW_NPC[k] === b.kind) || b.kind), sub: NPCS[Object.keys(BURROW_NPC).find((k) => BURROW_NPC[k] === b.kind)]?.where } : null; }
  if (g.place === 'dig' && plan.prologue) return { ...plan.prologue, label: "Old Star's dig" };
  if (g.ruin) {
    const save = game.state.data.deep?.ruins || {};
    let list = (plan.ruins || []).filter((r) => g.ruin === 'nearest' || r.kind === g.ruin || r.id === g.ruin);
    const open = list.filter((r) => !save[r.id]?.chest);
    if (open.length) list = open;
    const r = nearest(list, me);
    return r ? { x: r.x, y: r.y + 1, z: r.z, label: RUIN_NAMES[r.kind] || 'An old dungeon', sub: save[r.id]?.seen ? 'You\'ve been here' : 'Somewhere about here' } : null;
  }
  if (g.danger || DEEP_SIGHTS[g.sight]) {
    const kind = g.danger || DEEP_SIGHTS[g.sight];
    const d = nearest((plan.dangers || []).filter((x) => x.kind === kind), me);
    return d ? { x: d.x, y: d.y, z: d.z, r: (d.r || 4) + 5, label: SIGHT_NAMES[g.sight] || 'A creature lair' } : null;
  }
  if (g.sight === 'cavein') { const c = nearest(caveIns(plan), me); return c ? { ...c, r: 2.2, label: SIGHT_NAMES.cavein } : null; }
  if (g.sight === 'signpost') { const c = nearest(trailEnds(plan), me); return c ? { ...c, r: 3, label: SIGHT_NAMES.signpost } : null; }
  if (g.place === 'town') return { x: plan.town.x, y: plan.town.y + 1, z: plan.town.z, label: 'Deep Town', sub: 'The town gate' };
  if (g.place === 'home') return { x: (sc.W || 10) / 2, y: 1, z: (sc.D || 8) / 2, label: "Old Star's", sub: 'Home (or ring any lift\'s bell)' };
  return null;
}

export function resolveTarget(game, view) {
  const g = stepGoal(view);
  if (!g) return null;
  const sc = game.scene, here = sceneKind(game.sceneName);
  const out = { goal: g, label: '', sub: '', pos: null, via: null, depth: null, sight: g.sight || null, npc: g.npc || null, here: g.scene === here };
  if (g.zone) { out.depth = ZONE_DEPTHS[g.zone - 1] + 1; out.label = ZONE_NAMES[g.zone]; out.sub = `${ZONE_DEPTHS[g.zone - 1]} m down`; }
  if (g.npc) { out.label = npcName(g.npc); out.sub = NPCS[g.npc]?.where || ''; }
  if (!here) {
    // the forge, the kitchen, menus: words only
    out.sub = g.scene === 'town' ? 'In Deep Town' : g.scene === 'home' ? "At Old Star's" : g.scene === 'deep' ? 'In the mine' : out.sub;
    return out;
  }
  const me = here === 'deep' ? sc.player?.pos : sc.rig?.player?.pos;
  if (!me) return out;
  if (g.scene === here || (!g.scene && here === 'deep')) {
    if (here === 'deep') {
      const p = deepPos(game, sc, g, me);
      if (p) { out.pos = p; out.label ||= p.label; out.sub ||= p.sub || ''; out.r = p.r; }
      else if (g.zone) out.label = ZONE_NAMES[g.zone];
    } else if (here === 'town') {
      if (g.npc) { const p = sc.questNpcPos?.(g.npc); if (p) out.pos = p; }
      else if (TOWN_SIGHTS[g.sight]) { const p = TOWN_SIGHTS[g.sight](sc); if (p) { out.pos = { x: p.x * TU, y: p.y * TU, z: p.z * TU }; out.r = p.r * TU; out.label = p.label; } }
    } else if (here === 'home') {
      if (g.npc === 'oldstar' && sc.star?.pos) { const s = sc.star.pos; out.pos = { x: s.x, y: s.y + 1, z: s.z }; out.label = 'Old Star'; }
      else if (g.sight === 'hole') { out.pos = homeSpot(sc, 'hole', HOME_HOLE); out.r = 3; out.label = 'The hole in the roof'; }
      else if (g.spot && HOME_SPOTS[g.spot]) { const d = HOME_SPOTS[g.spot]; out.pos = homeSpot(sc, g.spot, d); out.r = 1.6; out.label = d.label; out.sub = d.sub; }
      else if (g.place === 'home') { out.label = out.label || "Old Star's"; out.sub = out.sub || ''; }
    }
    return out;
  }
  // the goal is elsewhere: point at the way there ("Hazel · Deep Town, the town gate")
  const what = out.label;
  const say = (region, how) => { out.label = what && what !== region ? what : region; out.sub = what && what !== region ? `${region}: ${how}` : how; };
  if (here === 'deep') {
    const plan = sc.world?.plan;
    if (!plan) return out;
    if (g.scene === 'town') { out.via = 'town'; out.pos = { x: plan.town.x, y: plan.town.y + 1, z: plan.town.z }; say('Deep Town', 'the town gate'); }
    else if (g.scene === 'home') { out.via = 'home'; out.pos = { x: (sc.W || 10) / 2, y: 1, z: (sc.D || 8) / 2 }; say("Old Star's", 'home, or ring any lift\'s bell'); }
  } else if (here === 'town') {
    if (g.scene === 'deep') { const c = TOWN.lift.cage; out.via = 'lift'; out.pos = { x: c.x * TU, y: 1, z: c.z * TU }; say('The mine', 'take the town lift down'); }
    else if (g.scene === 'home') { const d = TOWN.home.door; out.via = 'home'; out.pos = { x: d.x * TU, y: 1, z: d.z * TU }; say("Old Star's", 'home through your burrow door'); }
  } else if (here === 'home') {
    if (g.scene === 'deep') { out.via = 'lift'; out.pos = homeSpot(sc, 'lift', HOME_LIFT); say('The mine', 'ride the cage lift down'); }
    else if (g.scene === 'town') { out.via = 'passage'; out.pos = homeSpot(sc, 'passage', HOME_PASSAGE); say('Deep Town', 'out through the front door'); }
  }
  return out;
}

/** Distance and heading from the player to a resolved target (meters, radians; dy > 0 = above). */
export function bearing(game, t) {
  if (!t?.pos) return null;
  const sc = game.scene, here = sceneKind(game.sceneName);
  const pl = here === 'deep' ? sc.player : sc.rig?.player;
  if (!pl?.pos) return null;
  const dx = t.pos.x - pl.pos.x, dz = t.pos.z - pl.pos.z, dy = t.pos.y - (pl.pos.y + 0.8);
  const yaw = pl.yaw || 0;
  // relative to where you face (0 = straight ahead, + = to the right); camera yaw: forward (-sin, -cos)
  const ahead = -dx * Math.sin(yaw) - dz * Math.cos(yaw), right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  return { dist: Math.hypot(dx, dz), dy, rel: Math.atan2(right, ahead), d3: Math.hypot(dx, dy, dz) };
}

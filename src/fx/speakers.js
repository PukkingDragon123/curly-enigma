// Who is talking, in 3D: finds a speaker's real model in the scene that's running and wraps it in one
// small interface the cutscene talk (src/ui/Convo.js) and the camera director (src/fx/director.js)
// use, whatever kind of character it is (Old Star at home or in his dig, Deep Town's folk and
// keepers, the burrow keepers and Rocco, or any rig a caller hands over).
//   findSpeaker(game, who) → Speaker | null
//   who: 'oldstar' | 'rocco' | 'trader' | 'herbalist' | 'outpost' | a Deep Town shop id (tools grocer
//        furniture blueprints outfitter assay ticket lift) | a villager id or a name ('Hazel',
//        'Granny Mabel', 'Old Star', 'Barnaby Burr') | an object: a Speaker, an Actor, Old Star,
//        a burrow Folk, a town folk record ({ a: Actor }), or anything with a `rig` (CharacterRig)
//        (optionally with `head(out)` / `headWorld(out)`, `name`, `voice`).
// Speaker: { key, name, rig, obj, cast (portrait3d cast: name, voice), eyes(out), top(out), feet(out),
//   height, turnTo(x, z), lookAt(v | null), hold(on), talk(on | secs), face(mood, secs), gesture(kind) }
// Everything is in world meters (the town's root is scaled: the rig's own matrices take care of it).
import * as THREE from 'three';
import { portrait3d } from '../gfx/portrait3d.js';
import { NPC_ALIAS } from '../data/quests.js';
import { SHOPS } from '../data/shops.js';

const _a = new THREE.Vector3(), _t = new THREE.Vector3(), _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3();
const low = (s) => String(s || '').trim().toLowerCase();

/** tutor moods → rig expressions (the rigs know most by name; these are the odd ones). */
const MOOD_EXPR = { calm: 'neutral', proud: 'smug', stern: 'angry', laugh: 'laugh' };
export const exprOf = (mood) => MOOD_EXPR[mood] || mood || 'neutral';

/** Wrap a CharacterRig-based character. o: { key, name, who (portrait cast), obj, head(out), turnTo, hold, release } */
export function rigSpeaker(rig, o = {}) {
  if (!rig) return null;
  const cast = portrait3d.cast(o.who ?? o.key ?? o.name) || null;
  const root = o.obj || rig.root;
  const sp = {
    key: o.key || cast?.key || o.name || 'someone',
    name: o.name || cast?.name || 'Someone',
    rig, obj: root, cast, voice: o.voice || cast?.voice || null,
    /** Between the eyes (world meters). */
    eyes(out = new THREE.Vector3()) {
      if (rig.neck && rig.anchors?.eyes) { rig.root.updateMatrixWorld(true); return rig.neck.localToWorld(out.copy(rig.anchors.eyes)); }
      if (o.head) return o.head(out).add(_t.set(0, -0.12, 0));
      return root.getWorldPosition(out).add(_t.set(0, (rig.height || 0.8) * 0.85, 0));
    },
    /** Just over the top of the head. */
    top(out = new THREE.Vector3()) {
      if (o.head) return o.head(out);
      if (rig.neck && rig.anchors?.headTop) { rig.root.updateMatrixWorld(true); return rig.neck.localToWorld(out.copy(rig.anchors.headTop)); }
      return root.getWorldPosition(out).add(_t.set(0, rig.height || 0.8, 0));
    },
    /** Where they stand (the ground under them). */
    feet(out = new THREE.Vector3()) { return (o.feet ? o.feet(out) : rig.root.getWorldPosition(out)); },
    get height() { const t = sp.top(_h1).y, f = sp.feet(_h2).y; return Math.max(0.35, Math.min(1.6, t - f)); },
    /** Turn the body toward a world point. */
    turnTo(x, z) {
      if (o.turnTo) return o.turnTo(x, z);
      const f = sp.feet(_a);
      rig.face?.(Math.atan2(x - f.x, z - f.z));
    },
    lookAt(v) { if (o.lookAt) o.lookAt(v); else rig.lookAt?.(v || null); },
    hold(on) { o.hold?.(on); },
    talk(on) { rig.talk?.(on); },
    face(mood, secs = 2.6) { if (mood) { try { rig.setExpression?.(exprOf(mood), { hold: secs }); } catch (e) { /* older rig */ } } },
    gesture(kind) {
      if (!kind) return;
      if (o.gesture && o.gesture(kind)) return;
      if (['nod', 'shake', 'hop', 'wave'].includes(kind)) rig.doEmote?.(kind, kind === 'wave' ? 1.1 : 0.9);
      else if (kind === 'cheer' || kind === 'laugh' || kind === 'point') { rig.play?.(kind === 'point' ? 'wave' : kind); setTimeout(() => { if (rig.state === kind || rig.state === 'wave') rig.play?.('idle'); }, 1300); }
    },
  };
  return sp;
}

// ------------------------------------------------------------------ per scene
function homeStar(scene) {
  const star = scene?.star;
  if (!star?.rig) return null;
  return rigSpeaker(star.rig, {
    key: 'oldstar', who: 'oldstar', name: 'Old Star', obj: star.obj,
    head: star.mode === 'sleep' ? null : undefined,
    feet: (out) => out.copy(star.pos),
    turnTo: (x, z) => { if (!star.busyPose?.() && !star.scripted) star.faceTo(x, z); },
    hold: (on) => { if (on && !star.scripted) { star.pauseT = Math.max(star.pauseT || 0, 3); if (star.mode === 'walk') star.attend?.(); } },
    gesture: (k) => { if (k === 'point' || k === 'wave' || k === 'cheer') { star.gesture?.(k, 1.6); return true; } return false; },
  });
}

function digStar(scene) {
  const st = scene?.prologue?.star;
  if (!st?.rig) return null;
  return rigSpeaker(st.rig, { key: 'oldstar', who: 'oldstar', name: 'Old Star', obj: st.root, feet: (out) => out.copy(st.pos), turnTo: () => {} });
}

function townPerson(scene, rec, npc) {
  const a = rec.a, f = rec.f, k = rec.k;
  const name = f?.name || k?.spec?.name || a.name;
  const who = k ? k.id : (npc || name);
  return rigSpeaker(a.rig, {
    key: npc || who, who, name, obj: a.obj,
    voice: npc || k ? null : { f: a.voice || 300, type: (a.voice || 300) > 340 ? 'triangle' : 'square', q: 1.5 },
    feet: (out) => { a.obj.updateMatrixWorld(true); return a.obj.getWorldPosition(out); },
    turnTo: (x, z) => { if (f?.seated || f?.sleeping) return; const p = a.obj.getWorldPosition(_a); a.rig.face(Math.atan2(x - p.x, z - p.z)); },
    lookAt: (v) => { a.rig.lookAt(v || null); if (f) f.lookHold = 2; },
    hold: (on) => { if (!on) return; if (f) { f.pause = Math.max(f.pause || 0, 1.5); f.lookHold = Math.max(f.lookHold || 0, 1.5); } if (k) { k.cool = Math.max(k.cool || 0, 10); } },
  });
}

function townFind(scene, who) {
  const tq = scene?.townQuests;
  const n = low(who);
  const id = NPC_ALIAS[n] || n;
  if (tq?.byNpc?.has(id)) return townPerson(scene, tq.byNpc.get(id), id);
  for (const k of scene?.keepers || []) if (k.id === id || low(k.spec?.name) === n) return townPerson(scene, { a: k.a, k }, k.id);
  for (const f of scene?.folk?.list || []) if (low(f.name) === n || f.npcId === id) return townPerson(scene, { a: f.a, f }, f.npcId || null);
  return null;
}

function burrowFind(scene, who) {
  const T = scene?.traders;
  if (!T?.burrows) return null;
  const n = low(who);
  const id = NPC_ALIAS[n] || n;
  for (const b of T.burrows) {
    const folk = b.built?.folk;
    if (!folk || folk.disposed) continue;
    const sh = SHOPS[b.shopId];
    if (b.shopId === id || b.kind === n || folk.npc === id || low(sh?.keeper?.name) === n) return burrowSpeaker(folk, b.shopId);
  }
  return null;
}

/** A burrow keeper (src/deep/traders/folk.js). */
export function burrowSpeaker(folk, shopId = folk.shopId) {
  return rigSpeaker(folk.rig, {
    key: shopId, who: shopId, name: folk.name, obj: folk.rig.root,
    head: (out) => folk.headWorld(out),
    feet: (out) => out.copy(folk.pos),
    turnTo: () => {}, // they turn to you by themselves while busy
    hold: (on) => { folk.busy = !!on; },
  });
}

/** The speaker for `who` in the scene that's running, or null (no 3D model of them here). */
export function findSpeaker(game, who) {
  if (!who) return null;
  if (typeof who === 'object') {
    if (who.eyes && who.rig && who.turnTo) return who; // already a Speaker
    if (who.built?.folk) return burrowSpeaker(who.built.folk, who.shopId);
    if (who.shopId && who.rig && who.headWorld) return burrowSpeaker(who);
    if (who.a?.rig) return townPerson(game.scene, who, who.npcId || who.id || null);
    if (who.rig && who.faceToward) return townPerson(game.scene, { a: who }, null);
    if (who.rig) return rigSpeaker(who.rig, { key: who.key || who.name, name: who.name, who: who.who || who.name, obj: who.root || who.obj, head: who.head ? (o) => who.head(o) : who.headWorld ? (o) => who.headWorld(o) : null, feet: who.pos ? (o) => o.copy(who.pos) : null });
    return null;
  }
  const s = game.scene;
  const n = low(who), id = NPC_ALIAS[n] || n;
  if (id === 'oldstar' || n === 'old star') return homeStar(s) || digStar(s);
  if (game.sceneName === 'town') return townFind(s, who);
  if (game.sceneName === 'deep' || game.sceneName === 'mine') return burrowFind(s, who);
  return null;
}

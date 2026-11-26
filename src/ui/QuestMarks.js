// Quest markers in the world (ticked by the objective strip, src/ui/Tracker.js):
// - over people's heads: a little rolled poster (they have a quest to hand you: talk to them), a
//   note with a tick (the pinned quest: hand it in, tell them, decide), the poster in grey (the
//   pinned quest is theirs, under way). Hand-drawn pixel maps that bob a little; a faint ghost of
//   them shows through walls. Only the pinned quest gets markers and a waypoint (wave 19). Who stands where comes from the scene:
//   scene.questAnchors() → [{ npc, head(out) }] (the town: src/town/quests.js); at home Old Star
//   (scene.star), in the mine the burrow keepers (scene.traders).
// - the waypoint: a brass diamond on the tracked objective's spot with the distance (and ▲ ▼ when
//   it's above or below you), clamped to the screen edge with an arrow when it's off screen.
// - "take a good look" goals (look steps): stand near it and look at it; an eye fills up, then
//   act { type: 'look', at } (src/core/questWhere.js finds the spot).
// - the radar: radarMark() → { kind: 'quest', x, y, z, label } for src/ui/Radar.js.
import * as THREE from 'three';
import { el } from '../core/util.js';
import { resolveTarget, bearing } from '../core/questWhere.js';
import { BART } from './bookArt.js';
import { Px, art } from './uiArt.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _w = new THREE.Vector3();
const GAZE_T = 1.3;
const BURROW_NPC = { trader: 'trader', herbalist: 'herbalist', rocco: 'rocco', outpost: 'outpost' };

// ------------------------------------------------------------ marker art (hand-drawn pixel maps)
// Over a head: a little rolled poster tied with a red ribbon (they have a quest to hand you), a
// note with a tick (yours to hand in or tell them; the pinned quest's only), the rolled poster in
// grey (the pinned quest is theirs, under way). One character per pixel, no glow.
const ROLL = [
  '  xxxxx  ',
  ' xhhhpqx ',
  'xhhpppqqx',
  'xhpppppqx',
  'xxhpppqxx',
  ' xhpppqx ',
  ' xaaaaAx ',
  ' xhpppqx ',
  ' xhpppqx ',
  'xxhpppqxx',
  'xhpppppqx',
  'xhqqqqqrx',
  ' xxxxxxx ',
  '  aA aA  ',
  ' aA   aA ',
];
const NOTE = [
  'xxxxxxx  ',
  'xhhhhhxx ',
  'xhppppqhx',
  'xhppppaqx',
  'xhpppaaqx',
  'xhapaapqx',
  'xhaaapqqx',
  'xhpappqqx',
  'xhpppqqrx',
  'xqqqqqrrx',
  'xxxxxxxxx',
];
const WARM = { x: 0x3a1e0c, h: 0xf6e6c0, p: 0xe8d2a4, q: 0xc8a878, r: 0xa6845e, a: 0xb0402c, A: 0x6a1a10 };
const GREY = { x: 0x3a342e, h: 0xd8d2c8, p: 0xb8b2a8, q: 0x8a847c, r: 0x726c64, a: 0x6a6058, A: 0x4a423c };
/** A head marker as a data URL (one art pixel per --px): '!' work to hand you, '?' yours to hand in,
 *  '…' theirs, under way. */
export function markerURL(kind) {
  return art('qm:head:' + kind, () => {
    const rows = kind === '?' ? NOTE : ROLL, pal = kind === '…' ? GREY : WARM;
    const p = new Px(rows[0].length, rows.length);
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) { const c = pal[rows[y][x]]; if (c !== undefined) p.set(x, y, c); }
    return p;
  }, { res: 1 });
}

/**
 * A marker over somebody's head, drawn in the HUD (crisp pixels, never bloomed or blurred by the 3D
 * post pass), placed over the head each frame with a little bob, fading with distance.
 */
class HeadMark {
  constructor(host) {
    this.el = el('img', { class: 'pix qm-head', alt: '', hidden: true, 'aria-hidden': 'true' });
    host.append(this.el);
    this.kind = null;
    this.t = Math.random() * 6;
  }
  set(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    if (!kind) { this.el.hidden = true; return; }
    this.el.src = markerURL(kind);
    this.el.classList.toggle('note', kind === '?');
    this.el.classList.remove('pop'); void this.el.offsetWidth; this.el.classList.add('pop');
  }
  place(sc, p, dt, camPos) {
    this.t += dt;
    const s = sc.toScreen ? sc.toScreen(p) : null;
    const d = camPos ? camPos.distanceTo(p) : 5;
    if (!s?.visible || d > 26) { this.el.hidden = true; return; }
    const P = pxSize(), bob = Math.round(Math.sin(this.t * 2.6) * 1.2) * P;
    const w = this.el.offsetWidth || P * 9, h = this.el.offsetHeight || P * 15;
    const x = Math.round((s.x - w / 2) / P) * P, y = Math.round((s.y - h) / P) * P + bob;
    this.el.hidden = false;
    this.el.style.transform = `translate(${x}px, ${y}px)`;
    this.el.style.opacity = d > 14 ? Math.max(0.35, 1 - (d - 14) / 14).toFixed(2) : '';
  }
  hide() { this.el.hidden = true; }
  dispose() { this.el.remove(); }
}
let _px = 0, _pxT = -1e9;
const pxSize = () => { const now = performance.now(); if (now - _pxT > 1000) { _pxT = now; _px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3; } return _px; };

// ------------------------------------------------------------ the manager
export class QuestMarks {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.marks = new Map(); // npc → HeadMark
    this.sceneRef = null;
    this.anchorT = 0;
    this.anchors = [];
    this.targetT = 0;
    this.target = null;
    this.gaze = { key: null, t: 0 };
    // the waypoint and the gaze eye
    this.wayIcon = el('img', { class: 'pix qm-way-ic', src: BART.pin('quest'), alt: '' });
    this.wayTxt = el('span', { class: 'qm-way-d' });
    this.wayArrow = el('i', { class: 'qm-way-arrow' });
    this.way = el('div', { class: 'qm-way', hidden: true, 'aria-hidden': 'true' }, [this.wayArrow, this.wayIcon, this.wayTxt]);
    this.eyeRing = el('i', { class: 'qm-eye-ring' });
    this.eye = el('div', { class: 'qm-eye', hidden: true }, [this.eyeRing, el('img', { class: 'pix', src: BART.eye(), alt: '' }), el('span', { class: 'qm-eye-t' }, 'Taking a good look…')]);
    ui.hud.append(this.way, this.eye);
  }

  // ------------------------------------------------------------ anchors
  sceneAnchors() {
    const g = this.game, sc = g.scene;
    if (!sc) return [];
    if (typeof sc.questAnchors === 'function') { try { return sc.questAnchors() || []; } catch (e) { return []; } }
    const out = [];
    if (sc.star?.rig && g.sceneName === 'home') {
      const star = sc.star;
      out.push({ npc: 'oldstar', head: (o) => (star.head ? o.copy(star.head(o)) : o.set(star.pos.x, (star.headY ?? star.pos.y + 0.9), star.pos.z)).add(_w.set(0, 0.14, 0)) });
    }
    for (const b of sc.traders?.burrows || []) {
      const f = b.built?.folk;
      if (!f?.headWorld) continue;
      const npc = BURROW_NPC[b.shopId] || b.shopId;
      out.push({ npc, head: (o) => f.headWorld(o).add(_w.set(0, 0.1, 0)) });
    }
    return out;
  }

  update(dt) {
    const g = this.game, Q = g.quests, sc = g.scene;
    if (!Q || !sc) return;
    // a new scene: markers belong to the old one
    if (sc !== this.sceneRef) { this.clear(); this.sceneRef = sc; this.anchorT = 0; this.target = null; }
    const three = sc.scene, cam = sc.camera;
    const live = g.ui.hudMode === 'deep' && three?.isScene && cam;
    if (!live) { this.way.hidden = true; this.eye.hidden = true; for (const m of this.marks.values()) m.hide(); return; }
    this.anchorT -= dt;
    if (this.anchorT <= 0) {
      this.anchorT = 0.4;
      this.anchors = this.sceneAnchors();
      const seen = new Set();
      for (const a of this.anchors) {
        seen.add(a.npc);
        let kind = Q.markerFor(a.npc);
        // not messy: hand-ins and "under way" only for the pinned quest; quests to hand out always
        if (kind && kind !== '!' && !this.pinnedWith(a.npc)) kind = Q.offers(a.npc).length || Q.followUp?.(a.npc) ? '!' : null;
        let m = this.marks.get(a.npc);
        if (!m && kind) { m = new HeadMark(this.ui.hud); this.marks.set(a.npc, m); }
        m?.set(kind);
        if (m) m.anchor = a;
      }
      for (const [npc, m] of this.marks) if (!seen.has(npc)) { m.dispose(); this.marks.delete(npc); }
    }
    const camPos = cam.getWorldPosition(_f);
    const hideAll = !!(g.ui.tracker?.muted || g.ui.focus || sc.cut || sc.locked && g.sceneName !== 'town' || sc.hideQuestMarks);
    const shut = hideAll || g.ui.isPanelOpen();
    for (const m of this.marks.values()) {
      if (!m.kind || !m.anchor || shut) { m.hide(); continue; }
      try { m.place(sc, m.anchor.head(_v), dt, camPos); } catch (e) { m.set(null); }
    }
    this.updateTarget(dt);
    this.updateWaypoint();
    this.updateGaze(dt);
  }

  /** Is this npc part of the pinned quest (its giver, or the one its current step sends you to)? */
  pinnedWith(npc) {
    const Q = this.game.quests, id = Q?.data?.tracked;
    if (!id) return false;
    return Q.stepsFor(npc).some((m) => m.id === id);
  }

  clear() {
    for (const m of this.marks.values()) m.dispose();
    this.marks.clear();
    this.way.hidden = true;
    this.eye.hidden = true;
    this.gaze = { key: null, t: 0 };
  }

  // ------------------------------------------------------------ the tracked objective
  updateTarget(dt) {
    this.targetT -= dt;
    if (this.targetT > 0) return;
    this.targetT = 0.25;
    const Q = this.game.quests, v = Q.tracked();
    this.target = v ? resolveTarget(this.game, v) : null;
    if (this.target) this.target.quest = v;
    // the pinned quest's "take a good look" goal, in this scene
    this.gazeGoals = [];
    for (const q of v ? [v] : []) {
      const s = q.step;
      const at = s?.look || (Array.isArray(s?.on) ? s.on : s?.on ? [s.on] : []).find((m) => m.type === 'look' && typeof m.at === 'string')?.at;
      if (!at || at === 'signpost' || at === 'cavein') continue; // those are read with E
      const t = q.id === v?.id ? this.target : resolveTarget(this.game, q);
      if (t?.here && t.pos) this.gazeGoals.push({ id: q.id, at, t });
    }
  }
  /** Distance and direction to the tracked objective (for the strip). */
  bearing() { return this.target ? { t: this.target, b: bearing(this.game, this.target) } : null; }

  radarMark() {
    const t = this.target;
    if (!t?.pos || !(this.game.sceneName === 'deep' || this.game.sceneName === 'mine')) return null;
    return { kind: 'quest', x: t.pos.x, y: t.pos.y, z: t.pos.z, label: t.label || 'Quest' };
  }

  updateWaypoint() {
    const g = this.game, ui = g.ui, t = this.target, sc = g.scene;
    const hide = !t?.pos || ui.isPanelOpen() || ui.focus || ui.tracker?.muted || ui.root.classList.contains('no-touch') || this.gaze.t > 0;
    if (hide) { this.way.hidden = true; return; }
    const b = bearing(g, t);
    if (!b || b.d3 < (t.r ? Math.min(2.5, t.r * 0.5) : 2.2)) { this.way.hidden = true; return; }
    const cam = sc.camera, e = g.engine;
    _v.set(t.pos.x, t.pos.y, t.pos.z);
    const p = _v.clone().project(cam);
    const W = e.width * e.scale, H = e.height * e.scale;
    const behind = p.z > 1 || p.z < -1;
    let x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
    if (behind) { x = W - x; y = H - y; }
    const m = 56, onScreen = !behind && x > m && x < W - m && y > m && y < H - m;
    // somebody with a marker over their head close by: the marker says enough
    if (onScreen && t.npc && b.d3 < 16 && this.marks.get(t.npc)?.kind) { this.way.hidden = true; return; }
    let ang = null;
    if (!onScreen) {
      // clamp to the edge, along the direction from the centre
      const cx = W / 2, cy = H / 2;
      let dx = x - cx, dy = y - cy;
      if (behind || Math.abs(dx) + Math.abs(dy) < 1) { dx = Math.sin(b.rel) * 100; dy = -Math.cos(b.rel) * 100; if (Math.abs(b.rel) > Math.PI / 2) dy = Math.abs(dy); }
      const s = Math.min((cx - m) / Math.max(1e-3, Math.abs(dx)), (cy - m) / Math.max(1e-3, Math.abs(dy)));
      x = cx + dx * s; y = cy + dy * s;
      ang = Math.atan2(dy, dx);
    }
    this.way.hidden = false;
    this.way.classList.toggle('edge', !onScreen);
    this.way.classList.toggle('via', !!t.via);
    this.way.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.wayArrow.style.transform = ang === null ? '' : `rotate(${ang}rad)`;
    const dyT = Math.abs(b.dy) > 3 && (g.sceneName === 'deep' || g.sceneName === 'mine') ? (b.dy > 0 ? ' ▲' : ' ▼') : '';
    const txt = `${Math.round(b.dist < 1 ? b.d3 : b.dist)} m${dyT}`;
    if (this.wayTxt.textContent !== txt) this.wayTxt.textContent = txt;
  }

  // ------------------------------------------------------------ "take a good look"
  updateGaze(dt) {
    const g = this.game, sc = g.scene;
    if (g.ui.isPanelOpen()) { this.eye.hidden = true; return; }
    let best = null;
    for (const gg of this.gazeGoals || []) {
      const t = gg.t, b = bearing(g, t);
      if (!b || b.d3 > (t.r || 6)) continue;
      const cam = sc.camera;
      cam.getWorldDirection(_f);
      _w.set(t.pos.x, t.pos.y, t.pos.z).sub(cam.getWorldPosition(_v)).normalize();
      if (_f.dot(_w) < 0.88) continue;
      best = { key: gg.id + ':' + gg.at, at: gg.at, label: t.label };
      break;
    }
    if (!best) { this.gaze.t = Math.max(0, this.gaze.t - dt * 2); if (this.gaze.t <= 0) { this.eye.hidden = true; this.gaze.key = null; } else this.setEye(); return; }
    if (best.key !== this.gaze.key) this.gaze = { key: best.key, t: 0 };
    this.gaze.t += dt;
    this.eye.hidden = false;
    this.setEye();
    if (this.gaze.t >= GAZE_T) {
      this.gaze = { key: null, t: 0 };
      this.eye.hidden = true;
      g.audio.play('sparkle', { vol: 0.5 });
      g.state.emit('act', { type: 'look', at: best.at });
      g.ui.toast(`Noted: <b>${best.label || best.at}</b>`, { icon: BART.eye(), dur: 2200 });
    }
  }
  setEye() { this.eyeRing.style.setProperty('--k', Math.min(1, this.gaze.t / GAZE_T).toFixed(3)); }
}


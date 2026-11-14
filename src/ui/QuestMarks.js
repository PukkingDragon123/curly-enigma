// Quest markers in the world (ticked by the objective strip, src/ui/Tracker.js):
// - over people's heads: a chunky gold "!" (they have work for you), a gold "?" (hand it in, tell
//   them, decide), a grey "?" (their request is under way). Pixel-art sprites that bob and spin like
//   a coin, a faint ghost of them shows through walls. Who stands where comes from the scene:
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
import { Px } from './uiArt.js';
import { RAMP, tone, paperK } from './hudArt.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _w = new THREE.Vector3();
const GAZE_T = 1.3;
const BURROW_NPC = { trader: 'trader', herbalist: 'herbalist', rocco: 'rocco', outpost: 'outpost' };

// ------------------------------------------------------------ marker art (pixel canvases)
const GLYPHS = {
  '!': ['..XXX..', '..XXX..', '..XXX..', '..XXX..', '..XXX..', '..XXX..', '...X...', '.......', '..XXX..', '..XXX..'],
  '?': ['.XXXXX.', 'XXX.XXX', 'XX...XX', '.....XX', '....XXX', '...XXX.', '..XXX..', '.......', '..XXX..', '..XXX..'],
};
const COLORS = {
  gold: { ramp: RAMP.gold, ol: 0x5a2a0c, ink: 0x3a1e0c },
  grey: { ramp: [0x2a2420, 0x3e3832, 0x5a544e, 0x726c64, 0x8a847c, 0xa29c94, 0xb8b2a8, 0xd8d2c8], ol: 0x2a2420, ink: 0x3a342e },
};
/**
 * A parchment speech bubble (fibrous paper lit from the top, a darker turned-under bottom, an
 * inked rim and tail, a soft shadow) with a bevelled metal glyph: highlight up-left, shade
 * down-right, a glint.
 */
export function markerCanvas(sym, tone_) {
  const g = GLYPHS[sym], C = COLORS[tone_];
  const gw = g[0].length, gh = g.length;
  const W = gw + 9, H = gh + 10;
  const p = new Px(W, H);
  const bx0 = 1, by0 = 1, bx1 = W - 3, by1 = H - 6; // bubble box (inclusive)
  const tx = (bx0 + bx1) >> 1;
  const inBubble = (i, j) => i >= bx0 && i <= bx1 && j >= by0 && j <= by1 && !((i === bx0 || i === bx1) && (j === by0 || j === by1));
  const inTail = (i, j) => j > by1 && j <= by1 + 3 && i >= tx - (by1 + 3 - j) && i <= tx + (by1 + 3 - j) - (j > by1 + 1 ? 1 : 0);
  const inside = (i, j) => inBubble(i, j) || inTail(i, j);
  const PP = RAMP.paper;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!inside(i, j)) continue;
    let k = paperK(i, j, 71) + 0.08 - (j - by0) / (by1 - by0) * 0.12;
    if (j <= by0) k = 0.98;
    else if (j === by0 + 1 || i === bx0) k += 0.1;
    else if (j >= by1 - 1 && inBubble(i, j)) k -= 0.18;
    else if (i === bx1) k -= 0.12;
    p.set(i, j, tone(PP, k));
  }
  const ink = tone_ === 'grey' ? 0x3a342e : 0x3a1e0c;
  p.outline(ink);
  // a soft shadow down and right of the inked rim
  for (let j = H - 1; j > 0; j--) for (let i = W - 1; i > 0; i--) if (!p.a(i, j) && p.a(i - 1, j - 1) === 255) p.set(i, j, 0x140a04, 80);
  // the glyph: a dark rim round it on the paper, then bevelled metal
  const ox = 4, oy = 3;
  const on = (i, j) => g[j]?.[i] === 'X';
  for (let j = -1; j <= gh; j++) for (let i = -1; i <= gw; i++) {
    if (on(i, j)) continue;
    if (on(i + 1, j) || on(i - 1, j) || on(i, j + 1) || on(i, j - 1)) p.set(ox + i, oy + j, C.ol);
  }
  const R = C.ramp;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    if (!on(i, j)) continue;
    let k = 0.55 - j / gh * 0.15;
    if (!on(i, j - 1) || !on(i - 1, j)) k = 0.88;
    else if (!on(i, j + 1) || !on(i + 1, j)) k = 0.3;
    p.set(ox + i, oy + j, tone(R, k));
  }
  // a glint on the first lit pixel
  for (let j = 0; j < gh; j++) { const i = g[j].indexOf('X'); if (i >= 0) { p.set(ox + i, oy + j, 0xffffff); break; } }
  p.ctx.putImageData(p.img, 0, 0);
  return p.c;
}
const TEX = {};
function texFor(kind) {
  if (TEX[kind]) return TEX[kind];
  const [sym, tone_] = kind === '!' ? ['!', 'gold'] : kind === '?' ? ['?', 'gold'] : ['?', 'grey'];
  const c = markerCanvas(sym, tone_);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.aspect = c.width / c.height;
  return (TEX[kind] = t);
}

class HeadMark {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'quest-mark';
    const mk = (ghost) => {
      const m = new THREE.SpriteMaterial({ map: texFor('!'), transparent: true, depthWrite: false, depthTest: !ghost, fog: false, opacity: ghost ? 0.3 : 1, toneMapped: false });
      const s = new THREE.Sprite(m);
      s.renderOrder = ghost ? 998 : 999;
      s.center.set(0.5, 0);
      return s;
    };
    this.main = mk(false);
    this.ghost = mk(true);
    this.group.add(this.ghost, this.main);
    parent.add(this.group);
    this.kind = null;
    this.t = Math.random() * 6;
    this.pop = 0;
  }
  set(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    this.group.visible = !!kind;
    if (!kind) return;
    this.main.material.map = this.ghost.material.map = texFor(kind);
    this.main.material.needsUpdate = this.ghost.material.needsUpdate = true;
    this.pop = 1;
  }
  place(p, dt, camPos) {
    this.t += dt;
    const d = camPos ? camPos.distanceTo(p) : 5;
    const k = 0.2 * Math.max(1, Math.pow(d / 4, 0.6)) * (1 + this.pop * 0.6 * Math.sin(this.pop * Math.PI));
    this.pop = Math.max(0, this.pop - dt * 2.5);
    // a slow wobble rather than a spin: the bubble stays readable
    const sway = 1 - 0.12 * Math.abs(Math.sin(this.t * 1.3));
    this.group.position.set(p.x, p.y + 0.05 + Math.sin(this.t * 3) * 0.03 + d * 0.004, p.z);
    const asp = this.main.material.map?.userData?.aspect || 0.79;
    for (const s of [this.main, this.ghost]) { s.scale.set(k * asp * sway, k, 1); s.material.rotation = Math.sin(this.t * 1.7) * 0.08; }
  }
  dispose() { this.group.removeFromParent(); this.main.material.dispose(); this.ghost.material.dispose(); }
}

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
    if (!live) { this.way.hidden = true; this.eye.hidden = true; return; }
    this.anchorT -= dt;
    if (this.anchorT <= 0) {
      this.anchorT = 0.4;
      this.anchors = this.sceneAnchors();
      const seen = new Set();
      for (const a of this.anchors) {
        seen.add(a.npc);
        const kind = Q.markerFor(a.npc);
        let m = this.marks.get(a.npc);
        if (!m && kind) { m = new HeadMark(three); this.marks.set(a.npc, m); }
        m?.set(kind);
        if (m) m.anchor = a;
      }
      for (const [npc, m] of this.marks) if (!seen.has(npc)) { m.dispose(); this.marks.delete(npc); }
    }
    const camPos = cam.getWorldPosition(_f);
    const hideAll = !!(g.ui.tracker?.muted || g.ui.focus || sc.cut || sc.locked && g.sceneName !== 'town' || sc.hideQuestMarks);
    for (const m of this.marks.values()) {
      m.group.visible = !!m.kind && !hideAll;
      if (!m.kind || !m.anchor || hideAll) continue;
      try { m.place(m.anchor.head(_v), dt, camPos); } catch (e) { m.set(null); }
    }
    this.updateTarget(dt);
    this.updateWaypoint();
    this.updateGaze(dt);
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
    // the "take a good look" goals of every active quest (not just the tracked one), in this scene
    this.gazeGoals = [];
    for (const q of Q.active()) {
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
      g.ui.toast(`You take a good look: <b>${best.label || best.at}</b>. Noted in your book.`, { icon: BART.eye(), dur: 2600 });
    }
  }
  setEye() { this.eyeRing.style.setProperty('--k', Math.min(1, this.gaze.t / GAZE_T).toFixed(3)); }
}


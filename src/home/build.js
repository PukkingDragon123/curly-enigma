// The Builder's Hammer at home (wave 16; it was a top-down-ish "Decorate" panel): holding the hammer
// (its belt loop, X, or the chair button) is building. A compact quick strip over the belt shows the
// piece in the paw (src/home/hammer.js); the wheel steps along it, hold Q (or tap the hammer's loop
// again) for the radial wheel: pieces you build from timber and stone (data/furniture.js piece,
// taught by Building levels), furniture from storage, floors. A see-through ghost snaps to the
// tile grid where the crosshair meets the floor of an alcove you've dug (src/home/nooks.js) or its
// rock wall, green when it fits, red when it doesn't; R turns it, a click and the mole hammers it
// in with a few quick blows (fewer and quicker with Building skills and levels: hammer.js
// blowPlan). Hammering a piece already placed picks it up to move it; F / right-click takes it
// down (furniture back to storage, built pieces give their timber back). Building XP: act 'build'.
//   desktop: wheel / hold Q pick, R turns, click builds, F takes down, X puts the hammer away
//   touch:   the strip and the wheel are tapped; the big button builds / picks up, "use" turns
import * as THREE from 'three';
import { FURNITURE, FLOORS, WALLS } from '../data/furniture.js';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';
import { el, uid, clamp } from '../core/util.js';
import { buildFurniture } from '../iso/furniture.js';
import { footprint, itemAt, isWallHung, isStorable, WALL_OF_R, R_OF_WALL } from '../iso/homeLayout.js';
import { canPlaceNooks, wallItemAtNooks, nookAtTile, nookRect, NOOKS } from './nooks.js';
import { VoxelGrid, mulc } from '../iso/kit.js';
import { fastMesh } from '../iso/mesher.js';
import { TOOL_KINDS, VMV } from '../fps/ViewModel.js';
import { T, CEIL } from './units.js';
import { PIECES } from './pieces.js';
import { HammerUI, CATS, hammerIn, knockDown } from './hammer.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3();
const isTouch = () => document.documentElement.classList.contains('is-touch');

let ghostMats = null;
function ghostMaterials() {
  if (!ghostMats) {
    const mk = (c) => { const m = new THREE.MeshBasicMaterial({ vertexColors: true, color: c, transparent: true, opacity: 0.62, depthWrite: false }); m.userData.shared = true; return m; };
    ghostMats = { ok: mk(0xa8ffa8), bad: mk(0xff8a7a) };
  }
  return ghostMats;
}

/** A claw hammer for the paws (view-model scale), held like the pick's handle. */
function hammerMesh() {
  const g = new VoxelGrid(14, 80, 34);
  const wood = (x, y) => mulc(0xa0703e, (y % 9 === 0 ? 0.85 : 1) * (x % 3 === 0 ? 0.92 : 1));
  g.box(5, 0, 14, 4, 64, 4, wood);
  g.box(4, 0, 13, 6, 14, 6, (x, y) => (y % 3 === 0 ? 0x3a2a1a : 0x5a3a22)); // leather grip
  g.box(3, 60, 6, 8, 12, 18, (x, y, z) => (y === 71 ? 0xd8d8e0 : z < 8 ? 0x8a8a94 : 0xa8a8b4)); // head
  g.box(3, 61, 2, 8, 10, 4, 0xc8c8d0); // striking face
  for (let k = 0; k < 9; k++) g.box(4, 62 + Math.round(k * 0.6), 24 + k, 2, 6 - Math.round(k * 0.4), 1, 0x9a9aa4), g.box(8, 62 + Math.round(k * 0.6), 24 + k, 2, 6 - Math.round(k * 0.4), 1, 0x9a9aa4); // the claw
  const m = fastMesh(g, { scale: VMV * 0.85, pivot: [7, 8, 16], kind: 'toon', outline: true });
  m.frustumCulled = false;
  return m;
}

export class FPBuild {
  constructor(scene) {
    this.s = scene;
    this.game = scene.game;
    this.active = false;
    this.tab = 'piece';
    this.sel = null; // { type: 'new'|'move'|'floor', id, p?, orig? }
    this.r = 0;
    this.hover = null;
    this.hoverItem = null;
    this.ghost = null;
    this.selIdx = 0;
    const g = new THREE.Group();
    g.visible = false;
    scene.room.add(g);
    this.helpers = g;
    this.markMat = new THREE.MeshBasicMaterial({ color: 0x6aff6a, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.markMat);
    this.mark.position.y = 0.03;
    this.mark.renderOrder = 5;
    g.add(this.mark);
    this.grid = this.makeGrid();
    g.add(this.grid);
    this.boxMat = new THREE.LineBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.95, depthTest: false });
    this.box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), this.boxMat);
    this.box.renderOrder = 9;
    this.box.visible = false;
    g.add(this.box);
    this.useHammerKind = TOOL_KINDS.includes('hammer');
  }

  makeGrid() {
    const pts = [];
    // the tile lines of each alcove you've dug
    for (const n of NOOKS) {
      if (!this.s.nooks?.has(n.id)) continue;
      const r = nookRect(n);
      for (let x = r.x0; x <= r.x1; x++) pts.push(x, 0.02, r.z0, x, 0.02, r.z1);
      for (let z = r.z0; z <= r.z1; z++) pts.push(r.x0, 0.02, z, r.x1, 0.02, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.16, depthWrite: false }));
  }

  // ------------------------------------------------------------ on / off
  toggle(on = !this.active) {
    const s = this.s;
    if (on === this.active) return;
    if (on && (s.scripted || this.game.ui.isPanelOpen())) return;
    // building is the Builder's Hammer in your paw, and the hammer is made at the forge (wave 16)
    if (on && !this.game.state.owns('builder_hammer')) { this.hammerHint(); return; }
    this.active = on;
    this.game.audio.play(on ? 'ui_open' : 'ui_close');
    if (on) {
      this.helpers.visible = true;
      this.equipHammer(true);
      if (!this.entries().length) this.tab = this.tab === 'piece' ? 'furniture' : 'piece';
      this.selIdx = 0;
      this.openStrip();
      this.pickIndex(0, true);
      s.hammer?.classList.add('alt');
      this.game.ui.root?.classList.add('hammering');
      this.game.ui.setHints(null);
      this.game.state.learn?.('building');
      // the hammer's belt loop lights up with it (src/ui/handTools.js keeps the two in step)
      const hands = s.hands, at = hands ? (this.game.state.data.inv?.slots || []).slice(0, 9).findIndex((x) => x?.tool === 'build') : -1;
      if (hands && at >= 0 && hands.slot !== at) { hands.slot = at; hands._lastKind = 'build'; this.game.state.data.hotSel = at; }
    } else {
      this.cancelSel();
      this.helpers.visible = false;
      this.box.visible = false;
      this.equipHammer(false);
      this.closeStrip();
      s.hammer?.classList.remove('alt');
      this.game.ui.root?.classList.remove('hammering');
      this.game.state.save();
    }
  }

  equipHammer(on) {
    const rig = this.s.rig;
    if (this.useHammerKind) { rig.setTool(on ? 'hammer' : 'none'); return; }
    rig.setTool(on ? 'pick' : 'none', on ? 'pick_rusty' : null);
    if (on && rig.vm && !this.hammer) { this.hammer = hammerMesh(); rig.vm.handR.add(this.hammer); }
    if (this.hammer) this.hammer.visible = on;
  }

  // ------------------------------------------------------------ the quick strip + the wheel (hammer.js)
  openStrip() {
    this.closeStrip();
    this.ui = new HammerUI(this);
    this.strip = this.ui.strip;
  }

  closeStrip() {
    this.ui?.dispose();
    this.ui = null;
    this.strip = null;
  }

  /** No hammer yet: Old Star points you at the forge, once (one short line). */
  hammerHint() {
    const st = this.game.state, s = this.s;
    if (st.flag?.('hammerHint')) { this.game.audio.play('ui_error', { vol: 0.4 }); return; }
    st.flag?.('hammerHint', true);
    const line = 'Forge yourself a hammer first: copper and a log.';
    if (s.star?.rig && s.star.mode !== 'sleep' && !s.star.scripted) s.star.say(line, { mood: 'happy' });
    else s.think?.(line, 3);
  }

  /** What the current tab offers: [{ id, n, type, i, locked?, lv?, made? }]. */
  entries() {
    const st = this.game.state, d = st.data;
    let out;
    if (this.tab === 'piece') {
      const lv = st.skillLevel?.('building') || 1;
      const known = PIECES.filter((id) => (FURNITURE[id].lv || 1) <= lv);
      const next = PIECES.filter((id) => (FURNITURE[id].lv || 1) > lv);
      const nextLv = next.length ? FURNITURE[next[0]].lv : 0;
      out = known.map((id) => {
        const made = FURNITURE[id].made || {};
        const n = Math.min(...Object.entries(made).map(([m, k]) => Math.floor(st.count(m) / k)));
        return { id, n: Number.isFinite(n) ? n : 0, type: 'piece', made, short: !(n > 0) };
      }).concat(next.filter((id) => FURNITURE[id].lv === nextLv).map((id) => ({ id, type: 'piece', locked: true, lv: nextLv })));
    } else if (this.tab === 'furniture') out = Object.keys(FURNITURE).filter((id) => !FURNITURE[id].piece && (d.furniture[id] || 0) > 0).map((id) => ({ id, n: d.furniture[id], type: 'new' }));
    else out = Object.keys(FLOORS).filter((id) => st.owns(id) || id === 'floor_dirt').map((id) => ({ id, n: null, type: 'floor' }));
    out.forEach((e, i) => { e.i = i; });
    return out;
  }

  render() { this.ui?.render(); }
  renderInfo() { /* (the strip shows it all: hammer.js) */ }

  setTab(k) {
    if (this.tab === k) return;
    this.tab = k;
    this.selIdx = 0;
    this.cancelSel();
    this.pickIndex(0, true);
    this.game.audio.play('ui_click');
  }
  nextTab() { const i = CATS.findIndex((c) => c.id === this.tab); this.setTab(CATS[(i + 1) % CATS.length].id); }

  /** Take entry i of the current tab into the paw (quiet: no click). */
  pickIndex(i, quiet = false) {
    const list = this.entries();
    if (!list.length) { this.cancelSel(); this.render(); return; }
    this.selIdx = ((i % list.length) + list.length) % list.length;
    const e = list[this.selIdx];
    if (e.locked) { this.cancelSel(); this.render(); return; }
    if (this.sel && this.sel.id === e.id && this.sel.type === e.type) { this.render(); return; }
    this.cancelSel();
    this.sel = { type: e.type, id: e.id };
    if (!quiet) this.game.audio.play('ui_click', { pitch: 1.2 });
    if (e.type !== 'floor') { this.r = this.r || 0; this.makeGhost(e.id); }
    this.render();
  }

  pickEntry(e) { if (e) this.pickIndex(e.i ?? 0); }

  /** Wheel / the touch tool button: step along the strip (locked pieces are passed over). */
  cycle(step) {
    const list = this.entries();
    if (!list.length) return;
    let k = this.selIdx;
    for (let t = 0; t < list.length; t++) { k = ((k + step) % list.length + list.length) % list.length; if (!list[k].locked) break; }
    this.pickIndex(k);
  }

  // ------------------------------------------------------------ selection
  select(sel) {
    const same = this.sel && this.sel.id === sel.id && this.sel.type === sel.type;
    this.cancelSel();
    if (same) { this.render(); return; }
    this.sel = sel;
    this.game.audio.play('ui_click');
    if (sel.type !== 'floor') { this.r = sel.p ? sel.p.r || 0 : this.r; this.makeGhost(sel.id); }
    this.render();
  }

  makeGhost(id) {
    this.clearGhost();
    const res = buildFurniture(id, this.s.ctxFor({ uid: '__ghost' }));
    const gm = ghostMaterials();
    const extra = [];
    res.obj.traverse((o) => {
      if (!o.isMesh) return;
      o.layers.disable(1);
      if (o.material && o.material.map) {
        const m = new THREE.MeshBasicMaterial({ map: o.material.map, color: 0xa8ffa8, transparent: true, opacity: 0.62, depthWrite: false });
        extra.push(m);
        o.material = m;
      } else if (o.geometry.getAttribute('color')) o.material = gm.ok;
      o.renderOrder = 8;
    });
    this.ghost = { obj: res.obj, id, extra, ok: true, bob: 0 };
    this.s.room.add(res.obj);
  }

  clearGhost() {
    if (!this.ghost) return;
    const g = this.ghost;
    this.s.room.remove(g.obj);
    g.obj.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose(); });
    for (const m of g.extra) m.dispose();
    this.ghost = null;
  }

  setGhostTint(ok) {
    const g = this.ghost;
    if (!g) return;
    const gm = ghostMaterials();
    g.obj.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === gm.ok || o.material === gm.bad) o.material = ok ? gm.ok : gm.bad;
      else if (g.extra.includes(o.material)) o.material.color.setHex(ok ? 0xa8ffa8 : 0xff8a7a);
    });
    this.markMat.color.setHex(ok ? 0x6aff6a : 0xff4a3a);
  }

  /** Drop the current selection; a piece being moved goes back where it was. */
  cancelSel(rerender = false) {
    const sel = this.sel;
    if (sel && sel.type === 'move' && sel.orig) {
      Object.assign(sel.p, sel.orig);
      this.game.state.data.home.placed.push(sel.p);
      this.s.addPlaced(sel.p);
      this.s.rebuildCollision();
    }
    this.sel = null;
    this.clearGhost();
    this.mark.visible = false;
    if (rerender) { this.render(); this.game.audio.play('ui_close'); }
  }

  rotate() {
    if (!this.sel || !this.ghost || isWallHung(this.sel.id) || FURNITURE[this.sel.id]?.onWall) return;
    this.r = (this.r + 1) % 4;
    this.game.audio.play('ui_click');
    if (this.ghost) this.ghost.bob = 1;
  }

  // ------------------------------------------------------------ actions
  pickUp(p) {
    const s = this.s, home = this.game.state.data.home;
    const i = home.placed.indexOf(p);
    if (i < 0) return;
    home.placed.splice(i, 1);
    s.removePlaced(p.uid);
    s.rebuildCollision();
    this.sel = { type: 'move', id: p.id, p, orig: { x: p.x, y: p.y, r: p.r } };
    this.r = p.r || 0;
    this.makeGhost(p.id);
    this.game.audio.play('remove');
    this.s.rig.vm?.swing('pick', 0.16);
    this.hoverItem = null;
    this.render();
  }

  putAway(p) {
    const st = this.game.state, d = st.data;
    if (!isStorable(p.id)) { this.nope(); return false; }
    const rec = this.s.items.get(p.uid), at = rec && { cx: rec.cx, cz: rec.cz, bbox: rec.bbox.clone() };
    const i = d.home.placed.indexOf(p);
    if (i >= 0) { d.home.placed.splice(i, 1); this.s.removePlaced(p.uid); }
    this.returnPlanter(p);
    this.giveBack(p.id);
    this.s.rebuildCollision();
    knockDown(this, p, at);
    st.emit('act', { type: 'unbuild', id: p.id, home: true });
    st.save();
    this.hoverItem = null;
    this.render();
    return true;
  }

  returnPlanter(p) {
    const st = this.game.state, d = st.data;
    const pl = d.home.planters?.[p.uid];
    if (!pl) return;
    if (pl.ready || pl.day < d.day) { st.addItem(pl.id, { spill: true, n: 3 }); st.learn('planting'); } else st.addItem(pl.id, { spill: true, n: 1 });
    delete d.home.planters[p.uid];
  }

  putAwaySel() {
    const sel = this.sel;
    if (!sel || sel.type !== 'move') return;
    if (!isStorable(sel.id)) { this.cancelSel(true); this.nope(); return; }
    const p = sel.p;
    this.sel = null;
    this.clearGhost();
    this.mark.visible = false;
    const st = this.game.state;
    this.returnPlanter(p);
    this.giveBack(p.id);
    this.game.audio.play('remove');
    st.save();
    this.render();
  }

  /** Taken down: furniture goes back to storage, a built piece gives its timber / stone back. */
  giveBack(id) {
    const st = this.game.state, made = FURNITURE[id]?.made;
    if (made) for (const [m, k] of Object.entries(made)) st.addItem(m, { spill: true, n: k });
    else st.addItem(id, { spill: true, n: 1 });
  }

  /** Hammer the held piece in where the ghost sits (the data is written at once; the blows are the show). */
  place() {
    const s = this.s, st = this.game.state, d = st.data;
    const sel = this.sel, h = this.hover;
    if (this.job) return null;
    if (!sel || !h || !h.ok) { this.nope(); return null; }
    let p;
    const f = FURNITURE[sel.id];
    if (sel.type === 'piece') {
      const made = f.made || {};
      for (const [m, k] of Object.entries(made)) if (st.count(m) < k) { this.nope(true); return null; }
      const free = Math.random() < (st.skill?.('salvage') || 0);
      if (!free) for (const [m, k] of Object.entries(made)) st.removeItem(m, k, { lowFirst: true });
      else this.game.audio.play('sparkle', { vol: 0.5 }); // (Thrifty Builder: no timber used)
      p = { uid: uid(), id: sel.id, x: h.x, y: h.y, r: h.r };
    } else if (sel.type === 'new') {
      if ((d.furniture[sel.id] || 0) <= 0) { this.cancelSel(true); return null; }
      st.removeItem(sel.id, 1);
      p = { uid: uid(), id: sel.id, x: h.x, y: h.y, r: h.r };
    } else {
      p = sel.p;
      p.x = h.x; p.y = h.y; p.r = h.r;
    }
    d.home.placed.push(p);
    const rec = s.addPlaced(p);
    s.rebuildCollision();
    if (rec) hammerIn(this, rec, { kind: sel.type === 'piece' ? 'piece' : sel.type }); else this.pop(rec);
    if (sel.type !== 'move') st.emit('act', { type: 'build', home: true, id: p.id, tiles: (f.size?.[0] || 1) * (f.size?.[1] || 1), lv: f.lv || 1 });
    st.learn('building');
    st.save();
    const more = sel.type === 'piece' ? true : sel.type === 'new' && (d.furniture[sel.id] || 0) > 0;
    if (!more) { this.sel = null; this.clearGhost(); this.mark.visible = false; if (sel.type === 'new') this.pickIndex(Math.min(this.selIdx, this.entries().length - 1), true); }
    this.render();
    return p;
  }

  /** The satisfying bit: a squash-and-stretch pop, dust round the base, a thunk and the hammer tap. */
  pop(rec) {
    if (!rec) return;
    const s = this.s, o = rec.obj;
    this.game.audio.play('place');
    this.game.audio.play('hit', { snd: 'wood', vol: 0.6 });
    s.rig.vm?.swing('pick', 0.14);
    s.rig.vm?.impact('pick', 0.5);
    s.rig.shake(0.08);
    const cx = rec.cx * T, cz = rec.cz * T, rx = rec.fw * T / 2, rz = rec.fd * T / 2;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      s.fx.spawn({ x: cx + Math.cos(a) * rx, y: 0.03, z: cz + Math.sin(a) * rz, vx: Math.cos(a) * 0.6, vy: 0.25 + Math.random() * 0.3, vz: Math.sin(a) * 0.6, life: 0.7 + Math.random() * 0.5, size: 0.03, grow: 0.08, color: [0.62, 0.52, 0.4], alpha: 0.55, drag: 3, grav: -0.1 });
    }
    for (let i = 0; i < 6; i++) s.fx.glints(cx + (Math.random() - 0.5) * rx * 2, rec.bbox.max.y * 0.6 + 0.05, cz + (Math.random() - 0.5) * rz * 2, [1, 0.95, 0.7]);
    s.tween(0.32, (k) => {
      const sq = k < 0.35 ? 1 - Math.sin((k / 0.35) * Math.PI) * 0.16 : 1 + Math.sin(((k - 0.35) / 0.65) * Math.PI) * 0.07 * (1 - k);
      o.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    }).then(() => o.scale.set(1, 1, 1));
  }

  paint(x, y, id) {
    const s = this.s, home = this.game.state.data.home;
    const k = `${x},${y}`;
    const cur = home.floor[k] || 'floor_dirt';
    if (cur === id) return;
    if (id === 'floor_dirt') delete home.floor[k]; else home.floor[k] = id;
    s.shell.paintTile(x, y, id);
    this.game.audio.play('place', { gap: 0.04 });
    s.fx.dust((x + 0.5) * T, 0.03, (y + 0.5) * T, 4, [0.6, 0.5, 0.38], 0.12);
    this.dirtyFloor = true;
  }

  applyWall(id) {
    const home = this.game.state.data.home;
    if (home.wall === id) return;
    home.wall = id;
    this.s.shell.setWall(id);
    this.game.audio.play('place');
    this.game.audio.play('brush');
    this.s.rig.shake(0.1);
    this.game.state.save();
    this.render();
  }

  /** Wordless "no": the ghost flushes red and shakes (the strip shakes when it's the timber). */
  nope(strip = false) {
    this.game.audio.play('ui_error', { vol: 0.5 });
    if (this.ghost) { this.ghost.shake = 0.32; this.setGhostTint(false); this.ghost.ok = false; }
    if (strip || !this.ghost) this.ui?.shake();
  }
  flash() { this.nope(); }

  /** One floating cue at a time while the hammer is out (thoughts, Old Star's remarks, gifts):
   *  the rest wait their turn (the newest two), never piling up over the view. */
  cue(fn, dur = 3) {
    if (!this.active) { fn(); return; }
    if ((this.cueT || 0) > 0) { (this.cues ||= []).push([fn, dur]); if (this.cues.length > 2) this.cues.shift(); return; }
    this.cueT = dur;
    fn();
  }
  tickCues(dt) {
    if (!(this.cueT > 0)) return;
    this.cueT -= dt;
    if (this.cueT <= 0 && this.cues?.length) { const [fn, dur] = this.cues.shift(); this.cueT = dur; fn(); }
  }

  /** Test hook: place `id` at tile (x, y) facing r, from storage (one is added if none is stored). */
  placeDirect(id, x, y, r = 0) {
    if (!FURNITURE[id]) return { ok: false, reason: 'unknown id' };
    const st = this.game.state;
    const chk = canPlaceNooks(st.data.home.placed, this.s.nooks || new Set(), id, x, y, r);
    if (!chk.ok) return chk;
    if ((st.data.furniture[id] || 0) <= 0) st.addItem(id, { spill: true, n: 1 });
    const wasActive = this.active;
    if (!wasActive) this.toggle(true);
    this.sel = { type: 'new', id };
    this.makeGhost(id);
    this.hover = { x, y, r, ok: true };
    this.job = null; // (a test places several in one go: earlier blows keep playing)
    const p = this.place();
    if (!wasActive) this.toggle(false);
    return { ok: !!p, uid: p?.uid };
  }

  // ------------------------------------------------------------ aiming
  /** The alcove you're aiming into: the one you stand in, else the one under the crosshair's floor point. */
  aimNook(fl) {
    const s = this.s, p = s.rig.player.pos, set = s.nooks || new Set();
    return nookAtTile(Math.floor(p.x / T), Math.floor(p.z / T), set) || (fl && nookAtTile(Math.floor(fl.x), Math.floor(fl.z), set)) || null;
  }

  /** The crosshair ray against the floor (y = 0) and the four walls of the alcove you're in, in tile units. */
  aim() {
    const s = this.s, rig = s.rig;
    const o = rig.eye(_o), d = rig.forward(_d);
    let floor = null;
    if (d.y < -0.02) {
      const t = -o.y / d.y;
      if (t < 6) floor = { x: (o.x + d.x * t) / T, z: (o.z + d.z * t) / T, t };
    }
    const n = this.aimNook(floor);
    let wall = null;
    if (n) {
      const r = nookRect(n), X0 = r.x0 * T, X1 = r.x1 * T, Z0 = r.z0 * T, Z1 = r.z1 * T;
      const tryWall = (name, t) => {
        if (!(t > 0) || t > 6) return;
        const y = o.y + d.y * t;
        if (y < 0 || y > CEIL) return;
        const x = o.x + d.x * t, z = o.z + d.z * t;
        if (x < X0 - 0.01 || z < Z0 - 0.01 || x > X1 + 0.01 || z > Z1 + 0.01) return;
        if (!wall || t < wall.t) wall = { wall: name, t, x: x / T, y: y / T, z: z / T, slot: Math.floor((name === 'n' || name === 's' ? x : z) / T), nook: n };
      };
      if (d.z < 0) tryWall('n', (Z0 - o.z) / d.z);
      if (d.z > 0) tryWall('s', (Z1 - o.z) / d.z);
      if (d.x < 0) tryWall('w', (X0 - o.x) / d.x);
      if (d.x > 0) tryWall('e', (X1 - o.x) / d.x);
    }
    if (floor && wall && wall.t < floor.t) floor = null;
    return { floor, wall, nook: n };
  }

  /** The placed piece under the crosshair (furniture boxes first, then wall pieces). */
  aimedItem(pk) {
    const s = this.s, rig = s.rig;
    const o = rig.eye(_o), d = rig.forward(_d);
    let best = null, bt = 6;
    for (const rec of s.items.values()) {
      const b = rec.bbox;
      const t = rayBox(o, d, b.min.x, 0, b.min.z, b.max.x, Math.max(0.06, b.max.y), b.max.z);
      if (t !== null && t < bt) { bt = t; best = rec.p; }
    }
    if (best) return best;
    const placed = this.game.state.data.home.placed;
    if (pk.wall) { const r = nookRect(pk.wall.nook); const p = wallItemAtNooks(placed, s.nooks || new Set(), r.x0, r.z0, pk.wall.wall, pk.wall.slot); if (p) return p; }
    if (pk.floor) return itemAt(placed, Math.floor(pk.floor.x), Math.floor(pk.floor.z));
    return null;
  }

  // ------------------------------------------------------------ frame
  /** The radial wheel is up: the scene holds the view still (HomeScene passes busy to the rig). */
  get wheelOpen() { return !!this.ui?.open; }
  /** Before the rig's update: while the wheel is up, the mouse's flicks steer it instead of the view. */
  preRig() {
    const inp = this.game.input;
    if (!this.wheelOpen) return;
    const lk = inp.takeLook();
    if (inp.pointerLocked) this.ui.steer(lk.dx, lk.dy);
  }

  update(dt) {
    const inp = this.game.input, s = this.s;
    const canBuild = this.game.state.unlocked?.('build') !== false; // [unlock guard] (src/ui/Onboard.js UNLOCKS)
    void canBuild; // (no build button or key: holding the hammer is building, src/ui/handTools.js)
    this.tickCues(dt);
    if (!this.active) return;
    if (s.scripted) return;
    if (!this.useHammerKind && s.rig.vm) s.rig.vm.toolR.visible = false;
    if (this.infoHold > 0) { this.infoHold -= dt; if (this.infoHold <= 0) this.renderInfo(); }
    if (!inp.enabled || this.game.ui.isPanelOpen()) return;
    // picking: the wheel steps along the strip; hold Q for the radial wheel (a tap of Q: next category)
    const ui = this.ui;
    if (inp.mouse.wheel) this.cycle(inp.mouse.wheel > 0 ? 1 : -1);
    if (inp.pressed('KeyQ')) this.qT = 0;
    if (this.qT !== undefined && this.qT !== null) {
      if (inp.isDown('KeyQ')) { this.qT += dt; if (this.qT > 0.16 && ui && !ui.open) ui.openWheel(); }
      else { if (ui?.open) ui.closeWheel(true); else if (this.qT <= 0.16) this.nextTab(); this.qT = null; }
    }
    if (ui?.open) {
      // the wheel is up: a click takes the one under the flick (or the pointer), right-click shuts it
      if (inp.mousePressed(0) && inp.pointerLocked) ui.closeWheel(true);
      else if (inp.mousePressed(2)) ui.closeWheel(false);
      this.game.ui.setCrosshair?.({ visible: false });
      return;
    }
    const rot = inp.pressed('KeyR') || (this.sel && inp.pressed('KeyE'));
    const store = inp.pressed('KeyF') || inp.mousePressed(2);
    const click = s.rig.primaryPressed && !this.job;
    const pk = this.aim();
    const sel = this.sel;
    this.box.visible = false;
    const prevHover = this.hoverItem;
    this.hoverItem = null;
    let label = '', ok = true;
    if (sel && sel.type !== 'floor') {
      if (rot) this.rotate();
      this.updateGhost(pk, dt);
      label = this.hover?.ok ? `${sel.type === 'piece' ? 'Build' : 'Place'} ${FURNITURE[sel.id].name}` : this.hover?.reason || 'Look at the floor';
      ok = !!this.hover?.ok;
      if (click) this.place();
      else if (store) { if (sel.type === 'move') this.putAwaySel(); else this.cancelSel(true); }
    } else if (sel && sel.type === 'floor') {
      const t = pk.floor && { x: Math.floor(pk.floor.x), y: Math.floor(pk.floor.z) };
      const inside = t && !!nookAtTile(t.x, t.y, s.nooks || new Set());
      this.mark.visible = !!inside;
      if (inside) { this.mark.position.set(t.x + 0.5, 0.03, t.y + 0.5); this.mark.scale.set(1, 1, 1); this.markMat.color.setHex(0x6aff6a); }
      label = inside ? `Paint ${FLOORS[sel.id].name}` : 'Look at the floor';
      if (inside && s.rig.primaryDown) this.paint(t.x, t.y, sel.id);
      if (inside && (inp.mouseDown(2) || inp.isDown('KeyF'))) this.paint(t.x, t.y, 'floor_dirt');
      if ((inp.mouseReleased(0) || inp.mouseReleased(2) || !s.rig.primaryDown) && this.dirtyFloor) { this.dirtyFloor = false; s.rebuildCollision(); this.game.state.save(); }
    } else {
      const p = this.aimedItem(pk);
      if (p) {
        this.hoverItem = p;
        this.showBox(p);
        label = `Move ${FURNITURE[p.id].name}`;
        if (click || rot) this.pickUp(p);
        else if (store) this.putAway(p);
      } else label = '';
      this.mark.visible = false;
    }
    // gold label for "place" / "pick up" (no E key cap: it's a click), white when it won't fit
    void label; // (no words by the crosshair: the piece's name is on the strip, a red shaking ghost says "not here")
    this.game.ui.setCrosshair?.({ visible: true, kind: ok && (sel || this.hoverItem) ? 'ore' : 'none', label: '' });
    void prevHover;
  }

  renderInfoThrottled(dt) {
    this.infoT = (this.infoT || 0) - dt;
    if (this.infoT > 0 && this.lastReason === this.hover?.reason && this.lastHover === this.hoverItem) return;
    this.infoT = 0.15;
    this.lastReason = this.hover?.reason;
    this.lastHover = this.hoverItem;
    if (!(this.infoHold > 0)) this.renderInfo();
  }

  showBox(p) {
    const s = this.s, rec = s.items.get(p.uid);
    if (!rec) return;
    const b = rec.bbox;
    const sx = (b.max.x - b.min.x) / T + 0.06, sy = Math.max(0.1, b.max.y / T) + 0.04, sz = (b.max.z - b.min.z) / T + 0.06;
    this.box.visible = true;
    this.box.scale.set(sx, sy, sz);
    this.box.position.set((b.min.x + b.max.x) / 2 / T, sy / 2, (b.min.z + b.max.z) / 2 / T);
    this.boxMat.color.setHex(isStorable(p.id) ? 0xffd34a : 0x9ad0ff);
  }

  /** Snap the ghost to the grid under the crosshair and check whether it fits. */
  updateGhost(pk, dt) {
    const s = this.s, sel = this.sel, id = sel.id, f = FURNITURE[id];
    const placed = this.game.state.data.home.placed;
    let x = 0, y = 0, r = this.r;
    const fl = pk.floor || (pk.wall ? { x: pk.wall.x, z: pk.wall.z } : null);
    const n = pk.nook;
    if (!fl || !n) { this.hover = { x: 0, y: 0, r, ok: false, reason: n ? 'Look at the floor' : 'Look into one of your alcoves' }; if (this.ghost) this.ghost.obj.visible = false; this.mark.visible = false; return; }
    const R = nookRect(n), W = R.x1 - R.x0, D = R.z1 - R.z0;
    const lx = fl.x - R.x0, lz = fl.z - R.z0; // (in the alcove's own tiles)
    if (f.kind === 'wall') {
      // hang it on the wall under the crosshair (or the one nearest the floor point)
      const wname = pk.wall ? pk.wall.wall : nearestWall(lx, lz, W, D);
      const slotF = pk.wall ? pk.wall.slot - (wname === 'n' || wname === 's' ? R.x0 : R.z0) : Math.floor(wname === 'n' || wname === 's' ? lx : lz);
      const w = f.size[0];
      r = R_OF_WALL[wname];
      const along = wname === 'n' || wname === 's';
      const a = clamp(slotF - Math.floor((w - 1) / 2), 0, (along ? W : D) - w);
      if (wname === 'n') { x = a; y = 0; } else if (wname === 's') { x = a; y = D - 1; } else if (wname === 'w') { x = 0; y = a; } else { x = W - 1; y = a; }
    } else if (f.onWall) {
      const wname = nearestWall(lx, lz, W, D);
      r = R_OF_WALL[wname];
      const [fw, fd] = footprint(id, r);
      if (wname === 'n') { x = clamp(Math.floor(lx - fw / 2 + 0.5), 0, W - fw); y = 0; }
      else if (wname === 's') { x = clamp(Math.floor(lx - fw / 2 + 0.5), 0, W - fw); y = D - fd; }
      else if (wname === 'w') { x = 0; y = clamp(Math.floor(lz - fd / 2 + 0.5), 0, D - fd); }
      else { x = W - fw; y = clamp(Math.floor(lz - fd / 2 + 0.5), 0, D - fd); }
    } else {
      const [fw, fd] = footprint(id, r);
      x = Math.floor(lx - fw / 2 + 0.5);
      y = Math.floor(lz - fd / 2 + 0.5);
    }
    x += R.x0; y += R.z0;
    if (f.kind === 'wall' || f.onWall) this.r = r;
    const chk = canPlaceNooks(placed, s.nooks || new Set(), id, x, y, r, sel.p?.uid);
    // never drop something on the mole's own feet
    let ok = chk.ok, reason = chk.ok ? null : chk.reason;
    if (ok && f.kind !== 'rug' && f.kind !== 'wall') {
      const [fw, fd] = footprint(id, r);
      const pp = s.rig.player.pos;
      if (pp.x > x * T - 0.2 && pp.x < (x + fw) * T + 0.2 && pp.z > y * T - 0.2 && pp.z < (y + fd) * T + 0.2) { ok = false; reason = 'Step back a little'; }
    }
    this.hover = { x, y, r, ok, reason };
    const [fw, fd] = footprint(id, r);
    const g = this.ghost;
    if (g) {
      g.obj.visible = true;
      g.bob = Math.max(0, g.bob - dt * 4);
      g.obj.position.set(x + fw / 2, 0.02 + Math.sin(s.time * 3) * 0.015 + g.bob * 0.15, y + fd / 2);
      const want = r * Math.PI / 2;
      const cur = g.obj.rotation.y;
      g.obj.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 18);
      if (g.ok !== ok) { if (!ok && g.ok) g.shake = 0.28; g.ok = ok; this.setGhostTint(ok); }
      if (g.shake > 0) { g.shake = Math.max(0, g.shake - dt); const k = g.shake / 0.3; g.obj.position.x += Math.sin(s.time * 70) * 0.06 * k; g.obj.rotation.z = Math.sin(s.time * 55) * 0.05 * k; } else g.obj.rotation.z = 0;
    }
    if (f.kind === 'wall') this.mark.visible = false;
    else { this.mark.visible = true; this.mark.position.set(x + fw / 2, 0.03, y + fd / 2); this.mark.scale.set(fw, 1, fd); }
  }

  dispose() {
    this.gone = true;
    this.game.ui.root?.classList.remove('hammering');
    this.closeStrip();
    this.clearGhost();
    if (this.hammer) { this.hammer.parent?.remove(this.hammer); this.hammer.geometry.dispose(); }
  }
}

function nearestWall(x, z, W, D) {
  const d = [['n', z], ['w', x], ['s', D - z], ['e', W - x]];
  d.sort((a, b) => a[1] - b[1]);
  return d[0][0];
}

function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = Infinity;
  for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) return null; continue; }
    let ta = (a - oo) / dd, tb = (b - oo) / dd;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}

export { WALL_OF_R };

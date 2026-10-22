// First-person build mode for the burrow: X (or E at the build bench, or the chair button) puts a
// little hammer in the mole's paw and opens a strip of everything in storage, the owned floors and
// wall styles. A see-through ghost of the chosen piece snaps to the tile grid where the crosshair
// meets the floor (or the wall, for things that hang), green when it fits and red when it doesn't;
// R / E turns it, a click places it with a pop and a puff of dust. With empty paws, look at
// anything placed and click to pick it up and move it, or F / right-click to put it away.
//   desktop: wheel or 1-9 picks from the strip, Q switches the tab, X is done
//   touch:   tap the strip; the big button places / picks up, "use" turns, "tool" cycles
import * as THREE from 'three';
import { FURNITURE, FLOORS, WALLS } from '../data/furniture.js';
import { iconURL } from '../gfx/PixelArt.js';
import { el, uid, clamp } from '../core/util.js';
import { buildFurniture } from '../iso/furniture.js';
import { footprint, canPlace, itemAt, wallItemAt, isWallHung, isStorable, WALL_OF_R, R_OF_WALL } from '../iso/homeLayout.js';
import { VoxelGrid, mulc } from '../iso/kit.js';
import { fastMesh } from '../iso/mesher.js';
import { TOOL_KINDS, VMV } from '../fps/ViewModel.js';
import { T, CEIL } from './units.js';

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
    this.tab = 'furniture';
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
    const { W, D } = this.s;
    const pts = [];
    for (let x = 0; x <= W; x++) pts.push(x, 0.02, 0, x, 0.02, D);
    for (let z = 0; z <= D; z++) pts.push(0, 0.02, z, W, 0.02, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.16, depthWrite: false }));
  }

  // ------------------------------------------------------------ on / off
  toggle(on = !this.active) {
    const s = this.s;
    if (on === this.active) return;
    if (on && (s.scripted || this.game.ui.isPanelOpen())) return;
    this.active = on;
    this.game.audio.play(on ? 'ui_open' : 'ui_close');
    if (on) {
      this.helpers.visible = true;
      this.equipHammer(true);
      this.openStrip();
      s.hammer?.classList.add('alt');
      this.game.ui.setHints(null);
      this.game.state.learn?.('building');
    } else {
      this.cancelSel();
      this.helpers.visible = false;
      this.box.visible = false;
      this.equipHammer(false);
      this.closeStrip();
      s.hammer?.classList.remove('alt');
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

  // ------------------------------------------------------------ the strip
  openStrip() {
    this.closeStrip();
    const touch = isTouch();
    this.tabsEl = el('div', { class: 'tabs', style: { margin: 0 } });
    this.row = el('div', { style: { display: 'flex', gap: 'calc(var(--px) * 2)', overflowX: 'auto', padding: 'calc(var(--px) * 1) 0', minHeight: 'calc(var(--px) * 22)' } });
    this.info = el('div', { class: 'muted', style: { fontSize: '.78em', minWidth: 0, flex: '1 1 auto' } });
    this.actions = el('div', { class: 'row', style: { gap: 'calc(var(--px) * 2)', flexWrap: 'nowrap' } });
    const keys = touch ? '' : '<kbd>Wheel</kbd>pick <kbd>Q</kbd>tab <kbd>R</kbd>turn <kbd>Click</kbd>place <kbd>F</kbd>store <kbd>X</kbd>done';
    const panel = el('div', { class: 'panel', style: { width: touch ? 'min(calc(100vw - var(--px) * 96), calc(var(--px) * 230))' : 'min(calc(100vw - 40px), calc(var(--px) * 250))', padding: 'calc(var(--px) * 2) calc(var(--px) * 4)', animation: 'none', pointerEvents: 'auto' } }, [
      el('div', { class: 'row', style: { gap: 'calc(var(--px) * 3)', flexWrap: 'wrap' } }, [el('b', { style: { fontFamily: 'var(--font-display)', fontSize: '1.35em', fontWeight: 400, color: 'var(--wood-dk)', lineHeight: 1 } }, 'Decorate'), el('span', { class: 'muted', style: { fontSize: '.68em' }, html: keys }), el('span', { class: 'spacer' }), this.tabsEl]),
      this.row,
      el('div', { class: 'row', style: { flexWrap: 'nowrap', gap: 'calc(var(--px) * 3)' } }, [this.info, this.actions]),
    ]);
    // phones: above the stick when upright, along the top when held sideways (the thumbs own the bottom)
    const wide = window.innerWidth > window.innerHeight;
    const pos = !touch ? { left: 0, right: 0, bottom: 'calc(var(--px) * 3)', justifyContent: 'center' }
      : wide ? { left: 0, right: 0, top: 'calc(var(--sat, 0px) + var(--px) * 3)', justifyContent: 'center' }
        : { left: 'calc(var(--sal, 0px) + var(--px) * 3)', bottom: 'calc(var(--sab, 0px) + var(--px) * 62)' };
    if (touch && wide) panel.style.width = 'min(calc(100vw - var(--px) * 140), calc(var(--px) * 200))';
    this.strip = el('div', { style: { position: 'absolute', display: 'flex', pointerEvents: 'none', zIndex: 4, ...pos } }, [panel]);
    // clicks on the strip must not reach the game as a "place" click
    this.strip.addEventListener('pointerdown', (e) => e.stopPropagation());
    // in the HUD layer, above the "click to look around" catcher: with the mouse free (Esc) the
    // strip can be clicked; with it captured, the wheel / number keys / Q pick from it
    this.game.ui.hud.append(this.strip);
    this.render();
  }

  closeStrip() {
    this.strip?.remove();
    this.strip = null;
  }

  /** What the current tab offers: [{ id, n, type }]. */
  entries() {
    const st = this.game.state, d = st.data;
    if (this.tab === 'furniture') return Object.keys(FURNITURE).filter((id) => (d.furniture[id] || 0) > 0).map((id) => ({ id, n: d.furniture[id], type: 'new' }));
    if (this.tab === 'floor') return Object.keys(FLOORS).filter((id) => st.owns(id) || id === 'floor_dirt').map((id) => ({ id, n: null, type: 'floor' }));
    return Object.keys(WALLS).filter((id) => st.owns(id) || id === 'wall_dirt').map((id) => ({ id, n: null, type: 'wall' }));
  }

  render() {
    if (!this.strip) return;
    const d = this.game.state.data;
    this.tabsEl.innerHTML = '';
    for (const [k, label] of [['furniture', 'Furniture'], ['floor', 'Floors'], ['wall', 'Walls']]) {
      this.tabsEl.append(el('button', { class: 'tab' + (this.tab === k ? ' on' : ''), onclick: () => this.setTab(k) }, label));
    }
    this.row.innerHTML = '';
    const list = this.entries();
    const slot = (e, i) => {
      const on = this.tab === 'wall' ? d.home.wall === e.id : this.sel && this.sel.id === e.id && this.sel.type !== 'move';
      const name = (FURNITURE[e.id] || FLOORS[e.id] || WALLS[e.id])?.name || e.id;
      return el('div', { class: 'slot interactive' + (on ? ' on' : ''), title: name, style: { width: 'calc(var(--icon-s, 32px) + 12px)', minWidth: 'calc(var(--icon-s, 32px) + 12px)', height: 'calc(var(--icon-s, 32px) + 12px)', outline: i === this.selIdx && !isTouch() ? 'var(--px) dashed #c8902a' : '' }, onclick: () => { this.selIdx = i; this.pickEntry(e); } }, [
        el('img', { class: 'pix', src: iconURL(e.id), alt: name, style: { width: 'var(--icon-s, 32px)', height: 'var(--icon-s, 32px)' } }), e.n !== null ? el('span', { class: 'n' }, '×' + e.n) : null,
      ]);
    };
    if (!list.length) this.row.append(el('div', { class: 'muted', style: { alignSelf: 'center', fontSize: '.8em' } }, this.tab === 'furniture' ? 'Nothing in storage: Burrow & Board in Deep Town sells furniture. Look at a placed piece to move it.' : 'Nothing here yet.'));
    list.forEach((e, i) => this.row.append(slot(e, i)));
    this.renderInfo();
  }

  renderInfo() {
    if (!this.strip) return;
    const sel = this.sel;
    let txt = '';
    this.actions.innerHTML = '';
    const btn = (label, fn, alt = true) => this.actions.append(el('button', { class: 'btn' + (alt ? ' alt' : ''), onclick: (e) => { e.stopPropagation(); fn(); } }, label));
    if (sel && (sel.type === 'new' || sel.type === 'move')) {
      const f = FURNITURE[sel.id];
      txt = `<b>${f.name}</b> · ` + (this.hover && this.hover.reason ? `<span style="color:#b0402a">${this.hover.reason}</span>` : isTouch() ? 'tap the big button to place' : 'click to place');
      if (!isWallHung(sel.id) && !f.onWall) btn('Turn', () => this.rotate());
      if (sel.type === 'move') btn(isStorable(sel.id) ? 'Store' : 'Put back', () => this.putAwaySel());
      else btn('Cancel', () => this.cancelSel(true));
    } else if (sel && sel.type === 'floor') {
      txt = `<b>${FLOORS[sel.id].name}</b> · ` + (isTouch() ? 'hold the big button and walk to paint' : 'click or hold to paint tiles · right-click for dirt');
      btn('Cancel', () => this.cancelSel(true));
    } else if (this.hoverItem) {
      const f = FURNITURE[this.hoverItem.id];
      txt = `<b>${f.name}</b> · ` + (isStorable(this.hoverItem.id) ? (isTouch() ? 'big button: move' : 'click: move · F: store') : 'it stays in your burrow, but you can move it');
      if (isStorable(this.hoverItem.id)) { const p = this.hoverItem; btn('Store', () => this.putAway(p)); }
    } else if (this.tab === 'wall') txt = 'Pick a wall style for the whole burrow.';
    else txt = 'Pick something, or look at a piece in the room to move it.';
    btn('Done', () => this.toggle(false), false);
    if (this.info.innerHTML !== txt) this.info.innerHTML = txt;
  }

  setTab(k) {
    if (this.tab === k) return;
    this.tab = k;
    this.selIdx = 0;
    this.cancelSel();
    this.render();
    this.game.audio.play('ui_click');
  }

  pickEntry(e) {
    if (!e) return;
    if (e.type === 'wall') { this.applyWall(e.id); return; }
    this.select({ type: e.type, id: e.id });
  }

  /** Wheel / number keys / the touch tool button: step through the strip. */
  cycle(step) {
    const list = this.entries();
    if (!list.length) return;
    this.selIdx = ((this.selIdx + step) % list.length + list.length) % list.length;
    const e = list[this.selIdx];
    if (e.type === 'wall') { this.render(); this.game.audio.play('ui_click'); return; }
    this.pickEntry(e);
  }

  // ------------------------------------------------------------ selection
  select(sel) {
    const same = this.sel && this.sel.id === sel.id && this.sel.type === sel.type;
    this.cancelSel();
    if (same) { this.render(); return; }
    this.sel = sel;
    this.game.audio.play('ui_click');
    if (sel.type === 'new' || sel.type === 'move') { this.r = sel.p ? sel.p.r || 0 : this.r; this.makeGhost(sel.id); }
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
    if (!isStorable(p.id)) { this.game.audio.play('ui_error'); this.flash('That one stays in your burrow. You can move it, though.'); return false; }
    const i = d.home.placed.indexOf(p);
    if (i >= 0) { d.home.placed.splice(i, 1); this.s.removePlaced(p.uid); }
    this.returnPlanter(p);
    st.addItem(p.id, { n: 1 });
    this.s.rebuildCollision();
    this.game.audio.play('remove');
    const [fw, fd] = footprint(p.id, p.r);
    this.s.fx.dust((p.x + fw / 2) * T, 0.08, (p.y + fd / 2) * T, 10, [0.55, 0.45, 0.34], 0.15);
    st.save();
    this.hoverItem = null;
    this.render();
    return true;
  }

  returnPlanter(p) {
    const st = this.game.state, d = st.data;
    const pl = d.home.planters?.[p.uid];
    if (!pl) return;
    if (pl.ready || pl.day < d.day) { st.addItem(pl.id, { n: 3 }); st.learn('planting'); } else st.addItem(pl.id, { n: 1 });
    delete d.home.planters[p.uid];
  }

  putAwaySel() {
    const sel = this.sel;
    if (!sel || sel.type !== 'move') return;
    if (!isStorable(sel.id)) { this.cancelSel(true); this.flash('That one stays in your burrow.'); return; }
    const p = sel.p;
    this.sel = null;
    this.clearGhost();
    this.mark.visible = false;
    const st = this.game.state;
    this.returnPlanter(p);
    st.addItem(p.id, { n: 1 });
    this.game.audio.play('remove');
    st.save();
    this.render();
  }

  /** Place the held piece where the ghost sits. */
  place() {
    const s = this.s, st = this.game.state, d = st.data;
    const sel = this.sel, h = this.hover;
    if (!sel || !h || !h.ok) { this.game.audio.play('ui_error'); if (h?.reason) this.flash(h.reason); return null; }
    let p;
    if (sel.type === 'new') {
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
    this.pop(rec);
    st.learn('building');
    st.save();
    if (!(sel.type === 'new' && (d.furniture[sel.id] || 0) > 0)) { this.sel = null; this.clearGhost(); this.mark.visible = false; }
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

  flash(txt) {
    if (!this.info) return;
    this.info.innerHTML = `<span style="color:#b0402a">${txt}</span>`;
    this.infoHold = 2.2;
  }

  /** Test hook: place `id` at tile (x, y) facing r, from storage (one is added if none is stored). */
  placeDirect(id, x, y, r = 0) {
    if (!FURNITURE[id]) return { ok: false, reason: 'unknown id' };
    const st = this.game.state;
    const chk = canPlace(st.data.home.placed, this.s.W, this.s.D, id, x, y, r);
    if (!chk.ok) return chk;
    if ((st.data.furniture[id] || 0) <= 0) st.addItem(id, { n: 1 });
    const wasActive = this.active;
    if (!wasActive) this.toggle(true);
    this.sel = { type: 'new', id };
    this.makeGhost(id);
    this.hover = { x, y, r, ok: true };
    const p = this.place();
    if (!wasActive) this.toggle(false);
    return { ok: !!p, uid: p?.uid };
  }

  // ------------------------------------------------------------ aiming
  /** The crosshair ray against the floor (y = 0) and the four walls, in tile units. */
  aim() {
    const s = this.s, rig = s.rig;
    const o = rig.eye(_o), d = rig.forward(_d);
    const W = s.W * T, D = s.D * T;
    let floor = null;
    if (d.y < -0.02) {
      const t = -o.y / d.y;
      if (t < 6) floor = { x: (o.x + d.x * t) / T, z: (o.z + d.z * t) / T, t };
    }
    let wall = null;
    const tryWall = (name, t) => {
      if (!(t > 0) || t > 6) return;
      const y = o.y + d.y * t;
      if (y < 0 || y > CEIL) return;
      const x = o.x + d.x * t, z = o.z + d.z * t;
      if (x < -0.01 || z < -0.01 || x > W + 0.01 || z > D + 0.01) return;
      if (!wall || t < wall.t) wall = { wall: name, t, x: x / T, y: y / T, z: z / T, slot: Math.floor((name === 'n' || name === 's' ? x : z) / T) };
    };
    if (d.z < 0) tryWall('n', -o.z / d.z);
    if (d.z > 0) tryWall('s', (D - o.z) / d.z);
    if (d.x < 0) tryWall('w', -o.x / d.x);
    if (d.x > 0) tryWall('e', (W - o.x) / d.x);
    if (floor && wall && wall.t < floor.t) floor = null;
    return { floor, wall };
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
    if (pk.wall) { const p = wallItemAt(placed, pk.wall.wall, pk.wall.slot); if (p) return p; }
    if (pk.floor) return itemAt(placed, Math.floor(pk.floor.x), Math.floor(pk.floor.z));
    return null;
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    const inp = this.game.input, s = this.s;
    if (inp.pressed('KeyX') && !s.scripted && !this.game.ui.isPanelOpen()) (s.toggleBuildHere ? s.toggleBuildHere() : this.toggle());
    if (!this.active) return;
    if (s.scripted) return;
    if (!this.useHammerKind && s.rig.vm) s.rig.vm.toolR.visible = false;
    if (this.infoHold > 0) { this.infoHold -= dt; if (this.infoHold <= 0) this.renderInfo(); }
    if (!inp.enabled || this.game.ui.isPanelOpen()) return;
    // picking from the strip
    if (inp.mouse.wheel) this.cycle(inp.mouse.wheel > 0 ? 1 : -1);
    for (let k = 1; k <= 9; k++) if (inp.pressed('Digit' + k)) { const e = this.entries()[k - 1]; if (e) { this.selIdx = k - 1; this.pickEntry(e); } }
    if (inp.pressed('KeyQ')) this.setTab(this.tab === 'furniture' ? 'floor' : this.tab === 'floor' ? 'wall' : 'furniture');
    const rot = inp.pressed('KeyR') || inp.pressed('KeyE');
    const store = inp.pressed('KeyF') || inp.mousePressed(2);
    const click = s.rig.primaryPressed;
    const pk = this.aim();
    const sel = this.sel;
    this.box.visible = false;
    const prevHover = this.hoverItem;
    this.hoverItem = null;
    let label = '', ok = true;
    if (sel && (sel.type === 'new' || sel.type === 'move')) {
      if (rot) this.rotate();
      this.updateGhost(pk, dt);
      label = this.hover?.ok ? `Place ${FURNITURE[sel.id].name}` : this.hover?.reason || 'Look at the floor';
      ok = !!this.hover?.ok;
      if (click) this.place();
      else if (store) { if (sel.type === 'move') this.putAwaySel(); else this.cancelSel(true); }
    } else if (sel && sel.type === 'floor') {
      const t = pk.floor && { x: Math.floor(pk.floor.x), y: Math.floor(pk.floor.z) };
      const inside = t && t.x >= 0 && t.y >= 0 && t.x < s.W && t.y < s.D;
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
        label = `Pick up ${FURNITURE[p.id].name}`;
        if (click || rot) this.pickUp(p);
        else if (store) this.putAway(p);
      } else label = this.tab === 'wall' ? 'Pick a wall style below' : 'Pick something below';
      this.mark.visible = false;
    }
    // gold label for "place" / "pick up" (no E key cap: it's a click), white when it won't fit
    this.game.ui.setCrosshair?.({ visible: true, kind: ok && (sel || this.hoverItem) ? 'ore' : 'none', label });
    if (prevHover !== this.hoverItem || (sel && (sel.type === 'new' || sel.type === 'move'))) this.renderInfoThrottled(dt);
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
    const W = s.W, D = s.D;
    const fl = pk.floor || (pk.wall ? { x: pk.wall.x, z: pk.wall.z } : null);
    if (!fl) { this.hover = { x: 0, y: 0, r, ok: false, reason: 'Look at the floor' }; if (this.ghost) this.ghost.obj.visible = false; this.mark.visible = false; return; }
    if (f.kind === 'wall') {
      // hang it on the wall under the crosshair (or the one nearest the floor point)
      const wname = pk.wall ? pk.wall.wall : nearestWall(fl.x, fl.z, W, D);
      const slotF = pk.wall ? pk.wall.slot : Math.floor(wname === 'n' || wname === 's' ? fl.x : fl.z);
      const w = f.size[0];
      r = R_OF_WALL[wname];
      const along = wname === 'n' || wname === 's';
      const a = clamp(slotF - Math.floor((w - 1) / 2), 0, (along ? W : D) - w);
      if (wname === 'n') { x = a; y = 0; } else if (wname === 's') { x = a; y = D - 1; } else if (wname === 'w') { x = 0; y = a; } else { x = W - 1; y = a; }
    } else if (f.onWall) {
      const wname = nearestWall(fl.x, fl.z, W, D);
      r = R_OF_WALL[wname];
      const [fw, fd] = footprint(id, r);
      if (wname === 'n') { x = clamp(Math.floor(fl.x - fw / 2 + 0.5), 0, W - fw); y = 0; }
      else if (wname === 's') { x = clamp(Math.floor(fl.x - fw / 2 + 0.5), 0, W - fw); y = D - fd; }
      else if (wname === 'w') { x = 0; y = clamp(Math.floor(fl.z - fd / 2 + 0.5), 0, D - fd); }
      else { x = W - fw; y = clamp(Math.floor(fl.z - fd / 2 + 0.5), 0, D - fd); }
    } else {
      const [fw, fd] = footprint(id, r);
      x = Math.floor(fl.x - fw / 2 + 0.5);
      y = Math.floor(fl.z - fd / 2 + 0.5);
    }
    if (f.kind === 'wall' || f.onWall) this.r = r;
    const chk = canPlace(placed, W, D, id, x, y, r, sel.p?.uid);
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
      if (g.ok !== ok) { g.ok = ok; this.setGhostTint(ok); }
    }
    if (f.kind === 'wall') this.mark.visible = false;
    else { this.mark.visible = true; this.mark.position.set(x + fw / 2, 0.03, y + fd / 2); this.mark.scale.set(fw, 1, fd); }
  }

  dispose() {
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

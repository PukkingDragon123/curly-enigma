// Home build mode: a drawer of unplaced furniture, owned floors and wall styles,
// a snapping ghost preview (green = fits, red = doesn't), rotate, move, put away,
// drag-to-paint floors and one-click wall styles. Toggled by the Build button or X.
import * as THREE from 'three';
import { FURNITURE, FLOORS, WALLS } from '../data/furniture.js';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';
import { el, uid, clamp } from '../core/util.js';
import { buildFurniture } from './furniture.js';
import { footprint, canPlace, itemAt, wallItemAt, isWallHung, isStorable, FUNCTIONAL } from './homeLayout.js';
import { flatPlane } from './IsoScene.js';
import { WALL_H } from './HomeRoom.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

let ghostMats = null;
function ghostMaterials() {
  if (!ghostMats) {
    const mk = (c) => { const m = new THREE.MeshBasicMaterial({ vertexColors: true, color: c, transparent: true, opacity: 0.72, depthWrite: false }); m.userData.shared = true; return m; };
    ghostMats = { ok: mk(0x9cff9c), bad: mk(0xff8a7a) };
  }
  return ghostMats;
}

export class BuildMode {
  constructor(scene) {
    this.s = scene;
    this.game = scene.game;
    this.active = false;
    this.tab = 'furniture';
    this.sel = null; // {type:'new'|'move'|'floor'|'wall', id, p?, orig?}
    this.r = 0;
    this.hover = null;
    this.ghost = null;
    this.painting = false;
    this.lastPaint = null;
    const ui = this.game.ui;
    this.btn = el('button', { class: 'btn interactive', title: 'Build mode (X)', 'aria-label': 'Build mode', style: { position: 'absolute', right: 'calc(var(--px) * 4)', bottom: 'calc(var(--px) * 5)', display: 'flex', alignItems: 'center', gap: 'calc(var(--px) * 2)', fontSize: '1.05em' }, onclick: () => this.toggle() }, [
      el('img', { class: 'pix', src: iconURL('chair_wood'), alt: '', style: { width: 'calc(var(--px) * 12)', height: 'calc(var(--px) * 12)' } }), el('span', {}, 'Build'), el('kbd', { style: { marginLeft: 'var(--px)', marginRight: 0 } }, 'X'),
    ]);
    ui.world.append(this.btn);
    this.drawer = null;
    // scene helpers: footprint marker + tile grid + hover box
    const g = new THREE.Group();
    g.visible = false;
    scene.scene.add(g);
    this.helpers = g;
    this.markMat = new THREE.MeshBasicMaterial({ color: 0x6aff6a, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mark = new THREE.Mesh(flatPlane(), this.markMat);
    this.mark.position.y = 0.025;
    this.mark.renderOrder = 4;
    g.add(this.mark);
    this.gridLines = this.makeGrid();
    g.add(this.gridLines);
    this.boxMat = new THREE.LineBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.95, depthTest: false });
    this.box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), this.boxMat);
    this.box.renderOrder = 9;
    this.box.visible = false;
    g.add(this.box);
  }

  makeGrid() {
    const { W, D } = this.s;
    const pts = [];
    for (let x = 0; x <= W; x++) pts.push(x, 0.012, 0, x, 0.012, D);
    for (let z = 0; z <= D; z++) pts.push(0, 0.012, z, W, 0.012, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  }

  // ------------------------------------------------------------ toggling
  toggle(on = !this.active) {
    const s = this.s;
    if (on === this.active) return;
    if (on && (s.locked || this.game.ui.isPanelOpen())) return;
    this.active = on;
    this.game.audio.play(on ? 'ui_open' : 'ui_close');
    if (on) {
      if (s.seat) s.standUp();
      s.noMove = true;
      s.noPrompt = true;
      this.prevZoom = s.cam.zoomGoal;
      this.prevMax = s.cam.maxZoom;
      s.cam.maxZoom = 22;
      this.frameRoom();
      this.helpers.visible = true;
      this.btn.classList.add('alt');
      this.openDrawer();
    } else {
      this.cancelSel();
      s.noMove = false;
      s.noPrompt = false;
      s.camFocus = null;
      s.cam.maxZoom = this.prevMax ?? 13;
      s.cam.zoomGoal = this.prevZoom ?? 9.6;
      s.cam.bounds = null;
      this.helpers.visible = false;
      this.btn.classList.remove('alt');
      this.closeDrawer();
      this.game.state.save();
    }
  }

  /** Zoom and aim so the whole room sits above the drawer (pan with WASD if it can't). */
  frameRoom() {
    const s = this.s;
    const { W, D } = s;
    const drawer = 0.27; // fraction of the screen the drawer covers
    const top = 2.6 + 0.5, bottom = -0.354 * (W + D) - 0.4; // screen-up extent of the room
    const zoom = clamp((top - bottom) / (1 - drawer), 9, s.cam.maxZoom);
    const uf = top - zoom / 2;
    const fy = 0.4;
    const sum = (0.866 * fy - uf) / 0.354, diff = (W - D) / 2;
    s.cam.zoomGoal = zoom;
    this.focus = new THREE.Vector3((sum + diff) / 2, fy, (sum - diff) / 2);
    s.camFocus = this.focus;
    s.cam.bounds = null;
  }

  // ------------------------------------------------------------ drawer UI
  openDrawer() {
    this.closeDrawer();
    this.tabsEl = el('div', { class: 'tabs', style: { margin: 0 } });
    this.row = el('div', { style: { display: 'flex', gap: 'calc(var(--px) * 2)', overflowX: 'auto', padding: 'calc(var(--px) * 1) 0', minHeight: 'calc(var(--px) * 27)' } });
    this.info = el('div', { class: 'muted', style: { fontSize: '.78em', minWidth: 0, flex: '1 1 auto' } });
    this.actions = el('div', { class: 'row', style: { gap: 'calc(var(--px) * 2)', flexWrap: 'nowrap' } });
    const keys = el('span', { class: 'muted', style: { fontSize: '.7em' }, html: '<kbd>R</kbd>rotate <kbd>Right-click</kbd>put away <kbd>X</kbd>done' });
    const panel = el('div', { class: 'panel', style: { width: 'min(calc(100vw - 40px), calc(var(--px) * 250))', padding: 'calc(var(--px) * 3) calc(var(--px) * 5) calc(var(--px) * 3)', animation: 'none' } }, [
      el('div', { class: 'row', style: { gap: 'calc(var(--px) * 3)' } }, [el('b', { style: { fontFamily: 'var(--font-display)', fontSize: '1.45em', fontWeight: 400, color: 'var(--wood-dk)', lineHeight: 1 } }, 'Decorate'), keys, el('span', { class: 'spacer' }), this.tabsEl]),
      this.row,
      el('div', { class: 'row', style: { flexWrap: 'nowrap', gap: 'calc(var(--px) * 3)' } }, [this.info, this.actions]),
    ]);
    this.drawer = el('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 'calc(var(--px) * 3)', display: 'flex', justifyContent: 'center', pointerEvents: 'none' } }, [panel]);
    this.game.ui.world.append(this.drawer);
    this.renderDrawer();
  }

  closeDrawer() {
    if (this.drawer) this.drawer.remove();
    this.drawer = null;
  }

  renderDrawer() {
    if (!this.drawer) return;
    const st = this.game.state;
    const d = st.data;
    this.tabsEl.innerHTML = '';
    for (const [k, label] of [['furniture', 'Furniture'], ['floor', 'Floors'], ['wall', 'Walls']]) {
      this.tabsEl.append(el('button', { class: 'tab' + (this.tab === k ? ' on' : ''), onclick: () => { this.tab = k; this.cancelSel(); this.renderDrawer(); this.game.audio.play('ui_click'); } }, label));
    }
    this.row.innerHTML = '';
    const slot = (id, n, on, onclick, title) => el('div', { class: 'slot interactive' + (on ? ' on' : ''), title, style: { width: 'calc(var(--px) * 26)', minWidth: 'calc(var(--px) * 26)', height: 'calc(var(--px) * 26)' }, onclick }, [
      el('img', { class: 'pix', src: iconURL(id), alt: title }), n !== null ? el('span', { class: 'n' }, '×' + n) : null,
    ]);
    if (this.tab === 'furniture') {
      const ids = Object.keys(FURNITURE).filter((id) => (d.furniture[id] || 0) > 0);
      if (!ids.length) this.row.append(el('div', { class: 'muted', style: { alignSelf: 'center', fontSize: '.85em' } }, 'Nothing in storage. Burrow & Board sells furniture.'));
      for (const id of ids) this.row.append(slot(id, d.furniture[id], this.sel?.type === 'new' && this.sel.id === id, () => this.select({ type: 'new', id }), FURNITURE[id].name));
    } else if (this.tab === 'floor') {
      for (const id of Object.keys(FLOORS)) if (st.owns(id)) this.row.append(slot(id, null, this.sel?.id === id, () => this.select({ type: 'floor', id }), FLOORS[id].name));
    } else {
      for (const id of Object.keys(WALLS)) if (st.owns(id)) this.row.append(slot(id, null, d.home.wall === id, () => this.applyWall(id), WALLS[id].name));
    }
    this.renderInfo();
  }

  renderInfo() {
    if (!this.drawer) return;
    const sel = this.sel;
    let txt = '';
    this.actions.innerHTML = '';
    if (sel && (sel.type === 'new' || sel.type === 'move')) {
      const f = FURNITURE[sel.id];
      txt = `<b>${f.name}</b> · ${f.size[0]}×${f.size[1]} · ` + (this.hover && this.hover.reason ? `<span style="color:#b0402a">${this.hover.reason}</span>` : 'click to place');
      if (!isWallHung(sel.id)) this.actions.append(el('button', { class: 'btn alt', onclick: () => this.rotate() }, 'Rotate (R)'));
      if (sel.type === 'move') this.actions.append(el('button', { class: 'btn alt', onclick: () => this.putAwaySel() }, isStorable(sel.id) ? 'Put away' : 'Put back'));
      this.actions.append(el('button', { class: 'btn alt', onclick: () => this.cancelSel(true) }, 'Cancel'));
    } else if (sel && sel.type === 'floor') {
      txt = `<b>${FLOORS[sel.id].name}</b> · click or drag over tiles · right-click for dirt`;
      this.actions.append(el('button', { class: 'btn alt', onclick: () => this.cancelSel(true) }, 'Cancel'));
    } else if (this.hoverItem) {
      const f = FURNITURE[this.hoverItem.id];
      txt = `<b>${f.name}</b> · click to move · ` + (isStorable(this.hoverItem.id) ? 'right-click to put away' : 'it stays in your burrow');
      if (isStorable(this.hoverItem.id)) { const p = this.hoverItem; this.actions.append(el('button', { class: 'btn alt', onclick: () => this.putAway(p) }, 'Put away')); }
    } else if (this.tab === 'wall') {
      txt = 'Pick a wall style for the whole burrow.';
    } else {
      txt = 'Pick something below, or click furniture in the room to move it.';
    }
    this.actions.append(el('button', { class: 'btn', onclick: () => this.toggle(false) }, 'Done'));
    if (this.info.innerHTML !== txt) this.info.innerHTML = txt;
  }

  // ------------------------------------------------------------ selection
  select(sel) {
    const same = this.sel && this.sel.id === sel.id && this.sel.type === sel.type;
    this.cancelSel();
    if (same) { this.renderDrawer(); return; }
    this.sel = sel;
    this.game.audio.play('ui_click');
    if (sel.type === 'new' || sel.type === 'move') {
      this.r = sel.p ? sel.p.r || 0 : 0;
      this.makeGhost(sel.id);
    }
    this.renderDrawer();
  }

  makeGhost(id) {
    this.clearGhost();
    const res = buildFurniture(id, this.s.ctxFor({ uid: '__ghost' }));
    const gm = ghostMaterials();
    const extra = [];
    res.obj.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material && o.material.map) {
        const m = new THREE.MeshBasicMaterial({ map: o.material.map, color: 0x9cff9c, transparent: true, opacity: 0.72, depthWrite: false });
        extra.push(m);
        o.material = m;
      } else if (o.geometry.getAttribute('color')) o.material = gm.ok;
      o.renderOrder = 8;
    });
    this.ghost = { obj: res.obj, id, extra };
    this.s.scene.add(res.obj);
  }

  clearGhost() {
    if (!this.ghost) return;
    const g = this.ghost;
    this.s.scene.remove(g.obj);
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
      else if (g.extra.includes(o.material)) o.material.color.setHex(ok ? 0x9cff9c : 0xff8a7a);
    });
    this.markMat.color.setHex(ok ? 0x6aff6a : 0xff4a3a);
  }

  /** Cancel the current selection. A held (moved) item goes back where it was. */
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
    if (rerender) { this.renderDrawer(); this.game.audio.play('ui_close'); }
  }

  rotate() {
    if (!this.sel || !this.ghost || isWallHung(this.sel.id)) return;
    this.r = (this.r + 1) % 4;
    this.game.audio.play('ui_click');
  }

  // ------------------------------------------------------------ actions
  pickUp(p) {
    const s = this.s;
    const home = this.game.state.data.home;
    const i = home.placed.indexOf(p);
    if (i < 0) return;
    home.placed.splice(i, 1);
    s.removePlaced(p.uid);
    s.rebuildCollision();
    this.sel = { type: 'move', id: p.id, p, orig: { x: p.x, y: p.y, r: p.r } };
    this.r = p.r || 0;
    this.makeGhost(p.id);
    this.game.audio.play('remove');
    this.renderDrawer();
  }

  putAway(p) {
    const st = this.game.state;
    const d = st.data;
    if (!isStorable(p.id)) {
      this.game.audio.play('ui_error');
      this.flashInfo('That one stays in your burrow. You can move it, though.');
      return false;
    }
    const i = d.home.placed.indexOf(p);
    if (i >= 0) { d.home.placed.splice(i, 1); this.s.removePlaced(p.uid); }
    this.returnPlanter(p);
    d.furniture[p.id] = (d.furniture[p.id] || 0) + 1;
    st.emit('items', { id: p.id, n: 1 });
    this.s.rebuildCollision();
    this.game.audio.play('remove');
    this.s.particles.dustPuff(p.x + 0.5, 0.1, p.y + 0.5, 6, 0x8a6a4a);
    st.save();
    this.hoverItem = null;
    this.renderDrawer();
    return true;
  }

  /** Stored planters hand back what grew (or the seed). */
  returnPlanter(p) {
    const st = this.game.state;
    const d = st.data;
    const pl = d.home.planters?.[p.uid];
    if (!pl) return;
    if (pl.ready || pl.day < d.day) { st.addItem(pl.id, { n: 3 }); st.learn('planting'); } else st.addItem(pl.id, { n: 1 });
    delete d.home.planters[p.uid];
  }

  putAwaySel() {
    const sel = this.sel;
    if (!sel || sel.type !== 'move') return;
    if (!isStorable(sel.id)) { this.cancelSel(true); this.flashInfo('That one stays in your burrow.'); return; }
    const p = sel.p;
    this.sel = null;
    this.clearGhost();
    this.mark.visible = false;
    const st = this.game.state;
    this.returnPlanter(p);
    st.data.furniture[p.id] = (st.data.furniture[p.id] || 0) + 1;
    st.emit('items', { id: p.id, n: 1 });
    this.game.audio.play('remove');
    st.save();
    this.renderDrawer();
  }

  place() {
    const s = this.s;
    const st = this.game.state;
    const d = st.data;
    const sel = this.sel;
    const h = this.hover;
    if (!h || !h.ok) { this.game.audio.play('ui_error'); return; }
    let p;
    if (sel.type === 'new') {
      if ((d.furniture[sel.id] || 0) <= 0) { this.cancelSel(true); return; }
      st.removeItem(sel.id, 1);
      p = { uid: uid(), id: sel.id, x: h.x, y: h.y, r: h.r };
    } else {
      p = sel.p;
      p.x = h.x; p.y = h.y; p.r = h.r;
    }
    d.home.placed.push(p);
    const rec = s.addPlaced(p);
    s.rebuildCollision();
    if (s.nugget) s.map.resolve(s.nugget.pos, s.nugget.radius);
    this.game.audio.play('place');
    if (rec) s.particles.dustPuff(rec.cx, 0.08, rec.cz, 8, 0x9a7a5a);
    st.learn('building');
    st.save();
    if (sel.type === 'new' && (d.furniture[sel.id] || 0) > 0) {
      // keep the same piece in hand for quick repeats
    } else {
      this.sel = null;
      this.clearGhost();
      this.mark.visible = false;
    }
    this.renderDrawer();
  }

  paint(x, y, id) {
    const s = this.s;
    const home = this.game.state.data.home;
    const k = `${x},${y}`;
    const cur = home.floor[k] || 'floor_dirt';
    if (cur === id) return;
    if (id === 'floor_dirt') delete home.floor[k]; else home.floor[k] = id;
    s.room.paintTile(x, y, id);
    this.game.audio.play('place', { gap: 0.04 });
    this.dirtyFloor = true;
  }

  applyWall(id) {
    const home = this.game.state.data.home;
    if (home.wall === id) return;
    home.wall = id;
    this.s.room.setWall(id);
    this.game.audio.play('place');
    this.game.audio.play('brush');
    this.game.state.save();
    this.renderDrawer();
  }

  flashInfo(txt) {
    if (!this.info) return;
    this.info.innerHTML = `<span style="color:#b0402a">${txt}</span>`;
    this._infoHold = 2.2;
  }

  // ------------------------------------------------------------ picking
  /** Mouse → {tile:{x,y}|null, wall:{wall:'N'|'W', slot, point}|null} */
  pick() {
    const s = this.s;
    const m = this.game.input.mouse;
    const cam = s.cam;
    const g = cam.groundAt(m.nx, m.ny, 0, _a);
    const tile = { x: Math.floor(g.x), y: Math.floor(g.z), fx: g.x, fz: g.z };
    let wall = null;
    const n = cam.planeAt(m.nx, m.ny, 'z', 0, _b);
    const w = cam.planeAt(m.nx, m.ny, 'x', 0, _c);
    const cands = [];
    if (n && n.x >= 0 && n.x <= s.W && n.y >= 0 && n.y <= WALL_H) cands.push({ wall: 'N', slot: Math.floor(n.x), depth: cam.depthOf(n) });
    if (w && w.z >= 0 && w.z <= s.D && w.y >= 0 && w.y <= WALL_H) cands.push({ wall: 'W', slot: Math.floor(w.z), depth: cam.depthOf(w) });
    cands.sort((a, b) => a.depth - b.depth);
    const gd = cam.depthOf(g);
    if (cands.length && (tile.x < 0 || tile.y < 0 || tile.x >= s.W || tile.y >= s.D || cands[0].depth < gd)) wall = cands[0];
    return { tile, wall };
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    const inp = this.game.input;
    const s = this.s;
    if (inp.pressed('KeyX') && !s.locked) this.toggle();
    if (!this.active) return;
    if (this._infoHold > 0) { this._infoHold -= dt; if (this._infoHold <= 0) this.renderInfo(); }
    // pan the view
    const ax = inp.axisX(), ay = inp.axisY();
    if (ax || ay) {
      const dir = s.cam.moveDir(ax, ay, _d);
      this.focus.x = clamp(this.focus.x + dir.x * dt * 6, -2, s.W + 4);
      this.focus.z = clamp(this.focus.z + dir.z * dt * 6, -2, s.D + 4);
    }
    if (inp.pressed('KeyR')) this.rotate();
    if (!inp.enabled) return;
    const pk = this.pick();
    const sel = this.sel;
    const placed = this.game.state.data.home.placed;
    this.box.visible = false;
    const prevHover = this.hoverItem;
    this.hoverItem = null;
    if (sel && (sel.type === 'new' || sel.type === 'move')) {
      this.updateGhost(pk);
      if (inp.mousePressed(0)) this.place();
      else if (inp.mousePressed(2)) { if (sel.type === 'move') this.putAwaySel(); else this.cancelSel(true); }
    } else if (sel && sel.type === 'floor') {
      const t = pk.tile;
      const inside = t.x >= 0 && t.y >= 0 && t.x < s.W && t.y < s.D;
      this.mark.visible = inside;
      if (inside) { this.mark.position.set(t.x + 0.5, 0.025, t.y + 0.5); this.mark.scale.set(1, 1, 1); this.markMat.color.setHex(0x6aff6a); }
      if (inside && inp.mouseDown(0)) this.paint(t.x, t.y, sel.id);
      if (inside && inp.mouseDown(2)) this.paint(t.x, t.y, 'floor_dirt');
      if ((inp.mouseReleased(0) || inp.mouseReleased(2)) && this.dirtyFloor) { this.dirtyFloor = false; s.rebuildCollision(); this.game.state.save(); }
    } else {
      // hover placed things: wall pieces first when pointing at a wall
      let p = null;
      if (pk.wall) p = wallItemAt(placed, pk.wall.wall, pk.wall.slot);
      if (!p && pk.tile) p = itemAt(placed, pk.tile.x, pk.tile.y);
      if (p) {
        this.hoverItem = p;
        this.showBox(p);
        if (inp.mousePressed(0)) this.pickUp(p);
        else if (inp.mousePressed(2)) this.putAway(p);
      }
      this.mark.visible = false;
    }
    if (prevHover !== this.hoverItem || (sel && (sel.type === 'new' || sel.type === 'move'))) this.renderInfo();
  }

  showBox(p) {
    const f = FURNITURE[p.id];
    const [fw, fd] = footprint(p.id, p.r);
    const h = f.kind === 'rug' ? 0.1 : f.kind === 'wall' ? 1.1 : 1.0;
    this.box.visible = true;
    if (f.kind === 'wall') {
      const w = f.size[0];
      if (p.r === 1) { this.box.scale.set(0.2, h, w); this.box.position.set(0.14, 1.62, p.y + w / 2); }
      else { this.box.scale.set(w, h, 0.2); this.box.position.set(p.x + w / 2, 1.62, 0.14); }
    } else {
      this.box.scale.set(fw + 0.06, h, fd + 0.06);
      this.box.position.set(p.x + fw / 2, h / 2, p.y + fd / 2);
    }
    this.boxMat.color.setHex(isStorable(p.id) ? 0xffd34a : 0x9ad0ff);
  }

  updateGhost(pk) {
    const s = this.s;
    const sel = this.sel;
    const id = sel.id;
    const f = FURNITURE[id];
    const placed = this.game.state.data.home.placed;
    let x, y, r = this.r;
    if (f.kind === 'wall') {
      let wall = pk.wall;
      if (!wall) {
        const t = pk.tile;
        wall = t.fz <= t.fx ? { wall: 'N', slot: Math.floor(t.fx) } : { wall: 'W', slot: Math.floor(t.fz) };
      }
      const w = f.size[0];
      if (wall.wall === 'N') { r = 0; y = 0; x = clamp(wall.slot - Math.floor((w - 1) / 2), 0, s.W - w); }
      else { r = 1; x = 0; y = clamp(wall.slot - Math.floor((w - 1) / 2), 0, s.D - w); }
    } else if (f.onWall) {
      const t = pk.tile;
      const [w0, d0] = FURNITURE[id].size;
      if (t.fz <= t.fx) { r = 0; y = 0; x = clamp(Math.floor(t.fx - w0 / 2 + 0.5), 0, s.W - w0); }
      else { r = 1; x = 0; y = clamp(Math.floor(t.fz - w0 / 2 + 0.5), 0, s.D - w0); }
      void d0;
    } else {
      const [fw, fd] = footprint(id, r);
      x = Math.floor(pk.tile.fx - fw / 2 + 0.5);
      y = Math.floor(pk.tile.fz - fd / 2 + 0.5);
    }
    this.r = f.kind === 'wall' || f.onWall ? r : this.r;
    const chk = canPlace(placed, s.W, s.D, id, x, y, r, sel.p?.uid);
    this.hover = { x, y, r, ok: chk.ok, reason: chk.ok ? null : chk.reason };
    const [fw, fd] = footprint(id, r);
    const g = this.ghost;
    if (g) {
      g.obj.position.set(x + fw / 2, 0.01, y + fd / 2);
      g.obj.rotation.y = r * Math.PI / 2;
      if (g.ok !== chk.ok) { g.ok = chk.ok; this.setGhostTint(chk.ok); }
    }
    if (f.kind === 'wall') this.mark.visible = false;
    else {
      this.mark.visible = true;
      this.mark.position.set(x + fw / 2, 0.025, y + fd / 2);
      this.mark.scale.set(fw, 1, fd);
    }
  }

  dispose() {
    this.closeDrawer();
    this.btn.remove();
    this.clearGhost();
    this.game.ui.setHints(null);
  }
}

// The player's burrow: an isometric room you can walk around, decorate and live in.
// Bed (sleep), home forge, stove, Nugget's coop, planters, the index desk, seats,
// lamps and a build mode for placing furniture, painting floors and walls.
import * as THREE from 'three';
import { IsoScene } from '../iso/IsoScene.js';
import { HomeRoom } from '../iso/HomeRoom.js';
import { buildFurniture } from '../iso/furniture.js';
import { footprint, roomSize, doorTile } from '../iso/homeLayout.js';
import { BuildMode } from '../iso/BuildMode.js';
import { WATER_TIME } from '../iso/water.js';
import { FURNITURE } from '../data/furniture.js';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';
import { el, rand, pick, clamp } from '../core/util.js';
import { midiToFreq } from '../core/Audio.js';

const _v = new THREE.Vector3();
const TUNE = [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 79, 84, 83, 79, 76, 74];

export default class HomeScene extends IsoScene {
  async enter(params = {}) {
    this.hud = 'home';
    this.music = 'home';
    const st = this.game.state;
    const d = st.data;
    st.flag('lastScene', 'home');
    if (!d.home.planters) d.home.planters = {};
    if (!d.home.floor) d.home.floor = {};
    const [W, D] = roomSize(d.home.level);
    this.W = W;
    this.D = D;
    this.initIso({ w: W, h: D, zoom: 9.6, minZoom: 6.5, maxZoom: 13, lights: 6, lightRange: 16, bg: 0x110b0f });
    this.cam.bounds = null;
    this.post = { vignette: 0.42 };
    WATER_TIME.value = 0;

    // lighting: warm burrow ambience + a key light that separates the voxel faces
    this.scene.add(new THREE.HemisphereLight(0xffdcb8, 0x3a2418, 1.15));
    const key = new THREE.DirectionalLight(0xffe2c4, 0.85);
    key.position.set(-3, 9, 7);
    this.scene.add(key);

    this.room = new HomeRoom(this.scene);
    this.room.build(W, D, d.home.wall, d.home.floor);
    this.own(() => this.room.dispose());
    for (const L of this.room.sconces) {
      this.addLight({ x: L.x, y: L.y, z: L.z, color: 0xffc27a, intensity: 6.5, distance: 8, flicker: 0.1, pool: 2.2, poolOpacity: 0.16, poolX: L.x + (L.z < 0.5 ? 0 : 1.1), poolZ: L.z + (L.z < 0.5 ? 1.1 : 0), halo: 0.75, haloOpacity: 0.5, priority: 3 });
    }

    // furniture
    this.items = new Map();
    for (const p of d.home.placed) this.addPlaced(p);
    this.rebuildCollision();

    // door to town, poster
    const door = doorTile(W, D);
    this.doorPos = { x: 0.55, z: door.y + 0.5 };
    this.addInteractable({ x: this.doorPos.x, z: this.doorPos.z, r: 1.15, label: 'Out to Deep Town', action: () => this.leave() });
    this.addInteractable({ x: this.room.poster.cx, z: 0.7, r: 1.0, priority: -0.2, label: 'Look at the poster', action: () => this.lookPoster() });

    // player & Nugget
    const from = params.from || 'continue';
    this.spawnByFrom(from);
    const coop = this.findKind('coop');
    const nx = coop ? coop.p.x + 0.5 : this.player.x + 0.8, nz = coop ? coop.p.y + 1.4 : this.player.z + 0.6;
    const ns = this.map.freeAt(nx, nz, 0.2) ? [nx, nz] : [this.player.x + 0.7, this.player.z + 0.5];
    this.spawnNugget(ns[0], ns[1]);
    this.map.resolve(this.nugget.pos, 0.17);
    this.nuggetAI.home = { x0: 0, z0: 0, x1: W - 1, z1: D - 1 };
    this.napT = rand(25, 45);
    { const k = clamp((W + D - 18) / 12, 0.22, 0.85); this.cam.snap(_v.set(W / 2 + 0.2 + (this.player.x - W / 2 - 0.2) * k, 0.6, D / 2 + 0.4 + (this.player.z - D / 2 - 0.4) * k)); }

    // build mode
    this.build = new BuildMode(this);
    this.own(() => this.build.dispose());
    this.musicBox = { on: false, t: 0, i: 0 };
    this.ambientLoop('forge_fire', () => this.nearKindVol('forge', 4.5, 0.35));
    this.ambientLoop('fire', () => this.nearKindVol('fireplace', 5, 0.4) + this.nearKindVol('stove', 3, 0.15));
    this.ambientLoop('water', () => this.nearKindVol('fountain', 4, 0.22) + this.nearKindVol('fish_tank', 2.5, 0.08));

    if (from === 'newgame') this.wakeUp(this.findKind('bed'), true);
  }

  // ------------------------------------------------------------ furniture records
  findKind(kind) {
    for (const it of this.items.values()) if (FURNITURE[it.p.id]?.kind === kind || it.p.id === kind) return it;
    return null;
  }

  nearKindVol(kind, range, vol) {
    if (!this.player) return 0;
    let best = Infinity;
    for (const it of this.items.values()) {
      if (FURNITURE[it.p.id]?.kind !== kind && it.p.id !== kind) continue;
      best = Math.min(best, Math.hypot(it.cx - this.player.x, it.cz - this.player.z));
    }
    return best < range ? vol * (1 - best / range) : 0;
  }

  ctxFor(p) {
    const d = this.game.state.data;
    const pl = d.home.planters[p.uid];
    return {
      eggs: d.chicken.eggs || 0,
      planter: pl ? { ...pl, ready: pl.ready || pl.day < d.day } : null,
      items: ITEMS,
      weapons: d.weapons,
      state: this.game.state,
    };
  }

  addPlaced(p) {
    const f = FURNITURE[p.id];
    if (!f) return null;
    const res = buildFurniture(p.id, this.ctxFor(p));
    const [fw, fd] = footprint(p.id, p.r);
    const obj = res.obj;
    obj.position.set(p.x + fw / 2, 0, p.y + fd / 2);
    obj.rotation.y = (p.r || 0) * Math.PI / 2;
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    const rec = { p, res, obj, fw, fd, cx: p.x + fw / 2, cz: p.y + fd / 2, lights: [], its: [], emitters: [] };
    const toWorld = (x, y, z) => _v.set(x, y, z).applyMatrix4(obj.matrixWorld);
    for (const l of res.lights) {
      const w = toWorld(l.x, l.y, l.z).clone();
      const o = { ...l, x: w.x, y: w.y, z: w.z };
      if (l.poolX !== undefined || l.poolZ !== undefined) { const pw = toWorld(l.poolX ?? 0, 0, l.poolZ ?? 0); o.poolX = pw.x; o.poolZ = pw.z; }
      if (l.hx !== undefined || l.hy !== undefined || l.hz !== undefined) { const hw = toWorld(l.hx ?? l.x, l.hy ?? l.y, l.hz ?? l.z); o.hx = hw.x; o.hy = hw.y; o.hz = hw.z; }
      if (l.intensity === 0 && l.real !== false) o.real = false;
      const src = this.addLight(o);
      src.on = !this.game.state.flag('lampOff:' + p.uid);
      rec.lights.push(src);
    }
    this.addEmitters(rec);
    this.addItemInteractions(rec);
    this.items.set(p.uid, rec);
    return rec;
  }

  removePlaced(uid) {
    const rec = this.items.get(uid);
    if (!rec) return;
    this.scene.remove(rec.obj);
    rec.obj.traverse((o) => {
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      if (o.material && !o.material.userData?.shared) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    for (const s of rec.lights) this.removeLight(s);
    for (const it of rec.its) this.removeInteractable(it);
    for (const e of rec.emitters) this.particles.removeEmitter(e);
    this.items.delete(uid);
  }

  refreshPlaced(uid) {
    const rec = this.items.get(uid);
    if (!rec) return;
    const p = rec.p;
    this.removePlaced(uid);
    this.addPlaced(p);
  }

  rebuildCollision() {
    const map = this.map;
    map.solid.fill(0);
    for (const rec of this.items.values()) {
      const f = FURNITURE[rec.p.id];
      if (!f || f.kind === 'rug' || f.kind === 'wall') continue;
      map.fill(rec.p.x, rec.p.y, rec.fw, rec.fd, 1);
    }
    // floor sounds follow the painted floor
    const floors = this.game.state.data.home.floor;
    for (let y = 0; y < this.D; y++) for (let x = 0; x < this.W; x++) {
      const id = floors[`${x},${y}`] || 'floor_dirt';
      map.setMat(x, y, id === 'floor_plank' ? 'wood' : id === 'floor_dirt' || id === 'floor_moss' || id === 'floor_carpet' ? 'dirt' : 'stone');
    }
    for (const rec of this.items.values()) if (FURNITURE[rec.p.id]?.kind === 'rug') map.fillMat(rec.p.x, rec.p.y, rec.fw, rec.fd, 'dirt');
    if (this.player && !this.seat && !this.playerPosed) this.map.resolve(this.player.pos, this.player.radius);
  }

  addEmitters(rec) {
    const r = rec.res, P = this.particles;
    const w = (o) => _v.set(o.x, o.y, o.z).applyMatrix4(rec.obj.matrixWorld).clone();
    if (r.embers) {
      const e = w(r.embers);
      rec.emitters.push(P.addEmitter({ every: 0.22, emit: (p) => p.spawn({ x: e.x + rand(-0.3, 0.3), y: e.y, z: e.z + rand(-0.1, 0.1), vy: rand(0.6, 1.2), vx: rand(-0.1, 0.1), life: rand(0.8, 1.6), size: 1.2, color: 0xffc040, color2: 0xff4a10, alpha: 1, alpha2: 0, add: true, wob: 0.6 }) }));
    }
    if (r.steam) {
      const e = w(r.steam);
      rec.emitters.push(P.addEmitter({ every: 0.45, emit: (p) => p.spawn({ x: e.x + rand(-0.05, 0.05), y: e.y, z: e.z, vy: rand(0.3, 0.5), life: rand(1.2, 1.8), size: 2, size2: 4, color: 0xf0f0f0, alpha: 0.4, alpha2: 0, wob: 0.4 }) }));
    }
    if (r.bubbles) {
      const e = w(r.bubbles);
      const top = r.bubbles.top;
      rec.emitters.push(P.addEmitter({ every: 0.5, emit: (p) => p.spawn({ x: e.x + rand(-0.04, 0.04), y: e.y, z: e.z, vy: 0.35, life: (top - r.bubbles.y) / 0.35, size: 1.4, color: 0xe8f8ff, alpha: 0.8, alpha2: 0.5 }) }));
    }
    if (r.spray) {
      const e = w(r.spray);
      const s = r.spray;
      rec.emitters.push(P.addEmitter({
        every: 0.05,
        emit: (p) => {
          const a = Math.random() * Math.PI * 2;
          p.spawn({ x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * rand(0.2, 0.45), vz: Math.sin(a) * rand(0.2, 0.45), vy: rand(0.6, 0.9), grav: 4, life: 0.75, size: 1.4, color: 0xd8f6ff, color2: 0x7ac8f0, alpha: 0.9, alpha2: 0.3, fn: (q) => { if (q.y < rec.obj.position.y + s.basinY) q.dead = true; } });
        },
      }));
    }
  }

  addItemInteractions(rec) {
    const p = rec.p;
    const f = FURNITURE[p.id];
    const st = this.game.state;
    const r = Math.max(rec.fw, rec.fd) / 2 + 0.72;
    const add = (o) => rec.its.push(this.addInteractable({ x: rec.cx, z: rec.cz, r, ...o }));
    switch (f.kind) {
      case 'bed': add({ label: 'Sleep', action: () => this.trySleep(rec) }); break;
      case 'forge': add({ label: 'Work the forge', action: () => this.go('forge', rec) }); break;
      case 'stove': add({ label: 'Cook', action: () => this.go('cooking', rec) }); break;
      case 'coop': add({ label: () => (st.data.chicken.eggs > 0 ? `Collect eggs (${st.data.chicken.eggs})` : 'Check the coop'), action: () => this.collectEggs(rec) }); break;
      case 'planter': add({ label: () => this.planterLabel(rec), action: () => this.usePlanter(rec) }); break;
      case 'desk': add({ label: 'Write in the Index Book', action: () => { this.game.audio.play('page'); this.game.ui.openIndex(); } }); break;
      case 'seat': add({ label: 'Sit', action: () => this.sitAt(rec) }); break;
      case 'light':
        add({ label: () => (rec.lights[0]?.on === false ? 'Light it' : 'Put it out'), action: () => this.toggleLamp(rec), priority: -0.3 });
        break;
      default:
        if (p.id === 'music_box') add({ label: () => (this.musicBox.on ? 'Stop the music box' : 'Wind the music box'), action: () => this.toggleMusicBox() });
    }
  }

  // ------------------------------------------------------------ spawning
  spawnByFrom(from) {
    const W = this.W, D = this.D;
    let spot = null;
    if (from === 'forge' || from === 'stove' || from === 'cooking') {
      const rec = this.findKind(from === 'forge' ? 'forge' : 'stove');
      if (rec) spot = this.besideItem(rec);
    }
    if (from === 'newgame' || from === 'bed') {
      const rec = this.findKind('bed');
      if (rec) spot = this.besideItem(rec);
    }
    if (!spot) {
      spot = { x: this.doorPos.x + 0.35, z: this.doorPos.z, yaw: Math.PI / 2 };
      if (from === 'town') this.game.audio.play('door');
    }
    this.spawnPlayer(spot.x, spot.z, spot.yaw ?? 0);
    this.map.resolve(this.player.pos, this.player.radius);
    if (spot.face) this.player.faceToward(spot.face.x, spot.face.z, true);
  }

  /** A free spot next to an item, preferring its front. */
  besideItem(rec) {
    const { p, fw, fd } = rec;
    const yaw = (p.r || 0) * Math.PI / 2;
    const fx = Math.round(Math.sin(yaw)), fz = Math.round(Math.cos(yaw));
    const cands = [];
    const push = (x, y) => { if (!this.map.blocked(x, y)) cands.push({ x: x + 0.5, z: y + 0.5 }); };
    // front row first
    if (fz > 0) for (let x = p.x; x < p.x + fw; x++) push(x, p.y + fd);
    if (fz < 0) for (let x = p.x; x < p.x + fw; x++) push(x, p.y - 1);
    if (fx > 0) for (let y = p.y; y < p.y + fd; y++) push(p.x + fw, y);
    if (fx < 0) for (let y = p.y; y < p.y + fd; y++) push(p.x - 1, y);
    for (let y = p.y - 1; y <= p.y + fd; y++) for (let x = p.x - 1; x <= p.x + fw; x++) push(x, y);
    const c = cands[0];
    if (!c) return null;
    return { x: c.x, z: c.z, face: { x: rec.cx, z: rec.cz } };
  }

  // ------------------------------------------------------------ interactions
  go(scene, rec) {
    this.locked = true;
    this.player.faceToward(rec.cx, rec.cz);
    this.game.audio.play(scene === 'forge' ? 'clunk' : 'stir');
    this.game.goto(scene, { from: 'home' });
  }

  leave() {
    this.locked = true;
    this.game.audio.play('door');
    this.player.faceToward(-1, this.doorPos.z);
    this.game.goto('town', { from: 'home' }, { transition: 'iris', center: this.screenUV(this.player) });
  }

  screenUV(a) {
    const s = this.toScreen(a.headPos(_v));
    const e = this.game.engine;
    return [clamp(s.x / (e.width * e.scale), 0, 1), clamp(1 - s.y / (e.height * e.scale), 0, 1)];
  }

  lookPoster() {
    const p = this.player;
    p.faceToward(this.room.poster.cx, -1);
    this.emote(p, '☀', { color: '#e0a020' });
    this.game.audio.play('glow');
  }

  floatAt(x, y, z, text, color = '#fff') {
    const s = this.toScreen(_v.set(x, y, z));
    this.game.ui.floatText(text, s.x, s.y, color);
  }

  collectEggs(rec) {
    const st = this.game.state;
    const d = st.data;
    const n = d.chicken.eggs || 0;
    this.player.faceToward(rec.cx, rec.cz);
    if (n <= 0) {
      this.game.audio.play('cluck', { n: 1 });
      this.floatAt(rec.cx, 1.1, rec.cz, 'Just straw', '#e6dcc8');
      return;
    }
    st.addItem('egg', { n });
    d.chicken.eggs = 0;
    d.stats.eggs = (d.stats.eggs || 0) + n;
    st.learn('eggs');
    this.game.audio.play('cluck', { n: 2, gap: 0 });
    this.game.audio.play('pickup', { pitch: 1.2 });
    if (rec.res.setEggs) rec.res.setEggs(0);
    this.floatAt(rec.cx, 1.1, rec.cz, `+${n} egg${n > 1 ? 's' : ''}`, '#fff4d0');
    if (this.nugget) this.emote(this.nugget, '♥');
    st.save();
  }

  planterLabel(rec) {
    const d = this.game.state.data;
    const pl = d.home.planters[rec.p.uid];
    if (!pl) return 'Plant something';
    if (pl.ready || pl.day < d.day) return `Harvest ${ITEMS[pl.id]?.name || ''}`;
    return 'Check the sprout';
  }

  usePlanter(rec) {
    const st = this.game.state;
    const d = st.data;
    const uid = rec.p.uid;
    const pl = d.home.planters[uid];
    this.player.faceToward(rec.cx, rec.cz);
    if (pl && (pl.ready || pl.day < d.day)) {
      st.addItem(pl.id, { n: 3 });
      delete d.home.planters[uid];
      st.learn('planting');
      this.game.audio.play('pickup');
      this.game.audio.play('sparkle');
      this.particles.burst(8, { x: rec.cx, y: 0.6, z: rec.cz, vy: 1, life: 0.7, size: 1.5, color: 0xa8f07a, alpha: 1, alpha2: 0, add: true, grav: 2 }, { x: 0.2, z: 0.2, v: 0.6 });
      this.floatAt(rec.cx, 1, rec.cz, `+3 ${ITEMS[pl.id]?.name || ''}`, '#d8ffb0');
      rec.res.setPlant?.(null, ITEMS);
      st.save();
      return;
    }
    if (pl) {
      this.emote(this.player, '…');
      this.floatAt(rec.cx, 0.9, rec.cz, 'Growing', '#d8ffb0');
      return;
    }
    const plants = st.inventory((it) => it && it.cat === 'plant');
    if (!plants.length) {
      this.game.audio.play('ui_error');
      this.floatAt(rec.cx, 0.9, rec.cz, 'No plants to sow', '#e6dcc8');
      return;
    }
    const list = el('div', { class: 'list' });
    const h = this.game.ui.openPanel({ title: 'Planter', sub: 'Pick something to plant.', body: el('div', { class: 'scroll', style: { maxHeight: 'calc(var(--px) * 110)' } }, [list]), width: 'calc(var(--px) * 170)' });
    for (const g of plants) {
      const it = ITEMS[g.id];
      list.append(el('div', { class: 'li interactive', style: { cursor: 'pointer' }, onclick: () => {
        if (st.count(g.id) <= 0) return;
        st.removeItem(g.id, 1);
        d.home.planters[uid] = { id: g.id, day: d.day };
        this.game.audio.play('place');
        this.particles.dustPuff(rec.cx, 0.45, rec.cz, 6, 0x5a3a22);
        rec.res.setPlant?.({ id: g.id, ready: false }, ITEMS);
        st.save();
        h.close();
      } }, [el('img', { class: 'pix', src: iconURL(g.id), alt: '' }), el('div', {}, [el('div', { class: 'name' }, it.name), el('div', { class: 'desc' }, it.desc || '')]), el('span', { class: 'price' }, '×' + g.n)]));
    }
  }

  sitAt(rec) {
    const seats = rec.res.seats || [{ x: 0, z: 0, y: 0.4, yaw: 0 }];
    let best = seats[0], bd = Infinity;
    for (const s of seats) {
      const w = _v.set(s.x, 0, s.z).applyMatrix4(rec.obj.matrixWorld);
      const dd = Math.hypot(w.x - this.player.x, w.z - this.player.z);
      if (dd < bd) { bd = dd; best = s; }
    }
    const w = _v.set(best.x, 0, best.z).applyMatrix4(rec.obj.matrixWorld).clone();
    const yaw = (best.yaw || 0) + (rec.p.r || 0) * Math.PI / 2;
    const ex = w.x + Math.sin(yaw) * 0.8, ez = w.z + Math.cos(yaw) * 0.8;
    const exit = this.map.freeAt(ex, ez, 0.25) ? { x: ex, z: ez } : { x: this.player.x, z: this.player.z };
    this.sitOn({ x: w.x, z: w.z, y: best.y - 0.2, yaw, exitX: exit.x, exitZ: exit.z });
  }

  toggleLamp(rec) {
    const st = this.game.state;
    const on = !(rec.lights[0]?.on ?? true);
    for (const s of rec.lights) s.on = on;
    st.flag('lampOff:' + rec.p.uid, on ? undefined : true);
    if (on) delete st.data.flags['lampOff:' + rec.p.uid];
    rec.obj.traverse((o) => { if (o.isMesh && o.material?.type === 'MeshBasicMaterial' && o.material.vertexColors) o.visible = on; });
    this.game.audio.play('click');
  }

  toggleMusicBox() {
    const mb = this.musicBox;
    mb.on = !mb.on;
    mb.t = 0;
    this.game.audio.play('click');
  }

  tickMusicBox(dt) {
    const mb = this.musicBox;
    if (!mb.on) return;
    const rec = this.findKind('music_box');
    if (!rec) { mb.on = false; return; }
    mb.t -= dt;
    if (mb.t <= 0) {
      mb.t = 0.32;
      const note = TUNE[mb.i++ % TUNE.length];
      const a = this.game.audio;
      const dist = Math.hypot(rec.cx - this.player.x, rec.cz - this.player.z);
      const vol = clamp(1.2 - dist / 9, 0.15, 1);
      a.tone({ f: midiToFreq(note), type: 'sine', dur: 0.5, vol: 0.05 * vol, release: 0.4, reverb: 0.5 });
      a.tone({ f: midiToFreq(note + 12), type: 'sine', dur: 0.15, vol: 0.015 * vol, reverb: 0.3 });
      if (mb.i % 6 === 0) {
        this.particles.spawn({ x: rec.cx + rand(-0.15, 0.15), y: 0.95, z: rec.cz, vy: 0.4, vx: rand(-0.1, 0.1), life: 1.4, size: 2, color: 0xf0d0ff, alpha: 1, alpha2: 0, add: true, wob: 0.5 });
      }
    }
  }

  // ------------------------------------------------------------ bed
  bedPose(rec) {
    const lie = rec.res.lie || { y: 0.5, foot: 0.75 };
    const yaw = (rec.p.r || 0) * Math.PI / 2;
    return { lie, yaw };
  }

  lieDown(rec) {
    const p = this.player;
    const { lie, yaw } = this.bedPose(rec);
    this.playerPosed = true;
    p.collide = false;
    p.vx = p.vz = 0;
    p.pos.set(rec.cx, 0, rec.cz);
    p.rig.face(0, true);
    p.body.rotation.order = 'YXZ';
    p.body.rotation.set(-Math.PI / 2, yaw, 0);
    const lx = lie.x || 0, lz = lie.foot;
    p.body.position.set(Math.cos(yaw) * lx + Math.sin(yaw) * lz, lie.y + 0.12, -Math.sin(yaw) * lx + Math.cos(yaw) * lz);
    p.rig.play('sleep');
    p.shadow.visible = false;
  }

  sitUpInBed(rec) {
    const p = this.player;
    const { lie, yaw } = this.bedPose(rec);
    p.body.rotation.set(0, 0, 0);
    p.body.position.set(0, lie.y - 0.25, 0);
    p.pos.set(rec.cx + Math.sin(yaw) * 0.15, 0, rec.cz + Math.cos(yaw) * 0.15);
    p.rig.face(yaw + Math.PI / 2, true);
    p.rig.play('sit');
  }

  getUp(rec) {
    const p = this.player;
    const spot = this.besideItem(rec) || { x: rec.cx + 1, z: rec.cz };
    p.body.rotation.set(0, 0, 0);
    p.body.position.set(0, 0, 0);
    p.pos.set(spot.x, 0, spot.z);
    p.collide = true;
    p.shadow.visible = true;
    this.map.resolve(p.pos, p.radius);
    p.faceToward(this.W * 0.6, this.D * 0.7, true);
    p.rig.play('idle');
    this.playerPosed = false;
  }

  async wakeUp(rec, first = false) {
    if (!rec) return;
    this.locked = true;
    this.lieDown(rec);
    if (first) this.post.fade = 1;
    if (first) await this.tween(1.6, (k) => { this.post.fade = 1 - k; });
    await this.sleepFor(first ? 1.0 : 0.4);
    this.game.audio.play('yawn');
    this.emote(this.player, '…', { life: 1.4 });
    await this.sleepFor(0.8);
    this.sitUpInBed(rec);
    this.game.audio.play('step', { mat: 'wood' });
    await this.sleepFor(0.9);
    this.getUp(rec);
    this.player.rig.doEmote('hop', 0.5);
    this.game.audio.play('land', { vol: 0.5 });
    if (this.nugget && this.nuggetAI) { this.nuggetAI.wake(); this.game.audio.play('cluck', { n: 2 }); }
    this.locked = false;
    if (first) this.game.ui.toast(`Day ${this.game.state.data.day}`);
  }

  async trySleep(rec) {
    const ok = await this.game.ui.confirm('Sleep until morning?', 'Sleep', 'Not yet');
    if (!ok || this.locked) return;
    const st = this.game.state;
    const d = st.data;
    this.locked = true;
    this.game.audio.play('yawn');
    this.lieDown(rec);
    const coop = this.findKind('coop');
    if (coop && coop.res.nap) this.sendNuggetToNap(coop, 999);
    const eggsBefore = d.chicken.eggs || 0;
    await this.tween(1.4, (k) => { this.post.fade = k; });
    this.game.audio.play('snore');
    await this.sleepFor(1.3);
    this.game.audio.play('snore');
    this.game.sleep();
    this.refreshDayVisuals();
    await this.sleepFor(0.8);
    await this.tween(1.2, (k) => { this.post.fade = 1 - k; });
    this.post.fade = 0;
    const laid = (d.chicken.eggs || 0) - eggsBefore;
    const name = d.chicken.name || 'Nugget';
    this.game.ui.toast(`<b>Day ${d.day}</b>` + (laid > 0 ? ` · ${name} laid ${laid === 1 ? 'an egg' : laid + ' eggs'}!` : ''), { kind: 'good', dur: 3400 });
    await this.wakeUp(rec, false);
  }

  refreshDayVisuals() {
    for (const rec of [...this.items.values()]) {
      const k = FURNITURE[rec.p.id]?.kind;
      if (k === 'coop' && rec.res.setEggs) rec.res.setEggs(this.game.state.data.chicken.eggs || 0);
      if (k === 'planter' && rec.res.setPlant) rec.res.setPlant(this.ctxFor(rec.p).planter, ITEMS);
    }
  }

  sendNuggetToNap(coop, secs) {
    const n = coop.res.nap;
    const w = _v.set(n.x, 0, n.z).applyMatrix4(coop.obj.matrixWorld);
    this.nuggetAI.nap({ x: w.x, z: w.z, y: n.y, yaw: (coop.p.r || 0) * Math.PI / 2 }, secs);
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    WATER_TIME.value += dt;
    this.build.update(dt);
    if (!this.build.active && this.player) {
      // soft follow: small rooms stay framed, big rooms follow the player more
      const k = clamp((this.W + this.D - 18) / 12, 0.22, 0.85);
      const cx = this.W / 2 + 0.2, cz = this.D / 2 + 0.4;
      this.homeFocus = this.homeFocus || new THREE.Vector3();
      this.homeFocus.set(cx + (this.player.x - cx) * k, 0.6, cz + (this.player.z - cz) * k);
      this.camFocus = this.homeFocus;
    }
    super.update(dt);
    const env = { near: 99, audio: this.game.audio, playing: this.musicBox.on };
    for (const rec of this.items.values()) {
      if (!rec.res.update) continue;
      env.near = this.player ? Math.hypot(rec.cx - this.player.x, rec.cz - this.player.z) : 99;
      env.playing = this.musicBox.on && rec.p.id === 'music_box';
      rec.res.update(dt, this.time, env);
    }
    this.tickMusicBox(dt);
    // Nugget naps in her coop now and then
    if (this.nuggetAI && !this.locked) {
      this.napT -= dt;
      const coop = this.findKind('coop');
      if (this.napT <= 0) {
        this.napT = rand(40, 70);
        if (coop && coop.res.nap && this.nuggetAI.mode === 'follow' && this.nuggetAI.idleFor > 3) this.sendNuggetToNap(coop, rand(14, 24));
      }
    }
  }

  exit() {
    super.exit();
  }
}

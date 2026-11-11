// Living in your alcoves (mixed into HomeScene): the planters, sitting down (in your alcoves or by
// Old Star's fire), lamps, the music box, snacks, and the bed (your bedroll on the floor, or a bed
// you've put in your alcove): lying down, sleeping through to the next day and getting up again,
// all in first person.
import * as THREE from 'three';
import { FURNITURE } from '../data/furniture.js';
import { ITEMS } from '../data/items.js';
import { rand, pick, clamp } from '../core/util.js';
import { midiToFreq } from '../core/Audio.js';
import { T } from './units.js';
import { besideItem } from './layoutfix.js';
import { openSeedTray } from '../ui/choices.js';

const _v = new THREE.Vector3();
const TUNE = [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 79, 84, 83, 79, 76, 74];

export class HomeLiving {
  // ------------------------------------------------------------ interactions
  go(scene, rec) {
    this.beginScript();
    this.game.audio.play(scene === 'forge' ? 'clunk' : 'stir');
    this.game.goto(scene, { from: 'home' });
    void rec;
  }

  /** The mole's own thoughts: a bubble low in the middle of the view. */
  think(html, life = 3.6) {
    const e = this.game.engine;
    const W = e.width * e.scale, H = e.height * e.scale;
    this.game.ui.bubble('self', html, W / 2, H * 0.74, { life });
  }

  floatAt(x, y, z, text, color = '#fff') {
    const s = this.toScreen(_v.set(x, y, z));
    if (s.visible) this.game.ui.floatText(text, s.x, s.y, color);
  }

  planterLabel(rec) {
    const d = this.game.state.data;
    const pl = d.home.planters[rec.p.uid];
    if (!pl) return 'Plant something';
    if (pl.ready || pl.day < d.day) return `Harvest ${ITEMS[pl.id]?.name || ''}`;
    return 'Check the sprout';
  }

  usePlanter(rec) {
    const st = this.game.state, d = st.data;
    const uid = rec.p.uid;
    const pl = d.home.planters[uid];
    const cx = rec.cx * T, cz = rec.cz * T, top = rec.bbox.max.y;
    if (pl && (pl.ready || pl.day < d.day)) {
      st.addItem(pl.id, { spill: true, n: 3 });
      delete d.home.planters[uid];
      st.learn('planting');
      this.game.audio.play('pickup');
      this.game.audio.play('sparkle');
      for (let i = 0; i < 10; i++) this.fx.spawn({ x: cx + rand(-0.1, 0.1), y: top, z: cz + rand(-0.1, 0.1), vx: rand(-0.3, 0.3), vy: rand(0.4, 1), vz: rand(-0.3, 0.3), life: 0.8, size: 0.012, color: [0.66, 0.94, 0.48], glow: true, grav: 1.5 });
      rec.res.setPlant?.(null, ITEMS);
      st.save();
      return;
    }
    if (pl) { this.game.ui.toast('Still growing.', { dur: 1800 }); return; }
    const plants = st.inventory((it) => it && it.cat === 'plant');
    if (!plants.length) { this.game.audio.play('ui_error'); this.game.ui.toast('Nothing to plant.', { dur: 1800 }); return; }
    // a wooden seed box of paper seed packets (ui/choices.js)
    const h = openSeedTray(this.game, {
      title: 'Planter', note: 'Pick a seed to sow. It grows by morning.',
      items: plants.map((gi) => ({ id: gi.id, n: gi.n })),
      onPick: (id) => {
        if (st.count(id) <= 0) return;
        st.removeItem(id, 1);
        d.home.planters[uid] = { id, day: d.day };
        this.game.audio.play('place');
        this.fx.dust(cx, top, cz, 6, [0.36, 0.24, 0.14], 0.08);
        rec.res.setPlant?.({ id, ready: false }, ITEMS);
        st.save();
        setTimeout(() => h.close(), 260);
      },
    });
  }

  /** Sit down: the view drops to the seat, facing the way it faces. E or a step stands up. rec: a placed piece or a hall seat ({ obj, seats }). */
  sitAt(rec) {
    const seats = rec.res?.seats || rec.seats || [{ x: 0, z: 0, y: 0.4, yaw: 0 }];
    const pl = this.rig.player;
    let best = seats[0], bd = Infinity;
    for (const s of seats) {
      const w = _v.set(s.x, 0, s.z).applyMatrix4(rec.obj.matrixWorld);
      const dd = Math.hypot(w.x - pl.pos.x, w.z - pl.pos.z);
      if (dd < bd) { bd = dd; best = s; }
    }
    const w = _v.set(best.x, best.y ?? 0.4, best.z).applyMatrix4(rec.obj.matrixWorld).clone();
    const f = (best.yaw || 0) + rec.obj.rotation.y;
    this.beginScript(true);
    const back = { x: pl.pos.x, z: pl.pos.z };
    this.seat = { back, rec };
    const yaw = f + Math.PI;
    const c = this.cam, x0 = c.x, y0 = c.y, z0 = c.z, yw0 = c.yaw;
    const dyaw = Math.atan2(Math.sin(yaw - yw0), Math.cos(yaw - yw0));
    this.game.audio.play('step', { mat: 'wood' });
    this.tween(0.45, (k) => {
      const e = k * k * (3 - 2 * k);
      c.x = x0 + (w.x - x0) * e; c.z = z0 + (w.z - z0) * e;
      c.y = y0 + (w.y + 0.4 - y0) * e - Math.sin(k * Math.PI) * 0.05;
      c.yaw = yw0 + dyaw * e;
      c.pitch += (-0.12 - c.pitch) * 0.1;
    }).then(() => { if (this.seat) this.seat.ready = true; });
  }

  standUp() {
    const s = this.seat;
    if (!s || !s.ready) return;
    this.seat = null;
    const c = this.cam;
    const x0 = c.x, z0 = c.z, y0 = c.y, eye = this.rig.player.eyeY + this.floorY(s.back.x, s.back.z);
    this.game.audio.play('step', { mat: 'wood' });
    this.tween(0.35, (k) => { c.x = x0 + (s.back.x - x0) * k; c.z = z0 + (s.back.z - z0) * k; c.y = y0 + (eye - y0) * k; }).then(() => { this.endScript(); this.unstick(); });
  }

  toggleLamp(rec) {
    const st = this.game.state;
    const on = !(rec.lights[0]?.on ?? true);
    for (const s of rec.lights) s.on = on;
    if (on) { delete st.data.flags['lampOff:' + rec.p.uid]; st.dirty = true; } else st.flag('lampOff:' + rec.p.uid, true);
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
    if (mb.t > 0) return;
    mb.t = 0.32;
    const note = TUNE[mb.i++ % TUNE.length];
    const a = this.game.audio;
    const p = this.rig.player.pos;
    const dist = Math.hypot(rec.cx * T - p.x, rec.cz * T - p.z);
    const vol = clamp(1.2 - dist / 4.5, 0.15, 1);
    a.tone({ f: midiToFreq(note), type: 'sine', dur: 0.5, vol: 0.05 * vol, release: 0.4, reverb: 0.5 });
    a.tone({ f: midiToFreq(note + 12), type: 'sine', dur: 0.15, vol: 0.015 * vol, reverb: 0.3 });
    if (mb.i % 6 === 0) this.fx.spawn({ x: rec.cx * T + rand(-0.06, 0.06), y: rec.bbox.max.y + 0.05, z: rec.cz * T, vy: 0.2, vx: rand(-0.05, 0.05), life: 1.4, size: 0.02, color: [0.95, 0.82, 1], glow: true, drag: 0.3 });
  }

  /** Q / the snack button: eat the best snack in the backpack. */
  snack() {
    const st = this.game.state;
    const food = st.inventory((it) => it && (it.cat === 'food' || it.food));
    if (!food.length) { this.game.audio.play('ui_error'); this.think('Nothing to snack on.', 1.6); return; }
    food.sort((a, b) => (ITEMS[b.id]?.energy || ITEMS[b.id]?.value || 0) - (ITEMS[a.id]?.energy || ITEMS[a.id]?.value || 0));
    const id = food[0].id;
    this.rig.vm?.eat(id);
    this.later(0.55, () => this.game.eat(id));
  }

  updateAnchors() {
    const ui = this.game.ui;
    for (const [k, fn] of this.anchors) {
      if (!ui.bubbles.has(k)) { this.anchors.delete(k); continue; }
      const p = fn();
      const s = this.toScreen(p);
      const e = this.game.engine;
      const vis = s.visible && s.x > -40 && s.x < e.width * e.scale + 40 && s.y > 0 && !this.hideFrom?.get(k)?.();
      ui.moveBubble(k, s.x, s.y, vis);
    }
  }

  // ------------------------------------------------------------ bed
  /** Where the eyes rest lying in a bed (meters) and the yaw looking toward its foot. */
  bedPose(rec) {
    if (rec.bedroll) {
      // on the bedroll: the head on the sack pillow, a hand's width off the floor, looking down along it
      const l = rec.lie.lie;
      const head = _v.set(l.x, l.y + 0.24, l.z + 0.26).applyMatrix4(rec.obj.matrixWorld).clone();
      return { head, yaw: (rec.yaw || 0) + Math.PI };
    }
    const lie = rec.res.lie || { y: 0.5, head: -0.55, foot: 0.75 };
    const head = _v.set(lie.x || 0, lie.y + 0.18, (lie.head ?? -0.55) + 0.12).applyMatrix4(rec.obj.matrixWorld).clone();
    const f = (rec.p.r || 0) * Math.PI / 2;
    return { head, yaw: f + Math.PI };
  }

  async lieDown(rec, fast = false) {
    const { head, yaw } = this.bedPose(rec);
    const c = this.cam;
    if (fast) { c.x = head.x; c.y = head.y; c.z = head.z; c.yaw = yaw; c.pitch = 1.15; c.roll = 0.25; return; }
    const x0 = c.x, y0 = c.y, z0 = c.z, yw0 = c.yaw, p0 = c.pitch;
    const dyaw = Math.atan2(Math.sin(yaw - yw0), Math.cos(yaw - yw0));
    await this.tween(0.9, (k) => {
      const e = k * k * (3 - 2 * k);
      c.x = x0 + (head.x - x0) * e; c.z = z0 + (head.z - z0) * e;
      c.y = y0 + (head.y - y0) * e + Math.sin(k * Math.PI) * 0.12;
      c.yaw = yw0 + dyaw * e; c.pitch = p0 + (1.15 - p0) * e; c.roll = 0.25 * e;
    });
  }

  async getUp(rec) {
    const c = this.cam;
    if (!c) return; // (the script was cut short: a test hook stood you up)
    const st = this.bedStand?.(rec);
    const spot = st ? { x: st.x / T, z: st.z / T } : besideItem(this, rec) || { x: rec.cx + 1, z: rec.cz };
    const tx = spot.x * T, tz = spot.z * T, ty = this.rig.player.eyeY;
    const fc = st?.face || { x: rec.cx * T, z: rec.cz * T - 1 };
    const yaw1 = Math.atan2(-(fc.x - tx), -(fc.z - tz));
    const x0 = c.x, y0 = c.y, z0 = c.z, yw0 = c.yaw, p0 = c.pitch, r0 = c.roll;
    const dyaw = Math.atan2(Math.sin(yaw1 - yw0), Math.cos(yaw1 - yw0));
    // sit up first, then swing the legs out and stand
    await this.tween(0.6, (k) => { const e = k * k * (3 - 2 * k); c.pitch = p0 + (-0.15 - p0) * e; c.roll = r0 * (1 - e); c.y = y0 + 0.12 * e; });
    this.game.audio.play('step', { mat: 'wood' });
    const y1 = c.y;
    await this.tween(0.7, (k) => { const e = k * k * (3 - 2 * k); c.x = x0 + (tx - x0) * e; c.z = z0 + (tz - z0) * e; c.y = y1 + (ty - y1) * e; c.yaw = yw0 + dyaw * e; c.pitch = -0.15 + 0.1 * e; });
  }

  async wakeUp(rec, first = false) {
    if (!rec) return;
    this.beginScript(false);
    await this.lieDown(rec, true);
    if (first) { this.post.fade = 1; await this.tween(1.6, (k) => { this.post.fade = 1 - k; }); }
    await this.sleepFor(first ? 1.0 : 0.4);
    this.game.audio.play('yawn');
    await this.sleepFor(0.8);
    const cam = this.cam;
    await this.getUp(rec);
    this.game.audio.play('land', { vol: 0.5 });
    if (!cam || this.cam !== cam) return; // (cut short: someone else has the camera now)
    this.endScript();
    this.unstick();
    if (first) this.game.ui.toast(`Day ${this.game.state.data.day}`);
  }

  async trySleep(rec) {
    const ok = await this.game.ui.confirm('Sleep until morning?', 'Sleep', 'Not yet');
    if (!ok || this.scripted) return;
    const d = this.game.state.data;
    this.beginScript(false);
    this.game.audio.play('yawn');
    await this.lieDown(rec);
    await this.tween(1.4, (k) => { this.post.fade = k; });
    this.game.audio.play('snore');
    await this.sleepFor(1.3);
    this.game.audio.play('snore');
    this.game.sleep();
    this.refreshDayVisuals();
    await this.sleepFor(0.8);
    await this.tween(1.2, (k) => { this.post.fade = 1 - k; });
    this.post.fade = 0;
    this.game.ui.toast(`<b>Day ${d.day}</b>`, { kind: 'good', dur: 3400 });
    this.game.audio.play('yawn');
    await this.sleepFor(0.6);
    await this.getUp(rec);
    this.endScript();
    this.unstick();
  }

  refreshDayVisuals() {
    for (const rec of [...this.items.values()]) {
      const k = FURNITURE[rec.p.id]?.kind;
      if (k === 'planter' && rec.res.setPlant) rec.res.setPlant(this.ctxFor(rec.p).planter, ITEMS);
    }
  }
}

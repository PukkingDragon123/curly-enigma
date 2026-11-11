// Digging out an alcove (mixed into HomeScene). The soft rock Old Star has chalked (an arch and an X
// over a patch of crumbly earth, nooks.js NOOKS[].dig) can be dug out once the lessons are done: E
// at the chalk asks what it costs (gold for timber and props), then you take your pick to it in
// first person: a few blows, the rock cracks and slumps, dust everywhere, and when it settles the
// alcove is there (the cave is built again with it: houseLoad.js keys the rock on the open set).
// Buying one on the Miners' Board (its Home tab) while you're home does the same once the board is
// closed; bought elsewhere, it's there the next time you come home. Your sleeping alcove is Old
// Star's gift when the lessons end (HomeScene.enter grants it; he mentions it here).
import * as THREE from 'three';
import { NOOK, NOOKS, grantNook, diggable } from './nooks.js';
import { starData } from './starData.js';
import { rand, pick } from '../core/util.js';

const _v = new THREE.Vector3();
const ease = (k) => k * k * (3 - 2 * k);

export class NookDig {
  /** E at each chalk-marked soft wall still to dig (cave.digAt, from the build). */
  addDigSpots() {
    for (const d of this.cave.digAt || []) {
      const n = NOOK[d.id];
      if (!n) continue;
      const cx = d.x + d.nx * 0.04, cz = d.z + d.nz * 0.04, hw = 0.42;
      const box = [cx - (d.nz ? hw : 0.12), 0.1, cz - (d.nx ? hw : 0.12), cx + (d.nz ? hw : 0.12), 1.2, cz + (d.nx ? hw : 0.12)];
      this.addIt({ box, reach: 2.4, label: () => this.digLabel(n), action: () => this.useDigSpot(n, d) });
    }
    this.own(this.game.state.on('upgrade', (e) => this.onNookBought(e)));
    const tick = () => {
      if (this.pendingDig && !this.scripted && !this.game.ui.isPanelOpen() && !this.game.transitioning) { const id = this.pendingDig; this.pendingDig = null; this.digNook(id, { bought: true }); }
    };
    this.tickers.push(tick);
  }

  /** May you dig yet? (after the lessons, like the rest of the board) */
  nooksAllowed() {
    const st = this.game.state, stage = this.lessonStage?.();
    return stage === 'done' || !!starData(st).skipped || st.unlocked?.('upgrades') !== false && !!st.data.unlocks;
  }

  digLabel(n) {
    if ((this.game.state.data.upgrades?.[n.id] || 0) >= 1) return `Dig out ${n.name}`; // (yours already: Old Star's gift, or bought on the board)
    if (!this.nooksAllowed()) return 'Old Star\'s chalk marks';
    const cost = this.game.state.upgradeCost?.(n.id)?.gold ?? n.cost;
    return `Dig out ${n.name} (${cost.toLocaleString()} gold)`;
  }

  /** E at the chalk: the price, then the dig. */
  async useDigSpot(n, d) {
    const st = this.game.state, ui = this.game.ui, a = this.game.audio;
    if (!diggable(n.id, this.nooks)) return;
    if ((st.data.upgrades?.[n.id] || 0) >= 1) { this.digging = n.id; await this.digNook(n.id, { at: d }); return; }
    if (!this.nooksAllowed()) {
      a.play('ui_error', { vol: 0.4 });
      this.think('An arch chalked on soft rock, and an X. Underneath, smaller: "LATER. FIRST, LESSONS."', 3.6);
      return;
    }
    const chk = st.canUpgrade(n.id);
    const cost = chk.cost?.gold ?? st.upgradeCost?.(n.id)?.gold ?? n.cost;
    if (!chk.ok) {
      a.play('ui_error', { vol: 0.5 });
      this.think(chk.reason === 'Not enough gold' ? `Old Star says ${cost.toLocaleString()} gold for the timber and props to hold ${n.name} up. I've got ${st.gold.toLocaleString()}.` : `Not yet: ${chk.reason}.`, 3.6);
      return;
    }
    const ok = await ui.confirm(`Dig out <b>${n.title}</b>?<br><span class="muted">${n.desc}</span><br>Timber and props: <span class="gold-txt">${cost.toLocaleString()} gold</span>`, 'Dig it out', 'Not now');
    if (!ok || this.scripted) return;
    this.digging = n.id;
    const r = st.buyUpgrade(n.id);
    if (!r.ok) { this.digging = null; a.play('ui_error'); return; }
    a.play('coins', { n: 3 });
    await this.digNook(n.id, { at: d });
  }

  /** Bought on the Miners' Board: dig it once the board is closed (if you're home and it can be dug). */
  onNookBought(e) {
    if (!NOOK[e?.id] || this.digging === e.id || this.gone) return;
    if (this.nooks?.has(e.id)) return;
    this.pendingDig = e.id;
  }

  /**
   * Dig alcove `id` out: (o.free: no cost, granted here) a few blows of the pick at its chalk, the
   * rock slumping, dust, then home again with it open. o.quick: straight to the rebuild (tests).
   * Resolves when the scene has switched.
   */
  async digNook(id, o = {}) {
    const st = this.game.state, n = NOOK[id];
    if (!n) return false;
    if (o.free) grantNook(st, id);
    if ((st.data.upgrades?.[id] || 0) < 1) return false;
    this.digging = id;
    st.save();
    if (!o.quick && this.rig) {
      try { await this.digCutscene(n, o.at || (this.cave.digAt || []).find((q) => q.id === id)); } catch (e) { console.warn('[home] dig', e); }
    }
    await this.game.goto('home', { from: 'dig', nook: id }, { transition: o.quick ? 'none' : 'fade', dur: 0.5, color: 0x1a140e });
    return true;
  }

  /** The dig itself, in first person: walk up, the pick, the blows, the slump and the dust. */
  async digCutscene(n, d) {
    if (!d) return;
    const a = this.game.audio, fx = this.fx;
    this.build?.active && this.build.toggle(false);
    this.beginScript(true);
    const c = this.cam;
    const sx = d.x + d.nx * 0.85, sz = d.z + d.nz * 0.85;
    if (Math.hypot(sx - c.x, sz - c.z) < 2.2) await this.walkCam(sx, sz, 1.6);
    else {
      // (too far to walk straight there through the rock: a dip to black and you're at the chalk)
      await this.tween(0.3, (k) => { this.post.fade = k; });
      c.x = sx; c.z = sz; c.y = this.floorY(sx, sz) + this.rig.player.eyeY;
      await this.tween(0.3, (k) => { this.post.fade = 1 - k; });
      this.post.fade = 0;
    }
    const yaw = Math.atan2(d.nx, d.nz);
    const y0 = c.yaw, dy = Math.atan2(Math.sin(yaw - y0), Math.cos(yaw - y0));
    await this.tween(0.4, (k) => { c.yaw = y0 + dy * ease(k); c.pitch += (0.02 - c.pitch) * 0.2; });
    const st = this.game.state;
    this.rig.setTool('pick', st.data.equip?.pick || 'pick_first');
    await this.sleepFor(0.35);
    const face = { x: d.x + d.nx * 0.02, z: d.z + d.nz * 0.02 };
    const blow = (k) => {
      this.rig.vm?.swing('pick', 0.22);
      this.later(0.16, () => {
        this.rig.vm?.impact('pick', 0.8, { feel: 'bite' });
        this.rig.shake(0.1 + k * 0.05);
        a.play('break', { snd: 'dirt', vol: 0.55 });
        a.play('debris', { vol: 0.25 + k * 0.1 });
        const hy = 0.5 + rand(-0.15, 0.25);
        fx.dust(face.x, hy, face.z, 8 + k * 3, [0.46, 0.36, 0.26], 0.14);
        for (let i = 0; i < 10 + k * 4; i++) fx.spawn({ x: face.x + rand(-0.2, 0.2), y: hy, z: face.z + rand(-0.2, 0.2), vx: d.nx * rand(0.4, 1.2) + rand(-0.5, 0.5), vy: rand(0.4, 1.6), vz: d.nz * rand(0.4, 1.2) + rand(-0.5, 0.5), life: rand(0.5, 1.0), size: rand(0.012, 0.024), color: pick([[0.42, 0.32, 0.22], [0.5, 0.4, 0.28], [0.36, 0.3, 0.26]]), drag: 0.3, grav: 8, bounce: 0.25 });
      });
    };
    for (let k = 0; k < 4; k++) { blow(k); await this.sleepFor(0.62 - k * 0.06); }
    // the rock gives: a crack, a slump, dust rolling out at you
    a.play('crack', { vol: 0.6 });
    a.play('collapse', { vol: 0.35 });
    this.rig.shake(0.35);
    for (let i = 0; i < 4; i++) this.later(i * 0.12, () => fx.dust(face.x + rand(-0.3, 0.3), rand(0.2, 1.1), face.z + rand(-0.3, 0.3), 14, [0.5, 0.4, 0.3], 0.3));
    await this.tween(0.9, (k) => { this.post.fade = ease(k) * 0.85; this.post.fadeColor = 0x1a140e; });
    this.later(0.1, () => this.star?.rig && this.star.say?.(pick(['Ha! Mind your head. I\'ll bring the props.', 'That\'s it, put your back into it!']), { mood: 'happy' }));
    void _v;
  }

  /** Back home with a new alcove: the dust settling in it, a word from Old Star. */
  arriveFromDig(id) {
    const n = NOOK[id];
    if (!n) return;
    const fx = this.fx;
    this.post.fade = 0.6;
    this.post.fadeColor = 0x1a140e;
    this.tween(1.4, (k) => { this.post.fade = 0.6 * (1 - ease(k)); }).then(() => { this.post.fade = 0; });
    this.game.audio.play('debris', { vol: 0.25 });
    const [x0, z0, x1, z1] = n.rect.map((v) => v * 0.5);
    for (let i = 0; i < 40; i++) fx.spawn({ x: rand(x0, x1), y: rand(0.2, 1.6), z: rand(z0, z1), vx: rand(-0.03, 0.03), vy: rand(-0.06, -0.01), vz: rand(-0.03, 0.03), life: rand(3, 6), size: rand(0.006, 0.012), color: [0.62, 0.54, 0.44], alpha: 0.6, drag: 0.1, grav: 0.02 });
    this.later(1.2, () => this.think(`${n.title}: dug out, propped and mine. Room for my things.`, 3.4));
    this.later(2.6, () => { if (this.star?.rig && !this.star.scripted && this.star.mode !== 'sleep') this.star.say(pick(['Not bad for a first-timer. Keep the props where they are.', 'More cave! Next you\'ll want a window.', 'Mind you sweep the dust out. Ha. Who am I kidding.']), { mood: 'happy' }); });
  }

  /** Your sleeping alcove was dug while you were out (the lessons' end): he tells you, once. */
  mentionNookGift() {
    const st = this.game.state, sd = starData(st);
    if (sd.nookTold || !this.nooks?.has('nook_bed')) return;
    sd.nookTold = true;
    st.dirty = true;
    this.later(this.arrivalLesson === 'cook_done' ? 14 : 2.2, () => {
      const star = this.star;
      if (!star?.rig || star.mode === 'sleep') { this.think('The soft rock behind my bedroll\'s been dug out. A corner of my own!', 3.4); return; }
      star.say('That soft rock behind your bedroll? Dug it out while you were busy. Your own corner, through there. The rest of the chalk\'s yours to dig.', { mood: 'proud' });
    });
  }
}

void NOOKS;

// The held tool away from the mine (the burrow, Deep Town): the same belt as underground, the
// first nine slots of the inventory (core/hotbar.js). Keys 1–9, the wheel or a tap on a loop pick
// a slot; the paws hold what's in it, and it works: a pick or chisel swings and knocks on what it
// hits (hold to keep swinging), the brush sweeps, the drill whirs, a snack is eaten, the build kit
// opens the house's build mode. Anything else in the slot (an ore, a mushroom, a bowl, a plan, a
// sword) is held up in the paw as its real 3D model (wave 19: src/fps/viewmodel/held.js), each in
// its own grip; switching slots lowers one and raises the next. On a touch screen, tapping the
// picked loop again uses it.
//
// Scenes hook it in with one line in their frame (after the FPSRig update):
//   (this.hands ||= new HandTools(this)).update(dt, busy);
// It needs scene.rig (src/fps/FPSKit.js FPSRig); scene.toggleBuildHere() is used if there.
import { HOTBAR_N, hotbarOf, hotStack, refItem, KIND_ICON } from '../core/hotbar.js';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';
import { itemVox } from './itemVox.js';
import { heldGeo } from '../fps/viewmodel/held.js';
import { startEating, glowLayer } from '../cooking/eating.js'; // (wave 16) the first-person bite sequence

const PAW = { pick: 'pick', chisel: 'chisel', brush: 'brush', drill: 'drill', xray: 'xray', build: 'hammer', food: 'food', dynamite: 'dynamite', stake: 'stake' };
const SWING = { pick: { dur: 0.36, hit: 0.13, every: 0.44, snd: 'clang', pitch: 0.8 }, chisel: { dur: 0.2, hit: 0.09, every: 0.26, snd: 'chisel', pitch: 1 } };

export class HandTools {
  constructor(scene) {
    this.s = scene;
    this.g = scene.game;
    const d = this.g.state.data;
    this.slot = Math.max(0, Math.min(HOTBAR_N - 1, d.hotSel | 0));
    this.useT = 0;
    this.swing = null;
    this.loop = null;
    this._sig = '';
    itemVox.init(this.g);
    scene.own?.(() => this.dispose());
  }

  get kind() { return hotbarOf(this.g.state)[this.slot] || 'none'; }
  /** The item the picked slot stands for (the equipped tool, the stack's item), or null. */
  item(kind = this.kind) {
    const st = this.g.state, s = hotStack(st, this.slot);
    if (!s) return null;
    if (s.tool) return s.tool === 'build' ? refItem(st, 'build') : st.equipped(s.tool);
    return s.w ? null : ITEMS[s.id] || null;
  }

  select(i, dir = 0) {
    let n = (i + HOTBAR_N) % HOTBAR_N;
    // [unlock guard] slots the tutorial hasn't given you yet are skipped (src/ui/Belt.js shown)
    const belt = this.g.ui.belt;
    if (belt?.shown && !belt.shown(n)) { if (!dir) return; for (let k = 0; k < HOTBAR_N && !belt.shown(n); k++) n = (n + dir + HOTBAR_N) % HOTBAR_N; if (!belt.shown(n)) return; }
    if (n === this.slot) return;
    this.slot = n;
    this.eatSeq?.cancel();
    this.g.state.data.hotSel = n;
    this.g.audio.play('ui_click', { pitch: 1.3 });
    this.stopLoop();
  }
  /** A tap on a loop: pick it; tapping the picked one again uses it (touch screens). */
  tap(i) {
    if (i === this.slot) this.use(true);
    else this.select(i);
  }

  /** The belt at the bottom of the screen (src/ui/Belt.js shows stacks itself). */
  refreshBelt(force = false) {
    const st = this.g.state, bar = st.data.inv?.slots || [];
    let sig = this.slot + '|';
    for (let i = 0; i < HOTBAR_N; i++) { const s = bar[i]; sig += !s ? '-,' : s.tool ? s.tool + (st.equipped(s.tool)?.id || '') + ',' : (s.id || '') + (s.n ?? s.lots?.length ?? 1) + ','; }
    if (!force && sig === this._sig) return;
    if (this._sig) this._warmed = false; // (the belt changed: warm its held models again)
    this._sig = sig;
    const slots = [];
    for (let i = 0; i < HOTBAR_N; i++) {
      const s = bar[i], key = String(i + 1);
      if (!s) { slots.push({ icon: iconURL('pick_rusty'), key, label: '', off: true, empty: true }); continue; }
      if (!s.tool) { slots.push({ icon: iconURL('pick_rusty'), key, label: '' }); continue; } // (Belt draws the stack)
      const it = refItem(st, s.tool), has = s.tool === 'build' || !!st.equipped(s.tool);
      slots.push({ icon: itemVox.src(it?.id || KIND_ICON[s.tool]), key, label: has ? (s.tool === 'build' ? 'Builder\'s Hammer' : it?.name || '') : '', off: !has });
    }
    this.g.ui.setHotbar(slots, this.slot, (i) => this.tap(i));
  }

  /** The model key of the picked slot's stack when it isn't a tool (item id or a forged weapon's key). */
  heldKey() {
    const s = hotStack(this.g.state, this.slot);
    if (!s || s.tool) return null;
    if (s.w) return `w.${s.w.type}.${s.w.metal}.${s.w.infusion || ''}`;
    return ITEMS[s.id] ? s.id : null;
  }

  /** The paws hold what's picked: a tool, a snack, or (any other item) its model in the paw. */
  holdIt() {
    const rig = this.s.rig;
    if (!rig) return;
    const k = this.kind, it = this.item(k);
    let want = it || k === 'build' ? PAW[k] || 'none' : 'none';
    let id = want === 'none' ? null : it?.id || null;
    if (want === 'none') { const hk = this.heldKey(); if (hk) { want = 'held'; id = hk; } }
    if (rig.tool !== want || rig.toolItem !== id) rig.setTool(want, id);
    // the belt's other items are built ahead (each once, cached), so picking one never stalls a frame
    if (!this._warmed) { this._warmed = true; this.warmHeld(); }
  }
  /** Build the belt's held models a little at a time in idle moments. */
  warmHeld() {
    const st = this.g.state, bar = st.data.inv?.slots || [];
    const keys = [];
    for (let i = 0; i < HOTBAR_N; i++) { const s = bar[i]; if (s && !s.tool) keys.push(s.w ? `w.${s.w.type}.${s.w.metal}.${s.w.infusion || ''}` : s.id); }
    const next = () => {
      if (this.gone || !keys.length) return;
      const k = keys.shift();
      try { if (k) heldGeo(k); } catch (e) { /* built when picked instead */ }
      (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(next, { timeout: 1500 });
    };
    (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(next, { timeout: 1500 });
  }

  /** off: a cutscene, build mode... the belt goes away and the paws are left alone. */
  update(dt, busy = false, off = false) {
    const g = this.g, inp = g.input, rig = this.s.rig;
    if (!rig) return;
    if (off) { if (this._sig !== 'off') { this._sig = 'off'; this.swing = null; this.stopLoop(); g.ui.setHotbar(null); } return; }
    const B = this.s.build; // the home's build mode (src/home/build.js): the Builder's Hammer in the paw
    const hammering = !!(B?.active && this.kind === 'build');
    if (!busy) {
      for (let k = 0; k < HOTBAR_N; k++) if (inp.pressed('Digit' + (k + 1))) this.select(k);
      if (inp.mouse.wheel && !hammering) this.select(this.slot + Math.sign(inp.mouse.wheel), Math.sign(inp.mouse.wheel));
    }
    if (B) {
      // taking the hammer out of its loop is building; picking another loop puts it away
      const kind = this.kind;
      if (kind !== this._lastKind) {
        if (kind === 'build' && !B.active && !busy) B.toggle(true);
        else if (this._lastKind === 'build' && B.active) B.toggle(false);
        this._lastKind = kind;
      }
      if (B.active) { this.refreshBelt(); this.swing = null; this.stopLoop(); return; }
    }
    this.refreshBelt();
    this.holdIt();
    this.useT -= dt;
    this.eating(dt, busy);
    // a swing in progress lands its blow
    const sw = this.swing;
    if (sw) {
      sw.t += dt;
      if (!sw.hit && sw.t >= sw.at) { sw.hit = true; this.knock(sw.kind); }
      if (sw.t >= sw.dur) this.swing = null;
    }
    const down = !busy && !!rig.primaryDown, pressed = !busy && !!rig.primaryPressed;
    const k = this.kind;
    if (k === 'brush' || k === 'drill' || k === 'xray') {
      const on = down && !!this.item(k);
      rig.vm?.use?.(k, on);
      if (on && k === 'drill' && !this.loop) this.loop = g.audio.loop?.('drill', { vol: 0.22 });
      if (on && k === 'brush' && this.useT <= 0) { this.useT = 0.22; if (this.hitAhead(0.9)) g.audio.play('brush', { vol: 0.35 }); }
      if (!on) this.stopLoop();
    } else this.stopLoop();
    if (SWING[k] ? (down || pressed) && this.useT <= 0 && !this.swing : pressed && k !== 'brush' && k !== 'drill' && k !== 'xray') this.use(pressed);
  }

  /** Use what's held: swing a tool, eat a snack, open build mode. */
  use(pressed = true) {
    const g = this.g, rig = this.s.rig, k = this.kind, it = this.item(k);
    if (!rig || this.useT > 0) return;
    const sw = SWING[k];
    if (sw && it) {
      this.useT = sw.every;
      this.swing = { kind: k, t: 0, at: sw.hit, dur: sw.dur, hit: false };
      rig.vm?.swing?.(k, sw.dur);
      g.audio.play('whoosh', { vol: 0.12, pitch: k === 'pick' ? 0.9 : 1.3 });
      return;
    }
    if (!pressed) return;
    if (k === 'food' && it) {
      if (this.eatSeq && !this.eatSeq.over) return;
      this.useT = 0.7;
      // (wave 16) lift, three bites, a happy bob and a warm glow; the meal counts once it's eaten
      this.eatSeq = startEating(g, rig.vm, it.id, { onDone: (id) => { if (!this.gone && this.g.state.count(id) > 0) this.g.eat(id); } });
      return;
    }
    if (k === 'build' && this.s.build) { this.useT = 0.25; if (this.s.build.active) this.s.build.ui?.toggleWheel(); else this.s.build.toggle(true); return; }
    if (k === 'build' && this.s.toggleBuildHere) { this.useT = 0.4; this.s.toggleBuildHere(); return; }
    // nothing to do with it here (a blast indoors, an ore): a little shrug of the paws
    this.useT = 0.35;
    rig.vm?.impact?.('none', 0.2);
  }

  /** What's right in front of the paws (within reach m): the hit, or null. */
  hitAhead(reach = 1.3) {
    const rig = this.s.rig, w = rig?.world;
    if (!w?.raycast) return null;
    const e = rig.eye(), f = rig.forward();
    const h = w.raycast(e.x, e.y, e.z, f.x, f.y, f.z, reach);
    return h && h.dist <= reach ? h : null;
  }
  /** The blow lands: a knock on whatever it hits (the paws jolt, the view kicks). */
  knock(kind) {
    const rig = this.s.rig, sw = SWING[kind];
    const h = this.hitAhead(kind === 'chisel' ? 0.9 : 1.3);
    if (!h) return;
    rig.vm?.impact?.(kind, kind === 'pick' ? 0.7 : 0.4);
    this.g.audio.play(sw.snd, { vol: 0.32, pitch: sw.pitch });
    rig.shake?.(kind === 'pick' ? 0.12 : 0.05);
    try { this.s.fx?.dust?.(h.x + h.nx * 0.02, h.y, h.z + h.nz * 0.02, kind === 'pick' ? 5 : 2, [0.46, 0.36, 0.26], 0.05); } catch (e) { /* no voxel dust here */ }
  }

  /** The eating sequence's bob and glow on the view (after the rig has placed the camera this frame). */
  eating(dt, busy) {
    const q = this.eatSeq;
    if (!q) return;
    if (busy && this.g.ui.isPanelOpen?.()) q.cancel();
    const e = q.update(dt), cam = this.s.camera;
    if (cam) { cam.position.y += e.bob; cam.rotation.z += e.roll; cam.updateMatrixWorld?.(); }
    glowLayer(e.glow);
    if (q.over) { this.eatSeq = null; glowLayer(0); }
  }

  stopLoop() { if (this.loop) { this.loop.stop?.(); this.loop = null; } }
  dispose() {
    this.eatSeq?.cancel();
    glowLayer(0);
    this.gone = true;
    this.stopLoop();
  }
}

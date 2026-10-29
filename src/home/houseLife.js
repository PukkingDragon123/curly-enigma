// Life in Old Star's camp beyond workshop.js (mixed into HomeScene): the glowing mushrooms in the
// damp corner (pick a few, once a day), the food crate (a snack, once a day), the gramophone on its
// crate in the shack and its tune; and what murmurs on its own: the kettle singing now and then,
// spores drifting in the hole's grey light, a moth round the lantern, and the thin shaft of light
// down the hole you fell through when you look up it.
import * as THREE from 'three';
import { HALL, T, HOLE } from './units.js';
import { starData } from './starData.js';
import { rand, pick, clamp } from '../core/util.js';
import { midiToFreq } from '../core/Audio.js';

const _v = new THREE.Vector3();
const Y = HALL.y;
/** An old dance tune for the gramophone (midi notes, 0 = rest), a little faster than the music box. */
const GRAMO = [64, 67, 72, 71, 69, 67, 0, 64, 65, 67, 69, 67, 65, 64, 62, 0, 60, 64, 67, 72, 74, 72, 71, 69, 67, 0, 69, 71, 72, 67, 64, 60];
const SPECIAL = ['gramophone', 'larder', 'pick'];

export class HouseLife {
  // ------------------------------------------------------------ interactables
  addHouseInteractions() {
    const c = this.cave;
    for (const o of c.looks) {
      const kind = SPECIAL.find((k) => o[k]);
      if (!kind) continue;
      const it = { x: o.x, y: o.y, z: o.z, r: o.r, reach: 2.6, label: () => this.houseLabel(kind, o), action: () => this.houseUse(kind, o) };
      this.addIt(it);
    }
    this.gramo = { on: false, t: 0, i: 0 };
    this.kettleT = rand(70, 120);
  }

  /** A box (m) round a piece of furniture's frame: hw × hd turned with it, h tall. */
  furnBox(f, hw, hd, h) {
    const o = f.obj;
    o.updateMatrixWorld(true);
    const p = _v.setFromMatrixPosition(o.matrixWorld);
    const yaw = o.rotation.y, c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    const ex = hw * c + hd * s, ez = hw * s + hd * c;
    return [p.x - ex, Y, p.z - ez, p.x + ex, Y + h, p.z + ez];
  }

  houseLabel(kind) {
    const sd = starData(this.game.state), day = this.game.state.data.day;
    if (kind === 'gramophone') return this.gramo?.on ? 'Lift the needle' : 'Wind the gramophone';
    if (kind === 'larder') return sd.larderDay === day ? 'The food crate' : 'Take a snack from the food crate';
    if (kind === 'pick') return sd.pickDay === day ? 'Glowing mushrooms' : 'Pick some glowing mushrooms';
    return '';
  }

  houseUse(kind) {
    const st = this.game.state, a = this.game.audio, sd = starData(st), day = st.data.day;
    this.rig.vm?.impact('none', 0.2);
    if (kind === 'gramophone') {
      const gm = this.gramo;
      gm.on = !gm.on; gm.t = 0.4; gm.i = 0;
      a.play(gm.on ? 'creak' : 'click', { vol: 0.4 });
      if (gm.on) { this.think(pick(['A crackle, a hiss, and a little dance band from somewhere far above.', 'The record is called "Sunshine on the Platform". Of course it is.']), 3.4); this.later(2.5, () => this.starAside('gramophone')); }
      return;
    }
    if (kind === 'larder') {
      if (sd.larderDay === day) { this.think(pick(['Turnips, a heel of cheese, a jar of pickled glowcaps. Old Star would notice. He counts.', 'You look at the cheese. The cheese looks at you. Not today.']), 3); return; }
      sd.larderDay = day;
      const gift = pick([['herb_bread', 1], ['berry_jam', 1], ['cave_carrot', 2], ['tunnel_tuber', 2]]);
      st.addItem(gift[0], { spill: true, n: gift[1] });
      a.play('pickup');
      this.think(pick(['A heel of bread and a dab of jam, wrapped in a cloth. For later.', 'You help yourself, the way he told you to. "What\'s mine is the crate\'s," he says.']), 3.2);
      st.save();
      return;
    }
    if (kind === 'pick') {
      if (sd.pickDay === day) { this.think('You\'ve picked today\'s. They grow back overnight in the damp, Old Star says. They like the dark and being left alone.', 3.6); return; }
      sd.pickDay = day;
      st.addItem('glowcap', { spill: true, n: 2 });
      a.play('pickup_gem');
      const o = this.cave.looks.find((l) => l.pick) || { x: -4.3, z: -1.45 };
      const g = { x: o.x + 0.55, z: o.z + 0.1 };
      for (let i = 0; i < 10; i++) this.fx.spawn({ x: g.x - 0.55 + rand(-0.1, 0.1), y: Y + 0.3, z: g.z - 0.1 + rand(-0.1, 0.1), vx: rand(-0.05, 0.05), vy: rand(0.1, 0.3), vz: rand(-0.05, 0.05), life: rand(1.5, 2.5), size: 0.008, color: [0.5, 1, 0.95], alpha: 0.9, glow: true, drag: 0.4, grav: -0.02 });
      this.floatAt(g.x - 0.55, Y + 0.6, g.z - 0.1, '+2 glowcap', '#9af0e0');
      this.later(0.8, () => this.starAside('glowcap'));
      st.save();
    }
  }

  /** Old Star's remarks about the camp's odds and ends (workshop.js starAside asks here for what it doesn't know). */
  houseAsides(what) {
    return {
      gramophone: [['"Sunshine on the Platform"! Marigold and I danced to that by this very fire. Badly.', 'laugh'], ['Mind the needle. It\'s the only one left in Deep Town.', 'stern']],
      glowcap: [['Pick from the edges, never the middle. Marigold\'s rule.', 'calm'], ['They\'ll be back by morning. They always are, in the damp.', 'happy']],
      cheese: [['That wedge? Nugget. I\'ll stand by that in a court of law.', 'stern']],
    }[what];
  }

  steamPuff(p, k = 1) {
    this.fx.spawn({ x: p.x + rand(-0.25, 0.25), y: p.y + 0.02, z: p.z + rand(-0.12, 0.12), vx: rand(-0.03, 0.03), vy: rand(0.08, 0.18) * k, vz: rand(-0.03, 0.03), life: rand(2.2, 3.4), size: 0.03, grow: 0.06, color: [0.95, 0.95, 0.93], alpha: 0.12, drag: 0.5, grav: -0.02 });
  }

  // ------------------------------------------------------------ frame
  tickHouseLife(dt) {
    const c = this.cave, a = this.game.audio, p = this.rig.player.pos, fx = this.fx;
    if (!c || !this.gramo) return;
    const near = (q, r) => q && Math.hypot(q.x - p.x, q.z - p.z) < r;
    // spores drifting in the hole's grey light
    if (near(HOLE, 6)) {
      this.sporeT = (this.sporeT || 0) - dt;
      if (this.sporeT <= 0) {
        this.sporeT = 0.3;
        const r = 0.4 * Math.sqrt(Math.random()), an = Math.random() * Math.PI * 2;
        fx.spawn({ x: HOLE.x + Math.cos(an) * r, y: Y + rand(0.4, 1.9), z: HOLE.z + Math.sin(an) * r, vx: rand(-0.01, 0.01), vy: rand(-0.04, 0.03), vz: rand(-0.01, 0.01), life: rand(5, 8), size: rand(0.003, 0.006), color: [0.85, 0.85, 0.8], alpha: 0.6, glow: true, drag: 0.02, grav: 0.003 });
      }
    }
    // the gramophone's tune
    const gm = this.gramo, horn = c.gramophone;
    if (gm?.on && horn) {
      gm.t -= dt;
      if (gm.t <= 0) {
        gm.t = 0.24;
        const note = GRAMO[gm.i++ % GRAMO.length];
        if (gm.i > GRAMO.length * 3) { gm.on = false; a.play('click', { vol: 0.3 }); }
        if (note) {
          const dist = Math.hypot(horn.x - p.x, horn.z - p.z), vol = clamp(1.1 - dist / 7, 0.05, 1) * (this.inBedroom?.(p.x, p.z) && p.z > 0.6 ? 0.4 : 1);
          a.tone({ f: midiToFreq(note), type: 'triangle', dur: 0.3, vol: 0.035 * vol, release: 0.2, filter: 'lowpass', ff: 1500, reverb: 0.45 });
          if (gm.i % 4 === 1) a.tone({ f: midiToFreq(note - 24), type: 'triangle', dur: 0.2, vol: 0.03 * vol, filter: 'lowpass', ff: 600 });
          if (gm.i % 8 === 0) fx.spawn({ x: horn.x + rand(-0.05, 0.05), y: horn.y, z: horn.z, vy: 0.15, vx: rand(-0.05, 0.05), life: 1.6, size: 0.016, color: [1, 0.9, 0.7], glow: true, drag: 0.3 });
        }
      }
    }
    // the kettle sings now and then (when you're near the fire)
    this.kettleT -= dt;
    if (this.kettleT <= 0) {
      this.kettleT = rand(90, 160);
      const k = c.dyn.hearth?.kettle;
      if (k && Math.hypot(k.x - p.x, k.z - p.z) < 6) {
        a.tone({ f: 1760, f2: 2093, slide: 1.2, type: 'sine', dur: 2.4, vol: 0.02, a: 0.6, vib: 8, vibRate: 6, reverb: 0.4 });
        for (let i = 0; i < 20; i++) this.later(i * 0.1, () => fx.spawn({ x: k.x + 0.05, y: k.y + 0.03, z: k.z, vx: rand(0.1, 0.25), vy: rand(0.2, 0.35), vz: rand(-0.04, 0.04), life: 1.2, size: 0.012, grow: 0.035, color: [0.95, 0.95, 0.93], alpha: 0.3, drag: 0.7, grav: -0.06 }));
      }
    }
    // a thin shaft of grey light down the hole you fell through, when you're under it looking up
    const top = c.holeTop;
    if (top) {
      const d = Math.hypot(p.x - HOLE.x, p.z - HOLE.z);
      const want = d < 3.2 ? 0.32 * (1 - d / 3.2) + 0.1 : 0;
      this.raysK = (this.raysK || 0) + (want - (this.raysK || 0)) * Math.min(1, dt * 2);
      if (this.raysK > 0.01) { this.post.rays = this.raysK; this.post.raysPos = [top.x, top.y, top.z]; this.post.raysColor = 0xc8d0d0; this.post.raysSky = 0; this.post.raysDecay = 0.95; }
      else if (this.post.rays) { this.post.rays = 0; this.post.raysPos = null; }
    }
    void _v; void T;
  }
}

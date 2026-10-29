// Life in the newer parts of Old Star's house (mixed into HomeScene, like workshop.js): what you can
// do in the glow garden (pick a glowcap, sit on Marigold's bench, take a soak in the hot bath),
// on the terrace (the telescope, tea with a view), in the workshop (wind the little train) and the
// larder (a snack, once a day), and the gramophone in the living room. And everything that moves
// or murmurs on its own: the stone face spouting into its pool, the bath steaming, spores drifting
// up the light well (with the cavern's light shafting down it), the giant glowcaps breathing,
// glow-moths, the wind chime on the terrace, a kettle that sings now and then, the gramophone's
// tune, the train on its oval.
import * as THREE from 'three';
import { HALL, T } from './units.js';
import { ROOM, roomAt, onTerrace } from './plan.js';
import { starData } from './starData.js';
import { rand, pick, clamp } from '../core/util.js';
import { midiToFreq } from '../core/Audio.js';

const _v = new THREE.Vector3();
const Y = HALL.y;
/** An old dance tune for the gramophone (midi notes, 0 = rest), a little faster than the music box. */
const GRAMO = [64, 67, 72, 71, 69, 67, 0, 64, 65, 67, 69, 67, 65, 64, 62, 0, 60, 64, 67, 72, 74, 72, 71, 69, 67, 0, 69, 71, 72, 67, 64, 60];
const SPECIAL = ['gramophone', 'bath', 'telescope', 'railway', 'larder', 'pick'];

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
    for (const f of c.furn) {
      if (f.id === 'bench') this.addIt({ box: this.furnBox(f, 0.48, 0.24, 0.45), label: 'Sit on Marigold\'s bench', action: () => this.sitAt(f) });
      if (f.id === 'teaChair') this.addIt({ box: this.furnBox(f, 0.75, 0.24, 0.5), label: 'Sit and watch the cavern', action: () => this.sitAt(f) });
    }
    // a glowcap to pick from the beds, once a day
    const g = ROOM.garden;
    this.addIt({ x: g.skylight.x - 0.55, y: Y + 0.35, z: g.skylight.z - 0.1, r: 0.28, reach: 2.4, label: () => this.houseLabel('pick'), action: () => this.houseUse('pick') });
    this.gramo = { on: false, t: 0, i: 0 };
    this.train = { k: 0, speed: 0, laps: 0 };
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
    if (kind === 'bath') return sd.bathDay === day ? 'The bath (still warm)' : 'Take a soak';
    if (kind === 'telescope') return 'Look through the telescope';
    if (kind === 'railway') return this.train?.laps > 0 ? 'Watch the little train' : 'Wind the little train';
    if (kind === 'larder') return sd.larderDay === day ? 'The larder shelves' : 'Take a snack from the larder';
    if (kind === 'pick') return sd.pickDay === day ? 'Marigold\'s glowcaps' : 'Pick a glowcap';
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
    if (kind === 'bath') {
      a.play('splash', { vol: 0.35 });
      const s = this.cave.dyn.bathSteam;
      if (s) for (let i = 0; i < 14; i++) this.later(i * 0.05, () => this.steamPuff(s, 1.6));
      if (sd.bathDay === day) { this.think('Still warm. You dip a paw in and sigh.', 2.6); return; }
      sd.bathDay = day;
      st.restoreEnergy?.(12);
      st.addBuff?.('warm', 150);
      this.floatAt(s?.x ?? 4.4, (s?.y ?? Y + 0.5) + 0.2, s?.z ?? -9.4, '+12 energy', '#bff0a0');
      this.think(pick(['You sink in up to the whiskers. The hot spring smells of stone and mint. Bliss.', 'Hot water from deep in the rock. Every aching claw in your body unclenches.']), 4);
      this.later(1.2, () => this.starAside('bath'));
      st.save();
      return;
    }
    if (kind === 'telescope') { this.lookTelescope(); return; }
    if (kind === 'railway') {
      const tr = this.train;
      a.play('click', { vol: 0.5 });
      this.later(0.25, () => a.play('click', { vol: 0.4 }));
      tr.laps = 3; tr.speed = Math.max(tr.speed, 0.2);
      this.think(pick(['Click, click, click: wound tight. The little engine sets off round its hills, its lamp lit.', 'Off it goes, through the tunnel and out, past the station, past the lift tower that says SURFACE.']), 3.6);
      this.later(2.0, () => this.starAside('train'));
      return;
    }
    if (kind === 'larder') {
      if (sd.larderDay === day) { this.think(pick(['Cheese, cider, pickles. Old Star would notice another wedge gone. He counts.', 'You look at the cheese. The cheese looks at you. Not today.']), 3); return; }
      sd.larderDay = day;
      const gift = pick([['herb_bread', 1], ['berry_jam', 1], ['cave_carrot', 2], ['tunnel_tuber', 2]]);
      st.addItem(gift[0], { spill: true, n: gift[1] });
      a.play('pickup');
      this.think(pick(['A heel of bread and a dab of jam, wrapped in a cloth. For later.', 'You help yourself, the way he told you to. "What\'s mine is the larder\'s," he says.']), 3.2);
      st.save();
      return;
    }
    if (kind === 'pick') {
      if (sd.pickDay === day) { this.think('You\'ve picked today\'s. They grow back overnight, Old Star says. They like the dark and they like being left alone.', 3.6); return; }
      sd.pickDay = day;
      st.addItem('glowcap', { spill: true, n: 2 });
      a.play('pickup_gem');
      const g = ROOM.garden.skylight;
      for (let i = 0; i < 10; i++) this.fx.spawn({ x: g.x - 0.55 + rand(-0.1, 0.1), y: Y + 0.4, z: g.z - 0.1 + rand(-0.1, 0.1), vx: rand(-0.05, 0.05), vy: rand(0.1, 0.3), vz: rand(-0.05, 0.05), life: rand(1.5, 2.5), size: 0.008, color: [0.5, 1, 0.95], alpha: 0.9, glow: true, drag: 0.4, grav: -0.02 });
      this.floatAt(g.x - 0.55, Y + 0.6, g.z - 0.1, '+2 glowcap', '#9af0e0');
      this.later(0.8, () => this.starAside('glowcap'));
      st.save();
    }
  }

  /** The telescope: a long look at the far village, the view narrowing in. */
  lookTelescope() {
    const ts = this.cave.telescopeAt;
    if (!ts || this.scripted) return;
    const pl = this.rig.player;
    this.beginScript(false);
    const c = this.cam, cam = this.camera;
    const x0 = c.x, z0 = c.z, yaw0 = c.yaw, p0 = c.pitch, fov0 = cam.fov;
    const yaw1 = ts.yaw + Math.PI, ex = ts.x - Math.sin(ts.yaw) * 0.32, ez = ts.z - Math.cos(ts.yaw) * 0.32;
    const dy = Math.atan2(Math.sin(yaw1 - yaw0), Math.cos(yaw1 - yaw0));
    this.game.audio.play('creak', { vol: 0.3 });
    this.tween(0.6, (k) => { const e = k * k * (3 - 2 * k); c.x = x0 + (ex - x0) * e; c.z = z0 + (ez - z0) * e; c.yaw = yaw0 + dy * e; c.pitch = p0 + (0.1 - p0) * e; })
      .then(() => this.tween(0.9, (k) => { cam.fov = fov0 + (16 - fov0) * k * k * (3 - 2 * k); cam.updateProjectionMatrix(); }))
      .then(() => {
        this.think(pick([
          'The far village: lit windows, a mill wheel turning in a waterfall, somebody hanging out washing. They wave on Sundays, he said.',
          'A herd of glow-moths drifting over the chasm like a slow green cloud. Below them, mist, and below that, nobody knows.',
          'Crystal cliffs a mile off, ringing faintly when the wind goes past. You can almost hear it from here.',
        ]), 5);
        return this.sleepFor(4.6);
      })
      .then(() => this.tween(0.7, (k) => { cam.fov = 16 + (fov0 - 16) * k * k * (3 - 2 * k); cam.updateProjectionMatrix(); }))
      .then(() => { cam.fov = fov0; cam.updateProjectionMatrix(); this.endScript(); this.starAside('telescope'); });
    void pl;
  }

  /** Old Star's remarks about the newer rooms (workshop.js starAside asks here for what it doesn't know). */
  houseAsides(what) {
    return {
      gramophone: [['"Sunshine on the Platform"! Marigold and I danced to that in the kitchen. Badly.', 'laugh'], ['Mind the needle. It\'s the only one left in Deep Town.', 'stern']],
      bath: [['Hot spring, straight out of the rock. Best thing about this house, and I\'ve got a forge.', 'happy'], ['Leave the duck. The duck stays.', 'stern']],
      train: [['The Surface Express, to scale! Well. Nearly to scale. The real one has more wheels.', 'proud'], ['I wound it every night for a year. Then I stopped, because it made me sad. Now it makes me hopeful again.', 'calm']],
      glowcap: [['Pick from the edges, never the middle. Marigold\'s rule.', 'calm'], ['They\'ll be back by morning. They always are.', 'happy']],
      telescope: [['See the mill wheel? That village has a baker. I can smell his bread on a good draught. I swear it.', 'laugh'], ['One day we\'ll look down at all this from the top. Imagine.', 'proud']],
      skylight: [['Dug that well myself, two years with a hand pick. She wanted her mushrooms to have a sky.', 'worried']],
      garden: [['Marigold planted the first ones. I just keep them going.', 'calm'], ['Talk to them. They like it. Don\'t tell anyone I said that.', 'laugh']],
      plaque: [['She\'d hate that I polish it every week. She\'d say I should be polishing the pans.', 'laugh']],
      drawings: [['Every rivet of the Surface Express, from memory. I saw it once, as a lad. Never forgot a bolt.', 'proud']],
      hen: [['She doesn\'t lay. She doesn\'t peck either. On balance, a fair trade.', 'laugh']],
      cheese: [['That wedge? Nugget. I\'ll stand by that in a court of law.', 'stern']],
      terrace: [['Best seat in the deep, this. I have my tea out here every evening.', 'happy'], ['Don\'t lean over. It\'s a long way to the mushrooms down there.', 'worried']],
    }[what];
  }

  steamPuff(p, k = 1) {
    this.fx.spawn({ x: p.x + rand(-0.25, 0.25), y: p.y + 0.02, z: p.z + rand(-0.12, 0.12), vx: rand(-0.03, 0.03), vy: rand(0.08, 0.18) * k, vz: rand(-0.03, 0.03), life: rand(2.2, 3.4), size: 0.03, grow: 0.06, color: [0.95, 0.95, 0.93], alpha: 0.12, drag: 0.5, grav: -0.02 });
  }

  // ------------------------------------------------------------ frame
  tickHouseLife(dt) {
    const c = this.cave, a = this.game.audio, p = this.rig.player.pos, fx = this.fx;
    if (!c || !this.train) return;
    const here = roomAt(p.x, p.z)?.id || (this.inBedroom?.(p.x, p.z) ? 'bedroom' : null);
    const near = (q, r) => q && Math.hypot(q.x - p.x, q.z - p.z) < r;
    // the stone face spouting into its pool
    const sp = c.dyn.spout, pond = c.dyn.pondWater;
    if (sp && (here === 'garden' || near(sp, 5))) {
      this.spoutT = (this.spoutT || 0) - dt;
      if (this.spoutT <= 0) {
        this.spoutT = 0.05;
        fx.droplet?.(sp.x - 0.02, sp.y, sp.z + rand(-0.01, 0.01), -rand(0.25, 0.4), rand(-0.05, 0.05), rand(-0.03, 0.03), 0.4, [0.75, 0.95, 1], 0.009);
        if (pond && Math.random() < 0.25) c.ripple('pond', pond.x + 0.18 + rand(-0.05, 0.05), pond.z + rand(-0.05, 0.05), 0.6);
      }
    }
    // the bath steaming, the spring pipe dripping into it
    const bs = c.dyn.bathSteam;
    if (bs && near(bs, 6)) {
      this.bathT = (this.bathT || 0) - dt;
      if (this.bathT <= 0) { this.bathT = 0.22; this.steamPuff(bs); }
      this.bathDripT = (this.bathDripT || 1) - dt;
      if (this.bathDripT <= 0 && c.dyn.bathSpout) {
        this.bathDripT = rand(0.8, 1.6);
        const d = c.dyn.bathSpout;
        fx.droplet?.(d.x, d.y, d.z, 0, -0.2, 0, 0.25, [0.8, 0.95, 1], 0.008);
        this.later(0.22, () => { c.ripple('bath', d.x, d.z, 0.7); if (near(d, 3)) a.play('drip', { vol: 0.12 }); });
      }
    }
    // spores drifting up the light well, glow-moths round the giant caps
    const sk = c.skylight;
    if (sk && (here === 'garden' || here === 'terrace' || near(sk, 7))) {
      this.sporeT = (this.sporeT || 0) - dt;
      if (this.sporeT <= 0) {
        this.sporeT = 0.12;
        const r = sk.r * 0.8 * Math.sqrt(Math.random()), an = Math.random() * Math.PI * 2;
        fx.spawn({ x: sk.x + Math.cos(an) * r, y: Y + rand(0.3, 1.5), z: sk.z + Math.sin(an) * r, vx: rand(-0.01, 0.01), vy: rand(0.05, 0.12), vz: rand(-0.01, 0.01), life: rand(6, 10), size: rand(0.004, 0.008), color: Math.random() < 0.5 ? [0.6, 1, 0.92] : [0.85, 0.75, 1], alpha: 0.8, glow: true, drag: 0.02, grav: -0.004 });
        if (Math.random() < 0.3 && c.giants?.length) { const g = pick(c.giants); fx.firefly?.(g.x + rand(-0.3, 0.3), g.y + rand(-0.2, 0.3), g.z + rand(-0.3, 0.3), pick([[0.6, 1, 0.85], [1, 0.7, 0.95], [0.8, 0.85, 1]])); }
      }
    }
    // the terrace: fireflies over the edge, the chime when the draught catches it
    if (here === 'terrace' || here === 'garden') {
      const t = ROOM.terrace;
      this.terraceT = (this.terraceT || 0) - dt;
      if (this.terraceT <= 0) {
        this.terraceT = 0.5;
        fx.firefly?.(rand(t.x0, t.x1), Y + rand(0.2, 1.8), t.z0 - rand(0.2, 2.5), pick([[0.78, 1, 0.48], [0.6, 1, 0.85], [1, 0.94, 0.62]]));
      }
      this.chimeT = (this.chimeT ?? rand(3, 8)) - dt;
      if (this.chimeT <= 0 && c.dyn.chime) {
        this.chimeT = rand(4, 11);
        const ch = c.dyn.chime, dist = Math.hypot(ch.x - p.x, ch.z - p.z), vol = clamp(0.06 - dist / 140, 0.008, 0.05);
        const base = pick([72, 74, 76, 79, 81]);
        for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) a.tone({ f: midiToFreq(base + pick([0, 3, 5, 7, 12])), type: 'sine', dur: 1.1, vol, delay: i * rand(0.12, 0.3), release: 0.9, reverb: 0.8 });
      }
    }
    // the little train on its oval
    const rw = c.dyn.railway, tr = this.train;
    if (rw?.cars) {
      const want = tr.laps > 0 ? 0.9 : 0;
      tr.speed += (want - tr.speed) * Math.min(1, dt * (want ? 1.2 : 0.6));
      if (tr.speed > 0.005) {
        const before = tr.k;
        tr.k += dt * tr.speed * 0.32;
        if (Math.floor(tr.k) > Math.floor(before)) tr.laps--;
        rw.cars.forEach((car, i) => {
          const t = (tr.k - i * 0.045) * Math.PI * 2;
          const x = rw.x + Math.cos(t) * rw.rx, z = rw.z + Math.sin(t) * rw.rz;
          const tx = -Math.sin(t) * rw.rx, tz = Math.cos(t) * rw.rz;
          car.position.set(x / T, rw.y / T, z / T);
          car.rotation.y = Math.atan2(tz, -tx) + Math.PI;
        });
        this.chuffT = (this.chuffT || 0) - dt;
        if (this.chuffT <= 0 && near(rw, 4)) { this.chuffT = 0.45 / Math.max(0.2, tr.speed); a.tone({ f: rand(140, 180), type: 'square', dur: 0.03, vol: 0.012 * tr.speed, filter: 'bandpass', ff: 900, q: 2 }); if (Math.random() < 0.08) a.tone({ f: 1320, f2: 1180, type: 'sine', dur: 0.3, vol: 0.015, reverb: 0.3 }); }
      } else if (!tr.placed) {
        tr.placed = true;
        rw.cars.forEach((car, i) => { const t = (-i * 0.045 + 0.62) * Math.PI * 2; car.position.set((rw.x + Math.cos(t) * rw.rx) / T, rw.y / T, (rw.z + Math.sin(t) * rw.rz) / T); car.rotation.y = Math.atan2(Math.cos(t) * rw.rz, Math.sin(t) * rw.rx) + Math.PI; });
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
          const dist = Math.hypot(horn.x - p.x, horn.z - p.z), vol = clamp(1.1 - dist / 6, 0.05, 1) * (here === 'living' ? 1 : 0.4);
          a.tone({ f: midiToFreq(note), type: 'triangle', dur: 0.3, vol: 0.035 * vol, release: 0.2, filter: 'lowpass', ff: 1800, reverb: 0.35 });
          if (gm.i % 4 === 1) a.tone({ f: midiToFreq(note - 24), type: 'triangle', dur: 0.2, vol: 0.03 * vol, filter: 'lowpass', ff: 600 });
          if (gm.i % 8 === 0) fx.spawn({ x: horn.x + rand(-0.05, 0.05), y: horn.y, z: horn.z, vy: 0.15, vx: rand(-0.05, 0.05), life: 1.6, size: 0.016, color: [1, 0.9, 0.7], glow: true, drag: 0.3 });
        }
      }
    }
    // the kettle sings now and then (when you're near the kitchen)
    this.kettleT -= dt;
    if (this.kettleT <= 0) {
      this.kettleT = rand(90, 160);
      const k = c.dyn.hearth?.kettle;
      if (k && Math.hypot(k.x - p.x, k.z - p.z) < 6) {
        a.tone({ f: 1760, f2: 2093, slide: 1.2, type: 'sine', dur: 2.4, vol: 0.02, a: 0.6, vib: 8, vibRate: 6, reverb: 0.4 });
        for (let i = 0; i < 20; i++) this.later(i * 0.1, () => fx.spawn({ x: k.x + 0.05, y: k.y + 0.03, z: k.z, vx: rand(0.1, 0.25), vy: rand(0.2, 0.35), vz: rand(-0.04, 0.04), life: 1.2, size: 0.012, grow: 0.035, color: [0.95, 0.95, 0.93], alpha: 0.3, drag: 0.7, grav: -0.06 }));
      }
    }
    // the cavern's light shafting down the light well, when you look up it from the garden
    if (sk) {
      const want = here === 'garden' ? 0.55 : 0;
      this.raysK = (this.raysK || 0) + (want - (this.raysK || 0)) * Math.min(1, dt * 2);
      if (this.raysK > 0.01) { this.post.rays = this.raysK; this.post.raysPos = [sk.x, sk.y + 1.6, sk.z]; this.post.raysColor = 0xa8f0e8; this.post.raysSky = 0; this.post.raysDecay = 0.955; }
      else if (this.post.rays) { this.post.rays = 0; this.post.raysPos = null; }
    }
    void onTerrace;
  }
}

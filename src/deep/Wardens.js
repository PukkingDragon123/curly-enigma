// The wardens (wave 21, docs/DESIGN_PROGRESSION.md, data/way.js WARDENS): one big creature of an
// existing kind sleeps in a hall a short crawl off a lift stop (Generator plan.wardens), across the
// way down to the next layer. It is tougher than its kind, it says who it is when it wakes, and when
// it goes down it drops its heart, which the next pick is forged round (Terraria's boss gates). Once
// beaten it stays beaten (state.data.way.wardens).
import { WARDENS, wayData, wardenBeaten } from '../data/way.js';

export class Wardens {
  constructor(scene) {
    this.sc = scene;
    this.live = {}; // id → the creature, while it's spawned
    this.woke = {};
    const en = scene.enemies;
    if (!en) return;
    // a warden's death, however it comes (the pick, a blast, the lava): its heart and the act
    const kill = en.kill.bind(en);
    en.kill = (e, dir, by) => {
      const was = e?.alive;
      kill(e, dir, by);
      if (was && e.warden) this.beaten(e);
    };
  }

  hall(id) { return (this.sc.world.plan.wardens || []).find((h) => h.id === id) || null; }

  update() {
    const sc = this.sc, en = sc.enemies, st = sc.state;
    if (!en) return;
    const p = sc.player.pos;
    for (const W of Object.values(WARDENS)) {
      if (wardenBeaten(st, W.id)) continue;
      const h = this.hall(W.id);
      if (!h) continue;
      let e = this.live[W.id];
      if (e && !e.alive) e = this.live[W.id] = null; // swept away while you were off: it'll be back
      const d = Math.hypot(p.x - h.x, (p.y - h.y) * 1.3, p.z - h.z);
      if (!e && d < 20 && en.loaded(h.x, h.y + 1, h.z)) e = this.spawn(W, h);
      if (e && !this.woke[W.id] && e.awake && e.dist < 9) {
        this.woke[W.id] = true;
        sc.audio.play('rumble_hit', { vol: 0.8 });
        sc.shake?.(0.35);
        sc.say('warden' + W.id, `<b>${W.name}</b>`, 'bad', 30);
      }
    }
  }

  spawn(W, h) {
    const en = this.sc.enemies;
    const e = en.debugSpawn(W.kind, h.x, h.y + 0.6, h.z);
    if (!e) return null;
    e.warden = W.id;
    e.hp = e.maxHp = e.maxHp * W.hp;
    if (W.kind === 'golem') {
      // the clay one stands half again as tall as its kind
      e.size *= 1.5; e.hw *= 1.5; e.h *= 1.5;
      e.updateSpheres(); e.place();
    }
    this.live[W.id] = e;
    return e;
  }

  beaten(e) {
    const sc = this.sc, st = sc.state, W = WARDENS[e.warden];
    if (!W || wardenBeaten(st, W.id)) return;
    wayData(st).wardens[W.id] = st.data.day || 1;
    this.live[W.id] = null;
    sc.enemies.dropItem(e, W.heart, 0.35, 0.4);
    st.emit('act', { type: 'warden', id: W.id });
    sc.audio.play('fanfare');
    sc.say('wardenDown' + W.id, `<b>${W.name}</b> · down`, 'good', 30);
    st.save?.();
  }

  /** For the radar: the hall, while its warden still sleeps there. */
  radarMarkers(pos) {
    const st = this.sc.state, out = [];
    for (const W of Object.values(WARDENS)) {
      if (wardenBeaten(st, W.id)) continue;
      const h = this.hall(W.id);
      if (!h || Math.hypot(h.x - pos.x, (h.y - pos.y) * 1.5, h.z - pos.z) > 28) continue;
      out.push({ kind: 'enemy', x: h.x, y: h.y + 1, z: h.z, label: W.name, color: '#d4561e' });
    }
    return out;
  }
}

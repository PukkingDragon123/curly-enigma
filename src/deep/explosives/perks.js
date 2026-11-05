// Upgrade-board perks that need a tick in the mine, run by Explosives.update (DigScene loads that
// module, so these work without touching the scene):
// - Second Wind (mineBonus().rest): standing still for a moment, energy trickles back.
// - Kill tracking: creatures seen off (stats.kills) and rubble golems (stats.golems).
// - Milestones: checks them twice a second and turns new ones into toasts.
// All return DigScene events ({ say }).
import { milestoneText } from '../../data/upgrades.js';

export class Perks {
  constructor(ctx) {
    this.ctx = ctx;
    this.st = ctx.state;
    this.owner = ctx.owner;
    this.still = 0;
    this.restAcc = 0;
    this.msT = 0.5;
    this.killed = null;
    this.seen = new WeakSet();
  }

  update(dt, o = {}) {
    const out = [];
    const st = this.st, owner = this.owner;
    if (!st?.mineBonus) return out;
    const busy = owner?.leaving || owner?.game?.ui?.isPanelOpen?.();
    const mb = st.mineBonus();
    const pl = o.player || this.ctx.player;
    // ---- Second Wind: catch your breath
    const inp = owner?.game?.input;
    const working = inp?.mouseDown?.(0) || (owner?.clumps?.capture?.() ?? false);
    if (!busy && pl && pl.grounded !== false && (pl.speed || 0) < 0.15 && !working && !pl.inLava) this.still += dt;
    else this.still = 0;
    if (mb.rest > 0 && this.still > 1.5 && st.energy < st.maxEnergy) {
      this.restAcc += mb.rest * dt;
      if (this.restAcc >= 1) { const n = Math.floor(this.restAcc); this.restAcc -= n; st.restoreEnergy(n); }
      if (!this.restHint && this.still > 2.5) { this.restHint = true; out.push({ say: 'You catch your breath. <b>Second Wind</b> brings your energy back while you rest.', key: 'perk_rest', tone: 'good', cd: 600 }); }
    }
    // ---- creatures seen off
    const en = owner?.enemies;
    if (en?.stats) {
      if (this.killed === null) this.killed = en.stats.killed || 0;
      const d = (en.stats.killed || 0) - this.killed;
      if (d > 0) { st.data.stats.kills = (st.data.stats.kills || 0) + d; this.killed += d; }
      for (const e of en.list || []) {
        if (e.alive || this.seen.has(e)) continue;
        this.seen.add(e);
        if (/golem/.test(e.kind || '')) st.data.stats.golems = (st.data.stats.golems || 0) + 1;
      }
    }
    // ---- milestones
    this.msT -= dt;
    if (this.msT <= 0) {
      this.msT = 0.5;
      st.checkMilestones?.();
      for (const m of st.takeMilestones?.() || []) {
        out.push({ say: milestoneText(m), key: 'ms_' + m.id, tone: 'good', cd: 0 });
        this.ctx.audio?.play('levelup');
      }
    }
    return out;
  }
}

// Upgrade-board perks that need a tick in the mine, run by Explosives.update (DigScene loads that
// module, so these work without touching the scene):
// - Second Wind (mineBonus().rest): standing still for a moment, energy trickles back.
// - Nugget's Nose (mineBonus().nugget): every so often Nugget scratches up an ore nugget → loot.
// - Kill tracking: creatures seen off (stats.kills) and rubble golems (stats.golems).
// - Milestones: checks them twice a second and turns new ones into toasts.
// All return DigScene events ({ say }, { loot }).
import { ITEMS } from '../../data/items.js';
import { zoneAt } from '../Generator.js';
import { milestoneText } from '../../data/upgrades.js';

// what Nugget turns up, per zone: [item, weight]
const NUGGET_FINDS = [null,
  [['copper_ore', 4], ['tin_ore', 3], ['coal', 3], ['quartz', 1]],
  [['iron_ore', 4], ['copper_ore', 2], ['tin_ore', 2], ['amber', 1]],
  [['silver_ore', 3], ['iron_ore', 2], ['quartz', 2], ['amethyst', 1], ['lumite', 1]],
  [['gold_ore', 3], ['silver_ore', 2], ['obsidian_shard', 2], ['ruby', 1]],
  [['mithril_ore', 3], ['gold_ore', 2], ['sapphire', 1], ['frostite', 0.5]],
  [['moonsilver_ore', 3], ['mithril_ore', 2], ['emerald', 1], ['adamant_ore', 0.4]],
];

export class Perks {
  constructor(ctx) {
    this.ctx = ctx;
    this.st = ctx.state;
    this.owner = ctx.owner;
    this.still = 0;
    this.restAcc = 0;
    this.msT = 0.5;
    this.nugT = 30 + Math.random() * 30;
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
    // ---- Nugget's Nose
    if (mb.nugget > 0 && owner?.nugget && !busy) {
      this.nugT -= dt;
      if (this.nugT <= 0) {
        this.nugT = (150 / (0.5 + mb.nugget * 0.5)) * (0.6 + Math.random() * 0.8);
        const ev = this.nuggetFind(mb.nugget);
        if (ev) out.push(...ev);
      }
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

  /** Nugget scratches at the floor and turns something up. */
  nuggetFind(level) {
    const nug = this.owner.nugget, fx = this.ctx.fx;
    const p = nug.pos || nug.root?.position;
    if (!p) return null;
    const zone = Math.max(1, Math.min(6, zoneAt(Math.max(0, -p.y))));
    const list = NUGGET_FINDS[zone];
    let r = Math.random() * list.reduce((s, e) => s + e[1], 0), id = list[0][0];
    for (const [k, w] of list) { r -= w; if (r <= 0) { id = k; break; } }
    if (!ITEMS[id]) return null;
    const q = Math.round(Math.min(100, 50 + Math.random() * 35 + level * 3));
    this.ctx.audio?.play('bawk');
    this.ctx.audio?.play('sparkle', { vol: 0.5 });
    for (let k = 0; k < 8; k++) fx?.glints(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.1 + Math.random() * 0.2, p.z + (Math.random() - 0.5) * 0.3);
    fx?.dust(p.x, p.y + 0.05, p.z, 6, [0.5, 0.42, 0.34], 0.12);
    try { nug.rig?.peck?.(); } catch (e) { /* the hen may be mid-flutter */ }
    return [
      { say: `Nugget scratched up some <b>${ITEMS[id].name}</b>!`, key: 'nugfind', tone: 'good', cd: 1 },
      { loot: { id, q, p: false } },
    ];
  }
}

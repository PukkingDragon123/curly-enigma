// Old Star's loot chest in his hall: the first time you open it there's a proper start in it (a
// few coins, a chisel or a brush, glow stakes, snacks); after that he tucks a little something in
// it most mornings. Opening it: the lock clicks, the lid creaks up, golden light spills out with a
// shower of sparkles, and the things inside pop out one by one and fly into your backpack (coins
// into your pouch). Loot state lives in state.data.oldstar ({ chestFirst, chestDay }).
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';
import { el, rand, pick } from '../core/util.js';
import { T } from './units.js';
import { starData } from './starData.js';
import { openBackpack } from '../ui/Backpack.js';

const _v = new THREE.Vector3();

/** What's in the chest right now: [{ id, n } | { gold }] (empty when it's been emptied today). */
export function chestContents(state) {
  const d = state.data;
  const t = starData(state);
  if (!t.chestFirst) {
    const out = [{ gold: 60 }];
    const tool = !state.owns('chisel_basic') ? 'chisel_basic' : !state.owns('brush_basic') ? 'brush_basic' : null;
    if (tool) out.push({ id: tool, n: 1 });
    if (tool === 'chisel_basic' && !state.owns('brush_basic')) out.push({ id: 'brush_basic', n: 1 });
    if (!tool) out.push({ gold: 60 });
    out.push({ id: 'glow_stake', n: 2 }, { id: 'grub_bar', n: 2 }, { id: 'tea_flask', n: 1 });
    return out.filter((o) => o.gold || ITEMS[o.id]);
  }
  if ((t.chestDay ?? 0) >= d.day) return [];
  // a small, cozy refill: a few coins and one little thing (the same for the whole day)
  const r = mulberry(d.day * 7919 + 13);
  const gold = 6 + Math.floor(r() * 16);
  const small = [['glow_stake', 1], ['grub_bar', 1], ['tea_flask', 1], ['glowcap', 2], ['mushroom', 2], ['rootbeer', 1], ['cave_carrot', 2], ['honey', 1]].filter(([id]) => ITEMS[id]);
  const [id, n] = small[Math.floor(r() * small.length)] || ['grub_bar', 1];
  return [{ gold }, { id, n }];
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class LootChest {
  /** s: the HomeScene; parts: the hall's chest pieces ({ group, lid, loot, dims }). */
  constructor(s, parts) {
    this.s = s;
    this.g = s.game;
    this.p = parts;
    this.open = 0; // lid angle 0..1
    this.busy = false;
    this.glint = null;
    this.refresh();
  }

  get hasLoot() { return chestContents(this.g.state).length > 0; }

  /** Show the treasure heap (and a glint at the lid) while there's something in it. */
  refresh() {
    const full = this.hasLoot;
    this.p.loot.visible = full && this.open > 0.05;
    if (full && !this.glint) this.glint = this.s.glow.add({ kind: 'halo', ...this.worldPos(0, this.p.dims.body * T + 0.02, 0.17), w: 0.16, color: 0xffe08a, opacity: 0.55 });
    else if (!full && this.glint) { this.s.glow.remove(this.glint); this.glint = null; }
  }

  /** A point on the chest (local meters from its centre at the floor; z toward the front) in world meters. */
  worldPos(x, y, z) {
    this.p.group.updateMatrixWorld(true);
    const w = _v.set(x / T, y / T, z / T).applyMatrix4(this.p.group.matrixWorld);
    return { x: w.x, y: w.y, z: w.z };
  }

  setLid(k) {
    this.open = k;
    this.p.lid.rotation.x = -k * 1.42;
  }

  /** E on the chest. Returns the loot list it handed over (empty if there was nothing). */
  async use() {
    if (this.busy) return null;
    this.busy = true;
    const s = this.s, a = this.g.audio, st = this.g.state;
    const items = chestContents(st);
    const lidTop = this.worldPos(0, this.p.dims.body * T + 0.05, 0);
    s.rig.vm?.impact('none', 0.35);
    a.play('click', { vol: 0.6 });
    await s.sleepFor(0.12);
    a.play('creak', { vol: 0.8 });
    a.play('door', { vol: 0.25 });
    if (!items.length) {
      // no gift today: it's your trunk (what doesn't fit in the backpack lives in here)
      await s.tween(0.4, (k) => this.setLid(Math.sin(k * Math.PI / 2) * 0.95));
      s.fx.dust(lidTop.x, lidTop.y, lidTop.z, 8, [0.6, 0.52, 0.42], 0.08);
      let h = null;
      try { h = openBackpack(this.g, { side: 'trunk' }); } catch (e) { console.warn('[home] trunk', e); }
      if (!h) s.think(pick(['Empty. Old Star tucks something in most mornings.', 'Just dust and the smell of old pennies. Tomorrow, maybe.']), 2.6);
      while (h && !h.closed && s.game.scene === s) await s.sleepFor(0.15);
      await s.tween(0.35, (k) => this.setLid(0.95 * (1 - k)));
      a.play('clunk', { vol: 0.35 });
      this.busy = false;
      return [];
    }
    // the lid swings up with a little overshoot; golden light floods out
    this.p.loot.visible = true;
    const flare = s.addLight({ ...lidTop, y: lidTop.y + 0.05, color: 0xffd070, intensity: 0, distance: 2.2, flicker: 0.08, halo: 0.42, haloOpacity: 0.7, pool: 0.55, poolX: lidTop.x, poolZ: lidTop.z, poolY: s.floorY(lidTop.x, lidTop.z) + 0.008, poolOpacity: 0.3, priority: 9 });
    s.tween(0.7, (k) => { const e = 1 - (1 - k) ** 3; this.setLid(e * 1.08 - Math.sin(k * Math.PI) * 0.06); flare.intensity = 2.2 * e; });
    await s.sleepFor(0.3);
    a.play('sparkle');
    a.play('glow', { vol: 0.6 });
    s.fx.dust(lidTop.x, lidTop.y, lidTop.z, 10, [0.62, 0.54, 0.44], 0.1);
    for (let i = 0; i < 26; i++) s.fx.spawn({ x: lidTop.x + rand(-0.12, 0.12), y: lidTop.y, z: lidTop.z + rand(-0.08, 0.08), vx: rand(-0.25, 0.25), vy: rand(0.5, 1.3), vz: rand(-0.25, 0.25), life: rand(0.8, 1.5), size: rand(0.008, 0.016), color: pick([[1, 0.86, 0.4], [1, 0.95, 0.7], [1, 0.7, 0.3]]), glow: true, drag: 1.2, grav: 0.6 });
    // claim it now (so a scene change mid-animation can't lose it), then let the things fly
    const d = st.data, t = starData(st);
    const first = !t.chestFirst;
    t.chestFirst = true;
    t.chestDay = d.day;
    for (const it of items) {
      if (it.gold) st.addGold(it.gold, 'chest');
      else {
        st.addItem(it.id, { spill: true, n: it.n });
        const def = ITEMS[it.id];
        if (def?.slot && !st.data.equip[def.slot]) st.equip(it.id);
      }
    }
    st.save();
    this.g.ui.status?.pin?.(true);
    await this.fly(items, lidTop);
    this.g.ui.status?.pin?.(false);
    const names = items.map((it) => (it.gold ? `<b class="gold-txt">${it.gold} gold</b>` : `${it.n > 1 ? it.n + '× ' : ''}${ITEMS[it.id]?.name || it.id}`));
    this.g.ui.toast(`${first ? '<b>Old Star\'s chest!</b> ' : ''}${names.join(', ')}`, { kind: 'good', dur: 3800 });
    if (first) s.star?.say('That\'s for you. A mole shouldn\'t go down there with empty paws.', { mood: 'happy' });
    await s.sleepFor(0.8);
    s.tween(0.6, (k) => { flare.intensity = 2.2 * (1 - k); });
    await s.sleepFor(0.9);
    await s.tween(0.45, (k) => this.setLid(1.02 * (1 - k * k)));
    this.setLid(0);
    a.play('clunk', { vol: 0.5 });
    s.rig.shake?.(0.06);
    s.removeLight(flare);
    this.refresh();
    this.busy = false;
    return items;
  }

  /** The loot pops out of the chest (DOM icons over the canvas) and flies to the backpack / pouch. */
  fly(items, from) {
    const ui = this.g.ui, a = this.g.audio;
    const p0 = this.s.toScreen(_v.set(from.x, from.y, from.z));
    const target = (gold) => {
      const node = gold ? ui.status?.pouch : ui.status?.packBtn;
      const r = node?.getBoundingClientRect?.();
      if (r && r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      return { x: window.innerWidth - 60, y: 50 };
    };
    const jobs = items.map((it, i) => new Promise((done) => {
      setTimeout(() => {
        const src = it.gold ? null : iconURL(it.id);
        const img = el('div', { class: 'loot-fly', style: { position: 'fixed', left: '0', top: '0', width: 'var(--icon, 64px)', height: 'var(--icon, 64px)', marginLeft: 'calc(var(--icon, 64px) / -2)', marginTop: 'calc(var(--icon, 64px) / -2)', pointerEvents: 'none', zIndex: 60, imageRendering: 'pixelated', filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.5)) drop-shadow(0 0 6px rgba(255,220,120,.8))' } });
        if (it.gold) img.append(el('div', { style: { width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontSize: '1.6em', color: 'var(--gold)', textShadow: '0 2px 0 #3a2210' } }, `+${it.gold}`));
        else img.append(el('img', { class: 'pix', src, alt: '', style: { width: '100%', height: '100%' } }));
        document.body.append(img);
        const sx = p0.x, sy = p0.y;
        const hx = sx + (i - (items.length - 1) / 2) * 52, hy = sy - 120 - (i % 2) * 18;
        const t = target(!!it.gold);
        a.play('pickup', { pitch: 1 + i * 0.08 });
        const anim = img.animate([
          { transform: `translate(${sx}px, ${sy}px) scale(.3)`, opacity: 0 },
          { transform: `translate(${hx}px, ${hy}px) scale(1.15)`, opacity: 1, offset: 0.32 },
          { transform: `translate(${hx}px, ${hy - 10}px) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${t.x}px, ${t.y}px) scale(.45)`, opacity: 0.9 },
        ], { duration: 1500, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
        const finish = () => { img.remove(); a.play(it.gold ? 'coins' : 'pickup_gem', { vol: 0.5 }); done(); };
        anim.onfinish = finish;
        setTimeout(() => { if (img.isConnected) finish(); }, 2400);
      }, i * 230);
    }));
    return Promise.all(jobs);
  }

  dispose() {
    if (this.glint) this.s.glow.remove(this.glint);
  }
}

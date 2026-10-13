// Particle effect helpers for the mine. Inputs are grid coords (x right, y down).
import { rand, chance, hexToRgb } from '../core/util.js';
import { BLOCKS, ORES } from './blocks.js';
import { ITEMS } from '../data/items.js';

const rgb = (hex) => { const c = hexToRgb(hex); return [c.r / 255, c.g / 255, c.b / 255]; };

export class FX {
  constructor(scene) {
    this.s = scene;
    this.dustP = scene.renderer.dust;
    this.glowP = scene.renderer.glow;
    this.flashes = []; // temporary dynamic lights
  }
  light(x, y, color, radius, life) {
    this.flashes.push({ x, y, c: color, radius, life, t: 0 });
  }
  lights(out, dt) {
    const keep = [];
    for (const f of this.flashes) {
      f.t += dt;
      if (f.t >= f.life) continue;
      const k = 1 - f.t / f.life;
      out.push({ x: f.x, y: f.y, r: f.c[0] * k, g: f.c[1] * k, b: f.c[2] * k, radius: f.radius, pierce: 0 });
      keep.push(f);
    }
    this.flashes = keep;
  }

  dust(x, y, n = 6, color = [0.75, 0.68, 0.6], spread = 0.4) {
    for (let i = 0; i < n; i++) {
      this.dustP.spawn({ x: x + rand(-spread, spread), y: -y + rand(-spread, spread), z: rand(0.1, 0.6), vx: rand(-0.8, 0.8), vy: rand(-0.1, 0.9), vz: rand(0, 0.5),
        life: rand(0.6, 1.4), size: rand(0.07, 0.16), grow: 0.08, color, alpha: rand(0.5, 0.85), drag: 2.4, grav: -0.3 });
    }
  }
  dustCloud(x, y, r = 1.2, color = [0.8, 0.74, 0.66]) {
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2), d = rand(0, r);
      this.dustP.spawn({ x: x + Math.cos(a) * d * 0.5, y: -y + Math.sin(a) * d * 0.5, z: rand(0.1, 0.9), vx: Math.cos(a) * rand(0.5, 2.2), vy: Math.sin(a) * rand(0.5, 2.0) + 0.4, vz: rand(0, 1),
        life: rand(1, 2.4), size: rand(0.12, 0.26), grow: 0.12, color, alpha: rand(0.55, 0.85), drag: 2.0, grav: -0.15 });
    }
  }
  blockDust(x, y, blockId, n = 8) {
    const b = BLOCKS[blockId];
    this.dust(x, y, n, rgb(b?.dust ?? 0x9a9088), 0.45);
  }
  spark(x, y, color = [1, 0.85, 0.4]) {
    this.glowP.spawn({ x, y: -y, z: rand(0.2, 0.6), vx: rand(-1, 1), vy: rand(-0.5, 1.5), life: rand(0.2, 0.5), size: rand(0.05, 0.09), color, alpha: 1, drag: 1, grav: 2 });
  }
  sparks(x, y, n = 8, color = [1, 0.8, 0.35], speed = 5) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      this.glowP.spawn({ x, y: -y, z: rand(0.3, 0.7), vx: Math.cos(a) * rand(1, speed), vy: Math.sin(a) * rand(1, speed) + 1.5, vz: rand(0, 2), life: rand(0.18, 0.5), size: rand(0.04, 0.08), color, alpha: 1, drag: 1.5, grav: 12 });
    }
  }
  ember(x, y) {
    this.glowP.spawn({ x: x + rand(-0.2, 0.2), y: -y, z: rand(0.1, 0.4), vx: rand(-0.4, 0.4), vy: rand(0.6, 1.6), life: rand(0.6, 1.4), size: rand(0.04, 0.07), color: chance(0.5) ? [1, 0.55, 0.15] : [1, 0.8, 0.3], alpha: 1, drag: 0.6, grav: -0.5 });
  }
  smoke(x, y, n = 1) {
    for (let i = 0; i < n; i++) this.dustP.spawn({ x: x + rand(-0.2, 0.2), y: -y, z: rand(0.1, 0.5), vx: rand(-0.3, 0.3), vy: rand(0.5, 1.2), life: rand(1.2, 2.5), size: rand(0.14, 0.24), grow: 0.25, color: [0.35, 0.32, 0.32], alpha: 0.55, drag: 0.8, grav: -0.4 });
  }
  steam(x, y, n = 10) {
    for (let i = 0; i < n; i++) this.dustP.spawn({ x: x + rand(-0.4, 0.4), y: -y + rand(-0.2, 0.3), z: rand(0.2, 0.7), vx: rand(-0.6, 0.6), vy: rand(1, 2.4), life: rand(0.7, 1.6), size: rand(0.14, 0.28), grow: 0.35, color: [0.9, 0.92, 0.95], alpha: 0.7, drag: 1.4, grav: -0.6 });
  }
  spore(x, y) {
    this.glowP.spawn({ x: x + rand(-0.3, 0.3), y: -y + rand(-0.2, 0.2), z: 0.3, vx: rand(-0.2, 0.2), vy: rand(0.1, 0.4), life: rand(1.5, 3), size: 0.05, color: [0.6, 0.4, 0.8], alpha: 0.8, drag: 0.5, grav: -0.05 });
  }
  spores(x, y) { for (let i = 0; i < 30; i++) { this.spore(x + rand(-0.6, 0.6), y + rand(-0.6, 0.4)); } this.dust(x, y, 10, [0.55, 0.42, 0.7]); }
  sparkle(x, y, color = [1, 1, 0.85]) {
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      this.glowP.spawn({ x: x + Math.cos(a) * 0.2, y: -y + Math.sin(a) * 0.2, z: 0.5, vx: Math.cos(a) * rand(0.5, 2), vy: Math.sin(a) * rand(0.5, 2), life: rand(0.4, 0.9), size: rand(0.05, 0.09), color, alpha: 1, drag: 2.5 });
    }
  }
  hearts(x, y) { for (let i = 0; i < 5; i++) this.glowP.spawn({ x: x + rand(-0.3, 0.3), y: -y + 0.3, z: 0.5, vx: rand(-0.3, 0.3), vy: rand(0.6, 1.2), life: 1.2, size: 0.09, color: [1, 0.4, 0.55], alpha: 1, drag: 1 }); }
  leaves(x, y, type) {
    const c = type === 'glowcap' ? [0.4, 0.7, 1] : type === 'ember' ? [1, 0.5, 0.2] : [0.45, 0.7, 0.35];
    for (let i = 0; i < 8; i++) this.dustP.spawn({ x: x + rand(-0.3, 0.3), y: -y + rand(-0.2, 0.3), z: 0.3, vx: rand(-1.2, 1.2), vy: rand(0.5, 2), life: rand(0.6, 1.2), size: rand(0.05, 0.09), color: c, alpha: 1, drag: 1.5, grav: 5, fade: true });
  }
  pop(x, y) {
    this.s.audio.play('bubble');
    this.s.audio.play('whoosh');
    for (let i = 0; i < 16; i++) { const a = rand(0, 6.28); this.glowP.spawn({ x, y: -y, z: 0.4, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 0.5, size: 0.06, color: [0.85, 0.75, 1], alpha: 0.9, drag: 3 }); }
    // the gas burst shoves nearby debris
    for (const d of this.s.debris.list) { const dx = d.x - x, dy = d.y + y; const dd = Math.hypot(dx, dy); if (dd < 2) { d.vx += (dx / (dd + 0.1)) * 4; d.vy += 3; d.rest = false; } }
  }
  crumbs(x, y, oreId) {
    const it = ITEMS[ORES[oreId]?.item];
    const c = it?.icon?.ore?.[0] ?? it?.icon?.c?.[0] ?? 0xaaaaaa;
    this.dust(x, y, 2, rgb(c), 0.3);
  }
  burnItem(p) { this.steam(p.x, p.y, 4); this.sparks(p.x, p.y, 6, [1, 0.6, 0.2], 3); this.s.audio.play('sizzle'); }
  burnAt(x, y) { this.smoke(x, y, 4); for (let i = 0; i < 5; i++) this.ember(x, y); }
  trickle(x, y) {
    // dust trickling down from a stressed ceiling cell
    this.dustP.spawn({ x: x + rand(0.1, 0.9), y: -y - 1, z: rand(0.1, 0.45), vx: rand(-0.05, 0.05), vy: rand(-0.5, -0.2), life: rand(0.8, 1.6), size: rand(0.04, 0.08), color: [0.7, 0.62, 0.52], alpha: 0.9, drag: 0.2, grav: 4 });
  }
  arcs(x, y, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      let px = x, py = y;
      for (let k = 0; k < 5; k++) {
        px += Math.cos(a + rand(-0.8, 0.8)) * 0.22; py += Math.sin(a + rand(-0.8, 0.8)) * 0.22;
        this.glowP.spawn({ x: px, y: -py, z: 0.55, life: rand(0.08, 0.2), size: 0.06, color: [0.6, 0.95, 1], alpha: 1, drag: 0 });
      }
    }
  }
  bubbles(x, y) { this.dustP.spawn({ x: x + rand(-0.3, 0.3), y: -y, z: 0.33, vx: 0, vy: rand(0.5, 1), life: rand(0.5, 1), size: 0.05, color: [0.75, 0.88, 1], alpha: 0.8, drag: 0.5, grav: -1 }); }
  scent(x, y) { this.glowP.spawn({ x: x + rand(0.2, 0.8), y: -y - rand(0.2, 0.8), z: 0.55, vx: rand(-0.15, 0.15), vy: rand(0.2, 0.5), life: rand(1.6, 2.6), size: 0.05, color: [0.95, 0.85, 0.4], alpha: 0.45, drag: 0.3 }); }
  frost(x, y) { for (let i = 0; i < 8; i++) this.glowP.spawn({ x: x + rand(0, 1), y: -y - rand(0, 1), z: 0.5, vx: rand(-0.3, 0.3), vy: rand(-0.2, 0.3), life: rand(0.5, 1.1), size: 0.05, color: [0.8, 0.95, 1], alpha: 0.9, drag: 1 }); }
  mote(x, y) {
    this.dustP.spawn({ x, y: -y, z: rand(-0.2, 0.9), vx: rand(-0.12, 0.12), vy: rand(-0.06, 0.1), life: rand(3, 6), size: rand(0.025, 0.045), color: [1, 0.95, 0.8], alpha: 0.75, drag: 0.1 });
  }
  drip(x, y) {
    this.dustP.spawn({ x, y: -y, z: 0.2, vx: 0, vy: -0.4, life: 1.6, size: 0.05, color: [0.6, 0.8, 1], alpha: 0.9, drag: 0, grav: 9, collide: true, fade: false });
  }
  glints(x, y) { this.glowP.spawn({ x: x + rand(0.15, 0.85), y: -y - rand(0.15, 0.85), z: 0.53, life: rand(0.25, 0.45), size: 0.06, color: [1, 1, 0.9], alpha: 0.9, drag: 0, fade: true }); }
}

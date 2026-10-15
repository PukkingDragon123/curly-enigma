// Particle recipes for creatures, built on Particles.spawn (meters, colors as [r, g, b] 0..1).
const TAU = Math.PI * 2;
const R = (a, b) => a + Math.random() * (b - a);

/** A ring of dust racing outward along the ground (golem slam). */
export function shockRing(fx, x, y, z, r0, speed, color, n = 56) {
  const light = color.map((k) => Math.min(1, k * 1.6 + 0.15));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R(-0.04, 0.04), c = Math.cos(a), s = Math.sin(a);
    const sp = speed * R(0.95, 1.05);
    // the wave front: billowing dust riding along the floor at the wave's speed
    fx.spawn({ x: x + c * r0, y: y + R(0.03, 0.1), z: z + s * r0, vx: c * sp, vy: R(0.3, 0.8), vz: s * sp, life: R(0.55, 0.7), size: R(0.09, 0.14), grow: 0.35, color: i % 3 ? color : light, alpha: 0.85, drag: 0.25, grav: 0.6 });
    // a faint bright crest so it reads in the dark
    if (i % 2 === 0) fx.spawn({ x: x + c * r0, y: y + 0.04, z: z + s * r0, vx: c * sp, vy: 0.1, vz: s * sp, life: 0.55, size: 0.035, color: light.map((k) => k * 0.55), glow: true, drag: 0.25 });
    // pebbles kicked up behind it
    if (i % 2 === 1) fx.spawn({ x: x + c * r0, y: y + 0.05, z: z + s * r0, vx: c * sp * 0.6, vy: R(1.8, 3.8), vz: s * sp * 0.6, life: R(0.5, 0.9), size: R(0.016, 0.028), color: color.map((k) => k * 0.7), drag: 0.4, grav: 9, bounce: 0.4, fade: false });
  }
}

/** Soft puff (dust, smoke, steam). */
export function puff(fx, x, y, z, n, color, spread = 0.15, up = 0.3, size = 0.06, alpha = 0.6) {
  for (let i = 0; i < n; i++) {
    const ox = R(-1, 1) * spread, oy = R(-0.5, 1) * spread, oz = R(-1, 1) * spread;
    fx.spawn({ x: x + ox, y: y + oy, z: z + oz, vx: ox * 3, vy: up + R(0, 0.5), vz: oz * 3, life: R(0.6, 1.3), size: size * R(0.7, 1.3), grow: size * 1.4, color, alpha: alpha * R(0.7, 1), drag: 2.4, grav: -0.1 });
  }
}

/** Glowing bits flung in all directions (sparkle bursts, embers, crystal glitter). */
export function sparkle(fx, x, y, z, n, color, speed = 2.5, grav = 2, size = 0.02, life = 0.7) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, b = R(-1, 1) * 1.3, sp = speed * R(0.3, 1);
    fx.spawn({ x, y, z, vx: Math.cos(a) * Math.cos(b) * sp, vy: Math.sin(b) * sp + speed * 0.3, vz: Math.sin(a) * Math.cos(b) * sp, life: life * R(0.6, 1.3), size: size * R(0.7, 1.4), color, glow: true, drag: 1.6, grav, bounce: 0.5 });
  }
}

/** Slow glowing spores drifting in a cloud. */
export function spores(fx, x, y, z, n, color, r = 0.6, speed = 0.8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, e = R(-0.3, 1), sp = speed * R(0.3, 1);
    const d = Math.random() * r;
    fx.spawn({ x: x + Math.cos(a) * d, y: y + e * d * 0.6, z: z + Math.sin(a) * d, vx: Math.cos(a) * sp, vy: e * sp * 0.6 + R(0, 0.25), vz: Math.sin(a) * sp, life: R(1.4, 2.8), size: R(0.014, 0.03), color, glow: true, drag: 1.9, grav: -0.05, alpha: R(0.6, 1) });
  }
}

/** One ghostly trail mote (no motion of its own). */
export function mote(fx, x, y, z, color, size = 0.03, life = 0.7, glow = true) {
  fx.spawn({ x: x + R(-0.03, 0.03), y: y + R(-0.03, 0.03), z: z + R(-0.03, 0.03), vx: R(-0.1, 0.1), vy: R(0, 0.25), vz: R(-0.1, 0.1), life: life * R(0.7, 1.2), size: size * R(0.7, 1.3), grow: -size * 0.6, color, glow, drag: 1, alpha: 0.8 });
}

/** A line of motes from a to b drifting toward b (energy being drained). */
export function stream(fx, ax, ay, az, bx, by, bz, n, color) {
  for (let i = 0; i < n; i++) {
    const t = Math.random();
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    fx.spawn({ x: x + R(-0.08, 0.08), y: y + R(-0.08, 0.08), z: z + R(-0.08, 0.08), vx: (bx - ax) * 1.4, vy: (by - ay) * 1.4, vz: (bz - az) * 1.4, life: R(0.25, 0.5), size: R(0.018, 0.03), color, glow: true, drag: 0.5 });
  }
}

/** Chunky bits that fall and bounce (pebbles shaken loose). */
export function pebbles(fx, x, y, z, n, color, spread = 0.2, up = 1.2) {
  for (let i = 0; i < n; i++) {
    fx.spawn({ x: x + R(-spread, spread), y: y + R(0, spread), z: z + R(-spread, spread), vx: R(-0.8, 0.8), vy: R(0, up), vz: R(-0.8, 0.8), life: R(0.5, 1), size: R(0.014, 0.026), color, drag: 0.5, grav: 9, bounce: 0.35, fade: false });
  }
}

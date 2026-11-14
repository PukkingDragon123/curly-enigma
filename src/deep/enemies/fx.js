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

// ------------------------------------------------------------------ wave 13 signature moves
const LOD = (fx) => fx.lod || 1;

/**
 * A dust bunny bursts: a billowing ball of fine voxel dust in its fur tones (lit by the lamp),
 * a ring of dust racing along the floor, fluff bits that flutter down, a few glints.
 * tones: 4 [r, g, b] colours dark → light. k scales the count.
 */
export function dustBurst(fx, x, y, z, floorY, tones, k = 1) {
  const n = Math.round(84 * k * LOD(fx));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, e = R(-0.3, 1), h = Math.sqrt(1 - e * e), sp = R(1.1, 3.4) * k;
    const vx = Math.cos(a) * h * sp, vy = e * sp * 0.8 + 0.35, vz = Math.sin(a) * h * sp;
    fx.spawn({ x: x + vx * 0.03, y: y + vy * 0.03, z: z + vz * 0.03, vx, vy, vz, life: R(1.1, 2.3), size: R(0.022, 0.05), grow: R(0.02, 0.06), color: tones[i % 4], alpha: R(0.75, 1), drag: R(3, 4.6), grav: -0.12, swirl: 0.5, lit: 0.55 });
  }
  // fluff bits: flutter down (twirling in the air)
  for (let i = 0, m = Math.round(26 * k * LOD(fx)); i < m; i++) {
    const a = Math.random() * TAU, sp = R(0.4, 1.6);
    fx.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: R(1.2, 2.6), vz: Math.sin(a) * sp, life: R(1.6, 2.6), size: R(0.01, 0.017), color: tones[2 + (i & 1)], drag: 1.6, grav: 1.6, swirl: 1.4, lit: 0.4 });
  }
  // the ring along the floor
  for (let i = 0, m = Math.round(30 * k * LOD(fx)); i < m; i++) {
    const a = (i / m) * TAU + R(-0.06, 0.06), sp = R(2, 2.7) * k;
    fx.spawn({ x: x + Math.cos(a) * 0.08, y: floorY + R(0.02, 0.07), z: z + Math.sin(a) * 0.08, vx: Math.cos(a) * sp, vy: R(0.1, 0.35), vz: Math.sin(a) * sp, life: R(0.7, 1), size: R(0.03, 0.05), grow: 0.08, color: tones[1], alpha: 0.85, drag: 2.6, grav: 0.2, lit: 0.6 });
  }
  sparkle(fx, x, y, z, Math.round(8 * k), tones[3].map((c) => Math.min(1, c * 1.1)), 1.8, -0.4, 0.016, 0.7);
}

/** Dust drawing back together into a point (a bunny re-forming): motes rush inward and vanish. */
export function converge(fx, x, y, z, n, tones, r = 0.5, t = 0.35) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, e = R(-0.2, 1), h = Math.sqrt(1 - e * e), d = r * R(0.6, 1);
    const ox = Math.cos(a) * h * d, oy = e * d * 0.7, oz = Math.sin(a) * h * d;
    // a little spiral: some sideways speed as they fall in
    fx.spawn({ x: x + ox, y: y + oy, z: z + oz, vx: -ox / t - oz * 1.5, vy: -oy / t, vz: -oz / t + ox * 1.5, life: t * R(0.8, 1), size: R(0.018, 0.035), color: tones[i % 4], alpha: 0.9, drag: 0, lit: 0.5 });
  }
}

/** Quills shot out of a bursting puffer: little spines that fly, tumble and drop. */
export function quills(fx, x, y, z, n, color, tip, speed = 4.5) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R(-0.1, 0.1), e = R(-0.15, 0.7), h = Math.sqrt(1 - e * e), sp = speed * R(0.75, 1.15);
    const vx = Math.cos(a) * h * sp, vy = e * sp + 0.8, vz = Math.sin(a) * h * sp;
    // a spine is a short line of voxels: shaft, then a bright tip ahead of it
    for (let j = 0; j < 3; j++) {
      const o = j * 0.03;
      fx.spawn({ x: x + vx * o / sp, y: y + vy * o / sp, z: z + vz * o / sp, vx, vy, vz, life: R(0.6, 0.85), size: j === 2 ? 0.022 : 0.028, color: j === 2 ? tip : color, glow: j === 2, drag: 1.4, grav: 7, bounce: 0.25, fade: false });
    }
  }
}

/** A ribbon of light from a to b (a wisp blinking across): motes laid along the line, glowing, drifting. */
export function lightTrail(fx, ax, ay, az, bx, by, bz, color, n = 30) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), wob = Math.sin(t * 9) * 0.06;
    const k = 0.35 + t * 0.65; // brighter toward where it went
    fx.spawn({ x: ax + dx * t + R(-0.03, 0.03), y: ay + dy * t + wob, z: az + dz * t + R(-0.03, 0.03), vx: dx * 0.25 + R(-0.15, 0.15), vy: R(0, 0.3), vz: dz * 0.25 + R(-0.15, 0.15), life: R(0.45, 0.9) * (0.5 + t * 0.6), size: R(0.016, 0.03), grow: -0.02, color: color.map((c) => Math.min(1, c * k + (1 - k) * 0.2)), glow: true, drag: 2.2 });
  }
}

/** A cone of fire sparks spat along (dx, dy, dz) (an imp's belch). */
export function fireSpray(fx, x, y, z, dx, dy, dz, n, hot, ember, spread = 0.35, speed = 5) {
  for (let i = 0; i < n; i++) {
    const sx = dx + R(-spread, spread), sy = dy + R(-spread, spread) * 0.6 + 0.08, sz = dz + R(-spread, spread);
    const l = Math.hypot(sx, sy, sz) || 1, sp = speed * R(0.5, 1.1);
    fx.spawn({ x, y, z, vx: sx / l * sp, vy: sy / l * sp, vz: sz / l * sp, life: R(0.3, 0.55), size: R(0.02, 0.036), grow: -0.02, color: i % 3 ? hot : ember, glow: true, drag: 2.2, grav: 2.5, bounce: 0.4 });
  }
}

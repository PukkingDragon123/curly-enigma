// Fast hashing and 3D gradient noise for the underground generator.

/** Integer hash of a voxel coordinate → [0, 1). */
export function h3(x, y, z, s = 0) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Same hash, as a 32-bit unsigned int. */
export function h3i(x, y, z, s = 0) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const G = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);

/** 3D Perlin noise (range about -1..1) with fbm. */
export function makeNoise3D(seed = 1) {
  const p = new Uint8Array(512);
  let s = seed >>> 0 || 1;
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 15), 2246822507) + 1 >>> 0;
    const j = s % (i + 1);
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y, z) => { const g = (h % 12) * 3; return G[g] * x + G[g + 1] * y + G[g + 2] * z; };
  function n(x, y, z) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z;
    const xi = X & 255, yi = Y & 255, zi = Z & 255;
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[xi] + yi, AA = p[A] + zi, AB = p[A + 1] + zi, B = p[xi + 1] + yi, BA = p[B] + zi, BB = p[B + 1] + zi;
    const l1 = grad(p[AA], x, y, z) + u * (grad(p[BA], x - 1, y, z) - grad(p[AA], x, y, z));
    const l2 = grad(p[AB], x, y - 1, z) + u * (grad(p[BB], x - 1, y - 1, z) - grad(p[AB], x, y - 1, z));
    const l3 = grad(p[AA + 1], x, y, z - 1) + u * (grad(p[BA + 1], x - 1, y, z - 1) - grad(p[AA + 1], x, y, z - 1));
    const l4 = grad(p[AB + 1], x, y - 1, z - 1) + u * (grad(p[BB + 1], x - 1, y - 1, z - 1) - grad(p[AB + 1], x, y - 1, z - 1));
    const m1 = l1 + v * (l2 - l1), m2 = l3 + v * (l4 - l3);
    return m1 + w * (m2 - m1);
  }
  function fbm(x, y, z, oct = 3) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += n(x * f, y * f, z * f) * a; norm += a; a *= 0.5; f *= 2.03; }
    return sum / norm;
  }
  return { n, fbm };
}

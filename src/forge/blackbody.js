// Incandescence ("blackbody") colors for hot metal, in °C.
// Below ~450°C metal does not visibly glow; then dark red, cherry (~750), orange (~900),
// yellow (~1100) and near-white (1300+). Used by the billet, crucible, gauges and UI.
import * as THREE from 'three';

// [tempC, sRGB hex, intensity]
const KEYS = [
  [450, 0x1a0200, 0.0],
  [500, 0x2e0400, 0.12],
  [560, 0x4a0800, 0.24],
  [620, 0x740d00, 0.38],
  [690, 0xa01802, 0.52],
  [750, 0xc42606, 0.64],
  [820, 0xe23e0a, 0.76],
  [900, 0xff6212, 0.9],
  [1000, 0xff8624, 1.0],
  [1100, 0xffb03a, 1.1],
  [1200, 0xffd064, 1.2],
  [1300, 0xffe9a4, 1.3],
  [1450, 0xfff6d8, 1.4],
  [1700, 0xffffff, 1.52],
  [2100, 0xeef3ff, 1.65],
];

const _a = new THREE.Color();
const _b = new THREE.Color();

function seg(t) {
  if (t <= KEYS[0][0]) return null;
  for (let i = 1; i < KEYS.length; i++) {
    if (t <= KEYS[i][0]) {
      const k0 = KEYS[i - 1], k1 = KEYS[i];
      return { k0, k1, f: (t - k0[0]) / (k1[0] - k0[0]) };
    }
  }
  const last = KEYS[KEYS.length - 1];
  return { k0: last, k1: last, f: 0 };
}

/** How strongly metal glows at a temperature (0 below ~450°C, ~1 at 1000°C, up to 1.65). */
export function glowAmount(t) {
  const s = seg(t);
  if (!s) return 0;
  return s.k0[2] + (s.k1[2] - s.k0[2]) * s.f;
}

/** Glow color as sRGB hex (no intensity applied). */
export function glowHex(t) {
  const s = seg(t);
  if (!s) return 0x000000;
  const a = s.k0[1], b = s.k1[1], f = s.f;
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * f;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * f;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * f;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** Set `out` (THREE.Color, linear) to the glow color times its intensity. */
export function glowColor(t, out = new THREE.Color(), gain = 1) {
  const k = glowAmount(t) * gain;
  if (k <= 0) return out.setRGB(0, 0, 0);
  return out.setHex(glowHex(t)).multiplyScalar(k);
}

/**
 * Apply hot-metal looks to a material with .color and .emissive:
 * base metal color fades toward a dark scale as the glow takes over.
 */
export function applyHeat(mat, baseHex, t, gain = 1.25) {
  const k = Math.min(1, glowAmount(t));
  _a.setHex(baseHex);
  _b.setHex(0x2a1c18);
  mat.color.copy(_a).lerp(_b, k * 0.7);
  glowColor(t, mat.emissive, gain);
}

export function glowCss(t, alpha = 1) {
  const h = glowHex(t);
  return `rgba(${(h >> 16) & 255},${(h >> 8) & 255},${h & 255},${alpha})`;
}

/** CSS gradient (bottom → top) for a vertical thermometer scale from 0 to maxT. */
export function gaugeGradient(maxT, cold = '#3a3436') {
  const stops = [`${cold} 0%`];
  for (const [t] of KEYS) {
    if (t > maxT) break;
    const p = (t / maxT) * 100;
    stops.push(`${t <= 450 ? cold : glowCss(t)} ${p.toFixed(1)}%`);
  }
  stops.push(`${glowCss(maxT)} 100%`);
  return `linear-gradient(to top, ${stops.join(', ')})`;
}

/** A short word describing the color of hot metal, used in readouts. */
export function heatWord(t) {
  if (t < 450) return t < 120 ? 'cold' : 'warm';
  if (t < 640) return 'dark red';
  if (t < 720) return 'blood red';
  if (t < 820) return 'cherry';
  if (t < 960) return 'orange';
  if (t < 1150) return 'yellow';
  if (t < 1320) return 'bright yellow';
  return 'white hot';
}

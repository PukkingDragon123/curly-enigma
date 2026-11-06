// Forged weapon icons (32×32, handle bottom-left, tip top-right). Laid out in 45° stripe
// coordinates (A along the diagonal, d across it: see gearKit.diagMask) so every blade, grip
// and haft is a clean hand-pixel staircase: lit bevel line on the top-left edge, two-plane
// blade split by a fuller, leather-wrapped grips, pommels and guards with their own planes,
// heads designed as local polygons with planes and hammer marks, then an ink outline.
import { M, mat, mix, hash2, solid, seam, bevel, stick, wrapStick, dents, rivet, line, glint, diagMask, diagAt, RAMPS } from './gearKit.js';
import { toHsl } from './color.js';
import { glowHalo } from './shade.js';
import { ink } from './gearKit.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SQ = Math.SQRT2;
const Ad = (x, y) => [(x - y) / 2, x + y - 31];

/** Local frame on the weapon's diagonal: origin at stripe point (A0, d0); u px toward the tip, w px toward the bottom-right. */
function frame(A0, d0) {
  return {
    at: (u, w) => diagAt(A0 + u / SQ, d0 + w * SQ),
    uw: (x, y) => { const [A, d] = Ad(x, y); return [(A - A0) * SQ, (d - d0) / SQ]; },
    poly(pts) { return M().poly(pts.map(([u, w]) => this.at(u, w))); },
  };
}

/** Paint a stripe-space mask with tone(A, d, x, y) → ramp index. */
function stripes(pc, mask, R, tone) {
  mask.each((x, y) => { const [A, d] = Ad(x, y); const k = tone(A, d, x, y); if (k !== null) pc.set(x, y, R[clamp(k, 0, 6)]); });
}
const isTop = (m, x, y) => !m.get(x - 1, y) || !m.get(x, y - 1);
const isBot = (m, x, y) => !m.get(x + 1, y) || !m.get(x, y + 1);

/** Grip: a 45° leather (or wire) wrapped bar between A0..A1 over stripes dl..dr, with spiral creases. */
function grip(pc, A0, A1, dl, dr, R, o = {}) {
  const m = diagMask((A, d) => A >= A0 && A <= A1 && d >= dl && d <= dr);
  seam(pc, m, 'shadow');
  const per = o.period || 3;
  stripes(pc, m, R, (A, d, x, y) => {
    let k = d === dl ? 2 : d === dr ? 4 : 3;
    const ph = (((y + (o.phase || 0)) % per) + per) % per;
    if (ph === 0) k += 2; else if (ph === 1) k -= 1;
    return clamp(k, 1, 5);
  });
  return m;
}

/** A bar along d (crossguard) centred on A = ac(d) from d0 to d1, thickness th (A units), with optional end knobs. */
function crossbar(pc, ac, d0, d1, th, R, o = {}) {
  const m = diagMask((A, d) => d >= d0 && d <= d1 && Math.abs(A - ac(d)) <= th / 2 + 0.01);
  if (o.knobs) for (const [d, r] of o.knobs) { const [x, y] = diagAt(ac(d), d); m.disk(x, y, r); }
  seam(pc, m, 'shadow');
  const mid = (d0 + d1) / 2, half = Math.max(1, (d1 - d0) / 2);
  m.each((x, y) => {
    const [A, d] = Ad(x, y);
    const q = A - ac(clamp(d, d0, d1));
    let k = q > 0.05 ? 2 : 3;
    const e = (d - mid) / half;
    if (e < -0.5) k -= 1; else if (e > 0.45) k += 1;
    if (isBot(m, x, y) && !isTop(m, x, y)) k = Math.max(k, 4);
    if (isTop(m, x, y) && e < 0.2 && !isBot(m, x, y)) k = 1;
    pc.set(x, y, R[clamp(k, 1, 5)]);
  });
  return m;
}

/** Round knob (pommel) at stripe point (A, d), radius r: lit dome with a hot spot and a dark under-rim. */
function knob(pc, A, d, r, R) {
  const [cx, cy] = diagAt(A, d);
  const m = M().disk(cx, cy, r);
  seam(pc, m, 'shadow');
  m.each((x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const t = (dx * -0.6 + dy * -0.8) / r;
    let k = t > 0.5 ? 1 : t > 0 ? 2 : t > -0.5 ? 3 : 4;
    if (Math.hypot(dx, dy) > r - 0.7 && t < -0.3) k = 5;
    pc.set(x, y, R[k]);
  });
  const hx = cx - r * 0.45, hy = cy - r * 0.45;
  if (m.get(hx, hy)) pc.set(hx, hy, R[0]);
  return m;
}

/**
 * Straight blade from A0 to its tip at A1 with half widths l(A) / r(A) in stripes. Lit bevel
 * line on the top-left edge (white near the tip), lit upper plane, dark fuller line, shaded
 * lower plane. o: fuller [A0, A1], ridge (stripe of the plane split), ridgeK, lowRim.
 */
function blade(pc, A0, A1, l, r, R, o = {}) {
  const m = diagMask((A, d) => A >= A0 && A <= A1 && d >= -l(A) - 0.01 && d <= r(A) + 0.01);
  seam(pc, m, 'shadow');
  const ridge = o.ridge ?? 0, fuller = o.fuller;
  stripes(pc, m, R, (A, d, x, y) => {
    const top = isTop(m, x, y), bot = isBot(m, x, y);
    if (top) return A > A1 - 2.4 || (o.shine && hash2(x, y, 3) < 0.2) ? 0 : 1;
    let k = d <= ridge ? 2 : 4;
    if (fuller && A >= fuller[0] && A <= fuller[1] && d === ridge) k = 5;
    if (bot && o.lowRim && A > o.lowRim) k = 3;
    return k;
  });
  return m;
}

/** Fittings: brass for cool metals, blackened iron for warm ones (so a gold blade still reads). */
function fittingsFor(metalColor) {
  const [h, s] = toHsl(metalColor);
  return s > 0.3 && h > 18 && h < 60 ? mat(0x5c5f70, { cont: 1.25 }) : RAMPS.brass();
}

/**
 * Diagonal forged weapon (handle bottom-left, tip top-right) on a 32×32 canvas.
 * metalColor tints the metal parts, infusionColor (optional) adds glowing runes + halo.
 */
export function drawWeaponArt(pc, type, metalColor, infusionColor) {
  const R = mat(metalColor, { cont: 1.28, hs: 1.1 });
  const F = fittingsFor(metalColor);
  const LE = mat(0x6a3a22, { cont: 1.1 });
  const DL = mat(0x4a2c22, { cont: 1.15 });
  const WD = RAMPS.wood();
  let head = null;      // metal the runes / glow go on
  let runeLine = null;  // [A0, A1, d]
  let glints = [];
  switch (type) {
    case 'dagger': {
      knob(pc, -10.2, 0, 1.6, F);
      grip(pc, -9.2, -5.4, -1, 1, DL, { period: 3 });
      head = blade(pc, -4.2, 9.2, (A) => (A < 5.2 ? 2 : 2 - (A - 5.2) * 0.5), (A) => (A < 2.5 ? 2 : 2 - (A - 2.5) * 0.3), R, { fuller: [-3.6, 3.4] });
      crossbar(pc, (d) => -4.8 + 0.025 * d * d, -4, 4, 1, F, { knobs: [[-4, 0.9], [4, 0.9]] });
      runeLine = [-2.6, 3.4, 0];
      glints = [diagAt(6.6, -1.6)];
      break;
    }
    case 'shortsword': {
      knob(pc, -11.6, 0, 1.9, F);
      grip(pc, -10.6, -6.6, -1, 1, LE);
      head = blade(pc, -5.4, 12.8, (A) => (A < 9.8 ? 2 : 2 - (A - 9.8) * 0.66), (A) => (A < 9.8 ? 2 : 2 - (A - 9.8) * 0.66), R, { fuller: [-4.8, 6.5] });
      crossbar(pc, (d) => -6 + 0.03 * d * d, -5, 5, 1, F, { knobs: [[-5, 1.05], [5, 1.05]] });
      runeLine = [-3.6, 8, 0];
      glints = [diagAt(10, -1.6)];
      break;
    }
    case 'longsword': {
      knob(pc, -12.5, 0, 2.2, F);
      grip(pc, -11.1, -6.4, -1, 1, LE, { period: 3 });
      head = blade(pc, -4.8, 13.6, (A) => (A < 10.8 ? 2 : 2 - (A - 10.8) * 0.7), (A) => (A < 10.8 ? 2 : 2 - (A - 10.8) * 0.7), R, { fuller: [-4.2, 8.6] });
      crossbar(pc, () => -5.5, -6, 6, 1, F, { knobs: [[-6, 1.2], [6, 1.2]] });
      runeLine = [-3, 8.5, 0];
      glints = [diagAt(11.2, -1.6)];
      break;
    }
    case 'greatsword': {
      knob(pc, -12.7, 0, 2.3, F);
      grip(pc, -11.5, -7.3, -1, 1, LE, { period: 3 });
      head = blade(pc, -6, 13.6, (A) => (A < -4.2 ? 2 : A < 10 ? 3 : 3 - (A - 10) * 0.83), (A) => (A < -4.2 ? 2 : A < 10 ? 3 : 3 - (A - 10) * 0.83), R, { fuller: [-3.6, 7.6], lowRim: 4 });
      crossbar(pc, (d) => -6.6 + 0.02 * d * d, -7, 7, 1.2, F, { knobs: [[-7, 1.3], [7, 1.3]] });
      // parrying lugs at the top of the ricasso
      for (const s of [-1, 1]) { const [x, y] = diagAt(-4, s * 3.4); const m = M().disk(x, y, 0.9); seam(pc, m, 'shadow'); m.each((X, Y) => pc.set(X, Y, R[s < 0 ? 2 : 4])); }
      runeLine = [-2.8, 7.6, 0];
      glints = [diagAt(10.6, -2.6)];
      break;
    }
    case 'rapier': {
      knob(pc, -11.8, 0, 1.7, F);
      grip(pc, -10.8, -6.8, -1, 1, F, { period: 2 });
      // knuckle bow: one clean swept bar from the quillon round to the pommel
      const bow = M();
      for (let i = 0; i <= 80; i++) {
        const s = i / 80;
        const A = -6.2 + (-10.9 + 6.2) * s, d = 3.2 + Math.sin(s * Math.PI) * 2.6 - s * 1.8;
        const [x, y] = diagAt(A, d); bow.set(Math.floor(x), Math.floor(y));
      }
      seam(pc, bow, 'shadow');
      bow.each((x, y) => { const [A] = Ad(x, y); pc.set(x, y, F[A > -8 ? 2 : 3]); });
      head = blade(pc, -5.4, 13.6, (A) => (A < 9 ? 1 : 1 - (A - 9) * 0.2), (A) => (A < 1 ? 1 : 0.4), R, { ridge: 0 });
      crossbar(pc, (d) => -6.2 + 0.05 * d * d, -4.4, 3.4, 0.8, F, { knobs: [[-4.4, 1]] });
      // a small shell plate where the blade leaves the hilt
      const [sx, sy] = diagAt(-5.4, -1.6);
      const shell = M().disk(sx, sy, 1.5);
      seam(pc, shell, 'shadow');
      shell.each((x, y) => pc.set(x, y, F[(x + 0.5 - sx) + (y + 0.5 - sy) < 0 ? 1 : 3]));
      runeLine = [-3, 9, 0];
      glints = [diagAt(4, -1)];
      break;
    }
    case 'spear': {
      const [x0, y0] = diagAt(-13.2, 0), [x1, y1] = diagAt(6, 0);
      stick(pc, x0, y0, x1, y1, 1.0, WD, { tones: [2, 3, 3, 4], grain: true, seed: 9, knots: [0.62] });
      wrapStick(pc, x0, y0, x1, y1, 1.0, 9, 14.5, LE, { period: 2.2, slant: 0.9, grow: 0.42 });
      const fer = diagMask((A, d) => A >= -13.4 && A <= -11.8 && Math.abs(d) <= 1);
      seam(pc, fer, 'shadow');
      stripes(pc, fer, F, (A, d) => (d < 0 ? 2 : d === 0 ? 3 : 4));
      // socket: a cone with two forged rings
      const sock = diagMask((A, d) => A >= 3.4 && A <= 7 && Math.abs(d) <= (A < 5.2 ? 1 : 1 + (A - 5.2) * 0.6));
      seam(pc, sock, 'shadow');
      stripes(pc, sock, R, (A, d, x, y) => { let k = d < 0 ? 2 : d === 0 ? 3 : 4; if (Math.abs(A - 4.2) < 0.3 || Math.abs(A - 5.6) < 0.3) k += 1; if (isTop(sock, x, y)) k = 1; return k; });
      // leaf blade: widest a third of the way up, with a raised midrib
      const leaf = (A) => (A < 7 ? 1 : A < 9.4 ? 1 + (A - 7) * 1.05 : 3.5 - (A - 9.4) * 0.84);
      head = blade(pc, 6.6, 13.6, leaf, leaf, R, { ridge: 0 });
      head.each((x, y) => { const [A, d] = Ad(x, y); if (d === 0 && A > 7.2 && A < 12.6) pc.set(x, y, R[1]); if (d === 1 && A > 7.6 && A < 12) pc.set(x, y, R[5]); });
      const [rx, ry] = diagAt(5.2, -0.5); pc.set(rx, ry, F[1]);
      runeLine = [8.4, 11.8, -1];
      glints = [diagAt(10.4, -2.2)];
      break;
    }
    case 'axe': {
      const dh = -4.5, A0 = 7;
      const [x0, y0] = diagAt(-12.8, dh), [x1, y1] = diagAt(A0 + 3.3, dh);
      stick(pc, x0, y0, x1, y1, 1.15, WD, { tones: [2, 2, 3, 4, 4, 5], grain: true, seed: 2, knots: [0.4] });
      wrapStick(pc, x0, y0, x1, y1, 1.15, 0.3, 8, DL, { period: 2.3, slant: 0.8, grow: 0.4 });
      // bearded head in a local frame on the haft: u along (toward the tip), w across (toward the edge)
      const L = frame(A0, dh);
      const body = L.poly([[3.4, -2.6], [3.4, 2.2], [2.2, 4.4], [3.2, 6.6], [4.5, 8.4], [3.6, 9.6], [1.4, 10.4], [-1.4, 10.7], [-4.2, 10.3], [-6.6, 9.3], [-8.4, 7.8], [-7.4, 7.1], [-5.8, 6.1], [-4, 4.6], [-3, 3], [-3, -2.6]]);
      seam(pc, body, 'shadow');
      // planes: socket block (raised) with a short poll behind, cheek, polished edge bevel
      body.each((x, y) => {
        const [u, w] = L.uw(x, y);
        let k;
        if (w < 2.4) k = isTop(body, x, y) ? 1 : u > 1.8 ? 2 : u < -1.8 ? 4 : 3;
        else k = isTop(body, x, y) ? 2 : 3;
        if (isBot(body, x, y)) k = Math.max(k, 4);
        pc.set(x, y, R[k]);
      });
      const inner = body.clone().erode(2), inner2 = inner.clone().erode(1);
      body.each((x, y) => {
        const [, w] = L.uw(x, y);
        if (w < 7) return;
        if (!inner.get(x, y)) pc.set(x, y, R[isBot(body, x, y) ? 2 : 1]);
        else if (!inner2.get(x, y)) pc.set(x, y, R[4]);
      });
      // shoulder seam between the socket block and the cheek
      body.each((x, y) => { const [u, w] = L.uw(x, y); if (w > 2.3 && w < 3.2 && u > -2.8 && u < 2.6 && !isTop(body, x, y)) pc.set(x, y, R[5]); });
      dents(pc, body, R, { dens: 0.12, seed: 11, only: (x, y) => { const w = L.uw(x, y)[1]; return w > 3.6 && w < 6.4; } });
      const [wx, wy] = L.at(3.9, 0); pc.set(wx, wy, WD[1]);
      const [r1x, r1y] = L.at(-0.4, -0.6); rivet(pc, r1x, r1y, F, true);
      head = body;
      glints = [L.at(2.8, 9.2)];
      break;
    }
    case 'mace': {
      const [x0, y0] = diagAt(-13, 0), [x1, y1] = diagAt(6.5, 0);
      stick(pc, x0, y0, x1, y1, 1.0, mat(0x5c5f6c, { cont: 1.2 }), { tones: [1, 2, 3, 4, 5] });
      wrapStick(pc, x0, y0, x1, y1, 1.0, 0.8, 9.6, LE, { period: 2.2, slant: 0.8, grow: 0.45 });
      knob(pc, -13.1, 0, 1.6, F);
      const col = diagMask((A, d) => A >= 4.2 && A <= 5.4 && Math.abs(d) <= 2);
      seam(pc, col, 'shadow');
      stripes(pc, col, F, (A, d) => (d < -1 ? 1 : d < 1 ? 2 : 4));
      // morning star: a forged ball with conical spikes (back ones first, then the ball, then front studs)
      const [hx, hy] = diagAt(9.4, 0);
      const rB = 4.1;
      const spikes = [];
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI * 0.62 + i * (Math.PI * 2 / 8) + (i % 2 ? 0.08 : -0.05);
        const len = i % 2 ? 7.2 : 6.6;
        spikes.push({ a, len });
      }
      const ball = M().disk(hx, hy, rB);
      const sp = M();
      for (const s of spikes) {
        const ca = Math.cos(s.a), sa = Math.sin(s.a);
        const tip = [hx + ca * s.len, hy + sa * s.len];
        const b1 = [hx + ca * (rB - 0.6) - sa * 1.6, hy + sa * (rB - 0.6) + ca * 1.6];
        const b2 = [hx + ca * (rB - 0.6) + sa * 1.6, hy + sa * (rB - 0.6) - ca * 1.6];
        const m = M().poly([b1, tip, b2]);
        s.m = m; sp.union(m);
      }
      seam(pc, sp.clone().union(ball), 'shadow');
      for (const s of spikes) {
        const ca = Math.cos(s.a), sa = Math.sin(s.a);
        const lit = ca * -0.6 + sa * -0.8;
        s.m.each((x, y) => {
          const dx = x + 0.5 - hx, dy = y + 0.5 - hy;
          const side = dx * -sa + dy * ca; // left / right face of the cone
          let k = side < -0.3 ? 2 : side > 0.3 ? 4 : 3;
          k += lit > 0.4 ? -1 : lit < -0.4 ? 1 : 0;
          pc.set(x, y, R[clamp(k, 1, 5)]);
        });
      }
      // the ball: banded dome, darker toward the bottom-right, a rim of reflected light
      ball.each((x, y) => {
        const dx = x + 0.5 - hx, dy = y + 0.5 - hy;
        const t = (dx * -0.6 + dy * -0.8) / rB, rr = Math.hypot(dx, dy);
        let k = t > 0.5 ? 1 : t > 0.1 ? 2 : t > -0.35 ? 3 : 4;
        if (rr > rB - 0.8 && t < -0.5) k = 3;
        pc.set(x, y, R[k]);
      });
      // studs facing the viewer
      for (const [ox, oy] of [[-1.4, 0.6], [1.2, -1.2], [1, 1.6]]) { const X = Math.floor(hx + ox), Y = Math.floor(hy + oy); pc.set(X, Y, R[1]); pc.set(X + 1, Y + 1, R[5]); pc.set(X + 1, Y, R[3]); }
      dents(pc, ball, R, { dens: 0.12, seed: 4 });
      head = sp.clone().union(ball);
      glints = [[Math.floor(hx - 2), Math.floor(hy - 2)]];
      break;
    }
    case 'warhammer': {
      const [x0, y0] = diagAt(-13.2, 0), [x1, y1] = diagAt(9.6, 0);
      stick(pc, x0, y0, x1, y1, 1.0, RAMPS.darkWood(), { tones: [2, 3, 3, 4], grain: true, seed: 6 });
      wrapStick(pc, x0, y0, x1, y1, 1.0, 0.6, 9, LE, { period: 2.2, slant: 0.8, grow: 0.45 });
      knob(pc, -13.3, 0, 1.5, F);
      // langets: steel strips riveted down the haft below the head
      const lang = diagMask((A, d) => A >= 2.6 && A <= 7.6 && (d === -1 || d === 1));
      seam(pc, lang, 'shadow');
      stripes(pc, lang, R, (A, d) => (d < 0 ? 2 : 4));
      for (const A of [3.6, 6]) { const [x, y] = diagAt(A, -1); pc.set(x, y, R[0]); }
      // head (local frame at the top of the haft): hammer block toward the top-left, curved
      // spike toward the bottom-right, short top spike
      const L = frame(9.6, 0);
      const block = L.poly([[2.4, -1.4], [2.4, -5.6], [3, -6.2], [3, -8.2], [-3, -8.2], [-3, -6.2], [-2.4, -5.6], [-2.4, -1.4]]);
      const spk = M();
      for (let i = 0; i <= 30; i++) { const s = i / 30; const w = 1.4 + s * 7.4; const u = -0.4 - s * s * 3.2; const h = 2.2 * (1 - s) + 0.3; const [x, y] = L.at(u, w); spk.disk(x, y, h); }
      const sock = L.poly([[2.6, -1.6], [2.6, 1.6], [-2.6, 1.6], [-2.6, -1.6]]);
      const top = L.poly([[2.4, -1.2], [5.6, 0], [2.4, 1.2]]);
      const all = block.clone().union(spk).union(sock).union(top);
      seam(pc, all, 'shadow');
      all.each((x, y) => {
        const [u, w] = L.uw(x, y);
        let k;
        if (w < -5.8) k = u > 0.6 ? 1 : u > -1.2 ? 2 : 3;          // flared striking face, lit
        else if (w < -1.5) k = u > 1.4 ? 2 : u < -1.6 ? 4 : 3;      // block
        else if (w <= 1.7 && Math.abs(u) <= 2.7) k = u > 1.6 ? 2 : u < -1.8 ? 4 : 3; // socket
        else if (u > 2.3 && Math.abs(w) < 1.4) k = w < 0 ? 2 : 4;   // top spike
        else { const c = -0.4 - ((w - 1.4) / 7.4) ** 2 * 3.2; k = u > c + 0.4 ? 2 : u < c - 0.5 ? 4 : 3; } // spike
        if (isTop(all, x, y) && k > 1) k--;
        if (isBot(all, x, y) && k < 4) k++;
        pc.set(x, y, R[k]);
      });
      // shoulder line between face and block, socket seams
      all.each((x, y) => { const [u, w] = L.uw(x, y); if ((w > -6.2 && w < -5.4 && Math.abs(u) < 2.4) || (Math.abs(w - 1.75) < 0.45 && Math.abs(u) < 2.2)) pc.set(x, y, R[5]); });
      dents(pc, block, R, { dens: 0.16, seed: 8 });
      const [rx, ry] = L.at(0, 0); rivet(pc, rx - 0.5, ry - 0.5, F, true);
      head = all;
      glints = [L.at(1.4, -7.4)];
      break;
    }
    case 'moleblade': {
      knob(pc, -12.4, 0, 2.1, F);
      grip(pc, -11.2, -6.8, -1, 1, LE, { period: 3 });
      // spade blade: narrow neck, broad rounded spade with a pointed tip, raised midrib
      const wd = (A) => (A < -2.4 ? 1.2 : A < 1.6 ? 1.2 + (A + 2.4) * 0.95 : A < 9.4 ? 5 + Math.sin((A - 1.6) / 7.8 * Math.PI) * 0.6 : 5 - (A - 9.4) * 1.2);
      head = blade(pc, -5.6, 13.4, wd, wd, R, { ridge: 0 });
      // rolled rim around the spade (a darker border with lit top-left lip)
      const inner = head.clone().erode(1);
      head.each((x, y) => { const [A] = Ad(x, y); if (A > 0.6 && !inner.get(x, y) && !isTop(head, x, y) && !isBot(head, x, y)) pc.set(x, y, R[4]); });
      head.each((x, y) => {
        const [A, d] = Ad(x, y);
        if (A < -1.6 || A > 11.6) return;
        if (d === -1) pc.set(x, y, R[1]); else if (d === 0) pc.set(x, y, R[2]); else if (d === 1) pc.set(x, y, R[5]);
      });
      dents(pc, head, R, { dens: 0.08, seed: 21, only: (x, y) => Math.abs(Ad(x, y)[1]) > 2 });
      // mole-paw guard: crossbar with three little claws on each end
      crossbar(pc, (d) => -6.3 + 0.03 * d * d, -5.4, 5.4, 1.1, F, { knobs: [[-5.4, 1.3], [5.4, 1.3]] });
      const CL = mat(0xece0c4, { cont: 1.05 });
      for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) {
        const [x, y] = diagAt(-4.9 + Math.abs(i) * -0.2, s * 5.4 + i * 1.2);
        pc.set(x, y, CL[i < 0 ? 1 : 2]);
      }
      const [gx, gy] = diagAt(2.2, 0);
      const gm = M().disk(gx, gy, 1.8);
      seam(pc, gm, F[4]);
      const GR = mat(0x2ad96a, { cont: 1.2 });
      gm.each((x, y) => { const t = (x + 0.5 - gx) + (y + 0.5 - gy); pc.set(x, y, GR[t < -0.8 ? 1 : t < 0.8 ? 3 : 4]); });
      pc.set(gx - 1, gy - 1, 0xeafff0);
      runeLine = [4.8, 10.4, 0];
      glints = [diagAt(8.4, -4.4)];
      break;
    }
    default: {
      grip(pc, -10, -6.5, -1, 1, LE);
      head = blade(pc, -5.2, 12, () => 2, () => 2, R, {});
      crossbar(pc, () => -5.8, -5, 5, 1, F);
    }
  }
  ink(pc);
  for (const [x, y] of glints) if (pc.alpha(x, y) > 200) glint(pc, Math.floor(x), Math.floor(y), 1, R[0]);
  if (infusionColor && head) infuse(pc, head, R, infusionColor, runeLine);
}

/** Glowing runes down the blade, an emissive cutting edge and a halo. */
function infuse(pc, head, R, color, runeLine) {
  const IR = mat(color, { cont: 1 });
  const hot = mix(color, 0xffffff, 0.6);
  const GLYPHS = [[[0, 0], [1, -1], [1, 1]], [[0, 0], [1, 0], [0, 1]], [[0, -1], [0, 0], [1, 1]], [[-1, 0], [0, 0], [1, -1]]];
  const inner = head.clone().erode(1);
  if (runeLine) {
    const [A0, A1, d0] = runeLine;
    let g = 0;
    for (let A = A0; A <= A1; A += 2.5) {
      const [cx, cy] = diagAt(A, d0);
      const X = Math.floor(cx), Y = Math.floor(cy);
      for (const [dx, dy] of GLYPHS[g++ % GLYPHS.length]) {
        if (!inner.get(X + dx, Y + dy)) continue;
        pc.set(X + dx, Y + dy, dx === 0 && dy === 0 ? hot : IR[1]); pc.emit(X + dx, Y + dy, 1);
      }
    }
  } else {
    inner.each((x, y) => { if (hash2(x, y, 5) < 0.09) { pc.set(x, y, IR[1]); pc.emit(x, y, 1); } });
  }
  head.each((x, y) => {
    if (isBot(head, x, y)) { pc.set(x, y, (x + y) % 3 ? IR[2] : hot); pc.emit(x, y, 0.85); }
    else if (isTop(head, x, y)) { pc.set(x, y, mix(pc.getHex(x, y), IR[1], 0.5)); pc.emit(x, y, 0.6); }
  });
  glowHalo(pc, mix(color, 0xffffff, 0.15), 120, 2);
}

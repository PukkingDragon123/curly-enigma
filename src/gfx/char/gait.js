// Procedural locomotion for the character rigs (rig.js and its subclasses): a walk and a run whose
// feet plant and roll heel to toe instead of sliding. The rig measures how fast its root really
// moves through the world (so any caller that moves the root gets matched strides, whatever
// speed it passes to play()), picks a cadence and stride for that speed and the leg length, and
// drives each leg through stance (the foot fixed on the ground, the leg stretching a little or
// sliding up into the trousers to keep it there) and swing (lifted and carried forward).
// Over that: the body drops after each contact and rises after passing (contact / down / passing /
// up), shifts its weight over the standing foot, rolls and twists against the arms, leans with
// speed, into turns and up slopes, and the head keeps its gaze level. Blends idle → walk → run by
// weight, so starting, stopping and speeding up never pop. No allocations per frame.
//
// Rig fields it reads/writes: rig.gait (state), rig.gaitStyle (per-character tweaks, below),
// rig.gaitW (0..1 how much it is walking), rig.gaitPhase (0..1, 0 = left foot contact),
// rig.gaitPeriod (s per cycle), rig.stepN / rig.stepFoot (0 left, 1 right) and rig.onStep(foot)
// on every footfall, rig.groundSpeed (measured, world units/s).
//
// gaitStyle: { stride, lift, bob, sway, lean, arm, twist, toeOut, armRun } (1 = default).

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
/** gravity in leg lengths / s² for a mole-sized body (bank angle into turns) */
const G_LS = 60;

const DEFAULT_STYLE = Object.freeze({ stride: 1, lift: 1, bob: 1, sway: 1, lean: 1, arm: 1, twist: 1, toeOut: 0.08, armRun: 1 });

export function initGait(rig) {
  const s = rig.s, p = rig.p;
  const jointed = !!rig.kneeL;
  const Ls = (p.lh + 1) * s; // leg pivot → sole, standing straight
  const thigh = jointed ? Math.abs(rig.kneeL.position.y) : 0;
  rig.gait = {
    jointed, Ls, thigh, shin: jointed ? (rig.shinLen || Ls - thigh) : 0,
    legY0: rig.legL.position.y, legX0: Math.abs(rig.legL.position.x), hip0: p.lh * s + s * 0.5,
    heel: -1.0 * s, toe: 2.5 * s, mid: 0.75 * s, // the sole's back, front and middle (leg frame)
    phase: Math.random(), period: 0.7, v: 0, acc: 0, slope: 0, turn: 0, w: 0, runW: 0, strideK: 0,
    lx: 0, ly: 0, lz: 0, has: false, lastFacing: rig.facing || 0,
    legs: [{ sc: 1, dy: 0, z: 0, fy: 0, stance: true, b: 0, u: 0 }, { sc: 1, dy: 0, z: 0, fy: 0, stance: false, b: 0, u: 0 }],
    dY: 0, bounce: 0, swayLag: 0,
  };
  rig.gaitW = 0; rig.gaitPhase = rig.gait.phase; rig.gaitPeriod = 0.7;
  rig.stepN = 0; rig.stepFoot = 0; rig.onStep = null; rig.groundSpeed = 0;
  // the whole frame is classic: the legs hang from the root, so they need resetting each frame
  rig.legL.userData.y0 = rig.legL.position.y; rig.legR.userData.y0 = rig.legR.position.y;
}

/** How fast the root moves through the world (rig units), smoothed; cuts are ignored. */
export function measureGait(rig, dt) {
  const g = rig.gait;
  const root = rig.root;
  root.updateWorldMatrix(true, false);
  const e = root.matrixWorld.elements;
  const sc = Math.hypot(e[0], e[1], e[2]) || 1;
  const x = e[12], y = e[13], z = e[14];
  if (g.has && dt > 1e-4) {
    const dx = (x - g.lx) / sc, dy = (y - g.ly) / sc, dz = (z - g.lz) / sc;
    const vh = Math.hypot(dx, dz) / dt;
    if (vh < g.Ls * 80) { // faster than that is a cut, not a stride
      const k = 1 - Math.exp(-dt * 14);
      const v0 = g.v;
      g.v += (vh - g.v) * k;
      g.acc += ((g.v - v0) / dt - g.acc) * (1 - Math.exp(-dt * 6));
      const sl = vh > g.Ls * 1.2 ? clamp(dy / dt / vh, -0.9, 0.9) : 0;
      g.slope += (sl - g.slope) * (1 - Math.exp(-dt * 4));
    }
    rig.groundSpeed = g.v * sc;
  }
  g.lx = x; g.ly = y; g.lz = z; g.has = true;
  // how fast he is turning (rad/s), smoothed
  let df = rig.facing - g.lastFacing;
  while (df > Math.PI) df -= TAU;
  while (df < -Math.PI) df += TAU;
  g.lastFacing = rig.facing;
  if (dt > 1e-4) g.turn += (clamp(df / dt, -8, 8) - g.turn) * (1 - Math.exp(-dt * 8));
}

/**
 * Pose the legs, hips, arms and head for walking/running over whatever the state's own pose set
 * (weighted by rig.gaitW). Call after the state switch, before expressions and overlays.
 */
export function applyGait(rig, dt) {
  const g = rig.gait;
  const st = rig.state;
  const s = rig.s, Ls = g.Ls;
  const sty = rig.gaitStyle || DEFAULT_STYLE;
  const { hip, neck, armL, armR, legL, legR } = rig;
  const carry = st === 'carry';
  const want = st === 'walk' || st === 'run' ? 1 : carry && g.v > Ls * 0.8 ? 1 : 0;
  const kw = 1 - Math.exp(-dt * (want ? 9 : 7));
  g.w += (want - g.w) * kw;
  g.runW += ((st === 'run' ? 1 : 0) - g.runW) * (1 - Math.exp(-dt * 5));
  if (g.w < 0.002) g.w = 0;
  rig.gaitW = g.w;
  const w = g.w;
  if (!g.jointed && w === 0) {
    legL.position.y = legL.userData.y0; legR.position.y = legR.userData.y0;
    legL.scale.y = 1; legR.scale.y = 1;
    legL.position.x = -g.legX0; legR.position.x = g.legX0;
    g.dY = 0; g.bounce = 0; g.swayLag = 0;
    return;
  }
  if (w === 0) { g.dY = 0; g.bounce = 0; g.swayLag = 0; return; }
  const r = g.runW;

  // ---- cadence and stride for the measured speed (leg lengths)
  let v = g.v;
  if (want && v < Ls * 0.6) v = Ls * (st === 'run' ? 14 : 5) * clamp(rig.speed, 0.4, 2); // walking on the spot: a nominal speed
  const vn = v / Ls;
  const slope = clamp(g.slope, -0.7, 0.7);
  const duty = lerp(0.53, 0.32, r); // fraction of the cycle each foot is on the ground
  // the farthest the foot reaches ahead / behind the hip (leg lengths), stretching a little
  // (knees can't stretch: grown-up legs reach less and bend instead)
  const J = g.jointed;
  const reachF = Math.sin(J ? lerp(0.55, 0.75, r) : 1.1), reachB = Math.sin(J ? lerp(0.3, 0.6, r) : lerp(0.6, 0.8, r));
  const scMax = J ? 1 : lerp(1.15, 1.22, r);
  const travelMax = scMax * (reachF + reachB) * sty.stride * (1 - Math.abs(slope) * 0.3);
  const sMax = travelMax / duty; // stride (one full cycle) at most
  const cMin = lerp(1.3, 2.3, r);
  const cad = Math.sqrt(Math.sqrt(cMin ** 4 + (vn / sMax) ** 4)); // cycles per second
  const stride = vn / cad; // leg lengths per cycle
  const travel = Math.min(travelMax, stride * duty) * Ls; // how far a planted foot slides back past the hip
  const fr = reachF / (reachF + reachB);
  const zF = travel * fr, zB = travel * (1 - fr);
  const strideK = clamp(stride / sMax, 0.25, 1);
  g.strideK = strideK;

  // ---- phase, and a footfall event at each contact
  const ph0 = g.phase;
  g.phase += dt * cad;
  if (g.phase >= 1) g.phase -= 1;
  const ph = g.phase;
  if (dt > 0 && w > 0.5) {
    const c0 = ph < ph0; // wrapped past 0: left contact
    const c1 = ph0 < 0.5 && ph >= 0.5;
    if (c0 || c1) {
      rig.stepN++;
      rig.stepFoot = c0 ? 0 : 1;
      if (rig.onStep) rig.onStep(rig.stepFoot);
    }
  }
  g.period = 1 / cad;
  rig.gaitPhase = ph; rig.gaitPeriod = g.period;

  // ---- where each foot goes: stance (planted, sliding back past the hip at exactly the ground
  // speed) or swing (lifted and carried forward, quickest in the middle)
  const lift = (lerp(0.2, 0.5, r) * sty.lift * (0.5 + 0.5 * strideK) * (J ? 1.8 : 1) + Math.abs(slope) * 0.15) * Ls;
  for (let i = 0; i < 2; i++) {
    const L = g.legs[i];
    const p = i ? (ph + 0.5) % 1 : ph;
    let z, fy;
    if (p < duty) {
      z = zF - (p / duty) * travel;
      fy = 0;
    } else {
      const u = (p - duty) / (1 - duty);
      L.u = u;
      z = -zB + travel * u * u * (3 - 2 * u);
      fy = lift * Math.sin(Math.PI * Math.min(1, u * 1.1)) ** 0.9;
    }
    fy += slope * z; // the ground ahead is higher uphill
    // grown-up legs: keep the lowest point of the sole (heel at contact, toes at push-off) on
    // the ground, from the shin's pitch last frame
    L.z = z; L.fy = fy; L.stance = p < duty;
  }

  // ---- the body: down after each contact, up after passing (run: lowest mid-stance)
  const psi = (ph * 2) % 1; // step phase
  const bobW = (0.07 + 0.05 * strideK) * sty.bob * (J ? 0 : 1); // (knees: the pendulum below sets it)
  const bobR = 0.16 * sty.bob * (J ? 0.5 : 1);
  const dW = -bobW * (0.55 + 0.45 * Math.cos(TAU * (psi - 0.12))) - (J ? 0 : 0.03);
  const dR = -bobR * (0.5 + 0.5 * Math.cos(TAU * (psi - duty))) - (J ? 0.06 : 0.05);
  let dY = lerp(dW, dR, r) * Ls;
  if (J) {
    // the hips can't ride higher than the legs reach (the pendulum drop at contact)
    const reach = (g.thigh + g.shin) * 0.9985;
    for (let i = 0; i < 2; i++) {
      const L = g.legs[i];
      if (!L.stance) continue; // (a swinging leg just bends more)
      const sb = -clamp(L.z / Ls, -0.95, 0.95), zz = L.z - g.mid;
      const top = L.fy + Math.max(g.toe * sb, g.heel * sb) * 0.7 + Math.sqrt(Math.max(0, reach * reach - zz * zz)) - (g.hip0 + rig.s * 0.5);
      if (top < dY) dY = top;
    }
  }
  g.dY = dY;
  hip.position.y += dY * w;
  // weight over the standing foot: sway and roll (a sturdy waddle), less when running
  const swayC = Math.cos(TAU * (ph - duty * 0.5 - 0.03));
  const sway = -lerp(0.1, 0.035, r) * sty.sway * Ls * swayC * (0.6 + 0.4 * strideK);
  hip.position.x += sway * w;
  const roll = lerp(0.075, 0.035, r) * sty.sway * Math.cos(TAU * (ph - duty * 0.5 - 0.08));
  const bank = clamp(-Math.atan(vn * g.turn / G_LS) * 0.7, -0.3, 0.3);
  hip.rotation.z += (roll + bank) * w;
  neck.rotation.z -= (roll * 0.8 + bank * 0.35) * w;
  // shoulders twist against the hips, the head stays on target
  const twist = -lerp(0.1, 0.16, r) * sty.twist * strideK * Math.cos(TAU * (ph - 0.04));
  hip.rotation.y += twist * w;
  neck.rotation.y -= twist * 0.85 * w;
  neck.rotation.y += clamp(g.turn * 0.12, -0.35, 0.35) * w; // the head leads a turn
  // lean with speed, acceleration and the slope; the head counters it to look ahead
  const lean = (lerp(0.06, 0.2, r) + clamp(vn * 0.006, 0, 0.08)) * sty.lean + clamp(g.acc / Ls * 0.004, -0.08, 0.12) + slope * 0.35;
  hip.rotation.x += lean * w;
  neck.rotation.x -= lean * 0.7 * w;
  // a little nod that trails the body's down (follow-through), small: the gaze is stabilised
  neck.rotation.x += Math.cos(TAU * (psi - 0.24)) * lerp(0.03, 0.045, r) * w;

  // what carried things key off: a bounce a beat behind the body's down, a sway behind the hips
  g.bounce = Math.cos(TAU * (psi - lerp(0.3, 0.2, r))) * w * (0.5 + 0.5 * strideK);
  g.swayLag = Math.cos(TAU * (ph - duty * 0.5 - 0.2)) * w * (0.6 + 0.4 * strideK);

  // ---- legs
  const toeOut = sty.toeOut ?? 0.08;
  for (let i = 0; i < 2; i++) {
    const leg = i ? legR : legL;
    const side = i ? 1 : -1;
    const L = g.legs[i];
    const z = L.z, fy = L.fy;
    if (g.jointed) {
      // two-bone IK: thigh from the hip joint, shin + foot from the knee
      const knee = i ? rig.kneeR : rig.kneeL;
      const pivot = hip.position.y + s * 0.5;
      const T = g.thigh, S = g.shin;
      // the sole's lowest point (heel at contact, toes at push-off) on the ground: raise the ankle
      // by what a straight leg at this reach would tip the foot (not by the knee's own bend,
      // which would feed back on itself)
      const sb = -clamp(z / Ls, -0.95, 0.95);
      const tz = z - g.mid, ty = fy + Math.max(g.toe * sb, g.heel * sb) * 0.7 - pivot; // (ty negative: down)
      let d = Math.hypot(tz, ty);
      d = clamp(d, Math.abs(T - S) + 1e-3, (T + S) * 0.999);
      const thighA = Math.atan2(-tz, -ty) - Math.acos(clamp((T * T + d * d - S * S) / (2 * T * d), -1, 1));
      const kneeA = Math.PI - Math.acos(clamp((T * T + S * S - d * d) / (2 * T * S), -1, 1));
      leg.rotation.x = lerp(leg.rotation.x, thighA, w);
      knee.rotation.x = lerp(knee.rotation.x, kneeA, w);
      L.b = thighA + kneeA;
      leg.rotation.y = lerp(leg.rotation.y, side * toeOut, w);
    } else {
      // rigid stubby leg: pitch it toward the foot, then stretch it (or slide it up into the
      // trousers) so the lowest point of the sole - heel at contact, toes at push-off - sits on
      // the ground
      const pivot = g.legY0 + dY;
      const stance = L.stance;
      // solve the pitch and the length together (the sole's low point shifts with the pitch)
      let H = pivot - fy, a = Math.atan2(-z, H);
      for (let it = 0; it < 3; it++) { const sa = Math.sin(a); a = Math.atan2(-z, pivot - fy - Math.max(g.toe * sa, g.heel * sa)); }
      { const sa = Math.sin(a); H = pivot - fy - Math.max(g.toe * sa, g.heel * sa); }
      let sc = clamp(Math.hypot(z, H) / Ls, 0.88, scMax);
      if (!stance) {
        // swinging: keep the leg long (no kick-back) and lift by tucking it up into the trousers,
        // easing over from the planted solution just after toe-off and back to it before contact
        const u = L.u;
        const k = Math.min(u / 0.3, (1 - u) / 0.22, 1);
        sc = lerp(sc, 1, k * k * (3 - 2 * k));
      }
      // the foot exactly where it must be fore and aft (its middle planted, the sole rolling on it)
      a = -Math.asin(clamp((z - g.mid * Math.cos(a)) / (Ls * sc), -0.97, 0.97));
      a = -Math.asin(clamp((z - g.mid * Math.cos(a)) / (Ls * sc), -0.97, 0.97));
      const sa = Math.sin(a), ca = Math.cos(a);
      const m = Math.max(g.toe * sa, g.heel * sa);
      const dy = clamp(fy + m + Ls * sc * ca - pivot, -0.14 * Ls, 0.65 * Ls); // the rest: up into the trousers
      L.sc = sc; L.dy = dy;
      const dx = sway * 0.5;
      leg.position.y = lerp(g.legY0, pivot + dy, w);
      leg.position.x = side * g.legX0 + dx * w;
      leg.scale.y = lerp(1, sc, w);
      leg.rotation.x = lerp(leg.rotation.x, a, w);
      leg.rotation.y = lerp(leg.rotation.y, side * toeOut, w);
      leg.rotation.z = lerp(leg.rotation.z, -dx / Ls, w);
    }
  }

  // ---- arms swing against the legs, trailing a touch (they hang from the shoulders)
  if (!carry) {
    const aw = w * (rig.armGaitW ?? 1);
    const amp = lerp(0.42, 0.85 * sty.armRun, r) * sty.arm * (0.35 + 0.65 * strideK);
    const ca = Math.cos(TAU * (ph - 0.07));
    const fwd = -lerp(0.02, 0.25, r); // runners carry their arms forward
    armL.rotation.x = lerp(armL.rotation.x, fwd + amp * ca, aw);
    armR.rotation.x = lerp(armR.rotation.x, fwd - amp * ca, aw);
    const out = lerp(0.1, 0.2, r);
    armL.rotation.z = lerp(armL.rotation.z, out - roll * 0.6, aw);
    armR.rotation.z = lerp(armR.rotation.z, -out - roll * 0.6, aw);
    if (rig.elbowL) {
      const eB = lerp(-0.3, -1.35, r);
      rig.elbowL.rotation.x = lerp(rig.elbowL.rotation.x, eB - Math.max(0, -ca) * lerp(0.35, 0.3, r), aw);
      rig.elbowR.rotation.x = lerp(rig.elbowR.rotation.x, eB - Math.max(0, ca) * lerp(0.35, 0.3, r), aw);
    }
  }
}

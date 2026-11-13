// The title's opening shot (wave 9, ~8 s; any key or tap skips it at once). Close on the mole as
// he flees down the first chase route (bookends/titleChase.js run 0): the camera leads him, low,
// looking back into his face (wide eyes, panting, sweat flying off him, glancing over his
// shoulder at the screech behind); then it slows and steps aside as he dashes past and swings to
// the raptor bursting through the glowcaps after him, charging at the lens; as it thunders by the
// camera cranes up and sweeps back over the clearing, round the signpost's left, and settles into
// the menu's framing while the chase runs on. Everything here is a pure function of time (and
// the route), so the cave can be built for every camera the shot will use before it starts
// (TitleScene makeView), and a screenshot of any moment is repeatable.
//
//   INTRO                       timings and the run's script
//   introGap(t)                 how far behind the mole the raptor is (m along the route)
//   introShot(t, menu, live?, out?) → { pos, look, fov }   menu: the menu framing { pos, look, fov };
//                               live: { mole: head position, raptor: head position } (else scripted)
import * as THREE from 'three';
import { CHASE_PATHS, floorH, route } from './titleCave.js';
import { clamp } from '../core/util.js';

export const INTRO = {
  dur: 8.3, // the shot (s); the menu is in place at its end
  s0: 0.6, // the mole's start on route 0 (m) and his sprint (m/s)
  vm: 3.3,
  hold: 4.3, // the raptor keeps to the script until then; then it's the chase's own run (the lunge)
  lungeAt: 18.4,
  glances: [0.72, 1.92, 3.0],
  ui: 6.1, // the logo and the boards' words come up from here
  passS: 13.1, // where the camera stops to let him by (m along the route)
};
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

/** The raptor's lag behind the mole (m along the route): far back, then closing fast. */
export function introGap(t) {
  if (t < 2.4) return 4.4;
  if (t < INTRO.hold) return 4.4 - 2.5 * smooth((t - 2.4) / (INTRO.hold - 2.4));
  return 1.9;
}
export const introMoleS = (t) => INTRO.s0 + INTRO.vm * t;

let RT = null;
const rt = () => RT || (RT = route(CHASE_PATHS[0]));
const _p = {};
/** A point beside the route: s (m along it), lat (m to the runner's left; − = right), h (m over the floor). */
function onRoute(s, lat, h, out) {
  rt().at(s, _p);
  const x = _p.x - _p.tz * lat, z = _p.z + _p.tx * lat;
  return out.set(x, floorH(x, z) + h, z);
}

// the swoop back to the menu: from where the raptor passed, up over the clearing, round the left of
// the signpost (well clear of its boards) and back into the menu's place
const WAY = [new THREE.Vector3(0.5, 1.75, -5.4), new THREE.Vector3(-1.5, 2.65, -0.6), new THREE.Vector3(-0.9, 2.25, 2.9)];
const _m = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3(), _b = new THREE.Vector3();
let curveKey = '', curve = null;

/** The camera at time t of the opening (see the header). */
export function introShot(t, menu, live = null, out = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 }) {
  const sm = introMoleS(t);
  const moleHead = live?.mole ? _m.copy(live.mole) : onRoute(sm, 0, 0.64, _m);
  const rapHead = live?.raptor ? _r.copy(live.raptor) : onRoute(sm - introGap(Math.min(t, INTRO.hold + 0.4)), 0, 1.1, _r);
  const T1 = 2.4, T2 = INTRO.hold;
  if (t < T2 || !menu) {
    // A: leading him, low, his face in the frame; B: slowing, stepping aside, swinging to the raptor
    let sc, lat, h, w, fov;
    if (t < T1) { sc = sm + 1.7; lat = -0.42; h = 0.5; w = 0; fov = 40; }
    else {
      const u = clamp((t - T1) / (T2 - T1), 0, 1);
      sc = introMoleS(T1) + 1.7 + INTRO.vm * (T2 - T1) * (u - u * u / 2);
      lat = -0.42 - 1.0 * smooth(u * 1.6);
      h = 0.5 - 0.12 * smooth(u * 2);
      w = smooth((t - 2.55) / 0.75);
      fov = 40 + 7 * smooth(u * 1.5);
    }
    onRoute(sc, lat, h, out.pos);
    out.look.lerpVectors(moleHead, rapHead, w);
    out.fov = fov;
    return out;
  }
  // C: up and back to the menu
  const key = menu.pos.x.toFixed(3) + ',' + menu.pos.y.toFixed(3) + ',' + menu.pos.z.toFixed(3);
  if (key !== curveKey || !curve) {
    curveKey = key;
    const start = introShot(T2 - 1e-4, null).pos.clone();
    curve = new THREE.CatmullRomCurve3([start, ...WAY.map((v) => v.clone()), menu.pos.clone()], false, 'centripetal', 0.5);
  }
  const u = smooth((t - T2) / (INTRO.dur - T2));
  curve.getPointAt(u, out.pos);
  out.pos.y = Math.max(out.pos.y, floorH(out.pos.x, out.pos.z) + 0.3);
  // the gaze: on the raptor as it thunders by, then round to the menu's own
  _f.subVectors(menu.look, menu.pos).normalize();
  _d.subVectors(rapHead, out.pos).normalize();
  const k = smooth((u - 0.08) / 0.62);
  _b.copy(_d).lerp(_f, k).normalize();
  if (u >= 1) out.look.copy(menu.look);
  else out.look.copy(out.pos).add(_b);
  out.fov = 47 + (menu.fov - 47) * smooth(u * 1.3);
  return out;
}
